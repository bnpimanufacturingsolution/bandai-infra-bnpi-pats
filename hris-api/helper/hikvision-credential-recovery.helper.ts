import { createHash } from "crypto";

export type CredentialRecoveryClassification =
	| "ready_to_write"
	| "recovery_needed"
	| "physical_action_required";

export type CredentialRecoveryErrorClassification = {
	code:
		| "database_transport"
		| "device_authentication"
		| "face_owner_card_association_missing"
		| "face_identity_association_unproven"
		| "face_writer_card_missing"
		| "face_writer_card_bind_failed"
		| "face_isolation_after_write"
		| "sdk_source_device_not_armed"
		| "sdk_export_event_missing"
		| "stored_face_sdk_failed"
		| "stored_face_sdk_crash"
		| "stored_face_sdk_wrapper_noise"
		| "stored_face_device_full"
		| "device_fp_write_rejected_progress"
		| "device_transport"
		| "device_request_rejected"
		| "worker_fencing"
		| "inventory_read_safety_gate"
		| "identity_safety"
		| "writer_capability"
		| "stale_scope"
		| "code_or_data_contract"
		| "unclassified";
	category:
		| "persistence"
		| "authentication"
		| "identity_custody"
		| "sdk_runtime"
		| "transport"
		| "concurrency"
		| "safety_gate"
		| "identity"
		| "capability"
		| "scope"
		| "implementation"
		| "device_apply"
		| "observability";
	message: string;
	retryable: boolean;
	observabilityDefect: boolean;
};

export const selectObsoleteCredentialRecoverySourceTaskIds = (
	pendingTasks: Array<{ id: string; taskKey: string }>,
	currentTaskKeys: ReadonlySet<string>,
) =>
	pendingTasks
		.filter((task) => !currentTaskKeys.has(String(task.taskKey)))
		.map((task) => String(task.id));

export const recoveredCustodyCanUnlockWrite = (
	modality: unknown,
	result: Record<string, unknown> | null | undefined,
) => {
	if (String(modality) === "fingerprint") {
		return Number(result?.fingerprintCount || 0) > 0;
	}
	if (String(modality) === "face") {
		return (
			Number(result?.faceTemplateSize || 0) > 0 &&
			Number(result?.facePictureSize || 0) > 0 &&
			result?.cardOwnerVerified === true &&
			result?.identityOwnerVerified === true
		);
	}
	return false;
};

