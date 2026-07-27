import assert from "node:assert/strict";
import {
	getFiscalYearEndMonth,
	getUtcMonthRangeContaining,
	isRecurringPeriodEligible,
	normalizeRecurrenceFrequency,
} from "../helper/benefit-recurrence.helper";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("benefit-recurrence.helper", () => {
	describe("normalizeRecurrenceFrequency", () => {
		it("defaults RECURRING null/missing/invalid to EVERY_CUTOFF", () => {
			assert.equal(normalizeRecurrenceFrequency("RECURRING", null), "EVERY_CUTOFF");
			assert.equal(normalizeRecurrenceFrequency("RECURRING", undefined), "EVERY_CUTOFF");
			assert.equal(normalizeRecurrenceFrequency("RECURRING", "NOPE"), "EVERY_CUTOFF");
		});

		it("accepts MONTHLY and YEARLY for RECURRING", () => {
			assert.equal(normalizeRecurrenceFrequency("RECURRING", "MONTHLY"), "MONTHLY");
			assert.equal(normalizeRecurrenceFrequency("RECURRING", "yearly"), "YEARLY");
		});

		it("returns null for non-RECURRING modes", () => {
			assert.equal(normalizeRecurrenceFrequency("TIME_BOUND", "MONTHLY"), null);
			assert.equal(normalizeRecurrenceFrequency("FIXED_INSTALLMENTS", "YEARLY"), null);
			assert.equal(normalizeRecurrenceFrequency(null, "EVERY_CUTOFF"), null);
		});
	});

	describe("getFiscalYearEndMonth", () => {
		it("maps fiscal start 1 → end 12 and start 4 → end 3", () => {
			assert.equal(getFiscalYearEndMonth(1), 12);
			assert.equal(getFiscalYearEndMonth(4), 3);
			assert.equal(getFiscalYearEndMonth(7), 6);
		});
	});

	describe("isRecurringPeriodEligible EVERY_CUTOFF", () => {
		it("is always eligible", () => {
			assert.equal(
				isRecurringPeriodEligible({
					frequency: "EVERY_CUTOFF",
					periodNumber: 1,
					periodEndDate: date("2026-01-15"),
				}),
				true,
			);
			assert.equal(
				isRecurringPeriodEligible({
					frequency: null,
					periodNumber: 1,
					periodEndDate: date("2026-01-15"),
				}),
				true,
			);
		});
	});

	describe("isRecurringPeriodEligible MONTHLY", () => {
		it("pays on periodNumber 2", () => {
			assert.equal(
				isRecurringPeriodEligible({
					frequency: "MONTHLY",
					periodNumber: 2,
					periodEndDate: date("2026-01-31"),
				}),
				true,
			);
		});

		it("skips semi-monthly period 1 when not sole period", () => {
			assert.equal(
				isRecurringPeriodEligible({
					frequency: "MONTHLY",
					periodNumber: 1,
					periodEndDate: date("2026-01-15"),
					isOnlyPeriodInMonth: false,
				}),
				false,
			);
		});

		it("pays on sole period in month (monthly org)", () => {
			assert.equal(
				isRecurringPeriodEligible({
					frequency: "MONTHLY",
					periodNumber: 1,
					periodEndDate: date("2026-01-31"),
					isOnlyPeriodInMonth: true,
				}),
				true,
			);
		});

		it("pays when payFrequency is MONTHLY and period is not explicit p1 dual-cutoff", () => {
			assert.equal(
				isRecurringPeriodEligible({
					frequency: "MONTHLY",
					periodNumber: null,
					periodEndDate: date("2026-02-28"),
					payFrequency: "MONTHLY",
				}),
				true,
			);
		});
	});

	describe("isRecurringPeriodEligible YEARLY", () => {
		it("pays December period 2 when fiscal year starts in January", () => {
			assert.equal(
				isRecurringPeriodEligible({
					frequency: "YEARLY",
					periodNumber: 2,
					periodEndDate: date("2026-12-31"),
					fiscalYearStartMonth: 1,
				}),
				true,
			);
		});

		it("skips December period 1 when not sole", () => {
			assert.equal(
				isRecurringPeriodEligible({
					frequency: "YEARLY",
					periodNumber: 1,
					periodEndDate: date("2026-12-15"),
					fiscalYearStartMonth: 1,
					isOnlyPeriodInMonth: false,
				}),
				false,
			);
		});

		it("skips non fiscal-end months", () => {
			assert.equal(
				isRecurringPeriodEligible({
					frequency: "YEARLY",
					periodNumber: 2,
					periodEndDate: date("2026-01-31"),
					fiscalYearStartMonth: 1,
				}),
				false,
			);
		});

		it("pays March period 2 when fiscal year starts in April", () => {
			assert.equal(
				isRecurringPeriodEligible({
					frequency: "YEARLY",
					periodNumber: 2,
					periodEndDate: date("2026-03-31"),
					fiscalYearStartMonth: 4,
				}),
				true,
			);
		});

		it("pays sole period in fiscal end month", () => {
			assert.equal(
				isRecurringPeriodEligible({
					frequency: "YEARLY",
					periodNumber: 1,
					periodEndDate: date("2026-12-31"),
					fiscalYearStartMonth: 1,
					isOnlyPeriodInMonth: true,
				}),
				true,
			);
		});
	});

	describe("getUtcMonthRangeContaining", () => {
		it("returns UTC month bounds for period end", () => {
			const range = getUtcMonthRangeContaining(date("2026-01-20"));
			assert.equal(range.start.toISOString(), "2026-01-01T00:00:00.000Z");
			assert.equal(range.end.getUTCFullYear(), 2026);
			assert.equal(range.end.getUTCMonth(), 0);
			assert.equal(range.end.getUTCDate(), 31);
		});
	});
});
