import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const HIKVISION_FDLIB_FACE_DATA_RECORD_ENDPOINT =
	"/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json";
export const HIKVISION_FDLIB_FACE_SEARCH_ENDPOINT =
	"/ISAPI/Intelligent/FDLib/FDSearch?format=json";
export const HIKVISION_FDLIB_CAPABILITIES_ENDPOINT =
	"/ISAPI/Intelligent/FDLib/capabilities?format=json";

export type HikvisionFdlibFaceWriterAttestation = {
	status?: unknown;
	testedBuildAttestation?: unknown;
	endpoint?: unknown;
	uploadMode?: unknown;
	fdId?: unknown;
	faceLibType?: unknown;
	allowedRequesterAddresses?: unknown;
};

export type HikvisionFdlibTargetClassification = {
	actionable: boolean;
	writer: "fdlib_picture_import" | "device_firmware_unsupported";
	reason:
		| "ready"
		| "capability_probe_not_supported"
		| "url_upload_not_supported"
		| "build_attestation_missing"
		| "build_attestation_mismatch"
		| "target_attestation_invalid"
		| "authorized_canary_ready"
		| "fleet_capability_match_ready";
	fdId: string | null;
	faceLibType: "blackFD" | "staticFD" | null;
	allowedRequesterAddresses: string[];
	capabilityEvidenceSha256: string;
};

/**
 * When a peer device already has a reread-proven FDLib picture writer for the
 * same capability payload + exact build, a newly online sibling with matching
 * live capability evidence becomes actionable without waiting for a second
 * serial canary. Requester addresses must still be the physical target.
 */
export type HikvisionFdlibFleetProvenAttestation = {
	capabilityEvidenceSha256?: unknown;
	testedBuildAttestation?: unknown;
	fdId?: unknown;
	faceLibType?: unknown;
	status?: unknown;
	endpoint?: unknown;
	uploadMode?: unknown;
};

export type ValidatedFacePicture = {
	buffer: Buffer;
	contentType: "image/jpeg" | "image/png";
	sha256: string;
	size: number;
};

export type HikvisionCredentialWriteLeaseProof = {
	leaseId: string;
	organizationId: string;
	scopeHash: string;
	deviceIds: string[];
	acquiredAt: string;
};

export type HikvisionFdlibPrewriteEvidence = {
	expectedVendorUserId: string;
	targetIdentityVendorUserId: string;
	targetCardOwnerVendorUserId: string | null;
	targetFaceCount: number;
	duplicateFaceOwnerVendorUserIds: string[];
};

export type HikvisionFdlibRereadEvidence = {
	vendorUserId: string;
	faceCount: number;
	pictureBase64: string;
	identityDigestBefore: string;
	identityDigestAfter: string;
	fingerprintDigestBefore: string;
	fingerprintDigestAfter: string;
	cardDigestBefore: string;
	cardDigestAfter: string;
};

const stableValue = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(stableValue);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => [key, stableValue(item)]),
	);
};

const sha256 = (value: string | Buffer) =>
	createHash("sha256").update(value).digest("hex");

const text = (value: unknown) => String(value ?? "").trim();

const stringValuesForNamedField = (
	value: unknown,
	fieldName: string,
	result: string[] = [],
) => {
	if (Array.isArray(value)) {
		for (const item of value) stringValuesForNamedField(item, fieldName, result);
		return result;
	}
	if (!value || typeof value !== "object") return result;
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		if (key.toLowerCase() === fieldName.toLowerCase()) {
			if (Array.isArray(item)) {
				result.push(...item.map(text).filter(Boolean));
			} else if (item && typeof item === "object") {
				result.push(
					...Object.values(item as Record<string, unknown>)
						.map(text)
						.filter(Boolean),
				);
			} else {
				const normalized = text(item);
				if (normalized) result.push(normalized);
			}
		}
		stringValuesForNamedField(item, fieldName, result);
	}
	return result;
};

