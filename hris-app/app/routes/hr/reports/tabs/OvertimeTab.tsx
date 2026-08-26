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
import { useOvertimeMetrics } from "~/lib/hooks/useMetrics";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { buildReportFileName, exportRowsToCsv, exportRowsToPdf } from "~/lib/utils/report-export";
import { ReportExportDialog } from "../components/ReportExportDialog";
import { ReportEmployeeCell } from "../components/ReportEmployeeCell";
import { ReportScopeDateFilters } from "../components/ReportScopeDateFilters";
import { useReportScopeFilters } from "../useReportScopeFilters";
import { toast } from "sonner";

/**
 * Overtime Tab Component
 * Displays overtime hours tracking and analysis
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
	const [selectedDepartment, setSelectedDepartment] = useState("all");
	const [selectedManager, setSelectedManager] = useState("all");
	const [workforceSource, setWorkforceSource] = useState("all");
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

	const { data, isLoading, error } = useOvertimeMetrics(
		fromIso,
		toIso,
		selectedDepartment === "all" ? undefined : selectedDepartment,
		workforceSource,
	);

	const metrics = data?.metrics?.overtimeMetrics;
	const metricsEmployees = metrics?.employees || [];

	const filteredMetricsEmployees = useMemo(() => {
		if (selectedManager === "all") return metricsEmployees;

		return metricsEmployees.filter((metricEmployee) => {
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
	}, [metricsEmployees, allEmployees, selectedManager]);

	const handleClearFilters = () => {
		setSelectedDepartment("all");
		setSelectedManager("all");
		setWorkforceSource("all");
		clearScopeFilters();
	};

	const exportCsv = () => {
		exportRowsToCsv({
			columns: [
				{ header: "Employee ID", accessor: "employeeId" },
				{ header: "Name", accessor: "name" },
				{ header: "Department", accessor: "department" },
				{ header: "Labor Type", accessor: "workforceSource" },
				{ header: "Days with OT", accessor: "overtimeCount" },
				{
					header: "Total OT Hours",
					accessor: (employee) => employee.totalOvertimeHours.toFixed(2),
				},
			],
			rows: filteredMetricsEmployees,
			fileBaseName: buildReportFileName(
				"attendance-overtime",
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
				{ header: "Labor Type", accessor: "workforceSource" },
				{ header: "Days with OT", accessor: "overtimeCount" },
				{
					header: "Total OT Hours",
					accessor: (employee) => employee.totalOvertimeHours.toFixed(2),
				},
			],
			rows: filteredMetricsEmployees,
			fileBaseName: buildReportFileName(
				"attendance-overtime",
				fromIso,
				"to",
				toIso,
				selectedDepartment !== "all" ? "department" : undefined,
				selectedDepartment !== "all" ? selectedDepartment : undefined,
				selectedManager !== "all" ? "manager" : undefined,
				selectedManager !== "all" ? selectedManager : undefined,
			),
			reportTitle: "Overtime Report",
			metadataLines: [
				`Period: ${fromIso || "-"} to ${toIso || "-"}`,
				"Filters: Current department and manager selections applied.",
			],
		});
	};

	const openExportModal = () => {
		if (!filteredMetricsEmployees.length) {
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

	return (
		<Card>
			<CardHeader>
				<CardTitle>Overtime Report</CardTitle>
				<CardDescription>
					Overtime hours tracking and analysis for the selected period
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
							<label className="block text-sm font-medium mb-1">Labor Type</label>
							<Select value={workforceSource} onValueChange={setWorkforceSource}>
								<SelectTrigger className="h-9 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm md:text-sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Labor</SelectItem>
									<SelectItem value="DIRECT">Direct</SelectItem>
									<SelectItem value="AGENCY">Agency</SelectItem>
								</SelectContent>
							</Select>
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
						<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">
										Employees with Overtime
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{metrics?.employeesWithOvertime || 0}
									</div>
									<p className="text-xs text-gray-500">Employees</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">
										Total Overtime Hours
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{metrics?.totalOvertimeHours?.toFixed(2) || 0}
									</div>
									<p className="text-xs text-gray-500">Hours</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">Direct OT</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{metrics?.split?.direct?.totalOvertimeHours?.toFixed(2) || 0}
									</div>
									<p className="text-xs text-gray-500">
										{metrics?.split?.direct?.employeesWithOvertime || 0} employees
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">Agency OT</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{metrics?.split?.agency?.totalOvertimeHours?.toFixed(2) || 0}
									</div>
									<p className="text-xs text-gray-500">
										{metrics?.split?.agency?.employeesWithOvertime || 0} employees
									</p>
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
										<th className="px-6 py-3 text-left font-medium">
											Labor Type
										</th>
										<th className="px-6 py-3 text-left font-medium">
											Days with OT
										</th>
										<th className="px-6 py-3 text-left font-medium">
											Total OT Hours
										</th>
									</tr>
								</thead>
								<tbody>
									{filteredMetricsEmployees.length > 0 ? (
										filteredMetricsEmployees.map((emp) => (
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
												<td className="px-6 py-3">{emp.workforceSource}</td>
												<td className="px-6 py-3">{emp.overtimeCount}</td>
												<td className="px-6 py-3">
													{emp.totalOvertimeHours.toFixed(2)} hrs
												</td>
											</tr>
										))
									) : (
										<tr>
											<td
												colSpan={6}
												className="px-6 py-8 text-center text-gray-500">
												No overtime records found for this period
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
				title="Export Overtime Report"
				description="Choose how to export the current overtime report."
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={[
					{
						format: "pdf",
						label: "Export PDF",
						helperText: "Download the current overtime rows as a PDF.",
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
