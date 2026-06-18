/**
 * Attendance Helper Functions
 * Provides utilities for attendance date handling and validation
 */

import {
	PrismaClient,
	type Attendance,
	type AttendanceLedgerType,
} from "../generated/prisma";
import { getLogger } from "./logger.helper";
import type { LeaveDurationUnit, LeaveHalfDaySession } from "./leave-session.helper";
import { resolveEffectiveShift } from "./employee-schedule.helper";
import { formatMinutesAsTime, type TimekeepingCalculation } from "./timekeeping.helper";

const logger = getLogger();
const attendanceLogger = logger.child({ module: "attendance-helper" });
export const BUSINESS_TIME_ZONE = "Asia/Manila";
const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;

type AttendanceSnapshotSource = {
	id: string;
	employeeId: string;
	workforceSource?: "DIRECT" | "AGENCY" | null;
	agencyId?: string | null;
	reportToId?: string | null;
	departmentId?: string | null;
	department?: { id?: string | null; name?: string | null } | null;
	person?: {
		personalInfo?: {
			firstName?: string | null;
			middleName?: string | null;
			lastName?: string | null;
		} | null;
	} | null;
};

export function getAttendanceEmployeeDisplayName(
	employee: AttendanceSnapshotSource | null | undefined,
): string | null {
	if (!employee) return null;
	const firstName = String(employee.person?.personalInfo?.firstName || "").trim();
	const middleName = String(employee.person?.personalInfo?.middleName || "").trim();
	const lastName = String(employee.person?.personalInfo?.lastName || "").trim();
	const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ").trim();
	return fullName || String(employee.employeeId || employee.id || "").trim() || null;
}

export function buildAttendanceEmployeeSnapshotFields(
	employee: AttendanceSnapshotSource | null | undefined,
) {
	return {
		employeeCodeSnapshot: String(employee?.employeeId || "").trim() || null,
		employeeNameSnapshot: getAttendanceEmployeeDisplayName(employee),
		departmentIdSnapshot: employee?.departmentId || employee?.department?.id || null,
		departmentNameSnapshot: String(employee?.department?.name || "").trim() || null,
		reportToIdSnapshot: employee?.reportToId || null,
		workforceSourceSnapshot: employee?.workforceSource || "DIRECT",
		agencyIdSnapshot: employee?.agencyId || null,
	};
}

export async function fetchAttendanceEmployeeSnapshotFields(
	prisma: PrismaClient,
	employeeId: string,
) {
	const employee = await prisma.employee.findUnique({
		where: { id: employeeId },
		select: {
			id: true,
			employeeId: true,
			workforceSource: true,
			agencyId: true,
			reportToId: true,
			departmentId: true,
			department: {
				select: {
					id: true,
					name: true,
				},
			},
			person: {
				select: {
					personalInfo: true,
				},
			},
		},
	});

	return buildAttendanceEmployeeSnapshotFields(employee as AttendanceSnapshotSource | null);
}

export function buildAttendanceTimekeepingFields(
	calc: TimekeepingCalculation,
	options?: {
		isNonWorked?: boolean;
	},
) {
	const isNonWorked = options?.isNonWorked === true;
	const totalMinutesWorked = isNonWorked ? 0 : Number(calc.totalMinutesWorked || 0);
	const regularMinutes = isNonWorked ? 0 : Number(calc.regularMinutes || 0);
	const overtimeMinutes = isNonWorked ? 0 : Number(calc.overtimeMinutes || 0);
	const undertimeMinutes = isNonWorked ? 0 : Number(calc.undertimeMinutes || 0);
	const lateMinutes = isNonWorked ? 0 : Number(calc.lateMinutes || 0);
	const earlyOutMinutes = isNonWorked ? 0 : Number(calc.earlyOutMinutes || 0);
	const breakMinutes = isNonWorked ? 0 : Number(calc.breakMinutes || 0);

	return {
		totalMinutesWorked,
		regularMinutes,
		overtimeMinutes,
		undertimeMinutes,
		lateMinutes,
		earlyOutMinutes,
		breakMinutes,
		hoursWorked: formatMinutesAsTime(totalMinutesWorked),
		regularHours: formatMinutesAsTime(regularMinutes),
		overtimeHours: formatMinutesAsTime(overtimeMinutes),
		undertimeHours: formatMinutesAsTime(undertimeMinutes),
		lateHours: formatMinutesAsTime(lateMinutes),
		earlyOutHours: formatMinutesAsTime(earlyOutMinutes),
	};
}