const normalizeRequesterAddress = (value: unknown) => {
	const normalized = text(value).toLowerCase();
	return normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
};

const normalizeRequesterAddresses = (value: unknown) => {
	const values = Array.isArray(value) ? value : [];
	return [
		...new Set(values.map(normalizeRequesterAddress).filter(Boolean)),
	].sort();
};

/**
 * A target becomes actionable from code/build attestation plus its current
 * capability response. There is deliberately no mutable global enable flag.
 */
export const classifyHikvisionFdlibPictureTarget = (params: {
	capabilityProbe: {
		status?: unknown;
		response?: unknown;
		data?: unknown;
	};
	attestation?: HikvisionFdlibFaceWriterAttestation | null;
	currentBuildAttestation?: unknown;
	/**
	 * Optional fleet-proven peer attestation (same capabilityEvidenceSha256 +
	 * exact build). Unlocks a sibling target that already passes the live
	 * capability probe without re-running a serial canary.
	 */
	fleetProvenAttestation?: HikvisionFdlibFleetProvenAttestation | null;
	/**
	 * Physical target address used when fleet-unlocking so picture delivery
	 * still binds to this device only.
	 */
	targetRequesterAddresses?: unknown;
	authorizedCanary?: {
		authorized?: unknown;
		fdId?: unknown;
		faceLibType?: unknown;
		allowedRequesterAddresses?: unknown;
	} | null;
}): HikvisionFdlibTargetClassification => {
	const capabilityPayload =
		params.capabilityProbe.response ?? params.capabilityProbe.data ?? {};
	const capabilityEvidenceSha256 = sha256(
		JSON.stringify(stableValue(capabilityPayload)),
	);
	const base = {
		fdId: null,
		faceLibType: null,
		allowedRequesterAddresses: [],
		capabilityEvidenceSha256,
	} satisfies Pick<
		HikvisionFdlibTargetClassification,
		"fdId" | "faceLibType" | "allowedRequesterAddresses" | "capabilityEvidenceSha256"
	>;
	if (text(params.capabilityProbe.status).toLowerCase() !== "supported") {
		return {
			...base,
			actionable: false,
			writer: "device_firmware_unsupported",
			reason: "capability_probe_not_supported",
		};
	}
	const uploadTypes = [
		...stringValuesForNamedField(capabilityPayload, "SupportUploadPictureType"),
		...stringValuesForNamedField(capabilityPayload, "supportUploadPictureType"),
	]
		.flatMap((value) => value.toLowerCase().split(/[\s,|]+/))
		.filter(Boolean);
	// MinMoe access terminals expose URL delivery on the general FDLib
	// capability endpoint as faceURLLen plus POST in supportFDFunction. The
	// FaceDataRecord-specific capability endpoint is a 404 on those builds.
	const faceUrlCapability =
		stringValuesForNamedField(capabilityPayload, "faceURL").length > 0 ||
		stringValuesForNamedField(capabilityPayload, "faceURLLen").some(
			(value) => Number(value) > 0,
		);
	const supportedFunctions = stringValuesForNamedField(
		capabilityPayload,
		"supportFDFunction",
	)
		.flatMap((value) => value.toLowerCase().split(/[\s,|]+/))
		.filter(Boolean);
	if (
		(!uploadTypes.includes("url") && !faceUrlCapability) ||
		(supportedFunctions.length > 0 && !supportedFunctions.includes("post"))
	) {
		return {
			...base,
			actionable: false,
			writer: "device_firmware_unsupported",
			reason: "url_upload_not_supported",
		};
	}
	const currentBuildAttestation = text(params.currentBuildAttestation);
	if (!currentBuildAttestation) {
		return {
			...base,
			actionable: false,
			writer: "fdlib_picture_import",
			reason: "build_attestation_missing",
		};
	}
	const authorizedCanary = params.authorizedCanary || {};
	const canaryFdId = text(authorizedCanary.fdId);
	const canaryFaceLibType = text(authorizedCanary.faceLibType);
	const canaryRequesterAddresses = normalizeRequesterAddresses(
		authorizedCanary.allowedRequesterAddresses,
	);
	if (
		authorizedCanary.authorized === true &&
		canaryFdId &&
		Buffer.byteLength(canaryFdId) <= 63 &&
		(canaryFaceLibType === "blackFD" || canaryFaceLibType === "staticFD") &&
		canaryRequesterAddresses.length > 0
	) {
		return {
			actionable: true,
			writer: "fdlib_picture_import",
			reason: "authorized_canary_ready",
			fdId: canaryFdId,
			faceLibType: canaryFaceLibType,
			allowedRequesterAddresses: canaryRequesterAddresses,
			capabilityEvidenceSha256,
		};
	}
	const attestation = params.attestation || {};
	const testedBuildAttestation = text(attestation.testedBuildAttestation);
	const targetRequesterAddresses = normalizeRequesterAddresses(
		params.targetRequesterAddresses,
	);
	if (
		text(attestation.status).toLowerCase() !== "tested" ||
		text(attestation.endpoint) !== HIKVISION_FDLIB_FACE_DATA_RECORD_ENDPOINT ||
		text(attestation.uploadMode).toLowerCase() !== "url"
	) {
		// Fleet reuse: same live capability hash + peer proven on this build.
		const fleet = params.fleetProvenAttestation || {};
		const fleetSha = text(fleet.capabilityEvidenceSha256);
		const fleetBuild = text(fleet.testedBuildAttestation);
		const fleetFdId = text(fleet.fdId);
		const fleetFaceLibType = text(fleet.faceLibType);
		const fleetReady =
			text(fleet.status).toLowerCase() === "tested" &&
			text(fleet.endpoint) === HIKVISION_FDLIB_FACE_DATA_RECORD_ENDPOINT &&
			text(fleet.uploadMode).toLowerCase() === "url" &&
			Boolean(fleetSha) &&
			fleetSha === capabilityEvidenceSha256 &&
			Boolean(fleetBuild) &&
			fleetBuild === currentBuildAttestation &&
			Boolean(fleetFdId) &&
			Buffer.byteLength(fleetFdId) <= 63 &&
			(fleetFaceLibType === "blackFD" || fleetFaceLibType === "staticFD") &&
			targetRequesterAddresses.length > 0;
		if (fleetReady) {
			return {
				actionable: true,
				writer: "fdlib_picture_import",
				reason: "fleet_capability_match_ready",
				fdId: fleetFdId,
				faceLibType: fleetFaceLibType as "blackFD" | "staticFD",
				allowedRequesterAddresses: targetRequesterAddresses,
				capabilityEvidenceSha256,
			};
		}
		return {
			...base,
			actionable: false,
			writer: "fdlib_picture_import",
			reason: "target_attestation_invalid",
		};
	}
	if (testedBuildAttestation !== currentBuildAttestation) {
		return {
			...base,
			actionable: false,
			writer: "fdlib_picture_import",
			reason: "build_attestation_mismatch",
		};
	}
	const fdId = text(attestation.fdId);
	const faceLibType = text(attestation.faceLibType);
	const allowedRequesterAddresses = normalizeRequesterAddresses(
		attestation.allowedRequesterAddresses,
	);
	if (
		!fdId ||
		Buffer.byteLength(fdId) > 63 ||
		(faceLibType !== "blackFD" && faceLibType !== "staticFD") ||
		allowedRequesterAddresses.length === 0
	) {
		return {
			...base,
			actionable: false,
			writer: "fdlib_picture_import",
			reason: "target_attestation_invalid",
		};
	}
	return {
		actionable: true,
		writer: "fdlib_picture_import",
		reason: "ready",
		fdId,
		faceLibType,
		allowedRequesterAddresses,
		capabilityEvidenceSha256,
	};
};

