// @ts-nocheck
/**
 * AttendanceObligation event map and source-of-truth boundary.
 *
 * This helper is the hard-cutover owner for live attendance-day truth:
 *
 * - AttendanceObligation = live operational truth for who is expected to work.
 * - Attendance = raw/effective clock ledger.
 * - Timesheetline = submitted/review/payroll day snapshot.
 * - EmployeePayroll.timesheetSnapshot = paid payroll snapshot.
 *
 * Stored statuses are intentionally small and durable:
 * EXPECTED, PRESENT, INCOMPLETE, LEAVE, REST_DAY, HOLIDAY, CANCELLED.
 *
 * Display-only statuses are derived from EXPECTED plus business date:
 * - today: NOT_CLOCKED_IN
 * - past: ABSENT
 * - future: SCHEDULED
 *
 * HR attendance page contract:
 * - /hr/attendance reads live AttendanceObligation rows through the metrics helpers
 *   attendanceObligationDetailed, attendanceObligationSummary, and
 *   attendanceObligationTodayOpsSummary.
 * - The table uses attendanceObligationDetailed. The normal period stat cards use
 *   attendanceObligationSummary. The today operations cards use attendanceObligationTodayOpsSummary.
 * - It must not depend on draft Timesheetline rows just to show today's or this-period
 *   attendance. Timesheetline is only the submitted/review/payroll snapshot layer.
 * - Request/workflow events are therefore attendance events too: when leave approval,
 *   system-completion, cancellation, or an attendance-correction approval changes the effective
 *   working-day truth, the request controller must recompute/apply AttendanceObligation before
 *   any timesheet draft/snapshot concern.
 * - Any event that changes whether a person should work, why they should not work, or what
 *   effective clock/correction row applies must update/recompute AttendanceObligation first,
 *   so the HR attendance page sees the change immediately without waiting for a timesheet draft.
 *
 * Event hooks currently wired in the repo:
 * - PayrollPeriodOpened: payrollperiod.controller calls ensureAttendanceObligationsForPayrollPeriod.
 * - EmployeeActivated/EmployeeChanged/EmployeeImported: employee controllers/import/post-actions
 *   refresh open periods so new/changed active employees appear on /hr/attendance.
 * - ScheduleChanged: employeeSchedule and scheduleOverride controllers recompute affected ranges.
 * - HolidayChanged: calendar-item controller recomputes affected holiday ranges.
 * - LeaveApproved/LeaveSystemCompleted: request controller and shared request runtime recompute
 *   the leave date range into AttendanceObligation as stored status LEAVE. Normal controller
 *   approval also creates leave balance/calendar/attendance side effects. This obligation
 *   projection is what makes /hr/attendance table rows, totalOnLeave, and
 *   approvedLeaveTodayCount update quickly.
 * - LeaveCancelled: request cancellation recomputes the leave date range so affected obligations
 *   return to EXPECTED/PRESENT/REST_DAY/HOLIDAY from the current source of truth.
 * - AttendanceClockedIn/Out: attendance, import, and Hikvision paths call applyAttendanceToObligation.
 * - AttendanceCorrectionApproved/AttendanceCorrectionSystemCompleted/AttendanceCorrectionApplied:
 *   HR direct corrections and approved/system-completed correction requests create an effective
 *   Attendance ledger row, call applyAttendanceToObligation, and refresh editable timesheets.
 *   Submitted/approved snapshots are not silently rewritten.
 * - TimesheetSubmitted: timesheet paths materialize frozen Timesheetline rows from obligations.
 * - PayrollGenerated: payroll period helper marks related obligations PAID after payroll snapshotting.
 *
 * Seeder note:
 * The main Prisma seed skips today's raw Attendance rows, generates historical clock data, creates
 * draft/approved timesheets, and reaches this helper through timesheet generation/refresh. That leaves
 * today's live view backed by EXPECTED obligations, which display as NOT_CLOCKED_IN until a real clock
 * event updates the obligation.
 */
import { PrismaClient } from "../generated/prisma";
import {
	buildAttendanceEmployeeSnapshotFields,
	fetchAttendanceEmployeeSnapshotFields,
	getBusinessDayBounds,
	getDateKeyInBusinessTimeZone,
} from "./attendance.helper";
import { calculateTimekeeping, determineAttendanceStatus } from "./timekeeping.helper";
import {
	mergeOvertimeMetadata,
	resolveOvertimePolicyApplication,
} from "./overtime-approval.helper";
import { resolveEffectiveShift } from "./employee-schedule.helper";
import {
	buildTimesheetDaySnapshotMetadata,
	writeEffectiveTimesheetLine,
} from "./timesheet-line-version.helper";

export type AttendanceObligationStoredStatus =
	| "EXPECTED"
	| "PRESENT"
	| "INCOMPLETE"
	| "LEAVE"
	| "REST_DAY"
	| "HOLIDAY"
	| "CANCELLED";

export type AttendanceObligationDisplayStatus =
	| "NOT_CLOCKED_IN"
	| "ABSENT"
	| "SCHEDULED"
	| AttendanceObligationStoredStatus;

const BUSINESS_TIME_ZONE = "Asia/Manila";
const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;
const NON_WORK_STATUSES = new Set(["LEAVE", "REST_DAY", "HOLIDAY", "CANCELLED"]);
const LOCKED_OBLIGATION_PHASES = new Set(["PAID"]);
const APPROVED_LEAVE_STATES = ["APPROVED", "COMPLETED"];
const ATTENDANCE_ELIGIBLE_EMPLOYMENT_STATUSES = ["ACTIVE", "ONBOARDING"];
const FINAL_EMPLOYMENT_STATUSES = new Set([
	"TERMINATED",
	"RESIGNED",
	"FORMER_EMPLOYEE",
	"RETIRED",
	"OFFBOARDING",
]);

function toDateOnlyUtc(value: Date | string): Date {
	const parsed = value instanceof Date ? value : new Date(value);
	const key = Number.isNaN(parsed.getTime())
		? getDateKeyInBusinessTimeZone(new Date())
		: getDateKeyInBusinessTimeZone(parsed);
	return new Date(`${key}T00:00:00.000Z`);
}

function getNextDate(date: Date) {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + 1);
	return next;
}

