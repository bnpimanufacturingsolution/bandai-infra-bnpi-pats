import { apiClient, hrisApiClient } from "../lib/api-client";
import { resolveApiUrl } from "../lib/api-url.helper";
import { getRuntimeApiBase } from "../lib/runtime-api-base";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface Device {
	id: string;
	organizationId?: string;
	name: string;
	address: string;
	port: number;
	protocol: "http" | "https" | "tcp" | "udp";
	config: any;
	access: {
		username?: string;
		password?: string;
	};
	createdAt?: string;
	updatedAt?: string;
}

export type DeviceEventStatus =
	| "RECEIVED"
	| "MATCHED"
	| "ATTENDANCE_CREATED"
	| "ATTENDANCE_UPDATED"
	| "IGNORED"
	| "UNMATCHED"
	| "FAILED";

export type DeviceEventSource = "HIKVISION_CALLBACK" | "EN_HCNETSDK_ALARM" | "ZKTECO_EVENT";
export type DeviceEventCategory =
	| "ATTENDANCE"
	| "ENROLLMENT"
	| "USER_MANAGEMENT"
	| "ACCESS_CONTROL"
	| "DEVICE_HEALTH"
	| "RUNTIME"
	| "UNKNOWN_VENDOR";
export type DeviceEventAction =
	| "TAP"
	| "FINGERPRINT_ENROLLED"
	| "FINGERPRINT_UPDATED"
	| "FINGERPRINT_DELETED"
	| "FACE_ENROLLED"
	| "FACE_UPDATED"
	| "FACE_DELETED"
	| "CARD_ENROLLED"
	| "CARD_UPDATED"
	| "CARD_DELETED"
	| "USER_CREATED"
	| "USER_UPDATED"
	| "USER_DELETED"
	| "TAP_REJECTED"
	| "SYNC_SIGNAL"
	| "SYNC_IMPORTED"
	| "LISTENER_RECEIVED"
	| "UNKNOWN";
export type DeviceEventConfidence = "PROVEN" | "SUPPORTED" | "INFERRED" | "UNKNOWN";

export interface DeviceEvent {
	id: string;
	organizationId: string;
	deviceId: string;
	device?: Pick<Device, "id" | "name" | "address" | "port" | "protocol" | "config">;
	deviceUserId?: string | null;
	deviceUser?: {
		id: string;
		vendorUserId: string;
		employeeNo?: string | null;
		displayName?: string | null;
		status: DeviceUserStatus;
		employeeId?: string | null;
	} | null;
	employee?: {
		id: string;
		employeeId: string;
		deviceEmpId?: string | null;
		fullName?: string | null;
	} | null;
	employeeId?: string | null;
	attendanceId?: string | null;
	eventTime: string;
	receivedAt: string;
	employeeNo?: string | null;
	source: DeviceEventSource;
	status: DeviceEventStatus;
	eventCategory: DeviceEventCategory | string;
	eventAction: DeviceEventAction | string;
	eventLabel: string;
	eventConfidence: DeviceEventConfidence | string;
	eventType?: string | null;
	major?: string | null;
	minor?: string | null;
	doorNo?: string | null;
	verifyMode?: string | null;
	dedupeKey: string;
	payload?: any;
	errorMessage?: string | null;
	taxonomy?: {
		eventCategory: string;
		eventAction: string;
		eventLabel: string;
		eventConfidence?: DeviceEventConfidence | string;
		processingLabel: string;
		transportLabel: string;
		capabilityConfidence: "proven" | "supported" | "inferred" | "unknown" | string;
	};
}

export interface DeviceEventsResponse {
	events: DeviceEvent[];
	summary: {
		total: number;
		byCategory: Partial<Record<DeviceEventCategory | string, number>>;
		byAction: Partial<Record<DeviceEventAction | string, number>>;
		byProcessingResult: Partial<Record<DeviceEventStatus | string, number>>;
		byRuntimePath: Partial<Record<DeviceEventSource | string, number>>;
		byConfidence: Partial<Record<DeviceEventConfidence | string, number>>;
		byEvidenceSource: Partial<Record<string, number>>;
		directEvidence: number;
		inferredEvidence: number;
		unknownEvidence: number;
		matched: number;
		needsEmployeeMatch: number;
		ignored: number;
		failed: number;
		byStatus: Partial<Record<DeviceEventStatus, number>>;
		bySource: Partial<Record<DeviceEventSource, number>>;
	};
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
	};
}

export interface DeviceHealthResponse {
	device: Pick<Device, "id" | "name" | "address" | "port" | "protocol"> & {
		baseUrl?: string;
		vendor?: string;
	};
	summary: {
		status: "online" | "degraded" | "offline";
		checkedAt: string;
		durationMs: number;
	};
	checks: {
		hrisApi: { ok: boolean; status: string };
		hikvisionListener?: {
			ok: boolean;
			status: "running" | "not_running" | "unknown";
			pid?: number;
			error?: string;
		};
		zktecoWebhook?: {
			ok: boolean;
			status: "ready" | "disabled" | string;
			path: string;
		};
		zktecoBridge?: {
			ok: boolean;
			status: "online" | "degraded" | "offline" | string;
			statusUrl?: string;
			latencyMs?: number | null;
			configuredDevices?: number | null;
			connectedDevices?: number | null;
			lastEventAt?: string | null;
			device?: {
				ip: string;
				port: number;
				connected: boolean;
				streaming?: boolean;
				lastConnectedAt?: string | null;
				lastEventAt?: string | null;
				lastPostedAt?: string | null;
				lastError?: string | null;
			} | null;
			error?: string;
			runtime?: string;
		};
		lastZktecoEvent?: {
			id: string;
			status: DeviceEventStatus | string;
			eventTime: string;
			receivedAt: string;
			employeeNo?: string | null;
			errorMessage?: string | null;
		} | null;
		network: {
			ok: boolean;
			status: "reachable" | "unreachable";
			host: string;
			port: number;
			latencyMs: number | null;
			source?: "device_address" | "resolved_runtime_endpoint";
			endpoint?: string | null;
			error?: string;
		};
		deviceApi?: {
			ok: boolean;
			status: "online" | "offline";
			latencyMs: number | null;
			provenBy?: "systemTime" | "userRead" | "eventHistory";
			error?: string;
			time?: unknown;
		};
		systemTime?: {
			ok: boolean;
			status: "readable" | "unreachable";
			latencyMs: number | null;
			error?: string;
		};
		userRead?: {
			ok: boolean;
			status: "readable" | "unknown";
			count: number | null;
			error?: string;
		};
		eventHistory?: {
			ok: boolean;
			status: "readable" | "unknown";
			count: number | null;
			error?: string;
		};
	};
}

