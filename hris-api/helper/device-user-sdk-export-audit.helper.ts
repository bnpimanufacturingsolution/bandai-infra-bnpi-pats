import { createHash } from "crypto";

export const DEVICE_USER_SDK_EXPORT_COLUMNS = [
	"vendorUserId",
	"displayName",
	"userType",
	"rawFingerprintBlob",
	"rawFaceBlob",
] as const;

export const DEVICE_USER_BIOMETRIC_STATUSES = [
	"raw_blob_present",
	"not_enrolled",
	"missing_raw_blob",
] as const;

type BiometricStatus = (typeof DEVICE_USER_BIOMETRIC_STATUSES)[number];
type Base64Inspection = {
	valid: boolean;
	bytes: Buffer;
	hash: string | null;
};
type FlattenedDeviceUser = {
	sourceDeviceId: string;
	user: any;
};

export type DeviceUserSdkExportAuditRow = {
	rowNumber: number;
	sourceDeviceId: string;
	vendorUserId: string;
	fingerprintStatus: string;
	fingerprintSlotCount: number;
	fingerprintBase64Valid: boolean;
	fingerprintDecodedByteLengths: number[];
	fingerprintSha256: string[];
	faceStatus: string;
	faceBase64Valid: boolean;
	faceDecodedByteLength: number;
	faceDetectedType: string;
	faceSha256: string | null;
	rowVerdict: "valid" | "invalid";
	reasons: string[];
};

export type DeviceUserSdkExportAudit = {
	schemaVersion: string | null;
	exportedAt: string | null;
	rows: DeviceUserSdkExportAuditRow[];
	failures: DeviceUserSdkExportAuditRow[];
	summary: {
		totalFreshUniqueSdkIds: number;
		totalExportedRows: number;
		duplicateIds: number;
		fingerprintRawPresentUsers: number;
		fingerprintSlotsDecoded: number;
		fingerprintNotEnrolledUsers: number;
		fingerprintMissingRawUsers: number;
		faceRawPresentUsers: number;
		faceBlobsDecoded: number;
		faceNotEnrolledUsers: number;
		faceMissingRawUsers: number;
		validRows: number;
		invalidRows: number;
	};
};

const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

const normalizeBase64 = (value: string) => value.trim().replace(/\s+/g, "").replace(/=+$/g, "");

const inspectBase64 = (value: unknown): Base64Inspection => {
	const raw = String(value || "").trim();
	if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith("{") || raw.startsWith("[")) {
		return { valid: false, bytes: Buffer.alloc(0), hash: null as string | null };
	}
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw.replace(/\s+/g, ""))) {
		return { valid: false, bytes: Buffer.alloc(0), hash: null as string | null };
	}
	try {
		const bytes = Buffer.from(raw, "base64");
		const roundTrip = bytes.toString("base64");
		const valid = bytes.length > 0 && normalizeBase64(roundTrip) === normalizeBase64(raw);
		return { valid, bytes, hash: valid ? sha256(bytes) : null };
	} catch {
		return { valid: false, bytes: Buffer.alloc(0), hash: null as string | null };
	}
};

const detectFaceType = (bytes: Buffer) => {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return "image/jpeg";
	}
	if (
		bytes.length >= 8 &&
		bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
	) {
		return "image/png";
	}
	if (
		bytes.length >= 6 &&
		["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))
	) {
		return "image/gif";
	}
	return bytes.length > 0 ? "application/octet-stream" : "empty";
};

const normalizeStatus = (value: unknown): string => String(value || "").trim();

const isAllowedStatus = (value: string): value is BiometricStatus =>
	DEVICE_USER_BIOMETRIC_STATUSES.includes(value as BiometricStatus);

const validateStatusAndBlob = (params: {
	modality: "fingerprint" | "face";
	status: string;
	hasAnyBlob: boolean;
	hasValidBlob: boolean;
	reasons: string[];
}) => {
	if (!isAllowedStatus(params.status)) {
		params.reasons.push(`${params.modality}_status_invalid:${params.status || "empty"}`);
		return;
	}
	if (params.status === "raw_blob_present" && !params.hasValidBlob) {
		params.reasons.push(`${params.modality}_status_present_without_valid_blob`);
	}
	// Fingerprint custody can be partial: a two-slot enrollment may expose one
	// valid FPn blob and still correctly remain missing_raw_blob for the other.
	if (
		params.status !== "raw_blob_present" &&
		params.hasAnyBlob &&
		!(params.modality === "fingerprint" && params.status === "missing_raw_blob")
	) {
		params.reasons.push(`${params.modality}_status_${params.status}_with_blob`);
	}
};

