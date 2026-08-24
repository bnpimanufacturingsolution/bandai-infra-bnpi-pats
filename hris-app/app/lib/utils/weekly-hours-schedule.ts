export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type WeeklyHoursDayDraft = {
	day: number;
	label: string;
	isOff: boolean;
	startTime: string;
	endTime: string;
};

export type WeeklyHoursShiftSnapshot = {
	name?: string | null;
	code?: string | null;
	isOff?: boolean;
	isOvernight?: boolean;
	startTime?: string | null;
	endTime?: string | null;
	timeSlots?: Array<{
		type?: string | null;
		label?: string | null;
		startTime?: string | null;
		endTime?: string | null;
	}>;
};

const DEFAULT_START = "08:00";
const DEFAULT_END = "17:00";

const toMinutes = (value?: string | null) => {
	if (!value) return null;
	const [hourText, minuteText] = String(value).split(":");
	const hours = Number(hourText);
	const minutes = Number(minuteText);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
	return hours * 60 + minutes;
};

const workWindowFromSnapshot = (snapshot?: WeeklyHoursShiftSnapshot | null) => {
	if (!snapshot || snapshot.isOff) {
		return { isOff: true, startTime: DEFAULT_START, endTime: DEFAULT_END };
	}
	const slots = Array.isArray(snapshot.timeSlots) ? snapshot.timeSlots : [];
	const workSlots = slots.filter(
		(slot) => String(slot?.type || "work").toLowerCase() === "work" && slot?.startTime && slot?.endTime,
	);
	const first = workSlots[0] || slots[0];
	const last = workSlots[workSlots.length - 1] || slots[slots.length - 1];
	return {
		isOff: false,
		startTime: String(first?.startTime || snapshot.startTime || DEFAULT_START),
		endTime: String(last?.endTime || snapshot.endTime || DEFAULT_END),
	};
};

export const buildDefaultWeeklyHoursDays = (cycleDays = 7): WeeklyHoursDayDraft[] => {
	const length = [7, 14, 21, 28].includes(Number(cycleDays)) ? Number(cycleDays) : 7;
	return Array.from({ length }).map((_, index) => {
		const weekday = index % 7;
		const isWeekend = weekday === 5 || weekday === 6;
		return {
			day: index + 1,
			label: WEEKDAY_LABELS[weekday],
			isOff: isWeekend,
			startTime: DEFAULT_START,
			endTime: DEFAULT_END,
		};
	});
};

export const daysFromEmbeddedPattern = (
	pattern?: Array<{ day?: number; shiftSnapshot?: WeeklyHoursShiftSnapshot | null }> | null,
	cycleDays?: number | null,
): WeeklyHoursDayDraft[] => {
	const length = [7, 14, 21, 28].includes(Number(cycleDays))
		? Number(cycleDays)
		: Array.isArray(pattern) && [7, 14, 21, 28].includes(pattern.length)
			? pattern.length
			: 7;
	const defaults = buildDefaultWeeklyHoursDays(length);
	if (!Array.isArray(pattern) || pattern.length === 0) return defaults;
	return defaults.map((day, index) => {
		const match =
			pattern.find((item) => Number(item?.day) === day.day) ||
			(pattern[index] && Number(pattern[index]?.day || index + 1) === day.day
				? pattern[index]
				: null);
		if (!match?.shiftSnapshot) return day;
		const window = workWindowFromSnapshot(match.shiftSnapshot);
		return {
			...day,
			isOff: window.isOff,
			startTime: window.startTime,
			endTime: window.endTime,
		};
	});
};

