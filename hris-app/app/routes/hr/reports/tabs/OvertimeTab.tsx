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
import { Download, Eye, Clock, CheckCircle2, AlertCircle, Search, Calendar } from "lucide-react";
import { Badge } from "~/components/atoms/Badge";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import { useOvertimeMetrics, useAttendanceMetricsDetailed } from "~/lib/hooks/useMetrics";
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

export type OvertimeFilterTab = "all" | "approved" | "unapproved";

interface OvertimeEmployeeRow {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	workforceSource: "DIRECT" | "AGENCY";
	overtimeCount: number;
	totalOvertimeHours: number;
	approvedOvertimeHours: number;
	unapprovedOvertimeHours: number;
	approvalStatus: "APPROVED" | "PARTIALLY_APPROVED" | "UNAPPROVED" | "NONE";
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

/**
 * Overtime Tab Component
 * Displays actual overtime worked vs approved overtime from timesheets/requests
 */
export function OvertimeTab() {
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

	const [activeTab, setActiveTab] = useState<OvertimeFilterTab>("all");
	const [selectedDepartment, setSelectedDepartment] = useState("all");
	const [selectedPosition, setSelectedPosition] = useState("all");
	const [selectedManager, setSelectedManager] = useState("all");
	const [workforceSource, setWorkforceSource] = useState("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);
	const [selectedViewingEmployee, setSelectedViewingEmployee] =
		useState<OvertimeEmployeeRow | null>(null);

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

	const { data, isLoading, error } = useOvertimeMetrics(
		fromIso,
		toIso,
		selectedDepartment === "all" ? undefined : selectedDepartment,
		workforceSource,
	);

	const metrics = data?.metrics?.overtimeMetrics;
	const rawEmployees = (metrics?.employees || []) as OvertimeEmployeeRow[];

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

		// Group records by calendar date
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

			let earliestTimeIn: Date | null = null;
			let latestTimeOut: Date | null = null;
			let maxOtMinutes = 0;
			let otHoursStr = "0:00";
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

				const ot = Number(r.overtimeMinutes || 0);
				if (ot > maxOtMinutes) {
					maxOtMinutes = ot;
					if (r.overtimeHours && r.overtimeHours !== "0:00") otHoursStr = r.overtimeHours;
				}

				if (r.scheduleSnapshot && !scheduleSnapshot) {
					scheduleSnapshot = r.scheduleSnapshot;
				}

				if (r.status === "PRESENT" || r.status === "LATE" || r.status === "HOLIDAY") {
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
				overtimeMinutes: maxOtMinutes,
				overtimeHours: otHoursStr !== "0:00" ? otHoursStr : maxOtMinutes > 0 ? `${maxOtMinutes}m` : "0:00",
				hoursWorked,
				scheduleSnapshot,
			});
		}

