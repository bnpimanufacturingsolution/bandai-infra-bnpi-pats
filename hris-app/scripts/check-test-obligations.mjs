#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const BEHAVIOR_ROOTS = [
	"app/components/",
	"app/config/",
	"app/contexts/",
	"app/features/",
	"app/guard/",
	"app/guards/",
	"app/hooks/",
	"app/layouts/",
	"app/lib/",
	"app/routes/",
	"app/schemas/",
	"app/services/",
	"app/utils/",
	"app/zod/",
	"scripts/",
];

const IGNORED_ROOTS = [
	".github/",
	".react-router/",
	".wwg/",
	"build/",
	"dist/",
	"docs/",
	"firebase/",
	"node_modules/",
	"output/",
	"public/",
	"routes.backup/",
	"test-results/",
	"tmp/",
];

const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[tj]sx?$/;
const SOURCE_FILE_PATTERN = /\.[cm]?[tj]sx?$/;
const GENERIC_EVIDENCE_TOKENS = new Set([
	"card",
	"component",
	"config",
	"helper",
	"helpers",
	"lib",
	"modal",
	"page",
	"route",
	"routes",
	"service",
	"spec",
	"tab",
	"test",
	"ui",
	"view",
]);

function parseArgs(argv) {
	const args = {};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--help" || arg === "-h") {
			args.help = true;
			continue;
		}
		if (arg.startsWith("--files=")) {
			args.files = arg.slice("--files=".length);
			continue;
		}
		if (arg === "--files") {
			args.files = argv[index + 1] || "";
			index += 1;
			continue;
		}
		if (arg.startsWith("--base=")) {
			args.base = arg.slice("--base=".length);
			continue;
		}
		if (arg === "--base") {
			args.base = argv[index + 1] || "";
			index += 1;
			continue;
		}
		if (arg.startsWith("--head=")) {
			args.head = arg.slice("--head=".length);
			continue;
		}
		if (arg === "--head") {
			args.head = argv[index + 1] || "";
			index += 1;
		}
	}
	return args;
}

function usage() {
	return [
		"Usage: node scripts/check-test-obligations.mjs [--base <sha> --head <sha>]",
		"",
		"Checks whether changed app behavior files include matching test evidence.",
		"Docs, generated output, assets, and config-only changes are intentionally ignored.",
		"",
		"Test helper:",
		"  --files <comma-or-newline-separated paths>",
	].join("\n");
}

function normalizePath(filePath) {
	return filePath.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

function splitFiles(filesValue) {
	return filesValue
		.split(/[\n\r,]+/)
		.map(normalizePath)
		.filter(Boolean);
}

function runGit(args) {
	return execFileSync("git", args, { encoding: "utf8" });
}

function parseNameStatus(output) {
	return output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const parts = line.split(/\t+/);
			return normalizePath(parts[parts.length - 1]);
		});
}

function changedFilesFromRange(base, head) {
	if (!base || !head) return [];
	try {
		return parseNameStatus(
			runGit(["diff", "--name-status", "--diff-filter=ACMR", base, head]),
		);
	} catch {
		return [];
	}
}

function parseGithubRange() {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	if (!eventPath || !fs.existsSync(eventPath)) return {};

	try {
		const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
		if (event.pull_request?.base?.sha && event.pull_request?.head?.sha) {
			return {
				base: event.pull_request.base.sha,
				head: event.pull_request.head.sha,
			};
		}
		if (event.before && event.after) {
			return {
				base: event.before,
				head: event.after,
			};
		}
	} catch {
		return {};
	}

	return {};
}

function changedFilesFromLocalStatus() {
	try {
		return runGit(["status", "--porcelain=v1", "--untracked-files=all"])
			.split(/\r?\n/)
			.map((line) => {
				if (!line.trim()) return null;
				const status = line.slice(0, 2);
				if (status.includes("D") && !status.includes("A")) return null;
				const rawPath = line.slice(3).trim();
				const path = rawPath.includes(" -> ")
					? rawPath.split(" -> ").pop()
					: rawPath;
				return normalizePath(path.replace(/^"|"$/g, ""));
			})
			.filter(Boolean);
	} catch {
		return [];
	}
}

function getChangedFiles(args) {
	if (args.files !== undefined) {
		return splitFiles(args.files);
	}

	const range = {
		...parseGithubRange(),
		...(args.base ? { base: args.base } : {}),
		...(args.head ? { head: args.head } : {}),
	};

	const rangeFiles = changedFilesFromRange(range.base, range.head);
	if (rangeFiles.length > 0) return rangeFiles;

	return changedFilesFromLocalStatus();
}

function isIgnoredPath(filePath) {
	return IGNORED_ROOTS.some((root) => filePath.startsWith(root));
}

function isTestFile(filePath) {
	return (
		TEST_FILE_PATTERN.test(filePath) ||
		filePath.startsWith("tests/") ||
		filePath.startsWith("e2e/")
	);
}

