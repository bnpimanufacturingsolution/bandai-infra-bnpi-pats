import type { PrismaClient } from "../generated/prisma";
import { calculateShiftHour } from "./schedule-normalization.helper";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const BNPI_DEFAULT_SCHEDULE_CODE = "BNPI_MON_FRI_DAY_8_5";
const MANUAL_DAY_SHIFT_NAME = "Manual Day Shift";
const MANUAL_DAY_SHIFT_CODE = "MANUAL_DAY_8_5";
const MANUAL_DAY_TIME_SLOTS = [
	{ type: "work", label: "Morning Work", startTime: "08:00", endTime: "12:00" },
	{ type: "break", label: "Lunch Break", startTime: "12:00", endTime: "13:00" },
	{ type: "work", label: "Afternoon Work", startTime: "13:00", endTime: "17:00" },
];

export type EmployeeScheduleSnapshot = {
	source: "override" | "template";
	scheduleOverrideId?: string | null;
	scheduleTemplateId?: string | null;
	scheduleTemplateName?: string | null;
	shiftTypeId?: string | null;
	shiftTypeCode?: string | null;
	shiftTypeName?: string | null;
	templateDay?: number | null;
	cycleDays?: number | null;
	isOff?: boolean;
	isOvernight?: boolean;
	breakMinutes?: number | null;
	graceLateMinutes?: number | null;
	graceEarlyOutMinutes?: number | null;
	startTime?: string | null;
	endTime?: string | null;
	shiftHour?: number | null;
	timeSlots?: Array<{
		type: string;
		label?: string | null;
		startTime: string;
		endTime: string;
	}>;
	metadata?: any;
};

export type ShiftTypeSnapshot = {
	name?: string | null;
	code?: string | null;
	isOvernight?: boolean;
	isOff?: boolean;
	shiftHour?: number;
	timeSlots?: Array<{
		type: string;
		label?: string | null;
		startTime: string;
		endTime: string;
	}>;
};

const buildDefaultWorkSlots = (startTime?: string | null, endTime?: string | null) => {
	if (!startTime || !endTime) return [];
	return [
		{
			type: "work",
			label: "Work",
			startTime,
			endTime,
		},
	];
};

const toMinutes = (value?: string | null): number | null => {
	if (!value || typeof value !== "string") return null;
	const [hours, minutes] = value.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
	return hours * 60 + minutes;
};

const normalizeOrderedTimeSlots = (
	timeSlots: Array<{ type: string; startTime: string; endTime: string }>,
) => {
	let previousEndMinutes: number | null = null;

	return timeSlots
		.filter(
			(slot) =>
				typeof slot?.startTime === "string" &&
				typeof slot?.endTime === "string" &&
				slot.startTime &&
				slot.endTime,
		)
		.map((slot) => {
			const startMinutes = toMinutes(slot.startTime);
			const endMinutes = toMinutes(slot.endTime);

			if (startMinutes === null || endMinutes === null) {
				return null;
			}

			let absoluteStart = startMinutes;
			let absoluteEnd = endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes;

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
		})
		.filter(Boolean) as Array<{
		type: string;
		startTime: string;
		endTime: string;
		absoluteStart: number;
		absoluteEnd: number;
	}>;
};

const deriveShiftWindowFromSlots = (
	timeSlots: Array<{ type: string; startTime: string; endTime: string }>,
) => {
	const workSlots = normalizeOrderedTimeSlots(timeSlots).filter((slot) => slot.type === "work");
	if (!workSlots.length) return { startTime: null, endTime: null };
	const first = workSlots.reduce((earliest, current) =>
		current.absoluteStart < earliest.absoluteStart ? current : earliest,
	);
	const last = workSlots.reduce((latest, current) =>
		current.absoluteEnd > latest.absoluteEnd ? current : latest,
	);
	return {
		startTime: first.startTime || null,
		endTime: last.endTime || null,
	};
};

const deriveBreakMinutesFromSlots = (
	timeSlots: Array<{ type: string; startTime: string; endTime: string }>,
) =>
	timeSlots
		.filter(
			(slot) =>
				slot?.type === "break" &&
				typeof slot?.startTime === "string" &&
				typeof slot?.endTime === "string",
		)
		.reduce((total, slot) => {
			const start = toMinutes(slot.startTime);
			const end = toMinutes(slot.endTime);
			if (start === null || end === null) return total;
			const normalizedEnd = end >= start ? end : end + 24 * 60;
			return total + Math.max(0, normalizedEnd - start);
		}, 0);

const isZeroTimeSlot = (slot: any) =>
	String(slot?.startTime || "") === "00:00" && String(slot?.endTime || "") === "00:00";

