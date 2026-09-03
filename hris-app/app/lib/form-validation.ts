/**
 * Form Field Validation Utilities
 *
 * Provides validation functions for job application form fields
 */

import type {
	FieldConfig,
	ValidationRule,
	FormFieldValue,
} from "~/types/job-application-form.types";

export const validateField = (value: FormFieldValue, config: FieldConfig): string | null => {
	// Check required validation
	if (config.required) {
		if (
			value === undefined ||
			value === null ||
			value === "" ||
			(typeof value === "string" && value.trim() === "")
		) {
			return `${config.label} is required`;
		}
	}

	// Skip other validations if field is empty and not required
	if (!value && !config.required) {
		return null;
	}

	// Email validation
	if (config.type === "email" && typeof value === "string") {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(value)) {
			return "Please enter a valid email address";
		}
	}

	// URL validation
	if (config.type === "url" && typeof value === "string") {
		try {
			new URL(value);
		} catch {
			return "Please enter a valid URL";
		}
	}

	// Phone validation
	if (config.type === "tel" && typeof value === "string") {
		const phoneRegex = /^[\d\s\-+()]+$/;
		if (!phoneRegex.test(value)) {
			return "Please enter a valid phone number";
		}
	}

	// File validation
	if (config.type === "file" && value instanceof File) {
		const fileConfig = config as Extract<FieldConfig, { type: "file" }>;

		// Check file size
		if (fileConfig.maxSize) {
			const maxSizeBytes = fileConfig.maxSize * 1024 * 1024;
			if (value.size > maxSizeBytes) {
				return `File size must be less than ${fileConfig.maxSize}MB`;
			}
		}

		// Check file type
		if (fileConfig.allowedExtensions) {
			const extension = value.name.split(".").pop()?.toLowerCase();
			if (!extension || !fileConfig.allowedExtensions.includes(extension)) {
				return `File must be one of: ${fileConfig.allowedExtensions.join(", ")}`;
			}
		}
	}

	// Text field length validation
	if (config.type === "text" || config.type === "textarea") {
		if (typeof value === "string") {
			if ("minLength" in config && config.minLength && value.length < config.minLength) {
				return `Must be at least ${config.minLength} characters`;
			}
			if ("maxLength" in config && config.maxLength && value.length > config.maxLength) {
				return `Must be no more than ${config.maxLength} characters`;
			}
		}
	}

	// Number validation
	if (config.type === "number" && typeof value === "string") {
		const numConfig = config as Extract<FieldConfig, { type: "number" }>;
		const numValue = parseFloat(value);

		if (isNaN(numValue)) {
			return "Please enter a valid number";
		}

		if (numConfig.min !== undefined && numValue < numConfig.min) {
			return `Must be at least ${numConfig.min}`;
		}

		if (numConfig.max !== undefined && numValue > numConfig.max) {
			return `Must be no more than ${numConfig.max}`;
		}
	}

	// Custom validation rules
	if (config.validation) {
		for (const rule of config.validation) {
			const error = validateRule(value, rule);
			if (error) return error;
		}
	}

	return null;
};

const validateRule = (value: FormFieldValue, rule: ValidationRule): string | null => {
	switch (rule.type) {
		case "required":
			if (!value || (typeof value === "string" && value.trim() === "")) {
				return rule.message;
			}
			break;

		case "minLength":
			if (typeof value === "string" && typeof rule.value === "number") {
				if (value.length < rule.value) {
					return rule.message;
				}
			}
			break;

		case "maxLength":
			if (typeof value === "string" && typeof rule.value === "number") {
				if (value.length > rule.value) {
					return rule.message;
				}
			}
			break;

		case "pattern":
			if (typeof value === "string" && rule.value instanceof RegExp) {
				if (!rule.value.test(value)) {
					return rule.message;
				}
			}
			break;

		case "fileSize":
			if (value instanceof File && typeof rule.value === "number") {
				if (value.size > rule.value) {
					return rule.message;
				}
			}
			break;

		case "fileType":
			if (value instanceof File && typeof rule.value === "string") {
				const allowedTypes = rule.value.split(",").map((t) => t.trim());
				const fileExt = value.name.split(".").pop()?.toLowerCase();
				if (!fileExt || !allowedTypes.includes(fileExt)) {
					return rule.message;
				}
			}
			break;
	}

	return null;
};

export const validateForm = (
	values: Record<string, FormFieldValue>,
	fields: FieldConfig[],
): Record<string, string> => {
	const errors: Record<string, string> = {};

	for (const field of fields) {
		const value = values[field.name];
		const error = validateField(value, field);
		if (error) {
			errors[field.name] = error;
		}
	}

	return errors;
};
