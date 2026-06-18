import { PayFrequency, PeriodStatus } from "../../generated/prisma";
import { generatePayrollPeriodCode } from "../../helper/payroll-period-code.helper";

type SemiMonthlyRule = {
	firstStartDay: number;
	secondStartDay: number;
	secondEndDay: number | "LAST_DAY";
};

type WeeklyRule = {
	anchorWeekday: number;
};

type MonthlyRule = {
	startDay: number;
	endDay: number | "LAST_DAY";
};

type QuarterlyRule = {
	startMonth: number;
};

type AnnuallyRule = {
	startMonth: number;
};

export type PayrollCycleRules = Partial<{
	SEMI_MONTHLY: SemiMonthlyRule;
	WEEKLY: WeeklyRule;
	BIWEEKLY: WeeklyRule;
	MONTHLY: MonthlyRule;
	QUARTERLY: QuarterlyRule;
	ANNUALLY: AnnuallyRule;
}>;

export type PayrollCycleConfigLike = {
	defaultPayFrequency: PayFrequency;
	payDateOffsetDays: number;
	businessDayRule: "NONE" | "NEXT_BUSINESS_DAY";
	includeHolidaysInBusinessDayCheck: boolean;
	cycleRules?: unknown | null;
};

export type ComputedPeriod = {
	name: string;
	code: string;
	payFrequency: PayFrequency;
	periodNumber?: number;
	startDate: Date;
	endDate: Date;
	payDate: Date;
	cutoffDay?: number;
	status: PeriodStatus;
	notes?: string;
	generationMetadata?: Record<string, any>;
};

const PERIOD_STATUS_DEFAULT: PeriodStatus = "DRAFT";

const startOfUtcDay = (date: Date) =>
	new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));

const endOfUtcDay = (date: Date) =>
	new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
	);

const addDaysUtc = (date: Date, days: number) => {
	const next = new Date(date.getTime());
	next.setUTCDate(next.getUTCDate() + days);
	return next;
};

const isWeekendUtc = (date: Date) => {
	const day = date.getUTCDay();
	return day === 0 || day === 6;
};

const clampDay = (day: number, year: number, month: number) => {
	const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	return Math.min(Math.max(day, 1), lastDay);
};

const defaultRules: Required<PayrollCycleRules> = {
	SEMI_MONTHLY: {
		firstStartDay: 1,
		secondStartDay: 16,
		secondEndDay: "LAST_DAY",
	},
	WEEKLY: { anchorWeekday: 1 },
	BIWEEKLY: { anchorWeekday: 1 },
	MONTHLY: { startDay: 1, endDay: "LAST_DAY" },
	QUARTERLY: { startMonth: 1 },
	ANNUALLY: { startMonth: 1 },
};

