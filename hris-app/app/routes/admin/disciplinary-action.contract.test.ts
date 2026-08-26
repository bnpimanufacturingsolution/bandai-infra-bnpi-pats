import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const service = readFileSync(
	join(process.cwd(), "app", "services", "disciplinaryAction.service.ts"),
	"utf8",
);
const page = readFileSync(
	join(process.cwd(), "app", "routes", "admin", "disciplinary-action.tsx"),
	"utf8",
);

describe("disciplinary action page contract", () => {
	it("service hits the generated disciplinaryAction API", () => {
		expect(service).to.contain('"/api/disciplinaryAction"');
		expect(service).to.contain("document: true");
		expect(service).to.contain("count: true");
	});

	it("page has no mock data left and manages real cases", () => {
		expect(page).to.not.contain("mockRules");
		expect(page).to.not.contain("replace with actual API calls");
		expect(page).to.contain("disciplinaryActionService.list");
		expect(page).to.contain("disciplinaryActionService.create");
		expect(page).to.contain("disciplinaryActionService.update");
		expect(page).to.contain("disciplinaryActionService.remove");
		expect(page).to.contain("File Action");
	});
});
