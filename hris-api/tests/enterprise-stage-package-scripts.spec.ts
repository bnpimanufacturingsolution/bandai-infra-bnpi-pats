import path from "path";
import assert from "node:assert/strict";
import { describe, it } from "mocha";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require("../package.json");

describe("enterprise migration package scripts", () => {
	it("keeps the current runner command untouched", () => {
		assert.equal(
			packageJson.scripts["migrate:enterprise-csv"],
			"ts-node scripts/migration/run-enterprise-csv-migration.ts",
		);
		assert.equal(
			fsExists("scripts/migration/run-enterprise-csv-migration.ts"),
			true,
			"scripts/migration/run-enterprise-csv-migration.ts",
		);
	});

	it("wires new standalone stage commands to the expected files", () => {
		const expectedScripts: Record<string, string> = {
			"migrate:enterprise:validate-local":
				"ts-node scripts/migration/run-enterprise-csv-validation.ts",
			"migrate:enterprise:complete-local":
				"ts-node scripts/migration/run-enterprise-csv-completion.ts",
			"migrate:enterprise:pre-checks":
				"ts-node scripts/migration/enterprise/pre-migration-controls.ts",
			"migrate:enterprise:foundation":
				"ts-node scripts/migration/enterprise/foundation-master.ts",
			"migrate:enterprise:core-config":
				"ts-node scripts/migration/enterprise/core-configuration.ts",
			"migrate:enterprise:work-pattern":
				"ts-node scripts/migration/enterprise/work-pattern-master.ts",
			"migrate:enterprise:org-structure":
				"ts-node scripts/migration/enterprise/org-structure-skeleton.ts",
			"migrate:enterprise:identity":
				"ts-node scripts/migration/enterprise/identity-master.ts",
			"migrate:enterprise:employment-base":
				"ts-node scripts/migration/enterprise/employment-base.ts",
			"migrate:enterprise:employment-relationships":
				"ts-node scripts/migration/enterprise/employment-relationship-patch.ts",
			"migrate:enterprise:attachments":
				"ts-node scripts/migration/enterprise/employee-attachment-opening-balance.ts",
			"migrate:enterprise:historical-ledger":
				"ts-node scripts/migration/enterprise/closed-historical-operational-ledger.ts",
			"migrate:enterprise:in-flight":
				"ts-node scripts/migration/enterprise/open-in-flight-transactional-history.ts",
			"migrate:enterprise:reconciliation":
				"ts-node scripts/migration/enterprise/post-migration-reconciliation.ts",
		};

		for (const [scriptName, scriptValue] of Object.entries(expectedScripts)) {
			assert.equal(packageJson.scripts[scriptName], scriptValue, scriptName);
			const relativeFilePath = scriptValue.replace(/^ts-node\s+/, "");
			assert.equal(fsExists(relativeFilePath), true, relativeFilePath);
		}
	});
});

function fsExists(relativeFilePath: string) {
	return require("fs").existsSync(path.resolve(__dirname, "..", relativeFilePath));
}
