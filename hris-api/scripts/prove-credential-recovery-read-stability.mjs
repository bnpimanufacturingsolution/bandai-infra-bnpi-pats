#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const DEVICES = Object.freeze([
	{ id: "cmpxw13hx002h7zwso7dyedrn", name: "Main Entrance Device B" },
	{ id: "cmrht5s2w00ei7zgsre8y3o5n", name: "Main Entrance Device A" },
	{ id: "cmrim1zop05ik7zp4zgm2sm4k", name: "Main Entrance Device F" },
	{ id: "cmripjwkw00ffl0013lfxcbxw", name: "Main Entrance Device D" },
	{ id: "cmriu5ab102goi001x9o7nfct", name: "Main Entrance Device E" },
]);

const EXCLUDED_DEVICE_IDS = new Set([
	"cmripjwbx00ewl001ihcke210",
	"cmrlgqsjv000oob01165tbd8n",
	"cmrv02vam004cnxekd57dsjh8",
]);

function readArgs(argv) {
	const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
	const args = {
		apiBase: process.env.HRIS_API_BASE || "http://127.0.0.1:53101",
		email: process.env.HRIS_ADMIN_EMAIL || "admin@bandai.local",
		password: process.env.HRIS_ADMIN_PASSWORD || "password123",
		appCode: process.env.HRIS_APP_CODE || "hris",
		quickCycles: Number(process.env.HRIS_STABILITY_QUICK_CYCLES || 3),
		sameDeviceConcurrency: [2, 3, 4],
		planCycles: Number(process.env.HRIS_STABILITY_PLAN_CYCLES || 3),
		requestTimeoutMs: Number(process.env.HRIS_STABILITY_REQUEST_TIMEOUT_MS || 180_000),
		output: resolve(REPOSITORY_ROOT, ".runtime", `credential-recovery-read-stability-${stamp}.json`),
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === "--api" && next) args.apiBase = next;
		if (arg === "--quick-cycles" && next) args.quickCycles = Number(next);
		if (arg === "--same-device-concurrency" && next) {
			args.sameDeviceConcurrency = next.split(",").map(Number);
		}
		if (arg === "--plan-cycles" && next) args.planCycles = Number(next);
		if (arg === "--timeout-ms" && next) args.requestTimeoutMs = Number(next);
		if (arg === "--output" && next) args.output = resolve(next);
	}
	args.apiBase = String(args.apiBase).replace(/\/$/, "");
	if (
		![args.quickCycles, args.planCycles, args.requestTimeoutMs].every(Number.isFinite) ||
		args.quickCycles < 1 ||
		args.planCycles < 0 ||
		args.requestTimeoutMs < 1 ||
		args.sameDeviceConcurrency.some((value) => !Number.isInteger(value) || value < 1)
	) {
		throw new Error("Invalid cycle, concurrency, or timeout argument");
	}
	return args;
}

function classifyFailure(error) {
	const status = Number(error?.status || 0);
	const message = [error?.message, error?.cause?.message, error?.cause?.code]
		.filter(Boolean)
		.join(" ");
	const normalized = message.toLowerCase();
	if (status === 401 || status === 403 || /unauthori[sz]ed|forbidden|digest auth/.test(normalized)) {
		return "authentication";
	}
	if (/can't reach database|database server|connection pool|p20(?:02|24)|econnrefused.*5432/.test(normalized)) {
		return "database_transport";
	}
	if (/abort|timed? ?out|timeout|deadline/.test(normalized)) return "timeout";
	if (/econnreset|econnrefused|enotfound|socket|fetch failed|network error|tls|certificate/.test(normalized)) {
		return "api_or_tunnel_transport";
	}
	if (status >= 500) return "server_contract";
	if (status >= 400 || /did not return|required|unexpected response/.test(normalized)) {
		return "request_or_response_contract";
	}
	return "unknown_observability_defect";
}

