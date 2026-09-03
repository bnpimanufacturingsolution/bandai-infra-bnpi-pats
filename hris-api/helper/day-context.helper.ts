import { PrismaClient } from "../generated/prisma";

export type TimesheetDayPrimaryMarker = "HOLIDAY" | "LEAVE" | "REST_DAY" | "ABSENT" | "HOURS";

export type EnrichedLeaveEntry = {
	requestId?: string;
	leaveType: string;
	label: string;
	durationUnit?: string;
	halfDaySession?: string;
	startDate?: string;
	endDate?: string;
};

export type EnrichedHolidayEntry = {
	calendarItemId: string;
	title: string;
	startDate: string;
	endDate: string;
	tags?: string[];
};

const resolveDayKey = (value: unknown): string => {
	if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
		return value.slice(0, 10);
	}
	const parsed = new Date(String(value || ""));
	if (Number.isNaN(parsed.getTime())) return "";
	const year = parsed.getUTCFullYear();
	const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
	const day = String(parsed.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const toDayStartUtc = (dayKey: string): Date => new Date(`${dayKey}T00:00:00.000Z`);
const toDayEndUtc = (dayKey: string): Date => new Date(`${dayKey}T23:59:59.999Z`);

const formatLeaveLabel = (leaveType: string) => {
	const normalized = String(leaveType || "")
		.trim()
		.toUpperCase()
		.replace(/_/g, " ");
	return normalized ? `${normalized} Leave` : "Leave";
};

const extractLeaveEntryFromRequest = (request: {
	id: string;
	startDate: Date | null;
	endDate: Date | null;
	metadata?: unknown;
}): EnrichedLeaveEntry => {
	const metadata =
		request.metadata && typeof request.metadata === "object" && !Array.isArray(request.metadata)
			? (request.metadata as Record<string, unknown>)
			: {};
	const leaveTypeRaw = typeof metadata.leaveType === "string" ? metadata.leaveType : "LEAVE";
	const durationUnit = typeof metadata.durationUnit === "string" ? metadata.durationUnit : undefined;
	const halfDaySession =
		typeof metadata.halfDaySession === "string" ? metadata.halfDaySession : undefined;
	return {
		requestId: request.id,
		leaveType: leaveTypeRaw || "LEAVE",
		label: formatLeaveLabel(leaveTypeRaw || "LEAVE"),
		durationUnit,
		halfDaySession,
		startDate: request.startDate ? request.startDate.toISOString() : undefined,
		endDate: request.endDate ? request.endDate.toISOString() : undefined,
	};
};

const inferSyntheticLeaveType = (notes?: string | null): string => {
	const normalized = String(notes || "").trim();
	if (!normalized) return "LEAVE";
	const match = normalized.match(/([A-Za-z_]+)\s+leave/i);
	if (match?.[1]) return match[1].toUpperCase();
	return "LEAVE";
};

const derivePrimaryMarker = (day: any): TimesheetDayPrimaryMarker => {
	const holidayEntries = Array.isArray(day?.holidayEntries) ? day.holidayEntries : [];
	if (holidayEntries.length > 0) return "HOLIDAY";
	const leaveEntries = Array.isArray(day?.leaveEntries) ? day.leaveEntries : [];
	if (leaveEntries.length > 0) return "LEAVE";
	if (day?.status === "REST_DAY") return "REST_DAY";
	if (day?.status === "ABSENT") return "ABSENT";
	return "HOURS";
};

const buildLeaveHolidayIndex = async (
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeId: string;
		dayKeys: string[];
	},
) => {
	const dayKeys = params.dayKeys;
	if (!dayKeys.length) {
		return {
			leaveByDay: new Map<string, EnrichedLeaveEntry[]>(),
			holidayByDay: new Map<string, EnrichedHolidayEntry[]>(),
		};
	}

	const minDay = dayKeys[0];
	const maxDay = dayKeys[dayKeys.length - 1];
	const minDate = toDayStartUtc(minDay);
	const maxDate = toDayEndUtc(maxDay);
	const dayKeySet = new Set(dayKeys);

	const [approvedLeaveRequests, holidays] = await Promise.all([
		prisma.request.findMany({
			where: {
				organizationId: params.organizationId,
				requesterId: params.employeeId,
				type: "LEAVE",
				isDeleted: false,
				currentWorkflowStateKey: {
					in: ["APPROVED", "COMPLETED"],
				},
				startDate: { lte: maxDate },
				endDate: { gte: minDate },
			},
			select: {
				id: true,
				startDate: true,
				endDate: true,
				metadata: true,
			},
		}),
		prisma.calendarItem.findMany({
			where: {
				organizationId: params.organizationId,
				type: "HOLIDAY",
				status: "ACTIVE",
				startDate: { lte: maxDate },
				endDate: { gte: minDate },
			},
			select: {
				id: true,
				title: true,
				startDate: true,
				endDate: true,
				tags: true,
			},
		}),
	]);

	const leaveByDay = new Map<string, EnrichedLeaveEntry[]>();
	for (const request of approvedLeaveRequests) {
		if (!request.startDate || !request.endDate) continue;
		const start = new Date(Math.max(toDayStartUtc(minDay).getTime(), request.startDate.getTime()));
		const end = new Date(Math.min(toDayEndUtc(maxDay).getTime(), request.endDate.getTime()));
		for (
			let cursor = new Date(start.getTime());
			cursor <= end;
			cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
		) {
			const key = resolveDayKey(cursor);
			if (!dayKeySet.has(key)) continue;
			const entries = leaveByDay.get(key) || [];
			entries.push(extractLeaveEntryFromRequest(request));
			leaveByDay.set(key, entries);
		}
	}

	const holidayByDay = new Map<string, EnrichedHolidayEntry[]>();
	for (const holiday of holidays) {
		const start = new Date(Math.max(toDayStartUtc(minDay).getTime(), holiday.startDate.getTime()));
		const end = new Date(Math.min(toDayEndUtc(maxDay).getTime(), holiday.endDate.getTime()));
		for (
			let cursor = new Date(start.getTime());
			cursor <= end;
			cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
		) {
			const key = resolveDayKey(cursor);
			if (!dayKeySet.has(key)) continue;
			const entries = holidayByDay.get(key) || [];
			entries.push({
				calendarItemId: holiday.id,
				title: holiday.title,
				startDate: holiday.startDate.toISOString(),
				endDate: holiday.endDate.toISOString(),
				tags: holiday.tags,
			});
			holidayByDay.set(key, entries);
		}
	}

	return { leaveByDay, holidayByDay };
};

