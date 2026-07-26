import { expect } from "chai";
import {
	assertSeedDryRunNotRequested,
	isSeedDryRunRequested,
	SEED_WRITE_SCRIPT_NAMES,
} from "../prisma/seeds/seedDryRunGuard";
import {
	ENSURE_LOCAL_ADMIN_USERS_FOR_GENERAL_SEED,
	getGeneralEmployeeSeedPreview,
	resolveDepartmentSeedIdentity,
} from "../prisma/seeds/generalEmployeeSeeder.shared";
import {
	LOCAL_ADMIN_SEEDS,
	orderLocalAdminSeedsForExistingUsers,
} from "../prisma/seeds/defaultProjectSeeder";
import { MIGRATION_SCRIPT_SAFETY_REGISTRY } from "../scripts/migration/script-safety";

const packageJson = require("../package.json") as { scripts: Record<string, string> };

describe("seed script dry-run safety guard", () => {
	const originalEnv = { ...process.env };
	const originalArgv = [...process.argv];

	afterEach(() => {
		process.env = { ...originalEnv };
		process.argv = [...originalArgv];
	});

	it("detects migration and generic dry-run env flags", () => {
		expect(isSeedDryRunRequested({ MIGRATION_DRY_RUN: "true" }, ["node", "seed"])).to.equal(true);
		expect(isSeedDryRunRequested({ DRY_RUN: "yes" }, ["node", "seed"])).to.equal(true);
		expect(isSeedDryRunRequested({}, ["node", "seed", "--dry-run"])).to.equal(true);
		expect(isSeedDryRunRequested({}, ["node", "seed", "--dry-run=false"])).to.equal(true);
		expect(isSeedDryRunRequested({}, ["node", "seed"])).to.equal(false);
	});

	it("throws loudly when a write seed is invoked under dry-run flags", () => {
		process.env.MIGRATION_DRY_RUN = "true";

		expect(() => assertSeedDryRunNotRequested("seed:defaults")).to.throw(
			/seed:defaults is a seed\/write script and does not support dry-run mode/,
		);
	});

	it("keeps known seed write commands registered for guard coverage", () => {
		expect(SEED_WRITE_SCRIPT_NAMES).to.include("prisma-seed");
		expect(SEED_WRITE_SCRIPT_NAMES).to.include("seed:bulk-backdated-employees");
		expect(SEED_WRITE_SCRIPT_NAMES).to.include("seed:reset-demo-requests");
		expect(SEED_WRITE_SCRIPT_NAMES).to.include("seed:soa");
		expect(packageJson.scripts["prisma-seed"]).to.equal("npx prisma db seed");
	});

	it("keeps prisma-seed aligned with the local admin bootstrap contract", () => {
		expect(ENSURE_LOCAL_ADMIN_USERS_FOR_GENERAL_SEED).to.equal(true);
	});

	it("orders a seeded username holder before the seed that needs its old username", () => {
		const ordered = orderLocalAdminSeedsForExistingUsers(LOCAL_ADMIN_SEEDS, [
			{ email: "super@admin.com", userName: "super-admin" },
			{ email: "admin@bandai.local", userName: "hris-admin" },
		]);

		expect(ordered.map((seed) => seed.email)).to.deep.equal([
			"super@admin.com",
			"admin@bandai.local",
			"hris@admin.com",
		]);
	});

	it("fails closed when a configured admin username belongs to a non-seeded identity", () => {
		expect(() =>
			orderLocalAdminSeedsForExistingUsers(LOCAL_ADMIN_SEEDS, [
				{ email: "unrelated@example.com", userName: "hris-admin" },
			]),
		).to.throw(/identity conflict/);
	});

	it("reuses an active same-name department without overwriting its imported code", () => {
		const resolution = resolveDepartmentSeedIdentity(
			{
				name: "Product Assurance",
				code: "PROD-ASSUR",
				description: "Seed description",
				isHr: false,
			},
			[
				{
					id: "department-existing",
					name: "Product Assurance",
					code: "13",
					isActive: true,
					isDeleted: false,
				},
			],
		);

		expect(resolution).to.deep.equal({
			kind: "name",
			department: {
				id: "department-existing",
				name: "Product Assurance",
				code: "13",
				isActive: true,
				isDeleted: false,
			},
		});
	});

	it("fails closed when department code and name resolve to different records", () => {
		expect(() =>
			resolveDepartmentSeedIdentity(
				{
					name: "Product Assurance",
					code: "PROD-ASSUR",
					description: "Seed description",
					isHr: false,
				},
				[
					{
						id: "department-by-code",
						name: "Different Name",
						code: "PROD-ASSUR",
						isActive: true,
						isDeleted: false,
					},
					{
						id: "department-by-name",
						name: "Product Assurance",
						code: "13",
						isActive: true,
						isDeleted: false,
					},
				],
			),
		).to.throw(/code and name belong to different records/);
	});
});

