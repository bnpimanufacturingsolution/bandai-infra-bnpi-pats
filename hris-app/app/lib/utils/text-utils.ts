/**
 * Utility functions for text manipulation and formatting
 */

/**
 * Truncates text to a specified character length and adds ellipsis if needed
 * @param text - The text to truncate
 * @param maxLength - Maximum number of characters to show (default: 30)
 * @param ellipsis - The ellipsis string to append (default: "...")
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(
	text: string | null | undefined,
	maxLength: number = 30,
	ellipsis: string = "...",
): string {
	if (!text) return "";

	if (text.length <= maxLength) {
		return text;
	}

	return text.substring(0, maxLength) + ellipsis;
}

/**
 * Creates a truncated text component with hover tooltip for React components
 * @param text - The text to truncate
 * @param maxLength - Maximum number of characters to show (default: 30)
 * @param className - CSS classes for the span element (default: "text-gray-600 cursor-help")
 * @returns Object with truncated text and properties for React components
 */
export function createTruncatedTextProps(
	text: string | null | undefined,
	maxLength: number = 30,
	className: string = "text-gray-600 cursor-help",
) {
	const truncated = truncateText(text, maxLength);
	const isTruncated = text && text.length > maxLength;

	return {
		displayText: truncated,
		fullText: text || "",
		isTruncated,
		className: isTruncated ? className : "text-gray-600",
		title: isTruncated ? text : undefined, // Only add title if truncated
	};
}

/**
 * Truncates text for export functions (PDF, Excel)
 * @param text - The text to truncate
 * @param maxLength - Maximum number of characters to show (default: 30)
 * @returns Truncated text with ellipsis if needed
 */
export function truncateTextForExport(
	text: string | null | undefined,
	maxLength: number = 30,
): string {
	return truncateText(text, maxLength);
}

/**
 * Date formatting utilities
 */

/**
 * Parses a date string to avoid timezone conversion issues
 * Extracts YYYY-MM-DD from ISO strings to prevent dates from shifting
 */
function parseDate(date: string | Date, isDateOnly: boolean): Date {
	if (typeof date === "object") return date;
	
	if (isDateOnly && typeof date === "string") {
		// Extract YYYY-MM-DD from ISO string (e.g., "2026-02-15T23:59:59.999Z" -> Feb 15)
		const parts = date.split("T")[0].split("-");
		if (parts.length === 3) {
			return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
		}
	}
	
	return new Date(date);
}

/**
 * Formats a date string or Date object into a human-readable format
 * @param date - Date string, Date object, or null/undefined
 * @param format - Format type: 'short', 'long', 'relative', 'datetime' (default: 'datetime')
 * @returns Formatted date string or fallback text
 */
export function formatDate(
	date: string | Date | null | undefined,
	format: "short" | "long" | "relative" | "datetime" = "datetime",
): string {
	if (!date) return "Not available";

	try {
		const isDateOnly = format === "short" || format === "long";
		const dateObj = parseDate(date, isDateOnly);

		if (isNaN(dateObj.getTime())) {
			return "Invalid date";
		}

		const now = new Date();
		const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

		switch (format) {
			case "short":
				return dateObj.toLocaleDateString();

			case "long":
				return dateObj.toLocaleDateString("en-US", {
					weekday: "long",
					year: "numeric",
					month: "long",
					day: "numeric",
				});

			case "relative":
				return formatRelativeTime(diffInSeconds);

			case "datetime":
			default:
				return dateObj.toLocaleString("en-US", {
					year: "numeric",
					month: "2-digit",
					day: "2-digit",
					hour: "2-digit",
					minute: "2-digit",
					hour12: true,
				});
		}
	} catch (error) {
		console.error("Error formatting date:", error);
		return "Invalid date";
	}
}

/**
 * Formats relative time (e.g., "2 hours ago", "3 days ago")
 * @param diffInSeconds - Difference in seconds from now
 * @returns Relative time string
 */
function formatRelativeTime(diffInSeconds: number): string {
	const absDiff = Math.abs(diffInSeconds);
	const isFuture = diffInSeconds < 0;
	const prefix = isFuture ? "in " : "";
	const suffix = isFuture ? "" : " ago";

	if (absDiff < 60) {
		return `${prefix}${absDiff} seconds${suffix}`;
	} else if (absDiff < 3600) {
		const minutes = Math.floor(absDiff / 60);
		return `${prefix}${minutes} minute${minutes === 1 ? "" : "s"}${suffix}`;
	} else if (absDiff < 86400) {
		const hours = Math.floor(absDiff / 3600);
		return `${prefix}${hours} hour${hours === 1 ? "" : "s"}${suffix}`;
	} else if (absDiff < 2592000) {
		const days = Math.floor(absDiff / 86400);
		return `${prefix}${days} day${days === 1 ? "" : "s"}${suffix}`;
	} else if (absDiff < 31536000) {
		const months = Math.floor(absDiff / 2592000);
		return `${prefix}${months} month${months === 1 ? "" : "s"}${suffix}`;
	} else {
		const years = Math.floor(absDiff / 31536000);
		return `${prefix}${years} year${years === 1 ? "" : "s"}${suffix}`;
	}
}

/**
 * Formats a date for display in tables and forms
 * @param date - Date string, Date object, or null/undefined
 * @returns Formatted date string with time
 */
export function formatDateTime(date: string | Date | null | undefined): string {
	return formatDate(date, "datetime");
}

/**
 * Formats a date for display in cards and summaries (relative time)
 * @param date - Date string, Date object, or null/undefined
 * @returns Relative time string
 */
export function formatRelativeDateTime(date: string | Date | null | undefined): string {
	return formatDate(date, "relative");
}

/**
 * Formats a date for display in export functions (short format)
 * @param date - Date string, Date object, or null/undefined
 * @returns Short date string
 */
export function formatDateForExport(date: string | Date | null | undefined): string {
	return formatDate(date, "short");
}

/**
 * Formats a date for HTML date input fields (YYYY-MM-DD format)
 * Extracts date portion directly from ISO string to avoid timezone conversion issues
 * @param date - Date string, Date object, or null/undefined
 * @returns Date string in YYYY-MM-DD format or empty string
 */
export function formatDateForInput(date: string | Date | null | undefined): string {
	if (!date) return "";
	
	try {
		// If it's already a string, extract YYYY-MM-DD directly from ISO string
		if (typeof date === "string") {
			const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
			if (dateMatch) {
				return dateMatch[0]; // Returns "YYYY-MM-DD"
			}
		}
		
		// For Date objects or strings that don't match ISO format
		// Extract date portion from ISO string if possible, otherwise parse as Date
		let dateObj: Date;
		if (typeof date === "string") {
			// Try to extract YYYY-MM-DD from ISO string to avoid timezone issues
			const parts = date.split("T")[0].split("-");
			if (parts.length === 3) {
				dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
			} else {
				dateObj = new Date(date);
			}
		} else {
			dateObj = date;
		}
		
		if (isNaN(dateObj.getTime())) {
			return "";
		}
		
		const year = dateObj.getFullYear();
		const month = String(dateObj.getMonth() + 1).padStart(2, "0");
		const day = String(dateObj.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	} catch (error) {
		console.error("Error formatting date for input:", error);
		return "";
	}
}
