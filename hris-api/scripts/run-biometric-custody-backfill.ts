import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();
const args = new Map(
	process.argv.slice(2).map((argument) => {
		const [key, ...value] = argument.replace(/^--/, "").split("=");
		return [key, value.join("=") || "true"];
	}),
);
const deviceId = String(args.get("device-id") || "");
const apiBase = String(args.get("api-base") || "http://localhost:3001").replace(/\/$/, "");
const execute = args.get("execute") === "true";
const concurrency = Math.min(Math.max(Number(args.get("concurrency") || 2), 1), 4);
const maxTasks = Math.max(Number(args.get("max-tasks") || 0), 0);
const preferIsapiFacePhoto = args.get("prefer-isapi-face-photo") === "true";
const evidenceDir = path.resolve(
	String(args.get("evidence-dir") || "../.runtime/biometric-custody-backfill"),
);

const parseEnvelope = (value: unknown, modality: "fingerprint" | "face") => {
	try {
		const parsed = typeof value === "string" ? JSON.parse(value) : value;
		return Boolean(
			parsed &&
				typeof parsed === "object" &&
				(parsed as any).algorithm === "aes-256-gcm" &&
				(parsed as any).modality === modality &&
				String((parsed as any).ciphertext || "").length > 0 &&
				String((parsed as any).authTag || "").length > 0,
		);
	} catch {
		return false;
	}
};

const inspect = (row: any) => {
	const raw = row.rawPayload?._hrisDeviceMetadata || {};
	const vendor = row.vendorMetadata || {};
	const summary = raw.credentialSummary || vendor.credentialSummary || {};
	const bundle = vendor.biometricBundle || {};
	const fingerprint =
		raw.biometricExport?.encryptedFingerprintTemplate ||
		bundle.encryptedFingerprintTemplate ||
		bundle.fingerprintRawTemplateBlob;
	const face =
		raw.biometricExport?.encryptedFaceTemplate ||
		bundle.encryptedFaceTemplate ||
		bundle.faceRawTemplateBlob;
	return {
		vendorUserId: row.vendorUserId,
		fingerprintCountReported: Number(summary.fingerprintCount || 0),
		faceCountReported: Number(summary.faceCount || 0),
		fingerprintEnvelopeValid: parseEnvelope(fingerprint, "fingerprint"),
		faceEnvelopeValid: parseEnvelope(face, "face"),
		fingerprintCiphertextLength: parseEnvelope(fingerprint, "fingerprint")
			? String(typeof fingerprint === "string" ? JSON.parse(fingerprint).ciphertext : fingerprint.ciphertext).length
			: 0,
		faceCiphertextLength: parseEnvelope(face, "face")
			? String(typeof face === "string" ? JSON.parse(face).ciphertext : face.ciphertext).length
			: 0,
	};
};

