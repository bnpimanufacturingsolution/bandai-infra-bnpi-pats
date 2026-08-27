import { describe, expect, it } from "vitest";
import {
	buildDayStatusReviewCsvRows,
	type DayStatusReviewItem,
} from "./day-status-review.service";

const item = (over: Partial<DayStatusReviewItem> = {}): DayStatusReviewItem => ({
	code: "01792",
	name: "Alexa Sample",
	date: "2026-07-18",
	weekday: "Sat",
	status: "REVIEW_NO_EVIDENCE",
	reason: "scheduled day with no punch/leave/AWOL evidence",
	estAmount: 611.5,
	...over,
});

describe("day-status review service (HR-only surface)", () => {
	it("builds the export header and one row per review item", () => {
		const rows = buildDayStatusReviewCsvRows([item()]);
		expect(rows[0]).toEqual([
			"Employee Code",
			"Employee Name",
			"Date",
			"Weekday",
			"Status",
			"Reason",
			"Est Exposure (ESTIMATE_ONLY)",
		]);
		expect(rows[1]).toEqual([
			"01792",
			"Alexa Sample",
			"2026-07-18",
			"Sat",
			"REVIEW_NO_EVIDENCE",
			"scheduled day with no punch/leave/AWOL evidence",
			"611.5",
		]);
	});

	it("exports a blank exposure cell when no basis is known (never invents money)", () => {
		const rows = buildDayStatusReviewCsvRows([item({ estAmount: null })]);
		expect(rows[1][6]).toBe("");
	});

	it("keeps the ESTIMATE_ONLY contract in the header so exports cannot be read as payroll charges", () => {
		const header = buildDayStatusReviewCsvRows([])[0];
		expect(header[6]).toContain("ESTIMATE_ONLY");
		expect(buildDayStatusReviewCsvRows([])).toHaveLength(1);
	});
});
