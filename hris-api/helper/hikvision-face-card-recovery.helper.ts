import { createHash, timingSafeEqual } from "crypto";
import { validateHikvisionFdlibFacePicture } from "./hikvision-fdlib-face.helper";

export const HIKVISION_CREDENTIAL_RECOVERY_STAGES = [
	"queued_source_custody_recovery",
	"exporting_source_credential",
	"comparing_sources",
	"resolving_richest_source",
	"probing_target_capability",
	"preparing_writer",
	"ready_to_write",
	"writing",
	"rereading_target",
	"physically_retained",
	"retrying_recoverable_failure",
	"physical_identity_action_required",
	"physical_reenrollment_required",
	"device_firmware_unsupported",
] as const;

export type HikvisionCredentialRecoveryStage =
	(typeof HIKVISION_CREDENTIAL_RECOVERY_STAGES)[number];
export type HikvisionCredentialModality = "fingerprint" | "face" | "card";
export type HikvisionFaceCardWriter =
	| "sdk_face_template_picture"
	| "fdlib_picture_import"
	| "card_info_record";

export const HIKVISION_PHYSICAL_BOUNDARY_STAGES = [
	"physical_identity_action_required",
	"physical_reenrollment_required",
	"device_firmware_unsupported",
] as const satisfies readonly HikvisionCredentialRecoveryStage[];

type Environment = Record<string, string | undefined>;

export type HikvisionDeployedBuildAttestation = {
	exactBuildSha: string;
	imageDigest: string | null;
	source:
		| "PROJECT_TRUTH_BUILD_SHA"
		| "PROJECT_TRUTH_DEPLOYED_COMMIT"
		| "PROJECT_TRUTH_BUILD_COMMIT"
		| "GIT_COMMIT_SHA"
		| "SOURCE_COMMIT";
};

export type HikvisionWriterCapabilityEvidence = {
	deviceId: string;
	model: string;
	firmware: string;
	endpoint: string;
	responseStatus: number | string;
	responseBodyChecksum: string;
	testedWriter: HikvisionFaceCardWriter;
	exactBuildSha: string;
	imageDigest: string | null;
	canaryUserId: string;
	canaryTargetDeviceId: string;
	canaryRetainedChecksum: string;
	physicallyRetained: true;
	timestamp: string;
};

export type HikvisionWriterCapabilityDecision = {
	actionable: boolean;
	reason:
		| "ready_from_physically_proven_tuple"
		| "capability_evidence_missing"
		| "device_tuple_mismatch"
		| "deployed_build_mismatch"
		| "writer_mismatch"
		| "canary_target_mismatch"
		| "physical_reread_missing";
	evidenceChecksum: string | null;
};

export type HikvisionSdkFaceCustody = {
	vendorUserId: string;
	sourceDeviceId: string;
	exportedAt: string;
	templateBase64: string;
	pictureBase64: string;
	templateSha256: string;
	pictureSha256: string;
	templateSize: number;
	pictureSize: number;
	cardOwnerVerified: true;
};

export type HikvisionCardCustody = {
	vendorUserId: string;
	sourceDeviceId: string;
	capturedAt: string;
	cardNo: string;
	cardSha256: string;
};

const text = (value: unknown) => String(value ?? "").trim();
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BUILD_SHA_PATTERN = /^[a-f0-9]{7,64}$/i;
const IMAGE_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/i;

const stableValue = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(stableValue);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => [key, stableValue(item)]),
	);
};

const stableChecksum = (value: unknown) => sha256(JSON.stringify(stableValue(value)));

const constantTimeEqual = (left: string, right: string) => {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const strictBase64 = (value: unknown, label: string) => {
	const encoded = text(value).replace(/\s+/g, "");
	if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
		throw new Error(`${label} is not canonical base64.`);
	}
	const buffer = Buffer.from(encoded, "base64");
	if (!constantTimeEqual(encoded, buffer.toString("base64"))) {
		throw new Error(`${label} failed canonical base64 validation.`);
	}
	return { encoded, buffer };
};

