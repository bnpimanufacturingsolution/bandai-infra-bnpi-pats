import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Database, Radio, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { useDeviceEvents, useDeviceHealth, useDevices, queryKeys } from "~/lib/hooks/useDevices";
import { useAcsEvents } from "~/lib/hooks/use-hikvision";
import { useAuth } from "~/lib/hooks/use-auth";
import { useSocket } from "~/contexts/socket-context";
import type {
	DeviceEvent,
	DeviceEventStatus,
	DeviceHealthResponse,
} from "~/services/devices.service";
import type { ApiQueryParams } from "~/services/api-service";
import type { AcsEventInfo } from "~/types/hikvision";

type EventViewMode = "live" | "saved";
type TimeWindow = "today" | "yesterday" | "last2" | "last7";

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
};

const viewOptions: SelectOption[] = [
	{ value: "saved", label: "Saved in HRIS" },
	{ value: "live", label: "Live from device" },
];

const timeWindowOptions: SelectOption[] = [
	{ value: "today", label: "Today" },
	{ value: "yesterday", label: "Yesterday" },
	{ value: "last2", label: "Last 2 days" },
	{ value: "last7", label: "Last 7 days" },
];

const PH_TIME_ZONE = "Asia/Manila";

const savedStatusOptions: SelectOption[] = [
	{ value: "all", label: "All HRIS results" },
	{ value: "MATCHED", label: "Matched" },
	{ value: "RECEIVED", label: "Received" },
	{ value: "ATTENDANCE_CREATED", label: "Attendance created" },
	{ value: "ATTENDANCE_UPDATED", label: "Attendance updated" },
	{ value: "UNMATCHED", label: "Needs match" },
	{ value: "IGNORED", label: "Recorded" },
	{ value: "FAILED", label: "Review" },
];

const sourceOptions: SelectOption[] = [
	{ value: "all", label: "All save paths" },
	{ value: "HIKVISION_CALLBACK", label: "Device callback" },
	{ value: "EN_HCNETSDK_ALARM", label: "Alarm listener" },
	{ value: "ZKTECO_EVENT", label: "ZKTeco bridge" },
];

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
	if (source === "ZKTECO_EVENT") return "ZKTeco bridge";
	if (source === "EN_HCNETSDK_ALARM") return "Alarm listener";
	if (source === "HIKVISION_CALLBACK") return "Device callback";
	return source || "-";
};

const statusVariant = (status: string) => {
	if (
		status === "MATCHED" ||
		status === "ATTENDANCE_CREATED" ||
		status === "ATTENDANCE_UPDATED"
	) {
		return "success-soft";
	}
	if (status === "UNMATCHED" || status === "NOT_SAVED") return "warning-soft";
	if (status === "FAILED") return "destructive";
	if (status === "IGNORED") return "secondary";
	return "outline";
};

const isZktecoDevice = (device: any, health?: DeviceHealthResponse) => {
	const vendor = String(device?.config?.vendor || device?.config?.type || "").toLowerCase();
	const name = String(device?.name || "").toLowerCase();
	return (
		health?.device?.vendor === "ZKTeco" ||
		Boolean(health?.checks?.zktecoBridge) ||
		vendor.includes("zkteco") ||
		name.includes("zkteco") ||
		(String(device?.protocol || "").toLowerCase() === "tcp" && Number(device?.port) === 4370)
	);
};

const healthValueClass = (ok?: boolean) =>
	ok ? "truncate text-sm font-medium text-emerald-700" : "truncate text-sm font-medium text-amber-700";

