import assert from "node:assert/strict";
import { describe, it } from "mocha";
import {
	buildEnterpriseDryRunMigrationEnv,
	buildEnterpriseSeedSafeEnv,
} from "../scripts/migration/migration-run-env";

describe("enterprise migration validation env", () => {
	it("removes dry-run env vars for reset and seed steps", () => {
		const seedSafeEnv = buildEnterpriseSeedSafeEnv({
			MIGRATION_DRY_RUN: "true",
			DRY_RUN: "true",
			MIGRATION_CSV_DIR: "docs/csv",
			CUSTOM_FLAG: "keep-me",
		} as NodeJS.ProcessEnv);

		assert.equal(seedSafeEnv.MIGRATION_DRY_RUN, undefined);
		assert.equal(seedSafeEnv.DRY_RUN, undefined);
		assert.equal(seedSafeEnv.MIGRATION_CSV_DIR, "docs/csv");
		assert.equal(seedSafeEnv.CUSTOM_FLAG, "keep-me");
	});

	it("applies migration dry-run only to the final migration env", () => {
		const migrationEnv = buildEnterpriseDryRunMigrationEnv(
			{
				MIGRATION_DRY_RUN: "false",
				DRY_RUN: "true",
				CUSTOM_FLAG: "keep-me",
			} as NodeJS.ProcessEnv,
			{
				MIGRATION_CSV_DIR: "docs/csv",
				MIGRATION_REPORT_ENABLED: "true",
			},
		);

		assert.equal(migrationEnv.MIGRATION_DRY_RUN, "true");
		assert.equal(migrationEnv.DRY_RUN, undefined);
		assert.equal(migrationEnv.MIGRATION_CSV_DIR, "docs/csv");
		assert.equal(migrationEnv.MIGRATION_REPORT_ENABLED, "true");
		assert.equal(migrationEnv.CUSTOM_FLAG, "keep-me");
	});
});
