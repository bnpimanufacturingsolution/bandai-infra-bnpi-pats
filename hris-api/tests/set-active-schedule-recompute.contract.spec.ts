import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("set-active schedule recompute contract", () => {
	it("recomputes AttendanceObligation after POST /api/employee/:id/schedules/set-active", () => {
		const source = readFileSync(
			resolve(__dirname, "../app/employee/employee.controller.ts"),
			"utf8",
		);
		const start = source.indexOf("const setActiveEmployeeSchedule");
		const end = source.indexOf("const getTeamScheduleCalendar");
		expect(start).to.be.greaterThan(-1);
		expect(end).to.be.greaterThan(start);
		const fn = source.slice(start, end);
		expect(fn).to.include("appendEmployeeScheduleHistory");
		expect(fn).to.include("recomputeAttendanceObligationsForRange");
		expect(fn).to.match(
			/recomputeAttendanceObligationsForRange\([\s\S]*reason:\s*"ScheduleChanged"/,
		);
		expect(fn.indexOf("recomputeAttendanceObligationsForRange")).to.be.greaterThan(
			fn.indexOf("appendEmployeeScheduleHistory"),
		);
	});
});
