import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const service = readFileSync(
	join(process.cwd(), "app", "services", "disciplinaryRules.service.ts"),
	"utf8",
);
const page = readFileSync(
	join(process.cwd(), "app", "routes", "admin", "rules-policies", "disciplinary.tsx"),
	"utf8",
);
const navigation = readFileSync(
	join(process.cwd(), "app", "lib", "admin-navigation.ts"),
	"utf8",
);
const routes = readFileSync(join(process.cwd(), "app", "routes.ts"), "utf8");

describe("disciplinary rule book page contract", () => {
	it("service lists rules from the generated Rule API with pagination flags", () => {
		expect(service).to.contain('"/api/Rule"');
		expect(service).to.contain("document: true");
		expect(service).to.contain("pagination: true");
		expect(service).to.contain("count: true");
		expect(service).to.contain("sort: \"code\"");
		expect(service).to.contain("severity");
		expect(service).to.contain("filters.join(\",\")");
	});

	it("page has no mock data and manages real rules through the service with pagination", () => {
		expect(page).to.not.contain("mockRules");
		expect(page).to.contain("disciplinaryRulesService.list");
		expect(page).to.contain("disciplinaryRulesService.create");
		expect(page).to.contain("disciplinaryRulesService.update");
		expect(page).to.contain("disciplinaryRulesService.remove");
		expect(page).to.contain("Disciplinary Rule Book");
		expect(page).to.contain("density=\"compact\"");
		expect(page).to.contain("onPageChange={setPage}");
		expect(page).to.contain("totalItems={total}");
		expect(page).to.contain("containedScroll");
		expect(page).to.contain("severityFilter");
		expect(page).to.contain("severityOptions");
		expect(page).to.contain("text-sm");
		expect(page).to.contain("MoreVertical");
		expect(page).to.contain("DropdownMenu");
		expect(page).to.not.contain("RulesPoliciesShell");
	});

	it("is reachable from the admin Rules & Policies sidebar section", () => {
		expect(navigation).to.contain('id: "disciplinary-rules"');
		expect(navigation).to.contain('path: "/admin/rules-policies/disciplinary"');
	});

	it("is registered under the admin rules-policies route prefix", () => {
		expect(routes).to.contain('route("disciplinary", "routes/admin/rules-policies/disciplinary.tsx")');
	});
});
