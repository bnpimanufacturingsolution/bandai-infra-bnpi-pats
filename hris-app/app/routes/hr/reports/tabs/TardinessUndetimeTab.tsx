import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Download } from "lucide-react";
import { useTardinessMetrics } from "~/lib/hooks/useMetrics";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { REPORT_SCOPE_VALUES } from "~/lib/utils/report-scope";
import { buildReportFileName, exportRowsToCsv, exportRowsToPdf } from "~/lib/utils/report-export";
import { AttendanceReportFilterPopover } from "../components/AttendanceReportFilterPopover";
import { ReportExportDialog } from "../components/ReportExportDialog";
import { ReportEmployeeCell } from "../components/ReportEmployeeCell";
import { ReportTable } from "../components/ReportTable";
import { useReportScopeFilters } from "../useReportScopeFilters";
import { toast } from "sonner";

/**
 * Tardiness & Undertime Tab Component
 * Displays tardiness details, undertime hours, and overtime tracking
 */
export function TardinessUndetimeTab() {
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

	// Use same source as Attendance Management page
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

	const managerOptions = useMemo(
		() =>
			managers.map((emp: any) => {
				const firstName = emp.person?.personalInfo?.firstName || "";
				const lastName = emp.person?.personalInfo?.lastName || "";
				const label = `${firstName} ${lastName}`.trim() || emp.employeeId || emp.id;
				return { id: emp.id, label };
			}),
		[managers],
	);

	const activeFiltersCount = useMemo(() => {
		const now = new Date();
		const isDefaultScope =
			scope === REPORT_SCOPE_VALUES.MONTHLY &&
			Number(activeMonth) === now.getMonth() &&
			Number(activeYear) === now.getFullYear();

		let count = 0;
		if (!isDefaultScope) count += 1;
		if (selectedDepartment !== "all") count += 1;
		if (selectedManager !== "all") count += 1;
		return count;
	}, [activeMonth, activeYear, scope, selectedDepartment, selectedManager]);

	const { data, isLoading, error } = useTardinessMetrics(
		fromIso,
		toIso,
		selectedDepartment === "all" ? undefined : selectedDepartment,
	);

	const metrics = data?.metrics?.tardinessMetrics;

	const getManagerName = (employee: any) => {
		const firstName = employee?.reportTo?.person?.personalInfo?.firstName || "";
		const lastName = employee?.reportTo?.person?.personalInfo?.lastName || "";
		const fullName = `${firstName} ${lastName}`.trim();
		return fullName || "N/A";
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

	const filteredMetricsEmployees = useMemo(() => {
		const metricsEmployees = metrics?.employees || [];

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
	}, [allEmployees, metrics?.employees, selectedManager]);

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
				{ header: "Employee", accessor: "name" },
				{ header: "Department", accessor: "department" },
				{
					header: "Manager",
					accessor: (employee) => getManagerName(findSourceEmployee(employee)),
				},
				{ header: "Tardiness Count", accessor: "tardinessCount" },
				{ header: "Total Late Minutes", accessor: "totalLateMinutes" },
				{ header: "Average Late Minutes", accessor: "avgLateMinutes" },
				{ header: "Max Late Minutes", accessor: "maxLateMinutes" },
			],
			rows: filteredMetricsEmployees,
			fileBaseName: buildReportFileName(
				"attendance-tardiness",
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
				{ header: "Employee", accessor: "name" },
				{ header: "Department", accessor: "department" },
				{
					header: "Manager",
					accessor: (employee) => getManagerName(findSourceEmployee(employee)),
				},
				{ header: "Tardiness Count", accessor: "tardinessCount" },
				{ header: "Total Late Minutes", accessor: "totalLateMinutes" },
				{ header: "Average Late Minutes", accessor: "avgLateMinutes" },
				{ header: "Max Late Minutes", accessor: "maxLateMinutes" },
			],
			rows: filteredMetricsEmployees,
			fileBaseName: buildReportFileName(
				"attendance-tardiness",
				fromIso,
				"to",
				toIso,
				selectedDepartment !== "all" ? "department" : undefined,
				selectedDepartment !== "all" ? selectedDepartment : undefined,
				selectedManager !== "all" ? "manager" : undefined,
				selectedManager !== "all" ? selectedManager : undefined,
			),
			reportTitle: "Tardiness and Undertime Report",
			metadataLines: [
				`Period: ${fromIso || "-"} to ${toIso || "-"}`,
				"Filters: Current department and manager selections applied.",
			],
		});
	};

	const openExportModal = () => {
		if (!filteredMetricsEmployees.length) {
			toast.error("No tardiness rows available to export.");
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
	const tardinessTableColumns = [
		{
			key: "employee",
			header: "Employee",
			render: (row: (typeof filteredMetricsEmployees)[number]) => (
				<ReportEmployeeCell
					rosterEmployees={allEmployees}
					profileId={row.id}
					employeeId={row.employeeId}
					fullName={row.name}
				/>
			),
		},
		{
			key: "department",
			header: "Department",
			accessor: (row: (typeof filteredMetricsEmployees)[number]) => row.department,
		},
		{
			key: "manager",
			header: "Manager",
			accessor: (row: (typeof filteredMetricsEmployees)[number]) =>
				getManagerName(findSourceEmployee(row)),
		},
		{
			key: "tardinessCount",
			header: "Tardiness Count",
			accessor: (row: (typeof filteredMetricsEmployees)[number]) => row.tardinessCount,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "totalLateMinutes",
			header: "Total Late Minutes",
			accessor: (row: (typeof filteredMetricsEmployees)[number]) => row.totalLateMinutes,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "averageLateMinutes",
			header: "Average Late Minutes",
			accessor: (row: (typeof filteredMetricsEmployees)[number]) => row.avgLateMinutes,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "maximumLateMinutes",
			header: "Maximum Late Minutes",
			accessor: (row: (typeof filteredMetricsEmployees)[number]) => row.maxLateMinutes,
			align: "right" as const,
			valueType: "number" as const,
		},
	];

	return (
		<Card>
			<CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0 space-y-1.5">
					<CardTitle>Tardiness & Undertime Report</CardTitle>
					<CardDescription>
						Tardiness details with time variance, undertime tracking, and overtime hours
					</CardDescription>
				</div>
				<div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">
					<AttendanceReportFilterPopover
						scope={scope}
						activeMonth={activeMonth}
						activeYear={activeYear}
						yearOptions={yearOptions}
						dateRange={dateRange}
						onScopeChange={setScope}
						onMonthChange={setMonth}
						onYearChange={setYear}
						onDateRangeChange={setDateRange}
						departments={departments}
						selectedDepartment={selectedDepartment}
						onDepartmentChange={(value) => {
							setSelectedDepartment(value);
							setSelectedManager("all");
						}}
						managerOptions={managerOptions}
						selectedManager={selectedManager}
						onManagerChange={setSelectedManager}
						activeFiltersCount={activeFiltersCount}
						onClearAll={handleClearFilters}
						testIdPrefix="tardiness-report"
					/>
					<Button variant="outline" className="h-9" onClick={openExportModal}>
						<Download className="w-4 h-4 mr-2" />
						Export
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Stats Cards */}
				{isLoading ? (
					<div className="text-center py-8 text-gray-500">Loading metrics...</div>
				) : error ? (
					<div className="text-center py-8 text-red-500">
						Error loading metrics: {error.message}
					</div>
				) : (
					<>
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
							<div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 shadow-sm">
								<div className="min-w-0">
									<p className="text-xs font-medium text-muted-foreground">
										Total Tardiness
									</p>
									<p className="text-[11px] text-muted-foreground/80">Instances</p>
								</div>
								<p className="text-xl font-semibold tabular-nums leading-none">
									{metrics?.totalTardinessInstances || 0}
								</p>
							</div>
							<div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 shadow-sm">
								<div className="min-w-0">
									<p className="text-xs font-medium text-muted-foreground">
										Total Undertime
									</p>
									<p className="text-[11px] text-muted-foreground/80">Hours</p>
								</div>
								<p className="text-xl font-semibold tabular-nums leading-none">
									{metrics?.totalUndertimeHours?.toFixed(2) || 0}
								</p>
							</div>
						</div>

						{/* Tabs for different views */}
						<div className="space-y-4">
							<div className="flex gap-2 border-b">
								<button className="px-4 py-2 border-b-2 border-blue-500 font-medium text-sm">
									Tardiness Details
								</button>
								<button className="px-4 py-2 text-gray-600 font-medium text-sm hover:text-gray-800">
									Undertime Details
								</button>
							</div>

							{/* Tardiness Table */}
							<ReportTable
								columns={tardinessTableColumns}
								rows={filteredMetricsEmployees}
								getRowKey={(row) => row.id}
								emptyMessage="No tardiness records found for this period"
							/>
						</div>
					</>
				)}
			</CardContent>
			<ReportExportDialog
				title="Export Tardiness Report"
				description="Choose how to export the current tardiness and undertime rows."
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={[
					{
						format: "pdf",
						label: "Export PDF",
						helperText: "Download the current tardiness report as a PDF.",
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