const shouldUseManualDayDefault = (snapshot: any) => {
	if (!snapshot || typeof snapshot !== "object" || snapshot.isOff) return false;
	const slots = Array.isArray(snapshot.timeSlots) ? snapshot.timeSlots : [];
	if (!slots.length) return true;
	const workSlots = slots.filter((slot: any) => String(slot?.type || "work").toLowerCase() === "work");
	return workSlots.length > 0 && workSlots.every(isZeroTimeSlot);
};

const normalizeBadManualSnapshot = (snapshot: any) => {
	if (!shouldUseManualDayDefault(snapshot)) return snapshot;
	return {
		...snapshot,
		name: snapshot?.name || MANUAL_DAY_SHIFT_NAME,
		code: snapshot?.code || MANUAL_DAY_SHIFT_CODE,
		isOvernight: false,
		isOff: false,
		timeSlots: MANUAL_DAY_TIME_SLOTS,
	};
};

export const toShiftTypeSnapshot = (shiftType: any): ShiftTypeSnapshot => {
	const timeSlots = Array.isArray(shiftType?.timeSlots)
		? shiftType.timeSlots
		: buildDefaultWorkSlots(shiftType?.startTime, shiftType?.endTime);

	return {
		name: shiftType?.name || null,
		code: shiftType?.code || null,
		isOvernight: Boolean(shiftType?.isOvernight),
		isOff: Boolean(shiftType?.isOff),
		timeSlots,
		shiftHour: calculateShiftHour({ ...shiftType, timeSlots }),
	};
};

export const normalizeEmployeeScheduleSnapshot = (value: any): EmployeeScheduleSnapshot | null => {
	if (!value || typeof value !== "object") return null;
	value = normalizeBadManualSnapshot(value);
	const source = value.source === "override" ? "override" : "template";
	const timeSlots = Array.isArray(value.timeSlots) ? value.timeSlots : [];
	const breakMin =
		value.breakMinutes !== null && value.breakMinutes !== undefined
			? Number(value.breakMinutes)
			: deriveBreakMinutesFromSlots(timeSlots);
	const derivedWindow =
		value.startTime || value.endTime ? null : deriveShiftWindowFromSlots(timeSlots);
	return {
		...value,
		source,
		isOff: Boolean(value.isOff),
		isOvernight: Boolean(value.isOvernight),
		timeSlots,
		breakMinutes: breakMin,
		startTime: value.startTime || derivedWindow?.startTime || null,
		endTime: value.endTime || derivedWindow?.endTime || null,
		graceLateMinutes:
			value.graceLateMinutes === null || value.graceLateMinutes === undefined
				? undefined
				: Number(value.graceLateMinutes),
		graceEarlyOutMinutes:
			value.graceEarlyOutMinutes === null || value.graceEarlyOutMinutes === undefined
				? undefined
				: Number(value.graceEarlyOutMinutes),
	};
};

const normalizeDateOnly = (date: Date): Date => {
	const next = new Date(date);
	next.setUTCHours(0, 0, 0, 0);
	return next;
};

const toSnapshot = (
	source: "override" | "template",
	base: {
		scheduleOverrideId?: string | null;
		scheduleTemplateId?: string | null;
		scheduleTemplateName?: string | null;
		templateDay?: number | null;
		cycleDays?: number | null;
	},
	shiftType: any,
): EmployeeScheduleSnapshot => {
	const timeSlots = Array.isArray(shiftType?.timeSlots)
		? shiftType.timeSlots
		: buildDefaultWorkSlots(shiftType?.startTime, shiftType?.endTime);
	const { startTime, endTime } = deriveShiftWindowFromSlots(timeSlots);
	const breakMinutes = deriveBreakMinutesFromSlots(timeSlots);
	return {
		source,
		scheduleOverrideId: base.scheduleOverrideId || null,
		scheduleTemplateId: base.scheduleTemplateId || null,
		scheduleTemplateName: base.scheduleTemplateName || null,
		shiftTypeId: shiftType?.id || null,
		shiftTypeCode: shiftType?.code || null,
		shiftTypeName: shiftType?.name || null,
		templateDay: base.templateDay ?? null,
		cycleDays: base.cycleDays ?? null,
		isOff: Boolean(shiftType?.isOff),
		isOvernight: Boolean(shiftType?.isOvernight),
		breakMinutes,
		graceLateMinutes: 0,
		graceEarlyOutMinutes: 0,
		startTime,
		endTime,
		shiftHour: calculateShiftHour({ ...shiftType, timeSlots }),
		timeSlots,
		metadata: null,
	};
};

const toOverrideScheduleSnapshot = (override: any): EmployeeScheduleSnapshot | null => {
	const snapshot = override?.shiftSnapshot;
	if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
		return null;
	}

	return normalizeEmployeeScheduleSnapshot({
		...snapshot,
		source: "override",
		scheduleOverrideId: override.id || snapshot.scheduleOverrideId || null,
		shiftTypeId: override.shiftTypeId || snapshot.shiftTypeId || null,
		shiftTypeCode: snapshot.shiftTypeCode || snapshot.code || null,
		shiftTypeName: snapshot.shiftTypeName || snapshot.name || null,
	});
};

