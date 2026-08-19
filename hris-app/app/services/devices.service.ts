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
	panelSelectStatus?: {
		code?: string | null;
		label?: string | null;
		present?: boolean;
	} | null;
	errorMessage?: string | null;
	searchMatch?: {
		field: string;
		label: string;
		value: string;
		matchType: "exact" | "starts_with" | "contains";
		rank: number;
	} | null;
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
		byActionCategory?: Partial<
			Record<
				DeviceEventAction | string,
				Partial<Record<DeviceEventCategory | string, number>>
			>
		>;
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

export type HikvisionDeviceTimeSnapshot = {
	localTime: string | null;
	timeMode: string | null;
	timeZone: string | null;
	skewSeconds: number | null;
};

export type HikvisionDeviceTimeSyncResponse = {
	execute: boolean;
	wrote: boolean;
	device: { id: string; name: string };
	serverTime: string;
	manilaTime: string;
	before: HikvisionDeviceTimeSnapshot;
	plannedWrite: {
		timeMode: string;
		localTime: string;
		timeZone: string;
	};
	after: HikvisionDeviceTimeSnapshot | null;
	putFormat?: "json" | "xml";
};

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
	fingerprintRawPresent?: number;
	fingerprintRawMissing?: number;
	fingerprintTemplateReportedTotal?: number;
	fingerprintEnvelopePresent?: number;
	fingerprintEnvelopeMissing?: number;
	staleHrisOnlyRows?: number;
	staleFingerprintReported?: number;
	staleFingerprintRawPresent?: number;
	staleFingerprintRawBlobCount?: number;
	staleFingerprintRawMissing?: number;
	faceReported?: number;
	faceRawPresent?: number;
	faceRawMissing?: number;
	faceTemplateReportedTotal?: number;
	faceEnvelopePresent?: number;
	faceEnvelopeMissing?: number;
	staleFaceReported?: number;
	staleFaceRawPresent?: number;
	staleFaceRawMissing?: number;
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
	syncDecisionMatrix?: DeviceUserSyncDecisionMatrix;
}

export type DeviceUserSyncDecisionBucketKey =
	| "missing_device_user_record"
	| "missing_employee_link"
	| "missing_raw_fingerprint_blob"
	| "missing_raw_face_blob"
	| "already_present"
	| "stale_count_only_or_live_no_data"
	| "unsupported_by_sync";

export interface DeviceUserSyncDecisionBucket {
	key: DeviceUserSyncDecisionBucketKey;
	label: string;
	count: number;
	why: string;
	canSyncCreate: boolean;
	defaultIncluded: boolean;
	filter: string;
}

export interface DeviceUserSyncDecisionMatrix {
	buckets: DeviceUserSyncDecisionBucket[];
	counts: Record<DeviceUserSyncDecisionBucketKey, number>;
	selectedFastPlan: DeviceUserSyncMode;
	selectedFastPlanReason: string;
	sourceReadRequired: boolean;
	sourceReadReason: string;
	jobStages: string[];
}

export interface DeviceUserSyncExecutionPlan {
	mode?: DeviceUserSyncMode;
	dryRun?: boolean;
	willCreateJob?: boolean;
	selectedDeviceCount?: number;
	selectedDevices?: string[];
	sourceReadRequired?: boolean;
	sourceReadSkipped?: boolean;
	sourceReadReason?: string;
	steps?: string[];
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
	status:
		| "Ready"
		| "Needs review"
		| "Unavailable"
		| "No new rows"
		| "Partial"
		| "Failed"
		| string;
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
		quick?: boolean;
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
	status:
		| "idle"
		| "listening"
		| "reconciling"
		| "importing"
		| "adjusting"
		| "failed"
		| "completed"
		| "running"
		| string;
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
	attendanceSourceTotal?: number | null;
	operationSourceTotal?: number | null;
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
	sourceGroup?: string;
	from?: string | null;
	to?: string | null;
	startTime?: string | null;
	endTime?: string | null;
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

export type DeviceUserSyncMode =
	| "full_refresh"
	| "needs_attention_only"
	| "peer_converge"
	| "biometrics_only";

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
		validDeviceIds?: string[];
		failedDeviceIds?: string[];
		idsReadByDevice?: Record<string, number>;
		devices: Array<{
			id: string;
			name?: string | null;
			address?: string | null;
			port?: number | null;
			readStatus?: "ok" | "failed" | string | null;
			readError?: string | null;
			idsRead?: number | null;
		}>;
		users: Array<{
			key: string;
			sourceDeviceId: string;
			targetDeviceIds: string[];
			employeeId?: string | null;
			employee?: { id?: string; employeeId?: string | null; fullName?: string | null } | null;
			vendorUserIds: string[];
			records: any[];
			sourceRows?: number;
			duplicateSourceRows?: Array<{
				deviceId: string;
				deviceName: string;
				vendorUserId: string;
				sourceRows: number;
				keptRecordId?: string | null;
				duplicateRecordIds?: string[];
				differingFields?: DeviceUserMergeField[];
			}>;
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
			sourceRows?: number;
			dedupedDeviceRecords?: number;
			duplicateSourceRows?: number;
			conflicts: number;
			missing: number;
			ambiguous?: number;
			missingHrisLinks?: number;
			credentialWrites?: number;
			actionableCredentialWrites?: number;
			blockedCredentialWrites?: number;
			validDevices?: number;
			failedDevices?: number;
		};
		plannedWrites?: Array<{ userKey: string; targetDeviceId: string }>;
		credentialWrites?: Array<{
			id: string;
			userKey: string;
			vendorUserId: string;
			modality: "fingerprint" | "face" | "card";
			sourceDeviceId: string | null;
			targetDeviceId: string;
			sourceReportedCount: number;
			targetReportedCount: number;
			sourceEvidenceStatus: string;
			recommended: boolean;
			recommendationReason: string;
			executionEligibility: "ready_from_raw_blob" | "sdk_probe_required" | "blocked";
			blockingReason?: string | null;
			recoveryStage?: string | null;
			recoveryClassification?:
				| "ready_to_write"
				| "recovery_needed"
				| "physical_action_required";
			sourceCandidateDeviceIds: string[];
		}>;
		potentialOperations?: {
			totalPotentialOperations: number;
			byModality: {
				fingerprint: number;
				face: number;
				card: number;
			};
			byRecoveryStage: Record<string, number>;
			alreadyConverged: number;
			physicalBoundaryOperations: number;
		};
		errors: Array<{ deviceId: string; deviceName: string; error: string }>;
		sdkErrors?: Array<{ deviceId: string; deviceName: string; error: string }>;
		unreachableDevices?: Array<{ deviceId: string; deviceName: string; error: string }>;
		ambiguousMatches?: Array<{ deviceId?: string; deviceName?: string; candidates?: string[] }>;
	};
};

