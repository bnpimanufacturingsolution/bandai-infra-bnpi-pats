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
import { Download, Eye, Calendar, Clock, CheckCircle2, AlertCircle, Search } from "lucide-react";
import { Badge } from "~/components/atoms/Badge";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import { usePerfectAttendanceMetrics, useAttendanceMetricsDetailed } from "~/lib/hooks/useMetrics";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
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

interface PerfectAttendanceEmployeeItem {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	daysPresent: number;
	totalWorkDays: number;
	isPerfect: boolean;
	lateMinutes?: number;
	undertimeMinutes?: number;
	absentDays?: number;
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
 * Perfect Attendance Tab Component
 * Displays perfect attendance tracking for a date range with detailed employee attendance inspection
 */
export function PerfectAttendanceTab() {
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
	const [selectedDepartment, setSelectedDepartment] = useState("all");
	const [selectedManager, setSelectedManager] = useState("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);
	const [selectedViewingEmployee, setSelectedViewingEmployee] =
		useState<PerfectAttendanceEmployeeItem | null>(null);

	const { data: departmentsData } = useDepartments({ limit: 1000 });
	const departments = departmentsData?.departments || [];

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

	const { data, isLoading, error } = usePerfectAttendanceMetrics(
		fromIso,
		toIso,
		selectedDepartment === "all" ? undefined : selectedDepartment,
	);

	const metrics = data?.metrics?.perfectAttendanceMetrics;
	const perfectEmployees = useMemo(
		() => ((metrics?.employees || []) as PerfectAttendanceEmployeeItem[]).filter((emp) => emp.isPerfect),
		[metrics?.employees],
	);

	const handleClearFilters = () => {
		setSelectedDepartment("all");
		setSelectedManager("all");
		setSearchQuery("");
		clearScopeFilters();
	};

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

	const getManagerName = (employee: any) => {
		const firstName = employee?.reportTo?.person?.personalInfo?.firstName || "";
		const lastName = employee?.reportTo?.person?.personalInfo?.lastName || "";
		const fullName = `${firstName} ${lastName}`.trim();
		return fullName || "N/A";
	};

	const filteredPerfectEmployees = useMemo(() => {
		let list = perfectEmployees;
		if (selectedManager !== "all") {
			list = list.filter((metricEmployee) => {
				const sourceEmployee = allEmployees.find(
					(emp: any) =>
						emp.id === metricEmployee.id ||
						emp.employeeId === metricEmployee.employeeId ||
						`${emp.person?.personalInfo?.firstName || ""} ${emp.person?.personalInfo?.lastName || ""}`
							.trim()
							.toLowerCase() === metricEmployee.name.toLowerCase(),
				);
				return sourceEmployee?.reportTo?.id === selectedManager;
			});
		}

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			list = list.filter(
				(emp) =>
					emp.name.toLowerCase().includes(q) ||
					emp.employeeId.toLowerCase().includes(q) ||
					emp.department.toLowerCase().includes(q),
			);
		}

		return list;
	}, [allEmployees, perfectEmployees, searchQuery, selectedManager]);

	const exportCsv = () => {
		exportRowsToCsv({
			columns: [
				{ header: "Employee ID", accessor: "employeeId" },
				{ header: "Name", accessor: "name" },
				{ header: "Department", accessor: "department" },
				{
					header: "Manager",
					accessor: (employee) => {
						const sourceEmployee = allEmployees.find(
							(record: any) =>
								record.id === employee.id ||
								record.employeeId === employee.employeeId ||
								`${record.person?.personalInfo?.firstName || ""} ${record.person?.personalInfo?.lastName || ""}`
									.trim()
									.toLowerCase() === employee.name.toLowerCase(),
						);
						return getManagerName(sourceEmployee);
					},
				},
				{
					header: "Days Present",
					accessor: (employee) => `${employee.daysPresent}/${employee.totalWorkDays}`,
				},
				{ header: "Status", accessor: () => "Perfect" },
			],
			rows: filteredPerfectEmployees,
			fileBaseName: buildReportFileName(
				"attendance-perfect-attendance",
				fromIso,
				"to",
				toIso,
				selectedDepartment !== "all" ? "department" : undefined,
				selectedDepartment !== "all" ? selectedDepartment : undefined,
				selectedManager !== "all" ? "manager" : undefined,
				selectedManager !== "all" ? selectedManager : undefined,
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
					header: "Manager",
					accessor: (employee) => {
						const sourceEmployee = allEmployees.find(
							(record: any) =>
								record.id === employee.id ||
								record.employeeId === employee.employeeId ||
								`${record.person?.personalInfo?.firstName || ""} ${record.person?.personalInfo?.lastName || ""}`
									.trim()
									.toLowerCase() === employee.name.toLowerCase(),
						);
						return getManagerName(sourceEmployee);
					},
				},
				{
					header: "Days Present",
					accessor: (employee) => `${employee.daysPresent}/${employee.totalWorkDays}`,
				},
				{ header: "Status", accessor: () => "Perfect" },
			],
			rows: filteredPerfectEmployees,
			fileBaseName: buildReportFileName(
				"attendance-perfect-attendance",
				fromIso,
				"to",
				toIso,
				selectedDepartment !== "all" ? "department" : undefined,
				selectedDepartment !== "all" ? selectedDepartment : undefined,
				selectedManager !== "all" ? "manager" : undefined,
				selectedManager !== "all" ? selectedManager : undefined,
			),
			reportTitle: "Perfect Attendance Report",
			metadataLines: [
				`Period: ${fromIso || "-"} to ${toIso || "-"}`,
				"Filters: Zero absences, zero late arrivals, and zero undertime for whole cut-off.",
			],
		});
	};

