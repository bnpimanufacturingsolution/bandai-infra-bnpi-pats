import { describe, expect, it } from "vitest";
import { formatTimeSlotTime, getRecordShiftInfo } from "./attendance-shift";

describe("attendance-shift utils", () => {
	it("formats 24-hour time strings to 12-hour AM/PM format", () => {
		expect(formatTimeSlotTime("18:00")).toBe("6:00 PM");
		expect(formatTimeSlotTime("06:00")).toBe("6:00 AM");
		expect(formatTimeSlotTime("08:30:00")).toBe("8:30 AM");
		expect(formatTimeSlotTime("00:00")).toBe("12:00 AM");
		expect(formatTimeSlotTime("12:00")).toBe("12:00 PM");
		expect(formatTimeSlotTime("")).toBe("");
		expect(formatTimeSlotTime(null)).toBe("");
	});

	it("extracts shift info from scheduleSnapshot start/end times", () => {
		const row = {
			scheduleSnapshot: {
				shiftTypeName: "Night Shift",
				shiftTypeCode: "NS-12",
				startTime: "18:00",
				endTime: "06:00",
			},
		};

		const shift = getRecordShiftInfo(row);
		expect(shift.shiftName).toBe("Night Shift");
		expect(shift.shiftCode).toBe("NS-12");
		expect(shift.windowLabel).toBe("6:00 PM - 6:00 AM");
		expect(shift.fullLabel).toBe("Night Shift (6:00 PM - 6:00 AM)");
		expect(shift.isNightShift).toBe(true);
	});

	it("extracts shift info from scheduleSnapshot timeSlots", () => {
		const row = {
			scheduleSnapshot: {
				shiftTypeName: "Day Shift",
				timeSlots: [
					{ startTime: "06:00", endTime: "12:00", type: "WORK" },
					{ startTime: "13:00", endTime: "18:00", type: "WORK" },
				],
			},
		};

		const shift = getRecordShiftInfo(row);
		expect(shift.shiftName).toBe("Day Shift");
		expect(shift.windowLabel).toBe("6:00 AM - 6:00 PM");
		expect(shift.isNightShift).toBe(false);
	});

	it("infers shift window from clock in time when no snapshot is provided", () => {
		// Manila 18:00 is UTC 10:00
		const nightRow = {
			timeIn: "2026-08-27T10:15:00.000Z", // 18:15 in Manila
		};
		const nightShift = getRecordShiftInfo(nightRow);
		expect(nightShift.windowLabel).toBe("6:00 PM - 6:00 AM");
		expect(nightShift.isNightShift).toBe(true);

		// Manila 08:00 is UTC 00:00
		const dayRow = {
			timeIn: "2026-08-27T00:05:00.000Z", // 08:05 in Manila
		};
		const dayShift = getRecordShiftInfo(dayRow);
		expect(dayShift.windowLabel).toBe("6:00 AM - 6:00 PM");
		expect(dayShift.isNightShift).toBe(false);
	});

	it("handles unassigned or empty rows gracefully", () => {
		const emptyRow = {};
		const shift = getRecordShiftInfo(emptyRow);
		expect(shift.shiftName).toBe("Regular Shift");
		expect(shift.windowLabel).toBe("Unassigned");
	});
});