function normalizeEndDate(date: Date | string) {
	const end = toDateOnlyUtc(date);
	end.setUTCHours(23, 59, 59, 999);
	return end;
}

function getExpectedDateTime(businessDate: string, time?: string | null): Date | null {
	if (!time) return null;
	const [hours, minutes] = String(time).split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
	const utcMs =
		Date.UTC(
			Number(businessDate.slice(0, 4)),
			Number(businessDate.slice(5, 7)) - 1,
			Number(businessDate.slice(8, 10)),
			hours,
			minutes,
			0,
			0,
		) -
		BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000;
	return new Date(utcMs);
}

function getScheduleFingerprint(scheduleSnapshot: any): string | null {
	scheduleSnapshot = unwrapJsonSetEnvelope(scheduleSnapshot);
	if (!scheduleSnapshot) return null;
	return [
		scheduleSnapshot.source,
		scheduleSnapshot.scheduleOverrideId,
		scheduleSnapshot.scheduleTemplateId,
		scheduleSnapshot.shiftTypeId,
		scheduleSnapshot.startTime,
		scheduleSnapshot.endTime,
		scheduleSnapshot.isOff ? "off" : "work",
	].filter(Boolean).join(":") || null;
}

function unwrapJsonSetEnvelope(value: any): any {
	if (
		value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		value.set &&
		typeof value.set === "object" &&
		!Array.isArray(value.set)
	) {
		return value.set;
	}
	return value;
}

function minutesToTimeString(minutes: number | null | undefined): string {
	const safeMinutes = Math.max(0, Number(minutes || 0));
	const hours = Math.floor(safeMinutes / 60);
	const remainder = safeMinutes % 60;
	return `${hours}:${String(remainder).padStart(2, "0")}`;
}

function timeStringToMinutes(value: unknown): number {
	const text = String(value || "0:00");
	const [hours, minutes] = text.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	return hours * 60 + minutes;
}

function isSameBusinessDate(left: Date | string, right: Date | string) {
	return getDateKeyInBusinessTimeZone(left instanceof Date ? left : new Date(left)) ===
		getDateKeyInBusinessTimeZone(right instanceof Date ? right : new Date(right));
}

export function getMeaningfulEmploymentTermination(employee: any): Date | null {
	if (!FINAL_EMPLOYMENT_STATUSES.has(String(employee?.employmentStatus || "").toUpperCase())) {
		return null;
	}
	const termination = employee?.employmentTerminationDate
		? toDateOnlyUtc(employee.employmentTerminationDate)
		: null;
	if (!termination || Number.isNaN(termination.getTime())) return null;
	if (termination.getUTCFullYear() <= 1971) return null;
	return termination;
}

async function getHolidayDateKeys(
	prisma: PrismaClient,
	organizationId: string,
	fromDate: Date,
	toDate: Date,
) {
	const rows = await (prisma as any).calendarItem.findMany({
		where: {
			organizationId,
			type: "HOLIDAY",
			status: "ACTIVE",
			startDate: { lte: normalizeEndDate(toDate) },
			endDate: { gte: toDateOnlyUtc(fromDate) },
		},
		select: { id: true, title: true, startDate: true, endDate: true },
	});
	const byDate = new Map<string, any[]>();
	for (const row of rows) {
		let cursor = toDateOnlyUtc(row.startDate);
		const end = toDateOnlyUtc(row.endDate);
		while (cursor <= end) {
			const key = getDateKeyInBusinessTimeZone(cursor);
			const existing = byDate.get(key) || [];
			existing.push({
				calendarItemId: row.id,
				title: row.title,
				startDate: row.startDate,
				endDate: row.endDate,
			});
			byDate.set(key, existing);
			cursor = getNextDate(cursor);
		}
	}
	return byDate;
}

async function getApprovedLeaveDateKeys(
	prisma: PrismaClient,
	organizationId: string,
	employeeIds: string[],
	fromDate: Date,
	toDate: Date,
) {
	const rows = employeeIds.length
		? await (prisma as any).request.findMany({
				where: {
					organizationId,
					type: "LEAVE",
					isDeleted: false,
					currentWorkflowStateKey: { in: APPROVED_LEAVE_STATES },
					requesterId: { in: employeeIds },
					startDate: { lte: normalizeEndDate(toDate) },
					endDate: { gte: toDateOnlyUtc(fromDate) },
				},
				select: {
					id: true,
					requesterId: true,
					targetEmployeeId: true,
					startDate: true,
					endDate: true,
					metadata: true,
				},
			})
		: [];

	const byEmployeeDate = new Map<string, any>();
	for (const row of rows) {
		// LEAVE request side effects use requesterId as the leave owner: balance deduction,
		// calendar event creation, and leave attendance rows all point at the requester.
		// Keep /hr/attendance obligation aggregation on the same source of truth instead of
		// letting incidental targetEmployeeId values move the leave to another employee.
		const employeeId = row.requesterId;
		let cursor = toDateOnlyUtc(row.startDate);
		const end = toDateOnlyUtc(row.endDate || row.startDate);
		while (cursor <= end) {
			byEmployeeDate.set(`${employeeId}:${getDateKeyInBusinessTimeZone(cursor)}`, row);
			cursor = getNextDate(cursor);
		}
	}
	return byEmployeeDate;
}

export function deriveAttendanceObligationDisplayStatus(
	obligation: { status?: string | null; date?: Date | string | null; businessDate?: string | null },
	now: Date = new Date(),
): AttendanceObligationDisplayStatus {
	const storedStatus = String(obligation?.status || "EXPECTED").toUpperCase();
	if (storedStatus !== "EXPECTED") {
		return storedStatus as AttendanceObligationDisplayStatus;
	}

	const businessDate =
		obligation?.businessDate ||
		(obligation?.date ? getDateKeyInBusinessTimeZone(new Date(obligation.date)) : "");
	const today = getDateKeyInBusinessTimeZone(now);
	if (businessDate < today) return "ABSENT";
	if (businessDate > today) return "SCHEDULED";
	return "NOT_CLOCKED_IN";
}

const NON_OBLIGATED_DISPLAY_STATUSES = new Set([
	"REST_DAY",
	"HOLIDAY",
	"CANCELLED",
	"LEAVE",
]);

const OBLIGATED_DISPLAY_STATUSES = new Set([
	"NOT_CLOCKED_IN",
	"ABSENT",
	"SCHEDULED",
	"PRESENT",
	"INCOMPLETE",
	"LATE",
	"HALF_DAY",
]);

