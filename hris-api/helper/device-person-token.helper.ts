/**
 * Hikvision opaque log person token ↔ plain employeeNo write-time map.
 *
 * Proven (2026-07-17 TEST A): UserInfo/Record with plain employeeNo emits
 * logSearch addUserInfo with opaque LogAddInfo.EmployeeNo. Reverse lookup
 * of the opaque token as employeeNo fails on device. Side-table is required
 * for Sync logs person labels from today onwards.
 */
import type { PrismaClient } from "../generated/prisma";
import { hikvisionFetch } from "../lib/hikvision-client";
import {
	buildHikvisionLogSearchXml,
	isOpaqueHikvisionPersonToken,
	normalizeHikvisionLogSearchRow,
	parseHikvisionLogSearchResponse,
} from "./hikvision-event-contract.helper";
import { emitDeviceEventSaved } from "./device-event-realtime.helper";

export type DevicePersonTokenSource =
	| "WRITE_TIME_CAPTURE"
	| "USER_INFO_RECORD"
	| "USER_INFO_MODIFY"
	| "FINGERPRINT_ENROLL"
	| "PANEL_INVENTORY_DELTA"
	| "MANUAL"
	| string;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Format an absolute instant as device-style +08:00 wall clock (Manila / CST-8). */
export const formatHikvisionPlus08 = (ms: number = Date.now()) => {
	const x = new Date(ms + 8 * 3600 * 1000);
	return `${x.getUTCFullYear()}-${pad2(x.getUTCMonth() + 1)}-${pad2(x.getUTCDate())}T${pad2(x.getUTCHours())}:${pad2(x.getUTCMinutes())}:${pad2(x.getUTCSeconds())}+08:00`;
};

export const extractPlainEmployeeNoFromUserInfoBody = (body: unknown): string | null => {
	const root = (body as any)?.UserInfo || body;
	const value = String(root?.employeeNo || root?.employeeNoString || "").trim();
	if (!value || isOpaqueHikvisionPersonToken(value)) return null;
	return value;
};

export const extractDisplayNameFromUserInfoBody = (body: unknown): string | null => {
	const root = (body as any)?.UserInfo || body;
	const name = String(root?.name || "").trim();
	return name || null;
};

/**
 * Proven logSearch leaf shape (TEST A UI panel 2026-07-17):
 *   LogAddInfo.EmployeeNo = opaque token (e.g. "EmfPTja5gq/kmy/CI1wDHA==")
 *   operator userName often "UI" for panel enroll
 * Plain device person id is NOT in the log — only in UserInfo/Search.
 */
export const extractOpaqueEmployeeNoFromLogEvidence = (evidence: any): string | null => {
	const direct = String(
		evidence?.employeeNo ||
			evidence?.raw?.employeeNo ||
			evidence?.rawEvidence?.employeeNo ||
			"",
	).trim();
	if (direct && isOpaqueHikvisionPersonToken(direct)) return direct;
	const info = String(
		evidence?.information ||
			evidence?.raw?.information ||
			evidence?.rawEvidence?.information ||
			"",
	).trim();
	if (info) {
		try {
			const parsed = JSON.parse(info);
			const opaque = String(
				parsed?.LogAddInfo?.EmployeeNo || parsed?.logAddInfo?.EmployeeNo || "",
			).trim();
			if (opaque && isOpaqueHikvisionPersonToken(opaque)) return opaque;
		} catch {
			/* ignore */
		}
	}
	return null;
};

/** Proven UserInfo/Search person shape: plain employeeNo + name (+ numOfFP…). */
export const extractPlainUserFromUserInfoRecord = (
	rawUser: any,
): { employeeNo: string; displayName: string | null; numOfFP: number } | null => {
	const employeeNo = String(
		rawUser?.employeeNo || rawUser?.employeeNoString || rawUser?.userId || "",
	).trim();
	if (!employeeNo || isOpaqueHikvisionPersonToken(employeeNo)) return null;
	const displayName = String(rawUser?.name || rawUser?.employeeName || "").trim() || null;
	const numOfFP = Number(rawUser?.numOfFP ?? rawUser?.numOfFingerPrint ?? 0) || 0;
	return { employeeNo, displayName, numOfFP };
};

/**
 * Panel enroll correlation (no write-time map):
 * - knownPlains = DeviceUser / DevicePersonToken plain ids already in HRIS
 * - devicePlains = plain ids currently on device (UserInfo/Search)
 * - unmappedOpaques = opaque tokens from recent lifecycle logs without a map
 * If exactly one new plain and one unmapped opaque in the same resolve window → map them.
 * Reference case: plain "14" + opaque "EmfPTja5gq/kmy/CI1wDHA==".
 */
export const correlateOpaqueToPlainByInventoryDelta = (input: {
	devicePlains: Array<{ employeeNo: string; displayName: string | null }>;
	knownPlains: string[];
	unmappedOpaques: string[];
}): { opaqueToken: string; employeeNo: string; displayName: string | null } | null => {
	const known = new Set(
		(input.knownPlains || []).map((v) => String(v || "").trim()).filter(Boolean),
	);
	const newPlains = (input.devicePlains || []).filter(
		(p) => p.employeeNo && !known.has(p.employeeNo),
	);
	const opaques = Array.from(
		new Set((input.unmappedOpaques || []).map((v) => String(v || "").trim()).filter(Boolean)),
	);
	if (newPlains.length === 1 && opaques.length === 1) {
		return {
			opaqueToken: opaques[0],
			employeeNo: newPlains[0].employeeNo,
			displayName: newPlains[0].displayName,
		};
	}
	// FP-only on existing plain: no new plain, but exactly one opaque and we cannot invent id.
	return null;
};