export function getMergedCycleRules(config: PayrollCycleConfigLike): Required<PayrollCycleRules> {
	const raw = (config.cycleRules || {}) as PayrollCycleRules;
	const normalizedFirstStartDay = Math.min(
		Math.max(
			Number(
				raw.SEMI_MONTHLY?.firstStartDay ?? defaultRules.SEMI_MONTHLY.firstStartDay,
			) || defaultRules.SEMI_MONTHLY.firstStartDay,
			1,
		),
		28,
	);
	const normalizedSecondStartDay = Math.min(
		Math.max(
			Number(
				raw.SEMI_MONTHLY?.secondStartDay ?? defaultRules.SEMI_MONTHLY.secondStartDay,
			) || defaultRules.SEMI_MONTHLY.secondStartDay,
			2,
		),
		31,
	);
	const rawSecondEndDay = raw.SEMI_MONTHLY?.secondEndDay ?? defaultRules.SEMI_MONTHLY.secondEndDay;
	const normalizedSecondEndDay: number | "LAST_DAY" =
		rawSecondEndDay === "LAST_DAY"
			? "LAST_DAY"
			: Math.min(Math.max(Number(rawSecondEndDay) || 1, 1), 31);
	const resolvedSemiMonthly: SemiMonthlyRule =
		normalizedSecondStartDay > normalizedFirstStartDay &&
		((normalizedSecondEndDay === "LAST_DAY" && normalizedFirstStartDay === 1) ||
			(typeof normalizedSecondEndDay === "number" &&
				normalizedFirstStartDay === normalizedSecondEndDay + 1))
			? {
					firstStartDay: normalizedFirstStartDay,
					secondStartDay: normalizedSecondStartDay,
					secondEndDay: normalizedSecondEndDay,
				}
			: defaultRules.SEMI_MONTHLY;

	return {
		SEMI_MONTHLY: {
			firstStartDay: resolvedSemiMonthly.firstStartDay,
			secondStartDay: resolvedSemiMonthly.secondStartDay,
			secondEndDay: resolvedSemiMonthly.secondEndDay,
		},
		WEEKLY: {
			anchorWeekday: Math.min(
				Math.max(Number(raw.WEEKLY?.anchorWeekday ?? defaultRules.WEEKLY.anchorWeekday), 0),
				6,
			),
		},
		BIWEEKLY: {
			anchorWeekday: Math.min(
				Math.max(
					Number(raw.BIWEEKLY?.anchorWeekday ?? defaultRules.BIWEEKLY.anchorWeekday),
					0,
				),
				6,
			),
		},
		MONTHLY: {
			startDay: Math.min(
				Math.max(Number(raw.MONTHLY?.startDay ?? defaultRules.MONTHLY.startDay), 1),
				31,
			),
			endDay:
				(raw.MONTHLY?.endDay ?? defaultRules.MONTHLY.endDay) === "LAST_DAY"
					? "LAST_DAY"
					: Math.min(
							Math.max(
								Number((raw.MONTHLY?.endDay ?? defaultRules.MONTHLY.endDay) || 1) ||
									1,
								1,
							),
							31,
						),
		},
		QUARTERLY: {
			startMonth: Math.min(
				Math.max(
					Number(raw.QUARTERLY?.startMonth ?? defaultRules.QUARTERLY.startMonth) || 1,
					1,
				),
				12,
			),
		},
		ANNUALLY: {
			startMonth: Math.min(
				Math.max(Number(raw.ANNUALLY?.startMonth ?? defaultRules.ANNUALLY.startMonth) || 1, 1),
				12,
			),
		},
	};
}

export function computePayDateFromEndDate(
	endDate: Date,
	config: PayrollCycleConfigLike,
	holidayKeys: Set<string>,
): Date {
	let payDate = startOfUtcDay(addDaysUtc(endDate, config.payDateOffsetDays));
	if (config.businessDayRule !== "NEXT_BUSINESS_DAY") return payDate;

	while (true) {
		const key = payDate.toISOString().slice(0, 10);
		const isHoliday = config.includeHolidaysInBusinessDayCheck && holidayKeys.has(key);
		if (!isWeekendUtc(payDate) && !isHoliday) return payDate;
		payDate = addDaysUtc(payDate, 1);
	}
}

