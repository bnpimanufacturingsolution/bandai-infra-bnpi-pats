import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const tab = readFileSync(
	join(process.cwd(), "app", "routes", "hr", "reports", "tabs", "OvertimeTab.tsx"),
	"utf8",
);
const hook = readFileSync(join(process.cwd(), "app", "lib", "hooks", "useMetrics.ts"), "utf8");
const service = readFileSync(join(process.cwd(), "app", "services", "metrics.service.ts"), "utf8");

describe("overtime tab labor split contract", () => {
	it("offers a Labor Type filter wired to the metrics hook", () => {
		expect(tab).to.contain('label className="block text-sm font-medium mb-1">Labor Type</label>');
		expect(tab).to.contain('<SelectItem value="DIRECT">Direct</SelectItem>');
		expect(tab).to.contain('<SelectItem value="AGENCY">Agency</SelectItem>');
		expect(tab).to.contain("setWorkforceSource");
	});

	it("shows Direct OT and Agency OT summary chips from the split payload", () => {
		expect(tab).to.contain("Direct OT");
		expect(tab).to.contain("Agency OT");
		expect(tab).to.contain("split?.direct?.totalOvertimeHours");
		expect(tab).to.contain("split?.agency?.totalOvertimeHours");
	});

	it("includes Labor Type in the table and exports", () => {
		expect(tab).to.contain("<th");
		expect(tab).to.match(/Labor Type\s*<\/th>/);
		expect(tab).to.contain("{emp.workforceSource}");
		expect((tab.match(/Labor Type", accessor: "workforceSource"/g) || []).length).to.equal(2);
	});

	it("plumbs workforceSource through hook, cache key, and service payload", () => {
		expect(hook).to.contain("workforceSource ?? \"all\"");
		expect(service).to.contain("workforceSource !== \"all\" && { workforceSource }");
	});
});
