import { useEffect, useMemo, useState } from "react";
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import leaveCreditsService from "~/services/leave-credits.service";
import { parseLeaveCreditsCsv, type ParsedLeaveCreditRow } from "~/lib/leave-credits-upload";

function formatMetricLeaveType(value: string) {
	return humanizeEnumValue(value);
}

function formatPeriod(start?: string | Date | null, end?: string | Date | null) {
	if (!start && !end) return "-";
	if (start && end) return `${formatReportDate(start)} - ${formatReportDate(end)}`;
	return formatReportDate(start || end);
}

function executeLabel(execute: boolean) {
	return execute ? "Execute finished" : "Dry-run finished";
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
	const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
	const [uploadYear, setUploadYear] = useState(() => String(new Date().getFullYear()));
	const [uploadText, setUploadText] = useState("");
	const [uploadResults, setUploadResults] = useState<any>(null);
	const [uploadBusy, setUploadBusy] = useState(false);

	const parsedUploadRows = useMemo(
		() => parseLeaveCreditsCsv(uploadText),
		[uploadText],
	);

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
					lateInstances: (employee as any).tardiness?.lateInstances ?? 0,
					lateMinutes: (employee as any).tardiness?.lateMinutes ?? 0,
					undertimeInstances: (employee as any).tardiness?.undertimeInstances ?? 0,
					undertimeMinutes: (employee as any).tardiness?.undertimeMinutes ?? 0,
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
			{ header: "Late (min)", accessor: "lateMinutes" as const, align: "right" as const },
			{ header: "Late Days", accessor: "lateInstances" as const, align: "right" as const },
			{ header: "UT (min)", accessor: "undertimeMinutes" as const, align: "right" as const },
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

	const runUpload = async (execute: boolean) => {
		const rows: ParsedLeaveCreditRow[] = parsedUploadRows.rows;
		if (!rows.length) {
			toast.error(
				parsedUploadRows.errors[0] || "Paste or upload rows before continuing.",
			);
			return;
		}
		setUploadBusy(true);
		try {
			const result = await leaveCreditsService.bulkUpload({
				year: Number(uploadYear) || new Date().getFullYear(),
				execute,
				rows,
			});
			setUploadResults(result.data);
			if (execute) toast.success(result.message || "Leave credits uploaded.");
			else toast.info(result.message || "Dry-run finished.");
		} catch (error) {
			console.error(error);
			const message =
				error instanceof Error ? error.message : "Leave credits upload failed.";
			toast.error(message);
		} finally {
			setUploadBusy(false);
		}
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
			<Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
				<DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Annual leave credits bulk upload</DialogTitle>
						<DialogDescription>
							Paste CSV rows (employeeId, leaveType, totalEntitled) or choose a
							.csv file. Dry-run first; execute only after reviewing results.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="flex items-center gap-3">
							<label className="text-sm font-medium">Year</label>
							<Input
								type="number"
								className="w-28"
								value={uploadYear}
								onChange={(event) => setUploadYear(event.target.value)}
							/>
							<input
								type="file"
								accept=".csv,text/csv"
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (!file) return;
									const reader = new FileReader();
									reader.onload = () => setUploadText(String(reader.result || ""));
									reader.readAsText(file);
								}}
							/>
						</div>
						<textarea
							className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
							placeholder={"employeeId,leaveType,totalEntitled\ncmsp...,VACATION_LEAVE,10"}
							value={uploadText}
							onChange={(event) => setUploadText(event.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							Parsed: {parsedUploadRows.rows.length} row(s)
							{parsedUploadRows.errors.length > 0
								? ` · ${parsedUploadRows.errors.length} parse error(s): ${parsedUploadRows.errors.slice(0, 3).join("; ")}`
								: ""}
						</p>
						{uploadResults ? (
							<div className="rounded-md border p-2 text-xs space-y-1">
								<p>
									{executeLabel(uploadResults.execute)} —{" "}
									{uploadResults.wouldUpdate}/{uploadResults.total} rows
									{uploadResults.errors > 0
										? `, ${uploadResults.errors} error(s)`
										: ""}
								</p>
								<div className="max-h-40 overflow-y-auto">
									{uploadResults.results.map((row: any, index: number) => (
										<p key={index} className={row.ok ? "" : "text-red-600"}>
											{row.employeeId || "?"} / {row.leaveType}:{" "}
											{row.ok ? `ok (${row.action ?? "dry"})` : row.error}
										</p>
									))}
								</div>
							</div>
						) : null}
						<div className="flex justify-end gap-2">
							<Button variant="outline" onClick={() => setIsUploadModalOpen(false)}>
								Close
							</Button>
							<Button
								variant="outline"
								disabled={uploadBusy || parsedUploadRows.rows.length === 0}
								onClick={() => runUpload(false)}>
								Dry run
							</Button>
							<Button
								disabled={
									uploadBusy ||
									parsedUploadRows.rows.length === 0 ||
									!uploadResults ||
									uploadResults.execute
								}
								onClick={() => runUpload(true)}>
								Execute upload
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>				{/* Top Filters Bar - Single Line Toolbar */}
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
					<div className="shrink-0 w-[130px]">
						<label className="block text-[11px] font-medium text-neutral-500 mb-0.5">Manager</label>
						<Select
							value={selectedManager}
							onValueChange={(value) => {
								setSelectedManager(value);
								setSelectedEmployee("all");
							}}>
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
					<div className="shrink-0 w-[140px]">
						<label className="block text-[11px] font-medium text-neutral-500 mb-0.5">Employee</label>
						<Select
							value={selectedEmployee}
							onValueChange={(value) => {
								setSelectedEmployee(value);
							}}>
							<SelectTrigger className="h-8 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm">
								<SelectValue placeholder="All Employees" />
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
					<div className="shrink-0 w-[140px]">
						<label className="block text-[11px] font-medium text-neutral-500 mb-0.5">Leave Type</label>
						<Select value={selectedLeaveType} onValueChange={setSelectedLeaveType}>
							<SelectTrigger className="h-8 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm">
								<SelectValue placeholder="All Leave Types" />
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

					<div className="flex gap-1.5 shrink-0 items-end ml-auto">
						<Button
							variant="ghost"
							onClick={handleClearFilters}
							className="text-muted-foreground hover:text-foreground h-8 px-2.5 text-xs">
							Clear Filters
						</Button>
					</div>
				</div>

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
										Total Used Leaves
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-neutral-900">
										{totals.totalUsedLeaves.toFixed(2)}
									</div>
									<p className="text-[11px] text-muted-foreground">
										Days across filtered leave balances
									</p>
								</CardContent>
							</Card>
							<Card className="py-3 px-4 border-l-4 border-l-emerald-500">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">
										Avg Balance Remaining
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-emerald-700">
										{totals.avgBalanceRemaining.toFixed(2)}
									</div>
									<p className="text-[11px] text-muted-foreground">Days per leave entitlement</p>
								</CardContent>
							</Card>
							<Card className="py-3 px-4 border-l-4 border-l-amber-500">
								<CardHeader className="p-0 pb-1">
									<CardTitle className="text-xs font-medium text-muted-foreground">
										Zero Balance
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<div className="text-xl font-bold text-amber-600">
										{totals.employeesWithZeroBalance}
									</div>
									<p className="text-[11px] text-muted-foreground">Leave categories fully exhausted</p>
								</CardContent>
							</Card>
						</div>

						{/* Leave Type Summary Card */}
						<div className="border rounded-lg bg-white shadow-sm overflow-hidden">
							<div className="flex items-center justify-between p-3 bg-neutral-50/70 border-b border-neutral-200">
								<div className="flex items-center gap-2">
									<h3 className="text-xs font-semibold text-neutral-900">
										Leave Type Summary
									</h3>
									<span className="text-[10px] bg-neutral-200/80 text-neutral-700 font-semibold px-2 py-0.5 rounded">
										{leaveTypeSummary.length} Types
									</span>
								</div>
							</div>
							<div className="overflow-x-auto">
								<table className="w-full text-xs">
									<thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold text-[11px]">
										<tr>
											<th className="px-3 py-2 text-left">
												Leave Type
											</th>
											<th className="px-3 py-2 text-left">
												Employees
											</th>
											<th className="px-3 py-2 text-left">
												Avg Entitled
											</th>
											<th className="px-3 py-2 text-left">
												Avg Used
											</th>
											<th className="px-3 py-2 text-left">
												Avg Available
											</th>
											<th className="px-3 py-2 text-left">
												Utilization
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-neutral-100">
										{leaveTypeSummary.length > 0 ? (
											leaveTypeSummary.map((leave) => (
												<tr key={leave.leaveType} className="hover:bg-neutral-50/80 transition-colors">
													<td className="px-3 py-2 font-medium text-xs">
														{formatMetricLeaveType(leave.leaveType)}
													</td>
													<td className="px-3 py-2 text-xs">
														{leave.employeeCount}
													</td>
													<td className="px-3 py-2 text-xs">
														{leave.avgEntitled.toFixed(2)} days
													</td>
													<td className="px-3 py-2 text-xs">
														{leave.avgUsed.toFixed(2)} days
													</td>
													<td className="px-3 py-2 text-xs">
														{leave.avgAvailable.toFixed(2)} days
													</td>
													<td className="px-3 py-2 text-xs">
														{leave.utilizationRate.toFixed(2)}%
													</td>
												</tr>
											))
										) : (
											<tr>
												<td
													colSpan={6}
													className="px-4 py-8 text-center text-gray-500 text-xs">
													No leave type metrics found for this filter
												</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						</div>

						{/* Employee Detailed Balances Card */}
						<div className="border rounded-lg bg-white shadow-sm overflow-hidden">
							<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-neutral-50/70 border-b border-neutral-200">
								<div className="flex items-center gap-2">
									<h3 className="text-xs font-semibold text-neutral-900">
										Employee Leave Balances
									</h3>
									<span className="text-[10px] bg-neutral-200/80 text-neutral-700 font-semibold px-2 py-0.5 rounded">
										{employeeRows.length} Records
									</span>
								</div>

								{/* Actions in Table Header */}
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										className="h-8 text-xs px-2.5 shadow-sm bg-white hover:bg-neutral-50"
										onClick={() => setIsUploadModalOpen(true)}>
										Upload credits
									</Button>
									<Button
										variant="outline"
										className="h-8 text-xs px-3 shadow-sm bg-white hover:bg-neutral-50 gap-1.5 font-medium"
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
											<th className="px-3 py-2 text-left">
												Employee
											</th>
											<th className="px-3 py-2 text-left">
												Department
											</th>
											<th className="px-3 py-2 text-left">
												Leave Type
											</th>
											<th className="px-3 py-2 text-left">
												Entitled
											</th>
											<th className="px-3 py-2 text-left">
												Used
											</th>
											<th className="px-3 py-2 text-left">
												Pending
											</th>
											<th className="px-3 py-2 text-left">
												Available
											</th>
											<th className="px-3 py-2 text-right">
												Late (min)
											</th>
											<th className="px-3 py-2 text-right">
												Late Days
											</th>
											<th className="px-3 py-2 text-right">
												UT (min)
											</th>
											<th className="px-3 py-2 text-left">
												Period
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-neutral-100">
										{employeeRows.length > 0 ? (
											employeeRows.map((row, index) => (
												<tr
													key={`${row.employeeId}-${row.leaveType}-${index}`}
													className="hover:bg-neutral-50/80 transition-colors">
													<td className="px-3 py-2 text-xs font-medium">
														<ReportEmployeeCell
															rosterEmployees={allEmployees}
															employeeId={row.employeeId}
															fullName={row.employeeName}
														/>
													</td>
													<td className="px-3 py-2 text-xs text-neutral-700">{row.department}</td>
													<td className="px-3 py-2 text-xs">
														{formatMetricLeaveType(row.leaveType)}
													</td>
													<td className="px-3 py-2 text-xs">
														{row.totalEntitled.toFixed(2)}
													</td>
													<td className="px-3 py-2 text-xs">
														{row.used.toFixed(2)}
													</td>
													<td className="px-3 py-2 text-xs">
														{row.pending.toFixed(2)}
													</td>
													<td className="px-3 py-2 text-xs">
														{row.available.toFixed(2)}
													</td>
													<td className="px-3 py-2 text-right text-xs">
														{row.lateMinutes}
													</td>
													<td className="px-3 py-2 text-right text-xs">
														{row.lateInstances}
													</td>
													<td className="px-3 py-2 text-right text-xs">
														{row.undertimeMinutes}
													</td>
													<td className="px-3 py-2 text-xs text-neutral-500">
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
													colSpan={11}
													className="px-4 py-8 text-center text-gray-500 text-xs">
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