export type DeviceUserMergeRequest = {
	deviceIds: string[];
};

export interface DeviceUserMergeJobProgress {
	jobId: string;
	requestId?: string;
	planId: string;
	mode?: "users" | "credentials";
	scopeHash?: string;
	retryPlanId?: string;
	status: "processing" | "completed" | "failed";
	totalWrites: number;
	processedWrites: number;
	successfulWrites: number;
	alreadyConvergedWrites?: number;
	failedWrites: number;
	message: string;
	currentStage?: string;
	executionLocation?: string;
	heartbeatAt?: string;
	currentUserKey?: string | null;
	currentTargetDeviceId?: string | null;
	writeMatrix?: {
		mode?: "users" | "credentials";
		selectedUniqueIds?: number;
		selectedCredentialWrites?: number;
		totalWrites: number;
		fingerprintGaps?: number;
		faceGaps?: number;
		fingerprintWrites?: number;
		faceWrites?: number;
		blockedWrites?: number;
		conflicts?: number;
		perTarget?: Array<{
			deviceId: string;
			deviceName: string;
			writes: number;
			sourceDeviceIds: string[];
		}>;
		perSource?: Array<{
			deviceId: string;
			deviceName: string;
			selectedUniqueIds: number;
			writes: number;
		}>;
		rows?: Array<{
			userKey: string;
			vendorUserIds: string[];
			sourceDeviceId: string;
			sourceDeviceName: string;
			targetDeviceIds: string[];
			targetDeviceNames: string[];
			writes: number;
			fingerprintSourceCount: number;
			fingerprintPresentDevices: number;
			fingerprintExpectedDevices: number;
			fingerprintGapDevices: number;
			faceSourceCount: number;
			facePresentDevices: number;
			faceExpectedDevices: number;
			faceGapDevices: number;
			conflicts: number;
		}>;
	};
	startingGapSummary?: DeviceUserCredentialGapSummary;
	endingGapSummary?: DeviceUserCredentialGapSummary;
	gapDelta?: DeviceUserCredentialGapSummary;
	results: Array<{
		userKey?: string;
		vendorUserId?: string;
		sourceDeviceId?: string;
		sourceDeviceName?: string;
		targetDeviceId?: string;
		targetDeviceName?: string;
		modality?: "fingerprint" | "face" | "card" | null;
		sourceReportedCount?: number | null;
		targetReportedCount?: number | null;
		actualCount?: number | null;
		status: "success" | "error" | string;
		strategy?: string | null;
		error?: string | null;
		operationTelemetry?: DeviceUserCredentialOperationTelemetry | null;
	}>;
	copyFailureSummary?: {
		total?: number;
		byPair?: Record<string, number>;
		byError?: Record<string, number>;
		latest?: {
			userKey?: string | null;
			vendorUserId?: string | null;
			source?: string;
			target?: string;
			error?: string;
			at?: string;
		};
	};
	progressEvents?: Array<{
		stage?: string;
		message?: string;
		at?: string;
		userKey?: string;
		vendorUserId?: string;
		sourceDeviceId?: string;
		sourceDeviceName?: string;
		targetDeviceId?: string;
		targetDeviceName?: string;
		strategy?: string | null;
		error?: string | null;
	}>;
	remainingConflicts?: number;
	remainingMissing?: number;
	attention?: number;
	error?: string | null;
	startedAt: string;
	updatedAt?: string;
	completedAt?: string;
}

export interface CredentialRecoveryError {
	code?: string;
	category?: string;
	message?: string;
	retryable?: boolean;
	observabilityDefect?: boolean;
	at?: string;
	durationMs?: number;
	stage?: string;
	sourceDeviceId?: string | null;
	targetDeviceId?: string | null;
	vendorUserId?: string | null;
	attempt?: number;
}

