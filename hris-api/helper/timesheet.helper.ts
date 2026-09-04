/**
 * Timesheet Helper
 * Utilities for timesheet management including unique code generation
 */

import { PrismaClient } from "../generated/prisma";
import { generateDailyBreakdown, generateTimesheetSummary } from "./timekeeping.helper";
import {
	getEffectiveAttendanceRecordsForRange,
	getEffectiveEmploymentStartDate,
	normalizeToStartOfDay,
} from "./attendance.helper";
import { enrichBreakdownWithLeaveHolidayContext } from "./day-context.helper";
import { resolveEffectiveShift } from "./employee-schedule.helper";
import {
	buildTimesheetDaySnapshotMetadata,
	writeEffectiveTimesheetLine,
} from "./timesheet-line-version.helper";
import {
	ensureAttendanceObligationsForPayrollPeriod,
	materializeTimesheetLinesFromObligations,
} from "./attendance-obligation.helper";
import { normalizeDayLaborType } from "./day-labor-type.helper";
import {
	AUTO_APPROVE_SYSTEM_ACTOR,
	buildTimesheetAutoApprovalPatch,
} from "./timesheet-config.helper";

const ATTENDANCE_REFRESHABLE_TIMESHEET_STATUSES = new Set(["DRAFT", "REVISED", "REJECTED"]);

export function isTimesheetAttendanceRefreshAllowed(status: string | null | undefined): boolean {
	return ATTENDANCE_REFRESHABLE_TIMESHEET_STATUSES.has(String(status || "").toUpperCase());
}

function readTimesheetMetadata(value: unknown): Record<string, any> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, any>)
		: {};
}

export function isTimesheetSystemAutoApproved(timesheet: any): boolean {
	const metadata = readTimesheetMetadata(timesheet?.metadata);
	return (
		metadata.autoApproved === true ||
		timesheet?.approvedBy === AUTO_APPROVE_SYSTEM_ACTOR
	);
}

/**
 * System auto-approval refresh lane (2026-09-04): auto-approved timesheets
 * stay live until payroll locks them, so new punches / obligation updates
 * keep reflecting on the sheet. Manual manager-approved sheets, locked
 * sheets, and sheets already consumed by a paid payroll row stay frozen.
 */
export function isTimesheetSystemRefreshAllowed(timesheet: any): boolean {
	if (!timesheet || typeof timesheet !== "object") return false;
	if (timesheet.lockedAt || timesheet.lockedEmployeePayrollId) return false;
	if (isTimesheetAttendanceRefreshAllowed(timesheet.status)) return true;
	if (String(timesheet.status || "").toUpperCase() !== "APPROVED") return false;
	return isTimesheetSystemAutoApproved(timesheet);
}

export type TimesheetAutoApproveEnsureAction = "create" | "upgrade" | "refresh" | "preserve" | "skip";

export function resolveTimesheetAutoApproveEnsureAction(timesheet: any | null): TimesheetAutoApproveEnsureAction {
	if (!timesheet) return "create";
	if (timesheet.lockedAt || timesheet.lockedEmployeePayrollId) return "skip";
	const status = String(timesheet.status || "").toUpperCase();
	if (status === "APPROVED") {
		return isTimesheetSystemAutoApproved(timesheet) ? "refresh" : "preserve";
	}
	if (status === "DRAFT" || status === "SUBMITTED" || status === "REVISED" || status === "REJECTED") {
		return "upgrade";
	}
	return "skip";
}

function resolveEmployeeNameSnapshot(employee: any): string | null {
	const personalInfo = employee?.person?.personalInfo || {};
	const name = [personalInfo.firstName, personalInfo.lastName].filter(Boolean).join(" ").trim();
	return name || employee?.employeeId || null;
}

function toDateOnlyUtc(value: unknown): Date {
	const parsed = value instanceof Date ? value : new Date(String(value || ""));
	if (Number.isNaN(parsed.getTime())) {
		return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
	}
	return new Date(`${getDateKeyInTimeZone(parsed)}T00:00:00.000Z`);
}

function normalizeTimesheetLineStatus(day: any): string {
	const status = String(day?.status || "").toUpperCase();
	const dateKey = getDateKeyInTimeZone(toDateOnlyUtc(day?.date));
	const todayKey = getDateKeyInTimeZone(new Date());
	if (status === "ABSENT" && dateKey === todayKey && !day?.timeIn && !day?.timeOut) {
		return "NOT_CLOCKED_IN";
	}
	return status || "NOT_CLOCKED_IN";
}

function getLineMetadata(line: any): Record<string, any> {
	return line?.metadata && typeof line.metadata === "object" && !Array.isArray(line.metadata)
		? line.metadata
		: {};
}

function buildTimesheetLineMetadata(day: any, baseMetadata: Record<string, any>) {
	const leaveEntries = Array.isArray(day?.leaveEntries) ? day.leaveEntries : [];
	const holidayEntries = Array.isArray(day?.holidayEntries) ? day.holidayEntries : [];
	const primaryMarker =
		day?.primaryMarker ||
		(holidayEntries.length
			? "HOLIDAY"
			: leaveEntries.length || day?.leaveType
				? "LEAVE"
				: undefined);

	return {
		...baseMetadata,
		...(day?.leaveType ? { leaveType: day.leaveType } : {}),
		...(leaveEntries.length ? { leaveEntries } : {}),
		...(holidayEntries.length ? { holidayEntries } : {}),
		...(primaryMarker ? { primaryMarker } : {}),
	};
}

export function buildBreakdownFromTimesheetLines(lines: any[] | null | undefined): any[] {
	const source = Array.isArray(lines) ? lines : [];
	return source
		.filter((line) => !line?.isDeleted && line?.isEffective !== false)
		.sort((a, b) => {
			const aTime = a?.date ? new Date(a.date).getTime() : 0;
			const bTime = b?.date ? new Date(b.date).getTime() : 0;
			return aTime - bTime;
		})
		.map((line) => {
			const metadata = getLineMetadata(line);
			const snapshotDay =
				metadata.day && typeof metadata.day === "object" && !Array.isArray(metadata.day)
					? (metadata.day as Record<string, any>)
					: {};
			const snapshotLeave =
				snapshotDay.leave &&
				typeof snapshotDay.leave === "object" &&
				!Array.isArray(snapshotDay.leave)
					? (snapshotDay.leave as Record<string, any>)
					: {};
			const leaveEntries = Array.isArray(metadata.leaveEntries) ? metadata.leaveEntries : [];
			const holidayEntries = Array.isArray(metadata.holidayEntries)
				? metadata.holidayEntries
				: [];
			const scheduleSnapshot =
				line.scheduleSnapshot ||
				metadata.scheduleSnapshot ||
				snapshotDay.scheduleSnapshot ||
				null;
			return {
				date: line.date,
				timeIn: line.timeIn || null,
				timeOut: line.timeOut || null,
				hoursWorked: line.hoursWorked || "0:00",
				regularHours: line.regularHours || "0:00",
				overtimeHours: line.overtimeHours || "0:00",
				undertimeHours: line.undertimeHours || "0:00",
				lateHours: line.lateHours || "0:00",
				earlyOutHours: line.earlyOutHours || "0:00",
				status: line.status || "NOT_CLOCKED_IN",
				leaveType:
					typeof snapshotLeave.type === "string" && snapshotLeave.type.trim()
						? snapshotLeave.type
						: typeof metadata.leaveType === "string" && metadata.leaveType.trim()
						? metadata.leaveType
						: leaveEntries[0]?.leaveType || null,
				leaveEntries,
				holidayEntries,
				scheduleSnapshot,
				employeeNotes: line.employeeNotes || line.notes || null,
				approverNotes: line.approverNotes || null,
				dayLaborType: line.dayLaborType || null,
				metadata: {
					...metadata,
					...(scheduleSnapshot ? { scheduleSnapshot } : {}),
					...(line.breakMinutes !== null && line.breakMinutes !== undefined
						? { breakMinutes: line.breakMinutes }
						: {}),
				},
				primaryMarker:
					line.primaryMarker || snapshotDay.marker || metadata.primaryMarker || undefined,
			};
		});
}

export function attachTimesheetBreakdownFromLines<T extends any>(timesheet: T): T {
	if (!timesheet || typeof timesheet !== "object") return timesheet;
	const lines = Array.isArray((timesheet as any).timesheetlines)
		? (timesheet as any).timesheetlines
		: [];
	const lineBreakdown = buildBreakdownFromTimesheetLines(lines);
	if (lineBreakdown.length || !Array.isArray((timesheet as any).breakdown)) {
		(timesheet as any).breakdown = lineBreakdown;
	}
	return timesheet;
}

