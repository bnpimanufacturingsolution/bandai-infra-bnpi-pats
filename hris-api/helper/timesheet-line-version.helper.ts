import { PrismaClient } from "../generated/prisma";

type TimesheetLineLedgerType = "SNAPSHOT" | "CORRECTION" | "HR_ADJUSTMENT" | "SYSTEM_REBUILD";

type SnapshotSourceType = "ATTENDANCE_OBLIGATION" | "MANUAL_BREAKDOWN" | "ATTENDANCE";

function asRecord(value: unknown): Record<string, any> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, any>)
		: {};
}

function firstArrayItem(value: unknown): Record<string, any> | null {
	return Array.isArray(value) && value.length && typeof value[0] === "object"
		? (value[0] as Record<string, any>)
		: null;
}

function isUniqueConstraintError(error: unknown): boolean {
	const record = asRecord(error);
	return (
		record.code === "P2002" ||
		String(record.message || "").includes("Unique constraint failed")
	);
}

export function buildTimesheetDaySnapshotMetadata(params: {
	baseMetadata?: Record<string, any> | null;
	source: {
		type: SnapshotSourceType;
		id?: string | null;
		status?: string | null;
		reason?: string | null;
		requestId?: string | null;
	};
	marker: string;
	schedule?: unknown;
	leave?: Record<string, any> | null;
	holiday?: Record<string, any> | null;
	revision?: {
		editedAt: string;
		editedBy: string | null;
		reason: string | null;
	} | null;
	snapshottedAt?: Date;
}) {
	const baseMetadata = asRecord(params.baseMetadata);
	const oldLeaveEntry = firstArrayItem(baseMetadata.leaveEntries);
	const oldHolidayEntry = firstArrayItem(baseMetadata.holidayEntries);
	const leave =
		params.leave ??
		(params.marker === "LEAVE"
			? {
					requestId: params.source.requestId ?? oldLeaveEntry?.requestId ?? oldLeaveEntry?.id ?? null,
					type: baseMetadata.leaveType ?? oldLeaveEntry?.leaveType ?? oldLeaveEntry?.type ?? null,
					durationUnit: oldLeaveEntry?.durationUnit ?? null,
					halfDaySession: oldLeaveEntry?.halfDaySession ?? null,
					title: oldLeaveEntry?.title ?? null,
				}
			: null);
	const holiday =
		params.holiday ??
		(params.marker === "HOLIDAY"
			? {
					calendarItemId: oldHolidayEntry?.calendarItemId ?? oldHolidayEntry?.id ?? null,
					title: oldHolidayEntry?.title ?? null,
					type: oldHolidayEntry?.holidayType ?? oldHolidayEntry?.type ?? null,
				}
			: null);

	return {
		...baseMetadata,
		snapshotVersion: 1,
		snapshotType: "TIMESHEET_DAY",
		snapshottedAt: (params.snapshottedAt || new Date()).toISOString(),
		source: {
			type: params.source.type,
			id: params.source.id ?? null,
			status: params.source.status ?? null,
			reason: params.source.reason ?? null,
			requestId: params.source.requestId ?? null,
		},
		day: {
			marker: params.marker,
			leave,
			holiday,
			schedule: params.schedule ?? null,
		},
		revision: params.revision ?? null,
		primaryMarker: params.marker,
	};
}

export async function writeEffectiveTimesheetLine(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		timesheetId: string;
		date: Date;
		data: Record<string, any>;
		versionMode?: "update" | "version";
		ledgerType?: TimesheetLineLedgerType;
		editedBy?: string | null;
		editReason?: string | null;
		/**
		 * Lookup-skip lane: when the caller preloaded the sheet's effective
		 * lines (same predicates + revision ordering as the findFirst below),
		 * pass the preloaded row (or null when the date is absent) to skip a
		 * per-day round-trip. Create-collision fallback still guards races.
		 */
		preloadedLine?: any;
		skipExistingLineLookup?: boolean;
	},
) {
	const current = params.skipExistingLineLookup
		? (params.preloadedLine ?? null)
		: await (prisma as any).timesheetline.findFirst({
				where: {
					organizationId: params.organizationId,
					timesheetId: params.timesheetId,
					date: params.date,
					isDeleted: false,
					isEffective: true,
				},
				orderBy: [{ revisionNo: "desc" }, { updatedAt: "desc" }],
			});

	if (!current) {
		const createData = {
			...params.data,
			revisionNo: 1,
			isEffective: true,
			ledgerType: params.ledgerType || params.data.ledgerType || "SNAPSHOT",
		};
		try {
			return await (prisma as any).timesheetline.create({
				data: createData,
			});
		} catch (error) {
			if (!isUniqueConstraintError(error) || params.versionMode === "version") {
				throw error;
			}
			const collision = await (prisma as any).timesheetline.findFirst({
				where: {
					organizationId: params.organizationId,
					timesheetId: params.timesheetId,
					date: params.date,
				},
				orderBy: [{ isEffective: "desc" }, { revisionNo: "desc" }, { updatedAt: "desc" }],
			});
			if (!collision) throw error;
			return (prisma as any).timesheetline.update({
				where: { id: collision.id },
				data: {
					...params.data,
					isDeleted: false,
					isEffective: true,
					revisionNo: collision.revisionNo || 1,
					ledgerType:
						params.ledgerType ||
						params.data.ledgerType ||
						collision.ledgerType ||
						"SNAPSHOT",
				},
			});
		}
	}

	if (params.versionMode === "version") {
		const now = new Date();
		const editedAt = params.data.editedAt || now;
		const metadata = asRecord(params.data.metadata);
		const nextLine = await (prisma as any).timesheetline.create({
			data: {
				...params.data,
				revisionNo: Number(current.revisionNo || 1) + 1,
				isEffective: true,
				ledgerType: params.ledgerType || "CORRECTION",
				supersedesLineId: current.id,
				supersededById: null,
				supersededAt: null,
				editedAt,
				editedBy: params.editedBy ?? params.data.editedBy ?? null,
				editReason: params.editReason ?? params.data.editReason ?? null,
				metadata: {
					...metadata,
					revision: {
						editedAt: editedAt.toISOString(),
						editedBy: params.editedBy ?? params.data.editedBy ?? null,
						reason: params.editReason ?? params.data.editReason ?? null,
						...(typeof metadata.revision?.source === "string"
							? { source: metadata.revision.source }
							: {}),
					},
				},
			},
		});

		await (prisma as any).timesheetline.update({
			where: { id: current.id },
			data: {
				isEffective: false,
				supersededAt: now,
				supersededById: nextLine.id,
			},
		});

		return nextLine;
	}

	return (prisma as any).timesheetline.update({
		where: { id: current.id },
		data: {
			...params.data,
			isEffective: true,
			revisionNo: current.revisionNo || 1,
			ledgerType: params.ledgerType || params.data.ledgerType || current.ledgerType || "SNAPSHOT",
		},
	});
}
