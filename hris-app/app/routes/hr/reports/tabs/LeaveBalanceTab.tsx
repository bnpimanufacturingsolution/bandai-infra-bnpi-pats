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
import { toast } from "sonner";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import { useLeaveBalanceMetrics } from "~/lib/hooks/useMetrics";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useSections } from "~/lib/hooks/useSections";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	buildReportFileName,
	exportReport,
	formatReportDate,
	getReportGeneratedByName,
	humanizeEnumValue,
} from "~/lib/utils/report-export";
import { ReportExportDialog } from "../components/ReportExportDialog";
import { ReportEmployeeCell } from "../components/ReportEmployeeCell";
import { ReportScopeDateFilters } from "../components/ReportScopeDateFilters";
import { useReportScopeFilters } from "../useReportScopeFilters";

function formatMetricLeaveType(value: string) {
	return humanizeEnumValue(value);
}

function formatPeriod(start?: string | Date | null, end?: string | Date | null) {
	if (!start && !end) return "-";
	if (start && end) return `${formatReportDate(start)} - ${formatReportDate(end)}`;
	return formatReportDate(start || end);
}

/**
 * Leave Balance Tab Component
 * Displays API-backed leave balance tracking and summaries
 */
export function LeaveBalanceTab() {
	const { user } = useAuth();
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
	const [selectedSection, setSelectedSection] = useState(
		() => searchParams.get("sectionId") || "all",
	);
	const [selectedManager, setSelectedManager] = useState(
		() => searchParams.get("reportToId") || "all",
	);
	const [selectedEmployee, setSelectedEmployee] = useState(
		() => searchParams.get("employeeId") || "all",
	);
	const [selectedLeaveType, setSelectedLeaveType] = useState(
		() => searchParams.get("leaveType") || "all",
	);
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);

	const { data: departmentsData } = useDepartments({ limit: 1000 });
	const departments = departmentsData?.departments || [];
	const { data: sectionsData } = useSections({ limit: 1000, sort: "name", order: "asc" });
	const sections = sectionsData?.sections || [];

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
		return allEmployees.filter((emp: any) => {
			const matchesDepartment =
				selectedDepartment === "all" || emp.department?.id === selectedDepartment;
			const matchesSection =
				selectedSection === "all" ||
				emp.section?.id === selectedSection ||
				emp.sectionId === selectedSection;
			return matchesDepartment && matchesSection;
		});
	}, [allEmployees, selectedDepartment, selectedSection]);

	const employees = useMemo(() => {
		let result = allEmployees;
		if (selectedDepartment !== "all") {
			result = result.filter((emp: any) => emp.department?.id === selectedDepartment);
		}
		if (selectedSection !== "all") {
			result = result.filter(
				(emp: any) => emp.section?.id === selectedSection || emp.sectionId === selectedSection,
			);
		}
		if (selectedManager !== "all") {
			result = result.filter((emp: any) => emp.reportTo?.id === selectedManager);
		}
		return result;
	}, [allEmployees, selectedDepartment, selectedManager, selectedSection]);

	const periodFrom = fromIso;
	const periodTo = toIso;

	const { data, isLoading, error } = useLeaveBalanceMetrics({
		...(selectedDepartment !== "all" ? { departmentId: selectedDepartment } : {}),
		...(selectedSection !== "all" ? { sectionId: selectedSection } : {}),
		...(selectedManager !== "all" ? { reportToId: selectedManager } : {}),
		...(selectedEmployee !== "all" ? { employeeId: selectedEmployee } : {}),
		...(selectedLeaveType !== "all" ? { leaveType: selectedLeaveType } : {}),
		...(periodFrom ? { periodFrom } : {}),
		...(periodTo ? { periodTo } : {}),
	});

	const metrics = data?.metrics?.leaveBalanceMetrics;
	const leaveTypeSummary = metrics?.leaveTypeSummary || [];
	const leaveTypeOptions = useMemo(() => {
		const set = new Set<string>(leaveTypeSummary.map((item) => item.leaveType).filter(Boolean));
		return Array.from(set).sort((a, b) => a.localeCompare(b));
	}, [leaveTypeSummary]);

	const employeeRows = useMemo(
		() =>
			(metrics?.employees || []).flatMap((employee) =>
				employee.leaveBalances.map((balance) => ({
					employeeId: employee.employeeId,
					employeeName: employee.name,
					department: employee.department,
					leaveType: balance.leaveType,
					totalEntitled: balance.totalEntitled,
					used: balance.used,
					pending: balance.pending,
					available: balance.available,
					carriedOver: balance.carriedOver,
					periodStart: balance.periodStart,
					periodEnd: balance.periodEnd,
				})),
			),
		[metrics?.employees],
	);

	const totals = useMemo(() => {
		const totalUsedLeaves = employeeRows.reduce((sum, row) => sum + (row.used || 0), 0);
		const totalAvailable = employeeRows.reduce((sum, row) => sum + (row.available || 0), 0);
		const avgBalanceRemaining =
			employeeRows.length > 0 ? totalAvailable / employeeRows.length : 0;
		const zeroBalanceEmployees = new Set(
			employeeRows.filter((row) => row.available <= 0).map((row) => row.employeeId),
		);

		return {
			totalUsedLeaves,
			avgBalanceRemaining,
			employeesWithZeroBalance: zeroBalanceEmployees.size,
		};
	}, [employeeRows]);
	const fileBaseName = buildReportFileName(
		"attendance-leave-balance",
		periodFrom,
		"to",
		periodTo,
		selectedDepartment !== "all" ? "department" : undefined,
		selectedDepartment !== "all" ? selectedDepartment : undefined,
		selectedSection !== "all" ? "section" : undefined,
		selectedSection !== "all" ? selectedSection : undefined,
		selectedManager !== "all" ? "manager" : undefined,
		selectedManager !== "all" ? selectedManager : undefined,
		selectedEmployee !== "all" ? "employee" : undefined,
		selectedEmployee !== "all" ? selectedEmployee : undefined,
		selectedLeaveType !== "all" ? "leave-type" : undefined,
		selectedLeaveType !== "all" ? selectedLeaveType : undefined,
	);

	const handleClearFilters = () => {
		setSelectedDepartment("all");
		setSelectedSection("all");
		setSelectedManager("all");
		setSelectedEmployee("all");
		setSelectedLeaveType("all");
		clearScopeFilters();
	};

	useEffect(() => {
		const nextSearchParams = new URLSearchParams(searchParams);

		if (selectedDepartment !== "all") {
			nextSearchParams.set("departmentId", selectedDepartment);
		} else {
			nextSearchParams.delete("departmentId");
		}

		if (selectedSection !== "all") {
			nextSearchParams.set("sectionId", selectedSection);
		} else {
			nextSearchParams.delete("sectionId");
		}

		if (selectedManager !== "all") {
			nextSearchParams.set("reportToId", selectedManager);
		} else {
			nextSearchParams.delete("reportToId");
		}

		if (selectedEmployee !== "all") {
			nextSearchParams.set("employeeId", selectedEmployee);
		} else {
			nextSearchParams.delete("employeeId");
		}

		if (selectedLeaveType !== "all") {
			nextSearchParams.set("leaveType", selectedLeaveType);
		} else {
			nextSearchParams.delete("leaveType");
		}

		if (nextSearchParams.toString() !== searchParams.toString()) {
			setSearchParams(nextSearchParams, { replace: true });
		}
	}, [
		dateRange,
		searchParams,
		selectedDepartment,
		selectedEmployee,
		selectedLeaveType,
		selectedManager,
		selectedSection,
		setSearchParams,
	]);

	const exportConfig = {
		reportKey: "leave-balance-report",
		title: "Leave Balance Report",
		fileBaseName,
		rows: employeeRows,
		columns: [
			{ header: "Employee ID", accessor: "employeeId" as const },
			{ header: "Employee Name", accessor: "employeeName" as const },
			{ header: "Department", accessor: "department" as const },
			{
				header: "Leave Type",
				accessor: (row: (typeof employeeRows)[number]) =>
					formatMetricLeaveType(row.leaveType),
			},
			{ header: "Entitled", accessor: "totalEntitled" as const, align: "right" as const },
			{ header: "Used", accessor: "used" as const, align: "right" as const },
			{ header: "Pending", accessor: "pending" as const, align: "right" as const },
			{ header: "Available", accessor: "available" as const, align: "right" as const },
			{ header: "Carry Over", accessor: "carriedOver" as const, align: "right" as const },
		],
		filtersSummary: [
			{
				label: "Date Range",
				value: `${formatReportDate(periodFrom)} - ${formatReportDate(periodTo)}`,
			},
			{
				label: "Department",
				value:
					selectedDepartment === "all"
						? "All"
						: departments.find((dept: any) => dept.id === selectedDepartment)?.name ||
							selectedDepartment,
			},
			{
				label: "Manager",
				value:
					selectedManager === "all"
						? "All"
						: employees.find((employee: any) => employee.id === selectedManager)
							? `${employees.find((employee: any) => employee.id === selectedManager)?.person?.personalInfo?.firstName || ""} ${employees.find((employee: any) => employee.id === selectedManager)?.person?.personalInfo?.lastName || ""}`.trim()
							: selectedManager,
			},
			{
				label: "Employee",
				value:
					selectedEmployee === "all"
						? "All"
						: employees.find((employee: any) => employee.id === selectedEmployee)
							? `${employees.find((employee: any) => employee.id === selectedEmployee)?.person?.personalInfo?.firstName || ""} ${employees.find((employee: any) => employee.id === selectedEmployee)?.person?.personalInfo?.lastName || ""}`.trim()
							: selectedEmployee,
			},
			{
				label: "Leave Type",
				value:
					selectedLeaveType === "all" ? "All" : formatMetricLeaveType(selectedLeaveType),
			},
		],
		summaryRows: [
			{ label: "Rows", value: employeeRows.length },
			{ label: "Total Used", value: totals.totalUsedLeaves.toFixed(2) },
			{ label: "Average Available", value: totals.avgBalanceRemaining.toFixed(2) },
			{ label: "Employees With Zero Balance", value: totals.employeesWithZeroBalance },
		],
		grouping: [
			{
				id: "employee",
				label: "Employee",
				getValue: (row: (typeof employeeRows)[number]) => row.employeeName,
			},
		],
		generatedBy: getReportGeneratedByName(user),
	};

	const openExportModal = () => {
		if (!employeeRows.length) {
			toast.error("No leave balance rows available to export.");
			return;
		}

		setIsExportModalOpen(true);
	};

	const handleExport = async (
		format: "pdf" | "csv",
		exportState: { includeFiltersSummary: boolean; groupBy?: string },
	) => {
		await exportReport({
			format,
			config: exportConfig,
			options: exportState,
		});
		setIsExportModalOpen(false);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Leave Balance Report</CardTitle>
				<CardDescription>
					Leave balance tracking, usage, and available balances for the selected period
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
								sections={sections}
								departmentId={selectedDepartment}
								sectionId={selectedSection}
								onDepartmentChange={(value) => {
									setSelectedDepartment(value);
									setSelectedSection("all");
									setSelectedManager("all");
									setSelectedEmployee("all");
								}}
								onSectionChange={(departmentId, sectionId) => {
									setSelectedDepartment(departmentId);
									setSelectedSection(sectionId);
									setSelectedManager("all");
									setSelectedEmployee("all");
								}}
							/>
						</div>
						<div className="w-full md:w-[160px]">
							<label className="block text-sm font-medium mb-1">Manager</label>
							<Select
								value={selectedManager}
								onValueChange={(value) => {
									setSelectedManager(value);
									setSelectedEmployee("all");
								}}>
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
						<div className="w-full md:w-[180px]">
							<label className="block text-sm font-medium mb-1">Employee</label>
							<Select
								value={selectedEmployee}
								onValueChange={(value) => {
									setSelectedEmployee(value);
								}}>
								<SelectTrigger className="h-9 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm md:text-sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Employees</SelectItem>
									{employees.map((emp: any) => (
										<SelectItem key={`employee-${emp.id}`} value={emp.id}>
											{emp.person?.personalInfo?.firstName}{" "}
											{emp.person?.personalInfo?.lastName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="w-full md:w-[180px]">
							<label className="block text-sm font-medium mb-1">Leave Type</label>
							<Select value={selectedLeaveType} onValueChange={setSelectedLeaveType}>
								<SelectTrigger className="h-9 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm md:text-sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Leave Types</SelectItem>
									{leaveTypeOptions.map((type) => (
										<SelectItem key={type} value={type}>
											{formatMetricLeaveType(type)}
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
										Total Used Leaves
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{totals.totalUsedLeaves.toFixed(2)}
									</div>
									<p className="text-xs text-gray-500">
										Days across filtered leave balances
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">
										Avg Balance Remaining
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{totals.avgBalanceRemaining.toFixed(2)}
									</div>
									<p className="text-xs text-gray-500">
										Days per leave balance entry
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">
										Employees w/ 0 Balance
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{totals.employeesWithZeroBalance}
									</div>
									<p className="text-xs text-gray-500">
										Employees with at least one depleted balance
									</p>
								</CardContent>
							</Card>
						</div>

						<div className="space-y-4">
							<div className="border rounded-lg overflow-hidden">
								<table className="w-full text-sm">
									<thead className="bg-gray-100">
										<tr>
											<th className="px-6 py-3 text-left font-medium">
												Leave Type
											</th>
											<th className="px-6 py-3 text-left font-medium">
												Employees
											</th>
											<th className="px-6 py-3 text-left font-medium">
												Avg Entitled
											</th>
											<th className="px-6 py-3 text-left font-medium">
												Avg Used
											</th>
											<th className="px-6 py-3 text-left font-medium">
												Avg Available
											</th>
											<th className="px-6 py-3 text-left font-medium">
												Utilization
											</th>
										</tr>
									</thead>
									<tbody>
										{leaveTypeSummary.length > 0 ? (
											leaveTypeSummary.map((leave) => (
												<tr key={leave.leaveType} className="border-t">
													<td className="px-6 py-3 font-medium">
														{formatMetricLeaveType(leave.leaveType)}
													</td>
													<td className="px-6 py-3">
														{leave.employeeCount}
													</td>
													<td className="px-6 py-3">
														{leave.avgEntitled.toFixed(2)} days
													</td>
													<td className="px-6 py-3">
														{leave.avgUsed.toFixed(2)} days
													</td>
													<td className="px-6 py-3">
														{leave.avgAvailable.toFixed(2)} days
													</td>
													<td className="px-6 py-3">
														{leave.utilizationRate.toFixed(2)}%
													</td>
												</tr>
											))
										) : (
											<tr>
												<td
													colSpan={6}
													className="px-6 py-8 text-center text-gray-500">
													No leave type metrics found for this filter
												</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						</div>

						<div className="space-y-4">
							<div className="border rounded-lg overflow-hidden">
								<table className="w-full text-sm">
									<thead className="bg-gray-100">
										<tr>
											<th className="px-6 py-3 text-left font-medium">
												Employee
											</th>
											<th className="px-6 py-3 text-left font-medium">
												Department
											</th>
											<th className="px-6 py-3 text-left font-medium">
												Leave Type
											</th>
											<th className="px-6 py-3 text-left font-medium">
												Entitled
											</th>
											<th className="px-6 py-3 text-left font-medium">
												Used
											</th>
											<th className="px-6 py-3 text-left font-medium">
												Pending
											</th>
											<th className="px-6 py-3 text-left font-medium">
												Available
											</th>
											<th className="px-6 py-3 text-left font-medium">
												Period
											</th>
										</tr>
									</thead>
									<tbody>
										{employeeRows.length > 0 ? (
											employeeRows.map((row, index) => (
												<tr
													key={`${row.employeeId}-${row.leaveType}-${index}`}
													className="border-t">
													<td className="px-6 py-3 font-medium">
														<ReportEmployeeCell
															rosterEmployees={allEmployees}
															employeeId={row.employeeId}
															fullName={row.employeeName}
														/>
													</td>
													<td className="px-6 py-3">{row.department}</td>
													<td className="px-6 py-3">
														{formatMetricLeaveType(row.leaveType)}
													</td>
													<td className="px-6 py-3">
														{row.totalEntitled.toFixed(2)}
													</td>
													<td className="px-6 py-3">
														{row.used.toFixed(2)}
													</td>
													<td className="px-6 py-3">
														{row.pending.toFixed(2)}
													</td>
													<td className="px-6 py-3">
														{row.available.toFixed(2)}
													</td>
													<td className="px-6 py-3">
														{formatPeriod(
															row.periodStart,
															row.periodEnd,
														)}
													</td>
												</tr>
											))
										) : (
											<tr>
												<td
													colSpan={8}
													className="px-6 py-8 text-center text-gray-500">
													No leave balance records found for this filter
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
			<ReportExportDialog
				title="Export Leave Balance Report"
				description="Choose how to export the current leave balance report."
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				showIncludeFiltersToggle
				groupingOptions={[
					{
						id: "employee",
						label: "Employee",
					},
				]}
				options={[
					{
						format: "pdf",
						label: "Export PDF",
						helperText: "Download the current leave balance rows as a PDF.",
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
