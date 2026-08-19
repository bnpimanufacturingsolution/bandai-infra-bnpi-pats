import { describe, expect, it } from "vitest";
import {
	deriveClockInArrivalFromSchedule,
	getClockInArrivalIndicator,
	getClockOutUndertimeIndicator,
	getWorkedHoursLabel,
} from "./attendance-arrival";

const dayShift = {
	startTime: "08:00",
	endTime: "17:00",
	graceLateMinutes: 10,
	timeSlots: [
		{ type: "work", startTime: "08:00", endTime: "12:00" },
		{ type: "break", startTime: "12:00", endTime: "13:00" },
		{ type: "work", startTime: "13:00", endTime: "17:00" },
	],
};

describe("clock-in arrival vs schedule", () => {
	it("marks 1:40 PM as late against an 8:00 AM start", () => {
		const arrival = deriveClockInArrivalFromSchedule(
			"2026-08-17T05:40:00.000Z",
			dayShift,
		);
		expect(arrival?.kind).toBe("LATE");
		expect(arrival?.lateHours).toBe("5:30");
		expect(arrival?.label).toBe("LATE");
	});

	it("marks a punch inside grace as GRACE", () => {
		const arrival = deriveClockInArrivalFromSchedule(
			"2026-08-17T00:08:00.000Z",
			dayShift,
		);
		expect(arrival?.kind).toBe("GRACE");
		expect(arrival?.minutes).toBe(8);
	});

	it("marks an on-time clock-in as ON TIME", () => {
		const arrival = deriveClockInArrivalFromSchedule(
			"2026-08-17T00:00:00.000Z",
			dayShift,
		);
		expect(arrival?.kind).toBe("ON_TIME");
		expect(arrival?.label).toBe("ON TIME");
	});

	it("uses stored lateHours when the API already evaluated the schedule", () => {
		const arrival = getClockInArrivalIndicator({
			timeIn: "2026-08-17T05:40:00.000Z",
			status: "INCOMPLETE",
			primaryMarker: "HOURS",
			lateHours: "5:40",
			computationMeta: { evaluatedFromSchedule: true, withinGrace: false },
		});
		expect(arrival?.kind).toBe("LATE");
		expect(arrival?.value).toBe("5h 40m");
	});

	it("marks a 2:55 PM clock-out as undertime against a 5:00 PM end", () => {
		const undertime = getClockOutUndertimeIndicator({
			timeIn: "2026-08-17T05:40:00.000Z",
			timeOut: "2026-08-17T06:55:00.000Z",
			status: "PRESENT",
			primaryMarker: "HOURS",
			scheduleSnapshot: dayShift,
		});
		expect(undertime?.kind).toBe("UT");
		expect(undertime?.label).toBe("UT");
		expect(undertime?.hours).toBe("2:05");
	});

	it("shows elapsed hours from clock-in to clock-out", () => {
		expect(
			getWorkedHoursLabel({
				timeIn: "2026-08-17T05:40:36.000Z",
				timeOut: "2026-08-17T06:55:36.000Z",
				hoursWorked: "0:00",
			}),
		).toBe("1h 15m");
	});

	it("does not invent late/on-time for rest days or missing punches", () => {
		expect(
			getClockInArrivalIndicator({
				timeIn: "2026-08-17T05:40:00.000Z",
				status: "REST_DAY",
				scheduleSnapshot: dayShift,
			}),
		).toBeNull();
		expect(
			getClockInArrivalIndicator({
				timeIn: null,
				status: "INCOMPLETE",
				scheduleSnapshot: dayShift,
			}),
		).toBeNull();
	});
});
