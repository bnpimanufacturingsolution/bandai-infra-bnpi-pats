import type { Server as SocketIOServer } from "socket.io";
import { PrismaClient } from "../generated/prisma";
import { isMissingPunchDay } from "./payroll-period.helper";
import { publishNotification } from "./notification-dispatch.helper";
import { getLogger } from "./logger.helper";

const logger = getLogger();
const reminderLogger = logger.child({ module: "missing-punch-reminder" });

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

const toDateOrNull = (value: unknown): Date | null => {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value as string);
	return Number.isNaN(date.getTime()) ? null : date;
};

const manilaParts = (date: Date): { dayKey: string; minutes: number } => {
	const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
	const dayKey = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
	return { dayKey, minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
};

/**
 * Attendance rows are stored at the Manila day boundary (00:00 = 24:00 of the
 * worked day), so the row date alone can misattribute a shift. Anchor the
 * workday on the actual punches when present (timeIn, else timeOut), falling
 * back to the row date. A stamp at exactly midnight is a day boundary and
 * belongs to the previous workday's shift.
 */
const workdayParts = (attendance: {
	timeIn?: unknown;
	timeOut?: unknown;
	date?: unknown;
}): { dayKey: string; minutes: number } => {
	const anchor =
		toDateOrNull((attendance as any)?.timeIn) ||
		toDateOrNull((attendance as any)?.timeOut) ||
		toDateOrNull((attendance as any)?.date);
	if (!anchor) {
		const nowParts = manilaParts(new Date());
		return nowParts;
	}
	const parts = manilaParts(anchor);
	if (parts.minutes === 0) {
		return manilaParts(new Date(anchor.getTime() - 1));
	}
	return parts;
};

const timeStringToMinutes = (value: unknown): number | null => {
	if (typeof value !== "string" || !value.includes(":")) return null;
	const [h, m] = value.split(":").map(Number);
	if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
	return h * 60 + m;
};

const getShiftEndMinutes = (scheduleSnapshot: unknown): number | null => {
	const snap = asRecord(scheduleSnapshot);
	if (snap.isOff === true) return null;
	const direct = timeStringToMinutes(snap.endTime);
	if (direct !== null) return direct;
	const slots = Array.isArray(snap.timeSlots) ? snap.timeSlots : [];
	let latest: number | null = null;
	for (const slot of slots) {
		const record = asRecord(slot);
		if (String(record.type || "").toLowerCase() !== "work") continue;
		const end = timeStringToMinutes(record.endTime);
		if (end !== null && (latest === null || end > latest)) latest = end;
	}
	return latest;
};

export type MissingPunchSide = "clock-in" | "clock-out" | "complete punch pair";

export const describeMissingPunchSide = (attendance: {
	timeIn?: unknown;
	timeOut?: unknown;
}): MissingPunchSide => {
	if (!toDateOrNull(attendance?.timeIn)) return "clock-in";
	if (!toDateOrNull(attendance?.timeOut)) return "clock-out";
	return "complete punch pair";
};

export const isRestOrLeaveAttendance = (attendance: {
	status?: unknown;
	scheduleSnapshot?: unknown;
}): boolean => {
	const status = String((attendance as any)?.status || "").toUpperCase();
	if (status === "LEAVE" || status === "REST_DAY") return true;
	return asRecord((attendance as any)?.scheduleSnapshot).isOff === true;
};

/**
 * Pure evaluation used by unit tests and the sweep: is this attendance a
 * one-sided punch on a scheduled workday whose shift already ended (Manila)?
 */
export const evaluateAttendanceForMissingPunch = (
	attendance: {
		timeIn?: unknown;
		timeOut?: unknown;
		hoursWorked?: unknown;
		status?: unknown;
		date?: unknown;
		scheduleSnapshot?: unknown;
	},
	now: Date = new Date(),
): { missing: boolean; side: MissingPunchSide; reason: string } => {
	if (!isMissingPunchDay(attendance)) {
		return { missing: false, side: describeMissingPunchSide(attendance), reason: "complete_pair" };
	}
	if (isRestOrLeaveAttendance(attendance)) {
		return { missing: false, side: describeMissingPunchSide(attendance), reason: "rest_or_leave" };
	}
	const dayKey = workdayParts(attendance as any).dayKey;
	const nowParts = manilaParts(now);
	if (dayKey > nowParts.dayKey) {
		return { missing: false, side: describeMissingPunchSide(attendance), reason: "future_day" };
	}
	if (dayKey === nowParts.dayKey) {
		const shiftEnd = getShiftEndMinutes((attendance as any)?.scheduleSnapshot);
		if (shiftEnd === null) {
			return { missing: false, side: describeMissingPunchSide(attendance), reason: "no_shift_end" };
		}
		if (nowParts.minutes <= shiftEnd) {
			return { missing: false, side: describeMissingPunchSide(attendance), reason: "shift_not_ended" };
		}
	}
	return { missing: true, side: describeMissingPunchSide(attendance), reason: "shift_ended" };
};

const formatManilaDate = (date: Date): string =>
	new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Manila",
		month: "short",
		day: "numeric",
	}).format(date);

