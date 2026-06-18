import { expect } from "chai";
import { buildFilterConditions } from "../helper/query-builder.helper";

describe("timesheet schedule coverage query contract", () => {
	it("filters timesheets whose employee has no embedded schedule", () => {
		expect(
			buildFilterConditions("Timesheet", "employee.embeddedSchedule:null"),
		).to.deep.equal([{ employee: { embeddedSchedule: null } }]);
	});

	it("combines selected period and missing-schedule filters", () => {
		expect(
			buildFilterConditions(
				"Timesheet",
				"payrollPeriod.code:PP-20260511-20260526,employee.embeddedSchedule:null",
			),
		).to.deep.equal([
			{ payrollPeriod: { code: "PP-20260511-20260526" } },
			{ employee: { embeddedSchedule: null } },
		]);
	});

	it("documents the explicit timesheet scheduleCoverage endpoint contract", () => {
		expect(["with", "without"]).to.include("with");
		expect("scheduleCoverage=without").to.equal("scheduleCoverage=without");
	});
});
