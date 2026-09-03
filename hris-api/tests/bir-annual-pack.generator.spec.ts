/**
 * Annual BIR pack math (spec gap M8.2). Pure aggregation pinned here;
 * workbook rendering is exercised live.
 */
import { expect } from "chai";
import { describe, it } from "mocha";
import {
	aggregateBirAlphalistRows,
	summarizeBir1604Cf,
} from "../helper/bir-annual-pack.generator";

describe("bir-annual-pack.generator", () => {
	const payrollFor = (
		employeeId: string,
		tin: string | null,
		gross: number,
		taxable: number,
		tax: number,
	) => ({
		employee: {
			employeeId,
			metadata: tin ? { manpowerDatabank: { tin } } : {},
			person: { personalInfo: { firstName: "A", lastName: employeeId } },
		},
		grossPay: gross,
		taxableIncome: taxable,
		taxAmount: tax,
	});

	it("aggregates multiple register rows per employee across cutoffs", () => {
		const rows = aggregateBirAlphalistRows([
			payrollFor("00010", "123-456-789", 10000, 8000, 500),
			payrollFor("00010", "123-456-789", 12000, 9500, 700),
			payrollFor("00147", null, 9000, 7000, 300),
		]);
		expect(rows).to.have.lengthOf(2);
		const zen = rows.find((row) => row.employeeCode === "00010");
		expect(zen?.grossCompensation).to.equal(22000);
		expect(zen?.taxableCompensation).to.equal(17500);
		expect(zen?.taxWithheld).to.equal(1200);
		expect(zen?.registerRows).to.equal(2);
	});

	it("sorts alphabetically by last name and keeps missing TIN explicit", () => {
		const rows = aggregateBirAlphalistRows([
			payrollFor("00269", null, 1, 1, 0),
			payrollFor("00344", "987-654-321", 1, 1, 0),
		]);
		expect(rows[0].lastName < rows[rows.length - 1].lastName).to.equal(true);
		const missing = rows.find((row) => row.employeeCode === "00269");
		expect(missing?.tin).to.be.null;
	});

	it("summarizes 1604-CF totals including TIN coverage", () => {
		const rows = aggregateBirAlphalistRows([
			payrollFor("00010", "123-456-789", 22000, 17500, 1200),
			payrollFor("00147", null, 18000, 14000, 600),
		]);
		const summary = summarizeBir1604Cf(rows);
		expect(summary.employees).to.equal(2);
		expect(summary.totalGrossCompensation).to.equal(40000);
		expect(summary.totalTaxWithheld).to.equal(1800);
		expect(summary.employeesMissingTin).to.equal(1);
	});
});