const formatManilaTime = (date: Date): string =>
	new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Manila",
		hour: "numeric",
		minute: "2-digit",
	}).format(date);

export const publishMissingPunchReminderNotification = async (
	prisma: PrismaClient | any,
	io: SocketIOServer | null | undefined,
	attendanceId: string,
): Promise<{ notified: boolean; reason: string }> => {
	const attendance = await prisma.attendance.findUnique({
		where: { id: attendanceId },
		select: {
			id: true,
			organizationId: true,
			employeeId: true,
			date: true,
			timeIn: true,
			timeOut: true,
			hoursWorked: true,
			status: true,
			scheduleSnapshot: true,
			employeeCodeSnapshot: true,
		},
	});
	if (!attendance?.employeeId) return { notified: false, reason: "not_found" };
	const evaluation = evaluateAttendanceForMissingPunch(attendance);
	if (!evaluation.missing) return { notified: false, reason: evaluation.reason };

	// Honest dedupe: publishNotification merges by eventKey, but the sweep
	// must not count (or rewrite) an already-sent reminder as a new notify.
	const eventKey = `attendance:${attendance.id}:missing-punch`;
	const existing = await prisma.notification.findFirst({
		where: { organizationId: attendance.organizationId, eventKey },
		select: { recipients: true },
	});
	const held = asRecord(existing?.recipients);
	const heldIds = new Set<string>([
		...(Array.isArray(held.read) ? held.read.map((r: any) => String(r?.employeeId || "")) : []),
		...(Array.isArray(held.unread) ? held.unread.map((r: any) => String(r?.employeeId || "")) : []),
	]);
	if (heldIds.has(String(attendance.employeeId))) {
		return { notified: false, reason: "already_notified" };
	}

	const dayDate = toDateOrNull(attendance.date) || new Date();
	const recordedSide =
		evaluation.side === "clock-in"
			? `a clock-out${attendance.timeOut ? ` at ${formatManilaTime(toDateOrNull(attendance.timeOut)!)}` : ""} but no clock-in`
			: `a clock-in${attendance.timeIn ? ` at ${formatManilaTime(toDateOrNull(attendance.timeIn)!)}` : ""} but no clock-out`;
	await publishNotification({
		prisma,
		io,
		organizationId: attendance.organizationId,
		sourceEmployeeId: null,
		recipientEmployeeIds: [attendance.employeeId],
		category: "REMINDER",
		type: "REMINDER",
		title: `Missing ${evaluation.side} · ${formatManilaDate(dayDate)}`,
		description: `We recorded ${recordedSide} for ${formatManilaDate(dayDate)}, so the day is unpaid. File an attendance correction to fix it.`,
		eventKey,
		metadata: {
			entityType: "ATTENDANCE",
			entityId: attendance.id,
			attendanceId: attendance.id,
			employeeId: attendance.employeeId,
			employeeCode: attendance.employeeCodeSnapshot || null,
			date: dayDate.toISOString(),
			missingSide: evaluation.side,
			routeKey: "TIMESHEET_SELF_VIEW",
			action: "view",
			status: "MISSING_PUNCH",
			targetUrl: "/employee/attendance?action=view-timesheet",
		},
	});
	return { notified: true, reason: evaluation.reason };
};

const notifiedAttendanceIds = async (prisma: PrismaClient | any): Promise<Set<string>> => {
	const sent = await prisma.notification.findMany({
		where: { eventKey: { contains: ":missing-punch" } },
		select: { eventKey: true },
		take: 50000,
	});
	return new Set(
		sent.map((row: any) => String(row?.eventKey || "").split(":")[1]).filter(Boolean),
	);
};

