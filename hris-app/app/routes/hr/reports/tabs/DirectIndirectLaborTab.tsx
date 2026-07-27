import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useDirectIndirectLaborSummary } from "~/lib/hooks/useMetrics";
import {
	buildManpowerEmployeeListPath,
	type ManpowerEmployeeListLinkInput,
} from "~/lib/utils/manpower-distribution-links";
import {
	buildReportFileName,
	exportReport,
	type ReportExportColumn,
	type ReportExportFormat,
} from "~/lib/utils/report-export";
import type { Department } from "~/services/departments.service";
import type { Employee } from "~/services/employees.service";
import { ReportExportDialog } from "../components/ReportExportDialog";
import { ReportTable } from "../components/ReportTable";
import { ReportScopeDateFilters } from "../components/ReportScopeDateFilters";
import { useReportScopeFilters } from "../useReportScopeFilters";

type GenderRow = {
	department: string;
	departmentId: string | null;
	female: number;
	male: number;
	unknown: number;
	total: number;
	direct: number;
	indirect: number;
};

type AgencyRow = {
	agency: string;
	female: number;
	male: number;
	unknown: number;
	headcount: number;
	departments: number;
	sections: number;
};

type DirectIndirectHeadcountRow = {
	department: string;
	departmentId: string | null;
	section: string;
	sectionId: string | null;
	direct: number;
	indirect: number;
	total: number;
};

type TotalManpowerRow = {
	source: string;
	headcount: number;
	share: string;
};

type EmployeeListResponseShape = {
	data?: Employee[] | { employees?: Employee[] };
	employees?: Employee[];
};

type PersonalInfoWithGender = {
	gender?: string | null;
};

const ACTIVE_EMPLOYEE_STATUSES = new Set(["ACTIVE", "ONBOARDING", "ON_LEAVE"]);

function getEmployeesFromResponse(data: unknown): Employee[] {
	const response = data as EmployeeListResponseShape;
	if (Array.isArray(response?.data)) return response.data;
	if (Array.isArray(response?.data?.employees)) return response.data.employees;
	if (Array.isArray(response?.employees)) return response.employees;
	return [];
}

function getGender(employee: Employee): "female" | "male" | "unknown" {
	const personalInfo = employee.person?.personalInfo as PersonalInfoWithGender | undefined;
	const gender = String(personalInfo?.gender || "")
		.trim()
		.toUpperCase();
	if (gender.startsWith("F")) return "female";
	if (gender.startsWith("M")) return "male";
	return "unknown";
}

function getDepartmentName(employee: Employee) {
	return employee.department?.name || "Unassigned";
}

function getDepartmentId(employee: Employee) {
	return employee.department?.id || employee.departmentId || null;
}

function getSectionName(employee: Employee) {
	return employee.section?.name || "No section";
}

function getSectionId(employee: Employee) {
	return employee.section?.id || employee.sectionId || null;
}

function getAgencyName(employee: Employee) {
	return employee.agency?.name || employee.agency?.code || "Unassigned agency";
}

function formatNumber(value?: number | null) {
	return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(value || 0);
}

function EmployeeDrillLink({
	children,
	count,
	input,
	className,
}: {
	children: ReactNode;
	count: number;
	input?: ManpowerEmployeeListLinkInput;
	className?: string;
}) {
	if (count <= 0) return <span>{children}</span>;

	return (
		<Link
			to={buildManpowerEmployeeListPath(input)}
			className={
				className ||
				"font-medium text-neutral-900 underline-offset-4 hover:text-orange-600 hover:underline"
			}
			title="Open matching employees">
			{children}
		</Link>
	);
}

const genderExportColumns: ReportExportColumn<GenderRow>[] = [
	{ header: "Dept / Division", accessor: "department" },
	{ header: "Female", accessor: "female", align: "right", valueType: "number" },
	{ header: "Male", accessor: "male", align: "right", valueType: "number" },
	{ header: "Unknown", accessor: "unknown", align: "right", valueType: "number" },
	{ header: "Direct", accessor: "direct", align: "right", valueType: "number" },
	{ header: "Indirect", accessor: "indirect", align: "right", valueType: "number" },
	{ header: "Grand Total", accessor: "total", align: "right", valueType: "number" },
];

