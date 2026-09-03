import { expect } from "chai";
import {
	decryptPortableBiometricEnvelope,
	decryptServerBiometricEnvelope,
	encryptPortableBiometricEnvelope,
	encryptServerBiometricEnvelope,
} from "../app/device/biometric-envelope.helper";
import {
	buildFingerprintTemplateChecksumEvidence,
	recoverPlannerFingerprintTemplates,
} from "../helper/device-user-raw-fingerprint.helper";

describe("portable biometric envelope", () => {
	const encrypted = () =>
		encryptPortableBiometricEnvelope({
			deviceId: "source-device",
			vendorUserId: "1001",
			modality: "fingerprint",
			payload: { fingerprints: [{ id: 1, data: "sdk-template-bytes" }] },
			passphrase: "correct horse battery staple",
		});
	const decrypt = (envelope: any, overrides: Record<string, string> = {}) =>
		decryptPortableBiometricEnvelope({
			encrypted: envelope,
			passphrase: overrides.passphrase || "correct horse battery staple",
			expectedDeviceId: overrides.deviceId || "source-device",
			expectedVendorUserId: overrides.vendorUserId || "1001",
			expectedModality: (overrides.modality as "fingerprint" | "face") || "fingerprint",
		});

	it("decrypts only with the correct passphrase", () => {
		expect(decrypt(encrypted())).to.deep.equal({
			fingerprints: [{ id: 1, data: "sdk-template-bytes" }],
		});
		expect(() => decrypt(encrypted(), { passphrase: "wrong" })).to.throw();
	});

	it("rejects ciphertext and authentication-tag tampering", () => {
		const ciphertextTampered = encrypted();
		ciphertextTampered.ciphertext = `${ciphertextTampered.ciphertext.slice(0, -4)}AAAA`;
		expect(() => decrypt(ciphertextTampered)).to.throw();
		const tagTampered = encrypted();
		tagTampered.authTag = Buffer.alloc(16).toString("base64");
		expect(() => decrypt(tagTampered)).to.throw();
	});

	it("authenticates source device, user, and modality bindings", () => {
		const envelope = encrypted();
		expect(() => decrypt(envelope, { deviceId: "other-device" })).to.throw("binding mismatch");
		expect(() => decrypt(envelope, { vendorUserId: "1002" })).to.throw("binding mismatch");
		expect(() => decrypt(envelope, { modality: "face" })).to.throw("binding mismatch");
	});

	it("keeps fingerprint and face envelopes separate", () => {
		const fingerprint = encrypted();
		const face = encryptPortableBiometricEnvelope({
			deviceId: "source-device",
			vendorUserId: "1001",
			modality: "face",
			payload: { faceTemplate: "sdk-face-template" },
			passphrase: "correct horse battery staple",
		});
		expect(fingerprint.modality).to.equal("fingerprint");
		expect(face.modality).to.equal("face");
		expect(fingerprint.ciphertext).not.to.equal(face.ciphertext);
	});
});

describe("server biometric envelope planner custody", () => {
	const secret = "organization-device-derived-secret";
	const payload = {
		sourceDeviceId: "device-b",
		vendorUserId: "1001",
		cardOwnerVerified: false,
		identityOwnerVerified: true,
		fingerprints: [
			{
				fingerPrintId: 2,
				fingerType: 1,
				length: 12,
				data: "real-sdk-template-base64",
			},
		],
	};
	const encrypted = () =>
		encryptServerBiometricEnvelope({
			deviceId: "device-b",
			vendorUserId: "1001",
			modality: "fingerprint",
			payload,
			secret,
			keySource: "test",
		});

	it("recovers encrypted SDK fingerprint custody as count and checksum evidence", () => {
		const decrypted = decryptServerBiometricEnvelope({
			encrypted: encrypted(),
			secret,
			expectedDeviceId: "device-b",
			expectedVendorUserId: "1001",
			expectedModality: "fingerprint",
		});
		const templates = recoverPlannerFingerprintTemplates({
			payload: decrypted,
			expectedDeviceId: "device-b",
			expectedVendorUserId: "1001",
		});
		const evidence = buildFingerprintTemplateChecksumEvidence(templates);
		expect(templates).to.have.length(1);
		expect(evidence).to.deep.equal([
			{
				fingerPrintId: 2,
				checksum: "22bf028ed6270ba172642cf6f5b66264a73251c82bc7026451ef63d72e5b3bc8",
			},
		]);
		expect(evidence[0]).not.to.have.property("data");
	});

	it("keeps wrong device, identity, modality, or organization key fail-closed", () => {
		const envelope = encrypted();
		const decrypt = (overrides: Record<string, string> = {}) =>
			decryptServerBiometricEnvelope({
				encrypted: envelope,
				secret: overrides.secret || secret,
				expectedDeviceId: overrides.deviceId || "device-b",
				expectedVendorUserId: overrides.vendorUserId || "1001",
				expectedModality:
					(overrides.modality as "fingerprint" | "face") || "fingerprint",
			});
		expect(() => decrypt({ deviceId: "device-a" })).to.throw("binding mismatch");
		expect(() => decrypt({ vendorUserId: "1002" })).to.throw("binding mismatch");
		expect(() => decrypt({ modality: "face" })).to.throw("binding mismatch");
		expect(() => decrypt({ secret: "other-organization-key" })).to.throw();
	});

	it("rejects a valid envelope whose decrypted payload was copied across identities", () => {
		const decrypted = decryptServerBiometricEnvelope({
			encrypted: encryptServerBiometricEnvelope({
				deviceId: "device-b",
				vendorUserId: "1001",
				modality: "fingerprint",
				payload: { ...payload, vendorUserId: "1002" },
				secret,
				keySource: "test",
			}),
			secret,
			expectedDeviceId: "device-b",
			expectedVendorUserId: "1001",
			expectedModality: "fingerprint",
		});
		expect(() =>
			recoverPlannerFingerprintTemplates({
				payload: decrypted,
				expectedDeviceId: "device-b",
				expectedVendorUserId: "1001",
			}),
		).to.throw("binding mismatch");
	});

	it("requires exact UserInfo ownership even when CardInfo ownership is present", () => {
		for (const identityOwnerVerified of [false, undefined]) {
			expect(() =>
				recoverPlannerFingerprintTemplates({
					payload: {
						...payload,
						cardOwnerVerified: true,
						identityOwnerVerified,
					},
					expectedDeviceId: "device-b",
					expectedVendorUserId: "1001",
				}),
			).to.throw("binding mismatch");
		}
	});

	it("reuses device-and-user-bound custody when the current plan freshly verified exact UserInfo ownership", () => {
		const templates = recoverPlannerFingerprintTemplates({
			payload: {
				...payload,
				identityOwnerVerified: undefined,
			},
			expectedDeviceId: "device-b",
			expectedVendorUserId: "1001",
			freshUserInfoOwnerVerified: true,
		});
		expect(templates).to.have.length(1);
		expect(templates[0].fingerPrintId).to.equal(2);

		expect(() =>
			recoverPlannerFingerprintTemplates({
				payload: {
					...payload,
					sourceDeviceId: "device-c",
					identityOwnerVerified: undefined,
				},
				expectedDeviceId: "device-b",
				expectedVendorUserId: "1001",
				freshUserInfoOwnerVerified: true,
			}),
		).to.throw("binding mismatch");
	});
});
