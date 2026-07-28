import { chmod, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEVICES = Object.freeze([
	{ key: "main-b", id: "cmpxw13hx002h7zwso7dyedrn", name: "Main Entrance Device B" },
	{ key: "main-a", id: "cmrht5s2w00ei7zgsre8y3o5n", name: "Main Entrance Device A" },
	{ key: "main-f", id: "cmrim1zop05ik7zp4zgm2sm4k", name: "Main Entrance Device F" },
	{ key: "main-d", id: "cmripjwkw00ffl0013lfxcbxw", name: "Main Entrance Device D" },
	{ key: "main-e", id: "cmriu5ab102goi001x9o7nfct", name: "Main Entrance Device E" },
]);
const args = new Map(
	process.argv.slice(2).map((argument) => {
		const [key, ...value] = argument.replace(/^--/, "").split("=");
		return [key, value.join("=") || "true"];
	}),
);
const apiBase = String(args.get("api") || "https://dev-api.bnpi-hris.tech").replace(/\/$/, "");
const outputDir = resolve(String(args.get("output") || "../.runtime/five-device-sdk-packages"));
const requestTimeoutMs = Math.max(Number(args.get("timeout-ms") || 10 * 60_000), 30_000);
const deviceConcurrency = Math.min(
	Math.max(Number(args.get("device-concurrency") || 2), 1),
	5,
);
const selectedKeys = new Set(
	String(args.get("devices") || "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean),
);
const selectedDevices = selectedKeys.size
	? DEVICES.filter((device) => selectedKeys.has(device.key))
	: DEVICES;

const requestJson = async (path, options = {}) => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
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

	const packages = [];
	let deviceCursor = 0;
	await Promise.all(
		Array.from({ length: deviceConcurrency }, async () => {
			while (deviceCursor < selectedDevices.length) {
				const device = selectedDevices[deviceCursor++];
			const startedAt = Date.now();
			const response = await requestJson("/api/device/users/export", {
				method: "POST",
				headers,
				body: JSON.stringify({
					deviceId: device.id,
					scope: "currentDevice",
					includeFingerprints: true,
					includeFaces: true,
					rawBiometricPackage: true,
					refreshSourceUsers: true,
					selection: "all",
				}),
			});
			const devicePackage = response?.data;
			if (!devicePackage?.devices?.length) {
				throw new Error(`${device.name} export did not return a package device`);
			}
			const path = resolve(outputDir, `${device.key}-device-users.json`);
			await writeFile(path, `${JSON.stringify(devicePackage, null, 2)}\n`, "utf8");
			await chmod(path, 0o600).catch(() => undefined);
			packages.push({
				...device,
				path,
				elapsedMs: Date.now() - startedAt,
				schemaVersion: devicePackage.schemaVersion,
				totalUsers: Number(devicePackage.devices[0]?.summary?.totalUsers || 0),
				readFromDevice: Number(devicePackage.devices[0]?.summary?.readFromDevice || 0),
				fingerprintUsers: Number(
					devicePackage.devices[0]?.summary?.biometrics?.fingerprintCountReported || 0,
				),
				faceUsers: Number(
					devicePackage.devices[0]?.summary?.biometrics?.faceCountReported || 0,
				),
			});
			}
		}),
	);
	packages.sort(
		(left, right) =>
			selectedDevices.findIndex((device) => device.key === left.key) -
			selectedDevices.findIndex((device) => device.key === right.key),
	);
	const summaryPath = resolve(outputDir, "export-summary.json");
	await writeFile(
		summaryPath,
		`${JSON.stringify({ exportedAt: new Date().toISOString(), packages }, null, 2)}\n`,
		"utf8",
	);
	process.stdout.write(`${JSON.stringify({ outputDir, packages }, null, 2)}\n`);
};

main().catch((error) => {
	process.stderr.write(`${JSON.stringify({ success: false, error: error?.message || String(error) })}\n`);
	process.exitCode = 1;
});
