import { expect } from "chai";
import {
	applyAttendanceCorrectionRequest,
	isVirtualAttendanceId,
} from "../app/attendance/apply-attendance-correction-request";

describe("apply attendance correction request", () => {
	it("treats absent-* ids as virtual so missing days can be backfilled", () => {
		expect(isVirtualAttendanceId("absent-2026-08-14")).to.equal(true);
		expect(isVirtualAttendanceId("cmsy8vn8d00j58h80mrl6tdgz")).to.equal(false);
		expect(isVirtualAttendanceId(null)).to.equal(true);
	});

	it("backfills a PRESENT row when the request points at a virtual absent day", async () => {
		const created: any[] = [];
		const prisma = {
			attendance: {
				findMany: async () => [],
				create: async (args: any) => {
					created.push(args.data);
					return {
						id: "attendance-created-1",
						...args.data,
					};
				},
			},
		} as any;

		const result = await applyAttendanceCorrectionRequest({
			prisma,
			organizationId: "org-1",
			requestId: "req-1",
			requesterId: "emp-zen",
			startDate: "2026-08-14T00:00:00.000Z",
			notes: "Forgot the clock in and clock out",
			metadata: {
				date: "2026-08-14",
				timeIn: "2026-08-14T00:00:00.000Z",
				timeOut: "2026-08-14T08:00:00.000Z",
				attendanceCorrection: {
					attendanceId: "absent-2026-08-14",
					employeeId: "emp-zen",
					correctionDate: "2026-08-14T00:00:00.000Z",
					reasonCategory: "MISSED_PUNCH",
					reason: "Forgot the clock in and clock out",
					correctedValues: {
						status: "PRESENT",
						timeIn: "2026-08-14T00:00:00.000Z",
						timeOut: "2026-08-14T08:00:00.000Z",
						notes: "Forgot the clock in and clock out",
					},
				},
			},
			actorEmployeeId: "emp-hr",
			dependencies: {
				resolveEffectiveShift: async () => ({ id: "shift-1" }),
				fetchAttendanceEmployeeSnapshotFields: async () => ({}),
				calculateTimekeeping: () => ({
					totalMinutesWorked: 480,
					regularMinutes: 480,
					overtimeMinutes: 0,
					undertimeMinutes: 0,
					lateMinutes: 0,
					earlyOutMinutes: 0,
					breakMinutes: 0,
				}),
				resolveOvertimePolicyApplication: async () => ({
					timekeepingFields: {
						hoursWorked: "8:00",
						totalMinutesWorked: 480,
					},
					behaviorFlags: [],
				}),
				applyAttendanceToObligation: async () => ({ id: "obligation-1" }),
				refreshTimesheetForAttendanceDate: async () => ({ id: "timesheet-1" }),
				invalidateCacheByPattern: async () => undefined,
			} as any,
		});

		expect(result.createdAttendance.id).to.equal("attendance-created-1");
		expect(created[0].status).to.equal("PRESENT");
		expect(created[0].ledgerType).to.equal("CORRECTION");
		expect(created[0].sourceRequestId).to.equal("req-1");
		expect(created[0].isEffective).to.equal(true);
	});
});
