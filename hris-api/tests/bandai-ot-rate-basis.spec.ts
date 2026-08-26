import { expect } from "chai";
import {
	BANDAI_DIRECT_ANNUAL_WORK_DAYS,
	BANDAI_SOURCE_DAILY_RATE_MAX,
	resolveBandaiApprovedBucketRateBasis,
} from "../helper/payroll-period.helper";

describe("resolveBandaiApprovedBucketRateBasis (FILE_DUAL Path A/B)", () => {
	it("Path B: uses periodBasic×24/313 when dailyRate missing (even if source daily ≤ 700)", () => {
		// periodBasic 6000, 12 regular days → source daily 500 ≤ 700 (legacy path)
		const basis = resolveBandaiApprovedBucketRateBasis({
			periodBasic: 6000,
			sourceRegularDays: 12,
		});
		const expectedDaily = (6000 * 24) / BANDAI_DIRECT_ANNUAL_WORK_DAYS;
		expect(basis.method).to.equal("BNPI_DIRECT_313_APPROVED_BUCKETS");
		expect(basis.path).to.equal("B");
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

	it("Path B: uses 313 when dailyRate is 0", () => {
		const basis = resolveBandaiApprovedBucketRateBasis({
			periodBasic: 9500,
			sourceRegularDays: 12,
			dailyRate: 0,
		});
		const expectedDaily = (9500 * 24) / BANDAI_DIRECT_ANNUAL_WORK_DAYS;
		expect(basis.path).to.equal("B");
		expect(basis.method).to.equal("BNPI_DIRECT_313_APPROVED_BUCKETS");
		expect(basis.useSourceDailyRate).to.equal(false);
		expect(basis.exactDailyRate).to.be.closeTo(expectedDaily, 0.0001);
		const ot = 33 * basis.exactHourlyRate * 1.25;
		expect(ot).to.be.closeTo(3755.99, 0.05);
	});

	it("Path B: zero regular days still BNPI", () => {
		const basis = resolveBandaiApprovedBucketRateBasis({
			periodBasic: 7975,
			sourceRegularDays: 0,
		});
		expect(basis.path).to.equal("B");
		expect(basis.useSourceDailyRate).to.equal(false);
		expect(basis.sourceDailyRate).to.equal(0);
		expect(basis.exactDailyRate).to.be.closeTo((7975 * 24) / 313, 0.0001);
	});

	it("Path A: dailyRate=600 → hourly 75 and OT 8×75×1.25=750", () => {
		const basis = resolveBandaiApprovedBucketRateBasis({
			periodBasic: 6600,
			sourceRegularDays: 12,
			dailyRate: 600,
		});
		expect(basis.method).to.equal("FILE_DAILY_OVER_8_APPROVED_BUCKETS");
		expect(basis.path).to.equal("A");
		expect(basis.exactDailyRate).to.equal(600);
		expect(basis.exactHourlyRate).to.equal(75);
		expect(basis.registerDailyRate).to.equal(600);
		const otPay = 8 * basis.exactHourlyRate * 1.25;
		expect(otPay).to.equal(750);
		// Must not use BNPI (~63.26) for daily-rated
		const bnpiHourly = (6600 * 24) / 313 / 8;
		expect(basis.exactHourlyRate).to.be.above(bnpiHourly);
	});

	it("Path A: non-600 daily still uses daily/8", () => {
		const basis = resolveBandaiApprovedBucketRateBasis({
			periodBasic: 10000,
			sourceRegularDays: 10,
			dailyRate: 800,
		});
		expect(basis.path).to.equal("A");
		expect(basis.exactHourlyRate).to.equal(100);
		expect(16 * basis.exactHourlyRate * 1.25).to.equal(2000);
	});

	it("Path B: monthly-style periodBasic half of 30400 matches April Path B sample family", () => {
		// 00032-style: monthly 30400, period half 15200
		const basis = resolveBandaiApprovedBucketRateBasis({
			periodBasic: 15200,
			sourceRegularDays: 9,
			dailyRate: null,
		});
		expect(basis.path).to.equal("B");
		const hourly = (15200 * 24) / 313 / 8;
		expect(basis.exactHourlyRate).to.be.closeTo(hourly, 0.0001);
		const ot = 8 * basis.exactHourlyRate * 1.25;
		expect(ot).to.be.closeTo(1456.87, 0.05);
	});
});
