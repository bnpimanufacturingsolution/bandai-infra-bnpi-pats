import { describe, expect, it } from "vitest";
import { computeSalaryLoanTerms } from "./salary-loan-terms";

describe("salary-loan-terms", () => {
	it("computes simple annual interest pro-rated by term", () => {
		const terms = computeSalaryLoanTerms(20000, 10, 12, "2026-09-01");
		expect(terms.total).to.equal(22000);
		expect(terms.monthly).to.equal(1833.33);
		expect(terms.end).to.equal("2027-09-01");
	});

	it("handles fractional terms and rounds to centavos", () => {
		const terms = computeSalaryLoanTerms(15000, 8, 6, "2026-03-15");
		expect(terms.total).to.equal(15600);
		expect(terms.monthly).to.equal(2600);
	});

	it("returns zero monthly for zero term", () => {
		const terms = computeSalaryLoanTerms(10000, 5, 0, "2026-01-01");
		expect(terms.monthly).to.equal(0);
	});
});