export const copyShiftTypeToTemplatePatternDay = async (
	prisma: PrismaClient,
	params: {
		organizationId: string;
		pattern: Array<{ day: number; shiftTypeId?: string | null; shiftSnapshot?: any }>;
	},
) => {
	const ids = Array.from(
		new Set(
			(params.pattern || [])
				.map((day) => (day?.shiftTypeId ? String(day.shiftTypeId) : ""))
				.filter(Boolean),
		),
	);
	const shiftTypes = ids.length
		? await (prisma as any).shiftType.findMany({
				where: {
					organizationId: params.organizationId,
					id: { in: ids },
					isDeleted: false,
				},
			})
		: [];
	const shiftTypeMap = new Map(
		shiftTypes.map((shiftType: any) => [String(shiftType.id), shiftType]),
	);

	return (params.pattern || []).map((day) => {
		const shiftTypeId = day?.shiftTypeId ? String(day.shiftTypeId) : null;
		const shiftType = shiftTypeId ? shiftTypeMap.get(shiftTypeId) : null;
		if (shiftTypeId && !shiftType && !day?.shiftSnapshot) {
			throw new Error(`ShiftType not found for pattern day ${day?.day}: ${shiftTypeId}`);
		}
		return {
			day: Number(day?.day || 0),
			shiftTypeId,
			shiftSnapshot: shiftType ? toShiftTypeSnapshot(shiftType) : day?.shiftSnapshot || null,
			shiftHour: calculateShiftHour(shiftType || day?.shiftSnapshot),
		};
	});
};

export const anchorToMondayUtc = (date: Date): Date => {
	const anchored = new Date(date);
	anchored.setUTCHours(0, 0, 0, 0);
	const day = anchored.getUTCDay();
	const diffToMonday = day === 0 ? -6 : 1 - day;
	anchored.setUTCDate(anchored.getUTCDate() + diffToMonday);
	return anchored;
};

export const copyTemplateToEmployeeEmbeddedSchedule = (params: {
	template: any;
	assignedByEmployeeId?: string | null;
	reason?: string | null;
	effectiveStartDate?: Date | null;
	effectiveEndDate?: Date | null;
	alignWeekStart?: boolean;
	version?: number;
}) => {
	const cycleDays = Math.max(1, Number(params.template?.cycleDays || 1));
	const sourcePattern = Array.isArray(params.template?.pattern) ? params.template.pattern : [];
	const rawStart = params.effectiveStartDate || new Date();
	const isWeekAligned = params.alignWeekStart !== false && cycleDays % 7 === 0;
	const cycleAnchorDate = isWeekAligned ? anchorToMondayUtc(rawStart) : rawStart;
	return {
		templateId: params.template?.id || null,
		templateCode: params.template?.code || null,
		templateName: params.template?.name || null,
		cycleDays,
		graceLateMinutes: Math.max(0, Number(params.template?.graceLateMinutes || 0)),
		graceEarlyOutMinutes: Math.max(0, Number(params.template?.graceEarlyOutMinutes || 0)),
		pattern: sourcePattern.map((day: any) => ({
			day: Number(day?.day || 0),
			shiftTypeId: day?.shiftTypeId ? String(day.shiftTypeId) : null,
			shiftSnapshot: day?.shiftSnapshot || null,
		})),
		effectiveStartDate: rawStart,
		cycleAnchorDate,
		effectiveEndDate: params.effectiveEndDate || null,
		assignedAt: new Date(),
		assignedByEmployeeId: params.assignedByEmployeeId || null,
		reason: params.reason || null,
		version: params.version || 1,
	};
};

export const buildDayHoursShiftSnapshot = (params: {
	isOff?: boolean;
	startTime?: string | null;
	endTime?: string | null;
	name?: string | null;
	code?: string | null;
}) => {
	if (params.isOff) {
		return {
			name: params.name || "Off Day",
			code: params.code || "OFF",
			isOff: true,
			isOvernight: false,
			timeSlots: [] as Array<{
				type: string;
				label?: string | null;
				startTime: string;
				endTime: string;
			}>,
		};
	}
	const startTime = String(params.startTime || "08:00");
	const endTime = String(params.endTime || "17:00");
	const startMinutes = toMinutes(startTime) ?? 0;
	const endMinutes = toMinutes(endTime) ?? 0;
	return {
		name: params.name || `${startTime} to ${endTime}`,
		code:
			params.code ||
			`WH_${startTime.replace(":", "")}_${endTime.replace(":", "")}`,
		isOff: false,
		isOvernight: endMinutes <= startMinutes,
		timeSlots: [
			{
				type: "work",
				label: "Work",
				startTime,
				endTime,
			},
		],
	};
};