export const upsertDevicePersonToken = async (
	prisma: PrismaClient | any,
	input: {
		organizationId: string;
		deviceId: string;
		opaqueToken: string;
		employeeNo: string;
		displayName?: string | null;
		source?: DevicePersonTokenSource;
		captureMetaId?: string | null;
		captureEventTime?: Date | null;
	},
) => {
	const organizationId = String(input.organizationId || "").trim();
	const deviceId = String(input.deviceId || "").trim();
	const opaqueToken = String(input.opaqueToken || "").trim();
	const employeeNo = String(input.employeeNo || "").trim();
	if (!organizationId || !deviceId || !opaqueToken || !employeeNo) {
		return null;
	}
	const now = new Date();
	const existing = await prisma.devicePersonToken.findFirst({
		where: { organizationId, deviceId, opaqueToken },
	});
	if (existing) {
		const updated = await prisma.devicePersonToken.update({
			where: { id: existing.id },
			data: {
				employeeNo,
				displayName: input.displayName ?? existing.displayName,
				source: input.source || existing.source,
				captureMetaId: input.captureMetaId ?? existing.captureMetaId,
				captureEventTime: input.captureEventTime ?? existing.captureEventTime,
				lastSeenAt: now,
			},
		});
		await upsertDeviceUserInventoryStub(prisma, {
			organizationId,
			deviceId,
			employeeNo,
			displayName: input.displayName ?? existing.displayName,
			opaqueToken,
		}).catch(() => undefined);
		return updated;
	}
	const tokenRow = await prisma.devicePersonToken.create({
		data: {
			organizationId,
			deviceId,
			opaqueToken,
			employeeNo,
			displayName: input.displayName || null,
			source: input.source || "WRITE_TIME_CAPTURE",
			captureMetaId: input.captureMetaId || null,
			captureEventTime: input.captureEventTime || null,
			firstSeenAt: now,
			lastSeenAt: now,
		},
	});
	// Also ensure DeviceUser inventory has this plain device person (not HRIS Employee).
	await upsertDeviceUserInventoryStub(prisma, {
		organizationId,
		deviceId,
		employeeNo,
		displayName: input.displayName || null,
		opaqueToken,
	}).catch(() => undefined);
	return tokenRow;
};

/** Build HRIS display name from Employee.person.personalInfo (or null). */
export const buildEmployeeDisplayName = (employee: any): string | null => {
	const personalInfo = employee?.person?.personalInfo || {};
	const name = [personalInfo.firstName, personalInfo.middleName, personalInfo.lastName]
		.map((part) => String(part || "").trim())
		.filter(Boolean)
		.join(" ")
		.trim();
	return name || null;
};

/**
 * Link plain device person id → HRIS Employee when deviceEmpId or employeeId matches.
 * This is the Sync Center / Device Events name source for enroll/create rows.
 */
export const resolveLinkedEmployeeForDevicePerson = async (
	prisma: PrismaClient | any,
	input: { organizationId: string; employeeNo: string },
): Promise<{ id: string; displayName: string | null; employeeIdCode: string | null } | null> => {
	const organizationId = String(input.organizationId || "").trim();
	const employeeNo = String(input.employeeNo || "").trim();
	if (!organizationId || !employeeNo || isOpaqueHikvisionPersonToken(employeeNo)) {
		return null;
	}
	const employee = await prisma.employee.findFirst({
		where: {
			organizationId,
			isDeleted: false,
			OR: [{ deviceEmpId: employeeNo }, { employeeId: employeeNo }],
		},
		select: {
			id: true,
			employeeId: true,
			deviceEmpId: true,
			person: { select: { personalInfo: true } },
		},
	});
	if (!employee?.id) return null;
	return {
		id: String(employee.id),
		displayName: buildEmployeeDisplayName(employee),
		employeeIdCode: employee.employeeId ? String(employee.employeeId) : null,
	};
};

/**
 * DeviceUser is inventory of people ON THE DEVICE.
 * - vendorUserId / employeeNo = plain device person id when known
 * - opaque person token ALWAYS stored in vendorMetadata (never lost)
 * - If same deviceEmpId/employeeId exists on Employee, auto-link + pull HRIS name
 */
export const upsertDeviceUserInventoryStub = async (
	prisma: PrismaClient | any,
	input: {
		organizationId: string;
		deviceId: string;
		employeeNo: string;
		displayName?: string | null;
		opaqueToken?: string | null;
	},
) => {
	const organizationId = String(input.organizationId || "").trim();
	const deviceId = String(input.deviceId || "").trim();
	const employeeNo = String(input.employeeNo || "").trim();
	if (!organizationId || !deviceId || !employeeNo || isOpaqueHikvisionPersonToken(employeeNo)) {
		return null;
	}
	const linked = await resolveLinkedEmployeeForDevicePerson(prisma, {
		organizationId,
		employeeNo,
	});
	const displayName =
		String(input.displayName || "").trim() ||
		linked?.displayName ||
		null;
	const opaqueToken = String(input.opaqueToken || "").trim() || null;
	const existing = await prisma.deviceUser.findFirst({
		where: { organizationId, deviceId, vendorUserId: employeeNo },
	});
	const priorMeta = (existing?.vendorMetadata as any) || {};
	const vendorMetadata = {
		...priorMeta,
		writeTimeCapture: true,
		// Always keep latest opaque token when known (panel/SDK logs use this).
		opaquePersonToken: opaqueToken || priorMeta.opaquePersonToken || null,
		linkedEmployeeId: linked?.id || priorMeta.linkedEmployeeId || null,
		linkedEmployeeCode: linked?.employeeIdCode || priorMeta.linkedEmployeeCode || null,
		notHrisEmployee: !linked?.id,
		plane: "DEVICE_USER_INVENTORY",
	};
	const status = linked?.id ? "ACTIVE" : existing?.status || "UNMATCHED";
	if (existing) {
		return prisma.deviceUser.update({
			where: { id: existing.id },
			data: {
				employeeNo,
				displayName: displayName ?? existing.displayName,
				// Prefer explicit HRIS link when deviceEmpId matches.
				employeeId: linked?.id || existing.employeeId || null,
				status,
				lastSyncedAt: new Date(),
				vendorMetadata,
			},
		});
	}
	return prisma.deviceUser.create({
		data: {
			organizationId,
			deviceId,
			vendorUserId: employeeNo,
			employeeNo,
			displayName: displayName || null,
			employeeId: linked?.id || null,
			status,
			lastSyncedAt: new Date(),
			vendorMetadata,
		},
	});
};