export async function syncTimesheetLinesFromBreakdown(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeId: string;
		payrollPeriodId: string;
		timesheetId: string;
		breakdown: any[];
		attendances?: any[];
		versionMode?: "update" | "version";
		versionDayKeys?: Set<string>;
		manualEditDayKeys?: Set<string>;
		ledgerType?: "SNAPSHOT" | "CORRECTION" | "HR_ADJUSTMENT" | "SYSTEM_REBUILD";
		editedBy?: string | null;
		editReason?: string | null;
	},
) {
	let breakdown = Array.isArray(params.breakdown) ? params.breakdown : [];
	if (breakdown.length) {
		try {
			breakdown = await enrichBreakdownWithLeaveHolidayContext(prisma, {
				organizationId: params.organizationId,
				employeeId: params.employeeId,
				breakdown,
			});
		} catch {
			// Keep line sync available even if contextual decoration cannot be resolved.
		}
	}
	const attendanceByDate = new Map<string, any>();
	for (const attendance of params.attendances || []) {
		if (attendance?.date) {
			attendanceByDate.set(getDateKeyInTimeZone(attendance.date), attendance);
		}
	}

	const employee = await prisma.employee.findFirst({
		where: {
			id: params.employeeId,
			organizationId: params.organizationId,
			isDeleted: false,
		},
		include: {
			person: true,
			department: true,
		},
	});

	const activeDateKeys = new Set<string>();
	for (const day of breakdown) {
		const date = toDateOnlyUtc(day?.date);
		const dateKey = getDateKeyInTimeZone(date);
		activeDateKeys.add(dateKey);
		const attendance = attendanceByDate.get(dateKey);
		const metadata =
			day?.metadata && typeof day.metadata === "object" && !Array.isArray(day.metadata)
				? day.metadata
				: {};
		const leaveEntries = Array.isArray(day?.leaveEntries) ? day.leaveEntries : [];
		const holidayEntries = Array.isArray(day?.holidayEntries) ? day.holidayEntries : [];
		const primaryMarker =
			(day?.primaryMarker ||
				(metadata.day && typeof metadata.day === "object"
					? (metadata.day as any).marker
					: null) ||
				metadata.primaryMarker ||
				(holidayEntries.length
					? "HOLIDAY"
					: leaveEntries.length || day?.leaveType
						? "LEAVE"
						: normalizeTimesheetLineStatus(day) === "ABSENT"
							? "ABSENT"
							: normalizeTimesheetLineStatus(day) === "NOT_CLOCKED_IN"
								? "NOT_CLOCKED_IN"
								: "HOURS")) as string;
		const timesheetLineMetadata = buildTimesheetDaySnapshotMetadata({
			baseMetadata: buildTimesheetLineMetadata(day, metadata),
			source: {
				type: attendance?.id ? "ATTENDANCE" : "MANUAL_BREAKDOWN",
				id: attendance?.id || null,
				status: normalizeTimesheetLineStatus(day),
				reason: params.versionMode === "version" ? params.ledgerType || "CORRECTION" : "SNAPSHOT",
				requestId:
					typeof metadata.sourceRequestId === "string"
						? metadata.sourceRequestId
						: typeof metadata.requestId === "string"
							? metadata.requestId
							: null,
			},
			marker: primaryMarker,
			schedule: attendance?.scheduleSnapshot || metadata.scheduleSnapshot || null,
			snapshottedAt: new Date(),
		});
		const breakMinutes =
			typeof metadata.breakMinutes === "number"
				? metadata.breakMinutes
				: typeof attendance?.breakMinutes === "number"
					? attendance.breakMinutes
					: null;

		const shouldVersionDay = params.versionDayKeys
			? params.versionDayKeys.has(dateKey)
			: params.versionMode === "version";
		const isManualEmployeeEdit =
			shouldVersionDay && params.manualEditDayKeys?.has(dateKey) === true;
		const persistedLineMetadata = isManualEmployeeEdit
			? {
					...timesheetLineMetadata,
					revision: {
						...(timesheetLineMetadata as any).revision,
						source: "EMPLOYEE_MANUAL_EDIT",
					},
				}
			: timesheetLineMetadata;
		await writeEffectiveTimesheetLine(prisma, {
			organizationId: params.organizationId,
			timesheetId: params.timesheetId,
			date,
			versionMode: shouldVersionDay ? "version" : "update",
			ledgerType: shouldVersionDay
				? params.ledgerType || "CORRECTION"
				: "SNAPSHOT",
			editedBy: params.editedBy || null,
			editReason: params.editReason || null,
			data: {
				organizationId: params.organizationId,
				employeeId: params.employeeId,
				payrollPeriodId: params.payrollPeriodId,
				timesheetId: params.timesheetId,
				attendanceId: attendance?.id || null,
				date,
				timeIn: day?.timeIn || attendance?.timeIn || null,
				timeBreak: attendance?.timeBreak || null,
				timeOut: day?.timeOut || attendance?.timeOut || null,
				status: normalizeTimesheetLineStatus(day),
				behaviorFlags: Array.isArray(attendance?.behaviorFlags) ? attendance.behaviorFlags : [],
				scheduleSnapshot: (attendance?.scheduleSnapshot || metadata.scheduleSnapshot || null) as any,
				hoursWorked: day?.hoursWorked || attendance?.hoursWorked || "0:00",
				regularHours: day?.regularHours || attendance?.regularHours || "0:00",
				overtimeHours: day?.overtimeHours || attendance?.overtimeHours || "0:00",
				undertimeHours: day?.undertimeHours || attendance?.undertimeHours || "0:00",
				lateHours: day?.lateHours || attendance?.lateHours || "0:00",
				earlyOutHours: day?.earlyOutHours || attendance?.earlyOutHours || "0:00",
				breakMinutes,
				employeeNotes: day?.employeeNotes || null,
				approverNotes: day?.approverNotes || null,
				notes: day?.employeeNotes || attendance?.notes || null,
				metadata: persistedLineMetadata as any,
				primaryMarker: timesheetLineMetadata.primaryMarker || null,
				isManualEntry: Boolean(attendance?.isManualEntry),
				isVirtual: !attendance?.id,
				employeeCodeSnapshot: employee?.employeeId || null,
				employeeNameSnapshot: resolveEmployeeNameSnapshot(employee),
				departmentIdSnapshot: employee?.departmentId || null,
				departmentNameSnapshot: employee?.department?.name || null,
				reportToIdSnapshot: employee?.reportToId || null,
				workforceSourceSnapshot: employee?.workforceSource || null,
				agencyIdSnapshot: employee?.agencyId || null,
				dayLaborType: normalizeDayLaborType(day?.dayLaborType),
				isDeleted: false,
			},
		});
	}

	await (prisma as any).timesheetline.updateMany({
		where: {
			organizationId: params.organizationId,
			timesheetId: params.timesheetId,
			date: {
				notIn: [...activeDateKeys].map((dateKey) => new Date(`${dateKey}T00:00:00.000Z`)),
			},
			isDeleted: false,
			isEffective: true,
		},
		data: { isDeleted: true },
	});
}

/**
 * Generate a unique timesheet code
 * Format: YYYYMMDDTTTTTTTTTTT (Year + Month + Day + Timestamp milliseconds)
 * Example: 20260114173045123 (January 14, 2026 at 17:30:45.123)
 */
export async function generateUniqueTimesheetCode(
	prisma: PrismaClient,
	organizationId: string,
): Promise<string> {
	// Generate date prefix (YYYYMMDD)
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	const datePrefix = `${year}${month}${day}`;

	// Get timestamp in milliseconds
	const timestamp = Date.now();

	// Construct code: YYYYMMDD + timestamp
	const code = `${datePrefix}${timestamp}`;

	// Check if code already exists (very unlikely with millisecond precision)
	const existing = await prisma.timesheet.findUnique({
		where: { code },
		select: { id: true },
	});

	if (!existing) {
		return code;
	}

	// If by some chance it exists, add a random suffix
	const randomSuffix = Math.floor(Math.random() * 1000);
	return `${datePrefix}${timestamp}${randomSuffix}`;
}

/**
 * Validate timesheet code format
 * @param code - The timesheet code to validate
 * @returns true if valid format, false otherwise
 */
export function validateTimesheetCode(code: string): boolean {
	// Format: YYYYMMDDTTTTTTTTTTT (8 digits date + 13 digits timestamp)
	// Optional: can have additional random digits at the end
	const pattern = /^\d{8}\d{13}(\d{1,3})?$/;
	return pattern.test(code);
}

/**
 * Generate a timesheet for an employee based on attendance records
 * Can be called by various endpoints or seeders when timesheet needs to be created
 * @param prisma - Prisma client instance
 * @param employeeId - Employee ID
 * @param organizationId - Organization ID
 * @param date - Date to find payroll period for
 * @param notes - Optional notes for the timesheet
 * @param status - Status of the timesheet (default: SUBMITTED, can be APPROVED for seeder)
 * @returns Created timesheet with all relations
 */
