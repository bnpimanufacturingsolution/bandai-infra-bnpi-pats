import { describe, expect, it } from "vitest";
import {
	countMissingPunchNoPayDays,
	missingPunchNoPayDateKeys,
} from "./payroll-no-pay-days";

describe("payroll missing-punch no-pay helpers", () => {
	it("counts only flagged days", () => {
		expect(
			countMissingPunchNoPayDays([
				{ date: "2026-08-26", missingPunchNoPay: false },
				{ date: "2026-08-29", missingPunchNoPay: true },
				{ date: "2026-08-30", missingPunchNoPay: true },
				{ date: "2026-09-02" },
			]),
		).toBe(2);
	});

	it("returns 0 for missing or non-array input", () => {
		expect(countMissingPunchNoPayDays(undefined)).toBe(0);
		expect(countMissingPunchNoPayDays(null)).toBe(0);
		expect(countMissingPunchNoPayDays([])).toBe(0);
	});

	it("builds date keys only for flagged days with dates", () => {
		const keys = missingPunchNoPayDateKeys([
			{ date: "2026-08-29T00:00:00.000Z", missingPunchNoPay: true },
			{ date: "2026-08-26T00:00:00.000Z", missingPunchNoPay: false },
			{ missingPunchNoPay: true },
		]);
		expect(keys.size).toBe(1);
		expect(keys.has(new Date("2026-08-29T00:00:00.000Z").toDateString())).toBe(
			true,
		);
	});
});
