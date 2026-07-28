import { extractHikvisionCredentialSummary } from "./device-user-sync.helper";
import { classifyCredentialRecoveryWrite } from "./hikvision-credential-recovery.helper";
import { createHash } from "crypto";

export const DEVICE_USER_MERGE_FIELDS = [
	"vendorUserId",
	"employeeNo",
	"employeeId",
	"displayName",
	"status",
	"validFrom",
	"validTo",
	"doorRight",
	"accessPlan",
	"face",
	"fingerprint",
	"card",
] as const;

/**
 * Fields that inflate the "Needs decision" chip and require A/B/KEEP review.
 *
 * Face / fingerprint / card are intentionally excluded:
 * - Count gaps (e.g. card 1 vs 0) already appear as credential residual + recovery.
 * - Putting them in conflicts double-counts residual and makes "Needs decision"
 *   look like 16 when the operator only has a few profile/name decisions.
 * - Card is optional for many sites; never default-required for merge apply.
 *
 * Product default: decision = profile identity/metadata only.
 */
export const DEVICE_USER_MERGE_DECISION_FIELDS = [
	"vendorUserId",
	"employeeNo",
	"employeeId",
	"displayName",
	"status",
	"validFrom",
	"validTo",
	"doorRight",
	"accessPlan",
] as const;

/**
 * Profile / HRIS DeviceUser fields that reviewed A/B choices can overlay in the
 * database after a user-mode merge. Biometric modalities (face/fingerprint/card)
 * are intentionally excluded — those require credential-mode raw custody and
 * must never invent missing_raw_blob bytes from a field conflict alone.
 */
export const DEVICE_USER_MERGE_PROFILE_OVERLAY_FIELDS = [
	"employeeId",
	"displayName",
	"status",
	"validFrom",
	"validTo",
	"doorRight",
	"accessPlan",
] as const;

export type DeviceUserMergeField = (typeof DEVICE_USER_MERGE_FIELDS)[number];
export type DeviceUserMergeProfileOverlayField =
	(typeof DEVICE_USER_MERGE_PROFILE_OVERLAY_FIELDS)[number];
export type MergeChoice = "A" | "B" | "KEEP";

export const isDeviceUserMergeProfileOverlayField = (
	field: string,
): field is DeviceUserMergeProfileOverlayField =>
	(DEVICE_USER_MERGE_PROFILE_OVERLAY_FIELDS as readonly string[]).includes(field);
export type FaceCustodyKind =
	| "sdk_template_and_picture"
	| "fdlib_picture"
	| "picture_only_not_writable"
	| "missing";

export type FaceCustodyClassification = {
	kind: FaceCustodyKind;
	hasTemplate: boolean;
	hasPicture: boolean;
	fdlibCapabilitySupported: boolean;
};

/**
 * Classify stored face custody without turning enrollment counts into bytes.
 * FDLib picture custody is only claimed when an affirmative capability probe
 * is attached to the evidence. Writer availability is a separate planner gate.
 */
export const classifyFaceCustody = (params: {
	faceTemplate?: unknown;
	facePicture?: unknown;
	fdlibCapabilitySupported?: boolean;
}): FaceCustodyClassification => {
	const hasTemplate = String(params.faceTemplate || "").trim().length > 0;
	const hasPicture = String(params.facePicture || "").trim().length > 0;
	const fdlibCapabilitySupported = params.fdlibCapabilitySupported === true;
	const kind: FaceCustodyKind =
		hasTemplate && hasPicture
			? "sdk_template_and_picture"
			: hasPicture && fdlibCapabilitySupported
				? "fdlib_picture"
				: hasPicture
					? "picture_only_not_writable"
					: "missing";
	return { kind, hasTemplate, hasPicture, fdlibCapabilitySupported };
};

export type DeviceUserMergeRecord = {
	deviceId: string;
	deviceName: string;
	vendorUserId: string;
	employeeId?: string | null;
	employeeNo?: string | null;
	displayName?: string | null;
	status?: string | null;
	validFrom?: string | Date | null;
	validTo?: string | Date | null;
	doorRight?: string | null;
	accessPlan?: unknown;
	rawPayload?: unknown;
	biometricEvidence?: {
		fingerprint: {
			status: "raw_blob_present" | "missing_raw_blob" | "not_enrolled" | "not_requested";
			reportedCount: number;
			rawBlobCount: number;
		};
		face: {
			status: "raw_blob_present" | "missing_raw_blob" | "not_enrolled" | "not_requested";
			reportedCount: number;
			rawBlobPresent: boolean;
			custodyKind?: FaceCustodyKind;
			fdlibCapabilitySupported?: boolean;
			/** True only after a concrete stored-custody writer is implemented and enabled. */
			writerAvailable?: boolean;
		};
		card?: {
			status: "raw_blob_present" | "missing_raw_blob" | "not_enrolled";
			cardNoPresent: boolean;
			writerAvailable?: boolean;
		};
	};
	manualLink?: boolean;
	identityName?: string | null;
	identityCandidates?: string[];
	/** Server-only checksum evidence; compactMergeRecordForReview strips this field. */
	_fingerprintTemplateChecksums?: Array<{
		fingerPrintId: number;
		checksum: string;
	}>;
	/** Server-only exact stored-face custody proof; compactMergeRecordForReview strips it. */
	_faceCustodyEvidence?: {
		templateSha256: string;
		pictureSha256: string;
		templateSize: number;
		pictureSize: number;
	};
	/** Server-only validated picture custody for target-specific FDLib planning. */
	_fdlibFacePictureEvidence?: {
		pictureSha256: string;
		pictureSize: number;
		contentType: "image/jpeg" | "image/png";
	};
	/** Server-only exact source custody; compactMergeRecordForReview strips it. */
	_cardNo?: string | null;
};

export type DeviceUserMergeConflict = {
	field: DeviceUserMergeField;
	choice: MergeChoice | null;
	deviceA: { id: string; name: string; value: unknown };
	deviceB: { id: string; name: string; value: unknown };
};

export type DeviceUserMergeDuplicateSource = {
	deviceId: string;
	deviceName: string;
	vendorUserId: string;
	sourceRows: number;
	keptRecordId: string | null;
	duplicateRecordIds: string[];
	differingFields: DeviceUserMergeField[];
};

export type DeviceUserMergeGroup = {
	key: string;
	employeeId: string | null;
	employee: unknown;
	vendorUserIds: string[];
	records: DeviceUserMergeRecord[];
	sourceRows: number;
	duplicateSourceRows: DeviceUserMergeDuplicateSource[];
	sourceDeviceId: string;
	targetDeviceIds: string[];
	conflicts: DeviceUserMergeConflict[];
	missingOnDeviceIds: string[];
};

export type DeviceUserCredentialModality = "fingerprint" | "face" | "card";

export type DeviceUserCredentialWrite = {
	id: string;
	userKey: string;
	vendorUserId: string;
	modality: DeviceUserCredentialModality;
	sourceDeviceId: string | null;
	targetDeviceId: string;
	sourceReportedCount: number;
	targetReportedCount: number;
	sourceEvidenceStatus:
		| "raw_blob_present"
		| "missing_raw_blob"
		| "count_reported"
		| "not_enrolled"
		| "not_requested";
	recommended: boolean;
	recommendationReason: string;
	executionEligibility:
		| "ready_from_raw_blob"
		| "sdk_probe_required"
		| "blocked";
	blockingReason:
		| "source_conflict"
		| "canonical_identity_unproven"
		| "target_owner_scan_incomplete"
		| "physical_identity_adjudication_required"
		| "device_fp_anti_dupe_peer_owner"
		| "source_not_enrolled"
		| "missing_raw_blob"
		| "target_write_unsupported"
		| "credential_only_card_not_supported"
		| null;
	recoveryStage:
		| "queued_source_custody_recovery"
		| "exporting_source_credential"
		| "comparing_sources"
		| "resolving_richest_source"
		| "probing_target_capability"
		| "preparing_writer"
		| "ready_to_write"
		| "writing"
		| "rereading_target"
		| "physically_retained"
		| "retrying_recoverable_failure"
		| "physical_identity_action_required"
		| "physical_reenrollment_required"
		| "device_firmware_unsupported"
		| null;
	sourceCandidateDeviceIds: string[];
	/** True only when source and target resolve to the same canonical HRIS employee. */
	canonicalIdentityProven?: boolean;
	/** True only when every enrolled identity on the target has exact slot/checksum custody. */
	targetOwnerScanComplete?: boolean;
	targetOwnerScanMissingCount?: number;
	/** Stable digest of the sorted recovery IDs; biometric bytes/checksums are excluded. */
	targetOwnerScanEvidenceHash?: string;
	/** Bounded operator hint. The complete ID list lives once in the per-target summary. */
	targetOwnerScanMissingVendorUserIdSample?: string[];
	/** Frozen, sorted slot:sha256 custody bound into the reviewed scope hash. */
	sourceFingerprintTemplateChecksums: Array<{
		fingerPrintId: number;
		checksum: string;
	}>;
	/**
	 * Operator-authorized DEV admin sandbox (plain vendor ids 1–20 only).
	 * When true, dual-owner slot conflicts among admin-band people may force
	 * clear the conflicting admin owner's slot then write. Never set for 21+.
	 */
	adminSandboxForceOverwrite?: boolean;
	/** Conflicting admin-band owners that must be cleared before write. */
	adminSandboxConflictingOwners?: string[];
	/** Fingerprint slots involved in the admin-band force clear. */
	adminSandboxConflictSlots?: number[];
	/**
	 * Fleet same-byte majority (operator 2026-07-28): write vendor holds the
	 * reviewed checksum on more devices than the progress5 peer (or wins
	 * most-recent / stable tie-break). Allows clear of that peer even when
	 * either side is PROD 21+, only for the proven matching checksum slots.
	 */
	fleetSameByteMajorityForceOverwrite?: boolean;
	fleetSameByteMajorityConflictingOwners?: string[];
	fleetSameByteMajorityConflictSlots?: number[];
	fleetSameByteMajorityReason?: string;
	/** A transport/SDK success is never enough; execution must re-read this target. */
	physicalRereadRequired: true;
};

/**
 * DEV/admin sandbox plain vendor person ids (1–20). Operator policy 2026-07-25:
 * these may force-overwrite dual-owner fingerprint slots among themselves.
 * PROD identity starts at 21 and remains dual-owner fail-closed.
 */
export const isAdminSandboxVendorUserId = (value: unknown): boolean => {
	const raw = String(value ?? "").trim();
	if (!/^\d+$/.test(raw)) return false;
	const n = Number(raw);
	return Number.isInteger(n) && n >= 1 && n <= 20;
};

export const ADMIN_SANDBOX_VENDOR_ID_MAX = 20;

export type DurableFingerprintOwnerConflictEvidence = {
	jobId: string;
	vendorUserId: string;
	sourceDeviceId: string;
	targetDeviceId: string;
	fingerPrintId: number;
	conflictingVendorUserId: string;
	observedAt?: string | null;
};

export type FleetChecksumCanonicalPick = {
	checksum: string;
	winnerVendorUserId: string;
	winnerDeviceCount: number;
	peerDeviceCount: number;
	reason:
		| "majority_devices"
		| "tie_most_recent"
		| "tie_stable_vendor_id"
		| "single_holder";
	holders: Array<{ vendorUserId: string; deviceCount: number; latestAt: number }>;
};

