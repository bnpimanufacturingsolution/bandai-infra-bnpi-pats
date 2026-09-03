import { getLogger } from "./logger.helper";

const logger = getLogger();
const scheduleLogger = logger.child({ module: "scheduleHelper" });

/**
 * Schedule Helper
 *
 * This file contains minimal schedule-related helper functions.
 * Most schedule logic has been moved inline to employee.helper.ts
 * to reduce complexity and eliminate unnecessary database calls.
 *
 * Removed functions (refactored to employee.helper.ts):
 * - getEmployeeScheduleForDate (made inline in employee controller)
 * - getEmployeeScheduleObjectForDate (made inline in employee controller)
 * - isNightShift (no longer needed after removing night shift endpoint)
 * - isScheduleNightShift (no longer needed after removing night shift endpoint)
 * - getEmployeeScheduleInfoForDate (no longer needed after removing night shift endpoint)
 * - isEmployeeOnNightShiftToday (no longer needed after removing night shift endpoint)
 *
 * Kept functions (still used by attendance.controller and metrics.controller):
 * - findShiftForDay
 * - validateAttendanceTime
 */

/**
 * Find shift for a specific day of week in a schedule
 * Handles both full day names (e.g., "Friday") and abbreviations (e.g., "Fri")
 *
 * @param schedule - Schedule object with shifts array
 * @param dayOfWeek - Day number (0=Sunday, 1=Monday, etc.) or day label
 * @returns Shift object or null if not found
 */
export function findShiftForDay(schedule: any, dayOfWeek: number | string): any | null {
	const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
	const dayAbbreviations = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

	// New resolved snapshot shape: direct shift fields.
	// Some payloads still carry `shifts: []`; treat that as direct snapshot too.
	if (
		schedule &&
		(!Array.isArray(schedule?.shifts) || schedule.shifts.length === 0) &&
		(Array.isArray(schedule?.timeSlots) || schedule?.startTime || schedule?.endTime)
	) {
		return {
			label: typeof dayOfWeek === "string" ? dayOfWeek : dayNames[dayOfWeek] || "Day",
			isRestDay: Boolean(schedule?.isOff),
			timeSlots: Array.isArray(schedule?.timeSlots)
				? schedule.timeSlots
				: schedule?.startTime && schedule?.endTime
					? [
							{
								type: "work",
								label: "Work",
								startTime: schedule.startTime,
								endTime: schedule.endTime,
							},
						]
					: [],
		};
	}

	if (!schedule || !schedule.shifts || !Array.isArray(schedule.shifts)) {
		return null;
	}

	let targetDayName: string;
	let targetDayAbbr: string;

	if (typeof dayOfWeek === "number") {
		targetDayName = dayNames[dayOfWeek];
		targetDayAbbr = dayAbbreviations[dayOfWeek];
	} else {
		targetDayName = dayOfWeek;
		// Try to find abbreviation from full name
		const dayIndex = dayNames.findIndex((d) => d.toLowerCase() === dayOfWeek.toLowerCase());
		targetDayAbbr = dayIndex >= 0 ? dayAbbreviations[dayIndex] : "";
	}

	// Try to find shift by matching label (handles both full names and abbreviations)
	const shift = schedule.shifts.find((shift: any) => {
		const label = shift.label.toLowerCase();
		return (
			label.includes(targetDayName.toLowerCase()) ||
			label.includes(targetDayAbbr.toLowerCase()) ||
			targetDayName.toLowerCase().includes(label) ||
			targetDayAbbr.toLowerCase().includes(label)
		);
	});

	return shift || null;
}

/**
 * Check if a time string represents a night shift (spans midnight or starts after 6pm)
 * A night shift is defined as:
 * - Start time >= 18:00 (6pm) OR
 * - End time < start time (spans midnight, e.g., 18:00 to 06:00)
 *
 * @param startTime - Start time in HH:mm format
 * @param endTime - End time in HH:mm format
 * @returns true if this is a night shift
 */
function isNightShift(startTime: string, endTime: string): boolean {
	try {
		const [startHour, startMin] = startTime.split(":").map(Number);
		const [endHour, endMin] = endTime.split(":").map(Number);

		const startMinutes = startHour * 60 + startMin;
		const endMinutes = endHour * 60 + endMin;

		// Night shift if:
		// 1. Starts at or after 6pm (18:00 = 1080 minutes)
		// 2. Spans midnight (end time is less than start time, e.g., 18:00 to 06:00)
		return startMinutes >= 1080 || endMinutes < startMinutes;
	} catch (error) {
		scheduleLogger.warn(`Error parsing times ${startTime}-${endTime}:`, error);
		return false;
	}
}

