export type DeviceEventsRealtimeStatusInput = {
	isConnected: boolean;
	organizationId?: string | null;
	liveDeviceId?: string | null;
	deviceId: string;
	selectedDeviceName?: string | null;
	liveDeviceName?: string | null;
};

export const getDeviceEventsRealtimeStatus = ({
	isConnected,
	organizationId,
	liveDeviceId,
	deviceId,
	selectedDeviceName,
	liveDeviceName,
}: DeviceEventsRealtimeStatusInput) => {
	const selectedDeviceId = deviceId !== "all" ? deviceId : "";
	const isScoped = Boolean(organizationId || selectedDeviceId || liveDeviceId);
	const isListening = Boolean(isConnected && isScoped);
	const scopeLabel =
		deviceId !== "all"
			? selectedDeviceName || liveDeviceName || "Selected device"
			: organizationId
				? "All devices"
				: "All devices";

	return {
		isListening,
		isScoped,
		scopeLabel,
		statusLabel: isListening
			? "Saved-row updates on"
			: isConnected
				? "Socket connected"
				: "Realtime offline",
		rowUpdateLabel: isListening ? "Saved rows update live" : "Refresh needed",
	};
};

export type SavedDeviceEventScopeCandidate = {
	deviceId?: string | null;
	status?: string | null;
	source?: string | null;
};

export type SavedDeviceEventScope = {
	deviceId?: string | null;
	status?: string | null;
	source?: string | null;
};

export const savedDeviceEventMatchesScope = (
	event: SavedDeviceEventScopeCandidate,
	scope: SavedDeviceEventScope,
) => {
	if (scope.deviceId && scope.deviceId !== "all" && event.deviceId !== scope.deviceId) {
		return false;
	}
	if (scope.status && scope.status !== "all" && event.status !== scope.status) {
		return false;
	}
	if (scope.source && scope.source !== "all" && event.source !== scope.source) {
		return false;
	}
	return true;
};

