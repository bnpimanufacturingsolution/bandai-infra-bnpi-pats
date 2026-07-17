/**
 * Event-first Sync logs preview catalog.
 * DeviceEvent is saved truth. DeviceUser inventory must never invent lifecycle rows.
 */

export type SyncLogsSourceProof = "Operation logs" | "Attendance/access events" | string;

export type SyncLogsEventRow = {
	key: string;
	eventLabel: string;
	businessArea: string;
	willAdd: number | null;
	alreadyInHris: number;
	sourceProof: SyncLogsSourceProof;
	readsFrom: "ContentMgmt/logSearch" | "AccessControl/AcsEvent" | string;
	filterAfterSync: string;
	whereToFind: string;
	status: "Ready" | "Needs review" | "Unavailable" | "No new rows" | "Partial" | "Failed" | string;
	confidenceLabel?: string | null;
	reviewReason?: string | null;
	sourceDetail?: string | null;
	deviceLabels?: string[];
	eventCategory?: string | null;
	eventAction?: string | null;
	evidenceSource?: "ISAPI_LOGSEARCH" | "SDK_CALLBACK" | string | null;
};

export type SyncLogsSourceCheck = {
	key: "operation_logs" | "attendance_access" | string;
	label: string;
	readsFrom: string;
	ok: boolean;
	total: number | null;
	error?: string | null;
	status: "ready" | "unavailable" | "partial" | "stale" | string;
};

type CatalogEntry = {
	eventAction: string;
	eventLabel: string;
	eventCategory: string;
	sourceProof: SyncLogsSourceProof;
	readsFrom: SyncLogsEventRow["readsFrom"];
	filterAfterSync: string;
	evidenceSource: SyncLogsEventRow["evidenceSource"];
	family: "operation" | "attendance";
};

/** User-facing Sync logs event groups (required product set). */
export const SYNC_LOGS_EVENT_CATALOG: CatalogEntry[] = [
	{
		eventAction: "FINGERPRINT_ENROLLED",
		eventLabel: "Fingerprint enrolled",
		eventCategory: "ENROLLMENT",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "Enrollment > Fingerprint enrolled",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "FINGERPRINT_UPDATED",
		eventLabel: "Fingerprint updated",
		eventCategory: "ENROLLMENT",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "Enrollment > Fingerprint updated",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "FINGERPRINT_DELETED",
		eventLabel: "Fingerprint deleted",
		eventCategory: "ENROLLMENT",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "Enrollment > Fingerprint deleted",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "FACE_ENROLLED",
		eventLabel: "Face enrolled",
		eventCategory: "ENROLLMENT",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "Enrollment > Face enrolled",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "FACE_UPDATED",
		eventLabel: "Face updated",
		eventCategory: "ENROLLMENT",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "Enrollment > Face updated",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "FACE_DELETED",
		eventLabel: "Face deleted",
		eventCategory: "ENROLLMENT",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "Enrollment > Face deleted",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "CARD_ENROLLED",
		eventLabel: "Card enrolled",
		eventCategory: "ENROLLMENT",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "Enrollment > Card enrolled",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "CARD_UPDATED",
		eventLabel: "Card updated",
		eventCategory: "ENROLLMENT",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "Enrollment > Card updated",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "CARD_DELETED",
		eventLabel: "Card deleted",
		eventCategory: "ENROLLMENT",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "Enrollment > Card deleted",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "USER_CREATED",
		eventLabel: "User created",
		eventCategory: "USER_MANAGEMENT",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "User Management > User created",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "USER_UPDATED",
		eventLabel: "User updated",
		eventCategory: "USER_MANAGEMENT",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "User Management > User updated",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "USER_DELETED",
		eventLabel: "User deleted",
		eventCategory: "USER_MANAGEMENT",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "User Management > User deleted",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "UNKNOWN_OPERATION",
		// Residual logSearch totals that were not classified into enroll/user rows.
		// Not the same as proven "new enrollments".
		eventLabel: "Unclassified device operation",
		eventCategory: "UNKNOWN",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "Needs review > Unclassified device operation",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "TAP",
		eventLabel: "Attendance tap",
		eventCategory: "ATTENDANCE",
		sourceProof: "Attendance/access events",
		readsFrom: "AccessControl/AcsEvent",
		filterAfterSync: "Attendance > Tap",
		evidenceSource: "SDK_CALLBACK",
		family: "attendance",
	},
	{
		eventAction: "TAP_REJECTED",
		eventLabel: "Rejected tap",
		eventCategory: "ATTENDANCE",
		sourceProof: "Attendance/access events",
		readsFrom: "AccessControl/AcsEvent",
		filterAfterSync: "Attendance > Tap rejected",
		evidenceSource: "SDK_CALLBACK",
		family: "attendance",
	},
	{
		eventAction: "UNKNOWN_ACCESS",
		eventLabel: "Unknown access event",
		eventCategory: "UNKNOWN",
		sourceProof: "Attendance/access events",
		readsFrom: "AccessControl/AcsEvent",
		filterAfterSync: "Needs review > Unknown access event",
		evidenceSource: "SDK_CALLBACK",
		family: "attendance",
	},
];

