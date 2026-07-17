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
	parseHikvisionLogSearchResponse,
} from "./hikvision-event-contract.helper";

export type DevicePersonTokenSource =
	| "WRITE_TIME_CAPTURE"
	| "USER_INFO_RECORD"
	| "USER_INFO_MODIFY"
	| "FINGERPRINT_ENROLL"
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
		return prisma.devicePersonToken.update({
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
	}
	return prisma.devicePersonToken.create({
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
		displayName: params.displayName,
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
