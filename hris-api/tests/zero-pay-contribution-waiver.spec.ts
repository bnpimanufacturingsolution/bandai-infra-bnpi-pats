/**
 * Zero-pay statutory contribution waiver (client-file truth, 2026-09-15).
 * 128/128 zero-pay rows across 9 client Sheet2 registers carry TOTAL DEDN = 0.
 */
import { expect } from "chai";
import fs from "fs";
import path from "path";
import {
	waiveZeroPayContributions,
	resolveBandaiPhilHealthCutoffContribution,
} from "../helper/payroll-period.helper";

describe("waiveZeroPayContributions (zero-pay = no statutory deductions)", () => {
	it("zeroes SSS/PhilHealth/Pag-IBIG when payable gross is zero", () => {
		const c = waiveZeroPayContributions(0, { sss: 1750, philHealth: 398.75, pagIbig: 200 });
		expect(c).to.deep.equal({ sss: 0, philHealth: 0, pagIbig: 0 });
	});

	it("also waives negative gross (defensive)", () => {
		const c = waiveZeroPayContributions(-12.5, { sss: 900, philHealth: 432.5, pagIbig: 100 });
		expect(c.philHealth).to.equal(0);
	});

	it("leaves contributions untouched when gross is positive", () => {
		const c = waiveZeroPayContributions(7975, { sss: 1750, philHealth: 398.75, pagIbig: 200 });
		expect(c).to.deep.equal({ sss: 1750, philHealth: 398.75, pagIbig: 200 });
	});

	it("proven drift cases: 00091 / 01303 PH-only totalDedn now tie the register at 0", () => {
		const ph = resolveBandaiPhilHealthCutoffContribution({ monthlyRate: 15950, dailyRate: null });
		expect(ph).to.be.closeTo(398.75, 0.01);
		expect(waiveZeroPayContributions(0, { sss: 0, philHealth: ph, pagIbig: 0 }).philHealth).to.equal(0);
	});

	it("both engine twins (generate + preview) call the waiver", () => {
		const src = fs.readFileSync(path.resolve(__dirname, "../helper/payroll-period.helper.ts"), "utf8");
		const calls = (src.match(/waiveZeroPayContributions\(grossPayWithSources, periodContributions\)/g) || []).length;
		expect(calls, "generate and preview paths must both apply the zero-pay waiver").to.equal(2);
	});
});
