/**
 * Timekeeping Helper
 * Calculates working hours, overtime, tardiness, and other timekeeping metrics
 */

import { AttendanceStatus } from "../generated/prisma";
import { findShiftForDay } from "./schedule.helper";
import { calculateStrictScheduleMetrics } from "./schedule-work-metrics.helper";
import type { EmployeeScheduleSnapshot as EmployeeSchedule } from "./employee-schedule.helper";
export const ATTENDANCE_BEHAVIOR_FLAGS = [
	"TARDINESS",
	"EARLY_OUT",
	"OVERTIME",
	"OT_CANDIDATE",
] as const;
export type AttendanceBehaviorFlag = (typeof ATTENDANCE_BEHAVIOR_FLAGS)[number];

export interface TimeSlot {
	type: string;
	label?: string;
	startTime: string;
	endTime: string;
}

export interface TimekeepingCalculation {
	totalMinutesWorked: number; // Total minutes (timeOut - timeIn - breaks)
	regularMinutes: number; // Regular minutes within schedule
	overtimeMinutes: number; // Minutes exceeding schedule
	undertimeMinutes: number; // Minutes short of schedule
	lateMinutes: number; // Minutes late for clock-in
	earlyOutMinutes: number; // Minutes early for clock-out
	breakMinutes: number; // Total break time in minutes
}

export interface GracePeriodStatus {
	rawLateMinutes: number;
	gracePeriodMinutes: number;
	withinGrace: boolean;
}

function formatBreakDisplayFromSchedule(schedule: EmployeeSchedule | null, date: Date): string {
	if (!schedule) return "No break";
	const shift = findShiftForDay(schedule as any, date.getUTCDay());
	const breakSlots = shift?.timeSlots?.filter((slot: any) => slot?.type === "break") || [];
	if (!breakSlots.length) return "No break";
	return breakSlots
		.map((slot: any) => `${slot.startTime || ""} - ${slot.endTime || ""}`)
		.join(", ");
}

/**
 * Determine attendance status based on timekeeping calculations
 * LEAVE must be explicitly set by leave workflow and is never auto-derived here.
 *
 * An employee is PRESENT as soon as they clock in (timeIn exists).
 * No need to wait for clock-out. INCOMPLETE only when there is no timeIn.
 */
export function determineAttendanceStatus(
	_calc: TimekeepingCalculation,
	_hasTimeOut: boolean,
	hasTimeIn = true,
): AttendanceStatus {
	if (!hasTimeIn) {
		return "INCOMPLETE";
	}

	return "PRESENT";
}

export function deriveBehaviorFlags(params: {
	timeIn?: Date | null;
	timeOut?: Date | null;
	schedule?: EmployeeSchedule | null;
	date: Date;
	overtimeThresholdMinutes?: number;
}): AttendanceBehaviorFlag[] {
	const { timeIn, timeOut, schedule, date, overtimeThresholdMinutes = 60 } = params;
	const flags: AttendanceBehaviorFlag[] = [];
	if (!timeIn || !schedule) return flags;

	const strict = calculateStrictScheduleMetrics({
		timeIn,
		timeOut,
		schedule,
		dayDate: date,
	});

	if (strict.lateMinutes > 0) flags.push("TARDINESS");
	if (strict.earlyOutMinutes > 0) flags.push("EARLY_OUT");
	if (strict.overtimeMinutes >= overtimeThresholdMinutes) flags.push("OVERTIME");

	return flags;
}

/**
 * Convert time string (HH:mm) to minutes since midnight
 */
export function timeToMinutes(timeStr: string): number {
	if (!timeStr) return 0;
	const [hours, minutes] = timeStr.split(":").map(Number);
	return hours * 60 + minutes;
}

type NormalizedTimeSlot = TimeSlot & {
	absoluteStart: number;
	absoluteEnd: number;
};

function normalizeOrderedTimeSlots(timeSlots: TimeSlot[]): NormalizedTimeSlot[] {
	let previousEndMinutes: number | null = null;

	return timeSlots
		.filter((slot) => slot?.startTime && slot?.endTime)
		.map((slot) => {
			let absoluteStart = timeToMinutes(slot.startTime);
			let absoluteEnd = timeToMinutes(slot.endTime);

			if (absoluteEnd <= absoluteStart) {
				absoluteEnd += 24 * 60;
			}

			if (previousEndMinutes !== null) {
				while (absoluteStart < previousEndMinutes) {
					absoluteStart += 24 * 60;
					absoluteEnd += 24 * 60;
				}
			}

			previousEndMinutes = absoluteEnd;

			return {
				...slot,
				absoluteStart,
				absoluteEnd,
			};
		});
}

