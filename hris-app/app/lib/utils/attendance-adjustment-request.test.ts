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

	it("builds an overtime request for HR with hours and minutes", () => {
		const payload = buildOvertimeRequestPayload({
			employeeId: "emp-zen",
			organizationId: "org-1",
			date: "2026-08-18",
			overtimeHourPart: 2,
			overtimeMinutePart: 50,
			notes: "Finished a shipment",
		});
		expect(payload.type).toBe("OVERTIME");
		expect(payload.metadata.overtimeHours).toBe("2:50");
		expect(payload.metadata.requestedOvertimeMinutes).toBe(170);
		expect(payload.metadata.workflowTarget).toBe("HR");
		expect(payload.description).toContain("2:50");
	});

	it("builds a leader-filed on-behalf overtime payload whose OT lands on the member", () => {
		const payload = buildOvertimeRequestPayload({
			// The OT is FOR the member...
			employeeId: "emp-member",
			organizationId: "org-1",
			date: "2026-08-18",
			overtimeHourPart: 2,
			overtimeMinutePart: 50,
			notes: "Line stayed late for a shipment",
			// ...while the requester is the acting line leader.
			onBehalf: { requesterEmployeeId: "emp-leader", filedByRole: "hris-line-leader" },
		});

		expect(payload.type).toBe("OVERTIME");
		expect(payload.requesterId).toBe("emp-leader");
		expect((payload as { targetEmployeeId?: string }).targetEmployeeId).toBe("emp-member");
		expect(payload.metadata.employeeId).toBe("emp-member");
		expect(payload.metadata.requestSource).toBe("LINE_LEADER_FILED");
		expect(payload.metadata.workflowTarget).toBe("MANAGER_THEN_HR");
		expect((payload.metadata as { filedBy?: { isLineLeader?: boolean } }).filedBy?.isLineLeader).toBe(
			true,
		);
		expect(payload.description).toContain("section member");
	});

	it("keeps self-filed overtime untouched when onBehalf points at the same employee", () => {
		const payload = buildOvertimeRequestPayload({
			employeeId: "emp-leader",
			organizationId: "org-1",
			date: "2026-08-18",
			overtimeHourPart: 1,
			overtimeMinutePart: 0,
			notes: "My own OT",
			onBehalf: { requesterEmployeeId: "emp-leader", filedByRole: "hris-line-leader" },
		});
		expect(payload.requesterId).toBe("emp-leader");
		expect((payload as { targetEmployeeId?: string }).targetEmployeeId).toBeUndefined();
		expect(payload.metadata.requestSource).toBe("EMPLOYEE_SELF_SERVICE");
		expect(payload.metadata.workflowTarget).toBe("HR");
	});

	it("stamps early OT (pre-shift) kind into metadata and description", () => {
		const payload = buildOvertimeRequestPayload({
			employeeId: "emp-member",
			organizationId: "org-1",
			date: "2026-08-18",
			overtimeHourPart: 1,
			overtimeMinutePart: 30,
			notes: "Started early for setup",
			overtimeKind: "EARLY",
		});
		expect(payload.metadata.overtimeKind).toBe("EARLY");
		expect(payload.metadata.earlyOvertime).toBe(true);
		expect(payload.description).toContain("early OT (pre-shift)");
	});

	it("defaults the overtime kind to REGULAR with no early flags", () => {
		const payload = buildOvertimeRequestPayload({
			employeeId: "emp-member",
			organizationId: "org-1",
			date: "2026-08-18",
			overtimeHourPart: 1,
			overtimeMinutePart: 0,
			notes: "Stayed late",
		});
		expect(payload.metadata.overtimeKind).toBe("REGULAR");
		expect(payload.metadata.earlyOvertime).toBeUndefined();
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
