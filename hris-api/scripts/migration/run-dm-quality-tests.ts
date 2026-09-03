import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { MIGRATION_DM_MASTERLIST } from "./migration-dm-masterlist";

interface MochaJsonTest {
	title: string;
	fullTitle: string;
	file?: string;
	duration?: number;
	err?: { message?: string; stack?: string };
}

interface MochaJsonReport {
	stats?: {
		suites: number;
		tests: number;
		passes: number;
		pending: number;
		failures: number;
		duration: number;
	};
	tests?: MochaJsonTest[];
	passes?: MochaJsonTest[];
	failures?: MochaJsonTest[];
	pending?: MochaJsonTest[];
}

interface TestEvidenceRule {
	match: string;
	dmScope: string;
	qualityGates: string[];
	verifies: string;
}

const TEST_FILES = [
	"tests/migration-script-safety.spec.ts",
	"tests/mongo-postgres-migration.spec.ts",
	"tests/enterprise-migration.service.spec.ts",
	"tests/enterprise-migration-dm-masterlist.spec.ts",
	"tests/enterprise-migration-dm-report.spec.ts",
	"tests/enterprise-migration-timesheet-quality.spec.ts",
	"tests/enterprise-csv-sample-pack.spec.ts",
	"tests/timesheet-backfill-source-truth.spec.ts",
	"tests/attendance-status-migration.spec.ts",
	"tests/import-service-contracts.spec.ts",
	"tests/migration-service-dry-run.spec.ts",
	"tests/seed-and-qa-script-safety.spec.ts",
];

