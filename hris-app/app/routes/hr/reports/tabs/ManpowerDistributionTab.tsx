import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { useEmployees } from "~/lib/hooks/useEmployees";
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
import reportsService from "~/services/reports.service";
import type { Employee } from "~/services/employees.service";
import { ReportExportDialog } from "../components/ReportExportDialog";
import { ReportTable } from "../components/ReportTable";

type GenderRow = {
	department: string;
	departmentId: string | null;
	female: number;
	male: number;
	unknown: number;
	total: number;
	direct: number;
	agency: number;
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

type DirectAgencyRow = {
	department: string;
	departmentId: string | null;
	section: string;
	sectionId: string | null;
	direct: number;
	agency: number;
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

function formatDateLabel(value?: string | null) {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;

	return new Intl.DateTimeFormat("en-PH", {
		month: "long",
		day: "numeric",
		year: "numeric",
	}).format(date);
}

function getDeltaLabel(current: number, reference?: number | null) {
	if (reference === null || reference === undefined) return "No April reference";
	const delta = current - reference;
	if (delta === 0) return "Matches April reference";
	return `${delta > 0 ? "+" : ""}${formatNumber(delta)} vs April reference`;
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

export function ManpowerDistributionTab() {
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);
	const { data: employeesData, isLoading: employeesLoading, error: employeesError } = useEmployees({
		limit: 10000,
	});
	const {
		data: reference,
		isLoading: referenceLoading,
		error: referenceError,
	} = useQuery({
		queryKey: ["reports", "manpower-distribution-reference", "2026-04"],
		queryFn: () => reportsService.getManpowerDistributionReference("2026-04"),
		staleTime: 60 * 60 * 1000,
	});

	const employees = useMemo(
		() =>
			getEmployeesFromResponse(employeesData).filter((employee) =>
				ACTIVE_EMPLOYEE_STATUSES.has(employee.employmentStatus),
			),
		[employeesData],
	);

	const distribution = useMemo(() => {
		const genderMap = new Map<string, GenderRow>();
		const agencyMap = new Map<string, AgencyRow>();
		const directAgencyMap = new Map<string, DirectAgencyRow>();
		let directTotal = 0;
		let agencyTotal = 0;

		employees.forEach((employee) => {
			const department = getDepartmentName(employee);
			const departmentId = getDepartmentId(employee);
			const section = getSectionName(employee);
			const sectionId = getSectionId(employee);
			const gender = getGender(employee);
			const isAgency = employee.workforceSource === "AGENCY";

			if (isAgency) agencyTotal += 1;
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
					agency: 0,
				} satisfies GenderRow);
			genderRow[gender] += 1;
			if (gender !== "unknown") {
				genderRow.total += 1;
			}
			if (isAgency) genderRow.agency += 1;
			else genderRow.direct += 1;
			genderMap.set(department, genderRow);

			if (isAgency) {
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
			}

			const directAgencyKey = `${departmentId || department}:::${sectionId || section}`;
			const directAgencyRow =
				directAgencyMap.get(directAgencyKey) ||
				({
					department,
					departmentId,
					section,
					sectionId,
					direct: 0,
					agency: 0,
					total: 0,
				} satisfies DirectAgencyRow);
			if (isAgency) directAgencyRow.agency += 1;
			else directAgencyRow.direct += 1;
			directAgencyRow.total += 1;
			directAgencyMap.set(directAgencyKey, directAgencyRow);
		});

		const agencyEmployeesByName = new Map<string, Employee[]>();
		employees
			.filter((employee) => employee.workforceSource === "AGENCY")
			.forEach((employee) => {
				const agency = getAgencyName(employee);
				agencyEmployeesByName.set(agency, [...(agencyEmployeesByName.get(agency) || []), employee]);
			});

		agencyMap.forEach((row, agency) => {
			const agencyEmployees = agencyEmployeesByName.get(agency) || [];
			row.departments = new Set(agencyEmployees.map(getDepartmentName)).size;
			row.sections = new Set(agencyEmployees.map(getSectionName)).size;
		});

		const total = directTotal + agencyTotal;
		const totalManpowerRows: TotalManpowerRow[] = [
			{
				source: "Direct",
				headcount: directTotal,
				share: total ? `${((directTotal / total) * 100).toFixed(1)}%` : "0.0%",
			},
			{
				source: "Agency",
				headcount: agencyTotal,
				share: total ? `${((agencyTotal / total) * 100).toFixed(1)}%` : "0.0%",
			},
			{ source: "Total", headcount: total, share: "100.0%" },
		];

		return {
			genderRows: Array.from(genderMap.values())
				.filter((row) => row.total > 0)
				.sort((a, b) => a.department.localeCompare(b.department)),
			agencyRows: Array.from(agencyMap.values()).sort((a, b) => b.headcount - a.headcount),
			directAgencyRows: Array.from(directAgencyMap.values()).sort((a, b) =>
				`${a.department} ${a.section}`.localeCompare(`${b.department} ${b.section}`),
			),
			totalManpowerRows,
			total,
			directTotal,
			agencyTotal,
			genderKnownTotal: Array.from(genderMap.values()).reduce((sum, row) => sum + row.total, 0),
			femaleTotal: Array.from(genderMap.values()).reduce((sum, row) => sum + row.female, 0),
			maleTotal: Array.from(genderMap.values()).reduce((sum, row) => sum + row.male, 0),
			unknownGenderTotal: Array.from(genderMap.values()).reduce(
				(sum, row) => sum + row.unknown,
				0,
			),
		};
	}, [employees]);

const fileBaseName = buildReportFileName("workforce-manpower-distribution", "2026-04");

const genderExportColumns: ReportExportColumn<GenderRow>[] = [
	{ header: "Dept / Division", accessor: "department" },
	{ header: "Female", accessor: "female", align: "right", valueType: "number" },
	{ header: "Male", accessor: "male", align: "right", valueType: "number" },
	{ header: "Grand Total", accessor: "total", align: "right", valueType: "number" },
];

const agencyExportColumns: ReportExportColumn<AgencyRow>[] = [
	{ header: "Agency", accessor: "agency" },
	{ header: "Headcount", accessor: "headcount", align: "right", valueType: "number" },
	{ header: "Female", accessor: "female", align: "right", valueType: "number" },
	{ header: "Male", accessor: "male", align: "right", valueType: "number" },
	{ header: "Departments", accessor: "departments", align: "right", valueType: "number" },
	{ header: "Sections", accessor: "sections", align: "right", valueType: "number" },
];

const directAgencyExportColumns: ReportExportColumn<DirectAgencyRow>[] = [
	{ header: "Department", accessor: "department" },
	{ header: "Section", accessor: "section" },
	{ header: "Direct", accessor: "direct", align: "right", valueType: "number" },
	{ header: "Agency", accessor: "agency", align: "right", valueType: "number" },
	{ header: "Total", accessor: "total", align: "right", valueType: "number" },
];

const totalManpowerExportColumns: ReportExportColumn<TotalManpowerRow>[] = [
	{ header: "Source", accessor: "source" },
	{ header: "Headcount", accessor: "headcount", align: "right", valueType: "number" },
	{ header: "Share", accessor: "share", align: "right" },
];
	const exportReferenceNotes = [
		{ label: "Report basis", value: "Active employees in HRIS" },
		reference?.directAgencySnapshot
			? {
					label: "April reference",
					value: `${formatDateLabel(reference.directAgencySnapshot.date)}: ${formatNumber(reference.directAgencySnapshot.direct)} direct, ${formatNumber(reference.directAgencySnapshot.agency)} agency, ${formatNumber(reference.directAgencySnapshot.total)} total`,
				}
			: undefined,
		reference?.averageManpower
			? {
					label: "Monthly average",
					value: `${formatNumber(reference.averageManpower.directAverage)} direct, ${formatNumber(reference.averageManpower.agencyAverage)} agency, ${formatNumber(reference.averageManpower.totalAverage)} total`,
				}
			: undefined,
	].filter(Boolean) as Array<{ label: string; value: string }>;

	const openExportModal = () => {
		if (!distribution.genderRows.length && !distribution.agencyRows.length) {
			toast.error("No manpower distribution rows available to export.");
			return;
		}

		setIsExportModalOpen(true);
	};

	const handleExport = async (format: ReportExportFormat) => {
		await exportReport({
			format,
			config: {
				reportKey: "workforce-manpower-distribution",
				title: "Monthly Manpower Distribution",
				fileBaseName,
				rows: distribution.genderRows,
				columns: genderExportColumns,
				filtersSummary: exportReferenceNotes,
				summaryRows: [
					{ label: "Total Manpower", value: distribution.total },
					{ label: "Direct", value: distribution.directTotal },
					{ label: "Agency", value: distribution.agencyTotal },
					{ label: "Female / Male", value: `${distribution.femaleTotal} / ${distribution.maleTotal}` },
				],
				orientation: "landscape",
				xlsxSheets: [
					{
						name: "Gender Summary",
						title: "Gender Summary",
						rows: distribution.genderRows,
						columns: genderExportColumns,
						summaryRows: [
							{ label: "Female", value: distribution.femaleTotal },
							{ label: "Male", value: distribution.maleTotal },
							{ label: "Grand Total", value: distribution.genderKnownTotal },
						],
					},
					{
						name: "Agency Summary",
						title: "Agency Summary",
						rows: distribution.agencyRows,
						columns: agencyExportColumns,
						summaryRows: [
							{ label: "Agency Headcount", value: distribution.agencyTotal },
							{ label: "Agency Count", value: distribution.agencyRows.length },
						],
						emptyStateMessage: "No agency employees found",
					},
					{
						name: "Agency Direct Headcount",
						title: "Agency Direct Headcount",
						rows: distribution.directAgencyRows,
						columns: directAgencyExportColumns,
						summaryRows: [
							{ label: "Direct", value: distribution.directTotal },
							{ label: "Agency", value: distribution.agencyTotal },
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

	const isLoading = employeesLoading || referenceLoading;
	const workbookTotal = reference?.directAgencySnapshot?.total;
	const totalEmployeeLink = buildManpowerEmployeeListPath();

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
					<div>
						<CardTitle>Monthly Manpower Distribution</CardTitle>
						<CardDescription>
							Headcount tally aligned to Gender Summary, Agency Summary, Agency Direct Headcount, and Total Manpower.
						</CardDescription>
					</div>
					<Button variant="outline" onClick={openExportModal}>
						<Download className="mr-2 h-4 w-4" />
						Export
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				{isLoading ? (
					<div className="py-8 text-center text-sm text-gray-500">
						Loading manpower distribution...
					</div>
				) : employeesError ? (
					<div className="py-8 text-center text-sm text-red-600">
						Failed to load employee headcount data.
					</div>
				) : (
					<>
						{referenceError ? (
							<div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
								April reference totals are unavailable; HRIS active employee counts are still shown.
							</div>
						) : null}

						<div className="grid grid-cols-1 gap-4 md:grid-cols-4">
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">Total Manpower</CardTitle>
								</CardHeader>
								<CardContent>
									<Link
										to={totalEmployeeLink}
										className="text-2xl font-bold text-neutral-950 underline-offset-4 hover:text-orange-600 hover:underline">
										{formatNumber(distribution.total)}
									</Link>
									<p className="text-xs text-gray-500">{getDeltaLabel(distribution.total, workbookTotal)}</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">Direct</CardTitle>
								</CardHeader>
								<CardContent>
									<EmployeeDrillLink
										count={distribution.directTotal}
										input={{ workforceSource: "DIRECT" }}
										className="text-2xl font-bold text-neutral-950 underline-offset-4 hover:text-orange-600 hover:underline">
										{formatNumber(distribution.directTotal)}
									</EmployeeDrillLink>
									<p className="text-xs text-gray-500">
										{getDeltaLabel(distribution.directTotal, reference?.directAgencySnapshot?.direct)}
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">Agency</CardTitle>
								</CardHeader>
								<CardContent>
									<EmployeeDrillLink
										count={distribution.agencyTotal}
										input={{ workforceSource: "AGENCY" }}
										className="text-2xl font-bold text-neutral-950 underline-offset-4 hover:text-orange-600 hover:underline">
										{formatNumber(distribution.agencyTotal)}
									</EmployeeDrillLink>
									<p className="text-xs text-gray-500">
										{getDeltaLabel(distribution.agencyTotal, reference?.directAgencySnapshot?.agency)}
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">Gender Count</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										<EmployeeDrillLink
											count={distribution.femaleTotal}
											input={{ gender: "Female" }}
											className="text-neutral-950 underline-offset-4 hover:text-orange-600 hover:underline">
											{formatNumber(distribution.femaleTotal)}
										</EmployeeDrillLink>{" "}
										/{" "}
										<EmployeeDrillLink
											count={distribution.maleTotal}
											input={{ gender: "Male" }}
											className="text-neutral-950 underline-offset-4 hover:text-orange-600 hover:underline">
											{formatNumber(distribution.maleTotal)}
										</EmployeeDrillLink>
									</div>
									<p className="text-xs text-gray-500">
										Female / Male
									</p>
								</CardContent>
							</Card>
						</div>

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
												input={{ workforceSource: "AGENCY", agencyName: row.agency }}>
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
												input={{ workforceSource: "AGENCY", agencyName: row.agency }}>
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
												input={{ workforceSource: "AGENCY", agencyName: row.agency, gender: "Female" }}>
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
												input={{ workforceSource: "AGENCY", agencyName: row.agency, gender: "Male" }}>
												{formatNumber(row.male)}
											</EmployeeDrillLink>
										),
									},
									{ key: "departments", header: "Departments", accessor: "departments", align: "right", valueType: "number" },
									{ key: "sections", header: "Sections", accessor: "sections", align: "right", valueType: "number" },
								]}
								rows={distribution.agencyRows}
								getRowKey={(row) => row.agency}
								emptyMessage="No agency employees found"
							/>
						</section>

						<section className="space-y-3">
							<h3 className="text-sm font-semibold text-neutral-900">Agency Direct Headcount</h3>
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
										key: "agency",
										header: "Agency",
										align: "right",
										render: (row) => (
											<EmployeeDrillLink
												count={row.agency}
												input={{
													departmentId: row.departmentId,
													sectionId: row.sectionId,
													workforceSource: "AGENCY",
												}}>
												{formatNumber(row.agency)}
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
								rows={distribution.directAgencyRows}
								getRowKey={(row) => `${row.department}-${row.section}`}
								emptyMessage="No direct/agency headcount rows found"
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
														: row.source === "Agency"
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
														: row.source === "Agency"
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
				title="Export Monthly Manpower Distribution"
				description="Choose an export format for the current manpower distribution tally."
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={[
					{
						format: "xlsx",
						label: "Export XLSX",
						helperText: "Download the distribution tally as an Excel workbook.",
					},
					{
						format: "pdf",
						label: "Export PDF",
						helperText: "Download the same distribution tally as a PDF.",
					},
					{
						format: "csv",
						label: "Export CSV",
						helperText: "Download the same distribution tally as a CSV file.",
					},
				]}
				onExport={handleExport}
			/>
		</Card>
	);
}
