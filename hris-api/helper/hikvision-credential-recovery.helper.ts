import { createHash } from "crypto";

export type CredentialRecoveryClassification =
	| "ready_to_write"
	| "recovery_needed"
	| "physical_action_required";

export type CredentialRecoveryErrorClassification = {
	code:
		| "device_authentication"
		| "device_transport"
		| "inventory_read_safety_gate"
		| "identity_safety"
		| "writer_capability"
		| "stale_scope"
		| "code_or_data_contract"
		| "unclassified";
	category:
		| "authentication"
		| "transport"
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

export const classifyCredentialRecoveryError = (
	error: unknown,
): CredentialRecoveryErrorClassification => {
	const message = String((error as any)?.message || error || "Unknown recovery failure");
	const normalized = message.toLowerCase();
	const matches = (...patterns: RegExp[]) => patterns.some((pattern) => pattern.test(normalized));

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
			/fetch failed/,
			/operation was aborted/,
			/\btimeout\b/,
			/\btimed out\b/,
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

const physicalBoundaryReasons = new Set([
	"canonical_identity_unproven",
	"physical_identity_adjudication_required",
	"duplicate_owner_detected",
	"different_target_owner_detected",
	"source_bytes_changed",
	"writer_unsupported",
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
	return physicalBoundaryReasons.has(String(write?.blockingReason || ""))
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
			existing.priority = 10_000 + operationIds.size;
			return;
		}
		tasks.set(taskKey, {
			...draft,
			unlockCount: 1,
			priority: 10_001,
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
					priority: 0,
					payload: { sourceCandidateDeviceIds: write.sourceCandidateDeviceIds || [] },
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
	return {
		physicallyVerifiedRemaining: writes.length,
		recoveryNeeded: classifications.filter((value) => value === "recovery_needed").length,
		readyToWrite: classifications.filter((value) => value === "ready_to_write").length,
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
