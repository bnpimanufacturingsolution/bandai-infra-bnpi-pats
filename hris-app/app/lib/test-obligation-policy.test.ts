import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(repoRoot, "scripts", "check-test-obligations.mjs");

const runPolicy = (files: string[]) =>
	execFileSync(process.execPath, [scriptPath, "--files", files.join(",")], {
		cwd: repoRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});

describe("app test obligation policy", () => {
	it("does not force tests for docs, workflow, or generated output changes", () => {
		const output = runPolicy([
			"docs/testing-strategy.md",
			".github/workflows/firebase-hosting-develop.yml",
			"build/client/index.html",
		]);

		expect(output).toContain("0 behavior file(s)");
	});

	it("fails when app service behavior changes without service test evidence", () => {
		expect(() => runPolicy(["app/services/employees.service.ts"])).toThrowError(
			/Test obligation check failed/,
		);
	});

	it("does not accept unrelated same-domain tests as behavior evidence", () => {
		expect(() =>
			runPolicy([
				"app/services/employees.service.ts",
				"app/services/attendance.service.test.ts",
			]),
		).toThrowError(/employees\.service\.ts/);
	});

	it("accepts service behavior changes when a service test changed too", () => {
		const output = runPolicy([
			"app/services/employees.service.ts",
			"app/services/employees.service.test.ts",
		]);

		expect(output).toContain("1 behavior file(s), 1 test evidence file(s)");
	});

	it("treats named browser specs as evidence for matching route behavior", () => {
		const output = runPolicy([
			"app/routes/hr/employees.tsx",
			"tests/hr-employees.spec.ts",
		]);

		expect(output).toContain("1 behavior file(s), 1 test evidence file(s)");
	});

	it("does not let an unrelated browser spec stand in for component coverage", () => {
		expect(() =>
			runPolicy([
				"app/components/organisms/employee/EmployeeImportModal.tsx",
				"tests/hr-employees.spec.ts",
			]),
		).toThrowError(/EmployeeImportModal\.tsx/);
	});
});