function isOvernightWindow(startTime?: string | null, endTime?: string | null): boolean {
	if (!startTime || !endTime) return false;
	return timeToMinutes(endTime) <= timeToMinutes(startTime);
}

function normalizeActualMinutesForSchedule(
	actualMinutes: number,
	scheduledStartMinutes: number,
	isOvernight: boolean,
): number {
	const HALF_DAY_MINUTES = 12 * 60;
	if (
		isOvernight &&
		actualMinutes < scheduledStartMinutes &&
		scheduledStartMinutes - actualMinutes > HALF_DAY_MINUTES
	) {
		return actualMinutes + 24 * 60;
	}
	return actualMinutes;
}

/**
 * Round minutes to whole number
 */
function roundMinutes(minutes: number): number {
	return Math.round(minutes);
}

/**
 * Calculate total break duration from time slots (in minutes)
 */
function calculateBreakDurationFromSlots(timeSlots: TimeSlot[]): number {
	const breakSlots = normalizeOrderedTimeSlots(timeSlots).filter((slot) => slot.type === "break");
	let totalBreakMinutes = 0;

	for (const breakSlot of breakSlots) {
		totalBreakMinutes += breakSlot.absoluteEnd - breakSlot.absoluteStart;
	}

	return roundMinutes(totalBreakMinutes);
}

/**
 * Calculate total scheduled work minutes from time slots (excluding breaks)
 */
function calculateScheduledMinutes(timeSlots: TimeSlot[]): number {
	const workSlots = normalizeOrderedTimeSlots(timeSlots).filter((slot) => slot.type === "work");
	let totalWorkMinutes = 0;

	for (const workSlot of workSlots) {
		totalWorkMinutes += workSlot.absoluteEnd - workSlot.absoluteStart;
	}

	return roundMinutes(totalWorkMinutes);
}

function calculateWorkMinutesBeforeActualStart(
	timeSlots: TimeSlot[],
	actualStartMinutes: number,
): number {
	const workSlots = normalizeOrderedTimeSlots(timeSlots).filter((slot) => slot.type === "work");
	let missedWorkMinutes = 0;

	for (const workSlot of workSlots) {
		const overlapStart = workSlot.absoluteStart;
		const overlapEnd = Math.min(actualStartMinutes, workSlot.absoluteEnd);
		if (overlapEnd > overlapStart) {
			missedWorkMinutes += overlapEnd - overlapStart;
		}
	}

	return roundMinutes(missedWorkMinutes);
}

function calculateWorkMinutesAfterActualEnd(
	timeSlots: TimeSlot[],
	actualEndMinutes: number,
): number {
	const workSlots = normalizeOrderedTimeSlots(timeSlots).filter((slot) => slot.type === "work");
	let missedWorkMinutes = 0;

	for (const workSlot of workSlots) {
		const overlapStart = Math.max(actualEndMinutes, workSlot.absoluteStart);
		const overlapEnd = workSlot.absoluteEnd;
		if (overlapEnd > overlapStart) {
			missedWorkMinutes += overlapEnd - overlapStart;
		}
	}

	return roundMinutes(missedWorkMinutes);
}

/**
 * Get earliest start time from work time slots
 */
function getScheduledStartTime(timeSlots: TimeSlot[]): string | null {
	const workSlots = normalizeOrderedTimeSlots(timeSlots).filter((slot) => slot.type === "work");
	if (workSlots.length === 0) return null;

	const earliestSlot = workSlots.reduce((earliest, current) => {
		return current.absoluteStart < earliest.absoluteStart ? current : earliest;
	});

	return earliestSlot.startTime;
}

/**
 * Get latest end time from work time slots
 */
function getScheduledEndTime(timeSlots: TimeSlot[]): string | null {
	const workSlots = normalizeOrderedTimeSlots(timeSlots).filter((slot) => slot.type === "work");
	if (workSlots.length === 0) return null;

	const latestSlot = workSlots.reduce((latest, current) => {
		return current.absoluteEnd > latest.absoluteEnd ? current : latest;
	});

	return latestSlot.endTime;
}

/**
 * Extract time portion (HH:mm) from DateTime relative to a specific timezone
 * @param dateTime The date object (UTC)
 * @param timeZone The target timezone (e.g. 'Asia/Manila', 'America/New_York')
 */