const agencyExportColumns: ReportExportColumn<AgencyRow>[] = [
	{ header: "Agency", accessor: "agency" },
	{ header: "Headcount", accessor: "headcount", align: "right", valueType: "number" },
	{ header: "Female", accessor: "female", align: "right", valueType: "number" },
	{ header: "Male", accessor: "male", align: "right", valueType: "number" },
	{ header: "Unknown", accessor: "unknown", align: "right", valueType: "number" },
	{ header: "Departments", accessor: "departments", align: "right", valueType: "number" },
	{ header: "Sections", accessor: "sections", align: "right", valueType: "number" },
];

const directIndirectHeadcountColumns: ReportExportColumn<DirectIndirectHeadcountRow>[] = [
	{ header: "Department", accessor: "department" },
	{ header: "Section", accessor: "section" },
	{ header: "Direct", accessor: "direct", align: "right", valueType: "number" },
	{ header: "Indirect", accessor: "indirect", align: "right", valueType: "number" },
	{ header: "Total", accessor: "total", align: "right", valueType: "number" },
];

const totalManpowerExportColumns: ReportExportColumn<TotalManpowerRow>[] = [
	{ header: "Source", accessor: "source" },
	{ header: "Headcount", accessor: "headcount", align: "right", valueType: "number" },
	{ header: "Share", accessor: "share", align: "right" },
];

