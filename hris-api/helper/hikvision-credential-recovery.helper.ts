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
		| "sdk_source_device_not_armed"
		| "sdk_export_event_missing"
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
			/neither an exact shared physical card nor the same canonical hris employee/,
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
	if (
		matches(
			/duplicate owner/,
			/different .*owner/,
			/identity/,
			/checksum/,
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

		if (String(write.blockingReason) === "missing_raw_blob") {
			const associationPriority =
				modality === "fingerprint"
					? 40_000
					: String(write.faceAssociationStrategy) === "exact_shared_card"
						? 30_000
						: String(write.faceAssociationStrategy) ===
							  "canonical_hris_employee"
							? 20_000
							: 10_000;
			const taskKey = key("source_capture", sourceDeviceId, vendorUserId, modality);
			addUnlock(
				taskKey,
				{
					taskKey,
					kind: "source_capture",
					modality,
					sourceDeviceId,
					vendorUserId,
					userKey,
					status: "pending",
					stage: "recovering_source_custody",
					priority: associationPriority,
					payload: {
						sourceCandidateDeviceIds: write.sourceCandidateDeviceIds || [],
						faceAssociationStrategy: write.faceAssociationStrategy || null,
					},
				},
				operationId,
			);
		} else if (String(write.blockingReason) === "source_conflict") {
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
					payload: { sourceCandidateDeviceIds: write.sourceCandidateDeviceIds || [] },
				},
				operationId,
			);
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

	for (const scan of Array.isArray(plan?.fingerprintTargetOwnerScans)
		? plan.fingerprintTargetOwnerScans
		: []) {
		for (const vendorUserId of scan?.missingVendorUserIds || []) {
			const targetDeviceId = text(scan.targetDeviceId);
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
				unlockCount: Number(scan.missingCount || 1),
				payload: { evidenceHash: scan.evidenceHash },
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
			: 2;

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
	};
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
			verifiedWillIncreaseByAtMost: wouldWrite.length,
			uniquePeopleTouchedAtMost: wouldWriteUniquePeople,
			uiGapOnlyMovesIfVerifiedGreaterThanZero: true,
			fpReadyMustBePositiveForFingerprintVerifiedWrites: true,
			faceReadyMustBePositiveForFaceVerifiedWrites: true,
		},
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