export const auditDeviceUserSdkExportPackage = (payload: any): DeviceUserSdkExportAudit => {
	const flattened: FlattenedDeviceUser[] = (
		Array.isArray(payload?.devices) ? payload.devices : []
	).flatMap((device: any) =>
		(Array.isArray(device?.users) ? device.users : []).map((user: any) => ({
			sourceDeviceId: String(device?.device?.id || user?.deviceId || "").trim(),
			user,
		})),
	);
	const duplicateKeys = new Set<string>();
	const seenKeys = new Set<string>();
	for (const item of flattened) {
		const vendorUserId = String(item.user?.vendorUserId || "").trim();
		const key = `${item.sourceDeviceId}\u0000${vendorUserId}`;
		if (seenKeys.has(key)) duplicateKeys.add(key);
		seenKeys.add(key);
	}

	const rows: DeviceUserSdkExportAuditRow[] = flattened.map(
		(item: FlattenedDeviceUser, index: number): DeviceUserSdkExportAuditRow => {
			const user = item.user || {};
			const reasons: string[] = [];
			const vendorUserId = String(user.vendorUserId || "").trim();
			if (!vendorUserId) reasons.push("vendor_user_id_empty");
			const duplicateKey = `${item.sourceDeviceId}\u0000${vendorUserId}`;
			if (duplicateKeys.has(duplicateKey)) reasons.push("duplicate_vendor_user_id_on_source");

			const fingerprint = user?.rawBiometricCustody?.fingerprint || {};
			const fingerprintTemplates = Array.isArray(fingerprint?.templates)
				? fingerprint.templates
				: [];
			const fingerprintInspections: Base64Inspection[] = fingerprintTemplates.map(
				(template: any) => inspectBase64(template?.data || template?.fingerData),
			);
			const fingerprintIds = fingerprintTemplates.map(
				(template: any, templateIndex: number) =>
					String(template?.fingerPrintId ?? template?.fingerPrintID ?? templateIndex + 1),
			);
			if (new Set(fingerprintIds).size !== fingerprintIds.length) {
				reasons.push("fingerprint_slot_duplicate");
			}
			if (fingerprintInspections.some((inspection) => !inspection.valid)) {
				reasons.push("fingerprint_base64_invalid");
			}
			const fingerprintStatus = normalizeStatus(fingerprint?.status);
			const validFingerprintBlobCount = fingerprintInspections.filter(
				(inspection) => inspection.valid,
			).length;
			validateStatusAndBlob({
				modality: "fingerprint",
				status: fingerprintStatus,
				hasAnyBlob: fingerprintTemplates.length > 0,
				hasValidBlob:
					fingerprintTemplates.length > 0 &&
					validFingerprintBlobCount === fingerprintTemplates.length,
				reasons,
			});

			const face = user?.rawBiometricCustody?.face || {};
			const faceBlob = face?.blob || {};
			const faceValue =
				faceBlob?.base64 || faceBlob?.facePicture || faceBlob?.faceTemplate || "";
			const faceInspection = inspectBase64(faceValue);
			const faceStatus = normalizeStatus(face?.status);
			validateStatusAndBlob({
				modality: "face",
				status: faceStatus,
				hasAnyBlob: Boolean(String(faceValue || "").trim()),
				hasValidBlob: faceInspection.valid,
				reasons,
			});

			const fingerprintHashes = fingerprintInspections
				.map((inspection) => inspection.hash)
				.filter((value): value is string => Boolean(value));
			if (faceInspection.hash && fingerprintHashes.includes(faceInspection.hash)) {
				reasons.push("cross_modality_blob_reuse");
			}

			return {
				rowNumber: index + 1,
				sourceDeviceId: item.sourceDeviceId,
				vendorUserId,
				fingerprintStatus,
				fingerprintSlotCount: fingerprintTemplates.length,
				fingerprintBase64Valid:
					fingerprintTemplates.length === 0 ||
					validFingerprintBlobCount === fingerprintTemplates.length,
				fingerprintDecodedByteLengths: fingerprintInspections.map(
					(inspection) => inspection.bytes.length,
				),
				fingerprintSha256: fingerprintHashes,
				faceStatus,
				faceBase64Valid: !faceValue || faceInspection.valid,
				faceDecodedByteLength: faceInspection.bytes.length,
				faceDetectedType: detectFaceType(faceInspection.bytes),
				faceSha256: faceInspection.hash,
				rowVerdict: reasons.length ? "invalid" : "valid",
				reasons,
			};
		},
	);

	const uniqueIds = new Set(
		rows
			.filter((row) => row.vendorUserId)
			.map((row) => `${row.sourceDeviceId}\u0000${row.vendorUserId}`),
	);
	const summary = {
		totalFreshUniqueSdkIds: uniqueIds.size,
		totalExportedRows: rows.length,
		duplicateIds: duplicateKeys.size,
		fingerprintRawPresentUsers: rows.filter(
			(row) => row.fingerprintStatus === "raw_blob_present",
		).length,
		fingerprintSlotsDecoded: rows.reduce(
			(sum, row) =>
				sum +
				row.fingerprintDecodedByteLengths.filter((byteLength) => byteLength > 0).length,
			0,
		),
		fingerprintNotEnrolledUsers: rows.filter((row) => row.fingerprintStatus === "not_enrolled")
			.length,
		fingerprintMissingRawUsers: rows.filter(
			(row) => row.fingerprintStatus === "missing_raw_blob",
		).length,
		faceRawPresentUsers: rows.filter((row) => row.faceStatus === "raw_blob_present").length,
		faceBlobsDecoded: rows.filter((row) => row.faceDecodedByteLength > 0).length,
		faceNotEnrolledUsers: rows.filter((row) => row.faceStatus === "not_enrolled").length,
		faceMissingRawUsers: rows.filter((row) => row.faceStatus === "missing_raw_blob").length,
		validRows: rows.filter((row) => row.rowVerdict === "valid").length,
		invalidRows: rows.filter((row) => row.rowVerdict === "invalid").length,
	};

	return {
		schemaVersion: payload?.schemaVersion || null,
		exportedAt: payload?.exportedAt || null,
		rows,
		failures: rows.filter((row) => row.rowVerdict === "invalid"),
		summary,
	};
};
