/**
 * Missing-punch no-pay day helpers for the HR payroll daily-detail modal.
 *
 * The payroll engine marks days unpaid under the company no-pay rule with
 * `missingPunchNoPay: true` on each `dailyBreakdown` item. These helpers
 * derive the HR-visible summary count and the date-key set used for NO PAY
 * chips without duplicating filter logic inside the template.
 */

export type DailyBreakdownNoPayItem = {
	date?: unknown;
	missingPunchNoPay?: unknown;
};

export function countMissingPunchNoPayDays(
	dailyBreakdown: unknown,
): number {
	if (!Array.isArray(dailyBreakdown)) return 0;
	return dailyBreakdown.filter(
		(day) =>
			day &&
			typeof day === "object" &&
			(day as DailyBreakdownNoPayItem).missingPunchNoPay === true,
	).length;
}

export function missingPunchNoPayDateKeys(
	dailyBreakdown: unknown,
): Set<string> {
	if (!Array.isArray(dailyBreakdown)) return new Set();
	return new Set(
		dailyBreakdown
			.filter(
				(day) =>
					day &&
					typeof day === "object" &&
					(day as DailyBreakdownNoPayItem).missingPunchNoPay === true &&
					(day as DailyBreakdownNoPayItem).date,
			)
			.map((day) =>
				new Date(
					(day as DailyBreakdownNoPayItem).date as string | number | Date,
				).toDateString(),
			),
	);
}
