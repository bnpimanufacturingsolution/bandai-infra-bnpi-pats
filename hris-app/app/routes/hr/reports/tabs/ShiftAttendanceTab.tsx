import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
	ChevronLeft,
	ChevronRight,
	Clock,
	Download,
	Moon,
	Search,
	Sun,
	Users,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Badge } from "~/components/atoms/Badge";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { usePositions } from "~/lib/hooks/usePositions";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useShiftTypes } from "~/lib/hooks/useSchedules";
import { useAttendanceMetricsDetailed } from "~/lib/hooks/useMetrics";
import metricsService from "~/services/metrics.service";
import { ReportScopeDateFilters } from "../components/ReportScopeDateFilters";
import { ReportExportDialog } from "../components/ReportExportDialog";
import { ReportEmployeeCell } from "../components/ReportEmployeeCell";
import { useReportScopeFilters } from "../useReportScopeFilters";
import {
	buildReportFileName,
	exportReport,
	type ReportExportColumn,
	type ReportExportFormat,
} from "~/lib/utils/report-export";
import {
	buildShiftGroupings,
	getRecordShiftInfo,
	type ShiftGroupSummary,
} from "~/lib/utils/attendance-shift";
import { toast } from "sonner";

export type TrendMetricKey = "PRESENT" | "ABSENT" | "LATE" | "EARLY_OUT" | "SCHEDULED";

const METRIC_CONFIG: Record<
	TrendMetricKey,
	{
		label: string;
		statusParam?: string;
		recordDescription: string;
		badgeColor: string;
	}
> = {
	PRESENT: {
		label: "Present (Clocked In)",
		statusParam: "PRESENT",
		recordDescription: "Employees who clocked in on their shift",
		badgeColor: "#0f766e",
	},
	ABSENT: {
		label: "Absent",
		statusParam: "ABSENT",
		recordDescription: "Employees absent without clock-in",
		badgeColor: "#e11d48",
	},
	LATE: {
		label: "Late (Tardiness)",
		statusParam: "LATE",
		recordDescription: "Employees with late arrival / tardiness",
		badgeColor: "#d97706",
	},
	EARLY_OUT: {
		label: "Undertime",
		statusParam: "EARLY_OUT",
		recordDescription: "Employees with undertime / early out",
		badgeColor: "#ea580c",
	},
	SCHEDULED: {
		label: "All Scheduled",
		statusParam: undefined,
		recordDescription: "Total scheduled attendance obligations",
		badgeColor: "#334155",
	},
};

function formatCount(value: number) {
	return new Intl.NumberFormat("en-PH", {
		maximumFractionDigits: 0,
	}).format(value);
}

function parseBusinessDate(value: string | Date | undefined | null) {
	if (!value) return null;

	if (value instanceof Date) {
		return new Date(
			value.getUTCFullYear(),
			value.getUTCMonth(),
			value.getUTCDate(),
		);
	}

	const datePart = String(value).split("T")[0];
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
	if (!match) return null;

	const [, year, month, day] = match;
	return new Date(Number(year), Number(month) - 1, Number(day));
}

function formatDayLabel(value: string | Date | undefined | null) {
	const parsed = parseBusinessDate(value);
	if (!parsed) return "-";
	return format(parsed, "MMM d, yyyy");
}

function formatTime(value?: string | null) {
	if (!value) return "-";
	try {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return String(value);
		return format(date, "h:mm a");
	} catch {
		return String(value);
	}
}

