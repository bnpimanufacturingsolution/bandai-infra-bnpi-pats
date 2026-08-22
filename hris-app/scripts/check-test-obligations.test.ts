import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts", "check-test-obligations.mjs");

const runPolicy = (files: string[]) =>
	execFileSync(process.execPath, [scriptPath, "--files", files.join(",")], {
		cwd: repoRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});

describe("test obligation CLI", () => {
	it("requires test-obligation script changes to carry direct script test evidence", () => {
		expect(() => runPolicy(["scripts/check-test-obligations.mjs"])).toThrowError(
			/Test obligation check failed/,
		);
	});

	it("accepts direct tests for test-obligation script changes", () => {
		const output = runPolicy([
			"scripts/check-test-obligations.mjs",
			"scripts/check-test-obligations.test.ts",
		]);

		expect(output).toContain("1 behavior file(s), 1 test evidence file(s)");
	});

	it("requires route browser specs to match the changed route feature", () => {
		expect(() =>
			runPolicy(["app/routes/hr/payroll.tsx", "tests/hr-employees.spec.ts"]),
		).toThrowError(/payroll\.tsx/);
	});

	it("accepts named browser specs for the matching route feature", () => {
		const output = runPolicy([
			"app/routes/hr/payroll.tsx",
			"tests/hr-payroll.spec.ts",
		]);

		expect(output).toContain("1 behavior file(s), 1 test evidence file(s)");
	});
});
