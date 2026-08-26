import { expect } from "chai";
import { resolveBandaiRegisterBasicPay } from "../helper/payroll-period.helper";

describe("resolveBandaiRegisterBasicPay (FILE_DUAL Basic)", () => {
	it("Path A: paidDays × dailyRate (e.g. 10 × 600 = 6000)", () => {
		const r = resolveBandaiRegisterBasicPay({
			periodBasic: 6600,
			registerDailyRate: 600,
			paidRegularDays: 10,
		});
		expect(r.path).to.equal("A");
		expect(r.method).to.equal("FILE_PAID_DAYS_X_DAILY");
		expect(r.basicPay).to.equal(6000);
		expect(r.paidRegularDays).to.equal(10);
		expect(r.suppressFullDayAbsentDeduction).to.equal(true);
	});

	it("Path A: short paid days 2 × 600 = 1200", () => {
		const r = resolveBandaiRegisterBasicPay({
			periodBasic: 2400,
			registerDailyRate: 600,
			paidRegularDays: 2,
		});
		expect(r.basicPay).to.equal(1200);
		expect(r.suppressFullDayAbsentDeduction).to.equal(true);
	});

	it("Path A: falls back to presentFallbackDays when buckets missing", () => {
		const r = resolveBandaiRegisterBasicPay({
			periodBasic: 6600,
			registerDailyRate: 600,
			paidRegularDays: null,
			presentFallbackDays: 9,
		});
		expect(r.basicPay).to.equal(5400);
	});

	it("Path B: keeps period basic when no dailyRate", () => {
		const r = resolveBandaiRegisterBasicPay({
			periodBasic: 9500,
			registerDailyRate: 0,
			paidRegularDays: 10,
		});
		expect(r.path).to.equal("B");
		expect(r.method).to.equal("PERIOD_BASIC");
		expect(r.basicPay).to.equal(9500);
		expect(r.suppressFullDayAbsentDeduction).to.equal(false);
	});

	it("Path B: null dailyRate uses period basic", () => {
		const r = resolveBandaiRegisterBasicPay({
			periodBasic: 7975,
			registerDailyRate: null,
			paidRegularDays: 12,
		});
		expect(r.path).to.equal("B");
		expect(r.basicPay).to.equal(7975);
	});
});
