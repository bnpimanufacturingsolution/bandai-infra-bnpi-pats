/**
 * Unified Post-Import Tally Fix Orchestrator.
 *
 * Runs all essential post-import repairs in sequence and finishes with a live
 * payroll preview vs Sheet2 register tally comparison.
 *
 * Usage:
 *   node scripts/run-post-import-tally-fix.mjs --period=PP-20260626-20260711
 *   node scripts/run-post-import-tally-fix.mjs --period=PP-20260711-20260726
 *   npm run tally:fix -- --period=PP-20260626-20260711
 *
 * Steps Executed:
 *   1. Universal Meal Allowance (MLA) guarantee (₱500 to all Direct employees)
 *   2. Prior deduction history Jan–Jun (recurring loan enrollments)
 *   3. Loan 24-month horizon floor repair
 *   4. Late & Undertime precision recompute from punches
 *   5. Final Sheet2 register tally comparison & report generation
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const repoRoot = path.resolve(ROOT, "..");

function parseArgs(argv) {
	const args = {};
	for (const raw of argv.slice(2)) {
		const m = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(raw);
		if (m) args[m[1]] = m[2] === undefined ? true : m[2];
	}
	return args;
}

const args = parseArgs(process.argv);
const periodCode = typeof args.period === "string" ? args.period : "PP-20260626-20260711";
const skipTally = Boolean(args["skip-tally"]);

const LOCAL_DB_ENV = {
	DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public",
	PG_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public",
	WRITE_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public",
};

function runStep(stepNum, stepName, command, env = {}) {
	console.log(`\n===============================================================`);
	console.log(`[Step ${stepNum}/5] ${stepName}`);
	console.log(`Command: ${command}`);
	console.log(`===============================================================`);
	const t0 = Date.now();

	const mergedEnv = { ...process.env, ...LOCAL_DB_ENV, ...env };
	const envPairs = Object.entries(env)
		.map(([k, v]) => `$env:${k}='${String(v).replace(/'/g, "''")}';`)
		.join(" ");

	try {
		const stdout = execSync(`${envPairs}${command}`, {
			cwd: ROOT,
			env: mergedEnv,
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
			shell: process.platform === "win32" ? "powershell.exe" : undefined,
			stdio: "inherit",
		});
		const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
		console.log(`[Step ${stepNum}] COMPLETED in ${elapsed}s`);
		return { stepNum, stepName, status: "SUCCESS", elapsed };
	} catch (err) {
		const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
		console.error(`[Step ${stepNum}] FAILED after ${elapsed}s:`, err.message);
		return { stepNum, stepName, status: "FAILED", elapsed, error: err.message };
	}
}

async function main() {
	console.log(`===============================================================`);
	console.log(`  BNPI POST-IMPORT TALLY FIX PACK`);
	console.log(`  Target Period: ${periodCode}`);
	console.log(`  Started: ${new Date().toISOString()}`);
	console.log(`===============================================================`);

	const results = [];

	// Step 1: Universal MLA
	results.push(
		runStep(
			1,
			"Universal Meal Allowance (MLA Guarantee)",
			"npx tsx scripts/repair-bnpi-mla-universal.ts --execute",
		),
	);

	// Step 2: Prior Deduction Mass History
	results.push(
		runStep(
			2,
			"Prior Deduction Mass History (Jan–Jun Loans Seeding)",
			"npx tsx scripts/import-prior-deduction-mass-history.ts",
		),
	);

	// Step 3: Loan Multi-Cutoff Horizon Extension
	results.push(
		runStep(
			3,
			"Loan Multi-Cutoff Horizon Floor Repair",
			"node scripts/repair-bnpi-loan-multi-cutoff-horizon.mjs --execute",
		),
	);

	// Step 4: Late & Undertime Precision Recompute
	results.push(
		runStep(
			4,
			`Late & Undertime Precision Recompute (${periodCode})`,
			`npx tsx scripts/repair-period-late-ut-from-punches.ts --periodCode=${periodCode} --apply`,
		),
	);

	// Step 5: Tally Compare
	if (!skipTally) {
		results.push(
			runStep(
				5,
				`Live Payroll Preview vs Sheet2 Register Tally Compare (${periodCode})`,
				`npx tsx scripts/run-period-tally-compare.mjs --period=${periodCode}`,
			),
		);
	}

	console.log(`\n===============================================================`);
	console.log(`  POST-IMPORT TALLY FIX SUMMARY`);
	console.log(`===============================================================`);
	for (const r of results) {
		console.log(`  Step ${r.stepNum}: [${r.status}] ${r.stepName} (${r.elapsed}s)`);
	}
	console.log(`===============================================================\n`);
}

main().catch((err) => {
	console.error("FATAL ERROR in post-import tally fix orchestrator:", err);
	process.exit(1);
});