export function hasAttendanceWorkSchedule(scheduleSnapshot?: {
	isOff?: boolean | null;
	startTime?: string | null;
	shiftTypeCode?: string | null;
	shiftTypeName?: string | null;
	timeSlots?: Array<{ type?: string | null }> | null;
} | null): boolean {
	if (!scheduleSnapshot || scheduleSnapshot.isOff === true) return false;
	if (String(scheduleSnapshot.startTime || "").trim()) return true;
	if (
		Array.isArray(scheduleSnapshot.timeSlots) &&
		scheduleSnapshot.timeSlots.some((slot) => String(slot?.type || "").toLowerCase() === "work")
	) {
		return true;
	}
	const shift = String(scheduleSnapshot.shiftTypeCode || scheduleSnapshot.shiftTypeName || "")
		.trim()
		.toUpperCase();
	return Boolean(shift) && shift !== "OFF" && shift !== "UNASSIGNED";
}

/**
 * A day counts as obligated-to-work when the person is expected to work that
 * date. Rest day, holiday, leave, and cancelled stay out. Clock-in on an
 * already-scheduled day must not change this set.
 */
export function isObligatedToWorkDay(params: {
	displayStatus?: string | null;
	isOffDay?: boolean;
	isHoliday?: boolean;
	isClockedIn?: boolean;
	hasWorkSchedule?: boolean | null;
}): boolean {
	const displayStatus = String(params.displayStatus || "").toUpperCase();
	if (NON_OBLIGATED_DISPLAY_STATUSES.has(displayStatus)) return false;
	if (params.isHoliday) return false;
	if (params.isClockedIn && params.isOffDay) return false;
	return OBLIGATED_DISPLAY_STATUSES.has(displayStatus);
}

export function computeAttendanceUtilizationRate(
	clockedInObligated: number,
	obligatedToWork: number,
): number {
	if (obligatedToWork <= 0) return 0;
	return Math.round((Number(clockedInObligated || 0) / obligatedToWork) * 100);
}

function getScheduleBreakDisplay(scheduleSnapshot: any): string | null {
	const timeSlots = Array.isArray(scheduleSnapshot?.timeSlots) ? scheduleSnapshot.timeSlots : [];
	const breakSlots = timeSlots.filter(
		(slot: any) => slot?.type === "break" && slot?.startTime && slot?.endTime,
	);
	if (!breakSlots.length) return null;
	return breakSlots.map((slot: any) => `${slot.startTime} - ${slot.endTime}`).join(", ");
}

function getObligationBreakMinutes(obligation: any): number | null {
	if (typeof obligation?.breakMinutes === "number") return obligation.breakMinutes;
	if (typeof obligation?.scheduleSnapshot?.breakMinutes === "number") {
		return obligation.scheduleSnapshot.breakMinutes;
	}
	return null;
}

function buildBreakMetadata(obligation: any): Record<string, any> {
	const breakMinutes = getObligationBreakMinutes(obligation);
	const breakDisplay = getScheduleBreakDisplay(obligation?.scheduleSnapshot);
	return {
		...(breakMinutes !== null ? { breakMinutes } : {}),
		...(breakDisplay ? { breakDisplay } : {}),
	};
}

function buildClockTimekeepingFields(source: any) {
	if (!source?.timeIn || !source?.timeOut) return null;
	const timeIn = source.timeIn instanceof Date ? source.timeIn : new Date(source.timeIn);
	const timeOut = source.timeOut instanceof Date ? source.timeOut : new Date(source.timeOut);
	if (Number.isNaN(timeIn.getTime()) || Number.isNaN(timeOut.getTime())) return null;

	const date =
		source.date instanceof Date
			? source.date
			: source.date
				? new Date(source.date)
				: timeIn;
	const calc = calculateTimekeeping(
		timeIn,
		timeOut,
		unwrapJsonSetEnvelope(source.scheduleSnapshot) || null,
		Number.isNaN(date.getTime()) ? timeIn : date,
		BUSINESS_TIME_ZONE,
	);

	return {
		hoursWorked: minutesToTimeString(calc.totalMinutesWorked),
		regularHours: minutesToTimeString(calc.regularMinutes),
		overtimeHours: minutesToTimeString(calc.overtimeMinutes),
		undertimeHours: minutesToTimeString(calc.undertimeMinutes),
		lateHours: minutesToTimeString(calc.lateMinutes),
		earlyOutHours: minutesToTimeString(calc.earlyOutMinutes),
		breakMinutes: calc.breakMinutes,
		metadata: {
			totalMinutes: calc.totalMinutesWorked,
			regularMinutes: calc.regularMinutes,
			overtimeMinutes: calc.overtimeMinutes,
			undertimeMinutes: calc.undertimeMinutes,
			lateMinutes: calc.lateMinutes,
			earlyOutMinutes: calc.earlyOutMinutes,
			breakMinutes: calc.breakMinutes,
		},
	};
}

