import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
	ArrowLeft,
	BadgeCheck,
	Clock,
	Eye,
	MapPin,
	RefreshCw,
	Server,
	UploadCloud,
	UserRound,
	Wifi,
	WifiOff,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Modal } from "~/components/atoms/Modal";
import { Select, type SelectOption } from "~/components/atoms/Select";
import {
	useDeviceEvents,
	useDeviceHealth,
	useDeviceSyncPreview,
	useDevices,
	useTriggerZktecoAttendanceSync,
	queryKeys,
} from "~/lib/hooks/useDevices";
import { useAcsEvents } from "~/lib/hooks/use-hikvision";
import { useAuth } from "~/lib/hooks/use-auth";
import { useSocket } from "~/contexts/socket-context";
import {
	getDeviceEventsRealtimeStatus,
	getHighlightedSavedDeviceEventId,
	getSavedDeviceEventProcessingLabel,
	getSavedDeviceEventRealtimeBadge,
	prependRealtimeSavedRows,
	savedDeviceEventMatchesScope,
} from "~/lib/device-events-realtime-ui";
import type {
	DeviceEvent,
	DeviceEventStatus,
	DeviceHealthResponse,
} from "~/services/devices.service";
import type { ApiQueryParams } from "~/services/api-service";
import type { AcsEventInfo } from "~/types/hikvision";

type EventViewMode = "live" | "saved";
type TimeWindow = "today" | "yesterday" | "last2" | "last7" | "all";

type UnifiedDeviceEventRow = {
	id: string;
	origin: EventViewMode;
	deviceId: string;
	deviceName?: string | null;
	deviceAddress?: string | null;
	devicePort?: number | null;
	observedDeviceAddress?: string | null;
	hasDeviceAddressDrift?: boolean;
	eventTime: string;
	employeeId?: string | null;
	employeeProfileId?: string | null;
	employeeNo?: string | null;
	employeeName?: string | null;
	businessStatus: string;
	status: string;
	source?: string | null;
	receivedAt?: string | null;
	attendanceId?: string | null;
	doorNo?: string | number | null;
	verifyMode?: string | null;
	serialNo?: string | number | null;
	savedEventId?: string | null;
};

type DeviceEventSavedPayload = {
	eventId: string;
	organizationId?: string | null;
	deviceId?: string | null;
	status?: DeviceEventStatus | string;
	source?: string | null;
	emittedAt?: string;
	event?: DeviceEvent;
};

type SyncLogsState =
	| { status: "idle" }
	| { status: "accepted"; message: string }
	| { status: "error"; message: string };

type ZktecoBridgePreflight = NonNullable<DeviceHealthResponse["checks"]["zktecoBridge"]> & {
	estimatedRowsToSync?: number | string | null;
	missingRows?: number | string | null;
	dryRun?: { missingRows?: number | string | null };
	data?: { dryRun?: { missingRows?: number | string | null } };
};

const getAsyncErrorMessage = (error: unknown, fallback: string) => {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "object" && error && "message" in error) {
		const message = String((error as { message?: unknown }).message || "").trim();
		if (message) return message;
	}
	if (typeof error === "string" && error.trim()) return error.trim();
	return fallback;
};

const viewOptions: SelectOption[] = [
	{ value: "saved", label: "Saved" },
	{ value: "live", label: "Live" },
];

const timeWindowOptions: SelectOption[] = [
	{ value: "today", label: "Today" },
	{ value: "yesterday", label: "Yesterday" },
	{ value: "last2", label: "Last 2 days" },
	{ value: "last7", label: "Last 7 days" },
	{ value: "all", label: "All time" },
];

const PH_TIME_ZONE = "Asia/Manila";

const savedStatusOptions: SelectOption[] = [
	{ value: "all", label: "All statuses" },
	{ value: "MATCHED", label: "Matched" },
	{ value: "RECEIVED", label: "Received" },
	{ value: "ATTENDANCE_CREATED", label: "Attendance created" },
	{ value: "ATTENDANCE_UPDATED", label: "Attendance updated" },
	{ value: "UNMATCHED", label: "Needs match" },
	{ value: "IGNORED", label: "Recorded" },
	{ value: "FAILED", label: "Review" },
];

const sourceOptions: SelectOption[] = [
	{ value: "all", label: "All sources" },
	{ value: "HIKVISION_CALLBACK", label: "Hikvision watcher" },
	{ value: "EN_HCNETSDK_ALARM", label: "SDK alarm listener" },
	{ value: "ZKTECO_EVENT", label: "ZKTeco sidecar" },
];

const compactSelectClassName = "h-7 text-xs";
const compactSelectDropdownClassName = "rounded-md shadow-md";

const getDateKey = (date: Date) => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: PH_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const year = parts.find((part) => part.type === "year")?.value || "";
	const month = parts.find((part) => part.type === "month")?.value || "";
	const day = parts.find((part) => part.type === "day")?.value || "";
	return `${year}-${month}-${day}`;
};

const subtractDays = (date: Date, days: number) =>
	new Date(date.getTime() - days * 24 * 60 * 60 * 1000);

const formatPunchTime = (value: string | Date | null | undefined) => {
	if (!value) return "-";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return new Intl.DateTimeFormat("en-US", {
		timeZone: PH_TIME_ZONE,
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	}).format(date);
};

const getDateRangeForWindow = (window: TimeWindow) => {
	if (window === "all") return { from: undefined, to: undefined };
	const today = new Date();
	if (window === "yesterday") {
		const yesterday = subtractDays(today, 1);
		return { from: getDateKey(yesterday), to: getDateKey(yesterday) };
	}
	if (window === "last7") return { from: getDateKey(subtractDays(today, 6)), to: getDateKey(today) };
	if (window === "last2") return { from: getDateKey(subtractDays(today, 1)), to: getDateKey(today) };
	return { from: getDateKey(today), to: getDateKey(today) };
};

const getAcsEventPayload = (data: any) => data?.data?.AcsEvent || data?.AcsEvent || null;

const formatBusinessStatus = (status: string) => {
	if (status === "ATTENDANCE_CREATED") return "Attendance created";
	if (status === "ATTENDANCE_UPDATED") return "Attendance updated";
	if (status === "UNMATCHED") return "Needs match";
	if (status === "IGNORED") return "Recorded";
	if (status === "FAILED") return "Review";
	if (status === "RECEIVED") return "Received";
	if (status === "MATCHED") return "Matched to employee";
	return status
		.toLowerCase()
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
};

const formatEventSource = (source?: string | null) => {
	if (source === "ZKTECO_EVENT") return "ZKTeco sidecar";
	if (source === "EN_HCNETSDK_ALARM") return "SDK alarm listener";
	if (source === "HIKVISION_CALLBACK") return "Hikvision watcher";
	return source || "-";
};

const formatEventSourceDetail = (source?: string | null) => {
	if (source === "ZKTECO_EVENT") return "Saved from the ZKTeco SDK sidecar.";
	if (source === "EN_HCNETSDK_ALARM") return "Saved from the HCNetSDK alarm listener.";
	if (source === "HIKVISION_CALLBACK") return "Saved from the Hikvision callback watcher.";
	return "Saved by HRIS device event processing.";
};

const getEmployeeRecordUrl = (employeeProfileId?: string | null) =>
	employeeProfileId
		? `/admin/configuration/employees?action=view&id=${encodeURIComponent(employeeProfileId)}`
		: "";

const getEmployeeDisplayName = (item: UnifiedDeviceEventRow) =>
	item.employeeName || (item.employeeNo ? "Employee not matched" : "Unknown employee");

const getEmployeeInitials = (item: UnifiedDeviceEventRow) => {
	const name = item.employeeName || item.employeeId || item.employeeNo || "?";
	const parts = String(name).trim().split(/\s+/).filter(Boolean);
	if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
	return String(parts[0] || "?").slice(0, 2).toUpperCase();
};