const EVIDENCE_RULES: TestEvidenceRule[] = [
	{
		match: "migration script safety helpers",
		dmScope: "Migration safety",
		qualityGates: ["dry-run", "idempotency", "go-no-go-reporting"],
		verifies: "standalone migration/backfill scripts have explicit execute, target guard, and idempotency helper contracts",
	},
	{
		match: "mongo to postgres migration helpers",
		dmScope: "Mongo/Postgres",
		qualityGates: ["mapping-coverage", "referential-integrity", "idempotency"],
		verifies: "Mongo/Postgres backfill helpers cover high-risk models, field sanitization, FK fallback, and duplicate idempotency",
	},
	{
		match: "mongo postgres parity helpers",
		dmScope: "Mongo/Postgres",
		qualityGates: ["count-reconciliation", "schema-validation"],
		verifies: "Mongo/Postgres parity can report count mismatches and representative row signature mismatches",
	},
	{
		match: "timesheet line backfill source-of-truth contract",
		dmScope: "Backfill source truth",
		qualityGates: ["source-truth-split", "effective-timesheet-line-totals", "paid-payroll-snapshot-boundary"],
		verifies: "timesheet line backfill plans materialize from AttendanceObligation into effective Timesheetline rows without rewriting paid payroll snapshots",
	},
	{
		match: "attendance status and flags migration helpers",
		dmScope: "Attendance ledger migration",
		qualityGates: ["source-truth-split", "schema-validation"],
		verifies: "attendance status/flag migration derives deterministic Attendance ledger statuses and behavior flags",
	},
	{
		match: "attendance import service contracts",
		dmScope: "Import service",
		qualityGates: ["source-truth-split", "schema-validation", "effective-timesheet-line-totals"],
		verifies: "attendance import writes Attendance ledger rows, projects obligations, and deduplicates generated timesheet work by employee and period",
	},
	{
		match: "employee import reportTo backfill contract",
		dmScope: "Import service",
		qualityGates: ["source-truth-split", "referential-integrity"],
		verifies: "employee import reportTo second-pass changes refresh attendance obligations only when manager relationships actually change",
	},
	{
		match: "legacy migration service dry-run contract",
		dmScope: "Legacy migration service",
		qualityGates: ["dry-run", "no-write-safety"],
		verifies: "legacy migration service dry-run returns counts without invoking Prisma write methods",
	},
	{
		match: "seed script dry-run safety guard",
		dmScope: "Seed/QA safety",
		qualityGates: ["dry-run", "go-no-go-reporting"],
		verifies: "seed write scripts fail loudly when invoked under dry-run flags instead of pretending to validate",
	},
	{
		match: "qa and placeholder backfill safety registration",
		dmScope: "Seed/QA safety",
		qualityGates: ["mapping-coverage", "dry-run"],
		verifies: "QA post-actions and placeholder backfills remain visible in the safety registry",
	},
	{
		match: "builds a schema-valid attendance payload",
		dmScope: "DM6.1",
		qualityGates: ["schema-validation", "payload-contract", "source-truth-split"],
		verifies: "attendance migration builds a write-shape payload aligned to the Attendance ledger contract without unsupported fields",
	},
	{
		match: "builds a schema-valid payroll payload",
		dmScope: "DM6.4",
		qualityGates: ["schema-validation", "payload-contract", "paid-payroll-snapshot-boundary"],
		verifies: "payroll migration builds a write-shape payload with paid payroll history pinned to the timesheet snapshot contract",
	},
	{
		match: "treats the sample csv pack as GO in dry-run",
		dmScope: "DM0-DM7",
		qualityGates: ["actual-migration-dry-run", "stage-execution", "go-no-go-reporting", "no-write-safety"],
		verifies: "the actual enterprise migration service executes the full sample pack across all DM stages in dry-run mode and returns GO without database writes",
	},
	{
		match: "reports CSV provenance for true missing prerequisites",
		dmScope: "DM3",
		qualityGates: ["actual-migration-dry-run", "failure-path", "csv-provenance", "referential-integrity"],
		verifies: "the actual enterprise migration service rejects missing prerequisites with file, row, and field provenance",
	},
	{
		match: "warns and skips account creation",
		dmScope: "DM4.1-DM4.2",
		qualityGates: ["actual-migration-dry-run", "failure-path", "identity-validation", "account-provisioning"],
		verifies: "the actual enterprise migration service detects employee identity issues and skips unsafe user-account creation during dry-run",
	},
	{
		match: "keeps one quality-mapped masterlist row",
		dmScope: "DM0-DM7",
		qualityGates: ["mapping-coverage", "go-no-go-reporting"],
		verifies: "one canonical quality-mapped masterlist row exists for every DM report row, with unique DM codes and source files",
	},
	{
		match: "maps every recognized enterprise dataset",
		dmScope: "DM0-DM7",
		qualityGates: ["mapping-coverage", "schema-validation"],
		verifies: "every recognized dataset has visible business name, target model, and key-field mapping",
	},
	{
		match: "requires baseline quality gates",
		dmScope: "DM0-DM7",
		qualityGates: ["dry-run", "idempotency", "count-reconciliation", "timing-capture"],
		verifies: "every migration row requires the baseline quality gates and dependent rows require referential-integrity",
	},
	{
		match: "pins timesheet migration quality",
		dmScope: "DM6.2-DM6.4",
		qualityGates: [
			"source-truth-split",
			"effective-timesheet-line-totals",
			"approved-ot-from-timesheetline",
			"paid-payroll-snapshot-boundary",
		],
		verifies: "timesheets, timesheet lines, and payroll history are pinned to effective Timesheetline rows and EmployeePayroll.timesheetSnapshot",
	},
	{
		match: "keeps the employee business mapping",
		dmScope: "DM4.2",
		qualityGates: ["mapping-coverage"],
		verifies: "employee migration remains visibly mapped to Employee and User target models by employeeId",
	},
	{
		match: "keeps the canonical DM definition complete",
		dmScope: "DM0-DM7",
		qualityGates: ["mapping-coverage", "schema-validation"],
		verifies: "the report definition exposes the expected DM rows, order, sheet grouping, and recognized dataset keys",
	},
	{
		match: "generates DM0 to DM7 sheets",
		dmScope: "DM0-DM7",
		qualityGates: ["count-reconciliation", "timing-capture", "go-no-go-reporting"],
		verifies: "the accomplishment workbook renders DM sheets, counts, elapsed time, rows/sec, failures, warnings, and errors",
	},
	{
		match: "renders blank metrics and warnings",
		dmScope: "DM0-DM7",
		qualityGates: ["go-no-go-reporting", "count-reconciliation"],
		verifies: "missing datasets and stages are visible as blanks with warnings instead of false success",
	},
	{
		match: "builds a stable default output path",
		dmScope: "DM report artifact",
		qualityGates: ["go-no-go-reporting"],
		verifies: "DM report output path is stable and predictable for handoff artifacts",
	},
	{
		match: "keeps approved timesheet headers backed",
		dmScope: "DM6.2-DM6.3",
		qualityGates: ["source-truth-split", "effective-timesheet-line-totals"],
		verifies: "approved timesheet headers have submitted/approved metadata and effective line snapshots",
	},
	{
		match: "reconciles imported attendance rows to timesheet lines",
		dmScope: "DM6.1-DM6.3",
		qualityGates: ["referential-integrity", "source-truth-split"],
		verifies: "timesheet lines resolve back to imported Attendance ledger rows by employee and date",
	},
	{
		match: "reconciles paid payroll history",
		dmScope: "DM6.3-DM6.4",
		qualityGates: ["effective-timesheet-line-totals", "paid-payroll-snapshot-boundary"],
		verifies: "paid payroll regular and overtime totals reconcile to effective timesheet line totals",
	},
	{
		match: "builds paid payroll snapshots",
		dmScope: "DM6.4",
		qualityGates: ["paid-payroll-snapshot-boundary"],
		verifies: "paid payroll snapshots preserve timesheet totals before imported hour fallbacks",
	},
	{
		match: "keeps the sample organization aligned",
		dmScope: "DM0.1",
		qualityGates: ["schema-validation"],
		verifies: "sample organization import data aligns with the local seeded organization identity",
	},
	{
		match: "keeps the sample employee pack",
		dmScope: "DM4.1-DM4.2",
		qualityGates: ["schema-validation", "count-reconciliation"],
		verifies: "sample employee data has realistic validation volume and one-to-one person/employee coverage",
	},
	{
		match: "covers every recognized dataset",
		dmScope: "DM0-DM7",
		qualityGates: ["mapping-coverage", "schema-validation"],
		verifies: "sample CSV files exist for every recognized migration dataset",
	},
	{
		match: "exercises every DM sheet group",
		dmScope: "DM0-DM7",
		qualityGates: ["dry-run", "go-no-go-reporting"],
		verifies: "sample pack exercises every DM sheet group or reconciliation stage",
	},
	{
		match: "keeps cross-file references internally consistent",
		dmScope: "DM3-DM6",
		qualityGates: ["referential-integrity"],
		verifies: "sample departments, positions, employees, attendance, timesheets, payroll, SOA, and requests reference valid parents",
	},
	{
		match: "keeps sample request types aligned",
		dmScope: "DM6.8",
		qualityGates: ["schema-validation"],
		verifies: "sample request import types match the live Prisma RequestType enum",
	},
];

