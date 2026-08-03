import { expect } from "chai";
import {
	auditDeviceUserSdkExportPackage,
	DEVICE_USER_SDK_EXPORT_COLUMNS,
} from "../helper/device-user-sdk-export-audit.helper";

const jpegBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x01]).toString("base64");
const fingerprintBase64 = Buffer.from("fingerprint-template").toString("base64");

describe("Device-user SDK export row audit", () => {
	it("keeps the product projection locked to five SDK columns (status lives in blob cells)", () => {
		expect(DEVICE_USER_SDK_EXPORT_COLUMNS).to.deep.equal([
			"vendorUserId",
			"displayName",
			"userType",
			"rawFingerprintBlob",
			"rawFaceBlob",
		]);
	});

	it("decodes and hashes every present fingerprint slot and face", () => {
		const result = auditDeviceUserSdkExportPackage({
			schemaVersion: "project-truth.hikvision-device-users.v1",
			devices: [
				{
					device: { id: "source-a" },
					users: [
						{
							vendorUserId: "15",
							rawBiometricCustody: {
								fingerprint: {
									status: "raw_blob_present",
									templates: [
										{ fingerPrintId: 1, data: fingerprintBase64 },
										{
											fingerPrintId: 2,
											data: Buffer.from("second-template").toString("base64"),
										},
									],
								},
								face: {
									status: "raw_blob_present",
									blob: { base64: jpegBase64 },
								},
							},
						},
					],
				},
			],
		});

		expect(result.summary).to.include({
			totalFreshUniqueSdkIds: 1,
			totalExportedRows: 1,
			fingerprintRawPresentUsers: 1,
			fingerprintSlotsDecoded: 2,
			faceRawPresentUsers: 1,
			faceBlobsDecoded: 1,
			validRows: 1,
			invalidRows: 0,
		});
		expect(result.rows[0].fingerprintSha256).to.have.length(2);
		expect(result.rows[0].faceDetectedType).to.equal("image/jpeg");
		expect(result.rows[0].faceSha256).to.match(/^[a-f0-9]{64}$/);
	});

	it("rejects inconsistent statuses, invalid bytes, duplicate slots, and cross-modality reuse", () => {
		const result = auditDeviceUserSdkExportPackage({
			devices: [
				{
					device: { id: "source-a" },
					users: [
						{
							vendorUserId: "16",
							rawBiometricCustody: {
								fingerprint: {
									status: "not_enrolled",
									templates: [
										{ fingerPrintId: 1, data: fingerprintBase64 },
										{ fingerPrintId: 1, data: "not-base64!" },
									],
								},
								face: {
									status: "raw_blob_present",
									blob: { base64: fingerprintBase64 },
								},
							},
						},
					],
				},
			],
		});

		expect(result.summary.invalidRows).to.equal(1);
		expect(result.rows[0].reasons).to.include.members([
			"fingerprint_slot_duplicate",
			"fingerprint_base64_invalid",
			"fingerprint_status_not_enrolled_with_blob",
			"cross_modality_blob_reuse",
		]);
	});

	it("accepts explicit not-enrolled and missing-raw rows only when blob fields are empty", () => {
		const result = auditDeviceUserSdkExportPackage({
			devices: [
				{
					device: { id: "source-a" },
					users: [
						{
							vendorUserId: "17",
							rawBiometricCustody: {
								fingerprint: { status: "missing_raw_blob", templates: [] },
								face: { status: "not_enrolled", blob: null },
							},
						},
					],
				},
			],
		});

		expect(result.summary).to.include({
			fingerprintMissingRawUsers: 1,
			faceNotEnrolledUsers: 1,
			validRows: 1,
			invalidRows: 0,
		});
	});
});