export const classifyCredentialRecoveryError = (
	error: unknown,
): CredentialRecoveryErrorClassification => {
	const message = String((error as any)?.message || error || "Unknown recovery failure");
	const normalized = message.toLowerCase();
	const matches = (...patterns: RegExp[]) => patterns.some((pattern) => pattern.test(normalized));

	if (
		matches(
			/can't reach database server/,
			/database server.*(?:unreachable|closed|connection)/,
			/server has closed the connection/,
			/connection.*(?:terminated|closed).*database/,
			/\bp1001\b/,
		)
	) {
		return {
			code: "database_transport",
			category: "persistence",
			message,
			retryable: true,
			observabilityDefect: false,
		};
	}
	if (
		matches(
			/write-attempt fence refused/,
			/worker lease expired/,
			/lease (?:was )?lost/,
			/lease owner/,
			/duplicate write risk/,
		)
	) {
		return {
			code: "worker_fencing",
			category: "concurrency",
			message,
			retryable: false,
			observabilityDefect: false,
		};
	}
	if (matches(/\bunauthori[sz]ed\b/, /\b401\b/, /\bauthentication\b/, /invalid credentials/)) {
		return {
			code: "device_authentication",
			category: "authentication",
			message,
			retryable: false,
			observabilityDefect: false,
		};
	}
	if (
		matches(
			/cardownerverified=false/,
			/no exact employee-owned cardinfo association/,
		)
	) {
		return {
			code: "face_owner_card_association_missing",
			category: "identity_custody",
			message,
			retryable: false,
			observabilityDefect: false,
		};
	}
	if (
		matches(
			/neither exact shared card custody nor the same canonical hris employee/,
			/neither exact shared card custody, the same canonical hris employee, nor the same plain vendor person id/,
			/neither an exact shared physical card nor the same canonical hris employee/,
			/neither an exact shared physical card, the same canonical hris employee, nor the same plain vendor person id/,
		)
	) {
		return {
			code: "face_identity_association_unproven",
			category: "identity_custody",
			message,
			retryable: false,
			observabilityDefect: false,
		};
	}
	if (
		matches(
			/hikvision sdk biometric export failed/,
			/source_device_not_armed/,
		)
	) {
		return {
			code: "sdk_source_device_not_armed",
			category: "sdk_runtime",
			message,
			retryable: true,
			observabilityDefect: false,
		};
	}
	if (matches(/hikvision sdk export event missing/)) {
		return {
			code: "sdk_export_event_missing",
			category: "observability",
			message,
			retryable: false,
			observabilityDefect: true,
		};
	}
	// Must run before broad \btimeout\b transport match: "timeout: ... dumped core"
	// was misclassified as device_transport and infinite-retried face canaries.
	if (
		matches(
			/dumped core/,
			/exitcode=255/,
			/stored_face_sdk_(?:preview|execute)_failed exitcode=255/,
			/timeout: the monitored command dumped core/,
		)
	) {
		return {
			code: "stored_face_sdk_crash",
			category: "sdk_runtime",
			message,
			retryable: false,
			observabilityDefect: false,
		};
	}
	if (
		matches(
			/fetch failed/,
			/operation was aborted/,
			/\btimeout\b/,
			/\btimed out\b/,
			// Binary/ISAPI client messages use underscores: request_timeout_after_15000ms
			/request_timeout/,
			/timeout_after_/,
			/\beconn(?:reset|refused|aborted)\b/,
			/\bsocket\b/,
			/network/,
		)
	) {
		return {
			code: "device_transport",
			category: "transport",
			message,
			retryable: true,
			observabilityDefect: false,
		};
	}
	if (
		matches(
			/hikvision_http_rejection/,
			/\bhttp=4\d\d\b/,
			/\b(?:invalid content|invalid xml|badjsoncontent|parametererror)\b/,
		)
	) {
		return {
			code: "device_request_rejected",
			category: "implementation",
			message,
			retryable: false,
			observabilityDefect: false,
		};
	}
	if (matches(/full-inventory/, /inventory readability/, /inventory read/)) {
		return {
			code: "inventory_read_safety_gate",
			category: "safety_gate",
			message,
			retryable: true,
			observabilityDefect: false,
		};
	}
	// Device applied a write call but progress/reread rejected retention.
	// This is physical apply evidence, not an observability hole.
	// progressErrorMsg often names another employeeNo occupying the slot.
	if (
		matches(
			/device_fp_write_rejected_progress5/,
			/progressstatus[\"']?\s*[:=]\s*5/,
			/progressstatus.:5/,
			/"progressstatus"\s*:\s*5/,
			/sticky[\"']?\s*[:=]\s*false/,
			/failed to retain one or more raw fingerprint templates/,
			/target rejected or failed to retain/,
		)
	) {
		return {
			code: "device_fp_write_rejected_progress",
			category: "device_apply",
			message,
			retryable: false,
			observabilityDefect: false,
		};
	}
	// Same-vendor face peer is proven but stored-face SDK path needs a card value.
	// Match before broad /identity/ so this is never mis-bucketed.
	if (
		matches(
			/neither source nor target yields a card value for the stored-face writer/,
			/face peer association is proven by same vendor person id, but neither source nor target yields a card/,
			/yields a card value for the stored-face writer/,
		)
	) {
		return {
			code: "face_writer_card_missing",
			category: "identity_custody",
			message,
			retryable: false,
			observabilityDefect: false,
		};
	}
	// Named stored-face SDK sub-causes (prefer before broad stored_face_sdk_failed).
	// Live 2026-07-25: writeOk=false lastError=0 was unreadable; C++ now emits
	// failReason/recvStatus and ensures ACS card before SET_FACE_AND_TEMPLATE.
	if (
		matches(
			/stored_face_card_ensure_failed/,
			/card_ensure ok=false/,
			/card_bind_failed/,
			/peer_card_owner_conflict/,
			/card_no_required_for_face_and_template/,
		)
	) {
		return {
			code: "face_writer_card_bind_failed",
			category: "identity_custody",
			message,
			retryable: false,
			observabilityDefect: false,
		};
	}
	// Isolation gate after successful SDK reread — must not be observabilityDefect.
	// cardCount +1 is expected when ACS writer card was ensured for cardless peers.
	if (
		matches(
			/credential-only face isolation failed/,
			/writer_card_not_owned_after_reread/,
			/unexpected_card_count_delta/,
			/fingerprint_or_card changed/,
		)
	) {
		return {
			code: "face_isolation_after_write",
			category: "safety_gate",
			message,
			retryable: true,
			observabilityDefect: false,
		};
	}
	if (
		matches(
			/device_face_template_full/,
			/recvStatus=2\b/,
			/failReason=device_face_template_full/,
		)
	) {
		return {
			code: "stored_face_device_full",
			category: "device_apply",
			message,
			retryable: false,
			observabilityDefect: false,
		};
	}
	// Hot-reload wrapper noise used to be the entire thrown error (INFO lines).
	// Prefer structured stored_face_sdk_* messages; still classify residual noise.
	if (
		matches(
			/stored_face_sdk_(?:preview|execute)_failed/,
			/stored-face sdk (?:preview|write)/,
			/stored_face_write_/,
			/peer_face_write ok=false/,
			/failReason=device_recv_status/,
			/failReason=peer_face_write_failed/,
		)
	) {
		return {
			code: "stored_face_sdk_failed",
			category: "sdk_runtime",
			message,
			// Named failReason/recvStatus present => not an observability defect.
			// Bare writeOk=false lastError=0 without diagnosis was the defect
			// (fixed in C++ peer_face_write emission).
			retryable: true,
			observabilityDefect: false,
		};
	}
	if (
		matches(
			/hikvision hot-reload/,
			/local_api_base=http:\/\/localhost:3101/,
			/loop\[\d+\]\s+find\s+\d+\s+mac/,
		)
	) {
		return {
			code: "stored_face_sdk_wrapper_noise",
			category: "sdk_runtime",
			message,
			retryable: true,
			observabilityDefect: true,
		};
	}
	if (
		matches(
			/duplicate owner/,
			/different .*owner/,
			/physical identity/,
			/canonical (?:employee|identity)/,
			/source bytes/,
			/missing custody/,
		)
	) {
		return {
			code: "identity_safety",
			category: "identity",
			message,
			retryable: false,
			observabilityDefect: false,
		};
	}
	if (matches(/unsupported/, /capability/, /firmware/, /writer probe/)) {
		return {
			code: "writer_capability",
			category: "capability",
			message,
			retryable: false,
			observabilityDefect: false,
		};
	}
	if (matches(/scope hash/, /stale plan/, /scope changed/, /plan .*expired/)) {
		return {
			code: "stale_scope",
			category: "scope",
			message,
			retryable: false,
			observabilityDefect: false,
		};
	}
	if (
		matches(
			/unique constraint/,
			/prisma/,
			/typeerror/,
			/referenceerror/,
			/is not a function/,
			/cannot read propert/,
			/undefined/,
		)
	) {
		return {
			code: "code_or_data_contract",
			category: "implementation",
			message,
			retryable: false,
			observabilityDefect: false,
		};
	}
	return {
		code: "unclassified",
		category: "observability",
		message,
		retryable: false,
		observabilityDefect: true,
	};
};

export const describeCredentialRecoveryError = (error: unknown) => {
	const candidate =
		error && typeof error === "object"
			? (error as Record<string, any>)
			: {};
	const data =
		candidate.data && typeof candidate.data === "object"
			? (candidate.data as Record<string, any>)
			: {};
	const response =
		data.ResponseStatus && typeof data.ResponseStatus === "object"
			? (data.ResponseStatus as Record<string, any>)
			: data;
	const safeFields: Array<[string, unknown]> = [
		["http", candidate.status],
		["statusCode", response.statusCode],
		["statusString", response.statusString],
		["subStatusCode", response.subStatusCode],
		["errorCode", response.errorCode],
		["errorMsg", response.errorMsg],
		["endpoint", data.endpoint],
		["method", data.method],
	];
	const details = safeFields
		.map(([key, value]) => [key, String(value ?? "").trim()] as const)
		.filter(([, value]) => value)
		.map(
			([key, value]) =>
				`${key}=${value.replace(/[\r\n|]+/g, " ").slice(0, 240)}`,
		);
	const message = String(candidate.message || error || "Unknown recovery failure")
		.replace(/[\r\n|]+/g, " ")
		.slice(0, 500);
	return details.length
		? `hikvision_http_rejection: ${message} [${details.join(" ")}]`
		: message;
};

export const planCredentialRecoveryWorkerFailure = (
	error: unknown,
	priorAttempt: number,
	maxAttempts = 5,
) => {
	const classification = classifyCredentialRecoveryError(error);
	const attempt = Math.max(0, Number(priorAttempt) || 0) + 1;
	const shouldRetry = classification.retryable && attempt <= Math.max(1, maxAttempts);
	return {
		...classification,
		attempt,
		maxAttempts,
		shouldRetry,
		status: shouldRetry ? ("retrying" as const) : ("failed" as const),
	};
};

export type CredentialRecoveryTaskDraft = {
	taskKey: string;
	kind:
		| "source_capture"
		| "target_owner_capture"
		| "source_resolution"
		| "target_write"
		| "physical_reread";
	modality?: "fingerprint" | "face" | "card";
	sourceDeviceId?: string;
	targetDeviceId?: string;
	vendorUserId?: string;
	userKey?: string;
	status: "pending" | "blocked";
	stage: string;
	priority: number;
	unlockCount: number;
	reviewedByteHash?: string;
	payload: Record<string, unknown>;
};

export const buildCredentialRecoveryPendingTaskWhere = (
	jobId: string,
	canaryModality: unknown,
) => {
	const modality = ["fingerprint", "face"].includes(String(canaryModality || ""))
		? String(canaryModality)
		: null;
	return {
		jobId,
		status: { in: ["pending", "retrying"] },
		kind: { in: ["source_capture", "target_owner_capture"] },
		...(modality ? { modality } : {}),
	};
};

export const buildExpiredCredentialRecoverySourceLeaseWhere = (
	jobId: string,
	now: Date,
) => ({
	jobId,
	kind: { in: ["source_capture", "target_owner_capture"] },
	status: "processing",
	OR: [{ leaseExpiresAt: { lt: now } }, { leaseExpiresAt: null }],
});

/**
 * True red / physical boundary only when a person in the room or a dual-owner
 * conflict on the device is required. Agent-owned export, richest pick, writer
 * probe, and HRIS identity linkage stay recovery_needed (amber) — not red.
 */
const physicalBoundaryReasons = new Set([
	"physical_identity_adjudication_required",
	// device_fp_anti_dupe_peer_owner is NO longer a physical boundary:
	// auto force-clear + write resolves it (unique FP gap zero policy).
	// If a plan still emits it, treat as agent_unlock residual (amber).
	"duplicate_owner_detected",
	"different_target_owner_detected",
	"physical_reenrollment_required",
	"source_not_enrolled",
	"device_firmware_unsupported",
]);

export const classifyCredentialRecoveryWrite = (
	write: any,
): CredentialRecoveryClassification => {
	if (
		write?.recommended === true &&
		["ready_from_raw_blob", "ready_to_write"].includes(
			String(write?.executionEligibility || ""),
		)
	) {
		return "ready_to_write";
	}
	const reason = String(write?.blockingReason || "");
	const stage = String(write?.recoveryStage || "");
	const sourceId = String(write?.sourceDeviceId || "").trim();
	const candidates = Array.isArray(write?.sourceCandidateDeviceIds)
		? write.sourceCandidateDeviceIds
		: [];
	// Null source + candidates is agent export/richest-select — not room enroll.
	// Do not paint it red physical merely because stage says adjudication.
	const falsePhysicalSourceUnset =
		!sourceId &&
		candidates.length > 0 &&
		(reason === "physical_identity_adjudication_required" ||
			stage === "physical_identity_action_required");
	if (falsePhysicalSourceUnset) {
		return "recovery_needed";
	}
	// Anti-dupe is agent force-clear work, never a red physical ban.
	if (reason === "device_fp_anti_dupe_peer_owner") {
		return "recovery_needed";
	}
	// Stage can mark dual-owner even when reason is source_conflict (duplicate slot).
	if (
		stage === "physical_identity_action_required" ||
		stage === "physical_reenrollment_required" ||
		stage === "device_firmware_unsupported"
	) {
		return "physical_action_required";
	}
	return physicalBoundaryReasons.has(reason)
		? "physical_action_required"
		: "recovery_needed";
};

const unlockNeededForWrite = (write: any): string[] => {
	const reason = String(write?.blockingReason || "");
	const sourceId = String(write?.sourceDeviceId || "").trim();
	const candidates = Array.isArray(write?.sourceCandidateDeviceIds)
		? write.sourceCandidateDeviceIds.map(String)
		: [];
	if (
		!sourceId &&
		candidates.length > 0 &&
		reason === "physical_identity_adjudication_required"
	) {
		return [
			"sourceDeviceId is null but sourceCandidateDeviceIds exist — not true room enroll",
			"export/select richest source among candidates",
			"replan until recommended + ready_from_raw_blob",
		];
	}
	switch (reason) {
		case "missing_raw_blob":
			return [
				"source_capture / export raw custody (templates or cardNo)",
				"replan",
				"writer capability must allow ready_from_raw_blob",
			];
		case "source_conflict":
			return [
				"richest-source selection (max templates / checksum superset)",
				"optional export all candidates",
				"replan with single sourceDeviceId",
			];
		case "target_owner_scan_incomplete":
			return [
				"target_owner_capture: export+checksum enrolled owners on target",
				"or per-identity allow when this person has complete custody",
			];
		case "target_write_unsupported":
		case "target_attestation_invalid":
			return [
				"serial canary / FDLib or SDK writer attestation on target",
				"replan when capability green",
			];
		case "canonical_identity_unproven":
			return [
				"prove employee/card/vendor linkage across devices",
				"replan",
			];
		case "physical_identity_adjudication_required":
			return [
				"if dual-owner different people: policy residual (not auto-write)",
				"if same vendor: richest overwrite path then replan",
			];
		case "device_fp_anti_dupe_peer_owner":
			return [
				"agent auto-resolve: force-clear peer fingerprint slot(s) then write recovery source",
				"replan after reconcileDurableFingerprintOwnerConflicts (should be ready_from_raw_blob + fleet force flags)",
				"never wait on operator dual-owner ban — unique FP gap policy is auto force-clear",
			];
		default:
			return [
				`classify unlock for blockingReason=${reason || "unknown"}`,
				"replan after unlock",
			];
	}
};

type RecoveryOwnerClass =
	| "agent_unlock"
	| "policy_or_true_physical"
	| "ready"
	| "other";

const ownerClassForWrite = (write: any): RecoveryOwnerClass => {
	if (classifyCredentialRecoveryWrite(write) === "ready_to_write") {
		return "ready";
	}
	const reason = String(write?.blockingReason || "");
	const sourceId = String(write?.sourceDeviceId || "").trim();
	const candidates = Array.isArray(write?.sourceCandidateDeviceIds)
		? write.sourceCandidateDeviceIds
		: [];
	if (
		!sourceId &&
		candidates.length > 0 &&
		reason === "physical_identity_adjudication_required"
	) {
		return "agent_unlock";
	}
	if (reason === "device_fp_anti_dupe_peer_owner") {
		// Auto force-clear path owns this — agent unlock, not operator ban.
		return "agent_unlock";
	}
	if (classifyCredentialRecoveryWrite(write) === "physical_action_required") {
		return "policy_or_true_physical";
	}
	if (
		[
			"missing_raw_blob",
			"source_conflict",
			"target_owner_scan_incomplete",
			"target_write_unsupported",
			"target_attestation_invalid",
			"canonical_identity_unproven",
		].includes(reason)
	) {
		return "agent_unlock";
	}
	return "other";
};

const text = (value: unknown) => String(value ?? "").trim();
const key = (...parts: unknown[]) => parts.map(text).join(":");
const sha256 = (value: unknown) =>
	createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * Builds the durable graph from the server-side plan. Source work is collapsed
 * by source/device/person/modality, while every target write and physical
 * reread remains an independent task.
 */
export const buildCredentialRecoveryTaskGraph = (plan: any): CredentialRecoveryTaskDraft[] => {
	const tasks = new Map<string, CredentialRecoveryTaskDraft>();
	const writes = Array.isArray(plan?.credentialWrites) ? plan.credentialWrites : [];

	const addUnlock = (
		taskKey: string,
		draft: Omit<CredentialRecoveryTaskDraft, "unlockCount">,
		operationId: string,
	) => {
		const existing = tasks.get(taskKey);
		if (existing) {
			const operationIds = new Set([
				...((existing.payload.operationIds as string[]) || []),
				operationId,
			]);
			existing.payload.operationIds = [...operationIds];
			existing.unlockCount = operationIds.size;
			existing.priority = Math.max(
				existing.priority,
				draft.priority + operationIds.size,
			);
			return;
		}
		tasks.set(taskKey, {
			...draft,
			unlockCount: 1,
			priority: draft.priority + 1,
			payload: { ...draft.payload, operationIds: [operationId] },
		});
	};

	for (const write of writes) {
		const operationId = text(write.id);
		const modality = text(write.modality) as "fingerprint" | "face" | "card";
		const sourceDeviceId = text(write.sourceDeviceId);
		const targetDeviceId = text(write.targetDeviceId);
		const vendorUserId = text(write.vendorUserId);
		const userKey = text(write.userKey);
		const classification = classifyCredentialRecoveryWrite(write);

		const associationPriority =
			modality === "fingerprint"
				? 40_000
				: String(write.faceAssociationStrategy) === "exact_shared_card"
					? 30_000
					: String(write.faceAssociationStrategy) === "canonical_hris_employee"
						? 20_000
						: String(write.faceAssociationStrategy) === "same_vendor_user_id"
							? 15_000
							: 10_000;
		const candidateDeviceIds = [
			...new Set(
				[
					sourceDeviceId,
					...((Array.isArray(write.sourceCandidateDeviceIds)
						? write.sourceCandidateDeviceIds
						: []) as unknown[]),
				]
					.map((value) => text(value))
					.filter(Boolean),
			),
		];
		const enqueueSourceCapture = (captureDeviceIds: string[]) => {
			for (const captureDeviceId of captureDeviceIds) {
				const taskKey = key(
					"source_capture",
					captureDeviceId,
					vendorUserId,
					modality,
				);
				addUnlock(
					taskKey,
					{
						taskKey,
						kind: "source_capture",
						modality,
						sourceDeviceId: captureDeviceId,
						vendorUserId,
						userKey,
						status: "pending",
						stage: "recovering_source_custody",
						priority: associationPriority,
						payload: {
							sourceCandidateDeviceIds: candidateDeviceIds,
							faceAssociationStrategy: write.faceAssociationStrategy || null,
							originBlockingReason: write.blockingReason || null,
							originRecoveryStage: write.recoveryStage || null,
						},
					},
					operationId,
				);
			}
		};
		const enqueueBlockedSourceResolution = () => {
			const taskKey = key("source_resolution", userKey, modality);
			addUnlock(
				taskKey,
				{
					taskKey,
					kind: "source_resolution",
					modality,
					sourceDeviceId,
					vendorUserId,
					userKey,
					status: "blocked",
					stage: "comparing_sources",
					priority: 0,
					payload: { sourceCandidateDeviceIds: candidateDeviceIds },
				},
				operationId,
			);
		};

		// Agent-owned export path:
		// 1) missing_raw_blob → capture selected source (or candidates)
		// 2) face/FP source_conflict with candidates → capture every highest-count
		//    candidate (including legacy comparing_sources labels). Do not leave
		//    blocked source_resolution when the agent can export custody.
		// 3) card / no-candidate source_conflict remains blocked source_resolution
		if (String(write.blockingReason) === "missing_raw_blob") {
			const captureDeviceIds =
				sourceDeviceId
					? [sourceDeviceId]
					: candidateDeviceIds.length > 0
						? candidateDeviceIds
						: [];
			if (["fingerprint", "face"].includes(modality) && captureDeviceIds.length) {
				enqueueSourceCapture(captureDeviceIds);
			}
		} else if (String(write.blockingReason) === "source_conflict") {
			const stage = String(write.recoveryStage || "");
			const exportingStage = stage === "exporting_source_credential";
			// No selected source + candidates = incomplete custody export even if a
			// legacy plan still labels comparing_sources (never dual-owner red).
			const needsCandidateExport =
				!sourceDeviceId && candidateDeviceIds.length > 0;
			if (
				["fingerprint", "face"].includes(modality) &&
				candidateDeviceIds.length > 0 &&
				(exportingStage || needsCandidateExport)
			) {
				enqueueSourceCapture(candidateDeviceIds);
			} else {
				enqueueBlockedSourceResolution();
			}
		}

		if (classification === "ready_to_write") {
			const reviewedByteHash = sha256({
				fingerprint: write.sourceFingerprintTemplateChecksums || [],
				face: write.sourceFaceChecksum || write.sourceFacePictureChecksum || null,
				card: write.sourceCardChecksum || null,
			});
			const writeTaskKey = key("target_write", operationId);
			tasks.set(writeTaskKey, {
				taskKey: writeTaskKey,
				kind: "target_write",
				modality,
				sourceDeviceId,
				targetDeviceId,
				vendorUserId,
				userKey,
				status: "pending",
				stage: "ready_to_write",
				priority: 5_000,
				unlockCount: 1,
				reviewedByteHash,
				payload: { operationId },
			});
			const rereadTaskKey = key("physical_reread", operationId);
			tasks.set(rereadTaskKey, {
				taskKey: rereadTaskKey,
				kind: "physical_reread",
				modality,
				sourceDeviceId,
				targetDeviceId,
				vendorUserId,
				userKey,
				status: "blocked",
				stage: "awaiting_physical_reread",
				priority: 4_000,
				unlockCount: 1,
				reviewedByteHash,
				payload: { operationId, dependsOn: writeTaskKey },
			});
		}
	}

	// Target owner capture is export work. Fleet-wide missing lists can be 20–100+
	// owners and dominate wall-clock even when only a few residual writes remain.
	// Prefer owners that actually unlock fingerprint writes / force-clear peers.
	const ownerCaptureNeededByTarget = new Map<string, Set<string>>();
	const readyFpTargets = new Set<string>();
	for (const write of writes) {
		if (text(write.modality) !== "fingerprint") continue;
		const targetDeviceId = text(write.targetDeviceId);
		if (!targetDeviceId) continue;
		const classification = classifyCredentialRecoveryWrite(write);
		if (classification === "ready_to_write") {
			readyFpTargets.add(targetDeviceId);
		}
		const needed = ownerCaptureNeededByTarget.get(targetDeviceId) || new Set<string>();
		const vendorUserId = text(write.vendorUserId);
		if (
			classification === "ready_to_write" ||
			String(write.blockingReason) === "target_owner_scan_incomplete"
		) {
			if (vendorUserId) needed.add(vendorUserId);
		}
		for (const owner of [
			...(Array.isArray(write.fleetSameByteMajorityConflictingOwners)
				? write.fleetSameByteMajorityConflictingOwners
				: []),
			...(Array.isArray(write.adminSandboxConflictingOwners)
				? write.adminSandboxConflictingOwners
				: []),
		]) {
			const ownerId = text(owner);
			if (ownerId) needed.add(ownerId);
		}
		if (needed.size) ownerCaptureNeededByTarget.set(targetDeviceId, needed);
	}

	for (const scan of Array.isArray(plan?.fingerprintTargetOwnerScans)
		? plan.fingerprintTargetOwnerScans
		: []) {
		const targetDeviceId = text(scan.targetDeviceId);
		if (!targetDeviceId) continue;
		// Scope owner export to write-relevant vendors only (force peers + residual
		// ids). Full fleet missingVendorUserIds dumps made residual waves 2–6 min.
		const needed = ownerCaptureNeededByTarget.get(targetDeviceId);
		const missing = Array.isArray(scan?.missingVendorUserIds)
			? scan.missingVendorUserIds.map((id: unknown) => text(id)).filter(Boolean)
			: [];
		let toCapture: string[] = [];
		if (needed && needed.size > 0) {
			toCapture = missing.filter((id: string) => needed.has(id));
		} else if (!readyFpTargets.has(targetDeviceId)) {
			toCapture = [];
		} else {
			toCapture = missing.slice(0, 5);
		}
		for (const vendorUserId of toCapture) {
			const taskKey = key(
				"target_owner_capture",
				targetDeviceId,
				vendorUserId,
				"fingerprint",
			);
			tasks.set(taskKey, {
				taskKey,
				kind: "target_owner_capture",
				modality: "fingerprint",
				sourceDeviceId: targetDeviceId,
				targetDeviceId,
				vendorUserId: text(vendorUserId),
				status: "pending",
				stage: "recovering_target_owner_custody",
				priority: 9_000,
				unlockCount: 1,
				payload: {
					evidenceHash: scan.evidenceHash,
					scopedOwnerCapture: true,
					fleetMissingCount: Number(scan.missingCount || missing.length || 0),
				},
			});
		}
	}

	return [...tasks.values()].sort(
		(left, right) =>
			right.priority - left.priority || left.taskKey.localeCompare(right.taskKey),
	);
};

export const summarizeCredentialRecovery = (plan: any, tasks: CredentialRecoveryTaskDraft[]) => {
	const writes = Array.isArray(plan?.credentialWrites) ? plan.credentialWrites : [];
	const classifications: CredentialRecoveryClassification[] = writes.map(
		classifyCredentialRecoveryWrite,
	);
	const readyWrites = writes.filter(
		(write: any) => classifyCredentialRecoveryWrite(write) === "ready_to_write",
	);
	const faceReady = readyWrites.filter((write: any) => String(write?.modality) === "face").length;
	const fingerprintReady = readyWrites.filter(
		(write: any) => String(write?.modality) === "fingerprint",
	).length;
	return {
		physicallyVerifiedRemaining: writes.length,
		recoveryNeeded: classifications.filter((value) => value === "recovery_needed").length,
		readyToWrite: classifications.filter((value) => value === "ready_to_write").length,
		faceReady,
		fingerprintReady,
		physicalActionRequired: classifications.filter(
			(value) => value === "physical_action_required",
		).length,
		recoveringNow: 0,
		writing: 0,
		awaitingPhysicalReread: 0,
		verified: 0,
		failed: 0,
		tasksTotal: tasks.length,
		tasksPending: tasks.filter((task) => task.status === "pending").length,
		tasksBlocked: tasks.filter((task) => task.status === "blocked").length,
	};
};

const modalityRank = (value: unknown) =>
	String(value) === "fingerprint" ? 0 : String(value) === "face" ? 1 : 2;

const faceAssociationRank = (value: unknown) =>
	String(value) === "exact_shared_card"
		? 0
		: String(value) === "canonical_hris_employee"
			? 1
			: String(value) === "same_vendor_user_id"
				? 2
				: 3;

/**
 * Exact same selection the recovery worker uses before physical writes.
 * Pure: given plan writes + canary/cap, returns the ordered would-write list.
 *
 * Ordering bias (unique-gap first + target-balanced):
 * 1) fingerprint before face (canary safety)
 * 2) people with fewer remaining ops of this modality first (finish unique IDs)
 * 3) at most one op per person in the first pass
 * 4) among a person's candidate targets, prefer the least-loaded targetDeviceId
 *    in the current wave (unlocks in-job multi-target parallel without same-device races)
 * 5) exact_shared_card association / stable id for remaining ties
 * 6) fill remaining budget preferring least-loaded targets
 */
export const selectCredentialRecoveryReadyWrites = (params: {
	credentialWrites: unknown;
	canaryModality?: unknown;
	maxVerifiedWrites?: unknown;
	operationIds?: Iterable<unknown> | null;
	/** Task keys that permanently consumed write budget (succeeded or non-retryable failed). */
	attemptedTaskKeys?: Iterable<unknown> | null;
}) => {
	const canaryModality = ["fingerprint", "face"].includes(String(params.canaryModality || ""))
		? String(params.canaryModality)
		: null;
	const maxVerifiedWrites = Math.max(
		0,
		Math.min(50, Number(params.maxVerifiedWrites ?? 50) || 0),
	);
	const operationIds = params.operationIds
		? new Set([...params.operationIds].map((id) => String(id || "")).filter(Boolean))
		: null;
	const attemptedTaskKeys = new Set(
		[...(params.attemptedTaskKeys || [])]
			.map((taskKey) => String(taskKey || ""))
			.filter(Boolean),
	);
	const writes = Array.isArray(params.credentialWrites) ? params.credentialWrites : [];
	const remainingOpsByPersonModality = new Map<string, number>();
	for (const write of writes) {
		const modality = String((write as any)?.modality || "");
		if (canaryModality && modality !== canaryModality) continue;
		const person = String(
			(write as any)?.vendorUserId || (write as any)?.userKey || "",
		).trim();
		if (!person) continue;
		const mapKey = `${modality}|${person}`;
		remainingOpsByPersonModality.set(
			mapKey,
			(remainingOpsByPersonModality.get(mapKey) || 0) + 1,
		);
	}
	const eligible = writes.filter((write: any) => {
		const id = String(write?.id || "");
		if (operationIds && !operationIds.has(id)) return false;
		if (write?.recommended !== true) return false;
		if (String(write?.executionEligibility || "") !== "ready_from_raw_blob") return false;
		if (attemptedTaskKeys.has(`target_write:${id}`)) return false;
		if (canaryModality && String(write?.modality || "") !== canaryModality) return false;
		return true;
	});
	const personKeyOf = (write: any) => {
		const person = String(write?.vendorUserId || write?.userKey || "").trim();
		return person ? `${String(write?.modality || "")}|${person}` : "";
	};
	const targetIdOf = (write: any) => String(write?.targetDeviceId || "").trim();
	const sorted = [...eligible].sort((left: any, right: any) => {
		const leftPerson = String(left?.vendorUserId || left?.userKey || "").trim();
		const rightPerson = String(right?.vendorUserId || right?.userKey || "").trim();
		const leftRemain =
			remainingOpsByPersonModality.get(`${String(left?.modality)}|${leftPerson}`) || 99;
		const rightRemain =
			remainingOpsByPersonModality.get(`${String(right?.modality)}|${rightPerson}`) || 99;
		return (
			modalityRank(left?.modality) - modalityRank(right?.modality) ||
			leftRemain - rightRemain ||
			faceAssociationRank(left?.faceAssociationStrategy) -
				faceAssociationRank(right?.faceAssociationStrategy) ||
			String(left?.id || "").localeCompare(String(right?.id || ""))
		);
	});
	const byPerson = new Map<string, any[]>();
	for (const write of sorted) {
		const personKey = personKeyOf(write);
		if (!personKey) continue;
		const list = byPerson.get(personKey) || [];
		list.push(write);
		byPerson.set(personKey, list);
	}
	const personOrder: string[] = [];
	const seenPersonOrder = new Set<string>();
	for (const write of sorted) {
		const personKey = personKeyOf(write);
		if (!personKey || seenPersonOrder.has(personKey)) continue;
		seenPersonOrder.add(personKey);
		personOrder.push(personKey);
	}

	const selected: any[] = [];
	const selectedIds = new Set<string>();
	const targetLoad = new Map<string, number>();
	const bumpTarget = (write: any) => {
		const target = targetIdOf(write) || "_none";
		targetLoad.set(target, (targetLoad.get(target) || 0) + 1);
	};
	const pickLeastLoaded = (candidates: any[]) => {
		if (candidates.length === 0) return null;
		return [...candidates].sort((left, right) => {
			const leftTarget = targetIdOf(left) || "_none";
			const rightTarget = targetIdOf(right) || "_none";
			const leftLoad = targetLoad.get(leftTarget) || 0;
			const rightLoad = targetLoad.get(rightTarget) || 0;
			return (
				leftLoad - rightLoad ||
				faceAssociationRank(left?.faceAssociationStrategy) -
					faceAssociationRank(right?.faceAssociationStrategy) ||
				String(left?.id || "").localeCompare(String(right?.id || ""))
			);
		})[0];
	};

	// Pass 1: one op per person, prefer least-loaded target among that person's ready ops.
	for (const personKey of personOrder) {
		if (selected.length >= maxVerifiedWrites) break;
		const candidates = byPerson.get(personKey) || [];
		const pick = pickLeastLoaded(candidates);
		if (!pick) continue;
		selected.push(pick);
		selectedIds.add(String(pick?.id || ""));
		bumpTarget(pick);
	}
	// Pass 2: fill remaining budget; prefer ops on least-loaded targets.
	const remaining = sorted
		.filter((write) => !selectedIds.has(String(write?.id || "")))
		.sort((left, right) => {
			const leftTarget = targetIdOf(left) || "_none";
			const rightTarget = targetIdOf(right) || "_none";
			const leftLoad = targetLoad.get(leftTarget) || 0;
			const rightLoad = targetLoad.get(rightTarget) || 0;
			return (
				leftLoad - rightLoad ||
				String(left?.id || "").localeCompare(String(right?.id || ""))
			);
		});
	for (const write of remaining) {
		if (selected.length >= maxVerifiedWrites) break;
		selected.push(write);
		selectedIds.add(String(write?.id || ""));
		bumpTarget(write);
	}
	return selected;
};

/**
 * Full residual / ready / unlock / unique-gap certainty for dry-run.
 * This is the product contract the operator UI and agents must use — not a
 * thin ready-only count. Incomplete scoping here is a certainty-contract
 * gap (architecture/observability), not a one-line bug.
 */
export type CredentialRecoveryFullScopeCertainty = {
	/** Frozen plan residual ops (all modalities unless canary filters wouldWrite). */
	residualOpsTotal: number;
	residualByModality: {
		face: number;
		fingerprint: number;
		card: number;
		other: number;
	};
	/** UI-style unique gap people in residual (any residual op for that person). */
	uniqueGapPeople: {
		face: number;
		fingerprint: number;
		card: number;
	};
	readyQueue: {
		readyOps: number;
		faceReady: number;
		fingerprintReady: number;
		/** People who already have at least one ready op (can leave unique gap if all their residual ops verify). */
		facePeopleWithAnyReadyOp: number;
		fingerprintPeopleWithAnyReadyOp: number;
	};
	ifYouExecuteNow: {
		wouldWriteCount: number;
		wouldWriteUniquePeople: number;
		/** Best-case unique-gap people closed if every write in the wave verifies. */
		maxUniquePeopleGapClosedIfAllVerify: number;
		/** Unique gap people remaining for modality after best-case wave (optimistic). */
		uniqueGapPeopleAfterBestCase: number;
		willUniqueGapDecrease: boolean;
		/**
		 * Best-case only: assumes every wouldWrite physically retains (sticky).
		 * ready_from_raw_blob does NOT prove stickiness — progress5 anti-dupe can
		 * reject PROD peers with writeOk=true sticky=false.
		 */
		willUniqueGapReachZeroInThisWave: boolean;
		/**
		 * Physical stickiness honesty for this wave (plan-row only; fail-closed).
		 * never claims device-proved retention without stickyEmpty / reread evidence.
		 */
		stickinessRisk: "none" | "low" | "elevated" | "high";
		/** true unless every wouldWrite is face-only or admin-band with no known peers. */
		willUniqueGapReachZeroAssumesAllSticky: boolean;
		/**
		 * Known or class-predicted progress5 / anti-dupe peer residual.
		 * plan_checksum_collision = another vendor in plan shares source template checksum.
		 * prod_no_auto_clear = vendor 21+ ready FP (clear/retry path does not run).
		 * admin_force_overwrite_unproven = admin sandbox clear planned but not sticky-proved.
		 * inventory_peer_checksum = target inventory record holds same checksum under other vendor.
		 */
		knownProgress5Peers: Array<{
			vendorUserId: string;
			targetDeviceId: string;
			operationId?: string;
			peerVendorUserId?: string;
			evidenceClass:
				| "plan_checksum_collision"
				| "inventory_peer_checksum"
				| "prod_no_auto_clear"
				| "admin_force_overwrite_unproven";
			checksumSample?: string;
		}>;
		/** Residual prediction after a wave that hits known reject classes (fail-closed upper bound). */
		predictedFailedClassResidual: {
			prodNoAutoClearFpOps: number;
			adminForceOverwriteFpOps: number;
			checksumCollisionPeerOps: number;
			/** wouldWrite ops whose stickiness is not plan-proven (at least elevated risk). */
			stickinessUnprovenOps: number;
			/** Unique people in wouldWrite that may remain in gap after progress5 class fails. */
			uniquePeopleStillAtRiskIfAntiDupeRejects: number;
			note: string;
		};
		reason: string;
	};
	/** Why ready is empty / residual not writable — full histogram. */
	whyNotReady: Array<{
		modality: string;
		blockingReason: string;
		recoveryStage: string;
		executionEligibility: string;
		count: number;
		ownerClass: "agent_unlock" | "policy_or_true_physical" | "ready" | "other";
		falsePhysicalSourceNullWithCandidates: boolean;
		neededToEnterReadyQueue: string[];
	}>;
	/** Ordered unlock checklist before execute can move unique gaps. */
	unlockChecklist: Array<{
		id: string;
		status: "done" | "open" | "blocked" | "n_a";
		item: string;
		ops?: number;
		peopleSample?: string[];
		needed?: string[];
	}>;
	/** Scans/exports still required before ready queue can fill. */
	scanExportNeeded: {
		faceSourceSelectOrExportOps: number;
		fingerprintConflictOrAdjudicationOps: number;
		cardMissingRawBlobOps: number;
		note: string;
	};
};

export type CredentialRecoveryExecutionPreview = {
	canaryModality: "fingerprint" | "face" | null;
	maxVerifiedWrites: number;
	readyTotal: number;
	faceReady: number;
	fingerprintReady: number;
	wouldWriteCount: number;
	wouldWriteOperationIds: string[];
	wouldWriteUniquePeople: number;
	wouldWriteByTarget: Array<{
		targetDeviceId: string;
		modality: string;
		count: number;
	}>;
	readyByModalityTarget: Array<{
		modality: string;
		targetDeviceId: string;
		count: number;
	}>;
	blockReasonsWhenZeroReady: Array<{
		reason: string;
		modality: string;
		count: number;
	}>;
	certainty: "deterministic_from_plan";
	gapExpectation: {
		verifiedWillIncreaseByAtMost: number;
		uniquePeopleTouchedAtMost: number;
		uiGapOnlyMovesIfVerifiedGreaterThanZero: true;
		fpReadyMustBePositiveForFingerprintVerifiedWrites: true;
		faceReadyMustBePositiveForFaceVerifiedWrites: true;
		/** Physical retain is never proven by plan-row ready_from_raw_blob alone. */
		stickinessUnprovenForWouldWrite: boolean;
		/** Mirror of fullScope.ifYouExecuteNow.stickinessRisk. */
		stickinessRisk: "none" | "low" | "elevated" | "high";
	};
	/** Deep residual + unlock + unique-gap prediction (full dry-run scope). */
	fullScope: CredentialRecoveryFullScopeCertainty;
};

/**
 * Deterministic dry-run of what a recovery job would attempt to write.
 * Certainty comes from the frozen plan rows, not UI gap labels.
 */
export const buildCredentialRecoveryExecutionPreview = (params: {
	plan: any;
	canaryModality?: unknown;
	maxVerifiedWrites?: unknown;
}): CredentialRecoveryExecutionPreview => {
	const canaryModality = ["fingerprint", "face"].includes(String(params.canaryModality || ""))
		? (String(params.canaryModality) as "fingerprint" | "face")
		: null;
	const maxVerifiedWrites = Math.max(
		0,
		Math.min(50, Number(params.maxVerifiedWrites ?? 50) || 0),
	);
	const writes = Array.isArray(params.plan?.credentialWrites)
		? params.plan.credentialWrites
		: [];
	const allReady = selectCredentialRecoveryReadyWrites({
		credentialWrites: writes,
		canaryModality,
		maxVerifiedWrites: 50,
	});
	const wouldWrite =
		maxVerifiedWrites === 0
			? []
			: selectCredentialRecoveryReadyWrites({
					credentialWrites: writes,
					canaryModality,
					maxVerifiedWrites,
				});
	const faceReady = writes.filter(
		(write: any) =>
			String(write?.modality) === "face" &&
			classifyCredentialRecoveryWrite(write) === "ready_to_write",
	).length;
	const fingerprintReady = writes.filter(
		(write: any) =>
			String(write?.modality) === "fingerprint" &&
			classifyCredentialRecoveryWrite(write) === "ready_to_write",
	).length;

	const readyByModalityTargetMap = new Map<string, number>();
	for (const write of allReady) {
		const keyName = `${String(write?.modality || "")}|${String(write?.targetDeviceId || "")}`;
		readyByModalityTargetMap.set(keyName, (readyByModalityTargetMap.get(keyName) || 0) + 1);
	}
	const wouldByTargetMap = new Map<string, number>();
	for (const write of wouldWrite) {
		const keyName = `${String(write?.modality || "")}|${String(write?.targetDeviceId || "")}`;
		wouldByTargetMap.set(keyName, (wouldByTargetMap.get(keyName) || 0) + 1);
	}

	const blockReasonsWhenZeroReady: Array<{
		reason: string;
		modality: string;
		count: number;
	}> = [];
	if (allReady.length === 0) {
		const reasonCounts = new Map<string, number>();
		for (const write of writes) {
			const modality = String(write?.modality || "");
			if (canaryModality && modality !== canaryModality) continue;
			const reason = String(
				write?.blockingReason || write?.executionEligibility || "unknown",
			);
			const mapKey = `${modality}|${reason}`;
			reasonCounts.set(mapKey, (reasonCounts.get(mapKey) || 0) + 1);
		}
		for (const [mapKey, count] of [...reasonCounts.entries()].sort(
			(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
		)) {
			const [modality, reason] = mapKey.split("|");
			blockReasonsWhenZeroReady.push({ modality, reason, count });
		}
	}

	const wouldWriteUniquePeople = new Set(
		wouldWrite
			.map((write: any) => String(write?.vendorUserId || write?.userKey || "").trim())
			.filter(Boolean),
	).size;

	// --- Full residual scope (certainty contract) ---
	const scopedWrites = canaryModality
		? writes.filter((write: any) => String(write?.modality || "") === canaryModality)
		: writes;
	const residualByModality = { face: 0, fingerprint: 0, card: 0, other: 0 };
	const uniqueFace = new Set<string>();
	const uniqueFp = new Set<string>();
	const uniqueCard = new Set<string>();
	const facePeopleWithReady = new Set<string>();
	const fpPeopleWithReady = new Set<string>();
	const whyMap = new Map<string, {
		modality: string;
		blockingReason: string;
		recoveryStage: string;
		executionEligibility: string;
		count: number;
		ownerClass: RecoveryOwnerClass;
		falsePhysicalSourceNullWithCandidates: boolean;
		neededToEnterReadyQueue: string[];
	}>();

	for (const write of writes) {
		const modality = String(write?.modality || "other");
		if (modality === "face") residualByModality.face += 1;
		else if (modality === "fingerprint") residualByModality.fingerprint += 1;
		else if (modality === "card") residualByModality.card += 1;
		else residualByModality.other += 1;

		const person = String(write?.vendorUserId || write?.userKey || "").trim();
		if (person && modality === "face") uniqueFace.add(person);
		if (person && modality === "fingerprint") uniqueFp.add(person);
		if (person && modality === "card") uniqueCard.add(person);

		const isReadyRow = classifyCredentialRecoveryWrite(write) === "ready_to_write";
		if (isReadyRow && person && modality === "face") facePeopleWithReady.add(person);
		if (isReadyRow && person && modality === "fingerprint") fpPeopleWithReady.add(person);

		if (canaryModality && modality !== canaryModality) continue;
		const sourceId = String(write?.sourceDeviceId || "").trim();
		const candidates = Array.isArray(write?.sourceCandidateDeviceIds)
			? write.sourceCandidateDeviceIds
			: [];
		const falsePhysical =
			!sourceId &&
			candidates.length > 0 &&
			String(write?.blockingReason || "") === "physical_identity_adjudication_required";
		const blockingReason = String(write?.blockingReason || write?.executionEligibility || "unknown");
		const recoveryStage = String(write?.recoveryStage || "none");
		const executionEligibility = String(write?.executionEligibility || "none");
		const mapKey = `${modality}|${blockingReason}|${recoveryStage}|${executionEligibility}|${falsePhysical ? "fp" : "n"}`;
		const existing = whyMap.get(mapKey);
		if (existing) {
			existing.count += 1;
		} else {
			whyMap.set(mapKey, {
				modality,
				blockingReason,
				recoveryStage,
				executionEligibility,
				count: 1,
				ownerClass: ownerClassForWrite(write),
				falsePhysicalSourceNullWithCandidates: falsePhysical,
				neededToEnterReadyQueue: unlockNeededForWrite(write),
			});
		}
	}

	const whyNotReady = [...whyMap.values()].sort(
		(left, right) => right.count - left.count || left.blockingReason.localeCompare(right.blockingReason),
	);

	const uniqueGapForModality =
		canaryModality === "face"
			? uniqueFace.size
			: canaryModality === "fingerprint"
				? uniqueFp.size
				: uniqueFace.size + uniqueFp.size;
	const maxUniqueClosed = Math.min(wouldWriteUniquePeople, uniqueGapForModality);
	const willDecrease = wouldWrite.length > 0 && wouldWriteUniquePeople > 0;
	// Full unique-gap zero in this wave only when every residual op in-scope is ready
	// and selected into wouldWrite (deterministic, fail-closed if incomplete).
	const modalityResidual = scopedWrites.filter((write: any) =>
		canaryModality ? String(write?.modality || "") === canaryModality : true,
	);
	const allModalityResidualReady =
		modalityResidual.length > 0 &&
		modalityResidual.every(
			(write: any) => classifyCredentialRecoveryWrite(write) === "ready_to_write",
		);
	const willZero =
		wouldWrite.length > 0 &&
		allModalityResidualReady &&
		wouldWrite.length >= modalityResidual.length &&
		maxUniqueClosed >= uniqueGapForModality;

	// --- Stickiness / progress5 anti-dupe honesty (plan-row only, fail-closed) ---
	// ready_from_raw_blob means custody+writer eligibility, NOT device retention.
	// Live defect class: writeOk=true sticky=false progressStatus=5 errorMsg=<peer>.
	// Admin band 1–20 may clear+retry; PROD 21+ never auto-clears (fail-closed).
	const isAdminSandboxVendor = (value: unknown): boolean => {
		const raw = String(value ?? "").trim();
		if (!/^\d+$/.test(raw)) return false;
		const n = Number(raw);
		return Number.isInteger(n) && n >= 1 && n <= 20;
	};
	const normalizeChecksum = (value: unknown) =>
		String(value || "")
			.trim()
			.toLowerCase();
	// Map source template checksum → vendor people that carry it in any residual FP write.
	const checksumToVendors = new Map<string, Set<string>>();
	for (const write of writes) {
		if (String(write?.modality || "") !== "fingerprint") continue;
		const vendor = String(write?.vendorUserId || "").trim();
		if (!vendor) continue;
		const templates = Array.isArray(write?.sourceFingerprintTemplateChecksums)
			? write.sourceFingerprintTemplateChecksums
			: [];
		for (const template of templates) {
			const checksum = normalizeChecksum(template?.checksum);
			if (!checksum) continue;
			const set = checksumToVendors.get(checksum) || new Set<string>();
			set.add(vendor);
			checksumToVendors.set(checksum, set);
		}
	}
	// Inventory peer owners on target devices (when plan.users still carries checksums).
	const inventoryChecksumOwners = new Map<string, Set<string>>();
	const planUsers = Array.isArray(params.plan?.users) ? params.plan.users : [];
	for (const user of planUsers) {
		const records = Array.isArray(user?.records) ? user.records : [];
		for (const record of records) {
			const owner = String(record?.vendorUserId || "").trim();
			const deviceId = String(record?.deviceId || "").trim();
			if (!owner || !deviceId) continue;
			const templates = Array.isArray(record?._fingerprintTemplateChecksums)
				? record._fingerprintTemplateChecksums
				: [];
			for (const template of templates) {
				const checksum = normalizeChecksum(template?.checksum);
				if (!checksum) continue;
				const key = `${deviceId}|${checksum}`;
				const set = inventoryChecksumOwners.get(key) || new Set<string>();
				set.add(owner);
				inventoryChecksumOwners.set(key, set);
			}
		}
	}

	type Progress5Peer = CredentialRecoveryFullScopeCertainty["ifYouExecuteNow"]["knownProgress5Peers"][number];
	const knownProgress5Peers: Progress5Peer[] = [];
	let prodNoAutoClearFpOps = 0;
	let adminForceOverwriteFpOps = 0;
	let checksumCollisionPeerOps = 0;
	const stickinessUnprovenPeople = new Set<string>();

	for (const write of wouldWrite) {
		if (String(write?.modality || "") !== "fingerprint") continue;
		const vendor = String(write?.vendorUserId || "").trim();
		const targetDeviceId = String(write?.targetDeviceId || "").trim();
		const operationId = String(write?.id || "").trim() || undefined;
		if (!vendor) continue;
		const templates = Array.isArray(write?.sourceFingerprintTemplateChecksums)
			? write.sourceFingerprintTemplateChecksums
			: [];
		let hadChecksumPeer = false;
		for (const template of templates) {
			const checksum = normalizeChecksum(template?.checksum);
			if (!checksum) continue;
			const planPeers = [...(checksumToVendors.get(checksum) || [])].filter(
				(peer) => peer !== vendor,
			);
			for (const peer of planPeers.slice(0, 5)) {
				hadChecksumPeer = true;
				knownProgress5Peers.push({
					vendorUserId: vendor,
					targetDeviceId,
					operationId,
					peerVendorUserId: peer,
					evidenceClass: "plan_checksum_collision",
					checksumSample: checksum.slice(0, 16),
				});
			}
			const invPeers = [
				...(inventoryChecksumOwners.get(`${targetDeviceId}|${checksum}`) || []),
			].filter((peer) => peer !== vendor);
			for (const peer of invPeers.slice(0, 5)) {
				hadChecksumPeer = true;
				knownProgress5Peers.push({
					vendorUserId: vendor,
					targetDeviceId,
					operationId,
					peerVendorUserId: peer,
					evidenceClass: "inventory_peer_checksum",
					checksumSample: checksum.slice(0, 16),
				});
			}
		}
		if (hadChecksumPeer) {
			checksumCollisionPeerOps += 1;
			stickinessUnprovenPeople.add(vendor);
		}
		if (write?.adminSandboxForceOverwrite === true) {
			adminForceOverwriteFpOps += 1;
			stickinessUnprovenPeople.add(vendor);
			knownProgress5Peers.push({
				vendorUserId: vendor,
				targetDeviceId,
				operationId,
				peerVendorUserId: Array.isArray(write?.adminSandboxConflictingOwners)
					? String(write.adminSandboxConflictingOwners[0] || "") || undefined
					: undefined,
				evidenceClass: "admin_force_overwrite_unproven",
			});
		} else if (!isAdminSandboxVendor(vendor)) {
			// PROD band: no progress5 clear/retry; retention not plan-proven.
			prodNoAutoClearFpOps += 1;
			stickinessUnprovenPeople.add(vendor);
			knownProgress5Peers.push({
				vendorUserId: vendor,
				targetDeviceId,
				operationId,
				evidenceClass: "prod_no_auto_clear",
			});
		}
	}

	// Dedupe peer rows (same vendor/target/class/peer).
	const peerDedupe = new Set<string>();
	const knownProgress5PeersDeduped = knownProgress5Peers.filter((row) => {
		const key = [
			row.vendorUserId,
			row.targetDeviceId,
			row.evidenceClass,
			row.peerVendorUserId || "",
			row.operationId || "",
		].join("|");
		if (peerDedupe.has(key)) return false;
		peerDedupe.add(key);
		return true;
	}).slice(0, 40);

	const stickinessUnprovenOps =
		prodNoAutoClearFpOps + adminForceOverwriteFpOps + checksumCollisionPeerOps > 0
			? wouldWrite.filter((write: any) => {
					if (String(write?.modality || "") !== "fingerprint") return false;
					const vendor = String(write?.vendorUserId || "").trim();
					if (write?.adminSandboxForceOverwrite === true) return true;
					if (!isAdminSandboxVendor(vendor)) return true;
					const templates = Array.isArray(write?.sourceFingerprintTemplateChecksums)
						? write.sourceFingerprintTemplateChecksums
						: [];
					return templates.some((template: any) => {
						const checksum = normalizeChecksum(template?.checksum);
						if (!checksum) return false;
						const planPeers = checksumToVendors.get(checksum);
						if (planPeers && [...planPeers].some((peer) => peer !== vendor)) {
							return true;
						}
						const inv = inventoryChecksumOwners.get(
							`${String(write?.targetDeviceId || "").trim()}|${checksum}`,
						);
						return Boolean(inv && [...inv].some((peer) => peer !== vendor));
					});
				}).length
			: 0;

	const fpWouldWriteCount = wouldWrite.filter(
		(write: any) => String(write?.modality || "") === "fingerprint",
	).length;
	let stickinessRisk: CredentialRecoveryFullScopeCertainty["ifYouExecuteNow"]["stickinessRisk"] =
		"none";
	if (fpWouldWriteCount === 0) {
		stickinessRisk = wouldWrite.length > 0 ? "low" : "none";
	} else if (checksumCollisionPeerOps > 0 || prodNoAutoClearFpOps > 0) {
		// Known peer collision or PROD ready FP: progress5 class can reject retention.
		stickinessRisk = checksumCollisionPeerOps > 0 ? "high" : "elevated";
	} else if (adminForceOverwriteFpOps > 0) {
		stickinessRisk = "elevated";
	} else {
		// Admin-band ready FP without known peers: clear path exists but still unproven sticky.
		stickinessRisk = "low";
	}
	const willUniqueGapReachZeroAssumesAllSticky = willZero;
	const predictedFailedClassResidual = {
		prodNoAutoClearFpOps,
		adminForceOverwriteFpOps,
		checksumCollisionPeerOps,
		stickinessUnprovenOps,
		uniquePeopleStillAtRiskIfAntiDupeRejects: stickinessUnprovenPeople.size,
		note:
			fpWouldWriteCount === 0
				? "No fingerprint wouldWrite in this wave — progress5 anti-dupe class not applicable."
				: stickinessRisk === "high" || stickinessRisk === "elevated"
					? "ready_from_raw_blob ≠ device retain. PROD progress5 peers are dual-biometric residual (no auto-clear). Do not treat wouldWrite as verified close; reclassify anti-dupe after one sticky=false wave."
					: "Fingerprint wouldWrite is admin-band or face-only class; stickiness still requires physical reread. Admin 1–20 may clear+retry once; never invent sticky success from plan rows.",
	};

	const faceSourceSelectOps = writes.filter((write: any) => {
		if (String(write?.modality) !== "face") return false;
		const sourceId = String(write?.sourceDeviceId || "").trim();
		const candidates = Array.isArray(write?.sourceCandidateDeviceIds)
			? write.sourceCandidateDeviceIds
			: [];
		return (
			(!sourceId && candidates.length > 0) ||
			["source_conflict", "missing_raw_blob"].includes(String(write?.blockingReason || ""))
		);
	}).length;
	const fpConflictOps = writes.filter(
		(write: any) =>
			String(write?.modality) === "fingerprint" &&
			classifyCredentialRecoveryWrite(write) !== "ready_to_write",
	).length;
	const cardMissingOps = writes.filter(
		(write: any) =>
			String(write?.modality) === "card" &&
			String(write?.blockingReason || "") === "missing_raw_blob",
	).length;

	const unlockChecklist: CredentialRecoveryFullScopeCertainty["unlockChecklist"] = [
		{
			id: "READY_QUEUE",
			status: allReady.length > 0 ? "done" : "open",
			item: "Ready queue (recommended + ready_from_raw_blob) non-empty for selected modality",
			ops: allReady.length,
		},
		{
			id: "WOULD_WRITE",
			status: wouldWrite.length > 0 ? "done" : "blocked",
			item: "wouldWriteCount > 0 so execute can move unique gaps",
			ops: wouldWrite.length,
		},
		{
			id: "UNIQUE_GAP_PREDICTION",
			status: willDecrease ? "open" : wouldWrite.length === 0 ? "blocked" : "open",
			item: "Predict unique gap delta if all wouldWrite ops verify+retain (optimistic sticky)",
			needed: [
				`uniqueGapPeople(modality)=${uniqueGapForModality}`,
				`maxUniqueClosedIfVerify=${maxUniqueClosed}`,
				`willUniqueGapDecrease=${willDecrease}`,
				`willUniqueGapReachZeroInThisWave=${Boolean(willZero)}`,
				`willUniqueGapReachZeroAssumesAllSticky=${willUniqueGapReachZeroAssumesAllSticky}`,
				`stickinessRisk=${stickinessRisk}`,
			],
		},
		{
			id: "STICKINESS_PROGRESS5",
			status:
				stickinessRisk === "none" || stickinessRisk === "low"
					? stickinessRisk === "none"
						? "n_a"
						: "open"
					: "blocked",
			item: "Physical stickiness honesty: ready_from_raw_blob ≠ retain; progress5 anti-dupe residual",
			ops: stickinessUnprovenOps,
			needed: [
				`stickinessRisk=${stickinessRisk}`,
				`prodNoAutoClearFpOps=${prodNoAutoClearFpOps}`,
				`adminForceOverwriteFpOps=${adminForceOverwriteFpOps}`,
				`checksumCollisionPeerOps=${checksumCollisionPeerOps}`,
				`knownProgress5PeerRows=${knownProgress5PeersDeduped.length}`,
				`uniquePeopleStillAtRiskIfAntiDupeRejects=${stickinessUnprovenPeople.size}`,
			],
		},
		...whyNotReady.slice(0, 12).map((row, index) => ({
			id: `UNLOCK_${index}_${row.blockingReason}`.slice(0, 64),
			status: "open" as const,
			item: `Unlock ${row.count}× ${row.modality} blocked by ${row.blockingReason}${row.falsePhysicalSourceNullWithCandidates ? " (false physical: source null + candidates)" : ""}`,
			ops: row.count,
			needed: row.neededToEnterReadyQueue,
		})),
		{
			id: "SCAN_EXPORT",
			status:
				faceSourceSelectOps + fpConflictOps + cardMissingOps > 0 ? "open" : "done",
			item: "Scans/exports/richest-source before ready fills",
			needed: [
				`faceSourceSelectOrExportOps=${faceSourceSelectOps}`,
				`fingerprintNotReadyOps=${fpConflictOps}`,
				`cardMissingRawBlobOps=${cardMissingOps}`,
			],
		},
		{
			id: "END_GAME_ZERO",
			status: uniqueGapForModality === 0 && allReady.length === 0 ? "done" : "open",
			item: "End game: unique gap 0 for modality (policy dual-owner may remain named outside ready)",
			needed: [
				`uniqueFace=${uniqueFace.size}`,
				`uniqueFp=${uniqueFp.size}`,
				`readyTotal=${allReady.length}`,
			],
		},
	];

	const fullScope: CredentialRecoveryFullScopeCertainty = {
		residualOpsTotal: writes.length,
		residualByModality,
		uniqueGapPeople: {
			face: uniqueFace.size,
			fingerprint: uniqueFp.size,
			card: uniqueCard.size,
		},
		readyQueue: {
			readyOps: allReady.length,
			faceReady,
			fingerprintReady,
			facePeopleWithAnyReadyOp: facePeopleWithReady.size,
			fingerprintPeopleWithAnyReadyOp: fpPeopleWithReady.size,
		},
		ifYouExecuteNow: {
			wouldWriteCount: wouldWrite.length,
			wouldWriteUniquePeople,
			maxUniquePeopleGapClosedIfAllVerify: maxUniqueClosed,
			// Fail-closed residual after anti-dupe class: people still at risk stay in gap.
			uniqueGapPeopleAfterBestCase: Math.max(
				0,
				uniqueGapForModality -
					Math.max(0, maxUniqueClosed - stickinessUnprovenPeople.size),
			),
			// Do not claim gap decrease when PROD no-clear / checksum collision dominate the wave.
			willUniqueGapDecrease:
				willDecrease &&
				prodNoAutoClearFpOps === 0 &&
				checksumCollisionPeerOps === 0,
			// Never claim unique-gap zero while PROD anti-dupe or checksum-collision peers remain.
			willUniqueGapReachZeroInThisWave: Boolean(
				willZero &&
					prodNoAutoClearFpOps === 0 &&
					checksumCollisionPeerOps === 0 &&
					stickinessRisk !== "high",
			),
			stickinessRisk,
			willUniqueGapReachZeroAssumesAllSticky: willUniqueGapReachZeroAssumesAllSticky,
			knownProgress5Peers: knownProgress5PeersDeduped,
			predictedFailedClassResidual,
			reason:
				wouldWrite.length === 0
					? "Ready queue empty for this modality — execute cannot reduce unique gap KPIs. See whyNotReady + unlockChecklist."
					: prodNoAutoClearFpOps > 0 || checksumCollisionPeerOps > 0
						? `Execute would attempt ${wouldWrite.length} writes covering up to ${wouldWriteUniquePeople} unique people, but stickinessRisk=${stickinessRisk}: ready_from_raw_blob does not prove device retain (progress5 anti-dupe / PROD no auto-clear). ${prodNoAutoClearFpOps} PROD FP op(s) have no auto-clear and ${checksumCollisionPeerOps} checksum-collision peer op(s) may hit progress5 (writeOk=true sticky=false). wouldWrite is attempt ceiling, not verified close. uniquePeopleStillAtRiskIfAntiDupeRejects=${predictedFailedClassResidual.uniquePeopleStillAtRiskIfAntiDupeRejects}.`
						: stickinessRisk === "high" || stickinessRisk === "elevated"
							? `Execute would attempt ${wouldWrite.length} writes covering up to ${wouldWriteUniquePeople} unique people, but stickinessRisk=${stickinessRisk}: ready_from_raw_blob does not prove device retain (progress5 anti-dupe / admin force clear unproven). uniquePeopleStillAtRiskIfAntiDupeRejects=${predictedFailedClassResidual.uniquePeopleStillAtRiskIfAntiDupeRejects}.`
							: willZero
								? `Execute would attempt ${wouldWrite.length} writes covering ${wouldWriteUniquePeople} unique people; residual for modality is fully ready so unique gap can reach 0 if all verify and retain (stickinessRisk=${stickinessRisk}).`
								: `Execute would attempt ${wouldWrite.length} writes covering up to ${wouldWriteUniquePeople} unique people; unique gap falls only for people who fully verify+retain (UI gap needs verified>0; stickinessRisk=${stickinessRisk}).`,
		},
		whyNotReady: whyNotReady.slice(0, 30),
		unlockChecklist,
		scanExportNeeded: {
			faceSourceSelectOrExportOps: faceSourceSelectOps,
			fingerprintConflictOrAdjudicationOps: fpConflictOps,
			cardMissingRawBlobOps: cardMissingOps,
			note: "These ops never enter wouldWrite until unlock/export/richest/scan completes and replan marks ready_from_raw_blob.",
		},
	};

	return {
		canaryModality,
		maxVerifiedWrites,
		readyTotal: allReady.length,
		faceReady,
		fingerprintReady,
		wouldWriteCount: wouldWrite.length,
		wouldWriteOperationIds: wouldWrite.map((write: any) => String(write?.id || "")).filter(Boolean),
		wouldWriteUniquePeople,
		wouldWriteByTarget: [...wouldByTargetMap.entries()]
			.map(([mapKey, count]) => {
				const [modality, targetDeviceId] = mapKey.split("|");
				return { modality, targetDeviceId, count };
			})
			.sort(
				(left, right) =>
					right.count - left.count ||
					left.targetDeviceId.localeCompare(right.targetDeviceId),
			),
		readyByModalityTarget: [...readyByModalityTargetMap.entries()]
			.map(([mapKey, count]) => {
				const [modality, targetDeviceId] = mapKey.split("|");
				return { modality, targetDeviceId, count };
			})
			.sort(
				(left, right) =>
					right.count - left.count ||
					left.targetDeviceId.localeCompare(right.targetDeviceId),
			),
		blockReasonsWhenZeroReady: blockReasonsWhenZeroReady.slice(0, 20),
		certainty: "deterministic_from_plan",
		gapExpectation: {
			// Attempt ceiling minus known anti-dupe / PROD no-clear / force-unproven classes.
			verifiedWillIncreaseByAtMost: Math.max(
				0,
				wouldWrite.length - stickinessUnprovenOps,
			),
			uniquePeopleTouchedAtMost: Math.max(
				0,
				wouldWriteUniquePeople - stickinessUnprovenPeople.size,
			),
			uiGapOnlyMovesIfVerifiedGreaterThanZero: true,
			fpReadyMustBePositiveForFingerprintVerifiedWrites: true,
			faceReadyMustBePositiveForFaceVerifiedWrites: true,
			// Fail-closed: plan-row ready is never device-proved physical retain.
			stickinessUnprovenForWouldWrite: wouldWrite.length > 0,
			stickinessRisk,
		},
		fullScope,
	};
};

/**
 * Write-attempt budget must only count permanent outcomes.
 * Retryable transport claims (attempts>0 while still retrying) must not
 * exhaust maxVerifiedWrites and force awaiting_replan with verified=0.
 */
export const selectPermanentCredentialRecoveryWriteAttemptKeys = (
	tasks: Array<{ taskKey?: unknown; status?: unknown }>,
) =>
	tasks
		.filter((task) => {
			const status = String(task?.status || "");
			return status === "succeeded" || status === "failed";
		})
		.map((task) => String(task?.taskKey || ""))
		.filter(Boolean);

const physicalCredentialRecoveryStages = new Set([
	"writing_canary",
	"credential_write_claimed",
	"credential_probe_started",
	"credential_probe_passed",
	"credential_raw_write_started",
	"physical_write_or_reread_active",
	"reread_started",
]);

export const isCredentialRecoveryPhysicalStage = (stage: unknown) =>
	physicalCredentialRecoveryStages.has(String(stage || ""));

export const remainingCredentialRecoveryWriteAttemptBudget = (
	maxWriteAttempts: unknown,
	attemptedTaskKeys: Iterable<unknown>,
) => {
	const maximum = Math.max(0, Math.min(50, Number(maxWriteAttempts || 0)));
	const attempted = new Set(
		[...attemptedTaskKeys].map((taskKey) => String(taskKey || "")).filter(Boolean),
	).size;
	return Math.max(0, maximum - attempted);
};