export async function generateTimesheetForEmployee(
	prisma: PrismaClient,
	employeeId: string,
	organizationId: string,
	date: Date,
	notes?: string,
	status: "DRAFT" | "SUBMITTED" | "APPROVED" = "SUBMITTED",
) {
	// Find payroll period that contains the provided date
	// Normalize to partial day for inclusive date check
	const periodCheckDate = new Date(date);
	periodCheckDate.setUTCHours(0, 0, 0, 0);

	const payrollPeriod = await prisma.payrollPeriod.findFirst({
		where: {
			organizationId: organizationId,
			startDate: { lte: periodCheckDate },
			endDate: { gte: periodCheckDate },
			isDeleted: false,
		},
	});

	if (!payrollPeriod) {
		throw new Error(`No payroll period found for date ${date.toISOString().split("T")[0]}`);
	}

	// Check if timesheet already exists for this employee and period
	const existingTimesheet = await prisma.timesheet.findFirst({
		where: {
			organizationId: organizationId,
			employeeId: employeeId,
			payrollPeriodId: payrollPeriod.id,
			isDeleted: false,
		},
		include: {
			employee: {
				include: {
					person: true,
					position: true,
					department: true,
				},
			},
			attendances: true,
		},
	});

	if (existingTimesheet) {
		console.log(`      Timesheet already exists for this period, skipping...`);
		return existingTimesheet;
	}

	// Get employee with schedule
	const employee = await prisma.employee.findUnique({
		where: { id: employeeId },
	});

	if (!employee) {
		throw new Error("Employee not found");
	}

	// Set end date to current date (23:59:59.999), not the full period end
	const endDate = new Date();
	endDate.setHours(23, 59, 59, 999);

	// Use payroll period start and current date (not future)
	const actualEndDate = endDate < payrollPeriod.endDate ? endDate : payrollPeriod.endDate;
	const effectiveStartDate = getEffectiveEmploymentStartDate(employee);
	const timesheetStartDate = effectiveStartDate
		? effectiveStartDate > normalizeToStartOfDay(new Date(payrollPeriod.startDate))
			? effectiveStartDate
			: normalizeToStartOfDay(new Date(payrollPeriod.startDate))
		: normalizeToStartOfDay(new Date(payrollPeriod.startDate));

	const { fullAttendanceRecords, realAttendances } =
		await buildEffectiveTimesheetAttendanceRecords({
			prisma,
			employeeId,
			organizationId,
			startDate: timesheetStartDate,
			endDate: actualEndDate,
			seedNote: notes,
		});

	// Calculate summary and breakdown (using full records including absent/rest)
	const summary = generateTimesheetSummary(fullAttendanceRecords);
	const breakdown = generateDailyBreakdown(fullAttendanceRecords);

	// Generate unique timesheet code
	const code = await generateUniqueTimesheetCode(prisma, organizationId);

	// Create timesheet with specified status (DRAFT, SUBMITTED, or APPROVED)
	const timesheetData: any = {
		code,
		organizationId: organizationId,
		employeeId: employeeId,
		payrollPeriodId: payrollPeriod.id,
		status: status,
		...(notes && { notes }),
		totalDays: fullAttendanceRecords.length,
		...summary,
		attendances: {
			connect: realAttendances.map((a) => ({ id: a.id })),
		},
	};

	// Add submission info if status is SUBMITTED
	if (status === "SUBMITTED") {
		timesheetData.submittedAt = new Date();
		timesheetData.submittedBy = employeeId;
	}

	// Add approval info if status is APPROVED
	if (status === "APPROVED") {
		timesheetData.submittedAt = new Date();
		timesheetData.submittedBy = employeeId;
		timesheetData.approvalDate = new Date();
		timesheetData.approvedBy = employeeId; // Auto-approved by system
	}

	const timesheet = await prisma.timesheet.create({
		data: timesheetData,
		include: {
			employee: {
				include: {
					person: true,
					position: true,
					department: true,
				},
			},
			attendances: true,
		},
	});

	await syncTimesheetLinesFromBreakdown(prisma, {
		organizationId,
		employeeId,
		payrollPeriodId: payrollPeriod.id,
		timesheetId: timesheet.id,
		breakdown,
		attendances: realAttendances,
	});

	return timesheet;
}

const BUSINESS_TIME_ZONE = "Asia/Manila";

function getDateKeyInTimeZone(date: Date, timeZone: string = BUSINESS_TIME_ZONE): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);

	const year = parts.find((part) => part.type === "year")?.value ?? "0000";
	const month = parts.find((part) => part.type === "month")?.value ?? "01";
	const day = parts.find((part) => part.type === "day")?.value ?? "01";

	return `${year}-${month}-${day}`;
}

function getUtcDateKey(date: Date): string {
	return date.toISOString().split("T")[0];
}

function getDayNameFromDateKey(dateKey: string): string {
	const [year, month, day] = dateKey.split("-").map(Number);
	const utcMidday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
	return [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	][utcMidday.getUTCDay()];
}

function getNextDateKey(dateKey: string): string {
	const [year, month, day] = dateKey.split("-").map(Number);
	const utcMidday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
	utcMidday.setUTCDate(utcMidday.getUTCDate() + 1);
	return getDateKeyInTimeZone(utcMidday);
}

async function buildEffectiveTimesheetAttendanceRecords(params: {
	prisma: PrismaClient;
	employeeId: string;
	organizationId: string;
	startDate: Date;
	endDate: Date;
	seedNote?: string;
}) {
	const { prisma, employeeId, organizationId, startDate, endDate, seedNote } = params;
	const attendances = await getEffectiveAttendanceRecordsForRange(prisma, {
		organizationId,
		employeeId,
		startDate,
		endDate,
	});

	const attendanceMap = new Map<string, any>();
	attendances.forEach((attendance) => {
		if (attendance.date) {
			attendanceMap.set(getDateKeyInTimeZone(attendance.date), attendance);
		}
	});

	const fullAttendanceRecords: any[] = [];
	let dateKey = getDateKeyInTimeZone(startDate);
	const endKey = getDateKeyInTimeZone(endDate);
	const todayKey = getDateKeyInTimeZone(new Date());
	const useVirtualAwolForSeededTimesheets = (seedNote || "").startsWith("Auto-generated from ");

	while (dateKey <= endKey) {
		const existingAttendance = attendanceMap.get(dateKey);
		const baseDate = existingAttendance?.date || new Date(`${dateKey}T00:00:00.000Z`);
		if (existingAttendance) {
			fullAttendanceRecords.push(existingAttendance);
			dateKey = getNextDateKey(dateKey);
			continue;
		}

		const resolvedShift = await resolveEffectiveShift(prisma, {
			organizationId,
			employeeId,
			date: baseDate,
		});
		if (!resolvedShift) {
			dateKey = getNextDateKey(dateKey);
			continue;
		}

		if (resolvedShift.isOff) {
			fullAttendanceRecords.push({
				id: `rest-${dateKey}`,
				date: baseDate,
				timeIn: null,
				timeOut: null,
				status: "REST_DAY",
				scheduleSnapshot: resolvedShift,
				notes: null,
			});
		} else {
			const virtualStatus =
				dateKey === todayKey
					? "NOT_CLOCKED_IN"
					: useVirtualAwolForSeededTimesheets
						? "AWOL"
						: "ABSENT";
			fullAttendanceRecords.push({
				id: `${virtualStatus === "NOT_CLOCKED_IN" ? "pending" : "absent"}-${dateKey}`,
				date: baseDate,
				timeIn: null,
				timeOut: null,
				status: virtualStatus,
				scheduleSnapshot: resolvedShift,
				notes: null,
			});
		}

		dateKey = getNextDateKey(dateKey);
	}

	const realAttendances = fullAttendanceRecords.filter(
		(attendance) =>
			typeof attendance?.id === "string" &&
			!attendance.id.startsWith("absent-") &&
			!attendance.id.startsWith("pending-") &&
			!attendance.id.startsWith("rest-"),
	);

	return {
		fullAttendanceRecords,
		realAttendances,
	};
}

export async function refreshTimesheetForAttendanceDate(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeId: string;
		date: Date;
	},
) {
	const { organizationId, employeeId, date } = params;
	const payrollPeriodId = await resolvePayrollPeriodIdForAttendanceDate(
		prisma,
		organizationId,
		date,
	);
	if (!payrollPeriodId) return null;

	return refreshTimesheetForPayrollPeriodSnapshot(prisma, {
		organizationId,
		employeeId,
		payrollPeriodId,
	});
}

