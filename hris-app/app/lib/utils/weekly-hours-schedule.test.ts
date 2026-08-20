import { describe, expect, it } from "vitest";
import {
	buildDefaultWeeklyHoursDays,
	buildWeeklyHoursPatternPayload,
	daysFromEmbeddedPattern,
	validateWeeklyHoursDays,
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
});
