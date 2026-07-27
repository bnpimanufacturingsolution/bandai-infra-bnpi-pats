import { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { useSearchParams } from "react-router";
import {
	applyTurnoverAttritionScopeStateToSearchParams,
	buildTurnoverAttritionYearOptions,
	getTurnoverAttritionDateRangeForScope,
	resolveTurnoverAttritionScopeState,
	TURNOVER_ATTRITION_SCOPE_VALUES,
	type TurnoverAttritionScope,
} from "./turnover-attrition-scope";
import { formatLocalDate } from "~/lib/utils/report-scope";

export function useTurnoverAttritionReportFilters() {
	const [searchParams, setSearchParams] = useSearchParams();
	const now = useMemo(() => new Date(), []);
	const state = useMemo(
		() => resolveTurnoverAttritionScopeState(searchParams, now),
		[searchParams, now],
	);
	const yearOptions = useMemo(() => buildTurnoverAttritionYearOptions(now), [now]);

	const commitState = (nextState: {
		scope: TurnoverAttritionScope;
		anchorDate: Date;
		anchorMonth: number;
		anchorYear: number;
		dateRange: {
			from: Date;
			to: Date;
		};
	}) => {
		const nextSearchParams = new URLSearchParams(searchParams);
		applyTurnoverAttritionScopeStateToSearchParams(nextSearchParams, nextState);
		setSearchParams(nextSearchParams, { replace: true });
	};

	const setScope = (scope: string) => {
		const nextScope = (scope || TURNOVER_ATTRITION_SCOPE_VALUES.MONTHLY) as TurnoverAttritionScope;
		const nextDateRange =
			nextScope === TURNOVER_ATTRITION_SCOPE_VALUES.CUSTOM
				? state.dateRange
				: getTurnoverAttritionDateRangeForScope(
						nextScope,
						state.anchorDate,
						state.anchorMonth,
						state.anchorYear,
						state.dateRange,
					);

		commitState({
			scope: nextScope,
			anchorDate: state.anchorDate,
			anchorMonth: state.anchorMonth,
			anchorYear: state.anchorYear,
			dateRange: nextDateRange,
		});
	};

	const setAnchorDate = (value: string) => {
		const nextDate = value ? new Date(`${value}T00:00:00`) : state.anchorDate;
		const nextDateRange = getTurnoverAttritionDateRangeForScope(
			state.scope,
			nextDate,
			nextDate.getMonth() + 1,
			nextDate.getFullYear(),
			state.dateRange,
		);

		commitState({
			scope: state.scope,
			anchorDate: nextDate,
			anchorMonth: nextDate.getMonth() + 1,
			anchorYear: nextDate.getFullYear(),
			dateRange: nextDateRange,
		});
	};

	const setMonth = (value: string) => {
		const anchorMonth = Number(value) + 1;
		const nextDateRange = getTurnoverAttritionDateRangeForScope(
			state.scope,
			state.anchorDate,
			anchorMonth,
			state.anchorYear,
			state.dateRange,
		);

		commitState({
			scope: state.scope,
			anchorDate: state.anchorDate,
			anchorMonth,
			anchorYear: state.anchorYear,
			dateRange: nextDateRange,
		});
	};

	const setYear = (value: string) => {
		const anchorYear = Number(value);
		const nextDateRange = getTurnoverAttritionDateRangeForScope(
			state.scope,
			state.anchorDate,
			state.anchorMonth,
			anchorYear,
			state.dateRange,
		);

		commitState({
			scope: state.scope,
			anchorDate: state.anchorDate,
			anchorMonth: state.anchorMonth,
			anchorYear,
			dateRange: nextDateRange,
		});
	};

	const setDateRange = (range: DateRange | undefined) => {
		if (!range?.from && !range?.to) {
			return;
		}

		const nextDateRange = getTurnoverAttritionDateRangeForScope(
			TURNOVER_ATTRITION_SCOPE_VALUES.CUSTOM,
			range?.from || state.anchorDate,
			range?.from ? range.from.getMonth() + 1 : state.anchorMonth,
			range?.from ? range.from.getFullYear() : state.anchorYear,
			range,
		);

		commitState({
			scope: TURNOVER_ATTRITION_SCOPE_VALUES.CUSTOM,
			anchorDate: nextDateRange.from,
			anchorMonth: nextDateRange.from.getMonth() + 1,
			anchorYear: nextDateRange.from.getFullYear(),
			dateRange: nextDateRange,
		});
	};

	const clearFilters = () => {
		const anchorDate = now;
		const anchorMonth = now.getMonth() + 1;
		const anchorYear = now.getFullYear();
		const dateRange = getTurnoverAttritionDateRangeForScope(
			TURNOVER_ATTRITION_SCOPE_VALUES.MONTHLY,
			anchorDate,
			anchorMonth,
			anchorYear,
		);

		commitState({
			scope: TURNOVER_ATTRITION_SCOPE_VALUES.MONTHLY,
			anchorDate,
			anchorMonth,
			anchorYear,
			dateRange,
		});
	};

	return {
		scope: state.scope,
		dateRange: state.dateRange,
		fromIso: state.fromIso,
		toIso: state.toIso,
		groupBy: state.groupBy,
		activeDate: formatLocalDate(state.anchorDate),
		activeMonth: String(state.anchorMonth - 1),
		activeYear: String(state.anchorYear),
		yearOptions,
		setScope,
		setAnchorDate,
		setMonth,
		setYear,
		setDateRange,
		clearFilters,
	};
}
