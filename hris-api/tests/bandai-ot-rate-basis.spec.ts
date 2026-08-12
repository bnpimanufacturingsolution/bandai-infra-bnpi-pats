import { expect } from "chai";
import {
	BANDAI_DIRECT_ANNUAL_WORK_DAYS,
	BANDAI_SOURCE_DAILY_RATE_MAX,
	resolveBandaiApprovedBucketRateBasis,
} from "../helper/payroll-period.helper";

describe("resolveBandaiApprovedBucketRateBasis (BNPI 313 OT rate)", () => {
	it("always uses periodBasic×24/313 even when source daily ≤ 700", () => {
		// periodBasic 6000, 12 regular days → source daily 500 ≤ 700 (legacy path)
		const basis = resolveBandaiApprovedBucketRateBasis({
			periodBasic: 6000,
			sourceRegularDays: 12,
		});
		const expectedDaily = (6000 * 24) / BANDAI_DIRECT_ANNUAL_WORK_DAYS;
		expect(basis.method).to.equal("BNPI_DIRECT_313_APPROVED_BUCKETS");
		expect(basis.useSourceDailyRate).to.equal(false);
		expect(basis.wouldUseSourceDailyRate).to.equal(true);
		expect(basis.sourceDailyRate).to.be.closeTo(500, 0.01);
		expect(basis.exactDailyRate).to.be.closeTo(expectedDaily, 0.0001);
		expect(basis.exactHourlyRate).to.be.closeTo(expectedDaily / 8, 0.0001);
		// 16h OT @ 1.25 — pure 313 (not source-daily 500)
		const otPay = 16 * basis.exactHourlyRate * 1.25;
		const legacySourceDailyOtPay = 16 * (500 / 8) * 1.25; // 1250
		expect(otPay).to.be.closeTo(1150.16, 0.05);
		expect(otPay).to.be.below(legacySourceDailyOtPay);
		expect(basis.sourceDailyRate).to.be.at.most(BANDAI_SOURCE_DAILY_RATE_MAX);
	});

	it("uses 313 path for higher allocation daily as well", () => {
		// 9500 / 12 ≈ 791.67 > 700
		const basis = resolveBandaiApprovedBucketRateBasis({
			periodBasic: 9500,
			sourceRegularDays: 12,
		});
		const expectedDaily = (9500 * 24) / BANDAI_DIRECT_ANNUAL_WORK_DAYS;
		expect(basis.useSourceDailyRate).to.equal(false);
		expect(basis.wouldUseSourceDailyRate).to.equal(false);
		expect(basis.exactDailyRate).to.be.closeTo(expectedDaily, 0.0001);
		// Rio-class: 33h OT
		const ot = 33 * basis.exactHourlyRate * 1.25;
		expect(ot).to.be.closeTo(3755.99, 0.05);
	});

	it("handles zero regular days without using source daily", () => {
		const basis = resolveBandaiApprovedBucketRateBasis({
			periodBasic: 7975,
			sourceRegularDays: 0,
		});
		expect(basis.useSourceDailyRate).to.equal(false);
		expect(basis.sourceDailyRate).to.equal(0);
		expect(basis.exactDailyRate).to.be.closeTo((7975 * 24) / 313, 0.0001);
	});
});
