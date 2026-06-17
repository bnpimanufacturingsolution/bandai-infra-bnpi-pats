type TimeSlotLike = {
	type?: string | null;
	startTime?: string | null;
	endTime?: string | null;
};

type ShiftSlotBuildParams = {
	startTime: string;
	endTime: string;
	breakStartTime?: string | null;
	breakEndTime?: string | null;
	workWindows?: Array<{ startTime: string; endTime: string }>;
	breakWindows?: Array<{
		startTime: string;
		endTime: string;
		label?: string | null;
	}>;
};

const toMinutes = (value?: string | null): number | null => {
	if (!value || typeof value !== "string") return null;
	const [hours, minutes] = value.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
	return hours * 60 + minutes;
};

const toTimeValue = (minutes: number): string => {
	const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
	const hours = Math.floor(normalized / 60);
	const mins = normalized % 60;
	return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

export const buildNonOverlappingWorkBreakSlots = ({
	startTime,
	endTime,
	breakStartTime,
	breakEndTime,
	workWindows,
	breakWindows,
}: ShiftSlotBuildParams): Array<{
	type: "work" | "break";
	label: string;
	startTime: string;
	endTime: string;
}> => {
	const slotWorkWindows =
		Array.isArray(workWindows) && workWindows.length
			? workWindows
			: startTime && endTime
				? [{ startTime, endTime }]
				: [];
	const slotBreakWindows =
		Array.isArray(breakWindows) && breakWindows.length
			? breakWindows
			: breakStartTime && breakEndTime
				? [{ startTime: breakStartTime, endTime: breakEndTime, label: "Break" }]
				: [];

	const normalizedWorkWindows: Array<{
		start: number;
		end: number;
		startTime: string;
		endTime: string;
	}> = [];
	let previousWorkEnd: number | null = null;
	for (const workWindow of slotWorkWindows) {
		const workStart = toMinutes(workWindow.startTime);
		const workEndRaw = toMinutes(workWindow.endTime);
		if (workStart === null || workEndRaw === null) continue;

		let absoluteStart = workStart;
		let absoluteEnd = workEndRaw <= workStart ? workEndRaw + 24 * 60 : workEndRaw;
		if (previousWorkEnd !== null) {
			while (absoluteStart < previousWorkEnd) {
				absoluteStart += 24 * 60;
				absoluteEnd += 24 * 60;
			}
		}
		previousWorkEnd = absoluteEnd;
		normalizedWorkWindows.push({
			start: absoluteStart,
			end: absoluteEnd,
			startTime: workWindow.startTime,
			endTime: workWindow.endTime,
		});
	}

	if (!normalizedWorkWindows.length) return [];

	const normalizedBreakWindows: Array<{
		start: number;
		end: number;
		startTime: string;
		endTime: string;
		label: string;
	}> = [];
	for (const breakWindow of slotBreakWindows) {
		const breakStartRaw = toMinutes(breakWindow.startTime);
		const breakEndRaw = toMinutes(breakWindow.endTime);
		if (breakStartRaw === null || breakEndRaw === null) continue;
		let absoluteStart = breakStartRaw;
		let absoluteEnd = breakEndRaw <= breakStartRaw ? breakEndRaw + 24 * 60 : breakEndRaw;

		const bestOffset = [0, 24 * 60, -24 * 60]
			.map((offset) => ({
				offset,
				overlap: normalizedWorkWindows.reduce((total, workWindow) => {
					const overlapStart = Math.max(absoluteStart + offset, workWindow.start);
					const overlapEnd = Math.min(absoluteEnd + offset, workWindow.end);
					return total + Math.max(0, overlapEnd - overlapStart);
				}, 0),
				distance: normalizedWorkWindows.reduce((minimum, workWindow) => {
					const start = absoluteStart + offset;
					const end = absoluteEnd + offset;
					if (end < workWindow.start) return Math.min(minimum, workWindow.start - end);
					if (start > workWindow.end) return Math.min(minimum, start - workWindow.end);
					return 0;
				}, Number.POSITIVE_INFINITY),
			}))
			.sort((left, right) => right.overlap - left.overlap || left.distance - right.distance)[0];
		absoluteStart += bestOffset?.offset || 0;
		absoluteEnd += bestOffset?.offset || 0;

		normalizedBreakWindows.push({
			start: absoluteStart,
			end: absoluteEnd,
			startTime: breakWindow.startTime,
			endTime: breakWindow.endTime,
			label: breakWindow.label || "Break",
		});
	}

	const slots: Array<{
		type: "work" | "break";
		label: string;
		startTime: string;
		endTime: string;
	}> = [];

	for (const workWindow of normalizedWorkWindows) {
		let cursor = workWindow.start;
		const overlappingBreaks = normalizedBreakWindows
			.map((breakWindow) => ({
				...breakWindow,
				start: Math.max(breakWindow.start, workWindow.start),
				end: Math.min(breakWindow.end, workWindow.end),
			}))
			.filter((breakWindow) => breakWindow.end > breakWindow.start)
			.sort((left, right) => left.start - right.start || left.end - right.end);

		for (const breakWindow of overlappingBreaks) {
			if (cursor < breakWindow.start) {
				slots.push({
					type: "work",
					label: "Work",
					startTime: cursor === workWindow.start ? workWindow.startTime : toTimeValue(cursor),
					endTime: toTimeValue(breakWindow.start),
				});
			}
			slots.push({
				type: "break",
				label: breakWindow.label,
				startTime: toTimeValue(breakWindow.start),
				endTime: toTimeValue(breakWindow.end),
			});
			cursor = Math.max(cursor, breakWindow.end);
		}

		if (cursor < workWindow.end) {
			slots.push({
				type: "work",
				label: "Work",
				startTime: cursor === workWindow.start ? workWindow.startTime : toTimeValue(cursor),
				endTime: workWindow.endTime,
			});
		}
	}

	for (const breakWindow of normalizedBreakWindows) {
		const overlapsWork = normalizedWorkWindows.some((workWindow) => {
			const overlapStart = Math.max(breakWindow.start, workWindow.start);
			const overlapEnd = Math.min(breakWindow.end, workWindow.end);
			return overlapEnd > overlapStart;
		});
		if (overlapsWork) continue;
		slots.push({
			type: "break",
			label: breakWindow.label,
			startTime: breakWindow.startTime,
			endTime: breakWindow.endTime,
		});
	}

	return slots;
};

export const calculateShiftHourFromSlots = (timeSlots?: TimeSlotLike[] | null): number => {
	let previousEndMinutes: number | null = null;

	const intervals = (Array.isArray(timeSlots) ? timeSlots : [])
		.map((slot) => {
			const startMinutes = toMinutes(slot.startTime);
			const endMinutes = toMinutes(slot.endTime);
			if (startMinutes === null || endMinutes === null) return null;

			let absoluteStart = startMinutes;
			let absoluteEnd = endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes;

			if (previousEndMinutes !== null) {
				const isNestedSameDaySlot = absoluteEnd <= previousEndMinutes;
				const isLikelyPostMidnightSlot =
					previousEndMinutes > 24 * 60 && absoluteStart < previousEndMinutes % (24 * 60);
				if (isNestedSameDaySlot && isLikelyPostMidnightSlot) {
					absoluteStart += 24 * 60;
					absoluteEnd += 24 * 60;
				} else {
					while (absoluteStart < previousEndMinutes && !isNestedSameDaySlot) {
						absoluteStart += 24 * 60;
						absoluteEnd += 24 * 60;
					}
				}
			}

			previousEndMinutes =
				previousEndMinutes === null ? absoluteEnd : Math.max(previousEndMinutes, absoluteEnd);
			return {
				type: String(slot?.type || "").toLowerCase(),
				start: absoluteStart,
				end: absoluteEnd,
			};
		})
		.filter(
			(interval): interval is { type: string; start: number; end: number } =>
				Boolean(interval),
		);

	const workIntervals = intervals.filter((interval) => interval.type === "work");
	const breakIntervals = intervals.filter((interval) => interval.type === "break");
	const workMinutes = workIntervals.reduce(
		(total, interval) => total + Math.max(0, interval.end - interval.start),
		0,
	);
	const breakOverlapMinutes = breakIntervals.reduce(
		(total, breakInterval) =>
			total +
			workIntervals.reduce((overlapTotal, workInterval) => {
				const overlapStart = Math.max(breakInterval.start, workInterval.start);
				const overlapEnd = Math.min(breakInterval.end, workInterval.end);
				return overlapTotal + Math.max(0, overlapEnd - overlapStart);
			}, 0),
		0,
	);

	return Number((Math.max(0, workMinutes - breakOverlapMinutes) / 60).toFixed(2));
};

export const calculateShiftHour = (shift: any): number => {
	if (!shift || Boolean(shift.isOff)) return 0;
	if (Array.isArray(shift.timeSlots)) return calculateShiftHourFromSlots(shift.timeSlots);

	if (shift.startTime && shift.endTime) {
		return calculateShiftHourFromSlots([
			{ type: "work", startTime: shift.startTime, endTime: shift.endTime },
		]);
	}

	return 0;
};

export const normalizeShiftTypeTotals = <T extends Record<string, any>>(shiftType: T): T => ({
	...shiftType,
	shiftHour: calculateShiftHour(shiftType),
});

export const normalizeTemplatePatternDay = (day: any) => {
	const shiftSnapshot = day?.shiftSnapshot || null;
	const shiftHour = calculateShiftHour(shiftSnapshot);
	return {
		...day,
		shiftHour,
	};
};

export const calculateScheduleTemplateTotals = (pattern?: any[] | null) => {
	const normalizedPattern = (Array.isArray(pattern) ? pattern : []).map(normalizeTemplatePatternDay);
	const totalDay = normalizedPattern.filter((day) => Number(day?.shiftHour || 0) > 0).length;
	const totalHour = Number(
		normalizedPattern
			.reduce((total, day) => total + Number(day?.shiftHour || 0), 0)
			.toFixed(2),
	);

	return { normalizedPattern, totalDay, totalHour };
};

export const normalizeScheduleTemplateTotals = <T extends Record<string, any>>(template: T): T => {
	if (!Array.isArray(template?.pattern)) {
		return {
			...template,
			totalDay: Math.max(0, Number(template?.totalDay || 0)),
			totalHour: Math.max(0, Number(template?.totalHour || 0)),
		};
	}
	const { normalizedPattern, totalDay, totalHour } = calculateScheduleTemplateTotals(
		template.pattern,
	);
	return {
		...template,
		pattern: normalizedPattern,
		totalDay,
		totalHour,
	};
};