export interface DeviceSyncPreviewRow {
	deviceId: string;
	name: string;
	address: string;
	port: number;
	vendor: "ZKTeco" | "Hikvision" | string;
	source: DeviceEventSource | string;
	syncedEvents: number;
	totalEvents: number | null;
	needsSyncEvents: number | null;
	hrisSavedCount?: number;
	vendorEventCount?: number | null;
	vendorUserCount?: number | null;
	directFingerprintUserCount?: number | null;
	directFaceUserCount?: number | null;
	directCardUserCount?: number | null;
	inventoryEvidenceSource?: "DEVICE_CURRENT_STATE" | string | null;
	hrisUserCount?: number;
	linkedUserCount?: number;
	openUserCount?: number;
	fingerprintReported?: number;
	fingerprintEnvelopePresent?: number;
	fingerprintEnvelopeMissing?: number;
	faceReported?: number;
	faceEnvelopePresent?: number;
	faceEnvelopeMissing?: number;
	conflictUserCount?: number;
	disabledUserCount?: number;
	peerBaselineDeviceId?: string | null;
	peerBaselineDeviceName?: string | null;
	peerMissingUserCount?: number;
	peerStaleUserCount?: number;
	peerMissingFingerprintCount?: number;
	peerMissingFaceCount?: number;
	peerMissingCardCount?: number;
	peerDriftTotalCount?: number;
	peerCredentialGapCount?: number;
	knownSkippedEventCount?: number;
	totalUnsavedEventCount?: number | null;
	importableIfSkipMissingEmployeeNo?: number | null;
	importableIfSaveMissingEmployeeNo?: number | null;
	failedEventCount?: number;
	importableSavedCount?: number;
	missingEventCount?: number | null;
	canStartSync?: boolean;
	syncAction?: "zkteco-bridge-sync" | "hikvision-import" | string | null;
	status: "synced" | "needs_sync" | "source_total_unavailable" | string;
	lastSourceEventAt?: string | null;
	error?: string | null;
	eventRows?: DeviceSyncPreviewEventRow[];
	sources?: DeviceSyncPreviewSourceCheck[];
	readySourceCount?: number;
	sourceCheckTotal?: number;
	operationLogTotal?: number | null;
}

export interface DeviceSyncPreviewSourceCheck {
	key: string;
	label: string;
	readsFrom: string;
	ok: boolean;
	total: number | null;
	error?: string | null;
	status: string;
}

export interface DeviceSyncPreviewEventRow {
	key: string;
	eventLabel: string;
	businessArea?: string;
	willAdd: number | null;
	alreadyInHris: number;
	sourceProof: "Operation logs" | "Attendance/access events" | string;
	readsFrom: "ContentMgmt/logSearch" | "AccessControl/AcsEvent" | string;
	filterAfterSync: string;
	whereToFind?: string;
	status: "Ready" | "Needs review" | "Unavailable" | "No new rows" | "Partial" | "Failed" | string;
	confidenceLabel?: string | null;
	reviewReason?: string | null;
	sourceDetail?: string | null;
	deviceLabels?: string[];
	eventCategory?: string | null;
	eventAction?: string | null;
	evidenceSource?: string | null;
}

export interface DeviceSyncPreviewResponse {
	generatedAt: string;
	scope: {
		deviceId: string;
		source: string;
	};
	bridge?: {
		ok: boolean;
		status: string;
		statusUrl?: string | null;
		error?: string | null;
	} | null;
	devices: DeviceSyncPreviewRow[];
}

export interface DeviceSyncRun {
	id: string;
	organizationId: string;
	deviceId: string;
	runType: "DEVICE_USERS" | "DEVICE_LOGS" | string;
	status: "PROCESSING" | "COMPLETED" | "FAILED" | string;
	source?: DeviceEventSource | string | null;
	totalSourceRecords: number;
	importableRecords: number;
	savedRecords: number;
	skippedRecords: number;
	failedRecords: number;
	missingRecords: number;
	skipSummary?: Record<string, unknown> | null;
	failureSummary?: Record<string, unknown> | null;
	rawSummary?: Record<string, unknown> | null;
	startedAt: string;
	completedAt?: string | null;
	createdAt?: string;
	updatedAt?: string;
}

export interface DeviceSyncRunsResponse {
	syncRuns: DeviceSyncRun[];
}

export interface DeviceActivityEventRow {
	id: string;
	receivedAt: string;
	deviceEventTime?: string | null;
	source: string;
	eventCategory?: string | null;
	eventAction?: string | null;
	eventLabel?: string | null;
	origin?: string | null;
	originLabel?: string | null;
	originDetail?: string | null;
	rawId?: string | null;
	employeeMatch?: { employeeId?: string | null; label?: string | null } | null;
	hrisStatus: string;
	action?: string | null;
	message?: string | null;
	runId?: string | null;
	correlationId?: string | null;
	payload?: Record<string, unknown> | null;
}

export interface DeviceActivityResponse {
	generatedAt: string;
	device: {
		id: string;
		name?: string | null;
		address?: string | null;
		port?: number | null;
		protocol?: string | null;
		config?: Record<string, unknown> | null;
	};
	status: "idle" | "listening" | "reconciling" | "importing" | "adjusting" | "failed" | "completed" | "running" | string;
	activeRun?: DeviceSyncRun | null;
	activeJob?: Record<string, unknown> | null;
	lastRun?: DeviceSyncRun | null;
	counts: {
		sdkReceived: number;
		parsed: number;
		savedInHris: number;
		skipped: number;
		failed: number;
		needsLink: number;
		gap: number;
	};
	filters: {
		status: string;
		source: string;
		runId?: string | null;
		search?: string;
		limit: number;
	};
	events: DeviceActivityEventRow[];
	rawSdkPersistence?: {
		persisted: boolean;
		message?: string | null;
	};
}

export interface DeviceImportJobProgress {
	jobId: string;
	status: "processing" | "completed" | "failed" | "cancelled";
	deviceId: string;
	deviceName: string;
	total: number;
	sourceTotal?: number | null;
	targetImportCount?: number | null;
	scanLimit?: number | null;
	processed: number;
	imported: number;
	skipped: number;
	alreadySaved?: number;
	knownSkipped?: number;
	skipMissingEmployeeNo?: boolean;
	includeAttendance?: boolean;
	includeOperations?: boolean;
	timeWindow?: string;
	phase?: string | null;
	attendanceImported?: number;
	operationsImported?: number;
	cancelRequested?: boolean;
	cancelRequestedAt?: string;
	failed: number;
	message: string;
	errors?: Array<{ row: number; error: string }>;
	startedAt: string;
	completedAt?: string;
}

export type DeviceUserSyncMode = "full_refresh" | "needs_attention_only" | "peer_converge";

export type DeviceUserMergeField =
	| "vendorUserId"
	| "employeeNo"
	| "employeeId"
	| "displayName"
	| "status"
	| "validFrom"
	| "validTo"
	| "doorRight"
	| "accessPlan"
	| "face"
	| "fingerprint"
	| "card";

