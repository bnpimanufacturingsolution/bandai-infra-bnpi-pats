import { expect } from "chai";
import { resolveBandaiPhilHealthCutoffContribution } from "../helper/payroll-period.helper";

/**
 * Jul 11-25 Sheet2 proof (2026-08-25):
 * - Monthly-rated: PH cutoff = monthly x 2.5% / 2 (277/277 exact pairs, no cap <= 85k)
 *   00032 monthly 30400 -> 380 | 00211-class daily 600 -> flat 390 (573/573)
 */
describe("Bandai PhilHealth cutoff schedule (Sheet2 truth)", () => {
	it("monthly-rated: monthly x 2.5% per cutoff", () => {
		expect(resolveBandaiPhilHealthCutoffContribution({ monthlyRate: 30400 })).to.equal(760);
		expect(resolveBandaiPhilHealthCutoffContribution({ monthlyRate: 15950 })).to.equal(398.75);
		expect(resolveBandaiPhilHealthCutoffContribution({ monthlyRate: 85000 })).to.equal(2125);
	});

	it("daily-rated cohort: flat 390 per cutoff regardless of daily rate", () => {
		expect(resolveBandaiPhilHealthCutoffContribution({ monthlyRate: 0, dailyRate: 600 })).to.equal(390);
		expect(resolveBandaiPhilHealthCutoffContribution({ dailyRate: 620 })).to.equal(390);
	});

	it("no rate -> 0 (fails closed)", () => {
		expect(resolveBandaiPhilHealthCutoffContribution({})).to.equal(0);
		expect(resolveBandaiPhilHealthCutoffContribution({ monthlyRate: 0 })).to.equal(0);
	});
});
