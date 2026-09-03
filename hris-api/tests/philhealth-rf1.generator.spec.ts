/**
 * PhilHealth RF-1 generator math (spec gap M5.1, stage 11).
 * Pure row/summary math is pinned here; workbook rendering is exercised live.
 */
import { expect } from "chai";
import { describe, it } from "mocha";
import {
	buildPhilhealthRf1Row,
	summarizePhilhealthRf1Rows,
} from "../helper/philhealth-rf1.generator";

describe("philhealth-rf1.generator", () => {
	it("splits the stored contribution evenly (2.5% employee / 2.5% employer)", () => {
		const row = buildPhilhealthRf1Row({
			employeeCode: "00010",
			personalInfo: {
				firstName: "Zen",
				middleName: "Sample",
				lastName: "Andrei",
			},
			philhealthNo: "12-345678901-2",
			basicSalary: 11000,
			contribution: 550,
			adjustment: 0,
		});
		expect(row.employeeShare).to.equal(275);
		expect(row.employerShare).to.equal(275);
		expect(row.totalContribution).to.equal(550);
	});

	it("adds the adjustment on top of the premium for the total", () => {
		const row = buildPhilhealthRf1Row({
			employeeCode: "00147",
			contribution: 400,
			adjustment: 100,
		});
		expect(row.employeeShare).to.equal(200);
		expect(row.employerShare).to.equal(200);
		expect(row.totalContribution).to.equal(500);
	});

	it("rounds halves to centavos without losing totals", () => {
		const row = buildPhilhealthRf1Row({
			employeeCode: "00269",
			contribution: 505.25,
		});
		expect(row.employeeShare + row.employerShare).to.equal(505.25);
	});

	it("keeps a missing PhilHealth PIN explicit (null)", () => {
		const row = buildPhilhealthRf1Row({
			employeeCode: "00344",
			contribution: 500,
		});
		expect(row.philhealthNo).to.be.null;
	});

	it("summarizes employees, PIN coverage and totals", () => {
		const rows = [
			buildPhilhealthRf1Row({ employeeCode: "1", contribution: 550, philhealthNo: "X" }),
			buildPhilhealthRf1Row({ employeeCode: "2", contribution: 500 }),
			buildPhilhealthRf1Row({ employeeCode: "3", contribution: 250, adjustment: 50 }),
		];
		const summary = summarizePhilhealthRf1Rows(rows);
		expect(summary.employees).to.equal(3);
		expect(summary.withPin).to.equal(1);
		expect(summary.missingPin).to.equal(2);
		expect(summary.totalContribution).to.equal(1350);
	});
});
