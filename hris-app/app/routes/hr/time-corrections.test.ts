import { describe, expect, it } from "vitest";
import {
	formatCorrectionWindow,
	getCorrectionSourceLabel,
	statusUsesWorkedWindow,
	validateCorrectionForm,
} from "./time-corrections";

describe("HR time correction form contract", () => {
	it("treats Present and Incomplete as worked-window statuses", () => {
		expect(statusUsesWorkedWindow("PRESENT")).toBe(true);
		expect(statusUsesWorkedWindow("INCOMPLETE")).toBe(true);
		expect(statusUsesWorkedWindow("ABSENT")).toBe(false);
		expect(statusUsesWorkedWindow("LEAVE")).toBe(false);
		expect(statusUsesWorkedWindow("REST_DAY")).toBe(false);
	});

	it("requires both clock fields for Present corrections", () => {
		const errors = validateCorrectionForm({
			employeeId: "employee-1",
			correctionDate: "2026-06-25",
			status: "PRESENT",
			timeIn: "08:00",
			timeOut: "",
			reasonCategory: "MISSED_PUNCH",
			notes: "Missed clock-out needs correction",
		});

		expect(errors.timeIn).toBeUndefined();
		expect(errors.timeOut).toBe("Time Out is required for worked-day corrections.");
	});

	it("allows Incomplete corrections to keep one side of the window blank", () => {
		expect(
			validateCorrectionForm({
				employeeId: "employee-1",
				correctionDate: "2026-06-25",
				status: "INCOMPLETE",
				timeIn: "08:00",
				timeOut: "",
				reasonCategory: "MISSED_PUNCH",
				notes: "Employee clocked in but missed clock-out",
			}),
		).toEqual({});
	});

	it("requires clock-in for Incomplete corrections", () => {
		const errors = validateCorrectionForm({
			employeeId: "employee-1",
			correctionDate: "2026-06-25",
			status: "INCOMPLETE",
			timeIn: "",
			timeOut: "",
			reasonCategory: "MISSED_PUNCH",
			notes: "Employee clocked in but missed clock-out",
		});

		expect(errors.timeIn).toBe("Time In is required for incomplete corrections.");
	});

	it("requires an explanation for every correction", () => {
		const errors = validateCorrectionForm({
			employeeId: "employee-1",
			correctionDate: "2026-06-25",
			status: "ABSENT",
			timeIn: "",
			timeOut: "",
			reasonCategory: "MISSED_PUNCH",
			notes: "   ",
		});

		expect(errors.notes).toBe("Explanation is required for attendance corrections.");
	});

	it("formats partial worked windows without forcing a fake end time", () => {
		expect(formatCorrectionWindow("INCOMPLETE", "08:00", "")).toBe("From 08:00 AM");
		expect(formatCorrectionWindow("INCOMPLETE", "", "17:00")).toBe("Until 05:00 PM");
	});

	it("labels correction provenance from the ledger source", () => {
		expect(getCorrectionSourceLabel({ deviceInfo: { source: "HR_DIRECT_CORRECTION" } } as any)).toBe(
			"Direct HR correction",
		);
		expect(
			getCorrectionSourceLabel({ deviceInfo: { source: "ATTENDANCE_CORRECTION_REQUEST" } } as any),
		).toBe("Approved request");
		expect(
			getCorrectionSourceLabel({ deviceInfo: { source: "LEAVE_REQUEST_APPROVAL" } } as any),
		).toBe("Approved leave request");
		expect(
			getCorrectionSourceLabel({ deviceInfo: { source: "HR_DIRECT_BACKFILL" } } as any),
		).toBe("Direct HR backfill");
	});

	it("requires an employee and a correction date", () => {
		const errors = validateCorrectionForm({
			employeeId: "",
			correctionDate: "",
			status: "ABSENT",
			timeIn: "",
			timeOut: "",
			reasonCategory: "MISSED_PUNCH",
			notes: "Backfilled from HR review",
		});

		expect(errors.employeeId).toBe("Employee is required.");
		expect(errors.correctionDate).toBe("Correction date is required.");
	});
});