const OPERATION_ACTIONS = new Set(
	SYNC_LOGS_EVENT_CATALOG.filter((row) => row.family === "operation").map((row) => row.eventAction),
);
const ATTENDANCE_ACTIONS = new Set(
	SYNC_LOGS_EVENT_CATALOG.filter((row) => row.family === "attendance").map((row) => row.eventAction),
);

const businessAreaForEvent = (entry: Pick<CatalogEntry, "eventCategory" | "eventAction">) => {
	if (entry.eventAction === "UNKNOWN_OPERATION" || entry.eventAction === "UNKNOWN_ACCESS") return "Needs review";
	if (entry.eventCategory === "USER_MANAGEMENT") return "User Management";
	if (entry.eventCategory === "ENROLLMENT") return "Enrollment";
	if (entry.eventCategory === "ATTENDANCE") return "Attendance";
	return "Needs review";
};

const reviewReasonForEvent = (entry: Pick<CatalogEntry, "eventAction">) => {
	if (entry.eventAction === "UNKNOWN_OPERATION") {
		return "HRIS could not identify this device action yet.";
	}
	if (entry.eventAction === "UNKNOWN_ACCESS") {
		return "HRIS could not identify this access event yet.";
	}
	return null;
};

const buildSourceDetail = (params: {
	entry: CatalogEntry;
	deviceLabels?: string[];
}) => {
	const readLabel =
		params.entry.family === "operation"
			? "Read from device operation logs."
			: "Read from attendance/access events.";
	const sourceLabels = (params.deviceLabels || []).filter(Boolean);
	const deviceLabel = sourceLabels.length ? ` Device label: ${sourceLabels.join(", ")}.` : "";
	const hrisLabel =
		params.entry.eventAction === "UNKNOWN_OPERATION" || params.entry.eventAction === "UNKNOWN_ACCESS"
			? " HRIS will hold this for review instead of saving it as a known event."
			: ` HRIS will save this as: ${params.entry.eventLabel}.`;
	return `${readLabel}${deviceLabel}${hrisLabel}`;
};

const normalizeActionKey = (raw: unknown) => {
	const value = String(raw || "").trim().toUpperCase();
	if (!value) return "UNKNOWN";
	if (value === "UNKNOWN" || value === "LISTENER_RECEIVED") return "UNKNOWN_OPERATION";
	if (value === "UNKNOWN_ACCESS" || value === "UNKNOWN_ACS") return "UNKNOWN_ACCESS";
	return value;
};

export const countAlreadyInHrisByAction = (
	rows: Array<{ eventAction?: string | null; count?: number | null }>,
) => {
	const map = new Map<string, number>();
	for (const row of rows) {
		const key = normalizeActionKey(row.eventAction);
		const next = (map.get(key) || 0) + Math.max(0, Number(row.count || 0));
		map.set(key, next);
	}
	// Map generic UNKNOWN from attendance source rows if taxonomy stored UNKNOWN for ACS
	return map;
};

const rowStatus = (params: {
	willAdd: number | null;
	alreadyInHris: number;
	sourceOk: boolean;
	needsReview?: boolean;
	failed?: boolean;
}): SyncLogsEventRow["status"] => {
	if (params.failed || !params.sourceOk) return "Unavailable";
	if (params.needsReview) return "Needs review";
	if (params.willAdd === null) return "Needs review";
	if (params.willAdd > 0) return "Ready";
	if (params.alreadyInHris > 0) return "No new rows";
	return "No new rows";
};

/**
 * Build event-first rows for one Hikvision device.
 * willAdd for attendance uses ACS total residual (assigned primarily to Attendance tap).
 * willAdd for operations uses exact per-action device counts when provided;
 * residual logSearch total lands on Unknown operation when breakdown is incomplete.
 */
