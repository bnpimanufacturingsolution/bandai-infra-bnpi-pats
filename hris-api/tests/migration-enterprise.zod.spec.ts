import { expect } from "chai";
import {
	ENTERPRISE_MIGRATION_STAGE_ORDER,
	EnterpriseMigrationRequestSchema,
	resolveEnterpriseMigrationStageOrder,
} from "../zod/migration.zod";

describe("Enterprise migration schema", () => {
	it("keeps enterprise stages in canonical production order", () => {
		expect(ENTERPRISE_MIGRATION_STAGE_ORDER[0]).to.equal("PRE_MIGRATION_CONTROLS");
		expect(ENTERPRISE_MIGRATION_STAGE_ORDER[ENTERPRISE_MIGRATION_STAGE_ORDER.length - 1]).to.equal(
			"POST_MIGRATION_RECONCILIATION",
		);
	});

	it("filters requested stages through canonical order", () => {
		const result = resolveEnterpriseMigrationStageOrder([
			"EMPLOYMENT_BASE",
			"PRE_MIGRATION_CONTROLS",
			"CORE_CONFIGURATION",
		]);

		expect(result).to.deep.equal([
			"PRE_MIGRATION_CONTROLS",
			"CORE_CONFIGURATION",
			"EMPLOYMENT_BASE",
		]);
	});

	it("accepts a minimal enterprise dry-run payload", () => {
		const parsed = EnterpriseMigrationRequestSchema.safeParse({
			config: {
				organizationId: "org-1",
				batchSize: 500,
				maxParallelBatches: 6,
				skipDuplicates: true,
				dryRun: true,
				stageBatchSize: 250,
				stopOnStageFailure: true,
			},
			manifest: {
				runLabel: "pilot-cutover",
				sourceSystem: "legacy-hris",
				cutoffAt: "2026-05-21T00:00:00.000Z",
				dryRun: true,
				assumptions: ["History is migrated as preserved ledger data."],
			},
			data: {
				departments: [{ code: "HR", name: "Human Resources" }],
				levels: [{ name: "Manager", rank: 2 }],
				positions: [{ code: "HR-MGR", title: "HR Manager", departmentCode: "HR" }],
				persons: [
					{
						sourcePersonKey: "P-001",
						employeeId: "EMP-001",
						personalInfo: { firstName: "Alex", lastName: "Santos" },
						contactInfo: { email: "alex@example.com" },
					},
				],
				employees: [
					{
						employeeId: "EMP-001",
						role: "hris-hr-manager",
						departmentCode: "HR",
						positionCode: "HR-MGR",
						levelName: "Manager",
						basicSalary: 60000,
					},
				],
			},
			options: {
				stages: ["PRE_MIGRATION_CONTROLS", "ORG_STRUCTURE_SKELETON", "EMPLOYMENT_BASE"],
				strictIntegrity: true,
				allowFallbackSchedule: false,
			},
		});

		expect(parsed.success).to.equal(true);
		if (!parsed.success) return;
		expect(parsed.data.manifest.dryRun).to.equal(true);
		expect(parsed.data.options?.stages).to.deep.equal([
			"PRE_MIGRATION_CONTROLS",
			"ORG_STRUCTURE_SKELETON",
			"EMPLOYMENT_BASE",
		]);
	});

	it("rejects enterprise employees with non-positive basic salary", () => {
		const parsed = EnterpriseMigrationRequestSchema.safeParse({
			config: {
				organizationId: "org-1",
				batchSize: 500,
				maxParallelBatches: 6,
				skipDuplicates: true,
				dryRun: true,
				stageBatchSize: 250,
				stopOnStageFailure: true,
			},
			manifest: {
				runLabel: "pilot-cutover",
				sourceSystem: "legacy-hris",
				cutoffAt: "2026-05-21T00:00:00.000Z",
				dryRun: true,
			},
			data: {
				employees: [
					{
						employeeId: "EMP-001",
						role: "hris-employee",
						departmentCode: "HR",
						positionCode: "HR-STAFF",
						basicSalary: 0,
					},
				],
			},
		});

		expect(parsed.success).to.equal(false);
		if (parsed.success) return;
		expect(parsed.error.issues.some((issue) => issue.path.join(".") === "data.employees.0.basicSalary")).to.equal(
			true,
		);
	});
});
