import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

export const PORTABLE_BIOMETRIC_ENVELOPE_FORMAT =
	"project-truth.hikvision-biometric-template.v2";

type Modality = "fingerprint" | "face";

const deriveKey = (passphrase: string, salt: Buffer) => {
	if (!passphrase) throw new Error("Encrypted biometric bundle passphrase is required");
	return scryptSync(passphrase, salt, 32, {
		N: 16384,
		r: 8,
		p: 1,
		maxmem: 64 * 1024 * 1024,
	});
};

const binding = (envelope: {
	format: string;
	deviceId: string;
	vendorUserId: string;
	modality: Modality;
}) => ({
	format: envelope.format,
	deviceId: envelope.deviceId,
	vendorUserId: envelope.vendorUserId,
	modality: envelope.modality,
});

export const encryptPortableBiometricEnvelope = (params: {
	deviceId: string;
	vendorUserId: string;
	modality: Modality;
	payload: Record<string, unknown>;
	passphrase: string;
}) => {
	const salt = randomBytes(16);
	const iv = randomBytes(12);
	const envelopeBinding = binding({
		format: PORTABLE_BIOMETRIC_ENVELOPE_FORMAT,
		deviceId: params.deviceId,
		vendorUserId: params.vendorUserId,
		modality: params.modality,
	});
	const plaintext = Buffer.from(JSON.stringify(params.payload), "utf8");
	const cipher = createCipheriv("aes-256-gcm", deriveKey(params.passphrase, salt), iv);
	cipher.setAAD(Buffer.from(JSON.stringify(envelopeBinding), "utf8"));
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	return {
		...envelopeBinding,
		algorithm: "aes-256-gcm",
		keySource: "passphrase-scrypt",
		kdf: { name: "scrypt", N: 16384, r: 8, p: 1, keyLength: 32 },
		salt: salt.toString("base64"),
		iv: iv.toString("base64"),
		authTag: cipher.getAuthTag().toString("base64"),
		ciphertext: ciphertext.toString("base64"),
		plaintextSha256: createHash("sha256").update(plaintext).digest("hex"),
		createdAt: new Date().toISOString(),
	};
};

export const decryptPortableBiometricEnvelope = (params: {
	encrypted: any;
	passphrase: string;
	expectedDeviceId: string;
	expectedVendorUserId: string;
	expectedModality: Modality;
}) => {
	const encrypted = params.encrypted || {};
	if (
		encrypted.format !== PORTABLE_BIOMETRIC_ENVELOPE_FORMAT ||
		encrypted.algorithm !== "aes-256-gcm" ||
		String(encrypted.deviceId || "") !== params.expectedDeviceId ||
		String(encrypted.vendorUserId || "") !== params.expectedVendorUserId ||
		encrypted.modality !== params.expectedModality
	) {
		throw new Error("Encrypted biometric bundle source binding mismatch");
	}
	const salt = Buffer.from(String(encrypted.salt || ""), "base64");
	const iv = Buffer.from(String(encrypted.iv || ""), "base64");
	const authTag = Buffer.from(String(encrypted.authTag || ""), "base64");
	const ciphertext = Buffer.from(String(encrypted.ciphertext || ""), "base64");
	const decipher = createDecipheriv("aes-256-gcm", deriveKey(params.passphrase, salt), iv);
	decipher.setAAD(Buffer.from(JSON.stringify(binding(encrypted)), "utf8"));
	decipher.setAuthTag(authTag);
	const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	const plaintextSha256 = createHash("sha256").update(plaintext).digest("hex");
	if (encrypted.plaintextSha256 !== plaintextSha256) {
		throw new Error("Encrypted biometric bundle hash mismatch");
	}
	return JSON.parse(plaintext.toString("utf8"));
};