export async function refreshTimesheetForPayrollPeriodSnapshot(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeId: string;
		payrollPeriodId: string;
	},
) {
	const { organizationId, employeeId, payrollPeriodId } = params;

	const existingTimesheet = await prisma.timesheet.findFirst({
		where: {
			organizationId,
			employeeId,
			payrollPeriodId,
			isDeleted: false,
		},
		select: {
			id: true,
			status: true,
			notes: true,
			metadata: true,
			approvedBy: true,
			lockedAt: true,
			lockedEmployeePayrollId: true,
			payrollPeriodId: true,
			payrollPeriod: {
				select: {
					id: true,
					startDate: true,
					endDate: true,
				},
			},
		},
	});

	if (!existingTimesheet) {
		const payrollPeriod = await prisma.payrollPeriod.findFirst({
			where: {
				id: payrollPeriodId,
				organizationId,
				isDeleted: false,
				status: "OPEN",
			},
			select: {
				id: true,
				startDate: true,
				endDate: true,
			},
		});

		if (!payrollPeriod) return null;

		return buildTimesheetForPayrollPeriod(
			prisma,
			employeeId,
			organizationId,
			payrollPeriod,
			"Created from attendance event",
			"DRAFT",
		);
	}

	if (!existingTimesheet.payrollPeriod) return null;

	// Manual manager-approved snapshots stay frozen; auto-approved sheets stay
	// live until payroll locks them so attendance keeps reflecting per employee.
	if (!isTimesheetSystemRefreshAllowed(existingTimesheet)) {
		return {
			...existingTimesheet,
			refreshSkipped: true,
			refreshSkipReason: "TIMESHEET_SNAPSHOT_LOCKED",
		};
	}

	const employee = await prisma.employee.findUnique({
		where: { id: employeeId },
	});
	if (!employee) return null;

	const periodStartKey = getUtcDateKey(existingTimesheet.payrollPeriod.startDate);
	const periodEndKey = getUtcDateKey(existingTimesheet.payrollPeriod.endDate);
	const effectiveStartDate = getEffectiveEmploymentStartDate(employee);
	const effectiveStartKey = effectiveStartDate
		? getDateKeyInTimeZone(effectiveStartDate)
		: periodStartKey;
	const timesheetStartKey =
		effectiveStartKey > periodStartKey ? effectiveStartKey : periodStartKey;

	// Persist fresh lines across the whole period so Timesheetline rows (the
	// payroll/day-report source) match current obligations, not a stale
	// snapshot. Auto-approved sheets rebuild; manual drafts merge.
	const persistedLines = await materializeTimesheetLinesFromObligations(prisma, {
		organizationId,
		employeeId,
		payrollPeriodId,
		timesheetId: existingTimesheet.id,
		fromDate: new Date(`${timesheetStartKey}T00:00:00.000Z`),
		toDate: new Date(`${periodEndKey}T00:00:00.000Z`),
		forceRefreshLines: isTimesheetSystemAutoApproved(existingTimesheet),
	});

	const updatedTimesheet = await prisma.timesheet.findFirst({
		where: { id: existingTimesheet.id },
	});
	if (!updatedTimesheet) return null;
	(updatedTimesheet as any).breakdown = buildBreakdownFromTimesheetLines(persistedLines as any);
	return updatedTimesheet;
}

async function ensurePeriodDraftsAndTodayLinesWithPrisma(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		payrollPeriodId: string;
		actorEmployeeId?: string | null;
		employeeIds?: string[];
		limit: number;
		payFrequency?: string | null;
		payrollPeriodStartDate: Date;
		payrollPeriodEndDate: Date;
		todayDate: Date;
	},
) {
	const {
		organizationId,
		payrollPeriodId,
		actorEmployeeId,
		payFrequency,
		payrollPeriodStartDate,
		payrollPeriodEndDate,
		todayDate,
	} = params;
	const limit = Math.min(Math.max(Math.floor(params.limit || 250), 1), 5000);
	const employeeIds = Array.from(new Set((params.employeeIds || []).filter(Boolean)));
	const eligibilityOr: any[] = [
		{
			employmentStatus: { in: ["ACTIVE", "ONBOARDING"] },
			...(payFrequency ? { payFrequency } : {}),
			OR: [
				{ employmentStartDate: null },
				{ employmentStartDate: { lte: payrollPeriodEndDate } },
			],
		},
	];
	if (actorEmployeeId) {
		eligibilityOr.push({ id: actorEmployeeId });
	}

	const eligibleEmployees = await prisma.employee.findMany({
		where: {
			organizationId,
			isDeleted: false,
			...(employeeIds.length ? { id: { in: employeeIds } } : {}),
			OR: eligibilityOr,
		},
		select: {
			id: true,
		},
		orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
	});
	const eligibleEmployeeIds = eligibleEmployees.map((employee) => employee.id);
	const existingTimesheets = eligibleEmployeeIds.length
		? await prisma.timesheet.findMany({
				where: {
					organizationId,
					payrollPeriodId,
					employeeId: { in: eligibleEmployeeIds },
					isDeleted: false,
				},
				select: {
					id: true,
					employeeId: true,
				},
			})
		: [];
	const existingEmployeeIds = new Set(existingTimesheets.map((timesheet) => timesheet.employeeId));
	const missingEmployees = eligibleEmployees.filter(
		(employee) => !existingEmployeeIds.has(employee.id),
	);
	const createBatch = missingEmployees.slice(0, limit);
	const codePrefix = `${todayDate.toISOString().slice(0, 10).replace(/-/g, "")}${Date.now()}`;

	if (createBatch.length > 0) {
		await prisma.timesheet.createMany({
			data: createBatch.map((employee) => ({
				code: `${codePrefix}-${employee.id}`,
				organizationId,
				employeeId: employee.id,
				payrollPeriodId,
				totalDays: 0,
				totalHoursWorked: "0:00",
				totalRegularHours: "0:00",
				totalOvertimeHours: "0:00",
				totalUndertimeHours: "0:00",
				totalLateHours: "0:00",
				totalEarlyOutHours: "0:00",
				status: "DRAFT" as const,
				notes: "Prepared draft for active payroll period",
				editPermissionStatus: "NONE" as const,
				isDeleted: false,
			})),
			skipDuplicates: true,
		});
	}

	await ensureAttendanceObligationsForPayrollPeriod(prisma, {
		organizationId,
		payrollPeriodId,
	});

	const periodStartDate = normalizeToStartOfDay(new Date(payrollPeriodStartDate));
	const periodEndDate = new Date(payrollPeriodEndDate);
	const fullRangeToDate = periodEndDate < todayDate ? periodEndDate : todayDate;

	// New drafts start with real attendance lines for the elapsed period so
	// each employee's timesheet reflects punches immediately — not an empty
	// shell waiting for a manual submission.
	let createdRefreshed = 0;
	if (createBatch.length > 0) {
		const createdTimesheets = await prisma.timesheet.findMany({
			where: {
				organizationId,
				payrollPeriodId,
				employeeId: { in: createBatch.map((employee) => employee.id) },
				isDeleted: false,
			},
			select: { id: true, employeeId: true },
		});
		for (const timesheet of createdTimesheets) {
			try {
				const lines = await materializeTimesheetLinesFromObligations(prisma, {
					organizationId,
					employeeId: timesheet.employeeId,
					payrollPeriodId,
					timesheetId: timesheet.id,
					fromDate: periodStartDate,
					toDate: fullRangeToDate,
					skipEnsureAttendanceObligations: true,
				});
				createdRefreshed += lines.length;
			} catch {
				// One employee's line build must not fail the whole batch.
			}
		}
	}

	const tomorrowDate = new Date(todayDate);
	tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
	const editableTimesheets = eligibleEmployeeIds.length
		? await prisma.timesheet.findMany({
				where: {
					organizationId,
					payrollPeriodId,
					employeeId: { in: eligibleEmployeeIds },
					status: { in: ["DRAFT", "REVISED", "REJECTED"] as any },
					isDeleted: false,
				},
				select: {
					id: true,
					employeeId: true,
				},
				orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
				take: limit,
			})
		: [];

	let refreshed = 0;
	for (const timesheet of editableTimesheets) {
		const existingTodayLine = await prisma.timesheetline.findFirst({
			where: {
				organizationId,
				payrollPeriodId,
				timesheetId: timesheet.id,
				date: {
					gte: todayDate,
					lt: tomorrowDate,
				},
				isDeleted: false,
			},
			select: { id: true },
		});
		if (existingTodayLine) continue;

		const lines = await materializeTimesheetLinesFromObligations(prisma, {
			organizationId,
			employeeId: timesheet.employeeId,
			payrollPeriodId,
			timesheetId: timesheet.id,
			fromDate: todayDate,
			toDate: todayDate,
			skipEnsureAttendanceObligations: true,
		});
		refreshed += lines.length;
	}

	return {
		eligibleEmployees: eligibleEmployees.length,
		existing: existingEmployeeIds.size,
		created: createBatch.length,
		refreshed: refreshed + createdRefreshed,
		missingEmployees: createBatch.length,
		remainingDraftsToPrepare: missingEmployees.length > limit ? null : 0,
		createLimit: limit,
		errors: [] as Array<{ employeeId: string; message: string }>,
	};
}

