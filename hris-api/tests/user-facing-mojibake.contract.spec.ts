import { expect } from "chai";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

/**
 * Guardrail: user-facing notification copy must stay ASCII / valid UTF-8.
 * UTF-8 emoji historically became Latin-1 mojibake (🎉 -> "ðŸŽ‰") in titles.
 */

const API_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(API_ROOT, "..");

const KEY_FILES = [
	{
		label: "checklistItem.controller.ts",
		abs: resolve(API_ROOT, "app/checklistItem/checklistItem.controller.ts"),
	},
	{
		label: "notification-dispatch.helper.ts",
		abs: resolve(API_ROOT, "helper/notification-dispatch.helper.ts"),
	},
	{
		label: "documents-tab.tsx",
		abs: resolve(REPO_ROOT, "hris-app/app/components/organisms/employee-detail/documents-tab.tsx"),
	},
] as const;

const USER_FACING_DIRS = [
	{ label: "hris-api/app", abs: resolve(API_ROOT, "app") },
	{ label: "hris-api/helper", abs: resolve(API_ROOT, "helper") },
	{ label: "hris-app/app", abs: resolve(REPO_ROOT, "hris-app/app") },
] as const;

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const SKIP_DIR_NAMES = new Set([
	"node_modules",
	"generated",
	"dist",
	"build",
	".git",
	"coverage",
]);

const MOJIBAKE_PARTY = "ðŸŽ";
const MOJIBAKE_ONBOARDING = "Onboarding Completed! ð";
const MOJIBAKE_PREFIX = "ðŸ";

const TITLE_OR_DESCRIPTION_KEY = /\b(?:title|description)\s*[:=]/g;
const TITLE_OR_DESCRIPTION_LITERAL =
	/\b(?:title|description)\s*[:=]\s*(?:`(?:\\.|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;

function walkSourceFiles(dir: string, acc: string[] = []): string[] {
	if (!existsSync(dir)) return acc;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith(".") && entry.isDirectory()) continue;
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (SKIP_DIR_NAMES.has(entry.name)) continue;
			walkSourceFiles(abs, acc);
			continue;
		}
		if (!SOURCE_EXTS.has(extname(entry.name))) continue;
		if (/\.(spec|test)\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
		if (statSync(abs).isFile()) acc.push(abs);
	}
	return acc;
}

function notificationLiteralHits(source: string): string[] {
	const hits: string[] = [];
	const literals = source.match(TITLE_OR_DESCRIPTION_LITERAL) ?? [];
	for (const literal of literals) {
		if (literal.includes(MOJIBAKE_PREFIX)) hits.push(literal);
	}

	let match: RegExpExecArray | null;
	TITLE_OR_DESCRIPTION_KEY.lastIndex = 0;
	while ((match = TITLE_OR_DESCRIPTION_KEY.exec(source))) {
		const window = source.slice(match.index, match.index + 400);
		if (!window.includes(MOJIBAKE_PREFIX)) continue;
		const quoted = window.match(/`(?:\\.|[^`])*ðŸ[\s\S]*?`|"(?:\\.|[^"\\])*ðŸ(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*ðŸ(?:\\.|[^'\\])*'/);
		if (quoted) hits.push(quoted[0]);
	}
	return [...new Set(hits)];
}

describe("user-facing mojibake contract", () => {
	it("reads the key source files", () => {
		for (const file of KEY_FILES) {
			expect(existsSync(file.abs), `missing ${file.label} at ${file.abs}`).to.equal(true);
			expect(readFileSync(file.abs, "utf8").length, `${file.label} is empty`).to.be.greaterThan(0);
		}
	});

	it("keeps key files free of party-popper and onboarding-title mojibake", () => {
		for (const file of KEY_FILES) {
			const source = readFileSync(file.abs, "utf8");
			expect(source, `${file.label} must not contain ${JSON.stringify(MOJIBAKE_PARTY)}`).to.not.include(
				MOJIBAKE_PARTY,
			);
			expect(
				source,
				`${file.label} must not contain ${JSON.stringify(MOJIBAKE_ONBOARDING)}`,
			).to.not.include(MOJIBAKE_ONBOARDING);
		}
	});

	it("fails if user-facing notification title/description literals contain ðŸ", () => {
		const leftovers: Array<{ file: string; sample: string }> = [];

		for (const dir of USER_FACING_DIRS) {
			expect(existsSync(dir.abs), `missing allowlist dir ${dir.label}`).to.equal(true);
			for (const abs of walkSourceFiles(dir.abs)) {
				const source = readFileSync(abs, "utf8");
				const hits = notificationLiteralHits(source);
				if (hits.length === 0) continue;
				leftovers.push({
					file: relative(REPO_ROOT, abs).replaceAll("\\", "/"),
					sample: hits[0].slice(0, 160),
				});
			}
		}

		expect(
			leftovers,
			leftovers
				.map((row) => `${row.file}: ${row.sample}`)
				.join("\n") || "notification title/description literals contain ðŸ",
		).to.deep.equal([]);
	});
});