function extractTime(dateTime: Date, timeZone: string = "Asia/Manila"): string {
	try {
		const formatter = new Intl.DateTimeFormat("en-US", {
			timeZone,
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});

		const parts = formatter.formatToParts(dateTime);
		const hour = parts.find((p) => p.type === "hour")?.value || "00";
		const minute = parts.find((p) => p.type === "minute")?.value || "00";

		return `${hour}:${minute}`;
	} catch (error) {
		// Fallback to UTC if timezone is invalid
		console.error(`Invalid timezone ${timeZone}, falling back to UTC`, error);
		const hours = dateTime.getUTCHours().toString().padStart(2, "0");
		const minutes = dateTime.getUTCMinutes().toString().padStart(2, "0");
		return `${hours}:${minutes}`;
	}
}

/**
 * Calculate difference in minutes between two time strings (HH:mm)
 * Positive if time2 is later than time1
 */
function calculateMinutesDifference(time1: string, time2: string): number {
	const minutes1 = timeToMinutes(time1);
	const minutes2 = timeToMinutes(time2);
	return minutes2 - minutes1;
}

export type ClockInArrival = {
	evaluable: boolean;
	lateMinutes: number;
	lateHours: string;
	rawLateMinutes: number;
	gracePeriodMinutes: number;
	withinGrace: boolean;
	earlyOutMinutes: number;
	earlyOutHours: string;
	undertimeMinutes: number;
	undertimeHours: string;
	hoursWorkedMinutes: number;
	hoursWorked: string;
	behaviorFlags: AttendanceBehaviorFlag[];
};

export function hasEvaluableScheduleWindow(
	schedule: EmployeeSchedule | null | undefined,
	date: Date = new Date(),
): boolean {
	if (!schedule) return false;
	if ((schedule as any)?.isOff || (schedule as any)?.isRestDay) return false;
	const shift = findShiftForDay(schedule as any, date.getUTCDay());
	if (!shift || shift.isRestDay) return false;
	if (Array.isArray(shift.timeSlots) && shift.timeSlots.some((slot: any) => slot?.startTime)) {
		return true;
	}
	return Boolean((schedule as any)?.startTime);
}

function toDateOrNull(value?: Date | string | null): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function buildClockInArrivalFields(params: {
	timeIn?: Date | string | null;
	timeOut?: Date | string | null;
	schedule?: EmployeeSchedule | null;
	date: Date;
	timeZone?: string;
}): ClockInArrival {
	const empty: ClockInArrival = {
		evaluable: false,
		lateMinutes: 0,
		lateHours: "0:00",
		rawLateMinutes: 0,
		gracePeriodMinutes: 0,
		withinGrace: false,
		earlyOutMinutes: 0,
		earlyOutHours: "0:00",
		undertimeMinutes: 0,
		undertimeHours: "0:00",
		hoursWorkedMinutes: 0,
		hoursWorked: "0:00",
		behaviorFlags: [],
	};
	const timeIn = toDateOrNull(params.timeIn);
	if (!timeIn) return empty;
	const timeOut = toDateOrNull(params.timeOut);
	const schedule = params.schedule || null;
	if (!hasEvaluableScheduleWindow(schedule, params.date)) return empty;

	const calc = calculateTimekeeping(
		timeIn,
		timeOut,
		schedule,
		params.date,
		params.timeZone || "Asia/Manila",
	);
	const grace = deriveGracePeriodStatus(
		timeIn,
		schedule,
		params.date,
		params.timeZone || "Asia/Manila",
	);
	const flags: AttendanceBehaviorFlag[] = [];
	if (calc.lateMinutes > 0) flags.push("TARDINESS");
	if (calc.earlyOutMinutes > 0) flags.push("EARLY_OUT");
	return {
		evaluable: true,
		lateMinutes: calc.lateMinutes,
		lateHours: formatMinutesAsTime(calc.lateMinutes),
		rawLateMinutes: grace.rawLateMinutes,
		gracePeriodMinutes: grace.gracePeriodMinutes,
		withinGrace: grace.withinGrace,
		earlyOutMinutes: calc.earlyOutMinutes,
		earlyOutHours: formatMinutesAsTime(calc.earlyOutMinutes),
		undertimeMinutes: calc.undertimeMinutes,
		undertimeHours: formatMinutesAsTime(calc.undertimeMinutes),
		hoursWorkedMinutes: calc.totalMinutesWorked,
		hoursWorked: formatMinutesAsTime(calc.totalMinutesWorked),
		behaviorFlags: flags,
	};
}