		return consolidated.sort((a, b) => String(b.date).localeCompare(String(a.date)));
	}, [employeeMonthlyData]);

	const findSourceEmployee = (employeeRow: { id: string; employeeId: string; name: string }) =>
		allEmployees.find(
			(employee: any) =>
				employee.id === employeeRow.id ||
				employee.employeeId === employeeRow.employeeId ||
				`${employee.person?.personalInfo?.firstName || ""} ${employee.person?.personalInfo?.lastName || ""}`
					.trim()
					.toLowerCase() === employeeRow.name.toLowerCase(),
		);

	const getManagerName = (employee: any) => {
		const firstName = employee?.reportTo?.person?.personalInfo?.firstName || "";
		const lastName = employee?.reportTo?.person?.personalInfo?.lastName || "";
		const fullName = `${firstName} ${lastName}`.trim();
		return fullName || "N/A";
	};

	const getPositionName = (employee: any) => {
		return employee?.position?.name || employee?.positionName || "N/A";
	};

	// Filtered employee list based on tab, manager, position, search
	const filteredEmployees = useMemo(() => {
		let list = rawEmployees;

		if (activeTab === "approved") {
			list = list.filter((emp) => emp.approvedOvertimeHours > 0);
		} else if (activeTab === "unapproved") {
			list = list.filter((emp) => emp.unapprovedOvertimeHours > 0);
		}

		if (selectedManager !== "all") {
			list = list.filter((emp) => {
				const src = findSourceEmployee(emp);
				return src?.reportTo?.id === selectedManager;
			});
		}

		if (selectedPosition !== "all") {
			list = list.filter((emp) => {
				const src = findSourceEmployee(emp);
				return src?.positionId === selectedPosition || src?.position?.id === selectedPosition;
			});
		}

		if (searchQuery.trim()) {
			const q = searchQuery.trim().toLowerCase();
			list = list.filter(
				(emp) =>
					emp.name.toLowerCase().includes(q) ||
					emp.employeeId.toLowerCase().includes(q) ||
					emp.department.toLowerCase().includes(q),
			);
		}

		return list;
	}, [rawEmployees, activeTab, selectedManager, selectedPosition, searchQuery, allEmployees]);

	const handleClearFilters = () => {
		setSelectedDepartment("all");
		setSelectedPosition("all");
		setSelectedManager("all");
		setWorkforceSource("all");
		setSearchQuery("");
		clearScopeFilters();
	};

	const exportCsv = () => {
		exportRowsToCsv({
			columns: [
				{ header: "Employee ID", accessor: "employeeId" },
				{ header: "Name", accessor: "name" },
				{ header: "Department", accessor: "department" },
				{
					header: "Position",
					accessor: (emp) => getPositionName(findSourceEmployee(emp)),
				},
				{
					header: "Manager",
					accessor: (emp) => getManagerName(findSourceEmployee(emp)),
				},
				{ header: "Labor Type", accessor: "workforceSource" },
				{ header: "Days with OT", accessor: "overtimeCount" },
				{
					header: "Total OT Hours",
					accessor: (emp) => emp.totalOvertimeHours.toFixed(2),
				},
				{
					header: "Approved OT Hours",
					accessor: (emp) => emp.approvedOvertimeHours.toFixed(2),
				},
				{
					header: "Unapproved OT Hours",
					accessor: (emp) => emp.unapprovedOvertimeHours.toFixed(2),
				},
				{ header: "Status", accessor: (emp) => emp.approvalStatus },
			],
			rows: filteredEmployees,
			fileBaseName: buildReportFileName(
				"attendance-overtime",
				fromIso,
				"to",
				toIso,
				selectedDepartment !== "all" ? "department" : undefined,
				selectedDepartment !== "all" ? selectedDepartment : undefined,
			),
		});
	};

	const exportPdf = async () => {
		await exportRowsToPdf({
			columns: [
				{ header: "Employee ID", accessor: "employeeId" },
				{ header: "Name", accessor: "name" },
				{ header: "Department", accessor: "department" },
				{
					header: "Position",
					accessor: (emp) => getPositionName(findSourceEmployee(emp)),
				},
				{ header: "Labor Type", accessor: "workforceSource" },
				{
					header: "Total OT (hrs)",
					accessor: (emp) => emp.totalOvertimeHours.toFixed(2),
				},
				{
					header: "Approved (hrs)",
					accessor: (emp) => emp.approvedOvertimeHours.toFixed(2),
				},
				{
					header: "Unapproved (hrs)",
					accessor: (emp) => emp.unapprovedOvertimeHours.toFixed(2),
				},
				{ header: "Status", accessor: (emp) => emp.approvalStatus },
			],
			rows: filteredEmployees,
			fileBaseName: buildReportFileName(
				"attendance-overtime",
				fromIso,
				"to",
				toIso,
				selectedDepartment !== "all" ? "department" : undefined,
				selectedDepartment !== "all" ? selectedDepartment : undefined,
			),
			reportTitle: "Overtime Tracking & Approval Report",
			metadataLines: [
				`Period: ${fromIso || "-"} to ${toIso || "-"}`,
				`Total OT: ${metrics?.totalOvertimeHours?.toFixed(2) || 0} hrs | Approved: ${metrics?.totalApprovedOvertimeHours?.toFixed(2) || 0} hrs`,
			],
		});
	};

	const openExportModal = () => {
		if (!filteredEmployees.length) {
			toast.error("No overtime rows available to export.");
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
		if (!selectedViewingEmployee || employeeMonthlyRecords.length === 0) return;

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
			{ header: "OT Hours", accessor: (row) => row.overtimeHours || "0:00" },
			{ header: "Hours Worked", accessor: (row) => row.hoursWorked || "0:00" },
		];

		const fileBase = buildReportFileName(
			`overtime-${selectedViewingEmployee.employeeId}-${selectedViewingEmployee.name.replace(/\s+/g, "_")}`,
			fromIso,
			"to",
			toIso,
		);

		if (formatType === "csv") {
			exportRowsToCsv({
				columns,
				rows: employeeMonthlyRecords,
				fileBaseName: fileBase,
			});
		} else {
			await exportRowsToPdf({
				columns,
				rows: employeeMonthlyRecords,
				fileBaseName: fileBase,
				reportTitle: `Overtime Breakdown - ${selectedViewingEmployee.name} (${selectedViewingEmployee.employeeId})`,
				metadataLines: [
					`Department: ${selectedViewingEmployee.department}`,
					`Period: ${fromIso} to ${toIso}`,
					`Total Overtime: ${selectedViewingEmployee.totalOvertimeHours.toFixed(2)} hrs (Approved: ${selectedViewingEmployee.approvedOvertimeHours.toFixed(2)} hrs)`,
				],
			});
		}
		toast.success(`Exported ${selectedViewingEmployee.name}'s overtime breakdown as ${formatType.toUpperCase()}`);
	};

	return (
		<Card>
			<CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0 space-y-1.5">
					<CardTitle>Overtime Report</CardTitle>
					<CardDescription>
						Overtime tracking, approved timesheet overtime, and individual employee breakdowns
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Overtime Policy Info Banner */}
				<div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
					<AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
					<div className="leading-relaxed">
						<span className="font-semibold text-blue-950">Overtime Approval Policy: </span>
						Overtime rendered via biometric punch logs is <strong>not automatically approved</strong>. Employees must file an <strong>Overtime Request</strong> for manager/HR approval. Rendered hours without an approved request remain classified as <strong>Unapproved / Awaiting Request</strong>.
					</div>
				</div>

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
					<div className="shrink-0 w-[130px]">
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
					<div className="shrink-0 w-[125px]">
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
					<div className="shrink-0 w-[110px]">
						<label className="block text-[11px] font-medium text-neutral-500 mb-0.5">Labor Type</label>
						<Select value={workforceSource} onValueChange={setWorkforceSource}>
							<SelectTrigger className="h-8 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm">
								<SelectValue placeholder="All Labor" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Labor</SelectItem>
								<SelectItem value="DIRECT">Direct</SelectItem>
								<SelectItem value="AGENCY">Agency</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="shrink-0 w-[125px]">
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

					{/* Clear Filter Action */}
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
					<div className="text-center py-8 text-gray-500 text-xs">Loading overtime metrics...</div>
				) : error ? (
					<div className="text-center py-8 text-red-500 text-xs">
						Error loading metrics: {error.message}
					</div>
				) : (
					<>
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
							<Card className="py-3 px-4 border-l-4 border-l-neutral-400">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">
										Total Overtime Worked
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-neutral-900">
										{metrics?.totalOvertimeHours?.toFixed(2) || "0.00"}
									</div>
									<p className="text-[11px] text-muted-foreground">
										Hours ({metrics?.employeesWithOvertime || 0} employees)
									</p>
								</CardContent>
							</Card>
							<Card className="py-3 px-4 border-l-4 border-l-emerald-500">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">
										Approved Overtime
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-emerald-700">
										{metrics?.totalApprovedOvertimeHours?.toFixed(2) || "0.00"}
									</div>
									<p className="text-[11px] text-muted-foreground">
										Approved ({metrics?.employeesWithApprovedOvertime || 0} employees)
									</p>
								</CardContent>
							</Card>
							<Card className="py-3 px-4 border-l-4 border-l-amber-500">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">
										Unapproved / Awaiting Request
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-amber-600">
										{metrics?.totalUnapprovedOvertimeHours?.toFixed(2) || "0.00"}
									</div>
									<p className="text-[11px] text-muted-foreground">
										Awaiting Request ({metrics?.employeesWithUnapprovedOvertime || 0} employees)
									</p>
								</CardContent>
							</Card>
							<Card className="py-3 px-4 border-l-4 border-l-blue-500">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">
										Direct OT
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-blue-700">
										{metrics?.split?.direct?.totalOvertimeHours?.toFixed(2) || "0.00"}
									</div>
									<p className="text-[11px] text-muted-foreground">
										{metrics?.split?.direct?.employeesWithOvertime || 0} employees
									</p>
								</CardContent>
							</Card>
							<Card className="py-3 px-4 border-l-4 border-l-purple-500">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">
										Agency OT
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-purple-700">
										{metrics?.split?.agency?.totalOvertimeHours?.toFixed(2) || "0.00"}
									</div>
									<p className="text-[11px] text-muted-foreground">
										{metrics?.split?.agency?.employeesWithOvertime || 0} employees
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
										onClick={() => setActiveTab("all")}
										className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
											activeTab === "all"
												? "bg-white text-neutral-900 shadow-sm"
												: "text-neutral-600 hover:text-neutral-900"
										}`}>
										All Overtime ({rawEmployees.length})
									</button>
									<button
										onClick={() => setActiveTab("approved")}
										className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
											activeTab === "approved"
												? "bg-white text-emerald-700 shadow-sm"
												: "text-neutral-600 hover:text-neutral-900"
										}`}>
										Approved ({rawEmployees.filter((e) => e.approvedOvertimeHours > 0).length})
									</button>
									<button
										onClick={() => setActiveTab("unapproved")}
										className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
											activeTab === "unapproved"
												? "bg-white text-amber-700 shadow-sm"
												: "text-neutral-600 hover:text-neutral-900"
										}`}>
										Unapproved ({rawEmployees.filter((e) => e.unapprovedOvertimeHours > 0).length})
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
											<th className="px-3 py-2 text-left">Labor Type</th>
											<th className="px-3 py-2 text-right">Days with OT</th>
											<th className="px-3 py-2 text-right">Total OT Hours</th>
											<th className="px-3 py-2 text-right">Approved OT</th>
											<th className="px-3 py-2 text-right">Unapproved OT</th>
											<th className="px-3 py-2 text-center">Approval Status</th>
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
													<td className="px-3 py-2 text-neutral-600">
														<Badge
															variant={
																emp.workforceSource === "AGENCY"
																	? "warning-soft"
																	: "neutral-soft"
															}
															className="text-[10px] px-1.5 py-0.2">
															{emp.workforceSource}
														</Badge>
													</td>
													<td className="px-3 py-2 text-right font-medium text-neutral-700 text-xs">
														{emp.overtimeCount}
													</td>
													<td className="px-3 py-2 text-right font-mono font-bold text-neutral-900 text-xs">
														{emp.totalOvertimeHours.toFixed(2)} hrs
													</td>
													<td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700 text-xs">
														{emp.approvedOvertimeHours.toFixed(2)} hrs
													</td>
													<td className="px-3 py-2 text-right font-mono text-amber-700 text-xs">
														{emp.unapprovedOvertimeHours > 0
															? `${emp.unapprovedOvertimeHours.toFixed(2)} hrs`
															: "-"}
													</td>
													<td className="px-3 py-2 text-center">
														<Badge
															variant={
																emp.approvalStatus === "APPROVED"
																	? "success-soft"
																	: emp.approvalStatus === "PARTIALLY_APPROVED"
																		? "warning-soft"
																		: "destructive-soft"
															}
															className="text-[10px] px-2 py-0.5">
															{emp.approvalStatus}
														</Badge>
													</td>
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
													colSpan={11}
													className="px-4 py-8 text-center text-neutral-500 text-xs">
													No overtime records found for this period
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

			{/* Detailed Employee Overtime Breakdown Modal */}
			<Dialog
				open={Boolean(selectedViewingEmployee)}
				onOpenChange={(open) => {
					if (!open) setSelectedViewingEmployee(null);
				}}>
				<DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
					<DialogHeader className="border-b pb-3">
						<div className="flex items-center justify-between gap-4 pr-6">
							<div>
								<DialogTitle className="text-lg font-bold flex items-center gap-2">
									<Clock className="h-5 w-5 text-blue-600" />
									{selectedViewingEmployee?.name} ({selectedViewingEmployee?.employeeId})
								</DialogTitle>
								<DialogDescription className="text-xs text-neutral-500 mt-0.5">
									{selectedViewingEmployee?.department} • Overtime Breakdown ({fromIso} to {toIso})
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
						<div className="rounded-lg border bg-neutral-50 p-2.5 text-center">
							<div className="text-xs text-neutral-500 font-medium">Days with OT</div>
							<div className="text-lg font-bold text-neutral-900 mt-0.5">
								{selectedViewingEmployee?.overtimeCount || 0}
							</div>
						</div>
						<div className="rounded-lg border bg-neutral-50 p-2.5 text-center">
							<div className="text-xs text-neutral-500 font-medium">Total OT Worked</div>
							<div className="text-lg font-bold text-neutral-900 mt-0.5">
								{selectedViewingEmployee?.totalOvertimeHours.toFixed(2)} hrs
							</div>
						</div>
						<div className="rounded-lg border bg-emerald-50/60 p-2.5 text-center">
							<div className="text-xs text-emerald-800 font-medium">Approved OT</div>
							<div className="text-lg font-bold text-emerald-800 mt-0.5">
								{selectedViewingEmployee?.approvedOvertimeHours.toFixed(2)} hrs
							</div>
						</div>
						<div className="rounded-lg border bg-neutral-50 p-2.5 text-center">
							<div className="text-xs text-neutral-500 font-medium">Approval Status</div>
							<div className="text-sm font-bold text-emerald-700 mt-1 flex items-center justify-center gap-1">
								<CheckCircle2 className="h-4 w-4" />
								{selectedViewingEmployee?.approvalStatus}
							</div>
						</div>
					</div>

					{/* Day by Day Records Table */}
					{isEmployeeMonthlyLoading ? (
						<div className="py-12 text-center text-xs text-neutral-500">
							Loading employee overtime records...
						</div>
					) : employeeMonthlyRecords.length === 0 ? (
						<div className="py-8 text-center text-xs text-neutral-500 rounded border border-dashed">
							No overtime records found for this period
						</div>
					) : (
						<div className="border rounded-lg overflow-hidden mt-2">
							<table className="w-full text-xs">
								<thead className="bg-neutral-50 border-b text-neutral-600 font-semibold">
									<tr>
										<th className="py-2.5 px-3 text-left">Date</th>
										<th className="py-2.5 px-3 text-left">Schedule</th>
										<th className="py-2.5 px-3 text-left">Status</th>
										<th className="py-2.5 px-3 text-left">Clock In</th>
										<th className="py-2.5 px-3 text-left">Clock Out</th>
										<th className="py-2.5 px-3 text-right">OT Hours</th>
										<th className="py-2.5 px-3 text-right">Total Hours</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-neutral-100 bg-white">
									{employeeMonthlyRecords.map((row: any, idx: number) => (
										<tr key={row.id || `${row.date}-${idx}`} className="hover:bg-neutral-50/80">
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
											<td className="py-2 px-3 font-mono font-semibold text-blue-700 text-right">
												{row.overtimeHours || "-"}
											</td>
											<td className="py-2 px-3 font-mono font-medium text-neutral-900 text-right">
												{row.hoursWorked || "-"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</DialogContent>
			</Dialog>

			<ReportExportDialog
				title="Export Overtime Report"
				description="Choose how to export the current overtime records."
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={[
					{
						format: "pdf",
						label: "Export PDF",
						helperText: "Download the current overtime report as a PDF.",
					},
					{
						format: "csv",
						label: "Export CSV",
						helperText: "Download the same filtered rows as a CSV file.",
					},
				]}
				onExport={handleExport}
			/>
		</Card>
	);
}
