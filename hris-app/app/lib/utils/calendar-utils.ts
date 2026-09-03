export const DAYS_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export const MONTHS = [
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
];

export const MONTHS_SHORT = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

/**
 * Get the start of the week (Monday) for a given date
 */
export function getWeekStart(date: Date): Date {
	const d = new Date(date);
	const day = d.getDay();
	const diff = d.getDate() - day + (day === 0 ? -6 : 1);
	d.setDate(diff);
	d.setHours(0, 0, 0, 0);
	return d;
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

/**
 * Add months to a date
 */
export function addMonths(date: Date, months: number): Date {
	const result = new Date(date);
	result.setMonth(result.getMonth() + months);
	return result;
}

/**
 * Get the start of the month for a given date
 */
export function getMonthStart(date: Date): Date {
	const d = new Date(date);
	d.setDate(1);
	d.setHours(0, 0, 0, 0);
	return d;
}

/**
 * Build a Monday-first 6x7 month grid (42 days) for a given month anchor date
 */
export function getMonthGridDays(monthDate: Date): Date[] {
	const monthStart = getMonthStart(monthDate);
	const gridStart = getWeekStart(monthStart);
	const days: Date[] = [];

	for (let i = 0; i < 42; i++) {
		days.push(addDays(gridStart, i));
	}

	return days;
}

/**
 * Format a date as YYYY-MM-DD string
 */
export function formatDateKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
	return (
		date1.getFullYear() === date2.getFullYear() &&
		date1.getMonth() === date2.getMonth() &&
		date1.getDate() === date2.getDate()
	);
}

/**
 * Format date range for display
 */
export function formatDateRange(days: Date[]): { range: string; subtitle: string } {
	const start = days[0];
	const end = days[days.length - 1];
	const startMonth = MONTHS[start.getMonth()];
	const endMonth = MONTHS[end.getMonth()];
	const startYear = start.getFullYear();
	const endYear = end.getFullYear();

	let range: string;
	if (startYear !== endYear) {
		range = `${startMonth} ${startYear} - ${endMonth} ${endYear}`;
	} else if (start.getMonth() !== end.getMonth()) {
		range = `${startMonth} - ${endMonth} ${startYear}`;
	} else {
		range = `${startMonth} ${startYear}`;
	}

	const subtitle = `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} - ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;

	return { range, subtitle };
}

/**
 * Format month header title/subtitle
 */
export function formatMonthRange(monthDate: Date): { range: string; subtitle: string } {
	const month = monthDate.getMonth();
	const year = monthDate.getFullYear();
	const monthStart = new Date(year, month, 1);
	const monthEnd = new Date(year, month + 1, 0);

	return {
		range: `${MONTHS[month]} ${year}`,
		subtitle: `${monthStart.getDate()} ${MONTHS_SHORT[month]} - ${monthEnd.getDate()} ${MONTHS_SHORT[month]}`,
	};
}

/**
 * Check if a date is a weekend
 */
export function isWeekend(date: Date): boolean {
	const day = date.getDay();
	return day === 0 || day === 6;
}

/**
 * Check if a date is the first of the month
 */
export function isFirstOfMonth(date: Date): boolean {
	return date.getDate() === 1;
}
