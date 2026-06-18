/**
 * Backend error response structure
 */
export interface BackendErrorResponse {
	status?: string;
	message?: string;
	code?: number;
	errors?: Array<{
		field: string;
		message: string;
	}>;
	timestamp?: string;
}

/**
 * Formatted error for display
 */
export interface FormattedError {
	title: string;
	description?: string;
	fieldErrors?: Array<{
		field: string;
		message: string;
	}>;
	statusCode?: number;
}

const getStatusCode = (error: any, errorData: BackendErrorResponse): number | undefined => {
	const rawStatus = error?.status ?? error?.response?.status ?? errorData?.code;
	const statusCode = Number(rawStatus);
	return Number.isFinite(statusCode) && statusCode >= 0 ? statusCode : undefined;
};

const isRawInternalMessage = (message: string): boolean =>
	/PrismaClient|Invalid\s+`prisma\.|Unique constraint failed|Foreign key constraint failed|Raw query failed|MongoServerError|database error/i.test(
		message,
	);

const getStatusFallbackMessage = (statusCode?: number): string => {
	if (statusCode === 0) return "Network error. Unable to connect to the server.";
	if (statusCode === 400) return "Request failed. Please review the form and try again.";
	if (statusCode === 401) return "Invalid credentials or expired session.";
	if (statusCode === 403) return "You do not have permission to perform this action.";
	if (statusCode === 404) return "The requested record was not found.";
	if (statusCode === 409) return "This action conflicts with an existing record.";
	if (statusCode && statusCode >= 500) {
		return "Server error. Please try again or contact support.";
	}
	return "Request failed. Please try again.";
};

const withStatusPrefix = (message: string, statusCode?: number): string =>
	statusCode !== undefined ? `HTTP ${statusCode}: ${message}` : message;

/**
 * Format backend error response for display
 * Prioritizes detailed field errors over generic message
 *
 * @param error - The error object from API response
 * @returns Formatted error object
 */
export function formatBackendError(error: any): FormattedError {
	// Handle axios error structure
	const errorData: BackendErrorResponse = error?.response?.data || error?.data || error;
	const statusCode = getStatusCode(error, errorData);

	// Check if we have detailed field errors
	if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
		return {
			title: errorData.message || "Validation Failed",
			description: `${errorData.errors.length} validation error${errorData.errors.length > 1 ? "s" : ""} found`,
			fieldErrors: errorData.errors,
			statusCode,
		};
	}

	const rawMessage = String(errorData.message || error.message || "").trim();
	const message =
		rawMessage && !isRawInternalMessage(rawMessage)
			? rawMessage
			: getStatusFallbackMessage(statusCode);

	// Fallback to generic message
	return {
		title: withStatusPrefix(message, statusCode),
		statusCode,
	};
}

/**
 * Get a user-friendly error message from backend error
 * Prioritizes field errors over generic message
 *
 * @param error - The error object from API response
 * @returns User-friendly error message
 */
export function getErrorMessage(error: any): string {
	const formatted = formatBackendError(error);

	if (formatted.fieldErrors && formatted.fieldErrors.length > 0) {
		// Show first few field errors
		const errorList = formatted.fieldErrors
			.slice(0, 3)
			.map((err) => `${err.field}: ${err.message}`)
			.join(", ");

		const remaining = formatted.fieldErrors.length - 3;
		const message = `${errorList}${remaining > 0 ? `, and ${remaining} more error${remaining > 1 ? "s" : ""}` : ""}`;
		return withStatusPrefix(message, formatted.statusCode);
	}

	return formatted.title;
}

/**
 * Create a detailed error message for toast notifications
 * Shows all field errors in a readable format
 *
 * @param error - The error object from API response
 * @returns Object with title and description for toast
 */
export function getToastErrorMessage(error: any): { title: string; description?: string } {
	const formatted = formatBackendError(error);

	if (formatted.fieldErrors && formatted.fieldErrors.length > 0) {
		const visibleErrors = formatted.fieldErrors.slice(0, 4);
		const remaining = formatted.fieldErrors.length - visibleErrors.length;
		const errorMessages = visibleErrors.map((err) => {
			const fieldLabel = err.field.split(".").pop() || err.field;
			return `- ${fieldLabel}: ${err.message}`;
		});

		if (remaining > 0) {
			errorMessages.push(`- ${remaining} more field error${remaining === 1 ? "" : "s"}`);
		}

		return {
			title: formatted.title,
			description: errorMessages.join("\n"),
		};
	}

	return {
		title: formatted.title,
		description: formatted.description,
	};
}