const strictBase64Decode = (value: unknown) => {
	const input = text(value).replace(/\s+/g, "");
	if (!input || input.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input)) {
		throw new Error("Face picture custody is not canonical base64.");
	}
	const decoded = Buffer.from(input, "base64");
	const canonical = decoded.toString("base64");
	if (!timingSafeEqual(Buffer.from(input), Buffer.from(canonical))) {
		throw new Error("Face picture custody failed canonical base64 validation.");
	}
	return decoded;
};

export const validateHikvisionFdlibFacePicture = (
	base64: unknown,
	options: { maxBytes?: number } = {},
): ValidatedFacePicture => {
	const buffer = strictBase64Decode(base64);
	const maxBytes = Math.max(1, Math.min(options.maxBytes || 2 * 1024 * 1024, 4 * 1024 * 1024));
	if (buffer.length < 128 || buffer.length > maxBytes) {
		throw new Error(`Face picture size ${buffer.length} is outside the accepted bounds.`);
	}
	const jpeg =
		buffer.length >= 4 &&
		buffer[0] === 0xff &&
		buffer[1] === 0xd8 &&
		buffer[buffer.length - 2] === 0xff &&
		buffer[buffer.length - 1] === 0xd9;
	const png =
		buffer.length >= 8 &&
		buffer.subarray(0, 8).equals(
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		);
	if (!jpeg && !png) {
		throw new Error("Face picture custody is neither a validated JPEG nor PNG.");
	}
	return {
		buffer,
		contentType: jpeg ? "image/jpeg" : "image/png",
		sha256: sha256(buffer),
		size: buffer.length,
	};
};

