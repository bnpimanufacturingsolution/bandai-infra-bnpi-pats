import { expect } from "chai";
import { ensureDm3ScheduleBackedAttendanceObligations } from "../helper/dm3-attendance-obligation-repair.helper";

describe("dm3-attendance-obligation-repair.helper", () => {
	const buildPrismaMock = (params: {
		periods: any[];
		employees: any[];
		existing?: any;
	}) => {
		const creates: any[] = [];
		const updates: any[] = [];
		const prisma: any = {
			payrollPeriod: {
				findMany: async () => params.periods,
			},
			employee: {
				findMany: async () => params.employees,
			},
			attendanceObligation: {
				count: async () => creates.length + updates.length + (params.existing ? 1 : 0),
				findUnique: async () => params.existing || null,
				create: async (args: any) => {
					creates.push(args);
					return { id: `created-${creates.length}`, ...args.data };
				},
				update: async (args: any) => {
					updates.push(args);
					return { id: args.where.id, ...args.data };
				},
			},
		};
		return { prisma, creates, updates };
	};

	const buildEmployee = (overrides: any = {}) => ({
		id: "employee-db-1",
		employeeId: "01792",
		employmentStartDate: new Date("2026-03-23T00:00:00.000Z"),
		employmentHireDate: null,
		payFrequency: "SEMI_MONTHLY",
		departmentId: "department-1",
		reportToId: null,
		workforceSource: "DIRECT",
		agencyId: null,
		person: {
			personalInfo: { firstName: "Alexa Mae", lastName: "Hernandez" },
		},
		department: { name: "Administration" },
		embeddedSchedule: {
			templateId: "template-1",
			templateCode: "BNPI_SCHED_MON_SAT_WS_0815_1615_BR_1215_1245",
			templateName: "BNPI Mon-Sat 08:15 to 16:15, breaks 12:15 to 12:45",
			pattern: [
				{
					day: 1,
					shiftTypeId: "shift-1",
					shiftSnapshot: {
						code: "WS_0815_1615_BR_1215_1245",
						name: "08:15 to 16:15, breaks 12:15 to 12:45",
						isOff: false,
						timeSlots: [
							{ type: "work", startTime: "08:15", endTime: "12:15" },
							{ type: "break", startTime: "12:15", endTime: "12:45" },
							{ type: "work", startTime: "12:45", endTime: "16:15" },
						],
					},
				},
				{
					day: 2,
					shiftTypeId: "shift-1",
					shiftSnapshot: {
						code: "WS_0815_1615_BR_1215_1245",
						name: "08:15 to 16:15, breaks 12:15 to 12:45",
						isOff: false,
						timeSlots: [
							{ type: "work", startTime: "08:15", endTime: "12:15" },
							{ type: "break", startTime: "12:15", endTime: "12:45" },
							{ type: "work", startTime: "12:45", endTime: "16:15" },
						],
					},
				},
				{
					day: 3,
					shiftTypeId: "shift-1",
					shiftSnapshot: {
						code: "WS_0815_1615_BR_1215_1245",
						name: "08:15 to 16:15, breaks 12:15 to 12:45",
						isOff: false,
						timeSlots: [
							{ type: "work", startTime: "08:15", endTime: "12:15" },
							{ type: "break", startTime: "12:15", endTime: "12:45" },
							{ type: "work", startTime: "12:45", endTime: "16:15" },
						],
					},
				},
				{
					day: 4,
					shiftTypeId: "shift-1",
					shiftSnapshot: {
						code: "WS_0815_1615_BR_1215_1245",
						name: "08:15 to 16:15, breaks 12:15 to 12:45",
						isOff: false,
						timeSlots: [
							{ type: "work", startTime: "08:15", endTime: "12:15" },
							{ type: "break", startTime: "12:15", endTime: "12:45" },
							{ type: "work", startTime: "12:45", endTime: "16:15" },
						],
					},
				},
			],
		},
		...overrides,
	});

	it("updates existing obligation rows with canonical DM3 schedule snapshots", async () => {
		const period = {
			id: "period-1",
			code: "PP-TEST",
			startDate: new Date("2026-06-04T00:00:00.000Z"),
			endDate: new Date("2026-06-04T00:00:00.000Z"),
			payFrequency: "SEMI_MONTHLY",
		};
		const employee = buildEmployee();
		const { prisma, updates } = buildPrismaMock({
			periods: [period],
			employees: [employee],
			existing: {
					id: "obligation-1",
					attendanceId: null,
					timeIn: null,
					phase: "ACTIVE",
					metadata: { reason: "PayrollPeriodOpened" },
			},
		});

		const result = await ensureDm3ScheduleBackedAttendanceObligations(prisma, {
			organizationId: "org-1",
			employeeIds: [employee.id],
			fromDate: "2026-06-04",
			toDate: "2026-06-04",
		});

		expect(result.status).to.equal("COMPLETED");
		expect(result.inserted).to.equal(0);
		expect(result.updated).to.equal(1);
		expect(updates).to.have.length(1);
		const snapshot = updates[0].data.scheduleSnapshot;
		expect(snapshot.shiftTypeCode).to.equal("WS_0815_1615_BR_1215_1245");
		expect(snapshot.shiftTypeName).to.equal("08:15 to 16:15, breaks 12:15 to 12:45");
		expect(snapshot.scheduleTemplateCode).to.equal(
			"BNPI_SCHED_MON_SAT_WS_0815_1615_BR_1215_1245",
		);
		expect(snapshot.scheduleTemplateName).to.equal(
			"BNPI Mon-Sat 08:15 to 16:15, breaks 12:15 to 12:45",
		);
		expect(updates[0].data.metadata.sourceOfTruth).to.equal("Employee.embeddedSchedule");
	});

	it("does not materialize obligation rows before the employee start or hire date", async () => {
		const period = {
			id: "period-1",
			code: "PP-TEST",
			startDate: new Date("2026-06-01T00:00:00.000Z"),
			endDate: new Date("2026-06-04T00:00:00.000Z"),
			payFrequency: "SEMI_MONTHLY",
		};
		const employee = buildEmployee({
			employmentStartDate: new Date("2026-06-03T00:00:00.000Z"),
			employmentHireDate: new Date("2026-06-01T00:00:00.000Z"),
		});
		const { prisma, creates } = buildPrismaMock({
			periods: [period],
			employees: [employee],
		});

		const result = await ensureDm3ScheduleBackedAttendanceObligations(prisma, {
			organizationId: "org-1",
			employeeIds: [employee.id],
			fromDate: "2026-06-01",
			toDate: "2026-06-04",
		});

		expect(result.inserted).to.equal(2);
		expect(creates.map((entry) => entry.data.businessDate)).to.deep.equal([
			"2026-06-03",
			"2026-06-04",
		]);
	});
});
