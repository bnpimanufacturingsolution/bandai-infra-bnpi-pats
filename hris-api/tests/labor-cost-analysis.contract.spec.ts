import { expect } from "chai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "mocha";

const helperSource = readFileSync(
	join(__dirname, "..", "helper", "labor-cost-analysis.helper.ts"),
	"utf8",
);
const controllerSource = readFileSync(
	join(__dirname, "..", "app", "metrics", "metrics.controller.ts"),
	"utf8",
);

describe("labor cost analysis contract", () => {
	it("aggregates payroll register money per department", () => {
		expect(helperSource).to.contain("calculateLaborCostAnalysis");
		expect(helperSource).to.contain("employeePayrolls");
		expect(helperSource).to.contain("grossPay");
		expect(helperSource).to.contain("netPay");
		expect(helperSource).to.contain("directGrossPay");
		expect(helperSource).to.contain("agencyGrossPay");
	});

	it("splits Direct vs Agency with DIRECT = not-AGENCY (incl. missing)", () => {
		expect(helperSource).to.contain('=== "AGENCY" ? "AGENCY" : "DIRECT"');
		expect(helperSource).to.contain('splitAcc[source === "AGENCY" ? "agency" : "direct"].headcount');
	});

	it("dedupes employee headcount across periods", () => {
		expect(helperSource).to.contain("seenEmployees.has(");
	});

	it("reads period payDate range and optional period/department/source filters", () => {
		expect(controllerSource).to.contain('case "laborCostAnalysis"');
		expect(controllerSource).to.contain("calculateLaborCostAnalysis");
		expect(controllerSource).to.contain("whereFilter.payrollPeriodId");
		expect(controllerSource).to.contain("whereFilter.workforceSource");
	});
});