export const buildHikvisionSyncLogsEventRows = (params: {
	deviceId: string;
	alreadyByAction: Map<string, number>;
	/** Optional classified counts from device Operation logs sample/full. */
	operationDeviceByAction?: Map<string, number> | null;
	/** Optional user-facing vendor labels sampled from Operation logs by action. */
	operationDeviceLabelsByAction?: Map<string, string[]> | null;
	operationSourceOk: boolean;
	operationSourceTotal: number | null;
	attendanceSourceOk: boolean;
	attendanceSourceTotal: number | null;
	sourceError?: string | null;
	/** When true, keep silent zero rows out of the main table. */
	hideSilentZeros?: boolean;
}): SyncLogsEventRow[] => {
	const already = params.alreadyByAction;
	const opDevice = params.operationDeviceByAction || new Map<string, number>();
	const opLabels = params.operationDeviceLabelsByAction || new Map<string, string[]>();
	const failed = Boolean(params.sourceError);

	const alreadyOperationTotal = Array.from(already.entries())
		.filter(([action]) => OPERATION_ACTIONS.has(action) || action === "UNKNOWN")
		.reduce((sum, [, count]) => sum + count, 0);
	const alreadyAttendanceTotal = Array.from(already.entries())
		.filter(([action]) => ATTENDANCE_ACTIONS.has(action) || action === "UNKNOWN")
		.reduce((sum, [, count]) => sum + count, 0);

	// Prefer explicit UNKNOWN_ACCESS / UNKNOWN_OPERATION buckets; fall back to raw UNKNOWN.
	const alreadyUnknownOp =
		(already.get("UNKNOWN_OPERATION") || 0) +
		(already.get("UNKNOWN") || 0) -
		// avoid double-count if both set
		0;
	const alreadyUnknownAccess = already.get("UNKNOWN_ACCESS") || 0;

	const attendanceResidual =
		params.attendanceSourceOk && params.attendanceSourceTotal !== null
			? Math.max(0, Number(params.attendanceSourceTotal) - alreadyAttendanceTotal)
			: null;

	const operationDeviceTotal = Array.from(opDevice.values()).reduce((a, b) => a + b, 0);
	const operationResidualFromTotal =
		params.operationSourceOk && params.operationSourceTotal !== null
			? Math.max(0, Number(params.operationSourceTotal) - alreadyOperationTotal)
			: null;

	const rows: SyncLogsEventRow[] = SYNC_LOGS_EVENT_CATALOG.map((entry) => {
		const actionKey =
			entry.eventAction === "UNKNOWN_OPERATION"
				? "UNKNOWN_OPERATION"
				: entry.eventAction === "UNKNOWN_ACCESS"
					? "UNKNOWN_ACCESS"
					: entry.eventAction;
		let alreadyInHris = already.get(actionKey) || 0;
		if (entry.eventAction === "UNKNOWN_OPERATION" && alreadyInHris === 0) {
			alreadyInHris = already.get("UNKNOWN") || alreadyUnknownOp || 0;
		}

		let willAdd: number | null = null;
		let needsReview = false;

		if (entry.family === "attendance") {
			const sourceOk = params.attendanceSourceOk && !failed;
			if (entry.eventAction === "TAP") {
				willAdd = sourceOk ? attendanceResidual : null;
			} else if (entry.eventAction === "TAP_REJECTED") {
				// Without ACS minor breakdown, do not invent rejected will-add.
				willAdd = sourceOk ? 0 : null;
			} else if (entry.eventAction === "UNKNOWN_ACCESS") {
				willAdd = sourceOk ? 0 : null;
				if (sourceOk && alreadyInHris > 0) needsReview = true;
			}
			const status = rowStatus({
				willAdd,
				alreadyInHris,
				sourceOk,
				needsReview,
				failed: failed && !params.attendanceSourceOk,
			});
			return {
				key: `${params.deviceId}-${entry.eventAction}`,
				eventLabel: entry.eventLabel,
				businessArea: businessAreaForEvent(entry),
				willAdd,
				alreadyInHris,
				sourceProof: entry.sourceProof,
				readsFrom: entry.readsFrom,
				filterAfterSync: entry.filterAfterSync,
				whereToFind: `Device Events > ${entry.filterAfterSync}`,
				status,
				confidenceLabel: entry.eventAction === "UNKNOWN_ACCESS" ? "Needs review" : status === "Ready" ? "Ready" : status,
				reviewReason: reviewReasonForEvent(entry),
				sourceDetail: buildSourceDetail({ entry }),
				eventCategory: entry.eventCategory,
				eventAction: entry.eventAction,
				evidenceSource: entry.evidenceSource,
			};
		}

		// Operation logs family
		const sourceOk = params.operationSourceOk && !failed;
		const deviceCount = opDevice.get(entry.eventAction) ?? opDevice.get(actionKey);
		if (typeof deviceCount === "number" && Number.isFinite(deviceCount)) {
			// Classified device counts for this action.
			// Fingerprint enrolled / User created come from logSearch classification,
			// not from dumping residual totals into Unknown.
			willAdd = Math.max(0, Number(deviceCount) - alreadyInHris);
		} else if (entry.eventAction === "UNKNOWN_OPERATION") {
			// Residual that is not classified as enroll/user/card/etc.
			// This is NOT proof of new enrollments — only unclassified log volume.
			const residual = operationResidualFromTotal;
			if (residual === null) {
				willAdd = null;
				needsReview = sourceOk;
			} else {
				const knownWill = Array.from(opDevice.entries())
					.filter(([action]) => action !== "UNKNOWN_OPERATION" && action !== "UNKNOWN")
					.reduce((sum, [action, count]) => {
						const alreadyFor = already.get(action) || 0;
						return sum + Math.max(0, count - alreadyFor);
					}, 0);
				willAdd = Math.max(0, residual - knownWill);
				// Always needs review: operator must not treat residual as enroll truth.
				needsReview = true;
			}
		} else if (sourceOk && operationResidualFromTotal !== null && operationDeviceTotal === 0) {
			// Source total known but no per-type breakdown yet: do not invent enroll will-add.
			willAdd = 0;
			needsReview = operationResidualFromTotal > 0;
		} else if (!sourceOk) {
			willAdd = null;
		} else {
			willAdd = 0;
		}

		const status = rowStatus({
			willAdd,
			alreadyInHris,
			sourceOk,
			needsReview: needsReview || (entry.eventAction === "UNKNOWN_OPERATION" && (willAdd || 0) > 0),
			failed: failed && !params.operationSourceOk,
		});

		return {
			key: `${params.deviceId}-${entry.eventAction}`,
			eventLabel: entry.eventLabel,
			businessArea: businessAreaForEvent(entry),
			willAdd,
			alreadyInHris,
			sourceProof: entry.sourceProof,
			readsFrom: entry.readsFrom,
			filterAfterSync: entry.filterAfterSync,
			whereToFind: `Device Events > ${entry.filterAfterSync}`,
			status,
			confidenceLabel: entry.eventAction === "UNKNOWN_OPERATION" ? "Needs review" : status === "Ready" ? "Ready" : status,
			reviewReason: reviewReasonForEvent(entry),
			sourceDetail: buildSourceDetail({
				entry,
				deviceLabels: opLabels.get(entry.eventAction) || opLabels.get(actionKey) || [],
			}),
			deviceLabels: opLabels.get(entry.eventAction) || opLabels.get(actionKey) || [],
			eventCategory: entry.eventCategory,
			eventAction: entry.eventAction,
			evidenceSource: entry.evidenceSource,
		};
	});

	if (params.hideSilentZeros !== false) {
		return rows.filter(
			(row) =>
				(row.willAdd !== null && row.willAdd > 0) ||
				row.alreadyInHris > 0 ||
				row.status === "Needs review" ||
				row.status === "Unavailable" ||
				row.status === "Failed" ||
				row.status === "Partial",
		);
	}
	return rows;
};