const cwd = process.cwd();
const outputDir = path.resolve(cwd, "output", "reports");
const jsonReportPath = path.join(outputDir, "migration-quality-test-breakdown.json");
const markdownReportPath = path.join(outputDir, "migration-quality-test-breakdown.md");

const divider = "-".repeat(100);

function formatDuration(ms?: number | null): string {
	if (typeof ms !== "number" || !Number.isFinite(ms)) return "-";
	const rounded = Math.max(0, Math.round(ms));
	const hours = Math.floor(rounded / 3_600_000);
	const minutes = Math.floor((rounded % 3_600_000) / 60_000);
	const seconds = Math.floor((rounded % 60_000) / 1000);
	const millis = rounded % 1000;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function normalizeFileName(file?: string): string {
	if (!file) return "(unknown file)";
	return path.relative(cwd, path.resolve(file)).replace(/\\/g, "/");
}

function extractMochaJson(stdout: string): MochaJsonReport {
	const start = stdout.indexOf("{");
	const end = stdout.lastIndexOf("}");
	if (start === -1 || end === -1 || end <= start) {
		throw new Error("Mocha JSON reporter output was not parseable.");
	}
	return JSON.parse(stdout.slice(start, end + 1)) as MochaJsonReport;
}

function resolveEvidence(test: MochaJsonTest): TestEvidenceRule {
	const haystack = `${test.fullTitle} ${test.title}`;
	return (
		EVIDENCE_RULES.find((rule) => haystack.includes(rule.match)) || {
			match: test.title,
			dmScope: "NEEDS_MAPPING",
			qualityGates: ["NEEDS_MAPPING"],
			verifies: "No evidence mapping rule exists yet for this test title.",
		}
	);
}

function printDmMapping() {
	console.log("\nDM masterlist mapping in scope");
	console.log(divider);
	let currentGroup = "";
	for (const row of MIGRATION_DM_MASTERLIST) {
		if (row.dmGroup !== currentGroup) {
			currentGroup = row.dmGroup;
			console.log(`\n${row.dmGroup} - ${row.businessGroup}`);
		}
		console.log(
			`  ${row.dmCode.padEnd(7)} ${row.businessName.padEnd(38)} file=${row.sourceFile.padEnd(34)} target=${row.targetModels.join(", ")}`,
		);
	}
}

function printEvidenceCatalog() {
	console.log("\nTest evidence mapping");
	console.log(divider);
	for (const rule of EVIDENCE_RULES) {
		console.log(`  ${rule.dmScope.padEnd(13)} gates=${rule.qualityGates.join(", ")}`);
		console.log(`      verifies: ${rule.verifies}`);
	}
}

function runMochaJson() {
	const tsxCli = path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs");
	const args = [
		tsxCli,
		"node_modules/mocha/bin/mocha",
		"--no-config",
		"--reporter",
		"json",
		...TEST_FILES,
	];

	const startedAt = performance.now();
	const result = spawnSync(process.execPath, args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 1024 * 1024 * 20,
	});
	const commandDurationMs = performance.now() - startedAt;

	if (result.error) {
		throw result.error;
	}

	const report = extractMochaJson(result.stdout || "");
	return {
		report,
		commandDurationMs,
		exitCode: typeof result.status === "number" ? result.status : 1,
		stderr: result.stderr || "",
	};
}

