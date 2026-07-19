import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { Select } from "~/components/atoms/Select";
import { SearchableSelect } from "~/components/ui/searchable-select";
import { formatDateTime } from "~/lib/utils/text-utils";
import type { Column } from "~/components/atoms/DataTable";
import {
	Eye,
	UserPlus,
	MoreVertical,
	ArrowLeft,
	RefreshCw,
	Link2,
	Unlink,
	FileJson,
	FileSpreadsheet,
	Download,
	Upload,
	Lock,
	Loader2,
	Activity,
	Clock3,
	XCircle,
	Power,
	Wifi,
	WifiOff,
	AlertTriangle,
	HelpCircle,
	CheckCircle2,
	Search,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useEmployee, useEmployees } from "~/lib/hooks/useEmployees";
import {
	useDevices,
	useDeviceLiveReadiness,
	useDeviceSyncPreview,
	useDeviceSyncRuns,
	useDeviceActivity,
	useDeviceUsers,
	useImportDeviceEnrollment,
	useHikvisionListenerStatus,
	useControlHikvisionListener,
	useLinkDeviceUser,
	useStartDeviceUserSyncJob,
	useDeviceUserSyncJob,
	useCancelDeviceUserSyncJob,
	usePlanHikvisionSdkUserMerge,
	useStartHikvisionSdkUserMergeJob,
	useHikvisionSdkUserMergeJob,
	useSyncDeviceUsers,
	usePreviewDeviceUserExport,
	useExportDeviceUsers,
	usePreviewDeviceUserImport,
	useExecuteDeviceUserImport,
	useUnlinkDeviceUser,
} from "~/lib/hooks/useDevices";
import { useHikvisionDeviceUsers } from "~/lib/hooks/use-hikvision";
import { useQueryClient } from "@tanstack/react-query";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { DeviceLiveReadinessStrip } from "~/components/molecules/DeviceLiveReadinessStrip";
import {
	DEVICE_LIVE_KEEP_READY_INTERVAL_MS,
	readDeviceLiveKeepReady,
	writeDeviceLiveKeepReady,
} from "~/lib/device-live-keep-ready";
import type { HikvisionUserInfo } from "~/types/hikvision";
import deviceService, {
	type DeviceSyncPreviewRow,
	type DeviceUser,
	type DeviceUserCredentialSummary,
	type DeviceUserSyncJobProgress,
	type DeviceUserMergeJobProgress,
	type DeviceUserSyncMode,
	type DeviceUserMergeField,
	type DeviceUserMergePlanResponse,
	type DeviceUserExportPayload,
	type DeviceUserExportSelection,
	type DeviceUserImportPreviewResponse,
	type DeviceUserImportExecuteResponse,
} from "~/services/devices.service";
import type { Employee } from "~/services/employees.service";

interface EnrollFormData {
	deviceId: string;
	deviceUserId: string;
}

interface DeviceEnrollmentPanelProps {
	embedded?: boolean;
	mode?: "sync-review" | "device-users" | "sdk-merge";
}

type SyncCenterDeviceItem = {
	device: any;
	preview?: DeviceSyncPreviewRow;
	vendor: string;
	status: string;
};

type VisibleDeviceUserRow = {
	key: string;
	vendorUserId: string;
	employeeNo?: string | null;
	displayName?: string | null;
	userType?: string | null;
	status: DeviceUser["status"] | "SOURCE_ONLY" | "CHECKING_LINK" | "LINK_CHECK_FAILED";
	employeeId?: string | null;
	employee?: DeviceUser["employee"];
	lastSyncedAt?: string | null;
	rawPayload?: any;
	vendorMetadata?: any;
	hrisDeviceUser?: DeviceUser;
	sourceUser?: HikvisionUserInfo;
};

type DeviceUserSyncSummary = {
	totalSourceRecords?: number;
	importableRecords?: number;
	created?: number;
	updated?: number;
	linked?: number;
	unmatched?: number;
	conflict?: number;
	disabled?: number;
	skipped?: number;
	failed?: number;
};

type BulkDeviceUserSyncState = {
	open: boolean;
	status: "idle" | "review" | "starting" | "error";
	message: string;
	lastProgress?: DeviceUserSyncJobProgress | null;
};

type SdkMergeFilter = "all" | "missing" | "decision" | "fingerprint" | "face" | "card" | "ready";
type SdkMergeListMode = "unique" | "records" | "review" | "writes" | "issues";
type SdkMergeRowAction = "copy" | "choose-richest" | "keep" | "details";
type SdkMergeCredentialKind = "fingerprint" | "face" | "card";
type SdkMergeIssueRow = {
	id: string;
	filter: SdkMergeFilter;
	userKey: string;
	user: DeviceUserMergePlanResponse["plan"]["users"][number];
	targetDeviceId?: string;
	targetDeviceName?: string;
	sourceDeviceId?: string;
	sourceDeviceName?: string;
	vendorUserId: string;
	personLabel: string;
	issueLabel: string;
	missingLabel: string;
	dataLabel: string;
	recommendedAction: string;
	primaryAction: SdkMergeRowAction;
	conflictField?: DeviceUserMergeField;
	conflictFields?: DeviceUserMergeField[];
	relatedDeviceIds?: string[];
	richestRecord?: any;
	targetRecord?: any;
};

type SdkMergeCredentialPickerState = {
	rowId: string;
	kind: SdkMergeCredentialKind;
} | null;
type SdkMergeSourceReviewState = {
	rowId: string;
} | null;
type SdkMergeCredentialTruth = {
	present: number;
	expected: number;
	connectedDevices: string[];
	missingDevices: string[];
};

const mergeNaturalCollator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

const mergeFieldLabel = (field: string) =>
	(
		({
			vendorUserId: "User ID",
			employeeNo: "Employee number",
			employeeId: "HRIS employee",
			displayName: "Name",
			status: "Status",
			validFrom: "Valid from",
			validTo: "Valid to",
			doorRight: "Door access",
			accessPlan: "Access plan",
			face: "Face data",
			fingerprint: "Fingerprint data",
			card: "Card data",
		}) as Record<string, string>
	)[field] || field;

const mergeCredentialCount = (record: any, kind: "fingerprint" | "face" | "card") => {
	const raw = record?.rawPayload || {};
	const keys =
		kind === "fingerprint"
			? ["numOfFP", "fingerprintCount", "fingerprints"]
			: kind === "face"
				? ["numOfFace", "faceCount", "faces"]
				: ["numOfCard", "cardCount", "cards"];
	for (const key of keys) {
		const value = raw[key];
		if (Array.isArray(value)) return value.length;
		if (Number.isFinite(Number(value))) return Number(value);
	}
	return 0;
};

const mergeRecordValue = (record: any, field: DeviceUserMergeField) => {
	if (field === "fingerprint" || field === "face" || field === "card") {
		return mergeCredentialCount(record, field);
	}
	return record?.[field];
};

const mergeCredentialTruth = (
	user: DeviceUserMergePlanResponse["plan"]["users"][number],
	devices: DeviceUserMergePlanResponse["plan"]["devices"],
	kind: SdkMergeCredentialKind,
): SdkMergeCredentialTruth => {
	const recordsByDevice = new Map(
		(user.records || []).map((record: any) => [String(record.deviceId), record]),
	);
	const connectedDevices: string[] = [];
	const missingDevices: string[] = [];

	for (const device of devices || []) {
		const deviceId = String(device.id || "");
		const deviceName = device.name || device.address || deviceId;
		const record = recordsByDevice.get(deviceId);
		if (record && mergeCredentialCount(record, kind) > 0) {
			connectedDevices.push(deviceName);
		} else {
			missingDevices.push(deviceName);
		}
	}

	return {
		present: connectedDevices.length,
		expected: (devices || []).length,
		connectedDevices,
		missingDevices,
	};
};

const mergeValueIsPopulated = (value: unknown) => {
	if (value === null || value === undefined) return false;
	if (typeof value === "string") return value.trim().length > 0;
	if (Array.isArray(value)) return value.length > 0;
	return true;
};

const mergeRecordRichnessScore = (record: any) => {
	const credentials =
		mergeCredentialCount(record, "fingerprint") * 6 +
		mergeCredentialCount(record, "face") * 4 +
		mergeCredentialCount(record, "card") * 3;
	const fields = (
		[
			"displayName",
			"employeeNo",
			"employeeId",
			"validFrom",
			"validTo",
			"doorRight",
			"accessPlan",
		] as DeviceUserMergeField[]
	).filter((field) => mergeValueIsPopulated(mergeRecordValue(record, field))).length;
	return credentials + fields;
};

const mergeDeviceName = (
	devices: DeviceUserMergePlanResponse["plan"]["devices"],
	deviceId?: string,
) => {
	const device = devices.find((item) => item.id === deviceId);
	return device?.name || device?.address || deviceId || "-";
};

const mergePersonLabel = (user: DeviceUserMergePlanResponse["plan"]["users"][number]) =>
	user.employee?.fullName ||
	user.employee?.employeeId ||
	user.records.find((record: any) => String(record.displayName || "").trim())?.displayName ||
	`User ${user.vendorUserIds.join(", ") || user.key}`;

const mergeVendorUserId = (user: DeviceUserMergePlanResponse["plan"]["users"][number]) =>
	user.vendorUserIds[0] ||
	String(
		user.records.find((record: any) => String(record.vendorUserId || "").trim())
			?.vendorUserId || "",
	).trim() ||
	"-";

const mergeFieldValueLabel = (value: unknown) => {
	if (!mergeValueIsPopulated(value)) return "missing";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
};

const mergeMetricValue = (value: unknown) => {
	if (value === null || value === undefined || value === "") return "-";
	const numberValue = Number(value);
	if (Number.isFinite(numberValue)) return numberValue.toLocaleString();
	return String(value);
};

const mergePlural = (count: number, singular: string, plural = `${singular}s`) =>
	`${mergeMetricValue(count)} ${count === 1 ? singular : plural}`;

const mergeDefinedDeviceIds = (deviceIds: Array<string | undefined>) =>
	deviceIds.filter((deviceId): deviceId is string => Boolean(deviceId));

const mergeCredentialSummaryLabel = (record: any) =>
	`Finger ${mergeMetricValue(mergeCredentialCount(record, "fingerprint"))}, Face ${mergeMetricValue(mergeCredentialCount(record, "face"))}, Card ${mergeMetricValue(mergeCredentialCount(record, "card"))}`;

const mergeRecommendationReason = (row: SdkMergeIssueRow) => {
	const sourceSummary = mergeCredentialSummaryLabel(row.richestRecord);
	if (row.filter === "decision") {
		return `Recommended source: ${row.sourceDeviceName || "selected source"}. It has the strongest combined biometric and identity completeness score for this ID (${sourceSummary}).`;
	}
	if (row.filter === "fingerprint" || row.filter === "face" || row.filter === "card") {
		return `Recommended source: ${row.sourceDeviceName || "selected source"}. It has more ${mergeFieldLabel(row.filter).toLowerCase()} than the compared record (${sourceSummary}).`;
	}
	if (row.filter === "missing") {
		return `Recommended source: ${row.sourceDeviceName || "selected source"}. The target device is missing this user, so copy from the richest available record (${sourceSummary}).`;
	}
	return row.recommendedAction;
};

const compareSdkMergeRowsByVendorId = (left: SdkMergeIssueRow, right: SdkMergeIssueRow) => {
	const leftId = String(left.vendorUserId || "");
	const rightId = String(right.vendorUserId || "");
	const leftNumber = Number(leftId);
	const rightNumber = Number(rightId);
	if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
		return leftNumber - rightNumber;
	}
	const byVendorId = mergeNaturalCollator.compare(leftId, rightId);
	if (byVendorId !== 0) return byVendorId;
	const byPerson = mergeNaturalCollator.compare(left.personLabel || "", right.personLabel || "");
	if (byPerson !== 0) return byPerson;
	return mergeNaturalCollator.compare(left.id, right.id);
};

type ActiveDeviceUserSyncJob = {
	jobId: string;
};

type CopyDeviceUserState = {
	open: boolean;
	sourceDeviceUser: VisibleDeviceUserRow | null;
	targetDeviceId: string;
	applyToAllPeers: boolean;
	includeFingerprints: boolean;
	includeFaceRecognition: boolean;
	successfulTargets: Array<{ id: string; label: string }>;
	failedTargets: Array<{ id: string; label: string; error: string }>;
};

type DeviceUserExportFormat = "csv" | "excel" | "json";
type DeviceUserImportFormat = "csv" | "json";
const DEVICE_USER_BIOMETRIC_CSV_COLUMNS = [
	"fingerprintTemplate",
	"faceTemplate",
] as const;
const DEVICE_USER_CSV_NO_PLAINTEXT_POLICY = "no_plaintext_biometric_templates";
const DEVICE_USER_SPREADSHEET_TEMPLATE_PREFIX = "encrypted:v2:";

type DeviceUserPeerTallyRow = {
	deviceId: string;
	deviceName: string;
	address: string;
	isCurrentDevice: boolean;
	found: boolean;
	status: string;
	fingerprintCount: number;
	cardCount: number;
	faceCount: number;
	employeeLabel: string;
	lastSyncedAt?: string | null;
};

const DEVICE_USER_SYNC_JOB_STORAGE_KEY = "hris.device-user-sync-job";
const DEVICE_USER_SYNC_PROCESSING_STALE_MS = 30 * 60 * 1000;
const DEFAULT_BULK_DEVICE_USER_SYNC_MODE: DeviceUserSyncMode = "full_refresh";
const formatDeviceUserSyncJobId = (value?: string | null) => {
	if (!value) return "No job id";
	return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
};
const getDeviceUserSyncProgressTime = (progress?: DeviceUserSyncJobProgress | null) => {
	const value = progress?.updatedAt || progress?.completedAt || progress?.startedAt || null;
	if (!value) return null;
	const time = new Date(value).getTime();
	return Number.isFinite(time) ? time : null;
};
const isDeviceUserSyncProgressFresh = (progress?: DeviceUserSyncJobProgress | null) => {
	if (progress?.stale) return false;
	if (!progress || progress.status !== "processing") return true;
	const lastProgressAt = getDeviceUserSyncProgressTime(progress);
	if (!lastProgressAt) return false;
	return Date.now() - lastProgressAt <= DEVICE_USER_SYNC_PROCESSING_STALE_MS;
};
const formatDeviceUserSyncElapsed = (startedAt?: string | null, completedAt?: string | null) => {
	if (!startedAt) return "Not recorded";
	const start = new Date(startedAt).getTime();
	const end = completedAt ? new Date(completedAt).getTime() : Date.now();
	if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "Not recorded";
	const totalSeconds = Math.floor((end - start) / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
};
export function DeviceEnrollmentPanel({
	embedded = false,
	mode = "sync-review",
}: DeviceEnrollmentPanelProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const location = useLocation();

	const isConfigurationEnrollment = location.pathname.startsWith("/admin/configuration/devices");
	const devicesPath = isConfigurationEnrollment
		? "/admin/configuration/devices"
		: "/admin/devices/manage";
	const actionParamName = embedded ? "enrollmentAction" : "action";
	const idParamName = embedded ? "employeeId" : "id";
	const searchParamName = embedded ? "enrollmentSearch" : "search";
	const pageParamName = embedded ? "enrollmentPage" : "page";
	const limitParamName = embedded ? "enrollmentLimit" : "limit";

	// Get search and filter params from URL
	const searchQuery = searchParams.get(searchParamName) || undefined;
	const pageParam = Number(searchParams.get(pageParamName)) || 1;
	const limitParam = Number(searchParams.get(limitParamName)) || 10;

	const { data: employeesData, isLoading } = useEmployees({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		document: true,
		pagination: true,
		count: true,
	});
	const employeesPayload =
		(employeesData as any)?.employees || (employeesData as any)?.pagination
			? (employeesData as any)
			: Array.isArray((employeesData as any)?.data)
				? {
						employees: (employeesData as any).data,
						pagination: (employeesData as any)?.pagination,
					}
				: (employeesData as any)?.data || {};
	const items: Employee[] = employeesPayload?.employees || [];
	const pagination = employeesPayload?.pagination;

	// Deep link URL params
	const action = searchParams.get(actionParamName);
	const id = searchParams.get(idParamName);

	const activeEmployeeId = action === "enroll" || action === "view" ? id : null;

	const { data: activeEmployee, isLoading: isLoadingEmployee } = useEmployee(
		activeEmployeeId || "",
	);

	const queryClient = useQueryClient();

	// Fetch devices for enrollment
	const {
		data: devicesData,
		isLoading: isLoadingDevices,
		isError: isDevicesError,
		error: devicesLoadError,
	} = useDevices({
		limit: 100,
		document: "true",
	});
	const devices = (devicesData as any)?.devices || [];
	const requestedDeviceId = String(searchParams.get("deviceId") || "").trim();
	const shouldAutoSelectFirstDevice = action === "enroll" || action === "import";
	const selectedDeviceId =
		requestedDeviceId || (shouldAutoSelectFirstDevice ? devices[0]?.id || "" : "");
	const selectedDevice = devices.find((device: any) => device.id === selectedDeviceId);
	const activePanelParam =
		searchParams.get("syncPanel") || (mode === "device-users" ? "users" : "overview");
	const activePanel = ["overview", "users", "logs", "runs"].includes(activePanelParam)
		? activePanelParam
		: "overview";
	const deviceUserStatus = searchParams.get("deviceUserStatus") || "all";
	const deviceUserSearch = searchParams.get("deviceUserSearch") || "";
	const [summaryDeviceSearch, setSummaryDeviceSearch] = useState("");
	// Declared early so listener query can poll only while the details modal is open.
	const [isListenerDetailsOpen, setIsListenerDetailsOpen] = useState(false);
	const deviceUserView = searchParams.get("deviceUserView") || "shown";
	// Deep-link from Device Events "Device user" / person click: open details for this vendor user id.
	const deviceUserDetailsParam = String(searchParams.get("deviceUserDetails") || "").trim();
	const deviceUserPage = Math.max(Number(searchParams.get("deviceUserPage") || 1), 1);
	const deviceUserLimit = Math.min(
		Math.max(Number(searchParams.get("deviceUserLimit") || 8), 1),
		25,
	);
	const mergeFilterParam = searchParams.get("mergeFilter") as SdkMergeFilter | null;
	const sdkMergeFilter: SdkMergeFilter = [
		"missing",
		"decision",
		"fingerprint",
		"face",
		"card",
		"ready",
	].includes(mergeFilterParam || "")
		? (mergeFilterParam as SdkMergeFilter)
		: "all";
	const selectedMergeDeviceId = searchParams.get("mergeDeviceId") || "all";
	const selectedMergeUserKey = searchParams.get("mergeUser") || "";
	const sdkMergeSearch = searchParams.get("mergeSearch") || "";
	const sdkMergeJobIdParam = searchParams.get("mergeJobId") || "";
	const sdkMergeListModeParam = searchParams.get("mergeList") as SdkMergeListMode | null;
	const sdkMergeListMode: SdkMergeListMode = [
		"unique",
		"records",
		"review",
		"writes",
		"issues",
	].includes(sdkMergeListModeParam || "")
		? (sdkMergeListModeParam as SdkMergeListMode)
		: "unique";
	const {
		data: syncPreview,
		isLoading: isLoadingSyncPreview,
		isFetching: isFetchingSyncPreview,
		refetch: refetchSyncPreview,
	} = useDeviceSyncPreview(
		{ deviceId: activePanel === "overview" ? "all" : selectedDeviceId || "all" },
		// Only while Sync Center panels that need counts are visible — no background poll.
		activePanel === "overview" || activePanel === "users" || Boolean(selectedDeviceId),
		{ refetchIntervalMs: false, staleTime: 60 * 1000 },
	);
	const {
		data: syncRunsData,
		isLoading: isLoadingSyncRuns,
		refetch: refetchSyncRuns,
	} = useDeviceSyncRuns(selectedDeviceId, { limit: 12 }, Boolean(selectedDeviceId));
	const {
		data: deviceActivity,
		isLoading: isLoadingDeviceActivity,
		refetch: refetchDeviceActivity,
	} = useDeviceActivity(
		selectedDeviceId,
		{ limit: 12 },
		Boolean(selectedDeviceId) && (activePanel === "logs" || activePanel === "runs"),
		{ refetchInterval: activePanel === "logs" || activePanel === "runs" ? 5000 : false },
	);
	const {
		data: hikvisionListenerStatus,
		isLoading: isLoadingHikvisionListenerStatus,
		error: hikvisionListenerStatusError,
		refetch: refetchHikvisionListenerStatus,
	} = useHikvisionListenerStatus(
		// Overview badge once; poll only while listener details modal is open.
		activePanel === "overview" || isListenerDetailsOpen,
		{
			staleTime: isListenerDetailsOpen ? 8 * 1000 : 60 * 1000,
			refetchInterval: isListenerDetailsOpen ? 12 * 1000 : false,
		},
	);
	const hikvisionListenerControl = useControlHikvisionListener();
	const {
		data: liveReadiness,
		isLoading: isLiveReadinessLoading,
		error: liveReadinessError,
		refetch: refetchLiveReadiness,
	} = useDeviceLiveReadiness(true, {
		refetchInterval: 45_000,
		staleTime: 20_000,
	});
	const [isProvingLivePath, setIsProvingLivePath] = useState(false);
	const [keepLiveReady, setKeepLiveReady] = useState(false);
	useEffect(() => {
		setKeepLiveReady(readDeviceLiveKeepReady());
		const onStorage = (event: StorageEvent) => {
			if (event.key === "project-truth.device-live-keep-ready") {
				setKeepLiveReady(event.newValue === "1");
			}
		};
		const onCustom = (event: Event) => {
			const detail = (event as CustomEvent<{ on?: boolean }>).detail;
			if (typeof detail?.on === "boolean") setKeepLiveReady(detail.on);
		};
		window.addEventListener("storage", onStorage);
		window.addEventListener("project-truth:device-live-keep-ready", onCustom as EventListener);
		return () => {
			window.removeEventListener("storage", onStorage);
			window.removeEventListener(
				"project-truth:device-live-keep-ready",
				onCustom as EventListener,
			);
		};
	}, []);
	const setKeepLiveReadyPersisted = (on: boolean) => {
		setKeepLiveReady(on);
		writeDeviceLiveKeepReady(on);
		if (on) {
			toast.success("Keep ready ON", {
				id: "device-live-keep-ready",
				description:
					"Stays quiet while green. Only auto-repairs if the live path goes red.",
			});
		} else {
			toast.message("Keep ready OFF", { id: "device-live-keep-ready" });
		}
	};
	const [isQuietKeepReadyRepair, setIsQuietKeepReadyRepair] = useState(false);
	const proveLivePath = async (options?: { quiet?: boolean; forceReArm?: boolean }) => {
		const quiet = options?.quiet === true;
		const forceReArm = options?.forceReArm === true;
		if (quiet) setIsQuietKeepReadyRepair(true);
		else setIsProvingLivePath(true);
		try {
			const result = await deviceService.proveDeviceLivePath({ forceReArm });
			await refetchLiveReadiness();
			const readinessGreen =
				result.readiness?.overall === "green" &&
				result.readiness?.safeToTap === true &&
				result.readiness?.safeToEnroll === true;
			const pathOk = result.proven === true || readinessGreen;
			if (pathOk) {
				if (!quiet) {
					toast.success("Safe to enroll — live path proved", {
						id: "device-live-path-prove",
						description:
							result.readiness?.headline ||
							"DB + live capture + proof look healthy. Create/enroll should stream realtime.",
					});
				}
			} else if (!quiet) {
				toast.warning("Not fully ready to enroll", {
					id: "device-live-path-prove",
					description:
						result.readiness?.headline ||
						result.operatorHint ||
						"Fix red readiness checks first.",
				});
			}
			return { ...result, proven: pathOk };
		} catch (error: any) {
			if (!quiet) {
				toast.error(error?.message || "Live path prove failed", {
					id: "device-live-path-prove",
				});
			}
			return null;
		} finally {
			if (quiet) setIsQuietKeepReadyRepair(false);
			else setIsProvingLivePath(false);
		}
	};

	const keepReadyLastProveAtRef = useRef(0);
	useEffect(() => {
		if (!keepLiveReady) return;
		if (typeof window === "undefined") return;
		if (!liveReadiness) return;
		// Healthy ONLY when really receiving (1+). Armed-only is not enough.
		const pathHealthy =
			liveReadiness.database?.ok === true &&
			liveReadiness.listener?.receiving === true &&
			liveReadiness.overall === "green" &&
			liveReadiness.safeToEnroll === true;
		if (pathHealthy) return;
		const needsForceReArm = liveReadiness.listener?.receiving !== true;
		let cancelled = false;
		const run = () => {
			if (cancelled || isProvingLivePath || isQuietKeepReadyRepair) return;
			const now = Date.now();
			if (now - keepReadyLastProveAtRef.current < 120_000) return;
			keepReadyLastProveAtRef.current = now;
			void proveLivePath({ quiet: true, forceReArm: needsForceReArm });
		};
		const t = window.setTimeout(run, 2_000);
		const intervalId = window.setInterval(run, 120_000);
		return () => {
			cancelled = true;
			window.clearTimeout(t);
			window.clearInterval(intervalId);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		keepLiveReady,
		liveReadiness?.overall,
		liveReadiness?.safeToTap,
		liveReadiness?.safeToEnroll,
		liveReadiness?.database?.ok,
		liveReadiness?.listener?.running,
		liveReadiness?.listener?.receiving,
		liveReadiness?.listener?.armed,
		liveReadiness?.proof?.fresh,
		isProvingLivePath,
		isQuietKeepReadyRepair,
	]);
	const syncDeviceUsersMutation = useSyncDeviceUsers();
	const previewDeviceUserExportMutation = usePreviewDeviceUserExport();
	const exportDeviceUsersMutation = useExportDeviceUsers();
	const previewDeviceUserImportMutation = usePreviewDeviceUserImport();
	const executeDeviceUserImportMutation = useExecuteDeviceUserImport();
	const startDeviceUserSyncJobMutation = useStartDeviceUserSyncJob();
	const cancelDeviceUserSyncJobMutation = useCancelDeviceUserSyncJob();
	const planHikvisionSdkUserMergeMutation = usePlanHikvisionSdkUserMerge();
	const startHikvisionSdkUserMergeJobMutation = useStartHikvisionSdkUserMergeJob();
	const linkDeviceUserMutation = useLinkDeviceUser();
	const unlinkDeviceUserMutation = useUnlinkDeviceUser();
	const [deviceUserSyncState, setDeviceUserSyncState] = useState<{
		open: boolean;
		status: "idle" | "review" | "syncing" | "complete" | "error";
		message: string;
		summary?: DeviceUserSyncSummary;
	}>({
		open: false,
		status: "idle",
		message: "",
	});
	const [bulkDeviceUserSyncState, setBulkDeviceUserSyncState] = useState<BulkDeviceUserSyncState>(
		{
			open: false,
			status: "idle",
			message: "",
			lastProgress: null,
		},
	);
	const [bulkDeviceUserSyncMode, setBulkDeviceUserSyncMode] = useState<DeviceUserSyncMode>(
		DEFAULT_BULK_DEVICE_USER_SYNC_MODE,
	);
	const [sdkMergeState, setSdkMergeState] = useState<{
		open: boolean;
		status: "idle" | "loading" | "review" | "done" | "error";
		message: string;
		data?: DeviceUserMergePlanResponse;
		choices: Record<string, Record<string, "A" | "B" | "KEEP">>;
		applyAll?: "A" | "B";
	}>({ open: false, status: "idle", message: "", choices: {} });
	const [sdkMergeCredentialPicker, setSdkMergeCredentialPicker] =
		useState<SdkMergeCredentialPickerState>(null);
	const [sdkMergeSourceReview, setSdkMergeSourceReview] =
		useState<SdkMergeSourceReviewState>(null);
	const [selectedSdkMergeUserKeys, setSelectedSdkMergeUserKeys] = useState<Record<string, boolean>>(
		{},
	);
	const [sdkMergeJobId, setSdkMergeJobId] = useState<string | null>(sdkMergeJobIdParam || null);
	const [sdkMergeLastJob, setSdkMergeLastJob] = useState<DeviceUserMergeJobProgress | null>(null);
	const [sdkMergeHandledJobId, setSdkMergeHandledJobId] = useState<string | null>(null);
	const [sdkMergeDismissedJobId, setSdkMergeDismissedJobId] = useState<string | null>(null);
	const [sdkMergePreviewOnly, setSdkMergePreviewOnly] = useState(true);
	const sdkMergePage = Math.max(Number(searchParams.get("mergePage") || 1), 1);
	const [activeDeviceUserSyncJob, setActiveDeviceUserSyncJob] =
		useState<ActiveDeviceUserSyncJob | null>(() => {
			try {
				if (typeof window === "undefined") return null;
				const raw = window.localStorage.getItem(DEVICE_USER_SYNC_JOB_STORAGE_KEY);
				return raw ? (JSON.parse(raw) as ActiveDeviceUserSyncJob) : null;
			} catch {
				return null;
			}
		});
	const {
		data: deviceUserSyncJobProgress,
		dataUpdatedAt: deviceUserSyncJobUpdatedAt,
		isError: isDeviceUserSyncJobError,
	} = useDeviceUserSyncJob(
			activeDeviceUserSyncJob?.jobId,
			Boolean(activeDeviceUserSyncJob?.jobId),
		);
	const { data: sdkMergeJobProgress, isError: isSdkMergeJobError } = useHikvisionSdkUserMergeJob(
		sdkMergeJobId,
		Boolean(sdkMergeJobId),
	);
	const deviceUserSyncJobStatus = deviceUserSyncJobProgress?.status;
	const [detailsDeviceUser, setDetailsDeviceUser] = useState<VisibleDeviceUserRow | null>(null);
	const [detailsPhotoUrl, setDetailsPhotoUrl] = useState<string | null>(null);
	const [detailsPhotoState, setDetailsPhotoState] = useState<
		"idle" | "loading" | "ready" | "error"
	>("idle");
	const [detailsPhotoError, setDetailsPhotoError] = useState("");
	const [detailsPeerTallyRows, setDetailsPeerTallyRows] = useState<DeviceUserPeerTallyRow[]>([]);
	const [detailsPeerTallyState, setDetailsPeerTallyState] = useState<
		"idle" | "loading" | "ready" | "error"
	>("idle");
	const [detailsPeerTallyError, setDetailsPeerTallyError] = useState("");
	const [linkTarget, setLinkTarget] = useState<VisibleDeviceUserRow | null>(null);
	const [unlinkTarget, setUnlinkTarget] = useState<VisibleDeviceUserRow | null>(null);
	const [copyDeviceUserState, setCopyDeviceUserState] = useState<CopyDeviceUserState>({
		open: false,
		sourceDeviceUser: null,
		targetDeviceId: "",
		applyToAllPeers: false,
		includeFingerprints: true,
		includeFaceRecognition: true,
		successfulTargets: [],
		failedTargets: [],
	});
	const [deviceUserExportState, setDeviceUserExportState] = useState<{
		open: boolean;
		selection: DeviceUserExportSelection;
		includeCards: boolean;
		includeFingerprints: boolean;
		includeFaces: boolean;
		encryptedBiometricBundle: boolean;
		refreshBiometricBundle: boolean;
		biometricBundlePassphrase: string;
		format: DeviceUserExportFormat;
		preview: DeviceUserExportPayload | null;
		result: DeviceUserExportPayload | null;
	}>({
		open: false,
		selection: "currentPage",
		includeCards: true,
		includeFingerprints: true,
		includeFaces: true,
		encryptedBiometricBundle: true,
		refreshBiometricBundle: true,
		biometricBundlePassphrase: "",
		format: "csv",
		preview: null,
		result: null,
	});
	const [deviceUserImportState, setDeviceUserImportState] = useState<{
		open: boolean;
		format: DeviceUserImportFormat;
		fileName: string;
		rawText: string;
		payload: DeviceUserExportPayload | null;
		parseError: string;
		preview: DeviceUserImportPreviewResponse | null;
		result: DeviceUserImportExecuteResponse | null;
		confirmation: string;
		biometricTransferMode: "sdkPeerCopy" | "metadataOnly" | "encryptedBundle";
		biometricBundlePassphrase: string;
		runAsJob: boolean;
	}>({
		open: false,
		format: "csv",
		fileName: "",
		rawText: "",
		payload: null,
		parseError: "",
		preview: null,
		result: null,
		confirmation: "",
		biometricTransferMode: "sdkPeerCopy",
		biometricBundlePassphrase: "",
		runAsJob: true,
	});
	const [selectedExportVendorUserIds, setSelectedExportVendorUserIds] = useState<string[]>([]);
	const [isCopyDeviceUserSubmitting, setIsCopyDeviceUserSubmitting] = useState(false);
	const [copyDeviceUserStatusMessage, setCopyDeviceUserStatusMessage] = useState("");
	const [selectedEmployeeForLink, setSelectedEmployeeForLink] = useState("");

	const {
		data: allEmployeesData,
		isLoading: isLoadingEmployeeLinkOptions,
		error: employeeLinkOptionsError,
	} = useEmployees({
		limit: 1000,
		document: true,
		pagination: true,
	});
	const allEmployeesPayload =
		(allEmployeesData as any)?.employees || (allEmployeesData as any)?.pagination
			? (allEmployeesData as any)
			: Array.isArray((allEmployeesData as any)?.data)
				? {
						employees: (allEmployeesData as any).data,
						pagination: (allEmployeesData as any)?.pagination,
					}
				: (allEmployeesData as any)?.data || {};
	const allUsers =
		allEmployeesPayload?.employees
			?.map((employee: Employee) => ({
				id: employee.userId || employee.user?.id || employee.id,
				email: employee.user?.email || "",
				firstName: employee.person?.personalInfo?.firstName,
				lastName: employee.person?.personalInfo?.lastName,
			}))
			.filter((user: { id: string; email: string }) => user.id && user.email) || [];
	const getEmployeeDisplayName = (employee?: Employee | null) => {
		const firstName = employee?.person?.personalInfo?.firstName || "";
		const lastName = employee?.person?.personalInfo?.lastName || "";
		return (
			`${firstName} ${lastName}`.trim() ||
			employee?.user?.userName ||
			employee?.user?.email ||
			employee?.employeeId ||
			"Employee"
		);
	};
	const employeeLinkOptions =
		allEmployeesPayload?.employees?.map((employee: Employee) => ({
			value: employee.id,
			label: `${getEmployeeDisplayName(employee)} - ${employee.employeeId || "No employee ID"}`,
			description:
				[
					employee.deviceEmpId ? `Legacy device ID ${employee.deviceEmpId}` : null,
					employee.department?.name,
					employee.position?.title,
				]
					.filter(Boolean)
					.join(" - ") || undefined,
			badge: employee.employeeId || undefined,
		})) || [];

	const importEnrollmentMutation = useImportDeviceEnrollment();

	useEffect(() => {
		if (typeof window === "undefined") return;
		if (activeDeviceUserSyncJob) {
			window.localStorage.setItem(
				DEVICE_USER_SYNC_JOB_STORAGE_KEY,
				JSON.stringify(activeDeviceUserSyncJob),
			);
			return;
		}
		window.localStorage.removeItem(DEVICE_USER_SYNC_JOB_STORAGE_KEY);
	}, [activeDeviceUserSyncJob]);

	useEffect(() => {
		if (!activeDeviceUserSyncJob || !isDeviceUserSyncJobError) return;
		setActiveDeviceUserSyncJob(null);
		setBulkDeviceUserSyncState({
			open: true,
			status: "error",
			message:
				"Previous device-user sync status expired after an API restart or cleanup. You can rerun the refresh safely; per-device sync is retryable and durable Sync Runs remain available below.",
			lastProgress: null,
		});
		toast.warning("Previous device-user sync status expired", {
			id: "device-user-sync-progress",
			description: "Open Sync device users again to run the latest device-user refresh.",
		});
	}, [activeDeviceUserSyncJob, isDeviceUserSyncJobError]);

	useEffect(() => {
		if (!activeDeviceUserSyncJob || !deviceUserSyncJobProgress) return;
		if (isDeviceUserSyncProgressFresh(deviceUserSyncJobProgress)) return;
		setActiveDeviceUserSyncJob(null);
		setBulkDeviceUserSyncState((current) => ({
			...current,
			open: current.open,
			status: "error",
			message:
				"Previous device-user sync status stopped updating. Start Sync device users again when you want a fresh, triggered run.",
			lastProgress: null,
		}));
		toast.warning("Previous device-user sync status stopped updating", {
			id: "device-user-sync-progress",
			description: "No device-user sync is being shown as active until you trigger a fresh run.",
		});
	}, [activeDeviceUserSyncJob, deviceUserSyncJobProgress]);

	const fallbackDeviceUserId = String(
		activeEmployee?.deviceEmpId || activeEmployee?.employeeId || "",
	).trim();

	// Enroll form
	const { handleSubmit, reset, setValue, watch } = useForm<EnrollFormData>({
		defaultValues: {
			deviceId: "",
			deviceUserId: "",
		},
	});

	const watchedDeviceId = watch("deviceId");
	const watchedDeviceUserId = watch("deviceUserId");
	const sourceDeviceId =
		activePanel === "users" && selectedDeviceId
			? selectedDeviceId
			: watchedDeviceId || selectedDeviceId;
	const shouldFetchDeviceUsers =
		(watchedDeviceId && action === "enroll") ||
		action === "import" ||
		(activePanel === "users" && Boolean(selectedDeviceId)) ||
		(deviceUserExportState.open && Boolean(selectedDeviceId));
	const {
		data: deviceUsersData = [],
		isLoading: isLoadingDeviceUsers,
		isFetching: isFetchingDeviceUsers,
		error: sourceDeviceUsersError,
		refetch: refetchSourceDeviceUsers,
	} = useHikvisionDeviceUsers(sourceDeviceId, Boolean(shouldFetchDeviceUsers));
	const deviceUsers = useMemo(
		() => (shouldFetchDeviceUsers ? deviceUsersData : []),
		[deviceUsersData, shouldFetchDeviceUsers],
	);
	const isReadingDeviceUsers = isLoadingDeviceUsers || isFetchingDeviceUsers;
	const sourceVendorUserIds = useMemo(
		() =>
			Array.from(
				new Set(
					deviceUsers.map((user) => String(user.employeeNo || "").trim()).filter(Boolean),
				),
			),
		[deviceUsers],
	);
	const sourceVendorUserIdKey = sourceVendorUserIds.join("|");
	const sourceVendorUserIdsForQuery = useMemo(
		() => (sourceVendorUserIdKey ? sourceVendorUserIdKey.split("|") : []),
		[sourceVendorUserIdKey],
	);
	const hasSourceVendorUsers =
		(activePanel === "users" || deviceUserExportState.open) &&
		Boolean(selectedDeviceId) &&
		sourceVendorUserIdsForQuery.length > 0;
	const {
		data: sourceMatchedDeviceUsersData,
		isLoading: isLoadingSourceMatchedDeviceUsers,
		isFetching: isFetchingSourceMatchedDeviceUsers,
		isError: isSourceMatchedDeviceUsersError,
		refetch: refetchSourceMatchedDeviceUsers,
	} = useDeviceUsers(
		selectedDeviceId,
		{
			limit: Math.min(Math.max(sourceVendorUserIdsForQuery.length, 1), 100),
			vendorUserIds: sourceVendorUserIdsForQuery,
		},
		hasSourceVendorUsers,
	);
	const hasSourceMatchedDeviceUsersData = Boolean(sourceMatchedDeviceUsersData);
	const isCheckingSourceDeviceUserLinks =
		hasSourceVendorUsers &&
		!hasSourceMatchedDeviceUsersData &&
		(isLoadingSourceMatchedDeviceUsers || isFetchingSourceMatchedDeviceUsers);
	const shouldUseSourceScopedDeviceUsers =
		Boolean(selectedDeviceId) &&
		(activePanel === "users" || deviceUserExportState.open) &&
		!sourceDeviceUsersError &&
		!isSourceMatchedDeviceUsersError &&
		deviceUserStatus === "all" &&
		!deviceUserSearch &&
		deviceUserView !== "hris";
	const {
		data: dbDeviceUsers,
		isLoading: isLoadingDbDeviceUsers,
		refetch: refetchDbDeviceUsers,
	} = useDeviceUsers(
		selectedDeviceId,
		{
			limit: 50,
			status: deviceUserStatus,
			query: deviceUserSearch,
		},
		Boolean(selectedDeviceId) && (!shouldUseSourceScopedDeviceUsers || activePanel !== "users"),
	);
	const { data: deviceUserSummaryData, refetch: refetchDeviceUserSummary } = useDeviceUsers(
		selectedDeviceId,
		{
			limit: 1,
		},
		Boolean(selectedDeviceId) && (activePanel === "users" || deviceUserExportState.open),
	);
	const {
		data: openDbDeviceUsers,
		isLoading: isLoadingOpenDbDeviceUsers,
		refetch: refetchOpenDbDeviceUsers,
	} = useDeviceUsers(
		selectedDeviceId,
		{
			limit: 50,
			status: "UNMATCHED",
			query: deviceUserSearch,
		},
		Boolean(selectedDeviceId) &&
			activePanel === "users" &&
			deviceUserStatus === "all" &&
			!shouldUseSourceScopedDeviceUsers,
	);
	const sourceMatchedDeviceUsers = useMemo(() => {
		const nextMatches: Record<string, DeviceUser> = {};
		for (const deviceUser of sourceMatchedDeviceUsersData?.deviceUsers || []) {
			const vendorUserId = String(deviceUser.vendorUserId || "").trim();
			if (vendorUserId) nextMatches[vendorUserId] = deviceUser;
		}
		return nextMatches;
	}, [sourceMatchedDeviceUsersData?.deviceUsers]);
	useEffect(() => {
		if (!sdkMergeJobIdParam || sdkMergeJobIdParam === sdkMergeJobId) return;
		setSdkMergeJobId(sdkMergeJobIdParam);
	}, [sdkMergeJobId, sdkMergeJobIdParam]);
	useEffect(() => {
		if (!sdkMergeJobId || !isSdkMergeJobError) return;
		setSdkMergeLastJob((current) =>
			current && current.jobId === sdkMergeJobId
				? {
						...current,
						status: "failed",
						message:
							"Merge job status expired after an API restart or cleanup. Refresh the merge plan, then retry.",
						error: "Merge job status expired.",
						completedAt: current.completedAt || new Date().toISOString(),
					}
				: current,
		);
		setSdkMergeJobId(null);
		setSearchParams((previous) => {
			const next = new URLSearchParams(previous);
			next.delete("mergeJobId");
			return next;
		});
		toast.warning("Merge job status expired", {
			description: "Refresh the merge plan before retrying.",
		});
	}, [isSdkMergeJobError, sdkMergeJobId]);
	useEffect(() => {
		if (!sdkMergeJobProgress) return;
		setSdkMergeLastJob(sdkMergeJobProgress);
		setSdkMergeState((current) => ({
			...current,
			open: true,
			status:
				sdkMergeJobProgress.status === "completed"
					? "done"
					: sdkMergeJobProgress.status === "failed"
						? "error"
						: "review",
			message: sdkMergeJobProgress.message || current.message,
		}));
		if (sdkMergeJobProgress.status === "processing") return;
		if (sdkMergeHandledJobId === sdkMergeJobProgress.jobId) return;
		setSdkMergeHandledJobId(sdkMergeJobProgress.jobId);
		void Promise.allSettled([
			refetchSyncPreview(),
			selectedDeviceId ? refetchSyncRuns() : Promise.resolve(),
			selectedDeviceId ? refetchSourceDeviceUsers() : Promise.resolve(),
			selectedDeviceId ? refetchDbDeviceUsers() : Promise.resolve(),
			selectedDeviceId ? refetchOpenDbDeviceUsers() : Promise.resolve(),
			selectedDeviceId ? refetchDeviceUserSummary() : Promise.resolve(),
			selectedDeviceId ? refetchSourceMatchedDeviceUsers() : Promise.resolve(),
		]);
		const deviceIds = sdkMergeState.data?.plan.deviceIds || [];
		if (deviceIds.length >= 2) {
			void planHikvisionSdkUserMergeMutation
				.mutateAsync({ deviceIds })
				.then((data) => {
					setSdkMergeState((current) => ({
						...current,
						data,
						status: sdkMergeJobProgress.status === "completed" ? "done" : "error",
						choices: {},
						applyAll: undefined,
					}));
				})
				.catch(() => undefined);
		}
		if (sdkMergeJobProgress.status === "completed") {
			toast.success("Device-user merge finished", {
				description: sdkMergeJobProgress.message || "Devices were reread after the merge.",
			});
		} else {
			toast.error("Device-user merge needs attention", {
				description:
					sdkMergeJobProgress.message ||
					"Review the failed rows, then retry from the refreshed plan.",
			});
		}
	}, [
		refetchDbDeviceUsers,
		refetchDeviceUserSummary,
		refetchOpenDbDeviceUsers,
		refetchSourceDeviceUsers,
		refetchSourceMatchedDeviceUsers,
		refetchSyncPreview,
		refetchSyncRuns,
		sdkMergeHandledJobId,
		sdkMergeJobProgress,
		sdkMergeState.data?.plan.deviceIds,
		selectedDeviceId,
	]);
	useEffect(() => {
		if (!deviceUserSyncJobStatus || deviceUserSyncJobStatus === "processing") return;
		if (deviceUserSyncJobProgress) {
			setBulkDeviceUserSyncState((current) => ({
				...current,
				open: true,
				status: "review",
				message: deviceUserSyncJobProgress.message || current.message,
				lastProgress: deviceUserSyncJobProgress,
			}));
		}
		if (activeDeviceUserSyncJob) {
			setActiveDeviceUserSyncJob(null);
		}
		void Promise.allSettled([
			refetchSyncPreview(),
			refetchSyncRuns(),
			selectedDeviceId ? refetchSourceDeviceUsers() : Promise.resolve(),
			selectedDeviceId ? refetchDbDeviceUsers() : Promise.resolve(),
			selectedDeviceId ? refetchOpenDbDeviceUsers() : Promise.resolve(),
			selectedDeviceId ? refetchDeviceUserSummary() : Promise.resolve(),
			selectedDeviceId ? refetchSourceMatchedDeviceUsers() : Promise.resolve(),
		]);
		if (deviceUserSyncJobStatus === "completed") {
			toast.success("Device users synced", {
				id: "device-user-sync-progress",
				description:
					deviceUserSyncJobProgress?.message ||
					"Configured devices were refreshed successfully.",
			});
		} else if (deviceUserSyncJobStatus === "cancelled") {
			toast.warning("Device-user sync cancelled", {
				id: "device-user-sync-progress",
				description:
					"The current refresh stopped. Retry will reread the latest device-user truth again.",
			});
		} else {
			toast.error("Device-user sync needs attention", {
				id: "device-user-sync-progress",
				description:
					deviceUserSyncJobProgress?.message ||
					"One or more devices failed during the device-user refresh.",
			});
		}
	}, [
		deviceUserSyncJobProgress?.message,
		deviceUserSyncJobStatus,
		refetchDbDeviceUsers,
		refetchDeviceUserSummary,
		refetchOpenDbDeviceUsers,
		refetchSourceDeviceUsers,
		refetchSourceMatchedDeviceUsers,
		refetchSyncPreview,
		refetchSyncRuns,
		activeDeviceUserSyncJob,
		selectedDeviceId,
	]);
	const deviceUserOptions = useMemo(() => {
		const options = deviceUsers
			.filter((user) => String(user.employeeNo || "").trim())
			.map((user) => ({
				value: String(user.employeeNo).trim(),
				label: `${user.employeeNo} - ${user.name || "Device user"}`,
			}));

		if (
			fallbackDeviceUserId &&
			!options.some((option) => option.value === fallbackDeviceUserId)
		) {
			options.unshift({
				value: fallbackDeviceUserId,
				label: `${fallbackDeviceUserId} - ${activeEmployee?.deviceEmpId ? "Biometric ID" : "Employee ID"}`,
			});
		}

		return options;
	}, [activeEmployee?.deviceEmpId, deviceUsers, fallbackDeviceUserId]);

	useEffect(() => {
		if (action !== "enroll" || !fallbackDeviceUserId) return;
		if (!String(watchedDeviceUserId || "").trim()) {
			setValue("deviceUserId", fallbackDeviceUserId);
		}
	}, [action, fallbackDeviceUserId, setValue, watchedDeviceUserId]);

	// Define table columns
	const columns: Column<Employee>[] = [
		{
			key: "employeeName",
			label: "Employee Name",
			width: "200px",
			render: (_value, item) => {
				return (
					<div className="min-w-0">
						<p className="truncate text-sm font-medium text-gray-900">
							{getEmployeeDisplayName(item)}
						</p>
						<p className="truncate text-xs text-gray-500">{item.employeeId}</p>
					</div>
				);
			},
		},
		{
			key: "department",
			label: "Department",
			width: "150px",
			render: (_value, item) => {
				const deptName = item.department?.name;
				return <span className="text-sm text-gray-600">{deptName || "N/A"}</span>;
			},
		},
		{
			key: "position",
			label: "Position",
			width: "150px",
			render: (_value, item) => {
				const positionTitle = item.position?.title;
				return <span className="text-sm text-gray-600">{positionTitle || "N/A"}</span>;
			},
		},
		{
			key: "deviceUserId",
			label: "Device User ID",
			width: "150px",
			render: (_value, item) => {
				const deviceUserId =
					item.deviceEmpId || (item.user?.metadata as any)?.device?.access?.empId;
				return <span className="text-sm text-gray-900">{deviceUserId || "-"}</span>;
			},
		},
		{
			key: "accessStatus",
			label: "Access Status",
			width: "150px",
			render: (_value, item) => {
				const accessStatus =
					(item.user?.metadata as any)?.device?.access?.status ||
					(item.deviceEmpId ? "enrolled" : "unenrolled");
				const isEnrolled = accessStatus === "enrolled";
				return (
					<Badge variant={isEnrolled ? "success" : "secondary"}>
						{isEnrolled ? "Enrolled" : "Unenrolled"}
					</Badge>
				);
			},
		},
	];

	const updateSearchParams = useCallback(
		(mutator: (next: URLSearchParams) => void) => {
			setSearchParams((prev) => {
				const next = new URLSearchParams(prev);
				mutator(next);
				return next;
			});
		},
		[setSearchParams],
	);

	const setSelectedDeviceId = (deviceId: string) => {
		updateSearchParams((next) => {
			if (deviceId) next.set("deviceId", deviceId);
			else next.delete("deviceId");
			next.set("deviceUserPage", "1");
		});
	};

	const setActivePanel = (panel: string) => {
		updateSearchParams((next) => {
			next.set("syncPanel", panel);
			if (panel === "users") next.set("action", "device-users");
			if (panel !== "users" && next.get("action") === "device-users") {
				next.set("action", "sync-review");
			}
		});
	};

	const setDeviceUserStatus = (status: string) => {
		updateSearchParams((next) => {
			if (status && status !== "all") next.set("deviceUserStatus", status);
			else next.delete("deviceUserStatus");
			next.set("deviceUserPage", "1");
		});
	};

	const setDeviceUserView = (view: string) => {
		updateSearchParams((next) => {
			if (view && view !== "shown") next.set("deviceUserView", view);
			else next.delete("deviceUserView");
			next.delete("deviceUserStatus");
			next.delete("deviceUserSearch");
			next.set("deviceUserPage", "1");
			next.set("syncPanel", "users");
			next.set("action", "device-users");
		});
	};

	const setDeviceUserPage = (page: number) => {
		updateSearchParams((next) => {
			next.set("deviceUserPage", String(Math.max(page, 1)));
		});
	};

	const refreshSourceDeviceUsers = () => {
		if (!selectedDeviceId) {
			toast.error("Select a device before reading source users");
			return;
		}
		updateSearchParams((next) => {
			next.set("action", "device-users");
			next.set("syncPanel", "users");
			next.set("deviceUserPage", "1");
		});
		void Promise.allSettled([
			refetchSourceDeviceUsers(),
			refetchSyncPreview(),
			refetchDeviceUserSummary(),
			refetchSyncRuns(),
		]);
	};
	const goBackToDeviceUserSummary = () => {
		updateSearchParams((next) => {
			next.delete("deviceId");
			next.delete("deviceUserStatus");
			next.delete("deviceUserSearch");
			next.delete("deviceUserView");
			next.delete("deviceUserPage");
			next.set("syncPanel", "users");
			next.set("action", "device-users");
		});
		void refetchSyncPreview();
	};
	const refreshDeviceUserSummary = async () => {
		await Promise.allSettled([refetchSyncPreview(), refetchSyncRuns()]);
	};
	const openBulkDeviceUserSyncReview = () => {
		if (activeDeviceUserSyncJob || bulkDeviceUserSyncState.lastProgress) {
			setBulkDeviceUserSyncState((current) => ({
				...current,
				open: true,
			}));
			return;
		}
		if (syncCenterDevices.length === 0) {
			toast.error("No configured devices are available to sync");
			return;
		}
		setBulkDeviceUserSyncState({
			open: true,
			status: "review",
			message: "Choose what to refresh, then run it.",
			lastProgress: null,
		});
	};
	const openSdkUserMerge = async (initialSearch = "") => {
		const searchScope = initialSearch.trim();
		const configuredDeviceIds: string[] = hikvisionDeviceOptions
			.map((device: any) => String(device.id || "").trim())
			.filter(Boolean);
		if (configuredDeviceIds.length < 2) {
			toast.error("Merge needs at least two configured Hikvision devices");
			return;
		}
		updateSearchParams((next) => {
			next.delete("mergeList");
			if (searchScope) {
				next.set("mergeList", "records");
				next.set("mergeSearch", searchScope);
			} else {
				next.delete("mergeSearch");
			}
			next.set("mergeFilter", "all");
			next.delete("mergeUser");
		});
		setSdkMergePreviewOnly(true);
		setSdkMergeState({
			open: true,
			status: "loading",
			message: "Checking which Hikvision devices are available (up to 5 seconds).",
			choices: {},
		});
		// window.setTimeout returns number under DOM; ReturnType can resolve to NodeJS.Timeout when @types/node is loaded.
		let liveReadSlowTimer: number | undefined;
		const availabilitySlowTimer = window.setTimeout(() => {
			setSdkMergeState((current) =>
				current.open && current.status === "loading"
					? {
							...current,
							message:
								"Still checking available Hikvision devices. No device-user results have been read yet; offline devices will be skipped once availability returns.",
						}
					: current,
			);
		}, 5000);
		try {
			const previewRows = syncPreview?.devices?.length
				? syncPreview.devices
				: (await refetchSyncPreview()).data?.devices || [];
			window.clearTimeout(availabilitySlowTimer);
			const previewById = new Map(
				previewRows.map((row: DeviceSyncPreviewRow) => [String(row.deviceId), row]),
			);
			const deviceIds = configuredDeviceIds.filter((deviceId) => {
				const preview = previewById.get(deviceId);
				return Boolean(
					preview &&
						!preview.error &&
						typeof preview.vendorUserCount === "number" &&
						Number.isFinite(preview.vendorUserCount),
				);
			});
			const skippedCount = configuredDeviceIds.length - deviceIds.length;
			if (deviceIds.length < 2) {
				if (searchScope && deviceIds.length === 1) {
					setSdkMergeState({
						open: false,
						status: "idle",
						message: "",
						choices: {},
					});
					updateSearchParams((next) => {
						next.set("deviceId", deviceIds[0]);
						next.set("syncPanel", "users");
						next.set("action", "device-users");
						next.set("deviceUserView", "shown");
						next.set("deviceUserSearch", searchScope);
						next.set("deviceUserPage", "1");
						next.delete("mergeList");
						next.delete("mergeSearch");
						next.delete("mergeFilter");
						next.delete("mergeUser");
					});
					toast.info(
						`Only 1 of ${configuredDeviceIds.length} Hikvision devices is available. Searching that device; ${skippedCount} offline or unavailable skipped.`,
					);
					return;
				}
				setSdkMergeState({
					open: true,
					status: "error",
					message: searchScope
						? `${deviceIds.length} of ${configuredDeviceIds.length} Hikvision devices are available. ${skippedCount} offline or unavailable device${skippedCount === 1 ? " was" : "s were"} skipped. No device-user search results can be shown until at least one device is available.`
						: `${deviceIds.length} of ${configuredDeviceIds.length} Hikvision devices are available. ${skippedCount} offline or unavailable device${skippedCount === 1 ? " was" : "s were"} skipped. Merge needs at least two available devices.`,
					choices: {},
				});
				return;
			}
			setSdkMergeState({
				open: true,
				status: "loading",
				message: searchScope
					? `Searching live users from ${deviceIds.length} available devices; ${skippedCount} offline or unavailable skipped.`
					: `Reading live users from ${deviceIds.length} available devices; ${skippedCount} offline or unavailable skipped.`,
				choices: {},
			});
			liveReadSlowTimer = window.setTimeout(() => {
				setSdkMergeState((current) =>
					current.open && current.status === "loading"
						? {
								...current,
								message: searchScope
									? `Still searching live users from ${deviceIds.length} available devices. Results are not complete yet; ${skippedCount} offline or unavailable skipped.`
									: `Still reading live users from ${deviceIds.length} available devices. Results are not complete yet; ${skippedCount} offline or unavailable skipped.`,
							}
						: current,
				);
			}, 5000);
			const data = await planHikvisionSdkUserMergeMutation.mutateAsync({ deviceIds });
			if (liveReadSlowTimer) window.clearTimeout(liveReadSlowTimer);
			const actionableKeys = Object.fromEntries(
				(data.plan.users || [])
					.filter((user) => {
						const hasCredentialIssue = (["fingerprint", "face"] as const).some(
							(kind) => {
								const truth = mergeCredentialTruth(user, data.plan.devices || [], kind);
								return truth.present < truth.expected;
							},
						);
						return (
							user.missingOnDeviceIds.length > 0 ||
							user.conflicts.length > 0 ||
							hasCredentialIssue
						);
					})
					.map((user) => [user.key, true]),
			);
			setSelectedSdkMergeUserKeys(actionableKeys);
			setSdkMergeState({
				open: true,
				status: "review",
				message: searchScope
					? `Search is scoped to "${searchScope}" across ${deviceIds.length} available devices. ${skippedCount} offline or unavailable skipped.`
					: `Review conflicts from ${deviceIds.length} available devices. ${skippedCount} offline or unavailable skipped.`,
				data,
				choices: {},
			});
		} catch (error: any) {
			window.clearTimeout(availabilitySlowTimer);
			if (liveReadSlowTimer) window.clearTimeout(liveReadSlowTimer);
			setSdkMergeState({
				open: true,
				status: "error",
				message: error?.message || "Could not read live users.",
				choices: {},
			});
		}
	};
	const setSdkMergeFilter = (filter: SdkMergeFilter) => {
		updateSearchParams((next) => {
			next.set("mergeList", "issues");
			if (filter === "all") next.delete("mergeFilter");
			else next.set("mergeFilter", filter);
			next.delete("mergeUser");
			next.set("mergePage", "1");
		});
	};
	const setSdkMergeListMode = (mode: SdkMergeListMode) => {
		updateSearchParams((next) => {
			if (mode === "unique") next.delete("mergeList");
			else next.set("mergeList", mode);
			next.delete("mergeFilter");
			next.delete("mergeUser");
			next.delete("mergeDeviceId");
			next.set("mergePage", "1");
		});
	};
	const setSdkMergeDeviceFilter = (deviceId: string, filter?: SdkMergeFilter) => {
		updateSearchParams((next) => {
			next.set("mergeList", "issues");
			if (filter && filter !== "all") next.set("mergeFilter", filter);
			if (deviceId && deviceId !== "all") next.set("mergeDeviceId", deviceId);
			else next.delete("mergeDeviceId");
			next.delete("mergeUser");
			next.set("mergePage", "1");
		});
	};
	const setSdkMergeDeviceListMode = (deviceId: string, mode: SdkMergeListMode) => {
		updateSearchParams((next) => {
			if (mode === "unique") next.delete("mergeList");
			else next.set("mergeList", mode);
			if (deviceId && deviceId !== "all") next.set("mergeDeviceId", deviceId);
			else next.delete("mergeDeviceId");
			next.delete("mergeFilter");
			next.delete("mergeUser");
			next.set("mergePage", "1");
		});
	};
	const setSdkMergePage = (page: number) => {
		updateSearchParams((next) => {
			next.set("mergePage", String(Math.max(page, 1)));
		});
	};
	const setSelectedMergeUser = (userKey: string) => {
		updateSearchParams((next) => {
			if (next.get("mergeUser") === userKey) next.delete("mergeUser");
			else next.set("mergeUser", userKey);
		});
	};
	const setSdkMergeChoice = (key: string, field: string, choice: "A" | "B" | "KEEP") => {
		setSdkMergeState((current) => ({
			...current,
			applyAll: undefined,
			choices: {
				...current.choices,
				[key]: { ...(current.choices[key] || {}), [field]: choice },
			},
		}));
	};
	const sdkMergeRows = useMemo<SdkMergeIssueRow[]>(() => {
		const plan = sdkMergeState.data?.plan;
		if (!plan) return [];
		const rows = plan.users.flatMap((user) => {
			const rows: SdkMergeIssueRow[] = [];
			const richestRecord = [...user.records].sort(
				(left: any, right: any) =>
					mergeRecordRichnessScore(right) - mergeRecordRichnessScore(left),
			)[0];
			const vendorUserId = mergeVendorUserId(user);
			const personLabel = mergePersonLabel(user);
			const richestDeviceName = mergeDeviceName(
				plan.devices,
				richestRecord?.deviceId || user.sourceDeviceId,
			);

			for (const targetDeviceId of user.missingOnDeviceIds) {
				const targetDeviceName = mergeDeviceName(plan.devices, targetDeviceId);
				rows.push({
					id: `${user.key}:missing:${targetDeviceId}`,
					filter: "missing",
					userKey: user.key,
					user,
					targetDeviceId,
					targetDeviceName,
					sourceDeviceId: richestRecord?.deviceId || user.sourceDeviceId,
					sourceDeviceName: richestDeviceName,
					relatedDeviceIds: mergeDefinedDeviceIds([
						targetDeviceId,
						richestRecord?.deviceId || user.sourceDeviceId,
					]),
					vendorUserId,
					personLabel,
					issueLabel: "Missing from device",
					missingLabel: targetDeviceName,
					dataLabel: "User record",
					recommendedAction: `Copy the recommended record from ${richestDeviceName} to ${targetDeviceName}.`,
					primaryAction: "copy",
					richestRecord,
				});
			}

			for (const conflict of user.conflicts) {
				const selectedRecord =
					user.records.find(
						(record: any) => record.deviceId === richestRecord?.deviceId,
					) || richestRecord;
				rows.push({
					id: `${user.key}:decision:${conflict.field}`,
					filter: "decision",
					userKey: user.key,
					user,
					sourceDeviceId: selectedRecord?.deviceId || user.sourceDeviceId,
					sourceDeviceName: mergeDeviceName(
						plan.devices,
						selectedRecord?.deviceId || user.sourceDeviceId,
					),
					relatedDeviceIds: [conflict.deviceA.id, conflict.deviceB.id],
					vendorUserId,
					personLabel,
					issueLabel: "Needs decision",
					missingLabel: `${conflict.deviceA.name} vs ${conflict.deviceB.name}`,
					dataLabel: `${mergeFieldLabel(conflict.field)}: ${mergeFieldValueLabel(conflict.deviceA.value)} / ${mergeFieldValueLabel(conflict.deviceB.value)}`,
					recommendedAction: `Use the value from ${mergeDeviceName(plan.devices, selectedRecord?.deviceId || user.sourceDeviceId)} unless local knowledge says otherwise.`,
					primaryAction: "choose-richest",
					conflictField: conflict.field,
					conflictFields: [conflict.field],
					richestRecord: selectedRecord,
				});
			}

			for (const kind of ["fingerprint", "face", "card"] as const) {
				const strongestRecord = [...user.records].sort(
					(left: any, right: any) =>
						mergeCredentialCount(right, kind) - mergeCredentialCount(left, kind),
				)[0];
				const strongestCount = mergeCredentialCount(strongestRecord, kind);
				if (strongestCount <= 0) continue;
				for (const targetRecord of user.records) {
					const targetCount = mergeCredentialCount(targetRecord, kind);
					if (targetCount >= strongestCount) continue;
					rows.push({
						id: `${user.key}:${kind}:${targetRecord.deviceId}`,
						filter: kind,
						userKey: user.key,
						user,
						targetDeviceId: targetRecord.deviceId,
						targetDeviceName: mergeDeviceName(plan.devices, targetRecord.deviceId),
						sourceDeviceId: strongestRecord?.deviceId || user.sourceDeviceId,
						sourceDeviceName: mergeDeviceName(
							plan.devices,
							strongestRecord?.deviceId || user.sourceDeviceId,
						),
						relatedDeviceIds: mergeDefinedDeviceIds([
							targetRecord.deviceId,
							strongestRecord?.deviceId || user.sourceDeviceId,
						]),
						vendorUserId,
						personLabel,
						issueLabel: `${mergeFieldLabel(kind)} gap`,
						missingLabel: mergeDeviceName(plan.devices, targetRecord.deviceId),
						dataLabel: `${mergeFieldLabel(kind)} ${targetCount} of ${strongestCount}`,
						recommendedAction: `Copy ${mergeFieldLabel(kind).toLowerCase()} from ${mergeDeviceName(plan.devices, strongestRecord?.deviceId || user.sourceDeviceId)}.`,
						primaryAction: "copy",
						conflictField: kind,
						conflictFields: user.conflicts.some((conflict) => conflict.field === kind)
							? [kind]
							: [],
						richestRecord: strongestRecord,
						targetRecord,
					});
				}
			}

			if (rows.length === 0) {
				rows.push({
					id: `${user.key}:ready`,
					filter: "ready",
					userKey: user.key,
					user,
					sourceDeviceId: richestRecord?.deviceId || user.sourceDeviceId,
					sourceDeviceName: richestDeviceName,
					relatedDeviceIds: mergeDefinedDeviceIds([
						richestRecord?.deviceId || user.sourceDeviceId,
						...user.records.map((record: any) => record.deviceId),
					]),
					vendorUserId,
					personLabel,
					issueLabel: "Ready / no action",
					missingLabel: "All selected devices",
					dataLabel: "User record and credential counts match",
					recommendedAction: "Keep current records.",
					primaryAction: "details",
					richestRecord,
				});
			}
			return rows;
		});
		return rows.sort(compareSdkMergeRowsByVendorId);
	}, [sdkMergeState.data]);
	const sdkMergeRowMatchesDevice = useCallback((
		row: SdkMergeIssueRow,
		deviceId: string,
		filter: SdkMergeFilter = row.filter,
	) => {
		if (deviceId === "all") return true;
		if (
			filter === "missing" ||
			filter === "fingerprint" ||
			filter === "face" ||
			filter === "card"
		) {
			return row.targetDeviceId === deviceId;
		}
		if (filter === "decision") return (row.relatedDeviceIds || []).includes(deviceId);
		if (filter === "ready") return (row.relatedDeviceIds || []).includes(deviceId);
		if (
			row.filter === "missing" ||
			row.filter === "fingerprint" ||
			row.filter === "face" ||
			row.filter === "card"
		) {
			return row.targetDeviceId === deviceId;
		}
		return (row.relatedDeviceIds || []).includes(deviceId);
	}, []);
	const sdkMergeUniqueRows = useMemo<SdkMergeIssueRow[]>(() => {
		const plan = sdkMergeState.data?.plan;
		if (!plan) return [];
		return plan.users.map((user) => {
			const userRows = sdkMergeRows.filter((row) => row.userKey === user.key);
			const reviewRows = userRows.filter((row) => row.filter !== "ready");
			const richestRecord = [...user.records].sort(
				(left: any, right: any) =>
					mergeRecordRichnessScore(right) - mergeRecordRichnessScore(left),
			)[0];
			const deviceNames = user.records
				.map((record: any) => mergeDeviceName(plan.devices, record.deviceId))
				.filter(Boolean);
			const missingNames = user.missingOnDeviceIds
				.map((deviceId) => mergeDeviceName(plan.devices, deviceId))
				.filter(Boolean);
			const uniqueRow: SdkMergeIssueRow = {
				id: `${user.key}:unique`,
				filter: reviewRows.length ? reviewRows[0].filter : "ready",
				userKey: user.key,
				user,
				sourceDeviceId: richestRecord?.deviceId || user.sourceDeviceId,
				sourceDeviceName: mergeDeviceName(
					plan.devices,
					richestRecord?.deviceId || user.sourceDeviceId,
				),
				relatedDeviceIds: mergeDefinedDeviceIds([
					...user.records.map((record: any) => record.deviceId),
				]),
				vendorUserId: mergeVendorUserId(user),
				personLabel: mergePersonLabel(user),
				issueLabel: reviewRows.length ? "Needs review" : "Ready / no action",
				missingLabel: missingNames.length ? missingNames.join(", ") : "All selected devices",
				dataLabel: `${mergePlural(user.records.length, "device record")} read. Seen on ${deviceNames.join(", ") || "no device"}.`,
				recommendedAction: reviewRows.length
					? `${mergePlural(reviewRows.length, "issue row")} to review for this ID.`
					: "This ID is already aligned across the selected devices.",
				primaryAction: "details",
				conflictFields: user.conflicts.map(
					(conflict) => conflict.field as DeviceUserMergeField,
				),
				richestRecord,
			};
			return uniqueRow;
		}).sort(compareSdkMergeRowsByVendorId);
	}, [sdkMergeRows, sdkMergeState.data]);
	const sdkMergeRecordRows = useMemo<SdkMergeIssueRow[]>(() => {
		const plan = sdkMergeState.data?.plan;
		if (!plan) return [];
		const rows = plan.users.flatMap((user) =>
			user.records.map((record: any) => {
				const deviceName = mergeDeviceName(plan.devices, record.deviceId);
				const fingerprintCount = mergeCredentialCount(record, "fingerprint");
				const faceCount = mergeCredentialCount(record, "face");
				const cardCount = mergeCredentialCount(record, "card");
				return {
					id: `${user.key}:record:${record.deviceId}`,
					filter: "ready" as SdkMergeFilter,
					userKey: user.key,
					user,
					targetDeviceId: record.deviceId,
					targetDeviceName: deviceName,
					sourceDeviceId: record.deviceId,
					sourceDeviceName: deviceName,
					relatedDeviceIds: [record.deviceId],
					vendorUserId: mergeVendorUserId(user),
					personLabel: record.displayName || mergePersonLabel(user),
					issueLabel: record.employeeId ? "Linked record" : "Needs link",
					missingLabel: deviceName,
					dataLabel: `Fingerprint ${fingerprintCount}, face ${faceCount}, card ${cardCount}.`,
					recommendedAction: record.employeeId
						? `Connected to HRIS employee ${record.employeeId}.`
						: "No HRIS employee link is saved for this device record.",
					primaryAction: "details" as SdkMergeRowAction,
					richestRecord: record,
					targetRecord: record,
				};
			}),
		);
		return rows.sort(compareSdkMergeRowsByVendorId);
	}, [sdkMergeState.data]);
	const sdkMergeWriteRows = useMemo<SdkMergeIssueRow[]>(() => {
		const plan = sdkMergeState.data?.plan;
		if (!plan) return [];
		const rows = plan.users.flatMap((user) => {
			const richestRecord = [...user.records].sort(
				(left: any, right: any) =>
					mergeRecordRichnessScore(right) - mergeRecordRichnessScore(left),
			)[0];
			return user.targetDeviceIds.map((targetDeviceId) => ({
				id: `${user.key}:write:${targetDeviceId}`,
				filter: "missing" as SdkMergeFilter,
				userKey: user.key,
				user,
				targetDeviceId,
				targetDeviceName: mergeDeviceName(plan.devices, targetDeviceId),
				sourceDeviceId: richestRecord?.deviceId || user.sourceDeviceId,
				sourceDeviceName: mergeDeviceName(
					plan.devices,
					richestRecord?.deviceId || user.sourceDeviceId,
				),
				relatedDeviceIds: mergeDefinedDeviceIds([
					targetDeviceId,
					richestRecord?.deviceId || user.sourceDeviceId,
				]),
				vendorUserId: mergeVendorUserId(user),
				personLabel: mergePersonLabel(user),
				issueLabel: "Potential write",
				missingLabel: mergeDeviceName(plan.devices, targetDeviceId),
				dataLabel: "Would copy the selected recommended source record to this target device.",
				recommendedAction: "Preview only. No write starts from this row.",
				primaryAction: "details" as SdkMergeRowAction,
				richestRecord,
			}));
		});
		return rows.sort(compareSdkMergeRowsByVendorId);
	}, [sdkMergeState.data]);
	const sdkMergeReviewRows = sdkMergeUniqueRows.filter((row) => row.filter !== "ready");
	const sdkMergeDisplayRows =
		sdkMergeListMode === "records"
			? sdkMergeRecordRows
			: sdkMergeListMode === "review"
				? sdkMergeReviewRows
				: sdkMergeListMode === "writes"
					? sdkMergeWriteRows
					: sdkMergeListMode === "issues"
					? sdkMergeRows
					: sdkMergeUniqueRows;
	const sdkMergeVisibleRows = sdkMergeDisplayRows.filter((row) => {
		if (sdkMergeListMode === "issues" && sdkMergeFilter !== "all" && row.filter !== sdkMergeFilter)
			return false;
		if (selectedMergeDeviceId !== "all") {
			const matches =
				sdkMergeListMode === "issues" || sdkMergeListMode === "writes"
					? sdkMergeRowMatchesDevice(
							row,
							selectedMergeDeviceId,
							sdkMergeListMode === "issues" ? sdkMergeFilter : row.filter,
						)
					: (row.relatedDeviceIds || []).includes(selectedMergeDeviceId);
			if (!matches) return false;
		}
		if (selectedMergeUserKey && row.userKey !== selectedMergeUserKey) return false;
		const normalizedSdkMergeSearch = sdkMergeSearch.trim().toLowerCase();
		if (normalizedSdkMergeSearch) {
			const searchableValues = [
				row.vendorUserId,
				row.personLabel,
				row.userKey,
				row.issueLabel,
				row.missingLabel,
				row.dataLabel,
				row.sourceDeviceName,
				row.targetDeviceName,
				...(row.user?.records || []).flatMap((record: any) => [
					record.vendorUserId,
					record.employeeNo,
					record.employeeId,
					record.displayName,
					record.name,
					mergeDeviceName(sdkMergeState.data?.plan.devices || [], record.deviceId),
				]),
			];
			if (
				!searchableValues
					.filter(Boolean)
					.some((value) =>
						String(value).toLowerCase().includes(normalizedSdkMergeSearch),
					)
			) {
				return false;
			}
		}
		return true;
	});
	const sdkMergeRowsPerPage = 25;
	const sdkMergeTotalPages = Math.max(
		1,
		Math.ceil(sdkMergeVisibleRows.length / sdkMergeRowsPerPage),
	);
	const safeSdkMergePage = Math.min(sdkMergePage, sdkMergeTotalPages);
	const sdkMergePageStart = (safeSdkMergePage - 1) * sdkMergeRowsPerPage;
	const sdkMergePagedRows = sdkMergeVisibleRows.slice(
		sdkMergePageStart,
		sdkMergePageStart + sdkMergeRowsPerPage,
	);
	const selectedSdkMergeCredentialRow =
		sdkMergeCredentialPicker
			? sdkMergeVisibleRows.find((row) => row.id === sdkMergeCredentialPicker.rowId) ||
				sdkMergeDisplayRows.find((row) => row.id === sdkMergeCredentialPicker.rowId) ||
				null
			: null;
	const selectedSdkMergeSourceReviewRow =
		sdkMergeSourceReview
			? sdkMergeVisibleRows.find((row) => row.id === sdkMergeSourceReview.rowId) ||
				sdkMergeDisplayRows.find((row) => row.id === sdkMergeSourceReview.rowId) ||
				null
			: null;
	const sdkMergeUniqueIdCount = sdkMergeState.data?.plan.users.length || 0;
	const sdkMergePlanDevices = useMemo(
		() => sdkMergeState.data?.plan.devices || [],
		[sdkMergeState.data],
	);
	const sdkMergeActionableUserKeys = useMemo(() => {
		if (!sdkMergeState.data?.plan) return [];
		return sdkMergeState.data.plan.users
			.filter((user) => {
				const hasCredentialIssue = (["fingerprint", "face"] as const).some(
					(kind) => {
						const truth = mergeCredentialTruth(user, sdkMergePlanDevices, kind);
						return truth.present < truth.expected;
					},
				);
				return (
					user.missingOnDeviceIds.length > 0 ||
					user.conflicts.length > 0 ||
					hasCredentialIssue
				);
			})
			.map((user) => user.key);
	}, [sdkMergePlanDevices, sdkMergeState.data]);
	const sdkMergeScopedSelectableUserKeys = Array.from(
		new Set(sdkMergeVisibleRows.map((row) => row.userKey).filter(Boolean)),
	);
	const selectedSdkMergeKeys = (sdkMergeState.data?.plan.users || [])
		.map((user) => user.key)
		.filter((key) => selectedSdkMergeUserKeys[key]);
	const sdkMergeScopedSelectedCount = sdkMergeScopedSelectableUserKeys.filter(
		(key) => selectedSdkMergeUserKeys[key],
	).length;
	const sdkMergeSelectedUniqueCount = selectedSdkMergeKeys.length;
	const sdkMergeExcludedActionableCount =
		sdkMergeScopedSelectableUserKeys.length - sdkMergeScopedSelectedCount;
	const sdkMergeDeviceRecordCount =
		sdkMergeState.data?.plan.users.reduce((count, user) => count + user.records.length, 0) ||
		0;
	const sdkMergePotentialWriteCount =
		sdkMergeWriteRows.length ||
		sdkMergeState.data?.plan.plannedWrites?.length ||
		sdkMergeState.data?.plan.users.reduce(
			(count, user) => count + user.targetDeviceIds.length,
			0,
		) ||
		0;
	const sdkMergeSelectedPotentialWriteCount =
		sdkMergeState.data?.plan.users.reduce(
			(count, user) =>
				selectedSdkMergeUserKeys[user.key] ? count + user.targetDeviceIds.length : count,
			0,
		) || 0;
	const sdkMergeAttentionRowCount = sdkMergeReviewRows.length;
	const sdkMergeFilterItems: Array<{ value: SdkMergeFilter; label: string; count: number }> = [
		{ value: "all", label: "Issue details", count: sdkMergeRows.length },
		{
			value: "missing",
			label: "Missing from device",
			count: sdkMergeRows.filter((row) => row.filter === "missing").length,
		},
		{
			value: "decision",
			label: "Needs decision",
			count: sdkMergeRows.filter((row) => row.filter === "decision").length,
		},
		{
			value: "fingerprint",
			label: "Fingerprint gaps",
			count: sdkMergeRows.filter((row) => row.filter === "fingerprint").length,
		},
		{
			value: "face",
			label: "Face gaps",
			count: sdkMergeRows.filter((row) => row.filter === "face").length,
		},
		{
			value: "ready",
			label: "Ready / no action",
			count: sdkMergeRows.filter((row) => row.filter === "ready").length,
		},
	];
	const sdkMergeActiveFilterLabel =
		sdkMergeListMode === "unique"
			? "Unique IDs"
			: sdkMergeListMode === "records"
				? "Device records read"
				: sdkMergeListMode === "review"
					? "Needs review"
					: sdkMergeListMode === "writes"
						? "Potential writes"
						: sdkMergeFilterItems.find((item) => item.value === sdkMergeFilter)?.label ||
							"Issue rows";
	const sdkMergeDeviceIssueCounts = useMemo(() => {
		const plan = sdkMergeState.data?.plan;
		return (plan?.devices || []).map((device) => {
			return {
				device,
				read:
					plan?.users.reduce(
						(count, user) =>
							count +
							(user.records.some((record: any) => record.deviceId === device.id)
								? 1
								: 0),
						0,
					) || 0,
				counts: {
					missing: sdkMergeRows.filter(
						(row) => row.filter === "missing" && sdkMergeRowMatchesDevice(row, device.id, "missing"),
					).length,
					decision: sdkMergeRows.filter(
						(row) => row.filter === "decision" && sdkMergeRowMatchesDevice(row, device.id, "decision"),
					).length,
					fingerprint: sdkMergeRows.filter(
						(row) =>
							row.filter === "fingerprint" &&
							sdkMergeRowMatchesDevice(row, device.id, "fingerprint"),
					).length,
					face: sdkMergeRows.filter(
						(row) => row.filter === "face" && sdkMergeRowMatchesDevice(row, device.id, "face"),
					).length,
					card: sdkMergeRows.filter(
						(row) => row.filter === "card" && sdkMergeRowMatchesDevice(row, device.id, "card"),
					).length,
					ready: sdkMergeRows.filter(
						(row) => row.filter === "ready" && sdkMergeRowMatchesDevice(row, device.id, "ready"),
					).length,
				},
			};
		});
	}, [sdkMergeRowMatchesDevice, sdkMergeRows, sdkMergeState.data]);
	const sdkMergeConflictCount =
		sdkMergeState.data?.plan.users.reduce((count, user) => count + user.conflicts.length, 0) ||
		0;
	const sdkMergeSelectedConflictCount =
		sdkMergeState.data?.plan.users.reduce(
			(count, user) =>
				selectedSdkMergeUserKeys[user.key] ? count + user.conflicts.length : count,
			0,
		) || 0;
	const sdkMergeSelectedResolvedCount =
		sdkMergeState.data?.plan.users.reduce(
			(count, user) =>
				selectedSdkMergeUserKeys[user.key]
					? count +
						user.conflicts.filter((conflict) =>
							Boolean(
								sdkMergeState.applyAll ||
									sdkMergeState.choices[user.key]?.[conflict.field],
							),
						).length
					: count,
			0,
		) || 0;
	const sdkMergeBlockingCount =
		(sdkMergeState.data?.plan.errors?.length || 0) +
		(sdkMergeState.data?.plan.ambiguousMatches?.length || 0);
	const sdkMergeCanApply =
		sdkMergeSelectedUniqueCount > 0 &&
		sdkMergeSelectedResolvedCount >= sdkMergeSelectedConflictCount &&
		sdkMergeBlockingCount === 0;
	const visibleSdkMergeJob = sdkMergeJobId
		? sdkMergeJobProgress || sdkMergeLastJob
		: sdkMergeLastJob;
	const effectiveSdkMergeJob =
		visibleSdkMergeJob?.jobId && visibleSdkMergeJob.jobId === sdkMergeDismissedJobId
			? null
			: visibleSdkMergeJob;
	const hasSdkMergeJob = Boolean(effectiveSdkMergeJob);
	const sdkMergeJobIsProcessing = effectiveSdkMergeJob?.status === "processing";
	const sdkMergeJobProcessed = Number(effectiveSdkMergeJob?.processedWrites || 0);
	const sdkMergeJobTotal = Math.max(Number(effectiveSdkMergeJob?.totalWrites || 1), 1);
	const sdkMergeJobPercent = Math.min(
		100,
		Math.round((sdkMergeJobProcessed / sdkMergeJobTotal) * 100),
	);
	const sdkMergeJobToneClass =
		effectiveSdkMergeJob?.status === "failed"
			? "border-red-200 bg-red-50 text-red-950"
			: effectiveSdkMergeJob?.status === "completed"
				? "border-emerald-200 bg-emerald-50 text-emerald-950"
				: "border-orange-200 bg-orange-50 text-orange-950";
	const sdkMergeJobFillClass =
		effectiveSdkMergeJob?.status === "failed"
			? "bg-red-600"
			: effectiveSdkMergeJob?.status === "completed"
				? "bg-emerald-600"
				: "bg-orange-600";
	const sdkMergeJobTitle =
		effectiveSdkMergeJob?.status === "failed"
			? "Merge needs attention"
			: effectiveSdkMergeJob?.status === "completed"
				? "Merge finished"
				: sdkMergeJobIsProcessing
					? "Merge job running"
					: "Merge job status";
	const sdkMergeJobSummaryItems = [
		["Planned writes", effectiveSdkMergeJob?.totalWrites ?? sdkMergeRows.length],
		["Completed", effectiveSdkMergeJob?.processedWrites ?? 0],
		["Applied", effectiveSdkMergeJob?.successfulWrites ?? 0],
		["Needs attention", effectiveSdkMergeJob?.failedWrites ?? 0],
	] as const;
	const sdkMergeJobResults = effectiveSdkMergeJob?.results || [];
	const sdkMergeJobSummary = effectiveSdkMergeJob
		? `${mergeMetricValue(effectiveSdkMergeJob.successfulWrites)} writes applied, ${mergeMetricValue(
				effectiveSdkMergeJob.failedWrites,
			)} need attention.`
		: "";
	const keepSdkMergeCurrent = (row: SdkMergeIssueRow) => {
		const fields = row.conflictFields?.length
			? row.conflictFields
			: row.conflictField
				? [row.conflictField]
				: [];
		if (fields.length === 0) {
			setSelectedMergeUser(row.userKey);
			return;
		}
		setSdkMergeState((current) => ({
			...current,
			applyAll: undefined,
			choices: {
				...current.choices,
				[row.userKey]: {
					...(current.choices[row.userKey] || {}),
					...(Object.fromEntries(
						fields.map((field) => [field, "KEEP" as const]),
					) as Partial<Record<DeviceUserMergeField, "KEEP">>),
				},
			},
		}));
	};
	const buildSdkMergeRichestChoices = (plan: DeviceUserMergePlanResponse["plan"]) => {
		const choices: Record<string, Record<string, "A" | "B" | "KEEP">> = {};
		for (const user of plan.users) {
			const richestRecord = [...user.records].sort(
				(left: any, right: any) =>
					mergeRecordRichnessScore(right) - mergeRecordRichnessScore(left),
			)[0];
			for (const conflict of user.conflicts) {
				const richestDeviceId = String(richestRecord?.deviceId || "");
				const choice =
					conflict.deviceA.id === richestDeviceId
						? "A"
						: conflict.deviceB.id === richestDeviceId
							? "B"
							: "KEEP";
				choices[user.key] = { ...(choices[user.key] || {}), [conflict.field]: choice };
			}
		}
		return choices;
	};
	const autoResolveSdkMergeFromRichest = () => {
		const plan = sdkMergeState.data?.plan;
		if (!plan || sdkMergeBlockingCount > 0) return;
		const choices = buildSdkMergeRichestChoices(plan);
		setSdkMergeState((current) => ({
			...current,
			applyAll: undefined,
			choices,
			message:
				"Previewing recommended-source choices. Review the rows below; preview mode prevents writes.",
		}));
		setSdkMergeFilter("decision");
	};
	const applySdkUserMerge = async (
		overrideChoices?: Record<string, Record<string, "A" | "B" | "KEEP">>,
	) => {
		if (!sdkMergeState.data) return;
		const choices = overrideChoices || sdkMergeState.choices;
		const resolvedCount = sdkMergeState.data.plan.users.reduce(
			(count, user) =>
				selectedSdkMergeUserKeys[user.key]
					? count +
						user.conflicts.filter((conflict) =>
							Boolean(sdkMergeState.applyAll || choices[user.key]?.[conflict.field]),
						).length
					: count,
			0,
		);
		if (
			sdkMergeSelectedUniqueCount === 0 ||
			resolvedCount < sdkMergeSelectedConflictCount ||
			sdkMergeBlockingCount > 0
		)
			return;
		setSdkMergeState((current) => ({
			...current,
			status: "review",
			message: `Starting merge job for ${mergePlural(sdkMergeSelectedUniqueCount, "selected unique ID")}.`,
			choices,
		}));
		try {
			const result = await startHikvisionSdkUserMergeJobMutation.mutateAsync({
				planId: sdkMergeState.data.planId,
				choices,
				applyAll: sdkMergeState.applyAll,
				selectedUserKeys: selectedSdkMergeKeys,
			});
			setSdkMergeJobId(result.jobId);
			setSdkMergeLastJob(result.progress);
			setSdkMergeHandledJobId(null);
			setSdkMergeDismissedJobId(null);
			updateSearchParams((next) => {
				next.set("mergeJobId", result.jobId);
			});
			setSdkMergeState((current) => ({
				...current,
				status: "review",
				message: result.progress?.message || "Merge job started.",
			}));
		} catch (error: any) {
			setSdkMergeState((current) => ({
				...current,
				status: "error",
				message: error?.message || "Merge job could not start.",
			}));
		}
	};
	const retrySdkUserMergeJob = async () => {
		if (!sdkMergeState.data || sdkMergeBlockingCount > 0) return;
		const choices =
			sdkMergeCanApply && Object.keys(sdkMergeState.choices).length
				? sdkMergeState.choices
				: buildSdkMergeRichestChoices(sdkMergeState.data.plan);
		await applySdkUserMerge(choices);
	};
	const dismissSdkUserMergeJob = () => {
		setSdkMergeDismissedJobId(effectiveSdkMergeJob?.jobId || sdkMergeJobId || null);
		setSdkMergeJobId(null);
		setSdkMergeLastJob(null);
		setSdkMergeHandledJobId(null);
		updateSearchParams((next) => next.delete("mergeJobId"));
		setSdkMergeState((current) => ({
			...current,
			status: current.data ? "review" : "idle",
			message: current.data ? "Review conflicts." : "",
		}));
	};
	const getBulkDeviceUserSyncStartFailureMessage = (error: unknown) => {
		const message =
			typeof error === "object" && error !== null && "message" in error
				? String((error as { message?: unknown }).message || "").trim()
				: "";
		if (message.includes("Cannot POST") && message.includes("/api/device/users/sync-jobs")) {
			return "This API runtime does not expose the manual device-user sync start route yet. Refresh against the latest API server, then retry.";
		}
		return message || "Device-user sync could not be started.";
	};
	const runBulkDeviceUserSync = async () => {
		if (syncCenterDevices.length === 0) {
			toast.error("No configured devices are available to sync");
			return;
		}
		const request =
			bulkDeviceUserSyncMode === "needs_attention_only"
				? {
						mode: "needs_attention_only" as const,
						deviceIds: needsAttentionDeviceIds,
					}
				: bulkDeviceUserSyncMode === "peer_converge"
					? {
							mode: "peer_converge" as const,
						}
					: {
							mode: "full_refresh" as const,
						};
		if (
			bulkDeviceUserSyncMode === "needs_attention_only" &&
			needsAttentionDeviceIds.length === 0
		) {
			setBulkDeviceUserSyncState({
				open: true,
				status: "error",
				message:
					"Everything already looks aligned. Switch to All devices if you still want a full reread.",
				lastProgress: null,
			});
			return;
		}
		setBulkDeviceUserSyncState({
			open: true,
			status: "starting",
			message:
				bulkDeviceUserSyncMode === "needs_attention_only"
					? "Starting the mismatch refresh."
					: bulkDeviceUserSyncMode === "peer_converge"
						? "Starting cross-device convergence."
						: "Starting the full reread.",
			lastProgress: null,
		});
		try {
			const data = await startDeviceUserSyncJobMutation.mutateAsync(request);
			if (data?.jobId) {
				setActiveDeviceUserSyncJob({ jobId: data.jobId });
				setBulkDeviceUserSyncState({
					open: true,
					status: "idle",
					message: data.progress?.message || "",
					lastProgress: null,
				});
				return;
			}
			setBulkDeviceUserSyncState({
				open: true,
				status: "error",
				message:
					"Device-user sync did not return a job ID, so progress cannot be tracked yet.",
				lastProgress: null,
			});
		} catch (error: unknown) {
			setActiveDeviceUserSyncJob(null);
			setBulkDeviceUserSyncState({
				open: true,
				status: "error",
				message: getBulkDeviceUserSyncStartFailureMessage(error),
				lastProgress: null,
			});
		}
	};
	const requestCancelDeviceUserSyncJob = () => {
		if (!activeDeviceUserSyncJob?.jobId) return;
		cancelDeviceUserSyncJobMutation.mutate(activeDeviceUserSyncJob.jobId);
	};

	const openDeviceUserSyncReview = (deviceIdOverride?: string) => {
		const targetDeviceId = deviceIdOverride || selectedDeviceId;
		if (!targetDeviceId) {
			toast.error("Select a device before syncing users");
			return;
		}
		if (deviceIdOverride) setSelectedDeviceId(deviceIdOverride);
		setDeviceUserSyncState({
			open: true,
			status: "review",
			message: "Sync physical device users into HRIS identity records.",
		});
	};

	const handleDeviceUserSearch = (query: string) => {
		updateSearchParams((next) => {
			if (query) next.set("deviceUserSearch", query);
			else next.delete("deviceUserSearch");
			next.set("deviceUserPage", "1");
		});
	};

	const runDeviceUserSync = async () => {
		if (!selectedDeviceId) {
			toast.error("Select a device before syncing users");
			return;
		}
		setDeviceUserSyncState((current) => ({
			...current,
			status: "syncing",
			message: "Queuing live users and missing biometric custody in the background.",
		}));
		try {
			const result = await startDeviceUserSyncJobMutation.mutateAsync({
				mode: "full_refresh",
				deviceIds: [selectedDeviceId],
			});
			setActiveDeviceUserSyncJob({ jobId: result.jobId });
			setDeviceUserSyncState({ open: false, status: "idle", message: "" });
			setBulkDeviceUserSyncState({
				open: true,
				status: "idle",
				message: result.progress?.message || "Device-user custody job started.",
				lastProgress: result.progress || null,
			});
		} catch (error: any) {
			setDeviceUserSyncState({
				open: true,
				status: "error",
				message: error?.message || "Device user sync failed.",
			});
		}
	};

	const openLinkDeviceUser = (deviceUser: VisibleDeviceUserRow) => {
		setLinkTarget(deviceUser);
		setSelectedEmployeeForLink(deviceUser.employeeId || "");
	};

	const submitLinkDeviceUser = async () => {
		if (!linkTarget || !selectedEmployeeForLink) {
			toast.error("Select an employee to link");
			return;
		}
		if (!selectedDeviceId) {
			toast.error("Select a device before linking");
			return;
		}

		try {
			let targetDeviceUser = linkTarget.hrisDeviceUser || null;

			if (!targetDeviceUser) {
				await syncDeviceUsersMutation.mutateAsync(selectedDeviceId);
				const refreshed = await deviceService.getDeviceUsers(selectedDeviceId, {
					limit: 100,
					vendorUserId: linkTarget.vendorUserId,
				});
				targetDeviceUser =
					refreshed.deviceUsers.find(
						(deviceUser) =>
							String(deviceUser.vendorUserId || "").trim() ===
							linkTarget.vendorUserId,
					) || null;
			}

			if (!targetDeviceUser) {
				throw new Error(
					"Device user was read from the source, but was not saved in HRIS after sync. Review sync and try again.",
				);
			}

			await linkDeviceUserMutation.mutateAsync({
				deviceUserId: targetDeviceUser.id,
				employeeId: selectedEmployeeForLink,
			});
			setLinkTarget(null);
			setSelectedEmployeeForLink("");
			await Promise.allSettled([
				refetchDbDeviceUsers(),
				refetchOpenDbDeviceUsers(),
				refetchDeviceUserSummary(),
				refetchSourceMatchedDeviceUsers(),
				refetchSyncPreview(),
			]);
		} catch (error: any) {
			toast.error(error?.message || "Failed to link device user");
		}
	};

	const openUnlinkDeviceUser = (deviceUser: VisibleDeviceUserRow) => {
		if (!deviceUser.hrisDeviceUser || !deviceUser.employeeId) return;
		setUnlinkTarget(deviceUser);
	};

	const confirmUnlinkDeviceUser = async () => {
		if (!unlinkTarget?.hrisDeviceUser) return;
		try {
			await unlinkDeviceUserMutation.mutateAsync(unlinkTarget.hrisDeviceUser.id);
			toast.success("Device user unlinked");
			setUnlinkTarget(null);
			void Promise.allSettled([
				refetchDbDeviceUsers(),
				refetchOpenDbDeviceUsers(),
				refetchDeviceUserSummary(),
				refetchSourceMatchedDeviceUsers(),
			]);
		} catch (error: any) {
			toast.error(error?.message || "Failed to unlink device user");
		}
	};

	const copyTargetDeviceOptions = useMemo(
		(): Array<{ value: string; label: string }> =>
			devices
				.filter(
					(device: any) =>
						device.id !== selectedDeviceId &&
						String(device?.config?.vendor || "")
							.trim()
							.toLowerCase() === "hikvision",
				)
				.map((device: any) => ({
					value: device.id,
					label: device.name || `${device.address || "-"}:${device.port || "-"}`,
				})),
		[devices, selectedDeviceId],
	);
	const hikvisionDeviceOptions = useMemo(
		() =>
			devices.filter(
				(device: any) =>
					String(device?.config?.vendor || "")
						.trim()
						.toLowerCase() === "hikvision",
			),
		[devices],
	);

	const openCopyDeviceUser = (deviceUser: VisibleDeviceUserRow) => {
		setCopyDeviceUserStatusMessage("");
		setCopyDeviceUserState({
			open: true,
			sourceDeviceUser: deviceUser,
			targetDeviceId: copyTargetDeviceOptions[0]?.value || "",
			applyToAllPeers: false,
			includeFingerprints: true,
			includeFaceRecognition: true,
			successfulTargets: [],
			failedTargets: [],
		});
	};

	const describeCopyError = (error: any) => {
		const message = String(error?.message || error || "").trim();
		if (/SDK copy source|copy source|before SDK login/i.test(message)) {
			return message;
		}
		if (
			/forcibly closed|ECONNRESET|socket|unknown port|network error|unable to connect/i.test(
				message,
			)
		) {
			return "The target device is not reachable right now. Check that it is powered on and on the VM LAN, then retry this device.";
		}
		if (/timed out|timeout|408/i.test(message)) {
			return "The target device took too long to respond. Check its network connection, then retry.";
		}
		return message || "The target device could not be updated. Retry when it is reachable.";
	};

	const submitCopyDeviceUser = async () => {
		const sourceDeviceUser = copyDeviceUserState.sourceDeviceUser;
		if (!selectedDeviceId || !sourceDeviceUser?.vendorUserId) {
			toast.error("Select a source device user before copying");
			return;
		}
		if (!copyDeviceUserState.applyToAllPeers && !copyDeviceUserState.targetDeviceId) {
			toast.error("Select a target device");
			return;
		}

		try {
			const targetDeviceIds = copyDeviceUserState.failedTargets.length
				? copyDeviceUserState.failedTargets.map((target) => target.id)
				: copyDeviceUserState.applyToAllPeers
					? copyTargetDeviceOptions.map((option) => option.value)
					: [copyDeviceUserState.targetDeviceId];
			if (targetDeviceIds.length === 0) {
				toast.error("No Hikvision peer devices are available");
				return;
			}
			setIsCopyDeviceUserSubmitting(true);
			setCopyDeviceUserStatusMessage(
				copyDeviceUserState.applyToAllPeers
					? `Copying to ${targetDeviceIds.length} peer devices in one coordinated VM session. Keep this open until HRIS verifies each target.`
					: "Copying through the VM. Keep this open until HRIS verifies the target device.",
			);
			const successfulTargets: Array<{ id: string; label: string }> = [];
			let syntheticPeerCopies = 0;
			const failedTargets: Array<{ id: string; label: string; error: string }> = [];
			const result = await deviceService.copyHikvisionDeviceUserToPeer({
				sourceDeviceId: selectedDeviceId,
				targetDeviceIds,
				employeeNo: sourceDeviceUser.vendorUserId,
				includeFingerprints: copyDeviceUserState.includeFingerprints,
				includeFaceRecognition: copyDeviceUserState.includeFaceRecognition,
			});
			for (const targetResult of result?.results || []) {
				const targetDeviceId = String(targetResult?.targetDevice?.id || "");
				const targetLabel =
					copyTargetDeviceOptions.find((option) => option.value === targetDeviceId)
						?.label || targetResult?.targetDevice?.name || targetDeviceId;
				if (targetResult?.status === "success") {
					successfulTargets.push({ id: targetDeviceId, label: targetLabel });
					if (
						Number(
							targetResult?.syntheticCredentialOverlayApplied?.fingerprintCount || 0,
						) > 0 ||
						Number(targetResult?.syntheticCredentialOverlayApplied?.faceCount || 0) > 0
					) {
						syntheticPeerCopies += 1;
					}
				} else {
					failedTargets.push({
						id: targetDeviceId,
						label: targetLabel,
						error: describeCopyError(targetResult?.error),
					});
				}
			}
			if (successfulTargets.length === 0) {
				setCopyDeviceUserState((current) => ({
					...current,
					open: true,
					applyToAllPeers: false,
					targetDeviceId: targetDeviceIds[0] || current.targetDeviceId,
					successfulTargets,
					failedTargets,
				}));
				setCopyDeviceUserStatusMessage(
					"No peer copy finished. The source or selected targets are not reachable through the VM SDK path right now.",
				);
				throw new Error(failedTargets[0]?.error || "Failed to copy device user");
			}
			if (failedTargets.length > 0) {
				setCopyDeviceUserState((current) => ({
					...current,
					open: true,
					applyToAllPeers: false,
					targetDeviceId: failedTargets[0]?.id || current.targetDeviceId,
					successfulTargets,
					failedTargets,
				}));
				toast.warning(
					`Copied to ${successfulTargets.length} of ${targetDeviceIds.length} peer devices.`,
					{
						description: `${failedTargets[0]?.label}: ${failedTargets[0]?.error}`,
					},
				);
				setCopyDeviceUserStatusMessage(
					`Copied to ${successfulTargets.length} of ${targetDeviceIds.length} peer devices. Retry the failed targets below.`,
				);
				await Promise.allSettled([
					refetchSourceDeviceUsers(),
					refetchDbDeviceUsers(),
					refetchOpenDbDeviceUsers(),
					refetchDeviceUserSummary(),
					refetchSourceMatchedDeviceUsers(),
					refetchSyncPreview(),
					refetchSyncRuns(),
				]);
				return;
			} else {
				toast.success(
					targetDeviceIds.length > 1
						? `Copied to ${targetDeviceIds.length} peer devices`
						: "Copied to peer device",
				);
				setCopyDeviceUserStatusMessage("");
			}
			if (syntheticPeerCopies > 0) {
				toast.success(
					"Some peer copies used dev-only synthetic biometric tallies for verification.",
				);
			}
			setCopyDeviceUserState({
				open: false,
				sourceDeviceUser: null,
				targetDeviceId: "",
				applyToAllPeers: false,
				includeFingerprints: true,
				includeFaceRecognition: true,
				successfulTargets: [],
				failedTargets: [],
			});
			await Promise.allSettled([
				refetchSourceDeviceUsers(),
				refetchDbDeviceUsers(),
				refetchOpenDbDeviceUsers(),
				refetchDeviceUserSummary(),
				refetchSourceMatchedDeviceUsers(),
				refetchSyncPreview(),
				refetchSyncRuns(),
			]);
		} catch (error: any) {
			setCopyDeviceUserStatusMessage(
				error?.message ||
					"Copy did not verify on the target device. Keep this modal open to retry, or close it after noting the failed target.",
			);
			toast.error(error?.message || "Failed to copy device user");
		} finally {
			setIsCopyDeviceUserSubmitting(false);
		}
	};

	const openEnroll = (employee: Employee) => {
		reset({
			deviceId: "",
			deviceUserId: "",
		});
		updateSearchParams((next) => {
			next.set(actionParamName, "enroll");
			next.set(idParamName, employee.id);
		});
	};

	const openImport = () => {
		updateSearchParams((next) => {
			next.set(actionParamName, "import");
		});
	};

	const handleImportClose = (open: boolean) => {
		if (!open) {
			updateSearchParams((next) => {
				next.delete(actionParamName);
			});
		}
	};

	const onSubmitEnroll = async (data: EnrollFormData) => {
		if (!activeEmployee) {
			toast.error("Employee not found");
			return;
		}

		const targetUserId = activeEmployee.userId || activeEmployee.user?.id;
		if (!targetUserId) {
			toast.error("This employee has no linked login account");
			return;
		}

		if (!data.deviceId || !data.deviceUserId) {
			toast.error("Please select both device and device user");
			return;
		}

		try {
			const normalizedDeviceUserId = String(data.deviceUserId || "").trim();

			await deviceService.enrollDeviceUser({
				userId: targetUserId,
				deviceId: data.deviceId,
				deviceUserId: normalizedDeviceUserId,
			});

			queryClient.invalidateQueries({ queryKey: ["employees"] });
			queryClient.invalidateQueries({ queryKey: ["users"] });

			toast.success("User enrolled successfully");
			reset();
			updateSearchParams((next) => {
				next.delete(actionParamName);
				next.delete(idParamName);
			});
		} catch (error: any) {
			toast.error(error?.message || "Failed to enroll user");
		}
	};

	const handleView = (item: Employee) => {
		updateSearchParams((next) => {
			next.set(actionParamName, "view");
			next.set(idParamName, item.id);
		});
	};

	// Check if modal should show loading state for deep links
	const isDeepLinkLoading =
		(action === "enroll" || action === "view") && !!activeEmployeeId && isLoadingEmployee;

	// Server-side search handler
	const handleSearch = (query: string) => {
		updateSearchParams((next) => {
			if (query) {
				next.set(searchParamName, query);
			} else {
				next.delete(searchParamName);
			}
			next.set(pageParamName, "1");
		});
	};

	// Server-side pagination handler
	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set(pageParamName, page.toString());
		});
	};

	// Custom actions renderer with dropdown
	const renderActions = (item: Employee) => {
		const hasLinkedUser = Boolean(item.userId || item.user?.id);
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="flex items-center justify-center w-8 h-8 p-0">
						<MoreVertical className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem onClick={() => handleView(item)}>
						<Eye className="h-4 w-4 mr-2" />
						View Details
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={!hasLinkedUser}
						onClick={() => {
							if (hasLinkedUser) openEnroll(item);
						}}>
						<UserPlus className="h-4 w-4 mr-2" />
						{hasLinkedUser ? "Link device ID" : "No linked user"}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	const dbDeviceUserRows = useMemo(() => {
		const rows = [
			...(dbDeviceUsers?.deviceUsers || []),
			...(openDbDeviceUsers?.deviceUsers || []),
		];
		const byId = new Map<string, DeviceUser>();
		for (const row of rows) {
			if (row?.id) byId.set(row.id, row);
		}
		return Array.from(byId.values());
	}, [dbDeviceUsers?.deviceUsers, openDbDeviceUsers?.deviceUsers]);
	const syncRuns = syncRunsData?.syncRuns || [];
	const latestUserSync = syncRuns.find((run) => run.runType === "DEVICE_USERS");
	const latestLogSync = syncRuns.find((run) => run.runType === "DEVICE_LOGS");
	const recentDeviceActivity = deviceActivity?.events || [];
	const formatActivityOrigin = (row: (typeof recentDeviceActivity)[number]) =>
		row.originLabel || row.origin || row.source || "Saved device event";
	const formatActivityDetail = (row: (typeof recentDeviceActivity)[number]) => {
		const detail = String(row.originDetail || row.correlationId || "").trim();
		if (detail) return detail;
		if (row.origin === "sdk_alarm_callback") return "Real SDK callback path";
		if (row.origin === "biometric_reconcile") return "Reconcile wrote this saved row";
		if (row.origin === "device_user_state_backfill")
			return "Backfilled from saved device-user state";
		return row.source || "-";
	};
	const selectedLogPreview =
		(syncPreview?.devices || []).find(
			(row: DeviceSyncPreviewRow) => row.deviceId === selectedDeviceId,
		) || syncPreview?.devices?.[0];
	const metricValue = (value: unknown) =>
		typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "-";
	const getDeviceVendor = (device: any) => {
		const rawVendor =
			device?.config?.vendor ||
			device?.config?.type ||
			device?.config?.source ||
			"Unclassified";
		const vendor = String(rawVendor || "Unclassified").trim();
		if (!vendor) return "Unclassified";
		if (vendor.toLowerCase().includes("zkteco")) return "ZKTeco";
		if (vendor.toLowerCase().includes("hikvision")) return "Hikvision";
		return vendor;
	};
	const previewByDeviceId = new Map(
		(syncPreview?.devices || []).map((row: DeviceSyncPreviewRow) => [row.deviceId, row]),
	);
	const isSyncPreviewPending = (isLoadingSyncPreview || isFetchingSyncPreview) && devices.length > 0;
	const syncCenterDevices: SyncCenterDeviceItem[] = devices.map((device: any) => {
		const preview = previewByDeviceId.get(device.id);
		const vendor = preview?.vendor || getDeviceVendor(device);
		const missingCount = preview?.missingEventCount ?? preview?.needsSyncEvents;
		const failedCount = preview?.failedEventCount;
		const hasError = Boolean(preview?.error);
		const hasMissing = typeof missingCount === "number" && missingCount > 0;
		const hasFailed = typeof failedCount === "number" && failedCount > 0;
		const status = !preview
			? isSyncPreviewPending
				? "checking"
				: "not_checked"
			: hasError || hasFailed
				? "needs_attention"
				: hasMissing
					? "needs_sync"
					: preview.status || "synced";
		return { device, preview, vendor, status };
	});
	const deviceNeedsUserRefresh = (item: SyncCenterDeviceItem) => {
		const sourceCount = item.preview?.vendorUserCount;
		const hrisCount = item.preview?.hrisUserCount;
		const openCount = item.preview?.openUserCount;
		const conflictCount = item.preview?.conflictUserCount;
		const peerDriftCount = item.preview?.peerDriftTotalCount;
		const hasCountMismatch =
			typeof sourceCount === "number" &&
			typeof hrisCount === "number" &&
			sourceCount !== hrisCount;
		return (
			hasCountMismatch ||
			Number(peerDriftCount || 0) > 0 ||
			Number(openCount || 0) > 0 ||
			Number(conflictCount || 0) > 0 ||
			item.status === "needs_attention"
		);
	};
	const needsAttentionSyncCenterDevices = syncCenterDevices.filter(deviceNeedsUserRefresh);
	const needsAttentionDeviceIds = needsAttentionSyncCenterDevices.map((item) => item.device.id);
	const selectedSyncCenterItem = syncCenterDevices.find(
		(item) => item.device.id === selectedDeviceId,
	);
	const syncCenterHasHikvisionDevices = syncCenterDevices.some(
		(item) => item.vendor === "Hikvision",
	);
	const hikvisionListenerRunning = Boolean(hikvisionListenerStatus?.running);
	const hikvisionSdkState = String(hikvisionListenerStatus?.sdk?.state || "unknown").trim();
	const hikvisionSdkReceiving = Boolean(hikvisionListenerStatus?.sdk?.receivingCallbacks);
	const hikvisionSdkArmed = Boolean(hikvisionListenerStatus?.sdk?.armed);
	const hikvisionListenerUnavailable = Boolean(
		!isLoadingHikvisionListenerStatus &&
		(hikvisionListenerStatusError ||
			!hikvisionListenerStatus?.control?.available ||
			hikvisionListenerStatus?.error),
	);
	const hikvisionListenerToneClass =
		hikvisionSdkReceiving || hikvisionSdkArmed
			? "border-emerald-200 bg-emerald-50 text-emerald-950"
			: hikvisionListenerUnavailable
				? "border-red-200 bg-red-50 text-red-950"
				: "border-amber-200 bg-amber-50 text-amber-950";
	const hikvisionListenerTitle = isLoadingHikvisionListenerStatus
		? "Checking"
		: hikvisionSdkReceiving
			? "Live"
			: hikvisionSdkState === "posting_failed"
				? "Can't reach HRIS"
				: hikvisionSdkState === "login_failed"
					? "Sign-in failed"
					: hikvisionListenerUnavailable
						? "Status unreachable"
						: hikvisionSdkArmed
							? "Ready"
							: hikvisionListenerRunning
								? "No signal yet"
								: "Stopped";
	const formatSyncCenterTime = (value?: string | null) => (value ? formatDateTime(value) : "-");
	const hikvisionRecentLogs = hikvisionListenerStatus?.logs?.recent || [];
	const runSyncCenterListenerAction = (action: "start" | "restart") => {
		hikvisionListenerControl.mutate(action, {
			onSuccess: () => {
				void refetchHikvisionListenerStatus();
			},
		});
	};
	const getDeviceUserSource = (deviceUser?: { rawPayload?: any } | null) => {
		const raw = (deviceUser?.rawPayload || {}) as any;
		const source = raw?.hrisSync?.source || raw?.source || raw?.syncSource || "";
		if (String(source).toLowerCase() === "legacy-backfill") return "historical";
		return "physical";
	};
	const getDeviceUserSourceLabel = (deviceUser?: { rawPayload?: any } | null) =>
		getDeviceUserSource(deviceUser) === "historical"
			? "Historical HRIS backfill"
			: "Physical device";
	const getDeviceUserVendorMetadata = (
		deviceUser?: { vendorMetadata?: any; rawPayload?: any; hrisDeviceUser?: DeviceUser } | null,
	) =>
		deviceUser?.vendorMetadata ||
		deviceUser?.hrisDeviceUser?.vendorMetadata ||
		(deviceUser?.rawPayload
			? {
					source: "rawPayload",
					rawVendorPayload: deviceUser.rawPayload,
				}
			: null);
	const formatMetadataPreview = (value: any, maxLength = 220) => {
		if (!value) return "No vendor metadata saved";
		const text =
			typeof value === "string" ? value : JSON.stringify(value, null, 2) || String(value);
		return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
	};
	const getDeviceUserCredentialSummary = (
		deviceUser?: { rawPayload?: any } | null,
	): DeviceUserCredentialSummary => {
		const raw = (deviceUser?.rawPayload || {}) as any;
		const metaSummary = raw?._hrisDeviceMetadata?.credentialSummary || {};
		const rawFingerprintCount = Number(raw?.numOfFP ?? raw?.UserInfo?.numOfFP ?? 0) || 0;
		const rawCardCount = Number(raw?.numOfCard ?? raw?.UserInfo?.numOfCard ?? 0) || 0;
		const rawFaceCount = Number(raw?.numOfFace ?? raw?.UserInfo?.numOfFace ?? 0) || 0;
		const fingerprintCount = Math.max(
			Number(metaSummary.fingerprintCount ?? 0) || 0,
			rawFingerprintCount,
		);
		const cardCount = Math.max(Number(metaSummary.cardCount ?? 0) || 0, rawCardCount);
		const faceCount = Math.max(Number(metaSummary.faceCount ?? 0) || 0, rawFaceCount);
		return {
			fingerprintCount,
			cardCount,
			faceCount,
			hasFingerprint: Boolean(metaSummary.hasFingerprint ?? fingerprintCount > 0),
			hasCard: Boolean(metaSummary.hasCard ?? cardCount > 0),
			hasFace: Boolean(metaSummary.hasFace ?? faceCount > 0),
		};
	};
	const getDeviceUserSyntheticCredentialSummary = (deviceUser?: { rawPayload?: any } | null) => {
		const raw = (deviceUser?.rawPayload || {}) as any;
		const synthetic = raw?._hrisDeviceMetadata?.syntheticCredentialSummary || {};
		const fingerprintCount = Math.max(0, Number(synthetic.fingerprintCount ?? 0) || 0);
		const faceCount = Math.max(0, Number(synthetic.faceCount ?? 0) || 0);
		return {
			fingerprintCount,
			faceCount,
			hasFingerprint: Boolean(synthetic.hasFingerprint ?? fingerprintCount > 0),
			hasFace: Boolean(synthetic.hasFace ?? faceCount > 0),
			updatedAt: String(synthetic.updatedAt || "").trim() || null,
			copiedFromVendorUserId: String(synthetic.copiedFromVendorUserId || "").trim() || null,
		};
	};
	const getDeviceUserFaceUrl = (deviceUser?: { rawPayload?: any } | null) => {
		const raw = (deviceUser?.rawPayload || {}) as any;
		return String(raw?.faceURL || raw?.UserInfo?.faceURL || "").trim();
	};
	const getDeviceUserDisplayName = (deviceUser?: VisibleDeviceUserRow | null) =>
		deviceUser?.displayName ||
		String((deviceUser?.rawPayload as any)?.name || "").trim() ||
		`User ${deviceUser?.vendorUserId || "-"}`;
	const physicalDeviceUserRows = dbDeviceUserRows.filter(
		(deviceUser) => getDeviceUserSource(deviceUser) === "physical",
	);
	const hrisDeviceUsersByVendorId = new Map<string, DeviceUser>();
	for (const deviceUser of [
		...physicalDeviceUserRows,
		...Object.values(sourceMatchedDeviceUsers),
	]) {
		const vendorUserId = String(deviceUser.vendorUserId || "").trim();
		if (vendorUserId) hrisDeviceUsersByVendorId.set(vendorUserId, deviceUser);
	}
	// Preserve live device list order (device UI "recent" often sits at end of paged
	// UserInfo reads). Higher index = treated as more recent when no lastSyncedAt.
	const liveSourceOrderByVendorId = new Map<string, number>();
	deviceUsers.forEach((user, index) => {
		const vendorUserId = String(user.employeeNo || "").trim();
		if (vendorUserId) liveSourceOrderByVendorId.set(vendorUserId, index);
	});
	const sourceDeviceUserRows = deviceUsers
		.filter((user) => String(user.employeeNo || "").trim())
		.map<VisibleDeviceUserRow>((user) => {
			const vendorUserId = String(user.employeeNo || "").trim();
			const hrisDeviceUser = hrisDeviceUsersByVendorId.get(vendorUserId);
			const isLinkCheckFailed = hasSourceVendorUsers && isSourceMatchedDeviceUsersError;
			const isLinkCheckPending =
				!hrisDeviceUser && isCheckingSourceDeviceUserLinks && !isLinkCheckFailed;
			return {
				key: hrisDeviceUser?.id || `source:${vendorUserId}`,
				vendorUserId,
				employeeNo: hrisDeviceUser?.employeeNo || vendorUserId,
				displayName: hrisDeviceUser?.displayName || user.name || `User ${vendorUserId}`,
				userType: hrisDeviceUser?.userType || user.userType,
				status:
					hrisDeviceUser?.status ||
					(isLinkCheckFailed
						? "LINK_CHECK_FAILED"
						: isLinkCheckPending
							? "CHECKING_LINK"
							: "SOURCE_ONLY"),
				employeeId: hrisDeviceUser?.employeeId || null,
				employee: hrisDeviceUser?.employee || null,
				// Live-on-device users without HRIS sync stamp: treat as "active now" so
				// Current view sorts like the device recent page, not buried by old IDs.
				lastSyncedAt:
					hrisDeviceUser?.lastSyncedAt ||
					(isLinkCheckPending ? null : new Date().toISOString()),
				rawPayload: hrisDeviceUser?.rawPayload || { UserInfo: user },
				vendorMetadata:
					hrisDeviceUser?.vendorMetadata ||
					(hrisDeviceUser?.rawPayload
						? {
								source: "rawPayload",
								rawVendorPayload: hrisDeviceUser.rawPayload,
							}
						: {
								vendor: "Hikvision",
								source: "live_source_user",
								vendorUserId,
								rawVendorPayload: user,
							}),
				hrisDeviceUser,
				sourceUser: user,
			};
		});
	const sourceVendorIds = new Set(sourceDeviceUserRows.map((row) => row.vendorUserId));
	const hrisOnlyDeviceUserRows = physicalDeviceUserRows
		.filter((deviceUser) => !sourceVendorIds.has(String(deviceUser.vendorUserId || "").trim()))
		.map<VisibleDeviceUserRow>((deviceUser) => ({
			key: deviceUser.id,
			vendorUserId: deviceUser.vendorUserId,
			employeeNo: deviceUser.employeeNo,
			displayName: deviceUser.displayName,
			userType: deviceUser.userType,
			status: deviceUser.status,
			employeeId: deviceUser.employeeId,
			employee: deviceUser.employee,
			lastSyncedAt: deviceUser.lastSyncedAt,
			rawPayload: deviceUser.rawPayload,
			vendorMetadata: deviceUser.vendorMetadata,
			hrisDeviceUser: deviceUser,
		}));
	const mergedDeviceUserRows = sourceDeviceUserRows.length
		? [...sourceDeviceUserRows, ...hrisOnlyDeviceUserRows]
		: hrisOnlyDeviceUserRows;
	const viewDeviceUserRows = mergedDeviceUserRows.filter((row) => {
		if (deviceUserView === "source") return Boolean(row.sourceUser);
		if (deviceUserView === "hris") return Boolean(row.hrisDeviceUser);
		if (deviceUserView === "linked") return row.status === "ACTIVE" && Boolean(row.employeeId);
		if (deviceUserView === "open") {
			return row.status === "SOURCE_ONLY" || row.status === "UNMATCHED";
		}
		return true;
	});
	const normalizedDeviceUserSearch = deviceUserSearch.trim().toLowerCase();
	const rankDeviceUserSearchMatch = (row: VisibleDeviceUserRow) => {
		if (!normalizedDeviceUserSearch) return 2;
		const vendor = String(row.vendorUserId || "").toLowerCase();
		const empId = String(row.employee?.employeeId || "").toLowerCase();
		// Exact vendor / employee id first (search "19" → User 19 before 198/1198).
		if (vendor === normalizedDeviceUserSearch || empId === normalizedDeviceUserSearch) return 0;
		if (
			vendor.startsWith(normalizedDeviceUserSearch) ||
			empId.startsWith(normalizedDeviceUserSearch)
		) {
			return 1;
		}
		return 2;
	};
	const deviceUserActivityMs = (row: VisibleDeviceUserRow) => {
		const candidates = [
			row.lastSyncedAt,
			(row.hrisDeviceUser as any)?.updatedAt,
			(row.hrisDeviceUser as any)?.createdAt,
			(row.hrisDeviceUser as any)?.lastSyncedAt,
		];
		let best = 0;
		for (const value of candidates) {
			const ms = value ? Date.parse(String(value)) : NaN;
			if (Number.isFinite(ms) && ms > best) best = ms;
		}
		return best;
	};
	const visibleDeviceUserRows = viewDeviceUserRows
		.filter((row) => {
			const statusMatch =
				deviceUserStatus === "all" ||
				row.status === deviceUserStatus ||
				(deviceUserStatus === "UNMATCHED" && row.status === "SOURCE_ONLY");
			if (!statusMatch) return false;
			if (!normalizedDeviceUserSearch) return true;
			const vendor = String(row.vendorUserId || "").toLowerCase();
			const empId = String(row.employee?.employeeId || "").toLowerCase();
			const name = String(row.displayName || "").toLowerCase();
			const empName = String(row.employee?.fullName || "").toLowerCase();
			// Prefer exact/prefix on ids; still allow contains on names.
			return (
				vendor === normalizedDeviceUserSearch ||
				empId === normalizedDeviceUserSearch ||
				vendor.startsWith(normalizedDeviceUserSearch) ||
				empId.startsWith(normalizedDeviceUserSearch) ||
				vendor.includes(normalizedDeviceUserSearch) ||
				empId.includes(normalizedDeviceUserSearch) ||
				name.includes(normalizedDeviceUserSearch) ||
				empName.includes(normalizedDeviceUserSearch)
			);
		})
		.sort((left, right) => {
			const rankDelta = rankDeviceUserSearchMatch(left) - rankDeviceUserSearchMatch(right);
			if (rankDelta !== 0) return rankDelta;
			// On-device (live source) first — matches Hikvision Person Management "recent" feel.
			const leftLive = left.sourceUser ? 0 : 1;
			const rightLive = right.sourceUser ? 0 : 1;
			if (leftLive !== rightLive) return leftLive - rightLive;
			// Newest activity first (lastSynced / created / updated).
			const timeDelta = deviceUserActivityMs(right) - deviceUserActivityMs(left);
			if (timeDelta !== 0) return timeDelta;
			// Prefer later position in live device read (often last page / newest).
			const leftOrder = liveSourceOrderByVendorId.get(String(left.vendorUserId || "")) ?? -1;
			const rightOrder = liveSourceOrderByVendorId.get(String(right.vendorUserId || "")) ?? -1;
			if (leftOrder !== rightOrder) return rightOrder - leftOrder;
			const leftNum = Number(left.vendorUserId);
			const rightNum = Number(right.vendorUserId);
			if (Number.isFinite(leftNum) && Number.isFinite(rightNum) && leftNum !== rightNum) {
				return rightNum - leftNum;
			}
			return String(right.vendorUserId || "").localeCompare(String(left.vendorUserId || ""));
		});
	const deviceUserTotalPages = Math.max(
		Math.ceil(visibleDeviceUserRows.length / deviceUserLimit),
		1,
	);
	const safeDeviceUserPage = Math.min(deviceUserPage, deviceUserTotalPages);
	const pagedDeviceUserRows = visibleDeviceUserRows.slice(
		(safeDeviceUserPage - 1) * deviceUserLimit,
		safeDeviceUserPage * deviceUserLimit,
	);

	// From Device Events: /devices?action=device-users&deviceUserDetails=14 → open that user's modal.
	useEffect(() => {
		if (!deviceUserDetailsParam) return;
		if (activePanel !== "users") return;
		const target = String(deviceUserDetailsParam).trim();
		if (!target) return;
		const match =
			visibleDeviceUserRows.find(
				(row) => String(row.vendorUserId || "").trim() === target,
			) ||
			visibleDeviceUserRows.find(
				(row) => String(row.employeeNo || "").trim() === target,
			) ||
			null;
		if (!match) return;
		if (String(detailsDeviceUser?.vendorUserId || "").trim() === target) return;
		setDetailsDeviceUser(match);
	}, [
		deviceUserDetailsParam,
		activePanel,
		visibleDeviceUserRows,
		detailsDeviceUser?.vendorUserId,
	]);

	const selectedExportVendorUserIdSet = new Set(selectedExportVendorUserIds);
	const allPagedRowsSelected =
		pagedDeviceUserRows.length > 0 &&
		pagedDeviceUserRows.every((row) => selectedExportVendorUserIdSet.has(row.vendorUserId));
	const toggleExportVendorUserId = (vendorUserId: string, selected: boolean) => {
		setSelectedExportVendorUserIds((current) => {
			const next = new Set(current);
			if (selected) next.add(vendorUserId);
			else next.delete(vendorUserId);
			return Array.from(next);
		});
	};
	const togglePagedExportVendorUserIds = (selected: boolean) => {
		setSelectedExportVendorUserIds((current) => {
			const next = new Set(current);
			for (const row of pagedDeviceUserRows) {
				if (selected) next.add(row.vendorUserId);
				else next.delete(row.vendorUserId);
			}
			return Array.from(next);
		});
	};
	const deviceUserSummary = deviceUserSummaryData?.summary;
	const physicalSourceCount =
		selectedSyncCenterItem?.preview?.vendorUserCount ?? sourceDeviceUserRows.length;
	const physicalHrisUserCount = deviceUserSummary?.total ?? physicalDeviceUserRows.length;
	const shownDeviceUserCount = visibleDeviceUserRows.length;
	const linkedPhysicalUserCount =
		deviceUserSummary?.matched ??
		mergedDeviceUserRows.filter(
			(deviceUser) => deviceUser.status === "ACTIVE" && Boolean(deviceUser.employeeId),
		).length;
	const openPhysicalUserCount =
		deviceUserSummary?.unmatched ??
		mergedDeviceUserRows.filter(
			(deviceUser) =>
				deviceUser.status === "SOURCE_ONLY" || deviceUser.status === "UNMATCHED",
		).length;
	const usersToSaveCount = Math.max(Number(physicalSourceCount || 0) - physicalHrisUserCount, 0);
	const completedDeviceUserSyncItems = [
		["Read from device", deviceUserSyncState.summary?.totalSourceRecords],
		["Imported to HRIS", deviceUserSyncState.summary?.importableRecords],
		["Created", deviceUserSyncState.summary?.created],
		["Updated", deviceUserSyncState.summary?.updated],
		["Auto-linked", deviceUserSyncState.summary?.linked],
		["Needs link", deviceUserSyncState.summary?.unmatched],
		["Needs review", deviceUserSyncState.summary?.conflict],
		[
			"Skipped/off",
			(deviceUserSyncState.summary?.skipped || 0) +
				(deviceUserSyncState.summary?.disabled || 0),
		],
	] as const;
	const effectiveDeviceUserSyncJobProgress =
		activeDeviceUserSyncJob &&
		deviceUserSyncJobProgress &&
		isDeviceUserSyncProgressFresh(deviceUserSyncJobProgress)
			? deviceUserSyncJobProgress
			: bulkDeviceUserSyncState.lastProgress || null;
	const hasEffectiveDeviceUserSyncJobProgress = Boolean(effectiveDeviceUserSyncJobProgress);
	const effectiveDeviceUserSyncJobStatus = effectiveDeviceUserSyncJobProgress?.status;
	const deviceUserSyncJobProcessed = Number(
		effectiveDeviceUserSyncJobProgress?.processedDevices || 0,
	);
	const deviceUserSyncJobTotal = Math.max(
		Number(effectiveDeviceUserSyncJobProgress?.totalDevices || syncCenterDevices.length || 1),
		1,
	);
	const deviceUserSyncJobMode =
		effectiveDeviceUserSyncJobProgress?.syncMode || DEFAULT_BULK_DEVICE_USER_SYNC_MODE;
	const deviceUserSyncBiometricProcessed = Number(
		effectiveDeviceUserSyncJobProgress?.biometricProcessed || 0,
	);
	const deviceUserSyncBiometricTotal = Number(
		effectiveDeviceUserSyncJobProgress?.biometricTotal || 0,
	);
	const deviceUserSyncBiometricRemaining = Math.max(
		deviceUserSyncBiometricTotal - deviceUserSyncBiometricProcessed,
		0,
	);
	const deviceUserSyncJobPercent = effectiveDeviceUserSyncJobProgress
		? effectiveDeviceUserSyncJobStatus === "completed"
			? 100
			: deviceUserSyncBiometricTotal > 0
			? Math.min(
					99,
					Math.round(
						(deviceUserSyncBiometricProcessed / deviceUserSyncBiometricTotal) *
							100,
					),
				)
			: Math.min(100, Math.round((deviceUserSyncJobProcessed / deviceUserSyncJobTotal) * 100))
		: 0;
	const deviceUserSyncJobIsProcessing = effectiveDeviceUserSyncJobStatus === "processing";
	const deviceUserSyncCurrentModality =
		effectiveDeviceUserSyncJobProgress?.currentModality === "fingerprint"
			? "Fingerprint"
			: effectiveDeviceUserSyncJobProgress?.currentModality === "face"
				? "Face"
				: "Preparing";
	const deviceUserSyncElapsed = formatDeviceUserSyncElapsed(
		effectiveDeviceUserSyncJobProgress?.startedAt,
		effectiveDeviceUserSyncJobProgress?.completedAt,
	);
	const deviceUserSyncLastProgressAt =
		effectiveDeviceUserSyncJobProgress?.updatedAt ||
		effectiveDeviceUserSyncJobProgress?.completedAt ||
		effectiveDeviceUserSyncJobProgress?.startedAt ||
		null;
	const deviceUserSyncStatusBubble = deviceUserSyncJobIsProcessing
		? deviceUserSyncBiometricTotal > 0
			? metricValue(deviceUserSyncBiometricRemaining)
			: "Live"
		: hasEffectiveDeviceUserSyncJobProgress
			? effectiveDeviceUserSyncJobStatus === "completed"
				? "Done"
				: metricValue(effectiveDeviceUserSyncJobProgress?.biometricFailed || 0)
			: null;
	const deviceUserSyncJobCancelRequested = Boolean(
		effectiveDeviceUserSyncJobProgress?.cancelRequested,
	);
	const deviceUserSyncJobToneClass =
		effectiveDeviceUserSyncJobStatus === "failed"
			? "border-red-200 bg-red-50 text-red-950"
			: effectiveDeviceUserSyncJobStatus === "cancelled"
				? "border-amber-200 bg-amber-50 text-amber-950"
				: effectiveDeviceUserSyncJobStatus === "completed"
					? "border-emerald-200 bg-emerald-50 text-emerald-950"
					: "border-orange-200 bg-orange-50 text-orange-950";
	const deviceUserSyncJobFillClass =
		effectiveDeviceUserSyncJobStatus === "failed"
			? "bg-red-600"
			: effectiveDeviceUserSyncJobStatus === "cancelled"
				? "bg-amber-600"
				: effectiveDeviceUserSyncJobStatus === "completed"
					? "bg-emerald-600"
					: "bg-orange-600";
	const deviceUserSyncJobTitle =
		effectiveDeviceUserSyncJobStatus === "cancelled"
			? "Sync cancelled"
			: effectiveDeviceUserSyncJobStatus === "failed"
				? "Sync needs attention"
				: effectiveDeviceUserSyncJobStatus === "completed"
					? "Sync finished"
					: deviceUserSyncJobIsProcessing
						? deviceUserSyncJobCancelRequested
							? "Cancelling device-user refresh"
							: deviceUserSyncJobMode === "needs_attention_only"
								? "Refreshing mismatches"
								: deviceUserSyncJobMode === "peer_converge"
									? "Making peers match best truth"
									: "Refreshing all device users"
						: "Device-user sync status";
	const bulkDeviceUserSyncSummaryItems = [
		["Captured", effectiveDeviceUserSyncJobProgress?.biometricCaptured ?? 0],
		["Failed", effectiveDeviceUserSyncJobProgress?.biometricFailed ?? 0],
		["Already present", effectiveDeviceUserSyncJobProgress?.biometricCached ?? 0],
		["Remaining", deviceUserSyncBiometricRemaining],
	] as const;
	const bulkDeviceUserSyncResults = effectiveDeviceUserSyncJobProgress?.results || [];
	const deviceUserSyncJobSummary = effectiveDeviceUserSyncJobProgress
		? deviceUserSyncJobIsProcessing
			? `${deviceUserSyncCurrentModality} custody for user ${effectiveDeviceUserSyncJobProgress.currentVendorUserId || "—"} on ${effectiveDeviceUserSyncJobProgress.currentDeviceName || "the selected device"}.`
			: `${metricValue(effectiveDeviceUserSyncJobProgress.biometricCaptured)} encrypted biometric payloads captured; ${metricValue(effectiveDeviceUserSyncJobProgress.biometricFailed)} still need attention.`
		: "";
	const bulkDeviceUserSyncToneClass =
		bulkDeviceUserSyncState.status === "error"
			? "border-red-200 bg-red-50 text-red-950"
			: bulkDeviceUserSyncState.status === "starting"
				? "border-orange-200 bg-orange-50 text-orange-950"
				: "border-orange-200 bg-orange-50 text-orange-950";
	const bulkDeviceUserSyncTitle =
		bulkDeviceUserSyncState.status === "error"
			? "Sync could not start"
			: bulkDeviceUserSyncState.status === "starting"
				? "Starting device-user sync"
				: bulkDeviceUserSyncState.message ||
					"Reread live device users across your configured devices.";
	const bulkDeviceUserSyncModeDescription =
		bulkDeviceUserSyncMode === "needs_attention_only"
			? "Refresh only devices with count gaps, peer drift, open links, conflicts, or errors."
			: bulkDeviceUserSyncMode === "peer_converge"
				? "Refresh all devices, pick the recommended source device, then copy missing peer users with retries."
				: "Reread every configured device user and refresh saved biometric counts.";
	const bulkDeviceUserSyncScopeItems = [
		["All devices", syncCenterDevices.length],
		["Only mismatches", needsAttentionSyncCenterDevices.length],
		["Best-truth converge", syncCenterDevices.length],
	] as const;
	const getSyncStatusLabel = (status: string) => {
		if (status === "synced") return "Synced";
		if (status === "checking") return "Checking";
		if (status === "needs_sync") return "Needs sync";
		if (status === "needs_attention") return "Needs attention";
		if (status === "source_total_unavailable") return "Source unavailable";
		return "Not checked";
	};
	const getSyncStatusBadge = (status: string) => {
		if (status === "synced") return "success";
		if (status === "checking") return "secondary";
		if (status === "needs_attention") return "destructive";
		if (status === "needs_sync" || status === "source_total_unavailable") return "warning";
		return "secondary";
	};
	const getSourceReadLabel = (vendor?: string) => {
		const normalized = String(vendor || "").toLowerCase();
		if (normalized.includes("hikvision")) return "ISAPI source";
		if (normalized.includes("zkteco")) return "SDK source";
		return "Device API";
	};
	const openDevicePanel = (deviceId: string, panel: "users" | "logs" | "runs") => {
		updateSearchParams((next) => {
			next.set("deviceId", deviceId);
			next.set("syncPanel", panel);
			next.set("action", panel === "users" ? "device-users" : "sync-review");
		});
	};
	const openPhysicalDeviceUsers = (deviceId: string) => {
		updateSearchParams((next) => {
			next.set("deviceId", deviceId);
			next.set("syncPanel", "users");
			next.set("action", "device-users");
			next.set("deviceUserView", "source");
			next.delete("deviceUserStatus");
			next.delete("deviceUserSearch");
			next.set("deviceUserPage", "1");
		});
	};
	const openDeviceUserCount = (
		deviceId: string,
		view: "source" | "shown" | "hris" | "linked" | "open",
	) => {
		updateSearchParams((next) => {
			next.set("deviceId", deviceId);
			next.set("syncPanel", "users");
			next.set("action", "device-users");
			if (view === "shown") next.delete("deviceUserView");
			else next.set("deviceUserView", view);
			if (view === "open") next.set("deviceUserStatus", "UNMATCHED");
			else next.delete("deviceUserStatus");
			next.delete("deviceUserSearch");
			next.set("deviceUserPage", "1");
		});
	};
	const openDeviceEvents = (view = "saved") => {
		if (!selectedDeviceId) return;
		navigate(
			`/admin/configuration/devices/events?deviceId=${encodeURIComponent(selectedDeviceId)}&view=${view}`,
		);
	};
	const pagedExportVendorUserIds = pagedDeviceUserRows
		.map((row) => String(row.vendorUserId || "").trim())
		.filter(Boolean);
	const deviceUserExportScopeCount =
		deviceUserExportState.selection === "selectedRows"
			? selectedExportVendorUserIds.length
			: deviceUserExportState.selection === "currentPage"
				? pagedExportVendorUserIds.length
				: deviceUserExportState.selection === "filtered"
					? shownDeviceUserCount
					: mergedDeviceUserRows.length;
	const isLoadingDeviceUserExportRows =
		deviceUserExportState.open &&
		(isLoadingDeviceUsers ||
			isFetchingDeviceUsers ||
			isLoadingDbDeviceUsers ||
			isCheckingSourceDeviceUserLinks);
	const deviceUserExportCountLabel = (count: number) =>
		isLoadingDeviceUserExportRows ? "Loading…" : `${count} rows`;
	const deviceUserExportScopeCountLabel =
		deviceUserExportState.selection === "selectedRows"
			? `${deviceUserExportScopeCount} rows`
			: deviceUserExportCountLabel(deviceUserExportScopeCount);
	const deviceUserExportScopeLabel =
		deviceUserExportState.selection === "selectedRows"
			? "Selected rows"
			: deviceUserExportState.selection === "currentPage"
				? "Current page"
				: deviceUserExportState.selection === "filtered"
					? "Current filter"
					: "All device users";
	const escapeCsvValue = (value: unknown) => {
		const text = value === null || value === undefined ? "" : String(value);
		return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	};
	const getSdkMergeCountButtonClass = (isActive: boolean, count: number) => {
		const base = "rounded border px-2 py-1 text-left text-xs font-semibold transition";
		if (isActive) return `${base} border-orange-300 bg-orange-50 text-orange-950`;
		if (count > 0) return `${base} border-amber-200 bg-amber-50 text-amber-950 hover:border-amber-300`;
		return `${base} border-slate-200 bg-white text-slate-950`;
	};
	const getSdkMergeChoiceButtonClass = (
		isActive: boolean,
		tone: "orange" | "emerald" = "orange",
	) => {
		const base = "rounded-md border px-2 py-2 text-xs";
		if (!isActive) return `${base} border-slate-200 bg-white text-slate-950`;
		return tone === "emerald"
			? `${base} border-emerald-400 bg-emerald-50 text-emerald-950`
			: `${base} border-orange-400 bg-orange-50 text-orange-950`;
	};
	const parseDeviceUserCsvText = (text: string) => {
		const rows: string[][] = [];
		let cell = "";
		let row: string[] = [];
		let inQuotes = false;
		const normalizedText = text.replace(/^\uFEFF/, "");
		for (let index = 0; index < normalizedText.length; index += 1) {
			const char = normalizedText[index];
			const nextChar = normalizedText[index + 1];
			if (char === '"' && inQuotes && nextChar === '"') {
				cell += '"';
				index += 1;
			} else if (char === '"') {
				inQuotes = !inQuotes;
			} else if (char === "," && !inQuotes) {
				row.push(cell);
				cell = "";
			} else if ((char === "\n" || char === "\r") && !inQuotes) {
				if (char === "\r" && nextChar === "\n") index += 1;
				row.push(cell);
				if (row.some((value) => value.trim())) rows.push(row);
				row = [];
				cell = "";
			} else {
				cell += char;
			}
		}
		row.push(cell);
		if (row.some((value) => value.trim())) rows.push(row);
		if (rows.length < 2) return [];
		const headers = rows[0].map((header) => header.trim());
		return rows.slice(1).map((values) =>
			Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
		);
	};
	const parseCsvNumber = (value: unknown) => {
		const numberValue = Number(value);
		return Number.isFinite(numberValue) ? numberValue : 0;
	};
	const parseCsvBoolean = (value: unknown) => {
		const normalized = String(value || "").trim().toLowerCase();
		return ["true", "yes", "1", "present"].includes(normalized);
	};
	const normalizeEncryptedTemplateValue = (value: unknown) => {
		if (!value) return "";
		if (typeof value === "string") return value.trim();
		try {
			return JSON.stringify(value);
		} catch {
			return "";
		}
	};
	const getRawTemplateColumnValue = (user: any, key: string) => {
		const directValue =
			user?.[key] ||
			user?.rawPayload?.[key] ||
			user?.vendorMetadata?.[key] ||
			user?.rawPayload?._hrisDeviceMetadata?.[key] ||
			user?.vendorMetadata?.biometricBundle?.[key];
		return normalizeEncryptedTemplateValue(directValue);
	};
	const getPortableTemplateEnvelopeValue = (
		value: string,
		expected: {
			modality: "fingerprint" | "face";
			deviceId: string;
			vendorUserId: string;
		},
	) => {
		if (!value.startsWith("{")) return "";
		try {
			const envelope = JSON.parse(value) as Record<string, any>;
			const valid =
				envelope.format === "project-truth.hikvision-biometric-template.v2" &&
				envelope.algorithm === "aes-256-gcm" &&
				envelope.keySource === "passphrase-scrypt" &&
				envelope.modality === expected.modality &&
				String(envelope.deviceId || "") === expected.deviceId &&
				String(envelope.vendorUserId || "") === expected.vendorUserId &&
				Boolean(envelope.salt && envelope.iv && envelope.authTag && envelope.ciphertext) &&
				/^[a-f0-9]{64}$/i.test(String(envelope.plaintextSha256 || ""));
			return valid ? JSON.stringify(envelope) : "";
		} catch {
			return "";
		}
	};
	const encodeSpreadsheetTemplateValue = (envelopeJson: string) => {
		if (!envelopeJson) return "";
		const bytes = new TextEncoder().encode(envelopeJson);
		let binary = "";
		for (const byte of bytes) binary += String.fromCharCode(byte);
		return `${DEVICE_USER_SPREADSHEET_TEMPLATE_PREFIX}${btoa(binary)
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/g, "")}`;
	};
	const decodeSpreadsheetTemplateValue = (value: unknown) => {
		const raw = String(value || "").trim();
		if (!raw || raw === "not_enrolled" || raw === "missing_encrypted_template" || raw === "not_requested") {
			return "";
		}
		if (raw.startsWith("{")) return raw;
		if (!raw.startsWith(DEVICE_USER_SPREADSHEET_TEMPLATE_PREFIX)) return "";
		try {
			const encoded = raw.slice(DEVICE_USER_SPREADSHEET_TEMPLATE_PREFIX.length);
			const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
			const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
			const binary = atob(padded);
			const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
			return new TextDecoder().decode(bytes);
		} catch {
			return "";
		}
	};
	const getSpreadsheetTemplateValue = (envelopeJson: string, credentialCount: number) => {
		if (envelopeJson) return encodeSpreadsheetTemplateValue(envelopeJson);
		return credentialCount > 0 ? "missing_encrypted_template" : "not_enrolled";
	};
	const getDeviceUserCsvHeaders = () => [
		"sourceDeviceName",
		"sourceDeviceId",
		"vendorUserId",
		"employeeNo",
		"displayName",
		"hrisEmployeeId",
		"employeeName",
		"status",
		"userType",
		"linkedToHris",
		"cardCount",
		"fingerprintCount",
		"faceCount",
		...DEVICE_USER_BIOMETRIC_CSV_COLUMNS,
		"exportedAt",
	];
	const buildDeviceUserImportPayloadFromCsv = (
		text: string,
		fileName = "device-users.csv",
	): DeviceUserExportPayload => {
		const rows = parseDeviceUserCsvText(text);
		const importRows = rows
			.map((row) => {
				const sourceDeviceId = String(row.sourceDeviceId || "csv-import").trim();
				const vendorUserId = String(row.vendorUserId || "").trim();
				const fingerprintRawTemplateBlob = decodeSpreadsheetTemplateValue(row.fingerprintTemplate);
				const faceRawTemplateBlob = decodeSpreadsheetTemplateValue(row.faceTemplate);
				return {
					sourceDeviceName: String(row.sourceDeviceName || "CSV import").trim(),
					sourceDeviceId,
					vendorUserId,
					employeeNo: String(row.employeeNo || row.vendorUserId || "").trim(),
					displayName: String(row.displayName || "").trim(),
					hrisEmployeeId: String(row.hrisEmployeeId || "").trim(),
					employeeName: String(row.employeeName || "").trim(),
					status: String(row.status || "UNMATCHED").trim(),
					userType: String(row.userType || "").trim(),
					cardCount: parseCsvNumber(row.cardCount),
					fingerprintCount: parseCsvNumber(row.fingerprintCount),
					faceCount: parseCsvNumber(row.faceCount),
					fingerprintTemplate: String(row.fingerprintTemplate || "not_requested").trim(),
					faceTemplate: String(row.faceTemplate || "not_requested").trim(),
					biometricBundleStatus:
						fingerprintRawTemplateBlob || faceRawTemplateBlob
							? "spreadsheet_encrypted_templates"
							: "not_present",
					biometricBundlePresent: Boolean(fingerprintRawTemplateBlob || faceRawTemplateBlob),
					biometricBundleAlgorithm:
						fingerprintRawTemplateBlob || faceRawTemplateBlob ? "aes-256-gcm" : "",
					biometricBundleRequiredForRawImport: Boolean(
						fingerprintRawTemplateBlob || faceRawTemplateBlob,
					),
					biometricTransferMode: String(
						row.biometricTransferMode ||
							(fingerprintRawTemplateBlob || faceRawTemplateBlob
								? "encryptedBundle"
								: "metadataOnly"),
					).trim(),
					fingerprintRawTemplateBlob,
					faceRawTemplateBlob,
					rawBiometricPlaintextPolicy: DEVICE_USER_CSV_NO_PLAINTEXT_POLICY,
					rawBiometricSource:
						fingerprintRawTemplateBlob || faceRawTemplateBlob
							? "csv_compact_encrypted_template"
							: "csv_review_sheet",
				};
			})
			.filter((row) => row.vendorUserId);
		if (!importRows.length) {
			throw new Error("CSV must include at least one row with vendorUserId.");
		}
		const devicesById = new Map<string, typeof importRows>();
		for (const row of importRows) {
			const sourceDeviceId = row.sourceDeviceId || "csv-import";
			devicesById.set(sourceDeviceId, [...(devicesById.get(sourceDeviceId) || []), row]);
		}
		const exportedAt = new Date().toISOString();
		return {
			schemaVersion: "project-truth.hikvision-device-users.v1",
			exportedAt,
			scope: {
				type: "currentDevice",
				sourceEndpoint: fileName,
				selection: "currentPage",
				status: "all",
			},
			policy: {
				importedFrom: "csv",
				plaintextBiometricExposed: false,
				note: "CSV import carries compact encrypted biometric template values in fingerprintTemplate and faceTemplate. The passphrase is supplied separately during preview/import.",
				rawTemplateColumns: DEVICE_USER_BIOMETRIC_CSV_COLUMNS,
			},
			biometricBundle: {
				present: importRows.some((row) =>
					Boolean(row.fingerprintRawTemplateBlob || row.faceRawTemplateBlob),
				),
				requiredForPortableTemplateImport: importRows.some((row) =>
					Boolean(row.fingerprintRawTemplateBlob || row.faceRawTemplateBlob),
				),
				algorithm: importRows.some((row) =>
					Boolean(row.fingerprintRawTemplateBlob || row.faceRawTemplateBlob),
				)
					? "aes-256-gcm"
					: null,
				status: importRows.some((row) =>
					Boolean(row.fingerprintRawTemplateBlob || row.faceRawTemplateBlob),
				)
					? "spreadsheet_encrypted_templates"
					: "not_present",
				reason:
					"CSV/Excel compact template cells are decoded internally and validated by the guarded encrypted bundle import preview.",
				plaintextPolicy: DEVICE_USER_CSV_NO_PLAINTEXT_POLICY,
			},
			devices: Array.from(devicesById.entries()).map(([sourceDeviceId, deviceRows]) => ({
				device: {
					id: sourceDeviceId,
					name: deviceRows[0]?.sourceDeviceName || "CSV import",
					address: "",
					port: 0,
					protocol: "https",
				},
				sourceRead: {
					status: "csv_import",
					endpoint: fileName,
					total: deviceRows.length,
				},
				capabilities: {
					support: {
						userExport: true,
						cardExport: true,
						fingerprintExport: false,
						fingerprintImport: true,
						faceImportExport: true,
					},
					policy: {
						rawBiometricTemplateBytes: "explicit_csv_columns_no_plaintext",
					},
				},
				summary: {
					totalUsers: deviceRows.length,
					readFromDevice: deviceRows.length,
					savedInHris: deviceRows.length,
					linked: deviceRows.filter((row) => row.hrisEmployeeId).length,
					unlinked: deviceRows.filter((row) => !row.hrisEmployeeId).length,
					credentialTypes: {
						card: "count_only",
						fingerprint: "count_only_requires_sdk_peer_copy",
						face: "count_only_requires_sdk_peer_copy",
					},
					selection: {
						mode: "currentPage",
						matchedRows: deviceRows.length,
						totalRowsBeforeSelection: deviceRows.length,
					},
				},
				users: deviceRows.map((row) => ({
					id: `${sourceDeviceId}:${row.vendorUserId}`,
					organizationId: "",
					deviceId: sourceDeviceId,
					vendorUserId: row.vendorUserId,
					employeeNo: row.employeeNo || row.vendorUserId,
					displayName: row.displayName,
					userType: row.userType,
					status: row.status === "ACTIVE" ? "ACTIVE" : "UNMATCHED",
					employeeId: row.hrisEmployeeId || null,
					employee: row.hrisEmployeeId
						? {
								id: row.hrisEmployeeId,
								employeeId: row.hrisEmployeeId,
								fullName: row.employeeName || null,
							}
						: null,
					rawPayload: {
						_hrisDeviceMetadata: {
							source: "csv_import",
							credentialSummary: {
								cardCount: row.cardCount,
								fingerprintCount: row.fingerprintCount,
								faceCount: row.faceCount,
								hasCard: row.cardCount > 0,
								hasFingerprint: row.fingerprintCount > 0,
								hasFace: row.faceCount > 0,
							},
							plaintextBiometricExposed: false,
							biometricCsvColumns: {
								fingerprintTemplate: row.fingerprintTemplate,
								faceTemplate: row.faceTemplate,
								biometricBundleStatus: row.biometricBundleStatus,
								biometricBundlePresent: row.biometricBundlePresent,
								biometricBundleAlgorithm: row.biometricBundleAlgorithm || null,
								biometricBundleRequiredForRawImport:
									row.biometricBundleRequiredForRawImport,
								biometricTransferMode: row.biometricTransferMode,
								fingerprintRawTemplateBlob: row.fingerprintRawTemplateBlob,
								faceRawTemplateBlob: row.faceRawTemplateBlob,
								rawBiometricPlaintextPolicy: row.rawBiometricPlaintextPolicy,
								rawBiometricSource: row.rawBiometricSource,
							},
						},
					},
				})),
			})),
			summary: {
				devices: devicesById.size,
				totalUsers: importRows.length,
				linked: importRows.filter((row) => row.hrisEmployeeId).length,
				unlinked: importRows.filter((row) => !row.hrisEmployeeId).length,
			},
		};
	};
	const buildDeviceUserCsvTemplate = () => {
		const headers = getDeviceUserCsvHeaders();
		const sourceRow = pagedDeviceUserRows[0];
		const sampleCredentialSummary = getDeviceUserCredentialSummary(sourceRow);
		const sampleRow = sourceRow
			? {
					sourceDeviceName: selectedDevice?.name || "",
					sourceDeviceId: selectedDeviceId || "",
					vendorUserId: sourceRow.vendorUserId || "",
					employeeNo: sourceRow.vendorUserId || "",
					displayName: sourceRow.displayName || "",
					hrisEmployeeId: sourceRow.employee?.employeeId || "",
					employeeName: sourceRow.employee?.fullName || "",
					status: sourceRow.status || "",
					userType: sourceRow.userType || "",
					linkedToHris: sourceRow.employeeId ? "Yes" : "No",
					cardCount: sampleCredentialSummary.cardCount,
					fingerprintCount: sampleCredentialSummary.fingerprintCount,
					faceCount: sampleCredentialSummary.faceCount,
					fingerprintTemplate:
						sampleCredentialSummary.fingerprintCount > 0
							? "missing_encrypted_template"
							: "not_enrolled",
					faceTemplate:
						sampleCredentialSummary.faceCount > 0
							? "missing_encrypted_template"
							: "not_enrolled",
					exportedAt: new Date().toISOString(),
				}
			: {
					sourceDeviceName: selectedDevice?.name || "Source device",
					sourceDeviceId: selectedDeviceId || "source-device-id",
					vendorUserId: "1001",
					employeeNo: "1001",
					displayName: "Sample Device User",
					hrisEmployeeId: "EMP-1001",
					employeeName: "Sample Employee",
					status: "ACTIVE",
					userType: "normal",
					linkedToHris: "Yes",
					cardCount: 1,
					fingerprintCount: 1,
					faceCount: 0,
					fingerprintTemplate: "missing_encrypted_template",
					faceTemplate: "not_enrolled",
					exportedAt: new Date().toISOString(),
				};
		return [
			headers.join(","),
			headers.map((header) => escapeCsvValue((sampleRow as any)[header])).join(","),
		].join("\r\n");
	};
	const buildDeviceUserExportRows = (payload: DeviceUserExportPayload) =>
		(payload.devices || []).flatMap((device: any) =>
			(device.users || []).map((user: any) => {
				const credentialSummary =
					user.credentialSummary ||
					user.rawPayload?._hrisDeviceMetadata?.credentialSummary ||
					user.vendorMetadata?.credentialSummary ||
					{};
				const sourceDeviceId = String(device.device?.id || "");
				const vendorUserId = String(user.vendorUserId || user.employeeNo || "");
				const fingerprintRawTemplateBlob = getPortableTemplateEnvelopeValue(
					getRawTemplateColumnValue(user, "fingerprintRawTemplateBlob"),
					{ modality: "fingerprint", deviceId: sourceDeviceId, vendorUserId },
				);
				const faceRawTemplateBlob = getPortableTemplateEnvelopeValue(
					getRawTemplateColumnValue(user, "faceRawTemplateBlob"),
					{ modality: "face", deviceId: sourceDeviceId, vendorUserId },
				);
				const fingerprintBundlePresent = fingerprintRawTemplateBlob.trim().startsWith("{");
				const faceBundlePresent = faceRawTemplateBlob.trim().startsWith("{");
				const fingerprintTemplate = getSpreadsheetTemplateValue(
					fingerprintBundlePresent ? fingerprintRawTemplateBlob : "",
					Number(credentialSummary.fingerprintCount || 0),
				);
				const faceTemplate = getSpreadsheetTemplateValue(
					faceBundlePresent ? faceRawTemplateBlob : "",
					Number(credentialSummary.faceCount || 0),
				);
				return {
					sourceDeviceName: device.device?.name || "",
					sourceDeviceId: device.device?.id || "",
					vendorUserId: user.vendorUserId || "",
					employeeNo: user.employeeNo || "",
					displayName: user.displayName || "",
					hrisEmployeeId: user.employee?.employeeId || user.employeeId || "",
					employeeName: user.employee?.fullName || "",
					status: user.status || "",
					userType: user.userType || "",
					linkedToHris: user.employeeId || user.employee?.id ? "Yes" : "No",
					cardCount: Number(credentialSummary.cardCount || 0),
					fingerprintCount: Number(credentialSummary.fingerprintCount || 0),
					faceCount: Number(credentialSummary.faceCount || 0),
					fingerprintTemplate,
					faceTemplate,
					exportedAt: payload.exportedAt || "",
				};
			}),
		);
	const downloadDeviceUserExport = (
		payload: DeviceUserExportPayload,
		format: DeviceUserExportFormat,
		fileBaseName: string,
	) => {
		const rows = buildDeviceUserExportRows(payload);
		let blob: Blob;
		let extension: string;
		if (format === "json") {
			blob = new Blob([JSON.stringify(payload, null, 2)], {
				type: "application/json;charset=utf-8",
			});
			extension = "json";
		} else {
			const headers = getDeviceUserCsvHeaders();
			if (format === "csv") {
				const csv = [
					headers.join(","),
					...rows.map((row) => headers.map((header) => escapeCsvValue((row as any)[header])).join(",")),
				].join("\r\n");
				blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
				extension = "csv";
			} else {
				const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...headers] });
				const workbook = XLSX.utils.book_new();
				XLSX.utils.book_append_sheet(workbook, worksheet, "Device users");
				const workbookBytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
				blob = new Blob([workbookBytes], {
					type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				});
				extension = "xlsx";
			}
		}
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `${fileBaseName}.${extension}`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	};
	const buildDeviceUserExportRequest = () => ({
		deviceId: selectedDeviceId,
		scope: "currentDevice" as const,
		selection: deviceUserExportState.selection,
		status: deviceUserStatus,
		query: deviceUserSearch,
		page: safeDeviceUserPage,
		limit: deviceUserLimit,
		vendorUserIds:
			deviceUserExportState.selection === "selectedRows"
				? selectedExportVendorUserIds
				: deviceUserExportState.selection === "currentPage"
					? pagedExportVendorUserIds
					: undefined,
		includeCards: deviceUserExportState.includeCards,
		includeFingerprints: deviceUserExportState.includeFingerprints,
		includeFaces: deviceUserExportState.includeFaces,
		encryptedBiometricBundle: deviceUserExportState.encryptedBiometricBundle,
		refreshBiometricBundle: deviceUserExportState.refreshBiometricBundle,
		biometricBundlePassphrase: deviceUserExportState.biometricBundlePassphrase,
	});
	const getDeviceUserExportBiometricGaps = (payload: DeviceUserExportPayload) => {
		const biometrics = payload.summary?.biometrics;
		const fingerprintMissing = deviceUserExportState.includeFingerprints
			? Math.max(
					Number(biometrics?.fingerprintCountReported || 0) -
						Number(biometrics?.fingerprintEnvelopesCaptured || 0),
					0,
			)
			: 0;
		const faceMissing = deviceUserExportState.includeFaces
			? Math.max(
					Number(biometrics?.faceCountReported || 0) -
						Number(biometrics?.faceEnvelopesCaptured || 0),
					0,
			)
			: 0;
		return { fingerprintMissing, faceMissing, total: fingerprintMissing + faceMissing };
	};
	const previewDeviceUserExport = async () => {
		if (!selectedDeviceId) {
			toast.error("Select a device before exporting users");
			return;
		}
		if (
			deviceUserExportState.selection === "selectedRows" &&
			selectedExportVendorUserIds.length === 0
		) {
			toast.error("Select at least one row before exporting selected rows");
			return;
		}
		const preview = await previewDeviceUserExportMutation.mutateAsync({
			...buildDeviceUserExportRequest(),
			refreshBiometricBundle: false,
		});
		setDeviceUserExportState((current) => ({ ...current, preview, result: null }));
	};
	const exportDeviceUserFile = async () => {
		if (!selectedDeviceId) {
			toast.error("Select a device before exporting users");
			return;
		}
		if (
			deviceUserExportState.selection === "selectedRows" &&
			selectedExportVendorUserIds.length === 0
		) {
			toast.error("Select at least one row before exporting selected rows");
			return;
		}
		if (
			deviceUserExportState.encryptedBiometricBundle &&
			(deviceUserExportState.includeFingerprints || deviceUserExportState.includeFaces) &&
			!deviceUserExportState.biometricBundlePassphrase
		) {
			toast.error("Enter a package passphrase before exporting portable biometrics");
			return;
		}
		const cachedPreview = await previewDeviceUserExportMutation.mutateAsync({
			...buildDeviceUserExportRequest(),
			refreshBiometricBundle: false,
		});
		setDeviceUserExportState((current) => ({ ...current, preview: cachedPreview, result: null }));
		const biometricGaps = getDeviceUserExportBiometricGaps(cachedPreview);
		if (biometricGaps.total > 0) {
			if (!deviceUserExportState.refreshBiometricBundle) {
				setDeviceUserExportState((current) => ({
					...current,
					refreshBiometricBundle: true,
				}));
				toast.error(
					`${biometricGaps.total} requested biometric template${biometricGaps.total === 1 ? " is" : "s are"} not captured. Capture missing templates is now enabled; export again to start the background custody job.`,
				);
				return;
			}
			setDeviceUserExportState((current) => ({ ...current, open: false }));
			if (deviceUserSyncJobIsProcessing) {
				setBulkDeviceUserSyncState((current) => ({
					...current,
					open: true,
					message: "Biometric custody is already running. Reopen Export after it completes.",
				}));
				return;
			}
			const captureJob = await startDeviceUserSyncJobMutation.mutateAsync({
				mode: "full_refresh",
				deviceIds: [selectedDeviceId],
			});
			setActiveDeviceUserSyncJob({ jobId: captureJob.jobId });
			setBulkDeviceUserSyncState({
				open: true,
				status: "idle",
				message: `${biometricGaps.fingerprintMissing} fingerprint and ${biometricGaps.faceMissing} face template${biometricGaps.total === 1 ? "" : "s"} must be captured before export.`,
				lastProgress: captureJob.progress || null,
			});
			toast.warning("Biometric capture started before export", {
				description: "You can close the status window and reopen it from Sync status.",
			});
			return;
		}
		const result = await exportDeviceUsersMutation.mutateAsync({
			...buildDeviceUserExportRequest(),
			refreshBiometricBundle: false,
		});
		const deviceSlug = (selectedDevice?.name || selectedDeviceId || "device")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
		const datePart = new Date().toISOString().slice(0, 10);
		downloadDeviceUserExport(
			result,
			deviceUserExportState.format,
			`device-users-${deviceSlug || "export"}-${datePart}`,
		);
		setDeviceUserExportState((current) => ({ ...current, result }));
		const missingBiometricRows = Number(result.biometricBundle?.errors?.length || 0);
		if (missingBiometricRows > 0) {
			toast.warning(
				`Export is partial: ${missingBiometricRows} requested biometric row${missingBiometricRows === 1 ? " is" : "s are"} missing encrypted payloads`,
			);
		} else {
			toast.success(
				`Device-user ${deviceUserExportState.format === "json" ? "package" : deviceUserExportState.format} export created`,
			);
		}
	};
	const previewDeviceUserImport = async () => {
		if (!selectedDeviceId) {
			toast.error("Select a target device before importing users");
			return;
		}
		let payload = deviceUserImportState.payload;
		try {
			if (!payload) {
				payload =
					deviceUserImportState.format === "csv"
						? buildDeviceUserImportPayloadFromCsv(
								deviceUserImportState.rawText,
								deviceUserImportState.fileName || "device-users.csv",
							)
						: (JSON.parse(deviceUserImportState.rawText) as DeviceUserExportPayload);
			}
		} catch (error: any) {
			setDeviceUserImportState((current) => ({
				...current,
				parseError:
					error?.message ||
					(deviceUserImportState.format === "csv"
						? "Choose a valid device-user CSV export before previewing import."
						: "Choose a valid package JSON export before previewing import."),
				preview: null,
			}));
			return;
		}
		if (payload.biometricBundle?.present && !deviceUserImportState.biometricBundlePassphrase) {
			toast.error("Enter the package passphrase before previewing encrypted biometrics");
			return;
		}
		const preview = await previewDeviceUserImportMutation.mutateAsync({
			targetDeviceId: selectedDeviceId,
			payload,
			biometricBundlePassphrase:
				deviceUserImportState.biometricBundlePassphrase || undefined,
		});
		setDeviceUserImportState((current) => ({
			...current,
			payload,
			parseError: "",
			preview,
			result: null,
		}));
	};
	const executeDeviceUserImport = async () => {
		const payload = deviceUserImportState.payload;
		const preview = deviceUserImportState.preview;
		if (!selectedDeviceId || !payload || !preview?.previewToken) {
			toast.error("Run import preview before execute");
			return;
		}
		const result = await executeDeviceUserImportMutation.mutateAsync({
			targetDeviceId: selectedDeviceId,
			payload,
			previewToken: preview.previewToken,
			confirmation: deviceUserImportState.confirmation,
			execute: true,
			biometricTransferMode: deviceUserImportState.biometricTransferMode,
			biometricBundlePassphrase: deviceUserImportState.biometricBundlePassphrase || undefined,
			runAsJob: deviceUserImportState.runAsJob,
		});
		setDeviceUserImportState((current) => ({ ...current, result }));
		await Promise.allSettled([
			refetchDbDeviceUsers(),
			refetchDeviceUserSummary(),
			refetchSourceDeviceUsers(),
		]);
	};
	const openLogSyncReview = () => {
		if (!selectedDeviceId) {
			toast.error("Select a device before reviewing logs");
			return;
		}
		navigate(
			`/admin/configuration/devices/events?deviceId=${encodeURIComponent(selectedDeviceId)}&view=saved&action=sync-logs`,
		);
	};
	const getDeviceUserBadgeVariant = (status?: string) => {
		if (status === "ACTIVE") return "success";
		if (status === "CONFLICT") return "warning";
		if (status === "DISABLED") return "secondary";
		if (status === "CHECKING_LINK") return "secondary";
		if (status === "LINK_CHECK_FAILED") return "destructive";
		return "warning-soft";
	};
	const getDeviceUserStatusLabel = (status?: string) => {
		if (status === "SOURCE_ONLY") return "Open";
		if (status === "ACTIVE") return "Linked";
		if (status === "UNMATCHED") return "Open";
		if (status === "CONFLICT") return "Review";
		if (status === "DISABLED") return "Off";
		if (status === "CHECKING_LINK") return "Checking link";
		if (status === "LINK_CHECK_FAILED") return "Check failed";
		return status || "-";
	};

	useEffect(() => {
		let cancelled = false;
		let objectUrl: string | null = null;

		if (!detailsDeviceUser?.hrisDeviceUser?.id || !getDeviceUserFaceUrl(detailsDeviceUser)) {
			setDetailsPhotoState("idle");
			setDetailsPhotoError("");
			setDetailsPhotoUrl((current) => {
				if (current) URL.revokeObjectURL(current);
				return null;
			});
			return;
		}

		setDetailsPhotoState("loading");
		setDetailsPhotoError("");

		void deviceService
			.getDeviceUserPhoto(detailsDeviceUser.hrisDeviceUser.id)
			.then((blob) => {
				if (cancelled) return;
				objectUrl = URL.createObjectURL(blob);
				setDetailsPhotoUrl((current) => {
					if (current) URL.revokeObjectURL(current);
					return objectUrl;
				});
				setDetailsPhotoState("ready");
			})
			.catch((error: any) => {
				if (cancelled) return;
				setDetailsPhotoState("error");
				setDetailsPhotoError(error?.message || "Failed to load device user photo");
				setDetailsPhotoUrl((current) => {
					if (current) URL.revokeObjectURL(current);
					return null;
				});
			});

		return () => {
			cancelled = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [detailsDeviceUser]);

	useEffect(() => {
		let cancelled = false;

		const vendorUserId = String(detailsDeviceUser?.vendorUserId || "").trim();
		if (!vendorUserId) {
			setDetailsPeerTallyRows([]);
			setDetailsPeerTallyState("idle");
			setDetailsPeerTallyError("");
			return;
		}
		if (hikvisionDeviceOptions.length === 0) {
			setDetailsPeerTallyRows([]);
			setDetailsPeerTallyState("error");
			setDetailsPeerTallyError("No Hikvision devices are configured.");
			return;
		}

		setDetailsPeerTallyState("loading");
		setDetailsPeerTallyError("");
		const buildRow = (
			device: any,
			deviceUser?: VisibleDeviceUserRow | DeviceUser | null,
			options: { isCurrentDevice?: boolean } = {},
		): DeviceUserPeerTallyRow => {
			const summary = getDeviceUserCredentialSummary(deviceUser || null);
			return {
				deviceId: String(device.id || ""),
				deviceName: device.name || "Unnamed device",
				address: `${device.address || "-"}:${device.port || "-"}`,
				isCurrentDevice: Boolean(options.isCurrentDevice),
				found: Boolean(deviceUser),
				status: deviceUser?.status || "Missing",
				fingerprintCount: summary.fingerprintCount,
				cardCount: summary.cardCount,
				faceCount: summary.faceCount,
				employeeLabel: deviceUser?.employee?.employeeId || "Not linked",
				lastSyncedAt: deviceUser?.lastSyncedAt || null,
			};
		};

		void Promise.all(
			hikvisionDeviceOptions.map(async (device: any) => {
				const isCurrentDevice = String(device.id || "") === String(selectedDeviceId || "");
				if (isCurrentDevice && detailsDeviceUser) {
					return buildRow(device, detailsDeviceUser, { isCurrentDevice: true });
				}
				try {
					const response = await deviceService.getDeviceUsers(String(device.id || ""), {
						limit: 5,
						vendorUserId,
					});
					const matchedDeviceUser =
						response.deviceUsers.find(
							(deviceUser) =>
								String(deviceUser.vendorUserId || "").trim() === vendorUserId,
						) || null;
					return buildRow(device, matchedDeviceUser, { isCurrentDevice });
				} catch {
					return {
						...buildRow(device, null, { isCurrentDevice }),
						status: "Needs refresh",
					};
				}
			}),
		)
			.then((rows) => {
				if (cancelled) return;
				setDetailsPeerTallyRows(rows);
				setDetailsPeerTallyState("ready");
			})
			.catch((error: any) => {
				if (cancelled) return;
				setDetailsPeerTallyRows([]);
				setDetailsPeerTallyState("error");
				setDetailsPeerTallyError(
					error?.message || "Failed to compare this user across Hikvision devices.",
				);
			});

		return () => {
			cancelled = true;
		};
	}, [detailsDeviceUser, hikvisionDeviceOptions, selectedDeviceId]);

	return (
		<div className="space-y-6">
			{!embedded && (
				<div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
					<div className="min-w-0 space-y-2">
						<Button
							type="button"
							variant="ghost"
							className="h-8 px-0 text-sm text-slate-600 hover:bg-transparent hover:text-slate-900"
							onClick={() => navigate(devicesPath)}>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to devices
						</Button>
						<h1 className="text-xl font-semibold text-slate-950">Sync Center</h1>
					</div>
					<div className="flex flex-wrap gap-2">
						<Badge variant="secondary">{devices.length} devices</Badge>
						<Badge variant="secondary">
							{pagination?.total ?? items.length} employees
						</Badge>
					</div>
				</div>
			)}

			<DeviceLiveReadinessStrip
				compact
				mode="enroll"
				readiness={liveReadiness}
				isLoading={isLiveReadinessLoading}
				errorMessage={
					liveReadinessError
						? liveReadinessError instanceof Error
							? liveReadinessError.message
							: "Readiness check failed"
						: null
				}
				onProve={() => void proveLivePath({ forceReArm: true })}
				isProving={isProvingLivePath}
				keepReady={keepLiveReady}
				onKeepReadyChange={setKeepLiveReadyPersisted}
				keepReadyWorking={
					keepLiveReady &&
					isQuietKeepReadyRepair &&
					(liveReadiness?.overall === "red" || liveReadiness?.safeToTap === false)
				}
			/>

			<Tabs value={activePanel} onValueChange={setActivePanel} className="space-y-4">
				<TabsList className="grid h-auto w-full grid-cols-4 rounded-md bg-slate-100 p-1">
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="users">Device Users</TabsTrigger>
					<TabsTrigger value="logs">Device Logs</TabsTrigger>
					<TabsTrigger value="runs">Sync Runs</TabsTrigger>
				</TabsList>

				{syncCenterHasHikvisionDevices ? (
					<section className={`rounded-xl border p-2.5 ${hikvisionListenerToneClass}`}>
						<button
							type="button"
							onClick={() => setIsListenerDetailsOpen(true)}
							className="flex w-full min-w-0 items-center gap-3 rounded-lg bg-white/80 px-3 py-2 text-left transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
							<div
								className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
									hikvisionSdkReceiving || hikvisionSdkArmed
										? "bg-emerald-100 text-emerald-700"
										: hikvisionListenerUnavailable
											? "bg-red-100 text-red-700"
											: "bg-amber-100 text-amber-700"
								}`}>
								{isLoadingHikvisionListenerStatus ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : hikvisionSdkReceiving ? (
									<Wifi className="h-4 w-4" />
								) : hikvisionListenerUnavailable ? (
									<AlertTriangle className="h-4 w-4" />
								) : (
									<WifiOff className="h-4 w-4" />
								)}
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex min-w-0 flex-wrap items-center gap-2">
									<p className="truncate text-sm font-semibold text-slate-950">
										Listener
									</p>
									<Badge
										variant={
											hikvisionSdkReceiving || hikvisionSdkArmed
												? "success"
												: hikvisionListenerUnavailable
													? "destructive"
													: "warning"
										}
										className="max-w-full rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.12em]">
										{hikvisionListenerTitle}
									</Badge>
								</div>
								<div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
									<span className="truncate">
										{hikvisionListenerUnavailable
											? "VM status unreachable"
											: hikvisionListenerRunning
												? "VM running"
												: "VM stopped"}
									</span>
									<span className="opacity-40">•</span>
									<span className="truncate">
										Checked{" "}
										{formatSyncCenterTime(hikvisionListenerStatus?.checkedAt)}
									</span>
								</div>
							</div>
							<span className="shrink-0 text-xs font-medium text-slate-500">
								Open
							</span>
						</button>
					</section>
				) : null}

				<TabsContent value="overview" className="m-0 space-y-3">
					{isLoadingDevices && devices.length === 0 ? (
						<div className="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
							<Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
							Loading device list… Close is always available if this hangs.
						</div>
					) : syncCenterDevices.length === 0 ? (
						<div className="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
							No configured physical devices found.
							{isDevicesError ? (
								<p className="mt-2 text-xs text-amber-700">
									{(devicesLoadError as any)?.message ||
										"Device list could not load (API offline?). Use the X button to close and retry."}
								</p>
							) : null}
						</div>
					) : (
						<>
							{isSyncPreviewPending ? (
								<div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
									<Loader2 className="mr-2 inline-block h-3.5 w-3.5 animate-spin" />
									Showing devices now. Per-device source counts will fill in as each check finishes.
								</div>
							) : null}
							<div className="overflow-hidden rounded-md border border-slate-200 bg-white">
								<div className="hidden grid-cols-[minmax(190px,1.45fr)_124px_128px_150px_156px_112px_96px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 xl:grid">
									<span>Device</span>
									<span>Address</span>
									<span>Status</span>
									<span>Source users</span>
									<span>HRIS users</span>
									<span>Last sync</span>
									<span className="text-right">Actions</span>
								</div>
								{syncCenterDevices
									.slice()
									.sort((left, right) => {
										const leftAttention = left.status === "synced" ? 1 : 0;
										const rightAttention = right.status === "synced" ? 1 : 0;
										if (leftAttention !== rightAttention)
											return leftAttention - rightAttention;
										return String(left.device.name || "").localeCompare(
											String(right.device.name || ""),
										);
									})
									.map(({ device, preview, status, vendor }) => {
									const isSelected = device.id === selectedDeviceId;
									const isPreviewPending = !preview && isSyncPreviewPending;
									const sourceUserTotal = preview?.vendorUserCount;
									const hrisUserTotal = preview?.hrisUserCount;
									const openUserTotal = preview?.openUserCount;
									const userGap =
										typeof sourceUserTotal === "number" &&
										typeof hrisUserTotal === "number"
											? Math.max(sourceUserTotal - hrisUserTotal, 0)
											: null;
									const lastSyncAt =
										device.id === selectedDeviceId
											? latestUserSync?.completedAt ||
												latestLogSync?.completedAt ||
												latestUserSync?.startedAt ||
												latestLogSync?.startedAt
											: preview?.lastSourceEventAt;
									const sourceUserValue = isPreviewPending
										? "Checking..."
										: metricValue(sourceUserTotal);
									const gapValue = isPreviewPending ? "Checking..." : metricValue(userGap);
									const hrisUserValue = isPreviewPending
										? "Checking..."
										: metricValue(hrisUserTotal);
									const openUserValue = isPreviewPending
										? "Checking..."
										: metricValue(openUserTotal);
									return (
										<div
											key={device.id}
											className={`grid gap-3 border-b border-slate-100 px-3 py-3 text-sm last:border-b-0 xl:grid-cols-[minmax(190px,1.45fr)_124px_128px_150px_156px_112px_96px] xl:items-center ${isSelected ? "bg-orange-50/40" : "bg-white"}`}>
											<div className="min-w-0">
												<div className="flex min-w-0 flex-wrap items-center gap-2">
													<p className="truncate font-medium text-slate-950">
														{device.name || "Unnamed device"}
													</p>
													<span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
														{vendor}
													</span>
												</div>
												{preview?.error ? (
													<p className="mt-1 line-clamp-2 text-xs text-red-600">
														{preview.error}
													</p>
												) : null}
											</div>
											<div className="min-w-0 font-mono text-xs text-slate-700">
												<span className="mr-1 font-sans text-slate-500 xl:hidden">
													Address
												</span>
												{device.address || "-"}:{device.port || "-"}
											</div>
											<div>
												<span className="mr-1 text-slate-500 xl:hidden">
													Status
												</span>
												<Badge
													variant={getSyncStatusBadge(status) as any}
													className="inline-flex min-h-6 max-w-full items-center whitespace-normal break-words border border-current/20 px-2 py-0.5 text-left leading-4">
													{getSyncStatusLabel(status)}
												</Badge>
											</div>
											<div className="min-w-0 space-y-1">
												<div className="flex items-center justify-between gap-2 xl:block">
													<span className="text-xs text-slate-500">
														Read from device
													</span>
													<Button
														type="button"
														variant="ghost"
														className="h-auto min-h-7 px-1 text-sm font-semibold text-slate-950 hover:bg-slate-100"
														disabled={
															isPreviewPending ||
															typeof sourceUserTotal !== "number"
														}
														onClick={() =>
															openDeviceUserCount(device.id, "source")
														}
														title="Open users read from this device">
														{sourceUserValue}
													</Button>
												</div>
												<div className="flex items-center justify-between gap-2 xl:block">
													<span className="text-xs text-slate-500">
														Gap
													</span>
													<Button
														type="button"
														variant="ghost"
														className="h-auto min-h-7 px-1 text-sm font-semibold text-slate-950 hover:bg-slate-100"
														disabled={!userGap}
														onClick={() =>
															openDeviceUserCount(device.id, "open")
														}
														title="Open device users that need an employee link">
														{gapValue}
													</Button>
												</div>
											</div>
											<div className="min-w-0 space-y-1">
												<div className="flex items-center justify-between gap-2 xl:block">
													<span className="text-xs text-slate-500">
														Saved in HRIS
													</span>
													<Button
														type="button"
														variant="ghost"
														className="h-auto min-h-7 px-1 text-sm font-semibold text-slate-950 hover:bg-slate-100"
														disabled={typeof hrisUserTotal !== "number"}
														onClick={() =>
															openDeviceUserCount(device.id, "hris")
														}
														title="Open saved HRIS device users">
														{hrisUserValue}
													</Button>
												</div>
												<div className="flex items-center justify-between gap-2 xl:block">
													<span className="text-xs text-slate-500">
														Needs link
													</span>
													<Button
														type="button"
														variant="ghost"
														className="h-auto min-h-7 px-1 text-sm font-semibold text-slate-950 hover:bg-slate-100"
														disabled={!openUserTotal}
														onClick={() =>
															openDeviceUserCount(device.id, "open")
														}
														title="Open users that need an employee link">
														{openUserValue}
													</Button>
												</div>
											</div>
											<div className="text-xs text-slate-600">
												<span className="mr-1 text-slate-500 xl:hidden">
													Last sync
												</span>
												{isPreviewPending
													? "Checking..."
													: lastSyncAt
														? formatDateTime(lastSyncAt)
														: "-"}
											</div>
											<div className="flex justify-end">
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															type="button"
															variant="outline"
															size="sm"
															className="h-8 w-8 bg-white p-0"
															aria-label={`More actions for ${device.name || "device"}`}>
															<MoreVertical className="h-4 w-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent
														align="end"
														className="w-48">
														<DropdownMenuItem
															onClick={() =>
																openDevicePanel(device.id, "users")
															}>
															<UserPlus className="mr-2 h-4 w-4" />
															Device users
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() =>
																openDeviceUserSyncReview(device.id)
															}>
															<RefreshCw className="mr-2 h-4 w-4" />
															Review user sync
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onClick={() =>
																navigate(
																	`/admin/configuration/devices/events?deviceId=${encodeURIComponent(device.id)}&view=saved`,
																)
															}>
															<Activity className="mr-2 h-4 w-4" />
															Device events
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() =>
																openDevicePanel(device.id, "runs")
															}>
															<Clock3 className="mr-2 h-4 w-4" />
															Sync runs
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</div>
										</div>
									);
									})}
							</div>
						</>
					)}
				</TabsContent>

				<TabsContent value="users" className="m-0">
					{!selectedDeviceId ? (
						<section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
							{/* Heading on its own row so toolbar controls never squeeze "Choose a device first". */}
							<div className="space-y-3" data-testid="device-user-summary-toolbar">
								<h2 className="text-sm font-semibold leading-5 text-slate-950">
									Choose a device first
								</h2>
								<div className="flex min-w-0 flex-wrap items-center gap-2">
									{hasEffectiveDeviceUserSyncJobProgress ? (
										<Button
											type="button"
											variant="outline"
											title="Open device-user sync status"
											aria-label="Open device-user sync status"
											onClick={openBulkDeviceUserSyncReview}
											className="relative h-8 shrink-0 gap-1.5 border-orange-200 bg-orange-50 px-3 text-orange-700 hover:bg-orange-100 hover:text-orange-800">
											{deviceUserSyncJobIsProcessing ? (
												<Loader2 className="h-4 w-4 shrink-0 animate-spin" />
											) : (
												<RefreshCw className="h-4 w-4 shrink-0" />
											)}
											<span className="whitespace-nowrap">Sync status</span>
											{deviceUserSyncStatusBubble ? (
												<span className="inline-flex shrink-0 items-center rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
													{deviceUserSyncStatusBubble}
												</span>
											) : null}
										</Button>
									) : null}
									<form
										className="flex min-w-0 max-w-full basis-full gap-1 sm:max-w-xs sm:basis-[18rem] sm:flex-1"
										onSubmit={(event) => {
											event.preventDefault();
											if (!summaryDeviceSearch.trim()) {
												toast.error("Enter a user ID or name to search devices");
												return;
											}
											void openSdkUserMerge(summaryDeviceSearch);
										}}>
										<div className="relative min-w-0 flex-1">
											<label htmlFor="sync-summary-device-search" className="sr-only">
												Search device users across available devices
											</label>
											<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
											<input
												id="sync-summary-device-search"
												type="text"
												role="searchbox"
												autoComplete="off"
												value={summaryDeviceSearch}
												onChange={(event) => setSummaryDeviceSearch(event.target.value)}
												placeholder="Find user on devices"
												className="h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
											/>
											{summaryDeviceSearch ? (
												<button
													type="button"
													aria-label="Clear device-user search"
													title="Clear device-user search"
													onClick={() => setSummaryDeviceSearch("")}
													className="absolute right-2 top-1/2 rounded p-0.5 text-slate-400 transition-colors -translate-y-1/2 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-200">
													<XCircle className="h-3.5 w-3.5" />
												</button>
											) : null}
										</div>
										<Button
											type="submit"
											variant="outline"
											className="h-8 w-8 shrink-0 px-0"
											aria-label="Search device users"
											title="Search device users"
											disabled={planHikvisionSdkUserMergeMutation.isPending}>
											{planHikvisionSdkUserMergeMutation.isPending ? (
												<Loader2 className="h-4 w-4 animate-spin" />
											) : (
												<Search className="h-4 w-4" />
											)}
											<span className="sr-only">Search device users</span>
										</Button>
									</form>
									<Button
										type="button"
										variant="outline"
										className="h-8 shrink-0 gap-1.5 px-3"
										onClick={() => void refreshDeviceUserSummary()}>
										<RefreshCw className="h-4 w-4 shrink-0" />
										<span className="whitespace-nowrap">Refresh summary</span>
									</Button>
									<Button
										type="button"
										className="h-8 shrink-0 gap-1.5 px-3"
										disabled={
											planHikvisionSdkUserMergeMutation.isPending ||
											hikvisionDeviceOptions.length < 2
										}
										onClick={() => void openSdkUserMerge()}>
										{planHikvisionSdkUserMergeMutation.isPending ? (
											<Loader2 className="h-4 w-4 shrink-0 animate-spin" />
										) : (
											<Link2 className="h-4 w-4 shrink-0" />
										)}
										<span className="whitespace-nowrap">Merge users</span>
									</Button>
								</div>
							</div>
							<div className="overflow-hidden rounded-md border border-slate-200">
								<div className="hidden grid-cols-[minmax(180px,1.4fr)_120px_120px_120px_120px_96px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 lg:grid">
									<span>Device</span>
									<span>From device</span>
									<span>Saved in HRIS</span>
									<span>Gap</span>
									<span>Needs link</span>
									<span className="text-right">Open</span>
								</div>
								{syncCenterDevices.map(({ device, preview }) => {
									const sourceCount = preview?.vendorUserCount;
									const hrisCount = preview?.hrisUserCount;
									const openCount = preview?.openUserCount;
									const gapCount =
										typeof sourceCount === "number" &&
										typeof hrisCount === "number"
											? Math.max(sourceCount - hrisCount, 0)
											: null;
									return (
										<div
											key={device.id}
											role="button"
											tabIndex={0}
											onClick={() => openPhysicalDeviceUsers(device.id)}
											onKeyDown={(event) => {
												if (event.key === "Enter" || event.key === " ") {
													event.preventDefault();
													openPhysicalDeviceUsers(device.id);
												}
											}}
											className="grid cursor-pointer gap-3 border-b border-slate-100 px-3 py-3 text-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-300 last:border-b-0 lg:grid-cols-[minmax(180px,1.4fr)_120px_120px_120px_120px_96px] lg:items-center">
											<div className="min-w-0">
												<p className="truncate font-medium text-slate-950">
													{device.name || "Unnamed device"}
												</p>
												<p className="truncate text-xs text-slate-500">
													{device.address || "-"}:{device.port || "-"}
												</p>
											</div>
											<div className="flex items-center justify-between gap-2 lg:block">
												<span className="text-xs text-slate-500 lg:hidden">
													From device
												</span>
												<span className="font-semibold text-slate-950">
													{metricValue(sourceCount)}
												</span>
											</div>
											<div className="flex items-center justify-between gap-2 lg:block">
												<span className="text-xs text-slate-500 lg:hidden">
													Saved in HRIS
												</span>
												<span className="font-semibold text-slate-950">
													{metricValue(hrisCount)}
												</span>
											</div>
											<div className="flex items-center justify-between gap-2 lg:block">
												<span className="text-xs text-slate-500 lg:hidden">
													Gap
												</span>
												<span className="font-semibold text-slate-950">
													{metricValue(gapCount)}
												</span>
											</div>
											<div className="flex items-center justify-between gap-2 lg:block">
												<span className="text-xs text-slate-500 lg:hidden">
													Needs link
												</span>
												<span className="font-semibold text-slate-950">
													{metricValue(openCount)}
												</span>
											</div>
											<div className="flex justify-end">
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={(event) => {
														event.stopPropagation();
														openPhysicalDeviceUsers(device.id);
													}}
													onKeyDown={(event) => event.stopPropagation()}>
													Open
												</Button>
											</div>
										</div>
									);
								})}
							</div>
						</section>
					) : (
						<section className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
							<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
								<div className="min-w-0 space-y-2">
									<div className="flex min-w-0 items-center gap-2">
										<Button
											type="button"
											variant="ghost"
											className="h-8 w-8 shrink-0 px-0 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
											aria-label="Back to device summary"
											title="Back to device summary"
											onClick={goBackToDeviceUserSummary}>
											<ArrowLeft className="h-4 w-4" />
										</Button>
										<div className="min-w-0">
											<h2 className="truncate text-sm font-semibold leading-5 text-slate-950">
												{selectedDevice?.name || "Device Users"}
											</h2>
											<div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
												<span className="shrink-0">
													{selectedSyncCenterItem?.vendor ||
														(selectedDevice
															? getDeviceVendor(selectedDevice)
															: "-")}
												</span>
												<span className="shrink-0">
													{getSourceReadLabel(
														selectedSyncCenterItem?.vendor ||
															(selectedDevice
																? getDeviceVendor(selectedDevice)
																: ""),
													)}
												</span>
												<span className="shrink-0 font-semibold text-slate-950">
													{metricValue(
														selectedSyncCenterItem?.preview?.vendorUserCount,
													)}{" "}
													read from device
												</span>
											</div>
										</div>
									</div>
								</div>
								<div className="flex flex-wrap items-center justify-start gap-1.5 lg:justify-end">
									<Button
										type="button"
										variant="outline"
										className="h-8 w-8 bg-white p-0"
										disabled={!selectedDeviceId}
										aria-label="Export device users"
										title="Export device users"
										onClick={() =>
											setDeviceUserExportState((current) => ({
												...current,
												open: true,
												preview: null,
												result: null,
											}))
										}>
										<Download className="h-4 w-4" />
									</Button>
									<Button
										type="button"
										variant="outline"
										className="h-8 w-8 bg-white p-0"
										disabled={!selectedDeviceId}
										aria-label="Import device users"
										title="Import device users"
										onClick={() =>
											setDeviceUserImportState((current) => ({
												...current,
												open: true,
												parseError: "",
												preview: null,
											}))
										}>
										<Upload className="h-4 w-4" />
									</Button>
									<Button
										type="button"
										variant="outline"
										className="h-8 px-3"
										disabled={!selectedDeviceId || isReadingDeviceUsers}
										onClick={refreshSourceDeviceUsers}>
										{isReadingDeviceUsers ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<RefreshCw className="h-4 w-4" />
										)}
										Refresh source users
									</Button>
									<Button
										type="button"
										variant="outline"
										className={`relative h-8 shrink-0 gap-1.5 px-3 ${hasEffectiveDeviceUserSyncJobProgress ? "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:text-orange-800" : ""}`}
										disabled={
											!selectedDeviceId || startDeviceUserSyncJobMutation.isPending
										}
										onClick={() =>
											hasEffectiveDeviceUserSyncJobProgress
												? openBulkDeviceUserSyncReview()
												: openDeviceUserSyncReview()
										}>
										{deviceUserSyncJobIsProcessing || startDeviceUserSyncJobMutation.isPending ? (
											<Loader2 className="h-4 w-4 shrink-0 animate-spin" />
										) : (
											<RefreshCw className="h-4 w-4 shrink-0" />
										)}
										<span className="whitespace-nowrap">
											{hasEffectiveDeviceUserSyncJobProgress ? "Sync status" : "Review sync"}
										</span>
										{deviceUserSyncStatusBubble ? (
											<span className="inline-flex shrink-0 items-center rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
												{deviceUserSyncStatusBubble}
											</span>
										) : null}
									</Button>
								</div>
							</div>

							<div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_150px_minmax(220px,1fr)]">
								<Select
									options={devices.map((device: any) => {
										const preview = syncCenterDevices.find(
											(item) => item.device.id === device.id,
										)?.preview;
										const labelBase =
											device.name || `${device.address}:${device.port}`;
										const sourceCount = preview?.vendorUserCount;
										return {
											value: device.id,
											label:
												typeof sourceCount === "number" &&
												Number.isFinite(sourceCount)
													? `${labelBase} (${sourceCount} source)`
													: labelBase,
										};
									})}
									value={selectedDeviceId}
									onChange={setSelectedDeviceId}
									placeholder={
										isLoadingDevices ? "Loading devices..." : "Select device"
									}
									disabled={isLoadingDevices}
								/>
								<Select
									options={[
										{ value: "all", label: "All statuses" },
										{ value: "ACTIVE", label: "Linked" },
										{ value: "UNMATCHED", label: "Open" },
										{ value: "CONFLICT", label: "Review" },
										{ value: "DISABLED", label: "Off" },
									]}
									value={deviceUserStatus}
									onChange={setDeviceUserStatus}
									placeholder="Status"
								/>
								<div className="relative flex min-h-[42px] items-center rounded-md border border-slate-200 bg-white px-3 focus-within:border-orange-300 focus-within:ring-2 focus-within:ring-orange-100">
									<Search className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
									<input
										value={deviceUserSearch}
										onChange={(event) =>
											handleDeviceUserSearch(event.target.value)
										}
										placeholder="Search user, name, employee..."
										className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
									/>
								</div>
							</div>

							<div className="grid gap-2 sm:grid-cols-5">
								{[
									["source", "Read from device", physicalSourceCount],
									["shown", "Current view", shownDeviceUserCount],
									["hris", "HRIS records", physicalHrisUserCount],
									["linked", "Linked employees", linkedPhysicalUserCount],
									["open", "Needs link", openPhysicalUserCount],
								].map(([view, label, value]) => (
									<button
										key={String(label)}
										type="button"
										aria-label={`${label}: ${metricValue(value)}`}
										className={`min-w-0 rounded-md border px-3 py-2 text-left transition-colors ${
											deviceUserView === view ||
											(view === "shown" && deviceUserView === "shown")
												? "border-orange-300 bg-orange-50"
												: "border-slate-200 bg-white hover:bg-slate-50"
										}`}
										onClick={() => setDeviceUserView(String(view))}>
										<span className="block truncate text-xs font-medium text-slate-500">
											{label}
										</span>
										<span className="block text-lg font-semibold text-slate-950">
											{metricValue(value)}
										</span>
									</button>
								))}
							</div>

							{deviceUserView === "source" ? (
								<div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
									Showing the users read directly through{" "}
									{getSourceReadLabel(
										selectedSyncCenterItem?.vendor ||
											(selectedDevice ? getDeviceVendor(selectedDevice) : ""),
									)}
									.
								</div>
							) : null}

							<div className="overflow-hidden rounded-lg border border-slate-200">
								<table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
									<colgroup>
										<col className="w-[44px]" />
										<col className="w-[25%]" />
										<col className="w-[25%]" />
										<col className="w-[14%]" />
										<col className="w-[22%]" />
										<col className="w-[88px]" />
									</colgroup>
									<thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
										<tr>
											<th className="px-3 py-2">
												<input
													type="checkbox"
													aria-label="Select current page device users"
													className="h-4 w-4 rounded border-slate-300"
													checked={allPagedRowsSelected}
													onChange={(event) =>
														togglePagedExportVendorUserIds(
															event.target.checked,
														)
													}
												/>
											</th>
											<th className="px-3 py-2">Device user</th>
											<th className="px-3 py-2">Employee</th>
											<th className="px-3 py-2">Status</th>
											<th className="px-3 py-2">Last synced</th>
											<th className="px-3 py-2 text-right">Actions</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100 bg-white">
										{isLoadingDbDeviceUsers || isLoadingOpenDbDeviceUsers ? (
											<tr>
												<td
													colSpan={6}
													className="px-3 py-8 text-center text-slate-500">
													<Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
													Loading device users...
												</td>
											</tr>
										) : isReadingDeviceUsers &&
										  mergedDeviceUserRows.length === 0 ? (
											<tr>
												<td
													colSpan={6}
													className="px-3 py-8 text-center text-slate-500">
													<Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
													Reading source users from the physical device...
												</td>
											</tr>
										) : visibleDeviceUserRows.length === 0 ? (
											<tr>
												<td
													colSpan={6}
													className="px-3 py-8 text-center text-slate-500">
													No device users found for this view.
												</td>
											</tr>
										) : (
											pagedDeviceUserRows.map((deviceUser) => (
												<tr key={deviceUser.key} className="align-middle">
													<td className="px-3 py-2">
														<input
															type="checkbox"
															aria-label={`Select device user ${deviceUser.vendorUserId}`}
															className="h-4 w-4 rounded border-slate-300"
															checked={selectedExportVendorUserIdSet.has(
																deviceUser.vendorUserId,
															)}
															onChange={(event) =>
																toggleExportVendorUserId(
																	deviceUser.vendorUserId,
																	event.target.checked,
																)
															}
														/>
													</td>
													<td className="px-3 py-2">
														<p className="font-medium leading-5 text-slate-950">
															{deviceUser.displayName ||
																"Unnamed device user"}
														</p>
														<p className="text-xs text-slate-500">
															{deviceUser.vendorUserId}
															{deviceUser.userType
																? ` - ${deviceUser.userType}`
																: ""}
															{deviceUser.sourceUser &&
															!deviceUser.hrisDeviceUser
																? " - Read from device"
																: ""}
														</p>
													</td>
													<td className="px-3 py-2">
														{deviceUser.employee ? (
															<div className="min-w-0">
																<p className="truncate font-medium leading-5 text-slate-900">
																	{deviceUser.employee.fullName ||
																		deviceUser.employee
																			.employeeId}
																</p>
																<p className="text-xs text-slate-500">
																	{deviceUser.employee.employeeId}
																</p>
															</div>
														) : deviceUser.status ===
														  "CHECKING_LINK" ? (
															<span className="inline-flex items-center gap-1.5 text-slate-500">
																<Loader2 className="h-3.5 w-3.5 animate-spin" />
																Checking HRIS link
															</span>
														) : deviceUser.status ===
														  "LINK_CHECK_FAILED" ? (
															<span className="text-red-700">
																Could not verify link
															</span>
														) : (
															<span className="text-slate-500">
																Not linked
															</span>
														)}
													</td>
													<td className="px-3 py-2">
														<div className="flex flex-wrap items-center gap-1.5">
															<Badge
																variant={
																	getDeviceUserBadgeVariant(
																		deviceUser.status,
																	) as any
																}
																className="h-6 items-center">
																{getDeviceUserStatusLabel(
																	deviceUser.status,
																)}
															</Badge>
														</div>
													</td>
													<td className="px-3 py-2 text-slate-600">
														{deviceUser.lastSyncedAt
															? formatDateTime(
																	deviceUser.lastSyncedAt,
																)
															: "-"}
													</td>
													<td className="px-3 py-2">
														<div className="flex justify-end">
															<DropdownMenu>
																<DropdownMenuTrigger asChild>
																	<Button
																		type="button"
																		variant="outline"
																		size="sm"
																		className="h-8 w-8 bg-white p-0"
																		aria-label={`More actions for device user ${deviceUser.displayName || deviceUser.vendorUserId}`}>
																		<MoreVertical className="h-4 w-4" />
																	</Button>
																</DropdownMenuTrigger>
																<DropdownMenuContent
																	align="end"
																	className="w-48">
																	<DropdownMenuItem
																		onClick={() =>
																			setDetailsDeviceUser(
																				deviceUser,
																			)
																		}>
																		<FileJson className="mr-2 h-4 w-4" />
																		Details
																	</DropdownMenuItem>
																	<DropdownMenuItem
																		disabled={
																			deviceUser.status ===
																				"CHECKING_LINK" ||
																			deviceUser.status ===
																				"LINK_CHECK_FAILED"
																		}
																		onClick={() =>
																			openLinkDeviceUser(
																				deviceUser,
																			)
																		}>
																		<Link2 className="mr-2 h-4 w-4" />
																		{deviceUser.status ===
																		"CHECKING_LINK"
																			? "Checking HRIS link"
																			: deviceUser.status ===
																				  "LINK_CHECK_FAILED"
																				? "Refresh before linking"
																				: deviceUser.employeeId
																					? "Change employee link"
																					: "Link employee"}
																	</DropdownMenuItem>
																	<DropdownMenuItem
																		disabled={
																			!copyTargetDeviceOptions.length
																		}
																		onClick={() =>
																			openCopyDeviceUser(
																				deviceUser,
																			)
																		}>
																		<RefreshCw className="mr-2 h-4 w-4" />
																		{copyTargetDeviceOptions.length
																			? "Copy to peer device"
																			: "No peer device available"}
																	</DropdownMenuItem>
																	{!deviceUser.hrisDeviceUser ? (
																		<DropdownMenuItem
																			onClick={() =>
																				openDeviceUserSyncReview()
																			}>
																			<RefreshCw className="mr-2 h-4 w-4" />
																			Review sync
																		</DropdownMenuItem>
																	) : null}
																	{deviceUser.employeeId &&
																	deviceUser.hrisDeviceUser ? (
																		<>
																			<DropdownMenuSeparator />
																			<DropdownMenuItem
																				disabled={
																					unlinkDeviceUserMutation.isPending
																				}
																				className="text-red-700 focus:text-red-700"
																				onClick={() =>
																					openUnlinkDeviceUser(
																						deviceUser,
																					)
																				}>
																				<Unlink className="mr-2 h-4 w-4" />
																				Unlink employee
																			</DropdownMenuItem>
																		</>
																	) : null}
																</DropdownMenuContent>
															</DropdownMenu>
														</div>
													</td>
												</tr>
											))
										)}
									</tbody>
								</table>
							</div>
							<div className="flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
								<span>
									Showing{" "}
									{visibleDeviceUserRows.length === 0
										? 0
										: (safeDeviceUserPage - 1) * deviceUserLimit + 1}
									{" - "}
									{Math.min(
										safeDeviceUserPage * deviceUserLimit,
										visibleDeviceUserRows.length,
									)}
									{" of "}
									{visibleDeviceUserRows.length}
								</span>
								<div className="flex items-center gap-2">
									<Button
										type="button"
										variant="outline"
										className="h-8 px-3"
										disabled={safeDeviceUserPage <= 1}
										onClick={() => setDeviceUserPage(safeDeviceUserPage - 1)}>
										Previous
									</Button>
									<span className="min-w-12 text-center">
										{safeDeviceUserPage} / {deviceUserTotalPages}
									</span>
									<Button
										type="button"
										variant="outline"
										className="h-8 px-3"
										disabled={safeDeviceUserPage >= deviceUserTotalPages}
										onClick={() => setDeviceUserPage(safeDeviceUserPage + 1)}>
										Next
									</Button>
								</div>
							</div>
						</section>
					)}
				</TabsContent>

				<TabsContent value="logs" className="m-0">
					<section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
						<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<div>
								<h2 className="text-sm font-semibold text-slate-950">
									Device Logs
								</h2>
								<p className="text-xs text-slate-500">
									Summary only. Open the events page for rows.
								</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									className="h-8 px-3"
									onClick={openLogSyncReview}>
									<RefreshCw className="h-4 w-4" />
									Review log sync
								</Button>
								<Button
									type="button"
									variant="outline"
									className="h-8 px-3"
									onClick={() => openDeviceEvents("saved")}>
									<Activity className="h-4 w-4" />
									Open device events
								</Button>
							</div>
						</div>
						<div className="grid gap-2 sm:grid-cols-5">
							{[
								[
									"Physical log entries",
									selectedLogPreview?.vendorEventCount ??
										selectedLogPreview?.totalEvents,
								],
								[
									"Saved events",
									selectedLogPreview?.hrisSavedCount ??
										selectedLogPreview?.syncedEvents,
								],
								["Known skipped", selectedLogPreview?.knownSkippedEventCount],
								["Failed", selectedLogPreview?.failedEventCount],
								[
									"Still missing",
									selectedLogPreview?.missingEventCount ??
										selectedLogPreview?.needsSyncEvents,
								],
							].map(([label, value]) => (
								<div
									key={String(label)}
									className="rounded-md border border-slate-200 px-3 py-2">
									<p className="text-xs font-medium text-slate-500">{label}</p>
									<p className="text-lg font-semibold text-slate-950">
										{metricValue(value)}
									</p>
								</div>
							))}
						</div>
						<div className="rounded-md border border-slate-200">
							<div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
								<div className="min-w-0">
									<h3 className="text-sm font-semibold text-slate-950">
										Recent saved activity
									</h3>
									<p className="text-xs text-slate-600">
										Shows callback, reconcile, and backfill rows saved for this
										device.
									</p>
								</div>
								<Button
									type="button"
									variant="outline"
									className="h-8 px-3"
									disabled={!selectedDeviceId || isLoadingDeviceActivity}
									onClick={() => void refetchDeviceActivity()}>
									{isLoadingDeviceActivity ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<RefreshCw className="h-4 w-4" />
									)}
									Refresh activity
								</Button>
							</div>
							<div className="overflow-x-auto">
								<table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
									<colgroup>
										<col className="w-[180px]" />
										<col className="w-[210px]" />
										<col className="w-[170px]" />
										<col className="w-[140px]" />
										<col />
									</colgroup>
									<thead className="bg-white text-left text-xs font-semibold uppercase text-slate-500">
										<tr>
											<th className="px-3 py-2">Saved at</th>
											<th className="px-3 py-2">Origin</th>
											<th className="px-3 py-2">Event</th>
											<th className="px-3 py-2">User</th>
											<th className="px-3 py-2">Trace</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100 bg-white">
										{!selectedDeviceId ? (
											<tr>
												<td
													colSpan={5}
													className="px-3 py-8 text-center text-slate-500">
													Select a device to inspect saved activity.
												</td>
											</tr>
										) : isLoadingDeviceActivity ? (
											<tr>
												<td
													colSpan={5}
													className="px-3 py-8 text-center text-slate-500">
													<Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
													Loading saved activity...
												</td>
											</tr>
										) : recentDeviceActivity.length === 0 ? (
											<tr>
												<td
													colSpan={5}
													className="px-3 py-8 text-center text-slate-500">
													No saved activity rows for this device yet.
												</td>
											</tr>
										) : (
											recentDeviceActivity.map((row) => (
												<tr key={row.id} className="align-top">
													<td className="px-3 py-2 text-slate-700">
														{formatDateTime(row.receivedAt)}
													</td>
													<td className="px-3 py-2">
														<p className="font-medium text-slate-950">
															{formatActivityOrigin(row)}
														</p>
														<p className="mt-0.5 break-words text-xs text-slate-500">
															{formatActivityDetail(row)}
														</p>
													</td>
													<td className="px-3 py-2">
														<p className="font-medium text-slate-950">
															{row.eventLabel || row.action || "-"}
														</p>
														<p className="text-xs text-slate-500">
															{row.eventCategory || "-"} /{" "}
															{row.eventAction || "-"}
														</p>
													</td>
													<td className="px-3 py-2">
														<p className="font-medium text-slate-950">
															{row.rawId || "-"}
														</p>
														<p className="text-xs text-slate-500">
															{row.employeeMatch?.label ||
																"No HRIS employee link"}
														</p>
													</td>
													<td className="px-3 py-2">
														<p className="break-all font-mono text-xs text-slate-600">
															{row.correlationId || row.id}
														</p>
														{row.message ? (
															<p className="mt-1 text-xs text-red-700">
																{row.message}
															</p>
														) : null}
													</td>
												</tr>
											))
										)}
									</tbody>
								</table>
							</div>
							{deviceActivity?.rawSdkPersistence?.message ? (
								<div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
									{deviceActivity.rawSdkPersistence.message}
								</div>
							) : null}
						</div>
					</section>
				</TabsContent>

				<TabsContent value="runs" className="m-0">
					<section className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
						<div className="flex items-center gap-2">
							<Clock3 className="h-4 w-4 text-slate-500" />
							<h2 className="text-sm font-semibold text-slate-950">Sync Runs</h2>
						</div>
						<div className="overflow-hidden rounded-md border border-slate-200">
							<table className="min-w-full divide-y divide-slate-200 text-sm">
								<thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
									<tr>
										<th className="px-3 py-2">Type</th>
										<th className="px-3 py-2">Status</th>
										<th className="px-3 py-2">Source</th>
										<th className="px-3 py-2">Saved</th>
										<th className="px-3 py-2">Skipped</th>
										<th className="px-3 py-2">Failed</th>
										<th className="px-3 py-2">Started</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100 bg-white">
									{isLoadingSyncRuns ? (
										<tr>
											<td
												colSpan={7}
												className="px-3 py-8 text-center text-slate-500">
												<Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
												Loading sync runs...
											</td>
										</tr>
									) : syncRuns.length === 0 ? (
										<tr>
											<td
												colSpan={7}
												className="px-3 py-8 text-center text-slate-500">
												No sync runs found for this device.
											</td>
										</tr>
									) : (
										syncRuns.map((run) => (
											<tr key={run.id}>
												<td className="px-3 py-2">
													{run.runType === "DEVICE_USERS"
														? "Device Users"
														: "Device Logs"}
												</td>
												<td className="px-3 py-2">
													<Badge
														variant={
															run.status === "COMPLETED"
																? "success"
																: run.status === "FAILED"
																	? "destructive"
																	: "secondary"
														}>
														{run.status}
													</Badge>
												</td>
												<td className="px-3 py-2 text-slate-600">
													{run.source || "-"}
												</td>
												<td className="px-3 py-2">
													{metricValue(run.savedRecords)}
												</td>
												<td className="px-3 py-2">
													{metricValue(run.skippedRecords)}
												</td>
												<td className="px-3 py-2">
													{metricValue(run.failedRecords)}
												</td>
												<td className="px-3 py-2 text-slate-600">
													{formatDateTime(run.startedAt)}
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
					</section>
				</TabsContent>
			</Tabs>

			<Modal
				open={deviceUserSyncState.open}
				onOpenChange={(open) => setDeviceUserSyncState((current) => ({ ...current, open }))}
				title={hasEffectiveDeviceUserSyncJobProgress ? "Device-user sync status" : "Sync device users"}
				className="max-w-lg"
				showCloseButton
				closeOnBackdropClick>
				<div className="space-y-3">
					<div
						className={
							deviceUserSyncState.status === "error"
								? "rounded-md border border-red-200 bg-red-50 p-3 text-red-950"
								: deviceUserSyncState.status === "complete"
									? "rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-950"
									: deviceUserSyncState.status === "review"
										? "rounded-md border border-slate-200 bg-white p-3 text-slate-950"
										: "rounded-md border border-orange-200 bg-orange-50 p-3 text-orange-950"
						}>
						<div className="flex items-center gap-2 text-sm font-medium">
							{deviceUserSyncState.status === "syncing" ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : null}
							{deviceUserSyncState.message || "Preparing device user sync."}
						</div>
						{deviceUserSyncState.status === "review" ? (
							<div className="mt-3 space-y-3 text-xs">
								<div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
									<div>
										<span className="block text-slate-500">Device</span>
										<span className="font-semibold text-slate-950">
											{selectedDevice?.name ||
												selectedSyncCenterItem?.device?.name ||
												"-"}
										</span>
									</div>
									<div>
										<span className="block text-slate-500">Vendor</span>
										<span className="font-semibold text-slate-950">
											{selectedSyncCenterItem?.vendor ||
												(selectedDevice
													? getDeviceVendor(selectedDevice)
													: "-")}
										</span>
									</div>
								</div>
								<div className="grid gap-2 sm:grid-cols-4">
									{[
										["Read from device", physicalSourceCount],
										["HRIS records", physicalHrisUserCount],
										["New records", usersToSaveCount],
										["Needs link", openPhysicalUserCount],
									].map(([label, value]) => (
										<div
											key={String(label)}
											className="rounded-md border border-slate-200 px-2 py-1.5">
											<span className="block text-slate-500">{label}</span>
											<span className="font-semibold text-slate-950">
												{metricValue(value)}
											</span>
										</div>
									))}
								</div>
								<div className="grid gap-2 sm:grid-cols-2">
									{[
										[
											"Fingerprint encrypted envelope",
											`${metricValue(selectedSyncCenterItem?.preview?.fingerprintEnvelopePresent)} present · ${metricValue(selectedSyncCenterItem?.preview?.fingerprintEnvelopeMissing)} missing`,
										],
										[
											"Face encrypted envelope",
											`${metricValue(selectedSyncCenterItem?.preview?.faceEnvelopePresent)} present · ${metricValue(selectedSyncCenterItem?.preview?.faceEnvelopeMissing)} missing`,
										],
									].map(([label, value]) => (
										<div key={label} className="rounded-md border border-slate-200 px-2 py-1.5">
											<span className="block text-slate-500">{label}</span>
											<span className="font-semibold text-slate-950">{value}</span>
										</div>
									))}
								</div>
								<p className="text-slate-600">
									The background job rereads every source user, then serially captures
									missing fingerprint and face custody. You can close this window and
									return while it continues.
								</p>
							</div>
						) : null}
						{deviceUserSyncState.status === "complete" ? (
							<div className="mt-3 space-y-3 text-xs">
								<div className="grid gap-2 sm:grid-cols-4">
									{completedDeviceUserSyncItems.map(([label, value]) => (
										<div
											key={label}
											className="rounded-md border border-emerald-200 bg-white/80 px-2 py-1.5">
											<span className="block text-emerald-700">{label}</span>
											<span className="font-semibold text-slate-950">
												{metricValue(value)}
											</span>
										</div>
									))}
								</div>
								<p className="text-emerald-900">
									Rows marked Needs link were saved in HRIS, but no safe employee
									match was found. Use Link to attach the employee manually.
								</p>
							</div>
						) : null}
					</div>
					<div className="flex justify-end gap-2 border-t pt-2">
						<Button
							type="button"
							variant="outline"
							disabled={false}
							onClick={() =>
								setDeviceUserSyncState((current) => ({ ...current, open: false }))
							}>
							{deviceUserSyncState.status === "complete" ? "Close" : "Cancel"}
						</Button>
						{deviceUserSyncState.status === "review" ||
						deviceUserSyncState.status === "error" ? (
							<Button
								type="button"
								disabled={startDeviceUserSyncJobMutation.isPending || !selectedDeviceId}
								onClick={runDeviceUserSync}>
								{startDeviceUserSyncJobMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<RefreshCw className="h-4 w-4" />
								)}
								Sync device users
							</Button>
						) : null}
					</div>
				</div>
			</Modal>

			<Modal
				open={bulkDeviceUserSyncState.open}
				onOpenChange={(open) =>
					setBulkDeviceUserSyncState((current) => ({ ...current, open }))
				}
				title={hasEffectiveDeviceUserSyncJobProgress ? "Device-user sync status" : "Sync device users"}
				description={
					hasEffectiveDeviceUserSyncJobProgress
						? "You can close this window and reopen status from Sync device users."
						: "Choose the manual refresh scope, then reread live device-user truth."
				}
				className={hasEffectiveDeviceUserSyncJobProgress ? "max-w-lg" : "max-w-4xl"}
				showCloseButton
				closeOnBackdropClick>
				<div className="space-y-4">
					<div
						className={`rounded-lg border p-4 ${hasEffectiveDeviceUserSyncJobProgress ? deviceUserSyncJobToneClass : bulkDeviceUserSyncToneClass}`}>
						<div className="flex items-center justify-between gap-3 text-sm font-medium text-slate-950">
							<span className="min-w-0">
							{deviceUserSyncJobIsProcessing ||
							bulkDeviceUserSyncState.status === "starting" ? (
								<Loader2 className="mr-2 inline-block h-4 w-4 animate-spin align-middle" />
							) : null}
							{hasEffectiveDeviceUserSyncJobProgress && deviceUserSyncBiometricTotal > 0
								? `${deviceUserSyncJobIsProcessing ? "Processing" : "Processed"} ${metricValue(deviceUserSyncBiometricProcessed)} of ${metricValue(deviceUserSyncBiometricTotal)} biometric credentials`
								: hasEffectiveDeviceUserSyncJobProgress
									? deviceUserSyncJobTitle
									: bulkDeviceUserSyncTitle}
							</span>
							{hasEffectiveDeviceUserSyncJobProgress ? (
								<span className="shrink-0 font-semibold text-orange-900">
									{deviceUserSyncJobPercent}%
								</span>
							) : null}
						</div>
						{hasEffectiveDeviceUserSyncJobProgress ? (
							<>
								<div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
									<div
										className={`h-full rounded-full transition-all ${deviceUserSyncJobFillClass}`}
										style={{ width: `${deviceUserSyncJobPercent}%` }}
									/>
								</div>
								<p className="mt-3 text-xs text-orange-900/90">
									{deviceUserSyncJobSummary ||
										"HRIS is comparing configured devices against current source-user truth."}
								</p>
							</>
						) : bulkDeviceUserSyncState.status === "error" ? (
							<p className="mt-2 text-xs text-red-900/80">
								{bulkDeviceUserSyncState.message}
							</p>
						) : bulkDeviceUserSyncState.status === "starting" ? (
							<p className="mt-2 text-xs text-orange-900/80">
								{bulkDeviceUserSyncState.message}
							</p>
						) : (
							<p className="mt-2 text-xs text-orange-900/80">
								Use this when user counts, fingerprints, faces, cards, or links may
								be stale.
							</p>
						)}
						<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
							{bulkDeviceUserSyncSummaryItems.map(([label, value]) => (
								<div
									key={String(label)}
									className="rounded-md border border-white/80 bg-white/80 px-3 py-2">
									<p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
										{label}
									</p>
									<p className="mt-1 text-base font-semibold text-slate-950">
										{metricValue(value)}
									</p>
								</div>
							))}
						</div>
						{hasEffectiveDeviceUserSyncJobProgress ? (
							<>
								<div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-orange-100 bg-white/70 px-3 py-2 text-xs text-orange-950">
									<div>
										<span className="block text-orange-700">Current device</span>
										<span className="font-semibold">
											{effectiveDeviceUserSyncJobProgress?.currentDeviceName || "Preparing device"}
										</span>
									</div>
									<div>
										<span className="block text-orange-700">Current credential</span>
										<span className="font-semibold">
											{deviceUserSyncCurrentModality} · {effectiveDeviceUserSyncJobProgress?.currentVendorUserId || "—"}
										</span>
									</div>
								</div>
								<div className="mt-3 grid grid-cols-2 gap-2 border-t border-orange-200 pt-3 text-xs text-orange-950">
									<div>
										<span className="block text-orange-700">Job ID</span>
										<span className="font-medium">{formatDeviceUserSyncJobId(effectiveDeviceUserSyncJobProgress?.jobId)}</span>
									</div>
									<div>
										<span className="block text-orange-700">Started</span>
										<span className="font-medium">{formatDateTime(effectiveDeviceUserSyncJobProgress?.startedAt)}</span>
									</div>
									<div>
										<span className="block text-orange-700">Elapsed</span>
										<span className="font-medium">{deviceUserSyncElapsed}</span>
									</div>
									<div>
										<span className="block text-orange-700">Last update</span>
										<span className="font-medium">
											{deviceUserSyncLastProgressAt
												? formatDateTime(deviceUserSyncLastProgressAt)
												: deviceUserSyncJobUpdatedAt
													? formatDateTime(new Date(deviceUserSyncJobUpdatedAt).toISOString())
													: "Waiting for update"}
										</span>
									</div>
									<div>
										<span className="block text-orange-700">Run state</span>
										<span className="font-medium capitalize">{effectiveDeviceUserSyncJobProgress?.status || "loading"}</span>
									</div>
									<div>
										<span className="block text-orange-700">Privacy</span>
										<span className="font-medium">Encrypted custody only</span>
									</div>
								</div>
							</>
						) : null}
						{!hasEffectiveDeviceUserSyncJobProgress ? (
							<div className="mt-4 rounded-xl border border-white/80 bg-white/70 p-3">
								<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
									<div className="space-y-1">
										<p className="text-sm font-semibold text-slate-950">
											What to refresh
										</p>
										<p className="text-xs text-slate-600">
											Start small with mismatches, reread everything for a
											fresh count, or make every device match the richest
											current truth.
										</p>
									</div>
									<div className="grid gap-2 sm:grid-cols-3 lg:min-w-[640px]">
										<button
											type="button"
											onClick={() =>
												setBulkDeviceUserSyncMode("full_refresh")
											}
											className={`rounded-xl border px-4 py-3 text-left transition ${
												bulkDeviceUserSyncMode === "full_refresh"
													? "border-orange-300 bg-orange-50 text-orange-950 shadow-sm"
													: "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
											}`}>
											<div className="flex items-center justify-between gap-3">
												<span className="text-sm font-semibold">
													All devices
												</span>
												<Badge variant="success">Default</Badge>
											</div>
											<p className="mt-1 text-xs text-current/80">
												Reread every configured device user and refresh HRIS
												biometric counts.
											</p>
										</button>
										<button
											type="button"
											onClick={() =>
												setBulkDeviceUserSyncMode("peer_converge")
											}
											className={`rounded-xl border px-4 py-3 text-left transition ${
												bulkDeviceUserSyncMode === "peer_converge"
													? "border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm"
													: "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
											}`}>
											<div className="flex items-center justify-between gap-3">
												<span className="text-sm font-semibold">
													Make peers match
												</span>
												<Badge variant="outline">Best truth</Badge>
											</div>
											<p className="mt-1 text-xs text-current/80">
												Use the highest current device-user truth as the
												baseline, then copy missing peer users with retry
												logic.
											</p>
										</button>
										<button
											type="button"
											onClick={() =>
												setBulkDeviceUserSyncMode("needs_attention_only")
											}
											className={`rounded-xl border px-4 py-3 text-left transition ${
												bulkDeviceUserSyncMode === "needs_attention_only"
													? "border-amber-300 bg-amber-50 text-amber-950 shadow-sm"
													: "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
											}`}>
											<div className="flex items-center justify-between gap-3">
												<span className="text-sm font-semibold">
													Only mismatches
												</span>
												<Badge variant="secondary">
													{metricValue(
														needsAttentionSyncCenterDevices.length,
													)}{" "}
													devices
												</Badge>
											</div>
											<p className="mt-1 text-xs text-current/80">
												Only refresh devices with count gaps, missing links,
												conflicts, or errors.
											</p>
										</button>
									</div>
								</div>
								<div className="mt-3 flex flex-col gap-3 border-t border-slate-200/80 pt-3 sm:flex-row sm:items-center sm:justify-between">
									<p className="text-xs text-slate-600">
										{bulkDeviceUserSyncModeDescription}
									</p>
									<div className="grid grid-cols-3 gap-2 sm:min-w-[380px]">
										{bulkDeviceUserSyncScopeItems.map(([label, value]) => (
											<div
												key={label}
												className="rounded-lg border border-slate-200 bg-white px-3 py-2">
												<p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
													{label}
												</p>
												<p className="mt-1 text-sm font-semibold text-slate-950">
													{metricValue(value)}
												</p>
											</div>
										))}
									</div>
								</div>
							</div>
						) : null}
					</div>

					{!hasEffectiveDeviceUserSyncJobProgress ? (
					<div className="overflow-hidden rounded-md border border-slate-200">
						<div className="grid grid-cols-[minmax(180px,1.4fr)_110px_110px_90px_110px_110px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
							<span>Device</span>
							<span>From device</span>
							<span>Saved in HRIS</span>
							<span>Gap</span>
							<span>Needs match</span>
							<span>Needs link</span>
						</div>
						{syncCenterDevices.map(({ device, preview }) => {
							const sourceCount = preview?.vendorUserCount;
							const hrisCount = preview?.hrisUserCount;
							const openCount = preview?.openUserCount;
							const peerDriftCount = preview?.peerDriftTotalCount;
							const gapCount =
								typeof sourceCount === "number" && typeof hrisCount === "number"
									? Math.max(sourceCount - hrisCount, 0)
									: null;
							const result = bulkDeviceUserSyncResults.find(
								(item) => item.deviceId === device.id,
							);
							return (
								<div
									key={device.id}
									className="grid gap-3 border-b border-slate-100 px-3 py-3 text-sm last:border-b-0 lg:grid-cols-[minmax(180px,1.4fr)_110px_110px_90px_110px_110px] lg:items-center">
									<div className="min-w-0">
										<p className="truncate font-medium text-slate-950">
											{device.name || "Unnamed device"}
										</p>
										<p className="truncate text-xs text-slate-500">
											{device.address || "-"}:{device.port || "-"}
										</p>
										{Number(peerDriftCount || 0) > 0 &&
										preview?.peerBaselineDeviceName ? (
											<p className="mt-1 truncate text-xs text-emerald-700">
												Best truth: {preview.peerBaselineDeviceName}
											</p>
										) : null}
										{result ? (
											<Badge
												variant={
													result.status === "success"
														? "success"
														: result.status === "cancelled"
															? "secondary"
															: "warning"
												}
												className="mt-2">
												{result.status === "success"
													? "Synced in this run"
													: result.status === "cancelled"
														? "Cancelled in this run"
														: "Needs attention in this run"}
											</Badge>
										) : null}
									</div>
									<div className="font-semibold text-slate-950">
										{metricValue(sourceCount)}
									</div>
									<div className="font-semibold text-slate-950">
										{metricValue(hrisCount)}
									</div>
									<div className="font-semibold text-slate-950">
										{metricValue(gapCount)}
									</div>
									<div className="font-semibold text-slate-950">
										{metricValue(peerDriftCount)}
									</div>
									<div className="font-semibold text-slate-950">
										{metricValue(openCount)}
									</div>
								</div>
							);
						})}
					</div>
					) : null}

					{bulkDeviceUserSyncResults.length > 0 && !deviceUserSyncJobIsProcessing ? (
						<div className="overflow-hidden rounded-md border border-slate-200 bg-white">
							<div className="grid grid-cols-[minmax(160px,1.4fr)_110px_minmax(0,1fr)] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
								<span>Device</span>
								<span>Result</span>
								<span>Sync note</span>
							</div>
							{bulkDeviceUserSyncResults.map((result) => (
								<div
									key={result.deviceId}
									className="grid gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 lg:grid-cols-[minmax(160px,1.4fr)_110px_minmax(0,1fr)] lg:items-center">
									<div className="min-w-0">
										<p className="truncate font-medium text-slate-950">
											{result.deviceName}
										</p>
										<p className="truncate text-xs text-slate-500">
											{result.deviceId}
										</p>
									</div>
									<div>
										<Badge
											variant={
												result.status === "success"
													? "success"
													: result.status === "cancelled"
														? "secondary"
														: "warning"
											}>
											{result.status === "success"
												? "Synced"
												: result.status === "cancelled"
													? "Cancelled"
													: "Needs attention"}
										</Badge>
									</div>
									<p className="text-sm text-slate-600">
										{result.status === "success"
											? result.summary?.mode === "peer_converge"
												? `${metricValue(result.summary?.copiedUsers)} copied, ${metricValue(result.summary?.retryCount)} retries, ${metricValue(result.summary?.failedCopies)} failed, ${metricValue(result.summary?.syntheticFaceMirrors)} mock-face mirrors.`
												: `${metricValue(result.summary?.created)} created, ${metricValue(result.summary?.updated)} updated, ${metricValue(result.summary?.unmatched)} need link.`
											: result.status === "cancelled"
												? "Sync was cancelled before this device was completed."
												: result.error || "Sync failed."}
									</p>
								</div>
							))}
						</div>
					) : null}

					<div className="flex justify-end gap-2 border-t pt-2">
						<Button
							type="button"
							variant="outline"
							onClick={() =>
								setBulkDeviceUserSyncState((current) => ({
									...current,
									open: false,
								}))
							}>
							Close
						</Button>
						{deviceUserSyncJobIsProcessing ? (
							<Button
								type="button"
								variant="outline"
								className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
								disabled={
									cancelDeviceUserSyncJobMutation.isPending ||
									deviceUserSyncJobCancelRequested
								}
								onClick={requestCancelDeviceUserSyncJob}>
								{cancelDeviceUserSyncJobMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<XCircle className="h-4 w-4" />
								)}
								{cancelDeviceUserSyncJobMutation.isPending
									? "Cancelling..."
									: deviceUserSyncJobCancelRequested
										? "Cancel requested"
										: "Cancel sync"}
							</Button>
						) : null}
						{hasEffectiveDeviceUserSyncJobProgress && !deviceUserSyncJobIsProcessing ? (
							<Button
								type="button"
								className="gap-2 bg-orange-500 text-white hover:bg-orange-600"
								disabled={startDeviceUserSyncJobMutation.isPending}
								onClick={() => void runBulkDeviceUserSync()}>
								{startDeviceUserSyncJobMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<RefreshCw className="h-4 w-4" />
								)}
								{startDeviceUserSyncJobMutation.isPending
									? "Starting..."
									: "Run another refresh"}
							</Button>
						) : null}
						{hasEffectiveDeviceUserSyncJobProgress && !deviceUserSyncJobIsProcessing ? (
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setActiveDeviceUserSyncJob(null);
									setBulkDeviceUserSyncState((current) => ({
										...current,
										open: false,
										lastProgress: null,
									}));
								}}>
								Dismiss status
							</Button>
						) : null}
						{!deviceUserSyncJobIsProcessing ? (
							<Button
								type="button"
								variant="outline"
								disabled={
									syncCenterDevices.length < 2 ||
									planHikvisionSdkUserMergeMutation.isPending
								}
								onClick={() => void openSdkUserMerge()}>
								{planHikvisionSdkUserMergeMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Link2 className="h-4 w-4" />
								)}
								Review device-user merge
							</Button>
						) : null}
						{!deviceUserSyncJobIsProcessing ? (
							<Button
								type="button"
								className="gap-2 bg-orange-500 text-white hover:bg-orange-600"
								disabled={
									startDeviceUserSyncJobMutation.isPending ||
									syncCenterDevices.length === 0 ||
									(bulkDeviceUserSyncMode === "needs_attention_only" &&
										needsAttentionSyncCenterDevices.length === 0)
								}
								onClick={() => void runBulkDeviceUserSync()}>
								{startDeviceUserSyncJobMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<RefreshCw className="h-4 w-4" />
								)}
								{startDeviceUserSyncJobMutation.isPending
									? "Starting..."
									: bulkDeviceUserSyncMode === "needs_attention_only"
										? "Refresh mismatches"
										: bulkDeviceUserSyncMode === "peer_converge"
											? "Make devices match"
											: "Refresh all devices"}
							</Button>
						) : null}
						{!deviceUserSyncJobIsProcessing &&
						bulkDeviceUserSyncState.status === "error" ? (
							<Button
								type="button"
								variant="outline"
								onClick={() =>
									setBulkDeviceUserSyncState({
										open: false,
										status: "idle",
										message: "",
										lastProgress: null,
									})
								}>
								Dismiss error
							</Button>
						) : null}
					</div>
				</div>
			</Modal>
			<Modal
				open={sdkMergeState.open}
				onOpenChange={(open) => setSdkMergeState((current) => ({ ...current, open }))}
				title="Merge device users"
				className="max-w-5xl"
				showCloseButton={!sdkMergeJobIsProcessing}
				closeOnBackdropClick={!sdkMergeJobIsProcessing}>
				<div className="space-y-3">
					<div
						className={`rounded-md border px-3 py-2 ${
							sdkMergeState.status === "error"
								? "border-red-200 bg-red-50 text-red-950"
								: sdkMergeState.status === "done"
									? "border-emerald-200 bg-emerald-50 text-emerald-950"
									: "border-slate-200 bg-white text-slate-950"
						}`}>
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div className="flex min-w-0 items-center gap-2 text-sm font-medium">
								{sdkMergeState.status === "loading" || sdkMergeJobIsProcessing ? (
									<Loader2 className="h-4 w-4 shrink-0 animate-spin" />
								) : null}
								<span className="truncate">
									{sdkMergeState.message || "Review device-user conflicts."}
								</span>
							</div>
						</div>
					</div>

					{hasSdkMergeJob ? (
						<div className={`rounded-lg border p-4 ${sdkMergeJobToneClass}`}>
							<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
								<div className="min-w-0">
									<div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
										{sdkMergeJobIsProcessing ? (
											<Loader2 className="h-4 w-4 animate-spin text-orange-700" />
										) : null}
										<span>{sdkMergeJobTitle}</span>
									</div>
									<p className="mt-1 text-sm opacity-90">
										{effectiveSdkMergeJob?.message ||
											"Loading merge job status..."}
									</p>
								</div>
								<div className="shrink-0 text-right text-sm font-semibold">
									{sdkMergeJobPercent}%
								</div>
							</div>
							<div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
								<div
									className={`h-full rounded-full transition-all ${sdkMergeJobFillClass}`}
									style={{ width: `${sdkMergeJobPercent}%` }}
								/>
							</div>
							<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
								{sdkMergeJobSummaryItems.map(([label, value]) => (
									<div
										key={String(label)}
										className="rounded-md border border-white/80 bg-white/80 px-3 py-2">
										<p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
											{label}
										</p>
										<p className="mt-1 text-base font-semibold text-slate-950">
											{mergeMetricValue(value)}
										</p>
									</div>
								))}
							</div>
							<p className="mt-3 text-xs opacity-90">
								{sdkMergeJobSummary ||
									"HRIS is applying the reviewed recommended-source plan, copying credentials, then rereading devices."}
							</p>
							{effectiveSdkMergeJob?.error ? (
								<p className="mt-2 text-xs text-red-800">
									{effectiveSdkMergeJob.error}
								</p>
							) : null}
							{sdkMergeJobResults.length > 0 ? (
								<div className="mt-3 overflow-hidden rounded-md border border-white/80 bg-white">
									<div className="grid grid-cols-[minmax(150px,1fr)_110px_minmax(0,1.2fr)] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
										<span>User</span>
										<span>Result</span>
										<span>Target / note</span>
									</div>
									{sdkMergeJobResults.slice(0, 8).map((result, index) => (
										<div
											key={`${result.userKey || index}:${result.targetDeviceId || ""}`}
											className="grid gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 lg:grid-cols-[minmax(150px,1fr)_110px_minmax(0,1.2fr)] lg:items-center">
											<div className="min-w-0">
												<p className="truncate font-medium text-slate-950">
													{result.userKey || "Device user"}
												</p>
												<p className="truncate text-xs text-slate-500">
													{result.sourceDeviceId || "-"}
												</p>
											</div>
											<Badge
												variant={
													result.status === "success"
														? "success"
														: "warning"
												}>
												{result.status === "success" ? "Applied" : "Retry"}
											</Badge>
											<p className="min-w-0 break-words text-sm text-slate-700">
												{result.status === "success"
													? `${result.targetDeviceId || "Target device"}${result.strategy ? ` / ${result.strategy}` : ""}`
													: result.error ||
														"Copy failed for this target."}
											</p>
										</div>
									))}
									{sdkMergeJobResults.length > 8 ? (
										<div className="px-3 py-2 text-xs text-slate-500">
											Showing 8 of {sdkMergeJobResults.length} job rows.
										</div>
									) : null}
								</div>
							) : null}
						</div>
					) : null}

					{sdkMergeState.data && sdkMergeState.status !== "loading" ? (
						<>
							<div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
								<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
									<div className="min-w-0">
										<p className="text-sm font-semibold text-slate-950">
											Preview merge by unique ID
										</p>
										<p className="mt-1 text-xs text-slate-600">
											{mergePlural(sdkMergeSelectedUniqueCount, "selected unique ID")} ·{" "}
											{mergePlural(sdkMergeSelectedPotentialWriteCount, "selected potential write")} ·{" "}
											{sdkMergeExcludedActionableCount} excluded
										</p>
										{sdkMergeBlockingCount > 0 ? (
											<p className="mt-1 text-xs font-medium text-amber-700">
												Resolve {sdkMergeBlockingCount} device read issue
												{sdkMergeBlockingCount === 1 ? "" : "s"} before
												starting the merge job.
											</p>
										) : null}
									</div>
									<div className="flex flex-wrap justify-end gap-2">
										<Button
											type="button"
											variant="outline"
											onClick={() =>
												setSelectedSdkMergeUserKeys(
													Object.fromEntries(
														sdkMergeScopedSelectableUserKeys.map((key) => [
															key,
															true,
														]),
													),
												)
											}
											disabled={sdkMergeScopedSelectableUserKeys.length === 0}>
											Select all in scope
										</Button>
										<Button
											type="button"
											variant="outline"
											onClick={() =>
												setSelectedSdkMergeUserKeys((current) => {
													const next = { ...current };
													for (const key of sdkMergeScopedSelectableUserKeys) {
														delete next[key];
													}
													return next;
												})
											}
											disabled={sdkMergeScopedSelectedCount === 0}>
											Deselect scope
										</Button>
										<Button
											type="button"
											onClick={autoResolveSdkMergeFromRichest}
											disabled={
												sdkMergeJobIsProcessing ||
												sdkMergeBlockingCount > 0 ||
												sdkMergeConflictCount === 0
											}>
											<RefreshCw className="h-4 w-4" />
											Preview recommended choices
										</Button>
										{sdkMergeState.applyAll ||
										Object.keys(sdkMergeState.choices).length ? (
											<Button
												type="button"
												variant="outline"
												onClick={() =>
													setSdkMergeState((current) => ({
														...current,
														applyAll: undefined,
														choices: {},
													}))
												}>
												Clear choices
											</Button>
										) : null}
									</div>
								</div>
							</div>

							<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
								{[
									["unique", "Unique IDs", sdkMergeUniqueIdCount],
									["records", "Device records read", sdkMergeDeviceRecordCount],
									["review", "Needs review", sdkMergeAttentionRowCount],
									["writes", "Potential writes", sdkMergePotentialWriteCount],
								].map(([mode, label, value]) => (
									<button
										type="button"
										key={String(label)}
										aria-label={`Show ${label}`}
										onClick={() => setSdkMergeListMode(mode as SdkMergeListMode)}
										className={`rounded-md border px-3 py-2 text-left ${
											sdkMergeListMode === mode
												? "border-orange-300 bg-orange-50"
												: "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
										}`}>
										<div className="flex items-baseline justify-between gap-3">
											<span className="text-xs font-medium text-slate-600">
												{label}
											</span>
											<span className="text-sm font-semibold text-slate-950">
												{mergeMetricValue(value)}
											</span>
										</div>
									</button>
								))}
							</div>

							<div className="flex flex-wrap gap-2">
								{sdkMergeFilterItems.map((item) => (
									<button
										key={item.value}
										type="button"
										onClick={() => setSdkMergeFilter(item.value)}
										className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${
											sdkMergeFilter === item.value
												? "border-orange-300 bg-orange-50 text-orange-950"
												: "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
										}`}>
										<span>{item.label}</span>
										<span
											className={`rounded border px-1.5 py-0.5 text-xs ${sdkMergeFilter === item.value ? "border-orange-200 bg-white text-orange-950" : "border-slate-200 bg-white text-slate-700"}`}>
											{item.count}
										</span>
									</button>
								))}
							</div>

							<div className="overflow-hidden rounded-md border border-slate-200 bg-white">
								<div className="border-b border-slate-200 bg-white px-3 py-2">
									<p className="text-sm font-semibold text-slate-950">
										Per-device impact
									</p>
								</div>
								<div className="grid gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-700 lg:grid-cols-[minmax(180px,1fr)_88px_repeat(4,106px)]">
									<span>Device</span>
									<span>IDs read</span>
									<span>Missing</span>
									<span>Decision</span>
									<span>Finger</span>
									<span>Face</span>
								</div>
								{sdkMergeDeviceIssueCounts.map(({ device, read, counts }) => (
									<div
										key={device.id}
										className="grid gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 lg:grid-cols-[minmax(180px,1fr)_88px_repeat(4,106px)] lg:items-center">
										<button
											type="button"
											aria-label={`Show unique IDs for ${device.name || device.address || device.id}`}
											onClick={() => setSdkMergeDeviceListMode(device.id, "unique")}
											className={`min-w-0 text-left font-medium ${selectedMergeDeviceId === device.id ? "text-orange-800" : "text-slate-950"}`}>
											<span className="block truncate">
												{device.name || device.address || device.id}
											</span>
											<span
												className={`block truncate text-xs font-normal ${selectedMergeDeviceId === device.id ? "text-orange-900" : "text-slate-700"}`}>
												{device.address || device.id}
											</span>
										</button>
										<button
											type="button"
											aria-label={`Show ${read} unique IDs for ${device.name || device.address || device.id}`}
											onClick={() => setSdkMergeDeviceListMode(device.id, "unique")}
											className={getSdkMergeCountButtonClass(
												selectedMergeDeviceId === device.id &&
													sdkMergeListMode === "unique",
												read,
											)}>
											{read}
										</button>
										{(
											[
												["missing", counts.missing],
												["decision", counts.decision],
												["fingerprint", counts.fingerprint],
												["face", counts.face],
											] as Array<[SdkMergeFilter, number]>
										).map(([filter, count]) => (
											<button
												key={filter}
												type="button"
												aria-label={`Show ${count} ${filter} rows for ${device.name || device.address || device.id}`}
												onClick={() =>
													setSdkMergeDeviceFilter(device.id, filter)
												}
												className={getSdkMergeCountButtonClass(
													selectedMergeDeviceId === device.id &&
														sdkMergeFilter === filter,
													count,
												)}>
												{count}
											</button>
										))}
									</div>
								))}
							</div>

							<div className="overflow-hidden rounded-md border border-slate-200 bg-white">
								<div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
									<div className="min-w-0">
										<p className="text-sm font-semibold text-slate-950">
											{sdkMergeActiveFilterLabel}:{" "}
											{sdkMergeVisibleRows.length} row
											{sdkMergeVisibleRows.length === 1 ? "" : "s"}
										</p>
									</div>
									{selectedMergeDeviceId !== "all" ||
									selectedMergeUserKey ||
									sdkMergeSearch ? (
										<Button
											type="button"
											variant="outline"
											onClick={() =>
												updateSearchParams((next) => {
													next.delete("mergeDeviceId");
													next.delete("mergeUser");
													next.delete("mergeSearch");
													next.delete("mergeFilter");
													next.set("mergePage", "1");
												})
											}>
											Clear scope
										</Button>
									) : null}
								</div>
								{sdkMergeSearch ? (
									<div className="border-b border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
										Searching live device-user records for{" "}
										<span className="font-semibold text-slate-950">
											{sdkMergeSearch}
										</span>
										.
										Offline or unavailable devices are skipped before results appear.
									</div>
								) : null}
								<div className="max-h-[48vh] overflow-y-auto">
									{sdkMergeVisibleRows.length === 0 ? (
										<div className="px-3 py-8 text-center text-sm text-slate-600">
											{sdkMergeSearch
												? "No live device-user records matched this search across the devices that were available."
												: "No rows match this tally. Choose another count or clear the device scope."}
										</div>
									) : (
										<>
											<div
												role="row"
												className="sticky top-0 z-10 grid min-w-[1040px] grid-cols-[56px_88px_minmax(180px,1fr)_170px_170px_minmax(220px,1.1fr)_152px] items-center gap-3 border-b border-slate-200 bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase text-slate-600">
												<span className="text-center">Select</span>
												<span>ID</span>
												<span>User</span>
												<span>Fingerprint</span>
												<span>Face</span>
												<span>Recommendation</span>
												<span className="text-right">Actions</span>
											</div>
											{sdkMergePagedRows.map((row) => {
											const hasConflictFields = Boolean(
												row.conflictFields?.length || row.conflictField,
											);
											const isSelected = selectedMergeUserKey === row.userKey;
											const isActionable = sdkMergeActionableUserKeys.includes(
												row.userKey,
											);
											const isSelectable = Boolean(row.userKey);
											const isRowChecked = Boolean(
												selectedSdkMergeUserKeys[row.userKey],
											);
											const recommendationReason = mergeRecommendationReason(row);
											const rowIssueRows = sdkMergeRows.filter(
												(issueRow) =>
													issueRow.userKey === row.userKey &&
													issueRow.filter !== "ready",
											);
											const rowIssueSummary = rowIssueRows
												.slice(0, 3)
												.map((issueRow) => issueRow.issueLabel)
												.join(", ");
											const rowShowsDeviceJourney =
												sdkMergeListMode === "unique" ||
												sdkMergeListMode === "review" ||
												sdkMergeListMode === "records";
											const renderCredentialCountCell = (
												kind: SdkMergeCredentialKind,
											) => {
												const truth = mergeCredentialTruth(row.user, sdkMergePlanDevices, kind);
												const hasIssue = truth.present < truth.expected;
												const issueCount = truth.expected - truth.present;
												return (
													<div className="min-w-0 text-xs text-slate-700">
														<div className="inline-grid grid-cols-[2.25rem_0.75rem_2.25rem] items-center">
															<span
																className={`rounded-md border px-1.5 py-0.5 text-center text-sm font-semibold ${
																	hasIssue
																		? "border-amber-300 bg-amber-50 text-amber-950"
																		: "border-emerald-200 bg-emerald-50 text-emerald-800"
																}`}
																title={`Connected: ${truth.connectedDevices.join(", ") || "None"}`}>
																{mergeMetricValue(truth.present)}
															</span>
															<span className="text-center text-[11px] font-medium text-slate-400">/</span>
															<button
																type="button"
																onClick={() =>
																	setSdkMergeCredentialPicker({
																		rowId: row.id,
																		kind,
																	})
																}
																className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-center text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-50"
																title={`Expected active devices: ${truth.expected}`}
																aria-label={`Review ${kind} devices for vendor user ID ${row.vendorUserId}`}>
																{mergeMetricValue(truth.expected)}
															</button>
														</div>
														<button
															type="button"
															onClick={() =>
																setSdkMergeSourceReview({
																	rowId: row.id,
																})
															}
															className={`mt-1 block max-w-full truncate text-left text-[11px] font-medium ${
																hasIssue
																	? "text-amber-700 hover:text-amber-900"
																	: "text-slate-500 hover:text-slate-700"
															}`}
															title={
																hasIssue
																	? `Missing: ${truth.missingDevices.join(", ")}`
																	: `Connected: ${truth.connectedDevices.join(", ")}`
															}>
															{hasIssue
																? `Issue: ${mergePlural(issueCount, "device")}`
																: "Aligned"}
														</button>
													</div>
												);
											};
											return (
												<div
													key={row.id}
													role="row"
													className={`min-w-[1040px] border-b border-slate-100 px-3 py-3 last:border-b-0 ${isSelected ? "bg-white ring-1 ring-inset ring-orange-200" : "bg-white"} ${!isSelectable ? "text-slate-500" : ""}`}>
													<div className="grid grid-cols-[56px_88px_minmax(180px,1fr)_170px_170px_minmax(220px,1.1fr)_152px] items-start gap-3">
														<div className="flex justify-center pt-1">
															<input
																type="checkbox"
																className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
																checked={isRowChecked}
																disabled={!isSelectable}
																aria-label={`Select vendor user ID ${row.vendorUserId} for merge preview`}
																title={
																	isSelectable
																		? isActionable
																			? "Include this unique ID in the merge preview"
																			: "Include this aligned unique ID in the preview; no update is expected"
																		: "This row cannot be selected"
																}
																onChange={(event) => {
																	const checked = event.target.checked;
																	setSelectedSdkMergeUserKeys((current) => ({
																		...current,
																		[row.userKey]: checked,
																	}));
																}}
															/>
														</div>
														<div className="min-w-0">
															<p className="truncate text-sm font-semibold text-slate-950">
																{row.vendorUserId}
															</p>
															<p className="mt-0.5 truncate text-[11px] text-slate-500">
																{row.issueLabel}
															</p>
														</div>
														<div className="min-w-0">
															<button
																type="button"
																onClick={() =>
																	setSelectedMergeUser(
																		row.userKey,
																	)
																}
																className="block max-w-full truncate text-left text-sm font-semibold text-slate-950 hover:text-orange-800">
																{row.personLabel}
															</button>
															{row.user.employeeId ? (
																<p className="mt-0.5 truncate text-xs text-slate-600">
																	HRIS employee {row.user.employeeId}
																</p>
															) : (
																<p className="mt-0.5 truncate text-xs text-slate-600">
																	No HRIS employee link
																</p>
															)}
														</div>
														{renderCredentialCountCell("fingerprint")}
														{renderCredentialCountCell("face")}
														<button
															type="button"
															onClick={() =>
																setSdkMergeSourceReview({
																	rowId: row.id,
																})
															}
															className="min-w-0 space-y-1 text-left"
															title={
																rowIssueRows.length
																	? `${rowIssueSummary}${rowIssueRows.length > 3 ? ", ..." : ""}`
																	: "Aligned across the visible review checks"
															}
															aria-label={`Open review journey for vendor user ID ${row.vendorUserId}`}>
															<Badge
																variant={
																	row.filter === "ready"
																		? "success"
																		: row.filter === "decision"
																			? "warning"
																			: "secondary"
																}>
																{row.issueLabel}
															</Badge>
															{rowShowsDeviceJourney ? (
																<p className="truncate text-[11px] text-slate-500">
																	{rowIssueRows.length
																		? `${mergePlural(rowIssueRows.length, "issue")} for this ID`
																		: "Aligned"}
																</p>
															) : null}
														</button>
														<div className="flex items-center justify-end gap-1.5">
															<TooltipProvider>
																{hasConflictFields ? (
																	<Tooltip>
																		<TooltipTrigger asChild>
																			<Button
																				type="button"
																				size="sm"
																				variant="outline"
																				className="h-8 w-8 bg-white p-0"
																				aria-label={`Keep current values for vendor user ID ${row.vendorUserId}`}
																				onClick={() => keepSdkMergeCurrent(row)}>
																				<CheckCircle2 className="h-4 w-4" />
																			</Button>
																		</TooltipTrigger>
																		<TooltipContent className="text-xs">
																			Keep current values
																		</TooltipContent>
																	</Tooltip>
																) : null}
																<Tooltip>
																	<TooltipTrigger asChild>
																		<Button
																			type="button"
																			size="sm"
																			variant="outline"
																			className="h-8 w-8 bg-white p-0"
																			aria-label={`Review sources for vendor user ID ${row.vendorUserId}`}
																			onClick={() =>
																				setSdkMergeSourceReview({
																					rowId: row.id,
																				})
																			}>
																			<Eye className="h-4 w-4" />
																		</Button>
																	</TooltipTrigger>
																	<TooltipContent className="max-w-xs text-xs">
																		<p className="font-semibold">Review sources</p>
																		<p className="mt-1">{recommendationReason}</p>
																	</TooltipContent>
																</Tooltip>
															</TooltipProvider>
														</div>
													</div>
												</div>
											);
										})}
										</>
									)}
								</div>
								{sdkMergeVisibleRows.length > sdkMergeRowsPerPage ? (
									<div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
										<p className="text-xs text-slate-600">
											Showing {mergeMetricValue(sdkMergePageStart + 1)}-
											{mergeMetricValue(
												Math.min(
													sdkMergePageStart + sdkMergeRowsPerPage,
													sdkMergeVisibleRows.length,
												),
											)}{" "}
											of {mergePlural(sdkMergeVisibleRows.length, "row")}
										</p>
										<div className="flex items-center gap-2">
											<Button
												type="button"
												size="sm"
												variant="outline"
												disabled={safeSdkMergePage <= 1}
												onClick={() => setSdkMergePage(safeSdkMergePage - 1)}>
												Previous
											</Button>
											<span className="text-xs font-medium text-slate-700">
												Page {safeSdkMergePage} of {sdkMergeTotalPages}
											</span>
											<Button
												type="button"
												size="sm"
												variant="outline"
												disabled={safeSdkMergePage >= sdkMergeTotalPages}
												onClick={() => setSdkMergePage(safeSdkMergePage + 1)}>
												Next
											</Button>
										</div>
									</div>
								) : null}
							</div>
						</>
					) : null}
					<div className="flex justify-end gap-2 border-t pt-3">
						{sdkMergeState.data && !hasSdkMergeJob ? (
							<p className="mr-auto max-w-xl text-xs leading-5 text-slate-600">
								{sdkMergePreviewOnly
									? `Preview mode is on. ${mergePlural(sdkMergeSelectedUniqueCount, "selected unique ID")} and ${mergePlural(sdkMergeSelectedPotentialWriteCount, "selected potential write")} are included; ${mergePlural(sdkMergeExcludedActionableCount, "actionable ID")} excluded.`
									: `${mergePlural(sdkMergeSelectedUniqueCount, "selected unique ID")} will be used. Starting the job will copy selected records and reread devices.`}
							</p>
						) : null}
						<Button
							type="button"
							variant="outline"
							disabled={sdkMergeJobIsProcessing}
							onClick={() =>
								setSdkMergeState((current) => ({ ...current, open: false }))
							}>
							Close
						</Button>
						{hasSdkMergeJob && !sdkMergeJobIsProcessing ? (
							<Button
								type="button"
								variant="outline"
								onClick={dismissSdkUserMergeJob}>
								Dismiss merge status
							</Button>
						) : null}
						{effectiveSdkMergeJob?.status === "failed" ? (
							<Button
								type="button"
								className="gap-2 bg-orange-500 text-white hover:bg-orange-600"
								disabled={
									startHikvisionSdkUserMergeJobMutation.isPending ||
									sdkMergeBlockingCount > 0 ||
									!sdkMergeState.data
								}
								onClick={() => void retrySdkUserMergeJob()}>
								{startHikvisionSdkUserMergeJobMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<RefreshCw className="h-4 w-4" />
								)}
								{startHikvisionSdkUserMergeJobMutation.isPending
									? "Starting..."
									: "Retry merge job"}
							</Button>
						) : null}
						{sdkMergeState.data && !hasSdkMergeJob ? (
							<Button
								type="button"
								disabled={
									sdkMergePreviewOnly ||
									!sdkMergeCanApply ||
									sdkMergeJobIsProcessing ||
									startHikvisionSdkUserMergeJobMutation.isPending
								}
								onClick={() => void applySdkUserMerge()}>
								{startHikvisionSdkUserMergeJobMutation.isPending ||
								sdkMergeJobIsProcessing ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Link2 className="h-4 w-4" />
								)}
								{sdkMergeBlockingCount
									? `Resolve ${sdkMergeBlockingCount} read issue${sdkMergeBlockingCount === 1 ? "" : "s"}`
									: sdkMergePreviewOnly
										? "Preview only"
										: sdkMergeSelectedUniqueCount === 0
										? "Select rows"
										: sdkMergeSelectedResolvedCount < sdkMergeSelectedConflictCount
										? `Preview ${sdkMergeSelectedConflictCount - sdkMergeSelectedResolvedCount} more`
										: sdkMergeJobIsProcessing
											? "Merge job running"
											: `Start merge job (${sdkMergeSelectedUniqueCount})`}
							</Button>
						) : null}
					</div>
				</div>
			</Modal>

			<Modal
				open={Boolean(sdkMergeSourceReview && selectedSdkMergeSourceReviewRow)}
				onOpenChange={(open) => {
					if (!open) setSdkMergeSourceReview(null);
				}}
				title="Review sources"
				description="Compare the current device truth against available source records."
				className="max-w-3xl">
				{selectedSdkMergeSourceReviewRow ? (
					<div className="space-y-4">
						<div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
							<div className="min-w-0">
								<p className="truncate text-sm font-semibold text-slate-950">
									{selectedSdkMergeSourceReviewRow.personLabel}
								</p>
								<p className="mt-0.5 truncate text-xs text-slate-600">
									ID {selectedSdkMergeSourceReviewRow.vendorUserId}
								</p>
							</div>
							<Badge
								variant={
									selectedSdkMergeSourceReviewRow.filter === "ready"
										? "success"
										: selectedSdkMergeSourceReviewRow.filter === "decision"
											? "warning"
											: "secondary"
								}>
								{selectedSdkMergeSourceReviewRow.issueLabel}
							</Badge>
						</div>
						{(() => {
							const issueRows = sdkMergeRows.filter(
								(row) =>
									row.userKey === selectedSdkMergeSourceReviewRow.userKey &&
									row.filter !== "ready",
							);
							return (
								<div className="rounded-md border border-slate-200 bg-white">
									<div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
										<p className="text-xs font-semibold uppercase text-slate-600">
											Review journey
										</p>
									</div>
									{issueRows.length ? (
										<div className="divide-y divide-slate-100">
											{issueRows.map((issueRow) => (
												<div
													key={`${selectedSdkMergeSourceReviewRow.id}:journey:${issueRow.id}`}
													className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)]">
													<p className="font-medium text-slate-950">
														{issueRow.issueLabel}
													</p>
													<p className="min-w-0 truncate text-slate-600">
														{issueRow.missingLabel}
													</p>
													<p className="min-w-0 break-words text-xs text-slate-500">
														{issueRow.recommendedAction}
													</p>
												</div>
											))}
										</div>
									) : (
										<p className="px-3 py-3 text-sm text-slate-600">
											No review issues for this ID. Fingerprint and face are aligned across the selected devices.
										</p>
									)}
								</div>
							);
						})()}
						<div className="grid gap-2 md:grid-cols-2">
							{(["fingerprint", "face"] as const).map((kind) => {
								const truth = mergeCredentialTruth(
									selectedSdkMergeSourceReviewRow.user,
									sdkMergePlanDevices,
									kind,
								);
								const issueCount = truth.expected - truth.present;
								return (
									<div
										key={`${selectedSdkMergeSourceReviewRow.id}:truth:${kind}`}
										className={`min-w-0 rounded-md border px-3 py-2 ${
											issueCount > 0
												? "border-amber-200 bg-amber-50"
												: "border-emerald-200 bg-emerald-50"
										}`}>
										<div className="flex items-center justify-between gap-2">
											<p className="text-xs font-semibold uppercase text-slate-600">
												{mergeFieldLabel(kind)}
											</p>
											<span className="rounded-md border border-white/80 bg-white px-2 py-0.5 text-xs font-semibold text-slate-950">
												{truth.present} / {truth.expected}
											</span>
										</div>
										<p className="mt-1 truncate text-xs text-slate-700">
											Connected: {truth.connectedDevices.join(", ") || "None"}
										</p>
										<p
											className={`mt-0.5 truncate text-xs ${
												issueCount > 0 ? "text-amber-800" : "text-emerald-800"
											}`}>
											Missing: {truth.missingDevices.join(", ") || "None"}
										</p>
									</div>
								);
							})}
						</div>
						<div className="overflow-hidden rounded-md border border-slate-200">
							<div className="grid grid-cols-[minmax(180px,1.4fr)_76px_76px_minmax(140px,1fr)] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500">
								<span>Source</span>
								<span>Finger</span>
								<span>Face</span>
								<span>Status</span>
							</div>
							<div className="max-h-[320px] overflow-auto bg-white">
								{(selectedSdkMergeSourceReviewRow.user.records || []).map((record: any) => {
									const deviceName = mergeDeviceName(sdkMergePlanDevices, record.deviceId);
									const isRecommended =
										record.deviceId === selectedSdkMergeSourceReviewRow.sourceDeviceId;
									const isCurrent =
										record.deviceId === selectedSdkMergeSourceReviewRow.targetDeviceId ||
										(selectedMergeDeviceId !== "all" &&
											record.deviceId === selectedMergeDeviceId);
									return (
										<div
											key={`${selectedSdkMergeSourceReviewRow.id}:source-modal:${record.deviceId}`}
											className="grid grid-cols-[minmax(180px,1.4fr)_76px_76px_minmax(140px,1fr)] gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
											<div className="min-w-0">
												<p className="truncate font-semibold text-slate-950">
													{deviceName}
												</p>
												<p className="truncate text-xs text-slate-500">
													{record.employeeId
														? `HRIS ${record.employeeId}`
														: "No HRIS link"}
												</p>
											</div>
											<span className="font-semibold text-slate-950">
												{mergeMetricValue(mergeCredentialCount(record, "fingerprint"))}
											</span>
											<span className="font-semibold text-slate-950">
												{mergeMetricValue(mergeCredentialCount(record, "face"))}
											</span>
											<div className="flex min-w-0 flex-wrap gap-1">
												{isCurrent ? <Badge variant="secondary">Current</Badge> : null}
												{isRecommended ? <Badge variant="success">Recommended</Badge> : null}
												{!isCurrent && !isRecommended ? (
													<span className="truncate text-xs text-slate-500">Available</span>
												) : null}
											</div>
										</div>
									);
								})}
								{(selectedSdkMergeSourceReviewRow.user.missingOnDeviceIds || []).map((deviceId) => (
									<div
										key={`${selectedSdkMergeSourceReviewRow.id}:source-modal-missing:${deviceId}`}
										className="grid grid-cols-[minmax(180px,1.4fr)_76px_76px_minmax(140px,1fr)] gap-3 border-b border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-950 last:border-b-0">
										<div className="min-w-0">
											<p className="truncate font-semibold">
												{mergeDeviceName(sdkMergePlanDevices, deviceId)}
											</p>
											<p className="truncate text-xs">Missing this vendor user ID</p>
										</div>
										<span>0</span>
										<span>0</span>
										<Badge variant="warning">Missing</Badge>
									</div>
								))}
							</div>
						</div>
						{selectedSdkMergeSourceReviewRow.user.conflicts.length ? (
							<div className="space-y-2">
								<p className="text-xs font-semibold uppercase text-slate-500">
									Decisions
								</p>
								{selectedSdkMergeSourceReviewRow.user.conflicts.map((conflict) => {
									const selected =
										sdkMergeState.choices[selectedSdkMergeSourceReviewRow.userKey]?.[
											conflict.field
										] || sdkMergeState.applyAll;
									return (
										<div
											key={`${selectedSdkMergeSourceReviewRow.id}:modal-conflict:${conflict.field}`}
											className="grid gap-2 rounded-md border border-slate-200 bg-white p-2 md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_76px] md:items-center">
											<span className="text-xs font-medium text-slate-700">
												{mergeFieldLabel(conflict.field)}
											</span>
											<button
												type="button"
												onClick={() =>
													setSdkMergeChoice(
														selectedSdkMergeSourceReviewRow.userKey,
														conflict.field,
														"A",
													)
												}
												className={`min-w-0 text-left ${getSdkMergeChoiceButtonClass(selected === "A")}`}>
												<span className="block truncate font-medium">
													{conflict.deviceA.name}
												</span>
												<span className="block break-words">
													{mergeFieldValueLabel(conflict.deviceA.value)}
												</span>
											</button>
											<button
												type="button"
												onClick={() =>
													setSdkMergeChoice(
														selectedSdkMergeSourceReviewRow.userKey,
														conflict.field,
														"B",
													)
												}
												className={`min-w-0 text-left ${getSdkMergeChoiceButtonClass(selected === "B")}`}>
												<span className="block truncate font-medium">
													{conflict.deviceB.name}
												</span>
												<span className="block break-words">
													{mergeFieldValueLabel(conflict.deviceB.value)}
												</span>
											</button>
											<Button
												type="button"
												size="sm"
												variant="outline"
												onClick={() =>
													setSdkMergeChoice(
														selectedSdkMergeSourceReviewRow.userKey,
														conflict.field,
														"KEEP",
													)
												}>
												Keep
											</Button>
										</div>
									);
								})}
							</div>
						) : null}
						<div className="flex justify-end border-t border-slate-200 pt-3">
							<Button
								type="button"
								variant="outline"
								onClick={() => setSdkMergeSourceReview(null)}>
								Close
							</Button>
						</div>
					</div>
				) : null}
			</Modal>

			<Modal
				open={Boolean(sdkMergeCredentialPicker && selectedSdkMergeCredentialRow)}
				onOpenChange={(open) => {
					if (!open) setSdkMergeCredentialPicker(null);
				}}
				title={
					sdkMergeCredentialPicker
						? `${mergeFieldLabel(sdkMergeCredentialPicker.kind)} source`
						: "Credential source"
				}
				description="Choose which device should supply this credential."
				className="max-w-xl">
				{sdkMergeCredentialPicker && selectedSdkMergeCredentialRow ? (
					<div className="space-y-3">
						<div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
							<p className="text-sm font-semibold text-slate-950">
								{selectedSdkMergeCredentialRow.personLabel}
							</p>
							<p className="text-xs text-slate-600">
								ID {selectedSdkMergeCredentialRow.vendorUserId}
							</p>
						</div>
						<div className="space-y-2">
							{[...(selectedSdkMergeCredentialRow.user.records || [])]
								.sort(
									(left: any, right: any) =>
										mergeCredentialCount(right, sdkMergeCredentialPicker.kind) -
											mergeCredentialCount(left, sdkMergeCredentialPicker.kind) ||
										mergeRecordRichnessScore(right) - mergeRecordRichnessScore(left),
								)
								.map((record: any, index: number) => {
									const count = mergeCredentialCount(record, sdkMergeCredentialPicker.kind);
									const deviceName = mergeDeviceName(sdkMergePlanDevices, record.deviceId);
									const conflict = selectedSdkMergeCredentialRow.user.conflicts.find(
										(item) => item.field === sdkMergeCredentialPicker.kind,
									);
									const isChoiceSource =
										conflict?.deviceA.id === record.deviceId ||
										conflict?.deviceB.id === record.deviceId;
									const selectedChoice =
										sdkMergeState.choices[selectedSdkMergeCredentialRow.userKey]?.[
											sdkMergeCredentialPicker.kind
										] || sdkMergeState.applyAll;
									const selectedDeviceId =
										selectedChoice === "A"
											? conflict?.deviceA.id
											: selectedChoice === "B"
												? conflict?.deviceB.id
												: selectedChoice === "KEEP"
													? undefined
													: [...(selectedSdkMergeCredentialRow.user.records || [])].sort(
															(left: any, right: any) =>
																mergeCredentialCount(
																	right,
																	sdkMergeCredentialPicker.kind,
																) -
																	mergeCredentialCount(
																		left,
																		sdkMergeCredentialPicker.kind,
																	),
														)[0]?.deviceId;
									const isChosen = record.deviceId === selectedDeviceId;
									const chooseRecord = () => {
										if (conflict?.deviceA.id === record.deviceId) {
											setSdkMergeChoice(
												selectedSdkMergeCredentialRow.userKey,
												sdkMergeCredentialPicker.kind,
												"A",
											);
											setSdkMergeCredentialPicker(null);
										} else if (conflict?.deviceB.id === record.deviceId) {
											setSdkMergeChoice(
												selectedSdkMergeCredentialRow.userKey,
												sdkMergeCredentialPicker.kind,
												"B",
											);
											setSdkMergeCredentialPicker(null);
										}
									};
									return (
										<button
											type="button"
											key={`${selectedSdkMergeCredentialRow.id}:picker:${record.deviceId}`}
											onClick={chooseRecord}
											disabled={!isChoiceSource}
											className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-default ${
												isChosen
													? "border-orange-300 bg-orange-50"
													: isChoiceSource
														? "border-slate-200 bg-white hover:bg-slate-50"
														: "border-slate-200 bg-slate-50 text-slate-500"
											}`}>
											<span
												className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
													isChosen
														? "border-orange-500 bg-orange-500"
														: "border-slate-300 bg-white"
												}`}
												aria-hidden="true"
											/>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-medium text-slate-950">
													{deviceName}
												</p>
												<p className="text-xs text-slate-600">
													{index === 0
														? "Recommended source"
														: isChoiceSource
															? "Selectable source"
															: "Available for review"}
												</p>
											</div>
											<span className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-sm font-semibold text-slate-950">
												{mergeMetricValue(count)}
											</span>
										</button>
									);
								})}
						</div>
						<div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
							<Button
								type="button"
								variant="outline"
								onClick={() => setSdkMergeCredentialPicker(null)}>
								Close
							</Button>
						</div>
					</div>
				) : null}
			</Modal>

			<Modal
				open={isListenerDetailsOpen}
				onOpenChange={setIsListenerDetailsOpen}
				title="Hikvision listener"
				description="Quick health and recent listener activity."
				className="max-w-4xl">
				<div className="space-y-4">
					<div className={`rounded-2xl border p-4 md:p-5 ${hikvisionListenerToneClass}`}>
						<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<div className="flex min-w-0 gap-3">
								<div
									className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
										hikvisionSdkReceiving || hikvisionSdkArmed
											? "bg-emerald-100 text-emerald-700"
											: hikvisionListenerUnavailable
												? "bg-red-100 text-red-700"
												: "bg-amber-100 text-amber-700"
									}`}>
									{isLoadingHikvisionListenerStatus ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : hikvisionSdkReceiving ? (
										<Wifi className="h-4 w-4" />
									) : hikvisionListenerUnavailable ? (
										<AlertTriangle className="h-4 w-4" />
									) : (
										<WifiOff className="h-4 w-4" />
									)}
								</div>
								<div className="min-w-0 space-y-2">
									<div className="flex flex-wrap items-center gap-2">
										<p className="text-sm font-semibold text-slate-950">
											Listener
										</p>
										<Badge
											variant={
												hikvisionSdkReceiving || hikvisionSdkArmed
													? "success"
													: hikvisionListenerUnavailable
														? "destructive"
														: "warning"
											}
											className="max-w-full rounded-full px-2.5 py-1 uppercase tracking-[0.12em]">
											{hikvisionListenerTitle}
										</Badge>
									</div>
									<p className="text-sm text-slate-700">
										{hikvisionSdkReceiving
											? "Events are coming in."
											: hikvisionListenerUnavailable
												? "The VM listener status probe could not reach the server. The listener may still be running through the remote tunnel path."
												: hikvisionListenerRunning
													? "The service is up, but we have not seen a fresh device event yet."
													: "The VM listener is not running."}
									</p>
								</div>
							</div>
							<div className="flex shrink-0 flex-col gap-2 sm:flex-row">
								<Button
									type="button"
									variant="outline"
									className="h-10 min-w-[140px] justify-center border-current/15 bg-white/90 px-4"
									disabled={
										hikvisionListenerControl.isPending ||
										isLoadingHikvisionListenerStatus
									}
									onClick={() => void refetchHikvisionListenerStatus()}>
									<RefreshCw className="h-4 w-4" />
									Refresh
								</Button>
								<Button
									type="button"
									variant="outline"
									className="h-10 min-w-[140px] justify-center border-current/15 bg-white px-4"
									disabled={hikvisionListenerControl.isPending}
									onClick={() =>
										runSyncCenterListenerAction(
											hikvisionListenerRunning ? "restart" : "start",
										)
									}>
									{hikvisionListenerControl.isPending ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : hikvisionListenerRunning ? (
										<RefreshCw className="h-4 w-4" />
									) : (
										<Power className="h-4 w-4" />
									)}
									{hikvisionListenerRunning ? "Restart" : "Start"}
								</Button>
							</div>
						</div>

						<div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
							{[
								[
									"VM",
									hikvisionListenerUnavailable
										? "Status unreachable"
										: hikvisionListenerRunning
											? "Running"
											: "Stopped",
								],
								["Path", hikvisionListenerStatus?.vm?.path || "-"],
								[
									"Last event",
									formatSyncCenterTime(hikvisionListenerStatus?.sdk?.lastAlarmAt),
								],
								[
									"Last post",
									formatSyncCenterTime(hikvisionListenerStatus?.sdk?.lastPostAt),
								],
								[
									"Last sign-in",
									formatSyncCenterTime(hikvisionListenerStatus?.sdk?.lastLoginAt),
								],
								[
									"Checked",
									formatSyncCenterTime(hikvisionListenerStatus?.checkedAt),
								],
							].map(([label, value]) => (
								<div
									key={label}
									className="min-w-0 rounded-xl border border-current/10 bg-white/80 px-3 py-2.5">
									<p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-60">
										{label}
									</p>
									<p className="mt-1 break-words text-sm font-semibold leading-5 text-slate-950">
										{value}
									</p>
								</div>
							))}
						</div>

						{hikvisionListenerStatus?.sdk?.lastError ? (
							<p className="mt-3 rounded-xl border border-current/15 bg-white/80 px-3 py-2 text-sm break-words text-slate-900">
								{hikvisionListenerStatus.sdk.lastError}
							</p>
						) : null}
					</div>

					<details className="rounded-xl border border-slate-200 bg-white">
						<summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-900">
							<span>Recent log</span>
							<Badge
								variant="outline"
								className="rounded-full border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
								{hikvisionRecentLogs.length
									? `${hikvisionRecentLogs.length} lines`
									: "No log tail"}
							</Badge>
						</summary>
						<div className="border-t border-slate-200 bg-slate-950 p-3 text-slate-100">
							<div className="max-h-64 overflow-auto rounded-md bg-black/20 p-3">
								{hikvisionRecentLogs.length ? (
									<pre className="whitespace-pre-wrap break-all text-xs leading-5 text-slate-100">
										{hikvisionRecentLogs.join("\n")}
									</pre>
								) : (
									<p className="text-xs text-slate-300">
										{hikvisionListenerStatus?.logs?.error ||
											"No listener log lines returned by the VM status check."}
									</p>
								)}
							</div>
						</div>
					</details>
				</div>
			</Modal>

			<Modal
				open={Boolean(detailsDeviceUser)}
				onOpenChange={(open) => {
					if (!open) {
						setDetailsDeviceUser(null);
						// Drop deep-link param so closing details does not re-open.
						if (deviceUserDetailsParam) {
							setSearchParams((prev) => {
								const next = new URLSearchParams(prev);
								next.delete("deviceUserDetails");
								return next;
							}, { replace: true });
						}
					}
				}}
				title="Device user details"
				className="max-w-4xl">
				{detailsDeviceUser ? (
					<div className="space-y-4">
						<div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
							<div className="space-y-3">
								<div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
									<div className="aspect-[4/5] bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.16),_transparent_55%),linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)]">
										{detailsPhotoState === "ready" && detailsPhotoUrl ? (
											<img
												src={detailsPhotoUrl}
												alt={`${getDeviceUserDisplayName(detailsDeviceUser)} face`}
												className="h-full w-full object-cover"
											/>
										) : (
											<div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-slate-500">
												{detailsPhotoState === "loading" ? (
													<>
														<Loader2 className="h-6 w-6 animate-spin" />
														<p className="text-sm font-medium text-slate-700">
															Loading enrolled face photo
														</p>
													</>
												) : detailsPhotoState === "error" ? (
													<>
														<Eye className="h-6 w-6" />
														<p className="text-sm font-medium text-slate-700">
															Face photo unavailable
														</p>
														<p className="text-xs text-slate-500">
															{detailsPhotoError}
														</p>
													</>
												) : (
													<>
														<Eye className="h-6 w-6" />
														<p className="text-sm font-medium text-slate-700">
															No face photo enrolled
														</p>
														<p className="text-xs text-slate-500">
															This device user does not currently
															expose a saved face image.
														</p>
													</>
												)}
											</div>
										)}
									</div>
								</div>
								<div className="rounded-2xl border border-slate-200 bg-white p-3">
									<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
										Fingerprint truth
									</p>
									<div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
										<p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
											Fingerprints (count)
										</p>
										<p className="mt-2 text-3xl font-semibold text-slate-950">
											{String(
												getDeviceUserCredentialSummary(detailsDeviceUser)
													.fingerprintCount,
											)}
										</p>
										<p className="mt-2 text-xs text-slate-500">
											Device UserInfo / credential summary count.
										</p>
									</div>
									{(() => {
										const rawFp =
											(detailsDeviceUser as any)?.vendorMetadata
												?.rawFingerprints ||
											(detailsDeviceUser as any)?.rawPayload
												?._hrisDeviceMetadata?.rawFingerprints ||
											null;
										const templates = Array.isArray(rawFp?.templates)
											? rawFp.templates
											: [];
										const rawPresent =
											Boolean(rawFp?.present) ||
											templates.some(
												(t: any) => String(t?.data || "").trim().length > 8,
											);
										return (
											<div
												className={`mt-3 rounded-2xl border px-4 py-3 text-xs ${
													rawPresent
														? "border-emerald-200 bg-emerald-50 text-emerald-950"
														: "border-amber-200 bg-amber-50 text-amber-950"
												}`}>
												<p className="font-semibold uppercase tracking-wide">
													Raw fingerprint templates
												</p>
												<p className="mt-2 text-2xl font-semibold">
													{rawPresent
														? `${templates.length || Number(rawFp?.fingerprintCount || 0) || 0} stored`
														: "Not captured yet"}
												</p>
												<p className="mt-2 leading-5">
													{rawPresent
														? "Actual base64 fingerData blobs are stored on this DeviceUser (not AES-wrapped). Expand vendor metadata JSON below to view full data."
														: "Count may exist from UserInfo, but raw fingerData has not been pulled yet. Enroll FP or re-open after capture completes."}
												</p>
												{rawPresent && templates[0]?.data ? (
													<div className="mt-3 rounded-xl border border-emerald-200 bg-white/80 p-2">
														<p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
															Template 1 preview (first 120 chars)
														</p>
														<p className="mt-1 break-all font-mono text-[10px] leading-4 text-slate-800">
															{String(templates[0].data).slice(0, 120)}
															{String(templates[0].data).length > 120
																? "…"
																: ""}
														</p>
														<p className="mt-1 text-[10px] text-emerald-900">
															length={String(templates[0].data).length}{" "}
															chars · fingerPrintId=
															{String(
																templates[0].fingerPrintId ?? "?",
															)}
														</p>
													</div>
												) : null}
											</div>
										);
									})()}
									{getDeviceUserSyntheticCredentialSummary(detailsDeviceUser)
										.fingerprintCount > 0 ? (
										<div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
											<p className="font-semibold uppercase tracking-wide">
												Dev mock fingerprint tally
											</p>
											<p className="mt-2 text-2xl font-semibold">
												{String(
													getDeviceUserSyntheticCredentialSummary(
														detailsDeviceUser,
													).fingerprintCount,
												)}
											</p>
											<p className="mt-2 leading-5 text-amber-900">
												This is synthetic UI test state only. The physical
												device fingerprint truth above stays
												{` ${String(getDeviceUserCredentialSummary(detailsDeviceUser).fingerprintCount)}`}
												.
											</p>
											{getDeviceUserSyntheticCredentialSummary(
												detailsDeviceUser,
											).updatedAt ? (
												<p className="mt-2 text-[11px] text-amber-900">
													Updated{" "}
													{formatDateTime(
														getDeviceUserSyntheticCredentialSummary(
															detailsDeviceUser,
														).updatedAt || "",
													)}
												</p>
											) : null}
										</div>
									) : null}
									{getDeviceUserSyntheticCredentialSummary(detailsDeviceUser)
										.faceCount > 0 ? (
										<div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-950">
											<p className="font-semibold uppercase tracking-wide">
												Dev mock face tally
											</p>
											<p className="mt-2 text-2xl font-semibold">
												{String(
													getDeviceUserSyntheticCredentialSummary(
														detailsDeviceUser,
													).faceCount,
												)}
											</p>
											<p className="mt-2 leading-5 text-sky-900">
												This is synthetic UI test state only. The physical
												device face truth above stays
												{` ${String(getDeviceUserCredentialSummary(detailsDeviceUser).faceCount)}`}
												.
											</p>
										</div>
									) : null}
									<div className="mt-3 grid grid-cols-2 gap-2">
										{[
											[
												"Cards",
												getDeviceUserCredentialSummary(detailsDeviceUser)
													.cardCount,
											],
											[
												"Faces",
												getDeviceUserCredentialSummary(detailsDeviceUser)
													.faceCount,
											],
										].map(([label, value]) => (
											<div
												key={String(label)}
												className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
												<p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
													{label}
												</p>
												<p className="mt-1 text-lg font-semibold text-slate-950">
													{String(value)}
												</p>
											</div>
										))}
									</div>
									<p className="mt-3 text-xs leading-5 text-slate-500">
										Raw fingerData lives on DeviceUser.vendorMetadata.rawFingerprints
										(and rawPayload._hrisDeviceMetadata.rawFingerprints). DeviceEvent
										only keeps a pointer/status. Dev mock tallies stay separate from
										physical device truth.
									</p>
								</div>
							</div>
							<div className="space-y-3">
								<div className="rounded-2xl border border-slate-200 bg-white p-4">
									<p className="text-lg font-semibold text-slate-950">
										{getDeviceUserDisplayName(detailsDeviceUser)}
									</p>
									<p className="mt-1 text-sm text-slate-500">
										Vendor user ID {detailsDeviceUser.vendorUserId}
									</p>
								</div>
								<div className="grid gap-x-4 gap-y-2 text-sm md:grid-cols-2">
									{[
										["Vendor user ID", detailsDeviceUser.vendorUserId],
										[
											"Device",
											detailsDeviceUser.hrisDeviceUser?.device?.name ||
												selectedDevice?.name ||
												"-",
										],
										["Source", getDeviceUserSourceLabel(detailsDeviceUser)],
										["Status", detailsDeviceUser.status],
										[
											"Employee link",
											detailsDeviceUser.employee?.employeeId || "Not linked",
										],
										[
											"Last synced",
											detailsDeviceUser.lastSyncedAt
												? formatDateTime(detailsDeviceUser.lastSyncedAt)
												: "-",
										],
									].map(([label, value]) => (
										<div
											key={label}
											className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2">
											<span className="text-xs font-medium text-slate-500">
												{label}
											</span>
											<span className="min-w-0 truncate font-semibold text-slate-950">
												{value}
											</span>
										</div>
									))}
								</div>
								<div className="rounded-md border border-slate-200 bg-white p-3">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="text-sm font-semibold text-slate-950">
												Vendor metadata
											</p>
											<p className="mt-1 line-clamp-2 break-all text-xs text-slate-600">
												{formatMetadataPreview(
													getDeviceUserVendorMetadata(detailsDeviceUser),
												)}
											</p>
										</div>
										<div className="h-7 w-7 shrink-0">
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger asChild>
														<button
															type="button"
															className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
															aria-label="Preview vendor metadata">
															<HelpCircle className="h-4 w-4" />
														</button>
													</TooltipTrigger>
													<TooltipContent
														side="left"
														className="max-w-[420px] whitespace-pre-wrap break-all text-xs leading-5 text-slate-700">
														{formatMetadataPreview(
															getDeviceUserVendorMetadata(
																detailsDeviceUser,
															),
															900,
														)}
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</div>
									</div>
								</div>
								<div className="rounded-2xl border border-slate-200 bg-white p-4">
									<div className="flex items-center justify-between gap-3">
										<div>
											<p className="text-sm font-semibold text-slate-950">
												Across Hikvision devices
											</p>
											<p className="mt-1 text-xs text-slate-500">
												Best saved tally for this user across configured
												Hikvision devices.
											</p>
										</div>
										<Badge variant="secondary">
											{detailsPeerTallyRows.length ||
												hikvisionDeviceOptions.length}{" "}
											devices
										</Badge>
									</div>
									{detailsPeerTallyState === "loading" ? (
										<div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
											<Loader2 className="h-4 w-4 animate-spin" />
											Comparing device-user tallies...
										</div>
									) : detailsPeerTallyState === "error" ? (
										<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
											{detailsPeerTallyError ||
												"Comparison is not available right now."}
										</div>
									) : (
										<div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
											<div className="grid grid-cols-[minmax(150px,1.4fr)_92px_72px_72px_72px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
												<span>Device</span>
												<span>Status</span>
												<span>FP</span>
												<span>Card</span>
												<span>Face</span>
											</div>
											{detailsPeerTallyRows.map((row) => (
												<div
													key={row.deviceId}
													className={`grid grid-cols-[minmax(150px,1.4fr)_92px_72px_72px_72px] gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 ${
														row.isCurrentDevice
															? "bg-orange-50/50"
															: "bg-white"
													}`}>
													<div className="min-w-0">
														<p className="truncate font-medium text-slate-950">
															{row.deviceName}
															{row.isCurrentDevice
																? " (selected)"
																: ""}
														</p>
														<p className="truncate text-xs text-slate-500">
															{row.address}
														</p>
													</div>
													<div className="text-xs text-slate-700">
														<p className="font-semibold text-slate-950">
															{row.found ? row.status : "Missing"}
														</p>
														<p className="truncate text-slate-500">
															{row.employeeLabel}
														</p>
													</div>
													<div className="font-semibold text-slate-950">
														{row.fingerprintCount}
													</div>
													<div className="font-semibold text-slate-950">
														{row.cardCount}
													</div>
													<div className="font-semibold text-slate-950">
														{row.faceCount}
													</div>
												</div>
											))}
										</div>
									)}
								</div>
								{getDeviceUserFaceUrl(detailsDeviceUser) ? (
									<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
										<p className="font-medium text-slate-800">Photo source</p>
										<p className="mt-1 break-all">
											{getDeviceUserFaceUrl(detailsDeviceUser)}
										</p>
									</div>
								) : null}
							</div>
						</div>
						<details className="rounded-md border border-slate-200">
							<summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
								Vendor metadata JSON
							</summary>
							<pre className="max-h-[260px] overflow-auto border-t border-slate-200 bg-slate-950 p-3 text-xs text-slate-100">
								{JSON.stringify(
									getDeviceUserVendorMetadata(detailsDeviceUser) || {},
									null,
									2,
								)}
							</pre>
						</details>
						<details className="rounded-md border border-slate-200">
							<summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
								Raw source payload
							</summary>
							<pre className="max-h-[260px] overflow-auto border-t border-slate-200 bg-slate-950 p-3 text-xs text-slate-100">
								{JSON.stringify(detailsDeviceUser.rawPayload || {}, null, 2)}
							</pre>
						</details>
					</div>
				) : null}
			</Modal>

			<Modal
				open={deviceUserExportState.open}
				onOpenChange={(open) =>
					setDeviceUserExportState((current) => ({ ...current, open }))
				}
				title="Export device users"
				description="Preview the selected Hikvision device before creating a CSV, Excel, or re-importable package export. This does not change the device.">
				<div className="space-y-4">
					<div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div className="min-w-0">
								<p className="truncate font-semibold text-slate-950">
									{selectedDevice?.name || "Selected device"}
								</p>
								<p className="mt-1 text-xs text-slate-600">
									CSV and Excel use two biometric template columns with compact
									encrypted values or clear empty states. The passphrase is entered
									separately. Plaintext biometric bytes are never written to
									spreadsheet cells.
								</p>
							</div>
							<Badge variant="secondary" className="self-start">
								{deviceUserExportScopeLabel}: {deviceUserExportScopeCountLabel}
							</Badge>
						</div>
					</div>
					<div className="grid gap-2 sm:grid-cols-4">
						{[
							[
								"currentPage",
								"Current page",
								deviceUserExportCountLabel(pagedExportVendorUserIds.length),
							],
							["filtered", "Current filter", deviceUserExportCountLabel(shownDeviceUserCount)],
							[
								"selectedRows",
								"Selected rows",
								`${selectedExportVendorUserIds.length} rows`,
							],
							["all", "All device users", deviceUserExportCountLabel(mergedDeviceUserRows.length)],
						].map(([value, label, hint]) => (
							<button
								key={value}
								type="button"
								className={`rounded-md border px-3 py-2 text-left transition-colors ${
									deviceUserExportState.selection === value
										? "border-orange-300 bg-orange-50 text-orange-950"
										: "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
								}`}
								onClick={() =>
									setDeviceUserExportState((current) => ({
										...current,
										selection: value as DeviceUserExportSelection,
										preview: null,
										result: null,
									}))
								}>
								<span className="block text-sm font-semibold">{label}</span>
								<span
									className={`mt-0.5 block text-xs ${
										deviceUserExportState.selection === value
											? "text-orange-800"
											: "text-slate-500"
									}`}>
									{hint}
								</span>
							</button>
						))}
					</div>
					<div className="grid gap-2 sm:grid-cols-3">
						{[
							["csv", "CSV", "Spreadsheet custody rows"],
							["excel", "Excel", "Native Excel .xlsx workbook"],
							["json", "Package JSON", "Re-importable sync package"],
						].map(([value, label, hint]) => (
							<button
								key={value}
								type="button"
								className={`rounded-md border px-3 py-2 text-left transition-colors ${
									deviceUserExportState.format === value
										? "border-orange-300 bg-orange-50 text-orange-950"
										: "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
								}`}
								onClick={() =>
									setDeviceUserExportState((current) => ({
										...current,
										format: value as DeviceUserExportFormat,
										result: null,
									}))
								}>
								<span className="flex items-center gap-2 text-sm font-semibold">
									{value === "json" ? (
										<FileJson className="h-4 w-4" />
									) : (
										<FileSpreadsheet className="h-4 w-4" />
									)}
									{label}
								</span>
								<span
									className={`mt-0.5 block text-xs ${
										deviceUserExportState.format === value
											? "text-orange-800"
											: "text-slate-500"
									}`}>
									{hint}
								</span>
							</button>
						))}
					</div>
					<div className="rounded-md border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-950">
						<p className="font-semibold">Biometric handling</p>
						<p className="mt-1 text-cyan-900">
							Use SDK peer copy when both devices are reachable. Use an encrypted
							bundle only for portable template payloads; its passphrase encrypts the
							download and must be entered again at import. It is never stored.
						</p>
						<p className="mt-2 font-mono text-[11px] text-cyan-950">
							Spreadsheet template columns: fingerprintTemplate and faceTemplate.
							They contain encrypted:v2 compact values when templates are available,
							or not_enrolled / missing_encrypted_template when they are not.
						</p>
					</div>
					<div className="grid gap-2 text-sm sm:grid-cols-3">
						{[
							["includeCards", "Cards"],
							["includeFingerprints", "Fingerprints"],
							["includeFaces", "Faces"],
							["encryptedBiometricBundle", "Encrypted bundle contract"],
							["refreshBiometricBundle", "Capture missing templates"],
						].map(([key, label]) => (
							<label
								key={key}
								className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
								<input
									type="checkbox"
									className="h-4 w-4 rounded border-slate-300"
									checked={Boolean((deviceUserExportState as any)[key])}
									onChange={(event) =>
										setDeviceUserExportState((current) => ({
											...current,
											[key]: event.target.checked,
											preview: null,
											result: null,
										}))
									}
								/>
								<span>{label}</span>
							</label>
						))}
					</div>
					{deviceUserExportState.encryptedBiometricBundle ? (
						<label className="block space-y-1 text-sm">
							<span className="font-medium text-slate-800">Package passphrase</span>
							<input
								type="password"
								value={deviceUserExportState.biometricBundlePassphrase}
								onChange={(event) =>
									setDeviceUserExportState((current) => ({
										...current,
										biometricBundlePassphrase: event.target.value,
										result: null,
									}))
								}
								placeholder="Required for portable biometric export"
								className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200"
							/>
						</label>
					) : null}
					{deviceUserExportState.preview ? (
						<div className="space-y-2">
						<div className="grid gap-2 sm:grid-cols-4">
							{[
								["Users", deviceUserExportState.preview.summary.totalUsers],
								["Linked", deviceUserExportState.preview.summary.linked],
								["Unlinked", deviceUserExportState.preview.summary.unlinked],
								["Devices", deviceUserExportState.preview.summary.devices],
							].map(([label, value]) => (
								<div
									key={String(label)}
									className="rounded-md border border-slate-200 bg-white px-3 py-2">
									<p className="text-xs font-medium text-slate-600">{label}</p>
									<p className="text-lg font-semibold text-slate-950">
										{metricValue(value)}
									</p>
								</div>
							))}
						</div>
							<div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
								<p className="font-semibold text-slate-950">Encrypted biometric readiness</p>
								<p className="mt-1">
									Fingerprints: {deviceUserExportState.preview.summary.biometrics?.fingerprintEnvelopesCaptured || 0} of {deviceUserExportState.preview.summary.biometrics?.fingerprintCountReported || 0} encrypted envelopes. Faces: {deviceUserExportState.preview.summary.biometrics?.faceEnvelopesCaptured || 0} of {deviceUserExportState.preview.summary.biometrics?.faceCountReported || 0} encrypted envelopes.
								</p>
							</div>
						</div>
					) : null}
					{deviceUserExportState.preview?.devices?.[0]?.capabilities ? (
						<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
							<p className="font-semibold">Credential custody</p>
							<p className="mt-1 text-amber-900">
								Fingerprint encrypted envelopes: {deviceUserExportState.preview.summary.biometrics?.fingerprintEnvelopesCaptured || 0} of {deviceUserExportState.preview.summary.biometrics?.fingerprintCountReported || 0} reported users.
							</p>
							<p className="mt-1 text-amber-900">
								Face encrypted envelopes: {deviceUserExportState.preview.summary.biometrics?.faceEnvelopesCaptured || 0} of {deviceUserExportState.preview.summary.biometrics?.faceCountReported || 0} reported users.
							</p>
							<p className="mt-1 text-amber-900">
								Bundle status:{" "}
								{deviceUserExportState.preview.biometricBundle?.status ||
									"not requested"}
							</p>
						</div>
					) : null}
					{deviceUserExportState.result ? (
						<div
							className={`rounded-md border px-3 py-2 text-sm ${
								deviceUserExportState.result.biometricBundle?.errors?.length
									? "border-amber-200 bg-amber-50 text-amber-950"
									: "border-emerald-200 bg-emerald-50 text-emerald-950"
							}`}>
							{deviceUserExportState.result.biometricBundle?.errors?.length ? (
								<p className="font-semibold">
									Partial export: {deviceUserExportState.result.biometricBundle.errors.length} requested biometric payloads are missing.
								</p>
							) : null}
							{deviceUserExportState.format === "json"
								? "Package JSON created for import preview or execute."
								: `${deviceUserExportState.format === "csv" ? "CSV" : "Excel"} export created for audit/review.`}{" "}
							No device mutation was performed.
						</div>
					) : null}
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={previewDeviceUserExportMutation.isPending || isLoadingDeviceUserExportRows}
							onClick={() => void previewDeviceUserExport()}>
							{previewDeviceUserExportMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Eye className="h-4 w-4" />
							)}
							Preview
						</Button>
						<Button
							type="button"
							disabled={
								exportDeviceUsersMutation.isPending ||
								previewDeviceUserExportMutation.isPending ||
								startDeviceUserSyncJobMutation.isPending ||
								isLoadingDeviceUserExportRows
							}
							onClick={() => void exportDeviceUserFile()}>
							{exportDeviceUsersMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Download className="h-4 w-4" />
							)}
							Export{" "}
							{deviceUserExportState.format === "json"
								? "Package"
								: deviceUserExportState.format === "excel"
									? "Excel"
									: "CSV"}
						</Button>
					</div>
				</div>
			</Modal>

			<Modal
				open={deviceUserImportState.open}
				onOpenChange={(open) =>
					setDeviceUserImportState((current) => ({ ...current, open }))
				}
				title="Import device users"
				description="Import a CSV or package export to a selected target device. Preview is non-mutating; execute is disabled until confirmation.">
				<div className="space-y-4">
					<div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
						<p className="font-semibold text-slate-950">
							Target: {selectedDevice?.name || "Select device"}
						</p>
						<p className="mt-1 text-xs text-slate-600">
							Use the CSV export from another Hikvision device to compare users and
							preview encrypted biometric templates without writing to the device.
							The passphrase is entered separately for validation.
						</p>
					</div>
					<div className="grid gap-2 sm:grid-cols-2">
						{[
							["csv", "CSV", "Two template columns"],
							["json", "Package JSON", "Advanced encrypted bundle import"],
						].map(([value, label, description]) => (
							<button
								key={value}
								type="button"
								onClick={() =>
									setDeviceUserImportState((current) => ({
										...current,
										format: value as DeviceUserImportFormat,
										rawText: "",
										fileName: "",
										payload: null,
										parseError: "",
										preview: null,
										result: null,
									}))
								}
								className={`flex min-w-0 items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${
									deviceUserImportState.format === value
										? "border-orange-300 bg-orange-50 text-orange-950"
										: "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
								}`}>
								{value === "csv" ? (
									<FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0" />
								) : (
									<FileJson className="mt-0.5 h-4 w-4 shrink-0" />
								)}
								<span className="min-w-0">
									<span className="block font-semibold">{label}</span>
									<span className="block text-xs opacity-80">{description}</span>
								</span>
							</button>
						))}
					</div>
					<div className="grid gap-2 sm:grid-cols-[1fr_auto]">
						<label className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
							<span className="block font-medium text-slate-800">
								{deviceUserImportState.format === "csv"
									? "Import CSV file"
									: "Import package JSON file"}
							</span>
							<input
								type="file"
								accept={
									deviceUserImportState.format === "csv"
										? "text/csv,.csv"
										: "application/json,.json"
								}
								className="mt-2 block w-full text-xs text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (!file) return;
									void file.text().then((text) =>
										setDeviceUserImportState((current) => ({
											...current,
											rawText: text,
											fileName: file.name,
											payload: null,
											parseError: "",
											preview: null,
											result: null,
										})),
									);
								}}
							/>
						</label>
						<div className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
							<p className="font-semibold">Preview first</p>
							<p className="text-emerald-900">
								No target device write happens until confirmation and execute.
							</p>
							<Button
								type="button"
								variant="outline"
								className="h-8 border-emerald-200 bg-white px-2 text-xs text-emerald-950 hover:bg-emerald-100"
								onClick={() => {
									const blob = new Blob([`\uFEFF${buildDeviceUserCsvTemplate()}`], {
										type: "text/csv;charset=utf-8",
									});
									const url = URL.createObjectURL(blob);
									const link = document.createElement("a");
									link.href = url;
									link.download = "device-users-import-template.csv";
									document.body.appendChild(link);
									link.click();
									link.remove();
									URL.revokeObjectURL(url);
								}}>
								<Download className="h-3.5 w-3.5" />
								CSV template
							</Button>
						</div>
					</div>
					{deviceUserImportState.format === "json" ? (
						<textarea
							value={deviceUserImportState.rawText}
							onChange={(event) =>
								setDeviceUserImportState((current) => ({
									...current,
									rawText: event.target.value,
									payload: null,
									parseError: "",
									preview: null,
									result: null,
								}))
							}
							className="min-h-[140px] w-full rounded-md border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200"
							placeholder="{ ... encrypted package export ... }"
						/>
					) : deviceUserImportState.fileName ? (
						<div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
							<span className="font-medium">Loaded CSV:</span>{" "}
							<span className="break-all">{deviceUserImportState.fileName}</span>
						</div>
					) : null}
					{deviceUserImportState.parseError ? (
						<div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950">
							{deviceUserImportState.parseError}
						</div>
					) : null}
					{deviceUserImportState.preview ? (
						<div className="space-y-3">
							<div className="grid gap-2 sm:grid-cols-4">
								{[
									["New", deviceUserImportState.preview.counts.newUsers],
									["Matches", deviceUserImportState.preview.counts.matchingUsers],
									["Conflicts", deviceUserImportState.preview.counts.conflicts],
									[
										"Missing HRIS",
										deviceUserImportState.preview.counts.missingHrisEmployees,
									],
								].map(([label, value]) => (
									<div
										key={String(label)}
										className="rounded-md border border-slate-200 bg-white px-3 py-2">
										<p className="text-xs font-medium text-slate-600">
											{label}
										</p>
										<p className="text-lg font-semibold text-slate-950">
											{metricValue(value)}
										</p>
									</div>
								))}
							</div>
							<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
								<p className="font-semibold">Transfer proof</p>
								<p className="mt-1 text-amber-900">
									{deviceUserImportState.preview.executeBlockedReason ||
										"Execute is available after typed confirmation. SDK peer copy transfers templates device-to-device without exposing raw bytes."}
								</p>
								<p className="mt-1 text-amber-900">
									Bundle:{" "}
									{deviceUserImportState.preview.biometricBundle?.present
										? "encrypted bundle present"
										: "no encrypted bundle in JSON package"}
									{" / "}
									{deviceUserImportState.preview.biometricBundle?.transferModes?.join(
										", ",
									) || "metadataOnly"}
								</p>
							</div>
							<div className="max-h-[220px] overflow-auto rounded-md border border-slate-200">
								<table className="min-w-full divide-y divide-slate-200 text-xs">
									<thead className="bg-slate-50 text-left font-semibold text-slate-600">
										<tr>
											<th className="px-3 py-2">User</th>
											<th className="px-3 py-2">Action</th>
											<th className="px-3 py-2">Source</th>
											<th className="px-3 py-2">Transfer</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100 bg-white">
										{deviceUserImportState.preview.plan
											.slice(0, 12)
											.map((row) => (
												<tr
													key={`${row.sourceDeviceId || "file"}:${row.vendorUserId}`}>
													<td className="px-3 py-2 font-medium text-slate-950">
														{row.vendorUserId}
													</td>
													<td className="px-3 py-2 text-slate-700">
														{row.action}
													</td>
													<td className="px-3 py-2 text-slate-700">
														{row.sourceDeviceName || "-"}
													</td>
													<td className="px-3 py-2 text-slate-700">
														{row.transferMode || "metadataOnly"}
													</td>
												</tr>
											))}
									</tbody>
								</table>
							</div>
						</div>
					) : null}
					{deviceUserImportState.preview ? (
						<div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
							<label className="space-y-1 text-sm">
								<span className="font-medium text-slate-800">Transfer mode</span>
								<select
									value={deviceUserImportState.biometricTransferMode}
									onChange={(event) =>
										setDeviceUserImportState((current) => ({
											...current,
											biometricTransferMode: event.target.value as
												| "sdkPeerCopy"
												| "metadataOnly"
												| "encryptedBundle",
										}))
									}
									className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200">
									<option value="sdkPeerCopy">SDK peer copy</option>
									<option value="encryptedBundle">Encrypted bundle</option>
									<option value="metadataOnly">Metadata only</option>
								</select>
							</label>
							<label className="space-y-1 text-sm">
								<span className="font-medium text-slate-800">
									Encrypted bundle passphrase
								</span>
								<input
									type="password"
									value={deviceUserImportState.biometricBundlePassphrase}
									onChange={(event) =>
										setDeviceUserImportState((current) => ({
											...current,
											biometricBundlePassphrase: event.target.value,
										}))
									}
									placeholder="Only needed for encrypted bundles"
									className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200"
								/>
							</label>
							<label className="space-y-1 text-sm sm:col-span-2">
								<span className="font-medium text-slate-800">
									Type IMPORT DEVICE USERS
								</span>
								<input
									value={deviceUserImportState.confirmation}
									onChange={(event) =>
										setDeviceUserImportState((current) => ({
											...current,
											confirmation: event.target.value,
										}))
									}
									className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200"
								/>
							</label>
							<label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm sm:col-span-2">
								<input
									type="checkbox"
									checked={deviceUserImportState.runAsJob}
									aria-label="Run import execute as background job"
									onChange={(event) =>
										setDeviceUserImportState((current) => ({
											...current,
											runAsJob: event.target.checked,
										}))
									}
									className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
								/>
								<span className="min-w-0">
									<span className="block font-medium text-slate-800">
										Run execute as background job
									</span>
									<span className="block text-xs text-slate-600">
										Recommended for biometric peer copy batches; preview and typed
										confirmation are still required.
									</span>
								</span>
							</label>
						</div>
					) : null}
					{deviceUserImportState.result ? (
						<div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
							{deviceUserImportState.result.mode === "job" ? (
								<>
									<p className="font-semibold">
										Import job queued: {deviceUserImportState.result.jobId}
									</p>
									<p className="mt-1 break-all text-xs text-emerald-900">
										Poll: {deviceUserImportState.result.pollUrl}
									</p>
								</>
							) : (
								<>
									<p className="font-semibold">
										Imported{" "}
										{metricValue(deviceUserImportState.result.counts?.imported)}{" "}
										of {metricValue(deviceUserImportState.result.counts?.planned)}{" "}
										planned rows
									</p>
									<p className="mt-1 break-all text-xs text-emerald-900">
										Backup: {deviceUserImportState.result.backupDir}
									</p>
								</>
							)}
							<p className="mt-1 text-xs text-emerald-900">
								Plain biometric exposed:{" "}
								{String(deviceUserImportState.result.plaintextBiometricExposed)}
							</p>
						</div>
					) : null}
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={previewDeviceUserImportMutation.isPending}
							onClick={() => void previewDeviceUserImport()}>
							{previewDeviceUserImportMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Eye className="h-4 w-4" />
							)}
							Preview import
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={
								!deviceUserImportState.preview?.previewToken ||
								deviceUserImportState.confirmation !== "IMPORT DEVICE USERS" ||
								executeDeviceUserImportMutation.isPending
							}
							className="border-orange-200 bg-orange-50 text-orange-950 hover:bg-orange-100"
							title="Requires preview token and typed confirmation"
							onClick={() => void executeDeviceUserImport()}>
							{executeDeviceUserImportMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Lock className="h-4 w-4" />
							)}
							Execute
						</Button>
					</div>
				</div>
			</Modal>

			<Modal
				open={Boolean(linkTarget)}
				onOpenChange={(open) => {
					if (!open) {
						setLinkTarget(null);
						setSelectedEmployeeForLink("");
					}
				}}
				title="Link device user"
				description="Manual links override automatic matching for this device user.">
				<div className="space-y-4">
					{linkTarget ? (
						<div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
							<div className="min-w-0">
								<p className="truncate font-medium text-slate-950">
									{linkTarget.displayName || "Unnamed device user"}
								</p>
								<p className="truncate text-slate-600">
									Vendor user ID {linkTarget.vendorUserId}
								</p>
							</div>
							{!linkTarget.hrisDeviceUser ? (
								<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
									This user was read from the device. Submitting will save current
									device users first, then link the employee.
								</div>
							) : null}
						</div>
					) : null}
					<div>
						<div className="text-sm font-medium text-slate-700">Employee</div>
						<SearchableSelect
							options={employeeLinkOptions}
							value={selectedEmployeeForLink}
							onValueChange={setSelectedEmployeeForLink}
							placeholder={
								isLoadingEmployeeLinkOptions
									? "Loading employees..."
									: "Select employee"
							}
							searchPlaceholder="Search employee name, ID, device ID..."
							emptyText={
								employeeLinkOptionsError
									? "Employees could not be loaded."
									: "No employees found."
							}
							disabled={
								isLoadingEmployeeLinkOptions || Boolean(employeeLinkOptionsError)
							}
						/>
					</div>
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								setLinkTarget(null);
								setSelectedEmployeeForLink("");
							}}>
							Cancel
						</Button>
						<Button
							type="button"
							disabled={
								!selectedEmployeeForLink ||
								linkDeviceUserMutation.isPending ||
								syncDeviceUsersMutation.isPending
							}
							onClick={submitLinkDeviceUser}>
							{linkDeviceUserMutation.isPending ||
							syncDeviceUsersMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Link2 className="h-4 w-4" />
							)}
							{linkTarget?.hrisDeviceUser ? "Link device user" : "Save and link"}
						</Button>
					</div>
				</div>
			</Modal>

			<Modal
				open={copyDeviceUserState.open}
				onOpenChange={(open) => {
					if (!open && !isCopyDeviceUserSubmitting) {
						setCopyDeviceUserStatusMessage("");
						setCopyDeviceUserState({
							open: false,
							sourceDeviceUser: null,
							targetDeviceId: "",
							applyToAllPeers: false,
							includeFingerprints: true,
							includeFaceRecognition: true,
							successfulTargets: [],
							failedTargets: [],
						});
					}
				}}
				title="Copy device user to peer"
				description="Copy this Hikvision user to one peer or every peer. If a device is offline, it stays here for retry."
				className="max-w-lg"
				showCloseButton={!isCopyDeviceUserSubmitting}
				closeOnBackdropClick={!isCopyDeviceUserSubmitting}>
				<div className="space-y-4">
					{copyDeviceUserStatusMessage ? (
						<div
							className={`rounded-md border px-3 py-3 text-sm ${
								isCopyDeviceUserSubmitting
									? "border-blue-200 bg-blue-50 text-blue-950"
									: copyDeviceUserState.failedTargets.length
										? "border-amber-200 bg-amber-50 text-amber-950"
										: copyDeviceUserState.successfulTargets.length
											? "border-emerald-200 bg-emerald-50 text-emerald-950"
											: "border-slate-200 bg-slate-50 text-slate-800"
							}`}>
							<div className="flex items-start gap-2">
								{isCopyDeviceUserSubmitting ? (
									<Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
								) : copyDeviceUserState.failedTargets.length ? (
									<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
								) : (
									<Link2 className="mt-0.5 h-4 w-4 shrink-0" />
								)}
								<p className="min-w-0 leading-5">{copyDeviceUserStatusMessage}</p>
							</div>
						</div>
					) : null}
					{copyDeviceUserState.successfulTargets.length ? (
						<div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
							<p className="font-semibold">Copied to peer devices</p>
							<p className="mt-1 text-xs text-emerald-800">
								These copies were accepted and kept. Failed devices below can be
								retried separately.
							</p>
							<ul className="mt-2 space-y-1 text-xs text-emerald-900">
								{copyDeviceUserState.successfulTargets.map((target) => (
									<li key={target.id}>
										<span className="font-semibold">{target.label}:</span>{" "}
										Copied
									</li>
								))}
							</ul>
						</div>
					) : null}
					{copyDeviceUserState.failedTargets.length ? (
						<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
							<p className="font-semibold">Some peer devices still need attention</p>
							<p className="mt-1 text-xs text-amber-800">
								Successful copies are kept. Retry only the devices below after they
								come back online.
							</p>
							<ul className="mt-2 space-y-1 text-xs text-amber-900">
								{copyDeviceUserState.failedTargets.map((target) => (
									<li key={target.id}>
										<span className="font-semibold">{target.label}:</span>{" "}
										{target.error}
									</li>
								))}
							</ul>
						</div>
					) : null}
					{copyDeviceUserState.sourceDeviceUser ? (
						<div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
							<p className="font-semibold text-slate-950">
								{copyDeviceUserState.sourceDeviceUser.displayName ||
									copyDeviceUserState.sourceDeviceUser.vendorUserId}
							</p>
							<div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
								<div>
									<span className="block text-slate-500">Source device</span>
									<span className="font-semibold text-slate-950">
										{selectedDevice?.name || "-"}
									</span>
								</div>
								<div>
									<span className="block text-slate-500">Vendor user ID</span>
									<span className="font-semibold text-slate-950">
										{copyDeviceUserState.sourceDeviceUser.vendorUserId}
									</span>
								</div>
							</div>
						</div>
					) : null}
					<div className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
						<input
							type="checkbox"
							className="mt-1 h-4 w-4 rounded border-slate-300"
							checked={copyDeviceUserState.applyToAllPeers}
							onChange={(event) =>
								setCopyDeviceUserState((current) => ({
									...current,
									applyToAllPeers: event.target.checked,
									targetDeviceId: event.target.checked
										? ""
										: copyTargetDeviceOptions[0]?.value || "",
								}))
							}
							disabled={isCopyDeviceUserSubmitting || !copyTargetDeviceOptions.length}
						/>
						<span>
							<span className="block font-medium text-slate-950">
								Copy to all peer devices
							</span>
							<span className="block text-xs text-slate-500">
								Use this when one selected source device should become the baseline
								for every other Hikvision device.
							</span>
						</span>
					</div>
					{copyDeviceUserState.applyToAllPeers ? (
						<div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
							<div className="font-medium text-slate-950">Target scope</div>
							<p className="mt-1 text-xs text-slate-500">
								{copyTargetDeviceOptions.length
									? `${copyTargetDeviceOptions.length} Hikvision peer devices will receive this user.`
									: "No Hikvision peer devices are available."}
							</p>
						</div>
					) : (
						<div className="space-y-2">
							<div className="text-sm font-medium text-slate-700">Target device</div>
							<Select
								options={copyTargetDeviceOptions}
								value={copyDeviceUserState.targetDeviceId}
								onChange={(value) =>
									setCopyDeviceUserState((current) => ({
										...current,
										targetDeviceId: value,
									}))
								}
								placeholder="Select target device"
								disabled={!copyTargetDeviceOptions.length}
							/>
						</div>
					)}
					<div className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
						<input
							type="checkbox"
							className="mt-1 h-4 w-4 rounded border-slate-300"
							checked={copyDeviceUserState.includeFingerprints}
							onChange={(event) =>
								setCopyDeviceUserState((current) => ({
									...current,
									includeFingerprints: event.target.checked,
								}))
							}
							disabled={isCopyDeviceUserSubmitting}
						/>
						<span>
							<span className="block font-medium text-slate-950">
								Include fingerprints
							</span>
							<span className="block text-xs text-slate-500">
								Keep this on for the normal journey so the peer receives the same
								biometric user state when templates are available.
							</span>
						</span>
					</div>
					<div className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
						<input
							type="checkbox"
							className="mt-1 h-4 w-4 rounded border-slate-300"
							checked={copyDeviceUserState.includeFaceRecognition}
							onChange={(event) =>
								setCopyDeviceUserState((current) => ({
									...current,
									includeFaceRecognition: event.target.checked,
								}))
							}
							disabled={isCopyDeviceUserSubmitting}
						/>
						<span>
							<span className="block font-medium text-slate-950">
								Include face recognition
							</span>
							<span className="block text-xs text-slate-500">
								Copy the enrolled face when the source device exposes a usable face
								template.
							</span>
						</span>
					</div>
					<div className="flex justify-end gap-2 border-t pt-3">
						<Button
							type="button"
							variant="outline"
							disabled={isCopyDeviceUserSubmitting}
							onClick={() => {
								setCopyDeviceUserStatusMessage("");
								setCopyDeviceUserState({
									open: false,
									sourceDeviceUser: null,
									targetDeviceId: "",
									applyToAllPeers: false,
									includeFingerprints: true,
									includeFaceRecognition: true,
									successfulTargets: [],
									failedTargets: [],
								});
							}}>
							Cancel
						</Button>
						<Button
							type="button"
							disabled={
								isCopyDeviceUserSubmitting ||
								(!copyDeviceUserState.applyToAllPeers &&
									!copyDeviceUserState.targetDeviceId) ||
								!copyDeviceUserState.sourceDeviceUser?.vendorUserId
							}
							onClick={submitCopyDeviceUser}>
							{isCopyDeviceUserSubmitting ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<RefreshCw className="h-4 w-4" />
							)}
							{isCopyDeviceUserSubmitting
								? "Copying..."
								: copyDeviceUserState.failedTargets.length
									? "Retry failed devices"
									: copyDeviceUserState.applyToAllPeers
										? "Copy to all peers"
										: "Copy to peer"}
						</Button>
					</div>
				</div>
			</Modal>

			<Modal
				open={Boolean(unlinkTarget)}
				onOpenChange={(open) => {
					if (!open && !unlinkDeviceUserMutation.isPending) {
						setUnlinkTarget(null);
					}
				}}
				title="Unlink employee"
				description="This keeps the device user record, but removes its employee match."
				className="max-w-lg"
				showCloseButton={!unlinkDeviceUserMutation.isPending}
				closeOnBackdropClick={!unlinkDeviceUserMutation.isPending}>
				<div className="space-y-4">
					{unlinkTarget ? (
						<div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-950">
							<p className="font-semibold">
								Confirm this device user should be unlinked.
							</p>
							<div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
								<div>
									<span className="block text-red-700">Device user</span>
									<span className="font-semibold">
										{unlinkTarget.displayName || unlinkTarget.vendorUserId}
									</span>
								</div>
								<div>
									<span className="block text-red-700">Employee</span>
									<span className="font-semibold">
										{unlinkTarget.employee?.fullName ||
											unlinkTarget.employee?.employeeId ||
											"Linked employee"}
									</span>
								</div>
								<div>
									<span className="block text-red-700">Vendor user ID</span>
									<span className="font-semibold">
										{unlinkTarget.vendorUserId}
									</span>
								</div>
								<div>
									<span className="block text-red-700">Device</span>
									<span className="font-semibold">
										{selectedDevice?.name ||
											unlinkTarget.hrisDeviceUser?.device?.name ||
											"-"}
									</span>
								</div>
							</div>
						</div>
					) : null}
					<p className="text-xs text-slate-600">
						Future punches from this device user will need matching again until a new
						employee link is chosen.
					</p>
					<div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
						<Button
							type="button"
							variant="outline"
							disabled={unlinkDeviceUserMutation.isPending}
							onClick={() => setUnlinkTarget(null)}>
							Cancel
						</Button>
						<Button
							type="button"
							className="bg-red-700 text-white hover:bg-red-800"
							disabled={unlinkDeviceUserMutation.isPending}
							onClick={confirmUnlinkDeviceUser}>
							{unlinkDeviceUserMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Unlink className="h-4 w-4" />
							)}
							Unlink employee
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}

export default function EnrollPage() {
	return <DeviceEnrollmentPanel />;
}