export type DeviceUserMergePlanResponse = {
	planId: string;
	plan: {
		deviceIds: string[];
		devices: Array<{
			id: string;
			name?: string | null;
			address?: string | null;
			port?: number | null;
		}>;
		users: Array<{
			key: string;
			sourceDeviceId: string;
			targetDeviceIds: string[];
			employeeId?: string | null;
			employee?: { id?: string; employeeId?: string | null; fullName?: string | null } | null;
			vendorUserIds: string[];
			records: any[];
			missingOnDeviceIds: string[];
			conflicts: Array<{
				field: DeviceUserMergeField;
				choice: "A" | "B" | "KEEP" | null;
				deviceA: { id: string; name: string; value: unknown };
				deviceB: { id: string; name: string; value: unknown };
			}>;
		}>;
		counts: {
			unionUsers: number;
			conflicts: number;
			missing: number;
			ambiguous?: number;
			missingHrisLinks?: number;
		};
		plannedWrites?: Array<{ userKey: string; targetDeviceId: string }>;
		errors: Array<{ deviceId: string; deviceName: string; error: string }>;
		ambiguousMatches?: Array<{ deviceId?: string; deviceName?: string; candidates?: string[] }>;
	};
};

export type DeviceUserMergeRequest = {
	deviceIds: string[];
};

export interface DeviceUserMergeJobProgress {
	jobId: string;
	planId: string;
	retryPlanId?: string;
	status: "processing" | "completed" | "failed";
	totalWrites: number;
	processedWrites: number;
	successfulWrites: number;
	failedWrites: number;
	message: string;
	results: Array<{
		userKey?: string;
		sourceDeviceId?: string;
		targetDeviceId?: string;
		status: "success" | "error" | string;
		strategy?: string | null;
		error?: string | null;
	}>;
	remainingConflicts?: number;
	remainingMissing?: number;
	attention?: number;
	error?: string | null;
	startedAt: string;
	completedAt?: string;
}

export type DeviceUserMergeApplyPayload = {
	planId: string;
	choices?: Record<string, Partial<Record<DeviceUserMergeField, "A" | "B" | "KEEP">>>;
	applyAll?: "A" | "B";
	selectedUserKeys?: string[];
};

export interface DeviceUserSyncJobStartRequest {
	mode?: DeviceUserSyncMode;
	deviceIds?: string[];
}

export interface DeviceUserSyncJobProgress {
	jobId: string;
	status: "processing" | "completed" | "failed" | "cancelled";
	syncMode?: DeviceUserSyncMode;
	totalDevices: number;
	processedDevices: number;
	successfulDevices: number;
	failedDevices: number;
	biometricTotal: number;
	biometricProcessed: number;
	biometricCaptured: number;
	biometricCached: number;
	biometricFailed: number;
	currentDeviceId?: string | null;
	currentDeviceName?: string | null;
	currentVendorUserId?: string | null;
	currentModality?: "fingerprint" | "face" | null;
	message: string;
	cancelRequested?: boolean;
	cancelRequestedAt?: string;
	stale?: boolean;
	results: Array<{
		deviceId: string;
		deviceName: string;
		status: "success" | "error" | "cancelled";
		runId?: string | null;
		summary?: DeviceUserSyncResponse["summary"];
		error?: string | null;
	}>;
	startedAt: string;
	updatedAt?: string;
	completedAt?: string;
}

export interface DeviceEventsResetScope {
	deviceId?: string;
	source?: string;
	status?: string;
	from?: string;
	to?: string;
	dateField?: "eventTime" | "receivedAt";
	includeLinkedAttendance?: boolean;
	execute?: boolean;
}

export interface DeviceEventsResetResponse {
	mode: "preview" | "executed";
	scope: {
		organizationId: string;
		deviceId: string;
		source: string;
		status: string;
		from: string | null;
		to: string | null;
		dateField: "eventTime" | "receivedAt";
	};
	counts?: {
		devices: number;
		deviceEvents: number;
		linkedAttendance: number;
		importJobs: number;
	};
	countsBefore?: {
		devices: number;
		deviceEvents: number;
		linkedAttendance: number;
		importJobs: number;
	};
	countsAfter?: {
		deviceEvents: number;
		linkedAttendance: number;
	};
	deleted?: {
		deviceEvents: number;
		linkedAttendance: number;
	};
	backupDir?: string;
	affectedModels?: string[];
}

export type HikvisionListenerAction = "start" | "stop" | "restart";

export interface HikvisionListenerStatus {
	service: string;
	vm: {
		host: string;
		user: string;
		path?: string;
	};
	running: boolean;
	status: "running" | "stopped" | "inactive" | "failed" | "unknown" | string;
	sdk?: {
		receivingCallbacks: boolean;
		postingToHris: boolean;
		armed: boolean;
		lastAlarmAt?: string | null;
		lastPostAt?: string | null;
		lastLoginAt?: string | null;
		lastLoginOk?: boolean | null;
		lastLoginError?: string | null;
		lastError?: string | null;
		lastTargetHost?: string | null;
		lastFailureReason?: string | null;
		diagnosis?: string | null;
		state:
			| "receiving"
			| "armed"
			| "login_failed"
			| "posting_failed"
			| "idle"
			| "unknown"
			| string;
		devices?: Array<{
			deviceId?: string | null;
			name?: string | null;
			host?: string | null;
			sdkPort?: string | null;
			lastLogAt?: string | null;
			lastLoginAt?: string | null;
			lastLoginOk?: boolean | null;
			lastLoginError?: string | null;
			armed: boolean;
			receivingCallbacks: boolean;
			postingToHris: boolean;
			lastAlarmAt?: string | null;
			lastPostAt?: string | null;
			lastFailureReason?: string | null;
			state: string;
		}>;
	};
	activeState: string;
	subState: string;
	mainPid?: number | null;
	restarts: number;
	execMainStatus: number;
	result?: string | null;
	checkedAt: string;
	control: {
		available: boolean;
		actions: HikvisionListenerAction[];
	};
	logs?: {
		available: boolean;
		recent: string[];
		error?: string | null;
	};
	error?: string | null;
}

export interface HikvisionListenerControlResponse {
	action: HikvisionListenerAction;
	status: HikvisionListenerStatus;
}

export interface CreateDeviceRequest {
	name: string;
	address: string;
	port: number;
	protocol?: "http" | "https" | "tcp" | "udp";
	config?: any;
	access?: {
		username?: string;
		password?: string;
	};
}

export interface UpdateDeviceRequest {
	name?: string;
	address?: string;
	port?: number;
	protocol?: "http" | "https" | "tcp" | "udp";
	config?: any;
	access?: {
		username?: string;
		password?: string;
	};
}

export interface ImportDeviceResponse {
	summary: {
		totalRows: number;
		processedRows: number;
		enrolled: number;
		failed: number;
		errors: Array<{
			row: number;
			error: string;
			data: any;
		}>;
	};
}