const isZktecoDevice = (device: any, health?: DeviceHealthResponse) => {
	const vendor = String(device?.config?.vendor || device?.config?.type || "").toLowerCase();
	const name = String(device?.name || "").toLowerCase();
	const protocol = String(device?.protocol || "").toLowerCase();
	const port = Number(device?.port);
	return (
		health?.device?.vendor === "ZKTeco" ||
		Boolean(health?.checks?.zktecoBridge) ||
		Boolean(health?.checks?.zktecoWebhook) ||
		vendor.includes("zkteco") ||
		vendor.includes("zk") ||
		name.includes("zkteco") ||
		name.includes("zk") ||
		port === 4370 ||
		protocol === "sdk"
	);
};

const formatCount = (value?: number | string | null) => {
	const numeric = Number(value || 0);
	return Number.isFinite(numeric) ? numeric.toLocaleString() : "-";
};

const hasNumericCount = (value?: number | string | null) =>
	value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

const formatOptionalCount = (value?: number | string | null) =>
	hasNumericCount(value) ? formatCount(value) : "Unavailable";

const getSyncDeviceTitle = (vendor?: string | null, name?: string | null, address?: string | null) => {
	const vendorLabel = String(vendor || "").trim();
	const nameLabel = String(name || "").trim();
	if (!vendorLabel) return nameLabel || address || "Device";
	if (!nameLabel) return address ? `${vendorLabel} ${address}` : vendorLabel;
	if (nameLabel.toLowerCase().startsWith(vendorLabel.toLowerCase())) return nameLabel;
	return `${vendorLabel} ${nameLabel}`;
};

const getSerialNoFromPayload = (payload: any) =>
	payload?.AcsEventInfo?.serialNo ||
	payload?.EventNotificationAlert?.AccessControllerEvent?.serialNo ||
	payload?.AccessControllerEvent?.serialNo ||
	null;

const getVerifyModeFromPayload = (payload: any) =>
	payload?.currentVerifyMode ||
	payload?.verifyMode ||
	payload?.AcsEventInfo?.currentVerifyMode ||
	payload?.AcsEventInfo?.verifyMode ||
	payload?.EventNotificationAlert?.AccessControllerEvent?.currentVerifyMode ||
	payload?.EventNotificationAlert?.AccessControllerEvent?.verifyMode ||
	payload?.AccessControllerEvent?.currentVerifyMode ||
	payload?.AccessControllerEvent?.verifyMode ||
	null;

