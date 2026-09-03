import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("timesheet sync-obligation-lines contract", () => {
	it("registers POST /:id/sync-obligation-lines on the timesheet router", () => {
		const source = readFileSync(
			resolve(__dirname, "../app/timesheet/timesheet.router.ts"),
			"utf8",
		);
		expect(source).to.include('"/:id/sync-obligation-lines"');
		expect(source).to.include("controller.syncObligationLines");
	});

	it("controller materializes obligation lines for one timesheet period", () => {
		const source = readFileSync(
			resolve(__dirname, "../app/timesheet/timesheet.controller.ts"),
			"utf8",
		);
		const start = source.indexOf("const syncObligationLines");
		const end = source.indexOf("const repairCurrentPeriodCoverage");
		expect(start).to.be.greaterThan(-1);
		expect(end).to.be.greaterThan(start);
		const fn = source.slice(start, end);
		expect(fn).to.include("isTimesheetPolicyManager");
		expect(fn).to.include("materializeTimesheetLinesFromObligations");
		expect(fn).to.include("timesheetId");
		expect(fn).to.include("lineCount");
		expect(fn).to.include("getEffectiveEmploymentStartDate");
	});
});