const getDatePartsInTimeZone = (date: Date, timeZone: string) => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);

	const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
	const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
	const day = Number(parts.find((part) => part.type === "day")?.value ?? "1");

	return { year, month, day };
};

const dateKeyToUtcDate = (dateKey: string): Date => {
	const [year, month, day] = dateKey.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

export function getDateKeyInBusinessTimeZone(date: Date): string {
	const { year, month, day } = getDatePartsInTimeZone(date, BUSINESS_TIME_ZONE);
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getBusinessDayDate(date: Date): Date {
	return dateKeyToUtcDate(getDateKeyInBusinessTimeZone(date));
}

export function getBusinessDayBounds(date: Date): { start: Date; end: Date } {
	const businessDayDate = getBusinessDayDate(date);
	const start = new Date(
		businessDayDate.getTime() - BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000,
	);
	const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);

	return { start, end };
}

export function getTodayBusinessDayBounds(): { start: Date; end: Date } {
	return getBusinessDayBounds(new Date());
}

export function isSameBusinessDay(left: Date, right: Date): boolean {
	return getDateKeyInBusinessTimeZone(left) === getDateKeyInBusinessTimeZone(right);
}

/**
 * Normalize a date to start of day (00:00:00.000) in UTC
 * This ensures consistent date comparison regardless of time component
 */
export function normalizeToStartOfDay(date: Date): Date {
	const normalized = new Date(date);
	normalized.setUTCHours(0, 0, 0, 0);
	return normalized;
}

/**
 * Normalize a date to end of day (23:59:59.999) in UTC
 * This ensures we capture all records for the entire day
 */
export function normalizeToEndOfDay(date: Date): Date {
	const normalized = new Date(date);
	normalized.setUTCHours(23, 59, 59, 999);
	return normalized;
}

interface EffectiveEmploymentStartInput {
	employmentStartDate?: Date | string | null;
	employmentHireDate?: Date | string | null;
}

export function getEffectiveEmploymentStartDate(
	employee: EffectiveEmploymentStartInput | null | undefined,
): Date | null {
	if (!employee) return null;
	const rawDate = employee.employmentStartDate || employee.employmentHireDate;
	if (!rawDate) return null;
	const parsedDate = rawDate instanceof Date ? rawDate : new Date(rawDate);
	if (Number.isNaN(parsedDate.getTime())) return null;
	return normalizeToStartOfDay(parsedDate);
}

export function isBeforeEffectiveEmploymentStartDate(
	employee: EffectiveEmploymentStartInput | null | undefined,
	targetDate: Date,
): boolean {
	const effectiveStartDate = getEffectiveEmploymentStartDate(employee);
	if (!effectiveStartDate) return false;
	return normalizeToStartOfDay(targetDate) < effectiveStartDate;
}

/**
 * Check if an attendance record exists for a specific employee on a specific date
 * Uses a single optimized database query with proper date range handling
 *
 * @param employeeId - Employee ID to check
 * @param date - Date to check (will be normalized to start/end of day)
 * @param organizationId - Organization ID to scope the query
 * @returns Query where clause for finding attendance by date range
 */
export function buildAttendanceDateQuery(
	employeeId: string,
	date: Date,
	organizationId: string,
): {
	where: any;
	startOfDay: Date;
	endOfDay: Date;
} {
	const { start, end } = getBusinessDayBounds(date);
	const startOfDay = start;
	const endOfDay = end;
	const businessDateKey = getDateKeyInBusinessTimeZone(date);

	attendanceLogger.debug(
		`Building attendance query for employee ${employeeId} on business day ${businessDateKey}`,
	);
	attendanceLogger.debug(`Date range: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

	return {
		where: {
			organizationId,
			employeeId,
			isDeleted: false,
			date: {
				gte: startOfDay,
				lte: endOfDay,
			},
		},
		startOfDay,
		endOfDay,
	};
}

/**
 * Analyze existing attendance and determine what action can be taken
 *
 * @param existingAttendance - Existing attendance record or null
 * @param requestedAction - Action being requested ('clock-in' or 'clock-out')
 * @returns Validation result with detailed information
 */
export function analyzeAttendanceAction(
	existingAttendance: any | null,
	requestedAction: "clock-in" | "clock-out",
): {
	canProceed: boolean;
	action: "create" | "update-clock-out" | "reject";
	reason?: string;
	existingAttendance?: any;
} {
	// No existing attendance - can create new
	if (!existingAttendance) {
		if (requestedAction === "clock-in") {
			return { canProceed: true, action: "create" };
		} else {
			return {
				canProceed: false,
				action: "reject",
				reason: "No attendance record found for today. Please clock in first.",
			};
		}
	}

	const hasTimeIn = !!existingAttendance.timeIn;
	const hasTimeOut = !!existingAttendance.timeOut;

	// Attendance exists with timeIn but no timeOut
	if (hasTimeIn && !hasTimeOut) {
		if (requestedAction === "clock-in") {
			return {
				canProceed: false,
				action: "reject",
				reason: "Employee has already clocked in today. Use clock out or update existing record.",
				existingAttendance,
			};
		} else {
			return {
				canProceed: true,
				action: "update-clock-out",
				existingAttendance,
			};
		}
	}

	// Attendance exists and is complete (has both timeIn and timeOut)
	if (hasTimeIn && hasTimeOut) {
		if (requestedAction === "clock-out") {
			return {
				canProceed: true,
				action: "update-clock-out",
				existingAttendance,
			};
		}

		return {
			canProceed: false,
			action: "reject",
			reason: "Attendance already complete for today. Cannot clock in/out again.",
			existingAttendance,
		};
	}

	// Default: allow clock in
	return { canProceed: true, action: "create" };
}

/**
 * Format date for logging/display
 */
export function formatAttendanceDate(date: Date): string {
	return date.toISOString().split("T")[0];
}

/**
 * Get today's date normalized to start of day UTC
 */
export function getTodayStartUTC(): Date {
	return normalizeToStartOfDay(new Date());
}

/**
 * Get today's date normalized to end of day UTC
 */
export function getTodayEndUTC(): Date {
	return normalizeToEndOfDay(new Date());
}

type AttendanceLedgerRecord = Pick<
	Attendance,
	| "id"
	| "organizationId"
	| "employeeId"
	| "date"
	| "isDeleted"
	| "ledgerType"
	| "isEffective"
	| "sourceRequestId"
	| "supersedesAttendanceId"
	| "appliedAt"
	| "appliedBy"
	| "createdAt"
	| "updatedAt"
> & {
	[key: string]: unknown;
};

const getAttendanceDayKey = (date: Date | null | undefined): string | null => {
	if (!date) return null;
	return date.toISOString().split("T")[0] || null;
};

const getAttendanceLedgerRank = (attendance: AttendanceLedgerRecord): number => {
	const ledgerType = String(attendance.ledgerType || "RAW").toUpperCase() as AttendanceLedgerType;

	if (attendance.isEffective && (ledgerType === "CORRECTION" || ledgerType === "RAW")) {
		return ledgerType === "CORRECTION" ? 500 : 300;
	}

	if (ledgerType === "CORRECTION") return 200;
	if (ledgerType === "RAW") return 100;
	return 0;
};

const compareAttendanceLedgerPriority = (
	left: AttendanceLedgerRecord,
	right: AttendanceLedgerRecord,
): number => {
	const rankDelta = getAttendanceLedgerRank(right) - getAttendanceLedgerRank(left);
	if (rankDelta !== 0) return rankDelta;

	const appliedDelta =
		(right.appliedAt ? new Date(right.appliedAt).getTime() : 0) -
		(left.appliedAt ? new Date(left.appliedAt).getTime() : 0);
	if (appliedDelta !== 0) return appliedDelta;

	const updatedDelta =
		(right.updatedAt ? new Date(right.updatedAt).getTime() : 0) -
		(left.updatedAt ? new Date(left.updatedAt).getTime() : 0);
	if (updatedDelta !== 0) return updatedDelta;

	return (right.createdAt ? new Date(right.createdAt).getTime() : 0) -
		(left.createdAt ? new Date(left.createdAt).getTime() : 0);
};

export function resolveEffectiveAttendanceFromSameDayRecords<T extends AttendanceLedgerRecord>(
	records: T[],
): T | null {
	if (!records.length) return null;

	const sorted = [...records].sort(compareAttendanceLedgerPriority);
	return sorted[0] || null;
}

export async function getEffectiveAttendanceRecordsForRange(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeId: string;
		startDate: Date;
		endDate: Date;
	},
): Promise<Attendance[]> {
	const { organizationId, employeeId, startDate, endDate } = params;
	const rows = await prisma.attendance.findMany({
		where: {
			organizationId,
			employeeId,
			isDeleted: false,
			date: {
				gte: startDate,
				lte: endDate,
			},
		},
		orderBy: [{ date: "asc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
	});

	return collapseAttendanceLedgerRows(rows);
}

export function collapseAttendanceLedgerRows<T extends AttendanceLedgerRecord>(rows: T[]): T[] {
	const byDateKey = new Map<string, T[]>();

	for (const row of rows) {
		const dateKey = getAttendanceDayKey(row.date);
		if (!dateKey) continue;
		const bucket = byDateKey.get(dateKey) || [];
		bucket.push(row);
		byDateKey.set(dateKey, bucket);
	}

	return Array.from(byDateKey.entries())
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([, records]) => resolveEffectiveAttendanceFromSameDayRecords(records))
		.filter((record): record is T => Boolean(record));
}

export function buildAttendanceLedgerSummary<T extends AttendanceLedgerRecord>(rows: T[]) {
	const effective = resolveEffectiveAttendanceFromSameDayRecords(rows);
	const raw = rows.find((row) => String(row.ledgerType || "RAW").toUpperCase() === "RAW") || null;
	const history = [...rows].sort(compareAttendanceLedgerPriority);

	return {
		hasOverride: history.some(
			(row) => String(row.ledgerType || "RAW").toUpperCase() === "CORRECTION",
		),
		rawAttendanceId: raw?.id || null,
		effectiveAttendanceId: effective?.id || null,
		rawAttendance: raw,
		effectiveAttendance: effective,
		attendanceHistory: history,
	};
}

export function getApprovedAttendanceLedgerWhereClause() {
	return {
		isDeleted: false,
	};
}

// ============================================================================
// Attendance Calculation with Absences (Based on Schedule)
// ============================================================================

export interface AttendanceRecord {
	date: Date;
	dayOfWeek: string;
	status: "PRESENT" | "ABSENT" | "REST";
	timeIn?: Date | null;
	timeOut?: Date | null;
	hoursWorked?: number;
	isLate?: boolean;
	remarks?: string;
	attendanceId?: string | null;
	scheduleSnapshot?: any;
	organizationId?: string;
	employeeId?: string;
}

export interface AttendanceSummary {
	totalScheduledDays: number;
	totalWorkDays: number;
	totalRestDays: number;
	daysPresent: number;
	daysAbsent: number;
	daysLate: number;
	attendanceRecords: AttendanceRecord[];
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Find shift for a specific day of week from employee schedule
 */
function findShiftForDayOfWeek(schedule: any, dayOfWeek: number): any | null {
	if (!schedule?.shifts || !Array.isArray(schedule.shifts)) {
		return null;
	}

	const dayName = DAY_NAMES[dayOfWeek];

	return schedule.shifts.find((shift: any) => {
		const label = shift.label?.toLowerCase() || "";
		return (
			label.includes(dayName.toLowerCase()) ||
			label.includes(dayName.substring(0, 3).toLowerCase())
		);
	});
}

/**
 * Calculate attendance with absences for a date range based on employee schedule
 * This is the core logic shared between API and scripts
 */
export async function calculateAttendanceWithAbsences(
	prisma: PrismaClient,
	employeeId: string,
	startDate: Date,
	endDate: Date,
): Promise<AttendanceSummary> {
	const summary: AttendanceSummary = {
		totalScheduledDays: 0,
		totalWorkDays: 0,
		totalRestDays: 0,
		daysPresent: 0,
		daysAbsent: 0,
		daysLate: 0,
		attendanceRecords: [],
	};

	// Get employee
	const employee = await prisma.employee.findFirst({
		where: {
			id: employeeId,
			isDeleted: false,
		},
		select: {
			id: true,
			organizationId: true,
		},
	});

	if (!employee) {
		return summary;
	}

	// Get effective attendance records for the date range
	const attendances = await getEffectiveAttendanceRecordsForRange(prisma, {
		organizationId: employee.organizationId,
		employeeId,
		startDate,
		endDate,
	});

	// Create attendance map for quick lookup
	const attendanceMap = new Map<string, any>();
	attendances.forEach((att) => {
		if (att.date) {
			const dateKey = att.date.toISOString().split("T")[0];
			attendanceMap.set(dateKey, att);
		}
	});

	// Iterate through each day in the date range
	const currentDate = new Date(startDate);
	const rangeEndDate = new Date(endDate);

	while (currentDate <= rangeEndDate) {
		const dateKey = currentDate.toISOString().split("T")[0];
		const dayOfWeek = currentDate.getDay();
		const dayName = DAY_NAMES[dayOfWeek];

		summary.totalScheduledDays++;

		const resolvedShift = await resolveEffectiveShift(prisma, {
			organizationId: employee.organizationId,
			employeeId,
			date: currentDate,
		});
		if (!resolvedShift) {
			currentDate.setDate(currentDate.getDate() + 1);
			continue;
		}

		if (resolvedShift.isOff) {
			// Rest day
			summary.totalRestDays++;
			summary.attendanceRecords.push({
				date: new Date(currentDate),
				dayOfWeek: dayName,
				status: "REST",
				remarks: "Scheduled rest day",
				attendanceId: null,
				scheduleSnapshot: resolvedShift,
				organizationId: employee.organizationId,
				employeeId: employeeId,
			});
		} else {
			// Work day
			summary.totalWorkDays++;
			const attendance = attendanceMap.get(dateKey);

			if (attendance) {
				// Present
				summary.daysPresent++;

				let hoursWorked = 0;
				if (attendance.timeIn && attendance.timeOut) {
					const diff =
						new Date(attendance.timeOut).getTime() - new Date(attendance.timeIn).getTime();
					hoursWorked = diff / (1000 * 60 * 60);
				}

				const isLate = attendance.isLate || false;
				if (isLate) summary.daysLate++;

				summary.attendanceRecords.push({
					date: new Date(currentDate),
					dayOfWeek: dayName,
					status: "PRESENT",
					timeIn: attendance.timeIn,
					timeOut: attendance.timeOut,
					hoursWorked: Math.round(hoursWorked * 100) / 100,
					isLate,
					remarks: attendance.remarks || "Present",
					attendanceId: attendance.id,
					scheduleSnapshot: attendance.scheduleSnapshot || resolvedShift,
					organizationId: attendance.organizationId,
					employeeId: attendance.employeeId,
				});
			} else {
				// Absent - no attendance record for a scheduled work day
				summary.daysAbsent++;
				summary.attendanceRecords.push({
					date: new Date(currentDate),
					dayOfWeek: dayName,
					status: "ABSENT",
					remarks: "No attendance record (Absent)",
					attendanceId: null,
					scheduleSnapshot: resolvedShift,
					organizationId: employee.organizationId,
					employeeId: employeeId,
				});
			}
		}

		// Move to next day
		currentDate.setDate(currentDate.getDate() + 1);
	}

	return summary;
}

/**
 * Convert attendance summary records to API response format
 * This ensures consistent formatting between scripts and API responses
 */
export function formatAttendanceRecordsForAPI(
	records: AttendanceRecord[],
	includeEmployee = true,
): any[] {
	return records.map((record) => {
		const baseRecord: any = {
			scheduleSnapshot: record.scheduleSnapshot,
			id: record.attendanceId,
			organizationId: record.organizationId,
			employeeId: record.employeeId,
			date: record.date,
			timeIn: record.timeIn || null,
			timeOut: record.timeOut || null,
			status: record.status,
			timeInLocation: null,
			timeOutLocation: null,
			deviceInfo: null,
			isManualEntry: false,
			approvedBy: null,
			notes: record.remarks || null,
			isDeleted: false,
			createdAt: record.attendanceId ? undefined : null,
			updatedAt: record.attendanceId ? undefined : null,
		};

		if (includeEmployee && record.employeeId) {
			baseRecord.employee = {
				id: record.employeeId,
				employeeId: undefined, // Will be fetched if needed
				personId: undefined, // Will be fetched if needed
			};
		}

		return baseRecord;
	});
}

/**
 * Create LEAVE attendance records for all days between startDate and endDate
 * This is used when a leave request is approved to mark those days as LEAVE in attendance
 *
 * @param prisma - Prisma client instance
 * @param employeeId - Employee ID
 * @param startDate - Start date of leave
 * @param endDate - End date of leave
 * @param organizationId - Organization ID
 * @param employeeSchedule - Employee's schedule (to avoid redundant DB calls)
 * @param leaveType - Type of leave (e.g., "SICK_LEAVE", "VACATION_LEAVE")
 * @param notes - Optional notes about the leave
 * @returns Number of attendance records created
 */
export async function createLeaveAttendanceRecords(
	prisma: PrismaClient,
	employeeId: string,
	startDate: Date,
	endDate: Date,
	organizationId: string,
	employeeSchedule: any,
	leaveType?: string,
	notes?: string,
	leaveOptions?: {
		durationUnit?: LeaveDurationUnit;
		halfDaySession?: LeaveHalfDaySession;
		sessionWindowStart?: string | null;
		sessionWindowEnd?: string | null;
	},
): Promise<number> {
	try {
		const employeeSnapshotFields = await fetchAttendanceEmployeeSnapshotFields(prisma, employeeId);
		const nonWorkedFields = buildAttendanceTimekeepingFields(
			{
				totalMinutesWorked: 0,
				regularMinutes: 0,
				overtimeMinutes: 0,
				undertimeMinutes: 0,
				lateMinutes: 0,
				earlyOutMinutes: 0,
				breakMinutes: 0,
			},
			{ isNonWorked: true },
		);
		const isHalfDay = leaveOptions?.durationUnit === "HALF_DAY";
		const halfDaySession = leaveOptions?.halfDaySession;
		const sessionWindowStart = leaveOptions?.sessionWindowStart;
		const sessionWindowEnd = leaveOptions?.sessionWindowEnd;

		const halfDayNotes =
			isHalfDay && halfDaySession
				? [
						"HALF_DAY",
						halfDaySession,
						sessionWindowStart && sessionWindowEnd
							? `${sessionWindowStart}-${sessionWindowEnd}`
							: "",
						leaveType ? `(${leaveType})` : "",
					]
						.filter(Boolean)
						.join(" ")
				: null;
		const effectiveNotes = isHalfDay ? halfDayNotes || notes || "HALF_DAY LEAVE" : notes;

		// Normalize dates to start/end of day in UTC for consistency
		// This ensures dates are interpreted correctly regardless of server timezone
		const currentDate = normalizeToStartOfDay(new Date(startDate));
		const rangeEndDate = isHalfDay
			? normalizeToEndOfDay(new Date(startDate))
			: normalizeToEndOfDay(new Date(endDate));

		let recordsCreated = 0;

		// Iterate through each day in the leave period
		while (currentDate <= rangeEndDate) {
			const dateKey = currentDate.toISOString().split("T")[0];
			// Use UTC day of week since we're working with UTC-normalized dates
			const dayOfWeek = currentDate.getUTCDay();

			// Check if this is a work day (not a rest day)
			let isWorkDay = true;
			if (employeeSchedule?.shifts) {
				const shift = findShiftForDayOfWeek(employeeSchedule, dayOfWeek);
				if (shift?.isRestDay) {
					isWorkDay = false;
					attendanceLogger.debug(
						`Skipping rest day ${dateKey} for employee ${employeeId}`,
					);
				}
			}

			// Only create leave attendance for work days
			if (isWorkDay) {
				// Check if attendance already exists for this date
				const existingAttendance = await prisma.attendance.findFirst({
					where: {
						employeeId,
						organizationId,
						isDeleted: false,
						date: {
							gte: normalizeToStartOfDay(currentDate),
							lte: normalizeToEndOfDay(currentDate),
						},
					},
				});

				if (existingAttendance) {
					// Update existing record to LEAVE status
					await prisma.attendance.update({
						where: { id: existingAttendance.id },
						data: {
							status: "LEAVE",
							behaviorFlags: [],
							notes: notes || `${leaveType || "Leave"} - Approved`,
							isManualEntry: true,
							...employeeSnapshotFields,
							...nonWorkedFields,
						},
					});
					recordsCreated++;
					attendanceLogger.info(
						`Updated existing attendance ${existingAttendance.id} to LEAVE for ${dateKey}`,
					);
				} else {
					// Create new LEAVE attendance record
					// currentDate is already normalized to UTC start of day
					const leaveAttendance = await prisma.attendance.create({
						data: {
							organizationId,
							employeeId,
							date: new Date(currentDate), // Already normalized to UTC start of day
							status: "LEAVE",
							behaviorFlags: [],
							scheduleSnapshot: employeeSchedule || undefined,
							isManualEntry: true,
							notes: effectiveNotes || `${leaveType || "Leave"} - Approved`,
							...employeeSnapshotFields,
							...nonWorkedFields,
						},
					});
					recordsCreated++;
					attendanceLogger.info(
						`Created LEAVE attendance ${leaveAttendance.id} for ${dateKey}`,
					);
				}
			}

			// Move to next day using UTC to maintain consistency
			currentDate.setUTCDate(currentDate.getUTCDate() + 1);
		}

		attendanceLogger.info(
			`Created/updated ${recordsCreated} leave attendance records for employee ${employeeId} from ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}`,
		);

		return recordsCreated;
	} catch (error) {
		attendanceLogger.error(`Error creating leave attendance records: ${error}`);
		throw error;
	}
}