const assertTimestamp = (value: unknown, label: string) => {
	const normalized = text(value);
	const parsed = Date.parse(normalized);
	if (!normalized || !Number.isFinite(parsed)) {
		throw new Error(`${label} timestamp is invalid.`);
	}
	return { normalized, parsed };
};

/**
 * Resolve build truth from deployment-owned metadata only. Manual writer
 * enablement variables are deliberately ignored.
 */
export const resolveHikvisionDeployedBuildAttestation = (
	environment: Environment = process.env,
): HikvisionDeployedBuildAttestation => {
	const candidates = [
		"PROJECT_TRUTH_BUILD_SHA",
		"PROJECT_TRUTH_DEPLOYED_COMMIT",
		"PROJECT_TRUTH_BUILD_COMMIT",
		"GIT_COMMIT_SHA",
		"SOURCE_COMMIT",
	] as const;
	const source = candidates.find((name) => BUILD_SHA_PATTERN.test(text(environment[name])));
	if (!source) {
		throw new Error("Deployed build attestation is missing from image/commit metadata.");
	}
	const imageDigest = text(environment.PROJECT_TRUTH_IMAGE_DIGEST || environment.IMAGE_DIGEST);
	if (imageDigest && !IMAGE_DIGEST_PATTERN.test(imageDigest)) {
		throw new Error("Deployed image digest is invalid.");
	}
	return {
		exactBuildSha: text(environment[source]).toLowerCase(),
		imageDigest: imageDigest ? imageDigest.toLowerCase() : null,
		source,
	};
};

export const createHikvisionWriterCapabilityEvidence = (params: {
	deviceId: unknown;
	model: unknown;
	firmware: unknown;
	endpoint: unknown;
	responseStatus: unknown;
	responseBody: unknown;
	testedWriter: HikvisionFaceCardWriter;
	build: HikvisionDeployedBuildAttestation;
	canaryUserId: unknown;
	canaryTargetDeviceId: unknown;
	canaryRetainedChecksum: unknown;
	physicallyRetained: boolean;
	timestamp?: unknown;
}): HikvisionWriterCapabilityEvidence => {
	const timestamp = assertTimestamp(
		params.timestamp || new Date().toISOString(),
		"Capability evidence",
	).normalized;
	const required = {
		deviceId: text(params.deviceId),
		model: text(params.model),
		firmware: text(params.firmware),
		endpoint: text(params.endpoint),
		canaryUserId: text(params.canaryUserId),
		canaryTargetDeviceId: text(params.canaryTargetDeviceId),
		canaryRetainedChecksum: text(params.canaryRetainedChecksum).toLowerCase(),
	};
	if (Object.values(required).some((value) => !value)) {
		throw new Error("Capability evidence is missing an exact target/canary field.");
	}
	if (
		required.deviceId !== required.canaryTargetDeviceId ||
		params.physicallyRetained !== true ||
		!SHA256_PATTERN.test(required.canaryRetainedChecksum)
	) {
		throw new Error(
			"Writer capability cannot be enabled without exact target physical reread proof.",
		);
	}
	if (!BUILD_SHA_PATTERN.test(params.build.exactBuildSha)) {
		throw new Error("Capability evidence build SHA is invalid.");
	}
	const responseStatus =
		typeof params.responseStatus === "number"
			? params.responseStatus
			: text(params.responseStatus);
	if (responseStatus === "") {
		throw new Error("Capability evidence response status is missing.");
	}
	return {
		...required,
		responseStatus,
		responseBodyChecksum: stableChecksum(params.responseBody),
		testedWriter: params.testedWriter,
		exactBuildSha: params.build.exactBuildSha.toLowerCase(),
		imageDigest: params.build.imageDigest,
		physicallyRetained: true,
		timestamp,
	};
};

