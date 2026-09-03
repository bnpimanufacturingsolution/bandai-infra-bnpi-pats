/**
 * Terminal pay engine math pins (M8.1/M1.1). Pure functions here; the DB
 * composition is exercised live via POST /api/reports/terminal-pay/preview.
 */
import { expect } from "chai";
import { describe, it } from "mocha";
import {
	bnpiDailyRate,
	computeThirteenthMonthProRata,
} from "../helper/terminal-pay.helper";

describe("terminal-pay.helper", () => {
	const lastDay = new Date("2026-08-15");

	it("pro-rates the 13th month by months worked in the year", () => {
		const full = computeThirteenthMonthProRata(12000, null, lastDay);
		expect(full.monthsThisYear).to.equal(8);
		expect(full.amount).to.equal(8000);

		const partial = computeThirteenthMonthProRata(
			12000,
			new Date("2026-03-10"),
			lastDay,
		);
		expect(partial.monthsThisYear).to.equal(6);
		expect(partial.amount).to.equal(6000);
	});

	it("derives the BNPI 313-basis daily rate", () => {
		const rate = bnpiDailyRate(13054.17);
		expect(rate).to.be.within(500, 500.5);
	});

	it("never returns a negative age-like month count for same-year hires", () => {
		const sameDay = computeThirteenthMonthProRata(
			12000,
			new Date("2026-08-15"),
			new Date("2026-08-15"),
		);
		expect(sameDay.monthsThisYear).to.equal(1);
	});
});