export const buildWeeklyHoursPatternPayload = (days: WeeklyHoursDayDraft[]) =>
	days.map((day) => {
		if (day.isOff) {
			return {
				day: day.day,
				isOff: true,
				shiftSnapshot: {
					name: "Off Day",
					code: "OFF",
					isOff: true,
					isOvernight: false,
					timeSlots: [],
				},
			};
		}
		const startMinutes = toMinutes(day.startTime) ?? 0;
		const endMinutes = toMinutes(day.endTime) ?? 0;
		return {
			day: day.day,
			isOff: false,
			startTime: day.startTime,
			endTime: day.endTime,
			shiftSnapshot: {
				name: `${day.startTime} to ${day.endTime}`,
				code: `WH_${day.startTime.replace(":", "")}_${day.endTime.replace(":", "")}`,
				isOff: false,
				isOvernight: endMinutes <= startMinutes,
				startTime: day.startTime,
				endTime: day.endTime,
				timeSlots: [
					{
						type: "work",
						label: "Work",
						startTime: day.startTime,
						endTime: day.endTime,
					},
				],
			},
		};
	});

export const validateWeeklyHoursDays = (days: WeeklyHoursDayDraft[]) => {
	if (![7, 14, 21, 28].includes(days.length)) {
		return "Weekly hours must cover 1 to 4 weeks.";
	}
	const workDays = days.filter((day) => !day.isOff);
	if (workDays.length === 0) {
		return "Keep at least one work day.";
	}
	const invalid = workDays.find((day) => !day.startTime || !day.endTime || day.startTime === day.endTime);
	if (invalid) {
		return `${invalid.label} needs different start and end times.`;
	}
	return null;
};

