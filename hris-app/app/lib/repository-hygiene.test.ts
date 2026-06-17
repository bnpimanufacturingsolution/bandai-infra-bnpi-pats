import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const staleArtifacts = [
	"cleanup_modal.cjs",
	"cleanup_modal.js",
	"fix-api.js",
	"fix-imports.js",
	"migrate-routes.js",
	"routes.backup",
	"app/components/organisms/settings/boarding-templates-section.backup.tsx",
	"README_REFACTORING.md",
	"REFACTORING_PLAN_CLEAN.md",
	"REFACTORING_QUICK_START.md",
	"ROUTE_UNIFICATION_GUIDE.md",
	"tree.txt",
	"test-letter-spacing.html",
	"ARCHITECTURE_JOB_APPLICATION_FORM.md",
	"ATOMIC_COMPONENTS.md",
	"ATTENDANCE_APPROVAL.md",
	"DEEP_LINKING_IMPLEMENTATION.md",
	"IMPLEMENTATION_CHECKLIST.md",
	"LEAVE_REQUEST_MODAL.md",
	"PDF_GENERATOR_README.md",
	"REFACTORING_PLAN.md",
	"REFACTORING-QUICK-START.md",
	"route-analysis.md",
	"route-structure-proposal.md",
	"route-structure-suggestions.md",
	"duplicate-routes-report.json",
];

describe("repository hygiene", () => {
	it("keeps generated build output out of source control", () => {
		const trackedBuildOutput = execFileSync("git", ["ls-files", "build/client"], {
			cwd: root,
			encoding: "utf8",
		}).trim();

		expect(trackedBuildOutput).toBe("");
	});

	it("keeps stale one-off route and mutation artifacts out of the app repo", () => {
		for (const artifact of staleArtifacts) {
			expect(existsSync(join(root, artifact)), artifact).toBe(false);
		}
	});

	it("keeps Vite timestamp cache modules out of source control", () => {
		const timestampModules = readdirSync(root).filter((file) =>
			/^vite\.config\.ts\.timestamp-\d+-[a-f0-9]+\.mjs$/.test(file),
		);

		expect(timestampModules).toEqual([]);
	});

	it("ignores local screenshots, test result output, and route backup scratch folders", () => {
		const gitignore = readFileSync(join(root, ".gitignore"), "utf8");

		expect(gitignore).toContain("tmp/");
		expect(gitignore).toContain("test-results/");
		expect(gitignore).toContain("tmp-*.png");
		expect(gitignore).toContain("playwright-*.png");
		expect(gitignore).toContain("routes.backup/");
		expect(gitignore).toContain("build/client/");
		expect(gitignore).toContain(".env.*");
		expect(gitignore).toContain("playwright-report/");
		expect(gitignore).toContain(".firebase/");
		expect(gitignore).toContain(".firebase-hosting-preview.json");
		expect(gitignore).toContain("vite.config.ts.timestamp-*.mjs");
		expect(gitignore).toContain("test-letter-spacing.html");
	});
});
