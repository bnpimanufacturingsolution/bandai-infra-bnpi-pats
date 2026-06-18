import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

const cwd = process.cwd();
const outputDir = path.resolve(cwd, "output", "reports");
const vitestJsonPath = path.join(outputDir, "app-import-ui-vitest.json");
const jsonReportPath = path.join(outputDir, "app-import-ui-quality-breakdown.json");
const markdownReportPath = path.join(outputDir, "app-import-ui-quality-breakdown.md");

const TEST_FILES = [
	"app/lib/admin-migration-ui.test.ts",
	"app/lib/import-progress-ui.test.ts",
	"app/lib/attendance-import-ui.test.ts",
	"app/routes/admin/configuration/migration.import-route.test.ts",
	"app/routes/admin/configuration/attendance.import-route.test.ts",
];

const EVIDENCE_RULES = [
	{
		match: "getCollectionTotal",
		scope: "Admin migration counts",
		verifies: "migration count badges resolve totals from pagination, count-only, nested API responses, and collection fallback",
	},
	{
		match: "step labels and badges",
		scope: "Admin migration status",
		verifies: "migration status and count badges show skipped, checking, empty, singular, plural, and imported states correctly",
	},
	{
		match: "import modal search params",
		scope: "Admin migration modal state",
		verifies: "migration import modals preserve page params, open employee import with auto-create disabled, and clear modal-only params on close",
	},
	{
		match: "attendance import UI helpers",
		scope: "Attendance import payload",
		verifies: "attendance import UI sends the mutation contract shape expected by the hook, including create-timesheets options",
	},
	{
		match: "admin migration route contract",
		scope: "Admin migration route wiring",
		verifies: "admin migration route actions, modal titles, search params, and employee auto-create defaults remain wired in setup order",
	},
	{
		match: "attendance import route contract",
		scope: "Attendance import route wiring",
		verifies: "attendance import route template, allowed statuses, and source-of-truth labels stay aligned to backend import behavior",
	},
	{
		match: "formatElapsedImportTime",
		scope: "Import progress timing",
		verifies: "import progress elapsed time formats missing, millisecond, second, minute, and hour durations",
	},
	{
		match: "getImportProgressElapsedMs",
		scope: "Import progress timing",
		verifies: "import progress elapsed time uses explicit durationMs, completed timestamps, or in-flight current time",
	},
	{
		match: "parseImportDateMs",
		scope: "Import progress timing",
		verifies: "import progress date parsing rejects invalid timestamps",
	},
	{
		match: "shortenImportError",
		scope: "Import progress error display",
		verifies: "import progress error rows prefer useful error lines and truncate long messages",
	},
];

const divider = "-".repeat(100);

function formatDuration(ms) {
	if (typeof ms !== "number" || !Number.isFinite(ms)) return "-";
	const rounded = Math.max(0, Math.round(ms));
	const hours = Math.floor(rounded / 3_600_000);
	const minutes = Math.floor((rounded % 3_600_000) / 60_000);
	const seconds = Math.floor((rounded % 60_000) / 1000);
	const millis = rounded % 1000;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function normalizeFileName(filePath) {
	return path.relative(cwd, path.resolve(filePath)).replace(/\\/g, "/");
}

function resolveEvidence(test) {
	const haystack = [test.fullName, ...(test.ancestorTitles || []), test.title].join(" ");
	return (
		EVIDENCE_RULES.find((rule) => haystack.includes(rule.match)) || {
			scope: "NEEDS_MAPPING",
			verifies: "No evidence mapping rule exists yet for this test title.",
		}
	);
}

function runVitestJson() {
	fs.mkdirSync(outputDir, { recursive: true });
	if (fs.existsSync(vitestJsonPath)) fs.rmSync(vitestJsonPath, { force: true });

	const vitestCli = path.join(cwd, "node_modules", "vitest", "vitest.mjs");
	const args = [
		vitestCli,
		"run",
		"--reporter=json",
		`--outputFile=${vitestJsonPath}`,
		...TEST_FILES,
	];

	const startedAt = performance.now();
	const result = spawnSync(process.execPath, args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 1024 * 1024 * 20,
	});
	const commandDurationMs = performance.now() - startedAt;

	if (result.error) throw result.error;
	if (!fs.existsSync(vitestJsonPath)) {
		throw new Error("Vitest JSON reporter did not write the expected output file.");
	}

	return {
		commandDurationMs,
		exitCode: typeof result.status === "number" ? result.status : 1,
		stdout: result.stdout || "",
		stderr: result.stderr || "",
		report: JSON.parse(fs.readFileSync(vitestJsonPath, "utf8")),
	};
}

function buildTestResults(report) {
	const results = [];
	for (const fileResult of report.testResults || []) {
		const file = normalizeFileName(fileResult.name);
		for (const assertion of fileResult.assertionResults || []) {
			const evidence = resolveEvidence(assertion);
			results.push({
				status: assertion.status,
				title: assertion.fullName || assertion.title,
				file,
				durationMs: assertion.duration || 0,
				scope: evidence.scope,
				verifies: evidence.verifies,
				error: assertion.failureMessages?.join("\n") || "",
			});
		}
	}
	return results;
}

