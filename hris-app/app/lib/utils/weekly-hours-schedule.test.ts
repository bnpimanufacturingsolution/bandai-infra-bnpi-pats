import { describe, expect, it } from "vitest";
import {
	buildDateHoursShiftSnapshot,
	buildDefaultWeeklyHoursDays,
	buildWeeklyHoursPatternPayload,
	daysFromEmbeddedPattern,
	hoursDraftForDate,
	summarizeEmbeddedSchedule,
	toggleDateInSelection,
	validateDateHours,
	validateWeeklyHoursDays,
	weekdayIndexFromDateInput,
} from "./weekly-hours-schedule";

describe("weekly hours schedule helper", () => {
	it("defaults Mon-Fri work and weekend off", () => {
		const days = buildDefaultWeeklyHoursDays(7);
		expect(days.map((day) => day.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
		expect(days.filter((day) => day.isOff).map((day) => day.label)).toEqual(["Sat", "Sun"]);
	});

	it("builds Zen Monday 06:00-15:00 and Tuesday 07:00-16:00 payload", () => {
		const days = buildDefaultWeeklyHoursDays(7).map((day) => {
			if (day.label === "Mon") return { ...day, isOff: false, startTime: "06:00", endTime: "15:00" };
			if (day.label === "Tue") return { ...day, isOff: false, startTime: "07:00", endTime: "16:00" };
			return day;
		});
		const payload = buildWeeklyHoursPatternPayload(days);
		expect(payload[0].shiftSnapshot?.timeSlots?.[0]).toEqual({
			type: "work",
			label: "Work",
			startTime: "06:00",
			endTime: "15:00",
		});
		expect(payload[1].shiftSnapshot?.timeSlots?.[0]).toEqual({
			type: "work",
			label: "Work",
			startTime: "07:00",
			endTime: "16:00",
		});
		expect(payload[5].isOff).toBe(true);
		expect(validateWeeklyHoursDays(days)).toBeNull();
	});

	it("prefills from an embedded 7-day pattern", () => {
		const days = daysFromEmbeddedPattern(
			[
				{
					day: 1,
					shiftSnapshot: {
						isOff: false,
						timeSlots: [{ type: "work", startTime: "06:00", endTime: "15:00" }],
					},
				},
				{
					day: 2,
					shiftSnapshot: {
						isOff: false,
						timeSlots: [{ type: "work", startTime: "07:00", endTime: "16:00" }],
					},
				},
				{ day: 6, shiftSnapshot: { isOff: true, timeSlots: [] } },
			],
			7,
		);
		expect(days[0]).toMatchObject({ label: "Mon", startTime: "06:00", endTime: "15:00", isOff: false });
		expect(days[1]).toMatchObject({ label: "Tue", startTime: "07:00", endTime: "16:00", isOff: false });
		expect(days[5].isOff).toBe(true);
	});

	it("keeps default weekday hours when the saved pattern only has Monday", () => {
		const days = daysFromEmbeddedPattern(
			[
				{
					day: 1,
					shiftSnapshot: {
						isOff: false,
						timeSlots: [{ type: "work", startTime: "08:00", endTime: "17:00" }],
					},
				},
			],
			7,
		);
		expect(days[1]).toMatchObject({ label: "Tue", isOff: false, startTime: "08:00", endTime: "17:00" });
		expect(days[5].isOff).toBe(true);
	});

	it("maps a calendar Friday to weekday index 4 and copies that day's hours", () => {
		expect(weekdayIndexFromDateInput("2026-08-21")).toBe(4);
		const days = buildDefaultWeeklyHoursDays(7).map((day) =>
			day.label === "Fri" ? { ...day, startTime: "06:00", endTime: "15:00" } : day,
		);
		expect(hoursDraftForDate(days, "2026-08-21")).toMatchObject({
			label: "Fri",
			startTime: "06:00",
			endTime: "15:00",
		});
		expect(validateDateHours({ date: "2026-08-21", isOff: false, startTime: "06:00", endTime: "15:00" })).toBeNull();
		expect(buildDateHoursShiftSnapshot({ isOff: false, startTime: "06:00", endTime: "15:00" })?.timeSlots?.[0]).toEqual(
			{
				type: "work",
				label: "Work",
				startTime: "06:00",
				endTime: "15:00",
			},
		);
	});

	it("builds 8-5 with a 12-1 break and keeps multiple selected dates", () => {
		const snapshot = buildDateHoursShiftSnapshot({
			isOff: false,
			startTime: "08:00",
			endTime: "17:00",
			includeBreak: true,
			breakStartTime: "12:00",
			breakEndTime: "13:00",
		});
		expect(snapshot?.timeSlots).toEqual([
			{ type: "work", label: "Morning Work", startTime: "08:00", endTime: "12:00" },
			{ type: "break", label: "Break", startTime: "12:00", endTime: "13:00" },
			{ type: "work", label: "Afternoon Work", startTime: "13:00", endTime: "17:00" },
		]);
		expect(toggleDateInSelection(["2026-08-21"], "2026-08-22")).toEqual([
			"2026-08-21",
			"2026-08-22",
		]);
		expect(
			validateDateHours({
				dates: ["2026-08-21", "2026-08-22"],
				isOff: false,
				startTime: "09:00",
				endTime: "18:00",
				includeBreak: true,
				breakStartTime: "12:00",
				breakEndTime: "13:00",
			}),
		).toBeNull();
	});

	it("summarizes mixed weekday hours and empty schedules", () => {
		expect(summarizeEmbeddedSchedule(null)).toBe("No schedule");
		expect(summarizeEmbeddedSchedule({ cycleDays: 7, pattern: [] })).toBe("No schedule");
		expect(
			summarizeEmbeddedSchedule({
				cycleDays: 7,
				pattern: [
					{
						day: 1,
						shiftSnapshot: {
							isOff: false,
							timeSlots: [{ type: "work", startTime: "06:00", endTime: "15:00" }],
						},
					},
					{
						day: 2,
						shiftSnapshot: {
							isOff: false,
							timeSlots: [{ type: "work", startTime: "07:00", endTime: "16:00" }],
						},
					},
				],
			}),
		).toContain("Mon 06:00–15:00");
	});
});
