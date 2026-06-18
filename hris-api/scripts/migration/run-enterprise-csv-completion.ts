import { spawnSync } from "child_process";
import path from "path";

const repoRoot = process.cwd();

const runOrThrow = (command: string, args: string[], extraEnv?: Record<string, string>) => {
	console.log(`\n> ${command} ${args.join(" ")}`);
	const result = spawnSync(command, args, {
		cwd: repoRoot,
		stdio: "inherit",
		shell: process.platform === "win32",
		env: {
			...process.env,
			...extraEnv,
		},
	});

	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
	}
};

const csvDir = String(process.env.MIGRATION_CSV_DIR || "docs/csv").trim();
const reportOutputPath = String(process.env.MIGRATION_REPORT_OUTPUT_PATH || "output/spreadsheet").trim();
const runLabel =
	String(process.env.MIGRATION_RUN_LABEL || "").trim() ||
	`enterprise-csv-completion-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const organizationCode = String(process.env.MIGRATION_ORGANIZATION_CODE || "bnei").trim();

const migrationEnv: Record<string, string> = {
	MIGRATION_ORGANIZATION_CODE: organizationCode,
	MIGRATION_DRY_RUN: "false",
	MIGRATION_CSV_DIR: csvDir,
	MIGRATION_REPORT_ENABLED: "true",
	MIGRATION_REPORT_OUTPUT_PATH: reportOutputPath,
	MIGRATION_STOP_ON_STAGE_FAILURE: "false",
	MIGRATION_RUN_LABEL: runLabel,
};

if (String(process.env.MIGRATION_REPORT_TEMPLATE_PATH || "").trim()) {
	migrationEnv.MIGRATION_REPORT_TEMPLATE_PATH = String(
		process.env.MIGRATION_REPORT_TEMPLATE_PATH,
	).trim();
}

console.log("Enterprise CSV completion flow");
console.log(`- CSV Directory: ${path.resolve(repoRoot, csvDir)}`);
console.log(`- Report Output: ${path.resolve(repoRoot, reportOutputPath)}`);
console.log(`- Run Label: ${runLabel}`);
console.log(`- Organization Code: ${organizationCode}`);
console.log("- Flow: prisma-reset -> seed:defaults -> seed:calculator -> seed:holidays -> seed:soa -> migrate:enterprise-csv (real execution)");
console.log("- Note: this flow performs real writes and is intended only for disposable local environments.");

runOrThrow("npm", ["run", "prisma-reset"]);
runOrThrow("npm", ["run", "seed:defaults"]);
runOrThrow("npm", ["run", "seed:calculator"]);
runOrThrow("npm", ["run", "seed:holidays"]);
runOrThrow("npm", ["run", "seed:soa"]);
runOrThrow("npm", ["run", "migrate:enterprise-csv"], migrationEnv);

console.log("\nCompletion flow finished.");
console.log(`- Migration log: ${path.resolve(repoRoot, "logs", "enterprise-csv-migration-last-run.json")}`);
console.log(`- Spreadsheet output directory: ${path.resolve(repoRoot, reportOutputPath)}`);