export function DirectIndirectLaborTab() {
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
	const [laborType, setLaborType] = useState<"ALL" | "DIRECT" | "INDIRECT">(() => {
		const value = String(searchParams.get("laborType") || "ALL").toUpperCase();
		return value === "DIRECT" || value === "INDIRECT" ? value : "ALL";
	});
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);

	const { data: departmentsData } = useDepartments({ limit: 1000 });
	const departments: Department[] = departmentsData?.departments || [];

	const { data: employeesData } = useEmployees({ limit: 10000 });
	const allEmployees = useMemo(
		() => getEmployeesFromResponse(employeesData),
		[employeesData],
	);

	const activeEmployees = useMemo(
		() =>
			allEmployees.filter((employee) =>
				ACTIVE_EMPLOYEE_STATUSES.has(employee.employmentStatus),
			),
		[allEmployees],
	);

	const managers = useMemo(() => {
		if (selectedDepartment === "all") return allEmployees;
		return allEmployees.filter((emp) => emp.department?.id === selectedDepartment);
	}, [allEmployees, selectedDepartment]);

	const { data, isLoading, error } = useDirectIndirectLaborSummary(
		fromIso,
		toIso,
		selectedDepartment === "all" ? undefined : selectedDepartment,
		selectedManager === "all" ? undefined : selectedManager,
		laborType,
	);

	const metrics = data?.metrics?.directIndirectLaborSummary;
	const items = metrics?.items || [];

	const distribution = useMemo(() => {
		const genderMap = new Map<string, GenderRow>();
		const agencyMap = new Map<string, AgencyRow>();
		const directIndirectMap = new Map<string, DirectIndirectHeadcountRow>();
		const agencyEmployeesByName = new Map<string, Employee[]>();
		let directTotal = 0;
		let indirectTotal = 0;

		activeEmployees.forEach((employee) => {
			const department = getDepartmentName(employee);
			const departmentId = getDepartmentId(employee);
			const section = getSectionName(employee);
			const sectionId = getSectionId(employee);
			const gender = getGender(employee);
			const isIndirect = employee.workforceSource === "AGENCY";

			if (isIndirect) indirectTotal += 1;
			else directTotal += 1;

			const genderRow =
				genderMap.get(department) ||
				({
					department,
					departmentId,
					female: 0,
					male: 0,
					unknown: 0,
					total: 0,
					direct: 0,
					indirect: 0,
				} satisfies GenderRow);
			genderRow[gender] += 1;
			genderRow.total += 1;
			if (isIndirect) genderRow.indirect += 1;
			else genderRow.direct += 1;
			genderMap.set(department, genderRow);

			if (isIndirect) {
				const agency = getAgencyName(employee);
				const agencyRow =
					agencyMap.get(agency) ||
					({
						agency,
						female: 0,
						male: 0,
						unknown: 0,
						headcount: 0,
						departments: 0,
						sections: 0,
					} satisfies AgencyRow);
				agencyRow[gender] += 1;
				agencyRow.headcount += 1;
				agencyMap.set(agency, agencyRow);
				agencyEmployeesByName.set(agency, [
					...(agencyEmployeesByName.get(agency) || []),
					employee,
				]);
			}

			const directIndirectKey = `${departmentId || department}:::${sectionId || section}`;
			const directIndirectRow =
				directIndirectMap.get(directIndirectKey) ||
				({
					department,
					departmentId,
					section,
					sectionId,
					direct: 0,
					indirect: 0,
					total: 0,
				} satisfies DirectIndirectHeadcountRow);
			if (isIndirect) directIndirectRow.indirect += 1;
			else directIndirectRow.direct += 1;
			directIndirectRow.total += 1;
			directIndirectMap.set(directIndirectKey, directIndirectRow);
		});

		agencyMap.forEach((row, agency) => {
			const agencyEmployees = agencyEmployeesByName.get(agency) || [];
			row.departments = new Set(agencyEmployees.map(getDepartmentName)).size;
			row.sections = new Set(agencyEmployees.map(getSectionName)).size;
		});

		const total = directTotal + indirectTotal;
		const totalManpowerRows: TotalManpowerRow[] = [
			{
				source: "Direct",
				headcount: directTotal,
				share: total ? `${((directTotal / total) * 100).toFixed(1)}%` : "0.0%",
			},
			{
				source: "Indirect",
				headcount: indirectTotal,
				share: total ? `${((indirectTotal / total) * 100).toFixed(1)}%` : "0.0%",
			},
			{ source: "Total", headcount: total, share: total ? "100.0%" : "0.0%" },
		];

		return {
			genderRows: Array.from(genderMap.values()).sort((a, b) =>
				a.department.localeCompare(b.department),
			),
			agencyRows: Array.from(agencyMap.values()).sort((a, b) => b.headcount - a.headcount),
			directIndirectRows: Array.from(directIndirectMap.values()).sort((a, b) =>
				`${a.department} ${a.section}`.localeCompare(`${b.department} ${b.section}`),
			),
			totalManpowerRows,
			total,
			directTotal,
			indirectTotal,
			femaleTotal: Array.from(genderMap.values()).reduce((sum, row) => sum + row.female, 0),
			maleTotal: Array.from(genderMap.values()).reduce((sum, row) => sum + row.male, 0),
			unknownGenderTotal: Array.from(genderMap.values()).reduce(
				(sum, row) => sum + row.unknown,
				0,
			),
		};
	}, [activeEmployees]);

	const handleClearFilters = () => {
		setSelectedDepartment("all");
		setSelectedManager("all");
		setLaborType("ALL");
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

		if (laborType !== "ALL") {
			nextSearchParams.set("laborType", laborType.toLowerCase());
		} else {
			nextSearchParams.delete("laborType");
		}

		if (nextSearchParams.toString() !== searchParams.toString()) {
			setSearchParams(nextSearchParams, { replace: true });
		}
	}, [dateRange, searchParams, selectedDepartment, selectedManager, laborType, setSearchParams]);

	const fileBaseName = buildReportFileName(
		"workforce-direct-indirect",
		fromIso,
		"to",
		toIso,
		selectedDepartment !== "all" ? "department" : undefined,
		selectedDepartment !== "all" ? selectedDepartment : undefined,
		selectedManager !== "all" ? "manager" : undefined,
		selectedManager !== "all" ? selectedManager : undefined,
		laborType !== "ALL" ? "laborType" : undefined,
		laborType !== "ALL" ? laborType.toLowerCase() : undefined,
	);

	const directIndirectExportColumns: ReportExportColumn<(typeof items)[number]>[] = [
		{ header: "Department", accessor: "department" },
		{ header: "Direct Employees", accessor: "directEmployees", align: "right", valueType: "number" },
		{
			header: "Indirect Employees",
			accessor: "indirectEmployees",
			align: "right",
			valueType: "number",
		},
		{
			header: "Direct Scheduled Work Days",
			accessor: "directScheduledWorkDays",
			align: "right",
			valueType: "number",
		},
		{
			header: "Indirect Scheduled Work Days",
			accessor: "indirectScheduledWorkDays",
			align: "right",
			valueType: "number",
		},
		{
			header: "Direct Active Manpower",
			accessor: "directActiveManpower",
			align: "right",
			valueType: "number",
		},
		{
			header: "Indirect Active Manpower",
			accessor: "indirectActiveManpower",
			align: "right",
			valueType: "number",
		},
		{
			header: "Direct No Work Count",
			accessor: "directNoWorkCount",
			align: "right",
			valueType: "number",
		},
		{
			header: "Indirect No Work Count",
			accessor: "indirectNoWorkCount",
			align: "right",
			valueType: "number",
		},
		{
			header: "Direct Attendance Rate",
			accessor: (item) => `${item.directAttendanceRate.toFixed(2)}%`,
			align: "right",
		},
		{
			header: "Indirect Attendance Rate",
			accessor: (item) => `${item.indirectAttendanceRate.toFixed(2)}%`,
			align: "right",
		},
	];

	const filterSummary = [
		{ label: "Period", value: `${fromIso || "-"} to ${toIso || "-"}` },
		{ label: "Labor type", value: laborType },
		selectedDepartment !== "all"
			? { label: "Department", value: selectedDepartment }
			: undefined,
		selectedManager !== "all" ? { label: "Manager", value: selectedManager } : undefined,
		{ label: "Distribution basis", value: "Active employees in HRIS" },
	].filter(Boolean) as Array<{ label: string; value: string }>;

	const openExportModal = () => {
		if (!items.length && !distribution.genderRows.length && !distribution.agencyRows.length) {
			toast.error("No workforce report rows available to export.");
			return;
		}

		setIsExportModalOpen(true);
	};

	const handleExport = async (format: ReportExportFormat) => {
		await exportReport({
			format,
			config: {
				reportKey: "workforce-direct-indirect",
				title: "Direct vs Indirect Labor Report",
				fileBaseName,
				rows: items,
				columns: directIndirectExportColumns,
				filtersSummary: filterSummary,
				summaryRows: [
					{ label: "Direct Employees", value: metrics?.totalDirectEmployees || 0 },
					{ label: "Indirect Employees", value: metrics?.totalIndirectEmployees || 0 },
					{ label: "Distribution Direct", value: distribution.directTotal },
					{ label: "Distribution Indirect", value: distribution.indirectTotal },
					{
						label: "Gender Female / Male",
						value: `${distribution.femaleTotal} / ${distribution.maleTotal}`,
					},
				],
				orientation: "landscape",
				xlsxSheets: [
					{
						name: "Direct vs Indirect",
						title: "Direct vs Indirect Labor",
						rows: items,
						columns: directIndirectExportColumns,
						summaryRows: [
							{ label: "Direct Employees", value: metrics?.totalDirectEmployees || 0 },
							{
								label: "Indirect Employees",
								value: metrics?.totalIndirectEmployees || 0,
							},
							{
								label: "Direct Active Manpower",
								value: metrics?.directActiveManpower || 0,
							},
							{
								label: "Indirect Active Manpower",
								value: metrics?.indirectActiveManpower || 0,
							},
						],
						filtersSummary: filterSummary,
					},
					{
						name: "Gender Summary",
						title: "Gender Summary",
						rows: distribution.genderRows,
						columns: genderExportColumns,
						summaryRows: [
							{ label: "Female", value: distribution.femaleTotal },
							{ label: "Male", value: distribution.maleTotal },
							{ label: "Unknown", value: distribution.unknownGenderTotal },
							{ label: "Grand Total", value: distribution.total },
						],
					},
					{
						name: "Agency Summary",
						title: "Agency Summary",
						rows: distribution.agencyRows,
						columns: agencyExportColumns,
						summaryRows: [
							{ label: "Indirect Headcount", value: distribution.indirectTotal },
							{ label: "Agency Count", value: distribution.agencyRows.length },
						],
						emptyStateMessage: "No indirect employees found",
					},
					{
						name: "Direct Indirect Headcount",
						title: "Direct Indirect Headcount",
						rows: distribution.directIndirectRows,
						columns: directIndirectHeadcountColumns,
						summaryRows: [
							{ label: "Direct", value: distribution.directTotal },
							{ label: "Indirect", value: distribution.indirectTotal },
							{ label: "Total", value: distribution.total },
						],
					},
					{
						name: "Total Manpower",
						title: "Total Manpower",
						rows: distribution.totalManpowerRows,
						columns: totalManpowerExportColumns,
						summaryRows: [{ label: "Total Manpower", value: distribution.total }],
					},
				],
			},
		});

		setIsExportModalOpen(false);
	};

	const directIndirectColumns = [
		{
			key: "department",
			header: "Department",
			accessor: (row: (typeof items)[number]) => row.department,
		},
		{
			key: "directEmployees",
			header: "Direct Employees",
			accessor: (row: (typeof items)[number]) => row.directEmployees,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "indirectEmployees",
			header: "Indirect Employees",
			accessor: (row: (typeof items)[number]) => row.indirectEmployees,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "directWorkDays",
			header: "Direct Scheduled Work Days",
			accessor: (row: (typeof items)[number]) => row.directScheduledWorkDays,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "indirectWorkDays",
			header: "Indirect Scheduled Work Days",
			accessor: (row: (typeof items)[number]) => row.indirectScheduledWorkDays,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "directActive",
			header: "Direct Active Manpower",
			accessor: (row: (typeof items)[number]) => row.directActiveManpower,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "indirectActive",
			header: "Indirect Active Manpower",
			accessor: (row: (typeof items)[number]) => row.indirectActiveManpower,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "directNoWork",
			header: "Direct No Work Count",
			accessor: (row: (typeof items)[number]) => row.directNoWorkCount,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "indirectNoWork",
			header: "Indirect No Work Count",
			accessor: (row: (typeof items)[number]) => row.indirectNoWorkCount,
			align: "right" as const,
			valueType: "number" as const,
		},
		{
			key: "directRate",
			header: "Direct Attendance Rate",
			render: (row: (typeof items)[number]) => `${row.directAttendanceRate.toFixed(2)}%`,
			align: "right" as const,
		},
		{
			key: "indirectRate",
			header: "Indirect Attendance Rate",
			render: (row: (typeof items)[number]) => `${row.indirectAttendanceRate.toFixed(2)}%`,
			align: "right" as const,
		},
	];

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
					<div>
						<CardTitle>Direct vs Indirect Labor Report</CardTitle>
						<CardDescription>
							Direct, indirect, gender, agency, and total manpower counts for HR review.
						</CardDescription>
					</div>
					<Button variant="outline" onClick={openExportModal}>
						<Download className="mr-2 h-4 w-4" />
						Export
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
					<div className="flex w-full flex-1 flex-col gap-2 md:flex-row md:flex-wrap md:gap-4">
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
							<label htmlFor="workforce-department-filter" className="mb-1 block text-sm font-medium">
								Department
							</label>
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
							<label htmlFor="workforce-manager-filter" className="mb-1 block text-sm font-medium">
								Manager
							</label>
							<Select value={selectedManager} onValueChange={setSelectedManager}>
								<SelectTrigger
									id="workforce-manager-filter"
									className="h-9 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm md:text-sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Managers</SelectItem>
									{managers.map((emp) => (
										<SelectItem key={`manager-${emp.id}`} value={emp.id}>
											{emp.person?.personalInfo?.firstName || ""}{" "}
											{emp.person?.personalInfo?.lastName || ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="w-full md:w-[160px]">
							<label htmlFor="workforce-labor-type-filter" className="mb-1 block text-sm font-medium">
								Labor Type
							</label>
							<Select
								value={laborType.toLowerCase()}
								onValueChange={(value) =>
									setLaborType(
										String(value).toUpperCase() as
											| "ALL"
											| "DIRECT"
											| "INDIRECT",
									)
								}>
								<SelectTrigger
									id="workforce-labor-type-filter"
									className="h-9 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm md:text-sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Types</SelectItem>
									<SelectItem value="direct">Direct</SelectItem>
									<SelectItem value="indirect">Indirect</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<Button
						variant="ghost"
						onClick={handleClearFilters}
						className="h-10 w-full px-4 text-muted-foreground hover:text-foreground md:w-auto">
						Clear Filters
					</Button>
				</div>

				{isLoading ? (
					<div className="py-8 text-center text-sm text-gray-500">Loading metrics...</div>
				) : error ? (
					<div className="py-8 text-center text-sm text-red-600">
						Error loading metrics: {error.message}
					</div>
				) : (
					<>
						<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
							<div className="rounded-lg border border-neutral-200 px-4 py-3">
								<div className="text-xs font-medium text-neutral-500">Direct Employees</div>
								<div className="mt-1 text-2xl font-semibold text-neutral-950">
									{formatNumber(metrics?.totalDirectEmployees || 0)}
								</div>
							</div>
							<div className="rounded-lg border border-neutral-200 px-4 py-3">
								<div className="text-xs font-medium text-neutral-500">Indirect Employees</div>
								<div className="mt-1 text-2xl font-semibold text-neutral-950">
									{formatNumber(metrics?.totalIndirectEmployees || 0)}
								</div>
							</div>
							<div className="rounded-lg border border-neutral-200 px-4 py-3">
								<div className="text-xs font-medium text-neutral-500">Total Manpower</div>
								<div className="mt-1 text-2xl font-semibold text-neutral-950">
									<EmployeeDrillLink count={distribution.total}>
										{formatNumber(distribution.total)}
									</EmployeeDrillLink>
								</div>
							</div>
							<div className="rounded-lg border border-neutral-200 px-4 py-3">
								<div className="text-xs font-medium text-neutral-500">Gender Count</div>
								<div className="mt-1 text-2xl font-semibold text-neutral-950">
									<EmployeeDrillLink count={distribution.femaleTotal} input={{ gender: "Female" }}>
										{formatNumber(distribution.femaleTotal)}
									</EmployeeDrillLink>{" "}
									/{" "}
									<EmployeeDrillLink count={distribution.maleTotal} input={{ gender: "Male" }}>
										{formatNumber(distribution.maleTotal)}
									</EmployeeDrillLink>
								</div>
							</div>
						</div>

						<section className="space-y-3">
							<h3 className="text-sm font-semibold text-neutral-900">
								Direct vs Indirect
							</h3>
							<ReportTable
								columns={directIndirectColumns}
								rows={items}
								getRowKey={(row) => row.department}
								tableClassName="min-w-[1500px]"
								emptyMessage="No direct vs indirect labor records found for this range"
							/>
						</section>

						<section className="space-y-3">
							<h3 className="text-sm font-semibold text-neutral-900">Gender Summary</h3>
							<ReportTable
								columns={[
									{
										key: "department",
										header: "Dept / Division",
										render: (row) => (
											<EmployeeDrillLink count={row.total} input={{ departmentId: row.departmentId }}>
												{row.department}
											</EmployeeDrillLink>
										),
									},
									{
										key: "female",
										header: "Female",
										align: "right",
										render: (row) => (
											<EmployeeDrillLink
												count={row.female}
												input={{ departmentId: row.departmentId, gender: "Female" }}>
												{formatNumber(row.female)}
											</EmployeeDrillLink>
										),
									},
									{
										key: "male",
										header: "Male",
										align: "right",
										render: (row) => (
											<EmployeeDrillLink
												count={row.male}
												input={{ departmentId: row.departmentId, gender: "Male" }}>
												{formatNumber(row.male)}
											</EmployeeDrillLink>
										),
									},
									{
										key: "unknown",
										header: "Unknown",
										accessor: "unknown",
										align: "right",
										valueType: "number",
									},
									{
										key: "direct",
										header: "Direct",
										accessor: "direct",
										align: "right",
										valueType: "number",
									},
									{
										key: "indirect",
										header: "Indirect",
										accessor: "indirect",
										align: "right",
										valueType: "number",
									},
									{
										key: "total",
										header: "Grand Total",
										align: "right",
										render: (row) => (
											<EmployeeDrillLink count={row.total} input={{ departmentId: row.departmentId }}>
												{formatNumber(row.total)}
											</EmployeeDrillLink>
										),
									},
								]}
								rows={distribution.genderRows}
								getRowKey={(row) => row.department}
								emptyMessage="No gender summary rows found"
							/>
						</section>

						<section className="space-y-3">
							<h3 className="text-sm font-semibold text-neutral-900">Agency Summary</h3>
							<ReportTable
								columns={[
									{
										key: "agency",
										header: "Agency",
										render: (row) => (
											<EmployeeDrillLink
												count={row.headcount}
												input={{ workforceSource: "AGENCY", agency: row.agency }}>
												{row.agency}
											</EmployeeDrillLink>
										),
									},
									{
										key: "headcount",
										header: "Headcount",
										align: "right",
										render: (row) => (
											<EmployeeDrillLink
												count={row.headcount}
												input={{ workforceSource: "AGENCY", agency: row.agency }}>
												{formatNumber(row.headcount)}
											</EmployeeDrillLink>
										),
									},
									{
										key: "female",
										header: "Female",
										align: "right",
										render: (row) => (
											<EmployeeDrillLink
												count={row.female}
												input={{
													workforceSource: "AGENCY",
													agency: row.agency,
													gender: "Female",
												}}>
												{formatNumber(row.female)}
											</EmployeeDrillLink>
										),
									},
									{
										key: "male",
										header: "Male",
										align: "right",
										render: (row) => (
											<EmployeeDrillLink
												count={row.male}
												input={{
													workforceSource: "AGENCY",
													agency: row.agency,
													gender: "Male",
												}}>
												{formatNumber(row.male)}
											</EmployeeDrillLink>
										),
									},
									{
										key: "unknown",
										header: "Unknown",
										accessor: "unknown",
										align: "right",
										valueType: "number",
									},
									{
										key: "departments",
										header: "Departments",
										accessor: "departments",
										align: "right",
										valueType: "number",
									},
									{
										key: "sections",
										header: "Sections",
										accessor: "sections",
										align: "right",
										valueType: "number",
									},
								]}
								rows={distribution.agencyRows}
								getRowKey={(row) => row.agency}
								emptyMessage="No indirect employees found"
							/>
						</section>

						<section className="space-y-3">
							<h3 className="text-sm font-semibold text-neutral-900">
								Direct / Indirect Headcount
							</h3>
							<ReportTable
								columns={[
									{
										key: "department",
										header: "Department",
										render: (row) => (
											<EmployeeDrillLink count={row.total} input={{ departmentId: row.departmentId }}>
												{row.department}
											</EmployeeDrillLink>
										),
									},
									{
										key: "section",
										header: "Section",
										render: (row) => (
											<EmployeeDrillLink
												count={row.total}
												input={{ departmentId: row.departmentId, sectionId: row.sectionId }}>
												{row.section}
											</EmployeeDrillLink>
										),
									},
									{
										key: "direct",
										header: "Direct",
										align: "right",
										render: (row) => (
											<EmployeeDrillLink
												count={row.direct}
												input={{
													departmentId: row.departmentId,
													sectionId: row.sectionId,
													workforceSource: "DIRECT",
												}}>
												{formatNumber(row.direct)}
											</EmployeeDrillLink>
										),
									},
									{
										key: "indirect",
										header: "Indirect",
										align: "right",
										render: (row) => (
											<EmployeeDrillLink
												count={row.indirect}
												input={{
													departmentId: row.departmentId,
													sectionId: row.sectionId,
													workforceSource: "AGENCY",
												}}>
												{formatNumber(row.indirect)}
											</EmployeeDrillLink>
										),
									},
									{
										key: "total",
										header: "Total",
										align: "right",
										render: (row) => (
											<EmployeeDrillLink
												count={row.total}
												input={{ departmentId: row.departmentId, sectionId: row.sectionId }}>
												{formatNumber(row.total)}
											</EmployeeDrillLink>
										),
									},
								]}
								rows={distribution.directIndirectRows}
								getRowKey={(row) => `${row.department}-${row.section}`}
								emptyMessage="No direct/indirect headcount rows found"
							/>
						</section>

						<section className="space-y-3">
							<h3 className="text-sm font-semibold text-neutral-900">Total Manpower</h3>
							<ReportTable
								columns={[
									{
										key: "source",
										header: "Source",
										render: (row) => (
											<EmployeeDrillLink
												count={row.headcount}
												input={
													row.source === "Direct"
														? { workforceSource: "DIRECT" }
														: row.source === "Indirect"
															? { workforceSource: "AGENCY" }
															: undefined
												}>
												{row.source}
											</EmployeeDrillLink>
										),
									},
									{
										key: "headcount",
										header: "Headcount",
										align: "right",
										render: (row) => (
											<EmployeeDrillLink
												count={row.headcount}
												input={
													row.source === "Direct"
														? { workforceSource: "DIRECT" }
														: row.source === "Indirect"
															? { workforceSource: "AGENCY" }
															: undefined
												}>
												{formatNumber(row.headcount)}
											</EmployeeDrillLink>
										),
									},
									{ key: "share", header: "Share", accessor: "share", align: "right" },
								]}
								rows={distribution.totalManpowerRows}
								getRowKey={(row) => row.source}
								emptyMessage="No total manpower rows found"
							/>
						</section>
					</>
				)}
			</CardContent>
			<ReportExportDialog
				title="Export Direct vs Indirect Labor Report"
				description="Choose an export format for the current workforce report."
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={[
					{
						format: "xlsx",
						label: "Export XLSX",
						helperText:
							"Download labor, gender, agency, headcount, and total manpower sheets.",
					},
					{
						format: "pdf",
						label: "Export PDF",
						helperText: "Download the current direct versus indirect labor table.",
					},
					{
						format: "csv",
						label: "Export CSV",
						helperText: "Download the current direct versus indirect labor rows.",
					},
				]}
				onExport={handleExport}
			/>
		</Card>
	);
}