export const toDateInputValue = (value = new Date()) => {
	const year = value.getFullYear();
	const month = String(value.getMonth() + 1).padStart(2, "0");
	const day = String(value.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

export const weekdayIndexFromDateInput = (date: string) => {
	const [year, month, day] = String(date || "")
		.split("-")
		.map(Number);
	if (!year || !month || !day) return 0;
	const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	return utcDay === 0 ? 6 : utcDay - 1;
};

export const hoursDraftForDate = (
	days: WeeklyHoursDayDraft[],
	date: string,
): WeeklyHoursDayDraft => {
	const weekdayIndex = weekdayIndexFromDateInput(date);
	return (
		days[weekdayIndex] || {
			day: weekdayIndex + 1,
			label: WEEKDAY_LABELS[weekdayIndex] || "Mon",
			isOff: false,
			startTime: DEFAULT_START,
			endTime: DEFAULT_END,
		}
	);
};

export const summarizeEmbeddedSchedule = (
	embedded?: {
		templateName?: string | null;
		cycleDays?: number | null;
		pattern?: Array<{ day?: number; shiftSnapshot?: WeeklyHoursShiftSnapshot | null }> | null;
	} | null,
) => {
	if (!embedded || !Array.isArray(embedded.pattern) || embedded.pattern.length === 0) {
		return "No schedule";
	}
	const days = daysFromEmbeddedPattern(embedded.pattern, embedded.cycleDays);
	const work = days.filter((day) => !day.isOff);
	const sameHours =
		work.length > 0 &&
		work.every((day) => day.startTime === work[0].startTime && day.endTime === work[0].endTime);
	if (sameHours && work.length === days.filter((day) => !day.isOff).length) {
		const labels = work.map((day) => day.label).join(", ");
		return `${labels} ${work[0].startTime}–${work[0].endTime}`;
	}
	return days
		.map((day) =>
			day.isOff ? `${day.label} Off` : `${day.label} ${day.startTime}–${day.endTime}`,
		)
		.join(" · ");
};

export const DEFAULT_BREAK_START = "12:00";
export const DEFAULT_BREAK_END = "13:00";

export type DateHoursDraft = {
	isOff: boolean;
	startTime: string;
	endTime: string;
	includeBreak?: boolean;
	breakStartTime?: string | null;
	breakEndTime?: string | null;
};

export const parseDateInputLocal = (date: string) => {
	const [year, month, day] = String(date || "")
		.split("-")
		.map(Number);
	if (!year || !month || !day) return null;
	return new Date(year, month - 1, day);
};

export const toggleDateInSelection = (dates: string[], date: string) => {
	if (!date) return dates;
	if (dates.includes(date)) return dates.filter((item) => item !== date);
	return [...dates, date].sort();
};

export const buildWorkSlotsWithBreak = (draft: DateHoursDraft) => {
	if (draft.isOff) return [];
	const hasBreak =
		Boolean(draft.includeBreak) &&
		Boolean(draft.breakStartTime) &&
		Boolean(draft.breakEndTime) &&
		draft.breakStartTime !== draft.breakEndTime;
	if (!hasBreak) {
		return [
			{
				type: "work",
				label: "Work",
				startTime: draft.startTime,
				endTime: draft.endTime,
			},
		];
	}
	return [
		{
			type: "work",
			label: "Morning Work",
			startTime: draft.startTime,
			endTime: String(draft.breakStartTime),
		},
		{
			type: "break",
			label: "Break",
			startTime: String(draft.breakStartTime),
			endTime: String(draft.breakEndTime),
		},
		{
			type: "work",
			label: "Afternoon Work",
			startTime: String(draft.breakEndTime),
			endTime: draft.endTime,
		},
	];
};

export const buildDateHoursShiftSnapshot = (draft: DateHoursDraft) => {
	if (draft.isOff) {
		return {
			name: "Off Day",
			code: "OFF",
			isOff: true,
			isOvernight: false,
			timeSlots: [],
		};
	}
	const startMinutes = toMinutes(draft.startTime) ?? 0;
	const endMinutes = toMinutes(draft.endTime) ?? 0;
	const timeSlots = buildWorkSlotsWithBreak(draft);
	const hasBreak = timeSlots.some((slot) => slot.type === "break");
	return {
		name: hasBreak
			? `${draft.startTime} to ${draft.endTime}; break ${draft.breakStartTime} to ${draft.breakEndTime}`
			: `${draft.startTime} to ${draft.endTime}`,
		code: hasBreak
			? `WH_${draft.startTime.replace(":", "")}_${draft.endTime.replace(":", "")}_BR`
			: `WH_${draft.startTime.replace(":", "")}_${draft.endTime.replace(":", "")}`,
		isOff: false,
		isOvernight: endMinutes <= startMinutes,
		startTime: draft.startTime,
		endTime: draft.endTime,
		breakMinutes: hasBreak
			? Math.max(0, (toMinutes(draft.breakEndTime) ?? 0) - (toMinutes(draft.breakStartTime) ?? 0))
			: 0,
		timeSlots,
	};
};

export const validateDateHours = (params: {
	dates?: string[] | null;
	date?: string | null;
	isOff: boolean;
	startTime: string;
	endTime: string;
	includeBreak?: boolean;
	breakStartTime?: string | null;
	breakEndTime?: string | null;
}) => {
	const dates = Array.isArray(params.dates)
		? params.dates
		: params.date
			? [params.date]
			: [];
	if (dates.length === 0) return "Pick one or more dates on the calendar.";
	if (dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
		return "Pick valid calendar dates.";
	}
	if (params.isOff) return null;
	if (!params.startTime || !params.endTime || params.startTime === params.endTime) {
		return "Those dates need different start and end times.";
	}
	if (params.includeBreak) {
		if (
			!params.breakStartTime ||
			!params.breakEndTime ||
			params.breakStartTime === params.breakEndTime
		) {
			return "Break needs a start and end time.";
		}
		const start = toMinutes(params.startTime) ?? 0;
		const end = toMinutes(params.endTime) ?? 0;
		const breakStart = toMinutes(params.breakStartTime) ?? 0;
		const breakEnd = toMinutes(params.breakEndTime) ?? 0;
		if (breakStart < start || breakEnd > end || breakStart >= breakEnd) {
			return "Break must sit between start and end.";
		}
	}
	return null;
};