export const buildManualPatternEmbeddedSchedule = (params: {
	pattern: Array<{
		day?: number;
		shiftTypeId?: string | null;
		shiftSnapshot?: ShiftTypeSnapshot | null;
		isOff?: boolean;
		startTime?: string | null;
		endTime?: string | null;
	}>;
	startDate?: Date | null;
	assignedByEmployeeId?: string | null;
	reason?: string | null;
	graceLateMinutes?: number | null;
	graceEarlyOutMinutes?: number | null;
	version?: number;
	templateName?: string | null;
	templateCode?: string | null;
}) => {
	const sourcePattern = Array.isArray(params.pattern) ? params.pattern : [];
	const cycleDays = Math.max(7, sourcePattern.length || 7);
	const padded = Array.from({ length: cycleDays }).map((_, index) => {
		return sourcePattern.find((item) => Number(item?.day) === index + 1) || sourcePattern[index] || {};
	});
	const pattern = padded.map((day, index) => {
		const shiftSnapshot =
			day?.shiftSnapshot ||
			buildDayHoursShiftSnapshot({
				isOff: Boolean(day?.isOff),
				startTime: day?.startTime,
				endTime: day?.endTime,
			});
		return {
			day: index + 1,
			shiftTypeId: day?.shiftTypeId ? String(day.shiftTypeId) : null,
			shiftSnapshot,
		};
	});
	return copyTemplateToEmployeeEmbeddedSchedule({
		template: {
			id: null,
			code: params.templateCode || "WEEKLY_HOURS",
			name: params.templateName || "Weekly hours",
			cycleDays,
			graceLateMinutes: params.graceLateMinutes ?? 15,
			graceEarlyOutMinutes: params.graceEarlyOutMinutes ?? 0,
			pattern,
		},
		assignedByEmployeeId: params.assignedByEmployeeId || null,
		reason: params.reason || "weekly_hours_assignment",
		effectiveStartDate: params.startDate || new Date(),
		version: params.version || 1,
	});
};

const scheduleDateKey = (value: unknown) => {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(String(value));
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString().slice(0, 10);
};

const comparableSchedule = (schedule: any) => ({
	templateId: schedule?.templateId || null,
	templateCode: schedule?.templateCode || null,
	templateName: schedule?.templateName || null,
	cycleDays: Number(schedule?.cycleDays || 0),
	graceLateMinutes: Number(schedule?.graceLateMinutes || 0),
	graceEarlyOutMinutes: Number(schedule?.graceEarlyOutMinutes || 0),
	effectiveStartDate: scheduleDateKey(schedule?.effectiveStartDate),
	cycleAnchorDate: scheduleDateKey(schedule?.cycleAnchorDate),
	effectiveEndDate: scheduleDateKey(schedule?.effectiveEndDate),
	pattern: Array.isArray(schedule?.pattern)
		? schedule.pattern.map((day: any) => ({
				day: Number(day?.day || 0),
				shiftTypeId: day?.shiftTypeId ? String(day.shiftTypeId) : null,
				shiftSnapshot: day?.shiftSnapshot || null,
			}))
		: [],
});

export const isSameEmployeeScheduleAssignment = (left: any, right: any) =>
	JSON.stringify(comparableSchedule(left)) === JSON.stringify(comparableSchedule(right));

const resolveDefaultScheduleSnapshot = async (
	prisma: PrismaClient,
	params: {
		organizationId: string;
		date: Date;
	},
): Promise<EmployeeScheduleSnapshot | null> => {
	const template = await (prisma as any).scheduleTemplate.findFirst({
		where: {
			organizationId: params.organizationId,
			code: BNPI_DEFAULT_SCHEDULE_CODE,
			isActive: true,
			isDeleted: false,
		},
		select: {
			id: true,
			code: true,
			name: true,
			cycleDays: true,
			graceLateMinutes: true,
			graceEarlyOutMinutes: true,
			pattern: true,
		},
	});
	if (!template) return null;

	const embeddedSchedule = copyTemplateToEmployeeEmbeddedSchedule({
		template,
		effectiveStartDate: params.date,
		reason: "attendance_default_schedule",
	});
	const shiftTypeIds = Array.from(
		new Set(
			(Array.isArray(embeddedSchedule.pattern) ? embeddedSchedule.pattern : [])
				.map((item: any) => (item?.shiftTypeId ? String(item.shiftTypeId) : ""))
				.filter(Boolean),
		),
	);
	const shiftTypes = shiftTypeIds.length
		? await (prisma as any).shiftType.findMany({
				where: {
					organizationId: params.organizationId,
					isDeleted: false,
					id: { in: shiftTypeIds },
				},
			})
		: [];
	const shiftTypeById = new Map<string, any>(
		shiftTypes.map((shiftType: any) => [String(shiftType.id), shiftType]),
	);
	const resolved = resolveEmbeddedScheduleSnapshot(
		{ embeddedSchedule },
		params.date,
		shiftTypeById,
	);
	return resolved
		? {
				...resolved,
				metadata: {
					...((resolved.metadata && typeof resolved.metadata === "object")
						? resolved.metadata
						: {}),
					source: "attendance_default_schedule",
				},
			}
		: null;
};

