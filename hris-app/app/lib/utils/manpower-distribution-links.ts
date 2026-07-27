const ACTIVE_MANPOWER_STATUS_SCOPE = "active-manpower";

export type ManpowerGenderFilter = "Female" | "Male" | "Unknown";
export type ManpowerEmploymentTypeFilter =
	| "REGULAR"
	| "PROBATIONARY"
	| "CONTRACTUAL"
	| "PART_TIME"
	| "CONSULTANT"
	| "INTERN";

export interface ManpowerEmployeeListLinkInput {
	departmentId?: string | null;
	sectionId?: string | null;
	positionId?: string | null;
	workforceSource?: "DIRECT" | "AGENCY";
	agency?: string | null;
	gender?: ManpowerGenderFilter;
	employmentType?: ManpowerEmploymentTypeFilter;
}

export function buildManpowerEmployeeListPath(input: ManpowerEmployeeListLinkInput = {}) {
	const params = new URLSearchParams({
		view: "list",
		statusScope: ACTIVE_MANPOWER_STATUS_SCOPE,
		page: "1",
	});

	if (input.departmentId !== undefined) {
		params.set("departmentId", input.departmentId ?? "null");
	}

	if (input.sectionId !== undefined) {
		params.set("sectionId", input.sectionId ?? "null");
	}

	if (input.positionId !== undefined) {
		params.set("positionId", input.positionId ?? "null");
	}

	if (input.workforceSource) {
		params.set("workforceSource", input.workforceSource);
	}

	if (input.agency) {
		params.set("agency", input.agency);
	}

	if (input.gender) {
		params.set("gender", input.gender);
	}

	if (input.employmentType) {
		params.set("employmentType", input.employmentType);
	}

	return `/hr/employees?${params.toString()}`;
}

export function getActiveManpowerStatusFilterBranches() {
	return ["employmentStatus:ACTIVE", "employmentStatus:ONBOARDING", "employmentStatus:ON_LEAVE"];
}

export function getActiveManpowerStatusScope() {
	return ACTIVE_MANPOWER_STATUS_SCOPE;
}