export function deriveGracePeriodStatus(
	timeIn: Date | null,
	schedule: EmployeeSchedule | null,
	date: Date,
	timeZone: string = "Asia/Manila",
): GracePeriodStatus {
	if (!timeIn || !schedule) {
		return {
			rawLateMinutes: 0,
			gracePeriodMinutes: 0,
			withinGrace: false,
		};
	}

	const shift = findShiftForDay(schedule as any, date.getUTCDay());
	if (!shift || !Array.isArray(shift.timeSlots)) {
		return {
			rawLateMinutes: 0,
			gracePeriodMinutes: Math.max(
				0,
				Number(
					(schedule as any)?.graceLateMinutes ??
						(schedule as any)?.gracePeriodMinutes ??
						0,
				),
			),
			withinGrace: false,
		};
	}

	const scheduledStartTime = getScheduledStartTime(shift.timeSlots as TimeSlot[]);
	const scheduledEndTime = getScheduledEndTime(shift.timeSlots as TimeSlot[]);
	if (!scheduledStartTime) {
		return {
			rawLateMinutes: 0,
			gracePeriodMinutes: Math.max(
				0,
				Number(
					(schedule as any)?.graceLateMinutes ??
						(schedule as any)?.gracePeriodMinutes ??
						0,
				),
			),
			withinGrace: false,
		};
	}

	const actualStartTime = extractTime(timeIn, timeZone);
	const scheduledStartMinutes = timeToMinutes(scheduledStartTime);
	const actualStartMinutes = normalizeActualMinutesForSchedule(
		timeToMinutes(actualStartTime),
		scheduledStartMinutes,
		isOvernightWindow(scheduledStartTime, scheduledEndTime),
	);
	const rawLateMinutes = Math.max(0, actualStartMinutes - scheduledStartMinutes);
	const gracePeriodMinutes = Math.max(
		0,
		Number((schedule as any)?.graceLateMinutes ?? (schedule as any)?.gracePeriodMinutes ?? 0),
	);

	return {
		rawLateMinutes,
		gracePeriodMinutes,
		withinGrace: rawLateMinutes > 0 && rawLateMinutes <= gracePeriodMinutes,
	};
}

/**
 * Calculate timekeeping metrics for an attendance record
 *
 * @param timeIn - Clock-in timestamp
 * @param timeOut - Clock-out timestamp (optional)
 * @param schedule - Employee's schedule snapshot
 * @param date - Date of attendance
 * @param timeZone - Timezone for calculations (default: Asia/Manila)
 * @returns Timekeeping calculation result
 */
