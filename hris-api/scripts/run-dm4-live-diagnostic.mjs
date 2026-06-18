#!/usr/bin/env node
import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/index.js";

const DEFAULT_API_BASE = "http://localhost:3001";
const DEFAULT_UI_BASE = "http://localhost:5175";
const DEFAULT_SOURCE = "../docs/2026-20260527T124252Z-3-001/2026;../docs/Bandai Payroll/2026 rptOvertimeDetails.xlsx";
const TERMINAL_STATUSES = new Set(["COMPLETED", "COMPLETED_WITH_WARNINGS", "FAILED", "BLOCKED", "STALE"]);

function readArgs(argv) {
	const args = {
		apiBase: process.env.HRIS_API_BASE || DEFAULT_API_BASE,
		uiBase: process.env.HRIS_UI_BASE || DEFAULT_UI_BASE,
		email: process.env.HRIS_DM4_EMAIL || "hr-manager@seed.local",
		password: process.env.HRIS_DM4_PASSWORD || "Password123!",
		appCode: process.env.HRIS_DM4_APP_CODE || "hris",
		source: process.env.HRIS_DM4_SOURCE || DEFAULT_SOURCE,
		runId: process.env.HRIS_DM4_RUN_ID || "",
		timeoutMs: Number(process.env.HRIS_DM4_TIMEOUT_MS || 60 * 60 * 1000),
		pollMs: Number(process.env.HRIS_DM4_POLL_MS || 5000),
		verifyUi: process.env.HRIS_DM4_VERIFY_UI !== "false",
		repairLogin: process.env.HRIS_DM4_REPAIR_LOGIN !== "false",
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === "--api" && next) args.apiBase = next;
		if (arg === "--ui" && next) args.uiBase = next;
		if (arg === "--email" && next) args.email = next;
		if (arg === "--password" && next) args.password = next;
		if (arg === "--source" && next) args.source = next;
		if (arg === "--run-id" && next) args.runId = next;
		if (arg === "--timeout-ms" && next) args.timeoutMs = Number(next);
		if (arg === "--poll-ms" && next) args.pollMs = Number(next);
		if (arg === "--no-ui") args.verifyUi = false;
		if (arg === "--no-repair-login") args.repairLogin = false;
		if (!arg.startsWith("-") && !args.runId && /^c[a-z0-9]{10,}$/i.test(arg)) args.runId = arg;
	}
	args.apiBase = normalizeBaseUrl(args.apiBase);
	args.uiBase = normalizeBaseUrl(args.uiBase);
	return args;
}

function normalizeBaseUrl(value) {
	return String(value || "")
		.trim()
		.replace(/^http:\/([^/])/, "http://$1")
		.replace(/^https:\/([^/])/, "https://$1")
		.replace(/\/$/, "");
}

function unwrap(payload, key) {
	return payload?.data?.[key] ?? payload?.[key] ?? payload?.data ?? payload;
}

async function requestJson(url, options = {}) {
	const response = await fetch(url, options);
	const text = await response.text();
	let payload = null;
	try {
		payload = text ? JSON.parse(text) : null;
	} catch {
		payload = { raw: text };
	}
	if (!response.ok) throw new Error(`${options.method || "GET"} ${url} failed ${response.status}: ${text}`);
	return payload;
}

async function repairSeedLogin(args) {
	console.log(`Login returned 401; repairing local seeded password for ${args.email}`);
	const prisma = new PrismaClient();
	try {
		const user = await prisma.user.findFirst({
			where: { email: args.email.toLowerCase(), isDeleted: false },
			select: { id: true, email: true },
		});
		const password = await bcrypt.hash(args.password, 10);
		if (user) {
			await prisma.user.update({
				where: { id: user.id },
				data: { password, status: "active", loginMethod: "email" },
			});
			console.log(`Seeded login repaired for ${user.email}`);
			return;
		}
		const organization = await prisma.organization.findFirst({
			where: { isDeleted: false },
			orderBy: { createdAt: "asc" },
			select: { id: true, code: true },
		});
		if (!organization) throw new Error(`Cannot create ${args.email} because the local database has no organization.`);
		await prisma.user.create({
			data: {
				email: args.email.toLowerCase(),
				userName: args.email.split("@")[0],
				password,
				status: "active",
				loginMethod: "email",
				role: "hris-hr-manager",
				organizationId: organization.id,
			},
		});
		console.log(`Seeded login created for ${args.email} in org ${organization.code || organization.id}`);
	} finally {
		await prisma.$disconnect();
	}
}

