import type { Employee } from "~/services/employees.service";

export const ACTIVE_MANPOWER_EMPLOYMENT_STATUSES = new Set([
	"ACTIVE",
	"ONBOARDING",
	"ON_LEAVE",
] as const);

export type ManpowerDatabankPositionRow = {
	position: string;
	positionId: string | null;
	headcount: number;
	direct: number;
	agency: number;
	departments: number;
	sections: number;
	employmentTypeMix: string;
	employmentTypeBreakdown: Array<{ employmentType: string; count: number }>;
	isUnassigned: boolean;
};

export type ManpowerDatabankEmploymentTypeRow = {
	employmentType: string;
	headcount: number;
	direct: number;
	agency: number;
	positions: number;
};

export function formatEmploymentTypeLabel(value?: string | null) {
	return String(value || "UNKNOWN")
		.toLowerCase()
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function buildEmploymentTypeMixLabel(
	breakdown: Array<{ employmentType: string; count: number }>,
) {
	if (breakdown.length === 0) return "";

	const topTwo = breakdown
		.slice(0, 2)
		.map(
			(item) => `${formatEmploymentTypeLabel(item.employmentType)} ${item.count}`,
		)
		.join(", ");

	const remainder = breakdown.length - 2;
	if (remainder <= 0) return topTwo;
	return `${topTwo}, +${remainder} more`;
}

export function getActiveManpowerEmployees(employees: Employee[]) {
	return employees.filter((employee) =>
		ACTIVE_MANPOWER_EMPLOYMENT_STATUSES.has(
			employee.employmentStatus as "ACTIVE" | "ONBOARDING" | "ON_LEAVE",
		),
	);
}

export function buildManpowerDatabank(employees: Employee[]) {
	const activeEmployees = getActiveManpowerEmployees(employees);

	const positionMap = new Map<
		string,
		{
			position: string;
			positionId: string | null;
			headcount: number;
			direct: number;
			agency: number;
			departments: Set<string>;
			sections: Set<string>;
			employmentTypes: Map<string, number>;
			isUnassigned: boolean;
		}
	>();

	const employmentTypeMap = new Map<
		string,
		{
			employmentType: string;
			headcount: number;
			direct: number;
			agency: number;
			positions: Set<string>;
		}
	>();

	activeEmployees.forEach((employee) => {
		const positionId = String(employee.position?.id || employee.positionId || "").trim() || null;
		const position = String(employee.position?.title || "").trim() || "Unassigned position";
		const positionKey = positionId || "__unassigned_position__";
		const departmentKey = String(employee.department?.id || employee.departmentId || "null");
		const sectionKey = String(employee.section?.id || (employee as any).sectionId || "null");
		const employmentType = String(employee.employmentType || "UNKNOWN");
		const isAgency = employee.workforceSource === "AGENCY";

		const positionEntry = positionMap.get(positionKey) || {
			position,
			positionId,
			headcount: 0,
			direct: 0,
			agency: 0,
			departments: new Set<string>(),
			sections: new Set<string>(),
			employmentTypes: new Map<string, number>(),
			isUnassigned: !positionId,
		};
		positionEntry.headcount += 1;
		if (isAgency) positionEntry.agency += 1;
		else positionEntry.direct += 1;
		positionEntry.departments.add(departmentKey);
		positionEntry.sections.add(sectionKey);
		positionEntry.employmentTypes.set(
			employmentType,
			(positionEntry.employmentTypes.get(employmentType) || 0) + 1,
		);
		positionMap.set(positionKey, positionEntry);

		const employmentTypeEntry = employmentTypeMap.get(employmentType) || {
			employmentType,
			headcount: 0,
			direct: 0,
			agency: 0,
			positions: new Set<string>(),
		};
		employmentTypeEntry.headcount += 1;
		if (isAgency) employmentTypeEntry.agency += 1;
		else employmentTypeEntry.direct += 1;
		employmentTypeEntry.positions.add(positionKey);
		employmentTypeMap.set(employmentType, employmentTypeEntry);
	});

	const positionRows: ManpowerDatabankPositionRow[] = Array.from(positionMap.values())
		.map((entry) => {
			const employmentTypeBreakdown = Array.from(entry.employmentTypes.entries())
				.map(([employmentType, count]) => ({ employmentType, count }))
				.sort((a, b) => b.count - a.count || a.employmentType.localeCompare(b.employmentType));

			return {
				position: entry.position,
				positionId: entry.positionId,
				headcount: entry.headcount,
				direct: entry.direct,
				agency: entry.agency,
				departments: entry.departments.size,
				sections: entry.sections.size,
				employmentTypeMix: buildEmploymentTypeMixLabel(employmentTypeBreakdown),
				employmentTypeBreakdown,
				isUnassigned: entry.isUnassigned,
			};
		})
		.sort((a, b) => b.headcount - a.headcount || a.position.localeCompare(b.position));

	const employmentTypeRows: ManpowerDatabankEmploymentTypeRow[] = Array.from(
		employmentTypeMap.values(),
	)
		.map((entry) => ({
			employmentType: entry.employmentType,
			headcount: entry.headcount,
			direct: entry.direct,
			agency: entry.agency,
			positions: entry.positions.size,
		}))
		.sort(
			(a, b) => b.headcount - a.headcount || a.employmentType.localeCompare(b.employmentType),
		);

	return { activeEmployees, positionRows, employmentTypeRows };
}
