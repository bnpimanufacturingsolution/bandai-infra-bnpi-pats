import { expect } from "chai";
import { resolveEmployeeDailyRate, resolveTenureProRata } from "../helper/payroll-period.helper";

const MON_SAT = {
	pattern: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
		day,
		shiftSnapshot: { isOff: day === 7 },
	})),
};
const ALL_WEEK = {
	pattern: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
		day,
		shiftSnapshot: { isOff: false },
	})),
};

const PERIOD = { start: "2026-08-26", end: "2026-09-10" };

describe("resolveTenureProRata (schedule-based new-hire basic)", () => {
	it("full tenure keeps full period basic (factor 1, zero tally impact)", () => {
		const r = resolveTenureProRata({
			periodBasic: 30000,
			monthlyRate: 60000,
			periodStart: PERIOD.start,
			periodEnd: PERIOD.end,
			employmentStart: "2026-08-01",
			employmentTermination: null,
			weeklyPattern: MON_SAT,
		});
		expect(r.isPartialTenure).to.equal(false);
		expect(r.proRataFactor).to.equal(1);
		expect(r.basicPay).to.equal(30000);
		expect(r.scheduleDailyRate).to.equal(null);
	});

	it("EMP3337 Mon-Sat pattern, Sep-8 start: 3 tenure days over 26 monthly", () => {
		const r = resolveTenureProRata({
			periodBasic: 30000,
			monthlyRate: 60000,
			periodStart: PERIOD.start,
			periodEnd: PERIOD.end,
			employmentStart: "2026-09-08",
			employmentTermination: null,
			weeklyPattern: MON_SAT,
		});
		expect(r.isPartialTenure).to.equal(true);
		expect(r.tenureScheduledDays).to.equal(3);
		expect(r.monthlyScheduledDays).to.equal(26);
		expect(r.basicPay).to.be.closeTo(6923.08, 0.01);
		expect(r.scheduleDailyRate).to.be.closeTo(2307.69, 0.01);
		// Absent 2 of 3 at schedule daily nets the open day only.
		expect(r.basicPay - 2 * (r.scheduleDailyRate as number)).to.be.closeTo(2307.7, 0.5);
	});

	it("stored 7-day pattern is honored until HR fixes it (monthly 30.33)", () => {
		const r = resolveTenureProRata({
			periodBasic: 30000,
			monthlyRate: 60000,
			periodStart: PERIOD.start,
			periodEnd: PERIOD.end,
			employmentStart: "2026-09-08",
			employmentTermination: null,
			weeklyPattern: ALL_WEEK,
		});
		expect(r.isPartialTenure).to.equal(true);
		expect(r.tenureScheduledDays).to.equal(3);
		expect(r.monthlyScheduledDays).to.be.closeTo(30.33, 0.01);
		expect(r.basicPay).to.be.closeTo(5934.07, 0.5);
	});

	it("mid-period termination pro-rates the same way", () => {
		const r = resolveTenureProRata({
			periodBasic: 15000,
			monthlyRate: 30000,
			periodStart: PERIOD.start,
			periodEnd: PERIOD.end,
			employmentStart: "2026-01-01",
			employmentTermination: "2026-08-28",
			weeklyPattern: MON_SAT,
		});
		expect(r.isPartialTenure).to.equal(true);
		// Aug 26/27/28 = Wed/Thu/Fri, all workdays.
		expect(r.tenureScheduledDays).to.equal(3);
		expect(r.basicPay).to.be.closeTo(3461.54, 0.01);
	});

	it("1969 sentinel termination means still employed (full tenure)", () => {
		const r = resolveTenureProRata({
			periodBasic: 30000,
			monthlyRate: 60000,
			periodStart: PERIOD.start,
			periodEnd: PERIOD.end,
			employmentStart: "2026-08-01",
			employmentTermination: "1969-12-31T16:00:00.000Z",
			weeklyPattern: MON_SAT,
		});
		expect(r.isPartialTenure).to.equal(false);
		expect(r.basicPay).to.equal(30000);
	});

	it("missing pattern falls back to Mon-Sat standard with flag", () => {
		const r = resolveTenureProRata({
			periodBasic: 30000,
			monthlyRate: 60000,
			periodStart: PERIOD.start,
			periodEnd: PERIOD.end,
			employmentStart: "2026-09-08",
			employmentTermination: null,
			weeklyPattern: null,
		});
		expect(r.isPartialTenure).to.equal(true);
		expect(r.scheduleFallback).to.equal(true);
		expect(r.monthlyScheduledDays).to.equal(26);
		expect(r.tenureScheduledDays).to.equal(3);
	});

	it("basic never exceeds full period basic", () => {
		const r = resolveTenureProRata({
			periodBasic: 10000,
			monthlyRate: 60000,
			periodStart: PERIOD.start,
			periodEnd: PERIOD.end,
			employmentStart: "2026-09-08",
			employmentTermination: null,
			weeklyPattern: MON_SAT,
		});
		expect(r.basicPay).to.be.at.most(10000);
	});
});

describe("resolveEmployeeDailyRate (operator 600 fallback gate)", () => {
	const operator = (basicSalary: number | null, dailyRate: number | null = null) => ({
		position: { title: "Operator" },
		basicSalary,
		dailyRate,
	});

	it("explicit Daily Salary always wins, even for operators", () => {
		expect(resolveEmployeeDailyRate(operator(30000, 750))).to.equal(750);
	});

	it("legacy daily-scale operators keep the 600 fallback (basic 6,600)", () => {
		expect(resolveEmployeeDailyRate(operator(6600))).to.equal(600);
	});

	it("monthly-contract operators skip the fallback (EMP3337 30k, EMP3335 25k)", () => {
		expect(resolveEmployeeDailyRate(operator(30000))).to.equal(0);
		expect(resolveEmployeeDailyRate(operator(25000))).to.equal(0);
	});

	it("non-operators without Daily Salary resolve 0", () => {
		expect(resolveEmployeeDailyRate({ position: { title: "Assistant Manager" }, basicSalary: 40000, dailyRate: null })).to.equal(0);
	});
});