/**
 * Safe persistence/log shape: response bodies, biometric bytes, card values,
 * tokens, credentials, and authentication material can never enter evidence.
 */
export const redactHikvisionWriterCapabilityEvidence = (
	evidence: HikvisionWriterCapabilityEvidence,
) => ({
	deviceId: evidence.deviceId,
	model: evidence.model,
	firmware: evidence.firmware,
	endpoint: evidence.endpoint,
	responseStatus: evidence.responseStatus,
	responseBodyChecksum: evidence.responseBodyChecksum,
	testedWriter: evidence.testedWriter,
	exactBuildSha: evidence.exactBuildSha,
	imageDigest: evidence.imageDigest,
	canaryUserId: evidence.canaryUserId,
	canaryTargetDeviceId: evidence.canaryTargetDeviceId,
	canaryRetainedChecksum: evidence.canaryRetainedChecksum,
	physicallyRetained: evidence.physicallyRetained,
	timestamp: evidence.timestamp,
});

export const classifyHikvisionWriterCapability = (params: {
	evidence?: HikvisionWriterCapabilityEvidence | null;
	deviceId: unknown;
	model: unknown;
	firmware: unknown;
	writer: HikvisionFaceCardWriter;
	build: HikvisionDeployedBuildAttestation;
}): HikvisionWriterCapabilityDecision => {
	const evidence = params.evidence;
	if (!evidence) {
		return {
			actionable: false,
			reason: "capability_evidence_missing",
			evidenceChecksum: null,
		};
	}
	const evidenceChecksum = stableChecksum(redactHikvisionWriterCapabilityEvidence(evidence));
	if (
		evidence.model !== text(params.model) ||
		evidence.firmware !== text(params.firmware)
	) {
		return {
			actionable: false,
			reason: "device_tuple_mismatch",
			evidenceChecksum,
		};
	}
	if (
		evidence.exactBuildSha !== params.build.exactBuildSha ||
		evidence.imageDigest !== params.build.imageDigest
	) {
		return {
			actionable: false,
			reason: "deployed_build_mismatch",
			evidenceChecksum,
		};
	}
	if (evidence.testedWriter !== params.writer) {
		return { actionable: false, reason: "writer_mismatch", evidenceChecksum };
	}
	if (evidence.canaryTargetDeviceId !== evidence.deviceId) {
		return {
			actionable: false,
			reason: "canary_target_mismatch",
			evidenceChecksum,
		};
	}
	if (
		evidence.physicallyRetained !== true ||
		!SHA256_PATTERN.test(evidence.canaryRetainedChecksum)
	) {
		return {
			actionable: false,
			reason: "physical_reread_missing",
			evidenceChecksum,
		};
	}
	return {
		actionable: true,
		reason: "ready_from_physically_proven_tuple",
		evidenceChecksum,
	};
};

export const validateHikvisionSdkFaceCustody = (params: {
	vendorUserId: unknown;
	sourceDeviceId: unknown;
	exportedAt: unknown;
	templateBase64: unknown;
	pictureBase64: unknown;
	cardOwnerVerified: unknown;
	now?: number;
	maxAgeMs?: number;
}): HikvisionSdkFaceCustody => {
	const vendorUserId = text(params.vendorUserId);
	const sourceDeviceId = text(params.sourceDeviceId);
	if (!vendorUserId || !sourceDeviceId) {
		throw new Error("SDK face custody requires an exact source identity.");
	}
	if (params.cardOwnerVerified !== true) {
		throw new Error(
			"SDK face custody requires an exact employee-owned CardInfo association.",
		);
	}
	const exportedAt = assertTimestamp(params.exportedAt, "SDK face export");
	const now = params.now ?? Date.now();
	const maxAgeMs = Math.max(1, Math.min(params.maxAgeMs || 2 * 60_000, 10 * 60_000));
	if (exportedAt.parsed > now + 5_000 || now - exportedAt.parsed > maxAgeMs) {
		throw new Error("SDK face custody is stale; export the physical source again.");
	}
	const template = strictBase64(params.templateBase64, "Face template");
	if (template.buffer.length < 32 || template.buffer.length > 1024 * 1024) {
		throw new Error("Face template size is outside the accepted bounds.");
	}
	const picture = validateHikvisionFdlibFacePicture(params.pictureBase64);
	return {
		vendorUserId,
		sourceDeviceId,
		exportedAt: exportedAt.normalized,
		templateBase64: template.encoded,
		pictureBase64: picture.buffer.toString("base64"),
		templateSha256: sha256(template.buffer),
		pictureSha256: picture.sha256,
		templateSize: template.buffer.length,
		pictureSize: picture.size,
		cardOwnerVerified: true,
	};
};

