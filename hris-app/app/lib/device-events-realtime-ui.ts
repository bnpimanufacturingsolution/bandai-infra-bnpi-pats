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

export const prependRealtimeSavedRow = <T extends { id: string }>({
	rows,
	realtimeRow,
}: {
	rows: T[];
	realtimeRow?: T | null;
}) => {
	if (!realtimeRow) return rows;
	return [realtimeRow, ...rows.filter((row) => row.id !== realtimeRow.id)];
};