export async function ensurePeriodDraftsAndTodayLinesFromAggregate(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		payrollPeriodId: string;
		actorEmployeeId?: string | null;
		employeeIds?: string[];
		limit: number;
	},
) {
	const { organizationId, payrollPeriodId, actorEmployeeId } = params;
	const limit = Math.min(Math.max(Math.floor(params.limit || 250), 1), 5000);
	const payrollPeriod = await prisma.payrollPeriod.findFirst({
		where: {
			id: payrollPeriodId,
			organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			payFrequency: true,
			startDate: true,
			endDate: true,
		},
	});

	if (!payrollPeriod) {
		throw new Error("PAYROLL_PERIOD_NOT_FOUND");
	}

	const payFrequency = payrollPeriod.payFrequency;
	const todayKey = getDateKeyInTimeZone(new Date());
	const todayDate = new Date(`${todayKey}T00:00:00.000Z`);
	return ensurePeriodDraftsAndTodayLinesWithPrisma(prisma, {
		organizationId,
		payrollPeriodId,
		actorEmployeeId,
		employeeIds: params.employeeIds,
		limit,
		payFrequency,
		payrollPeriodStartDate: payrollPeriod.startDate,
		payrollPeriodEndDate: payrollPeriod.endDate,
		todayDate,
	});
}

export type CurrentPeriodRepairOptions = {
	repairAttendanceObligations?: boolean;
	repairDraftTimesheets?: boolean;
	includeEmployeesMissingSchedules?: boolean;
	showSampleRows?: boolean;
};

export async function repairCurrentPeriodAttendanceTimesheetCoverage(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		actorEmployeeId?: string | null;
		dryRun?: boolean;
		options?: CurrentPeriodRepairOptions;
	},
) {
	const dryRun = params.dryRun !== false;
	const options = {
		repairAttendanceObligations: params.options?.repairAttendanceObligations !== false,
		repairDraftTimesheets: params.options?.repairDraftTimesheets !== false,
		includeEmployeesMissingSchedules:
			params.options?.includeEmployeesMissingSchedules === true,
		showSampleRows: params.options?.showSampleRows !== false,
	};
	const todayKey = getDateKeyInTimeZone(new Date());
	const todayDate = new Date(`${todayKey}T00:00:00.000Z`);
	const payrollPeriod = await prisma.payrollPeriod.findFirst({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			status: "OPEN",
			startDate: { lte: todayDate },
			endDate: { gte: todayDate },
		},
		select: {
			id: true,
			code: true,
			name: true,
			status: true,
			startDate: true,
			endDate: true,
			payDate: true,
			payFrequency: true,
		},
		orderBy: [{ startDate: "desc" }, { id: "asc" }],
	});

	if (!payrollPeriod) {
		throw new Error("CURRENT_OPEN_PAYROLL_PERIOD_NOT_FOUND");
	}

	const eligibleEmployees = await prisma.employee.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			employmentStatus: { in: ["ACTIVE", "ONBOARDING"] as any },
			...(payrollPeriod.payFrequency ? { payFrequency: payrollPeriod.payFrequency } : {}),
			OR: [
				{ employmentStartDate: null },
				{ employmentStartDate: { lte: payrollPeriod.endDate } },
			],
		},
		select: {
			id: true,
			employeeId: true,
			payFrequency: true,
			employmentStartDate: true,
			embeddedSchedule: true,
			person: { select: { personalInfo: true } },
		},
		orderBy: [{ employeeId: "asc" }, { id: "asc" }],
	});
	const eligibleEmployeeIds = eligibleEmployees.map((employee) => employee.id);
	const employeesMissingSchedules = eligibleEmployees.filter((employee) => !employee.embeddedSchedule);
	const obligationEligibleEmployees = options.includeEmployeesMissingSchedules
		? eligibleEmployees
		: eligibleEmployees.filter((employee) => employee.embeddedSchedule);
	const obligationEligibleEmployeeIds = new Set(
		obligationEligibleEmployees.map((employee) => employee.id),
	);

	const [existingTimesheets, obligationsBefore, paidPayrollRows] = await Promise.all([
		eligibleEmployeeIds.length
			? prisma.timesheet.findMany({
					where: {
						organizationId: params.organizationId,
						payrollPeriodId: payrollPeriod.id,
						employeeId: { in: eligibleEmployeeIds },
						isDeleted: false,
					},
					select: {
						id: true,
						employeeId: true,
						status: true,
						lockedAt: true,
						lockedEmployeePayrollId: true,
					},
				})
			: Promise.resolve([]),
		eligibleEmployeeIds.length
			? prisma.attendanceObligation.findMany({
					where: {
						organizationId: params.organizationId,
						payrollPeriodId: payrollPeriod.id,
						employeeId: { in: eligibleEmployeeIds },
						isDeleted: false,
					},
					select: {
						id: true,
						employeeId: true,
						businessDate: true,
					},
				})
			: Promise.resolve([]),
		eligibleEmployeeIds.length
			? prisma.employeePayroll.findMany({
					where: {
						organizationId: params.organizationId,
						payrollPeriodId: payrollPeriod.id,
						employeeId: { in: eligibleEmployeeIds },
						isPaid: true,
					},
					select: {
						id: true,
						employeeId: true,
						timesheetId: true,
					},
				})
			: Promise.resolve([]),
	]);

	const timesheetByEmployeeId = new Map(
		existingTimesheets.map((timesheet) => [timesheet.employeeId, timesheet]),
	);
	const existingDraftTimesheets = existingTimesheets.filter(
		(timesheet) => timesheet.status === "DRAFT",
	);
	const existingByStatus = existingTimesheets.reduce<Record<string, number>>((counts, timesheet) => {
		const status = String(timesheet.status || "UNKNOWN");
		counts[status] = (counts[status] || 0) + 1;
		return counts;
	}, {});
	const missingDraftEmployees = eligibleEmployees.filter(
		(employee) => !timesheetByEmployeeId.has(employee.id),
	);
	const lockedOrSnapshotEmployees = existingTimesheets.filter(
		(timesheet) =>
			timesheet.status !== "DRAFT" ||
			Boolean(timesheet.lockedAt) ||
			Boolean(timesheet.lockedEmployeePayrollId),
	);

	const obligationKeys = new Set(
		obligationsBefore.map((obligation) => `${obligation.employeeId}:${obligation.businessDate}`),
	);
	const missingObligationRows: Array<{ employeeId: string; businessDate: string }> = [];
	for (const employee of eligibleEmployees) {
		if (!obligationEligibleEmployeeIds.has(employee.id)) continue;
		const effectiveStartDate = getEffectiveEmploymentStartDate(employee as any);
		const periodStartKey = getUtcDateKey(payrollPeriod.startDate);
		const employeeStartKey = effectiveStartDate
			? getDateKeyInTimeZone(effectiveStartDate)
			: periodStartKey;
		let cursor = new Date(`${employeeStartKey > periodStartKey ? employeeStartKey : periodStartKey}T00:00:00.000Z`);
		const end = new Date(`${getUtcDateKey(payrollPeriod.endDate)}T00:00:00.000Z`);
		while (cursor <= end) {
			const businessDate = getUtcDateKey(cursor);
			if (!obligationKeys.has(`${employee.id}:${businessDate}`)) {
				missingObligationRows.push({ employeeId: employee.id, businessDate });
			}
			cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
		}
	}

	let obligationsResult: Awaited<ReturnType<typeof ensureAttendanceObligationsForPayrollPeriod>> | null =
		null;
	let obligationsAfterCount = obligationsBefore.length;
	let draftsCreated = 0;

	if (!dryRun && options.repairAttendanceObligations) {
		obligationsResult = await ensureAttendanceObligationsForPayrollPeriod(prisma, {
			organizationId: params.organizationId,
			payrollPeriodId: payrollPeriod.id,
		});
		obligationsAfterCount = await prisma.attendanceObligation.count({
			where: {
				organizationId: params.organizationId,
				payrollPeriodId: payrollPeriod.id,
				isDeleted: false,
			},
		});
	}

	if (!dryRun && options.repairDraftTimesheets && missingDraftEmployees.length > 0) {
		const codePrefix = `${todayKey.replace(/-/g, "")}${Date.now()}`;
		await prisma.timesheet.createMany({
			data: missingDraftEmployees.map((employee) => ({
				code: `${codePrefix}-${employee.id}`,
				organizationId: params.organizationId,
				employeeId: employee.id,
				payrollPeriodId: payrollPeriod.id,
				totalDays: 0,
				totalHoursWorked: "0:00",
				totalRegularHours: "0:00",
				totalOvertimeHours: "0:00",
				totalUndertimeHours: "0:00",
				totalLateHours: "0:00",
				totalEarlyOutHours: "0:00",
				status: "DRAFT" as const,
				notes: "Prepared by admin current-period repair",
				editPermissionStatus: "NONE" as const,
				isDeleted: false,
			})),
			skipDuplicates: true,
		});
		draftsCreated = missingDraftEmployees.length;
	}

	const formatEmployee = (employee: (typeof eligibleEmployees)[number]) => {
		const personalInfo =
			employee.person?.personalInfo &&
			typeof employee.person.personalInfo === "object" &&
			!Array.isArray(employee.person.personalInfo)
				? (employee.person.personalInfo as Record<string, unknown>)
				: {};
		return {
			id: employee.id,
			employeeId: employee.employeeId,
			name: [personalInfo.firstName, personalInfo.lastName].filter(Boolean).join(" ") || null,
			payFrequency: employee.payFrequency,
			hasSchedule: Boolean(employee.embeddedSchedule),
		};
	};

	return {
		dryRun,
		options,
		payrollPeriod: {
			id: payrollPeriod.id,
			code: payrollPeriod.code,
			name: payrollPeriod.name,
			status: payrollPeriod.status,
			startDate: getUtcDateKey(payrollPeriod.startDate),
			endDate: getUtcDateKey(payrollPeriod.endDate),
			payDate: getUtcDateKey(payrollPeriod.payDate),
			payFrequency: payrollPeriod.payFrequency,
		},
		employees: {
			checked: eligibleEmployees.length,
			activeEligible: eligibleEmployees.length,
			withSchedules: eligibleEmployees.length - employeesMissingSchedules.length,
			missingSchedules: employeesMissingSchedules.length,
			sampleMissingSchedules: options.showSampleRows
				? employeesMissingSchedules.slice(0, 10).map(formatEmployee)
				: [],
		},
		attendanceObligations: {
			checkedEmployees: obligationEligibleEmployees.length,
			existingBefore: obligationsBefore.length,
			existingAfter: obligationsAfterCount,
			missing: missingObligationRows.length,
			stale: 0,
			wouldRepair: dryRun && options.repairAttendanceObligations ? missingObligationRows.length : 0,
			repaired: obligationsResult?.touched || 0,
			repairResult: obligationsResult,
			sampleMissingRows: options.showSampleRows
				? missingObligationRows.slice(0, 10).map((row) => {
						const employee = eligibleEmployees.find((item) => item.id === row.employeeId);
						return { ...row, employee: employee ? formatEmployee(employee) : null };
					})
				: [],
		},
		timesheets: {
			existing: existingTimesheets.length,
			existingDrafts: existingDraftTimesheets.length,
			existingByStatus,
			missingDrafts: missingDraftEmployees.length,
			wouldCreateDrafts: dryRun && options.repairDraftTimesheets ? missingDraftEmployees.length : 0,
			createdDrafts: draftsCreated,
			skippedNonDraftOrLocked: lockedOrSnapshotEmployees.length,
			paidPayrollRows: paidPayrollRows.length,
			sampleMissingDraftEmployees: options.showSampleRows
				? missingDraftEmployees.slice(0, 10).map(formatEmployee)
				: [],
		},
		skipped: {
			employeesMissingSchedules: employeesMissingSchedules.length,
			nonDraftOrLockedTimesheets: lockedOrSnapshotEmployees.length,
			paidPayrollRows: paidPayrollRows.length,
			reasons: [
				...(employeesMissingSchedules.length
					? ["MISSING_SCHEDULE_FOR_ATTENDANCE_OBLIGATION"]
					: []),
				...(lockedOrSnapshotEmployees.length
					? ["EXISTING_TIMESHEET_NOT_DRAFT_OR_LOCKED"]
					: []),
				...(paidPayrollRows.length ? ["PAID_PAYROLL_ROWS_NOT_MUTATED"] : []),
			],
		},
	};
}