/**
 * Parse progressStatus=5 diagnostics from a merge/recovery write error string.
 * Live shape (2026-07-27):
 *   Target rejected ...: [{"fingerPrintId":1,"writeOk":true,"sticky":false,
 *     "progressStatus":5,"progressErrorMsg":"1757","source":"device_fp_write_rejected_progress5:1757"}]
 * Peer may appear in progressErrorMsg or as the progress5:NNNN suffix on source.
 */
export const extractProgress5OwnerConflictsFromWriteError = (params: {
	jobId: string;
	vendorUserId: unknown;
	sourceDeviceId?: unknown;
	targetDeviceId?: unknown;
	error: unknown;
	observedAt?: string | null;
}): DurableFingerprintOwnerConflictEvidence[] => {
	const vendorUserId = String(params.vendorUserId ?? "").trim();
	const error = String(params.error ?? "");
	if (!vendorUserId || !error) return [];
	const start = error.indexOf("[");
	const end = error.lastIndexOf("]");
	if (start < 0 || end <= start) return [];
	let attempts: any[] = [];
	try {
		const parsed = JSON.parse(error.slice(start, end + 1));
		attempts = Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
	const out: DurableFingerprintOwnerConflictEvidence[] = [];
	for (const attempt of attempts) {
		const fingerPrintId = Number(attempt?.fingerPrintId || 0);
		const progressStatus = Number(attempt?.progressStatus);
		const fromMsg = String(attempt?.progressErrorMsg ?? "").trim();
		const fromSourceMatch = String(attempt?.source || "").match(
			/device_fp_write_rejected_progress5:(\d{1,10})/i,
		);
		const peerRaw =
			(/^\d{1,10}$/.test(fromMsg) ? fromMsg : null) ||
			fromSourceMatch?.[1] ||
			null;
		// Prefer plain employee id tokens only (never free-text).
		const conflictingVendorUserId = peerRaw ? String(peerRaw) : "";
		if (
			progressStatus !== 5 ||
			!fingerPrintId ||
			!conflictingVendorUserId ||
			conflictingVendorUserId === vendorUserId
		) {
			continue;
		}
		out.push({
			jobId: String(params.jobId || "").trim() || "unknown-job",
			vendorUserId,
			sourceDeviceId: String(params.sourceDeviceId ?? "").trim(),
			targetDeviceId: String(params.targetDeviceId ?? "").trim(),
			fingerPrintId,
			conflictingVendorUserId,
			observedAt: params.observedAt ?? null,
		});
	}
	return out;
};

export const dedupeDurableFingerprintOwnerConflicts = (
	evidence: DurableFingerprintOwnerConflictEvidence[],
): DurableFingerprintOwnerConflictEvidence[] =>
	evidence.filter(
		(item, index, items) =>
			index ===
			items.findIndex(
				(candidate) =>
					candidate.vendorUserId === item.vendorUserId &&
					candidate.sourceDeviceId === item.sourceDeviceId &&
					candidate.targetDeviceId === item.targetDeviceId &&
					candidate.fingerPrintId === item.fingerPrintId &&
					candidate.conflictingVendorUserId === item.conflictingVendorUserId,
			),
	);

export type FingerprintTargetOwnerScanSummary = {
	targetDeviceId: string;
	complete: boolean;
	missingCount: number;
	evidenceHash: string;
	/** Stored once per physical target, never repeated on every write. */
	missingVendorUserIds: string[];
};

/**
 * A panel progress-status 5 naming another employee is stronger than a later
 * count-only planner inference. Preserve that physical owner evidence across
 * replans. The row may disappear as a safe no-write only when the current
 * exact-five inventory proves both vendor IDs map to the same canonical HRIS
 * employee and the conflicting target slot carries the reviewed source
 * checksum. Otherwise a physical identity adjudication is required.
 */
export const reconcileDurableFingerprintOwnerConflicts = <T extends {
	credentialWrites?: DeviceUserCredentialWrite[];
	users?: DeviceUserMergeGroup[];
	counts?: Record<string, number>;
	credentialResolutions?: unknown[];
}>(
	plan: T,
	evidence: DurableFingerprintOwnerConflictEvidence[],
): T & {
	credentialWrites: DeviceUserCredentialWrite[];
	credentialResolutions: unknown[];
} => {
	const writes = Array.isArray(plan.credentialWrites) ? plan.credentialWrites : [];
	const users = Array.isArray(plan.users) ? plan.users : [];
	const records = users.flatMap((user) =>
		user.records.map((record) => ({ user, record })),
	);
	const resolutions = Array.isArray(plan.credentialResolutions)
		? [...plan.credentialResolutions]
		: [];
	const retainedWrites: DeviceUserCredentialWrite[] = [];

	for (const write of writes) {
		if (write.modality !== "fingerprint") {
			retainedWrites.push(write);
			continue;
		}
		const sourceSlotIds = new Set(
			write.sourceFingerprintTemplateChecksums.map(
				(template) => template.fingerPrintId,
			),
		);
		const collisions = evidence.filter(
			(item) =>
				item.vendorUserId === write.vendorUserId &&
				item.targetDeviceId === write.targetDeviceId &&
				sourceSlotIds.has(item.fingerPrintId),
		);
		if (!collisions.length) {
			retainedWrites.push(write);
			continue;
		}
		const source = records.find(
			(item) =>
				item.record.deviceId === write.sourceDeviceId &&
				item.record.vendorUserId === write.vendorUserId,
		);
		const intendedTarget = records.find(
			(item) =>
				item.record.deviceId === write.targetDeviceId &&
				item.record.vendorUserId === write.vendorUserId,
		);
		const intendedTargetSlots = new Map(
			normalizedFingerprintChecksums(intendedTarget?.record || ({} as DeviceUserMergeRecord))
				.map((template) => [template.fingerPrintId, template.checksum]),
		);
		const pendingSlots = write.sourceFingerprintTemplateChecksums.filter(
			(template) =>
				intendedTargetSlots.get(template.fingerPrintId) !==
				text(template.checksum).toLowerCase(),
		);
		const equivalence = collisions.map((collision) => {
			const owner = records.find(
				(item) =>
					item.record.deviceId === collision.targetDeviceId &&
					item.record.vendorUserId === collision.conflictingVendorUserId,
			);
			const sourceChecksum = write.sourceFingerprintTemplateChecksums.find(
				(template) => template.fingerPrintId === collision.fingerPrintId,
			)?.checksum;
			const ownerChecksum = owner?.record._fingerprintTemplateChecksums?.find(
				(template) => template.fingerPrintId === collision.fingerPrintId,
			)?.checksum;
			const sameCanonicalEmployee = Boolean(
				source?.record.employeeId &&
					owner?.record.employeeId &&
					source.record.employeeId === owner.record.employeeId,
			);
			return {
				collision,
				owner,
				equivalent:
					sameCanonicalEmployee &&
					Boolean(sourceChecksum) &&
					Boolean(ownerChecksum) &&
					String(sourceChecksum).toLowerCase() ===
						String(ownerChecksum).toLowerCase(),
			};
		});
		const equivalentSlots = new Set(
			equivalence
				.filter((item) => item.equivalent)
				.map((item) => item.collision.fingerPrintId),
		);
		if (
			pendingSlots.length > 0 &&
			equivalence.every((item) => item.equivalent) &&
			pendingSlots.every((template) =>
				equivalentSlots.has(template.fingerPrintId),
			)
		) {
			resolutions.push({
				writeId: write.id,
				modality: "fingerprint",
				resolution: "equivalent_owner_safe_no_write",
				vendorUserId: write.vendorUserId,
				targetDeviceId: write.targetDeviceId,
				conflictingVendorUserIds: [
					...new Set(
						collisions.map((item) => item.conflictingVendorUserId),
					),
				],
				jobIds: [...new Set(collisions.map((item) => item.jobId))],
				physicalRereadRequired: true,
			});
			continue;
		}
		const owners = [...new Set(collisions.map((item) => item.conflictingVendorUserId))];
		const slots = [...new Set(collisions.map((item) => item.fingerPrintId))];
		const fleetRecords = records.map((item) => item.record);
		// Operator 2026-07-28 (unique FP gap → 0, zero operator wait):
		// progress5 dual-owner is NEVER a permanent anti-dupe / ban residual.
		// Recovery write ALWAYS wins: force-clear peer slot(s) + write when
		// source has raw blob. Safe no-write only when same canonical HRIS
		// employee already proved above (equivalent_owner_safe_no_write).
		// Peer fleet-majority alone must NOT drop the write — that leaves the
		// gap person without FP under their vendor id (unique_fp stays > 0).
		const forceSlots: number[] = [];
		const forceOwners = new Set<string>();
		const forceNotes: string[] = [];
		for (const collision of collisions) {
			const sourceChecksum = write.sourceFingerprintTemplateChecksums.find(
				(template) => template.fingerPrintId === collision.fingerPrintId,
			)?.checksum;
			const owner = records.find(
				(item) =>
					item.record.deviceId === collision.targetDeviceId &&
					item.record.vendorUserId === collision.conflictingVendorUserId,
			);
			const ownerChecksum = owner?.record._fingerprintTemplateChecksums?.find(
				(template) => template.fingerPrintId === collision.fingerPrintId,
			)?.checksum;
			const sameByteOnTarget =
				Boolean(sourceChecksum) &&
				Boolean(ownerChecksum) &&
				String(sourceChecksum).toLowerCase() ===
					String(ownerChecksum).toLowerCase();

			let majorityHint = "";
			if (sourceChecksum) {
				const pick = pickFleetCanonicalVendorForFingerprintChecksum(
					fleetRecords,
					String(sourceChecksum),
					{
						preferVendorUserId: write.vendorUserId,
						peerVendorUserId: collision.conflictingVendorUserId,
					},
				);
				if (pick && pick.peerDeviceCount > 0) {
					majorityHint = ` fleet_same_byte_hint=${pick.reason} writeDevices=${pick.winnerVendorUserId === write.vendorUserId ? pick.winnerDeviceCount : pick.peerDeviceCount} peerDevices=${pick.winnerVendorUserId === collision.conflictingVendorUserId ? pick.winnerDeviceCount : pick.peerDeviceCount}`;
				}
			}

			forceSlots.push(collision.fingerPrintId);
			forceOwners.add(collision.conflictingVendorUserId);
			forceNotes.push(
				sourceChecksum
					? sameByteOnTarget
						? `slot ${collision.fingerPrintId}: same-byte dual-owner peer ${collision.conflictingVendorUserId} — FORCE clear then write vendor ${write.vendorUserId} (unique-gap zero; never ban/wait)${majorityHint}`
						: `slot ${collision.fingerPrintId}: different/unknown peer bytes peer ${collision.conflictingVendorUserId} — FORCE clear then write vendor ${write.vendorUserId}${majorityHint}`
					: `slot ${collision.fingerPrintId}: no source checksum — FORCE clear peer ${collision.conflictingVendorUserId} then write vendor ${write.vendorUserId}`,
			);
		}

		const canForceClear =
			write.sourceEvidenceStatus === "raw_blob_present" &&
			(write.executionEligibility === "ready_from_raw_blob" ||
				write.executionEligibility === "blocked" ||
				Boolean(write.sourceFingerprintTemplateChecksums?.length));

		const resolvedForceSlots = [...new Set(forceSlots)];
		const resolvedForceOwners = [...forceOwners];
		const writeIsAdminSandbox = isAdminSandboxVendorUserId(write.vendorUserId);
		const ownersAreAdminSandbox = owners.every((owner) =>
			isAdminSandboxVendorUserId(owner),
		);

		if (resolvedForceSlots.length > 0 && canForceClear) {
			// Always set fleet force flags so execute clears PROD peers too.
			retainedWrites.push({
				...write,
				recommended: true,
				executionEligibility: "ready_from_raw_blob",
				blockingReason: null,
				recoveryStage: "ready_to_write",
				fleetSameByteMajorityForceOverwrite: true,
				fleetSameByteMajorityConflictingOwners: resolvedForceOwners,
				fleetSameByteMajorityConflictSlots: resolvedForceSlots,
				fleetSameByteMajorityReason: forceNotes.join("; "),
				adminSandboxForceOverwrite:
					writeIsAdminSandbox && ownersAreAdminSandbox
						? true
						: write.adminSandboxForceOverwrite,
				adminSandboxConflictingOwners:
					writeIsAdminSandbox && ownersAreAdminSandbox
						? owners
						: write.adminSandboxConflictingOwners,
				adminSandboxConflictSlots:
					writeIsAdminSandbox && ownersAreAdminSandbox
						? slots
						: write.adminSandboxConflictSlots,
				recommendationReason:
					writeIsAdminSandbox && ownersAreAdminSandbox
						? `ADMIN_SANDBOX_FORCE_OVERWRITE (vendor ids 1–${ADMIN_SANDBOX_VENDOR_ID_MAX}): target slot ${slots.join(
								", ",
							)} owned by admin-band ${owners.join(
								", ",
							)}. Auto-clear peers then write vendor ${write.vendorUserId}. ${forceNotes.join("; ")}`
						: `AUTO_RESOLVE_DUAL_OWNER_FORCE_CLEAR: progress5 peer ${owners.join(
								", ",
							)} on slot ${resolvedForceSlots.join(
								", ",
							)} is never a permanent anti-dupe block. Clear peer slot(s) then write vendor ${write.vendorUserId} so unique FP gap can reach zero without operator wait. ${forceNotes.join("; ")}`,
			});
			continue;
		}

		// Source lacks raw blob: cannot force-write, but still do not name a
		// permanent anti-dupe RED — reclassify as custody recovery so the
		// queue keeps exporting instead of stalling on dual-owner.
		retainedWrites.push({
			...write,
			recommended: false,
			executionEligibility: "blocked",
			blockingReason: "missing_raw_blob",
			recoveryStage: "queued_source_custody_recovery",
			recommendationReason:
				`Progress5 peer owner ${owners.join(
					", ",
				)} on slot ${slots.join(
					", ",
				)} needs auto force-clear, but source raw fingerprint blob is missing. Queue source custody export first; dual-owner is not a permanent residual. ${
					forceNotes.length ? `Notes: ${forceNotes.join("; ")}.` : ""
				}`,
		});
	}

	const next = {
		...plan,
		credentialWrites: retainedWrites,
		credentialResolutions: resolutions,
	};
	if (next.counts) {
		next.counts.credentialWrites = retainedWrites.length;
		next.counts.actionableCredentialWrites = retainedWrites.filter(
			(write) => write.executionEligibility === "ready_from_raw_blob",
		).length;
		next.counts.blockedCredentialWrites =
			retainedWrites.length - next.counts.actionableCredentialWrites;
	}
	return next as T & {
		credentialWrites: DeviceUserCredentialWrite[];
		credentialResolutions: unknown[];
	};
};

const text = (value: unknown) => String(value ?? "").trim();
const stable = (value: unknown) => {
	if (value instanceof Date) return value.toISOString();
	if (value && typeof value === "object") return JSON.stringify(value);
	return text(value);
};
/**
 * Profile validity residual must not thrash on timezone encoding of the same
 * calendar day (UTC midnight vs +08 local midnight). Compare Manila days.
 */
const manilaDayKey = (value: unknown): string => {
	if (value == null || value === "") return "";
	const date =
		value instanceof Date
			? value
			: new Date(String(value).includes("T") ? String(value) : `${String(value).trim()}T00:00:00`);
	if (!Number.isFinite(date.getTime())) return text(value);
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
};
/** Stable key for conflict distinctness (dates → Manila calendar day). */
const conflictStable = (field: string, value: unknown): string => {
	if (field === "validFrom" || field === "validTo") return manilaDayKey(value);
	return stable(value);
};
const credentials = (record: DeviceUserMergeRecord) =>
	extractHikvisionCredentialSummary((record.rawPayload || {}) as any);

const sourceScore = (record: DeviceUserMergeRecord) => {
	const summary = credentials(record);
	const evidence = record.biometricEvidence;
	const populatedFields = DEVICE_USER_MERGE_FIELDS.filter((field) => {
		if (field === "face" || field === "fingerprint" || field === "card") return false;
		const value = valueFor(record, field);
		return value !== null && value !== undefined && stable(value) !== "";
	}).length;
	return (
		populatedFields +
		Number(evidence?.fingerprint.rawBlobCount || 0) * 6 +
		Number(evidence?.face.rawBlobPresent || false) * 4 +
		summary.cardCount * 2
	);
};

const valueFor = (record: DeviceUserMergeRecord, field: DeviceUserMergeField): unknown => {
	if (field === "face") return credentials(record).faceCount;
	if (field === "fingerprint") return credentials(record).fingerprintCount;
	if (field === "card") return credentials(record).cardCount;
	return record[field];
};

const identityKey = (record: DeviceUserMergeRecord) => {
	if (record.manualLink && text(record.employeeId)) return `manual:${text(record.employeeId)}`;
	if (text(record.vendorUserId)) return `vendor:${text(record.vendorUserId)}`;
	if (text(record.employeeNo)) return `employee-no:${text(record.employeeNo)}`;
	if (text(record.employeeId)) return `employee:${text(record.employeeId)}`;
	if (text(record.identityName))
		return `identity:${text(record.identityName).toLocaleLowerCase()}`;
	return `unmatched:${text(record.deviceId)}:${text(record.vendorUserId)}`;
};

const credentialEvidenceStatus = (
	record: DeviceUserMergeRecord,
	modality: DeviceUserCredentialModality,
): DeviceUserCredentialWrite["sourceEvidenceStatus"] => {
	if (modality === "fingerprint") {
		const evidence = record.biometricEvidence?.fingerprint;
		if (evidence?.status) return evidence.status;
		return credentials(record).fingerprintCount > 0 ? "count_reported" : "not_enrolled";
	}
	if (modality === "face") {
		const evidence = record.biometricEvidence?.face;
		if (evidence?.status) return evidence.status;
		return credentials(record).faceCount > 0 ? "count_reported" : "not_enrolled";
	}
	const rawPayload = (record.rawPayload || {}) as any;
	const cardNo = text(
		record._cardNo ||
			rawPayload?.cardNo ||
			rawPayload?.CardInfo?.cardNo ||
			rawPayload?.UserInfo?.cardNo,
	);
	if (cardNo) return "raw_blob_present";
	return credentials(record).cardCount > 0 ? "missing_raw_blob" : "not_enrolled";
};

const credentialCount = (
	record: DeviceUserMergeRecord,
	modality: DeviceUserCredentialModality,
) => {
	const summary = credentials(record);
	if (modality === "fingerprint") return Number(summary.fingerprintCount || 0);
	if (modality === "face") return Number(summary.faceCount || 0);
	return Number(summary.cardCount || 0);
};

const faceCustodyIsWritable = (record: DeviceUserMergeRecord) => {
	const face = record.biometricEvidence?.face;
	if (!face || face.status !== "raw_blob_present" || face.writerAvailable !== true) {
		return false;
	}
	if (face.custodyKind === "sdk_template_and_picture") return true;
	return (
		face.custodyKind === "fdlib_picture" &&
		face.fdlibCapabilitySupported === true
	);
};

type FingerprintSourceResolution = {
	source: DeviceUserMergeRecord | null;
	candidateDeviceIds: string[];
	reason:
		| "single_raw_source"
		| "equal_checksum_sets"
		| "strict_checksum_superset"
		| "richest_count_default_overwrite"
		| "unproven";
};

const normalizedFingerprintChecksums = (record: DeviceUserMergeRecord) =>
	(record._fingerprintTemplateChecksums || [])
		.map((template) => ({
			fingerPrintId: Number(template.fingerPrintId || 0),
			checksum: text(template.checksum).toLowerCase(),
		}))
		.filter((template) => template.fingerPrintId > 0 && template.checksum)
		.sort(
			(left, right) =>
				left.fingerPrintId - right.fingerPrintId ||
				left.checksum.localeCompare(right.checksum),
		);

/**
 * Across fleet inventory, who "owns" this fingerprint byte most?
 * Count distinct devices where vendor has the checksum on any slot.
 * Ties → most recent record timestamp → stable vendorUserId.
 */
export const pickFleetCanonicalVendorForFingerprintChecksum = (
	records: DeviceUserMergeRecord[],
	checksum: string,
	options?: { preferVendorUserId?: string; peerVendorUserId?: string },
): FleetChecksumCanonicalPick | null => {
	const ck = text(checksum).toLowerCase();
	if (!ck) return null;
	const byVendor = new Map<
		string,
		{ devices: Set<string>; latestAt: number }
	>();
	for (const record of records) {
		const vendorUserId = text(record.vendorUserId);
		if (!vendorUserId) continue;
		const hits = normalizedFingerprintChecksums(record).filter(
			(template) => template.checksum === ck,
		);
		if (!hits.length) continue;
		const entry = byVendor.get(vendorUserId) || {
			devices: new Set<string>(),
			latestAt: 0,
		};
		entry.devices.add(text(record.deviceId));
		const ts = Date.parse(
			String(
				(record as any).updatedAt ||
					(record as any).lastSeenAt ||
					(record as any).syncedAt ||
					(record as any).createdAt ||
					0,
			),
		);
		if (Number.isFinite(ts) && ts > entry.latestAt) entry.latestAt = ts;
		byVendor.set(vendorUserId, entry);
	}
	if (!byVendor.size) return null;
	const holders = [...byVendor.entries()]
		.map(([vendorUserId, value]) => ({
			vendorUserId,
			deviceCount: value.devices.size,
			latestAt: value.latestAt,
		}))
		.sort(
			(left, right) =>
				right.deviceCount - left.deviceCount ||
				right.latestAt - left.latestAt ||
				left.vendorUserId.localeCompare(right.vendorUserId),
		);
	const top = holders[0];
	const second = holders[1];
	let reason: FleetChecksumCanonicalPick["reason"] = "majority_devices";
	if (holders.length === 1) reason = "single_holder";
	else if (second && top.deviceCount === second.deviceCount) {
		reason =
			top.latestAt !== second.latestAt
				? "tie_most_recent"
				: "tie_stable_vendor_id";
	}
	if (
		options?.preferVendorUserId &&
		second &&
		top.deviceCount === second.deviceCount
	) {
		const preferred = holders.find(
			(h) =>
				h.vendorUserId === options.preferVendorUserId &&
				h.deviceCount === top.deviceCount,
		);
		if (preferred) {
			const peer = holders.find(
				(h) => h.vendorUserId === options.peerVendorUserId,
			);
			return {
				checksum: ck,
				winnerVendorUserId: preferred.vendorUserId,
				winnerDeviceCount: preferred.deviceCount,
				peerDeviceCount: peer?.deviceCount || 0,
				reason:
					preferred.latestAt !== (peer?.latestAt || 0)
						? "tie_most_recent"
						: "tie_stable_vendor_id",
				holders,
			};
		}
	}
	const peer = holders.find((h) => h.vendorUserId === options?.peerVendorUserId);
	return {
		checksum: ck,
		winnerVendorUserId: top.vendorUserId,
		winnerDeviceCount: top.deviceCount,
		peerDeviceCount: peer?.deviceCount || 0,
		reason,
		holders,
	};
};

export const normalizeFingerprintCustodyEvidence = (
	items: Array<{ fingerPrintId: number; checksum: string }>,
) =>
	(items || [])
		.map((item) => ({
			fingerPrintId: Number(item.fingerPrintId || 0),
			checksum: text(item.checksum).toLowerCase(),
		}))
		.filter((item) => item.fingerPrintId > 0 && Boolean(item.checksum))
		.sort(
			(left, right) =>
				left.fingerPrintId - right.fingerPrintId ||
				left.checksum.localeCompare(right.checksum),
		);

export const fingerprintCustodyMatchesReview = (
	reviewed: Array<{ fingerPrintId: number; checksum: string }>,
	current: Array<{ fingerPrintId: number; checksum: string }>,
) => {
	const normalizedReviewed = normalizeFingerprintCustodyEvidence(reviewed);
	return (
		normalizedReviewed.length > 0 &&
		JSON.stringify(normalizedReviewed) ===
			JSON.stringify(normalizeFingerprintCustodyEvidence(current))
	);
};

export type FingerprintPhysicalRereadProof = {
	physicallyRetained: boolean;
	reason:
		| "physically_retained"
		| "target_identity_not_reread"
		| "reviewed_slot_not_retained"
		| "different_target_owner_detected";
	retainedSlots: number[];
	missingOrChangedSlots: number[];
	conflictingOwners: Array<{
		vendorUserId: string;
		fingerPrintId: number;
		checksum: string;
	}>;
};

/**
 * A write is physically retained only when a fresh target-wide read proves
 * every reviewed slot/checksum on the intended vendor identity and proves
 * that none of those checksums is owned by another target identity.
 */
export const proveFingerprintPhysicalReread = (params: {
	targetDeviceId: string;
	vendorUserId: string;
	reviewedTemplates: Array<{ fingerPrintId: number; checksum: string }>;
	targetRecords: DeviceUserMergeRecord[];
}): FingerprintPhysicalRereadProof => {
	const reviewed = normalizeFingerprintCustodyEvidence(params.reviewedTemplates);
	const intended = params.targetRecords.find(
		(record) =>
			record.deviceId === params.targetDeviceId &&
			text(record.vendorUserId) === text(params.vendorUserId),
	);
	if (!intended) {
		return {
			physicallyRetained: false,
			reason: "target_identity_not_reread",
			retainedSlots: [],
			missingOrChangedSlots: reviewed.map((template) => template.fingerPrintId),
			conflictingOwners: [],
		};
	}
	const intendedBySlot = new Map(
		normalizedFingerprintChecksums(intended).map((template) => [
			template.fingerPrintId,
			template.checksum,
		]),
	);
	const retainedSlots = reviewed
		.filter(
			(template) =>
				intendedBySlot.get(template.fingerPrintId) === template.checksum,
		)
		.map((template) => template.fingerPrintId);
	const missingOrChangedSlots = reviewed
		.filter(
			(template) =>
				intendedBySlot.get(template.fingerPrintId) !== template.checksum,
		)
		.map((template) => template.fingerPrintId);
	const reviewedChecksums = new Set(reviewed.map((template) => template.checksum));
	const conflictingOwners = params.targetRecords
		.filter(
			(record) =>
				record.deviceId === params.targetDeviceId &&
				text(record.vendorUserId) !== text(params.vendorUserId),
		)
		.flatMap((record) =>
			normalizedFingerprintChecksums(record)
				.filter((template) => reviewedChecksums.has(template.checksum))
				.map((template) => ({
					vendorUserId: text(record.vendorUserId),
					fingerPrintId: template.fingerPrintId,
					checksum: template.checksum,
				})),
		)
		.sort(
			(left, right) =>
				left.vendorUserId.localeCompare(right.vendorUserId) ||
				left.fingerPrintId - right.fingerPrintId,
		);
	return {
		physicallyRetained:
			reviewed.length > 0 &&
			missingOrChangedSlots.length === 0 &&
			conflictingOwners.length === 0,
		reason:
			missingOrChangedSlots.length > 0
				? "reviewed_slot_not_retained"
				: conflictingOwners.length > 0
					? "different_target_owner_detected"
					: "physically_retained",
		retainedSlots,
		missingOrChangedSlots,
		conflictingOwners,
	};
};

const completeFingerprintChecksumEvidence = (record: DeviceUserMergeRecord) => {
	const templates = normalizedFingerprintChecksums(record);
	const reportedCount = credentialCount(record, "fingerprint");
	return (
		reportedCount > 0 &&
		templates.length >= reportedCount &&
		new Set(templates.map((template) => template.fingerPrintId)).size >= reportedCount
	);
};

/**
 * Face / credential identity association for peer recovery writes.
 *
 * Live audit (A/B/D/E/F, 2026-07-25): ~231 face RED rows were
 * `physical_identity_adjudication_required` while source and target already
 * shared the same plain vendor person id with no employeeId or card conflict.
 * That is peer copy, not dual-owner room work.
 *
 * Strategy priority:
 * 1) exact_shared_card — both sides share a non-empty card value
 * 2) canonical_hris_employee — both sides share the same non-empty employeeId
 * 3) same_vendor_user_id — write.vendorUserId equals source and target vendor
 *    person ids and the merge group has no conflicting employeeIds/cards
 *
 * Hard conflicts (different non-empty employeeIds or different non-empty cards)
 * stay physical_identity_adjudication_required.
 */
export type FaceAssociationStrategy =
	| "exact_shared_card"
	| "canonical_hris_employee"
	| "same_vendor_user_id";

export type FaceAssociationResolution = {
	strategy: FaceAssociationStrategy | null;
	blockingReason: "physical_identity_adjudication_required" | null;
	recommendationReason: string | null;
	sameVendorPeer: boolean;
	employeeConflict: boolean;
	cardConflict: boolean;
};

const recordVendorPersonId = (record: {
	vendorUserId?: unknown;
	employeeNo?: unknown;
} | null | undefined) =>
	text(record?.vendorUserId || record?.employeeNo);

const recordCardNo = (record: {
	_cardNo?: unknown;
	rawPayload?: unknown;
} | null | undefined) => {
	const raw = (record?.rawPayload || {}) as any;
	return text(
		record?._cardNo ||
			raw?.cardNo ||
			raw?.CardInfo?.cardNo ||
			raw?.UserInfo?.cardNo,
	);
};

export const resolveFaceAssociationStrategy = (params: {
	vendorUserId: unknown;
	source?: {
		vendorUserId?: unknown;
		employeeNo?: unknown;
		employeeId?: unknown;
		_cardNo?: unknown;
		rawPayload?: unknown;
	} | null;
	target?: {
		vendorUserId?: unknown;
		employeeNo?: unknown;
		employeeId?: unknown;
		_cardNo?: unknown;
		rawPayload?: unknown;
	} | null;
	/** Other records in the same merge group (conflict scan). */
	groupRecords?: Array<{
		vendorUserId?: unknown;
		employeeNo?: unknown;
		employeeId?: unknown;
		_cardNo?: unknown;
		rawPayload?: unknown;
	}> | null;
}): FaceAssociationResolution => {
	const vendorUserId = text(params.vendorUserId);
	const sourceVendor = recordVendorPersonId(params.source) || vendorUserId;
	const targetVendor = recordVendorPersonId(params.target) || vendorUserId;
	const sourceEmployeeId = text(params.source?.employeeId);
	const targetEmployeeId = text(params.target?.employeeId);
	const sourceCardNo = recordCardNo(params.source);
	const targetCardNo = recordCardNo(params.target);
	const sameVendorPeer = Boolean(
		vendorUserId &&
			sourceVendor === vendorUserId &&
			targetVendor === vendorUserId,
	);
	const employeeConflict = Boolean(
		sourceEmployeeId &&
			targetEmployeeId &&
			sourceEmployeeId !== targetEmployeeId,
	);
	const cardConflict = Boolean(
		sourceCardNo && targetCardNo && sourceCardNo !== targetCardNo,
	);
	const groupEmployeeIds = [
		...new Set(
			(params.groupRecords || [])
				.map((record) => text(record.employeeId))
				.filter(Boolean),
		),
	];
	const groupEmployeeConflict = groupEmployeeIds.length > 1;
	const groupCardValues = [
		...new Set(
			(params.groupRecords || [])
				.map((record) => recordCardNo(record))
				.filter(Boolean),
		),
	];
	const groupCardConflict = groupCardValues.length > 1;

	if (employeeConflict || groupEmployeeConflict) {
		return {
			strategy: null,
			blockingReason: "physical_identity_adjudication_required",
			recommendationReason:
				"Source and target (or fleet peers for this vendor id) map to different canonical HRIS employees; physical identity adjudication is required before mutation.",
			sameVendorPeer,
			employeeConflict: true,
			cardConflict,
		};
	}
	if (cardConflict || groupCardConflict) {
		return {
			strategy: null,
			blockingReason: "physical_identity_adjudication_required",
			recommendationReason:
				"Source and target report different physical card values for this association; physical identity adjudication is required before mutation.",
			sameVendorPeer,
			employeeConflict,
			cardConflict: true,
		};
	}
	if (sourceCardNo && targetCardNo && sourceCardNo === targetCardNo) {
		return {
			strategy: "exact_shared_card",
			blockingReason: null,
			recommendationReason: null,
			sameVendorPeer,
			employeeConflict: false,
			cardConflict: false,
		};
	}
	if (
		sourceEmployeeId &&
		targetEmployeeId &&
		sourceEmployeeId === targetEmployeeId
	) {
		return {
			strategy: "canonical_hris_employee",
			blockingReason: null,
			recommendationReason: null,
			sameVendorPeer,
			employeeConflict: false,
			cardConflict: false,
		};
	}
	// Peer copy on the same plain device person id with no hard conflict.
	// Missing HRIS link / missing card is agent recovery for optional linkage,
	// not a dual-owner enroll stop.
	if (sameVendorPeer) {
		return {
			strategy: "same_vendor_user_id",
			blockingReason: null,
			recommendationReason: null,
			sameVendorPeer: true,
			employeeConflict: false,
			cardConflict: false,
		};
	}
	return {
		strategy: null,
		blockingReason: "physical_identity_adjudication_required",
		recommendationReason:
			"Neither an exact shared physical card, the same canonical HRIS employee, nor the same plain vendor person id proves this face source/target association.",
		sameVendorPeer: false,
		employeeConflict,
		cardConflict,
	};
};

/**
 * True when a fingerprint/face write may treat source and target as the same
 * person for mutation. Prefers shared HRIS employeeId; falls back to same plain
 * vendor person id when the merge group has no employeeId conflict.
 */
export const proveCanonicalDeviceIdentity = (params: {
	vendorUserId: unknown;
	source?: {
		vendorUserId?: unknown;
		employeeNo?: unknown;
		employeeId?: unknown;
	} | null;
	target?: {
		vendorUserId?: unknown;
		employeeNo?: unknown;
		employeeId?: unknown;
	} | null;
	groupRecords?: Array<{
		vendorUserId?: unknown;
		employeeNo?: unknown;
		employeeId?: unknown;
	}> | null;
}): {
	proven: boolean;
	via: "canonical_hris_employee" | "same_vendor_user_id" | null;
	reason: string | null;
} => {
	const vendorUserId = text(params.vendorUserId);
	const sourceEmployeeId = text(params.source?.employeeId);
	const targetEmployeeId = text(params.target?.employeeId);
	const groupEmployeeIds = [
		...new Set(
			(params.groupRecords || [])
				.map((record) => text(record.employeeId))
				.filter(Boolean),
		),
	];
	if (groupEmployeeIds.length > 1) {
		return {
			proven: false,
			via: null,
			reason:
				"Fleet records for this vendor person map to more than one canonical HRIS employee.",
		};
	}
	if (
		sourceEmployeeId &&
		targetEmployeeId &&
		sourceEmployeeId !== targetEmployeeId
	) {
		return {
			proven: false,
			via: null,
			reason:
				"Source and target resolve to different canonical HRIS employees.",
		};
	}
	if (
		sourceEmployeeId &&
		targetEmployeeId &&
		sourceEmployeeId === targetEmployeeId &&
		(groupEmployeeIds.length === 0 ||
			groupEmployeeIds.every((id) => id === sourceEmployeeId))
	) {
		return {
			proven: true,
			via: "canonical_hris_employee",
			reason: null,
		};
	}
	const sourceVendor = recordVendorPersonId(params.source) || vendorUserId;
	const targetVendor = recordVendorPersonId(params.target) || vendorUserId;
	if (
		vendorUserId &&
		sourceVendor === vendorUserId &&
		targetVendor === vendorUserId
	) {
		return {
			proven: true,
			via: "same_vendor_user_id",
			reason: null,
		};
	}
	return {
		proven: false,
		via: null,
		reason:
			"Canonical source/target HRIS identity is not proven and vendor person ids do not match for peer copy.",
	};
};

/**
 * Final fingerprint readiness gate.
 *
 * Fleet-wide owner-scan completeness is soft evidence for operators and for
 * target_owner_capture export jobs. It must NOT block every ready FP write when
 * *this* write already has proven source custody and a safe target state for the
 * same identity (empty target FP or complete target checksums). Unknown other
 * owners remain export work, not a permanent physical enroll stop.
 *
 * Identity proof: same non-empty HRIS employeeId on source/target, or same
 * plain vendor person id with no group employee conflict (peer copy). Matching
 * vendor numbers with conflicting employeeIds still block.
 */
export const gateFingerprintWritesForTargetOwnerScan = (params: {
	users: DeviceUserMergeGroup[];
	writes: DeviceUserCredentialWrite[];
}): {
	writes: DeviceUserCredentialWrite[];
	targetOwnerScans: FingerprintTargetOwnerScanSummary[];
} => {
	const records = params.users.flatMap((user) => user.records);
	const targetDeviceIds = [
		...new Set(
			params.writes
				.filter((write) => write.modality === "fingerprint")
				.map((write) => write.targetDeviceId),
		),
	].sort((left, right) => left.localeCompare(right));
	const targetOwnerScans = targetDeviceIds.map((targetDeviceId) => {
		const missingVendorUserIds = [
			...new Set(
				records
					.filter(
						(record) =>
							record.deviceId === targetDeviceId &&
							credentialCount(record, "fingerprint") > 0 &&
							!completeFingerprintChecksumEvidence(record),
					)
					.map((record) => text(record.vendorUserId || record.employeeNo))
					.filter(Boolean),
			),
		].sort((left, right) => left.localeCompare(right));
		return {
			targetDeviceId,
			complete: missingVendorUserIds.length === 0,
			missingCount: missingVendorUserIds.length,
			evidenceHash: createHash("sha256")
				.update(JSON.stringify(missingVendorUserIds))
				.digest("hex"),
			missingVendorUserIds,
		};
	});
	const targetOwnerScanByDeviceId = new Map(
		targetOwnerScans.map((scan) => [scan.targetDeviceId, scan]),
	);
	const writes = params.writes.map(
		(write): DeviceUserCredentialWrite => {
		if (
			write.modality !== "fingerprint" ||
			write.executionEligibility !== "ready_from_raw_blob"
		) {
			return write;
		}
		const user = params.users.find(
			(candidate) => text(candidate.key) === text(write.userKey),
		);
		const source = user?.records.find(
			(record) => record.deviceId === write.sourceDeviceId,
		);
		const target = user?.records.find(
			(record) => record.deviceId === write.targetDeviceId,
		);
		const identity = proveCanonicalDeviceIdentity({
			vendorUserId: write.vendorUserId,
			source,
			target,
			groupRecords: user?.records || [],
		});
		const canonicalIdentityProven = identity.proven;
		const targetOwnerScan = targetOwnerScanByDeviceId.get(
			write.targetDeviceId,
		) || {
			targetDeviceId: write.targetDeviceId,
			complete: true,
			missingCount: 0,
			evidenceHash: createHash("sha256").update("[]").digest("hex"),
			missingVendorUserIds: [],
		};
		const targetOwnerScanComplete = targetOwnerScan.complete;
		const boundedOwnerScanEvidence = {
			targetOwnerScanComplete,
			targetOwnerScanMissingCount: targetOwnerScan.missingCount,
			targetOwnerScanEvidenceHash: targetOwnerScan.evidenceHash,
			targetOwnerScanMissingVendorUserIdSample:
				targetOwnerScan.missingVendorUserIds.slice(0, 3),
		};
		if (!canonicalIdentityProven) {
			return {
				...write,
				recommended: false,
				executionEligibility: "blocked",
				blockingReason: "canonical_identity_unproven",
				recoveryStage: "comparing_sources",
				recommendationReason:
					identity.reason ||
					"Canonical source/target HRIS identity is not proven. Resolve the exact employee linkage before mutation.",
				canonicalIdentityProven,
				...boundedOwnerScanEvidence,
			};
		}
		// Full fleet owner scan complete → keep prior ready path (planner already
		// classified ready_from_raw_blob).
		if (targetOwnerScanComplete) {
			return {
				...write,
				canonicalIdentityProven,
				...boundedOwnerScanEvidence,
			};
		}
		// Incomplete fleet scan: allow *this* write only when source has complete
		// checksum custody and the same identity on target is empty or complete.
		// Other owners' missing exports stay on the scan summary / capture jobs.
		const sourceCustodyComplete = Boolean(
			source && completeFingerprintChecksumEvidence(source),
		);
		const targetFpCount = target
			? credentialCount(target, "fingerprint")
			: 0;
		const thisTargetSafeForWrite =
			!target ||
			targetFpCount === 0 ||
			completeFingerprintChecksumEvidence(target);
		if (sourceCustodyComplete && thisTargetSafeForWrite) {
			return {
				...write,
				canonicalIdentityProven,
				...boundedOwnerScanEvidence,
				recommendationReason: `Fingerprint write allowed for this identity with proven source custody while ${targetOwnerScan.missingCount} other target owners still need export (fleet scan incomplete).`,
			};
		}
		// This identity still lacks exportable custody on source or target.
		return {
			...write,
			recommended: false,
			executionEligibility: "blocked",
			blockingReason: "target_owner_scan_incomplete",
			recoveryStage: "exporting_source_credential",
			recommendationReason: !sourceCustodyComplete
				? `Source fingerprint checksum custody is incomplete for vendor user ${text(write.vendorUserId)}. Export source templates before mutation.`
				: `Target fingerprint checksum custody is incomplete for vendor user ${text(write.vendorUserId)} (${targetOwnerScan.missingCount} fleet owners also pending). Export and checksum this target owner before mutation.`,
			canonicalIdentityProven,
			...boundedOwnerScanEvidence,
		};
		},
	);
	return { writes, targetOwnerScans };
};

const checksumSet = (record: DeviceUserMergeRecord) =>
	new Set(
		normalizedFingerprintChecksums(record).map(
			(template) => `${template.fingerPrintId}:${template.checksum}`,
		),
	);

const setIsSubset = (subset: Set<string>, superset: Set<string>) =>
	[...subset].every((checksum) => superset.has(checksum));

const fingerprintRecordsConflict = (
	source: DeviceUserMergeRecord,
	other: DeviceUserMergeRecord,
) => {
	if (
		!completeFingerprintChecksumEvidence(source) ||
		!completeFingerprintChecksumEvidence(other)
	) {
		return false;
	}
	const sourceBySlot = new Map(
		normalizedFingerprintChecksums(source).map((template) => [
			template.fingerPrintId,
			template.checksum,
		]),
	);
	const sameSlotDiffers = normalizedFingerprintChecksums(other).some(
		(template) =>
			sourceBySlot.has(template.fingerPrintId) &&
			sourceBySlot.get(template.fingerPrintId) !== template.checksum,
	);
	return sameSlotDiffers || !setIsSubset(checksumSet(other), checksumSet(source));
};

/**
 * Resolve raw fingerprint sources for recovery writes.
 *
 * Preference order (product rule 2026-07-25, operator-authorized):
 * 1. Equal checksum sets → stable representative.
 * 2. Single strict checksum superset.
 * 3. Otherwise **richest by template count** with raw custody (default overwrite).
 *    Target templates that differ may be overwritten by the selected source.
 *
 * Different-owner slot collisions on the physical target remain blocked later by
 * physical_identity_adjudication_required — that is not a same-person richest pick.
 */
export const resolveFingerprintCredentialSource = (
	rawSources: DeviceUserMergeRecord[],
): FingerprintSourceResolution => {
	const candidates = [...rawSources].sort((left, right) =>
		left.deviceId.localeCompare(right.deviceId),
	);
	const candidateDeviceIds = candidates.map((record) => record.deviceId);
	if (candidates.length === 0) {
		return { source: null, candidateDeviceIds, reason: "unproven" };
	}
	if (candidates.length === 1) {
		return {
			source: candidates[0],
			candidateDeviceIds,
			reason: "single_raw_source",
		};
	}
	const completeCandidates = candidates.filter((record) =>
		completeFingerprintChecksumEvidence(record),
	);
	if (completeCandidates.length >= 2) {
		const sets = completeCandidates.map(checksumSet);
		const allEqual = sets.every(
			(candidate) =>
				candidate.size === sets[0].size && setIsSubset(candidate, sets[0]),
		);
		if (allEqual) {
			return {
				source: completeCandidates[0],
				candidateDeviceIds,
				reason: "equal_checksum_sets",
			};
		}
		const strictSupersets = completeCandidates.filter(
			(candidate, candidateIndex) =>
				sets.every(
					(other, otherIndex) =>
						otherIndex === candidateIndex ||
						(setIsSubset(other, sets[candidateIndex]) &&
							other.size < sets[candidateIndex].size),
				),
		);
		if (strictSupersets.length === 1) {
			return {
				source: strictSupersets[0],
				candidateDeviceIds,
				reason: "strict_checksum_superset",
			};
		}
	}
	// Default overwrite path: max reported fingerprint count, prefer complete
	// checksum custody, then stable deviceId among ties.
	const countOf = (record: DeviceUserMergeRecord) =>
		credentialCount(record, "fingerprint");
	const pool =
		completeCandidates.length > 0 ? completeCandidates : candidates;
	const maxCount = pool.reduce(
		(max, record) => Math.max(max, countOf(record)),
		0,
	);
	const richest = pool
		.filter((record) => countOf(record) === maxCount)
		.sort((left, right) => left.deviceId.localeCompare(right.deviceId));
	const pick =
		richest.find((record) => completeFingerprintChecksumEvidence(record)) ||
		richest[0] ||
		null;
	return pick
		? {
				source: pick,
				candidateDeviceIds,
				reason: "richest_count_default_overwrite",
			}
		: { source: null, candidateDeviceIds, reason: "unproven" };
};

const buildCredentialWritesForUser = (
	user: DeviceUserMergeGroup,
): DeviceUserCredentialWrite[] => {
	const vendorUserId = text(user.vendorUserIds[0]);
	if (!vendorUserId) return [];
	const writes: DeviceUserCredentialWrite[] = [];
	for (const modality of ["fingerprint", "face", "card"] as const) {
		const records = user.records.map((record) => ({
			record,
			count: credentialCount(record, modality),
			evidenceStatus: credentialEvidenceStatus(record, modality),
		}));
		const maxCount = records.reduce((max, item) => Math.max(max, item.count), 0);
		if (maxCount <= 0) continue;
		const maxSources = records.filter((item) => item.count === maxCount);
		const rawSources = maxSources.filter((item) => item.evidenceStatus === "raw_blob_present");
		const allRawFingerprintSources =
			modality === "fingerprint"
				? records.filter(
						(item) =>
							item.count > 0 &&
							item.evidenceStatus === "raw_blob_present",
					)
				: [];
		const fingerprintResolution =
			modality === "fingerprint" && rawSources.length > 0
				? resolveFingerprintCredentialSource(
						rawSources.map((item) => item.record),
					)
				: null;
		if (
			fingerprintResolution?.source &&
			completeFingerprintChecksumEvidence(fingerprintResolution.source)
		) {
			const selectedSet = checksumSet(fingerprintResolution.source);
			const lowerCompleteSources = allRawFingerprintSources
				.map((item) => item.record)
				.filter(
					(record) =>
						record.deviceId !== fingerprintResolution.source?.deviceId &&
						completeFingerprintChecksumEvidence(record),
				);
			if (
				lowerCompleteSources.length > 0 &&
				lowerCompleteSources.every((record) =>
					setIsSubset(checksumSet(record), selectedSet),
				) &&
				lowerCompleteSources.some(
					(record) => checksumSet(record).size < selectedSet.size,
				)
			) {
				fingerprintResolution.reason = "strict_checksum_superset";
			}
		}
		const preferredSources =
			modality === "fingerprint" && rawSources.length > 0
				? rawSources
				: modality === "card" && rawSources.length > 1
					? rawSources.filter((item) => {
							const raw = (item.record.rawPayload || {}) as any;
							const value = text(
								item.record._cardNo ||
									raw?.cardNo ||
									raw?.CardInfo?.cardNo ||
									raw?.UserInfo?.cardNo,
							);
							const values = new Set(
								rawSources.map((candidate) => {
									const candidateRaw = (candidate.record.rawPayload || {}) as any;
									return text(
										candidate.record._cardNo ||
											candidateRaw?.cardNo ||
											candidateRaw?.CardInfo?.cardNo ||
											candidateRaw?.UserInfo?.cardNo,
									);
								}),
							);
							return values.size === 1 && Boolean(value);
						})
					: rawSources.length === 1
						? rawSources
						: maxSources;
		const uniqueSource =
			modality === "fingerprint" && fingerprintResolution
				? fingerprintResolution.source
					? preferredSources.find(
							(item) =>
								item.record.deviceId === fingerprintResolution.source?.deviceId,
						) ||
						// Resolution may pick from all-raw pool; map by deviceId.
						(fingerprintResolution.source
							? {
									record: fingerprintResolution.source,
									count: credentialCount(
										fingerprintResolution.source,
										"fingerprint",
									),
									evidenceStatus: credentialEvidenceStatus(
										fingerprintResolution.source,
										"fingerprint",
									),
								}
							: null)
					: null
				: modality === "face" && rawSources.length > 0
					? // Face: default richest (max count) raw source; stable deviceId on ties.
						[...rawSources].sort((left, right) => {
							const countDiff = right.count - left.count;
							if (countDiff !== 0) return countDiff;
							return left.record.deviceId.localeCompare(right.record.deviceId);
						})[0]
					: modality === "card" && preferredSources.length > 1
						? [...preferredSources].sort((left, right) =>
								left.record.deviceId.localeCompare(right.record.deviceId),
							)[0]
						: preferredSources.length === 1
							? preferredSources[0]
							: null;
		const sourceDeviceId = uniqueSource?.record.deviceId || null;
		const sourceEvidenceStatus =
			uniqueSource?.evidenceStatus ||
			(maxSources[0]?.evidenceStatus as DeviceUserCredentialWrite["sourceEvidenceStatus"]) ||
			"not_enrolled";
		for (const target of records.filter((item) => item.count < maxCount)) {
			const fingerprintCustodyConflict =
				modality === "fingerprint" &&
				uniqueSource &&
				fingerprintRecordsConflict(uniqueSource.record, target.record);
			// Same-person richest-source overwrite is authorized: do not block when
			// target has different checksums for this vendor id. Cards still require
			// exact value equality among tied max sources.
			const blockingReason =
				modality === "card"
					? !uniqueSource
						? "source_conflict"
						: sourceEvidenceStatus !== "raw_blob_present"
							? "missing_raw_blob"
							: target.record.biometricEvidence?.card?.writerAvailable ===
								  true
								? null
								: "credential_only_card_not_supported"
					: !uniqueSource
						? "source_conflict"
						: sourceEvidenceStatus !== "raw_blob_present"
							? "missing_raw_blob"
							: modality === "face" && !faceCustodyIsWritable(uniqueSource.record)
								? "target_write_unsupported"
								: null;
			const executionEligibility = blockingReason ? "blocked" : "ready_from_raw_blob";
			const sourceCandidateDeviceIds =
				fingerprintResolution?.candidateDeviceIds ||
				(modality === "card" && rawSources.length > 0 ? rawSources : preferredSources).map(
					(item) => item.record.deviceId,
				);
			const richestOverwriteNote =
				modality === "fingerprint" &&
				Boolean(uniqueSource) &&
				!blockingReason &&
				(fingerprintResolution?.reason === "richest_count_default_overwrite" ||
					fingerprintCustodyConflict)
					? `RICHEST SOURCE OVERWRITE: copy ${maxCount} fingerprint template(s) from the richest raw source onto this target. Existing different target templates for this same vendor id will be replaced after physical reread proof.`
					: modality === "face" && Boolean(uniqueSource) && !blockingReason
						? `RICHEST SOURCE: copy face custody from the highest-count raw source. Target may be overwritten for this same vendor id after physical reread proof.`
						: null;
			writes.push({
				id: [
					user.key,
					modality,
					sourceDeviceId || sourceCandidateDeviceIds.join("+") || "none",
					target.record.deviceId,
				].join(":"),
				userKey: user.key,
				vendorUserId,
				modality,
				sourceDeviceId,
				targetDeviceId: target.record.deviceId,
				sourceReportedCount: maxCount,
				targetReportedCount: target.count,
				sourceEvidenceStatus,
				recommended:
					Boolean(sourceDeviceId) && executionEligibility === "ready_from_raw_blob",
				recommendationReason: blockingReason
					? blockingReason === "source_conflict"
						? modality === "card"
							? "Multiple devices report the same highest card count; exact card-value equality is not proven."
							: `Multiple devices report the same highest ${modality} count and no raw richest source could be selected.`
						: blockingReason === "missing_raw_blob"
							? `Recovery stage: capture current physical ${modality} custody from each evidenced source, checksum it, and regenerate the plan.`
							: blockingReason === "target_write_unsupported"
								? "Recovery stage: probe and attest the target's SDK face-template or FDLib picture writer, then run one serial reread-proven canary."
								: "Recovery stage: prove CardInfo record capability and exact card ownership, then run one serial reread-proven canary."
					: richestOverwriteNote
						? richestOverwriteNote
						: modality === "fingerprint" &&
							  fingerprintResolution?.reason === "equal_checksum_sets"
							? "Equivalent raw fingerprint custody is proven by equal checksum sets; the stable source representative is safe."
							: modality === "fingerprint" &&
								  fingerprintResolution?.reason === "strict_checksum_superset"
								? "The selected raw fingerprint source is the only checksum-proven strict superset."
								: `A single highest-count source has evidenced raw ${modality} custody and a credential-only target write path.`,
				executionEligibility,
				blockingReason,
				recoveryStage:
					blockingReason === "missing_raw_blob"
						? "queued_source_custody_recovery"
						: blockingReason === "source_conflict"
							? // Face/FP with no selected raw source is agent export work
								// (capture candidates), not dual-owner / physical compare.
								// Cards still use comparing_sources for value equality.
								modality === "card"
								? "comparing_sources"
								: "exporting_source_credential"
							: blockingReason === "target_write_unsupported"
								? "probing_target_capability"
								: blockingReason === "credential_only_card_not_supported"
									? "probing_target_capability"
									: "ready_to_write",
				sourceCandidateDeviceIds,
				sourceFingerprintTemplateChecksums:
					modality === "fingerprint" && uniqueSource
						? normalizedFingerprintChecksums(uniqueSource.record)
						: [],
				physicalRereadRequired: true,
			});
		}
	}
	return writes;
};


const recordId = (record: DeviceUserMergeRecord, index: number) =>
	text((record as any).id) ||
	`${text(record.deviceId) || "device"}:${text(record.vendorUserId) || text(record.employeeNo) || "unknown"}:${index}`;

const buildIdentityGroups = (records: DeviceUserMergeRecord[]) => {
	const parent = records.map((_, index) => index);
	const find = (index: number): number => {
		let current = index;
		while (parent[current] !== current) {
			parent[current] = parent[parent[current]];
			current = parent[current];
		}
		return current;
	};
	const union = (left: number, right: number) => {
		const leftRoot = find(left);
		const rightRoot = find(right);
		if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
	};
	const seen = new Map<string, number>();
	const connect = (key: string, index: number) => {
		if (!text(key)) return;
		const existing = seen.get(key);
		if (existing === undefined) seen.set(key, index);
		else union(existing, index);
	};

	records.forEach((record, index) => {
		if (text(record.vendorUserId)) connect(`vendor:${text(record.vendorUserId)}`, index);
		if (text(record.employeeNo)) connect(`employee-no:${text(record.employeeNo)}`, index);
		if (!text(record.vendorUserId) && !text(record.employeeNo) && text(record.employeeId)) {
			connect(`employee:${text(record.employeeId)}`, index);
		}
		if (
			!text(record.vendorUserId) &&
			!text(record.employeeNo) &&
			!text(record.employeeId) &&
			text(record.identityName)
		) {
			connect(`identity:${text(record.identityName).toLocaleLowerCase()}`, index);
		}
	});

	const groups = new Map<number, DeviceUserMergeRecord[]>();
	records.forEach((record, index) => {
		const root = find(index);
		const group = groups.get(root) || [];
		group.push(record);
		groups.set(root, group);
	});
	return groups;
};

const groupKeyForRecords = (records: DeviceUserMergeRecord[]) => {
	const vendorIds = [...new Set(records.map((record) => text(record.vendorUserId)).filter(Boolean))];
	if (vendorIds.length === 1) return `vendor:${vendorIds[0]}`;
	const employeeNos = [...new Set(records.map((record) => text(record.employeeNo)).filter(Boolean))];
	if (employeeNos.length === 1) return `employee-no:${employeeNos[0]}`;
	const employeeIds = [...new Set(records.map((record) => text(record.employeeId)).filter(Boolean))];
	if (employeeIds.length === 1) return `employee:${employeeIds[0]}`;
	return identityKey(records[0]);
};

const collapseDuplicateDeviceRows = (records: DeviceUserMergeRecord[]) => {
	const byDeviceAndVendor = new Map<string, DeviceUserMergeRecord[]>();
	for (const record of records) {
		const key = `${text(record.deviceId)}:${text(record.vendorUserId) || text(record.employeeNo)}`;
		const group = byDeviceAndVendor.get(key) || [];
		group.push(record);
		byDeviceAndVendor.set(key, group);
	}
	const keptRecords: DeviceUserMergeRecord[] = [];
	const duplicateSourceRows: DeviceUserMergeDuplicateSource[] = [];
	for (const group of byDeviceAndVendor.values()) {
		const ordered = [...group].sort(
			(a, b) =>
				sourceScore(b) - sourceScore(a) ||
				text(a.deviceId).localeCompare(text(b.deviceId)) ||
				text(a.vendorUserId).localeCompare(text(b.vendorUserId)),
		);
		const kept = ordered[0];
		keptRecords.push(kept);
		if (ordered.length <= 1) continue;
		const differingFields = DEVICE_USER_MERGE_FIELDS.filter((field) => {
			const distinct = new Set(ordered.map((record) => stable(valueFor(record, field))));
			return distinct.size > 1;
		});
		duplicateSourceRows.push({
			deviceId: kept.deviceId,
			deviceName: kept.deviceName,
			vendorUserId: kept.vendorUserId,
			sourceRows: ordered.length,
			keptRecordId: recordId(kept, 0),
			duplicateRecordIds: ordered.slice(1).map((record, index) => recordId(record, index + 1)),
			differingFields,
		});
	}
	return { records: keptRecords, duplicateSourceRows };
};

export const buildDeviceUserMergePlan = (params: {
	records: DeviceUserMergeRecord[];
	deviceIds: string[];
	/**
	 * Devices with a successful inventory read in this same plan run.
	 * Failed/unavailable devices must not be treated as "0 IDs read" or
	 * "missing every unique ID" — only successful reads define the union gap.
	 * Defaults to all selected deviceIds when omitted (backward compatible).
	 */
	validDeviceIds?: string[];
}) => {
	const sourceRowCount = params.records.length;
	const selectedDeviceIds = params.deviceIds.map((id) => text(id)).filter(Boolean);
	const validDeviceIds = (
		Array.isArray(params.validDeviceIds) && params.validDeviceIds.length > 0
			? params.validDeviceIds
			: selectedDeviceIds
	)
		.map((id) => text(id))
		.filter(Boolean);
	const validDeviceIdSet = new Set(validDeviceIds);
	const ambiguousMatches: Array<{ record: DeviceUserMergeRecord; candidates: string[] }> = [];
	const mergeableRecords: DeviceUserMergeRecord[] = [];
	for (const record of params.records) {
		if ((record.identityCandidates || []).length > 1) {
			ambiguousMatches.push({ record, candidates: [...(record.identityCandidates || [])] });
			continue;
		}
		mergeableRecords.push(record);
	}

	const users: DeviceUserMergeGroup[] = [];
	for (const records of buildIdentityGroups(mergeableRecords).values()) {
		const key = groupKeyForRecords(records);
		const collapsed = collapseDuplicateDeviceRows(records);
		const ordered = [...collapsed.records].sort((a, b) => a.deviceId.localeCompare(b.deviceId));
		const source =
			[...ordered].sort((a, b) => {
				const score = sourceScore(b) - sourceScore(a);
				return score || a.deviceId.localeCompare(b.deviceId);
			})[0] || ordered[0];
		const conflicts: DeviceUserMergeConflict[] = [];
		// Profile/metadata only — never face/fp/card count (those are credential residual).
		for (const field of DEVICE_USER_MERGE_DECISION_FIELDS) {
			const populated = ordered.filter(
				(record) =>
					valueFor(record, field) !== null &&
					valueFor(record, field) !== undefined &&
					conflictStable(field, valueFor(record, field)) !== "",
			);
			const distinct = [
				...new Set(populated.map((record) => conflictStable(field, valueFor(record, field)))),
			];
			if (distinct.length < 2) continue;
			const a = populated[0];
			const b =
				populated.find(
					(record) =>
						conflictStable(field, valueFor(record, field)) !==
						conflictStable(field, valueFor(a, field)),
				) || populated[1];
			conflicts.push({
				field,
				choice: null,
				deviceA: { id: a.deviceId, name: a.deviceName, value: valueFor(a, field) },
				deviceB: { id: b.deviceId, name: b.deviceName, value: valueFor(b, field) },
			});
		}
		const presentOnDeviceIds = new Set(ordered.map((record) => record.deviceId));
		const missingOnDeviceIds = validDeviceIds.filter((id) => !presentOnDeviceIds.has(id));
		// A write is an evidenced missing physical record, not every theoretical
		// source/peer permutation. Existing conflicts remain review decisions and
		// may not inflate the executable write matrix.
		const targetDeviceIds = [...missingOnDeviceIds];
		users.push({
			key,
			employeeId: ordered.find((record) => text(record.employeeId))?.employeeId || null,
			employee: null,
			vendorUserIds: [
				...new Set(ordered.map((record) => text(record.vendorUserId)).filter(Boolean)),
			],
			records: ordered,
			sourceRows: records.length,
			duplicateSourceRows: collapsed.duplicateSourceRows,
			sourceDeviceId: source.deviceId,
			targetDeviceIds,
			conflicts,
			missingOnDeviceIds,
		});
	}
	const idsReadByDevice: Record<string, number> = {};
	for (const id of selectedDeviceIds) idsReadByDevice[id] = 0;
	for (const user of users) {
		const seen = new Set(user.records.map((record) => record.deviceId));
		for (const deviceId of seen) {
			if (deviceId in idsReadByDevice) idsReadByDevice[deviceId] += 1;
			else idsReadByDevice[deviceId] = 1;
		}
	}
	const fingerprintReadiness = gateFingerprintWritesForTargetOwnerScan({
		users,
		writes: users.flatMap(buildCredentialWritesForUser),
	});
	const credentialWrites = fingerprintReadiness.writes;
	return {
		deviceIds: selectedDeviceIds,
		validDeviceIds,
		failedDeviceIds: selectedDeviceIds.filter((id) => !validDeviceIdSet.has(id)),
		idsReadByDevice,
		users,
		unionUsers: users,
		onlyOnOneDevice: users.filter((user) => user.missingOnDeviceIds.length > 0),
		ambiguousMatches,
		missingHrisLinks: users.filter((user) => !user.employeeId),
		unreachableDevices: [],
		sdkErrors: [],
		plannedWrites: users.flatMap((user) =>
			user.targetDeviceIds.map((targetDeviceId) => ({ userKey: user.key, targetDeviceId })),
		),
		credentialWrites,
		fingerprintTargetOwnerScans: fingerprintReadiness.targetOwnerScans,
		unresolvedDecisions: [],
		counts: {
			unionUsers: users.length,
			sourceRows: sourceRowCount,
			dedupedDeviceRecords: users.reduce((sum, user) => sum + user.records.length, 0),
			duplicateSourceRows: users.reduce(
				(sum, user) =>
					sum +
					user.duplicateSourceRows.reduce(
						(total, duplicate) => total + Math.max(0, duplicate.sourceRows - 1),
						0,
					),
				0,
			),
			conflicts: users.reduce((sum, user) => sum + user.conflicts.length, 0),
			missing: users.reduce((sum, user) => sum + user.missingOnDeviceIds.length, 0),
			ambiguous: ambiguousMatches.length,
			missingHrisLinks: users.filter((user) => !user.employeeId).length,
			credentialWrites: credentialWrites.length,
			actionableCredentialWrites: credentialWrites.filter(
				(write) => write.executionEligibility === "ready_from_raw_blob",
			).length,
			blockedCredentialWrites: credentialWrites.filter(
				(write) => write.executionEligibility !== "ready_from_raw_blob",
			).length,
			validDevices: validDeviceIds.length,
			failedDevices: selectedDeviceIds.filter((id) => !validDeviceIdSet.has(id)).length,
		},
	};
};

const compactMergeRecordForReview = (record: DeviceUserMergeRecord) => {
	const summary = credentials(record);
	const {
		_fingerprintTemplateChecksums: _omittedChecksums,
		_faceCustodyEvidence: _omittedFaceCustodyEvidence,
		_fdlibFacePictureEvidence: _omittedFdlibFacePictureEvidence,
		_cardNo: _omittedCardNo,
		...safeRecord
	} =
		record as DeviceUserMergeRecord & {
			_fingerprintTemplateChecksums?: unknown;
			_faceCustodyEvidence?: unknown;
			_fdlibFacePictureEvidence?: unknown;
			_cardNo?: unknown;
		};
	return {
		...safeRecord,
		rawPayload: {
			numOfFP: summary.fingerprintCount,
			numOfFace: summary.faceCount,
			numOfCard: summary.cardCount,
		},
	};
};

/**
 * Keep raw SDK payloads in the server-side plan used by apply, but never repeat
 * biometric template material in the browser review response. The former
 * unionUsers/onlyOnOneDevice/missingHrisLinks aliases duplicated the complete
 * user array during JSON serialization and made large six-panel plans unsafe to
 * inspect or download.
 */
export const serializeDeviceUserMergePlanForReview = (plan: any) => ({
	deviceIds: plan.deviceIds || [],
	validDeviceIds: plan.validDeviceIds || plan.deviceIds || [],
	failedDeviceIds: plan.failedDeviceIds || [],
	idsReadByDevice: plan.idsReadByDevice || {},
	devices: plan.devices || [],
	users: (plan.users || []).map((user: DeviceUserMergeGroup) => ({
		...user,
		records: (user.records || []).map(compactMergeRecordForReview),
	})),
	ambiguousMatches: (plan.ambiguousMatches || []).map((match: any) => ({
		...match,
		record: match?.record ? compactMergeRecordForReview(match.record) : match?.record,
	})),
	unreachableDevices: plan.unreachableDevices || [],
	sdkErrors: plan.sdkErrors || [],
	plannedWrites: plan.plannedWrites || [],
	credentialWrites: (plan.credentialWrites || []).map((write: any) => ({
		...write,
		recoveryClassification: classifyCredentialRecoveryWrite(write),
	})),
	potentialOperations: plan.potentialOperations || {
		totalPotentialOperations: (plan.credentialWrites || []).length,
		byModality: { fingerprint: 0, face: 0, card: 0 },
		byRecoveryStage: {},
		alreadyConverged: 0,
		physicalBoundaryOperations: 0,
	},
	unresolvedDecisions: plan.unresolvedDecisions || [],
	counts: plan.counts || {},
	errors: plan.errors || [],
});

/** Millis for date-like conflict values; invalid → 0. */
const dateValueMs = (value: unknown): number => {
	if (value == null || value === "") return 0;
	if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
	const ms = Date.parse(String(value));
	return Number.isFinite(ms) ? ms : 0;
};

/**
 * Agent-owned default for "Needs decision":
 * - validFrom / validTo → pick the **later (more recent)** date between A/B
 * - displayName → longer/more complete name, then richest custody peer
 * - other profile fields → richest custody between A/B
 * Operators may still override via explicit choices / applyAll.
 */
export const buildRichestMergeChoices = (
	plan: ReturnType<typeof buildDeviceUserMergePlan> | { users?: any[] },
): Record<string, Partial<Record<DeviceUserMergeField, MergeChoice>>> => {
	const choices: Record<string, Partial<Record<DeviceUserMergeField, MergeChoice>>> = {};
	const richness = (record: any) => {
		const rawFp = Number(record?.biometricEvidence?.fingerprint?.rawBlobCount || 0);
		const rawFace = Boolean(record?.biometricEvidence?.face?.rawBlobPresent);
		const fp = Number(
			record?.biometricEvidence?.fingerprint?.reportedCount ||
				(record?.rawPayload as any)?.numOfFP ||
				0,
		);
		const face = Number(
			record?.biometricEvidence?.face?.reportedCount ||
				(record?.rawPayload as any)?.numOfFace ||
				0,
		);
		const card = Number(
			record?.biometricEvidence?.card?.reportedCount ||
				(record?.rawPayload as any)?.numOfCard ||
				0,
		);
		return rawFp * 6 + Number(rawFace) * 4 + fp * 2 + face * 2 + card * 3;
	};
	const pickProfileAb = (params: {
		field: string;
		valueA: unknown;
		valueB: unknown;
		recordA: any;
		recordB: any;
		deviceAId: string;
		deviceBId: string;
		richestDeviceId: string;
	}): MergeChoice => {
		const field = params.field;
		// Dates: operator default = latest / most recent calendar value (not bio richness).
		if (field === "validFrom" || field === "validTo") {
			const msA = dateValueMs(params.valueA);
			const msB = dateValueMs(params.valueB);
			if (msB > msA) return "B";
			if (msA > msB) return "A";
		}
		// Names: prefer the longer / more complete display string (e.g. "ernest T571774").
		if (field === "displayName") {
			const lenA = String(params.valueA ?? "").trim().length;
			const lenB = String(params.valueB ?? "").trim().length;
			if (lenB > lenA) return "B";
			if (lenA > lenB) return "A";
		}
		const scoreA = richness(params.recordA);
		const scoreB = richness(params.recordB);
		if (scoreB > scoreA) return "B";
		if (scoreA > scoreB) return "A";
		if (params.deviceAId === params.richestDeviceId) return "A";
		if (params.deviceBId === params.richestDeviceId) return "B";
		return params.deviceAId.localeCompare(params.deviceBId) <= 0 ? "A" : "B";
	};
	for (const user of plan.users || []) {
		const records = Array.isArray(user.records) ? user.records : [];
		const richest = [...records].sort(
			(left: any, right: any) =>
				richness(right) - richness(left) ||
				text(left?.deviceId).localeCompare(text(right?.deviceId)),
		)[0];
		const richestDeviceId = text(richest?.deviceId);
		for (const conflict of user.conflicts || []) {
			const field = conflict.field as DeviceUserMergeField;
			const recordA = records.find(
				(record: any) => text(record.deviceId) === text(conflict.deviceA?.id),
			);
			const recordB = records.find(
				(record: any) => text(record.deviceId) === text(conflict.deviceB?.id),
			);
			// Profile fields (displayName/validFrom/validTo/...) must always pick A or B
			// so decision residual burns via DeviceUser overlay. Never KEEP just because a
			// third richer peer exists outside the two-sided conflict pair.
			if (isDeviceUserMergeProfileOverlayField(String(field || ""))) {
				const choice = pickProfileAb({
					field: String(field || ""),
					valueA: conflict.deviceA?.value,
					valueB: conflict.deviceB?.value,
					recordA,
					recordB,
					deviceAId: text(conflict.deviceA?.id),
					deviceBId: text(conflict.deviceB?.id),
					richestDeviceId,
				});
				choices[user.key] = { ...(choices[user.key] || {}), [field]: choice };
				continue;
			}
			const rawEvidencePresent =
				field === "fingerprint"
					? richest?.biometricEvidence?.fingerprint?.status === "raw_blob_present"
					: field === "face"
						? richest?.biometricEvidence?.face?.status === "raw_blob_present"
						: true;
			// Card/face/FP stay KEEP without raw custody — credential mode owns those writes.
			const choice: MergeChoice = !rawEvidencePresent
				? "KEEP"
				: text(conflict.deviceA?.id) === richestDeviceId
					? "A"
					: text(conflict.deviceB?.id) === richestDeviceId
						? "B"
						: "KEEP";
			choices[user.key] = { ...(choices[user.key] || {}), [field]: choice };
		}
	}
	return choices;
};

/**
 * DeviceUser rows that need an HRIS overlay after profile A/B decisions.
 * Does not invent physical peer creates or biometric bytes. Card/face/FP
 * field conflicts never appear here — credential mode owns those writes.
 */
export const buildProfileOverlayWrites = (
	users: Array<Pick<DeviceUserMergeGroup, "key" | "records" | "conflicts">>,
): Array<{
	userKey: string;
	targetDeviceId: string;
	fields: DeviceUserMergeProfileOverlayField[];
	kind: "deviceuser_profile_overlay";
}> => {
	const writes: Array<{
		userKey: string;
		targetDeviceId: string;
		fields: DeviceUserMergeProfileOverlayField[];
		kind: "deviceuser_profile_overlay";
	}> = [];
	for (const user of users || []) {
		const byTarget = new Map<string, Set<DeviceUserMergeProfileOverlayField>>();
		for (const conflict of user.conflicts || []) {
			if (!isDeviceUserMergeProfileOverlayField(String(conflict.field || ""))) continue;
			if (conflict.choice !== "A" && conflict.choice !== "B") continue;
			const selectedDeviceId =
				conflict.choice === "B"
					? text(conflict.deviceB?.id)
					: text(conflict.deviceA?.id);
			if (!selectedDeviceId) continue;
			const selectedRecord = (user.records || []).find(
				(record) => text(record.deviceId) === selectedDeviceId,
			);
			if (!selectedRecord) continue;
			const selectedValue = conflictStable(
				String(conflict.field || ""),
				valueFor(selectedRecord, conflict.field),
			);
			for (const record of user.records || []) {
				const targetDeviceId = text(record.deviceId);
				if (!targetDeviceId) continue;
				if (
					conflictStable(String(conflict.field || ""), valueFor(record, conflict.field)) ===
					selectedValue
				)
					continue;
				const fields =
					byTarget.get(targetDeviceId) ||
					new Set<DeviceUserMergeProfileOverlayField>();
				fields.add(conflict.field as DeviceUserMergeProfileOverlayField);
				byTarget.set(targetDeviceId, fields);
			}
		}
		for (const [targetDeviceId, fields] of byTarget.entries()) {
			writes.push({
				userKey: user.key,
				targetDeviceId,
				fields: [...fields].sort(),
				kind: "deviceuser_profile_overlay",
			});
		}
	}
	return writes;
};

export const applyMergeChoices = (
	plan: ReturnType<typeof buildDeviceUserMergePlan>,
	params: {
		choices?: Record<string, Record<DeviceUserMergeField, MergeChoice>>;
		applyAll?: MergeChoice;
		selectedUserKeys?: string[];
		/** Default true: when choices/applyAll empty, auto-fill richest (agent-owned). */
		autoResolveDecisions?: boolean;
	} = {},
) => {
	const unresolved: Array<{ key: string; field: DeviceUserMergeField }> = [];
	const selectedUserKeys = Array.isArray(params.selectedUserKeys)
		? new Set(params.selectedUserKeys.map((key) => text(key)).filter(Boolean))
		: null;
	const selectedUsers = selectedUserKeys
		? plan.users.filter((user) => selectedUserKeys.has(user.key))
		: plan.users;
	const hasExplicitChoices =
		Boolean(params.applyAll) ||
		(params.choices && Object.keys(params.choices).length > 0);
	const autoChoices =
		!hasExplicitChoices && params.autoResolveDecisions !== false
			? buildRichestMergeChoices(plan)
			: {};
	const effectiveChoices = hasExplicitChoices ? params.choices || {} : autoChoices;
	const resolved = selectedUsers.map((user) => ({
		...user,
		conflicts: user.conflicts.map((conflict) => {
			const choice =
				effectiveChoices?.[user.key]?.[conflict.field] ||
				params.applyAll ||
				conflict.choice;
			if (!choice) unresolved.push({ key: user.key, field: conflict.field });
			return { ...conflict, choice: choice || null };
		}),
	}));
	// Missing-person peer creates only. Profile A/B decisions are separate
	// DeviceUser overlays — never inflate physical plannedWrites with them.
	const plannedWrites = (plan.plannedWrites || []).filter((write) =>
		selectedUserKeys ? selectedUserKeys.has(write.userKey) : true,
	);
	const profileOverlayWrites = buildProfileOverlayWrites(resolved);
	return {
		...plan,
		users: resolved,
		plannedWrites,
		profileOverlayWrites,
		unresolved,
		unresolvedDecisions: unresolved,
		executable:
			resolved.length > 0 &&
			unresolved.length === 0 &&
			plan.ambiguousMatches.length === 0 &&
			((plan as any).errors || []).length === 0,
		counts: {
			...plan.counts,
			unionUsers: resolved.length,
			conflicts: resolved.reduce((sum, user) => sum + user.conflicts.length, 0),
			missing: resolved.reduce((sum, user) => sum + user.missingOnDeviceIds.length, 0),
			missingHrisLinks: resolved.filter((user) => !user.employeeId).length,
			profileOverlayWrites: profileOverlayWrites.length,
		},
	};
};

export const shouldPreserveBiometricValue = (
	source: unknown,
	target: unknown,
	field: "face" | "fingerprint" | "card",
) =>
	Number(valueFor({ rawPayload: source } as DeviceUserMergeRecord, field)) >=
	Number(valueFor({ rawPayload: target } as DeviceUserMergeRecord, field));
