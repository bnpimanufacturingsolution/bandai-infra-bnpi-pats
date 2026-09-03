/**
 * Deep Linking Utilities for Leave Request Forms and Calendar Navigation
 * Handles parameter extraction, validation, and URL construction for seamless navigation
 */

/**
 * Deep linking parameters for leave forms
 */
export interface LeaveDeepLinkParams {
	leaveType?: string;
	startDate?: string;
	endDate?: string;
	from?: string;
	modalAction?: string;
	action?: string;
}

/**
 * Validates if a date string is in the correct format (YYYY-MM-DD)
 * @param dateString - Date string to validate
 * @returns true if valid date format, false otherwise
 */
export const isValidDateFormat = (dateString?: string): boolean => {
	if (!dateString) return false;
	const regex = /^\d{4}-\d{2}-\d{2}$/;
	if (!regex.test(dateString)) return false;

	const date = new Date(dateString);
	return date instanceof Date && !isNaN(date.getTime());
};

/**
 * Extracts and validates deep link parameters from URL search params
 * @param searchParams - URLSearchParams object from router
 * @returns Validated LeaveDeepLinkParams object
 */
export const extractDeepLinkParams = (searchParams: URLSearchParams): LeaveDeepLinkParams => {
	const leaveType = searchParams.get("leaveType") || undefined;
	const startDate = searchParams.get("startDate") || undefined;
	const endDate = searchParams.get("endDate") || undefined;
	const from = searchParams.get("from") || undefined;
	const modalAction = searchParams.get("modalAction") || undefined;
	const action = searchParams.get("action") || undefined;

	// Validate dates
	const validStartDate = startDate && isValidDateFormat(startDate) ? startDate : undefined;
	const validEndDate = endDate && isValidDateFormat(endDate) ? endDate : undefined;

	return {
		leaveType,
		startDate: validStartDate,
		endDate: validEndDate,
		from,
		modalAction,
		action,
	};
};

/**
 * Builds a deep link URL for the leave form with pre-filled parameters
 * @param basePath - Base path for the leave form (e.g., /employee/requests/leave)
 * @param params - LeaveDeepLinkParams to include in the URL
 * @returns Complete URL with encoded query parameters
 */
export const buildLeaveFormDeepLink = (basePath: string, params: LeaveDeepLinkParams): string => {
	const urlParams = new URLSearchParams();

	if (params.action || params.modalAction) {
		urlParams.set("action", params.action || params.modalAction || "create");
	}
	if (params.leaveType) {
		urlParams.set("leaveType", params.leaveType);
	}
	if (params.startDate && isValidDateFormat(params.startDate)) {
		urlParams.set("startDate", params.startDate);
	}
	if (params.endDate && isValidDateFormat(params.endDate)) {
		urlParams.set("endDate", params.endDate);
	}
	if (params.from) {
		urlParams.set("from", params.from);
	}

	return `${basePath}?${urlParams.toString()}`;
};

/**
 * Builds a calendar view URL with leave preview parameters
 * @param leaveType - Type of leave
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @param from - Where the user is coming from (for back navigation)
 * @param modalAction - Action to perform when navigating back from calendar
 * @returns Complete calendar URL with encoded parameters
 */
export const buildCalendarViewDeepLink = (
	leaveType: string,
	startDate: string,
	endDate: string,
	from: string = "employee-requests-leave",
	modalAction: string = "create",
): string => {
	const params = new URLSearchParams();
	params.set("type", "leave");
	params.set("leaveType", leaveType);
	params.set("startDate", startDate);
	params.set("endDate", endDate);
	params.set("from", from);
	params.set("modalAction", modalAction);

	return `/calendar?${params.toString()}`;
};

/**
 * Extracts path from encoded 'from' parameter and converts it back to a route
 * The 'from' parameter uses hyphens instead of slashes
 * @param fromParam - Encoded from parameter (e.g., employee-requests-leave)
 * @returns Decoded path (e.g., /employee/requests/leave)
 */
export const decodeFromParam = (fromParam?: string): string => {
	if (!fromParam) return "/";
	return `/${fromParam.replace(/-/g, "/")}`;
};

/**
 * Encodes a path to use as the 'from' parameter
 * Converts slashes to hyphens
 * @param path - Path to encode (e.g., /employee/requests/leave)
 * @returns Encoded path (e.g., employee-requests-leave)
 */
export const encodeFromParam = (path: string): string => {
	return path.replace(/\//g, "-").replace(/^-+/, "");
};

/**
 * Formats a date string to YYYY-MM-DD format
 * Handles both string and Date inputs
 * @param date - Date as string or Date object
 * @returns Formatted date string in YYYY-MM-DD format or empty string if invalid
 */
export const formatDateForDeepLink = (date?: string | Date): string => {
	if (!date) return "";

	try {
		const dateObj = typeof date === "string" ? new Date(date) : date;
		if (isNaN(dateObj.getTime())) return "";
		return dateObj.toISOString().split("T")[0];
	} catch {
		return "";
	}
};

/**
 * Validates date range (startDate should be before or equal to endDate)
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns true if valid range, false otherwise
 */
export const isValidDateRange = (startDate?: string, endDate?: string): boolean => {
	if (!startDate || !endDate) return false;
	if (!isValidDateFormat(startDate) || !isValidDateFormat(endDate)) return false;

	const start = new Date(startDate);
	const end = new Date(endDate);
	return start <= end;
};

/**
 * Builds a complete navigation URL for returning from calendar to leave form with pre-filled data
 * @param originalFromPath - Where the user came from
 * @param leaveType - Selected leave type
 * @param startDate - Selected start date
 * @param endDate - Selected end date
 * @returns URL with all deep link parameters encoded
 */
export const buildReturnToFormUrl = (
	originalFromPath: string,
	leaveType?: string,
	startDate?: string,
	endDate?: string,
): string => {
	const params = new URLSearchParams();
	params.set("action", "create");

	// Only add parameters if they have values
	if (leaveType && leaveType.trim()) {
		params.set("leaveType", leaveType);
	}
	if (startDate && isValidDateFormat(startDate)) {
		params.set("startDate", startDate);
	}
	if (endDate && isValidDateFormat(endDate)) {
		params.set("endDate", endDate);
	}

	return `${decodeFromParam(originalFromPath)}?${params.toString()}`;
};
