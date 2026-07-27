import { expect } from "chai";
import { CreateAttendanceBackfillSchema } from "../zod/attendance.zod";
import { AttendanceCorrectionError } from "../app/attendance/attendance-correction.service";
import { applyAttendanceBackfill } from "../app/attendance/attendance-backfill.service";

const VALID_EMPLOYEE_ID = "507f1f77bcf86cd799439012";
const BACKFILL_DATE = "2026-06-10";

const TIMEKEEPING_FIELDS = {
	totalMinutesWorked: 480,
	regularMinutes: 480,
	overtimeMinutes: 0,
	undertimeMinutes: 0,
	lateMinutes: 0,
	earlyOutMinutes: 0,
	breakMinutes: 0,
	hoursWorked: "8:00",
	regularHours: "8:00",
	overtimeHours: "0:00",
	undertimeHours: "0:00",
	lateHours: "0:00",
	earlyOutHours: "0:00",
};

describe("attendance backfill service", () => {
	it("accepts backfill payloads without an attendanceId", () => {
		const parsed = CreateAttendanceBackfillSchema.safeParse({
			employeeId: VALID_EMPLOYEE_ID,
			correctionDate: BACKFILL_DATE,
			status: "PRESENT",
			timeIn: "08:15",
			timeOut: "17:15",
			reasonCategory: "MISSED_PUNCH",
			notes: "Created missing attendance row",
		});

		expect(parsed.success).to.equal(true);
	});

	it("creates a raw attendance row when the day has no existing attendance", async () => {
		const findMany = async () => [];
		const create = async (args: any) => ({
			id: "attendance-backfill-1",
			organizationId: args.data.organizationId,
			employeeId: args.data.employeeId,
			status: args.data.status,
			ledgerType: args.data.ledgerType,
			isManualEntry: args.data.isManualEntry,
			isEffective: args.data.isEffective,
			appliedBy: args.data.appliedBy,
			timeIn: args.data.timeIn,
			timeOut: args.data.timeOut,
			hoursWorked: args.data.hoursWorked,
			totalMinutesWorked: args.data.totalMinutesWorked,
			regularMinutes: args.data.regularMinutes,
			overtimeMinutes: args.data.overtimeMinutes,
			undertimeMinutes: args.data.undertimeMinutes,
			lateMinutes: args.data.lateMinutes,
			earlyOutMinutes: args.data.earlyOutMinutes,
			breakMinutes: args.data.breakMinutes,
			regularHours: args.data.regularHours,
			overtimeHours: args.data.overtimeHours,
			undertimeHours: args.data.undertimeHours,
			lateHours: args.data.lateHours,
			earlyOutHours: args.data.earlyOutHours,
			deviceInfo: args.data.deviceInfo,
		});
		const prisma = {
			attendance: { findMany, create },
		} as any;
		const resolveEffectiveShift = async () => ({ id: "shift-1", name: "Day Shift" });
		const fetchAttendanceEmployeeSnapshotFields = async () => ({
			employeeCodeSnapshot: "EMP-001",
			employeeNameSnapshot: "Amina Reyes",
			departmentIdSnapshot: "dept-ops",
			departmentNameSnapshot: "Operations",
			reportToIdSnapshot: null,
			workforceSourceSnapshot: "DIRECT",
			agencyIdSnapshot: null,
		});
		const calculateTimekeeping = () => ({
			totalMinutesWorked: 480,
			regularMinutes: 480,
			overtimeMinutes: 0,
			undertimeMinutes: 0,
			lateMinutes: 0,
			earlyOutMinutes: 0,
			breakMinutes: 0,
		});
		const resolveOvertimePolicyApplication = async () => ({
			policy: {
				requireManagerApprovedOvertime: true,
				overtimeFlagThresholdMinutes: 60,
			},
			timekeepingFields: TIMEKEEPING_FIELDS,
			metadata: {
				overtimeCandidate: false,
				pendingOvertimeMinutes: 0,
				pendingOvertimeHours: "0:00",
				overtimeCandidateReason: null,
				overtimeRequestId: null,
				overtimeApprovalStatus: "NONE" as const,
			},
			behaviorFlags: [],
		});
		const applyAttendanceToObligation = async () => ({ id: "obligation-1" });
		const refreshTimesheetForAttendanceDate = async () => ({ id: "timesheet-1" });
		const invalidateCacheByPattern = async () => undefined;

		const result = await applyAttendanceBackfill({
			prisma,
			organizationId: "org-1",
			rawInput: {
				employeeId: VALID_EMPLOYEE_ID,
				correctionDate: BACKFILL_DATE,
				status: "PRESENT",
				timeIn: "08:15",
				timeOut: "17:15",
				reasonCategory: "MISSED_PUNCH",
				notes: "Created missing attendance row",
			},
			source: "HR_DIRECT_BACKFILL",
			actorEmployeeId: "employee-hr",
			dependencies: {
				resolveEffectiveShift,
				fetchAttendanceEmployeeSnapshotFields,
				calculateTimekeeping,
				resolveOvertimePolicyApplication,
				applyAttendanceToObligation,
				refreshTimesheetForAttendanceDate,
				invalidateCacheByPattern,
			},
		});

		expect(result.sameDayAttendances).to.deep.equal([]);
		expect(result.createdAttendance).to.include({
			id: "attendance-backfill-1",
			ledgerType: "RAW",
			isManualEntry: true,
			isEffective: true,
			status: "PRESENT",
		});
		expect(result.createdAttendance.deviceInfo).to.deep.include({
			source: "HR_DIRECT_BACKFILL",
			mode: "BACKFILL",
			reasonCategory: "MISSED_PUNCH",
			actorEmployeeId: "employee-hr",
			classification: "WORKED",
		});
		expect(result.createdAttendance.appliedBy).to.equal("employee-hr");
		expect(result.obligation).to.deep.equal({ id: "obligation-1" });
		expect(result.refreshedTimesheet).to.deep.equal({ id: "timesheet-1" });
		expect(result.attendanceHistory).to.have.length(1);
		expect(result.attendanceHistory[0].id).to.equal("attendance-backfill-1");
		expect(result.createdAttendance.timeIn?.toISOString()).to.equal(
			"2026-06-10T08:15:00.000Z",
		);
		expect(result.createdAttendance.timeOut?.toISOString()).to.equal(
			"2026-06-10T17:15:00.000Z",
		);
		expect(result.createdAttendance.hoursWorked).to.equal("8:00");
		expect(result.createdAttendance.totalMinutesWorked).to.equal(480);
	});

	it("rejects backfill when an attendance already exists for the selected day", async () => {
		const prisma = {
			attendance: {
				findMany: async () => [{ id: "attendance-1" }],
				create: async () => {
					throw new Error("should not create");
				},
			},
		} as any;
		const resolveEffectiveShift = async () => {
			throw new Error("should not resolve");
		};

		try {
			await applyAttendanceBackfill({
				prisma,
				organizationId: "org-1",
				rawInput: {
					employeeId: VALID_EMPLOYEE_ID,
					correctionDate: BACKFILL_DATE,
					status: "PRESENT",
					timeIn: "08:15",
					timeOut: "17:15",
					reasonCategory: "MISSED_PUNCH",
					notes: "Created missing attendance row",
				},
				source: "HR_DIRECT_BACKFILL",
				actorEmployeeId: "employee-hr",
				dependencies: {
					resolveEffectiveShift,
				},
			});
			throw new Error("Expected attendance backfill to fail");
		} catch (error) {
			expect(error).to.be.instanceOf(AttendanceCorrectionError);
			expect((error as AttendanceCorrectionError).statusCode).to.equal(409);
			expect((error as Error).message).to.equal(
				"Attendance backfill requires no existing attendance record for the selected date.",
			);
		}
	});
});
