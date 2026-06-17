import { findShiftForDay } from "./schedule.helper";
import { timeToMinutes } from "./timekeeping.helper";

export type LeaveDurationUnit = "FULL_DAY" | "HALF_DAY";
export type LeaveHalfDaySession = "AM" | "PM";

export interface LeaveSessionSegment {
	startTime: string;
	endTime: string;
	minutes: number;
}

export interface LeaveSessionWindow {
	session: LeaveHalfDaySession;
	totalMinutes: number;
	windowStart: string | null;
	windowEnd: string | null;
	segments: LeaveSessionSegment[];
}

export interface LeaveSessionResolution {
	totalWorkMinutes: number;
	splitMinute: number;
	shiftLabel: string;
	am: LeaveSessionWindow;
	pm: LeaveSessionWindow;
}

interface WorkSlotTimeline {
	startMinute: number;
	endMinute: number;
}

interface SlotBoundarySelection {
	boundaryAfterIndex: number;
}

function minutesToTime(minutes: number): string {
	const normalized = ((Math.floor(minutes) % 1440) + 1440) % 1440;
	const hours = Math.floor(normalized / 60)
		.toString()
		.padStart(2, "0");
	const mins = Math.floor(normalized % 60)
		.toString()
		.padStart(2, "0");
	return `${hours}:${mins}`;
}

function toTimelineSlots(timeSlots: any[]): WorkSlotTimeline[] {
	const workSlots = (timeSlots || [])
		.filter((slot) => slot?.type === "work" && slot?.startTime && slot?.endTime)
		.map((slot) => {
			const startMinute = timeToMinutes(slot.startTime);
			let endMinute = timeToMinutes(slot.endTime);
			if (endMinute <= startMinute) {
				endMinute += 1440;
			}
			return { startMinute, endMinute };
		})
		.sort((a, b) => a.startMinute - b.startMinute);

	return workSlots;
}

function buildWindow(
	session: LeaveHalfDaySession,
	segments: LeaveSessionSegment[],
): LeaveSessionWindow {
	return {
		session,
		totalMinutes: segments.reduce((sum, segment) => sum + segment.minutes, 0),
		windowStart: segments.length > 0 ? segments[0].startTime : null,
		windowEnd: segments.length > 0 ? segments[segments.length - 1].endTime : null,
		segments,
	};
}

function toSegments(slots: WorkSlotTimeline[]): LeaveSessionSegment[] {
	return slots.map((slot) => ({
		startTime: minutesToTime(slot.startMinute),
		endTime: minutesToTime(slot.endMinute),
		minutes: slot.endMinute - slot.startMinute,
	}));
}

function chooseBoundaryByLargestGap(workSlots: WorkSlotTimeline[]): SlotBoundarySelection {
	let largestGap = Number.NEGATIVE_INFINITY;
	let largestGapIndex = -1;

	for (let i = 0; i < workSlots.length - 1; i++) {
		const current = workSlots[i];
		const next = workSlots[i + 1];
		const gap = next.startMinute - current.endMinute;

		if (gap > largestGap) {
			largestGap = gap;
			largestGapIndex = i;
		}
	}

	if (largestGapIndex >= 0 && largestGap > 0) {
		return { boundaryAfterIndex: largestGapIndex };
	}

	// No positive gap found (contiguous or overlapping slots). Pick slot boundary nearest to half.
	const totalWorkMinutes = workSlots.reduce(
		(sum, slot) => sum + (slot.endMinute - slot.startMinute),
		0,
	);
	const targetHalf = totalWorkMinutes / 2;
	let consumed = 0;
	let nearestIndex = 0;
	let nearestDelta = Number.POSITIVE_INFINITY;

	for (let i = 0; i < workSlots.length - 1; i++) {
		consumed += workSlots[i].endMinute - workSlots[i].startMinute;
		const delta = Math.abs(targetHalf - consumed);
		if (delta < nearestDelta) {
			nearestDelta = delta;
			nearestIndex = i;
		}
	}

	return { boundaryAfterIndex: nearestIndex };
}

function getDateOnly(date: Date): string {
	return date.toISOString().split("T")[0];
}

export function isHalfDaySessionCutoffReached(
	leaveDate: Date,
	sessionWindowStart: string,
	now: Date = new Date(),
): boolean {
	if (getDateOnly(leaveDate) !== getDateOnly(now)) {
		return false;
	}

	const sessionStartMinute = timeToMinutes(sessionWindowStart);
	const currentMinute = now.getHours() * 60 + now.getMinutes();
	return currentMinute >= sessionStartMinute;
}

export function resolveLeaveSessionWindows(
	employeeSchedule: any,
	date: Date,
): LeaveSessionResolution {
	if (!employeeSchedule) {
		throw new Error("Employee schedule is required for half-day leave.");
	}

	const shift = findShiftForDay(employeeSchedule, date.getUTCDay());
	if (!shift) {
		throw new Error("No schedule shift found for the selected date.");
	}
	if (shift.isRestDay) {
		throw new Error("Half-day leave is not allowed on rest days.");
	}

	const workSlots = toTimelineSlots(shift.timeSlots || []);
	if (workSlots.length === 0) {
		throw new Error("No work slots found in schedule for the selected date.");
	}

	const totalWorkMinutes = workSlots.reduce(
		(sum, slot) => sum + (slot.endMinute - slot.startMinute),
		0,
	);
	if (totalWorkMinutes <= 0) {
		throw new Error("Invalid work slot duration for selected date.");
	}

	let amSegments: LeaveSessionSegment[] = [];
	let pmSegments: LeaveSessionSegment[] = [];

	if (workSlots.length === 1) {
		// Single continuous slot fallback: split into two equal halves.
		const [slot] = workSlots;
		const slotMinutes = slot.endMinute - slot.startMinute;
		const firstHalfMinutes = slotMinutes / 2;
		const splitSlotMinute = slot.startMinute + firstHalfMinutes;

		amSegments = [
			{
				startTime: minutesToTime(slot.startMinute),
				endTime: minutesToTime(splitSlotMinute),
				minutes: firstHalfMinutes,
			},
		];
		pmSegments = [
			{
				startTime: minutesToTime(splitSlotMinute),
				endTime: minutesToTime(slot.endMinute),
				minutes: slotMinutes - firstHalfMinutes,
			},
		];
	} else {
		const { boundaryAfterIndex } = chooseBoundaryByLargestGap(workSlots);
		const amSlots = workSlots.slice(0, boundaryAfterIndex + 1);
		const pmSlots = workSlots.slice(boundaryAfterIndex + 1);
		amSegments = toSegments(amSlots);
		pmSegments = toSegments(pmSlots);
	}

	const splitMinute = amSegments.reduce((sum, segment) => sum + segment.minutes, 0);

	return {
		totalWorkMinutes,
		splitMinute,
		shiftLabel: shift.label || "",
		am: buildWindow("AM", amSegments),
		pm: buildWindow("PM", pmSegments),
	};
}