export const assertHikvisionCredentialWriteLease = (params: {
	lease: HikvisionCredentialWriteLeaseProof;
	organizationId: string;
	scopeHash: string;
	sourceDeviceId: string;
	targetDeviceId: string;
	maxAgeMs?: number;
	now?: number;
}) => {
	const expectedDeviceIds = [params.sourceDeviceId, params.targetDeviceId].sort();
	const actualDeviceIds = [...new Set(params.lease.deviceIds.map(text))].sort();
	const acquiredAt = Date.parse(params.lease.acquiredAt);
	const maxAgeMs = Math.max(1, Math.min(params.maxAgeMs || 2 * 60_000, 10 * 60_000));
	const now = params.now ?? Date.now();
	if (
		!text(params.lease.leaseId) ||
		params.lease.organizationId !== params.organizationId ||
		params.lease.scopeHash !== params.scopeHash ||
		actualDeviceIds.length !== expectedDeviceIds.length ||
		actualDeviceIds.some((deviceId, index) => deviceId !== expectedDeviceIds[index]) ||
		!Number.isFinite(acquiredAt) ||
		acquiredAt > now + 5_000 ||
		now - acquiredAt > maxAgeMs
	) {
		throw new Error(
			"FDLib face write requires a fresh shared credential lease for the exact source and target.",
		);
	}
};

export const assertHikvisionFdlibPrewriteEvidence = (
	evidence: HikvisionFdlibPrewriteEvidence,
) => {
	const expected = text(evidence.expectedVendorUserId);
	const identity = text(evidence.targetIdentityVendorUserId);
	const owner = text(evidence.targetCardOwnerVendorUserId);
	const duplicateOwners = [
		...new Set(
			evidence.duplicateFaceOwnerVendorUserIds
				.map(text)
				.filter((candidate) => candidate && candidate !== expected),
		),
	];
	if (!expected || identity !== expected || (owner && owner !== expected)) {
		throw new Error("Live target identity/card ownership does not match the reviewed person.");
	}
	if (Number(evidence.targetFaceCount || 0) !== 0) {
		throw new Error("Target now has a face; FDLib will not overwrite fresh physical truth.");
	}
	if (duplicateOwners.length > 0) {
		throw new Error(
			`Face picture checksum is already owned by another target user: ${duplicateOwners.join(", ")}.`,
		);
	}
};

