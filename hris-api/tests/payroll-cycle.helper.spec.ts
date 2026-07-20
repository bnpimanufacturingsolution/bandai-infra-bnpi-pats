/// <reference types="mocha" />

import assert from "node:assert/strict";
import {
	buildPeriodsFromRange,
	getMergedCycleRules,
	type PayrollCycleConfigLike,
} from "../app/payrollperiod/payroll-cycle.helper";

const baseConfig: PayrollCycleConfigLike = {
	defaultPayFrequency: "SEMI_MONTHLY" as any,
	payDateOffsetDays: 5,
	businessDayRule: "NONE",
	includeHolidaysInBusinessDayCheck: false,
	cycleRules: null,
};

const withSemiMonthly = (rule: {
	firstStartDay: number;
	secondStartDay: number;
	secondEndDay: number | "LAST_DAY";
}): PayrollCycleConfigLike => ({
	...baseConfig,
	cycleRules: { SEMI_MONTHLY: rule },
});

const iso = (date: Date) => date.toISOString().slice(0, 10);

const semiMonthlyPeriods = (
	config: PayrollCycleConfigLike,
	rangeStart: string,
	rangeEnd: string,
) =>
	buildPeriodsFromRange({
		frequency: "SEMI_MONTHLY" as any,
		rangeStart: new Date(`${rangeStart}T00:00:00.000Z`),
		rangeEnd: new Date(`${rangeEnd}T00:00:00.000Z`),
		config,
		holidayKeys: new Set<string>(),
	});

describe("getMergedCycleRules semi-monthly normalization", () => {
	it("falls back to the 1-15/16-end default when no override is present", () => {
		const rules = getMergedCycleRules(baseConfig);
		assert.deepEqual(rules.SEMI_MONTHLY, {
			firstStartDay: 1,
			secondStartDay: 16,
			secondEndDay: "LAST_DAY",
		});
	});

	it("accepts a continuity-preserving wraparound override (10-24/25-9)", () => {
		const rules = getMergedCycleRules(
			withSemiMonthly({ firstStartDay: 10, secondStartDay: 25, secondEndDay: 9 }),
		);
		assert.deepEqual(rules.SEMI_MONTHLY, {
			firstStartDay: 10,
			secondStartDay: 25,
			secondEndDay: 9,
		});
	});

	it("rejects an override that would leave a gap between periods and falls back to the default", () => {
		const rules = getMergedCycleRules(
			withSemiMonthly({ firstStartDay: 10, secondStartDay: 25, secondEndDay: 31 }),
		);
		assert.deepEqual(rules.SEMI_MONTHLY, {
			firstStartDay: 1,
			secondStartDay: 16,
			secondEndDay: "LAST_DAY",
		});
	});
});

describe("buildPeriodsFromRange semi-monthly presets across month-length edge cases", () => {
	it("clamps the LAST_DAY preset (1-15/16-end) to February 28 in a non-leap year", () => {
		const periods = semiMonthlyPeriods(
			withSemiMonthly({ firstStartDay: 1, secondStartDay: 16, secondEndDay: "LAST_DAY" }),
			"2026-02-01",
			"2026-02-28",
		);

		assert.equal(periods.length, 2);
		assert.equal(iso(periods[0].startDate), "2026-02-01");
		assert.equal(iso(periods[0].endDate), "2026-02-15");
		assert.equal(iso(periods[1].startDate), "2026-02-16");
		assert.equal(iso(periods[1].endDate), "2026-02-28");
	});

	it("clamps the LAST_DAY preset (1-14/15-end) to February 29 in a leap year", () => {
		const periods = semiMonthlyPeriods(
			withSemiMonthly({ firstStartDay: 1, secondStartDay: 15, secondEndDay: "LAST_DAY" }),
			"2028-02-01",
			"2028-02-29",
		);

		assert.equal(periods.length, 2);
		assert.equal(iso(periods[0].endDate), "2028-02-14");
		assert.equal(iso(periods[1].startDate), "2028-02-15");
		assert.equal(iso(periods[1].endDate), "2028-02-29");
	});

	it("clamps the LAST_DAY preset to day 30 in a 30-day month (April)", () => {
		const periods = semiMonthlyPeriods(
			withSemiMonthly({ firstStartDay: 1, secondStartDay: 16, secondEndDay: "LAST_DAY" }),
			"2026-04-01",
			"2026-04-30",
		);

		assert.equal(iso(periods[1].endDate), "2026-04-30");
	});

	it("keeps day 31 boundaries intact in a 31-day month (January)", () => {
		const periods = semiMonthlyPeriods(
			withSemiMonthly({ firstStartDay: 1, secondStartDay: 16, secondEndDay: "LAST_DAY" }),
			"2026-01-01",
			"2026-01-31",
		);

		assert.equal(iso(periods[1].endDate), "2026-01-31");
	});

	it("resolves the wraparound preset (5-19/20-4) so period 2 ends on day 4 of the next month", () => {
		const periods = semiMonthlyPeriods(
			withSemiMonthly({ firstStartDay: 5, secondStartDay: 20, secondEndDay: 4 }),
			"2026-06-01",
			"2026-06-30",
		);

		assert.equal(iso(periods[0].startDate), "2026-06-05");
		assert.equal(iso(periods[0].endDate), "2026-06-19");
		assert.equal(iso(periods[1].startDate), "2026-06-20");
		assert.equal(iso(periods[1].endDate), "2026-07-04");
	});

	it("resolves the wraparound preset (10-24/25-9) across a December-to-January year rollover", () => {
		const periods = semiMonthlyPeriods(
			withSemiMonthly({ firstStartDay: 10, secondStartDay: 25, secondEndDay: 9 }),
			"2026-12-01",
			"2026-12-31",
		);

		assert.equal(iso(periods[0].startDate), "2026-12-10");
		assert.equal(iso(periods[0].endDate), "2026-12-24");
		assert.equal(iso(periods[1].startDate), "2026-12-25");
		assert.equal(iso(periods[1].endDate), "2027-01-09");
	});

	it("produces continuous, non-overlapping periods across a multi-month range with no gaps", () => {
		const periods = semiMonthlyPeriods(
			withSemiMonthly({ firstStartDay: 1, secondStartDay: 16, secondEndDay: "LAST_DAY" }),
			"2026-01-01",
			"2026-03-31",
		);

		assert.equal(periods.length, 6);
		for (let i = 1; i < periods.length; i += 1) {
			const previousEnd = periods[i - 1].endDate.getTime();
			const currentStart = periods[i].startDate.getTime();
			assert.equal(
				currentStart - previousEnd,
				1,
				`expected period ${i} to start immediately after period ${i - 1} ends`,
			);
		}
	});

	it("computes a pay date offset from each period end date when business-day rule is NONE", () => {
		const periods = semiMonthlyPeriods(
			withSemiMonthly({ firstStartDay: 1, secondStartDay: 16, secondEndDay: "LAST_DAY" }),
			"2026-02-01",
			"2026-02-28",
		);

		assert.equal(iso(periods[0].payDate), "2026-02-20");
		assert.equal(iso(periods[1].payDate), "2026-03-05");
	});
});