const filterAlreadyNotified = async (
	prisma: PrismaClient | any,
	candidates: Array<{ attendanceId: string; employeeId: string; date: string; missingSide: MissingPunchSide }>,
): Promise<Array<{ attendanceId: string; employeeId: string; date: string; missingSide: MissingPunchSide }>> => {
	if (!candidates.length) return candidates;
	const sent = await prisma.notification.findMany({
		where: { eventKey: { contains: ":missing-punch" } },
		select: { eventKey: true },
		take: 50000,
	});
	const sentIds = new Set(
		sent.map((row: any) => String(row?.eventKey || "").split(":")[1]).filter(Boolean),
	);
	return candidates.filter((candidate) => !sentIds.has(candidate.attendanceId));
};

export const sweepMissingPunchNotifications = async (params: {
	prisma: PrismaClient | any;
	io?: SocketIOServer | null;
	organizationId: string;
	from?: Date | string | null;
	to?: Date | string | null;
	employeeId?: string | null;
	execute?: boolean;
	limit?: number;
	now?: Date;
	/** Default true: hide days that already hold a reminder (lets capped batches walk to the uncovered tail). */
	skipNotified?: boolean;
}): Promise<{
	candidates: Array<{ attendanceId: string; employeeId: string; date: string; missingSide: MissingPunchSide }>;
	notified: number;
	skipped: number;
	errors: Array<{ attendanceId: string; error: string }>;
	executed: boolean;
}> => {
	const { prisma, io, organizationId } = params;
	const now = params.now || new Date();
	const limit = Math.max(1, Math.min(params.limit || 200, 1000));
	const where: Record<string, any> = {
		organizationId,
		isDeleted: false,
		isEffective: true,
		status: { in: ["PRESENT", "INCOMPLETE"] },
		OR: [{ timeIn: null }, { timeOut: null }],
	};
	if (params.employeeId) where.employeeId = params.employeeId;
	if (params.from || params.to) {
		where.date = {};
		if (params.from) (where.date as any).gte = new Date(params.from);
		if (params.to) (where.date as any).lte = new Date(params.to);
	}
	const rows = await prisma.attendance.findMany({
		where: {
			...where,
			// Exclude already-reminded rows at the DB level so capped batches
			// always advance to uncovered days instead of re-scanning the
			// notified head. Per-item publish dedupe stays as the final guard.
			...(params.skipNotified === false
				? {}
				: { id: { notIn: Array.from(await notifiedAttendanceIds(prisma)).slice(0, 10000) } }),
		},
		select: {
			id: true,
			employeeId: true,
			date: true,
			timeIn: true,
			timeOut: true,
			hoursWorked: true,
			status: true,
			scheduleSnapshot: true,
		},
		orderBy: { date: "asc" },
		take: limit,
	});
	// NOTE: oldest first — a capped batch must hit the most overdue
	// end-of-shift days, not today's still-open taps.
	const candidates: Array<{
		attendanceId: string;
		employeeId: string;
		date: string;
		missingSide: MissingPunchSide;
	}> = [];
	for (const row of rows) {
		const evaluation = evaluateAttendanceForMissingPunch(row, now);
		if (!evaluation.missing) continue;
		candidates.push({
			attendanceId: row.id,
			employeeId: row.employeeId,
			date: toDateOrNull(row.date)?.toISOString() || "",
			missingSide: evaluation.side,
		});
	}
	if (!params.execute) {
		const filtered =
			params.skipNotified === false ? candidates : await filterAlreadyNotified(prisma, candidates);
		return {
			candidates: filtered,
			notified: 0,
			skipped: filtered.length,
			errors: [],
			executed: false,
		};
	}
	let notified = 0;
	const errors: Array<{ attendanceId: string; error: string }> = [];
	// Walk past already-reminded head rows so capped batches always reach
	// uncovered days (per-item publish dedupe stays as the final guard).
	const pending =
		params.skipNotified === false ? candidates : await filterAlreadyNotified(prisma, candidates);
	for (const candidate of pending) {
		try {
			const result = await publishMissingPunchReminderNotification(prisma, io, candidate.attendanceId);
			if (result.notified) notified += 1;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			reminderLogger.warn(`Missing-punch notify failed for ${candidate.attendanceId}: ${message}`);
			errors.push({ attendanceId: candidate.attendanceId, error: message });
		}
	}
	return { candidates: pending, notified, skipped: pending.length - notified, errors, executed: true };
};
