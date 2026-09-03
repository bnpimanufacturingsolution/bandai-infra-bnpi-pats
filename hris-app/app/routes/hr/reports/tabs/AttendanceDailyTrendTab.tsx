import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
	BarChart3,
	ChevronLeft,
	ChevronRight,
	Download,
	LineChart as LineChartIcon,
	Search,
	Table2,
} from "lucide-react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ChartCard } from "~/components/atoms/ChartCard";
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
import {
	useAttendanceDailyTrendByDepartment,
	useAttendanceMetricsDetailed,
} from "~/lib/hooks/useMetrics";
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
import { toast } from "sonner";

export type TrendChartMode = "line" | "stacked" | "table";

export type TrendMetricKey = "PRESENT" | "ABSENT" | "LATE" | "EARLY_OUT" | "SCHEDULED";

export const TREND_METRIC_CONFIG: Record<
	TrendMetricKey,
	{
		label: string;
		statusParam?: string;
		recordDescription: string;
		chartTitle: string;
		badgeColor: string;
	}
> = {
	PRESENT: {
		label: "Present (Clocked In)",
		statusParam: "PRESENT",
		recordDescription: "Employees who clocked in on their shift",
		chartTitle: "Daily Present (Clocked In) Trend by Department",
		badgeColor: "#0f766e",
	},
	ABSENT: {
		label: "Absent",
		statusParam: "ABSENT",
		recordDescription: "Employees absent without clock-in",
		chartTitle: "Daily Absent Trend by Department",
		badgeColor: "#e11d48",
	},
	LATE: {
		label: "Late (Tardiness)",
		statusParam: "LATE",
		recordDescription: "Employees with late arrival / tardiness",
		chartTitle: "Daily Tardiness Trend by Department",
		badgeColor: "#d97706",
	},
	EARLY_OUT: {
		label: "Undertime",
		statusParam: "EARLY_OUT",
		recordDescription: "Employees with undertime / early out",
		chartTitle: "Daily Undertime Trend by Department",
		badgeColor: "#ea580c",
	},
	SCHEDULED: {
		label: "All Scheduled",
		statusParam: undefined,
		recordDescription: "Total scheduled attendance obligations",
		chartTitle: "Daily Scheduled Trend by Department",
		badgeColor: "#334155",
	},
};

type TrendSeriesRow = {
	businessDate: string;
	label: string;
	total: number;
} & Record<string, string | number>;

const TREND_COLORS = [
	"#0f766e",
	"#F97316",
	"#EAB308",
	"#10B981",
	"#0EA5E9",
	"#6366F1",
	"#A855F7",
	"#DB2777",
];

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

