/**
 * Device-user enroll journey proof:
 * 1) Backfill DeviceUser inventory stubs from DevicePersonToken + resolved USER_CREATED events
 * 2) Create a stay-on-device demo person with write-time opaque capture
 * 3) Persist USER_CREATED + ensure inventory row
 *
 * Usage (from repo root, API up, DB reachable as API uses):
 *   node --import tsx scripts/device-user-enroll-journey-proof.mjs
 * or: npx tsx scripts/device-user-enroll-journey-proof.mjs
 */
import { PrismaClient } from "../hris-api/generated/prisma/index.js";
import { hikvisionFetch } from "../hris-api/lib/hikvision-client.js";
import { hikvisionEndpoint } from "../hris-api/config/hikvision.endpoint.js";
import {
	captureOpaqueTokenAfterUserWrite,
	applyDevicePersonTokenToEvidence,
	formatHikvisionPlus08,
	upsertDeviceUserInventoryStub,
	upsertDevicePersonToken,
} from "../hris-api/helper/device-person-token.helper.js";
import {
	buildHikvisionLogSearchXml,
	normalizeHikvisionLogSearchRow,
	parseHikvisionLogSearchResponse,
	isOpaqueHikvisionPersonToken,
} from "../hris-api/helper/hikvision-event-contract.helper.js";
import fs from "node:fs";
import path from "node:path";

