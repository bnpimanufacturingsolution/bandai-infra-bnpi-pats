import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const service = readFileSync(
	join(process.cwd(), "app", "services", "disciplinaryAction.service.ts"),
	"utf8",
);
const rulesService = readFileSync(
	join(process.cwd(), "app", "services", "disciplinaryRules.service.ts"),
	"utf8",
);
const page = readFileSync(
	join(process.cwd(), "app", "routes", "hr", "disciplinary-action.tsx"),
	"utf8",
);
const routes = readFileSync(join(process.cwd(), "app", "routes.ts"), "utf8");
const sidebar = readFileSync(
	join(process.cwd(), "app", "components", "organisms", "Sidebar.tsx"),
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
		expect(page).to.contain("MoreVertical");
		expect(page).to.contain("DropdownMenu");
		expect(page).to.contain("File Action");
	});

	it("offense type is driven by the disciplinary rule book", () => {
		expect(page).to.contain("disciplinaryRulesService.list");
		expect(page).to.contain("onOffenseTypeChange");
		expect(page).to.contain("Offense (from Rule Book)");
		expect(page).to.not.contain('{ value: "TARDINESS", label: "Tardiness" }');
		// Rule-book CRITICAL maps to the DA severity enum (LOW/MEDIUM/HIGH).
		expect(page).to.contain('severity === "CRITICAL" ? "HIGH"');
	});

	it("lives under the HR route prefix, not admin", () => {
		expect(routes).to.contain('route("disciplinary-action", "routes/hr/disciplinary-action.tsx")');
		expect(routes).to.not.contain('route("disciplinary-action", "routes/admin/disciplinary-action.tsx")');
	});

	it("is reachable from the HR sidebar Timekeeping section", () => {
		expect(sidebar).to.contain('id: "hr-discipline-actions"');
		expect(sidebar).to.contain('path: "/hr/disciplinary-action"');
	});
});