function formatAxisLabel(value: string | Date | undefined | null) {
	const parsed = parseBusinessDate(value);
	if (!parsed) return "-";
	return format(parsed, "MMM d");
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

function buildTrendDepartmentKey(departmentId: string | null, departmentName: string) {
	return [
		String(departmentId || "").trim() || "unassigned",
		String(departmentName || "Unassigned").trim() || "Unassigned",
	].join("::");
}

function DailyTrendTooltip({ active, payload, label }: any) {
	if (!active || !payload?.length) return null;

	const visibleItems = payload.filter(
		(item: any) => item?.value !== undefined && Number(item.value) > 0,
	);
	const total = visibleItems.reduce((sum: number, item: any) => sum + Number(item.value || 0), 0);

	return (
		<div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-lg">
			<div className="text-xs font-semibold text-neutral-900">{String(label || "-")}</div>
			<div className="text-[11px] text-neutral-500">
				{formatCount(total)} matched records
			</div>
			<div className="mt-2 space-y-1">
				{visibleItems.map((item: any) => (
					<div key={String(item.dataKey || item.name)} className="flex items-center justify-between gap-4 text-xs">
						<span className="flex items-center gap-2 text-neutral-700">
							<span
								className="h-2 w-2 rounded-full"
								style={{ backgroundColor: item.color || "#0f766e" }}
							/>
							{String(item.name || item.dataKey)}
						</span>
						<span className="font-medium text-neutral-900">
							{formatCount(Number(item.value || 0))}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function AttendanceDailyTrendTab() {
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
	const initialMetric = (searchParams.get("trendMetric") || "PRESENT").toUpperCase() as TrendMetricKey;
	const [metricKey, setMetricKey] = useState<TrendMetricKey>(
		TREND_METRIC_CONFIG[initialMetric] ? initialMetric : "PRESENT",
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
	const [searchQuery, setSearchQuery] = useState("");
	const [chartMode, setChartMode] = useState<TrendChartMode>("line");
	const [tablePage, setTablePage] = useState(1);
	const [pageSize] = useState(50);
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);

	const activeMetricConfig = TREND_METRIC_CONFIG[metricKey] || TREND_METRIC_CONFIG.PRESENT;

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

	const managers = useMemo(() => {
		if (selectedDepartment === "all") return allEmployees;
		return allEmployees.filter((employee: any) => employee.department?.id === selectedDepartment);
	}, [allEmployees, selectedDepartment]);

	const { data: trendData, isLoading: isTrendLoading, error: trendError } = useAttendanceDailyTrendByDepartment(
		fromIso,
		toIso,
		undefined,
		activeMetricConfig.statusParam,
		selectedDepartment === "all" ? undefined : selectedDepartment,
		selectedManager === "all" ? undefined : selectedManager,
	);

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
		undefined,
		{ enabled: true },
	);

	const trend = trendData?.metrics?.attendanceDailyTrendByDepartment;
	const departmentSeries = useMemo(
		() =>
			(trend?.departments || []).map((department, index) => ({
				...department,
				key: buildTrendDepartmentKey(department.departmentId, department.departmentName),
				color: TREND_COLORS[index % TREND_COLORS.length],
			})),
		[trend?.departments],
	);

	const chartData = useMemo<TrendSeriesRow[]>(
		() =>
			(trend?.series || []).map((bucket) => {
				const row: TrendSeriesRow = {
					businessDate: bucket.businessDate,
					label: formatAxisLabel(bucket.businessDate),
					total: bucket.total,
				};

				bucket.departmentBreakdown.forEach((department) => {
					row[buildTrendDepartmentKey(department.departmentId, department.departmentName)] =
						department.total;
				});

				return row;
			}),
		[trend?.series],
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

	const peakDay = useMemo(() => {
		return chartData.reduce<TrendSeriesRow | null>((best, current) => {
			if (!best) return current;
			return Number(current.total || 0) > Number(best.total || 0) ? current : best;
		}, null);
	}, [chartData]);

	const averagePerDay = trend?.totalDays ? trend.totalRecords / trend.totalDays : 0;
	const dateRangeLabel =
		trend?.startDate && trend?.endDate
			? `${formatDayLabel(trend.startDate)} to ${formatDayLabel(trend.endDate)}`
			: `${fromIso || "-"} to ${toIso || "-"}`;

	const handleClearFilters = () => {
		setSelectedDepartment("all");
		setSelectedPosition("all");
		setSelectedManager("all");
		setSearchQuery("");
		setMetricKey("PRESENT");
		setTablePage(1);
		clearScopeFilters();
	};

	useEffect(() => {
		const nextSearchParams = new URLSearchParams(searchParams);

		if (metricKey !== "PRESENT") {
			nextSearchParams.set("trendMetric", metricKey);
		} else {
			nextSearchParams.delete("trendMetric");
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

		if (nextSearchParams.toString() !== searchParams.toString()) {
			setSearchParams(nextSearchParams, { replace: true });
		}
	}, [searchParams, metricKey, selectedDepartment, selectedPosition, selectedManager, setSearchParams]);

	const handleExport = async (formatType: ReportExportFormat) => {
		try {
			if (chartMode === "table") {
				// Fetch full unpaged records for export
				toast.loading("Preparing employee export data...", { id: "export-progress" });
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
					undefined,
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
						reportKey: "daily-trend-employee-records",
						title: `${activeMetricConfig.label} - Employee Records`,
						fileBaseName: buildReportFileName(
							`daily-trend-${metricKey.toLowerCase()}-records`,
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
							{ label: "Total Matched", value: formatCount(exportRows.length) },
						],
					},
				});
				toast.dismiss("export-progress");
			} else {
				const dynamicDeptColumns: ReportExportColumn<TrendSeriesRow>[] = departmentSeries.map(
					(dept) => ({
						header: dept.departmentName,
						accessor: (row) => row[dept.key] ?? 0,
						align: "right",
					}),
				);

				const columns: ReportExportColumn<TrendSeriesRow>[] = [
					{ header: "Date", accessor: (row) => formatDayLabel(row.businessDate) },
					{ header: "Total", accessor: (row) => row.total ?? 0, align: "right" },
					...dynamicDeptColumns,
				];

				await exportReport({
					format: formatType,
					config: {
						reportKey: "daily-trend-department-summary",
						title: activeMetricConfig.chartTitle,
						fileBaseName: buildReportFileName(
							`daily-trend-${metricKey.toLowerCase()}-by-department`,
							fromIso,
							"to",
							toIso,
						),
						orientation: "landscape",
						rows: chartData,
						columns,
						summaryRows: [
							{ label: "Total Records", value: formatCount(trend?.totalRecords || 0) },
							{ label: "Total Business Days", value: trend?.totalDays || 0 },
							{ label: "Average Per Day", value: averagePerDay.toFixed(1) },
							{
								label: "Peak Day",
								value: peakDay
									? `${formatDayLabel(peakDay.businessDate)} (${formatCount(Number(peakDay.total || 0))} records)`
									: "-",
							},
						],
						filtersSummary: [
							{ label: "Metric", value: activeMetricConfig.label },
							{ label: "Date Range", value: dateRangeLabel },
							{ label: "Department", value: selectedDepartment },
							{ label: "Manager", value: selectedManager },
						],
					},
				});
			}
			toast.success(`Exported report as ${formatType.toUpperCase()}`);
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
					<CardTitle>{activeMetricConfig.chartTitle}</CardTitle>
					<CardDescription>
						{activeMetricConfig.recordDescription} grouped by business day and department for the selected range
					</CardDescription>
				</div>
				<div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50/90 p-1">
					{(Object.keys(TREND_METRIC_CONFIG) as TrendMetricKey[]).map((key) => {
						const config = TREND_METRIC_CONFIG[key];
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
				{/* Top Filters Bar - Pure Filter Toolbar */}
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

					<div className="flex gap-1.5 shrink-0 items-end ml-auto">
						<Button
							variant="ghost"
							onClick={handleClearFilters}
							className="text-muted-foreground hover:text-foreground h-8 px-2.5 text-xs">
							Clear Filters
						</Button>
					</div>
				</div>

				{isTrendLoading ? (
					<div className="text-center py-8 text-gray-500">Loading metrics...</div>
				) : trendError ? (
					<div className="text-center py-8 text-red-500">
						Error loading metrics: {trendError.message}
					</div>
				) : (
					<>
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
							<Card className="py-3 px-4 border-l-4 border-l-blue-500">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">
										Total {activeMetricConfig.label}
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-neutral-900">
										{formatCount(trend?.totalRecords || 0)}
									</div>
									<p className="text-[11px] text-muted-foreground">
										{activeMetricConfig.recordDescription}
									</p>
								</CardContent>
							</Card>
							<Card className="py-3 px-4 border-l-4 border-l-emerald-500">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">Average / Day</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-emerald-700">
										{averagePerDay.toFixed(1)}
									</div>
									<p className="text-[11px] text-muted-foreground">
										{trend?.totalDays || 0} business days in scope
									</p>
								</CardContent>
							</Card>
							<Card className="py-3 px-4 border-l-4 border-l-purple-500">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">
										Departments
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-purple-700">
										{formatCount(departmentSeries.length)}
									</div>
									<p className="text-[11px] text-muted-foreground">Departments represented</p>
								</CardContent>
							</Card>
							<Card className="py-3 px-4 border-l-4 border-l-amber-500">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">Peak Day</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-amber-600">
										{peakDay ? formatAxisLabel(peakDay.businessDate) : "-"}
									</div>
									<p className="text-[11px] text-muted-foreground">
										{peakDay ? `${formatCount(Number(peakDay.total || 0))} records` : "No peak yet"}
									</p>
								</CardContent>
							</Card>
						</div>

						<ChartCard
							title={
								chartMode === "table"
									? `${activeMetricConfig.label} - Employee Records`
									: "Attendance Trend Chart"
							}
							description={
								chartMode === "table"
									? `Showing ${detailedRecords.length} of ${detailedTotalRecords} records for ${dateRangeLabel}`
									: `${dateRangeLabel} - ${trend?.departments.length || 0} department series`
							}
							height={chartMode === "table" ? "min-h-[480px]" : "h-[420px]"}
							headerActions={
								<div className="flex flex-wrap items-center gap-2">
									{chartMode === "table" ? (
										<div className="relative w-[180px]">
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
									) : null}
									<div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50/80 p-0.5 shadow-sm">
										<Button
											type="button"
											variant={chartMode === "line" ? "secondary" : "ghost"}
											size="sm"
											className={`h-7 px-2.5 text-xs ${chartMode === "line" ? "bg-white shadow-xs font-semibold" : ""}`}
											aria-pressed={chartMode === "line"}
											onClick={() => setChartMode("line")}>
											<LineChartIcon className="h-3.5 w-3.5 mr-1" />
											Line
										</Button>
										<Button
											type="button"
											variant={chartMode === "stacked" ? "secondary" : "ghost"}
											size="sm"
											className={`h-7 px-2.5 text-xs ${chartMode === "stacked" ? "bg-white shadow-xs font-semibold" : ""}`}
											aria-pressed={chartMode === "stacked"}
											onClick={() => setChartMode("stacked")}>
											<BarChart3 className="h-3.5 w-3.5 mr-1" />
											Stacked bars
										</Button>
										<Button
											type="button"
											variant={chartMode === "table" ? "secondary" : "ghost"}
											size="sm"
											className={`h-7 px-2.5 text-xs ${chartMode === "table" ? "bg-white shadow-xs font-semibold" : ""}`}
											aria-pressed={chartMode === "table"}
											onClick={() => setChartMode("table")}>
											<Table2 className="h-3.5 w-3.5 mr-1" />
											Table
										</Button>
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
							}>
							{chartMode === "table" ? (
								isDetailedLoading ? (
									<div className="flex h-64 items-center justify-center text-sm text-neutral-500">
										Loading employee records...
									</div>
								) : detailedRecords.length === 0 ? (
									<div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50 text-sm text-neutral-500">
										No employee records found for the selected filters
									</div>
								) : (
									<div className="flex flex-col justify-between h-full space-y-4">
										<div className="overflow-x-auto rounded-lg border border-neutral-200">
											<table className="w-full text-left text-xs">
												<thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 font-semibold">
													<tr>
														<th className="py-2.5 px-3">Employee</th>
														<th className="py-2.5 px-3">Department</th>
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
													{detailedRecords.map((row: any, idx: number) => (
														<tr key={row.id || `${row.employeeId}-${row.date}-${idx}`} className="hover:bg-neutral-50/80 transition-colors">
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
																				: row.status === "ABSENT" || row.status === "NOT_CLOCKED_IN"
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
																	<span className="text-amber-600 font-medium">{row.lateHours}</span>
																) : (
																	"-"
																)}
															</td>
															<td className="py-2 px-3 font-mono text-neutral-700 whitespace-nowrap">
																{row.undertimeHours && row.undertimeHours !== "0:00" ? (
																	<span className="text-orange-600 font-medium">{row.undertimeHours}</span>
																) : (
																	"-"
																)}
															</td>
															<td className="py-2 px-3 font-mono font-medium text-neutral-900 whitespace-nowrap">
																{row.hoursWorked || "-"}
															</td>
														</tr>
													))}
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
								)
							) : chartData.length === 0 ? (
								<div className="flex h-full items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50 text-sm text-neutral-500">
									No attendance trend data found for the selected filters
								</div>
							) : (
								<ResponsiveContainer width="100%" height="100%">
									{chartMode === "line" ? (
										<LineChart
											data={chartData}
											margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
											<CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
											<XAxis
												dataKey="label"
												tickMargin={12}
												minTickGap={24}
												interval="preserveStartEnd"
											/>
											<YAxis allowDecimals={false} />
											<Tooltip content={<DailyTrendTooltip />} />
											{departmentSeries.map((department) => (
												<Line
													key={department.key}
													type="monotone"
													dataKey={department.key}
													name={department.departmentName}
													stroke={department.color}
													strokeWidth={2.5}
													dot={false}
													activeDot={{ r: 4 }}
												/>
											))}
										</LineChart>
									) : (
										<BarChart
											data={chartData}
											margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
											<CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
											<XAxis
												dataKey="label"
												tickMargin={12}
												minTickGap={24}
												interval="preserveStartEnd"
											/>
											<YAxis allowDecimals={false} />
											<Tooltip content={<DailyTrendTooltip />} />
											{departmentSeries.map((department) => (
												<Bar
													key={department.key}
													dataKey={department.key}
													name={department.departmentName}
													stackId="attendance"
													fill={department.color}
												/>
											))}
										</BarChart>
									)}
								</ResponsiveContainer>
							)}
						</ChartCard>

						{chartMode !== "table" ? (
							<div className="rounded-lg border border-neutral-200 bg-white p-4">
								<div className="flex flex-wrap gap-3">
									{departmentSeries.map((department) => {
										const share = trend?.totalRecords
											? (department.total / trend.totalRecords) * 100
											: 0;

										return (
											<div
												key={department.key}
												className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2">
												<span
													className="h-2.5 w-2.5 rounded-full"
													style={{ backgroundColor: department.color }}
												/>
												<div>
													<div className="text-sm font-medium text-neutral-900">
														{department.departmentName}
													</div>
													<div className="text-xs text-neutral-500">
														{formatCount(department.total)} records -{" "}
														{share.toFixed(1)}%
													</div>
												</div>
											</div>
										);
									})}
								</div>
							</div>
						) : null}
					</>
				)}
			</CardContent>
			<ReportExportDialog
				title={`Export ${activeMetricConfig.label} Report`}
				description={`Choose how to export the current ${activeMetricConfig.label.toLowerCase()} data for ${dateRangeLabel}.`}
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={[
					{
						format: "pdf",
						label: "Export PDF",
						helperText: `Download the current ${chartMode === "table" ? "employee table" : "department trend"} report as a formatted PDF.`,
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
