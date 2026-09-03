import { expect } from "chai";
import type { PrismaClient } from "../../generated/prisma";
import {
	cleanupIsolatedHrisFixture,
	seedMinimalHrisFixture,
	type IsolatedHrisFixture,
} from "../fixtures/isolated-hris.fixture";
import {
	assertConnectedToIsolatedFaultDatabase,
	createIsolatedPrismaClient,
	disconnectQuietly,
} from "../support/isolated-prisma-client";
import { resolveIsolatedDbFaultTestConfig } from "../support/isolated-db-fault.guard";
import {
	findEffectiveTimesheetLineConflicts,
	findPaidPayrollSnapshotViolations,
} from "../support/db-fault-invariants";

const businessDate = new Date("2026-05-05T00:00:00.000Z");
const describeIfFaultTestsEnabled = resolveIsolatedDbFaultTestConfig().allowed ? describe : describe.skip;

async function expectUniqueConstraintViolation(action: () => Promise<unknown>) {
	let thrown: unknown;
	try {
		await action();
	} catch (error) {
		thrown = error;
	}

	expect(thrown).to.exist;
	expect((thrown as { code?: string }).code).to.equal("P2002");
}

async function createTimesheetLine(
	prisma: PrismaClient,
	fixture: IsolatedHrisFixture,
	revisionNo: number,
) {
	return prisma.timesheetline.create({
		data: {
			date: businessDate,
			employeeId: fixture.employeeId,
			hoursWorked: "8:00",
			isEffective: true,
			ledgerType: revisionNo === 1 ? "SNAPSHOT" : "CORRECTION",
			organizationId: fixture.organizationId,
			payrollPeriodId: fixture.payrollPeriodId,
			regularHours: "8:00",
			revisionNo,
			status: "PRESENT",
			timesheetId: fixture.timesheetId,
		},
	});
}

describeIfFaultTestsEnabled("isolated DB fault invariants", () => {
	let prisma: PrismaClient | undefined;
	let fixture: IsolatedHrisFixture | undefined;

	beforeEach(async () => {
		prisma = createIsolatedPrismaClient();
		await assertConnectedToIsolatedFaultDatabase(prisma);
		fixture = await seedMinimalHrisFixture(prisma);
	});

	afterEach(async () => {
		if (prisma && fixture) {
			await cleanupIsolatedHrisFixture(prisma, {
				organizationId: fixture.organizationId,
			});
		}
		fixture = undefined;
		await disconnectQuietly(prisma);
		prisma = undefined;
	});

	it("rejects duplicate AttendanceObligation rows by DB unique constraint", async () => {
		await prisma!.attendanceObligation.create({
			data: {
				businessDate: "2026-05-05",
				date: businessDate,
				employeeId: fixture!.employeeId,
				organizationId: fixture!.organizationId,
				payrollPeriodId: fixture!.payrollPeriodId,
				phase: "PLANNED",
				source: "DB_FAULT_TEST",
				status: "EXPECTED",
			},
		});

		await expectUniqueConstraintViolation(() =>
			prisma!.attendanceObligation.create({
				data: {
					businessDate: "2026-05-05",
					date: businessDate,
					employeeId: fixture!.employeeId,
					organizationId: fixture!.organizationId,
					payrollPeriodId: fixture!.payrollPeriodId,
					phase: "PLANNED",
					source: "DB_FAULT_TEST_DUPLICATE",
					status: "EXPECTED",
				},
			}),
		);
	});

	it("rejects duplicate Timesheetline revisions by DB unique constraint", async () => {
		await createTimesheetLine(prisma!, fixture!, 1);

		await expectUniqueConstraintViolation(() => createTimesheetLine(prisma!, fixture!, 1));
	});

	it("detects multiple effective Timesheetline rows for one timesheet day", async () => {
		const first = await createTimesheetLine(prisma!, fixture!, 1);
		const second = await createTimesheetLine(prisma!, fixture!, 2);

		const conflicts = await findEffectiveTimesheetLineConflicts(
			prisma!,
			fixture!.organizationId,
		);

		expect(conflicts).to.have.length(1);
		expect(conflicts[0]).to.deep.equal({
			date: "2026-05-05",
			lineIds: [first.id, second.id].sort(),
			timesheetId: fixture!.timesheetId,
		});
	});

	it("detects paid EmployeePayroll rows without a timesheet snapshot", async () => {
		const payroll = await prisma!.employeePayroll.create({
			data: {
				employeeId: fixture!.employeeId,
				isPaid: true,
				organizationId: fixture!.organizationId,
				paidAt: new Date("2026-05-20T00:00:00.000Z"),
				payrollPeriodId: fixture!.payrollPeriodId,
				snapshotLockReason: "DB_FAULT_TEST",
				snapshotLockedAt: new Date("2026-05-20T00:00:00.000Z"),
				snapshotLockedBy: fixture!.employeeId,
				timesheetId: fixture!.timesheetId,
			},
		});

		const violations = await findPaidPayrollSnapshotViolations(
			prisma!,
			fixture!.organizationId,
		);

		expect(violations).to.deep.equal([
			{
				id: payroll.id,
				reasons: ["MISSING_TIMESHEET_SNAPSHOT"],
			},
		]);
	});

	it("detects paid EmployeePayroll rows missing snapshot lock metadata", async () => {
		const payroll = await prisma!.employeePayroll.create({
			data: {
				employeeId: fixture!.employeeId,
				isPaid: true,
				organizationId: fixture!.organizationId,
				paidAt: new Date("2026-05-20T00:00:00.000Z"),
				payrollPeriodId: fixture!.payrollPeriodId,
				timesheetId: fixture!.timesheetId,
				timesheetSnapshot: {
					totalHoursWorked: "8:00",
					totalRegularHours: "8:00",
				},
			},
		});

		const violations = await findPaidPayrollSnapshotViolations(
			prisma!,
			fixture!.organizationId,
		);

		expect(violations).to.deep.equal([
			{
				id: payroll.id,
				reasons: [
					"MISSING_SNAPSHOT_LOCKED_AT",
					"MISSING_SNAPSHOT_LOCKED_BY",
					"MISSING_SNAPSHOT_LOCK_REASON",
				],
			},
		]);
	});
});
