import { Response } from "express";

export interface ErrorDetail {
	field?: string;
	message: string;
}

export interface ErrorResponse {
	status: "error";
	message: string;
	code: number;
	errors?: ErrorDetail[];
	timestamp: string;
}

export function buildErrorResponse(
	message: string,
	code: number = 500,
	errors?: ErrorDetail[],
): ErrorResponse {
	return {
		status: "error",
		message,
		code,
		errors,
		timestamp: new Date().toISOString(),
	};
}

export function formatZodErrors(zodError: any): ErrorDetail[] {
	if (!zodError) return [];

	const errors: ErrorDetail[] = [];

	// Recursive function to traverse the error object
	function traverseErrors(errorObj: any, path: string[] = []) {
		if (!errorObj || typeof errorObj !== "object") return;

		// Handle _errors at current level
		if (errorObj._errors && Array.isArray(errorObj._errors) && errorObj._errors.length > 0) {
			errors.push({
				field: path.length > 0 ? path.join(".") : "root",
				message: errorObj._errors[0],
			});
		}

		// Recursively traverse nested fields
		Object.entries(errorObj).forEach(([key, value]: [string, any]) => {
			if (key === "_errors") return; // Skip _errors key as we already handled it

			if (value && typeof value === "object") {
				// For array indices, format them properly
				const newPath = [...path];
				if (!isNaN(Number(key))) {
					// It's an array index
					newPath[newPath.length - 1] = `${newPath[newPath.length - 1]}[${key}]`;
				} else {
					newPath.push(key);
				}
				traverseErrors(value, newPath);
			}
		});
	}

	traverseErrors(zodError, []);
	return errors;
}

export function limitErrorDetails(
	errors: ErrorDetail[] | undefined,
	maxErrors: number = 8,
): ErrorDetail[] | undefined {
	if (!Array.isArray(errors) || errors.length === 0) {
		return errors;
	}

	if (errors.length <= maxErrors) {
		return errors;
	}

	const limited = errors.slice(0, maxErrors);
	const remaining = errors.length - maxErrors;

	limited.push({
		field: "system",
		message: `${remaining} more validation error${remaining === 1 ? "" : "s"} omitted.`,
	});

	return limited;
}