export function ShiftAttendanceTab() {
	const {
		searchParams,
		setSearchParams,
		scope,
		dateRange,
		fromIso,
		toIso,
		activeMonth,
		activeYear,
		yearOptions,
		setScope,
		setMonth,
		setYear,
		setDateRange,
		clearFilters: clearScopeFilters,
	} = useReportScopeFilters();

	const initialMetric = (searchParams.get("shiftMetric") || "PRESENT").toUpperCase() as TrendMetricKey;
	const [metricKey, setMetricKey] = useState<TrendMetricKey>(
		METRIC_CONFIG[initialMetric] ? initialMetric : "PRESENT",
	);
	const [selectedDepartment, setSelectedDepartment] = useState(
		() => searchParams.get("departmentId") || "all",
	);
	const [selectedPosition, setSelectedPosition] = useState(
		() => searchParams.get("positionId") || "all",
	);
	const [selectedManager, setSelectedManager] = useState(
		() => searchParams.get("reportToId") || "all",
	);
	const [selectedShiftFilter, setSelectedShiftFilter] = useState(
		() => searchParams.get("shiftType") || "all",
	);
	const [searchQuery, setSearchQuery] = useState("");
	const [tablePage, setTablePage] = useState(1);
	const [pageSize] = useState(50);
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);

	const activeMetricConfig = METRIC_CONFIG[metricKey] || METRIC_CONFIG.PRESENT;

	const { data: departmentsData } = useDepartments({ limit: 1000 });
	const departments = departmentsData?.departments || [];

	const { data: positionsData } = usePositions({ limit: 1000 });
	const positions = useMemo(() => {
		const list = (positionsData as any)?.positions || (positionsData as any)?.data || [];
		return Array.isArray(list) ? list : [];
	}, [positionsData]);

	const { data: employeesData } = useEmployees({ limit: 1000 });
	const allEmployees = useMemo(
		() =>
			Array.isArray((employeesData as any)?.data)
				? (employeesData as any).data
				: (employeesData as any)?.data?.employees ||
					(employeesData as any)?.employees ||
					[],
		[employeesData],
	);

	const { data: shiftTypesData } = useShiftTypes({ limit: 1000 });
	const shiftTypeList = useMemo(() => {
		const list = (shiftTypesData as any)?.shiftTypes || (shiftTypesData as any)?.data || [];
		return Array.isArray(list) ? list : [];
	}, [shiftTypesData]);

	const managers = useMemo(() => {
		if (selectedDepartment === "all") return allEmployees;
		return allEmployees.filter((employee: any) => employee.department?.id === selectedDepartment);
	}, [allEmployees, selectedDepartment]);

	const { data: detailedData, isLoading: isDetailedLoading } = useAttendanceMetricsDetailed(
		fromIso,
		toIso,
		pageSize,
		tablePage,
		searchQuery || undefined,
		activeMetricConfig.statusParam,
		selectedDepartment === "all" ? undefined : selectedDepartment,
		undefined,
		selectedPosition === "all" ? undefined : selectedPosition,
		undefined,
		selectedManager === "all" ? undefined : selectedManager,
		undefined,
		selectedShiftFilter === "all" ? undefined : selectedShiftFilter,
		{ enabled: true },
	);

	const detailedPayload = useMemo(() => {
		return (
			detailedData?.metrics?.attendanceObligationDetailed ||
			(detailedData as any)?.data?.metrics?.attendanceObligationDetailed ||
			(detailedData as any)?.data?.attendanceObligationDetailed ||
			detailedData ||
			null
		);
	}, [detailedData]);

	const detailedRecords = useMemo(() => {
		const rawRecords =
			detailedPayload?.records ||
			(detailedData as any)?.records ||
			[];
		return Array.isArray(rawRecords) ? rawRecords : [];
	}, [detailedPayload, detailedData]);

	const detailedTotalRecords =
		detailedPayload?.totalRecords ??
		(detailedData as any)?.totalRecords ??
		detailedRecords.length;

	const totalTablePages = Math.max(1, Math.ceil(detailedTotalRecords / pageSize));

	// Group and aggregate records by Shift
	const shiftGroupings = useMemo<ShiftGroupSummary[]>(() => {
		return buildShiftGroupings(shiftTypeList, detailedRecords);
	}, [shiftTypeList, detailedRecords]);

	// Currently active shift summary
	const activeShiftSummary = useMemo(() => {
		if (selectedShiftFilter === "all") return null;
		return (
			shiftGroupings.find(
				(g) =>
					g.fullLabel === selectedShiftFilter ||
					g.shiftCode === selectedShiftFilter ||
					g.shiftKey === selectedShiftFilter ||
					g.shiftName === selectedShiftFilter,
			) || null
		);
	}, [shiftGroupings, selectedShiftFilter]);

	// KPI computations across current records
	const totalPresentInScope = useMemo(() => {
		return detailedRecords.filter(
			(r: any) => String(r.status || "").toUpperCase() === "PRESENT" || r.timeIn,
		).length;
	}, [detailedRecords]);

	const totalLateInScope = useMemo(() => {
		return detailedRecords.filter(
			(r: any) =>
				String(r.status || "").toUpperCase() === "LATE" ||
				(r.lateHours && r.lateHours !== "0:00"),
		).length;
	}, [detailedRecords]);

	const totalUndertimeInScope = useMemo(() => {
		return detailedRecords.filter(
			(r: any) =>
				String(r.status || "").toUpperCase() === "EARLY_OUT" ||
				(r.undertimeHours && r.undertimeHours !== "0:00"),
		).length;
	}, [detailedRecords]);

	const dateRangeLabel =
		fromIso && toIso
			? `${formatDayLabel(fromIso)} to ${formatDayLabel(toIso)}`
			: "Selected Date Range";

	const handleClearFilters = () => {
		setSelectedDepartment("all");
		setSelectedPosition("all");
		setSelectedManager("all");
		setSelectedShiftFilter("all");
		setSearchQuery("");
		setMetricKey("PRESENT");
		setTablePage(1);
		clearScopeFilters();
	};

	useEffect(() => {
		const nextSearchParams = new URLSearchParams(searchParams);

		if (metricKey !== "PRESENT") {
			nextSearchParams.set("shiftMetric", metricKey);
		} else {
			nextSearchParams.delete("shiftMetric");
		}

		if (selectedDepartment !== "all") {
			nextSearchParams.set("departmentId", selectedDepartment);
		} else {
			nextSearchParams.delete("departmentId");
		}

		if (selectedPosition !== "all") {
			nextSearchParams.set("positionId", selectedPosition);
		} else {
			nextSearchParams.delete("positionId");
		}

		if (selectedManager !== "all") {
			nextSearchParams.set("reportToId", selectedManager);
		} else {
			nextSearchParams.delete("reportToId");
		}

		if (selectedShiftFilter !== "all") {
			nextSearchParams.set("shiftType", selectedShiftFilter);
		} else {
			nextSearchParams.delete("shiftType");
		}

		if (nextSearchParams.toString() !== searchParams.toString()) {
			setSearchParams(nextSearchParams, { replace: true });
		}
	}, [
		searchParams,
		metricKey,
		selectedDepartment,
		selectedPosition,
		selectedManager,
		selectedShiftFilter,
		setSearchParams,
	]);

	const handleExport = async (formatType: ReportExportFormat) => {
		try {
			toast.loading("Preparing shift attendance export...", { id: "export-progress" });
			const fullData = await metricsService.getAttendanceMetricsDetailed(
				fromIso,
				toIso,
				5000,
				1,
				searchQuery || undefined,
				activeMetricConfig.statusParam,
				selectedDepartment === "all" ? undefined : selectedDepartment,
				undefined,
				selectedPosition === "all" ? undefined : selectedPosition,
				undefined,
				selectedManager === "all" ? undefined : selectedManager,
				undefined,
				selectedShiftFilter === "all" ? undefined : selectedShiftFilter,
			);
			const fullPayload =
				fullData?.metrics?.attendanceObligationDetailed ||
				(fullData as any)?.data?.metrics?.attendanceObligationDetailed ||
				(fullData as any)?.data?.attendanceObligationDetailed ||
				fullData;
			const exportRows = Array.isArray(fullPayload?.records) ? fullPayload.records : detailedRecords;

			const columns: ReportExportColumn<any>[] = [
				{ header: "Employee ID", accessor: (row) => row.employeeId || "-" },
				{ header: "Employee Name", accessor: (row) => row.employeeName || "-" },
				{ header: "Department", accessor: (row) => row.departmentName || "Unassigned" },
				{ header: "Shift", accessor: (row) => getRecordShiftInfo(row).shiftName },
				{ header: "Shift Schedule", accessor: (row) => getRecordShiftInfo(row).windowLabel },
				{ header: "Date", accessor: (row) => formatDayLabel(row.date) },
				{ header: "Status", accessor: (row) => row.status || "-" },
				{ header: "Clock In", accessor: (row) => formatTime(row.timeIn) },
				{ header: "Clock Out", accessor: (row) => formatTime(row.timeOut) },
				{ header: "Late", accessor: (row) => row.lateHours || "0:00" },
				{ header: "Undertime", accessor: (row) => row.undertimeHours || "0:00" },
				{ header: "Hours Worked", accessor: (row) => row.hoursWorked || "0:00" },
			];

			await exportReport({
				format: formatType,
				config: {
					reportKey: "shift-attendance-records",
					title: `Shift Attendance Report - ${activeMetricConfig.label}`,
					fileBaseName: buildReportFileName(
						`shift-attendance-${metricKey.toLowerCase()}`,
						fromIso,
						"to",
						toIso,
					),
					orientation: "landscape",
					rows: exportRows,
					columns,
					filtersSummary: [
						{ label: "Metric", value: activeMetricConfig.label },
						{ label: "Date Range", value: dateRangeLabel },
						{ label: "Department", value: selectedDepartment },
						{ label: "Position", value: selectedPosition },
						{ label: "Manager", value: selectedManager },
						{ label: "Shift", value: selectedShiftFilter },
						{ label: "Total Matched", value: formatCount(exportRows.length) },
					],
				},
			});
			toast.dismiss("export-progress");
			toast.success(`Exported shift report as ${formatType.toUpperCase()}`);
		} catch (err: any) {
			toast.dismiss("export-progress");
			console.error("Export error:", err);
			toast.error(`Export failed: ${err.message || "Unknown error"}`);
		}
	};

	return (
		<Card>
			<CardHeader className="space-y-3">
				<div>
					<CardTitle>Shift Attendance & Schedule Roster</CardTitle>
					<CardDescription>
						{activeMetricConfig.recordDescription} grouped and filtered by shift window and actual clock-in/out
					</CardDescription>
				</div>
				<div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50/90 p-1">
					{(Object.keys(METRIC_CONFIG) as TrendMetricKey[]).map((key) => {
						const config = METRIC_CONFIG[key];
						const isActive = metricKey === key;
						return (
							<button
								key={key}
								type="button"
								onClick={() => {
									setMetricKey(key);
									setTablePage(1);
								}}
								className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
									isActive
										? "bg-white text-neutral-950 shadow-sm ring-1 ring-neutral-200"
										: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
								}`}>
								<span
									className="h-2 w-2 rounded-full"
									style={{ backgroundColor: config.badgeColor }}
								/>
								{config.label}
							</button>
						);
					})}
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Top Filters Bar - Single Line Toolbar */}
				<div className="flex items-end gap-2 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar flex-nowrap w-full">
					<ReportScopeDateFilters
						scope={scope}
						activeMonth={activeMonth}
						activeYear={activeYear}
						yearOptions={yearOptions}
						dateRange={dateRange}
						onScopeChange={setScope}
						onMonthChange={setMonth}
						onYearChange={setYear}
						onDateRangeChange={setDateRange}
					/>
					<div className="shrink-0 w-[140px]">
						<div className="mb-0.5 text-[11px] font-medium text-neutral-500">Department</div>
						<DepartmentSectionPicker
							variant="report"
							departments={departments}
							sections={[]}
							departmentId={selectedDepartment}
							onDepartmentChange={(value) => {
								setSelectedDepartment(value);
								setSelectedManager("all");
								setTablePage(1);
							}}
							onSectionChange={(value) => {
								setSelectedDepartment(value);
								setSelectedManager("all");
								setTablePage(1);
							}}
						/>
					</div>
					<div className="shrink-0 w-[130px]">
						<div className="mb-0.5 text-[11px] font-medium text-neutral-500">Position</div>
						<Select
							value={selectedPosition}
							onValueChange={(val) => {
								setSelectedPosition(val);
								setTablePage(1);
							}}>
							<SelectTrigger
								aria-label="Position filter"
								className="h-8 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Positions</SelectItem>
								{positions.map((pos: any) => (
									<SelectItem key={`pos-${pos.id}`} value={pos.id}>
										{pos.title || pos.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="shrink-0 w-[130px]">
						<div className="mb-0.5 text-[11px] font-medium text-neutral-500">Manager</div>
						<Select
							value={selectedManager}
							onValueChange={(val) => {
								setSelectedManager(val);
								setTablePage(1);
							}}>
							<SelectTrigger
								aria-label="Manager filter"
								className="h-8 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Managers</SelectItem>
								{managers.map((employee: any) => (
									<SelectItem key={`manager-${employee.id}`} value={employee.id}>
										{employee.person?.personalInfo?.firstName}{" "}
										{employee.person?.personalInfo?.lastName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="shrink-0 w-[180px]">
						<div className="mb-0.5 text-[11px] font-medium text-neutral-500">Shift Schedule</div>
						<Select
							value={selectedShiftFilter}
							onValueChange={(val) => {
								setSelectedShiftFilter(val);
								setTablePage(1);
							}}>
							<SelectTrigger
								aria-label="Shift filter"
								className="h-8 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm">
								<SelectValue placeholder="All Shifts" />
							</SelectTrigger>
							<SelectContent className="max-h-[300px]">
								<SelectItem value="all">All Shifts ({formatCount(detailedTotalRecords)})</SelectItem>
								{shiftGroupings.map((st) => (
									<SelectItem key={`shift-${st.shiftKey}`} value={st.fullLabel || st.shiftKey}>
										<div className="flex items-center gap-1.5">
											{st.isNightShift ? (
												<Moon className="h-3 w-3 text-indigo-600 shrink-0" />
											) : (
												<Sun className="h-3 w-3 text-amber-600 shrink-0" />
											)}
											<span>{st.shiftName}</span>
											{st.windowLabel && st.windowLabel !== "Standard Schedule" ? (
												<span className="text-neutral-400 text-[10px]">({st.windowLabel})</span>
											) : null}
											{st.total > 0 ? (
												<span className="ml-auto text-emerald-700 font-semibold text-[10px]">
													[{st.present} / {st.total}]
												</span>
											) : null}
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="flex gap-1.5 shrink-0 items-end ml-auto">
						<Button
							variant="ghost"
							onClick={handleClearFilters}
							className="text-muted-foreground hover:text-foreground h-8 px-2.5 text-xs">
							Clear Filters
						</Button>
					</div>
				</div>

				{/* 4 Clean Stat KPI Cards */}
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
					<Card className="py-3 px-4 border-l-4 border-l-teal-600">
						<CardHeader className="p-0 pb-1">
							<CardTitle className="text-xs font-medium text-muted-foreground">
								Total {activeMetricConfig.label}
							</CardTitle>
						</CardHeader>
						<CardContent className="p-0">
							<div className="text-xl font-bold text-neutral-900">
								{formatCount(detailedTotalRecords)}
							</div>
							<p className="text-[11px] text-muted-foreground">
								{selectedShiftFilter === "all" ? "Across all shifts" : selectedShiftFilter}
							</p>
						</CardContent>
					</Card>
					<Card className="py-3 px-4 border-l-4 border-l-emerald-500">
						<CardHeader className="p-0 pb-1">
							<CardTitle className="text-xs font-medium text-muted-foreground">Present (Clocked In)</CardTitle>
						</CardHeader>
						<CardContent className="p-0">
							<div className="text-xl font-bold text-emerald-700">
								{formatCount(totalPresentInScope)}
							</div>
							<p className="text-[11px] text-muted-foreground">
								{detailedRecords.length > 0
									? `${Math.round((totalPresentInScope / detailedRecords.length) * 100)}% attendance rate`
									: "0%"}
							</p>
						</CardContent>
					</Card>
					<Card className="py-3 px-4 border-l-4 border-l-amber-500">
						<CardHeader className="p-0 pb-1">
							<CardTitle className="text-xs font-medium text-muted-foreground">Late (Tardiness)</CardTitle>
						</CardHeader>
						<CardContent className="p-0">
							<div className="text-xl font-bold text-amber-600">
								{formatCount(totalLateInScope)}
							</div>
							<p className="text-[11px] text-muted-foreground">Recorded late arrivals</p>
						</CardContent>
					</Card>
					<Card className="py-3 px-4 border-l-4 border-l-orange-500">
						<CardHeader className="p-0 pb-1">
							<CardTitle className="text-xs font-medium text-muted-foreground">Undertime</CardTitle>
						</CardHeader>
						<CardContent className="p-0">
							<div className="text-xl font-bold text-orange-600">
								{formatCount(totalUndertimeInScope)}
							</div>
							<p className="text-[11px] text-muted-foreground">Recorded early departures</p>
						</CardContent>
					</Card>
				</div>

				{/* Featured Active Shift Banner (Only shown if a shift is picked, so no card clutter) */}
				{activeShiftSummary ? (
					<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/40 p-3.5 shadow-xs">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-xs">
								{activeShiftSummary.isNightShift ? (
									<Moon className="h-5 w-5" />
								) : (
									<Sun className="h-5 w-5" />
								)}
							</div>
							<div>
								<div className="flex items-center gap-2">
									<span className="text-sm font-bold text-neutral-900">
										{activeShiftSummary.shiftName}
									</span>
									<Badge
										variant={activeShiftSummary.isNightShift ? "neutral-soft" : "warning-soft"}
										className="text-[10px] px-1.5 py-0.5">
										{activeShiftSummary.isNightShift ? "Night Shift" : "Day Shift"}
									</Badge>
								</div>
								<div className="text-xs text-neutral-600 font-medium">
									Scheduled Window: {activeShiftSummary.windowLabel}
								</div>
							</div>
						</div>

						<div className="flex items-center gap-4 text-xs">
							<div className="text-right">
								<span className="text-neutral-500 text-[11px]">Present: </span>
								<span className="font-bold text-neutral-900">
									{activeShiftSummary.present} / {activeShiftSummary.total}
								</span>
								<span className="text-emerald-700 font-semibold ml-1.5">
									({activeShiftSummary.total > 0
										? Math.round((activeShiftSummary.present / activeShiftSummary.total) * 100)
										: 0}%)
								</span>
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setSelectedShiftFilter("all")}
								className="h-7 px-2.5 text-xs bg-white">
								Show All Shifts
							</Button>
						</div>
					</div>
				) : null}

				{/* Employee Shift Attendance Table */}
				<div className="space-y-4">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="text-xs font-semibold text-neutral-800">
							{selectedShiftFilter === "all"
								? `All Shift Attendance Records (${formatCount(detailedTotalRecords)} total)`
								: `${selectedShiftFilter} Attendance Records (${formatCount(detailedTotalRecords)} total)`}
						</div>

						<div className="flex items-center gap-2">
							<div className="relative w-[200px]">
								<Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-neutral-400" />
								<Input
									placeholder="Search employee..."
									value={searchQuery}
									onChange={(e) => {
										setSearchQuery(e.target.value);
										setTablePage(1);
									}}
									className="h-8 pl-8 text-xs bg-white shadow-sm"
								/>
							</div>

							<Button
								variant="outline"
								size="sm"
								onClick={() => setIsExportModalOpen(true)}
								className="h-8 px-3 gap-1.5 text-xs font-medium bg-white hover:bg-neutral-50 shadow-sm">
								<Download className="h-3.5 w-3.5" />
								Export Report
							</Button>
						</div>
					</div>

					{isDetailedLoading ? (
						<div className="flex h-64 items-center justify-center text-sm text-neutral-500">
							Loading shift attendance records...
						</div>
					) : detailedRecords.length === 0 ? (
						<div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50 text-sm text-neutral-500">
							No attendance records found for the selected shift and filters
						</div>
					) : (
						<div className="flex flex-col justify-between h-full space-y-4">
							<div className="overflow-x-auto rounded-lg border border-neutral-200">
								<table className="w-full text-left text-xs">
									<thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 font-semibold">
										<tr>
											<th className="py-2.5 px-3">Employee</th>
											<th className="py-2.5 px-3">Department</th>
											<th className="py-2.5 px-3">Assigned Shift</th>
											<th className="py-2.5 px-3">Date</th>
											<th className="py-2.5 px-3">Status</th>
											<th className="py-2.5 px-3">Clock In</th>
											<th className="py-2.5 px-3">Clock Out</th>
											<th className="py-2.5 px-3">Late</th>
											<th className="py-2.5 px-3">Undertime</th>
											<th className="py-2.5 px-3">Hours</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-neutral-100 bg-white">
										{detailedRecords.map((row: any, idx: number) => {
											const shiftInfo = getRecordShiftInfo(row);
											return (
												<tr
													key={row.id || `${row.employeeId}-${row.date}-${idx}`}
													className="hover:bg-neutral-50/80 transition-colors">
													<td className="py-2 px-3">
														<ReportEmployeeCell
															rosterEmployees={allEmployees}
															employeeId={row.employeeRefId || row.employeeId}
															employeeCode={row.employeeId}
															fullName={row.employeeName}
														/>
													</td>
													<td className="py-2 px-3 text-neutral-700 font-medium">
														{row.departmentName || "Unassigned"}
													</td>
													<td className="py-2 px-3">
														<div className="flex flex-col">
															<span className="font-medium text-neutral-900 flex items-center gap-1">
																{shiftInfo.isNightShift ? (
																	<Moon className="h-3 w-3 text-indigo-600" />
																) : (
																	<Sun className="h-3 w-3 text-amber-600" />
																)}
																{shiftInfo.shiftName}
															</span>
															<span className="text-[11px] text-neutral-500">
																{shiftInfo.windowLabel}
															</span>
														</div>
													</td>
													<td className="py-2 px-3 text-neutral-600 whitespace-nowrap">
														{formatDayLabel(row.date)}
													</td>
													<td className="py-2 px-3">
														<Badge
															variant={
																row.status === "PRESENT"
																	? "success-soft"
																	: row.status === "LATE"
																		? "warning-soft"
																		: row.status === "ABSENT" ||
																				row.status === "NOT_CLOCKED_IN"
																			? "destructive-soft"
																			: "neutral-soft"
															}
															className="text-[11px] px-2 py-0.5">
															{row.status || "-"}
														</Badge>
													</td>
													<td className="py-2 px-3 font-mono text-neutral-700 whitespace-nowrap">
														{formatTime(row.timeIn)}
													</td>
													<td className="py-2 px-3 font-mono text-neutral-700 whitespace-nowrap">
														{formatTime(row.timeOut)}
													</td>
													<td className="py-2 px-3 font-mono text-neutral-700 whitespace-nowrap">
														{row.lateHours && row.lateHours !== "0:00" ? (
															<span className="text-amber-600 font-medium">
																{row.lateHours}
															</span>
														) : (
															"-"
														)}
													</td>
													<td className="py-2 px-3 font-mono text-neutral-700 whitespace-nowrap">
														{row.undertimeHours && row.undertimeHours !== "0:00" ? (
															<span className="text-orange-600 font-medium">
																{row.undertimeHours}
															</span>
														) : (
															"-"
														)}
													</td>
													<td className="py-2 px-3 font-mono font-medium text-neutral-900 whitespace-nowrap">
														{row.hoursWorked || "-"}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>

							<div className="flex items-center justify-between border-t border-neutral-100 pt-3 text-xs text-neutral-500">
								<div>
									Showing {(tablePage - 1) * pageSize + 1} to{" "}
									{Math.min(tablePage * pageSize, detailedTotalRecords)} of{" "}
									{detailedTotalRecords} results
								</div>
								<div className="flex items-center gap-1.5">
									<Button
										variant="outline"
										size="sm"
										disabled={tablePage <= 1}
										onClick={() => setTablePage((p) => Math.max(1, p - 1))}
										className="h-8 px-2.5 text-xs">
										<ChevronLeft className="h-4 w-4 mr-1" />
										Previous
									</Button>
									<span className="px-2 font-medium text-neutral-700">
										Page {tablePage} of {totalTablePages}
									</span>
									<Button
										variant="outline"
										size="sm"
										disabled={tablePage >= totalTablePages}
										onClick={() => setTablePage((p) => Math.min(totalTablePages, p + 1))}
										className="h-8 px-2.5 text-xs">
										Next
										<ChevronRight className="h-4 w-4 ml-1" />
									</Button>
								</div>
							</div>
						</div>
					)}
				</div>
			</CardContent>
			<ReportExportDialog
				title={`Export Shift Attendance Report`}
				description={`Choose how to export the shift attendance records for ${dateRangeLabel}.`}
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={[
					{
						format: "pdf",
						label: "Export PDF",
						helperText: `Download the current shift attendance roster as a formatted PDF.`,
					},
					{
						format: "xlsx",
						label: "Export Excel (XLSX)",
						helperText: `Download full report data as a spreadsheet file.`,
					},
					{
						format: "csv",
						label: "Export CSV",
						helperText: `Download filtered rows as a CSV data file.`,
					},
				]}
				onExport={handleExport}
			/>
		</Card>
	);
}
