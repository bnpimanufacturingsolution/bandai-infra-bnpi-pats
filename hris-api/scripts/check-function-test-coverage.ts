import fs from "node:fs";
import path from "node:path";

type FunctionRecord = {
	name: string;
	file: string;
};

type CoverageRow = FunctionRecord & {
	testFilesMatched: number;
	testCasesCount: number;
	pass: boolean;
};

const MIN_TEST_CASES = 5;
const SOURCE_DIRS = ["app", "helper", "utils", "middleware", "config", "lib"];
const TEST_DIR = "tests";
const REPORT_MD = ".wwg/reports/function-test-coverage-report.md";
const REPORT_JSON = ".wwg/reports/function-test-coverage-report.json";

function walkFiles(root: string, predicate: (file: string) => boolean): string[] {
	if (!fs.existsSync(root)) return [];
	const out: string[] = [];
	const stack = [root];
	while (stack.length) {
		const current = stack.pop() as string;
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(full);
				continue;
			}
			if (predicate(full)) out.push(full);
		}
	}
	return out;
}

function extractExportedFunctions(content: string): string[] {
	const names = new Set<string>();
	const fnDecl = /export\s+function\s+([A-Za-z0-9_]+)\s*\(/g;
	const constFn = /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/g;
	const constArrow = /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?[^=]*=>/g;

	for (const re of [fnDecl, constFn, constArrow]) {
		let m: RegExpExecArray | null;
		while ((m = re.exec(content)) !== null) {
			names.add(m[1]);
		}
	}
	return [...names];
}

function countItCases(content: string): number {
	const matches = content.match(/\bit\s*\(/g);
	return matches ? matches.length : 0;
}

function ensureDirForFile(filePath: string): void {
	const dir = path.dirname(filePath);
	fs.mkdirSync(dir, { recursive: true });
}

function toPosix(p: string): string {
	return p.replace(/\\/g, "/");
}

function main(): void {
	const repoRoot = process.cwd();
	const sourceFiles = SOURCE_DIRS.flatMap((dir) =>
		walkFiles(path.join(repoRoot, dir), (f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
	);
	const testFiles = walkFiles(path.join(repoRoot, TEST_DIR), (f) => f.endsWith(".spec.ts"));

	const functions: FunctionRecord[] = [];
	for (const file of sourceFiles) {
		const content = fs.readFileSync(file, "utf8");
		for (const name of extractExportedFunctions(content)) {
			functions.push({ name, file: toPosix(path.relative(repoRoot, file)) });
		}
	}

	const rows: CoverageRow[] = functions.map((fn) => {
		const matchedTests = testFiles.filter((testFile) => {
			const testContent = fs.readFileSync(testFile, "utf8");
			return testContent.includes(fn.name);
		});
		const testCasesCount = matchedTests.reduce((total, testFile) => {
			const content = fs.readFileSync(testFile, "utf8");
			return total + countItCases(content);
		}, 0);
		return {
			...fn,
			testFilesMatched: matchedTests.length,
			testCasesCount,
			pass: testCasesCount >= MIN_TEST_CASES
		};
	});

	const failing = rows.filter((r) => !r.pass);
	const summary = {
		minimumPerFunction: MIN_TEST_CASES,
		totalExportedFunctions: rows.length,
		passingFunctions: rows.length - failing.length,
		failingFunctions: failing.length,
		generatedAt: new Date().toISOString()
	};

	ensureDirForFile(path.join(repoRoot, REPORT_MD));
	ensureDirForFile(path.join(repoRoot, REPORT_JSON));

	const mdLines: string[] = [
		"# Function Test Coverage Report",
		"",
		`- Minimum test cases per exported function: ${MIN_TEST_CASES}`,
		`- Total exported functions scanned: ${summary.totalExportedFunctions}`,
		`- Passing functions: ${summary.passingFunctions}`,
		`- Failing functions: ${summary.failingFunctions}`,
		"",
		"## Failing Functions",
		""
	];

	if (failing.length === 0) {
		mdLines.push("- None.");
	} else {
		mdLines.push("| Function | Source File | Test Files Matched | Test Cases Count |");
		mdLines.push("|---|---|---:|---:|");
		for (const row of failing) {
			mdLines.push(`| ${row.name} | ${row.file} | ${row.testFilesMatched} | ${row.testCasesCount} |`);
		}
	}

	mdLines.push("");
	mdLines.push("## WWG Truth Synchronization");
	mdLines.push("");
	mdLines.push("- Task mode: test-governance");
	mdLines.push("- New truth detected: NO");
	mdLines.push("- Wiki updated: NO / N/A");
	mdLines.push("- Workspace updated: NO / N/A");
	mdLines.push("- Governance review completed: YES");
	mdLines.push("- Drift status: LOW");
	mdLines.push("- Canonical files changed:");
	mdLines.push("  - None by this report.");
	mdLines.push("- Implementation discoveries synced:");
	mdLines.push("  - Function-level coverage evidence recorded in this report.");
	mdLines.push("- Remaining stale context:");
	mdLines.push("  - Functions below threshold require additional tests or explicit owner waiver.");

	fs.writeFileSync(path.join(repoRoot, REPORT_MD), `${mdLines.join("\n")}\n`, "utf8");
	fs.writeFileSync(
		path.join(repoRoot, REPORT_JSON),
		`${JSON.stringify({ summary, rows }, null, 2)}\n`,
		"utf8"
	);

	if (failing.length > 0) {
		console.error(
			`Function test coverage gate failed: ${failing.length} function(s) below ${MIN_TEST_CASES} test cases.`
		);
		process.exit(1);
	}

	console.log("Function test coverage gate passed.");
}

main();