function isBehaviorSource(filePath) {
	if (isIgnoredPath(filePath)) return false;
	if (isTestFile(filePath)) return false;
	if (!SOURCE_FILE_PATTERN.test(filePath)) return false;
	if (/\.d\.ts$/.test(filePath)) return false;
	if (filePath.startsWith("app/types/")) return false;
	if (filePath.startsWith("app/assets/")) return false;
	if (filePath.startsWith("app/data/mock")) return false;
	if (filePath.startsWith("app/examples/")) return false;
	if (filePath.startsWith("app/docs/")) return false;
	return BEHAVIOR_ROOTS.some((root) => filePath.startsWith(root));
}

function primaryDomainFor(filePath) {
	if (filePath.startsWith("scripts/")) return "scripts";
	if (filePath.startsWith("app/services/")) return "app/services";
	if (filePath.startsWith("app/routes/")) return "app/routes";
	if (filePath.startsWith("app/components/")) return "app/components";
	if (filePath.startsWith("app/contexts/")) return "app/access";
	if (filePath.startsWith("app/guards/") || filePath.startsWith("app/guard/")) return "app/access";
	if (filePath.startsWith("app/layouts/")) return "app/routes";
	if (filePath.startsWith("app/hooks/")) return "app/hooks";
	if (filePath.startsWith("app/lib/hooks/")) return "app/hooks";
	if (filePath.startsWith("app/lib/")) return "app/lib";
	if (filePath.startsWith("app/zod/") || filePath.startsWith("app/schemas/")) return "app/validation";
	return filePath.split("/").slice(0, 2).join("/");
}

function fileStem(filePath) {
	const fileName = filePath.split("/").pop() || filePath;
	return fileName.replace(/\.[cm]?[tj]sx?$/, "");
}

function testStem(filePath) {
	return fileStem(filePath).replace(/\.(test|spec)$/, "");
}

function normalizeToken(token) {
	if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
	if (token.endsWith("s") && token.length > 3) return token.slice(0, -1);
	return token;
}

function stemTokens(stem) {
	return stem
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.map(normalizeToken)
		.filter((token) => token.length > 2 && !GENERIC_EVIDENCE_TOKENS.has(token));
}

function compactStem(stem) {
	return stemTokens(stem).join("");
}

function stemsMatch(sourceStem, evidenceStem) {
	const sourceCompact = compactStem(sourceStem);
	const evidenceCompact = compactStem(evidenceStem);

	if (!sourceCompact || !evidenceCompact) return false;
	if (evidenceCompact === sourceCompact || evidenceCompact.startsWith(sourceCompact)) {
		return true;
	}

	const sourceTokens = stemTokens(sourceStem);
	const evidenceTokens = new Set(stemTokens(evidenceStem));
	const matchedTokens = sourceTokens.filter((token) => evidenceTokens.has(token));

	if (sourceTokens.length === 0) return false;
	if (sourceTokens.length === 1) return matchedTokens.length === 1;
	return matchedTokens.length === sourceTokens.length;
}

function isBrowserEvidence(testFile) {
	return testFile.startsWith("tests/") || testFile.startsWith("e2e/");
}

function isEvidenceFor(sourceFile, testFile) {
	const sourceDomain = primaryDomainFor(sourceFile);
	const evidenceStem = testStem(testFile);

	if (isBrowserEvidence(testFile)) {
		return (
			(sourceDomain === "app/routes" || sourceDomain === "app/components") &&
			stemsMatch(fileStem(sourceFile), evidenceStem)
		);
	}

	if (primaryDomainFor(testFile) !== sourceDomain) return false;
	return stemsMatch(fileStem(sourceFile), evidenceStem);
}

function hasEvidence(sourceFile, testFiles) {
	return testFiles.some((testFile) => isEvidenceFor(sourceFile, testFile));
}

function evidenceAreaFor(filePath) {
	return `${primaryDomainFor(filePath)}/${fileStem(filePath)}`;
}

function evaluate(files) {
	const normalizedFiles = Array.from(new Set(files.map(normalizePath).filter(Boolean)));
	const behaviorFiles = normalizedFiles.filter(isBehaviorSource);
	const testFiles = normalizedFiles.filter(isTestFile);
	const missing = behaviorFiles.filter((filePath) => !hasEvidence(filePath, testFiles));

	return {
		behaviorFiles,
		testFiles,
		missing,
	};
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(usage());
		return;
	}

	const files = getChangedFiles(args);
	const result = evaluate(files);

	if (result.missing.length > 0) {
		console.error("Test obligation check failed.");
		console.error("");
		console.error("Changed app behavior files need matching test evidence:");
		for (const filePath of result.missing) {
			console.error(`- ${filePath} (${evidenceAreaFor(filePath)})`);
		}
		console.error("");
		console.error(
			"Add or update a meaningful *.test.ts(x), *.spec.ts(x), or browser spec",
		);
		console.error(
			"for the same source feature. No test is required for docs, copy, assets, or config-only changes.",
		);
		process.exit(1);
	}

	console.log(
		`Test obligation check passed (${result.behaviorFiles.length} behavior file(s), ${result.testFiles.length} test evidence file(s)).`,
	);
}

main();
