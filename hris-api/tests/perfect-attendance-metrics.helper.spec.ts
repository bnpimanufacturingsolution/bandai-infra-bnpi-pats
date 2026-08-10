import { describe, expect, it } from "vitest";
import {
	attendanceMinutesFromFields,
	parseTimeToMinutes,
} from "../helper/attendance-metrics-common.helper";

/**
 * Pure-unit coverage for the violation parsing used by perfectAttendanceMetrics.
 * Full Prisma path is proven live on DEV via /api/metrics probes.
 */
describe("attendance metrics time parsing (perfect attendance / tardiness)", () => {
	it("treats 0:00 and empty hour strings as zero minutes", () => {
		expect(parseTimeToMinutes(null)).toBe(0);
		expect(parseTimeToMinutes(undefined)).toBe(0);
		expect(parseTimeToMinutes("")).toBe(0);
		expect(parseTimeToMinutes("0:00")).toBe(0);
		expect(parseTimeToMinutes("00:00")).toBe(0);
		expect(parseTimeToMinutes("0")).toBe(0);
	});

	it("parses real late / undertime durations", () => {
		expect(parseTimeToMinutes("0:15")).toBe(15);
		expect(parseTimeToMinutes("1:30")).toBe(90);
		expect(parseTimeToMinutes("5:13")).toBe(5 * 60 + 13);
	});

	it("prefers positive numeric minute fields over hour strings", () => {
		expect(attendanceMinutesFromFields("0:00", 20)).toBe(20);
		expect(attendanceMinutesFromFields("0:15", 0)).toBe(15);
		expect(attendanceMinutesFromFields("0:00", 0)).toBe(0);
		expect(attendanceMinutesFromFields(null, null)).toBe(0);
	});

	it("does not treat truthy 0:00 strings as violations", () => {
		// Mirrors perfect-attendance-metrics.helper attendanceHasViolation logic.
		const hasViolation = (lateHours: string | null, lateMinutes: number | null, status: string) => {
			const statusKey = String(status || "").toUpperCase();
			if (statusKey === "LEAVE" || statusKey === "ABSENT") return true;
			return attendanceMinutesFromFields(lateHours, lateMinutes) > 0;
		};

		expect(hasViolation("0:00", 0, "PRESENT")).toBe(false);
		expect(hasViolation("0:00", null, "PRESENT")).toBe(false);
		expect(hasViolation("0:20", 0, "PRESENT")).toBe(true);
		expect(hasViolation("0:00", 12, "PRESENT")).toBe(true);
		expect(hasViolation("0:00", 0, "LEAVE")).toBe(true);
	});
});
