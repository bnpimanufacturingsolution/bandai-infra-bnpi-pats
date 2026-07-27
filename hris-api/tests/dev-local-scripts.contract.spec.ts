import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "mocha";

/**
 * Guardrail: `npm run dev:local` / `dev:local:restore` and supporting scripts must
 * stay in package.json after merges. A parallel develop tip once rebased past PR #6
 * and temporarily dropped these keys until histories were recombined.
 */
const apiRoot = path.resolve(__dirname, "..");
const packageJson = require("../package.json") as { scripts: Record<string, string> };

const REQUIRED_SCRIPTS: Record<string, string> = {
	"dev:local": "node scripts/run-dev-local.cjs",
	"dev:local:restore": "node scripts/run-dev-local.cjs --restore",
	"db:snapshot": "node scripts/local-db-snapshot.cjs snapshot",
	"db:restore": "node scripts/local-db-snapshot.cjs restore --from current",
	"db:snapshot:status": "node scripts/local-db-snapshot.cjs status",
};

const REQUIRED_FILES = [
	"scripts/run-dev-local.cjs",
	"scripts/local-db-snapshot.cjs",
	"scripts/predev-local.cjs",
	".env.local-clone.example",
];

describe("dev:local npm script contract", () => {
	for (const [name, command] of Object.entries(REQUIRED_SCRIPTS)) {
		it(`keeps package.json script "${name}"`, () => {
			assert.equal(
				packageJson.scripts[name],
				command,
				`Missing or changed npm script "${name}". ` +
					`Expected "${command}", got ${JSON.stringify(packageJson.scripts[name])}. ` +
					`Do not drop local-clone tooling when merging develop.`,
			);
		});
	}

	for (const rel of REQUIRED_FILES) {
		it(`keeps support file ${rel}`, () => {
			const abs = path.join(apiRoot, rel);
			assert.equal(fs.existsSync(abs), true, `Expected ${rel} to exist under hris-api`);
		});
	}

	it("skips remote device tunnel + K8s DB watch in local-clone predev", () => {
		const runDevLocal = fs.readFileSync(
			path.join(apiRoot, "scripts/run-dev-local.cjs"),
			"utf8",
		);
		const predevLocal = fs.readFileSync(
			path.join(apiRoot, "scripts/predev-local.cjs"),
			"utf8",
		);
		for (const [label, source] of [
			["run-dev-local.cjs", runDevLocal],
			["predev-local.cjs", predevLocal],
		] as const) {
			assert.match(
				source,
				/HRIS_SKIP_HIKVISION_REMOTE_DEVICE_TUNNEL/,
				`${label} must skip remote Hikvision device tunnels for isolated local clone`,
			);
			assert.match(
				source,
				/PROJECT_TRUTH_DISABLE_K8S_DB_WATCH/,
				`${label} must disable shared K8s DEV DB watch for isolated local clone`,
			);
		}
	});
});