const normalizeAddressForCompare = (value?: string | null) => {
	const text = String(value || "").trim();
	if (!text) return "";
	try {
		return new URL(text).hostname.toLowerCase();
	} catch {
		return text
			.replace(/^https?:\/\//i, "")
			.split("/")[0]
			.split(":")[0]
			.trim()
			.toLowerCase();
	}
};

const getObservedDeviceAddress = (payload: any) =>
	String(
		payload?.deviceIP ||
			payload?.deviceIp ||
			payload?.rawAlarm?.deviceIp ||
			payload?.rawAlarm?.deviceIP ||
			payload?.socketCandidate?.deviceIP ||
			payload?.socketCandidate?.deviceIp ||
			payload?.EventNotificationAlert?.ipAddress ||
			payload?.EventNotificationAlert?.AccessControllerEvent?.ipAddress ||
			payload?.AccessControllerEvent?.ipAddress ||
			"",
	).trim() || null;

const getSavedMatchKey = (input: {
	employeeNo?: string | null;
	eventTime?: string | Date | null;
	serialNo?: string | number | null;
}) => {
	const employeeNo = String(input.employeeNo || "").trim();
	const serialNo = input.serialNo !== undefined && input.serialNo !== null ? String(input.serialNo) : "";
	const eventTime = input.eventTime ? new Date(input.eventTime) : null;
	const timeKey = eventTime && !Number.isNaN(eventTime.getTime()) ? eventTime.toISOString() : "";
	return `${employeeNo}|${timeKey}|${serialNo}`;
};

const getSerialMatchKey = (employeeNo?: string | null, serialNo?: string | number | null) => {
	const employee = String(employeeNo || "").trim();
	const serial = serialNo !== undefined && serialNo !== null ? String(serialNo).trim() : "";
	return employee && serial ? `${employee}|${serial}` : "";
};

const getEventTimeMs = (value?: string | Date | null) => {
	if (!value) return null;
	const parsed = value instanceof Date ? value : new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

const findSavedMatch = (
	event: AcsEventInfo,
	savedBySerial: Map<string, UnifiedDeviceEventRow>,
	savedEvents: UnifiedDeviceEventRow[],
) => {
	const serialMatch = savedBySerial.get(getSerialMatchKey(event.employeeNoString, event.serialNo));
	if (serialMatch) return serialMatch;

	const liveTime = getEventTimeMs(event.time);
	if (liveTime === null) return undefined;

	const employeeNo = String(event.employeeNoString || "").trim();
	const doorNo = event.doorNo !== undefined && event.doorNo !== null ? String(event.doorNo) : "";
	return savedEvents.find((savedEvent) => {
		if (String(savedEvent.employeeNo || "").trim() !== employeeNo) return false;
		if (doorNo && String(savedEvent.doorNo || "") !== doorNo) return false;
		const savedTime = getEventTimeMs(savedEvent.eventTime);
		if (savedTime === null) return false;
		return Math.abs(savedTime - liveTime) <= 2 * 60 * 1000;
	});
};

const normalizeSavedEvent = (event: DeviceEvent): UnifiedDeviceEventRow => {
	const payload = event.payload || {};
	const alert = payload.EventNotificationAlert || {};
	const accessEvent = alert.AccessControllerEvent || payload.AccessControllerEvent || {};
	const serialNo = getSerialNoFromPayload(payload);
	const zktecoAttendance = payload.attendance || payload.event || {};
	const observedDeviceAddress = getObservedDeviceAddress(payload);
	const hasDeviceAddressDrift =
		Boolean(observedDeviceAddress) &&
		normalizeAddressForCompare(observedDeviceAddress) !==
			normalizeAddressForCompare(event.device?.address);
	return {
		id: event.id,
		origin: "saved",
		deviceId: event.deviceId,
		deviceName: event.device?.name,
		deviceAddress: event.device?.address,
		devicePort: event.device?.port,
		observedDeviceAddress,
		hasDeviceAddressDrift,
		eventTime: event.eventTime,
		employeeId: event.employee?.employeeId || null,
		employeeProfileId: event.employee?.id || event.employeeId || null,
		employeeNo: event.employeeNo,
		employeeName:
			event.employee?.fullName ||
			payload.name ||
			zktecoAttendance.userName ||
			zktecoAttendance.name ||
			accessEvent.name ||
			accessEvent.employeeName ||
			null,
		status: event.status,
		source: event.source,
		receivedAt: event.receivedAt,
		businessStatus: formatBusinessStatus(event.status),
		attendanceId: event.attendanceId,
		doorNo: event.doorNo,
		verifyMode: event.verifyMode || getVerifyModeFromPayload(payload),
		serialNo,
		savedEventId: event.id,
	};
};

const normalizeLiveEvent = (
	event: AcsEventInfo,
	index: number,
	device: any,
	savedMatch?: UnifiedDeviceEventRow,
): UnifiedDeviceEventRow => ({
	id: `${event.serialNo || event.time || "live"}-${index}`,
	origin: "live",
	deviceId: device?.id || "",
	deviceName: device?.name,
	deviceAddress: device?.address,
	devicePort: device?.port,
	observedDeviceAddress: null,
	hasDeviceAddressDrift: false,
	eventTime: event.time,
	employeeId: event.hrisEmployee?.employeeId || savedMatch?.employeeId || null,
	employeeProfileId: event.hrisEmployee?.id || savedMatch?.employeeProfileId || null,
	employeeNo: event.employeeNoString,
	employeeName: event.hrisEmployee?.fullName || savedMatch?.employeeName || event.name,
	status: savedMatch?.status || "NOT_SAVED",
	source: savedMatch?.source || null,
	businessStatus: savedMatch?.businessStatus || "Pending",
	attendanceId: savedMatch?.attendanceId || null,
	doorNo: event.doorNo,
	verifyMode: event.currentVerifyMode || savedMatch?.verifyMode || null,
	serialNo: event.serialNo,
	savedEventId: savedMatch?.savedEventId || null,
});

export default function DeviceEventsPage() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const queryClient = useQueryClient();
	const { socket, isConnected } = useSocket();
	const { user } = useAuth();
	const zktecoSync = useTriggerZktecoAttendanceSync();
	const [lastRealtimeEvent, setLastRealtimeEvent] =
		useState<DeviceEventSavedPayload | null>(null);
	const [realtimeSavedEvents, setRealtimeSavedEvents] = useState<DeviceEvent[]>([]);
	const [lastRoomJoinedAt, setLastRoomJoinedAt] = useState<string | null>(null);
	const [lastRecoveryRefreshAt, setLastRecoveryRefreshAt] = useState<string | null>(null);
	const [syncLogsState, setSyncLogsState] = useState<SyncLogsState>({ status: "idle" });

	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const query = searchParams.get("query") || "";
	const deviceId = searchParams.get("deviceId") || "all";
	const viewMode = (searchParams.get("view") || "saved") as EventViewMode;
	const status = searchParams.get("status") || "all";
	const source = searchParams.get("source") || "all";
	const sort = searchParams.get("sort") || "eventTime";
	const order = searchParams.get("order") === "asc" ? "asc" : "desc";
	const action = searchParams.get("action");
	const activeEventId = searchParams.get("id");
	const timeWindow = (searchParams.get("window") ||
		(viewMode === "saved" ? "all" : "today")) as TimeWindow;
	const { from, to } = getDateRangeForWindow(timeWindow);
	const liveTimeWindow = timeWindow === "all" ? "today" : timeWindow;
	const { from: liveFrom, to: liveTo } = getDateRangeForWindow(liveTimeWindow);

	const { data: devicesData } = useDevices({ limit: 100, document: true });
	const devices = useMemo(() => (devicesData as any)?.devices || [], [devicesData]);
	const selectedDevice = deviceId === "all" ? undefined : devices.find((device: any) => device.id === deviceId);
	const zktecoDevices = useMemo(
		() => devices.filter((device: any) => isZktecoDevice(device)),
		[devices],
	);
	const selectedZktecoDevice =
		deviceId === "all" ? undefined : zktecoDevices.find((device: any) => device.id === deviceId);
	const syncScopeDevices = selectedZktecoDevice ? [selectedZktecoDevice] : zktecoDevices;
	const syncHealthDevice = selectedZktecoDevice || zktecoDevices[0];
	const liveDevice = selectedDevice;
	const liveDeviceId = liveDevice?.id;
	const selectedDeviceRoomId = deviceId !== "all" ? deviceId : liveDeviceId || "";
	const {
		data: deviceHealth,
		isLoading: isLoadingHealth,
		refetch: refetchHealth,
	} = useDeviceHealth(liveDeviceId, Boolean(liveDeviceId));
	const isZktecoHealth = isZktecoDevice(liveDevice, deviceHealth);
	const {
		data: syncDeviceHealth,
		isLoading: isLoadingSyncHealth,
		refetch: refetchSyncHealth,
	} = useDeviceHealth(syncHealthDevice?.id, action === "sync-logs" && Boolean(syncHealthDevice?.id));
	const {
		data: syncPreview,
		isLoading: isLoadingSyncPreview,
		error: syncPreviewError,
		refetch: refetchSyncPreview,
	} = useDeviceSyncPreview(
		{
			deviceId,
			source,
		},
		action === "sync-logs",
	);
	const canReadLiveEvents = Boolean(
		liveDeviceId &&
		!isZktecoHealth &&
			deviceHealth?.checks?.network?.ok &&
			deviceHealth?.checks?.deviceApi?.ok,
	);
	const organizationId =
		user?.organizationId || (user as any)?.organization?.id || liveDevice?.organizationId || "";

	const savedQueryParams: ApiQueryParams = {
		page: pageParam,
		limit: limitParam,
		query: viewMode === "saved" ? query : undefined,
		deviceId: deviceId === "all" ? undefined : deviceId,
		status: viewMode === "saved" && status !== "all" ? status : undefined,
		source: viewMode === "saved" && source !== "all" ? source : undefined,
		sort: viewMode === "saved" ? sort : undefined,
		order: viewMode === "saved" ? order : undefined,
		dateField: viewMode === "saved" ? "eventTime" : undefined,
		from,
		to,
	};
	const {
		data,
		isLoading: isLoadingSaved,
		error: savedError,
		refetch,
	} = useDeviceEvents(savedQueryParams);
	const {
		data: liveData,
		isLoading: isLoadingLive,
		error: liveError,
		refetch: refetchLive,
	} = useAcsEvents({
		deviceId: liveDeviceId,
		acsEventCond: {
			searchID: pageParam === 1 ? "0" : String(pageParam - 1),
			searchResultPosition: (pageParam - 1) * limitParam,
			maxResults: limitParam,
			startTime: `${liveFrom}T00:00:00+08:00`,
			endTime: `${liveTo}T23:59:59+08:00`,
			major: 0,
			minor: 0,
			timeReverseOrder: true,
		},
		enabled: viewMode === "live" && canReadLiveEvents,
	});

	useEffect(() => {
		if (viewMode === "live" && liveData) {
			refetch();
		}
	}, [liveData, refetch, viewMode]);

	useEffect(() => {
		if (!socket || !isConnected || (!organizationId && !selectedDeviceRoomId)) return;

		const roomPayload = {
			organizationId: organizationId || undefined,
			deviceId: selectedDeviceRoomId || undefined,
		};

		const matchesCurrentScope = (payload: DeviceEventSavedPayload) => {
			if (organizationId && payload.organizationId && payload.organizationId !== organizationId) {
				return false;
			}
			if (deviceId !== "all" && payload.deviceId && payload.deviceId !== deviceId) {
				return false;
			}
			if (status !== "all" && payload.status && payload.status !== status) {
				return false;
			}
			if (source !== "all" && payload.source && payload.source !== source) {
				return false;
			}
			return true;
		};

		const handleDeviceEventSaved = (payload: DeviceEventSavedPayload) => {
			if (!matchesCurrentScope(payload)) return;
			setLastRealtimeEvent(payload);
			if (payload.event?.id) {
				setRealtimeSavedEvents((current) => [
					payload.event as DeviceEvent,
					...current.filter((event) => event.id !== payload.event?.id),
				].slice(0, limitParam));
			}
			void queryClient.invalidateQueries({ queryKey: [...queryKeys.devices.all, "events"] });
			void refetch();
			if (viewMode === "live") {
				void refetchLive();
			}
		};

		socket.emit("join:device-events", roomPayload);
		setLastRoomJoinedAt(new Date().toISOString());
		socket.on("device-event:saved", handleDeviceEventSaved);

		return () => {
			socket.off("device-event:saved", handleDeviceEventSaved);
			socket.emit("leave:device-events", roomPayload);
		};
	}, [
		deviceId,
		isConnected,
		limitParam,
		organizationId,
		queryClient,
		refetch,
		refetchLive,
		selectedDeviceRoomId,
		source,
		socket,
		status,
		viewMode,
	]);

	useEffect(() => {
		if (viewMode !== "saved") return;
		if (typeof window === "undefined") return;

		const hasRealtimeScope = Boolean(organizationId || selectedDeviceRoomId);
		const intervalMs = isConnected && hasRealtimeScope ? 30000 : 10000;
		const refreshFromRecovery = () => {
			setLastRecoveryRefreshAt(new Date().toISOString());
			void queryClient.invalidateQueries({ queryKey: [...queryKeys.devices.all, "events"] });
			void refetch().then((result) => {
				if (result.error) {
					toast.warning("Saved punches could not refresh", {
						id: "device-events-recovery-refresh",
						description: getAsyncErrorMessage(
							result.error,
							"The recovery refresh will retry automatically.",
						),
					});
				}
			});
		};
		const handleVisibilityOrFocus = () => {
			if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
			refreshFromRecovery();
		};

		const intervalId = window.setInterval(refreshFromRecovery, intervalMs);
		window.addEventListener("focus", handleVisibilityOrFocus);
		if (typeof document !== "undefined") {
			document.addEventListener("visibilitychange", handleVisibilityOrFocus);
		}

		return () => {
			window.clearInterval(intervalId);
			window.removeEventListener("focus", handleVisibilityOrFocus);
			if (typeof document !== "undefined") {
				document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
			}
		};
	}, [
		isConnected,
		organizationId,
		queryClient,
		refetch,
		selectedDeviceRoomId,
		viewMode,
	]);

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const setFilter = (key: string, value: string) => {
		updateSearchParams((next) => {
			if (!value || value === "all") next.delete(key);
			else next.set(key, value);
			next.set("page", "1");
		});
	};

	const deviceOptions: SelectOption[] = useMemo(
		() => [
			{ value: "all", label: "All devices" },
			...devices.map((device: any) => ({
				value: device.id,
				label: device.name || `${device.address}:${device.port}`,
			})),
		],
		[devices],
	);

	const savedEvents = useMemo(() => (data?.events || []).map(normalizeSavedEvent), [data?.events]);
	const realtimeSavedRows = useMemo(() => {
		const queryText = query.trim().toLowerCase();
		const fromMs = from ? new Date(`${from}T00:00:00+08:00`).getTime() : null;
		const toMs = to ? new Date(`${to}T23:59:59+08:00`).getTime() : null;

		return realtimeSavedEvents.map(normalizeSavedEvent).filter((event) => {
			if (!savedDeviceEventMatchesScope(event, { deviceId, status, source })) return false;

			const eventTimeMs = getEventTimeMs(event.eventTime);
			if (fromMs && eventTimeMs !== null && eventTimeMs < fromMs) return false;
			if (toMs && eventTimeMs !== null && eventTimeMs > toMs) return false;

			if (!queryText) return true;
			return [
				event.employeeName,
				event.employeeNo,
				event.deviceName,
				event.deviceAddress,
				event.source,
				event.status,
			]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(queryText));
		});
	}, [deviceId, from, query, realtimeSavedEvents, source, status, to]);
	const savedByLiveKey = useMemo(() => {
		const map = new Map<string, UnifiedDeviceEventRow>();
		savedEvents.forEach((event) => {
			map.set(
				getSavedMatchKey({
					employeeNo: event.employeeNo,
					eventTime: event.eventTime,
					serialNo: event.serialNo,
				}),
				event,
			);
		});
		return map;
	}, [savedEvents]);
	const savedBySerial = useMemo(() => {
		const map = new Map<string, UnifiedDeviceEventRow>();
		savedEvents.forEach((event) => {
			const key = getSerialMatchKey(event.employeeNo, event.serialNo);
			if (key) map.set(key, event);
		});
		return map;
	}, [savedEvents]);

	const acsEventPayload = getAcsEventPayload(liveData);
	const liveEvents: AcsEventInfo[] = Array.isArray(acsEventPayload?.InfoList)
		? acsEventPayload.InfoList
		: [];
	const liveRows: UnifiedDeviceEventRow[] = liveEvents.map((event: AcsEventInfo, index: number) => {
		const savedMatch =
			savedByLiveKey.get(
				getSavedMatchKey({
					employeeNo: event.employeeNoString,
					eventTime: event.time,
					serialNo: event.serialNo,
				}),
			) || findSavedMatch(event, savedBySerial, savedEvents);
		return normalizeLiveEvent(event, index, liveDevice, savedMatch);
	});

	const rows: UnifiedDeviceEventRow[] =
		viewMode === "live"
			? liveRows
			: prependRealtimeSavedRows({
					rows: savedEvents,
					realtimeRows: realtimeSavedRows,
					maxRealtimeRows: limitParam,
				});
	const activeEvent = action === "view-event" ? rows.find((row) => row.id === activeEventId) : null;
	const savedSummary = data?.summary || { total: 0, byStatus: {}, bySource: {} };
	const savedStatusCounts = savedSummary.byStatus || {};
	const sdkSummary = (selectedDevice as any)?.config?.zktecoSdkSummary || null;
	const liveTotal = Number(acsEventPayload?.totalMatches || liveEvents.length || 0);
	const totalItems = viewMode === "live" ? liveTotal : data?.pagination?.total || savedSummary.total || 0;
	const isEventLoading = viewMode === "live" ? isLoadingLive : isLoadingSaved;
	const activeError = viewMode === "live" ? liveError || savedError : savedError;
	const countSavedStatus = (...statuses: string[]) =>
		statuses.reduce((total, currentStatus) => {
			const value = savedStatusCounts[currentStatus as keyof typeof savedStatusCounts];
			return total + Number(value || 0);
		}, 0);
	const visibleMatchedCount = rows.filter(
		(event: UnifiedDeviceEventRow) =>
			event.status === "MATCHED" ||
			event.status === "ATTENDANCE_CREATED" ||
			event.status === "ATTENDANCE_UPDATED",
	).length;
	const visibleNeedsEmployeeMatchCount = rows.filter(
		(event: UnifiedDeviceEventRow) => event.status === "UNMATCHED",
	).length;
	const matchedCount =
		viewMode === "saved"
			? countSavedStatus("MATCHED", "ATTENDANCE_CREATED", "ATTENDANCE_UPDATED")
			: visibleMatchedCount;
	const needsEmployeeMatchCount =
		viewMode === "saved" ? countSavedStatus("UNMATCHED") : visibleNeedsEmployeeMatchCount;
	const notSavedCount = rows.filter(
		(event: UnifiedDeviceEventRow) => event.status === "NOT_SAVED",
	).length;
	const latestSavedEvent = viewMode === "saved" ? rows[0] : undefined;
	const latestSavedReceivedAt = latestSavedEvent?.receivedAt
		? new Date(latestSavedEvent.receivedAt)
		: null;
	const latestSavedAgeMs =
		latestSavedReceivedAt && !Number.isNaN(latestSavedReceivedAt.getTime())
			? Date.now() - latestSavedReceivedAt.getTime()
			: null;
	const isLatestSavedFresh =
		latestSavedAgeMs !== null && latestSavedAgeMs >= 0 && latestSavedAgeMs <= 2 * 60 * 1000;
	const latestRealtimeEventId = lastRealtimeEvent?.eventId || null;
	const highlightedSavedEventId = getHighlightedSavedDeviceEventId({
		latestSavedEventId: latestSavedEvent?.id,
		latestRealtimeEventId,
		isLatestSavedFresh,
	});
	const latestSavedProcessingLabel = latestSavedEvent
		? getSavedDeviceEventProcessingLabel({
				itemId: latestSavedEvent.id,
				latestRealtimeEventId,
				receivedAt: latestSavedEvent.receivedAt,
				eventTime: latestSavedEvent.eventTime,
			})
		: null;
	const savedScopeNote =
		viewMode !== "saved"
			? ""
			: deviceId === "all" && source === "all"
				? "All devices and all sources are included."
				: `${selectedDevice?.name || "Selected devices"} / ${source === "all" ? "all sources" : formatEventSource(source)}`;
	const syncBridge =
		(syncPreview?.bridge as ZktecoBridgePreflight | undefined) ||
		(syncDeviceHealth?.checks?.zktecoBridge as ZktecoBridgePreflight | undefined);
	const syncBridgeOk = Boolean(syncBridge?.ok);
	const syncBridgeError =
		syncPreviewError?.message ||
		syncPreview?.bridge?.error ||
		syncBridge?.error ||
		(syncHealthDevice && !syncBridgeOk ? "The ZKTeco bridge is not reachable for this preflight." : "");
	const syncPreviewRows = syncPreview?.devices || [];
	const syncStartableRows = syncPreviewRows.filter((row) => row.canStartSync);
	const syncVendorEventTotal = syncPreviewRows.reduce(
		(total, row) => total + Number(row.vendorEventCount ?? row.totalEvents ?? 0),
		0,
	);
	const syncVendorUserTotal = syncPreviewRows.reduce(
		(total, row) => total + Number(row.vendorUserCount ?? 0),
		0,
	);
	const syncHrisSavedTotal = syncPreviewRows.reduce(
		(total, row) => total + Number(row.hrisSavedCount ?? row.syncedEvents ?? 0),
		0,
	);
	const syncHasUnknownMissingCount = syncPreviewRows.some(
		(row) =>
			(row.missingEventCount ?? row.needsSyncEvents) === null ||
			(row.missingEventCount ?? row.needsSyncEvents) === undefined,
	);
	const syncDryRunEstimate = syncPreviewRows.length
		? syncHasUnknownMissingCount
			? null
			: syncPreviewRows.reduce(
					(total, row) => total + Number(row.missingEventCount ?? row.needsSyncEvents ?? 0),
					0,
				)
		: (
				syncBridge?.estimatedRowsToSync ??
				syncBridge?.missingRows ??
				syncBridge?.dryRun?.missingRows ??
				syncBridge?.data?.dryRun?.missingRows ??
				null
			);
	const syncBridgeStatusUrl = syncBridge?.statusUrl || "Not reported";
	const syncScopeLabel = selectedZktecoDevice
		? selectedZktecoDevice.name || selectedZktecoDevice.address || "Selected ZKTeco device"
		: syncPreviewRows.length
			? `Preview devices (${syncPreviewRows.length})`
			: `All sync-capable devices (${syncScopeDevices.length})`;
	const syncStatusLabel = syncBridge
		? `${syncBridge.status}${syncBridge.latencyMs ? ` / ${syncBridge.latencyMs} ms` : ""}`
		: isLoadingSyncHealth
			? "Checking bridge"
			: "Unavailable";
	useEffect(() => {
		if (action !== "sync-logs" || !syncBridgeError) return;
		toast.warning("Sync preflight is unavailable", {
			id: "device-events-sync-preflight",
			description: syncBridgeError,
		});
	}, [action, syncBridgeError]);

	const focusLatestSavedEvent = () => {
		if (!latestSavedEvent) return;
		updateSearchParams((next) => {
			next.set("view", "saved");
			next.set("page", "1");
			next.set("window", "all");
			if (latestSavedEvent.deviceId) next.set("deviceId", latestSavedEvent.deviceId);
			if (latestSavedEvent.source) next.set("source", latestSavedEvent.source);
			next.delete("status");
			next.delete("query");
			next.set("sort", "eventTime");
			next.set("order", "desc");
		});
	};
	const openEventDetails = (item: UnifiedDeviceEventRow) => {
		updateSearchParams((next) => {
			next.set("action", "view-event");
			next.set("id", item.id);
		});
	};
	const closeEventDetails = () => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};
	const openSyncLogs = () => {
		setSyncLogsState({ status: "idle" });
		updateSearchParams((next) => {
			next.set("action", "sync-logs");
			next.delete("id");
		});
	};
	const closeSyncLogs = () => {
		updateSearchParams((next) => {
			next.delete("action");
		});
	};
	const refreshSyncPreflight = async () => {
		const results = await Promise.allSettled([refetchSyncHealth(), refetchSyncPreview()]);
		const rejected = results.find(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);
		if (rejected) {
			toast.warning("Sync preflight could not refresh", {
				id: "device-events-sync-preflight",
				description: getAsyncErrorMessage(
					rejected.reason,
					"The bridge may be offline. The modal is still safe to review.",
				),
			});
			return;
		}

		const failedResult = results
			.map((result) => (result.status === "fulfilled" ? result.value : null))
			.find((result) => result?.error);
		if (failedResult?.error) {
			toast.warning("Sync preflight could not refresh", {
				id: "device-events-sync-preflight",
				description: getAsyncErrorMessage(
					failedResult.error,
					"The bridge may be offline. The modal is still safe to review.",
				),
			});
			return;
		}

		toast.success("Sync preflight refreshed", {
			id: "device-events-sync-preflight",
		});
	};
	const startZktecoSync = () => {
		setSyncLogsState({ status: "idle" });
		const startableDeviceId = selectedZktecoDevice?.id || syncStartableRows[0]?.deviceId;
		zktecoSync.mutate(startableDeviceId ? { deviceId: startableDeviceId } : {}, {
			onSuccess: () => {
				toast.success("Sync logs request accepted", {
					id: "device-events-sync-start",
					description: "Saved events and bridge health are refreshing.",
				});
				setSyncLogsState({
					status: "accepted",
					message: "Bridge accepted the sync request. Saved events and bridge health are refreshing.",
				});
				void refetch();
				void refetchHealth();
				void refetchSyncHealth();
				void refetchSyncPreview();
			},
			onError: (error: unknown) => {
				const message = getAsyncErrorMessage(error, "Bridge rejected the sync request.");
				setSyncLogsState({
					status: "error",
					message,
				});
				toast.error("Sync logs did not start", {
					id: "device-events-sync-start",
					description: message,
				});
			},
		});
	};
	const realtimeStatus = getDeviceEventsRealtimeStatus({
		isConnected,
		organizationId,
		liveDeviceId,
		deviceId,
		selectedDeviceName: selectedDevice?.name,
		liveDeviceName: liveDevice?.name,
	});
	const socketTransport =
		socket && isConnected
			? String((socket as any).io?.engine?.transport?.name || "connected")
			: "offline";
	const realtimeStatusDetail = lastRealtimeEvent
		? `Last socket event ${formatPunchTime(lastRealtimeEvent.emittedAt)}`
			: latestSavedEvent
			? `${latestSavedProcessingLabel || "Latest saved punch"} ${formatPunchTime(latestSavedEvent.receivedAt || latestSavedEvent.eventTime)}`
			: "Waiting for the next saved punch";
	const roomStatusLabel = realtimeStatus.isScoped
		? !isConnected
			? "Room waiting"
			: lastRoomJoinedAt
			? `Room joined ${formatPunchTime(lastRoomJoinedAt)}`
			: "Room pending"
		: "No realtime room";
	const recoveryStatusLabel = lastRecoveryRefreshAt
		? `Recovery refresh ${formatPunchTime(lastRecoveryRefreshAt)}`
		: "Recovery refresh armed";

	const columns: Column<UnifiedDeviceEventRow>[] = [
		{
			key: "eventTime",
			label: "Punch time",
			sortable: viewMode === "saved",
			width: "190px",
			required: true,
			render: (value) => (
				<span className="whitespace-nowrap text-sm font-medium text-slate-950">
					{formatPunchTime(value)}
				</span>
			),
		},
		{
			key: "employeeNo",
			label: "Employee",
			sortable: viewMode === "saved",
			width: "290px",
			required: true,
			render: (value, item) => (
				<div className="flex min-w-0 items-center gap-3">
					<div
						className={
							item.employeeProfileId
								? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700"
								: "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500"
						}>
						{getEmployeeInitials(item)}
					</div>
					<div className="min-w-0">
						{item.employeeProfileId ? (
							<Link
								to={getEmployeeRecordUrl(item.employeeProfileId)}
								className="block truncate text-sm font-semibold text-slate-950 hover:text-slate-700 hover:underline">
								{getEmployeeDisplayName(item)}
							</Link>
						) : (
							<p className="truncate text-sm font-semibold text-slate-800">
								{getEmployeeDisplayName(item)}
							</p>
						)}
						<div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
							<span className="truncate text-xs text-slate-500">No. {value || "-"}</span>
							<Badge
								variant={item.employeeProfileId ? "success-soft" : "warning-soft"}
								className="px-1.5 py-0 text-[11px] font-semibold">
								{item.employeeProfileId ? "Matched" : "Needs match"}
							</Badge>
						</div>
					</div>
				</div>
			),
		},
		{
			key: "deviceId",
			label: "Terminal",
			sortable: viewMode === "saved",
			width: "210px",
			required: true,
			render: (_value, item) => (
				<div className="min-w-0">
					<p className="truncate text-sm font-medium text-slate-950">
						{item.deviceName || item.deviceId || "-"}
					</p>
					<p className="truncate text-xs text-slate-500">
						{item.hasDeviceAddressDrift
							? `Observed ${item.observedDeviceAddress}`
							: item.deviceAddress ? item.deviceAddress : item.deviceId}
					</p>
					{item.hasDeviceAddressDrift ? (
						<p className="truncate text-[11px] font-medium text-amber-700">
							Configured {item.deviceAddress || "-"}
						</p>
					) : null}
				</div>
			),
		},
	];

	return (
		<div className="space-y-3">
			<div className="flex flex-col gap-2 border-b border-slate-200 pb-3 md:flex-row md:items-center md:justify-between">
				<div className="flex min-w-0 items-center gap-3">
					<Button
						type="button"
						variant="ghost"
						className="h-8 w-8 shrink-0 p-0 text-slate-600 hover:bg-slate-100 hover:text-slate-950"
						onClick={() => navigate("/admin/configuration/devices")}
						aria-label="Back to devices">
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div className="min-w-0">
						<h1 className="truncate text-lg font-semibold text-slate-950">
							Device attendance
						</h1>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Badge
						variant={isConnected ? "success-soft" : isLatestSavedFresh ? "warning-soft" : "secondary"}
						className="rounded-md px-2 py-1">
						{isConnected ? "Realtime on" : isLatestSavedFresh ? "New saved" : "Realtime off"}
					</Badge>
					<Button
						type="button"
						variant="outline"
						className="h-9 px-3"
						onClick={openSyncLogs}>
						<UploadCloud className="mr-2 h-4 w-4" />
						Sync logs
					</Button>
					<Button
						type="button"
						variant="outline"
						className="h-9 px-3"
						onClick={() => {
							void refetchHealth();
							if (viewMode === "live") void refetchLive();
							else void refetch();
						}}>
						<RefreshCw className="mr-2 h-4 w-4" />
						Refresh
					</Button>
				</div>
			</div>

			<div className="rounded-md border border-slate-200 bg-white">
				<div
					className={
						viewMode === "live"
							? "grid gap-2 border-b border-slate-200 p-2 md:grid-cols-[minmax(96px,0.55fr)_minmax(180px,1fr)_minmax(110px,0.55fr)]"
							: "grid gap-2 border-b border-slate-200 p-2 md:grid-cols-[minmax(96px,0.55fr)_minmax(170px,1fr)_minmax(110px,0.55fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)]"
					}>
					<Select
						options={viewOptions}
						value={viewMode}
						onChange={(value) =>
							updateSearchParams((next) => {
								next.set("view", value);
								next.set("page", "1");
								if (value === "live") {
									next.delete("status");
									next.delete("source");
									next.delete("query");
									next.set("window", "today");
									if (
										(next.get("deviceId") || "all") === "all" &&
										latestSavedEvent?.deviceId
									) {
										next.set("deviceId", latestSavedEvent.deviceId);
									}
								}
							})
						}
						placeholder="Saved"
						className={compactSelectClassName}
						dropdownClassName={compactSelectDropdownClassName}
					/>
					<Select
						options={deviceOptions}
						value={deviceId}
						onChange={(value) => setFilter("deviceId", value)}
						placeholder="All devices"
						className={compactSelectClassName}
						dropdownClassName={compactSelectDropdownClassName}
					/>
					<Select
						options={timeWindowOptions}
						value={timeWindow}
						onChange={(value) => setFilter("window", value)}
						placeholder="Today"
						className={compactSelectClassName}
						dropdownClassName={compactSelectDropdownClassName}
					/>
					{viewMode === "saved" && (
						<>
							<Select
								options={savedStatusOptions}
								value={status}
								onChange={(value) => setFilter("status", value)}
								placeholder="All statuses"
								className={compactSelectClassName}
								dropdownClassName={compactSelectDropdownClassName}
							/>
							<Select
								options={sourceOptions}
								value={source}
								onChange={(value) => setFilter("source", value)}
								placeholder="All sources"
								className={compactSelectClassName}
								dropdownClassName={compactSelectDropdownClassName}
							/>
						</>
					)}
				</div>

				<div className="grid grid-cols-3 gap-0 divide-x divide-slate-200">
					<div
						className={
							realtimeStatus.isListening
								? "col-span-3 border-b border-emerald-200 bg-emerald-50 px-3 py-2"
								: "col-span-3 border-b border-amber-200 bg-amber-50 px-3 py-2"
						}>
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div className="flex min-w-0 items-center gap-2">
								<span
									className={
										realtimeStatus.isListening
											? "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700"
											: "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700"
									}
									aria-hidden="true">
									{realtimeStatus.isListening ? (
										<Wifi className="h-4 w-4" />
									) : (
										<WifiOff className="h-4 w-4" />
									)}
								</span>
								<div className="min-w-0">
									<p
										className={
											realtimeStatus.isListening
												? "truncate text-sm font-semibold text-emerald-950"
												: "truncate text-sm font-semibold text-amber-950"
										}>
										{realtimeStatus.statusLabel}
									</p>
									<p
										className={
											realtimeStatus.isListening
												? "truncate text-xs text-emerald-800"
												: "truncate text-xs text-amber-800"
										}>
										{realtimeStatus.scopeLabel} - {realtimeStatusDetail}
									</p>
									{viewMode === "saved" && savedScopeNote ? (
										<p
											className={
												realtimeStatus.isListening
													? "truncate text-[11px] text-emerald-700"
													: "truncate text-[11px] text-amber-700"
											}>
											{savedScopeNote}
										</p>
									) : null}
								</div>
							</div>
							<div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
								<Badge
									variant={realtimeStatus.isListening ? "success-soft" : "warning-soft"}
									className="w-fit rounded-md px-2 py-1 font-semibold">
									{realtimeStatus.rowUpdateLabel}
								</Badge>
								<Badge
									variant={isConnected ? "success-soft" : "warning-soft"}
									className="w-fit rounded-md px-2 py-1 font-semibold">
									Socket {socketTransport}
								</Badge>
								<Badge
									variant={realtimeStatus.isScoped ? "success-soft" : "warning-soft"}
									className="w-fit rounded-md px-2 py-1 font-semibold">
									{roomStatusLabel}
								</Badge>
								<Badge
									variant="primary-soft"
									className="w-fit rounded-md px-2 py-1 font-semibold">
									{recoveryStatusLabel}
								</Badge>
							</div>
						</div>
					</div>
						{[
							{
								label:
									viewMode === "saved" && sdkSummary
										? "SDK events"
										: viewMode === "live"
											? "Device punches"
											: "Total events",
								value:
									viewMode === "saved" && sdkSummary
										? formatCount(sdkSummary.eventCount)
										: viewMode === "live"
											? formatCount(liveEvents.length)
											: formatCount(totalItems),
							},
							{
								label: viewMode === "saved" && sdkSummary ? "SDK users" : "Matched",
								value:
									viewMode === "saved" && sdkSummary
										? formatCount(sdkSummary.userCount)
										: formatCount(matchedCount),
							},
							{
								label: viewMode === "saved" && sdkSummary ? "Event users" : "Needs match",
								value:
									viewMode === "saved" && sdkSummary
										? formatCount(sdkSummary.uniqueEventUsers)
										: formatCount(needsEmployeeMatchCount),
							},
						].map((item) => (
							<div key={item.label} className="min-w-0 px-3 py-2">
								<p className="truncate text-xs text-slate-500">{item.label}</p>
								<p className="text-base font-semibold text-slate-950">{item.value}</p>
							</div>
						))}
				</div>
			</div>

			{viewMode === "live" && notSavedCount > 0 && (
				<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
					{notSavedCount} pending
				</div>
			)}

			{viewMode === "live" && !liveDeviceId && (
				<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
					Select a device.
				</div>
			)}

			{viewMode === "live" && liveDeviceId && !canReadLiveEvents && !isLoadingHealth && (
				<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
					{isZktecoHealth
						? "ZKTeco punches are received through the configured SDK sidecar and shown after they are saved in HRIS."
						: "Live reads are paused until the selected device connection responds."}
				</div>
			)}

			{activeError && (
				<div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
					{activeError.message}
				</div>
			)}

			{viewMode === "saved" && latestSavedEvent && (
				<button
					type="button"
					onClick={focusLatestSavedEvent}
					aria-label="Show latest saved punch row"
					className={
						isLatestSavedFresh
							? "w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-sm text-emerald-900 transition hover:border-emerald-300 hover:bg-emerald-100"
							: "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
					}>
					<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex min-w-0 items-center gap-2">
							<span
								className={
									isLatestSavedFresh
										? "h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.14)]"
										: "h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300"
								}
							/>
							<span className="truncate font-medium">
								{latestSavedProcessingLabel || (isLatestSavedFresh ? "Realtime save" : "Latest saved punch")}
							</span>
							<span className="truncate text-xs opacity-80">
								{latestSavedEvent.employeeName || `No. ${latestSavedEvent.employeeNo || "-"}`}
							</span>
						</div>
						<div className="flex min-w-0 items-center gap-2 text-xs">
							<span className="truncate">{formatPunchTime(latestSavedEvent.receivedAt)}</span>
							<span className="text-slate-400">/</span>
							<span className="truncate">{formatEventSource(latestSavedEvent.source)}</span>
							<span className="text-slate-400">/</span>
							<span className="truncate">{latestSavedEvent.deviceName || latestSavedEvent.deviceAddress || "Device"}</span>
							{lastRealtimeEvent?.emittedAt && latestRealtimeEventId === latestSavedEvent.id && (
								<Badge variant="success-soft" className="px-2 py-0.5">
									Socket received
								</Badge>
							)}
						</div>
					</div>
				</button>
			)}

			<div className="rounded-md border border-slate-200 bg-white p-2.5">
				<div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
					<div className="min-w-0">
						<h2 className="truncate text-sm font-semibold text-slate-950">
							{viewMode === "live" ? "Live punches" : "Saved punches"}
						</h2>
					</div>
				</div>
				<DataTable<UnifiedDeviceEventRow>
					title={viewMode === "live" ? "Punches" : "Saved punches"}
					description=""
					data={rows}
					columns={columns}
					isLoading={isEventLoading}
					emptyMessage={viewMode === "live" ? "No device punches found" : "No saved events found"}
					emptyDescription=""
					showSearch={viewMode === "saved"}
					showFilters={false}
					showPagination
					showExport={false}
					noCard
					searchPlaceholder="Search employee or device..."
					searchWidth="w-full sm:w-72"
					searchValue={viewMode === "saved" ? query : ""}
					onSearch={(value) => setFilter("query", value)}
					onSort={(key, direction) => {
						updateSearchParams((next) => {
							next.set("sort", key === "deviceId" ? "deviceName" : key);
							next.set("order", direction);
							next.set("page", "1");
						});
					}}
					itemsPerPage={limitParam}
					currentPage={pageParam}
					totalItems={totalItems}
					onPageChange={(page) => {
						updateSearchParams((next) => {
							next.set("page", String(page));
						});
					}}
					renderActions={(item) => (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-8 px-2.5 text-xs"
							onClick={() => openEventDetails(item)}>
							<Eye className="h-3.5 w-3.5" />
							View
						</Button>
					)}
					rowClassName={(item) =>
						viewMode === "saved" && item.id === highlightedSavedEventId
							? "bg-emerald-50/80 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-50"
							: ""
					}
				/>
			</div>

			<Modal
				open={action === "sync-logs"}
				onOpenChange={(open) => {
					if (!open) closeSyncLogs();
				}}
				title="Sync device logs"
				description="Review source counts, HRIS saved counts, and devices that can safely start a sync."
				className="max-w-3xl">
				<div className="space-y-4">
					<div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div className="min-w-0">
								<p className="text-xs font-semibold uppercase text-slate-500">Selected scope</p>
								<p className="mt-1 truncate text-base font-semibold text-slate-950">
									{syncScopeLabel}
								</p>
								<p className="mt-1 text-xs text-slate-600">
									{selectedZktecoDevice
										? `${selectedZktecoDevice.address || "-"}:${selectedZktecoDevice.port || "-"}`
										: "Preview includes configured Hikvision and ZKTeco sources in the current filters."}
								</p>
							</div>
							<Badge
								variant={syncBridgeOk ? "success-soft" : "warning-soft"}
								className="w-fit rounded-md px-2 py-1 font-semibold">
								{syncBridgeOk ? "Bridge reachable" : "Bridge unavailable"}
							</Badge>
						</div>
						{syncPreviewRows.length > 0 ? (
							<div className="mt-3 flex flex-wrap gap-1.5">
								{syncPreviewRows.slice(0, 5).map((device) => (
									<Badge key={device.deviceId} variant="outline" className="px-2 py-0.5">
										{device.name || device.address || device.deviceId}
									</Badge>
								))}
								{syncPreviewRows.length > 5 ? (
									<Badge variant="outline" className="px-2 py-0.5">
										+{syncPreviewRows.length - 5} more
									</Badge>
								) : null}
							</div>
						) : (
							<div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
								{isLoadingSyncPreview ? "Building sync preview." : "No sync-capable devices are available in the current filters."}
							</div>
						)}
					</div>

					<div className="grid gap-3 md:grid-cols-2">
						<div className="rounded-lg border border-slate-200 bg-white p-3">
							<p className="text-xs font-semibold uppercase text-slate-500">Source totals</p>
							<p className="mt-2 text-sm font-semibold text-slate-950">{syncStatusLabel}</p>
							<p className="mt-1 text-xs text-slate-500">
								{isLoadingSyncPreview
									? "Loading SDK counts"
									: `${formatCount(syncVendorEventTotal)} events / ${formatCount(syncVendorUserTotal)} known users`}
							</p>
						</div>
						<div className="rounded-lg border border-slate-200 bg-white p-3">
							<p className="text-xs font-semibold uppercase text-slate-500">HRIS saved</p>
							<p className="mt-2 text-sm font-semibold text-slate-950">
								{isLoadingSyncPreview ? "Loading" : formatCount(syncHrisSavedTotal)}
							</p>
							<p className="mt-1 text-xs text-slate-500">saved events in the selected scope</p>
						</div>
						<div className="rounded-lg border border-slate-200 bg-white p-3">
							<p className="text-xs font-semibold uppercase text-slate-500">Sync gap</p>
							<p className="mt-2 text-sm font-semibold text-slate-950">
								{isLoadingSyncPreview
									? "Loading"
									: syncDryRunEstimate === null || syncDryRunEstimate === undefined
									? "Unavailable"
									: formatCount(syncDryRunEstimate)}
							</p>
							<p className="mt-1 text-xs text-slate-500">missing rows reported by the bridge</p>
						</div>
						<div className="rounded-lg border border-slate-200 bg-white p-3">
							<p className="text-xs font-semibold uppercase text-slate-500">Can run sync</p>
							<p className="mt-2 text-sm font-semibold text-slate-950">
								{isLoadingSyncPreview
									? "Loading"
									: `${formatCount(syncStartableRows.length)} of ${formatCount(syncPreviewRows.length)}`}
							</p>
							<p className="mt-1 break-all text-xs text-slate-500">{syncBridgeStatusUrl}</p>
						</div>
					</div>

					<div className="rounded-lg border border-slate-200 bg-white p-3">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<p className="text-xs font-semibold uppercase text-slate-500">Rows to sync</p>
								<p className="mt-1 text-sm font-semibold text-slate-950">
									{syncDryRunEstimate === null || syncDryRunEstimate === undefined
										? "Unavailable"
										: formatCount(syncDryRunEstimate)}
								</p>
							</div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-8 px-3 text-xs"
								disabled={isLoadingSyncPreview || isLoadingSyncHealth}
								onClick={() => void refreshSyncPreflight()}>
								<RefreshCw className="h-3.5 w-3.5" />
								Refresh preflight
							</Button>
						</div>
						<p className="mt-2 text-xs text-slate-500">
							{syncDryRunEstimate === null || syncDryRunEstimate === undefined
								? "The bridge did not report a dry-run count, so HRIS will not invent one."
								: "This estimate came from bridge preflight data."}
						</p>
					</div>

					<div className="rounded-lg border border-slate-200 bg-white">
						<div className="border-b border-slate-100 px-3 py-2">
							<p className="text-xs font-semibold uppercase text-slate-500">Per-device tally</p>
						</div>
						<div className="divide-y divide-slate-100">
							{syncPreviewRows.length ? (
								syncPreviewRows.map((device) => {
									const sourceEvents = device.vendorEventCount ?? device.totalEvents;
									const sourceUsers = device.vendorUserCount;
									const hrisSaved = device.hrisSavedCount ?? device.syncedEvents;
									const missingEvents = device.missingEventCount ?? device.needsSyncEvents;
									return (
										<div key={device.deviceId} className="flex flex-col gap-3 px-3 py-3 md:flex-row md:items-start md:justify-between">
											<div className="min-w-0">
												<p className="truncate text-sm font-semibold text-slate-950">
													{getSyncDeviceTitle(device.vendor, device.name, device.address)}
												</p>
												<p className="truncate text-xs text-slate-500">
													{device.address}:{device.port} / {formatEventSource(device.source)}
												</p>
												{device.error ? (
													<p className="mt-1 text-xs text-red-700">{device.error}</p>
												) : null}
											</div>
											<div className="grid shrink-0 grid-cols-2 gap-2 text-sm sm:grid-cols-4 md:min-w-[430px]">
												<div>
													<p className="text-[11px] font-semibold uppercase text-slate-500">HRIS</p>
													<p className="text-xs font-semibold text-slate-950">{formatOptionalCount(hrisSaved)}</p>
												</div>
												<div>
													<p className="text-[11px] font-semibold uppercase text-slate-500">Source events</p>
													<p className="text-xs font-semibold text-slate-950">{formatOptionalCount(sourceEvents)}</p>
												</div>
												<div>
													<p className="text-[11px] font-semibold uppercase text-slate-500">Users</p>
													<p className="text-xs font-semibold text-slate-950">{formatOptionalCount(sourceUsers)}</p>
												</div>
												<div>
													<p className="text-[11px] font-semibold uppercase text-slate-500">Missing</p>
													<p className="text-xs font-semibold text-slate-950">{formatOptionalCount(missingEvents)}</p>
												</div>
												<div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-4">
													<Badge
														variant={device.canStartSync ? "success-soft" : "secondary"}
														className="px-2 py-0.5 font-semibold">
														{device.canStartSync ? "Ready to sync" : "Preview only"}
													</Badge>
												</div>
											</div>
										</div>
									);
								})
							) : (
								<div className="px-3 py-3 text-sm text-slate-500">
									{isLoadingSyncPreview ? "Reading device history counts." : "No device preview rows returned."}
								</div>
							)}
						</div>
					</div>

					{syncLogsState.status === "accepted" ? (
						<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
							{syncLogsState.message}
						</div>
					) : null}

					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button type="button" variant="outline" className="h-9 px-3" onClick={closeSyncLogs}>
							Close
						</Button>
						<Button
							type="button"
							className="h-9 px-3"
							disabled={zktecoSync.isPending || isLoadingSyncPreview || syncStartableRows.length === 0}
							onClick={startZktecoSync}>
							<UploadCloud className="h-4 w-4" />
							{zktecoSync.isPending ? "Starting sync" : "Start actual sync"}
						</Button>
					</div>
				</div>
			</Modal>

			<Modal
				open={action === "view-event"}
				onOpenChange={(open) => {
					if (!open) closeEventDetails();
				}}
				title="Punch details"
				className="max-w-4xl">
				{activeEvent ? (
					<div className="space-y-5">
						<div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-start sm:justify-between">
							<div className="flex min-w-0 items-center gap-3">
								<div
									className={
										activeEvent.employeeProfileId
											? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700"
											: "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600"
									}>
									{getEmployeeInitials(activeEvent)}
								</div>
								<div className="min-w-0">
									<p className="truncate text-base font-semibold text-slate-950">
										{getEmployeeDisplayName(activeEvent)}
									</p>
									<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
										<span>No. {activeEvent.employeeNo || "-"}</span>
										<Badge
											variant={activeEvent.employeeProfileId ? "success-soft" : "warning-soft"}
											className="px-2 py-0.5">
											{activeEvent.employeeProfileId ? "Matched employee" : "Needs employee match"}
										</Badge>
									</div>
								</div>
							</div>
							<div className="flex flex-wrap items-center gap-2 sm:justify-end">
								{activeEvent.employeeProfileId ? (
									<Button asChild variant="outline" size="sm" className="h-8 px-3 text-xs">
										<Link to={getEmployeeRecordUrl(activeEvent.employeeProfileId)}>
											<UserRound className="h-3.5 w-3.5" />
											Employee record
										</Link>
									</Button>
								) : null}
							</div>
						</div>

						<div className="grid gap-3 md:grid-cols-3">
							<div className="rounded-lg border border-slate-200 bg-white p-3">
								<div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
									<Clock className="h-3.5 w-3.5" />
									Punch time
								</div>
								<p className="mt-2 text-sm font-semibold text-slate-950">
									{formatPunchTime(activeEvent.eventTime)}
								</p>
								<p className="mt-1 text-xs text-slate-500">
									Received {formatPunchTime(activeEvent.receivedAt || activeEvent.eventTime)}
								</p>
							</div>
							<div className="rounded-lg border border-slate-200 bg-white p-3">
								<div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
									<BadgeCheck className="h-3.5 w-3.5" />
									Status
								</div>
								<p className="mt-2 text-sm font-semibold text-slate-950">
									{formatBusinessStatus(activeEvent.status)}
								</p>
								<p className="mt-1 text-xs text-slate-500">
									Attendance {activeEvent.attendanceId ? activeEvent.attendanceId : "not created yet"}
								</p>
							</div>
							<div className="rounded-lg border border-slate-200 bg-white p-3">
								<div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
									<Wifi className="h-3.5 w-3.5" />
									Source
								</div>
								<p className="mt-2 text-sm font-semibold text-slate-950">
									{formatEventSource(activeEvent.source)}
								</p>
								<p className="mt-1 text-xs text-slate-500">
									{formatEventSourceDetail(activeEvent.source)}
								</p>
							</div>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-3">
								<h3 className="text-sm font-semibold text-slate-950">Terminal</h3>
								<div className="rounded-lg border border-slate-200 bg-white">
									<div className="flex items-start gap-3 border-b border-slate-100 p-3">
										<Server className="mt-0.5 h-4 w-4 text-slate-400" />
										<div className="min-w-0">
											<p className="truncate text-sm font-semibold text-slate-950">
												{activeEvent.deviceName || activeEvent.deviceId || "-"}
											</p>
											<p className="truncate text-xs text-slate-500">
												Configured {activeEvent.deviceAddress || "-"}
											</p>
										</div>
									</div>
									<div className="flex items-start gap-3 p-3">
										<MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
										<div className="min-w-0">
											<p className="truncate text-sm font-medium text-slate-800">
												Observed {activeEvent.observedDeviceAddress || activeEvent.deviceAddress || "-"}
											</p>
											{activeEvent.hasDeviceAddressDrift ? (
												<p className="mt-1 text-xs font-medium text-amber-700">
													Observed address does not match the configured terminal address.
												</p>
											) : (
												<p className="mt-1 text-xs text-slate-500">
													Observed terminal address matches this device record.
												</p>
											)}
										</div>
									</div>
								</div>
							</div>

							<div className="space-y-3">
								<h3 className="text-sm font-semibold text-slate-950">Device payload</h3>
								<div className="grid grid-cols-2 gap-2">
									{[
										["Door", activeEvent.doorNo || "-"],
										["Verify", activeEvent.verifyMode || "-"],
										["Serial", activeEvent.serialNo || "-"],
										["HRIS event", activeEvent.savedEventId || activeEvent.id],
										["Employee profile", activeEvent.employeeProfileId || "-"],
									].map(([label, value]) => (
										<div key={label} className="rounded-lg border border-slate-200 bg-white p-3">
											<p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
											<p className="mt-1 truncate text-sm font-medium text-slate-900">{value}</p>
										</div>
									))}
								</div>
							</div>
						</div>
					</div>
				) : (
					<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
						This punch is not in the current table page. Refresh the saved view or open it from the row again.
					</div>
				)}
			</Modal>
		</div>
	);
}