export interface CredentialRecoveryTask {
	id: string;
	taskKey: string;
	kind: string;
	modality?: string | null;
	sourceDeviceId?: string | null;
	targetDeviceId?: string | null;
	vendorUserId?: string | null;
	status: string;
	stage?: string | null;
	attempts: number;
	maxAttempts?: number;
	error?: CredentialRecoveryError | null;
	startedAt?: string | null;
	completedAt?: string | null;
	updatedAt: string;
}

export interface CredentialRecoveryJob {
	id: string;
	planId: string;
	scopeHash: string;
	status:
		| "pending"
		| "recovering"
		| "retrying"
		| "awaiting_replan"
		| "needs_attention"
		| "failed"
		| "completed"
		| string;
	currentStage?: string | null;
	currentTaskKey?: string | null;
	heartbeatAt?: string | null;
	lastAdvancementAt?: string | null;
	workerLeaseActive?: boolean;
	resumeCursor: number;
	/** Wave size locked at job start (default 20). Progress is for this wave, not full residual. */
	plannedWaveSize?: number;
	wouldWriteCount?: number;
	/** 0–100 weighted progress from API (stage floors + partial in-flight weight). */
	progressPercent?: number;
	/** Operator-facing English for currentStage (replan / capture / write). */
	progressLabel?: string | null;
	/** Short contract line: elapsed, task counts, why zeros may be honest. */
	progressDetail?: string | null;
	tasksByKind?: {
		sourceCapturePending?: number;
		sourceCaptureProcessing?: number;
		sourceCaptureSucceeded?: number;
		targetWritePending?: number;
		targetWriteSucceeded?: number;
	};
	progressWeights?: {
		verified?: number;
		failed?: number;
		writing?: number;
		awaitingPhysicalReread?: number;
		readyToWrite?: number;
		recovered?: number;
		recoveringNow?: number;
		weightedUnits?: number;
		waveDenominator?: number;
		stageFloor?: number;
		replanElapsedMs?: number;
	};
	counters?: {
		physicallyVerifiedRemaining?: number;
		recoveryNeeded?: number;
		readyToWrite?: number;
		recoveringNow?: number;
		writing?: number;
		awaitingPhysicalReread?: number;
		verified?: number;
		failed?: number;
		tasksTotal?: number;
		tasksPending?: number;
		tasksBlocked?: number;
		recovered?: number;
		retrying?: number;
		blocked?: number;
		replanStartedAt?: string;
		phase?: string;
		replanElapsedMs?: number;
	};
	latestError?: CredentialRecoveryError | null;
	activeTask?: CredentialRecoveryTask | null;
	latestFailedTask?: CredentialRecoveryTask | null;
	tasks?: CredentialRecoveryTask[];
	startedAt?: string | null;
	completedAt?: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface DeviceUserCredentialGapSummary {
	total?: number;
	modalities?: {
		fingerprint?: number;
		face?: number;
		card?: number;
	};
	perTarget?: Record<
		string,
		{
			total?: number;
			fingerprint?: number;
			face?: number;
			card?: number;
		}
	>;
}

export interface DeviceUserCredentialOperationTelemetry {
	requestId: string;
	jobId: string;
	operationId: string;
	planId: string;
	scopeHash: string;
	organization: string;
	vendorUserId?: string | null;
	modality?: "fingerprint" | "face" | "card" | null;
	sourceDeviceId?: string | null;
	sourcePhysicalTarget?: string | null;
	targetDeviceId?: string | null;
	targetPhysicalTarget?: string | null;
	writerStrategy?: string | null;
	buildAttestation?: string | null;
	capabilityEvidenceChecksum?: string | null;
	stage: string;
	attempt: number;
	startedAt: string;
	updatedAt: string;
	endedAt?: string | null;
	durationMs?: number | null;
	sdkProgressStatus?: number | null;
	sdkLastError?: number | null;
	isapiStatus?: number | null;
	safeResponseClassification?: string | null;
	preWriteCount?: number | null;
	preWriteChecksum?: string | null;
	postWriteCount?: number | null;
	postWriteChecksum?: string | null;
	physicalRereadResult?: string | null;
	namedCause?: string | null;
	retryDecision?: string | null;
	executionLocation?: string | null;
}

export type DeviceUserMergeApplyPayload = {
	planId: string;
	mode?: "users" | "credentials";
	choices?: Record<string, Partial<Record<DeviceUserMergeField, "A" | "B" | "KEEP">>>;
	applyAll?: "A" | "B";
	selectedUserKeys?: string[];
	selectedCredentialWriteIds?: string[];
	expectedScopeHash?: string;
};

export interface DeviceUserSyncJobStartRequest {
	mode?: DeviceUserSyncMode;
	deviceIds?: string[];
	dryRun?: boolean;
}

export interface DeviceUserSyncJobProgress {
	jobId: string;
	status: "processing" | "completed" | "failed" | "cancelled";
	syncMode?: DeviceUserSyncMode;
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
	cancelRequestedAt?: string;
	stale?: boolean;
	results: Array<{
		deviceId: string;
		deviceName: string;
		status: "success" | "needs_attention" | "error" | "cancelled";
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

export type DeviceLiveReadinessLevel = "green" | "yellow" | "red";

export interface DeviceLiveReadinessCheck {
	id: "database" | "liveCapture" | "eventProof";
	level: DeviceLiveReadinessLevel;
	ok: boolean;
	label: string;
	detail: string;
}

/** Truthful RYG for tap + enroll (DB + listener + proof). Armed alone is not green. */
export interface DeviceLiveReadiness {
	checkedAt: string;
	overall: DeviceLiveReadinessLevel;
	headline: string;
	safeToTap: boolean;
	safeToEnroll: boolean;
	reasons: string[];
	checks: DeviceLiveReadinessCheck[];
	database: {
		ok: boolean;
		latencyMs: number | null;
		error: string | null;
	};
	listener: {
		running: boolean;
		armed: boolean;
		receiving: boolean;
		state: string | null;
		lastAlarmAt: string | null;
		lastPostAt: string | null;
	};
	proof: {
		lastSdkEventAt: string | null;
		ageMs: number | null;
		fresh: boolean;
		stale: boolean;
	};
	listenerStatus?: {
		running?: boolean;
		status?: string;
		checkedAt?: string;
		error?: string | null;
		vm?: { host?: string; user?: string; path?: string };
	} | null;
}

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

export interface DeviceUserSyncJobStartResponse {
	mode?: "dry_run" | string;
	jobId?: string | null;
	willCreateJob?: boolean;
	progress?: DeviceUserSyncJobProgress;
	decisionMatrix?: DeviceUserSyncDecisionMatrix | null;
	executionPlan?: DeviceUserSyncExecutionPlan | null;
}

export interface DeleteDeviceUserRequest {
	deviceId: string;
	vendorUserId: string;
	execute?: boolean;
	confirmation?: string;
}

export interface DeleteDeviceUserResponse {
	device?: Pick<Device, "id" | "name" | "address" | "protocol">;
	vendorUserId: string;
	execute: boolean;
	before?: {
		hrisFound: boolean;
		sourceFound: boolean;
		sourceMatchCount: number;
		hrisDeviceUser?: DeviceUser | null;
		sourceUsers?: any[];
	};
	after?: {
		hrisFound: boolean;
		sourceFound: boolean;
		sourceMatchCount: number;
		sourceUsers?: any[];
	};
	sourceDelete?: any;
	hrisDelete?: any;
	requiresConfirmation?: string;
}

export interface DeleteDeviceUsersRequest {
	deviceId: string;
	vendorUserIds: string[];
	execute?: boolean;
}

export interface DeleteDeviceUsersResponse {
	device?: Pick<Device, "id" | "name" | "address" | "protocol">;
	execute: boolean;
	requested: number;
	previewed?: number;
	deleted: number;
	failed: number;
	results: Array<{
		vendorUserId: string;
		ok: boolean;
		status?: number;
		message?: string;
		data?: DeleteDeviceUserResponse;
	}>;
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
	rawBiometricPackage?: boolean;
	refreshSourceUsers?: boolean;
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
	rawBiometricPackage?: {
		present: boolean;
		requiredForPortableTemplateImport?: boolean;
		status?: string;
		reason?: string;
		plaintextPolicy?: string;
		users?: Array<{
			sourceDeviceId: string;
			vendorUserId: string;
			source?: string;
			fingerprintStatus?: string;
			fingerprintRawBlobCount?: number;
			faceStatus?: string;
			faceRawBlobPresent?: boolean;
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
			firmware?: string | null;
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
			fingerprintRawBlobsCaptured: number;
			faceCountReported: number;
			faceRawBlobsCaptured: number;
			captureFailures: number;
			portableRawPackageReady: boolean;
		};
	};
}

export interface DeviceUserImportPreviewRequest {
	targetDeviceId: string;
	payload: DeviceUserExportPayload;
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
	rawBiometricPackage?: {
		present: boolean;
		requiredForPortableTemplateImport?: boolean;
		status?: string;
		plaintextExposed?: boolean;
		rawFingerprintBlobCount?: number;
		rawFaceBlobCount?: number;
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
	biometricTransferMode?: "sdkPeerCopy" | "metadataOnly" | "rawPackage";
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
	plaintextBiometricExposed: boolean;
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
	processed?: number;
	message: string;
	progressLabel?: string | null;
	progressPercent?: number | null;
	progressWeights?: {
		waveNumerator?: number;
		waveDenominator?: number;
		stages?: Array<{ key: string; weight: number; label: string }>;
	} | null;
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

	async getDeviceEventById(eventId: string): Promise<DeviceEventsResponse> {
		const id = String(eventId || "").trim();
		if (!id) {
			throw new Error("Event id is required");
		}
		try {
			const response = await hrisApiClient.get<any>(`/api/device/events/item/${encodeURIComponent(id)}`);
			let eventsData: any = response?.data ?? response;
			if (eventsData && typeof eventsData === "object" && "data" in eventsData && !Array.isArray(eventsData.events)) {
				const nested = (eventsData as { data?: unknown }).data;
				if (nested && typeof nested === "object") {
					eventsData = nested;
				}
			}
			const rawEvents =
				(Array.isArray(eventsData?.events) && eventsData.events) ||
				(eventsData?.id ? [eventsData] : []) ||
				[];
			return {
				events: rawEvents,
				summary: eventsData?.summary,
				pagination: eventsData?.pagination,
			};
		} catch (error: any) {
			console.error("Error fetching device event by id:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching device event",
			);
		}
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
			// ApiClient returns the full envelope `{ success, data, ... }`. Unwrap once
			// (and tolerate a rare double-wrap) so list pages never get total>0 with [] rows.
			let eventsData: any = response?.data ?? response;
			if (eventsData && typeof eventsData === "object" && "data" in eventsData && !Array.isArray(eventsData.events)) {
				const nested = (eventsData as { data?: unknown }).data;
				if (nested && typeof nested === "object") {
					eventsData = nested;
				}
			}

			const rawEvents =
				(Array.isArray(eventsData?.events) && eventsData.events) ||
				(Array.isArray(eventsData?.items) && eventsData.items) ||
				(Array.isArray(eventsData?.rows) && eventsData.rows) ||
				(Array.isArray(eventsData) && eventsData) ||
				[];

			const pagination =
				eventsData?.pagination && typeof eventsData.pagination === "object"
					? eventsData.pagination
					: undefined;

			return {
				events: rawEvents,
				summary: eventsData?.summary || {
					total: Number(pagination?.total || 0),
					byCategory: {},
					byAction: {},
					byActionCategory: {},
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
				pagination,
			};
		} catch (error: any) {
			console.error("Error fetching device events:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching device events",
			);
		}
	}

	async getDeviceHealth(
		deviceId: string,
		options: { quick?: boolean; timeoutMs?: number; signal?: AbortSignal } = {},
	): Promise<DeviceHealthResponse> {
		try {
			if (!String(deviceId || "").trim()) {
				throw new Error("Select a device before checking health");
			}
			const response = await hrisApiClient.get<any>(
				`/api/device/${deviceId}/health`,
				options.quick ? ({ quick: "true" } as any) : undefined,
				{ timeoutMs: options.timeoutMs ?? 6000, signal: options.signal },
			);
			let healthData = response.data;
			if (healthData && typeof healthData === "object" && "data" in healthData) {
				healthData = healthData.data;
			}
			if (!healthData) {
				throw new Error("Failed to check device health");
			}
			return healthData as DeviceHealthResponse;
		} catch (error: any) {
			if (options.signal?.aborted) throw error;
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error checking device health",
			);
		}
	}

	async getDeviceSyncPreview(
		params: { deviceId?: string; source?: string; quick?: boolean } = {},
		options: { signal?: AbortSignal } = {},
	): Promise<DeviceSyncPreviewResponse> {
		try {
			const query = new URLSearchParams();
			if (params.deviceId && params.deviceId !== "all")
				query.set("deviceId", params.deviceId);
			if (params.source && params.source !== "all") query.set("source", params.source);
			if (params.quick) query.set("quick", "true");
			const endpoint = `/api/device/sync-preview${query.toString() ? `?${query.toString()}` : ""}`;
			// The server's bounded parallel quick reads can settle just above 8s on
			// six panels. Keep the client budget above that contract.
			const response = await hrisApiClient.get<any>(endpoint, undefined, {
				timeoutMs: 15_000,
				signal: options.signal,
			});
			const previewData = response.data?.data || response.data;
			if (!previewData) {
				throw new Error("Failed to build device sync preview");
			}
			return previewData as DeviceSyncPreviewResponse;
		} catch (error: any) {
			if (options.signal?.aborted) throw error;
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

	/** Pull raw ISAPI fingerData for one plain person and store on DeviceUser. */
	async captureDeviceUserRawFingerprints(
		deviceId: string,
		vendorUserId: string,
	): Promise<{ capture: any; deviceUser: DeviceUser | null }> {
		const device = String(deviceId || "").trim();
		const person = String(vendorUserId || "").trim();
		if (!device || !person) throw new Error("deviceId and vendorUserId required");
		const response = await hrisApiClient.post<any>(
			`/api/device/${device}/users/${encodeURIComponent(person)}/raw-fingerprints/capture`,
			{},
		);
		const data = response.data?.data || response.data;
		return {
			capture: data?.capture || null,
			deviceUser: (data?.deviceUser as DeviceUser) || null,
		};
	}

	async captureDeviceUserRawFace(
		deviceId: string,
		vendorUserId: string,
	): Promise<{ capture: any; deviceUser: DeviceUser | null }> {
		const device = String(deviceId || "").trim();
		const person = String(vendorUserId || "").trim();
		if (!device || !person) throw new Error("deviceId and vendorUserId required");
		const response = await hrisApiClient.post<any>(
			`/api/device/${device}/users/${encodeURIComponent(person)}/raw-face/capture`,
			{},
		);
		const data = response.data?.data || response.data;
		return {
			capture: data?.capture || null,
			deviceUser: (data?.deviceUser as DeviceUser) || null,
		};
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
				biometricTransferMode:
					payload.biometricTransferMode ||
					(payload.payload?.rawBiometricPackage?.present ? "rawPackage" : "sdkPeerCopy"),
				runAsJob: payload.runAsJob === true,
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
	): Promise<DeviceUserSyncJobStartResponse> {
		try {
			const response = await hrisApiClient.post<any>("/api/device/users/sync-jobs", payload);
			const data = response.data?.data || response.data;
			if (!data?.jobId && data?.mode !== "dry_run") {
				throw new Error("Failed to start device-user sync");
			}
			return data as DeviceUserSyncJobStartResponse;
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
				{ timeoutMs: 300_000 },
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

	async startHikvisionSdkUserMergeJob(payload: DeviceUserMergeApplyPayload): Promise<{
		jobId: string | null;
		scopeHash: string;
		progress?: DeviceUserMergeJobProgress;
		review: any;
		nothingToWrite?: boolean;
		decisionsRecorded?: boolean;
		pathHint?: string;
		message?: string;
	}> {
		try {
			const reviewResponse = await hrisApiClient.post<any>(
				"/api/device/hikvision/sdk-users/merge/review",
				payload,
			);
			const review = reviewResponse.data?.data || reviewResponse.data;
			if (!review?.scopeHash) throw new Error("Merge scope review returned no scope hash");
			const response = await hrisApiClient.post<any>(
				"/api/device/hikvision/sdk-users/merge/jobs",
				{ ...payload, expectedScopeHash: review.scopeHash },
			);
			const data = response.data?.data || response.data;
			const message =
				response.data?.message ||
				response.data?.data?.message ||
				(typeof response.data === "string" ? response.data : undefined);
			// Executable scope with zero physical peer creates and zero profile overlays
			// (e.g. KEEP-only or biometric decisions only) returns 200 nothingToWrite —
			// not a 409 hard failure and not a job id.
			if (data?.nothingToWrite) {
				return {
					jobId: null,
					scopeHash: String(data.scopeHash || review.scopeHash),
					review,
					nothingToWrite: true,
					decisionsRecorded: data.decisionsRecorded !== false,
					pathHint: data.pathHint,
					message:
						message ||
						"Nothing physical to write; decisions are aligned or require credential-mode raw custody.",
				};
			}
			if (!data?.jobId) throw new Error("Failed to start SDK user merge job");
			if (data.scopeHash !== review.scopeHash) {
				throw new Error("Started merge scope does not match the reviewed scope");
			}
			return { ...data, review, message };
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

	async startHikvisionCredentialRecoveryJob(
		planId: string,
		options?: {
			maxVerifiedWrites?: number;
			canaryModality?: "fingerprint" | "face" | null;
		},
	): Promise<CredentialRecoveryJob> {
		try {
			// Residual default 20: stable wave size. Hard max 50 (API ceiling).
			// Historical UI bug used 1 write/job — looked like no progress.
			const maxVerifiedWrites = Math.max(
				1,
				Math.min(50, Number(options?.maxVerifiedWrites ?? 20) || 20),
			);
			const canaryModality =
				options?.canaryModality === "face" || options?.canaryModality === "fingerprint"
					? options.canaryModality
					: "fingerprint";
			const reviewResponse = await hrisApiClient.post<any>(
				"/api/device/hikvision/sdk-users/merge/recovery/review",
				{ planId, canaryModality, maxVerifiedWrites },
			);
			const review = reviewResponse.data?.data || reviewResponse.data;
			if (!review?.scopeHash) throw new Error("Recovery review returned no scope hash");
			const wouldWrite =
				Number(review?.executionPreview?.wouldWriteCount ?? 0) || maxVerifiedWrites;
			const response = await hrisApiClient.post<any>(
				"/api/device/hikvision/sdk-users/merge/recovery/jobs",
				{
					planId,
					expectedScopeHash: review.scopeHash,
					maxVerifiedWrites,
					canaryModality,
					// Explicit execute (not dry-run)
					execute: true,
					dryRun: false,
				},
			);
			const data = response.data?.data || response.data;
			if (!data?.job?.id) throw new Error("Recovery job did not return a durable job ID");
			const job = data.job as CredentialRecoveryJob & {
				plannedWaveSize?: number;
				wouldWriteCount?: number;
			};
			// Surface planned wave so FE progress is not misread as "full residual".
			job.plannedWaveSize = maxVerifiedWrites;
			job.wouldWriteCount = wouldWrite;
			return job;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Failed to start credential recovery",
			);
		}
	}

	async getHikvisionCredentialRecoveryJob(jobId: string): Promise<CredentialRecoveryJob> {
		try {
			const response = await hrisApiClient.get<any>(
				`/api/device/hikvision/sdk-users/merge/recovery/jobs/${encodeURIComponent(jobId)}`,
			);
			const data = response.data?.data || response.data;
			if (!data?.job) throw new Error("Credential recovery job was not found");
			return data.job as CredentialRecoveryJob;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Credential recovery job was not found",
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

	async deleteDeviceUser(payload: DeleteDeviceUserRequest): Promise<DeleteDeviceUserResponse> {
		try {
			const deviceId = String(payload.deviceId || "").trim();
			const vendorUserId = String(payload.vendorUserId || "").trim();
			if (!deviceId || !vendorUserId) throw new Error("Device and device user are required");
			const response = await hrisApiClient.post<any>(
				`/api/device/${deviceId}/users/${encodeURIComponent(vendorUserId)}/delete`,
				{
					execute: payload.execute === true,
					confirmation: payload.confirmation || "",
				},
			);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to delete device user");
			return data as DeleteDeviceUserResponse;
		} catch (error: any) {
			console.error("Error deleting device user:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error deleting device user",
			);
		}
	}

	async deleteDeviceUsers(payload: DeleteDeviceUsersRequest): Promise<DeleteDeviceUsersResponse> {
		try {
			const deviceId = String(payload.deviceId || "").trim();
			const vendorUserIds = Array.from(
				new Set(
					(payload.vendorUserIds || [])
						.map((value) => String(value || "").trim())
						.filter(Boolean),
				),
			);
			if (!deviceId || vendorUserIds.length === 0) {
				throw new Error("Device and selected device users are required");
			}
			const response = await hrisApiClient.post<any>(`/api/device/${deviceId}/users/delete`, {
				execute: payload.execute === true,
				vendorUserIds,
			});
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to delete selected device users");
			return data as DeleteDeviceUsersResponse;
		} catch (error: any) {
			console.error("Error deleting selected device users:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error deleting selected device users",
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

	/** Durable peer-copy job (face+FP can take minutes). Poll getHikvisionPeerCopyJob. */
	async startHikvisionPeerCopyJob(payload: HikvisionCopyUserRequest): Promise<{
		jobId: string;
		status?: string;
		progress?: any;
		pollPath?: string;
		hint?: string;
	}> {
		try {
			const response = await hrisApiClient.post<any>(
				"/api/device/hikvision/copy-user/jobs",
				payload,
			);
			const data = response.data?.data || response.data;
			if (!data?.jobId) {
				throw new Error("Failed to start Hikvision peer-copy job");
			}
			return data;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Failed to start Hikvision peer-copy job",
			);
		}
	}

	async getHikvisionPeerCopyJob(jobId: string): Promise<any> {
		try {
			const response = await hrisApiClient.get<any>(
				`/api/device/hikvision/copy-user/jobs/${encodeURIComponent(jobId)}`,
			);
			return response.data?.data || response.data;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Failed to read Hikvision peer-copy job",
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
		sourceGroup?: "all" | "attendance" | "operations" | "needsReview" | string;
		from?: string | null;
		to?: string | null;
		dryRun?: boolean;
		execute?: boolean;
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

	async syncHikvisionDeviceTime(payload: {
		deviceId: string;
		execute?: boolean;
	}): Promise<HikvisionDeviceTimeSyncResponse> {
		try {
			if (!String(payload.deviceId || "").trim()) {
				throw new Error("Select a device before updating time");
			}
			const response = await hrisApiClient.post<any>(
				`/api/device/${payload.deviceId}/time-sync`,
				{ execute: payload.execute === true },
			);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to update Hikvision time");
			return data as HikvisionDeviceTimeSyncResponse;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating Hikvision time",
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

	async getHikvisionListenerStatus(
		options: {
			signal?: AbortSignal;
		} = {},
	): Promise<HikvisionListenerStatus> {
		try {
			// Cap client wait so the Listener modal never spins forever if SSH stalls.
			const response = await hrisApiClient.get<any>(
				"/api/device/hikvision/listener",
				undefined,
				{ timeoutMs: 15_000, signal: options.signal },
			);
			const data = response.data?.data || response.data;
			if (!data) throw new Error("Failed to load Hikvision listener status");
			return data as HikvisionListenerStatus;
		} catch (error: any) {
			if (options.signal?.aborted) throw error;
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error loading Hikvision listener status",
			);
		}
	}

	/**
	 * Truthful readiness using endpoints that already work:
	 * - GET /api/device/events?limit=1 → proves DB + auth
	 * - GET /api/device/hikvision/listener → proves live capture service
	 * Does not depend on a dedicated route that can collide with /device/:id.
	 */
	async getDeviceLiveReadiness(): Promise<DeviceLiveReadiness> {
		const { buildClientDeviceLiveReadiness } =
			await import("../lib/device-live-readiness-client");

		let databaseOk = false;
		let databaseLatencyMs: number | null = null;
		let databaseError: string | null = null;
		let lastSdkEventAt: string | null = null;
		const dbStarted = Date.now();
		try {
			const events = await this.getDeviceEvents({
				page: 1,
				limit: 5,
				source: "EN_HCNETSDK_ALARM",
				sort: "eventTime",
				order: "desc",
			} as any);
			databaseOk = true;
			databaseLatencyMs = Date.now() - dbStarted;
			const first = events?.events?.[0] || (events as any)?.data?.events?.[0];
			lastSdkEventAt =
				(first?.receivedAt && String(first.receivedAt)) ||
				(first?.eventTime && String(first.eventTime)) ||
				null;
		} catch (error: any) {
			databaseOk = false;
			databaseLatencyMs = Date.now() - dbStarted;
			databaseError = String(
				error?.message || error?.data?.message || error || "database_or_auth_unreachable",
			).slice(0, 280);
		}

		let listener: HikvisionListenerStatus | null = null;
		let listenerError: string | null = null;
		try {
			listener = await this.getHikvisionListenerStatus();
		} catch (error: any) {
			listenerError = String(error?.message || error).slice(0, 200);
		}

		return buildClientDeviceLiveReadiness({
			databaseOk,
			databaseLatencyMs,
			databaseError: databaseError || listenerError,
			listener,
			listenerError,
			lastSdkEventAt: lastSdkEventAt || listener?.sdk?.lastAlarmAt || null,
		});
	}

	/**
	 * Prefer server prove (runs ensure-device-live-path.ps1 like predev: DB + reverse bridge
	 * + listener re-arm). Falls back to browser-only restart if API route unavailable.
	 */
	async proveDeviceLivePath(options?: { forceReArm?: boolean }): Promise<{
		proven: boolean;
		restartAttempted?: boolean;
		steps: Array<{ step: string; ok: boolean; detail: string }>;
		readiness: DeviceLiveReadiness;
		operatorHint?: string;
		message?: string;
	}> {
		const forceReArm = options?.forceReArm === true;
		// Primary: API does host ensure (tunnels) + optional listener re-arm.
		try {
			const response = await hrisApiClient.post<any>(
				"/api/device/events/live-readiness/prove",
				{ forceReArm },
				{ timeoutMs: 150_000 } as any,
			);
			const data = response.data?.data || response.data;
			if (data?.readiness) {
				const readiness = data.readiness as DeviceLiveReadiness;
				// Truth matrix: green readiness is proven even if ensure step noise lied.
				const readinessGreen =
					readiness.overall === "green" &&
					readiness.safeToTap === true &&
					readiness.safeToEnroll === true;
				return {
					proven: Boolean(data.proven) || readinessGreen,
					restartAttempted: Boolean(data.restartAttempted),
					steps: Array.isArray(data.steps) ? data.steps : [],
					readiness,
					operatorHint: readinessGreen
						? readiness.headline || "Safe to tap and enroll — realtime path is truthful"
						: data.operatorHint,
					message: response.data?.message || data.message,
				};
			}
		} catch (error: any) {
			// Fall through to client-only path if route missing / timeout
			console.warn(
				"Server live-path prove failed, falling back to client repair:",
				error?.message || error,
			);
		}

		const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
		let restartAttempted = false;
		const dbStarted = Date.now();
		try {
			await this.getDeviceEvents({ page: 1, limit: 1 } as any);
			steps.push({
				step: "database",
				ok: true,
				detail: `Authenticated events API OK (${Date.now() - dbStarted}ms)`,
			});
		} catch (error: any) {
			steps.push({
				step: "database",
				ok: false,
				detail: String(error?.message || "DB/auth failed").slice(0, 200),
			});
		}

		let listener: HikvisionListenerStatus | null = null;
		try {
			listener = await this.getHikvisionListenerStatus();
			const receiving = Boolean(listener.sdk?.receivingCallbacks);
			const armed = Boolean(listener.sdk?.armed);
			const state = String(listener.sdk?.state || "");
			const lastAlarm = listener.sdk?.lastAlarmAt
				? Date.parse(String(listener.sdk.lastAlarmAt))
				: NaN;
			const proofStale =
				!Number.isFinite(lastAlarm) || Date.now() - lastAlarm > 15 * 60 * 1000;
			steps.push({
				step: "listener_status",
				ok: Boolean(listener.running) && state !== "login_failed",
				detail: listener.running
					? `Listener ${listener.status} / sdk=${state} receiving=${receiving}`
					: listener.error || "Listener not running",
			});
			const shouldRestart =
				listener.control?.available &&
				(!listener.running ||
					state === "login_failed" ||
					forceReArm ||
					(!receiving && (proofStale || !armed)));
			if (shouldRestart) {
				restartAttempted = true;
				try {
					await this.controlHikvisionListener("restart");
					steps.push({
						step: "listener_restart",
						ok: true,
						detail: "Listener restart requested (client fallback — host tunnels not ensured)",
					});
					await new Promise((r) => setTimeout(r, 3500));
					listener = await this.getHikvisionListenerStatus();
					steps.push({
						step: "listener_status_after_restart",
						ok:
							Boolean(listener.running) &&
							String(listener.sdk?.state) !== "login_failed",
						detail: listener.running
							? `Listener ${listener.status} / sdk=${listener.sdk?.state}`
							: "Still not running after restart",
					});
				} catch (error: any) {
					steps.push({
						step: "listener_restart",
						ok: false,
						detail: String(error?.message || "Restart failed").slice(0, 200),
					});
				}
			}
		} catch (error: any) {
			steps.push({
				step: "listener_status",
				ok: false,
				detail: String(error?.message || "Listener status failed").slice(0, 200),
			});
		}

		const readiness = await this.getDeviceLiveReadiness();
		const proven =
			readiness.overall === "green" && readiness.safeToTap && readiness.safeToEnroll;

		return {
			proven,
			restartAttempted,
			steps,
			readiness,
			message: proven
				? "Live path prove passed — safe to tap and enroll for realtime"
				: "Live path prove incomplete — host ensure may have failed; try again or run predev",
			operatorHint: proven
				? "Tap TEST A once now; a TAP or SDK row should appear within a few seconds."
				: !readiness.database.ok
					? "Database tunnel still down — Keep ready will retry ensure-device-live-path.ps1."
					: String(readiness.listener?.state || "") === "login_failed" ||
						  !readiness.listener.running
						? "Reverse tunnel or device SDK login failed — Keep ready retries host bridge + listener."
						: readiness.proof.stale
							? "Listener re-armed if possible. Tap once for fresh proof."
							: "Review red/yellow readiness chips.",
		};
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
