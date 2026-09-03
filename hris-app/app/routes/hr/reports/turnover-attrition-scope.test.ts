import { describe, expect, it } from "vitest";
import {
	applyTurnoverAttritionScopeStateToSearchParams,
	resolveTurnoverAttritionScopeState,
	TURNOVER_ATTRITION_SCOPE_VALUES,
} from "./turnover-attrition-scope";

describe("turnover attrition report scope", () => {
	it("defaults to the current month with weekly chart buckets", () => {
		const state = resolveTurnoverAttritionScopeState(
			new URLSearchParams(),
			new Date("2026-06-29T00:00:00.000Z"),
		);

		expect(state.scope).toBe(TURNOVER_ATTRITION_SCOPE_VALUES.MONTHLY);
		expect(state.fromIso).toBe("2026-06-01");
		expect(state.toIso).toBe("2026-06-30");
		expect(state.groupBy).toBe("week");
	});

	it("uses daily buckets for short custom ranges and monthly buckets for long custom ranges", () => {
		const shortRange = resolveTurnoverAttritionScopeState(
			new URLSearchParams("scope=custom&from=2026-06-01&to=2026-06-15"),
			new Date("2026-06-29T00:00:00.000Z"),
		);
		const longRange = resolveTurnoverAttritionScopeState(
			new URLSearchParams("scope=custom&from=2026-01-01&to=2026-06-30"),
			new Date("2026-06-29T00:00:00.000Z"),
		);

		expect(shortRange.groupBy).toBe("day");
		expect(longRange.groupBy).toBe("month");
	});

	it("writes the active scope state back to search params", () => {
		const params = new URLSearchParams();

		applyTurnoverAttritionScopeStateToSearchParams(params, {
			scope: TURNOVER_ATTRITION_SCOPE_VALUES.WEEKLY,
			anchorDate: new Date("2026-06-17T00:00:00.000Z"),
			anchorMonth: 6,
			anchorYear: 2026,
			dateRange: {
				from: new Date("2026-06-15T00:00:00.000Z"),
				to: new Date("2026-06-21T00:00:00.000Z"),
			},
		});

		expect(params.toString()).toBe(
			"scope=weekly&date=2026-06-17&month=6&year=2026&from=2026-06-15&to=2026-06-21",
		);
	});
});