const HealthMetric = ({
	label,
	value,
	ok,
}: {
	label: string;
	value: string | number;
	ok?: boolean;
}) => (
	<div className="min-w-0">
		<p className="text-xs text-slate-500">{label}</p>
		<p className={healthValueClass(ok)}>{value}</p>
	</div>
);

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
	const [lastRealtimeEvent, setLastRealtimeEvent] =
		useState<DeviceEventSavedPayload | null>(null);

	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const query = searchParams.get("query") || "";
	const deviceId = searchParams.get("deviceId") || "all";
	const viewMode = (searchParams.get("view") || "saved") as EventViewMode;
	const status = searchParams.get("status") || "all";
	const source = searchParams.get("source") || "all";
	const sort = searchParams.get("sort") || "receivedAt";
	const order = searchParams.get("order") === "asc" ? "asc" : "desc";
	const timeWindow = (searchParams.get("window") || "today") as TimeWindow;
	const { from, to } = getDateRangeForWindow(timeWindow);

	const { data: devicesData } = useDevices({ limit: 100, document: true });
	const devices = useMemo(() => (devicesData as any)?.devices || [], [devicesData]);
	const selectedDevice = devices.find((device: any) => device.id === deviceId);
	const liveDevice = selectedDevice || devices[0];
	const liveDeviceId = liveDevice?.id;
	const {
		data: deviceHealth,
		isLoading: isLoadingHealth,
		isFetching: isFetchingHealth,
		refetch: refetchHealth,
	} = useDeviceHealth(liveDeviceId, Boolean(liveDeviceId));
	const isZktecoHealth = isZktecoDevice(liveDevice, deviceHealth);
	const zktecoBridge = deviceHealth?.checks?.zktecoBridge;
	const bridgeDevice = zktecoBridge?.device;
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
		query,
		deviceId: deviceId === "all" ? undefined : deviceId,
		status: viewMode === "saved" && status !== "all" ? status : undefined,
		source: viewMode === "saved" && source !== "all" ? source : undefined,
		sort: viewMode === "saved" ? sort : undefined,
		order: viewMode === "saved" ? order : undefined,
		from,
		to,
	};
	const savedTotalQueryParams: ApiQueryParams = {
		page: 1,
		limit: 1,
		deviceId: deviceId === "all" ? undefined : deviceId,
	};

	const {
		data,
		isLoading: isLoadingSaved,
		error: savedError,
		refetch,
	} = useDeviceEvents(savedQueryParams);
	const { data: savedTotalData } = useDeviceEvents(savedTotalQueryParams);

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
			startTime: `${from}T00:00:00+08:00`,
			endTime: `${to}T23:59:59+08:00`,
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
			return true;
		};

		const handleDeviceEventSaved = (payload: DeviceEventSavedPayload) => {
			if (!matchesCurrentScope(payload)) return;
			setLastRealtimeEvent(payload);
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
		socket,
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

	const rows: UnifiedDeviceEventRow[] = viewMode === "live" ? liveRows : savedEvents;
	const visibleEvents: UnifiedDeviceEventRow[] =
		viewMode === "live" && query
			? rows.filter((event: UnifiedDeviceEventRow) => {
					const needle = query.toLowerCase();
					return [
						event.deviceName,
						event.deviceAddress,
						event.employeeNo,
						event.employeeName,
						event.businessStatus,
						event.source,
						event.doorNo,
					]
						.filter((value) => value !== undefined && value !== null)
						.some((value) => String(value).toLowerCase().includes(needle));
				})
			: rows;
	const liveTotal = Number(acsEventPayload?.totalMatches || liveEvents.length || 0);
	const totalItems = viewMode === "live" ? liveTotal : data?.pagination?.total || data?.summary?.total || 0;
	const savedAllTimeTotal =
		savedTotalData?.pagination?.total || savedTotalData?.summary?.total || 0;
	const isEventLoading = viewMode === "live" ? isLoadingLive : isLoadingSaved;
	const activeError = viewMode === "live" ? liveError || savedError : savedError;
	const deviceSubtitle = liveDevice
		? isZktecoHealth
			? `${liveDevice.name || "Selected device"} - ZKTeco TCP ${liveDevice.port} - ZKTeco bridge`
			: `${liveDevice.name || "Selected device"} - Hikvision ISAPI ${
					deviceHealth?.device?.baseUrl ||
					`${liveDevice.protocol || "http"}://${liveDevice.address}:${liveDevice.port}`
				}`
		: "All devices - No device selected";

	const matchedCount = rows.filter(
		(event: UnifiedDeviceEventRow) =>
			event.status === "MATCHED" ||
			event.status === "ATTENDANCE_CREATED" ||
			event.status === "ATTENDANCE_UPDATED",
	).length;
	const attendanceWrittenCount = rows.filter(
		(event: UnifiedDeviceEventRow) =>
			event.status === "ATTENDANCE_CREATED" || event.status === "ATTENDANCE_UPDATED",
	).length;
	const needsEmployeeMatchCount = rows.filter(
		(event: UnifiedDeviceEventRow) => event.status === "UNMATCHED",
	).length;
	const notSavedCount = rows.filter(
		(event: UnifiedDeviceEventRow) => event.status === "NOT_SAVED",
	).length;

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
			key: "status",
			label: "Result",
			sortable: viewMode === "saved",
			width: "190px",
			required: true,
			render: (_value, item) => (
				<Badge
					variant={statusVariant(item.status) as any}
					className="max-w-[180px] justify-center font-semibold">
					<span className="truncate">{item.businessStatus}</span>
				</Badge>
			),
		},
		{
			key: "source",
			label: "Save path",
			sortable: viewMode === "saved",
			width: "150px",
			required: true,
			render: (value) => (
				<span className="block max-w-[140px] truncate text-sm text-slate-700">
					{formatEventSource(value)}
				</span>
			),
		},
		{
			key: "attendanceId",
			label: "Attendance write",
			sortable: false,
			width: "180px",
			required: true,
			render: (value, item) =>
				value && item.employeeProfileId ? (
					<Link
						to={`/employee/${item.employeeProfileId}/attendance?from=device-events&attendanceId=${encodeURIComponent(
							String(value),
						)}`}
						className="block max-w-[170px] truncate text-sm text-slate-700 hover:text-slate-950 hover:underline">
						Open record
					</Link>
				) : (
					<span className="block max-w-[170px] truncate text-sm text-slate-500">-</span>
				),
		},
		{
			key: "doorNo",
			label: "Door",
			sortable: viewMode === "saved",
			width: "120px",
			required: true,
			render: (value) => <span className="text-sm text-slate-700">{value ? `Door ${value}` : "-"}</span>,
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
						<p className="truncate text-xs text-slate-500">{deviceSubtitle}</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Badge
						variant={isConnected ? "success-soft" : "secondary"}
						className="rounded-md px-2 py-1">
						{isConnected ? "Realtime on" : "Realtime off"}
					</Badge>
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
							? "grid gap-2 border-b border-slate-200 p-3 md:grid-cols-[minmax(140px,0.7fr)_minmax(220px,1fr)_minmax(140px,0.7fr)]"
							: "grid gap-2 border-b border-slate-200 p-3 md:grid-cols-[minmax(140px,0.7fr)_minmax(180px,1fr)_minmax(140px,0.65fr)_minmax(140px,0.65fr)_minmax(140px,0.65fr)]"
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
								}
							})
						}
						placeholder="Saved in HRIS"
					/>
					<Select
						options={deviceOptions}
						value={deviceId}
						onChange={(value) => setFilter("deviceId", value)}
						placeholder="All devices"
					/>
					<Select
						options={timeWindowOptions}
						value={timeWindow}
						onChange={(value) => setFilter("window", value)}
						placeholder="Today"
					/>
					{viewMode === "saved" && (
						<>
							<Select
								options={savedStatusOptions}
								value={status}
								onChange={(value) => setFilter("status", value)}
								placeholder="All HRIS results"
							/>
							<Select
								options={sourceOptions}
								value={source}
								onChange={(value) => setFilter("source", value)}
								placeholder="All save paths"
							/>
						</>
					)}
				</div>

				<div className="grid gap-0 divide-y divide-slate-200 md:grid-cols-[minmax(220px,1.2fr)_minmax(260px,1fr)_minmax(360px,1.7fr)] md:divide-x md:divide-y-0">
					<div className="flex min-w-0 items-center justify-between gap-3 p-3">
						<div className="min-w-0">
							<p className="truncate text-sm font-medium text-slate-950">
								{liveDevice?.name || "Selected device"}
							</p>
							<p className="truncate text-xs text-slate-500">
								{isLoadingHealth
									? "Checking..."
									: deviceHealth?.summary?.checkedAt
										? `Checked ${new Date(deviceHealth.summary.checkedAt).toLocaleTimeString()}`
										: "Not checked"}
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							className="h-8 px-2 text-xs"
							onClick={() => refetchHealth()}
							disabled={isFetchingHealth || !liveDeviceId}>
							<RefreshCw className="mr-2 h-3.5 w-3.5" />
							Check
						</Button>
					</div>

					<div className="grid grid-cols-2 gap-x-3 gap-y-2 p-3">
						<HealthMetric label="HRIS API" value="Online" ok />
						<HealthMetric
							label="Device port"
							value={deviceHealth?.checks?.network?.status || "-"}
							ok={Boolean(deviceHealth?.checks?.network?.ok)}
						/>
						{isZktecoHealth ? (
							<>
								<HealthMetric
									label="ZKTeco bridge"
									value={zktecoBridge?.status || "-"}
									ok={Boolean(zktecoBridge?.ok)}
								/>
								<HealthMetric
									label="Bridge device"
									value={bridgeDevice?.connected ? "connected" : "offline"}
									ok={Boolean(bridgeDevice?.connected)}
								/>
							</>
						) : (
							<>
								<HealthMetric
									label="Hikvision listener"
									value={deviceHealth?.checks?.hikvisionListener?.status || "-"}
									ok={Boolean(deviceHealth?.checks?.hikvisionListener?.ok)}
								/>
								<HealthMetric
									label="Device API"
									value={deviceHealth?.checks?.deviceApi?.status || "-"}
									ok={Boolean(deviceHealth?.checks?.deviceApi?.ok)}
								/>
							</>
						)}
					</div>

					<div className="grid grid-cols-4 gap-0 divide-x divide-slate-200 p-0">
						{[
							{
								label: viewMode === "live" ? "Device punches" : "Total events",
								value: viewMode === "live" ? liveEvents.length : savedAllTimeTotal,
							},
							{ label: "Matched", value: matchedCount },
							{ label: "Needs match", value: needsEmployeeMatchCount },
							{
								label: viewMode === "live" ? "Pending" : "Attendance writes",
								value: viewMode === "live" ? notSavedCount : attendanceWrittenCount,
							},
						].map((item) => (
							<div key={item.label} className="min-w-0 px-3 py-2">
								<p className="truncate text-xs text-slate-500">{item.label}</p>
								<p className="text-base font-semibold text-slate-950">{item.value}</p>
							</div>
						))}
					</div>
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
						? "ZKTeco punches are received through the configured bridge and shown after they are saved in HRIS."
						: "Live reads are paused until the selected device connection responds."}
				</div>
			)}

			{activeError && (
				<div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
					{activeError.message}
				</div>
			)}

			<div className="rounded-md border border-slate-200 bg-white p-3">
				<div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
					<div className="min-w-0">
						<h2 className="truncate text-sm font-semibold text-slate-950">
							{viewMode === "live" ? "Live punches" : "Saved punches"}
						</h2>
						<p className="truncate text-xs text-slate-500">
							{viewMode === "live" ? "Device read" : "HRIS stored event ledger"}
							{lastRealtimeEvent?.emittedAt
								? ` · Latest ${formatPunchTime(lastRealtimeEvent.emittedAt)}`
								: ""}
						</p>
					</div>
					<div className="flex items-center gap-2 text-xs text-slate-500">
						{viewMode === "live" ? (
							<>
								<Radio className="h-4 w-4" />
								<span>Live</span>
							</>
						) : (
							<>
								<Database className="h-4 w-4" />
								<span>Saved</span>
							</>
						)}
					</div>
				</div>
				<DataTable<UnifiedDeviceEventRow>
					title={viewMode === "live" ? "Punches" : "Saved punches"}
					description=""
					data={visibleEvents}
					columns={columns}
					isLoading={isEventLoading}
					emptyMessage={viewMode === "live" ? "No device punches found" : "No saved events found"}
					emptyDescription=""
					showSearch
					showFilters={false}
					showPagination
					showExport={false}
					noCard
					searchPlaceholder="Search employee, device, result..."
					searchWidth="w-full sm:w-80"
					searchValue={query}
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
				/>
			</div>
		</div>
	);
}
