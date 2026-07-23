import { Request, Response, NextFunction } from "express";
import * as XLSX from "xlsx";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { transformFormDataToObject } from "../../helper/transformObject";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
	getNestedFields,
} from "../../helper/query-builder.helper";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler.helper";
import { groupDataByField } from "../../helper/dataGrouping";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { CreateDeviceSchema, UpdateDeviceSchema } from "../../zod/device.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { config as appConfig } from "../../config/config";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { emitDeviceEventSaved } from "../../helper/device-event-realtime.helper";
import { createEmployeeHelpers } from "../../helper/employee.helper";
import {
	buildHikvisionDeviceEventDedupeKey,
	buildHikvisionLogSearchXml,
	classifyHikvisionLogSearchRow,
	normalizeHikvisionDeviceEventSource,
	normalizeHikvisionFutureSkewedEventTime,
	normalizeHikvisionLogSearchRow,
	paginateHikvisionLogSearch,
	parseHikvisionBusinessDateBound,
	parseHikvisionEventTime,
	parseHikvisionLogSearchResponse,
	type NormalizedHikvisionEvidenceEvent,
} from "../../helper/hikvision-event-contract.helper";
import { classifyDeviceEvent } from "../../helper/device-event-taxonomy.helper";
import {
	buildHikvisionSourceChecks,
	buildHikvisionSyncLogsEventRows,
	buildZktecoSyncLogsEventRows,
	countAlreadyInHrisByAction,
} from "../../helper/sync-logs-event-rows.helper";
import { hikvisionEndpoint } from "../../config/hikvision.endpoint";
import {
	buildHikvisionDeviceBaseUrl,
	getHikvisionDeviceHttpPort,
	hikvisionFetch,
	hikvisionFetchBinary,
	resolveHikvisionTunnelTarget,
} from "../../lib/hikvision-client";
import {
	buildDeviceUserEmployeeNoCandidates,
	extractHikvisionCredentialSummary,
	normalizeHikvisionDeviceUser,
	resolveDeviceUserLinkDecision,
	summarizeDeviceUserStatuses,
	type DeviceUserCandidate,
} from "../../helper/device-user-sync.helper";
import {
	applyMergeChoices,
	buildDeviceUserMergePlan,
	serializeDeviceUserMergePlanForReview,
	type DeviceUserMergeField,
	type DeviceUserMergeRecord,
} from "../../helper/device-user-merge.helper";
import { buildDeviceRuntimeConfig } from "../../helper/device-config-defaults.helper";
import { summarizeHikvisionListenerLogs } from "../../helper/hikvision-listener-status.helper";
import { resolveHikvisionDeviceHealthNetworkTarget } from "../../helper/device-health.helper";
import { buildDeviceEventSearchTerms } from "../../helper/device-event-search.helper";
import { resolveHikvisionRuntimeRoute } from "../../helper/hikvision-runtime-route.helper";
import { controller as callbackController } from "../hikvision/controller/callback.controller";
import {
	decryptPortableBiometricEnvelope,
	encryptPortableBiometricEnvelope,
	PORTABLE_BIOMETRIC_ENVELOPE_FORMAT,
} from "./biometric-envelope.helper";
import net from "net";
import { execFile } from "child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "crypto";
import fs from "fs/promises";
import fsSync from "fs";
import * as os from "os";
import path from "path";

const logger = getLogger();
const deviceLogger = logger.child({ module: "device" });
const DEVICE_EVENT_STATUSES = new Set([
	"RECEIVED",
	"MATCHED",
	"ATTENDANCE_CREATED",
	"ATTENDANCE_UPDATED",
	"IGNORED",
	"UNMATCHED",
	"FAILED",
]);
const DEVICE_EVENT_SOURCES = new Set([
	"HIKVISION_CALLBACK",
	"EN_HCNETSDK_ALARM",
	"ZKTECO_EVENT",
	// Logical label only until DB enum + Prisma client include this value.
	"EN_SYNTHETIC_KIOSK_TAP",
]);
/** Public/logical synthetic label for API + payload. */
const SYNTHETIC_KIOSK_TAP_SOURCE = "EN_SYNTHETIC_KIOSK_TAP";
/**
 * Persisted Prisma/DB source value. Current deployed DeviceEventSource enums
 * only accept HIKVISION_CALLBACK | EN_HCNETSDK_ALARM | ZKTECO_EVENT. Synthetic
 * truth is still explicit in payload/eventLabel/API response.
 */
const SYNTHETIC_KIOSK_TAP_PERSISTED_SOURCE = "EN_HCNETSDK_ALARM";
const DEVICE_EVENT_CATEGORIES = new Set([
	"ATTENDANCE",
	"ENROLLMENT",
	"USER_MANAGEMENT",
	"ACCESS_CONTROL",
	"DEVICE_HEALTH",
	"RUNTIME",
	"UNKNOWN_VENDOR",
]);
const DEVICE_EVENT_ACTIONS = new Set([
	"TAP",
	"FINGERPRINT_ENROLLED",
	"FINGERPRINT_UPDATED",
	"FINGERPRINT_DELETED",
	"FACE_ENROLLED",
	"FACE_UPDATED",
	"FACE_DELETED",
	"CARD_ENROLLED",
	"CARD_UPDATED",
	"CARD_DELETED",
	"USER_CREATED",
	"USER_UPDATED",
	"USER_DELETED",
	"TAP_REJECTED",
	"SYNC_SIGNAL",
	"SYNC_IMPORTED",
	"LISTENER_RECEIVED",
	"UNKNOWN",
]);
const DEVICE_EVENT_CONFIDENCES = new Set(["PROVEN", "SUPPORTED", "INFERRED", "UNKNOWN"]);
const DEVICE_EVENT_RESET_ADMIN_ROLES = new Set([
	"hris-admin",
	"admin",
	"super_admin",
	"superadmin",
]);
const DEVICE_USER_ADMIN_ROLES = new Set(["hris-admin", "admin", "super_admin", "superadmin"]);
const DEVICE_ADDRESS_PORT_CONFLICT_MESSAGE = "Another device already uses this address and port.";
const HIKVISION_HOT_RELOAD_LISTENER_SERVICE = "project-truth-hikvision-hot-reload-listener.service";
const HIKVISION_LISTENER_CONTROL_ACTIONS = new Set(["start", "stop", "restart"]);
const HIKVISION_LISTENER_STATUS_EVIDENCE_LINES = 5000;
const HIKVISION_LISTENER_STATUS_KEY_EVENT_LINES = 20000;
const HIKVISION_LISTENER_STATUS_RESPONSE_LINES = 80;
const HIKVISION_VM_WRAPPER_REMOTE_PATH =
	"/usr/local/bin/project-truth-hikvision-hot-reload-listener";
const HIKVISION_VM_DAEMON_REMOTE_PATH = "/usr/local/bin/project-truth-hikvision-hot-reload-daemon";
const HIKVISION_VM_WRAPPER_TMP_PATH = "/tmp/project-truth-hikvision-hot-reload-listener.sh";
const HIKVISION_VM_DAEMON_TMP_PATH = "/tmp/project-truth-hikvision-hot-reload-daemon.sh";
const HIKVISION_VM_SERVICE_REMOTE_PATH = `/etc/systemd/system/${HIKVISION_HOT_RELOAD_LISTENER_SERVICE}`;
const HIKVISION_VM_SERVICE_TMP_PATH = `/tmp/${HIKVISION_HOT_RELOAD_LISTENER_SERVICE}`;
const HIKVISION_VM_LOCAL_API_BASE =
	String(process.env.HIKVISION_VM_LOCAL_API_BASE || "").trim() || "http://127.0.0.1:3101";
const HIKVISION_PREVIEW_SEARCH_TIMEOUT_MS = Math.max(
	1000,
	Math.min(Number(process.env.HIKVISION_PREVIEW_SEARCH_TIMEOUT_MS || 1800), 10000),
);
const HIKVISION_PREVIEW_TOTAL_TIMEOUT_MS = Math.max(
	750,
	Math.min(Number(process.env.HIKVISION_PREVIEW_TOTAL_TIMEOUT_MS || 1500), 5000),
);
/** Hard budget per device for Sync logs modal (must stay open in ~1-3s overall). */
const HIKVISION_PREVIEW_DEVICE_BUDGET_MS = Math.max(
	800,
	Math.min(Number(process.env.HIKVISION_PREVIEW_DEVICE_BUDGET_MS || 1800), 3500),
);
/** Overall source-total budget for Sync Center preview. DB/HRIS counts still return. */
const HIKVISION_SYNC_PREVIEW_SOURCE_BUDGET_MS = Math.max(
	1000,
	Math.min(Number(process.env.HIKVISION_SYNC_PREVIEW_SOURCE_BUDGET_MS || 3500), 4000),
);
const HIKVISION_FAST_USER_COUNT_TIMEOUT_MS = Math.max(
	1500,
	Math.min(Number(process.env.HIKVISION_FAST_USER_COUNT_TIMEOUT_MS || 2200), 6000),
);
const HIKVISION_PEER_COPY_RETRY_LIMIT = Math.max(
	1,
	Math.min(Number(process.env.HIKVISION_PEER_COPY_RETRY_LIMIT || 2), 4),
);
const HIKVISION_PEER_COPY_COMPLETION_WAIT_MS = Math.max(
	0,
	Math.min(Number(process.env.HIKVISION_PEER_COPY_COMPLETION_WAIT_MS || 90000), 180000),
);
const DEVICE_USER_IMPORT_ROW_TIMEOUT_MS = Math.max(
	30000,
	Math.min(Number(process.env.DEVICE_USER_IMPORT_ROW_TIMEOUT_MS || 90000), 180000),
);
const DEVICE_USER_SYNC_CONCURRENCY = Math.max(
	1,
	Math.min(Number(process.env.DEVICE_USER_SYNC_CONCURRENCY || 2), 4),
);
const DEVICE_USER_EXPORT_SCHEMA_VERSION = "project-truth.hikvision-device-users.v1";
const DEVICE_USER_IMPORT_CONFIRMATION = "IMPORT DEVICE USERS";
const DEVICE_USER_BIOMETRIC_BUNDLE_ALGORITHM = "aes-256-gcm";
const DEVICE_USER_PACKAGE_IMPORT_JOB_DIR = path.join(
	process.cwd(),
	"..",
	".runtime",
	"device-user-import-jobs",
);
const DEVICE_IMPORT_JOB_DIR = path.join(process.cwd(), "..", ".runtime", "device-import-jobs");
const DEVICE_USER_SYNC_JOB_DIR = path.join(
	process.cwd(),
	"..",
	".runtime",
	"device-user-sync-jobs",
);
const DEVICE_USER_MERGE_JOB_DIR = path.join(
	process.cwd(),
	"..",
	".runtime",
	"device-user-merge-jobs",
);
const DEVICE_IMPORT_JOB_PROCESSING_STALE_MS = 30 * 60 * 1000;
const DEVICE_USER_SYNC_PROCESSING_STALE_MS = 30 * 60 * 1000;
/** Merge peer-copy can sit in one long VM batch; still treat silent processing as dead after this. */
const DEVICE_USER_MERGE_PROCESSING_STALE_MS = Math.max(
	5 * 60 * 1000,
	Math.min(
		Number(process.env.HIKVISION_MERGE_JOB_STALE_MS || 45 * 60 * 1000),
		3 * 60 * 60 * 1000,
	),
);

type DeviceImportJobStatus = "processing" | "completed" | "failed" | "cancelled";

type DeviceImportJob = {
	jobId: string;
	runId?: string;
	status: DeviceImportJobStatus;
	organizationId: string;
	deviceId: string;
	deviceName: string;
	total: number;
	sourceTotal?: number | null;
	attendanceSourceTotal?: number | null;
	operationSourceTotal?: number | null;
	targetImportCount?: number | null;
	targetAttendanceCount?: number | null;
	targetOperationsCount?: number | null;
	scanLimit?: number | null;
	processed: number;
	imported: number;
	skipped: number;
	alreadySaved?: number;
	knownSkipped?: number;
	skipMissingEmployeeNo?: boolean;
	/** Save attendance taps (ACS AcsEvent). Default true. */
	includeAttendance?: boolean;
	/** Save user/enrollment activity from Information logSearch. Default true. */
	includeOperations?: boolean;
	/** all | 7d | 30d | 90d */
	timeWindow?: string;
	sourceGroup?: "all" | "attendance" | "operations" | "needsReview";
	from?: string | null;
	to?: string | null;
	startTime?: string | null;
	endTime?: string | null;
	phase?: string | null;
	attendanceImported?: number;
	operationsImported?: number;
	cancelRequested?: boolean;
	cancelRequestedAt?: Date;
	failed: number;
	message: string;
	errors: Array<{ row: number; error: string }>;
	startedAt: Date;
	updatedAt?: Date;
	completedAt?: Date;
	stale?: boolean;
};

const deviceImportJobs = new Map<string, DeviceImportJob>();

type DeviceUserPackageImportJobStatus = "processing" | "completed" | "failed";

type DeviceUserPackageImportJob = {
	jobId: string;
	status: DeviceUserPackageImportJobStatus;
	organizationId: string;
	targetDeviceId?: string | null;
	targetDeviceName?: string | null;
	planned: number;
	imported: number;
	failed: number;
	skipped: number;
	message: string;
	backupDir?: string | null;
	plaintextBiometricExposed: false;
	results: any[];
	error?: string | null;
	startedAt: Date;
	completedAt?: Date;
};

const deviceUserPackageImportJobs = new Map<string, DeviceUserPackageImportJob>();

const serializeDeviceUserPackageImportJob = (job: DeviceUserPackageImportJob) => ({
	...job,
	startedAt: job.startedAt instanceof Date ? job.startedAt.toISOString() : job.startedAt,
	completedAt:
		job.completedAt instanceof Date ? job.completedAt.toISOString() : job.completedAt || null,
	plaintextBiometricExposed: false,
});

const persistDeviceUserPackageImportJob = (job: DeviceUserPackageImportJob) => {
	try {
		fsSync.mkdirSync(DEVICE_USER_PACKAGE_IMPORT_JOB_DIR, { recursive: true });
		fsSync.writeFileSync(
			path.join(DEVICE_USER_PACKAGE_IMPORT_JOB_DIR, `${job.jobId}.json`),
			JSON.stringify(serializeDeviceUserPackageImportJob(job), null, 2),
		);
	} catch (error) {
		deviceLogger.warn(`Failed to persist device-user import job snapshot: ${error}`);
	}
};

const readDeviceUserPackageImportJob = (jobId: string): DeviceUserPackageImportJob | null => {
	try {
		const filePath = path.join(DEVICE_USER_PACKAGE_IMPORT_JOB_DIR, `${jobId}.json`);
		if (!fsSync.existsSync(filePath)) return null;
		const parsed = JSON.parse(fsSync.readFileSync(filePath, "utf8"));
		return {
			...parsed,
			startedAt: parsed.startedAt ? new Date(parsed.startedAt) : new Date(),
			completedAt: parsed.completedAt ? new Date(parsed.completedAt) : undefined,
			plaintextBiometricExposed: false,
			results: Array.isArray(parsed.results) ? parsed.results : [],
		};
	} catch (error) {
		deviceLogger.warn(`Failed to read device-user import job snapshot: ${error}`);
		return null;
	}
};

type DeviceUserSyncJobStatus = "processing" | "completed" | "failed" | "cancelled";
type DeviceUserSyncMode =
	| "full_refresh"
	| "needs_attention_only"
	| "peer_converge"
	| "biometrics_only";

type DeviceUserSyncJobResult = {
	deviceId: string;
	deviceName: string;
	status: "success" | "needs_attention" | "error" | "cancelled";
	summary?: Record<string, any>;
	runId?: string | null;
	error?: string | null;
};

type DeviceUserSyncDecisionBucketKey =
	| "missing_device_user_record"
	| "missing_employee_link"
	| "missing_raw_fingerprint_blob"
	| "missing_raw_face_blob"
	| "already_present"
	| "stale_count_only_or_live_no_data"
	| "unsupported_by_sync";

type DeviceUserSyncDecisionBucket = {
	key: DeviceUserSyncDecisionBucketKey;
	label: string;
	count: number;
	why: string;
	canSyncCreate: boolean;
	defaultIncluded: boolean;
	filter: string;
};

type DeviceUserSyncDecisionMatrix = {
	buckets: DeviceUserSyncDecisionBucket[];
	counts: Record<DeviceUserSyncDecisionBucketKey, number>;
	selectedFastPlan: DeviceUserSyncMode;
	selectedFastPlanReason: string;
	sourceReadRequired: boolean;
	sourceReadReason: string;
	jobStages: string[];
};

type DeviceUserSyncJob = {
	jobId: string;
	status: DeviceUserSyncJobStatus;
	syncMode: DeviceUserSyncMode;
	organizationId: string;
	decisionMatrix?: DeviceUserSyncDecisionMatrix | null;
	jobStages?: string[];
	currentStage?: string | null;
	totalDevices: number;
	processedDevices: number;
	successfulDevices: number;
	failedDevices: number;
	biometricTotal: number;
	biometricProcessed: number;
	biometricCaptured: number;
	biometricCached: number;
	biometricFailed: number;
	biometricFailureLog?: Array<{
		deviceId: string;
		deviceName?: string | null;
		vendorUserId: string;
		modality: "fingerprint" | "face";
		reason: string;
		at: string;
	}>;
	currentDeviceId?: string | null;
	currentDeviceName?: string | null;
	currentVendorUserId?: string | null;
	currentModality?: "fingerprint" | "face" | null;
	message: string;
	cancelRequested?: boolean;
	cancelRequestedAt?: Date;
	stale?: boolean;
	results: DeviceUserSyncJobResult[];
	startedAt: Date;
	updatedAt: Date;
	completedAt?: Date;
};

type HikvisionCapabilityStatus =
	| "supported"
	| "notSupported"
	| "methodNotAllowed"
	| "authFailed"
	| "unknown";

type DeviceUserMergeJobStatus = "processing" | "completed" | "failed";

type DeviceUserMergeJob = {
	jobId: string;
	planId: string;
	scopeHash?: string;
	retryPlanId?: string;
	status: DeviceUserMergeJobStatus;
	organizationId: string;
	totalWrites: number;
	processedWrites: number;
	successfulWrites: number;
	alreadyConvergedWrites?: number;
	failedWrites: number;
	message: string;
	currentStage?: string;
	currentUserKey?: string | null;
	currentTargetDeviceId?: string | null;
	results: any[];
	progressEvents?: any[];
	writeMatrix?: any;
	copyFailureSummary?: any;
	remainingConflicts?: number;
	remainingMissing?: number;
	attention?: number;
	error?: string | null;
	/** True when a processing snapshot was revived after worker death / API restart. */
	stale?: boolean;
	/** Disk snapshot path for agent recovery (relative or absolute). */
	snapshotPath?: string | null;
	startedAt: Date;
	updatedAt?: Date;
	completedAt?: Date;
};

const deviceUserSyncJobs = new Map<string, DeviceUserSyncJob>();
const deviceUserMergeJobs = new Map<string, DeviceUserMergeJob>();
const deviceUserMergePlans = new Map<
	string,
	{ organizationId: string; plan: any; createdAt: Date; req: Request }
>();

const buildDeviceUserMergeWriteMatrix = (plan: any) => {
	const devices = Array.isArray(plan?.devices) ? plan.devices : [];
	const deviceById = new Map<string, any>(
		devices.map((device: any) => [String(device.id), device]),
	);
	const deviceLabel = (deviceId: string) => {
		const device = deviceById.get(String(deviceId));
		return device?.name || device?.address || deviceId;
	};
	const perTarget = new Map<string, any>();
	const perSource = new Map<string, any>();
	const rows = (Array.isArray(plan?.users) ? plan.users : []).map((user: any) => {
		const selectedConflict = (user.conflicts || []).find((conflict: any) => conflict.choice);
		const sourceDeviceId =
			selectedConflict?.choice === "B"
				? selectedConflict.deviceB.id
				: selectedConflict?.choice === "A"
					? selectedConflict.deviceA.id
					: user.sourceDeviceId;
		const sourceRecord =
			(user.records || []).find((record: any) => record.deviceId === sourceDeviceId) ||
			(user.records || []).find((record: any) => record.deviceId === user.sourceDeviceId) ||
			(user.records || [])[0];
		const sourceCredentials = extractHikvisionCredentialSummary(sourceRecord?.rawPayload || {});
		const expectedDeviceCount = devices.length;
		const fingerprintPresentDevices = (user.records || []).filter((record: any) => {
			const summary = extractHikvisionCredentialSummary(record?.rawPayload || {});
			return Number(summary.fingerprintCount || 0) > 0;
		}).length;
		const facePresentDevices = (user.records || []).filter((record: any) => {
			const summary = extractHikvisionCredentialSummary(record?.rawPayload || {});
			return Number(summary.faceCount || 0) > 0;
		}).length;
		const targetDeviceIds = (user.targetDeviceIds || []).filter(
			(targetDeviceId: string) => targetDeviceId && targetDeviceId !== sourceDeviceId,
		);
		const source = perSource.get(sourceDeviceId) || {
			deviceId: sourceDeviceId,
			deviceName: deviceLabel(sourceDeviceId),
			selectedUniqueIds: 0,
			writes: 0,
		};
		source.selectedUniqueIds += 1;
		source.writes += targetDeviceIds.length;
		perSource.set(sourceDeviceId, source);
		for (const targetDeviceId of targetDeviceIds) {
			const target = perTarget.get(targetDeviceId) || {
				deviceId: targetDeviceId,
				deviceName: deviceLabel(targetDeviceId),
				writes: 0,
				sourceDeviceIds: [],
			};
			target.writes += 1;
			if (!target.sourceDeviceIds.includes(sourceDeviceId))
				target.sourceDeviceIds.push(sourceDeviceId);
			perTarget.set(targetDeviceId, target);
		}
		return {
			userKey: user.key,
			vendorUserIds: user.vendorUserIds || [],
			sourceDeviceId,
			sourceDeviceName: deviceLabel(sourceDeviceId),
			targetDeviceIds,
			targetDeviceNames: targetDeviceIds.map(deviceLabel),
			writes: targetDeviceIds.length,
			fingerprintSourceCount: Number(sourceCredentials.fingerprintCount || 0),
			fingerprintPresentDevices,
			fingerprintExpectedDevices: expectedDeviceCount,
			fingerprintGapDevices: Math.max(0, expectedDeviceCount - fingerprintPresentDevices),
			faceSourceCount: Number(sourceCredentials.faceCount || 0),
			facePresentDevices,
			faceExpectedDevices: expectedDeviceCount,
			faceGapDevices: Math.max(0, expectedDeviceCount - facePresentDevices),
			conflicts: (user.conflicts || []).length,
		};
	});
	return {
		selectedUniqueIds: rows.length,
		totalWrites: rows.reduce((sum: number, row: any) => sum + row.writes, 0),
		fingerprintGaps: rows.reduce((sum: number, row: any) => sum + row.fingerprintGapDevices, 0),
		faceGaps: rows.reduce((sum: number, row: any) => sum + row.faceGapDevices, 0),
		conflicts: rows.reduce((sum: number, row: any) => sum + row.conflicts, 0),
		perTarget: Array.from(perTarget.values()),
		perSource: Array.from(perSource.values()),
		rows,
	};
};

const sortForScopeHash = (value: any): any => {
	if (Array.isArray(value)) return value.map(sortForScopeHash);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, sortForScopeHash(value[key])]),
	);
};

const buildDeviceUserMergeScopeLock = (params: {
	planId: string;
	appliedPlan: any;
	writeMatrix: any;
}) => {
	const choices = Object.fromEntries(
		(params.appliedPlan.users || [])
			.map((user: any) => [
				String(user.key),
				Object.fromEntries(
					(user.conflicts || [])
						.filter((conflict: any) => conflict.choice)
						.map((conflict: any) => [String(conflict.field), String(conflict.choice)])
						.sort(([left]: [string], [right]: [string]) => left.localeCompare(right)),
				),
			])
			.sort(([left]: [string], [right]: [string]) => left.localeCompare(right)),
	);
	const scope = sortForScopeHash({
		planId: params.planId,
		deviceIds: [...(params.appliedPlan.deviceIds || [])],
		validDeviceIds: [...(params.appliedPlan.validDeviceIds || [])],
		selectedUserKeys: (params.appliedPlan.users || [])
			.map((user: any) => String(user.key))
			.sort(),
		choices,
		writeMatrix: params.writeMatrix,
	});
	return {
		scope,
		scopeHash: createHash("sha256").update(JSON.stringify(scope)).digest("hex"),
	};
};

const cleanupDeviceImportJobs = () => {
	const cutoff = Date.now() - 60 * 60 * 1000;
	for (const [jobId, job] of deviceImportJobs.entries()) {
		if (job.startedAt.getTime() < cutoff) deviceImportJobs.delete(jobId);
	}
};

const cleanupDeviceUserPackageImportJobs = () => {
	const cutoff = Date.now() - 60 * 60 * 1000;
	for (const [jobId, job] of deviceUserPackageImportJobs.entries()) {
		if (job.startedAt.getTime() < cutoff) deviceUserPackageImportJobs.delete(jobId);
	}
};

const cleanupDeviceUserSyncJobs = () => {
	const cutoff = Date.now() - 60 * 60 * 1000;
	for (const [jobId, job] of deviceUserSyncJobs.entries()) {
		if (job.startedAt.getTime() < cutoff) deviceUserSyncJobs.delete(jobId);
	}
};

const cleanupDeviceUserMergeJobs = () => {
	const cutoff = Date.now() - 60 * 60 * 1000;
	for (const [jobId, job] of deviceUserMergeJobs.entries()) {
		// A slow physical merge must remain visible while its worker is active.
		if (job.status !== "processing" && job.startedAt.getTime() < cutoff) {
			deviceUserMergeJobs.delete(jobId);
		}
	}
};

const serializeDeviceImportJob = (job: DeviceImportJob) => ({
	...job,
	startedAt: job.startedAt instanceof Date ? job.startedAt.toISOString() : job.startedAt,
	updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : job.updatedAt || null,
	cancelRequestedAt:
		job.cancelRequestedAt instanceof Date
			? job.cancelRequestedAt.toISOString()
			: job.cancelRequestedAt || null,
	completedAt:
		job.completedAt instanceof Date ? job.completedAt.toISOString() : job.completedAt || null,
});

const persistDeviceImportJob = (job: DeviceImportJob) => {
	try {
		fsSync.mkdirSync(DEVICE_IMPORT_JOB_DIR, { recursive: true });
		fsSync.writeFileSync(
			path.join(DEVICE_IMPORT_JOB_DIR, `${job.jobId}.json`),
			JSON.stringify(serializeDeviceImportJob(job), null, 2),
		);
	} catch (error) {
		deviceLogger.warn(`Failed to persist device import job snapshot: ${error}`);
	}
};

const readDeviceImportJob = (jobId: string): DeviceImportJob | null => {
	try {
		const filePath = path.join(DEVICE_IMPORT_JOB_DIR, `${jobId}.json`);
		if (!fsSync.existsSync(filePath)) return null;
		const parsed = JSON.parse(fsSync.readFileSync(filePath, "utf8"));
		const startedAt = parsed.startedAt ? new Date(parsed.startedAt) : new Date();
		const completedAt = parsed.completedAt ? new Date(parsed.completedAt) : undefined;
		const updatedAt = parsed.updatedAt ? new Date(parsed.updatedAt) : completedAt || startedAt;
		return {
			...parsed,
			total: Number(parsed.total || 0),
			sourceTotal:
				parsed.sourceTotal === null || parsed.sourceTotal === undefined
					? null
					: Number(parsed.sourceTotal || 0),
			attendanceSourceTotal:
				parsed.attendanceSourceTotal === null || parsed.attendanceSourceTotal === undefined
					? null
					: Number(parsed.attendanceSourceTotal || 0),
			operationSourceTotal:
				parsed.operationSourceTotal === null || parsed.operationSourceTotal === undefined
					? null
					: Number(parsed.operationSourceTotal || 0),
			targetImportCount:
				parsed.targetImportCount === null || parsed.targetImportCount === undefined
					? null
					: Number(parsed.targetImportCount || 0),
			targetAttendanceCount:
				parsed.targetAttendanceCount === null || parsed.targetAttendanceCount === undefined
					? null
					: Number(parsed.targetAttendanceCount || 0),
			targetOperationsCount:
				parsed.targetOperationsCount === null || parsed.targetOperationsCount === undefined
					? null
					: Number(parsed.targetOperationsCount || 0),
			processed: Number(parsed.processed || 0),
			imported: Number(parsed.imported || 0),
			skipped: Number(parsed.skipped || 0),
			alreadySaved: Number(parsed.alreadySaved || 0),
			knownSkipped: Number(parsed.knownSkipped || 0),
			attendanceImported: Number(parsed.attendanceImported || 0),
			operationsImported: Number(parsed.operationsImported || 0),
			failed: Number(parsed.failed || 0),
			errors: Array.isArray(parsed.errors) ? parsed.errors : [],
			startedAt,
			updatedAt,
			cancelRequestedAt: parsed.cancelRequestedAt
				? new Date(parsed.cancelRequestedAt)
				: undefined,
			completedAt,
		};
	} catch (error) {
		deviceLogger.warn(`Failed to read device import job snapshot: ${error}`);
		return null;
	}
};

const isDeviceImportJobStale = (job: DeviceImportJob) => {
	if (job.status !== "processing") return false;
	const lastProgressAt = job.updatedAt || job.startedAt;
	const lastProgressTime = lastProgressAt instanceof Date ? lastProgressAt.getTime() : NaN;
	return (
		!Number.isFinite(lastProgressTime) ||
		Date.now() - lastProgressTime > DEVICE_IMPORT_JOB_PROCESSING_STALE_MS
	);
};

const markDeviceImportJobStale = (job: DeviceImportJob) => {
	const now = new Date();
	const staleJob: DeviceImportJob = {
		...job,
		status: "failed",
		stale: true,
		message:
			"Device log sync stopped updating after a runtime restart. Start Sync logs again; saved rows remain durable and the next preview will continue from saved truth.",
		updatedAt: now,
		completedAt: now,
	};
	deviceImportJobs.set(job.jobId, staleJob);
	persistDeviceImportJob(staleJob);
	return staleJob;
};

const updateDeviceImportJob = (jobId: string, patch: Partial<Omit<DeviceImportJob, "jobId">>) => {
	const job = deviceImportJobs.get(jobId) || readDeviceImportJob(jobId);
	if (!job) return;
	const nextJob = {
		...job,
		...patch,
		updatedAt: new Date(),
		errors: patch.errors || job.errors || [],
	};
	deviceImportJobs.set(jobId, nextJob);
	persistDeviceImportJob(nextJob);
};

const updateDeviceUserPackageImportJob = (
	jobId: string,
	patch: Partial<Omit<DeviceUserPackageImportJob, "jobId" | "results">> & { results?: any[] },
) => {
	const job = deviceUserPackageImportJobs.get(jobId);
	if (!job) return;
	const nextJob = {
		...job,
		...patch,
		results: patch.results || job.results,
	};
	deviceUserPackageImportJobs.set(jobId, nextJob);
	persistDeviceUserPackageImportJob(nextJob);
};

const updateDeviceUserSyncJob = (
	jobId: string,
	patch: Partial<Omit<DeviceUserSyncJob, "jobId" | "results">> & {
		results?: DeviceUserSyncJobResult[];
	},
) => {
	const job = deviceUserSyncJobs.get(jobId);
	if (!job) return;
	const nextJob = {
		...job,
		...patch,
		updatedAt: new Date(),
		results: sanitizeDeviceUserSyncJobResults(patch.results || job.results),
		biometricFailureLog: sanitizeDeviceUserSyncFailureLog(
			patch.biometricFailureLog || job.biometricFailureLog,
		),
	};
	deviceUserSyncJobs.set(jobId, nextJob);
	persistDeviceUserSyncJob(nextJob);
};

const sanitizeDeviceUserSyncRawFailureReason = (reason?: string | null) => {
	const raw = String(reason || "missing_raw_blob").trim();
	const lower = raw.toLowerCase();
	if (
		raw === "face_image_not_found_on_device" ||
		lower.includes("404 -- not found") ||
		lower.includes("can't locate document") ||
		lower.includes("cant locate document")
	) {
		return "face_image_not_found_on_device";
	}
	if (
		raw === "face_image_unauthorized" ||
		lower.includes("<statusvalue>401</statusvalue>") ||
		lower.includes("unauthorized")
	) {
		return "face_image_unauthorized";
	}
	if (raw === "face_binary_not_image") return raw;
	if (raw === "face_binary_empty") return raw;
	if (raw === "no_face_on_device") return raw;
	if (raw === "no_fingerprint_data_from_device") return raw;
	if (
		lower.startsWith("<!doctype html") ||
		lower.startsWith("<html") ||
		lower.startsWith("<?xml")
	) {
		return "face_binary_not_image";
	}
	return raw.length > 160 ? `${raw.slice(0, 157)}...` : raw;
};

const sanitizeDeviceUserSyncFailureLog = (value: unknown) =>
	(Array.isArray(value) ? value : []).map((entry: any) => ({
		...entry,
		reason: sanitizeDeviceUserSyncRawFailureReason(entry?.reason),
	}));

const sanitizeDeviceUserSyncFailureReasons = (value: unknown) => {
	const sanitized: Record<string, number> = {};
	if (!value || typeof value !== "object") return sanitized;
	for (const [reason, count] of Object.entries(value as Record<string, unknown>)) {
		const key = sanitizeDeviceUserSyncRawFailureReason(reason);
		const numericCount = Number(count);
		sanitized[key] = (sanitized[key] || 0) + (Number.isFinite(numericCount) ? numericCount : 0);
	}
	return sanitized;
};

const formatDeviceUserSyncMissingRawBlobSummary = (
	count: number,
	reasons: Record<string, number>,
) =>
	`${count} biometric credential(s) still missing raw blobs: ${
		Object.entries(reasons)
			.map(([reason, reasonCount]) => `${reason}=${reasonCount}`)
			.join(", ") || "reason_unknown"
	}`;

const sanitizeDeviceUserSyncJobResults = (value: unknown) =>
	(Array.isArray(value) ? value : []).map((result: any) => {
		const sanitizedReasons = sanitizeDeviceUserSyncFailureReasons(
			result?.summary?.biometricFailureReasons || {},
		);
		const summary = result?.summary
			? {
					...result.summary,
					biometricFailureReasons: sanitizedReasons,
				}
			: result?.summary;
		const error = String(result?.error || "");
		const countFromSummary = Number(summary?.biometricFailed);
		const countFromError = Number(error.match(/(\d+)\s+biometric credential/i)?.[1]);
		const missingRawCount = Number.isFinite(countFromSummary)
			? countFromSummary
			: Number.isFinite(countFromError)
				? countFromError
				: 0;
		return {
			...result,
			summary,
			error: !result?.error
				? null
				: error.includes("still missing raw blobs")
					? formatDeviceUserSyncMissingRawBlobSummary(missingRawCount, sanitizedReasons)
					: sanitizeDeviceUserSyncRawFailureReason(error || null),
		};
	});

const serializeDeviceUserSyncJob = (job: DeviceUserSyncJob) => ({
	...job,
	biometricFailureLog: sanitizeDeviceUserSyncFailureLog(job.biometricFailureLog),
	results: sanitizeDeviceUserSyncJobResults(job.results),
	startedAt: job.startedAt instanceof Date ? job.startedAt.toISOString() : job.startedAt,
	updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : job.updatedAt,
	completedAt:
		job.completedAt instanceof Date ? job.completedAt.toISOString() : job.completedAt || null,
});

const persistDeviceUserSyncJob = (job: DeviceUserSyncJob) => {
	try {
		fsSync.mkdirSync(DEVICE_USER_SYNC_JOB_DIR, { recursive: true });
		fsSync.writeFileSync(
			path.join(DEVICE_USER_SYNC_JOB_DIR, `${job.jobId}.json`),
			JSON.stringify(serializeDeviceUserSyncJob(job), null, 2),
		);
	} catch (error) {
		deviceLogger.warn(`Failed to persist device-user sync job snapshot: ${error}`);
	}
};

const readDeviceUserSyncJob = (jobId: string): DeviceUserSyncJob | null => {
	try {
		const filePath = path.join(DEVICE_USER_SYNC_JOB_DIR, `${jobId}.json`);
		if (!fsSync.existsSync(filePath)) return null;
		const parsed = JSON.parse(fsSync.readFileSync(filePath, "utf8"));
		const startedAt = parsed.startedAt ? new Date(parsed.startedAt) : new Date();
		const completedAt = parsed.completedAt ? new Date(parsed.completedAt) : undefined;
		const updatedAt = parsed.updatedAt ? new Date(parsed.updatedAt) : completedAt || startedAt;
		return {
			...parsed,
			startedAt,
			updatedAt,
			completedAt,
			results: Array.isArray(parsed.results) ? parsed.results : [],
			biometricTotal: Number(parsed.biometricTotal || 0),
			biometricProcessed: Number(parsed.biometricProcessed || 0),
			biometricCaptured: Number(parsed.biometricCaptured || 0),
			biometricCached: Number(parsed.biometricCached || 0),
			biometricFailed: Number(parsed.biometricFailed || 0),
			biometricFailureLog: sanitizeDeviceUserSyncFailureLog(parsed.biometricFailureLog),
		};
	} catch (error) {
		deviceLogger.warn(`Failed to read device-user sync job snapshot: ${error}`);
		return null;
	}
};

const isDeviceUserSyncJobStale = (job: DeviceUserSyncJob) => {
	if (job.status !== "processing") return false;
	const lastProgressAt = job.updatedAt || job.startedAt;
	const lastProgressTime = lastProgressAt instanceof Date ? lastProgressAt.getTime() : NaN;
	return (
		!Number.isFinite(lastProgressTime) ||
		Date.now() - lastProgressTime > DEVICE_USER_SYNC_PROCESSING_STALE_MS
	);
};

const markDeviceUserSyncJobStale = (job: DeviceUserSyncJob) => {
	const now = new Date();
	const staleJob: DeviceUserSyncJob = {
		...job,
		status: "failed",
		stale: true,
		message:
			job.message ||
			"Device-user sync stopped updating. Start Sync device users again when you want a fresh, triggered run.",
		updatedAt: now,
		completedAt: now,
	};
	deviceUserSyncJobs.set(job.jobId, staleJob);
	persistDeviceUserSyncJob(staleJob);
	return staleJob;
};

const serializeDeviceUserMergeJob = (job: DeviceUserMergeJob) => ({
	...job,
	results: Array.isArray(job.results) ? job.results : [],
	progressEvents: Array.isArray(job.progressEvents) ? job.progressEvents : [],
	startedAt: job.startedAt instanceof Date ? job.startedAt.toISOString() : job.startedAt,
	updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : job.updatedAt,
	completedAt:
		job.completedAt instanceof Date ? job.completedAt.toISOString() : job.completedAt || null,
});

const persistDeviceUserMergeJob = (job: DeviceUserMergeJob) => {
	try {
		fsSync.mkdirSync(DEVICE_USER_MERGE_JOB_DIR, { recursive: true });
		const snapshotPath = path.join(DEVICE_USER_MERGE_JOB_DIR, `${job.jobId}.json`);
		const withPath: DeviceUserMergeJob = { ...job, snapshotPath };
		fsSync.writeFileSync(
			snapshotPath,
			JSON.stringify(serializeDeviceUserMergeJob(withPath), null, 2),
		);
		// Keep memory path in sync so GET responses expose where agents can read truth.
		if (deviceUserMergeJobs.has(job.jobId)) {
			const current = deviceUserMergeJobs.get(job.jobId);
			if (current && current.snapshotPath !== snapshotPath) {
				deviceUserMergeJobs.set(job.jobId, { ...current, snapshotPath });
			}
		}
	} catch (error) {
		deviceLogger.warn(`Failed to persist device-user merge job snapshot: ${error}`);
	}
};

const readDeviceUserMergeJob = (jobId: string): DeviceUserMergeJob | null => {
	try {
		const filePath = path.join(DEVICE_USER_MERGE_JOB_DIR, `${jobId}.json`);
		if (!fsSync.existsSync(filePath)) return null;
		// Strip UTF-8 BOM from PowerShell Set-Content -Encoding UTF8 and similar writers.
		const raw = fsSync
			.readFileSync(filePath, "utf8")
			.replace(/^\uFEFF/, "")
			.trim();
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		const startedAt = parsed.startedAt ? new Date(parsed.startedAt) : new Date();
		const completedAt = parsed.completedAt ? new Date(parsed.completedAt) : undefined;
		const updatedAt = parsed.updatedAt ? new Date(parsed.updatedAt) : completedAt || startedAt;
		return {
			...parsed,
			startedAt,
			updatedAt,
			completedAt,
			results: Array.isArray(parsed.results) ? parsed.results : [],
			progressEvents: Array.isArray(parsed.progressEvents) ? parsed.progressEvents : [],
			totalWrites: Number(parsed.totalWrites || 0),
			processedWrites: Number(parsed.processedWrites || 0),
			successfulWrites: Number(parsed.successfulWrites || 0),
			alreadyConvergedWrites: Number(parsed.alreadyConvergedWrites || 0),
			failedWrites: Number(parsed.failedWrites || 0),
			stale: Boolean(parsed.stale),
			snapshotPath: filePath,
		};
	} catch (error) {
		deviceLogger.warn(`Failed to read device-user merge job snapshot: ${error}`);
		return null;
	}
};

const isDeviceUserMergeJobStale = (job: DeviceUserMergeJob) => {
	if (job.status !== "processing") return false;
	const lastProgressAt = job.updatedAt || job.startedAt;
	const lastProgressTime = lastProgressAt instanceof Date ? lastProgressAt.getTime() : NaN;
	return (
		!Number.isFinite(lastProgressTime) ||
		Date.now() - lastProgressTime > DEVICE_USER_MERGE_PROCESSING_STALE_MS
	);
};

const markDeviceUserMergeJobStale = (
	job: DeviceUserMergeJob,
	message?: string,
): DeviceUserMergeJob => {
	const now = new Date();
	const staleJob: DeviceUserMergeJob = {
		...job,
		status: "failed",
		stale: true,
		message:
			message ||
			job.message ||
			"Device-user merge worker is no longer active after API restart or a stalled batch. Start a fresh merge job from the reread/retry plan; do not treat this as peer-write success.",
		error:
			job.error ||
			"Merge job interrupted (stale processing snapshot). Worker not active in this API process.",
		currentStage: "failed_stale",
		updatedAt: now,
		completedAt: now,
	};
	deviceUserMergeJobs.set(job.jobId, staleJob);
	persistDeviceUserMergeJob(staleJob);
	return staleJob;
};

const resolveDeviceUserMergeJob = (
	jobId: string,
	options?: { markInterruptedProcessingStale?: boolean },
): DeviceUserMergeJob | null => {
	const memoryJob = deviceUserMergeJobs.get(jobId);
	const persistedJob = memoryJob ? null : readDeviceUserMergeJob(jobId);
	const foundJob = memoryJob || persistedJob;
	if (!foundJob) return null;

	// Processing snapshot on disk but not in this process = worker died (API restart/crash).
	const interruptedPersistedJob =
		options?.markInterruptedProcessingStale !== false &&
		!memoryJob &&
		persistedJob?.status === "processing"
			? persistedJob
			: null;
	if (interruptedPersistedJob) {
		return markDeviceUserMergeJobStale(
			interruptedPersistedJob,
			"Device-user merge worker is no longer active after API restart. Last progress was persisted; start a fresh merge for remaining failures only.",
		);
	}
	if (isDeviceUserMergeJobStale(foundJob)) {
		return markDeviceUserMergeJobStale(foundJob);
	}
	// Hydrate memory from durable snapshot for completed/failed jobs so list/GET stay cheap.
	if (!memoryJob && foundJob.status !== "processing") {
		deviceUserMergeJobs.set(jobId, foundJob);
	}
	return foundJob;
};

const updateDeviceUserMergeJob = (
	jobId: string,
	patch: Partial<Omit<DeviceUserMergeJob, "jobId" | "results" | "progressEvents">> & {
		results?: any[];
		progressEvents?: any[];
		appendProgressEvent?: any;
	},
) => {
	const job = deviceUserMergeJobs.get(jobId);
	if (!job) return;
	const { appendProgressEvent, ...jobPatch } = patch;
	const progressEvents = patch.appendProgressEvent
		? [...(job.progressEvents || []), appendProgressEvent].slice(-100)
		: jobPatch.progressEvents || job.progressEvents;
	const nextJob: DeviceUserMergeJob = {
		...job,
		...jobPatch,
		results: jobPatch.results || job.results,
		progressEvents,
		updatedAt: new Date(),
	};
	deviceUserMergeJobs.set(jobId, nextJob);
	persistDeviceUserMergeJob(nextJob);
};

/** Durable per-row merge peer-copy ledger (success/failure jsonl). Circuit-skips are failures, not success. */
const resolveMergeLedgerDir = (jobId: string) => {
	const envDir = String(process.env.HIKVISION_MERGE_LEDGER_DIR || "").trim();
	if (envDir) return path.resolve(envDir);
	return path.resolve(process.cwd(), "..", ".runtime", "merge-ledger", jobId);
};

const appendMergeLedgerRow = (
	jobId: string,
	kind: "success" | "failure",
	row: Record<string, unknown>,
) => {
	try {
		const dir = resolveMergeLedgerDir(jobId);
		fsSync.mkdirSync(dir, { recursive: true });
		const file = path.join(dir, kind === "success" ? "success.jsonl" : "failure.jsonl");
		const line = JSON.stringify({
			at: new Date().toISOString(),
			jobId,
			...row,
		});
		fsSync.appendFileSync(file, `${line}\n`, "utf8");
	} catch (error: any) {
		deviceLogger.warn(
			`Failed to append merge ledger ${kind} row for job ${jobId}: ${error?.message || error}`,
		);
	}
};

const runFixedProcess = (
	file: string,
	args: string[],
	options: { timeoutMs?: number } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> =>
	new Promise((resolve) => {
		const timeoutMs = options.timeoutMs ?? 7000;
		let settled = false;
		let killTimer: NodeJS.Timeout;
		const stdoutChunks: string[] = [];
		const stderrChunks: string[] = [];
		const child = execFile(
			file,
			args,
			{
				timeout: timeoutMs,
				killSignal: "SIGKILL",
				windowsHide: true,
				maxBuffer: 5 * 1024 * 1024,
			},
			(error: any, stdout, stderr) => {
				if (settled) return;
				settled = true;
				if (killTimer) clearTimeout(killTimer);
				resolve({
					exitCode:
						typeof error?.code === "number"
							? error.code
							: error?.killed || error?.signal
								? 124
								: error
									? 1
									: 0,
					stdout: String(stdout || ""),
					stderr: String(stderr || ""),
				});
			},
		);
		child.stdout?.on("data", (chunk) => {
			stdoutChunks.push(String(chunk || ""));
		});
		child.stderr?.on("data", (chunk) => {
			stderrChunks.push(String(chunk || ""));
		});
		killTimer = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill("SIGKILL");
			resolve({
				exitCode: 124,
				stdout: stdoutChunks.join(""),
				stderr: [stderrChunks.join(""), `Process timed out after ${timeoutMs}ms`]
					.filter(Boolean)
					.join("\n"),
			});
		}, timeoutMs + 1000);
	});

const quoteRemoteShellArg = (value: string) => `'${String(value).replace(/'/g, `'\\''`)}'`;

const HIKVISION_VM_SSH_CONNECT_TIMEOUT_SECONDS = Math.min(
	// Keep connect short so status/control never hangs the admin modal on a dead LAN path.
	Math.max(Number(process.env.PROJECT_TRUTH_VM_SSH_CONNECT_TIMEOUT_SECONDS || 3), 2),
	30,
);
const HIKVISION_LISTENER_STATUS_TIMEOUT_MS = Math.max(
	2000,
	Math.min(Number(process.env.HIKVISION_LISTENER_STATUS_TIMEOUT_MS || 12000), 12000),
);

const HIKVISION_VM_CLOUDFLARE_SSH_CONNECT_TIMEOUT_SECONDS = Math.min(
	Math.max(
		Number(process.env.PROJECT_TRUTH_VM_CLOUDFLARE_SSH_CONNECT_TIMEOUT_SECONDS || 10),
		HIKVISION_VM_SSH_CONNECT_TIMEOUT_SECONDS,
	),
	30,
);

const isHikvisionTransportFailure = (value: unknown) =>
	/(timed out|timeout|econnrefused|enetunreach|ehostunreach|no route|network error|fetch failed|socket hang up|aborted)/i.test(
		String(value || ""),
	);

type HikvisionListenerVmTarget = {
	mode: "local" | "ssh";
	host: string;
	port?: number;
	user: string;
	key: string;
	destination: string;
	label: string;
};

const getHikvisionListenerVmTargets = (): HikvisionListenerVmTarget[] => {
	const runtimeRoute = resolveHikvisionRuntimeRoute();
	const configuredHost = String(process.env.PROJECT_TRUTH_VM_HOST || "").trim();
	const configuredAlias = String(
		process.env.PROJECT_TRUTH_VM_SSH_ALIAS || "project-truth-hris",
	).trim();
	const host = configuredHost || "10.184.37.19";
	const configuredPort = Math.min(
		Math.max(Number(process.env.PROJECT_TRUTH_VM_SSH_PORT || 22), 1),
		65535,
	);
	const user = process.env.PROJECT_TRUTH_VM_USER || "infra";
	const key =
		process.env.PROJECT_TRUTH_VM_SSH_KEY ||
		path.join(os.homedir(), ".ssh", "node-health-appliance_ed25519");
	if (runtimeRoute.commandTransport === "local") {
		return [
			{
				mode: "local",
				host,
				user,
				key,
				destination: "local",
				label: runtimeRoute.location,
			},
		];
	}
	const targets: HikvisionListenerVmTarget[] = [];
	// Host-local runtime checks use direct LAN first. The Cloudflare SSH alias is
	// still retained as fallback for remote/off-LAN work, but should not add edge
	// latency to every local saved-events status refresh.
	targets.push({
		mode: "ssh",
		host,
		port: configuredPort,
		user,
		key,
		destination: `${user}@${host}`,
		label:
			runtimeRoute.location === "vm-container"
				? `vm-container:${host}`
				: `lan:${host}`,
	});
	if (
		runtimeRoute.allowCloudflareSshFallback &&
		configuredAlias &&
		configuredAlias !== host &&
		configuredAlias !== `${user}@${host}`
	) {
		targets.push({
			mode: "ssh",
			host,
			user,
			key,
			destination: configuredAlias,
			label: `alias:${configuredAlias}`,
		});
	}
	return targets;
};

let preferredHikvisionListenerVmTargetLabel = "";
let hikvisionListenerStatusCache: { expiresAt: number; value: any } | null = null;

const prioritizeHikvisionListenerVmTargets = () => {
	const targets = getHikvisionListenerVmTargets();
	if (!preferredHikvisionListenerVmTargetLabel) return targets;
	return [...targets].sort((left, right) => {
		if (left.label === preferredHikvisionListenerVmTargetLabel) return -1;
		if (right.label === preferredHikvisionListenerVmTargetLabel) return 1;
		return 0;
	});
};

const runHikvisionListenerVmCommand = (remoteArgs: string[], timeoutMs = 7000) => {
	const targets = prioritizeHikvisionListenerVmTargets();
	const runAgainstTarget = async (target: HikvisionListenerVmTarget) => {
		if (target.mode === "local") {
			const result = await runFixedProcess(remoteArgs[0] || "true", remoteArgs.slice(1), {
				timeoutMs,
			});
			return { ...result, target };
		}
		const sshArgs = [
			"-o",
			"BatchMode=yes",
			"-o",
			`ConnectTimeout=${
				target.label.startsWith("alias:")
					? HIKVISION_VM_CLOUDFLARE_SSH_CONNECT_TIMEOUT_SECONDS
					: HIKVISION_VM_SSH_CONNECT_TIMEOUT_SECONDS
			}`,
			"-o",
			"StrictHostKeyChecking=accept-new",
		];
		if (target.port && target.port !== 22) sshArgs.push("-p", String(target.port));
		if (target.destination.includes("@")) {
			sshArgs.unshift(target.key);
			sshArgs.unshift("-i");
		}
		const result = await runFixedProcess(
			process.env.PROJECT_TRUTH_SSH_BIN || "ssh",
			[...sshArgs, target.destination, remoteArgs.map(quoteRemoteShellArg).join(" ")],
			{ timeoutMs },
		);
		return { ...result, target };
	};
	return (async () => {
		let lastResult: Awaited<ReturnType<typeof runAgainstTarget>> | null = null;
		for (const target of targets) {
			// Cloudflare Access can lose one connector handshake while the named
			// tunnel itself remains healthy. Give the documented alias two bounded
			// transport-only retries before presenting the listener as unreachable.
			const maxAttempts = target.label.startsWith("alias:") ? 3 : 1;
			for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
				const result = await runAgainstTarget(target);
				if (result.exitCode === 0) {
					preferredHikvisionListenerVmTargetLabel = target.label;
					return result;
				}
				const transportDetail = `${result.stderr || ""}\n${result.stdout || ""}`;
				const shouldTryNextTarget =
					result.exitCode === 124 ||
					result.exitCode === 255 ||
					isHikvisionTransportFailure(transportDetail);
				if (!shouldTryNextTarget) {
					preferredHikvisionListenerVmTargetLabel = target.label;
					return result;
				}
				if (target.label === preferredHikvisionListenerVmTargetLabel) {
					preferredHikvisionListenerVmTargetLabel = "";
				}
				lastResult = result;
				if (attempt < maxAttempts) continue;
			}
		}
		return (
			lastResult || {
				exitCode: 1,
				stdout: "",
				stderr: "No Hikvision VM target configured",
				target: targets[0],
			}
		);
	})();
};

const runHikvisionListenerVmCopy = (localPath: string, remotePath: string, timeoutMs = 12000) => {
	const targets = prioritizeHikvisionListenerVmTargets();
	const runAgainstTarget = async (target: HikvisionListenerVmTarget) => {
		if (target.mode === "local") {
			try {
				fsSync.copyFileSync(localPath, remotePath);
				return { exitCode: 0, stdout: "", stderr: "", target };
			} catch (error: any) {
				return {
					exitCode: 1,
					stdout: "",
					stderr: error?.message || "Failed to copy listener runtime locally",
					target,
				};
			}
		}
		const scpArgs = [
			"-o",
			"BatchMode=yes",
			"-o",
			`ConnectTimeout=${HIKVISION_VM_SSH_CONNECT_TIMEOUT_SECONDS}`,
			"-o",
			"StrictHostKeyChecking=accept-new",
		];
		if (target.port && target.port !== 22) scpArgs.push("-P", String(target.port));
		if (target.destination.includes("@")) {
			scpArgs.unshift(target.key);
			scpArgs.unshift("-i");
		}
		const result = await runFixedProcess(
			process.env.PROJECT_TRUTH_SCP_BIN || "scp",
			[...scpArgs, localPath, `${target.destination}:${remotePath}`],
			{ timeoutMs },
		);
		return { ...result, target };
	};
	return (async () => {
		let lastResult: Awaited<ReturnType<typeof runAgainstTarget>> | null = null;
		for (const target of targets) {
			const result = await runAgainstTarget(target);
			if (result.exitCode === 0) {
				preferredHikvisionListenerVmTargetLabel = target.label;
				return result;
			}
			if (target.label === preferredHikvisionListenerVmTargetLabel) {
				preferredHikvisionListenerVmTargetLabel = "";
			}
			lastResult = result;
		}
		return (
			lastResult || {
				exitCode: 1,
				stdout: "",
				stderr: "No Hikvision VM target configured",
				target: targets[0],
			}
		);
	})();
};

const resolveManagedHikvisionListenerWrapperLocalPath = () => {
	const candidates = [
		path.resolve(process.cwd(), "../scripts/project-truth-hikvision-hot-reload-listener.sh"),
		path.resolve(process.cwd(), "scripts/project-truth-hikvision-hot-reload-listener.sh"),
		path.resolve(__dirname, "../../../scripts/project-truth-hikvision-hot-reload-listener.sh"),
	];
	return candidates.find((candidate) => fsSync.existsSync(candidate)) || null;
};

const resolveManagedHikvisionListenerDaemonLocalPath = () => {
	const candidates = [
		path.resolve(process.cwd(), "../scripts/project-truth-hikvision-hot-reload-daemon.sh"),
		path.resolve(process.cwd(), "scripts/project-truth-hikvision-hot-reload-daemon.sh"),
		path.resolve(__dirname, "../../../scripts/project-truth-hikvision-hot-reload-daemon.sh"),
	];
	return candidates.find((candidate) => fsSync.existsSync(candidate)) || null;
};

const resolveManagedHikvisionListenerServiceLocalPath = () => {
	const candidates = [
		path.resolve(
			process.cwd(),
			"../appliance/systemd/project-truth-hikvision-hot-reload-listener.service",
		),
		path.resolve(
			process.cwd(),
			"appliance/systemd/project-truth-hikvision-hot-reload-listener.service",
		),
		path.resolve(
			__dirname,
			"../../../appliance/systemd/project-truth-hikvision-hot-reload-listener.service",
		),
	];
	return candidates.find((candidate) => fsSync.existsSync(candidate)) || null;
};

const installManagedHikvisionListenerWrapperOnVm = async () => {
	const wrapperLocalPath = resolveManagedHikvisionListenerWrapperLocalPath();
	const daemonLocalPath = resolveManagedHikvisionListenerDaemonLocalPath();
	const serviceLocalPath = resolveManagedHikvisionListenerServiceLocalPath();
	if (!wrapperLocalPath || !daemonLocalPath || !serviceLocalPath) {
		return {
			ok: false,
			error: "Managed Hikvision listener runtime files are missing from the workspace",
		};
	}

	for (const [localPath, remotePath] of [
		[wrapperLocalPath, HIKVISION_VM_WRAPPER_TMP_PATH],
		[daemonLocalPath, HIKVISION_VM_DAEMON_TMP_PATH],
		[serviceLocalPath, HIKVISION_VM_SERVICE_TMP_PATH],
	] as const) {
		const copyResult = await runHikvisionListenerVmCopy(localPath, remotePath, 12000);
		if (copyResult.exitCode !== 0) {
			return {
				ok: false,
				error:
					copyResult.stderr.trim() ||
					copyResult.stdout.trim() ||
					`Failed to copy listener runtime ${path.basename(localPath)}`,
			};
		}
	}

	for (const remoteArgs of [
		[
			"sudo",
			"install",
			"-o",
			"root",
			"-g",
			"root",
			"-m",
			"0755",
			HIKVISION_VM_WRAPPER_TMP_PATH,
			HIKVISION_VM_WRAPPER_REMOTE_PATH,
		],
		[
			"sudo",
			"install",
			"-o",
			"root",
			"-g",
			"root",
			"-m",
			"0755",
			HIKVISION_VM_DAEMON_TMP_PATH,
			HIKVISION_VM_DAEMON_REMOTE_PATH,
		],
		[
			"sudo",
			"install",
			"-o",
			"root",
			"-g",
			"root",
			"-m",
			"0644",
			HIKVISION_VM_SERVICE_TMP_PATH,
			HIKVISION_VM_SERVICE_REMOTE_PATH,
		],
		["sudo", "systemctl", "daemon-reload"],
	] as const) {
		const installResult = await runHikvisionListenerVmCommand([...remoteArgs], 12000);
		if (installResult.exitCode !== 0) {
			return {
				ok: false,
				error:
					installResult.stderr.trim() ||
					installResult.stdout.trim() ||
					"Failed to install listener wrapper",
			};
		}
	}

	return { ok: true, localPath: wrapperLocalPath };
};

const parseSystemctlShow = (stdout: string) =>
	String(stdout || "")
		.split(/\r?\n/)
		.reduce<Record<string, string>>((acc, line) => {
			const index = line.indexOf("=");
			if (index > 0) acc[line.slice(0, index)] = line.slice(index + 1);
			return acc;
		}, {});

const parseJsonLines = (stdout: string) =>
	String(stdout || "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			try {
				return JSON.parse(line) as Record<string, any>;
			} catch {
				return { raw: line };
			}
		});

const isMissingHikvisionListenerRuntimeError = (detail: string) =>
	/no such file|not found|command not found/i.test(String(detail || ""));

const hikvisionDeviceLabel = (device: any) =>
	String(device?.name || device?.address || device?.id || "device").trim();

const buildHikvisionManualCopySdkFailureMessage = (params: {
	events: Record<string, any>[];
	sourceDevice: any;
	targetDevice: any;
	employeeNo: string;
}) => {
	const sourceDeviceId = String(params.sourceDevice?.id || "").trim();
	const targetDeviceId = String(params.targetDevice?.id || "").trim();
	const sourceFailure = params.events.find(
		(event) =>
			event?.event === "manual_reconcile_queue_failed" &&
			String(event?.sourceDeviceId || "").trim() === sourceDeviceId,
	);
	const failedLogin = params.events.find(
		(event) =>
			event?.event === "sdk_login" &&
			String(event?.ok || "")
				.trim()
				.toLowerCase() === "false" &&
			(!event?.deviceId || String(event.deviceId).trim() === sourceDeviceId),
	);
	if (sourceFailure || failedLogin) {
		const sourceName = hikvisionDeviceLabel(params.sourceDevice);
		const targetName = hikvisionDeviceLabel(params.targetDevice);
		const reason = String(sourceFailure?.reason || "source SDK login failed").trim();
		const lastError = failedLogin?.lastError
			? `; SDK login lastError ${failedLogin.lastError}`
			: "";
		const host = failedLogin?.host
			? ` on ${failedLogin.host}${failedLogin.sdkPort ? `:${failedLogin.sdkPort}` : ""}`
			: "";
		return `${sourceName} cannot be used as the SDK copy source for employee ${params.employeeNo} right now (${reason}${lastError}${host}). ${targetName} was not the device reported by the SDK failure.`;
	}
	const targetFailure = params.events.find(
		(event) =>
			event?.event === "sdk_login" &&
			String(event?.ok || "")
				.trim()
				.toLowerCase() === "false" &&
			String(event?.deviceId || "").trim() === targetDeviceId,
	);
	if (targetFailure) {
		const targetName = hikvisionDeviceLabel(params.targetDevice);
		const host = targetFailure.host
			? ` on ${targetFailure.host}${targetFailure.sdkPort ? `:${targetFailure.sdkPort}` : ""}`
			: "";
		return `${targetName} cannot be used as the SDK copy target for employee ${params.employeeNo} right now (SDK login lastError ${targetFailure.lastError || "unknown"}${host}).`;
	}
	return "";
};

const isDeterministicHikvisionManualCopySdkFailure = (message: string) =>
	/cannot be used as the SDK copy (source|target)/i.test(String(message || ""));

const hikvisionPeerSyncAttemptOk = (
	event: Record<string, any>,
	operation: string,
	employeeNo: string,
	targetDeviceId?: string,
) =>
	event?.event === "peer_sync_attempt" &&
	String(event?.operation || "")
		.trim()
		.toLowerCase() === operation &&
	String(event?.employeeNo || "").trim() === employeeNo &&
	String(event?.ok || "")
		.trim()
		.toLowerCase() === "true" &&
	(!targetDeviceId ||
		String(event?.targetDeviceId || "").trim() === String(targetDeviceId || "").trim());

const sleep = (ms: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, Math.max(0, Math.floor(ms)));
	});

const withDeviceUserImportTimeout = async <T>(
	promise: Promise<T>,
	timeoutMs: number,
	message: string,
): Promise<T> => {
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => reject(new Error(message)), timeoutMs);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
};

type HikvisionManualCopyParams = {
	sourceDevice: any;
	targetDevice?: any;
	targetDevices?: any[];
	sourceDeviceId: string;
	targetDeviceId?: string;
	employeeNo: string;
	includeFingerprints: boolean;
	includeFaceRecognition: boolean;
	waitSeconds?: number;
	skipPreflight?: boolean;
	onProgress?: (event: any) => void;
};

const readStoredHikvisionSyntheticCredentialSummary = (rawPayload: any) => {
	const synthetic = rawPayload?._hrisDeviceMetadata?.syntheticCredentialSummary || {};
	const fingerprintCount = Number(synthetic?.fingerprintCount ?? 0);
	const faceCount = Number(synthetic?.faceCount ?? 0);
	return {
		fingerprintCount:
			Number.isFinite(fingerprintCount) && fingerprintCount > 0
				? Math.max(0, Math.floor(fingerprintCount))
				: 0,
		faceCount:
			Number.isFinite(faceCount) && faceCount > 0 ? Math.max(0, Math.floor(faceCount)) : 0,
	};
};

const readStoredHikvisionSyntheticFingerprintCount = (rawPayload: any) =>
	readStoredHikvisionSyntheticCredentialSummary(rawPayload).fingerprintCount;

const readStoredHikvisionSyntheticFaceCount = (rawPayload: any) =>
	readStoredHikvisionSyntheticCredentialSummary(rawPayload).faceCount;

const buildEffectiveHikvisionCredentialSummary = (rawPayload: any) => {
	const physical = extractHikvisionCredentialSummary(rawPayload || {});
	const synthetic = readStoredHikvisionSyntheticCredentialSummary(rawPayload || {});
	return {
		fingerprintCount: Math.max(physical.fingerprintCount, synthetic.fingerprintCount),
		cardCount: physical.cardCount,
		faceCount: Math.max(physical.faceCount, synthetic.faceCount),
		hasFingerprint: Math.max(physical.fingerprintCount, synthetic.fingerprintCount) > 0,
		hasCard: physical.cardCount > 0,
		hasFace: Math.max(physical.faceCount, synthetic.faceCount) > 0,
		syntheticFingerprintCount: synthetic.fingerprintCount,
		syntheticFaceCount: synthetic.faceCount,
	};
};

type SavedDeviceUserTruthRow = {
	deviceId?: string | null;
	vendorUserId?: string | null;
	rawPayload?: any;
	vendorMetadata?: any;
	status?: string | null;
	employeeId?: string | null;
};

const summarizeSavedDeviceUserTruth = (deviceUsers: SavedDeviceUserTruthRow[]) => {
	const uniqueUsers = new Map<string, SavedDeviceUserTruthRow>();
	for (const deviceUser of deviceUsers || []) {
		const vendorUserId = String(deviceUser?.vendorUserId || "").trim();
		if (!vendorUserId || uniqueUsers.has(vendorUserId)) continue;
		uniqueUsers.set(vendorUserId, deviceUser);
	}
	return Array.from(uniqueUsers.values()).reduce(
		(summary, deviceUser) => {
			const credentialSummary = buildEffectiveHikvisionCredentialSummary(
				deviceUser?.rawPayload || {},
			);
			return {
				userCount: summary.userCount + 1,
				fingerprintCount:
					summary.fingerprintCount + Number(credentialSummary.fingerprintCount || 0),
				faceCount: summary.faceCount + Number(credentialSummary.faceCount || 0),
				cardCount: summary.cardCount + Number(credentialSummary.cardCount || 0),
			};
		},
		{
			userCount: 0,
			fingerprintCount: 0,
			faceCount: 0,
			cardCount: 0,
		},
	);
};

const compareSavedDeviceUserTruth = (
	baselineUsers: SavedDeviceUserTruthRow[],
	targetUsers: SavedDeviceUserTruthRow[],
) => {
	const baselineByVendorUserId = new Map<string, SavedDeviceUserTruthRow>();
	for (const deviceUser of baselineUsers || []) {
		const vendorUserId = String(deviceUser?.vendorUserId || "").trim();
		if (!vendorUserId || baselineByVendorUserId.has(vendorUserId)) continue;
		baselineByVendorUserId.set(vendorUserId, deviceUser);
	}
	const targetByVendorUserId = new Map<string, SavedDeviceUserTruthRow>();
	for (const deviceUser of targetUsers || []) {
		const vendorUserId = String(deviceUser?.vendorUserId || "").trim();
		if (!vendorUserId || targetByVendorUserId.has(vendorUserId)) continue;
		targetByVendorUserId.set(vendorUserId, deviceUser);
	}

	let missingUsers = 0;
	let staleUsers = 0;
	let missingFingerprintCount = 0;
	let missingFaceCount = 0;
	let missingCardCount = 0;

	for (const [vendorUserId, baselineUser] of baselineByVendorUserId.entries()) {
		const baselineSummary = buildEffectiveHikvisionCredentialSummary(
			baselineUser?.rawPayload || {},
		);
		const targetUser = targetByVendorUserId.get(vendorUserId) || null;
		if (!targetUser) {
			missingUsers += 1;
			missingFingerprintCount += Number(baselineSummary.fingerprintCount || 0);
			missingFaceCount += Number(baselineSummary.faceCount || 0);
			missingCardCount += Number(baselineSummary.cardCount || 0);
			continue;
		}

		const targetSummary = buildEffectiveHikvisionCredentialSummary(
			targetUser?.rawPayload || {},
		);
		const fingerprintGap = Math.max(
			Number(baselineSummary.fingerprintCount || 0) -
				Number(targetSummary.fingerprintCount || 0),
			0,
		);
		const faceGap = Math.max(
			Number(baselineSummary.faceCount || 0) - Number(targetSummary.faceCount || 0),
			0,
		);
		const cardGap = Math.max(
			Number(baselineSummary.cardCount || 0) - Number(targetSummary.cardCount || 0),
			0,
		);
		if (fingerprintGap > 0 || faceGap > 0 || cardGap > 0) {
			staleUsers += 1;
			missingFingerprintCount += fingerprintGap;
			missingFaceCount += faceGap;
			missingCardCount += cardGap;
		}
	}

	return {
		missingUsers,
		staleUsers,
		missingFingerprintCount,
		missingFaceCount,
		missingCardCount,
		totalCredentialGapCount: missingFingerprintCount + missingFaceCount + missingCardCount,
		totalNeedsMatchCount: missingUsers + staleUsers,
	};
};

export const controller = (prisma: PrismaClient) => {
	// Initialize employee helpers for auth service communication
	const helpers = createEmployeeHelpers(prisma, deviceLogger);

	const resolveEmployeeForUser = async (
		organizationId: string,
		userId: string,
		employeeIdFromMetadata?: string,
	) => {
		if (employeeIdFromMetadata) {
			const employeeById = await prisma.employee.findFirst({
				where: {
					id: employeeIdFromMetadata,
					organizationId,
					isDeleted: false,
				},
				select: { id: true },
			});
			if (employeeById) return employeeById;
		}

		return prisma.employee.findFirst({
			where: {
				organizationId,
				userId,
				isDeleted: false,
			},
			select: { id: true },
		});
	};

	const cleanHikvisionDeviceSpecValue = (value: any) =>
		String(value ?? "")
			.replace(/[\r\n|]+/g, " ")
			.trim();

	const getHikvisionSdkEndpoint = (
		device: any,
		options: { useTunnelMap?: boolean; preferPhysicalAddress?: boolean } = {},
	) => {
		const config = device?.config || {};
		const physicalHost = cleanHikvisionDeviceSpecValue(
			options.preferPhysicalAddress
				? device?.address
				: config.hikvisionSdkRuntimeAddress || device?.address,
		);
		const physicalPort = Number(
			cleanHikvisionDeviceSpecValue(
				options.preferPhysicalAddress
					? config.sdkPort || "8000"
					: config.hikvisionSdkRuntimePort || config.sdkPort || "8000",
			),
		);
		const tunnelTarget =
			options.useTunnelMap === false
				? null
				: resolveHikvisionTunnelTarget(physicalHost, physicalPort);
		return {
			host: tunnelTarget?.host || physicalHost,
			port: cleanHikvisionDeviceSpecValue(tunnelTarget?.port || physicalPort || "8000"),
		};
	};

	const buildHikvisionManualCopySpecLine = (device: any) => {
		const config = device?.config || {};
		const access = device?.access || {};
		const { host: sdkHost, port: sdkPort } = getHikvisionSdkEndpoint(device, {
			useTunnelMap: false,
		});
		const username = cleanHikvisionDeviceSpecValue(
			access.username || process.env.HIKVISION_USERNAME,
		);
		const password = cleanHikvisionDeviceSpecValue(
			access.password || process.env.HIKVISION_PASSWORD,
		);
		if (
			!device?.id ||
			!device?.organizationId ||
			!sdkHost ||
			!sdkPort ||
			!username ||
			!password
		) {
			throw new Error(
				`Hikvision manual copy cannot prepare SDK spec for ${
					device?.name || device?.id || "unknown device"
				}`,
			);
		}
		return [
			cleanHikvisionDeviceSpecValue(device.id),
			cleanHikvisionDeviceSpecValue(device.organizationId),
			cleanHikvisionDeviceSpecValue(device.name || device.id),
			sdkHost,
			sdkPort,
			username,
			password,
			"true",
		].join("|");
	};

	const writeHikvisionManualCopySpec = (params: HikvisionManualCopyParams) => {
		const targetDevices = params.targetDevices?.length
			? params.targetDevices
			: params.targetDevice
				? [params.targetDevice]
				: [];
		const specText = [
			buildHikvisionManualCopySpecLine(params.sourceDevice),
			...targetDevices.map(buildHikvisionManualCopySpecLine),
		].join("\n");
		const localPath = path.join(
			os.tmpdir(),
			`project-truth-hikvision-manual-copy-${Date.now()}-${Math.random()
				.toString(16)
				.slice(2)}.spec`,
		);
		fsSync.writeFileSync(localPath, `${specText}\n`, { mode: 0o600 });
		return localPath;
	};

	const preflightHikvisionManualCopyEndpoint = async (
		device: any,
		role: "source" | "target",
		employeeNo: string,
	) => {
		const { host, port } = getHikvisionSdkEndpoint(device, {
			useTunnelMap: false,
		});
		const label = hikvisionDeviceLabel(device);
		if (!/^[A-Za-z0-9_.-]+$/.test(host) || !/^\d+$/.test(port)) {
			throw new Error(
				`${label} cannot be used as the SDK copy ${role} for employee ${employeeNo} because its SDK endpoint is invalid (${host || "missing"}:${port || "missing"}).`,
			);
		}
		const result = await runHikvisionListenerVmCommand(
			["bash", "-lc", `timeout 4 nc -z ${host} ${port}`],
			20000,
		);
		if (result.exitCode !== 0) {
			throw new Error(
				`${label} cannot be used as the SDK copy ${role} for employee ${employeeNo} right now (VM cannot reach ${host}:${port} before SDK login).`,
			);
		}
	};

	const preflightHikvisionManualCopyEndpoints = async (
		devices: Array<{ device: any; role: "source" | "target" }>,
		employeeNo: string,
	) => {
		const probes = devices.map(({ device, role }) => {
			const { host, port } = getHikvisionSdkEndpoint(device, {
				useTunnelMap: false,
			});
			const deviceId = String(device?.id || "").trim();
			if (
				!/^[A-Za-z0-9_.-]+$/.test(deviceId) ||
				!/^[A-Za-z0-9_.-]+$/.test(host) ||
				!/^\d+$/.test(port)
			) {
				throw new Error(
					`${hikvisionDeviceLabel(device)} cannot be used as the SDK copy ${role} for employee ${employeeNo} because its SDK endpoint is invalid (${host || "missing"}:${port || "missing"}).`,
				);
			}
			return { device, deviceId, host, port, role };
		});
		const script = [
			...probes.map(
				(probe) =>
					`(if timeout 2 nc -z ${probe.host} ${probe.port} >/dev/null 2>&1; then echo '${probe.deviceId}|${probe.role}|ok'; else echo '${probe.deviceId}|${probe.role}|failed'; fi) &`,
			),
			"wait",
		].join(" ");
		const result = await runHikvisionListenerVmCommand(["bash", "-lc", script], 7000);
		if (result.exitCode !== 0 && !result.stdout.trim()) {
			throw new Error(
				result.stderr.trim() ||
					"The VM could not run the Hikvision SDK reachability preflight",
			);
		}
		const statusByDeviceId = new Map(
			result.stdout
				.split(/\r?\n/)
				.map((line) => line.trim().split("|"))
				.filter((parts) => parts.length === 3)
				.map((parts) => [parts[0], parts[2]]),
		);
		return probes.map((probe) => ({
			...probe,
			ok: statusByDeviceId.get(probe.deviceId) === "ok",
		}));
	};

	const runHikvisionManualCopyOnVm = async (params: HikvisionManualCopyParams) => {
		const waitSeconds = Math.max(1, Math.min(Number(params.waitSeconds || 20), 30));
		const targetDevices = params.targetDevices?.length
			? params.targetDevices
			: params.targetDevice
				? [params.targetDevice]
				: [];
		const emitManualCopyProgress = (event: any) =>
			params.onProgress?.({
				...event,
				userKey: `vendor:${params.employeeNo}`,
				vendorUserId: params.employeeNo,
				sourceDeviceId: params.sourceDeviceId,
				sourceDeviceName: params.sourceDevice?.name || params.sourceDevice?.address,
				targetDeviceIds: targetDevices.map((device) => device?.id).filter(Boolean),
				targetDeviceNames: targetDevices
					.map((device) => device?.name || device?.address)
					.filter(Boolean),
				credentialStages: [
					"user",
					...(params.includeFingerprints ? ["fingerprint"] : []),
					...(params.includeFaceRecognition ? ["face"] : []),
				],
				includeFingerprints: params.includeFingerprints,
				includeFaceRecognition: params.includeFaceRecognition,
				batchMultiTarget: targetDevices.length > 1,
			});
		if (!targetDevices.length) {
			throw new Error("At least one Hikvision target device is required for peer copy");
		}
		emitManualCopyProgress({
			stage: "vm_copy_preflight_started",
			targetCount: targetDevices.length,
			message: `Checking VM SDK reachability for user ${params.employeeNo} before peer copy.`,
		});
		if (!params.skipPreflight) {
			await preflightHikvisionManualCopyEndpoint(
				params.sourceDevice,
				"source",
				params.employeeNo,
			);
			await Promise.all(
				targetDevices.map((targetDevice) =>
					preflightHikvisionManualCopyEndpoint(targetDevice, "target", params.employeeNo),
				),
			);
		}
		emitManualCopyProgress({
			stage: "vm_copy_preflight_done",
			targetCount: targetDevices.length,
			message: `VM SDK reachability passed for user ${params.employeeNo}; preparing manual copy spec.`,
		});
		const localSpecPath = writeHikvisionManualCopySpec(params);
		const remoteSpecPath = `/tmp/project-truth-hikvision-manual-copy-${Date.now()}.spec`;
		try {
			const copySpecResult = await runHikvisionListenerVmCopy(
				localSpecPath,
				remoteSpecPath,
				12000,
			);
			if (copySpecResult.exitCode !== 0) {
				throw new Error(
					copySpecResult.stderr.trim() ||
						copySpecResult.stdout.trim() ||
						"Failed to copy Hikvision manual peer-copy spec to the VM",
				);
			}

			// Multi-target + FP/face need headroom; default was 10s and caused timeout storms on merge.
			// Env floor still wins; scale by peers and modalities up to 90s.
			const configuredCopyTimeout = Math.max(
				5,
				Math.min(Number(process.env.HIKVISION_MANUAL_COPY_TIMEOUT_SECONDS || 25), 90),
			);
			const modalityBonus =
				(params.includeFingerprints ? 8 : 0) + (params.includeFaceRecognition ? 8 : 0);
			const peerBonus = Math.max(0, targetDevices.length - 1) * 6;
			const manualCopyTimeoutSeconds = Math.max(
				waitSeconds + 5,
				Math.min(configuredCopyTimeout + modalityBonus + peerBonus, 90),
			);
			// Force wrapper to mint HRIS bearer token even when static device spec is used.
			// Without this, curl to http://127.0.0.1:53001 returns 401 and every peer copy fails.
			const runtimeRoute = resolveHikvisionRuntimeRoute();
			const manualCopyAuthEnv = [
				"HIKVISION_HOT_RELOAD_DEVICE_SOURCE=api",
				`HIKVISION_HOST_REVERSE_API_BASE=${runtimeRoute.apiBase}`,
				`HIKVISION_HOT_RELOAD_API_BASE=${runtimeRoute.apiBase}`,
			];
			const runManualCopy = (extraEnv: string[] = []) =>
				runHikvisionListenerVmCommand(
					[
						"sudo",
						"timeout",
						"-k",
						"5s",
						`${manualCopyTimeoutSeconds}s`,
						"env",
						...manualCopyAuthEnv,
						...extraEnv,
						"HIKVISION_ALLOW_STATIC_DEVICE_SPEC=1",
						"HIKVISION_SKIP_SPOOL_REPLAY=1",
						`HIKVISION_DEVICE_SPEC_OVERRIDE=${remoteSpecPath}`,
						`HIKVISION_RUN_SECONDS=${waitSeconds}`,
						HIKVISION_VM_WRAPPER_REMOTE_PATH,
						"--run-once",
						"--manual-full-mirror-source-device-id",
						params.sourceDeviceId,
						"--manual-employee-no",
						params.employeeNo,
						...(params.includeFingerprints ? ["--manual-include-fingerprints"] : []),
						...(params.includeFaceRecognition ? [] : ["--manual-exclude-face"]),
					],
					Math.max(manualCopyTimeoutSeconds * 1000 + 5000, 15000),
				);
			const strategies = [
				{
					name: "static_spec",
					extraEnv: [] as string[],
				},
				{
					name: "api",
					// Prefer host reverse :53001 (not stale :3101) for device list + token posts.
					extraEnv: [
						"HIKVISION_HOT_RELOAD_DEVICE_SOURCE=api",
						"HIKVISION_HOT_RELOAD_API_BASE=http://127.0.0.1:53001",
					],
				},
			];
			const failures: string[] = [];
			const evaluateManualCopyEvents = (events: Record<string, any>[]) => {
				const successfulTargetIds = new Set(
					events
						.filter(
							(event) =>
								String(event?.employeeNo || "").trim() === params.employeeNo &&
								String(event?.ok || "")
									.trim()
									.toLowerCase() === "true" &&
								(event?.event === "peer_user_write" ||
									(event?.event === "peer_sync_attempt" &&
										String(event?.operation || "")
											.trim()
											.toLowerCase() === "user")),
						)
						.map((event) => String(event?.targetDeviceId || "").trim())
						.filter(Boolean),
				);
				const peerUserWriteOk = targetDevices.every((targetDevice) =>
					successfulTargetIds.has(String(targetDevice?.id || "").trim()),
				);
				const fingerprintWriteOk =
					!params.includeFingerprints ||
					targetDevices.every((targetDevice) =>
						events.some(
							(event) =>
								String(event?.employeeNo || "").trim() === params.employeeNo &&
								((event?.event === "peer_fingerprint_write" &&
									String(event?.targetDeviceId || "").trim() ===
										String(targetDevice?.id || "").trim() &&
									String(event?.ok || "")
										.trim()
										.toLowerCase() === "true") ||
									hikvisionPeerSyncAttemptOk(
										event,
										"fingerprint",
										params.employeeNo,
										String(targetDevice?.id || "").trim(),
									) ||
									(event?.event === "peer_fingerprint_write_skipped" &&
										String(event?.targetDeviceId || "").trim() ===
											String(targetDevice?.id || "").trim())),
						),
					);
				const completed = events.some(
					(event) =>
						event?.event === "reconcile_completed" &&
						String(event?.employeeNo || "").trim() === params.employeeNo,
				);
				return { peerUserWriteOk, fingerprintWriteOk, completed };
			};
			for (const strategy of strategies) {
				emitManualCopyProgress({
					stage: "vm_copy_attempt_started",
					strategy: strategy.name,
					runtimeLocation: runtimeRoute.location,
					commandTransport: runtimeRoute.commandTransport,
					apiBase: runtimeRoute.apiBase,
					timeoutSeconds: manualCopyTimeoutSeconds,
					targetCount: targetDevices.length,
					message: `VM SDK ${strategy.name} attempt for user ${params.employeeNo}: user/fingerprint/face to ${targetDevices.length} target(s).`,
				});
				let result = await runManualCopy(strategy.extraEnv);
				const firstAttemptDetail = result.stderr.trim() || result.stdout.trim();
				if (result.exitCode === 124 || result.exitCode === 137) {
					const events = parseJsonLines(result.stdout);
					const eventProof = evaluateManualCopyEvents(events);
					if (
						eventProof.peerUserWriteOk &&
						eventProof.completed &&
						eventProof.fingerprintWriteOk
					) {
						return {
							waitSeconds,
							strategy: `${strategy.name}_completed_before_timeout`,
							stdout: result.stdout,
							stderr: result.stderr,
							events,
						};
					}
					const detail = firstAttemptDetail
						? ` Last output: ${firstAttemptDetail.slice(-500)}`
						: "";
					const timeoutMessage = `Timed out running Hikvision manual copy (${strategy.name}) for user ${params.employeeNo} from ${params.sourceDevice.name || params.sourceDevice.id}.${detail}`;
					emitManualCopyProgress({
						stage: "vm_copy_attempt_timeout",
						strategy: strategy.name,
						timeoutSeconds: manualCopyTimeoutSeconds,
						error: timeoutMessage,
						message: timeoutMessage,
					});
					failures.push(timeoutMessage);
					continue;
				}
				emitManualCopyProgress({
					stage: "vm_copy_attempt_finished",
					strategy: strategy.name,
					exitCode: result.exitCode,
					events: parseJsonLines(result.stdout).length,
					message: `VM SDK ${strategy.name} attempt for user ${params.employeeNo} exited ${result.exitCode}.`,
				});
				if (
					result.exitCode !== 0 &&
					isMissingHikvisionListenerRuntimeError(firstAttemptDetail)
				) {
					const installResult = await installManagedHikvisionListenerWrapperOnVm();
					if (!installResult.ok) {
						throw new Error(
							installResult.error ||
								"Failed to prepare Hikvision listener runtime for manual copy",
						);
					}
					result = await runManualCopy(strategy.extraEnv);
				}
				const events = parseJsonLines(result.stdout);
				const { peerUserWriteOk, fingerprintWriteOk, completed } =
					evaluateManualCopyEvents(events);
				if (result.exitCode === 0 && peerUserWriteOk && completed && fingerprintWriteOk) {
					return {
						waitSeconds,
						strategy: strategy.name,
						stdout: result.stdout,
						stderr: result.stderr,
						events,
					};
				}
				const sdkFailureMessage =
					targetDevices
						.map((targetDevice) =>
							buildHikvisionManualCopySdkFailureMessage({
								events,
								sourceDevice: params.sourceDevice,
								targetDevice,
								employeeNo: params.employeeNo,
							}),
						)
						.find(Boolean) || "";
				if (
					sdkFailureMessage &&
					isDeterministicHikvisionManualCopySdkFailure(sdkFailureMessage)
				) {
					throw new Error(sdkFailureMessage);
				}
				const visibleEvents = events
					.filter((event) => event?.event)
					.slice(-12)
					.map((event) => ({
						event: event.event,
						operation: event.operation,
						targetDeviceId: event.targetDeviceId,
						employeeNo: event.employeeNo,
						ok: event.ok,
						reason: event.reason,
						lastError: event.lastError,
					}));
				const parsedEventSummary =
					events.length > 0
						? `events=${events.length}; completed=${completed}; userOk=${peerUserWriteOk}; fingerprintOk=${fingerprintWriteOk}; latest=${JSON.stringify(visibleEvents)}`
						: "";
				failures.push(
					`${strategy.name}: ${
						[
							sdkFailureMessage,
							parsedEventSummary,
							result.stderr.trim(),
							!parsedEventSummary ? result.stdout.trim() : "",
						]
							.filter(Boolean)
							.join(" | ") ||
						"Scoped Hikvision user copy did not report a completed peer write"
					}`,
				);
			}
			throw new Error(failures.join(" | "));
		} finally {
			try {
				fsSync.unlinkSync(localSpecPath);
			} catch {}
			await runHikvisionListenerVmCommand(["sudo", "rm", "-f", remoteSpecPath], 7000).catch(
				() => undefined,
			);
		}
	};

	const getDeviceUserBiometricBundleSecret = (organizationId: string, deviceId: string) => {
		const configured = String(process.env.DEVICE_USER_BIOMETRIC_BUNDLE_KEY || "").trim();
		if (configured) return { secret: configured, source: "DEVICE_USER_BIOMETRIC_BUNDLE_KEY" };
		const appEnvironment = String(process.env.APP_ENV || "")
			.trim()
			.toLowerCase();
		const nodeEnvironment = String(process.env.NODE_ENV || "")
			.trim()
			.toLowerCase();
		const isProductionCustodyRuntime = appEnvironment
			? appEnvironment === "production" || appEnvironment === "prod"
			: nodeEnvironment === "production";
		if (isProductionCustodyRuntime) {
			throw new Error(
				"DEVICE_USER_BIOMETRIC_BUNDLE_KEY is required for biometric custody in production",
			);
		}
		return {
			secret: `project-truth-dev-biometric-bundle:${organizationId}:${deviceId}`,
			source: "development-derived-context-key",
		};
	};

	const encryptDeviceUserBiometricPayload = (params: {
		organizationId: string;
		deviceId: string;
		vendorUserId: string;
		modality?: "fingerprint" | "face" | "combined";
		payload: Record<string, any>;
	}) => {
		const { secret, source } = getDeviceUserBiometricBundleSecret(
			params.organizationId,
			params.deviceId,
		);
		const salt = randomBytes(16);
		const iv = randomBytes(12);
		const key = createHash("sha256").update(secret).update(salt).digest();
		const cipher = createCipheriv("aes-256-gcm", key, iv);
		const plaintext = Buffer.from(JSON.stringify(params.payload), "utf8");
		const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
		const authTag = cipher.getAuthTag();
		return {
			format: "project-truth.hikvision-biometric-template.v1",
			algorithm: DEVICE_USER_BIOMETRIC_BUNDLE_ALGORITHM,
			keySource: source,
			deviceId: params.deviceId,
			vendorUserId: params.vendorUserId,
			modality: params.modality || "combined",
			salt: salt.toString("base64"),
			iv: iv.toString("base64"),
			authTag: authTag.toString("base64"),
			ciphertext: ciphertext.toString("base64"),
			plaintextSha256: createHash("sha256").update(plaintext).digest("hex"),
			createdAt: new Date().toISOString(),
		};
	};

	const decryptDeviceUserBiometricPayload = (params: {
		organizationId: string;
		deviceId: string;
		encrypted: any;
		passphrase?: string;
		allowLegacyServerEnvelope?: boolean;
		expectedVendorUserId?: string;
		expectedModality?: "fingerprint" | "face";
	}) => {
		const encrypted = params.encrypted || {};
		if (encrypted.format === PORTABLE_BIOMETRIC_ENVELOPE_FORMAT) {
			return decryptPortableBiometricEnvelope({
				encrypted,
				passphrase: String(params.passphrase || ""),
				expectedDeviceId: params.deviceId,
				expectedVendorUserId:
					params.expectedVendorUserId || String(encrypted.vendorUserId || ""),
				expectedModality:
					params.expectedModality || (encrypted.modality as "fingerprint" | "face"),
			});
		}
		const salt = Buffer.from(String(encrypted.salt || ""), "base64");
		const iv = Buffer.from(String(encrypted.iv || ""), "base64");
		const authTag = Buffer.from(String(encrypted.authTag || ""), "base64");
		const ciphertext = Buffer.from(String(encrypted.ciphertext || ""), "base64");
		if (!params.allowLegacyServerEnvelope) {
			throw new Error(
				"Legacy server-key biometric envelope must be re-exported as a portable v2 package",
			);
		}
		const { secret } = getDeviceUserBiometricBundleSecret(
			params.organizationId,
			params.deviceId,
		);
		const key = createHash("sha256").update(secret).update(salt).digest();
		const decipher = createDecipheriv("aes-256-gcm", key, iv);
		decipher.setAuthTag(authTag);
		const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		const plaintextSha256 = createHash("sha256").update(plaintext).digest("hex");
		if (encrypted.plaintextSha256 && encrypted.plaintextSha256 !== plaintextSha256) {
			throw new Error("Encrypted biometric bundle hash mismatch");
		}
		return JSON.parse(plaintext.toString("utf8"));
	};

	const encryptPortableDeviceUserBiometricPayload = (params: {
		deviceId: string;
		vendorUserId: string;
		modality: "fingerprint" | "face";
		payload: Record<string, any>;
		passphrase: string;
	}) => encryptPortableBiometricEnvelope(params);

	const rewrapCachedBiometricEnvelopeForPortableExport = (params: {
		organizationId: string;
		deviceId: string;
		vendorUserId: string;
		modality: "fingerprint" | "face";
		encrypted: any;
		passphrase: string;
	}) =>
		encryptPortableDeviceUserBiometricPayload({
			deviceId: params.deviceId,
			vendorUserId: params.vendorUserId,
			modality: params.modality,
			passphrase: params.passphrase,
			payload: decryptDeviceUserBiometricPayload({
				organizationId: params.organizationId,
				deviceId: params.deviceId,
				encrypted: params.encrypted,
				allowLegacyServerEnvelope: true,
				expectedVendorUserId: params.vendorUserId,
				expectedModality: params.modality,
			}),
		});

	const parseEncryptedDeviceUserBiometricTemplate = (...candidates: any[]) => {
		for (const candidate of candidates.flat()) {
			if (!candidate) continue;
			try {
				const parsed =
					typeof candidate === "string" ? JSON.parse(candidate.trim()) : candidate;
				if (
					parsed?.ciphertext &&
					parsed?.algorithm === DEVICE_USER_BIOMETRIC_BUNDLE_ALGORITHM
				) {
					return parsed;
				}
			} catch {}
		}
		return null;
	};
	const parseEncryptedDeviceUserBiometricModality = (
		modality: "fingerprint" | "face",
		...candidates: any[]
	) => {
		const parsed = parseEncryptedDeviceUserBiometricTemplate(...candidates);
		return parsed?.modality === modality ? parsed : null;
	};

	const parseImportedEncryptedBiometricTemplates = (row: any) => {
		const fingerprintCandidate = parseEncryptedDeviceUserBiometricTemplate(
			row?.vendorMetadata?.biometricBundle?.fingerprintRawTemplateBlob,
			row?.rawPayload?._hrisDeviceMetadata?.biometricCsvColumns?.fingerprintRawTemplateBlob,
		);
		const faceCandidate = parseEncryptedDeviceUserBiometricTemplate(
			row?.vendorMetadata?.biometricBundle?.faceRawTemplateBlob,
			row?.rawPayload?._hrisDeviceMetadata?.biometricCsvColumns?.faceRawTemplateBlob,
		);
		return {
			fingerprint:
				fingerprintCandidate?.modality === "fingerprint" ? fingerprintCandidate : null,
			face: faceCandidate?.modality === "face" ? faceCandidate : null,
			legacy: parseEncryptedDeviceUserBiometricTemplate(
				row?.vendorMetadata?.biometricBundle?.encryptedBiometricTemplate,
				row?.rawPayload?._hrisDeviceMetadata?.biometricExport?.encryptedBiometricTemplate,
				...(!fingerprintCandidate?.modality ? [fingerprintCandidate] : []),
				...(!faceCandidate?.modality ? [faceCandidate] : []),
			),
		};
	};

	const parseCachedDeviceUserBiometricTemplates = (row: any) => {
		const biometricExport = row?.rawPayload?._hrisDeviceMetadata?.biometricExport || {};
		const biometricBundle = row?.vendorMetadata?.biometricBundle || {};
		return {
			fingerprint: parseEncryptedDeviceUserBiometricModality(
				"fingerprint",
				biometricExport.encryptedFingerprintTemplate,
				biometricBundle.encryptedFingerprintTemplate,
				biometricBundle.fingerprintRawTemplateBlob,
			),
			face: parseEncryptedDeviceUserBiometricModality(
				"face",
				biometricExport.encryptedFaceTemplate,
				biometricBundle.encryptedFaceTemplate,
				biometricBundle.faceRawTemplateBlob,
			),
			legacy: parseEncryptedDeviceUserBiometricTemplate(
				biometricExport.encryptedBiometricTemplate,
				biometricBundle.encryptedBiometricTemplate,
			),
		};
	};

	const buildDeviceUserBiometricMetadata = (
		biometricExport: any,
		source = "hikvision_sdk_live_read",
	) => {
		const fingerprintEncrypted = biometricExport.encryptedFingerprint || null;
		const faceEncrypted = biometricExport.encryptedFace || null;
		const fingerprintEncryptedValue = fingerprintEncrypted
			? JSON.stringify(fingerprintEncrypted)
			: "";
		const faceEncryptedValue = faceEncrypted ? JSON.stringify(faceEncrypted) : "";
		return {
			rawPayloadMetadata: {
				...(fingerprintEncrypted
					? { encryptedFingerprintTemplate: fingerprintEncrypted }
					: {}),
				...(faceEncrypted ? { encryptedFaceTemplate: faceEncrypted } : {}),
				fingerprintTemplateCount: biometricExport.fingerprintCount,
				faceTemplateSize: biometricExport.faceTemplateSize,
				facePictureSize: biometricExport.facePictureSize,
				cardNo: biometricExport.cardNo,
				source,
				capturedAt: new Date().toISOString(),
			},
			vendorMetadata: {
				present: Boolean(fingerprintEncrypted || faceEncrypted),
				algorithm: DEVICE_USER_BIOMETRIC_BUNDLE_ALGORITHM,
				...(fingerprintEncrypted
					? {
							fingerprintPresent: true,
							fingerprintRawTemplateBlob: fingerprintEncryptedValue,
							encryptedFingerprintTemplate: fingerprintEncrypted,
							fingerprintTemplateKeySource: fingerprintEncrypted.keySource || null,
							fingerprintTemplateSha256: fingerprintEncrypted.plaintextSha256 || null,
						}
					: {}),
				...(faceEncrypted
					? {
							facePresent: true,
							faceRawTemplateBlob: faceEncryptedValue,
							encryptedFaceTemplate: faceEncrypted,
							faceTemplateKeySource: faceEncrypted.keySource || null,
							faceTemplateSha256: faceEncrypted.plaintextSha256 || null,
						}
					: {}),
				source,
				capturedAt: new Date().toISOString(),
			},
		};
	};

	const applyDeviceUserBiometricMetadataToRow = (row: any, metadata: any) => {
		const existingCredentialSummary =
			row.rawPayload?._hrisDeviceMetadata?.credentialSummary ||
			row.vendorMetadata?.credentialSummary ||
			{};
		const fingerprintCount = Math.max(
			Number(existingCredentialSummary.fingerprintCount || 0),
			Number(metadata.rawPayloadMetadata?.fingerprintTemplateCount || 0),
		);
		const capturedFaceCount =
			Number(metadata.rawPayloadMetadata?.faceTemplateSize || 0) > 0 ||
			Number(metadata.rawPayloadMetadata?.facePictureSize || 0) > 0
				? 1
				: 0;
		const faceCount = Math.max(
			Number(existingCredentialSummary.faceCount || 0),
			capturedFaceCount,
		);
		const credentialSummary = {
			...existingCredentialSummary,
			fingerprintCount,
			faceCount,
			hasFingerprint: fingerprintCount > 0,
			hasFace: faceCount > 0,
		};
		row.rawPayload = {
			...(row.rawPayload || {}),
			_hrisDeviceMetadata: {
				...(row.rawPayload?._hrisDeviceMetadata || {}),
				credentialSummary,
				biometricExport: {
					...(row.rawPayload?._hrisDeviceMetadata?.biometricExport || {}),
					...metadata.rawPayloadMetadata,
				},
			},
		};
		row.vendorMetadata = {
			...(row.vendorMetadata || {}),
			credentialSummary,
			biometricBundle: (() => {
				const merged = {
					...(row.vendorMetadata?.biometricBundle || {}),
					...metadata.vendorMetadata,
				};
				return {
					...merged,
					present: Boolean(merged.fingerprintPresent || merged.facePresent),
				};
			})(),
		};
	};

	const persistDeviceUserBiometricMetadata = async (params: {
		organizationId: string;
		deviceId: string;
		vendorUserId: string;
		row: any;
	}) => {
		if (!(await hasDeviceUserVendorMetadataColumn())) return null;
		return (prisma as any).deviceUser.update({
			where: {
				organizationId_deviceId_vendorUserId: {
					organizationId: params.organizationId,
					deviceId: params.deviceId,
					vendorUserId: params.vendorUserId,
				},
			},
			data: {
				rawPayload: params.row.rawPayload || {},
				vendorMetadata: params.row.vendorMetadata || {},
				lastSyncedAt: new Date(),
			},
			select: { id: true, vendorUserId: true, updatedAt: true },
		});
	};

	const summarizeDeviceUserBiometricEvents = async (params: {
		organizationId: string;
		deviceId: string;
		deviceUserId?: string | null;
		employeeNo?: string | null;
	}) => {
		const eventWhere: any = {
			organizationId: params.organizationId,
			deviceId: params.deviceId,
			eventAction: {
				in: [
					"USER_CREATED",
					"USER_UPDATED",
					"FINGERPRINT_ENROLLED",
					"FINGERPRINT_UPDATED",
					"FINGERPRINT_DELETED",
				],
			},
		};
		if (params.deviceUserId) {
			eventWhere.deviceUserId = params.deviceUserId;
		} else if (params.employeeNo) {
			eventWhere.employeeNo = params.employeeNo;
		} else {
			return [];
		}
		const events = await (prisma as any).deviceEvent.findMany({
			where: eventWhere,
			select: {
				id: true,
				eventTime: true,
				eventAction: true,
				eventCategory: true,
				eventConfidence: true,
				source: true,
			},
			orderBy: [{ eventTime: "desc" }],
			take: 10,
		});
		return events.map((event: any) => ({
			id: event.id,
			eventTime: event.eventTime,
			eventAction: event.eventAction,
			eventCategory: event.eventCategory,
			eventConfidence: event.eventConfidence,
			source: event.source,
		}));
	};

	const writeDecryptedBiometricBundleToHikvisionDevice = async (params: {
		req: Request;
		targetDevice: any;
		employeeNo: string;
		decrypted: any;
	}) => {
		const fingerprints = Array.isArray(params.decrypted?.fingerprints)
			? params.decrypted.fingerprints
			: [];
		const results = [];
		// Prefer write+progress+re-read verify. HTTP OK alone is not sticky (TEST A 2026-07-19).
		const { writeAndVerifyFingerprintOnDevice } =
			await import("../../helper/device-user-raw-fingerprint.helper.js");
		for (const fingerprint of fingerprints) {
			const fingerData = String(fingerprint?.data || "").trim();
			if (!fingerData) continue;
			const fingerPrintId = Number(fingerprint.fingerPrintId || 1);
			// Device accepts fingerType "normalFP" string; numeric 0 often Bad Request on TEST A.
			const fingerType =
				fingerprint.fingerType === 0 || fingerprint.fingerType === "0"
					? "normalFP"
					: fingerprint.fingerType != null && fingerprint.fingerType !== ""
						? fingerprint.fingerType
						: "normalFP";
			const verified = await writeAndVerifyFingerprintOnDevice({
				prisma,
				req: params.req,
				deviceId: params.targetDevice.id,
				employeeNo: params.employeeNo,
				fingerData,
				fingerPrintID: fingerPrintId,
				fingerType,
				enableCardReader: [1],
			});
			results.push({
				fingerPrintId,
				fingerType,
				responseStatus: verified.sticky
					? "verified_sticky"
					: verified.writeOk
						? `http_ok_not_sticky:${verified.source}`
						: verified.writeResponse?.error || "write_failed",
				writeOk: verified.writeOk,
				sticky: verified.sticky,
				progressStatus: verified.progress.cardReaderRecvStatus,
				progressErrorMsg: verified.progress.errorMsg,
				numOfFP: verified.numOfFP,
				source: verified.source,
			});
		}
		return {
			fingerprintWrites: results,
			fingerprintWriteCount: results.length,
			faceWrite: params.decrypted?.faceTemplate
				? "not_implemented_for_encrypted_bundle"
				: "not_present",
		};
	};

	const buildHikvisionBiometricExportSpec = (device: any) => {
		const specText = `${buildHikvisionManualCopySpecLine(device)}\n`;
		const localPath = path.join(
			os.tmpdir(),
			`project-truth-hikvision-biometric-export-${Date.now()}-${Math.random()
				.toString(16)
				.slice(2)}.spec`,
		);
		fsSync.writeFileSync(localPath, specText, { mode: 0o600 });
		return localPath;
	};

	const runHikvisionBiometricExportOnVm = async (params: {
		device: any;
		organizationId: string;
		vendorUserId: string;
		includeFingerprints: boolean;
		includeFaces: boolean;
	}) => {
		await preflightHikvisionManualCopyEndpoint(params.device, "source", params.vendorUserId);
		const localSpecPath = buildHikvisionBiometricExportSpec(params.device);
		const remoteSpecPath = `/tmp/project-truth-hikvision-biometric-export-${Date.now()}.spec`;
		try {
			const copySpecResult = await runHikvisionListenerVmCopy(
				localSpecPath,
				remoteSpecPath,
				12000,
			);
			if (copySpecResult.exitCode !== 0) {
				throw new Error(
					copySpecResult.stderr.trim() ||
						copySpecResult.stdout.trim() ||
						"Failed to copy Hikvision biometric export spec to the VM",
				);
			}
			const runExport = (extraEnv: string[] = []) =>
				runHikvisionListenerVmCommand(
					[
						"sudo",
						"env",
						...extraEnv,
						"HIKVISION_ALLOW_STATIC_DEVICE_SPEC=1",
						"HIKVISION_SKIP_SPOOL_REPLAY=1",
						`HIKVISION_DEVICE_SPEC_OVERRIDE=${remoteSpecPath}`,
						"HIKVISION_RUN_SECONDS=1",
						HIKVISION_VM_WRAPPER_REMOTE_PATH,
						"--run-once",
						"--export-biometric-source-device-id",
						params.device.id,
						"--export-biometric-employee-no",
						params.vendorUserId,
						...(params.includeFingerprints
							? []
							: ["--export-biometric-no-fingerprints"]),
						...(params.includeFaces ? [] : ["--export-biometric-no-face"]),
					],
					90000,
				);
			const result = await runExport();
			if (
				result.exitCode !== 0 &&
				isMissingHikvisionListenerRuntimeError(result.stderr || result.stdout)
			) {
				const installResult = await installManagedHikvisionListenerWrapperOnVm();
				if (!installResult.ok) {
					throw new Error(
						installResult.error ||
							"Failed to prepare Hikvision listener runtime for biometric export",
					);
				}
			}
			const finalResult =
				result.exitCode === 0 ||
				!isMissingHikvisionListenerRuntimeError(result.stderr || result.stdout)
					? result
					: await runExport();
			const events = parseJsonLines(finalResult.stdout);
			const exportEvent = events.find(
				(event) =>
					event?.event === "manual_biometric_export_completed" &&
					String(event?.employeeNo || "").trim() === params.vendorUserId,
			);
			if (!exportEvent) {
				throw new Error(
					finalResult.stderr.trim() ||
						finalResult.stdout.trim() ||
						"No biometric export event returned from Hikvision SDK service",
				);
			}
			const fingerprints =
				typeof exportEvent.fingerprints === "string"
					? JSON.parse(exportEvent.fingerprints || "[]")
					: exportEvent.fingerprints || [];
			const sharedPayload = {
				sourceDeviceId: params.device.id,
				sourceDeviceName: params.device.name || params.device.id,
				vendorUserId: params.vendorUserId,
				cardNo: exportEvent.cardNo || "",
				exportedAt: new Date().toISOString(),
			};
			const encryptedFingerprint =
				Array.isArray(fingerprints) && fingerprints.length
					? encryptDeviceUserBiometricPayload({
							organizationId: params.organizationId,
							deviceId: params.device.id,
							vendorUserId: params.vendorUserId,
							modality: "fingerprint",
							payload: { ...sharedPayload, fingerprints },
						})
					: null;
			const encryptedFace =
				exportEvent.faceTemplate || exportEvent.facePicture
					? encryptDeviceUserBiometricPayload({
							organizationId: params.organizationId,
							deviceId: params.device.id,
							vendorUserId: params.vendorUserId,
							modality: "face",
							payload: {
								...sharedPayload,
								faceTemplate: exportEvent.faceTemplate || "",
								facePicture: exportEvent.facePicture || "",
							},
						})
					: null;
			if (!encryptedFingerprint && !encryptedFace) {
				throw new Error(
					`Hikvision SDK returned no fingerprint or face template bytes for device user ${params.vendorUserId}`,
				);
			}
			return {
				encrypted: encryptedFingerprint || encryptedFace,
				encryptedFingerprint,
				encryptedFace,
				fingerprintCount: Array.isArray(fingerprints) ? fingerprints.length : 0,
				faceTemplateSize: Number(exportEvent.faceTemplateSize || 0),
				facePictureSize: Number(exportEvent.facePictureSize || 0),
				cardNo: exportEvent.cardNo || "",
				events: events.map((event) =>
					event?.event === "manual_biometric_export_completed"
						? {
								...event,
								fingerprints: "[encrypted-before-api-response]",
								faceTemplate: event.faceTemplate
									? "[encrypted-before-api-response]"
									: "",
								facePicture: event.facePicture
									? "[encrypted-before-api-response]"
									: "",
							}
						: event,
				),
			};
		} finally {
			try {
				fsSync.unlinkSync(localSpecPath);
			} catch {}
			await runHikvisionListenerVmCommand(["sudo", "rm", "-f", remoteSpecPath], 7000).catch(
				() => undefined,
			);
		}
	};

	const updateHikvisionSyntheticCredentialTally = async (params: {
		organizationId: string;
		deviceId: string;
		vendorUserId: string;
		fingerprintCount?: number | null;
		faceCount?: number | null;
		copiedFromDeviceId?: string | null;
		copiedFromVendorUserId?: string | null;
		note?: string | null;
	}) => {
		const deviceUser = await (prisma as any).deviceUser.findUnique({
			where: {
				organizationId_deviceId_vendorUserId: {
					organizationId: params.organizationId,
					deviceId: params.deviceId,
					vendorUserId: params.vendorUserId,
				},
			},
			select: {
				id: true,
				vendorUserId: true,
				employeeId: true,
				status: true,
				lastSyncedAt: true,
				rawPayload: true,
			},
		});
		if (!deviceUser?.id) {
			throw new Error(
				`Device user ${params.vendorUserId} does not exist in HRIS truth for device ${params.deviceId}`,
			);
		}

		const rawPayload =
			deviceUser.rawPayload &&
			typeof deviceUser.rawPayload === "object" &&
			!Array.isArray(deviceUser.rawPayload)
				? { ...(deviceUser.rawPayload as Record<string, any>) }
				: {};
		const metadata =
			rawPayload._hrisDeviceMetadata &&
			typeof rawPayload._hrisDeviceMetadata === "object" &&
			!Array.isArray(rawPayload._hrisDeviceMetadata)
				? { ...(rawPayload._hrisDeviceMetadata as Record<string, any>) }
				: {};
		const existingSynthetic =
			metadata.syntheticCredentialSummary &&
			typeof metadata.syntheticCredentialSummary === "object" &&
			!Array.isArray(metadata.syntheticCredentialSummary)
				? { ...(metadata.syntheticCredentialSummary as Record<string, any>) }
				: {};
		const nextFingerprintCount =
			params.fingerprintCount === undefined || params.fingerprintCount === null
				? Math.max(0, Math.floor(Number(existingSynthetic.fingerprintCount) || 0))
				: Math.max(0, Math.min(10, Math.floor(Number(params.fingerprintCount) || 0)));
		const nextFaceCount =
			params.faceCount === undefined || params.faceCount === null
				? Math.max(0, Math.floor(Number(existingSynthetic.faceCount) || 0))
				: Math.max(0, Math.min(10, Math.floor(Number(params.faceCount) || 0)));
		if (nextFingerprintCount > 0 || nextFaceCount > 0) {
			metadata.syntheticCredentialSummary = {
				...(nextFingerprintCount > 0
					? {
							fingerprintCount: nextFingerprintCount,
							hasFingerprint: true,
						}
					: {}),
				...(nextFaceCount > 0
					? {
							faceCount: nextFaceCount,
							hasFace: true,
						}
					: {}),
				source: "dev_mock",
				updatedAt: new Date().toISOString(),
				...(params.copiedFromDeviceId
					? { copiedFromDeviceId: params.copiedFromDeviceId }
					: {}),
				...(params.copiedFromVendorUserId
					? { copiedFromVendorUserId: params.copiedFromVendorUserId }
					: {}),
				...(params.note ? { note: params.note } : {}),
			};
		} else {
			delete metadata.syntheticCredentialSummary;
		}
		if (Object.keys(metadata).length > 0) rawPayload._hrisDeviceMetadata = metadata;
		else delete rawPayload._hrisDeviceMetadata;

		return (prisma as any).deviceUser.update({
			where: { id: deviceUser.id },
			data: { rawPayload },
			select: {
				id: true,
				vendorUserId: true,
				employeeId: true,
				status: true,
				lastSyncedAt: true,
				rawPayload: true,
			},
		});
	};

	const updateHikvisionSyntheticFingerprintTally = async (
		params: Omit<Parameters<typeof updateHikvisionSyntheticCredentialTally>[0], "faceCount"> & {
			fingerprintCount: number;
		},
	) =>
		updateHikvisionSyntheticCredentialTally({
			...params,
			fingerprintCount: params.fingerprintCount,
		});

	const updateHikvisionSyntheticFaceTally = async (
		params: Omit<
			Parameters<typeof updateHikvisionSyntheticCredentialTally>[0],
			"fingerprintCount"
		> & { faceCount: number },
	) =>
		updateHikvisionSyntheticCredentialTally({
			...params,
			faceCount: params.faceCount,
		});

	const getEmployeeDisplayName = (employee: any) => {
		const personalInfo = employee?.person?.personalInfo || {};
		return [personalInfo.firstName, personalInfo.middleName, personalInfo.lastName]
			.map((part) => String(part || "").trim())
			.filter(Boolean)
			.join(" ")
			.trim();
	};

	const buildEventEmployeeSnapshot = (employee: any) => ({
		id: employee.id,
		employeeId: employee.employeeId,
		deviceEmpId: employee.deviceEmpId,
		fullName: getEmployeeDisplayName(employee) || employee.employeeId,
	});

	const checkTcpReachability = (
		host: string,
		port: number,
		timeoutMs = 2500,
	): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> =>
		new Promise((resolve) => {
			const startedAt = Date.now();
			const socket = new net.Socket();
			let settled = false;
			const finish = (ok: boolean, error?: string) => {
				if (settled) return;
				settled = true;
				socket.destroy();
				resolve({
					ok,
					latencyMs: ok ? Date.now() - startedAt : null,
					...(error ? { error } : {}),
				});
			};
			socket.setTimeout(timeoutMs);
			socket.once("connect", () => finish(true));
			socket.once("timeout", () => finish(false, `Timed out after ${timeoutMs}ms`));
			socket.once("error", (error) => finish(false, error.message));
			socket.connect(port, host);
		});

	const checkWindowsProcess = (
		processName: string,
	): Promise<{
		ok: boolean;
		status: "running" | "not_running" | "unknown";
		pid?: number;
		error?: string;
	}> =>
		new Promise((resolve) => {
			if (process.platform !== "win32") {
				resolve({ ok: false, status: "unknown", error: "Process check is Windows-only" });
				return;
			}
			execFile(
				"tasklist",
				["/FI", `IMAGENAME eq ${processName}`, "/FO", "CSV", "/NH"],
				{ timeout: 2500 },
				(error, stdout) => {
					if (error) {
						resolve({ ok: false, status: "unknown", error: error.message });
						return;
					}
					const line = stdout
						.split(/\r?\n/)
						.map((item) => item.trim())
						.find((item) => item && !item.includes("INFO:"));
					const pid = line?.match(/^"[^"]+","(\d+)"/i)?.[1];
					resolve(
						pid
							? { ok: true, status: "running", pid: Number(pid) }
							: { ok: false, status: "not_running" },
					);
				},
			);
		});

	const isZktecoDevice = (device: {
		name?: string | null;
		protocol?: string | null;
		port?: number | null;
		config?: Prisma.JsonValue | null;
	}) => {
		const configValue = device.config as any;
		const vendor = String(configValue?.vendor || configValue?.type || "").toLowerCase();
		const name = String(device.name || "").toLowerCase();
		return (
			vendor.includes("zkteco") ||
			name.includes("zkteco") ||
			(String(device.protocol || "").toLowerCase() === "tcp" && Number(device.port) === 4370)
		);
	};

	const isHikvisionDevice = (device: {
		name?: string | null;
		config?: Prisma.JsonValue | null;
	}) => {
		const configValue = device.config as any;
		const vendor = String(
			configValue?.vendor || configValue?.type || configValue?.source || "",
		).toLowerCase();
		const name = String(device.name || "").toLowerCase();
		return (
			vendor.includes("hikvision") || name.includes("hikvision") || name.includes("entrance")
		);
	};

	const getHealthStatus = (checks: Array<{ ok: boolean }>) => {
		const onlineCount = checks.filter((check) => check.ok).length;
		if (onlineCount === checks.length) return "online";
		if (onlineCount > 1) return "degraded";
		return "offline";
	};

	const getZktecoBridgeStatusUrl = () => {
		const configuredUrl = String(process.env.ZKTECO_BRIDGE_STATUS_URL || "").trim();
		if (configuredUrl) return configuredUrl;
		const nodeHostIp = String(process.env.NODE_HOST_IP || "").trim();
		if (nodeHostIp) return `http://${nodeHostIp}:4371/status`;
		return "";
	};

	const getZktecoBridgeStatus = async () => {
		const statusUrl = getZktecoBridgeStatusUrl();
		if (!statusUrl) {
			return {
				ok: false,
				status: "not_configured",
				statusUrl: null,
				latencyMs: null,
				data: null,
				error: "ZKTECO_BRIDGE_STATUS_URL is not configured",
			};
		}
		const timeoutMs = Number(process.env.ZKTECO_BRIDGE_STATUS_TIMEOUT_MS || 10000);
		const startedAt = Date.now();
		try {
			const response = await fetch(statusUrl, {
				method: "GET",
				signal: AbortSignal.timeout(timeoutMs),
			});
			const data = await response.json().catch(() => null);
			return {
				ok: response.ok,
				status: response.ok ? data?.status || "online" : "offline",
				statusUrl,
				latencyMs: Date.now() - startedAt,
				data,
				...(response.ok ? {} : { error: `HTTP ${response.status}` }),
			};
		} catch (error: any) {
			return {
				ok: false,
				status: "offline",
				statusUrl,
				latencyMs: null,
				data: null,
				error: error?.message || "ZKTeco SDK sidecar status did not respond",
			};
		}
	};

	const getZktecoBridgePreview = async (deviceIp?: string | null) => {
		const statusUrl = getZktecoBridgeStatusUrl();
		if (!statusUrl) {
			return {
				ok: false,
				status: "not_configured",
				statusUrl: null,
				data: null,
				error: "ZKTECO_BRIDGE_STATUS_URL is not configured",
			};
		}

		const previewUrl = new URL(statusUrl);
		previewUrl.pathname = previewUrl.pathname.replace(/\/status\/?$/, "/preview");
		if (deviceIp) previewUrl.searchParams.set("deviceIp", deviceIp);

		const timeoutMs = Number(process.env.ZKTECO_BRIDGE_PREVIEW_TIMEOUT_MS || 180000);
		try {
			const response = await fetch(previewUrl.toString(), {
				method: "GET",
				signal: AbortSignal.timeout(timeoutMs),
			});
			const data = await response.json().catch(() => null);
			return {
				ok: response.ok,
				status: response.ok ? data?.status || "previewed" : "failed",
				statusUrl: previewUrl.toString(),
				data,
				...(response.ok ? {} : { error: `HTTP ${response.status}` }),
			};
		} catch (error: any) {
			return {
				ok: false,
				status: "offline",
				statusUrl: previewUrl.toString(),
				data: null,
				error: error?.message || "ZKTeco SDK sidecar preview did not respond",
			};
		}
	};

	const postZktecoBridgeSync = async (deviceIp?: string | null) => {
		const statusUrl = getZktecoBridgeStatusUrl();
		if (!statusUrl) {
			return {
				ok: false,
				status: "not_configured",
				statusUrl: null,
				data: null,
				error: "ZKTECO_BRIDGE_STATUS_URL is not configured",
			};
		}

		const syncUrl = new URL(statusUrl);
		syncUrl.pathname = syncUrl.pathname.replace(/\/status\/?$/, "/sync");
		if (deviceIp) syncUrl.searchParams.set("deviceIp", deviceIp);

		const timeoutMs = Number(process.env.ZKTECO_BRIDGE_SYNC_TIMEOUT_MS || 90000);
		try {
			const response = await fetch(syncUrl.toString(), {
				method: "POST",
				signal: AbortSignal.timeout(timeoutMs),
			});
			const data = await response.json().catch(() => null);
			return {
				ok: response.ok,
				status: response.ok ? data?.status || "started" : "failed",
				statusUrl: syncUrl.toString(),
				data,
				...(response.ok ? {} : { error: `HTTP ${response.status}` }),
			};
		} catch (error: any) {
			return {
				ok: false,
				status: "offline",
				statusUrl: syncUrl.toString(),
				data: null,
				error: error?.message || "ZKTeco SDK sidecar sync did not respond",
			};
		}
	};

	const firstNumericValueForKeys = (value: unknown, keys: string[]): number | null => {
		if (!value || typeof value !== "object") return null;
		const record = value as Record<string, unknown>;
		for (const key of keys) {
			const direct = record[key];
			if (direct !== undefined && direct !== null && Number.isFinite(Number(direct))) {
				return Number(direct);
			}
		}
		for (const nested of Object.values(record)) {
			const found = firstNumericValueForKeys(nested, keys);
			if (found !== null) return found;
		}
		return null;
	};

	const readHikvisionSearchTotal = (data: unknown, envelopeKey: string) => {
		const payload = data && typeof data === "object" ? (data as any) : {};
		const envelope = payload?.[envelopeKey] || payload?.data?.[envelopeKey] || payload;
		return firstNumericValueForKeys(envelope, [
			"totalMatches",
			"numOfMatches",
			"totalNum",
			"totalNumber",
			"total",
			"eventTotal",
		]);
	};

	const formatHikvisionManilaDateTime = (date: Date) => {
		const parts = new Intl.DateTimeFormat("en-CA", {
			timeZone: "Asia/Manila",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		})
			.formatToParts(date)
			.reduce<Record<string, string>>((acc, part) => {
				if (part.type !== "literal") acc[part.type] = part.value;
				return acc;
			}, {});
		return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
	};

	const getProjectRuntimeRoot = () => {
		const cwd = process.cwd();
		if (path.basename(cwd).toLowerCase() === "hris-api") {
			return path.resolve(cwd, "..", ".runtime");
		}
		return path.resolve(cwd, ".runtime");
	};

	const serializeForJson = (value: unknown) =>
		JSON.parse(
			JSON.stringify(value, (_key, innerValue) =>
				typeof innerValue === "bigint" ? innerValue.toString() : innerValue,
			),
		);

	const writeJsonFile = async (filePath: string, value: unknown) => {
		await fs.writeFile(
			filePath,
			`${JSON.stringify(serializeForJson(value), null, 2)}\n`,
			"utf8",
		);
	};

	const buildDeviceEventResetScope = (req: Request, organizationId: string) => {
		const body = (req.body || {}) as Record<string, unknown>;
		const deviceId = String(body.deviceId || req.query.deviceId || "").trim();
		const source = String(body.source || req.query.source || "").trim();
		const status = String(body.status || req.query.status || "").trim();
		const eventCategory = String(body.eventCategory || req.query.eventCategory || "")
			.trim()
			.toUpperCase();
		const eventAction = String(body.eventAction || req.query.eventAction || "")
			.trim()
			.toUpperCase();
		const eventConfidence = String(body.eventConfidence || req.query.eventConfidence || "")
			.trim()
			.toUpperCase();
		const evidenceSource = String(body.evidenceSource || req.query.evidenceSource || "")
			.trim()
			.toUpperCase();
		const legacyInferredLifecycleOnly =
			body.legacyInferredLifecycleOnly === true ||
			String(req.query.legacyInferredLifecycleOnly || "").toLowerCase() === "true";
		const from = String(body.from || req.query.from || "").trim();
		const to = String(body.to || req.query.to || "").trim();
		const dateField = String(body.dateField || req.query.dateField || "eventTime").trim();
		const where: Prisma.DeviceEventWhereInput = {
			organizationId,
		};

		if (deviceId && deviceId !== "all") where.deviceId = deviceId;
		if (source && source !== "all" && DEVICE_EVENT_SOURCES.has(source)) {
			where.source = source as any;
		}
		if (status && status !== "all" && DEVICE_EVENT_STATUSES.has(status)) {
			where.status = status as any;
		}
		if (
			eventCategory &&
			eventCategory !== "ALL" &&
			DEVICE_EVENT_CATEGORIES.has(eventCategory)
		) {
			where.eventCategory = eventCategory as any;
		}
		if (eventAction && eventAction !== "ALL" && DEVICE_EVENT_ACTIONS.has(eventAction)) {
			where.eventAction = eventAction as any;
		}
		if (
			eventConfidence &&
			eventConfidence !== "ALL" &&
			DEVICE_EVENT_CONFIDENCES.has(eventConfidence)
		) {
			where.eventConfidence = eventConfidence as any;
		}
		if (evidenceSource && evidenceSource !== "ALL") {
			where.payload = { path: ["evidenceSource"], equals: evidenceSource } as any;
		}
		if (legacyInferredLifecycleOnly) {
			where.AND = [
				{ eventType: "BiometricStateBackfill" },
				{ eventConfidence: "INFERRED" as any },
				{ payload: { path: ["derivedFromCurrentDeviceState"], equals: true } as any },
			];
		}

		const eventTimeFilter: Prisma.DateTimeFilter = {};
		const receivedAtFilter: Prisma.DateTimeFilter = {};
		const targetFilter = dateField === "receivedAt" ? receivedAtFilter : eventTimeFilter;
		if (from) {
			const fromDate = parseHikvisionBusinessDateBound(from);
			if (fromDate) targetFilter.gte = fromDate;
		}
		if (to) {
			const toDate = parseHikvisionBusinessDateBound(to, true);
			if (toDate) targetFilter.lte = toDate;
		}
		if (Object.keys(eventTimeFilter).length) where.eventTime = eventTimeFilter;
		if (Object.keys(receivedAtFilter).length) where.receivedAt = receivedAtFilter;

		return {
			where,
			scope: {
				organizationId,
				deviceId: deviceId || "all",
				source: source || "all",
				status: status || "all",
				eventCategory: eventCategory || "all",
				eventAction: eventAction || "all",
				eventConfidence: eventConfidence || "all",
				evidenceSource: evidenceSource || "all",
				legacyInferredLifecycleOnly,
				from: from || null,
				to: to || null,
				dateField: dateField === "receivedAt" ? "receivedAt" : "eventTime",
			},
		};
	};

	const getHikvisionCountFromSearch = async (
		req: Request,
		deviceId: string,
		endpoint: string,
		body: Record<string, unknown>,
		keys: string[],
		options: { timeoutMs?: number } = {},
	) => {
		try {
			const data = await hikvisionFetch(endpoint, {
				method: "POST",
				deviceId,
				prisma,
				request: req,
				timeoutMs: options.timeoutMs ?? HIKVISION_PREVIEW_SEARCH_TIMEOUT_MS,
				headers: { "Content-Type": "application/json" },
				body,
			});
			const envelopeKey =
				(data as any)?.AcsEvent || (data as any)?.data?.AcsEvent
					? "AcsEvent"
					: "UserInfoSearch";
			return {
				ok: true,
				count:
					readHikvisionSearchTotal(data, envelopeKey) ??
					firstNumericValueForKeys(data, keys),
				raw: data,
			};
		} catch (error: any) {
			return {
				ok: false,
				count: null,
				error:
					error?.data?.errorCode ||
					error?.data?.errorCause ||
					error?.message ||
					"Hikvision count request did not respond",
			};
		}
	};

	const getHikvisionLogSearchTotal = async (
		req: Request,
		deviceId: string,
		options: {
			sampleClassify?: boolean;
			startTime?: string | null;
			endTime?: string | null;
		} = {},
	) => {
		const startTime = options.startTime || "2000-01-01T00:00:00+08:00";
		const endTime =
			options.endTime || formatHikvisionManilaDateTime(new Date(Date.now() + 60 * 1000));
		const sampleClassify = options.sampleClassify === true;
		// Leaf metaIds (device-proven on TEST A): server-side filter for exact op totals.
		// Faster and more truthful than sampling 80 mixed Information rows then dumping residual
		// into "Unclassified". Full Information total still used for residual Needs review.
		// See docs: ISAPI ContentMgmt/logSearch CMSearchDescription.metaId leaf paths.
		const leafTimeoutMs = Math.max(HIKVISION_PREVIEW_SEARCH_TIMEOUT_MS, 2800);
		const probeLeaf = async (metaId: string) => {
			try {
				const response = await hikvisionFetch("/ISAPI/ContentMgmt/logSearch", {
					method: "POST",
					deviceId,
					prisma,
					request: req,
					timeoutMs: leafTimeoutMs,
					ensureJsonFormat: false,
					rawResponse: true,
					headers: {
						Accept: "application/xml, text/xml, */*",
						"Content-Type": "application/xml; charset=UTF-8",
					},
					body: buildHikvisionLogSearchXml({
						searchId: `hris-logsearch-leaf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
						startTime,
						endTime,
						maxResults: 1,
						searchResultPosition: 0,
						metaId,
					}),
				});
				const parsed = parseHikvisionLogSearchResponse(String(response?.raw || ""));
				const count =
					typeof parsed.totalMatches === "number" && Number.isFinite(parsed.totalMatches)
						? parsed.totalMatches
						: null;
				return {
					ok: count !== null || Boolean(parsed.responseStatus),
					count,
					metaId,
					responseStatus: parsed.responseStatus || null,
				};
			} catch (error: any) {
				return {
					ok: false,
					count: null as number | null,
					metaId,
					error:
						error?.data?.errorCode ||
						error?.data?.errorCause ||
						error?.message ||
						"leaf logSearch failed",
				};
			}
		};

		try {
			// Parallel leaf probes: total + exact action buckets.
			const [infoProbe, userProbe, fpProbe, delProbe] = await Promise.all([
				probeLeaf("log.hikvision.com/Information"),
				sampleClassify
					? probeLeaf("log.hikvision.com/Information/addUserInfo")
					: Promise.resolve({ ok: false, count: null as number | null, metaId: "" }),
				sampleClassify
					? probeLeaf("log.hikvision.com/Information/addFpByEmployeeNo")
					: Promise.resolve({ ok: false, count: null as number | null, metaId: "" }),
				sampleClassify
					? probeLeaf("log.hikvision.com/Information/clearUserInfo")
					: Promise.resolve({ ok: false, count: null as number | null, metaId: "" }),
			]);

			const count = infoProbe.count;
			const byAction: Record<string, number> = {};
			const labelsByAction: Record<string, string[]> = {};
			if (typeof userProbe.count === "number" && userProbe.count >= 0) {
				byAction.USER_CREATED = userProbe.count;
				labelsByAction.USER_CREATED = ["addUserInfo"];
			}
			if (typeof fpProbe.count === "number" && fpProbe.count >= 0) {
				byAction.FINGERPRINT_ENROLLED = fpProbe.count;
				labelsByAction.FINGERPRINT_ENROLLED = ["addFpByEmployeeNo"];
			}
			if (typeof delProbe.count === "number" && delProbe.count > 0) {
				byAction.USER_DELETED = delProbe.count;
				labelsByAction.USER_DELETED = ["clearUserInfo"];
			}
			// Residual unclassified volume inside Information (not leaf-classified).
			const classifiedSum = Object.values(byAction).reduce((a, b) => a + b, 0);
			if (
				sampleClassify &&
				typeof count === "number" &&
				count >= classifiedSum &&
				count - classifiedSum > 0
			) {
				byAction.UNKNOWN_OPERATION = Math.max(0, count - classifiedSum);
				labelsByAction.UNKNOWN_OPERATION = [
					"Information residual (not addUser/addFp leaf)",
				];
			}

			const hasByAction = sampleClassify && Object.keys(byAction).length > 0;

			return {
				ok: count !== null || infoProbe.ok,
				count,
				// Exact leaf totalMatches for USER_CREATED / FINGERPRINT_ENROLLED (device truth).
				// willAdd = deviceLeafTotal - alreadyInHris (see buildHikvisionSyncLogsEventRows).
				byAction: hasByAction ? byAction : null,
				labelsByAction: hasByAction ? labelsByAction : null,
				sampleByAction: hasByAction ? byAction : null,
				sampleSize: hasByAction ? Object.keys(byAction).length : 0,
				error: count === null ? "Operation logs total unavailable" : null,
				raw: {
					method: "leaf-metaId-totalMatches",
					informationTotal: count,
					userCreatedTotal: userProbe.count,
					fingerprintEnrolledTotal: fpProbe.count,
					userDeletedTotal: delProbe.count,
					infoStatus: infoProbe.responseStatus || null,
				},
			};
		} catch (error: any) {
			return {
				ok: false,
				count: null,
				byAction: null,
				sampleByAction: null,
				sampleSize: 0,
				error:
					error?.data?.errorCode ||
					error?.data?.errorCause ||
					error?.message ||
					"Operation logs (logSearch) did not respond",
				raw: null,
			};
		}
	};

	const getHikvisionSourceCounts = async (
		req: Request,
		deviceId: string,
		options: {
			includeDirectUserInventory?: boolean;
			sampleOperationClassify?: boolean;
			includeAttendanceSource?: boolean;
			includeOperationSource?: boolean;
			startTime?: string | null;
			endTime?: string | null;
		} = {},
	) => {
		const startedAt = Date.now();
		const includeDirectUserInventory = options.includeDirectUserInventory !== false;
		const sampleOperationClassify = options.sampleOperationClassify === true;
		const includeAttendanceSource = options.includeAttendanceSource !== false;
		const includeOperationSource = options.includeOperationSource !== false;
		const startTime = options.startTime || "2000-01-01T00:00:00+08:00";
		const endTime =
			options.endTime || formatHikvisionManilaDateTime(new Date(Date.now() + 60 * 1000));
		// Sync logs only needs event + operation totals. Full UserInfo inventory is slow
		// and must not block the modal when other devices are offline.
		const [userSearch, eventSearch, logSearch, directUsers] = await Promise.all([
			getHikvisionCountFromSearch(
				req,
				deviceId,
				hikvisionEndpoint.accessControl.userInfo.search,
				{
					UserInfoSearchCond: {
						searchID: `hris-user-count-${Date.now()}`,
						searchResultPosition: 0,
						maxResults: 1,
					},
				},
				["totalMatches", "numOfMatches", "totalNum", "totalNumber", "total"],
			),
			includeAttendanceSource
				? getHikvisionCountFromSearch(
						req,
						deviceId,
						hikvisionEndpoint.accessControl.acsEvent.list,
						{
							AcsEventCond: {
								searchID: `hris-event-count-${Date.now()}`,
								searchResultPosition: 0,
								maxResults: 1,
								major: 0,
								minor: 0,
								startTime,
								endTime,
							},
						},
						[
							"totalMatches",
							"numOfMatches",
							"totalNum",
							"totalNumber",
							"total",
							"eventTotal",
						],
					)
				: Promise.resolve({
						ok: false,
						count: null,
						error: "Attendance/access events skipped by selected source group",
						raw: null,
					}),
			includeOperationSource
				? getHikvisionLogSearchTotal(req, deviceId, {
						sampleClassify: sampleOperationClassify,
						startTime,
						endTime,
					})
				: Promise.resolve({
						ok: false,
						count: null,
						byAction: null,
						labelsByAction: null,
						sampleByAction: null,
						sampleSize: 0,
						error: "Operation logs skipped by selected source group",
						raw: null,
					}),
			includeDirectUserInventory
				? fetchAllHikvisionDeviceUsers(req, { id: deviceId }).catch(() => null)
				: Promise.resolve(null),
		]);
		const directCredentialInventory = Array.isArray(directUsers)
			? directUsers.map((user) => extractHikvisionCredentialSummary(user))
			: null;
		const operationDeviceByAction =
			logSearch.byAction && typeof logSearch.byAction === "object"
				? new Map(
						Object.entries(logSearch.byAction).map(([action, count]) => [
							action,
							Number(count) || 0,
						]),
					)
				: null;
		const operationDeviceLabelsByAction =
			logSearch.labelsByAction && typeof logSearch.labelsByAction === "object"
				? new Map(
						Object.entries(logSearch.labelsByAction).map(([action, labels]) => [
							action,
							Array.isArray(labels) ? labels.map(String).filter(Boolean) : [],
						]),
					)
				: null;

		return {
			ok: userSearch.ok || eventSearch.ok || logSearch.ok,
			totalEvents: eventSearch.count,
			operationLogTotal: logSearch.count,
			operationDeviceByAction,
			operationDeviceLabelsByAction,
			operationSampleSize: Number(logSearch.sampleSize || 0) || 0,
			userCount: userSearch.count,
			fingerprintUserCount: directCredentialInventory
				? directCredentialInventory.filter((summary) => summary.fingerprintCount > 0).length
				: null,
			faceUserCount: directCredentialInventory
				? directCredentialInventory.filter((summary) => summary.faceCount > 0).length
				: null,
			cardUserCount: directCredentialInventory
				? directCredentialInventory.filter((summary) => summary.cardCount > 0).length
				: null,
			inventoryEvidenceSource: directCredentialInventory ? "DEVICE_CURRENT_STATE" : null,
			latencyMs: Date.now() - startedAt,
			userProbe: {
				ok: userSearch.ok && userSearch.count !== null,
				count: userSearch.count,
				error: userSearch.error || null,
			},
			eventProbe: {
				ok: eventSearch.ok && eventSearch.count !== null,
				count: eventSearch.count,
				error: eventSearch.error || null,
			},
			operationLogProbe: {
				ok: logSearch.ok && logSearch.count !== null,
				count: logSearch.count,
				error: logSearch.error || null,
			},
			raw: {
				userSearch: userSearch.raw,
				eventSearch: eventSearch.raw,
				logSearch: logSearch.raw,
			},
			error:
				eventSearch.ok || userSearch.ok || logSearch.ok
					? null
					: eventSearch.error ||
						userSearch.error ||
						logSearch.error ||
						"Hikvision device counts did not respond",
		};
	};

	const getHikvisionSourceTotal = async (
		req: Request,
		deviceId: string,
		options: { mode?: "sync-preview" | "full" } = {},
	) => {
		const syncPreviewMode = options.mode === "sync-preview";
		const run = async () => {
			const directCounts = await getHikvisionSourceCounts(req, deviceId, {
				// Event-first Sync logs must not wait on full user inventory pages.
				includeDirectUserInventory: !syncPreviewMode,
				// Preview modal prioritizes open speed: skip heavy operation-log classify.
				// Keep operation source totals; detailed classify runs on Sync job start.
				sampleOperationClassify: false,
			});
			if (
				directCounts.ok &&
				(directCounts.totalEvents !== null ||
					directCounts.userCount !== null ||
					directCounts.operationLogTotal !== null)
			) {
				return directCounts;
			}
			if (
				!directCounts.ok &&
				directCounts.totalEvents === null &&
				directCounts.userCount === null &&
				isHikvisionTransportFailure(directCounts.error)
			) {
				return directCounts;
			}

			try {
				const data = await hikvisionFetch(
					hikvisionEndpoint.accessControl.acsEventTotalNum.get,
					{
						method: "GET",
						deviceId,
						prisma,
						request: req,
						timeoutMs: HIKVISION_PREVIEW_TOTAL_TIMEOUT_MS,
					},
				);
				return {
					ok: true,
					totalEvents: firstNumericValueForKeys(data, [
						"totalNum",
						"totalNumber",
						"total",
						"eventTotal",
						"eventTotalNum",
					]),
					operationLogTotal: directCounts.operationLogTotal ?? null,
					userCount: directCounts.userCount,
					latencyMs: directCounts.latencyMs,
					eventProbe: directCounts.eventProbe,
					operationLogProbe: directCounts.operationLogProbe,
					raw: data,
				};
			} catch (error: any) {
				return {
					ok: false,
					totalEvents: null,
					operationLogTotal: directCounts.operationLogTotal ?? null,
					userCount: directCounts.userCount,
					latencyMs: directCounts.latencyMs,
					eventProbe: directCounts.eventProbe,
					operationLogProbe: directCounts.operationLogProbe,
					error:
						directCounts.error ||
						error?.data?.errorCode ||
						error?.data?.errorCause ||
						error?.message ||
						"Hikvision ACS total number did not respond",
				};
			}
		};

		if (!syncPreviewMode) {
			return run();
		}

		try {
			return await withDeviceUserImportTimeout(
				run(),
				HIKVISION_PREVIEW_DEVICE_BUDGET_MS,
				"Can't reach this device right now (preview timed out)",
			);
		} catch (error: any) {
			const message =
				error?.message || "Can't reach this device right now (preview timed out)";
			return {
				ok: false,
				totalEvents: null,
				operationLogTotal: null,
				userCount: null,
				latencyMs: HIKVISION_PREVIEW_DEVICE_BUDGET_MS,
				error: message,
				eventProbe: { ok: false, count: null, error: message },
				operationLogProbe: { ok: false, count: null, error: message },
			};
		}
	};

	const getHikvisionFastDeviceUserSourceCount = async (req: Request, deviceId: string) => {
		const startedAt = Date.now();
		const readUserCount = (maxResults: number) =>
			getHikvisionCountFromSearch(
				req,
				deviceId,
				hikvisionEndpoint.accessControl.userInfo.search,
				{
					UserInfoSearchCond: {
						searchID: `hris-fast-user-count-${Date.now()}-${maxResults}`,
						searchResultPosition: 0,
						maxResults,
					},
				},
				[
					"totalMatches",
					"numOfMatches",
					"userNumber",
					"userNum",
					"numOfUsers",
					"totalNum",
					"totalNumber",
					"total",
				],
				{ timeoutMs: HIKVISION_FAST_USER_COUNT_TIMEOUT_MS },
			);
		const readUserCountEndpoint = async () => {
			try {
				const data = await hikvisionFetch(hikvisionEndpoint.accessControl.userInfo.count, {
					method: "GET",
					deviceId,
					prisma,
					request: req,
					timeoutMs: HIKVISION_FAST_USER_COUNT_TIMEOUT_MS,
				});
				return {
					ok: true,
					count: firstNumericValueForKeys(data, [
						"userCount",
						"userNumber",
						"userNum",
						"numOfUsers",
						"totalUserCount",
						"userTotal",
						"totalNum",
						"totalNumber",
						"total",
					]),
					raw: data,
					error: null,
				};
			} catch (error: any) {
				return {
					ok: false,
					count: null,
					raw: null,
					error:
						error?.data?.errorCode ||
						error?.data?.errorCause ||
						error?.message ||
						"Hikvision UserInfo count endpoint did not respond",
				};
			}
		};
		const firstUserSearch = await readUserCount(1);
		const firstCount =
			firstUserSearch.count !== null &&
			firstUserSearch.count !== undefined &&
			Number.isFinite(Number(firstUserSearch.count))
				? Number(firstUserSearch.count)
				: null;
		const firstError = firstUserSearch.error ? String(firstUserSearch.error) : "";
		const shouldRetryForMissingTotal =
			firstCount === null && !isHikvisionTransportFailure(firstError);
		const searchResult =
			firstCount !== null || !shouldRetryForMissingTotal
				? firstUserSearch
				: await readUserCount(5);
		const searchCount =
			searchResult.count !== null &&
			searchResult.count !== undefined &&
			Number.isFinite(Number(searchResult.count))
				? Number(searchResult.count)
				: null;
		const userSearch = searchCount !== null ? searchResult : await readUserCountEndpoint();
		const userCount =
			userSearch.count !== null &&
			userSearch.count !== undefined &&
			Number.isFinite(Number(userSearch.count))
				? Number(userSearch.count)
				: null;
		const error =
			userCount === null
				? userSearch.error || "Device returned no user total in UserInfo/Search response"
				: null;

		return {
			ok: userCount !== null,
			totalEvents: null,
			operationLogTotal: null,
			operationDeviceByAction: null,
			operationDeviceLabelsByAction: null,
			operationSampleSize: 0,
			userCount,
			fingerprintUserCount: null,
			faceUserCount: null,
			cardUserCount: null,
			inventoryEvidenceSource: null,
			latencyMs: Date.now() - startedAt,
			userProbe: {
				ok: userCount !== null,
				count: userCount,
				error,
			},
			eventProbe: {
				ok: false,
				count: null,
				error: "Device logs not requested for device-user summary",
			},
			operationLogProbe: {
				ok: false,
				count: null,
				error: "Operation logs not requested for device-user summary",
			},
			raw: {
				userSearch: userSearch.raw,
				eventSearch: null,
				logSearch: null,
			},
			error,
		};
	};

	const getBridgeDeviceStatus = (bridgeStatus: any, address: string) => {
		const devices = Array.isArray(bridgeStatus?.data?.devices) ? bridgeStatus.data.devices : [];
		return devices.find((item: any) => String(item?.ip || "").trim() === address) || null;
	};

	const triggerZktecoAttendanceSync = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const deviceId = String(
				(req.body as any)?.deviceId || (req.query as any)?.deviceId || "",
			).trim();
			let deviceIp = String(
				(req.body as any)?.deviceIp || (req.query as any)?.deviceIp || "",
			).trim();

			if (deviceId && !deviceIp) {
				const device = await (prisma as any).device.findFirst({
					where: { id: deviceId, isDeleted: false },
					select: { address: true },
				});
				deviceIp = String(device?.address || "").trim();
			}

			const result = await postZktecoBridgeSync(deviceIp || null);
			if (!result.ok) {
				res.status(result.status === "failed" ? 409 : 502).json(
					buildErrorResponse(result.error || "Failed to start ZKTeco sync", 502),
				);
				return;
			}

			res.status(202).json(
				buildSuccessResponse(
					"ZKTeco attendance sync started",
					{
						sync: result.data,
						statusUrl: result.statusUrl,
					},
					202,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to start ZKTeco sync", 500),
			);
		}
	};

	const getAcsEventList = (data: any): any[] => {
		const events = data?.AcsEvent?.InfoList;
		return Array.isArray(events) ? events : [];
	};

	const getUserInfoSearchList = (data: any): any[] => {
		const users = data?.UserInfoSearch?.UserInfo || data?.data?.UserInfoSearch?.UserInfo;
		return Array.isArray(users) ? users : [];
	};

	const assertDeviceUserAdmin = (req: Request, res: Response) => {
		const organizationId = String((req as any).organizationId || "").trim();
		const role = String((req as any).role || "").trim();
		if (!organizationId) {
			res.status(400).json(buildErrorResponse("Organization ID not found", 400));
			return null;
		}
		if (!DEVICE_USER_ADMIN_ROLES.has(role)) {
			res.status(403).json(buildErrorResponse("Only admins can manage device users", 403));
			return null;
		}
		return { organizationId, role };
	};

	const describePostCreateHikvisionSyncError = (error: any) => {
		const status = Number(error?.status || error?.statusCode || 0);
		const message = String(error?.message || error || "device_user_sync_failed").trim();
		if (status === 401 || status === 403 || /^unauthorized$/i.test(message)) {
			return "Hikvision device rejected the saved access credentials during UserInfo/Search; device row was created but Device Users auto-sync was skipped";
		}
		return message;
	};

	const getDeviceForUserSync = async (organizationId: string, deviceId: string) => {
		if (!deviceId) return null;
		return (prisma as any).device.findFirst({
			where: { id: deviceId, organizationId, isDeleted: false },
			select: {
				id: true,
				organizationId: true,
				name: true,
				address: true,
				port: true,
				protocol: true,
				config: true,
				access: true,
			},
		});
	};

	const loadEmployeesForDeviceUserCandidates = async (
		organizationId: string,
		candidates: DeviceUserCandidate[],
	) => {
		const values = Array.from(
			new Set(
				candidates
					.flatMap((candidate) => [
						candidate.employeeNo,
						...buildDeviceUserEmployeeNoCandidates(candidate.employeeNo),
					])
					.map((value) => String(value || "").trim())
					.filter(Boolean),
			),
		);
		if (!values.length) return [];
		return prisma.employee.findMany({
			where: {
				organizationId,
				isDeleted: false,
				OR: [{ deviceEmpId: { in: values } }, { employeeId: { in: values } }],
			},
			select: {
				id: true,
				employeeId: true,
				deviceEmpId: true,
			},
		});
	};

	const buildDeviceUserSelect = (options: { includeVendorMetadata?: boolean } = {}) => ({
		id: true,
		organizationId: true,
		deviceId: true,
		employeeId: true,
		vendorUserId: true,
		employeeNo: true,
		displayName: true,
		userType: true,
		status: true,
		validFrom: true,
		validTo: true,
		doorRight: true,
		accessPlan: true,
		rawPayload: true,
		...(options.includeVendorMetadata ? { vendorMetadata: true } : {}),
		lastSyncedAt: true,
		createdAt: true,
		updatedAt: true,
		device: {
			select: {
				id: true,
				name: true,
				address: true,
				port: true,
				protocol: true,
			},
		},
		employee: {
			select: {
				id: true,
				employeeId: true,
				deviceEmpId: true,
				person: { select: { personalInfo: true } },
			},
		},
	});

	const decorateDeviceUser = (row: any) => {
		const employee = row?.employee;
		const vendorMetadata =
			row?.vendorMetadata ||
			(row?.rawPayload
				? {
						source: "rawPayload",
						rawVendorPayload: row.rawPayload,
					}
				: null);
		return {
			...row,
			vendorMetadata,
			employee: employee
				? {
						id: employee.id,
						employeeId: employee.employeeId,
						deviceEmpId: employee.deviceEmpId,
						fullName: getEmployeeDisplayName(employee) || employee.employeeId,
					}
				: null,
		};
	};

	const readDeviceUserFaceUrl = (rawPayload: any) => {
		const direct = String(rawPayload?.faceURL || rawPayload?.UserInfo?.faceURL || "").trim();
		return direct || "";
	};
	const hasForbiddenBiometricBlobPlaceholder = (row: any) => {
		const forbidden = new Set([
			"not_exported_plaintext_use_encrypted_bundle_or_sdk_peer_copy",
			"no_plaintext_biometric_templates",
			"encrypted_bundle_available",
			"[redacted-biometric-template]",
		]);
		return [
			row?.fingerprintRawTemplateBlob,
			row?.faceRawTemplateBlob,
			row?.vendorMetadata?.biometricBundle?.fingerprintRawTemplateBlob,
			row?.vendorMetadata?.biometricBundle?.faceRawTemplateBlob,
			row?.rawPayload?._hrisDeviceMetadata?.biometricCsvColumns?.fingerprintRawTemplateBlob,
			row?.rawPayload?._hrisDeviceMetadata?.biometricCsvColumns?.faceRawTemplateBlob,
		].some((value) => forbidden.has(String(value || "").trim()));
	};

	const captureDeviceUserFacePhotoForEncryptedCustody = async (params: {
		req: Request;
		device: any;
		row: any;
		organizationId: string;
		vendorUserId: string;
	}) => {
		const faceUrl = readDeviceUserFaceUrl(params.row.rawPayload);
		if (!faceUrl) throw new Error("No enrolled face photo URL was returned by the device");
		const parsedFaceUrl = new URL(faceUrl);
		if (!getAllowedDeviceHosts(params.device).has(parsedFaceUrl.hostname.toLowerCase())) {
			throw new Error("Device user face photo host does not match the configured device");
		}
		const binary = await hikvisionFetchBinary(
			`${parsedFaceUrl.pathname}${parsedFaceUrl.search}`,
			{
				deviceId: params.device.id,
				prisma,
				request: params.req,
				timeoutMs: 15000,
				headers: { Accept: "image/*,*/*" },
			},
		);
		if (!binary.buffer?.length) throw new Error("Hikvision ISAPI returned an empty face photo");
		return {
			encrypted: null,
			encryptedFingerprint: null,
			encryptedFace: encryptDeviceUserBiometricPayload({
				organizationId: params.organizationId,
				deviceId: params.device.id,
				vendorUserId: params.vendorUserId,
				modality: "face",
				payload: {
					sourceDeviceId: params.device.id,
					sourceDeviceName: params.device.name || params.device.id,
					vendorUserId: params.vendorUserId,
					exportedAt: new Date().toISOString(),
					captureMethod: "hikvision_isapi_face_photo",
					facePictureContentType: binary.contentType || "image/jpeg",
					facePicture: binary.buffer.toString("base64"),
				},
			}),
			fingerprintCount: 0,
			faceTemplateSize: 0,
			facePictureSize: binary.buffer.length,
			cardNo: "",
			captureMethod: "hikvision_isapi_face_photo_fallback",
			events: [],
		};
	};

	const getAllowedDeviceHosts = (device: {
		address?: string | null;
		port?: number | null;
		protocol?: string | null;
		config?: unknown;
	}) => {
		const hosts = new Set<string>();
		const rawAddress = String(device.address || "").trim();
		if (rawAddress) {
			try {
				if (/^https?:\/\//i.test(rawAddress)) {
					hosts.add(new URL(rawAddress).hostname.toLowerCase());
				} else {
					hosts.add(rawAddress.toLowerCase());
				}
			} catch {
				hosts.add(rawAddress.toLowerCase());
			}
		}
		try {
			const runtimeBaseUrl = buildHikvisionDeviceBaseUrl({
				address: String(device.address || ""),
				port: Number(device.port || 0),
				protocol: String(device.protocol || "http"),
				config: device.config,
			});
			if (runtimeBaseUrl) hosts.add(new URL(runtimeBaseUrl).hostname.toLowerCase());
		} catch {
			// Ignore malformed runtime base URL and rely on direct device address validation.
		}
		return hosts;
	};

	const getDeviceUserPhoto = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;
			const userId = String(req.params.userId || "").trim();
			if (!userId) {
				res.status(400).json(buildErrorResponse("Device user is required", 400));
				return;
			}

			const deviceUser = await (prisma as any).deviceUser.findFirst({
				where: {
					id: userId,
					organizationId: admin.organizationId,
				},
				select: {
					id: true,
					vendorUserId: true,
					displayName: true,
					rawPayload: true,
					device: {
						select: {
							id: true,
							name: true,
							address: true,
							port: true,
							protocol: true,
							config: true,
							access: true,
						},
					},
				},
			});

			if (!deviceUser?.device) {
				res.status(404).json(buildErrorResponse("Device user not found", 404));
				return;
			}

			const faceUrl = readDeviceUserFaceUrl(deviceUser.rawPayload);
			if (!faceUrl) {
				res.status(404).json(
					buildErrorResponse("No enrolled face photo found for this device user", 404),
				);
				return;
			}

			const parsedFaceUrl = new URL(faceUrl);
			const allowedHosts = getAllowedDeviceHosts(deviceUser.device);
			if (!allowedHosts.has(parsedFaceUrl.hostname.toLowerCase())) {
				res.status(400).json(
					buildErrorResponse(
						"Device user face photo host does not match the configured device",
						400,
					),
				);
				return;
			}

			const relativePath = `${parsedFaceUrl.pathname}${parsedFaceUrl.search}`;
			const binary = await hikvisionFetchBinary(relativePath, {
				deviceId: deviceUser.device.id,
				prisma,
				request: req,
				timeoutMs: 15000,
				headers: {
					Accept: "image/*,*/*",
				},
			});

			res.setHeader("Content-Type", binary.contentType || "image/jpeg");
			res.setHeader("Content-Length", String(binary.contentLength || binary.buffer.length));
			res.setHeader("Cache-Control", "private, max-age=30");
			res.setHeader(
				"Content-Disposition",
				`inline; filename=\"device-user-${deviceUser.vendorUserId || deviceUser.id}.jpg\"`,
			);
			res.status(200).send(binary.buffer);
		} catch (error: any) {
			const status = Number(error?.status || 500);
			res.status(status).json(
				buildErrorResponse(
					error?.message || "Failed to load device user face photo",
					status,
				),
			);
		}
	};

	/**
	 * Pull raw ISAPI fingerData for one plain device person and store on DeviceUser
	 * (vendorMetadata.rawFingerprints). Operator Device User details modal expects this.
	 */
	const captureDeviceUserRawFingerprints = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			// Same org resolution as listDeviceUsers — middleware sets req.organizationId.
			const organizationId = String(
				(req as any).organizationId || (req as any).user?.organizationId || "",
			).trim();
			const deviceId = String(
				req.params.id ||
					req.params.deviceId ||
					req.body?.deviceId ||
					req.query?.deviceId ||
					"",
			).trim();
			const vendorUserId = String(
				req.params.vendorUserId ||
					req.body?.vendorUserId ||
					req.body?.employeeNo ||
					req.query?.vendorUserId ||
					"",
			).trim();
			if (!organizationId || !deviceId || !vendorUserId) {
				res.status(400).json(
					buildErrorResponse(
						`deviceId and vendorUserId (plain person id) required (org=${Boolean(organizationId)} device=${Boolean(deviceId)} person=${Boolean(vendorUserId)})`,
						400,
					),
				);
				return;
			}
			if (!/^\d+$/.test(vendorUserId) && vendorUserId.length > 32) {
				// Allow non-numeric plain ids; reject obvious opaque tokens.
				const { isOpaqueHikvisionPersonToken } =
					await import("../../helper/hikvision-event-contract.helper.js");
				if (isOpaqueHikvisionPersonToken(vendorUserId)) {
					res.status(400).json(
						buildErrorResponse(
							"vendorUserId must be plain person id, not opaque token",
							400,
						),
					);
					return;
				}
			}
			const device = await prisma.device.findFirst({
				where: { id: deviceId, organizationId },
				select: { id: true },
			});
			if (!device) {
				res.status(404).json(buildErrorResponse("Device not found", 404));
				return;
			}
			const existing = await (prisma as any).deviceUser.findFirst({
				where: {
					organizationId,
					deviceId,
					OR: [{ vendorUserId }, { employeeNo: vendorUserId }],
				},
				select: { id: true },
			});
			const { captureRawFingerprintsForEnrollment } =
				await import("../../helper/device-user-raw-fingerprint.helper.js");
			const result = await captureRawFingerprintsForEnrollment({
				prisma,
				req,
				organizationId,
				deviceId,
				employeeNo: vendorUserId,
				deviceUserId: existing?.id || null,
			});
			if (!result.ok) {
				const reason = result.reason || "Raw fingerprint capture failed";
				const response: any = buildErrorResponse(reason, 422, [
					{ field: "capture.reason", message: reason },
				]);
				response.data = {
					capture: result,
					deviceUser: existing
						? {
								id: existing.id,
								deviceId,
								vendorUserId,
								employeeNo: vendorUserId,
							}
						: null,
				};
				res.status(422).json(response);
				return;
			}
			const row = await (prisma as any).deviceUser.findFirst({
				where: {
					organizationId,
					deviceId,
					OR: [{ vendorUserId }, { employeeNo: vendorUserId }],
				},
				select: buildDeviceUserSelect({ includeVendorMetadata: true }),
			});
			res.status(200).json(
				buildSuccessResponse(
					"Raw fingerprints captured on DeviceUser",
					{
						capture: result,
						deviceUser: row ? decorateDeviceUser(row) : null,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to capture raw fingerprints", 500),
			);
		}
	};

	const captureDeviceUserRawFace = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = String(
				(req as any).organizationId || (req as any).user?.organizationId || "",
			).trim();
			const deviceId = String(
				req.params.id ||
					req.params.deviceId ||
					req.body?.deviceId ||
					req.query?.deviceId ||
					"",
			).trim();
			const vendorUserId = String(
				req.params.vendorUserId ||
					req.body?.vendorUserId ||
					req.body?.employeeNo ||
					req.query?.vendorUserId ||
					"",
			).trim();
			if (!organizationId || !deviceId || !vendorUserId) {
				res.status(400).json(
					buildErrorResponse(
						`deviceId and vendorUserId (plain person id) required (org=${Boolean(organizationId)} device=${Boolean(deviceId)} person=${Boolean(vendorUserId)})`,
						400,
					),
				);
				return;
			}
			if (!/^\d+$/.test(vendorUserId) && vendorUserId.length > 32) {
				const { isOpaqueHikvisionPersonToken } =
					await import("../../helper/hikvision-event-contract.helper.js");
				if (isOpaqueHikvisionPersonToken(vendorUserId)) {
					res.status(400).json(
						buildErrorResponse(
							"vendorUserId must be plain person id, not opaque token",
							400,
						),
					);
					return;
				}
			}
			const device = await prisma.device.findFirst({
				where: { id: deviceId, organizationId },
				select: { id: true },
			});
			if (!device) {
				res.status(404).json(buildErrorResponse("Device not found", 404));
				return;
			}
			const existing = await (prisma as any).deviceUser.findFirst({
				where: {
					organizationId,
					deviceId,
					OR: [{ vendorUserId }, { employeeNo: vendorUserId }],
				},
				select: { id: true },
			});
			const { captureRawFaceForEnrollment } =
				await import("../../helper/device-user-raw-fingerprint.helper.js");
			const result = await captureRawFaceForEnrollment({
				prisma,
				req,
				organizationId,
				deviceId,
				employeeNo: vendorUserId,
				deviceUserId: existing?.id || null,
			});
			if (!result.ok) {
				const reason = result.reason || "Raw face capture failed";
				const response: any = buildErrorResponse(reason, 422, [
					{ field: "capture.reason", message: reason },
				]);
				response.data = {
					capture: result,
					deviceUser: existing
						? {
								id: existing.id,
								deviceId,
								vendorUserId,
								employeeNo: vendorUserId,
							}
						: null,
				};
				res.status(422).json(response);
				return;
			}
			const row = await (prisma as any).deviceUser.findFirst({
				where: {
					organizationId,
					deviceId,
					OR: [{ vendorUserId }, { employeeNo: vendorUserId }],
				},
				select: buildDeviceUserSelect({ includeVendorMetadata: true }),
			});
			res.status(200).json(
				buildSuccessResponse(
					"Raw face captured on DeviceUser",
					{
						capture: result,
						deviceUser: row ? decorateDeviceUser(row) : null,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to capture raw face", 500),
			);
		}
	};

	const listDeviceUsers = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = String((req as any).organizationId || "").trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}
			const deviceId = String(req.params.id || req.query.deviceId || "").trim();
			const employeeId = String(req.query.employeeId || "").trim();
			if (!deviceId && !employeeId) {
				res.status(400).json(buildErrorResponse("Device or employee is required", 400));
				return;
			}
			const status = String(req.query.status || "all").trim();
			const query = String(req.query.query || req.query.search || "").trim();
			const vendorUserId = String(req.query.vendorUserId || "").trim();
			const vendorUserIds = Array.from(
				new Set(
					[]
						.concat(req.query.vendorUserIds as any)
						.flatMap((value) => String(value || "").split(","))
						.map((value) => value.trim())
						.filter(Boolean),
				),
			).slice(0, 1000);
			const page = Math.max(Number(req.query.page || 1), 1);
			const maxLimit = vendorUserIds.length > 0 ? 1000 : 100;
			const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), maxLimit);
			const where: any = {
				organizationId,
				...(deviceId ? { deviceId } : {}),
				...(employeeId ? { employeeId } : {}),
				...(status && status !== "all" ? { status } : {}),
				...(vendorUserId
					? { vendorUserId }
					: vendorUserIds.length
						? { vendorUserId: { in: vendorUserIds } }
						: {}),
				...(query
					? {
							OR: [
								{ vendorUserId: { contains: query, mode: "insensitive" } },
								{ employeeNo: { contains: query, mode: "insensitive" } },
								{ displayName: { contains: query, mode: "insensitive" } },
								{
									employee: {
										employeeId: { contains: query, mode: "insensitive" },
									},
								},
								{
									employee: {
										deviceEmpId: { contains: query, mode: "insensitive" },
									},
								},
							],
						}
					: {}),
			};

			if (!(await hasDeviceUserTable())) {
				res.status(200).json(
					buildSuccessResponse(
						"Device users retrieved",
						{
							deviceUsers: [],
							summary: {
								total: 0,
								active: 0,
								matched: 0,
								unmatched: 0,
								conflict: 0,
								disabled: 0,
							},
							pagination: buildPagination(0, page, limit),
							migrationState: "device_users_table_missing",
						},
						200,
					),
				);
				return;
			}

			const includeVendorMetadata = await hasDeviceUserVendorMetadataColumn();
			const [rows, totalGroups, allRows] = await Promise.all([
				(prisma as any).deviceUser.findMany({
					where,
					select: buildDeviceUserSelect({ includeVendorMetadata }),
					orderBy: [{ status: "asc" }, { vendorUserId: "asc" }],
					skip: (page - 1) * limit,
					take: limit,
				}),
				(prisma as any).deviceUser.groupBy({
					by: ["vendorUserId"],
					where,
					_count: { _all: true },
				}),
				(prisma as any).deviceUser.findMany({
					where: {
						organizationId,
						...(deviceId ? { deviceId } : {}),
						...(employeeId ? { employeeId } : {}),
					},
					select: { status: true, employeeId: true },
				}),
			]);

			res.status(200).json(
				buildSuccessResponse(
					"Device users retrieved",
					{
						deviceUsers: rows.map(decorateDeviceUser),
						summary: {
							...summarizeDeviceUserStatuses(allRows),
							total: Array.isArray(totalGroups) ? totalGroups.length : 0,
						},
						pagination: buildPagination(
							Array.isArray(totalGroups) ? totalGroups.length : 0,
							page,
							limit,
						),
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to retrieve device users", 500),
			);
		}
	};

	const buildReleasedDeviceAddress = (device: { id: string; address?: string | null }) => {
		const address = String(device.address || "unknown").trim() || "unknown";
		const prefix = `deleted:${device.id}:`;
		return address.startsWith(prefix) ? address : `${prefix}${address}`;
	};

	const isDeviceAddressPortUniqueError = (error: unknown) => {
		const record = error as { code?: string; meta?: { target?: unknown } };
		const target = Array.isArray(record?.meta?.target)
			? record.meta.target.map((item) => String(item))
			: [];
		return (
			record?.code === "P2002" &&
			target.includes("organizationId") &&
			target.includes("address") &&
			target.includes("port")
		);
	};

	const buildDeviceAddressPortConflictResponse = () =>
		buildErrorResponse(DEVICE_ADDRESS_PORT_CONFLICT_MESSAGE, 409, [
			{
				field: "address",
				message:
					"Choose a different address or restore the deleted device that already used this endpoint.",
			},
			{
				field: "port",
				message:
					"Choose a different port or restore the deleted device that already used this endpoint.",
			},
		]);

	const isMissingDeviceSyncRunTableError = (error: unknown) => {
		const record = error as {
			code?: string;
			message?: string;
			meta?: { table?: string; modelName?: string };
		};
		const message = String(record?.message || "").toLowerCase();
		return (
			record?.code === "P2021" ||
			record?.meta?.table === "public.device_sync_runs" ||
			record?.meta?.modelName === "DeviceSyncRun" ||
			(message.includes("device_sync_runs") && message.includes("does not exist"))
		);
	};

	const isMissingDeviceUserTableError = (error: unknown) => {
		const record = error as {
			code?: string;
			message?: string;
			meta?: { table?: string; modelName?: string };
		};
		const message = String(record?.message || "").toLowerCase();
		return (
			record?.code === "P2021" ||
			record?.code === "42P01" ||
			record?.meta?.table === "public.device_users" ||
			record?.meta?.modelName === "DeviceUser" ||
			(message.includes("device_users") && message.includes("does not exist")) ||
			(message.includes('relation "device_users"') && message.includes("does not exist"))
		);
	};

	const hasDeviceUserTable = async () => {
		try {
			const rows =
				(await prisma.$queryRaw<
					Array<{ device_users?: string | null }>
				>`SELECT to_regclass('public.device_users')::text AS device_users`) || [];
			return Boolean(rows[0]?.device_users);
		} catch (error) {
			if (isMissingDeviceUserTableError(error)) {
				return false;
			}
			throw error;
		}
	};

	const hasDeviceUserVendorMetadataColumn = async () => {
		if (!(await hasDeviceUserTable())) return false;
		const rows =
			(await prisma.$queryRaw<Array<{ vendorMetadata?: boolean | null }>>`
			SELECT EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
					AND table_name = 'device_users'
					AND column_name = 'vendorMetadata'
			) AS "vendorMetadata"
		`) || [];
		return Boolean(rows[0]?.vendorMetadata);
	};

	const getDeviceEventColumnPresence = async () => {
		const rows =
			(await prisma.$queryRaw<
				Array<{
					deviceUserId?: boolean | null;
					eventCategory?: boolean | null;
					eventAction?: boolean | null;
					eventLabel?: boolean | null;
					eventConfidence?: boolean | null;
				}>
			>`
			SELECT
				EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_schema = 'public'
						AND table_name = 'device_events'
						AND column_name = 'deviceUserId'
				) AS "deviceUserId",
				EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_schema = 'public'
						AND table_name = 'device_events'
						AND column_name = 'eventCategory'
				) AS "eventCategory",
				EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_schema = 'public'
						AND table_name = 'device_events'
						AND column_name = 'eventAction'
				) AS "eventAction",
				EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_schema = 'public'
						AND table_name = 'device_events'
						AND column_name = 'eventLabel'
				) AS "eventLabel",
				EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_schema = 'public'
						AND table_name = 'device_events'
						AND column_name = 'eventConfidence'
				) AS "eventConfidence"
		`) || [];
		return {
			deviceUserId: rows[0]?.deviceUserId === true,
			eventCategory: rows[0]?.eventCategory === true,
			eventAction: rows[0]?.eventAction === true,
			eventLabel: rows[0]?.eventLabel === true,
			eventConfidence: rows[0]?.eventConfidence === true,
		};
	};

	const findLatestCompletedDeviceLogRun = async (
		organizationId: string,
		deviceId: string,
		source: "HIKVISION_CALLBACK" | "ZKTECO_EVENT",
	) => {
		try {
			return await (prisma as any).deviceSyncRun?.findFirst?.({
				where: {
					organizationId,
					deviceId,
					runType: "DEVICE_LOGS",
					status: "COMPLETED",
					source,
				},
				orderBy: { completedAt: "desc" },
			});
		} catch (error) {
			if (isMissingDeviceSyncRunTableError(error)) {
				deviceLogger.warn(
					`Device sync run history table is missing; continuing preview without known skipped counts for device ${deviceId}`,
				);
				return null;
			}
			throw error;
		}
	};

	const getDeviceSyncRuns = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = String((req as any).organizationId || "").trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}
			const deviceId = String(req.params.id || "").trim();
			if (!deviceId) {
				res.status(400).json(buildErrorResponse("Device is required", 400));
				return;
			}
			const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);
			const rows = await (prisma as any).deviceSyncRun.findMany({
				where: { organizationId, deviceId },
				orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
				take: limit,
				select: {
					id: true,
					organizationId: true,
					deviceId: true,
					runType: true,
					status: true,
					source: true,
					totalSourceRecords: true,
					importableRecords: true,
					savedRecords: true,
					skippedRecords: true,
					failedRecords: true,
					missingRecords: true,
					skipSummary: true,
					failureSummary: true,
					rawSummary: true,
					startedAt: true,
					completedAt: true,
					createdAt: true,
					updatedAt: true,
				},
			});
			res.status(200).json(
				buildSuccessResponse("Device sync runs retrieved", { syncRuns: rows }, 200),
			);
		} catch (error: any) {
			if (isMissingDeviceSyncRunTableError(error)) {
				deviceLogger.warn(
					"Device sync run history table is missing; returning an empty sync run list",
				);
				res.status(200).json(
					buildSuccessResponse("Device sync runs retrieved", { syncRuns: [] }, 200),
				);
				return;
			}
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to retrieve device sync runs", 500),
			);
		}
	};

	const normalizeDeviceActivityStatus = (
		run?: { status?: string | null; runType?: string | null } | null,
	) => {
		const status = String(run?.status || "").toUpperCase();
		const runType = String(run?.runType || "").toUpperCase();
		if (status === "PROCESSING") {
			if (runType === "DEVICE_USERS") return "reconciling";
			if (runType === "DEVICE_LOGS") return "importing";
			return "running";
		}
		if (status === "FAILED") return "failed";
		if (status === "COMPLETED") return "completed";
		return "idle";
	};

	const getActiveDeviceUserSyncJobForDevice = (organizationId: string, deviceId: string) => {
		cleanupDeviceUserSyncJobs();
		for (const job of deviceUserSyncJobs.values()) {
			if (job.organizationId !== organizationId || job.status !== "processing") continue;
			const result = job.results.find((item) => item.deviceId === deviceId);
			const isPendingDevice =
				!result &&
				job.processedDevices < job.totalDevices &&
				(job.syncMode === "full_refresh" ||
					job.syncMode === "needs_attention_only" ||
					job.syncMode === "peer_converge" ||
					job.syncMode === "biometrics_only");
			if (result || isPendingDevice) {
				return {
					jobId: job.jobId,
					status: job.status,
					syncMode: job.syncMode,
					totalDevices: job.totalDevices,
					processedDevices: job.processedDevices,
					successfulDevices: job.successfulDevices,
					failedDevices: job.failedDevices,
					message: job.message,
					result: result || null,
					startedAt: job.startedAt,
					completedAt: job.completedAt || null,
				};
			}
		}
		return null;
	};

	const getDeviceActivity = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;
			const organizationId = String((req as any).organizationId || "").trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}
			const deviceId = String(req.params.id || "").trim();
			if (!deviceId) {
				res.status(400).json(buildErrorResponse("Device is required", 400));
				return;
			}

			const statusFilter = String(req.query.status || "all").trim();
			const sourceFilter = String(req.query.source || "all").trim();
			const runId = String(req.query.runId || "").trim();
			const search = String(req.query.search || req.query.query || "").trim();
			const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);

			const device = await prisma.device.findFirst({
				where: { id: deviceId, organizationId, isDeleted: false },
				select: {
					id: true,
					organizationId: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
					access: true,
				},
			});
			if (!device) {
				res.status(404).json(buildErrorResponse("Device not found", 404));
				return;
			}

			const [syncRuns, hasDeviceEventColumns, hasDeviceUsersTable] = await Promise.all([
				(prisma as any).deviceSyncRun
					.findMany({
						where: { organizationId, deviceId },
						orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
						take: 12,
						select: {
							id: true,
							deviceId: true,
							runType: true,
							status: true,
							source: true,
							totalSourceRecords: true,
							importableRecords: true,
							savedRecords: true,
							skippedRecords: true,
							failedRecords: true,
							missingRecords: true,
							skipSummary: true,
							failureSummary: true,
							rawSummary: true,
							startedAt: true,
							completedAt: true,
							createdAt: true,
							updatedAt: true,
						},
					})
					.catch((error: unknown) => {
						if (isMissingDeviceSyncRunTableError(error)) return [];
						throw error;
					}),
				getDeviceEventColumnPresence(),
				hasDeviceUserTable(),
			]);

			const activeRun =
				syncRuns.find(
					(run: any) => String(run.status || "").toUpperCase() === "PROCESSING",
				) || null;
			const lastRun = syncRuns[0] || null;
			const activeJob = getActiveDeviceUserSyncJobForDevice(organizationId, deviceId);
			const currentStatus = activeJob
				? "reconciling"
				: normalizeDeviceActivityStatus(activeRun || lastRun);

			const whereConditions: Prisma.Sql[] = [
				Prisma.sql`de."organizationId" = ${organizationId}`,
				Prisma.sql`de."deviceId" = ${deviceId}`,
			];
			if (statusFilter && statusFilter !== "all" && DEVICE_EVENT_STATUSES.has(statusFilter)) {
				whereConditions.push(
					Prisma.sql`de."status" = ${statusFilter}::"DeviceEventStatus"`,
				);
			}
			if (sourceFilter && sourceFilter !== "all" && DEVICE_EVENT_SOURCES.has(sourceFilter)) {
				whereConditions.push(
					Prisma.sql`de."source" = ${sourceFilter}::"DeviceEventSource"`,
				);
			}
			if (search) {
				const searchLike = `%${search}%`;
				whereConditions.push(Prisma.sql`(
					de."employeeNo" ILIKE ${searchLike}
					OR de."eventType" ILIKE ${searchLike}
					OR de."errorMessage" ILIKE ${searchLike}
					OR de."dedupeKey" ILIKE ${searchLike}
					OR CAST(de.payload AS text) ILIKE ${searchLike}
					${
						hasDeviceEventColumns.eventLabel
							? Prisma.sql`OR de."eventLabel" ILIKE ${searchLike}`
							: Prisma.sql``
					}
				)`);
			}
			void runId;

			const deviceUserIdSql = hasDeviceEventColumns.deviceUserId
				? Prisma.sql`de."deviceUserId"`
				: Prisma.sql`NULL::text`;
			const eventActionSql = hasDeviceEventColumns.eventAction
				? Prisma.sql`de."eventAction"::text`
				: Prisma.sql`'UNKNOWN'::text`;
			const eventLabelSql = hasDeviceEventColumns.eventLabel
				? Prisma.sql`de."eventLabel"`
				: Prisma.sql`COALESCE(de."eventType", 'Device event')`;
			const deviceUserJoinSql =
				hasDeviceUsersTable && hasDeviceEventColumns.deviceUserId
					? Prisma.sql`LEFT JOIN device_users du ON du.id = ${deviceUserIdSql}`
					: Prisma.sql`
					LEFT JOIN LATERAL (
						SELECT NULL::text AS id, NULL::text AS "vendorUserId", NULL::text AS "displayName", NULL::text AS "employeeId"
					) du ON true
				`;
			const whereSql = Prisma.sql`WHERE ${Prisma.join(whereConditions, " AND ")}`;
			const eventRows = await prisma.$queryRaw<any[]>(Prisma.sql`
				SELECT
					de.id,
					de."receivedAt",
					de."eventTime",
					de.source::text AS source,
					de.status::text AS status,
					${
						hasDeviceEventColumns.eventCategory
							? Prisma.sql`de."eventCategory"::text`
							: Prisma.sql`'UNKNOWN_VENDOR'::text`
					} AS "eventCategory",
					${eventActionSql} AS "eventAction",
					${eventLabelSql} AS "eventLabel",
					de."employeeNo",
					de."eventType",
					de."dedupeKey",
					de.payload,
					de."errorMessage",
					CASE
						WHEN du.id IS NULL THEN NULL
						ELSE JSON_BUILD_OBJECT(
							'id', du.id,
							'vendorUserId', du."vendorUserId",
							'displayName', du."displayName",
							'employeeId', du."employeeId"
						)
					END AS "deviceUser"
				FROM device_events de
				${deviceUserJoinSql}
				${whereSql}
				ORDER BY de."receivedAt" DESC, de."createdAt" DESC
				LIMIT ${limit}
			`);

			const deviceUserWhere: any = { organizationId, deviceId };
			const [deviceUserCounts, savedCounts] = await Promise.all([
				hasDeviceUsersTable
					? (prisma as any).deviceUser
							.groupBy({
								by: ["status"],
								where: deviceUserWhere,
								_count: { _all: true },
							})
							.catch((error: unknown) => {
								if (isMissingDeviceUserTableError(error)) return [];
								throw error;
							})
					: [],
				prisma.deviceEvent
					.groupBy({
						by: ["status"],
						where: { organizationId, deviceId } as any,
						_count: { _all: true },
					})
					.catch(() => []),
			]);
			const deviceUserCountMap = new Map(
				(deviceUserCounts || []).map((row: any) => [
					String(row.status || ""),
					Number(row._count?._all || 0),
				]),
			);
			const savedEventCountMap = new Map(
				(savedCounts || []).map((row: any) => [
					String(row.status || ""),
					Number(row._count?._all || 0),
				]),
			);

			const activeCounts = activeRun || lastRun || {};
			const counts = {
				sdkReceived: Number(activeCounts.totalSourceRecords || 0),
				parsed: Number(activeCounts.importableRecords || 0),
				savedInHris:
					Number(activeCounts.savedRecords || 0) ||
					Number(savedEventCountMap.get("ATTENDANCE_CREATED") || 0) +
						Number(savedEventCountMap.get("MATCHED") || 0),
				skipped: Number(activeCounts.skippedRecords || 0),
				failed:
					Number(activeCounts.failedRecords || 0) ||
					Number(savedEventCountMap.get("FAILED") || 0),
				needsLink: Number(deviceUserCountMap.get("UNMATCHED") || 0),
				gap: Number(activeCounts.missingRecords || 0),
			};

			const readActivityRowValue = (event: any, key: string) =>
				event?.[key] ?? event?.[key.toLowerCase()] ?? null;

			const events = eventRows.map((event) => {
				const payload =
					event.payload && typeof event.payload === "object" ? event.payload : null;
				const deviceUser = event.deviceUser || null;
				const eventCategory = readActivityRowValue(event, "eventCategory");
				const eventAction = readActivityRowValue(event, "eventAction");
				const eventLabel = readActivityRowValue(event, "eventLabel");
				const rawId =
					String(deviceUser?.vendorUserId || event.employeeNo || "").trim() ||
					String(
						payload?.employeeNoString || payload?.employeeNo || payload?.cardNo || "",
					).trim() ||
					null;
				const origin = payload?.derivedFromCurrentDeviceState
					? "device_user_state_backfill"
					: payload?.derivedFromReconcile
						? "biometric_reconcile"
						: event.source === "EN_HCNETSDK_ALARM"
							? "sdk_alarm_callback"
							: event.source === "HIKVISION_CALLBACK"
								? "hikvision_callback"
								: event.source === "ZKTECO_EVENT"
									? "zkteco_bridge"
									: "device_event";
				const originLabel = payload?.derivedFromCurrentDeviceState
					? "Derived from current device-user state"
					: payload?.derivedFromReconcile
						? "Created by biometric reconcile"
						: event.source === "EN_HCNETSDK_ALARM"
							? "Received from SDK alarm listener"
							: event.source === "HIKVISION_CALLBACK"
								? "Received from Hikvision callback"
								: event.source === "ZKTECO_EVENT"
									? "Received from ZKTeco bridge"
									: "Saved device event";
				return {
					id: event.id,
					receivedAt: event.receivedAt,
					deviceEventTime: event.eventTime,
					source: event.source,
					eventCategory,
					eventAction,
					eventLabel,
					rawId,
					employeeMatch: deviceUser?.employeeId
						? {
								employeeId: deviceUser.employeeId,
								label: deviceUser.displayName || rawId,
							}
						: null,
					hrisStatus: event.status,
					action: eventLabel || eventAction || event.eventType || "-",
					origin,
					originLabel,
					originDetail:
						String(
							payload?.backfillReason ||
								payload?.eventKind ||
								payload?.actionCode ||
								"",
						).trim() || null,
					message: event.errorMessage || null,
					runId: runId || null,
					correlationId: event.dedupeKey,
					payload,
				};
			});

			res.status(200).json(
				buildSuccessResponse(
					"Device activity retrieved",
					{
						generatedAt: new Date().toISOString(),
						device,
						status: currentStatus,
						activeRun,
						activeJob,
						lastRun,
						counts,
						filters: {
							status: statusFilter || "all",
							source: sourceFilter || "all",
							runId: runId || null,
							search,
							limit,
						},
						events,
						rawSdkPersistence: {
							persisted: false,
							message:
								"Raw SDK source reads are not persisted as a separate stream yet; this table uses saved DeviceEvent rows and linked DeviceUser payloads.",
						},
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Device activity failed: ${error?.message || error}`);
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to retrieve device activity", 500),
			);
		}
	};

	const fetchAllHikvisionDeviceUsers = async (req: Request, device: any) => {
		const pageSize = Math.max(
			1,
			Math.min(Number(process.env.HIKVISION_USER_SYNC_PAGE_SIZE || 100), 200),
		);
		const maxUsers = Math.max(
			1,
			Math.min(Number(process.env.HIKVISION_USER_SYNC_MAX_USERS || 2000), 10000),
		);
		const allUsers: any[] = [];
		let position = 0;
		for (let page = 0; page < 100 && allUsers.length < maxUsers; page += 1) {
			const data = await hikvisionFetch(hikvisionEndpoint.accessControl.userInfo.search, {
				method: "POST",
				deviceId: device.id,
				prisma,
				request: req,
				timeoutMs: 15000,
				headers: { "Content-Type": "application/json" },
				body: {
					UserInfoSearchCond: {
						searchID: `device-user-sync-${Date.now()}-${position}`,
						searchResultPosition: position,
						maxResults: Math.min(pageSize, maxUsers - allUsers.length),
					},
				},
			});
			const pageUsers = getUserInfoSearchList(data);
			const search = data?.UserInfoSearch || data?.data?.UserInfoSearch || {};
			allUsers.push(...pageUsers);
			const numOfMatches = Number(search.numOfMatches || pageUsers.length || 0);
			const status = String(search.responseStatusStrg || "").toUpperCase();
			if (!pageUsers.length || status !== "MORE" || numOfMatches <= 0) break;
			position += numOfMatches;
		}
		return Array.from(
			new Map(
				allUsers.map((user) => [
					String(user?.employeeNo || user?.employeeNoString || user?.userId),
					user,
				]),
			).values(),
		);
	};

	const loadHikvisionDeviceUserSnapshot = async (req: Request, device: any) => {
		const rawUsers = await fetchAllHikvisionDeviceUsers(req, device);
		const candidates = rawUsers
			.map(normalizeHikvisionDeviceUser)
			.filter((candidate): candidate is DeviceUserCandidate => Boolean(candidate));
		return { rawUsers, candidates };
	};

	const loadSingleHikvisionDeviceUserSnapshot = async (
		req: Request,
		device: any,
		employeeNo: string,
	) => {
		const data = await hikvisionFetch(hikvisionEndpoint.accessControl.userInfo.search, {
			method: "POST",
			deviceId: device.id,
			prisma,
			request: req,
			timeoutMs: 8000,
			headers: { "Content-Type": "application/json" },
			body: {
				UserInfoSearchCond: {
					searchID: `device-user-single-${Date.now()}`,
					searchResultPosition: 0,
					maxResults: 4,
					EmployeeNoList: [{ employeeNo }],
				},
			},
		});
		const rawUsers = getUserInfoSearchList(data).filter(
			(user) =>
				String(user?.employeeNo || user?.employeeNoString || "").trim() === employeeNo,
		);
		const candidates = rawUsers
			.map(normalizeHikvisionDeviceUser)
			.filter((candidate): candidate is DeviceUserCandidate => Boolean(candidate));
		return { rawUsers, candidates };
	};

	const upsertDeviceUsersFromCandidates = async (params: {
		organizationId: string;
		deviceId: string;
		candidates: DeviceUserCandidate[];
		source: "hikvision" | "legacy-backfill";
		pruneMissing?: boolean;
	}) => {
		const { organizationId, deviceId, candidates } = params;
		const employees = await loadEmployeesForDeviceUserCandidates(organizationId, candidates);
		const now = new Date();
		let created = 0;
		let updated = 0;
		let linked = 0;
		let unmatched = 0;
		let conflict = 0;
		let disabled = 0;
		let pruned = 0;
		const canPersistVendorMetadata = await hasDeviceUserVendorMetadataColumn();
		const currentVendorUserIds = new Set(
			candidates
				.map((candidate) => String(candidate.vendorUserId || "").trim())
				.filter(Boolean),
		);

		for (const candidate of candidates) {
			const existing = await (prisma as any).deviceUser.findUnique({
				where: {
					organizationId_deviceId_vendorUserId: {
						organizationId,
						deviceId,
						vendorUserId: candidate.vendorUserId,
					},
				},
				select: {
					id: true,
					employeeId: true,
					status: true,
					rawPayload: true,
					...(canPersistVendorMetadata ? { vendorMetadata: true } : {}),
				},
			});
			const decision = resolveDeviceUserLinkDecision(candidate, employees);
			const preserveManualEmployee =
				existing?.employeeId &&
				decision.status !== "CONFLICT" &&
				decision.status !== "DISABLED" &&
				(!decision.employeeId || decision.employeeId === existing.employeeId);
			const employeeId = preserveManualEmployee ? existing.employeeId : decision.employeeId;
			const status = preserveManualEmployee ? "ACTIVE" : decision.status;
			if (status === "ACTIVE" && employeeId) linked += 1;
			else if (status === "CONFLICT") conflict += 1;
			else if (status === "DISABLED") disabled += 1;
			else unmatched += 1;

			const existingRawPayload =
				existing?.rawPayload && typeof existing.rawPayload === "object"
					? existing.rawPayload
					: {};
			const candidateRawPayload =
				candidate.rawPayload && typeof candidate.rawPayload === "object"
					? (candidate.rawPayload as any)
					: {};
			const existingRawMetadata = existingRawPayload._hrisDeviceMetadata || {};
			const candidateRawMetadata = candidateRawPayload._hrisDeviceMetadata || {};
			const data: any = {
				employeeId,
				employeeNo: candidate.employeeNo,
				displayName: candidate.displayName,
				userType: candidate.userType,
				status,
				validFrom: candidate.validFrom,
				validTo: candidate.validTo,
				doorRight: candidate.doorRight,
				accessPlan: candidate.accessPlan as any,
				rawPayload: {
					...existingRawPayload,
					...candidateRawPayload,
					_hrisDeviceMetadata: {
						...existingRawMetadata,
						...candidateRawMetadata,
						biometricExport: {
							...(existingRawMetadata.biometricExport || {}),
							...(candidateRawMetadata.biometricExport || {}),
						},
						biometricCsvColumns: {
							...(existingRawMetadata.biometricCsvColumns || {}),
							...(candidateRawMetadata.biometricCsvColumns || {}),
						},
					},
					hrisSync: {
						source: params.source,
						matchReason: preserveManualEmployee
							? "manual_existing"
							: decision.matchReason,
						matchCount: decision.matchCount,
					},
				},
				lastSyncedAt: now,
			};
			if (canPersistVendorMetadata) {
				const existingVendorMetadata =
					existing?.vendorMetadata && typeof existing.vendorMetadata === "object"
						? existing.vendorMetadata
						: {};
				const candidateVendorMetadata = (candidate.vendorMetadata as any) || {};
				data.vendorMetadata = {
					...existingVendorMetadata,
					...candidateVendorMetadata,
					biometricBundle: {
						...(existingVendorMetadata.biometricBundle || {}),
						...(candidateVendorMetadata.biometricBundle || {}),
					},
					hrisSync: {
						source: params.source,
						matchReason: preserveManualEmployee
							? "manual_existing"
							: decision.matchReason,
						matchCount: decision.matchCount,
						lastSyncedAt: now.toISOString(),
					},
				};
			}
			if (existing?.id) {
				await (prisma as any).deviceUser.update({ where: { id: existing.id }, data });
				updated += 1;
			} else {
				await (prisma as any).deviceUser.create({
					data: {
						organizationId,
						deviceId,
						vendorUserId: candidate.vendorUserId,
						...data,
					},
				});
				created += 1;
			}
		}
		// A live device read is not proof that an HRIS/physical user was deleted.
		// Preserve stale and one-device-only identities for explicit admin review.
		void currentVendorUserIds;
		void params.pruneMissing;
		return { created, updated, linked, unmatched, conflict, disabled, pruned };
	};

	const backfillDeviceUsersFromLegacyEmployees = async (params: {
		organizationId: string;
		deviceId: string;
	}) => {
		const legacyEmployees = await prisma.employee.findMany({
			where: {
				organizationId: params.organizationId,
				isDeleted: false,
				deviceEmpId: { not: null },
			},
			select: {
				id: true,
				employeeId: true,
				deviceEmpId: true,
				person: { select: { personalInfo: true } },
			},
		});
		const candidates = legacyEmployees.reduce<DeviceUserCandidate[]>((items, employee) => {
			const vendorUserId = String(employee.deviceEmpId || "").trim();
			if (!vendorUserId) return items;
			items.push({
				vendorUserId,
				employeeNo: vendorUserId,
				displayName: getEmployeeDisplayName(employee) || employee.employeeId,
				userType: "legacy",
				status: "UNMATCHED" as const,
				validFrom: null,
				validTo: null,
				doorRight: null,
				accessPlan: null,
				rawPayload: {
					source: "Employee.deviceEmpId",
					employeeId: employee.employeeId,
					employeeDbId: employee.id,
				},
				vendorMetadata: {
					vendor: "legacy",
					source: "Employee.deviceEmpId",
					vendorUserId,
					employeeId: employee.employeeId,
					employeeDbId: employee.id,
				},
			});
			return items;
		}, []);
		const result = await upsertDeviceUsersFromCandidates({
			organizationId: params.organizationId,
			deviceId: params.deviceId,
			candidates,
			source: "legacy-backfill",
		});
		return { total: candidates.length, ...result };
	};

	const syncHikvisionDeviceUsersFromSource = async (params: {
		req: Request;
		organizationId: string;
		device: any;
		startedByUserId?: string | null;
	}) => {
		const run = await (prisma as any).deviceSyncRun.create({
			data: {
				organizationId: params.organizationId,
				deviceId: params.device.id,
				runType: "DEVICE_USERS",
				status: "PROCESSING",
				startedByUserId: params.startedByUserId || null,
			},
		});

		try {
			const { rawUsers, candidates } = await loadHikvisionDeviceUserSnapshot(
				params.req,
				params.device,
			);
			const result = await upsertDeviceUsersFromCandidates({
				organizationId: params.organizationId,
				deviceId: params.device.id,
				candidates,
				source: "hikvision",
			});
			const summary = {
				totalSourceRecords: rawUsers.length,
				importableRecords: candidates.length,
				...result,
			};
			const updatedRun = await (prisma as any).deviceSyncRun.update({
				where: { id: run.id },
				data: {
					status: "COMPLETED",
					totalSourceRecords: rawUsers.length,
					importableRecords: candidates.length,
					savedRecords: result.created + result.updated,
					skippedRecords: rawUsers.length - candidates.length,
					failedRecords: 0,
					missingRecords: 0,
					skipSummary: { invalidUserId: rawUsers.length - candidates.length },
					rawSummary: result,
					completedAt: new Date(),
				},
			});
			await persistDeviceRuntimeEvent({
				req: params.req,
				organizationId: params.organizationId,
				deviceId: params.device.id,
				source: "HIKVISION_CALLBACK",
				action: "SYNC_IMPORTED",
				label: "Device users synchronized",
				correlationId: run.id,
				payload: {
					runId: run.id,
					runType: "DEVICE_USERS",
					totalSourceRecords: rawUsers.length,
					importableRecords: candidates.length,
					...result,
				},
			});
			return { run: updatedRun, summary };
		} catch (error: any) {
			await (prisma as any).deviceSyncRun.update({
				where: { id: run.id },
				data: {
					status: "FAILED",
					failedRecords: 1,
					failureSummary: { message: error?.message || "device_user_sync_failed" },
					completedAt: new Date(),
				},
			});
			throw error;
		}
	};

	const syncSingleHikvisionDeviceUserFromSource = async (params: {
		req: Request;
		organizationId: string;
		device: any;
		employeeNo: string;
	}) => {
		const { rawUsers, candidates } = await loadSingleHikvisionDeviceUserSnapshot(
			params.req,
			params.device,
			params.employeeNo,
		);
		const result = candidates.length
			? await upsertDeviceUsersFromCandidates({
					organizationId: params.organizationId,
					deviceId: params.device.id,
					candidates,
					source: "hikvision",
					pruneMissing: false,
				})
			: {
					created: 0,
					updated: 0,
					linked: 0,
					unmatched: 0,
					conflict: 0,
					disabled: 0,
					pruned: 0,
				};
		return {
			summary: {
				totalSourceRecords: rawUsers.length,
				importableRecords: candidates.length,
				...result,
			},
		};
	};

	const deleteHikvisionSourceUser = async (params: {
		req: Request;
		deviceId: string;
		employeeNo: string;
	}) => {
		const primaryBody = {
			UserInfoDetail: {
				mode: "byEmployeeNo",
				EmployeeNoList: [{ employeeNo: params.employeeNo }],
			},
		};
		const fallbackBody = {
			UserInfo: {
				employeeNo: params.employeeNo,
				deleteUser: true,
			},
		};
		const attempts: any[] = [];
		try {
			const response = await hikvisionFetch(
				hikvisionEndpoint.accessControl.userInfoDetail.delete,
				{
					method: "POST",
					deviceId: params.deviceId,
					prisma,
					request: params.req,
					timeoutMs: 15000,
					headers: { "Content-Type": "application/json" },
					body: primaryBody,
				},
			);
			attempts.push({
				endpoint: "POST /ISAPI/AccessControl/UserInfoDetail/Delete?format=json",
				ok: true,
				response,
			});
			return { method: "UserInfoDetail.Delete", attempts };
		} catch (error: any) {
			attempts.push({
				endpoint: "POST /ISAPI/AccessControl/UserInfoDetail/Delete?format=json",
				ok: false,
				status: error?.status || null,
				message: error?.message || String(error),
				data: error?.data || null,
			});
		}

		const response = await hikvisionFetch(hikvisionEndpoint.accessControl.userInfo.setUp, {
			method: "PUT",
			deviceId: params.deviceId,
			prisma,
			request: params.req,
			timeoutMs: 15000,
			headers: { "Content-Type": "application/json" },
			body: fallbackBody,
		});
		attempts.push({
			endpoint: "PUT /ISAPI/AccessControl/UserInfo/SetUp?format=json",
			ok: true,
			response,
		});
		return { method: "UserInfo.SetUp.deleteUser", attempts };
	};

	const performDeviceUserDelete = async (params: {
		req: Request;
		organizationId: string;
		device: any;
		vendorUserId: string;
		execute: boolean;
		confirmation?: string;
		requireExactConfirmation?: boolean;
	}) => {
		const deviceId = String(params.device.id || "").trim();
		const vendorUserId = String(params.vendorUserId || "").trim();
		if (!deviceId || !vendorUserId) {
			throw { status: 400, message: "Device and device user are required" };
		}
		const includeVendorMetadata = await hasDeviceUserVendorMetadataColumn();
		const hrisBefore = await (prisma as any).deviceUser.findUnique({
			where: {
				organizationId_deviceId_vendorUserId: {
					organizationId: params.organizationId,
					deviceId,
					vendorUserId,
				},
			},
			select: buildDeviceUserSelect({ includeVendorMetadata }),
		});
		const sourceBefore = await loadSingleHikvisionDeviceUserSnapshot(
			params.req,
			params.device,
			vendorUserId,
		);
		const sourceBeforeExact = sourceBefore.rawUsers.filter(
			(user) =>
				String(user?.employeeNo || user?.employeeNoString || user?.userId || "").trim() ===
				vendorUserId,
		);

		const before = {
			hrisFound: Boolean(hrisBefore),
			sourceFound: sourceBeforeExact.length > 0,
			sourceMatchCount: sourceBeforeExact.length,
			hrisDeviceUser: hrisBefore ? decorateDeviceUser(hrisBefore) : null,
			sourceUsers: sourceBeforeExact,
		};

		const base = {
			device: {
				id: params.device.id,
				name: params.device.name,
				address: params.device.address,
				protocol: params.device.protocol,
			},
			vendorUserId,
			execute: params.execute,
			before,
			requiresConfirmation: vendorUserId,
		};
		if (!params.execute) return base;

		if (params.requireExactConfirmation !== false && params.confirmation !== vendorUserId) {
			throw { status: 400, message: "Type the exact device user ID to confirm deletion" };
		}
		if (hrisBefore?.employeeId) {
			throw { status: 409, message: "Unlink this device user before deleting it" };
		}
		if (!hrisBefore && sourceBeforeExact.length === 0) {
			throw { status: 404, message: "Device user was not found" };
		}

		let sourceDelete: any = null;
		if (sourceBeforeExact.length > 0) {
			sourceDelete = await deleteHikvisionSourceUser({
				req: params.req,
				deviceId,
				employeeNo: vendorUserId,
			});
		}

		const sourceAfter = await loadSingleHikvisionDeviceUserSnapshot(
			params.req,
			params.device,
			vendorUserId,
		);
		const sourceAfterExact = sourceAfter.rawUsers.filter(
			(user) =>
				String(user?.employeeNo || user?.employeeNoString || user?.userId || "").trim() ===
				vendorUserId,
		);
		if (sourceAfterExact.length > 0) {
			throw {
				status: 502,
				message: "Hikvision user still exists after delete attempt",
				data: {
					before,
					sourceDelete,
					after: {
						sourceFound: true,
						sourceMatchCount: sourceAfterExact.length,
						sourceUsers: sourceAfterExact,
					},
				},
			};
		}

		const hrisDeleteResult = await (prisma as any).deviceUser.deleteMany({
			where: {
				organizationId: params.organizationId,
				deviceId,
				vendorUserId,
				employeeId: null,
			},
		});
		const hrisDelete: any = {
			deleted: hrisDeleteResult.count > 0,
			count: hrisDeleteResult.count,
		};
		const hrisAfter = await (prisma as any).deviceUser.findUnique({
			where: {
				organizationId_deviceId_vendorUserId: {
					organizationId: params.organizationId,
					deviceId,
					vendorUserId,
				},
			},
			select: { id: true },
		});

		return {
			...base,
			sourceDelete,
			hrisDelete,
			after: {
				sourceFound: false,
				sourceMatchCount: 0,
				sourceUsers: [],
				hrisFound: Boolean(hrisAfter),
			},
		};
	};

	const deleteDeviceUser = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const deviceId = String(req.params.id || req.body?.deviceId || "").trim();
			const vendorUserId = String(
				req.params.vendorUserId || req.body?.vendorUserId || "",
			).trim();
			const execute = req.body?.execute === true;
			const confirmation = String(req.body?.confirmation || "").trim();
			if (!(await hasDeviceUserTable())) {
				res.status(409).json(
					buildErrorResponse("Device users table is not available", 409),
				);
				return;
			}
			const device = await getDeviceForUserSync(gate.organizationId, deviceId);
			if (!device) {
				res.status(404).json(buildErrorResponse("Device not found", 404));
				return;
			}
			if (!isHikvisionDevice(device)) {
				res.status(400).json(
					buildErrorResponse(
						"Device user delete is currently supported for Hikvision devices",
						400,
					),
				);
				return;
			}
			const data = await performDeviceUserDelete({
				req,
				organizationId: gate.organizationId,
				device,
				vendorUserId,
				execute,
				confirmation,
			});
			if (execute) {
				try {
					await invalidateCache.byPattern("cache:device:*");
					await invalidateCache.byPattern("cache:devices:*");
				} catch (error) {
					deviceLogger.warn(`Device user delete cache invalidation failed: ${error}`);
				}
				logActivity(req, {
					userId: String((req as any).userId || (req as any).user?.id || "unknown"),
					action: "DELETE_DEVICE_USER",
					description: `Deleted Hikvision device user ${vendorUserId} from ${device.name}`,
					page: { url: req.originalUrl, title: "Device Users" },
				});
			}
			res.status(200).json(
				buildSuccessResponse(
					execute ? "Device user deleted" : "Device user delete preview",
					data,
					200,
				),
			);
		} catch (error: any) {
			const response: any = buildErrorResponse(
				error?.message || "Failed to delete device user",
				error?.status || 500,
			);
			if (error?.data) response.data = error.data;
			res.status(error?.status || 500).json(response);
		}
	};

	const deleteDeviceUsers = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const deviceId = String(req.params.id || req.body?.deviceId || "").trim();
			const execute = req.body?.execute === true;
			const vendorUserIds = Array.from(
				new Set(
					([] as any[])
						.concat(req.body?.vendorUserIds || req.body?.vendorUserId || [])
						.flatMap((value) => String(value || "").split(","))
						.map((value) => value.trim())
						.filter(Boolean),
				),
			).slice(0, 50);
			if (!deviceId || vendorUserIds.length === 0) {
				res.status(400).json(
					buildErrorResponse("Device and selected device users are required", 400),
				);
				return;
			}
			if (!(await hasDeviceUserTable())) {
				res.status(409).json(
					buildErrorResponse("Device users table is not available", 409),
				);
				return;
			}
			const device = await getDeviceForUserSync(gate.organizationId, deviceId);
			if (!device) {
				res.status(404).json(buildErrorResponse("Device not found", 404));
				return;
			}
			if (!isHikvisionDevice(device)) {
				res.status(400).json(
					buildErrorResponse(
						"Device user delete is currently supported for Hikvision devices",
						400,
					),
				);
				return;
			}
			const results = [];
			for (const vendorUserId of vendorUserIds) {
				try {
					const data = await performDeviceUserDelete({
						req,
						organizationId: gate.organizationId,
						device,
						vendorUserId,
						execute,
						confirmation: vendorUserId,
						requireExactConfirmation: false,
					});
					results.push({ vendorUserId, ok: true, data });
				} catch (error: any) {
					results.push({
						vendorUserId,
						ok: false,
						status: error?.status || 500,
						message: error?.message || "Failed to delete device user",
						data: error?.data || null,
					});
				}
			}
			if (execute) {
				try {
					await invalidateCache.byPattern("cache:device:*");
					await invalidateCache.byPattern("cache:devices:*");
				} catch (error) {
					deviceLogger.warn(`Device users delete cache invalidation failed: ${error}`);
				}
				logActivity(req, {
					userId: String((req as any).userId || (req as any).user?.id || "unknown"),
					action: "DELETE_DEVICE_USERS",
					description: `Deleted ${results.filter((result) => result.ok).length} Hikvision device users from ${device.name}`,
					page: { url: req.originalUrl, title: "Device Users" },
				});
			}
			const failed = results.filter((result) => !result.ok).length;
			const okCount = results.filter((result) => result.ok).length;
			res.status(failed && execute ? 207 : 200).json(
				buildSuccessResponse(
					execute ? "Device users delete completed" : "Device users delete preview",
					{
						device: {
							id: device.id,
							name: device.name,
							address: device.address,
							protocol: device.protocol,
						},
						execute,
						requested: vendorUserIds.length,
						previewed: execute ? 0 : okCount,
						deleted: execute ? okCount : 0,
						failed,
						results,
					},
					failed && execute ? 207 : 200,
				),
			);
		} catch (error: any) {
			res.status(error?.status || 500).json(
				buildErrorResponse(
					error?.message || "Failed to delete selected device users",
					error?.status || 500,
				),
			);
		}
	};

	const mirrorDeviceUserLinkToPeer = async (params: {
		organizationId: string;
		sourceDeviceId: string;
		targetDeviceId: string;
		vendorUserId: string;
	}) => {
		const sourceDeviceUser = await (prisma as any).deviceUser.findUnique({
			where: {
				organizationId_deviceId_vendorUserId: {
					organizationId: params.organizationId,
					deviceId: params.sourceDeviceId,
					vendorUserId: params.vendorUserId,
				},
			},
			select: {
				employeeId: true,
				status: true,
			},
		});
		if (!sourceDeviceUser?.employeeId) return null;

		const targetDeviceUser = await (prisma as any).deviceUser.findUnique({
			where: {
				organizationId_deviceId_vendorUserId: {
					organizationId: params.organizationId,
					deviceId: params.targetDeviceId,
					vendorUserId: params.vendorUserId,
				},
			},
			select: {
				id: true,
				employeeId: true,
				status: true,
			},
		});
		if (!targetDeviceUser?.id) return null;
		if (
			targetDeviceUser.employeeId === sourceDeviceUser.employeeId &&
			targetDeviceUser.status === sourceDeviceUser.status
		) {
			return targetDeviceUser;
		}

		return await (prisma as any).deviceUser.update({
			where: { id: targetDeviceUser.id },
			data: {
				employeeId: sourceDeviceUser.employeeId,
				status: sourceDeviceUser.status,
			},
			select: {
				id: true,
				employeeId: true,
				status: true,
			},
		});
	};

	const createBiometricLifecycleSyncRun = async (params: {
		organizationId: string;
		deviceId: string;
		startedByUserId?: string | null;
		source?: string | null;
		eventKind: string;
		minor: string;
		employeeNo?: string | null;
		cardNo?: string | null;
		sourceWideRefresh: boolean;
		targetDeviceCount: number;
	}) => {
		try {
			return await (prisma as any).deviceSyncRun.create({
				data: {
					organizationId: params.organizationId,
					deviceId: params.deviceId,
					runType: "DEVICE_USERS",
					status: "PROCESSING",
					source: DEVICE_EVENT_SOURCES.has(String(params.source || "").trim())
						? String(params.source || "").trim()
						: null,
					startedByUserId: params.startedByUserId || null,
					totalSourceRecords: params.sourceWideRefresh ? params.targetDeviceCount : 1,
					importableRecords: params.sourceWideRefresh ? params.targetDeviceCount : 1,
					rawSummary: {
						kind: "biometric_lifecycle_reconcile",
						eventKind: params.eventKind,
						minor: params.minor,
						employeeNo: params.employeeNo || null,
						cardNo: params.cardNo || null,
						sourceWideRefresh: params.sourceWideRefresh,
						targetDeviceCount: params.targetDeviceCount,
					},
				},
				select: { id: true },
			});
		} catch (error) {
			if (isMissingDeviceSyncRunTableError(error)) {
				deviceLogger.warn(
					`Device sync run history table is missing; continuing biometric reconcile without durable run journal for device ${params.deviceId}`,
				);
				return null;
			}
			throw error;
		}
	};

	const finalizeBiometricLifecycleSyncRun = async (
		runId: string | null | undefined,
		data: Record<string, any>,
	) => {
		if (!runId) return;
		try {
			await (prisma as any).deviceSyncRun.update({
				where: { id: runId },
				data,
			});
		} catch (error) {
			if (isMissingDeviceSyncRunTableError(error)) return;
			throw error;
		}
	};

	const buildReconcileDerivedEventTaxonomy = (minor: string, eventKind: string) => {
		const normalizedMinor = String(minor || "")
			.trim()
			.toUpperCase();
		if (
			normalizedMinor === "MINOR_ADD_FINGER_BY_CARD" ||
			normalizedMinor === "MINOR_ADD_FINGER_BY_EMPLOYEE_NO"
		) {
			return {
				eventCategory: "ENROLLMENT",
				eventAction: "FINGERPRINT_ENROLLED",
				eventLabel: "Fingerprint enrolled",
				eventConfidence: "SUPPORTED",
			} as const;
		}
		if (
			normalizedMinor === "MINOR_MOD_FINGER_BY_CARD" ||
			normalizedMinor === "MINOR_MOD_FINGER_BY_EMPLOYEE_NO"
		) {
			return {
				eventCategory: "ENROLLMENT",
				eventAction: "FINGERPRINT_UPDATED",
				eventLabel: "Fingerprint updated",
				eventConfidence: "SUPPORTED",
			} as const;
		}
		if (
			normalizedMinor === "MINOR_DEL_FINGER" ||
			normalizedMinor === "MINOR_CLR_FINGER_BY_READER" ||
			normalizedMinor === "MINOR_CLR_FINGER_BY_CARD" ||
			normalizedMinor === "MINOR_CLR_FINGER_BY_EMPLOYEE_ON"
		) {
			return {
				eventCategory: "ENROLLMENT",
				eventAction: "FINGERPRINT_DELETED",
				eventLabel: "Fingerprint deleted",
				eventConfidence: "SUPPORTED",
			} as const;
		}
		if (normalizedMinor === "MINOR_ADD_USER_INFO") {
			return {
				eventCategory: "USER_MANAGEMENT",
				eventAction: "USER_CREATED",
				eventLabel: "Device user created",
				eventConfidence: "SUPPORTED",
			} as const;
		}
		if (normalizedMinor === "MINOR_MODIFY_USER_INFO") {
			return {
				eventCategory: "USER_MANAGEMENT",
				eventAction: "USER_UPDATED",
				eventLabel: "Device user updated",
				eventConfidence: "SUPPORTED",
			} as const;
		}
		if (normalizedMinor === "MINOR_CLR_USER_INFO") {
			return {
				eventCategory: "USER_MANAGEMENT",
				eventAction: "USER_DELETED",
				eventLabel: "Device user deleted",
				eventConfidence: "SUPPORTED",
			} as const;
		}
		if (
			eventKind === "biometric_operation_sync" ||
			normalizedMinor.startsWith("OBSERVED_OPERATION_MINOR_")
		) {
			return {
				eventCategory: "RUNTIME",
				eventAction: "SYNC_IMPORTED",
				eventLabel: "Device user sync reconciled",
				eventConfidence: "INFERRED",
			} as const;
		}
		return null;
	};

	const persistDerivedBiometricLifecycleEvent = async (params: {
		req: Request;
		organizationId: string;
		sourceDevice: any;
		employeeNo: string;
		eventKind: string;
		minor: string;
		source: string;
		sdkTime?: string | null;
		fingerprintSummary?: Record<string, any>;
		deviceUser?: { id?: string | null; employeeId?: string | null; rawPayload?: any } | null;
	}) => {
		const taxonomy = buildReconcileDerivedEventTaxonomy(params.minor, params.eventKind);
		if (!taxonomy) return null;
		const eventTime = params.sdkTime ? parseHikvisionEventTime(params.sdkTime) : new Date();
		const dedupeKey = [
			"reconcile-derived",
			params.sourceDevice.id,
			params.employeeNo || "all",
			taxonomy.eventAction,
			String(params.sdkTime || eventTime.toISOString()).trim(),
			String(params.minor || "").trim(),
		].join(":");
		const existing = await (prisma as any).deviceEvent.findFirst({
			where: {
				organizationId: params.organizationId,
				dedupeKey,
			},
			select: { id: true },
		});
		if (existing) return existing;
		const eventRecord = await (prisma as any).deviceEvent.create({
			data: {
				organizationId: params.organizationId,
				deviceId: params.sourceDevice.id,
				deviceUserId: params.deviceUser?.id || null,
				employeeId: params.deviceUser?.employeeId || null,
				eventTime,
				employeeNo: params.employeeNo || null,
				source: params.source,
				status: params.deviceUser?.employeeId ? "MATCHED" : "UNMATCHED",
				eventCategory: taxonomy.eventCategory,
				eventAction: taxonomy.eventAction,
				eventLabel: taxonomy.eventLabel,
				eventConfidence: taxonomy.eventConfidence,
				eventType: "BiometricReconcile",
				major: "3",
				minor: params.minor || null,
				dedupeKey,
				payload: {
					derivedFromReconcile: true,
					eventKind: params.eventKind,
					actionCode: params.minor,
					sourceDeviceId: params.sourceDevice.id,
					deviceIP: params.sourceDevice.address,
					ipAddress: params.sourceDevice.address,
					employeeNo: params.employeeNo,
					employeeNoString: params.employeeNo,
					fingerprintSummary: params.fingerprintSummary || {},
					deviceUserMetadata:
						params.deviceUser?.rawPayload &&
						typeof params.deviceUser.rawPayload === "object"
							? (params.deviceUser.rawPayload as any)._hrisDeviceMetadata || null
							: null,
				},
			},
		});
		await invalidateCache.byPattern("cache:device:events:*").catch(() => undefined);
		return eventRecord;
	};

	const buildDeviceUserLifecycleBackfillPlan = (params: {
		deviceUsers: Array<{
			id: string;
			vendorUserId?: string | null;
			employeeId?: string | null;
			employeeNo?: string | null;
			rawPayload?: any;
			lastSyncedAt?: Date | string | null;
		}>;
		existingKeys: Set<string>;
	}) => {
		// Quarantined: a current DeviceUser row is not evidence that a user was
		// created or a fingerprint was enrolled. Lifecycle inference now requires
		// two complete device snapshots through normalizeHikvisionStateTransitionEvidence.
		void params;
		return [] as Array<Record<string, any>>;
	};

	const persistDeviceUserLifecycleBackfill = async (params: {
		organizationId: string;
		sourceDevice: { id: string; name: string; address?: string | null };
		deviceUsers: Array<{
			id: string;
			vendorUserId?: string | null;
			employeeId?: string | null;
			employeeNo?: string | null;
			rawPayload?: any;
			lastSyncedAt?: Date | string | null;
		}>;
		source: string;
		reason: string;
		execute: boolean;
		sdkTime?: string | null;
		minor?: string | null;
	}) => {
		const deviceUserIds = params.deviceUsers
			.map((row) => String(row.id || "").trim())
			.filter(Boolean);
		if (!deviceUserIds.length) {
			return {
				execute: params.execute,
				quarantined: true,
				reason: "current_device_user_state_is_not_lifecycle_evidence",
				totalDeviceUsers: 0,
				plannedEvents: [],
				createdEvents: [],
			};
		}

		const existingEvents = await (prisma as any).deviceEvent.findMany({
			where: {
				organizationId: params.organizationId,
				deviceId: params.sourceDevice.id,
				deviceUserId: { in: deviceUserIds },
				eventAction: { in: ["USER_CREATED", "FINGERPRINT_ENROLLED"] },
			},
			select: {
				deviceUserId: true,
				eventAction: true,
			},
		});
		const existingKeys = new Set<string>(
			existingEvents.map(
				(event: { deviceUserId?: string | null; eventAction?: string | null }) =>
					`${String(event.deviceUserId || "").trim()}:${String(event.eventAction || "").trim()}`,
			),
		);
		const plannedEvents = buildDeviceUserLifecycleBackfillPlan({
			deviceUsers: params.deviceUsers,
			existingKeys,
		});

		if (!params.execute) {
			return {
				execute: false,
				quarantined: true,
				reason: "current_device_user_state_is_not_lifecycle_evidence",
				totalDeviceUsers: params.deviceUsers.length,
				plannedEvents: plannedEvents.map((event) => ({
					deviceUserId: event.deviceUser.id,
					vendorUserId: event.deviceUser.vendorUserId || null,
					employeeNo: event.employeeNo,
					eventAction: event.eventAction,
					eventCategory: event.eventCategory,
				})),
				createdEvents: [],
			};
		}

		const createdEvents = [];
		for (const plannedEvent of plannedEvents) {
			const eventTime = params.sdkTime
				? parseHikvisionEventTime(params.sdkTime)
				: plannedEvent.deviceUser.lastSyncedAt
					? new Date(plannedEvent.deviceUser.lastSyncedAt)
					: new Date();
			const dedupeKey = [
				"device-user-lifecycle-backfill",
				params.sourceDevice.id,
				plannedEvent.deviceUser.id,
				plannedEvent.eventAction,
			].join(":");
			const eventRecord = await (prisma as any).deviceEvent.create({
				data: {
					organizationId: params.organizationId,
					deviceId: params.sourceDevice.id,
					deviceUserId: plannedEvent.deviceUser.id,
					employeeId: plannedEvent.deviceUser.employeeId || null,
					eventTime,
					employeeNo: plannedEvent.employeeNo,
					source: params.source,
					status: plannedEvent.deviceUser.employeeId ? "MATCHED" : "UNMATCHED",
					eventCategory: plannedEvent.eventCategory,
					eventAction: plannedEvent.eventAction,
					eventLabel: plannedEvent.eventLabel,
					eventConfidence: plannedEvent.eventConfidence,
					eventType: plannedEvent.eventType,
					major: "3",
					minor: params.minor || "STATE_BACKFILL",
					dedupeKey,
					payload: {
						...plannedEvent.payload,
						backfillReason: params.reason,
						sourceDeviceId: params.sourceDevice.id,
						sourceDeviceName: params.sourceDevice.name,
						deviceIP: params.sourceDevice.address || null,
						ipAddress: params.sourceDevice.address || null,
						employeeNo: plannedEvent.employeeNo,
						employeeNoString: plannedEvent.employeeNo,
						deviceUserMetadata:
							plannedEvent.deviceUser.rawPayload &&
							typeof plannedEvent.deviceUser.rawPayload === "object"
								? (plannedEvent.deviceUser.rawPayload as any)._hrisDeviceMetadata ||
									null
								: null,
					},
				},
				select: {
					id: true,
					deviceUserId: true,
					eventAction: true,
					eventCategory: true,
					employeeNo: true,
				},
			});
			createdEvents.push(eventRecord);
		}
		if (createdEvents.length) {
			await invalidateCache.byPattern("cache:device:events:*").catch(() => undefined);
		}
		return {
			execute: true,
			quarantined: true,
			reason: "current_device_user_state_is_not_lifecycle_evidence",
			totalDeviceUsers: params.deviceUsers.length,
			plannedEvents: plannedEvents.map((event) => ({
				deviceUserId: event.deviceUser.id,
				vendorUserId: event.deviceUser.vendorUserId || null,
				employeeNo: event.employeeNo,
				eventAction: event.eventAction,
				eventCategory: event.eventCategory,
			})),
			createdEvents,
		};
	};

	const persistNormalizedHikvisionEvidence = async (params: {
		req: Request;
		organizationId: string;
		device: { id: string; name: string; address?: string | null };
		evidence: NormalizedHikvisionEvidenceEvent;
	}) => {
		// Resolve opaque log person tokens via write-time map before save (Sync logs from today).
		const { applyDevicePersonTokenToEvidence } =
			await import("../../helper/device-person-token.helper.js");
		const resolvedEvidence = await applyDevicePersonTokenToEvidence(prisma as any, {
			organizationId: params.organizationId,
			deviceId: params.device.id,
			evidence: params.evidence as any,
		});
		const employeeNo = String(resolvedEvidence.employeeNo || "").trim();
		const eventTime = parseHikvisionEventTime(resolvedEvidence.time || params.evidence.time);
		const rawEvidence = resolvedEvidence.rawEvidence as any;
		const opaquePersonToken =
			String(
				(resolvedEvidence as any).opaquePersonToken || rawEvidence?.opaquePersonToken || "",
			).trim() || null;
		const dedupeKey = createHash("sha256")
			.update(
				JSON.stringify({
					deviceId: params.device.id,
					evidenceSource:
						resolvedEvidence.evidenceSource || params.evidence.evidenceSource,
					eventTime: eventTime.toISOString(),
					// Prefer opaque for stable dedupe when both known (same log row).
					employeeNo: opaquePersonToken || employeeNo,
					eventCategory: resolvedEvidence.eventCategory || params.evidence.eventCategory,
					eventAction: resolvedEvidence.eventAction || params.evidence.eventAction,
					major: resolvedEvidence.major ?? params.evidence.major ?? null,
					minor: resolvedEvidence.minor ?? params.evidence.minor ?? null,
					parameter: rawEvidence?.parameter || null,
					information: rawEvidence?.information || null,
				}),
			)
			.digest("hex");
		const existing = await (prisma as any).deviceEvent.findFirst({
			where: { organizationId: params.organizationId, dedupeKey },
		});
		if (existing) return { eventRecord: existing, duplicate: true };

		const deviceUser = employeeNo
			? await (prisma as any).deviceUser.findFirst({
					where: {
						organizationId: params.organizationId,
						deviceId: params.device.id,
						vendorUserId: employeeNo,
					},
					select: { id: true, employeeId: true },
				})
			: null;
		const legacyEmployee =
			!deviceUser?.employeeId && employeeNo
				? await prisma.employee.findFirst({
						where: {
							organizationId: params.organizationId,
							isDeleted: false,
							deviceEmpId: employeeNo,
						},
						select: { id: true },
					})
				: null;
		const employeeId = deviceUser?.employeeId || legacyEmployee?.id || null;
		const payload = {
			evidenceSource: resolvedEvidence.evidenceSource || params.evidence.evidenceSource,
			directDeviceEvidence:
				resolvedEvidence.directDeviceEvidence ?? params.evidence.directDeviceEvidence,
			vendorAction:
				rawEvidence?.metaId ||
				rawEvidence?.minorType ||
				resolvedEvidence.actionCode ||
				resolvedEvidence.minor ||
				null,
			vendorCode: resolvedEvidence.actionCode || resolvedEvidence.minor || null,
			rawDeviceTime: rawEvidence?.time || resolvedEvidence.time || null,
			operator: rawEvidence?.operator || rawEvidence?.raw?.operator || null,
			remoteHost: rawEvidence?.remoteHost || rawEvidence?.raw?.remoteHost || null,
			rawEvidence: resolvedEvidence.rawEvidence ?? null,
			deviceId: params.device.id,
			deviceName: params.device.name,
			deviceIP: params.device.address || resolvedEvidence.deviceIP || null,
			employeeNo: employeeNo || null,
			opaquePersonToken,
			personTokenResolved: Boolean((resolvedEvidence as any).personTokenResolved),
			resolvedEmployeeNo: (resolvedEvidence as any).personTokenResolved ? employeeNo : null,
		};
		const eventRecord = await (prisma as any).deviceEvent.create({
			data: {
				organizationId: params.organizationId,
				deviceId: params.device.id,
				deviceUserId: deviceUser?.id || null,
				employeeId,
				eventTime,
				employeeNo: employeeNo || null,
				source: normalizeHikvisionDeviceEventSource(
					resolvedEvidence.source || params.evidence.source,
				),
				status: employeeNo ? (employeeId ? "MATCHED" : "UNMATCHED") : "RECEIVED",
				eventCategory: resolvedEvidence.eventCategory || params.evidence.eventCategory,
				eventAction: resolvedEvidence.eventAction || params.evidence.eventAction,
				eventLabel: resolvedEvidence.eventLabel || params.evidence.eventLabel,
				eventConfidence:
					resolvedEvidence.eventConfidence || params.evidence.eventConfidence,
				eventType: resolvedEvidence.eventType || params.evidence.eventType || null,
				major:
					resolvedEvidence.major !== undefined && resolvedEvidence.major !== null
						? String(resolvedEvidence.major)
						: params.evidence.major !== undefined && params.evidence.major !== null
							? String(params.evidence.major)
							: null,
				minor:
					resolvedEvidence.minor !== undefined && resolvedEvidence.minor !== null
						? String(resolvedEvidence.minor)
						: params.evidence.minor !== undefined && params.evidence.minor !== null
							? String(params.evidence.minor)
							: null,
				dedupeKey,
				payload,
			},
		});
		// Keep DeviceUser inventory in sync when we learn a plain device person no
		// (write-time map resolve or already-plain). This is device inventory, not HRIS Employee.
		if (employeeNo && !isOpaqueLikePersonToken(employeeNo)) {
			void (async () => {
				try {
					const { upsertDeviceUserInventoryStub } =
						await import("../../helper/device-person-token.helper.js");
					await upsertDeviceUserInventoryStub(prisma as any, {
						organizationId: params.organizationId,
						deviceId: params.device.id,
						employeeNo,
						displayName:
							(resolvedEvidence as any)?.rawEvidence?.resolvedDisplayName ||
							(payload as any)?.resolvedDisplayName ||
							null,
						opaqueToken: opaquePersonToken,
					});
				} catch {
					// never block event save
				}
			})();
		}
		await invalidateCache.byPattern("cache:device:events:*").catch(() => undefined);
		emitDeviceEventSaved((params.req as any).io, eventRecord);
		return { eventRecord, duplicate: false };
	};

	const isOpaqueLikePersonToken = (value: string) => {
		const token = String(value || "").trim();
		if (!token) return false;
		if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(token) && !/[+/=]/.test(token)) return false;
		if (/^[A-Za-z0-9+/]{16,}={0,2}$/.test(token) && /[+/=]/.test(token)) return true;
		return token.length >= 20 && /[+/=]/.test(token);
	};

	const persistDeviceRuntimeEvent = async (params: {
		req: Request;
		organizationId: string;
		deviceId: string;
		source: "HIKVISION_CALLBACK" | "EN_HCNETSDK_ALARM" | "ZKTECO_EVENT";
		action: "SYNC_IMPORTED" | "SYNC_SIGNAL";
		label: string;
		correlationId: string;
		payload: Record<string, any>;
	}) => {
		const dedupeKey = createHash("sha256")
			.update(
				[
					"device-runtime-event",
					params.organizationId,
					params.deviceId,
					params.action,
					params.correlationId,
				].join("|"),
			)
			.digest("hex");
		const existing = await (prisma as any).deviceEvent.findFirst({
			where: { organizationId: params.organizationId, dedupeKey },
		});
		if (existing) return existing;
		const eventTime = new Date();
		const eventRecord = await (prisma as any).deviceEvent.create({
			data: {
				organizationId: params.organizationId,
				deviceId: params.deviceId,
				eventTime,
				source: params.source,
				status: "RECEIVED",
				eventCategory: "RUNTIME",
				eventAction: params.action,
				eventLabel: params.label,
				eventConfidence: "PROVEN",
				eventType: "DeviceSyncRun",
				dedupeKey,
				payload: {
					evidenceSource: "RUNTIME_PROCESS",
					directDeviceEvidence: false,
					vendorAction: params.action,
					vendorCode: params.action,
					rawDeviceTime: eventTime.toISOString(),
					operator: (params.req as any).userId || (params.req as any).user?.id || null,
					remoteHost: params.req.ip || null,
					correlationId: params.correlationId,
					...params.payload,
				},
			},
		});
		await invalidateCache.byPattern("cache:device:events:*").catch(() => undefined);
		emitDeviceEventSaved((params.req as any).io, eventRecord);
		return eventRecord;
	};

	const searchHikvisionDeviceLogs = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const deviceId = String(req.params.id || (req.body as any)?.deviceId || "").trim();
			const device = await getDeviceForUserSync(gate.organizationId, deviceId);
			if (!device || !isHikvisionDevice(device)) {
				res.status(400).json(buildErrorResponse("Select a Hikvision device", 400));
				return;
			}
			const execute = (req.body as any)?.execute === true;
			const endTime = String((req.body as any)?.endTime || new Date().toISOString()).trim();
			const startTime = String(
				(req.body as any)?.startTime ||
					new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
			).trim();
			const pageSize = Number(
				(req.body as any)?.maxResults || (req.body as any)?.pageSize || 50,
			);
			const maxRows = Number((req.body as any)?.maxRows || 500);
			const startPosition = Number(
				(req.body as any)?.searchResultPostion ||
					(req.body as any)?.searchResultPosition ||
					0,
			);
			const searchId = String((req.body as any)?.searchId || randomUUID()).trim();
			const metaId = String(
				(req.body as any)?.metaId || (req.query as any)?.metaId || "log.std-cgi.com",
			).trim();
			const result = await paginateHikvisionLogSearch({
				startPosition,
				pageSize,
				maxRows,
				fetchPage: async (searchResultPosition, maxResults) => {
					const response = await hikvisionFetch("/ISAPI/ContentMgmt/logSearch", {
						method: "POST",
						deviceId: device.id,
						prisma,
						request: req,
						timeoutMs: 15000,
						ensureJsonFormat: false,
						rawResponse: true,
						headers: {
							Accept: "application/xml, text/xml, */*",
							"Content-Type": "application/xml; charset=UTF-8",
						},
						body: buildHikvisionLogSearchXml({
							searchId,
							startTime,
							endTime,
							maxResults,
							searchResultPosition,
							metaId,
						}),
					});
					return String(response?.raw || "");
				},
			});
			const normalized = result.rows.map((row) =>
				normalizeHikvisionLogSearchRow(row, device),
			);
			const countBy = (
				key: "eventCategory" | "eventAction" | "eventConfidence" | "evidenceSource",
			) =>
				Object.fromEntries(
					Array.from(
						normalized.reduce((counts, event) => {
							const value = String(event[key] || "UNKNOWN");
							counts.set(value, (counts.get(value) || 0) + 1);
							return counts;
						}, new Map<string, number>()),
					).sort(([left], [right]) => left.localeCompare(right)),
				);
			const summary = {
				total: normalized.length,
				mapped: normalized.filter((event) => event.eventAction !== "UNKNOWN").length,
				unknown: normalized.filter((event) => event.eventAction === "UNKNOWN").length,
				byCategory: countBy("eventCategory"),
				byAction: countBy("eventAction"),
				byConfidence: countBy("eventConfidence"),
				byEvidenceSource: countBy("evidenceSource"),
			};
			const persisted: Array<{ id: string; duplicate: boolean; eventAction: string }> = [];
			if (execute) {
				for (const evidence of normalized) {
					const saved = await persistNormalizedHikvisionEvidence({
						req,
						organizationId: gate.organizationId,
						device,
						evidence,
					});
					persisted.push({
						id: saved.eventRecord.id,
						duplicate: saved.duplicate,
						eventAction: saved.eventRecord.eventAction,
					});
				}
			}
			res.status(200).json(
				buildSuccessResponse(
					execute
						? "Hikvision log evidence saved"
						: "Hikvision log evidence preview ready",
					{
						execute,
						device: { id: device.id, name: device.name, address: device.address },
						request: { searchId, startTime, endTime, pageSize, maxRows, startPosition },
						metaId,
						pages: result.pages,
						summary,
						normalized,
						persisted,
						nextSearchResultPosition: result.nextSearchResultPosition,
					},
					200,
				),
			);
		} catch (error: any) {
			const status = Number(error?.status || 500);
			const rawDeviceResponse = String(error?.data?.raw || "").trim();
			res.status(status).json(
				buildErrorResponse(
					error?.message || "Failed to search Hikvision device logs",
					status,
					rawDeviceResponse
						? [
								{
									field: "directDeviceResponse",
									message: rawDeviceResponse.slice(0, 16_384),
								},
							]
						: undefined,
				),
			);
		}
	};

	const syncDeviceUsers = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const deviceId = String(req.params.id || (req.body as any)?.deviceId || "").trim();
			const device = await getDeviceForUserSync(gate.organizationId, deviceId);
			if (!device || !isHikvisionDevice(device)) {
				res.status(400).json(
					buildErrorResponse("Select a Hikvision device before syncing users", 400),
				);
				return;
			}
			const { run: updatedRun, summary } = await syncHikvisionDeviceUsersFromSource({
				req,
				organizationId: gate.organizationId,
				device,
				startedByUserId: (req as any).userId || null,
			});
			const syncedDeviceUsers = await prisma.deviceUser.findMany({
				where: {
					organizationId: gate.organizationId,
					deviceId: device.id,
				},
				orderBy: { vendorUserId: "asc" },
				select: {
					id: true,
					vendorUserId: true,
					employeeId: true,
					employeeNo: true,
					rawPayload: true,
					lastSyncedAt: true,
				},
			});
			const lifecycleBackfill = await persistDeviceUserLifecycleBackfill({
				organizationId: gate.organizationId,
				sourceDevice: {
					id: device.id,
					name: device.name,
					address: device.address,
				},
				deviceUsers: syncedDeviceUsers,
				source: "EN_HCNETSDK_ALARM",
				reason: "sync_device_users_route",
				execute: true,
				minor: "SYNC_ROUTE_BACKFILL",
			});
			await invalidateCache.byPattern("cache:device:*").catch(() => undefined);
			res.status(200).json(
				buildSuccessResponse(
					"Device users synced",
					{
						run: updatedRun,
						summary,
						lifecycleBackfill,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to sync device users", 500),
			);
		}
	};

	const classifyHikvisionProbeError = (error: any): HikvisionCapabilityStatus => {
		const status = Number(error?.status || 0);
		const text = JSON.stringify(error?.data || error || {}).toLowerCase();
		if (status === 401 || status === 403) return "authFailed";
		if (
			status === 405 ||
			text.includes("methodnotallowed") ||
			text.includes("method not allowed")
		) {
			return "methodNotAllowed";
		}
		if (
			status === 404 ||
			text.includes("notsupport") ||
			text.includes("not support") ||
			text.includes("not_supported")
		) {
			return "notSupported";
		}
		return "unknown";
	};

	const probeHikvisionCapability = async (params: {
		req: Request;
		deviceId: string;
		name: string;
		endpoint: string;
		method?: "GET" | "POST" | "PUT";
		body?: Record<string, any>;
	}) => {
		const startedAt = Date.now();
		try {
			const data = await hikvisionFetch(params.endpoint, {
				method: params.method || "GET",
				deviceId: params.deviceId,
				prisma,
				request: params.req,
				timeoutMs: 6000,
				headers: { "Content-Type": "application/json" },
				...(params.body ? { body: params.body } : {}),
			});
			return {
				name: params.name,
				endpoint: params.endpoint,
				method: params.method || "GET",
				status: "supported" as HikvisionCapabilityStatus,
				durationMs: Date.now() - startedAt,
				evidence: {
					responseKeys:
						data && typeof data === "object" ? Object.keys(data).slice(0, 8) : [],
					statusString:
						data?.statusString ||
						data?.ResponseStatus?.statusString ||
						data?.UserInfoSearch?.responseStatusStrg ||
						null,
				},
			};
		} catch (error: any) {
			return {
				name: params.name,
				endpoint: params.endpoint,
				method: params.method || "GET",
				status: classifyHikvisionProbeError(error),
				durationMs: Date.now() - startedAt,
				error: error?.message || error?.data?.message || "Capability probe failed",
				rawStatus: error?.status || null,
				raw: error?.data || null,
			};
		}
	};

	const discoverHikvisionUserExportCapabilities = async (
		req: Request,
		device: { id: string; name?: string | null },
		options: {
			includeCards?: boolean;
			includeFingerprints?: boolean;
			includeFaces?: boolean;
		} = {},
	) => {
		const probeRequests = [
			probeHikvisionCapability({
				req,
				deviceId: device.id,
				name: "userCount",
				endpoint: hikvisionEndpoint.accessControl.userInfo.count,
			}),
			probeHikvisionCapability({
				req,
				deviceId: device.id,
				name: "userSearch",
				endpoint: hikvisionEndpoint.accessControl.userInfo.search,
				method: "POST",
				body: {
					UserInfoSearchCond: {
						searchID: `export-capability-${Date.now()}`,
						searchResultPosition: 0,
						maxResults: 1,
					},
				},
			}),
		];
		if (options.includeCards) {
			probeRequests.push(
				probeHikvisionCapability({
					req,
					deviceId: device.id,
					name: "cardSearch",
					endpoint: "/ISAPI/AccessControl/CardInfo/Search",
					method: "POST",
					body: {
						CardInfoSearchCond: {
							searchID: `card-export-capability-${Date.now()}`,
							searchResultPosition: 0,
							maxResults: 1,
						},
					},
				}),
			);
		}
		if (options.includeFingerprints) {
			probeRequests.push(
				probeHikvisionCapability({
					req,
					deviceId: device.id,
					name: "fingerprintSearch",
					endpoint: "/ISAPI/AccessControl/FingerPrintUpload",
					method: "POST",
					body: {
						FingerPrintCond: {
							searchID: `fingerprint-export-capability-${Date.now()}`,
							searchResultPosition: 0,
							maxResults: 1,
						},
					},
				}),
				probeHikvisionCapability({
					req,
					deviceId: device.id,
					name: "fingerprintImportSetup",
					endpoint: "/ISAPI/AccessControl/FingerPrint/SetUp/capabilities",
				}),
			);
		}
		if (options.includeFaces) {
			probeRequests.push(
				probeHikvisionCapability({
					req,
					deviceId: device.id,
					name: "faceDataRecord",
					endpoint: "/ISAPI/Intelligent/FDLib/FaceDataRecord/capabilities",
				}),
			);
		}
		const probes = await Promise.all(probeRequests);
		const byName = Object.fromEntries(probes.map((probe) => [probe.name, probe]));
		return {
			deviceId: device.id,
			deviceName: device.name || null,
			probedAt: new Date().toISOString(),
			probes,
			support: {
				userExport: byName.userSearch?.status === "supported",
				cardExport: byName.cardSearch?.status === "supported",
				fingerprintExport: byName.fingerprintSearch?.status === "supported",
				fingerprintImport: byName.fingerprintImportSetup?.status === "supported",
				faceImportExport: byName.faceDataRecord?.status === "supported",
			},
			policy: {
				fingerprintTemplateExport:
					"raw_blobs_allowed_when_evidenced_on_device_user_or_event",
				fingerprintTemplateImport:
					"raw_package_or_sdk_peer_copy_allowed_with_admin_preview_and_confirmation",
			},
		};
	};

	const loadDeviceUsersForExport = async (organizationId: string, deviceId: string) => {
		if (!(await hasDeviceUserTable())) return [];
		const includeVendorMetadata = await hasDeviceUserVendorMetadataColumn();
		const rows = await (prisma as any).deviceUser.findMany({
			where: { organizationId, deviceId },
			select: buildDeviceUserSelect({ includeVendorMetadata }),
			orderBy: [{ vendorUserId: "asc" }],
		});
		return rows.map(decorateDeviceUser);
	};

	const normalizeDeviceUserExportSelection = (value: unknown) => {
		const selection = String(value || "all").trim();
		return ["all", "filtered", "currentPage", "selectedRows"].includes(selection)
			? selection
			: "all";
	};

	const normalizeDeviceUserExportVendorIds = (value: unknown) =>
		Array.from(
			new Set(
				[]
					.concat(value as any)
					.flatMap((item) => String(item || "").split(","))
					.map((item) => item.trim())
					.filter(Boolean),
			),
		).slice(0, 500);

	const filterDeviceUserExportRows = (
		rows: any[],
		options: {
			selection?: string;
			status?: string;
			query?: string;
			page?: number;
			limit?: number;
			vendorUserIds?: string[];
		},
	) => {
		const selection = normalizeDeviceUserExportSelection(options.selection);
		const vendorUserIds = normalizeDeviceUserExportVendorIds(options.vendorUserIds);
		const vendorUserIdSet = new Set(vendorUserIds);
		const status = String(options.status || "all").trim();
		const query = String(options.query || "")
			.trim()
			.toLowerCase();
		let selectedRows = rows;
		if (vendorUserIdSet.size > 0) {
			selectedRows = rows
				.filter((row) => vendorUserIdSet.has(String(row.vendorUserId || "").trim()))
				.sort(
					(left, right) =>
						vendorUserIds.indexOf(String(left.vendorUserId || "").trim()) -
						vendorUserIds.indexOf(String(right.vendorUserId || "").trim()),
				);
		} else if (selection === "filtered" || selection === "currentPage") {
			selectedRows = rows.filter((row) => {
				const rowStatus = String(row.status || "").trim();
				const statusMatch =
					!status ||
					status === "all" ||
					rowStatus === status ||
					(status === "UNMATCHED" && rowStatus === "SOURCE_ONLY");
				if (!statusMatch) return false;
				if (!query) return true;
				return [
					row.vendorUserId,
					row.employeeNo,
					row.displayName,
					row.userType,
					row.hrisDeviceUser?.employee?.employeeId,
					row.hrisDeviceUser?.employee?.fullName,
				]
					.filter(Boolean)
					.some((value) => String(value).toLowerCase().includes(query));
			});
			if (selection === "currentPage") {
				const page = Math.max(Number(options.page || 1), 1);
				const limit = Math.min(Math.max(Number(options.limit || 25), 1), 500);
				selectedRows = selectedRows.slice((page - 1) * limit, page * limit);
			}
		}
		return {
			rows: selectedRows,
			selection: {
				mode: selection,
				status,
				query,
				page:
					selection === "currentPage" && vendorUserIds.length === 0
						? Math.max(Number(options.page || 1), 1)
						: null,
				limit:
					selection === "currentPage" && vendorUserIds.length === 0
						? Math.min(Math.max(Number(options.limit || 25), 1), 500)
						: null,
				vendorUserIds,
				matchedRows: selectedRows.length,
				totalRowsBeforeSelection: rows.length,
			},
		};
	};

	const buildDeviceUserImportPreviewToken = (params: {
		organizationId: string;
		targetDeviceId: string;
		payload: any;
		planRows: any[];
	}) =>
		createHash("sha256")
			.update(
				JSON.stringify({
					organizationId: params.organizationId,
					targetDeviceId: params.targetDeviceId,
					schemaVersion: params.payload?.schemaVersion || null,
					exportedAt: params.payload?.exportedAt || null,
					sourceDevices: (params.payload?.devices || []).map((device: any) => ({
						id: device?.device?.id || null,
						name: device?.device?.name || null,
					})),
					users: params.planRows.map((row) => ({
						vendorUserId: row.vendorUserId,
						action: row.action,
						sourceDeviceId: row.sourceDeviceId || null,
						conflictFields: row.conflictFields || [],
					})),
				}),
			)
			.digest("hex");

	const BIOMETRIC_TEMPLATE_KEY_PATTERN =
		/(finger.*(template|data|payload|bytes)|fp.*(template|data|payload|bytes)|face.*(template|data|payload|bytes)|templateData|templateBytes|byFingerData|fingerData|faceData|imageData|photoData|biometric.*(template|data|payload|bytes))/i;

	const isEncryptedDeviceUserBiometricBundleValue = (value: any) => {
		const parsed =
			typeof value === "string"
				? (() => {
						try {
							return JSON.parse(value);
						} catch {
							return null;
						}
					})()
				: value;
		return Boolean(
			parsed?.ciphertext &&
			parsed?.algorithm === DEVICE_USER_BIOMETRIC_BUNDLE_ALGORITHM &&
			parsed?.format === "project-truth.hikvision-biometric-template.v1",
		);
	};

	const sanitizeDeviceUserPortableValue = (value: any, key = ""): any => {
		if (value == null) return value;
		if (BIOMETRIC_TEMPLATE_KEY_PATTERN.test(key)) {
			if (isEncryptedDeviceUserBiometricBundleValue(value)) return value;
			return "[redacted-biometric-template]";
		}
		if (Buffer.isBuffer(value)) return "[redacted-binary-value]";
		if (Array.isArray(value)) {
			return value.map((item) => sanitizeDeviceUserPortableValue(item));
		}
		if (typeof value === "object") {
			return Object.fromEntries(
				Object.entries(value).map(([entryKey, entryValue]) => [
					entryKey,
					sanitizeDeviceUserPortableValue(entryValue, entryKey),
				]),
			);
		}
		return value;
	};

	const compactPortableDeviceUserBiometricMetadata = (row: any) => {
		delete row._rawBiometricSource;
		const biometricExport = row?.rawPayload?._hrisDeviceMetadata?.biometricExport;
		if (biometricExport && typeof biometricExport === "object") {
			for (const key of [
				"encryptedBiometricTemplate",
				"encryptedBiometricTemplateCiphertext",
				"encryptedFingerprintTemplate",
				"encryptedFaceTemplate",
			]) {
				delete biometricExport[key];
			}
		}
		const biometricBundle = row?.vendorMetadata?.biometricBundle;
		if (biometricBundle && typeof biometricBundle === "object") {
			for (const key of [
				"encryptedBiometricTemplate",
				"encryptedBiometricTemplateCiphertext",
				"encryptedFingerprintTemplate",
				"encryptedFaceTemplate",
			]) {
				delete biometricBundle[key];
			}
		}
		return row;
	};

	const getRawFingerprintTemplatesFromValue = (value: any): any[] => {
		if (typeof value === "string") {
			return parseRawFingerprintTemplatesFromCell(value);
		}
		const templates = Array.isArray(value?.templates)
			? value.templates
			: Array.isArray(value?.fingerprints)
				? value.fingerprints
				: [];
		return templates
			.map((template: any, index: number) => ({
				fingerPrintId: template?.fingerPrintId ?? template?.fingerPrintID ?? index + 1,
				fingerType: template?.fingerType || "normalFP",
				data: String(template?.data || template?.fingerData || "").trim(),
				source: template?.source || value?.source || "device_user_raw_custody",
			}))
			.filter((template: { data: string }) => template.data);
	};

	const isRawBiometricStatusValue = (value: string) =>
		["not_enrolled", "missing_raw_blob", "not_requested"].includes(value.trim());

	const parseRawFingerprintTemplatesFromCell = (value: unknown): any[] => {
		const raw = String(value || "").trim();
		if (!raw || isRawBiometricStatusValue(raw)) return [];
		if (raw.startsWith("[") || raw.startsWith("{")) {
			try {
				return getRawFingerprintTemplatesFromValue(JSON.parse(raw));
			} catch {
				/* fall through to pattern parsing */
			}
		}
		const patterned = Array.from(raw.matchAll(/FP\s*(\d*)\s*\(\s*"((?:\\.|[^"\\])*)"\s*\)/gi))
			.map((match, index) => ({
				fingerPrintId: Number(match[1] || index + 1) || index + 1,
				fingerType: "normalFP",
				data: match[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim(),
				source: "raw_package_cell",
			}))
			.filter((template) => template.data);
		if (patterned.length) return patterned;
		const parts = raw
			.split(/[;,]/)
			.map((part) => part.trim())
			.filter(Boolean);
		return (parts.length > 1 ? parts : [raw]).map((data, index) => ({
			fingerPrintId: index + 1,
			fingerType: "normalFP",
			data,
			source: "raw_package_cell",
		}));
	};

	const normalizeRawPackageFingerprintTemplates = (user: any): any[] => {
		const rawCustody = user?.rawBiometricCustody || {};
		const directTemplates = Array.isArray(rawCustody?.fingerprint?.templates)
			? rawCustody.fingerprint.templates
			: [];
		const csvColumns = user?.rawPayload?._hrisDeviceMetadata?.biometricCsvColumns || {};
		return getRawFingerprintTemplatesFromValue({
			templates: [
				...directTemplates,
				...parseRawFingerprintTemplatesFromCell(user?.rawFingerprintBlob),
				...parseRawFingerprintTemplatesFromCell(user?.fingerprintRawTemplateBlob),
				...parseRawFingerprintTemplatesFromCell(csvColumns?.rawFingerprintBlob),
				...parseRawFingerprintTemplatesFromCell(csvColumns?.fingerprintRawTemplateBlob),
			],
		});
	};

	const getRawFaceFromValue = (value: any) => {
		const base64 = String(value?.base64 || value?.facePicture || "").trim();
		const faceTemplate = String(value?.faceTemplate || "").trim();
		if (!base64 && !faceTemplate) return null;
		return {
			contentType: value?.contentType || "image/jpeg",
			byteLength: value?.byteLength || null,
			base64,
			faceTemplate,
			faceURL: value?.faceURL || null,
			source: value?.source || "device_user_raw_custody",
			capturedAt: value?.capturedAt || null,
		};
	};

	const buildRawDeviceUserBiometricCustody = (params: {
		row: any;
		eventPayload?: any | null;
		includeFingerprints?: boolean;
		includeFaces?: boolean;
	}) => {
		const credentialSummary =
			params.row?.rawPayload?._hrisDeviceMetadata?.credentialSummary ||
			params.row?.vendorMetadata?.credentialSummary ||
			params.row?._rawBiometricSource?.rawPayload?._hrisDeviceMetadata?.credentialSummary ||
			params.row?._rawBiometricSource?.vendorMetadata?.credentialSummary ||
			extractHikvisionCredentialSummary(params.row?.rawPayload || {});
		const fingerprintCount = Number(credentialSummary?.fingerprintCount || 0);
		const faceCount = Number(credentialSummary?.faceCount || 0);
		const rawFingerprints = getRawFingerprintTemplatesFromValue(
			params.row?._rawBiometricSource?.vendorMetadata?.rawFingerprints,
		).length
			? getRawFingerprintTemplatesFromValue(
					params.row?._rawBiometricSource?.vendorMetadata?.rawFingerprints,
				)
			: getRawFingerprintTemplatesFromValue(params.row?.vendorMetadata?.rawFingerprints)
						.length
				? getRawFingerprintTemplatesFromValue(params.row?.vendorMetadata?.rawFingerprints)
				: getRawFingerprintTemplatesFromValue(
							params.row?._rawBiometricSource?.rawPayload?._hrisDeviceMetadata
								?.rawFingerprints,
					  ).length
					? getRawFingerprintTemplatesFromValue(
							params.row?._rawBiometricSource?.rawPayload?._hrisDeviceMetadata
								?.rawFingerprints,
						)
					: getRawFingerprintTemplatesFromValue(
								params.row?.rawPayload?._hrisDeviceMetadata?.rawFingerprints,
						  ).length
						? getRawFingerprintTemplatesFromValue(
								params.row?.rawPayload?._hrisDeviceMetadata?.rawFingerprints,
							)
						: getRawFingerprintTemplatesFromValue(params.eventPayload?.rawFingerprints);
		const rawFace =
			getRawFaceFromValue(params.row?._rawBiometricSource?.vendorMetadata?.rawFace) ||
			getRawFaceFromValue(params.row?.vendorMetadata?.rawFace) ||
			getRawFaceFromValue(
				params.row?._rawBiometricSource?.rawPayload?._hrisDeviceMetadata?.rawFace,
			) ||
			getRawFaceFromValue(params.row?.rawPayload?._hrisDeviceMetadata?.rawFace) ||
			getRawFaceFromValue(params.eventPayload?.rawFace);
		const storedFingerprintCount = Math.min(
			rawFingerprints.length,
			Math.max(fingerprintCount, rawFingerprints.length),
		);
		const missingFingerprintCount = Math.max(fingerprintCount - rawFingerprints.length, 0);
		const storedFaceCount = rawFace ? Math.max(faceCount, 1) : 0;
		const missingFaceCount = Math.max(faceCount - (rawFace ? 1 : 0), 0);
		return {
			fingerprint: {
				status: !params.includeFingerprints
					? "not_requested"
					: fingerprintCount > 0 && missingFingerprintCount > 0
						? "missing_raw_blob"
						: rawFingerprints.length
							? "raw_blob_present"
							: fingerprintCount > 0
								? "missing_raw_blob"
								: "not_enrolled",
				countReported: fingerprintCount,
				rawBlobCount: rawFingerprints.length,
				storedCount: storedFingerprintCount,
				missingRawCount: missingFingerprintCount,
				templates: params.includeFingerprints ? rawFingerprints : [],
			},
			face: {
				status: !params.includeFaces
					? "not_requested"
					: faceCount > 0 && missingFaceCount > 0
						? "missing_raw_blob"
						: rawFace
							? "raw_blob_present"
							: faceCount > 0
								? "missing_raw_blob"
								: "not_enrolled",
				countReported: faceCount,
				rawBlobPresent: Boolean(rawFace),
				storedCount: storedFaceCount,
				missingRawCount: missingFaceCount,
				blob: params.includeFaces ? rawFace : null,
			},
			plaintextPolicy: "raw_evidenced_blobs_allowed_for_admin_device_user_sync_package",
		};
	};

	const summarizeDeviceUserRawBiometricCustody = (
		rows: any[],
		options: { liveVendorUserIds?: Set<string> | null } = {},
	) => {
		const liveVendorUserIds = options.liveVendorUserIds || null;
		const scopedRows = liveVendorUserIds
			? (rows || []).filter((row) =>
					liveVendorUserIds.has(
						String(row?.vendorUserId || row?.employeeNo || "").trim(),
					),
				)
			: rows || [];
		const staleRows = liveVendorUserIds
			? (rows || []).filter((row) => {
					const vendorUserId = String(row?.vendorUserId || row?.employeeNo || "").trim();
					return vendorUserId && !liveVendorUserIds.has(vendorUserId);
				})
			: [];
		const summary = {
			fingerprintReported: 0,
			fingerprintEnrolledRows: 0,
			fingerprintRawPresent: 0,
			fingerprintRawMissing: 0,
			fingerprintTemplateReportedTotal: 0,
			fingerprintRawPresentRows: 0,
			fingerprintRawMissingRows: 0,
			faceReported: 0,
			faceEnrolledRows: 0,
			faceRawPresent: 0,
			faceRawMissing: 0,
			faceTemplateReportedTotal: 0,
			faceRawPresentRows: 0,
			faceRawMissingRows: 0,
			staleHrisOnlyRows: staleRows.length,
			staleFingerprintReported: 0,
			staleFingerprintRawPresent: 0,
			staleFingerprintRawBlobCount: 0,
			staleFingerprintRawMissing: 0,
			staleFaceReported: 0,
			staleFaceRawPresent: 0,
			staleFaceRawMissing: 0,
			custodyScope: liveVendorUserIds ? "current_live_device_users" : "hris_device_users",
		};
		const applyRow = (row: any, target: "live" | "stale") => {
			const credentialSummary =
				row?.rawPayload?._hrisDeviceMetadata?.credentialSummary ||
				row?.vendorMetadata?.credentialSummary ||
				extractHikvisionCredentialSummary(row?.rawPayload || {});
			const fingerprintCount = Number(credentialSummary?.fingerprintCount || 0);
			const faceCount = Number(credentialSummary?.faceCount || 0);
			const rawFingerprints = getRawFingerprintTemplatesFromValue(
				row?.vendorMetadata?.rawFingerprints,
			).length
				? getRawFingerprintTemplatesFromValue(row?.vendorMetadata?.rawFingerprints)
				: getRawFingerprintTemplatesFromValue(
						row?.rawPayload?._hrisDeviceMetadata?.rawFingerprints,
					);
			const rawFace =
				getRawFaceFromValue(row?.vendorMetadata?.rawFace) ||
				getRawFaceFromValue(row?.rawPayload?._hrisDeviceMetadata?.rawFace);
			const hasRawFingerprint =
				rawFingerprints.length > 0 || Boolean(row?.vendorMetadata?.rawFingerprintPresent);
			const hasRawFace =
				Boolean(rawFace) ||
				Boolean(row?.vendorMetadata?.rawFacePresent) ||
				Boolean(row?.rawPayload?._hrisDeviceMetadata?.rawFacePresent);
			if (target === "stale") {
				const preservedRawFingerprintCount =
					rawFingerprints.length > 0 || hasRawFingerprint
						? Math.max(rawFingerprints.length, 1)
						: 0;
				summary.staleFingerprintRawBlobCount += preservedRawFingerprintCount;
			}
			if (fingerprintCount > 0) {
				const storedCount = Math.min(rawFingerprints.length, fingerprintCount);
				const missingCount = Math.max(fingerprintCount - storedCount, 0);
				if (target === "stale") {
					summary.staleFingerprintReported += fingerprintCount;
					summary.staleFingerprintRawPresent += storedCount;
					summary.staleFingerprintRawMissing += missingCount;
				} else {
					summary.fingerprintEnrolledRows += 1;
					summary.fingerprintReported += fingerprintCount;
					summary.fingerprintTemplateReportedTotal += fingerprintCount;
					summary.fingerprintRawPresent += storedCount;
					summary.fingerprintRawMissing += missingCount;
					if (hasRawFingerprint) summary.fingerprintRawPresentRows += 1;
					if (missingCount > 0) summary.fingerprintRawMissingRows += 1;
				}
			}
			if (faceCount > 0) {
				const storedCount = hasRawFace ? Math.max(faceCount, 1) : 0;
				const missingCount = Math.max(faceCount - (hasRawFace ? 1 : 0), 0);
				if (target === "stale") {
					summary.staleFaceReported += faceCount;
					summary.staleFaceRawPresent += storedCount;
					summary.staleFaceRawMissing += missingCount;
				} else {
					summary.faceEnrolledRows += 1;
					summary.faceReported += faceCount;
					summary.faceTemplateReportedTotal += faceCount;
					summary.faceRawPresent += storedCount;
					summary.faceRawMissing += missingCount;
					if (hasRawFace) summary.faceRawPresentRows += 1;
					if (missingCount > 0) summary.faceRawMissingRows += 1;
				}
			}
		};
		for (const row of scopedRows) applyRow(row, "live");
		for (const row of staleRows) applyRow(row, "stale");
		return {
			...summary,
			// Backward-compatible aliases for older app builds while the UI copy moves
			// from encrypted envelopes to raw blob custody.
			fingerprintEnvelopePresent: summary.fingerprintRawPresent,
			fingerprintEnvelopeMissing: summary.fingerprintRawMissing,
			faceEnvelopePresent: summary.faceRawPresent,
			faceEnvelopeMissing: summary.faceRawMissing,
		};
	};

	const loadLatestRawBiometricEventPayload = async (params: {
		organizationId: string;
		deviceId: string;
		vendorUserId: string;
	}) => {
		try {
			const event = await prisma.deviceEvent.findFirst({
				where: {
					organizationId: params.organizationId,
					deviceId: params.deviceId,
					employeeNo: params.vendorUserId,
				} as any,
				orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }] as any,
				select: { payload: true },
			});
			const payload =
				event?.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
					? (event.payload as Record<string, any>)
					: null;
			if (
				payload?.rawFingerprints ||
				payload?.rawFace ||
				Array.isArray(payload?.fingerprints) ||
				payload?.faceTemplate ||
				payload?.facePicture
			) {
				return {
					...payload,
					rawFingerprints:
						payload.rawFingerprints ||
						(Array.isArray(payload.fingerprints)
							? { templates: payload.fingerprints, source: "device_event_payload" }
							: null),
					rawFace:
						payload.rawFace ||
						(payload.faceTemplate || payload.facePicture
							? {
									faceTemplate: payload.faceTemplate || null,
									facePicture: payload.facePicture || null,
									source: "device_event_payload",
								}
							: null),
				};
			}
		} catch (error) {
			deviceLogger.warn(`Raw biometric event fallback failed: ${error}`);
		}
		return null;
	};

	const sanitizeDeviceUserImportPayloadForBackup = (payload: any) => ({
		schemaVersion: payload?.schemaVersion || null,
		exportedAt: payload?.exportedAt || null,
		scope: payload?.scope || null,
		policy: payload?.policy || null,
		rawBiometricPackage: payload?.rawBiometricPackage || null,
		biometricBundle: payload?.biometricBundle
			? {
					...payload.biometricBundle,
					ciphertext: payload.biometricBundle.ciphertext
						? "[encrypted-bundle-redacted]"
						: undefined,
				}
			: null,
		summary: payload?.summary || null,
		devices: (Array.isArray(payload?.devices) ? payload.devices : []).map((device: any) => ({
			device: device?.device || null,
			sourceRead: device?.sourceRead || null,
			capabilities: device?.capabilities || null,
			summary: device?.summary || null,
			userCount: Array.isArray(device?.users) ? device.users.length : 0,
			users: (Array.isArray(device?.users) ? device.users : []).map((user: any) => ({
				vendorUserId: user?.vendorUserId || null,
				employeeNo: user?.employeeNo || null,
				displayName: user?.displayName || null,
				status: user?.status || null,
				sourceDeviceId: user?.sourceDeviceId || null,
				credentialSummary:
					user?.rawPayload?._hrisDeviceMetadata?.credentialSummary ||
					user?.vendorMetadata?.credentialSummary ||
					null,
			})),
		})),
	});

	const buildDeviceUserImportResultRow = (row: any, extra: Record<string, any> = {}) => ({
		vendorUserId: row?.vendorUserId || null,
		employeeNo: row?.employeeNo || null,
		sourceDeviceId: row?.sourceDeviceId || null,
		sourceDeviceName: row?.sourceDeviceName || null,
		action: row?.action || null,
		conflictFields: Array.isArray(row?.conflictFields) ? row.conflictFields : [],
		currentDeviceUserId: row?.currentDeviceUserId || null,
		...extra,
	});

	const summarizeDeviceUserImportTarget = (deviceUser: any) =>
		deviceUser
			? {
					id: deviceUser.id || null,
					vendorUserId: deviceUser.vendorUserId || null,
					employeeNo: deviceUser.employeeNo || null,
					employeeId: deviceUser.employeeId || null,
					status: deviceUser.status || null,
					credentialSummary:
						deviceUser.rawPayload?._hrisDeviceMetadata?.credentialSummary || null,
				}
			: null;

	const waitForDelayedHikvisionPeerCopy = async (params: {
		req: Request;
		organizationId: string;
		targetDevice: any;
		employeeNo: string;
	}) => {
		const deadline = Date.now() + HIKVISION_PEER_COPY_COMPLETION_WAIT_MS;
		let lastSummary: any = null;
		let attempts = 0;
		do {
			attempts += 1;
			if (attempts > 1) await sleep(5000);
			const { summary } = await syncSingleHikvisionDeviceUserFromSource({
				req: params.req,
				organizationId: params.organizationId,
				device: params.targetDevice,
				employeeNo: params.employeeNo,
			});
			lastSummary = summary;
			const targetDeviceUser = await (prisma as any).deviceUser.findUnique({
				where: {
					organizationId_deviceId_vendorUserId: {
						organizationId: params.organizationId,
						deviceId: params.targetDevice.id,
						vendorUserId: params.employeeNo,
					},
				},
				select: {
					id: true,
					vendorUserId: true,
					employeeNo: true,
					employeeId: true,
					status: true,
					lastSyncedAt: true,
					rawPayload: true,
				},
			});
			if (targetDeviceUser?.id) {
				return {
					attempts,
					waitedMs: Math.max(
						0,
						HIKVISION_PEER_COPY_COMPLETION_WAIT_MS - (deadline - Date.now()),
					),
					targetSyncSummary: summary,
					targetDeviceUser,
				};
			}
		} while (Date.now() < deadline);
		return {
			attempts,
			waitedMs: HIKVISION_PEER_COPY_COMPLETION_WAIT_MS,
			targetSyncSummary: lastSummary,
		};
	};

	const buildDeviceUserExportPayload = async (
		req: Request,
		options: {
			organizationId: string;
			deviceId?: string;
			scope?: "currentDevice" | "allHikvisionDevices";
			includeRecords: boolean;
			includeCards?: boolean;
			includeFingerprints?: boolean;
			includeFaces?: boolean;
			rawBiometricPackage?: boolean;
			refreshSourceUsers?: boolean;
			cacheBiometricMetadata?: boolean;
			selection?: string;
			status?: string;
			query?: string;
			page?: number;
			limit?: number;
			vendorUserIds?: string[];
		},
	) => {
		const requestedScope = options.scope || "currentDevice";
		const rawBiometricExports: any[] = [];
		const rawBiometricExportErrors: any[] = [];
		const devices = await prisma.device.findMany({
			where: {
				organizationId: options.organizationId,
				isDeleted: false,
				...(requestedScope === "currentDevice" ? { id: options.deviceId || "" } : {}),
			},
			select: {
				id: true,
				organizationId: true,
				name: true,
				address: true,
				port: true,
				protocol: true,
				config: true,
				access: true,
			},
			orderBy: { name: "asc" },
		});
		const hikvisionDevices = devices.filter((device) => isHikvisionDevice(device));
		if (requestedScope === "currentDevice" && !hikvisionDevices.length) {
			throw { status: 400, message: "Select a Hikvision device before exporting users" };
		}

		const exportDevices = [];
		for (const device of hikvisionDevices) {
			let sourceSnapshot: { rawUsers: any[]; candidates: DeviceUserCandidate[] } = {
				rawUsers: [],
				candidates: [],
			};
			let sourceRead: Record<string, any> = {
				status: "skipped_cached_device_user_metadata",
				endpoint: "DeviceUser table",
				reason: "Normal export uses saved DeviceUser metadata so CSV generation does not wait for live SDK reads.",
			};
			if (options.refreshSourceUsers === true) {
				try {
					sourceSnapshot = await loadHikvisionDeviceUserSnapshot(req, device);
					sourceRead = {
						status: "supported",
						endpoint: "POST /ISAPI/AccessControl/UserInfo/Search?format=json",
						total: sourceSnapshot.rawUsers.length,
					};
				} catch (error: any) {
					sourceRead = {
						status: classifyHikvisionProbeError(error),
						endpoint: "POST /ISAPI/AccessControl/UserInfo/Search?format=json",
						error: error?.message || "Source user read failed",
						rawStatus: error?.status || null,
					};
				}
			}

			const savedUsers = await loadDeviceUsersForExport(options.organizationId, device.id);
			const savedByVendorUserId = new Map(
				savedUsers.map((row: any) => [String(row.vendorUserId || "").trim(), row]),
			);
			const sourceByVendorUserId = new Map(
				sourceSnapshot.candidates.map((candidate) => [
					String(candidate.vendorUserId || "").trim(),
					candidate,
				]),
			);
			const allVendorUserIds: string[] = Array.from(
				new Set<string>(
					[...savedByVendorUserId.keys(), ...sourceByVendorUserId.keys()]
						.map((value) => String(value || "").trim())
						.filter(Boolean),
				),
			).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
			const rows = allVendorUserIds.map((vendorUserId) => {
				const saved = savedByVendorUserId.get(vendorUserId) as any;
				const source = sourceByVendorUserId.get(vendorUserId);
				const rawPayload = sanitizeDeviceUserPortableValue(
					saved?.rawPayload || source?.rawPayload || null,
				);
				const vendorMetadata = sanitizeDeviceUserPortableValue(
					saved?.vendorMetadata ||
						source?.vendorMetadata ||
						(rawPayload
							? {
									source: "rawPayload",
									rawVendorPayload: rawPayload,
								}
							: null),
				);
				return {
					vendorUserId,
					employeeNo: saved?.employeeNo || source?.employeeNo || vendorUserId,
					displayName: saved?.displayName || source?.displayName || null,
					userType: saved?.userType || source?.userType || null,
					status: saved?.status || "SOURCE_ONLY",
					validFrom: saved?.validFrom || source?.validFrom || null,
					validTo: saved?.validTo || source?.validTo || null,
					doorRight: saved?.doorRight || source?.doorRight || null,
					accessPlan: saved?.accessPlan || source?.accessPlan || null,
					hrisDeviceUser: saved
						? {
								id: saved.id,
								employeeId: saved.employeeId || null,
								lastSyncedAt: saved.lastSyncedAt || null,
								employee: saved.employee || null,
							}
						: null,
					rawPayload,
					vendorMetadata,
					_rawBiometricSource: {
						rawPayload: saved?.rawPayload || source?.rawPayload || null,
						vendorMetadata: saved?.vendorMetadata || source?.vendorMetadata || null,
					},
				};
			});
			const selected = filterDeviceUserExportRows(rows, {
				selection: options.selection,
				status: options.status,
				query: options.query,
				page: options.page,
				limit: options.limit,
				vendorUserIds: options.vendorUserIds,
			});
			const exportRows = selected.rows;
			const linked = exportRows.filter((row) => row.hrisDeviceUser?.employeeId).length;
			const capabilitySummary = await discoverHikvisionUserExportCapabilities(req, device, {
				includeCards: options.includeCards,
				includeFingerprints: options.includeFingerprints,
				includeFaces: options.includeFaces,
			});
			const rawBiometricPackageRequested =
				Boolean(options.includeFingerprints || options.includeFaces) &&
				options.rawBiometricPackage !== false;
			if (rawBiometricPackageRequested) {
				for (const row of exportRows as any[]) {
					const credentialSummary =
						row.rawPayload?._hrisDeviceMetadata?.credentialSummary ||
						row.vendorMetadata?.credentialSummary ||
						extractHikvisionCredentialSummary(row.rawPayload || {});
					const shouldExportBiometric =
						(options.includeFingerprints &&
							Number(credentialSummary.fingerprintCount || 0) > 0) ||
						(options.includeFaces && Number(credentialSummary.faceCount || 0) > 0);
					const eventPayload = shouldExportBiometric
						? await loadLatestRawBiometricEventPayload({
								organizationId: options.organizationId,
								deviceId: device.id,
								vendorUserId: String(
									row.vendorUserId || row.employeeNo || "",
								).trim(),
							})
						: null;
					const rawCustody = buildRawDeviceUserBiometricCustody({
						row,
						eventPayload,
						includeFingerprints: Boolean(options.includeFingerprints),
						includeFaces: Boolean(options.includeFaces),
					});
					row.rawBiometricCustody = rawCustody;
					if (rawCustody.fingerprint.rawBlobCount || rawCustody.face.rawBlobPresent) {
						rawBiometricExports.push({
							sourceDeviceId: device.id,
							vendorUserId: row.vendorUserId,
							fingerprintStatus: rawCustody.fingerprint.status,
							fingerprintRawBlobCount: rawCustody.fingerprint.rawBlobCount,
							faceStatus: rawCustody.face.status,
							faceRawBlobPresent: rawCustody.face.rawBlobPresent,
							source: eventPayload
								? "device_event_or_device_user_raw_custody"
								: "device_user_raw_custody",
						});
					}
					if (
						rawCustody.fingerprint.status === "missing_raw_blob" ||
						rawCustody.face.status === "missing_raw_blob"
					) {
						rawBiometricExportErrors.push({
							sourceDeviceId: device.id,
							vendorUserId: row.vendorUserId,
							fingerprintStatus: rawCustody.fingerprint.status,
							faceStatus: rawCustody.face.status,
							error: "Reported biometric enrollment exists but no evidenced raw blob is stored",
						});
					}
				}
			}
			exportRows.forEach(compactPortableDeviceUserBiometricMetadata);
			exportDevices.push({
				device: {
					id: device.id,
					name: device.name,
					address: device.address,
					port: device.port,
					protocol: device.protocol,
					model:
						(device.config as any)?.model ||
						(device.config as any)?.deviceModel ||
						null,
					serialNumber:
						(device.config as any)?.serialNumber ||
						(device.config as any)?.serial ||
						null,
				},
				sourceRead,
				capabilities: capabilitySummary,
				summary: {
					totalUsers: exportRows.length,
					readFromDevice: sourceSnapshot.rawUsers.length,
					savedInHris: savedUsers.length,
					linked,
					unlinked: Math.max(exportRows.length - linked, 0),
					selection: selected.selection,
					biometrics: {
						fingerprintCountReported: exportRows.filter(
							(row: any) =>
								Number(
									row.rawPayload?._hrisDeviceMetadata?.credentialSummary
										?.fingerprintCount ||
										row.vendorMetadata?.credentialSummary?.fingerprintCount ||
										0,
								) > 0,
						).length,
						faceCountReported: exportRows.filter(
							(row: any) =>
								Number(
									row.rawPayload?._hrisDeviceMetadata?.credentialSummary
										?.faceCount ||
										row.vendorMetadata?.credentialSummary?.faceCount ||
										0,
								) > 0,
						).length,
					},
					credentialTypes: {
						users: "included",
						hrisLinks: "included",
						cards: capabilitySummary.support.cardExport
							? "supported"
							: "unsupported_or_not_requested",
						fingerprints: capabilitySummary.support.fingerprintExport
							? rawBiometricPackageRequested
								? "raw_blob_package_from_device_user_or_event"
								: "supported_not_requested"
							: "unsupported_or_not_requested",
						faces: capabilitySummary.support.faceImportExport
							? rawBiometricPackageRequested
								? "raw_blob_package_from_device_user_or_event"
								: "supported_not_requested"
							: "unsupported_or_not_requested",
					},
				},
				users: options.includeRecords ? exportRows : [],
			});
		}

		return {
			schemaVersion: DEVICE_USER_EXPORT_SCHEMA_VERSION,
			exportedAt: new Date().toISOString(),
			scope: {
				type: requestedScope,
				deviceId: options.deviceId || null,
				sourceEndpoint: "POST /ISAPI/AccessControl/UserInfo/Search?format=json",
				selection: normalizeDeviceUserExportSelection(options.selection),
				status: options.status || "all",
				query: options.query || "",
				page: options.page || null,
				limit: options.limit || null,
			},
			policy: {
				mutating: false,
				fingerprintTemplateCustody:
					"raw fingerprint/face blobs are exported only when evidenced on DeviceUser or DeviceEvent",
				biometricTransferModes: ["sdkPeerCopy", "rawPackage", "metadataOnly"],
			},
			rawBiometricPackage: {
				present: rawBiometricExports.length > 0,
				requiredForPortableTemplateImport: Boolean(
					options.includeFingerprints || options.includeFaces,
				),
				status:
					rawBiometricExports.length && rawBiometricExportErrors.length
						? "partial_missing_requested_raw_blobs"
						: rawBiometricExports.length
							? "raw_blobs_from_device_user_or_event"
							: rawBiometricExportErrors.length
								? "missing_requested_raw_blobs"
								: "not_created_no_biometric_rows",
				reason: rawBiometricExports.length
					? "Export copied evidenced raw biometric blobs from DeviceUser and, when needed, matching DeviceEvent payloads."
					: "No evidenced raw biometric blobs were available for the selected users.",
				plaintextPolicy: "raw_evidenced_blobs_allowed_for_admin_device_user_sync_package",
				users: rawBiometricExports,
				errors: rawBiometricExportErrors,
			},
			devices: exportDevices,
			summary: {
				devices: exportDevices.length,
				totalUsers: exportDevices.reduce((sum, item) => sum + item.summary.totalUsers, 0),
				linked: exportDevices.reduce((sum, item) => sum + item.summary.linked, 0),
				unlinked: exportDevices.reduce((sum, item) => sum + item.summary.unlinked, 0),
				biometrics: {
					fingerprintCountReported: exportDevices.reduce(
						(sum, item) =>
							sum + Number(item.summary.biometrics.fingerprintCountReported || 0),
						0,
					),
					fingerprintRawBlobsCaptured: rawBiometricExports.filter(
						(item) => Number(item.fingerprintRawBlobCount || 0) > 0,
					).length,
					faceCountReported: exportDevices.reduce(
						(sum, item) => sum + Number(item.summary.biometrics.faceCountReported || 0),
						0,
					),
					faceRawBlobsCaptured: rawBiometricExports.filter(
						(item) => item.faceRawBlobPresent,
					).length,
					captureFailures: rawBiometricExportErrors.length,
					portableRawPackageReady:
						rawBiometricExports.length > 0 && rawBiometricExportErrors.length === 0,
				},
			},
		};
	};

	const previewDeviceUserExport = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const body = (req.body || {}) as Record<string, any>;
			const payload = await buildDeviceUserExportPayload(req, {
				organizationId: gate.organizationId,
				deviceId: String(body.deviceId || body.targetDeviceId || "").trim(),
				scope:
					body.scope === "allHikvisionDevices" ? "allHikvisionDevices" : "currentDevice",
				includeRecords: false,
				includeCards: body.includeCards === true,
				includeFingerprints: body.includeFingerprints === true,
				includeFaces: body.includeFaces === true,
				rawBiometricPackage: body.rawBiometricPackage !== false,
				refreshSourceUsers: body.refreshSourceUsers === true,
				selection: body.selection,
				status: body.status,
				query: body.query,
				page: Number(body.page || 0) || undefined,
				limit: Number(body.limit || 0) || undefined,
				vendorUserIds: normalizeDeviceUserExportVendorIds(body.vendorUserIds),
			});
			res.status(200).json(
				buildSuccessResponse("Device user export preview built", payload, 200),
			);
		} catch (error: any) {
			const status = Number(error?.status || 500);
			res.status(status).json(
				buildErrorResponse(
					error?.message || "Failed to preview device user export",
					status,
				),
			);
		}
	};

	const exportDeviceUsers = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const body = (req.body || {}) as Record<string, any>;
			const payload = await buildDeviceUserExportPayload(req, {
				organizationId: gate.organizationId,
				deviceId: String(body.deviceId || body.targetDeviceId || "").trim(),
				scope:
					body.scope === "allHikvisionDevices" ? "allHikvisionDevices" : "currentDevice",
				includeRecords: true,
				includeCards: body.includeCards === true,
				includeFingerprints: body.includeFingerprints === true,
				includeFaces: body.includeFaces === true,
				rawBiometricPackage: body.rawBiometricPackage !== false,
				refreshSourceUsers: body.refreshSourceUsers === true,
				selection: body.selection,
				status: body.status,
				query: body.query,
				page: Number(body.page || 0) || undefined,
				limit: Number(body.limit || 0) || undefined,
				vendorUserIds: normalizeDeviceUserExportVendorIds(body.vendorUserIds),
			});
			res.status(200).json(buildSuccessResponse("Device users exported", payload, 200));
		} catch (error: any) {
			const status = Number(error?.status || 500);
			res.status(status).json(
				buildErrorResponse(error?.message || "Failed to export device users", status),
			);
		}
	};

	const backfillDeviceUserBiometricMetadata = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		const startedAt = Date.now();
		try {
			const body = (req.body || {}) as Record<string, any>;
			const deviceId = String(req.params.id || body.deviceId || "").trim();
			const execute = body.execute === true;
			const limit = Math.min(Math.max(Number(body.limit || 25), 1), 200);
			const device = await getDeviceForUserSync(gate.organizationId, deviceId);
			if (!device || !isHikvisionDevice(device)) {
				res.status(400).json(
					buildErrorResponse(
						"Select a Hikvision device before biometric metadata backfill",
						400,
					),
				);
				return;
			}
			const savedUsers = await loadDeviceUsersForExport(gate.organizationId, device.id);
			const selected = filterDeviceUserExportRows(savedUsers, {
				selection: body.selection || (body.vendorUserIds ? "selectedRows" : "all"),
				status: body.status || "all",
				query: body.query || "",
				page: Number(body.page || 0) || undefined,
				limit,
				vendorUserIds: normalizeDeviceUserExportVendorIds(body.vendorUserIds),
			});
			const candidates = selected.rows.slice(0, limit);
			const results = [];
			for (const row of candidates as any[]) {
				const credentialSummary =
					row.rawPayload?._hrisDeviceMetadata?.credentialSummary ||
					row.vendorMetadata?.credentialSummary ||
					extractHikvisionCredentialSummary(row.rawPayload || {});
				const hasCredential =
					(body.includeFingerprints !== false &&
						Number(credentialSummary.fingerprintCount || 0) > 0) ||
					(body.includeFaces === true && Number(credentialSummary.faceCount || 0) > 0);
				const cachedTemplates = parseCachedDeviceUserBiometricTemplates(row);
				const fingerprintCount = Number(credentialSummary.fingerprintCount || 0);
				const faceCount = Number(credentialSummary.faceCount || 0);
				const cachedFingerprint =
					cachedTemplates.fingerprint ||
					(fingerprintCount > 0 && faceCount === 0 ? cachedTemplates.legacy : null);
				const cachedFace =
					cachedTemplates.face ||
					(faceCount > 0 && fingerprintCount === 0 ? cachedTemplates.legacy : null);
				const requestedFingerprint =
					body.includeFingerprints !== false && fingerprintCount > 0;
				const requestedFace = body.includeFaces === true && faceCount > 0;
				const requestedModalitiesCached =
					(!requestedFingerprint || Boolean(cachedFingerprint)) &&
					(!requestedFace || Boolean(cachedFace));
				const eventSummary = await summarizeDeviceUserBiometricEvents({
					organizationId: gate.organizationId,
					deviceId: device.id,
					deviceUserId: row.hrisDeviceUser?.id || row.id || null,
					employeeNo: String(row.employeeNo || row.vendorUserId || "").trim(),
				});
				if (!hasCredential) {
					results.push({
						vendorUserId: row.vendorUserId,
						employeeNo: row.employeeNo,
						status: "skipped_no_biometric_count",
						cached: Boolean(cachedFingerprint || cachedFace),
						credentialSummary,
						relatedEvents: eventSummary,
					});
					continue;
				}
				if (requestedModalitiesCached && body.refreshBiometricBundle !== true) {
					results.push({
						vendorUserId: row.vendorUserId,
						employeeNo: row.employeeNo,
						status: "already_cached",
						cached: true,
						fingerprintPlaintextSha256: cachedFingerprint?.plaintextSha256 || null,
						fingerprintCiphertextLength: String(cachedFingerprint?.ciphertext || "")
							.length,
						fingerprintKeySource: cachedFingerprint?.keySource || null,
						facePlaintextSha256: cachedFace?.plaintextSha256 || null,
						faceCiphertextLength: String(cachedFace?.ciphertext || "").length,
						faceKeySource: cachedFace?.keySource || null,
						credentialSummary,
						relatedEvents: eventSummary,
					});
					continue;
				}
				if (!execute) {
					results.push({
						vendorUserId: row.vendorUserId,
						employeeNo: row.employeeNo,
						status:
							cachedFingerprint || cachedFace ? "would_refresh" : "would_backfill",
						cached: Boolean(cachedFingerprint || cachedFace),
						credentialSummary,
						relatedEvents: eventSummary,
					});
					continue;
				}
				try {
					const useIsapiFacePhoto =
						body.preferIsapiFacePhoto === true &&
						body.includeFaces === true &&
						body.includeFingerprints === false;
					const biometricExport = useIsapiFacePhoto
						? await captureDeviceUserFacePhotoForEncryptedCustody({
								req,
								device,
								row,
								organizationId: gate.organizationId,
								vendorUserId: String(
									row.vendorUserId || row.employeeNo || "",
								).trim(),
							})
						: await runHikvisionBiometricExportOnVm({
								device,
								organizationId: gate.organizationId,
								vendorUserId: String(
									row.vendorUserId || row.employeeNo || "",
								).trim(),
								includeFingerprints: body.includeFingerprints !== false,
								includeFaces: body.includeFaces === true,
							});
					const metadata = buildDeviceUserBiometricMetadata(
						biometricExport,
						useIsapiFacePhoto
							? "hikvision_isapi_face_photo_backfill"
							: "hikvision_sdk_biometric_metadata_backfill",
					);
					(metadata.rawPayloadMetadata as any).relatedEnrollmentEvents = eventSummary;
					(metadata.vendorMetadata as any).relatedEnrollmentEventCount =
						eventSummary.length;
					applyDeviceUserBiometricMetadataToRow(row, metadata);
					const updated = await persistDeviceUserBiometricMetadata({
						organizationId: gate.organizationId,
						deviceId: device.id,
						vendorUserId: String(row.vendorUserId || row.employeeNo || "").trim(),
						row,
					});
					results.push({
						vendorUserId: row.vendorUserId,
						employeeNo: row.employeeNo,
						status: useIsapiFacePhoto
							? "cached_from_hikvision_isapi_face_photo"
							: "cached_from_hikvision_sdk",
						deviceUserId: updated?.id || row.hrisDeviceUser?.id || row.id || null,
						fingerprintCount: biometricExport.fingerprintCount,
						faceTemplateSize: biometricExport.faceTemplateSize,
						facePictureSize: biometricExport.facePictureSize,
						fingerprintPlaintextSha256:
							biometricExport.encryptedFingerprint?.plaintextSha256 || null,
						fingerprintCiphertextLength: String(
							biometricExport.encryptedFingerprint?.ciphertext || "",
						).length,
						fingerprintKeySource:
							biometricExport.encryptedFingerprint?.keySource || null,
						facePlaintextSha256: biometricExport.encryptedFace?.plaintextSha256 || null,
						faceCiphertextLength: String(
							biometricExport.encryptedFace?.ciphertext || "",
						).length,
						faceKeySource: biometricExport.encryptedFace?.keySource || null,
						relatedEvents: eventSummary,
					});
				} catch (error: any) {
					if (body.includeFaces === true && body.includeFingerprints === false) {
						try {
							const biometricExport =
								await captureDeviceUserFacePhotoForEncryptedCustody({
									req,
									device,
									row,
									organizationId: gate.organizationId,
									vendorUserId: String(
										row.vendorUserId || row.employeeNo || "",
									).trim(),
								});
							const metadata = buildDeviceUserBiometricMetadata(
								biometricExport,
								"hikvision_isapi_face_photo_fallback",
							);
							applyDeviceUserBiometricMetadataToRow(row, metadata);
							const updated = await persistDeviceUserBiometricMetadata({
								organizationId: gate.organizationId,
								deviceId: device.id,
								vendorUserId: String(
									row.vendorUserId || row.employeeNo || "",
								).trim(),
								row,
							});
							results.push({
								vendorUserId: row.vendorUserId,
								employeeNo: row.employeeNo,
								status: "cached_from_hikvision_isapi_face_photo",
								deviceUserId:
									updated?.id || row.hrisDeviceUser?.id || row.id || null,
								faceTemplateSize: 0,
								facePictureSize: biometricExport.facePictureSize,
								facePlaintextSha256:
									biometricExport.encryptedFace?.plaintextSha256 || null,
								faceCiphertextLength: String(
									biometricExport.encryptedFace?.ciphertext || "",
								).length,
								faceKeySource: biometricExport.encryptedFace?.keySource || null,
								sdkError: error?.message || "SDK face template read failed",
								relatedEvents: eventSummary,
							});
							continue;
						} catch (fallbackError: any) {
							error = new Error(
								`${error?.message || "SDK face template read failed"}; ISAPI face photo fallback failed: ${fallbackError?.message || "unknown error"}`,
							);
						}
					}
					results.push({
						vendorUserId: row.vendorUserId,
						employeeNo: row.employeeNo,
						status: "failed",
						error: error?.message || "Biometric metadata backfill failed",
						credentialSummary,
						relatedEvents: eventSummary,
					});
				}
			}
			await invalidateCache.byPattern("cache:device:*").catch(() => undefined);
			const data = {
				execute,
				device: {
					id: device.id,
					name: device.name,
					address: device.address,
					port: device.port,
				},
				selection: selected.selection,
				elapsedMs: Date.now() - startedAt,
				counts: {
					candidates: candidates.length,
					cached: results.filter((row: any) =>
						[
							"cached_from_hikvision_sdk",
							"cached_from_hikvision_isapi_face_photo",
							"already_cached",
						].includes(row.status),
					).length,
					failed: results.filter((row: any) => row.status === "failed").length,
					skipped: results.filter((row: any) => String(row.status).startsWith("skipped"))
						.length,
				},
				plaintextBiometricExposed: false,
				results,
			};
			res.status(200).json(
				buildSuccessResponse(
					execute
						? "Device user biometric metadata backfill executed"
						: "Device user biometric metadata backfill preview built",
					data,
					200,
				),
			);
		} catch (error: any) {
			const status = Number(error?.status || 500);
			res.status(status).json(
				buildErrorResponse(
					error?.message || "Failed to backfill device user biometric metadata",
					status,
				),
			);
		}
	};

	const getImportPayloadFromRequest = (body: Record<string, any>) => {
		const payload = body.exportFile || body.importFile || body.payload || body;
		return payload && typeof payload === "object" ? payload : null;
	};

	const previewDeviceUserImport = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const body = (req.body || {}) as Record<string, any>;
			const payload = getImportPayloadFromRequest(body);
			const targetDeviceId = String(body.targetDeviceId || body.deviceId || "").trim();
			if (!payload || payload.schemaVersion !== DEVICE_USER_EXPORT_SCHEMA_VERSION) {
				res.status(400).json(
					buildErrorResponse(
						"Import file schema is not a supported device-user export",
						400,
					),
				);
				return;
			}
			const targetDevice = await getDeviceForUserSync(gate.organizationId, targetDeviceId);
			if (!targetDevice || !isHikvisionDevice(targetDevice)) {
				res.status(400).json(
					buildErrorResponse(
						"Select a Hikvision target device before import preview",
						400,
					),
				);
				return;
			}
			const importedUsers = (Array.isArray(payload.devices) ? payload.devices : []).flatMap(
				(device: any) =>
					(Array.isArray(device?.users) ? device.users : []).map((user: any) => ({
						...user,
						sourceDeviceId: device?.device?.id || null,
						sourceDeviceName: device?.device?.name || null,
					})),
			);
			const currentUsers = await loadDeviceUsersForExport(
				gate.organizationId,
				targetDevice.id,
			);
			const currentByVendorUserId = new Map(
				currentUsers.map((user: any) => [String(user.vendorUserId || "").trim(), user]),
			);
			const importedEmployeeNos: string[] = Array.from(
				new Set<string>(
					importedUsers
						.map((user: any) =>
							String(user.employeeNo || user.vendorUserId || "").trim(),
						)
						.filter(Boolean),
				),
			);
			const employees = importedEmployeeNos.length
				? await prisma.employee.findMany({
						where: {
							organizationId: gate.organizationId,
							isDeleted: false,
							OR: [
								{ employeeId: { in: importedEmployeeNos } },
								{ deviceEmpId: { in: importedEmployeeNos } },
							],
						},
						select: { id: true, employeeId: true, deviceEmpId: true },
					})
				: [];
			const employeeKeys = new Set(
				employees.flatMap((employee) => [
					String(employee.employeeId || "").trim(),
					String(employee.deviceEmpId || "").trim(),
				]),
			);
			const planRows = importedUsers.map((user: any) => {
				const vendorUserId = String(user.vendorUserId || "").trim();
				const current = currentByVendorUserId.get(vendorUserId) as any;
				const employeeNo = String(user.employeeNo || vendorUserId).trim();
				const conflictFields = current
					? (["displayName", "employeeNo", "userType"] as const).filter(
							(field) =>
								String(current?.[field] || "").trim() !==
								String(user?.[field] || "").trim(),
						)
					: [];
				return {
					vendorUserId,
					employeeNo,
					sourceDeviceId: user.sourceDeviceId,
					sourceDeviceName: user.sourceDeviceName,
					action: current
						? conflictFields.length
							? "review_conflict"
							: "match"
						: "create_preview",
					conflictFields,
					missingEmployee: employeeNo ? !employeeKeys.has(employeeNo) : true,
					currentDeviceUserId: current?.id || null,
					credentialGap: {
						card: false,
						fingerprint: false,
						face: false,
					},
					transferMode:
						user.sourceDeviceId && user.sourceDeviceId !== targetDevice.id
							? "sdkPeerCopy"
							: payload?.rawBiometricPackage?.present || user?.rawBiometricCustody
								? "rawPackage"
								: "metadataOnly",
				};
			});
			const unsupportedCredentialTypes = Array.from(
				new Set(
					(Array.isArray(payload.devices) ? payload.devices : []).flatMap((device: any) =>
						Object.entries(device?.summary?.credentialTypes || {})
							.filter(
								([, value]) =>
									String(value).includes("blocked") ||
									String(value).includes("unsupported"),
							)
							.map(([key]) => key),
					),
				),
			);
			if (importedUsers.some(hasForbiddenBiometricBlobPlaceholder)) {
				res.status(400).json(
					buildErrorResponse(
						"Import contains a policy placeholder in a biometric payload column; use an empty value or an evidenced raw biometric blob",
						400,
					),
				);
				return;
			}
			const rawFingerprintBlobCount = importedUsers.reduce(
				(sum: number, user: any) =>
					sum + Number(user?.rawBiometricCustody?.fingerprint?.templates?.length || 0),
				0,
			);
			const rawFaceBlobCount = importedUsers.filter(
				(user: any) => user?.rawBiometricCustody?.face?.blob,
			).length;
			const preview = {
				execute: false,
				dryRun: true,
				targetDevice: {
					id: targetDevice.id,
					name: targetDevice.name,
					address: targetDevice.address,
					port: targetDevice.port,
				},
				file: {
					schemaVersion: payload.schemaVersion,
					exportedAt: payload.exportedAt || null,
					sourceDevices: Array.isArray(payload.devices) ? payload.devices.length : 0,
					users: importedUsers.length,
				},
				counts: {
					newUsers: planRows.filter((row: any) => row.action === "create_preview").length,
					matchingUsers: planRows.filter((row: any) => row.action === "match").length,
					conflicts: planRows.filter((row: any) => row.action === "review_conflict")
						.length,
					missingHrisEmployees: planRows.filter((row: any) => row.missingEmployee).length,
				},
				unsupportedCredentialTypes,
				rawBiometricPackage: {
					present: Boolean(
						payload?.rawBiometricPackage?.present ||
						rawFingerprintBlobCount ||
						rawFaceBlobCount,
					),
					requiredForPortableTemplateImport: Boolean(
						payload?.rawBiometricPackage?.requiredForPortableTemplateImport,
					),
					status: payload?.rawBiometricPackage?.status || "not_present",
					rawFingerprintBlobCount,
					rawFaceBlobCount,
					plaintextExposed: Boolean(rawFingerprintBlobCount || rawFaceBlobCount),
					transferModes: Array.from(
						new Set(planRows.map((row: any) => row.transferMode).filter(Boolean)),
					),
				},
				previewToken: buildDeviceUserImportPreviewToken({
					organizationId: gate.organizationId,
					targetDeviceId: targetDevice.id,
					payload,
					planRows,
				}),
				plan: planRows.slice(0, 500),
				executeAvailable: planRows.length > 0,
				executeBlockedReason:
					planRows.length > 0
						? null
						: "Import file contains no users for the selected target.",
				executeRequirements: [
					`confirmation="${DEVICE_USER_IMPORT_CONFIRMATION}"`,
					"previewToken from this preview response",
					"biometricTransferMode=sdkPeerCopy, rawPackage, or metadataOnly",
					"additive create/update only",
				],
			};
			res.status(200).json(
				buildSuccessResponse("Device user import preview built", preview, 200),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to preview device user import", 500),
			);
		}
	};

	const deviceUserImportRequestError = (message: string, statusCode = 400) =>
		Object.assign(new Error(message), { statusCode });

	const runDeviceUserImportExecuteWork = async (params: {
		req: Request;
		gate: { organizationId: string };
		body: Record<string, any>;
		jobId?: string;
	}) => {
		const { req, gate, body, jobId } = params;
		const payload = getImportPayloadFromRequest(body);
		const targetDeviceId = String(body.targetDeviceId || body.deviceId || "").trim();
		const previewToken = String(body.previewToken || "").trim();
		const biometricTransferMode = String(body.biometricTransferMode || "sdkPeerCopy").trim();

		if (!payload || payload.schemaVersion !== DEVICE_USER_EXPORT_SCHEMA_VERSION) {
			throw deviceUserImportRequestError(
				"Import file schema is not a supported device-user export",
			);
		}
		const targetDevice = await getDeviceForUserSync(gate.organizationId, targetDeviceId);
		if (!targetDevice || !isHikvisionDevice(targetDevice)) {
			throw deviceUserImportRequestError(
				"Select a Hikvision target device before import execute",
			);
		}

		const importedUsers = (Array.isArray(payload.devices) ? payload.devices : []).flatMap(
			(device: any) =>
				(Array.isArray(device?.users) ? device.users : []).map((user: any) => ({
					...user,
					sourceDeviceId: device?.device?.id || user?.sourceDeviceId || null,
					sourceDeviceName: device?.device?.name || user?.sourceDeviceName || null,
				})),
		);
		const currentUsers = await loadDeviceUsersForExport(gate.organizationId, targetDevice.id);
		const currentByVendorUserId = new Map(
			currentUsers.map((user: any) => [String(user.vendorUserId || "").trim(), user]),
		);
		const planRows = importedUsers.map((user: any) => {
			const vendorUserId = String(user.vendorUserId || "").trim();
			const current = currentByVendorUserId.get(vendorUserId) as any;
			const conflictFields = current
				? (["displayName", "employeeNo", "userType"] as const).filter(
						(field) =>
							String(current?.[field] || "").trim() !==
							String(user?.[field] || "").trim(),
					)
				: [];
			return {
				vendorUserId,
				employeeNo: String(user.employeeNo || vendorUserId).trim(),
				sourceDeviceId: user.sourceDeviceId || null,
				sourceDeviceName: user.sourceDeviceName || null,
				action: current
					? conflictFields.length
						? "review_conflict"
						: "match"
					: "create_preview",
				conflictFields,
				currentDeviceUserId: current?.id || null,
				rawUser: user,
			};
		});
		const expectedPreviewToken = buildDeviceUserImportPreviewToken({
			organizationId: gate.organizationId,
			targetDeviceId: targetDevice.id,
			payload,
			planRows,
		});
		if (!previewToken || previewToken !== expectedPreviewToken) {
			throw deviceUserImportRequestError(
				"Import execute requires a fresh previewToken from import preview",
			);
		}
		if (!["sdkPeerCopy", "metadataOnly", "rawPackage"].includes(biometricTransferMode)) {
			throw deviceUserImportRequestError("Unsupported biometric transfer mode");
		}

		if (jobId) {
			updateDeviceUserPackageImportJob(jobId, {
				targetDeviceId: targetDevice.id,
				targetDeviceName: targetDevice.name || targetDevice.id,
				planned: planRows.length,
				message: `Importing ${planRows.length} device users to ${targetDevice.name || targetDevice.id}`,
			});
		}

		const backupDir = path.join(
			process.cwd(),
			"..",
			".runtime",
			"backups",
			`device-user-import-${new Date().toISOString().replace(/[:.]/g, "-")}`,
		);
		await fs.mkdir(backupDir, { recursive: true });
		await Promise.all([
			writeJsonFile(path.join(backupDir, "target-device-users-before.json"), currentUsers),
			writeJsonFile(
				path.join(backupDir, "import-package-manifest.json"),
				sanitizeDeviceUserImportPayloadForBackup(payload),
			),
			writeJsonFile(path.join(backupDir, "plan.json"), {
				targetDeviceId: targetDevice.id,
				previewToken,
				biometricTransferMode,
				rows: planRows.map(
					({ rawUser: _rawUser, ...row }: { rawUser?: unknown } & Record<string, any>) =>
						row,
				),
			}),
		]);

		const devices = await prisma.device.findMany({
			where: {
				organizationId: gate.organizationId,
				isDeleted: false,
				id: {
					in: Array.from(
						new Set(
							planRows
								.map((row: any) => row.sourceDeviceId)
								.concat(targetDevice.id)
								.filter(Boolean),
						),
					),
				},
			},
		});
		const deviceById = new Map(devices.map((device) => [device.id, device]));
		const results = [];
		for (const row of planRows) {
			if (!row.vendorUserId) {
				results.push(
					buildDeviceUserImportResultRow(row, {
						status: "skipped",
						error: "Missing vendor user ID",
					}),
				);
			} else if (row.conflictFields.length > 0) {
				results.push(
					buildDeviceUserImportResultRow(row, {
						status: "skipped_conflict",
						error: "Conflict requires manual review before additive import",
					}),
				);
			} else if (
				biometricTransferMode === "sdkPeerCopy" &&
				row.sourceDeviceId &&
				row.sourceDeviceId !== targetDevice.id
			) {
				const sourceDevice = deviceById.get(row.sourceDeviceId);
				if (!sourceDevice || !isHikvisionDevice(sourceDevice)) {
					results.push(
						buildDeviceUserImportResultRow(row, {
							status: "failed",
							error: "Source Hikvision device was not found for SDK peer copy",
						}),
					);
				} else {
					try {
						const copyData = await withDeviceUserImportTimeout(
							copyHikvisionUserToPeerWithRetry({
								req,
								organizationId: gate.organizationId,
								sourceDevice,
								targetDevice,
								employeeNo: row.vendorUserId,
								includeFingerprints: true,
								includeFaceRecognition: true,
							}),
							DEVICE_USER_IMPORT_ROW_TIMEOUT_MS,
							`Timed out copying device user ${row.vendorUserId} after ${DEVICE_USER_IMPORT_ROW_TIMEOUT_MS}ms`,
						);
						results.push(
							buildDeviceUserImportResultRow(row, {
								status: "imported",
								method: "sdkPeerCopy",
								vmCopy: copyData.vmCopy,
								targetSyncSummary: copyData.targetSyncSummary,
								targetDeviceUser: summarizeDeviceUserImportTarget(
									copyData.targetDeviceUser,
								),
							}),
						);
					} catch (error: any) {
						const copyErrorMessage = String(error?.message || "");
						const skipDelayedReread = /(timed out|timeout|Process timed out)/i.test(
							copyErrorMessage,
						);
						const delayedCopy = skipDelayedReread
							? null
							: await withDeviceUserImportTimeout(
									waitForDelayedHikvisionPeerCopy({
										req,
										organizationId: gate.organizationId,
										targetDevice,
										employeeNo: row.vendorUserId,
									}),
									Math.min(
										HIKVISION_PEER_COPY_COMPLETION_WAIT_MS + 10000,
										DEVICE_USER_IMPORT_ROW_TIMEOUT_MS,
									),
									`Timed out waiting for target device ${targetDevice.name || targetDevice.id} to report copied user ${row.vendorUserId}`,
								).catch(() => null);
						if ((delayedCopy as any)?.targetDeviceUser?.id) {
							results.push(
								buildDeviceUserImportResultRow(row, {
									status: "imported",
									method: "sdkPeerCopy",
									vmCopy: {
										strategy: "delayed_target_reread",
										warning:
											error?.message ||
											"SDK peer copy completed after wrapper response",
										attempts: (delayedCopy as any).attempts,
										waitedMs: (delayedCopy as any).waitedMs,
									},
									targetSyncSummary: (delayedCopy as any).targetSyncSummary,
									targetDeviceUser: summarizeDeviceUserImportTarget(
										(delayedCopy as any).targetDeviceUser,
									),
								}),
							);
						} else {
							results.push(
								buildDeviceUserImportResultRow(row, {
									status: "failed",
									method: "sdkPeerCopy",
									error: error?.message || "SDK peer copy failed",
									targetSyncSummary:
										(delayedCopy as any)?.targetSyncSummary || null,
								}),
							);
						}
					}
				}
			} else if (biometricTransferMode === "rawPackage") {
				const rawCustody = row.rawUser?.rawBiometricCustody || {};
				const fingerprints = normalizeRawPackageFingerprintTemplates(row.rawUser);
				const face = rawCustody?.face?.blob || null;
				if (!fingerprints.length && !face) {
					results.push(
						buildDeviceUserImportResultRow(row, {
							status: "failed",
							method: "rawPackage",
							error: "No raw biometric blob was found on this import row",
						}),
					);
				} else {
					try {
						const rawPayload = {
							fingerprints,
							faceTemplate: face?.faceTemplate || null,
							facePicture: face?.base64 || face?.facePicture || null,
						};
						const writeResult = await writeDecryptedBiometricBundleToHikvisionDevice({
							req,
							targetDevice,
							employeeNo: row.employeeNo || row.vendorUserId,
							decrypted: rawPayload,
						});
						results.push(
							buildDeviceUserImportResultRow(row, {
								status:
									writeResult.fingerprintWriteCount > 0
										? "imported"
										: "raw_package_ready",
								method: "rawPackage",
								error:
									writeResult.fingerprintWriteCount > 0
										? null
										: "Raw biometric package was readable, but no writable fingerprint template was present.",
								rawBiometricPackage: {
									fingerprintCount: fingerprints.length,
									faceTemplatePresent: Boolean(rawPayload.faceTemplate),
									facePicturePresent: Boolean(rawPayload.facePicture),
									writeResult,
								},
							}),
						);
					} catch (error: any) {
						results.push(
							buildDeviceUserImportResultRow(row, {
								status: "failed",
								method: "rawPackage",
								error:
									error?.message ||
									"Raw biometric package could not be written to the target device",
							}),
						);
					}
				}
			} else {
				results.push(
					buildDeviceUserImportResultRow(row, {
						status: row.currentDeviceUserId
							? "matched_metadata_only"
							: "skipped_no_source_copy",
						method: "metadataOnly",
						error: row.currentDeviceUserId
							? null
							: "No source copy was selected; use SDK peer copy or rawPackage when biometric blobs are present.",
					}),
				);
			}

			if (jobId) {
				const imported = results.filter((item: any) => item.status === "imported").length;
				const failed = results.filter((item: any) => item.status === "failed").length;
				updateDeviceUserPackageImportJob(jobId, {
					imported,
					failed,
					skipped: results.length - imported - failed,
					message: `Processed ${results.length} of ${planRows.length} device users`,
					results,
				});
			}
		}

		const targetAfter = await loadDeviceUsersForExport(gate.organizationId, targetDevice.id);
		await writeJsonFile(path.join(backupDir, "target-device-users-after.json"), targetAfter);
		const imported = results.filter((row: any) => row.status === "imported").length;
		const failed = results.filter((row: any) => row.status === "failed").length;
		const skipped = results.length - imported - failed;

		logActivity(req, {
			userId: String((req as any).userId || "unknown"),
			action: "DEVICE_USER_IMPORT_EXECUTE",
			description: `Imported ${imported} device users to ${targetDevice.name || targetDevice.id}`,
			page: { url: req.originalUrl, title: "Device Users" },
		});

		const message =
			failed > 0 && imported === 0
				? "Device-user import could not write target users"
				: "Device-user import executed";
		return {
			message,
			data: {
				mode: jobId ? "job" : "executed",
				jobId: jobId || null,
				targetDevice: {
					id: targetDevice.id,
					name: targetDevice.name,
					address: targetDevice.address,
					port: targetDevice.port,
				},
				backupDir,
				biometricTransferMode,
				plaintextBiometricExposed: biometricTransferMode === "rawPackage",
				counts: {
					planned: planRows.length,
					imported,
					failed,
					skipped,
					targetUsersAfter: targetAfter.length,
				},
				results,
			},
		};
	};

	const executeDeviceUserImport = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		const body = (req.body || {}) as Record<string, any>;
		if (body.execute !== true || body.confirmation !== DEVICE_USER_IMPORT_CONFIRMATION) {
			res.status(400).json(
				buildErrorResponse(
					`Import execute requires execute=true and confirmation="${DEVICE_USER_IMPORT_CONFIRMATION}"`,
					400,
				),
			);
			return;
		}

		const runAsJob =
			body.runAsJob === true || body.jobMode === "background" || body.async === true;
		if (runAsJob) {
			cleanupDeviceUserPackageImportJobs();
			const jobId = randomUUID();
			const job: DeviceUserPackageImportJob = {
				jobId,
				status: "processing",
				organizationId: gate.organizationId,
				targetDeviceId: String(body.targetDeviceId || body.deviceId || "").trim() || null,
				planned: 0,
				imported: 0,
				failed: 0,
				skipped: 0,
				message: "Device-user import job queued",
				plaintextBiometricExposed: false,
				results: [],
				startedAt: new Date(),
			};
			deviceUserPackageImportJobs.set(jobId, job);
			persistDeviceUserPackageImportJob(job);
			setImmediate(async () => {
				try {
					const result = await runDeviceUserImportExecuteWork({ req, gate, body, jobId });
					const terminalStatus =
						result.data.counts.failed > 0 && result.data.counts.imported === 0
							? "failed"
							: "completed";
					updateDeviceUserPackageImportJob(jobId, {
						status: terminalStatus,
						message: result.message,
						backupDir: result.data.backupDir,
						planned: result.data.counts.planned,
						imported: result.data.counts.imported,
						failed: result.data.counts.failed,
						skipped: result.data.counts.skipped,
						targetDeviceId: result.data.targetDevice.id,
						targetDeviceName:
							result.data.targetDevice.name || result.data.targetDevice.id,
						results: result.data.results,
						completedAt: new Date(),
					});
				} catch (error: any) {
					updateDeviceUserPackageImportJob(jobId, {
						status: "failed",
						message: error?.message || "Device-user import job failed",
						error: error?.message || "Device-user import job failed",
						failed: 1,
						completedAt: new Date(),
					});
					deviceLogger.error(`Device-user import job ${jobId} failed: ${error}`);
				}
			});
			res.status(202).json(
				buildSuccessResponse(
					"Device-user import job accepted",
					{
						mode: "job",
						jobId,
						status: "processing",
						pollUrl: `/api/device/users/import/jobs/${jobId}`,
						plaintextBiometricExposed: false,
						message: "Device-user import is running in the background.",
					},
					202,
				),
			);
			return;
		}

		try {
			const result = await runDeviceUserImportExecuteWork({ req, gate, body });
			res.status(200).json(buildSuccessResponse(result.message, result.data, 200));
		} catch (error: any) {
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(
					error?.message || "Failed to execute device-user import",
					error?.statusCode || 500,
				),
			);
		}
	};

	const getDeviceUserImportJob = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		cleanupDeviceUserPackageImportJobs();
		const jobId = String(req.params.jobId || "").trim();
		let job = deviceUserPackageImportJobs.get(jobId) || readDeviceUserPackageImportJob(jobId);
		if (job && !deviceUserPackageImportJobs.has(jobId) && job.status === "processing") {
			job = {
				...job,
				status: "failed",
				message:
					"Device-user import job was interrupted before completion; rerun from preview.",
				error: "interrupted_by_api_restart",
				failed: Math.max(1, job.failed || 0),
				completedAt: new Date(),
			};
			persistDeviceUserPackageImportJob(job);
		}
		if (!job || job.organizationId !== gate.organizationId) {
			res.status(404).json(buildErrorResponse("Device-user import job was not found", 404));
			return;
		}
		res.status(200).json(
			buildSuccessResponse(
				"Device-user import job retrieved",
				{
					...job,
					plaintextBiometricExposed: false,
				},
				200,
			),
		);
	};

	const reconcileBiometricSync = async (req: Request, res: Response, _next: NextFunction) => {
		let reconcileRunId: string | null = null;
		let reconcileRunOrganizationId: string | null = null;
		let reconcileRunDeviceId: string | null = null;
		let reconcileRunRequestSummary: Record<string, any> | null = null;
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;

			const body = (req.body || {}) as Record<string, any>;
			const execute = body.execute === true;
			const sourceDeviceId = String(body.sourceDeviceId || "").trim();
			const employeeNo = String(body.employeeNo || body.vendorUserId || "").trim();
			const cardNo = String(body.cardNo || "").trim();
			const eventKind = String(body.eventKind || "biometric_reconcile").trim();
			const minor = String(body.minor || "").trim();
			const source = String(body.source || "EN_HCNETSDK_ALARM").trim();
			const sdkTime = String(body.sdkTime || "").trim() || null;
			const fingerprintSummary =
				body.fingerprintSummary && typeof body.fingerprintSummary === "object"
					? body.fingerprintSummary
					: {};
			const allowsSourceWideRefresh =
				!employeeNo &&
				(eventKind === "biometric_operation_sync" ||
					minor.toUpperCase().startsWith("OBSERVED_OPERATION_MINOR_") ||
					String(body.status || "")
						.trim()
						.toLowerCase() === "mirrored");

			if (!sourceDeviceId || (!employeeNo && !allowsSourceWideRefresh)) {
				res.status(400).json(
					buildErrorResponse(
						"sourceDeviceId is required, and employeeNo is required unless this is a source-wide sync reconcile",
						400,
					),
				);
				return;
			}

			const sourceDevice = await prisma.device.findFirst({
				where: {
					id: sourceDeviceId,
					organizationId: String(admin.organizationId),
					isDeleted: false,
				},
				select: {
					id: true,
					organizationId: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
					access: true,
				},
			});
			if (!sourceDevice) {
				res.status(404).json(buildErrorResponse("Source device not found", 404));
				return;
			}

			const peerDeviceIds = Array.isArray(body.peerDeviceIds)
				? body.peerDeviceIds.map((id) => String(id).trim()).filter(Boolean)
				: [];
			const peerDevices = await prisma.device.findMany({
				where: {
					organizationId: String(admin.organizationId),
					isDeleted: false,
					NOT: { id: sourceDevice.id },
					...(peerDeviceIds.length ? { id: { in: peerDeviceIds } } : {}),
				},
				select: { id: true, name: true, address: true, port: true, config: true },
			});
			const biometricPeers = peerDevices.filter((device) => isHikvisionDevice(device));

			const employee = employeeNo
				? await prisma.employee.findFirst({
						where: {
							organizationId: String(admin.organizationId),
							isDeleted: false,
							OR: [{ employeeId: employeeNo }, { deviceEmpId: employeeNo }],
						},
						select: { id: true, employeeId: true, deviceEmpId: true },
					})
				: null;

			const biometricSyncPayload = {
				source,
				eventKind,
				minor,
				sourceDeviceId: sourceDevice.id,
				cardNo: cardNo || null,
				fingerprintTemplateCount: Number(fingerprintSummary.templateCount || 0),
				rawFingerprintTemplateStored: false,
				reconciledAt: new Date().toISOString(),
			};

			const targetDevices = [sourceDevice, ...biometricPeers];
			const plannedChanges = allowsSourceWideRefresh
				? targetDevices.map((device) => ({
						deviceId: device.id,
						deviceName: device.name,
						scope: "all_source_users",
						wouldPersistDeviceUser: true,
						rawFingerprintTemplateStored: false,
					}))
				: targetDevices.map((device) => ({
						deviceId: device.id,
						deviceName: device.name,
						vendorUserId: employeeNo,
						employeeId: employee?.id || null,
						status: employee?.id ? "ACTIVE" : "UNMATCHED",
						wouldPersistDeviceUser: true,
						rawFingerprintTemplateStored: false,
					}));

			if (!execute) {
				res.status(200).json(
					buildSuccessResponse(
						"Biometric sync reconcile dry-run completed",
						{
							execute: false,
							sourceDevice,
							employee,
							plannedChanges,
							biometricSyncPayload,
						},
						200,
					),
				);
				return;
			}

			reconcileRunOrganizationId = String(admin.organizationId);
			reconcileRunDeviceId = sourceDevice.id;
			reconcileRunRequestSummary = {
				kind: "biometric_lifecycle_reconcile",
				sourceDeviceId: sourceDevice.id,
				sourceDeviceName: sourceDevice.name,
				eventKind,
				minor,
				source,
				employeeNo: employeeNo || null,
				cardNo: cardNo || null,
				sdkTime,
				allowsSourceWideRefresh,
				peerDeviceIds: biometricPeers.map((device) => device.id),
				plannedChanges,
				fingerprintSummary,
				rawFingerprintTemplateStored: false,
			};
			const reconcileRun = await createBiometricLifecycleSyncRun({
				organizationId: reconcileRunOrganizationId,
				deviceId: reconcileRunDeviceId,
				startedByUserId: (req as any).userId || null,
				source,
				eventKind,
				minor,
				employeeNo,
				cardNo,
				sourceWideRefresh: allowsSourceWideRefresh,
				targetDeviceCount: targetDevices.length,
			});
			reconcileRunId = reconcileRun?.id || null;

			const runBiometricLifecycleReconcileWork = async () => {
				const persisted = [];
				const refreshResults: Array<Record<string, any>> = [];
				const templateExtractionResults: Array<Record<string, any>> = [];
				let sourceLifecycleBackfillResult: Record<string, any> | null = null;
				let derivedLifecycleEvent: Record<string, any> | null = null;
				for (const device of targetDevices) {
					try {
						const { rawUsers, candidates } = await loadHikvisionDeviceUserSnapshot(
							req,
							device,
						);
						const result = await upsertDeviceUsersFromCandidates({
							organizationId: String(admin.organizationId),
							deviceId: device.id,
							candidates,
							source: "hikvision",
						});
						refreshResults.push({
							deviceId: device.id,
							deviceName: device.name,
							totalSourceRecords: rawUsers.length,
							importableRecords: candidates.length,
							...result,
						});

						if (allowsSourceWideRefresh && device.id === sourceDevice.id) {
							const sourceDeviceUsers = await prisma.deviceUser.findMany({
								where: {
									organizationId: String(admin.organizationId),
									deviceId: device.id,
									vendorUserId: {
										in: candidates.map((candidate) => candidate.vendorUserId),
									},
								},
								select: {
									id: true,
									vendorUserId: true,
									employeeId: true,
									employeeNo: true,
									rawPayload: true,
									lastSyncedAt: true,
								},
							});
							sourceLifecycleBackfillResult =
								await persistDeviceUserLifecycleBackfill({
									organizationId: String(admin.organizationId),
									sourceDevice,
									deviceUsers: sourceDeviceUsers,
									source,
									reason: eventKind,
									execute: true,
									sdkTime,
									minor: minor || "OBSERVED_OPERATION_SYNC",
								});
						}

						if (!allowsSourceWideRefresh && employeeNo) {
							const matchedCandidate = candidates.find(
								(candidate) => candidate.vendorUserId === employeeNo,
							);
							const existing = await prisma.deviceUser.findUnique({
								where: {
									organizationId_deviceId_vendorUserId: {
										organizationId: String(admin.organizationId),
										deviceId: device.id,
										vendorUserId: employeeNo,
									},
								},
								select: {
									id: true,
									rawPayload: true,
									employeeId: true,
									status: true,
									lastSyncedAt: true,
								},
							});
							if (existing) {
								const nextRawPayload = {
									...((existing.rawPayload as any) || {}),
									biometricSync: biometricSyncPayload,
									...(matchedCandidate?.rawPayload &&
									typeof matchedCandidate.rawPayload === "object"
										? {
												_hrisDeviceMetadata: (
													matchedCandidate.rawPayload as any
												)._hrisDeviceMetadata,
											}
										: {}),
								};
								const record = await prisma.deviceUser.update({
									where: { id: existing.id },
									data: {
										rawPayload: nextRawPayload,
										lastSyncedAt: new Date(),
									},
									select: {
										id: true,
										deviceId: true,
										vendorUserId: true,
										employeeId: true,
										status: true,
										lastSyncedAt: true,
										rawPayload: true,
									},
								});
								persisted.push(record);
							}
						}
					} catch (error: any) {
						refreshResults.push({
							deviceId: device.id,
							deviceName: device.name,
							error: error?.message || "device_user_refresh_failed",
						});
					}
				}

				if (!allowsSourceWideRefresh && employeeNo) {
					const sourceDeviceUser = await prisma.deviceUser.findUnique({
						where: {
							organizationId_deviceId_vendorUserId: {
								organizationId: String(admin.organizationId),
								deviceId: sourceDevice.id,
								vendorUserId: employeeNo,
							},
						},
					});
					derivedLifecycleEvent = await persistDerivedBiometricLifecycleEvent({
						req,
						organizationId: String(admin.organizationId),
						sourceDevice,
						employeeNo,
						eventKind,
						minor,
						source,
						sdkTime,
						fingerprintSummary,
						deviceUser: sourceDeviceUser,
					});
					if (sourceDeviceUser) {
						const credentialSummary =
							(sourceDeviceUser.rawPayload as any)?._hrisDeviceMetadata
								?.credentialSummary ||
							(sourceDeviceUser.vendorMetadata as any)?.credentialSummary ||
							{};
						const cached = parseCachedDeviceUserBiometricTemplates(sourceDeviceUser);
						const plans = [
							{
								modality: "fingerprint" as const,
								needed:
									Number(credentialSummary.fingerprintCount || 0) > 0 &&
									!cached.fingerprint,
							},
							{
								modality: "face" as const,
								needed:
									Number(credentialSummary.faceCount || 0) > 0 && !cached.face,
							},
						];
						for (const plan of plans.filter((item) => item.needed)) {
							try {
								const biometricExport = await runHikvisionBiometricExportOnVm({
									device: sourceDevice,
									organizationId: String(admin.organizationId),
									vendorUserId: employeeNo,
									includeFingerprints: plan.modality === "fingerprint",
									includeFaces: plan.modality === "face",
								});
								const metadata = buildDeviceUserBiometricMetadata(
									biometricExport,
									"hikvision_enrollment_extraction_queue",
								);
								applyDeviceUserBiometricMetadataToRow(sourceDeviceUser, metadata);
								await persistDeviceUserBiometricMetadata({
									organizationId: String(admin.organizationId),
									deviceId: sourceDevice.id,
									vendorUserId: employeeNo,
									row: sourceDeviceUser,
								});
								const encrypted =
									plan.modality === "fingerprint"
										? biometricExport.encryptedFingerprint
										: biometricExport.encryptedFace;
								templateExtractionResults.push({
									vendorUserId: employeeNo,
									modality: plan.modality,
									status: encrypted
										? "encrypted_envelope_persisted"
										: "sdk_returned_no_bytes",
									ciphertextLength: String(encrypted?.ciphertext || "").length,
								});
							} catch (error: any) {
								if (plan.modality === "face") {
									try {
										const fallback =
											await captureDeviceUserFacePhotoForEncryptedCustody({
												req,
												device: sourceDevice,
												row: sourceDeviceUser,
												organizationId: String(admin.organizationId),
												vendorUserId: employeeNo,
											});
										const metadata = buildDeviceUserBiometricMetadata(
											fallback,
											"hikvision_enrollment_isapi_face_photo_fallback",
										);
										applyDeviceUserBiometricMetadataToRow(
											sourceDeviceUser,
											metadata,
										);
										await persistDeviceUserBiometricMetadata({
											organizationId: String(admin.organizationId),
											deviceId: sourceDevice.id,
											vendorUserId: employeeNo,
											row: sourceDeviceUser,
										});
										templateExtractionResults.push({
											vendorUserId: employeeNo,
											modality: "face",
											status: "encrypted_isapi_face_photo_envelope_persisted",
											ciphertextLength: String(
												fallback.encryptedFace?.ciphertext || "",
											).length,
											sdkError:
												error?.message ||
												"SDK face template extraction failed",
										});
										continue;
									} catch {}
								}
								templateExtractionResults.push({
									vendorUserId: employeeNo,
									modality: plan.modality,
									status: "failed",
									error: error?.message || "SDK template extraction failed",
								});
							}
						}
					}
				}

				const refreshUpsertCount = refreshResults.reduce(
					(total, item) => total + Number(item.created || 0) + Number(item.updated || 0),
					0,
				);
				const refreshFailureCount = refreshResults.filter((item) => item.error).length;
				const refreshSkippedCount = refreshResults.reduce(
					(total, item) =>
						total +
						Math.max(
							Number(item.totalSourceRecords || 0) -
								Number(item.importableRecords || 0),
							0,
						),
					0,
				);
				const lifecycleCreatedCount =
					Number(sourceLifecycleBackfillResult?.createdEvents?.length || 0) +
					(derivedLifecycleEvent ? 1 : 0);
				await finalizeBiometricLifecycleSyncRun(reconcileRunId, {
					status: "COMPLETED",
					totalSourceRecords: allowsSourceWideRefresh
						? Number(sourceLifecycleBackfillResult?.totalDeviceUsers || 0)
						: 1,
					importableRecords: allowsSourceWideRefresh
						? Number(sourceLifecycleBackfillResult?.plannedEvents?.length || 0)
						: 1,
					savedRecords: refreshUpsertCount + persisted.length + lifecycleCreatedCount,
					skippedRecords: refreshSkippedCount,
					failedRecords: refreshFailureCount,
					missingRecords: 0,
					skipSummary: {
						refreshSkippedCount,
						refreshFailureCount,
					},
					rawSummary: {
						...(reconcileRunRequestSummary || {}),
						refreshResults,
						persistedCount: persisted.length,
						derivedLifecycleEventId: derivedLifecycleEvent?.id || null,
						sourceLifecycleBackfillResult,
						templateExtractionResults,
						jobMode: "background",
					},
					completedAt: new Date(),
				});

				logActivity(req, {
					userId: (req as any).userId || "hikvision-biometric-service",
					action: "HIKVISION_BIOMETRIC_RECONCILE",
					description: allowsSourceWideRefresh
						? `Reconciled full Hikvision device-user truth from device ${sourceDevice.name}`
						: `Reconciled biometric metadata for employee ${employeeNo} from device ${sourceDevice.name}`,
					page: {
						url: req.originalUrl,
						title: "Hikvision Biometric Sync",
					},
				});

				return {
					execute: true,
					sourceDevice,
					employee,
					persisted,
					refreshResults,
					sourceLifecycleBackfillResult,
					derivedLifecycleEvent,
					templateExtractionResults,
					rawFingerprintTemplateStored: false,
				};
			};

			const runPayload = {
				runId: reconcileRunId,
				jobId: reconcileRunId,
				status: "PROCESSING",
				sourceDevice,
				employee,
				plannedChanges,
				rawFingerprintTemplateStored: false,
			};
			const runSynchronously =
				body.synchronous === true || body.wait === true || body.inline === true;
			if (!runSynchronously) {
				setImmediate(() => {
					runBiometricLifecycleReconcileWork().catch(async (error: any) => {
						await finalizeBiometricLifecycleSyncRun(reconcileRunId, {
							status: "FAILED",
							failedRecords: 1,
							failureSummary: {
								message: error?.message || "Failed to reconcile biometric sync",
							},
							rawSummary: reconcileRunRequestSummary
								? {
										...reconcileRunRequestSummary,
										failed: true,
										jobMode: "background",
									}
								: undefined,
							completedAt: new Date(),
						}).catch(() => undefined);
						deviceLogger.error(`Biometric sync reconcile job failed: ${error}`);
					});
				});
				res.status(202).json(
					buildSuccessResponse("Biometric sync reconcile job accepted", runPayload, 202),
				);
				return;
			}

			const result = await runBiometricLifecycleReconcileWork();
			res.status(200).json(
				buildSuccessResponse("Biometric sync reconcile persisted", result, 200),
			);
		} catch (error: any) {
			await finalizeBiometricLifecycleSyncRun(reconcileRunId, {
				status: "FAILED",
				failedRecords: 1,
				failureSummary: {
					message: error?.message || "Failed to reconcile biometric sync",
				},
				rawSummary: reconcileRunRequestSummary
					? {
							...reconcileRunRequestSummary,
							failed: true,
						}
					: undefined,
				completedAt: new Date(),
			}).catch(() => undefined);
			deviceLogger.error(`Biometric sync reconcile failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to reconcile biometric sync", 500),
			);
		}
	};

	const loadHikvisionSdkMergePlan = async (params: {
		req: Request;
		organizationId: string;
		deviceIds: string[];
	}) => {
		const devices = await prisma.device.findMany({
			where: {
				organizationId: params.organizationId,
				isDeleted: false,
				id: { in: params.deviceIds },
			},
			select: {
				id: true,
				name: true,
				address: true,
				port: true,
				protocol: true,
				config: true,
			},
		});
		if (devices.length !== params.deviceIds.length) {
			throw Object.assign(new Error("One or more selected devices were not found"), {
				statusCode: 404,
			});
		}
		if (devices.some((device) => !isHikvisionDevice(device))) {
			throw Object.assign(new Error("All selected devices must be Hikvision devices"), {
				statusCode: 400,
			});
		}

		const records: DeviceUserMergeRecord[] = [];
		const errors: Array<{ deviceId: string; deviceName: string; error: string }> = [];
		const loadDeviceRecords = async (device: (typeof devices)[number]) => {
			const deviceRecords: DeviceUserMergeRecord[] = [];
			try {
				const { candidates } = await loadHikvisionDeviceUserSnapshot(params.req, device);
				const employees = await loadEmployeesForDeviceUserCandidates(
					params.organizationId,
					candidates,
				);
				const vendorUserIds = candidates
					.map((candidate) => candidate.vendorUserId)
					.filter(Boolean);
				const savedRows = vendorUserIds.length
					? await (prisma as any).deviceUser.findMany({
							where: {
								organizationId: params.organizationId,
								deviceId: device.id,
								vendorUserId: { in: vendorUserIds },
							},
							select: {
								vendorUserId: true,
								employeeId: true,
								status: true,
								rawPayload: true,
							},
						})
					: [];
				const savedByVendorId = new Map<string, any>(
					savedRows.map((row: any) => [String(row.vendorUserId), row] as [string, any]),
				);
				for (const candidate of candidates) {
					const saved = savedByVendorId.get(candidate.vendorUserId);
					const decision = resolveDeviceUserLinkDecision(candidate, employees);
					const employeeId = saved?.employeeId || decision.employeeId || null;
					const credentialSummary = extractHikvisionCredentialSummary(
						candidate.rawPayload || {},
					);
					// The merge inventory snapshot is UserInfo/count evidence only. It does
					// not carry portable fingerprint or face bytes, so this plan must remain
					// conservative even if a separate HRIS custody workflow has blobs.
					deviceRecords.push({
						deviceId: device.id,
						deviceName: device.name || device.address || device.id,
						vendorUserId: candidate.vendorUserId,
						employeeNo: candidate.employeeNo,
						employeeId,
						displayName: candidate.displayName,
						status: saved?.status || decision.status,
						validFrom: candidate.validFrom,
						validTo: candidate.validTo,
						doorRight: candidate.doorRight,
						accessPlan: candidate.accessPlan,
						rawPayload: candidate.rawPayload,
						biometricEvidence: {
							fingerprint: {
								status:
									Number(credentialSummary.fingerprintCount || 0) > 0
										? "missing_raw_blob"
										: "not_enrolled",
								reportedCount: Number(credentialSummary.fingerprintCount || 0),
								rawBlobCount: 0,
							},
							face: {
								status:
									Number(credentialSummary.faceCount || 0) > 0
										? "missing_raw_blob"
										: "not_enrolled",
								reportedCount: Number(credentialSummary.faceCount || 0),
								rawBlobPresent: false,
							},
						},
						manualLink: Boolean(
							saved?.employeeId ||
							saved?.rawPayload?.hrisSync?.matchReason === "manual_existing",
						),
					});
				}
				return { records: deviceRecords, error: null };
			} catch (error: any) {
				return {
					records: deviceRecords,
					error: {
						deviceId: device.id,
						deviceName: device.name || device.address || device.id,
						error: error?.message || "SDK user read failed",
					},
				};
			}
		};
		// A small worker pool keeps total review latency bounded without flooding a
		// panel or creating the broad digest/auth burst that caused false reads.
		const deviceResults: Array<{
			records: DeviceUserMergeRecord[];
			error: { deviceId: string; deviceName: string; error: string } | null;
		}> = new Array(devices.length);
		let nextDeviceIndex = 0;
		const readNextDevice = async (): Promise<void> => {
			const index = nextDeviceIndex;
			nextDeviceIndex += 1;
			if (index >= devices.length) return;
			const device = devices[index];
			let result = await loadDeviceRecords(device);
			if (result.error) {
				const firstError = result.error.error.toLowerCase();
				const retryable =
					firstError.includes("fetch failed") ||
					firstError.includes("timed out") ||
					firstError.includes("timeout") ||
					firstError.includes("aborted") ||
					firstError.includes("econn");
				// Authentication/validation failures are deterministic for this plan.
				// Retry one transient transport failure, then return partial truth so
				// the operator is never trapped in an unbounded modal.
				for (let recovery = 1; recovery <= 1 && retryable && result.error; recovery += 1) {
					const delayMs = 750;
					deviceLogger.warn(
						`Merge inventory read recovery ${recovery}/1 for ${device.name || device.address || device.id} after ${result.error.error}; retrying in ${delayMs}ms`,
					);
					await new Promise((resolve) => setTimeout(resolve, delayMs));
					result = await loadDeviceRecords(device);
				}
			}
			deviceResults[index] = result;
			await readNextDevice();
		};
		// These embedded readers can pass quick health while rejecting or timing
		// out concurrent UserInfo pagination. Two workers is the proven stable
		// ceiling across the A-F tunnel set; preserve per-device retries.
		const mergeReadConcurrency = Math.min(2, devices.length);
		await Promise.all(Array.from({ length: mergeReadConcurrency }, () => readNextDevice()));
		for (const result of deviceResults) {
			records.push(...result.records);
			if (result.error) errors.push(result.error);
		}
		const failedDeviceIds = new Set(errors.map((error) => error.deviceId));
		const validDeviceIds = (params.deviceIds as string[]).filter(
			(deviceId) => !failedDeviceIds.has(deviceId),
		);
		const plan: any = buildDeviceUserMergePlan({
			records,
			deviceIds: params.deviceIds as string[],
			validDeviceIds,
		});
		const idsReadByDevice = plan.idsReadByDevice || {};
		return {
			...plan,
			errors,
			sdkErrors: errors,
			unreachableDevices: errors.map((error) => ({
				deviceId: error.deviceId,
				deviceName: error.deviceName,
				error: error.error,
			})),
			devices: devices.map((device) => {
				const error = errors.find((entry) => entry.deviceId === device.id);
				const idsRead = Number(idsReadByDevice[device.id] || 0);
				return {
					id: device.id,
					name: device.name,
					address: device.address,
					port: device.port,
					readStatus: error ? "failed" : "ok",
					readError: error?.error || null,
					idsRead: error ? null : idsRead,
				};
			}),
		};
	};

	const planHikvisionSdkUserMerge = async (req: Request, res: Response, _next: NextFunction) => {
		const admin = assertDeviceUserAdmin(req, res);
		if (!admin) return;
		try {
			const deviceIds: string[] = Array.from(
				new Set(
					Array.isArray(req.body?.deviceIds)
						? req.body.deviceIds
								.map((id: unknown) => String(id || "").trim())
								.filter(Boolean)
						: [],
				),
			) as string[];
			if (deviceIds.length < 2) {
				res.status(400).json(
					buildErrorResponse("Select at least two Hikvision devices", 400),
				);
				return;
			}
			const plan = await loadHikvisionSdkMergePlan({
				req,
				organizationId: String(admin.organizationId),
				deviceIds,
			});
			const planId = randomUUID();
			deviceUserMergePlans.set(planId, {
				organizationId: String(admin.organizationId),
				plan,
				createdAt: new Date(),
				req,
			});
			res.status(200).json(
				buildSuccessResponse(
					"SDK user merge plan ready",
					{ planId, plan: serializeDeviceUserMergePlanForReview(plan) },
					200,
				),
			);
		} catch (error: any) {
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(
					error?.message || "Failed to build SDK user merge plan",
					error?.statusCode || 500,
				),
			);
		}
	};

	const applyHikvisionSdkUserMerge = async (req: Request, res: Response, _next: NextFunction) => {
		const admin = assertDeviceUserAdmin(req, res);
		if (!admin) return;
		try {
			const planId = String(req.body?.planId || "").trim();
			const stored = deviceUserMergePlans.get(planId);
			if (!stored || stored.organizationId !== String(admin.organizationId)) {
				res.status(404).json(
					buildErrorResponse(
						"Merge plan not found or expired. Refresh the devices and try again.",
						404,
					),
				);
				return;
			}
			const selectedUserKeys = Array.isArray(req.body?.selectedUserKeys)
				? req.body.selectedUserKeys
						.map((key: unknown) => String(key || "").trim())
						.filter(Boolean)
				: undefined;
			const appliedPlan = applyMergeChoices(stored.plan, {
				choices: req.body?.choices || {},
				applyAll:
					req.body?.applyAll === "A" || req.body?.applyAll === "B"
						? req.body.applyAll
						: undefined,
				selectedUserKeys,
			});
			if (!appliedPlan.executable) {
				const reason = appliedPlan.ambiguousMatches?.length
					? "Resolve ambiguous SDK user identities before applying the merge"
					: (appliedPlan as any).errors?.length
						? "Resolve unreachable or failed SDK reads before applying the merge"
						: selectedUserKeys?.length === 0
							? "Select at least one actionable unique ID before applying the merge"
							: "Resolve every SDK user conflict before applying the merge";
				res.status(409).json(buildErrorResponse(reason, 409));
				return;
			}
			const emitMergeProgress =
				typeof (req as any).deviceUserMergeProgress === "function"
					? (event: any) =>
							(req as any).deviceUserMergeProgress({
								...event,
								at: new Date().toISOString(),
							})
					: undefined;

			const devices = await prisma.device.findMany({
				where: {
					organizationId: String(admin.organizationId),
					isDeleted: false,
					id: { in: appliedPlan.deviceIds },
				},
				select: {
					id: true,
					organizationId: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
					access: true,
				},
			});
			if ((req as any).deviceUserMergeSkipInitialSnapshot) {
				emitMergeProgress?.({
					stage: "using_reviewed_plan_snapshot",
					message:
						"Using the reviewed merge plan snapshot; skipping redundant pre-copy source reread.",
					totalDevices: devices.length,
				});
			} else {
				emitMergeProgress?.({
					stage: "source_snapshot",
					message: "Reading selected device users before copy.",
					totalDevices: devices.length,
				});
				for (const device of devices) {
					emitMergeProgress?.({
						stage: "source_snapshot_device",
						deviceId: device.id,
						deviceName: device.name || device.address,
						message: `Reading source snapshot from ${device.name || device.address || device.id}.`,
					});
					const { candidates } = await loadHikvisionDeviceUserSnapshot(req, device);
					await upsertDeviceUsersFromCandidates({
						organizationId: String(admin.organizationId),
						deviceId: device.id,
						candidates,
						source: "hikvision",
						pruneMissing: false,
					});
					emitMergeProgress?.({
						stage: "source_snapshot_device_done",
						deviceId: device.id,
						deviceName: device.name || device.address,
						sourceRecords: candidates.length,
						message: `Read ${candidates.length} user records from ${device.name || device.address || device.id}.`,
					});
				}
			}
			const results: any[] = [];
			const sdkPeerCopyTimeoutFailures = new Map<string, number>();
			// Default 3: one timeout must not open-circuit an entire source→target path for bulk merge.
			const sdkPeerCopyTimeoutCircuitLimit = Math.max(
				1,
				Math.min(Number(process.env.HIKVISION_MERGE_COPY_TIMEOUT_CIRCUIT_LIMIT || 3), 10),
			);
			const mergeOverlayDeviceUserRow = async (params: {
				user: any;
				sourceDevice: any;
				sourceRecord: any;
				targetDevice: any;
				targetDeviceId: string;
			}) => {
				const { user, sourceDevice, sourceRecord, targetDevice, targetDeviceId } = params;
				const targetRow = await (prisma as any).deviceUser.findFirst({
					where: {
						organizationId: String(admin.organizationId),
						deviceId: targetDeviceId,
						vendorUserId: sourceRecord.vendorUserId,
					},
					select: {
						id: true,
						employeeId: true,
						employeeNo: true,
						displayName: true,
						status: true,
						validFrom: true,
						validTo: true,
						doorRight: true,
						accessPlan: true,
						rawPayload: true,
					},
				});
				if (!targetRow?.id) return;
				emitMergeProgress?.({
					stage: "db_merge_started",
					userKey: user.key,
					vendorUserId: sourceRecord.vendorUserId,
					targetDeviceId,
					targetDeviceName: targetDevice.name || targetDevice.address,
					message: `Updating HRIS DeviceUser row for ${sourceRecord.vendorUserId} on ${targetDevice.name || targetDevice.address || targetDeviceId}.`,
				});
				const selectedRecordFor = (field: string) => {
					const conflict = user.conflicts.find((item: any) => item.field === field);
					if (conflict?.choice === "KEEP") return null;
					if (!conflict?.choice) return sourceRecord;
					const selectedDeviceId =
						conflict.choice === "B" ? conflict.deviceB.id : conflict.deviceA.id;
					return (
						user.records.find((record: any) => record.deviceId === selectedDeviceId) ||
						sourceRecord
					);
				};
				const employeeRecord = selectedRecordFor("employeeId");
				const nameRecord = selectedRecordFor("displayName");
				const statusRecord = selectedRecordFor("status");
				const validityFromRecord = selectedRecordFor("validFrom");
				const validityToRecord = selectedRecordFor("validTo");
				const accessRecord = selectedRecordFor("doorRight");
				await (prisma as any).deviceUser.update({
					where: { id: targetRow.id },
					data: {
						employeeId: employeeRecord
							? employeeRecord.employeeId || user.employeeId || null
							: targetRow.employeeId,
						displayName: nameRecord ? nameRecord.displayName : targetRow.displayName,
						status: statusRecord ? statusRecord.status : targetRow.status,
						validFrom: validityFromRecord
							? validityFromRecord.validFrom
								? new Date(validityFromRecord.validFrom)
								: null
							: targetRow.validFrom,
						validTo: validityToRecord
							? validityToRecord.validTo
								? new Date(validityToRecord.validTo)
								: null
							: targetRow.validTo,
						doorRight: accessRecord ? accessRecord.doorRight : targetRow.doorRight,
						accessPlan: accessRecord ? accessRecord.accessPlan : targetRow.accessPlan,
						rawPayload: {
							...(targetRow.rawPayload || {}),
							// Physical reread owns biometric truth; never spread one selected
							// modality's raw payload over another modality.
							hrisMerge: { reviewed: true, decisions: user.conflicts },
						},
					},
				});
				emitMergeProgress?.({
					stage: "db_merge_done",
					userKey: user.key,
					vendorUserId: sourceRecord.vendorUserId,
					targetDeviceId,
					targetDeviceName: targetDevice.name || targetDevice.address,
					message: `Updated HRIS row for ${sourceRecord.vendorUserId} on ${targetDevice.name || targetDevice.address || targetDeviceId}.`,
				});
			};
			const mergeOverlayDeviceUserRowWithRetry = async (
				params: Parameters<typeof mergeOverlayDeviceUserRow>[0],
			) => {
				let lastError: any = null;
				for (let attempt = 1; attempt <= 3; attempt += 1) {
					try {
						await mergeOverlayDeviceUserRow(params);
						return;
					} catch (error: any) {
						lastError = error;
						emitMergeProgress?.({
							stage: "db_merge_retry",
							userKey: params.user.key,
							vendorUserId: params.sourceRecord.vendorUserId,
							sourceDeviceId: params.sourceDevice.id,
							targetDeviceId: params.targetDeviceId,
							attempt,
							error: error?.message || String(error),
							message: `HRIS overlay attempt ${attempt}/3 failed after physical copy; preserving peer-write truth and retrying the database only.`,
						});
						if (attempt < 3) await sleep(attempt * 1000);
					}
				}
				emitMergeProgress?.({
					stage: "db_merge_error",
					userKey: params.user.key,
					vendorUserId: params.sourceRecord.vendorUserId,
					sourceDeviceId: params.sourceDevice.id,
					targetDeviceId: params.targetDeviceId,
					error: lastError?.message || String(lastError),
					message:
						"Physical peer copy succeeded, but the HRIS overlay failed after three attempts. Device reread remains authoritative.",
				});
			};
			for (const user of appliedPlan.users) {
				// Field-level A/B choices do not establish raw biometric custody.
				const sourceDeviceId = user.sourceDeviceId;
				const sourceDevice =
					devices.find((device) => device.id === sourceDeviceId) ||
					devices.find((device) => device.id === user.sourceDeviceId);
				if (!sourceDevice) continue;
				const sourceRecord = user.records.find(
					(record) => record.deviceId === sourceDevice.id,
				);
				if (!sourceRecord) continue;
				const includeFingerprints =
					sourceRecord.biometricEvidence?.fingerprint?.status === "raw_blob_present" &&
					Number(sourceRecord.biometricEvidence?.fingerprint?.rawBlobCount || 0) > 0;
				const includeFaceRecognition =
					sourceRecord.biometricEvidence?.face?.status === "raw_blob_present" &&
					Boolean(sourceRecord.biometricEvidence?.face?.rawBlobPresent);
				const copyCredentialStages = [
					"user",
					...(includeFingerprints ? ["fingerprint"] : []),
					...(includeFaceRecognition ? ["face"] : []),
				];
				// Batch multi-target: one VM SDK session per unique ID → all remaining peers
				// (reuses copyHikvisionUserToPeersBatch / PRD copy-to-all path).
				const candidateTargets = user.targetDeviceIds
					.filter((targetDeviceId: string) => targetDeviceId !== sourceDevice.id)
					.map((targetDeviceId: string) =>
						devices.find((device) => device.id === targetDeviceId),
					)
					.filter(Boolean) as typeof devices;
				const batchTargets: typeof devices = [];
				for (const targetDevice of candidateTargets) {
					const targetDeviceId = String(targetDevice.id);
					const copyCircuitKey = `${sourceDevice.id}->${targetDeviceId}`;
					const priorTimeoutFailures =
						sdkPeerCopyTimeoutFailures.get(copyCircuitKey) || 0;
					if (priorTimeoutFailures >= sdkPeerCopyTimeoutCircuitLimit) {
						const circuitError = `Skipped SDK peer copy after ${priorTimeoutFailures} timeout failures for ${sourceDevice.name || sourceDevice.id} to ${targetDevice.name || targetDeviceId}`;
						results.push({
							userKey: user.key,
							sourceDeviceId: sourceDevice.id,
							targetDeviceId,
							status: "error",
							error: circuitError,
						});
						emitMergeProgress?.({
							stage: "copy_error",
							userKey: user.key,
							vendorUserId: sourceRecord.vendorUserId,
							sourceDeviceId: sourceDevice.id,
							sourceDeviceName: sourceDevice.name || sourceDevice.address,
							targetDeviceId,
							targetDeviceName: targetDevice.name || targetDevice.address,
							credentialStages: copyCredentialStages,
							includeFingerprints,
							includeFaceRecognition,
							error: circuitError,
							message: `Skipped timed-out copy path for user ${sourceRecord.vendorUserId} from ${sourceDevice.name || sourceDevice.address || sourceDevice.id} to ${targetDevice.name || targetDevice.address || targetDeviceId}.`,
						});
						continue;
					}
					batchTargets.push(targetDevice);
				}
				for (const targetDevice of batchTargets) {
					const targetDeviceId = String(targetDevice.id);
					emitMergeProgress?.({
						stage: "copy_started",
						userKey: user.key,
						vendorUserId: sourceRecord.vendorUserId,
						sourceDeviceId: sourceDevice.id,
						sourceDeviceName: sourceDevice.name || sourceDevice.address,
						targetDeviceId,
						targetDeviceName: targetDevice.name || targetDevice.address,
						credentialStages: copyCredentialStages,
						includeFingerprints,
						includeFaceRecognition,
						batchMultiTarget: true,
						batchTargetCount: batchTargets.length,
						message: `Copying user ${sourceRecord.vendorUserId} from ${sourceDevice.name || sourceDevice.address || sourceDevice.id} to ${targetDevice.name || targetDevice.address || targetDeviceId} (batched multi-target).`,
					});
				}
				if (batchTargets.length > 0) {
					try {
						emitMergeProgress?.({
							stage: "batch_copy_started",
							userKey: user.key,
							vendorUserId: sourceRecord.vendorUserId,
							sourceDeviceId: sourceDevice.id,
							sourceDeviceName: sourceDevice.name || sourceDevice.address,
							targetCount: batchTargets.length,
							targetDeviceIds: batchTargets.map((device) => device.id),
							credentialStages: copyCredentialStages,
							includeFingerprints,
							includeFaceRecognition,
							message: `Batch peer copy for user ${sourceRecord.vendorUserId} from ${sourceDevice.name || sourceDevice.address || sourceDevice.id} to ${batchTargets.length} target(s) in one VM SDK session.`,
						});
						const batch = await copyHikvisionUserToPeersBatch({
							req,
							organizationId: String(admin.organizationId),
							sourceDevice,
							targetDevices: batchTargets,
							employeeNo: sourceRecord.vendorUserId,
							includeFingerprints,
							includeFaceRecognition,
							// These targets came from the fresh SDK plan's missing matrix.
							// A narrower ISAPI lookup must not turn a required idempotent
							// physical device write into a false already-converged no-op.
							forcePhysicalCopy: true,
							onProgress: emitMergeProgress,
						});
						for (const batchResult of batch.results || []) {
							const targetDeviceId = String(batchResult.targetDevice?.id || "");
							const targetDevice =
								batchTargets.find(
									(device) => String(device.id) === targetDeviceId,
								) || devices.find((device) => String(device.id) === targetDeviceId);
							if (!targetDeviceId || !targetDevice) continue;
							const copyCircuitKey = `${sourceDevice.id}->${targetDeviceId}`;
							const priorTimeoutFailures =
								sdkPeerCopyTimeoutFailures.get(copyCircuitKey) || 0;
							if (batchResult.status === "success") {
								results.push({
									userKey: user.key,
									sourceDeviceId: sourceDevice.id,
									targetDeviceId,
									status: "success",
									strategy:
										batchResult.vmCopy?.strategy ||
										(batch.summary?.vmSessionCount
											? "batch_multi_target"
											: null),
									alreadyConverged: batchResult.alreadyConverged === true,
								});
								emitMergeProgress?.({
									stage: "copy_success",
									userKey: user.key,
									vendorUserId: sourceRecord.vendorUserId,
									sourceDeviceId: sourceDevice.id,
									sourceDeviceName: sourceDevice.name || sourceDevice.address,
									targetDeviceId,
									targetDeviceName: targetDevice.name || targetDevice.address,
									strategy:
										batchResult.vmCopy?.strategy ||
										(batch.summary?.vmSessionCount
											? "batch_multi_target"
											: null),
									credentialStages: copyCredentialStages,
									includeFingerprints,
									includeFaceRecognition,
									batchMultiTarget: true,
									alreadyConverged: batchResult.alreadyConverged === true,
									message: `Copied user ${sourceRecord.vendorUserId} to ${targetDevice.name || targetDevice.address || targetDeviceId}.`,
								});
							} else {
								const copyErrorMessage =
									batchResult.error || "SDK user copy failed";
								if (
									/(timed out|timeout|Process timed out|cannot be used as the SDK copy)/i.test(
										String(copyErrorMessage),
									)
								) {
									sdkPeerCopyTimeoutFailures.set(
										copyCircuitKey,
										priorTimeoutFailures + 1,
									);
								}
								results.push({
									userKey: user.key,
									sourceDeviceId: sourceDevice.id,
									targetDeviceId,
									status: "error",
									error: copyErrorMessage,
								});
								emitMergeProgress?.({
									stage: "copy_error",
									userKey: user.key,
									vendorUserId: sourceRecord.vendorUserId,
									sourceDeviceId: sourceDevice.id,
									sourceDeviceName: sourceDevice.name || sourceDevice.address,
									targetDeviceId,
									targetDeviceName: targetDevice.name || targetDevice.address,
									credentialStages: copyCredentialStages,
									includeFingerprints,
									includeFaceRecognition,
									error: copyErrorMessage,
									batchMultiTarget: true,
									message: `Copy failed for user ${sourceRecord.vendorUserId} on ${targetDevice.name || targetDevice.address || targetDeviceId}.`,
								});
							}
							if (batchResult.status === "success") {
								await mergeOverlayDeviceUserRowWithRetry({
									user,
									sourceDevice,
									sourceRecord,
									targetDevice,
									targetDeviceId,
								});
							}
						}
						emitMergeProgress?.({
							stage: "batch_copy_done",
							userKey: user.key,
							vendorUserId: sourceRecord.vendorUserId,
							sourceDeviceId: sourceDevice.id,
							sourceDeviceName: sourceDevice.name || sourceDevice.address,
							summary: batch.summary || null,
							timings: batch.timings || null,
							message: `Batch peer copy finished for user ${sourceRecord.vendorUserId} (${batch.summary?.successfulTargets || 0}/${batch.summary?.totalTargets || batchTargets.length} targets).`,
						});
					} catch (error: any) {
						const copyErrorMessage = error?.message || "SDK user batch copy failed";
						for (const targetDevice of batchTargets) {
							const targetDeviceId = String(targetDevice.id);
							const copyCircuitKey = `${sourceDevice.id}->${targetDeviceId}`;
							const priorTimeoutFailures =
								sdkPeerCopyTimeoutFailures.get(copyCircuitKey) || 0;
							if (
								/(timed out|timeout|Process timed out|cannot be used as the SDK copy)/i.test(
									String(copyErrorMessage),
								)
							) {
								sdkPeerCopyTimeoutFailures.set(
									copyCircuitKey,
									priorTimeoutFailures + 1,
								);
							}
							results.push({
								userKey: user.key,
								sourceDeviceId: sourceDevice.id,
								targetDeviceId,
								status: "error",
								error: copyErrorMessage,
							});
							emitMergeProgress?.({
								stage: "copy_error",
								userKey: user.key,
								vendorUserId: sourceRecord.vendorUserId,
								sourceDeviceId: sourceDevice.id,
								sourceDeviceName: sourceDevice.name || sourceDevice.address,
								targetDeviceId,
								targetDeviceName: targetDevice.name || targetDevice.address,
								credentialStages: copyCredentialStages,
								includeFingerprints,
								includeFaceRecognition,
								error: copyErrorMessage,
								batchMultiTarget: true,
								message: `Batch copy failed for user ${sourceRecord.vendorUserId} on ${targetDevice.name || targetDevice.address || targetDeviceId}.`,
							});
							// Never update DeviceUser as though a failed physical copy succeeded.
						}
					}
				}
				const decisions = user.conflicts.map((conflict: any) => ({
					field: conflict.field,
					choice: conflict.choice,
					selectedDeviceId:
						conflict.choice === "B" ? conflict.deviceB.id : conflict.deviceA.id,
				}));
				await logAudit(req, {
					userId: String((req as any).userId || "unknown"),
					action: config.AUDIT_LOG.ACTIONS.UPDATE,
					resource: config.AUDIT_LOG.RESOURCES.DEVICE,
					severity: config.AUDIT_LOG.SEVERITY.HIGH,
					entityType: config.AUDIT_LOG.ENTITY_TYPES.DEVICE,
					entityId: user.key,
					changesBefore: null,
					changesAfter: {
						employeeId: user.employeeId,
						sourceDeviceId: sourceDevice.id,
						targetDeviceIds: user.targetDeviceIds,
						decisions,
					},
					description: "Applied reviewed Hikvision device-user merge decisions",
					organizationId: String(admin.organizationId),
				});
				emitMergeProgress?.({
					stage: "user_done",
					userKey: user.key,
					vendorUserId: sourceRecord.vendorUserId,
					sourceDeviceId: sourceDevice.id,
					sourceDeviceName: sourceDevice.name || sourceDevice.address,
					targets: user.targetDeviceIds.length,
					message: `Finished reviewed merge work for user ${sourceRecord.vendorUserId}.`,
				});
			}
			emitMergeProgress?.({
				stage: "reread_started",
				message: "Rereading devices to verify the merge result.",
			});
			const reread = await loadHikvisionSdkMergePlan({
				req,
				organizationId: String(admin.organizationId),
				deviceIds: appliedPlan.deviceIds,
			});
			const rereadCounts = reread?.counts || reread?.plan?.counts || {};
			emitMergeProgress?.({
				stage: "reread_done",
				remainingConflicts: Number(rereadCounts.conflicts || 0),
				remainingMissing: Number(rereadCounts.missing || 0),
				message: "Reread complete. Finalizing merge job results.",
			});
			logActivity(req, {
				userId: String((req as any).userId || "unknown"),
				action: "HIKVISION_SDK_USER_MERGE",
				description: `Applied Hikvision SDK user merge plan ${planId}`,
				page: { url: req.originalUrl, title: "Hikvision SDK User Merge" },
			});
			await invalidateCache.byPattern("cache:device:*").catch(() => undefined);
			deviceUserMergePlans.delete(planId);
			res.status(200).json(
				buildSuccessResponse(
					"SDK user merge applied",
					{
						planId,
						results,
						reread,
						remainingConflicts: Number(rereadCounts.conflicts || 0),
						remainingMissing: Number(rereadCounts.missing || 0),
						attention: results.filter((result) => result.status === "error").length,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(
					error?.message || "Failed to apply SDK user merge",
					error?.statusCode || 500,
				),
			);
		}
	};

	const runHikvisionSdkUserMergeApplyForJob = async (params: {
		req: Request;
		planId: string;
		choices?: Record<string, any>;
		applyAll?: "A" | "B";
		selectedUserKeys?: string[];
		onProgress?: (event: any) => void;
	}) => {
		const originalBody = params.req.body;
		const originalProgress = (params.req as any).deviceUserMergeProgress;
		const originalSkipInitialSnapshot = (params.req as any).deviceUserMergeSkipInitialSnapshot;
		let statusCode = 200;
		let responsePayload: any = null;
		const fakeRes = {
			status(code: number) {
				statusCode = code;
				return this;
			},
			json(payload: any) {
				responsePayload = payload;
				return this;
			},
		} as unknown as Response;
		try {
			(params.req as any).body = {
				planId: params.planId,
				choices: params.choices || {},
				applyAll: params.applyAll,
				selectedUserKeys: params.selectedUserKeys,
			};
			(params.req as any).deviceUserMergeProgress = params.onProgress;
			(params.req as any).deviceUserMergeSkipInitialSnapshot = true;
			await applyHikvisionSdkUserMerge(
				params.req,
				fakeRes,
				(() => undefined) as NextFunction,
			);
		} finally {
			(params.req as any).body = originalBody;
			(params.req as any).deviceUserMergeProgress = originalProgress;
			(params.req as any).deviceUserMergeSkipInitialSnapshot = originalSkipInitialSnapshot;
		}
		if (statusCode >= 400) {
			const message =
				responsePayload?.errors?.[0]?.message ||
				responsePayload?.message ||
				"Device-user merge job failed.";
			throw Object.assign(new Error(message), { statusCode });
		}
		return responsePayload?.data || responsePayload;
	};

	const processHikvisionSdkUserMergeJob = async (params: {
		jobId: string;
		req: Request;
		organizationId: string;
		planId: string;
		choices?: Record<string, any>;
		applyAll?: "A" | "B";
		selectedUserKeys?: string[];
	}) => {
		const job = deviceUserMergeJobs.get(params.jobId);
		if (!job) return;
		try {
			let processedWrites = Math.max(0, job.processedWrites || 0);
			let successfulWrites = Math.max(0, job.successfulWrites || 0);
			let alreadyConvergedWrites = Math.max(0, job.alreadyConvergedWrites || 0);
			let failedWrites = Math.max(0, job.failedWrites || 0);
			const recordProgress = (event: any) => {
				const stage = String(event?.stage || "working");
				const terminalCopy = stage === "copy_success" || stage === "copy_error";
				const resultRow = terminalCopy
					? {
							userKey: event.userKey,
							vendorUserId: event.vendorUserId,
							sourceDeviceId: event.sourceDeviceId,
							sourceDeviceName: event.sourceDeviceName,
							targetDeviceId: event.targetDeviceId,
							targetDeviceName: event.targetDeviceName,
							status: stage === "copy_success" ? "success" : "error",
							strategy: event.strategy || null,
							error: event.error || null,
						}
					: null;
				if (terminalCopy) {
					processedWrites = Math.min(job.totalWrites, processedWrites + 1);
					if (stage === "copy_success" && event?.alreadyConverged) {
						alreadyConvergedWrites += 1;
					} else if (stage === "copy_success") successfulWrites += 1;
					if (stage === "copy_error") failedWrites += 1;
					const errText = String(event?.error || "");
					const isCircuitSkip = /Skipped SDK peer copy after \d+ timeout/i.test(errText);
					const isTimeout = /(timed out|timeout|Process timed out)/i.test(errText);
					const ledgerKind = stage === "copy_success" ? "success" : "failure";
					appendMergeLedgerRow(params.jobId, ledgerKind, {
						vendorUserId: event?.vendorUserId || null,
						userKey: event?.userKey || null,
						sourceDeviceId: event?.sourceDeviceId || null,
						sourceDeviceName: event?.sourceDeviceName || null,
						targetDeviceId: event?.targetDeviceId || null,
						targetDeviceName: event?.targetDeviceName || null,
						stage,
						status:
							stage === "copy_success"
								? event?.alreadyConverged
									? "already_converged"
									: "peer_write_success"
								: isCircuitSkip
									? "circuit_skip"
									: isTimeout
										? "timeout"
										: "error",
						strategy: event?.strategy || null,
						batchMultiTarget: event?.batchMultiTarget === true,
						error: event?.error || null,
						// Circuit-skips and timeouts must never be counted as peer write success.
						countsAsPeerWriteSuccess:
							stage === "copy_success" && !isCircuitSkip && !event?.alreadyConverged,
					});
				}
				const latest = deviceUserMergeJobs.get(params.jobId);
				const nextResults = resultRow
					? [...(latest?.results || []), resultRow].slice(-250)
					: latest?.results;
				let copyFailureSummary = latest?.copyFailureSummary;
				if (stage === "copy_error") {
					const source =
						String(event?.sourceDeviceName || event?.sourceDeviceId || "unknown") ||
						"unknown";
					const target =
						String(event?.targetDeviceName || event?.targetDeviceId || "unknown") ||
						"unknown";
					const pairKey = `${source} -> ${target}`;
					const errorKey = String(event?.error || event?.message || "copy_error").slice(
						0,
						240,
					);
					copyFailureSummary = {
						total: Number(copyFailureSummary?.total || 0) + 1,
						byPair: {
							...(copyFailureSummary?.byPair || {}),
							[pairKey]: Number(copyFailureSummary?.byPair?.[pairKey] || 0) + 1,
						},
						byError: {
							...(copyFailureSummary?.byError || {}),
							[errorKey]: Number(copyFailureSummary?.byError?.[errorKey] || 0) + 1,
						},
						latest: {
							userKey: event?.userKey || null,
							vendorUserId: event?.vendorUserId || null,
							source,
							target,
							error: errorKey,
							at: event?.at || new Date().toISOString(),
						},
					};
				}
				updateDeviceUserMergeJob(params.jobId, {
					message:
						event?.message || "Applying reviewed decisions to the selected devices.",
					currentStage: stage,
					currentUserKey: event?.userKey || null,
					currentTargetDeviceId: event?.targetDeviceId || null,
					processedWrites,
					successfulWrites,
					alreadyConvergedWrites,
					failedWrites,
					results: nextResults,
					copyFailureSummary,
					appendProgressEvent: event,
				});
			};
			updateDeviceUserMergeJob(params.jobId, {
				message: "Preparing reviewed source and target matrix.",
				currentStage: "preparing",
				processedWrites: 0,
				appendProgressEvent: {
					stage: "preparing",
					message: "Preparing reviewed source and target matrix.",
					at: new Date().toISOString(),
				},
			});
			const result = await runHikvisionSdkUserMergeApplyForJob({
				req: params.req,
				planId: params.planId,
				choices: params.choices,
				applyAll: params.applyAll,
				selectedUserKeys: params.selectedUserKeys,
				onProgress: recordProgress,
			});
			const results = Array.isArray(result?.results) ? result.results : [];
			const finalFailedWrites = results.filter((item: any) => item.status === "error").length;
			const finalAlreadyConvergedWrites = results.filter(
				(item: any) => item.status === "success" && item.alreadyConverged === true,
			).length;
			const finalSuccessfulWrites = results.filter(
				(item: any) => item.status === "success" && item.alreadyConverged !== true,
			).length;
			const attention = Number(result?.attention || finalFailedWrites || 0);
			let retryPlanId: string | undefined;
			const retryPlan = result?.reread?.plan || result?.reread;
			if (attention > 0 && retryPlan?.deviceIds?.length) {
				retryPlanId = randomUUID();
				deviceUserMergePlans.set(retryPlanId, {
					organizationId: params.organizationId,
					plan: retryPlan,
					createdAt: new Date(),
					req: params.req,
				});
			}
			updateDeviceUserMergeJob(params.jobId, {
				status: attention > 0 ? "failed" : "completed",
				planId: retryPlanId || params.planId,
				retryPlanId,
				message:
					attention > 0
						? "Merge finished with attention items. Review the failed rows, then retry from the reread plan."
						: "Merge finished and devices were reread.",
				currentStage: attention > 0 ? "completed_with_attention" : "completed",
				currentUserKey: null,
				currentTargetDeviceId: null,
				processedWrites: job.totalWrites,
				successfulWrites: finalSuccessfulWrites,
				alreadyConvergedWrites: finalAlreadyConvergedWrites,
				failedWrites: attention,
				results,
				remainingConflicts: Number(result?.remainingConflicts || 0),
				remainingMissing: Number(result?.remainingMissing || 0),
				attention,
				completedAt: new Date(),
			});
		} catch (error: any) {
			const latest = deviceUserMergeJobs.get(params.jobId) || job;
			updateDeviceUserMergeJob(params.jobId, {
				status: "failed",
				message: error?.message || "Device-user merge job failed.",
				currentStage: "failed",
				successfulWrites: Math.max(0, latest.successfulWrites || 0),
				failedWrites: Math.max(1, latest.failedWrites || 0),
				processedWrites: Math.max(latest.processedWrites || 0, job.processedWrites || 0),
				error: error?.message || "Device-user merge job failed.",
				completedAt: new Date(),
			});
		}
	};

	const reviewHikvisionSdkUserMergeJob = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const admin = assertDeviceUserAdmin(req, res);
		if (!admin) return;
		try {
			const planId = String(req.body?.planId || "").trim();
			const stored = deviceUserMergePlans.get(planId);
			if (!stored || stored.organizationId !== String(admin.organizationId)) {
				res.status(404).json(
					buildErrorResponse(
						"Merge plan not found or expired. Refresh the devices and try again.",
						404,
					),
				);
				return;
			}
			const selectedUserKeys = Array.isArray(req.body?.selectedUserKeys)
				? req.body.selectedUserKeys
						.map((key: unknown) => String(key || "").trim())
						.filter(Boolean)
				: undefined;
			const appliedPlan = applyMergeChoices(stored.plan, {
				choices: req.body?.choices || {},
				applyAll:
					req.body?.applyAll === "A" || req.body?.applyAll === "B"
						? req.body.applyAll
						: undefined,
				selectedUserKeys,
			});
			if (!appliedPlan.executable) {
				res.status(409).json(
					buildErrorResponse(
						"Resolve every selected conflict and failed inventory read before reviewing the locked write scope",
						409,
					),
				);
				return;
			}
			const writeMatrix = buildDeviceUserMergeWriteMatrix(appliedPlan);
			const lock = buildDeviceUserMergeScopeLock({
				planId,
				appliedPlan,
				writeMatrix,
			});
			res.status(200).json(
				buildSuccessResponse(
					"SDK user merge write scope reviewed",
					{
						planId,
						scopeHash: lock.scopeHash,
						...lock.scope,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(
					error?.message || "Failed to review SDK user merge write scope",
					error?.statusCode || 500,
				),
			);
		}
	};

	const startHikvisionSdkUserMergeJob = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const admin = assertDeviceUserAdmin(req, res);
		if (!admin) return;
		try {
			cleanupDeviceUserMergeJobs();
			const activeJob = [...deviceUserMergeJobs.values()].find(
				(job) =>
					job.organizationId === String(admin.organizationId) &&
					job.status === "processing" &&
					!isDeviceUserMergeJobStale(job),
			);
			if (activeJob) {
				res.status(409).json(
					buildErrorResponse(
						`Merge job ${activeJob.jobId} is already processing. Poll that locked scope before starting another job.`,
						409,
					),
				);
				return;
			}
			const planId = String(req.body?.planId || "").trim();
			const stored = deviceUserMergePlans.get(planId);
			if (!stored || stored.organizationId !== String(admin.organizationId)) {
				res.status(404).json(
					buildErrorResponse(
						"Merge plan not found or expired. Refresh the devices and try again.",
						404,
					),
				);
				return;
			}
			const choices = req.body?.choices || {};
			const applyAll =
				req.body?.applyAll === "A" || req.body?.applyAll === "B"
					? req.body.applyAll
					: undefined;
			const selectedUserKeys = Array.isArray(req.body?.selectedUserKeys)
				? req.body.selectedUserKeys
						.map((key: unknown) => String(key || "").trim())
						.filter(Boolean)
				: undefined;
			const selectedAppliedPlan = applyMergeChoices(stored.plan, {
				choices,
				applyAll,
				selectedUserKeys,
			});
			if (!selectedAppliedPlan.executable) {
				const reason = selectedAppliedPlan.ambiguousMatches?.length
					? "Resolve ambiguous SDK user identities before starting the merge job"
					: (selectedAppliedPlan as any).errors?.length
						? "Resolve unreachable or failed SDK reads before starting the merge job"
						: selectedUserKeys?.length === 0
							? "Select at least one actionable unique ID before starting the merge job"
							: "Resolve every selected SDK user conflict before starting the merge job";
				res.status(409).json(buildErrorResponse(reason, 409));
				return;
			}
			const writeMatrix = buildDeviceUserMergeWriteMatrix(selectedAppliedPlan);
			const scopeLock = buildDeviceUserMergeScopeLock({
				planId,
				appliedPlan: selectedAppliedPlan,
				writeMatrix,
			});
			const expectedScopeHash = String(req.body?.expectedScopeHash || "").trim();
			if (!expectedScopeHash || expectedScopeHash !== scopeLock.scopeHash) {
				res.status(409).json(
					buildErrorResponse(
						"Merge scope hash does not match the reviewed write matrix. Review the current scope again before starting physical writes.",
						409,
					),
				);
				return;
			}
			const totalWrites = Math.max(
				1,
				Number(writeMatrix.totalWrites || selectedAppliedPlan.plannedWrites?.length || 0),
			);
			const jobId = randomUUID();
			const job: DeviceUserMergeJob = {
				jobId,
				planId,
				scopeHash: scopeLock.scopeHash,
				status: "processing",
				organizationId: String(admin.organizationId),
				totalWrites,
				processedWrites: 0,
				successfulWrites: 0,
				alreadyConvergedWrites: 0,
				failedWrites: 0,
				message:
					"Merge job queued. HRIS will apply reviewed decisions, copy credentials, then reread devices.",
				currentStage: "queued",
				currentUserKey: null,
				currentTargetDeviceId: null,
				results: [],
				progressEvents: [
					{
						stage: "queued",
						message:
							"Merge job queued. HRIS will apply reviewed decisions, copy credentials, then reread devices.",
						at: new Date().toISOString(),
					},
				],
				writeMatrix,
				stale: false,
				startedAt: new Date(),
				updatedAt: new Date(),
			};
			deviceUserMergeJobs.set(jobId, job);
			// Durable snapshot first so API restart mid-copy never claims "job not found".
			persistDeviceUserMergeJob(job);
			processHikvisionSdkUserMergeJob({
				jobId,
				req,
				organizationId: String(admin.organizationId),
				planId,
				choices,
				applyAll,
				selectedUserKeys,
			}).catch((error: any) => {
				deviceLogger.error(`Hikvision SDK user merge job ${jobId} failed: ${error}`);
				updateDeviceUserMergeJob(jobId, {
					status: "failed",
					message: error?.message || "Device-user merge job failed.",
					failedWrites: 1,
					error: error?.message || "Device-user merge job failed.",
					completedAt: new Date(),
				});
			});
			const started = deviceUserMergeJobs.get(jobId) || job;
			res.status(202).json(
				buildSuccessResponse(
					"SDK user merge job started",
					{
						jobId,
						scopeHash: scopeLock.scopeHash,
						progress: started,
						snapshotPath: started.snapshotPath || null,
						durable: true,
					},
					202,
				),
			);
		} catch (error: any) {
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(
					error?.message || "Failed to start SDK user merge job",
					error?.statusCode || 500,
				),
			);
		}
	};

	const getHikvisionSdkUserMergeJob = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const admin = assertDeviceUserAdmin(req, res);
		if (!admin) return;
		const jobId = String(req.params.jobId || "").trim();
		const job = resolveDeviceUserMergeJob(jobId);
		if (!job || job.organizationId !== String(admin.organizationId)) {
			res.status(404).json(
				buildErrorResponse("SDK user merge job not found or expired", 404),
			);
			return;
		}
		res.status(200).json(
			buildSuccessResponse(
				job.stale
					? "SDK user merge job retrieved (stale after worker death / API restart)"
					: "SDK user merge job retrieved",
				{
					...job,
					durable: true,
					// Explicit agent recovery flags so poll scripts never invent "still processing".
					workerActive: job.status === "processing" && !job.stale,
					recoveryHint:
						job.stale || job.status === "failed"
							? "Do not poll this job as active. Use failure ledger / remaining plan and start a fresh merge job for unfinished rows only."
							: job.status === "completed"
								? "Job finished; use results and ledger tallies."
								: "Job worker is active in this API process; continue polling.",
				},
				200,
			),
		);
	};

	const listHikvisionSdkUserMergeJobs = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const admin = assertDeviceUserAdmin(req, res);
		if (!admin) return;
		cleanupDeviceUserMergeJobs();
		const now = Date.now();
		const status = String(req.query.status || "").trim();
		const jobs = [...deviceUserMergeJobs.values()]
			.filter((job) => job.organizationId === String(admin.organizationId))
			.filter((job) => !status || job.status === status)
			.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
			.map((job) => {
				const lastActivityAt =
					job.updatedAt || job.completedAt || job.startedAt || new Date(0);
				const secondsSinceUpdate = Math.max(
					0,
					Math.floor((now - lastActivityAt.getTime()) / 1000),
				);
				return {
					jobId: job.jobId,
					planId: job.planId,
					retryPlanId: job.retryPlanId,
					status: job.status,
					totalWrites: job.totalWrites,
					processedWrites: job.processedWrites,
					successfulWrites: job.successfulWrites,
					alreadyConvergedWrites: job.alreadyConvergedWrites || 0,
					failedWrites: job.failedWrites,
					message: job.message,
					currentStage: job.currentStage,
					currentUserKey: job.currentUserKey,
					currentTargetDeviceId: job.currentTargetDeviceId,
					progressEventCount: job.progressEvents?.length || 0,
					resultCount: job.results?.length || 0,
					copyFailureSummary: job.copyFailureSummary
						? {
								total: job.copyFailureSummary.total || 0,
								byPair: job.copyFailureSummary.byPair || {},
								byError: job.copyFailureSummary.byError || {},
								latest: job.copyFailureSummary.latest || null,
							}
						: null,
					writeMatrix: job.writeMatrix
						? {
								selectedUniqueIds: job.writeMatrix.selectedUniqueIds,
								totalWrites: job.writeMatrix.totalWrites,
								fingerprintGaps: job.writeMatrix.fingerprintGaps,
								faceGaps: job.writeMatrix.faceGaps,
								conflicts: job.writeMatrix.conflicts,
							}
						: null,
					startedAt: job.startedAt,
					updatedAt: job.updatedAt,
					completedAt: job.completedAt,
					secondsSinceUpdate,
					staleTelemetry: job.status === "processing" && secondsSinceUpdate > 120,
				};
			});
		res.status(200).json(
			buildSuccessResponse(
				"SDK user merge jobs retrieved",
				{
					jobs,
					running: jobs.filter((job) => job.status === "processing").length,
				},
				200,
			),
		);
	};

	const getHikvisionMergeDevices = async (organizationId: string, requestedIds: unknown) => {
		const ids = Array.isArray(requestedIds)
			? [...new Set(requestedIds.map((id) => String(id || "").trim()).filter(Boolean))]
			: [];
		const devices = await prisma.device.findMany({
			where: {
				organizationId,
				isDeleted: false,
				...(ids.length ? { id: { in: ids } } : {}),
			},
			select: {
				id: true,
				organizationId: true,
				name: true,
				address: true,
				port: true,
				protocol: true,
				config: true,
			},
			orderBy: { createdAt: "asc" },
		});
		const hikvisionDevices = devices.filter((device) => isHikvisionDevice(device));
		if (ids.length && hikvisionDevices.length !== ids.length) {
			throw Object.assign(
				new Error("Every selected device must be a configured Hikvision device"),
				{ statusCode: 400 },
			);
		}
		if (hikvisionDevices.length < 2) {
			throw Object.assign(new Error("Select at least two configured Hikvision devices"), {
				statusCode: 400,
			});
		}
		return hikvisionDevices;
	};

	const buildLiveDeviceUserMergePlan = async (params: {
		req: Request;
		organizationId: string;
		deviceIds?: unknown[];
	}) => {
		const devices = await getHikvisionMergeDevices(params.organizationId, params.deviceIds);
		const records: DeviceUserMergeRecord[] = [];
		for (const device of devices) {
			const snapshot = await loadHikvisionDeviceUserSnapshot(params.req, device);
			const savedRows = await (prisma as any).deviceUser.findMany({
				where: { organizationId: params.organizationId, deviceId: device.id },
				select: { vendorUserId: true, employeeId: true, rawPayload: true },
			});
			const savedByVendor = new Map<string, any>(
				savedRows.map(
					(row: any) => [String(row.vendorUserId || "").trim(), row] as [string, any],
				),
			);
			for (const candidate of snapshot.candidates) {
				const saved = savedByVendor.get(String(candidate.vendorUserId).trim());
				records.push({
					deviceId: device.id,
					deviceName: device.name || device.address,
					vendorUserId: candidate.vendorUserId,
					employeeNo: candidate.employeeNo,
					employeeId: saved?.employeeId || null,
					displayName: candidate.displayName,
					status: candidate.status,
					validFrom: candidate.validFrom,
					validTo: candidate.validTo,
					doorRight: candidate.doorRight,
					accessPlan: candidate.accessPlan,
					rawPayload: candidate.rawPayload,
					manualLink:
						String(saved?.rawPayload?.hrisSync?.matchReason || "") ===
						"manual_existing",
				});
			}
		}
		const plan: any = buildDeviceUserMergePlan({
			records,
			deviceIds: devices.map((device) => device.id),
		});
		const employeeIds = [
			...new Set(plan.users.map((user: any) => user.employeeId).filter(Boolean)),
		];
		const employees = employeeIds.length
			? await prisma.employee.findMany({
					where: {
						organizationId: params.organizationId,
						id: { in: employeeIds as string[] },
						isDeleted: false,
					},
					select: {
						id: true,
						employeeId: true,
						deviceEmpId: true,
						person: { select: { personalInfo: true } },
					},
				})
			: [];
		const employeeById = new Map(employees.map((employee: any) => [employee.id, employee]));
		return {
			...plan,
			devices: devices.map(({ config: _config, ...device }) => device),
			users: plan.users.map((user: any) => ({
				...user,
				employee: employeeById.get(user.employeeId || "") || null,
			})),
		};
	};

	const createDeviceUserMergePlan = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;
			const plan = await buildLiveDeviceUserMergePlan({
				req,
				organizationId: admin.organizationId,
				deviceIds: (req.body as any)?.deviceIds,
			});
			const planId = randomUUID();
			deviceUserMergePlans.set(planId, {
				organizationId: admin.organizationId,
				plan,
				createdAt: new Date(),
				req,
			});
			res.status(200).json(
				buildSuccessResponse("Device-user merge plan ready", { planId, ...plan }, 200),
			);
		} catch (error: any) {
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(
					error?.message || "Failed to build device-user merge plan",
					error?.statusCode || 500,
				),
			);
		}
	};

	const applyDeviceUserMergePlan = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;
			const planId = String((req.body as any)?.planId || "").trim();
			const stored = deviceUserMergePlans.get(planId);
			if (!stored || stored.organizationId !== admin.organizationId) {
				res.status(404).json(buildErrorResponse("Merge plan not found or expired", 404));
				return;
			}
			const reviewed = applyMergeChoices(stored.plan, {
				choices: (req.body as any)?.choices,
				applyAll: (req.body as any)?.applyAll,
			});
			if (!reviewed.executable) {
				res.status(409).json(
					buildErrorResponse(
						"Resolve every merge conflict before applying",
						409,
						reviewed.unresolved.map((item: any) => ({
							field: `${item.key}:${item.field}`,
							message: "Selection required",
						})),
					),
				);
				return;
			}
			const results: any[] = [];
			for (const user of reviewed.users) {
				const source = user.records[0];
				const sourceDevice =
					user.records.find((record) => record.deviceId === user.sourceDeviceId) ||
					source;
				for (const targetDeviceId of user.targetDeviceIds) {
					const existing = await (prisma as any).deviceUser.findFirst({
						where: {
							organizationId: admin.organizationId,
							deviceId: targetDeviceId,
							vendorUserId: source.vendorUserId,
						},
						select: { id: true, employeeId: true, rawPayload: true },
					});
					let copy: any = null;
					if (!existing?.id) {
						const sourceDeviceRow = (stored.plan.devices || []).find(
							(device: any) => device.id === sourceDevice.deviceId,
						);
						const targetDeviceRow = (stored.plan.devices || []).find(
							(device: any) => device.id === targetDeviceId,
						);
						if (sourceDeviceRow && targetDeviceRow) {
							try {
								copy = await copyHikvisionUserToPeerWithRetry({
									req,
									organizationId: admin.organizationId,
									sourceDevice: sourceDeviceRow,
									targetDevice: targetDeviceRow,
									employeeNo: source.vendorUserId,
									includeFingerprints: true,
									includeFaceRecognition: true,
								});
							} catch (error: any) {
								results.push({
									key: user.key,
									targetDeviceId,
									status: "copy_failed",
									error: error?.message || "Target-device copy failed",
								});
								continue;
							}
						}
					}
					const target = await (prisma as any).deviceUser.findFirst({
						where: {
							organizationId: admin.organizationId,
							deviceId: targetDeviceId,
							vendorUserId: source.vendorUserId,
						},
						select: { id: true, employeeId: true, rawPayload: true },
					});
					const data: any = {
						employeeId: target?.employeeId || user.employeeId || null,
						employeeNo: source.employeeNo || source.vendorUserId,
						displayName: source.displayName,
						status: source.status,
						validFrom: source.validFrom ? new Date(source.validFrom) : null,
						validTo: source.validTo ? new Date(source.validTo) : null,
						doorRight: source.doorRight,
						accessPlan: source.accessPlan,
						rawPayload: source.rawPayload,
						lastSyncedAt: new Date(),
					};
					if (target?.id)
						await (prisma as any).deviceUser.update({ where: { id: target.id }, data });
					else
						await (prisma as any).deviceUser.create({
							data: {
								organizationId: admin.organizationId,
								deviceId: targetDeviceId,
								vendorUserId: source.vendorUserId,
								...data,
							},
						});
					results.push({
						key: user.key,
						targetDeviceId,
						status: "applied",
						copyAttempt: copy?.attempt || 0,
					});
				}
				await logAudit(req, {
					userId: (req as any).userId || "unknown",
					action: config.AUDIT_LOG.ACTIONS.UPDATE,
					resource: config.AUDIT_LOG.RESOURCES.DEVICE,
					severity: config.AUDIT_LOG.SEVERITY.HIGH,
					entityType: config.AUDIT_LOG.ENTITY_TYPES.DEVICE,
					entityId: user.key,
					changesBefore: null,
					changesAfter: { merge: user, decisions: user.conflicts },
					description: "Applied reviewed Hikvision device-user union merge",
					organizationId: admin.organizationId,
				});
			}
			const reread = await buildLiveDeviceUserMergePlan({
				req,
				organizationId: admin.organizationId,
				deviceIds: stored.plan.deviceIds,
			});
			deviceUserMergePlans.delete(planId);
			await invalidateCache.byPattern("cache:device:*").catch(() => undefined);
			res.status(200).json(
				buildSuccessResponse(
					"Device-user merge applied",
					{
						planId,
						results,
						reread,
						remainingConflicts: reread.counts.conflicts,
						remainingMissing: reread.counts.missing,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(
					error?.message || "Failed to apply device-user merge",
					error?.statusCode || 500,
				),
			);
		}
	};

	const executeHikvisionDeviceUserPeerCopy = async (params: {
		req: Request;
		organizationId: string;
		sourceDevice: any;
		targetDevice: any;
		employeeNo: string;
		includeFingerprints: boolean;
		includeFaceRecognition: boolean;
		preparedVmCopyResult?: Awaited<ReturnType<typeof runHikvisionManualCopyOnVm>>;
	}) => {
		const sourceDeviceId = String(params.sourceDevice?.id || "").trim();
		const targetDeviceId = String(params.targetDevice?.id || "").trim();
		const employeeNo = String(params.employeeNo || "").trim();
		const timingStartedAt = Date.now();
		const timings: Record<string, number> = {};
		const timePhase = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
			const startedAt = Date.now();
			try {
				return await action();
			} finally {
				timings[name] = Date.now() - startedAt;
			}
		};
		const sourceDeviceUser: any = await timePhase("sourceDeviceUserLookupMs", () =>
			(prisma as any).deviceUser.findUnique({
				where: {
					organizationId_deviceId_vendorUserId: {
						organizationId: params.organizationId,
						deviceId: sourceDeviceId,
						vendorUserId: employeeNo,
					},
				},
				select: {
					id: true,
					vendorUserId: true,
					employeeId: true,
					status: true,
					lastSyncedAt: true,
					rawPayload: true,
				},
			}),
		);
		const existingTargetDeviceUser: any = await timePhase("targetDeviceUserLookupMs", () =>
			(prisma as any).deviceUser.findUnique({
				where: {
					organizationId_deviceId_vendorUserId: {
						organizationId: params.organizationId,
						deviceId: targetDeviceId,
						vendorUserId: employeeNo,
					},
				},
				select: {
					id: true,
					vendorUserId: true,
					employeeId: true,
					status: true,
					lastSyncedAt: true,
					rawPayload: true,
				},
			}),
		);
		const alreadyConverged =
			Boolean(sourceDeviceUser?.id) &&
			!shouldConvergeDeviceUserToPeer(sourceDeviceUser, existingTargetDeviceUser);
		const requiresPhysicalPeerCopy =
			!sourceDeviceUser?.id ||
			!existingTargetDeviceUser?.id ||
			(() => {
				const sourcePhysicalSummary = extractHikvisionCredentialSummary(
					sourceDeviceUser?.rawPayload || {},
				);
				const targetPhysicalSummary = extractHikvisionCredentialSummary(
					existingTargetDeviceUser?.rawPayload || {},
				);
				if (targetPhysicalSummary.cardCount < sourcePhysicalSummary.cardCount) return true;
				if (
					params.includeFingerprints &&
					targetPhysicalSummary.fingerprintCount < sourcePhysicalSummary.fingerprintCount
				) {
					return true;
				}
				return false;
			})();
		const copyResult = alreadyConverged
			? {
					waitSeconds: 0,
					strategy: "noop_already_synced",
					stdout: "",
					stderr: "",
					events: [
						{
							event: "peer_copy_noop_already_synced",
							sourceDeviceId,
							targetDeviceId,
							employeeNo,
						},
					],
				}
			: !requiresPhysicalPeerCopy
				? {
						waitSeconds: 0,
						strategy: "noop_overlay_only",
						stdout: "",
						stderr: "",
						events: [
							{
								event: "peer_copy_noop_overlay_only",
								sourceDeviceId,
								targetDeviceId,
								employeeNo,
							},
						],
					}
				: params.preparedVmCopyResult ||
					(await timePhase("vmManualCopyMs", () =>
						runHikvisionManualCopyOnVm({
							sourceDevice: params.sourceDevice,
							targetDevice: params.targetDevice,
							sourceDeviceId,
							targetDeviceId,
							employeeNo,
							includeFingerprints: params.includeFingerprints,
							includeFaceRecognition: params.includeFaceRecognition,
						}),
					));
		if (alreadyConverged) {
			return {
				sourceDeviceUser,
				targetDeviceUser: existingTargetDeviceUser,
				targetSyncSummary: {
					totalSourceRecords: 1,
					importableRecords: 1,
					created: 0,
					updated: 0,
					linked: 0,
					unmatched: 0,
					conflict: 0,
					disabled: 0,
					pruned: 0,
					noOpReason: "already_converged_persisted_truth",
				},
				vmCopy: {
					waitSeconds: copyResult.waitSeconds,
					strategy: copyResult.strategy,
					events: copyResult.events,
				},
				timings: {
					...timings,
					totalMs: Date.now() - timingStartedAt,
				},
				syntheticCredentialOverlayApplied: null,
			};
		}
		const { summary: targetSummary } = await timePhase("targetSingleUserRefreshMs", () =>
			syncSingleHikvisionDeviceUserFromSource({
				req: params.req,
				organizationId: params.organizationId,
				device: params.targetDevice,
				employeeNo,
			}),
		);
		await timePhase("peerLinkMirrorMs", () =>
			mirrorDeviceUserLinkToPeer({
				organizationId: params.organizationId,
				sourceDeviceId,
				targetDeviceId,
				vendorUserId: employeeNo,
			}),
		);

		let targetDeviceUser: any = await timePhase("targetDeviceUserVerifyLookupMs", () =>
			(prisma as any).deviceUser.findUnique({
				where: {
					organizationId_deviceId_vendorUserId: {
						organizationId: params.organizationId,
						deviceId: targetDeviceId,
						vendorUserId: employeeNo,
					},
				},
				select: {
					id: true,
					vendorUserId: true,
					employeeId: true,
					status: true,
					lastSyncedAt: true,
					rawPayload: true,
				},
			}),
		);
		if (!targetDeviceUser?.id) {
			throw new Error(
				"Copy completed at the SDK layer, but the target device user did not appear in refreshed HRIS truth",
			);
		}

		const sourceSyntheticFingerprintCount = readStoredHikvisionSyntheticFingerprintCount(
			sourceDeviceUser?.rawPayload || {},
		);
		const sourceSyntheticFaceCount = readStoredHikvisionSyntheticFaceCount(
			sourceDeviceUser?.rawPayload || {},
		);
		const sourceRealCredentialSummary = extractHikvisionCredentialSummary(
			sourceDeviceUser?.rawPayload || {},
		);
		const targetRealCredentialSummary = extractHikvisionCredentialSummary(
			targetDeviceUser?.rawPayload || {},
		);
		if (
			params.includeFingerprints &&
			sourceRealCredentialSummary.fingerprintCount >
				targetRealCredentialSummary.fingerprintCount
		) {
			const fingerprintEvents = copyResult.events.filter((event) =>
				String(event?.event || "")
					.toLowerCase()
					.includes("fingerprint"),
			);
			deviceLogger.warn(
				`Hikvision peer fingerprint verification mismatch for ${employeeNo}: source=${sourceRealCredentialSummary.fingerprintCount} target=${targetRealCredentialSummary.fingerprintCount} events=${JSON.stringify(
					fingerprintEvents.slice(-12),
				)}`,
			);
			throw new Error(
				`SDK copy returned, but refreshed target truth still shows ${hikvisionDeviceLabel(
					params.targetDevice,
				)} fingerprint count ${targetRealCredentialSummary.fingerprintCount} while ${hikvisionDeviceLabel(
					params.sourceDevice,
				)} has ${sourceRealCredentialSummary.fingerprintCount} for employee ${employeeNo}. Treat this as not copied yet and retry after the target device reports the template.`,
			);
		}
		if (sourceRealCredentialSummary.cardCount > targetRealCredentialSummary.cardCount) {
			throw new Error(
				`SDK copy returned, but refreshed target truth still shows ${hikvisionDeviceLabel(
					params.targetDevice,
				)} card count ${targetRealCredentialSummary.cardCount} while ${hikvisionDeviceLabel(
					params.sourceDevice,
				)} has ${sourceRealCredentialSummary.cardCount} for employee ${employeeNo}. Treat this as not copied yet and retry after the target device reports the card.`,
			);
		}
		const fingerprintSkippedNoTemplates = copyResult.events.some(
			(event) =>
				event?.event === "peer_fingerprint_write_skipped" &&
				String(event?.employeeNo || "").trim() === employeeNo &&
				String(event?.reason || "").trim() === "no_source_templates",
		);
		let syntheticCredentialOverlayApplied: Record<string, any> | null = null;
		if (
			params.includeFingerprints &&
			sourceSyntheticFingerprintCount > 0 &&
			(sourceRealCredentialSummary.fingerprintCount <= 0 || fingerprintSkippedNoTemplates)
		) {
			targetDeviceUser = await updateHikvisionSyntheticFingerprintTally({
				organizationId: params.organizationId,
				deviceId: targetDeviceId,
				vendorUserId: employeeNo,
				fingerprintCount: sourceSyntheticFingerprintCount,
				copiedFromDeviceId: sourceDeviceId,
				copiedFromVendorUserId: employeeNo,
				note: "Copied as dev-only synthetic fingerprint tally because no real source templates were available",
			});
			syntheticCredentialOverlayApplied = {
				...(syntheticCredentialOverlayApplied || {}),
				fingerprintCount: sourceSyntheticFingerprintCount,
				fingerprintReason: "no_real_source_templates",
			};
		}
		if (sourceSyntheticFaceCount > 0) {
			targetDeviceUser = await updateHikvisionSyntheticFaceTally({
				organizationId: params.organizationId,
				deviceId: targetDeviceId,
				vendorUserId: employeeNo,
				faceCount: sourceSyntheticFaceCount,
				copiedFromDeviceId: sourceDeviceId,
				copiedFromVendorUserId: employeeNo,
				note: "Copied as dev-only synthetic face tally for cross-device verification",
			});
			syntheticCredentialOverlayApplied = {
				...(syntheticCredentialOverlayApplied || {}),
				faceCount: sourceSyntheticFaceCount,
				faceReason: "dev_mock_face_overlay",
			};
		}

		return {
			sourceDeviceUser,
			targetDeviceUser,
			targetSyncSummary: targetSummary,
			vmCopy: {
				waitSeconds: copyResult.waitSeconds,
				strategy: copyResult.strategy,
				events: copyResult.events,
			},
			timings: {
				...timings,
				totalMs: Date.now() - timingStartedAt,
			},
			syntheticCredentialOverlayApplied,
		};
	};

	const copyHikvisionUserToPeerWithRetry = async (params: {
		req: Request;
		organizationId: string;
		sourceDevice: any;
		targetDevice: any;
		employeeNo: string;
		includeFingerprints: boolean;
		includeFaceRecognition: boolean;
		retryLimit?: number;
	}) => {
		let lastError: any = null;
		const retryLimit = Math.max(
			1,
			Math.floor(Number(params.retryLimit || HIKVISION_PEER_COPY_RETRY_LIMIT)),
		);
		for (let attempt = 1; attempt <= retryLimit; attempt += 1) {
			try {
				const result = await executeHikvisionDeviceUserPeerCopy(params);
				return {
					...result,
					attempt,
					retried: attempt > 1,
				};
			} catch (error: any) {
				lastError = error;
				if (isDeterministicHikvisionManualCopySdkFailure(error?.message || error)) break;
				if (attempt >= retryLimit) break;
				await sleep(600 * attempt);
			}
		}
		throw lastError || new Error("Hikvision peer copy failed");
	};

	const copyHikvisionUserToPeersBatch = async (params: {
		req: Request;
		organizationId: string;
		sourceDevice: any;
		targetDevices: any[];
		employeeNo: string;
		includeFingerprints: boolean;
		includeFaceRecognition: boolean;
		forcePhysicalCopy?: boolean;
		onProgress?: (event: any) => void;
	}) => {
		const startedAt = Date.now();
		const sourceDeviceId = String(params.sourceDevice.id);
		const targetDeviceIds = params.targetDevices.map((device) => String(device.id));
		const sourceRefreshStartedAt = Date.now();
		const sourceRefreshRetryLimit = Math.max(
			1,
			Math.min(
				Number(process.env.HIKVISION_MERGE_SOURCE_REFRESH_RETRY_LIMIT || 4),
				6,
			),
		);
		// Refresh source AND every target from live device truth before planning.
		// Prior merge overlays often polluted DeviceUser.numOfFP/numOfFace without a real
		// peer write, which made alreadyConverged=true and skipped needed physical copies.
		for (let sourceAttempt = 1; sourceAttempt <= sourceRefreshRetryLimit; sourceAttempt += 1) {
			try {
				await syncSingleHikvisionDeviceUserFromSource({
					req: params.req,
					organizationId: params.organizationId,
					device: params.sourceDevice,
					employeeNo: params.employeeNo,
				});
				break;
			} catch (error: any) {
				const detail = String(error?.message || error || "");
				const retryable =
					isHikvisionTransportFailure(detail) ||
					/(fetch failed|ECONNREFUSED|Unauthorized|timed out|timeout)/i.test(detail);
				if (!retryable || sourceAttempt >= sourceRefreshRetryLimit) throw error;
				const retryDelayMs = Math.min(12_000, 4_000 * sourceAttempt);
				params.onProgress?.({
					stage: "source_refresh_retry_wait",
					userKey: `vendor:${params.employeeNo}`,
					vendorUserId: params.employeeNo,
					sourceDeviceId,
					sourceDeviceName:
						params.sourceDevice?.name || params.sourceDevice?.address || sourceDeviceId,
					attempt: sourceAttempt,
					retryLimit: sourceRefreshRetryLimit,
					retryDelayMs,
					error: detail,
					message: `Source refresh transport failed for user ${params.employeeNo}; waiting for tunnel recovery before retry ${sourceAttempt + 1}/${sourceRefreshRetryLimit}.`,
				});
				await sleep(retryDelayMs);
			}
		}
		await Promise.all(
			params.targetDevices.map(async (targetDevice) => {
				try {
					await syncSingleHikvisionDeviceUserFromSource({
						req: params.req,
						organizationId: params.organizationId,
						device: targetDevice,
						employeeNo: params.employeeNo,
					});
				} catch (error: any) {
					deviceLogger.warn(
						`Target single-user refresh failed before peer copy for ${params.employeeNo} on ${targetDevice?.name || targetDevice?.id}: ${error?.message || error}`,
					);
				}
			}),
		);
		const sourceRefreshMs = Date.now() - sourceRefreshStartedAt;
		const savedUsers = await (prisma as any).deviceUser.findMany({
			where: {
				organizationId: params.organizationId,
				deviceId: { in: [sourceDeviceId, ...targetDeviceIds] },
				vendorUserId: params.employeeNo,
			},
			select: {
				id: true,
				deviceId: true,
				vendorUserId: true,
				employeeId: true,
				status: true,
				lastSyncedAt: true,
				rawPayload: true,
			},
		});
		const savedUserByDeviceId = new Map(
			savedUsers.map((deviceUser: any) => [String(deviceUser.deviceId), deviceUser]),
		);
		const sourceDeviceUser: any = savedUserByDeviceId.get(sourceDeviceId) || null;
		// Prefer physical device counts (numOfFP/numOfFace), not synthetic merge overlays.
		const sourcePhysicalSummary = extractHikvisionCredentialSummary(
			sourceDeviceUser?.rawPayload || {},
		);
		const plans = params.targetDevices.map((targetDevice) => {
			const targetDeviceUser: any = savedUserByDeviceId.get(String(targetDevice.id)) || null;
			const targetPhysicalSummary = extractHikvisionCredentialSummary(
				targetDeviceUser?.rawPayload || {},
			);
			const credentialGap =
				targetPhysicalSummary.cardCount < sourcePhysicalSummary.cardCount ||
				(params.includeFingerprints &&
					targetPhysicalSummary.fingerprintCount <
						sourcePhysicalSummary.fingerprintCount) ||
				(params.includeFaceRecognition &&
					targetPhysicalSummary.faceCount < sourcePhysicalSummary.faceCount);
			// Never trust "converged" when live physical credential counts still lag the source.
			const alreadyConverged =
				!params.forcePhysicalCopy &&
				Boolean(sourceDeviceUser?.id) &&
				!credentialGap &&
				!shouldConvergeDeviceUserToPeer(sourceDeviceUser, targetDeviceUser);
			const requiresPhysicalPeerCopy =
				params.forcePhysicalCopy ||
				!sourceDeviceUser?.id ||
				!targetDeviceUser?.id ||
				credentialGap;
			return { targetDevice, alreadyConverged, requiresPhysicalPeerCopy };
		});

		const physicalPlans = plans.filter(
			(plan) => !plan.alreadyConverged && plan.requiresPhysicalPeerCopy,
		);
		const preflightFailures = new Map<string, string>();
		let sharedVmCopyResult: Awaited<ReturnType<typeof runHikvisionManualCopyOnVm>> | undefined;
		let sharedVmCopyError = "";
		let vmAttempt = 0;
		let vmManualCopyMs = 0;
		const preflightStartedAt = Date.now();
		if (physicalPlans.length) {
			try {
				const preflightResults = await preflightHikvisionManualCopyEndpoints(
					[
						{ device: params.sourceDevice, role: "source" },
						...physicalPlans.map(({ targetDevice }) => ({
							device: targetDevice,
							role: "target" as const,
						})),
					],
					params.employeeNo,
				);
				const sourcePreflight = preflightResults.find((result) => result.role === "source");
				if (!sourcePreflight?.ok) {
					throw new Error(
						`${hikvisionDeviceLabel(params.sourceDevice)} cannot be used as the SDK copy source for employee ${params.employeeNo} right now (VM cannot reach ${sourcePreflight?.host}:${sourcePreflight?.port} before SDK login).`,
					);
				}
				for (const targetPreflight of preflightResults.filter(
					(result) => result.role === "target" && !result.ok,
				)) {
					preflightFailures.set(
						targetPreflight.deviceId,
						`${hikvisionDeviceLabel(targetPreflight.device)} cannot be used as the SDK copy target for employee ${params.employeeNo} right now (VM cannot reach ${targetPreflight.host}:${targetPreflight.port} before SDK login).`,
					);
				}
			} catch (error: any) {
				sharedVmCopyError = error?.message || "The Hikvision source device is unavailable";
			}
			if (!sharedVmCopyError) {
				const reachableTargets = physicalPlans
					.map((plan) => plan.targetDevice)
					.filter((targetDevice) => !preflightFailures.has(String(targetDevice.id)));
				if (reachableTargets.length) {
					const batchVmRetryLimit = Math.max(
						1,
						Math.min(
							Number(process.env.HIKVISION_MERGE_BATCH_VM_RETRY_LIMIT || 3),
							HIKVISION_PEER_COPY_RETRY_LIMIT,
						),
					);
					for (vmAttempt = 1; vmAttempt <= batchVmRetryLimit; vmAttempt += 1) {
						const vmCopyStartedAt = Date.now();
						try {
							sharedVmCopyResult = await runHikvisionManualCopyOnVm({
								sourceDevice: params.sourceDevice,
								targetDevices: reachableTargets,
								sourceDeviceId,
								employeeNo: params.employeeNo,
								includeFingerprints: params.includeFingerprints,
								includeFaceRecognition: params.includeFaceRecognition,
								skipPreflight: true,
								onProgress: params.onProgress,
							});
							vmManualCopyMs += Date.now() - vmCopyStartedAt;
							break;
						} catch (error: any) {
							vmManualCopyMs += Date.now() - vmCopyStartedAt;
							sharedVmCopyError =
								error?.message || "The coordinated VM SDK copy failed";
							params.onProgress?.({
								stage: "vm_copy_batch_attempt_failed",
								userKey: `vendor:${params.employeeNo}`,
								vendorUserId: params.employeeNo,
								sourceDeviceId,
								sourceDeviceName:
									params.sourceDevice?.name || params.sourceDevice?.address,
								targetDeviceIds: reachableTargets.map((device) => device.id),
								targetDeviceNames: reachableTargets.map(
									(device) => device.name || device.address,
								),
								targetCount: reachableTargets.length,
								vmAttempt,
								vmRetryLimit: batchVmRetryLimit,
								error: sharedVmCopyError,
								message: `VM SDK batch attempt ${vmAttempt}/${batchVmRetryLimit} failed for user ${params.employeeNo}.`,
							});
							if (vmAttempt < batchVmRetryLimit) await sleep(2_000 * vmAttempt);
						}
					}
				}
			}
		}
		const preflightMs = Date.now() - preflightStartedAt;

		const verificationStartedAt = Date.now();
		const settled = await Promise.allSettled(
			plans.map(async (plan) => {
				const targetDeviceId = String(plan.targetDevice.id);
				const preflightError = preflightFailures.get(targetDeviceId);
				if (preflightError) throw new Error(preflightError);
				if (
					!plan.alreadyConverged &&
					plan.requiresPhysicalPeerCopy &&
					!sharedVmCopyResult
				) {
					throw new Error(
						sharedVmCopyError || "The coordinated VM SDK copy did not start",
					);
				}
				const copy = await executeHikvisionDeviceUserPeerCopy({
					req: params.req,
					organizationId: params.organizationId,
					sourceDevice: params.sourceDevice,
					targetDevice: plan.targetDevice,
					employeeNo: params.employeeNo,
					includeFingerprints: params.includeFingerprints,
					includeFaceRecognition: params.includeFaceRecognition,
					preparedVmCopyResult: sharedVmCopyResult,
				});
				return { plan, copy };
			}),
		);
		const verificationMs = Date.now() - verificationStartedAt;
		const results = settled.map((result, index) => {
			const plan = plans[index];
			const targetDevice = plan.targetDevice;
			if (result.status === "rejected") {
				return {
					targetDevice: { id: targetDevice.id, name: targetDevice.name },
					status: "failed",
					alreadyConverged: plan.alreadyConverged,
					requiresPhysicalPeerCopy: plan.requiresPhysicalPeerCopy,
					error: result.reason?.message || "Target verification failed",
				};
			}
			return {
				targetDevice: { id: targetDevice.id, name: targetDevice.name },
				status: "success",
				alreadyConverged: plan.alreadyConverged,
				requiresPhysicalPeerCopy: plan.requiresPhysicalPeerCopy,
				vmCopy: result.value.copy.vmCopy,
				targetSyncSummary: result.value.copy.targetSyncSummary,
				targetDeviceUser: result.value.copy.targetDeviceUser,
				timings: result.value.copy.timings,
				syntheticCredentialOverlayApplied:
					result.value.copy.syntheticCredentialOverlayApplied,
			};
		});
		const successful = results.filter((result) => result.status === "success").length;
		return {
			results,
			summary: {
				totalTargets: results.length,
				successfulTargets: successful,
				failedTargets: results.length - successful,
				alreadyConvergedTargets: plans.filter((plan) => plan.alreadyConverged).length,
				physicalCopyTargets: physicalPlans.length,
				vmSessionCount: sharedVmCopyResult ? 1 : 0,
				vmAttempt,
			},
			timings: {
				sourceRefreshMs,
				preflightMs,
				vmManualCopyMs,
				verificationMs,
				totalMs: Date.now() - startedAt,
			},
		};
	};

	const copyHikvisionDeviceUserToPeer = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;

			const sourceDeviceId = String(req.body?.sourceDeviceId || "").trim();
			const legacyTargetDeviceId = String(req.body?.targetDeviceId || "").trim();
			const requestedTargetDeviceIds = Array.isArray(req.body?.targetDeviceIds)
				? req.body.targetDeviceIds.map((value: any) => String(value || "").trim())
				: [];
			const targetDeviceIds = Array.from(
				new Set([legacyTargetDeviceId, ...requestedTargetDeviceIds].filter(Boolean)),
			).filter((deviceId) => deviceId !== sourceDeviceId);
			const employeeNo = String(req.body?.employeeNo || req.body?.vendorUserId || "").trim();
			const includeFingerprints = req.body?.includeFingerprints !== false;
			const includeFaceRecognition = req.body?.includeFaceRecognition !== false;
			const isDryRun = req.body?.dryRun === true || req.body?.execute === false;
			const requestStartedAt = Date.now();

			if (!sourceDeviceId || !targetDeviceIds.length || !employeeNo) {
				res.status(400).json(
					buildErrorResponse(
						"sourceDeviceId, targetDeviceId or targetDeviceIds, and employeeNo are required",
						400,
					),
				);
				return;
			}
			if (targetDeviceIds.length > 25) {
				res.status(400).json(
					buildErrorResponse(
						"A peer-copy request can include at most 25 target devices",
						400,
					),
				);
				return;
			}

			const devices = await prisma.device.findMany({
				where: {
					organizationId: String(admin.organizationId),
					isDeleted: false,
					id: { in: [sourceDeviceId, ...targetDeviceIds] },
				},
			});
			const sourceDevice = devices.find((device) => device.id === sourceDeviceId);
			const targetDevices = targetDeviceIds
				.map((targetDeviceId) => devices.find((device) => device.id === targetDeviceId))
				.filter(Boolean) as any[];
			if (!sourceDevice || targetDevices.length !== targetDeviceIds.length) {
				res.status(404).json(
					buildErrorResponse("Source or one or more target devices were not found", 404),
				);
				return;
			}
			if (
				!isHikvisionDevice(sourceDevice) ||
				targetDevices.some((device) => !isHikvisionDevice(device))
			) {
				res.status(400).json(
					buildErrorResponse(
						"The source and every target device must be Hikvision devices",
						400,
					),
				);
				return;
			}
			if (isDryRun) {
				const sourceDeviceUser = await (prisma as any).deviceUser.findUnique({
					where: {
						organizationId_deviceId_vendorUserId: {
							organizationId: String(admin.organizationId),
							deviceId: sourceDeviceId,
							vendorUserId: employeeNo,
						},
					},
					select: {
						id: true,
						vendorUserId: true,
						employeeId: true,
						status: true,
						lastSyncedAt: true,
						rawPayload: true,
					},
				});
				const sourcePhysicalSummary = extractHikvisionCredentialSummary(
					sourceDeviceUser?.rawPayload || {},
				);
				const targetDeviceUsers = await (prisma as any).deviceUser.findMany({
					where: {
						organizationId: String(admin.organizationId),
						deviceId: { in: targetDeviceIds },
						vendorUserId: employeeNo,
					},
					select: {
						id: true,
						deviceId: true,
						vendorUserId: true,
						employeeId: true,
						status: true,
						lastSyncedAt: true,
						rawPayload: true,
					},
				});
				const targetUserByDeviceId = new Map(
					targetDeviceUsers.map((deviceUser: any) => [
						String(deviceUser.deviceId),
						deviceUser,
					]),
				);
				const plans = targetDevices.map((targetDevice) => {
					const targetDeviceUser: any =
						targetUserByDeviceId.get(String(targetDevice.id)) || null;
					const alreadyConverged =
						Boolean(sourceDeviceUser?.id) &&
						!shouldConvergeDeviceUserToPeer(sourceDeviceUser, targetDeviceUser);
					const targetPhysicalSummary = extractHikvisionCredentialSummary(
						targetDeviceUser?.rawPayload || {},
					);
					const requiresPhysicalPeerCopy =
						!sourceDeviceUser?.id ||
						!targetDeviceUser?.id ||
						targetPhysicalSummary.cardCount < sourcePhysicalSummary.cardCount ||
						(includeFingerprints &&
							targetPhysicalSummary.fingerprintCount <
								sourcePhysicalSummary.fingerprintCount) ||
						(includeFaceRecognition &&
							targetPhysicalSummary.faceCount < sourcePhysicalSummary.faceCount);
					return {
						targetDevice: { id: targetDevice.id, name: targetDevice.name },
						alreadyConverged,
						requiresPhysicalPeerCopy,
						plannedStages: alreadyConverged
							? ["noop_already_synced"]
							: !requiresPhysicalPeerCopy
								? [
										"noop_overlay_only",
										"target_single_user_refresh",
										"peer_link_mirror",
									]
								: [
										"vm_manual_copy",
										"target_single_user_refresh",
										"peer_link_mirror",
										"credential_verification",
									],
						targetCredentialSummary: targetPhysicalSummary,
						targetDeviceUserFound: Boolean(targetDeviceUser?.id),
					};
				});
				const firstPlan = plans[0];
				res.status(200).json(
					buildSuccessResponse(
						"Dry run only; no Hikvision device or HRIS records were changed",
						{
							dryRun: true,
							execute: false,
							sourceDevice: {
								id: sourceDevice.id,
								name: sourceDevice.name,
							},
							targetDevice: firstPlan.targetDevice,
							targetDevices: plans.map((plan) => plan.targetDevice),
							plans,
							employeeNo,
							includeFingerprints,
							includeFaceRecognition,
							alreadyConverged: firstPlan.alreadyConverged,
							requiresPhysicalPeerCopy: firstPlan.requiresPhysicalPeerCopy,
							plannedStages: firstPlan.plannedStages,
							sourceCredentialSummary: sourcePhysicalSummary,
							targetCredentialSummary: firstPlan.targetCredentialSummary,
							sourceDeviceUserFound: Boolean(sourceDeviceUser?.id),
							targetDeviceUserFound: firstPlan.targetDeviceUserFound,
							timings: {
								totalMs: Date.now() - requestStartedAt,
							},
						},
						200,
					),
				);
				return;
			}
			if (targetDevices.length > 1 || requestedTargetDeviceIds.length > 0) {
				const batchData = await copyHikvisionUserToPeersBatch({
					req,
					organizationId: String(admin.organizationId),
					sourceDevice,
					targetDevices,
					employeeNo,
					includeFingerprints,
					includeFaceRecognition,
				});
				logActivity(req, {
					userId: String((req as any).userId || "unknown"),
					action: "HIKVISION_DEVICE_USER_COPY_BATCH",
					description: `Copied Hikvision device user ${employeeNo} from ${sourceDevice.name} to ${batchData.summary.successfulTargets}/${batchData.summary.totalTargets} peer devices`,
					page: { url: req.originalUrl, title: "Device Users" },
				});
				res.status(200).json(
					buildSuccessResponse(
						"Hikvision device user peer copy batch completed",
						{
							sourceDevice: { id: sourceDevice.id, name: sourceDevice.name },
							employeeNo,
							includeFingerprints,
							includeFaceRecognition,
							...batchData,
						},
						200,
					),
				);
				return;
			}
			const targetDevice = targetDevices[0];
			const copyData = await copyHikvisionUserToPeerWithRetry({
				req,
				organizationId: String(admin.organizationId),
				sourceDevice,
				targetDevice,
				employeeNo,
				includeFingerprints,
				includeFaceRecognition,
			});

			logActivity(req, {
				userId: String((req as any).userId || "unknown"),
				action: "HIKVISION_DEVICE_USER_COPY",
				description: `Copied Hikvision device user ${employeeNo} from ${sourceDevice.name} to ${targetDevice.name}`,
				page: {
					url: req.originalUrl,
					title: "Device Users",
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Hikvision device user copied to peer device",
					{
						sourceDevice: {
							id: sourceDevice.id,
							name: sourceDevice.name,
						},
						targetDevice: {
							id: targetDevice.id,
							name: targetDevice.name,
						},
						employeeNo,
						includeFingerprints,
						includeFaceRecognition,
						vmCopy: copyData.vmCopy,
						retry: {
							attempt: copyData.attempt,
							retried: copyData.retried,
						},
						syntheticCredentialOverlayApplied:
							copyData.syntheticCredentialOverlayApplied,
						targetSyncSummary: copyData.targetSyncSummary,
						targetDeviceUser: copyData.targetDeviceUser,
						timings: {
							...copyData.timings,
							requestTotalMs: Date.now() - requestStartedAt,
						},
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Hikvision peer copy failed: ${error?.message || error}`);
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to copy Hikvision device user", 500),
			);
		}
	};

	/**
	 * Admin-only labeled synthetic kiosk biometric tap.
	 * Creates a claimable DeviceEvent without physical-device reachability so
	 * employee-portal claim, Playwright, and admin saved-event/realtime can be
	 * proven offline. Payload and source are explicitly synthetic.
	 */
	const createSyntheticKioskLoginTap = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;

			const deviceId = String(req.body?.deviceId || "").trim();
			const employeeId = String(req.body?.employeeId || "").trim();
			const employeeNo = String(req.body?.employeeNo || req.body?.vendorUserId || "").trim();
			const note = String(req.body?.note || "").trim();
			if (!deviceId) {
				res.status(400).json(buildErrorResponse("deviceId is required", 400));
				return;
			}

			const device = await prisma.device.findFirst({
				where: {
					id: deviceId,
					organizationId: admin.organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					organizationId: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
				},
			});
			if (!device) {
				res.status(404).json(buildErrorResponse("Device not found", 404));
				return;
			}

			const kioskConfig = (() => {
				const cfg =
					device.config &&
					typeof device.config === "object" &&
					!Array.isArray(device.config)
						? (device.config as Record<string, any>)
						: {};
				return {
					enabled: cfg.employeeKioskLoginEnabled === true,
					windowSeconds: Number(cfg.employeeKioskLoginWindowSeconds) || 12,
					appCode: String(cfg.employeeKioskLoginAppCode || "hris").trim() || "hris",
				};
			})();
			if (!kioskConfig.enabled) {
				res.status(400).json(
					buildErrorResponse(
						"Device does not have employeeKioskLoginEnabled=true; enable kiosk login before injecting a synthetic tap",
						400,
					),
				);
				return;
			}

			let resolvedEmployee: {
				id: string;
				userId: string | null;
				employeeId: string | null;
				deviceEmpId: string | null;
				organizationId: string;
			} | null = null;
			if (employeeId) {
				resolvedEmployee = await prisma.employee.findFirst({
					where: {
						id: employeeId,
						organizationId: admin.organizationId,
						isDeleted: false,
					},
					select: {
						id: true,
						userId: true,
						employeeId: true,
						deviceEmpId: true,
						organizationId: true,
					},
				});
			} else if (employeeNo) {
				const candidates = await prisma.employee.findMany({
					where: {
						organizationId: admin.organizationId,
						isDeleted: false,
						OR: [{ deviceEmpId: employeeNo }, { employeeId: employeeNo }],
					},
					select: {
						id: true,
						userId: true,
						employeeId: true,
						deviceEmpId: true,
						organizationId: true,
					},
					take: 5,
				});
				resolvedEmployee = candidates[0] || null;
			} else {
				// Prefer a DeviceUser already linked to an employee on this device.
				const linkedUser = await (prisma as any).deviceUser.findFirst({
					where: {
						deviceId: device.id,
						organizationId: admin.organizationId,
						isDeleted: false,
						employeeId: { not: null },
					},
					orderBy: { updatedAt: "desc" },
					select: {
						employeeId: true,
						employeeNo: true,
						vendorUserId: true,
					},
				});
				if (linkedUser?.employeeId) {
					resolvedEmployee = await prisma.employee.findFirst({
						where: {
							id: String(linkedUser.employeeId),
							organizationId: admin.organizationId,
							isDeleted: false,
						},
						select: {
							id: true,
							userId: true,
							employeeId: true,
							deviceEmpId: true,
							organizationId: true,
						},
					});
				}
			}

			if (!resolvedEmployee?.id) {
				res.status(404).json(
					buildErrorResponse(
						"No linked employee found for synthetic kiosk tap. Pass employeeId or employeeNo for a user with an HRIS account link.",
						404,
					),
				);
				return;
			}
			if (!resolvedEmployee.userId) {
				res.status(400).json(
					buildErrorResponse(
						"Employee has no linked user account; kiosk claim cannot issue a session",
						400,
					),
				);
				return;
			}

			const now = new Date();
			const resolvedEmployeeNo =
				employeeNo ||
				String(resolvedEmployee.deviceEmpId || resolvedEmployee.employeeId || "").trim() ||
				null;
			const dedupeKey = [
				"synthetic-kiosk-tap",
				device.id,
				resolvedEmployee.id,
				now.toISOString(),
				randomUUID(),
			].join(":");

			const eventRecord = await (prisma as any).deviceEvent.create({
				data: {
					organizationId: admin.organizationId,
					deviceId: device.id,
					employeeId: resolvedEmployee.id,
					eventTime: now,
					receivedAt: now,
					employeeNo: resolvedEmployeeNo,
					// Persist a currently-valid enum value; synthetic flag lives in payload/label.
					source: SYNTHETIC_KIOSK_TAP_PERSISTED_SOURCE,
					status: "MATCHED",
					eventCategory: "ATTENDANCE",
					eventAction: "TAP",
					eventLabel: "Synthetic kiosk login tap (not a physical device event)",
					eventConfidence: "INFERRED",
					eventType: "SyntheticKioskLoginTap",
					dedupeKey,
					payload: {
						synthetic: true,
						syntheticKind: "kiosk-login-tap",
						syntheticSource: SYNTHETIC_KIOSK_TAP_SOURCE,
						physicalDeviceTruth: false,
						persistedSource: SYNTHETIC_KIOSK_TAP_PERSISTED_SOURCE,
						note:
							note ||
							"Admin-injected synthetic kiosk tap for offline claim/Playwright proof",
						deviceId: device.id,
						deviceName: device.name,
						deviceIP: device.address,
						employeeId: resolvedEmployee.id,
						employeeNo: resolvedEmployeeNo,
						userId: resolvedEmployee.userId,
						kioskWindowSeconds: kioskConfig.windowSeconds,
						appCode: kioskConfig.appCode,
						injectedByRole: admin.role,
						injectedAt: now.toISOString(),
					},
				},
			});

			await invalidateCache.byPattern("cache:device:events:*").catch(() => undefined);

			const realtimeRow = {
				...eventRecord,
				device: {
					id: device.id,
					name: device.name,
					address: device.address,
					port: device.port,
					protocol: device.protocol,
				},
				employee: {
					id: resolvedEmployee.id,
					employeeId: resolvedEmployee.employeeId,
					deviceEmpId: resolvedEmployee.deviceEmpId,
				},
			};
			const realtimePayload = emitDeviceEventSaved((req as any).io, realtimeRow);

			res.status(201).json(
				buildSuccessResponse(
					"Synthetic kiosk login tap created (not physical device truth)",
					{
						synthetic: true,
						physicalDeviceTruth: false,
						source: SYNTHETIC_KIOSK_TAP_SOURCE,
						persistedSource: SYNTHETIC_KIOSK_TAP_PERSISTED_SOURCE,
						eventId: eventRecord.id,
						deviceId: device.id,
						deviceName: device.name,
						employeeId: resolvedEmployee.id,
						userId: resolvedEmployee.userId,
						employeeNo: resolvedEmployeeNo,
						eventTime: eventRecord.eventTime,
						status: eventRecord.status,
						eventCategory: eventRecord.eventCategory,
						eventAction: eventRecord.eventAction,
						kioskWindowSeconds: kioskConfig.windowSeconds,
						claimableUntil: new Date(
							now.getTime() + Math.max(3, kioskConfig.windowSeconds) * 1000,
						).toISOString(),
						realtimeEmitted: Boolean(realtimePayload),
						claimPath: "POST /api/auth/biometric/kiosk-login/claim",
					},
					201,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`createSyntheticKioskLoginTap failed: ${error?.message || error}`);
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to create synthetic kiosk tap", 500),
			);
		}
	};

	const mockHikvisionFingerprintTally = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;

			const deviceId = String(req.body?.deviceId || "").trim();
			const vendorUserId = String(
				req.body?.vendorUserId || req.body?.employeeNo || "",
			).trim();
			const targetDeviceId = String(req.body?.targetDeviceId || "").trim();
			const fingerprintCount = Math.max(
				0,
				Math.min(10, Math.floor(Number(req.body?.fingerprintCount) || 0)),
			);
			if (!deviceId || !vendorUserId) {
				res.status(400).json(
					buildErrorResponse("deviceId and vendorUserId are required", 400),
				);
				return;
			}

			const deviceIds = [deviceId, targetDeviceId].filter(Boolean);
			const devices = await prisma.device.findMany({
				where: {
					organizationId: String(admin.organizationId),
					isDeleted: false,
					id: { in: deviceIds },
				},
			});
			const sourceDevice = devices.find((device) => device.id === deviceId);
			const targetDevice = targetDeviceId
				? devices.find((device) => device.id === targetDeviceId)
				: null;
			if (!sourceDevice) {
				res.status(404).json(buildErrorResponse("Source device was not found", 404));
				return;
			}
			if (!isHikvisionDevice(sourceDevice)) {
				res.status(400).json(buildErrorResponse("Source device must be Hikvision", 400));
				return;
			}
			if (targetDeviceId) {
				if (!targetDevice) {
					res.status(404).json(buildErrorResponse("Target device was not found", 404));
					return;
				}
				if (!isHikvisionDevice(targetDevice)) {
					res.status(400).json(
						buildErrorResponse("Target device must be Hikvision", 400),
					);
					return;
				}
			}

			const sourceDeviceUser = await updateHikvisionSyntheticFingerprintTally({
				organizationId: String(admin.organizationId),
				deviceId,
				vendorUserId,
				fingerprintCount,
				note:
					fingerprintCount > 0
						? "Applied as dev-only synthetic fingerprint tally for UI verification"
						: "Cleared dev-only synthetic fingerprint tally",
			});
			const targetDeviceUser =
				targetDeviceId && targetDevice
					? await updateHikvisionSyntheticFingerprintTally({
							organizationId: String(admin.organizationId),
							deviceId: targetDeviceId,
							vendorUserId,
							fingerprintCount,
							copiedFromDeviceId: deviceId,
							copiedFromVendorUserId: vendorUserId,
							note:
								fingerprintCount > 0
									? "Copied as dev-only synthetic fingerprint tally for peer verification"
									: "Cleared dev-only synthetic fingerprint tally",
						})
					: null;

			logActivity(req, {
				userId: String((req as any).userId || "unknown"),
				action: "HIKVISION_DEVICE_USER_MOCK_FINGERPRINT",
				description:
					fingerprintCount > 0
						? `Applied dev-only synthetic fingerprint tally ${fingerprintCount} to Hikvision device user ${vendorUserId}`
						: `Cleared dev-only synthetic fingerprint tally for Hikvision device user ${vendorUserId}`,
				page: {
					url: req.originalUrl,
					title: "Device Users",
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					fingerprintCount > 0
						? "Synthetic fingerprint tally applied"
						: "Synthetic fingerprint tally cleared",
					{
						deviceId,
						targetDeviceId: targetDeviceId || null,
						vendorUserId,
						fingerprintCount,
						synthetic: true,
						sourceDeviceUser,
						targetDeviceUser,
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(
				`Hikvision synthetic fingerprint tally failed: ${error?.message || error}`,
			);
			res.status(500).json(
				buildErrorResponse(
					error?.message || "Failed to apply synthetic fingerprint tally",
					500,
				),
			);
		}
	};

	const mirrorHikvisionFaceToPeers = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;
			const sourceDeviceId = String(req.body?.sourceDeviceId || "").trim();
			const employeeNo = String(req.body?.employeeNo || req.body?.vendorUserId || "").trim();
			if (!sourceDeviceId || !employeeNo) {
				res.status(400).json(
					buildErrorResponse("sourceDeviceId and employeeNo are required", 400),
				);
				return;
			}
			const sourceDevice = await prisma.device.findFirst({
				where: {
					id: sourceDeviceId,
					organizationId: String(admin.organizationId),
					isDeleted: false,
				},
			});
			if (!sourceDevice || !isHikvisionDevice(sourceDevice)) {
				res.status(404).json(
					buildErrorResponse("Hikvision source device was not found", 404),
				);
				return;
			}
			const result = await runHikvisionListenerVmCommand(
				[
					"sudo",
					"env",
					"HIKVISION_DEVICE_SPEC_OVERRIDE=/etc/project-truth/hikvision-live-device.spec",
					"HIKVISION_SKIP_SPOOL_REPLAY=1",
					"HIKVISION_RUN_SECONDS=8",
					HIKVISION_VM_WRAPPER_REMOTE_PATH,
					"--run-once",
					"--mirror-face-source-device-id",
					sourceDeviceId,
					"--mirror-face-employee-no",
					employeeNo,
				],
				30000,
			);
			const events = parseJsonLines(result.stdout);
			if (result.exitCode !== 0) {
				res.status(502).json(
					buildErrorResponse(
						result.stderr.trim() ||
							result.stdout.trim() ||
							"Hikvision face mirror failed",
						502,
					),
				);
				return;
			}
			const completed =
				events.find((event) => event.event === "manual_face_mirror_completed") || null;
			logActivity(req, {
				userId: String((req as any).userId || "unknown"),
				action: "HIKVISION_FACE_MIRROR",
				description: `Mirrored Hikvision face for ${employeeNo} from ${sourceDevice.name} to peers`,
				page: { url: req.originalUrl, title: "Device Users" },
			});
			res.status(200).json(
				buildSuccessResponse(
					"Hikvision face mirror completed",
					{
						sourceDeviceId,
						employeeNo,
						completed,
						events,
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Hikvision face mirror failed: ${error?.message || error}`);
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to mirror Hikvision face", 500),
			);
		}
	};

	const mockHikvisionFaceTally = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;

			const deviceId = String(req.body?.deviceId || "").trim();
			const vendorUserId = String(
				req.body?.vendorUserId || req.body?.employeeNo || "",
			).trim();
			const targetDeviceId = String(req.body?.targetDeviceId || "").trim();
			const faceCount = Math.max(
				0,
				Math.min(10, Math.floor(Number(req.body?.faceCount) || 0)),
			);
			if (!deviceId || !vendorUserId) {
				res.status(400).json(
					buildErrorResponse("deviceId and vendorUserId are required", 400),
				);
				return;
			}

			const deviceIds = [deviceId, targetDeviceId].filter(Boolean);
			const devices = await prisma.device.findMany({
				where: {
					organizationId: String(admin.organizationId),
					isDeleted: false,
					id: { in: deviceIds },
				},
			});
			const sourceDevice = devices.find((device) => device.id === deviceId);
			const targetDevice = targetDeviceId
				? devices.find((device) => device.id === targetDeviceId)
				: null;
			if (!sourceDevice) {
				res.status(404).json(buildErrorResponse("Source device was not found", 404));
				return;
			}
			if (!isHikvisionDevice(sourceDevice)) {
				res.status(400).json(buildErrorResponse("Source device must be Hikvision", 400));
				return;
			}
			if (targetDeviceId) {
				if (!targetDevice) {
					res.status(404).json(buildErrorResponse("Target device was not found", 404));
					return;
				}
				if (!isHikvisionDevice(targetDevice)) {
					res.status(400).json(
						buildErrorResponse("Target device must be Hikvision", 400),
					);
					return;
				}
			}

			const sourceDeviceUser = await updateHikvisionSyntheticFaceTally({
				organizationId: String(admin.organizationId),
				deviceId,
				vendorUserId,
				faceCount,
				note:
					faceCount > 0
						? "Applied as dev-only synthetic face tally for UI verification"
						: "Cleared dev-only synthetic face tally",
			});
			const targetDeviceUser =
				targetDeviceId && targetDevice
					? await updateHikvisionSyntheticFaceTally({
							organizationId: String(admin.organizationId),
							deviceId: targetDeviceId,
							vendorUserId,
							faceCount,
							copiedFromDeviceId: deviceId,
							copiedFromVendorUserId: vendorUserId,
							note:
								faceCount > 0
									? "Copied as dev-only synthetic face tally for peer verification"
									: "Cleared dev-only synthetic face tally",
						})
					: null;

			logActivity(req, {
				userId: String((req as any).userId || "unknown"),
				action: "HIKVISION_DEVICE_USER_MOCK_FACE",
				description:
					faceCount > 0
						? `Applied dev-only synthetic face tally ${faceCount} to Hikvision device user ${vendorUserId}`
						: `Cleared dev-only synthetic face tally for Hikvision device user ${vendorUserId}`,
				page: {
					url: req.originalUrl,
					title: "Device Users",
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					faceCount > 0 ? "Synthetic face tally applied" : "Synthetic face tally cleared",
					{
						deviceId,
						targetDeviceId: targetDeviceId || null,
						vendorUserId,
						faceCount,
						synthetic: true,
						sourceDeviceUser,
						targetDeviceUser,
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Hikvision synthetic face tally failed: ${error?.message || error}`);
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to apply synthetic face tally", 500),
			);
		}
	};

	const backfillDeviceUsers = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const deviceId = String(req.params.id || (req.body as any)?.deviceId || "").trim();
			const device = await getDeviceForUserSync(gate.organizationId, deviceId);
			if (!device) {
				res.status(404).json(buildErrorResponse("Device not found", 404));
				return;
			}
			const result = await backfillDeviceUsersFromLegacyEmployees({
				organizationId: gate.organizationId,
				deviceId: device.id,
			});
			res.status(200).json(
				buildSuccessResponse("Legacy device users backfilled", result, 200),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to backfill device users", 500),
			);
		}
	};

	const getBulkSyncModeQueuedMessage = (syncMode: DeviceUserSyncMode) => {
		if (syncMode === "needs_attention_only")
			return "Needs-attention device-user refresh queued";
		if (syncMode === "peer_converge") return "Cross-device convergence queued";
		if (syncMode === "biometrics_only") return "Raw biometric custody repair queued";
		return "Full device-user refresh queued";
	};

	const getBulkSyncModeCancelledMessage = (syncMode: DeviceUserSyncMode) => {
		if (syncMode === "needs_attention_only") {
			return "Cancel requested. The needs-attention refresh stopped before the next device.";
		}
		if (syncMode === "peer_converge") {
			return "Cancel requested. Cross-device convergence stopped before the next device.";
		}
		if (syncMode === "biometrics_only") {
			return "Cancel requested. Raw biometric custody repair stopped before the next device.";
		}
		return "Cancel requested. The full source refresh stopped before the next device.";
	};

	const getBulkSyncModeProgressMessage = (
		syncMode: DeviceUserSyncMode,
		deviceName: string,
		index: number,
		total: number,
		success: boolean,
	) => {
		if (success) {
			if (syncMode === "needs_attention_only") {
				return `Refreshed ${deviceName} from the needs-attention queue (${index}/${total}).`;
			}
			if (syncMode === "peer_converge") {
				return `Refreshed ${deviceName} before peer convergence (${index}/${total}).`;
			}
			if (syncMode === "biometrics_only") {
				return `Repaired raw biometric custody for ${deviceName} (${index}/${total}).`;
			}
			return `Refreshed ${deviceName} from live source truth (${index}/${total}).`;
		}
		if (syncMode === "needs_attention_only") {
			return `Review needed for ${deviceName} in the needs-attention queue (${index}/${total}).`;
		}
		if (syncMode === "peer_converge") {
			return `Review needed for ${deviceName} before peer convergence (${index}/${total}).`;
		}
		if (syncMode === "biometrics_only") {
			return `Raw biometric custody still needs review for ${deviceName} (${index}/${total}).`;
		}
		return `Review needed for ${deviceName} during the full source refresh (${index}/${total}).`;
	};

	const setDeviceUserSyncJobResult = (
		results: DeviceUserSyncJobResult[],
		nextResult: DeviceUserSyncJobResult,
	) => {
		const index = results.findIndex((item) => item.deviceId === nextResult.deviceId);
		if (index >= 0) {
			results[index] = {
				...results[index],
				...nextResult,
				summary: {
					...((results[index].summary as Record<string, any>) || {}),
					...((nextResult.summary as Record<string, any>) || {}),
				},
			};
			return;
		}
		results.push(nextResult);
	};

	const shouldConvergeDeviceUserToPeer = (
		sourceDeviceUser: any,
		targetDeviceUser?: any | null,
	) => {
		if (!targetDeviceUser) return true;
		const sourceSummary = buildEffectiveHikvisionCredentialSummary(
			sourceDeviceUser?.rawPayload || {},
		);
		const targetSummary = buildEffectiveHikvisionCredentialSummary(
			targetDeviceUser?.rawPayload || {},
		);
		if (targetSummary.fingerprintCount < sourceSummary.fingerprintCount) return true;
		if (targetSummary.faceCount < sourceSummary.faceCount) return true;
		if (targetSummary.cardCount < sourceSummary.cardCount) return true;
		return false;
	};

	const summarizeDeviceUserTruth = (deviceUsers: any[]) =>
		deviceUsers.reduce(
			(summary, deviceUser) => {
				const credentialSummary = buildEffectiveHikvisionCredentialSummary(
					deviceUser?.rawPayload || {},
				);
				return {
					userCount: summary.userCount + 1,
					fingerprintCount:
						summary.fingerprintCount + Number(credentialSummary.fingerprintCount || 0),
					faceCount: summary.faceCount + Number(credentialSummary.faceCount || 0),
					cardCount: summary.cardCount + Number(credentialSummary.cardCount || 0),
				};
			},
			{
				userCount: 0,
				fingerprintCount: 0,
				faceCount: 0,
				cardCount: 0,
			},
		);

	const DEVICE_USER_SYNC_DECISION_BUCKETS: Array<{
		key: DeviceUserSyncDecisionBucketKey;
		label: string;
		why: string;
		canSyncCreate: boolean;
		defaultIncluded: boolean;
		filter: string;
	}> = [
		{
			key: "missing_device_user_record",
			label: "Missing DeviceUser records",
			why: "Source identity exists, but HRIS has no DeviceUser row for that plain device person ID.",
			canSyncCreate: true,
			defaultIncluded: true,
			filter: "missing_device_user_record",
		},
		{
			key: "missing_employee_link",
			label: "Missing employee links",
			why: "DeviceUser exists without a safe employee link. Sync can auto-link only exact unambiguous matches.",
			canSyncCreate: true,
			defaultIncluded: true,
			filter: "missing_employee_link",
		},
		{
			key: "missing_raw_fingerprint_blob",
			label: "Missing fingerprint raw blobs",
			why: "Fingerprint enrollment is reported, but evidenced raw fingerData is not stored.",
			canSyncCreate: true,
			defaultIncluded: true,
			filter: "missing_raw_fingerprint_blob",
		},
		{
			key: "missing_raw_face_blob",
			label: "Missing face raw blobs",
			why: "Face enrollment is reported, but evidenced raw face/image data is not stored.",
			canSyncCreate: true,
			defaultIncluded: true,
			filter: "missing_raw_face_blob",
		},
		{
			key: "already_present",
			label: "Already present",
			why: "HRIS already has the DeviceUser record and any evidenced raw custody currently known.",
			canSyncCreate: false,
			defaultIncluded: false,
			filter: "already_present",
		},
		{
			key: "stale_count_only_or_live_no_data",
			label: "Known no-data / stale count-only",
			why: "Counts or stale inventory claim enrollment, but raw bytes are not evidenced; default sync skips repeated no-data loops.",
			canSyncCreate: false,
			defaultIncluded: false,
			filter: "stale_count_only_or_live_no_data",
		},
		{
			key: "unsupported_by_sync",
			label: "Unsupported by this sync",
			why: "This is outside Sync device users; use Sync logs, merge, manual link, or another repair path.",
			canSyncCreate: false,
			defaultIncluded: false,
			filter: "unsupported_by_sync",
		},
	];

	const buildDeviceUserSyncDecisionMatrix = (params: {
		vendorUserCount?: number | null;
		hrisUserCount?: number | null;
		openUserCount?: number | null;
		conflictUserCount?: number | null;
		fingerprintRawMissing?: number | null;
		faceRawMissing?: number | null;
		staleHrisOnlyRows?: number | null;
		staleFingerprintRawMissing?: number | null;
		staleFaceRawMissing?: number | null;
		sourceStatus?: string | null;
		sourceError?: string | null;
		modeHint?: DeviceUserSyncMode | null;
	}): DeviceUserSyncDecisionMatrix => {
		const vendorUserCount =
			params.vendorUserCount === null || params.vendorUserCount === undefined
				? null
				: Math.max(Number(params.vendorUserCount) || 0, 0);
		const hrisUserCount = Math.max(Number(params.hrisUserCount || 0), 0);
		const missingDeviceUsers =
			vendorUserCount === null ? 0 : Math.max(vendorUserCount - hrisUserCount, 0);
		const missingLinks = Math.max(Number(params.openUserCount || 0), 0);
		const missingFingerprint = Math.max(Number(params.fingerprintRawMissing || 0), 0);
		const missingFace = Math.max(Number(params.faceRawMissing || 0), 0);
		const staleNoData =
			Math.max(Number(params.staleHrisOnlyRows || 0), 0) +
			Math.max(Number(params.staleFingerprintRawMissing || 0), 0) +
			Math.max(Number(params.staleFaceRawMissing || 0), 0);
		const unsupported = Math.max(Number(params.conflictUserCount || 0), 0);
		const alreadyPresent =
			vendorUserCount === null
				? hrisUserCount
				: Math.max(Math.min(vendorUserCount, hrisUserCount) - missingLinks, 0);
		const counts: Record<DeviceUserSyncDecisionBucketKey, number> = {
			missing_device_user_record: missingDeviceUsers,
			missing_employee_link: missingLinks,
			missing_raw_fingerprint_blob: missingFingerprint,
			missing_raw_face_blob: missingFace,
			already_present: alreadyPresent,
			stale_count_only_or_live_no_data: staleNoData,
			unsupported_by_sync: unsupported,
		};
		const buckets = DEVICE_USER_SYNC_DECISION_BUCKETS.map((bucket) => ({
			...bucket,
			count: counts[bucket.key],
		}));
		const rawGapCount = missingFingerprint + missingFace;
		const sourceReadRequired =
			missingDeviceUsers > 0 ||
			params.modeHint === "full_refresh" ||
			params.modeHint === "peer_converge";
		const selectedFastPlan: DeviceUserSyncMode =
			params.modeHint ||
			(rawGapCount > 0 && missingDeviceUsers === 0
				? "biometrics_only"
				: missingDeviceUsers > 0 || missingLinks > 0 || unsupported > 0
					? "needs_attention_only"
					: "biometrics_only");
		const selectedFastPlanReason =
			selectedFastPlan === "biometrics_only"
				? "Saved HRIS DeviceUser truth already identifies raw-custody gaps, so source identity reread is skipped by default."
				: selectedFastPlan === "needs_attention_only"
					? "The matrix found actionable gaps, so the job targets only devices needing review instead of rereading every row."
					: selectedFastPlan === "peer_converge"
						? "Peer convergence needs current device-user truth before copying missing peer users."
						: "Full refresh was requested, so source users are reread even if the matrix can already identify saved gaps.";
		const jobStages = [
			"Building missing-record matrix",
			...(sourceReadRequired ? ["Reading source users needed for identity gaps"] : []),
			...(missingFingerprint > 0 ? ["Capturing missing fingerprint raw bytes"] : []),
			...(missingFace > 0 ? ["Capturing missing face raw bytes"] : []),
			...(staleNoData > 0 ? ["Skipping known no-data rows"] : []),
			rawGapCount + staleNoData + unsupported > 0
				? "Finished with missing items needing review"
				: "Finished with no actionable gaps",
		];
		return {
			buckets,
			counts,
			selectedFastPlan,
			selectedFastPlanReason,
			sourceReadRequired,
			sourceReadReason: sourceReadRequired
				? "Source identity must be read for missing DeviceUser records, peer convergence, or explicit full refresh."
				: "Saved HRIS DeviceUser state is enough to plan this job; live source identity reread is not needed first.",
			jobStages,
		};
	};

	const buildDeviceUserSyncJobDecisionMatrix = async (params: {
		req: Request;
		organizationId: string;
		devices: any[];
		syncMode: DeviceUserSyncMode;
	}) => {
		const aggregateCounts: Record<DeviceUserSyncDecisionBucketKey, number> = {
			missing_device_user_record: 0,
			missing_employee_link: 0,
			missing_raw_fingerprint_blob: 0,
			missing_raw_face_blob: 0,
			already_present: 0,
			stale_count_only_or_live_no_data: 0,
			unsupported_by_sync: 0,
		};
		let sourceReadRequired = false;
		for (const device of params.devices) {
			let rows: any[] = [];
			try {
				rows = (await loadDeviceUsersForExport(params.organizationId, device.id)) as any[];
			} catch {
				rows = [];
			}
			let vendorUserCount: number | null = null;
			if (params.syncMode !== "biometrics_only" && isHikvisionDevice(device)) {
				try {
					const sourceCount = await getHikvisionFastDeviceUserSourceCount(
						params.req,
						device.id,
					);
					if (
						sourceCount.userCount !== null &&
						sourceCount.userCount !== undefined &&
						Number.isFinite(Number(sourceCount.userCount))
					) {
						vendorUserCount = Number(sourceCount.userCount);
					}
				} catch {
					vendorUserCount = null;
				}
			}
			const statusSummary = summarizeDeviceUserStatuses(rows) as any;
			const custodySummary = summarizeDeviceUserRawBiometricCustody(rows) as any;
			const matrix = buildDeviceUserSyncDecisionMatrix({
				vendorUserCount,
				hrisUserCount: Number(statusSummary.total || rows.length || 0),
				openUserCount: Number(statusSummary.unmatched || 0),
				conflictUserCount: Number(statusSummary.conflict || 0),
				fingerprintRawMissing: Number(custodySummary.fingerprintRawMissing || 0),
				faceRawMissing: Number(custodySummary.faceRawMissing || 0),
				staleHrisOnlyRows: Number(custodySummary.staleHrisOnlyRows || 0),
				staleFingerprintRawMissing: Number(custodySummary.staleFingerprintRawMissing || 0),
				staleFaceRawMissing: Number(custodySummary.staleFaceRawMissing || 0),
				modeHint: params.syncMode,
			});
			for (const key of Object.keys(aggregateCounts) as DeviceUserSyncDecisionBucketKey[]) {
				aggregateCounts[key] += Number(matrix.counts[key] || 0);
			}
			sourceReadRequired = sourceReadRequired || matrix.sourceReadRequired;
		}
		const matrix = buildDeviceUserSyncDecisionMatrix({
			vendorUserCount: null,
			hrisUserCount: aggregateCounts.already_present,
			openUserCount: aggregateCounts.missing_employee_link,
			conflictUserCount: aggregateCounts.unsupported_by_sync,
			fingerprintRawMissing: aggregateCounts.missing_raw_fingerprint_blob,
			faceRawMissing: aggregateCounts.missing_raw_face_blob,
			staleHrisOnlyRows: aggregateCounts.stale_count_only_or_live_no_data,
			modeHint: params.syncMode,
		});
		const jobStages = [
			"Building missing-record matrix",
			...(sourceReadRequired ? ["Reading source users needed for identity gaps"] : []),
			...(aggregateCounts.missing_raw_fingerprint_blob > 0
				? ["Capturing missing fingerprint raw bytes"]
				: []),
			...(aggregateCounts.missing_raw_face_blob > 0
				? ["Capturing missing face raw bytes"]
				: []),
			...(aggregateCounts.stale_count_only_or_live_no_data > 0
				? ["Skipping known no-data rows"]
				: []),
			aggregateCounts.missing_device_user_record +
				aggregateCounts.missing_employee_link +
				aggregateCounts.missing_raw_fingerprint_blob +
				aggregateCounts.missing_raw_face_blob +
				aggregateCounts.stale_count_only_or_live_no_data +
				aggregateCounts.unsupported_by_sync >
			0
				? "Finished with missing items needing review"
				: "Finished with no actionable gaps",
		];
		return {
			...matrix,
			counts: aggregateCounts,
			buckets: DEVICE_USER_SYNC_DECISION_BUCKETS.map((bucket) => ({
				...bucket,
				count: aggregateCounts[bucket.key],
			})),
			sourceReadRequired,
			sourceReadReason: sourceReadRequired
				? "Live device user count shows missing DeviceUser records, so source identity must be read before raw-custody repair."
				: matrix.sourceReadReason,
			jobStages,
		};
	};

	const captureMissingBiometricCustodyForDevice = async (params: {
		jobId: string;
		req: Request;
		organizationId: string;
		device: any;
	}) => {
		const allRows = (await loadDeviceUsersForExport(
			params.organizationId,
			params.device.id,
		)) as any[];
		const savedRawSummary = summarizeDeviceUserRawBiometricCustody(allRows);
		const savedMissingRaw =
			Number(savedRawSummary.fingerprintRawMissing || 0) +
			Number(savedRawSummary.faceRawMissing || 0);
		if (savedMissingRaw <= 0) {
			updateDeviceUserSyncJob(params.jobId, {
				currentStage: "Finished with no actionable gaps",
				message: `Saved HRIS DeviceUser matrix has no missing raw biometric blobs for ${params.device.name || params.device.address || "device"}.`,
				currentDeviceId: params.device.id,
				currentDeviceName:
					params.device.name || params.device.address || "Hikvision device",
			});
			return {
				biometricTasks: 0,
				biometricCached:
					Number(savedRawSummary.fingerprintRawPresent || 0) +
					Number(savedRawSummary.faceRawPresent || 0),
				biometricCaptured: 0,
				biometricFailed: 0,
				biometricFailureReasons: {},
				biometricFailureLog:
					deviceUserSyncJobs.get(params.jobId)?.biometricFailureLog || [],
				biometricCustodyScope: "hris_device_users",
				biometricSourceRefreshSkipped: true,
				biometricSkipReason: "saved_matrix_has_no_missing_raw_biometric_blobs",
				biometricStaleHrisOnlyRows: 0,
				biometricStaleFingerprintReported: 0,
				biometricStaleFingerprintRawBlobCount: 0,
				biometricStaleFingerprintRawMissing: 0,
				biometricStaleFaceReported: 0,
				biometricStaleFaceRawMissing: 0,
			};
		}
		let liveVendorUserIds: Set<string> | null = null;
		try {
			updateDeviceUserSyncJob(params.jobId, {
				currentStage: "Reading source users needed for identity gaps",
				message: `Checking current source users for ${params.device.name || params.device.address} before raw-custody repair.`,
				currentDeviceId: params.device.id,
				currentDeviceName:
					params.device.name || params.device.address || "Hikvision device",
			});
			const snapshot = await withDeviceUserImportTimeout(
				loadHikvisionDeviceUserSnapshot(params.req, params.device),
				Math.max(HIKVISION_PREVIEW_DEVICE_BUDGET_MS, 15_000),
				"Live device users unavailable for biometric custody scope",
			);
			liveVendorUserIds = new Set(
				snapshot.candidates
					.map((candidate) => String(candidate.vendorUserId || "").trim())
					.filter(Boolean),
			);
		} catch (error: any) {
			deviceLogger.warn(
				`Live biometric custody scope unavailable for ${params.device.id}: ${error?.message || error}`,
			);
		}
		const rows = liveVendorUserIds
			? allRows.filter((row) =>
					liveVendorUserIds!.has(
						String(row?.vendorUserId || row?.employeeNo || "").trim(),
					),
				)
			: allRows;
		const staleSummary = liveVendorUserIds
			? summarizeDeviceUserRawBiometricCustody(allRows, { liveVendorUserIds })
			: null;
		const concurrency = Math.min(
			Math.max(Number(process.env.HIKVISION_RAW_BIOMETRIC_SYNC_CONCURRENCY || 8) || 8, 1),
			16,
		);
		const tasks = rows.flatMap((row) => {
			const summary =
				row.rawPayload?._hrisDeviceMetadata?.credentialSummary ||
				row.vendorMetadata?.credentialSummary ||
				extractHikvisionCredentialSummary(row.rawPayload || {});
			const rawCustody = buildRawDeviceUserBiometricCustody({
				row,
				includeFingerprints: true,
				includeFaces: true,
			});
			const result: Array<{
				row: any;
				modality: "fingerprint" | "face";
				missingCount: number;
				priorRawCount: number;
			}> = [];
			if (
				Number(summary.fingerprintCount || 0) > 0 &&
				rawCustody.fingerprint.status !== "raw_blob_present"
			) {
				result.push({
					row,
					modality: "fingerprint",
					missingCount: Math.max(Number(rawCustody.fingerprint.missingRawCount || 0), 1),
					priorRawCount: Number(rawCustody.fingerprint.rawBlobCount || 0),
				});
			}
			if (
				Number(summary.faceCount || 0) > 0 &&
				rawCustody.face.status !== "raw_blob_present"
			) {
				result.push({
					row,
					modality: "face",
					missingCount: Math.max(Number(rawCustody.face.missingRawCount || 0), 1),
					priorRawCount: Number(rawCustody.face.rawBlobPresent ? 1 : 0),
				});
			}
			return result;
		});
		const cached = rows.reduce((count, row) => {
			const summary =
				row.rawPayload?._hrisDeviceMetadata?.credentialSummary ||
				row.vendorMetadata?.credentialSummary ||
				extractHikvisionCredentialSummary(row.rawPayload || {});
			const rawCustody = buildRawDeviceUserBiometricCustody({
				row,
				includeFingerprints: true,
				includeFaces: true,
			});
			return (
				count +
				(Number(summary.fingerprintCount || 0) > 0
					? Number(rawCustody.fingerprint.storedCount || 0)
					: 0) +
				(Number(summary.faceCount || 0) > 0 ? Number(rawCustody.face.storedCount || 0) : 0)
			);
		}, 0);
		const initial = deviceUserSyncJobs.get(params.jobId);
		updateDeviceUserSyncJob(params.jobId, {
			currentStage: tasks.some((task) => task.modality === "fingerprint")
				? "Capturing missing fingerprint raw bytes"
				: tasks.some((task) => task.modality === "face")
					? "Capturing missing face raw bytes"
					: staleSummary && Number(staleSummary.staleHrisOnlyRows || 0) > 0
						? "Skipping known no-data rows"
						: "Finished with no actionable gaps",
			biometricTotal:
				Number(initial?.biometricTotal || 0) +
				tasks.reduce((sum, task) => sum + Math.max(Number(task.missingCount || 0), 1), 0),
			biometricCached: Number(initial?.biometricCached || 0) + cached,
		});
		let captured = 0;
		let failed = 0;
		const failureReasons: Record<string, number> = {};
		const { captureRawFingerprintsForEnrollment, captureRawFaceForEnrollment } =
			await import("../../helper/device-user-raw-fingerprint.helper.js");
		let cursor = 0;
		const runTask = async (task: {
			row: any;
			modality: "fingerprint" | "face";
			missingCount: number;
			priorRawCount: number;
		}) => {
			const current = deviceUserSyncJobs.get(params.jobId);
			if (!current || current.cancelRequested) return;
			const vendorUserId = String(task.row.vendorUserId || task.row.employeeNo || "").trim();
			const missingCount = Math.max(Number(task.missingCount || 0), 1);
			updateDeviceUserSyncJob(params.jobId, {
				currentStage:
					task.modality === "fingerprint"
						? "Capturing missing fingerprint raw bytes"
						: "Capturing missing face raw bytes",
				message: `Capturing missing ${task.modality} raw bytes for ${params.device.name || params.device.address} (${current.biometricProcessed + 1}/${current.biometricTotal}).`,
				currentDeviceId: params.device.id,
				currentDeviceName:
					params.device.name || params.device.address || "Hikvision device",
				currentVendorUserId: vendorUserId,
				currentModality: task.modality,
			});
			let lastError: any = null;
			let capturedCount = 0;
			try {
				if (task.modality === "fingerprint") {
					const raw = await captureRawFingerprintsForEnrollment({
						prisma,
						req: params.req,
						organizationId: params.organizationId,
						deviceId: params.device.id,
						employeeNo: vendorUserId,
						deviceUserId: task.row.id || null,
					});
					if (!raw.ok || !raw.rawPresent) {
						throw new Error(raw.reason || "raw_fingerprint_capture_failed");
					}
					const returnedCount = Math.max(Number(raw.fingerprintCount || 0), 0);
					capturedCount = Math.min(
						Math.max(returnedCount - Math.max(Number(task.priorRawCount || 0), 0), 0),
						missingCount,
					);
					if (capturedCount <= 0) {
						throw new Error("no_new_fingerprint_data_from_device");
					}
				} else {
					const raw = await captureRawFaceForEnrollment({
						prisma,
						req: params.req,
						organizationId: params.organizationId,
						deviceId: params.device.id,
						employeeNo: vendorUserId,
						deviceUserId: task.row.id || null,
					});
					if (!raw.ok || !raw.present) {
						throw new Error(raw.reason || "raw_face_capture_failed");
					}
					capturedCount = missingCount;
				}
				lastError = null;
			} catch (error) {
				lastError = error;
			}
			if (lastError) {
				failed += missingCount;
				const reason = sanitizeDeviceUserSyncRawFailureReason(
					String(lastError?.message || lastError || "unknown_failure"),
				);
				failureReasons[reason] = (failureReasons[reason] || 0) + missingCount;
				deviceLogger.warn(
					`Biometric custody capture failed for ${params.device.id}/${vendorUserId}/${task.modality}: ${lastError?.message || lastError}`,
				);
			} else {
				captured += capturedCount;
				failed += Math.max(missingCount - capturedCount, 0);
			}
			const next = deviceUserSyncJobs.get(params.jobId);
			if (!next) return;
			const partialMissingCount = lastError
				? missingCount
				: Math.max(missingCount - capturedCount, 0);
			const partialReason = lastError
				? sanitizeDeviceUserSyncRawFailureReason(
						String(lastError?.message || lastError || "unknown_failure"),
					)
				: "partial_raw_blob_capture";
			const failureLog =
				partialMissingCount > 0
					? [
							...(next.biometricFailureLog || []),
							{
								deviceId: params.device.id,
								deviceName: params.device.name || params.device.address || null,
								vendorUserId,
								modality: task.modality,
								reason: partialReason,
								at: new Date().toISOString(),
							},
						].slice(-250)
					: next.biometricFailureLog || [];
			updateDeviceUserSyncJob(params.jobId, {
				biometricProcessed: next.biometricProcessed + missingCount,
				biometricCaptured: next.biometricCaptured + capturedCount,
				biometricFailed: next.biometricFailed + partialMissingCount,
				biometricFailureLog: failureLog,
			});
		};
		const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
			while (true) {
				const current = deviceUserSyncJobs.get(params.jobId);
				if (!current || current.cancelRequested) return;
				const task = tasks[cursor];
				cursor += 1;
				if (!task) return;
				await runTask(task);
			}
		});
		await Promise.all(workers);
		return {
			biometricTasks: tasks.length,
			biometricCached: cached,
			biometricCaptured: captured,
			biometricFailed: failed,
			biometricFailureReasons: sanitizeDeviceUserSyncFailureReasons(failureReasons),
			biometricFailureLog: deviceUserSyncJobs.get(params.jobId)?.biometricFailureLog || [],
			biometricCustodyScope: liveVendorUserIds
				? "current_live_device_users"
				: "hris_device_users",
			biometricStaleHrisOnlyRows: staleSummary?.staleHrisOnlyRows || 0,
			biometricStaleFingerprintReported: staleSummary?.staleFingerprintReported || 0,
			biometricStaleFingerprintRawBlobCount: staleSummary?.staleFingerprintRawBlobCount || 0,
			biometricStaleFingerprintRawMissing: staleSummary?.staleFingerprintRawMissing || 0,
			biometricStaleFaceReported: staleSummary?.staleFaceReported || 0,
			biometricStaleFaceRawMissing: staleSummary?.staleFaceRawMissing || 0,
		};
	};

	const processBulkDeviceUserSyncJob = async (params: {
		jobId: string;
		req: Request;
		organizationId: string;
		devices: any[];
		syncMode: DeviceUserSyncMode;
		startedByUserId?: string | null;
	}) => {
		const results: DeviceUserSyncJobResult[] = [];
		let successfulDevices = 0;
		let failedDevices = 0;

		const processDeviceUserSyncTarget = async (device: any) => {
			const currentJob = deviceUserSyncJobs.get(params.jobId);
			if (!currentJob) return;
			if (currentJob.cancelRequested) {
				updateDeviceUserSyncJob(params.jobId, {
					status: "cancelled",
					message: getBulkSyncModeCancelledMessage(params.syncMode),
					processedDevices: results.length,
					successfulDevices,
					failedDevices,
					results,
					completedAt: new Date(),
				});
				return;
			}

			try {
				const skipSourceRefresh =
					params.syncMode === "biometrics_only" ||
					(params.syncMode === "needs_attention_only" &&
						currentJob.decisionMatrix?.sourceReadRequired === false);
				updateDeviceUserSyncJob(params.jobId, {
					currentStage: skipSourceRefresh
						? "Building missing-record matrix"
						: "Reading source users needed for identity gaps",
					message: skipSourceRefresh
						? `Using saved DeviceUser matrix for ${device.name || device.address || "device"}; source reread is not required for this fast plan.`
						: `Reading source users needed for identity gaps on ${device.name || device.address || "device"}.`,
					currentDeviceId: device.id,
					currentDeviceName: device.name || device.address || "Hikvision device",
				});
				const sourceResult = skipSourceRefresh
					? {
							run: null,
							summary: {
								mode: params.syncMode,
								sourceRefreshSkipped: true,
								reason:
									params.syncMode === "biometrics_only"
										? "using_saved_device_user_truth_for_raw_custody_repair"
										: "decision_matrix_did_not_require_source_identity_read",
							},
						}
					: await syncHikvisionDeviceUsersFromSource({
							req: params.req,
							organizationId: params.organizationId,
							device,
							startedByUserId: params.startedByUserId || null,
						});
				const biometricSummary = await captureMissingBiometricCustodyForDevice({
					jobId: params.jobId,
					req: params.req,
					organizationId: params.organizationId,
					device,
				});
				const biometricFailed = Number((biometricSummary as any)?.biometricFailed || 0);
				const biometricFailureReasons = sanitizeDeviceUserSyncFailureReasons(
					(biometricSummary as any)?.biometricFailureReasons || {},
				);
				const deviceStatus = biometricFailed > 0 ? "needs_attention" : "success";
				setDeviceUserSyncJobResult(results, {
					deviceId: device.id,
					deviceName: device.name || device.address || "Hikvision device",
					status: deviceStatus,
					runId: sourceResult.run?.id || null,
					summary: {
						...sourceResult.summary,
						...biometricSummary,
						biometricFailureReasons,
					},
					error:
						biometricFailed > 0
							? `${biometricFailed} biometric credential(s) still missing raw blobs: ${
									Object.entries(biometricFailureReasons)
										.map(([reason, count]) => `${reason}=${count}`)
										.join(", ") || "reason_unknown"
								}`
							: null,
				});
				successfulDevices += 1;
				updateDeviceUserSyncJob(params.jobId, {
					status: "processing",
					message: getBulkSyncModeProgressMessage(
						params.syncMode,
						device.name || device.address || "device",
						results.length,
						params.devices.length,
						true,
					),
					processedDevices: results.length,
					successfulDevices,
					failedDevices,
					results,
				});
			} catch (error: any) {
				setDeviceUserSyncJobResult(results, {
					deviceId: device.id,
					deviceName: device.name || device.address || "Hikvision device",
					status: "error",
					error: error?.message || "Device-user sync failed.",
				});
				failedDevices += 1;
				updateDeviceUserSyncJob(params.jobId, {
					status: "processing",
					message: getBulkSyncModeProgressMessage(
						params.syncMode,
						device.name || device.address || "device",
						results.length,
						params.devices.length,
						false,
					),
					processedDevices: results.length,
					successfulDevices,
					failedDevices,
					results,
				});
			}
		};

		for (let index = 0; index < params.devices.length; index += DEVICE_USER_SYNC_CONCURRENCY) {
			const currentJob = deviceUserSyncJobs.get(params.jobId);
			if (!currentJob) return;
			if (currentJob.cancelRequested) {
				updateDeviceUserSyncJob(params.jobId, {
					status: "cancelled",
					message: getBulkSyncModeCancelledMessage(params.syncMode),
					processedDevices: results.length,
					successfulDevices,
					failedDevices,
					results,
					completedAt: new Date(),
				});
				return;
			}
			await Promise.all(
				params.devices
					.slice(index, index + DEVICE_USER_SYNC_CONCURRENCY)
					.map((device) => processDeviceUserSyncTarget(device)),
			);
		}

		if (params.syncMode === "peer_converge" && successfulDevices > 1) {
			const successfulResults = results.filter((result) => result.status === "success");
			const savedDeviceUsers = await (prisma as any).deviceUser.findMany({
				where: {
					organizationId: params.organizationId,
					deviceId: { in: successfulResults.map((result) => result.deviceId) },
				},
				select: {
					id: true,
					deviceId: true,
					vendorUserId: true,
					employeeId: true,
					status: true,
					lastSyncedAt: true,
					rawPayload: true,
				},
			});
			const deviceTruthByDeviceId = savedDeviceUsers.reduce(
				(groups: Map<string, any[]>, deviceUser: any) => {
					const deviceId = String(deviceUser.deviceId || "").trim();
					if (!deviceId) return groups;
					const bucket = groups.get(deviceId) || [];
					bucket.push(deviceUser);
					groups.set(deviceId, bucket);
					return groups;
				},
				new Map<string, any[]>(),
			);
			const sourceResult = [...successfulResults].sort((left, right) => {
				const leftTruth = summarizeDeviceUserTruth(
					deviceTruthByDeviceId.get(left.deviceId) || [],
				);
				const rightTruth = summarizeDeviceUserTruth(
					deviceTruthByDeviceId.get(right.deviceId) || [],
				);
				if (leftTruth.userCount !== rightTruth.userCount)
					return rightTruth.userCount - leftTruth.userCount;
				if (leftTruth.fingerprintCount !== rightTruth.fingerprintCount) {
					return rightTruth.fingerprintCount - leftTruth.fingerprintCount;
				}
				if (leftTruth.faceCount !== rightTruth.faceCount)
					return rightTruth.faceCount - leftTruth.faceCount;
				if (leftTruth.cardCount !== rightTruth.cardCount)
					return rightTruth.cardCount - leftTruth.cardCount;
				const leftImportable = Number(left.summary?.importableRecords || 0);
				const rightImportable = Number(right.summary?.importableRecords || 0);
				if (leftImportable !== rightImportable) return rightImportable - leftImportable;
				const leftTotal = Number(left.summary?.totalSourceRecords || 0);
				const rightTotal = Number(right.summary?.totalSourceRecords || 0);
				return rightTotal - leftTotal;
			})[0];
			const sourceDevice =
				params.devices.find((device) => device.id === sourceResult?.deviceId) || null;
			if (sourceDevice?.id) {
				const deviceUserMap = savedDeviceUsers.reduce(
					(groups: Map<string, Map<string, any>>, deviceUser: any) => {
						const deviceId = String(deviceUser.deviceId || "").trim();
						const vendorUserId = String(deviceUser.vendorUserId || "").trim();
						if (!deviceId || !vendorUserId) return groups;
						const bucket = groups.get(deviceId) || new Map<string, any>();
						bucket.set(vendorUserId, deviceUser);
						groups.set(deviceId, bucket);
						return groups;
					},
					new Map<string, Map<string, any>>(),
				);
				const sourceUsers = [...(deviceUserMap.get(sourceDevice.id)?.values() || [])];
				for (const targetDevice of params.devices.filter(
					(device) =>
						device.id !== sourceDevice.id &&
						successfulResults.some((result) => result.deviceId === device.id),
				)) {
					const currentJob = deviceUserSyncJobs.get(params.jobId);
					if (!currentJob) return;
					if (currentJob.cancelRequested) {
						updateDeviceUserSyncJob(params.jobId, {
							status: "cancelled",
							message:
								"Cancel requested. Cross-device convergence stopped during peer copy.",
							processedDevices: results.length,
							successfulDevices,
							failedDevices,
							results,
							completedAt: new Date(),
						});
						return;
					}
					const targetUsers =
						deviceUserMap.get(targetDevice.id) || new Map<string, any>();
					let copiedUsers = 0;
					let retryCount = 0;
					let skippedUsers = 0;
					let failedCopies = 0;
					let syntheticFaceMirrors = 0;
					let lastCopyError = "";
					for (const sourceUser of sourceUsers) {
						const vendorUserId = String(sourceUser?.vendorUserId || "").trim();
						if (!vendorUserId) continue;
						const targetUser = targetUsers.get(vendorUserId) || null;
						if (!shouldConvergeDeviceUserToPeer(sourceUser, targetUser)) {
							await mirrorDeviceUserLinkToPeer({
								organizationId: params.organizationId,
								sourceDeviceId: sourceDevice.id,
								targetDeviceId: targetDevice.id,
								vendorUserId,
							});
							skippedUsers += 1;
							continue;
						}
						try {
							const copyResult = await copyHikvisionUserToPeerWithRetry({
								req: params.req,
								organizationId: params.organizationId,
								sourceDevice,
								targetDevice,
								employeeNo: vendorUserId,
								includeFingerprints: true,
								includeFaceRecognition: true,
							});
							targetUsers.set(vendorUserId, copyResult.targetDeviceUser);
							copiedUsers += 1;
							retryCount += Math.max(0, Number(copyResult.attempt || 1) - 1);
							if (
								Number(
									copyResult.syntheticCredentialOverlayApplied?.faceCount || 0,
								) > 0
							) {
								syntheticFaceMirrors += 1;
							}
						} catch (error: any) {
							failedCopies += 1;
							lastCopyError = error?.message || "Peer convergence copy failed.";
						}
					}
					if (failedCopies > 0) {
						failedDevices += 1;
						successfulDevices = Math.max(0, successfulDevices - 1);
					}
					setDeviceUserSyncJobResult(results, {
						deviceId: targetDevice.id,
						deviceName: targetDevice.name || targetDevice.address || "Hikvision device",
						status: failedCopies > 0 ? "error" : "success",
						summary: {
							...(results.find((result) => result.deviceId === targetDevice.id)
								?.summary || {}),
							mode: "peer_converge",
							sourceDeviceId: sourceDevice.id,
							sourceDeviceName:
								sourceDevice.name || sourceDevice.address || "Hikvision device",
							copiedUsers,
							retryCount,
							skippedUsers,
							failedCopies,
							syntheticFaceMirrors,
						},
						error: failedCopies > 0 ? lastCopyError : null,
					});
					updateDeviceUserSyncJob(params.jobId, {
						status: "processing",
						message: `Converged ${targetDevice.name || targetDevice.address || "device"} from ${sourceDevice.name || sourceDevice.address || "source device"}.`,
						processedDevices: results.length,
						successfulDevices,
						failedDevices,
						results,
					});
				}
				setDeviceUserSyncJobResult(results, {
					deviceId: sourceDevice.id,
					deviceName: sourceDevice.name || sourceDevice.address || "Hikvision device",
					status: "success",
					summary: {
						...(results.find((result) => result.deviceId === sourceDevice.id)
							?.summary || {}),
						mode: "peer_converge",
						convergenceSource: true,
						sourceDeviceId: sourceDevice.id,
						sourceDeviceName:
							sourceDevice.name || sourceDevice.address || "Hikvision device",
						copiedUsers: 0,
						retryCount: 0,
						skippedUsers: sourceUsers.length,
						failedCopies: 0,
					},
				});
			}
		}

		await invalidateCache.byPattern("cache:device:*").catch(() => undefined);
		const rawGapDevices = results.filter(
			(result) => Number((result.summary as any)?.biometricFailed || 0) > 0,
		).length;
		updateDeviceUserSyncJob(params.jobId, {
			status: failedDevices > 0 ? "failed" : "completed",
			message:
				failedDevices > 0
					? params.syncMode === "needs_attention_only"
						? "Needs-attention device-user refresh finished with devices still needing review."
						: params.syncMode === "peer_converge"
							? "Cross-device convergence finished with devices still needing review."
							: params.syncMode === "biometrics_only"
								? "Raw biometric custody repair finished with credentials still needing review."
								: "Full device-user refresh finished with devices still needing review."
					: rawGapDevices > 0
						? params.syncMode === "biometrics_only"
							? "Raw biometric custody repair completed; some credentials still need missing_raw_blob review."
							: "Device-user refresh completed; some credentials still need missing_raw_blob review."
						: params.syncMode === "needs_attention_only"
							? "Needs-attention device-user refresh finished."
							: params.syncMode === "peer_converge"
								? "Cross-device convergence finished."
								: params.syncMode === "biometrics_only"
									? "Raw biometric custody repair finished."
									: "Full device-user refresh finished across configured devices.",
			processedDevices: results.length,
			successfulDevices,
			failedDevices,
			results,
			currentDeviceId: null,
			currentDeviceName: null,
			currentVendorUserId: null,
			currentModality: null,
			completedAt: new Date(),
		});
	};

	const startDeviceUserSyncJob = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const requestedMode = String((req.body as any)?.mode || "")
				.trim()
				.toLowerCase();
			const syncMode: DeviceUserSyncMode =
				requestedMode === "needs_attention_only"
					? "needs_attention_only"
					: requestedMode === "peer_converge"
						? "peer_converge"
						: requestedMode === "biometrics_only"
							? "biometrics_only"
							: "full_refresh";
			const requestedDeviceIds = Array.isArray((req.body as any)?.deviceIds)
				? Array.from(
						new Set(
							((req.body as any).deviceIds as unknown[])
								.map((value) => String(value || "").trim())
								.filter(Boolean),
						),
					)
				: [];
			cleanupDeviceUserSyncJobs();
			const devices = await prisma.device.findMany({
				where: {
					organizationId: gate.organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					organizationId: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
					access: true,
				},
				orderBy: { createdAt: "asc" },
			});
			const hikvisionDevices = devices.filter((device) => isHikvisionDevice(device));
			if (!hikvisionDevices.length) {
				res.status(400).json(
					buildErrorResponse(
						"No Hikvision devices are configured for device-user sync",
						400,
					),
				);
				return;
			}
			const targetDevices = requestedDeviceIds.length
				? hikvisionDevices.filter((device) =>
						requestedDeviceIds.includes(String(device.id)),
					)
				: hikvisionDevices;
			if (!targetDevices.length) {
				res.status(400).json(
					buildErrorResponse(
						syncMode === "needs_attention_only"
							? "No configured Hikvision devices matched the current needs-attention refresh scope"
							: syncMode === "peer_converge"
								? "No configured Hikvision devices matched the current convergence scope"
								: "No configured Hikvision devices matched the requested sync scope",
						400,
					),
				);
				return;
			}

			const decisionMatrix = await buildDeviceUserSyncJobDecisionMatrix({
				req,
				organizationId: gate.organizationId,
				devices: targetDevices,
				syncMode,
			});
			const sourceRefreshSkippedByMatrix =
				syncMode === "biometrics_only" ||
				(syncMode === "needs_attention_only" &&
					decisionMatrix.sourceReadRequired === false);
			const executionPlan = {
				mode: syncMode,
				dryRun: (req.body as any)?.dryRun === true,
				willCreateJob: (req.body as any)?.dryRun === true ? false : true,
				selectedDeviceCount: targetDevices.length,
				selectedDevices: targetDevices.map((device) => ({
					id: device.id,
					name: device.name || device.address || "Hikvision device",
					address: device.address || null,
				})),
				sourceReadRequired: decisionMatrix.sourceReadRequired,
				sourceReadSkipped: sourceRefreshSkippedByMatrix,
				sourceReadReason: decisionMatrix.sourceReadReason,
				steps: [
					"Build missing-record matrix from saved HRIS DeviceUser state",
					...(decisionMatrix.sourceReadRequired
						? ["Read source users needed for identity gaps"]
						: [
								"Skip source user reread because saved HRIS state scopes the actionable work",
							]),
					...(decisionMatrix.counts.missing_employee_link > 0
						? ["Process missing employee-link candidates only"]
						: []),
					...(decisionMatrix.counts.missing_raw_fingerprint_blob > 0
						? ["Capture missing fingerprint raw bytes only"]
						: []),
					...(decisionMatrix.counts.missing_raw_face_blob > 0
						? ["Capture missing face raw bytes only"]
						: []),
					...(decisionMatrix.counts.already_present > 0
						? ["Skip already-present rows in the default fast job"]
						: []),
					...(decisionMatrix.counts.stale_count_only_or_live_no_data > 0
						? [
								"Skip known no-data / stale count-only rows unless deep repair is requested",
							]
						: []),
				],
			};
			if ((req.body as any)?.dryRun === true) {
				res.status(200).json(
					buildSuccessResponse(
						"Device user sync dry-run plan generated",
						{
							mode: "dry_run",
							jobId: null,
							willCreateJob: false,
							decisionMatrix,
							executionPlan,
						},
						200,
					),
				);
				return;
			}
			const jobId = randomUUID();
			const startedAt = new Date();
			const job: DeviceUserSyncJob = {
				jobId,
				status: "processing",
				syncMode,
				organizationId: gate.organizationId,
				decisionMatrix,
				jobStages: decisionMatrix.jobStages,
				currentStage: "Building missing-record matrix",
				totalDevices: targetDevices.length,
				processedDevices: 0,
				successfulDevices: 0,
				failedDevices: 0,
				biometricTotal: 0,
				biometricProcessed: 0,
				biometricCaptured: 0,
				biometricCached: 0,
				biometricFailed: 0,
				biometricFailureLog: [],
				message:
					decisionMatrix.selectedFastPlanReason || getBulkSyncModeQueuedMessage(syncMode),
				results: [],
				startedAt,
				updatedAt: startedAt,
			};
			deviceUserSyncJobs.set(jobId, job);
			persistDeviceUserSyncJob(job);

			processBulkDeviceUserSyncJob({
				jobId,
				req,
				organizationId: gate.organizationId,
				devices: targetDevices,
				syncMode,
				startedByUserId: (req as any).userId || null,
			}).catch((error: any) => {
				deviceLogger.error(`Device user sync job ${jobId} failed: ${error}`);
				updateDeviceUserSyncJob(jobId, {
					status: "failed",
					message: error?.message || "Device-user tally failed.",
					failedDevices: Math.max(1, deviceUserSyncJobs.get(jobId)?.failedDevices || 0),
					completedAt: new Date(),
				});
			});

			res.status(202).json(
				buildSuccessResponse("Device user sync started", { jobId, progress: job }, 202),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to start device-user sync", 500),
			);
		}
	};

	const getDeviceUserSyncJob = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		const jobId = String(req.params.jobId || "").trim();
		const memoryJob = deviceUserSyncJobs.get(jobId);
		const persistedJob = memoryJob ? null : readDeviceUserSyncJob(jobId);
		const foundJob = memoryJob || persistedJob;
		const interruptedPersistedJob =
			!memoryJob && persistedJob?.status === "processing" ? persistedJob : null;
		const job = interruptedPersistedJob
			? markDeviceUserSyncJobStale({
					...interruptedPersistedJob,
					message:
						"Device-user sync worker is no longer active after API restart. Start a fresh dry-run or sync plan.",
				})
			: foundJob && isDeviceUserSyncJobStale(foundJob)
				? markDeviceUserSyncJobStale(foundJob)
				: foundJob;
		if (job && !deviceUserSyncJobs.has(jobId) && job.status !== "processing")
			deviceUserSyncJobs.set(jobId, job);
		if (!job || job.organizationId !== gate.organizationId) {
			res.status(404).json(
				buildErrorResponse("Device-user sync job not found or expired", 404),
			);
			return;
		}
		res.status(200).json(
			buildSuccessResponse(
				"Device-user sync job retrieved",
				{
					...job,
					biometricFailureLog: sanitizeDeviceUserSyncFailureLog(job.biometricFailureLog),
					results: sanitizeDeviceUserSyncJobResults(job.results),
				},
				200,
			),
		);
	};

	const cancelDeviceUserSyncJob = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const jobId = String(req.params.jobId || "").trim();
			const job = deviceUserSyncJobs.get(jobId);
			if (!job || job.organizationId !== gate.organizationId) {
				res.status(404).json(
					buildErrorResponse("Device-user sync job not found or expired", 404),
				);
				return;
			}
			if (job.status !== "processing") {
				res.status(200).json(
					buildSuccessResponse("Device-user sync job already finished", job, 200),
				);
				return;
			}
			updateDeviceUserSyncJob(jobId, {
				cancelRequested: true,
				cancelRequestedAt: new Date(),
				message: "Cancel requested",
			});
			res.status(200).json(
				buildSuccessResponse(
					"Device-user sync cancellation requested",
					deviceUserSyncJobs.get(jobId) || job,
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to cancel device-user sync", 500),
			);
		}
	};

	const backfillDeviceUserLifecycleEvents = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const deviceId = String(req.params.id || (req.body as any)?.deviceId || "").trim();
			const execute = (req.body as any)?.execute === true;
			const device = await getDeviceForUserSync(gate.organizationId, deviceId);
			if (!device || !isHikvisionDevice(device)) {
				res.status(400).json(
					buildErrorResponse(
						"Select a Hikvision device before backfilling lifecycle events",
						400,
					),
				);
				return;
			}

			const deviceUsers = await prisma.deviceUser.findMany({
				where: {
					organizationId: gate.organizationId,
					deviceId: device.id,
				},
				orderBy: { vendorUserId: "asc" },
				select: {
					id: true,
					vendorUserId: true,
					employeeId: true,
					employeeNo: true,
					rawPayload: true,
					lastSyncedAt: true,
				},
			});
			const result = await persistDeviceUserLifecycleBackfill({
				organizationId: gate.organizationId,
				sourceDevice: {
					id: device.id,
					name: device.name,
					address: device.address,
				},
				deviceUsers,
				source: "EN_HCNETSDK_ALARM",
				reason: "manual_device_user_lifecycle_backfill",
				execute,
				minor: "STATE_BACKFILL",
			});
			res.status(200).json(
				buildSuccessResponse(
					execute
						? "Device user lifecycle events backfilled"
						: "Device user lifecycle backfill preview ready",
					{
						device: {
							id: device.id,
							name: device.name,
							address: device.address,
						},
						...result,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(
					error?.message || "Failed to backfill device user lifecycle events",
					500,
				),
			);
		}
	};

	const linkDeviceUser = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const deviceUserId = String(req.params.userId || "").trim();
			const employeeId = String((req.body as any)?.employeeId || "").trim();
			if (!employeeId) {
				res.status(400).json(buildErrorResponse("Employee is required", 400));
				return;
			}
			const [deviceUser, employee] = await Promise.all([
				(prisma as any).deviceUser.findFirst({
					where: { id: deviceUserId, organizationId: gate.organizationId },
				}),
				prisma.employee.findFirst({
					where: {
						id: employeeId,
						organizationId: gate.organizationId,
						isDeleted: false,
					},
					select: { id: true },
				}),
			]);
			if (!deviceUser) {
				res.status(404).json(buildErrorResponse("Device user not found", 404));
				return;
			}
			if (!employee) {
				res.status(404).json(buildErrorResponse("Employee not found", 404));
				return;
			}
			const updated = await (prisma as any).deviceUser.update({
				where: { id: deviceUserId },
				data: { employeeId: employee.id, status: "ACTIVE" },
				select: buildDeviceUserSelect({
					includeVendorMetadata: await hasDeviceUserVendorMetadataColumn(),
				}),
			});
			res.status(200).json(
				buildSuccessResponse("Device user linked", decorateDeviceUser(updated), 200),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to link device user", 500),
			);
		}
	};

	const unlinkDeviceUser = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const deviceUserId = String(req.params.userId || "").trim();
			const deviceUser = await (prisma as any).deviceUser.findFirst({
				where: { id: deviceUserId, organizationId: gate.organizationId },
			});
			if (!deviceUser) {
				res.status(404).json(buildErrorResponse("Device user not found", 404));
				return;
			}
			const updated = await (prisma as any).deviceUser.update({
				where: { id: deviceUserId },
				data: {
					employeeId: null,
					status: deviceUser.status === "DISABLED" ? "DISABLED" : "UNMATCHED",
				},
				select: buildDeviceUserSelect({
					includeVendorMetadata: await hasDeviceUserVendorMetadataColumn(),
				}),
			});
			res.status(200).json(
				buildSuccessResponse("Device user unlinked", decorateDeviceUser(updated), 200),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to unlink device user", 500),
			);
		}
	};

	const getHikvisionImportProgress = (jobId: string) => {
		cleanupDeviceImportJobs();
		const job = deviceImportJobs.get(jobId) || readDeviceImportJob(jobId);
		if (!job) return null;
		deviceImportJobs.set(jobId, job);
		if (isDeviceImportJobStale(job)) return markDeviceImportJobStale(job);
		return job;
	};

	const isTransientHikvisionImportError = (error: any) => {
		const status = Number(error?.status || error?.data?.status || 0);
		const message = [
			error?.message,
			error?.data?.message,
			error?.data?.raw,
			error?.data?.errorName,
			error?.data?.errorCode,
			error?.data?.errorCause,
		]
			.filter(Boolean)
			.join(" ");
		return (
			status === 401 ||
			status === 408 ||
			status === 429 ||
			status === 500 ||
			status === 502 ||
			status === 503 ||
			status === 504 ||
			/(unauthorized|aborted|aborterror|timed out|timeout|fetch failed|socket hang up|econnreset|etimedout)/i.test(
				message,
			)
		);
	};

	const buildRetryableHikvisionImportOptions = (
		options: NonNullable<Parameters<typeof hikvisionFetch>[1]>,
		pageSize?: number | null,
	) => {
		const headers = {
			...((options.headers as Record<string, string>) || {}),
			Connection: "close",
			"Cache-Control": "no-cache",
		};
		if (!pageSize || !options.body || typeof options.body === "string") {
			return { ...options, headers };
		}
		const body: any = JSON.parse(JSON.stringify(options.body));
		if (body?.AcsEventCond) {
			body.AcsEventCond.maxResults = pageSize;
		}
		return { ...options, headers, body };
	};

	const fetchHikvisionImportPageWithRetry = async (params: {
		endpoint: string;
		options: NonNullable<Parameters<typeof hikvisionFetch>[1]>;
		pageSize?: number | null;
		row: number;
		label: string;
	}) => {
		const maxAttempts = Math.max(
			1,
			Math.min(Number(process.env.HIKVISION_IMPORT_PAGE_RETRY_LIMIT || 4), 6),
		);
		const minPageSize = Math.max(
			1,
			Math.min(Number(process.env.HIKVISION_IMPORT_RETRY_MIN_PAGE_SIZE || 10), 50),
		);
		let pageSize =
			params.pageSize && Number.isFinite(Number(params.pageSize))
				? Math.max(1, Number(params.pageSize))
				: null;
		let lastError: any = null;
		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			try {
				const data = await hikvisionFetch(
					params.endpoint,
					buildRetryableHikvisionImportOptions(params.options, pageSize),
				);
				return { data, pageSize, attempts: attempt };
			} catch (error: any) {
				lastError = error;
				if (attempt >= maxAttempts || !isTransientHikvisionImportError(error)) break;
				const delayMs = Math.min(5000, 350 * attempt * attempt);
				deviceLogger.warn(
					`Retrying Hikvision ${params.label} page at row ${params.row} after transient failure attempt ${attempt}/${maxAttempts}: ${error?.message || error}`,
				);
				if (pageSize && pageSize > minPageSize) {
					pageSize = Math.max(minPageSize, Math.floor(pageSize / 2));
				}
				await sleep(delayMs);
			}
		}
		throw lastError;
	};

	const buildHikvisionImportEventFingerprint = (device: any, event: any) => {
		const employeeNo = String(event?.employeeNoString || event?.employeeNo || "").trim();
		const receivedAt = new Date();
		const knownSkewSeconds = Number((device?.config as any)?.hikvisionClockSkewSeconds || 0);
		const allowClockSkewCorrection =
			(device?.config as any)?.hikvisionAllowClockSkewCorrection === true;
		const eventWasAlreadyAdjusted = Boolean(event?.timeAdjusted);
		const normalizedTime = eventWasAlreadyAdjusted
			? parseHikvisionEventTime(event?.time)
			: normalizeHikvisionFutureSkewedEventTime(event?.time, receivedAt, knownSkewSeconds, {
					allowStoredSkew: allowClockSkewCorrection,
					allowAutoAdjust: allowClockSkewCorrection,
				}).eventTime;
		const source = normalizeHikvisionDeviceEventSource(event?.source);
		return {
			employeeNo,
			eventTime: normalizedTime,
			source,
			serialNo: String(event?.serialNo || "").trim(),
			dedupeKey: buildHikvisionDeviceEventDedupeKey({
				deviceId: device.id,
				source,
				eventTime: normalizedTime,
				employeeNo,
				event,
			}),
		};
	};

	const findExistingHikvisionDeviceEvent = async (params: {
		organizationId: string;
		deviceId: string;
		employeeNo: string;
		source: string;
		eventTime: Date;
		serialNo?: string | null;
		dedupeKey: string;
	}) => {
		const existingByDedupe = await (prisma as any).deviceEvent.findFirst({
			where: {
				organizationId: params.organizationId,
				dedupeKey: params.dedupeKey,
			},
			select: { id: true },
		});
		if (existingByDedupe) return existingByDedupe;

		const serialNo = String(params.serialNo || "").trim();
		if (!serialNo || !params.employeeNo) return null;
		const start = new Date(params.eventTime);
		start.setUTCHours(0, 0, 0, 0);
		start.setUTCDate(start.getUTCDate() - 1);
		const end = new Date(params.eventTime);
		end.setUTCHours(23, 59, 59, 999);
		end.setUTCDate(end.getUTCDate() + 1);
		const candidates = await (prisma as any).deviceEvent.findMany({
			where: {
				organizationId: params.organizationId,
				deviceId: params.deviceId,
				employeeNo: params.employeeNo,
				source: params.source,
				eventTime: { gte: start, lte: end },
			},
			select: { id: true, payload: true },
			orderBy: { receivedAt: "desc" },
			take: 200,
		});
		return (
			candidates.find((candidate: any) => {
				const payload = candidate?.payload || {};
				const candidateSerial =
					payload?.serialNo ||
					payload?.AcsEventInfo?.serialNo ||
					payload?.EventNotificationAlert?.AccessControllerEvent?.serialNo ||
					payload?.AccessControllerEvent?.serialNo;
				return String(candidateSerial || "").trim() === serialNo;
			}) || null
		);
	};

	const resolveHikvisionImportStartTime = (timeWindow?: string | null) => {
		const windowKey = String(timeWindow || "all")
			.trim()
			.toLowerCase();
		const days =
			windowKey === "7d" ? 7 : windowKey === "30d" ? 30 : windowKey === "90d" ? 90 : null;
		if (days === null) return "2000-01-01T00:00:00+08:00";
		return formatHikvisionManilaDateTime(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
	};

	const resolveHikvisionImportWindow = (params: {
		timeWindow?: string | null;
		from?: string | null;
		to?: string | null;
	}) => {
		const fromRaw = String(params.from || "").trim();
		const toRaw = String(params.to || "").trim();
		const fromDate = fromRaw ? parseHikvisionBusinessDateBound(fromRaw) : null;
		const toDate = toRaw ? parseHikvisionBusinessDateBound(toRaw, true) : null;
		return {
			from: fromRaw || null,
			to: toRaw || null,
			startTime: fromDate
				? formatHikvisionManilaDateTime(fromDate)
				: resolveHikvisionImportStartTime(params.timeWindow),
			endTime: toDate
				? formatHikvisionManilaDateTime(toDate)
				: formatHikvisionManilaDateTime(new Date(Date.now() + 60 * 1000)),
		};
	};

	const processHikvisionImportJob = async (params: {
		jobId: string;
		runId?: string;
		req: Request;
		device: any;
		totalHint: number;
		attendanceSourceTotal?: number | null;
		operationSourceTotal?: number | null;
		targetImportCount?: number | null;
		targetAttendanceCount?: number | null;
		targetOperationsCount?: number | null;
		skipMissingEmployeeNo?: boolean;
		/** Default true: ACS attendance taps. */
		includeAttendance?: boolean;
		/** Default true: Information logSearch user/enrollment activity. */
		includeOperations?: boolean;
		/** all | 7d | 30d | 90d */
		timeWindow?: string | null;
		sourceGroup?: "all" | "attendance" | "operations" | "needsReview";
		from?: string | null;
		to?: string | null;
		startTime?: string | null;
		endTime?: string | null;
	}) => {
		const { jobId, runId, req, device, totalHint } = params;
		const skipMissingEmployeeNo = params.skipMissingEmployeeNo === true;
		const includeAttendance = params.includeAttendance !== false;
		const includeOperations = params.includeOperations !== false;
		const timeWindow = String(params.timeWindow || "all").trim() || "all";
		const windowScope =
			params.startTime && params.endTime
				? {
						from: params.from || null,
						to: params.to || null,
						startTime: params.startTime,
						endTime: params.endTime,
					}
				: resolveHikvisionImportWindow({
						timeWindow,
						from: params.from,
						to: params.to,
					});
		const targetImportCount =
			params.targetImportCount !== null &&
			params.targetImportCount !== undefined &&
			Number.isFinite(Number(params.targetImportCount))
				? Math.max(Number(params.targetImportCount), 0)
				: null;
		const targetAttendanceCount =
			params.targetAttendanceCount !== null &&
			params.targetAttendanceCount !== undefined &&
			Number.isFinite(Number(params.targetAttendanceCount))
				? Math.max(Number(params.targetAttendanceCount), 0)
				: includeAttendance
					? targetImportCount
					: 0;
		const targetOperationsCount =
			params.targetOperationsCount !== null &&
			params.targetOperationsCount !== undefined &&
			Number.isFinite(Number(params.targetOperationsCount))
				? Math.max(Number(params.targetOperationsCount), 0)
				: includeOperations
					? null
					: 0;
		const ctrl = callbackController(prisma);
		const pageSize = Math.max(
			1,
			Math.min(Number(process.env.HIKVISION_IMPORT_PAGE_SIZE || 50), 200),
		);
		const fullScanLimit = Math.max(
			1,
			Math.min(Number(process.env.HIKVISION_IMPORT_MAX_EVENTS || totalHint || 1000), 10000),
		);
		// Cap is an upper bound only. Old default (200) made large attendance residuals
		// report "0 / 200" forever while target estimate stayed ~4k.
		const targetedMaxScanCap = Math.max(
			100,
			Math.min(Number(process.env.HIKVISION_IMPORT_TARGETED_MAX_SCAN || 5000), 10000),
		);
		const attendanceTargetForScan =
			includeAttendance &&
			targetAttendanceCount !== null &&
			targetAttendanceCount !== undefined
				? Number(targetAttendanceCount)
				: includeAttendance && targetImportCount !== null
					? Number(targetImportCount)
					: null;
		const targetedScanLimit =
			attendanceTargetForScan !== null && Number.isFinite(attendanceTargetForScan)
				? Math.min(
						fullScanLimit,
						targetedMaxScanCap,
						Math.max(
							attendanceTargetForScan + 50,
							Math.ceil(attendanceTargetForScan * 1.5),
							100,
						),
					)
				: null;
		const maxEvents = Math.min(fullScanLimit, targetedScanLimit || fullScanLimit);
		const effectivePageSize =
			attendanceTargetForScan !== null
				? Math.min(pageSize, Math.max(Math.min(attendanceTargetForScan + 10, 100), 10))
				: pageSize;
		const { startTime, endTime } = windowScope;
		let position = 0;
		let processed = 0;
		let imported = 0;
		let skipped = 0;
		let alreadySaved = 0;
		let knownSkipped = 0;
		let failed = 0;
		let attendanceImported = 0;
		let operationsImported = 0;
		let sourceTotalForLoop =
			Number.isFinite(Number(totalHint)) && Number(totalHint) > 0
				? Math.min(Number(totalHint), maxEvents)
				: maxEvents;
		const scopeParts: string[] = [];
		if (includeAttendance) scopeParts.push("attendance taps");
		if (includeOperations) scopeParts.push("user & enrollment activity");
		const scopeLabel = scopeParts.length ? scopeParts.join(" + ") : "selected device logs";
		const overallTarget =
			targetImportCount !== null
				? targetImportCount
				: (Number(targetAttendanceCount || 0) || 0) +
						(Number(targetOperationsCount || 0) || 0) || null;

		try {
			updateDeviceImportJob(jobId, {
				total: overallTarget || Math.min(totalHint || maxEvents, maxEvents),
				sourceTotal: totalHint,
				attendanceSourceTotal: params.attendanceSourceTotal ?? null,
				operationSourceTotal: params.operationSourceTotal ?? null,
				targetImportCount: overallTarget,
				scanLimit: maxEvents,
				includeAttendance,
				includeOperations,
				timeWindow,
				sourceGroup: params.sourceGroup || "all",
				from: windowScope.from,
				to: windowScope.to,
				startTime,
				endTime,
				attendanceImported: 0,
				operationsImported: 0,
				phase: "starting",
				message: `Preparing to save ${scopeLabel}${timeWindow !== "all" ? ` (${timeWindow})` : ""}`,
			});

			// ── Phase A: user & enrollment activity (Information logSearch) ──
			// Preview classifies Add Fingerprint / Add Person from this source.
			// Attendance-only ACS import never creates USER_CREATED / FINGERPRINT_ENROLLED rows.
			if (includeOperations) {
				const operationSourceTotal = Number(params.operationSourceTotal || 0);
				const operationTargetHint =
					targetOperationsCount !== null && targetOperationsCount !== undefined
						? Number(targetOperationsCount)
						: operationSourceTotal;
				const configuredOperationCap = Number(
					process.env.HIKVISION_IMPORT_MAX_OPERATION_EVENTS ||
						process.env.HIKVISION_IMPORT_OPERATION_SCAN_CAP ||
						(operationSourceTotal > 0 ? operationSourceTotal : 50000),
				);
				const opMaxCap = Math.max(
					50,
					Math.min(
						Number.isFinite(configuredOperationCap) ? configuredOperationCap : 50000,
						50000,
					),
				);
				const opMax =
					operationTargetHint !== null &&
					operationTargetHint !== undefined &&
					Number.isFinite(operationTargetHint) &&
					operationTargetHint > 0
						? Math.min(
								opMaxCap,
								Math.max(
									Number(operationTargetHint) + 50,
									Math.ceil(Number(operationTargetHint) * 1.5),
									100,
								),
							)
						: opMaxCap;
				let opProcessed = 0;
				const operationMetaImports = [
					{
						metaId: "log.hikvision.com/Information/addUserInfo",
						label: "user created",
					},
					{
						metaId: "log.hikvision.com/Information/addFpByEmployeeNo",
						label: "fingerprint enrolled",
					},
					{
						metaId: "log.hikvision.com/Information/addFpByCard",
						label: "fingerprint enrolled",
					},
					{
						metaId: "log.hikvision.com/Information/clearUserInfo",
						label: "user deleted",
					},
				];
				updateDeviceImportJob(jobId, {
					phase: "operations",
					scanLimit: Math.max(maxEvents, opMax),
					message:
						"Reading user & enrollment activity from classified device operation logs…",
				});
				for (const operationMeta of operationMetaImports) {
					let opPosition = 0;
					const operationSearchId = randomUUID();
					while (opProcessed < opMax) {
						const currentJob = deviceImportJobs.get(jobId);
						if (currentJob?.cancelRequested) {
							updateDeviceImportJob(jobId, {
								status: "cancelled",
								message: "Sync cancelled",
								completedAt: new Date(),
							});
							break;
						}
						if (
							targetOperationsCount !== null &&
							targetOperationsCount !== undefined &&
							operationsImported >= Number(targetOperationsCount)
						) {
							break;
						}
						const pageSizeOp = Math.min(pageSize, opMax - opProcessed);
						let rawXml = "";
						try {
							const response = await fetchHikvisionImportPageWithRetry({
								endpoint: "/ISAPI/ContentMgmt/logSearch",
								row: opProcessed + 1,
								label: operationMeta.label,
								options: {
									method: "POST",
									deviceId: device.id,
									prisma,
									request: req,
									timeoutMs: 15000,
									ensureJsonFormat: false,
									rawResponse: true,
									headers: {
										Accept: "application/xml, text/xml, */*",
										"Content-Type": "application/xml; charset=UTF-8",
									},
									body: buildHikvisionLogSearchXml({
										searchId: operationSearchId,
										startTime,
										endTime,
										maxResults: pageSizeOp,
										searchResultPosition: opPosition,
										metaId: operationMeta.metaId,
									}),
								},
							});
							rawXml = String(response.data?.raw || "");
						} catch (error: any) {
							failed += 1;
							const job = deviceImportJobs.get(jobId);
							if (job && job.errors.length < 25) {
								job.errors.push({
									row: opProcessed + 1,
									error:
										error?.message ||
										`Operation logSearch failed for ${operationMeta.label}`,
								});
							}
							break;
						}
						const parsed = parseHikvisionLogSearchResponse(rawXml);
						if (!parsed.rows.length) break;
						for (const row of parsed.rows) {
							opProcessed += 1;
							processed += 1;
							const evidence = normalizeHikvisionLogSearchRow(row, device);
							const action = String(evidence.eventAction || "").toUpperCase();
							// Keep residual noise out of Device Events unless classified.
							if (!action || action === "UNKNOWN" || action === "UNKNOWN_OPERATION") {
								skipped += 1;
								continue;
							}
							const employeeNo = String(evidence.employeeNo || "").trim();
							if (!employeeNo && skipMissingEmployeeNo) {
								skipped += 1;
								knownSkipped += 1;
								continue;
							}
							try {
								const saved = await persistNormalizedHikvisionEvidence({
									req,
									organizationId: String(device.organizationId),
									device,
									evidence,
								});
								if (saved.duplicate) {
									alreadySaved += 1;
								} else {
									imported += 1;
									operationsImported += 1;
								}
							} catch (error: any) {
								failed += 1;
								const job = deviceImportJobs.get(jobId);
								if (job && job.errors.length < 25) {
									job.errors.push({
										row: processed,
										error:
											error?.message || "Failed to save user/enrollment log",
									});
								}
							}
							if (opProcessed % 10 === 0 || opProcessed >= opMax) {
								updateDeviceImportJob(jobId, {
									processed,
									imported,
									skipped,
									alreadySaved,
									knownSkipped,
									failed,
									operationsImported,
									attendanceImported,
									phase: "operations",
									message: `Saving ${operationMeta.label} activity… ${operationsImported.toLocaleString()} new`,
								});
							}
							if (
								targetOperationsCount !== null &&
								targetOperationsCount !== undefined &&
								operationsImported >= Number(targetOperationsCount)
							) {
								break;
							}
						}
						opPosition += parsed.rows.length;
						if (
							parsed.totalMatches !== undefined &&
							opPosition >= Number(parsed.totalMatches)
						) {
							break;
						}
						if (String(parsed.responseStatus || "").toUpperCase() !== "MORE") break;
						const cancelled = deviceImportJobs.get(jobId);
						if (cancelled?.status === "cancelled" || cancelled?.cancelRequested) break;
					}
					const cancelled = deviceImportJobs.get(jobId);
					if (
						cancelled?.status === "cancelled" ||
						cancelled?.cancelRequested ||
						(targetOperationsCount !== null &&
							targetOperationsCount !== undefined &&
							operationsImported >= Number(targetOperationsCount)) ||
						opProcessed >= opMax
					) {
						break;
					}
				}
			}

			const cancelledAfterOps = deviceImportJobs.get(jobId);
			if (cancelledAfterOps?.status === "cancelled" || cancelledAfterOps?.cancelRequested) {
				// already finalized
			} else if (includeAttendance) {
				// ── Phase B: attendance taps (ACS AcsEvent) ──
				updateDeviceImportJob(jobId, {
					phase: "attendance",
					scanLimit: maxEvents,
					message: "Reading attendance taps from the device access log…",
				});

				let attendanceProcessed = 0;
				position = 0;
				sourceTotalForLoop =
					Number.isFinite(Number(totalHint)) && Number(totalHint) > 0
						? Math.min(Number(totalHint), maxEvents)
						: maxEvents;

				while (attendanceProcessed < maxEvents) {
					const currentJob = deviceImportJobs.get(jobId);
					if (currentJob?.cancelRequested) {
						updateDeviceImportJob(jobId, {
							status: "cancelled",
							message: "Sync cancelled",
							completedAt: new Date(),
						});
						break;
					}
					if (
						targetAttendanceCount !== null &&
						targetAttendanceCount !== undefined &&
						attendanceImported >= Number(targetAttendanceCount)
					) {
						break;
					}
					const pageMaxResults = Math.min(
						effectivePageSize,
						maxEvents - attendanceProcessed,
					);
					const payload = {
						AcsEventCond: {
							searchID: `${jobId}-att-${position}`,
							searchResultPosition: position,
							maxResults: pageMaxResults,
							major: 0,
							minor: 0,
							startTime,
							endTime,
							timeReverseOrder: true,
						},
					};
					const { data } = await fetchHikvisionImportPageWithRetry({
						endpoint: hikvisionEndpoint.accessControl.acsEvent.list,
						row: attendanceProcessed + 1,
						label: "attendance",
						pageSize: pageMaxResults,
						options: {
							method: "POST",
							deviceId: device.id,
							prisma,
							request: req,
							timeoutMs: 10000,
							headers: { "Content-Type": "application/json" },
							body: payload,
						},
					});
					const pageEvents = getAcsEventList(data);
					const totalFromDevice = firstNumericValueForKeys(data, [
						"totalMatches",
						"numOfMatches",
						"totalNum",
						"total",
					]);
					if (totalFromDevice !== null) {
						sourceTotalForLoop = Math.min(Number(totalFromDevice), maxEvents);
						updateDeviceImportJob(jobId, {
							sourceTotal: Number(totalFromDevice),
						});
					}
					if (!pageEvents.length) break;

					for (const event of pageEvents) {
						attendanceProcessed += 1;
						processed += 1;
						const employeeNo = String(
							event?.employeeNoString || event?.employeeNo || "",
						).trim();
						if (!employeeNo && skipMissingEmployeeNo) {
							skipped += 1;
							knownSkipped += 1;
						} else {
							const fingerprint = buildHikvisionImportEventFingerprint(device, event);
							const existingEvent = await findExistingHikvisionDeviceEvent({
								organizationId: String(device.organizationId),
								deviceId: device.id,
								employeeNo,
								source: fingerprint.source,
								eventTime: fingerprint.eventTime,
								serialNo: fingerprint.serialNo,
								dedupeKey: fingerprint.dedupeKey,
							});
							if (existingEvent) {
								alreadySaved += 1;
							} else {
								let statusCode = 200;
								const callbackReq = {
									...req,
									body: {
										deviceId: device.id,
										evidenceSource: "ISAPI_ACS",
										directDeviceEvidence: true,
										AcsEventInfo: event,
									},
									query: {},
									get: () => "application/json",
								} as any;
								const callbackRes = {
									status(code: number) {
										statusCode = code;
										return this;
									},
									json() {
										return this;
									},
								} as any;
								try {
									await ctrl.handleCallback(
										callbackReq,
										callbackRes,
										(() => undefined) as any,
									);
									if (statusCode >= 200 && statusCode < 300) {
										imported += 1;
										attendanceImported += 1;
									} else failed += 1;
								} catch (error: any) {
									failed += 1;
									const job = deviceImportJobs.get(jobId);
									if (job && job.errors.length < 25) {
										job.errors.push({
											row: processed,
											error:
												error?.message || "Failed to save attendance tap",
										});
									}
								}
							}
						}

						if (attendanceProcessed % 10 === 0 || attendanceProcessed >= maxEvents) {
							updateDeviceImportJob(jobId, {
								processed,
								imported,
								skipped,
								alreadySaved,
								knownSkipped,
								failed,
								attendanceImported,
								operationsImported,
								phase: "attendance",
								scanLimit: maxEvents,
								message: `Saving attendance taps… ${attendanceImported.toLocaleString()} new · checked ${attendanceProcessed.toLocaleString()} of ${maxEvents.toLocaleString()}`,
							});
						}
						if (
							targetAttendanceCount !== null &&
							targetAttendanceCount !== undefined &&
							attendanceImported >= Number(targetAttendanceCount)
						) {
							break;
						}
						if (attendanceProcessed >= maxEvents) break;
					}

					position += pageEvents.length;
					if (
						targetAttendanceCount !== null &&
						targetAttendanceCount !== undefined &&
						attendanceImported >= Number(targetAttendanceCount)
					) {
						break;
					}
					if (position >= sourceTotalForLoop) break;
				}
			} // end includeAttendance

			const finalJob = deviceImportJobs.get(jobId);
			const wasCancelled = finalJob?.status === "cancelled" || finalJob?.cancelRequested;
			const remainingEstimatedMissing =
				overallTarget === null ? 0 : Math.max(overallTarget - imported, 0);
			const summaryBits = [
				operationsImported > 0
					? `${operationsImported.toLocaleString()} user/enrollment`
					: includeOperations
						? "0 user/enrollment"
						: null,
				attendanceImported > 0
					? `${attendanceImported.toLocaleString()} attendance`
					: includeAttendance
						? "0 attendance"
						: null,
			].filter(Boolean);
			updateDeviceImportJob(jobId, {
				status: wasCancelled
					? "cancelled"
					: failed > 0 && imported === 0
						? "failed"
						: "completed",
				processed,
				imported,
				skipped,
				alreadySaved,
				knownSkipped,
				failed,
				attendanceImported,
				operationsImported,
				phase: "done",
				message: wasCancelled
					? "Sync cancelled"
					: failed > 0 && imported === 0
						? "Import failed"
						: imported > 0
							? `Saved ${imported.toLocaleString()} device logs (${summaryBits.join(", ")})`
							: remainingEstimatedMissing > 0
								? "Estimated rows were not found in the selected device scan window"
								: "No new device logs saved",
				completedAt: new Date(),
			});
			if (runId) {
				await (prisma as any).deviceSyncRun.update({
					where: { id: runId },
					data: {
						status: wasCancelled
							? "FAILED"
							: failed > 0 && imported === 0
								? "FAILED"
								: "COMPLETED",
						totalSourceRecords: processed,
						importableRecords: Math.max(processed - skipped - alreadySaved, 0),
						savedRecords: imported,
						skippedRecords: skipped,
						failedRecords: failed,
						missingRecords: remainingEstimatedMissing,
						skipSummary: {
							missingEmployeeNo: knownSkipped,
							alreadySaved,
						},
						failureSummary: failed ? { failed } : null,
						rawSummary: {
							totalHint,
							processed,
							imported,
							skipped,
							alreadySaved,
							knownSkipped,
							failed,
							skipMissingEmployeeNo,
							targetImportCount,
							targetAttendanceCount,
							targetOperationsCount,
							attendanceSourceTotal: params.attendanceSourceTotal ?? null,
							operationSourceTotal: params.operationSourceTotal ?? null,
							includeAttendance,
							includeOperations,
							sourceGroup: params.sourceGroup || "all",
							timeWindow,
							from: windowScope.from,
							to: windowScope.to,
							startTime,
							endTime,
							scanLimit: maxEvents,
							targetedLatestScan: targetImportCount !== null,
							remainingEstimatedMissing,
							cancelled: wasCancelled,
						},
						completedAt: new Date(),
					},
				});
			}
			await persistDeviceRuntimeEvent({
				req,
				organizationId: String(device.organizationId),
				deviceId: device.id,
				source: "HIKVISION_CALLBACK",
				action: "SYNC_IMPORTED",
				label: "Device logs synchronized",
				correlationId: runId || jobId,
				payload: {
					runId: runId || null,
					jobId,
					runType: "DEVICE_LOGS",
					processed,
					imported,
					skipped,
					alreadySaved,
					knownSkipped,
					failed,
					cancelled: Boolean(wasCancelled),
				},
			});
			await invalidateCache.byPattern("cache:device:events:*").catch(() => undefined);
		} catch (error: any) {
			const job = deviceImportJobs.get(jobId);
			if (job && job.errors.length < 25) {
				job.errors.push({ row: processed + 1, error: error?.message || "Import failed" });
			}
			updateDeviceImportJob(jobId, {
				status: "failed",
				processed,
				imported,
				skipped,
				failed: failed + 1,
				message: error?.message || "Sync failed",
				completedAt: new Date(),
			});
			if (runId) {
				await (prisma as any).deviceSyncRun
					.update({
						where: { id: runId },
						data: {
							status: "FAILED",
							totalSourceRecords: processed,
							importableRecords: processed - skipped,
							savedRecords: imported,
							skippedRecords: skipped,
							failedRecords: failed + 1,
							failureSummary: { message: error?.message || "Sync failed" },
							completedAt: new Date(),
						},
					})
					.catch(() => undefined);
			}
		}
	};

	const triggerHikvisionAttendanceImport = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const organizationId = (req as any).organizationId;
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}
			const deviceId = String(
				(req.body as any)?.deviceId || (req.query as any)?.deviceId || "",
			).trim();
			const requestedTargetImportCount = Number(
				(req.body as any)?.targetImportCount ?? (req.query as any)?.targetImportCount,
			);
			const hasRequestedTargetImportCount =
				Number.isFinite(requestedTargetImportCount) && requestedTargetImportCount >= 0;
			const requestedAttendanceCount = Number((req.body as any)?.targetAttendanceCount);
			const hasRequestedAttendanceCount =
				Number.isFinite(requestedAttendanceCount) && requestedAttendanceCount >= 0;
			const requestedOperationsCount = Number((req.body as any)?.targetOperationsCount);
			const hasRequestedOperationsCount =
				Number.isFinite(requestedOperationsCount) && requestedOperationsCount >= 0;
			const skipMissingEmployeeNo =
				(req.body as any)?.skipMissingEmployeeNo === true ||
				(req.query as any)?.skipMissingEmployeeNo === "true";
			const dryRun =
				(req.body as any)?.dryRun === true ||
				String((req.query as any)?.dryRun || "").toLowerCase() === "true" ||
				(req.body as any)?.execute === false ||
				String((req.query as any)?.execute || "").toLowerCase() === "false";
			const sourceGroupRaw = String(
				(req.body as any)?.sourceGroup || (req.query as any)?.sourceGroup || "all",
			)
				.trim()
				.toLowerCase();
			const sourceGroup = ["all", "attendance", "operations", "needsreview"].includes(
				sourceGroupRaw,
			)
				? sourceGroupRaw === "needsreview"
					? "needsReview"
					: (sourceGroupRaw as "all" | "attendance" | "operations")
				: "all";
			// Defaults: both sources on so Sync matches Sync logs preview (not attendance-only).
			const includeAttendance =
				sourceGroup === "all"
					? (req.body as any)?.includeAttendance !== false
					: sourceGroup === "attendance";
			const includeOperations =
				sourceGroup === "all"
					? (req.body as any)?.includeOperations !== false
					: sourceGroup === "operations" || sourceGroup === "needsReview";
			const timeWindowRaw = String((req.body as any)?.timeWindow || "all")
				.trim()
				.toLowerCase();
			const timeWindow = ["all", "7d", "30d", "90d"].includes(timeWindowRaw)
				? timeWindowRaw
				: "all";
			const from = String((req.body as any)?.from || (req.query as any)?.from || "").trim();
			const to = String((req.body as any)?.to || (req.query as any)?.to || "").trim();
			const windowScope = resolveHikvisionImportWindow({ timeWindow, from, to });
			if (!deviceId) {
				res.status(400).json(buildErrorResponse("Device is required", 400));
				return;
			}
			if (!includeAttendance && !includeOperations) {
				res.status(400).json(
					buildErrorResponse(
						"Choose at least one thing to save: attendance taps or user & enrollment activity",
						400,
					),
				);
				return;
			}
			if (sourceGroup === "needsReview" && !dryRun) {
				res.status(400).json(
					buildErrorResponse(
						"Needs review rows cannot be synced as known events. Run a dry-run and fix classification first.",
						400,
					),
				);
				return;
			}
			const device = await (prisma as any).device.findFirst({
				where: { id: deviceId, organizationId: String(organizationId), isDeleted: false },
				select: {
					id: true,
					organizationId: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
				},
			});
			if (!device || !isHikvisionDevice(device)) {
				res.status(400).json(
					buildErrorResponse("Select a Hikvision attendance device", 400),
				);
				return;
			}

			const counts = await getHikvisionSourceCounts(req, device.id, {
				includeDirectUserInventory: false,
				sampleOperationClassify: includeOperations,
				includeAttendanceSource: includeAttendance,
				includeOperationSource: includeOperations,
				startTime: windowScope.startTime,
				endTime: windowScope.endTime,
			});
			const totalHint = Number(counts.totalEvents || 0);
			const attendanceSourceTotal = Number(counts.totalEvents || 0);
			const operationSourceTotal = Number(counts.operationLogTotal || 0);
			const selectedSourceTotal =
				(includeAttendance ? attendanceSourceTotal : 0) +
				(includeOperations ? operationSourceTotal : 0);
			const [savedEvents, latestCompletedRun] = await Promise.all([
				(prisma as any).deviceEvent.count({
					where: {
						organizationId: String(organizationId),
						deviceId: device.id,
						source: "HIKVISION_CALLBACK",
					},
				}),
				findLatestCompletedDeviceLogRun(
					String(organizationId),
					device.id,
					"HIKVISION_CALLBACK",
				),
			]);
			const knownSkippedEvents = Number(latestCompletedRun?.skippedRecords || 0);
			const actionMap = await (prisma as any).deviceEvent
				.groupBy({
					by: ["eventAction"],
					where: {
						organizationId: String(organizationId),
						deviceId: device.id,
						source: "HIKVISION_CALLBACK",
					},
					_count: { _all: true },
				})
				.catch(() => []);
			const alreadyByAction = countAlreadyInHrisByAction(
				(actionMap || []).map((row: any) => ({
					eventAction: row.eventAction,
					count: row?._count?._all || 0,
				})),
			);
			const eventRows = buildHikvisionSyncLogsEventRows({
				deviceId: device.id,
				alreadyByAction,
				operationDeviceByAction:
					counts.operationDeviceByAction instanceof Map
						? counts.operationDeviceByAction
						: null,
				operationDeviceLabelsByAction:
					counts.operationDeviceLabelsByAction instanceof Map
						? counts.operationDeviceLabelsByAction
						: null,
				operationSourceOk: includeOperations && Boolean(counts.operationLogProbe?.ok),
				operationSourceTotal:
					counts.operationLogTotal === null || counts.operationLogTotal === undefined
						? null
						: Number(counts.operationLogTotal),
				attendanceSourceOk: includeAttendance && Boolean(counts.eventProbe?.ok),
				attendanceSourceTotal:
					counts.totalEvents === null || counts.totalEvents === undefined
						? null
						: Number(counts.totalEvents),
				sourceError: null,
				hideSilentZeros: true,
			});
			const readyToAdd = eventRows.reduce(
				(sum, row) =>
					sum +
					(row.status === "Ready" && typeof row.willAdd === "number"
						? Math.max(0, row.willAdd)
						: 0),
				0,
			);
			const needsReview = eventRows.reduce(
				(sum, row) =>
					sum +
					(row.status === "Needs review" && typeof row.willAdd === "number"
						? Math.max(0, row.willAdd)
						: 0),
				0,
			);
			const scopedReadyToAdd = sourceGroup === "needsReview" ? 0 : readyToAdd;
			const scopedEventRows =
				sourceGroup === "needsReview"
					? eventRows.filter((row) => row.status === "Needs review")
					: eventRows;
			const estimatedUnsaved =
				Number.isFinite(totalHint) && totalHint > 0
					? Math.max(totalHint - Number(savedEvents || 0), 0)
					: null;
			const serverEstimatedTargetImportCount =
				estimatedUnsaved === null
					? null
					: skipMissingEmployeeNo
						? Math.max(estimatedUnsaved - knownSkippedEvents, 0)
						: estimatedUnsaved;
			const targetAttendanceCount = !includeAttendance
				? 0
				: hasRequestedAttendanceCount
					? Math.max(Math.floor(requestedAttendanceCount), 0)
					: hasRequestedTargetImportCount && !includeOperations
						? Math.max(Math.floor(requestedTargetImportCount), 0)
						: hasRequestedTargetImportCount
							? null
							: serverEstimatedTargetImportCount;
			const targetOperationsCount = !includeOperations
				? 0
				: hasRequestedOperationsCount
					? Math.max(Math.floor(requestedOperationsCount), 0)
					: null;
			const targetImportCount = hasRequestedTargetImportCount
				? Math.max(Math.floor(requestedTargetImportCount), 0)
				: includeOperations
					? // ACS-only dry-run is incomplete when operations are in scope;
						// client preview sums willAdd for both families.
						null
					: serverEstimatedTargetImportCount;
			if (dryRun) {
				res.status(200).json(
					buildSuccessResponse(
						"Device log sync dry-run ready",
						{
							dryRun: true,
							endpoint: "POST /api/device/hikvision/sync",
							request: {
								deviceId: device.id,
								sourceGroup,
								includeAttendance,
								includeOperations,
								from: windowScope.from,
								to: windowScope.to,
								timeWindow,
								dryRun: true,
							},
							device: {
								id: device.id,
								name: device.name || null,
								address: device.address || null,
							},
							timeWindow: {
								from: windowScope.from,
								to: windowScope.to,
								startTime: windowScope.startTime,
								endTime: windowScope.endTime,
							},
							sources: {
								attendance: {
									label: "Attendance/access events found",
									readsFrom: "AccessControl/AcsEvent",
									ok: includeAttendance && Boolean(counts.eventProbe?.ok),
									total:
										counts.totalEvents === null ||
										counts.totalEvents === undefined
											? null
											: Number(counts.totalEvents),
									selectedTimeWindow: {
										startTime: windowScope.startTime,
										endTime: windowScope.endTime,
									},
									error: includeAttendance
										? counts.eventProbe?.error || null
										: null,
								},
								operations: {
									label: "Operation logs found",
									readsFrom: "ContentMgmt/logSearch",
									ok: includeOperations && Boolean(counts.operationLogProbe?.ok),
									total:
										counts.operationLogTotal === null ||
										counts.operationLogTotal === undefined
											? null
											: Number(counts.operationLogTotal),
									selectedTimeWindow: {
										startTime: windowScope.startTime,
										endTime: windowScope.endTime,
									},
									error: includeOperations
										? counts.operationLogProbe?.error || null
										: null,
								},
							},
							counts: {
								attendanceFound:
									counts.totalEvents === null || counts.totalEvents === undefined
										? null
										: Number(counts.totalEvents),
								operationLogsFound:
									counts.operationLogTotal === null ||
									counts.operationLogTotal === undefined
										? null
										: Number(counts.operationLogTotal),
								alreadySaved: savedEvents,
								readyToAdd: scopedReadyToAdd,
								needsReview,
								targetImportCount,
								targetAttendanceCount,
								targetOperationsCount,
							},
							eventRows: scopedEventRows,
							proof: [
								includeOperations
									? "User and enrollment operations are read from ContentMgmt/logSearch with the selected date/time window."
									: null,
								includeAttendance
									? "Attendance taps are read from AccessControl/AcsEvent with the selected date/time window."
									: null,
								"Ready to add excludes Needs review rows.",
								"Nothing was saved because dryRun=true.",
							].filter(Boolean),
						},
						200,
					),
				);
				return;
			}
			const noWorkRequested =
				(targetImportCount === 0 &&
					(targetAttendanceCount === 0 || targetAttendanceCount === null) &&
					(targetOperationsCount === 0 || targetOperationsCount === null) &&
					!includeOperations) ||
				(targetImportCount === 0 &&
					targetAttendanceCount === 0 &&
					targetOperationsCount === 0) ||
				(targetImportCount === 0 && !includeOperations && !includeAttendance);
			if (
				noWorkRequested ||
				(hasRequestedTargetImportCount &&
					Math.floor(requestedTargetImportCount) === 0 &&
					(!hasRequestedOperationsCount || Math.floor(requestedOperationsCount) === 0) &&
					(!hasRequestedAttendanceCount || Math.floor(requestedAttendanceCount) === 0))
			) {
				res.status(200).json(
					buildSuccessResponse(
						"No unsaved device logs found",
						{
							jobId: null,
							progress: {
								status: "completed",
								deviceId: device.id,
								deviceName: device.name || device.address,
								total: selectedSourceTotal || totalHint,
								sourceTotal: selectedSourceTotal || totalHint,
								targetImportCount: 0,
								includeAttendance,
								includeOperations,
								timeWindow,
								processed: 0,
								imported: 0,
								skipped: 0,
								failed: 0,
								message: "No unsaved device logs found in the dry-run estimate",
							},
						},
						200,
					),
				);
				return;
			}
			const jobId = randomUUID();
			const journalImportableRecords =
				targetImportCount !== null && targetImportCount !== undefined
					? Math.max(Number(targetImportCount) || 0, 0)
					: Math.max(
							(Number(targetAttendanceCount) || 0) +
								(Number(targetOperationsCount) || 0),
							0,
						);
			let run: { id: string } | null = null;
			try {
				run = await (prisma as any).deviceSyncRun.create({
					data: {
						organizationId: String(organizationId),
						deviceId: device.id,
						runType: "DEVICE_LOGS",
						status: "PROCESSING",
						source: "HIKVISION_CALLBACK",
						startedByUserId: (req as any).userId || null,
						totalSourceRecords: selectedSourceTotal || totalHint,
						importableRecords: journalImportableRecords,
						rawSummary: {
							totalHint,
							selectedSourceTotal,
							attendanceSourceTotal,
							operationSourceTotal,
							savedEvents,
							knownSkippedEvents,
							estimatedUnsaved,
							serverEstimatedTargetImportCount,
							requestedTargetImportCount: hasRequestedTargetImportCount
								? Math.max(Math.floor(requestedTargetImportCount), 0)
								: null,
							targetImportCount,
							targetAttendanceCount,
							targetOperationsCount,
							includeAttendance,
							includeOperations,
							sourceGroup,
							timeWindow,
							from: windowScope.from,
							to: windowScope.to,
							startTime: windowScope.startTime,
							endTime: windowScope.endTime,
							targetedLatestScan: targetImportCount !== null,
						},
					},
				});
			} catch (error) {
				if (isMissingDeviceSyncRunTableError(error)) {
					deviceLogger.warn(
						`Device sync run history table is missing; starting Hikvision import without durable run journal for device ${device.id}`,
					);
				} else {
					throw error;
				}
			}
			const queuedTargetTotal =
				Number(targetImportCount) ||
				0 ||
				(Number(targetAttendanceCount) || 0) + (Number(targetOperationsCount) || 0) ||
				selectedSourceTotal ||
				totalHint ||
				0;
			const job: DeviceImportJob = {
				jobId,
				runId: run?.id || undefined,
				status: "processing",
				organizationId: String(organizationId),
				deviceId: device.id,
				deviceName: device.name || device.address,
				total: queuedTargetTotal,
				sourceTotal: selectedSourceTotal || totalHint,
				attendanceSourceTotal,
				operationSourceTotal,
				targetImportCount,
				targetAttendanceCount,
				targetOperationsCount,
				includeAttendance,
				includeOperations,
				timeWindow,
				sourceGroup,
				from: windowScope.from,
				to: windowScope.to,
				startTime: windowScope.startTime,
				endTime: windowScope.endTime,
				attendanceImported: 0,
				operationsImported: 0,
				phase: "queued",
				processed: 0,
				imported: 0,
				skipped: 0,
				skipMissingEmployeeNo,
				failed: 0,
				message: includeOperations
					? "Sync queued — will save attendance taps and user & enrollment activity"
					: "Sync queued — will save attendance taps",
				errors: [],
				startedAt: new Date(),
				updatedAt: new Date(),
			};
			deviceImportJobs.set(jobId, job);
			persistDeviceImportJob(job);
			processHikvisionImportJob({
				jobId,
				runId: run?.id || undefined,
				req,
				device,
				totalHint,
				attendanceSourceTotal,
				operationSourceTotal,
				targetImportCount,
				targetAttendanceCount,
				targetOperationsCount,
				skipMissingEmployeeNo,
				includeAttendance,
				includeOperations,
				timeWindow,
				sourceGroup,
				from: windowScope.from,
				to: windowScope.to,
				startTime: windowScope.startTime,
				endTime: windowScope.endTime,
			}).catch((error) => {
				deviceLogger.error(`Hikvision import job ${jobId} failed: ${error}`);
			});

			res.status(202).json(
				buildSuccessResponse("Device log sync started", { jobId, progress: job }, 202),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to start device log import", 500),
			);
		}
	};

	const getDeviceImportJob = async (req: Request, res: Response, _next: NextFunction) => {
		const jobId = String(req.params.jobId || "").trim();
		const job = getHikvisionImportProgress(jobId);
		if (!job) {
			res.status(404).json(buildErrorResponse("Import job not found or expired", 404));
			return;
		}
		res.status(200).json(buildSuccessResponse("Import job retrieved", job, 200));
	};

	const cancelDeviceImportJob = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = String((req as any).organizationId || "").trim();
			const jobId = String(req.params.jobId || "").trim();
			const job = getHikvisionImportProgress(jobId);
			if (!job || job.organizationId !== organizationId) {
				res.status(404).json(buildErrorResponse("Import job not found or expired", 404));
				return;
			}
			if (job.status !== "processing") {
				res.status(200).json(buildSuccessResponse("Import job already finished", job, 200));
				return;
			}
			updateDeviceImportJob(jobId, {
				cancelRequested: true,
				cancelRequestedAt: new Date(),
				message: "Cancel requested",
			});
			res.status(200).json(
				buildSuccessResponse(
					"Device log sync cancellation requested",
					getHikvisionImportProgress(jobId) || job,
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to cancel device log sync", 500),
			);
		}
	};

	const resetDeviceEvents = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = String((req as any).organizationId || "").trim();
			const role = String((req as any).role || "").trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}
			if (!DEVICE_EVENT_RESET_ADMIN_ROLES.has(role)) {
				res.status(403).json(
					buildErrorResponse("Only admins can reset saved device events", 403),
				);
				return;
			}

			const execute = Boolean((req.body as any)?.execute);
			const includeLinkedAttendance = Boolean((req.body as any)?.includeLinkedAttendance);
			const { where, scope } = buildDeviceEventResetScope(req, organizationId);

			if (!execute) {
				const isAllTimeScope =
					scope.deviceId === "all" &&
					scope.source === "all" &&
					scope.status === "all" &&
					scope.eventCategory === "all" &&
					scope.eventAction === "all" &&
					scope.eventConfidence === "all" &&
					scope.evidenceSource === "all" &&
					!scope.legacyInferredLifecycleOnly &&
					!scope.from &&
					!scope.to;
				const deviceEventsCount = await prisma.deviceEvent.count({ where });
				const [devicesInScope, linkedAttendanceInScope] = isAllTimeScope
					? [[], []]
					: await Promise.all([
							prisma.deviceEvent.groupBy({
								by: ["deviceId"],
								where,
							}),
							prisma.deviceEvent.groupBy({
								by: ["attendanceId"],
								where: {
									...where,
									attendanceId: { not: null },
								} as Prisma.DeviceEventWhereInput,
							}),
						]);
				const counts = {
					devices: isAllTimeScope ? 0 : devicesInScope.length,
					deviceEvents: deviceEventsCount,
					linkedAttendance: isAllTimeScope ? 0 : linkedAttendanceInScope.length,
					importJobs: deviceImportJobs.size,
				};

				res.status(200).json(
					buildSuccessResponse(
						"Device event reset preview generated",
						{
							mode: "preview",
							scope,
							counts,
							affectedModels: [
								"DeviceEvent",
								"Attendance (linked only, optional)",
								"Device (export only)",
							],
						},
						200,
					),
				);
				return;
			}

			const hasDeviceEventColumns = await getDeviceEventColumnPresence();
			const events = await prisma.deviceEvent.findMany({
				where,
				orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
				select: {
					id: true,
					organizationId: true,
					deviceId: true,
					deviceUserId: hasDeviceEventColumns.deviceUserId,
					employeeId: true,
					attendanceId: true,
					eventTime: true,
					receivedAt: true,
					employeeNo: true,
					source: true,
					status: true,
					eventCategory: hasDeviceEventColumns.eventCategory,
					eventAction: hasDeviceEventColumns.eventAction,
					eventLabel: hasDeviceEventColumns.eventLabel,
					eventConfidence: hasDeviceEventColumns.eventConfidence,
					eventType: true,
					major: true,
					minor: true,
					doorNo: true,
					verifyMode: true,
					dedupeKey: true,
					payload: true,
					errorMessage: true,
					createdAt: true,
					updatedAt: true,
				},
			});
			const deviceIds = [...new Set(events.map((event) => event.deviceId).filter(Boolean))];
			const attendanceIds = [
				...new Set(events.map((event) => event.attendanceId).filter(Boolean) as string[]),
			];
			const [devices, linkedAttendance] = await Promise.all([
				deviceIds.length
					? prisma.device.findMany({
							where: { id: { in: deviceIds }, organizationId },
							select: {
								id: true,
								organizationId: true,
								name: true,
								address: true,
								port: true,
								protocol: true,
								config: true,
								access: true,
								isDeleted: true,
								createdAt: true,
								updatedAt: true,
							},
						})
					: Promise.resolve([]),
				attendanceIds.length
					? prisma.attendance.findMany({
							where: { id: { in: attendanceIds }, organizationId },
						})
					: Promise.resolve([]),
			]);
			const counts = {
				devices: devices.length,
				deviceEvents: events.length,
				linkedAttendance: linkedAttendance.length,
				importJobs: deviceImportJobs.size,
			};

			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const backupDir = path.join(
				getProjectRuntimeRoot(),
				"backups",
				`device-events-reset-${timestamp}`,
			);
			await fs.mkdir(backupDir, { recursive: true });
			const importJobs = Array.from(deviceImportJobs.values()).filter(
				(job) =>
					job.organizationId === organizationId &&
					(scope.deviceId === "all" || job.deviceId === scope.deviceId),
			);
			const manifest = {
				createdAt: new Date().toISOString(),
				actor: {
					userId: (req as any).userId || (req as any).user?.id || null,
					role,
				},
				scope,
				countsBefore: counts,
				includeLinkedAttendance,
				affectedModels: [
					"DeviceEvent",
					"Attendance (linked only, optional)",
					"Device (export only)",
					"Import jobs (memory snapshot only)",
				],
			};

			await Promise.all([
				writeJsonFile(path.join(backupDir, "manifest.json"), manifest),
				writeJsonFile(path.join(backupDir, "devices.json"), devices),
				writeJsonFile(path.join(backupDir, "device-events.json"), events),
				writeJsonFile(path.join(backupDir, "linked-attendance.json"), linkedAttendance),
				writeJsonFile(path.join(backupDir, "import-jobs.json"), importJobs),
				fs.writeFile(
					path.join(backupDir, "RECOVERY.md"),
					[
						"# Device Events Reset Recovery",
						"",
						"Records were exported before deletion. Restore should be reviewed by an admin/operator before reinserting into the active database.",
						"",
						"Suggested recovery order:",
						"1. Review `manifest.json` scope and counts.",
						"2. Reinsert `linked-attendance.json` only if attendance was deleted and those rows are still appropriate.",
						"3. Reinsert `device-events.json` after confirming dedupe keys do not already exist.",
						"4. Do not restore `devices.json` unless device rows were separately changed; this reset exports devices for context only.",
						"",
					].join("\n"),
					"utf8",
				),
			]);

			let deletedAttendance = 0;
			let deletedDeviceEvents = 0;
			await prisma.$transaction(async (tx) => {
				if (includeLinkedAttendance && attendanceIds.length) {
					const result = await tx.attendance.deleteMany({
						where: { id: { in: attendanceIds }, organizationId },
					});
					deletedAttendance = result.count;
				}
				const result = await tx.deviceEvent.deleteMany({ where });
				deletedDeviceEvents = result.count;
			});
			await invalidateCache.byPattern("cache:device:events:*").catch(() => undefined);

			const countsAfter = {
				deviceEvents: await prisma.deviceEvent.count({ where }),
				linkedAttendance: attendanceIds.length
					? await prisma.attendance.count({
							where: { id: { in: attendanceIds }, organizationId },
						})
					: 0,
			};

			res.status(200).json(
				buildSuccessResponse(
					"Device event reset completed",
					{
						mode: "executed",
						scope,
						backupDir,
						countsBefore: counts,
						countsAfter,
						deleted: {
							deviceEvents: deletedDeviceEvents,
							linkedAttendance: deletedAttendance,
						},
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Device event reset failed: ${error?.message || error}`);
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to reset saved device events", 500),
			);
		}
	};

	const getDeviceSyncPreview = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = (req as any).organizationId;
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}

			const selectedDeviceId = String(req.query.deviceId || "").trim();
			const selectedSource = String(req.query.source || "all").trim();
			const quickSavedPreview =
				String(req.query.quick || req.query.savedOnly || "")
					.trim()
					.toLowerCase() === "true";
			const includeLiveCustody =
				String(req.query.includeLiveCustody || "")
					.trim()
					.toLowerCase() === "true";
			const includeLiveSourceTotals =
				String(req.query.includeLiveSourceTotals || "")
					.trim()
					.toLowerCase() === "true";
			const devices = await prisma.device.findMany({
				where: {
					organizationId: String(organizationId),
					isDeleted: false,
					...(selectedDeviceId && selectedDeviceId !== "all"
						? { id: selectedDeviceId }
						: {}),
				},
				select: {
					id: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
				},
				orderBy: [{ name: "asc" }, { address: "asc" }],
			});

			const syncDevices = devices
				.map((device) => {
					if (isZktecoDevice(device)) {
						return { ...device, vendor: "ZKTeco", source: "ZKTECO_EVENT" as const };
					}
					if (isHikvisionDevice(device)) {
						return {
							...device,
							vendor: "Hikvision",
							source: "HIKVISION_CALLBACK" as const,
						};
					}
					return null;
				})
				.filter((device): device is NonNullable<typeof device> => Boolean(device))
				.filter((device) => selectedSource === "all" || device.source === selectedSource);

			if (!syncDevices.length) {
				res.status(200).json(
					buildSuccessResponse(
						"Device sync preview generated",
						{
							generatedAt: new Date().toISOString(),
							scope: {
								deviceId: selectedDeviceId || "all",
								source: selectedSource,
							},
							devices: [],
						},
						200,
					),
				);
				return;
			}

			const savedCounts = await (prisma as any).deviceEvent.groupBy({
				by: ["deviceId", "source"],
				where: {
					organizationId: String(organizationId),
					deviceId: { in: syncDevices.map((device) => device.id) },
					source: { in: ["ZKTECO_EVENT", "HIKVISION_CALLBACK", "EN_HCNETSDK_ALARM"] },
				},
				_count: { _all: true },
			});
			const savedCountByDeviceAndSource = new Map<string, number>();
			for (const row of savedCounts || []) {
				savedCountByDeviceAndSource.set(
					`${row.deviceId}|${row.source}`,
					Number(row?._count?._all || 0),
				);
			}
			// Event-first already-in-HRIS counts for Sync logs modal (DeviceEvent taxonomy).
			let savedByDeviceAction = new Map<string, Map<string, number>>();
			try {
				const actionCounts = await (prisma as any).deviceEvent.groupBy({
					by: ["deviceId", "eventAction"],
					where: {
						organizationId: String(organizationId),
						deviceId: { in: syncDevices.map((device) => device.id) },
						source: {
							in: ["ZKTECO_EVENT", "HIKVISION_CALLBACK", "EN_HCNETSDK_ALARM"],
						},
					},
					_count: { _all: true },
				});
				savedByDeviceAction = (actionCounts || []).reduce(
					(groups: Map<string, Map<string, number>>, row: any) => {
						const deviceId = String(row.deviceId || "").trim();
						if (!deviceId) return groups;
						const bucket = groups.get(deviceId) || new Map<string, number>();
						const action = String(row.eventAction || "UNKNOWN").trim() || "UNKNOWN";
						bucket.set(action, Number(row?._count?._all || 0));
						groups.set(deviceId, bucket);
						return groups;
					},
					new Map<string, Map<string, number>>(),
				);
			} catch {
				// Older DBs without eventAction stay device-total only; UI falls back safely.
				savedByDeviceAction = new Map();
			}
			// Fast Sync logs path: never load full DeviceUser rows/rawPayload here.
			// Full inventory scans made the modal hang for many seconds on multi-device orgs.
			const deviceUserSummaryByDeviceId = new Map<
				string,
				ReturnType<typeof summarizeDeviceUserStatuses>
			>();
			const biometricCustodyByDeviceId = new Map<
				string,
				{
					fingerprintReported: number;
					fingerprintRawPresent?: number;
					fingerprintRawMissing?: number;
					fingerprintTemplateReportedTotal?: number;
					fingerprintEnvelopePresent: number;
					fingerprintEnvelopeMissing: number;
					faceReported: number;
					faceRawPresent?: number;
					faceRawMissing?: number;
					faceTemplateReportedTotal?: number;
					faceEnvelopePresent: number;
					faceEnvelopeMissing: number;
					staleHrisOnlyRows?: number;
					staleFingerprintReported?: number;
					staleFingerprintRawPresent?: number;
					staleFingerprintRawBlobCount?: number;
					staleFingerprintRawMissing?: number;
					staleFaceReported?: number;
					staleFaceRawPresent?: number;
					staleFaceRawMissing?: number;
					custodyScope?: string;
				}
			>();
			const emptyBiometricCustody = () => ({
				fingerprintReported: 0,
				fingerprintRawPresent: 0,
				fingerprintRawMissing: 0,
				fingerprintTemplateReportedTotal: 0,
				fingerprintEnvelopePresent: 0,
				fingerprintEnvelopeMissing: 0,
				faceReported: 0,
				faceRawPresent: 0,
				faceRawMissing: 0,
				faceTemplateReportedTotal: 0,
				faceEnvelopePresent: 0,
				faceEnvelopeMissing: 0,
				staleHrisOnlyRows: 0,
				staleFingerprintReported: 0,
				staleFingerprintRawPresent: 0,
				staleFingerprintRawBlobCount: 0,
				staleFingerprintRawMissing: 0,
				staleFaceReported: 0,
				staleFaceRawPresent: 0,
				staleFaceRawMissing: 0,
				custodyScope: "hris_device_users",
			});
			if (await hasDeviceUserTable()) {
				try {
					const statusGroups = await (prisma as any).deviceUser.groupBy({
						by: ["deviceId", "status", "vendorUserId"],
						where: {
							organizationId: String(organizationId),
							deviceId: { in: syncDevices.map((device) => device.id) },
						},
						_count: { _all: true },
					});
					const linkedGroups = await (prisma as any).deviceUser.groupBy({
						by: ["deviceId", "vendorUserId"],
						where: {
							organizationId: String(organizationId),
							deviceId: { in: syncDevices.map((device) => device.id) },
							employeeId: { not: null },
						},
						_count: { _all: true },
					});
					const linkedCountByDeviceId = new Map<string, number>();
					for (const row of linkedGroups || []) {
						const deviceId = String(row.deviceId || "").trim();
						if (!deviceId) continue;
						linkedCountByDeviceId.set(
							deviceId,
							(linkedCountByDeviceId.get(deviceId) || 0) + 1,
						);
					}
					const byDevice = new Map<
						string,
						{
							total: number;
							active: number;
							matched: number;
							unmatched: number;
							conflict: number;
							disabled: number;
						}
					>();
					for (const device of syncDevices) {
						byDevice.set(device.id, {
							total: 0,
							active: 0,
							matched: 0,
							unmatched: 0,
							conflict: 0,
							disabled: 0,
						});
					}
					for (const row of statusGroups || []) {
						const deviceId = String(row.deviceId || "").trim();
						if (!deviceId || !byDevice.has(deviceId)) continue;
						const bucket = byDevice.get(deviceId)!;
						const count = 1;
						const status = String(row.status || "").toUpperCase();
						bucket.total += count;
						if (status === "ACTIVE") bucket.active += count;
						else if (status === "MATCHED") bucket.matched += count;
						else if (status === "UNMATCHED" || status === "SOURCE_ONLY")
							bucket.unmatched += count;
						else if (status === "CONFLICT") bucket.conflict += count;
						else if (status === "DISABLED") bucket.disabled += count;
					}
					for (const [deviceId, summary] of byDevice.entries()) {
						summary.matched = Math.max(
							summary.active,
							linkedCountByDeviceId.get(deviceId) || 0,
						);
						deviceUserSummaryByDeviceId.set(deviceId, summary as any);
						biometricCustodyByDeviceId.set(deviceId, emptyBiometricCustody());
					}
					const shouldLoadDetailedCustody =
						includeLiveCustody &&
						Boolean(selectedDeviceId) &&
						selectedDeviceId !== "all" &&
						!quickSavedPreview;
					if (shouldLoadDetailedCustody && (await hasDeviceUserVendorMetadataColumn())) {
						const biometricRows = await (prisma as any).deviceUser.findMany({
							where: {
								organizationId: String(organizationId),
								deviceId: { in: syncDevices.map((device) => device.id) },
							},
							select: {
								deviceId: true,
								vendorUserId: true,
								status: true,
								employeeId: true,
								rawPayload: true,
								vendorMetadata: true,
							},
						});
						const rowsByDevice = new Map<string, any[]>();
						for (const row of biometricRows || []) {
							const deviceId = String(row?.deviceId || "").trim();
							if (!deviceId) continue;
							const bucket = rowsByDevice.get(deviceId) || [];
							bucket.push(row);
							rowsByDevice.set(deviceId, bucket);
						}
						const liveVendorUserIdsByDeviceId = new Map<string, Set<string>>();
						if (selectedDeviceId && selectedDeviceId !== "all") {
							for (const device of syncDevices.filter(
								(item) => item.vendor === "Hikvision",
							)) {
								try {
									const snapshot = await withDeviceUserImportTimeout(
										loadHikvisionDeviceUserSnapshot(req, device),
										Math.max(HIKVISION_PREVIEW_DEVICE_BUDGET_MS, 15_000),
										"Live device users unavailable for custody scope",
									);
									liveVendorUserIdsByDeviceId.set(
										device.id,
										new Set(
											snapshot.candidates
												.map((candidate) =>
													String(candidate.vendorUserId || "").trim(),
												)
												.filter(Boolean),
										),
									);
								} catch (error: any) {
									deviceLogger.warn(
										`Live custody scope unavailable for ${device.id}: ${error?.message || error}`,
									);
								}
							}
						}
						for (const device of syncDevices) {
							const deviceRows = rowsByDevice.get(device.id) || [];
							deviceUserSummaryByDeviceId.set(
								device.id,
								summarizeDeviceUserStatuses(deviceRows) as any,
							);
							biometricCustodyByDeviceId.set(
								device.id,
								summarizeDeviceUserRawBiometricCustody(deviceRows, {
									liveVendorUserIds:
										liveVendorUserIdsByDeviceId.get(device.id) || null,
								}),
							);
						}
					}
				} catch {
					for (const device of syncDevices) {
						deviceUserSummaryByDeviceId.set(device.id, {
							total: 0,
							active: 0,
							matched: 0,
							unmatched: 0,
							conflict: 0,
							disabled: 0,
						} as any);
						biometricCustodyByDeviceId.set(device.id, emptyBiometricCustody());
					}
				}
			} else {
				for (const device of syncDevices) {
					deviceUserSummaryByDeviceId.set(device.id, {
						total: 0,
						active: 0,
						matched: 0,
						unmatched: 0,
						conflict: 0,
						disabled: 0,
					} as any);
					biometricCustodyByDeviceId.set(device.id, emptyBiometricCustody());
				}
			}
			// Peer baseline drift requires full inventory rows; skip on Sync logs modal open path.
			const peerBaselineByVendor = new Map<
				string,
				{
					deviceId: string;
					deviceName: string;
					rows: SavedDeviceUserTruthRow[];
					summary: ReturnType<typeof summarizeSavedDeviceUserTruth>;
				}
			>();

			const zktecoDevices = syncDevices.filter((device) => device.vendor === "ZKTeco");
			// Sync logs modal must open in ~1-3s. Never use the long full-history ZKTeco
			// preview path here; status is enough for readiness + counts. One offline
			// device must not block the modal for ready devices.
			const zktecoPreviewPromise =
				zktecoDevices.length > 0 ? getZktecoBridgeStatus() : Promise.resolve(null);
			const hikvisionTotals = new Map<string, any>();
			const hikvisionPreviewTimeout = (message: string) => ({
				ok: false,
				totalEvents: null,
				operationLogTotal: null,
				userCount: null,
				latencyMs: HIKVISION_FAST_USER_COUNT_TIMEOUT_MS,
				error: message,
				eventProbe: { ok: false, count: null, error: message },
				operationLogProbe: { ok: false, count: null, error: message },
			});
			const shouldProbeLiveSourceTotals =
				includeLiveSourceTotals &&
				Boolean(selectedDeviceId) &&
				selectedDeviceId !== "all" &&
				!quickSavedPreview;
			const hikvisionDevices = syncDevices.filter((device) => device.vendor === "Hikvision");
			const hikvisionPreviewBudgetMs = shouldProbeLiveSourceTotals
				? HIKVISION_SYNC_PREVIEW_SOURCE_BUDGET_MS
				: Math.max(
						HIKVISION_SYNC_PREVIEW_SOURCE_BUDGET_MS,
						HIKVISION_FAST_USER_COUNT_TIMEOUT_MS * 2 + 500,
					);
			const hikvisionTotalsPromise =
				hikvisionDevices.length === 0
					? Promise.resolve()
					: withDeviceUserImportTimeout(
							Promise.allSettled(
								hikvisionDevices.map(async (device) => {
									const total = shouldProbeLiveSourceTotals
										? await getHikvisionSourceTotal(req, device.id, {
												mode: "sync-preview",
											})
										: await getHikvisionFastDeviceUserSourceCount(
												req,
												device.id,
											);
									hikvisionTotals.set(device.id, total);
								}),
							),
							hikvisionPreviewBudgetMs,
							shouldProbeLiveSourceTotals
								? "Source totals timed out; using saved HRIS evidence for preview"
								: "Device user counts timed out; using saved HRIS evidence for preview",
						).catch((error: any) => {
							const message =
								error?.message ||
								(shouldProbeLiveSourceTotals
									? "Source totals timed out; using saved HRIS evidence for preview"
									: "Device user counts timed out; using saved HRIS evidence for preview");
							for (const device of hikvisionDevices) {
								if (!hikvisionTotals.has(device.id)) {
									hikvisionTotals.set(
										device.id,
										hikvisionPreviewTimeout(message),
									);
								}
							}
						});
			const [zktecoPreview] = await Promise.all([
				zktecoPreviewPromise,
				hikvisionTotalsPromise,
			]);
			const zktecoPreviewByIp = new Map<string, any>();
			for (const item of zktecoPreview?.data?.devices || []) {
				zktecoPreviewByIp.set(String(item?.ip || "").trim(), item);
			}
			const latestCompletedRuns = await Promise.all(
				syncDevices.map(async (device) => {
					const run = await findLatestCompletedDeviceLogRun(
						String(organizationId),
						device.id,
						device.source,
					);
					return [device.id, run] as const;
				}),
			);
			const latestRunByDeviceId = new Map(latestCompletedRuns);

			const previewRows = syncDevices.map((device) => {
				const hikvisionSaved =
					(savedCountByDeviceAndSource.get(`${device.id}|HIKVISION_CALLBACK`) || 0) +
					(savedCountByDeviceAndSource.get(`${device.id}|EN_HCNETSDK_ALARM`) || 0);
				const syncedEvents =
					device.vendor === "Hikvision"
						? hikvisionSaved ||
							savedCountByDeviceAndSource.get(`${device.id}|${device.source}`) ||
							0
						: savedCountByDeviceAndSource.get(`${device.id}|${device.source}`) || 0;
				const deviceUserSummary = deviceUserSummaryByDeviceId.get(device.id) || {
					total: 0,
					active: 0,
					matched: 0,
					unmatched: 0,
					conflict: 0,
					disabled: 0,
				};
				const biometricCustody = biometricCustodyByDeviceId.get(device.id) || {
					fingerprintReported: 0,
					fingerprintRawPresent: 0,
					fingerprintRawMissing: 0,
					fingerprintTemplateReportedTotal: 0,
					fingerprintEnvelopePresent: 0,
					fingerprintEnvelopeMissing: 0,
					faceReported: 0,
					faceRawPresent: 0,
					faceRawMissing: 0,
					faceTemplateReportedTotal: 0,
					faceEnvelopePresent: 0,
					faceEnvelopeMissing: 0,
				};
				const latestRun = latestRunByDeviceId.get(device.id);
				const knownSkippedEvents = Number(latestRun?.skippedRecords || 0);
				const failedEvents = Number(latestRun?.failedRecords || 0);
				const sourcePreview =
					device.vendor === "ZKTeco"
						? zktecoPreviewByIp.get(String(device.address || "").trim())
						: hikvisionTotals.get(device.id);
				const liveSourceSkippedForQuickPreview = Boolean(
					sourcePreview?.skippedForQuickPreview,
				);
				const peerBaseline = peerBaselineByVendor.get(device.vendor) || null;
				const peerDrift = {
					missingUsers: 0,
					staleUsers: 0,
					missingFingerprintCount: 0,
					missingFaceCount: 0,
					missingCardCount: 0,
					totalCredentialGapCount: 0,
					totalNeedsMatchCount: 0,
					// Peer baseline comparison deliberately skipped on sync-preview for speed.
					skippedForPreviewSpeed: true,
					peerBaselineDeviceId: peerBaseline?.deviceId || null,
				};
				const totalEvents =
					device.vendor === "ZKTeco"
						? (sourcePreview?.totalEvents ?? null)
						: (sourcePreview?.totalEvents ?? null);
				const operationLogTotal =
					device.vendor === "Hikvision"
						? (sourcePreview?.operationLogTotal ??
							sourcePreview?.operationLogProbe?.count ??
							null)
						: null;
				const vendorUserCount =
					device.vendor === "ZKTeco"
						? firstNumericValueForKeys(sourcePreview, [
								"userCount",
								"usersCount",
								"totalUsers",
								"userTotal",
								"users",
							])
						: (sourcePreview?.userCount ?? null);
				const totalUnsavedEvents =
					totalEvents !== null &&
					totalEvents !== undefined &&
					Number.isFinite(Number(totalEvents))
						? Math.max(Number(totalEvents) - syncedEvents, 0)
						: null;
				const needsSyncEvents =
					totalUnsavedEvents !== null && totalUnsavedEvents !== undefined
						? Math.max(totalUnsavedEvents - knownSkippedEvents, 0)
						: null;
				const sourceError =
					sourcePreview?.error ||
					sourcePreview?.lastError ||
					(device.vendor === "ZKTeco" && zktecoPreview && !sourcePreview
						? zktecoPreview.error || "ZKTeco SDK preview did not return this device"
						: null);
				const rawSourceErrorMessage =
					liveSourceSkippedForQuickPreview ||
					sourceError === null ||
					sourceError === undefined
						? null
						: String(sourceError);
				const sourceErrorMessage =
					device.vendor === "Hikvision" &&
					rawSourceErrorMessage &&
					/^\d+$/.test(rawSourceErrorMessage)
						? `Hikvision event total unavailable (code ${rawSourceErrorMessage})`
						: rawSourceErrorMessage &&
							  isHikvisionTransportFailure(rawSourceErrorMessage)
							? "Can't reach this device right now. Other devices can still be reviewed."
							: rawSourceErrorMessage;
				const actionMap = savedByDeviceAction.get(device.id) || new Map<string, number>();
				const alreadyByAction = countAlreadyInHrisByAction(
					Array.from(actionMap.entries()).map(([eventAction, count]) => ({
						eventAction,
						count,
					})),
				);
				const attendanceOk =
					device.vendor === "Hikvision"
						? Boolean(
								sourcePreview?.eventProbe?.ok ??
								(totalEvents !== null && !sourceErrorMessage),
							)
						: Boolean(!sourceErrorMessage && totalEvents !== null);
				const operationOk =
					device.vendor === "Hikvision"
						? Boolean(
								sourcePreview?.operationLogProbe?.ok ??
								(operationLogTotal !== null && operationLogTotal !== undefined),
							)
						: false;
				const operationDeviceByAction =
					device.vendor === "Hikvision" &&
					sourcePreview?.operationDeviceByAction instanceof Map
						? (sourcePreview.operationDeviceByAction as Map<string, number>)
						: device.vendor === "Hikvision" &&
							  sourcePreview?.operationDeviceByAction &&
							  typeof sourcePreview.operationDeviceByAction === "object"
							? new Map(
									Object.entries(sourcePreview.operationDeviceByAction).map(
										([action, count]) => [action, Number(count) || 0],
									),
								)
							: null;
				const operationDeviceLabelsByAction =
					device.vendor === "Hikvision" &&
					sourcePreview?.operationDeviceLabelsByAction instanceof Map
						? (sourcePreview.operationDeviceLabelsByAction as Map<string, string[]>)
						: device.vendor === "Hikvision" &&
							  sourcePreview?.operationDeviceLabelsByAction &&
							  typeof sourcePreview.operationDeviceLabelsByAction === "object"
							? new Map(
									Object.entries(sourcePreview.operationDeviceLabelsByAction).map(
										([action, labels]) => [
											action,
											Array.isArray(labels)
												? labels.map(String).filter(Boolean)
												: [],
										],
									),
								)
							: null;
				const eventRows =
					device.vendor === "Hikvision"
						? buildHikvisionSyncLogsEventRows({
								deviceId: device.id,
								alreadyByAction,
								operationDeviceByAction,
								operationDeviceLabelsByAction,
								operationSourceOk: operationOk,
								operationSourceTotal:
									operationLogTotal === null || operationLogTotal === undefined
										? null
										: Number(operationLogTotal),
								attendanceSourceOk: attendanceOk,
								attendanceSourceTotal:
									totalEvents === null || totalEvents === undefined
										? null
										: Number(totalEvents),
								sourceError: sourceErrorMessage,
								hideSilentZeros: true,
							})
						: buildZktecoSyncLogsEventRows({
								deviceId: device.id,
								willAdd: needsSyncEvents,
								alreadyInHris: syncedEvents,
								sourceProof: "ZKTeco events",
								sourceOk: Boolean(zktecoPreview?.ok) && !sourceErrorMessage,
								error: sourceErrorMessage,
							});
				const sources =
					device.vendor === "Hikvision"
						? buildHikvisionSourceChecks({
								operationOk,
								operationTotal:
									operationLogTotal === null || operationLogTotal === undefined
										? null
										: Number(operationLogTotal),
								operationError: sourcePreview?.operationLogProbe?.error || null,
								attendanceOk,
								attendanceTotal:
									totalEvents === null || totalEvents === undefined
										? null
										: Number(totalEvents),
								attendanceError:
									sourcePreview?.eventProbe?.error || sourceErrorMessage,
							})
						: [
								{
									key: "zkteco_events",
									label: "ZKTeco events",
									readsFrom: "ZKTeco bridge",
									ok: Boolean(zktecoPreview?.ok) && !sourceErrorMessage,
									total: totalEvents === null ? null : Number(totalEvents),
									error: sourceErrorMessage,
									status:
										Boolean(zktecoPreview?.ok) && !sourceErrorMessage
											? "ready"
											: "unavailable",
								},
							];
				const readySourceCount = sources.filter((source) => source.ok).length;
				const eventWillAddTotal = eventRows.reduce(
					(sum, row) =>
						sum +
						(row.status === "Ready" && typeof row.willAdd === "number"
							? Math.max(0, row.willAdd)
							: 0),
					0,
				);
				const canStartSync =
					!sourceErrorMessage &&
					(device.vendor === "Hikvision"
						? eventWillAddTotal > 0
						: (eventWillAddTotal > 0 ||
								(Number.isFinite(Number(needsSyncEvents)) &&
									Number(needsSyncEvents) > 0)) &&
							device.vendor === "ZKTeco" &&
							Boolean(zktecoPreview?.ok));
				const status = liveSourceSkippedForQuickPreview
					? "saved_preview"
					: sourceErrorMessage
						? "source_unavailable"
						: !shouldProbeLiveSourceTotals && vendorUserCount !== null
							? "user_count_ready"
							: totalEvents === null && operationLogTotal === null
								? "source_total_unavailable"
								: needsSyncEvents && needsSyncEvents > 0
									? "needs_sync"
									: eventWillAddTotal > 0
										? "needs_sync"
										: "synced";
				const syncDecisionMatrix = buildDeviceUserSyncDecisionMatrix({
					vendorUserCount,
					hrisUserCount: deviceUserSummary.total,
					openUserCount: deviceUserSummary.unmatched,
					conflictUserCount: deviceUserSummary.conflict,
					fingerprintRawMissing:
						(biometricCustody as any).fingerprintRawMissing ??
						(biometricCustody as any).fingerprintEnvelopeMissing,
					faceRawMissing:
						(biometricCustody as any).faceRawMissing ??
						(biometricCustody as any).faceEnvelopeMissing,
					staleHrisOnlyRows: (biometricCustody as any).staleHrisOnlyRows,
					staleFingerprintRawMissing: (biometricCustody as any)
						.staleFingerprintRawMissing,
					staleFaceRawMissing: (biometricCustody as any).staleFaceRawMissing,
					sourceStatus: status,
					sourceError: sourceErrorMessage,
				});
				return {
					deviceId: device.id,
					name: device.name,
					address: device.address,
					port: device.port,
					vendor: device.vendor,
					source: device.source,
					syncedEvents,
					totalEvents,
					needsSyncEvents,
					hrisSavedCount: syncedEvents,
					vendorEventCount: totalEvents,
					operationLogTotal,
					vendorUserCount,
					directFingerprintUserCount: sourcePreview?.fingerprintUserCount ?? null,
					directFaceUserCount: sourcePreview?.faceUserCount ?? null,
					directCardUserCount: sourcePreview?.cardUserCount ?? null,
					inventoryEvidenceSource: sourcePreview?.inventoryEvidenceSource ?? null,
					hrisUserCount: deviceUserSummary.total,
					linkedUserCount: deviceUserSummary.matched,
					openUserCount: deviceUserSummary.unmatched,
					...biometricCustody,
					conflictUserCount: deviceUserSummary.conflict,
					disabledUserCount: deviceUserSummary.disabled,
					peerBaselineDeviceId: peerBaseline?.deviceId || null,
					peerBaselineDeviceName: peerBaseline?.deviceName || null,
					peerMissingUserCount: peerDrift.missingUsers,
					peerStaleUserCount: peerDrift.staleUsers,
					peerMissingFingerprintCount: peerDrift.missingFingerprintCount,
					peerMissingFaceCount: peerDrift.missingFaceCount,
					peerMissingCardCount: peerDrift.missingCardCount,
					peerDriftTotalCount: peerDrift.totalNeedsMatchCount,
					peerCredentialGapCount: peerDrift.totalCredentialGapCount,
					knownSkippedEventCount: knownSkippedEvents,
					totalUnsavedEventCount: totalUnsavedEvents,
					importableIfSkipMissingEmployeeNo: needsSyncEvents,
					importableIfSaveMissingEmployeeNo: totalUnsavedEvents,
					failedEventCount: failedEvents,
					importableSavedCount: syncedEvents,
					missingEventCount: needsSyncEvents,
					canStartSync,
					syncAction: canStartSync
						? device.vendor === "Hikvision"
							? "hikvision-import"
							: "zkteco-bridge-sync"
						: null,
					lastSourceEventAt:
						device.vendor === "ZKTeco" ? sourcePreview?.lastSelectedAt || null : null,
					countLatencyMs: liveSourceSkippedForQuickPreview
						? 0
						: (sourcePreview?.latencyMs ?? null),
					eventRows,
					sources,
					readySourceCount,
					sourceCheckTotal: sources.length,
					syncDecisionMatrix,
					...(sourceErrorMessage ? { error: sourceErrorMessage } : {}),
					status,
				};
			});

			res.status(200).json(
				buildSuccessResponse(
					"Device sync preview generated",
					{
						generatedAt: new Date().toISOString(),
						scope: {
							deviceId: selectedDeviceId || "all",
							source: selectedSource,
							quick: quickSavedPreview,
						},
						bridge: zktecoPreview
							? {
									ok: zktecoPreview.ok,
									status: zktecoPreview.status,
									statusUrl: zktecoPreview.statusUrl,
									error: zktecoPreview.error,
								}
							: null,
						devices: previewRows,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to build device sync preview", 500),
			);
		}
	};

	const getDeviceHealth = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = (req as any).organizationId;
			const { id } = req.params;
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}

			const device = await prisma.device.findFirst({
				where: {
					id,
					organizationId: String(organizationId),
					isDeleted: false,
				},
				select: {
					id: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
					access: true,
					updatedAt: true,
				},
			});

			if (!device) {
				res.status(404).json(buildErrorResponse(config.ERROR.DEVICE.NOT_FOUND, 404));
				return;
			}

			const isZkteco = isZktecoDevice(device);
			const quickHealth =
				String((req.query as any)?.quick || "").toLowerCase() === "true" ||
				String((req.query as any)?.mode || "").toLowerCase() === "quick";
			const parsedAddress = /^https?:\/\//i.test(device.address)
				? new URL(device.address).hostname
				: device.address;
			const hikvisionNetworkTarget = !isZkteco
				? resolveHikvisionDeviceHealthNetworkTarget(device)
				: null;
			const healthPort = isZkteco
				? Number(device.port || 4370)
				: Number(hikvisionNetworkTarget?.port || getHikvisionDeviceHttpPort(device));
			const healthHost = isZkteco
				? parsedAddress
				: String(hikvisionNetworkTarget?.host || parsedAddress);
			const baseUrl = isZkteco
				? null
				: hikvisionNetworkTarget?.endpoint || buildHikvisionDeviceBaseUrl(device);
			const startedAt = Date.now();

			const [network, zktecoBridge, lastZktecoEvent, hikvisionSourceCounts] =
				await Promise.all([
					checkTcpReachability(healthHost, healthPort, quickHealth ? 1200 : 2500),
					isZkteco ? getZktecoBridgeStatus() : Promise.resolve(null),
					isZkteco
						? (prisma as any).deviceEvent.findFirst({
								where: {
									deviceId: device.id,
									source: "ZKTECO_EVENT",
								},
								orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
								select: {
									id: true,
									status: true,
									eventTime: true,
									receivedAt: true,
									employeeNo: true,
									errorMessage: true,
								},
							})
						: Promise.resolve(null),
					isZkteco || quickHealth
						? Promise.resolve(null)
						: getHikvisionSourceCounts(req, id),
				]);

			let deviceApi: {
				ok: boolean;
				status: "online" | "offline";
				latencyMs: number | null;
				provenBy?: "systemTime" | "userRead" | "eventHistory" | "tcpReachability";
				error?: string;
				time?: unknown;
			} | null = null;
			let systemTime: {
				ok: boolean;
				status: "readable" | "unreachable";
				latencyMs: number | null;
				error?: string;
			} | null = null;
			let userRead: {
				ok: boolean;
				status: "readable" | "unknown";
				count: number | null;
				error?: string;
			} | null = null;
			let eventHistory: {
				ok: boolean;
				status: "readable" | "unknown";
				count: number | null;
				error?: string;
			} | null = null;
			if (!isZkteco) {
				const apiStartedAt = Date.now();
				if (quickHealth) {
					try {
						const time = await hikvisionFetch(hikvisionEndpoint.system.time, {
							method: "GET",
							deviceId: id,
							prisma,
							request: req,
							timeoutMs: 5000,
						});
						const latencyMs = Date.now() - apiStartedAt;
						systemTime = {
							ok: true,
							status: "readable",
							latencyMs,
						};
						deviceApi = {
							ok: true,
							status: "online",
							latencyMs,
							provenBy: "systemTime",
							time,
						};
					} catch (error: any) {
						const protocolError =
							error?.data?.errorCode ||
							error?.data?.errorCause ||
							error?.message ||
							"Device did not return a credentialed protocol response";
						systemTime = {
							ok: false,
							status: "unreachable",
							latencyMs: null,
							error: protocolError,
						};
						deviceApi = {
							ok: false,
							status: "offline",
							latencyMs: null,
							error: protocolError,
						};
					}
				} else {
					try {
						const time = await hikvisionFetch(hikvisionEndpoint.system.time, {
							method: "GET",
							deviceId: id,
							prisma,
							request: req,
							timeoutMs: 3500,
						});
						systemTime = {
							ok: true,
							status: "readable",
							latencyMs: Date.now() - apiStartedAt,
						};
						deviceApi = {
							ok: true,
							status: "online",
							latencyMs: Date.now() - apiStartedAt,
							provenBy: "systemTime",
							time,
						};
					} catch (error: any) {
						const systemTimeError =
							error?.data?.errorCode ||
							error?.data?.errorCause ||
							error?.message ||
							"Device API did not respond";
						systemTime = {
							ok: false,
							status: "unreachable",
							latencyMs: null,
							error: systemTimeError,
						};
						const fallbackProof = hikvisionSourceCounts?.userProbe?.ok
							? "userRead"
							: hikvisionSourceCounts?.eventProbe?.ok
								? "eventHistory"
								: null;
						deviceApi = fallbackProof
							? {
									ok: true,
									status: "online",
									latencyMs: hikvisionSourceCounts?.latencyMs ?? null,
									provenBy: fallbackProof,
									error: systemTimeError,
								}
							: {
									ok: false,
									status: "offline",
									latencyMs: null,
									error: systemTimeError,
								};
					}
				}
				userRead = {
					ok: Boolean(hikvisionSourceCounts?.userProbe?.ok),
					status: hikvisionSourceCounts?.userProbe?.ok ? "readable" : "unknown",
					count:
						hikvisionSourceCounts?.userProbe?.count ??
						hikvisionSourceCounts?.userCount ??
						null,
					...(quickHealth
						? { error: "Skipped in quick health mode" }
						: hikvisionSourceCounts?.userProbe?.error
							? { error: hikvisionSourceCounts.userProbe.error }
							: {}),
				};
				eventHistory = {
					ok: Boolean(hikvisionSourceCounts?.eventProbe?.ok),
					status: hikvisionSourceCounts?.eventProbe?.ok ? "readable" : "unknown",
					count:
						hikvisionSourceCounts?.eventProbe?.count ??
						hikvisionSourceCounts?.totalEvents ??
						null,
					...(quickHealth
						? { error: "Skipped in quick health mode" }
						: hikvisionSourceCounts?.eventProbe?.error
							? { error: hikvisionSourceCounts.eventProbe.error }
							: {}),
				};
			}

			const zktecoWebhook = isZkteco
				? {
						ok: appConfig.enableDeviceServices,
						status: appConfig.enableDeviceServices ? "ready" : "disabled",
						path: `${appConfig.baseApiPath || "/api"}/zkteco/events`,
					}
				: undefined;
			const bridgeDevice = isZkteco
				? getBridgeDeviceStatus(zktecoBridge, parsedAddress)
				: null;
			const zktecoDeviceConnected =
				!isZkteco || (bridgeDevice ? Boolean(bridgeDevice.connected) : false);

			const checks = isZkteco
				? [
						{ ok: true },
						{ ok: Boolean(zktecoWebhook?.ok) },
						{ ok: Boolean(zktecoBridge?.ok) },
						{ ok: zktecoDeviceConnected },
						{ ok: network.ok },
					]
				: [{ ok: true }, { ok: network.ok }, { ok: Boolean(deviceApi?.ok) }];
			const summary = {
				status: getHealthStatus(checks),
				checkedAt: new Date().toISOString(),
				durationMs: Date.now() - startedAt,
			};

			const responseChecks: Record<string, unknown> = {
				hrisApi: { ok: true, status: "online" },
				network: {
					ok: network.ok,
					status: network.ok ? "reachable" : "unreachable",
					host: healthHost,
					port: healthPort,
					latencyMs: network.latencyMs,
					...(hikvisionNetworkTarget?.source
						? {
								source: hikvisionNetworkTarget.source,
								endpoint: hikvisionNetworkTarget.endpoint,
							}
						: {}),
					...(network.error ? { error: network.error } : {}),
				},
			};

			if (isZkteco) {
				responseChecks.zktecoWebhook = zktecoWebhook;
				responseChecks.zktecoBridge = {
					ok: Boolean(zktecoBridge?.ok),
					status: zktecoBridge?.status || "offline",
					runtime:
						zktecoBridge?.data?.runtime ||
						zktecoBridge?.data?.service ||
						"project-truth-zkteco-linux-pyzk",
					statusUrl: zktecoBridge?.statusUrl,
					latencyMs: zktecoBridge?.latencyMs,
					configuredDevices: zktecoBridge?.data?.configuredDevices ?? null,
					connectedDevices: zktecoBridge?.data?.connectedDevices ?? null,
					lastEventAt: zktecoBridge?.data?.lastEventAt || null,
					device: bridgeDevice,
					...(zktecoBridge?.error ? { error: zktecoBridge.error } : {}),
				};
				responseChecks.lastZktecoEvent = lastZktecoEvent;
			} else {
				responseChecks.deviceApi = deviceApi;
				responseChecks.systemTime = systemTime;
				responseChecks.userRead = userRead;
				responseChecks.eventHistory = eventHistory;
			}

			res.status(200).json(
				buildSuccessResponse(
					"Device health checked successfully",
					{
						device: {
							id: device.id,
							name: device.name,
							address: device.address,
							port: device.port,
							protocol: device.protocol,
							vendor: isZkteco ? "ZKTeco" : "Hikvision",
							...(baseUrl ? { baseUrl } : {}),
						},
						summary,
						checks: responseChecks,
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Device health check failed: ${error?.message || error}`);
			res.status(500).json(buildErrorResponse("Failed to check device health", 500));
		}
	};

	const readHikvisionListenerStatusUncached = async () => {
		const fallbackTarget = getHikvisionListenerVmTargets()[0];
		// One SSH round-trip only. Three parallel SSH sessions previously
		// stacked ConnectTimeout on a dead LAN target and left the modal on
		// "Checking live capture…" for a long time.
		const bundled = await runHikvisionListenerVmCommand(
			[
				"bash",
				"-lc",
				[
					`printf 'ACTIVE='`,
					`systemctl is-active ${HIKVISION_HOT_RELOAD_LISTENER_SERVICE} 2>/dev/null || true`,
					`printf '\\n'`,
					`echo '---SHOW---'`,
					`systemctl show ${HIKVISION_HOT_RELOAD_LISTENER_SERVICE} --property=ActiveState,SubState,MainPID,NRestarts,ExecMainStatus,Result --no-pager 2>/dev/null || true`,
					`echo '---SPEC---'`,
					`sudo awk -F'|' 'NF >= 5 { print $1 "|" $3 "|" $4 "|" $5 }' /run/project-truth/hikvision-hot-reload-device.spec 2>/dev/null || true`,
					`echo '---LOG---'`,
					`sudo tail -n ${HIKVISION_LISTENER_STATUS_EVIDENCE_LINES} /var/log/project-truth/hikvision-hot-reload-listener.jsonl 2>/dev/null || true`,
					`echo '---KEYLOG---'`,
					`sudo tail -n 3000 /var/log/project-truth/hikvision-hot-reload-listener.jsonl 2>/dev/null | grep -E 'device_config_loaded|sdk_login|sdk_alarm_arm|device_armed|device_arming_failed_after_retries|device_login_locked_backoff|device_login_auth_failed_backoff|acs_alarm_received|hikvision_callback_post|hikvision_callback_post_result|hikvision_callback_spool_replay_result|hris_contract_post|sdk_callback_register' | tail -n ${HIKVISION_LISTENER_STATUS_KEY_EVENT_LINES} || true`,
				].join("; "),
			],
			HIKVISION_LISTENER_STATUS_TIMEOUT_MS,
		);

		const raw = String(bundled.stdout || "");
		const showChunk = raw.includes("---SHOW---")
			? raw.split("---SHOW---")[1]?.split("---SPEC---")[0] || ""
			: "";
		const specChunk = raw.includes("---SPEC---")
			? raw.split("---SPEC---")[1]?.split("---LOG---")[0] || ""
			: "";
		const logChunk = raw.includes("---LOG---")
			? raw.split("---LOG---")[1]?.split("---KEYLOG---")[0] || ""
			: "";
		const keyLogChunk = raw.includes("---KEYLOG---")
			? raw.split("---KEYLOG---").slice(1).join("---KEYLOG---")
			: "";
		const activeMatch = raw.match(/ACTIVE=([^\r\n]*)/);
		const activeText = String(activeMatch?.[1] || "").trim();
		const show = parseSystemctlShow(showChunk);
		const activeState = show.ActiveState || activeText || "unknown";
		const subState = show.SubState || "unknown";
		const mainPid = Number(show.MainPID || 0) || 0;
		const evidenceLogLines = logChunk
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
			.slice(-HIKVISION_LISTENER_STATUS_EVIDENCE_LINES);
		const recentLogLines = evidenceLogLines.slice(-HIKVISION_LISTENER_STATUS_RESPONSE_LINES);
		const keyLogLines = keyLogChunk
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
			.slice(-HIKVISION_LISTENER_STATUS_KEY_EVENT_LINES);
		const sdkEvidenceLogLines = [...keyLogLines, ...evidenceLogLines].slice(
			-(HIKVISION_LISTENER_STATUS_KEY_EVENT_LINES + HIKVISION_LISTENER_STATUS_EVIDENCE_LINES),
		);
		const activeSpecDevices = specChunk
			.split(/\r?\n/)
			.map((line) => {
				const [deviceId, name, host, sdkPort] = line
					.split("|")
					.map((part) => part?.trim() || "");
				return deviceId
					? { deviceId, name: name || null, host: host || null, sdkPort: sdkPort || null }
					: null;
			})
			.filter(Boolean) as Array<{
			deviceId: string;
			name: string | null;
			host: string | null;
			sdkPort: string | null;
		}>;
		const activeSpecDeviceIds = new Set(activeSpecDevices.map((device) => device.deviceId));
		const sdk = summarizeHikvisionListenerLogs(sdkEvidenceLogLines);
		if (activeSpecDeviceIds.size > 0) {
			const devicesById = new Map(sdk.devices.map((device) => [device.deviceId, device]));
			sdk.devices = activeSpecDevices.map((specDevice) => {
				const device = devicesById.get(specDevice.deviceId);
				return {
					...(device || {
						deviceId: specDevice.deviceId,
						lastLogAt: null,
						lastLoginAt: null,
						lastLoginOk: null,
						lastLoginError: null,
						armed: false,
						receivingCallbacks: false,
						postingToHris: false,
						lastAlarmAt: null,
						lastPostAt: null,
						lastFailureReason: null,
						state: "unknown" as const,
					}),
					deviceId: specDevice.deviceId,
					name: device?.name || specDevice.name,
					host: device?.host || specDevice.host,
					sdkPort: device?.sdkPort || specDevice.sdkPort,
				};
			});
			const scopedReceiving = sdk.devices.some((device) => device.receivingCallbacks);
			const scopedArmed = scopedReceiving || sdk.devices.some((device) => device.armed);
			sdk.receivingCallbacks = scopedReceiving;
			sdk.armed = scopedArmed;
			sdk.state = scopedReceiving ? "receiving" : scopedArmed ? "armed" : sdk.state;
			sdk.diagnosis = scopedArmed ? null : sdk.diagnosis;
		}
		// Service-enabled truth for the admin toggle:
		// - systemctl "active" is the happy path
		// - Keep ready restarts briefly report activating/reloading/deactivating while the
		//   binary is still up — do not flip the toggle OFF mid-restart
		// - When SDK is actively receiving callbacks, the path is live even if ActiveState
		//   lags (empty device rows / false "Service enabled" OFF was a real operator bug)
		const systemdLooksUp =
			activeState === "active" ||
			activeState === "activating" ||
			activeState === "reloading" ||
			(activeState === "deactivating" && mainPid > 0);
		const running =
			(systemdLooksUp && subState !== "failed") || Boolean(sdk?.receivingCallbacks);
		const sdkHasCurrentLoginFailure = Boolean(
			sdk?.lastError ||
			/login.*failed|auth_failed|backoff/i.test(String(sdk?.lastFailureReason || "")),
		);
		if (!running) {
			sdk.receivingCallbacks = false;
			sdk.armed = false;
			sdk.state = "idle";
			sdk.diagnosis =
				"Listener service is stopped; previous arm/read log entries are historical only.";
			sdk.devices = sdk.devices.map((device) => ({
				...device,
				receivingCallbacks: false,
				armed: false,
				state: "idle",
			}));
		} else if (sdkHasCurrentLoginFailure && !sdk.receivingCallbacks) {
			sdk.devices = sdk.devices.map((device) => {
				const deviceHasLoginFailure = Boolean(
					device.lastLoginOk === false ||
					device.lastLoginError ||
					/login.*failed|auth_failed|backoff/i.test(
						String(device.lastFailureReason || ""),
					),
				);
				return deviceHasLoginFailure
					? {
							...device,
							armed: false,
							state: "login_failed",
						}
					: device;
			});
			sdk.armed = sdk.devices.some(
				(device) =>
					device.receivingCallbacks || (device.armed && device.state !== "login_failed"),
			);
			sdk.state = sdk.armed ? sdk.state : "login_failed";
		}
		const resolvedTarget =
			bundled.exitCode === 0 || evidenceLogLines.length || activeText
				? bundled.target
				: fallbackTarget;
		const controlAvailable =
			bundled.exitCode === 0 || Boolean(activeText) || Boolean(show.ActiveState);
		const statusError =
			bundled.exitCode === 0 || evidenceLogLines.length > 0 || Boolean(activeText)
				? null
				: bundled.stderr.trim() ||
					(bundled.exitCode === 124 || /timed out|timeout/i.test(bundled.stderr)
						? "Listener status check timed out. Reverse tunnel or SSH path may be down."
						: bundled.stdout.trim() || "Listener status check failed");

		return {
			service: HIKVISION_HOT_RELOAD_LISTENER_SERVICE,
			vm: {
				host: resolvedTarget?.host || fallbackTarget?.host || "unknown",
				user: resolvedTarget?.user || fallbackTarget?.user || "infra",
				path: resolvedTarget?.label || fallbackTarget?.label || "unknown",
			},
			running,
			status: running ? "running" : activeState === "inactive" ? "stopped" : activeState,
			sdk,
			activeState,
			subState,
			mainPid: mainPid || null,
			restarts: Number(show.NRestarts || 0) || 0,
			execMainStatus: Number(show.ExecMainStatus || 0) || 0,
			result: show.Result || null,
			checkedAt: new Date().toISOString(),
			control: {
				available: controlAvailable,
				actions: ["start", "stop", "restart"],
			},
			logs: {
				available: evidenceLogLines.length > 0,
				recent: recentLogLines,
				error:
					evidenceLogLines.length > 0
						? null
						: statusError || "No listener log lines returned by the VM status check.",
			},
			error: statusError,
		};
	};

	const readHikvisionListenerStatus = async (options: { force?: boolean } = {}) => {
		const ttlMs = Math.max(
			1000,
			Math.min(Number(process.env.HIKVISION_LISTENER_STATUS_CACHE_MS || 5000), 15000),
		);
		const now = Date.now();
		const cached = hikvisionListenerStatusCache;
		if (!options.force && cached && cached.expiresAt > now) {
			return {
				...cached.value,
				cache: {
					hit: true,
					ttlMs,
					expiresAt: new Date(cached.expiresAt).toISOString(),
				},
				mode: "cached",
			};
		}
		const value = await readHikvisionListenerStatusUncached();
		hikvisionListenerStatusCache = {
			expiresAt: Date.now() + ttlMs,
			value,
		};
		return {
			...value,
			cache: {
				hit: false,
				ttlMs,
				expiresAt: new Date(hikvisionListenerStatusCache.expiresAt).toISOString(),
			},
		};
	};

	const getHikvisionListenerStatus = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;
			const status = await readHikvisionListenerStatus();
			res.status(200).json(
				buildSuccessResponse("Hikvision hot-reload listener status loaded", status, 200),
			);
		} catch (error: any) {
			deviceLogger.error(`Hikvision listener status failed: ${error?.message || error}`);
			res.status(500).json(
				buildErrorResponse("Failed to load Hikvision listener status", 500),
			);
		}
	};

	/**
	 * Truthful RYG readiness for tap + enroll.
	 * Combines: Postgres reachability (host tunnel), VM listener armed/receiving,
	 * and last SDK proof age. "Armed" alone is never green overall.
	 */
	const getDeviceLiveReadiness = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;

			const { buildDeviceLiveReadiness } =
				await import("../../helper/device-live-readiness.helper.js");

			let databaseOk = false;
			let databaseLatencyMs: number | null = null;
			let databaseError: string | null = null;
			const dbStarted = Date.now();
			try {
				await (prisma as any).$queryRaw`SELECT 1`;
				databaseOk = true;
				databaseLatencyMs = Date.now() - dbStarted;
			} catch (error: any) {
				databaseOk = false;
				databaseLatencyMs = Date.now() - dbStarted;
				databaseError = String(error?.message || error || "database_unreachable").slice(
					0,
					280,
				);
			}

			let listener: Awaited<ReturnType<typeof readHikvisionListenerStatus>> | null = null;
			try {
				listener = await readHikvisionListenerStatus();
			} catch (error: any) {
				deviceLogger.warn(
					`Live readiness listener status failed: ${error?.message || error}`,
				);
			}

			let lastSdkEventAt: string | null = null;
			if (databaseOk) {
				try {
					const latest = await (prisma as any).deviceEvent.findFirst({
						where: {
							organizationId: String(admin.organizationId),
							source: "EN_HCNETSDK_ALARM",
						},
						orderBy: { receivedAt: "desc" },
						select: { receivedAt: true, eventTime: true },
					});
					lastSdkEventAt =
						(latest?.receivedAt && new Date(latest.receivedAt).toISOString()) ||
						(latest?.eventTime && new Date(latest.eventTime).toISOString()) ||
						null;
				} catch {
					// keep null
				}
			}

			const readiness = buildDeviceLiveReadiness({
				databaseOk,
				databaseLatencyMs,
				databaseError,
				listenerRunning: Boolean(listener?.running),
				listenerArmed: Boolean(listener?.sdk?.armed),
				listenerReceiving: Boolean(listener?.sdk?.receivingCallbacks),
				listenerState: listener?.sdk?.state || listener?.status || null,
				lastAlarmAt: listener?.sdk?.lastAlarmAt || null,
				lastPostAt: listener?.sdk?.lastPostAt || null,
				lastSdkEventAt: lastSdkEventAt || listener?.sdk?.lastAlarmAt || null,
			});

			res.status(200).json(
				buildSuccessResponse(
					"Device live readiness loaded",
					{
						...readiness,
						listenerStatus: listener
							? {
									running: listener.running,
									status: listener.status,
									checkedAt: listener.checkedAt,
									error: listener.error,
									vm: listener.vm,
								}
							: null,
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Device live readiness failed: ${error?.message || error}`);
			res.status(500).json(buildErrorResponse("Failed to load device live readiness", 500));
		}
	};

	/**
	 * Host-side deps that browser Keep ready cannot do alone:
	 * DB tunnel (55435) + Hikvision reverse SSH bridge (TEST A 59000/59443).
	 * Mirrors predev ensure steps so toggle can go green without AI.
	 */
	const runEnsureHostLivePath = async (): Promise<{
		ok: boolean;
		steps: Array<{ step: string; ok: boolean; detail: string }>;
		raw?: string;
	}> => {
		const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
		if (process.platform !== "win32") {
			steps.push({
				step: "host_ensure",
				ok: false,
				detail: "Host ensure scripts only run on Windows host API",
			});
			return { ok: false, steps };
		}
		const pathMod = await import("path");
		const fsMod = await import("fs");
		const { spawn } = await import("child_process");
		const scriptPath = pathMod.resolve(process.cwd(), "../scripts/ensure-device-live-path.ps1");
		const altScript = pathMod.resolve(process.cwd(), "scripts/ensure-device-live-path.ps1");
		const resolved = fsMod.existsSync(scriptPath)
			? scriptPath
			: fsMod.existsSync(altScript)
				? altScript
				: null;
		if (!resolved) {
			steps.push({
				step: "host_ensure",
				ok: false,
				detail: "ensure-device-live-path.ps1 not found",
			});
			return { ok: false, steps };
		}
		const raw = await new Promise<string>((resolvePromise) => {
			const child = spawn(
				"powershell.exe",
				["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolved],
				{
					windowsHide: true,
					cwd: pathMod.dirname(pathMod.dirname(resolved)),
				},
			);
			let out = "";
			let err = "";
			const timer = setTimeout(() => {
				try {
					child.kill();
				} catch {
					// ignore
				}
				resolvePromise(out || err || "host ensure timed out");
			}, 120_000);
			child.stdout?.on("data", (chunk) => {
				out += String(chunk);
			});
			child.stderr?.on("data", (chunk) => {
				err += String(chunk);
			});
			child.on("close", () => {
				clearTimeout(timer);
				resolvePromise(out || err || "");
			});
			child.on("error", (error) => {
				clearTimeout(timer);
				resolvePromise(String(error?.message || error));
			});
		});
		try {
			// Script emits pretty multi-line JSON — parse the whole stdout, not last line.
			const jsonText = raw.trim();
			const firstBrace = jsonText.indexOf("{");
			const lastBrace = jsonText.lastIndexOf("}");
			const candidate =
				firstBrace >= 0 && lastBrace > firstBrace
					? jsonText.slice(firstBrace, lastBrace + 1)
					: jsonText;
			const parsed = JSON.parse(candidate);
			const scriptSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
			for (const s of scriptSteps) {
				steps.push({
					step: String(s.step || "host_step"),
					ok: Boolean(s.ok),
					detail: String(s.detail || ""),
				});
			}
			if (!scriptSteps.length) {
				steps.push({
					step: "host_ensure",
					ok: Boolean(parsed.ok),
					detail: String(parsed.message || raw).slice(0, 300),
				});
			}
			return { ok: Boolean(parsed.ok), steps, raw: raw.slice(0, 2000) };
		} catch {
			// Fallback: if SDK port is already open, treat host path as OK enough.
			const sdkOpen = await new Promise<boolean>((resolveCheck) => {
				try {
					const net = require("net") as typeof import("net");
					const socket = net.connect({ host: "127.0.0.1", port: 59000 }, () => {
						socket.end();
						resolveCheck(true);
					});
					socket.on("error", () => resolveCheck(false));
					socket.setTimeout(800, () => {
						socket.destroy();
						resolveCheck(false);
					});
				} catch {
					resolveCheck(false);
				}
			});
			steps.push({
				step: "host_ensure",
				ok: sdkOpen,
				detail: sdkOpen
					? "Ensure script output unparsed but 59000 is listening"
					: String(raw || "failed to parse ensure script output").slice(0, 400),
			});
			return { ok: sdkOpen, steps, raw: raw.slice(0, 2000) };
		}
	};

	/**
	 * Operator "Prove live path" / Keep ready: host ensure (like predev) + re-arm listener.
	 */
	const proveDeviceLivePath = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;

			// keepReady is a mode flag for operator intent — it must NOT force a
			// listener restart every Prove click (that was thrashing systemd mid-tap).
			const forceReArm =
				(req.body as any)?.forceReArm === true || (req.query as any)?.forceReArm === "true";

			const { buildDeviceLiveReadiness } =
				await import("../../helper/device-live-readiness.helper.js");
			const steps: Array<{
				step: string;
				ok: boolean;
				detail: string;
			}> = [];

			// 0) Host deps (DB tunnel + reverse bridge) — what Keep ready was missing vs predev
			try {
				const hostEnsure = await runEnsureHostLivePath();
				steps.push(...hostEnsure.steps);
			} catch (error: any) {
				steps.push({
					step: "host_ensure",
					ok: false,
					detail: String(error?.message || error).slice(0, 200),
				});
			}

			let databaseOk = false;
			let databaseLatencyMs: number | null = null;
			let databaseError: string | null = null;
			const dbStarted = Date.now();
			try {
				await (prisma as any).$queryRaw`SELECT 1`;
				databaseOk = true;
				databaseLatencyMs = Date.now() - dbStarted;
				steps.push({
					step: "database",
					ok: true,
					detail: `Postgres OK (${databaseLatencyMs}ms)`,
				});
			} catch (error: any) {
				databaseOk = false;
				databaseLatencyMs = Date.now() - dbStarted;
				databaseError = String(error?.message || error || "database_unreachable").slice(
					0,
					280,
				);
				steps.push({
					step: "database",
					ok: false,
					detail: databaseError,
				});
			}

			let listener = null as Awaited<ReturnType<typeof readHikvisionListenerStatus>> | null;
			let restartAttempted = false;
			try {
				listener = await readHikvisionListenerStatus();
				const sdkState = String(listener?.sdk?.state || "");
				const receiving = Boolean(listener?.sdk?.receivingCallbacks);
				const armed = Boolean(listener?.sdk?.armed);
				steps.push({
					step: "listener_status",
					ok: Boolean(listener?.running) && sdkState !== "login_failed",
					detail: listener?.running
						? `Listener ${listener.status} / sdk=${sdkState || "unknown"} receiving=${receiving}`
						: listener?.error || "Listener not running",
				});
			} catch (error: any) {
				steps.push({
					step: "listener_status",
					ok: false,
					detail: String(error?.message || error).slice(0, 200),
				});
			}

			const sdkState = String(listener?.sdk?.state || "");
			const receiving = Boolean(listener?.sdk?.receivingCallbacks);
			const armed = Boolean(listener?.sdk?.armed);
			const lastAlarmMs = listener?.sdk?.lastAlarmAt
				? Date.parse(String(listener.sdk.lastAlarmAt))
				: NaN;
			const proofStale =
				!Number.isFinite(lastAlarmMs) || Date.now() - lastAlarmMs > 15 * 60 * 1000;
			// Never thrash a healthy receiving stream. forceReArm only restarts when
			// the path is actually quiet / down / login_failed.
			const pathNeedsReArm =
				!listener?.running ||
				sdkState === "login_failed" ||
				(!receiving && (proofStale || !armed));
			const shouldRestartListener =
				Boolean(listener?.control?.available) &&
				pathNeedsReArm &&
				(forceReArm || !listener?.running || sdkState === "login_failed");

			// Restart when stopped, login_failed, or Keep ready needs a quiet re-arm.
			if (shouldRestartListener) {
				restartAttempted = true;
				try {
					const managedWrapper = await installManagedHikvisionListenerWrapperOnVm();
					if (!managedWrapper.ok) {
						steps.push({
							step: "listener_restart",
							ok: false,
							detail: managedWrapper.error || "Failed to prepare listener wrapper",
						});
					} else {
						const result = await runHikvisionListenerVmCommand(
							["sudo", "systemctl", "restart", HIKVISION_HOT_RELOAD_LISTENER_SERVICE],
							15000,
						);
						const ok = result.exitCode === 0;
						steps.push({
							step: "listener_restart",
							ok,
							detail: ok
								? forceReArm || proofStale
									? "Listener re-arm restart requested (host bridge ensured first)"
									: "Listener restart requested"
								: result.stderr.trim() || result.stdout.trim() || "Restart failed",
						});
						// Re-read after short settle
						await new Promise((r) => setTimeout(r, 3500));
						listener = await readHikvisionListenerStatus();
						const stateAfter = String(listener?.sdk?.state || "");
						steps.push({
							step: "listener_status_after_restart",
							ok: Boolean(listener?.running) && stateAfter !== "login_failed",
							detail: listener?.running
								? `Listener ${listener.status} / sdk=${stateAfter || "unknown"}`
								: listener?.error || "Still not running after restart",
						});
					}
				} catch (error: any) {
					steps.push({
						step: "listener_restart",
						ok: false,
						detail: String(error?.message || error).slice(0, 200),
					});
				}
			}

			let lastSdkEventAt: string | null = null;
			if (databaseOk) {
				try {
					const latest = await (prisma as any).deviceEvent.findFirst({
						where: {
							organizationId: String(admin.organizationId),
							source: "EN_HCNETSDK_ALARM",
						},
						orderBy: { receivedAt: "desc" },
						select: { receivedAt: true, eventTime: true },
					});
					lastSdkEventAt =
						(latest?.receivedAt && new Date(latest.receivedAt).toISOString()) ||
						(latest?.eventTime && new Date(latest.eventTime).toISOString()) ||
						null;
					steps.push({
						step: "event_proof",
						ok: Boolean(lastSdkEventAt),
						detail: lastSdkEventAt
							? `Latest SDK saved event at ${lastSdkEventAt}`
							: "No EN_HCNETSDK_ALARM rows found",
					});
				} catch (error: any) {
					steps.push({
						step: "event_proof",
						ok: false,
						detail: String(error?.message || error).slice(0, 160),
					});
				}
			}

			const readiness = buildDeviceLiveReadiness({
				databaseOk,
				databaseLatencyMs,
				databaseError,
				listenerRunning: Boolean(listener?.running),
				listenerArmed: Boolean(listener?.sdk?.armed),
				listenerReceiving: Boolean(listener?.sdk?.receivingCallbacks),
				listenerState: listener?.sdk?.state || listener?.status || null,
				lastAlarmAt: listener?.sdk?.lastAlarmAt || null,
				lastPostAt: listener?.sdk?.lastPostAt || null,
				lastSdkEventAt: lastSdkEventAt || listener?.sdk?.lastAlarmAt || null,
			});

			// Proven is final readiness truth only. Host ensure / restart step noise
			// (e.g. optional reverse API port 53001, brief systemd lag) must not flip
			// proven=false while DB + live path + proof are green for the operator.
			const proven =
				readiness.overall === "green" &&
				readiness.safeToTap === true &&
				readiness.safeToEnroll === true &&
				databaseOk === true;

			logActivity(req, {
				userId: String((req as any).userId || "unknown"),
				action: "DEVICE_LIVE_PATH_PROVE",
				description: proven
					? "Live path prove passed"
					: `Live path prove incomplete overall=${readiness.overall}`,
				page: {
					url: req.originalUrl,
					title: "Device Events",
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					proven
						? "Live path prove passed — safe to tap and enroll for realtime"
						: "Live path prove incomplete — fix red checks before relying on realtime",
					{
						proven,
						restartAttempted,
						steps,
						readiness: {
							...readiness,
							listenerStatus: listener
								? {
										running: listener.running,
										status: listener.status,
										checkedAt: listener.checkedAt,
										error: listener.error,
										vm: listener.vm,
									}
								: null,
						},
						operatorHint: proven
							? "Safe to tap/enroll. New SDK rows should appear within a few seconds of a TEST A tap."
							: !databaseOk
								? "Database tunnel still down after ensure — run predev or scripts/start-k8s-dev-db-access.ps1."
								: String(listener?.sdk?.state || "") === "login_failed" &&
									  !receiving
									? "Listener is up but SDK login failed — reverse tunnel to the device is missing or device unreachable."
									: !listener?.running && !receiving && !armed
										? "Listener failed to start on the VM — check systemd / reverse tunnel."
										: readiness.overall === "green"
											? readiness.headline
											: readiness.proof.stale
												? "Path re-armed if possible. Tap the device once so proof becomes fresh."
												: readiness.headline ||
													"Review red readiness checks above.",
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Device live path prove failed: ${error?.message || error}`);
			res.status(500).json(buildErrorResponse("Failed to prove device live path", 500));
		}
	};

	const controlHikvisionListener = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;
			const action = String(req.body?.action || "")
				.trim()
				.toLowerCase();
			if (!HIKVISION_LISTENER_CONTROL_ACTIONS.has(action)) {
				res.status(400).json(buildErrorResponse("Unsupported listener action", 400));
				return;
			}

			if (action !== "stop") {
				const runtimeProbe = await runHikvisionListenerVmCommand(
					[
						"test",
						"-x",
						HIKVISION_VM_WRAPPER_REMOTE_PATH,
						"-a",
						"-x",
						HIKVISION_VM_DAEMON_REMOTE_PATH,
						"-a",
						"-f",
						HIKVISION_VM_SERVICE_REMOTE_PATH,
					],
					12000,
				);
				if (runtimeProbe.exitCode !== 0) {
					const managedWrapper = await installManagedHikvisionListenerWrapperOnVm();
					if (!managedWrapper.ok) {
						res.status(502).json(
							buildErrorResponse(
								managedWrapper.error ||
									"Failed to prepare Hikvision listener runtime",
								502,
							),
						);
						return;
					}
				}
			}

			const result = await runHikvisionListenerVmCommand(
				["sudo", "systemctl", action, HIKVISION_HOT_RELOAD_LISTENER_SERVICE],
				12000,
			);

			if (result.exitCode !== 0) {
				res.status(502).json(
					buildErrorResponse(
						result.stderr.trim() || result.stdout.trim() || "Listener control failed",
						502,
					),
				);
				return;
			}

			hikvisionListenerStatusCache = null;
			const status = await readHikvisionListenerStatus({ force: true });
			logActivity(req, {
				userId: String((req as any).userId || "unknown"),
				action: "HIKVISION_LISTENER_CONTROL",
				description: `Hikvision hot-reload listener ${action}`,
				page: {
					url: req.originalUrl,
					title: "Device Attendance",
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					`Hikvision hot-reload listener ${action} requested`,
					{ action, status },
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Hikvision listener control failed: ${error?.message || error}`);
			res.status(500).json(buildErrorResponse("Failed to control Hikvision listener", 500));
		}
	};

	const reconcileHikvisionRuntimeAfterDeviceChange = async (
		device: { id?: string; name?: string | null; config?: Prisma.JsonValue | null },
		reason: string,
	) => {
		if (!isHikvisionDevice(device)) return;

		const managedWrapper = await installManagedHikvisionListenerWrapperOnVm();
		if (!managedWrapper.ok) {
			deviceLogger.warn(
				`Hikvision runtime wrapper sync skipped after ${reason} for ${device.id || device.name}: ${
					managedWrapper.error || "unknown_error"
				}`,
			);
			return;
		}

		const restartResult = await runHikvisionListenerVmCommand(
			["sudo", "systemctl", "restart", HIKVISION_HOT_RELOAD_LISTENER_SERVICE],
			15000,
		);

		if (restartResult.exitCode !== 0) {
			deviceLogger.warn(
				`Hikvision listener restart failed after ${reason} for ${device.id || device.name}: ${
					restartResult.stderr.trim() || restartResult.stdout.trim() || "unknown_error"
				}`,
			);
			return;
		}

		deviceLogger.info(
			`Hikvision listener runtime reconciled after ${reason} for ${device.id || device.name}`,
		);
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			deviceLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			deviceLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateDeviceSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			deviceLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const organizationId =
				validation.data.organizationId || String((req as any).organizationId || "");
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}

			const deviceData = {
				...validation.data,
				organizationId,
				access: validation.data.access || {},
				config: buildDeviceRuntimeConfig({
					config: validation.data.config,
					name: validation.data.name,
					address: validation.data.address,
					protocol: validation.data.protocol,
					port: validation.data.port,
				}),
			};

			const device = await prisma.device.create({ data: deviceData });
			deviceLogger.info(`Device created successfully: ${device.id}`);

			if (
				isHikvisionDevice(device) &&
				String((device as any)?.access?.password || "").trim()
			) {
				try {
					await syncHikvisionDeviceUsersFromSource({
						req,
						organizationId,
						device,
						startedByUserId: (req as any).userId || null,
					});
					await invalidateCache.byPattern("cache:device:*").catch(() => undefined);
					deviceLogger.info(`Post-create Hikvision device users synced for ${device.id}`);
				} catch (postCreateSyncError: any) {
					deviceLogger.warn(
						`Post-create Hikvision device user sync failed for ${device.id}: ${describePostCreateHikvisionSyncError(postCreateSyncError)}`,
					);
				}
			}
			await reconcileHikvisionRuntimeAfterDeviceChange(device, "device_create");

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DEVICE.ACTIONS.CREATE_DEVICE,
				description: `${config.ACTIVITY_LOG.DEVICE.DESCRIPTIONS.DEVICE_CREATED}: ${device.name || device.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DEVICE.PAGES.DEVICE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DEVICE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DEVICE,
				entityId: device.id,
				changesBefore: null,
				changesAfter: {
					id: device.id,
					name: device.name,
					createdAt: device.createdAt,
					updatedAt: device.updatedAt,
				},
				description: `${config.AUDIT_LOG.DEVICE.DESCRIPTIONS.DEVICE_CREATED}: ${device.name || device.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:device:list:*");
				deviceLogger.info("Device list cache invalidated after creation");
			} catch (cacheError) {
				deviceLogger.warn("Failed to invalidate cache after device creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DEVICE.CREATED,
				device,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			if (isDeviceAddressPortUniqueError(error)) {
				deviceLogger.warn(`Device endpoint conflict while creating device: ${error}`);
				res.status(409).json(buildDeviceAddressPortConflictResponse());
				return;
			}

			deviceLogger.error(`${config.ERROR.DEVICE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getEvents = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = (req as any).organizationId;
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}

			const page = Math.max(Number(req.query.page || 1), 1);
			const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100);
			const skip = (page - 1) * limit;
			const deviceId = String(req.query.deviceId || "").trim();
			const status = String(req.query.status || "").trim();
			const source = String(req.query.source || "").trim();
			const eventCategory = String(req.query.eventCategory || "")
				.trim()
				.toUpperCase();
			const eventAction = String(req.query.eventAction || "")
				.trim()
				.toUpperCase();
			const eventConfidence = String(req.query.eventConfidence || "")
				.trim()
				.toUpperCase();
			const evidenceSource = String(req.query.evidenceSource || "")
				.trim()
				.toUpperCase();
			const summaryScope = String(req.query.summaryScope || "")
				.trim()
				.toLowerCase();
			const useFacetSummaryScope = summaryScope === "facets";
			const query = String(req.query.query || req.query.search || "").trim();
			const searchTerms = buildDeviceEventSearchTerms(query);
			const from = String(req.query.from || "").trim();
			const to = String(req.query.to || "").trim();
			const dateField = String(req.query.dateField || "eventTime").trim();
			const sort = String(req.query.sort || "eventTime").trim();
			const order =
				String(req.query.order || "desc").toLowerCase() === "asc" ? "asc" : "desc";
			const dateColumnSql =
				dateField === "receivedAt"
					? Prisma.sql`de."receivedAt"`
					: Prisma.sql`de."eventTime"`;

			const whereConditions: Prisma.Sql[] = [
				Prisma.sql`de."organizationId" = ${String(organizationId)}`,
			];

			if (deviceId) whereConditions.push(Prisma.sql`de."deviceId" = ${deviceId}`);
			if (status && status !== "all" && DEVICE_EVENT_STATUSES.has(status)) {
				whereConditions.push(Prisma.sql`de."status" = ${status}::"DeviceEventStatus"`);
			}
			if (source && source !== "all" && DEVICE_EVENT_SOURCES.has(source)) {
				whereConditions.push(Prisma.sql`de."source" = ${source}::"DeviceEventSource"`);
			}
			const hasDeviceEventColumns = await getDeviceEventColumnPresence();
			const hasDeviceUsersTable = await hasDeviceUserTable();
			const eventCategorySql = hasDeviceEventColumns.eventCategory
				? Prisma.sql`de."eventCategory"::text`
				: Prisma.sql`'UNKNOWN_VENDOR'::text`;
			const eventActionSql = hasDeviceEventColumns.eventAction
				? Prisma.sql`de."eventAction"::text`
				: Prisma.sql`'UNKNOWN'::text`;
			const eventLabelSql = hasDeviceEventColumns.eventLabel
				? Prisma.sql`de."eventLabel"`
				: Prisma.sql`COALESCE(de."eventType", 'Device event')`;
			const eventConfidenceSql = hasDeviceEventColumns.eventConfidence
				? Prisma.sql`de."eventConfidence"::text`
				: Prisma.sql`'UNKNOWN'::text`;

			if (
				eventCategory &&
				eventCategory !== "ALL" &&
				DEVICE_EVENT_CATEGORIES.has(eventCategory) &&
				hasDeviceEventColumns.eventCategory
			) {
				whereConditions.push(
					Prisma.sql`de."eventCategory" = ${eventCategory}::"DeviceEventCategory"`,
				);
			}
			if (
				eventAction &&
				eventAction !== "ALL" &&
				DEVICE_EVENT_ACTIONS.has(eventAction) &&
				hasDeviceEventColumns.eventAction
			) {
				whereConditions.push(
					Prisma.sql`de."eventAction" = ${eventAction}::"DeviceEventAction"`,
				);
			}
			if (
				eventConfidence &&
				eventConfidence !== "ALL" &&
				DEVICE_EVENT_CONFIDENCES.has(eventConfidence) &&
				hasDeviceEventColumns.eventConfidence
			) {
				whereConditions.push(
					Prisma.sql`de."eventConfidence" = ${eventConfidence}::"DeviceEventConfidence"`,
				);
			}
			if (evidenceSource && evidenceSource !== "ALL") {
				whereConditions.push(
					Prisma.sql`UPPER(COALESCE(de.payload->>'evidenceSource', '')) = ${evidenceSource}`,
				);
			}

			if (from || to) {
				if (from) {
					const fromDate = parseHikvisionBusinessDateBound(from);
					if (fromDate) whereConditions.push(Prisma.sql`${dateColumnSql} >= ${fromDate}`);
				}
				if (to) {
					const toDate = parseHikvisionBusinessDateBound(to, true);
					if (toDate) whereConditions.push(Prisma.sql`${dateColumnSql} <= ${toDate}`);
				}
			}

			const hasQuery = Boolean(query);
			if (hasQuery) {
				whereConditions.push(Prisma.sql`
					CONCAT_WS(
						E'\n',
						de."employeeNo",
						du."vendorUserId",
						du."employeeNo",
						du."displayName",
						COALESCE(employee_by_id."employeeId", employee_by_device_user."employeeId", employee_by_device."employeeId", employee_by_code."employeeId"),
						COALESCE(employee_by_id."deviceEmpId", employee_by_device_user."deviceEmpId", employee_by_device."deviceEmpId", employee_by_code."deviceEmpId"),
						NULLIF(BTRIM(CONCAT_WS(' ', matched_person."personalInfo"->>'firstName', matched_person."personalInfo"->>'middleName', matched_person."personalInfo"->>'lastName')), ''),
						${eventActionSql},
						${eventCategorySql},
						${eventLabelSql},
						de."eventType",
						de.status::text,
						de.source::text,
						d.name,
						d.address,
						de."doorNo",
						de."verifyMode",
						de.major,
						de.minor,
						de.payload->>'evidenceSource',
						de.payload->>'resolvedEmployeeNo',
						de.payload->>'employeeNo',
						de.payload->>'employeeNoString',
						de.payload#>>'{event,employeeNo}',
						de.payload#>>'{attendance,employeeNo}',
						de.payload#>>'{EventNotificationAlert,AccessControllerEvent,employeeNoString}',
						de.payload->>'serialNo',
						de.payload->>'eventKind',
						de.payload->>'actionCode',
						de.payload->>'parameter',
						de.payload->>'information'
					) ILIKE ${searchTerms.literalContains} ESCAPE E'\\\\'
				`);
			}

			const whereSql = Prisma.sql`WHERE ${Prisma.join(whereConditions, " AND ")}`;
			const facetWhereConditions = useFacetSummaryScope
				? whereConditions.filter((condition) => {
						const text = String((condition as any)?.strings?.join(" ") || condition);
						return (
							!text.includes('de."eventCategory"') &&
							!text.includes('de."eventAction"')
						);
					})
				: whereConditions;
			const facetWhereSql = Prisma.sql`WHERE ${Prisma.join(facetWhereConditions, " AND ")}`;
			const deviceUserIdSql = hasDeviceEventColumns.deviceUserId
				? Prisma.sql`de."deviceUserId"`
				: Prisma.sql`NULL::text`;
			const deviceUserJoinSql = hasDeviceUsersTable
				? Prisma.sql`
					LEFT JOIN device_users du ON (
						${hasDeviceEventColumns.deviceUserId ? Prisma.sql`du.id = de."deviceUserId"` : Prisma.sql`false`}
						OR (
							${hasDeviceEventColumns.deviceUserId ? Prisma.sql`de."deviceUserId" IS NULL` : Prisma.sql`true`}
							AND du."organizationId" = de."organizationId"
							AND du."deviceId" = de."deviceId"
							AND de."employeeNo" IS NOT NULL
							AND BTRIM(de."employeeNo") <> ''
							AND du."vendorUserId" = BTRIM(de."employeeNo")
						)
					)`
				: Prisma.sql`
					LEFT JOIN LATERAL (
						SELECT
							NULL::text AS id,
							NULL::text AS "vendorUserId",
							NULL::text AS "employeeNo",
							NULL::text AS "displayName",
							NULL::text AS status,
							NULL::text AS "employeeId"
					) du ON true
				`;
			const baseFromSql = Prisma.sql`
				FROM device_events de
				LEFT JOIN "Device" d ON d.id = de."deviceId"
				${deviceUserJoinSql}
			`;
			const employeeJoinSql = Prisma.sql`
				LEFT JOIN LATERAL (
					SELECT emp.id, emp."employeeId", emp."deviceEmpId", emp."personId"
					FROM employees emp
					WHERE emp."organizationId" = de."organizationId"
						AND emp."isDeleted" = false
						AND de."employeeId" IS NOT NULL
						AND emp.id = de."employeeId"
					LIMIT 1
				) employee_by_id ON true
				LEFT JOIN LATERAL (
					SELECT emp.id, emp."employeeId", emp."deviceEmpId", emp."personId"
					FROM employees emp
					WHERE employee_by_id.id IS NULL
						AND du."employeeId" IS NOT NULL
						AND emp."organizationId" = de."organizationId"
						AND emp."isDeleted" = false
						AND emp.id = du."employeeId"
					LIMIT 1
				) employee_by_device_user ON true
				LEFT JOIN LATERAL (
					SELECT emp.id, emp."employeeId", emp."deviceEmpId", emp."personId"
					FROM employees emp
					WHERE employee_by_id.id IS NULL
						AND employee_by_device_user.id IS NULL
						AND emp."organizationId" = de."organizationId"
						AND emp."isDeleted" = false
						AND de."employeeNo" IS NOT NULL
						AND BTRIM(de."employeeNo") <> ''
						AND emp."deviceEmpId" = BTRIM(de."employeeNo")
					LIMIT 1
				) employee_by_device ON true
				LEFT JOIN LATERAL (
					SELECT emp.id, emp."employeeId", emp."deviceEmpId", emp."personId"
					FROM employees emp
					WHERE employee_by_id.id IS NULL
						AND employee_by_device_user.id IS NULL
						AND employee_by_device.id IS NULL
						AND emp."organizationId" = de."organizationId"
						AND emp."isDeleted" = false
						AND de."employeeNo" IS NOT NULL
						AND BTRIM(de."employeeNo") <> ''
						AND emp."employeeId" IN (
							BTRIM(de."employeeNo"),
							CASE
								WHEN BTRIM(de."employeeNo") ~ '^[0-9]+$'
								THEN COALESCE(NULLIF(REGEXP_REPLACE(BTRIM(de."employeeNo"), '^0+', ''), ''), '0')
								ELSE BTRIM(de."employeeNo")
							END,
							CASE
								WHEN BTRIM(de."employeeNo") ~ '^[0-9]+$'
								THEN LPAD(
									COALESCE(NULLIF(REGEXP_REPLACE(BTRIM(de."employeeNo"), '^0+', ''), ''), '0'),
									5,
									'0'
								)
								ELSE BTRIM(de."employeeNo")
							END
						)
					LIMIT 1
				) employee_by_code ON true
				LEFT JOIN "Person" matched_person ON matched_person.id = COALESCE(
					employee_by_id."personId",
					employee_by_device_user."personId",
					employee_by_device."personId",
					employee_by_code."personId"
				)
			`;
			const searchMatchJoinSql = hasQuery
				? Prisma.sql`
					LEFT JOIN LATERAL (
						SELECT
							candidate.field,
							candidate.label,
							candidate.value,
							CASE
								WHEN candidate.is_identifier
									AND LOWER(BTRIM(candidate.value)) IN (${Prisma.join(searchTerms.exactCandidates.map((candidate) => candidate.toLowerCase()))})
									THEN 0
								WHEN LOWER(BTRIM(candidate.value)) = LOWER(${searchTerms.raw}) THEN 1
								WHEN candidate.is_identifier
									AND candidate.value ILIKE ${searchTerms.literalPrefix} ESCAPE E'\\\\'
									THEN 2
								WHEN candidate.is_identifier THEN 3
								ELSE 4
							END AS rank,
							CASE
								WHEN LOWER(BTRIM(candidate.value)) IN (${Prisma.join(searchTerms.exactCandidates.map((candidate) => candidate.toLowerCase()))})
									THEN 'exact'
								WHEN candidate.value ILIKE ${searchTerms.literalPrefix} ESCAPE E'\\\\' THEN 'starts_with'
								ELSE 'contains'
							END AS "matchType"
						FROM (VALUES
							(0, 'event.employeeNo', 'Event person ID', de."employeeNo", true),
							(1, 'deviceUser.vendorUserId', 'Device user ID', du."vendorUserId", true),
							(2, 'deviceUser.employeeNo', 'Device employee number', du."employeeNo", true),
							(3, 'employee.employeeId', 'HRIS employee ID', COALESCE(employee_by_id."employeeId", employee_by_device_user."employeeId", employee_by_device."employeeId", employee_by_code."employeeId"), true),
							(4, 'employee.deviceEmpId', 'HRIS device ID', COALESCE(employee_by_id."deviceEmpId", employee_by_device_user."deviceEmpId", employee_by_device."deviceEmpId", employee_by_code."deviceEmpId"), true),
							(5, 'employee.fullName', 'Employee name', NULLIF(BTRIM(CONCAT_WS(' ', matched_person."personalInfo"->>'firstName', matched_person."personalInfo"->>'middleName', matched_person."personalInfo"->>'lastName')), ''), false),
							(6, 'deviceUser.displayName', 'Device-user name', du."displayName", false),
							(7, 'event.eventAction', 'Event action', ${eventActionSql}, false),
							(8, 'event.eventCategory', 'Event category', ${eventCategorySql}, false),
							(9, 'event.eventLabel', 'Event label', ${eventLabelSql}, false),
							(10, 'event.eventType', 'Vendor event type', de."eventType", false),
							(11, 'event.status', 'Processing status', de.status::text, false),
							(12, 'event.source', 'Evidence source', de.source::text, false),
							(13, 'device.name', 'Device name', d.name, false),
							(14, 'device.address', 'Device address', d.address, false),
							(15, 'event.doorNo', 'Door number', de."doorNo", false),
							(16, 'event.verifyMode', 'Verification mode', de."verifyMode", false),
							(17, 'event.major', 'Vendor major code', de.major, false),
							(18, 'event.minor', 'Vendor minor code', de.minor, false),
							(19, 'event.evidenceSource', 'Evidence classification', de.payload->>'evidenceSource', false),
							(20, 'event.payload.resolvedEmployeeNo', 'Resolved person ID', de.payload->>'resolvedEmployeeNo', true),
							(21, 'event.payload.employeeNo', 'Evidence person ID', de.payload->>'employeeNo', true),
							(22, 'event.payload.employeeNoString', 'Evidence person ID', de.payload->>'employeeNoString', true),
							(23, 'event.payload.event.employeeNo', 'Evidence person ID', de.payload#>>'{event,employeeNo}', true),
							(24, 'event.payload.attendance.employeeNo', 'Evidence person ID', de.payload#>>'{attendance,employeeNo}', true),
							(25, 'event.payload.access.employeeNoString', 'Evidence person ID', de.payload#>>'{EventNotificationAlert,AccessControllerEvent,employeeNoString}', true),
							(26, 'event.payload.serialNo', 'Event serial', de.payload->>'serialNo', true),
							(27, 'event.payload.eventKind', 'Vendor event kind', de.payload->>'eventKind', false),
							(28, 'event.payload.actionCode', 'Vendor action code', de.payload->>'actionCode', false),
							(29, 'event.payload.parameter', 'Vendor event parameter', de.payload->>'parameter', false),
							(30, 'event.payload.information', 'Vendor event information', de.payload->>'information', false)
						) AS candidate(priority, field, label, value, is_identifier)
						WHERE candidate.value IS NOT NULL
							AND candidate.value ILIKE ${searchTerms.literalContains} ESCAPE E'\\\\'
						ORDER BY rank, candidate.priority
						LIMIT 1
					) search_match ON true
				`
				: Prisma.sql``;
			const fromSql = Prisma.sql`
				${baseFromSql}
				${employeeJoinSql}
			`;
			const searchFromSql = Prisma.sql`${fromSql} ${searchMatchJoinSql}`;
			const pageFromSql = hasQuery ? searchFromSql : baseFromSql;
			const aggregateFromSql = hasQuery ? fromSql : baseFromSql;
			const orderColumnSqlBySort: Record<string, Prisma.Sql> = {
				deviceName: Prisma.sql`d."name"`,
				eventTime: Prisma.sql`de."eventTime"`,
				updatedAt: Prisma.sql`de."updatedAt"`,
				status: Prisma.sql`de."status"`,
				source: Prisma.sql`de."source"`,
				eventCategory: hasDeviceEventColumns.eventCategory
					? Prisma.sql`de."eventCategory"`
					: Prisma.sql`de."receivedAt"`,
				eventAction: hasDeviceEventColumns.eventAction
					? Prisma.sql`de."eventAction"`
					: Prisma.sql`de."receivedAt"`,
				employeeNo: Prisma.sql`de."employeeNo"`,
				doorNo: Prisma.sql`de."doorNo"`,
			};
			const orderColumnSql = orderColumnSqlBySort[sort] || Prisma.sql`de."receivedAt"`;
			const orderDirectionSql = Prisma.raw(order === "asc" ? "ASC" : "DESC");
			const eventsSql = Prisma.sql`
				WITH page_events AS (
					SELECT de.id${hasQuery ? Prisma.sql`, search_match.rank AS search_rank` : Prisma.sql``}
					${pageFromSql}
					${whereSql}
					ORDER BY ${hasQuery ? Prisma.sql`search_match.rank ASC,` : Prisma.sql``} ${orderColumnSql} ${orderDirectionSql}, de."receivedAt" DESC, de."createdAt" DESC
					OFFSET ${skip}
					LIMIT ${limit}
				)
				SELECT
					de.id,
					de."organizationId",
					de."deviceId",
					${deviceUserIdSql} AS "deviceUserId",
					de."employeeId",
					de."attendanceId",
					de."eventTime",
					de."receivedAt",
					de."employeeNo",
					de.source::text AS source,
					de.status::text AS status,
					${eventCategorySql} AS "eventCategory",
					${eventActionSql} AS "eventAction",
					${eventLabelSql} AS "eventLabel",
					${eventConfidenceSql} AS "eventConfidence",
					de."eventType",
					de.major,
					de.minor,
					de."doorNo",
					de."verifyMode",
					de."dedupeKey",
					de.payload,
					de."errorMessage",
					de."createdAt",
					de."updatedAt",
					${
						hasQuery
							? Prisma.sql`JSON_BUILD_OBJECT('field', search_match.field, 'label', search_match.label, 'value', search_match.value, 'matchType', search_match."matchType", 'rank', search_match.rank)`
							: Prisma.sql`NULL::json`
					} AS "searchMatch",
					CASE
						WHEN d.id IS NULL THEN NULL
						ELSE JSON_BUILD_OBJECT(
							'id', d.id,
							'name', d.name,
							'address', d.address,
							'port', d.port,
							'protocol', d.protocol::text,
							'config', d.config
						)
					END AS device,
					CASE
						WHEN du.id IS NULL THEN NULL
						ELSE JSON_BUILD_OBJECT(
							'id', du.id,
							'vendorUserId', du."vendorUserId",
							'employeeNo', du."employeeNo",
							'displayName', du."displayName",
							'status', du.status::text,
							'employeeId', du."employeeId"
						)
					END AS "deviceUser",
					CASE
						WHEN COALESCE(employee_by_id.id, employee_by_device_user.id, employee_by_device.id, employee_by_code.id) IS NULL THEN NULL
						ELSE JSON_BUILD_OBJECT(
							'id', COALESCE(employee_by_id.id, employee_by_device_user.id, employee_by_device.id, employee_by_code.id),
							'employeeId', COALESCE(employee_by_id."employeeId", employee_by_device_user."employeeId", employee_by_device."employeeId", employee_by_code."employeeId"),
							'deviceEmpId', COALESCE(employee_by_id."deviceEmpId", employee_by_device_user."deviceEmpId", employee_by_device."deviceEmpId", employee_by_code."deviceEmpId"),
							'fullName', COALESCE(
								NULLIF(
									BTRIM(
										CONCAT_WS(
											' ',
											matched_person."personalInfo"->>'firstName',
											matched_person."personalInfo"->>'middleName',
											matched_person."personalInfo"->>'lastName'
										)
									),
									''
								),
								COALESCE(employee_by_id."employeeId", employee_by_device_user."employeeId", employee_by_device."employeeId", employee_by_code."employeeId")
							)
						)
					END AS employee
				${hasQuery ? searchFromSql : fromSql}
				INNER JOIN page_events page_event ON page_event.id = de.id
				ORDER BY ${hasQuery ? Prisma.sql`page_event.search_rank ASC,` : Prisma.sql``} ${orderColumnSql} ${orderDirectionSql}, de."receivedAt" DESC, de."createdAt" DESC
			`;
			const countSql = Prisma.sql`
				SELECT COUNT(*)::bigint AS total
				${aggregateFromSql}
				${whereSql}
			`;
			const statusGroupsSql = Prisma.sql`
				SELECT de.status::text AS status, COUNT(*)::bigint AS count
				${aggregateFromSql}
				${whereSql}
				GROUP BY de.status
			`;
			const sourceGroupsSql = Prisma.sql`
				SELECT de.source::text AS source, COUNT(*)::bigint AS count
				${aggregateFromSql}
				${whereSql}
				GROUP BY de.source
			`;
			const categoryGroupsSql = Prisma.sql`
				SELECT ${eventCategorySql} AS "eventCategory", COUNT(*)::bigint AS count
				${aggregateFromSql}
				${facetWhereSql}
				GROUP BY 1
			`;
			const actionGroupsSql = Prisma.sql`
				SELECT ${eventActionSql} AS "eventAction", COUNT(*)::bigint AS count
				${aggregateFromSql}
				${facetWhereSql}
				GROUP BY 1
			`;
			const actionCategoryGroupsSql = Prisma.sql`
				SELECT
					${eventActionSql} AS "eventAction",
					${eventCategorySql} AS "eventCategory",
					COUNT(*)::bigint AS count
				${aggregateFromSql}
				${facetWhereSql}
				GROUP BY 1, 2
			`;
			const confidenceGroupsSql = Prisma.sql`
				SELECT ${eventConfidenceSql} AS "eventConfidence", COUNT(*)::bigint AS count
				${aggregateFromSql}
				${whereSql}
				GROUP BY 1
			`;
			const evidenceGroupsSql = Prisma.sql`
				SELECT COALESCE(NULLIF(UPPER(de.payload->>'evidenceSource'), ''), 'UNKNOWN') AS "evidenceSource",
					COUNT(*)::bigint AS count
				${aggregateFromSql}
				${whereSql}
				GROUP BY 1
			`;
			const evidenceTotalsSql = Prisma.sql`
				SELECT
					COUNT(*) FILTER (WHERE LOWER(COALESCE(de.payload->>'directDeviceEvidence', 'false')) = 'true')::bigint AS direct,
					COUNT(*) FILTER (WHERE ${eventConfidenceSql} = 'INFERRED')::bigint AS inferred,
					COUNT(*) FILTER (WHERE ${eventConfidenceSql} = 'UNKNOWN')::bigint AS unknown
				${aggregateFromSql}
				${whereSql}
			`;

			const [
				events,
				totalRows,
				statusGroups,
				sourceGroups,
				categoryGroups,
				actionGroups,
				actionCategoryGroups,
				confidenceGroups,
				evidenceGroups,
				evidenceTotals,
			] = await Promise.all([
				prisma.$queryRaw<any[]>(eventsSql),
				prisma.$queryRaw<Array<{ total: bigint | number }>>(countSql),
				prisma.$queryRaw<Array<{ status: string; count: bigint | number }>>(
					statusGroupsSql,
				),
				prisma.$queryRaw<Array<{ source: string; count: bigint | number }>>(
					sourceGroupsSql,
				),
				prisma.$queryRaw<Array<{ eventCategory: string; count: bigint | number }>>(
					categoryGroupsSql,
				),
				prisma.$queryRaw<Array<{ eventAction: string; count: bigint | number }>>(
					actionGroupsSql,
				),
				prisma.$queryRaw<
					Array<{
						eventAction: string;
						eventCategory: string;
						count: bigint | number;
					}>
				>(actionCategoryGroupsSql),
				prisma.$queryRaw<Array<{ eventConfidence: string; count: bigint | number }>>(
					confidenceGroupsSql,
				),
				prisma.$queryRaw<Array<{ evidenceSource: string; count: bigint | number }>>(
					evidenceGroupsSql,
				),
				prisma.$queryRaw<
					Array<{
						direct: bigint | number;
						inferred: bigint | number;
						unknown: bigint | number;
					}>
				>(evidenceTotalsSql),
			]);
			const total = Number(totalRows[0]?.total || 0);
			// Resolve opaque person tokens for display + heal saved rows when map exists.
			const { isOpaqueHikvisionPersonToken } =
				await import("../../helper/hikvision-event-contract.helper.js");
			const { resolveDevicePersonToken } =
				await import("../../helper/device-person-token.helper.js");
			const enrichedEvents = await Promise.all(
				events.map(async (event) => {
					const runtimeLabels = classifyDeviceEvent(event);
					let employeeNo = String(event.employeeNo || "").trim() || null;
					let payload =
						event.payload && typeof event.payload === "object"
							? { ...event.payload }
							: {};
					const opaqueCandidate =
						(employeeNo && isOpaqueHikvisionPersonToken(employeeNo) && employeeNo) ||
						(payload?.opaquePersonToken &&
						isOpaqueHikvisionPersonToken(String(payload.opaquePersonToken))
							? String(payload.opaquePersonToken)
							: null);
					if (
						opaqueCandidate &&
						event.deviceId &&
						(!employeeNo || isOpaqueHikvisionPersonToken(employeeNo))
					) {
						try {
							const resolved = await resolveDevicePersonToken(prisma as any, {
								organizationId: String(organizationId),
								deviceId: String(event.deviceId),
								opaqueToken: opaqueCandidate,
							});
							if (resolved?.employeeNo) {
								employeeNo = resolved.employeeNo;
								payload = {
									...payload,
									personTokenResolved: true,
									opaquePersonToken: opaqueCandidate,
									resolvedEmployeeNo: resolved.employeeNo,
									resolvedDisplayName: resolved.displayName,
								};
								// Heal row in background so next load is already plain.
								void (prisma as any).deviceEvent
									.update({
										where: { id: event.id },
										data: {
											employeeNo: resolved.employeeNo,
											payload,
											status:
												event.status === "RECEIVED" ||
												event.status === "UNMATCHED"
													? "UNMATCHED"
													: event.status,
										},
									})
									.catch(() => undefined);
							}
						} catch {
							// ignore resolve failures on list
						}
					} else if (
						payload?.personTokenResolved &&
						payload?.resolvedEmployeeNo &&
						(!employeeNo || isOpaqueHikvisionPersonToken(employeeNo))
					) {
						employeeNo = String(payload.resolvedEmployeeNo);
					}
					return {
						...event,
						employeeNo,
						payload,
						taxonomy: {
							eventCategory: event.eventCategory,
							eventAction: event.eventAction,
							eventLabel: event.eventLabel,
							eventConfidence: event.eventConfidence,
							processingLabel: runtimeLabels.processingLabel,
							transportLabel: runtimeLabels.transportLabel,
							capabilityConfidence: String(
								event.eventConfidence || "UNKNOWN",
							).toLowerCase(),
						},
					};
				}),
			);
			const byProcessingResult = Object.fromEntries(
				statusGroups.map((item: any) => [item.status, Number(item.count || 0)]),
			);
			const byRuntimePath = Object.fromEntries(
				sourceGroups.map((item: any) => [item.source, Number(item.count || 0)]),
			);
			const byCategory = Object.fromEntries(
				categoryGroups.map((item: any) => [item.eventCategory, Number(item.count || 0)]),
			);
			const byAction = Object.fromEntries(
				actionGroups.map((item: any) => [item.eventAction, Number(item.count || 0)]),
			);
			const byActionCategory = actionCategoryGroups.reduce(
				(acc: Record<string, Record<string, number>>, item: any) => {
					const action = String(item.eventAction || "UNKNOWN").trim() || "UNKNOWN";
					const category =
						String(item.eventCategory || "UNKNOWN_VENDOR").trim() || "UNKNOWN_VENDOR";
					if (!acc[action]) acc[action] = {};
					acc[action][category] = Number(item.count || 0);
					return acc;
				},
				{},
			);
			const byConfidence = Object.fromEntries(
				confidenceGroups.map((item: any) => [
					item.eventConfidence,
					Number(item.count || 0),
				]),
			);
			const byEvidenceSource = Object.fromEntries(
				evidenceGroups.map((item: any) => [item.evidenceSource, Number(item.count || 0)]),
			);
			const evidenceTotalsRow = evidenceTotals[0] || { direct: 0, inferred: 0, unknown: 0 };

			const summary = {
				total,
				byCategory,
				byAction,
				byActionCategory,
				byProcessingResult,
				byRuntimePath,
				byConfidence,
				byEvidenceSource,
				directEvidence: Number(evidenceTotalsRow.direct || 0),
				inferredEvidence: Number(evidenceTotalsRow.inferred || 0),
				unknownEvidence: Number(evidenceTotalsRow.unknown || 0),
				matched: ["MATCHED", "ATTENDANCE_CREATED", "ATTENDANCE_UPDATED"].reduce(
					(sum, key) => sum + Number(byProcessingResult[key] || 0),
					0,
				),
				needsEmployeeMatch: Number(byProcessingResult.UNMATCHED || 0),
				ignored: Number(byProcessingResult.IGNORED || 0),
				failed: Number(byProcessingResult.FAILED || 0),
				byStatus: byProcessingResult,
				bySource: byRuntimePath,
			};

			res.status(200).json(
				buildSuccessResponse(
					"Device events retrieved successfully",
					{
						events: enrichedEvents,
						summary,
						pagination: buildPagination(total, page, limit),
					},
					200,
				),
			);
		} catch (error) {
			deviceLogger.error(`Failed to get device events: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, deviceLogger);

		if (!validationResult.isValid) {
			res.status(400).json(validationResult.errorResponse);
			return;
		}

		const {
			page,
			limit,
			order,
			fields,
			sort,
			skip,
			query,
			document,
			pagination,
			count,
			filter,
			groupBy,
		} = validationResult.validatedParams!;

		deviceLogger.info(
			`Getting devices, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.DeviceWhereInput = {
				isDeleted: false,
				...((req as any).organizationId
					? { organizationId: String((req as any).organizationId) }
					: {}),
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Device", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Device", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [devices, total] = await Promise.all([
				document ? prisma.device.findMany(findManyQuery) : [],
				count ? prisma.device.count({ where: whereClause }) : 0,
			]);

			deviceLogger.info(`Retrieved ${devices.length} devices`);
			const processedData =
				groupBy && document ? groupDataByField(devices, groupBy as string) : devices;

			const responseData: Record<string, any> = {
				...(document && { devices: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.DEVICE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			deviceLogger.error(`${config.ERROR.DEVICE.GET_ALL_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				deviceLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				deviceLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			deviceLogger.info(`${config.SUCCESS.DEVICE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:device:byId:${id}:${fields || "full"}`;
			let device = null;

			try {
				if (redisClient.isClientConnected()) {
					device = await redisClient.getJSON(cacheKey);
					if (device) {
						deviceLogger.info(`Device ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				deviceLogger.warn(`Redis cache retrieval failed for device ${id}:`, cacheError);
			}

			if (!device) {
				const query: Prisma.DeviceFindFirstArgs = {
					where: {
						id,
						...((req as any).organizationId
							? { organizationId: String((req as any).organizationId) }
							: {}),
					},
				};

				query.select = getNestedFields(fields);

				device = await prisma.device.findFirst(query);

				if (device && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, device, 3600);
						deviceLogger.info(`Device ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						deviceLogger.warn(
							`Failed to store device ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!device) {
				deviceLogger.error(`${config.ERROR.DEVICE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DEVICE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			deviceLogger.info(`${config.SUCCESS.DEVICE.RETRIEVED}: ${(device as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DEVICE.RETRIEVED,
				device,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deviceLogger.error(`${config.ERROR.DEVICE.ERROR_GETTING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				deviceLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateDeviceSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				deviceLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				deviceLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			deviceLogger.info(`Updating device: ${id}`);

			const existingDevice = await prisma.device.findFirst({
				where: {
					id,
					...((req as any).organizationId
						? { organizationId: String((req as any).organizationId) }
						: {}),
				},
			});

			if (!existingDevice) {
				deviceLogger.error(`${config.ERROR.DEVICE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DEVICE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const nextOrganizationId = String(
				validatedData.organizationId || (existingDevice as any).organizationId || "",
			);
			const nextAddress = String(
				validatedData.address || (existingDevice as any).address || "",
			);
			const nextPort =
				typeof validatedData.port === "number"
					? validatedData.port
					: Number((existingDevice as any).port);

			if (nextOrganizationId && nextAddress && Number.isFinite(nextPort)) {
				const conflictingDevice = await prisma.device.findFirst({
					where: {
						organizationId: nextOrganizationId,
						address: nextAddress,
						port: nextPort,
						NOT: { id },
					},
					select: {
						id: true,
						name: true,
						address: true,
						port: true,
						isDeleted: true,
					},
				});

				if (conflictingDevice && !conflictingDevice.isDeleted) {
					res.status(409).json(buildDeviceAddressPortConflictResponse());
					return;
				}

				if (conflictingDevice?.isDeleted) {
					await prisma.device.update({
						where: { id: conflictingDevice.id },
						data: { address: buildReleasedDeviceAddress(conflictingDevice) },
					});
					deviceLogger.info(
						`Released soft-deleted device endpoint before device ${id} update: ${conflictingDevice.id}`,
					);
				}
			}

			const prismaData = {
				...validatedData,
				...(validatedData.config !== undefined ||
				validatedData.name !== undefined ||
				validatedData.protocol !== undefined ||
				validatedData.port !== undefined
					? {
							config: buildDeviceRuntimeConfig({
								config: validatedData.config,
								existingConfig: existingDevice.config,
								name: validatedData.name || existingDevice.name,
								address: validatedData.address || existingDevice.address,
								protocol: validatedData.protocol || existingDevice.protocol,
								port:
									typeof validatedData.port === "number"
										? validatedData.port
										: existingDevice.port,
							}),
						}
					: {}),
				...(validatedData.access !== undefined
					? { access: validatedData.access || {} }
					: {}),
			};

			const updatedDevice = await prisma.device.update({
				where: { id },
				data: prismaData,
			});
			await reconcileHikvisionRuntimeAfterDeviceChange(updatedDevice, "device_update");

			try {
				await invalidateCache.byPattern(`cache:device:byId:${id}:*`);
				await invalidateCache.byPattern("cache:device:list:*");
				deviceLogger.info(`Cache invalidated after device ${id} update`);
			} catch (cacheError) {
				deviceLogger.warn("Failed to invalidate cache after device update:", cacheError);
			}

			deviceLogger.info(`${config.SUCCESS.DEVICE.UPDATED}: ${updatedDevice.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DEVICE.UPDATED,
				{ device: updatedDevice },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			if (isDeviceAddressPortUniqueError(error)) {
				deviceLogger.warn(`Device endpoint conflict while updating ${id}: ${error}`);
				res.status(409).json(buildDeviceAddressPortConflictResponse());
				return;
			}

			deviceLogger.error(`${config.ERROR.DEVICE.ERROR_UPDATING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				deviceLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			deviceLogger.info(`${config.SUCCESS.DEVICE.DELETED}: ${id}`);

			const existingDevice = await prisma.device.findFirst({
				where: {
					id,
					...((req as any).organizationId
						? { organizationId: String((req as any).organizationId) }
						: {}),
				},
			});

			if (!existingDevice) {
				deviceLogger.error(`${config.ERROR.DEVICE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DEVICE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.device.update({
				where: { id },
				data: {
					isDeleted: true,
					address: buildReleasedDeviceAddress(existingDevice),
				},
			});
			await reconcileHikvisionRuntimeAfterDeviceChange(existingDevice, "device_delete");

			try {
				await invalidateCache.byPattern(`cache:device:byId:${id}:*`);
				await invalidateCache.byPattern("cache:device:list:*");
				deviceLogger.info(`Cache invalidated after device ${id} deletion`);
			} catch (cacheError) {
				deviceLogger.warn("Failed to invalidate cache after device deletion:", cacheError);
			}

			deviceLogger.info(`${config.SUCCESS.DEVICE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.DEVICE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			deviceLogger.error(`${config.ERROR.DEVICE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const enrollDeviceUser = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = (req as any).organizationId;
			const actorUserId = (req as any).userId;
			const { userId, deviceId, deviceUserId } = req.body || {};

			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}

			if (!userId || !deviceId || !deviceUserId) {
				res.status(400).json(
					buildErrorResponse("userId, deviceId, and deviceUserId are required", 400),
				);
				return;
			}

			const device = await prisma.device.findFirst({
				where: {
					id: String(deviceId),
					organizationId: String(organizationId),
					isDeleted: false,
				},
				select: { id: true, name: true, config: true, access: true },
			});
			if (!device) {
				res.status(404).json(buildErrorResponse(`Device not found: ${deviceId}`, 404));
				return;
			}

			const headers = helpers.prepareAuthHeaders(req);
			let targetUser: any = null;
			if (appConfig.idpEnabled) {
				const getUserUrl = helpers.buildAuthServiceUrl(`/api/user/${String(userId)}`);
				const getUserResponse = await fetch(getUserUrl, {
					method: "GET",
					headers,
				});
				if (!getUserResponse.ok) {
					const errorText = await getUserResponse.text();
					res.status(404).json(
						buildErrorResponse(`User not found or inaccessible: ${errorText}`, 404),
					);
					return;
				}

				const getUserData = await getUserResponse.json();
				targetUser = getUserData?.data || getUserData?.user || getUserData;
			} else {
				targetUser = await prisma.user.findFirst({
					where: {
						id: String(userId),
						organizationId: String(organizationId),
						isDeleted: false,
					},
					select: {
						id: true,
						organizationId: true,
						metadata: true,
					},
				});
			}
			if (!targetUser?.id) {
				res.status(404).json(buildErrorResponse("User not found", 404));
				return;
			}
			if (
				targetUser.organizationId &&
				String(targetUser.organizationId) !== String(organizationId)
			) {
				res.status(404).json(buildErrorResponse("User not found", 404));
				return;
			}

			const currentMetadata = (targetUser.metadata as any) || {};
			const currentDevice = currentMetadata.device || {};
			const normalizedDeviceEmpId = String(deviceUserId).trim();
			let enrolledDeviceUser: any = null;

			if (isHikvisionDevice(device)) {
				let existingTargetDeviceUser = await (prisma as any).deviceUser.findUnique({
					where: {
						organizationId_deviceId_vendorUserId: {
							organizationId: String(organizationId),
							deviceId: String(device.id),
							vendorUserId: normalizedDeviceEmpId,
						},
					},
					select: { id: true, employeeId: true },
				});
				if (!existingTargetDeviceUser?.id) {
					await syncSingleHikvisionDeviceUserFromSource({
						req,
						organizationId: String(organizationId),
						device,
						employeeNo: normalizedDeviceEmpId,
					}).catch((error: any) => {
						deviceLogger.warn(
							`Target single-user sync before enroll did not complete for ${device.id}/${normalizedDeviceEmpId}: ${error?.message || error}`,
						);
					});
					existingTargetDeviceUser = await (prisma as any).deviceUser.findUnique({
						where: {
							organizationId_deviceId_vendorUserId: {
								organizationId: String(organizationId),
								deviceId: String(device.id),
								vendorUserId: normalizedDeviceEmpId,
							},
						},
						select: { id: true, employeeId: true },
					});
				}
				if (!existingTargetDeviceUser?.id) {
					const sourceDeviceCandidates = await (prisma as any).deviceUser.findMany({
						where: {
							organizationId: String(organizationId),
							vendorUserId: normalizedDeviceEmpId,
							deviceId: { not: String(device.id) },
							device: {
								isDeleted: false,
							},
						},
						select: {
							deviceId: true,
							device: {
								select: {
									id: true,
									organizationId: true,
									name: true,
									address: true,
									port: true,
									protocol: true,
									config: true,
									access: true,
									isDeleted: true,
								},
							},
						},
					});
					const sourceDeviceUser = sourceDeviceCandidates.find(
						(candidate: any) =>
							candidate?.device && isHikvisionDevice(candidate.device),
					);
					if (!sourceDeviceUser?.deviceId) {
						res.status(409).json(
							buildErrorResponse(
								`Target device does not currently have Hikvision user ${normalizedDeviceEmpId}, and no other saved Hikvision source row was found to copy from`,
								409,
							),
						);
						return;
					}

					await runHikvisionManualCopyOnVm({
						sourceDevice: sourceDeviceUser.device,
						targetDevice: device,
						sourceDeviceId: String(sourceDeviceUser.deviceId),
						targetDeviceId: String(device.id),
						employeeNo: normalizedDeviceEmpId,
						includeFingerprints: true,
						includeFaceRecognition: true,
					});
					await syncSingleHikvisionDeviceUserFromSource({
						req,
						organizationId: String(organizationId),
						device,
						employeeNo: normalizedDeviceEmpId,
					});
					await mirrorDeviceUserLinkToPeer({
						organizationId: String(organizationId),
						sourceDeviceId: String(sourceDeviceUser.deviceId),
						targetDeviceId: String(device.id),
						vendorUserId: normalizedDeviceEmpId,
					});
				}
			}

			const employeeIdFromMetadata = currentMetadata?.employee?.id;
			const employee = await resolveEmployeeForUser(
				String(organizationId),
				String(targetUser.id),
				employeeIdFromMetadata ? String(employeeIdFromMetadata) : undefined,
			);
			if (!employee?.id) {
				res.status(404).json(
					buildErrorResponse(
						`Employee link not found for user ${targetUser.id}; enrollment aborted to keep metadata and employee in sync`,
						404,
					),
				);
				return;
			}

			const updatedMetadata = {
				...currentMetadata,
				device: {
					...currentDevice,
					access: {
						empId: normalizedDeviceEmpId,
						status: "enrolled",
						deviceId: String(deviceId),
					},
				},
			};

			if (appConfig.idpEnabled) {
				const updateUserUrl = helpers.buildAuthServiceUrl(`/api/user/${targetUser.id}`);
				const updateUserResponse = await fetch(updateUserUrl, {
					method: "PATCH",
					headers,
					body: JSON.stringify({ metadata: updatedMetadata }),
				});

				if (!updateUserResponse.ok) {
					const errorText = await updateUserResponse.text();
					res.status(500).json(
						buildErrorResponse(`Failed to update user metadata: ${errorText}`, 500),
					);
					return;
				}
			} else {
				await prisma.user.update({
					where: { id: String(targetUser.id) },
					data: { metadata: updatedMetadata },
				});
			}

			await prisma.employee.update({
				where: { id: employee.id },
				data: {
					deviceEmpId: normalizedDeviceEmpId,
					deviceId: String(deviceId),
				},
			});
			if (await hasDeviceUserTable()) {
				enrolledDeviceUser = await (prisma as any).deviceUser.upsert({
					where: {
						organizationId_deviceId_vendorUserId: {
							organizationId: String(organizationId),
							deviceId: String(device.id),
							vendorUserId: normalizedDeviceEmpId,
						},
					},
					create: {
						organizationId: String(organizationId),
						deviceId: String(device.id),
						vendorUserId: normalizedDeviceEmpId,
						employeeNo: normalizedDeviceEmpId,
						displayName:
							(employee as any)?.person?.personalInfo?.fullName ||
							(employee as any)?.employeeId ||
							normalizedDeviceEmpId,
						status: "ACTIVE",
						employeeId: employee.id,
						rawPayload: {
							hrisEnrollment: {
								source: "enroll_endpoint",
								enrolledAt: new Date().toISOString(),
								userId: String(targetUser.id),
							},
						},
						lastSyncedAt: new Date(),
					},
					update: {
						employeeId: employee.id,
						employeeNo: normalizedDeviceEmpId,
						status: "ACTIVE",
						rawPayload: {
							hrisEnrollment: {
								source: "enroll_endpoint",
								enrolledAt: new Date().toISOString(),
								userId: String(targetUser.id),
							},
						},
						lastSyncedAt: new Date(),
					},
					select: buildDeviceUserSelect({
						includeVendorMetadata: await hasDeviceUserVendorMetadataColumn(),
					}),
				});
			}

			logActivity(req, {
				userId: actorUserId || "unknown",
				action: "DEVICE_ENROLL_USER",
				description: `Enrolled user ${targetUser.id} to device ${device.id} with empId ${normalizedDeviceEmpId}`,
				page: {
					url: req.originalUrl,
					title: "Device Enrollment",
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"User enrolled and employee deviceEmpId synced successfully",
					{
						userId: targetUser.id,
						employeeId: employee.id,
						deviceId: device.id,
						deviceUserId: normalizedDeviceEmpId,
						deviceUser: enrolledDeviceUser
							? decorateDeviceUser(enrolledDeviceUser)
							: null,
						deviceUserLinked: Boolean(enrolledDeviceUser?.employeeId),
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Enroll device user failed: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to enroll user to device", 500));
		}
	};

	const importDeviceEnrollment = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			if (!req.file) {
				const errorResponse = buildErrorResponse("No file uploaded", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const buffer = req.file.buffer;
			const workbook = XLSX.read(buffer, { type: "buffer" });
			const sheetName = workbook.SheetNames[0];
			const sheet = workbook.Sheets[sheetName];
			const rows = XLSX.utils.sheet_to_json(sheet) as any[];

			// Validate that file has data
			if (!rows || rows.length === 0) {
				deviceLogger.warn("Empty CSV file uploaded");
				const errorResponse = buildErrorResponse(
					"CSV file is empty or has no data rows",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			deviceLogger.info(`Processing ${rows.length} rows from import file`);

			const summary = {
				totalRows: rows.length,
				processedRows: 0,
				enrolled: 0,
				failed: 0,
				errors: [] as any[],
			};

			// Get user info from request (auth middleware populates these directly on req)
			const organizationId = (req as any).organizationId;
			const userId = (req as any).userId;

			if (!organizationId) {
				deviceLogger.error(`Organization ID not found in request`);
				const errorResponse = buildErrorResponse("Organization ID not found", 400);
				res.status(400).json(errorResponse);
				return;
			}

			deviceLogger.info(
				`Processing import for organization: ${organizationId}, user: ${userId}`,
			);

			const devices = await prisma.device.findMany({
				where: {
					isDeleted: false,
					organizationId: String(organizationId),
				},
			});
			const deviceMap = new Map(devices.map((d) => [d.id, d]));

			let rowIndex = 1; // Header is 0, data starts at 1

			for (const row of rows) {
				rowIndex++;
				summary.processedRows++;

				// Handle flexible header names
				const email = row["EMAIL"] || row["email"] || row["Email"];
				const deviceId = row["DEVICE_ID"] || row["device_id"] || row["Device ID"];
				const deviceUserId =
					row["DEVICE_USER_ID"] || row["device_user_id"] || row["Device User ID"];

				if (!email || !deviceId || !deviceUserId) {
					summary.failed++;
					summary.errors.push({
						row: rowIndex,
						error: "Missing required fields (EMAIL, DEVICE_ID, DEVICE_USER_ID)",
						data: row,
					});
					continue;
				}

				try {
					// Validate Device
					const device = deviceMap.get(deviceId);
					// If device schema has organizationId, we should check it.
					// Assuming device is valid if found for now, or check explicit relation if needed.
					if (!device) {
						throw new Error(`Device not found: ${deviceId}`);
					}

					let targetUser: any = null;
					const headers = helpers.prepareAuthHeaders(req);
					if (appConfig.idpEnabled) {
						const getUserUrl = helpers.buildAuthServiceUrl(
							`/api/user?filter=email:${encodeURIComponent(email)},organizationId:${organizationId},status:active&limit=1`,
						);
						const getUserResponse = await fetch(getUserUrl, {
							method: "GET",
							headers,
						});

						if (!getUserResponse.ok) {
							throw new Error(`User not found: ${email}`);
						}

						const getUserData = await getUserResponse.json();
						const users = getUserData.data?.users || getUserData.users || [];
						targetUser = users[0];
					} else {
						targetUser = await prisma.user.findFirst({
							where: {
								email: String(email),
								organizationId: String(organizationId),
								status: "active",
								isDeleted: false,
							},
							select: {
								id: true,
								metadata: true,
							},
						});
					}

					if (!targetUser) {
						throw new Error(`User not found: ${email}`);
					}

					// Update Metadata via Auth Service
					const currentMetadata = (targetUser.metadata as any) || {};
					const currentDevice = currentMetadata.device || {};

					const updatedMetadata = {
						...currentMetadata,
						device: {
							...currentDevice,
							access: {
								empId: deviceUserId.toString(),
								status: "enrolled",
								deviceId: deviceId,
							},
						},
					};

					if (appConfig.idpEnabled) {
						const updateUserUrl = helpers.buildAuthServiceUrl(
							`/api/user/${targetUser.id}`,
						);
						const updateUserResponse = await fetch(updateUserUrl, {
							method: "PATCH",
							headers,
							body: JSON.stringify({ metadata: updatedMetadata }),
						});

						if (!updateUserResponse.ok) {
							const errorText = await updateUserResponse.text();
							throw new Error(`Failed to update user: ${errorText}`);
						}
					} else {
						await prisma.user.update({
							where: { id: String(targetUser.id) },
							data: { metadata: updatedMetadata },
						});
					}

					const employeeIdFromMetadata = currentMetadata?.employee?.id;
					const employee = await resolveEmployeeForUser(
						String(organizationId),
						String(targetUser.id),
						employeeIdFromMetadata ? String(employeeIdFromMetadata) : undefined,
					);
					if (!employee?.id) {
						throw new Error(
							`Employee link not found for ${email}; cannot sync deviceEmpId`,
						);
					}

					await prisma.employee.update({
						where: { id: employee.id },
						data: {
							deviceEmpId: deviceUserId.toString(),
							deviceId: deviceId.toString(),
						},
					});

					summary.enrolled++;
				} catch (error: any) {
					summary.failed++;
					// Keep errors limit to 10
					if (summary.errors.length < 10) {
						summary.errors.push({
							row: rowIndex,
							error: error.message || "Enrollment failed",
							data: { email, deviceId, deviceUserId },
						});
					}
				}
			}

			// Invalidate cache
			try {
				await invalidateCache.byPattern("cache:user:*");
				await invalidateCache.byPattern("cache:users:*");
			} catch (e) {
				console.error("Cache invalidation failed", e);
			}

			logActivity(req, {
				userId: userId || "unknown",
				action: "IMPORT_DEVICE_ENROLLMENT",
				description: `Imported device enrollments: ${summary.enrolled} enrolled, ${summary.failed} failed`,
				page: {
					url: req.originalUrl,
					title: "Device Enrollment Import",
				},
			});

			res.status(200).json(buildSuccessResponse("Import completed", { summary }, 200));
		} catch (error: any) {
			deviceLogger.error(`Import failed: ${error}`);
			res.status(500).json(buildErrorResponse("Import failed", 500));
		}
	};
	return {
		create,
		getAll,
		getEvents,
		getDeviceHealth,
		getHikvisionListenerStatus,
		getDeviceLiveReadiness,
		proveDeviceLivePath,
		controlHikvisionListener,
		searchHikvisionDeviceLogs,
		getDeviceSyncPreview,
		getDeviceSyncRuns,
		getDeviceActivity,
		listDeviceUsers,
		deleteDeviceUser,
		deleteDeviceUsers,
		captureDeviceUserRawFingerprints,
		captureDeviceUserRawFace,
		getDeviceUserPhoto,
		syncDeviceUsers,
		previewDeviceUserExport,
		exportDeviceUsers,
		previewDeviceUserImport,
		executeDeviceUserImport,
		getDeviceUserImportJob,
		backfillDeviceUserLifecycleEvents,
		backfillDeviceUserBiometricMetadata,
		reconcileBiometricSync,
		copyHikvisionDeviceUserToPeer,
		planHikvisionSdkUserMerge,
		applyHikvisionSdkUserMerge,
		startHikvisionSdkUserMergeJob,
		reviewHikvisionSdkUserMergeJob,
		listHikvisionSdkUserMergeJobs,
		getHikvisionSdkUserMergeJob,
		mirrorHikvisionFaceToPeers,
		createSyntheticKioskLoginTap,
		mockHikvisionFingerprintTally,
		mockHikvisionFaceTally,
		backfillDeviceUsers,
		linkDeviceUser,
		unlinkDeviceUser,
		resetDeviceEvents,
		triggerZktecoAttendanceSync,
		triggerHikvisionAttendanceImport,
		getDeviceImportJob,
		cancelDeviceImportJob,
		startDeviceUserSyncJob,
		getDeviceUserSyncJob,
		cancelDeviceUserSyncJob,
		getById,
		update,
		remove,
		enrollDeviceUser,
		importDeviceEnrollment,
	};
};