export const enrichBreakdownWithLeaveHolidayContext = async (
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeId: string;
		breakdown?: any[] | null;
	},
) => {
	const breakdown = Array.isArray(params.breakdown) ? params.breakdown : [];
	if (!breakdown.length) return breakdown;

	const dayKeys = Array.from(
		new Set(
			breakdown
				.map((day) => resolveDayKey(day?.date))
				.filter((value): value is string => Boolean(value)),
		),
	).sort((a, b) => a.localeCompare(b));

	if (!dayKeys.length) return breakdown;
	const { leaveByDay, holidayByDay } = await buildLeaveHolidayIndex(prisma, {
		organizationId: params.organizationId,
		employeeId: params.employeeId,
		dayKeys,
	});

	return breakdown.map((day) => {
		const dayKey = resolveDayKey(day?.date);
		const holidayEntries = dayKey ? holidayByDay.get(dayKey) || [] : [];
		let leaveEntries = dayKey ? leaveByDay.get(dayKey) || [] : [];

		if (day?.status === "LEAVE" && leaveEntries.length === 0) {
			const inferredLeaveType = inferSyntheticLeaveType(day?.employeeNotes || day?.notes || null);
			leaveEntries = [
				{
					leaveType: inferredLeaveType,
					label: formatLeaveLabel(inferredLeaveType),
					startDate: dayKey ? toDayStartUtc(dayKey).toISOString() : undefined,
					endDate: dayKey ? toDayEndUtc(dayKey).toISOString() : undefined,
				},
			];
		}

		const firstLeaveType =
			typeof day?.leaveType === "string" && day.leaveType.trim()
				? day.leaveType
				: leaveEntries[0]?.leaveType || null;

		const enrichedDay = {
			...day,
			leaveType: firstLeaveType,
			leaveEntries,
			holidayEntries,
		};

		return {
			...enrichedDay,
			primaryMarker: derivePrimaryMarker(enrichedDay),
		};
	});
};

