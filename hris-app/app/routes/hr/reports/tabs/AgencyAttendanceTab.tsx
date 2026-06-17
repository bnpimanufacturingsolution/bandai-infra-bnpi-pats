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
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useAgencyAttendanceSummary } from "~/lib/hooks/useMetrics";
import { buildReportFileName, exportRowsToCsv, exportRowsToPdf } from "~/lib/utils/report-export";
import { ReportExportDialog } from "../components/ReportExportDialog";
import { ReportTable } from "../components/ReportTable";
import { ReportScopeDateFilters } from "../components/ReportScopeDateFilters";
import { useReportScopeFilters } from "../useReportScopeFilters";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export function AgencyAttendanceTab() {
	const navigate = useNavigate();
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

	const { data, isLoading, error } = useAgencyAttendanceSummary(
		fromIso,
		toIso,
		selectedDepartment === "all" ? undefined : selectedDepartment,
		selectedManager === "all" ? undefined : selectedManager,
	);

	const metrics = data?.metrics?.agencyAttendanceSummary;
	const items = metrics?.items || [];

	const summary = items.reduce(
		(acc, item) => {
			acc.totalAgencyEmployees += item.totalAgencyEmployees;
			acc.scheduledWorkDays += item.scheduledWorkDays;
			acc.activeManpower += item.activeManpower;
			acc.noWorkReportCount += item.noWorkReportCount;
			acc.leaveCount += item.leaveCount;
			return acc;
		},
		{
			totalAgencyEmployees: 0,
			scheduledWorkDays: 0,
			activeManpower: 0,
			noWorkReportCount: 0,
			leaveCount: 0,
		},
	);

	const handleClearFilters = () => {
		setSelectedDepartment("all");
		setSelectedManager("all");
		clearScopeFilters();
	};

	const exportCsv = () => {
		exportRowsToCsv({
			columns: [
				{ header: "Agency", accessor: "agency" },
				{ header: "Total Agency Employees", accessor: "totalAgencyEmployees" },
				{ header: "Scheduled Work Days", accessor: "scheduledWorkDays" },
				{ header: "Active Manpower", accessor: "activeManpower" },
				{ header: "No Work Report Count", accessor: "noWorkReportCount" },
				{ header: "Leave Count", accessor: "leaveCount" },
				{
					header: "Attendance Rate",
					accessor: (item) => `${item.attendanceRate.toFixed(2)}%`,
				},
			],
			rows: items,
			fileBaseName: buildReportFileName(
				"workforce-agency-attendance",
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
				{ header: "Agency", accessor: "agency" },
				{ header: "Total Agency Employees", accessor: "totalAgencyEmployees" },
				{ header: "Scheduled Work Days", accessor: "scheduledWorkDays" },
				{ header: "Active Manpower", accessor: "activeManpower" },
				{ header: "No Work Report Count", accessor: "noWorkReportCount" },
				{ header: "Leave Count", accessor: "leaveCount" },
				{
					header: "Attendance Rate",
					accessor: (item) => `${item.attendanceRate.toFixed(2)}%`,
				},
			],
			rows: items,
			fileBaseName: buildReportFileName(
				"workforce-agency-attendance",
				fromIso,
				"to",
				toIso,
				selectedDepartment !== "all" ? "department" : undefined,
				selectedDepartment !== "all" ? selectedDepartment : undefined,
				selectedManager !== "all" ? "manager" : undefined,
				selectedManager !== "all" ? selectedManager : undefined,
			),
			reportTitle: "Agency Attendance Report",
			metadataLines: [
				`Period: ${fromIso || "-"} to ${toIso || "-"}`,
				"Filters: Current department and manager selections applied.",
			],
		});
	};

	const openExportModal = () => {
		if (!items.length) {
			toast.error("No agency attendance rows available to export.");
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

	const handleOpenAgencyEmployees = (agencyName: string) => {
		if (!agencyName || agencyName === "N/A") return;
		const params = new URLSearchParams({
			view: "list",
			workforceSource: "AGENCY",
			agency: agencyName,
		});
		navigate(`/hr/employees?${params.toString()}`);
	};
	const agencyAttendanceColumns = [
		{
			key: "agency",
			header: "Agency",
			render: (row: (typeof items)[number]) => (
				<button
					type="button"
					onClick={() => handleOpenAgencyEmployees(row.agency)}
					className="text-left font-medium text-blue-600 hover:underline">
					{row.agency}
				</button>
			),
		},
		{
			key: "employees",
			header: "Total Agency Employees",
			accessor: (row: (typeof items)[number]) => row.totalAgencyEmployees,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "scheduledWorkDays",
			header: "Scheduled Work Days",
			accessor: (row: (typeof items)[number]) => row.scheduledWorkDays,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "activeManpower",
			header: "Active Manpower",
			accessor: (row: (typeof items)[number]) => row.activeManpower,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "noWorkCount",
			header: "No Work Report Count",
			accessor: (row: (typeof items)[number]) => row.noWorkReportCount,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "leaveCount",
			header: "Leave Count",
			accessor: (row: (typeof items)[number]) => row.leaveCount,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "attendanceRate",
			header: "Attendance Rate",
			render: (row: (typeof items)[number]) => `${row.attendanceRate.toFixed(2)}%`,
			align: "right" as const,
		},
	];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Agency Attendance Report</CardTitle>
				<CardDescription>
					Attendance summary grouped by employee employer or agency for the selected range
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
						<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">
										Total Agencies
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{metrics?.totalAgencies || 0}
									</div>
									<p className="text-xs text-gray-500">Distinct employers</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">
										Agency Employees
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{summary.totalAgencyEmployees}
									</div>
									<p className="text-xs text-gray-500">Total grouped employees</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">
										Active Manpower
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{summary.activeManpower}
									</div>
									<p className="text-xs text-gray-500">Worked scheduled days</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">
										No-Work Count
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{summary.noWorkReportCount}
									</div>
									<p className="text-xs text-gray-500">Missing attendance days</p>
								</CardContent>
							</Card>
						</div>

						<ReportTable
							columns={agencyAttendanceColumns}
							rows={items}
							getRowKey={(row) => row.agency}
							emptyMessage="No agency attendance records found for this range"
						/>
					</>
				)}
			</CardContent>
			<ReportExportDialog
				title="Export Agency Attendance Report"
				description="Choose how to export the current agency attendance report."
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={[
					{
						format: "pdf",
						label: "Export PDF",
						helperText: "Download the current agency attendance rows as a PDF.",
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
