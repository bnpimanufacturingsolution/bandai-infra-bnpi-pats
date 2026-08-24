import { MANILA_TIME_ZONE } from "./manila-clock";

function formatDurationCompact(timeStr?: string | null): string {
	if (!timeStr) return "0m";
	const [hours, minutes] = timeStr.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return timeStr;
	if (hours === 0) return `${minutes}m`;
	return `${hours}h ${minutes}m`;
}

export type ClockInArrivalKind = "LATE" | "GRACE" | "ON_TIME";

export type ClockInArrivalIndicator = {
	kind: ClockInArrivalKind;
	minutes: number;
	lateHours: string;
	label: string;
	value?: string;
};

const NON_ARRIVAL_STATUSES = new Set([
	"HOLIDAY",
	"LEAVE",
	"REST_DAY",
	"ABSENT",
	"AWOL",
	"NOT_CLOCKED_IN",
	"MISSING_SCHEDULE",
	"SCHEDULED",
	"CANCELLED",
]);

const NON_ARRIVAL_MARKERS = new Set(["HOLIDAY", "LEAVE", "REST_DAY", "ABSENT"]);

type ArrivalRecord = {
	timeIn?: string | Date | null;
	status?: string | null;
	primaryMarker?: string | null;
	lateHours?: string | null;
	computationMeta?: {
		rawLateMinutes?: number | null;
		gracePeriodMinutes?: number | null;
		withinGrace?: boolean | null;
		evaluatedFromSchedule?: boolean | null;
	} | null;
	earlyOutHours?: string | null;
	undertimeHours?: string | null;
	hoursWorked?: string | null;
	timeOut?: string | Date | null;
	scheduleSnapshot?: {
		isOff?: boolean | null;
		isRestDay?: boolean | null;
		startTime?: string | null;
		endTime?: string | null;
		graceLateMinutes?: number | null;
		gracePeriodMinutes?: number | null;
		graceEarlyOutMinutes?: number | null;
		timeSlots?: Array<{ type?: string | null; startTime?: string | null; endTime?: string | null }>;
		shifts?: Array<{
			label?: string | null;
			isRestDay?: boolean | null;
			timeSlots?: Array<{ type?: string | null; startTime?: string | null; endTime?: string | null }>;
		}>;
	} | null;
};

export type ClockOutUndertimeIndicator = {
	kind: "UT";
	minutes: number;
	hours: string;
	label: string;
	value: string;
};

function parseDurationToMinutes(value?: string | null): number {
	if (!value) return 0;
	if (!value.includes(":")) return Math.max(0, Number(value) || 0);
	const [hours, minutes] = value.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	return Math.max(0, hours * 60 + minutes);
}

function formatMinutesAsTime(minutes: number): string {
	const safe = Math.max(0, Math.round(minutes));
	const hours = Math.floor(safe / 60);
	const remainder = safe % 60;
	return `${hours}:${String(remainder).padStart(2, "0")}`;
}

function toMinutes(time?: string | null): number | null {
	if (!time) return null;
	const [hours, minutes] = String(time).split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
	return hours * 60 + minutes;
}

function manilaMinutes(value: string | Date): number | null {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: MANILA_TIME_ZONE,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(date);
	const hour = Number(parts.find((part) => part.type === "hour")?.value);
	const minute = Number(parts.find((part) => part.type === "minute")?.value);
	if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
	return ((hour % 24) * 60) + minute;
}

function earliestWorkStart(
	slots?: Array<{ type?: string | null; startTime?: string | null; endTime?: string | null }>,
): number | null {
	const starts = (slots || [])
		.filter((slot) => slot?.type !== "break" && slot?.startTime)
		.map((slot) => toMinutes(slot.startTime))
		.filter((value): value is number => value !== null);
	if (!starts.length) return null;
	return Math.min(...starts);
}

