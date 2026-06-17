import { expect } from "chai";
import {
	applyAttendanceToObligation,
	buildTimesheetBreakdownFromObligations,
	deriveAttendanceObligationDisplayStatus,
	recomputeAttendanceObligationsForRange,
} from "../helper/attendance-obligation.helper";

describe("attendance-obligation.helper", () => {
	describe("deriveAttendanceObligationDisplayStatus", () => {
		const now = new Date("2026-05-15T04:00:00.000Z");

		it("maps EXPECTED today to NOT_CLOCKED_IN", () => {
			expect(
				deriveAttendanceObligationDisplayStatus(
					{ status: "EXPECTED", businessDate: "2026-05-15" },
					now,
				),
			).to.equal("NOT_CLOCKED_IN");
		});

		it("maps EXPECTED past dates to ABSENT", () => {
			expect(
				deriveAttendanceObligationDisplayStatus(
					{ status: "EXPECTED", businessDate: "2026-05-14" },
					now,
				),
			).to.equal("ABSENT");
		});

		it("maps EXPECTED future dates to SCHEDULED", () => {
			expect(
				deriveAttendanceObligationDisplayStatus(
					{ status: "EXPECTED", businessDate: "2026-05-16" },
					now,
				),
			).to.equal("SCHEDULED");
		});

		it("preserves concrete stored attendance statuses", () => {
			expect(
				deriveAttendanceObligationDisplayStatus(
					{ status: "PRESENT", businessDate: "2026-05-14" },
					now,
				),
			).to.equal("PRESENT");
		});
	});

	describe("buildTimesheetBreakdownFromObligations", () => {
		it("projects submitted snapshot status from derived obligation display status", () => {
			const breakdown = buildTimesheetBreakdownFromObligations(
				[
					{
						id: "obligation-1",
						date: new Date("2026-05-14T00:00:00.000Z"),
						businessDate: "2026-05-14",
						status: "EXPECTED",
						hoursWorked: "0:00",
						regularHours: "0:00",
						overtimeHours: "0:00",
						undertimeHours: "0:00",
						lateHours: "0:00",
						earlyOutHours: "0:00",
						isDeleted: false,
					},
				],
				new Date("2026-05-15T04:00:00.000Z"),
			);

			expect(breakdown).to.have.length(1);
			expect(breakdown[0]).to.include({
				status: "ABSENT",
				storedStatus: "EXPECTED",
				isVirtual: true,
			});
			expect(breakdown[0].metadata).to.include({
				sourceOfTruth: "ATTENDANCE_OBLIGATION",
				obligationId: "obligation-1",
			});
		});
	});

	describe("event helpers", () => {
		it("queries only active employees for payroll-period generation", async () => {
			let employeeWhere: any = null;
			const prisma = {
				payrollPeriod: {
					findMany: async () => [
						{
							id: "period-1",
							startDate: new Date("2026-05-01T00:00:00.000Z"),
							endDate: new Date("2026-05-15T00:00:00.000Z"),
						},
					],
				},
				employee: {
					findMany: async (args: any) => {
						employeeWhere = args.where;
						return [];
					},
				},
				calendarItem: { findMany: async () => [] },
				request: { findMany: async () => [] },
			} as any;

			await recomputeAttendanceObligationsForRange(prisma, {
				organizationId: "org-1",
				fromDate: new Date("2026-05-01T00:00:00.000Z"),
				toDate: new Date("2026-05-15T00:00:00.000Z"),
				reason: "PayrollPeriodOpened",
			});

			expect(employeeWhere).to.include({ organizationId: "org-1" });
			expect(employeeWhere.AND[1].OR[0]).to.deep.equal({
				employmentStatus: { in: ["ACTIVE", "ONBOARDING"] },
			});
		});

		it("creates an onboarding employee obligation when only a placeholder termination date exists", async () => {
			let createPayload: any = null;
			const prisma = {
				payrollPeriod: {
					findMany: async () => [
						{
							id: "period-1",
							startDate: new Date("2026-05-01T00:00:00.000Z"),
							endDate: new Date("2026-05-15T23:59:59.999Z"),
							payFrequency: "SEMI_MONTHLY",
						},
					],
				},
				employee: {
					findMany: async () => [
						{
							id: "employee-1",
							organizationId: "org-1",
							employeeId: "EMP022",
							employmentStatus: "ONBOARDING",
							employmentStartDate: new Date("2026-05-15T00:00:00.000Z"),
							employmentHireDate: new Date("2026-05-15T00:00:00.000Z"),
							employmentTerminationDate: new Date("1970-01-01T00:00:00.000Z"),
							payFrequency: "SEMI_MONTHLY",
							workforceSource: "DIRECT",
							agencyId: null,
							reportToId: null,
							departmentId: "department-1",
							department: { id: "department-1", name: "Operations" },
							person: {
								personalInfo: { firstName: "Carlos", lastName: "Gonzalez" },
							},
						},
					],
				},
				calendarItem: { findMany: async () => [] },
				request: { findMany: async () => [] },
				attendance: { findFirst: async () => null },
				attendanceObligation: {
					findFirst: async () => null,
					create: async (args: any) => {
						createPayload = args;
						return { id: "obligation-1", ...args.data };
					},
				},
				scheduleOverride: { findFirst: async () => null },
			} as any;
			prisma.employee.findFirst = async () => ({
				id: "employee-1",
				embeddedSchedule: {
					cycleDays: 1,
					pattern: [
						{
							day: 1,
							shiftSnapshot: {
								name: "Regular Day Shift",
								code: "REGULAR_DAY",
								isOff: false,
								timeSlots: [
									{ type: "work", startTime: "08:00", endTime: "17:00" },
								],
							},
						},
					],
					effectiveStartDate: new Date("2026-05-15T00:00:00.000Z"),
				},
				employmentStartDate: new Date("2026-05-15T00:00:00.000Z"),
				employmentHireDate: new Date("2026-05-15T00:00:00.000Z"),
				scheduleHistoryRecords: [],
			});

			const result = await recomputeAttendanceObligationsForRange(prisma, {
				organizationId: "org-1",
				employeeId: "employee-1",
				fromDate: new Date("2026-05-15T00:00:00.000Z"),
				toDate: new Date("2026-05-15T00:00:00.000Z"),
				reason: "EmployeeCreated",
			});

			expect(result).to.include({ touched: 1, created: 1, updated: 0 });
			expect(createPayload.data).to.include({
				employeeId: "employee-1",
				businessDate: "2026-05-15",
				status: "EXPECTED",
				source: "EmployeeCreated",
				employeeCodeSnapshot: "EMP022",
			});
		});

		it("uses requesterId as the leave owner when aggregating approved leave requests", async () => {
			let createPayload: any = null;
			const prisma = {
				payrollPeriod: {
					findMany: async () => [
						{
							id: "period-1",
							startDate: new Date("2026-05-15T00:00:00.000Z"),
							endDate: new Date("2026-05-15T23:59:59.999Z"),
							payFrequency: "SEMI_MONTHLY",
						},
					],
				},
				employee: {
					findMany: async () => [
						{
							id: "employee-1",
							organizationId: "org-1",
							employeeId: "EMP-SUP-001",
							employmentStatus: "ACTIVE",
							employmentStartDate: new Date("2026-01-01T00:00:00.000Z"),
							employmentHireDate: new Date("2026-01-01T00:00:00.000Z"),
							employmentTerminationDate: null,
							payFrequency: "SEMI_MONTHLY",
							workforceSource: "DIRECT",
							agencyId: null,
							reportToId: null,
							departmentId: "department-1",
							department: { id: "department-1", name: "Engineering" },
							person: {
								personalInfo: { firstName: "Test", lastName: "Supervisor" },
							},
						},
					],
					findFirst: async () => ({
						id: "employee-1",
						embeddedSchedule: {
							cycleDays: 1,
							pattern: [
								{
									day: 1,
									shiftSnapshot: {
										name: "Regular Day Shift",
										code: "REGULAR_DAY",
										isOff: false,
										timeSlots: [
											{ type: "work", startTime: "08:00", endTime: "17:00" },
										],
									},
								},
							],
							effectiveStartDate: new Date("2026-01-01T00:00:00.000Z"),
						},
						employmentStartDate: new Date("2026-01-01T00:00:00.000Z"),
						employmentHireDate: new Date("2026-01-01T00:00:00.000Z"),
						scheduleHistoryRecords: [],
					}),
				},
				calendarItem: { findMany: async () => [] },
				request: {
					findMany: async () => [
						{
							id: "leave-request-1",
							requesterId: "employee-1",
							targetEmployeeId: "employee-2",
							startDate: new Date("2026-05-15T00:00:00.000Z"),
							endDate: new Date("2026-05-15T00:00:00.000Z"),
							metadata: { leaveType: "SICK" },
						},
					],
				},
				attendance: { findFirst: async () => null },
				attendanceObligation: {
					findFirst: async () => null,
					create: async (args: any) => {
						createPayload = args;
						return { id: "obligation-1", ...args.data };
					},
				},
				scheduleOverride: { findFirst: async () => null },
			} as any;

			const result = await recomputeAttendanceObligationsForRange(prisma, {
				organizationId: "org-1",
				employeeId: "employee-1",
				fromDate: new Date("2026-05-15T00:00:00.000Z"),
				toDate: new Date("2026-05-15T00:00:00.000Z"),
				reason: "LeaveApproved",
			});

			expect(result).to.include({ touched: 1, created: 1, updated: 0 });
			expect(createPayload.data).to.include({
				employeeId: "employee-1",
				businessDate: "2026-05-15",
				status: "LEAVE",
				source: "LEAVE_REQUEST",
				sourceRequestId: "leave-request-1",
			});
		});

		it("updates an existing expected obligation when a completed leave request exists", async () => {
			let updatePayload: any = null;
			const prisma = {
				payrollPeriod: {
					findMany: async () => [
						{
							id: "period-1",
							startDate: new Date("2026-05-15T00:00:00.000Z"),
							endDate: new Date("2026-05-15T23:59:59.999Z"),
							payFrequency: "SEMI_MONTHLY",
						},
					],
				},
				employee: {
					findMany: async () => [
						{
							id: "employee-hr-manager",
							organizationId: "org-1",
							employeeId: "EMP-HR-MGR-001",
							employmentStatus: "ACTIVE",
							employmentStartDate: new Date("2026-01-01T00:00:00.000Z"),
							employmentHireDate: new Date("2026-01-01T00:00:00.000Z"),
							employmentTerminationDate: null,
							payFrequency: "SEMI_MONTHLY",
							workforceSource: "DIRECT",
							agencyId: null,
							reportToId: null,
							departmentId: "department-1",
							department: { id: "department-1", name: "HR" },
							person: {
								personalInfo: { firstName: "Test", lastName: "HR Manager" },
							},
						},
					],
					findFirst: async () => ({
						id: "employee-hr-manager",
						embeddedSchedule: {
							cycleDays: 1,
							pattern: [
								{
									day: 1,
									shiftSnapshot: {
										name: "Regular Day Shift",
										code: "REGULAR_DAY",
										isOff: false,
										timeSlots: [
											{ type: "work", startTime: "08:00", endTime: "17:00" },
										],
									},
								},
							],
							effectiveStartDate: new Date("2026-01-01T00:00:00.000Z"),
						},
						employmentStartDate: new Date("2026-01-01T00:00:00.000Z"),
						employmentHireDate: new Date("2026-01-01T00:00:00.000Z"),
						scheduleHistoryRecords: [],
					}),
				},
				calendarItem: { findMany: async () => [] },
				request: {
					findMany: async () => [
						{
							id: "completed-leave-request",
							requesterId: "employee-hr-manager",
							targetEmployeeId: null,
							startDate: new Date("2026-05-15T00:00:00.000Z"),
							endDate: new Date("2026-05-15T00:00:00.000Z"),
							metadata: { leaveType: "SICK" },
						},
					],
				},
				attendance: { findFirst: async () => null },
				attendanceObligation: {
					findFirst: async () => ({
						id: "existing-obligation",
						phase: "ACTIVE",
						status: "EXPECTED",
						metadata: { reason: "PayrollPeriodOpened" },
					}),
					update: async (args: any) => {
						updatePayload = args;
						return { id: args.where.id, ...args.data };
					},
				},
				scheduleOverride: { findFirst: async () => null },
			} as any;

			const result = await recomputeAttendanceObligationsForRange(prisma, {
				organizationId: "org-1",
				employeeId: "employee-hr-manager",
				fromDate: new Date("2026-05-15T00:00:00.000Z"),
				toDate: new Date("2026-05-15T00:00:00.000Z"),
				reason: "LeaveSystemCompleted",
			});

			expect(result).to.include({ touched: 1, created: 0, updated: 1 });
			expect(updatePayload.where).to.deep.equal({ id: "existing-obligation" });
			expect(updatePayload.data).to.include({
				employeeId: "employee-hr-manager",
				businessDate: "2026-05-15",
				status: "LEAVE",
				source: "LEAVE_REQUEST",
				sourceRequestId: "completed-leave-request",
			});
		});

		it("updates the matching obligation when attendance is applied", async () => {
			let updatePayload: any = null;
			const attendance = {
				id: "attendance-1",
				organizationId: "org-1",
				employeeId: "employee-1",
				date: new Date("2026-05-15T00:00:00.000Z"),
				timeIn: new Date("2026-05-15T00:00:00.000Z"),
				timeOut: new Date("2026-05-15T09:00:00.000Z"),
				status: "PRESENT",
				behaviorFlags: [],
				scheduleSnapshot: {
					source: "template",
					startTime: "08:00",
					endTime: "17:00",
					isOff: false,
					timeSlots: [{ type: "work", startTime: "08:00", endTime: "17:00" }],
				},
			};
			const prisma = {
				attendance: {
					findFirst: async () => attendance,
				},
				payrollPeriod: {
					findFirst: async () => ({ id: "period-1" }),
				},
				attendanceObligation: {
					findFirst: async () => ({
						id: "obligation-1",
						phase: "ACTIVE",
						expectedStartAt: null,
						expectedEndAt: null,
						metadata: {},
					}),
					update: async (args: any) => {
						updatePayload = args;
						return { id: args.where.id, ...args.data };
					},
				},
				employee: {
					findUnique: async () => ({
						id: "employee-1",
						employeeId: "EMP-001",
						workforceSource: "DIRECT",
						agencyId: null,
						reportToId: null,
						departmentId: "department-1",
						department: { id: "department-1", name: "HR" },
						person: { personalInfo: { firstName: "Ava", lastName: "Reyes" } },
					}),
				},
			} as any;

			await applyAttendanceToObligation(prisma, {
				organizationId: "org-1",
				employeeId: "employee-1",
				attendanceId: "attendance-1",
				businessDate: "2026-05-15",
			});

			expect(updatePayload.where).to.deep.equal({ id: "obligation-1" });
			expect(updatePayload.data).to.include({
				attendanceId: "attendance-1",
				status: "PRESENT",
				businessDate: "2026-05-15",
				employeeCodeSnapshot: "EMP-001",
			});
		});
	});
});