export function buildTimesheetBreakdownFromObligations(
	obligations: any[],
	now: Date = new Date(),
) {
	const breakdown = [...(obligations || [])]
		.filter((obligation) => !obligation?.isDeleted)
		.sort((a, b) => String(a.businessDate || "").localeCompare(String(b.businessDate || "")))
		.flatMap((obligation) => {
			const status = deriveAttendanceObligationDisplayStatus(obligation, now);
			const metadata =
				obligation.metadata && typeof obligation.metadata === "object"
					? obligation.metadata
					: {};
			const breakMetadata = buildBreakMetadata(obligation);
			const clockFields = buildClockTimekeepingFields(obligation);
			const clockEvidenceDate = obligation.timeIn || obligation.timeOut || null;
			const businessDateFromClock = clockEvidenceDate
				? getDateKeyInBusinessTimeZone(new Date(clockEvidenceDate))
				: null;
			const scheduledBusinessDate =
				obligation.businessDate ||
				(obligation.date ? getDateKeyInBusinessTimeZone(new Date(obligation.date)) : null);
			const businessDate =
				businessDateFromClock ||
				scheduledBusinessDate;
			const clockBackedDay = {
				date: obligation.date,
				businessDate,
				timeIn: obligation.timeIn || null,
				timeBreak: obligation.timeBreak || null,
				timeOut: obligation.timeOut || null,
				status,
				storedStatus: obligation.status,
				behaviorFlags: Array.isArray(obligation.behaviorFlags)
					? obligation.behaviorFlags
					: [],
				scheduleSnapshot: obligation.scheduleSnapshot || null,
				hoursWorked: clockFields?.hoursWorked || obligation.hoursWorked || "0:00",
				regularHours: clockFields?.regularHours || obligation.regularHours || "0:00",
				overtimeHours: clockFields?.overtimeHours || obligation.overtimeHours || "0:00",
				undertimeHours: clockFields?.undertimeHours || obligation.undertimeHours || "0:00",
				lateHours: clockFields?.lateHours || obligation.lateHours || "0:00",
				earlyOutHours: clockFields?.earlyOutHours || obligation.earlyOutHours || "0:00",
				breakMinutes: clockFields?.breakMinutes ?? getObligationBreakMinutes(obligation),
				metadata: {
					...metadata,
					...breakMetadata,
					...(clockFields?.metadata || {}),
					sourceOfTruth: "ATTENDANCE_OBLIGATION",
					obligationId: obligation.id,
					businessDate,
					storedStatus: obligation.status,
				},
				primaryMarker: NON_WORK_STATUSES.has(String(obligation.status || "").toUpperCase())
					? String(obligation.status).toUpperCase()
					: status === "ABSENT"
						? "ABSENT"
						: "HOURS",
				isVirtual: !obligation.attendanceId,
			};
			if (
				businessDateFromClock &&
				scheduledBusinessDate &&
				businessDateFromClock !== scheduledBusinessDate &&
				!NON_WORK_STATUSES.has(String(obligation.status || "").toUpperCase())
			) {
				const missedScheduledStatus = deriveAttendanceObligationDisplayStatus(
					{
						...obligation,
						status: "EXPECTED",
						attendanceId: null,
						timeIn: null,
						timeBreak: null,
						timeOut: null,
					},
					now,
				);
				const missedScheduledDay = {
					date: obligation.date,
					businessDate: scheduledBusinessDate,
					timeIn: null,
					timeBreak: null,
					timeOut: null,
					status: missedScheduledStatus,
					storedStatus: "EXPECTED",
					behaviorFlags: Array.isArray(obligation.behaviorFlags)
						? obligation.behaviorFlags
						: [],
					scheduleSnapshot: obligation.scheduleSnapshot || null,
					hoursWorked: "0:00",
					regularHours: "0:00",
					overtimeHours: "0:00",
					undertimeHours: "0:00",
					lateHours: "0:00",
					earlyOutHours: "0:00",
					breakMinutes: getObligationBreakMinutes(obligation),
					metadata: {
						...metadata,
						...breakMetadata,
						sourceOfTruth: "ATTENDANCE_OBLIGATION",
						obligationId: obligation.id,
						businessDate: scheduledBusinessDate,
						storedStatus: "EXPECTED",
						shiftedClockBusinessDate: businessDateFromClock,
					},
					primaryMarker: missedScheduledStatus === "ABSENT" ? "ABSENT" : "HOURS",
					isVirtual: true,
				};
				return [missedScheduledDay, clockBackedDay];
			}
			return [clockBackedDay];
		});
	const byBusinessDate = new Map<string, any>();
	for (const day of breakdown) {
		const key =
			day.businessDate ||
			(day.date ? getDateKeyInBusinessTimeZone(new Date(day.date)) : "");
		if (!key) continue;
		const existing = byBusinessDate.get(key);
		if (!existing) {
			byBusinessDate.set(key, day);
			continue;
		}
		const existingHasClock = Boolean(existing.timeIn || existing.timeOut);
		const dayHasClock = Boolean(day.timeIn || day.timeOut);
		const existingMinutes = timeStringToMinutes(existing.hoursWorked);
		const dayMinutes = timeStringToMinutes(day.hoursWorked);
		if (
			(!existingHasClock && dayHasClock) ||
			(existingMinutes === 0 && dayMinutes > 0)
		) {
			byBusinessDate.set(key, day);
		}
	}
	return Array.from(byBusinessDate.values()).sort((a, b) =>
		String(a.businessDate || "").localeCompare(String(b.businessDate || "")),
	);
}

function buildSummaryFromObligations(obligations: any[]) {
	const breakdown = buildTimesheetBreakdownFromObligations(obligations);
	const totals = breakdown.reduce(
		(acc, day) => {
			acc.totalMinutesWorked += timeStringToMinutes(day.hoursWorked);
			acc.totalRegularMinutes += timeStringToMinutes(day.regularHours);
			acc.totalOvertimeMinutes += timeStringToMinutes(day.overtimeHours);
			acc.totalUndertimeMinutes += timeStringToMinutes(day.undertimeHours);
			acc.totalLateMinutes += timeStringToMinutes(day.lateHours);
			acc.totalEarlyOutMinutes += timeStringToMinutes(day.earlyOutHours);
			return acc;
		},
		{
			totalMinutesWorked: 0,
			totalRegularMinutes: 0,
			totalOvertimeMinutes: 0,
			totalUndertimeMinutes: 0,
			totalLateMinutes: 0,
			totalEarlyOutMinutes: 0,
		},
	);

	return {
		totalDays: breakdown.length,
		totalHoursWorked: minutesToTimeString(totals.totalMinutesWorked),
		totalRegularHours: minutesToTimeString(totals.totalRegularMinutes),
		totalOvertimeHours: minutesToTimeString(totals.totalOvertimeMinutes),
		totalUndertimeHours: minutesToTimeString(totals.totalUndertimeMinutes),
		totalLateHours: minutesToTimeString(totals.totalLateMinutes),
		totalEarlyOutHours: minutesToTimeString(totals.totalEarlyOutMinutes),
		metadata: totals,
	};
}

