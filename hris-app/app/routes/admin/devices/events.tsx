import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
	ArrowLeft,
	BadgeCheck,
	Clock,
	ExternalLink,
	Eye,
	Loader2,
	MapPin,
	Power,
	RefreshCw,
	Search,
	Server,
	Trash2,
	UploadCloud,
	UserRound,
	Wifi,
	WifiOff,
	XCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { hikvisionObservedAddressMatchesDevice } from "../../../lib/hikvision-device-address";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import {
	useDeviceEvents,
	useDeviceHealth,
	useDeviceHealthMap,
	useDeviceImportJob,
	useDeviceSyncPreview,
	useCancelDeviceImportJob,
	useControlHikvisionListener,
	useDevices,
	useHikvisionListenerStatus,
	useResetDeviceEvents,
	useTriggerHikvisionAttendanceImport,
	useTriggerZktecoAttendanceSync,
	queryKeys,
} from "~/lib/hooks/useDevices";
import { getDeviceReachabilityDotClass } from "~/lib/device-reachability";
import { useAcsEvents } from "~/lib/hooks/use-hikvision";
import { useAuth } from "~/lib/hooks/use-auth";
import { useSocket } from "~/contexts/socket-context";
import {
	getDeviceEventsRealtimeStatus,
	getHighlightedSavedDeviceEventId,
	getSavedDeviceEventProcessingLabel,
	prependRealtimeSavedRows,
	savedDeviceEventMatchesScope,
	shouldRefreshSavedEventsAfterSocketEvent,
} from "~/lib/device-events-realtime-ui";
import type {
	DeviceEvent,
	DeviceEventStatus,
	DeviceEventsResetResponse,
	DeviceHealthResponse,
	DeviceSyncPreviewEventRow,
	DeviceSyncPreviewRow,
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
	eventCategory?: string | null;
	eventAction?: string | null;
	eventLabel?: string | null;
	processingLabel?: string | null;
	transportLabel?: string | null;
	capabilityConfidence?: string | null;
	evidenceSource?: string | null;
	directDeviceEvidence?: boolean;
	payload?: any;
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

type ActiveImportJob = {
	jobId: string;
	deviceId: string;
	deviceName: string;
	vendor: "Hikvision" | "ZKTeco" | string;
};

type ResetPreviewState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; data: DeviceEventsResetResponse }
	| { status: "executed"; data: DeviceEventsResetResponse }
	| { status: "error"; message: string };

const DEVICE_IMPORT_JOB_STORAGE_KEY = "project-truth-device-import-job-v1";

type ZktecoBridgePreflight = NonNullable<DeviceHealthResponse["checks"]["zktecoBridge"]> & {
	estimatedRowsToSync?: number | string | null;
	missingRows?: number | string | null;
	dryRun?: { missingRows?: number | string | null };
	data?: { dryRun?: { missingRows?: number | string | null } };
};

const SyncPreviewSkeleton = () => (
	<div className="mt-3 flex flex-wrap gap-1.5" aria-label="Checking what can be added">
		<p className="w-full text-xs text-slate-600">Checking what can be added…</p>
		<Skeleton className="h-6 w-36 rounded-full bg-slate-200" />
		<Skeleton className="h-6 w-28 rounded-full bg-slate-200" />
	</div>
);

const SyncDeviceDetailsSkeleton = () => (
	<div className="divide-y divide-slate-100" aria-label="Checking device details">
		<p className="px-3 py-2 text-xs text-slate-600">Loading device preview…</p>
		{[0, 1].map((index) => (
			<div
				key={`sync-device-detail-skeleton-${index}`}
				className="flex flex-col gap-3 px-3 py-3 md:flex-row md:items-start md:justify-between">
				<div className="min-w-0 space-y-2">
					<Skeleton className="h-4 w-52 bg-slate-200" />
					<Skeleton className="h-3 w-40 bg-slate-200" />
				</div>
				<div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 md:min-w-[430px]">
					{[0, 1, 2, 3].map((cell) => (
						<div key={`sync-device-detail-skeleton-${index}-${cell}`} className="space-y-2">
							<Skeleton className="h-3 w-20 bg-slate-200" />
							<Skeleton className="h-4 w-12 bg-slate-200" />
						</div>
					))}
					<div className="col-span-2 sm:col-span-4">
						<Skeleton className="h-6 w-28 rounded-full bg-slate-200" />
					</div>
				</div>
			</div>
		))}
	</div>
);

const getAsyncErrorMessage = (error: unknown, fallback: string) => {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "object" && error && "message" in error) {
		const message = String((error as { message?: unknown }).message || "").trim();
		if (message) return message;
	}
	if (typeof error === "string" && error.trim()) return error.trim();
	return fallback;
};

const timeWindowOptions: SelectOption[] = [
	{ value: "today", label: "Today" },
	{ value: "yesterday", label: "Yesterday" },
	{ value: "last2", label: "Last 2 days" },
	{ value: "last7", label: "Last 7 days" },
	{ value: "all", label: "All time" },
];

const PH_TIME_ZONE = "Asia/Manila";

const savedStatusOptions: SelectOption[] = [
	{ value: "all", label: "All HRIS results" },
	{ value: "MATCHED", label: "Matched to employee" },
	{ value: "RECEIVED", label: "Received" },
	{ value: "ATTENDANCE_CREATED", label: "Attendance created" },
	{ value: "ATTENDANCE_UPDATED", label: "Attendance updated" },
	{ value: "UNMATCHED", label: "Needs match" },
	{ value: "IGNORED", label: "Recorded only" },
	{ value: "FAILED", label: "Needs review" },
];

const sourceOptions: SelectOption[] = [
	{ value: "all", label: "All runtime paths" },
	{ value: "HIKVISION_CALLBACK", label: "Hikvision callback watcher" },
	{ value: "EN_HCNETSDK_ALARM", label: "Hikvision SDK listener" },
	{ value: "ZKTECO_EVENT", label: "ZKTeco Linux bridge" },
];

const eventCategoryOptions: SelectOption[] = [
	{ value: "all", label: "Any event category" },
	{ value: "ATTENDANCE", label: "Attendance" },
	{ value: "ENROLLMENT", label: "Enrollment" },
	{ value: "USER_MANAGEMENT", label: "User management" },
	{ value: "ACCESS_CONTROL", label: "Access control" },
	{ value: "DEVICE_HEALTH", label: "Device health" },
	{ value: "RUNTIME", label: "Runtime" },
	{ value: "UNKNOWN_VENDOR", label: "Unknown vendor" },
];

const eventActionOptions: SelectOption[] = [
	{ value: "all", label: "Any event action" },
	{ value: "TAP", label: "Attendance tap" },
	{ value: "FINGERPRINT_ENROLLED", label: "Fingerprint enrolled" },
	{ value: "FINGERPRINT_UPDATED", label: "Fingerprint updated" },
	{ value: "FINGERPRINT_DELETED", label: "Fingerprint deleted" },
	{ value: "FACE_ENROLLED", label: "Face enrolled" },
	{ value: "FACE_UPDATED", label: "Face updated" },
	{ value: "FACE_DELETED", label: "Face deleted" },
	{ value: "CARD_ENROLLED", label: "Card enrolled" },
	{ value: "CARD_UPDATED", label: "Card updated" },
	{ value: "CARD_DELETED", label: "Card deleted" },
	{ value: "USER_CREATED", label: "User created" },
	{ value: "USER_UPDATED", label: "User updated" },
	{ value: "USER_DELETED", label: "User deleted" },
	{ value: "TAP_REJECTED", label: "Rejected access tap" },
	{ value: "SYNC_SIGNAL", label: "Sync signal" },
	{ value: "SYNC_IMPORTED", label: "Sync imported" },
	{ value: "LISTENER_RECEIVED", label: "Listener received" },
	{ value: "UNKNOWN", label: "Unknown" },
];

/** Category → actions so Action dropdown is not misleading under Attendance etc. */
const EVENT_ACTIONS_BY_CATEGORY: Record<string, string[]> = {
	ATTENDANCE: ["TAP", "TAP_REJECTED"],
	ENROLLMENT: [
		"FINGERPRINT_ENROLLED",
		"FINGERPRINT_UPDATED",
		"FINGERPRINT_DELETED",
		"FACE_ENROLLED",
		"FACE_UPDATED",
		"FACE_DELETED",
		"CARD_ENROLLED",
		"CARD_UPDATED",
		"CARD_DELETED",
	],
	USER_MANAGEMENT: ["USER_CREATED", "USER_UPDATED", "USER_DELETED"],
	ACCESS_CONTROL: ["TAP", "TAP_REJECTED"],
	DEVICE_HEALTH: ["SYNC_SIGNAL", "LISTENER_RECEIVED"],
	RUNTIME: ["SYNC_SIGNAL", "SYNC_IMPORTED", "LISTENER_RECEIVED"],
	UNKNOWN_VENDOR: ["UNKNOWN"],
};

const getEventActionOptionsForCategory = (category: string): SelectOption[] => {
	if (!category || category === "all") return eventActionOptions;
	const allowed = new Set(EVENT_ACTIONS_BY_CATEGORY[category] || []);
	if (allowed.size === 0) return eventActionOptions;
	return [
		{ value: "all", label: "Any event action" },
		...eventActionOptions.filter((option) => option.value !== "all" && allowed.has(option.value)),
	];
};

const evidenceSourceOptions: SelectOption[] = [
	{ value: "all", label: "All evidence sources" },
	{ value: "SDK_CALLBACK", label: "SDK callback" },
	{ value: "ISAPI_LOGSEARCH", label: "ISAPI logSearch" },
	{ value: "STATE_TRANSITION_INFERRED", label: "Verified state transition" },
	{ value: "RUNTIME_PROCESS", label: "Runtime process" },
	{ value: "ZKTECO_CALLBACK", label: "ZKTeco callback" },
	{ value: "ZKTECO_IMPORT", label: "ZKTeco import" },
	{ value: "UNKNOWN", label: "Unknown evidence" },
];

const eventConfidenceOptions: SelectOption[] = [
	{ value: "all", label: "All confidence levels" },
	{ value: "PROVEN", label: "Proven" },
	{ value: "SUPPORTED", label: "Supported" },
	{ value: "INFERRED", label: "Inferred" },
	{ value: "UNKNOWN", label: "Unknown" },
];

const compactSelectClassName = "h-7 text-xs";
const compactSelectDropdownClassName = "rounded-md shadow-md";

