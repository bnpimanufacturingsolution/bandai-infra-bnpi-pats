import { expect } from "chai";
import {
	isHalfDaySessionCutoffReached,
	resolveLeaveSessionWindows,
} from "../helper/leave-session.helper";

describe("leave-session.helper", () => {
	const mondayDate = new Date("2026-03-02T00:00:00.000Z");

	it("derives AM/PM using schedule slot blocks (08:00-12:00, 13:00-18:00)", () => {
		const schedule = {
			shifts: [
				{
					label: "Monday",
					isRestDay: false,
					timeSlots: [
						{ type: "work", startTime: "08:00", endTime: "12:00" },
						{ type: "work", startTime: "13:00", endTime: "18:00" },
					],
				},
			],
		};

		const result = resolveLeaveSessionWindows(schedule, mondayDate);

		expect(result.am.windowStart).to.equal("08:00");
		expect(result.am.windowEnd).to.equal("12:00");
		expect(result.pm.windowStart).to.equal("13:00");
		expect(result.pm.windowEnd).to.equal("18:00");
	});

	it("keeps segmented blocks on each side of the largest gap", () => {
		const schedule = {
			shifts: [
				{
					label: "Monday",
					isRestDay: false,
					timeSlots: [
						{ type: "work", startTime: "08:00", endTime: "10:00" },
						{ type: "work", startTime: "10:15", endTime: "12:00" },
						{ type: "work", startTime: "13:00", endTime: "15:00" },
						{ type: "work", startTime: "15:15", endTime: "17:00" },
					],
				},
			],
		};

		const result = resolveLeaveSessionWindows(schedule, mondayDate);

		expect(result.am.windowStart).to.equal("08:00");
		expect(result.am.windowEnd).to.equal("12:00");
		expect(result.am.segments).to.have.length(2);
		expect(result.pm.windowStart).to.equal("13:00");
		expect(result.pm.windowEnd).to.equal("17:00");
		expect(result.pm.segments).to.have.length(2);
	});

	it("throws when half-day is requested on a rest day", () => {
		const schedule = {
			shifts: [{ label: "Monday", isRestDay: true, timeSlots: [] }],
		};

		expect(() => resolveLeaveSessionWindows(schedule, mondayDate)).to.throw(
			"Half-day leave is not allowed on rest days.",
		);
	});

	it("throws when no work slots are available", () => {
		const schedule = {
			shifts: [{ label: "Monday", isRestDay: false, timeSlots: [] }],
		};

		expect(() => resolveLeaveSessionWindows(schedule, mondayDate)).to.throw(
			"No work slots found in schedule for the selected date.",
		);
	});

	it("marks cutoff reached when now is same-day at/after session start", () => {
		const leaveDate = new Date(2026, 2, 2, 12, 0, 0);
		const now = new Date(2026, 2, 2, 14, 0, 0);

		expect(isHalfDaySessionCutoffReached(leaveDate, "13:00", now)).to.equal(true);
	});

	it("does not mark cutoff reached when same-day time is before session start", () => {
		const leaveDate = new Date(2026, 2, 2, 12, 0, 0);
		const now = new Date(2026, 2, 2, 12, 30, 0);

		expect(isHalfDaySessionCutoffReached(leaveDate, "13:00", now)).to.equal(false);
	});

	it("does not apply cutoff for non-today leave dates", () => {
		const leaveDate = new Date(2026, 2, 3, 12, 0, 0);
		const now = new Date(2026, 2, 2, 14, 0, 0);

		expect(isHalfDaySessionCutoffReached(leaveDate, "13:00", now)).to.equal(false);
	});
});