export const enrichAttendanceRecordsWithLeaveHolidayContext = async (
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeId: string;
		records?: any[] | null;
	},
) => {
	const records = Array.isArray(params.records) ? params.records : [];
	if (!records.length) return records;

	const dayKeys = Array.from(
		new Set(
			records
				.map((record) => resolveDayKey(record?.date))
				.filter((value): value is string => Boolean(value)),
		),
	).sort((a, b) => a.localeCompare(b));

	if (!dayKeys.length) return records;

	const { leaveByDay, holidayByDay } = await buildLeaveHolidayIndex(prisma, {
		organizationId: params.organizationId,
		employeeId: params.employeeId,
		dayKeys,
	});

	return records.map((record) => {
		const dayKey = resolveDayKey(record?.date);
		const holidayEntries = dayKey ? holidayByDay.get(dayKey) || [] : [];
		let leaveEntries = dayKey ? leaveByDay.get(dayKey) || [] : [];

		if (
			(record?.status === "LEAVE" || record?.status === "ON_LEAVE") &&
			leaveEntries.length === 0
		) {
			const inferredLeaveType = inferSyntheticLeaveType(record?.notes || null);
			leaveEntries = [
				{
					leaveType: inferredLeaveType,
					label: formatLeaveLabel(inferredLeaveType),
					startDate: dayKey ? toDayStartUtc(dayKey).toISOString() : undefined,
					endDate: dayKey ? toDayEndUtc(dayKey).toISOString() : undefined,
				},
			];
		}

		const firstLeaveType =
			typeof record?.leaveType === "string" && record.leaveType.trim()
				? record.leaveType
				: leaveEntries[0]?.leaveType || null;

		const enrichedRecord = {
			...record,
			leaveType: firstLeaveType,
			leaveEntries,
			holidayEntries,
		};

		const marker = derivePrimaryMarker(enrichedRecord);

		// For presentation consistency in attendance screens, prevent holiday/leave
		// from surfacing as plain ABSENT/NOT_CLOCKED_IN status labels.
		const statusOverride =
			marker === "HOLIDAY"
				? "HOLIDAY"
				: marker === "LEAVE"
					? "LEAVE"
					: enrichedRecord.status;

		return {
			...enrichedRecord,
			status: statusOverride,
			primaryMarker: marker,
		};
	});
};