const writeJson = async (name: string, value: unknown) =>
	writeFile(path.join(evidenceDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const main = async () => {
	if (!deviceId) throw new Error("--device-id is required");
	await mkdir(evidenceDir, { recursive: true });
	const rows = await prisma.deviceUser.findMany({
		where: { deviceId },
		orderBy: { vendorUserId: "asc" },
	});
	const before = rows.map(inspect);
	await writeJson("all-users-before-sanitized.json", before);
	const backupText = `${JSON.stringify(rows, null, 2)}\n`;
	await writeFile(path.join(evidenceDir, "device-users-before.private-backup.json"), backupText, {
		encoding: "utf8",
		mode: 0o600,
	});
	await writeJson("device-users-before.private-backup.sha256.json", {
		rows: rows.length,
		sha256: createHash("sha256").update(backupText).digest("hex"),
		containsEncryptedCustodyData: true,
		chatSafe: false,
	});

	const tasks = before.flatMap((row) => [
		...(row.fingerprintCountReported > 0 && !row.fingerprintEnvelopeValid
			? [{ vendorUserId: row.vendorUserId, modality: "fingerprint" as const }]
			: []),
		...(row.faceCountReported > 0 && !row.faceEnvelopeValid
			? [{ vendorUserId: row.vendorUserId, modality: "face" as const }]
			: []),
	]);
	const selectedTasks = maxTasks ? tasks.slice(0, maxTasks) : tasks;
	await writeJson("plan.json", {
		execute,
		deviceId,
		users: rows.length,
		tasks: selectedTasks.length,
		fingerprints: selectedTasks.filter((task) => task.modality === "fingerprint").length,
		faces: selectedTasks.filter((task) => task.modality === "face").length,
		concurrency,
		preferIsapiFacePhoto,
	});
	if (!execute) return;

	const loginResponse = await fetch(`${apiBase}/api/auth/login`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			email: process.env.PROJECT_TRUTH_ADMIN_EMAIL || "admin@bandai.local",
			password: process.env.PROJECT_TRUTH_ADMIN_PASSWORD || "password123",
			appCode: "hris",
		}),
	});
	const login = await loginResponse.json();
	const token = login?.data?.token;
	if (!token) throw new Error(`Admin login failed with HTTP ${loginResponse.status}`);

	const progress: any[] = [];
	let cursor = 0;
	const worker = async () => {
		while (cursor < selectedTasks.length) {
			const task = selectedTasks[cursor++];
			const startedAt = Date.now();
			let result: any = null;
			for (let transportAttempt = 1; transportAttempt <= 3 && !result; transportAttempt += 1) {
			try {
				const response = await fetch(`${apiBase}/api/device/${deviceId}/users/biometric-metadata/backfill`, {
					method: "POST",
					headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
					body: JSON.stringify({
						execute: true,
						selection: "selectedRows",
						vendorUserIds: [task.vendorUserId],
						limit: 1,
						includeFingerprints: task.modality === "fingerprint",
						includeFaces: task.modality === "face",
						preferIsapiFacePhoto: preferIsapiFacePhoto && task.modality === "face",
					}),
				});
				const body = await response.json();
				const row = body?.data?.results?.[0] || {};
				result = {
					vendorUserId: task.vendorUserId,
					modality: task.modality,
					status: response.ok ? row.status || "unknown" : "http_failed",
					httpStatus: response.status,
					elapsedMs: Date.now() - startedAt,
					ciphertextLength:
						task.modality === "fingerprint"
							? Number(row.fingerprintCiphertextLength || 0)
							: Number(row.faceCiphertextLength || 0),
					error: row.error || (!response.ok ? body?.message || "request_failed" : null),
				};
			} catch (error: any) {
				if (transportAttempt < 3) {
					await new Promise((resolve) => setTimeout(resolve, transportAttempt * 5000));
					continue;
				}
				result = {
					vendorUserId: task.vendorUserId,
					modality: task.modality,
					status: "request_failed",
					transportAttempts: transportAttempt,
					elapsedMs: Date.now() - startedAt,
					error: error?.message || "request_failed",
				};
			}
			}
			progress.push(result);
			await writeJson("progress.json", progress);
		}
	};
	await Promise.all(Array.from({ length: concurrency }, () => worker()));
	const afterRows = await prisma.deviceUser.findMany({ where: { deviceId }, orderBy: { vendorUserId: "asc" } });
	const after = afterRows.map(inspect);
	await writeJson("all-users-after-sanitized.json", after);
	await writeJson("summary.json", {
		users: after.length,
		fingerprintCountPositive: after.filter((row) => row.fingerprintCountReported > 0).length,
		fingerprintEnvelopeValid: after.filter((row) => row.fingerprintEnvelopeValid).length,
		faceCountPositive: after.filter((row) => row.faceCountReported > 0).length,
		faceEnvelopeValid: after.filter((row) => row.faceEnvelopeValid).length,
		cachedFromSdk: progress.filter((row) => row.status === "cached_from_hikvision_sdk").length,
		cachedFromIsapiFacePhoto: progress.filter(
			(row) => row.status === "cached_from_hikvision_isapi_face_photo",
		).length,
		failedTasks: progress.filter((row) => row.status === "failed" || row.status === "request_failed").length,
	});
};

main().finally(() => prisma.$disconnect());