async function requestJson(args, path, options = {}) {
	const started = performance.now();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), args.requestTimeoutMs);
	try {
		let response;
		try {
			response = await fetch(`${args.apiBase}${path}`, {
				...options,
				signal: controller.signal,
				headers: {
					accept: "application/json",
					...(options.body ? { "content-type": "application/json" } : {}),
					...options.headers,
				},
			});
		} catch (cause) {
			const error = new Error(
				`${options.method || "GET"} ${path} transport failed: ${
					cause?.cause?.code || cause?.cause?.message || cause?.message || cause
				}`,
				{ cause },
			);
			error.elapsedMs = Math.round(performance.now() - started);
			throw error;
		}
		const raw = await response.text();
		let payload;
		try {
			payload = raw ? JSON.parse(raw) : null;
		} catch {
			payload = { raw };
		}
		const elapsedMs = Math.round(performance.now() - started);
		if (!response.ok) {
			const error = new Error(
				`${options.method || "GET"} ${path} returned HTTP ${response.status}: ${raw.slice(0, 800)}`,
			);
			error.status = response.status;
			error.elapsedMs = elapsedMs;
			error.payload = payload;
			throw error;
		}
		return { payload, elapsedMs, status: response.status };
	} finally {
		clearTimeout(timer);
	}
}

async function measured(name, action, metadata = {}) {
	const startedAt = new Date().toISOString();
	try {
		const value = await action();
		return { name, ok: true, startedAt, ...metadata, ...value };
	} catch (error) {
		return {
			name,
			ok: false,
			startedAt,
			...metadata,
			elapsedMs: error?.elapsedMs ?? null,
			classification: classifyFailure(error),
			error: String(error?.message || error),
		};
	}
}

