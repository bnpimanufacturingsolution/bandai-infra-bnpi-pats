import { describe, expect, it } from "vitest";
import {
	applyReportScopeStateToSearchParams,
	formatLocalDate,
	getDateRangeForScope,
	REPORT_SCOPE_VALUES,
	resolveReportScopeState,
} from "../report-scope";

describe("report-scope utilities", () => {
	it("defaults to the current month as monthly scope", () => {
		const state = resolveReportScopeState(new URLSearchParams(), new Date(2026, 3, 23));

		expect(state.scope).toBe(REPORT_SCOPE_VALUES.MONTHLY);
		expect(state.anchorMonth).toBe(4);
		expect(state.anchorYear).toBe(2026);
		expect(state.fromIso).toBe("2026-04-01");
		expect(state.toIso).toBe("2026-04-30");
	});

	it("derives quarterly boundaries from the selected month anchor", () => {
		const state = resolveReportScopeState(
			new URLSearchParams("scope=quarterly&month=5&year=2026"),
			new Date(2026, 3, 23),
		);

		expect(state.scope).toBe(REPORT_SCOPE_VALUES.QUARTERLY);
		expect(state.fromIso).toBe("2026-04-01");
		expect(state.toIso).toBe("2026-06-30");
	});

	it("resolves ytd using the selected month in the selected year", () => {
		const state = resolveReportScopeState(
			new URLSearchParams("scope=ytd&month=3&year=2025"),
			new Date(2026, 3, 23),
		);

		expect(state.fromIso).toBe("2025-01-01");
		expect(state.toIso).toBe("2025-03-31");
	});

	it("infers custom scope when only from/to are present", () => {
		const state = resolveReportScopeState(
			new URLSearchParams("from=2025-08-10&to=2025-08-20"),
			new Date(2026, 3, 23),
		);

		expect(state.scope).toBe(REPORT_SCOPE_VALUES.CUSTOM);
		expect(state.anchorMonth).toBe(8);
		expect(state.anchorYear).toBe(2025);
		expect(state.fromIso).toBe("2025-08-10");
		expect(state.toIso).toBe("2025-08-20");
	});

	it("keeps future half-year logic available in the shared utility", () => {
		const range = getDateRangeForScope(REPORT_SCOPE_VALUES.H2, 9, 2026);

		expect(formatLocalDate(range.from)).toBe("2026-07-01");
		expect(formatLocalDate(range.to)).toBe("2026-12-31");
	});

	it("writes scope, anchor month/year, and resolved dates back into search params", () => {
		const params = new URLSearchParams("tab=perfect");

		applyReportScopeStateToSearchParams(params, {
			scope: REPORT_SCOPE_VALUES.MONTHLY,
			anchorMonth: 2,
			anchorYear: 2026,
			dateRange: {
				from: new Date(2026, 1, 1),
				to: new Date(2026, 1, 28),
			},
		});

		expect(params.toString()).toContain("tab=perfect");
		expect(params.get("scope")).toBe("monthly");
		expect(params.get("month")).toBe("2");
		expect(params.get("year")).toBe("2026");
		expect(params.get("from")).toBe("2026-02-01");
		expect(params.get("to")).toBe("2026-02-28");
	});
});