function buildSummaryFromTimesheetLines(lines: any[]) {
	const totals = (lines || []).reduce(
		(acc, line) => {
			acc.totalMinutesWorked += timeStringToMinutes(line.hoursWorked);
			acc.totalRegularMinutes += timeStringToMinutes(line.regularHours);
			acc.totalOvertimeMinutes += timeStringToMinutes(line.overtimeHours);
			acc.totalUndertimeMinutes += timeStringToMinutes(line.undertimeHours);
			acc.totalLateMinutes += timeStringToMinutes(line.lateHours);
			acc.totalEarlyOutMinutes += timeStringToMinutes(line.earlyOutHours);
			return acc;
		},
		{
			totalMinutesWorked: 0,
			totalRegularMinutes: 0,
			totalOvertimeMinutes: 0,
			totalUndertimeMinutes: 0,
			totalLateMinutes: 0,
			totalEarlyOutMinutes: 0,
		},
	);

	return {
		totalDays: (lines || []).length,
		totalHoursWorked: minutesToTimeString(totals.totalMinutesWorked),
		totalRegularHours: minutesToTimeString(totals.totalRegularMinutes),
		totalOvertimeHours: minutesToTimeString(totals.totalOvertimeMinutes),
		totalUndertimeHours: minutesToTimeString(totals.totalUndertimeMinutes),
		totalLateHours: minutesToTimeString(totals.totalLateMinutes),
		totalEarlyOutHours: minutesToTimeString(totals.totalEarlyOutMinutes),
		metadata: totals,
	};
}

export async function ensureAttendanceObligationsForPayrollPeriod(
	prisma: PrismaClient,
	params: { organizationId: string; payrollPeriodId: string; employeeId?: string | null },
) {
	const payrollPeriod = await prisma.payrollPeriod.findFirst({
		where: {
			id: params.payrollPeriodId,
			organizationId: params.organizationId,
			isDeleted: false,
		},
		select: { id: true, startDate: true, endDate: true, payFrequency: true },
	});
	if (!payrollPeriod) throw new Error("PAYROLL_PERIOD_NOT_FOUND");

	return recomputeAttendanceObligationsForRange(prisma, {
		organizationId: params.organizationId,
		employeeId: params.employeeId || undefined,
		fromDate: payrollPeriod.startDate,
		toDate: payrollPeriod.endDate,
		reason: "PayrollPeriodOpened",
		payrollPeriodId: payrollPeriod.id,
	});
}

export async function recomputeAttendanceObligationsForRange(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeId?: string | null;
		fromDate: Date | string;
		toDate: Date | string;
		reason: string;
		payrollPeriodId?: string | null;
	},
) {
	const fromDate = toDateOnlyUtc(params.fromDate);
	const toDate = toDateOnlyUtc(params.toDate);
	const payrollPeriodFilter = params.payrollPeriodId ? { id: params.payrollPeriodId } : {};
	const payrollPeriods = await prisma.payrollPeriod.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			...payrollPeriodFilter,
			startDate: { lte: normalizeEndDate(toDate) },
			endDate: { gte: fromDate },
		},
		select: { id: true, startDate: true, endDate: true, payFrequency: true },
	});
	if (!payrollPeriods.length) return { touched: 0, created: 0, updated: 0 };

	const employees = await prisma.employee.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			...(params.employeeId ? { id: params.employeeId } : {}),
			AND: [
				{
					OR: [
						{ employmentStartDate: null },
						{ employmentStartDate: { lte: normalizeEndDate(toDate) } },
					],
				},
				{
					OR: [
						{ employmentStatus: { in: ATTENDANCE_ELIGIBLE_EMPLOYMENT_STATUSES } },
						{ employmentTerminationDate: { gte: fromDate } },
						...(params.employeeId ? [{ id: params.employeeId }] : []),
					],
				},
			],
		},
		include: { person: true, department: true },
	});

	const employeeIds = employees.map((employee) => employee.id);
	const holidayByDate = await getHolidayDateKeys(prisma, params.organizationId, fromDate, toDate);
	const leaveByEmployeeDate = await getApprovedLeaveDateKeys(
		prisma,
		params.organizationId,
		employeeIds,
		fromDate,
		toDate,
	);

	let touched = 0;
	let created = 0;
	let updated = 0;

	for (const payrollPeriod of payrollPeriods) {
		const periodStart =
			payrollPeriod.startDate > fromDate ? payrollPeriod.startDate : fromDate;
		const periodEnd = payrollPeriod.endDate < toDate ? payrollPeriod.endDate : toDate;
		for (const employee of employees) {
			const employmentStart = employee.employmentStartDate || employee.employmentHireDate;
			const employmentTermination = getMeaningfulEmploymentTermination(employee);
			const payFrequencyMismatch =
				Boolean(payrollPeriod.payFrequency) &&
				String(employee.payFrequency || "") !== String(payrollPeriod.payFrequency || "");
			let cursor = toDateOnlyUtc(periodStart);
			const end = toDateOnlyUtc(periodEnd);
			while (cursor <= end) {
				if (employmentStart && toDateOnlyUtc(cursor) < toDateOnlyUtc(employmentStart)) {
					cursor = getNextDate(cursor);
					continue;
				}

				const businessDate = getDateKeyInBusinessTimeZone(cursor);
				const existing = await (prisma as any).attendanceObligation.findFirst({
					where: {
						organizationId: params.organizationId,
						employeeId: employee.id,
						payrollPeriodId: payrollPeriod.id,
						date: cursor,
						isDeleted: false,
					},
				});
				if (existing && LOCKED_OBLIGATION_PHASES.has(String(existing.phase || "").toUpperCase())) {
					cursor = getNextDate(cursor);
					continue;
				}

				if (
					payFrequencyMismatch ||
					(employmentTermination && cursor > toDateOnlyUtc(employmentTermination))
				) {
					if (existing) {
						await (prisma as any).attendanceObligation.update({
							where: { id: existing.id },
							data: {
								status: "CANCELLED",
								source: payFrequencyMismatch
									? "PAY_FREQUENCY_MISMATCH"
									: "EMPLOYEE_TERMINATED",
								metadata: {
									...((existing.metadata && typeof existing.metadata === "object")
										? existing.metadata
										: {}),
									reason: params.reason,
									cancelledByEvent: payFrequencyMismatch
										? "PayFrequencyChanged"
										: "EmployeeTerminated",
								},
							},
						});
						updated += 1;
						touched += 1;
					}
					cursor = getNextDate(cursor);
					continue;
				}

				const scheduleSnapshot = await resolveEffectiveShift(prisma, {
					organizationId: params.organizationId,
					employeeId: employee.id,
					date: cursor,
				});
				if (!scheduleSnapshot) {
					cursor = getNextDate(cursor);
					continue;
				}

				const holidayEntries = holidayByDate.get(businessDate) || [];
				const leave = leaveByEmployeeDate.get(`${employee.id}:${businessDate}`) || null;
				let status: AttendanceObligationStoredStatus = "EXPECTED";
				let source = params.reason || "RECOMPUTE";
				let sourceRequestId: string | null = null;
				if (holidayEntries.length) {
					status = "HOLIDAY";
					source = "HOLIDAY";
				} else if (scheduleSnapshot.isOff) {
					status = "REST_DAY";
					source = "SCHEDULE";
				} else if (leave) {
					status = "LEAVE";
					source = "LEAVE_REQUEST";
					sourceRequestId = leave.id;
				}

				const attendanceBounds = getBusinessDayBounds(cursor);
				const attendance = await prisma.attendance.findFirst({
					where: {
						organizationId: params.organizationId,
						employeeId: employee.id,
						isDeleted: false,
						isEffective: true,
						OR: [
							{ date: { gte: attendanceBounds.start, lte: attendanceBounds.end } },
							{ timeIn: { gte: attendanceBounds.start, lte: attendanceBounds.end } },
							{ timeOut: { gte: attendanceBounds.start, lte: attendanceBounds.end } },
						],
					},
					orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
				});
				if (attendance && !NON_WORK_STATUSES.has(status)) {
					status = String(attendance.status || "PRESENT").toUpperCase() as any;
					source = "ATTENDANCE";
				}

				const employeeSnapshot = buildAttendanceEmployeeSnapshotFields(employee);
				const data = {
					organizationId: params.organizationId,
					employeeId: employee.id,
					payrollPeriodId: payrollPeriod.id,
					date: cursor,
					businessDate,
					timezone: BUSINESS_TIME_ZONE,
					status,
					phase: existing?.phase || (businessDate <= getDateKeyInBusinessTimeZone(new Date()) ? "ACTIVE" : "PLANNED"),
					attendanceId: attendance?.id || existing?.attendanceId || null,
					expectedStartAt: getExpectedDateTime(businessDate, scheduleSnapshot.startTime),
					expectedEndAt: getExpectedDateTime(businessDate, scheduleSnapshot.endTime),
					timeIn: attendance?.timeIn || null,
					timeBreak: attendance?.timeBreak || null,
					timeOut: attendance?.timeOut || null,
					hoursWorked: attendance?.hoursWorked || "0:00",
					regularHours: attendance?.regularHours || "0:00",
					overtimeHours: attendance?.overtimeHours || "0:00",
					undertimeHours: attendance?.undertimeHours || "0:00",
					lateHours: attendance?.lateHours || "0:00",
					earlyOutHours: attendance?.earlyOutHours || "0:00",
					breakMinutes: attendance?.breakMinutes ?? scheduleSnapshot.breakMinutes ?? null,
					behaviorFlags: Array.isArray(attendance?.behaviorFlags)
						? attendance.behaviorFlags
						: [],
					scheduleSnapshot: scheduleSnapshot as any,
					scheduleFingerprint: getScheduleFingerprint(scheduleSnapshot),
					source,
					sourceRequestId,
					metadata: {
						reason: params.reason,
						...(holidayEntries.length ? { holidayEntries } : {}),
					},
					...employeeSnapshot,
					isDeleted: false,
				};

				if (existing) {
					await (prisma as any).attendanceObligation.update({
						where: { id: existing.id },
						data,
					});
					updated += 1;
				} else {
					await (prisma as any).attendanceObligation.create({ data });
					created += 1;
				}
				touched += 1;
				cursor = getNextDate(cursor);
			}
		}
	}

	return { touched, created, updated };
}

