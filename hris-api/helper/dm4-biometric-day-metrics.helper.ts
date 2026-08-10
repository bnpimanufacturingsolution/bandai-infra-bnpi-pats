/**
 * Pure metrics for one biometric attendance day during DM4 import.
 * Fixes hard-coded late/UT=0 and single-punch 24h PRESENT defects.
 */

export type Dm4DaySchedule = {
	isOff?: boolean;
	startTime?: string | null;
	endTime?: string | null;
	regularMinutes?: number | null;
	breakMinutes?: number | null;
	graceLateMinutes?: number | null;
	graceEarlyOutMinutes?: number | null;
	timeSlots?: Array<{ type?: string; startTime?: string; endTime?: string }> | null;
};

export type Dm4DayMetricsInput = {
	timeIn?: string | null;
	timeOut?: string | null;
	/** Number of distinct punches for the day (1 = incomplete single punch). */
	punchCount?: number | null;
	schedule?: Dm4DaySchedule | null;
};

export type Dm4DayMetrics = {
	status: "PRESENT" | "INCOMPLETE" | "REST_DAY";
	incomplete: boolean;
	timeIn: string | null;
	timeOut: string | null;
	breakMinutes: number;
	totalMinutesWorked: number;
	regularMinutes: number;
	overtimeMinutes: number;
	lateMinutes: number;
	earlyOutMinutes: number;
	undertimeMinutes: number;
	hoursWorked: string;
	regularHours: string;
	overtimeHours: string;
	lateHours: string;
	earlyOutHours: string;
	undertimeHours: string;
};