export interface ZktecoAttendanceSyncRequest {
	deviceId?: string;
	deviceIp?: string;
}

export interface EnrollDeviceUserRequest {
	userId: string;
	deviceId: string;
	deviceUserId: string;
}

export interface HikvisionCopyUserRequest {
	sourceDeviceId: string;
	targetDeviceId?: string;
	targetDeviceIds?: string[];
	employeeNo: string;
	includeFingerprints?: boolean;
	includeFaceRecognition?: boolean;
}

export interface HikvisionMirrorFaceRequest {
	sourceDeviceId: string;
	employeeNo: string;
}

export interface HikvisionMockFingerprintRequest {
	deviceId: string;
	vendorUserId: string;
	fingerprintCount: number;
	targetDeviceId?: string;
}

export interface HikvisionMockFaceRequest {
	deviceId: string;
	vendorUserId: string;
	faceCount: number;
	targetDeviceId?: string;
}

export type DeviceUserStatus = "ACTIVE" | "UNMATCHED" | "CONFLICT" | "DISABLED";

export interface DeviceUser {
	id: string;
	organizationId: string;
	deviceId: string;
	employeeId?: string | null;
	vendorUserId: string;
	employeeNo?: string | null;
	displayName?: string | null;
	userType?: string | null;
	status: DeviceUserStatus;
	validFrom?: string | null;
	validTo?: string | null;
	doorRight?: string | null;
	accessPlan?: any;
	rawPayload?: any;
	vendorMetadata?: any;
	lastSyncedAt?: string | null;
	createdAt?: string;
	updatedAt?: string;
	device?: Pick<Device, "id" | "name" | "address" | "port" | "protocol">;
	employee?: {
		id: string;
		employeeId: string;
		deviceEmpId?: string | null;
		fullName?: string | null;
	} | null;
}

export interface DeviceUsersResponse {
	deviceUsers: DeviceUser[];
	summary: {
		total: number;
		active: number;
		matched: number;
		unmatched: number;
		conflict: number;
		disabled: number;
	};
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
	};
}

export interface DeviceUserCredentialSummary {
	fingerprintCount: number;
	cardCount: number;
	faceCount: number;
	hasFingerprint: boolean;
	hasCard: boolean;
	hasFace: boolean;
}

export interface DeviceUserSyncResponse {
	run?: any;
	summary: {
		totalSourceRecords: number;
		importableRecords: number;
		created: number;
		updated: number;
		linked: number;
		unmatched: number;
		conflict: number;
		disabled: number;
		pruned?: number;
		mode?: DeviceUserSyncMode;
		sourceDeviceId?: string;
		sourceDeviceName?: string;
		convergenceSource?: boolean;
		copiedUsers?: number;
		retryCount?: number;
		skippedUsers?: number;
		failedCopies?: number;
		syntheticFaceMirrors?: number;
		biometricTasks?: number;
		biometricCached?: number;
		biometricCaptured?: number;
		biometricFailed?: number;
	};
}

export type DeviceUserTransferScope = "currentDevice" | "allHikvisionDevices";
export type DeviceUserExportSelection = "all" | "filtered" | "currentPage" | "selectedRows";

export interface DeviceUserExportRequest {
	deviceId: string;
	scope?: DeviceUserTransferScope;
	selection?: DeviceUserExportSelection;
	query?: string;
	status?: string;
	page?: number;
	limit?: number;
	vendorUserIds?: string[];
	includeCards?: boolean;
	includeFingerprints?: boolean;
	includeFaces?: boolean;
	encryptedBiometricBundle?: boolean;
	refreshSourceUsers?: boolean;
	refreshBiometricBundle?: boolean;
	biometricBundlePassphrase?: string;
}

export interface DeviceUserExportPayload {
	schemaVersion: "project-truth.hikvision-device-users.v1" | string;
	exportedAt: string;
	scope: {
		type: DeviceUserTransferScope | string;
		deviceId?: string | null;
		sourceEndpoint?: string;
		selection?: DeviceUserExportSelection | string;
		status?: string;
		query?: string;
		page?: number | null;
		limit?: number | null;
	};
	policy?: Record<string, unknown>;
	biometricBundle?: {
		present: boolean;
		requiredForPortableTemplateImport?: boolean;
		algorithm?: string | null;
		status?: string;
		reason?: string;
		plaintextPolicy?: string;
		ciphertext?: string;
		encryptedPayload?: string;
		encryptedBlob?: string;
		users?: Array<{
			sourceDeviceId: string;
			vendorUserId: string;
			source?: string;
			fingerprintCount?: number;
			faceTemplateSize?: number;
			facePictureSize?: number;
			fingerprintPlaintextSha256?: string | null;
			fingerprintCiphertextLength?: number;
			fingerprintKeySource?: string | null;
			facePlaintextSha256?: string | null;
			faceCiphertextLength?: number;
			faceKeySource?: string | null;
		}>;
		errors?: Array<{
			sourceDeviceId: string;
			vendorUserId: string;
			status?: string;
			error?: string;
		}>;
	};
	devices: Array<{
		device: Pick<Device, "id" | "name" | "address" | "port" | "protocol"> & {
			model?: string | null;
			serialNumber?: string | null;
		};
		sourceRead?: {
			status: string;
			endpoint?: string;
			total?: number;
			error?: string;
		};
		capabilities?: {
			support?: {
				userExport?: boolean;
				cardExport?: boolean;
				fingerprintExport?: boolean;
				fingerprintImport?: boolean;
				faceImportExport?: boolean;
			};
			probes?: Array<{
				name: string;
				endpoint: string;
				method: string;
				status: string;
				error?: string;
			}>;
			policy?: Record<string, unknown>;
		};
		summary: {
			totalUsers: number;
			readFromDevice: number;
			savedInHris: number;
			linked: number;
			unlinked: number;
			credentialTypes?: Record<string, string>;
			selection?: {
				mode: DeviceUserExportSelection | string;
				status?: string;
				query?: string;
				page?: number | null;
				limit?: number | null;
				vendorUserIds?: string[];
				matchedRows?: number;
				totalRowsBeforeSelection?: number;
			};
		};
		users?: DeviceUser[];
	}>;
	summary: {
		devices: number;
		totalUsers: number;
		linked: number;
		unlinked: number;
		biometrics?: {
			fingerprintCountReported: number;
			fingerprintEnvelopesCaptured: number;
			faceCountReported: number;
			faceEnvelopesCaptured: number;
			captureFailures: number;
			portableDecryptable: boolean;
		};
	};
}

export interface DeviceUserImportPreviewRequest {
	targetDeviceId: string;
	payload: DeviceUserExportPayload;
	biometricBundlePassphrase?: string;
}