export async function buildTimesheetForPayrollPeriod(
	prisma: PrismaClient,
	employeeId: string,
	organizationId: string,
	payrollPeriod: {
		id: string;
		startDate: Date;
		endDate: Date;
	},
	notes?: string,
	status: "DRAFT" | "SUBMITTED" | "APPROVED" = "SUBMITTED",
) {
	const existingTimesheet = await prisma.timesheet.findFirst({
		where: {
			organizationId,
			employeeId,
			payrollPeriodId: payrollPeriod.id,
			isDeleted: false,
		},
		include: {
			employee: {
				include: {
					person: true,
					position: true,
					department: true,
				},
			},
			attendances: true,
		},
	});

	if (existingTimesheet) {
		return existingTimesheet;
	}

	const employee = await prisma.employee.findUnique({
		where: { id: employeeId },
	});

	if (!employee) {
		throw new Error("Employee not found");
	}

	const todayKey = getDateKeyInTimeZone(new Date());
	// Payroll period boundaries are authoritative calendar cutoffs (UTC date-only),
	// so avoid timezone-shifting endDate into the next day.
	const periodEndKey = getUtcDateKey(payrollPeriod.endDate);
	const actualEndDate =
		periodEndKey <= todayKey
			? payrollPeriod.endDate
			: new Date(Math.min(Date.now(), payrollPeriod.endDate.getTime()));
	const effectiveStartDate = getEffectiveEmploymentStartDate(employee);
	const periodStartKey = getUtcDateKey(payrollPeriod.startDate);
	const effectiveStartKey = effectiveStartDate
		? getDateKeyInTimeZone(effectiveStartDate)
		: periodStartKey;
	const timesheetStartKey =
		effectiveStartKey > periodStartKey ? effectiveStartKey : periodStartKey;
	const timesheetStartDate = new Date(`${timesheetStartKey}T00:00:00.000Z`);
	await ensureAttendanceObligationsForPayrollPeriod(prisma, {
		organizationId,
		payrollPeriodId: payrollPeriod.id,
		employeeId,
	});

	const { fullAttendanceRecords, realAttendances } =
		await buildEffectiveTimesheetAttendanceRecords({
			prisma,
			employeeId,
			organizationId,
			startDate: timesheetStartDate,
			endDate: actualEndDate,
			seedNote: notes,
		});

	const summary = generateTimesheetSummary(fullAttendanceRecords);
	const breakdown = generateDailyBreakdown(fullAttendanceRecords);
	const code = await generateUniqueTimesheetCode(prisma, organizationId);

	const timesheetData: any = {
		code,
		organizationId,
		employeeId,
		payrollPeriodId: payrollPeriod.id,
		status,
		...(notes && { notes }),
		totalDays: fullAttendanceRecords.length,
		...summary,
		attendances: {
			connect: realAttendances.map((attendance) => ({ id: attendance.id })),
		},
	};

	if (status === "SUBMITTED") {
		timesheetData.submittedAt = new Date();
		timesheetData.submittedBy = employeeId;
	}

	if (status === "APPROVED") {
		timesheetData.submittedAt = new Date();
		timesheetData.submittedBy = employeeId;
		timesheetData.approvalDate = new Date();
		timesheetData.approvedBy = employeeId;
	}

	const timesheet = await prisma.timesheet.create({
		data: timesheetData,
		include: {
			employee: {
				include: {
					person: true,
					position: true,
					department: true,
				},
			},
			attendances: true,
		},
	});

	if (status !== "DRAFT") {
		await materializeTimesheetLinesFromObligations(prisma, {
			organizationId,
			employeeId,
			payrollPeriodId: payrollPeriod.id,
			timesheetId: timesheet.id,
			fromDate: timesheetStartDate,
			toDate: actualEndDate,
		});
	}

	return timesheet;
}

export interface PayrollAutoApproveEnsureOptions {
	actorEmployeeId?: string | null;
	employeeIds?: string[];
	departmentId?: string | null;
	sectionId?: string | null;
	limit?: number;
}

export interface PayrollAutoApproveEnsureResult {
	payrollPeriodId: string;
	eligibleEmployees: number;
	created: number;
	autoApproved: number;
	refreshedLines: number;
	preservedManual: number;
	skippedLocked: number;
	skippedPaid: number;
	skippedRefresh: number;
	remainingToPrepare: number | null;
	createLimit: number;
	errors: Array<{ employeeId: string; message: string }>;
}