export const buildHikvisionStoredFaceWritePayload = (params: {
	custody: HikvisionSdkFaceCustody;
	targetDeviceId: unknown;
	cardNo: unknown;
}) => {
	const targetDeviceId = text(params.targetDeviceId);
	const cardNo = text(params.cardNo);
	if (!targetDeviceId || !cardNo) {
		throw new Error("Stored face write needs an exact target and current card identity.");
	}
	return {
		targetDeviceId,
		employeeNo: params.custody.vendorUserId,
		cardNo,
		faceTemplate: params.custody.templateBase64,
		facePicture: params.custody.pictureBase64,
		expectedTemplateSha256: params.custody.templateSha256,
		expectedPictureSha256: params.custody.pictureSha256,
	};
};

export const verifyHikvisionStoredFacePhysicalReread = (params: {
	custody: HikvisionSdkFaceCustody;
	targetDeviceId: unknown;
	vendorUserId: unknown;
	templateBase64: unknown;
	pictureBase64: unknown;
	faceCount: unknown;
	identityDigestBefore: unknown;
	identityDigestAfter: unknown;
	fingerprintDigestBefore: unknown;
	fingerprintDigestAfter: unknown;
	cardDigestBefore: unknown;
	cardDigestAfter: unknown;
}) => {
	const targetDeviceId = text(params.targetDeviceId);
	const template = strictBase64(params.templateBase64, "Reread face template");
	const picture = validateHikvisionFdlibFacePicture(params.pictureBase64);
	if (
		!targetDeviceId ||
		text(params.vendorUserId) !== params.custody.vendorUserId ||
		Number(params.faceCount) < 1 ||
		sha256(template.buffer) !== params.custody.templateSha256 ||
		picture.sha256 !== params.custody.pictureSha256 ||
		text(params.identityDigestBefore) !== text(params.identityDigestAfter) ||
		text(params.fingerprintDigestBefore) !== text(params.fingerprintDigestAfter) ||
		text(params.cardDigestBefore) !== text(params.cardDigestAfter)
	) {
		throw new Error(
			"Stored SDK face reread did not prove exact template+picture retention and credential isolation.",
		);
	}
	return {
		physicallyRetained: true as const,
		templateSha256: params.custody.templateSha256,
		pictureSha256: params.custody.pictureSha256,
		faceCount: Number(params.faceCount),
		targetDeviceId,
	};
};

const cardRows = (value: unknown): Record<string, unknown>[] => {
	if (Array.isArray(value)) return value.flatMap(cardRows);
	if (!value || typeof value !== "object") return [];
	const record = value as Record<string, unknown>;
	const nested = record.CardInfoSearch;
	if (nested && typeof nested === "object") return cardRows(nested);
	if ("CardInfo" in record) return cardRows(record.CardInfo);
	if ("cardNo" in record || "employeeNo" in record) return [record];
	return Object.values(record).flatMap(cardRows);
};