const getTimeMs = (value?: string | Date | null) => {
	if (!value) return null;
	const parsed = value instanceof Date ? value : new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

export const getSavedDeviceEventProcessingLabel = ({
	itemId,
	latestRealtimeEventId,
	receivedAt,
	eventTime,
	source,
}: {
	itemId: string;
	latestRealtimeEventId?: string | null;
	receivedAt?: string | Date | null;
	eventTime?: string | Date | null;
	source?: string | null;
}) => {
	if (itemId && latestRealtimeEventId && itemId === latestRealtimeEventId) {
		return source === "EN_HCNETSDK_ALARM" ? "Listener save" : "Saved now";
	}

	const receivedAtMs = getTimeMs(receivedAt);
	const eventTimeMs = getTimeMs(eventTime);
	if (
		receivedAtMs !== null &&
		eventTimeMs !== null &&
		receivedAtMs - eventTimeMs > 2 * 60 * 1000
	) {
		return "Synced save";
	}

	return "Historical punch";
};

export const getSavedDeviceEventRealtimeBadge = ({
	viewMode,
	itemId,
	latestRealtimeEventId,
	highlightedSavedEventId,
}: {
	viewMode: "live" | "saved";
	itemId: string;
	latestRealtimeEventId?: string | null;
	highlightedSavedEventId?: string | null;
}) => {
	if (viewMode !== "saved") return null;
	if (itemId === latestRealtimeEventId && itemId === highlightedSavedEventId) return "Live socket";
	if (itemId === highlightedSavedEventId) return "Newest saved";
	return null;
};

export const getHighlightedSavedDeviceEventId = ({
	latestSavedEventId,
	latestRealtimeEventId,
	isLatestSavedFresh,
}: {
	latestSavedEventId?: string | null;
	latestRealtimeEventId?: string | null;
	isLatestSavedFresh: boolean;
}) => {
	if (isLatestSavedFresh && latestSavedEventId) return latestSavedEventId;
	return latestRealtimeEventId || latestSavedEventId || null;
};

export const resolveActiveSavedDeviceEvent = <T extends { id: string }>({
	action,
	eventId,
	pageRows,
	fetchedEvent,
}: {
	action?: string | null;
	eventId?: string | null;
	pageRows: T[];
	fetchedEvent?: T | null;
}): T | null => {
	if (action !== "view-event" || !eventId) return null;
	const pageMatch = pageRows.find((row) => row.id === eventId);
	if (pageMatch) return pageMatch;
	if (fetchedEvent?.id === eventId) return fetchedEvent;
	return null;
};

export const prependRealtimeSavedRows = <T extends { id: string }>({
	rows,
	realtimeRows,
	maxRealtimeRows = 5,
}: {
	rows: T[];
	realtimeRows?: T[] | null;
	maxRealtimeRows?: number;
}) => {
	const recentRows = (realtimeRows || []).filter(Boolean).slice(0, maxRealtimeRows);
	if (!recentRows.length) return rows;

	const realtimeIds = new Set(recentRows.map((row) => row.id));
	return [...recentRows, ...rows.filter((row) => !realtimeIds.has(row.id))];
};

export const prependRealtimeSavedRow = <T extends { id: string }>({
	rows,
	realtimeRow,
}: {
	rows: T[];
	realtimeRow?: T | null;
}) =>
	prependRealtimeSavedRows({
		rows,
		realtimeRows: realtimeRow ? [realtimeRow] : [],
		maxRealtimeRows: 1,
	});

export type WatcherHeadlineEventCandidate = {
	deviceId?: string | null;
	employeeNo?: string | null;
	employeeName?: string | null;
	deviceUserDisplayName?: string | null;
	eventAction?: string | null;
	receivedAt?: string | Date | null;
	eventTime?: string | Date | null;
};

const hasReadableWatcherPerson = (event: WatcherHeadlineEventCandidate) =>
	Boolean(
		String(event.employeeName || "").trim() ||
			String(event.deviceUserDisplayName || "").trim() ||
			String(event.employeeNo || "").trim(),
	);

/**
 * A physical access tap can fan out into several saved SDK rows. Keep the
 * person-bearing attendance row as the watcher headline when a lower-value
 * controller/open/close signal from the same device arrives moments later.
 * Every row remains in the ledger; this only chooses the operator summary.
 */
export const selectWatcherHeadlineEvent = <T extends WatcherHeadlineEventCandidate>(
	rows: T[],
	maxTapFanoutMs = 2 * 60 * 1000,
): T | undefined => {
	const newest = rows[0];
	if (!newest || hasReadableWatcherPerson(newest)) return newest;

	const newestTimeMs = getTimeMs(newest.receivedAt) ?? getTimeMs(newest.eventTime);
	if (newestTimeMs === null) return newest;

	const personTap = rows.find((event) => {
		if (String(event.eventAction || "").toUpperCase() !== "TAP") return false;
		if (!hasReadableWatcherPerson(event)) return false;
		if (newest.deviceId && event.deviceId && event.deviceId !== newest.deviceId) return false;
		const eventTimeMs = getTimeMs(event.receivedAt) ?? getTimeMs(event.eventTime);
		return eventTimeMs !== null && Math.abs(newestTimeMs - eventTimeMs) <= maxTapFanoutMs;
	});

	return personTap || newest;
};

/**
 * Socket is the canonical live path for Device Events.
 * - Saved view with a full event row: prepend locally (no forced HTTP refetch).
 * - Live ACS view, or payload without a full row: invalidate/refetch once.
 */
export const shouldRefreshSavedEventsAfterSocketEvent = ({
	viewMode,
	hasRealtimeEventRow,
}: {
	viewMode: "live" | "saved";
	hasRealtimeEventRow: boolean;
}) => viewMode === "live" || !hasRealtimeEventRow;
