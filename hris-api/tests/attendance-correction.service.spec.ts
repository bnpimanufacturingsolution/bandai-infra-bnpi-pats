import { expect } from "chai";
import { CreateAttendanceCorrectionSchema } from "../zod/attendance.zod";
import {
	ATTENDANCE_CORRECTION_REASON_CATEGORY_OPTIONS,
	classifyAttendanceCorrectionStatus,
	normalizeAttendanceCorrectionPayload,
} from "../app/attendance/attendance-correction.service";

const VALID_ATTENDANCE_ID = "507f1f77bcf86cd799439011";
const VALID_EMPLOYEE_ID = "507f1f77bcf86cd799439012";
const CORRECTION_DATE = "2026-06-09";

describe("attendance correction service", () => {
	it("classifies worked, incomplete, and non-worked statuses distinctly", () => {
		expect(classifyAttendanceCorrectionStatus("PRESENT" as any)).to.deep.include({
			classification: "WORKED",
			isNonWorked: false,
			requiresFullWindow: true,
			allowsPartialWindow: false,
			requiresTimeIn: true,
		});
		expect(classifyAttendanceCorrectionStatus("INCOMPLETE" as any)).to.deep.include({
			classification: "INCOMPLETE",
			isNonWorked: false,
			requiresFullWindow: false,
			allowsPartialWindow: true,
			requiresTimeIn: true,
		});
		expect(classifyAttendanceCorrectionStatus("LEAVE" as any)).to.deep.include({
			classification: "NON_WORKED",
			isNonWorked: true,
			requiresFullWindow: false,
			allowsPartialWindow: false,
			requiresTimeIn: false,
		});
		expect(classifyAttendanceCorrectionStatus("ABSENT" as any)).to.deep.include({
			classification: "NON_WORKED",
			isNonWorked: true,
		});
		expect(classifyAttendanceCorrectionStatus("REST_DAY" as any)).to.deep.include({
			classification: "NON_WORKED",
			isNonWorked: true,
		});
	});

	it("normalizes worked-day corrections with a full time window", () => {
		const result = normalizeAttendanceCorrectionPayload(
			{
				attendanceId: VALID_ATTENDANCE_ID,
				employeeId: VALID_EMPLOYEE_ID,
				correctionDate: CORRECTION_DATE,
				status: "PRESENT",
				timeIn: "08:15",
				timeOut: "17:30",
				reasonCategory: "MISSED_PUNCH",
				notes: "  primary note  ",
			},
			{
				requireAttendanceId: true,
			},
		);

		expect(result.ok).to.equal(true);
		expect(result.issues).to.deep.equal([]);
		expect(result.payload).to.not.equal(null);
		expect(result.payload).to.deep.include({
			attendanceId: VALID_ATTENDANCE_ID,
			employeeId: VALID_EMPLOYEE_ID,
			correctionDateKey: CORRECTION_DATE,
			classification: "WORKED",
			status: "PRESENT",
			reasonCategory: "MISSED_PUNCH",
			notes: "primary note",
			source: "HR_DIRECT_CORRECTION",
		});
		expect(result.payload?.startOfDay.toISOString()).to.equal("2026-06-09T00:00:00.000Z");
		expect(result.payload?.endOfDay.toISOString()).to.equal("2026-06-09T23:59:59.999Z");
		expect(result.payload?.timeIn?.toISOString()).to.equal("2026-06-09T08:15:00.000Z");
		expect(result.payload?.timeOut?.toISOString()).to.equal("2026-06-09T17:30:00.000Z");
	});

	it("nulls time windows and locations for non-worked corrections", () => {
		const result = normalizeAttendanceCorrectionPayload(
			{
				attendanceId: VALID_ATTENDANCE_ID,
				employeeId: VALID_EMPLOYEE_ID,
				correctionDate: CORRECTION_DATE,
				status: "ABSENT",
				timeIn: "08:15",
				timeOut: "17:30",
				timeInLocation: "gate-a",
				timeOutLocation: "gate-b",
				reasonCategory: "WRONG_STATUS",
				notes: "  ",
			},
			{
				requireAttendanceId: true,
				notesFallbacks: ["  fallback note  "],
			},
		);

		expect(result.ok).to.equal(true);
		expect(result.payload).to.not.equal(null);
		expect(result.payload).to.deep.include({
			classification: "NON_WORKED",
			timeIn: null,
			timeOut: null,
			timeInLocation: null,
			timeOutLocation: null,
			notes: "fallback note",
		});
	});

	it("allows incomplete corrections to carry a partial time window", () => {
		const result = normalizeAttendanceCorrectionPayload(
			{
				attendanceId: VALID_ATTENDANCE_ID,
				employeeId: VALID_EMPLOYEE_ID,
				correctionDate: CORRECTION_DATE,
				status: "INCOMPLETE",
				timeIn: "08:15",
				timeOut: "",
				reasonCategory: "MANUAL_REVIEW",
				notes: null,
			},
			{
				requireAttendanceId: true,
				notesFallbacks: ["  secondary note  "],
			},
		);

		expect(result.ok).to.equal(true);
		expect(result.payload).to.not.equal(null);
		expect(result.payload).to.deep.include({
			classification: "INCOMPLETE",
			timeOut: null,
			notes: "secondary note",
		});
		expect(result.payload?.timeIn?.toISOString()).to.equal("2026-06-09T08:15:00.000Z");
	});

	it("rejects incomplete corrections that do not include a clock-in time", () => {
		const result = normalizeAttendanceCorrectionPayload(
			{
				attendanceId: VALID_ATTENDANCE_ID,
				employeeId: VALID_EMPLOYEE_ID,
				correctionDate: CORRECTION_DATE,
				status: "INCOMPLETE",
				timeIn: "",
				timeOut: "",
				reasonCategory: "MANUAL_REVIEW",
				notes: "Needs a correction trail",
			},
			{
				requireAttendanceId: true,
			},
		);

		expect(result.ok).to.equal(false);
		expect(result.issues).to.deep.include({
			field: "timeIn",
			message: "Time In is required for incomplete corrections.",
		});
	});

	it("rejects worked-day corrections that do not include a valid time window", () => {
		const result = normalizeAttendanceCorrectionPayload(
			{
				attendanceId: VALID_ATTENDANCE_ID,
				employeeId: VALID_EMPLOYEE_ID,
				correctionDate: CORRECTION_DATE,
				status: "PRESENT",
				timeIn: "08:15",
				timeOut: "",
				reasonCategory: "DEVICE_SYNC",
			},
			{
				requireAttendanceId: true,
			},
		);

		expect(result.ok).to.equal(false);
		expect(result.issues.map((issue) => issue.field)).to.include("timeOut");
	});

	it("honors the reason-category allowlist from shared configuration", () => {
		const result = normalizeAttendanceCorrectionPayload(
			{
				attendanceId: VALID_ATTENDANCE_ID,
				employeeId: VALID_EMPLOYEE_ID,
				correctionDate: CORRECTION_DATE,
				status: "PRESENT",
				timeIn: "08:15",
				timeOut: "17:30",
				reasonCategory: "DEVICE_SYNC",
			},
			{
				requireAttendanceId: true,
				allowedReasonCategories: ["MISSED_PUNCH"],
			},
		);

		expect(result.ok).to.equal(false);
		expect(result.issues).to.deep.include({
			field: "reasonCategory",
			message: "Reason category must be one of: MISSED_PUNCH",
		});
	});

	it("requires a non-empty explanation after notes fallback resolution", () => {
		const result = normalizeAttendanceCorrectionPayload(
			{
				attendanceId: VALID_ATTENDANCE_ID,
				employeeId: VALID_EMPLOYEE_ID,
				correctionDate: CORRECTION_DATE,
				status: "ABSENT",
				reasonCategory: "WRONG_STATUS",
				notes: "   ",
			},
			{
				requireAttendanceId: true,
				notesFallbacks: ["   "],
			},
		);

		expect(result.ok).to.equal(false);
		expect(result.issues).to.deep.include({
			field: "notes",
			message: "Explanation is required for attendance corrections.",
		});
	});

	it("accepts incomplete corrections in the shared schema", () => {
		const parsed = CreateAttendanceCorrectionSchema.safeParse({
			attendanceId: VALID_ATTENDANCE_ID,
			employeeId: VALID_EMPLOYEE_ID,
			correctionDate: CORRECTION_DATE,
			status: "INCOMPLETE",
			timeIn: "08:15",
			timeOut: null,
			reasonCategory: ATTENDANCE_CORRECTION_REASON_CATEGORY_OPTIONS[2],
			notes: "Clocked in but missed clock out.",
		});

		expect(parsed.success).to.equal(true);
	});
});
