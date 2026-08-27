import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Download, Eye, Calendar, Clock, AlertTriangle, Search, Filter } from "lucide-react";
import { Badge } from "~/components/atoms/Badge";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import { useTardinessMetrics, useAttendanceMetricsDetailed } from "~/lib/hooks/useMetrics";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { usePositions } from "~/lib/hooks/usePositions";
import {
	buildReportFileName,
	exportRowsToCsv,
	exportRowsToPdf,
	type ReportExportColumn,
} from "~/lib/utils/report-export";
import { ReportExportDialog } from "../components/ReportExportDialog";
import { ReportEmployeeCell } from "../components/ReportEmployeeCell";
import { ReportScopeDateFilters } from "../components/ReportScopeDateFilters";
import { useReportScopeFilters } from "../useReportScopeFilters";
import { toast } from "sonner";

export type TardinessViewTab = "tardiness" | "undertime";

interface TardinessEmployeeRow {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	tardinessCount: number;
	totalLateMinutes: number;
	avgLateMinutes: number;
	maxLateMinutes: number;
	undertimeCount: number;
	totalUndertimeMinutes: number;
	earlyOutCount: number;
	totalEarlyOutMinutes: number;
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
	return format(parsed, "EEE, MMM d, yyyy");
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

function formatDuration(minutes: number) {
	if (!minutes || minutes <= 0) return "0m";
	const hrs = Math.floor(minutes / 60);
	const mins = Math.round(minutes % 60);
	if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
	if (hrs > 0) return `${hrs}h`;
	return `${mins}m`;
}

/**
 * Tardiness & Undertime Tab Component
 * Displays tardiness details, undertime hours, and day-by-day employee breakdown
 */
export function TardinessUndetimeTab() {
	const {
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

	const [activeTab, setActiveTab] = useState<TardinessViewTab>("tardiness");
	const [selectedDepartment, setSelectedDepartment] = useState("all");
	const [selectedPosition, setSelectedPosition] = useState("all");
	const [selectedManager, setSelectedManager] = useState("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);
	const [selectedViewingEmployee, setSelectedViewingEmployee] =
		useState<TardinessEmployeeRow | null>(null);
	const [modalOnlyViolations, setModalOnlyViolations] = useState(false);

	// Fetch filters data
	const { data: departmentsData } = useDepartments({ limit: 1000 });
	const departments = departmentsData?.departments || [];

	const { data: positionsData } = usePositions({ limit: 1000 });
	const positions = useMemo(() => {
		const raw = (positionsData as any)?.data || (positionsData as any)?.positions || [];
		return Array.isArray(raw) ? raw : [];
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
		return allEmployees.filter((emp: any) => emp.department?.id === selectedDepartment);
	}, [allEmployees, selectedDepartment]);

	// Fetch Tardiness Metrics
	const { data, isLoading, error } = useTardinessMetrics(
		fromIso,
		toIso,
		selectedDepartment === "all" ? undefined : selectedDepartment,
	);

	const metrics = data?.metrics?.tardinessMetrics;
	const rawEmployees = (metrics?.employees || []) as TardinessEmployeeRow[];

	// Detailed month attendance for the viewed employee
	const { data: employeeMonthlyData, isLoading: isEmployeeMonthlyLoading } =
		useAttendanceMetricsDetailed(
			fromIso,
			toIso,
			100,
			1,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			selectedViewingEmployee?.employeeId,
			undefined,
			{ enabled: Boolean(selectedViewingEmployee) },
		);

	const employeeMonthlyRecords = useMemo(() => {
		const raw =
			employeeMonthlyData?.metrics?.attendanceObligationDetailed?.records ||
			(employeeMonthlyData as any)?.data?.metrics?.attendanceObligationDetailed?.records ||
			employeeMonthlyData?.records ||
			[];
		if (!Array.isArray(raw)) return [];

		// Group records by calendar date so each day appears exactly once
		const map = new Map<string, any[]>();
		for (const rec of raw) {
			const dateKey = String(rec.date || "").split("T")[0];
			if (!dateKey) continue;
			const list = map.get(dateKey) || [];
			list.push(rec);
			map.set(dateKey, list);
		}

		const consolidated: any[] = [];
		for (const [dateKey, dayRecords] of map.entries()) {
			if (dayRecords.length === 1) {
				consolidated.push(dayRecords[0]);
				continue;
			}

			// Consolidate multiple punches into 1 clean daily row
			let earliestTimeIn: Date | null = null;
			let latestTimeOut: Date | null = null;
			let maxLateMinutes = 0;
			let maxUndertimeMinutes = 0;
			let lateHoursStr = "0:00";
			let undertimeHoursStr = "0:00";
			let primaryStatus = dayRecords[0].status || "SCHEDULED";
			let scheduleSnapshot = dayRecords[0].scheduleSnapshot;

			for (const r of dayRecords) {
				if (r.timeIn) {
					const d = new Date(r.timeIn);
					if (!Number.isNaN(d.getTime())) {
						if (!earliestTimeIn || d.getTime() < earliestTimeIn.getTime()) {
							earliestTimeIn = d;
						}
					}
				}
				if (r.timeOut) {
					const d = new Date(r.timeOut);
					if (!Number.isNaN(d.getTime())) {
						if (!latestTimeOut || d.getTime() > latestTimeOut.getTime()) {
							latestTimeOut = d;
						}
					}
				}

				const lm = Number(r.lateMinutes || 0);
				if (lm > maxLateMinutes) {
					maxLateMinutes = lm;
					if (r.lateHours && r.lateHours !== "0:00") lateHoursStr = r.lateHours;
				}

				const um = Number(r.undertimeMinutes || 0) + Number(r.earlyOutMinutes || 0);
				if (um > maxUndertimeMinutes) {
					maxUndertimeMinutes = um;
					if (r.undertimeHours && r.undertimeHours !== "0:00") undertimeHoursStr = r.undertimeHours;
				}

				if (r.scheduleSnapshot && !scheduleSnapshot) {
					scheduleSnapshot = r.scheduleSnapshot;
				}

				if (
					r.status === "PRESENT" ||
					r.status === "LATE" ||
					r.status === "UNDERTIME" ||
					r.status === "HOLIDAY" ||
					r.status === "REST_DAY"
				) {
					primaryStatus = r.status;
				}
			}

			let hoursWorked = "0:00";
			if (earliestTimeIn && latestTimeOut && latestTimeOut.getTime() > earliestTimeIn.getTime()) {
				const diffMins = Math.round((latestTimeOut.getTime() - earliestTimeIn.getTime()) / 60000);
				const h = Math.floor(diffMins / 60);
				const m = diffMins % 60;
				hoursWorked = `${h}:${String(m).padStart(2, "0")}`;
			} else {
				hoursWorked =
					dayRecords.find((r) => r.hoursWorked && r.hoursWorked !== "0:00")?.hoursWorked || "0:00";
			}

			consolidated.push({
				...dayRecords[0],
				date: dateKey,
				timeIn: earliestTimeIn ? earliestTimeIn.toISOString() : null,
				timeOut: latestTimeOut ? latestTimeOut.toISOString() : null,
				status: primaryStatus,
				lateMinutes: maxLateMinutes,
				lateHours:
					lateHoursStr !== "0:00"
						? lateHoursStr
						: maxLateMinutes > 0
							? `${maxLateMinutes}m`
							: "0:00",
				undertimeMinutes: maxUndertimeMinutes,
				undertimeHours:
					undertimeHoursStr !== "0:00"
						? undertimeHoursStr
						: maxUndertimeMinutes > 0
							? `${maxUndertimeMinutes}m`
							: "0:00",
				hoursWorked,
				scheduleSnapshot,
			});
		}

		return consolidated.sort((a, b) => String(b.date).localeCompare(String(a.date)));
	}, [employeeMonthlyData]);

	const filteredModalRecords = useMemo(() => {
		if (!modalOnlyViolations) return employeeMonthlyRecords;
		return employeeMonthlyRecords.filter((rec: any) => {
			const lateMin = Number(rec.lateMinutes || 0);
			const undertimeMin = Number(rec.undertimeMinutes || 0) + Number(rec.earlyOutMinutes || 0);
			const hasLateHours = rec.lateHours && rec.lateHours !== "0:00" && rec.lateHours !== "";
			const hasUndertimeHours =
				rec.undertimeHours && rec.undertimeHours !== "0:00" && rec.undertimeHours !== "";
			return (
				lateMin > 0 ||
				undertimeMin > 0 ||
				hasLateHours ||
				hasUndertimeHours ||
				rec.status === "LATE" ||
				rec.status === "UNDERTIME"
			);
		});
	}, [employeeMonthlyRecords, modalOnlyViolations]);

	const getManagerName = (employee: any) => {
		const firstName = employee?.reportTo?.person?.personalInfo?.firstName || "";
		const lastName = employee?.reportTo?.person?.personalInfo?.lastName || "";
		const fullName = `${firstName} ${lastName}`.trim();
		return fullName || "N/A";
	};

	const getPositionName = (employee: any) => {
		return employee?.position?.name || employee?.positionName || "N/A";
	};

	const findSourceEmployee = (employeeRow: { id: string; employeeId: string; name: string }) =>
		allEmployees.find(
			(employee: any) =>
				employee.id === employeeRow.id ||
				employee.employeeId === employeeRow.employeeId ||
				`${employee.person?.personalInfo?.firstName || ""} ${employee.person?.personalInfo?.lastName || ""}`
					.trim()
					.toLowerCase() === employeeRow.name.toLowerCase(),
		);

	// Filter and sort employee list based on tab, manager, position, and search
	const filteredEmployees = useMemo(() => {
		let list = rawEmployees;

		// Filter by tab type
		if (activeTab === "tardiness") {
			list = list.filter((emp) => emp.tardinessCount > 0);
		} else {
			list = list.filter((emp) => emp.undertimeCount > 0 || emp.earlyOutCount > 0);
		}

		// Filter by manager
		if (selectedManager !== "all") {
			list = list.filter((metricEmployee) => {
				const src = findSourceEmployee(metricEmployee);
				return src?.reportTo?.id === selectedManager;
			});
		}

		// Filter by position
		if (selectedPosition !== "all") {
			list = list.filter((metricEmployee) => {
				const src = findSourceEmployee(metricEmployee);
				return src?.positionId === selectedPosition || src?.position?.id === selectedPosition;
			});
		}

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.trim().toLowerCase();
			list = list.filter(
				(emp) =>
					emp.name.toLowerCase().includes(query) ||
					emp.employeeId.toLowerCase().includes(query) ||
					emp.department.toLowerCase().includes(query),
			);
		}

		// Sort
		return [...list].sort((a, b) => {
			if (activeTab === "tardiness") {
				return b.totalLateMinutes - a.totalLateMinutes;
			}
			const totalA = a.totalUndertimeMinutes + a.totalEarlyOutMinutes;
			const totalB = b.totalUndertimeMinutes + b.totalEarlyOutMinutes;
			return totalB - totalA;
		});
	}, [rawEmployees, activeTab, selectedManager, selectedPosition, searchQuery, allEmployees]);

	const handleClearFilters = () => {
		setSelectedDepartment("all");
		setSelectedPosition("all");
		setSelectedManager("all");
		setSearchQuery("");
		clearScopeFilters();
	};

	const exportCsv = () => {
		const isTardiness = activeTab === "tardiness";
		const columns: ReportExportColumn<TardinessEmployeeRow>[] = isTardiness
			? [
					{ header: "Employee ID", accessor: "employeeId" },
					{ header: "Employee Name", accessor: "name" },
					{ header: "Department", accessor: "department" },
					{
						header: "Position",
						accessor: (emp) => getPositionName(findSourceEmployee(emp)),
					},
					{
						header: "Manager",
						accessor: (emp) => getManagerName(findSourceEmployee(emp)),
					},
					{ header: "Tardiness Count", accessor: (emp) => emp.tardinessCount },
					{ header: "Total Late Minutes", accessor: (emp) => emp.totalLateMinutes },
					{ header: "Average Late Minutes", accessor: (emp) => emp.avgLateMinutes },
					{ header: "Max Late Minutes", accessor: (emp) => emp.maxLateMinutes },
				]
			: [
					{ header: "Employee ID", accessor: "employeeId" },
					{ header: "Employee Name", accessor: "name" },
					{ header: "Department", accessor: "department" },
					{
						header: "Position",
						accessor: (emp) => getPositionName(findSourceEmployee(emp)),
					},
					{
						header: "Manager",
						accessor: (emp) => getManagerName(findSourceEmployee(emp)),
					},
					{
						header: "Undertime Count",
						accessor: (emp) => emp.undertimeCount + emp.earlyOutCount,
					},
					{
						header: "Total Undertime Minutes",
						accessor: (emp) => emp.totalUndertimeMinutes + emp.totalEarlyOutMinutes,
					},
				];

		exportRowsToCsv({
			columns,
			rows: filteredEmployees,
			fileBaseName: buildReportFileName(
				`attendance-${activeTab}`,
				fromIso,
				"to",
				toIso,
				selectedDepartment !== "all" ? "department" : undefined,
				selectedDepartment !== "all" ? selectedDepartment : undefined,
			),
		});
	};

	const exportPdf = async () => {
		const isTardiness = activeTab === "tardiness";
		const columns: ReportExportColumn<TardinessEmployeeRow>[] = isTardiness
			? [
					{ header: "Employee ID", accessor: "employeeId" },
					{ header: "Name", accessor: "name" },
					{ header: "Department", accessor: "department" },
					{
						header: "Manager",
						accessor: (emp) => getManagerName(findSourceEmployee(emp)),
					},
					{ header: "Late Count", accessor: (emp) => emp.tardinessCount },
					{ header: "Total Late (min)", accessor: (emp) => emp.totalLateMinutes },
					{ header: "Avg (min)", accessor: (emp) => emp.avgLateMinutes },
					{ header: "Max (min)", accessor: (emp) => emp.maxLateMinutes },
				]
			: [
					{ header: "Employee ID", accessor: "employeeId" },
					{ header: "Name", accessor: "name" },
					{ header: "Department", accessor: "department" },
					{
						header: "Manager",
						accessor: (emp) => getManagerName(findSourceEmployee(emp)),
					},
					{
						header: "Undertime Count",
						accessor: (emp) => emp.undertimeCount + emp.earlyOutCount,
					},
					{
						header: "Total Undertime (min)",
						accessor: (emp) => emp.totalUndertimeMinutes + emp.totalEarlyOutMinutes,
					},
				];

		await exportRowsToPdf({
			columns,
			rows: filteredEmployees,
			fileBaseName: buildReportFileName(
				`attendance-${activeTab}`,
				fromIso,
				"to",
				toIso,
				selectedDepartment !== "all" ? "department" : undefined,
				selectedDepartment !== "all" ? selectedDepartment : undefined,
			),
			reportTitle: `${isTardiness ? "Tardiness" : "Undertime"} Report`,
			metadataLines: [
				`Period: ${fromIso || "-"} to ${toIso || "-"}`,
				`Department: ${selectedDepartment !== "all" ? selectedDepartment : "All Departments"}`,
			],
		});
	};

	const openExportModal = () => {
		if (!filteredEmployees.length) {
			toast.error(`No ${activeTab} rows available to export.`);
			return;
		}
		setIsExportModalOpen(true);
	};

	const handleExport = async (format: "pdf" | "csv") => {
		if (format === "csv") {
			exportCsv();
		} else {
			await exportPdf();
		}
		setIsExportModalOpen(false);
	};

	const exportEmployeeBreakdown = async (formatType: "csv" | "pdf") => {
		if (!selectedViewingEmployee || filteredModalRecords.length === 0) return;

		const columns: ReportExportColumn<any>[] = [
			{ header: "Date", accessor: (row) => formatDayLabel(row.date) },
			{
				header: "Schedule",
				accessor: (row) =>
					row.scheduleSnapshot?.shiftTypeName || row.scheduleSnapshot?.name || "Regular",
			},
			{ header: "Status", accessor: (row) => row.status || "-" },
			{ header: "Clock In", accessor: (row) => formatTime(row.timeIn) },
			{ header: "Clock Out", accessor: (row) => formatTime(row.timeOut) },
			{ header: "Late", accessor: (row) => row.lateHours || "0:00" },
			{ header: "Undertime", accessor: (row) => row.undertimeHours || "0:00" },
			{ header: "Hours Worked", accessor: (row) => row.hoursWorked || "0:00" },
		];

		const fileBase = buildReportFileName(
			`tardiness-${selectedViewingEmployee.employeeId}-${selectedViewingEmployee.name.replace(/\s+/g, "_")}`,
			fromIso,
			"to",
			toIso,
		);

		if (formatType === "csv") {
			exportRowsToCsv({
				columns,
				rows: filteredModalRecords,
				fileBaseName: fileBase,
			});
		} else {
			await exportRowsToPdf({
				columns,
				rows: filteredModalRecords,
				fileBaseName: fileBase,
				reportTitle: `Tardiness & Undertime Breakdown - ${selectedViewingEmployee.name} (${selectedViewingEmployee.employeeId})`,
				metadataLines: [
					`Department: ${selectedViewingEmployee.department}`,
					`Period: ${fromIso} to ${toIso}`,
					`Tardiness: ${selectedViewingEmployee.tardinessCount} instances (${formatDuration(selectedViewingEmployee.totalLateMinutes)})`,
					`Undertime: ${selectedViewingEmployee.undertimeCount + selectedViewingEmployee.earlyOutCount} instances (${formatDuration(selectedViewingEmployee.totalUndertimeMinutes + selectedViewingEmployee.totalEarlyOutMinutes)})`,
				],
			});
		}
		toast.success(`Exported ${selectedViewingEmployee.name}'s tardiness report as ${formatType.toUpperCase()}`);
	};

	return (
		<Card>
			<CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0 space-y-1.5">
					<CardTitle>Tardiness & Undertime Report</CardTitle>
					<CardDescription>
						Tardiness details, time variance, undertime tracking, and day-by-day employee breakdown
					</CardDescription>
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
						<label className="block text-[11px] font-medium text-neutral-500 mb-0.5">Department</label>
						<DepartmentSectionPicker
							variant="report"
							departments={departments}
							sections={[]}
							departmentId={selectedDepartment}
							onDepartmentChange={(value) => {
								setSelectedDepartment(value);
								setSelectedManager("all");
							}}
							onSectionChange={(value) => {
								setSelectedDepartment(value);
								setSelectedManager("all");
							}}
						/>
					</div>
					<div className="shrink-0 w-[130px]">
						<label className="block text-[11px] font-medium text-neutral-500 mb-0.5">Position</label>
						<Select value={selectedPosition} onValueChange={setSelectedPosition}>
							<SelectTrigger className="h-8 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm">
								<SelectValue placeholder="All Positions" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Positions</SelectItem>
								{positions.map((pos: any) => (
									<SelectItem key={`pos-${pos.id}`} value={pos.id}>
										{pos.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="shrink-0 w-[130px]">
						<label className="block text-[11px] font-medium text-neutral-500 mb-0.5">Manager</label>
						<Select value={selectedManager} onValueChange={setSelectedManager}>
							<SelectTrigger className="h-8 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm">
								<SelectValue placeholder="All Managers" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Managers</SelectItem>
								{managers.map((emp: any) => (
									<SelectItem key={`manager-${emp.id}`} value={emp.id}>
										{emp.person?.personalInfo?.firstName}{" "}
										{emp.person?.personalInfo?.lastName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Actions */}
					<div className="flex gap-1.5 shrink-0 items-end ml-auto">
						<Button
							variant="ghost"
							onClick={handleClearFilters}
							className="text-muted-foreground hover:text-foreground h-8 px-2.5 text-xs">
							Clear Filters
						</Button>
					</div>
				</div>

				{/* Stats Cards */}
				{isLoading ? (
					<div className="text-center py-8 text-gray-500 text-xs">Loading metrics...</div>
				) : error ? (
					<div className="text-center py-8 text-red-500 text-xs">
						Error loading metrics: {error.message}
					</div>
				) : (
					<>
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
							<Card className="py-3 px-4 border-l-4 border-l-amber-500">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">
										Total Tardiness
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-amber-600">
										{metrics?.totalTardinessInstances || 0}
									</div>
									<p className="text-[11px] text-muted-foreground">
										Instances ({metrics?.totalLateHours?.toFixed(1) || 0} total hours)
									</p>
								</CardContent>
							</Card>
							<Card className="py-3 px-4 border-l-4 border-l-orange-500">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">
										Total Undertime
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-orange-600">
										{metrics?.totalUndertimeHours?.toFixed(2) || 0}
									</div>
									<p className="text-[11px] text-muted-foreground">
										Hours ({metrics?.totalUndertimeInstances || 0} instances)
									</p>
								</CardContent>
							</Card>
							<Card className="py-3 px-4 border-l-4 border-l-neutral-700">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">
										Employees with Issues
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-neutral-900">
										{metrics?.employeesWithIssues || 0}
									</div>
									<p className="text-[11px] text-muted-foreground">
										Employees with late or undertime in period
									</p>
								</CardContent>
							</Card>
						</div>

						{/* Table Section with Dedicated Header Bar */}
						<div className="border rounded-lg bg-white shadow-sm overflow-hidden">
							{/* Modern Table Header Toolbar */}
							<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-neutral-50/70 border-b border-neutral-200">
								{/* Left: View Filter Tabs */}
								<div className="flex items-center gap-1.5 p-0.5 bg-neutral-200/60 rounded-lg">
									<button
										onClick={() => setActiveTab("tardiness")}
										className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
											activeTab === "tardiness"
												? "bg-white text-amber-700 shadow-sm"
												: "text-neutral-600 hover:text-neutral-900"
										}`}>
										Tardiness Details ({rawEmployees.filter((e) => e.tardinessCount > 0).length})
									</button>
									<button
										onClick={() => setActiveTab("undertime")}
										className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
											activeTab === "undertime"
												? "bg-white text-orange-700 shadow-sm"
												: "text-neutral-600 hover:text-neutral-900"
										}`}>
										Undertime Details (
										{
											rawEmployees.filter(
												(e) => e.undertimeCount > 0 || e.earlyOutCount > 0,
											).length
										}
										)
									</button>
								</div>

								{/* Right: Search & Export Actions */}
								<div className="flex items-center gap-2 w-full sm:w-auto justify-end">
									<div className="relative w-full sm:w-[200px]">
										<Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
										<Input
											placeholder="Search employee..."
											value={searchQuery}
											onChange={(e) => setSearchQuery(e.target.value)}
											className="h-8 pl-8 text-xs bg-white"
										/>
									</div>
									<Button
										variant="outline"
										className="h-8 text-xs px-3 shadow-sm shrink-0 bg-white hover:bg-neutral-50 gap-1.5 font-medium"
										onClick={openExportModal}>
										<Download className="w-3.5 h-3.5" />
										Export Report
									</Button>
								</div>
							</div>

							{/* Table */}
							<div className="overflow-x-auto">
								<table className="w-full text-xs">
									<thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold text-[11px]">
										<tr>
											<th className="px-3 py-2 text-left">Employee ID</th>
											<th className="px-3 py-2 text-left">Name</th>
											<th className="px-3 py-2 text-left">Department</th>
											<th className="px-3 py-2 text-left">Position</th>
											<th className="px-3 py-2 text-left">Manager</th>
											{activeTab === "tardiness" ? (
												<>
													<th className="px-3 py-2 text-right">Tardiness Count</th>
													<th className="px-3 py-2 text-right">Total Late</th>
													<th className="px-3 py-2 text-right">Average Late</th>
													<th className="px-3 py-2 text-right">Max Late</th>
												</>
											) : (
												<>
													<th className="px-3 py-2 text-right">Undertime Count</th>
													<th className="px-3 py-2 text-right">Total Undertime</th>
												</>
											)}
											<th className="px-3 py-2 text-right">Action</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-neutral-100">
										{filteredEmployees.length > 0 ? (
											filteredEmployees.map((emp) => (
												<tr
													key={emp.id}
													className="hover:bg-neutral-50/80 transition-colors">
													<td className="px-3 py-2 font-mono text-[11px] text-neutral-700">
														{emp.employeeId}
													</td>
													<td className="px-3 py-2 text-xs">
														<ReportEmployeeCell
															rosterEmployees={allEmployees}
															employeeId={emp.employeeId}
															fullName={emp.name}
														/>
													</td>
													<td className="px-3 py-2 text-neutral-700 font-medium text-xs">
														{emp.department}
													</td>
													<td className="px-3 py-2 text-neutral-600 text-xs">
														{getPositionName(findSourceEmployee(emp))}
													</td>
													<td className="px-3 py-2 text-neutral-600 text-xs">
														{getManagerName(findSourceEmployee(emp))}
													</td>
													{activeTab === "tardiness" ? (
														<>
															<td className="px-3 py-2 text-right font-medium text-amber-700 text-xs">
																{emp.tardinessCount}
															</td>
															<td className="px-3 py-2 text-right font-mono font-medium text-amber-700 text-xs">
																{formatDuration(emp.totalLateMinutes)} ({emp.totalLateMinutes}m)
															</td>
															<td className="px-3 py-2 text-right font-mono text-neutral-700 text-xs">
																{emp.avgLateMinutes}m
															</td>
															<td className="px-3 py-2 text-right font-mono text-neutral-700 text-xs">
																{emp.maxLateMinutes}m
															</td>
														</>
													) : (
														<>
															<td className="px-3 py-2 text-right font-medium text-orange-700 text-xs">
																{emp.undertimeCount + emp.earlyOutCount}
															</td>
															<td className="px-3 py-2 text-right font-mono font-medium text-orange-700 text-xs">
																{formatDuration(
																	emp.totalUndertimeMinutes + emp.totalEarlyOutMinutes,
																)}{" "}
																({emp.totalUndertimeMinutes + emp.totalEarlyOutMinutes}m)
															</td>
														</>
													)}
													<td className="px-3 py-2 text-right">
														<Button
															variant="outline"
															size="sm"
															onClick={() => setSelectedViewingEmployee(emp)}
															className="h-7 px-2 text-[11px] gap-1">
															<Eye className="h-3 w-3" />
															View Breakdown
														</Button>
													</td>
												</tr>
											))
										) : (
											<tr>
												<td
													colSpan={activeTab === "tardiness" ? 10 : 8}
													className="px-6 py-12 text-center text-neutral-500">
													No {activeTab} records found for this period
												</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						</div>
					</>
				)}
			</CardContent>

			{/* Detailed Employee Tardiness / Undertime Breakdown Modal */}
			<Dialog
				open={Boolean(selectedViewingEmployee)}
				onOpenChange={(open) => {
					if (!open) {
						setSelectedViewingEmployee(null);
						setModalOnlyViolations(false);
					}
				}}>
				<DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
					<DialogHeader className="border-b pb-3">
						<div className="flex items-center justify-between gap-4 pr-6">
							<div>
								<DialogTitle className="text-lg font-bold flex items-center gap-2">
									<AlertTriangle className="h-5 w-5 text-amber-600" />
									{selectedViewingEmployee?.name} ({selectedViewingEmployee?.employeeId})
								</DialogTitle>
								<DialogDescription className="text-xs text-neutral-500 mt-0.5">
									{selectedViewingEmployee?.department} • Attendance Breakdown ({fromIso} to {toIso})
								</DialogDescription>
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => exportEmployeeBreakdown("pdf")}
									className="h-8 text-xs gap-1">
									<Download className="h-3.5 w-3.5" />
									PDF
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => exportEmployeeBreakdown("csv")}
									className="h-8 text-xs gap-1">
									<Download className="h-3.5 w-3.5" />
									CSV
								</Button>
							</div>
						</div>
					</DialogHeader>

					{/* Quick stats in modal */}
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-2">
						<div className="rounded-lg border bg-amber-50/60 p-2.5 text-center">
							<div className="text-xs text-amber-800 font-medium">Tardiness Count</div>
							<div className="text-lg font-bold text-amber-900 mt-0.5">
								{selectedViewingEmployee?.tardinessCount || 0} instances
							</div>
						</div>
						<div className="rounded-lg border bg-amber-50/60 p-2.5 text-center">
							<div className="text-xs text-amber-800 font-medium">Total Late Minutes</div>
							<div className="text-lg font-bold text-amber-900 mt-0.5">
								{formatDuration(selectedViewingEmployee?.totalLateMinutes || 0)} (
								{selectedViewingEmployee?.totalLateMinutes || 0}m)
							</div>
						</div>
						<div className="rounded-lg border bg-orange-50/60 p-2.5 text-center">
							<div className="text-xs text-orange-800 font-medium">Undertime Count</div>
							<div className="text-lg font-bold text-orange-900 mt-0.5">
								{(selectedViewingEmployee?.undertimeCount || 0) +
									(selectedViewingEmployee?.earlyOutCount || 0)}{" "}
								instances
							</div>
						</div>
						<div className="rounded-lg border bg-orange-50/60 p-2.5 text-center">
							<div className="text-xs text-orange-800 font-medium">Total Undertime</div>
							<div className="text-lg font-bold text-orange-900 mt-0.5">
								{formatDuration(
									(selectedViewingEmployee?.totalUndertimeMinutes || 0) +
										(selectedViewingEmployee?.totalEarlyOutMinutes || 0),
								)}
							</div>
						</div>
					</div>

					{/* Toggle for violations only */}
					<div className="flex items-center justify-between mt-3 mb-1">
						<div className="text-xs font-semibold text-neutral-700">
							Day-by-Day Attendance Log
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant={modalOnlyViolations ? "default" : "outline"}
								size="sm"
								onClick={() => setModalOnlyViolations(!modalOnlyViolations)}
								className="h-7 text-xs px-2.5">
								{modalOnlyViolations ? "Showing Late / Undertime Days Only" : "Show All Days"}
							</Button>
						</div>
					</div>

					{/* Day by Day Records Table */}
					{isEmployeeMonthlyLoading ? (
						<div className="py-12 text-center text-xs text-neutral-500">
							Loading employee attendance records...
						</div>
					) : filteredModalRecords.length === 0 ? (
						<div className="py-8 text-center text-xs text-neutral-500 rounded border border-dashed">
							No attendance records found for this period
						</div>
					) : (
						<div className="border rounded-lg overflow-hidden mt-1">
							<table className="w-full text-xs">
								<thead className="bg-neutral-50 border-b text-neutral-600 font-semibold">
									<tr>
										<th className="py-2.5 px-3 text-left">Date</th>
										<th className="py-2.5 px-3 text-left">Schedule</th>
										<th className="py-2.5 px-3 text-left">Status</th>
										<th className="py-2.5 px-3 text-left">Clock In</th>
										<th className="py-2.5 px-3 text-left">Clock Out</th>
										<th className="py-2.5 px-3 text-right">Late</th>
										<th className="py-2.5 px-3 text-right">Undertime</th>
										<th className="py-2.5 px-3 text-right">Hours</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-neutral-100 bg-white">
									{filteredModalRecords.map((row: any, idx: number) => {
										const isLate =
											Number(row.lateMinutes || 0) > 0 ||
											(row.lateHours && row.lateHours !== "0:00" && row.lateHours !== "");
										const isUndertime =
											Number(row.undertimeMinutes || 0) > 0 ||
											Number(row.earlyOutMinutes || 0) > 0 ||
											(row.undertimeHours &&
												row.undertimeHours !== "0:00" &&
												row.undertimeHours !== "");

										return (
											<tr
												key={row.id || `${row.date}-${idx}`}
												className={
													isLate || isUndertime
														? "bg-amber-50/30 hover:bg-amber-50/60"
														: "hover:bg-neutral-50/80"
												}>
												<td className="py-2 px-3 font-medium text-neutral-900 whitespace-nowrap">
													{formatDayLabel(row.date)}
												</td>
												<td className="py-2 px-3 text-neutral-600">
													{row.scheduleSnapshot?.shiftTypeName ||
														row.scheduleSnapshot?.name ||
														"Regular"}
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
														className="text-[10px] px-1.5 py-0.2">
														{row.status || "-"}
													</Badge>
												</td>
												<td className="py-2 px-3 font-mono text-neutral-700 whitespace-nowrap">
													{formatTime(row.timeIn)}
												</td>
												<td className="py-2 px-3 font-mono text-neutral-700 whitespace-nowrap">
													{formatTime(row.timeOut)}
												</td>
												<td className="py-2 px-3 font-mono text-right">
													{isLate ? (
														<span className="text-amber-700 font-semibold bg-amber-100 px-1.5 py-0.5 rounded">
															{row.lateHours || `${row.lateMinutes}m`}
														</span>
													) : (
														<span className="text-neutral-400">-</span>
													)}
												</td>
												<td className="py-2 px-3 font-mono text-right">
													{isUndertime ? (
														<span className="text-orange-700 font-semibold bg-orange-100 px-1.5 py-0.5 rounded">
															{row.undertimeHours || `${row.undertimeMinutes}m`}
														</span>
													) : (
														<span className="text-neutral-400">-</span>
													)}
												</td>
												<td className="py-2 px-3 font-mono font-medium text-neutral-900 text-right">
													{row.hoursWorked || "-"}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</DialogContent>
			</Dialog>

			<ReportExportDialog
				title={`Export ${activeTab === "tardiness" ? "Tardiness" : "Undertime"} Report`}
				description={`Choose how to export the current ${activeTab} records.`}
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={[
					{
						format: "pdf",
						label: "Export PDF",
						helperText: `Download the current ${activeTab} records as a PDF.`,
					},
					{
						format: "csv",
						label: "Export CSV",
						helperText: `Download the same filtered rows as a CSV file.`,
					},
				]}
				onExport={handleExport}
			/>
		</Card>
	);
}
