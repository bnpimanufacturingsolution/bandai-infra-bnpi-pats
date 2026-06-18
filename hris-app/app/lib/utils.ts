import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Format time duration from "H:MM" format to "Xh Ym" format
 * @param timeStr - Time string in "H:MM" or "HH:MM" format (e.g., "7:58", "0:30")
 * @returns Formatted string like "7h 58m" or "0h 30m"
 */
export function formatDuration(timeStr?: string): string {
	if (!timeStr || timeStr === "0:00") return "0h 0m";

	const [hours, minutes] = timeStr.split(":").map(Number);
	return `${hours}h ${minutes}m`;
}

/**
 * Format whole minutes into the shared "Xh Ym" duration label.
 * @param value - Total minutes
 * @param options - Formatting options
 * @returns Formatted string like "1h 0m"
 */
export function formatMinutesDuration(
	value?: number | null,
	options?: { compact?: boolean },
): string {
	const totalMinutes = Math.max(0, Number(value) || 0);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (options?.compact && hours === 0) {
		return `${minutes}m`;
	}
	return `${hours}h ${minutes}m`;
}

export function formatDurationCompact(timeStr?: string | null): string {
	if (!timeStr) return "0m";
	const [hours, minutes] = timeStr.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return timeStr;
	return formatMinutesDuration(hours * 60 + minutes, { compact: true });
}

/**
 * Format time to 24-hour military time format
 * @param timeStr - ISO date string or time string
 * @returns Time in "HH:MM" 24-hour format (e.g., "09:00", "14:30")
 */
export function formatMilitaryTime(timeStr: string | null): string {
	if (!timeStr) return "";
	try {
		const date = new Date(timeStr);
		const hours = date.getHours().toString().padStart(2, "0");
		const minutes = date.getMinutes().toString().padStart(2, "0");
		return `${hours}:${minutes}`;
	} catch {
		return "";
	}
}

/**
 * Format time to 12-hour format with AM/PM
 * @param timeStr - ISO date string or time string
 * @returns Time in "hh:mm AM/PM" format (e.g., "09:00 AM", "02:30 PM")
 */
export function format12HourTime(timeStr: string | null): string {
	if (!timeStr) return "";
	try {
		const date = new Date(timeStr);
		let hours = date.getHours();
		const minutes = date.getMinutes().toString().padStart(2, "0");
		const ampm = hours >= 12 ? "PM" : "AM";
		hours = hours % 12;
		hours = hours ? hours : 12; // the hour '0' should be '12'
		const hoursStr = hours.toString().padStart(2, "0");
		return `${hoursStr}:${minutes} ${ampm}`;
	} catch {
		return "";
	}
}
