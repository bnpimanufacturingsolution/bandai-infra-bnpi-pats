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
	getCurrentDatabaseName,
} from "../support/isolated-prisma-client";

async function countFixtureRows(prisma: PrismaClient, organizationId: string) {
	const [
		organizations,
		departments,
		positions,
		people,
		employees,
		payrollPeriods,
		timesheets,
	] = await Promise.all([
		prisma.organization.count({ where: { id: organizationId } }),
		prisma.department.count({ where: { organizationId } }),
		prisma.position.count({ where: { organizationId } }),
		prisma.person.count({ where: { organizationId } }),
		prisma.employee.count({ where: { organizationId } }),
		prisma.payrollPeriod.count({ where: { organizationId } }),
		prisma.timesheet.count({ where: { organizationId } }),
	]);

	return {
		departments,
		employees,
		organizations,
		payrollPeriods,
		people,
		positions,
		timesheets,
	};
}

describe("isolated Prisma DB integration harness", () => {
	let prisma: PrismaClient | undefined;
	let fixture: IsolatedHrisFixture | undefined;

	beforeEach(async () => {
		prisma = createIsolatedPrismaClient();
		await assertConnectedToIsolatedFaultDatabase(prisma);
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

	it("connects only to the approved isolated DB", async () => {
		expect(prisma).to.exist;
		const databaseName = await getCurrentDatabaseName(prisma!);

		expect(databaseName).to.equal("hris_fault_test");
	});

	it("seeds the minimal HRIS fixture in dependency order", async () => {
		fixture = await seedMinimalHrisFixture(prisma!);

		const counts = await countFixtureRows(prisma!, fixture.organizationId);

		expect(counts).to.deep.equal({
			departments: 1,
			employees: 1,
			organizations: 1,
			payrollPeriods: 1,
			people: 1,
			positions: 1,
			timesheets: 1,
		});
	});

	it("tears down the minimal HRIS fixture in FK-safe order", async () => {
		fixture = await seedMinimalHrisFixture(prisma!);
		const organizationId = fixture.organizationId;

		await cleanupIsolatedHrisFixture(prisma!, { organizationId });
		fixture = undefined;

		const counts = await countFixtureRows(prisma!, organizationId);
		expect(counts).to.deep.equal({
			departments: 0,
			employees: 0,
			organizations: 0,
			payrollPeriods: 0,
			people: 0,
			positions: 0,
			timesheets: 0,
		});
	});
});
