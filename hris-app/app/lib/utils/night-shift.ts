const MANILA_UTC_OFFSET_MINUTES = 8 * 60;
const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type NightShiftInput = {
	isOvernight?: boolean | null;
	startTime?: string | null;
	endTime?: string | null;
	hoursWorked?: string | null;
	timeIn?: string | null;
	timeOut?: string | null;
};

export type NightShiftMeta = {
	isNightShiftDay: boolean;
	scheduledWindow: {
		startTime: string;
		endTime: string;
		isOvernight: boolean;
	};
	actualNightHours: string;
};

const parseTimeToMinutes = (value?: string | null): number | null => {
	if (!value || typeof value !== "string") return null;
	const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
	if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
	return hours * 60 + minutes;
};

const formatMinutesAsDuration = (totalMinutes: number): string => {
	const safe = Math.max(0, Math.floor(totalMinutes));
	const hours = Math.floor(safe / 60);
	const minutes = safe % 60;
	return `${hours}:${String(minutes).padStart(2, "0")}`;
};

const formatTimeOfDay = (value: string): string => {
	const minutes = parseTimeToMinutes(value);
	if (minutes === null) return value;
	const hours24 = Math.floor(minutes / 60);
	const mins = minutes % 60;
	const suffix = hours24 >= 12 ? "PM" : "AM";
	const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
	return `${hours12}:${String(mins).padStart(2, "0")} ${suffix}`;
};

const toLocalMs = (utcMs: number, tz: string): number => {
	if (tz === "Asia/Manila") {
		return utcMs + MANILA_UTC_OFFSET_MINUTES * MS_PER_MINUTE;
	}
	return utcMs;
};

const computeOverlapMinutes = (
	rangeStartMs: number,
	rangeEndMs: number,
	windowStartMs: number,
	windowEndMs: number,
) => {
	const start = Math.max(rangeStartMs, windowStartMs);
	const end = Math.min(rangeEndMs, windowEndMs);
	if (end <= start) return 0;
	return Math.floor((end - start) / MS_PER_MINUTE);
};

export const computeNightHoursFromTimeRange = (
	timeIn?: string | null,
	timeOut?: string | null,
	tz: string = "Asia/Manila",
): string => {
	if (!timeIn || !timeOut) return "0:00";
	const startUtc = new Date(timeIn).getTime();
	const endUtc = new Date(timeOut).getTime();
	if (!Number.isFinite(startUtc) || !Number.isFinite(endUtc) || endUtc <= startUtc) {
		return "0:00";
	}

	const startLocalMs = toLocalMs(startUtc, tz);
	const endLocalMs = toLocalMs(endUtc, tz);
	const startDayLocalMs = Math.floor(startLocalMs / MS_PER_DAY) * MS_PER_DAY - MS_PER_DAY;
	const endDayLocalMs = Math.floor(endLocalMs / MS_PER_DAY) * MS_PER_DAY;

	let totalNightMinutes = 0;
	for (let dayStartMs = startDayLocalMs; dayStartMs <= endDayLocalMs; dayStartMs += MS_PER_DAY) {
		const windowStartMs = dayStartMs + 22 * 60 * MS_PER_MINUTE;
		const windowEndMs = dayStartMs + (MINUTES_PER_DAY + 6 * 60) * MS_PER_MINUTE;
		totalNightMinutes += computeOverlapMinutes(
			startLocalMs,
			endLocalMs,
			windowStartMs,
			windowEndMs,
		);
	}

	return formatMinutesAsDuration(totalNightMinutes);
};

export const formatNightWindow = (
	startTime?: string | null,
	endTime?: string | null,
	isOvernight?: boolean | null,
): string | null => {
	const safeStart = startTime || "22:00";
	const safeEnd = endTime || "06:00";
	const start = formatTimeOfDay(safeStart);
	const end = formatTimeOfDay(safeEnd);
	if (!start || !end) return null;
	return isOvernight ? `${start} - ${end}` : `${start} - ${end}`;
};

const isScheduleNightShift = (params: {
	isOvernight?: boolean | null;
	startTime?: string | null;
	endTime?: string | null;
}) => {
	if (params.isOvernight) return true;
	const start = parseTimeToMinutes(params.startTime);
	const end = parseTimeToMinutes(params.endTime);
	if (start === null || end === null) return false;
	return end <= start;
};

export const buildNightShiftMeta = (input: NightShiftInput): NightShiftMeta | null => {
	const isNightShiftDay = isScheduleNightShift({
		isOvernight: input.isOvernight,
		startTime: input.startTime,
		endTime: input.endTime,
	});
	if (!isNightShiftDay) return null;

	return {
		isNightShiftDay: true,
		scheduledWindow: {
			startTime: input.startTime || "22:00",
			endTime: input.endTime || "06:00",
			isOvernight: true,
		},
		actualNightHours:
			(typeof input.hoursWorked === "string" && input.hoursWorked.trim()) ||
			computeNightHoursFromTimeRange(input.timeIn, input.timeOut, "Asia/Manila"),
	};
};
