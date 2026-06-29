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
	if (itemId === latestRealtimeEventId) return "Live socket";
	if (itemId === highlightedSavedEventId) return "Newest saved";
	return null;
};