	const openExportModal = () => {
		if (!filteredPerfectEmployees.length) {
			toast.error("No perfect attendance rows available to export.");
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

	const exportEmployeeMonthly = async (formatType: "csv" | "pdf") => {
		if (!selectedViewingEmployee || employeeMonthlyRecords.length === 0) return;

		const columns: ReportExportColumn<any>[] = [
			{ header: "Date", accessor: (row) => formatDayLabel(row.date) },
			{ header: "Schedule", accessor: (row) => row.scheduleSnapshot?.shiftTypeName || row.scheduleSnapshot?.name || "Regular" },
			{ header: "Status", accessor: (row) => row.status || "-" },
			{ header: "Clock In", accessor: (row) => formatTime(row.timeIn) },
			{ header: "Clock Out", accessor: (row) => formatTime(row.timeOut) },
			{ header: "Late", accessor: (row) => row.lateHours || "0:00" },
			{ header: "Undertime", accessor: (row) => row.undertimeHours || "0:00" },
			{ header: "Hours Worked", accessor: (row) => row.hoursWorked || "0:00" },
		];

		const fileBase = buildReportFileName(
			`attendance-${selectedViewingEmployee.employeeId}-${selectedViewingEmployee.name.replace(/\s+/g, "_")}`,
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
				reportTitle: `Attendance Records - ${selectedViewingEmployee.name} (${selectedViewingEmployee.employeeId})`,
				metadataLines: [
					`Department: ${selectedViewingEmployee.department}`,
					`Period: ${fromIso} to ${toIso}`,
					`Attendance: ${selectedViewingEmployee.daysPresent}/${selectedViewingEmployee.totalWorkDays} Days (${selectedViewingEmployee.isPerfect ? "Perfect Attendance" : "Standard"})`,
				],
			});
		}
		toast.success(`Exported ${selectedViewingEmployee.name}'s attendance as ${formatType.toUpperCase()}`);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Perfect Attendance Report</CardTitle>
				<CardDescription>
					Employees with 100% on-time presence (zero absences, zero tardiness, and zero undertime) across the entire cut-off schedule
				</CardDescription>
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
						<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
							<Card className="py-3 px-4 border-l-4 border-l-blue-500">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">
										Total Scheduled Employees
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-neutral-900">
										{metrics?.totalEmployees || 0}
									</div>
									<p className="text-[11px] text-muted-foreground">
										Employees with obligations in period
									</p>
								</CardContent>
							</Card>
							<Card className="py-3 px-4 border-l-4 border-l-emerald-500">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">
										Perfect Attendance
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-emerald-700">
										{metrics?.perfectAttendanceCount || 0}
									</div>
									<p className="text-[11px] text-muted-foreground">
										Employees ({metrics?.perfectAttendanceRate?.toFixed(1) || 0}%)
									</p>
								</CardContent>
							</Card>
							<Card className="py-3 px-4 border-l-4 border-l-purple-500">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">
										Average Attendance Rate
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-purple-700">
										{metrics?.averageAttendanceRate?.toFixed(1) || 0}%
									</div>
									<p className="text-[11px] text-muted-foreground">Obligation fulfillment rate</p>
								</CardContent>
							</Card>
						</div>

						{/* Table Section with Dedicated Header Bar */}
						<div className="border rounded-lg bg-white shadow-sm overflow-hidden">
							{/* Modern Table Header Toolbar */}
							<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-neutral-50/70 border-b border-neutral-200">
								<div className="flex items-center gap-2">
									<h3 className="text-xs font-semibold text-neutral-900">
										Perfect Attendance Records
									</h3>
									<Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold px-2 py-0.5">
										{filteredPerfectEmployees.length} Eligible
									</Badge>
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

							<div className="overflow-x-auto">
								<table className="w-full text-xs">
									<thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold text-[11px]">
										<tr>
											<th className="px-3 py-2 text-left">Employee ID</th>
											<th className="px-3 py-2 text-left">Name</th>
											<th className="px-3 py-2 text-left">Department</th>
											<th className="px-3 py-2 text-left">Manager</th>
											<th className="px-3 py-2 text-left">Days Present / Scheduled</th>
											<th className="px-3 py-2 text-left">Status</th>
											<th className="px-3 py-2 text-right">Action</th>
										</tr>
									</thead>
								<tbody className="divide-y divide-neutral-100">
									{filteredPerfectEmployees.length > 0 ? (
										filteredPerfectEmployees.map((emp) => (
											<tr key={emp.id} className="hover:bg-neutral-50/80 transition-colors">
												<td className="px-3 py-2 font-mono text-[11px] text-neutral-700">{emp.employeeId}</td>
												<td className="px-3 py-2 text-xs">
													<ReportEmployeeCell
														rosterEmployees={allEmployees}
														employeeId={emp.employeeId}
														fullName={emp.name}
													/>
												</td>
												<td className="px-3 py-2 text-neutral-700 font-medium text-xs">{emp.department}</td>
												<td className="px-3 py-2 text-neutral-600 text-xs">
													{(() => {
														const sourceEmployee = allEmployees.find(
															(employee: any) =>
																employee.id === emp.id ||
																employee.employeeId ===
																	emp.employeeId ||
																`${employee.person?.personalInfo?.firstName || ""} ${employee.person?.personalInfo?.lastName || ""}`
																	.trim()
																	.toLowerCase() ===
																	emp.name.toLowerCase(),
														);
														return getManagerName(sourceEmployee);
													})()}
												</td>
												<td className="px-3 py-2 font-medium text-neutral-900 text-xs">
													{emp.daysPresent} / {emp.totalWorkDays} days
												</td>
												<td className="px-3 py-2">
													<Badge variant="success-soft" className="text-[10px] font-semibold px-2 py-0.5">
														Perfect
													</Badge>
												</td>
												<td className="px-3 py-2 text-right">
													<Button
														variant="outline"
														size="sm"
														onClick={() => setSelectedViewingEmployee(emp)}
														className="h-7 px-2 text-[11px] gap-1">
														<Eye className="h-3 w-3" />
														View Attendance
													</Button>
												</td>
											</tr>
										))
									) : (
										<tr>
											<td
												colSpan={7}
												className="px-4 py-8 text-center text-neutral-500 text-xs">
												No employees with perfect attendance for this period
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

			{/* Detailed Employee Month Attendance Modal */}
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
									<Calendar className="h-5 w-5 text-emerald-600" />
									{selectedViewingEmployee?.name} ({selectedViewingEmployee?.employeeId})
								</DialogTitle>
								<DialogDescription className="text-xs text-neutral-500 mt-0.5">
									{selectedViewingEmployee?.department} • Monthly Attendance Breakdown ({fromIso} to {toIso})
								</DialogDescription>
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => exportEmployeeMonthly("pdf")}
									className="h-8 text-xs gap-1">
									<Download className="h-3.5 w-3.5" />
									PDF
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => exportEmployeeMonthly("csv")}
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
							<div className="text-xs text-neutral-500 font-medium">Days Present</div>
							<div className="text-lg font-bold text-neutral-900 mt-0.5">
								{selectedViewingEmployee?.daysPresent} / {selectedViewingEmployee?.totalWorkDays}
							</div>
						</div>
						<div className="rounded-lg border bg-neutral-50 p-2.5 text-center">
							<div className="text-xs text-neutral-500 font-medium">Late Minutes</div>
							<div className="text-lg font-bold text-neutral-900 mt-0.5">
								{selectedViewingEmployee?.lateMinutes || 0}m
							</div>
						</div>
						<div className="rounded-lg border bg-neutral-50 p-2.5 text-center">
							<div className="text-xs text-neutral-500 font-medium">Undertime</div>
							<div className="text-lg font-bold text-neutral-900 mt-0.5">
								{selectedViewingEmployee?.undertimeMinutes || 0}m
							</div>
						</div>
						<div className="rounded-lg border bg-neutral-50 p-2.5 text-center">
							<div className="text-xs text-neutral-500 font-medium">Status</div>
							<div className="text-sm font-bold text-emerald-700 mt-1 flex items-center justify-center gap-1">
								<CheckCircle2 className="h-4 w-4" />
								Perfect Attendance
							</div>
						</div>
					</div>

					{/* Day by Day Records Table */}
					{isEmployeeMonthlyLoading ? (
						<div className="py-12 text-center text-xs text-neutral-500">
							Loading employee attendance records...
						</div>
					) : employeeMonthlyRecords.length === 0 ? (
						<div className="py-8 text-center text-xs text-neutral-500 rounded border border-dashed">
							No daily attendance records found for this period
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
										<th className="py-2.5 px-3 text-left">Late</th>
										<th className="py-2.5 px-3 text-left">Undertime</th>
										<th className="py-2.5 px-3 text-right">Hours</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-neutral-100 bg-white">
									{employeeMonthlyRecords.map((row: any, idx: number) => (
										<tr key={row.id || `${row.date}-${idx}`} className="hover:bg-neutral-50/80">
											<td className="py-2 px-3 font-medium text-neutral-900 whitespace-nowrap">
												{formatDayLabel(row.date)}
											</td>
											<td className="py-2 px-3 text-neutral-600">
												{row.scheduleSnapshot?.shiftTypeName || row.scheduleSnapshot?.name || "Regular"}
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
											<td className="py-2 px-3 font-mono text-neutral-700">
												{row.lateHours && row.lateHours !== "0:00" ? (
													<span className="text-amber-600 font-medium">{row.lateHours}</span>
												) : (
													"-"
												)}
											</td>
											<td className="py-2 px-3 font-mono text-neutral-700">
												{row.undertimeHours && row.undertimeHours !== "0:00" ? (
													<span className="text-orange-600 font-medium">{row.undertimeHours}</span>
												) : (
													"-"
												)}
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
				title="Export Perfect Attendance"
				description="Choose how to export the current perfect attendance report."
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={[
					{
						format: "pdf",
						label: "Export PDF",
						helperText: "Download the current perfect attendance rows as a PDF.",
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
