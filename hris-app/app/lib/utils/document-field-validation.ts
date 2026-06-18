export type DocumentFieldValidationRule = {
	preset?: "PH_SSS" | "PH_TIN" | "PH_PAGIBIG" | "PH_PHILHEALTH" | "CUSTOM" | string | null;
	pattern?: string | null;
	message?: string | null;
	normalize?: "digits" | "trim" | "none" | string | null;
	minLength?: number | null;
	maxLength?: number | null;
	allowHyphens?: boolean | null;
};

export type DocumentFieldValidationTarget = {
	key?: string | null;
	label?: string | null;
	required?: boolean | null;
	validation?: DocumentFieldValidationRule | null;
};

export type DocumentTypeValidationSource = {
	code?: string | null;
	name?: string | null;
	fields?: DocumentFieldValidationTarget[] | null;
};

const PH_GOVERNMENT_ID_PRESETS: Record<
	string,
	{ pattern: RegExp; message: string; hint: string; normalize: "digits" }
> = {
	PH_SSS: {
		pattern: /^\d{10}$/,
		message: "SSS number must contain exactly 10 digits. Example: 12-3456789-0.",
		hint: "Example: 12-3456789-0 or 1234567890",
		normalize: "digits",
	},
	PH_TIN: {
		pattern: /^(\d{9}|\d{12})$/,
		message: "TIN must contain 9 or 12 digits. Example: 123-456-789-001.",
		hint: "Example: 123456789 or 123-456-789-001",
		normalize: "digits",
	},
	PH_PAGIBIG: {
		pattern: /^\d{12}$/,
		message: "Pag-IBIG MID number must contain exactly 12 digits. Example: 1234-5678-9012.",
		hint: "Example: 1234-5678-9012 or 123456789012",
		normalize: "digits",
	},
	PH_PHILHEALTH: {
		pattern: /^\d{12}$/,
		message:
			"PhilHealth number must contain exactly 12 digits. Example: 12-345678901-2.",
		hint: "Example: 12-345678901-2 or 123456789012",
		normalize: "digits",
	},
};

export const DOCUMENT_FIELD_VALIDATION_PRESET_OPTIONS = [
	{ value: "", label: "No format rule" },
	{ value: "PH_SSS", label: "SSS Number (10 digits)" },
	{ value: "PH_TIN", label: "TIN (9 or 12 digits)" },
	{ value: "PH_PAGIBIG", label: "Pag-IBIG MID (12 digits)" },
	{ value: "PH_PHILHEALTH", label: "PhilHealth PIN (12 digits)" },
	{ value: "CUSTOM", label: "Custom regex" },
] as const;

const normalizeDocumentTypeToken = (value: unknown) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");

export const inferDocumentFieldValidationRule = (
	documentType: DocumentTypeValidationSource | null | undefined,
	field: DocumentFieldValidationTarget,
): DocumentFieldValidationRule | null => {
	if (String(field.key || "").trim() !== "number") return null;
	if (field.validation?.preset || field.validation?.pattern) return field.validation;

	const code = normalizeDocumentTypeToken(documentType?.code);
	const name = normalizeDocumentTypeToken(documentType?.name);
	const token = `${code} ${name}`;

	if (code === "sss" || token.includes("socialsecuritysystem")) {
		return {
			preset: "PH_SSS",
			normalize: "digits",
			message: PH_GOVERNMENT_ID_PRESETS.PH_SSS.message,
			allowHyphens: true,
		};
	}

	if (code === "tin" || token.includes("taxidentificationnumber")) {
		return {
			preset: "PH_TIN",
			normalize: "digits",
			message: PH_GOVERNMENT_ID_PRESETS.PH_TIN.message,
			allowHyphens: true,
		};
	}

	if (code === "pagibig" || token.includes("pagibig")) {
		return {
			preset: "PH_PAGIBIG",
			normalize: "digits",
			message: PH_GOVERNMENT_ID_PRESETS.PH_PAGIBIG.message,
			allowHyphens: true,
		};
	}

	if (code === "philhealth" || token.includes("philhealth")) {
		return {
			preset: "PH_PHILHEALTH",
			normalize: "digits",
			message: PH_GOVERNMENT_ID_PRESETS.PH_PHILHEALTH.message,
			allowHyphens: true,
		};
	}

	return null;
};

export const applyInferredDocumentFieldValidation = <
	TDocumentType extends DocumentTypeValidationSource,
>(
	documentType: TDocumentType,
): TDocumentType => {
	if (!Array.isArray(documentType.fields)) return documentType;

	return {
		...documentType,
		fields: documentType.fields.map((field) => ({
			...field,
			validation: inferDocumentFieldValidationRule(documentType, field) || field.validation || null,
		})),
	};
};

export const normalizeDocumentFieldValueForValidation = (
	value: unknown,
	normalizer?: string | null,
) => {
	const rawValue = String(value ?? "").trim();
	if (normalizer === "digits") {
		return rawValue.replace(/\D/g, "");
	}
	if (normalizer === "none") {
		return String(value ?? "");
	}
	return rawValue;
};

const buildPattern = (pattern?: string | null) => {
	if (!pattern) return null;
	try {
		return new RegExp(pattern);
	} catch (_error) {
		return null;
	}
};

export const validateDocumentFieldValue = (
	field: DocumentFieldValidationTarget,
	value: unknown,
) => {
	const label = String(field.label || "Field").trim();
	const rawValue = String(value ?? "");
	const isEmpty = rawValue.trim() === "";
	const validation = field.validation || null;
	const presetKey = String(validation?.preset || "").trim().toUpperCase();
	const preset = presetKey ? PH_GOVERNMENT_ID_PRESETS[presetKey] : null;
	const normalizer = validation?.normalize || preset?.normalize || "trim";
	const normalizedValue = normalizeDocumentFieldValueForValidation(value, normalizer);

	if (field.required && isEmpty) {
		return `${label} is required.`;
	}

	if (isEmpty) {
		return true;
	}

	const minLength = Number(validation?.minLength || 0);
	if (minLength > 0 && normalizedValue.length < minLength) {
		return `${label} must be at least ${minLength} characters.`;
	}

	const maxLength = Number(validation?.maxLength || 0);
	if (maxLength > 0 && normalizedValue.length > maxLength) {
		return `${label} must be ${maxLength} characters or fewer.`;
	}

	const pattern = preset?.pattern || buildPattern(validation?.pattern);
	if (pattern && !pattern.test(normalizedValue)) {
		return validation?.message || preset?.message || `${label} format is invalid.`;
	}

	return true;
};

export const getDocumentFieldValidationHint = (
	validation?: DocumentFieldValidationRule | null,
) => {
	const presetKey = String(validation?.preset || "").trim().toUpperCase();
	const preset = presetKey ? PH_GOVERNMENT_ID_PRESETS[presetKey] : null;
	if (preset?.hint) return preset.hint;
	if (
		validation?.minLength &&
		validation?.maxLength &&
		validation.minLength === validation.maxLength
	) {
		return `${validation.minLength} characters`;
	}
	if (validation?.pattern) return "Configured format";
	return "";
};
