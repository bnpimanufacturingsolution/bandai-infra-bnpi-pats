import { spawnSync } from "child_process";
import path from "path";
import {
	buildEnterpriseDryRunMigrationEnv,
	buildEnterpriseSeedSafeEnv,
} from "./migration-run-env";

const repoRoot = process.cwd();

const runOrThrow = (
	command: string,
	args: string[],
	envOverride?: NodeJS.ProcessEnv,
) => {
	console.log(`\n> ${command} ${args.join(" ")}`);
	const result = spawnSync(command, args, {
		cwd: repoRoot,
		stdio: "inherit",
		shell: process.platform === "win32",
		env: envOverride || process.env,
	});

	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
	}
};

const reportOutputPath = String(process.env.MIGRATION_REPORT_OUTPUT_PATH || "output/spreadsheet").trim();
const csvDir = String(process.env.MIGRATION_CSV_DIR || "docs/csv").trim();
const runLabel =
	String(process.env.MIGRATION_RUN_LABEL || "").trim() ||
	`enterprise-csv-validation-${new Date().toISOString().replace(/[:.]/g, "-")}`;

const migrationEnvBase: Record<string, string> = {
	MIGRATION_CSV_DIR: csvDir,
	MIGRATION_REPORT_ENABLED: "true",
	MIGRATION_REPORT_OUTPUT_PATH: reportOutputPath,
	MIGRATION_RUN_LABEL: runLabel,
};

if (String(process.env.MIGRATION_REPORT_TEMPLATE_PATH || "").trim()) {
	migrationEnvBase.MIGRATION_REPORT_TEMPLATE_PATH = String(
		process.env.MIGRATION_REPORT_TEMPLATE_PATH,
	).trim();
}

const seedSafeEnv = buildEnterpriseSeedSafeEnv(process.env);
const migrationEnv = buildEnterpriseDryRunMigrationEnv(process.env, migrationEnvBase);

console.log("Enterprise CSV validation flow");
console.log(`- CSV Directory: ${path.resolve(repoRoot, csvDir)}`);
console.log(`- Report Output: ${path.resolve(repoRoot, reportOutputPath)}`);
console.log(`- Run Label: ${runLabel}`);
console.log("- Flow: prisma-reset -> seed:defaults -> migrate:enterprise-csv (dry-run)");
console.log("- Note: prisma-reset and seed:defaults mutate data. Only migrate:enterprise-csv runs in dry-run.");
console.log("- Dry-run env is cleared for reset/seed steps and applied only to the migration step.");

runOrThrow("npm", ["run", "prisma-reset"], seedSafeEnv);
runOrThrow("npm", ["run", "seed:defaults"], seedSafeEnv);
runOrThrow("npm", ["run", "migrate:enterprise-csv"], migrationEnv);

console.log("\nValidation flow completed.");
console.log(`- Migration log: ${path.resolve(repoRoot, "logs", "enterprise-csv-migration-last-run.json")}`);
console.log(`- Spreadsheet output directory: ${path.resolve(repoRoot, reportOutputPath)}`);