const deviceId = process.env.PROOF_DEVICE_ID || "cmrlgqsjv000oob01165tbd8n";
const prisma = new PrismaClient(
	process.env.FORCE_DATABASE_URL
		? { datasources: { db: { url: process.env.FORCE_DATABASE_URL } } }
		: undefined,
);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(".runtime", `device-user-enroll-journey-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

function writeJson(name, data) {
	fs.writeFileSync(path.join(outDir, name), JSON.stringify(data, null, 2), "utf8");
}

async function main() {
	const device = await prisma.device.findFirst({
		where: { id: deviceId },
		select: { id: true, organizationId: true, name: true, address: true },
	});
	if (!device) throw new Error(`Device not found: ${deviceId}`);
	const request = { organizationId: device.organizationId };
	const orgId = device.organizationId;

	// --- A) Backfill from tokens ---
	const tokens = await prisma.devicePersonToken.findMany({
		where: { deviceId },
		orderBy: { lastSeenAt: "desc" },
		take: 100,
	});
	const backfilled = [];
	for (const t of tokens) {
		const emp = String(t.employeeNo || "").trim();
		if (!emp || isOpaqueHikvisionPersonToken(emp)) continue;
		const du = await upsertDeviceUserInventoryStub(prisma, {
			organizationId: orgId,
			deviceId,
			employeeNo: emp,
			displayName: t.displayName,
			opaqueToken: t.opaqueToken,
		});
		backfilled.push({
			from: "token",
			employeeNo: emp,
			opaque: t.opaqueToken,
			deviceUserId: du?.id || null,
		});
	}

	// --- B) Backfill from resolved USER_CREATED events ---
	const events = await prisma.deviceEvent.findMany({
		where: {
			deviceId,
			eventAction: "USER_CREATED",
			OR: [
				{ employeeNo: { startsWith: "t18" } },
				{ employeeNo: { startsWith: "T18" } },
			],
		},
		orderBy: { eventTime: "desc" },
		take: 50,
	});
	for (const ev of events) {
		const payload = (ev.payload || {});
		const emp = String(
			payload.resolvedEmployeeNo ||
				(payload.personTokenResolved ? ev.employeeNo : "") ||
				ev.employeeNo ||
				"",
		).trim();
		if (!emp || isOpaqueHikvisionPersonToken(emp)) continue;
		const opaque = payload.opaquePersonToken || null;
		const du = await upsertDeviceUserInventoryStub(prisma, {
			organizationId: orgId,
			deviceId,
			employeeNo: emp,
			displayName: payload.resolvedDisplayName || null,
			opaqueToken: opaque,
		});
		if (opaque && !isOpaqueHikvisionPersonToken(emp)) {
			await upsertDevicePersonToken(prisma, {
				organizationId: orgId,
				deviceId,
				opaqueToken: String(opaque),
				employeeNo: emp,
				displayName: payload.resolvedDisplayName || null,
				source: "EVENT_BACKFILL",
			}).catch(() => null);
		}
		backfilled.push({
			from: "event",
			eventId: ev.id,
			employeeNo: emp,
			opaque,
			deviceUserId: du?.id || null,
		});
	}

	// --- C) Create stay-on-device demo ---
	const emp = `t18stay${String(Date.now()).slice(-5)}`;
	const displayName = `DeviceUser-Demo-${emp}`;
	const writeMs = Date.now();
	let createErr = null;
	let createResp = null;
	try {
		createResp = await hikvisionFetch(
			hikvisionEndpoint.accessControl.userInfo.record + "?format=json",
			{
				method: "POST",
				deviceId,
				prisma,
				request,
				timeoutMs: 25000,
				ensureJsonFormat: false,
				headers: { "Content-Type": "application/json" },
				body: {
					deviceId,
					UserInfo: {
						employeeNo: emp,
						name: displayName,
						userType: "normal",
						Valid: {
							enable: true,
							beginTime: "2026-01-01T00:00:00",
							endTime: "2036-12-31T23:59:59",
							timeType: "local",
						},
						doorRight: "1",
						RightPlan: [{ doorNo: 1, planTemplateNo: "1" }],
					},
				},
			},
		);
	} catch (e) {
		createErr = String(e?.message || e);
	}

	const cap = createErr
		? { ok: false, opaqueToken: null, error: createErr }
		: await captureOpaqueTokenAfterUserWrite({
				prisma,
				req: request,
				deviceId,
				organizationId: orgId,
				plainEmployeeNo: emp,
				displayName,
				source: "USER_INFO_RECORD",
				writeMs,
				settleMs: 1500,
			});

	let eventId = null;
	if (cap?.ok && cap.opaqueToken) {
		const start = formatHikvisionPlus08(writeMs - 60000);
		const end = formatHikvisionPlus08(Date.now() + 120000);
		try {
			const response = await hikvisionFetch("/ISAPI/ContentMgmt/logSearch", {
				method: "POST",
				deviceId,
				prisma,
				request,
				timeoutMs: 25000,
				ensureJsonFormat: false,
				rawResponse: true,
				headers: {
					Accept: "application/xml, text/xml, */*",
					"Content-Type": "application/xml; charset=UTF-8",
				},
				body: buildHikvisionLogSearchXml({
					searchId: `demo-${Date.now()}`,
					startTime: start,
					endTime: end,
					maxResults: 20,
					searchResultPosition: 0,
					metaId: "log.hikvision.com/Information/addUserInfo",
				}),
			});
			const parsed = parseHikvisionLogSearchResponse(String(response.raw || ""));
			for (const row of parsed.rows || []) {
				const evidence = normalizeHikvisionLogSearchRow(row, device);
				const applied = await applyDevicePersonTokenToEvidence(prisma, {
					organizationId: orgId,
					deviceId,
					evidence,
				});
				const matched =
					String(applied.employeeNo) === emp ||
					String(applied.opaquePersonToken || evidence.employeeNo) ===
						String(cap.opaqueToken);
				if (!matched) continue;
				const dedupeKey = `journey|${deviceId}|${applied.time || writeMs}|${emp}`;
				const exists = await prisma.deviceEvent.findFirst({
					where: { organizationId: orgId, dedupeKey },
				});
				if (exists) {
					eventId = exists.id;
					break;
				}
				const saved = await prisma.deviceEvent.create({
					data: {
						organizationId: orgId,
						deviceId,
						eventTime: new Date(applied.time || Date.now()),
						employeeNo: emp,
						source: "HIKVISION_CALLBACK",
						status: "UNMATCHED",
						eventCategory: "USER_MANAGEMENT",
						eventAction: "USER_CREATED",
						eventLabel: "Device user created",
						eventConfidence: "PROVEN",
						eventType: "ISAPI_LOGSEARCH",
						major: "Information",
						minor: "addUserInfo",
						dedupeKey,
						payload: {
							evidenceSource: "ISAPI_LOGSEARCH",
							directDeviceEvidence: true,
							personTokenResolved: true,
							opaquePersonToken: cap.opaqueToken,
							resolvedEmployeeNo: emp,
							resolvedDisplayName: displayName,
							notHrisEmployee: true,
							plane: "DEVICE_USER",
							journeyProof: true,
							rawEvidence: applied.rawEvidence,
						},
					},
				});
				eventId = saved.id;
				await upsertDeviceUserInventoryStub(prisma, {
					organizationId: orgId,
					deviceId,
					employeeNo: emp,
					displayName,
					opaqueToken: cap.opaqueToken,
				});
				break;
			}
		} catch (e) {
			createErr = (createErr ? createErr + " | " : "") + String(e?.message || e);
		}
	} else if (!createErr) {
		// capture failed but create may have worked — still stub inventory
		await upsertDeviceUserInventoryStub(prisma, {
			organizationId: orgId,
			deviceId,
			employeeNo: emp,
			displayName,
			opaqueToken: null,
		});
	}

	const du = await prisma.deviceUser.findFirst({
		where: { deviceId, vendorUserId: emp },
	});
	const inventoryT18 = await prisma.deviceUser.findMany({
		where: {
			deviceId,
			OR: [
				{ vendorUserId: { startsWith: "t18" } },
				{ employeeNo: { startsWith: "t18" } },
			],
		},
		select: {
			id: true,
			vendorUserId: true,
			employeeNo: true,
			displayName: true,
			status: true,
		},
	});

	let onDevice = false;
	if (!createErr) {
		try {
			const search = await hikvisionFetch(
				hikvisionEndpoint.accessControl.userInfo.search + "?format=json",
				{
					method: "POST",
					deviceId,
					prisma,
					request,
					timeoutMs: 15000,
					ensureJsonFormat: false,
					headers: { "Content-Type": "application/json" },
					body: {
						UserInfoSearchCond: {
							searchID: "v",
							searchResultPosition: 0,
							maxResults: 5,
							EmployeeNoList: [{ employeeNo: emp }],
						},
					},
				},
			);
			onDevice = Number(search?.UserInfoSearch?.numOfMatches || 0) >= 1;
		} catch {
			onDevice = false;
		}
	}

	const syncUrl = `/admin/configuration/devices?action=device-users&deviceId=${deviceId}&syncPanel=users&deviceUserView=hris&deviceUserSearch=${encodeURIComponent(emp)}`;
	const result = {
		outDir,
		device: { id: device.id, name: device.name, address: device.address },
		backfilledCount: backfilled.length,
		backfilled: backfilled.slice(0, 30),
		demo: {
			emp,
			displayName,
			createErr,
			captureOk: Boolean(cap?.ok),
			opaque: cap?.opaqueToken || null,
			eventId,
			deviceUserId: du?.id || null,
			onDevice,
			leftOnDevice: true,
			syncUrl,
			note: "Device inventory person — not an HRIS Employee. Open syncUrl with deviceUserView=hris.",
		},
		inventoryT18,
		createRespStatusStatus: createResp?.statusCode || createResp?.status || null,
	};
	writeJson("journey-proof.json", result);
	console.log(JSON.stringify(result, null, 2));
	await prisma.$disconnect();
}

main().catch(async (e) => {
	console.error(e);
	writeJson("journey-proof-error.json", { error: String(e?.stack || e) });
	await prisma.$disconnect();
	process.exit(1);
});