export const appendEmployeeScheduleHistory = async (
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeId: string;
		action: "assigned" | "reassigned" | "cleared";
		actorEmployeeId?: string | null;
		reason?: string | null;
		effectiveAt?: Date | null;
		beforeSchedule?: any;
		afterSchedule?: any;
		metadata?: any;
	},
) => {
	await (prisma as any).employeeScheduleHistory.create({
		data: {
			organizationId: params.organizationId,
			employeeId: params.employeeId,
			action: params.action,
			effectiveAt: params.effectiveAt || new Date(),
			actorEmployeeId: params.actorEmployeeId || null,
			reason: params.reason || null,
			beforeSchedule: params.beforeSchedule || null,
			afterSchedule: params.afterSchedule || null,
			metadata: params.metadata || null,
		},
	});
};

const dateRangeWhere = (date: Date) => {
	const start = normalizeDateOnly(date);
	const end = new Date(start);
	end.setUTCDate(end.getUTCDate() + 1);
	return { start, end };
};

const resolveEmbeddedScheduleSnapshot = (
	employee: any,
	date: Date,
	shiftTypeById?: ShiftTypeLookup,
): EmployeeScheduleSnapshot | null => {
	const embedded = normalizeEmbeddedScheduleContainer(employee?.embeddedSchedule);
	if (!embedded) return null;

	const pattern = Array.isArray(embedded?.pattern) ? embedded.pattern : [];
	if (!pattern.length) return null;

	const cycleDays = Math.max(1, Number(embedded?.cycleDays || pattern.length || 1));
	const targetDay = normalizeDateOnly(date);
	const embeddedEffectiveStart = embedded?.effectiveStartDate
		? normalizeDateOnly(new Date(embedded.effectiveStartDate))
		: null;
	if (
		embedded?.effectiveStartDate &&
		embeddedEffectiveStart &&
		targetDay.getTime() < embeddedEffectiveStart.getTime()
	) {
		return null;
	}
	const embeddedEffectiveEnd = embedded?.effectiveEndDate
		? normalizeDateOnly(new Date(embedded.effectiveEndDate))
		: null;
	if (
		embedded?.effectiveEndDate &&
		embeddedEffectiveEnd &&
		targetDay.getTime() > embeddedEffectiveEnd.getTime()
	) {
		return null;
	}
	const storedAnchor = embedded?.cycleAnchorDate || embedded?.scheduleAnchorDate || null;
	const fallbackStart =
		embedded?.effectiveStartDate ||
		employee?.employmentStartDate ||
		employee?.employmentHireDate ||
		date;
	const shouldWeekAlign = !storedAnchor && cycleDays % 7 === 0;
	const anchorDate = normalizeDateOnly(
		new Date(shouldWeekAlign ? anchorToMondayUtc(new Date(fallbackStart)) : storedAnchor || fallbackStart),
	);
	const diffDays = Math.floor(
		(targetDay.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24),
	);
	const cycleIndex = ((diffDays % cycleDays) + cycleDays) % cycleDays;
	const templateDay = cycleIndex + 1;
	const matchedPattern = pattern.find((item: any) => Number(item?.day) === templateDay);
	const matchedShiftTypeId = matchedPattern?.shiftTypeId
		? String(matchedPattern.shiftTypeId)
		: null;
	const matchedShiftType = matchedShiftTypeId ? shiftTypeById?.get(matchedShiftTypeId) : null;
	let shiftSnapshot =
		matchedPattern?.shiftSnapshot ||
		(matchedShiftType ? toShiftTypeSnapshot(matchedShiftType) : null);
	if (!shiftSnapshot) return null;
	shiftSnapshot = normalizeBadManualSnapshot(shiftSnapshot);

	const timeSlots = Array.isArray(shiftSnapshot?.timeSlots)
		? shiftSnapshot.timeSlots
		: buildDefaultWorkSlots(shiftSnapshot?.startTime, shiftSnapshot?.endTime);
	const { startTime, endTime } = deriveShiftWindowFromSlots(timeSlots);
	const breakMinutes = deriveBreakMinutesFromSlots(timeSlots);

	return {
		source: "template",
		scheduleOverrideId: null,
		scheduleTemplateId: embedded?.templateId || null,
		scheduleTemplateName: embedded?.templateName || null,
		shiftTypeId: matchedShiftTypeId || matchedShiftType?.id || null,
		shiftTypeCode: shiftSnapshot?.code || matchedShiftType?.code || null,
		shiftTypeName: shiftSnapshot?.name || matchedShiftType?.name || null,
		templateDay,
		cycleDays,
		isOff: Boolean(shiftSnapshot?.isOff),
		isOvernight: Boolean(shiftSnapshot?.isOvernight),
		breakMinutes,
		graceLateMinutes: Math.max(0, Number(embedded?.graceLateMinutes || 0)),
		graceEarlyOutMinutes: Math.max(0, Number(embedded?.graceEarlyOutMinutes || 0)),
		startTime,
		endTime,
		timeSlots,
		metadata: null,
	};
};

