import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "~/components/atoms/Button";
import { useRef } from "react";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { Select } from "~/components/atoms/Select";
import { EmployeePickerSelect } from "~/components/molecules/employee/EmployeePickerSelect";
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
	Trash2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useEmployee, useEmployees } from "~/lib/hooks/useEmployees";
import {
	useDevices,
	useDeviceHealthMap,
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
	useStartHikvisionCredentialRecoveryJob,
	useHikvisionCredentialRecoveryJob,
	useSyncDeviceUsers,
	usePreviewDeviceUserExport,
	useExportDeviceUsers,
	usePreviewDeviceUserImport,
	useExecuteDeviceUserImport,
	useUnlinkDeviceUser,
	useDeleteDeviceUser,
	useDeleteDeviceUsers,
	type DeviceHealthMapEntry,
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
	healthEntry?: DeviceHealthMapEntry;
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
type SdkMergeCredentialWrite = NonNullable<
	DeviceUserMergePlanResponse["plan"]["credentialWrites"]
>[number];

const isSdkMergePhysicalActionRequired = (write: SdkMergeCredentialWrite) =>
	write.recoveryClassification === "physical_action_required";

const formatSdkMergeRecoveryStage = (write: SdkMergeCredentialWrite) => {
	const stage = String(write.recoveryStage || "").trim();
	const labels: Record<string, string> = {
		queued_source_custody_recovery: "Queued source custody recovery",
		exporting_source_credential: "Exporting source credential",
		comparing_sources: "Comparing physical sources",
		resolving_richest_source: "Resolving richest safe source",
		probing_target_capability: "Probing target capability",
		preparing_writer: "Preparing writer",
		ready_to_write: "Ready to write",
		writing: "Writing",
		rereading_target: "Rereading physical target",
		physically_retained: "Physically retained",
		retrying_recoverable_failure: "Retrying recoverable failure",
		physical_identity_action_required: "Physical identity action required",
		physical_reenrollment_required: "Physical reenrollment required",
		device_firmware_unsupported: "Device firmware unsupported",
	};
	if (labels[stage]) return labels[stage];
	if (write.executionEligibility === "sdk_probe_required") {
		return "Run the exact SDK export/copy capability probe";
	}
	if (write.blockingReason === "missing_raw_blob") {
		return "Capture current source custody";
	}
	if (write.blockingReason === "source_conflict") {
		return "Compare source checksums and select the richest safe custody";
	}
	if (write.blockingReason === "canonical_identity_unproven") {
		return "Prove HRIS employee link on source and target (agent)";
	}
	if (write.blockingReason === "target_write_unsupported") {
		return "Probe and attest a supported target writer";
	}
	if (write.blockingReason === "credential_only_card_not_supported") {
		return "Probe card writer and verify ownership";
	}
	return "Resolve the recorded evidence stage";
};

const formatSdkMergePhysicalAction = (write: SdkMergeCredentialWrite) => {
	const reason = String(write.blockingReason || "").trim();
	if (
		reason === "physical_identity_adjudication_required" ||
		reason === "duplicate_owner_detected" ||
		reason === "different_target_owner_detected"
	) {
		return "Another person owns this slot on the target (dual-owner) — not auto-overwrite";
	}
	if (reason === "source_conflict") {
		// Only shown when stage is physical_identity_action_required (duplicate slot).
		return "Target slot already enrolled to a different vendor user";
	}
	if (reason === "physical_reenrollment_required" || reason === "source_not_enrolled") {
		return "Credential not enrolled on any source device";
	}
	if (reason === "device_firmware_unsupported") {
		return "Target firmware cannot accept this write";
	}
	return "True physical / ownership boundary (not agent auto-recovery)";
};

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
	const rawFingerprintCount = Number(record?.biometricEvidence?.fingerprint?.rawBlobCount || 0);
	const rawFacePresent = Boolean(record?.biometricEvidence?.face?.rawBlobPresent);
	const credentials =
		rawFingerprintCount * 6 +
		Number(rawFacePresent) * 4 +
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
	const fingerprintEvidence = row.richestRecord?.biometricEvidence?.fingerprint;
	const faceEvidence = row.richestRecord?.biometricEvidence?.face;
	if (row.filter === "decision") {
		return `Recommended profile source: ${row.sourceDeviceName || "selected source"}. It has the strongest current physical profile and evidenced-custody score for this ID (${sourceSummary}). Enrollment counts alone do not authorize biometric copying.`;
	}
	if (row.filter === "fingerprint") {
		return fingerprintEvidence?.status === "raw_blob_present"
			? `Fingerprint source evidenced on ${row.sourceDeviceName || "selected source"}: ${mergeMetricValue(fingerprintEvidence.rawBlobCount || 0)} usable raw template(s).`
			: `No fingerprint copy is recommended. The panel reports enrollment, but usable raw fingerprint custody is ${fingerprintEvidence?.status || "not evidenced"}.`;
	}
	if (row.filter === "face") {
		return faceEvidence?.status === "raw_blob_present"
			? `Face source evidenced on ${row.sourceDeviceName || "selected source"}: a usable raw face blob is available.`
			: `No face copy is recommended. The panel reports enrollment, but usable raw face custody is ${faceEvidence?.status || "not evidenced"}.`;
	}
	if (row.filter === "card") {
		return `Recommended profile source: ${row.sourceDeviceName || "selected source"}; card evidence is part of the physical user record (${sourceSummary}).`;
	}
	if (row.filter === "missing") {
		return `Recommended profile source: ${row.sourceDeviceName || "selected source"}. The target device is missing this ID. Fingerprint or face transfer remains disabled unless this source also has usable raw custody (${sourceSummary}).`;
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
	/** Durable job id when face/FP copy runs async (poll for progress). */
	jobId?: string | null;
	jobStatus?: string | null;
	jobStage?: string | null;
	jobMessage?: string | null;
	jobElapsedMs?: number | null;
	jobEvents?: Array<{ stage?: string; message?: string; at?: string }>;
};

type DeviceUserExportFormat = "csv" | "excel" | "json";
type DeviceUserImportFormat = "csv" | "json";
const DEVICE_USER_BIOMETRIC_CSV_COLUMNS = ["rawFingerprintBlob", "rawFaceBlob"] as const;
const DEVICE_USER_RAW_BIOMETRIC_PACKAGE_POLICY =
	"raw_evidenced_blobs_allowed_for_admin_device_user_sync_package";

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
const CREDENTIAL_RECOVERY_JOB_STORAGE_KEY = "hris.credential-recovery-job-id";
const DEVICE_USER_SYNC_PROCESSING_STALE_MS = 30 * 60 * 1000;
const DEFAULT_BULK_DEVICE_USER_SYNC_MODE: DeviceUserSyncMode = "needs_attention_only";
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

const formatDeviceUserSyncRawFailureReason = (reason?: string | null) => {
	const raw = String(reason || "missing_raw_blob").trim();
	const lower = raw.toLowerCase();
	if (
		raw === "face_image_not_found_on_device" ||
		lower.includes("404 -- not found") ||
		lower.includes("can't locate document") ||
		lower.includes("cant locate document")
	) {
		return "Face image not found on device";
	}
	if (
		raw === "face_image_unauthorized" ||
		lower.includes("<statusvalue>401</statusvalue>") ||
		lower.includes("unauthorized")
	) {
		return "Face image unavailable: unauthorized";
	}
	if (raw === "face_binary_not_image") return "Face response was not an image";
	if (raw === "face_binary_empty") return "Face image response was empty";
	if (raw === "no_face_on_device") return "No face returned by device";
	if (raw === "no_fingerprint_data_from_device") return "No fingerprint data returned by device";
	if (raw === "missing_raw_blob") return "Missing raw blob";
	if (
		lower.startsWith("<!doctype html") ||
		lower.startsWith("<html") ||
		lower.startsWith("<?xml")
	) {
		return "Device returned non-image data";
	}
	return raw.length > 96 ? `${raw.slice(0, 93)}...` : raw;
};

const formatDeviceUserSyncRawFailureMessage = (message?: string | null) => {
	const raw = String(message || "").trim();
	if (!raw) return "Sync failed.";
	const lower = raw.toLowerCase();
	if (!lower.includes("still missing raw blobs")) {
		return formatDeviceUserSyncRawFailureReason(raw);
	}
	const count = raw.match(/(\d+)\s+biometric credential/i)?.[1] || "";
	const reasonLabels = new Set<string>();
	for (const part of raw.split(":").slice(1).join(":").split(",")) {
		const reason = part.split("=").slice(0, -1).join("=").trim() || part.trim();
		if (reason) reasonLabels.add(formatDeviceUserSyncRawFailureReason(reason));
	}
	const friendlyReasons = Array.from(reasonLabels).filter(Boolean);
	const prefix = count
		? `${count} biometric credential(s) still missing raw blobs`
		: "Biometric credential(s) still missing raw blobs";
	return friendlyReasons.length > 0
		? `${prefix}: ${friendlyReasons.join(", ")}`
		: `${prefix}: Missing raw blob`;
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
	const syncCenterHealth = useDeviceHealthMap(
		devices.map((device: any) => String(device.id || "")).filter(Boolean),
		activePanel === "overview" || activePanel === "users",
		{ staleTime: 30_000, quick: true },
	);
	const deviceUserStatus = searchParams.get("deviceUserStatus") || "all";
	const deviceUserSearch = searchParams.get("deviceUserSearch") || "";
	const deviceUserVendorRange = searchParams.get("deviceUserVendorRange") || "";
	const scopedDeviceUserVendorIds = useMemo(
		() =>
			deviceUserVendorRange === "0-20"
				? Array.from({ length: 21 }, (_, index) => String(index))
				: [],
		[deviceUserVendorRange],
	);
	const hasScopedDeviceUserVendorIds = scopedDeviceUserVendorIds.length > 0;
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
		{
			deviceId: activePanel === "overview" ? "all" : selectedDeviceId || "all",
			quick: true,
		},
		// Only while Sync Center panels that need counts are visible â€” no background poll.
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
		isFetching: isFetchingHikvisionListenerStatus,
		dataUpdatedAt: hikvisionListenerUpdatedAt,
		error: hikvisionListenerStatusError,
		refetch: refetchHikvisionListenerStatus,
	} = useHikvisionListenerStatus(
		// Overview/Device Users render the listener card; poll only while details is open.
		activePanel === "overview" || activePanel === "users" || isListenerDetailsOpen,
		{
			staleTime: isListenerDetailsOpen ? 8 * 1000 : 60 * 1000,
			refetchInterval: isListenerDetailsOpen ? 12 * 1000 : false,
		},
	);
	const hikvisionListenerControl = useControlHikvisionListener();
	const syncDeviceUsersMutation = useSyncDeviceUsers();
	const previewDeviceUserExportMutation = usePreviewDeviceUserExport();
	const exportDeviceUsersMutation = useExportDeviceUsers();
	const previewDeviceUserImportMutation = usePreviewDeviceUserImport();
	const executeDeviceUserImportMutation = useExecuteDeviceUserImport();
	const startDeviceUserSyncJobMutation = useStartDeviceUserSyncJob();
	const cancelDeviceUserSyncJobMutation = useCancelDeviceUserSyncJob();
	const planHikvisionSdkUserMergeMutation = usePlanHikvisionSdkUserMerge();
	const startHikvisionSdkUserMergeJobMutation = useStartHikvisionSdkUserMergeJob();
	const startHikvisionCredentialRecoveryMutation =
		useStartHikvisionCredentialRecoveryJob();
	const linkDeviceUserMutation = useLinkDeviceUser();
	const unlinkDeviceUserMutation = useUnlinkDeviceUser();
	const deleteDeviceUserMutation = useDeleteDeviceUser();
	const deleteDeviceUsersMutation = useDeleteDeviceUsers();
	const [deviceUserSyncState, setDeviceUserSyncState] = useState<{
		open: boolean;
		status: "idle" | "review" | "syncing" | "complete" | "error";
		message: string;
		summary?: DeviceUserSyncSummary;
		preview?: DeviceSyncPreviewRow;
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
		availability?: Array<{
			deviceId: string;
			deviceName: string;
			status: "checking" | "online" | "unavailable";
			reason?: string;
			checkedAt?: string;
			evidenceSource?: string;
		}>;
	}>({ open: false, status: "idle", message: "", choices: {} });
	const sdkMergeAvailabilityRequest = useRef<{
		sequence: number;
		controller: AbortController | null;
	}>({ sequence: 0, controller: null });
	const [sdkMergeCredentialPicker, setSdkMergeCredentialPicker] =
		useState<SdkMergeCredentialPickerState>(null);
	const [sdkMergeSourceReview, setSdkMergeSourceReview] =
		useState<SdkMergeSourceReviewState>(null);
	const [selectedSdkMergeUserKeys, setSelectedSdkMergeUserKeys] = useState<
		Record<string, boolean>
	>({});
	const [sdkMergeJobId, setSdkMergeJobId] = useState<string | null>(sdkMergeJobIdParam || null);
	const [credentialRecoveryJobId, setCredentialRecoveryJobId] = useState<string | null>(() => {
		if (typeof window === "undefined") return null;
		return window.localStorage.getItem(CREDENTIAL_RECOVERY_JOB_STORAGE_KEY);
	});
	const [sdkMergeLastJob, setSdkMergeLastJob] = useState<DeviceUserMergeJobProgress | null>(null);
	const [sdkMergeHandledJobId, setSdkMergeHandledJobId] = useState<string | null>(null);
	const [sdkMergeDismissedJobId, setSdkMergeDismissedJobId] = useState<string | null>(null);
	const [sdkMergeConfirmOpen, setSdkMergeConfirmOpen] = useState(false);
	const [sdkMergeCredentialConfirmOpen, setSdkMergeCredentialConfirmOpen] = useState(false);
	const [selectedSdkMergeCredentialWriteIds, setSelectedSdkMergeCredentialWriteIds] = useState<
		Record<string, boolean>
	>({});
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
	const [sdkMergeJobClock, setSdkMergeJobClock] = useState(() => Date.now());
	const deviceUserSyncJobStatus = deviceUserSyncJobProgress?.status;
	const [detailsDeviceUser, setDetailsDeviceUser] = useState<VisibleDeviceUserRow | null>(null);
	const detailsDeviceUserVendorUserId = String(detailsDeviceUser?.vendorUserId || "").trim();
	const [detailsDeviceUserSavedLoading, setDetailsDeviceUserSavedLoading] = useState(false);
	const [rawFpCaptureBusy, setRawFpCaptureBusy] = useState(false);
	const [rawFpExpandIds, setRawFpExpandIds] = useState<Set<string>>(new Set());
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
	const [deleteTarget, setDeleteTarget] = useState<VisibleDeviceUserRow | null>(null);
	const [deleteSelectedTargets, setDeleteSelectedTargets] = useState<VisibleDeviceUserRow[]>([]);
	const [recentDeletedDeviceUser, setRecentDeletedDeviceUser] = useState<{
		vendorUserId: string;
		displayName?: string | null;
		sourceDeleted: boolean;
		hrisDeleted: boolean;
		count?: number;
		failed?: number;
	} | null>(null);
	const [copyDeviceUserState, setCopyDeviceUserState] = useState<CopyDeviceUserState>({
		open: false,
		sourceDeviceUser: null,
		targetDeviceId: "",
		applyToAllPeers: false,
		includeFingerprints: true,
		includeFaceRecognition: true,
		successfulTargets: [],
		failedTargets: [],
		jobId: null,
		jobStatus: null,
		jobStage: null,
		jobMessage: null,
		jobElapsedMs: null,
		jobEvents: [],
	});
	const [deviceUserExportState, setDeviceUserExportState] = useState<{
		open: boolean;
		selection: DeviceUserExportSelection;
		includeCards: boolean;
		includeFingerprints: boolean;
		includeFaces: boolean;
		rawBiometricPackage: boolean;
		format: DeviceUserExportFormat;
		preview: DeviceUserExportPayload | null;
		result: DeviceUserExportPayload | null;
	}>({
		open: false,
		// Full device inventory by default (not the paged 8-row view). Operators can
		// still switch to currentPage / selectedRows in the export modal.
		selection: "all",
		includeCards: true,
		includeFingerprints: true,
		includeFaces: true,
		rawBiometricPackage: true,
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
		biometricTransferMode: "sdkPeerCopy" | "metadataOnly" | "rawPackage";
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
		runAsJob: true,
	});
	const [selectedExportVendorUserIds, setSelectedExportVendorUserIds] = useState<string[]>([]);
	const [isCopyDeviceUserSubmitting, setIsCopyDeviceUserSubmitting] = useState(false);
	const [copyDeviceUserStatusMessage, setCopyDeviceUserStatusMessage] = useState("");
	const [selectedEmployeeForLink, setSelectedEmployeeForLink] = useState("");

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
			open: false,
			status: "idle",
			message: "",
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
		setBulkDeviceUserSyncState({
			open: false,
			status: "idle",
			message: "",
			lastProgress: null,
		});
		toast.warning("Previous device-user sync status stopped updating", {
			id: "device-user-sync-progress",
			description:
				"No device-user sync is being shown as active until you trigger a fresh run.",
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
		(watchedDeviceId && action === "enroll" && !hasScopedDeviceUserVendorIds) ||
		(action === "import" && !hasScopedDeviceUserVendorIds) ||
		(activePanel === "users" &&
			deviceUserView === "source" &&
			Boolean(selectedDeviceId) &&
			!hasScopedDeviceUserVendorIds) ||
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
			limit: Math.min(Math.max(sourceVendorUserIdsForQuery.length, 1), 1000),
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
		(deviceUserView === "shown" || deviceUserView === "source") &&
		!hasScopedDeviceUserVendorIds;
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
			vendorUserIds: hasScopedDeviceUserVendorIds ? scopedDeviceUserVendorIds : undefined,
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
			vendorUserIds: hasScopedDeviceUserVendorIds ? scopedDeviceUserVendorIds : undefined,
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
		if (!sdkMergeJobId || sdkMergeJobProgress?.status !== "processing") return;
		const timer = window.setInterval(() => setSdkMergeJobClock(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, [sdkMergeJobId, sdkMergeJobProgress?.status]);
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
				open: current.open,
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
			setBulkDeviceUserSyncState({
				open: false,
				status: "idle",
				message: "",
				lastProgress: null,
			});
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
			if (view === "open") next.set("deviceUserStatus", "UNMATCHED");
			else if (view === "linked") next.set("deviceUserStatus", "ACTIVE");
			else next.delete("deviceUserStatus");
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
		await Promise.allSettled([
			refetchSyncPreview(),
			refetchSyncRuns(),
			syncCenterHealth.refetchAll(),
		]);
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
		void runBulkDeviceUserSync(DEFAULT_BULK_DEVICE_USER_SYNC_MODE);
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
		sdkMergeAvailabilityRequest.current.controller?.abort();
		const availabilityController = new AbortController();
		const availabilitySequence = sdkMergeAvailabilityRequest.current.sequence + 1;
		sdkMergeAvailabilityRequest.current = {
			sequence: availabilitySequence,
			controller: availabilityController,
		};
		const configuredAvailability = hikvisionDeviceOptions.map((device: any) => ({
			deviceId: String(device.id || "").trim(),
			deviceName: String(device.name || device.address || device.id || "Hikvision device"),
			status: "checking" as const,
		}));
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
		setSdkMergeConfirmOpen(false);
		setSdkMergeState({
			open: true,
			status: "loading",
			message: "Checking which Hikvision devices are available (up to 10 seconds).",
			choices: {},
			availability: configuredAvailability,
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
			// Quick sync preview intentionally skips live source-user reads, so its
			// vendorUserCount stays null even when the transport is online. It cannot
			// be used as the Merge availability gate.
			let completedChecks = 0;
			const healthResults = await Promise.all(
				configuredDeviceIds.map(async (deviceId, index) => {
					try {
						const health = await deviceService.getDeviceHealth(deviceId, {
							quick: true,
							timeoutMs: 10_000,
							signal: availabilityController.signal,
						});
						completedChecks += 1;
						const online = health?.summary?.status === "online";
						if (sdkMergeAvailabilityRequest.current.sequence === availabilitySequence) {
							setSdkMergeState((current) => ({
								...current,
								message: `${completedChecks}/${configuredDeviceIds.length} checks complete · ${online ? "Authenticated" : "Excluded"}: ${configuredAvailability[index].deviceName}`,
								availability: (current.availability || configuredAvailability).map(
									(row: (typeof configuredAvailability)[number]) =>
										row.deviceId === deviceId
											? {
													...row,
													status: online ? "online" : "unavailable",
													checkedAt: health?.summary?.checkedAt,
													evidenceSource:
														health?.checks?.deviceApi?.provenBy ||
														"credentialed protocol response",
													reason:
														health?.checks?.deviceApi?.error ||
														health?.checks?.network?.error ||
														health?.summary?.status ||
														"Quick health did not report online",
												}
											: row,
								),
							}));
						}
						return { status: "fulfilled" as const, value: health };
					} catch (error: any) {
						completedChecks += 1;
						const reason =
							error?.message ||
							(availabilityController.signal.aborted
								? "Canceled"
								: "Health check failed");
						if (sdkMergeAvailabilityRequest.current.sequence === availabilitySequence) {
							setSdkMergeState((current) => ({
								...current,
								message: `${completedChecks}/${configuredDeviceIds.length} checks complete · Excluded: ${configuredAvailability[index].deviceName}`,
								availability: (current.availability || configuredAvailability).map(
									(row: (typeof configuredAvailability)[number]) =>
										row.deviceId === deviceId
											? { ...row, status: "unavailable", reason }
											: row,
								),
							}));
						}
						return { status: "rejected" as const, reason };
					}
				}),
			);
			if (
				availabilityController.signal.aborted ||
				sdkMergeAvailabilityRequest.current.sequence !== availabilitySequence
			) {
				return;
			}
			window.clearTimeout(availabilitySlowTimer);
			const deviceIds = configuredDeviceIds.filter((_, index) => {
				const result = healthResults[index];
				return result?.status === "fulfilled" && result.value?.summary?.status === "online";
			});
			const skippedCount = configuredDeviceIds.length - deviceIds.length;
			const finalAvailability = configuredAvailability.map(
				(row: (typeof configuredAvailability)[number], index: number) => {
				const result = healthResults[index];
				const online =
					result?.status === "fulfilled" && result.value?.summary?.status === "online";
				return {
					...row,
					status: online ? ("online" as const) : ("unavailable" as const),
					checkedAt:
						result?.status === "fulfilled"
							? result.value?.summary?.checkedAt
							: undefined,
					evidenceSource:
						result?.status === "fulfilled"
							? result.value?.checks?.deviceApi?.provenBy ||
								"credentialed protocol response"
							: "request failure",
					reason: online
						? "Credentialed Hikvision system-time response"
						: result?.status === "fulfilled"
							? result.value?.checks?.deviceApi?.error ||
								result.value?.checks?.network?.error ||
								result.value?.summary?.status ||
								"Quick health did not report online"
							: result?.reason || "Health check failed",
				};
				},
			);
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
					availability: finalAvailability,
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
				availability: finalAvailability,
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
			const readableDeviceCount =
				data.plan.validDeviceIds?.length ??
				data.plan.devices.filter((device) => device.readStatus !== "failed").length;
			const readFailedDeviceCount =
				data.plan.failedDeviceIds?.length ??
				data.plan.devices.filter((device) => device.readStatus === "failed").length;
			const actionableKeys = Object.fromEntries(
				(data.plan.users || [])
					.filter((user) => {
						const hasCredentialIssue = (["fingerprint", "face"] as const).some(
							(kind) => {
								const truth = mergeCredentialTruth(
									user,
									data.plan.devices || [],
									kind,
								);
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
			// Default: auto-resolve Needs decision via richest custody. Operator
			// can still Clear choices / pick A|B|KEEP manually before applying.
			const autoChoices = buildSdkMergeRichestChoices(data.plan);
			const autoChoiceCount = Object.values(autoChoices).reduce(
				(sum, row) => sum + Object.keys(row || {}).length,
				0,
			);
			setSdkMergeState({
				open: true,
				status: "review",
				message: searchScope
					? `Search is scoped to "${searchScope}" across ${readableDeviceCount} readable devices. ${readFailedDeviceCount} live inventory read${readFailedDeviceCount === 1 ? "" : "s"} failed; ${skippedCount} offline or unavailable skipped. ${autoChoiceCount ? `Auto-resolved ${autoChoiceCount} decision(s) from richest sources (you can still override).` : ""}`
					: `Review from ${readableDeviceCount} readable devices. ${readFailedDeviceCount} live inventory read${readFailedDeviceCount === 1 ? "" : "s"} failed; ${skippedCount} offline or unavailable skipped. ${autoChoiceCount ? `Auto-resolved ${autoChoiceCount} decision(s) from richest sources (manual override still available).` : ""}`,
				data,
				choices: autoChoices as any,
				availability: finalAvailability,
			});
		} catch (error: any) {
			window.clearTimeout(availabilitySlowTimer);
			if (liveReadSlowTimer) window.clearTimeout(liveReadSlowTimer);
			if (
				availabilityController.signal.aborted ||
				sdkMergeAvailabilityRequest.current.sequence !== availabilitySequence
			) {
				return;
			}
			setSdkMergeState((current) => ({
				...current,
				open: true,
				status: "error",
				message: error?.message || "Could not read live users.",
				choices: {},
			}));
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
					recommendedAction: `Default is RICHEST SOURCE: use the value from ${mergeDeviceName(plan.devices, selectedRecord?.deviceId || user.sourceDeviceId)}. Recovery jobs follow richest custody for fingerprint/face; you can still pick another source in review.`,
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
						recommendedAction:
							kind === "fingerprint" || kind === "face"
								? `RICHEST SOURCE (default): copy ${mergeFieldLabel(kind).toLowerCase()} from ${mergeDeviceName(plan.devices, strongestRecord?.deviceId || user.sourceDeviceId)} (${strongestCount} on source → ${targetCount} on target). Recovery jobs overwrite this target for the same vendor id after physical reread proof.`
								: `Copy ${mergeFieldLabel(kind).toLowerCase()} from ${mergeDeviceName(plan.devices, strongestRecord?.deviceId || user.sourceDeviceId)}.`,
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
	const sdkMergeRowMatchesDevice = useCallback(
		(row: SdkMergeIssueRow, deviceId: string, filter: SdkMergeFilter = row.filter) => {
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
		},
		[],
	);
	const sdkMergeUniqueRows = useMemo<SdkMergeIssueRow[]>(() => {
		const plan = sdkMergeState.data?.plan;
		if (!plan) return [];
		return plan.users
			.map((user) => {
				const userRows = sdkMergeRows.filter((row) => row.userKey === user.key);
				const reviewRows = userRows.filter((row) => row.filter !== "ready");
				const richestRecord = [...user.records].sort(
					(left: any, right: any) =>
						mergeRecordRichnessScore(right) - mergeRecordRichnessScore(left),
				)[0];
				const deviceNames = user.records
					.map((record: any) => mergeDeviceName(plan.devices, record.deviceId))
					.filter(Boolean);
				const duplicateSourceRowCount = (user.duplicateSourceRows || []).reduce(
					(count: number, duplicate: any) =>
						count + Math.max(0, Number(duplicate.sourceRows || 0) - 1),
					0,
				);
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
					missingLabel: missingNames.length
						? missingNames.join(", ")
						: "All selected devices",
					dataLabel: `${mergePlural(user.records.length, "device record")} kept from ${mergePlural(user.sourceRows || user.records.length, "source row")}. Seen on ${deviceNames.join(", ") || "no device"}.`,
					recommendedAction: reviewRows.length
						? `${mergePlural(reviewRows.length, "issue row")} to review for this ID.${duplicateSourceRowCount ? ` ${mergePlural(duplicateSourceRowCount, "duplicate source row")} collapsed.` : ""}`
						: "This ID is already aligned across the selected devices.",
					primaryAction: "details",
					conflictFields: user.conflicts.map(
						(conflict) => conflict.field as DeviceUserMergeField,
					),
					richestRecord,
				};
				return uniqueRow;
			})
			.sort(compareSdkMergeRowsByVendorId);
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
				dataLabel:
					"Would copy the selected recommended source record to this target device.",
				recommendedAction: "Review only. No write starts from this row.",
				primaryAction: "details" as SdkMergeRowAction,
				richestRecord,
			}));
		});
		return rows.sort(compareSdkMergeRowsByVendorId);
	}, [sdkMergeState.data]);
	const sdkMergeReviewRows = sdkMergeUniqueRows.filter((row) => row.filter !== "ready");
	const sdkMergeIssueRowsForUser = useCallback(
		(userKey: string, filter: SdkMergeFilter = "all") =>
			sdkMergeRows.filter(
				(row) =>
					row.userKey === userKey &&
					row.filter !== "ready" &&
					(filter === "all" || row.filter === filter),
			),
		[sdkMergeRows],
	);
	const sdkMergeUniqueIssueCount = useCallback(
		(filter: SdkMergeFilter = "all") =>
			new Set(
				sdkMergeRows
					.filter(
						(row) =>
							row.filter !== "ready" && (filter === "all" || row.filter === filter),
					)
					.map((row) => row.userKey),
			).size,
		[sdkMergeRows],
	);
	const sdkMergeUniqueIssueDeviceCount = useCallback(
		(deviceId: string, filter: SdkMergeFilter) =>
			new Set(
				sdkMergeRows
					.filter(
						(row) =>
							row.filter === filter &&
							sdkMergeRowMatchesDevice(row, deviceId, filter),
					)
					.map((row) => row.userKey),
			).size,
		[sdkMergeRowMatchesDevice, sdkMergeRows],
	);
	const sdkMergeDisplayRows =
		sdkMergeListMode === "records"
			? sdkMergeRecordRows
			: sdkMergeListMode === "review"
				? sdkMergeReviewRows
				: sdkMergeListMode === "writes"
					? sdkMergeWriteRows
					: sdkMergeListMode === "issues"
						? sdkMergeReviewRows
						: sdkMergeUniqueRows;
	const sdkMergeVisibleRows = sdkMergeDisplayRows.filter((row) => {
		const scopedIssueRows =
			sdkMergeListMode === "issues"
				? sdkMergeIssueRowsForUser(row.userKey, sdkMergeFilter)
				: [];
		if (sdkMergeListMode === "issues" && scopedIssueRows.length === 0) return false;
		if (selectedMergeDeviceId !== "all") {
			const matches =
				sdkMergeListMode === "issues"
					? scopedIssueRows.some((issueRow) =>
							sdkMergeRowMatchesDevice(
								issueRow,
								selectedMergeDeviceId,
								issueRow.filter,
							),
						)
					: sdkMergeListMode === "writes"
						? sdkMergeRowMatchesDevice(row, selectedMergeDeviceId, row.filter)
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
					.some((value) => String(value).toLowerCase().includes(normalizedSdkMergeSearch))
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
	const selectedSdkMergeCredentialRow = sdkMergeCredentialPicker
		? sdkMergeVisibleRows.find((row) => row.id === sdkMergeCredentialPicker.rowId) ||
			sdkMergeDisplayRows.find((row) => row.id === sdkMergeCredentialPicker.rowId) ||
			null
		: null;
	const selectedSdkMergeSourceReviewRow = sdkMergeSourceReview
		? sdkMergeVisibleRows.find((row) => row.id === sdkMergeSourceReview.rowId) ||
			sdkMergeDisplayRows.find((row) => row.id === sdkMergeSourceReview.rowId) ||
			null
		: null;
	const sdkMergeUniqueIdCount = sdkMergeState.data?.plan.users.length || 0;
	const sdkMergePlanDevices = useMemo(
		() => sdkMergeState.data?.plan.devices || [],
		[sdkMergeState.data],
	);
	const { data: credentialRecoveryJob } = useHikvisionCredentialRecoveryJob(
		credentialRecoveryJobId,
		Boolean(credentialRecoveryJobId),
	);
	const sdkMergeCredentialWrites = useMemo(
		() => sdkMergeState.data?.plan.credentialWrites || [],
		[sdkMergeState.data],
	);
	const sdkMergePotentialOperationSummary =
		sdkMergeState.data?.plan.potentialOperations;
	const sdkMergeSelectableCredentialWrites = sdkMergeCredentialWrites.filter(
		(write) =>
			write.recommended &&
			write.executionEligibility === "ready_from_raw_blob" &&
			!isSdkMergePhysicalActionRequired(write),
	);
	const sdkMergeSelectedCredentialWrites = sdkMergeSelectableCredentialWrites.filter(
		(write) => selectedSdkMergeCredentialWriteIds[write.id],
	);
	const sdkMergePhysicalActionCredentialWrites = sdkMergeCredentialWrites.filter(
		isSdkMergePhysicalActionRequired,
	);
	const sdkMergeRecoveryQueuedCredentialWriteCount = sdkMergeCredentialWrites.filter(
		(write) =>
			!sdkMergeSelectableCredentialWrites.some((ready) => ready.id === write.id) &&
			!isSdkMergePhysicalActionRequired(write),
	).length;
	const sdkMergeCredentialFingerprintWriteCount = sdkMergeCredentialWrites.filter(
		(write) => write.modality === "fingerprint",
	).length;
	const sdkMergeCredentialFaceWriteCount = sdkMergeCredentialWrites.filter(
		(write) => write.modality === "face",
	).length;
	const sdkMergeCredentialCardWriteCount = sdkMergeCredentialWrites.filter(
		(write) => write.modality === "card",
	).length;
	const sdkMergeRecoveryStageEntries = Object.entries(
		sdkMergePotentialOperationSummary?.byRecoveryStage || {},
	)
		.filter(([, count]) => Number(count || 0) > 0)
		.sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0));
	const sdkMergeActionableUserKeys = useMemo(() => {
		if (!sdkMergeState.data?.plan) return [];
		return sdkMergeState.data.plan.users
			.filter((user) => {
				const hasCredentialIssue = (["fingerprint", "face"] as const).some((kind) => {
					const truth = mergeCredentialTruth(user, sdkMergePlanDevices, kind);
					return truth.present < truth.expected;
				});
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
		sdkMergeState.data?.plan.users.reduce((count, user) => count + user.records.length, 0) || 0;
	const sdkMergeDuplicateSourceRowCount =
		sdkMergeState.data?.plan.counts?.duplicateSourceRows ||
		sdkMergeState.data?.plan.users.reduce(
			(count, user) =>
				count +
				(user.duplicateSourceRows || []).reduce(
					(total: number, duplicate: any) =>
						total + Math.max(0, Number(duplicate.sourceRows || 0) - 1),
					0,
				),
			0,
		) ||
		0;
	const sdkMergeUserPotentialWriteCount =
		sdkMergeWriteRows.length ||
		sdkMergeState.data?.plan.plannedWrites?.length ||
		sdkMergeState.data?.plan.users.reduce(
			(count, user) => count + user.targetDeviceIds.length,
			0,
		) ||
		0;
	const sdkMergePotentialWriteCount =
		sdkMergeUserPotentialWriteCount + sdkMergeCredentialWrites.length;
	const sdkMergeSelectedWriteMatrix = useMemo(() => {
		const plan = sdkMergeState.data?.plan;
		if (!plan) {
			return {
				perTarget: [] as Array<{
					deviceId: string;
					deviceName: string;
					writes: number;
					sourceDeviceNames: string[];
				}>,
				perSource: [] as Array<{
					deviceId: string;
					deviceName: string;
					selectedUniqueIds: number;
					writes: number;
				}>,
				rows: [] as Array<{
					key: string;
					label: string;
					vendorUserId: string;
					sourceDeviceId: string;
					sourceDeviceName: string;
					targetDeviceNames: string[];
					writes: number;
					conflicts: number;
					fingerprintSourceCount: number;
					fingerprintPresentDevices: number;
					fingerprintExpectedDevices: number;
					fingerprintGapDevices: number;
					faceSourceCount: number;
					facePresentDevices: number;
					faceExpectedDevices: number;
					faceGapDevices: number;
				}>,
			};
		}
		const sourceMap = new Map<
			string,
			{ deviceId: string; deviceName: string; selectedUniqueIds: number; writes: number }
		>();
		const targetMap = new Map<
			string,
			{
				deviceId: string;
				deviceName: string;
				writes: number;
				sourceDeviceNames: Set<string>;
			}
		>();
		const rows = plan.users
			.filter((user) => selectedSdkMergeUserKeys[user.key])
			.map((user) => {
				const selectedConflict = user.conflicts.find((conflict) => {
					const choice =
						sdkMergeState.applyAll || sdkMergeState.choices[user.key]?.[conflict.field];
					return Boolean(choice);
				});
				const selectedChoice =
					selectedConflict &&
					(sdkMergeState.applyAll ||
						sdkMergeState.choices[user.key]?.[selectedConflict.field]);
				const sourceDeviceId =
					selectedChoice === "B"
						? selectedConflict?.deviceB.id || user.sourceDeviceId
						: selectedChoice === "A"
							? selectedConflict?.deviceA.id || user.sourceDeviceId
							: user.sourceDeviceId;
				const sourceDeviceName = mergeDeviceName(plan.devices, sourceDeviceId);
				const sourceRecord =
					user.records.find((record: any) => record.deviceId === sourceDeviceId) ||
					user.records.find((record: any) => record.deviceId === user.sourceDeviceId) ||
					user.records[0];
				const fingerprintSourceCount = mergeCredentialCount(sourceRecord, "fingerprint");
				const faceSourceCount = mergeCredentialCount(sourceRecord, "face");
				const fingerprintTruth = mergeCredentialTruth(user, plan.devices, "fingerprint");
				const faceTruth = mergeCredentialTruth(user, plan.devices, "face");
				const targetDeviceIds = user.targetDeviceIds.filter(
					(deviceId) => deviceId !== sourceDeviceId,
				);
				const source = sourceMap.get(sourceDeviceId) || {
					deviceId: sourceDeviceId,
					deviceName: sourceDeviceName,
					selectedUniqueIds: 0,
					writes: 0,
				};
				source.selectedUniqueIds += 1;
				source.writes += targetDeviceIds.length;
				sourceMap.set(sourceDeviceId, source);
				for (const targetDeviceId of targetDeviceIds) {
					const target = targetMap.get(targetDeviceId) || {
						deviceId: targetDeviceId,
						deviceName: mergeDeviceName(plan.devices, targetDeviceId),
						writes: 0,
						sourceDeviceNames: new Set<string>(),
					};
					target.writes += 1;
					target.sourceDeviceNames.add(sourceDeviceName);
					targetMap.set(targetDeviceId, target);
				}
				return {
					key: user.key,
					label: mergePersonLabel(user),
					vendorUserId: mergeVendorUserId(user),
					sourceDeviceId,
					sourceDeviceName,
					targetDeviceNames: targetDeviceIds.map((deviceId) =>
						mergeDeviceName(plan.devices, deviceId),
					),
					writes: targetDeviceIds.length,
					conflicts: user.conflicts.length,
					fingerprintSourceCount,
					fingerprintPresentDevices: fingerprintTruth.present,
					fingerprintExpectedDevices: fingerprintTruth.expected,
					fingerprintGapDevices: Math.max(
						0,
						fingerprintTruth.expected - fingerprintTruth.present,
					),
					faceSourceCount,
					facePresentDevices: faceTruth.present,
					faceExpectedDevices: faceTruth.expected,
					faceGapDevices: Math.max(0, faceTruth.expected - faceTruth.present),
				};
			});
		return {
			perTarget: Array.from(targetMap.values()).map((item) => ({
				...item,
				sourceDeviceNames: Array.from(item.sourceDeviceNames),
			})),
			perSource: Array.from(sourceMap.values()),
			rows,
		};
	}, [
		sdkMergeState.applyAll,
		sdkMergeState.choices,
		sdkMergeState.data,
		selectedSdkMergeUserKeys,
	]);
	const sdkMergeSelectedPotentialWriteCount = sdkMergeSelectedWriteMatrix.rows.reduce(
		(count, row) => count + row.writes,
		0,
	);
	const sdkMergeSelectedFingerprintGapCount = sdkMergeSelectedWriteMatrix.rows.reduce(
		(count, row) => count + row.fingerprintGapDevices,
		0,
	);
	const sdkMergeSelectedFaceGapCount = sdkMergeSelectedWriteMatrix.rows.reduce(
		(count, row) => count + row.faceGapDevices,
		0,
	);
	const sdkMergeAttentionRowCount = sdkMergeReviewRows.length;
	const sdkMergeFilterItems: Array<{ value: SdkMergeFilter; label: string; count: number }> = [
		{ value: "all", label: "Needs review IDs", count: sdkMergeUniqueIssueCount("all") },
		{
			value: "missing",
			label: "Missing from device",
			count: sdkMergeUniqueIssueCount("missing"),
		},
		{
			value: "decision",
			label: "Needs decision",
			count: sdkMergeUniqueIssueCount("decision"),
		},
		{
			value: "fingerprint",
			label: "Fingerprint gaps",
			count: sdkMergeUniqueIssueCount("fingerprint"),
		},
		{
			value: "face",
			label: "Face gaps",
			count: sdkMergeUniqueIssueCount("face"),
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
				? "Device ID records"
				: sdkMergeListMode === "review"
					? "Needs review"
					: sdkMergeListMode === "writes"
						? "Potential writes"
						: sdkMergeFilterItems.find((item) => item.value === sdkMergeFilter)
								?.label || "Needs review IDs";
	const sdkMergeDeviceIssueCounts = useMemo(() => {
		const plan = sdkMergeState.data?.plan;
		const failedByDeviceId = new Map<string, string>();
		for (const error of plan?.errors || plan?.sdkErrors || plan?.unreachableDevices || []) {
			const deviceId = String((error as any)?.deviceId || "").trim();
			if (!deviceId || failedByDeviceId.has(deviceId)) continue;
			failedByDeviceId.set(
				deviceId,
				String((error as any)?.error || (error as any)?.message || "Read failed"),
			);
		}
		for (const device of plan?.devices || []) {
			const deviceId = String((device as any)?.id || "").trim();
			if (!deviceId) continue;
			if (String((device as any)?.readStatus || "").toLowerCase() === "failed") {
				failedByDeviceId.set(deviceId, String((device as any)?.readError || "Read failed"));
			}
		}
		return (plan?.devices || []).map((device) => {
			const deviceId = String(device.id || "");
			const readFailed = failedByDeviceId.has(deviceId);
			const readFromPlan =
				typeof (device as any)?.idsRead === "number"
					? Number((device as any).idsRead)
					: plan?.users.reduce(
							(count, user) =>
								count +
								(user.records.some((record: any) => record.deviceId === device.id)
									? 1
									: 0),
							0,
						) || 0;
			return {
				device,
				read: readFailed ? null : readFromPlan,
				readFailed,
				readError: failedByDeviceId.get(deviceId) || null,
				counts: {
					// Do not invent "all unique IDs missing" when the device never read.
					missing: readFailed ? 0 : sdkMergeUniqueIssueDeviceCount(device.id, "missing"),
					decision: readFailed
						? 0
						: sdkMergeUniqueIssueDeviceCount(device.id, "decision"),
					fingerprint: readFailed
						? 0
						: sdkMergeUniqueIssueDeviceCount(device.id, "fingerprint"),
					face: readFailed ? 0 : sdkMergeUniqueIssueDeviceCount(device.id, "face"),
					card: readFailed ? 0 : sdkMergeUniqueIssueDeviceCount(device.id, "card"),
					ready: readFailed
						? 0
						: sdkMergeRows.filter(
								(row) =>
									row.filter === "ready" &&
									sdkMergeRowMatchesDevice(row, device.id, "ready"),
							).length,
				},
			};
		});
	}, [
		sdkMergeRowMatchesDevice,
		sdkMergeRows,
		sdkMergeState.data,
		sdkMergeUniqueIssueDeviceCount,
	]);
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
	const visibleSdkMergeJob: DeviceUserMergeJobProgress | null =
		(sdkMergeJobId ? sdkMergeJobProgress || sdkMergeLastJob : sdkMergeLastJob) || null;
	const effectiveSdkMergeJob: DeviceUserMergeJobProgress | null =
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
	const sdkMergeJobElapsed = effectiveSdkMergeJob?.startedAt
		? formatDeviceUserSyncElapsed(
				effectiveSdkMergeJob.startedAt,
				effectiveSdkMergeJob.completedAt ||
					(sdkMergeJobIsProcessing ? new Date(sdkMergeJobClock).toISOString() : null),
			)
		: "Not recorded";
	const sdkMergeJobLastChecked = sdkMergeJobProgress
		? formatDateTime(new Date(sdkMergeJobClock).toISOString())
		: "Waiting for first poll";
	const sdkMergeJobLastBackendUpdate: string | null =
		effectiveSdkMergeJob?.heartbeatAt ||
		effectiveSdkMergeJob?.updatedAt ||
		effectiveSdkMergeJob?.completedAt ||
		null;
	const sdkMergeJobBackendAgeSeconds: number | null = sdkMergeJobLastBackendUpdate
		? Math.max(
				0,
				Math.floor(
					(sdkMergeJobClock - new Date(sdkMergeJobLastBackendUpdate).getTime()) / 1000,
				),
			)
		: null;
	const sdkMergeJobWriteMatrix = effectiveSdkMergeJob?.writeMatrix;
	const sdkMergeJobTargetRows = sdkMergeJobWriteMatrix?.perTarget || [];
	const sdkMergeJobSourceRows = sdkMergeJobWriteMatrix?.perSource || [];
	const sdkMergeJobResults = effectiveSdkMergeJob?.results || [];
	const sdkMergeRetainedFingerprintCount = sdkMergeJobResults.filter(
		(result) => result.status === "success" && result.modality === "fingerprint",
	).length;
	const sdkMergeRetainedFaceCount = sdkMergeJobResults.filter(
		(result) => result.status === "success" && result.modality === "face",
	).length;
	const sdkMergeRetainedCardCount = sdkMergeJobResults.filter(
		(result) => result.status === "success" && result.modality === "card",
	).length;
	const sdkMergeJobProgressEvents = effectiveSdkMergeJob?.progressEvents || [];
	const sdkMergeJobCopyFailureSummary = effectiveSdkMergeJob?.copyFailureSummary;
	const sdkMergeJobCopyFailurePairs = Object.entries(sdkMergeJobCopyFailureSummary?.byPair || {})
		.map(([pair, count]) => ({ pair, count: Number(count || 0) }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 6);
	const sdkMergeJobHasTelemetry = Boolean(
		effectiveSdkMergeJob?.updatedAt || sdkMergeJobProgressEvents.length > 0,
	);
	const sdkMergeStageLabels: Record<string, string> = {
		queued: "Queued",
		preparing: "Preparing matrix",
		source_snapshot: "Reading source snapshots",
		source_snapshot_device: "Reading one device",
		source_snapshot_device_done: "Device snapshot saved",
		copy_started: "Copying to target",
		credential_raw_write_started: "Writing physical credential",
		copy_success: "Physical target retained + reread",
		copy_error: "No retained write / needs attention",
		batch_copy_started: "Batch copy started",
		batch_copy_done: "Batch copy finished",
		vm_copy_preflight_started: "Checking VM SDK reachability",
		vm_copy_preflight_done: "VM SDK reachable",
		vm_copy_attempt_started: "VM SDK copy attempt",
		vm_copy_attempt_timeout: "VM SDK copy timed out",
		db_merge_started: "Updating HRIS row",
		db_merge_done: "HRIS row updated",
		user_done: "Selected ID finished",
		reread_started: "Rereading devices",
		reread_done: "Reread finished",
		completed: "Completed",
		completed_with_attention: "Completed with attention",
		failed: "Failed",
		queued_source_custody_recovery: "Queued source custody recovery",
		exporting_source_credential: "Exporting source credential",
		comparing_sources: "Comparing sources",
		resolving_richest_source: "Resolving richest source",
		probing_target_capability: "Probing target capability",
		preparing_writer: "Preparing writer",
		ready_to_write: "Ready to write",
		writing: "Writing",
		rereading_target: "Rereading target",
		physically_retained: "Physically retained",
		retrying_recoverable_failure: "Retrying recoverable failure",
		physical_identity_action_required: "Physical identity action required",
		physical_reenrollment_required: "Physical reenrollment required",
		device_firmware_unsupported: "Device firmware unsupported",
	};
	const sdkMergeJobPhase = sdkMergeJobIsProcessing
		? effectiveSdkMergeJob?.currentStage
			? sdkMergeStageLabels[effectiveSdkMergeJob.currentStage] ||
				effectiveSdkMergeJob.currentStage
			: sdkMergeJobHasTelemetry
				? "Working"
				: "No detailed backend heartbeat yet"
		: effectiveSdkMergeJob?.status === "completed"
			? "Reread completed"
			: effectiveSdkMergeJob?.status === "failed"
				? "Review attention rows"
				: "Waiting for job status";
	const sdkMergeJobSummaryItems = [
		["Planned writes", effectiveSdkMergeJob?.totalWrites ?? sdkMergeRows.length],
		[
			sdkMergeJobIsProcessing ? "Progress estimate" : "Completed",
			effectiveSdkMergeJob?.processedWrites ?? 0,
		],
		["Physically retained (reread)", effectiveSdkMergeJob?.successfulWrites ?? 0],
		["Fingerprint retained", sdkMergeRetainedFingerprintCount],
		["Face retained", sdkMergeRetainedFaceCount],
		["Card retained", sdkMergeRetainedCardCount],
		["Already matched", effectiveSdkMergeJob?.alreadyConvergedWrites ?? 0],
		["Safe no-write / needs attention", effectiveSdkMergeJob?.failedWrites ?? 0],
	] as const;
	const sdkMergeGapSummaryRows = [
		["Starting gaps", effectiveSdkMergeJob?.startingGapSummary],
		["Ending gaps", effectiveSdkMergeJob?.endingGapSummary],
		["Physically closed delta", effectiveSdkMergeJob?.gapDelta],
	] as const;
	const sdkMergeGapTargetIds = Array.from(
		new Set(
			sdkMergeGapSummaryRows.flatMap(([, summary]) =>
				Object.keys(summary?.perTarget || {}),
			),
		),
	);
	const sdkMergeJobScopeItems = sdkMergeJobWriteMatrix
		? sdkMergeJobWriteMatrix.mode === "credentials"
			? [
					[
						"Selected credential writes",
						sdkMergeJobWriteMatrix.selectedCredentialWrites,
					],
					["Credential attempts", sdkMergeJobWriteMatrix.totalWrites],
					["Fingerprint writes", sdkMergeJobWriteMatrix.fingerprintWrites],
					["Face writes", sdkMergeJobWriteMatrix.faceWrites],
				]
			: [
					["Selected unique IDs", sdkMergeJobWriteMatrix.selectedUniqueIds],
					["Peer copy attempts", sdkMergeJobWriteMatrix.totalWrites],
					["Fingerprint gaps at start", sdkMergeJobWriteMatrix.fingerprintGaps],
					["Face gaps at start", sdkMergeJobWriteMatrix.faceGaps],
				]
		: [];
	const sdkMergeLatestEvents = sdkMergeJobProgressEvents.slice(-8).reverse();
	const sdkMergeCurrentEvent =
		[...sdkMergeJobProgressEvents]
			.reverse()
			.find((event) =>
				[
					"copy_started",
					"batch_copy_started",
					"vm_copy_preflight_started",
					"vm_copy_preflight_done",
					"vm_copy_attempt_started",
					"vm_copy_attempt_timeout",
					"copy_success",
					"copy_error",
					"db_merge_started",
					"db_merge_done",
					"user_done",
				].includes(String(event?.stage || "")),
			) || null;
	const sdkMergeCurrentCredentialStages = Array.isArray(
		(sdkMergeCurrentEvent as any)?.credentialStages,
	)
		? ((sdkMergeCurrentEvent as any).credentialStages as unknown[])
				.map((stage) => String(stage || "").trim())
				.filter(Boolean)
		: [];
	const sdkMergeCurrentTargetNames = Array.isArray(
		(sdkMergeCurrentEvent as any)?.targetDeviceNames,
	)
		? ((sdkMergeCurrentEvent as any).targetDeviceNames as unknown[])
				.map((name) => String(name || "").trim())
				.filter(Boolean)
		: (sdkMergeCurrentEvent as any)?.targetDeviceName
			? [String((sdkMergeCurrentEvent as any).targetDeviceName)]
			: [];
	const sdkMergeCurrentWorkItems = sdkMergeCurrentEvent
		? [
				[
					"Employee now",
					(sdkMergeCurrentEvent as any).vendorUserId ||
						(effectiveSdkMergeJob?.currentUserKey || "").replace(/^vendor:/, "") ||
						"Waiting",
				],
				[
					"Source",
					(sdkMergeCurrentEvent as any).sourceDeviceName ||
						(sdkMergeCurrentEvent as any).sourceDeviceId ||
						"Waiting",
				],
				[
					"Targets",
					sdkMergeCurrentTargetNames.length
						? sdkMergeCurrentTargetNames.join(", ")
						: (sdkMergeCurrentEvent as any).targetDeviceName ||
							(effectiveSdkMergeJob?.currentTargetDeviceId
								? effectiveSdkMergeJob.currentTargetDeviceId
								: "Batch/session"),
				],
				[
					"Credential stage",
					sdkMergeCurrentCredentialStages.length
						? sdkMergeCurrentCredentialStages.join(" + ")
						: sdkMergeStageLabels[
								String(
									(sdkMergeCurrentEvent as any)?.operationTelemetry?.stage ||
										"",
								)
							] || "User row / HRIS metadata",
				],
				[
					"Writer",
					(sdkMergeCurrentEvent as any)?.operationTelemetry
						?.writerStrategy ||
						(sdkMergeCurrentEvent as any)?.strategy ||
						"Preparing",
				],
			]
		: [];
	const sdkMergeJobSummary = effectiveSdkMergeJob
		? sdkMergeJobIsProcessing
			? sdkMergeJobHasTelemetry
				? "The UI is polling the server job. Physically retained increases only after a target reread proves the credential stayed on the panel. Gap totals refresh after the terminal five-device reread."
				: "This job was started before detailed merge telemetry was available. The UI is polling, but the backend has not returned per-target results or a live heartbeat for this job."
			: effectiveSdkMergeJob.status === "failed" &&
				  Number(sdkMergeJobCopyFailureSummary?.total || 0) > 0
				? `${mergeMetricValue(effectiveSdkMergeJob.successfulWrites)} writes applied, ${mergeMetricValue(
						effectiveSdkMergeJob.alreadyConvergedWrites || 0,
					)} already matched; ${mergeMetricValue(
						effectiveSdkMergeJob.failedWrites,
					)} need attention. Backend grouped ${mergeMetricValue(
						sdkMergeJobCopyFailureSummary?.total || 0,
					)} copy failures by source and target.`
				: `${mergeMetricValue(effectiveSdkMergeJob.successfulWrites)} writes applied, ${mergeMetricValue(
						effectiveSdkMergeJob.alreadyConvergedWrites || 0,
					)} already matched, ${mergeMetricValue(
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
				const rawEvidencePresent =
					conflict.field === "fingerprint"
						? richestRecord?.biometricEvidence?.fingerprint?.status ===
							"raw_blob_present"
						: conflict.field === "face"
							? richestRecord?.biometricEvidence?.face?.status === "raw_blob_present"
							: true;
				const choice = !rawEvidencePresent
					? "KEEP"
					: conflict.deviceA.id === richestDeviceId
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
		const n = Object.values(choices).reduce(
			(sum, row) => sum + Object.keys(row || {}).length,
			0,
		);
		setSdkMergeState((current) => ({
			...current,
			applyAll: undefined,
			choices,
			message: `Auto-resolved ${n} decision(s) from richest sources (default). You can still change A/B/KEEP manually before apply.`,
		}));
		setSdkMergeFilter("decision");
	};
	const openSdkUserMergeConfirm = () => {
		if (!sdkMergeCanApply) return;
		setSdkMergeConfirmOpen(true);
	};
	const selectRecommendedCredentialWrites = () => {
		setSelectedSdkMergeCredentialWriteIds(
			Object.fromEntries(sdkMergeSelectableCredentialWrites.map((write) => [write.id, true])),
		);
		setSdkMergeState((current) => ({
			...current,
			message: sdkMergeSelectableCredentialWrites.length
				? `${mergePlural(sdkMergeSelectableCredentialWrites.length, "credential operation")} selected from readable raw/export evidence.`
				: "No credential operations have readable raw/export evidence yet. Count-only rows remain blocked from UI selection.",
		}));
	};

	const startCredentialRecovery = async () => {
		const planId = sdkMergeState.data?.planId;
		if (!planId) return;
		try {
			const job = await startHikvisionCredentialRecoveryMutation.mutateAsync(planId);
			setCredentialRecoveryJobId(job.id);
			window.localStorage.setItem(CREDENTIAL_RECOVERY_JOB_STORAGE_KEY, job.id);
			toast.success(`Credential recovery ${job.id} started`);
		} catch (error: any) {
			toast.error(error?.message || "Credential recovery could not be started");
		}
	};
	const applySdkCredentialMerge = async () => {
		if (
			!sdkMergeState.data ||
			!sdkMergeSelectedCredentialWrites.length ||
			sdkMergeBlockingCount > 0
		)
			return;
		setSdkMergeCredentialConfirmOpen(false);
		setSdkMergeState((current) => ({
			...current,
			status: "review",
			message: `Starting credential-only job for ${mergePlural(sdkMergeSelectedCredentialWrites.length, "target operation")}.`,
		}));
		try {
			const result = await startHikvisionSdkUserMergeJobMutation.mutateAsync({
				planId: sdkMergeState.data.planId,
				mode: "credentials",
				selectedCredentialWriteIds: sdkMergeSelectedCredentialWrites.map(
					(write) => write.id,
				),
			});
			setSdkMergeJobId(result.jobId);
			setSdkMergeLastJob(result.progress);
			setSdkMergeHandledJobId(null);
			setSdkMergeDismissedJobId(null);
			updateSearchParams((next) => next.set("mergeJobId", result.jobId));
			setSdkMergeState((current) => ({
				...current,
				status: "review",
				message: result.progress?.message || "Credential-only merge job started.",
			}));
		} catch (error: any) {
			setSdkMergeState((current) => ({
				...current,
				status: "error",
				message: error?.message || "Failed to start credential-only merge job.",
			}));
		}
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
		setSdkMergeConfirmOpen(false);
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
		setSdkMergeConfirmOpen(false);
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
	const runBulkDeviceUserSync = async (modeOverride?: DeviceUserSyncMode) => {
		if (syncCenterDevices.length === 0) {
			toast.error("No configured devices are available to sync");
			return;
		}
		const requestedMode = modeOverride || bulkDeviceUserSyncMode;
		const request =
			requestedMode === "needs_attention_only"
				? {
						mode: "needs_attention_only" as const,
						deviceIds: needsAttentionDeviceIds,
					}
				: requestedMode === "peer_converge"
					? {
							mode: "peer_converge" as const,
						}
					: requestedMode === "biometrics_only"
						? {
								mode: "biometrics_only" as const,
								deviceIds: selectedDeviceId ? [selectedDeviceId] : undefined,
							}
						: {
								mode: "full_refresh" as const,
							};
		if (requestedMode === "needs_attention_only" && needsAttentionDeviceIds.length === 0) {
			setBulkDeviceUserSyncState({
				open: false,
				status: "idle",
				message: "",
				lastProgress: null,
			});
			toast.info("Device users already look aligned", {
				description: "No mismatch refresh was started.",
			});
			return;
		}
		setBulkDeviceUserSyncState({
			open: true,
			status: "starting",
			message:
				requestedMode === "needs_attention_only"
					? "Starting the mismatch refresh."
					: requestedMode === "peer_converge"
						? "Starting cross-device convergence."
						: requestedMode === "biometrics_only"
							? "Building missing-record matrix for raw blobs only."
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
	const mergeDeviceUserSyncReviewMatrix = (previewMatrix: any, dryRunMatrix: any) => {
		if (!previewMatrix) return dryRunMatrix || null;
		if (!dryRunMatrix) return previewMatrix;
		const mergedCounts = {
			...(dryRunMatrix.counts || {}),
			...(previewMatrix.counts || {}),
			missing_raw_fingerprint_blob: Math.max(
				Number(previewMatrix.counts?.missing_raw_fingerprint_blob || 0),
				Number(dryRunMatrix.counts?.missing_raw_fingerprint_blob || 0),
			),
			missing_raw_face_blob: Math.max(
				Number(previewMatrix.counts?.missing_raw_face_blob || 0),
				Number(dryRunMatrix.counts?.missing_raw_face_blob || 0),
			),
		};
		return {
			...dryRunMatrix,
			...previewMatrix,
			counts: mergedCounts,
			buckets: (previewMatrix.buckets || dryRunMatrix.buckets || []).map((bucket: any) => ({
				...bucket,
				count: Number(mergedCounts[bucket.key] || 0),
			})),
			sourceReadRequired:
				Boolean(previewMatrix.sourceReadRequired) ||
				Boolean(dryRunMatrix.sourceReadRequired),
			jobStages: Array.from(
				new Set([...(previewMatrix.jobStages || []), ...(dryRunMatrix.jobStages || [])]),
			),
		};
	};

	const openDeviceUserSyncReview = async (deviceIdOverride?: string) => {
		const targetDeviceId = deviceIdOverride || selectedDeviceId;
		if (!targetDeviceId) {
			toast.error("Select a device before syncing users");
			return;
		}
		if (deviceIdOverride) setSelectedDeviceId(deviceIdOverride);
		setDeviceUserSyncState({
			open: true,
			status: "syncing",
			message: "Reading current sync preview before review.",
		});
		try {
			const [previewResponse, dryRunPlan] = await Promise.all([
				deviceService.getDeviceSyncPreview({
					deviceId: targetDeviceId,
				}),
				deviceService.startDeviceUserSyncJob({
					mode: DEFAULT_BULK_DEVICE_USER_SYNC_MODE,
					deviceIds: [targetDeviceId],
					dryRun: true,
				}),
			]);
			const preview =
				previewResponse.devices.find((row) => row.deviceId === targetDeviceId) ||
				previewResponse.devices[0];
			setDeviceUserSyncState({
				open: true,
				status: "review",
				message:
					dryRunPlan.executionPlan?.sourceReadSkipped === true
						? "Dry-run matrix scoped the fastest valid sync plan."
						: "Dry-run matrix found source evidence is needed before sync.",
				preview: {
					...preview,
					syncDecisionMatrix: mergeDeviceUserSyncReviewMatrix(
						preview?.syncDecisionMatrix,
						dryRunPlan.decisionMatrix,
					),
				},
			});
			void refetchSyncPreview();
		} catch (error: any) {
			setDeviceUserSyncState({
				open: true,
				status: "error",
				message: error?.message || "Unable to read device sync preview.",
			});
		}
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
			message: "Queuing the fastest valid device-user plan from the decision matrix.",
		}));
		try {
			const requestedMode = deviceUserSyncDecisionMatrix?.selectedFastPlan || "full_refresh";
			const result = await startDeviceUserSyncJobMutation.mutateAsync({
				mode: requestedMode,
				deviceIds: [selectedDeviceId],
			});
			if (!result.jobId) throw new Error("Device-user sync did not return a job id");
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

	const openDeleteDeviceUser = (deviceUser: VisibleDeviceUserRow) => {
		const selectedTargets = selectedDeletableDeviceUserRows.filter((row) =>
			selectedExportVendorUserIdSet.has(row.vendorUserId),
		);
		if (
			selectedTargets.length > 0 &&
			selectedTargets.some((row) => row.vendorUserId === deviceUser.vendorUserId)
		) {
			setDeleteTarget(null);
			setDeleteSelectedTargets(selectedTargets);
			return;
		}
		setDeleteTarget(deviceUser);
		setDeleteSelectedTargets([]);
	};

	const openDeleteSelectedDeviceUsers = () => {
		if (selectedDeletableDeviceUserRows.length === 0) {
			toast.error("Select unlinked device users before deleting");
			return;
		}
		setDeleteTarget(null);
		setDeleteSelectedTargets(selectedDeletableDeviceUserRows);
	};

	const confirmDeleteDeviceUser = async () => {
		if (!selectedDeviceId) {
			toast.error("Select a device before deleting");
			return;
		}
		if (deleteSelectedTargets.length > 0) {
			const vendorUserIds = deleteSelectedTargets.map((row) => row.vendorUserId);
			try {
				const result = await deleteDeviceUsersMutation.mutateAsync({
					deviceId: selectedDeviceId,
					vendorUserIds,
					execute: true,
				});
				const deletedIds = result.results
					.filter((row) => row.ok)
					.map((row) => row.vendorUserId);
				setSelectedExportVendorUserIds((current) =>
					current.filter((vendorUserId) => !deletedIds.includes(vendorUserId)),
				);
				setRecentDeletedDeviceUser({
					vendorUserId: deletedIds.slice(0, 3).join(", "),
					displayName:
						deletedIds.length === 1
							? deleteSelectedTargets[0]?.displayName || null
							: null,
					sourceDeleted: result.results
						.filter((row) => row.ok)
						.every((row) => row.data?.after?.sourceFound === false),
					hrisDeleted: result.results
						.filter((row) => row.ok)
						.every((row) => row.data?.after?.hrisFound === false),
					count: result.deleted,
					failed: result.failed,
				});
				setDeleteSelectedTargets([]);
			} catch (error: any) {
				toast.error(error?.message || "Failed to delete selected device users");
			}
			return;
		}
		if (!deleteTarget) return;
		const vendorUserId = String(deleteTarget.vendorUserId || "").trim();
		if (!vendorUserId) {
			toast.error("Device user ID is required");
			return;
		}
		try {
			const result = await deleteDeviceUserMutation.mutateAsync({
				deviceId: selectedDeviceId,
				vendorUserId,
				execute: true,
				confirmation: vendorUserId,
			});
			setRecentDeletedDeviceUser({
				vendorUserId,
				displayName: deleteTarget.displayName || null,
				sourceDeleted: result?.after?.sourceFound === false,
				hrisDeleted: result?.after?.hrisFound === false,
			});
			setSelectedExportVendorUserIds((current) =>
				current.filter((selectedVendorUserId) => selectedVendorUserId !== vendorUserId),
			);
			setDeleteTarget(null);
		} catch (error: any) {
			toast.error(error?.message || "Failed to delete device user");
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
			jobId: null,
			jobStatus: null,
			jobStage: null,
			jobMessage: null,
			jobElapsedMs: null,
			jobEvents: [],
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

	const formatPeerCopyStageLabel = (stage?: string | null) => {
		const key = String(stage || "").trim();
		const labels: Record<string, string> = {
			queued: "Queued",
			starting: "Starting",
			source_refresh_retry_wait: "Waiting for source refresh / tunnel",
			vm_copy_preflight_started: "Checking VM / device reachability",
			vm_copy_preflight_done: "Reachability OK — preparing copy",
			vm_copy_attempt_started: "Writing on peer via VM SDK",
			vm_copy_attempt_finished: "VM write attempt finished",
			vm_copy_attempt_timeout: "VM write timed out (retrying strategy)",
			credential_raw_write_started: "Writing biometrics",
			target_single_user_refresh: "Re-reading target user",
			peer_link_mirror: "Mirroring HRIS link",
			completed: "Completed",
			completed_with_attention: "Completed with some failures",
			failed: "Failed",
			worker_stale: "Job went stale (API may have restarted)",
			processing: "In progress",
		};
		return labels[key] || key || "Working";
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
			const modalities = [
				copyDeviceUserState.includeFingerprints ? "fingerprints" : null,
				copyDeviceUserState.includeFaceRecognition ? "face" : null,
			]
				.filter(Boolean)
				.join(" + ");
			setCopyDeviceUserStatusMessage(
				`Starting durable peer-copy job${modalities ? ` (${modalities})` : ""}. Face/fingerprint writes can take several minutes — progress updates below.`,
			);
			setCopyDeviceUserState((current) => ({
				...current,
				jobId: null,
				jobStatus: "queued",
				jobStage: "queued",
				jobMessage: "Starting job…",
				jobElapsedMs: 0,
				jobEvents: [],
			}));

			// Job-based path: mutation alone cannot stream multi-minute FP/face progress.
			const started = await deviceService.startHikvisionPeerCopyJob({
				sourceDeviceId: selectedDeviceId,
				targetDeviceIds,
				employeeNo: sourceDeviceUser.vendorUserId,
				includeFingerprints: copyDeviceUserState.includeFingerprints,
				includeFaceRecognition: copyDeviceUserState.includeFaceRecognition,
			});
			const jobId = String(started?.jobId || "").trim();
			if (!jobId) {
				throw new Error("Peer-copy job did not return a jobId");
			}
			setCopyDeviceUserState((current) => ({
				...current,
				jobId,
				jobStatus: "processing",
				jobStage: "starting",
				jobMessage: started?.hint || "Job started — polling progress…",
			}));
			setCopyDeviceUserStatusMessage(
				`Job ${jobId.slice(0, 8)}… running. Keep this modal open until status is completed.`,
			);

			const terminal = new Set([
				"completed",
				"completed_with_attention",
				"failed",
			]);
			let job: any = null;
			const maxPolls = 180; // ~6 min at 2s; stale server guard also applies
			for (let poll = 0; poll < maxPolls; poll += 1) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
				job = await deviceService.getHikvisionPeerCopyJob(jobId);
				const status = String(job?.status || "");
				const stage = String(job?.currentStage || job?.stage || "");
				const message = String(job?.message || "");
				const events = Array.isArray(job?.progressEvents) ? job.progressEvents : [];
				setCopyDeviceUserState((current) => ({
					...current,
					jobId,
					jobStatus: status,
					jobStage: stage,
					jobMessage: message,
					jobElapsedMs: Number(job?.elapsedMs || 0) || null,
					jobEvents: events.slice(-12).map((event: any) => ({
						stage: event?.stage,
						message: event?.message || event?.error,
						at: event?.at,
					})),
				}));
				setCopyDeviceUserStatusMessage(
					message ||
						`${formatPeerCopyStageLabel(stage)} (${status || "processing"})`,
				);
				if (terminal.has(status)) break;
			}
			if (!job || !terminal.has(String(job?.status || ""))) {
				throw new Error(
					"Peer-copy job is still running or stopped updating. Check network/VM, then retry failed targets.",
				);
			}

			const successfulTargets: Array<{ id: string; label: string }> = [];
			let syntheticPeerCopies = 0;
			const failedTargets: Array<{ id: string; label: string; error: string }> = [];
			const resultRows = Array.isArray(job?.results) ? job.results : [];
			for (const targetResult of resultRows) {
				const targetDeviceId = String(targetResult?.targetDevice?.id || "");
				const targetLabel =
					copyTargetDeviceOptions.find((option) => option.value === targetDeviceId)
						?.label ||
					targetResult?.targetDevice?.name ||
					targetDeviceId;
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
						error: describeCopyError(targetResult?.error || job?.error),
					});
				}
			}
			// If job completed with summary only (no results array), use summary.
			if (resultRows.length === 0 && String(job?.status) === "completed") {
				for (const id of targetDeviceIds) {
					const label =
						copyTargetDeviceOptions.find((option) => option.value === id)?.label || id;
					successfulTargets.push({ id, label });
				}
			}
			if (successfulTargets.length === 0) {
				setCopyDeviceUserState((current) => ({
					...current,
					open: true,
					applyToAllPeers: false,
					targetDeviceId: targetDeviceIds[0] || current.targetDeviceId,
					successfulTargets,
					failedTargets:
						failedTargets.length > 0
							? failedTargets
							: targetDeviceIds.map((id) => ({
									id,
									label:
										copyTargetDeviceOptions.find((o) => o.value === id)?.label ||
										id,
									error: describeCopyError(job?.error || job?.message),
								})),
				}));
				setCopyDeviceUserStatusMessage(
					job?.message ||
						"No peer copy finished. The source or selected targets are not reachable through the VM SDK path right now.",
				);
				throw new Error(
					failedTargets[0]?.error || job?.error || job?.message || "Failed to copy device user",
				);
			}
			if (failedTargets.length > 0 || String(job?.status) === "completed_with_attention") {
				setCopyDeviceUserState((current) => ({
					...current,
					open: true,
					applyToAllPeers: false,
					targetDeviceId: failedTargets[0]?.id || current.targetDeviceId,
					successfulTargets,
					failedTargets,
					jobStatus: job?.status,
					jobStage: job?.currentStage,
					jobMessage: job?.message,
				}));
				toast.warning(
					`Copied to ${successfulTargets.length} of ${targetDeviceIds.length} peer devices.`,
					{
						description: failedTargets[0]
							? `${failedTargets[0]?.label}: ${failedTargets[0]?.error}`
							: job?.message,
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
			}
			toast.success(
				targetDeviceIds.length > 1
					? `Copied to ${targetDeviceIds.length} peer devices`
					: "Copied to peer device",
			);
			setCopyDeviceUserStatusMessage("");
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
				jobId: null,
				jobStatus: null,
				jobStage: null,
				jobMessage: null,
				jobElapsedMs: null,
				jobEvents: [],
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
	const countMetricValue = (
		value: unknown,
		preview?: DeviceSyncPreviewRow,
		options: { pending?: boolean; unavailableLabel?: string } = {},
	) => {
		if (options.pending) return "Checking...";
		if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString();
		if (!preview) return "Not checked";
		if (preview.status === "saved_preview") {
			return options.unavailableLabel || "Unavailable";
		}
		if (preview.error || preview.status === "source_unavailable") {
			return options.unavailableLabel || "Unavailable";
		}
		return "Not checked";
	};
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
	const isSyncPreviewPending =
		(isLoadingSyncPreview || isFetchingSyncPreview) && devices.length > 0;
	const syncCenterDevices: SyncCenterDeviceItem[] = devices.map((device: any) => {
		const preview = previewByDeviceId.get(device.id);
		const healthEntry = syncCenterHealth.get(device.id);
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
			: preview.status === "user_count_ready"
				? "user_count_ready"
				: hasError || hasFailed
					? "needs_attention"
					: hasMissing
						? "needs_sync"
						: preview.status || "synced";
		return { device, preview, healthEntry, vendor, status };
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
	const deviceUserSyncReviewPreview =
		deviceUserSyncState.preview || selectedSyncCenterItem?.preview;
	const syncCenterHasHikvisionDevices = syncCenterDevices.some(
		(item) => item.vendor === "Hikvision",
	);
	const hikvisionListenerRunning = Boolean(hikvisionListenerStatus?.running);
	const isInitialListenerCheck = !hikvisionListenerStatus && isLoadingHikvisionListenerStatus;
	const hikvisionSdkState = String(hikvisionListenerStatus?.sdk?.state || "unknown").trim();
	const hikvisionSdkReceiving = Boolean(hikvisionListenerStatus?.sdk?.receivingCallbacks);
	const hikvisionSdkArmed = Boolean(hikvisionListenerStatus?.sdk?.armed);
	const hikvisionListenerUnavailable = Boolean(
		!isLoadingHikvisionListenerStatus &&
		(hikvisionListenerStatusError ||
			!hikvisionListenerStatus?.control?.available ||
			hikvisionListenerStatus?.error),
	);
	const hikvisionListenerToneClass = isInitialListenerCheck
		? "border-slate-200 bg-slate-50 text-slate-950"
		: hikvisionSdkReceiving || hikvisionSdkArmed
			? "border-emerald-200 bg-emerald-50 text-emerald-950"
			: hikvisionListenerUnavailable
				? "border-red-200 bg-red-50 text-red-950"
				: "border-amber-200 bg-amber-50 text-amber-950";
	const hikvisionListenerTitle = isInitialListenerCheck
		? "Checking status"
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
		// Exact vendor / employee id first (search "19" â†’ User 19 before 198/1198).
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
			// On-device (live source) first â€” matches Hikvision Person Management "recent" feel.
			const leftLive = left.sourceUser ? 0 : 1;
			const rightLive = right.sourceUser ? 0 : 1;
			if (leftLive !== rightLive) return leftLive - rightLive;
			// Newest activity first (lastSynced / created / updated).
			const timeDelta = deviceUserActivityMs(right) - deviceUserActivityMs(left);
			if (timeDelta !== 0) return timeDelta;
			// Prefer later position in live device read (often last page / newest).
			const leftOrder = liveSourceOrderByVendorId.get(String(left.vendorUserId || "")) ?? -1;
			const rightOrder =
				liveSourceOrderByVendorId.get(String(right.vendorUserId || "")) ?? -1;
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

	// From Device Events: /devices?action=device-users&deviceUserDetails=14 â†’ open that user's modal.
	useEffect(() => {
		if (!deviceUserDetailsParam) return;
		if (activePanel !== "users") return;
		const target = String(deviceUserDetailsParam).trim();
		if (!target) return;
		const match =
			visibleDeviceUserRows.find((row) => String(row.vendorUserId || "").trim() === target) ||
			visibleDeviceUserRows.find((row) => String(row.employeeNo || "").trim() === target) ||
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

	// ALWAYS refetch saved HRIS DeviceUser when details open so rawFingerprints/rawFace
	// from DB win over live-source-only / SOURCE_ONLY metadata (operator modal truth).
	useEffect(() => {
		const vendorUserId = detailsDeviceUserVendorUserId;
		const deviceId = String(selectedDeviceId || "").trim();
		if (!vendorUserId || !deviceId) {
			setDetailsDeviceUserSavedLoading(false);
			return;
		}
		let cancelled = false;
		setDetailsDeviceUserSavedLoading(true);
		void (async () => {
			try {
				const response = await deviceService.getDeviceUsers(deviceId, {
					vendorUserId,
					limit: 5,
				});
				const saved =
					response.deviceUsers?.find(
						(u) =>
							String(u.vendorUserId || "").trim() === vendorUserId ||
							String(u.employeeNo || "").trim() === vendorUserId,
					) || response.deviceUsers?.[0];
				if (cancelled || !saved) return;
				const savedHasRaw = Boolean(
					(saved as any)?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data ||
					(saved as any)?.vendorMetadata?.rawFingerprintPresent,
				);
				setDetailsDeviceUser((prev) => {
					if (!prev || String(prev.vendorUserId || "").trim() !== vendorUserId) {
						return prev;
					}
					// Prefer saved vendorMetadata when it carries raw custody.
					const nextVm = savedHasRaw
						? {
								...(prev.vendorMetadata || {}),
								...(saved.vendorMetadata || {}),
							}
						: {
								...(saved.vendorMetadata || {}),
								...(prev.vendorMetadata || {}),
								// Keep any raw already on prev if saved lacks it.
								rawFingerprints:
									(prev.vendorMetadata as any)?.rawFingerprints ||
									(saved.vendorMetadata as any)?.rawFingerprints,
								rawFingerprintPresent:
									(prev.vendorMetadata as any)?.rawFingerprintPresent ??
									(saved.vendorMetadata as any)?.rawFingerprintPresent,
								rawFace:
									(prev.vendorMetadata as any)?.rawFace ||
									(saved.vendorMetadata as any)?.rawFace,
								rawFacePresent:
									(prev.vendorMetadata as any)?.rawFacePresent ??
									(saved.vendorMetadata as any)?.rawFacePresent,
							};
					return {
						...prev,
						status: saved.status || prev.status,
						employeeId: saved.employeeId || prev.employeeId,
						employee: saved.employee || prev.employee,
						lastSyncedAt: saved.lastSyncedAt || prev.lastSyncedAt,
						rawPayload: saved.rawPayload || prev.rawPayload,
						vendorMetadata: nextVm,
						hrisDeviceUser: {
							...(prev.hrisDeviceUser || {}),
							...saved,
							vendorMetadata: nextVm,
						} as any,
					};
				});
			} catch {
				/* keep current row */
			} finally {
				if (!cancelled) setDetailsDeviceUserSavedLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [detailsDeviceUserVendorUserId, selectedDeviceId]);

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
	const selectedDeviceUserRows = visibleDeviceUserRows.filter((row) =>
		selectedExportVendorUserIdSet.has(row.vendorUserId),
	);
	const selectedDeletableDeviceUserRows = selectedDeviceUserRows.filter((row) => !row.employeeId);
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
	const usersAlreadyInHrisCount = Math.min(
		Number(physicalSourceCount || 0),
		Number(physicalHrisUserCount || 0),
	);
	const projectedEmployeeLinkReviewCount = openPhysicalUserCount;
	const fallbackDeviceUserSyncDecisionBuckets = [
		{
			key: "missing_device_user_record",
			label: "Create missing records",
			count: usersToSaveCount,
			why: "Source identity exists, but HRIS has no DeviceUser row for that plain device person ID.",
			canSyncCreate: true,
			defaultIncluded: true,
			filter: "missing_device_user_record",
		},
		{
			key: "missing_employee_link",
			label: "Missing employee links",
			count: projectedEmployeeLinkReviewCount,
			why: "Auto-link only exact unambiguous employee matches; leave the rest for review.",
			canSyncCreate: true,
			defaultIncluded: true,
			filter: "missing_employee_link",
		},
		{
			key: "missing_raw_fingerprint_blob",
			label: "Missing fingerprint raw blobs",
			count: deviceUserSyncReviewPreview?.fingerprintRawMissing ?? 0,
			why: "Try raw fingerData capture only when a live read can plausibly return bytes.",
			canSyncCreate: true,
			defaultIncluded: true,
			filter: "missing_raw_fingerprint_blob",
		},
		{
			key: "missing_raw_face_blob",
			label: "Missing face raw blobs",
			count: deviceUserSyncReviewPreview?.faceRawMissing ?? 0,
			why: "Try raw face/image capture only when the device has evidenced bytes.",
			canSyncCreate: true,
			defaultIncluded: true,
			filter: "missing_raw_face_blob",
		},
		{
			key: "already_present",
			label: "Already present",
			count: usersAlreadyInHrisCount,
			why: "Skip rows already present in HRIS unless a forced repair is selected.",
			canSyncCreate: false,
			defaultIncluded: false,
			filter: "already_present",
		},
	] as const;
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
	const deviceUserSyncDecisionMatrix =
		deviceUserSyncReviewPreview?.syncDecisionMatrix ||
		effectiveDeviceUserSyncJobProgress?.decisionMatrix ||
		null;
	const deviceUserSyncDecisionBuckets = deviceUserSyncDecisionMatrix?.buckets?.length
		? deviceUserSyncDecisionMatrix.buckets
		: fallbackDeviceUserSyncDecisionBuckets;
	const getDeviceUserSyncDecisionCount = (key: string) =>
		Number(
			deviceUserSyncDecisionMatrix?.buckets?.find((bucket) => bucket.key === key)?.count ||
				(deviceUserSyncDecisionMatrix?.counts as any)?.[key] ||
				0,
		);
	const plannedFingerprintRawMissingCount = deviceUserSyncDecisionMatrix
		? getDeviceUserSyncDecisionCount("missing_raw_fingerprint_blob")
		: (deviceUserSyncReviewPreview?.fingerprintRawMissing ??
			deviceUserSyncReviewPreview?.fingerprintEnvelopeMissing);
	const plannedFaceRawMissingCount = deviceUserSyncDecisionMatrix
		? getDeviceUserSyncDecisionCount("missing_raw_face_blob")
		: (deviceUserSyncReviewPreview?.faceRawMissing ??
			deviceUserSyncReviewPreview?.faceEnvelopeMissing);
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
	const deviceUserSyncBiometricFailed = Number(
		effectiveDeviceUserSyncJobProgress?.biometricFailed || 0,
	);
	const deviceUserSyncHasRawGaps =
		deviceUserSyncBiometricFailed > 0 || deviceUserSyncBiometricRemaining > 0;
	const deviceUserSyncJobIsProcessing = effectiveDeviceUserSyncJobStatus === "processing";
	const deviceUserSyncIsPlanningBiometrics =
		deviceUserSyncJobIsProcessing &&
		deviceUserSyncJobMode === "biometrics_only" &&
		deviceUserSyncBiometricTotal === 0;
	const deviceUserSyncJobIsTerminal =
		effectiveDeviceUserSyncJobStatus === "completed" ||
		effectiveDeviceUserSyncJobStatus === "failed" ||
		effectiveDeviceUserSyncJobStatus === "cancelled";
	const deviceUserSyncJobPercent = effectiveDeviceUserSyncJobProgress
		? deviceUserSyncIsPlanningBiometrics
			? 5
			: deviceUserSyncJobIsTerminal &&
				  deviceUserSyncBiometricTotal > 0 &&
				  deviceUserSyncBiometricProcessed >= deviceUserSyncBiometricTotal
				? 100
				: deviceUserSyncBiometricTotal > 0
					? Math.min(
							99,
							Math.round(
								(deviceUserSyncBiometricProcessed / deviceUserSyncBiometricTotal) *
									100,
							),
						)
					: Math.min(
							100,
							Math.round((deviceUserSyncJobProcessed / deviceUserSyncJobTotal) * 100),
						)
		: 0;
	const deviceUserSyncPrimaryResult = effectiveDeviceUserSyncJobProgress?.results?.[0] || null;
	const deviceUserSyncSkipsSourceUserReread =
		hasEffectiveDeviceUserSyncJobProgress &&
		effectiveDeviceUserSyncJobProgress?.decisionMatrix?.sourceReadRequired === false;
	const deviceUserSyncCurrentModality = deviceUserSyncJobIsTerminal
		? deviceUserSyncHasRawGaps
			? "Finished"
			: "Complete"
		: effectiveDeviceUserSyncJobProgress?.currentModality === "fingerprint"
			? "Fingerprint"
			: effectiveDeviceUserSyncJobProgress?.currentModality === "face"
				? "Face"
				: "Preparing";
	const deviceUserSyncCurrentDeviceLabel =
		effectiveDeviceUserSyncJobProgress?.currentDeviceName ||
		deviceUserSyncPrimaryResult?.deviceName ||
		(deviceUserSyncSkipsSourceUserReread ? "Scoped DeviceUser matrix" : null) ||
		(deviceUserSyncIsPlanningBiometrics
			? "Building raw-custody plan"
			: deviceUserSyncJobIsTerminal
				? "Selected device"
				: "Source read only if needed");
	const deviceUserSyncCurrentCredentialLabel = deviceUserSyncJobIsTerminal
		? deviceUserSyncHasRawGaps
			? `${metricValue(deviceUserSyncBiometricFailed)} raw reads failed`
			: "No device raw failures"
		: deviceUserSyncSkipsSourceUserReread
			? "Missing links/raw blobs only"
			: deviceUserSyncIsPlanningBiometrics
				? "Finding missing raw blobs"
				: `${deviceUserSyncCurrentModality} - ${
						effectiveDeviceUserSyncJobProgress?.currentVendorUserId || "-"
					}`;
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
		? deviceUserSyncIsPlanningBiometrics
			? "Planning"
			: deviceUserSyncBiometricTotal > 0
				? metricValue(deviceUserSyncBiometricRemaining)
				: "Live"
		: hasEffectiveDeviceUserSyncJobProgress
			? effectiveDeviceUserSyncJobStatus === "completed"
				? deviceUserSyncHasRawGaps
					? metricValue(deviceUserSyncBiometricFailed || deviceUserSyncBiometricRemaining)
					: "Done"
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
				: effectiveDeviceUserSyncJobStatus === "completed" && !deviceUserSyncHasRawGaps
					? "border-emerald-200 bg-emerald-50 text-emerald-950"
					: "border-orange-200 bg-orange-50 text-orange-950";
	const deviceUserSyncJobFillClass =
		effectiveDeviceUserSyncJobStatus === "failed"
			? "bg-red-600"
			: effectiveDeviceUserSyncJobStatus === "cancelled"
				? "bg-amber-600"
				: effectiveDeviceUserSyncJobStatus === "completed" && !deviceUserSyncHasRawGaps
					? "bg-emerald-600"
					: "bg-orange-600";
	const deviceUserSyncJobTitle =
		effectiveDeviceUserSyncJobStatus === "cancelled"
			? "Sync cancelled"
			: effectiveDeviceUserSyncJobStatus === "failed"
				? "Sync needs attention"
				: effectiveDeviceUserSyncJobStatus === "completed"
					? deviceUserSyncHasRawGaps
						? "Raw custody needs device data"
						: "Sync finished"
					: deviceUserSyncJobIsProcessing
						? deviceUserSyncJobCancelRequested
							? "Cancelling device-user refresh"
							: deviceUserSyncSkipsSourceUserReread
								? "Fast plan: scoped missing work"
								: deviceUserSyncJobMode === "needs_attention_only"
									? "Refreshing mismatches"
									: deviceUserSyncJobMode === "peer_converge"
										? "Making peers match best truth"
										: deviceUserSyncJobMode === "biometrics_only"
											? effectiveDeviceUserSyncJobProgress?.currentStage ||
												"Capturing missing fingerprint raw bytes"
											: deviceUserSyncBiometricTotal > 0
												? effectiveDeviceUserSyncJobProgress?.currentStage ||
													"Capturing missing biometric raw bytes"
												: effectiveDeviceUserSyncJobProgress?.currentStage ||
													"Reading source users needed for identity gaps"
						: "Device-user sync status";
	const bulkDeviceUserSyncSummaryItems = [
		["Captured", effectiveDeviceUserSyncJobProgress?.biometricCaptured ?? 0],
		["Device no-data", effectiveDeviceUserSyncJobProgress?.biometricFailed ?? 0],
		["Already present", effectiveDeviceUserSyncJobProgress?.biometricCached ?? 0],
		["Remaining", deviceUserSyncBiometricRemaining],
	] as const;
	const deviceUserSyncMatrixSummaryItems = [
		["Missing users", getDeviceUserSyncDecisionCount("missing_device_user_record")],
		["Missing links", getDeviceUserSyncDecisionCount("missing_employee_link")],
		[
			"Raw gaps",
			getDeviceUserSyncDecisionCount("missing_raw_fingerprint_blob") +
				getDeviceUserSyncDecisionCount("missing_raw_face_blob"),
		],
		["Already skipped", getDeviceUserSyncDecisionCount("already_present")],
	] as const;
	const deviceUserSyncFailureLog = (
		effectiveDeviceUserSyncJobProgress?.biometricFailureLog || []
	).slice(-6);
	const bulkDeviceUserSyncResults = effectiveDeviceUserSyncJobProgress?.results || [];
	const deviceUserSyncJobSummary = effectiveDeviceUserSyncJobProgress
		? deviceUserSyncJobIsProcessing
			? deviceUserSyncBiometricTotal > 0
				? `${deviceUserSyncCurrentModality} custody for user ${effectiveDeviceUserSyncJobProgress.currentVendorUserId || "-"} on ${effectiveDeviceUserSyncJobProgress.currentDeviceName || "the selected device"}.`
				: deviceUserSyncSkipsSourceUserReread
					? "The decision matrix scoped this run to records Sync can handle now. Full source-user reread and already-present rows are skipped; only missing links and missing raw blobs are queued."
					: deviceUserSyncJobMode === "biometrics_only"
						? "Building missing-record matrix from saved DeviceUser truth; source identity reread is skipped unless deep repair is selected."
						: "Reading source users only because the decision matrix found identity gaps or a full refresh was requested."
			: deviceUserSyncHasRawGaps
				? `${metricValue(effectiveDeviceUserSyncJobProgress.biometricCaptured)} raw payloads captured; ${metricValue(deviceUserSyncBiometricFailed)} raw reads failed or returned no-data from the device.`
				: `${metricValue(effectiveDeviceUserSyncJobProgress.biometricCaptured)} raw biometric payloads captured; no device raw failures reported by this job.`
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
				: bulkDeviceUserSyncMode === "biometrics_only"
					? "Skip source reread and repair missing raw fingerprint and face blobs from saved DeviceUser truth."
					: "Reread every configured device user and refresh saved biometric counts.";
	const bulkDeviceUserSyncScopeItems = [
		["All devices", syncCenterDevices.length],
		["Only mismatches", needsAttentionSyncCenterDevices.length],
		["Best-truth converge", syncCenterDevices.length],
		["Raw blobs only", selectedDeviceId ? 1 : syncCenterDevices.length],
	] as const;
	const getSyncStatusLabel = (status: string) => {
		if (status === "synced") return "Synced";
		if (status === "checking") return "Checking";
		if (status === "needs_sync") return "Needs sync";
		if (status === "needs_attention") return "Needs attention";
		if (status === "user_count_ready") return "User counts ready";
		if (status === "saved_preview") return "Unavailable";
		if (status === "source_total_unavailable") return "Source unavailable";
		return "Not checked";
	};
	const getSyncStatusBadge = (status: string) => {
		if (status === "synced") return "success";
		if (status === "user_count_ready") return "success";
		if (status === "saved_preview") return "secondary";
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
			next.delete("deviceUserDetails");
			next.set("deviceUserPage", "1");
		});
	};
	/**
	 * Deep-link into Sync Center → Device users for a physical device, optionally
	 * open Device user details for a vendor person id (face/FP/card resolve).
	 * Used from peer tally, merge issues, and credential recovery ops.
	 */
	const openDeviceUserDeepLink = (
		deviceId?: string | null,
		vendorUserId?: string | null,
		options?: { preferSourceView?: boolean },
	) => {
		const id = String(deviceId || "").trim();
		const person = String(vendorUserId || "").trim();
		if (!id) return;
		// Drop details for the previous device so the details-open effect rebinds.
		setDetailsDeviceUser(null);
		updateSearchParams((next) => {
			next.set("deviceId", id);
			next.set("syncPanel", "users");
			next.set("action", "device-users");
			// Keep merge deep-link context when operator is resolving from merge/recovery.
			if (next.get("syncPanel") === "users" || next.get("action") === "device-users") {
				next.set("mergeDeviceId", id);
			}
			if (options?.preferSourceView) {
				next.set("deviceUserView", "source");
			} else {
				// Current/shown view so SOURCE_ONLY + HRIS rows both appear with search.
				next.set("deviceUserView", "shown");
			}
			next.delete("deviceUserStatus");
			next.set("deviceUserPage", "1");
			if (person) {
				next.set("deviceUserSearch", person);
				next.set("deviceUserDetails", person);
			} else {
				next.delete("deviceUserSearch");
				next.delete("deviceUserDetails");
			}
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
		isLoadingDeviceUserExportRows ? "Loading..." : `${count} rows`;
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
	const isDeviceUserExportPreviewing = previewDeviceUserExportMutation.isPending;
	const isDeviceUserExportDownloading = exportDeviceUsersMutation.isPending;
	const isDeviceUserExportBusy =
		isLoadingDeviceUserExportRows ||
		isDeviceUserExportPreviewing ||
		isDeviceUserExportDownloading;
	const deviceUserExportActionLabel = isDeviceUserExportDownloading
		? `Creating ${
				deviceUserExportState.format === "json"
					? "package"
					: deviceUserExportState.format === "excel"
						? "Excel workbook"
						: "CSV file"
			}`
		: isDeviceUserExportPreviewing
			? "Checking export readiness"
			: isLoadingDeviceUserExportRows
				? "Loading device users"
				: "Ready to export";
	const deviceUserExportBiometricLoadingLabel = isDeviceUserExportDownloading
		? "Preparing biometric custody data for the download."
		: isDeviceUserExportPreviewing
			? "Checking saved fingerprint and face custody before download."
			: isLoadingDeviceUserExportRows
				? "Loading the selected rows and enrollment counts."
				: "Preview or export will not change the device.";
	const formatDeviceUserExportReadiness = (status?: string | null) => {
		if (!status || status === "not_requested") return "Not requested";
		if (status === "ready" || status === "complete") return "Ready";
		if (status === "spreadsheet_raw_blobs") return "Ready from spreadsheet";
		if (status === "partial_missing_requested_raw_blobs") return "Needs review";
		if (status === "missing_requested_raw_blobs") return "Missing custody data";
		return status.replace(/_/g, " ");
	};
	const escapeCsvValue = (value: unknown) => {
		const text = value === null || value === undefined ? "" : String(value);
		return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	};
	const getSdkMergeCountButtonClass = (isActive: boolean, count: number) => {
		const base = "rounded border px-2 py-1 text-left text-xs font-semibold transition";
		if (isActive) return `${base} border-orange-300 bg-orange-50 text-orange-950`;
		if (count > 0)
			return `${base} border-amber-200 bg-amber-50 text-amber-950 hover:border-amber-300`;
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
		return rows
			.slice(1)
			.map((values) =>
				Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
			);
	};
	const parseCsvNumber = (value: unknown) => {
		const numberValue = Number(value);
		return Number.isFinite(numberValue) ? numberValue : 0;
	};
	const parseCsvBoolean = (value: unknown) => {
		const normalized = String(value || "")
			.trim()
			.toLowerCase();
		return ["true", "yes", "1", "present"].includes(normalized);
	};
	const normalizeRawBiometricBlobValue = (value: unknown) => {
		if (!value) return "";
		if (typeof value === "string") return value.trim();
		try {
			return JSON.stringify(value);
		} catch {
			return "";
		}
	};
	const isRawBiometricStatusValue = (value: string) =>
		["not_enrolled", "missing_raw_blob", "not_requested"].includes(value.trim());
	const escapeRawFingerprintTemplateCell = (value: unknown) =>
		String(value || "")
			.trim()
			.replace(/\\/g, "\\\\")
			.replace(/"/g, '\\"');
	const encodeRawFingerprintBlobCell = (
		templates: any[],
		credentialCount: number,
		status: string,
	) => {
		const rawTemplates = templates
			.map((template: any, index: number) => ({
				fingerPrintId: template?.fingerPrintId ?? template?.fingerPrintID ?? index + 1,
				fingerType: template?.fingerType || "normalFP",
				data: normalizeRawBiometricBlobValue(template?.data || template?.fingerData || ""),
			}))
			.filter((template) => template.data);
		if (rawTemplates.length === 1) return rawTemplates[0].data;
		if (rawTemplates.length > 1) {
			return rawTemplates
				.map((template, index) => {
					const fingerPrintId = Number(template.fingerPrintId || index + 1) || index + 1;
					return `FP${fingerPrintId}("${escapeRawFingerprintTemplateCell(template.data)}")`;
				})
				.join(";");
		}
		if (status) return status;
		return credentialCount > 0 ? "missing_raw_blob" : "not_enrolled";
	};
	const getRawFingerprintBlobCell = (user: any, credentialCount: number) => {
		const templates = Array.isArray(user?.rawBiometricCustody?.fingerprint?.templates)
			? user.rawBiometricCustody.fingerprint.templates
			: [];
		const status = String(user?.rawBiometricCustody?.fingerprint?.status || "").trim();
		return encodeRawFingerprintBlobCell(templates, credentialCount, status);
	};
	const getRawFaceBlobCell = (user: any, credentialCount: number) => {
		const blob = user?.rawBiometricCustody?.face?.blob || {};
		const raw = normalizeRawBiometricBlobValue(
			blob.base64 || blob.facePicture || blob.faceTemplate || "",
		);
		if (raw) return raw;
		const status = String(user?.rawBiometricCustody?.face?.status || "").trim();
		if (status) return status;
		return credentialCount > 0 ? "missing_raw_blob" : "not_enrolled";
	};
	const decodeRawBiometricBlobCell = (value: unknown) => {
		const raw = String(value || "").trim();
		if (!raw || isRawBiometricStatusValue(raw)) return "";
		return raw;
	};
	const decodeRawFingerprintBlobCell = (value: unknown) => {
		const raw = String(value || "").trim();
		if (!raw || isRawBiometricStatusValue(raw)) return [];
		const fromJson = (() => {
			if (!raw.startsWith("[") && !raw.startsWith("{")) return null;
			try {
				const parsed = JSON.parse(raw);
				const list = Array.isArray(parsed)
					? parsed
					: Array.isArray(parsed?.templates)
						? parsed.templates
						: Array.isArray(parsed?.fingerprints)
							? parsed.fingerprints
							: [];
				return list
					.map((item: any, index: number) => ({
						fingerPrintId: item?.fingerPrintId ?? item?.fingerPrintID ?? index + 1,
						fingerType: item?.fingerType || "normalFP",
						data: normalizeRawBiometricBlobValue(
							item?.data || item?.fingerData || item,
						),
					}))
					.filter((item: any) => item.data);
			} catch {
				return null;
			}
		})();
		if (fromJson) return fromJson;
		const patterned = Array.from(raw.matchAll(/FP\s*(\d*)\s*\(\s*"((?:\\.|[^"\\])*)"\s*\)/gi))
			.map((match, index) => ({
				fingerPrintId: Number(match[1] || index + 1) || index + 1,
				fingerType: "normalFP",
				data: match[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim(),
			}))
			.filter((item) => item.data);
		if (patterned.length) return patterned;
		const parts = raw
			.split(/[;,]/)
			.map((part) => part.trim())
			.filter(Boolean);
		return (parts.length > 1 ? parts : [raw]).map((data, index) => ({
			fingerPrintId: index + 1,
			fingerType: "normalFP",
			data,
		}));
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
				const fingerprintRawTemplates = decodeRawFingerprintBlobCell(
					row.rawFingerprintBlob,
				);
				const fingerprintRawTemplateBlob = fingerprintRawTemplates[0]?.data || "";
				const faceRawTemplateBlob = decodeRawBiometricBlobCell(row.rawFaceBlob);
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
					rawFingerprintBlob: String(row.rawFingerprintBlob || "not_requested").trim(),
					rawFaceBlob: String(row.rawFaceBlob || "not_requested").trim(),
					biometricTransferMode: String(
						row.biometricTransferMode ||
							(fingerprintRawTemplates.length || faceRawTemplateBlob
								? "rawPackage"
								: "metadataOnly"),
					).trim(),
					fingerprintRawTemplateBlob,
					fingerprintRawTemplates,
					faceRawTemplateBlob,
					rawBiometricPlaintextPolicy: DEVICE_USER_RAW_BIOMETRIC_PACKAGE_POLICY,
					rawBiometricSource:
						fingerprintRawTemplateBlob || faceRawTemplateBlob
							? "csv_raw_blob_columns"
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
				// CSV files carry the full row set provided by the operator, not a UI page.
				selection: "all",
				status: "all",
			},
			policy: {
				importedFrom: "csv",
				plaintextBiometricExposed: true,
				note: "CSV import carries raw evidenced biometric blobs in rawFingerprintBlob and rawFaceBlob. Missing cells must stay explicit.",
				rawTemplateColumns: DEVICE_USER_BIOMETRIC_CSV_COLUMNS,
			},
			rawBiometricPackage: {
				present: importRows.some((row) =>
					Boolean(row.fingerprintRawTemplateBlob || row.faceRawTemplateBlob),
				),
				requiredForPortableTemplateImport: importRows.some((row) =>
					Boolean(row.fingerprintRawTemplateBlob || row.faceRawTemplateBlob),
				),
				status: importRows.some((row) =>
					Boolean(row.fingerprintRawTemplateBlob || row.faceRawTemplateBlob),
				)
					? "spreadsheet_raw_blobs"
					: "not_present",
				reason: "CSV/Excel raw biometric blob cells are passed through for non-mutating preview and explicit rawPackage execute.",
				plaintextPolicy: DEVICE_USER_RAW_BIOMETRIC_PACKAGE_POLICY,
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
								rawFingerprintBlob: row.rawFingerprintBlob,
								rawFaceBlob: row.rawFaceBlob,
								biometricTransferMode: row.biometricTransferMode,
								fingerprintRawTemplateBlob: row.fingerprintRawTemplateBlob,
								fingerprintRawTemplates: row.fingerprintRawTemplates,
								faceRawTemplateBlob: row.faceRawTemplateBlob,
								rawBiometricPlaintextPolicy: row.rawBiometricPlaintextPolicy,
								rawBiometricSource: row.rawBiometricSource,
							},
						},
					},
					rawBiometricCustody: {
						fingerprint: {
							status: row.fingerprintRawTemplates.length
								? "raw_blob_present"
								: row.rawFingerprintBlob,
							templates: row.fingerprintRawTemplates,
						},
						face: {
							status: row.faceRawTemplateBlob ? "raw_blob_present" : row.rawFaceBlob,
							blob: row.faceRawTemplateBlob
								? { contentType: "image/jpeg", base64: row.faceRawTemplateBlob }
								: null,
						},
						plaintextPolicy: DEVICE_USER_RAW_BIOMETRIC_PACKAGE_POLICY,
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
					rawFingerprintBlob:
						sampleCredentialSummary.fingerprintCount > 0
							? "missing_raw_blob"
							: "not_enrolled",
					rawFaceBlob:
						sampleCredentialSummary.faceCount > 0 ? "missing_raw_blob" : "not_enrolled",
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
					rawFingerprintBlob: "missing_raw_blob",
					rawFaceBlob: "not_enrolled",
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
				void sourceDeviceId;
				void vendorUserId;
				const rawFingerprintBlob = getRawFingerprintBlobCell(
					user,
					Number(credentialSummary.fingerprintCount || 0),
				);
				const rawFaceBlob = getRawFaceBlobCell(
					user,
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
					rawFingerprintBlob,
					rawFaceBlob,
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
					...rows.map((row) =>
						headers.map((header) => escapeCsvValue((row as any)[header])).join(","),
					),
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
		rawBiometricPackage: deviceUserExportState.rawBiometricPackage,
	});
	const getDeviceUserExportBiometricGaps = (payload: DeviceUserExportPayload) => {
		const biometrics = payload.summary?.biometrics;
		const fingerprintMissing = deviceUserExportState.includeFingerprints
			? Math.max(
					Number(biometrics?.fingerprintCountReported || 0) -
						Number((biometrics as any)?.fingerprintRawBlobsCaptured || 0),
					0,
				)
			: 0;
		const faceMissing = deviceUserExportState.includeFaces
			? Math.max(
					Number(biometrics?.faceCountReported || 0) -
						Number((biometrics as any)?.faceRawBlobsCaptured || 0),
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
		const cachedPreview = await previewDeviceUserExportMutation.mutateAsync({
			...buildDeviceUserExportRequest(),
		});
		setDeviceUserExportState((current) => ({
			...current,
			preview: cachedPreview,
			result: null,
		}));
		const biometricGaps = getDeviceUserExportBiometricGaps(cachedPreview);
		void biometricGaps;
		const result = await exportDeviceUsersMutation.mutateAsync({
			...buildDeviceUserExportRequest(),
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
		const missingBiometricRows = Number(result.rawBiometricPackage?.errors?.length || 0);
		if (missingBiometricRows > 0) {
			toast.warning(
				`Export is partial: ${missingBiometricRows} requested biometric row${missingBiometricRows === 1 ? " is" : "s are"} missing raw blobs`,
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
		const preview = await previewDeviceUserImportMutation.mutateAsync({
			targetDeviceId: selectedDeviceId,
			payload,
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

			<Tabs value={activePanel} onValueChange={setActivePanel} className="space-y-4">
				<TabsList className="grid h-auto w-full grid-cols-4 rounded-md bg-slate-100 p-1">
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="users">Device Users</TabsTrigger>
					<TabsTrigger value="logs">Device Logs</TabsTrigger>
					<TabsTrigger value="runs">Sync Runs</TabsTrigger>
				</TabsList>

				{syncCenterHasHikvisionDevices ? (
					<section
						aria-live="polite"
						className={`flex items-center gap-2 rounded-xl border p-2.5 ${hikvisionListenerToneClass}`}>
						<button
							type="button"
							onClick={() => setIsListenerDetailsOpen(true)}
							className="flex min-w-0 flex-1 items-center gap-3 rounded-lg bg-white/80 px-3 py-2 text-left transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
							<div
								className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
									hikvisionSdkReceiving || hikvisionSdkArmed
										? "bg-emerald-100 text-emerald-700"
										: hikvisionListenerUnavailable
											? "bg-red-100 text-red-700"
											: "bg-amber-100 text-amber-700"
								}`}>
								{isInitialListenerCheck ? (
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
										{isInitialListenerCheck
											? "Checking listener status"
											: hikvisionListenerUnavailable
												? "VM status unreachable"
												: hikvisionListenerRunning
													? "VM running"
													: "VM stopped"}
									</span>
									{hikvisionListenerStatus ? (
										<>
											<span className="opacity-40">â€¢</span>
											<span className="truncate">
												{isFetchingHikvisionListenerStatus
													? "Refreshing · "
													: "Checked "}
												{formatSyncCenterTime(
													hikvisionListenerStatus.checkedAt ||
														(hikvisionListenerUpdatedAt
															? new Date(
																	hikvisionListenerUpdatedAt,
																).toISOString()
															: null),
												)}
											</span>
										</>
									) : null}
								</div>
							</div>
							<span className="shrink-0 text-xs font-medium text-slate-500">
								Open
							</span>
						</button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-9 shrink-0 gap-1.5 bg-white"
							disabled={isFetchingHikvisionListenerStatus}
							onClick={() => void refetchHikvisionListenerStatus()}>
							<RefreshCw
								className={`h-4 w-4 ${isFetchingHikvisionListenerStatus ? "animate-spin" : ""}`}
							/>
							<span className="hidden sm:inline">
								{isFetchingHikvisionListenerStatus
									? "Refreshing"
									: "Refresh status"}
							</span>
						</Button>
					</section>
				) : null}

				<TabsContent value="overview" className="m-0 space-y-3">
					{isLoadingDevices && devices.length === 0 ? (
						<div className="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
							<Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
							Loading device listâ€¦ Close is always available if this hangs.
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
								<div
									aria-live="polite"
									className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
									<Loader2 className="mr-2 inline-block h-3.5 w-3.5 animate-spin" />
									Refreshing source counts. Saved values remain visible while
									per-device transport checks settle independently.
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
									.map(({ device, preview, healthEntry, status, vendor }) => {
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
										const sourceUserValue = countMetricValue(
											sourceUserTotal,
											preview,
											{
												pending: isPreviewPending,
											},
										);
										const gapValue = countMetricValue(userGap, preview, {
											pending: isPreviewPending,
										});
										const hrisUserValue = countMetricValue(
											hrisUserTotal,
											preview,
											{
												pending: isPreviewPending,
											},
										);
										const openUserValue = countMetricValue(
											openUserTotal,
											preview,
											{
												pending: isPreviewPending,
											},
										);
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
														variant={
															(healthEntry?.reachability.status ===
															"online"
																? "success"
																: healthEntry?.reachability
																			.status === "offline"
																	? "destructive"
																	: healthEntry?.reachability
																				.status ===
																		  "degraded"
																		? "warning"
																		: getSyncStatusBadge(
																				status,
																			)) as any
														}
														className="inline-flex min-h-6 max-w-full items-center whitespace-normal break-words border border-current/20 px-2 py-0.5 text-left leading-4">
														{healthEntry?.reachability.label ||
															getSyncStatusLabel(status)}
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
																openDeviceUserCount(
																	device.id,
																	"source",
																)
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
																openDeviceUserCount(
																	device.id,
																	"open",
																)
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
															disabled={
																typeof hrisUserTotal !== "number"
															}
															onClick={() =>
																openDeviceUserCount(
																	device.id,
																	"hris",
																)
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
																openDeviceUserCount(
																	device.id,
																	"open",
																)
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
																disabled={healthEntry?.isFetching}
																onClick={() =>
																	void syncCenterHealth.refetch(
																		device.id,
																	)
																}>
																<RefreshCw className="mr-2 h-4 w-4" />
																{healthEntry?.isFetching
																	? "Checking status"
																	: "Retry status"}
															</DropdownMenuItem>
															<DropdownMenuItem
																onClick={() =>
																	openDevicePanel(
																		device.id,
																		"users",
																	)
																}>
																<UserPlus className="mr-2 h-4 w-4" />
																Device users
															</DropdownMenuItem>
															<DropdownMenuItem
																onClick={() =>
																	void openDeviceUserSyncReview(
																		device.id,
																	)
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
																	openDevicePanel(
																		device.id,
																		"runs",
																	)
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
												toast.error(
													"Enter a user ID or name to search devices",
												);
												return;
											}
											void openSdkUserMerge(summaryDeviceSearch);
										}}>
										<div className="relative min-w-0 flex-1">
											<label
												htmlFor="sync-summary-device-search"
												className="sr-only">
												Search device users across available devices
											</label>
											<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
											<input
												id="sync-summary-device-search"
												type="text"
												role="searchbox"
												autoComplete="off"
												value={summaryDeviceSearch}
												onChange={(event) =>
													setSummaryDeviceSearch(event.target.value)
												}
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
										disabled={
											isFetchingSyncPreview || syncCenterHealth.isFetchingAny
										}
										onClick={() => void refreshDeviceUserSummary()}>
										<RefreshCw
											className={`h-4 w-4 shrink-0 ${
												isFetchingSyncPreview ||
												syncCenterHealth.isFetchingAny
													? "animate-spin"
													: ""
											}`}
										/>
										<span className="whitespace-nowrap">
											{isFetchingSyncPreview || syncCenterHealth.isFetchingAny
												? "Refreshing"
												: "Refresh summary"}
										</span>
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
													{countMetricValue(sourceCount, preview, {
														unavailableLabel: "Unavailable",
													})}
												</span>
											</div>
											<div className="flex items-center justify-between gap-2 lg:block">
												<span className="text-xs text-slate-500 lg:hidden">
													Saved in HRIS
												</span>
												<span className="font-semibold text-slate-950">
													{countMetricValue(hrisCount, preview)}
												</span>
											</div>
											<div className="flex items-center justify-between gap-2 lg:block">
												<span className="text-xs text-slate-500 lg:hidden">
													Gap
												</span>
												<span className="font-semibold text-slate-950">
													{countMetricValue(gapCount, preview, {
														unavailableLabel: "Unavailable",
													})}
												</span>
											</div>
											<div className="flex items-center justify-between gap-2 lg:block">
												<span className="text-xs text-slate-500 lg:hidden">
													Needs link
												</span>
												<span className="font-semibold text-slate-950">
													{countMetricValue(openCount, preview)}
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
														selectedSyncCenterItem?.preview
															?.vendorUserCount,
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
										className="h-8 w-8 bg-white p-0 text-red-700 hover:bg-red-50 hover:text-red-800"
										disabled={
											!selectedDeviceId ||
											selectedDeletableDeviceUserRows.length === 0 ||
											deleteDeviceUsersMutation.isPending
										}
										aria-label={
											selectedDeviceUserRows.length > 0 &&
											selectedDeletableDeviceUserRows.length === 0
												? "Selected users are linked and cannot be deleted"
												: "Delete selected device users"
										}
										title={
											selectedDeviceUserRows.length > 0 &&
											selectedDeletableDeviceUserRows.length === 0
												? "Unlink selected users before deleting"
												: selectedDeletableDeviceUserRows.length
													? `Delete ${selectedDeletableDeviceUserRows.length} selected`
													: "Select unlinked device users to delete"
										}
										onClick={openDeleteSelectedDeviceUsers}>
										<Trash2 className="h-4 w-4" />
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
											!selectedDeviceId ||
											startDeviceUserSyncJobMutation.isPending
										}
										onClick={() =>
											hasEffectiveDeviceUserSyncJobProgress
												? openBulkDeviceUserSyncReview()
												: void openDeviceUserSyncReview()
										}>
										{deviceUserSyncJobIsProcessing ||
										startDeviceUserSyncJobMutation.isPending ? (
											<Loader2 className="h-4 w-4 shrink-0 animate-spin" />
										) : (
											<RefreshCw className="h-4 w-4 shrink-0" />
										)}
										<span className="whitespace-nowrap">
											{hasEffectiveDeviceUserSyncJobProgress
												? "Sync status"
												: "Review sync"}
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
							{hasScopedDeviceUserVendorIds ? (
								<div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
									Saved HRIS DeviceUser filter: vendor person IDs 0-20 only. Live
									device reads are not used for this bounded view.
								</div>
							) : null}

							{recentDeletedDeviceUser ? (
								<div className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
									<div>
										<span className="font-semibold">
											{recentDeletedDeviceUser.count &&
											recentDeletedDeviceUser.count > 1
												? `Deleted ${recentDeletedDeviceUser.count} selected device users`
												: `Deleted ${recentDeletedDeviceUser.displayName || "device user"} (${recentDeletedDeviceUser.vendorUserId})`}
										</span>
										<span className="mt-1 block text-xs text-emerald-800">
											Device:{" "}
											{recentDeletedDeviceUser.sourceDeleted
												? "not found"
												: "needs check"}{" "}
											Â· HRIS row:{" "}
											{recentDeletedDeviceUser.hrisDeleted
												? "removed"
												: "needs check"}
											{recentDeletedDeviceUser.failed
												? ` Â· ${recentDeletedDeviceUser.failed} selected users failed`
												: ""}
										</span>
									</div>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-8 border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-100"
										onClick={() => setRecentDeletedDeviceUser(null)}>
										Dismiss
									</Button>
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
											pagedDeviceUserRows.map((deviceUser) => {
												const deletingVendorUserId = String(
													(deleteDeviceUserMutation.variables as any)
														?.vendorUserId || "",
												).trim();
												const bulkDeletingVendorUserIds = new Set(
													(
														(deleteDeviceUsersMutation.variables as any)
															?.vendorUserIds || []
													).map((value: unknown) =>
														String(value || "").trim(),
													),
												);
												const isDeletingThisDeviceUser =
													(deleteDeviceUserMutation.isPending &&
														deletingVendorUserId ===
															String(
																deviceUser.vendorUserId || "",
															).trim()) ||
													(deleteDeviceUsersMutation.isPending &&
														bulkDeletingVendorUserIds.has(
															String(
																deviceUser.vendorUserId || "",
															).trim(),
														));
												return (
													<tr
														key={deviceUser.key}
														className="align-middle">
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
																		{deviceUser.employee
																			.fullName ||
																			deviceUser.employee
																				.employeeId}
																	</p>
																	<p className="text-xs text-slate-500">
																		{
																			deviceUser.employee
																				.employeeId
																		}
																	</p>
																</div>
															) : isDeletingThisDeviceUser ? (
																<span className="inline-flex items-center gap-1.5 text-red-700">
																	<Loader2 className="h-3.5 w-3.5 animate-spin" />
																	Deleting device user
																</span>
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
																		(isDeletingThisDeviceUser
																			? "destructive"
																			: getDeviceUserBadgeVariant(
																					deviceUser.status,
																				)) as any
																	}
																	className="h-6 items-center">
																	{isDeletingThisDeviceUser
																		? "Deleting"
																		: getDeviceUserStatusLabel(
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
																			disabled={
																				isDeletingThisDeviceUser
																			}
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
																					void openDeviceUserSyncReview()
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
																						unlinkDeviceUserMutation.isPending ||
																						isDeletingThisDeviceUser
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
																		<DropdownMenuSeparator />
																		<DropdownMenuItem
																			disabled={
																				isDeletingThisDeviceUser ||
																				Boolean(
																					deviceUser.employeeId,
																				)
																			}
																			className="text-red-700 focus:text-red-700"
																			onClick={() =>
																				openDeleteDeviceUser(
																					deviceUser,
																				)
																			}>
																			<Trash2 className="mr-2 h-4 w-4" />
																			{deviceUser.employeeId
																				? "Unlink before delete"
																				: selectedDeletableDeviceUserRows.length >
																							1 &&
																					  selectedExportVendorUserIdSet.has(
																							deviceUser.vendorUserId,
																					  )
																					? `Delete ${selectedDeletableDeviceUserRows.length} selected`
																					: "Delete from device"}
																		</DropdownMenuItem>
																	</DropdownMenuContent>
																</DropdownMenu>
															</div>
														</td>
													</tr>
												);
											})
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
				title={
					hasEffectiveDeviceUserSyncJobProgress
						? "Device-user sync status"
						: "Sync device users"
				}
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
								<div className="overflow-hidden rounded-md border border-slate-200 bg-white">
									<div className="border-b border-slate-200 px-3 py-2">
										<div className="text-sm font-semibold text-slate-950">
											What Sync can fix
										</div>
										<div className="mt-0.5 text-xs text-slate-600">
											The matrix uses saved HRIS DeviceUser truth first, then
											reads the source only when identity gaps need device
											evidence.
										</div>
									</div>
									<div className="divide-y divide-slate-100">
										{deviceUserSyncDecisionBuckets.map((item) => (
											<div
												key={item.key}
												className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem] sm:items-start">
												<div className="min-w-0">
													<div className="flex flex-wrap items-center gap-2">
														<span className="font-semibold text-slate-950">
															{item.label}
														</span>
														<Badge
															variant={
																item.defaultIncluded
																	? "success"
																	: "secondary"
															}>
															{item.defaultIncluded
																? "In fast job"
																: "Skipped"}
														</Badge>
													</div>
													<div className="mt-0.5 text-slate-600">
														{item.why}
													</div>
												</div>
												<div className="font-semibold text-slate-950 sm:text-right">
													{metricValue(item.count)}
												</div>
												<span className="text-xs font-medium text-slate-500 sm:text-right">
													{item.filter}
												</span>
											</div>
										))}
									</div>
								</div>
								{deviceUserSyncDecisionMatrix ? (
									<div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<span className="text-xs font-semibold text-slate-950">
												Fastest valid plan:{" "}
												{deviceUserSyncDecisionMatrix.selectedFastPlan}
											</span>
											<Badge
												variant={
													deviceUserSyncDecisionMatrix.sourceReadRequired
														? "warning"
														: "success"
												}>
												{deviceUserSyncDecisionMatrix.sourceReadRequired
													? "Source read needed"
													: "Saved-state first"}
											</Badge>
										</div>
										<p className="mt-1 text-xs text-slate-600">
											{deviceUserSyncDecisionMatrix.selectedFastPlanReason}
										</p>
										<div className="mt-2 flex flex-wrap gap-1.5">
											{deviceUserSyncDecisionMatrix.jobStages.map((stage) => (
												<span
													key={stage}
													className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
													{stage}
												</span>
											))}
										</div>
									</div>
								) : null}
								<div className="grid gap-2 sm:grid-cols-2">
									{[
										[
											deviceUserSyncDecisionMatrix
												? "Fast plan: fingerprint raw candidates"
												: "Current live users: fingerprint inventory vs HRIS raw",
											deviceUserSyncDecisionMatrix
												? `${metricValue(plannedFingerprintRawMissingCount)} candidate rows; raw bytes must come from evidenced live capture, not counts`
												: `${metricValue(deviceUserSyncReviewPreview?.fingerprintReported)} inventory slots / ${metricValue(deviceUserSyncReviewPreview?.fingerprintRawPresent ?? deviceUserSyncReviewPreview?.fingerprintEnvelopePresent)} HRIS raw stored / ${metricValue(plannedFingerprintRawMissingCount)} raw missing`,
										],
										[
											deviceUserSyncDecisionMatrix
												? "Fast plan: face raw candidates"
												: "Current live users: face inventory vs HRIS raw",
											deviceUserSyncDecisionMatrix
												? `${metricValue(plannedFaceRawMissingCount)} candidate rows; raw bytes must come from evidenced live capture, not counts`
												: `${metricValue(deviceUserSyncReviewPreview?.faceReported)} inventory claims / ${metricValue(deviceUserSyncReviewPreview?.faceRawPresent ?? deviceUserSyncReviewPreview?.faceEnvelopePresent)} HRIS raw stored / ${metricValue(plannedFaceRawMissingCount)} raw missing`,
										],
									].map(([label, value]) => (
										<div
											key={label}
											className="rounded-md border border-slate-200 px-2 py-1.5">
											<span className="block text-slate-500">{label}</span>
											<span className="font-semibold text-slate-950">
												{value}
											</span>
										</div>
									))}
								</div>
								{Number(deviceUserSyncReviewPreview?.staleHrisOnlyRows || 0) > 0 ? (
									<div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">
										<span className="block text-slate-500">
											Stale HRIS-only inventory
										</span>
										<span className="font-semibold text-slate-950">
											{metricValue(
												deviceUserSyncReviewPreview?.staleHrisOnlyRows,
											)}{" "}
											rows /{" "}
											{metricValue(
												deviceUserSyncReviewPreview?.staleFingerprintReported,
											)}{" "}
											fingerprint claims /{" "}
											{metricValue(
												deviceUserSyncReviewPreview?.staleFingerprintRawBlobCount ??
													deviceUserSyncReviewPreview?.staleFingerprintRawPresent,
											)}{" "}
											HRIS raw stored /{" "}
											{metricValue(
												deviceUserSyncReviewPreview?.staleFingerprintRawMissing,
											)}{" "}
											fingerprint raw missing /{" "}
											{metricValue(
												deviceUserSyncReviewPreview?.staleFaceReported,
											)}{" "}
											face claims /{" "}
											{metricValue(
												deviceUserSyncReviewPreview?.staleFaceRawMissing,
											)}{" "}
											face raw missing
										</span>
									</div>
								) : null}
								<p className="text-slate-600">
									{deviceUserSyncDecisionMatrix
										? "This dry-run plan is the same planner used to start Sync. Already-present rows and full source-user rereads are skipped unless the matrix says source evidence is needed."
										: "Current counts are scoped to users still present in the live device inventory. Stale HRIS-only rows are preserved separately for cleanup review; no blobs are fabricated from old counts."}
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
								disabled={
									startDeviceUserSyncJobMutation.isPending || !selectedDeviceId
								}
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
					setBulkDeviceUserSyncState((current) => ({
						...current,
						open,
						lastProgress: open ? current.lastProgress : null,
						status: open ? current.status : "idle",
						message: open ? current.message : "",
					}))
				}
				title={
					hasEffectiveDeviceUserSyncJobProgress
						? "Device-user sync status"
						: "Sync device users"
				}
				description={
					hasEffectiveDeviceUserSyncJobProgress
						? "You can close this window and reopen status from Sync device users."
						: "Device-user refresh status."
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
								{hasEffectiveDeviceUserSyncJobProgress &&
								deviceUserSyncBiometricTotal > 0
									? deviceUserSyncJobIsProcessing
										? `Processing ${metricValue(deviceUserSyncBiometricProcessed)} of ${metricValue(deviceUserSyncBiometricTotal)} biometric credentials`
										: deviceUserSyncHasRawGaps
											? `Finished with ${metricValue(deviceUserSyncBiometricFailed)} missing raw blobs`
											: `Processed ${metricValue(deviceUserSyncBiometricProcessed)} of ${metricValue(deviceUserSyncBiometricTotal)} biometric credentials`
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
							{(hasEffectiveDeviceUserSyncJobProgress &&
							effectiveDeviceUserSyncJobProgress?.decisionMatrix
								? deviceUserSyncMatrixSummaryItems
								: bulkDeviceUserSyncSummaryItems
							).map(([label, value]) => (
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
										<span className="block text-orange-700">
											Current device
										</span>
										<span className="font-semibold">
											{deviceUserSyncCurrentDeviceLabel}
										</span>
									</div>
									<div>
										<span className="block text-orange-700">
											Current credential
										</span>
										<span className="font-semibold">
											{deviceUserSyncCurrentCredentialLabel}
										</span>
									</div>
								</div>
								<div className="mt-3 grid grid-cols-2 gap-2 border-t border-orange-200 pt-3 text-xs text-orange-950">
									<div>
										<span className="block text-orange-700">Job ID</span>
										<span className="font-medium">
											{formatDeviceUserSyncJobId(
												effectiveDeviceUserSyncJobProgress?.jobId,
											)}
										</span>
									</div>
									<div>
										<span className="block text-orange-700">Started</span>
										<span className="font-medium">
											{formatDateTime(
												effectiveDeviceUserSyncJobProgress?.startedAt,
											)}
										</span>
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
													? formatDateTime(
															new Date(
																deviceUserSyncJobUpdatedAt,
															).toISOString(),
														)
													: "Waiting for update"}
										</span>
									</div>
									<div>
										<span className="block text-orange-700">Run state</span>
										<span className="font-medium capitalize">
											{effectiveDeviceUserSyncJobProgress?.status ||
												"loading"}
										</span>
									</div>
									<div>
										<span className="block text-orange-700">Privacy</span>
										<span className="font-medium">
											Raw custody when evidenced
										</span>
									</div>
								</div>
								{deviceUserSyncFailureLog.length > 0 ? (
									<div className="mt-3 rounded-md border border-orange-100 bg-white/70 px-3 py-2">
										<div className="flex items-center justify-between gap-3">
											<p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
												Recent device no-data
											</p>
											<p className="text-xs text-orange-800">
												Latest{" "}
												{metricValue(deviceUserSyncFailureLog.length)}
											</p>
										</div>
										<div className="mt-2 space-y-1">
											{deviceUserSyncFailureLog.map((failure) => (
												<div
													key={`${failure.vendorUserId}-${failure.modality}-${failure.at}`}
													className="grid gap-2 text-xs text-orange-950 sm:grid-cols-[90px_90px_minmax(0,1fr)]">
													<span className="font-semibold">
														{failure.vendorUserId}
													</span>
													<span className="capitalize">
														{failure.modality}
													</span>
													<span className="min-w-0 truncate">
														{formatDeviceUserSyncRawFailureReason(
															failure.reason,
														)}
													</span>
												</div>
											))}
										</div>
									</div>
								) : null}
							</>
						) : null}
						{!hasEffectiveDeviceUserSyncJobProgress &&
						bulkDeviceUserSyncState.status === "review" ? (
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
									<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 xl:min-w-[820px]">
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
												<Badge variant="outline">Force reread</Badge>
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
												<Badge variant="success">Default</Badge>
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
										<button
											type="button"
											onClick={() =>
												setBulkDeviceUserSyncMode("biometrics_only")
											}
											className={`rounded-xl border px-4 py-3 text-left transition ${
												bulkDeviceUserSyncMode === "biometrics_only"
													? "border-sky-300 bg-sky-50 text-sky-950 shadow-sm"
													: "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
											}`}>
											<div className="flex items-center justify-between gap-3">
												<span className="text-sm font-semibold">
													Raw blobs only
												</span>
												<Badge variant="outline">Fast repair</Badge>
											</div>
											<p className="mt-1 text-xs text-current/80">
												Skip source reread and capture missing raw
												fingerprint and face custody for the open device.
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

					{!hasEffectiveDeviceUserSyncJobProgress &&
					bulkDeviceUserSyncState.status === "review" ? (
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
											{countMetricValue(sourceCount, preview)}
										</div>
										<div className="font-semibold text-slate-950">
											{countMetricValue(hrisCount, preview)}
										</div>
										<div className="font-semibold text-slate-950">
											{countMetricValue(gapCount, preview)}
										</div>
										<div className="font-semibold text-slate-950">
											{metricValue(peerDriftCount)}
										</div>
										<div className="font-semibold text-slate-950">
											{countMetricValue(openCount, preview)}
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
												: result.summary?.mode === "biometrics_only"
													? `${metricValue(result.summary?.biometricCaptured)} captured, ${metricValue(result.summary?.biometricCached)} already present, ${metricValue(result.summary?.biometricFailed)} missing_raw_blob.`
													: `${metricValue(result.summary?.created)} created, ${metricValue(result.summary?.updated)} updated, ${metricValue(result.summary?.unmatched)} need link.`
											: result.status === "cancelled"
												? "Sync was cancelled before this device was completed."
												: formatDeviceUserSyncRawFailureMessage(
														result.error,
													)}
									</p>
								</div>
							))}
						</div>
					) : null}

					<div className="flex justify-end gap-2 border-t pt-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								setActiveDeviceUserSyncJob(null);
								setBulkDeviceUserSyncState({
									open: false,
									status: "idle",
									message: "",
									lastProgress: null,
								});
							}}>
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
								onClick={() => {
									const retryMode =
										deviceUserSyncJobMode === "biometrics_only"
											? "biometrics_only"
											: bulkDeviceUserSyncMode;
									setBulkDeviceUserSyncMode(retryMode);
									void runBulkDeviceUserSync(retryMode);
								}}>
								{startDeviceUserSyncJobMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<RefreshCw className="h-4 w-4" />
								)}
								{startDeviceUserSyncJobMutation.isPending
									? "Starting..."
									: deviceUserSyncJobMode === "biometrics_only"
										? "Retry raw blobs only"
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
									(deviceUserSyncJobMode !== "biometrics_only" &&
										bulkDeviceUserSyncMode === "needs_attention_only" &&
										needsAttentionSyncCenterDevices.length === 0)
								}
								onClick={() => {
									const retryMode =
										deviceUserSyncJobMode === "biometrics_only"
											? "biometrics_only"
											: bulkDeviceUserSyncMode;
									setBulkDeviceUserSyncMode(retryMode);
									void runBulkDeviceUserSync(retryMode);
								}}>
								{startDeviceUserSyncJobMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<RefreshCw className="h-4 w-4" />
								)}
								{startDeviceUserSyncJobMutation.isPending
									? "Starting..."
									: deviceUserSyncJobMode === "biometrics_only"
										? "Retry raw blobs only"
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
				onOpenChange={(open) => {
					if (!open) {
						setSdkMergeConfirmOpen(false);
						sdkMergeAvailabilityRequest.current.controller?.abort();
						sdkMergeAvailabilityRequest.current.sequence += 1;
					}
					setSdkMergeState((current) => ({ ...current, open }));
				}}
				title="Merge device users"
				className="max-w-5xl"
				showCloseButton={!sdkMergeJobIsProcessing}
				closeOnBackdropClick={!sdkMergeJobIsProcessing}>
				<div className="space-y-3">
					<div
						aria-live="polite"
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
					{sdkMergeState.availability?.length ? (
						<div className="overflow-hidden rounded-md border border-slate-200 bg-white">
							<div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
								<span>Availability evidence</span>
								<span>Status</span>
							</div>
							<div className="max-h-44 overflow-auto">
								{sdkMergeState.availability.map((row) => (
									<div
										key={`merge-availability:${row.deviceId}`}
										className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
										<div className="min-w-0">
											<p className="truncate font-medium text-slate-950">
												{row.deviceName}
											</p>
											<p className="truncate text-xs text-slate-600">
												{row.reason ||
													"Bounded quick-health check in progress"}
											</p>
										</div>
										<div className="flex items-center gap-2">
											{row.status === "checking" ? (
												<Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
											) : row.status === "online" ? (
												<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
											) : (
												<AlertTriangle className="h-3.5 w-3.5 text-red-600" />
											)}
											<span
												className={
													row.status === "online"
														? "text-emerald-700"
														: row.status === "unavailable"
															? "text-red-700"
															: "text-slate-600"
												}>
												{row.status === "checking"
													? "Checking"
													: row.status === "online"
														? "Authenticated"
														: "Excluded"}
											</span>
										</div>
										{row.status !== "checking" ? (
											<p className="col-span-2 text-xs text-slate-600">
												Checked{" "}
												{row.checkedAt
													? formatDateTime(row.checkedAt)
													: "time unavailable"}
												{" · "}
												{row.evidenceSource ||
													"evidence source unavailable"}
											</p>
										) : null}
									</div>
								))}
							</div>
						</div>
					) : null}

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
							<div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
								{[
									["Current phase", sdkMergeJobPhase],
									["Elapsed", sdkMergeJobElapsed],
									["UI polling", sdkMergeJobLastChecked],
									[
										"Execution",
										effectiveSdkMergeJob?.executionLocation || "VM container",
									],
									[
										"Backend heartbeat",
										sdkMergeJobBackendAgeSeconds === null
											? "Waiting"
											: sdkMergeJobBackendAgeSeconds <= 3
												? "Just now"
												: `${sdkMergeJobBackendAgeSeconds}s ago`,
									],
								].map(([label, value]) => (
									<div
										key={String(label)}
										className="rounded-md border border-white/80 bg-white/70 px-3 py-2">
										<p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
											{label}
										</p>
										<p className="mt-1 truncate text-sm font-semibold text-slate-950">
											{value}
										</p>
									</div>
								))}
							</div>
							{sdkMergeCurrentWorkItems.length ? (
								<div className="mt-3 rounded-md border border-white/80 bg-white/80 p-3">
									<div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
										<div className="min-w-0">
											<p className="text-sm font-semibold text-slate-950">
												Live copy now
											</p>
											<p className="mt-0.5 text-xs text-slate-600">
												From backend progressEvents. Counts move only after
												the device or HRIS write returns.
											</p>
										</div>
										{sdkMergeCurrentEvent?.at ? (
											<p className="shrink-0 text-xs font-medium text-slate-600">
												{formatDateTime(sdkMergeCurrentEvent.at)}
											</p>
										) : null}
									</div>
									<div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
										{sdkMergeCurrentWorkItems.map(([label, value]) => (
											<div
												key={String(label)}
												className="min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2">
												<p className="text-[11px] font-medium uppercase text-slate-500">
													{label}
												</p>
												<p className="mt-1 truncate text-sm font-semibold text-slate-950">
													{value}
												</p>
											</div>
										))}
									</div>
									{sdkMergeCurrentEvent?.message ? (
										<p className="mt-2 break-words text-xs text-slate-700">
											{sdkMergeCurrentEvent.message}
										</p>
									) : null}
								</div>
							) : null}
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
							{effectiveSdkMergeJob?.startingGapSummary ? (
								<div className="mt-3 overflow-hidden rounded-md border border-white/80 bg-white">
									<div className="grid grid-cols-[minmax(150px,1fr)_80px_90px_80px_70px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
										<span>Five-device reread</span>
										<span className="text-right">Total</span>
										<span className="text-right">Fingerprint</span>
										<span className="text-right">Face</span>
										<span className="text-right">Card</span>
									</div>
									{sdkMergeGapSummaryRows.map(([label, summary]) => (
										<div
											key={label}
											className="grid grid-cols-[minmax(150px,1fr)_80px_90px_80px_70px] gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
											<span className="font-medium text-slate-950">{label}</span>
											<span className="text-right font-semibold text-slate-950">
												{mergeMetricValue(summary?.total)}
											</span>
											<span className="text-right text-slate-700">
												{mergeMetricValue(summary?.modalities?.fingerprint)}
											</span>
											<span className="text-right text-slate-700">
												{mergeMetricValue(summary?.modalities?.face)}
											</span>
											<span className="text-right text-slate-700">
												{mergeMetricValue(summary?.modalities?.card)}
											</span>
										</div>
									))}
									{sdkMergeGapTargetIds.length ? (
										<div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
											<p className="text-xs font-semibold text-slate-700">
												Closed delta by physical target
											</p>
											<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
												{sdkMergeGapTargetIds.map((deviceId) => {
													const delta =
														effectiveSdkMergeJob?.gapDelta?.perTarget?.[
															deviceId
														];
													return (
														<span key={deviceId}>
															{mergeDeviceName(
																sdkMergePlanDevices,
																deviceId,
															)}
															: {mergeMetricValue(delta?.total)} (
															{mergeMetricValue(delta?.fingerprint)} FP,{" "}
															{mergeMetricValue(delta?.face)} face,{" "}
															{mergeMetricValue(delta?.card)} card)
														</span>
													);
												})}
											</div>
										</div>
									) : null}
								</div>
							) : null}
							{sdkMergeJobScopeItems.length ? (
								<div className="mt-3 rounded-md border border-white/80 bg-white/80 p-3">
									<div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
										<div>
											<p className="text-sm font-semibold text-slate-950">
												Locked job scope
											</p>
											<p className="mt-0.5 text-xs text-slate-600">
												This is the frozen source/target matrix from the job
												start request. Change scope only after the job
												finishes or fails.
											</p>
										</div>
										{effectiveSdkMergeJob?.jobId ? (
											<p className="shrink-0 text-xs font-medium text-slate-600">
												Job{" "}
												{formatDeviceUserSyncJobId(
													effectiveSdkMergeJob.jobId,
												)}
											</p>
										) : null}
									</div>
									<div className="mt-3 grid gap-2 sm:grid-cols-4">
										{sdkMergeJobScopeItems.map(([label, value]) => (
											<div
												key={String(label)}
												className="rounded-md border border-slate-200 bg-white px-3 py-2">
												<p className="text-[11px] font-medium uppercase text-slate-500">
													{label}
												</p>
												<p className="mt-1 text-sm font-semibold text-slate-950">
													{mergeMetricValue(value)}
												</p>
											</div>
										))}
									</div>
									<div className="mt-3 grid gap-3 lg:grid-cols-2">
										<div className="overflow-hidden rounded-md border border-slate-200 bg-white">
											<div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
												<p className="text-xs font-semibold uppercase text-slate-600">
													Targets receiving copies
												</p>
											</div>
											<div className="max-h-36 overflow-auto">
												{sdkMergeJobTargetRows
													.slice(0, 8)
													.map((target: any) => (
														<div
															key={`job-target:${target.deviceId}`}
															className="grid grid-cols-[minmax(0,1fr)_80px] gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
															<span className="truncate font-medium text-slate-950">
																{target.deviceName ||
																	target.deviceId}
															</span>
															<span className="text-right font-semibold text-slate-950">
																{mergeMetricValue(target.writes)}
															</span>
														</div>
													))}
											</div>
										</div>
										<div className="overflow-hidden rounded-md border border-slate-200 bg-white">
											<div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
												<p className="text-xs font-semibold uppercase text-slate-600">
													Physical sources used
												</p>
											</div>
											<div className="max-h-36 overflow-auto">
												{sdkMergeJobSourceRows
													.slice(0, 8)
													.map((source: any) => (
														<div
															key={`job-source:${source.deviceId}`}
															className="grid grid-cols-[minmax(0,1fr)_80px] gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
															<div className="min-w-0">
																<p className="truncate font-medium text-slate-950">
																	{source.deviceName ||
																		source.deviceId}
																</p>
																<p className="truncate text-xs text-slate-600">
																	{mergePlural(
																		source.selectedUniqueIds,
																		"selected ID",
																	)}
																</p>
															</div>
															<span className="text-right font-semibold text-slate-950">
																{mergeMetricValue(source.writes)}
															</span>
														</div>
													))}
											</div>
										</div>
									</div>
								</div>
							) : null}
							{effectiveSdkMergeJob?.error ? (
								<p className="mt-2 text-xs text-red-800">
									{effectiveSdkMergeJob.error}
								</p>
							) : null}
							{sdkMergeJobCopyFailurePairs.length > 0 ? (
								<div className="mt-3 overflow-hidden rounded-md border border-white/80 bg-white">
									<div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
										<p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
											Copy failures by path
										</p>
										<p className="mt-0.5 text-xs text-slate-600">
											Grouped from backend progress. Latest rows below may be
											capped.
										</p>
									</div>
									{sdkMergeJobCopyFailurePairs.map((item) => (
										<div
											key={item.pair}
											className="grid grid-cols-[minmax(0,1fr)_80px] gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
											<span className="min-w-0 break-words font-medium text-slate-950">
												{item.pair}
											</span>
											<span className="text-right font-semibold text-slate-950">
												{mergeMetricValue(item.count)}
											</span>
										</div>
									))}
								</div>
							) : null}
							{sdkMergeLatestEvents.length > 0 ? (
								<div className="mt-3 overflow-hidden rounded-md border border-white/80 bg-white">
									<div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
										<p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
											Latest backend events
										</p>
										<p className="mt-0.5 text-xs text-slate-600">
											Most recent progressEvents from the API heartbeat.
										</p>
									</div>
									{sdkMergeLatestEvents.slice(0, 6).map((event: any, index) => (
										<div
											key={`${event?.at || index}:${event?.stage || "event"}`}
											className="grid gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 lg:grid-cols-[150px_minmax(0,1fr)_160px] lg:items-start">
											<p className="font-semibold text-slate-950">
												{sdkMergeStageLabels[
													String(
														event?.operationTelemetry?.stage ||
															event?.stage ||
															"",
													)
												] ||
													event?.stage ||
													"Progress"}
											</p>
											<p className="min-w-0 break-words text-slate-700">
												{event?.message ||
													"Backend progress event received."}
											</p>
											<p className="text-xs font-medium text-slate-500 lg:text-right">
												{event?.at ? formatDateTime(event.at) : "-"}
											</p>
										</div>
									))}
								</div>
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
												{result.status === "success"
													? "Retained + reread"
													: "No retained write / review"}
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

					{sdkMergeState.data && sdkMergeState.status !== "loading" && !hasSdkMergeJob ? (
						<>
							<div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
								<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
									<div className="min-w-0">
										<p className="text-sm font-semibold text-slate-950">
											Review merge by unique ID
										</p>
										<p className="mt-1 text-xs text-slate-600">
											{mergePlural(
												sdkMergeSelectedUniqueCount,
												"selected unique ID",
											)}{" "}
											Â·{" "}
											{mergePlural(
												sdkMergeSelectedPotentialWriteCount,
												"selected potential write",
											)}{" "}
											Â· {sdkMergeExcludedActionableCount} excluded
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
														sdkMergeScopedSelectableUserKeys.map(
															(key) => [key, true],
														),
													),
												)
											}
											disabled={
												sdkMergeScopedSelectableUserKeys.length === 0
											}>
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
											Re-apply auto-resolve
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
														message:
															"Choices cleared — pick A/B/KEEP manually, or re-apply auto-resolve.",
													}))
												}>
												Manual mode (clear auto)
											</Button>
										) : null}
									</div>
								</div>
							</div>

							<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
								{[
									["unique", "Unique IDs", sdkMergeUniqueIdCount],
									["records", "Device ID records", sdkMergeDeviceRecordCount],
									["review", "Needs review", sdkMergeAttentionRowCount],
									["writes", "Potential writes", sdkMergePotentialWriteCount],
								].map(([mode, label, value]) => (
									<button
										type="button"
										key={String(label)}
										aria-label={`Show ${label}`}
										onClick={() =>
											setSdkMergeListMode(mode as SdkMergeListMode)
										}
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

							<div className="overflow-hidden rounded-md border border-slate-200 bg-white">
								<div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
									<div>
										<p className="text-sm font-semibold text-slate-950">
											Credential convergence
										</p>
										<p className="mt-0.5 text-xs leading-5 text-slate-600">
											Fingerprint and face are planned independently. Enrollment counts
											identify gaps; they do not prove portable biometric bytes.
										</p>
									</div>
									<div className="flex flex-wrap gap-2">
										<Button
											type="button"
											onClick={startCredentialRecovery}
											disabled={
												sdkMergeRecoveryQueuedCredentialWriteCount === 0 ||
												startHikvisionCredentialRecoveryMutation.isPending ||
												["pending", "recovering", "retrying"].includes(
													String(credentialRecoveryJob?.status || ""),
												)
											}>
											{startHikvisionCredentialRecoveryMutation.isPending ||
											["pending", "recovering", "retrying"].includes(
												String(credentialRecoveryJob?.status || ""),
											) ? (
												<Loader2 className="h-4 w-4 animate-spin" />
											) : (
												<Activity className="h-4 w-4" />
											)}
											Start recovery
										</Button>
										<Button
											type="button"
											variant="outline"
											onClick={selectRecommendedCredentialWrites}
											disabled={
												sdkMergeBlockingCount > 0 ||
												sdkMergeSelectableCredentialWrites.length === 0
											}>
											<CheckCircle2 className="h-4 w-4" />
											Select ready operations
										</Button>
										<Button
											type="button"
											variant="outline"
											onClick={() => setSelectedSdkMergeCredentialWriteIds({})}
											disabled={sdkMergeSelectedCredentialWrites.length === 0}>
											Clear credential scope
										</Button>
									</div>
								</div>
								{credentialRecoveryJob ? (
									<div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<div>
												<p className="text-sm font-semibold text-slate-950">
													Recovery job {credentialRecoveryJob.id}
												</p>
												<p className="mt-0.5 text-xs text-slate-600">
													{credentialRecoveryJob.currentStage || credentialRecoveryJob.status}
													{" · "}
													last advanced{" "}
													{credentialRecoveryJob.lastAdvancementAt
														? formatDateTime(
																credentialRecoveryJob.lastAdvancementAt,
															)
														: "not yet"}
												</p>
											</div>
											<Badge
												variant={
													credentialRecoveryJob.status === "failed" ||
													credentialRecoveryJob.status === "needs_attention"
														? "destructive"
														: credentialRecoveryJob.status === "completed" &&
															  (credentialRecoveryJob.counters?.verified ?? 0) > 0
															? "success"
															: "warning"
												}>
												{credentialRecoveryJob.status}
											</Badge>
										</div>
										<div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs">
											<p className="font-semibold text-slate-950">
												{credentialRecoveryJob.activeTask
													? `Now: ${credentialRecoveryJob.activeTask.modality || "credential"} ${credentialRecoveryJob.activeTask.stage || credentialRecoveryJob.activeTask.kind}`
													: `Now: ${credentialRecoveryJob.currentStage || "waiting for worker"}`}
											</p>
											{credentialRecoveryJob.activeTask ? (
												<p className="mt-1 break-all text-slate-600">
													source{" "}
													{credentialRecoveryJob.activeTask.sourceDeviceId || "not applicable"}
													{" → target "}
													{credentialRecoveryJob.activeTask.targetDeviceId ||
														"not selected yet"}
													{" · user "}
													{credentialRecoveryJob.activeTask.vendorUserId || "not available"}
													{" · attempt "}
													{credentialRecoveryJob.activeTask.attempts}
													{credentialRecoveryJob.activeTask.maxAttempts
														? `/${credentialRecoveryJob.activeTask.maxAttempts}`
														: ""}
												</p>
											) : null}
											<p className="mt-1 text-slate-600">
												Worker lease{" "}
												{credentialRecoveryJob.workerLeaseActive ? "active" : "inactive"}
												{" · resume cursor "}
												{credentialRecoveryJob.resumeCursor ?? 0}
											</p>
										</div>
										<div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
											{[
												["Recovered", credentialRecoveryJob.counters?.recovered ?? 0],
												["Ready to write", credentialRecoveryJob.counters?.readyToWrite ?? 0],
												["Writing", credentialRecoveryJob.counters?.writing ?? 0],
												[
													"Rereading",
													credentialRecoveryJob.counters?.awaitingPhysicalReread ?? 0,
												],
												["Verified", credentialRecoveryJob.counters?.verified ?? 0],
												["Failed", credentialRecoveryJob.counters?.failed ?? 0],
												[
													"Remaining",
													credentialRecoveryJob.counters
														?.physicallyVerifiedRemaining ?? 0,
												],
											].map(([label, value]) => (
												<div key={String(label)} className="rounded border bg-white px-2 py-1.5">
													<p className="text-slate-600">{label}</p>
													<p className="font-semibold text-slate-950">
														{mergeMetricValue(value)}
													</p>
												</div>
											))}
										</div>
										{credentialRecoveryJob.latestError?.message ? (
											<div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
												<p className="font-semibold">
													{credentialRecoveryJob.latestError.observabilityDefect
														? "Observability defect"
														: credentialRecoveryJob.latestError.category ||
															"Recovery failure"}
													{" · "}
													{credentialRecoveryJob.latestError.code || "unclassified"}
													{" · "}
													{credentialRecoveryJob.latestError.retryable
														? "retryable"
														: "not automatically retryable"}
												</p>
												<p className="mt-1 break-words">
													{credentialRecoveryJob.latestError.message}
												</p>
												<p className="mt-1 break-all text-red-700">
													stage {credentialRecoveryJob.latestError.stage || "unknown"}
													{" · source "}
													{credentialRecoveryJob.latestError.sourceDeviceId || "unknown"}
													{" · target "}
													{credentialRecoveryJob.latestError.targetDeviceId || "unknown"}
													{" · user "}
													{credentialRecoveryJob.latestError.vendorUserId || "unknown"}
													{" · attempt "}
													{credentialRecoveryJob.latestError.attempt || "unknown"}
												</p>
											</div>
										) : null}
									</div>
								) : (
									<div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
										{sdkMergeSelectableCredentialWrites.length > 0 ? (
											<>
												<span className="font-semibold text-emerald-800">
													Ready now {mergeMetricValue(sdkMergeSelectableCredentialWrites.length)}
												</span>
												{" — "}
												agent can write these (richest source). Amber = agent
												recovery (export / identity / probe). Red = true dual-owner
												or enroll/firmware only.
											</>
										) : (
											<>
												Ready now 0 = nothing selectable for auto-write in this plan.
												Start recovery for amber export/probe work. Red is only
												true ownership/enroll boundaries — not normal richest-source
												copy.
											</>
										)}
									</div>
								)}
								<div className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-4 xl:grid-cols-7">
									{[
										[
											"Potential operations",
											sdkMergePotentialOperationSummary?.totalPotentialOperations ??
												sdkMergeCredentialWrites.length,
										],
										[
											"Fingerprint",
											sdkMergePotentialOperationSummary?.byModality
												?.fingerprint ??
												sdkMergeCredentialFingerprintWriteCount,
										],
										[
											"Face",
											sdkMergePotentialOperationSummary?.byModality?.face ??
												sdkMergeCredentialFaceWriteCount,
										],
										[
											"Card",
											sdkMergePotentialOperationSummary?.byModality?.card ??
												sdkMergeCredentialCardWriteCount,
										],
										["Ready now", sdkMergeSelectableCredentialWrites.length],
										[
											"Agent recovery",
											sdkMergeRecoveryQueuedCredentialWriteCount,
										],
										[
											"Ownership / enroll block",
											sdkMergePhysicalActionCredentialWrites.length,
										],
									].map(([label, value]) => (
										<div key={String(label)} className="bg-white px-3 py-2">
											<p className="text-xs text-slate-600">{label}</p>
											<p
												className={`mt-0.5 text-sm font-semibold ${
													label === "Ready now"
														? "text-emerald-800"
														: label === "Agent recovery"
															? "text-amber-800"
															: label === "Ownership / enroll block"
																? "text-red-800"
																: "text-slate-950"
												}`}>
												{mergeMetricValue(value)}
											</p>
										</div>
									))}
								</div>
								{sdkMergeRecoveryStageEntries.length ? (
									<div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
										<span className="font-semibold text-slate-950">
											Operations by recovery stage
										</span>
										{sdkMergeRecoveryStageEntries.map(([stage, count]) => (
											<span key={stage}>
												{formatSdkMergeRecoveryStage({
													recoveryStage: stage,
												} as SdkMergeCredentialWrite)}
												: {mergeMetricValue(count)}
											</span>
										))}
									</div>
								) : null}
								<div className="grid grid-cols-[32px_minmax(130px,0.8fr)_96px_minmax(150px,1fr)_minmax(150px,1fr)_104px_minmax(190px,1.2fr)] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
									<span aria-hidden="true" />
									<span>User ID</span>
									<span>Modality</span>
									<span>Source</span>
									<span>Target</span>
									<span>Counts</span>
									<span>Evidence / decision</span>
								</div>
								<div className="max-h-64 overflow-auto">
									{sdkMergeCredentialWrites.length ? (
										sdkMergeCredentialWrites.map((write) => {
											const selectable =
												write.recommended &&
												write.executionEligibility === "ready_from_raw_blob" &&
												!isSdkMergePhysicalActionRequired(write);
											const physicalActionRequired =
												isSdkMergePhysicalActionRequired(write);
											return (
												<div
													key={write.id}
													className="grid grid-cols-[32px_minmax(130px,0.8fr)_96px_minmax(150px,1fr)_minmax(150px,1fr)_104px_minmax(190px,1.2fr)] items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
													<input
														type="checkbox"
														aria-label={`Select ${write.modality} operation for ${write.vendorUserId}`}
														checked={Boolean(
															selectedSdkMergeCredentialWriteIds[write.id],
														)}
														disabled={!selectable}
														onChange={(event) =>
															setSelectedSdkMergeCredentialWriteIds(
																(current) => ({
																	...current,
																	[write.id]: event.target.checked,
																}),
															)
														}
														className="h-4 w-4 accent-orange-600"
													/>
													<button
														type="button"
														className="truncate text-left font-medium text-orange-800 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-orange-300 rounded"
														title={`Open user ${write.vendorUserId} on source device`}
														aria-label={`Deep-link to vendor user ${write.vendorUserId} on source device for ${write.modality}`}
														onClick={() =>
															openDeviceUserDeepLink(
																write.sourceDeviceId ||
																	write.targetDeviceId,
																write.vendorUserId,
																{ preferSourceView: true },
															)
														}>
														{write.vendorUserId}
													</button>
													<Badge
														variant={
															write.modality === "fingerprint"
																? "warning"
																: write.modality === "face"
																	? "success"
																	: "default"
														}>
														{write.modality}
													</Badge>
													{write.sourceDeviceId ? (
														<button
															type="button"
															className="truncate text-left text-slate-700 underline-offset-2 hover:text-orange-800 hover:underline focus:outline-none focus:ring-2 focus:ring-orange-300 rounded"
															title="Open source device in Sync Center"
															aria-label={`Open source device ${mergeDeviceName(sdkMergePlanDevices, write.sourceDeviceId)}`}
															onClick={() =>
																openDeviceUserDeepLink(
																	write.sourceDeviceId,
																	write.vendorUserId,
																	{ preferSourceView: true },
																)
															}>
															{mergeDeviceName(
																sdkMergePlanDevices,
																write.sourceDeviceId,
															)}
														</button>
													) : (
														<span className="truncate text-slate-700">
															{physicalActionRequired
																? "Physical source required"
																: "Source recovery needed"}
														</span>
													)}
													{write.targetDeviceId ? (
														<button
															type="button"
															className="truncate text-left text-slate-700 underline-offset-2 hover:text-orange-800 hover:underline focus:outline-none focus:ring-2 focus:ring-orange-300 rounded"
															title="Open target device in Sync Center"
															aria-label={`Open target device ${mergeDeviceName(sdkMergePlanDevices, write.targetDeviceId)}`}
															onClick={() =>
																openDeviceUserDeepLink(
																	write.targetDeviceId,
																	write.vendorUserId,
																	{ preferSourceView: true },
																)
															}>
															{mergeDeviceName(
																sdkMergePlanDevices,
																write.targetDeviceId,
															)}
														</button>
													) : (
														<span className="truncate text-slate-700">—</span>
													)}
													<span className="font-medium text-slate-950">
														{write.sourceReportedCount} →{" "}
														{write.targetReportedCount}
													</span>
													<div className="min-w-0">
														<p
															className={`text-xs font-semibold ${
																selectable
																	? "text-emerald-700"
																	: physicalActionRequired
																		? "text-red-700"
																		: "text-amber-800"
															}`}
															title={write.recommendationReason}>
															{selectable
																? "Ready now: richest source can write (agent)"
																: physicalActionRequired
																	? `Blocked (true ownership/enroll): ${formatSdkMergePhysicalAction(write)}`
																	: `Agent recovery: ${formatSdkMergeRecoveryStage(write)}`}
														</p>
														<p className="mt-0.5 break-words text-xs leading-4 text-slate-600">
															{write.recommendationReason}
														</p>
													</div>
												</div>
											);
										})
									) : (
										<p className="px-3 py-4 text-sm text-slate-600">
											No credential differences were found in this plan.
										</p>
									)}
								</div>
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
								{sdkMergeDeviceIssueCounts.map(
									({ device, read, counts, readFailed, readError }) => (
										<div
											key={device.id}
											className="grid gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 lg:grid-cols-[minmax(180px,1fr)_88px_repeat(4,106px)] lg:items-center">
											<button
												type="button"
												aria-label={`Show unique IDs for ${device.name || device.address || device.id}`}
												onClick={() =>
													setSdkMergeDeviceListMode(device.id, "unique")
												}
												className={`min-w-0 text-left font-medium ${selectedMergeDeviceId === device.id ? "text-orange-800" : "text-slate-950"}`}>
												<span className="block truncate">
													{device.name || device.address || device.id}
												</span>
												<span
													className={`block truncate text-xs font-normal ${selectedMergeDeviceId === device.id ? "text-orange-900" : "text-slate-700"}`}>
													{device.address || device.id}
												</span>
												{readFailed ? (
													<span className="mt-0.5 block truncate text-xs font-medium text-amber-800">
														Read failed
														{readError ? `: ${readError}` : ""}
													</span>
												) : null}
											</button>
											{readFailed ? (
												<span
													title={
														readError
															? `Inventory read failed: ${readError}`
															: "Inventory read failed for this device in the current merge plan"
													}
													className="inline-flex min-h-8 items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-2 text-center text-xs font-semibold text-amber-950"
													data-testid={`merge-device-read-failed-${device.id}`}>
													Unavailable
												</span>
											) : (
												<button
													type="button"
													aria-label={`Show ${read} unique IDs for ${device.name || device.address || device.id}`}
													onClick={() =>
														setSdkMergeDeviceListMode(
															device.id,
															"unique",
														)
													}
													className={getSdkMergeCountButtonClass(
														selectedMergeDeviceId === device.id &&
															sdkMergeListMode === "unique",
														read || 0,
													)}>
													{read}
												</button>
											)}
											{(
												[
													["missing", counts.missing],
													["decision", counts.decision],
													["fingerprint", counts.fingerprint],
													["face", counts.face],
												] as Array<[SdkMergeFilter, number]>
											).map(([filter, count]) =>
												readFailed ? (
													<span
														key={filter}
														className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-2 text-center text-xs font-medium text-slate-600"
														title="Issue counts are not computed for devices that failed inventory read">
														—
													</span>
												) : (
													<button
														key={filter}
														type="button"
														aria-label={`Show ${count} ${filter} unique IDs for ${device.name || device.address || device.id}`}
														onClick={() =>
															setSdkMergeDeviceFilter(
																device.id,
																filter,
															)
														}
														className={getSdkMergeCountButtonClass(
															selectedMergeDeviceId === device.id &&
																sdkMergeFilter === filter,
															count,
														)}>
														{count}
													</button>
												),
											)}
										</div>
									),
								)}
							</div>

							<div className="overflow-hidden rounded-md border border-slate-200 bg-white">
								<div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
									<div className="min-w-0">
										<p className="text-sm font-semibold text-slate-950">
											{sdkMergeActiveFilterLabel}:{" "}
											{mergeMetricValue(sdkMergeVisibleRows.length)}{" "}
											{sdkMergeListMode === "unique" ||
											sdkMergeListMode === "review" ||
											sdkMergeListMode === "issues"
												? sdkMergeVisibleRows.length === 1
													? "ID"
													: "IDs"
												: sdkMergeVisibleRows.length === 1
													? "row"
													: "rows"}
										</p>
										{sdkMergeListMode === "unique" &&
										sdkMergeDuplicateSourceRowCount > 0 ? (
											<p className="mt-0.5 text-xs text-slate-600">
												{mergePlural(
													sdkMergeDuplicateSourceRowCount,
													"duplicate source row",
												)}{" "}
												collapsed into the matching unique IDs.
											</p>
										) : null}
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
										. Offline or unavailable devices are skipped before results
										appear.
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
												const isSelected =
													selectedMergeUserKey === row.userKey;
												const isActionable =
													sdkMergeActionableUserKeys.includes(
														row.userKey,
													);
												const isSelectable = Boolean(row.userKey);
												const isRowChecked = Boolean(
													selectedSdkMergeUserKeys[row.userKey],
												);
												const recommendationReason =
													mergeRecommendationReason(row);
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
													const truth = mergeCredentialTruth(
														row.user,
														sdkMergePlanDevices,
														kind,
													);
													const hasIssue = truth.present < truth.expected;
													const issueCount =
														truth.expected - truth.present;
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
																	{mergeMetricValue(
																		truth.present,
																	)}
																</span>
																<span className="text-center text-[11px] font-medium text-slate-400">
																	/
																</span>
																<button
																	type="button"
																	onClick={() =>
																		setSdkMergeCredentialPicker(
																			{
																				rowId: row.id,
																				kind,
																			},
																		)
																	}
																	className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-center text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-50"
																	title={`Expected active devices: ${truth.expected}`}
																	aria-label={`Review ${kind} devices for vendor user ID ${row.vendorUserId}`}>
																	{mergeMetricValue(
																		truth.expected,
																	)}
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
																	aria-label={`Select vendor user ID ${row.vendorUserId} for merge review`}
																	title={
																		isSelectable
																			? isActionable
																				? "Include this unique ID in the merge review"
																				: "Include this aligned unique ID in the review; no update is expected"
																			: "This row cannot be selected"
																	}
																	onChange={(event) => {
																		const checked =
																			event.target.checked;
																		setSelectedSdkMergeUserKeys(
																			(current) => ({
																				...current,
																				[row.userKey]:
																					checked,
																			}),
																		);
																	}}
																/>
															</div>
															<div className="min-w-0">
																<button
																	type="button"
																	className="block max-w-full truncate text-left text-sm font-semibold text-orange-800 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-orange-300 rounded"
																	title={`Open user ${row.vendorUserId} on ${row.sourceDeviceName || "source device"} in Sync Center`}
																	aria-label={`Deep-link to vendor user ${row.vendorUserId} to resolve ${row.issueLabel}`}
																	onClick={() =>
																		openDeviceUserDeepLink(
																			row.sourceDeviceId ||
																				row.targetDeviceId ||
																				selectedDeviceId,
																			row.vendorUserId,
																			{ preferSourceView: true },
																		)
																	}>
																	{row.vendorUserId}
																</button>
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
																		HRIS employee{" "}
																		{row.user.employeeId}
																	</p>
																) : (
																	<p className="mt-0.5 truncate text-xs text-slate-600">
																		No HRIS employee link
																	</p>
																)}
															</div>
															{renderCredentialCountCell(
																"fingerprint",
															)}
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
																			: row.filter ===
																				  "decision"
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
																					onClick={() =>
																						keepSdkMergeCurrent(
																							row,
																						)
																					}>
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
																					setSdkMergeSourceReview(
																						{
																							rowId: row.id,
																						},
																					)
																				}>
																				<Eye className="h-4 w-4" />
																			</Button>
																		</TooltipTrigger>
																		<TooltipContent className="max-w-xs text-xs">
																			<p className="font-semibold">
																				Review sources
																			</p>
																			<p className="mt-1">
																				{
																					recommendationReason
																				}
																			</p>
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
												onClick={() =>
													setSdkMergePage(safeSdkMergePage - 1)
												}>
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
												onClick={() =>
													setSdkMergePage(safeSdkMergePage + 1)
												}>
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
								{mergePlural(sdkMergeSelectedUniqueCount, "selected unique ID")}{" "}
								selected for review.{" "}
								{mergePlural(
									sdkMergeSelectedPotentialWriteCount,
									"potential device write",
								)}{" "}
								would be included;{" "}
								{mergePlural(sdkMergeExcludedActionableCount, "actionable ID")}{" "}
								excluded from this scope.
							</p>
						) : null}
						<Button
							type="button"
							variant="outline"
							disabled={sdkMergeJobIsProcessing}
							onClick={() => {
								setSdkMergeConfirmOpen(false);
								setSdkMergeState((current) => ({ ...current, open: false }));
							}}>
							Close
						</Button>
						{sdkMergeState.status === "error" ? (
							<>
								<Button
									type="button"
									variant="outline"
									disabled={isFetchingHikvisionListenerStatus}
									onClick={() => {
										void Promise.allSettled([
											refetchHikvisionListenerStatus(),
											syncCenterHealth.refetchAll(),
										]).then(() => openSdkUserMerge(sdkMergeSearch));
									}}>
									<RefreshCw className="h-4 w-4" />
									Refresh tunnels/status
								</Button>
								<Button
									type="button"
									onClick={() => void openSdkUserMerge(sdkMergeSearch)}>
									<RefreshCw className="h-4 w-4" />
									Retry availability
								</Button>
							</>
						) : null}
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
								variant="outline"
								disabled={
									sdkMergeSelectedCredentialWrites.length === 0 ||
									sdkMergeBlockingCount > 0 ||
									sdkMergeJobIsProcessing ||
									startHikvisionSdkUserMergeJobMutation.isPending
								}
								onClick={() => setSdkMergeCredentialConfirmOpen(true)}>
								<Lock className="h-4 w-4" />
								{sdkMergeSelectedCredentialWrites.length
									? `Review credential writes (${sdkMergeSelectedCredentialWrites.length})`
									: "No evidence-backed credential writes selected"}
							</Button>
						) : null}
						{sdkMergeState.data && !hasSdkMergeJob ? (
							<Button
								type="button"
								disabled={
									!sdkMergeCanApply ||
									sdkMergeJobIsProcessing ||
									startHikvisionSdkUserMergeJobMutation.isPending
								}
								onClick={openSdkUserMergeConfirm}>
								{startHikvisionSdkUserMergeJobMutation.isPending ||
								sdkMergeJobIsProcessing ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Link2 className="h-4 w-4" />
								)}
								{sdkMergeBlockingCount
									? `Resolve ${sdkMergeBlockingCount} read issue${sdkMergeBlockingCount === 1 ? "" : "s"}`
									: sdkMergeSelectedUniqueCount === 0
										? "Select rows"
										: sdkMergeSelectedResolvedCount <
											  sdkMergeSelectedConflictCount
											? `Resolve ${sdkMergeSelectedConflictCount - sdkMergeSelectedResolvedCount} more`
											: sdkMergeJobIsProcessing
												? "Merge job running"
												: `Review selected merge (${sdkMergeSelectedUniqueCount})`}
							</Button>
						) : null}
					</div>
				</div>
			</Modal>

			<Modal
				open={
					sdkMergeCredentialConfirmOpen &&
					Boolean(sdkMergeState.data) &&
					!hasSdkMergeJob
				}
				onOpenChange={(open) => {
					if (!open && !startHikvisionSdkUserMergeJobMutation.isPending) {
						setSdkMergeCredentialConfirmOpen(false);
					}
				}}
				title="Review credential-only writes"
				description="The frozen scope changes fingerprint or face credentials only; it does not rewrite the user record, cards, validity, or the other biometric modality."
				className="max-w-4xl"
				showCloseButton={!startHikvisionSdkUserMergeJobMutation.isPending}
				closeOnBackdropClick={!startHikvisionSdkUserMergeJobMutation.isPending}>
				<div className="space-y-4">
					<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
						<p className="font-semibold">This starts physical device writes.</p>
						<p className="mt-1 text-xs leading-5">
							Only rows with readable raw/export evidence can enter this UI scope.
							The backend freezes the exact source, target, modality, and scope hash,
							then rereads the target after every successful write.
						</p>
					</div>
					<div className="grid gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 sm:grid-cols-3">
						{[
							["Target operations", sdkMergeSelectedCredentialWrites.length],
							[
								"Fingerprint",
								sdkMergeSelectedCredentialWrites.filter(
									(write) => write.modality === "fingerprint",
								).length,
							],
							[
								"Face",
								sdkMergeSelectedCredentialWrites.filter(
									(write) => write.modality === "face",
								).length,
							],
						].map(([label, value]) => (
							<div key={String(label)} className="bg-white px-3 py-3">
								<p className="text-xs text-slate-600">{label}</p>
								<p className="mt-1 text-base font-semibold text-slate-950">
									{mergeMetricValue(value)}
								</p>
							</div>
						))}
					</div>
					<div className="overflow-hidden rounded-md border border-slate-200">
						<div className="grid grid-cols-[minmax(120px,0.8fr)_96px_minmax(140px,1fr)_minmax(140px,1fr)_96px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
							<span>User ID</span>
							<span>Modality</span>
							<span>Source</span>
							<span>Target</span>
							<span>Counts</span>
						</div>
						<div className="max-h-[42vh] overflow-auto">
							{sdkMergeSelectedCredentialWrites.map((write) => (
								<div
									key={`credential-confirm:${write.id}`}
									className="grid grid-cols-[minmax(120px,0.8fr)_96px_minmax(140px,1fr)_minmax(140px,1fr)_96px] gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
									<span className="truncate font-medium text-slate-950">
										{write.vendorUserId}
									</span>
									<span className="capitalize text-slate-700">{write.modality}</span>
									<span className="truncate text-slate-700">
										{write.sourceDeviceId
											? mergeDeviceName(
													sdkMergePlanDevices,
													write.sourceDeviceId,
												)
											: "No source"}
									</span>
									<span className="truncate text-slate-700">
										{mergeDeviceName(
											sdkMergePlanDevices,
											write.targetDeviceId,
										)}
									</span>
									<span className="font-medium text-slate-950">
										{write.sourceReportedCount} → {write.targetReportedCount}
									</span>
								</div>
							))}
						</div>
					</div>
					<div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
						<Button
							type="button"
							variant="outline"
							disabled={startHikvisionSdkUserMergeJobMutation.isPending}
							onClick={() => setSdkMergeCredentialConfirmOpen(false)}>
							Back to review
						</Button>
						<Button
							type="button"
							disabled={
								sdkMergeSelectedCredentialWrites.length === 0 ||
								startHikvisionSdkUserMergeJobMutation.isPending
							}
							onClick={() => void applySdkCredentialMerge()}>
							{startHikvisionSdkUserMergeJobMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Lock className="h-4 w-4" />
							)}
							{startHikvisionSdkUserMergeJobMutation.isPending
								? "Starting..."
								: `Start credential-only job (${sdkMergeSelectedCredentialWrites.length})`}
						</Button>
					</div>
				</div>
			</Modal>

			<Modal
				open={sdkMergeConfirmOpen && Boolean(sdkMergeState.data) && !hasSdkMergeJob}
				onOpenChange={(open) => {
					if (!open && !startHikvisionSdkUserMergeJobMutation.isPending) {
						setSdkMergeConfirmOpen(false);
					}
				}}
				title="Review selected merge"
				description="Confirm selected unique IDs, source devices, peer copy attempts, and biometric evidence before HRIS starts the job."
				className="max-w-5xl"
				showCloseButton={!startHikvisionSdkUserMergeJobMutation.isPending}
				closeOnBackdropClick={!startHikvisionSdkUserMergeJobMutation.isPending}>
				<div className="space-y-4">
					<div className="grid gap-2 sm:grid-cols-5">
						{[
							["Selected unique IDs", sdkMergeSelectedUniqueCount],
							["Peer copy attempts", sdkMergeSelectedPotentialWriteCount],
							["Fingerprint gaps", sdkMergeSelectedFingerprintGapCount],
							["Face gaps", sdkMergeSelectedFaceGapCount],
							[
								"Conflicts resolved",
								`${sdkMergeSelectedResolvedCount}/${sdkMergeSelectedConflictCount}`,
							],
						].map(([label, value]) => (
							<div
								key={String(label)}
								className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
								<p className="text-[11px] font-medium uppercase text-slate-500">
									{label}
								</p>
								<p className="mt-1 text-base font-semibold text-slate-950">
									{mergeMetricValue(value)}
								</p>
							</div>
						))}
					</div>
					<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
						<p className="font-semibold">This starts a real device-write job.</p>
						<p className="mt-1 text-xs leading-5 text-amber-900">
							For each unique ID, HRIS uses the shown physical source device and
							copies that user to the shown peer target devices. Fingerprint and face
							columns show source evidence and current gaps, not template-write
							counts; missing raw blobs are not fabricated.
						</p>
					</div>
					<div className="grid gap-3 lg:grid-cols-2">
						<div className="overflow-hidden rounded-md border border-slate-200">
							<div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
								<p className="text-sm font-semibold text-slate-950">
									Writes by target device
								</p>
								<p className="mt-0.5 text-xs text-slate-600">
									Where selected IDs will be copied.
								</p>
							</div>
							<div className="max-h-44 overflow-auto">
								{sdkMergeSelectedWriteMatrix.perTarget.map((target) => (
									<div
										key={`confirm-target:${target.deviceId}`}
										className="grid grid-cols-[minmax(0,1fr)_88px] gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
										<div className="min-w-0">
											<p className="truncate font-medium text-slate-950">
												{target.deviceName}
											</p>
											<p className="truncate text-xs text-slate-600">
												From{" "}
												{target.sourceDeviceNames.slice(0, 2).join(", ")}
												{target.sourceDeviceNames.length > 2
													? ` +${target.sourceDeviceNames.length - 2}`
													: ""}
											</p>
										</div>
										<p className="text-sm font-semibold text-slate-950">
											{mergeMetricValue(target.writes)}
										</p>
									</div>
								))}
							</div>
						</div>
						<div className="overflow-hidden rounded-md border border-slate-200">
							<div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
								<p className="text-sm font-semibold text-slate-950">Sources used</p>
								<p className="mt-0.5 text-xs text-slate-600">
									Selected source devices for the selected IDs.
								</p>
							</div>
							<div className="max-h-44 overflow-auto">
								{sdkMergeSelectedWriteMatrix.perSource.map((source) => (
									<div
										key={`confirm-source:${source.deviceId}`}
										className="grid grid-cols-[minmax(0,1fr)_88px] gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
										<div className="min-w-0">
											<p className="truncate font-medium text-slate-950">
												{source.deviceName}
											</p>
											<p className="truncate text-xs text-slate-600">
												{mergePlural(
													source.selectedUniqueIds,
													"selected unique ID",
												)}
											</p>
										</div>
										<p className="text-sm font-semibold text-slate-950">
											{mergeMetricValue(source.writes)}
										</p>
									</div>
								))}
							</div>
						</div>
					</div>
					<div className="overflow-hidden rounded-md border border-slate-200">
						<div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
							<p className="text-sm font-semibold text-slate-950">
								Selected ID write matrix
							</p>
							<p className="mt-0.5 text-xs text-slate-600">
								One row per selected unique ID. Fingerprint/face show source
								evidence and selected-device coverage.
							</p>
						</div>
						<div className="grid grid-cols-[minmax(150px,1.2fr)_minmax(140px,1fr)_minmax(180px,1.3fr)_128px_128px_96px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase text-slate-600">
							<span>ID</span>
							<span>Physical source</span>
							<span>Targets</span>
							<span>Fingerprint</span>
							<span>Face</span>
							<span>Copy</span>
						</div>
						<div className="max-h-[42vh] overflow-auto">
							{sdkMergeSelectedWriteMatrix.rows.map((row) => (
								<div
									key={`confirm:${row.key}`}
									className="grid grid-cols-[minmax(150px,1.2fr)_minmax(140px,1fr)_minmax(180px,1.3fr)_128px_128px_96px] items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
									<div className="min-w-0">
										<p className="truncate font-medium text-slate-950">
											{row.label}
										</p>
										<p className="truncate text-xs text-slate-600">
											Unique device ID {row.vendorUserId}
										</p>
									</div>
									<div className="min-w-0">
										<p className="truncate font-medium text-slate-950">
											{row.sourceDeviceName}
										</p>
										<p className="truncate text-xs text-slate-600">
											{row.conflicts
												? mergePlural(row.conflicts, "resolved field")
												: "Richest source"}
										</p>
									</div>
									<div className="min-w-0">
										<p className="truncate font-medium text-slate-950">
											{row.targetDeviceNames.slice(0, 3).join(", ") ||
												"No target"}
										</p>
										<p className="truncate text-xs text-slate-600">
											{row.targetDeviceNames.length > 3
												? `+${row.targetDeviceNames.length - 3} more target devices`
												: mergePlural(
														row.targetDeviceNames.length,
														"target device",
													)}
										</p>
									</div>
									<div className="text-sm">
										<p className="font-semibold text-slate-950">
											Source {mergeMetricValue(row.fingerprintSourceCount)}
										</p>
										<p className="text-xs text-slate-600">
											{mergeMetricValue(row.fingerprintPresentDevices)}/
											{mergeMetricValue(row.fingerprintExpectedDevices)}{" "}
											devices
											{row.fingerprintGapDevices
												? `; ${mergePlural(row.fingerprintGapDevices, "gap")}`
												: "; aligned"}
										</p>
									</div>
									<div className="text-sm">
										<p className="font-semibold text-slate-950">
											Source {mergeMetricValue(row.faceSourceCount)}
										</p>
										<p className="text-xs text-slate-600">
											{mergeMetricValue(row.facePresentDevices)}/
											{mergeMetricValue(row.faceExpectedDevices)} devices
											{row.faceGapDevices
												? `; ${mergePlural(row.faceGapDevices, "gap")}`
												: "; aligned"}
										</p>
									</div>
									<div className="flex items-center justify-between gap-2">
										<p className="text-sm font-semibold text-slate-950">
											{mergeMetricValue(row.writes)}
										</p>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-8 px-2 text-xs"
											onClick={() => {
												setSdkMergeConfirmOpen(false);
												setSelectedMergeUser(row.key);
											}}>
											Edit
										</Button>
									</div>
								</div>
							))}
						</div>
					</div>
					<div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
						<Button
							type="button"
							variant="outline"
							disabled={startHikvisionSdkUserMergeJobMutation.isPending}
							onClick={() => setSdkMergeConfirmOpen(false)}>
							Back to review
						</Button>
						<Button
							type="button"
							disabled={
								!sdkMergeCanApply || startHikvisionSdkUserMergeJobMutation.isPending
							}
							onClick={() => void applySdkUserMerge()}>
							{startHikvisionSdkUserMergeJobMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Link2 className="h-4 w-4" />
							)}
							{startHikvisionSdkUserMergeJobMutation.isPending
								? "Starting..."
								: `Start peer copy job (${sdkMergeSelectedUniqueCount} IDs)`}
						</Button>
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
											No review issues for this ID. Fingerprint and face are
											aligned across the selected devices.
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
												issueCount > 0
													? "text-amber-800"
													: "text-emerald-800"
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
								{(selectedSdkMergeSourceReviewRow.user.records || []).map(
									(record: any) => {
										const deviceName = mergeDeviceName(
											sdkMergePlanDevices,
											record.deviceId,
										);
										const isRecommended =
											record.deviceId ===
											selectedSdkMergeSourceReviewRow.sourceDeviceId;
										const isCurrent =
											record.deviceId ===
												selectedSdkMergeSourceReviewRow.targetDeviceId ||
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
													{mergeMetricValue(
														mergeCredentialCount(record, "fingerprint"),
													)}
												</span>
												<span className="font-semibold text-slate-950">
													{mergeMetricValue(
														mergeCredentialCount(record, "face"),
													)}
												</span>
												<div className="flex min-w-0 flex-wrap gap-1">
													{isCurrent ? (
														<Badge variant="secondary">Current</Badge>
													) : null}
													{isRecommended ? (
														<Badge variant="success">Recommended</Badge>
													) : null}
													{!isCurrent && !isRecommended ? (
														<span className="truncate text-xs text-slate-500">
															Available
														</span>
													) : null}
												</div>
											</div>
										);
									},
								)}
								{(
									selectedSdkMergeSourceReviewRow.user.missingOnDeviceIds || []
								).map((deviceId) => (
									<div
										key={`${selectedSdkMergeSourceReviewRow.id}:source-modal-missing:${deviceId}`}
										className="grid grid-cols-[minmax(180px,1.4fr)_76px_76px_minmax(140px,1fr)] gap-3 border-b border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-950 last:border-b-0">
										<div className="min-w-0">
											<p className="truncate font-semibold">
												{mergeDeviceName(sdkMergePlanDevices, deviceId)}
											</p>
											<p className="truncate text-xs">
												Missing this vendor user ID
											</p>
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
										sdkMergeState.choices[
											selectedSdkMergeSourceReviewRow.userKey
										]?.[conflict.field] || sdkMergeState.applyAll;
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
											mergeCredentialCount(
												left,
												sdkMergeCredentialPicker.kind,
											) ||
										mergeRecordRichnessScore(right) -
											mergeRecordRichnessScore(left),
								)
								.map((record: any, index: number) => {
									const count = mergeCredentialCount(
										record,
										sdkMergeCredentialPicker.kind,
									);
									const deviceName = mergeDeviceName(
										sdkMergePlanDevices,
										record.deviceId,
									);
									const conflict =
										selectedSdkMergeCredentialRow.user.conflicts.find(
											(item) => item.field === sdkMergeCredentialPicker.kind,
										);
									const isChoiceSource =
										conflict?.deviceA.id === record.deviceId ||
										conflict?.deviceB.id === record.deviceId;
									const selectedChoice =
										sdkMergeState.choices[
											selectedSdkMergeCredentialRow.userKey
										]?.[sdkMergeCredentialPicker.kind] ||
										sdkMergeState.applyAll;
									const selectedDeviceId =
										selectedChoice === "A"
											? conflict?.deviceA.id
											: selectedChoice === "B"
												? conflict?.deviceB.id
												: selectedChoice === "KEEP"
													? undefined
													: [
															...(selectedSdkMergeCredentialRow.user
																.records || []),
														].sort(
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
												<span
													role="link"
													tabIndex={0}
													className="mt-1 inline-block text-[11px] font-medium text-orange-800 underline-offset-2 hover:underline"
													title={`Open ${deviceName} for user ${selectedSdkMergeCredentialRow.vendorUserId}`}
													onClick={(event) => {
														event.preventDefault();
														event.stopPropagation();
														openDeviceUserDeepLink(
															record.deviceId,
															selectedSdkMergeCredentialRow.vendorUserId,
															{ preferSourceView: true },
														);
													}}
													onKeyDown={(event) => {
														if (event.key === "Enter" || event.key === " ") {
															event.preventDefault();
															event.stopPropagation();
															openDeviceUserDeepLink(
																record.deviceId,
																selectedSdkMergeCredentialRow.vendorUserId,
																{ preferSourceView: true },
															);
														}
													}}>
													Open device user details
												</span>
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
						setRawFpExpandIds(new Set());
						setRawFpCaptureBusy(false);
						// Drop deep-link param so closing details does not re-open.
						if (deviceUserDetailsParam) {
							setSearchParams(
								(prev) => {
									const next = new URLSearchParams(prev);
									next.delete("deviceUserDetails");
									return next;
								},
								{ replace: true },
							);
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
											(detailsDeviceUser as any)?.hrisDeviceUser
												?.vendorMetadata?.rawFingerprints ||
											(detailsDeviceUser as any)?.rawPayload
												?._hrisDeviceMetadata?.rawFingerprints ||
											(detailsDeviceUser as any)?.hrisDeviceUser?.rawPayload
												?._hrisDeviceMetadata?.rawFingerprints ||
											null;
										const templates = Array.isArray(rawFp?.templates)
											? rawFp.templates
											: [];
										const rawPresent =
											Boolean(rawFp?.present) ||
											Boolean(
												(detailsDeviceUser as any)?.vendorMetadata
													?.rawFingerprintPresent,
											) ||
											templates.some(
												(t: any) => String(t?.data || "").trim().length > 8,
											);
										const sourceLabel = String(
											rawFp?.source ||
												(detailsDeviceUser as any)?.vendorMetadata
													?.rawFingerprints?.source ||
												"",
										);
										const enrolledCount = Math.max(
											Number(
												getDeviceUserCredentialSummary(detailsDeviceUser)
													.fingerprintCount || 0,
											),
											0,
										);
										const storedCount = Math.min(
											templates.length ||
												Number(rawFp?.fingerprintCount || 0) ||
												0,
											Math.max(enrolledCount, templates.length || 0),
										);
										const missingCount = Math.max(
											enrolledCount - storedCount,
											0,
										);
										return (
											<div
												className={`mt-3 rounded-2xl border px-4 py-3 text-xs ${
													rawPresent
														? "border-emerald-200 bg-emerald-50 text-emerald-950"
														: detailsDeviceUserSavedLoading
															? "border-slate-200 bg-slate-50 text-slate-700"
															: "border-amber-200 bg-amber-50 text-amber-950"
												}`}>
												<p className="font-semibold uppercase tracking-wide">
													Raw fingerprint templates
												</p>
												<p className="mt-2 flex items-center gap-2 text-2xl font-semibold">
													{rawPresent ? (
														`${storedCount} of ${enrolledCount} stored`
													) : detailsDeviceUserSavedLoading ? (
														<>
															<Loader2 className="h-5 w-5 animate-spin" />
															Checking saved templatesâ€¦
														</>
													) : (
														"Not captured yet"
													)}
												</p>
												<p className="mt-1 text-xs font-semibold">
													{enrolledCount <= 0
														? "not_enrolled"
														: missingCount > 0
															? `${missingCount} missing_raw_blob`
															: "All enrolled fingerprint templates stored"}
												</p>
												<p className="mt-2 leading-5">
													{rawPresent
														? "Actual base64 fingerData blobs saved on this DeviceUser (not AES). Create/enroll ledger events keep the same usable templates when captured."
														: detailsDeviceUserSavedLoading
															? "Comparing this live device row with the saved HRIS DeviceUser record."
															: "No raw fingerData is saved yet. Create/enroll normally captures it automatically after the plain device user is resolved; use the repair action below only if that path did not complete."}
												</p>
												{sourceLabel ? (
													<p className="mt-1 text-[10px] text-slate-600">
														source: {sourceLabel}
													</p>
												) : null}
												<div className="mt-3 flex flex-wrap gap-2">
													<Button
														type="button"
														size="sm"
														variant="outline"
														className="h-8 bg-white text-xs"
														disabled={
															rawFpCaptureBusy ||
															!selectedDeviceId ||
															!detailsDeviceUser?.vendorUserId
														}
														onClick={async () => {
															if (
																!selectedDeviceId ||
																!detailsDeviceUser?.vendorUserId
															)
																return;
															setRawFpCaptureBusy(true);
															try {
																const result =
																	await deviceService.captureDeviceUserRawFingerprints(
																		selectedDeviceId,
																		String(
																			detailsDeviceUser.vendorUserId,
																		),
																	);
																const refreshed =
																	result.deviceUser ||
																	(
																		await deviceService.getDeviceUsers(
																			selectedDeviceId,
																			{
																				vendorUserId:
																					String(
																						detailsDeviceUser.vendorUserId,
																					),
																				limit: 1,
																			},
																		)
																	).deviceUsers?.[0];
																if (refreshed) {
																	setDetailsDeviceUser((prev) =>
																		prev
																			? {
																					...prev,
																					vendorMetadata:
																						refreshed.vendorMetadata ||
																						prev.vendorMetadata,
																					rawPayload:
																						refreshed.rawPayload ||
																						prev.rawPayload,
																					hrisDeviceUser:
																						{
																							...(prev.hrisDeviceUser ||
																								{}),
																							...refreshed,
																						} as any,
																				}
																			: prev,
																	);
																}
																await refetchDeviceUserSummary();
																toast.success(
																	result.capture?.rawPresent
																		? `Raw fingerprint captured (${result.capture.totalDataChars || 0} chars)`
																		: "Capture finished without templates",
																);
															} catch (error: any) {
																toast.error(
																	error?.message ||
																		"Failed to capture raw fingerprints",
																);
															} finally {
																setRawFpCaptureBusy(false);
															}
														}}>
														{rawFpCaptureBusy
															? "Capturingâ€¦"
															: rawPresent
																? "Repair: re-capture raw"
																: "Repair: capture raw"}
													</Button>
												</div>
												{rawPresent && templates.length
													? templates.map((tpl: any, idx: number) => {
															const data = String(tpl?.data || "");
															const open = rawFpExpandIds.has(
																`${idx}`,
															);
															return (
																<div
																	key={`raw-fp-${idx}-${tpl?.fingerPrintId || 0}`}
																	className="mt-3 rounded-xl border border-emerald-200 bg-white/80 p-2">
																	<p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
																		Template {idx + 1}
																		{open
																			? " Â· full base64"
																			: " Â· preview"}
																	</p>
																	<p className="mt-1 break-all font-mono text-[10px] leading-4 text-slate-800">
																		{open
																			? data
																			: `${data.slice(0, 120)}${data.length > 120 ? "â€¦" : ""}`}
																	</p>
																	<p className="mt-1 text-[10px] text-emerald-900">
																		length={data.length} chars
																		Â· fingerPrintId=
																		{String(
																			tpl?.fingerPrintId ??
																				"?",
																		)}{" "}
																		Â· type=
																		{String(
																			tpl?.fingerType ?? "?",
																		)}
																	</p>
																	<div className="mt-2 flex flex-wrap gap-2">
																		<button
																			type="button"
																			className="text-[11px] font-semibold text-emerald-800 underline"
																			onClick={() => {
																				setRawFpExpandIds(
																					(prev) => {
																						const next =
																							new Set(
																								prev,
																							);
																						if (
																							next.has(
																								`${idx}`,
																							)
																						)
																							next.delete(
																								`${idx}`,
																							);
																						else
																							next.add(
																								`${idx}`,
																							);
																						return next;
																					},
																				);
																			}}>
																			{open
																				? "Collapse"
																				: "Show full base64 blob"}
																		</button>
																		<button
																			type="button"
																			className="text-[11px] font-semibold text-emerald-800 underline"
																			onClick={async () => {
																				try {
																					await navigator.clipboard.writeText(
																						data,
																					);
																					toast.success(
																						"Raw fingerprint base64 copied",
																					);
																				} catch {
																					toast.error(
																						"Copy failed",
																					);
																				}
																			}}>
																			Copy base64
																		</button>
																	</div>
																</div>
															);
														})
													: null}
											</div>
										);
									})()}
									{(() => {
										const rawFace =
											(detailsDeviceUser as any)?.vendorMetadata?.rawFace ||
											(detailsDeviceUser as any)?.hrisDeviceUser
												?.vendorMetadata?.rawFace ||
											(detailsDeviceUser as any)?.rawPayload
												?._hrisDeviceMetadata?.rawFace ||
											null;
										const facePresent =
											Boolean(rawFace?.present) ||
											Boolean(
												(detailsDeviceUser as any)?.vendorMetadata
													?.rawFacePresent,
											) ||
											String(rawFace?.base64 || "").length > 32;
										const faceCount = Number(
											getDeviceUserCredentialSummary(detailsDeviceUser)
												.faceCount || 0,
										);
										const contentType = String(
											rawFace?.contentType || "image/jpeg",
										);
										const b64 = String(rawFace?.base64 || "");
										return (
											<div
												className={`mt-3 rounded-2xl border px-4 py-3 text-xs ${
													facePresent
														? "border-emerald-200 bg-emerald-50 text-emerald-950"
														: "border-slate-200 bg-slate-50 text-slate-800"
												}`}>
												<p className="font-semibold uppercase tracking-wide">
													Raw face photo
												</p>
												<p className="mt-2 text-2xl font-semibold">
													{facePresent
														? "Stored on DeviceUser"
														: faceCount > 0
															? "Count only â€” raw not pulled"
															: "No face on device"}
												</p>
												<p className="mt-2 leading-5">
													{facePresent
														? "Base64 face image custody on DeviceUser (not on DeviceEvent ledger)."
														: faceCount > 0
															? "UserInfo reports a face count but raw picture was not captured yet."
															: "Device UserInfo has numOfFace=0 / no faceURL for this person â€” nothing to store."}
												</p>
												{faceCount > 0 ? (
													<div className="mt-3 flex flex-wrap gap-2">
														<Button
															type="button"
															size="sm"
															variant="outline"
															className="h-8 bg-white text-xs"
															disabled={
																rawFpCaptureBusy ||
																!selectedDeviceId ||
																!detailsDeviceUser?.vendorUserId
															}
															onClick={async () => {
																if (
																	!selectedDeviceId ||
																	!detailsDeviceUser?.vendorUserId
																)
																	return;
																setRawFpCaptureBusy(true);
																try {
																	const result =
																		await deviceService.captureDeviceUserRawFace(
																			selectedDeviceId,
																			String(
																				detailsDeviceUser.vendorUserId,
																			),
																		);
																	const refreshed =
																		result.deviceUser ||
																		(
																			await deviceService.getDeviceUsers(
																				selectedDeviceId,
																				{
																					vendorUserId:
																						String(
																							detailsDeviceUser.vendorUserId,
																						),
																					limit: 1,
																				},
																			)
																		).deviceUsers?.[0];
																	if (refreshed) {
																		setDetailsDeviceUser(
																			(prev) =>
																				prev
																					? {
																							...prev,
																							vendorMetadata:
																								refreshed.vendorMetadata ||
																								prev.vendorMetadata,
																							rawPayload:
																								refreshed.rawPayload ||
																								prev.rawPayload,
																							hrisDeviceUser:
																								{
																									...(prev.hrisDeviceUser ||
																										{}),
																									...refreshed,
																								} as any,
																						}
																					: prev,
																		);
																	}
																	await refetchDeviceUserSummary();
																	toast.success(
																		result.capture?.present
																			? "Raw face captured"
																			: "Face capture finished without a raw blob",
																	);
																} catch (error: any) {
																	toast.error(
																		error?.message ||
																			"Failed to capture raw face",
																	);
																} finally {
																	setRawFpCaptureBusy(false);
																}
															}}>
															{rawFpCaptureBusy
																? "Capturing..."
																: facePresent
																	? "Repair: re-capture face"
																	: "Repair: capture face"}
														</Button>
													</div>
												) : null}
												{facePresent && b64 ? (
													<div className="mt-3 overflow-hidden rounded-xl border border-emerald-200 bg-white p-2">
														<img
															src={`data:${contentType};base64,${b64}`}
															alt={`Face of device user ${detailsDeviceUser?.vendorUserId || ""}`}
															className="mx-auto max-h-40 rounded-lg object-contain"
														/>
														<p className="mt-2 text-[10px] text-emerald-900">
															bytesâ‰ˆ
															{String(
																rawFace?.byteLength || b64.length,
															)}{" "}
															Â· source=
															{String(rawFace?.source || "?")}
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
										DeviceUser is the current biometric custody plane.
										Create/enroll events also retain the same usable raw
										fingerprint or face data when capture succeeds, so the
										ledger journey is complete without a manual repair action.
										Dev mock tallies stay separate from physical device truth.
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
												<button
													type="button"
													key={row.deviceId}
													onClick={() =>
														openDeviceUserDeepLink(
															row.deviceId,
															detailsDeviceUserVendorUserId ||
																detailsDeviceUser?.vendorUserId,
															{ preferSourceView: true },
														)
													}
													className={`grid w-full grid-cols-[minmax(150px,1.4fr)_92px_72px_72px_72px] gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 transition-colors hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-300 ${
														row.isCurrentDevice
															? "bg-orange-50/50"
															: "bg-white"
													}`}
													title={`Open ${row.deviceName} in Sync Center for user ${detailsDeviceUserVendorUserId || detailsDeviceUser?.vendorUserId || ""}`}
													aria-label={`Open device ${row.deviceName} for user ${detailsDeviceUserVendorUserId || detailsDeviceUser?.vendorUserId || "details"}`}>
													<div className="min-w-0">
														<p className="truncate font-medium text-orange-800 underline-offset-2 hover:underline">
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
												</button>
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
									Preview checks the selected rows first. Exports include device
									IDs, HRIS links, card totals, and available fingerprint or face
									custody data without changing the device.
								</p>
							</div>
							<Badge variant="secondary" className="self-start">
								{deviceUserExportScopeLabel}: {deviceUserExportScopeCountLabel}
							</Badge>
						</div>
					</div>
					{isDeviceUserExportBusy ? (
						<div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-950">
							<div className="flex items-start gap-2">
								<Loader2 className="mt-0.5 h-4 w-4 animate-spin shrink-0" />
								<div className="min-w-0">
									<p className="font-semibold">{deviceUserExportActionLabel}</p>
									<p className="mt-1 text-xs text-orange-900">
										{deviceUserExportScopeLabel} Â·{" "}
										{deviceUserExportScopeCountLabel} Â·{" "}
										{deviceUserExportState.format === "json"
											? "Package JSON"
											: deviceUserExportState.format === "excel"
												? "Excel workbook"
												: "CSV file"}
									</p>
									<p className="mt-1 text-xs text-orange-900">
										{deviceUserExportBiometricLoadingLabel}
									</p>
								</div>
							</div>
						</div>
					) : null}
					<div className="grid gap-2 sm:grid-cols-4">
						{[
							[
								"currentPage",
								"Current page",
								deviceUserExportCountLabel(pagedExportVendorUserIds.length),
							],
							[
								"filtered",
								"Current filter",
								deviceUserExportCountLabel(shownDeviceUserCount),
							],
							[
								"selectedRows",
								"Selected rows",
								`${selectedExportVendorUserIds.length} rows`,
							],
							[
								"all",
								"All device users",
								deviceUserExportCountLabel(mergedDeviceUserRows.length),
							],
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
							Package exports carry only custody data already proven in HRIS. When a
							fingerprint or face is not available, the spreadsheet keeps an explicit
							status so reviewers can see what still needs attention.
						</p>
					</div>
					<div className="grid gap-2 text-sm sm:grid-cols-3">
						{[
							["includeCards", "Cards"],
							["includeFingerprints", "Fingerprints"],
							["includeFaces", "Faces"],
							["rawBiometricPackage", "Biometric custody package"],
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
										<p className="text-xs font-medium text-slate-600">
											{label}
										</p>
										<p className="text-lg font-semibold text-slate-950">
											{metricValue(value)}
										</p>
									</div>
								))}
							</div>
							<div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
								<p className="font-semibold text-slate-950">Biometric readiness</p>
								<p className="mt-1">
									Fingerprints ready:{" "}
									{(deviceUserExportState.preview.summary.biometrics as any)
										?.fingerprintRawBlobsCaptured || 0}{" "}
									of{" "}
									{deviceUserExportState.preview.summary.biometrics
										?.fingerprintCountReported || 0}
									. Faces ready:{" "}
									{(deviceUserExportState.preview.summary.biometrics as any)
										?.faceRawBlobsCaptured || 0}{" "}
									of{" "}
									{deviceUserExportState.preview.summary.biometrics
										?.faceCountReported || 0}
									.
								</p>
							</div>
						</div>
					) : null}
					{deviceUserExportState.preview?.devices?.[0]?.capabilities ? (
						<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
							<p className="font-semibold">Credential custody</p>
							<p className="mt-1 text-amber-900">
								Fingerprint custody ready:{" "}
								{(deviceUserExportState.preview.summary.biometrics as any)
									?.fingerprintRawBlobsCaptured || 0}{" "}
								of{" "}
								{deviceUserExportState.preview.summary.biometrics
									?.fingerprintCountReported || 0}{" "}
								enrolled records.
							</p>
							<p className="mt-1 text-amber-900">
								Face custody ready:{" "}
								{(deviceUserExportState.preview.summary.biometrics as any)
									?.faceRawBlobsCaptured || 0}{" "}
								of{" "}
								{deviceUserExportState.preview.summary.biometrics
									?.faceCountReported || 0}{" "}
								enrolled records.
							</p>
							<p className="mt-1 text-amber-900">
								Export readiness:{" "}
								{formatDeviceUserExportReadiness(
									deviceUserExportState.preview.rawBiometricPackage?.status,
								)}
							</p>
						</div>
					) : null}
					{deviceUserExportState.result ? (
						<div
							className={`rounded-md border px-3 py-2 text-sm ${
								deviceUserExportState.result.rawBiometricPackage?.errors?.length
									? "border-amber-200 bg-amber-50 text-amber-950"
									: "border-emerald-200 bg-emerald-50 text-emerald-950"
							}`}>
							{deviceUserExportState.result.rawBiometricPackage?.errors?.length ? (
								<p className="font-semibold">
									Partial export:{" "}
									{deviceUserExportState.result.rawBiometricPackage.errors.length}{" "}
									enrolled biometric records still need custody review.
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
							disabled={isDeviceUserExportPreviewing || isLoadingDeviceUserExportRows}
							onClick={() => void previewDeviceUserExport()}>
							{isDeviceUserExportPreviewing ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Eye className="h-4 w-4" />
							)}
							{isDeviceUserExportPreviewing ? "Previewing..." : "Preview"}
						</Button>
						<Button
							type="button"
							disabled={
								isDeviceUserExportDownloading ||
								isDeviceUserExportPreviewing ||
								startDeviceUserSyncJobMutation.isPending ||
								isLoadingDeviceUserExportRows
							}
							onClick={() => void exportDeviceUserFile()}>
							{isDeviceUserExportDownloading ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Download className="h-4 w-4" />
							)}
							{isDeviceUserExportDownloading ? "Exporting" : "Export"}{" "}
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
							preview fingerprint or face custody data before any write is allowed.
						</p>
					</div>
					<div className="grid gap-2 sm:grid-cols-2">
						{[
							["csv", "CSV", "Spreadsheet import"],
							["json", "Package JSON", "Device-user package import"],
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
									const blob = new Blob(
										[`\uFEFF${buildDeviceUserCsvTemplate()}`],
										{
											type: "text/csv;charset=utf-8",
										},
									);
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
							placeholder="{ ... raw biometric package export ... }"
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
										"Execute is available after typed confirmation. Reachable source copy reads from a source device; package data writes the custody data carried in the file."}
								</p>
								<p className="mt-1 text-amber-900">
									Package data:{" "}
									{deviceUserImportState.preview.rawBiometricPackage?.present
										? `${deviceUserImportState.preview.rawBiometricPackage.rawFingerprintBlobCount || 0} fingerprint / ${deviceUserImportState.preview.rawBiometricPackage.rawFaceBlobCount || 0} face records`
										: "no biometric custody data in file"}
									{" / "}
									{deviceUserImportState.preview.rawBiometricPackage?.transferModes?.join(
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
														{row.transferMode === "rawPackage"
															? "Package data"
															: row.transferMode === "sdkPeerCopy"
																? "Reachable source copy"
																: "Metadata only"}
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
												| "rawPackage",
										}))
									}
									className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200">
									<option value="sdkPeerCopy">Reachable source copy</option>
									<option value="rawPackage">Package data</option>
									<option value="metadataOnly">Metadata only</option>
								</select>
							</label>
							<label className="space-y-1 text-sm">
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
										Recommended for biometric peer copy batches; preview and
										typed confirmation are still required.
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
										of{" "}
										{metricValue(deviceUserImportState.result.counts?.planned)}{" "}
										planned rows
									</p>
									<p className="mt-1 break-all text-xs text-emerald-900">
										Backup: {deviceUserImportState.result.backupDir}
									</p>
								</>
							)}
							<p className="mt-1 text-xs text-emerald-900">
								Package data used:{" "}
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
						<EmployeePickerSelect
							value={selectedEmployeeForLink}
							onValueChange={setSelectedEmployeeForLink}
							placeholder="Select employee"
							searchPlaceholder="Search employee name, ID, device ID..."
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
							jobId: null,
							jobStatus: null,
							jobStage: null,
							jobMessage: null,
							jobElapsedMs: null,
							jobEvents: [],
						});
					}
				}}
				title="Copy device user to peer"
				description="Copy this Hikvision user to one peer or every peer. Face + fingerprints run as a durable job with live progress (not a silent spinner). Keep this open until completed."
				className="max-w-lg"
				showCloseButton={!isCopyDeviceUserSubmitting}
				closeOnBackdropClick={!isCopyDeviceUserSubmitting}>
				<div className="space-y-4">
					{(isCopyDeviceUserSubmitting || copyDeviceUserState.jobId) && (
						<div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-950">
							<div className="flex items-center gap-2 font-semibold">
								{isCopyDeviceUserSubmitting ? (
									<Loader2 className="h-4 w-4 animate-spin shrink-0" />
								) : null}
								<span>
									{formatPeerCopyStageLabel(copyDeviceUserState.jobStage)}
									{copyDeviceUserState.jobStatus
										? ` · ${copyDeviceUserState.jobStatus}`
										: ""}
								</span>
							</div>
							<p className="mt-1 text-xs text-blue-900/90">
								{copyDeviceUserState.jobMessage ||
									copyDeviceUserStatusMessage ||
									"Waiting for first progress heartbeat…"}
							</p>
							<div className="mt-2 flex flex-wrap gap-3 text-[11px] text-blue-800">
								{copyDeviceUserState.jobId ? (
									<span>Job {String(copyDeviceUserState.jobId).slice(0, 8)}…</span>
								) : null}
								{typeof copyDeviceUserState.jobElapsedMs === "number" ? (
									<span>
										Elapsed {Math.round(copyDeviceUserState.jobElapsedMs / 1000)}s
									</span>
								) : null}
								{copyDeviceUserState.includeFingerprints ? (
									<span>Fingerprints on</span>
								) : (
									<span>Fingerprints off</span>
								)}
								{copyDeviceUserState.includeFaceRecognition ? (
									<span>Face on</span>
								) : (
									<span>Face off</span>
								)}
							</div>
							{(copyDeviceUserState.jobEvents || []).length > 0 ? (
								<ul className="mt-2 max-h-28 space-y-1 overflow-y-auto border-t border-blue-100 pt-2 text-[11px] text-blue-900">
									{(copyDeviceUserState.jobEvents || []).slice(-8).map((event, index) => (
										<li key={`${event.at || "e"}-${index}`}>
											<span className="font-medium">
												{formatPeerCopyStageLabel(event.stage)}
											</span>
											{event.message ? `: ${event.message}` : ""}
										</li>
									))}
								</ul>
							) : null}
						</div>
					)}
					{copyDeviceUserStatusMessage && !isCopyDeviceUserSubmitting ? (
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
									jobId: null,
									jobStatus: null,
									jobStage: null,
									jobMessage: null,
									jobElapsedMs: null,
									jobEvents: [],
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
								? copyDeviceUserState.jobStage
									? formatPeerCopyStageLabel(copyDeviceUserState.jobStage)
									: "Copying…"
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

			<Modal
				open={Boolean(deleteTarget) || deleteSelectedTargets.length > 0}
				onOpenChange={(open) => {
					if (
						!open &&
						!deleteDeviceUserMutation.isPending &&
						!deleteDeviceUsersMutation.isPending
					) {
						setDeleteTarget(null);
						setDeleteSelectedTargets([]);
					}
				}}
				title={
					deleteSelectedTargets.length > 0
						? "Delete selected device users"
						: "Delete device user"
				}
				description={
					deleteSelectedTargets.length > 0
						? "Delete the selected unlinked users from this Hikvision device and remove their saved HRIS DeviceUser rows."
						: "Delete this user from the selected Hikvision device and remove its saved HRIS DeviceUser row."
				}
				className="max-w-lg"
				showCloseButton={
					!deleteDeviceUserMutation.isPending && !deleteDeviceUsersMutation.isPending
				}
				closeOnBackdropClick={
					!deleteDeviceUserMutation.isPending && !deleteDeviceUsersMutation.isPending
				}>
				<div className="space-y-4">
					{deleteTarget ? (
						<div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-950">
							<p className="font-semibold">
								Confirm this exact device user should be deleted.
							</p>
							<div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
								<div>
									<span className="block text-red-700">Device user</span>
									<span className="font-semibold">
										{deleteTarget.displayName || deleteTarget.vendorUserId}
									</span>
								</div>
								<div>
									<span className="block text-red-700">Vendor user ID</span>
									<span className="font-semibold">
										{deleteTarget.vendorUserId}
									</span>
								</div>
								<div>
									<span className="block text-red-700">HRIS row</span>
									<span className="font-semibold">
										{deleteTarget.hrisDeviceUser
											? "Will be removed"
											: "No saved row"}
									</span>
								</div>
								<div>
									<span className="block text-red-700">Device</span>
									<span className="font-semibold">
										{selectedDevice?.name || "-"}
									</span>
								</div>
							</div>
						</div>
					) : null}
					{deleteSelectedTargets.length > 0 ? (
						<div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-950">
							<p className="font-semibold">
								Confirm {deleteSelectedTargets.length} selected unlinked device
								users should be deleted.
							</p>
							<div className="mt-3 max-h-36 space-y-1 overflow-auto text-xs">
								{deleteSelectedTargets.slice(0, 12).map((row) => (
									<div
										key={row.vendorUserId}
										className="flex justify-between gap-3">
										<span className="truncate">
											{row.displayName || "Unnamed device user"}
										</span>
										<span className="font-semibold">{row.vendorUserId}</span>
									</div>
								))}
								{deleteSelectedTargets.length > 12 ? (
									<p className="pt-1 text-red-700">
										+{deleteSelectedTargets.length - 12} more selected users
									</p>
								) : null}
							</div>
						</div>
					) : null}
					<p className="text-sm font-medium text-slate-800">
						Are you sure you want to delete{" "}
						{deleteSelectedTargets.length > 0
							? "these device users"
							: "this device user"}
						?
					</p>
					<p className="text-xs text-slate-600">
						This calls the selected Hikvision device over HTTP, then removes only the
						matching HRIS DeviceUser inventory row after the device no longer returns
						that user. It does not delete employee records or saved DeviceEvent history.
						Linked device users must be unlinked first.
					</p>
					<div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
						<Button
							type="button"
							variant="outline"
							disabled={
								deleteDeviceUserMutation.isPending ||
								deleteDeviceUsersMutation.isPending
							}
							onClick={() => {
								setDeleteTarget(null);
								setDeleteSelectedTargets([]);
							}}>
							Cancel
						</Button>
						<Button
							type="button"
							className="bg-red-700 text-white hover:bg-red-800"
							disabled={
								deleteDeviceUserMutation.isPending ||
								deleteDeviceUsersMutation.isPending ||
								(!deleteTarget && deleteSelectedTargets.length === 0)
							}
							onClick={confirmDeleteDeviceUser}>
							{deleteDeviceUserMutation.isPending ||
							deleteDeviceUsersMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Trash2 className="h-4 w-4" />
							)}
							{deleteSelectedTargets.length > 0
								? `Delete ${deleteSelectedTargets.length} users`
								: "Delete device user"}
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