export const extractHikvisionCardCustody = (params: {
	response: unknown;
	vendorUserId: unknown;
	sourceDeviceId: unknown;
	capturedAt?: unknown;
}): HikvisionCardCustody => {
	const vendorUserId = text(params.vendorUserId);
	const sourceDeviceId = text(params.sourceDeviceId);
	const capturedAt = assertTimestamp(
		params.capturedAt || new Date().toISOString(),
		"Card custody",
	).normalized;
	const matches = cardRows(params.response).filter(
		(row) => text(row.employeeNo) === vendorUserId && text(row.cardNo),
	);
	const uniqueCards = [...new Set(matches.map((row) => text(row.cardNo)))];
	if (!vendorUserId || !sourceDeviceId || uniqueCards.length !== 1) {
		throw new Error(
			"CardInfo custody requires one exact physical card for the reviewed person.",
		);
	}
	const cardNo = uniqueCards[0];
	if (Buffer.byteLength(cardNo) > 32) {
		throw new Error("CardInfo value exceeds the supported device bound.");
	}
	return {
		vendorUserId,
		sourceDeviceId,
		capturedAt,
		cardNo,
		cardSha256: sha256(cardNo),
	};
};

export const assertHikvisionCardTargetOwnership = (params: {
	custody: HikvisionCardCustody;
	targetCardSearchResponse: unknown;
	targetVendorUserId: unknown;
}) => {
	const targetVendorUserId = text(params.targetVendorUserId);
	if (targetVendorUserId !== params.custody.vendorUserId) {
		throw new Error("Target identity does not match reviewed CardInfo custody.");
	}
	const rows = cardRows(params.targetCardSearchResponse);
	const otherOwner = rows.find(
		(row) =>
			text(row.cardNo) === params.custody.cardNo &&
			text(row.employeeNo) !== targetVendorUserId,
	);
	if (otherOwner) {
		throw new Error("Reviewed card is already owned by another physical target identity.");
	}
	const incompatibleSamePerson = rows.find(
		(row) =>
			text(row.employeeNo) === targetVendorUserId &&
			text(row.cardNo) &&
			text(row.cardNo) !== params.custody.cardNo,
	);
	if (incompatibleSamePerson) {
		throw new Error("Target person has a different current card; overwrite is refused.");
	}
};

export const buildHikvisionCardInfoRecordBody = (custody: HikvisionCardCustody) => ({
	CardInfo: {
		employeeNo: custody.vendorUserId,
		cardNo: custody.cardNo,
		cardType: "normalCard",
		checkCardNo: true,
	},
});

export const assertHikvisionCardInfoWriteAccepted = (response: unknown) => {
	const root =
		response && typeof response === "object" ? (response as Record<string, unknown>) : {};
	const status =
		root.ResponseStatus && typeof root.ResponseStatus === "object"
			? (root.ResponseStatus as Record<string, unknown>)
			: root;
	const statusCode = Number(status.statusCode);
	const statusText = text(status.statusString || status.subStatusCode).toLowerCase();
	if (
		!(
			(Number.isFinite(statusCode) && (statusCode === 0 || statusCode === 1)) ||
			(!Number.isFinite(statusCode) && statusText === "ok")
		)
	) {
		throw new Error(
			`CardInfo Record did not return explicit acceptance (${statusText || "missing_status"}).`,
		);
	}
	return {
		statusCode: Number.isFinite(statusCode) ? statusCode : null,
		statusText: statusText || null,
	};
};

export const verifyHikvisionCardInfoPhysicalReread = (params: {
	custody: HikvisionCardCustody;
	targetDeviceId: unknown;
	rereadResponse: unknown;
	identityDigestBefore: unknown;
	identityDigestAfter: unknown;
	fingerprintDigestBefore: unknown;
	fingerprintDigestAfter: unknown;
	faceDigestBefore: unknown;
	faceDigestAfter: unknown;
}) => {
	const targetDeviceId = text(params.targetDeviceId);
	if (!targetDeviceId) {
		throw new Error("CardInfo physical reread requires an exact target device.");
	}
	const reread = extractHikvisionCardCustody({
		response: params.rereadResponse,
		vendorUserId: params.custody.vendorUserId,
		sourceDeviceId: targetDeviceId,
	});
	if (
		reread.cardSha256 !== params.custody.cardSha256 ||
		text(params.identityDigestBefore) !== text(params.identityDigestAfter) ||
		text(params.fingerprintDigestBefore) !== text(params.fingerprintDigestAfter) ||
		text(params.faceDigestBefore) !== text(params.faceDigestAfter)
	) {
		throw new Error(
			"CardInfo target reread did not prove exact owner/value retention and credential isolation.",
		);
	}
	return {
		physicallyRetained: true as const,
		cardSha256: reread.cardSha256,
		vendorUserId: reread.vendorUserId,
		targetDeviceId,
	};
};

