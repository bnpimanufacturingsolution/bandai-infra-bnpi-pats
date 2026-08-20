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
