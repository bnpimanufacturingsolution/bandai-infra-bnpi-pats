const ACTIVE_MANPOWER_STATUS_SCOPE = "active-manpower";

export type ManpowerGenderFilter = "Female" | "Male" | "Unknown";

export interface ManpowerEmployeeListLinkInput {
	departmentId?: string | null;
	sectionId?: string | null;
	workforceSource?: "DIRECT" | "AGENCY";
	agencyName?: string | null;
	gender?: ManpowerGenderFilter;
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

	if (input.workforceSource) {
		params.set("workforceSource", input.workforceSource);
	}

	if (input.agencyName) {
		params.set("agency", input.agencyName);
	}

	if (input.gender) {
		params.set("gender", input.gender);
	}

	return `/hr/employees?${params.toString()}`;
}

export function getActiveManpowerStatusFilterBranches() {
	return ["employmentStatus:ACTIVE", "employmentStatus:ONBOARDING", "employmentStatus:ON_LEAVE"];
}

export function getActiveManpowerStatusScope() {
	return ACTIVE_MANPOWER_STATUS_SCOPE;
}