export const resolveDevicePersonToken = async (
	prisma: PrismaClient | any,
	input: { organizationId: string; deviceId: string; opaqueToken: string },
): Promise<{ employeeNo: string; displayName: string | null; opaqueToken: string } | null> => {
	const opaqueToken = String(input.opaqueToken || "").trim();
	if (!opaqueToken || !isOpaqueHikvisionPersonToken(opaqueToken)) return null;
	const row = await prisma.devicePersonToken.findFirst({
		where: {
			organizationId: String(input.organizationId || "").trim(),
			deviceId: String(input.deviceId || "").trim(),
			opaqueToken,
		},
		select: { employeeNo: true, displayName: true, opaqueToken: true },
	});
	if (!row?.employeeNo) return null;
	return {
		employeeNo: String(row.employeeNo),
		displayName: row.displayName ? String(row.displayName) : null,
		opaqueToken: String(row.opaqueToken),
	};
};

/** Page UserInfo/Search for plain device persons (panel enroll reverse-map input). */
export const fetchDeviceUserInfoCandidates = async (params: {
	prisma: PrismaClient | any;
	req: any;
	deviceId: string;
	maxPages?: number;
	pageSize?: number;
}): Promise<Array<{ employeeNo: string; displayName: string | null; numOfFP: number }>> => {
	const pageSize = Math.min(Math.max(Number(params.pageSize) || 50, 1), 100);
	const maxPages = Math.min(Math.max(Number(params.maxPages) || 4, 1), 10);
	const out: Array<{ employeeNo: string; displayName: string | null; numOfFP: number }> = [];
	let position = 0;
	for (let page = 0; page < maxPages; page += 1) {
		const response = await hikvisionFetch("/ISAPI/AccessControl/UserInfo/Search?format=json", {
			method: "POST",
			deviceId: params.deviceId,
			prisma: params.prisma,
			request: params.req,
			timeoutMs: 15_000,
			body: {
				UserInfoSearchCond: {
					searchID: `panel-delta-${Date.now()}-${page}`,
					searchResultPosition: position,
					maxResults: pageSize,
				},
			},
		});
		const search =
			(response as any)?.UserInfoSearch ||
			(response as any)?.data?.UserInfoSearch ||
			{};
		const list = Array.isArray(search?.UserInfo)
			? search.UserInfo
			: search?.UserInfo
				? [search.UserInfo]
				: [];
		for (const raw of list) {
			const plain = extractPlainUserFromUserInfoRecord(raw);
			if (plain) out.push(plain);
		}
		const num = Number(search?.numOfMatches || list.length || 0) || 0;
		const status = String(search?.responseStatusStrg || "").toUpperCase();
		position += num > 0 ? num : list.length;
		if (status !== "MORE" || list.length === 0) break;
	}
	const map = new Map<string, { employeeNo: string; displayName: string | null; numOfFP: number }>();
	for (const row of out) map.set(row.employeeNo, row);
	return Array.from(map.values());
};

/**
 * Panel path: map unmapped opaque log tokens → plain UserInfo ids via inventory delta,
 * persist DevicePersonToken, backfill recent lifecycle DeviceEvents, upsert DeviceUser.
 * Reference: panel typed "14" → log opaque EmfPTja5gq/kmy/CI1wDHA== (TEST A 2026-07-17).
 */