export async function applyAttendanceToObligation(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeId: string;
		attendanceId: string;
		businessDate?: string | null;
	},
) {
	const attendance = await prisma.attendance.findFirst({
		where: {
			id: params.attendanceId,
			organizationId: params.organizationId,
			employeeId: params.employeeId,
			isDeleted: false,
		},
	});
	if (!attendance?.date) return null;

	const businessDate =
		params.businessDate ||
		(attendance.timeIn ? getDateKeyInBusinessTimeZone(attendance.timeIn) : null) ||
		getDateKeyInBusinessTimeZone(attendance.date);
	const date = new Date(`${businessDate}T00:00:00.000Z`);
	const payrollPeriod = await prisma.payrollPeriod.findFirst({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			startDate: { lte: date },
			endDate: { gte: date },
		},
		select: { id: true },
	});
	if (!payrollPeriod) return null;

	let obligation = await (prisma as any).attendanceObligation.findFirst({
		where: {
			organizationId: params.organizationId,
			employeeId: params.employeeId,
			payrollPeriodId: payrollPeriod.id,
			date,
			isDeleted: false,
		},
	});

	if (!obligation) {
		await ensureAttendanceObligationsForPayrollPeriod(prisma, {
			organizationId: params.organizationId,
			payrollPeriodId: payrollPeriod.id,
			employeeId: params.employeeId,
		});
		obligation = await (prisma as any).attendanceObligation.findFirst({
			where: {
				organizationId: params.organizationId,
				employeeId: params.employeeId,
				payrollPeriodId: payrollPeriod.id,
				date,
				isDeleted: false,
			},
		});
	}

	if (obligation && LOCKED_OBLIGATION_PHASES.has(String(obligation.phase || "").toUpperCase())) {
		return obligation;
	}

	const scheduleSnapshot =
		attendance.scheduleSnapshot ||
		(await resolveEffectiveShift(prisma, {
			organizationId: params.organizationId,
			employeeId: params.employeeId,
			date,
		}));
	const timekeepingCalc = calculateTimekeeping(
		attendance.timeIn,
		attendance.timeOut,
		scheduleSnapshot,
		attendance.date || date,
	);
	const existingObligationMetadata =
		obligation?.metadata && typeof obligation.metadata === "object" ? obligation.metadata : {};
	const overtimeApplication = await resolveOvertimePolicyApplication(prisma, params.organizationId, {
		calc: timekeepingCalc,
		timeIn: attendance.timeIn,
		timeOut: attendance.timeOut,
		schedule: scheduleSnapshot,
		date: attendance.date || date,
		existingMetadata: existingObligationMetadata as Record<string, unknown>,
		attendanceStatus: attendance.status,
	});
	const clockFields = buildClockTimekeepingFields({
		...attendance,
		date: attendance.date || date,
		scheduleSnapshot,
		...overtimeApplication.timekeepingFields,
	});
	const existingNonWorkStatus = NON_WORK_STATUSES.has(
		String(obligation?.status || "").toUpperCase(),
	)
		? String(obligation.status).toUpperCase()
		: null;
	const finalStatus =
		existingNonWorkStatus ||
		attendance.status ||
		determineAttendanceStatus(
			timekeepingCalc,
			Boolean(attendance.timeOut),
			Boolean(attendance.timeIn),
		);
	const employeeSnapshot = await fetchAttendanceEmployeeSnapshotFields(prisma, params.employeeId);
	const data = {
		organizationId: params.organizationId,
		employeeId: params.employeeId,
		payrollPeriodId: payrollPeriod.id,
		date,
		businessDate,
		timezone: BUSINESS_TIME_ZONE,
		status: String(finalStatus || "PRESENT").toUpperCase(),
		phase: obligation?.phase || "ACTIVE",
		attendanceId: attendance.id,
		expectedStartAt:
			obligation?.expectedStartAt || getExpectedDateTime(businessDate, scheduleSnapshot?.startTime),
		expectedEndAt:
			obligation?.expectedEndAt || getExpectedDateTime(businessDate, scheduleSnapshot?.endTime),
		timeIn: attendance.timeIn || null,
		timeBreak: attendance.timeBreak || null,
		timeOut: attendance.timeOut || null,
		hoursWorked:
			clockFields?.hoursWorked || attendance.hoursWorked || minutesToTimeString(timekeepingCalc.totalMinutesWorked),
		regularHours:
			clockFields?.regularHours || attendance.regularHours || minutesToTimeString(timekeepingCalc.regularMinutes),
		overtimeHours:
			overtimeApplication.timekeepingFields.overtimeHours ||
			clockFields?.overtimeHours ||
			attendance.overtimeHours ||
			"0:00",
		undertimeHours:
			clockFields?.undertimeHours || attendance.undertimeHours || minutesToTimeString(timekeepingCalc.undertimeMinutes),
		lateHours:
			clockFields?.lateHours || minutesToTimeString(timekeepingCalc.lateMinutes),
		earlyOutHours:
			clockFields?.earlyOutHours || attendance.earlyOutHours || minutesToTimeString(timekeepingCalc.earlyOutMinutes),
		breakMinutes: clockFields?.breakMinutes ?? attendance.breakMinutes ?? timekeepingCalc.breakMinutes ?? null,
		behaviorFlags: overtimeApplication.behaviorFlags.length
			? overtimeApplication.behaviorFlags
			: Array.isArray(attendance.behaviorFlags)
				? attendance.behaviorFlags
				: [],
		scheduleSnapshot: scheduleSnapshot as any,
		scheduleFingerprint: getScheduleFingerprint(scheduleSnapshot),
		source: String((attendance as any).ledgerType || "ATTENDANCE").toUpperCase(),
		sourceRequestId: attendance.sourceRequestId || null,
		metadata: {
			...mergeOvertimeMetadata(
				(obligation?.metadata && typeof obligation.metadata === "object")
					? obligation.metadata
					: {},
				overtimeApplication.metadata,
			),
			attendanceAppliedAt: new Date().toISOString(),
		},
		...employeeSnapshot,
		isDeleted: false,
	};

	return obligation
		? (prisma as any).attendanceObligation.update({ where: { id: obligation.id }, data })
		: (prisma as any).attendanceObligation.create({ data });
}

