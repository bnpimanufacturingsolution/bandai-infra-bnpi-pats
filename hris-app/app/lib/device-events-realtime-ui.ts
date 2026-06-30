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
	const isListening = Boolean(isConnected && (organizationId || liveDeviceId));
	const scopeLabel =
		deviceId !== "all"
			? selectedDeviceName || liveDeviceName || "Selected device"
			: organizationId
				? "All organization devices"
				: "All devices";

	return {
		isListening,
		scopeLabel,
		statusLabel: isListening
			? "Realtime listening"
			: isConnected
				? "Socket connected"
				: "Realtime offline",
		rowUpdateLabel: isListening ? "Live updates visible in rows" : "Rows update after refresh",
	};
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