function monthLabel(date: Date) {
	return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

const resolveDayInMonth = (
	year: number,
	month: number,
	dayOfMonth: number,
	endOfDayBoundary = false,
) => {
	const clamped = clampDay(dayOfMonth, year, month);
	return new Date(
		Date.UTC(
			year,
			month,
			clamped,
			endOfDayBoundary ? 23 : 0,
			endOfDayBoundary ? 59 : 0,
			endOfDayBoundary ? 59 : 0,
			endOfDayBoundary ? 999 : 0,
		),
	);
};

const resolveSemiMonthlyRangeDates = (
	year: number,
	month: number,
	firstStartDay: number,
	secondStartDay: number,
	secondEndDay: number | "LAST_DAY",
	periodNumber: 1 | 2,
) => {
	const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	const periodOneEndDay = Math.max(firstStartDay, secondStartDay - 1);
	const startDate =
		periodNumber === 1
			? resolveDayInMonth(year, month, firstStartDay, false)
			: resolveDayInMonth(year, month, secondStartDay, false);
	let endDate: Date;
	if (periodNumber === 1) {
		endDate = resolveDayInMonth(year, month, periodOneEndDay, true);
	} else if (secondEndDay === "LAST_DAY") {
		endDate = resolveDayInMonth(year, month, lastDay, true);
	} else {
		const targetMonth = secondEndDay < secondStartDay ? month + 1 : month;
		const targetYear = targetMonth > 11 ? year + 1 : year;
		const normalizedMonth = targetMonth % 12;
		endDate = resolveDayInMonth(targetYear, normalizedMonth, secondEndDay, true);
	}
	return { startDate, endDate };
};

export function buildPeriodsFromRange(params: {
	frequency: PayFrequency;
	rangeStart: Date;
	rangeEnd: Date;
	config: PayrollCycleConfigLike;
	holidayKeys: Set<string>;
	namingMode?: "DEFAULT" | "MONTHLY_LABEL" | "CUSTOM_PREFIX";
	customNamePrefix?: string;
}): ComputedPeriod[] {
	const {
		frequency,
		config,
		holidayKeys,
		namingMode = "DEFAULT",
		customNamePrefix,
	} = params;
	const rangeStart = startOfUtcDay(params.rangeStart);
	const rangeEnd = endOfUtcDay(params.rangeEnd);
	if (rangeEnd < rangeStart) return [];

	const named = (fallback: string) => {
		if (namingMode === "CUSTOM_PREFIX" && customNamePrefix) return `${customNamePrefix} ${fallback}`;
		return fallback;
	};

	const periods: ComputedPeriod[] = [];
	const pushPeriod = (input: {
		startDate: Date;
		endDate: Date;
		payFrequency: PayFrequency;
		periodNumber?: number;
		cutoffDay?: number;
		notes?: string;
		name: string;
	}) => {
		if (input.endDate < rangeStart || input.startDate > rangeEnd) return;
		const payDate = computePayDateFromEndDate(input.endDate, config, holidayKeys);
		periods.push({
			name: input.name,
			code: generatePayrollPeriodCode(input.startDate, input.endDate),
			startDate: input.startDate,
			endDate: input.endDate,
			payDate,
			payFrequency: input.payFrequency,
			periodNumber: input.periodNumber,
			cutoffDay: input.cutoffDay,
			status: PERIOD_STATUS_DEFAULT,
			notes: input.notes,
			generationMetadata: {
				source: "PAYROLL_CYCLE_CONFIG",
				ruleVersion: 1,
				payDateOffsetDays: config.payDateOffsetDays,
				businessDayRule: config.businessDayRule,
				includeHolidaysInBusinessDayCheck: config.includeHolidaysInBusinessDayCheck,
			},
		});
	};

	if (frequency === "SEMI_MONTHLY") {
		const rules = getMergedCycleRules(config);
		let cursor = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1));
		while (cursor <= rangeEnd) {
			const year = cursor.getUTCFullYear();
			const month = cursor.getUTCMonth();
			const period1 = resolveSemiMonthlyRangeDates(
				year,
				month,
				rules.SEMI_MONTHLY.firstStartDay,
				rules.SEMI_MONTHLY.secondStartDay,
				rules.SEMI_MONTHLY.secondEndDay,
				1,
			);
			const period2 = resolveSemiMonthlyRangeDates(
				year,
				month,
				rules.SEMI_MONTHLY.firstStartDay,
				rules.SEMI_MONTHLY.secondStartDay,
				rules.SEMI_MONTHLY.secondEndDay,
				2,
			);
			const periodOneEndDay = Math.max(
				rules.SEMI_MONTHLY.firstStartDay,
				rules.SEMI_MONTHLY.secondStartDay - 1,
			);
			const periodTwoEndDay =
				rules.SEMI_MONTHLY.secondEndDay === "LAST_DAY"
					? new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
					: rules.SEMI_MONTHLY.secondEndDay;

			pushPeriod({
				startDate: period1.startDate,
				endDate: period1.endDate,
				payFrequency: "SEMI_MONTHLY",
				periodNumber: 1,
				cutoffDay: period1.endDate.getUTCDate(),
				notes: `Payroll period ${monthLabel(period1.startDate)} - Days ${rules.SEMI_MONTHLY.firstStartDay}-${periodOneEndDay}`,
				name: named(`Period 1 - ${monthLabel(period1.startDate)}`),
			});

			pushPeriod({
				startDate: period2.startDate,
				endDate: period2.endDate,
				payFrequency: "SEMI_MONTHLY",
				periodNumber: 2,
				cutoffDay: period2.endDate.getUTCDate(),
				notes: `Payroll period ${monthLabel(period2.startDate)} - Days ${rules.SEMI_MONTHLY.secondStartDay}-${periodTwoEndDay}${rules.SEMI_MONTHLY.secondEndDay !== "LAST_DAY" && rules.SEMI_MONTHLY.secondEndDay < rules.SEMI_MONTHLY.secondStartDay ? " (next month)" : ""}`,
				name: named(`Period 2 - ${monthLabel(period2.startDate)}`),
			});

			cursor = new Date(Date.UTC(year, month + 1, 1));
		}
		return dedupeByCode(periods).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
	}

	if (frequency === "WEEKLY" || frequency === "BIWEEKLY") {
		const rules = getMergedCycleRules(config);
		const weeklyRule = frequency === "WEEKLY" ? rules.WEEKLY : rules.BIWEEKLY;
		const stepDays = frequency === "WEEKLY" ? 7 : 14;
		const anchor = weeklyRule.anchorWeekday;
		let cursor = startOfUtcDay(rangeStart);
		const shiftBack = (cursor.getUTCDay() - anchor + 7) % 7;
		cursor = addDaysUtc(cursor, -shiftBack);
		while (cursor <= rangeEnd) {
			const startDate = startOfUtcDay(cursor);
			const endDate = endOfUtcDay(addDaysUtc(startDate, stepDays - 1));
			pushPeriod({
				startDate,
				endDate,
				payFrequency: frequency,
				name: named(`${frequency === "WEEKLY" ? "Weekly" : "Biweekly"} ${startDate.toISOString().slice(0, 10)}`),
				notes: `${frequency === "WEEKLY" ? "Weekly" : "Biweekly"} payroll period`,
			});
			cursor = addDaysUtc(cursor, stepDays);
		}
		return periods;
	}

	if (frequency === "DAILY") {
		let cursor = startOfUtcDay(rangeStart);
		while (cursor <= rangeEnd) {
			const startDate = startOfUtcDay(cursor);
			const endDate = endOfUtcDay(cursor);
			pushPeriod({
				startDate,
				endDate,
				payFrequency: "DAILY",
				name: named(`Daily ${startDate.toISOString().slice(0, 10)}`),
				notes: "Daily payroll period",
			});
			cursor = addDaysUtc(cursor, 1);
		}
		return periods;
	}

	if (frequency === "MONTHLY") {
		const rules = getMergedCycleRules(config);
		let cursor = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1));
		while (cursor <= rangeEnd) {
			const year = cursor.getUTCFullYear();
			const month = cursor.getUTCMonth();
			const startDay = clampDay(rules.MONTHLY.startDay, year, month);
			const startDate = new Date(Date.UTC(year, month, startDay, 0, 0, 0, 0));
			const endDate =
				rules.MONTHLY.endDay === "LAST_DAY"
					? new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
					: new Date(
							Date.UTC(
								year,
								month,
								clampDay(rules.MONTHLY.endDay, year, month),
								23,
								59,
								59,
								999,
							),
						);
			pushPeriod({
				startDate,
				endDate,
				payFrequency: "MONTHLY",
				name: named(`Monthly - ${monthLabel(startDate)}`),
				notes: "Monthly payroll period",
			});
			cursor = new Date(Date.UTC(year, month + 1, 1));
		}
		return periods;
	}

	if (frequency === "QUARTERLY") {
		const rules = getMergedCycleRules(config);
		const fiscalStartMonthIndex = rules.QUARTERLY.startMonth - 1;
		let cursor = new Date(
			Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1),
		);
		while (cursor <= rangeEnd) {
			const year = cursor.getUTCFullYear();
			const month = cursor.getUTCMonth();
			const delta = (month - fiscalStartMonthIndex + 12) % 12;
			const quarterStartMonth = month - (delta % 3);
			const startDate = new Date(Date.UTC(year, quarterStartMonth, 1, 0, 0, 0, 0));
			const endDate = new Date(Date.UTC(year, quarterStartMonth + 3, 0, 23, 59, 59, 999));
			pushPeriod({
				startDate,
				endDate,
				payFrequency: "QUARTERLY",
				name: named(`Q${Math.floor(quarterStartMonth / 3) + 1} ${year}`),
				notes: "Quarterly payroll period",
			});
			cursor = new Date(Date.UTC(year, quarterStartMonth + 3, 1));
		}
		return dedupeByCode(periods);
	}

	// ANNUALLY
	const rules = getMergedCycleRules(config);
	let yearCursor = rangeStart.getUTCFullYear();
	const firstFiscalMonth = rules.ANNUALLY.startMonth - 1;
	while (yearCursor <= rangeEnd.getUTCFullYear() + 1) {
		const startDate = new Date(Date.UTC(yearCursor, firstFiscalMonth, 1, 0, 0, 0, 0));
		const endDate = new Date(Date.UTC(yearCursor + 1, firstFiscalMonth, 0, 23, 59, 59, 999));
		pushPeriod({
			startDate,
			endDate,
			payFrequency: "ANNUALLY",
			name: named(`Annual ${startDate.getUTCFullYear()}`),
			notes: "Annual payroll period",
		});
		yearCursor += 1;
	}
	return dedupeByCode(periods);
}

function dedupeByCode(periods: ComputedPeriod[]) {
	const map = new Map<string, ComputedPeriod>();
	for (const period of periods) {
		map.set(period.code, period);
	}
	return Array.from(map.values());
}
