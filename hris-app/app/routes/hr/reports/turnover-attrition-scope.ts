import type { DateRange } from "react-day-picker";
import { buildYearOptions, formatLocalDate, parseLocalDate } from "~/lib/utils/report-scope";

export const TURNOVER_ATTRITION_SCOPE_VALUES = {
	DAILY: "daily",
	WEEKLY: "weekly",
	MONTHLY: "monthly",
	YEARLY: "yearly",
	CUSTOM: "custom",
} as const;

export type TurnoverAttritionScope =
	(typeof TURNOVER_ATTRITION_SCOPE_VALUES)[keyof typeof TURNOVER_ATTRITION_SCOPE_VALUES];

export type TurnoverAttritionGroupBy = "day" | "week" | "month" | "year";

export interface TurnoverAttritionScopeState {
	scope: TurnoverAttritionScope;
	anchorDate: Date;
	anchorMonth: number;
	anchorYear: number;
	dateRange: {
		from: Date;
		to: Date;
	};
	fromIso: string;
	toIso: string;
	groupBy: TurnoverAttritionGroupBy;
}

function normalizeScope(value: string | null | undefined): TurnoverAttritionScope {
	switch (String(value || "").toLowerCase()) {
		case TURNOVER_ATTRITION_SCOPE_VALUES.DAILY:
			return TURNOVER_ATTRITION_SCOPE_VALUES.DAILY;
		case TURNOVER_ATTRITION_SCOPE_VALUES.WEEKLY:
			return TURNOVER_ATTRITION_SCOPE_VALUES.WEEKLY;
		case TURNOVER_ATTRITION_SCOPE_VALUES.YEARLY:
			return TURNOVER_ATTRITION_SCOPE_VALUES.YEARLY;
		case TURNOVER_ATTRITION_SCOPE_VALUES.CUSTOM:
			return TURNOVER_ATTRITION_SCOPE_VALUES.CUSTOM;
		case TURNOVER_ATTRITION_SCOPE_VALUES.MONTHLY:
		default:
			return TURNOVER_ATTRITION_SCOPE_VALUES.MONTHLY;
	}
}

function startOfWeekMonday(value: Date) {
	const date = new Date(value);
	const day = date.getDay();
	const offset = day === 0 ? -6 : 1 - day;
	date.setDate(date.getDate() + offset);
	return date;
}

function endOfWeekSunday(value: Date) {
	const start = startOfWeekMonday(value);
	const end = new Date(start);
	end.setDate(start.getDate() + 6);
	return end;
}

function getMonthlyRange(anchorMonth: number, anchorYear: number) {
	return {
		from: new Date(anchorYear, anchorMonth - 1, 1),
		to: new Date(anchorYear, anchorMonth, 0),
	};
}

function getYearlyRange(anchorYear: number) {
	return {
		from: new Date(anchorYear, 0, 1),
		to: new Date(anchorYear, 11, 31),
	};
}

function coerceCustomRange(
	customRange: DateRange | undefined,
	fallback: { from: Date; to: Date },
) {
	const from = customRange?.from || customRange?.to || fallback.from;
	const to = customRange?.to || customRange?.from || fallback.to;
	return from <= to ? { from, to } : { from: to, to: from };
}

export function getTurnoverAttritionDateRangeForScope(
	scope: TurnoverAttritionScope,
	anchorDate: Date,
	anchorMonth: number,
	anchorYear: number,
	customRange?: DateRange,
) {
	switch (scope) {
		case TURNOVER_ATTRITION_SCOPE_VALUES.DAILY:
			return { from: anchorDate, to: anchorDate };
		case TURNOVER_ATTRITION_SCOPE_VALUES.WEEKLY:
			return {
				from: startOfWeekMonday(anchorDate),
				to: endOfWeekSunday(anchorDate),
			};
		case TURNOVER_ATTRITION_SCOPE_VALUES.YEARLY:
			return getYearlyRange(anchorYear);
		case TURNOVER_ATTRITION_SCOPE_VALUES.CUSTOM:
			return coerceCustomRange(customRange, getMonthlyRange(anchorMonth, anchorYear));
		case TURNOVER_ATTRITION_SCOPE_VALUES.MONTHLY:
		default:
			return getMonthlyRange(anchorMonth, anchorYear);
	}
}

export function resolveTurnoverAttritionGroupBy(
	scope: TurnoverAttritionScope,
	dateRange: { from: Date; to: Date },
): TurnoverAttritionGroupBy {
	switch (scope) {
		case TURNOVER_ATTRITION_SCOPE_VALUES.DAILY:
		case TURNOVER_ATTRITION_SCOPE_VALUES.WEEKLY:
			return "day";
		case TURNOVER_ATTRITION_SCOPE_VALUES.MONTHLY:
			return "week";
		case TURNOVER_ATTRITION_SCOPE_VALUES.YEARLY:
			return "month";
		case TURNOVER_ATTRITION_SCOPE_VALUES.CUSTOM:
		default: {
			const diffDays =
				Math.floor((dateRange.to.getTime() - dateRange.from.getTime()) / 86400000) + 1;
			return diffDays <= 31 ? "day" : "month";
		}
	}
}

export function resolveTurnoverAttritionScopeState(
	searchParams: URLSearchParams,
	now = new Date(),
): TurnoverAttritionScopeState {
	const scope = normalizeScope(searchParams.get("scope"));
	const rawFrom = parseLocalDate(searchParams.get("from"));
	const rawTo = parseLocalDate(searchParams.get("to"));
	const rawDate = parseLocalDate(searchParams.get("date"));
	const rawMonth = Number(searchParams.get("month"));
	const rawYear = Number(searchParams.get("year"));
	const anchorDate = rawDate || rawFrom || now;
	const anchorMonth =
		rawMonth >= 1 && rawMonth <= 12 ? rawMonth : (rawFrom?.getMonth() || now.getMonth()) + 1;
	const anchorYear = rawYear >= 1000 ? rawYear : (rawFrom || now).getFullYear();

	const dateRange = getTurnoverAttritionDateRangeForScope(scope, anchorDate, anchorMonth, anchorYear, {
		from: rawFrom,
		to: rawTo,
	});

	return {
		scope,
		anchorDate,
		anchorMonth,
		anchorYear,
		dateRange,
		fromIso: formatLocalDate(dateRange.from),
		toIso: formatLocalDate(dateRange.to),
		groupBy: resolveTurnoverAttritionGroupBy(scope, dateRange),
	};
}

export function applyTurnoverAttritionScopeStateToSearchParams(
	searchParams: URLSearchParams,
	state: {
		scope: TurnoverAttritionScope;
		anchorDate: Date;
		anchorMonth: number;
		anchorYear: number;
		dateRange: {
			from: Date;
			to: Date;
		};
	},
) {
	searchParams.set("scope", state.scope);
	searchParams.set("date", formatLocalDate(state.anchorDate));
	searchParams.set("month", String(state.anchorMonth));
	searchParams.set("year", String(state.anchorYear));
	searchParams.set("from", formatLocalDate(state.dateRange.from));
	searchParams.set("to", formatLocalDate(state.dateRange.to));
}

export function buildTurnoverAttritionYearOptions(now = new Date(), count = 6) {
	return buildYearOptions(now, count);
}
