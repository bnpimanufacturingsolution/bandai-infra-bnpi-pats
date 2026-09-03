import type { DateRange } from "react-day-picker";

export const REPORT_SCOPE_VALUES = {
	MONTHLY: "monthly",
	QUARTERLY: "quarterly",
	YTD: "ytd",
	CUSTOM: "custom",
	H1: "h1",
	H2: "h2",
} as const;

export type ReportScope = (typeof REPORT_SCOPE_VALUES)[keyof typeof REPORT_SCOPE_VALUES];
export type VisibleReportScope =
	| typeof REPORT_SCOPE_VALUES.MONTHLY
	| typeof REPORT_SCOPE_VALUES.QUARTERLY
	| typeof REPORT_SCOPE_VALUES.YTD
	| typeof REPORT_SCOPE_VALUES.CUSTOM;

export interface ResolvedDateRange {
	from: Date;
	to: Date;
}

export interface ResolvedReportScopeState {
	scope: VisibleReportScope;
	anchorMonth: number;
	anchorYear: number;
	dateRange: ResolvedDateRange;
	fromIso: string;
	toIso: string;
}

const MONTH_LABELS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
] as const;

export const reportMonthOptions = MONTH_LABELS.map((label, index) => ({
	label,
	selectValue: String(index),
	paramValue: String(index + 1),
}));

export const visibleReportScopeOptions: Array<{ label: string; value: VisibleReportScope }> = [
	{ label: "Monthly", value: REPORT_SCOPE_VALUES.MONTHLY },
	{ label: "Quarterly", value: REPORT_SCOPE_VALUES.QUARTERLY },
	{ label: "YTD", value: REPORT_SCOPE_VALUES.YTD },
	{ label: "Custom", value: REPORT_SCOPE_VALUES.CUSTOM },
];

export function formatLocalDate(date: Date) {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string | null | undefined) {
	if (!value) return undefined;

	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return undefined;

	const [, yearText, monthText, dayText] = match;
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const parsed = new Date(year, month - 1, day);

	if (
		Number.isNaN(parsed.getTime()) ||
		parsed.getFullYear() !== year ||
		parsed.getMonth() !== month - 1 ||
		parsed.getDate() !== day
	) {
		return undefined;
	}

	return parsed;
}

export function normalizeVisibleReportScope(value: string | null | undefined): VisibleReportScope {
	const normalized = String(value || "").toLowerCase();

	switch (normalized) {
		case REPORT_SCOPE_VALUES.MONTHLY:
			return REPORT_SCOPE_VALUES.MONTHLY;
		case REPORT_SCOPE_VALUES.QUARTERLY:
			return REPORT_SCOPE_VALUES.QUARTERLY;
		case REPORT_SCOPE_VALUES.YTD:
			return REPORT_SCOPE_VALUES.YTD;
		case REPORT_SCOPE_VALUES.CUSTOM:
			return REPORT_SCOPE_VALUES.CUSTOM;
		default:
			return REPORT_SCOPE_VALUES.MONTHLY;
	}
}

function getCurrentAnchor(now = new Date()) {
	return {
		anchorMonth: now.getMonth() + 1,
		anchorYear: now.getFullYear(),
	};
}

function getMonthlyRange(anchorMonth: number, anchorYear: number): ResolvedDateRange {
	return {
		from: new Date(anchorYear, anchorMonth - 1, 1),
		to: new Date(anchorYear, anchorMonth, 0),
	};
}

function getQuarterlyRange(anchorMonth: number, anchorYear: number): ResolvedDateRange {
	const quarterStartMonth = Math.floor((anchorMonth - 1) / 3) * 3 + 1;
	return {
		from: new Date(anchorYear, quarterStartMonth - 1, 1),
		to: new Date(anchorYear, quarterStartMonth + 2, 0),
	};
}

function getYtdRange(anchorMonth: number, anchorYear: number): ResolvedDateRange {
	return {
		from: new Date(anchorYear, 0, 1),
		to: new Date(anchorYear, anchorMonth, 0),
	};
}

