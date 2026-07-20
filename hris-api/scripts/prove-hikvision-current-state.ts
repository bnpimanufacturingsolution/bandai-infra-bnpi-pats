import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";
import { hikvisionEndpoint } from "../config/hikvision.endpoint";
import { extractHikvisionCredentialSummary } from "../helper/device-user-sync.helper";
import {
	normalizeHikvisionSdkCallbackEvidence,
	parseHikvisionBodyPayload,
} from "../helper/hikvision-event-contract.helper";
import { hikvisionFetch } from "../lib/hikvision-client";

const prisma = new PrismaClient();
const deviceId = String(process.env.HIKVISION_DEVICE_ID || process.argv[2] || "").trim();
const evidenceDir = path.resolve(
	process.env.HIKVISION_CURRENT_STATE_EVIDENCE_DIR ||
		path.join(process.cwd(), "..", ".runtime", "hikvision-current-state"),
);
const startTime = String(
	process.env.HIKVISION_PROOF_START || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
);
const endTime = String(process.env.HIKVISION_PROOF_END || new Date().toISOString());
const pageSize = Math.max(1, Math.min(Number(process.env.HIKVISION_PROOF_PAGE_SIZE || 100), 200));

const formatManilaDeviceTime = (date: Date) => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	})
		.formatToParts(date)
		.reduce<Record<string, string>>((result, part) => {
			if (part.type !== "literal") result[part.type] = part.value;
			return result;
		}, {});
	return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
};

const readEnvelope = (payload: any, key: string) => payload?.[key] || payload?.data?.[key] || {};
const totalFrom = (payload: any, key: string) => {
	const envelope = readEnvelope(payload, key);
	for (const value of [envelope.totalMatches, envelope.numOfMatches, envelope.totalNum]) {
		const number = Number(value);
		if (Number.isFinite(number)) return number;
	}
	return null;
};

const safeFailure = (endpoint: string, error: any) => ({
	endpoint,
	status: Number(error?.status || 0) || null,
	message: String(error?.message || error || "unknown failure"),
	deviceResponse: error?.data?.raw || error?.data?.errorCode || error?.data?.errorCause || null,
});

