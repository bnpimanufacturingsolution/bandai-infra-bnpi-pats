import { useEffect, useMemo, useState } from "react";
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
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useNoWorkReport } from "~/lib/hooks/useMetrics";
import { buildReportFileName, exportRowsToCsv, exportRowsToPdf } from "~/lib/utils/report-export";
import { ReportExportDialog } from "../components/ReportExportDialog";
import { ReportEmployeeCell } from "../components/ReportEmployeeCell";
import { ReportScopeDateFilters } from "../components/ReportScopeDateFilters";
import { useReportScopeFilters } from "../useReportScopeFilters";
import { toast } from "sonner";

export function NoWorkReportTab() {
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
	const [selectedDepartment, setSelectedDepartment] = useState(
		() => searchParams.get("departmentId") || "all",
	);
	const [selectedManager, setSelectedManager] = useState(
		() => searchParams.get("reportToId") || "all",
	);
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

	const effectiveDateString = toIso || fromIso;

	const { data, isLoading, error } = useNoWorkReport(
		effectiveDateString,
		selectedDepartment === "all" ? undefined : selectedDepartment,
		selectedManager === "all" ? undefined : selectedManager,
	);

	const metrics = data?.metrics?.noWorkReport;
	const employees = metrics?.employees || [];

	const getManagerName = (employeeRow: { employeeId: string; id: string; name: string }) => {
		const sourceEmployee = allEmployees.find(
			(employee: any) =>
				employee.id === employeeRow.id ||
				employee.employeeId === employeeRow.employeeId ||
				`${employee.person?.personalInfo?.firstName || ""} ${employee.person?.personalInfo?.lastName || ""}`
					.trim()
					.toLowerCase() === employeeRow.name.toLowerCase(),
		);

		const firstName = sourceEmployee?.reportTo?.person?.personalInfo?.firstName || "";
		const lastName = sourceEmployee?.reportTo?.person?.personalInfo?.lastName || "";
		const fullName = `${firstName} ${lastName}`.trim();
		return fullName || "N/A";
	};

	const handleClearFilters = () => {
		setSelectedDepartment("all");
		setSelectedManager("all");
		clearScopeFilters();
	};

	useEffect(() => {
		const nextSearchParams = new URLSearchParams(searchParams);

		if (selectedDepartment !== "all") {
			nextSearchParams.set("departmentId", selectedDepartment);
		} else {
			nextSearchParams.delete("departmentId");
		}

		if (selectedManager !== "all") {
			nextSearchParams.set("reportToId", selectedManager);
		} else {
			nextSearchParams.delete("reportToId");
		}

		if (nextSearchParams.toString() !== searchParams.toString()) {
			setSearchParams(nextSearchParams, { replace: true });
		}
	}, [dateRange, searchParams, selectedDepartment, selectedManager, setSearchParams]);

	const exportCsv = () => {
		exportRowsToCsv({
			columns: [
				{ header: "Employee ID", accessor: "employeeId" },
				{ header: "Name", accessor: "name" },
				{ header: "Department", accessor: "department" },
				{ header: "Manager", accessor: (employee) => getManagerName(employee) },
				{ header: "Position", accessor: "position" },
				{ header: "Status", accessor: (employee) => employee.status || "NO_WORK_REPORT" },
			],
			rows: employees,
			fileBaseName: buildReportFileName(
				"workforce-no-work",
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
				{ header: "Manager", accessor: (employee) => getManagerName(employee) },
				{ header: "Position", accessor: "position" },
				{ header: "Status", accessor: (employee) => employee.status || "NO_WORK_REPORT" },
			],
			rows: employees,
			fileBaseName: buildReportFileName(
				"workforce-no-work",
				fromIso,
				"to",
				toIso,
				selectedDepartment !== "all" ? "department" : undefined,
				selectedDepartment !== "all" ? selectedDepartment : undefined,
				selectedManager !== "all" ? "manager" : undefined,
				selectedManager !== "all" ? selectedManager : undefined,
			),
			reportTitle: "No-Work Report",
			metadataLines: [
				`Period: ${fromIso || "-"} to ${toIso || "-"}`,
				`Report day: ${effectiveDateString || "-"}`,
			],
		});
	};

	const openExportModal = () => {
		if (!employees.length) {
			toast.error("No no-work rows available to export.");
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
				<CardTitle>No-Work Report</CardTitle>
				<CardDescription>
					Employees scheduled to work but with no attendance record on the report day
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
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
										No-Work Count
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{metrics?.noWorkCount || 0}
									</div>
									<p className="text-xs text-gray-500">
										Employees with no record
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">
										Employees Considered
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{metrics?.totalEmployeesConsidered || 0}
									</div>
									<p className="text-xs text-gray-500">Eligible workforce pool</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">
										Report Day
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{effectiveDateString || "N/A"}
									</div>
									<p className="text-xs text-gray-500">Uses range end date</p>
								</CardContent>
							</Card>
						</div>

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
											Position
										</th>
										<th className="px-6 py-3 text-left font-medium">Status</th>
									</tr>
								</thead>
								<tbody>
									{employees.length > 0 ? (
										employees.map((employee) => (
										<tr key={employee.id} className="border-t">
												<td className="px-6 py-3">{employee.employeeId}</td>
												<td className="px-6 py-3 font-medium">
													<ReportEmployeeCell
														rosterEmployees={allEmployees}
														employeeId={employee.employeeId}
														fullName={employee.name}
													/>
												</td>
												<td className="px-6 py-3">{employee.department}</td>
												<td className="px-6 py-3">
													{getManagerName(employee)}
												</td>
												<td className="px-6 py-3">{employee.position}</td>
												<td className="px-6 py-3">
													<span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-medium">
														{employee.status || "NO_WORK_REPORT"}
													</span>
												</td>
											</tr>
										))
									) : (
										<tr>
											<td
												colSpan={6}
												className="px-6 py-8 text-center text-gray-500">
												No no-work records found for this report day
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
				title="Export No-Work Report"
				description="Choose how to export the current no-work report."
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={[
					{
						format: "pdf",
						label: "Export PDF",
						helperText: "Download the current no-work rows as a PDF.",
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
