import { describe, expect, it } from "vitest";
import {
	formatAttendanceRateLabel,
	getAbsenteeismDisplay,
	getAttendanceCardCounts,
	getAttendanceUtilizationDisplay,
	getScheduledNotClockedIn,
} from "./attendance-utilization";

describe("getAttendanceUtilizationDisplay", () => {
	it("uses obligated-to-work as the stable denominator", () => {
		const display = getAttendanceUtilizationDisplay({
			totalClockedIn: 2,
			totalClockedInObligated: 1,
			totalObligatedToWork: 33,
			totalScheduledWorkDays: 33,
			utilizationRate: 3,
		});

		expect(display.clockedIn).to.equal(1);
		expect(display.obligated).to.equal(33);
		expect(display.rate).to.equal(3);
		expect(display.denominatorLabel).to.equal("scheduled to work");
	});

	it("does not add leave or unscheduled punches into the card totals", () => {
		const display = getAttendanceUtilizationDisplay({
			totalClockedIn: 5,
			totalClockedInObligated: 0,
			totalOnLeave: 4,
			totalObligatedToWork: 33,
			utilizationRate: 0,
		});

		expect(display.clockedIn).to.equal(0);
		expect(display.obligated).to.equal(33);
		expect(display.rate).to.equal(0);
	});

	it("computes absenteeism as absent plus not clocked in over scheduled", () => {
		const display = getAbsenteeismDisplay({
			totalAbsent: 0,
			totalNotClockedIn: 29,
			totalObligatedToWork: 1706,
			totalClockedInObligated: 11,
			totalClockedIn: 11,
		});

		expect(display.notClockedIn).to.equal(1695);
		expect(display.count).to.equal(1695);
		expect(display.scheduled).to.equal(1706);
		expect(display.rate).to.equal(99);
		expect(display.denominatorLabel).to.equal("scheduled to work");
	});

	it("ignores a leftover obligation not-clocked-in count", () => {
		expect(
			getScheduledNotClockedIn({
				totalAbsent: 0,
				totalNotClockedIn: 76,
				totalObligatedToWork: 1706,
				totalClockedInObligated: 0,
				totalClockedIn: 0,
			}),
		).to.equal(1706);
	});

	it("treats every scheduled person as not clocked in when nobody punched", () => {
		const display = getAbsenteeismDisplay({
			totalAbsent: 0,
			totalNotClockedIn: 76,
			totalObligatedToWork: 1706,
			totalClockedInObligated: 0,
			totalClockedIn: 0,
		});

		expect(display.notClockedIn).to.equal(1706);
		expect(display.count).to.equal(1706);
		expect(display.scheduled).to.equal(1706);
		expect(display.rate).to.equal(100);
	});

	it("shows a visible rate when one person clocked in out of hundreds scheduled", () => {
		const display = getAttendanceUtilizationDisplay({
			totalClockedInObligated: 1,
			totalObligatedToWork: 866,
		});
		expect(display.rate).to.equal(0);
		expect(display.rateLabel).to.equal("1%");
		expect(formatAttendanceRateLabel(0.12)).to.equal("1%");
	});

	it("does not invent on-time clock-ins when the API reports zero", () => {
		const counts = getAttendanceCardCounts({
			totalClockedIn: 7,
			totalClockedInObligated: 1,
			totalObligatedToWork: 866,
			totalOnTime: 0,
			totalLate: 1,
			totalClockedOut: 1,
		});
		expect(counts.clockedIn).to.equal(1);
		expect(counts.onTimeCount).to.equal(0);
		expect(counts.lateCount).to.equal(1);
		expect(counts.clockedOut).to.equal(1);
	});

	it("falls back to clocked-in plus not-clocked-in when obligated is zero", () => {
		const display = getAttendanceUtilizationDisplay({
			totalClockedIn: 12,
			totalClockedInObligated: 0,
			totalNotClockedIn: 30,
			totalAbsent: 0,
			totalObligatedToWork: 0,
			totalScheduledWorkDays: 0,
			utilizationRate: 0,
		});

		expect(display.clockedIn).to.equal(12);
		expect(display.obligated).to.equal(42);
		expect(display.rate).to.equal(29);
	});
});
