import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const tab = readFileSync(
	join(process.cwd(), "app", "routes", "hr", "reports", "tabs", "LaborCostTab.tsx"),
	"utf8",
);
const page = readFileSync(
	join(process.cwd(), "app", "routes", "hr", "reports", "workforce.tsx"),
	"utf8",
);
const service = readFileSync(join(process.cwd(), "app", "services", "metrics.service.ts"), "utf8");
const hooks = readFileSync(join(process.cwd(), "app", "lib", "hooks", "useMetrics.ts"), "utf8");

describe("labor cost tab contract", () => {
	it("is mounted as a workforce tab", () => {
		expect(page).to.contain('import { LaborCostTab }');
		expect(page).to.contain('"labor-cost"');
		expect(page).to.contain("<LaborCostTab />");
		expect(page).to.contain("Labor Cost");
	});

	it("shows gross/direct/agency/net chips from the analysis payload", () => {
		expect(tab).to.contain("Gross Payroll");
		expect(tab).to.contain("Direct Cost");
		expect(tab).to.contain("Agency Cost");
		expect(tab).to.contain("analysis?.split?.direct?.grossPay");
		expect(tab).to.contain("analysis?.split?.agency?.grossPay");
	});

	it("renders a per-department table with direct/agency headcounts", () => {
		expect(tab).to.contain("directHeadcount");
		expect(tab).to.contain("agencyHeadcount");
		expect(tab).to.match(/Gross\s*<\/th>/);
	});

	it("plumbs the query through hook + service (PayrollPeriod model)", () => {
		expect(hooks).to.contain("useLaborCostAnalysis");
		expect(service).to.contain('model: "PayrollPeriod"');
		expect(service).to.contain('"laborCostAnalysis"');
	});
});