export const resolveOpaqueViaDeviceUserInventoryDelta = async (params: {
	prisma: PrismaClient | any;
	req: any;
	organizationId: string;
	deviceId: string;
	unmappedOpaques: string[];
	source?: DevicePersonTokenSource;
}): Promise<{
	mapped: Array<{ opaqueToken: string; employeeNo: string; displayName: string | null }>;
	backfilledEvents: number;
}> => {
	const organizationId = String(params.organizationId || "").trim();
	const deviceId = String(params.deviceId || "").trim();
	const opaques = Array.from(
		new Set((params.unmappedOpaques || []).map((v) => String(v || "").trim()).filter(Boolean)),
	).filter((v) => isOpaqueHikvisionPersonToken(v));
	if (!organizationId || !deviceId || opaques.length === 0) {
		return { mapped: [], backfilledEvents: 0 };
	}

	const stillUnmapped: string[] = [];
	for (const opaque of opaques) {
		const existing = await resolveDevicePersonToken(params.prisma, {
			organizationId,
			deviceId,
			opaqueToken: opaque,
		});
		if (!existing?.employeeNo) stillUnmapped.push(opaque);
	}
	if (stillUnmapped.length === 0) return { mapped: [], backfilledEvents: 0 };

	let devicePlains: Array<{ employeeNo: string; displayName: string | null }> = [];
	try {
		const candidates = await fetchDeviceUserInfoCandidates({
			prisma: params.prisma,
			req: params.req,
			deviceId,
			maxPages: 6,
			pageSize: 50,
		});
		devicePlains = candidates.map((c) => ({
			employeeNo: c.employeeNo,
			displayName: c.displayName,
		}));
	} catch (error: any) {
		console.warn(
			"[device-person-token] UserInfo/Search delta failed",
			deviceId,
			error?.message || error,
		);
		return { mapped: [], backfilledEvents: 0 };
	}

	const knownTokenPlains = await params.prisma.devicePersonToken.findMany({
		where: { organizationId, deviceId },
		select: { employeeNo: true },
	});
	const knownUsers = await params.prisma.deviceUser.findMany({
		where: { organizationId, deviceId },
		select: { vendorUserId: true, employeeNo: true },
	});
	const knownPlains = [
		...knownTokenPlains.map((r: any) => String(r.employeeNo || "").trim()),
		...knownUsers.map((r: any) => String(r.vendorUserId || r.employeeNo || "").trim()),
	].filter(Boolean);

	const correlated = correlateOpaqueToPlainByInventoryDelta({
		devicePlains,
		knownPlains,
		unmappedOpaques: stillUnmapped,
	});
	if (!correlated) {
		return { mapped: [], backfilledEvents: 0 };
	}

	await upsertDevicePersonToken(params.prisma, {
		organizationId,
		deviceId,
		opaqueToken: correlated.opaqueToken,
		employeeNo: correlated.employeeNo,
		displayName: correlated.displayName,
		source: params.source || "PANEL_INVENTORY_DELTA",
	});

	const deviceUser = await upsertDeviceUserInventoryStub(params.prisma, {
		organizationId,
		deviceId,
		employeeNo: correlated.employeeNo,
		displayName: correlated.displayName,
		opaqueToken: correlated.opaqueToken,
	}).catch(() => null);

	const linked = await resolveLinkedEmployeeForDevicePerson(params.prisma, {
		organizationId,
		employeeNo: correlated.employeeNo,
	}).catch(() => null);

	const recent = await params.prisma.deviceEvent.findMany({
		where: {
			organizationId,
			deviceId,
			eventAction: {
				in: [
					"USER_CREATED",
					"USER_UPDATED",
					"USER_DELETED",
					"FINGERPRINT_ENROLLED",
					"FINGERPRINT_UPDATED",
					"FINGERPRINT_DELETED",
					"CARD_ENROLLED",
				],
			},
			receivedAt: { gte: new Date(Date.now() - 30 * 60_000) },
		},
		orderBy: { receivedAt: "desc" },
		take: 40,
	});
	let backfilledEvents = 0;
	for (const event of recent) {
		const payload = (event.payload as any) || {};
		const eventOpaque = String(
			payload.opaquePersonToken ||
				payload?.rawEvidence?.employeeNo ||
				payload?.rawEvidence?.raw?.employeeNo ||
				"",
		).trim();
		const needs =
			eventOpaque === correlated.opaqueToken ||
			(!event.employeeNo &&
				String(payload.opaquePersonToken || "").trim() === correlated.opaqueToken);
		if (!needs) continue;
		const nextPayload = {
			...payload,
			opaquePersonToken: correlated.opaqueToken,
			resolvedEmployeeNo: correlated.employeeNo,
			resolvedDisplayName:
				correlated.displayName || linked?.displayName || payload.resolvedDisplayName || null,
			personTokenResolved: true,
			personTokenSource: "PANEL_INVENTORY_DELTA",
			notHrisEmployee: !linked?.id,
		};
		const updated = await params.prisma.deviceEvent.update({
			where: { id: event.id },
			data: {
				employeeNo: correlated.employeeNo,
				employeeId: linked?.id || deviceUser?.employeeId || event.employeeId || null,
				deviceUserId: deviceUser?.id || event.deviceUserId || null,
				status: linked?.id || deviceUser?.employeeId ? "MATCHED" : "UNMATCHED",
				payload: nextPayload,
			},
			include: {
				device: {
					select: { id: true, name: true, address: true, port: true, protocol: true },
				},
				deviceUser: {
					select: {
						id: true,
						vendorUserId: true,
						employeeNo: true,
						displayName: true,
						employeeId: true,
						vendorMetadata: true,
					},
				},
				employee: {
					select: {
						id: true,
						employeeId: true,
						deviceEmpId: true,
						person: { select: { personalInfo: true } },
					},
				},
			},
		});
		emitDeviceEventSaved(params.req?.io, updated);
		backfilledEvents += 1;
	}

	console.log(
		`[device-person-token] panel inventory delta mapped opaque→${correlated.employeeNo} device=${deviceId} backfilled=${backfilledEvents}`,
	);
	return {
		mapped: [correlated],
		backfilledEvents,
	};
};

/**
 * After a successful UserInfo write, poll leaf logSearch for the opaque token
 * emitted for this create/enroll. Prefer a single-token window; if multiple,
 * pick the row whose event time is closest to writeMs.
 */
