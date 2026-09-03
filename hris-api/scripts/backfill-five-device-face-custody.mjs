import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEVICES = Object.freeze([
	{ key: "main-b", id: "cmpxw13hx002h7zwso7dyedrn" },
	{ key: "main-a", id: "cmrht5s2w00ei7zgsre8y3o5n" },
	{ key: "main-f", id: "cmrim1zop05ik7zp4zgm2sm4k" },
	{ key: "main-d", id: "cmripjwkw00ffl0013lfxcbxw" },
	{ key: "main-e", id: "cmriu5ab102goi001x9o7nfct" },
]);
const args = new Map(
	process.argv.slice(2).map((argument) => {
		const [key, ...value] = argument.replace(/^--/, "").split("=");
		return [key, value.join("=") || "true"];
	}),
);
const execute = args.get("execute") === "true";
const apiBase = String(args.get("api") || "https://dev-api.bnpi-hris.tech").replace(/\/$/, "");
const packageDir = resolve(String(args.get("package-dir") || "../.runtime/five-device-sdk-packages"));
const outputDir = resolve(String(args.get("output") || "../.runtime/five-device-face-backfill"));
const batchSize = Math.min(Math.max(Number(args.get("batch-size") || 20), 1), 50);
const deviceConcurrency = Math.min(
	Math.max(Number(args.get("device-concurrency") || 3), 1),
	5,
);
const previousProgressPath = args.get("exclude-failures-from")
	? resolve(String(args.get("exclude-failures-from")))
	: "";
const knownDeterministicFailures = new Set(["main-b:5"]);

const requestJson = async (path, options = {}, timeoutMs = 10 * 60_000) => {
	let lastError = null;
	for (let attempt = 1; attempt <= 3; attempt += 1) {
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
			if (!response.ok) {
				const error = new Error(
					`${options.method || "GET"} ${path} HTTP ${response.status}: ${raw.slice(0, 1000)}`,
				);
				error.status = response.status;
				throw error;
			}
			return raw ? JSON.parse(raw) : null;
		} catch (error) {
			lastError = error;
			if (
				attempt >= 3 ||
				!([429, 502, 503, 504].includes(Number(error?.status || 0)) ||
					/ECONNRESET|fetch failed|socket|timed out/i.test(String(error?.message || "")))
			) {
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, attempt * 5_000));
		} finally {
			clearTimeout(timer);
		}
	}
	throw lastError;
};

const main = async () => {
	if (!execute) throw new Error("Pass --execute=true after protected package backup and dry canaries");
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
	if (previousProgressPath) {
		const previous = JSON.parse(await readFile(previousProgressPath, "utf8"));
		for (const [deviceKey, state] of Object.entries(previous?.progress || {})) {
			for (const failure of state?.failures || []) {
				knownDeterministicFailures.add(`${deviceKey}:${String(failure.vendorUserId)}`);
			}
		}
	}

	const progress = {};
	const persist = () =>
		writeFile(
			resolve(outputDir, "progress.json"),
			`${JSON.stringify({ updatedAt: new Date().toISOString(), progress }, null, 2)}\n`,
			"utf8",
		);

	let deviceCursor = 0;
	await Promise.all(
		Array.from({ length: deviceConcurrency }, async () => {
			while (deviceCursor < DEVICES.length) {
				const device = DEVICES[deviceCursor++];
			const packagePayload = JSON.parse(
				await readFile(resolve(packageDir, `${device.key}-device-users.json`), "utf8"),
			);
			const users = packagePayload?.devices?.[0]?.users || [];
			const ids = users
				.filter(
					(user) =>
						Number(user?.rawBiometricCustody?.face?.countReported || 0) > 0 &&
						Number(user?.rawBiometricCustody?.face?.storedCount || 0) === 0,
				)
				.map((user) => String(user.vendorUserId))
				.filter((id) => !knownDeterministicFailures.has(`${device.key}:${id}`));
			progress[device.key] = {
				deviceId: device.id,
				planned: ids.length,
				attempted: 0,
				captured: 0,
				failed: 0,
				skippedKnownDeterministic: users.filter((user) =>
					knownDeterministicFailures.has(`${device.key}:${String(user.vendorUserId)}`),
				).length,
				failures: [],
			};
			await persist();
			for (let offset = 0; offset < ids.length; offset += batchSize) {
				const batch = ids.slice(offset, offset + batchSize);
				const response = await requestJson(
					`/api/device/${device.id}/users/biometric-metadata/backfill`,
					{
						method: "POST",
						headers,
						body: JSON.stringify({
							execute: true,
							selection: "selectedRows",
							vendorUserIds: batch,
							limit: batch.length,
							includeFingerprints: false,
							includeFaces: true,
							preferIsapiFacePhoto: true,
							refreshBiometricBundle: true,
						}),
					},
				);
				for (const result of response?.data?.results || []) {
					progress[device.key].attempted += 1;
					if (String(result.status || "").startsWith("cached_from_")) {
						progress[device.key].captured += 1;
					} else {
						progress[device.key].failed += 1;
						progress[device.key].failures.push({
							vendorUserId: String(result.vendorUserId || ""),
							status: result.status || "unknown",
							error: String(result.error || "").slice(0, 500),
						});
					}
				}
				await persist();
				process.stderr.write(
					`${JSON.stringify({
						device: device.key,
						attempted: progress[device.key].attempted,
						planned: ids.length,
						captured: progress[device.key].captured,
						failed: progress[device.key].failed,
					})}\n`,
				);
			}
			}
		}),
	);
	await persist();
	process.stdout.write(`${JSON.stringify({ outputDir, progress }, null, 2)}\n`);
};

main().catch((error) => {
	process.stderr.write(`${JSON.stringify({ success: false, error: error?.message || String(error) })}\n`);
	process.exitCode = 1;
});
