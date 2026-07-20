import { expect } from "chai";
import {
	decryptPortableBiometricEnvelope,
	encryptPortableBiometricEnvelope,
} from "../app/device/biometric-envelope.helper";

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
