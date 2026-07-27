import { describe, expect, it } from "vitest";
import { buildManpowerEmployeeListPath } from "./manpower-distribution-links";

describe("buildManpowerEmployeeListPath", () => {
	it("builds the active manpower employee list path", () => {
		expect(buildManpowerEmployeeListPath()).toBe(
			"/hr/employees?view=list&statusScope=active-manpower&page=1",
		);
	});

	it("preserves report drill-down filters as employee list query params", () => {
		expect(
			buildManpowerEmployeeListPath({
				departmentId: "dept-1",
				sectionId: "section-1",
				workforceSource: "AGENCY",
				agency: "Cebu General Services, Inc.",
				gender: "Female",
			}),
		).toBe(
			"/hr/employees?view=list&statusScope=active-manpower&page=1&departmentId=dept-1&sectionId=section-1&workforceSource=AGENCY&agency=Cebu+General+Services%2C+Inc.&gender=Female",
		);
	});

	it("keeps null department and section filters explicit for unassigned rows", () => {
		expect(
			buildManpowerEmployeeListPath({
				departmentId: null,
				sectionId: null,
			}),
		).toBe(
			"/hr/employees?view=list&statusScope=active-manpower&page=1&departmentId=null&sectionId=null",
		);
	});

	it("includes position, employment type, and normalized agency filters in manpower drilldowns", () => {
		expect(
			buildManpowerEmployeeListPath({
				positionId: "position-operator",
				employmentType: "REGULAR",
				workforceSource: "AGENCY",
				agency: "Cebu General Services, Inc.",
			}),
		).toBe(
			"/hr/employees?view=list&statusScope=active-manpower&page=1&positionId=position-operator&workforceSource=AGENCY&agency=Cebu+General+Services%2C+Inc.&employmentType=REGULAR",
		);
	});

	it("builds a position-only drilldown link", () => {
		expect(
			buildManpowerEmployeeListPath({
				positionId: "position-operator",
			}),
		).toBe(
			"/hr/employees?view=list&statusScope=active-manpower&page=1&positionId=position-operator",
		);
	});

	it("builds an employment-type-only drilldown link", () => {
		expect(
			buildManpowerEmployeeListPath({
				employmentType: "REGULAR",
			}),
		).toBe(
			"/hr/employees?view=list&statusScope=active-manpower&page=1&employmentType=REGULAR",
		);
	});
});