export function calculateTimekeeping(
	timeIn: Date | null,
	timeOut: Date | null,
	schedule: EmployeeSchedule | null,
	date: Date,
	timeZone: string = "Asia/Manila",
): TimekeepingCalculation {
	// Default values
	const result: TimekeepingCalculation = {
		totalMinutesWorked: 0,
		regularMinutes: 0,
		overtimeMinutes: 0,
		undertimeMinutes: 0,
		lateMinutes: 0,
		earlyOutMinutes: 0,
		breakMinutes: 0,
	};

	// If no timeIn, return zeros
	if (!timeIn) {
		return result;
	}

	// If no schedule, we can only calculate total minutes
	if (!schedule) {
		if (timeOut) {
			const totalMinutes = (timeOut.getTime() - timeIn.getTime()) / (1000 * 60);
			result.totalMinutesWorked = roundMinutes(totalMinutes);
			result.regularMinutes = result.totalMinutesWorked;
		}
		return result;
	}

	// Find the shift for this day of week
	const dayOfWeek = date.getUTCDay();
	const shift = findShiftForDay(schedule as any, dayOfWeek);

	// If rest day or no shift, return zeros
	if (!shift || shift.isRestDay || !shift.timeSlots || shift.timeSlots.length === 0) {
		if (timeOut) {
			const totalMinutes = (timeOut.getTime() - timeIn.getTime()) / (1000 * 60);
			result.totalMinutesWorked = roundMinutes(totalMinutes);
			// Working on rest day = all minutes are overtime
			result.overtimeMinutes = result.totalMinutesWorked;
		}
		return result;
	}

	// Calculate break duration
	// If we have a timeOut, calculate actual deductible break based on overlap
	if (timeOut) {
		result.breakMinutes = calculateDeductibleBreakMinutes(
			timeIn,
			timeOut,
			shift.timeSlots as TimeSlot[],
			timeZone,
		);
	} else {
		// Fallback to scheduled break duration
		result.breakMinutes = calculateBreakDurationFromSlots(shift.timeSlots as TimeSlot[]);
	}

	// Get scheduled work minutes
	const scheduledMinutes = calculateScheduledMinutes(shift.timeSlots as TimeSlot[]);

	// Get scheduled start and end times
	const scheduledStartTime = getScheduledStartTime(shift.timeSlots as TimeSlot[]);
	const scheduledEndTime = getScheduledEndTime(shift.timeSlots as TimeSlot[]);
	const overnightSchedule = isOvernightWindow(scheduledStartTime, scheduledEndTime);

	// Calculate tardiness (late minutes)
	if (scheduledStartTime) {
		const actualStartTime = extractTime(timeIn, timeZone);
		const scheduledStartMinutes = timeToMinutes(scheduledStartTime);
		const actualStartMinutes = normalizeActualMinutesForSchedule(
			timeToMinutes(actualStartTime),
			scheduledStartMinutes,
			overnightSchedule,
		);
		const missedScheduledWorkMinutes = calculateWorkMinutesBeforeActualStart(
			shift.timeSlots as TimeSlot[],
			actualStartMinutes,
		);
		const gracePeriodMinutes = Math.max(
			0,
			Number(
				(schedule as any)?.graceLateMinutes ?? (schedule as any)?.gracePeriodMinutes ?? 0,
			),
		);
		result.lateMinutes = Math.max(0, missedScheduledWorkMinutes - gracePeriodMinutes);
	}

	// If no timeOut yet, do not project early out/shortfall.
	if (!timeOut) {
		return result;
	}

	// Calculate early departure
	if (scheduledStartTime && scheduledEndTime) {
		const actualEndTime = extractTime(timeOut, timeZone);
		const scheduledStartMinutes = timeToMinutes(scheduledStartTime);
		const actualEndMinutes = normalizeActualMinutesForSchedule(
			timeToMinutes(actualEndTime),
			scheduledStartMinutes,
			overnightSchedule,
		);
		result.earlyOutMinutes = calculateWorkMinutesAfterActualEnd(
			shift.timeSlots as TimeSlot[],
			actualEndMinutes,
		);
	}

	// Calculate total minutes worked (timeOut - timeIn)
	const totalMinutesRaw = (timeOut.getTime() - timeIn.getTime()) / (1000 * 60);

	// Subtract break duration to get net minutes worked
	result.totalMinutesWorked = Math.max(0, roundMinutes(totalMinutesRaw - result.breakMinutes));

	// Calculate overtime based on actual work beyond scheduled end time
	// Overtime is ONLY time worked AFTER the scheduled end time
	if (scheduledStartTime && scheduledEndTime && timeOut) {
		const actualStartTime = extractTime(timeIn, timeZone);
		const actualEndTime = extractTime(timeOut, timeZone);
		const scheduledStartMinutes = timeToMinutes(scheduledStartTime);
		let scheduledEndMinutes = timeToMinutes(scheduledEndTime);
		if (overnightSchedule && scheduledEndMinutes <= scheduledStartMinutes) {
			scheduledEndMinutes += 24 * 60;
		}
		const actualStartMinutes = normalizeActualMinutesForSchedule(
			timeToMinutes(actualStartTime),
			scheduledStartMinutes,
			overnightSchedule,
		);
		const actualEndMinutes = normalizeActualMinutesForSchedule(
			timeToMinutes(actualEndTime),
			scheduledStartMinutes,
			overnightSchedule,
		);
		const overtimeStartMinutes = Math.max(actualStartMinutes, scheduledEndMinutes);
		result.overtimeMinutes = Math.min(
			result.totalMinutesWorked,
			Math.max(0, actualEndMinutes - overtimeStartMinutes),
		);
	}

	// Calculate regular minutes and undertime
	// Regular minutes is the minimum of what was worked and what was scheduled (minus any OT)
	const workMinutesWithinSchedule = result.totalMinutesWorked - result.overtimeMinutes;
	result.regularMinutes = Math.max(0, workMinutesWithinSchedule);

	// Undertime tracks early out only; tardiness remains a separate metric.
	result.undertimeMinutes = result.earlyOutMinutes;

	return result;
}

/**
 * Calculate total minutes for multiple attendance records
 */
