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
const EXCLUDED_DEVICE_IDS = Object.freeze([
	"cmripjwbx00ewl001ihcke210",
	"cmrlgqsjv000oob01165tbd8n",
	"cmrv02vam004cnxekd57dsjh8",
]);
const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "needs_attention", "cancelled"]);
let activeReport = null;
let activeOutput = null;

function readArgs(argv) {
	const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
	const args = {
		apiBase: process.env.HRIS_API_BASE || "http://127.0.0.1:3101",
		email: process.env.HRIS_ADMIN_EMAIL || "admin@bandai.local",
		password: process.env.HRIS_ADMIN_PASSWORD || "password123",
		appCode: process.env.HRIS_APP_CODE || "hris",
		modality: "",
		cycles: 1,
		execute: false,
		pollMs: 2_000,
		jobTimeoutMs: 20 * 60_000,
		requestTimeoutMs: 10 * 60_000,
		output: resolve(REPOSITORY_ROOT, ".runtime", `credential-recovery-canary-loop-${stamp}.json`),
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === "--api" && next) args.apiBase = next;
		if (arg === "--modality" && next) args.modality = next;
		if (arg === "--cycles" && next) args.cycles = Number(next);
		if (arg === "--poll-ms" && next) args.pollMs = Number(next);
		if (arg === "--job-timeout-ms" && next) args.jobTimeoutMs = Number(next);
		if (arg === "--request-timeout-ms" && next) args.requestTimeoutMs = Number(next);
		if (arg === "--output" && next) args.output = resolve(next);
		if (arg === "--execute") args.execute = true;
	}
	args.apiBase = String(args.apiBase).replace(/\/$/, "");
	if (!["fingerprint", "face"].includes(args.modality)) {
		throw new Error("--modality must be fingerprint or face");
	}
	if (!Number.isInteger(args.cycles) || args.cycles < 1 || args.cycles > 10) {
		throw new Error("--cycles must be an integer from 1 through 10");
	}
	if (!args.execute) {
		throw new Error(
			"Physical writes are disabled. Pass --execute only for an authorized DEV canary run.",
		);
	}
	return args;
}

async function requestJson(args, path, options = {}) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), args.requestTimeoutMs);
	const started = performance.now();
	try {
		const response = await fetch(`${args.apiBase}${path}`, {
			...options,
			signal: controller.signal,
			headers: {
				accept: "application/json",
				...(options.body ? { "content-type": "application/json" } : {}),
				...options.headers,
			},
		});
		const raw = await response.text();
		let payload;
		try {
			payload = raw ? JSON.parse(raw) : null;
		} catch {
			payload = { raw };
		}
		if (!response.ok) {
			throw new Error(
				`${options.method || "GET"} ${path} HTTP ${response.status}: ${raw.slice(0, 1200)}`,
			);
		}
		return {
			status: response.status,
			elapsedMs: Math.round(performance.now() - started),
			payload,
		};
	} finally {
		clearTimeout(timer);
	}
}

function unwrapPlan(payload) {
	return payload?.data?.plan ?? payload?.data ?? payload;
}

function assertFrozenPlan(plan) {
	const serialized = JSON.stringify(plan);
	const excludedReferences = EXCLUDED_DEVICE_IDS.filter((id) => serialized.includes(id));
	if (excludedReferences.length) {
		throw new Error(`Plan referenced excluded devices: ${excludedReferences.join(", ")}`);
	}
	if (Number(plan?.counts?.validDevices) !== DEVICES.length) {
		throw new Error(`Plan returned ${plan?.counts?.validDevices} valid devices; expected 5`);
	}
	if (Number(plan?.counts?.failedDevices) !== 0 || (plan?.errors || []).length) {
		throw new Error(`Plan had device failures: ${JSON.stringify(plan?.errors || [])}`);
	}
}

function planSummary(plan, elapsedMs) {
	return {
		planId: plan?.planId || null,
		elapsedMs,
		totalGap: Number(plan?.potentialOperations?.totalPotentialOperations ?? plan?.counts?.credentialWrites),
		byModality: {
			fingerprint: Number(plan?.potentialOperations?.byModality?.fingerprint || 0),
			face: Number(plan?.potentialOperations?.byModality?.face || 0),
			card: Number(plan?.potentialOperations?.byModality?.card || 0),
		},
		validDevices: Number(plan?.counts?.validDevices || 0),
		failedDevices: Number(plan?.counts?.failedDevices || 0),
		actionableCredentialWrites: Number(plan?.counts?.actionableCredentialWrites || 0),
		blockedCredentialWrites: Number(plan?.counts?.blockedCredentialWrites || 0),
	};
}