export const buildHikvisionSourceChecks = (params: {
	operationOk: boolean;
	operationTotal: number | null;
	operationError?: string | null;
	attendanceOk: boolean;
	attendanceTotal: number | null;
	attendanceError?: string | null;
}): SyncLogsSourceCheck[] => [
	{
		key: "operation_logs",
		label: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		ok: params.operationOk,
		total: params.operationTotal,
		error: params.operationError || null,
		status: params.operationOk ? "ready" : "unavailable",
	},
	{
		key: "attendance_access",
		label: "Attendance/access events",
		readsFrom: "AccessControl/AcsEvent",
		ok: params.attendanceOk,
		total: params.attendanceTotal,
		error: params.attendanceError || null,
		status: params.attendanceOk ? "ready" : "unavailable",
	},
];

export const buildZktecoSyncLogsEventRows = (params: {
	deviceId: string;
	willAdd: number | null;
	alreadyInHris: number;
	sourceProof: string;
	sourceOk: boolean;
	error?: string | null;
}): SyncLogsEventRow[] => {
	const willAdd = params.willAdd;
	const status = params.error
		? "Unavailable"
		: !params.sourceOk
			? "Unavailable"
			: willAdd === null
				? "Needs review"
				: willAdd > 0
					? "Ready"
					: "No new rows";
	return [
		{
			key: `${params.deviceId}-device-events`,
			eventLabel: "Device events",
			businessArea: "Attendance",
			willAdd,
			alreadyInHris: params.alreadyInHris,
			sourceProof: params.sourceProof,
			readsFrom: params.sourceProof,
			filterAfterSync: "Device Events",
			whereToFind: "Device Events",
			status,
			confidenceLabel: status === "Ready" ? "Ready" : status,
			sourceDetail: "Read from device attendance logs. HRIS will save this in Device Events.",
			eventCategory: "ATTENDANCE",
			eventAction: "TAP",
			evidenceSource: "ZKTECO_EVENT",
		},
	].filter(
		(row) =>
			(row.willAdd !== null && row.willAdd > 0) ||
			row.alreadyInHris > 0 ||
			row.status === "Needs review" ||
			row.status === "Unavailable",
	);
};