/**
 * System auto-approval ensure lane (2026-09-04, operator directive: no more
 * employee-submit → manager-approve step).
 *
 * Guarantees every eligible employee owns an APPROVED timesheet whose lines
 * reflect current AttendanceObligation truth, so payroll can be generated at
 * any time without waiting for manual submission or approval:
 *
 * - missing → create + full-period materialize + system auto-approve
 * - DRAFT / SUBMITTED / REVISED / REJECTED → full-period materialize + system
 *   auto-approve (legacy manual-queue rows convert automatically)
 * - APPROVED + system auto-approved → rebuild lines from current obligations
 *   (fresh punches keep reflecting until payroll locks the sheet)
 * - APPROVED + manual manager approval → preserved untouched
 * - locked / paid-payroll sheets → never mutated
 */
export async function ensurePayrollPeriodTimesheetsAutoApproved(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		payrollPeriodId: string;
		actorEmployeeId?: string | null;
		employeeIds?: string[];
		departmentId?: string | null;
		sectionId?: string | null;
		limit?: number;
		/**
		 * Payroll-generate lane: creates/upgrades still run (finite coverage
		 * work), but pure refresh of already-approved sheets is skipped.
		 * Refresh is perpetual maintenance owned by live hooks and the
		 * explicit ensure endpoint — running it inside every generate would
		 * rebuild the whole fleet's lines before a single peso computes.
		 */
		skipRefresh?: boolean;
	},
): Promise<PayrollAutoApproveEnsureResult> {
	const { organizationId, payrollPeriodId, actorEmployeeId } = params;
	const limit = Math.min(Math.max(Math.floor(params.limit || 250), 1), 5000);
	const employeeIds = Array.from(new Set((params.employeeIds || []).filter(Boolean)));
	const departmentId =
		typeof params.departmentId === "string" && params.departmentId.trim() !== "" &&
		params.departmentId !== "all"
			? params.departmentId.trim()
			: null;
	const sectionId =
		typeof params.sectionId === "string" && params.sectionId.trim() !== "" &&
		params.sectionId !== "all"
			? params.sectionId.trim()
			: null;

	const payrollPeriod = await prisma.payrollPeriod.findFirst({
		where: { id: payrollPeriodId, organizationId, isDeleted: false },
		select: { id: true, startDate: true, endDate: true, payFrequency: true },
	});
	if (!payrollPeriod) {
		throw new Error("PAYROLL_PERIOD_NOT_FOUND");
	}

	const eligibilityOr: any[] = [
		{
			employmentStatus: { in: ["ACTIVE", "ONBOARDING"] },
			...(payrollPeriod.payFrequency ? { payFrequency: payrollPeriod.payFrequency } : {}),
			OR: [
				{ employmentStartDate: null },
				{ employmentStartDate: { lte: payrollPeriod.endDate } },
			],
		},
	];
	if (actorEmployeeId) {
		eligibilityOr.push({ id: actorEmployeeId });
	}

	const eligibleEmployees = await prisma.employee.findMany({
		where: {
			organizationId,
			isDeleted: false,
			...(employeeIds.length ? { id: { in: employeeIds } } : {}),
			...(departmentId ? { departmentId } : {}),
			...(sectionId ? { sectionId } : {}),
			OR: eligibilityOr,
		},
		select: {
			id: true,
			employmentStartDate: true,
			employmentHireDate: true,
			embeddedSchedule: true,
		},
		orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
	});
	const eligibleEmployeeIds = eligibleEmployees.map((employee) => employee.id);
	const hireStartByEmployeeId = new Map(
		eligibleEmployees.map((employee) => {
			try {
				return [employee.id, getEffectiveEmploymentStartDate(employee as any)] as const;
			} catch {
				return [employee.id, null] as const;
			}
		}),
	);

	const [existingTimesheets, paidPayrollRows] = await Promise.all([
		eligibleEmployeeIds.length
			? prisma.timesheet.findMany({
					where: {
						organizationId,
						payrollPeriodId,
						employeeId: { in: eligibleEmployeeIds },
						isDeleted: false,
					},
					select: {
						id: true,
						employeeId: true,
						status: true,
						metadata: true,
						approvedBy: true,
						lockedAt: true,
						lockedEmployeePayrollId: true,
					},
				})
			: Promise.resolve([]),
		eligibleEmployeeIds.length
			? prisma.employeePayroll.findMany({
					where: {
						organizationId,
						payrollPeriodId,
						employeeId: { in: eligibleEmployeeIds },
						isPaid: true,
					},
					select: { employeeId: true },
				})
			: Promise.resolve([]),
	]);
	const paidEmployeeIds = new Set(paidPayrollRows.map((row) => row.employeeId));
	const timesheetByEmployeeId = new Map(
		existingTimesheets.map((timesheet) => [timesheet.employeeId, timesheet]),
	);

	// Attendance-signal prefilter (fleet backfill guard): employees with no
	// schedule, no override, and no punches in the window have nothing to
	// materialize — they auto-approve empty instead of paying for a full
	// obligation recompute each. Schedule presence is checked in JS like the
	// current-period repair flow; overrides/punches are two grouped queries
	// regardless of fleet size.
	const [overrideEmployeeRows, punchedEmployeeRows] = await Promise.all([
		eligibleEmployeeIds.length
			? (prisma as any).scheduleOverride.findMany({
					where: {
						organizationId,
						employeeId: { in: eligibleEmployeeIds },
						date: { gte: payrollPeriod.startDate, lte: payrollPeriod.endDate },
						isDeleted: false,
					},
					select: { employeeId: true },
				})
			: Promise.resolve([]),
		eligibleEmployeeIds.length
			? (prisma as any).attendance.findMany({
					where: {
						organizationId,
						employeeId: { in: eligibleEmployeeIds },
						date: { gte: payrollPeriod.startDate, lte: payrollPeriod.endDate },
						isDeleted: false,
					},
					select: { employeeId: true },
				})
			: Promise.resolve([]),
	]);
	const attendanceSignalEmployeeIds = new Set<string>([
		...eligibleEmployees.filter((employee) => (employee as any).embeddedSchedule).map((employee) => employee.id),
		...overrideEmployeeRows.map((row: any) => row.employeeId),
		...punchedEmployeeRows.map((row: any) => row.employeeId),
	]);

	// Live hooks (clock-in/out, leave approval, schedule/holiday changes) own
	// AttendanceObligation freshness day-to-day; a full-period recompute across
	// thousands of employees exceeds the heavy-request budget (proven >300s on
	// DEV). Rebuild obligations only when the employee has none for the
	// period. Note: the create path below is already covered — building a new
	// sheet ensures that employee's obligations internally.
	const ensureObligationsIfMissing = async (employeeId: string) => {
		const existingCount = await (prisma as any).attendanceObligation.count({
			where: {
				organizationId,
				employeeId,
				payrollPeriodId,
				isDeleted: false,
			},
		});
		if (existingCount) return;
		try {
			await ensureAttendanceObligationsForPayrollPeriod(prisma, {
				organizationId,
				payrollPeriodId,
				employeeId,
			});
		} catch {
			// One employee's obligation rebuild must not fail the batch.
		}
	};

	const periodStartKey = getUtcDateKey(payrollPeriod.startDate);
	const periodEndDate = new Date(`${getUtcDateKey(payrollPeriod.endDate)}T00:00:00.000Z`);

	const result: PayrollAutoApproveEnsureResult = {
		payrollPeriodId,
		eligibleEmployees: eligibleEmployees.length,
		created: 0,
		autoApproved: 0,
		refreshedLines: 0,
		preservedManual: 0,
		skippedLocked: 0,
		skippedPaid: 0,
		skippedRefresh: 0,
		remainingToPrepare: 0,
		createLimit: limit,
		errors: [],
	};

	const applyAutoApproval = async (timesheetId: string) => {
		const current = await prisma.timesheet.findFirst({
			where: { id: timesheetId },
			select: { metadata: true },
		});
		const patch = buildTimesheetAutoApprovalPatch(
			readTimesheetMetadata((current as any)?.metadata),
			new Date(),
		);
		await prisma.timesheet.update({
			where: { id: timesheetId },
			data: {
				...patch,
				submittedAt: new Date(),
			},
		});
	};

	const materializeFullPeriod = async (employeeId: string, timesheetId: string, force: boolean) => {
		const hireStart = hireStartByEmployeeId.get(employeeId);
		const hireKey = hireStart ? getDateKeyInTimeZone(hireStart) : periodStartKey;
		const fromKey = hireKey > periodStartKey ? hireKey : periodStartKey;
		return materializeTimesheetLinesFromObligations(prisma, {
			organizationId,
			employeeId,
			payrollPeriodId,
			timesheetId,
			fromDate: new Date(`${fromKey}T00:00:00.000Z`),
			toDate: periodEndDate,
			forceRefreshLines: force,
			skipEnsureAttendanceObligations: true,
		});
	};

	// Partition budgeted work first so the pool below runs independent
	// per-employee tasks. Creates stay sequential (millisecond codegen would
	// collide under concurrency); upgrades/refreshes run in a bounded pool.
	// Refresh work is repeatable maintenance: it is classified separately so
	// it can never starve finite create/upgrade work behind it, and
	// remainingToPrepare tracks unfinished creates/upgrades only.
	const ENSURE_POOL_SIZE = 5;
	type EnsureWorkItem = { employee: (typeof eligibleEmployees)[number]; action: "create" | "upgrade" | "refresh"; existing?: any };
	const stateChangingItems: EnsureWorkItem[] = [];
	const refreshItems: EnsureWorkItem[] = [];
	for (const employee of eligibleEmployees) {
		if (paidEmployeeIds.has(employee.id)) {
			result.skippedPaid += 1;
			continue;
		}
		const existing = timesheetByEmployeeId.get(employee.id);
		if (existing && (existing.lockedAt || existing.lockedEmployeePayrollId)) {
			result.skippedLocked += 1;
			continue;
		}
		const action = resolveTimesheetAutoApproveEnsureAction(existing || null);
		if (action === "preserve" || action === "skip") {
			if (action === "preserve") result.preservedManual += 1;
			else result.skippedLocked += 1;
			continue;
		}
		const item: EnsureWorkItem = {
			employee,
			action: action as "create" | "upgrade" | "refresh",
			existing,
		};
		if (action === "refresh") refreshItems.push(item);
		else stateChangingItems.push(item);
	}
	const budgetedStateChanging = stateChangingItems.slice(0, limit);
	const budgetedRefresh = params.skipRefresh
		? []
		: refreshItems.slice(0, Math.max(0, limit - budgetedStateChanging.length));
	if (params.skipRefresh) {
		result.skippedRefresh = refreshItems.length;
	}
	// remainingToPrepare tracks finite create/upgrade work only: refresh is
	// perpetual maintenance (event hooks keep auto-approved sheets live, and
	// payroll generate covers the rest), so pending refreshes must not hold
	// the HR loop open forever.
	result.remainingToPrepare = stateChangingItems.length > budgetedStateChanging.length ? null : 0;

	const runWorkItem = async (item: EnsureWorkItem) => {
		const { employee, action, existing } = item;
		try {
			// No-signal fast path: no schedule, no override, no punches in the
			// window means there is nothing to materialize. Missing sheets are
			// created approved-but-empty in one write; legacy drafts flip to
			// auto-approved; already-approved sheets need nothing.
			if (!attendanceSignalEmployeeIds.has(employee.id)) {
				if (action === "create") {
					const now = new Date();
					const patch = buildTimesheetAutoApprovalPatch({}, now);
					await prisma.timesheet.create({
						data: {
							code: await generateUniqueTimesheetCode(prisma, organizationId),
							organizationId,
							employeeId: employee.id,
							payrollPeriodId,
							totalDays: 0,
							totalHoursWorked: "0:00",
							totalRegularHours: "0:00",
							totalOvertimeHours: "0:00",
							totalUndertimeHours: "0:00",
							totalLateHours: "0:00",
							totalEarlyOutHours: "0:00",
							notes: "Auto-generated for payroll (system auto-approved)",
							editPermissionStatus: "NONE",
							isDeleted: false,
							submittedAt: now,
							submittedBy: employee.id,
							...patch,
						},
					});
					result.created += 1;
					result.autoApproved += 1;
				} else if (action === "upgrade") {
					await applyAutoApproval((existing as any).id);
					result.autoApproved += 1;
				}
				return;
			}
			if (action === "create") {
				let built: any;
				try {
					built = await buildTimesheetForPayrollPeriod(
						prisma,
						employee.id,
						organizationId,
						{
							id: payrollPeriod.id,
							startDate: payrollPeriod.startDate,
							endDate: payrollPeriod.endDate,
						},
						"Auto-generated for payroll (system auto-approved)",
						"DRAFT",
					);
				} catch (buildError: any) {
					// Idempotency for overlapping ensure runs (HR loop + payroll
					// worker): a unique-constraint collision means a concurrent
					// run just created the sheet — adopt it and continue as an
					// upgrade instead of failing.
					const collision = String(
						buildError?.code === "P2002" ? "P2002" : (buildError?.message || buildError || ""),
					);
					if (!collision.includes("P2002") && !collision.includes("Unique constraint failed")) {
						throw buildError;
					}
					built = await prisma.timesheet.findFirst({
						where: {
							organizationId,
							employeeId: employee.id,
							payrollPeriodId,
							isDeleted: false,
						},
					});
					if (!built) throw buildError;
				}
				const resolved = resolveTimesheetAutoApproveEnsureAction(built as any);
				if (resolved === "preserve" || resolved === "skip") {
					result.preservedManual += resolved === "preserve" ? 1 : 0;
					result.skippedLocked += resolved === "skip" ? 1 : 0;
					return;
				}
				const lines = await materializeFullPeriod(
					employee.id,
					(built as any).id,
					String((built as any).status || "").toUpperCase() === "APPROVED",
				);
				await applyAutoApproval((built as any).id);
				result.created += 1;
				result.autoApproved += 1;
				result.refreshedLines += lines.length;
			} else if (action === "upgrade") {
				await ensureObligationsIfMissing(employee.id);
				const lines = await materializeFullPeriod(employee.id, (existing as any).id, false);
				await applyAutoApproval((existing as any).id);
				result.autoApproved += 1;
				result.refreshedLines += lines.length;
			} else {
				// No-signal refresh skips the obligation recompute (nothing can
				// be built without schedule/override/punches); materialize
				// still runs so stale lines converge to current obligations.
				if (attendanceSignalEmployeeIds.has(employee.id)) {
					await ensureObligationsIfMissing(employee.id);
				}
				const lines = await materializeFullPeriod(employee.id, (existing as any).id, true);
				result.refreshedLines += lines.length;
			}
		} catch (error: any) {
			result.errors.push({
				employeeId: employee.id,
				message: String(error?.message || error || "ensure failed"),
			});
		}
	};

	for (const item of budgetedStateChanging.filter((candidate) => candidate.action === "create")) {
		await runWorkItem(item);
	}
	const pooled = [
		...budgetedStateChanging.filter((candidate) => candidate.action !== "create"),
		...budgetedRefresh,
	];
	for (let start = 0; start < pooled.length; start += ENSURE_POOL_SIZE) {
		await Promise.all(pooled.slice(start, start + ENSURE_POOL_SIZE).map(runWorkItem));
	}

	return result;
}