export interface DeviceUserImportPreviewResponse {
	execute: false;
	dryRun: true;
	targetDevice: Pick<Device, "id" | "name" | "address" | "port">;
	file: {
		schemaVersion: string;
		exportedAt?: string | null;
		sourceDevices: number;
		users: number;
	};
	counts: {
		newUsers: number;
		matchingUsers: number;
		conflicts: number;
		missingHrisEmployees: number;
	};
	unsupportedCredentialTypes: string[];
	biometricBundle?: {
		present: boolean;
		requiredForPortableTemplateImport?: boolean;
		algorithm?: string | null;
		status?: string;
		unlockable?: boolean;
		plaintextExposed?: boolean;
		transferModes?: string[];
	};
	previewToken?: string;
	plan: Array<{
		vendorUserId: string;
		employeeNo?: string | null;
		sourceDeviceId?: string | null;
		sourceDeviceName?: string | null;
		action: string;
		conflictFields: string[];
		missingEmployee: boolean;
		currentDeviceUserId?: string | null;
		transferMode?: string;
	}>;
	executeAvailable: boolean;
	executeBlockedReason?: string;
	executeRequirements?: string[];
}

export interface DeviceUserImportExecuteRequest {
	targetDeviceId: string;
	payload: DeviceUserExportPayload;
	previewToken: string;
	confirmation: string;
	execute: true;
	biometricTransferMode?: "sdkPeerCopy" | "metadataOnly" | "encryptedBundle";
	biometricBundlePassphrase?: string;
	runAsJob?: boolean;
}

export interface DeviceUserImportExecuteResponse {
	mode: "executed" | "job";
	jobId?: string | null;
	status?: "processing" | "completed" | "failed" | string;
	pollUrl?: string;
	message?: string;
	backupDir?: string | null;
	biometricTransferMode?: string;
	plaintextBiometricExposed: false;
	counts?: {
		planned: number;
		imported: number;
		failed: number;
		skipped: number;
		targetUsersAfter: number;
	};
	results?: Array<Record<string, unknown>>;
}

export interface DeviceUserImportJobResponse {
	jobId: string;
	status: "processing" | "completed" | "failed" | string;
	targetDeviceId?: string | null;
	targetDeviceName?: string | null;
	planned: number;
	imported: number;
	failed: number;
	skipped: number;
	message: string;
	backupDir?: string | null;
	plaintextBiometricExposed: false;
	results: Array<Record<string, unknown>>;
	error?: string | null;
	startedAt: string;
	completedAt?: string | null;
}

export interface DevicesResponse {
	data: Device[] | { devices: Device[] };
	pagination?: {
		total: number;
		page: number;
		limit: number;
	};
}

