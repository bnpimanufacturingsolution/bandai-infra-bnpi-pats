import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Download } from "lucide-react";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import { usePerfectAttendanceMetrics } from "~/lib/hooks/useMetrics";
import type { DateRange } from "react-day-picker";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { buildReportFileName, exportRowsToCsv, exportRowsToPdf } from "~/lib/utils/report-export";
import { ReportExportDialog } from "../components/ReportExportDialog";
import { ReportEmployeeCell } from "../components/ReportEmployeeCell";
import { ReportScopeDateFilters } from "../components/ReportScopeDateFilters";
import { useReportScopeFilters } from "../useReportScopeFilters";
import { toast } from "sonner";

/**
 * Perfect Attendance Tab Component
 * Displays perfect attendance tracking for a date range
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
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);

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
		() => (metrics?.employees || []).filter((emp) => emp.isPerfect),
		[metrics?.employees],
	);

	const getManagerName = (employee: any) => {
		const firstName = employee?.reportTo?.person?.personalInfo?.firstName || "";
		const lastName = employee?.reportTo?.person?.personalInfo?.lastName || "";
		const fullName = `${firstName} ${lastName}`.trim();
		return fullName || "N/A";
	};

	const filteredPerfectEmployees = useMemo(() => {
		if (selectedManager === "all") return perfectEmployees;

		return perfectEmployees.filter((metricEmployee) => {
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
	}, [allEmployees, perfectEmployees, selectedManager]);

	const handleClearFilters = () => {
		setSelectedDepartment("all");
		setSelectedManager("all");
		clearScopeFilters();
	};

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
					accessor: (employee) => employee.daysPresent,
				},
				{
					header: "Total Work Days",
					accessor: (employee) => employee.totalWorkDays,
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
					accessor: (employee) => employee.daysPresent,
				},
				{
					header: "Total Work Days",
					accessor: (employee) => employee.totalWorkDays,
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
				"Filters: Current department and manager selections applied.",
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

	return (
		<Card>
			<CardHeader>
				<CardTitle>Perfect Attendance Report</CardTitle>
				<CardDescription>
					Employees with zero absences and tardiness for the selected period
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Filters */}
				<div className="flex flex-col xl:flex-row gap-4 items-end justify-between">
					<div className="flex flex-1 flex-col md:flex-row gap-2 md:gap-4 w-full flex-wrap">
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
						<div className="w-full md:w-[160px]">
							<label className="block text-sm font-medium mb-1">Department</label>
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
						<div className="w-full md:w-[160px]">
							<label className="block text-sm font-medium mb-1">Manager</label>
							<Select value={selectedManager} onValueChange={setSelectedManager}>
								<SelectTrigger className="h-9 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm md:text-sm">
									<SelectValue />
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
					</div>

					{/* Actions */}
					<div className="flex gap-2 shrink-0 w-full md:w-auto mt-4 md:mt-0 items-center">
						<Button
							variant="ghost"
							onClick={handleClearFilters}
							className="flex-1 md:flex-none text-muted-foreground hover:text-foreground h-10 px-4">
							Clear Filters
						</Button>
						<Button
							variant="outline"
							className="flex-1 md:flex-none"
							onClick={openExportModal}>
							<Download className="w-4 h-4 mr-2" />
							Export
						</Button>
					</div>
				</div>

				{/* Stats Cards */}
				{isLoading ? (
					<div className="text-center py-8 text-gray-500">Loading metrics...</div>
				) : error ? (
					<div className="text-center py-8 text-red-500">
						Error loading metrics: {error.message}
					</div>
				) : (
					<>
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">
										Total Employees
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{metrics?.totalEmployees || 0}
									</div>
									<p className="text-xs text-gray-500">
										With attendance in period
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">
										Perfect Attendance
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{metrics?.perfectAttendanceCount || 0}
									</div>
									<p className="text-xs text-gray-500">
										Employees ({metrics?.perfectAttendanceRate?.toFixed(1) || 0}
										%)
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">
										Average Rate
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{metrics?.averageAttendanceRate?.toFixed(1) || 0}%
									</div>
									<p className="text-xs text-gray-500">Attendance rate</p>
								</CardContent>
							</Card>
						</div>

						{/* Table */}
						<div className="border rounded-lg overflow-hidden">
							<table className="w-full text-sm">
								<thead className="bg-gray-100">
									<tr>
										<th className="px-6 py-3 text-left font-medium">
											Employee ID
										</th>
										<th className="px-6 py-3 text-left font-medium">Name</th>
										<th className="px-6 py-3 text-left font-medium">
											Department
										</th>
										<th className="px-6 py-3 text-left font-medium">Manager</th>
										<th className="px-6 py-3 text-left font-medium">
											Days Present
										</th>
										<th className="px-6 py-3 text-left font-medium">Status</th>
									</tr>
								</thead>
								<tbody>
									{filteredPerfectEmployees.length > 0 ? (
										filteredPerfectEmployees.map((emp) => (
										<tr key={emp.id} className="border-t">
												<td className="px-6 py-3">{emp.employeeId}</td>
												<td className="px-6 py-3">
													<ReportEmployeeCell
														rosterEmployees={allEmployees}
														employeeId={emp.employeeId}
														fullName={emp.name}
													/>
												</td>
												<td className="px-6 py-3">{emp.department}</td>
												<td className="px-6 py-3">
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
												<td className="px-6 py-3">
													{emp.daysPresent}/{emp.totalWorkDays}
												</td>
												<td className="px-6 py-3">
													<span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
														Perfect
													</span>
												</td>
											</tr>
										))
									) : (
										<tr>
											<td
												colSpan={6}
												className="px-6 py-8 text-center text-gray-500">
												No employees with perfect attendance for this period
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
					</>
				)}
			</CardContent>
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