function latestWorkEnd(
	slots?: Array<{ type?: string | null; startTime?: string | null; endTime?: string | null }>,
): number | null {
	const ends = (slots || [])
		.filter((slot) => slot?.type !== "break" && slot?.endTime)
		.map((slot) => toMinutes(slot.endTime))
		.filter((value): value is number => value !== null);
	if (!ends.length) return null;
	return Math.max(...ends);
}

export function getScheduledStartMinutes(
	schedule?: ArrivalRecord["scheduleSnapshot"],
	date?: Date,
): number | null {
	if (!schedule || schedule.isOff || schedule.isRestDay) return null;
	const fromSlots = earliestWorkStart(schedule.timeSlots);
	if (fromSlots !== null) return fromSlots;
	const fromStart = toMinutes(schedule.startTime);
	if (fromStart !== null) return fromStart;
	if (date && Array.isArray(schedule.shifts) && schedule.shifts.length) {
		const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
		const label = dayNames[date.getUTCDay()];
		const shift =
			schedule.shifts.find((item) => String(item?.label || "").toLowerCase() === label.toLowerCase()) ||
			null;
		if (shift?.isRestDay) return null;
		return earliestWorkStart(shift?.timeSlots);
	}
	return null;
}

export function deriveClockInArrivalFromSchedule(
	timeIn: string | Date,
	schedule?: ArrivalRecord["scheduleSnapshot"],
): ClockInArrivalIndicator | null {
	const actual = manilaMinutes(timeIn);
	const scheduled = getScheduledStartMinutes(
		schedule,
		timeIn instanceof Date ? timeIn : new Date(timeIn),
	);
	if (actual === null || scheduled === null) return null;
	const gracePeriodMinutes = Math.max(
		0,
		Number(schedule?.graceLateMinutes ?? schedule?.gracePeriodMinutes ?? 0),
	);
	const rawLateMinutes = Math.max(0, actual - scheduled);
	if (rawLateMinutes > 0 && rawLateMinutes <= gracePeriodMinutes) {
		return {
			kind: "GRACE",
			minutes: rawLateMinutes,
			lateHours: "0:00",
			label: "GRACE",
			value: formatDurationCompact(formatMinutesAsTime(rawLateMinutes)),
		};
	}
	if (rawLateMinutes > gracePeriodMinutes && rawLateMinutes > 0) {
		const chargeable = rawLateMinutes - gracePeriodMinutes;
		return {
			kind: "LATE",
			minutes: chargeable,
			lateHours: formatMinutesAsTime(chargeable),
			label: "LATE",
			value: formatDurationCompact(formatMinutesAsTime(chargeable)),
		};
	}
	return {
		kind: "ON_TIME",
		minutes: 0,
		lateHours: "0:00",
		label: "ON TIME",
	};
}

export function getClockInArrivalIndicator(
	record: ArrivalRecord,
): ClockInArrivalIndicator | null {
	if (!record?.timeIn) return null;
	const status = String(record.status || "").toUpperCase();
	const marker = String(record.primaryMarker || "").toUpperCase();
	if (NON_ARRIVAL_STATUSES.has(status) || NON_ARRIVAL_MARKERS.has(marker)) {
		return null;
	}

	const lateMinutes = parseDurationToMinutes(record.lateHours);
	const withinGrace = Boolean(record.computationMeta?.withinGrace);
	const evaluated = record.computationMeta?.evaluatedFromSchedule === true;

	if (withinGrace) {
		const raw = Math.max(0, Number(record.computationMeta?.rawLateMinutes) || 0);
		return {
			kind: "GRACE",
			minutes: raw,
			lateHours: record.lateHours || "0:00",
			label: "GRACE",
			value: raw > 0 ? formatDurationCompact(formatMinutesAsTime(raw)) : undefined,
		};
	}
	if (lateMinutes > 0) {
		return {
			kind: "LATE",
			minutes: lateMinutes,
			lateHours: record.lateHours || formatMinutesAsTime(lateMinutes),
			label: "LATE",
			value: formatDurationCompact(record.lateHours || formatMinutesAsTime(lateMinutes)),
		};
	}
	if (evaluated) {
		return {
			kind: "ON_TIME",
			minutes: 0,
			lateHours: "0:00",
			label: "ON TIME",
		};
	}

	return deriveClockInArrivalFromSchedule(record.timeIn, record.scheduleSnapshot);
}

