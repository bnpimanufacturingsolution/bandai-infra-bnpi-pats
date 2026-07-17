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

/**
 * DeviceUser is inventory of people ON THE DEVICE — not HRIS Employee.
 * Upsert so Sync Center can open the real device user for this device.
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
	const existing = await prisma.deviceUser.findFirst({
		where: { organizationId, deviceId, vendorUserId: employeeNo },
	});
	const vendorMetadata = {
		writeTimeCapture: true,
		opaquePersonToken: input.opaqueToken || null,
		notHrisEmployee: true,
		plane: "DEVICE_USER_INVENTORY",
	};
	if (existing) {
		return prisma.deviceUser.update({
			where: { id: existing.id },
			data: {
				employeeNo,
				displayName: input.displayName ?? existing.displayName,
				lastSyncedAt: new Date(),
				vendorMetadata: {
					...((existing.vendorMetadata as any) || {}),
					...vendorMetadata,
				},
			},
		});
	}
	return prisma.deviceUser.create({
		data: {
			organizationId,
			deviceId,
			vendorUserId: employeeNo,
			employeeNo,
			displayName: input.displayName || null,
			status: "UNMATCHED",
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
 * Face/card use vendor localFaceData* / addCard when present.
 */
const OPERATION_LOG_META = [
	{
		metaId: "log.hikvision.com/Information/addUserInfo",
		eventAction: "USER_CREATED",
		eventLabel: "Device user created",
		eventCategory: "USER_MANAGEMENT",
		minor: "addUserInfo",
	},
	{
		metaId: "log.hikvision.com/Information/modifyUserInfo",
		eventAction: "USER_UPDATED",
		eventLabel: "Device user updated",
		eventCategory: "USER_MANAGEMENT",
		minor: "modifyUserInfo",
	},
	// Device leaf is clearUserInfo (not deleteUserInfo). Sync logs already probes this.
	{
		metaId: "log.hikvision.com/Information/clearUserInfo",
		eventAction: "USER_DELETED",
		eventLabel: "Device user deleted",
		eventCategory: "USER_MANAGEMENT",
		minor: "clearUserInfo",
	},
	{
		metaId: "log.hikvision.com/Information/addFpByEmployeeNo",
		eventAction: "FINGERPRINT_ENROLLED",
		eventLabel: "Fingerprint enrolled",
		eventCategory: "ENROLLMENT",
		minor: "addFpByEmployeeNo",
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
	// Card enroll leaf is addCard on this family (deleteCard / clearCardInfo invalid).
	{
		metaId: "log.hikvision.com/Information/addCard",
		eventAction: "CARD_ENROLLED",
		eventLabel: "Card enrolled",
		eventCategory: "ENROLLMENT",
		minor: "addCard",
	},
] as const;

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

	const cooldownMs = params.cooldownMs ?? 4_000;
	const now = Date.now();
	const last = operationLogResolveCooldownMs.get(deviceId) || 0;
	if (now - last < cooldownMs) return;
	operationLogResolveCooldownMs.set(deviceId, now);

	const settleMs = params.settleMs ?? 1_500;
	// Device often emits major=3 while the operator is still mid-enroll; addUserInfo /
	// addFpByEmployeeNo leaves can lag 5–45s after the first SYNC_SIGNAL burst.
	const retryDelaysMs =
		params.retryDelaysMs ??
		(settleMs > 0
			? Array.from(new Set([settleMs, 8_000, 20_000, 45_000])).sort((a, b) => a - b)
			: [0]);
	// Cooldown only collapses concurrent schedules; multipass above still covers late leaves.
	const windowBeforeMs = params.windowBeforeMs ?? 15 * 60_000;
	const windowAfterMs = params.windowAfterMs ?? 3 * 60_000;
	const triggerMinor = String(params.triggerMinor ?? "").trim();

	const runResolvePass = async (passLabel: string): Promise<number> => {
		const startTime = formatHikvisionPlus08(Date.now() - windowBeforeMs);
		const endTime = formatHikvisionPlus08(Date.now() + windowAfterMs);
		const device = {
			id: deviceId,
			name: params.deviceName || null,
			address: params.deviceAddress || null,
		};
		let created = 0;
		const pageSize = 30;

		const fetchLogPage = async (metaId: string, searchResultPosition: number) => {
			const response = await hikvisionFetch("/ISAPI/ContentMgmt/logSearch", {
				method: "POST",
				deviceId,
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

		for (const meta of OPERATION_LOG_META) {
			try {
				// First page: learn totalMatches. Prefer newest page so recent enroll/delete
				// is not lost when the window has hundreds of historical leaf rows.
				let parsed = await fetchLogPage(meta.metaId, 0);
				const total =
					typeof parsed.totalMatches === "number" && Number.isFinite(parsed.totalMatches)
						? parsed.totalMatches
						: 0;
				if (total > pageSize) {
					const newestPosition = Math.max(0, total - pageSize);
					parsed = await fetchLogPage(meta.metaId, newestPosition);
				}
				for (const row of parsed.rows || []) {
					const evidence = normalizeHikvisionLogSearchRow(row as any, device);
					const applied = await applyDevicePersonTokenToEvidence(params.prisma, {
						organizationId,
						deviceId,
						evidence: evidence as any,
					});
					let employeeNo = String(applied.employeeNo || evidence.employeeNo || "").trim();
					const opaque =
						(applied as any).opaquePersonToken ||
						(isOpaqueHikvisionPersonToken(employeeNo) ? employeeNo : null);
					if (employeeNo && isOpaqueHikvisionPersonToken(employeeNo)) {
						const tok = await resolveDevicePersonToken(params.prisma, {
							organizationId,
							deviceId,
							opaqueToken: employeeNo,
						});
						if (tok?.employeeNo) employeeNo = tok.employeeNo;
						else employeeNo = "";
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

					// Skip near-duplicates (same action + ~same second), even when person is still opaque.
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

					const createdRow = await params.prisma.deviceEvent.create({
						data: {
							organizationId,
							deviceId,
							eventTime: Number.isFinite(eventTime.getTime()) ? eventTime : new Date(),
							employeeNo: employeeNo || null,
							source: "HIKVISION_CALLBACK",
							status: employeeNo ? "UNMATCHED" : "RECEIVED",
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
								opaquePersonToken: opaque,
								resolvedEmployeeNo: employeeNo || null,
								notHrisEmployee: true,
								plane: "DEVICE_USER",
								rawEvidence: (applied as any).rawEvidence || evidence,
							},
						},
					});
					if (employeeNo) {
						await upsertDeviceUserInventoryStub(params.prisma, {
							organizationId,
							deviceId,
							employeeNo,
							displayName: null,
							opaqueToken: opaque,
						}).catch(() => null);
					}
					// Reload with relations so FE socket prepend has name/action/device columns.
					const fullRow = await params.prisma.deviceEvent.findUnique({
						where: { id: createdRow.id },
						include: {
							device: { select: { id: true, name: true, address: true, port: true, protocol: true } },
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
					emitDeviceEventSaved(params.req?.io, fullRow || createdRow);
					created += 1;
				}
			} catch (error: any) {
				console.warn(
					"[device-person-token] operation-log resolve failed",
					meta.metaId,
					deviceId,
					error?.message || error,
				);
			}
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
		for (let i = 0; i < retryDelaysMs.length; i += 1) {
			const delay = retryDelaysMs[i] || 0;
			const waitMs = Math.max(0, delay - previousDelay);
			if (waitMs > 0) {
				await new Promise((resolve) => setTimeout(resolve, waitMs));
			}
			previousDelay = delay;
			try {
				totalCreated += await runResolvePass(`t+${delay}ms`);
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
				`[device-person-token] operation-log resolve total saved ${totalCreated} lifecycle event(s) device=${deviceId} triggerMinor=${triggerMinor || "?"}`,
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