function getHalfYearRange(
	scope: typeof REPORT_SCOPE_VALUES.H1 | typeof REPORT_SCOPE_VALUES.H2,
	anchorYear: number,
): ResolvedDateRange {
	if (scope === REPORT_SCOPE_VALUES.H1) {
		return {
			from: new Date(anchorYear, 0, 1),
			to: new Date(anchorYear, 6, 0),
		};
	}

	return {
		from: new Date(anchorYear, 6, 1),
		to: new Date(anchorYear, 12, 0),
	};
}

function coerceCustomRange(
	customRange: DateRange | undefined,
	fallback: ResolvedDateRange,
): ResolvedDateRange {
	const from = customRange?.from || customRange?.to || fallback.from;
	const to = customRange?.to || customRange?.from || fallback.to;

	return from <= to ? { from, to } : { from: to, to: from };
}

export function getDateRangeForScope(
	scope: ReportScope,
	anchorMonth: number,
	anchorYear: number,
	customRange?: DateRange,
): ResolvedDateRange {
	switch (scope) {
		case REPORT_SCOPE_VALUES.QUARTERLY:
			return getQuarterlyRange(anchorMonth, anchorYear);
		case REPORT_SCOPE_VALUES.YTD:
			return getYtdRange(anchorMonth, anchorYear);
		case REPORT_SCOPE_VALUES.CUSTOM:
			return coerceCustomRange(customRange, getMonthlyRange(anchorMonth, anchorYear));
		case REPORT_SCOPE_VALUES.H1:
		case REPORT_SCOPE_VALUES.H2:
			return getHalfYearRange(scope, anchorYear);
		case REPORT_SCOPE_VALUES.MONTHLY:
		default:
			return getMonthlyRange(anchorMonth, anchorYear);
	}
}

export function resolveReportScopeState(
	searchParams: URLSearchParams,
	now = new Date(),
): ResolvedReportScopeState {
	const currentAnchor = getCurrentAnchor(now);
	const rawFrom = parseLocalDate(searchParams.get("from"));
	const rawTo = parseLocalDate(searchParams.get("to"));
	const rawMonth = Number(searchParams.get("month"));
	const rawYear = Number(searchParams.get("year"));
	const hasCustomRange = Boolean(rawFrom || rawTo);
	const hasAnchor = rawMonth >= 1 && rawMonth <= 12 && Number.isFinite(rawYear);

	const inferredScope = searchParams.get("scope")
		? normalizeVisibleReportScope(searchParams.get("scope"))
		: hasCustomRange
			? REPORT_SCOPE_VALUES.CUSTOM
			: REPORT_SCOPE_VALUES.MONTHLY;

	const anchorMonth =
		hasAnchor && rawMonth >= 1 && rawMonth <= 12
			? rawMonth
			: (rawFrom ? rawFrom.getMonth() + 1 : currentAnchor.anchorMonth);
	const anchorYear =
		hasAnchor && Number.isFinite(rawYear)
			? rawYear
			: (rawFrom ? rawFrom.getFullYear() : currentAnchor.anchorYear);

	const dateRange = getDateRangeForScope(inferredScope, anchorMonth, anchorYear, {
		from: rawFrom,
		to: rawTo,
	});

	return {
		scope: inferredScope,
		anchorMonth,
		anchorYear,
		dateRange,
		fromIso: formatLocalDate(dateRange.from),
		toIso: formatLocalDate(dateRange.to),
	};
}

export function applyReportScopeStateToSearchParams(
	searchParams: URLSearchParams,
	state: {
		scope: VisibleReportScope;
		anchorMonth: number;
		anchorYear: number;
		dateRange: ResolvedDateRange;
	},
) {
	searchParams.set("scope", state.scope);
	searchParams.set("month", String(state.anchorMonth));
	searchParams.set("year", String(state.anchorYear));
	searchParams.set("from", formatLocalDate(state.dateRange.from));
	searchParams.set("to", formatLocalDate(state.dateRange.to));
}

export function buildYearOptions(now = new Date(), count = 6) {
	return Array.from({ length: count }, (_, index) => String(now.getFullYear() - index));
}