async function login(args) {
	let payload;
	try {
		payload = await requestJson(`${args.apiBase}/api/auth/login`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email: args.email, password: args.password, appCode: args.appCode }),
		});
	} catch (error) {
		if (!args.repairLogin || !String(error.message || "").includes(" 401:")) throw error;
		await repairSeedLogin(args);
		payload = await requestJson(`${args.apiBase}/api/auth/login`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email: args.email, password: args.password, appCode: args.appCode }),
		});
	}
	const user = unwrap(payload);
	const token = user?.token || payload?.data?.token;
	if (!token) throw new Error("Login succeeded but did not return an auth token.");
	const organizationId = user?.organizationId || payload?.data?.organizationId;
	if (!organizationId) throw new Error("Login succeeded but did not return organizationId.");
	return { token, organizationId, role: user?.role || "unknown" };
}

function sourceFilesFromArg(source) {
	return String(source || "")
		.split(/\r?\n|;/)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

async function startRun(args, auth) {
	if (args.runId) return args.runId;
	for (const source of sourceFilesFromArg(args.source)) {
		const resolved = resolve(process.cwd(), source);
		if (!existsSync(resolved)) console.log(`Source will be resolved by API if valid relative to backend cwd: ${source}`);
	}
	const formData = new FormData();
	const sourceFiles = sourceFilesFromArg(args.source);
	formData.append(
		"data",
		JSON.stringify({
			organizationId: auth.organizationId,
			workbookId: "dm4",
			sourceFilename: sourceFiles.length > 0 ? `${sourceFiles.length} DM4 source path(s)` : "DM4 server default source config",
			idempotencyKey: `dm4-live-${Date.now()}`,
			sourceFiles,
			options: { sourceFiles, approveHistoricalTimesheets: true },
		}),
	);
	const payload = await requestJson(`${args.apiBase}/api/migration/runs`, {
		method: "POST",
		headers: { authorization: `Bearer ${auth.token}` },
		body: formData,
	});
	const runId = payload?.data?.runId || payload?.data?.run?.id || payload?.runId;
	if (!runId) throw new Error("Start run response did not include runId.");
	return runId;
}

async function loadProgress(args, auth, runId) {
	const payload = await requestJson(`${args.apiBase}/api/migration/runs/${runId}/progress`, {
		headers: { authorization: `Bearer ${auth.token}` },
	});
	return unwrap(payload, "progress")?.progress || unwrap(payload, "progress");
}

async function loadEvents(args, auth, runId) {
	const payload = await requestJson(`${args.apiBase}/api/migration/runs/${runId}/events?limit=1000`, {
		headers: { authorization: `Bearer ${auth.token}` },
	});
	return unwrap(payload, "events")?.events || unwrap(payload, "events") || [];
}

function formatNumber(value) {
	return Number(value || 0).toLocaleString();
}

function printProgress(progress, events) {
	const importantSteps = (progress.steps || []).filter((step) => ["DM4.1", "DM4.2"].includes(step.code));
	console.clear();
	console.log("DM4 live diagnostic");
	console.log(`Run: ${progress.runId}`);
	console.log(`Status: ${progress.status} | Current: ${progress.currentStepCode || "-"} ${progress.currentStepLabel || ""}`);
	console.log("");
	console.log("Step                    Status       Processed     Total     Created     Updated     Failed");
	console.log("-----------------------------------------------------------------------------------------");
	for (const step of importantSteps) {
		const counts = step.counts || {};
		console.log(
			`${String(step.label || step.code).padEnd(23).slice(0, 23)} ${String(step.status).padEnd(12)} ${formatNumber(step.processed || counts.processed).padStart(9)} ${formatNumber(step.total || counts.total).padStart(9)} ${formatNumber(step.created || counts.created).padStart(9)} ${formatNumber(step.updated || counts.updated).padStart(9)} ${formatNumber(step.failed || counts.failed).padStart(8)}`,
		);
		if (step.blockerReason) console.log(`  blocker: ${step.blockerReason}`);
	}
	console.log("");
	console.log("Latest row events");
	console.log("-----------------");
	for (const event of events.filter(isDm4RowEvent).slice(-10)) {
		const at = event.timestamp || event.createdAt || event.at || "";
		const source = [event.sourceSheet, typeof event.sourceRow === "number" ? `row ${event.sourceRow}` : "", event.employeeId, event.employeeName]
			.filter(Boolean)
			.join(" | ");
		console.log(`${String(at).slice(11, 19)} ${event.eventType || event.type || ""} ${source ? `${source} | ` : ""}${event.message || ""}`);
	}
}

function isDm4RowEvent(event) {
	return (
		(event.eventType || event.type) === "ROW_IMPORTED" &&
		(Boolean(event.employeeId) || Boolean(event.employeeName) || typeof event.sourceRow === "number")
	);
}

async function pollUntilUseful(args, auth, runId) {
	const startedAt = Date.now();
	let progress = null;
	let events = [];
	while (Date.now() - startedAt < args.timeoutMs) {
		progress = await loadProgress(args, auth, runId);
		events = await loadEvents(args, auth, runId);
		printProgress(progress, events);
		if (TERMINAL_STATUSES.has(progress.status) || events.some(isDm4RowEvent)) return { progress, events };
		await new Promise((resolveTimeout) => setTimeout(resolveTimeout, args.pollMs));
	}
	throw new Error(`Timed out after ${args.timeoutMs}ms waiting for DM4 progress.`);
}

function printRowProof(events) {
	const rowEvents = events.filter(isDm4RowEvent);
	console.log("");
	console.log("Row-level event proof");
	console.log("---------------------");
	if (rowEvents.length === 0) {
		console.log("No DM4 row-level events returned by /api/migration/runs/:runId/events.");
		return;
	}
	for (const event of rowEvents.slice(-15)) {
		const at = event.timestamp || event.createdAt || event.at || "";
		const row = typeof event.sourceRow === "number" ? `row ${event.sourceRow}` : "row -";
		const employee = [event.employeeId, event.employeeName].filter(Boolean).join(" - ") || "employee -";
		const date = event.metadata?.businessDate ? ` date ${event.metadata.businessDate}` : "";
		console.log(`${String(at).slice(11, 19)} ${event.sourceSheet || event.stepCode || "-"} ${row} ${employee}${date} :: ${event.message}`);
	}
}

async function verifyUi(args, auth, progress) {
	if (!args.verifyUi) return { ok: true, skipped: true };
	const route = `${args.uiBase}/admin/configuration/migration?workbook=dm4&runId=${progress.runId}`;
	const response = await fetch(route, { headers: { authorization: `Bearer ${auth.token}` } });
	const text = await response.text();
	return { ok: response.ok && text.includes("DM4 - Attendance & Timesheet Workbook"), status: response.status };
}

async function main() {
	const args = readArgs(process.argv.slice(2));
	console.log(`API: ${args.apiBase}`);
	console.log(`UI: ${args.uiBase}`);
	console.log(`Source: ${args.runId ? "(resume existing run)" : args.source}`);
	const auth = await login(args);
	console.log(`Logged in as ${args.email} (${auth.role}) org=${auth.organizationId}`);
	const runId = await startRun(args, auth);
	console.log(`Run started/resumed: ${runId}`);
	const { progress, events } = await pollUntilUseful(args, auth, runId);
	printRowProof(events);
	const uiResult = await verifyUi(args, auth, progress);
	const rowEventsOk = events.some(isDm4RowEvent);
	console.log("");
	console.log("Diagnosis");
	console.log("---------");
	console.log(`Migration progress API: ${progress.status}`);
	console.log(`Migration events API: ${events.length > 0 ? `OK - ${events.length} events returned` : "CHECK - no events returned"}`);
	console.log(`Row-level event API: ${rowEventsOk ? "OK - employee/row/date DM4 events returned" : "CHECK - only summary events returned"}`);
	console.log(`Frontend route: ${uiResult.skipped ? "SKIPPED" : uiResult.ok ? "OK - DM4 route reachable" : `CHECK - route returned ${uiResult.status}`}`);
	if (!rowEventsOk || (!uiResult.ok && !uiResult.skipped)) process.exit(1);
}

main().catch((error) => {
	console.error("");
	console.error("DM4 live diagnostic failed");
	console.error("--------------------------");
	console.error(error && error.stack ? error.stack : error);
	process.exit(1);
});