export const assertHikvisionFdlibWriteAccepted = (response: unknown) => {
	const root =
		response && typeof response === "object"
			? (response as Record<string, unknown>)
			: {};
	const status =
		root.ResponseStatus && typeof root.ResponseStatus === "object"
			? (root.ResponseStatus as Record<string, unknown>)
			: root;
	const statusCode = Number(status.statusCode);
	const statusText = text(status.statusString || status.subStatusCode).toLowerCase();
	const accepted = Number.isFinite(statusCode)
		? statusCode === 0 || statusCode === 1
		: statusText === "ok";
	if (!accepted) {
		throw new Error(
			`FaceDataRecord did not return an explicit success status (${statusText || (Number.isFinite(statusCode) ? statusCode : "missing_status")}).`,
		);
	}
	return {
		statusCode: Number.isFinite(statusCode) ? statusCode : null,
		statusText: statusText || null,
	};
};

export const buildHikvisionFdlibFaceDataRecordBody = (params: {
	faceUrl: string;
	fdId: string;
	faceLibType: "blackFD" | "staticFD";
	vendorUserId: string;
	name: string;
}) => {
	const faceUrl = new URL(params.faceUrl);
	const vendorUserId = text(params.vendorUserId);
	const name = text(params.name);
	if (
		(faceUrl.protocol !== "https:" && faceUrl.protocol !== "http:") ||
		faceUrl.username ||
		faceUrl.password ||
		faceUrl.hash
	) {
		throw new Error("FDLib face delivery URL is invalid.");
	}
	if (
		!vendorUserId ||
		Buffer.byteLength(vendorUserId) > 63 ||
		!name ||
		Buffer.byteLength(name) > 96
	) {
		throw new Error("FDLib person identity exceeds the official FaceDataRecord bounds.");
	}
	return {
		faceURL: faceUrl.toString(),
		faceLibType: params.faceLibType,
		FDID: params.fdId,
		FPID: vendorUserId,
		name,
	};
};

/**
 * Live MinMoe/FDLib JSON on the current Main Entrance fleet rejects nested
 * `FDSearchDescription` wrappers with MessageParametersLack(faceLibType) while
 * accepting the flat body. Keep this shape flat and explicit.
 */
export const buildHikvisionFdlibFaceSearchBody = (params: {
	searchId: string;
	fdId: string;
	faceLibType: "blackFD" | "staticFD" | string;
	vendorUserId: string;
	searchResultPosition?: number;
	maxResults?: number;
}) => {
	const searchId = text(params.searchId);
	const fdId = text(params.fdId);
	const faceLibType = text(params.faceLibType);
	const vendorUserId = text(params.vendorUserId);
	if (!searchId || !fdId || !faceLibType || !vendorUserId) {
		throw new Error("FDSearch requires searchId, fdId, faceLibType, and vendorUserId.");
	}
	return {
		searchID: searchId,
		searchResultPosition: Math.max(0, Number(params.searchResultPosition || 0) || 0),
		maxResults: Math.max(1, Math.min(Number(params.maxResults || 5) || 5, 30)),
		FDID: fdId,
		FPID: vendorUserId,
		faceLibType,
	};
};

/**
 * Device faceURL values often append an opaque `@WEB...` session suffix that
 * must not be treated as part of the filesystem path when re-requesting bytes.
 * Authority is discarded; callers pin the path back onto the reviewed device.
 */
export const resolveHikvisionFdlibFacePicturePath = (value: unknown): string => {
	const raw = text(value);
	if (!raw) {
		throw new Error("FDLib face picture path is empty.");
	}
	let pathWithQuery = raw;
	try {
		const parsed = new URL(raw);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			throw new Error("FDLib face picture path uses an unsupported scheme.");
		}
		pathWithQuery = `${parsed.pathname}${parsed.search}`;
	} catch (error: any) {
		if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) throw error;
	}
	const pathOnly = pathWithQuery.split("?")[0] || "";
	const stripped = pathOnly.split("@")[0] || "";
	const query = pathWithQuery.includes("?")
		? pathWithQuery.slice(pathWithQuery.indexOf("?"))
		: "";
	const normalized = `${stripped}${query}`;
	if (!normalized.startsWith("/") || normalized.startsWith("//")) {
		throw new Error("FDLib face picture path must be device-local absolute path.");
	}
	return normalized;
};

