import { describe, expect, it } from "vitest";
import {
	buildAttendanceAdjustmentRequestPayload,
	buildOvertimeRequestPayload,
	isoToManilaPickerTime,
	manilaDateAndTimeToIso,
} from "./attendance-adjustment-request";

describe("attendance adjustment request payload", () => {
	it("converts Manila clock-out 17:00 on 2026-08-18 to 09:00Z", () => {
		expect(manilaDateAndTimeToIso("2026-08-18", "17:00")).toBe("2026-08-18T09:00:00.000Z");
	});

	it("reads an ISO punch back into a Manila picker value", () => {
		expect(isoToManilaPickerTime("2026-08-18T08:22:15.000Z")).toBe("16:22");
	});

	it("builds ATTENDANCE_CORRECTION metadata the approval side-effect can apply", () => {
		const payload = buildAttendanceAdjustmentRequestPayload({
			employeeId: "emp-zen",
			organizationId: "org-1",
			date: "2026-08-18",
			timeIn: "16:22",
			timeOut: "17:00",
			reasonCategory: "MISSED_PUNCH",
			notes: "Forgot to clock out",
			attendanceId: "att-1",
		});

		expect(payload.type).toBe("ATTENDANCE_CORRECTION");
		expect(payload.metadata.adjustmentType).toBe("MISSED_PUNCH");
		expect(payload.metadata.timeOut).toBe("2026-08-18T09:00:00.000Z");
		expect(payload.metadata.attendanceCorrection.attendanceId).toBe("att-1");
		expect(payload.metadata.attendanceCorrection.correctedValues.timeOut).toBe(
			"2026-08-18T09:00:00.000Z",
		);
	});

	it("does not send virtual absent-* ids as a real attendanceId", () => {
		const payload = buildAttendanceAdjustmentRequestPayload({
			employeeId: "emp-zen",
			organizationId: "org-1",
			date: "2026-08-14",
			timeIn: "08:00",
			timeOut: "16:00",
			reasonCategory: "MISSED_PUNCH",
			notes: "Forgot the clock in and clock out",
			attendanceId: "absent-2026-08-14",
		});
		expect(payload.metadata.attendanceCorrection.attendanceId).toBeNull();
	});

	it("allows a clock-out-only request when time in is already known", () => {
		const payload = buildAttendanceAdjustmentRequestPayload({
			employeeId: "emp-zen",
			organizationId: "org-1",
			date: "2026-08-18",
			timeIn: "16:22",
			timeOut: "17:00",
			reasonCategory: "MISSED_PUNCH",
			notes: "Forgot to clock out",
			adjustmentKind: "CLOCK_OUT",
		});
		expect(payload.metadata.adjustmentKind).toBe("CLOCK_OUT");
	});

	it("builds an overtime request for the supervisor workflow", () => {
		const payload = buildOvertimeRequestPayload({
			employeeId: "emp-zen",
			organizationId: "org-1",
			date: "2026-08-18",
			overtimeHours: 2,
			notes: "Finished a shipment",
		});
		expect(payload.type).toBe("OVERTIME");
		expect(payload.metadata.overtimeHours).toBe(2);
	});

	it("rejects a clock-out that is not after clock-in with both times named", () => {
		expect(() =>
			buildAttendanceAdjustmentRequestPayload({
				employeeId: "emp-zen",
				organizationId: "org-1",
				date: "2026-08-18",
				timeIn: "16:22",
				timeOut: "16:10",
				reasonCategory: "MISSED_PUNCH",
				notes: "Forgot to clock out",
			}),
		).toThrow("Time out (4:10 PM) must be after time in (4:22 PM).");
	});
});