const normalizeEmbeddedScheduleContainer = (value: any) => {
	if (value?.set && typeof value.set === "object" && !Array.isArray(value.set)) {
		return value.set;
	}
	return value;
};

export async function resolveEffectiveShift(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeId: string;
		date: Date;
	},
): Promise<EmployeeScheduleSnapshot | null> {
	const { organizationId, employeeId, date } = params;
	const { start, end } = dateRangeWhere(date);

	const override = await (prisma as any).scheduleOverride.findFirst({
		where: {
			organizationId,
			employeeId,
			isDeleted: false,
			date: {
				gte: start,
				lt: end,
			},
		},
		include: {
			shiftType: true,
		},
		orderBy: {
			createdAt: "desc",
		},
	});
	if (override) {
		const overrideSnapshot = toOverrideScheduleSnapshot(override);
		if (overrideSnapshot) return overrideSnapshot;

		if (override.shiftType) {
			return toSnapshot(
				"override",
				{
					scheduleOverrideId: override.id,
				},
				override.shiftType,
			);
		}
	}

	const employee = await (prisma as any).employee.findFirst({
		where: {
			organizationId,
			id: employeeId,
			isDeleted: false,
		},
		select: {
			id: true,
			embeddedSchedule: true,
			employmentStartDate: true,
			employmentHireDate: true,
			scheduleHistoryRecords: {
				where: {
					organizationId,
					effectiveAt: {
						lte: normalizeDateOnly(date),
					},
				},
				orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
				select: {
					effectiveAt: true,
					createdAt: true,
					afterSchedule: true,
				},
			},
		},
	});
	if (!employee) return null;
	const embeddedResolved = resolveEmbeddedScheduleSnapshot(employee, date);
	if (embeddedResolved) return embeddedResolved;

	const embeddedShiftTypeIds = Array.from(
		new Set(
			(Array.isArray((employee as any)?.embeddedSchedule?.pattern)
				? (employee as any).embeddedSchedule.pattern
				: []
			)
				.map((item: any) => (item?.shiftTypeId ? String(item.shiftTypeId) : ""))
				.filter(Boolean),
		),
	);
	if (!embeddedShiftTypeIds.length) {
		return null;
	}

	const shiftTypes = await (prisma as any).shiftType.findMany({
		where: {
			organizationId,
			isDeleted: false,
			id: { in: embeddedShiftTypeIds },
		},
	});
	const shiftTypeById = new Map<string, any>(
		shiftTypes.map((shiftType: any) => [String(shiftType.id), shiftType]),
	);
	return resolveEmbeddedScheduleSnapshot(employee, date, shiftTypeById);
}

const toDateKeyUTC = (value: Date | string | null | undefined): string | null => {
	if (!value) return null;
	const date = value instanceof Date ? new Date(value) : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return normalizeDateOnly(date).toISOString().split("T")[0];
};

