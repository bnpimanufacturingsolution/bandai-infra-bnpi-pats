export type StrictDateValidationOptions = {
	minYear: number;
	maxYear: number;
	allowEmpty?: boolean;
	disallowFuture?: boolean;
};

export type StrictDateValidationResult = {
	isValid: boolean;
	error: string | null;
	isoUtc: string | null;
	dateOnly: string | null;
};

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_4_DIGIT_YEAR_REGEX =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/;

export const MIN_ALLOWED_DATE_INPUT = "1900-01-01";
export const MAX_ALLOWED_DATE_INPUT = "9999-12-31";

const buildUtcDate = (year: number, month: number, day: number) =>
	new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

const getTodayUtcStart = () => {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
};

const parseStrictDateValue = (value: string) => {
	const trimmed = value.trim();
	const dateOnlyMatch = trimmed.match(DATE_ONLY_REGEX);
	if (dateOnlyMatch) {
		const year = Number(dateOnlyMatch[1]);
		const month = Number(dateOnlyMatch[2]);
		const day = Number(dateOnlyMatch[3]);
		const utc = buildUtcDate(year, month, day);
		const isCalendarValid =
			utc.getUTCFullYear() === year &&
			utc.getUTCMonth() + 1 === month &&
			utc.getUTCDate() === day;
		if (!isCalendarValid) return null;
		return {
			year,
			month,
			day,
			dateOnly: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
				day,
			).padStart(2, "0")}`,
			isoUtc: utc.toISOString(),
			utcDate: utc,
		};
	}

	const isoMatch = trimmed.match(ISO_4_DIGIT_YEAR_REGEX);
	if (!isoMatch) return null;

	const year = Number(isoMatch[1]);
	const month = Number(isoMatch[2]);
	const day = Number(isoMatch[3]);
	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) return null;

	const utc = buildUtcDate(year, month, day);
	const isCalendarValid =
		utc.getUTCFullYear() === year &&
		utc.getUTCMonth() + 1 === month &&
		utc.getUTCDate() === day;
	if (!isCalendarValid) return null;

	return {
		year,
		month,
		day,
		dateOnly: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
			day,
		).padStart(2, "0")}`,
		isoUtc: utc.toISOString(),
		utcDate: utc,
	};
};

export const validateStrictDateInput = (
	value: unknown,
	options: StrictDateValidationOptions,
): StrictDateValidationResult => {
	const raw = String(value ?? "").trim();
	if (!raw) {
		return options.allowEmpty
			? { isValid: true, error: null, isoUtc: null, dateOnly: null }
			: { isValid: false, error: "Date is required.", isoUtc: null, dateOnly: null };
	}

	const parsed = parseStrictDateValue(raw);
	if (!parsed) {
		return {
			isValid: false,
			error: "Use YYYY-MM-DD or ISO date format with a 4-digit year.",
			isoUtc: null,
			dateOnly: null,
		};
	}

	if (parsed.year < options.minYear || parsed.year > options.maxYear) {
		return {
			isValid: false,
			error: `Year must be between ${options.minYear} and ${options.maxYear}.`,
			isoUtc: null,
			dateOnly: null,
		};
	}

	if (options.disallowFuture) {
		const today = getTodayUtcStart();
		if (parsed.utcDate.getTime() > today.getTime()) {
			return {
				isValid: false,
				error: "Date cannot be in the future.",
				isoUtc: null,
				dateOnly: null,
			};
		}
	}

	return {
		isValid: true,
		error: null,
		isoUtc: parsed.isoUtc,
		dateOnly: parsed.dateOnly,
	};
};

export const parseDateInputAsUtcDate = (value: string) => {
	const parsed = parseStrictDateValue(value);
	return parsed ? parsed.utcDate : null;
};

export const getTodayDateInput = () => {
	const today = getTodayUtcStart();
	return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(
		today.getUTCDate(),
	).padStart(2, "0")}`;
};
