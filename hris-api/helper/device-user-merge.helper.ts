import { extractHikvisionCredentialSummary } from "./device-user-sync.helper";

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

export type DeviceUserMergeField = (typeof DEVICE_USER_MERGE_FIELDS)[number];
export type MergeChoice = "A" | "B" | "KEEP";
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
		cardNoSha256: string;
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
		| "physical_identity_adjudication_required"
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
	/** Frozen, sorted slot:sha256 custody bound into the reviewed scope hash. */
	sourceFingerprintTemplateChecksums: Array<{
		fingerPrintId: number;
		checksum: string;
	}>;
	/** A transport/SDK success is never enough; execution must re-read this target. */
	physicalRereadRequired: true;
};

export type DurableFingerprintOwnerConflictEvidence = {
	jobId: string;
	vendorUserId: string;
	sourceDeviceId: string;
	targetDeviceId: string;
	fingerPrintId: number;
	conflictingVendorUserId: string;
	observedAt?: string | null;
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
		retainedWrites.push({
			...write,
			recommended: false,
			executionEligibility: "blocked",
			blockingReason: "physical_identity_adjudication_required",
			recoveryStage: "physical_identity_action_required",
			recommendationReason:
				`Physical SDK owner protection reports target vendor user ${owners.join(
					", ",
				)} for fingerprint slot ${slots.join(
					", ",
				)}. Canonical employee plus checksum equivalence is not proven; overwrite is forbidden.`,
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
	reason: "single_raw_source" | "equal_checksum_sets" | "strict_checksum_superset" | "unproven";
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
 * Resolve tied raw fingerprint sources only when checksum custody proves the
 * bytes equivalent or proves one source is a strict superset. Device ordering
 * is used solely to choose a stable representative of already-equal evidence.
 */
export const resolveFingerprintCredentialSource = (
	rawSources: DeviceUserMergeRecord[],
): FingerprintSourceResolution => {
	const candidates = [...rawSources].sort((left, right) =>
		left.deviceId.localeCompare(right.deviceId),
	);
	const candidateDeviceIds = candidates.map((record) => record.deviceId);
	if (candidates.length === 1) {
		return {
			source: candidates[0],
			candidateDeviceIds,
			reason: "single_raw_source",
		};
	}
	if (
		candidates.length < 2 ||
		candidates.some((record) => !completeFingerprintChecksumEvidence(record))
	) {
		return { source: null, candidateDeviceIds, reason: "unproven" };
	}
	const sets = candidates.map(checksumSet);
	const allEqual = sets.every(
		(candidate) => candidate.size === sets[0].size && setIsSubset(candidate, sets[0]),
	);
	if (allEqual) {
		return {
			source: candidates[0],
			candidateDeviceIds,
			reason: "equal_checksum_sets",
		};
	}
	const strictSupersets = candidates.filter((candidate, candidateIndex) =>
		sets.every(
			(other, otherIndex) =>
				otherIndex === candidateIndex ||
				(setIsSubset(other, sets[candidateIndex]) &&
					other.size < sets[candidateIndex].size),
		),
	);
	return strictSupersets.length === 1
		? {
				source: strictSupersets[0],
				candidateDeviceIds,
				reason: "strict_checksum_superset",
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
						) || null
					: null
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
					: !uniqueSource || fingerprintCustodyConflict
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
						? fingerprintCustodyConflict
							? "The target has different fingerprint checksum custody in the same slot or outside the source checksum set; overwrite is forbidden."
							: modality === "card"
								? "Multiple devices report the same highest card count; exact card-value equality is not proven."
								: `Multiple devices report the same highest ${modality} count; template equality is not proven.`
						: blockingReason === "missing_raw_blob"
							? `Recovery stage: capture current physical ${modality} custody from each evidenced source, checksum it, and regenerate the plan.`
							: blockingReason === "target_write_unsupported"
								? "Recovery stage: probe and attest the target's SDK face-template or FDLib picture writer, then run one serial reread-proven canary."
								: "Recovery stage: prove CardInfo record capability and exact card ownership, then run one serial reread-proven canary."
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
							? "comparing_sources"
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
		for (const field of DEVICE_USER_MERGE_FIELDS) {
			const populated = ordered.filter(
				(record) =>
					valueFor(record, field) !== null &&
					valueFor(record, field) !== undefined &&
					stable(valueFor(record, field)) !== "",
			);
			const distinct = [
				...new Set(populated.map((record) => stable(valueFor(record, field)))),
			];
			if (distinct.length < 2) continue;
			const a = populated[0];
			const b =
				populated.find(
					(record) => stable(valueFor(record, field)) !== stable(valueFor(a, field)),
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
	const credentialWrites = users.flatMap(buildCredentialWritesForUser);
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
	credentialWrites: plan.credentialWrites || [],
	unresolvedDecisions: plan.unresolvedDecisions || [],
	counts: plan.counts || {},
	errors: plan.errors || [],
});

export const applyMergeChoices = (
	plan: ReturnType<typeof buildDeviceUserMergePlan>,
	params: {
		choices?: Record<string, Record<DeviceUserMergeField, MergeChoice>>;
		applyAll?: MergeChoice;
		selectedUserKeys?: string[];
	} = {},
) => {
	const unresolved: Array<{ key: string; field: DeviceUserMergeField }> = [];
	const selectedUserKeys = Array.isArray(params.selectedUserKeys)
		? new Set(params.selectedUserKeys.map((key) => text(key)).filter(Boolean))
		: null;
	const selectedUsers = selectedUserKeys
		? plan.users.filter((user) => selectedUserKeys.has(user.key))
		: plan.users;
	const resolved = selectedUsers.map((user) => ({
		...user,
		conflicts: user.conflicts.map((conflict) => {
			const choice =
				params.choices?.[user.key]?.[conflict.field] || params.applyAll || conflict.choice;
			if (!choice) unresolved.push({ key: user.key, field: conflict.field });
			return { ...conflict, choice: choice || null };
		}),
	}));
	const plannedWrites = (plan.plannedWrites || []).filter((write) =>
		selectedUserKeys ? selectedUserKeys.has(write.userKey) : true,
	);
	return {
		...plan,
		users: resolved,
		plannedWrites,
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
