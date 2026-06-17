import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

const ACTIVE_EMPLOYEE_STATUSES = new Set(["ACTIVE", "ONBOARDING", "ON_LEAVE"]);
type WorkforceSource = "DIRECT" | "AGENCY";
type GenderFilter = "Female" | "Male" | "Unknown";

type EmployeeRow = {
	id: string;
	organizationId: string;
	employmentStatus: string;
	departmentId: string | null;
	sectionId: string | null;
	workforceSource: WorkforceSource | null;
	agencyId: string | null;
	person: { personalInfo: unknown } | null;
	department: { id: string; name: string } | null;
	section: { id: string; name: string } | null;
	agency: { id: string; name: string; code: string | null } | null;
};

type DrilldownParams = {
	departmentId?: string | null;
	sectionId?: string | null;
	workforceSource?: WorkforceSource;
	agencyName?: string | null;
	gender?: GenderFilter;
};

type Check = {
	label: string;
	expected: number;
	params: DrilldownParams;
};

function readGender(employee: EmployeeRow): GenderFilter {
	const personalInfo = employee.person?.personalInfo as { gender?: unknown } | null;
	const gender = String(personalInfo?.gender || "")
		.trim()
		.toUpperCase();
	if (gender.startsWith("F")) return "Female";
	if (gender.startsWith("M")) return "Male";
	return "Unknown";
}

function departmentName(employee: EmployeeRow) {
	return employee.department?.name || "Unassigned";
}

function sectionName(employee: EmployeeRow) {
	return employee.section?.name || "No section";
}

function agencyName(employee: EmployeeRow) {
	return employee.agency?.name || employee.agency?.code || "Unassigned agency";
}

function buildEmployeeListPath(params: DrilldownParams = {}) {
	const search = new URLSearchParams({
		view: "list",
		statusScope: "active-manpower",
		page: "1",
	});
	if (params.departmentId !== undefined) search.set("departmentId", params.departmentId ?? "null");
	if (params.sectionId !== undefined) search.set("sectionId", params.sectionId ?? "null");
	if (params.workforceSource) search.set("workforceSource", params.workforceSource);
	if (params.agencyName) search.set("agency", params.agencyName);
	if (params.gender) search.set("gender", params.gender);
	return `/hr/employees?${search.toString()}`;
}

function buildEmployeeListFilter(params: DrilldownParams = {}) {
	const parts = [
		"or(employmentStatus:ACTIVE;employmentStatus:ONBOARDING;employmentStatus:ON_LEAVE)",
	];
	if (params.departmentId !== undefined) parts.push(`departmentId:${params.departmentId ?? "null"}`);
	if (params.sectionId !== undefined) parts.push(`sectionId:${params.sectionId ?? "null"}`);
	if (params.workforceSource) parts.push(`workforceSource:${params.workforceSource}`);
	if (params.gender === "Female") {
		parts.push(
			"or(person.personalInfo.gender:Female;person.personalInfo.gender:FEMALE;person.personalInfo.gender:female)",
		);
	}
	if (params.gender === "Male") {
		parts.push(
			"or(person.personalInfo.gender:Male;person.personalInfo.gender:MALE;person.personalInfo.gender:male)",
		);
	}
	if (params.gender === "Unknown") {
		parts.push(
			"or(person.personalInfo.gender:null;person.personalInfo.gender:;person.personalInfo.gender:N/A;person.personalInfo.gender:Unknown;person.personalInfo.gender:UNKNOWN;person.personalInfo.gender:unknown)",
		);
	}
	if (params.agencyName) parts.push(`agency:<resolved by name/code: ${params.agencyName}>`);
	return parts.join(",");
}

function matchesContract(employee: EmployeeRow, params: DrilldownParams) {
	if (!ACTIVE_EMPLOYEE_STATUSES.has(employee.employmentStatus)) return false;
	if (params.departmentId !== undefined && employee.departmentId !== params.departmentId) return false;
	if (params.sectionId !== undefined && employee.sectionId !== params.sectionId) return false;
	if (params.workforceSource && employee.workforceSource !== params.workforceSource) return false;
	if (params.gender && readGender(employee) !== params.gender) return false;
	if (params.agencyName) {
		const target = params.agencyName.trim().toLowerCase();
		const employeeAgencyName = String(employee.agency?.name || "").trim().toLowerCase();
		const employeeAgencyCode = String(employee.agency?.code || "").trim().toLowerCase();
		if (employeeAgencyName !== target && employeeAgencyCode !== target) return false;
	}
	return true;
}

function countByContract(employees: EmployeeRow[], params: DrilldownParams) {
	return employees.filter((employee) => matchesContract(employee, params)).length;
}

