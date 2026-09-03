import { expect } from "chai";
import { migrationService } from "../app/migration/migration.service";

const createReadOnlyPrismaMock = () => {
	const writes: Array<{ model: string; method: string }> = [];
	const modelNames = ["level", "department", "position", "employee", "person"];
	const prisma: Record<string, any> = {};

	for (const model of modelNames) {
		prisma[model] = {
			findMany: async () => [],
			findFirst: async () => null,
			findUnique: async () => null,
			count: async () => 0,
			groupBy: async () => [],
			create: async () => {
				writes.push({ model, method: "create" });
				throw new Error(`Unexpected dry-run write: ${model}.create`);
			},
			update: async () => {
				writes.push({ model, method: "update" });
				throw new Error(`Unexpected dry-run write: ${model}.update`);
			},
			updateMany: async () => {
				writes.push({ model, method: "updateMany" });
				throw new Error(`Unexpected dry-run write: ${model}.updateMany`);
			},
			deleteMany: async () => {
				writes.push({ model, method: "deleteMany" });
				throw new Error(`Unexpected dry-run write: ${model}.deleteMany`);
			},
		};
	}

	return { prisma: prisma as any, writes };
};

describe("legacy migration service dry-run contract", () => {
	it("does not call Prisma write methods when config.dryRun is true", async () => {
		const { prisma, writes } = createReadOnlyPrismaMock();
		const service = migrationService(prisma);

		const result = await service.executeMigration({
			config: {
				organizationId: "org-1",
				batchSize: 25,
				maxParallelBatches: 2,
				skipDuplicates: true,
				dryRun: true,
			},
			levels: [{ name: "Manager", rank: 1, description: "Manager" }],
			departments: [{ code: "HR", name: "Human Resources" }],
			positions: [{ code: "HR-MGR", title: "HR Manager", departmentCode: "HR" }],
			employees: [
				{
					employeeId: "BNEI-001",
					firstName: "Ada",
					lastName: "Lovelace",
					email: "ada@example.test",
					role: "HR_MANAGER",
					departmentCode: "HR",
					departmentName: "Human Resources",
					positionCode: "HR-MGR",
					positionTitle: "HR Manager",
					levelName: "Manager",
					levelRank: 1,
					basicSalary: 1000,
					currency: "PHP",
					payFrequency: "SEMI_MONTHLY",
					employmentType: "FULL_TIME",
					employmentStatus: "ACTIVE",
					workLocation: "Manila",
					employmentHireDate: new Date("2026-05-01T00:00:00.000Z"),
				},
			],
		} as any);

		expect(result.dryRun).to.equal(true);
		expect(result.success).to.equal(true);
		expect(result.summary.levels.created).to.equal(1);
		expect(result.summary.departments.created).to.equal(1);
		expect(result.summary.positions.created).to.equal(1);
		expect(result.summary.employees.created).to.equal(1);
		expect(writes).to.deep.equal([]);
	});
});