type DeliveryLease = {
	tokenHash: string;
	expiresAt: number;
	remainingReads: number;
	remainingDeniedAttempts: number;
	allowedRequesterAddresses: Set<string>;
	picture: ValidatedFacePicture;
};

/**
 * Single-use, memory-only image delivery. It intentionally cannot become a
 * general photo endpoint and never stores or logs the bearer token or bytes.
 */
export class HikvisionFdlibFaceDeliveryRegistry {
	private readonly leases = new Map<string, DeliveryLease>();

	create(params: {
		picture: ValidatedFacePicture;
		allowedRequesterAddresses: string[];
		ttlMs?: number;
		now?: number;
	}) {
		const now = params.now ?? Date.now();
		const ttlMs = Math.max(5_000, Math.min(params.ttlMs || 45_000, 60_000));
		const allowedRequesterAddresses = new Set(
			params.allowedRequesterAddresses.map(normalizeRequesterAddress).filter(Boolean),
		);
		if (allowedRequesterAddresses.size === 0) {
			throw new Error("FDLib delivery requires an explicit target requester address.");
		}
		const token = randomBytes(32).toString("base64url");
		const tokenHash = sha256(token);
		this.leases.set(tokenHash, {
			tokenHash,
			expiresAt: now + ttlMs,
			remainingReads: 1,
			remainingDeniedAttempts: 3,
			allowedRequesterAddresses,
			picture: params.picture,
		});
		return {
			token,
			expiresAt: new Date(now + ttlMs).toISOString(),
			sha256: params.picture.sha256,
			size: params.picture.size,
			contentType: params.picture.contentType,
		};
	}

	consume(params: { token: unknown; requesterAddress: unknown; now?: number }) {
		const token = text(params.token);
		const tokenHash = sha256(token);
		const lease = this.leases.get(tokenHash);
		const now = params.now ?? Date.now();
		if (!lease || lease.expiresAt < now || lease.remainingReads < 1) {
			if (lease) this.leases.delete(tokenHash);
			throw new Error("FDLib face delivery lease is missing, expired, or consumed.");
		}
		const requesterAddress = normalizeRequesterAddress(params.requesterAddress);
		if (!lease.allowedRequesterAddresses.has(requesterAddress)) {
			lease.remainingDeniedAttempts -= 1;
			if (lease.remainingDeniedAttempts <= 0) this.leases.delete(tokenHash);
			throw new Error("FDLib face delivery requester does not match the target attestation.");
		}
		lease.remainingReads -= 1;
		this.leases.delete(tokenHash);
		return lease.picture;
	}

	revoke(token: unknown) {
		this.leases.delete(sha256(text(token)));
	}
}

export const hikvisionFdlibFaceDeliveryRegistry =
	new HikvisionFdlibFaceDeliveryRegistry();

export const verifyHikvisionFdlibPhysicalReread = (params: {
	sourcePicture: ValidatedFacePicture;
	reread: HikvisionFdlibRereadEvidence;
}) => {
	const rereadPicture = validateHikvisionFdlibFacePicture(params.reread.pictureBase64);
	if (
		!text(params.reread.vendorUserId) ||
		Number(params.reread.faceCount || 0) < 1 ||
		rereadPicture.sha256 !== params.sourcePicture.sha256 ||
		params.reread.identityDigestBefore !== params.reread.identityDigestAfter ||
		params.reread.fingerprintDigestBefore !== params.reread.fingerprintDigestAfter ||
		params.reread.cardDigestBefore !== params.reread.cardDigestAfter
	) {
		throw new Error(
			"FDLib target reread did not prove exact image retention and credential isolation.",
		);
	}
	return {
		retained: true,
		pictureSha256: rereadPicture.sha256,
		pictureSize: rereadPicture.size,
		faceCount: params.reread.faceCount,
	};
};
