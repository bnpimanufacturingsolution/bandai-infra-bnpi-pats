import { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { useSearchParams } from "react-router";
import {
	applyReportScopeStateToSearchParams,
	buildYearOptions,
	getDateRangeForScope,
	REPORT_SCOPE_VALUES,
	resolveReportScopeState,
	type ResolvedDateRange,
	type VisibleReportScope,
} from "~/lib/utils/report-scope";

export function useReportScopeFilters() {
	const [searchParams, setSearchParams] = useSearchParams();
	const now = useMemo(() => new Date(), []);

	const state = useMemo(
		() => resolveReportScopeState(searchParams, now),
		[searchParams, now],
	);

	const yearOptions = useMemo(() => buildYearOptions(now), [now]);

	const commitState = (nextState: {
		scope: VisibleReportScope;
		anchorMonth: number;
		anchorYear: number;
		dateRange: ResolvedDateRange;
	}) => {
		const nextSearchParams = new URLSearchParams(searchParams);
		applyReportScopeStateToSearchParams(nextSearchParams, nextState);
		setSearchParams(nextSearchParams, { replace: true });
	};

	const setScope = (value: string) => {
		const nextScope = (value || REPORT_SCOPE_VALUES.MONTHLY) as VisibleReportScope;
		const nextDateRange =
			nextScope === REPORT_SCOPE_VALUES.CUSTOM
				? state.dateRange
				: getDateRangeForScope(nextScope, state.anchorMonth, state.anchorYear, state.dateRange);

		commitState({
			scope: nextScope,
			anchorMonth: state.anchorMonth,
			anchorYear: state.anchorYear,
			dateRange: nextDateRange,
		});
	};

	const setMonth = (value: string) => {
		const anchorMonth = Number(value) + 1;
		const nextDateRange =
			state.scope === REPORT_SCOPE_VALUES.CUSTOM
				? state.dateRange
				: getDateRangeForScope(state.scope, anchorMonth, state.anchorYear, state.dateRange);

		commitState({
			scope: state.scope,
			anchorMonth,
			anchorYear: state.anchorYear,
			dateRange: nextDateRange,
		});
	};

	const setYear = (value: string) => {
		const anchorYear = Number(value);
		const nextDateRange =
			state.scope === REPORT_SCOPE_VALUES.CUSTOM
				? state.dateRange
				: getDateRangeForScope(state.scope, state.anchorMonth, anchorYear, state.dateRange);

		commitState({
			scope: state.scope,
			anchorMonth: state.anchorMonth,
			anchorYear,
			dateRange: nextDateRange,
		});
	};

	const setDateRange = (range: DateRange | undefined) => {
		if (!range?.from && !range?.to) {
			return;
		}

		const nextDateRange = getDateRangeForScope(
			REPORT_SCOPE_VALUES.CUSTOM,
			range?.from ? range.from.getMonth() + 1 : state.anchorMonth,
			range?.from ? range.from.getFullYear() : state.anchorYear,
			range,
		);

		commitState({
			scope: REPORT_SCOPE_VALUES.CUSTOM,
			anchorMonth: nextDateRange.from.getMonth() + 1,
			anchorYear: nextDateRange.from.getFullYear(),
			dateRange: nextDateRange,
		});
	};

	const clearFilters = () => {
		const anchorMonth = now.getMonth() + 1;
		const anchorYear = now.getFullYear();
		const dateRange = getDateRangeForScope(REPORT_SCOPE_VALUES.MONTHLY, anchorMonth, anchorYear);

		commitState({
			scope: REPORT_SCOPE_VALUES.MONTHLY,
			anchorMonth,
			anchorYear,
			dateRange,
		});
	};

	return {
		searchParams,
		setSearchParams,
		scope: state.scope,
		dateRange: state.dateRange,
		fromIso: state.fromIso,
		toIso: state.toIso,
		activeMonth: String(state.anchorMonth - 1),
		activeYear: String(state.anchorYear),
		yearOptions,
		setScope,
		setMonth,
		setYear,
		setDateRange,
		clearFilters,
	};
}
