/**
 * Form State Management Hook
 *
 * Custom hook for managing job application form state
 */

import * as React from "react";
import type {
	FormState,
	FormAction,
	FieldConfig,
	FormFieldValue,
	JobApplicationFormConfig,
} from "~/types/job-application-form.types";
import { validateField, validateForm } from "~/lib/form-validation";

const formReducer = (state: FormState, action: FormAction): FormState => {
	switch (action.type) {
		case "SET_FIELD_VALUE":
			return {
				...state,
				values: {
					...state.values,
					[action.payload.name]: action.payload.value,
				},
			};

		case "SET_FIELD_ERROR":
			return {
				...state,
				errors: {
					...state.errors,
					[action.payload.name]: action.payload.error,
				},
			};

		case "SET_FIELD_TOUCHED":
			return {
				...state,
				touched: {
					...state.touched,
					[action.payload.name]: action.payload.touched,
				},
			};

		case "SET_ERRORS":
			return {
				...state,
				errors: action.payload,
				isValid: Object.keys(action.payload).length === 0,
			};

		case "SET_SUBMITTING":
			return {
				...state,
				isSubmitting: action.payload,
			};

		case "RESET_FORM": {
			const initialValues: Record<string, FormFieldValue> = {};
			return {
				values: initialValues,
				errors: {},
				touched: {},
				isSubmitting: false,
				isValid: false,
			};
		}

		default:
			return state;
	}
};

export interface UseJobApplicationFormOptions {
	config: JobApplicationFormConfig;
	onSubmit: (values: Record<string, FormFieldValue>) => Promise<void> | void;
	initialValues?: Record<string, FormFieldValue>;
}

export function useJobApplicationForm({
	config,
	onSubmit,
	initialValues = {},
}: UseJobApplicationFormOptions) {
	// Validate config
	if (!config) {
		throw new Error("useJobApplicationForm: 'config' is required");
	}

	if (!config.sections || !Array.isArray(config.sections)) {
		throw new Error("useJobApplicationForm: 'config.sections' must be a valid array");
	}

	// Initialize form state
	const [state, dispatch] = React.useReducer(formReducer, {
		values: initialValues,
		errors: {},
		touched: {},
		isSubmitting: false,
		isValid: false,
	});

	// Get all fields from all sections
	const allFields = React.useMemo(() => {
		return config.sections.flatMap((section) => section.fields);
	}, [config.sections]);

	// Handle field value change
	const handleChange = React.useCallback(
		(name: string, value: FormFieldValue) => {
			dispatch({ type: "SET_FIELD_VALUE", payload: { name, value } });

			// Validate on change
			const field = allFields.find((f) => f.name === name);
			if (field) {
				const error = validateField(value, field);
				dispatch({
					type: "SET_FIELD_ERROR",
					payload: { name, error: error || "" },
				});
			}
		},
		[allFields],
	);

	// Handle field blur
	const handleBlur = React.useCallback((name: string) => {
		dispatch({ type: "SET_FIELD_TOUCHED", payload: { name, touched: true } });
	}, []);

	// Validate all fields
	const validateAllFields = React.useCallback(() => {
		const errors = validateForm(state.values, allFields);
		dispatch({ type: "SET_ERRORS", payload: errors });
		return Object.keys(errors).length === 0;
	}, [state.values, allFields]);

	// Handle form submission
	const handleSubmit = React.useCallback(
		async (e?: React.FormEvent) => {
			if (e) {
				e.preventDefault();
			}

			// Mark all fields as touched
			const touchedFields = allFields.reduce(
				(acc, field) => {
					acc[field.name] = true;
					return acc;
				},
				{} as Record<string, boolean>,
			);

			Object.entries(touchedFields).forEach(([name, touched]) => {
				dispatch({ type: "SET_FIELD_TOUCHED", payload: { name, touched } });
			});

			// Validate all fields
			const isValid = validateAllFields();

			if (!isValid) {
				// Scroll to first error
				const firstErrorField = allFields.find((field) => state.errors[field.name]);
				if (firstErrorField) {
					const element = document.getElementById(firstErrorField.name);
					element?.scrollIntoView({ behavior: "smooth", block: "center" });
					element?.focus();
				}
				return;
			}

			// Submit form
			dispatch({ type: "SET_SUBMITTING", payload: true });

			try {
				await onSubmit(state.values);
			} catch (error) {
				console.error("Form submission error:", error);
			} finally {
				dispatch({ type: "SET_SUBMITTING", payload: false });
			}
		},
		[state.values, state.errors, allFields, validateAllFields, onSubmit],
	);

	// Reset form
	const resetForm = React.useCallback(() => {
		dispatch({ type: "RESET_FORM" });
	}, []);

	return {
		values: state.values,
		errors: state.errors,
		touched: state.touched,
		isSubmitting: state.isSubmitting,
		isValid: state.isValid,
		handleChange,
		handleBlur,
		handleSubmit,
		resetForm,
	};
}