/**
 * Validate attendance time against schedule and calculate deviations
 *
 * @param timeIn - Clock in time
 * @param scheduleInfo - Schedule information with timeSlots array
 * @returns Object with validation results
 */
export function validateAttendanceTime(
	timeIn: Date,
	scheduleInfo: {
		schedule: any;
		dayOfWeek: number;
		dayLabel: string;
		timeSlots: any[];
	} | null,
): {
	isValid: boolean;
	isEarly: boolean;
	isLate: boolean;
	minutesEarly?: number;
	minutesLate?: number;
	expectedStartTime?: string;
	actualStartTime: string;
	warning?: string;
} {
	if (!scheduleInfo || !scheduleInfo.timeSlots || scheduleInfo.timeSlots.length === 0) {
		return {
			isValid: true, // No schedule to validate against
			isEarly: false,
			isLate: false,
			actualStartTime: timeIn.toTimeString().slice(0, 5), // HH:mm format
		};
	}

	// Get the first work time slot (usually there's only one)
	const workSlot = scheduleInfo.timeSlots.find((slot: any) => slot.type === "work");
	if (!workSlot || !workSlot.startTime) {
		return {
			isValid: true,
			isEarly: false,
			isLate: false,
			actualStartTime: timeIn.toTimeString().slice(0, 5),
		};
	}

	const expectedStartTime = workSlot.startTime; // e.g., "18:00"
	const [expectedHour, expectedMin] = expectedStartTime.split(":").map(Number);

	const actualHour = timeIn.getHours();
	const actualMin = timeIn.getMinutes();

	// Convert to minutes for comparison
	const expectedMinutes = expectedHour * 60 + expectedMin;
	const actualMinutes = actualHour * 60 + actualMin;

	// Calculate difference
	// For night shifts (18:00-06:00), we need special handling
	const isNightShiftSchedule = isNightShift(workSlot.startTime, workSlot.endTime);
	let minutesDiff = actualMinutes - expectedMinutes;

	// Handle night shift edge cases
	if (isNightShiftSchedule) {
		// Night shift spans midnight (e.g., 18:00 to 06:00)
		// If clocking in before the expected start time (6pm), it's early
		if (actualHour < expectedHour && expectedHour >= 18) {
			// Clocking in before 6pm for a 6pm shift = early
			// Examples:
			// - 7am clock-in for 6pm shift = 11 hours early (660 minutes)
			// - 3pm clock-in for 6pm shift = 3 hours early (180 minutes)
			const hoursEarly = expectedHour - actualHour;
			minutesDiff = -(hoursEarly * 60 - actualMin + expectedMin);
		}
		// If clocking in after midnight but before 6am, and schedule starts at 6pm
		// This is very early (12+ hours early)
		else if (actualHour >= 0 && actualHour < 6 && expectedHour >= 18) {
			const hoursEarly = 24 - actualHour + expectedHour;
			minutesDiff = -(hoursEarly * 60 - actualMin + expectedMin);
		}
	}

	const isEarly = minutesDiff < -15; // Allow 15 minutes grace period
	const isLate = minutesDiff > 15; // Allow 15 minutes grace period
	const isValid = !isEarly && !isLate; // Within grace period

	let warning: string | undefined;
	if (isEarly) {
		const minutesEarly = Math.abs(minutesDiff);
		warning = `Clock in is ${minutesEarly} minutes early. Expected: ${expectedStartTime}`;
	} else if (isLate) {
		const minutesLate = minutesDiff;
		warning = `Clock in is ${minutesLate} minutes late. Expected: ${expectedStartTime}`;
	}

	return {
		isValid,
		isEarly,
		isLate,
		minutesEarly: isEarly ? Math.abs(minutesDiff) : undefined,
		minutesLate: isLate ? minutesDiff : undefined,
		expectedStartTime,
		actualStartTime: `${actualHour.toString().padStart(2, "0")}:${actualMin.toString().padStart(2, "0")}`,
		warning,
	};
}
