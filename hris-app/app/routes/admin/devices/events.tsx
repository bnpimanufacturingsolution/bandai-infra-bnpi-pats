import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, UploadCloud, Wifi, WifiOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Select, type SelectOption } from "~/components/atoms/Select";
import {
	useDeviceEvents,
	useDeviceHealth,
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
	getSavedDeviceEventRealtimeBadge,
	prependRealtimeSavedRow,
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
	{ value: "all", label: "All paths" },
	{ value: "HIKVISION_CALLBACK", label: "Device callback" },
	{ value: "EN_HCNETSDK_ALARM", label: "Alarm listener" },
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
	if (source === "ZKTECO_EVENT") return "ZKTeco SDK sidecar";
	if (source === "EN_HCNETSDK_ALARM") return "Alarm listener";
	if (source === "HIKVISION_CALLBACK") return "Device callback";
	return source || "-";
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

const getSerialNoFromPayload = (payload: any) =>
	payload?.AcsEventInfo?.serialNo ||
	payload?.EventNotificationAlert?.AccessControllerEvent?.serialNo ||
	payload?.AccessControllerEvent?.serialNo ||
	null;

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
	return {
		id: event.id,
		origin: "saved",
		deviceId: event.deviceId,
		deviceName: event.device?.name,
		deviceAddress: event.device?.address,
		devicePort: event.device?.port,
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
	const [lastRealtimeSavedEvent, setLastRealtimeSavedEvent] =
		useState<DeviceEvent | null>(null);

	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const query = searchParams.get("query") || "";
	const deviceId = searchParams.get("deviceId") || "all";
	const viewMode = (searchParams.get("view") || "saved") as EventViewMode;
	const status = searchParams.get("status") || "all";
	const source = searchParams.get("source") || "all";
	const sort = searchParams.get("sort") || "eventTime";
	const order = searchParams.get("order") === "asc" ? "asc" : "desc";
	const timeWindow = (searchParams.get("window") ||
		(viewMode === "saved" ? "all" : "today")) as TimeWindow;
	const { from, to } = getDateRangeForWindow(timeWindow);
	const liveTimeWindow = timeWindow === "all" ? "today" : timeWindow;
	const { from: liveFrom, to: liveTo } = getDateRangeForWindow(liveTimeWindow);

	const { data: devicesData } = useDevices({ limit: 100, document: true });
	const devices = useMemo(() => (devicesData as any)?.devices || [], [devicesData]);
	const selectedDevice = deviceId === "all" ? undefined : devices.find((device: any) => device.id === deviceId);
	const liveDevice = selectedDevice;
	const liveDeviceId = liveDevice?.id;
	const {
		data: deviceHealth,
		isLoading: isLoadingHealth,
		refetch: refetchHealth,
	} = useDeviceHealth(liveDeviceId, Boolean(liveDeviceId));
	const isZktecoHealth = isZktecoDevice(liveDevice, deviceHealth);
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
		if (!socket || !isConnected || (!organizationId && !liveDeviceId)) return;

		const roomPayload = {
			organizationId: organizationId || undefined,
			deviceId: deviceId !== "all" ? deviceId : undefined,
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
				setLastRealtimeSavedEvent(payload.event);
			}
			void queryClient.invalidateQueries({ queryKey: [...queryKeys.devices.all, "events"] });
			void refetch();
			if (viewMode === "live") {
				void refetchLive();
			}
		};

		socket.emit("join:device-events", roomPayload);
		socket.on("device-event:saved", handleDeviceEventSaved);

		return () => {
			socket.off("device-event:saved", handleDeviceEventSaved);
			socket.emit("leave:device-events", roomPayload);
		};
	}, [
		deviceId,
		isConnected,
		liveDeviceId,
		organizationId,
		queryClient,
		refetch,
		refetchLive,
		source,
		socket,
		status,
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
	const realtimeSavedEvent = useMemo(() => {
		if (!lastRealtimeEvent?.eventId || lastRealtimeSavedEvent?.id !== lastRealtimeEvent.eventId) {
			return null;
		}
		return normalizeSavedEvent(lastRealtimeSavedEvent);
	}, [lastRealtimeEvent?.eventId, lastRealtimeSavedEvent]);
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
			: prependRealtimeSavedRow({
					rows: savedEvents,
					realtimeRow: realtimeSavedEvent,
				});
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
			next.set("sort", "receivedAt");
			next.set("order", "desc");
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
	const realtimeStatusDetail = lastRealtimeEvent
		? `Last socket event ${formatPunchTime(lastRealtimeEvent.emittedAt)}`
		: latestSavedEvent
			? `Latest saved punch ${formatPunchTime(latestSavedEvent.receivedAt || latestSavedEvent.eventTime)}`
			: "Waiting for the next saved punch";

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
			width: "220px",
			required: true,
			render: (value, item) => (
				<div className="min-w-0">
					{item.employeeProfileId ? (
						<Link
							to={`/employee/${item.employeeProfileId}`}
							className="block truncate text-sm font-medium text-slate-950 hover:text-slate-700 hover:underline">
							{item.employeeName || value || item.employeeId || item.employeeProfileId}
						</Link>
					) : (
						<p className="truncate text-sm font-medium text-slate-800">
							{item.employeeName || "Employee not matched"}
						</p>
					)}
					<p className="truncate text-xs text-slate-500">No. {value || "-"}</p>
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
					{item.deviceId ? (
						<Link
							to={`/admin/devices/manage/${item.deviceId}`}
							className="block truncate text-sm font-medium text-slate-950 hover:text-slate-700 hover:underline">
							{item.deviceName || item.deviceId}
						</Link>
					) : (
						<p className="truncate text-sm font-medium text-slate-950">-</p>
					)}
					<p className="truncate text-xs text-slate-500">
						{item.deviceAddress ? item.deviceAddress : item.deviceId}
					</p>
				</div>
			),
		},
		{
			key: "source",
			label: "Save path",
			sortable: viewMode === "saved",
			width: "150px",
			required: true,
			render: (value, item) => {
				const realtimeBadge = getSavedDeviceEventRealtimeBadge({
					viewMode,
					itemId: item.id,
					latestRealtimeEventId,
					highlightedSavedEventId,
				});
				return (
					<div className="min-w-0 space-y-1">
						<span className="block max-w-[140px] truncate text-sm text-slate-700">
							{formatEventSource(value)}
						</span>
						{realtimeBadge ? (
							<Badge
								variant={realtimeBadge === "Live socket" ? "success-soft" : "warning-soft"}
								className="max-w-[140px] px-1.5 py-0 text-[11px] font-semibold">
								<span className="truncate">{realtimeBadge}</span>
							</Badge>
						) : null}
					</div>
				);
			},
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
						disabled={zktecoSync.isPending}
						onClick={() =>
							zktecoSync.mutate(
								deviceId !== "all" ? { deviceId } : {},
								{
									onSuccess: () => {
										void refetch();
										void refetchHealth();
									},
								},
							)
						}>
						<UploadCloud className="mr-2 h-4 w-4" />
						{zktecoSync.isPending ? "Starting" : "Sync logs"}
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
								placeholder="All paths"
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
								</div>
							</div>
							<Badge
								variant={realtimeStatus.isListening ? "success-soft" : "warning-soft"}
								className="w-fit rounded-md px-2 py-1 font-semibold">
								{realtimeStatus.rowUpdateLabel}
							</Badge>
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
								{isLatestSavedFresh ? "New punch saved to HRIS" : "Latest saved punch"}
							</span>
							<span className="truncate text-xs opacity-80">
								{latestSavedEvent.employeeName || `No. ${latestSavedEvent.employeeNo || "-"}`}
							</span>
						</div>
						<div className="flex min-w-0 items-center gap-2 text-xs">
							<span className="truncate">{formatPunchTime(latestSavedEvent.receivedAt)}</span>
							<span className="text-slate-400">/</span>
							<span className="truncate">{formatEventSource(latestSavedEvent.source)}</span>
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
					rowClassName={(item) =>
						viewMode === "saved" && item.id === highlightedSavedEventId
							? "bg-emerald-50/80 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-50"
							: ""
					}
				/>
			</div>
		</div>
	);
}