function groupByFile(tests: Array<ReturnType<typeof buildTestResult>>) {
	const rows = new Map<string, { file: string; passed: number; failed: number; pending: number; durationMs: number }>();
	for (const test of tests) {
		const existing = rows.get(test.file) || {
			file: test.file,
			passed: 0,
			failed: 0,
			pending: 0,
			durationMs: 0,
		};
		if (test.status === "passed") existing.passed += 1;
		if (test.status === "failed") existing.failed += 1;
		if (test.status === "pending") existing.pending += 1;
		existing.durationMs += test.durationMs || 0;
		rows.set(test.file, existing);
	}
	return Array.from(rows.values()).sort((a, b) => a.file.localeCompare(b.file));
}

function groupByDmScope(tests: Array<ReturnType<typeof buildTestResult>>) {
	const rows = new Map<string, { dmScope: string; tests: number; failed: number; durationMs: number; gates: Set<string> }>();
	for (const test of tests) {
		const existing = rows.get(test.dmScope) || {
			dmScope: test.dmScope,
			tests: 0,
			failed: 0,
			durationMs: 0,
			gates: new Set<string>(),
		};
		existing.tests += 1;
		if (test.status === "failed") existing.failed += 1;
		existing.durationMs += test.durationMs || 0;
		for (const gate of test.qualityGates) existing.gates.add(gate);
		rows.set(test.dmScope, existing);
	}
	return Array.from(rows.values())
		.map((row) => ({ ...row, gates: Array.from(row.gates).sort() }))
		.sort((a, b) => a.dmScope.localeCompare(b.dmScope));
}

function buildTestResult(test: MochaJsonTest, status: "passed" | "failed" | "pending") {
	const evidence = resolveEvidence(test);
	return {
		status,
		title: test.fullTitle || test.title,
		file: normalizeFileName(test.file),
		durationMs: test.duration || 0,
		dmScope: evidence.dmScope,
		qualityGates: evidence.qualityGates,
		verifies: evidence.verifies,
		error: test.err?.message || "",
	};
}

function writeReports(params: {
	commandDurationMs: number;
	report: MochaJsonReport;
	tests: Array<ReturnType<typeof buildTestResult>>;
	byFile: ReturnType<typeof groupByFile>;
	byDmScope: ReturnType<typeof groupByDmScope>;
}) {
	fs.mkdirSync(outputDir, { recursive: true });
	const generatedAt = new Date().toISOString();
	const dmRows = MIGRATION_DM_MASTERLIST.map((row) => ({
		dmCode: row.dmCode,
		dmGroup: row.dmGroup,
		businessGroup: row.businessGroup,
		businessName: row.businessName,
		sourceFile: row.sourceFile,
		targetModels: row.targetModels,
		keyFields: row.keyFields,
		dependencies: row.dependencies,
		qualityGates: row.qualityGates,
	}));

	fs.writeFileSync(
		jsonReportPath,
		JSON.stringify(
			{
				generatedAt,
				commandDurationMs: params.commandDurationMs,
				mochaStats: params.report.stats,
				dmRows,
				evidenceRules: EVIDENCE_RULES,
				byDmScope: params.byDmScope,
				byFile: params.byFile,
				tests: params.tests,
			},
			null,
			2,
		),
	);

	const lines = [
		"# Migration Quality Test Breakdown",
		"",
		`Generated at: ${generatedAt}`,
		`Command elapsed: ${formatDuration(params.commandDurationMs)}`,
		`Mocha elapsed: ${formatDuration(params.report.stats?.duration || 0)}`,
		"",
		"## DM Scope Timing",
		"",
		"| DM scope | Tests | Failed | Elapsed | Quality gates |",
		"|---|---:|---:|---:|---|",
		...params.byDmScope.map(
			(row) =>
				`| ${row.dmScope} | ${row.tests} | ${row.failed} | ${formatDuration(row.durationMs)} | ${row.gates.join(", ")} |`,
		),
		"",
		"## Test Cases",
		"",
		"| Status | Elapsed | DM scope | Test | Verifies |",
		"|---|---:|---|---|---|",
		...params.tests.map(
			(test) =>
				`| ${test.status} | ${formatDuration(test.durationMs)} | ${test.dmScope} | ${test.title.replace(/\|/g, "\\|")} | ${test.verifies.replace(/\|/g, "\\|")} |`,
		),
		"",
		"## DM Masterlist",
		"",
		"| DM | Business name | Source file | Target models | Key fields | Quality gates |",
		"|---|---|---|---|---|---|",
		...dmRows.map(
			(row) =>
				`| ${row.dmCode} | ${row.businessName} | ${row.sourceFile} | ${row.targetModels.join(", ")} | ${row.keyFields.join(", ")} | ${row.qualityGates.join(", ")} |`,
		),
		"",
	];

	fs.writeFileSync(markdownReportPath, lines.join("\n"));
}

