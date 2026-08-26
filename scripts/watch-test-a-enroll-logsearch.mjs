/**
 * Local realtime enroll watcher for TEST A.
 * Polls device logSearch for addUserInfo / addFpByEmployeeNo and persists
 * DeviceEvent rows with opaque→plain resolve + DeviceUser inventory stub.
 *
 * Env:
 *   FORCE_DATABASE_URL / DATABASE_URL
 *   ENROLL_WATCH_DEVICE_ID (default cmrlgqsjv000oob01165tbd8n)
 *   ENROLL_WATCH_MINUTES (default 15)
 *   ENROLL_WATCH_POLL_MS (default 3000)
 *   ENROLL_WATCH_OUT_DIR
 *   ENROLL_WATCH_API_BASE (optional — if set with ENROLL_WATCH_TOKEN, also POST callback for socket)
 *   ENROLL_WATCH_TOKEN
 *   ENROLL_WATCH_EMPLOYEE_HINT
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../hris-api/generated/prisma/index.js";
import { hikvisionFetch } from "../hris-api/lib/hikvision-client.js";
import {
	buildHikvisionLogSearchXml,
	normalizeHikvisionLogSearchRow,
	parseHikvisionLogSearchResponse,
	isOpaqueHikvisionPersonToken,
} from "../hris-api/helper/hikvision-event-contract.helper.js";
import {
	applyDevicePersonTokenToEvidence,
	formatHikvisionPlus08,
	upsertDeviceUserInventoryStub,
} from "../hris-api/helper/device-person-token.helper.js";

const deviceId = process.env.ENROLL_WATCH_DEVICE_ID || "cmrlgqsjv000oob01165tbd8n";
const minutes = Math.max(1, Number(process.env.ENROLL_WATCH_MINUTES || 15));
const pollMs = Math.max(1000, Number(process.env.ENROLL_WATCH_POLL_MS || 3000));
const outDir =
	process.env.ENROLL_WATCH_OUT_DIR ||
	path.join(".runtime", `enroll-watch-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const apiBase = String(process.env.ENROLL_WATCH_API_BASE || "").replace(/\/$/, "");
const token = process.env.ENROLL_WATCH_TOKEN || "";
const employeeHint = String(process.env.ENROLL_WATCH_EMPLOYEE_HINT || "").trim();

fs.mkdirSync(outDir, { recursive: true });
const logPath = path.join(outDir, "watch-events.jsonl");

const dbUrl =
	process.env.FORCE_DATABASE_URL ||
	process.env.DATABASE_URL ||
	"postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public";

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const META = [
	{
		metaId: "log.hikvision.com/Information/addUserInfo",
		eventAction: "USER_CREATED",
		eventLabel: "Device user created",
		minor: "addUserInfo",
	},
	{
		metaId: "log.hikvision.com/Information/addFpByEmployeeNo",
		eventAction: "FINGERPRINT_ENROLLED",
		eventLabel: "Fingerprint enrolled",
		minor: "addFpByEmployeeNo",
	},
	// parent Information as fallback (noise filtered by minor later)
	{
		metaId: "log.hikvision.com/Information",
		eventAction: null,
		eventLabel: null,
		minor: null,
	},
];

function logLine(obj) {
	const line = JSON.stringify({ ts: new Date().toISOString(), ...obj });
	fs.appendFileSync(logPath, line + "\n", "utf8");
	console.log(line);
}

function classifyRow(row, preferred) {
	const meta = String(row.metaId || preferred.metaId || "");
	const minor = String(row.minorType || row.minor || "");
	if (meta.includes("addUserInfo") || /addUserInfo/i.test(minor)) {
		return {
			eventAction: "USER_CREATED",
			eventLabel: "Device user created",
			minor: "addUserInfo",
		};
	}
	if (meta.includes("addFp") || /addFp|fingerprint/i.test(minor)) {
		return {
			eventAction: "FINGERPRINT_ENROLLED",
			eventLabel: "Fingerprint enrolled",
			minor: "addFpByEmployeeNo",
		};
	}
	if (preferred.eventAction) {
		return {
			eventAction: preferred.eventAction,
			eventLabel: preferred.eventLabel,
			minor: preferred.minor,
		};
	}
	return null;
}

async function maybePostCallback(saved) {
	if (!apiBase || !token || !saved?.id) return;
	// Soft notify: UI also recovery-polls; callback re-post may dedupe.
	// Prefer direct socket emission path is already in API on create if we used controller.
	// Here we just hit events list to keep session warm — optional.
	try {
		await fetch(
			`${apiBase}/api/device/events?deviceId=${encodeURIComponent(deviceId)}&limit=1`,
			{
				headers: { Authorization: `Bearer ${token}` },
			},
		);
	} catch {
		// ignore
	}
}

async function tick(device, request, seen) {
	const start = formatHikvisionPlus08(Date.now() - 5 * 60 * 1000);
	const end = formatHikvisionPlus08(Date.now() + 2 * 60 * 1000);
	let saved = 0;

	for (const pref of META) {
		let response;
		try {
			response = await hikvisionFetch("/ISAPI/ContentMgmt/logSearch", {
				method: "POST",
				deviceId,
				prisma,
				request,
				timeoutMs: 20000,
				ensureJsonFormat: false,
				rawResponse: true,
				headers: {
					Accept: "application/xml, text/xml, */*",
					"Content-Type": "application/xml; charset=UTF-8",
				},
				body: buildHikvisionLogSearchXml({
					searchId: `enroll-watch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
					startTime: start,
					endTime: end,
					maxResults: 30,
					searchResultPosition: 0,
					metaId: pref.metaId,
				}),
			});
		} catch (e) {
			logLine({ level: "warn", metaId: pref.metaId, error: String(e?.message || e) });
			continue;
		}

		const parsed = parseHikvisionLogSearchResponse(String(response.raw || ""));
		for (const row of parsed.rows || []) {
			const classified = classifyRow(row, pref);
			if (!classified) continue;

			const evidence = normalizeHikvisionLogSearchRow(row, device);
			const applied = await applyDevicePersonTokenToEvidence(prisma, {
				organizationId: device.organizationId,
				deviceId,
				evidence,
			});

			const rawEmp = String(applied.employeeNo || evidence.employeeNo || "").trim();
			const opaque =
				applied.opaquePersonToken ||
				(isOpaqueHikvisionPersonToken(rawEmp) ? rawEmp : null);
			const plain =
				!isOpaqueHikvisionPersonToken(String(applied.employeeNo || "")) &&
				applied.employeeNo
					? String(applied.employeeNo)
					: employeeHint && opaque
						? employeeHint
						: null;

			const personKey = plain || opaque || rawEmp || "unknown";
			const dedupeKey = `watch|${deviceId}|${classified.eventAction}|${applied.time || row.time}|${personKey}`;
			if (seen.has(dedupeKey)) continue;
			seen.add(dedupeKey);

			const exists = await prisma.deviceEvent.findFirst({
				where: { organizationId: device.organizationId, dedupeKey },
				select: { id: true },
			});
			if (exists) continue;

			const employeeNo = plain || rawEmp || null;
			const personTokenResolved = Boolean(plain && opaque);

			const created = await prisma.deviceEvent.create({
				data: {
					organizationId: device.organizationId,
					deviceId,
					eventTime: new Date(applied.time || Date.now()),
					employeeNo,
					source: "HIKVISION_CALLBACK",
					status: "UNMATCHED",
					eventCategory: "USER_MANAGEMENT",
					eventAction: classified.eventAction,
					eventLabel: classified.eventLabel,
					eventConfidence: "PROVEN",
					eventType: "ISAPI_LOGSEARCH",
					major: "Information",
					minor: classified.minor,
					dedupeKey,
					payload: {
						evidenceSource: "ISAPI_LOGSEARCH",
						directDeviceEvidence: true,
						liveEnrollWatch: true,
						personTokenResolved,
						opaquePersonToken: opaque,
						resolvedEmployeeNo: plain,
						notHrisEmployee: true,
						plane: "DEVICE_USER",
						rawEvidence: applied.rawEvidence || evidence,
					},
				},
			});

			if (plain && !isOpaqueHikvisionPersonToken(plain)) {
				await upsertDeviceUserInventoryStub(prisma, {
					organizationId: device.organizationId,
					deviceId,
					employeeNo: plain,
					displayName: applied.resolvedDisplayName || null,
					opaqueToken: opaque,
				}).catch(() => null);
			}

			saved += 1;
			logLine({
				level: "saved",
				eventId: created.id,
				eventAction: classified.eventAction,
				employeeNo,
				opaque,
				personTokenResolved,
			});
			await maybePostCallback(created);
		}
	}
	return saved;
}

async function main() {
	const device = await prisma.device.findFirst({
		where: { id: deviceId },
		select: { id: true, organizationId: true, name: true, address: true },
	});
	if (!device) throw new Error(`Device not found: ${deviceId}`);
	const request = { organizationId: device.organizationId };
	const deadline = Date.now() + minutes * 60 * 1000;
	const seen = new Set();

	logLine({
		level: "start",
		deviceId,
		name: device.name,
		address: device.address,
		minutes,
		pollMs,
		employeeHint,
		dbHost: dbUrl.replace(/:[^:@/]+@/, ":***@").replace(/\?.*$/, ""),
	});

	while (Date.now() < deadline) {
		try {
			const n = await tick(device, request, seen);
			if (n > 0) logLine({ level: "tick_saved", count: n });
		} catch (e) {
			logLine({ level: "tick_error", error: String(e?.message || e) });
		}
		await new Promise((r) => setTimeout(r, pollMs));
	}

	logLine({ level: "done" });
	await prisma.$disconnect();
}

main().catch(async (e) => {
	logLine({ level: "fatal", error: String(e?.stack || e) });
	await prisma.$disconnect();
	process.exit(1);
});
