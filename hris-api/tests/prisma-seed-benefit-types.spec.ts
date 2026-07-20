import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const seedSource = fs.readFileSync(path.resolve(process.cwd(), "prisma/seed.ts"), "utf8");

describe("Prisma baseline seed benefit types", () => {
	it("imports the idempotent default benefit type seeder", () => {
		assert.match(seedSource, /import \{ ensureDefaultBenefitTypes \} from "\.\/seeds\/benefitTypeSeeder"/);
	});

	it("runs default benefit type seeding for the resolved organization", () => {
		assert.match(seedSource, /const organizationId = await resolveDefaultSeedOrganizationId\(\);[\s\S]*await ensureDefaultBenefitTypes\(prisma, organizationId\);/);
	});

	it("keeps benefit type seeding before the kiosk content seed", () => {
		assert.ok(seedSource.indexOf("ensureDefaultBenefitTypes(prisma, organizationId)") < seedSource.indexOf("seedKioskLoginContent(prisma, organizationId)"));
	});
});