export function minutesToHoursText(minutes: number): string {
	const safe = Math.max(0, Math.round(Number(minutes) || 0));
	return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function timeTextToMinutes(value: unknown): number | null {
	const match = String(value || "")
		.trim()
		.match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return null;
	return Number(match[1]) * 60 + Number(match[2]);
}

function resolveScheduleWindow(schedule?: Dm4DaySchedule | null): {
	start: number | null;
	end: number | null;
	breakMinutes: number;
	regularMinutes: number;
	isOff: boolean;
	graceLate: number;
	graceEarlyOut: number;
} {
	const isOff = Boolean(schedule?.isOff);
	const slots = Array.isArray(schedule?.timeSlots) ? schedule!.timeSlots! : [];
	const workSlots = slots.filter((s) => s && s.type !== "break" && s.startTime && s.endTime);
	const breakSlots = slots.filter((s) => s && s.type === "break" && s.startTime && s.endTime);

	let start = timeTextToMinutes(schedule?.startTime);
	let end = timeTextToMinutes(schedule?.endTime);
	if (workSlots.length) {
		const starts = workSlots.map((s) => timeTextToMinutes(s.startTime)).filter((n) => n !== null) as number[];
		const ends = workSlots.map((s) => timeTextToMinutes(s.endTime)).filter((n) => n !== null) as number[];
		if (starts.length) start = Math.min(...starts);
		if (ends.length) end = Math.max(...ends);
	}

	let breakMinutes = Math.max(0, Number(schedule?.breakMinutes || 0));
	if (!breakMinutes && breakSlots.length) {
		for (const slot of breakSlots) {
			const bStart = timeTextToMinutes(slot.startTime);
			const bEnd = timeTextToMinutes(slot.endTime);
			if (bStart !== null && bEnd !== null) {
				breakMinutes += Math.max(0, bEnd - bStart);
			}
		}
	}

	let regularMinutes = Math.max(0, Number(schedule?.regularMinutes || 0));
	if (!regularMinutes && start !== null && end !== null) {
		let span = end - start;
		if (span <= 0) span += 24 * 60;
		regularMinutes = Math.max(0, span - breakMinutes);
	}
	if (!regularMinutes) regularMinutes = 480;

	return {
		start,
		end,
		breakMinutes,
		regularMinutes,
		isOff,
		graceLate: Math.max(0, Number(schedule?.graceLateMinutes || 0)),
		graceEarlyOut: Math.max(0, Number(schedule?.graceEarlyOutMinutes || 0)),
	};
}

/**
 * Compute attendance metrics for one DM4 biometric day.
 *
 * Single-punch (timeIn === timeOut, or punchCount === 1): INCOMPLETE, no 24h invented span.
 */
export function computeDm4BiometricDayMetrics(input: Dm4DayMetricsInput): Dm4DayMetrics {
	const window = resolveScheduleWindow(input.schedule);
	const punchCount = Math.max(0, Number(input.punchCount || 0));
	const rawIn = String(input.timeIn || "").trim() || null;
	const rawOut = String(input.timeOut || "").trim() || null;

	const startMin = timeTextToMinutes(rawIn);
	const endMin = timeTextToMinutes(rawOut);

	const singlePunch =
		punchCount === 1 ||
		(rawIn && rawOut && rawIn === rawOut) ||
		(startMin !== null && endMin !== null && startMin === endMin && punchCount !== 2);

	if (window.isOff && !rawIn) {
		return emptyMetrics("REST_DAY", null, null, window.breakMinutes);
	}

	if (!rawIn || startMin === null) {
		return emptyMetrics("INCOMPLETE", rawIn, null, window.breakMinutes);
	}

	// Late from schedule start (still computable with only timeIn).
	let lateMinutes = 0;
	if (window.start !== null && !window.isOff) {
		lateMinutes = Math.max(0, startMin - window.start - window.graceLate);
	}

	if (singlePunch || !rawOut || endMin === null) {
		return {
			status: "INCOMPLETE",
			incomplete: true,
			timeIn: rawIn,
			timeOut: null,
			breakMinutes: window.breakMinutes,
			totalMinutesWorked: 0,
			regularMinutes: 0,
			overtimeMinutes: 0,
			lateMinutes,
			earlyOutMinutes: 0,
			undertimeMinutes: 0,
			hoursWorked: "0:00",
			regularHours: "0:00",
			overtimeHours: "0:00",
			lateHours: minutesToHoursText(lateMinutes),
			earlyOutHours: "0:00",
			undertimeHours: "0:00",
		};
	}

	// Complete pair: do NOT invent overnight when end < start unless schedule is overnight
	// (overnight schedules are rare in DM4 WS; only add 24h when schedule end < start).
	let workedSpan = endMin - startMin;
	const scheduleOvernight =
		window.start !== null && window.end !== null && window.end <= window.start;
	if (workedSpan < 0) {
		if (scheduleOvernight) {
			workedSpan += 24 * 60;
		} else {
			// Same-day inversion without overnight schedule: treat as incomplete.
			return {
				status: "INCOMPLETE",
				incomplete: true,
				timeIn: rawIn,
				timeOut: rawOut,
				breakMinutes: window.breakMinutes,
				totalMinutesWorked: 0,
				regularMinutes: 0,
				overtimeMinutes: 0,
				lateMinutes,
				earlyOutMinutes: 0,
				undertimeMinutes: 0,
				hoursWorked: "0:00",
				regularHours: "0:00",
				overtimeHours: "0:00",
				lateHours: minutesToHoursText(lateMinutes),
				earlyOutHours: "0:00",
				undertimeHours: "0:00",
			};
		}
	}

	const totalMinutesWorked = Math.max(0, workedSpan - window.breakMinutes);
	const regularMinutes = Math.min(totalMinutesWorked, window.regularMinutes);
	const overtimeMinutes = Math.max(0, totalMinutesWorked - regularMinutes);

	let earlyOutMinutes = 0;
	if (window.end !== null && !window.isOff) {
		earlyOutMinutes = Math.max(0, window.end - endMin - window.graceEarlyOut);
	}

	return {
		status: window.isOff ? "PRESENT" : "PRESENT", // rest-day work still PRESENT with OT
		incomplete: false,
		timeIn: rawIn,
		timeOut: rawOut,
		breakMinutes: window.breakMinutes,
		totalMinutesWorked,
		regularMinutes: window.isOff ? 0 : regularMinutes,
		overtimeMinutes: window.isOff ? totalMinutesWorked : overtimeMinutes,
		lateMinutes: window.isOff ? 0 : lateMinutes,
		earlyOutMinutes: window.isOff ? 0 : earlyOutMinutes,
		undertimeMinutes: window.isOff ? 0 : earlyOutMinutes,
		hoursWorked: minutesToHoursText(totalMinutesWorked),
		regularHours: minutesToHoursText(window.isOff ? 0 : regularMinutes),
		overtimeHours: minutesToHoursText(window.isOff ? totalMinutesWorked : overtimeMinutes),
		lateHours: minutesToHoursText(window.isOff ? 0 : lateMinutes),
		earlyOutHours: minutesToHoursText(window.isOff ? 0 : earlyOutMinutes),
		undertimeHours: minutesToHoursText(window.isOff ? 0 : earlyOutMinutes),
	};
}

function emptyMetrics(
	status: Dm4DayMetrics["status"],
	timeIn: string | null,
	timeOut: string | null,
	breakMinutes: number,
): Dm4DayMetrics {
	return {
		status,
		incomplete: status === "INCOMPLETE",
		timeIn,
		timeOut,
		breakMinutes,
		totalMinutesWorked: 0,
		regularMinutes: 0,
		overtimeMinutes: 0,
		lateMinutes: 0,
		earlyOutMinutes: 0,
		undertimeMinutes: 0,
		hoursWorked: "0:00",
		regularHours: "0:00",
		overtimeHours: "0:00",
		lateHours: "0:00",
		earlyOutHours: "0:00",
		undertimeHours: "0:00",
	};
}