export function getScheduledEndMinutes(
	schedule?: ArrivalRecord["scheduleSnapshot"],
	date?: Date,
): number | null {
	if (!schedule || schedule.isOff || schedule.isRestDay) return null;
	const fromSlots = latestWorkEnd(schedule.timeSlots);
	if (fromSlots !== null) return fromSlots;
	const fromEnd = toMinutes(schedule.endTime);
	if (fromEnd !== null) return fromEnd;
	if (date && Array.isArray(schedule.shifts) && schedule.shifts.length) {
		const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
		const label = dayNames[date.getUTCDay()];
		const shift =
			schedule.shifts.find((item) => String(item?.label || "").toLowerCase() === label.toLowerCase()) ||
			null;
		if (shift?.isRestDay) return null;
		return latestWorkEnd(shift?.timeSlots);
	}
	return null;
}

export function deriveClockOutUndertimeFromSchedule(
	timeOut: string | Date,
	schedule?: ArrivalRecord["scheduleSnapshot"],
): ClockOutUndertimeIndicator | null {
	const actual = manilaMinutes(timeOut);
	const scheduledEnd = getScheduledEndMinutes(
		schedule,
		timeOut instanceof Date ? timeOut : new Date(timeOut),
	);
	if (actual === null || scheduledEnd === null) return null;
	const graceMinutes = Math.max(0, Number(schedule?.graceEarlyOutMinutes ?? 0));
	let endMinutes = scheduledEnd;
	if (endMinutes <= (getScheduledStartMinutes(schedule, timeOut instanceof Date ? timeOut : new Date(timeOut)) || 0)) {
		endMinutes += 24 * 60;
	}
	const rawEarly = Math.max(0, endMinutes - actual);
	if (rawEarly <= graceMinutes) return null;
	const chargeable = rawEarly - graceMinutes;
	return {
		kind: "UT",
		minutes: chargeable,
		hours: formatMinutesAsTime(chargeable),
		label: "UT",
		value: formatDurationCompact(formatMinutesAsTime(chargeable)),
	};
}

export function getClockOutUndertimeIndicator(
	record: ArrivalRecord,
): ClockOutUndertimeIndicator | null {
	if (!record?.timeOut || !record?.timeIn) return null;
	const status = String(record.status || "").toUpperCase();
	const marker = String(record.primaryMarker || "").toUpperCase();
	if (NON_ARRIVAL_STATUSES.has(status) || NON_ARRIVAL_MARKERS.has(marker)) {
		return null;
	}
	const storedMinutes = Math.max(
		parseDurationToMinutes(record.undertimeHours),
		parseDurationToMinutes(record.earlyOutHours),
	);
	if (storedMinutes > 0) {
		const hours = record.undertimeHours && parseDurationToMinutes(record.undertimeHours) > 0
			? record.undertimeHours
			: record.earlyOutHours || formatMinutesAsTime(storedMinutes);
		return {
			kind: "UT",
			minutes: storedMinutes,
			hours,
			label: "UT",
			value: formatDurationCompact(hours),
		};
	}
	if (record.computationMeta?.evaluatedFromSchedule) return null;
	return deriveClockOutUndertimeFromSchedule(record.timeOut, record.scheduleSnapshot);
}

export function getWorkedHoursLabel(record: ArrivalRecord): string | null {
	const stored = parseDurationToMinutes(record.hoursWorked);
	if (stored > 0) return formatDurationCompact(record.hoursWorked);
	if (!record.timeIn || !record.timeOut) return null;
	const start = manilaMinutes(record.timeIn);
	const end = manilaMinutes(record.timeOut);
	if (start === null || end === null) return null;
	let worked = end - start;
	if (worked < 0) worked += 24 * 60;
	if (worked <= 0) return null;
	return formatDurationCompact(formatMinutesAsTime(worked));
}