function main() {
	console.log("Enterprise DM quality test run");
	console.log(`Started: ${new Date().toISOString()}`);
	printDmMapping();
	printEvidenceCatalog();
	console.log("\nRunning Mocha quality suite with JSON timing capture...");

	const { report, commandDurationMs, exitCode, stderr } = runMochaJson();
	const passed = new Set((report.passes || []).map((test) => test.fullTitle));
	const failed = new Set((report.failures || []).map((test) => test.fullTitle));
	const pending = new Set((report.pending || []).map((test) => test.fullTitle));

	const tests = (report.tests || []).map((test) => {
		if (failed.has(test.fullTitle)) return buildTestResult(test, "failed");
		if (pending.has(test.fullTitle)) return buildTestResult(test, "pending");
		if (passed.has(test.fullTitle)) return buildTestResult(test, "passed");
		return buildTestResult(test, "pending");
	});
	const byFile = groupByFile(tests);
	const byDmScope = groupByDmScope(tests);

	console.log("\nDM scope elapsed-time breakdown");
	console.log(divider);
	for (const row of byDmScope) {
		console.log(
			`  ${row.dmScope.padEnd(13)} tests=${String(row.tests).padStart(2)} failed=${row.failed} elapsed=${formatDuration(row.durationMs)} gates=${row.gates.join(", ")}`,
		);
	}

	console.log("\nTest file elapsed-time breakdown");
	console.log(divider);
	for (const row of byFile) {
		console.log(
			`  ${row.file.padEnd(55)} passed=${String(row.passed).padStart(2)} failed=${row.failed} pending=${row.pending} elapsed=${formatDuration(row.durationMs)}`,
		);
	}

	console.log("\nIndividual test breakdown");
	console.log(divider);
	for (const test of tests) {
		const marker = test.status === "passed" ? "PASS" : test.status === "failed" ? "FAIL" : "PEND";
		console.log(`  ${marker} ${formatDuration(test.durationMs)} ${test.dmScope.padEnd(13)} ${test.title}`);
		console.log(`       verifies: ${test.verifies}`);
		if (test.error) console.log(`       error: ${test.error}`);
	}

	writeReports({ commandDurationMs, report, tests, byFile, byDmScope });

	if (stderr.trim()) {
		console.log("\nMocha stderr");
		console.log(divider);
		console.log(stderr.trim());
	}

	console.log("\nRun summary");
	console.log(divider);
	console.log(`  Tests: ${report.stats?.tests ?? tests.length}`);
	console.log(`  Passed: ${report.stats?.passes ?? passed.size}`);
	console.log(`  Failed: ${report.stats?.failures ?? failed.size}`);
	console.log(`  Pending: ${report.stats?.pending ?? pending.size}`);
	console.log(`  Mocha elapsed: ${formatDuration(report.stats?.duration || 0)}`);
	console.log(`  Command elapsed: ${formatDuration(commandDurationMs)}`);
	console.log(`  JSON artifact: ${path.relative(cwd, jsonReportPath)}`);
	console.log(`  Markdown artifact: ${path.relative(cwd, markdownReportPath)}`);

	if (exitCode !== 0 || (report.stats?.failures || 0) > 0) {
		process.exitCode = exitCode || 1;
	}
}

main();
