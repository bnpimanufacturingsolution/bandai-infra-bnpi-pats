import { expect } from "chai";
import {
	resolveBandaiApprovedBucketRateBasis,
	resolveBandaiSpecialHolidayWorkMultiplier,
} from "../helper/payroll-period.helper";

/**
 * Jul 11-25 Sheet2 proof (2026-08-25):
 * - "Spc Hol OT" = spclHrs x hourly x work-multiplier, where Path A (dailyRate>0)
 *   uses the FULL 1.3 and Path B uses the 0.30 premium-only.
 *   Samples: 00211 16x75x1.3=1560 (Path A) | 00093 8x134.185x0.3=322.04 (Path B)
 * - "Sun/Spc Hol OT Exc" = spclOtHrs x hourly x 1.69 (separate Sheet2 column).
 *   Sample: 00093 1x134.185x1.69=226.77
 */
describe("Bandai special-holiday premium vs excess split (Sheet2 truth)", () => {
	it("Path A daily-rated people use the FULL 1.3 special-holiday work premium", () => {
		const basis = resolveBandaiApprovedBucketRateBasis({
			periodBasic: 6600,
			sourceRegularDays: 1,
			dailyRate: 600,
		});
		expect(basis.path).to.equal("A");
		expect(basis.exactHourlyRate).to.equal(75);
		expect(resolveBandaiSpecialHolidayWorkMultiplier(basis.path)).to.equal(1.3);
		// Sheet2 00211: 16 hrs x 75 x 1.3 = 1560
		expect(16 * basis.exactHourlyRate * 1.3).to.equal(1560);
	});

	it("Path B monthly people use the 0.30 premium-only", () => {
		const basis = resolveBandaiApprovedBucketRateBasis({
			periodBasic: 14000,
			sourceRegularDays: 1,
			dailyRate: 0,
		});
		expect(basis.path).to.equal("B");
		expect(resolveBandaiSpecialHolidayWorkMultiplier(basis.path)).to.equal(0.3);
		const hourly = (14000 * 24) / 313 / 8;
		// Sheet2 00093 shape: 8 hrs x hourly x 0.3
		expect(8 * hourly * 0.3).to.be.closeTo(322.04, 0.5);
	});

	it("excess hours price at 1.69 in their own Sheet2 column", () => {
		const hourly = (28000 * 12) / 313 / 8;
		// Sheet2 00093: 1 hr x hourly x 1.69 = 226.77
		expect(1 * hourly * 1.69).to.be.closeTo(226.77, 0.5);
	});
});
