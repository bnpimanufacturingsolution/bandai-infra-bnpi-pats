import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { resolveMigrationReportEnabled } from "../scripts/migration/migration-report-env";
import {
	parseBoolean,
	parseNumber,
	parseStages,
} from "../scripts/migration/run-enterprise-csv-migration";

describe("enterprise migration runner env", () => {
	it("keeps report generation disabled by default", () => {
		assert.equal(resolveMigrationReportEnabled({}), false);
	});

	it("enables report generation when MIGRATION_REPORT_ENABLED=true", () => {
		assert.equal(resolveMigrationReportEnabled({ MIGRATION_REPORT_ENABLED: "true" } as NodeJS.ProcessEnv), true);
	});

	it("disables report generation when MIGRATION_REPORT_ENABLED=false even if a template path exists", () => {
		assert.equal(
			resolveMigrationReportEnabled({
				MIGRATION_REPORT_ENABLED: "false",
				MIGRATION_REPORT_TEMPLATE_PATH: "C:\\report-template.xlsx",
			} as NodeJS.ProcessEnv),
			false,
		);
	});

	it("enables report generation when a template path is present without an explicit toggle", () => {
		assert.equal(
			resolveMigrationReportEnabled({
				MIGRATION_REPORT_TEMPLATE_PATH: "C:\\report-template.xlsx",
			} as NodeJS.ProcessEnv),
			true,
		);
	});

	it("keeps enterprise CSV migration in dry-run for invalid boolean env values", () => {
		assert.equal(parseBoolean(undefined, true), true);
		assert.equal(parseBoolean("true", false), true);
		assert.equal(parseBoolean("false", true), false);
		assert.equal(parseBoolean("definitely", true), true);
	});

	it("falls back for invalid numeric migration env values", () => {
		assert.equal(parseNumber(undefined, 500), 500);
		assert.equal(parseNumber("25", 500), 25);
		assert.equal(parseNumber("not-a-number", 500), 500);
	});

	it("filters requested enterprise stages through the canonical enum", () => {
		assert.deepEqual(parseStages(undefined), undefined);
		assert.deepEqual(parseStages("identity_master,unknown,post_migration_reconciliation"), [
			"IDENTITY_MASTER",
			"POST_MIGRATION_RECONCILIATION",
		]);
	});
});
