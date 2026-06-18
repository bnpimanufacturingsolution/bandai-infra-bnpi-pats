import { expect } from "chai";
import {
	deriveAttendanceStatusAndFlags,
	deriveFlagsFromHours,
	parseTimeStringToMinutes,
} from "../scripts/migrate-attendance-status-and-flags";

describe("attendance status and flags migration helpers", () => {
	it("parses HH:mm durations into minutes", () => {
		expect(parseTimeStringToMinutes("1:30")).to.equal(90);
		expect(parseTimeStringToMinutes("00:45")).to.equal(45);
		expect(parseTimeStringToMinutes(null)).to.equal(0);
		expect(parseTimeStringToMinutes("bad")).to.equal(0);
	});

	it("marks undertime whenever undertime minutes are positive", () => {
		expect(deriveFlagsFromHours("0:01", "0:00")).to.deep.equal(["UNDERTIME"]);
	});

	it("marks overtime only when overtime is at least one hour", () => {
		expect(deriveFlagsFromHours("0:00", "0:59")).to.deep.equal([]);
		expect(deriveFlagsFromHours("0:00", "1:00")).to.deep.equal(["OVERTIME"]);
	});

	it("preserves leave status and clears timekeeping behavior flags", () => {
		const next = deriveAttendanceStatusAndFlags({
			status: "LEAVE",
			timeIn: new Date("2026-05-01T00:00:00.000Z"),
			timeOut: null,
			undertimeHours: "1:00",
			overtimeHours: "2:00",
		});

		expect(next).to.deep.equal({ status: "LEAVE", behaviorFlags: [] });
	});

	it("marks clock-in without clock-out as incomplete", () => {
		const next = deriveAttendanceStatusAndFlags({
			status: "PRESENT",
			timeIn: new Date("2026-05-01T08:00:00.000Z"),
			timeOut: null,
			undertimeHours: "0:00",
			overtimeHours: "0:00",
		});

		expect(next).to.deep.equal({ status: "INCOMPLETE", behaviorFlags: [] });
	});

	it("derives present rows with undertime and overtime flags from effective clock ledger fields", () => {
		const next = deriveAttendanceStatusAndFlags({
			status: "UNDERTIME",
			timeIn: new Date("2026-05-01T08:00:00.000Z"),
			timeOut: new Date("2026-05-01T17:00:00.000Z"),
			undertimeHours: "0:30",
			overtimeHours: "1:15",
		});

		expect(next).to.deep.equal({
			status: "PRESENT",
			behaviorFlags: ["UNDERTIME", "OVERTIME"],
		});
	});
});
