import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const listSource = readFileSync(
	resolve(currentDir, "../components/shared/EmployeeList.tsx"),
	"utf8",
);
const hooksSource = readFileSync(resolve(currentDir, "./hooks/useEmployees.ts"), "utf8");

describe("employee hard delete UI contract", () => {
	it("keeps hard delete as an admin preview-first dropdown action", () => {
		expect(listSource).to.contain("canPreviewHardDelete");
		expect(listSource).to.contain("Preview hard delete");
		expect(listSource).to.contain('next.set("action", "hard-delete")');
		expect(listSource).to.contain("usePreviewEmployeeHardDelete");
		expect(listSource).to.contain("useExecuteEmployeeHardDelete");
	});

	it("shows force-delete warnings and planned delete/detach work before enabling execution", () => {
		expect(listSource).to.contain("Force delete required");
		expect(listSource).to.contain("Previewed actions");
		expect(listSource).to.contain("Would delete");
		expect(listSource).to.contain("Would detach");
		expect(listSource).to.contain("forceExecuteAvailable");
		expect(listSource).to.contain("Hard delete employee");
	});

	it("uses specific toasts for preview, execute, and blocked errors", () => {
		expect(hooksSource).to.contain("Preview complete:");
		expect(hooksSource).to.contain("Employee hard deleted");
		expect(hooksSource).to.contain("Cannot hard delete employee");
	});
});