const toComparableNumber = (value: Date | string | null | undefined): number => {
	if (!value) return 0;
	const date = value instanceof Date ? new Date(value) : new Date(value);
	return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const resolveEffectiveEmbeddedScheduleForDate = (employee: any, date: Date) => {
	const target = normalizeDateOnly(date).getTime();
	const historyRecords = Array.isArray(employee?.scheduleHistoryRecords)
		? employee.scheduleHistoryRecords
		: [];
	const matching = historyRecords
		.filter((record: any) => record?.afterSchedule && typeof record.afterSchedule === "object")
		.filter((record: any) => {
			const effective = record?.effectiveAt ? normalizeDateOnly(new Date(record.effectiveAt)) : null;
			if (!effective || Number.isNaN(effective.getTime())) return false;
			return effective.getTime() <= target;
		})
		.sort((a: any, b: any) => {
			const effectiveDelta =
				toComparableNumber(b?.effectiveAt) - toComparableNumber(a?.effectiveAt);
			if (effectiveDelta !== 0) return effectiveDelta;
			return toComparableNumber(b?.createdAt) - toComparableNumber(a?.createdAt);
		});
	if (matching.length > 0) return matching[0].afterSchedule;

	const earliestRecord = historyRecords
		.filter((record: any) => record?.effectiveAt)
		.sort((a: any, b: any) => {
			const effectiveDelta =
				toComparableNumber(a?.effectiveAt) - toComparableNumber(b?.effectiveAt);
			if (effectiveDelta !== 0) return effectiveDelta;
			return toComparableNumber(a?.createdAt) - toComparableNumber(b?.createdAt);
		})[0];
	if (
		earliestRecord?.beforeSchedule &&
		typeof earliestRecord.beforeSchedule === "object"
	) {
		const earliestEffective = normalizeDateOnly(new Date(earliestRecord.effectiveAt)).getTime();
		if (!Number.isNaN(earliestEffective) && target < earliestEffective) {
			return earliestRecord.beforeSchedule;
		}
	}

	const embedded = normalizeEmbeddedScheduleContainer(employee?.embeddedSchedule);
	if (!embedded || typeof embedded !== "object") return null;
	if (!historyRecords.length) return embedded;
	if (!embedded?.effectiveStartDate) return embedded;
	const embeddedStart = normalizeDateOnly(new Date(embedded.effectiveStartDate));
	if (Number.isNaN(embeddedStart.getTime())) return null;
	const embeddedEnd = embedded?.effectiveEndDate
		? normalizeDateOnly(new Date(embedded.effectiveEndDate))
		: null;
	if (embeddedEnd && !Number.isNaN(embeddedEnd.getTime()) && target > embeddedEnd.getTime()) {
		return null;
	}
	return embeddedStart.getTime() <= target ? embedded : null;
};

type ShiftTypeLookup = Map<string, any>;

export const collectShiftTypeIdsFromEmployeeScheduleData = (employee: any): string[] => {
	const ids = new Set<string>();

	const embeddedSchedule = normalizeEmbeddedScheduleContainer(employee?.embeddedSchedule);
	const embeddedPattern = Array.isArray(embeddedSchedule?.pattern)
		? embeddedSchedule.pattern
		: [];
	for (const day of embeddedPattern) {
		if (day?.shiftTypeId) ids.add(String(day.shiftTypeId));
	}

	for (const override of Array.isArray(employee?.scheduleOverrides)
		? employee.scheduleOverrides
		: []) {
		if (override?.shiftTypeId) ids.add(String(override.shiftTypeId));
		if (override?.shiftSnapshot?.shiftTypeId) ids.add(String(override.shiftSnapshot.shiftTypeId));
	}

	for (const historyRecord of Array.isArray(employee?.scheduleHistoryRecords)
		? employee.scheduleHistoryRecords
		: []) {
		const beforePattern = Array.isArray(historyRecord?.beforeSchedule?.pattern)
			? historyRecord.beforeSchedule.pattern
			: [];
		for (const day of beforePattern) {
			if (day?.shiftTypeId) ids.add(String(day.shiftTypeId));
		}

		const afterPattern = Array.isArray(historyRecord?.afterSchedule?.pattern)
			? historyRecord.afterSchedule.pattern
			: [];
		for (const day of afterPattern) {
			if (day?.shiftTypeId) ids.add(String(day.shiftTypeId));
		}
	}

	return Array.from(ids);
};

export const resolveEffectiveShiftFromEmployeeData = (
	employee: any,
	date: Date,
	shiftTypeById: ShiftTypeLookup,
): EmployeeScheduleSnapshot | null => {
	const target = normalizeDateOnly(date);
	const targetKey = target.toISOString().split("T")[0];

	const overrides = (Array.isArray(employee?.scheduleOverrides) ? employee.scheduleOverrides : [])
		.filter((item: any) => !item?.isDeleted)
		.filter((item: any) => toDateKeyUTC(item?.date) === targetKey)
		.sort(
			(a: any, b: any) =>
				toComparableNumber(b?.createdAt || b?.updatedAt) -
				toComparableNumber(a?.createdAt || a?.updatedAt),
		);

	const override = overrides[0];
	if (override) {
		const overrideSnapshot = toOverrideScheduleSnapshot(override);
		if (overrideSnapshot) return overrideSnapshot;

		const shiftType =
			override.shiftType || shiftTypeById.get(String(override.shiftTypeId || "")) || null;
		if (shiftType) {
			return toSnapshot(
				"override",
				{
					scheduleOverrideId: override.id,
				},
				shiftType,
			);
		}
	}

	const effectiveEmbedded = resolveEffectiveEmbeddedScheduleForDate(employee, target);
	const employeeWithEffectiveEmbedded = effectiveEmbedded
		? {
				...employee,
				embeddedSchedule: effectiveEmbedded,
		  }
		: employee;
	const embeddedResolved = resolveEmbeddedScheduleSnapshot(employeeWithEffectiveEmbedded, target);
	if (!embeddedResolved) {
		const embeddedShiftTypeIds = Array.isArray(effectiveEmbedded?.pattern)
			? effectiveEmbedded.pattern
					.map((item: any) => (item?.shiftTypeId ? String(item.shiftTypeId) : ""))
					.filter(Boolean)
			: [];
		if (embeddedShiftTypeIds.length > 0) {
			const embeddedShiftTypeMap = new Map<string, any>();
			for (const id of embeddedShiftTypeIds) {
				const shiftType = shiftTypeById.get(String(id));
				if (shiftType) embeddedShiftTypeMap.set(String(id), shiftType);
			}
			const fallbackEmbeddedResolved = resolveEmbeddedScheduleSnapshot(
				employeeWithEffectiveEmbedded,
				target,
				embeddedShiftTypeMap,
			);
			if (fallbackEmbeddedResolved) return fallbackEmbeddedResolved;
		}
	}
	if (embeddedResolved) return embeddedResolved;
	return null;
};

export function toLegacyScheduleSnapshotForDate(
	resolvedShift: EmployeeScheduleSnapshot | null,
	date: Date = new Date(),
) {
	if (!resolvedShift) return null;
	const targetDay = DAY_NAMES[date.getUTCDay()];
	const shifts = DAY_NAMES.map((dayName) => ({
		label: dayName,
		isRestDay: dayName === targetDay ? Boolean(resolvedShift.isOff) : true,
		timeSlots: dayName === targetDay ? resolvedShift.timeSlots || [] : [],
	}));
	return {
		entryId: resolvedShift.scheduleOverrideId || resolvedShift.shiftTypeId || "unknown",
		isActive: true,
		scheduleId: resolvedShift.scheduleTemplateId || null,
		scheduleCode: resolvedShift.shiftTypeCode || "SHIFT",
		scheduleName: resolvedShift.scheduleTemplateName || resolvedShift.shiftTypeName || "Shift",
		startDate: normalizeDateOnly(date),
		endDate: null,
		shifts,
		gracePeriodMinutes: resolvedShift.graceLateMinutes || 0,
		source: resolvedShift.source,
		metadata: { resolvedShift },
	};
}

export const normalizeEmployeeScheduleEntries = (employee: any): any[] =>
	employee?.embeddedSchedule
		? [
				{
					entryId: String(
						employee.embeddedSchedule?.templateId ||
							employee.embeddedSchedule?.templateCode ||
							employee.id ||
							"schedule",
					),
					isActive: true,
					scheduleId: employee.embeddedSchedule?.templateId || null,
					scheduleCode: String(employee.embeddedSchedule?.templateCode || "MANUAL"),
					scheduleName: String(employee.embeddedSchedule?.templateName || "Manual Input"),
					startDate: employee.embeddedSchedule?.effectiveStartDate || null,
					endDate: null,
					shifts: [],
					gracePeriodMinutes: Math.max(
						0,
						Number(employee.embeddedSchedule?.graceLateMinutes || 0),
					),
					source: "embedded_schedule",
					changedByEmployeeId: employee.embeddedSchedule?.assignedByEmployeeId || null,
					changedAt: employee.embeddedSchedule?.assignedAt || null,
					metadata: {
						version: employee.embeddedSchedule?.version || null,
					},
				},
			]
		: [];

export const getActiveEmployeeScheduleEntry = (employee: any): any | null => {
	const entries = normalizeEmployeeScheduleEntries(employee);
	const active = entries.find((entry) => entry && entry.isActive);
	if (active) return active;
	return entries.length ? entries[entries.length - 1] : null;
};

export const toScheduleSnapshotFromEntry = (entry: any): any | null => {
	if (!entry) return null;
	return {
		entryId: String(entry.entryId || entry.scheduleId || entry.scheduleCode || "schedule"),
		isActive: Boolean(entry.isActive ?? true),
		scheduleId: entry.scheduleId || null,
		scheduleCode: String(entry.scheduleCode || "UNKNOWN"),
		scheduleName: String(entry.scheduleName || "Unknown Schedule"),
		startDate: entry.startDate || null,
		endDate: entry.endDate || null,
		shifts: Array.isArray(entry.shifts) ? entry.shifts : [],
		gracePeriodMinutes: Math.max(0, Number(entry.gracePeriodMinutes || 0)),
		source: entry.source || "legacy",
		changedByEmployeeId: entry.changedByEmployeeId || null,
		changedAt: entry.changedAt || null,
		metadata: entry.metadata ?? null,
		timeSlots: [],
	};
};

export const resolveEmployeeActiveSchedule = (employee: any, date: Date = new Date()): any | null => {
	const embeddedResolved = resolveEmbeddedScheduleSnapshot(employee, date);
	if (embeddedResolved) return toLegacyScheduleSnapshotForDate(embeddedResolved, date);
	const resolved = employee?.currentResolvedShift || employee?.scheduleSnapshot || null;
	return toLegacyScheduleSnapshotForDate(resolved, date);
};