async function login(args) {
	const response = await requestJson(args, "/api/auth/login", {
		method: "POST",
		body: JSON.stringify({ email: args.email, password: args.password, appCode: args.appCode }),
	});
	const token = response.payload?.data?.token;
	if (!token) throw new Error("Admin login succeeded but did not return a bearer token");
	return { authorization: `Bearer ${token}` };
}

async function assertNoOverlappingWriter(args, headers) {
	const [recovery, legacy] = await Promise.all([
		requestJson(args, "/api/device/hikvision/sdk-users/merge/recovery/jobs", { headers }),
		requestJson(args, "/api/device/hikvision/sdk-users/merge/jobs", { headers }),
	]);
	const activeRecovery = (recovery.payload?.data?.jobs || []).filter((job) =>
		["pending", "recovering", "retrying"].includes(String(job?.status)),
	);
	const activeLegacy = (legacy.payload?.data?.jobs || []).filter((job) =>
		["pending", "processing", "applying", "rereading"].includes(String(job?.status)),
	);
	if (activeRecovery.length || activeLegacy.length) {
		throw new Error(
			`Overlapping physical writer exists: recovery=${activeRecovery.map((job) => job.id).join(",") || "none"} legacy=${activeLegacy.map((job) => job.id).join(",") || "none"}`,
		);
	}
}

async function freshPlan(args, headers) {
	const response = await requestJson(args, "/api/device/hikvision/sdk-users/merge/plan", {
		method: "POST",
		headers,
		body: JSON.stringify({
			execute: false,
			dryRun: true,
			deviceIds: DEVICES.map((device) => device.id),
		}),
	});
	const plan = unwrapPlan(response.payload);
	assertFrozenPlan(plan);
	const planId = plan?.planId || response.payload?.data?.planId;
	if (!planId) throw new Error("Fresh plan did not return planId");
	return { response, plan, planId, summary: planSummary(plan, response.elapsedMs) };
}

async function reviewPlan(args, headers, planId) {
	const response = await requestJson(
		args,
		"/api/device/hikvision/sdk-users/merge/recovery/review",
		{
			method: "POST",
			headers,
			body: JSON.stringify({ planId }),
		},
	);
	const review = response.payload?.data;
	if (!review?.scopeHash) throw new Error("Recovery review did not return scopeHash");
	if (
		JSON.stringify(review.deviceIds || []) !==
		JSON.stringify(DEVICES.map((device) => device.id))
	) {
		throw new Error(`Recovery review changed device scope: ${JSON.stringify(review.deviceIds)}`);
	}
	return { response, review };
}

async function startOneAttempt(args, headers, planId, scopeHash) {
	const response = await requestJson(
		args,
		"/api/device/hikvision/sdk-users/merge/recovery/jobs",
		{
			method: "POST",
			headers,
			body: JSON.stringify({
				planId,
				expectedScopeHash: scopeHash,
				maxVerifiedWrites: 1,
				canaryModality: args.modality,
			}),
		},
	);
	const job = response.payload?.data?.job;
	if (!job?.id) throw new Error("Canary start response did not return a durable job ID");
	return { response, job };
}

async function pollOneAttempt(args, headers, jobId) {
	const deadline = Date.now() + args.jobTimeoutMs;
	const transitions = [];
	let priorSignature = "";
	while (Date.now() < deadline) {
		const response = await requestJson(
			args,
			`/api/device/hikvision/sdk-users/merge/recovery/jobs/${jobId}`,
			{ headers },
		);
		const job = response.payload?.data?.job ?? response.payload?.data ?? response.payload;
		const transition = {
			at: new Date().toISOString(),
			status: job?.status,
			currentStage: job?.currentStage,
			currentTaskKey: job?.currentTaskKey,
			heartbeatAt: job?.heartbeatAt,
			resumeCursor: job?.resumeCursor,
			counters: job?.counters,
			latestError: job?.latestError,
		};
		const signature = JSON.stringify({ ...transition, at: undefined });
		if (signature !== priorSignature) {
			transitions.push(transition);
			console.log(JSON.stringify({ jobId, ...transition }));
			priorSignature = signature;
		}
		if (TERMINAL_JOB_STATUSES.has(String(job?.status))) {
			return { job, transitions };
		}
		await new Promise((resolve) => setTimeout(resolve, args.pollMs));
	}
	throw new Error(`Canary job ${jobId} did not become terminal before timeout`);
}

