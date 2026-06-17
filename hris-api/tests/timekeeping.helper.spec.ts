import { expect } from "chai";
import {
	calculateTimekeeping,
	deriveBehaviorFlags,
	deriveGracePeriodStatus,
} from "../helper/timekeeping.helper";

const nightShiftSchedule = {
	graceLateMinutes: 0,
	shifts: [
		{ label: "Sunday", isRestDay: true, timeSlots: [] },
		{ label: "Monday", isRestDay: true, timeSlots: [] },
		{ label: "Tuesday", isRestDay: true, timeSlots: [] },
		{
			label: "Wednesday",
			isRestDay: false,
			timeSlots: [
				{ type: "work", label: "First half", startTime: "20:00", endTime: "00:00" },
				{ type: "break", label: "Meal break", startTime: "00:00", endTime: "01:00" },
				{ type: "work", label: "Second half", startTime: "01:00", endTime: "05:00" },
			],
		},
		{ label: "Thursday", isRestDay: true, timeSlots: [] },
		{ label: "Friday", isRestDay: true, timeSlots: [] },
		{ label: "Saturday", isRestDay: true, timeSlots: [] },
	],
};

const dayShiftSchedule = {
	graceLateMinutes: 0,
	shifts: [
		{ label: "Sunday", isRestDay: true, timeSlots: [] },
		{
			label: "Monday",
			isRestDay: false,
			timeSlots: [
				{ type: "work", label: "Morning", startTime: "09:00", endTime: "12:00" },
				{ type: "break", label: "Lunch", startTime: "12:00", endTime: "13:00" },
				{ type: "work", label: "Afternoon", startTime: "13:00", endTime: "17:00" },
			],
		},
		{ label: "Tuesday", isRestDay: true, timeSlots: [] },
		{ label: "Wednesday", isRestDay: true, timeSlots: [] },
		{ label: "Thursday", isRestDay: true, timeSlots: [] },
		{ label: "Friday", isRestDay: true, timeSlots: [] },
		{ label: "Saturday", isRestDay: true, timeSlots: [] },
	],
};

describe("timekeeping helper", () => {
	it("deducts scheduled break time from late minutes when clock-in is after break", () => {
		const result = calculateTimekeeping(
			new Date("2026-05-14T01:00:00+08:00"),
			new Date("2026-05-14T05:00:00+08:00"),
			nightShiftSchedule as any,
			new Date("2026-05-13T00:00:00.000Z"),
		);

		expect(result.breakMinutes).to.equal(0);
		expect(result.lateMinutes).to.equal(240);
	});

	it("deducts scheduled break time from early-out minutes when clock-out is before break", () => {
		const result = calculateTimekeeping(
			new Date("2026-01-12T09:00:00+08:00"),
			new Date("2026-01-12T12:00:00+08:00"),
			dayShiftSchedule as any,
			new Date("2026-01-12T00:00:00.000Z"),
		);

		expect(result.breakMinutes).to.equal(0);
		expect(result.earlyOutMinutes).to.equal(240);
		expect(result.undertimeMinutes).to.equal(240);
	});

	it("does not produce negative regular minutes for punches after scheduled end", () => {
		const result = calculateTimekeeping(
			new Date("2026-01-12T18:31:00+08:00"),
			new Date("2026-01-12T18:32:00+08:00"),
			dayShiftSchedule as any,
			new Date("2026-01-12T00:00:00.000Z"),
		);

		expect(result.totalMinutesWorked).to.equal(1);
		expect(result.overtimeMinutes).to.equal(1);
		expect(result.regularMinutes).to.equal(0);
	});

	it("does not create excess time for a zero-minute punch after scheduled end", () => {
		const result = calculateTimekeeping(
			new Date("2026-01-12T18:30:00+08:00"),
			new Date("2026-01-12T18:30:00+08:00"),
			dayShiftSchedule as any,
			new Date("2026-01-12T00:00:00.000Z"),
		);

		expect(result.totalMinutesWorked).to.equal(0);
		expect(result.overtimeMinutes).to.equal(0);
		expect(result.regularMinutes).to.equal(0);
	});

	it("splits worked minutes when the punch crosses scheduled end", () => {
		const result = calculateTimekeeping(
			new Date("2026-01-12T16:30:00+08:00"),
			new Date("2026-01-12T17:30:00+08:00"),
			dayShiftSchedule as any,
			new Date("2026-01-12T00:00:00.000Z"),
		);

		expect(result.totalMinutesWorked).to.equal(60);
		expect(result.regularMinutes).to.equal(30);
		expect(result.overtimeMinutes).to.equal(30);
	});

	it("does not flag one-minute after-shift punches as overtime", () => {
		const flags = deriveBehaviorFlags({
			timeIn: new Date("2026-01-12T18:31:00+08:00"),
			timeOut: new Date("2026-01-12T18:32:00+08:00"),
			schedule: dayShiftSchedule as any,
			date: new Date("2026-01-12T00:00:00.000Z"),
			overtimeThresholdMinutes: 60,
		});

		expect(flags).not.to.include("OVERTIME");
	});

	it("derives grace status from an attendance schedule snapshot", () => {
		const status = deriveGracePeriodStatus(
			new Date("2026-06-08T11:26:00+08:00"),
			{
				graceLateMinutes: 15,
				startTime: "06:00",
				endTime: "14:00",
				timeSlots: [
					{ type: "work", label: "Work", startTime: "06:00", endTime: "14:00" },
				],
			} as any,
			new Date("2026-06-08T00:00:00.000Z"),
		);

		expect(status.rawLateMinutes).to.equal(326);
		expect(status.gracePeriodMinutes).to.equal(15);
		expect(status.withinGrace).to.equal(false);
	});

	it("counts only missed scheduled work as late when clock-in lands during break", () => {
		const result = calculateTimekeeping(
			new Date("2026-06-08T11:26:00+08:00"),
			null,
			{
				graceLateMinutes: 0,
				startTime: "06:00",
				endTime: "14:00",
				timeSlots: [
					{ type: "work", label: "First half", startTime: "06:00", endTime: "11:15" },
					{ type: "break", label: "Break", startTime: "11:15", endTime: "11:45" },
					{ type: "work", label: "Second half", startTime: "11:45", endTime: "14:00" },
				],
			} as any,
			new Date("2026-06-08T00:00:00.000Z"),
		);

		expect(result.lateMinutes).to.equal(315);
	});
});