export async function resolvePayrollPeriodIdForAttendanceDate(
	prisma: PrismaClient,
	organizationId: string,
	date: Date,
) {
	const targetDateKey = getDateKeyInTimeZone(date);
	const payrollPeriods = await prisma.payrollPeriod.findMany({
		where: {
			organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			startDate: true,
			endDate: true,
		},
		orderBy: {
			startDate: "desc",
		},
	});

	const matchedPeriod = payrollPeriods.find((period) => {
		const startKey = getUtcDateKey(period.startDate);
		const endKey = getUtcDateKey(period.endDate);
		return startKey <= targetDateKey && endKey >= targetDateKey;
	});

	return matchedPeriod?.id || null;
}

export async function generateTimesheetForPayrollPeriod(
	prisma: PrismaClient,
	employeeId: string,
	organizationId: string,
	payrollPeriodId: string,
	notes?: string,
	status: "DRAFT" | "SUBMITTED" | "APPROVED" = "SUBMITTED",
) {
	const payrollPeriod = await prisma.payrollPeriod.findFirst({
		where: {
			id: payrollPeriodId,
			organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			startDate: true,
			endDate: true,
		},
	});

	if (!payrollPeriod) {
		throw new Error(`Payroll period not found: ${payrollPeriodId}`);
	}

	return buildTimesheetForPayrollPeriod(
		prisma,
		employeeId,
		organizationId,
		payrollPeriod,
		notes,
		status,
	);
}

export async function ensureCurrentPayrollPeriodDraftTimesheet(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeId: string;
		date?: Date | string | null;
		notes?: string;
	},
) {
	const targetDate = toDateOnlyUtc(params.date || new Date());
	const payrollPeriod = await prisma.payrollPeriod.findFirst({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			status: "OPEN",
			startDate: { lte: targetDate },
			endDate: { gte: targetDate },
		},
		select: {
			id: true,
			startDate: true,
			endDate: true,
		},
		orderBy: [{ startDate: "desc" }, { id: "asc" }],
	});

	if (!payrollPeriod) return null;

	return buildTimesheetForPayrollPeriod(
		prisma,
		params.employeeId,
		params.organizationId,
		payrollPeriod,
		params.notes || "Created from employee post-action",
		"DRAFT",
	);
}