export const enrichAttendanceRecordsBatchWithLeaveHolidayContext = async (
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeRecords: Array<{
			employeeId: string;
			records?: any[] | null;
		}>;
	},
) => {
	const employeeRecords = Array.isArray(params.employeeRecords) ? params.employeeRecords : [];
	if (!employeeRecords.length) return employeeRecords;

	const normalizedSets = employeeRecords
		.map((entry) => ({
			employeeId: String(entry?.employeeId || "").trim(),
			records: Array.isArray(entry?.records) ? entry.records : [],
		}))
		.filter((entry) => entry.employeeId && entry.records.length > 0);

	if (!normalizedSets.length) return employeeRecords;

	const employeeIds = Array.from(new Set(normalizedSets.map((entry) => entry.employeeId)));
	const dayKeys = Array.from(
		new Set(
			normalizedSets.flatMap((entry) =>
				entry.records
					.map((record) => resolveDayKey(record?.date))
					.filter((value): value is string => Boolean(value)),
			),
		),
	).sort((a, b) => a.localeCompare(b));

	if (!employeeIds.length || !dayKeys.length) {
		return normalizedSets;
	}

	const minDay = dayKeys[0];
	const maxDay = dayKeys[dayKeys.length - 1];
	const minDate = toDayStartUtc(minDay);
	const maxDate = toDayEndUtc(maxDay);
	const dayKeySet = new Set(dayKeys);

	const [approvedLeaveRequests, holidays] = await Promise.all([
		prisma.request.findMany({
			where: {
				organizationId: params.organizationId,
				requesterId: { in: employeeIds },
				type: "LEAVE",
				isDeleted: false,
				currentWorkflowStateKey: {
					in: ["APPROVED", "COMPLETED"],
				},
				startDate: { lte: maxDate },
				endDate: { gte: minDate },
			},
			select: {
				id: true,
				requesterId: true,
				startDate: true,
				endDate: true,
				metadata: true,
			},
		}),
		prisma.calendarItem.findMany({
			where: {
				organizationId: params.organizationId,
				type: "HOLIDAY",
				status: "ACTIVE",
				startDate: { lte: maxDate },
				endDate: { gte: minDate },
			},
			select: {
				id: true,
				title: true,
				startDate: true,
				endDate: true,
				tags: true,
			},
		}),
	]);

	const leaveByEmployeeDay = new Map<string, Map<string, EnrichedLeaveEntry[]>>();
	for (const request of approvedLeaveRequests) {
		if (!request.startDate || !request.endDate || !request.requesterId) continue;
		const employeeDayMap =
			leaveByEmployeeDay.get(request.requesterId) || new Map<string, EnrichedLeaveEntry[]>();
		const start = new Date(Math.max(minDate.getTime(), request.startDate.getTime()));
		const end = new Date(Math.min(maxDate.getTime(), request.endDate.getTime()));

		for (
			let cursor = new Date(start.getTime());
			cursor <= end;
			cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
		) {
			const key = resolveDayKey(cursor);
			if (!dayKeySet.has(key)) continue;
			const entries = employeeDayMap.get(key) || [];
			entries.push(extractLeaveEntryFromRequest(request));
			employeeDayMap.set(key, entries);
		}

		leaveByEmployeeDay.set(request.requesterId, employeeDayMap);
	}

	const holidayByDay = new Map<string, EnrichedHolidayEntry[]>();
	for (const holiday of holidays) {
		const start = new Date(Math.max(minDate.getTime(), holiday.startDate.getTime()));
		const end = new Date(Math.min(maxDate.getTime(), holiday.endDate.getTime()));
		for (
			let cursor = new Date(start.getTime());
			cursor <= end;
			cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
		) {
			const key = resolveDayKey(cursor);
			if (!dayKeySet.has(key)) continue;
			const entries = holidayByDay.get(key) || [];
			entries.push({
				calendarItemId: holiday.id,
				title: holiday.title,
				startDate: holiday.startDate.toISOString(),
				endDate: holiday.endDate.toISOString(),
				tags: holiday.tags,
			});
			holidayByDay.set(key, entries);
		}
	}

	return normalizedSets.map((entry) => {
		const leaveByDay = leaveByEmployeeDay.get(entry.employeeId) || new Map();
		return {
			employeeId: entry.employeeId,
			records: entry.records.map((record) => {
				const dayKey = resolveDayKey(record?.date);
				const holidayEntries = dayKey ? holidayByDay.get(dayKey) || [] : [];
				let leaveEntries = dayKey ? leaveByDay.get(dayKey) || [] : [];

				if (
					(record?.status === "LEAVE" || record?.status === "ON_LEAVE") &&
					leaveEntries.length === 0
				) {
					const inferredLeaveType = inferSyntheticLeaveType(record?.notes || null);
					leaveEntries = [
						{
							leaveType: inferredLeaveType,
							label: formatLeaveLabel(inferredLeaveType),
							startDate: dayKey ? toDayStartUtc(dayKey).toISOString() : undefined,
							endDate: dayKey ? toDayEndUtc(dayKey).toISOString() : undefined,
						},
					];
				}

				const firstLeaveType =
					typeof record?.leaveType === "string" && record.leaveType.trim()
						? record.leaveType
						: leaveEntries[0]?.leaveType || null;

				const enrichedRecord = {
					...record,
					leaveType: firstLeaveType,
					leaveEntries,
					holidayEntries,
				};

				const marker = derivePrimaryMarker(enrichedRecord);
				const statusOverride =
					marker === "HOLIDAY"
						? "HOLIDAY"
						: marker === "LEAVE"
							? "LEAVE"
							: enrichedRecord.status;

				return {
					...enrichedRecord,
					status: statusOverride,
					primaryMarker: marker,
				};
			}),
		};
	});
};