const main = async () => {
	if (!deviceId) throw new Error("Pass a device id or set HIKVISION_DEVICE_ID.");
	await fs.mkdir(evidenceDir, { recursive: true });
	const device = await prisma.device.findFirst({
		where: { id: deviceId, isDeleted: false },
		select: { id: true, organizationId: true, name: true, address: true, port: true, protocol: true },
	});
	if (!device) throw new Error(`Device ${deviceId} was not found.`);
	const request = { organizationId: device.organizationId } as any;
	const exactBase = `${device.protocol || "https"}://${device.address}:${device.port || 443}`;
	const startedAt = new Date();
	const failures: any[] = [];

	const userPages: any[] = [];
	const users: any[] = [];
	let userPosition = 0;
	let deviceUserTotal: number | null = null;
	try {
		for (let page = 0; page < 100; page += 1) {
			const requestBody = {
				UserInfoSearchCond: {
					searchID: `direct-proof-users-${startedAt.getTime()}-${userPosition}`,
					searchResultPosition: userPosition,
					maxResults: pageSize,
				},
			};
			const response = await hikvisionFetch(hikvisionEndpoint.accessControl.userInfo.search, {
				method: "POST",
				deviceId,
				prisma,
				request,
				timeoutMs: 15_000,
				headers: { "Content-Type": "application/json" },
				body: requestBody,
			});
			const envelope = readEnvelope(response, "UserInfoSearch");
			const rows = Array.isArray(envelope.UserInfo) ? envelope.UserInfo : [];
			if (deviceUserTotal === null) deviceUserTotal = totalFrom(response, "UserInfoSearch");
			userPages.push({ request: requestBody, response });
			users.push(...rows);
			if (!rows.length || String(envelope.responseStatusStrg || "").toUpperCase() !== "MORE") break;
			userPosition += rows.length;
		}
	} catch (error) {
		failures.push(safeFailure(`${exactBase}${hikvisionEndpoint.accessControl.userInfo.search}`, error));
	}

	const acsPages: any[] = [];
	const acsRows: any[] = [];
	let acsPosition = 0;
	let selectedWindowSourceTotal: number | null = null;
	let deviceLogTotal: number | null = null;
	try {
		for (let page = 0; page < 100; page += 1) {
			const requestBody = {
				AcsEventCond: {
					searchID: `direct-proof-acs-${startedAt.getTime()}-${acsPosition}`,
					searchResultPosition: acsPosition,
					maxResults: pageSize,
					major: 0,
					minor: 0,
					startTime,
					endTime,
					timeReverseOrder: true,
				},
			};
			const response = await hikvisionFetch(hikvisionEndpoint.accessControl.acsEvent.list, {
				method: "POST",
				deviceId,
				prisma,
				request,
				timeoutMs: 15_000,
				headers: { "Content-Type": "application/json" },
				body: requestBody,
			});
			const envelope = readEnvelope(response, "AcsEvent");
			const rows = Array.isArray(envelope.InfoList) ? envelope.InfoList : [];
			if (selectedWindowSourceTotal === null) selectedWindowSourceTotal = totalFrom(response, "AcsEvent");
			acsPages.push({ request: requestBody, response });
			acsRows.push(...rows);
			if (!rows.length || String(envelope.responseStatusStrg || "").toUpperCase() !== "MORE") break;
			acsPosition += rows.length;
		}
	} catch (error) {
		failures.push(safeFailure(`${exactBase}${hikvisionEndpoint.accessControl.acsEvent.list}`, error));
	}
	try {
		const requestBody = {
			AcsEventCond: {
				searchID: `direct-proof-acs-total-${startedAt.getTime()}`,
				searchResultPosition: 0,
				maxResults: 1,
				major: 0,
				minor: 0,
				startTime: "2000-01-01T00:00:00+08:00",
				endTime: formatManilaDeviceTime(new Date(Date.now() + 60_000)),
			},
		};
		const response = await hikvisionFetch(hikvisionEndpoint.accessControl.acsEvent.list, {
			method: "POST",
			deviceId,
			prisma,
			request,
			timeoutMs: 15_000,
			headers: { "Content-Type": "application/json" },
			body: requestBody,
		});
		deviceLogTotal = totalFrom(response, "AcsEvent");
		await fs.writeFile(
			path.join(evidenceDir, "acs-total.json"),
			JSON.stringify({ request: requestBody, response }, null, 2),
		);
	} catch (error) {
		failures.push(safeFailure(`${exactBase}${hikvisionEndpoint.accessControl.acsEvent.list}`, error));
	}

	for (let index = 0; index < userPages.length; index += 1) {
		await fs.writeFile(
			path.join(evidenceDir, `user-info-page-${String(index + 1).padStart(3, "0")}.json`),
			JSON.stringify(userPages[index], null, 2),
		);
	}
	for (let index = 0; index < acsPages.length; index += 1) {
		await fs.writeFile(
			path.join(evidenceDir, `acs-page-${String(index + 1).padStart(3, "0")}.json`),
			JSON.stringify(acsPages[index], null, 2),
		);
	}

	const uniqueUsers = Array.from(
		new Map(
			users.map((user) => [String(user?.employeeNo || user?.employeeNoString || user?.userId), user]),
		).values(),
	);
	const userInventory = uniqueUsers.map((user) => ({
		employeeNo: String(user?.employeeNo || user?.employeeNoString || user?.userId || "") || null,
		name: String(user?.name || user?.employeeName || "") || null,
		...extractHikvisionCredentialSummary(user),
	}));
	const normalizedAcs = acsRows.map((row) =>
		normalizeHikvisionSdkCallbackEvidence(
			parseHikvisionBodyPayload({
				deviceId,
				deviceIP: device.address,
				AcsEventInfo: row,
			}),
		),
	);
	const savedSdkRows = await prisma.deviceEvent.findMany({
		where: {
			deviceId,
			source: "EN_HCNETSDK_ALARM",
			eventTime: { gte: new Date(startTime), lte: new Date(endTime) },
		},
		select: { id: true, eventAction: true, status: true, eventTime: true, payload: true },
	});
	const sourceSerials = new Set(
		acsRows.map((row) => String(row?.serialNo || "").trim()).filter(Boolean),
	);
	const savedSerials = new Set(
		savedSdkRows
			.map((row) => String((row.payload as any)?.serialNo || "").trim())
			.filter(Boolean),
	);
	const sourceRowsMissingFromHris = [...sourceSerials].filter((serial) => !savedSerials.has(serial));
	const savedLogSearchRows = await prisma.deviceEvent.count({
		where: {
			deviceId,
			eventType: "ISAPI_LOGSEARCH",
			eventTime: { gte: new Date(startTime), lte: new Date(endTime) },
		},
	});
	await fs.writeFile(
		path.join(evidenceDir, "parsed-users.json"),
		JSON.stringify(userInventory, null, 2),
	);
	await fs.writeFile(
		path.join(evidenceDir, "normalized-acs-events.json"),
		JSON.stringify(normalizedAcs, null, 2),
	);
	await fs.writeFile(path.join(evidenceDir, "failures.json"), JSON.stringify(failures, null, 2));

	const completedAt = new Date();
	const proof = {
		startedAt: startedAt.toISOString(),
		completedAt: completedAt.toISOString(),
		elapsedSeconds: Number(((completedAt.getTime() - startedAt.getTime()) / 1000).toFixed(3)),
		device: { id: device.id, name: device.name, address: device.address, port: device.port, protocol: device.protocol },
		requestWindow: { startTime, endTime, pageSize },
		endpoints: {
			userInfoSearch: `${exactBase}${hikvisionEndpoint.accessControl.userInfo.search}`,
			acsEventSearch: `${exactBase}${hikvisionEndpoint.accessControl.acsEvent.list}`,
		},
		inventory: {
			deviceReportedUsers: deviceUserTotal,
			deviceLogTotal,
			parsedUniqueUsers: uniqueUsers.length,
			usersWithFingerprints: userInventory.filter((user) => user.fingerprintCount > 0).length,
			usersWithFaces: userInventory.filter((user) => user.faceCount > 0).length,
			usersWithCards: userInventory.filter((user) => user.cardCount > 0).length,
		},
		selectedWindow: {
			deviceReportedSourceRows: selectedWindowSourceTotal,
			parsedSourceRows: acsRows.length,
			attendanceTaps: normalizedAcs.filter((event) => event.eventAction === "TAP").length,
			rejectedTaps: normalizedAcs.filter((event) => event.eventAction === "TAP_REJECTED").length,
		},
		savedHris: {
			sdkRows: savedSdkRows.length,
			matchedSourceSerials: [...sourceSerials].filter((serial) => savedSerials.has(serial)).length,
			sourceRowsMissingFromHris: sourceRowsMissingFromHris.length,
			missingSourceSerials: sourceRowsMissingFromHris,
			logSearchRows: savedLogSearchRows,
		},
		pagination: { userPages: userPages.length, acsPages: acsPages.length },
		failures,
	};
	await fs.writeFile(path.join(evidenceDir, "proof.json"), JSON.stringify(proof, null, 2));
	console.log(JSON.stringify({ evidenceDir, ...proof }, null, 2));
};

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	})
	.finally(async () => prisma.$disconnect());