export function calculateTotalMinutes(
	attendances: Array<{
		timeIn: Date | null;
		timeOut: Date | null;
		scheduleSnapshot: EmployeeSchedule | null;
		date: Date;
	}>,
	timeZone: string = "Asia/Manila",
): {
	totalRegularMinutes: number;
	totalOvertimeMinutes: number;
	totalUndertimeMinutes: number;
	totalLateMinutes: number;
	totalEarlyOutMinutes: number;
} {
	let totalRegularMinutes = 0;
	let totalOvertimeMinutes = 0;
	let totalUndertimeMinutes = 0;
	let totalLateMinutes = 0;
	let totalEarlyOutMinutes = 0;

	for (const attendance of attendances) {
		const calc = calculateTimekeeping(
			attendance.timeIn,
			attendance.timeOut,
			attendance.scheduleSnapshot,
			attendance.date,
			timeZone,
		);

		totalRegularMinutes += calc.regularMinutes;
		totalOvertimeMinutes += calc.overtimeMinutes;
		totalUndertimeMinutes += calc.undertimeMinutes;
		totalLateMinutes += calc.lateMinutes;
		totalEarlyOutMinutes += calc.earlyOutMinutes;
	}

	return {
		totalRegularMinutes,
		totalOvertimeMinutes,
		totalUndertimeMinutes,
		totalLateMinutes,
		totalEarlyOutMinutes,
	};
}

/**
 * Convert minutes to hours for display
 */
