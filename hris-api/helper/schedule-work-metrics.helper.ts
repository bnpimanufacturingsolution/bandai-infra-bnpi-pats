export interface ScheduleBoundaries {
	startTime: string;
	endTime: string;
	scheduledMinutes: number;
	gracePeriodMinutes: number;
	workSlots: NormalizedSlot[];
}

export interface StrictScheduleMetrics {
	overtimeMinutes: number;
	undertimeMinutes: number;
	lateMinutes: number;
	earlyOutMinutes: number;
}

function timeToMinutes(timeStr: string): number {
	if (!timeStr) return 0;
	const [hours, minutes] = timeStr.split(":").map(Number);
	return hours * 60 + minutes;
}

type NormalizedSlot = {
	type?: string;
	startTime: string;
	endTime: string;
	absoluteStart: number;
	absoluteEnd: number;
};

function normalizeOrderedTimeSlots(
	timeSlots: Array<{ type?: string; startTime: string; endTime: string }>,
): NormalizedSlot[] {
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

export function getScheduleIndex(jsDayOfWeek: number): number {
	return jsDayOfWeek === 0 ? 6 : jsDayOfWeek - 1;
}

export function getScheduleBoundaries(
	schedule: any,
	dayOfWeek: number,
): ScheduleBoundaries | null {
	// New resolved shift snapshot shape (no weekly shifts array).
	if (
		schedule &&
		!Array.isArray(schedule?.shifts) &&
		(Array.isArray(schedule?.timeSlots) || schedule?.startTime || schedule?.endTime)
	) {
		if (Boolean(schedule?.isOff)) return null;
		const workSlots = (Array.isArray(schedule?.timeSlots)
			? schedule.timeSlots
			: schedule?.startTime && schedule?.endTime
				? [
						{
							type: "work",
							startTime: schedule.startTime,
							endTime: schedule.endTime,
						},
					]
				: []
		).filter((slot: any) => slot.type === "work");
		if (workSlots.length === 0) return null;

		const normalizedWorkSlots = normalizeOrderedTimeSlots(workSlots);
		const earliestSlot = normalizedWorkSlots.reduce((earliest, current) => {
			return current.absoluteStart < earliest.absoluteStart ? current : earliest;
		});
		const latestSlot = normalizedWorkSlots.reduce((latest, current) => {
			return current.absoluteEnd > latest.absoluteEnd ? current : latest;
		});
		const scheduledMinutes = normalizedWorkSlots.reduce(
			(total, slot) => total + (slot.absoluteEnd - slot.absoluteStart),
			0,
		);

		return {
			startTime: earliestSlot.startTime,
			endTime: latestSlot.endTime,
			scheduledMinutes,
			gracePeriodMinutes: Math.max(
				0,
				Number(schedule.graceLateMinutes ?? schedule.gracePeriodMinutes ?? 0),
			),
			workSlots: normalizedWorkSlots,
		};
	}

	if (!schedule?.shifts || !Array.isArray(schedule.shifts)) {
		return null;
	}

	const scheduleIndex = getScheduleIndex(dayOfWeek);
	const shift = schedule.shifts[scheduleIndex];
	if (!shift || shift.isRestDay || !shift.timeSlots || shift.timeSlots.length === 0) {
		return null;
	}

	const workSlots = shift.timeSlots.filter((slot: any) => slot.type === "work");
	if (workSlots.length === 0) {
		return null;
	}

	const normalizedWorkSlots = normalizeOrderedTimeSlots(workSlots);
	const earliestSlot = normalizedWorkSlots.reduce((earliest, current) => {
		return current.absoluteStart < earliest.absoluteStart ? current : earliest;
	});
	const latestSlot = normalizedWorkSlots.reduce((latest, current) => {
		return current.absoluteEnd > latest.absoluteEnd ? current : latest;
	});
	const scheduledMinutes = normalizedWorkSlots.reduce(
		(total, slot) => total + (slot.absoluteEnd - slot.absoluteStart),
		0,
	);

	return {
		startTime: earliestSlot.startTime,
		endTime: latestSlot.endTime,
		scheduledMinutes,
		gracePeriodMinutes: Math.max(0, Number(schedule.gracePeriodMinutes) || 0),
		workSlots: normalizedWorkSlots,
	};
}

function calculateScheduledWorkMinutesBefore(
	workSlots: NormalizedSlot[],
	actualStartMinutes: number,
): number {
	return workSlots.reduce((total, slot) => {
		if (actualStartMinutes <= slot.absoluteStart) return total;
		return total + Math.min(actualStartMinutes, slot.absoluteEnd) - slot.absoluteStart;
	}, 0);
}

function getManilaMinutes(t: string | Date): number {
	try {
		const date = new Date(t);
		const str = date.toLocaleTimeString("en-US", {
			timeZone: "Asia/Manila",
			hour12: false,
			hour: "2-digit",
			minute: "2-digit",
		});
		const [h, m] = str.split(":").map(Number);
		return h * 60 + m;
	} catch {
		return 0;
	}
}

export function calculateStrictScheduleMetrics(params: {
	timeIn?: string | Date | null;
	timeOut?: string | Date | null;
	schedule: any;
	dayDate: Date;
}): StrictScheduleMetrics {
	const { timeIn, timeOut, schedule, dayDate } = params;
	const empty: StrictScheduleMetrics = {
		overtimeMinutes: 0,
		undertimeMinutes: 0,
		lateMinutes: 0,
		earlyOutMinutes: 0,
	};

	if (!timeIn) return empty;

	const scheduleBoundaries = getScheduleBoundaries(schedule, dayDate.getDay());
	if (!scheduleBoundaries) return empty;

	const [eh, em] = scheduleBoundaries.endTime.split(":").map(Number);
	const [sh, sm] = scheduleBoundaries.startTime.split(":").map(Number);
	const schStartMins = sh * 60 + sm;
	let schEndMins = eh * 60 + em;
	const overnightSchedule = isOvernightWindow(
		scheduleBoundaries.startTime,
		scheduleBoundaries.endTime,
	);
	if (overnightSchedule && schEndMins <= schStartMins) {
		schEndMins += 24 * 60;
	}

	const actualStartMins = normalizeActualMinutesForSchedule(
		getManilaMinutes(timeIn),
		schStartMins,
		overnightSchedule,
	);

	let overtimeMinutes = 0;
	let undertimeMinutes = 0;
	let lateMinutes = 0;
	let earlyOutMinutes = 0;

	if (actualStartMins > schStartMins) {
		const diff = calculateScheduledWorkMinutesBefore(
			scheduleBoundaries.workSlots,
			actualStartMins,
		);
		const gracePeriodMinutes = scheduleBoundaries.gracePeriodMinutes || 0;
		lateMinutes = Math.max(0, diff - gracePeriodMinutes);
	}

	if (timeOut) {
		const actualOutMins = normalizeActualMinutesForSchedule(
			getManilaMinutes(timeOut),
			schStartMins,
			overnightSchedule,
		);

		if (actualOutMins > schEndMins) {
			const overtimeStartMins = Math.max(actualStartMins, schEndMins);
			overtimeMinutes = Math.max(0, actualOutMins - overtimeStartMins);
		}

		if (actualOutMins < schEndMins) {
			const diff = schEndMins - actualOutMins;
			undertimeMinutes = diff;
			earlyOutMinutes = diff;
		}
	}

	return {
		overtimeMinutes,
		undertimeMinutes,
		lateMinutes,
		earlyOutMinutes,
	};
}

