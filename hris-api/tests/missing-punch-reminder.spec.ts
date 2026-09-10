import { expect } from "chai";
import {
	describeMissingPunchSide,
	evaluateAttendanceForMissingPunch,
} from "../helper/missing-punch-reminder.helper";

const dayAt = (iso: string) => new Date(iso);
const shift = { endTime: "15:45", isOff: false };

describe("missing-punch end-of-shift reminder evaluation", () => {
	it("flags clock-in without clock-out after shift end", () => {
		const result = evaluateAttendanceForMissingPunch(
			{
				timeIn: dayAt("2026-09-03T06:45:00+08:00"),
				timeOut: null,
				hoursWorked: "0:00",
				status: "PRESENT",
				date: dayAt("2026-09-03T00:00:00+08:00"),
				scheduleSnapshot: shift,
			},
			dayAt("2026-09-03T18:00:00+08:00"),
		);
		expect(result.missing).to.equal(true);
		expect(result.side).to.equal("clock-out");
	});

	it("flags clock-out without clock-in on a past workday", () => {
		const result = evaluateAttendanceForMissingPunch(
			{
				timeIn: null,
				timeOut: dayAt("2026-09-03T18:00:00+08:00"),
				hoursWorked: "0:00",
				status: "INCOMPLETE",
				date: dayAt("2026-09-03T00:00:00+08:00"),
				scheduleSnapshot: shift,
			},
			dayAt("2026-09-04T09:00:00+08:00"),
		);
		expect(result.missing).to.equal(true);
		expect(result.side).to.equal("clock-in");
	});

	it("does not flag a complete punch pair", () => {
		const result = evaluateAttendanceForMissingPunch(
			{
				timeIn: dayAt("2026-09-03T06:45:00+08:00"),
				timeOut: dayAt("2026-09-03T15:45:00+08:00"),
				hoursWorked: "8:00",
				status: "PRESENT",
				date: dayAt("2026-09-03T00:00:00+08:00"),
				scheduleSnapshot: shift,
			},
			dayAt("2026-09-03T18:00:00+08:00"),
		);
		expect(result.missing).to.equal(false);
		expect(result.reason).to.equal("complete_pair");
	});

	it("does not flag rest days", () => {
		const result = evaluateAttendanceForMissingPunch(
			{
				timeIn: dayAt("2026-09-07T06:45:00+08:00"),
				timeOut: null,
				hoursWorked: "0:00",
				status: "REST_DAY",
				date: dayAt("2026-09-07T00:00:00+08:00"),
				scheduleSnapshot: { endTime: null, isOff: true },
			},
			dayAt("2026-09-07T18:00:00+08:00"),
		);
		expect(result.missing).to.equal(false);
		expect(result.reason).to.equal("rest_or_leave");
	});

	it("does not notify mid-shift before the shift ends", () => {
		const result = evaluateAttendanceForMissingPunch(
			{
				timeIn: dayAt("2026-09-03T06:45:00+08:00"),
				timeOut: null,
				hoursWorked: "0:00",
				status: "PRESENT",
				date: dayAt("2026-09-03T00:00:00+08:00"),
				scheduleSnapshot: shift,
			},
			dayAt("2026-09-03T10:00:00+08:00"),
		);
		expect(result.missing).to.equal(false);
		expect(result.reason).to.equal("shift_not_ended");
	});

	it("anchors the workday on the punches, not the boundary row date", () => {
		// Live shape (00985): out-only row stored at the Sep-7 day boundary
		// (2026-09-07T16:00:00Z) with a Sep-7 daytime tap. The Sep-7 shift
		// already ended, so it must notify even without a schedule snapshot.
		const result = evaluateAttendanceForMissingPunch(
			{
				timeIn: null,
				timeOut: dayAt("2026-09-07T10:00:00Z"),
				hoursWorked: "0:00",
				status: "INCOMPLETE",
				date: dayAt("2026-09-07T16:00:00Z"),
				scheduleSnapshot: null,
			},
			dayAt("2026-09-08T02:00:00Z"),
		);
		expect(result.missing).to.equal(true);
		expect(result.side).to.equal("clock-in");
	});

	it("describes the missing side", () => {
		expect(describeMissingPunchSide({ timeIn: new Date(), timeOut: null })).to.equal(
			"clock-out",
		);
		expect(describeMissingPunchSide({ timeIn: null, timeOut: new Date() })).to.equal(
			"clock-in",
		);
	});
});