function groupByScope(tests) {
	const rows = new Map();
	for (const test of tests) {
		const row = rows.get(test.scope) || {
			scope: test.scope,
			tests: 0,
			failed: 0,
			durationMs: 0,
		};
		row.tests += 1;
		if (test.status !== "passed") row.failed += 1;
		row.durationMs += test.durationMs;
		rows.set(test.scope, row);
	}
	return Array.from(rows.values()).sort((a, b) => a.scope.localeCompare(b.scope));
}

function groupByFile(tests) {
	const rows = new Map();
	for (const test of tests) {
		const row = rows.get(test.file) || {
			file: test.file,
			passed: 0,
			failed: 0,
			durationMs: 0,
		};
		if (test.status === "passed") row.passed += 1;
		else row.failed += 1;
		row.durationMs += test.durationMs;
		rows.set(test.file, row);
	}
	return Array.from(rows.values()).sort((a, b) => a.file.localeCompare(b.file));
}

function writeReports({ commandDurationMs, report, tests, byScope, byFile }) {
	const generatedAt = new Date().toISOString();
	fs.writeFileSync(
		jsonReportPath,
		JSON.stringify(
			{
				generatedAt,
				commandDurationMs,
				vitestSummary: {
					total: report.numTotalTests,
					passed: report.numPassedTests,
					failed: report.numFailedTests,
					success: report.success,
				},
				evidenceRules: EVIDENCE_RULES,
				byScope,
				byFile,
				tests,
			},
			null,
			2,
		),
	);

	const lines = [
		"# App Import UI Quality Breakdown",
		"",
		`Generated at: ${generatedAt}`,
		`Command elapsed: ${formatDuration(commandDurationMs)}`,
		"",
		"## Scope Timing",
		"",
		"| Scope | Tests | Failed | Elapsed |",
		"|---|---:|---:|---:|",
		...byScope.map(
			(row) => `| ${row.scope} | ${row.tests} | ${row.failed} | ${formatDuration(row.durationMs)} |`,
		),
		"",
		"## Test Cases",
		"",
		"| Status | Elapsed | Scope | Test | Verifies |",
		"|---|---:|---|---|---|",
		...tests.map(
			(test) =>
				`| ${test.status} | ${formatDuration(test.durationMs)} | ${test.scope} | ${test.title.replace(/\|/g, "\\|")} | ${test.verifies.replace(/\|/g, "\\|")} |`,
		),
		"",
	];
	fs.writeFileSync(markdownReportPath, lines.join("\n"));
}

function printEvidenceCatalog() {
	console.log("\nApp import UI evidence mapping");
	console.log(divider);
	for (const rule of EVIDENCE_RULES) {
		console.log(`  ${rule.scope}`);
		console.log(`      verifies: ${rule.verifies}`);
	}
}

function main() {
	console.log("App import UI quality test run");
	console.log(`Started: ${new Date().toISOString()}`);
	console.log("\nTest files in scope");
	console.log(divider);
	for (const file of TEST_FILES) console.log(`  ${file}`);
	printEvidenceCatalog();

	const { commandDurationMs, exitCode, stdout, stderr, report } = runVitestJson();
	const tests = buildTestResults(report);
	const byScope = groupByScope(tests);
	const byFile = groupByFile(tests);

	console.log("\nScope elapsed-time breakdown");
	console.log(divider);
	for (const row of byScope) {
		console.log(
			`  ${row.scope.padEnd(30)} tests=${String(row.tests).padStart(2)} failed=${row.failed} elapsed=${formatDuration(row.durationMs)}`,
		);
	}

	console.log("\nTest file elapsed-time breakdown");
	console.log(divider);
	for (const row of byFile) {
		console.log(
			`  ${row.file.padEnd(45)} passed=${String(row.passed).padStart(2)} failed=${row.failed} elapsed=${formatDuration(row.durationMs)}`,
		);
	}

	console.log("\nIndividual test breakdown");
	console.log(divider);
	for (const test of tests) {
		const marker = test.status === "passed" ? "PASS" : "FAIL";
		console.log(`  ${marker} ${formatDuration(test.durationMs)} ${test.scope.padEnd(30)} ${test.title}`);
		console.log(`       verifies: ${test.verifies}`);
		if (test.error) console.log(`       error: ${test.error}`);
	}

	writeReports({ commandDurationMs, report, tests, byScope, byFile });

	if (stdout.trim()) {
		console.log("\nVitest stdout");
		console.log(divider);
		console.log(stdout.trim());
	}
	if (stderr.trim()) {
		console.log("\nVitest stderr");
		console.log(divider);
		console.log(stderr.trim());
	}

	console.log("\nRun summary");
	console.log(divider);
	console.log(`  Tests: ${report.numTotalTests}`);
	console.log(`  Passed: ${report.numPassedTests}`);
	console.log(`  Failed: ${report.numFailedTests}`);
	console.log(`  Command elapsed: ${formatDuration(commandDurationMs)}`);
	console.log(`  JSON artifact: ${path.relative(cwd, jsonReportPath)}`);
	console.log(`  Markdown artifact: ${path.relative(cwd, markdownReportPath)}`);

	if (exitCode !== 0 || report.numFailedTests > 0) {
		process.exitCode = exitCode || 1;
	}
}

main();