function percentile(values, fraction) {
	if (!values.length) return null;
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function summarize(results) {
	const elapsed = results.filter((result) => result.ok).map((result) => result.elapsedMs);
	const failures = results.filter((result) => !result.ok);
	return {
		attempts: results.length,
		succeeded: results.length - failures.length,
		failed: failures.length,
		minMs: elapsed.length ? Math.min(...elapsed) : null,
		p50Ms: percentile(elapsed, 0.5),
		p95Ms: percentile(elapsed, 0.95),
		maxMs: elapsed.length ? Math.max(...elapsed) : null,
		failureClassifications: failures.reduce((counts, failure) => {
			counts[failure.classification] = (counts[failure.classification] || 0) + 1;
			return counts;
		}, {}),
	};
}

async function main() {
	const args = readArgs(process.argv.slice(2));
	const report = {
		schemaVersion: 1,
		kind: "credential_recovery_read_stability",
		startedAt: new Date().toISOString(),
		apiBase: args.apiBase,
		safety: {
			readOnly: true,
			deviceIds: DEVICES.map((device) => device.id),
			excludedDeviceIds: [...EXCLUDED_DEVICE_IDS],
			physicalWrites: 0,
		},
		config: {
			quickCycles: args.quickCycles,
			sameDeviceConcurrency: args.sameDeviceConcurrency,
			planCycles: args.planCycles,
			requestTimeoutMs: args.requestTimeoutMs,
		},
		phases: {},
	};

	const login = await requestJson(args, "/api/auth/login", {
		method: "POST",
		body: JSON.stringify({ email: args.email, password: args.password, appCode: args.appCode }),
	});
	const token = login.payload?.data?.token;
	if (!token) throw new Error("Admin login succeeded but did not return a token");
	const headers = { authorization: `Bearer ${token}` };
	const quickHealth = (device) =>
		measured(
			"quick_health",
			async () => {
				const response = await requestJson(args, `/api/device/${device.id}/health?quick=true`, {
					headers,
				});
				const health = response.payload?.data ?? response.payload;
				const deviceApi =
					health?.checks?.deviceApi ?? health?.deviceApi ?? health?.health?.deviceApi;
				if (deviceApi?.ok !== true) {
					throw new Error(
						`Quick health did not return credentialed deviceApi.ok=true: ${JSON.stringify(health).slice(0, 800)}`,
					);
				}
				return { elapsedMs: response.elapsedMs, httpStatus: response.status };
			},
			{ deviceId: device.id, deviceName: device.name },
		);

	const sequential = [];
	for (let cycle = 1; cycle <= args.quickCycles; cycle += 1) {
		for (const device of DEVICES) sequential.push({ cycle, ...(await quickHealth(device)) });
	}
	report.phases.sequentialQuickHealth = { results: sequential, summary: summarize(sequential) };

	const sameDevice = [];
	for (const concurrency of args.sameDeviceConcurrency) {
		for (const device of DEVICES) {
			const batchStarted = performance.now();
			const results = await Promise.all(
				Array.from({ length: concurrency }, (_, index) => quickHealth(device).then((result) => ({
					requestIndex: index + 1,
					...result,
				}))),
			);
			sameDevice.push({
				deviceId: device.id,
				deviceName: device.name,
				concurrency,
				batchElapsedMs: Math.round(performance.now() - batchStarted),
				results,
				summary: summarize(results),
			});
		}
	}
	report.phases.sameDeviceConcurrentQuickHealth = { batches: sameDevice };

	const crossDevice = [];
	for (let cycle = 1; cycle <= args.quickCycles; cycle += 1) {
		const batchStarted = performance.now();
		const results = await Promise.all(DEVICES.map(quickHealth));
		crossDevice.push({
			cycle,
			batchElapsedMs: Math.round(performance.now() - batchStarted),
			results,
			summary: summarize(results),
		});
	}
	report.phases.crossDeviceParallelQuickHealth = { batches: crossDevice };

	const plans = [];
	for (let cycle = 1; cycle <= args.planCycles; cycle += 1) {
		plans.push(
			await measured("five_device_merge_plan", async () => {
				const response = await requestJson(args, "/api/device/hikvision/sdk-users/merge/plan", {
					method: "POST",
					headers,
					body: JSON.stringify({
						execute: false,
						dryRun: true,
						deviceIds: DEVICES.map((device) => device.id),
					}),
				});
				const plan = response.payload?.data?.plan ?? response.payload?.data ?? response.payload;
				const returnedIds = new Set(
					(plan?.devices || plan?.sourceDevices || [])
						.map((device) => String(device?.id || device?.deviceId || ""))
						.filter(Boolean),
				);
				const excludedReferences = [...EXCLUDED_DEVICE_IDS].filter((id) =>
					JSON.stringify(plan).includes(id),
				);
				const errors = plan?.errors || plan?.sourceErrors || [];
				if (excludedReferences.length) {
					throw new Error(`Plan referenced excluded devices: ${excludedReferences.join(", ")}`);
				}
				if (Array.isArray(errors) && errors.length) {
					throw new Error(`Plan returned source errors: ${JSON.stringify(errors).slice(0, 800)}`);
				}
				if (returnedIds.size && DEVICES.some((device) => !returnedIds.has(device.id))) {
					throw new Error(`Plan response omitted an included device: ${JSON.stringify([...returnedIds])}`);
				}
				return {
					cycle,
					elapsedMs: response.elapsedMs,
					httpStatus: response.status,
					planId: plan?.planId || response.payload?.data?.planId || null,
					counts: plan?.counts || null,
					excludedReferences: excludedReferences.length,
				};
			}),
		);
	}
	report.phases.repeatedFiveDevicePlans = { results: plans, summary: summarize(plans) };

	const allResults = [
		...sequential,
		...sameDevice.flatMap((batch) => batch.results),
		...crossDevice.flatMap((batch) => batch.results),
		...plans,
	];
	const failures = allResults.filter((result) => !result.ok);
	report.completedAt = new Date().toISOString();
	report.summary = {
		...summarize(allResults),
		stable: failures.length === 0,
		unknownObservabilityDefects: failures.filter(
			(result) => result.classification === "unknown_observability_defect",
		).length,
	};
	await mkdir(dirname(args.output), { recursive: true });
	await writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	console.log(JSON.stringify({ output: args.output, summary: report.summary }, null, 2));
	process.exitCode = report.summary.stable ? 0 : 1;
}

main().catch((error) => {
	console.error(
		JSON.stringify(
			{ fatal: true, classification: classifyFailure(error), error: String(error?.message || error) },
			null,
			2,
		),
	);
	process.exitCode = 1;
});
