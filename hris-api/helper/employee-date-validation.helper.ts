type DateValidationError = {
	field: string;
	message: string;
};

type StrictDateValidationOptions = {
	minYear: number;
	maxYear: number;
	disallowFuture?: boolean;
};

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_4_DIGIT_YEAR_REGEX =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/;

const isEmptyDateValue = (value: unknown) => {
	if (value === null || value === undefined) return true;
	if (typeof value === "string") return value.trim() === "";
	return false;
};

const toUtcStartOfDay = (date: Date) =>
	new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));

const parseStrictDateInput = (value: unknown): { date: Date | null; formatError: boolean } => {
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return { date: null, formatError: true };
		return { date: value, formatError: false };
	}

	const raw = String(value || "").trim();
	if (!raw) return { date: null, formatError: true };

	const dateOnlyMatch = raw.match(DATE_ONLY_REGEX);
	if (dateOnlyMatch) {
		const year = Number(dateOnlyMatch[1]);
		const month = Number(dateOnlyMatch[2]);
		const day = Number(dateOnlyMatch[3]);

		const parsed = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
		const isCalendarValid =
			parsed.getUTCFullYear() === year &&
			parsed.getUTCMonth() + 1 === month &&
			parsed.getUTCDate() === day;
		if (!isCalendarValid) {
			return { date: null, formatError: true };
		}

		return { date: parsed, formatError: false };
	}

	const isoMatch = raw.match(ISO_4_DIGIT_YEAR_REGEX);
	if (!isoMatch) {
		return { date: null, formatError: true };
	}

	const isoYear = Number(isoMatch[1]);
	const isoMonth = Number(isoMatch[2]);
	const isoDay = Number(isoMatch[3]);
	const parsed = new Date(raw);
	if (Number.isNaN(parsed.getTime())) {
		return { date: null, formatError: true };
	}

	const calendarCheck = new Date(Date.UTC(isoYear, isoMonth - 1, isoDay, 0, 0, 0, 0));
	const isCalendarValid =
		calendarCheck.getUTCFullYear() === isoYear &&
		calendarCheck.getUTCMonth() + 1 === isoMonth &&
		calendarCheck.getUTCDate() === isoDay;
	if (!isCalendarValid) {
		return { date: null, formatError: true };
	}

	return { date: parsed, formatError: false };
};

const validateDateField = (params: {
	value: unknown;
	field: string;
	label: string;
	options: StrictDateValidationOptions;
}): DateValidationError | null => {
	const { value, field, label, options } = params;
	if (isEmptyDateValue(value)) return null;

	const parsed = parseStrictDateInput(value);
	if (parsed.formatError || !parsed.date) {
		return {
			field,
			message: `${label} must use YYYY-MM-DD or ISO date format with a 4-digit year.`,
		};
	}

	const utcDay = toUtcStartOfDay(parsed.date);
	const year = utcDay.getUTCFullYear();
	if (year < options.minYear || year > options.maxYear) {
		return {
			field,
			message: `${label} year must be between ${options.minYear} and ${options.maxYear}.`,
		};
	}

	if (options.disallowFuture) {
		const today = toUtcStartOfDay(new Date());
		if (utcDay.getTime() > today.getTime()) {
			return {
				field,
				message: `${label} cannot be in the future.`,
			};
		}
	}

	return null;
};

const buildDocumentDateErrors = (
	documents: unknown,
	basePath: string,
): DateValidationError[] => {
	if (!Array.isArray(documents)) return [];

	const errors: DateValidationError[] = [];
	documents.forEach((document, index) => {
		const issueError = validateDateField({
			value: (document as any)?.issueDate,
			field: `${basePath}.${index}.issueDate`,
			label: "Issue date",
			options: {
				minYear: 1900,
				maxYear: 9999,
			},
		});
		if (issueError) errors.push(issueError);

		const expiryError = validateDateField({
			value: (document as any)?.expiryDate,
			field: `${basePath}.${index}.expiryDate`,
			label: "Expiry date",
			options: {
				minYear: 1900,
				maxYear: 9999,
			},
		});
		if (expiryError) errors.push(expiryError);
	});

	return errors;
};

export const validateEmployeeMutationDatePayload = (params: {
	payload: any;
	requireDateOfBirth?: boolean;
}): DateValidationError[] => {
	const { payload, requireDateOfBirth = false } = params;
	const personPayload = payload?.person || payload;
	const employeePayload = payload?.employee || payload;
	const errors: DateValidationError[] = [];

	const dateOfBirth = personPayload?.personalInfo?.dateOfBirth;
	if (requireDateOfBirth && isEmptyDateValue(dateOfBirth)) {
		errors.push({
			field: "person.personalInfo.dateOfBirth",
			message: "Date of birth is required.",
		});
	} else {
		const dateOfBirthError = validateDateField({
			value: dateOfBirth,
			field: "person.personalInfo.dateOfBirth",
			label: "Date of birth",
			options: {
				minYear: 1900,
				maxYear: new Date().getUTCFullYear(),
				disallowFuture: true,
			},
		});
		if (dateOfBirthError) errors.push(dateOfBirthError);
	}

	const identificationExpiryError = validateDateField({
		value: personPayload?.identification?.expiryDate,
		field: "person.identification.expiryDate",
		label: "Identification expiry date",
		options: {
			minYear: 1900,
			maxYear: 9999,
		},
	});
	if (identificationExpiryError) errors.push(identificationExpiryError);

	errors.push(...buildDocumentDateErrors(employeePayload?.documents, "employee.documents"));

	if (payload !== employeePayload) {
		errors.push(...buildDocumentDateErrors(payload?.documents, "documents"));
	}

	return errors;
};

export const getUtcDayRange = (value: Date | string | null | undefined) => {
	if (!value) return null;
	const parsed = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;
	const start = toUtcStartOfDay(parsed);
	const end = new Date(start);
	end.setUTCHours(23, 59, 59, 999);
	return { start, end };
};