describe("general employee seed organization hierarchy catalog", () => {
	const preview = getGeneralEmployeeSeedPreview();
	const departmentsByCode = new Map(preview.departments.map((item) => [item.code, item]));
	const sectionsByCode = new Map(preview.sections.map((item) => [item.code, item]));
	const positionsByCode = new Map(preview.positions.map((item) => [item.code, item]));

	it("defines a section for every department in the general seed preview", () => {
		for (const department of preview.departments) {
			const sectionCount = preview.sections.filter(
				(section) => section.departmentCode === department.code,
			).length;

			expect(sectionCount, `sections for ${department.code}`).to.be.greaterThan(0);
		}
	});

	it("requires every seeded position to reference a section in the same department", () => {
		for (const position of preview.positions) {
			expect(position.sectionCode, `sectionCode for position ${position.code}`).to.be.a("string").and.not.equal("");
			const section = sectionsByCode.get(position.sectionCode);

			expect(section, `section ${position.sectionCode} for position ${position.code}`).to.exist;
			expect(section?.departmentCode).to.equal(position.departmentCode);
			expect(departmentsByCode.has(position.departmentCode)).to.equal(true);
		}
	});

	it("requires every seeded employee to reference a section matching its position and department", () => {
		for (const employee of preview.employees) {
			expect(employee.sectionCode, `sectionCode for employee ${employee.email}`).to.be.a("string").and.not.equal("");
			const position = positionsByCode.get(employee.positionCode);
			const section = sectionsByCode.get(employee.sectionCode);

			expect(position, `position ${employee.positionCode} for employee ${employee.email}`).to.exist;
			expect(section, `section ${employee.sectionCode} for employee ${employee.email}`).to.exist;
			expect(section?.departmentCode).to.equal(employee.departmentCode);
			expect(position?.departmentCode).to.equal(employee.departmentCode);
			expect(position?.sectionCode).to.equal(employee.sectionCode);
		}
	});

	it("returns sections, departments, positions, and employees as a consistent preview", () => {
		expect(preview.sections).to.not.be.empty;
		expect(preview.departments).to.not.be.empty;
		expect(preview.positions).to.not.be.empty;
		expect(preview.employees).to.not.be.empty;

		for (const section of preview.sections) {
			expect(departmentsByCode.has(section.departmentCode)).to.equal(true);
		}
	});
});

describe("qa and placeholder backfill safety registration", () => {
	it("registers migration QA post-actions as a mutating guarded script", () => {
		const qa = MIGRATION_SCRIPT_SAFETY_REGISTRY.find(
			(entry) => entry.scriptPath === "scripts/qa-migration-post-actions.ts",
		);

		expect(qa?.mutatesData).to.equal(true);
		expect(qa?.requiresExplicitExecute).to.equal(true);
		expect(qa?.requiresTargetGuard).to.equal(true);
	});

	it("registers applicant assigned HR backfill as current no-op instead of silent coverage", () => {
		const applicantBackfill = MIGRATION_SCRIPT_SAFETY_REGISTRY.find(
			(entry) => entry.scriptPath === "scripts/backfill-applicant-assigned-hr.ts",
		);

		expect(applicantBackfill?.mutatesData).to.equal(false);
		expect(applicantBackfill?.defaultMode).to.equal("no-op");
		expect(applicantBackfill?.notes).to.include("placeholder");
	});
});