async function main() {
	const allEmployees = (await prisma.employee.findMany({
		where: { isDeleted: false },
		select: {
			id: true,
			organizationId: true,
			employmentStatus: true,
			departmentId: true,
			sectionId: true,
			workforceSource: true,
			agencyId: true,
			person: { select: { personalInfo: true } },
			department: { select: { id: true, name: true } },
			section: { select: { id: true, name: true } },
			agency: { select: { id: true, name: true, code: true } },
		},
	})) as EmployeeRow[];

	const activeByOrganization = new Map<string, number>();
	for (const employee of allEmployees) {
		if (!ACTIVE_EMPLOYEE_STATUSES.has(employee.employmentStatus)) continue;
		activeByOrganization.set(
			employee.organizationId,
			(activeByOrganization.get(employee.organizationId) || 0) + 1,
		);
	}
	const [organizationId, activeCount] = Array.from(activeByOrganization.entries()).sort(
		(a, b) => b[1] - a[1],
	)[0] || ["", 0];
	const employees = allEmployees.filter((employee) => employee.organizationId === organizationId);
	const activeEmployees = employees.filter((employee) =>
		ACTIVE_EMPLOYEE_STATUSES.has(employee.employmentStatus),
	);

	const checks: Check[] = [
		{ label: "Total Manpower", expected: activeEmployees.length, params: {} },
		{
			label: "Direct Total",
			expected: activeEmployees.filter((employee) => employee.workforceSource !== "AGENCY").length,
			params: { workforceSource: "DIRECT" },
		},
		{
			label: "Agency Total",
			expected: activeEmployees.filter((employee) => employee.workforceSource === "AGENCY").length,
			params: { workforceSource: "AGENCY" },
		},
		{
			label: "Female Total",
			expected: activeEmployees.filter((employee) => readGender(employee) === "Female").length,
			params: { gender: "Female" },
		},
		{
			label: "Male Total",
			expected: activeEmployees.filter((employee) => readGender(employee) === "Male").length,
			params: { gender: "Male" },
		},
	];

	const departments = new Map<string, EmployeeRow[]>();
	const agencies = new Map<string, EmployeeRow[]>();
	const departmentSections = new Map<string, EmployeeRow[]>();

	for (const employee of activeEmployees) {
		const departmentKey = employee.departmentId ?? "null";
		departments.set(departmentKey, [...(departments.get(departmentKey) || []), employee]);

		if (employee.workforceSource === "AGENCY") {
			const agencyKey = agencyName(employee);
			agencies.set(agencyKey, [...(agencies.get(agencyKey) || []), employee]);
		}

		const sectionKey = `${employee.departmentId ?? "null"}:::${employee.sectionId ?? "null"}`;
		departmentSections.set(sectionKey, [
			...(departmentSections.get(sectionKey) || []),
			employee,
		]);
	}

	for (const rows of departments.values()) {
		const sample = rows[0];
		const departmentId = sample.departmentId;
		const department = departmentName(sample);
		checks.push(
			{ label: `Gender row ${department} total`, expected: rows.length, params: { departmentId } },
			{
				label: `Gender row ${department} female`,
				expected: rows.filter((employee) => readGender(employee) === "Female").length,
				params: { departmentId, gender: "Female" },
			},
			{
				label: `Gender row ${department} male`,
				expected: rows.filter((employee) => readGender(employee) === "Male").length,
				params: { departmentId, gender: "Male" },
			},
			{
				label: `Gender row ${department} direct`,
				expected: rows.filter((employee) => employee.workforceSource !== "AGENCY").length,
				params: { departmentId, workforceSource: "DIRECT" },
			},
			{
				label: `Gender row ${department} agency`,
				expected: rows.filter((employee) => employee.workforceSource === "AGENCY").length,
				params: { departmentId, workforceSource: "AGENCY" },
			},
		);
	}

	for (const [agency, rows] of agencies.entries()) {
		checks.push(
			{
				label: `Agency ${agency} headcount`,
				expected: rows.length,
				params: { workforceSource: "AGENCY", agencyName: agency },
			},
			{
				label: `Agency ${agency} female`,
				expected: rows.filter((employee) => readGender(employee) === "Female").length,
				params: { workforceSource: "AGENCY", agencyName: agency, gender: "Female" },
			},
			{
				label: `Agency ${agency} male`,
				expected: rows.filter((employee) => readGender(employee) === "Male").length,
				params: { workforceSource: "AGENCY", agencyName: agency, gender: "Male" },
			},
		);
	}

	for (const rows of departmentSections.values()) {
		const sample = rows[0];
		const departmentId = sample.departmentId;
		const sectionId = sample.sectionId;
		const label = `${departmentName(sample)} / ${sectionName(sample)}`;
		checks.push(
			{ label: `${label} total`, expected: rows.length, params: { departmentId, sectionId } },
			{
				label: `${label} direct`,
				expected: rows.filter((employee) => employee.workforceSource !== "AGENCY").length,
				params: { departmentId, sectionId, workforceSource: "DIRECT" },
			},
			{
				label: `${label} agency`,
				expected: rows.filter((employee) => employee.workforceSource === "AGENCY").length,
				params: { departmentId, sectionId, workforceSource: "AGENCY" },
			},
		);
	}

	const failures = checks
		.map((check) => ({
			...check,
			actual: countByContract(activeEmployees, check.params),
			path: buildEmployeeListPath(check.params),
			filter: buildEmployeeListFilter(check.params),
		}))
		.filter((check) => check.actual !== check.expected);

	console.log("Manpower drilldown dry run");
	console.log(`Organization: ${organizationId || "none"}`);
	console.log(`Active manpower rows: ${activeCount}`);
	console.log(`Checked drilldowns: ${checks.length}`);
	const adminFemale = checks.find((check) => check.label === "Gender row Administration female");
	if (adminFemale) {
		console.log("\nSample: Gender row Administration female");
		console.log(`Expected report count: ${adminFemale.expected}`);
		console.log(`Employee-list count: ${countByContract(activeEmployees, adminFemale.params)}`);
		console.log(`URL: ${buildEmployeeListPath(adminFemale.params)}`);
		console.log(`BE filter: ${buildEmployeeListFilter(adminFemale.params)}`);
	}

	if (failures.length > 0) {
		console.error("\nContract mismatches:");
		for (const failure of failures.slice(0, 20)) {
			console.error(
				`- ${failure.label}: report=${failure.expected}, employee-list=${failure.actual}`,
			);
			console.error(`  ${failure.path}`);
			console.error(`  ${failure.filter}`);
		}
		process.exitCode = 1;
		return;
	}

	console.log("\nAll drilldown counts match the employee-list contract.");
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
