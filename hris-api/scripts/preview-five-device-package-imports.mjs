import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CASES = Object.freeze([
	{ key: "main-b", targetDeviceId: "cmrht5s2w00ei7zgsre8y3o5n" },
	{ key: "main-a", targetDeviceId: "cmrim1zop05ik7zp4zgm2sm4k" },
	{ key: "main-f", targetDeviceId: "cmripjwkw00ffl0013lfxcbxw" },
	{ key: "main-d", targetDeviceId: "cmriu5ab102goi001x9o7nfct" },
	{ key: "main-e", targetDeviceId: "cmpxw13hx002h7zwso7dyedrn" },
]);
const args = new Map(
	process.argv.slice(2).map((argument) => {
		const [key, ...value] = argument.replace(/^--/, "").split("=");
		return [key, value.join("=") || "true"];
	}),
);
const apiBase = String(args.get("api") || "http://localhost:3001").replace(/\/$/, "");
const packageDir = resolve(String(args.get("package-dir") || "../.runtime/five-device-sdk-packages"));
const outputDir = resolve(String(args.get("output") || "../.runtime/five-device-import-previews"));
const timeoutMs = Math.max(Number(args.get("timeout-ms") || 300_000), 30_000);

const requestJson = async (path, options = {}) => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(`${apiBase}${path}`, {
			...options,
			signal: controller.signal,
			headers: {
				accept: "application/json",
				...(options.body ? { "content-type": "application/json" } : {}),
				...options.headers,
			},
		});
		const raw = await response.text();
		const payload = raw ? JSON.parse(raw) : null;
		if (!response.ok) {
			throw new Error(`${options.method || "GET"} ${path} HTTP ${response.status}: ${raw.slice(0, 1000)}`);
		}
		return payload;
	} finally {
		clearTimeout(timer);
	}
};

const main = async () => {
	await mkdir(outputDir, { recursive: true });
	const login = await requestJson("/api/auth/login", {
		method: "POST",
		body: JSON.stringify({
			email: process.env.HRIS_ADMIN_EMAIL || "admin@bandai.local",
			password: process.env.HRIS_ADMIN_PASSWORD || "password123",
			appCode: "hris",
		}),
	});
	const token = login?.data?.token;
	if (!token) throw new Error("Admin login did not return a token");
	const headers = { authorization: `Bearer ${token}` };
	const results = [];
	for (const item of CASES) {
		const payload = JSON.parse(
			await readFile(resolve(packageDir, `${item.key}-device-users.json`), "utf8"),
		);
		const startedAt = Date.now();
		const response = await requestJson("/api/device/users/import/preview", {
			method: "POST",
			headers,
			body: JSON.stringify({
				execute: false,
				dryRun: true,
				targetDeviceId: item.targetDeviceId,
				payload,
			}),
		});
		const preview = response?.data;
		const evidencePath = resolve(outputDir, `${item.key}-preview.json`);
		await writeFile(evidencePath, `${JSON.stringify(response, null, 2)}\n`, "utf8");
		await chmod(evidencePath, 0o600).catch(() => undefined);
		results.push({
			key: item.key,
			targetDeviceId: item.targetDeviceId,
			targetDeviceName: preview?.targetDevice?.name || null,
			elapsedMs: Date.now() - startedAt,
			users: preview?.file?.users || 0,
			newUsers: preview?.counts?.newUsers || 0,
			matchingUsers: preview?.counts?.matchingUsers || 0,
			conflicts: preview?.counts?.conflicts || 0,
			rawFingerprintBlobCount: preview?.rawBiometricPackage?.rawFingerprintBlobCount || 0,
			rawFaceBlobCount: preview?.rawBiometricPackage?.rawFaceBlobCount || 0,
			executeAvailable: preview?.executeAvailable === true,
			executeBlockedReason: preview?.executeBlockedReason || null,
			previewTokenPresent: Boolean(preview?.previewToken),
		});
	}
	await writeFile(
		resolve(outputDir, "summary.json"),
		`${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
		"utf8",
	);
	process.stdout.write(`${JSON.stringify({ outputDir, results }, null, 2)}\n`);
};

main().catch((error) => {
	process.stderr.write(`${JSON.stringify({ success: false, error: error?.message || String(error) })}\n`);
	process.exitCode = 1;
});