export function minutesToHours(minutes: number): number {
	return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Format minutes as "HH:MM" string
 * Example: 554 minutes = "9:14"
 */
export function formatMinutesAsTime(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return `${hours}:${mins.toString().padStart(2, "0")}`;
}

/**
 * Generate timesheet summary with formatted hours and metadata
 * Returns both formatted time strings for display and metadata with minute values
 * IMPORTANT: Recalculates metrics on the fly to ensure accuracy
 */
export function generateTimesheetSummary(
	attendances: Array<{
		date?: Date | null;
		timeIn?: Date | null;
		timeOut?: Date | null;
		scheduleSnapshot?: EmployeeSchedule | null;
	}>,
	timeZone: string = "Asia/Manila",
) {
	// Sum up all minute values (recalculate to ensure accuracy)
	let totalMinutesWorked = 0;
	let totalRegularMinutes = 0;
	let totalOvertimeMinutes = 0;
	let totalUndertimeMinutes = 0;
	let totalLateMinutes = 0;
	let totalEarlyOutMinutes = 0;

	for (const attendance of attendances) {
		// Recalculate for each attendance
		if (attendance.timeIn && attendance.date) {
			const calc = calculateTimekeeping(
				attendance.timeIn,
				attendance.timeOut || null,
				attendance.scheduleSnapshot || null,
				attendance.date,
				timeZone,
			);
			totalMinutesWorked += calc.totalMinutesWorked;
			totalRegularMinutes += calc.regularMinutes;
			totalOvertimeMinutes += calc.overtimeMinutes;
			totalUndertimeMinutes += calc.undertimeMinutes;
			totalLateMinutes += calc.lateMinutes;
			totalEarlyOutMinutes += calc.earlyOutMinutes;
		}
	}

	// Store minute values in metadata
	const metadata = {
		totalMinutesWorked,
		totalRegularMinutes,
		totalOvertimeMinutes,
		totalUndertimeMinutes,
		totalLateMinutes,
		totalEarlyOutMinutes,
	};

	// Format as "HH:MM" strings for main fields
	return {
		totalHoursWorked: formatMinutesAsTime(totalMinutesWorked),
		totalRegularHours: formatMinutesAsTime(totalRegularMinutes),
		totalOvertimeHours: formatMinutesAsTime(totalOvertimeMinutes),
		totalUndertimeHours: formatMinutesAsTime(totalUndertimeMinutes),
		totalLateHours: formatMinutesAsTime(totalLateMinutes),
		totalEarlyOutHours: formatMinutesAsTime(totalEarlyOutMinutes),
		metadata,
	};
}

/**
 * Generate daily breakdown from attendance records
 * Returns array of daily summaries for the timesheet
 * IMPORTANT: Recalculates metrics on the fly to ensure accuracy
 */
export function generateDailyBreakdown(
	attendances: Array<{
		date?: Date | null;
		timeIn?: Date | null;
		timeOut?: Date | null;
		scheduleSnapshot?: EmployeeSchedule | null;
		status?: string;
		notes?: string | null;
		hoursWorked?: string;
		regularHours?: string;
		overtimeHours?: string;
		undertimeHours?: string;
		lateHours?: string;
		earlyOutHours?: string;
		breakMinutes?: number | null;
	}>,
	timeZone: string = "Asia/Manila",
) {
	return attendances.map((attendance) => {
		const dayDate = attendance.date || new Date();
		const schedule = attendance.scheduleSnapshot || null;
		const calc = calculateTimekeeping(
			attendance.timeIn || null,
			attendance.timeOut || null,
			schedule,
			dayDate,
			timeZone,
		);
		const graceStatus = deriveGracePeriodStatus(
			attendance.timeIn || null,
			schedule,
			dayDate,
			timeZone,
		);
		const breakDisplay = formatBreakDisplayFromSchedule(schedule, dayDate);
		const graceEarlyOutMinutes = Math.max(
			0,
			Number((schedule as any)?.graceEarlyOutMinutes ?? 0),
		);
		const rawEarlyOutMinutes = calc.earlyOutMinutes;
		const hasCompleteClockEvidence = Boolean(attendance.timeIn && attendance.timeOut);
		// Complete clock rows are recomputed so stale imported hour strings cannot override punches.
		return {
			date: dayDate,
			timeIn: attendance.timeIn || null,
			timeOut: attendance.timeOut || null,
			hoursWorked: hasCompleteClockEvidence
				? formatMinutesAsTime(calc.totalMinutesWorked)
				: attendance.hoursWorked || "0:00",
			regularHours: hasCompleteClockEvidence
				? formatMinutesAsTime(calc.regularMinutes)
				: attendance.regularHours || "0:00",
			overtimeHours: hasCompleteClockEvidence
				? formatMinutesAsTime(calc.overtimeMinutes)
				: attendance.overtimeHours || "0:00",
			undertimeHours: hasCompleteClockEvidence
				? formatMinutesAsTime(calc.undertimeMinutes)
				: attendance.undertimeHours || "0:00",
			lateHours: hasCompleteClockEvidence
				? formatMinutesAsTime(calc.lateMinutes)
				: attendance.lateHours || "0:00",
			earlyOutHours: hasCompleteClockEvidence
				? formatMinutesAsTime(calc.earlyOutMinutes)
				: attendance.earlyOutHours || "0:00",
			status: attendance.status || null,
			employeeNotes: attendance.notes || null,
			metadata: {
				...(hasCompleteClockEvidence
					? {
							totalMinutes: calc.totalMinutesWorked,
							regularMinutes: calc.regularMinutes,
							overtimeMinutes: calc.overtimeMinutes,
							undertimeMinutes: calc.undertimeMinutes,
							lateMinutes: calc.lateMinutes,
							earlyOutMinutes: calc.earlyOutMinutes,
						}
					: {}),
				rawLateMinutes: graceStatus.rawLateMinutes,
				gracePeriodMinutes: graceStatus.gracePeriodMinutes,
				withinGrace: graceStatus.withinGrace,
				rawEarlyOutMinutes,
				graceEarlyOutMinutes,
				breakMinutes:
					typeof attendance.breakMinutes === "number"
						? attendance.breakMinutes
						: calc.breakMinutes,
				breakDisplay,
			},
		};
	});
}

/**
 * Format timekeeping summary for display
 */
export function formatTimekeepingSummary(calc: TimekeepingCalculation): string {
	return `
=== TIMEKEEPING SUMMARY ===
Total Minutes Worked: ${calc.totalMinutesWorked} min (${minutesToHours(calc.totalMinutesWorked).toFixed(2)} hrs)
Regular Minutes: ${calc.regularMinutes} min (${minutesToHours(calc.regularMinutes).toFixed(2)} hrs)
Overtime Minutes: ${calc.overtimeMinutes} min (${minutesToHours(calc.overtimeMinutes).toFixed(2)} hrs)
Early Out Minutes: ${calc.earlyOutMinutes} min (${minutesToHours(calc.earlyOutMinutes).toFixed(2)} hrs)
Break Duration: ${calc.breakMinutes} min (${minutesToHours(calc.breakMinutes).toFixed(2)} hrs)

TARDINESS:
  Late: ${calc.lateMinutes} minutes
EARLY OUT:
  Early Out: ${calc.earlyOutMinutes} minutes
`;
}

const MANILA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface NightShiftBreakdown {
	isNightShiftDay: boolean;
	scheduledWindow: { startTime: string; endTime: string; isOvernight: boolean };
	actualNightHours: string;
}

export function computeNightShiftForDay(params: {
	isOvernight?: boolean | null;
	scheduleStartTime?: string | null;
	scheduleEndTime?: string | null;
	hoursWorked?: string | null;
	timeIn?: Date | string | null;
	timeOut?: Date | string | null;
	tz?: string;
}): NightShiftBreakdown | null {
	if (!params.isOvernight) return null;

	const startTime = params.scheduleStartTime || "22:00";
	const endTime = params.scheduleEndTime || "06:00";
	const explicitWorkedHours =
		typeof params.hoursWorked === "string" && params.hoursWorked.trim()
			? params.hoursWorked
			: null;

	const timeInStr = params.timeIn instanceof Date ? params.timeIn.toISOString() : params.timeIn;
	const timeOutStr =
		params.timeOut instanceof Date ? params.timeOut.toISOString() : params.timeOut;

	let actualNightHours = explicitWorkedHours || "0:00";
	if (timeInStr && timeOutStr) {
		const startUtc = new Date(timeInStr).getTime();
		const endUtc = new Date(timeOutStr).getTime();
		if (!explicitWorkedHours && Number.isFinite(startUtc) && Number.isFinite(endUtc) && endUtc > startUtc) {
			const startLocalMs = startUtc + MANILA_UTC_OFFSET_MS;
			const endLocalMs = endUtc + MANILA_UTC_OFFSET_MS;
			const startDayMs = Math.floor(startLocalMs / MS_PER_DAY) * MS_PER_DAY - MS_PER_DAY;
			const endDayMs = Math.floor(endLocalMs / MS_PER_DAY) * MS_PER_DAY;

			let totalNightMinutes = 0;
			for (let dayMs = startDayMs; dayMs <= endDayMs; dayMs += MS_PER_DAY) {
				const windowStartMs = dayMs + 22 * 60 * MS_PER_MINUTE;
				const windowEndMs = dayMs + (24 * 60 + 6 * 60) * MS_PER_MINUTE;
				const overlapStart = Math.max(startLocalMs, windowStartMs);
				const overlapEnd = Math.min(endLocalMs, windowEndMs);
				if (overlapEnd > overlapStart) {
					totalNightMinutes += Math.floor((overlapEnd - overlapStart) / MS_PER_MINUTE);
				}
			}
			const h = Math.floor(totalNightMinutes / 60);
			const m = totalNightMinutes % 60;
			actualNightHours = `${h}:${String(m).padStart(2, "0")}`;
		}
	}

	return {
		isNightShiftDay: true,
		scheduledWindow: { startTime, endTime, isOvernight: true },
		actualNightHours,
	};
}

/**
 * Calculate the break duration that should be deducted based on overlap with work hours
 */
function calculateDeductibleBreakMinutes(
	timeIn: Date,
	timeOut: Date,
	timeSlots: TimeSlot[],
	timeZone: string,
): number {
	const breakSlots = timeSlots.filter((slot) => slot.type === "break");
	if (breakSlots.length === 0) return 0;

	let totalDeductible = 0;

	// Helper to get minutes from midnight for a HH:MM string in a timezone
	// We use the timeIn as a reference to determine the day
	const localInMins = timeToMinutes(extractTime(timeIn, timeZone));

	for (const slot of breakSlots) {
		let startMins = timeToMinutes(slot.startTime);
		let endMins = timeToMinutes(slot.endTime);

		// Handle slot crossing midnight (e.g. 23:00 to 01:00)
		if (endMins < startMins) {
			endMins += 24 * 60;
		}

		// Calculate the slot start time relative to the timeIn timestamp
		// We align the slot's HH:MM with the timeIn day
		// formula: ReferenceBreakStart = timeIn + (SlotStartMins - LocalInMins)
		// This works because (SlotStartMins - LocalInMins) is the delta in minutes on the same timeline
		const diffMins = startMins - localInMins;
		const refStart = new Date(timeIn.getTime() + diffMins * 60 * 1000);
		const slotDuration = endMins - startMins;
		const refEnd = new Date(refStart.getTime() + slotDuration * 60 * 1000);

		// Identify overlap candidates (Today, Tomorrow, Yesterday)
		// This handles cases where timeIn is late (e.g. 23:00) and break is early next day (02:00)
		const candidates = [
			{ start: refStart, end: refEnd },
			{
				start: new Date(refStart.getTime() + 24 * 60 * 60 * 1000),
				end: new Date(refEnd.getTime() + 24 * 60 * 60 * 1000),
			},
			{
				start: new Date(refStart.getTime() - 24 * 60 * 60 * 1000),
				end: new Date(refEnd.getTime() - 24 * 60 * 60 * 1000),
			},
		];

		// Find the candidate with the maximum overlap with [timeIn, timeOut]
		let maxOverlap = 0;
		for (const cand of candidates) {
			const overlapStart = Math.max(timeIn.getTime(), cand.start.getTime());
			const overlapEnd = Math.min(timeOut.getTime(), cand.end.getTime());
			const overlapMs = Math.max(0, overlapEnd - overlapStart);
			maxOverlap = Math.max(maxOverlap, overlapMs / (1000 * 60));
		}

		totalDeductible += maxOverlap;
	}

	return roundMinutes(totalDeductible);
}