export const captureOpaqueTokenAfterUserWrite = async (params: {
	prisma: PrismaClient | any;
	req: any;
	deviceId: string;
	organizationId: string;
	plainEmployeeNo: string;
	displayName?: string | null;
	source?: DevicePersonTokenSource;
	writeMs?: number;
	settleMs?: number;
	windowBeforeMs?: number;
	windowAfterMs?: number;
	metaIds?: string[];
}): Promise<{
	ok: boolean;
	opaqueToken: string | null;
	confidence: "high_single_token" | "nearest_of_multiple" | "none";
	rowCount: number;
	error?: string;
}> => {
	const writeMs = params.writeMs ?? Date.now();
	const settleMs = params.settleMs ?? 1200;
	const windowBeforeMs = params.windowBeforeMs ?? 30_000;
	const windowAfterMs = params.windowAfterMs ?? 120_000;
	const metaIds = params.metaIds || [
		"log.hikvision.com/Information/addUserInfo",
		"log.hikvision.com/Information",
	];

	if (settleMs > 0) {
		await new Promise((resolve) => setTimeout(resolve, settleMs));
	}

	const startTime = formatHikvisionPlus08(writeMs - windowBeforeMs);
	const endTime = formatHikvisionPlus08(writeMs + windowAfterMs);
	const tokens: Array<{ opaque: string; time: string | null; metaId: string; timeMs: number }> =
		[];

	// Prefer HRIS employee name when deviceEmpId/employeeId matches plain person id.
	let displayName = String(params.displayName || "").trim() || null;
	if (!displayName && params.plainEmployeeNo) {
		const linked = await resolveLinkedEmployeeForDevicePerson(params.prisma, {
			organizationId: params.organizationId,
			employeeNo: params.plainEmployeeNo,
		}).catch(() => null);
		if (linked?.displayName) displayName = linked.displayName;
	}

	for (const metaId of metaIds) {
		try {
			const response = await hikvisionFetch("/ISAPI/ContentMgmt/logSearch", {
				method: "POST",
				deviceId: params.deviceId,
				prisma: params.prisma,
				request: params.req,
				timeoutMs: 20_000,
				ensureJsonFormat: false,
				rawResponse: true,
				headers: {
					Accept: "application/xml, text/xml, */*",
					"Content-Type": "application/xml; charset=UTF-8",
				},
				body: buildHikvisionLogSearchXml({
					searchId: `hris-person-token-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
					startTime,
					endTime,
					maxResults: 20,
					searchResultPosition: 0,
					metaId,
				}),
			});
			const parsed = parseHikvisionLogSearchResponse(String((response as any)?.raw || ""));
			for (const row of parsed.rows || []) {
				const opaque = String(row.employeeNo || "").trim();
				if (!isOpaqueHikvisionPersonToken(opaque)) continue;
				const timeMs = row.time ? Date.parse(String(row.time)) : writeMs;
				tokens.push({
					opaque,
					time: row.time || null,
					metaId: String(row.metaId || metaId),
					timeMs: Number.isFinite(timeMs) ? timeMs : writeMs,
				});
			}
			// Prefer leaf hit; stop early if we got tokens from specific metaId.
			if (tokens.length && metaId.includes("addUserInfo")) break;
		} catch {
			// try next metaId
		}
	}

	const unique = Array.from(new Map(tokens.map((t) => [t.opaque, t])).values());
	if (!unique.length) {
		return { ok: false, opaqueToken: null, confidence: "none", rowCount: 0 };
	}

	let chosen = unique[0];
	let confidence: "high_single_token" | "nearest_of_multiple" | "none" = "high_single_token";
	if (unique.length > 1) {
		confidence = "nearest_of_multiple";
		chosen = unique.reduce((best, cur) =>
			Math.abs(cur.timeMs - writeMs) < Math.abs(best.timeMs - writeMs) ? cur : best,
		);
	}

	await upsertDevicePersonToken(params.prisma, {
		organizationId: params.organizationId,
		deviceId: params.deviceId,
		opaqueToken: chosen.opaque,
		employeeNo: params.plainEmployeeNo,
		displayName,
		source: params.source || "WRITE_TIME_CAPTURE",
		captureMetaId: chosen.metaId,
		captureEventTime: chosen.time ? new Date(chosen.timeMs) : new Date(writeMs),
	});

	return {
		ok: true,
		opaqueToken: chosen.opaque,
		confidence,
		rowCount: unique.length,
	};
};

/**
 * Resolve evidence.employeeNo when it is an opaque token. Mutates a shallow copy.
 */
export const applyDevicePersonTokenToEvidence = async <T extends { employeeNo?: string | null; rawEvidence?: any }>(
	prisma: PrismaClient | any,
	input: {
		organizationId: string;
		deviceId: string;
		evidence: T;
	},
): Promise<T & { personTokenResolved?: boolean; opaquePersonToken?: string | null }> => {
	const opaque = String(input.evidence.employeeNo || "").trim();
	if (!opaque || !isOpaqueHikvisionPersonToken(opaque)) {
		return { ...input.evidence, personTokenResolved: false, opaquePersonToken: null };
	}
	const resolved = await resolveDevicePersonToken(prisma, {
		organizationId: input.organizationId,
		deviceId: input.deviceId,
		opaqueToken: opaque,
	});
	if (!resolved) {
		return {
			...input.evidence,
			personTokenResolved: false,
			opaquePersonToken: opaque,
		};
	}
	const rawEvidence = {
		...(input.evidence.rawEvidence || {}),
		personRefKind: "resolved_from_write_time_map",
		opaquePersonToken: opaque,
		resolvedEmployeeNo: resolved.employeeNo,
		resolvedDisplayName: resolved.displayName,
	};
	return {
		...input.evidence,
		employeeNo: resolved.employeeNo,
		rawEvidence,
		personTokenResolved: true,
		opaquePersonToken: opaque,
	};
};

/**
 * SDK major=3 "operation" alarms (minor 80/112/121…) arrive live without a person no
 * and classify as SYNC_SIGNAL. Real Add Person / Add Fingerprint truth lives in
 * ISAPI logSearch (addUserInfo / addFpByEmployeeNo). After an SDK signal, pull a
 * short recent window and persist typed lifecycle DeviceEvents + socket emit.
 */
const operationLogResolveCooldownMs = new Map<string, number>();

/**
 * Proven lifecycle metaIds on Bandai Hikvision (TEST A DS family, 2026-07-17).
 * Invalid leaf names (deleteUserInfo, addFaceByEmployeeNo, addCardInfo, …) return
 * ISAPI badXmlFormat and only slow resolve — do not invent leaves.
 *
 * Priority leaves are fetched in parallel on the first passes so create/FP can land
 * in ~1–2s after the device log exists (serial logSearch was multi-second).
 */
type OperationLogMeta = {
	metaId: string;
	eventAction: string;
	eventLabel: string;
	eventCategory: string;
	minor: string;
};

/** Fast path: create / fingerprint / delete (what device-panel enroll needs). */
const OPERATION_LOG_META_PRIORITY: OperationLogMeta[] = [
	{
		metaId: "log.hikvision.com/Information/addUserInfo",
		eventAction: "USER_CREATED",
		eventLabel: "Device user created",
		eventCategory: "USER_MANAGEMENT",
		minor: "addUserInfo",
	},
	{
		metaId: "log.hikvision.com/Information/addFpByEmployeeNo",
		eventAction: "FINGERPRINT_ENROLLED",
		eventLabel: "Fingerprint enrolled",
		eventCategory: "ENROLLMENT",
		minor: "addFpByEmployeeNo",
	},
	// Device leaf is clearUserInfo (not deleteUserInfo).
	{
		metaId: "log.hikvision.com/Information/clearUserInfo",
		eventAction: "USER_DELETED",
		eventLabel: "Device user deleted",
		eventCategory: "USER_MANAGEMENT",
		minor: "clearUserInfo",
	},
];

const OPERATION_LOG_META_SECONDARY: OperationLogMeta[] = [
	{
		metaId: "log.hikvision.com/Information/modifyUserInfo",
		eventAction: "USER_UPDATED",
		eventLabel: "Device user updated",
		eventCategory: "USER_MANAGEMENT",
		minor: "modifyUserInfo",
	},
	{
		metaId: "log.hikvision.com/Information/addFpByCardNo",
		eventAction: "FINGERPRINT_ENROLLED",
		eventLabel: "Fingerprint enrolled",
		eventCategory: "ENROLLMENT",
		minor: "addFpByCardNo",
	},
	{
		metaId: "log.hikvision.com/Information/modifyFpByEmployeeNo",
		eventAction: "FINGERPRINT_UPDATED",
		eventLabel: "Fingerprint updated",
		eventCategory: "ENROLLMENT",
		minor: "modifyFpByEmployeeNo",
	},
	{
		metaId: "log.hikvision.com/Information/addCard",
		eventAction: "CARD_ENROLLED",
		eventLabel: "Card enrolled",
		eventCategory: "ENROLLMENT",
		minor: "addCard",
	},
];

const OPERATION_LOG_META_ALL: OperationLogMeta[] = [
	...OPERATION_LOG_META_PRIORITY,
	...OPERATION_LOG_META_SECONDARY,
];

export const scheduleOperationLogResolveAfterSdkSignal = (params: {
	prisma: PrismaClient | any;
	req: any;
	deviceId: string;
	organizationId: string;
	deviceName?: string | null;
	deviceAddress?: string | null;
	triggerMinor?: string | number | null;
	settleMs?: number;
	/** Extra delayed passes (ms after schedule) so on-device create/FP after early major=3 still lands. */
	retryDelaysMs?: number[];
	windowBeforeMs?: number;
	windowAfterMs?: number;
	cooldownMs?: number;
}): void => {
	const deviceId = String(params.deviceId || "").trim();
	const organizationId = String(params.organizationId || "").trim();
	if (!deviceId || !organizationId) return;

	// Short cooldown so a late major=3 after enroll can re-arm without thrash.
	const cooldownMs = params.cooldownMs ?? 1_200;
	const now = Date.now();
	const last = operationLogResolveCooldownMs.get(deviceId) || 0;
	if (now - last < cooldownMs) return;
	operationLogResolveCooldownMs.set(deviceId, now);

	// Target: lifecycle socket ~1–5s AFTER device logSearch leaves exist.
	// Aggressive early multipass (not a 45s wait). After first save, only 2 short follow-ups
	// so create+FP both land without sitting until 45s.
	const settleMs = params.settleMs ?? 200;
	const retryDelaysMs =
		params.retryDelaysMs ??
		(settleMs > 0
			? Array.from(
					new Set([
						settleMs,
						500,
						1_000,
						1_800,
						2_800,
						4_000,
						6_000,
						9_000,
						13_000,
						18_000,
						25_000,
					]),
				).sort((a, b) => a - b)
			: [0]);
	const windowBeforeMs = params.windowBeforeMs ?? 15 * 60_000;
	const windowAfterMs = params.windowAfterMs ?? 3 * 60_000;
	const triggerMinor = String(params.triggerMinor ?? "").trim();

	const runResolvePass = async (
		passLabel: string,
		metas: OperationLogMeta[],
	): Promise<number> => {
		const startTime = formatHikvisionPlus08(Date.now() - windowBeforeMs);
		const endTime = formatHikvisionPlus08(Date.now() + windowAfterMs);
		const device = {
			id: deviceId,
			name: params.deviceName || null,
			address: params.deviceAddress || null,
		};
		let created = 0;
		const unmappedOpaquesThisPass: string[] = [];
		const pageSize = 30;

		const fetchLogPage = async (metaId: string, searchResultPosition: number) => {
			const response = await hikvisionFetch("/ISAPI/ContentMgmt/logSearch", {
				method: "POST",
				deviceId,
				prisma: params.prisma,
				request: params.req,
				timeoutMs: 6_000,
				ensureJsonFormat: false,
				rawResponse: true,
				headers: {
					Accept: "application/xml, text/xml, */*",
					"Content-Type": "application/xml; charset=UTF-8",
				},
				body: buildHikvisionLogSearchXml({
					searchId: `sdk-op-resolve-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
					startTime,
					endTime,
					maxResults: pageSize,
					searchResultPosition,
					metaId,
				}),
			});
			return parseHikvisionLogSearchResponse(String((response as any)?.raw || ""));
		};

		const fetchMetaRows = async (meta: OperationLogMeta) => {
			try {
				// Parallel leaf fetches; prefer newest page when totals are large.
				let parsed = await fetchLogPage(meta.metaId, 0);
				const total =
					typeof parsed.totalMatches === "number" && Number.isFinite(parsed.totalMatches)
						? parsed.totalMatches
						: 0;
				if (total > pageSize) {
					const newestPosition = Math.max(0, total - pageSize);
					parsed = await fetchLogPage(meta.metaId, newestPosition);
				}
				return { meta, rows: (parsed.rows || []) as any[] };
			} catch (error: any) {
				console.warn(
					"[device-person-token] operation-log resolve failed",
					meta.metaId,
					deviceId,
					error?.message || error,
				);
				return { meta, rows: [] as any[] };
			}
		};

		// Parallel logSearch across leaves — serial was multi-second even when leaves existed.
		const fetched = await Promise.all(metas.map((meta) => fetchMetaRows(meta)));

		for (const { meta, rows } of fetched) {
			for (const row of rows || []) {
				try {
					const evidence = normalizeHikvisionLogSearchRow(row as any, device);
					const applied = await applyDevicePersonTokenToEvidence(params.prisma, {
						organizationId,
						deviceId,
						evidence: evidence as any,
					});
					let employeeNo = String(applied.employeeNo || evidence.employeeNo || "").trim();
					let resolvedDisplayName: string | null =
						String((applied as any).resolvedDisplayName || "").trim() || null;
					const opaque =
						(applied as any).opaquePersonToken ||
						extractOpaqueEmployeeNoFromLogEvidence(evidence) ||
						(isOpaqueHikvisionPersonToken(employeeNo) ? employeeNo : null);
					if (employeeNo && isOpaqueHikvisionPersonToken(employeeNo)) {
						const tok = await resolveDevicePersonToken(params.prisma, {
							organizationId,
							deviceId,
							opaqueToken: employeeNo,
						});
						if (tok?.employeeNo) {
							employeeNo = tok.employeeNo;
							if (tok.displayName) resolvedDisplayName = tok.displayName;
						} else {
							// Panel enroll: opaque only until inventory delta maps it (do not invent plain id).
							if (opaque) unmappedOpaquesThisPass.push(opaque);
							employeeNo = "";
						}
					}
					const eventAction = String(
						(applied as any).eventAction || evidence.eventAction || meta.eventAction,
					);
					const eventCategory = String(
						(applied as any).eventCategory || evidence.eventCategory || meta.eventCategory,
					);
					const eventLabel = String(
						(applied as any).eventLabel || evidence.eventLabel || meta.eventLabel,
					);
					const eventTimeRaw = applied.time || (row as any).time || Date.now();
					const eventTime = new Date(eventTimeRaw);
					const personKey = employeeNo || opaque || "unknown";
					const dedupeKey = [
						"sdk-op-log-resolve",
						deviceId,
						eventAction,
						eventTime.toISOString(),
						personKey,
						meta.minor,
					].join("|");
					const exists = await params.prisma.deviceEvent.findFirst({
						where: { organizationId, dedupeKey },
						select: { id: true },
					});
					if (exists) continue;

					const near = await params.prisma.deviceEvent.findFirst({
						where: {
							organizationId,
							deviceId,
							eventAction,
							eventTime: {
								gte: new Date(eventTime.getTime() - 5_000),
								lte: new Date(eventTime.getTime() + 5_000),
							},
							...(employeeNo
								? { employeeNo }
								: opaque
									? {
											OR: [
												{ employeeNo: null },
												{ employeeNo: "" },
											],
										}
									: {}),
						},
						select: { id: true },
					});
					if (near) continue;

					// DeviceUser inventory: plain device id + ALWAYS keep opaque; auto-link HRIS employee
					// when deviceEmpId/employeeId matches (pull real name onto DeviceUser + event).
					let deviceUser: any = null;
					if (employeeNo) {
						deviceUser = await upsertDeviceUserInventoryStub(params.prisma, {
							organizationId,
							deviceId,
							employeeNo,
							displayName: resolvedDisplayName,
							opaqueToken: opaque,
						}).catch(() => null);
						if (!resolvedDisplayName && deviceUser?.displayName) {
							resolvedDisplayName = String(deviceUser.displayName);
						}
					}
					const linkedEmployeeId =
						deviceUser?.employeeId ||
						(
							await resolveLinkedEmployeeForDevicePerson(params.prisma, {
								organizationId,
								employeeNo,
							}).catch(() => null)
						)?.id ||
						null;
					if (linkedEmployeeId && !resolvedDisplayName) {
						const empRow = await params.prisma.employee.findFirst({
							where: { id: linkedEmployeeId },
							select: { person: { select: { personalInfo: true } } },
						});
						resolvedDisplayName = buildEmployeeDisplayName(empRow);
					}

					const createdRow = await params.prisma.deviceEvent.create({
						data: {
							organizationId,
							deviceId,
							deviceUserId: deviceUser?.id || null,
							employeeId: linkedEmployeeId || null,
							eventTime: Number.isFinite(eventTime.getTime()) ? eventTime : new Date(),
							// Plain device person id when known (never leave opaque as employeeNo when mapped).
							employeeNo: employeeNo || null,
							source: "HIKVISION_CALLBACK",
							status: linkedEmployeeId ? "MATCHED" : employeeNo ? "UNMATCHED" : "RECEIVED",
							eventCategory,
							eventAction,
							eventLabel,
							eventConfidence: "PROVEN",
							eventType: "ISAPI_LOGSEARCH",
							major: "Information",
							minor: meta.minor,
							dedupeKey,
							payload: {
								evidenceSource: "ISAPI_LOGSEARCH",
								directDeviceEvidence: true,
								resolvedFromSdkOperationSignal: true,
								sdkTriggerMinor: triggerMinor || null,
								personTokenResolved: Boolean(employeeNo && opaque),
								// Opaque always retained for audit / re-link.
								opaquePersonToken: opaque,
								resolvedEmployeeNo: employeeNo || null,
								resolvedDisplayName: resolvedDisplayName || null,
								notHrisEmployee: !linkedEmployeeId,
								plane: "DEVICE_USER",
								rawEvidence: (applied as any).rawEvidence || evidence,
							},
						},
					});
					const fullRow = await params.prisma.deviceEvent.findUnique({
						where: { id: createdRow.id },
						include: {
							device: {
								select: { id: true, name: true, address: true, port: true, protocol: true },
							},
							deviceUser: {
								select: {
									id: true,
									vendorUserId: true,
									employeeNo: true,
									displayName: true,
									employeeId: true,
									vendorMetadata: true,
								},
							},
							employee: {
								select: {
									id: true,
									employeeId: true,
									deviceEmpId: true,
									person: { select: { personalInfo: true } },
								},
							},
						},
					});
					// Capture io at emit time from request (same process as browser socket on :3001).
					emitDeviceEventSaved(params.req?.io, fullRow || createdRow);
					created += 1;
				} catch (error: any) {
					console.warn(
						"[device-person-token] operation-log row persist failed",
						meta.metaId,
						deviceId,
						error?.message || error,
					);
				}
			}
		}

		// Person-name delta must NOT block socket emit of lifecycle rows — run in background.
		if (unmappedOpaquesThisPass.length > 0) {
			void resolveOpaqueViaDeviceUserInventoryDelta({
				prisma: params.prisma,
				req: params.req,
				organizationId,
				deviceId,
				unmappedOpaques: unmappedOpaquesThisPass,
				source: "PANEL_INVENTORY_DELTA",
			})
				.then((delta) => {
					if (delta.backfilledEvents > 0) {
						console.log(
							`[device-person-token] panel delta backfilled ${delta.backfilledEvents} event(s) pass=${passLabel}`,
						);
					}
				})
				.catch((error: any) => {
					console.warn(
						"[device-person-token] panel inventory delta crashed",
						deviceId,
						error?.message || error,
					);
				});
		}

		if (created > 0) {
			console.log(
				`[device-person-token] operation-log resolve saved ${created} lifecycle event(s) device=${deviceId} triggerMinor=${triggerMinor || "?"} pass=${passLabel}`,
			);
		}
		return created;
	};

	void (async () => {
		let totalCreated = 0;
		let previousDelay = 0;
		let firstSuccessPass = -1;
		// After first lifecycle save, only run 2 more quick passes (catch FP after create).
		const followUpPassesAfterSuccess = 2;
		for (let i = 0; i < retryDelaysMs.length; i += 1) {
			if (
				firstSuccessPass >= 0 &&
				i > firstSuccessPass + followUpPassesAfterSuccess
			) {
				break;
			}
			const delay = retryDelaysMs[i] || 0;
			const waitMs = Math.max(0, delay - previousDelay);
			if (waitMs > 0) {
				await new Promise((resolve) => setTimeout(resolve, waitMs));
			}
			previousDelay = delay;
			// Priority leaves only until we have a save; then full set on follow-ups.
			const metas =
				firstSuccessPass < 0 || i <= firstSuccessPass + 1
					? OPERATION_LOG_META_PRIORITY
					: OPERATION_LOG_META_ALL;
			try {
				const n = await runResolvePass(`t+${delay}ms`, metas);
				totalCreated += n;
				if (n > 0 && firstSuccessPass < 0) {
					firstSuccessPass = i;
				}
			} catch (error: any) {
				console.warn(
					"[device-person-token] operation-log resolve pass crashed",
					deviceId,
					`t+${delay}ms`,
					error?.message || error,
				);
			}
		}
		if (totalCreated > 0) {
			console.log(
				`[device-person-token] operation-log resolve total saved ${totalCreated} lifecycle event(s) device=${deviceId} triggerMinor=${triggerMinor || "?"} (fast multipass)`,
			);
		}
	})().catch((error) => {
		console.warn(
			"[device-person-token] operation-log resolve crashed",
			deviceId,
			error?.message || error,
		);
	});
};

/** True when an SDK callback is the opaque "something changed on device" major-3 path. */
export const isHikvisionSdkOperationSignal = (event: {
	major?: string | number | null;
	minor?: string | number | null;
	eventKind?: string | null;
	actionCode?: string | null;
	payload?: any;
}): boolean => {
	const major = String(event.major ?? event.payload?.major ?? "").trim();
	const eventKind = String(event.eventKind ?? event.payload?.eventKind ?? "").trim();
	const actionCode = String(event.actionCode ?? event.payload?.actionCode ?? "").trim();
	if (eventKind === "biometric_operation_sync") return true;
	if (actionCode.startsWith("OBSERVED_OPERATION_MINOR_")) return true;
	if (major === "3") return true;
	return false;
};