export type HikvisionPotentialCredentialOperation = {
	operationId: string;
	modality: HikvisionCredentialModality;
	recoveryStage: HikvisionCredentialRecoveryStage;
	alreadyConverged?: boolean;
};

export const classifyHikvisionFaceCardGapStage = (params: {
	rawCustodyPresent: boolean;
	targetWriterActionable: boolean;
	writerPrepared?: boolean;
	physicallyRetained?: boolean;
	retryableFailure?: boolean;
	physicalBoundary?: {
		stage:
			| "physical_identity_action_required"
			| "physical_reenrollment_required"
			| "device_firmware_unsupported";
		namedCause: unknown;
		attemptedPaths: unknown[];
		capabilityEvidenceChecksum?: unknown;
	};
}): HikvisionCredentialRecoveryStage => {
	if (params.physicallyRetained) return "physically_retained";
	if (params.physicalBoundary) {
		const namedCause = text(params.physicalBoundary.namedCause);
		const attemptedPaths = params.physicalBoundary.attemptedPaths.map(text).filter(Boolean);
		if (!namedCause || attemptedPaths.length === 0) {
			throw new Error(
				"Physical boundary requires a named cause and completed attempted paths.",
			);
		}
		if (
			params.physicalBoundary.stage === "device_firmware_unsupported" &&
			!SHA256_PATTERN.test(text(params.physicalBoundary.capabilityEvidenceChecksum))
		) {
			throw new Error("Firmware boundary requires current capability response evidence.");
		}
		return params.physicalBoundary.stage;
	}
	if (params.retryableFailure) return "retrying_recoverable_failure";
	if (!params.rawCustodyPresent) return "queued_source_custody_recovery";
	if (!params.targetWriterActionable) return "probing_target_capability";
	if (!params.writerPrepared) return "preparing_writer";
	return "ready_to_write";
};

export const summarizeHikvisionPotentialOperations = (
	operations: HikvisionPotentialCredentialOperation[],
) => {
	const operationIds = new Set<string>();
	const byModality = { fingerprint: 0, face: 0, card: 0 };
	const byRecoveryStage = Object.fromEntries(
		HIKVISION_CREDENTIAL_RECOVERY_STAGES.map((stage) => [stage, 0]),
	) as Record<HikvisionCredentialRecoveryStage, number>;
	let alreadyConverged = 0;
	for (const operation of operations) {
		if (!text(operation.operationId) || operationIds.has(operation.operationId)) {
			throw new Error("Potential operations require unique durable operation IDs.");
		}
		operationIds.add(operation.operationId);
		if (!HIKVISION_CREDENTIAL_RECOVERY_STAGES.includes(operation.recoveryStage)) {
			throw new Error("Potential operation uses an unknown recovery stage.");
		}
		if (operation.alreadyConverged) {
			alreadyConverged += 1;
		} else {
			byModality[operation.modality] += 1;
			byRecoveryStage[operation.recoveryStage] += 1;
		}
	}
	return {
		totalPotentialOperations: operations.length - alreadyConverged,
		byModality,
		byRecoveryStage,
		alreadyConverged,
		physicalBoundaryOperations: HIKVISION_PHYSICAL_BOUNDARY_STAGES.reduce(
			(total, stage) => total + byRecoveryStage[stage],
			0,
		),
	};
};