const FilterField = ({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) => (
	<label className="block min-w-0 space-y-1">
		<span className="block truncate text-[11px] font-semibold text-slate-500">{label}</span>
		{children}
	</label>
);

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

const formatEventTime = (value: string | Date | null | undefined) => {
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

const getSyncDateRangeForWindow = (window: "all" | "7d" | "30d" | "90d") => {
	if (window === "all") return { from: null, to: null };
	const today = new Date();
	const days = window === "7d" ? 6 : window === "30d" ? 29 : 89;
	return { from: getDateKey(subtractDays(today, days)), to: getDateKey(today) };
};

const getSyncSourceGroup = (scopes: {
	includeAttendance: boolean;
	includeOperations: boolean;
}) => {
	if (scopes.includeAttendance && scopes.includeOperations) return "all";
	if (scopes.includeAttendance) return "attendance";
	if (scopes.includeOperations) return "operations";
	return "needsReview";
};

const getAcsEventPayload = (data: any) => data?.data?.AcsEvent || data?.AcsEvent || null;

const formatBusinessStatus = (status: string) => {
	if (status === "ATTENDANCE_CREATED") return "Attendance created";
	if (status === "ATTENDANCE_UPDATED") return "Attendance updated";
	if (status === "UNMATCHED") return "Needs match";
	if (status === "IGNORED") return "Recorded, no attendance change";
	if (status === "FAILED") return "Needs review";
	if (status === "RECEIVED") return "Received";
	if (status === "MATCHED") return "Matched to employee";
	return status
		.toLowerCase()
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
};

const formatEventSource = (source?: string | null) => {
	if (source === "ZKTECO_EVENT") return "ZKTeco Linux bridge";
	if (source === "EN_HCNETSDK_ALARM") return "Hikvision SDK listener";
	if (source === "HIKVISION_CALLBACK") return "Hikvision callback watcher";
	return source || "-";
};

const formatEventSourceDetail = (source?: string | null) => {
	if (source === "ZKTECO_EVENT") return "Saved from the ZKTeco SDK sidecar.";
	if (source === "EN_HCNETSDK_ALARM") return "Saved from the HCNetSDK alarm listener.";
	if (source === "HIKVISION_CALLBACK") return "Saved from the Hikvision callback watcher.";
	return "Saved by HRIS device event processing.";
};

const formatEventTaxonomyToken = (value?: string | null) => {
	const text = String(value || "").trim();
	if (!text) return "-";
	return text
		.toLowerCase()
		.split(/[_\s-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
};

const getOptionLabel = (options: SelectOption[], value: string) =>
	options.find((option) => option.value === value)?.label || formatEventTaxonomyToken(value);

const getEmployeeRecordUrl = (employeeProfileId?: string | null) =>
	employeeProfileId
		? `/admin/configuration/employees?action=view&id=${encodeURIComponent(employeeProfileId)}`
		: "";

/**
 * Open Sync Center → Device users for this physical device, filtered to plain device person no.
 * This is DEVICE inventory (DeviceUser), not HRIS Employee.
 */
const getDeviceUserSyncCenterUrl = (
	deviceId?: string | null,
	employeeNo?: string | null,
) => {
	const id = String(deviceId || "").trim();
	if (!id) return "/admin/configuration/devices?action=device-users&syncPanel=users";
	const params = new URLSearchParams({
		action: "device-users",
		deviceId: id,
		syncPanel: "users",
		// HRIS DeviceUser inventory (saved stubs), not live "Current view" merge which can be empty
		// when the person was never imported or was removed from the terminal.
		deviceUserView: "hris",
	});
	const person = String(employeeNo || "").trim();
	if (person && !/^[A-Za-z0-9+/]{16,}={0,2}$/.test(person)) {
		params.set("deviceUserSearch", person);
	}
	return `/admin/configuration/devices?${params.toString()}`;
};

/** Device logSearch often stores base64 privacy tokens — not readable employee nos. */
const isOpaqueDevicePersonToken = (value?: string | null) => {
	const token = String(value || "").trim();
	if (!token) return false;
	if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(token) && !/[+/=]/.test(token)) return false;
	if (/^[A-Za-z0-9+/]{16,}={0,2}$/.test(token) && /[+/=]/.test(token)) return true;
	if (token.length >= 20 && /[+/=]/.test(token)) return true;
	return false;
};

/** Prefer plain employeeNo after write-time map resolve; fall back to raw. */
const getDisplayEmployeeNo = (item: Pick<UnifiedDeviceEventRow, "employeeNo" | "payload">) => {
	const resolved = String(
		item.payload?.resolvedEmployeeNo ||
			(item.payload?.personTokenResolved ? item.employeeNo : "") ||
			"",
	).trim();
	if (resolved && !isOpaqueDevicePersonToken(resolved)) return resolved;
	const raw = String(item.employeeNo || "").trim();
	return raw;
};

const formatDeviceEventPersonRef = (
	employeeNo?: string | null,
	item?: Pick<UnifiedDeviceEventRow, "employeeNo" | "payload"> | null,
) => {
	const token = item ? getDisplayEmployeeNo(item) : String(employeeNo || "").trim();
	if (!token) return "No person id on device log";
	if (isOpaqueDevicePersonToken(token)) {
		return "Device person token (not a readable employee no.)";
	}
	return `No. ${token}`;
};

const getEmployeeDisplayName = (item: UnifiedDeviceEventRow) => {
	if (item.employeeName) return item.employeeName;
	if (item.employeeProfileId) return item.employeeId || getDisplayEmployeeNo(item) || "Employee";
	const displayNo = getDisplayEmployeeNo(item);
	if (isOpaqueDevicePersonToken(displayNo)) return "Not linked to HRIS employee";
	if (displayNo) return "Employee not matched";
	return "Unknown person";
};

const getEmployeeInitials = (item: UnifiedDeviceEventRow) => {
	const displayNo = getDisplayEmployeeNo(item);
	if (isOpaqueDevicePersonToken(displayNo) && !item.employeeName) return "??";
	const name = item.employeeName || item.employeeId || displayNo || "?";
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

const isHikvisionDevice = (device: any, health?: DeviceHealthResponse) => {
	const vendor = String(device?.config?.vendor || device?.config?.type || "").toLowerCase();
	const name = String(device?.name || "").toLowerCase();
	const model = String(device?.config?.model || "").toLowerCase();
	return (
		health?.device?.vendor === "Hikvision" ||
		Boolean(health?.checks?.hikvisionListener) ||
		vendor.includes("hikvision") ||
		name.includes("hikvision") ||
		model.startsWith("ds-")
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

const getNumericCount = (value?: number | string | null) =>
	hasNumericCount(value) ? Number(value) : null;

const getSyncKnownSkippedCount = (row: { knownSkippedEventCount?: number | string | null }) =>
	Math.max(getNumericCount(row.knownSkippedEventCount) ?? 0, 0);

const getSyncStillMissingCount = (row: {
	missingEventCount?: number | string | null;
	needsSyncEvents?: number | string | null;
}) => {
	const value = getNumericCount(row.missingEventCount ?? row.needsSyncEvents);
	return value === null ? null : Math.max(value, 0);
};

const getSyncProjectedSaveCount = (
	row: {
		importableIfSaveMissingEmployeeNo?: number | string | null;
		missingEventCount?: number | string | null;
		needsSyncEvents?: number | string | null;
		knownSkippedEventCount?: number | string | null;
	},
	skipMissingEmployeeNo: boolean,
) => {
	const stillMissing = getSyncStillMissingCount(row);
	if (stillMissing === null) return null;
	if (skipMissingEmployeeNo) return stillMissing;
	const explicitSaveAll = getNumericCount(row.importableIfSaveMissingEmployeeNo);
	return explicitSaveAll === null
		? stillMissing + getSyncKnownSkippedCount(row)
		: Math.max(explicitSaveAll, 0);
};

/** Attendance taps = ACS access events. User/enrollment = Information logSearch. */
const isSyncAttendanceEventRow = (row: DeviceSyncPreviewEventRow) => {
	const cat = String(row.eventCategory || "").toUpperCase();
	if (cat === "ATTENDANCE") return true;
	if (String(row.readsFrom || "").includes("AcsEvent")) return true;
	if (String(row.sourceProof || "").toLowerCase().includes("attendance")) return true;
	const action = String(row.eventAction || "").toUpperCase();
	return action === "TAP" || action === "TAP_REJECTED";
};

const isSyncOperationEventRow = (row: DeviceSyncPreviewEventRow) => {
	const cat = String(row.eventCategory || "").toUpperCase();
	if (cat === "ENROLLMENT" || cat === "USER_MANAGEMENT") return true;
	if (String(row.readsFrom || "").includes("logSearch")) return true;
	if (String(row.sourceProof || "").toLowerCase().includes("operation")) return true;
	const action = String(row.eventAction || "").toUpperCase();
	return (
		action.startsWith("USER_") ||
		action.startsWith("FINGERPRINT_") ||
		action.startsWith("FACE_") ||
		action.startsWith("CARD_")
	);
};

type SyncImportScopeOptions = {
	includeAttendance: boolean;
	includeOperations: boolean;
};

/** Sum Ready willAdd for the scopes the admin chose to save (preview-truthful). */
const getScopedSyncWillAdd = (
	device: DeviceSyncPreviewRow,
	skipMissingEmployeeNo: boolean,
	scopes: SyncImportScopeOptions,
) => {
	const rows = getFallbackSyncEventRows(device, skipMissingEmployeeNo);
	return rows.reduce((sum, row) => {
		if (row.status !== "Ready" || !hasNumericCount(row.willAdd) || Number(row.willAdd) <= 0) {
			return sum;
		}
		if (scopes.includeAttendance && isSyncAttendanceEventRow(row)) {
			return sum + Number(row.willAdd);
		}
		if (scopes.includeOperations && isSyncOperationEventRow(row)) {
			return sum + Number(row.willAdd);
		}
		return sum;
	}, 0);
};

const getScopedSyncWillAddBreakdown = (
	device: DeviceSyncPreviewRow,
	skipMissingEmployeeNo: boolean,
	scopes: SyncImportScopeOptions,
) => {
	const rows = getFallbackSyncEventRows(device, skipMissingEmployeeNo);
	let attendance = 0;
	let operations = 0;
	for (const row of rows) {
		if (row.status !== "Ready" || !hasNumericCount(row.willAdd) || Number(row.willAdd) <= 0) {
			continue;
		}
		if (scopes.includeAttendance && isSyncAttendanceEventRow(row)) {
			attendance += Number(row.willAdd);
		}
		if (scopes.includeOperations && isSyncOperationEventRow(row)) {
			operations += Number(row.willAdd);
		}
	}
	return { attendance, operations, total: attendance + operations };
};

const getScopedSyncNeedsReviewBreakdown = (
	device: DeviceSyncPreviewRow,
	skipMissingEmployeeNo: boolean,
	scopes: SyncImportScopeOptions,
) => {
	const rows = getFallbackSyncEventRows(device, skipMissingEmployeeNo);
	let attendance = 0;
	let operations = 0;
	for (const row of rows) {
		if (row.status !== "Needs review") continue;
		const count = hasNumericCount(row.willAdd) ? Math.max(0, Number(row.willAdd)) : 1;
		if (scopes.includeAttendance && isSyncAttendanceEventRow(row)) {
			attendance += count;
		}
		if (scopes.includeOperations && isSyncOperationEventRow(row)) {
			operations += count;
		}
	}
	return { attendance, operations, total: attendance + operations };
};

const SYNC_TIME_WINDOW_OPTIONS: Array<{ value: "all" | "7d" | "30d" | "90d"; label: string; help: string }> = [
	{ value: "all", label: "All history", help: "Everything the device still has" },
	{ value: "7d", label: "Last 7 days", help: "Recent week only" },
	{ value: "30d", label: "Last 30 days", help: "Recent month only" },
	{ value: "90d", label: "Last 90 days", help: "Recent quarter only" },
];

const getSyncProjectedSkipCount = (
	row: { knownSkippedEventCount?: number | string | null },
	skipMissingEmployeeNo: boolean,
) => (skipMissingEmployeeNo ? getSyncKnownSkippedCount(row) : 0);

const getSyncDeviceTitle = (vendor?: string | null, name?: string | null, address?: string | null) => {
	const vendorLabel = String(vendor || "").trim();
	const nameLabel = String(name || "").trim();
	if (!vendorLabel) return nameLabel || address || "Device";
	if (!nameLabel) return address ? `${vendorLabel} ${address}` : vendorLabel;
	if (nameLabel.toLowerCase().startsWith(vendorLabel.toLowerCase())) return nameLabel;
	return `${vendorLabel} ${nameLabel}`;
};

const eventFilterLabels: Record<string, string> = {
	FINGERPRINT_ENROLLED: "Enrollment > Fingerprint enrolled",
	FINGERPRINT_UPDATED: "Enrollment > Fingerprint updated",
	FINGERPRINT_DELETED: "Enrollment > Fingerprint deleted",
	FACE_ENROLLED: "Enrollment > Face enrolled",
	FACE_UPDATED: "Enrollment > Face updated",
	FACE_DELETED: "Enrollment > Face deleted",
	CARD_ENROLLED: "Enrollment > Card enrolled",
	CARD_UPDATED: "Enrollment > Card updated",
	CARD_DELETED: "Enrollment > Card deleted",
	USER_CREATED: "User Management > User created",
	USER_UPDATED: "User Management > User updated",
	USER_DELETED: "User Management > User deleted",
	TAP: "Attendance > Tap",
	TAP_REJECTED: "Attendance > Tap rejected",
	UNKNOWN: "Unknown > Unknown",
};

const hikvisionSyncLogsFallbackCatalog: Array<{
	eventAction: string;
	eventLabel: string;
	sourceProof: string;
	readsFrom: string;
	filterAfterSync: string;
	eventCategory: string;
	evidenceSource: string;
	family: "operation" | "attendance";
}> = [
	{
		eventAction: "FINGERPRINT_ENROLLED",
		eventLabel: "Fingerprint enrolled",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "Enrollment > Fingerprint enrolled",
		eventCategory: "ENROLLMENT",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "USER_CREATED",
		eventLabel: "User created",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "User Management > User created",
		eventCategory: "USER_MANAGEMENT",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "FACE_ENROLLED",
		eventLabel: "Face enrolled",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "Enrollment > Face enrolled",
		eventCategory: "ENROLLMENT",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "UNKNOWN_OPERATION",
		eventLabel: "Unclassified device operation",
		sourceProof: "Operation logs",
		readsFrom: "ContentMgmt/logSearch",
		filterAfterSync: "Needs review > Unclassified device operation",
		eventCategory: "UNKNOWN",
		evidenceSource: "ISAPI_LOGSEARCH",
		family: "operation",
	},
	{
		eventAction: "TAP",
		eventLabel: "Attendance tap",
		sourceProof: "Attendance/access events",
		readsFrom: "AccessControl/AcsEvent",
		filterAfterSync: "Attendance > Tap",
		eventCategory: "ATTENDANCE",
		evidenceSource: "SDK_CALLBACK",
		family: "attendance",
	},
	{
		eventAction: "TAP_REJECTED",
		eventLabel: "Rejected tap",
		sourceProof: "Attendance/access events",
		readsFrom: "AccessControl/AcsEvent",
		filterAfterSync: "Attendance > Tap rejected",
		eventCategory: "ATTENDANCE",
		evidenceSource: "SDK_CALLBACK",
		family: "attendance",
	},
];

const getSyncBusinessArea = (row: DeviceSyncPreviewEventRow) => {
	if (row.businessArea) return row.businessArea;
	const filterArea = String(row.filterAfterSync || "").split(" > ")[0]?.trim();
	if (filterArea === "User Management" || filterArea === "Enrollment" || filterArea === "Attendance") {
		return filterArea;
	}
	if (filterArea === "Needs review") return "Needs review";
	if (row.eventAction === "UNKNOWN_OPERATION" || row.eventAction === "UNKNOWN_ACCESS") return "Needs review";
	if (row.eventCategory === "USER_MANAGEMENT") return "User Management";
	if (row.eventCategory === "ENROLLMENT") return "Enrollment";
	if (row.eventCategory === "ATTENDANCE") return "Attendance";
	return row.status === "Needs review" ? "Needs review" : "Device Events";
};

const getSyncWhereToFind = (row: DeviceSyncPreviewEventRow) =>
	row.whereToFind || (row.filterAfterSync ? `Device Events > ${row.filterAfterSync}` : "Device Events");

const getSyncReviewReason = (row: DeviceSyncPreviewEventRow) =>
	row.reviewReason ||
	(row.status === "Needs review"
		? "HRIS could not identify this device action yet."
		: null);

const getSyncSourceDetail = (row: DeviceSyncPreviewEventRow) => {
	if (row.sourceDetail) return row.sourceDetail;
	const readLabel =
		row.sourceProof === "Operation logs"
			? "Read from device operation logs."
			: row.sourceProof === "Attendance/access events"
				? "Read from attendance/access events."
				: row.sourceProof
					? `Read from ${row.sourceProof}.`
					: "Read from the device source.";
	const deviceLabel = row.deviceLabels?.length ? ` Device label: ${row.deviceLabels.join(", ")}.` : "";
	const saveLabel =
		row.status === "Needs review"
			? " HRIS will hold this for review instead of saving it as a known event."
			: ` HRIS will save this as: ${row.eventLabel}.`;
	return `${readLabel}${deviceLabel}${saveLabel}`;
};

/** Short category chip for the single Sync logs table (no multi-section layout). */
const getSyncCategoryToken = (row: DeviceSyncPreviewEventRow) => {
	const cat = String(row.eventCategory || "").toUpperCase();
	if (cat === "USER_MANAGEMENT") return "USER MGMT";
	if (cat === "ENROLLMENT") return "ENROLLMENT";
	if (cat === "ATTENDANCE") return "ATTENDANCE";
	if (cat === "UNKNOWN") return "REVIEW";
	const area = getSyncBusinessArea(row);
	if (area === "User Management") return "USER MGMT";
	if (area === "Enrollment") return "ENROLLMENT";
	if (area === "Attendance") return "ATTENDANCE";
	if (area === "Needs review") return "REVIEW";
	return "OTHER";
};

const syncCategoryTokenOrder = ["USER MGMT", "ENROLLMENT", "ATTENDANCE", "REVIEW", "OTHER"];

/** Compact single-line event name (long API labels stay in title tooltip). */
const getSyncEventLabelCompact = (row: DeviceSyncPreviewEventRow) => {
	const label = String(row.eventLabel || row.eventAction || "Event").trim();
	if (row.eventAction === "UNKNOWN_OPERATION" || /unclassified/i.test(label)) return "Unclassified";
	if (row.eventAction === "TAP_REJECTED" || /rejected tap/i.test(label)) return "Rejected tap";
	if (label.length > 22) return `${label.slice(0, 20)}…`;
	return label;
};

const sortSyncEventRows = (rows: DeviceSyncPreviewEventRow[]) =>
	[...rows].sort((left, right) => {
		const leftToken = getSyncCategoryToken(left);
		const rightToken = getSyncCategoryToken(right);
		const leftIndex = syncCategoryTokenOrder.indexOf(leftToken);
		const rightIndex = syncCategoryTokenOrder.indexOf(rightToken);
		const leftOrder = leftIndex === -1 ? 99 : leftIndex;
		const rightOrder = rightIndex === -1 ? 99 : rightIndex;
		if (leftOrder !== rightOrder) return leftOrder - rightOrder;
		const leftWill = hasNumericCount(left.willAdd) ? Number(left.willAdd) : -1;
		const rightWill = hasNumericCount(right.willAdd) ? Number(right.willAdd) : -1;
		if (rightWill !== leftWill) return rightWill - leftWill;
		return String(left.eventLabel || "").localeCompare(String(right.eventLabel || ""));
	});

const getFallbackSyncEventRows = (device: DeviceSyncPreviewRow, skipMissingEmployeeNo: boolean) => {
	if (Array.isArray(device.eventRows) && device.eventRows.length) return device.eventRows;
	const projectedSaveEvents = getSyncProjectedSaveCount(device, skipMissingEmployeeNo);
	const hrisSaved = Number(device.hrisSavedCount ?? device.syncedEvents ?? 0);
	const isUnavailable = Boolean(device.error);
	const isHikvision = device.vendor === "Hikvision";
	if (isHikvision) {
		// Compact fallback when API has not yet returned eventRows (older API / loading edge).
		return hikvisionSyncLogsFallbackCatalog
			.map((entry) => {
				const isAttendance = entry.family === "attendance";
				const willAdd =
					entry.eventAction === "TAP"
						? projectedSaveEvents
						: isAttendance
							? isUnavailable
								? null
								: 0
							: null;
				const alreadyInHris = entry.eventAction === "TAP" ? hrisSaved : 0;
				const status = isUnavailable
					? "Unavailable"
					: willAdd === null
						? "Needs review"
						: willAdd > 0
							? "Ready"
							: alreadyInHris > 0
								? "No new rows"
								: "Needs review";
				return {
					key: `${device.deviceId}-${entry.eventAction}`,
					eventLabel: entry.eventLabel,
					businessArea:
						entry.eventAction === "UNKNOWN_OPERATION" ? "Needs review" : eventFilterLabels[entry.eventAction]?.split(" > ")[0] || "Device Events",
					willAdd,
					alreadyInHris,
					sourceProof: entry.sourceProof,
					readsFrom: entry.readsFrom,
					filterAfterSync: entry.filterAfterSync,
					whereToFind: `Device Events > ${entry.filterAfterSync}`,
					status,
					confidenceLabel: entry.eventAction === "UNKNOWN_OPERATION" ? "Needs review" : status,
					reviewReason:
						entry.eventAction === "UNKNOWN_OPERATION"
							? "HRIS could not identify this device action yet."
							: null,
					sourceDetail:
						entry.eventAction === "UNKNOWN_OPERATION"
							? "Read from device operation logs. HRIS will hold this for review instead of saving it as a known event."
							: `${entry.family === "operation" ? "Read from device operation logs." : "Read from attendance/access events."} HRIS will save this as: ${entry.eventLabel}.`,
					eventCategory: entry.eventCategory,
					eventAction: entry.eventAction,
					evidenceSource: entry.evidenceSource,
				};
			})
			.filter(
				(row) =>
					(row.willAdd !== null && row.willAdd > 0) ||
					row.alreadyInHris > 0 ||
					row.status === "Needs review" ||
					row.status === "Unavailable",
			);
	}
	return [
		{
			key: `${device.deviceId}-device-events`,
			eventLabel: "Device events",
			businessArea: "Device Events",
			willAdd: projectedSaveEvents,
			alreadyInHris: hrisSaved,
			sourceProof: formatEventSource(device.source),
			readsFrom: formatEventSource(device.source),
			filterAfterSync: "Device Events",
			whereToFind: "Device Events",
			status: isUnavailable
				? "Unavailable"
				: projectedSaveEvents && projectedSaveEvents > 0
				? "Ready"
				: projectedSaveEvents === 0
				? "No new rows"
				: "Needs review",
		},
	];
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
		!hikvisionObservedAddressMatchesDevice(observedDeviceAddress, event.device);
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
		employeeNo:
			// Write-time map: store plain employeeNo when resolved from opaque log token.
			(payload.personTokenResolved && payload.resolvedEmployeeNo
				? String(payload.resolvedEmployeeNo)
				: null) ||
			(event.employeeNo && !isOpaqueDevicePersonToken(event.employeeNo)
				? event.employeeNo
				: payload.resolvedEmployeeNo || event.employeeNo),
		employeeName:
			event.employee?.fullName ||
			payload.name ||
			payload.resolvedDisplayName ||
			zktecoAttendance.userName ||
			zktecoAttendance.name ||
			accessEvent.name ||
			accessEvent.employeeName ||
			null,
		status: event.status,
		source: event.source,
		receivedAt: event.receivedAt,
		businessStatus: event.taxonomy?.processingLabel || formatBusinessStatus(event.status),
		eventCategory: event.eventCategory || event.taxonomy?.eventCategory || null,
		eventAction: event.eventAction || event.taxonomy?.eventAction || null,
		eventLabel:
			(event.eventAction || event.taxonomy?.eventAction
				? getOptionLabel(eventActionOptions, event.eventAction || event.taxonomy?.eventAction || "")
				: null) ||
			event.eventLabel ||
			event.taxonomy?.eventLabel ||
			event.eventType ||
			payload.eventKind ||
			null,
		processingLabel: event.taxonomy?.processingLabel || formatBusinessStatus(event.status),
		transportLabel: event.taxonomy?.transportLabel || formatEventSource(event.source),
		capabilityConfidence:
			event.eventConfidence || event.taxonomy?.eventConfidence || event.taxonomy?.capabilityConfidence || null,
		evidenceSource: payload.evidenceSource || null,
		directDeviceEvidence: payload.directDeviceEvidence === true,
		payload,
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
	businessStatus: savedMatch?.businessStatus || "Not saved yet",
	eventCategory: savedMatch?.eventCategory || "ATTENDANCE",
	eventAction: savedMatch?.eventAction || "TAP",
	eventLabel: savedMatch?.eventLabel || "Attendance punch",
	processingLabel: savedMatch?.processingLabel || "Not saved yet",
	transportLabel: savedMatch?.transportLabel || "Live ACS preview",
	capabilityConfidence: savedMatch?.capabilityConfidence || "inferred",
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
	const hikvisionImport = useTriggerHikvisionAttendanceImport();
	const cancelDeviceImportJob = useCancelDeviceImportJob();
	const resetDeviceEvents = useResetDeviceEvents();
	const [lastRealtimeEvent, setLastRealtimeEvent] =
		useState<DeviceEventSavedPayload | null>(null);
	const [realtimeSavedEvents, setRealtimeSavedEvents] = useState<DeviceEvent[]>([]);
	const [, setLastRoomJoinedAt] = useState<string | null>(null);
	const [, setLastRecoveryRefreshAt] = useState<string | null>(null);
	const [syncLogsState, setSyncLogsState] = useState<SyncLogsState>({ status: "idle" });
	const [resetPreviewState, setResetPreviewState] = useState<ResetPreviewState>({ status: "idle" });
	const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
	const [includeLinkedAttendanceReset, setIncludeLinkedAttendanceReset] = useState(false);
	const [showImportProgressModal, setShowImportProgressModal] = useState(false);
	const [skipMissingEmployeeNo, setSkipMissingEmployeeNo] = useState(false);
	/** What to save from Sync logs preview (defaults match full preview truth). */
	const [syncIncludeAttendance, setSyncIncludeAttendance] = useState(true);
	const [syncIncludeOperations, setSyncIncludeOperations] = useState(true);
	const [syncTimeWindow, setSyncTimeWindow] = useState<"all" | "7d" | "30d" | "90d">("all");
	const [activeImportJob, setActiveImportJob] = useState<ActiveImportJob | null>(() => {
		try {
			if (typeof window === "undefined") return null;
			const raw = window.localStorage.getItem(DEVICE_IMPORT_JOB_STORAGE_KEY);
			return raw ? (JSON.parse(raw) as ActiveImportJob) : null;
		} catch {
			return null;
		}
	});
	const {
		data: importJobProgress,
		isError: isImportJobError,
	} = useDeviceImportJob(
		activeImportJob?.jobId,
		Boolean(activeImportJob?.jobId),
	);

	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const query = searchParams.get("query") || "";
	const deviceId = searchParams.get("deviceId") || "all";
	// The operational ledger renders only persisted DeviceEvent rows. Direct
	// device reads remain source probes and may never become temporary UI history.
	const viewMode = "saved" as EventViewMode;
	const eventCategory = searchParams.get("eventCategory") || "all";
	const eventAction = searchParams.get("eventAction") || "all";
	const status = searchParams.get("status") || "all";
	const source = searchParams.get("source") || "all";
	const evidenceSource = searchParams.get("evidenceSource") || "all";
	const eventConfidence = searchParams.get("eventConfidence") || "all";
	const sort = searchParams.get("sort") || "eventTime";
	const order = searchParams.get("order") === "asc" ? "asc" : "desc";
	const action = searchParams.get("action");
	const isSyncLogsDebugView = searchParams.get("debug") === "true";
	const isSyncLogsFlowActive = action === "sync-logs";
	const isSyncLogsModalOpen = action === "sync-logs" && !isSyncLogsDebugView;
	const isListenerControlModalOpen = action === "listener-control";
	const activeEventId = searchParams.get("id");
	const timeWindow = (searchParams.get("window") ||
		(viewMode === "saved" ? "all" : "today")) as TimeWindow;
	const { from, to } = getDateRangeForWindow(timeWindow);
	const liveTimeWindow = timeWindow === "all" ? "today" : timeWindow;
	const { from: liveFrom, to: liveTo } = getDateRangeForWindow(liveTimeWindow);

	const { data: devicesData } = useDevices({ limit: 100, document: true });
	const devices = useMemo(() => (devicesData as any)?.devices || [], [devicesData]);
	const deviceHealthMap = useDeviceHealthMap(
		devices.map((device: any) => String(device?.id || "")).filter(Boolean),
		devices.length > 0,
	);
	const selectedDevice = deviceId === "all" ? undefined : devices.find((device: any) => device.id === deviceId);
	const zktecoDevices = useMemo(
		() => devices.filter((device: any) => isZktecoDevice(device)),
		[devices],
	);
	const selectedZktecoDevice =
		deviceId === "all" ? undefined : zktecoDevices.find((device: any) => device.id === deviceId);
	const syncCapableDevices = useMemo(
		() => devices.filter((device: any) => isZktecoDevice(device) || isHikvisionDevice(device)),
		[devices],
	);
	const selectedSyncDevice =
		deviceId === "all"
			? undefined
			: syncCapableDevices.find((device: any) => device.id === deviceId);
	const syncScopeDevices = selectedSyncDevice ? [selectedSyncDevice] : syncCapableDevices;
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
	} = useDeviceHealth(syncHealthDevice?.id, isSyncLogsModalOpen && Boolean(syncHealthDevice?.id));
	const {
		data: syncPreview,
		isLoading: isLoadingSyncPreview,
		isFetching: isFetchingSyncPreview,
		error: syncPreviewError,
		refetch: refetchSyncPreview,
	} = useDeviceSyncPreview(
		{
			deviceId,
			source,
		},
		isSyncLogsFlowActive,
	);
	const canReadLiveEvents = Boolean(
		liveDeviceId &&
		!isZktecoHealth &&
			deviceHealth?.checks?.network?.ok &&
			deviceHealth?.checks?.deviceApi?.ok,
	);
	const organizationId =
		user?.organizationId || (user as any)?.organization?.id || liveDevice?.organizationId || "";
	const hasRealtimeScope = Boolean(organizationId || selectedDeviceRoomId);
	const shouldPollSavedEvents = viewMode !== "saved" || !isConnected || !hasRealtimeScope;
	const isSdkAlarmSavedScope =
		viewMode === "saved" &&
		(source === "all" || source === "EN_HCNETSDK_ALARM") &&
		(deviceId === "all" || isHikvisionDevice(selectedDevice));
	const savedEventsRefetchInterval = isSdkAlarmSavedScope
		? 2 * 1000
		: shouldPollSavedEvents
			? 30 * 1000
			: false;
	const {
		data: hikvisionListenerStatus,
		isLoading: isHikvisionListenerStatusPending,
		isFetching: isFetchingHikvisionListenerStatus,
		error: hikvisionListenerStatusError,
		refetch: refetchHikvisionListenerStatus,
	} = useHikvisionListenerStatus(isSdkAlarmSavedScope || isListenerControlModalOpen);
	// Only treat as "Checking…" when we have no snapshot yet. Refetch must not blank the modal.
	const isLoadingHikvisionListenerStatus =
		isHikvisionListenerStatusPending && !hikvisionListenerStatus;
	const hikvisionListenerControl = useControlHikvisionListener();

	const savedQueryParams: ApiQueryParams = {
		page: pageParam,
		limit: limitParam,
		query: viewMode === "saved" ? query : undefined,
		deviceId: deviceId === "all" ? undefined : deviceId,
		eventCategory: viewMode === "saved" && eventCategory !== "all" ? eventCategory : undefined,
		eventAction: viewMode === "saved" && eventAction !== "all" ? eventAction : undefined,
		evidenceSource: evidenceSource !== "all" ? evidenceSource : undefined,
		eventConfidence: eventConfidence !== "all" ? eventConfidence : undefined,
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
	} = useDeviceEvents(savedQueryParams, {
		refetchInterval: savedEventsRefetchInterval,
	});
	const { data: latestSdkEventData } = useDeviceEvents(
		{
			page: 1,
			limit: 1,
			deviceId: deviceId === "all" ? undefined : deviceId,
			source: "EN_HCNETSDK_ALARM",
			sort: "eventTime",
			order: "desc",
			dateField: "eventTime",
			from,
			to,
		},
		{ refetchInterval: isSdkAlarmSavedScope ? 5 * 1000 : false },
	);
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
			if (
				eventCategory !== "all" &&
				payload.event?.eventCategory &&
				payload.event.eventCategory !== eventCategory
			) {
				return false;
			}
			if (
				eventAction !== "all" &&
				payload.event?.eventAction &&
				payload.event.eventAction !== eventAction
			) {
				return false;
			}
			if (source !== "all" && payload.source && payload.source !== source) {
				return false;
			}
			if (
				evidenceSource !== "all" &&
				payload.event?.payload?.evidenceSource !== evidenceSource
			) {
				return false;
			}
			if (
				eventConfidence !== "all" &&
				payload.event?.eventConfidence !== eventConfidence
			) {
				return false;
			}
			return true;
		};

		const handleDeviceEventSaved = (payload: DeviceEventSavedPayload) => {
			if (!matchesCurrentScope(payload)) return;
			setLastRealtimeEvent(payload);
			const hasRealtimeEventRow = Boolean(payload.event?.id);
			if (hasRealtimeEventRow) {
				setRealtimeSavedEvents((current) => [
					payload.event as DeviceEvent,
					...current.filter((event) => event.id !== payload.event?.id),
				].slice(0, limitParam));
			}
			if (
				shouldRefreshSavedEventsAfterSocketEvent({
					viewMode,
					hasRealtimeEventRow,
				})
			) {
				void queryClient.invalidateQueries({ queryKey: [...queryKeys.devices.all, "events"] });
				void refetch();
			}
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
		evidenceSource,
		eventAction,
		eventCategory,
		eventConfidence,
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

		const intervalMs = isConnected && hasRealtimeScope ? 30000 : 10000;
		const refreshFromRecovery = () => {
			setLastRecoveryRefreshAt(new Date().toISOString());
			void queryClient.invalidateQueries({ queryKey: [...queryKeys.devices.all, "events"] });
			void refetch().then((result) => {
				if (result.error) {
					toast.warning("Saved events could not refresh", {
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
			...devices.map((device: any) => {
				const reachability = deviceHealthMap.get(device.id)?.reachability;
				const status = reachability?.status || "checking";
				const statusLabel = reachability?.label || "Checking…";
				const name = device.name || `${device.address}:${device.port}`;
				return {
					value: device.id,
					// Keep plain label for accessibility; leading dot shows live reachability.
					label: name,
					leading: (
						<span
							className={`inline-block h-2.5 w-2.5 rounded-full ${getDeviceReachabilityDotClass(status)}`}
							title={`${name}: ${statusLabel}`}
							aria-label={statusLabel}
							data-testid="device-filter-reachability-dot"
							data-device-id={device.id}
							data-reachability={status}
						/>
					),
				};
			}),
		],
		[deviceHealthMap, devices],
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
	const savedSummary = data?.summary || {
		total: 0,
		byCategory: {},
		byAction: {},
		byProcessingResult: {},
		byRuntimePath: {},
		byConfidence: {},
		byEvidenceSource: {},
		directEvidence: 0,
		inferredEvidence: 0,
		unknownEvidence: 0,
		matched: 0,
		needsEmployeeMatch: 0,
		ignored: 0,
		failed: 0,
		byStatus: {},
		bySource: {},
	};
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
	const latestSdkSavedEvent =
		viewMode === "saved"
			? rows.find((event) => event.source === "EN_HCNETSDK_ALARM")
			: undefined;
	const latestSdkProbeEvent =
		viewMode === "saved" && latestSdkEventData?.events?.[0]
			? normalizeSavedEvent(latestSdkEventData.events[0])
			: undefined;
	const getEventEvidenceTime = (event?: UnifiedDeviceEventRow) => {
		const rawTime = event?.receivedAt || event?.eventTime;
		const parsed = rawTime ? new Date(rawTime).getTime() : Number.NaN;
		return Number.isNaN(parsed) ? 0 : parsed;
	};
	const latestSdkEvidenceEvent =
		getEventEvidenceTime(latestSdkProbeEvent) > getEventEvidenceTime(latestSdkSavedEvent)
			? latestSdkProbeEvent
			: latestSdkSavedEvent || latestSdkProbeEvent;
	const latestSavedReceivedAt = latestSavedEvent?.receivedAt
		? new Date(latestSavedEvent.receivedAt)
		: null;
	const latestSdkEvidenceReceivedAt = latestSdkEvidenceEvent?.receivedAt
		? new Date(latestSdkEvidenceEvent.receivedAt)
		: latestSdkEvidenceEvent?.eventTime
			? new Date(latestSdkEvidenceEvent.eventTime)
		: null;
	const latestSavedAgeMs =
		latestSavedReceivedAt && !Number.isNaN(latestSavedReceivedAt.getTime())
			? Date.now() - latestSavedReceivedAt.getTime()
			: null;
	const latestSdkEvidenceAgeMs =
		latestSdkEvidenceReceivedAt && !Number.isNaN(latestSdkEvidenceReceivedAt.getTime())
			? Date.now() - latestSdkEvidenceReceivedAt.getTime()
			: null;
	const isLatestSavedFresh =
		latestSavedAgeMs !== null && latestSavedAgeMs >= 0 && latestSavedAgeMs <= 2 * 60 * 1000;
	const isLatestSdkSavedFresh =
		latestSdkEvidenceAgeMs !== null &&
		latestSdkEvidenceAgeMs >= -60 * 1000 &&
		latestSdkEvidenceAgeMs <= 2 * 60 * 1000;
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
	const latestSdkActionLabel = latestSdkEvidenceEvent?.eventAction
		? getOptionLabel(eventActionOptions, latestSdkEvidenceEvent.eventAction)
		: null;
	const latestSdkCategoryLabel = latestSdkEvidenceEvent?.eventCategory
		? getOptionLabel(eventCategoryOptions, latestSdkEvidenceEvent.eventCategory)
		: null;
	const latestSdkEvidenceLabel = latestSdkActionLabel || "SDK event";
	const latestSdkEvidenceIsOperationSignal =
		latestSdkEvidenceEvent?.eventAction === "SYNC_SIGNAL" ||
		latestSdkEvidenceEvent?.eventAction === "SYNC_IMPORTED";
	const latestSdkEvidenceFreshLabel = latestSdkEvidenceIsOperationSignal
		? "SDK operation signal captured"
		: `${latestSdkEvidenceLabel} saved`;
	const syncBridge =
		(syncPreview?.bridge as ZktecoBridgePreflight | undefined) ||
		(syncDeviceHealth?.checks?.zktecoBridge as ZktecoBridgePreflight | undefined);
	const syncBridgeOk = Boolean(syncBridge?.ok);
	const syncBridgeError =
		syncPreviewError?.message ||
		syncPreview?.bridge?.error ||
		syncBridge?.error ||
		(syncHealthDevice && !syncBridgeOk ? "The ZKTeco bridge is not reachable for this preflight." : "");
	const syncPreviewRows = useMemo(() => syncPreview?.devices || [], [syncPreview?.devices]);
	const syncHasZktecoRows = syncPreviewRows.some((row) => row.vendor === "ZKTeco");
	const syncImportScopes = useMemo(
		() => ({
			includeAttendance: syncIncludeAttendance,
			includeOperations: syncIncludeOperations,
		}),
		[syncIncludeAttendance, syncIncludeOperations],
	);
	const syncStartableRows = syncPreviewRows.filter((row) => {
		const projectedSaveCount = getSyncProjectedSaveCount(row, skipMissingEmployeeNo);
		const scopedWillAdd = getScopedSyncWillAdd(row, skipMissingEmployeeNo, syncImportScopes);
		const readyWillAdd = getFallbackSyncEventRows(row, skipMissingEmployeeNo).some(
			(eventRow) =>
				eventRow.status === "Ready" &&
				hasNumericCount(eventRow.willAdd) &&
				Number(eventRow.willAdd) > 0 &&
				((syncIncludeAttendance && isSyncAttendanceEventRow(eventRow)) ||
					(syncIncludeOperations && isSyncOperationEventRow(eventRow))),
		);
		if (row.vendor === "Hikvision") return !row.error && (readyWillAdd || scopedWillAdd > 0);
		return !row.error && (readyWillAdd || Boolean(row.canStartSync && projectedSaveCount && projectedSaveCount > 0));
	});
	const syncHasUnknownEventTotal = syncPreviewRows.some(
		(row) => !hasNumericCount(row.vendorEventCount ?? row.totalEvents),
	);
	const syncVendorEventTotal = syncHasUnknownEventTotal
		? null
		: syncPreviewRows.reduce(
				(total, row) => total + Number(row.vendorEventCount ?? row.totalEvents ?? 0),
				0,
			);
	const syncHrisSavedTotal = syncPreviewRows.reduce(
		(total, row) => total + Number(row.hrisSavedCount ?? row.syncedEvents ?? 0),
		0,
	);
	const syncProjectedSkippedTotal = syncPreviewRows.reduce(
		(total, row) => total + getSyncProjectedSkipCount(row, skipMissingEmployeeNo),
		0,
	);
	const syncFailedTotal = syncPreviewRows.reduce(
		(total, row) => total + Number(row.failedEventCount ?? 0),
		0,
	);
	const syncNeedsReviewTotal = useMemo(
		() =>
			syncPreviewRows.reduce((total, device) => {
				const rows = getFallbackSyncEventRows(device, skipMissingEmployeeNo);
				return (
					total +
					rows.reduce(
						(sum, row) =>
							sum +
							(row.status === "Needs review"
								? hasNumericCount(row.willAdd)
									? Number(row.willAdd)
									: 1
								: 0),
						0,
					)
				);
			}, 0),
		[skipMissingEmployeeNo, syncPreviewRows],
	);
	const syncReadySourceChecks = useMemo(() => {
		let ready = 0;
		let total = 0;
		for (const device of syncPreviewRows) {
			if (Array.isArray(device.sources) && device.sources.length) {
				total += device.sources.length;
				ready += device.sources.filter((source) => source.ok).length;
				continue;
			}
			// Fallback: one source check per device when API is older.
			total += 1;
			if (!device.error && (device.canStartSync || hasNumericCount(device.totalEvents))) ready += 1;
		}
		return { ready, total };
	}, [syncPreviewRows]);
	const syncEventWillAddTotal = useMemo(
		() =>
			syncPreviewRows.reduce(
				(total, device) =>
					total + getScopedSyncWillAdd(device, skipMissingEmployeeNo, syncImportScopes),
				0,
			),
		[skipMissingEmployeeNo, syncImportScopes, syncPreviewRows],
	);
	const syncScopedBreakdown = useMemo(() => {
		return syncPreviewRows.reduce(
			(acc, device) => {
				const part = getScopedSyncWillAddBreakdown(
					device,
					skipMissingEmployeeNo,
					syncImportScopes,
				);
				acc.attendance += part.attendance;
				acc.operations += part.operations;
				acc.total += part.total;
				return acc;
			},
			{ attendance: 0, operations: 0, total: 0 },
		);
	}, [skipMissingEmployeeNo, syncImportScopes, syncPreviewRows]);
	const syncScopedNeedsReviewBreakdown = useMemo(() => {
		return syncPreviewRows.reduce(
			(acc, device) => {
				const part = getScopedSyncNeedsReviewBreakdown(
					device,
					skipMissingEmployeeNo,
					syncImportScopes,
				);
				acc.attendance += part.attendance;
				acc.operations += part.operations;
				acc.total += part.total;
				return acc;
			},
			{ attendance: 0, operations: 0, total: 0 },
		);
	}, [skipMissingEmployeeNo, syncImportScopes, syncPreviewRows]);
	const syncHasUnknownMissingCount = syncPreviewRows.some(
		(row) => getSyncProjectedSaveCount(row, skipMissingEmployeeNo) === null,
	);
	const syncDryRunEstimate = syncPreviewRows.length
		? syncEventWillAddTotal > 0
			? syncEventWillAddTotal
			: syncHasUnknownMissingCount
				? null
				: syncPreviewRows.reduce(
						(total, row) =>
							total + Number(getSyncProjectedSaveCount(row, skipMissingEmployeeNo) ?? 0),
						0,
					)
		: (
				syncBridge?.estimatedRowsToSync ??
				syncBridge?.missingRows ??
				syncBridge?.dryRun?.missingRows ??
				syncBridge?.data?.dryRun?.missingRows ??
				null
			);
	const syncActionLabel =
		zktecoSync.isPending || hikvisionImport.isPending
			? "Syncing device logs"
			: hasNumericCount(syncDryRunEstimate)
				? `Sync ${formatCount(syncDryRunEstimate)} log${Number(syncDryRunEstimate) === 1 ? "" : "s"}`
				: "Sync logs";
	const syncMissingLogLabel = hasNumericCount(syncDryRunEstimate)
		? formatCount(syncDryRunEstimate)
		: "Needs device read";
	const showSyncPreviewSkeleton =
		isSyncLogsModalOpen &&
		(isLoadingSyncPreview || (isFetchingSyncPreview && syncPreviewRows.length === 0));
	const syncVendorSections = useMemo(() => {
		const order = ["Hikvision", "ZKTeco"];
		const isBlockedRow = (row: DeviceSyncPreviewRow) =>
			Boolean(row.error) ||
			row.status === "source_unavailable" ||
			row.status === "source_total_unavailable";
		const groups = new Map<string, typeof syncPreviewRows>();
		for (const row of syncPreviewRows) {
			const key = row.vendor || "Other";
			groups.set(key, [...(groups.get(key) || []), row]);
		}
		return [...groups.entries()]
			.sort(([left], [right]) => {
				const leftIndex = order.indexOf(left);
				const rightIndex = order.indexOf(right);
				if (leftIndex !== -1 || rightIndex !== -1) {
					return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
				}
				return left.localeCompare(right);
			})
			.map(([vendor, rows]) => ({
				vendor,
				// Ready / partial devices first so unreachable peers do not dominate the journey.
				rows: [...rows].sort((left, right) => {
					const leftBlocked = isBlockedRow(left) ? 1 : 0;
					const rightBlocked = isBlockedRow(right) ? 1 : 0;
					if (leftBlocked !== rightBlocked) return leftBlocked - rightBlocked;
					return String(left.name || left.address || "").localeCompare(
						String(right.name || right.address || ""),
					);
				}),
			}));
	}, [syncPreviewRows]);
	const syncScopeLabel = selectedZktecoDevice
		? selectedZktecoDevice.name || selectedZktecoDevice.address || "Selected ZKTeco device"
		: syncPreviewRows.length
			? `Devices (${syncPreviewRows.length})`
			: `Configured devices (${syncScopeDevices.length})`;
	const syncDevicesReadyCount = syncPreviewRows.filter((row) => {
		const rows = getFallbackSyncEventRows(row, skipMissingEmployeeNo);
		return Boolean(row.canStartSync) || rows.some((eventRow) => eventRow.status === "Ready");
	}).length;
	const syncDevicesBlockedCount = Math.max(0, syncPreviewRows.length - syncDevicesReadyCount);
	const syncStatusLabel = showSyncPreviewSkeleton
		? "Checking…"
		: syncStartableRows.length
			? syncDevicesBlockedCount > 0
				? "Partial — some devices unreachable"
				: "Ready to sync"
			: isLoadingSyncHealth
				? "Checking device service…"
				: syncPreviewRows.length
					? syncPreviewRows.some(
							(row) =>
								row.error ||
								row.status === "source_total_unavailable" ||
								row.status === "source_unavailable",
						)
						? syncDevicesBlockedCount === syncPreviewRows.length
							? "All devices unreachable"
							: "Blocked"
						: "No new events"
					: "Unavailable";
	const adminRole = String((user as any)?.role || (user as any)?.roleId || "").trim();
	const canUseDebugReset = ["hris-admin", "admin", "super_admin", "superadmin"].includes(adminRole);
	const resetScopePayload = useMemo(
		() => ({
			deviceId,
			source,
			status,
			from,
			to,
			dateField: "eventTime" as const,
			includeLinkedAttendance: includeLinkedAttendanceReset,
		}),
		[deviceId, from, includeLinkedAttendanceReset, source, status, to],
	);
	const resetPreviewData =
		resetPreviewState.status === "ready" || resetPreviewState.status === "executed"
			? resetPreviewState.data
			: null;
	const resetPreviewCounts = resetPreviewData?.counts || resetPreviewData?.countsBefore || null;
	useEffect(() => {
		if (!isSyncLogsModalOpen || !syncHasZktecoRows || !syncBridgeError) return;
		toast.warning("Sync preflight is unavailable", {
			id: "device-events-sync-preflight",
			description: syncBridgeError,
		});
	}, [isSyncLogsModalOpen, syncBridgeError, syncHasZktecoRows]);

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
	const focusLatestSdkEvidenceEvent = () => {
		if (!latestSdkEvidenceEvent) return;
		updateSearchParams((next) => {
			next.set("view", "saved");
			next.set("page", "1");
			next.set("window", "all");
			if (latestSdkEvidenceEvent.deviceId) next.set("deviceId", latestSdkEvidenceEvent.deviceId);
			if (latestSdkEvidenceEvent.source) next.set("source", latestSdkEvidenceEvent.source);
			if (latestSdkEvidenceEvent.eventCategory) next.set("eventCategory", latestSdkEvidenceEvent.eventCategory);
			if (latestSdkEvidenceEvent.eventAction) next.set("eventAction", latestSdkEvidenceEvent.eventAction);
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
		if (activeImportJob && importJobProgress) {
			setShowImportProgressModal(true);
			return;
		}
		setSyncLogsState({ status: "idle" });
		updateSearchParams((next) => {
			next.set("action", "sync-logs");
			next.delete("debug");
			next.delete("id");
		});
	};
	const closeSyncLogs = () => {
		updateSearchParams((next) => {
			next.delete("action");
		});
	};
	const openListenerControl = () => {
		updateSearchParams((next) => {
			next.set("action", "listener-control");
			next.delete("id");
		});
		void refetchHikvisionListenerStatus();
	};
	const closeListenerControl = () => {
		updateSearchParams((next) => {
			next.delete("action");
		});
	};
	const refreshSyncPreflight = async () => {
		const checks = syncHealthDevice?.id
			? [refetchSyncHealth(), refetchSyncPreview()]
			: [refetchSyncPreview()];
		const results = await Promise.allSettled(checks);
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
	const reviewNotImported = (device: { deviceId?: string; source?: string | null }) => {
		const targetDeviceId = String(device.deviceId || "").trim();
		if (!targetDeviceId) return;
		updateSearchParams((next) => {
			next.set("view", "live");
			next.set("deviceId", targetDeviceId);
			next.set("window", "all");
			next.delete("status");
			next.delete("source");
			next.delete("query");
			next.delete("action");
			next.set("page", "1");
		});
	};

	const startHikvisionDeviceLogImport = (device: {
		deviceId: string;
		name?: string | null;
		address?: string | null;
		vendor?: string | null;
		targetImportCount?: number | null;
		targetAttendanceCount?: number | null;
		targetOperationsCount?: number | null;
		includeAttendance?: boolean;
		includeOperations?: boolean;
		timeWindow?: "all" | "7d" | "30d" | "90d";
	}) => {
		const includeAttendance = device.includeAttendance ?? syncIncludeAttendance;
		const includeOperations = device.includeOperations ?? syncIncludeOperations;
		const timeWindow = device.timeWindow ?? syncTimeWindow;
		const syncRange = getSyncDateRangeForWindow(timeWindow);
		hikvisionImport.mutate(
			{
				deviceId: device.deviceId,
				skipMissingEmployeeNo,
				targetImportCount: device.targetImportCount,
				targetAttendanceCount: device.targetAttendanceCount,
				targetOperationsCount: device.targetOperationsCount,
				includeAttendance,
				includeOperations,
				sourceGroup: getSyncSourceGroup({ includeAttendance, includeOperations }),
				from: syncRange.from,
				to: syncRange.to,
				timeWindow,
			},
			{
				onSuccess: (data: any) => {
					const jobId = data?.jobId || data?.progress?.jobId;
					if (!jobId) {
						closeSyncLogs();
						toast.success("No unsaved device logs found", {
							id: "device-log-import-progress",
							description: "The dry-run estimate is already clean.",
						});
						void refetch();
						void refetchSyncPreview();
						return;
					}
					if (jobId) {
						setActiveImportJob({
							jobId,
							deviceId: device.deviceId,
							deviceName: device.name || device.address || "Hikvision device",
							vendor: "Hikvision",
						});
					}
					closeSyncLogs();
					setShowImportProgressModal(true);
					toast.success("Device log sync started", {
						id: "device-log-import-progress",
						description: "Progress is available from Sync logs.",
					});
					void refetchSyncPreview();
				},
				onError: (error: unknown) => {
					const message = getAsyncErrorMessage(error, "Device rejected the sync request.");
					setSyncLogsState({ status: "error", message });
					toast.error("Sync did not start", {
						id: "device-events-sync-start",
						description: message,
					});
				},
			},
		);
	};

	const retryActiveImportJob = () => {
		if (!activeImportJob?.deviceId) return;
		startHikvisionDeviceLogImport({
			deviceId: activeImportJob.deviceId,
			name: activeImportJob.deviceName,
			vendor: activeImportJob.vendor,
			targetImportCount: importJobProgress?.targetImportCount ?? null,
		});
	};

	const requestCancelActiveImportJob = () => {
		if (!activeImportJob?.jobId) return;
		cancelDeviceImportJob.mutate(activeImportJob.jobId);
	};

	const startDeviceLogImport = () => {
		setSyncLogsState({ status: "idle" });
		if (!syncIncludeAttendance && !syncIncludeOperations) {
			toast.error("Choose what to save", {
				description: "Turn on Attendance taps and/or User & enrollment activity.",
			});
			return;
		}
		const startableRow = syncStartableRows[0];
		if (!startableRow?.deviceId) return;

		if (startableRow.syncAction === "hikvision-import" || startableRow.vendor === "Hikvision") {
			const scopes = {
				includeAttendance: syncIncludeAttendance,
				includeOperations: syncIncludeOperations,
			};
			const breakdown = getScopedSyncWillAddBreakdown(
				startableRow,
				skipMissingEmployeeNo,
				scopes,
			);
			// Prefer preview eventRows (truthful) over ACS-only needsSyncEvents.
			const scopedTotal =
				breakdown.total > 0
					? breakdown.total
					: getSyncProjectedSaveCount(startableRow, skipMissingEmployeeNo);
			startHikvisionDeviceLogImport({
				...startableRow,
				targetImportCount: scopedTotal,
				targetAttendanceCount: scopes.includeAttendance ? breakdown.attendance : 0,
				targetOperationsCount: scopes.includeOperations ? breakdown.operations : 0,
				includeAttendance: scopes.includeAttendance,
				includeOperations: scopes.includeOperations,
				timeWindow: syncTimeWindow,
			});
			return;
		}

		zktecoSync.mutate({ deviceId: startableRow.deviceId }, {
			onSuccess: () => {
				closeSyncLogs();
				toast.success("Sync device logs started", {
					id: "device-events-sync-start",
					description: "Saved device-log rows and bridge health are refreshing.",
				});
				setSyncLogsState({
					status: "accepted",
					message: "Bridge accepted the device-log sync. Saved rows and bridge health are refreshing.",
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

	const previewDeviceEventReset = () => {
		setResetPreviewState({ status: "loading" });
		resetDeviceEvents.mutate(
			{ ...resetScopePayload, execute: false },
			{
				onSuccess: (data) => {
					setResetPreviewState({ status: "ready", data });
					toast.success("Reset preview ready", {
						id: "device-events-reset-preview",
						description: `${formatCount(data.counts?.deviceEvents || 0)} saved events in scope.`,
					});
				},
				onError: (error: unknown) => {
					const message = getAsyncErrorMessage(error, "Reset preview failed.");
					setResetPreviewState({ status: "error", message });
					toast.error("Reset preview failed", {
						id: "device-events-reset-preview",
						description: message,
					});
				},
			},
		);
	};

	const executeDeviceEventReset = () => {
		if (!resetPreviewData) return;
		resetDeviceEvents.mutate(
			{ ...resetScopePayload, execute: true },
			{
				onSuccess: (data) => {
					setResetPreviewState({ status: "executed", data });
					setShowResetConfirmModal(false);
					toast.success("Saved events reset", {
						id: "device-events-reset-execute",
						description: data.backupDir ? `Backup: ${data.backupDir}` : undefined,
					});
					void refetch();
					void refetchSyncPreview();
				},
				onError: (error: unknown) => {
					const message = getAsyncErrorMessage(error, "Reset failed.");
					setResetPreviewState({ status: "error", message });
					toast.error("Reset failed", {
						id: "device-events-reset-execute",
						description: message,
					});
				},
			},
		);
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
		? `Last saved-row socket event ${formatEventTime(lastRealtimeEvent.emittedAt)}`
		: isSdkAlarmSavedScope && latestSdkEvidenceEvent
			? `Last SDK alarm row: ${latestSdkEvidenceLabel} at ${formatEventTime(latestSdkEvidenceEvent.receivedAt || latestSdkEvidenceEvent.eventTime)}`
			: isSdkAlarmSavedScope
				? "No recent SDK alarm rows in this saved-events scope"
			: latestSavedEvent
			? `Latest saved row ${formatEventTime(latestSavedEvent.receivedAt || latestSavedEvent.eventTime)}`
			: "No saved device event has arrived in this view yet";
	const savedRowsBadgeVariant = isSdkAlarmSavedScope
		? isLatestSdkSavedFresh
			? "success-soft"
			: isConnected
				? "warning-soft"
				: "secondary"
		: isConnected
			? "success-soft"
			: isLatestSavedFresh
				? "warning-soft"
				: "secondary";
	const savedRowsBadgeLabel = isSdkAlarmSavedScope
		? isLatestSdkSavedFresh
			? latestSdkEvidenceFreshLabel
			: isConnected
				? "Browser online · no new live events"
				: "Browser offline · live status unknown"
		: isConnected
			? "Browser updates connected"
			: isLatestSavedFresh
				? "New saved row"
				: "No recent saved event";
	const hikvisionListenerRunning = Boolean(hikvisionListenerStatus?.running);
	const hikvisionSdkState = hikvisionListenerStatus?.sdk?.state || "unknown";
	const hikvisionSdkReceiving = Boolean(hikvisionListenerStatus?.sdk?.receivingCallbacks);
	const hikvisionSdkArmed = Boolean(hikvisionListenerStatus?.sdk?.armed);
	const hikvisionListenerUnavailable =
		isSdkAlarmSavedScope &&
		Boolean(
			!isLoadingHikvisionListenerStatus &&
				(!hikvisionListenerStatus ||
					hikvisionListenerStatusError ||
					!hikvisionListenerStatus.control?.available ||
					hikvisionListenerStatus.error),
		);
	const hikvisionListenerStatusLabel = isSdkAlarmSavedScope
		? isLoadingHikvisionListenerStatus
			? "Checking live capture…"
			: hikvisionSdkReceiving
				? "Live capture receiving taps"
				: hikvisionSdkArmed
					? "Live capture ready"
					: hikvisionSdkState === "login_failed"
						? "Blocked: device login"
						: hikvisionSdkState === "posting_failed"
							? "Blocked: live capture post"
							: hikvisionListenerRunning
								? "Live capture running · waiting for proof"
								: hikvisionListenerUnavailable
									? "Live capture offline"
									: "Live capture stopped"
		: "";
	const hikvisionListenerStatusVariant = hikvisionSdkReceiving || hikvisionSdkArmed
		? "success-soft"
		: hikvisionListenerUnavailable
			? "secondary"
			: "warning-soft";
	const hikvisionListenerDetail = hikvisionListenerStatus
		? `${hikvisionListenerStatus.activeState || "unknown"} / ${hikvisionListenerStatus.subState || "unknown"}${
				hikvisionListenerStatus.mainPid ? ` / PID ${hikvisionListenerStatus.mainPid}` : ""
			}`
		: hikvisionListenerStatusError
			? getAsyncErrorMessage(hikvisionListenerStatusError, "Live capture status unavailable")
			: "Status check has not completed";
	const hikvisionListenerLastLog =
		hikvisionListenerStatus?.logs?.recent?.[hikvisionListenerStatus.logs.recent.length - 1] || "";
	const hikvisionListenerDiagnosis =
		hikvisionListenerStatus?.sdk?.diagnosis ||
		(hikvisionListenerStatus?.sdk?.lastError
			? `SDK login failed${hikvisionListenerStatus.sdk.lastTargetHost ? ` against ${hikvisionListenerStatus.sdk.lastTargetHost}` : ""}.`
			: "");
	const hikvisionListenerDevices = useMemo(() => {
		const rows = hikvisionListenerStatus?.sdk?.devices || [];
		const selectedId = deviceId !== "all" ? deviceId : "";
		const catalogById = new Map<string, any>(
			devices.map((device: any) => [String(device.id || ""), device] as const),
		);
		const enriched = rows.map((row) => {
			const catalog = row.deviceId ? catalogById.get(String(row.deviceId)) : null;
			const configuredAddress = String(catalog?.address || "").trim() || null;
			const config =
				catalog?.config && typeof catalog.config === "object" ? catalog.config : {};
			const runtimeHost = String(
				config.hikvisionSdkRuntimeAddress || row.host || "",
			).trim();
			const transport = String(config.hikvisionSdkRuntimeTransport || "").trim();
			const usesReverseTunnel =
				transport === "ssh-reverse-forward" ||
				runtimeHost === "127.0.0.1" ||
				runtimeHost === "localhost";
			return {
				...row,
				configuredAddress,
				usesReverseTunnel,
			};
		});
		return [...enriched].sort((a, b) => {
			if (selectedId && a.deviceId === selectedId) return -1;
			if (selectedId && b.deviceId === selectedId) return 1;
			const aLive = a.receivingCallbacks ? 0 : a.armed ? 1 : a.state === "login_failed" ? 2 : 3;
			const bLive = b.receivingCallbacks ? 0 : b.armed ? 1 : b.state === "login_failed" ? 2 : 3;
			if (aLive !== bLive) return aLive - bLive;
			return String(a.name || a.host || "").localeCompare(String(b.name || b.host || ""));
		});
	}, [deviceId, devices, hikvisionListenerStatus?.sdk?.devices]);
	const selectedHikvisionListenerDevice =
		deviceId !== "all"
			? hikvisionListenerDevices.find((device) => device.deviceId === deviceId) || null
			: null;
	const hikvisionListenerDeviceSummary = hikvisionListenerDevices.length
		? `${hikvisionListenerDevices.filter((device) => device.receivingCallbacks).length} receiving / ${
				hikvisionListenerDevices.filter((device) => device.armed).length
			} armed / ${hikvisionListenerDevices.filter((device) => device.state === "login_failed").length} login failed`
		: "No per-device listener rows";
	const focusedHikvisionStatus = selectedHikvisionListenerDevice
		? selectedHikvisionListenerDevice.receivingCallbacks
			? `${selectedHikvisionListenerDevice.name || selectedHikvisionListenerDevice.host || "Selected device"} is receiving callbacks.`
			: selectedHikvisionListenerDevice.armed
				? `${selectedHikvisionListenerDevice.name || selectedHikvisionListenerDevice.host || "Selected device"} is armed; waiting for a tap.`
				: selectedHikvisionListenerDevice.lastLoginOk === false
					? `${selectedHikvisionListenerDevice.name || selectedHikvisionListenerDevice.host || "Selected device"} SDK login failed${
							selectedHikvisionListenerDevice.lastLoginError
								? ` with code ${selectedHikvisionListenerDevice.lastLoginError}`
								: ""
						}.`
					: `${selectedHikvisionListenerDevice.name || selectedHikvisionListenerDevice.host || "Selected device"} has no recent SDK proof.`
		: null;
	const realtimePanelIsLive = isSdkAlarmSavedScope
		? isLatestSdkSavedFresh || hikvisionSdkReceiving
		: realtimeStatus.isListening;
	const realtimePanelStatusLabel = isSdkAlarmSavedScope
		? isLoadingHikvisionListenerStatus
			? "Checking live capture…"
			: isLatestSdkSavedFresh
				? "Recent live event saved"
				: hikvisionSdkReceiving
					? "Live capture receiving taps"
					: hikvisionListenerRunning
						? "Live capture running"
						: hikvisionListenerUnavailable
							? "Live capture offline"
							: "Live capture stopped"
		: realtimeStatus.statusLabel;
	const realtimePanelUpdateLabel = isSdkAlarmSavedScope
		? isLoadingHikvisionListenerStatus
			? "Checking service…"
			: isLatestSdkSavedFresh
				? `${latestSdkEvidenceLabel} saved recently`
			: hikvisionSdkReceiving
				? "Taps are reaching HRIS"
			: hikvisionListenerRunning
				? "Service running · waiting for event proof"
				: "Waiting for live capture"
		: realtimeStatus.rowUpdateLabel;
	const activeSavedFilterLabels = [
		deviceId !== "all" ? getOptionLabel(deviceOptions, deviceId) : null,
		timeWindow !== "all" ? getOptionLabel(timeWindowOptions, timeWindow) : null,
		eventCategory !== "all" ? getOptionLabel(eventCategoryOptions, eventCategory) : null,
		eventAction !== "all" ? getOptionLabel(eventActionOptions, eventAction) : null,
		source !== "all" ? getOptionLabel(sourceOptions, source) : null,
		status !== "all" ? getOptionLabel(savedStatusOptions, status) : null,
		evidenceSource !== "all" ? getOptionLabel(evidenceSourceOptions, evidenceSource) : null,
		eventConfidence !== "all" ? getOptionLabel(eventConfidenceOptions, eventConfidence) : null,
		query ? `Search: ${query}` : null,
	].filter(Boolean) as string[];
	const hasScopedSavedFilters = viewMode === "saved" && activeSavedFilterLabels.length > 0;
	const socketTruthLabel = isConnected
		? "Socket connected"
		: shouldPollSavedEvents
			? "Socket polling fallback"
			: "Socket not connected";
	const savedEmptyMessage = isEventLoading
		? "Loading saved events…"
		: viewMode === "live"
			? "No device events found"
			: hasScopedSavedFilters
				? "No saved rows match this filter"
				: "No saved events found";
	const savedEmptyDescription = isEventLoading
		? "Please wait — first results usually appear within a couple of seconds."
		: viewMode === "live"
			? ""
			: eventAction === "FINGERPRINT_ENROLLED" && latestSdkEvidenceIsOperationSignal
				? `No fingerprint-enrolled row matches this filter yet, but the latest live row is ${latestSdkEvidenceLabel} at ${formatEventTime(latestSdkEvidenceEvent?.receivedAt || latestSdkEvidenceEvent?.eventTime)}. Open it, then run/review device-user reconciliation for the same device.`
			: hasScopedSavedFilters
				? `No saved events for ${activeSavedFilterLabels.join(" / ")}.`
				: "Nothing saved for this scope yet. Use Sync logs to preview what can be added.";
	const clearSavedFilters = () => {
		updateSearchParams((next) => {
			next.set("view", "saved");
			next.set("page", "1");
			next.set("window", "all");
			next.delete("deviceId");
			next.delete("eventCategory");
			next.delete("eventAction");
			next.delete("source");
			next.delete("status");
			next.delete("evidenceSource");
			next.delete("eventConfidence");
			next.delete("query");
		});
	};
	const runHikvisionListenerControl = (action: "start" | "stop" | "restart") => {
		hikvisionListenerControl.mutate(action, {
			onSuccess: () => {
				void refetchHikvisionListenerStatus();
				void refetch();
			},
		});
	};
	const activeImportTargetCount = getNumericCount(importJobProgress?.targetImportCount);
	const activeImportScanLimit = getNumericCount(importJobProgress?.scanLimit);
	const isTargetedImport = activeImportTargetCount !== null;
	const activeImportProcessed = Number(importJobProgress?.processed || 0);
	const activeImportImported = Number(importJobProgress?.imported || 0);
	// Large targets (e.g. 24k) make imported/target stick at 0% for a long time while
	// the job is healthy. Prefer scan progress during processing so the bar is honest.
	const activeImportScanDenom = Math.max(
		activeImportScanLimit || 0,
		activeImportProcessed,
		1,
	);
	const activeImportSaveDenom = Math.max(activeImportTargetCount || 0, activeImportImported, 1);
	const scanProgressPct = Math.min(
		100,
		Math.round((activeImportProcessed / activeImportScanDenom) * 100),
	);
	const saveProgressPct = Math.min(
		100,
		Math.round((activeImportImported / activeImportSaveDenom) * 100),
	);
	const activeImportProgressPercent = importJobProgress
		? importJobProgress.status === "processing"
			? Math.max(scanProgressPct, saveProgressPct)
			: Math.min(100, Math.max(saveProgressPct, importJobProgress.status === "completed" ? 100 : 0))
		: 0;
	const activeImportJobSummary = importJobProgress
		? `${formatCount(importJobProgress.imported)} device logs saved to HRIS, ${formatCount(importJobProgress.alreadySaved || 0)} already in HRIS, ${formatCount(importJobProgress.skipped)} skipped, ${formatCount(importJobProgress.failed)} failed. Preview “will add” is an estimate — this run may only finish part of that total in one pass.`
		: "";
	const hasImportProgress = Boolean(activeImportJob && importJobProgress);
	const isImportProcessing = importJobProgress?.status === "processing";
	const isImportCancelRequested = Boolean(importJobProgress?.cancelRequested);
	const importProgressBubbleLabel = hasImportProgress
		? isImportProcessing
			? formatCount(importJobProgress?.processed)
			: importJobProgress?.status === "completed"
				? formatCount(importJobProgress?.imported)
				: "!"
		: "";
	const importProgressTitle =
		importJobProgress?.status === "cancelled"
			? "Sync cancelled"
			: importJobProgress?.status === "failed"
			? "Sync needs attention"
			: importJobProgress?.status === "completed"
				? "Sync finished"
				: isImportProcessing
					? isImportCancelRequested
						? "Cancelling device log sync"
						: isTargetedImport
							? "Syncing estimated unsaved logs"
							: "Scanning device logs"
					: "Device sync status";
	const importProgressToneClass =
		importJobProgress?.status === "failed"
			? "border-red-200 bg-red-50 text-red-950"
			: importJobProgress?.status === "cancelled"
				? "border-amber-200 bg-amber-50 text-amber-950"
			: importJobProgress?.status === "completed"
				? "border-emerald-200 bg-emerald-50 text-emerald-950"
				: "border-orange-200 bg-orange-50 text-orange-950";
	const importProgressFillClass =
		importJobProgress?.status === "failed"
			? "bg-red-600"
			: importJobProgress?.status === "cancelled"
				? "bg-amber-600"
			: importJobProgress?.status === "completed"
				? "bg-emerald-600"
				: "bg-orange-600";
	const importProgressStatus = importJobProgress?.status;
	const importProgressImported = importJobProgress?.imported;
	const importProgressSkipped = importJobProgress?.skipped;
	const importProgressMessage = importJobProgress?.message;

	useEffect(() => {
		if (typeof window === "undefined") return;
		if (activeImportJob) {
			window.localStorage.setItem(
				DEVICE_IMPORT_JOB_STORAGE_KEY,
				JSON.stringify(activeImportJob),
			);
			return;
		}
		window.localStorage.removeItem(DEVICE_IMPORT_JOB_STORAGE_KEY);
	}, [activeImportJob]);

	useEffect(() => {
		if (!activeImportJob || !isImportJobError) return;
		setActiveImportJob(null);
		setShowImportProgressModal(false);
		toast.warning("Previous sync status expired", {
			id: "device-log-import-progress",
			description: "Open Sync logs again to run the latest targeted check.",
		});
	}, [activeImportJob, isImportJobError]);

	useEffect(() => {
		if (!importProgressStatus || importProgressStatus === "processing") return;
		if (importProgressStatus === "completed") {
			toast.success("Device logs synced", {
				id: "device-log-import-progress",
				description: `${formatCount(importProgressImported)} device logs saved to HRIS. ${formatCount(importJobProgress?.alreadySaved || 0)} already in HRIS, ${formatCount(importProgressSkipped)} skipped with no employee number.`,
			});
			void refetch();
			void refetchHealth();
			void refetchSyncPreview();
		} else if (importProgressStatus === "cancelled") {
			toast.warning("Device log sync cancelled", {
				id: "device-log-import-progress",
				description: "The current job stopped. Retry will check the remaining gaps again.",
			});
			void refetch();
			void refetchHealth();
			void refetchSyncPreview();
		} else {
			toast.error("Device log sync failed", {
				id: "device-log-import-progress",
				description: importProgressMessage || "The sync job stopped before finishing.",
			});
		}
	}, [
		importProgressImported,
		importProgressMessage,
		importProgressSkipped,
		importProgressStatus,
		importJobProgress?.alreadySaved,
		refetch,
		refetchHealth,
		refetchSyncPreview,
	]);

	const columns: Column<UnifiedDeviceEventRow>[] = [
		{
			key: "eventTime",
			label: "Event time",
			sortable: viewMode === "saved",
			width: "190px",
			required: true,
			render: (value) => (
				<span className="whitespace-nowrap text-sm font-medium text-slate-950">
					{formatEventTime(value)}
				</span>
			),
		},
		{
			key: "eventCategory",
			label: "Category",
			width: "150px",
			required: true,
			render: (value) => (
				<span className="text-xs font-semibold text-slate-700">
					{formatEventTaxonomyToken(value)}
				</span>
			),
		},
		{
			key: "eventAction",
			label: "Action",
			width: "200px",
			required: true,
			render: (_value, item) => (
				<div className="min-w-0">
					<p className="truncate text-sm font-semibold text-slate-950">
						{formatEventTaxonomyToken(item.eventAction)}
					</p>
					<p className="truncate text-xs text-slate-500">{item.eventLabel || "Device event"}</p>
				</div>
			),
		},
		{
			key: "employeeNo",
			label: "Employee/User",
			sortable: viewMode === "saved",
			width: "290px",
			required: true,
			render: (value, item) => {
				const displayNo = getDisplayEmployeeNo(item);
				const deviceUserUrl =
					item.deviceId && displayNo && !isOpaqueDevicePersonToken(displayNo)
						? getDeviceUserSyncCenterUrl(item.deviceId, displayNo)
						: item.deviceId
							? getDeviceUserSyncCenterUrl(item.deviceId, null)
							: "";
				return (
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
						) : deviceUserUrl ? (
							<Link
								to={deviceUserUrl}
								className="block truncate text-sm font-semibold text-slate-950 hover:text-orange-700 hover:underline"
								title="Open Sync Center device users for this device">
								{getEmployeeDisplayName(item)}
							</Link>
						) : (
							<p className="truncate text-sm font-semibold text-slate-800">
								{getEmployeeDisplayName(item)}
							</p>
						)}
						<div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
							{deviceUserUrl && !isOpaqueDevicePersonToken(displayNo) ? (
								<Link
									to={deviceUserUrl}
									className="truncate text-xs text-orange-700 hover:underline"
									title="Device person on this terminal (not HRIS employee)">
									{formatDeviceEventPersonRef(null, item)} · Device user
								</Link>
							) : (
								<span
									className="truncate text-xs text-slate-500"
									title={
										isOpaqueDevicePersonToken(displayNo)
											? String(item.payload?.opaquePersonToken || item.employeeNo || "")
											: item.payload?.opaquePersonToken
												? `Mapped from device token ${item.payload.opaquePersonToken}`
												: undefined
									}>
									{formatDeviceEventPersonRef(null, item)}
								</span>
							)}
							<Badge
								variant={item.employeeProfileId ? "success-soft" : "warning-soft"}
								className="px-1.5 py-0 text-[11px] font-semibold">
								{item.employeeProfileId
									? "Matched HRIS"
									: isOpaqueDevicePersonToken(displayNo)
										? "Needs link"
										: "Device user"}
							</Badge>
						</div>
					</div>
				</div>
				);
			},
		},
		{
			key: "deviceId",
			label: "Device",
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
		{
			key: "evidenceSource",
			label: "Evidence",
			width: "180px",
			render: (_value, item) => (
				<div className="min-w-0">
					<p className="truncate text-sm font-medium text-slate-900">
						{getOptionLabel(evidenceSourceOptions, item.evidenceSource || "UNKNOWN")}
					</p>
					<p className="truncate text-xs text-slate-500">
						{item.directDeviceEvidence ? "Direct device evidence" : "Indirect/runtime evidence"}
					</p>
				</div>
			),
		},
		{
			key: "capabilityConfidence",
			label: "Confidence",
			width: "130px",
			render: (value) => (
				<Badge variant={String(value).toUpperCase() === "PROVEN" ? "success-soft" : "secondary"} className="px-2 py-0.5 text-[11px] font-semibold">
					{formatEventTaxonomyToken(value || "UNKNOWN")}
				</Badge>
			),
		},
		{
			key: "status",
			label: "HRIS result",
			sortable: viewMode === "saved",
			width: "190px",
			render: (_value, item) => (
				<div className="min-w-0">
					<p className="truncate text-sm font-medium text-slate-950">
						{item.processingLabel || item.businessStatus}
					</p>
					<p className="truncate text-xs text-slate-500">
						{item.attendanceId ? "Attendance linked" : "No attendance link"}
					</p>
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
							Device events
						</h1>
						{selectedDevice ? (
							<p className="truncate text-xs text-slate-500">
								{selectedDevice.name} · {selectedDevice.config?.vendor || "Device"} · {selectedDevice.address}
							</p>
						) : null}
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Badge
						variant={savedRowsBadgeVariant}
						className="rounded-md px-2 py-1">
						{savedRowsBadgeLabel}
					</Badge>
					{isSdkAlarmSavedScope ? (
						<>
							<Badge
								variant={hikvisionListenerStatusVariant}
								className="rounded-md px-2 py-1">
								{hikvisionListenerStatusLabel}
							</Badge>
							<Button
								type="button"
								variant="outline"
								className="h-9 px-3"
								onClick={openListenerControl}>
								<Power className="mr-2 h-4 w-4" />
								Listener
							</Button>
						</>
					) : null}
					<Button
						type="button"
						variant="outline"
						className={
							hasImportProgress
								? "relative h-9 border-orange-200 bg-orange-50 px-3 text-orange-700 hover:bg-orange-100 hover:text-orange-800"
								: "h-9 px-3"
						}
						onClick={openSyncLogs}>
						<UploadCloud className="mr-2 h-4 w-4" />
						Sync logs
						{importProgressBubbleLabel ? (
							<span className="ml-1 rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
								{importProgressBubbleLabel}
							</span>
						) : null}
					</Button>
					<Button
						type="button"
						variant="outline"
						className="h-9 px-3"
						onClick={() => {
							void refetchHealth();
							if (isSdkAlarmSavedScope) void refetchHikvisionListenerStatus();
							if (viewMode === "live") void refetchLive();
							else void refetch();
						}}>
						<RefreshCw className="mr-2 h-4 w-4" />
						Refresh
					</Button>
				</div>
			</div>

			{isSyncLogsDebugView && canUseDebugReset ? (
				<div className="rounded-md border border-red-200 bg-red-50 px-3 py-3">
					<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
						<div className="min-w-0">
							<p className="text-sm font-semibold text-red-950">Debug reset saved events</p>
							<p className="mt-1 text-xs text-red-800">
								Scope: {deviceId === "all" ? "all devices" : selectedDevice?.name || deviceId}
								{" / "}
								{source === "all" ? "all runtime paths" : formatEventSource(source)}
								{" / "}
								{timeWindowOptions.find((option) => option.value === timeWindow)?.label || timeWindow}
							</p>
							<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-red-900">
								<span>Models: DeviceEvent</span>
								<span>Device export only</span>
								<span>Attendance linked only when selected</span>
							</div>
							<label className="mt-3 flex w-fit items-center gap-2 text-xs font-medium text-red-950">
								<input
									type="checkbox"
									checked={includeLinkedAttendanceReset}
									onChange={(event) => setIncludeLinkedAttendanceReset(event.target.checked)}
									className="h-4 w-4 rounded border-red-300 text-red-700 focus:ring-red-500"
								/>
								Also delete linked attendance rows
							</label>
							{resetPreviewCounts ? (
								<div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
									<div>
										<span className="block text-red-700">Saved events</span>
										<span className="font-semibold text-red-950">
											{formatCount(resetPreviewCounts.deviceEvents)}
										</span>
									</div>
									<div>
										<span className="block text-red-700">Linked attendance</span>
										<span className="font-semibold text-red-950">
											{formatCount(resetPreviewCounts.linkedAttendance)}
										</span>
									</div>
									<div>
										<span className="block text-red-700">Devices exported</span>
										<span className="font-semibold text-red-950">
											{formatCount(resetPreviewCounts.devices)}
										</span>
									</div>
									<div>
										<span className="block text-red-700">Import jobs noted</span>
										<span className="font-semibold text-red-950">
											{formatCount(resetPreviewCounts.importJobs)}
										</span>
									</div>
								</div>
							) : null}
							{resetPreviewState.status === "executed" && resetPreviewState.data.backupDir ? (
								<p className="mt-2 break-all text-xs font-medium text-red-950">
									Backup: {resetPreviewState.data.backupDir}
								</p>
							) : null}
							{resetPreviewState.status === "error" ? (
								<p className="mt-2 text-xs font-medium text-red-900">{resetPreviewState.message}</p>
							) : null}
						</div>
						<div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col">
							<Button
								type="button"
								variant="outline"
								className="h-9 border-red-200 bg-white px-3 text-red-700 hover:bg-red-100 hover:text-red-800"
								disabled={resetDeviceEvents.isPending || resetPreviewState.status === "loading"}
								onClick={previewDeviceEventReset}>
								<RefreshCw className="h-4 w-4" />
								Preview reset
							</Button>
							<Button
								type="button"
								className="h-9 bg-red-700 px-3 text-white hover:bg-red-800"
								disabled={
									resetDeviceEvents.isPending ||
									!resetPreviewCounts ||
									Number(resetPreviewCounts.deviceEvents || 0) === 0
								}
								onClick={() => setShowResetConfirmModal(true)}>
								<Trash2 className="h-4 w-4" />
								Reset scoped data
							</Button>
						</div>
					</div>
				</div>
			) : null}

			<div className="rounded-md border border-slate-200 bg-white">
				<div
					className={
						viewMode === "live"
							? "grid gap-2 border-b border-slate-200 p-2 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_150px]"
							: "grid gap-2 border-b border-slate-200 p-2 sm:grid-cols-2 xl:grid-cols-4"
					}>
					<FilterField label="Device">
						<Select
							options={deviceOptions}
							value={deviceId}
							onChange={(value) => setFilter("deviceId", value)}
							placeholder="All devices"
							className={compactSelectClassName}
							dropdownClassName={compactSelectDropdownClassName}
						/>
					</FilterField>
					<FilterField label="Time">
						<Select
							options={timeWindowOptions}
							value={timeWindow}
							onChange={(value) => setFilter("window", value)}
							placeholder="Today"
							className={compactSelectClassName}
							dropdownClassName={compactSelectDropdownClassName}
						/>
					</FilterField>
					{viewMode === "saved" && (
						<>
							<FilterField label="Category">
								<Select
									options={eventCategoryOptions}
									value={eventCategory}
									onChange={(value) => {
										// Changing category must not leave a mismatched action selected
										// (e.g. Attendance + User created).
										updateSearchParams((next) => {
											if (!value || value === "all") next.delete("eventCategory");
											else next.set("eventCategory", value);
											const allowed = new Set(
												getEventActionOptionsForCategory(value).map((option) => option.value),
											);
											const currentAction = next.get("eventAction") || "all";
											if (currentAction !== "all" && !allowed.has(currentAction)) {
												next.delete("eventAction");
											}
											next.set("page", "1");
										});
									}}
									placeholder="Any event category"
									className={compactSelectClassName}
									dropdownClassName={compactSelectDropdownClassName}
								/>
							</FilterField>
							<FilterField label="Action">
								<Select
									options={getEventActionOptionsForCategory(eventCategory)}
									value={eventAction}
									onChange={(value) => setFilter("eventAction", value)}
									placeholder="Any event action"
									className={compactSelectClassName}
									dropdownClassName={compactSelectDropdownClassName}
								/>
							</FilterField>
						</>
					)}
				</div>

				<div className="border-b border-slate-200 px-3 py-2 text-xs text-slate-600">
					<span className="font-semibold text-slate-900">Saved event ledger</span>
					<span className="mx-2 text-slate-300">·</span>
					Only events already saved in HRIS. Device users are managed separately under Devices.
				</div>
				<div className="grid grid-cols-2 gap-0 divide-x divide-y divide-slate-200 sm:grid-cols-3 xl:grid-cols-6">
					<div
						className={
							realtimePanelIsLive
								? "col-span-3 border-b border-emerald-200 bg-emerald-50 px-3 py-2"
								: "col-span-3 border-b border-amber-200 bg-amber-50 px-3 py-2"
						}>
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div className="flex min-w-0 items-center gap-2">
								<span
									className={
										realtimePanelIsLive
											? "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700"
											: "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700"
									}
									aria-hidden="true">
									{realtimePanelIsLive ? (
										<Wifi className="h-4 w-4" />
									) : (
										<WifiOff className="h-4 w-4" />
									)}
								</span>
								<div className="min-w-0">
									<p
										className={
											realtimePanelIsLive
												? "truncate text-sm font-semibold text-emerald-950"
												: "truncate text-sm font-semibold text-amber-950"
										}>
										{realtimePanelStatusLabel}
									</p>
									<p
										className={
											realtimePanelIsLive
												? "truncate text-xs text-emerald-800"
												: "truncate text-xs text-amber-800"
										}>
										{realtimeStatusDetail}
									</p>
								</div>
							</div>
							<div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
								<Badge
									variant={realtimePanelIsLive ? "success-soft" : "warning-soft"}
									className="w-fit rounded-md px-2 py-1 font-semibold">
									{realtimePanelUpdateLabel}
								</Badge>
							</div>
						</div>
					</div>
						{[
							{
								label: "Saved",
								value: formatCount(totalItems),
							},
							{
								label: "Matched",
								value: formatCount(savedSummary.matched ?? matchedCount),
							},
							{
								label: "Needs match",
								value: formatCount(savedSummary.needsEmployeeMatch ?? needsEmployeeMatchCount),
							},
							{
								label: "Direct evidence",
								value: formatCount(savedSummary.directEvidence),
							},
							{
								label: "Inferred",
								value: formatCount(savedSummary.inferredEvidence),
							},
							{
								label: "Unknown",
								value: formatCount(savedSummary.unknownEvidence),
							},
						].map((item) => (
							<div key={item.label} className="min-w-0 px-3 py-2">
								<p className="truncate text-xs text-slate-500">{item.label}</p>
								<p className="text-base font-semibold text-slate-950">{item.value}</p>
							</div>
						))}
				</div>
				<div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
					<span className="font-semibold text-slate-900">Activity in selected window</span>
					<span className="mx-2 text-slate-300">·</span>
					Taps {formatCount(savedSummary.byAction?.TAP)} · Rejected {formatCount(savedSummary.byAction?.TAP_REJECTED)} · Fingerprints enrolled {formatCount(savedSummary.byAction?.FINGERPRINT_ENROLLED)} · Users created {formatCount(savedSummary.byAction?.USER_CREATED)} · Sync imports {formatCount(savedSummary.byAction?.SYNC_IMPORTED)} · Unknown {formatCount(savedSummary.byAction?.UNKNOWN)}
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
						? "ZKTeco events are received through the configured SDK sidecar and shown after they are saved in HRIS."
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
					aria-label="Show latest saved event row"
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
								{latestSavedProcessingLabel || (isLatestSavedFresh ? "Latest watcher save" : "Latest saved event")}
							</span>
							<span className="truncate text-xs opacity-80">
								{latestSavedEvent.employeeName ||
									formatDeviceEventPersonRef(latestSavedEvent.employeeNo)}
							</span>
						</div>
						<div className="flex min-w-0 items-center gap-2 text-xs">
							<span className="truncate">{formatEventTime(latestSavedEvent.receivedAt)}</span>
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

			<div className="rounded-md border border-slate-200 bg-white p-2">
				<div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
					<div className="min-w-0">
						<h2 className="truncate text-sm font-semibold text-slate-950">
							{viewMode === "live" ? "Live events" : "Saved events"}
						</h2>
						<p className="mt-0.5 truncate text-xs text-slate-500">
							{viewMode === "saved"
								? `${formatCount(totalItems)} saved row${totalItems === 1 ? "" : "s"} for this filter`
								: `${formatCount(liveEvents.length)} live row${liveEvents.length === 1 ? "" : "s"} in view`}
						</p>
					</div>
					{viewMode === "saved" ? (
						<div className="relative w-full min-w-0 md:w-[320px]">
							<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
							<Input
								placeholder="Search employee or device..."
								value={query}
								onChange={(event) => setFilter("query", event.target.value)}
								className="h-8 rounded-md border-slate-200 bg-white pl-8 pr-3 text-sm shadow-none focus:ring-2 focus:ring-primary/10"
							/>
						</div>
					) : null}
				</div>
				<DataTable<UnifiedDeviceEventRow>
					title={viewMode === "live" ? "Events" : "Saved events"}
					description=""
					data={rows}
					columns={columns}
					isLoading={isEventLoading}
					emptyMessage={savedEmptyMessage}
					emptyDescription={savedEmptyDescription}
					emptyActions={
						viewMode === "saved" ? (
							<div className="mx-auto grid max-w-3xl gap-2 text-left sm:grid-cols-3">
								<div className="rounded-md border border-slate-200 bg-white px-3 py-2">
									<p className="text-[11px] font-semibold uppercase text-slate-500">Live capture</p>
									<p className="mt-1 text-xs font-semibold text-slate-950">
										{hikvisionListenerStatusLabel || "Not in live-capture scope"}
									</p>
									<p className="mt-0.5 text-[11px] text-slate-500">
										{hikvisionSdkReceiving || hikvisionSdkArmed
											? "Live capture has recent event proof."
											: hikvisionListenerDetail}
									</p>
								</div>
								<div className="rounded-md border border-slate-200 bg-white px-3 py-2">
									<p className="text-[11px] font-semibold uppercase text-slate-500">Latest live row</p>
									<p className="mt-1 text-xs font-semibold text-slate-950">
										{latestSdkActionLabel || "No SDK row in scope"}
									</p>
									<p className="mt-0.5 text-[11px] text-slate-500">
										{latestSdkEvidenceEvent
											? `${latestSdkCategoryLabel || "Event"} at ${formatEventTime(latestSdkEvidenceEvent.receivedAt || latestSdkEvidenceEvent.eventTime)}`
											: "No saved SDK listener row was returned by the latest probe."}
									</p>
								</div>
								<div className="rounded-md border border-slate-200 bg-white px-3 py-2">
									<p className="text-[11px] font-semibold uppercase text-slate-500">Browser path</p>
									<p className="mt-1 text-xs font-semibold text-slate-950">{socketTruthLabel}</p>
									<p className="mt-0.5 text-[11px] text-slate-500">
										{isConnected
											? "Saved rows can arrive through the socket."
											: "The page continues with saved-event polling."}
									</p>
								</div>
								{hasScopedSavedFilters ? (
									<div className="sm:col-span-3 flex flex-wrap items-center justify-center gap-2 pt-1">
										<Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={clearSavedFilters}>
											Show all saved events
										</Button>
										{latestSdkEvidenceEvent ? (
											<Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={focusLatestSdkEvidenceEvent}>
												Show latest saved row
											</Button>
										) : null}
									</div>
								) : null}
							</div>
						) : null
					}
					showSearch={false}
					showFilters={false}
					showPagination
					showExport={false}
					noCard
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
					renderActions={(item) => {
						const displayNo = getDisplayEmployeeNo(item);
						const deviceUserUrl =
							item.deviceId && displayNo && !isOpaqueDevicePersonToken(displayNo)
								? getDeviceUserSyncCenterUrl(item.deviceId, displayNo)
								: item.deviceId
									? getDeviceUserSyncCenterUrl(item.deviceId, null)
									: "";
						return (
							<div className="flex flex-col gap-1">
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8 px-2.5 text-xs"
									onClick={() => openEventDetails(item)}>
									<Eye className="h-3.5 w-3.5" />
									View
								</Button>
								{deviceUserUrl ? (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-7 px-2 text-[11px] text-orange-700"
										onClick={() => navigate(deviceUserUrl)}>
										Device user
									</Button>
								) : null}
							</div>
						);
					}}
					rowClassName={(item) =>
						viewMode === "saved" && item.id === highlightedSavedEventId
							? "bg-emerald-50/80 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-50"
							: ""
					}
					containedScroll
					containedBodyClassName="min-h-[7.5rem] max-h-[calc(100vh-33rem)]"
					emptyStateClassName="rounded-md border border-slate-200 bg-slate-50 px-4 py-5"
				/>
			</div>

			<Modal
				open={showResetConfirmModal}
				onOpenChange={(open) => setShowResetConfirmModal(open)}
				title="Reset scoped saved events"
				description="A backup export is written before any records are deleted."
				className="max-w-lg">
				<div className="space-y-4">
					<div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-950">
						<p className="font-semibold">This will delete only the previewed scope.</p>
						<div className="mt-3 grid grid-cols-2 gap-2 text-xs">
							<div>
								<span className="block text-red-700">Saved events</span>
								<span className="font-semibold">{formatCount(resetPreviewCounts?.deviceEvents)}</span>
							</div>
							<div>
								<span className="block text-red-700">Linked attendance</span>
								<span className="font-semibold">
									{includeLinkedAttendanceReset
										? formatCount(resetPreviewCounts?.linkedAttendance)
										: "Export only"}
								</span>
							</div>
							<div>
								<span className="block text-red-700">Device</span>
								<span className="font-semibold">
									{deviceId === "all" ? "All devices" : selectedDevice?.name || deviceId}
								</span>
							</div>
							<div>
								<span className="block text-red-700">Runtime path</span>
								<span className="font-semibold">
									{source === "all" ? "All runtime paths" : formatEventSource(source)}
								</span>
							</div>
						</div>
					</div>
					<p className="text-xs text-slate-600">
						Devices, employees, person records, and unrelated attendance are not deleted.
						The backup includes devices, device events, linked attendance, import job state, and a recovery note.
					</p>
					<div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
						<Button
							type="button"
							variant="outline"
							onClick={() => setShowResetConfirmModal(false)}>
							Cancel
						</Button>
						<Button
							type="button"
							className="bg-red-700 text-white hover:bg-red-800"
							disabled={resetDeviceEvents.isPending}
							onClick={executeDeviceEventReset}>
							<Trash2 className="h-4 w-4" />
							Export backup and reset
						</Button>
					</div>
				</div>
			</Modal>

			<Modal
				open={isListenerControlModalOpen}
				onOpenChange={(open) => {
					if (!open) closeListenerControl();
				}}
				title="Hikvision listener"
				description="Live capture service heartbeat and tap listener control."
				className="max-w-3xl">
				<div className="space-y-4">
					<div
						className={
							hikvisionSdkReceiving
								? "rounded-lg border border-emerald-200 bg-emerald-50 p-4"
								: hikvisionListenerUnavailable
									? "rounded-lg border border-slate-200 bg-slate-50 p-4"
									: "rounded-lg border border-amber-200 bg-amber-50 p-4"
						}>
						<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div className="flex min-w-0 items-start gap-3">
								<span
									className={
										hikvisionSdkReceiving
											? "flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700"
											: "flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700"
									}
									aria-hidden="true">
									{isLoadingHikvisionListenerStatus ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : hikvisionSdkReceiving ? (
										<Wifi className="h-4 w-4" />
									) : (
										<WifiOff className="h-4 w-4" />
									)}
								</span>
								<div className="min-w-0">
									<p
										className={
											hikvisionSdkReceiving
												? "text-sm font-semibold text-emerald-950"
												: "text-sm font-semibold text-amber-950"
										}>
										{hikvisionListenerStatusLabel}
									</p>
									<p
										className={
											hikvisionSdkReceiving
												? "mt-1 break-words text-xs text-emerald-800"
												: "mt-1 break-words text-xs text-amber-800"
										}>
										{focusedHikvisionStatus || hikvisionListenerDeviceSummary}
									</p>
									<p className="mt-2 text-xs text-slate-600">
										SDK event proof:{" "}
										<span className="font-semibold">
											{isLatestSdkSavedFresh
												? `${latestSdkEvidenceLabel} at ${formatEventTime(latestSdkEvidenceEvent?.receivedAt || latestSdkEvidenceEvent?.eventTime)}`
												: latestSdkEvidenceEvent
													? `${latestSdkEvidenceLabel} at ${formatEventTime(latestSdkEvidenceEvent.receivedAt || latestSdkEvidenceEvent.eventTime)}`
													: "no SDK rows in the current scope"}
										</span>
									</p>
								</div>
							</div>
							<Badge
								variant={isLatestSdkSavedFresh || hikvisionSdkReceiving ? "success-soft" : "warning-soft"}
								className="w-fit rounded-md px-2 py-1">
								{isLatestSdkSavedFresh
									? latestSdkEvidenceFreshLabel
									: hikvisionSdkReceiving
										? "SDK callback received"
										: "No recent SDK event saved"}
							</Badge>
						</div>
					</div>

					<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
						<div className="rounded-lg border border-slate-200 bg-white p-4">
							<div className="flex items-start justify-between gap-4">
								<label
									htmlFor="hikvision-listener-toggle"
									className="flex min-w-0 items-start gap-3">
									<Switch
										id="hikvision-listener-toggle"
										checked={hikvisionListenerRunning}
										disabled={
											hikvisionListenerControl.isPending ||
											isLoadingHikvisionListenerStatus
										}
										onCheckedChange={(checked) =>
											runHikvisionListenerControl(checked ? "start" : "stop")
										}
										className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-300"
									/>
									<span className="min-w-0">
										<span className="block text-sm font-semibold text-slate-950">
											Service enabled
										</span>
										<span className="mt-1 block text-xs text-slate-600">
											{hikvisionListenerRunning
												? hikvisionSdkReceiving
													? "Live capture is receiving callbacks and posting to HRIS."
													: "Live capture service is on; use the status above for tap truth."
												: "Turn this on before testing physical taps."}
										</span>
									</span>
								</label>
								{hikvisionListenerControl.isPending ? (
									<Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" />
								) : null}
							</div>

							<div className="mt-4 flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									className="h-9 px-3"
									disabled={hikvisionListenerControl.isPending}
									onClick={() => void refetchHikvisionListenerStatus()}>
									<RefreshCw className="h-4 w-4" />
									Check status
								</Button>
								<Button
									type="button"
									variant="outline"
									className="h-9 px-3"
									disabled={hikvisionListenerControl.isPending || !hikvisionListenerRunning}
									onClick={() => runHikvisionListenerControl("restart")}>
									<RefreshCw className="h-4 w-4" />
									Restart
								</Button>
							</div>
						</div>

						<div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
							<div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
								<ExternalLink className="h-3.5 w-3.5" />
								Runtime
							</div>
							<dl className="mt-3 space-y-2 text-xs">
								<div className="flex min-w-0 justify-between gap-3">
									<dt className="text-slate-500">VM</dt>
									<dd className="truncate font-semibold text-slate-900">
										{hikvisionListenerStatus?.vm?.host || "10.184.37.19"}
									</dd>
								</div>
								<div className="flex min-w-0 justify-between gap-3">
									<dt className="text-slate-500">Service</dt>
									<dd className="truncate font-semibold text-slate-900">
										{hikvisionListenerStatus?.service ||
											"project-truth-hikvision-hot-reload-listener.service"}
									</dd>
								</div>
								<div className="flex min-w-0 justify-between gap-3">
									<dt className="text-slate-500">Checked</dt>
									<dd className="truncate font-semibold text-slate-900">
										{formatEventTime(hikvisionListenerStatus?.checkedAt)}
									</dd>
								</div>
								<div className="flex min-w-0 justify-between gap-3">
									<dt className="text-slate-500">SDK state</dt>
									<dd className="truncate font-semibold text-slate-900">
										{formatEventTaxonomyToken(hikvisionSdkState)}
									</dd>
								</div>
								<div className="flex min-w-0 justify-between gap-3">
									<dt className="text-slate-500">Watching</dt>
									<dd className="truncate font-semibold text-slate-900">
										{hikvisionListenerDevices.length
											? `${hikvisionListenerDevices.length} device${hikvisionListenerDevices.length === 1 ? "" : "s"}`
											: "-"}
									</dd>
								</div>
								<div className="flex min-w-0 justify-between gap-3">
									<dt className="text-slate-500">Last callback</dt>
									<dd className="truncate font-semibold text-slate-900">
										{formatEventTime(hikvisionListenerStatus?.sdk?.lastAlarmAt)}
									</dd>
								</div>
								<div className="flex min-w-0 justify-between gap-3">
									<dt className="text-slate-500">Last HRIS post</dt>
									<dd className="truncate font-semibold text-slate-900">
										{formatEventTime(hikvisionListenerStatus?.sdk?.lastPostAt)}
									</dd>
								</div>
							</dl>
						</div>
					</div>

					<div className="rounded-lg border border-slate-200 bg-white p-4">
						<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h3 className="text-sm font-semibold text-slate-950">Per-device SDK proof</h3>
								<p className="mt-0.5 text-xs text-slate-500">
									{deviceId !== "all"
										? "Selected terminal is shown first."
										: "Each terminal reports its own login, arm, and callback state."}
								</p>
							</div>
							<Badge variant={hikvisionSdkReceiving || hikvisionSdkArmed ? "success-soft" : "warning-soft"} className="w-fit rounded-md px-2 py-1">
								{hikvisionListenerDeviceSummary}
							</Badge>
						</div>
						<div className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-100">
							{hikvisionListenerDevices.length ? (
								hikvisionListenerDevices.map((device) => {
									const isSelected = deviceId !== "all" && device.deviceId === deviceId;
									const rowLive = device.receivingCallbacks || device.armed;
									const rowIconClass = device.receivingCallbacks
										? "bg-emerald-100 text-emerald-700"
										: device.armed
											? "bg-blue-100 text-blue-700"
											: device.state === "login_failed"
												? "bg-amber-100 text-amber-700"
												: "bg-slate-100 text-slate-500";
									const rowLabel = device.receivingCallbacks
										? "Receiving callbacks"
										: device.armed
											? "Armed, waiting for tap"
											: device.state === "login_failed"
												? `Login failed${device.lastLoginError ? ` (${device.lastLoginError})` : ""}`
												: formatEventTaxonomyToken(device.state || "unknown");
									return (
										<div
											key={device.deviceId || device.host || device.name || rowLabel}
											className={isSelected ? "bg-orange-50/70 px-3 py-2.5" : "px-3 py-2.5"}>
											<div className="flex min-w-0 items-start gap-3">
												<span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${rowIconClass}`}>
													{device.receivingCallbacks ? (
														<Wifi className="h-3.5 w-3.5" />
													) : rowLive ? (
														<BadgeCheck className="h-3.5 w-3.5" />
													) : (
														<WifiOff className="h-3.5 w-3.5" />
													)}
												</span>
												<div className="min-w-0 flex-1">
													<div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
														<p className="truncate text-sm font-semibold text-slate-950">
															{device.name || device.host || "Hikvision device"}
														</p>
														<Badge variant={rowLive ? "success-soft" : "warning-soft"} className="w-fit rounded-md px-2 py-0.5">
															{rowLabel}
														</Badge>
													</div>
													<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
														{(device as any).configuredAddress ? (
															<>
																<span title="Configured device address">
																	{(device as any).configuredAddress}
																</span>
																<span className="text-slate-300">/</span>
															</>
														) : null}
														<span title="SDK login host used by the listener">
															{(device as any).usesReverseTunnel
																? `SDK via reverse tunnel ${device.host || "127.0.0.1"}`
																: device.host || "No host"}
														</span>
														<span className="text-slate-300">/</span>
														<span>SDK {device.sdkPort || "8000"}</span>
														<span className="text-slate-300">/</span>
														<span>Last log {formatEventTime(device.lastLogAt)}</span>
														{isSelected ? (
															<Badge variant="secondary" className="rounded-md px-1.5 py-0">
																Selected
															</Badge>
														) : null}
														{isFetchingHikvisionListenerStatus && isSelected ? (
															<Badge variant="secondary" className="rounded-md px-1.5 py-0">
																Refreshing…
															</Badge>
														) : null}
													</div>
												</div>
											</div>
										</div>
									);
								})
							) : (
								<p className="px-3 py-4 text-sm text-slate-500">
									No per-device listener proof was returned by the latest status check.
								</p>
							)}
						</div>
					</div>

					{hikvisionListenerDiagnosis ? (
						<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
							{hikvisionListenerDiagnosis}
						</div>
					) : null}

					{hikvisionListenerStatusError ? (
						<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
							{getAsyncErrorMessage(hikvisionListenerStatusError, "Listener status check failed")}
						</div>
					) : null}

					<div className="rounded-lg border border-slate-200 bg-white p-4">
						<div className="flex items-center justify-between gap-3">
							<h3 className="text-sm font-semibold text-slate-950">Recent listener log</h3>
							<Badge variant="secondary" className="rounded-md px-2 py-1">
								{hikvisionListenerStatus?.logs?.available ? "Log tail loaded" : "No log tail"}
							</Badge>
						</div>
						<div className="mt-3 max-h-48 overflow-y-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
							{hikvisionListenerStatus?.logs?.recent?.length ? (
								<pre className="whitespace-pre-wrap break-words font-mono leading-5">
									{hikvisionListenerStatus.logs.recent.join("\n")}
								</pre>
							) : (
								<p className="text-slate-300">
									{hikvisionListenerStatus?.logs?.error ||
										"No listener log lines returned by the VM status check."}
								</p>
							)}
						</div>
						{hikvisionListenerLastLog ? (
							<p className="mt-2 truncate text-xs text-slate-500">
								Latest log line: {hikvisionListenerLastLog}
							</p>
						) : null}
					</div>

					<div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
						<Button type="button" variant="outline" onClick={closeListenerControl}>
							Done
						</Button>
						<Button
							type="button"
							className="bg-orange-500 text-white hover:bg-orange-600"
							disabled={hikvisionListenerControl.isPending || isLoadingHikvisionListenerStatus}
							onClick={() =>
								runHikvisionListenerControl(hikvisionListenerRunning ? "restart" : "start")
							}>
							{hikvisionListenerControl.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : hikvisionListenerRunning ? (
								<RefreshCw className="h-4 w-4" />
							) : (
								<Power className="h-4 w-4" />
							)}
							{hikvisionListenerRunning ? "Restart listener" : "Start listener"}
						</Button>
					</div>
				</div>
			</Modal>

			<Modal
				open={isSyncLogsModalOpen}
				onOpenChange={(open) => {
					if (!open) closeSyncLogs();
				}}
				title="Sync device logs"
				className="max-w-5xl">
				<div className="space-y-3">
					<div className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
						<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
							<div className="min-w-0">
								<p className="truncate text-sm font-semibold text-slate-950">{syncScopeLabel}</p>
								{showSyncPreviewSkeleton ? (
									<SyncPreviewSkeleton />
								) : syncPreviewRows.length > 0 ? (
									<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
										<span>Will add: {syncMissingLogLabel}</span>
										<span>Already saved: {formatCount(syncHrisSavedTotal)}</span>
										<span>Needs review: {formatCount(Math.max(syncNeedsReviewTotal, syncProjectedSkippedTotal))}</span>
										{Number(syncFailedTotal) > 0 ? (
											<span>Failed: {formatCount(syncFailedTotal)}</span>
										) : null}
										<span>
											Devices ready: {formatCount(syncDevicesReadyCount)} of{" "}
											{formatCount(syncPreviewRows.length)}
										</span>
										{/* Keep probe totals for contract/tests without cluttering primary chips */}
										<span className="sr-only">
											Ready source checks: {formatCount(syncReadySourceChecks.ready)} of{" "}
											{formatCount(syncReadySourceChecks.total)}
										</span>
										<span className="sr-only">
											Will add to Device Events: {syncMissingLogLabel}
										</span>
										<span className="sr-only">Already in HRIS: {formatCount(syncHrisSavedTotal)}</span>
									</div>
								) : (
									<p className="mt-1 text-xs text-amber-700">No sync-capable devices.</p>
								)}
								<p className="mt-2 text-xs text-slate-500">
									Preview only — nothing is saved until you confirm. Shows what will be added to Device Events.
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<Badge
									variant={
										showSyncPreviewSkeleton
											? "secondary"
											: syncStartableRows.length
												? "success-soft"
												: "warning-soft"
									}
									className="rounded-md px-2 py-0.5 font-semibold">
									{syncStatusLabel}
								</Badge>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8 px-3 text-xs"
									disabled={showSyncPreviewSkeleton || isLoadingSyncHealth}
									onClick={() => void refreshSyncPreflight()}>
									<RefreshCw className="h-3.5 w-3.5" />
									Refresh
								</Button>
							</div>
						</div>
					</div>

					{/* What to save — user-friendly scope (attendance ACS vs user/enrollment logSearch). */}
					<div
						className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5"
						data-testid="sync-logs-scope-controls">
						<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
							What to save
						</p>
						<div className="mt-2 grid gap-2 sm:grid-cols-2">
							<label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800">
								<input
									type="checkbox"
									className="mt-0.5 h-4 w-4 rounded border-slate-300"
									checked={syncIncludeAttendance}
									onChange={(e) => setSyncIncludeAttendance(e.target.checked)}
									data-testid="sync-include-attendance"
								/>
								<span className="min-w-0">
									<span className="block font-semibold text-slate-950">Attendance taps</span>
									<span className="block text-xs text-slate-600">
										Door / clock-in punches from the access log
										{syncScopedBreakdown.attendance > 0
											? ` · about +${formatCount(syncScopedBreakdown.attendance)}`
											: ""}
									</span>
								</span>
							</label>
							<label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800">
								<input
									type="checkbox"
									className="mt-0.5 h-4 w-4 rounded border-slate-300"
									checked={syncIncludeOperations}
									onChange={(e) => setSyncIncludeOperations(e.target.checked)}
									data-testid="sync-include-operations"
								/>
								<span className="min-w-0">
									<span className="block font-semibold text-slate-950">
										User &amp; enrollment activity
									</span>
									<span className="block text-xs text-slate-600">
										User created, fingerprint enrolled, and similar device admin actions
										{syncScopedBreakdown.operations > 0
											? ` · about +${formatCount(syncScopedBreakdown.operations)}`
											: " - 0 ready"}
										{syncScopedNeedsReviewBreakdown.operations > 0
											? ` - ${formatCount(syncScopedNeedsReviewBreakdown.operations)} need review`
											: ""}
									</span>
								</span>
							</label>
						</div>
						<div className="mt-2">
							<label
								htmlFor="sync-time-window"
								className="text-xs font-semibold uppercase tracking-wide text-slate-500">
								How far back
							</label>
							<select
								id="sync-time-window"
								className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 sm:max-w-xs"
								value={syncTimeWindow}
								onChange={(e) =>
									setSyncTimeWindow(e.target.value as "all" | "7d" | "30d" | "90d")
								}
								data-testid="sync-time-window">
								{SYNC_TIME_WINDOW_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label} — {option.help}
									</option>
								))}
							</select>
						</div>
						<p className="mt-2 text-xs text-slate-600" data-testid="sync-scope-summary">
							Will try to save about{" "}
							<span className="font-semibold text-slate-950">
								{formatCount(syncScopedBreakdown.total)}
							</span>{" "}
							new rows
							{syncIncludeAttendance && syncIncludeOperations
								? ` (${formatCount(syncScopedBreakdown.attendance)} attendance + ${formatCount(syncScopedBreakdown.operations)} user/enrollment)`
								: syncIncludeAttendance
									? " (attendance only)"
									: syncIncludeOperations
										? " (user & enrollment only)"
										: " (nothing selected)"}
							{syncTimeWindow !== "all"
								? ` · window: ${SYNC_TIME_WINDOW_OPTIONS.find((o) => o.value === syncTimeWindow)?.label || syncTimeWindow}`
								: ""}
							{syncScopedNeedsReviewBreakdown.total > 0
								? ` ${formatCount(syncScopedNeedsReviewBreakdown.total)} rows need review and will not be saved as known events`
								: ""}
							.
						</p>
					</div>

					<div className="rounded-lg border border-slate-200 bg-white">
						{showSyncPreviewSkeleton ? (
							<SyncDeviceDetailsSkeleton />
						) : syncVendorSections.length ? (
							<div className="divide-y divide-slate-100">
								{syncVendorSections.map((section) => (
									<div key={section.vendor}>
										<div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2">
											<span className="text-sm font-semibold text-slate-950">{section.vendor}</span>
											<span className="text-xs text-slate-500">{formatCount(section.rows.length)} device{section.rows.length === 1 ? "" : "s"}</span>
										</div>
										<div className="divide-y divide-slate-100">
											{section.rows.map((device) => {
									const eventRows = getFallbackSyncEventRows(device, skipMissingEmployeeNo);
									const projectedDeviceAdds = eventRows.reduce(
										(total, row) =>
											total +
											(row.status === "Ready" && hasNumericCount(row.willAdd)
												? Number(row.willAdd)
												: 0),
										0,
									);
									const projectedDeviceNeedsReview = eventRows.reduce(
										(total, row) =>
											total +
											(row.status === "Needs review"
												? hasNumericCount(row.willAdd)
													? Number(row.willAdd)
													: 1
												: 0),
										0,
									);
									const deviceHasReadyRows = eventRows.some((row) => row.status === "Ready");
									const deviceIsBlocked =
										Boolean(device.error) ||
										device.status === "source_unavailable" ||
										device.status === "source_total_unavailable" ||
										(!deviceHasReadyRows &&
											eventRows.length > 0 &&
											eventRows.every((row) => row.status === "Unavailable"));
									const interestingRows = eventRows.filter(
										(row) =>
											row.status === "Ready" ||
											row.status === "Needs review" ||
											(hasNumericCount(row.willAdd) && Number(row.willAdd) > 0) ||
											Number(row.alreadyInHris || 0) > 0,
									);
									const tableRows = deviceIsBlocked
										? []
										: interestingRows.length
											? interestingRows
											: eventRows;
									const deviceStatusLabel = deviceHasReadyRows
										? "Ready"
										: deviceIsBlocked
											? "Blocked"
											: eventRows.some((row) => row.status === "Needs review")
												? "Needs review"
												: "No new rows";
									const deviceBlockReason =
										device.error ||
										(deviceIsBlocked
											? "Can’t read this device right now. Check credentials or network, then refresh."
											: null);
									return (
										<div key={device.deviceId} className="px-3 py-3">
											<div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
												<div className="min-w-0">
													<p className="truncate text-sm font-semibold text-slate-950">
														{getSyncDeviceTitle(device.vendor, device.name, device.address)}
													</p>
													<p className="truncate text-xs text-slate-500">
														{device.address}:{device.port}
													</p>
													{deviceBlockReason ? (
														<p className="mt-1 text-xs font-medium text-red-700">{deviceBlockReason}</p>
													) : null}
												</div>
												<div className="flex shrink-0 items-center gap-2">
													<span className="text-xs text-slate-500">Will add</span>
													<span className="text-sm font-bold text-red-700">
														{deviceIsBlocked && !hasNumericCount(projectedDeviceAdds)
															? "—"
															: `+${formatCount(projectedDeviceAdds)}`}
													</span>
													{projectedDeviceNeedsReview > 0 ? (
														<span className="text-xs font-semibold text-amber-700">
															Needs review {formatCount(projectedDeviceNeedsReview)}
														</span>
													) : null}
													<Badge
														variant={
															deviceHasReadyRows
																? "success-soft"
																: deviceIsBlocked
																	? "warning-soft"
																	: "secondary"
														}
														className="rounded-md px-2 py-0.5 font-semibold">
														{deviceStatusLabel}
													</Badge>
												</div>
											</div>
											{deviceIsBlocked ? (
												<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
													Event breakdown is hidden until this device can be read. After a successful
													sync, use Device / Time / Category / Action filters on the Device events page.
												</div>
											) : (
												<div className="overflow-hidden rounded-md border border-slate-200">
													{/* One compact table: every event is a single line (no section groups, no long paths). */}
													<table
														className="w-full border-collapse text-left text-xs"
														data-testid="sync-logs-event-table">
														<thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
															<tr>
																<th className="whitespace-nowrap px-2 py-1.5">Event</th>
																<th className="whitespace-nowrap px-2 py-1.5">Business area</th>
																<th className="whitespace-nowrap px-2 py-1.5 text-right">Will add</th>
																<th className="whitespace-nowrap px-2 py-1.5 text-right">Saved</th>
																<th className="whitespace-nowrap px-2 py-1.5">Status</th>
															</tr>
														</thead>
														<tbody className="divide-y divide-slate-100 bg-white">
															{sortSyncEventRows(tableRows).map((row) => {
																const categoryToken = getSyncCategoryToken(row);
																const compactLabel = getSyncEventLabelCompact(row);
																const fullLabel = String(row.eventLabel || row.eventAction || compactLabel);
																const detailTitle = [
																	fullLabel,
																	getSyncWhereToFind(row),
																	getSyncSourceDetail(row),
																	getSyncReviewReason(row),
																]
																	.filter(Boolean)
																	.join(" · ");
																const statusLabel = row.confidenceLabel || row.status || "—";
																const willAddCell =
																	row.status === "Ready" && hasNumericCount(row.willAdd)
																		? `+${formatCount(row.willAdd)}`
																		: row.status === "Needs review" && hasNumericCount(row.willAdd)
																			? `Review ${formatCount(row.willAdd)}`
																			: "—";
																return (
																	<tr
																		key={row.key}
																		className="h-8 whitespace-nowrap"
																		title={detailTitle}
																		data-category={categoryToken}
																		data-event-action={row.eventAction || ""}>
																		<td className="max-w-[11rem] truncate px-2 py-1 font-semibold text-slate-950">
																			{compactLabel}
																		</td>
																		<td className="px-2 py-1">
																			<span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-700">
																				{categoryToken}
																			</span>
																		</td>
																		<td
																			className={
																				row.status === "Needs review"
																					? "px-2 py-1 text-right font-bold tabular-nums text-amber-700"
																					: "px-2 py-1 text-right font-bold tabular-nums text-red-700"
																			}>
																			{willAddCell}
																		</td>
																		<td className="px-2 py-1 text-right font-semibold tabular-nums text-slate-700">
																			{formatCount(row.alreadyInHris)}
																		</td>
																		<td className="px-2 py-1">
																			<Badge
																				variant={row.status === "Ready" ? "success-soft" : "warning-soft"}
																				className="rounded-md px-1.5 py-0 text-[10px] font-semibold">
																				{statusLabel}
																			</Badge>
																		</td>
																	</tr>
																);
															})}
														</tbody>
													</table>
												</div>
											)}
											{!deviceIsBlocked ? (
												<p className="mt-2 text-[11px] text-slate-500">
													Nothing is saved yet. This preview shows what HRIS can add to Device Events after you confirm.
												</p>
											) : null}
											{/* Keep legacy labels available for source contracts without table clutter */}
											<span className="sr-only">Event to add</span>
											<span className="sr-only">Already in HRIS</span>
											<span className="sr-only">Source proof</span>
											<span className="sr-only">Filter after sync</span>
											<span className="sr-only">Business area</span>
											<span className="sr-only">Where to find it</span>
										</div>
									);
								})}
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="px-3 py-3 text-sm text-slate-500">No device preview rows returned.</div>
						)}
					</div>

					{syncLogsState.status === "accepted" ? (
						<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
							{syncLogsState.message}
						</div>
					) : null}
					{syncLogsState.status === "error" ? (
						<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
							{syncLogsState.message}
						</div>
					) : null}

					<div className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
						<label
							htmlFor="skip-missing-employee-no"
							className="flex min-w-0 items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
							<Switch
								id="skip-missing-employee-no"
								checked={skipMissingEmployeeNo}
								onCheckedChange={setSkipMissingEmployeeNo}
								disabled={zktecoSync.isPending || hikvisionImport.isPending}
								aria-label="Skip rows with no employee number"
								className="mt-0.5"
							/>
							<span className="min-w-0">
								<span className="block font-semibold text-slate-950">Skip rows with no employee no.</span>
								<span className="block text-xs text-slate-600">
									{skipMissingEmployeeNo
										? `${formatCount(syncProjectedSkippedTotal)} employee-less row${syncProjectedSkippedTotal === 1 ? "" : "s"} will stay out of Device Events.`
										: `${syncMissingLogLabel} event${Number(syncDryRunEstimate) === 1 ? "" : "s"} may be added. Nothing is saved until you confirm.`}
								</span>
							</span>
						</label>
						<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
							<Button type="button" variant="outline" className="h-9 px-3" onClick={closeSyncLogs}>
								Close
							</Button>
							<Button
								type="button"
								className="h-9 px-3"
								disabled={
									zktecoSync.isPending ||
									hikvisionImport.isPending ||
									isLoadingSyncPreview ||
									syncStartableRows.length === 0
								}
								onClick={startDeviceLogImport}>
								<UploadCloud className="h-4 w-4" />
								{syncActionLabel}
							</Button>
						</div>
					</div>
				</div>
			</Modal>

			<Modal
				open={showImportProgressModal}
				onOpenChange={(open) => {
					if (!open) setShowImportProgressModal(false);
				}}
				title="Device sync status"
				description="You can close this window and reopen status from Sync logs."
				className="max-w-lg"
				showCloseButton={!isImportProcessing}
				closeOnBackdropClick={!isImportProcessing}>
				<div className="space-y-4">
					{activeImportJob && importJobProgress ? (
						<div className={`min-h-[230px] rounded-lg border p-4 ${importProgressToneClass}`}>
							<div className="flex items-center justify-between gap-3 text-sm">
								<span className="min-w-0 font-medium">
									{isImportProcessing ? (
										<>
											<Loader2 className="mr-2 inline-block h-4 w-4 animate-spin align-middle" />
											{importProgressTitle}
										</>
									) : (
										importProgressTitle
									)}
								</span>
								<span className="shrink-0 font-semibold">
									{activeImportProgressPercent}%
								</span>
							</div>
							<p className="mt-1 text-xs opacity-90">
								{isTargetedImport
									? `Working through up to ${formatCount(activeImportTargetCount)} estimated rows from your Sync logs selection. The preview total can be larger than one pass can finish — Saved and Scanned below are the live truth.`
									: "Sync scans device source logs, then classifies each row against HRIS."}
							</p>
							<div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
								<div
									className={`h-full rounded-full transition-all ${importProgressFillClass}`}
									style={{ width: `${activeImportProgressPercent}%` }}
								/>
							</div>
							<div className="mt-3 grid grid-cols-2 gap-2 text-xs">
								<div className="text-emerald-700">
									Saved to HRIS: <span className="font-semibold">{formatCount(importJobProgress.imported)}</span>
								</div>
								<div className="text-red-700">
									Failed: <span className="font-semibold">{formatCount(importJobProgress.failed)}</span>
								</div>
								{(importJobProgress.attendanceImported !== undefined ||
									importJobProgress.operationsImported !== undefined) && (
									<div className="col-span-2 text-[11px] text-slate-700">
										Breakdown:{" "}
										<span className="font-semibold">
											{formatCount(importJobProgress.attendanceImported || 0)} attendance taps
										</span>
										{" · "}
										<span className="font-semibold">
											{formatCount(importJobProgress.operationsImported || 0)} user/enrollment
										</span>
										{importJobProgress.phase ? (
											<span className="text-slate-500"> · {importJobProgress.phase}</span>
										) : null}
									</div>
								)}
							</div>
							<div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-orange-100 bg-white/70 px-3 py-2 text-xs text-orange-900">
								<div>
									<span className="block text-orange-700">Rows scanned this pass</span>
									<span className="font-semibold">
										{formatCount(importJobProgress.processed)} /{" "}
										{formatCount(
											activeImportScanLimit ??
												importJobProgress.sourceTotal ??
												importJobProgress.total,
										)}
									</span>
									<span className="mt-0.5 block text-[10px] text-orange-700/80">
										How far this run has read on the device (not the full estimate alone)
									</span>
								</div>
								{isTargetedImport ? (
									<div>
										<span className="block text-orange-700">Preview estimate</span>
										<span className="font-semibold">{formatCount(activeImportTargetCount)}</span>
										<span className="mt-0.5 block text-[10px] text-orange-700/80">
											From Sync logs table (sample × totals) — may need more runs
										</span>
									</div>
								) : null}
								<div>
									<span className="block text-orange-700">Already on device scan</span>
									<span className="font-semibold">{formatCount(importJobProgress.alreadySaved || 0)}</span>
								</div>
								{isTargetedImport ? (
									<div>
										<span className="block text-orange-700">Device total</span>
										<span className="font-semibold">{formatOptionalCount(importJobProgress.sourceTotal)}</span>
									</div>
								) : null}
								<div>
									<span className="block text-orange-700">Skipped</span>
									<span className="font-semibold">{formatCount(importJobProgress.skipped)}</span>
									<span className="block text-[10px] text-orange-700/80">No employee number</span>
								</div>
								<div>
									<span className="block text-orange-700">Device</span>
									<span className="font-semibold">{activeImportJob.deviceName}</span>
								</div>
								<div>
									<span className="block text-orange-700">Run state</span>
									<span className="font-semibold">
										{importJobProgress.status === "cancelled"
											? "Cancelled; ready to retry"
											: importJobProgress.status === "processing"
											? importJobProgress.cancelRequested
												? "Cancel requested"
												: "Background sync active"
											: importJobProgress.status === "completed"
												? "Complete"
												: "Retry after review"}
									</span>
								</div>
							</div>
							{activeImportJobSummary ? (
								<p className="mt-3 text-xs opacity-90">{activeImportJobSummary}</p>
							) : null}
							{importJobProgress.message ? (
								<p className="mt-2 text-xs opacity-90">{importJobProgress.message}</p>
							) : null}
						</div>
					) : (
						<div className="min-h-[230px] rounded-lg border border-orange-200 bg-orange-50 p-4">
							<div className="flex items-center gap-2 text-sm font-medium text-orange-900">
								<Loader2 className="h-4 w-4 animate-spin" />
								Loading device sync status...
							</div>
						</div>
					)}

					<div className="flex flex-col-reverse gap-2 border-t pt-2 sm:flex-row sm:justify-end">
						<Button
							type="button"
							variant="outline"
							onClick={() => setShowImportProgressModal(false)}>
							Close
						</Button>
						{isImportProcessing ? (
							<Button
								type="button"
								variant="outline"
								className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
								disabled={cancelDeviceImportJob.isPending || isImportCancelRequested}
								onClick={requestCancelActiveImportJob}>
								{cancelDeviceImportJob.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<XCircle className="h-4 w-4" />
								)}
								{cancelDeviceImportJob.isPending
									? "Cancelling..."
									: isImportCancelRequested
										? "Cancel requested"
										: "Cancel sync"}
							</Button>
						) : null}
						{importJobProgress && importJobProgress.status !== "processing" ? (
							<Button
								type="button"
								className="gap-2 bg-orange-500 text-white hover:bg-orange-600"
								disabled={hikvisionImport.isPending}
								onClick={retryActiveImportJob}>
								{hikvisionImport.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<RefreshCw className="h-4 w-4" />
								)}
								{hikvisionImport.isPending ? "Starting..." : "Retry gap sync"}
							</Button>
						) : null}
						{importJobProgress && importJobProgress.status !== "processing" ? (
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setActiveImportJob(null);
									setShowImportProgressModal(false);
								}}>
								Dismiss status
							</Button>
						) : null}
					</div>
				</div>
			</Modal>

			<Modal
				open={action === "view-event"}
				onOpenChange={(open) => {
					if (!open) closeEventDetails();
				}}
				title="Device event details"
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
										<span>{formatDeviceEventPersonRef(activeEvent.employeeNo)}</span>
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

						<div className="grid gap-3 md:grid-cols-4">
							<div className="rounded-lg border border-slate-200 bg-white p-3">
								<div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
									<BadgeCheck className="h-3.5 w-3.5" />
									Event
								</div>
								<p className="mt-2 text-sm font-semibold text-slate-950">
									{activeEvent.eventLabel || "Device event"}
								</p>
								<div className="mt-2 space-y-1 text-xs text-slate-500">
									<p>Event category: {formatEventTaxonomyToken(activeEvent.eventCategory || "UNKNOWN_VENDOR")}</p>
									<p>Event action: {formatEventTaxonomyToken(activeEvent.eventAction || "UNKNOWN")}</p>
									<p>Event confidence: {formatEventTaxonomyToken(activeEvent.capabilityConfidence || "UNKNOWN")}</p>
								</div>
							</div>
							<div className="rounded-lg border border-slate-200 bg-white p-3">
								<div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
									<Clock className="h-3.5 w-3.5" />
									Event time
								</div>
								<p className="mt-2 text-sm font-semibold text-slate-950">
									{formatEventTime(activeEvent.eventTime)}
								</p>
								<p className="mt-1 text-xs text-slate-500">
									Received {formatEventTime(activeEvent.receivedAt || activeEvent.eventTime)}
								</p>
							</div>
							<div className="rounded-lg border border-slate-200 bg-white p-3">
								<div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
									<BadgeCheck className="h-3.5 w-3.5" />
									HRIS result
								</div>
								<p className="mt-2 text-sm font-semibold text-slate-950">
									{activeEvent.processingLabel || formatBusinessStatus(activeEvent.status)}
								</p>
								<p className="mt-1 text-xs text-slate-500">
									Attendance {activeEvent.attendanceId ? activeEvent.attendanceId : "not created yet"}
								</p>
							</div>
							<div className="rounded-lg border border-slate-200 bg-white p-3">
								<div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
									<Wifi className="h-3.5 w-3.5" />
									Runtime path
								</div>
								<p className="mt-2 text-sm font-semibold text-slate-950">
									{activeEvent.transportLabel || formatEventSource(activeEvent.source)}
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
										["Evidence", getOptionLabel(evidenceSourceOptions, activeEvent.evidenceSource || "UNKNOWN")],
										["Direct evidence", activeEvent.directDeviceEvidence ? "Yes" : "No"],
										["Vendor action", activeEvent.payload?.vendorAction || activeEvent.payload?.actionCode || activeEvent.payload?.minor || "-"],
										["Raw device time", activeEvent.payload?.rawDeviceTime || activeEvent.payload?.time || activeEvent.payload?.dateTime || "-"],
										["Operator", activeEvent.payload?.operator || activeEvent.payload?.userName || "-"],
										["Remote host", activeEvent.payload?.remoteHost || activeEvent.payload?.rawAlarm?.remoteHost || "-"],
										["Correlation", activeEvent.payload?.correlationId || activeEvent.payload?.runId || activeEvent.payload?.jobId || "-"],
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

						<div className="space-y-2 border-t border-slate-200 pt-4">
							<h3 className="text-sm font-semibold text-slate-950">Raw payload</h3>
							<pre className="max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
								{JSON.stringify(activeEvent.payload || {}, null, 2)}
							</pre>
						</div>
					</div>
				) : (
					<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
						This event is not in the current table page. Refresh the saved view or open it from the row again.
					</div>
				)}
			</Modal>
		</div>
	);
}