export async function materializeTimesheetLinesFromObligations(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeId: string;
		payrollPeriodId: string;
		timesheetId: string;
		fromDate: Date | string;
		toDate: Date | string;
		skipEnsureAttendanceObligations?: boolean;
	},
) {
	if (!params.skipEnsureAttendanceObligations) {
		await ensureAttendanceObligationsForPayrollPeriod(prisma, {
			organizationId: params.organizationId,
			payrollPeriodId: params.payrollPeriodId,
			employeeId: params.employeeId,
		});
	}

	const obligations = await (prisma as any).attendanceObligation.findMany({
		where: {
			organizationId: params.organizationId,
			employeeId: params.employeeId,
			payrollPeriodId: params.payrollPeriodId,
			date: { gte: toDateOnlyUtc(params.fromDate), lte: normalizeEndDate(params.toDate) },
			isDeleted: false,
		},
		orderBy: { date: "asc" },
	});

	const timesheet = await prisma.timesheet.findFirst({
		where: {
			id: params.timesheetId,
			organizationId: params.organizationId,
			isDeleted: false,
		},
		select: {
			status: true,
			lockedAt: true,
		},
	});
	const preserveExistingSnapshotLines =
		Boolean(timesheet?.lockedAt) ||
		["SUBMITTED", "APPROVED"].includes(String(timesheet?.status || "").toUpperCase());
	const existingEffectiveLines = preserveExistingSnapshotLines
		? await (prisma as any).timesheetline.findMany({
				where: {
					organizationId: params.organizationId,
					timesheetId: params.timesheetId,
					isDeleted: false,
					isEffective: true,
				},
				orderBy: [{ date: "asc" }, { revisionNo: "desc" }],
			})
		: [];
	const existingEffectiveLineByDate = new Map(
		existingEffectiveLines.map((line: any) => [
			getDateKeyInBusinessTimeZone(line.date),
			line,
		]),
	);

	const activeDateKeys = new Set<string>();
	const lines: any[] = [];
	for (const obligation of obligations) {
		const status = deriveAttendanceObligationDisplayStatus(obligation);
		const date = toDateOnlyUtc(obligation.date);
		const dateKey = getDateKeyInBusinessTimeZone(date);
		activeDateKeys.add(dateKey);
		const existingLine = existingEffectiveLineByDate.get(dateKey);
		if (preserveExistingSnapshotLines && existingLine) {
			lines.push(existingLine);
			await (prisma as any).attendanceObligation.update({
				where: { id: obligation.id },
				data: {
					timesheetId: params.timesheetId,
					timesheetlineId: existingLine.id,
					phase: "SNAPSHOTTED",
				},
			});
			continue;
		}
		const metadata =
			obligation.metadata && typeof obligation.metadata === "object"
				? obligation.metadata
				: {};
		const breakMetadata = buildBreakMetadata(obligation);
		const primaryMarker = NON_WORK_STATUSES.has(String(obligation.status || "").toUpperCase())
			? String(obligation.status).toUpperCase()
			: status === "ABSENT"
				? "ABSENT"
				: status === "NOT_CLOCKED_IN"
					? "NOT_CLOCKED_IN"
					: "HOURS";
		const lineMetadata = buildTimesheetDaySnapshotMetadata({
			baseMetadata: { ...metadata, ...breakMetadata },
			source: {
				type: "ATTENDANCE_OBLIGATION",
				id: obligation.id,
				status: obligation.status,
				reason: obligation.source || null,
				requestId: obligation.sourceRequestId || null,
			},
			marker: primaryMarker,
			schedule: obligation.scheduleSnapshot || null,
			snapshottedAt: new Date(),
		});
		const clockFields = buildClockTimekeepingFields(obligation);
		const line = await writeEffectiveTimesheetLine(prisma, {
			organizationId: params.organizationId,
			timesheetId: params.timesheetId,
			date,
			versionMode: "update",
			ledgerType: "SNAPSHOT",
			data: {
				organizationId: params.organizationId,
				employeeId: params.employeeId,
				payrollPeriodId: params.payrollPeriodId,
				timesheetId: params.timesheetId,
				attendanceId: obligation.attendanceId || null,
				date,
				timeIn: obligation.timeIn || null,
				timeBreak: obligation.timeBreak || null,
				timeOut: obligation.timeOut || null,
				status,
				behaviorFlags: obligation.behaviorFlags || [],
				scheduleSnapshot: obligation.scheduleSnapshot || null,
				hoursWorked: clockFields?.hoursWorked || obligation.hoursWorked || "0:00",
				regularHours: clockFields?.regularHours || obligation.regularHours || "0:00",
				overtimeHours: clockFields?.overtimeHours || obligation.overtimeHours || "0:00",
				undertimeHours: clockFields?.undertimeHours || obligation.undertimeHours || "0:00",
				lateHours: clockFields?.lateHours || obligation.lateHours || "0:00",
				earlyOutHours: clockFields?.earlyOutHours || obligation.earlyOutHours || "0:00",
				breakMinutes: clockFields?.breakMinutes ?? obligation.breakMinutes ?? null,
				metadata: {
					...lineMetadata,
					...(clockFields?.metadata || {}),
				},
				primaryMarker,
				isManualEntry: false,
				isVirtual: !obligation.attendanceId,
				employeeCodeSnapshot: obligation.employeeCodeSnapshot || null,
				employeeNameSnapshot: obligation.employeeNameSnapshot || null,
				departmentIdSnapshot: obligation.departmentIdSnapshot || null,
				departmentNameSnapshot: obligation.departmentNameSnapshot || null,
				reportToIdSnapshot: obligation.reportToIdSnapshot || null,
				workforceSourceSnapshot: obligation.workforceSourceSnapshot || null,
				agencyIdSnapshot: obligation.agencyIdSnapshot || null,
				dayLaborType: obligation.dayLaborType || null,
				isDeleted: false,
			},
		});
		lines.push(line);
		await (prisma as any).attendanceObligation.update({
			where: { id: obligation.id },
			data: {
				timesheetId: params.timesheetId,
				timesheetlineId: line.id,
				phase: "SNAPSHOTTED",
			},
		});
	}

	await (prisma as any).timesheetline.updateMany({
		where: {
			organizationId: params.organizationId,
			timesheetId: params.timesheetId,
			isDeleted: false,
			isEffective: true,
			date: {
				notIn: [...activeDateKeys].map((key) => new Date(`${key}T00:00:00.000Z`)),
			},
		},
		data: { isDeleted: true },
	});

	const finalLines = await (prisma as any).timesheetline.findMany({
		where: {
			organizationId: params.organizationId,
			timesheetId: params.timesheetId,
			isDeleted: false,
			isEffective: true,
		},
		orderBy: { date: "asc" },
	});
	const summary = buildSummaryFromTimesheetLines(finalLines);
	await prisma.timesheet.update({
		where: { id: params.timesheetId },
		data: {
			totalDays: summary.totalDays,
			totalHoursWorked: summary.totalHoursWorked,
			totalRegularHours: summary.totalRegularHours,
			totalOvertimeHours: summary.totalOvertimeHours,
			totalUndertimeHours: summary.totalUndertimeHours,
			totalLateHours: summary.totalLateHours,
			totalEarlyOutHours: summary.totalEarlyOutHours,
			metadata: {
				...summary.metadata,
				snapshotType: "TIMESHEET_PERIOD",
				sourceType: "TIMESHEETLINE_EFFECTIVE_ROWS",
				materializedFrom: "ATTENDANCE_OBLIGATION",
			},
		},
	});

	return lines;
}

