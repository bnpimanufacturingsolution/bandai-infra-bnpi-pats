import { describe, expect, it } from "vitest";
import type { AttendanceRecord } from "~/services/metrics.service";

import { getEmployeesWithPresentDaysOverThreshold } from "./attendance-threshold";

function buildRecord(overrides: Partial<AttendanceRecord> & { id: string; date: string }) {
	return {
		id: overrides.id,
		employeeId: overrides.employeeId || "emp-a",
		employeeName: overrides.employeeName || "Employee",
		date: overrides.date,
		timeIn: overrides.timeIn ?? `${overrides.date}T08:00:00.000Z`,
		timeBreak: null,
		timeOut: overrides.timeOut ?? `${overrides.date}T17:00:00.000Z`,
		isOvernight: false,
		timeOutNextDay: false,
		status: overrides.status || "PRESENT",
		behaviorFlags: [],
		computationMeta: null,
		hoursWorked: "8:00",
		regularHours: "8:00",
		overtimeHours: "0:00",
		undertimeHours: "0:00",
		lateHours: "0:00",
		earlyOutHours: "0:00",
		breakMinutes: 60,
		isManualEntry: false,
		notes: null,
		timesheetId: null,
		isVirtual: false,
		primaryMarker: overrides.primaryMarker || "HOURS",
		leaveType: null,
		leaveEntries: [],
		holidayEntries: [],
	} as AttendanceRecord;
}

describe("getEmployeesWithPresentDaysOverThreshold", () => {
	it("returns only employees who have more than 10 unique present dates", () => {
		const qualifyingDates = Array.from({ length: 11 }, (_, index) =>
			`2026-06-${String(index + 1).padStart(2, "0")}`,
		);
		const duplicateDates = [
			"2026-06-01",
			"2026-06-02",
			"2026-06-03",
			"2026-06-04",
			"2026-06-05",
			"2026-06-06",
			"2026-06-07",
			"2026-06-08",
			"2026-06-09",
			"2026-06-10",
			"2026-06-10",
		];
		const absentDates = Array.from({ length: 12 }, (_, index) =>
			`2026-07-${String(index + 1).padStart(2, "0")}`,
		);
		const records = [
			...duplicateDates.map((date, index) =>
				buildRecord({
					id: `emp-a-${index}`,
					employeeId: "emp-a",
					employeeName: "Employee A",
					date,
					status: "PRESENT",
					primaryMarker: "HOURS",
				}),
			),
			...qualifyingDates.map((date, index) =>
				buildRecord({
					id: `emp-b-${index}`,
					employeeId: "emp-b",
					employeeName: "Employee B",
					date,
					status: "PRESENT",
					primaryMarker: "HOURS",
				}),
			),
			...absentDates.map((date, index) =>
				buildRecord({
					id: `emp-c-${index}`,
					employeeId: "emp-c",
					employeeName: "Employee C",
					date,
					status: "ABSENT",
					primaryMarker: "ABSENT",
					timeIn: null,
					timeOut: null,
					isVirtual: true,
				}),
			),
		];

		const result = getEmployeesWithPresentDaysOverThreshold(records);

		expect(Array.from(result).sort()).toEqual(["emp-b"]);
		expect(result.has("emp-a")).toBe(false);
		expect(result.has("emp-c")).toBe(false);
	});
});