async function main() {
	const args = readArgs(process.argv.slice(2));
	const report = {
		schemaVersion: 1,
		kind: "credential_recovery_physical_canary_loop",
		startedAt: new Date().toISOString(),
		runtimeBuildSha: process.env.PROJECT_TRUTH_BUILD_SHA || "NEEDS_CONFIRMATION",
		modality: args.modality,
		requestedCycles: args.cycles,
		deviceIds: DEVICES.map((device) => device.id),
		excludedDeviceIds: EXCLUDED_DEVICE_IDS,
		cycles: [],
	};
	activeReport = report;
	activeOutput = args.output;
	const headers = await login(args);

	for (let cycle = 1; cycle <= args.cycles; cycle += 1) {
		await assertNoOverlappingWriter(args, headers);
		const before = await freshPlan(args, headers);
		const beforeGap = before.summary.byModality[args.modality];
		if (beforeGap < 1) throw new Error(`No ${args.modality} gap remains for cycle ${cycle}`);
		const reviewed = await reviewPlan(args, headers, before.planId);
		const started = await startOneAttempt(
			args,
			headers,
			before.planId,
			reviewed.review.scopeHash,
		);
		const polled = await pollOneAttempt(args, headers, started.job.id);
		const attemptedWriteTasks = (polled.job?.tasks || []).filter(
			(task) => task?.kind === "target_write" && Number(task?.attempts || 0) > 0,
		);
		if (attemptedWriteTasks.length !== 1) {
			throw new Error(
				`Canary ${started.job.id} attempted ${attemptedWriteTasks.length} physical writes; expected exactly 1`,
			);
		}
		if (
			String(polled.job?.status) !== "completed" ||
			Number(polled.job?.counters?.verified || 0) !== 1
		) {
			throw new Error(
				`Canary ${started.job.id} did not physically verify: status=${polled.job?.status} verified=${polled.job?.counters?.verified || 0} error=${JSON.stringify(polled.job?.latestError || null)}`,
			);
		}
		const after = await freshPlan(args, headers);
		const afterGap = after.summary.byModality[args.modality];
		if (afterGap !== beforeGap - 1) {
			throw new Error(
				`Physical reread gap proof failed for ${args.modality}: before=${beforeGap} after=${afterGap}`,
			);
		}
		report.cycles.push({
			cycle,
			jobId: started.job.id,
			planId: before.planId,
			scopeHash: reviewed.review.scopeHash,
			before: before.summary,
			reviewCounters: reviewed.review.counters,
			transitions: polled.transitions,
			attemptedWriteTask: {
				taskKey: attemptedWriteTasks[0].taskKey,
				modality: attemptedWriteTasks[0].modality,
				sourceDeviceId: attemptedWriteTasks[0].sourceDeviceId,
				targetDeviceId: attemptedWriteTasks[0].targetDeviceId,
				vendorUserId: attemptedWriteTasks[0].vendorUserId,
				attempts: attemptedWriteTasks[0].attempts,
				stage: attemptedWriteTasks[0].stage,
			},
			after: after.summary,
			verifiedReduction: 1,
		});
		await mkdir(dirname(args.output), { recursive: true });
		await writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	}
	report.completedAt = new Date().toISOString();
	report.success = report.cycles.length === args.cycles;
	await mkdir(dirname(args.output), { recursive: true });
	await writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	console.log(
		JSON.stringify(
			{
				output: args.output,
				success: report.success,
				modality: args.modality,
				cycles: report.cycles.length,
				verifiedReductions: report.cycles.reduce(
					(total, cycle) => total + cycle.verifiedReduction,
					0,
				),
			},
			null,
			2,
		),
	);
}

main().catch(async (error) => {
	const failure = {
		success: false,
		error: String(error?.message || error),
		failedAt: new Date().toISOString(),
	};
	if (activeReport && activeOutput) {
		activeReport.completedAt = failure.failedAt;
		activeReport.success = false;
		activeReport.failure = failure;
		await mkdir(dirname(activeOutput), { recursive: true }).catch(() => undefined);
		await writeFile(activeOutput, `${JSON.stringify(activeReport, null, 2)}\n`, "utf8").catch(
			() => undefined,
		);
	}
	console.error(JSON.stringify({ ...failure, output: activeOutput }, null, 2));
	process.exitCode = 1;
});