export async function backfillOpenPayrollPeriodAttendanceObligations(
	prisma: PrismaClient,
	params: { organizationId: string; employeeId?: string | null },
) {
	const periods = await prisma.payrollPeriod.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			status: { in: ["OPEN", "PROCESSING"] },
		},
		select: { id: true },
	});
	const results = [];
	for (const period of periods) {
		results.push(
			await ensureAttendanceObligationsForPayrollPeriod(prisma, {
				organizationId: params.organizationId,
				payrollPeriodId: period.id,
				employeeId: params.employeeId || undefined,
			}),
		);
	}
	return results;
}

export async function backfillCurrentPayrollPeriodAttendanceObligations(
	prisma: PrismaClient,
	params: { organizationId: string; employeeId?: string | null; date?: Date | string },
) {
	const targetDate = toDateOnlyUtc(params.date || new Date());
	const payrollPeriod = await prisma.payrollPeriod.findFirst({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			status: { in: ["OPEN", "PROCESSING"] },
			startDate: { lte: normalizeEndDate(targetDate) },
			endDate: { gte: targetDate },
		},
		select: { id: true },
		orderBy: { startDate: "desc" },
	});
	if (!payrollPeriod) return [];

	return [
		await ensureAttendanceObligationsForPayrollPeriod(prisma, {
			organizationId: params.organizationId,
			payrollPeriodId: payrollPeriod.id,
			employeeId: params.employeeId || undefined,
		}),
	];
}