class DevicesService extends APIService {
	/**
	 * Get all devices with optional filtering, pagination, and sorting
	 * Uses query parameters set via method chaining (select, search, paginate, sort, setParams)
	 * @returns Promise<DevicesResponse> - Devices response with pagination
	 */
	async getDevices(): Promise<DevicesResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/device${queryString}`;

			console.log("Fetching devices from HRIS API:", endpoint);

			const response = await hrisApiClient.get<DevicesResponse>(endpoint);

			// Handle nested data structure if API returns { data: { ... } }
			let devicesData = response.data;
			if (devicesData && typeof devicesData === "object" && "data" in devicesData) {
				devicesData = (devicesData as any).data;
			}

			if (!devicesData) {
				throw new Error("Failed to fetch devices");
			}
			return devicesData as DevicesResponse;
		} catch (error: any) {
			console.error("Error fetching devices:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching devices",
			);
		}
	}

	/**
	 * Create a new device
	 * @param payload Device creation payload
	 * @returns Promise<Device> - Created device
	 */
	async createDevice(payload: CreateDeviceRequest): Promise<Device> {
		try {
			// Set the auth token for HRIS API client

			console.log("Creating device with payload:", payload);

			const response = await hrisApiClient.post<Device>("/api/device", payload);
			if (!response.data) {
				throw new Error("Failed to create device");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error creating device:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error creating device",
			);
		}
	}

	/**
	 * Update an existing device
	 * @param deviceId Device ID
	 * @param payload Device update payload
	 * @returns Promise<Device> - Updated device
	 */
	async updateDevice(deviceId: string, payload: UpdateDeviceRequest): Promise<Device> {
		try {
			// Set the auth token for HRIS API client

			console.log("Updating device:", deviceId, "with payload:", payload);

			const response = await hrisApiClient.patch<Device>(`/api/device/${deviceId}`, payload);
			if (!response.data) {
				throw new Error("Failed to update device");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating device:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating device",
			);
		}
	}

	/**
	 * Delete a device
	 * @param deviceId Device ID
	 * @returns Promise<{ id: string }> - Deleted device ID
	 */
	async deleteDevice(deviceId: string): Promise<{ id: string }> {
		try {
			// Set the auth token for HRIS API client

			console.log("Deleting device:", deviceId);

			const response = await hrisApiClient.delete<{ id: string }>(`/api/device/${deviceId}`);
			if (!response.data) {
				throw new Error("Failed to delete device");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error deleting device:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error deleting device",
			);
		}
	}

	/**
	 * Get device by ID with optional field selection
	 * @param deviceId Device ID
	 * @returns Promise<Device> - Device data
	 */
	async getDeviceById(deviceId: string): Promise<Device> {
		try {
			const endpoint = `/api/device/${deviceId}`;
			const response = await hrisApiClient.get<any>(endpoint);

			if (!response.data) {
				throw new Error("Device not found");
			}

			// Extract device from nested structure: response.data.data
			let deviceData = response.data;
			if (deviceData && typeof deviceData === "object" && "data" in deviceData) {
				deviceData = deviceData.data;
			}

			if (!deviceData) {
				throw new Error("Device data is undefined");
			}

			return deviceData as Device;
		} catch (error: any) {
			console.error("Error fetching device:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching device",
			);
		}
	}

	/**
	 * Get devices with specific parameters
	 * @param params Query parameters
	 * @returns Promise<DevicesResponse> - Devices response
	 */
	async getDevicesWithParams(params: ApiQueryParams): Promise<DevicesResponse> {
		return this.setParams(params).getDevices();
	}

	async getDeviceEvents(params: ApiQueryParams = {}): Promise<DeviceEventsResponse> {
		try {
			const query = new URLSearchParams();
			Object.entries(params).forEach(([key, value]) => {
				if (value === undefined || value === null || value === "") return;
				query.set(key, String(value));
			});

			const endpoint = `/api/device/events${query.toString() ? `?${query.toString()}` : ""}`;
			const response = await hrisApiClient.get<any>(endpoint);
			let eventsData = response.data;
			if (eventsData && typeof eventsData === "object" && "data" in eventsData) {
				eventsData = eventsData.data;
			}

			return {
				events: eventsData?.events || [],
				summary: eventsData?.summary || {
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
				},
				pagination: eventsData?.pagination,
			};
		} catch (error: any) {
			console.error("Error fetching device events:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching device events",
			);
		}
	}

	async getDeviceHealth(deviceId: string): Promise<DeviceHealthResponse> {
		try {
			if (!String(deviceId || "").trim()) {
				throw new Error("Select a device before checking health");
			}
			const response = await hrisApiClient.get<any>(`/api/device/${deviceId}/health`);
			let healthData = response.data;
			if (healthData && typeof healthData === "object" && "data" in healthData) {
				healthData = healthData.data;
			}
			if (!healthData) {
				throw new Error("Failed to check device health");
			}
			return healthData as DeviceHealthResponse;
		} catch (error: any) {
			console.error("Error checking device health:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error checking device health",
			);
		}
	}

	async getDeviceSyncPreview(
		params: { deviceId?: string; source?: string } = {},
	): Promise<DeviceSyncPreviewResponse> {
		try {
			const query = new URLSearchParams();
			if (params.deviceId && params.deviceId !== "all")
				query.set("deviceId", params.deviceId);
			if (params.source && params.source !== "all") query.set("source", params.source);
			const endpoint = `/api/device/sync-preview${query.toString() ? `?${query.toString()}` : ""}`;
			const response = await hrisApiClient.get<any>(endpoint);
			const previewData = response.data?.data || response.data;
			if (!previewData) {
				throw new Error("Failed to build device sync preview");
			}
			return previewData as DeviceSyncPreviewResponse;
		} catch (error: any) {
			console.error("Error building device sync preview:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error building device sync preview",
			);
		}
	}

	async getDeviceUsers(
		deviceId: string,
		params: {
			page?: number;
			limit?: number;
			query?: string;
			status?: string;
			vendorUserId?: string;
			vendorUserIds?: string[];
			employeeId?: string;
		} = {},
	): Promise<DeviceUsersResponse> {
		try {
			if (!String(deviceId || "").trim()) throw new Error("Device is required");
			const query = new URLSearchParams();
			if (params.page) query.set("page", String(params.page));
			if (params.limit) query.set("limit", String(params.limit));
			if (params.query) query.set("query", params.query);
			if (params.status && params.status !== "all") query.set("status", params.status);
			if (params.employeeId) query.set("employeeId", params.employeeId);
			if (params.vendorUserId) query.set("vendorUserId", params.vendorUserId);
			if (params.vendorUserIds?.length) {
				query.set(
					"vendorUserIds",
					params.vendorUserIds
						.map((vendorUserId) => String(vendorUserId).trim())
						.filter(Boolean)
						.join(","),
				);
			}
			const endpoint = `/api/device/${deviceId}/users${query.toString() ? `?${query.toString()}` : ""}`;
			const response = await hrisApiClient.get<any>(endpoint);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to load device users");
			return data as DeviceUsersResponse;
		} catch (error: any) {
			console.error("Error loading device users:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error loading device users",
			);
		}
	}

	async getEmployeeDeviceUsers(
		employeeId: string,
		params: {
			page?: number;
			limit?: number;
			query?: string;
			status?: string;
		} = {},
	): Promise<DeviceUsersResponse> {
		try {
			if (!String(employeeId || "").trim()) throw new Error("Employee is required");
			const query = new URLSearchParams();
			query.set("employeeId", employeeId);
			if (params.page) query.set("page", String(params.page));
			if (params.limit) query.set("limit", String(params.limit));
			if (params.query) query.set("query", params.query);
			if (params.status && params.status !== "all") query.set("status", params.status);
			const endpoint = `/api/device/users?${query.toString()}`;
			const response = await hrisApiClient.get<any>(endpoint);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to load employee device users");
			return data as DeviceUsersResponse;
		} catch (error: any) {
			console.error("Error loading employee device users:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error loading employee device users",
			);
		}
	}

	async syncDeviceUsers(deviceId: string): Promise<DeviceUserSyncResponse> {
		try {
			if (!String(deviceId || "").trim()) throw new Error("Device is required");
			const response = await hrisApiClient.post<any>(
				`/api/device/${deviceId}/users/sync`,
				{},
			);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to sync device users");
			return data as DeviceUserSyncResponse;
		} catch (error: any) {
			console.error("Error syncing device users:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error syncing device users",
			);
		}
	}

	async previewDeviceUserExport(
		payload: DeviceUserExportRequest,
	): Promise<DeviceUserExportPayload> {
		try {
			const response = await hrisApiClient.post<any>(
				"/api/device/users/export/preview",
				payload,
			);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to preview device-user export");
			return data as DeviceUserExportPayload;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error previewing device-user export",
			);
		}
	}

	async exportDeviceUsers(payload: DeviceUserExportRequest): Promise<DeviceUserExportPayload> {
		try {
			const response = await hrisApiClient.post<any>("/api/device/users/export", payload);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to export device users");
			return data as DeviceUserExportPayload;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error exporting device users",
			);
		}
	}

	async previewDeviceUserImport(
		payload: DeviceUserImportPreviewRequest,
	): Promise<DeviceUserImportPreviewResponse> {
		try {
			const response = await hrisApiClient.post<any>("/api/device/users/import/preview", {
				targetDeviceId: payload.targetDeviceId,
				payload: payload.payload,
				execute: false,
				...(payload.biometricBundlePassphrase
					? { biometricBundlePassphrase: payload.biometricBundlePassphrase }
					: {}),
			});
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to preview device-user import");
			return data as DeviceUserImportPreviewResponse;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error previewing device-user import",
			);
		}
	}

	async executeDeviceUserImport(
		payload: DeviceUserImportExecuteRequest,
	): Promise<DeviceUserImportExecuteResponse> {
		try {
			const response = await hrisApiClient.post<any>("/api/device/users/import/execute", {
				targetDeviceId: payload.targetDeviceId,
				payload: payload.payload,
				previewToken: payload.previewToken,
				confirmation: payload.confirmation,
				execute: true,
				biometricTransferMode: payload.biometricTransferMode || "sdkPeerCopy",
				runAsJob: payload.runAsJob === true,
				...(payload.biometricBundlePassphrase
					? { biometricBundlePassphrase: payload.biometricBundlePassphrase }
					: {}),
			});
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to execute device-user import");
			return data as DeviceUserImportExecuteResponse;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error executing device-user import",
			);
		}
	}

	async getDeviceUserImportJob(jobId: string): Promise<DeviceUserImportJobResponse> {
		try {
			const response = await hrisApiClient.get<any>(
				`/api/device/users/import/jobs/${encodeURIComponent(jobId)}`,
			);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to retrieve device-user import job");
			return data as DeviceUserImportJobResponse;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error retrieving device-user import job",
			);
		}
	}

	async startDeviceUserSyncJob(
		payload: DeviceUserSyncJobStartRequest = { mode: "full_refresh" },
	): Promise<{ jobId: string; progress: DeviceUserSyncJobProgress }> {
		try {
			const response = await hrisApiClient.post<any>("/api/device/users/sync-jobs", payload);
			const data = response.data?.data || response.data;
			if (!data?.jobId) throw new Error("Failed to start device-user sync");
			return data as { jobId: string; progress: DeviceUserSyncJobProgress };
		} catch (error: any) {
			console.error("Error starting device-user sync job:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error starting device-user sync job",
			);
		}
	}

	async planHikvisionSdkUserMerge(
		payload: DeviceUserMergeRequest,
	): Promise<DeviceUserMergePlanResponse> {
		try {
			const response = await hrisApiClient.post<any>(
				"/api/device/hikvision/sdk-users/merge/plan",
				payload,
			);
			const data = response.data?.data || response.data;
			if (!data?.planId || !data?.plan)
				throw new Error("Failed to build SDK user merge plan");
			return data as DeviceUserMergePlanResponse;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Failed to build SDK user merge plan",
			);
		}
	}

	async applyHikvisionSdkUserMerge(payload: DeviceUserMergeApplyPayload): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>(
				"/api/device/hikvision/sdk-users/merge/apply",
				payload,
			);
			return response.data?.data || response.data;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Failed to apply SDK user merge",
			);
		}
	}

	async startHikvisionSdkUserMergeJob(
		payload: DeviceUserMergeApplyPayload,
	): Promise<{ jobId: string; progress: DeviceUserMergeJobProgress }> {
		try {
			const response = await hrisApiClient.post<any>(
				"/api/device/hikvision/sdk-users/merge/jobs",
				payload,
			);
			const data = response.data?.data || response.data;
			if (!data?.jobId) throw new Error("Failed to start SDK user merge job");
			return data as { jobId: string; progress: DeviceUserMergeJobProgress };
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Failed to start SDK user merge job",
			);
		}
	}

	async getHikvisionSdkUserMergeJob(jobId: string): Promise<DeviceUserMergeJobProgress> {
		try {
			if (!String(jobId || "").trim()) throw new Error("SDK user merge job is required");
			const response = await hrisApiClient.get<any>(
				`/api/device/hikvision/sdk-users/merge/jobs/${jobId}`,
			);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("SDK user merge job was not found");
			return data as DeviceUserMergeJobProgress;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"SDK user merge job was not found",
			);
		}
	}

	async getDeviceUserSyncJob(jobId: string): Promise<DeviceUserSyncJobProgress> {
		try {
			if (!String(jobId || "").trim()) throw new Error("Device-user sync job is required");
			const response = await hrisApiClient.get<any>(`/api/device/users/sync-jobs/${jobId}`);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Device-user sync job was not found");
			return data as DeviceUserSyncJobProgress;
		} catch (error: any) {
			console.error("Error loading device-user sync job:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error loading device-user sync job",
			);
		}
	}

	async cancelDeviceUserSyncJob(jobId: string): Promise<DeviceUserSyncJobProgress> {
		try {
			if (!String(jobId || "").trim()) throw new Error("Device-user sync job is required");
			const response = await hrisApiClient.post<any>(
				`/api/device/users/sync-jobs/${jobId}/cancel`,
				{},
			);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Device-user sync job was not found");
			return data as DeviceUserSyncJobProgress;
		} catch (error: any) {
			console.error("Error cancelling device-user sync job:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error cancelling device-user sync job",
			);
		}
	}

	async getDeviceSyncRuns(
		deviceId: string,
		params: { limit?: number } = {},
	): Promise<DeviceSyncRunsResponse> {
		try {
			if (!String(deviceId || "").trim()) throw new Error("Device is required");
			const query = new URLSearchParams();
			if (params.limit) query.set("limit", String(params.limit));
			const endpoint = `/api/device/${deviceId}/sync-runs${query.toString() ? `?${query.toString()}` : ""}`;
			const response = await hrisApiClient.get<any>(endpoint);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to load device sync runs");
			return data as DeviceSyncRunsResponse;
		} catch (error: any) {
			console.error("Error loading device sync runs:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error loading device sync runs",
			);
		}
	}

	async getDeviceActivity(
		deviceId: string,
		params: {
			limit?: number;
			status?: string;
			source?: string;
			runId?: string;
			search?: string;
		} = {},
	): Promise<DeviceActivityResponse> {
		try {
			if (!String(deviceId || "").trim()) throw new Error("Device is required");
			const query = new URLSearchParams();
			if (params.limit) query.set("limit", String(params.limit));
			if (params.status && params.status !== "all") query.set("status", params.status);
			if (params.source && params.source !== "all") query.set("source", params.source);
			if (params.runId && params.runId !== "all") query.set("runId", params.runId);
			if (params.search) query.set("search", params.search);
			const endpoint = `/api/device/${deviceId}/activity${query.toString() ? `?${query.toString()}` : ""}`;
			const response = await hrisApiClient.get<any>(endpoint);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to load device activity");
			return data as DeviceActivityResponse;
		} catch (error: any) {
			console.error("Error loading device activity:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error loading device activity",
			);
		}
	}

	async backfillDeviceUsers(deviceId: string): Promise<any> {
		try {
			if (!String(deviceId || "").trim()) throw new Error("Device is required");
			const response = await hrisApiClient.post<any>(
				`/api/device/${deviceId}/users/backfill`,
				{},
			);
			return response.data?.data || response.data;
		} catch (error: any) {
			console.error("Error backfilling device users:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error backfilling device users",
			);
		}
	}

	async linkDeviceUser(deviceUserId: string, employeeId: string): Promise<DeviceUser> {
		try {
			const response = await hrisApiClient.post<any>(
				`/api/device/users/${deviceUserId}/link`,
				{
					employeeId,
				},
			);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to link device user");
			return data as DeviceUser;
		} catch (error: any) {
			console.error("Error linking device user:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error linking device user",
			);
		}
	}

	async unlinkDeviceUser(deviceUserId: string): Promise<DeviceUser> {
		try {
			const response = await hrisApiClient.post<any>(
				`/api/device/users/${deviceUserId}/unlink`,
				{},
			);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to unlink device user");
			return data as DeviceUser;
		} catch (error: any) {
			console.error("Error unlinking device user:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error unlinking device user",
			);
		}
	}

	async getDeviceUserPhoto(deviceUserId: string): Promise<Blob> {
		try {
			if (!String(deviceUserId || "").trim()) throw new Error("Device user is required");
			const token =
				typeof window !== "undefined" ? window.localStorage.getItem("authToken") : null;
			const endpoint = `/api/device/users/${deviceUserId}/photo`;
			const url = resolveApiUrl(getRuntimeApiBase() || "/api", endpoint);
			const response = await fetch(url, {
				method: "GET",
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			});
			if (!response.ok) {
				let message = "Failed to load device user photo";
				try {
					const data = await response.json();
					message = data?.message || data?.error || message;
				} catch {
					// Ignore JSON parse errors for binary/image responses.
				}
				throw new Error(message);
			}
			return await response.blob();
		} catch (error: any) {
			console.error("Error loading device user photo:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error loading device user photo",
			);
		}
	}

	/**
	 * Search devices by name or address
	 * @param query Search term
	 * @param params Optional query parameters
	 * @returns Promise<DevicesResponse> - Devices response
	 */
	async searchDevices(query: string, params?: ApiQueryParams): Promise<DevicesResponse> {
		return this.search(query)
			.setParams(params || {})
			.getDevices();
	}

	/**
	 * Get devices grouped by a specific field
	 * @param groupBy Field to group by
	 * @param params Optional query parameters
	 * @returns Promise<DevicesResponse> - Devices response
	 */
	async getDevicesGrouped(groupBy: string, params?: ApiQueryParams): Promise<DevicesResponse> {
		return this.setParams({
			...params,
			groupBy,
		}).getDevices();
	}

	/**
	 * Enroll a single user to device and sync employee.deviceEmpId
	 */
	async enrollDeviceUser(payload: EnrollDeviceUserRequest): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>("/api/device/enroll", payload);
			if (!response.data) {
				throw new Error("Failed to enroll user to device");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error enrolling user to device:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error enrolling user to device",
			);
		}
	}

	async copyHikvisionDeviceUserToPeer(payload: HikvisionCopyUserRequest): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>(
				"/api/device/hikvision/copy-user",
				payload,
			);
			if (!response.data) {
				throw new Error("Failed to copy Hikvision device user");
			}
			return response.data?.data || response.data;
		} catch (error: any) {
			console.error("Error copying Hikvision device user:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error copying Hikvision device user",
			);
		}
	}

	async mirrorHikvisionFaceToPeers(payload: HikvisionMirrorFaceRequest): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>(
				"/api/device/hikvision/mirror-face",
				payload,
			);
			if (!response.data) throw new Error("Failed to mirror Hikvision face");
			return response.data?.data || response.data;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Failed to mirror Hikvision face",
			);
		}
	}

	async mockHikvisionFingerprintTally(payload: HikvisionMockFingerprintRequest): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>(
				"/api/device/hikvision/mock-fingerprint",
				payload,
			);
			if (!response.data) {
				throw new Error("Failed to apply synthetic fingerprint tally");
			}
			return response.data?.data || response.data;
		} catch (error: any) {
			console.error("Error applying synthetic fingerprint tally:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error applying synthetic fingerprint tally",
			);
		}
	}

	async mockHikvisionFaceTally(payload: HikvisionMockFaceRequest): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>(
				"/api/device/hikvision/mock-face",
				payload,
			);
			if (!response.data) {
				throw new Error("Failed to apply synthetic face tally");
			}
			return response.data?.data || response.data;
		} catch (error: any) {
			console.error("Error applying synthetic face tally:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error applying synthetic face tally",
			);
		}
	}

	async triggerZktecoAttendanceSync(payload: ZktecoAttendanceSyncRequest = {}): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>("/api/device/zkteco/sync", payload);
			if (!response.data) {
				throw new Error("Failed to start ZKTeco sync");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error starting ZKTeco sync:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error starting ZKTeco sync",
			);
		}
	}

	async triggerHikvisionAttendanceImport(payload: {
		deviceId: string;
		skipMissingEmployeeNo?: boolean;
		targetImportCount?: number | null;
		targetAttendanceCount?: number | null;
		targetOperationsCount?: number | null;
		includeAttendance?: boolean;
		includeOperations?: boolean;
		timeWindow?: "all" | "7d" | "30d" | "90d" | string;
	}): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>("/api/device/hikvision/sync", payload);
			if (!response.data) {
				throw new Error("Failed to start device log sync");
			}
			return response.data?.data || response.data;
		} catch (error: any) {
			console.error("Error starting Hikvision sync:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error starting device log sync",
			);
		}
	}

	async getDeviceImportJob(jobId: string): Promise<DeviceImportJobProgress> {
		try {
			if (!String(jobId || "").trim()) throw new Error("Import job is required");
			const response = await hrisApiClient.get<any>(`/api/device/import-jobs/${jobId}`);
			const progress = response.data?.data || response.data;
			if (!progress) throw new Error("Import job was not found");
			return progress as DeviceImportJobProgress;
		} catch (error: any) {
			console.error("Error loading device import job:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error loading import progress",
			);
		}
	}

	async cancelDeviceImportJob(jobId: string): Promise<DeviceImportJobProgress> {
		try {
			if (!String(jobId || "").trim()) throw new Error("Import job is required");
			const response = await hrisApiClient.post<any>(
				`/api/device/import-jobs/${jobId}/cancel`,
				{},
			);
			const progress = response.data?.data || response.data;
			if (!progress) throw new Error("Import job was not found");
			return progress as DeviceImportJobProgress;
		} catch (error: any) {
			console.error("Error cancelling device import job:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error cancelling import job",
			);
		}
	}

	async resetDeviceEvents(payload: DeviceEventsResetScope): Promise<DeviceEventsResetResponse> {
		try {
			const response = await hrisApiClient.post<any>("/api/device/events/reset", payload);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to reset saved device events");
			return data as DeviceEventsResetResponse;
		} catch (error: any) {
			console.error("Error resetting device events:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error resetting saved device events",
			);
		}
	}

	async getHikvisionListenerStatus(): Promise<HikvisionListenerStatus> {
		try {
			// Cap client wait so the Listener modal never spins forever if SSH stalls.
			const response = await hrisApiClient.get<any>("/api/device/hikvision/listener", {
				timeoutMs: 8000,
			} as any);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to load Hikvision listener status");
			return data as HikvisionListenerStatus;
		} catch (error: any) {
			console.error("Error loading Hikvision listener status:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error loading Hikvision listener status",
			);
		}
	}

	async controlHikvisionListener(
		action: HikvisionListenerAction,
	): Promise<HikvisionListenerControlResponse> {
		try {
			const response = await hrisApiClient.post<any>("/api/device/hikvision/listener", {
				action,
			});
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to control Hikvision listener");
			return data as HikvisionListenerControlResponse;
		} catch (error: any) {
			console.error("Error controlling Hikvision listener:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error controlling Hikvision listener",
			);
		}
	}

	/**
	 * Import device enrollment data from a file
	 * @param file File to import (CSV/XLSX)
	 * @returns Promise<any> - Import summary
	 */
	async importDeviceEnrollment(file: File): Promise<any> {
		try {
			const formData = new FormData();
			formData.append("file", file);

			const response = await hrisApiClient.post<any>("/api/device/enroll/import", formData);

			if (!response.data) {
				throw new Error("Failed to import device enrollment");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error importing device enrollment:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error importing device enrollment",
			);
		}
	}
}

// Export singleton instance
const devicesService = new DevicesService();

export default devicesService;
