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
import {
	buildDeviceUserEmployeeNoCandidates,
	extractHikvisionCredentialSummary,
	normalizeHikvisionDeviceUser,
} from "./device-user-sync.helper";
import { emitDeviceEventSaved } from "./device-event-realtime.helper";
import {
	scheduleRawFingerprintCaptureForEnrollment,
	shouldCaptureRawFingerprintForEventAction,
} from "./device-user-raw-fingerprint.helper";

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
 * LogAddInfo can carry FingerId for addFpByEmployeeNo leaves (panel FP enroll).
 * Never treat this as a full fingerprint template — only an enrollment index.
 */
export const extractFingerIdFromLogEvidence = (evidence: any): number | null => {
	const info = String(
		evidence?.information ||
			evidence?.raw?.information ||
			evidence?.rawEvidence?.information ||
			evidence?.rawEvidence?.raw?.information ||
			"",
	).trim();
	if (!info) return null;
	try {
		const parsed = JSON.parse(info);
		const fingerId = Number(
			parsed?.LogAddInfo?.FingerId ??
				parsed?.logAddInfo?.FingerId ??
				parsed?.LogAddInfo?.fingerId ??
				parsed?.logAddInfo?.fingerId,
		);
		return Number.isFinite(fingerId) && fingerId > 0 ? fingerId : null;
	} catch {
		return null;
	}
};

/**
 * Enrollment snapshot for DeviceEvent.payload.
 * Goal fields for "did enroll work?": plain employeeNo, display name, opaque token,
 * UserInfo credentials, finger id from op log. Raw fingerprint template bytes are
 * intentionally NOT stored on DeviceEvent (encrypted DeviceUser custody only).
 */
export const buildEnrollmentSnapshot = (input: {
	eventAction?: string | null;
	plainEmployeeNo?: string | null;
	displayName?: string | null;
	opaqueToken?: string | null;
	userInfo?: any | null;
	fingerIdFromLog?: number | null;
	deviceUserId?: string | null;
	linkedEmployeeId?: string | null;
	biometricTemplateStatus?:
		| "not_applicable"
		| "pending_plain_employee_no"
		| "userinfo_counts_only"
		| "raw_capture_pending"
		| "raw_on_device_user"
		| "raw_capture_failed"
		| "encrypted_on_device_user"
		| "missing_on_device";
}): Record<string, unknown> => {
	const plain = String(input.plainEmployeeNo || "").trim() || null;
	const opaque = String(input.opaqueToken || "").trim() || null;
	const credentialSummary = input.userInfo
		? extractHikvisionCredentialSummary(input.userInfo)
		: null;
	const fingerId =
		typeof input.fingerIdFromLog === "number" && Number.isFinite(input.fingerIdFromLog)
			? input.fingerIdFromLog
			: null;
	const completeEnoughForEnrollmentIdentity = Boolean(plain && (input.displayName || input.userInfo));
	const templateStatus =
		input.biometricTemplateStatus ||
		(plain
			? credentialSummary?.hasFingerprint
				? "userinfo_counts_only"
				: "missing_on_device"
			: "pending_plain_employee_no");
	return {
		schema: "project-truth.enrollment-snapshot.v1",
		eventAction: input.eventAction || null,
		// What operators need to identify the person on device.
		plainEmployeeNo: plain,
		displayName: String(input.displayName || "").trim() || null,
		opaquePersonToken: opaque,
		deviceUserId: input.deviceUserId || null,
		linkedEmployeeId: input.linkedEmployeeId || null,
		// Device UserInfo identity/credentials (summary + raw UserInfo).
		userInfoPresent: Boolean(input.userInfo),
		userInfo: input.userInfo || null,
		credentialSummary,
		fingerIdFromLog: fingerId,
		// Template plane: RAW base64 fingerData on DeviceUser (operator expectation).
		biometricTemplateStatus: templateStatus,
		biometricCustody: {
			plane: "DEVICE_USER",
			templateStorage: "raw_base64_on_device_user",
			status: templateStatus,
			fingerprintCount: credentialSummary?.fingerprintCount ?? null,
			faceCount: credentialSummary?.faceCount ?? null,
			cardCount: credentialSummary?.cardCount ?? null,
			location: "DeviceUser.vendorMetadata.rawFingerprints.templates[].data",
			note:
				"DeviceEvent keeps enrollment proof + UserInfo summary only. Actual base64 raw template blobs are stored on DeviceUser.vendorMetadata.rawFingerprints after enroll capture — not AES-wrapped by default.",
		},
		completeness: {
			hasOpaqueToken: Boolean(opaque),
			hasPlainEmployeeNo: Boolean(plain),
			hasDisplayName: Boolean(String(input.displayName || "").trim()),
			hasUserInfo: Boolean(input.userInfo),
			hasFingerprintCount: Boolean(credentialSummary?.hasFingerprint),
			identityReady: completeEnoughForEnrollmentIdentity,
		},
	};
};

/** Targeted UserInfo/Search by plain employeeNo (Enrollment enrichment). */
export const fetchUserInfoRecordByEmployeeNo = async (params: {
	prisma: PrismaClient | any;
	req: any;
	deviceId: string;
	employeeNo: string;
}): Promise<any | null> => {
	const employeeNo = String(params.employeeNo || "").trim();
	if (!employeeNo || isOpaqueHikvisionPersonToken(employeeNo)) return null;
	const response = await hikvisionFetch("/ISAPI/AccessControl/UserInfo/Search?format=json", {
		method: "POST",
		deviceId: params.deviceId,
		prisma: params.prisma,
		request: params.req,
		timeoutMs: 10_000,
		body: {
			UserInfoSearchCond: {
				searchID: `enroll-enrich-${Date.now()}`,
				searchResultPosition: 0,
				maxResults: 4,
				EmployeeNoList: [{ employeeNo }],
			},
		},
	});
	const search =
		(response as any)?.UserInfoSearch || (response as any)?.data?.UserInfoSearch || {};
	const list = Array.isArray(search?.UserInfo)
		? search.UserInfo
		: search?.UserInfo
			? [search.UserInfo]
			: [];
	const match =
		list.find(
			(raw: any) =>
				String(raw?.employeeNo || raw?.employeeNoString || "").trim() === employeeNo,
		) ||
		list[0] ||
		null;
	return match || null;
};

/**
 * After a lifecycle DeviceEvent is saved, pull full UserInfo into DeviceUser +
 * attach enrollmentSnapshot on the event so UI/API show the enrollment goal data.
 */
export const enrichEnrollmentLifecycleEvent = async (params: {
	prisma: PrismaClient | any;
	req: any;
	organizationId: string;
	deviceId: string;
	eventId: string;
	eventAction?: string | null;
	plainEmployeeNo?: string | null;
	displayName?: string | null;
	opaqueToken?: string | null;
	fingerIdFromLog?: number | null;
	linkedEmployeeId?: string | null;
	deviceUserId?: string | null;
}): Promise<{ ok: boolean; snapshot: Record<string, unknown> | null; reason?: string }> => {
	const eventId = String(params.eventId || "").trim();
	const organizationId = String(params.organizationId || "").trim();
	const deviceId = String(params.deviceId || "").trim();
	if (!eventId || !organizationId || !deviceId) {
		return { ok: false, snapshot: null, reason: "missing_ids" };
	}

	let plain = String(params.plainEmployeeNo || "").trim() || null;
	if (plain && isOpaqueHikvisionPersonToken(plain)) plain = null;
	let displayName = String(params.displayName || "").trim() || null;
	const opaque = String(params.opaqueToken || "").trim() || null;
	let userInfo: any = null;
	let deviceUserId = String(params.deviceUserId || "").trim() || null;
	let linkedEmployeeId = String(params.linkedEmployeeId || "").trim() || null;

	if (plain) {
		try {
			userInfo = await fetchUserInfoRecordByEmployeeNo({
				prisma: params.prisma,
				req: params.req,
				deviceId,
				employeeNo: plain,
			});
		} catch (error: any) {
			console.warn(
				"[device-person-token] UserInfo enrich failed",
				deviceId,
				plain,
				error?.message || error,
			);
		}
		if (userInfo) {
			const plainUser = extractPlainUserFromUserInfoRecord(userInfo);
			if (plainUser?.displayName) displayName = plainUser.displayName;
			const candidate = normalizeHikvisionDeviceUser(userInfo);
			if (candidate) {
				const existing = await params.prisma.deviceUser.findFirst({
					where: {
						organizationId,
						deviceId,
						vendorUserId: candidate.vendorUserId,
					},
				});
				const priorMeta = (existing?.vendorMetadata as any) || {};
				const priorRaw =
					existing?.rawPayload && typeof existing.rawPayload === "object"
						? (existing.rawPayload as any)
						: {};
				const candidateMeta = (candidate.vendorMetadata as any) || {};
				// Never drop raw biometric custody when UserInfo enrich rewrites metadata.
				const vendorMetadata = {
					...priorMeta,
					...candidateMeta,
					// Preserve raw blobs even if candidate overwrites sibling keys.
					rawFingerprints:
						priorMeta.rawFingerprints || candidateMeta.rawFingerprints || undefined,
					rawFingerprintPresent:
						priorMeta.rawFingerprintPresent ??
						candidateMeta.rawFingerprintPresent ??
						undefined,
					rawFingerprintCount:
						priorMeta.rawFingerprintCount ??
						candidateMeta.rawFingerprintCount ??
						undefined,
					rawFace: priorMeta.rawFace || candidateMeta.rawFace || undefined,
					rawFacePresent:
						priorMeta.rawFacePresent ?? candidateMeta.rawFacePresent ?? undefined,
					credentialSummary: {
						...(priorMeta.credentialSummary || {}),
						...(candidateMeta.credentialSummary || {}),
						fingerprintCount: Math.max(
							Number(priorMeta.credentialSummary?.fingerprintCount || 0) || 0,
							Number(candidateMeta.credentialSummary?.fingerprintCount || 0) || 0,
							Number(priorMeta.rawFingerprintCount || 0) || 0,
						),
						hasFingerprint:
							Boolean(priorMeta.credentialSummary?.hasFingerprint) ||
							Boolean(candidateMeta.credentialSummary?.hasFingerprint) ||
							Boolean(priorMeta.rawFingerprintPresent) ||
							Boolean(priorMeta.rawFingerprints?.present),
						faceCount: Math.max(
							Number(priorMeta.credentialSummary?.faceCount || 0) || 0,
							Number(candidateMeta.credentialSummary?.faceCount || 0) || 0,
						),
						hasFace:
							Boolean(priorMeta.credentialSummary?.hasFace) ||
							Boolean(candidateMeta.credentialSummary?.hasFace) ||
							Boolean(priorMeta.rawFacePresent),
					},
					opaquePersonToken: opaque || priorMeta.opaquePersonToken || null,
					enrollmentEnrichedAt: new Date().toISOString(),
					plane: "DEVICE_USER_INVENTORY",
				};
				const mergedRawPayload = {
					...priorRaw,
					...((candidate.rawPayload as any) || {}),
					_hrisDeviceMetadata: {
						...(priorRaw._hrisDeviceMetadata || {}),
						...(((candidate.rawPayload as any)?._hrisDeviceMetadata as any) || {}),
						// Keep raw biometric mirrors for Device User modal.
						rawFingerprints:
							priorRaw._hrisDeviceMetadata?.rawFingerprints ||
							vendorMetadata.rawFingerprints ||
							undefined,
						rawFace:
							priorRaw._hrisDeviceMetadata?.rawFace ||
							vendorMetadata.rawFace ||
							undefined,
						credentialSummary: vendorMetadata.credentialSummary,
					},
				};
				const linked =
					(await resolveLinkedEmployeeForDevicePerson(params.prisma, {
						organizationId,
						employeeNo: candidate.employeeNo,
					}).catch(() => null)) || null;
				linkedEmployeeId = linked?.id || linkedEmployeeId;
				const status = linked?.id
					? "ACTIVE"
					: existing?.status === "DISABLED"
						? "DISABLED"
						: "UNMATCHED";
				const saved = existing
					? await params.prisma.deviceUser.update({
							where: { id: existing.id },
							data: {
								employeeNo: candidate.employeeNo,
								displayName:
									displayName || candidate.displayName || existing.displayName,
								userType: candidate.userType,
								status,
								validFrom: candidate.validFrom,
								validTo: candidate.validTo,
								doorRight: candidate.doorRight,
								accessPlan: candidate.accessPlan as any,
								rawPayload: mergedRawPayload as any,
								employeeId: linked?.id || existing.employeeId || null,
								lastSyncedAt: new Date(),
								vendorMetadata,
							},
						})
					: await params.prisma.deviceUser.create({
							data: {
								organizationId,
								deviceId,
								vendorUserId: candidate.vendorUserId,
								employeeNo: candidate.employeeNo,
								displayName: displayName || candidate.displayName,
								userType: candidate.userType,
								status,
								validFrom: candidate.validFrom,
								validTo: candidate.validTo,
								doorRight: candidate.doorRight,
								accessPlan: candidate.accessPlan as any,
								rawPayload: mergedRawPayload as any,
								employeeId: linked?.id || null,
								lastSyncedAt: new Date(),
								vendorMetadata,
							},
						});
				deviceUserId = saved?.id || deviceUserId;
			}
		} else {
			// Still ensure inventory stub exists even if single-user UserInfo failed.
			const stub = await upsertDeviceUserInventoryStub(params.prisma, {
				organizationId,
				deviceId,
				employeeNo: plain,
				displayName,
				opaqueToken: opaque,
			}).catch(() => null);
			deviceUserId = stub?.id || deviceUserId;
			linkedEmployeeId = stub?.employeeId || linkedEmployeeId;
		}
	}

	const existingEvent = await params.prisma.deviceEvent.findUnique({
		where: { id: eventId },
		select: { id: true, payload: true, employeeNo: true, status: true },
	});
	if (!existingEvent) return { ok: false, snapshot: null, reason: "event_missing" };

	const priorPayload = (existingEvent.payload as any) || {};
	const wantsRawFp =
		Boolean(plain) && shouldCaptureRawFingerprintForEventAction(params.eventAction);
	const snapshot = buildEnrollmentSnapshot({
		eventAction: params.eventAction,
		plainEmployeeNo: plain,
		displayName,
		opaqueToken: opaque,
		userInfo,
		fingerIdFromLog: params.fingerIdFromLog,
		deviceUserId,
		linkedEmployeeId,
		biometricTemplateStatus: plain
			? wantsRawFp
				? "raw_capture_pending"
				: userInfo
					? "userinfo_counts_only"
					: "pending_plain_employee_no"
			: "pending_plain_employee_no",
	});

	const nextPayload = {
		...priorPayload,
		enrollmentSnapshot: snapshot,
		resolvedEmployeeNo: plain || priorPayload.resolvedEmployeeNo || null,
		resolvedDisplayName: displayName || priorPayload.resolvedDisplayName || null,
		personTokenResolved: Boolean(plain && opaque),
		opaquePersonToken: opaque || priorPayload.opaquePersonToken || null,
		// Explicit goal fields for consumers that do not deep-read enrollmentSnapshot.
		enrollmentGoal: {
			employeeNo: plain,
			displayName,
			opaquePersonToken: opaque,
			userInfo: userInfo || null,
			credentialSummary: snapshot.credentialSummary,
			fingerIdFromLog: snapshot.fingerIdFromLog,
			deviceUserId,
			// Templates: pointer only on event — actual base64 fingerData on DeviceUser.rawFingerprints.
			fingerprintTemplateLocation: deviceUserId
				? `DeviceUser(${deviceUserId}).vendorMetadata.rawFingerprints.templates[].data`
				: "DeviceUser.vendorMetadata.rawFingerprints.templates[].data",
			rawTemplateOnDeviceEvent: false,
			rawFingerprintExpected: wantsRawFp,
		},
	};

	const updated = await params.prisma.deviceEvent.update({
		where: { id: eventId },
		data: {
			employeeNo: plain || existingEvent.employeeNo || null,
			employeeId: linkedEmployeeId || null,
			deviceUserId: deviceUserId || null,
			status: linkedEmployeeId
				? "MATCHED"
				: plain
					? "UNMATCHED"
					: existingEvent.status || "RECEIVED",
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
		},
	});

	let employeeForSocket: any = null;
	if (linkedEmployeeId) {
		employeeForSocket = await params.prisma.employee
			.findUnique({
				where: { id: linkedEmployeeId },
				select: {
					id: true,
					employeeId: true,
					deviceEmpId: true,
					person: { select: { personalInfo: true } },
				},
			})
			.catch(() => null);
	}
	emitDeviceEventSaved(params.req?.io, {
		...updated,
		employee: employeeForSocket,
	});

	// Operator expectation: after FP enroll (or user create/update with plain id),
	// pull actual fingerData blobs from the device and store RAW on DeviceUser.
	if (wantsRawFp && plain) {
		scheduleRawFingerprintCaptureForEnrollment({
			prisma: params.prisma,
			req: params.req,
			organizationId,
			deviceId,
			eventId,
			employeeNo: plain,
			deviceUserId,
		});
	}

	return { ok: true, snapshot };
};

/**
 * Expand known plain ids so "15" and "00015" collide as the same person key.
 */
export const expandKnownDevicePersonPlains = (knownPlains: string[]): Set<string> => {
	const known = new Set<string>();
	for (const raw of knownPlains || []) {
		const text = String(raw || "").trim();
		if (!text) continue;
		for (const variant of buildDeviceUserEmployeeNoCandidates(text)) {
			known.add(variant);
		}
		known.add(text);
	}
	return known;
};

const pickNewestPlainCandidate = (
	plains: Array<{ employeeNo: string; displayName: string | null; numOfFP?: number }>,
) => {
	if (!plains.length) return null;
	if (plains.length === 1) return plains[0];
	// Prefer pure numeric ids (panel typed person nos), then highest numeric, then lexical.
	const scored = [...plains].map((p, index) => {
		const no = String(p.employeeNo || "").trim();
		const numeric = /^\d+$/.test(no) ? Number(no.replace(/^0+/, "") || "0") : -1;
		return { p, index, numeric, isNumeric: numeric >= 0, fp: Number(p.numOfFP || 0) || 0 };
	});
	scored.sort((a, b) => {
		if (a.isNumeric !== b.isNumeric) return a.isNumeric ? -1 : 1;
		if (a.numeric !== b.numeric) return b.numeric - a.numeric;
		if (a.fp !== b.fp) return b.fp - a.fp;
		return b.index - a.index;
	});
	return scored[0]?.p || plains[0];
};

/**
 * Panel enroll correlation (no write-time map):
 * - knownPlains = DeviceUser / DevicePersonToken plain ids already in HRIS
 * - devicePlains = plain ids currently on device (UserInfo/Search)
 * - unmappedOpaques = opaque tokens from recent lifecycle logs without a map
 * If exactly one new plain and one unmapped opaque in the same resolve window → map them.
 * If one opaque and multiple new plains → pick the newest/highest pure-numeric plain (panel create).
 * Reference case: plain "14" + opaque "EmfPTja5gq/kmy/CI1wDHA=="; user "15" + opaque QVEwgvx/...
 */
export const correlateOpaqueToPlainByInventoryDelta = (input: {
	devicePlains: Array<{ employeeNo: string; displayName: string | null; numOfFP?: number }>;
	knownPlains: string[];
	unmappedOpaques: string[];
}): { opaqueToken: string; employeeNo: string; displayName: string | null } | null => {
	const known = expandKnownDevicePersonPlains(input.knownPlains || []);
	const newPlains = (input.devicePlains || []).filter((p) => {
		const no = String(p.employeeNo || "").trim();
		if (!no) return false;
		const variants = buildDeviceUserEmployeeNoCandidates(no);
		return !variants.some((v) => known.has(v)) && !known.has(no);
	});
	const opaques = Array.from(
		new Set((input.unmappedOpaques || []).map((v) => String(v || "").trim()).filter(Boolean)),
	);
	if (!opaques.length || !newPlains.length) {
		// FP-only on existing plain: no new plain, but exactly one opaque and we cannot invent id.
		return null;
	}
	// One opaque + one or more new plains: map the best new plain (single-create panel path).
	if (opaques.length === 1) {
		const picked = pickNewestPlainCandidate(newPlains);
		if (!picked) return null;
		return {
			opaqueToken: opaques[0],
			employeeNo: picked.employeeNo,
			displayName: picked.displayName,
		};
	}
	// Multiple opaques + exactly one new plain: safe map.
	if (newPlains.length === 1 && opaques.length > 1) {
		return {
			opaqueToken: opaques[opaques.length - 1],
			employeeNo: newPlains[0].employeeNo,
			displayName: newPlains[0].displayName,
		};
	}
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
 * Truth (live BNPI / TEST A):
 *   DeviceUser.vendorUserId / DeviceEvent.employeeNo = plain "15"
 *   Employee.deviceEmpId = plain "15" (same device person number)
 *   Employee.employeeId may be zero-padded org code e.g. "00015" / "01029"
 * Pad variants are for employeeId (and messy legacy rows), not for inventing deviceEmpId=00015.
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
	const variants = buildDeviceUserEmployeeNoCandidates(employeeNo);
	if (!variants.length) return null;
	const employee = await prisma.employee.findFirst({
		where: {
			organizationId,
			isDeleted: false,
			OR: [
				{ deviceEmpId: { in: variants } },
				{ employeeId: { in: variants } },
			],
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
	// Panel enrolls can land past page 6 on large terminals (300+ users). Scan enough pages.
	const maxPages = Math.min(Math.max(Number(params.maxPages) || 12, 1), 20);
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

const LIFECYCLE_EVENT_ACTIONS_FOR_PLAIN_BACKFILL = [
	"USER_CREATED",
	"USER_UPDATED",
	"USER_DELETED",
	"FINGERPRINT_ENROLLED",
	"FINGERPRINT_UPDATED",
	"FINGERPRINT_DELETED",
	"CARD_ENROLLED",
] as const;

type RecentLifecycleEventForPlainBackfill = {
	id: string;
	employeeNo?: string | null;
	employeeId?: string | null;
	deviceUserId?: string | null;
	payload?: unknown;
};

/**
 * Operator truth: USER_CREATED / FINGERPRINT_ENROLLED must show the plain person id.
 * Race (TEST A 2026-07-19): C++ inventory_delta attaches plain to SYNC_SIGNAL first and
 * upserts DeviceUser, then multipass logSearch saves lifecycle rows with opaque only.
 * Inventory delta then sees no *new* plain → opaque map never runs → UI shows
 * "Identity check pending" on create/enroll while SYNC_SIGNAL shows User 16.
 *
 * Call this whenever plain is known (SDK fast path or opaque map) to backfill siblings.
 */
export const backfillRecentLifecycleEventsWithPlain = async (params: {
	prisma: PrismaClient | any;
	req?: any;
	organizationId: string;
	deviceId: string;
	plainEmployeeNo: string;
	opaqueToken?: string | null;
	displayName?: string | null;
	deviceUserId?: string | null;
	/** Default 10 minutes. */
	windowMs?: number;
	/** Exclude this event id (already updated by caller). */
	excludeEventId?: string | null;
	source?: string;
}): Promise<{ backfilledEvents: number; eventIds: string[] }> => {
	const organizationId = String(params.organizationId || "").trim();
	const deviceId = String(params.deviceId || "").trim();
	const plain = String(params.plainEmployeeNo || "").trim();
	const opaque = String(params.opaqueToken || "").trim() || null;
	if (
		!organizationId ||
		!deviceId ||
		!plain ||
		isOpaqueHikvisionPersonToken(plain)
	) {
		return { backfilledEvents: 0, eventIds: [] };
	}

	const windowMs = Math.min(
		Math.max(Number(params.windowMs) || 10 * 60_000, 30_000),
		60 * 60_000,
	);
	const source = params.source || "SDK_PLAIN_LIFECYCLE_BACKFILL";

	const recent = (await params.prisma.deviceEvent.findMany({
		where: {
			organizationId,
			deviceId,
			eventAction: { in: [...LIFECYCLE_EVENT_ACTIONS_FOR_PLAIN_BACKFILL] },
			receivedAt: { gte: new Date(Date.now() - windowMs) },
			...(params.excludeEventId
				? { id: { not: String(params.excludeEventId) } }
				: {}),
			OR: [{ employeeNo: null }, { employeeNo: "" }],
		},
		orderBy: { receivedAt: "desc" },
		take: 40,
	})) as RecentLifecycleEventForPlainBackfill[];

	// Collect unique opaques among empty-person lifecycle rows.
	const withOpaqueMeta = recent.map((event) => {
		const payload =
			event.payload && typeof event.payload === "object"
				? (event.payload as Record<string, any>)
				: {};
		const eventOpaque = String(
			payload.opaquePersonToken ||
				payload?.enrollmentGoal?.opaquePersonToken ||
				payload?.rawEvidence?.employeeNo ||
				"",
		).trim();
		return { event, payload, eventOpaque };
	});

	const uniqueOpaques = Array.from(
		new Set(
			withOpaqueMeta
				.map((r: { eventOpaque: string }) => r.eventOpaque)
				.filter((v: string) => Boolean(v) && isOpaqueHikvisionPersonToken(v)),
		),
	);

	// Safety: if multiple distinct opaques in window without a target opaque, do not invent maps.
	if (!opaque && uniqueOpaques.length > 1) {
		return { backfilledEvents: 0, eventIds: [] };
	}

	let deviceUserId = String(params.deviceUserId || "").trim() || null;
	if (!deviceUserId) {
		const du = await params.prisma.deviceUser
			.findFirst({
				where: {
					organizationId,
					deviceId,
					OR: [{ vendorUserId: plain }, { employeeNo: plain }],
				},
				select: { id: true, employeeId: true, displayName: true },
			})
			.catch(() => null);
		deviceUserId = du?.id || null;
		if (!params.displayName && du?.displayName) {
			params.displayName = String(du.displayName);
		}
	}

	const linked = await resolveLinkedEmployeeForDevicePerson(params.prisma, {
		organizationId,
		employeeNo: plain,
	}).catch(() => null);

	// Persist opaque→plain map when we know both.
	if (opaque && isOpaqueHikvisionPersonToken(opaque)) {
		await upsertDevicePersonToken(params.prisma, {
			organizationId,
			deviceId,
			opaqueToken: opaque,
			employeeNo: plain,
			displayName: params.displayName || linked?.displayName || null,
			source: "SDK_PLAIN_LIFECYCLE_BACKFILL" as DevicePersonTokenSource,
		}).catch(() => null);
	} else if (uniqueOpaques.length === 1) {
		await upsertDevicePersonToken(params.prisma, {
			organizationId,
			deviceId,
			opaqueToken: uniqueOpaques[0],
			employeeNo: plain,
			displayName: params.displayName || linked?.displayName || null,
			source: "SDK_PLAIN_LIFECYCLE_BACKFILL" as DevicePersonTokenSource,
		}).catch(() => null);
	}

	const eventIds: string[] = [];
	for (const row of withOpaqueMeta) {
		const { event, payload, eventOpaque } = row;
		// If caller gave a specific opaque, only backfill matching rows (or rows with no opaque).
		if (opaque && eventOpaque && eventOpaque !== opaque) continue;
		// If multiple opaques and no target, we already returned; here at most one opaque family.
		if (!opaque && uniqueOpaques.length === 1 && eventOpaque && eventOpaque !== uniqueOpaques[0]) {
			continue;
		}

		const resolvedOpaque = opaque || eventOpaque || uniqueOpaques[0] || null;
		const nextPayload = {
			...payload,
			opaquePersonToken: resolvedOpaque || payload.opaquePersonToken || null,
			resolvedEmployeeNo: plain,
			resolvedDisplayName:
				params.displayName ||
				linked?.displayName ||
				payload.resolvedDisplayName ||
				null,
			personTokenResolved: Boolean(resolvedOpaque),
			personTokenSource: source,
			lifecyclePlainBackfilledAt: new Date().toISOString(),
			notHrisEmployee: !linked?.id,
			enrollmentGoal: {
				...((payload.enrollmentGoal as any) || {}),
				employeeNo: plain,
				displayName:
					params.displayName ||
					linked?.displayName ||
					payload.enrollmentGoal?.displayName ||
					null,
				deviceUserId: deviceUserId || payload.enrollmentGoal?.deviceUserId || null,
				opaquePersonToken:
					resolvedOpaque || payload.enrollmentGoal?.opaquePersonToken || null,
			},
			enrollmentSnapshot: {
				...((payload.enrollmentSnapshot as any) || {}),
				employeeNo: plain,
				displayName:
					params.displayName ||
					linked?.displayName ||
					payload.enrollmentSnapshot?.displayName ||
					null,
				deviceUserId: deviceUserId || payload.enrollmentSnapshot?.deviceUserId || null,
			},
		};

		const updated = await params.prisma.deviceEvent.update({
			where: { id: event.id },
			data: {
				employeeNo: plain,
				employeeId: linked?.id || event.employeeId || null,
				deviceUserId: deviceUserId || event.deviceUserId || null,
				status: linked?.id ? "MATCHED" : "UNMATCHED",
				errorMessage: null,
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
			},
		});

		let employeeForSocket: any = null;
		if (linked?.id) {
			employeeForSocket = await params.prisma.employee
				.findUnique({
					where: { id: linked.id },
					select: {
						id: true,
						employeeId: true,
						deviceEmpId: true,
						person: { select: { personalInfo: true } },
					},
				})
				.catch(() => null);
		}
		emitDeviceEventSaved(params.req?.io, {
			...updated,
			employee: employeeForSocket,
		});
		eventIds.push(String(event.id));
	}

	// After plain is known on create/enroll ledger, pull raw fingerData onto DeviceUser.
	if (eventIds.length || plain) {
		scheduleRawFingerprintCaptureForEnrollment({
			prisma: params.prisma,
			req: params.req,
			organizationId,
			deviceId,
			eventId: eventIds[0] || params.excludeEventId || undefined,
			employeeNo: plain,
			deviceUserId,
		});
	}

	if (eventIds.length) {
		console.log(
			`[device-person-token] lifecycle plain backfill plain=${plain} count=${eventIds.length} source=${source}`,
		);
	}
	return { backfilledEvents: eventIds.length, eventIds };
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

	let devicePlains: Array<{
		employeeNo: string;
		displayName: string | null;
		numOfFP?: number;
	}> = [];
	try {
		const candidates = await fetchDeviceUserInfoCandidates({
			prisma: params.prisma,
			req: params.req,
			deviceId,
			maxPages: 12,
			pageSize: 50,
		});
		devicePlains = candidates.map((c) => ({
			employeeNo: c.employeeNo,
			displayName: c.displayName,
			numOfFP: c.numOfFP,
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
	const knownSet = expandKnownDevicePersonPlains(knownPlains);

	// Always land NEW device plains into DeviceUser inventory immediately so Sync Center
	// shows panel create (e.g. "15") without waiting for opaque map success.
	const newPlains = devicePlains.filter((p) => {
		const no = String(p.employeeNo || "").trim();
		if (!no) return false;
		const variants = buildDeviceUserEmployeeNoCandidates(no);
		return !variants.some((v) => knownSet.has(v)) && !knownSet.has(no);
	});
	for (const plain of newPlains) {
		const opaqueHint = stillUnmapped.length === 1 ? stillUnmapped[0] : null;
		// Prefer full UserInfo raw metadata; fall back to inventory stub only.
		let savedUser = false;
		try {
			const userInfo = await fetchUserInfoRecordByEmployeeNo({
				prisma: params.prisma,
				req: params.req,
				deviceId,
				employeeNo: plain.employeeNo,
			});
			const candidate = userInfo ? normalizeHikvisionDeviceUser(userInfo) : null;
			if (candidate) {
				const existing = await params.prisma.deviceUser.findFirst({
					where: {
						organizationId,
						deviceId,
						vendorUserId: candidate.vendorUserId,
					},
				});
				const linked = await resolveLinkedEmployeeForDevicePerson(params.prisma, {
					organizationId,
					employeeNo: candidate.employeeNo,
				}).catch(() => null);
				const priorMeta = (existing?.vendorMetadata as any) || {};
				const vendorMetadata = {
					...priorMeta,
					...(candidate.vendorMetadata as any),
					opaquePersonToken: opaqueHint || priorMeta.opaquePersonToken || null,
					panelInventoryNewPlainAt: new Date().toISOString(),
					plane: "DEVICE_USER_INVENTORY",
				};
				const status = linked?.id
					? "ACTIVE"
					: existing?.status === "DISABLED"
						? "DISABLED"
						: "UNMATCHED";
				if (existing) {
					await params.prisma.deviceUser.update({
						where: { id: existing.id },
						data: {
							employeeNo: candidate.employeeNo,
							displayName:
								plain.displayName || candidate.displayName || existing.displayName,
							userType: candidate.userType,
							status,
							validFrom: candidate.validFrom,
							validTo: candidate.validTo,
							doorRight: candidate.doorRight,
							accessPlan: candidate.accessPlan as any,
							rawPayload: candidate.rawPayload as any,
							employeeId: linked?.id || existing.employeeId || null,
							lastSyncedAt: new Date(),
							vendorMetadata,
						},
					});
				} else {
					await params.prisma.deviceUser.create({
						data: {
							organizationId,
							deviceId,
							vendorUserId: candidate.vendorUserId,
							employeeNo: candidate.employeeNo,
							displayName: plain.displayName || candidate.displayName,
							userType: candidate.userType,
							status,
							validFrom: candidate.validFrom,
							validTo: candidate.validTo,
							doorRight: candidate.doorRight,
							accessPlan: candidate.accessPlan as any,
							rawPayload: candidate.rawPayload as any,
							employeeId: linked?.id || null,
							lastSyncedAt: new Date(),
							vendorMetadata,
						},
					});
				}
				savedUser = true;
			}
		} catch (error: any) {
			console.warn(
				"[device-person-token] new-plain UserInfo upsert failed",
				plain.employeeNo,
				error?.message || error,
			);
		}
		if (!savedUser) {
			await upsertDeviceUserInventoryStub(params.prisma, {
				organizationId,
				deviceId,
				employeeNo: plain.employeeNo,
				displayName: plain.displayName,
				opaqueToken: opaqueHint,
			}).catch(() => null);
		}
	}

	let correlated = correlateOpaqueToPlainByInventoryDelta({
		devicePlains,
		knownPlains,
		unmappedOpaques: stillUnmapped,
	});

	// Race fix: plain may already be known (SDK SYNC_SIGNAL inventory_delta upserted DeviceUser)
	// so newPlains is empty and classic correlation returns null. Recover via recent SDK plain.
	if (!correlated && stillUnmapped.length === 1) {
		const recentPlainEvent = await params.prisma.deviceEvent.findFirst({
			where: {
				organizationId,
				deviceId,
				receivedAt: { gte: new Date(Date.now() - 10 * 60_000) },
				AND: [
					{ employeeNo: { not: null } },
					{ NOT: { employeeNo: "" } },
				],
				eventAction: {
					in: ["SYNC_SIGNAL", "USER_CREATED", "USER_UPDATED", "FINGERPRINT_ENROLLED"],
				},
			},
			orderBy: { receivedAt: "desc" },
			select: {
				employeeNo: true,
				deviceUserId: true,
				payload: true,
			},
		});
		const recentPlain = String(recentPlainEvent?.employeeNo || "").trim();
		if (recentPlain && !isOpaqueHikvisionPersonToken(recentPlain)) {
			const displayName =
				String(
					(recentPlainEvent?.payload as any)?.resolvedDisplayName ||
						(recentPlainEvent?.payload as any)?.enrollmentGoal?.displayName ||
						"",
				).trim() ||
				devicePlains.find((p) => p.employeeNo === recentPlain)?.displayName ||
				null;
			correlated = {
				opaqueToken: stillUnmapped[0],
				employeeNo: recentPlain,
				displayName,
			};
			console.log(
				`[device-person-token] opaque map via recent SDK plain=${recentPlain} opaque=${stillUnmapped[0].slice(0, 12)}… device=${deviceId}`,
			);
		}
	}

	if (!correlated) {
		if (newPlains.length) {
			console.log(
				`[device-person-token] panel inventory added ${newPlains.length} new DeviceUser(s) but opaque map still pending device=${deviceId}`,
			);
		}
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
			},
		});
		// DeviceEvent has employeeId but no Prisma employee relation — attach for socket UI only.
		const employeeIdForSocket =
			String(updated?.employeeId || linked?.id || deviceUser?.employeeId || "").trim() || null;
		let employeeForSocket: any = null;
		if (employeeIdForSocket) {
			employeeForSocket = await params.prisma.employee.findUnique({
				where: { id: employeeIdForSocket },
				select: {
					id: true,
					employeeId: true,
					deviceEmpId: true,
					person: { select: { personalInfo: true } },
				},
			});
		}
		// Pull full UserInfo + enrollmentSnapshot so mapped events carry enroll goal data.
		await enrichEnrollmentLifecycleEvent({
			prisma: params.prisma,
			req: params.req,
			organizationId,
			deviceId,
			eventId: updated.id,
			eventAction: event.eventAction,
			plainEmployeeNo: correlated.employeeNo,
			displayName:
				correlated.displayName || linked?.displayName || payload.resolvedDisplayName || null,
			opaqueToken: correlated.opaqueToken,
			fingerIdFromLog: extractFingerIdFromLogEvidence(payload),
			linkedEmployeeId: linked?.id || deviceUser?.employeeId || null,
			deviceUserId: deviceUser?.id || updated.deviceUserId || null,
		}).catch((error: any) => {
			console.warn(
				"[device-person-token] post-delta enrollment enrich failed",
				updated.id,
				error?.message || error,
			);
			emitDeviceEventSaved(params.req?.io, {
				...updated,
				employee: employeeForSocket,
			});
		});
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

					const fingerIdFromLog = extractFingerIdFromLogEvidence(
						(applied as any).rawEvidence || evidence,
					);
					const initialSnapshot = buildEnrollmentSnapshot({
						eventAction,
						plainEmployeeNo: employeeNo || null,
						displayName: resolvedDisplayName,
						opaqueToken: opaque,
						fingerIdFromLog,
						deviceUserId: deviceUser?.id || null,
						linkedEmployeeId,
						biometricTemplateStatus: employeeNo
							? "userinfo_counts_only"
							: "pending_plain_employee_no",
					});
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
								// Goal-oriented enrollment payload (identity + UserInfo; not raw FP bytes).
								enrollmentSnapshot: initialSnapshot,
								enrollmentGoal: {
									employeeNo: employeeNo || null,
									displayName: resolvedDisplayName || null,
									opaquePersonToken: opaque,
									fingerIdFromLog,
									rawTemplateOnDeviceEvent: false,
									fingerprintTemplateLocation:
										"DeviceUser.vendorMetadata.biometricBundle (encrypted)",
								},
							},
						},
					});
					// Enrich with live UserInfo (plain employeeNo) so DeviceUser + event carry enroll truth.
					try {
						await enrichEnrollmentLifecycleEvent({
							prisma: params.prisma,
							req: params.req,
							organizationId,
							deviceId,
							eventId: createdRow.id,
							eventAction,
							plainEmployeeNo: employeeNo || null,
							displayName: resolvedDisplayName,
							opaqueToken: opaque,
							fingerIdFromLog,
							linkedEmployeeId,
							deviceUserId: deviceUser?.id || null,
						});
					} catch (enrichError: any) {
						console.warn(
							"[device-person-token] enrollment enrich failed",
							createdRow.id,
							enrichError?.message || enrichError,
						);
						// Still emit create so UI sees the lifecycle row.
						emitDeviceEventSaved(params.req?.io, createdRow);
					}
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
				.then(async (delta) => {
					if (delta.backfilledEvents > 0) {
						console.log(
							`[device-person-token] panel delta backfilled ${delta.backfilledEvents} event(s) pass=${passLabel}`,
						);
					}
					// If delta mapped zero (plain already known via SYNC_SIGNAL), still force sibling backfill.
					if (delta.backfilledEvents === 0 && unmappedOpaquesThisPass.length >= 1) {
						const recentPlain = await params.prisma.deviceEvent.findFirst({
							where: {
								organizationId,
								deviceId,
								receivedAt: { gte: new Date(Date.now() - 10 * 60_000) },
								AND: [{ employeeNo: { not: null } }, { NOT: { employeeNo: "" } }],
								eventAction: { in: ["SYNC_SIGNAL", "USER_CREATED", "USER_UPDATED"] },
							},
							orderBy: { receivedAt: "desc" },
							select: { employeeNo: true, deviceUserId: true, payload: true },
						});
						const plain = String(recentPlain?.employeeNo || "").trim();
						if (plain && !isOpaqueHikvisionPersonToken(plain)) {
							const bf = await backfillRecentLifecycleEventsWithPlain({
								prisma: params.prisma,
								req: params.req,
								organizationId,
								deviceId,
								plainEmployeeNo: plain,
								opaqueToken:
									unmappedOpaquesThisPass.length === 1
										? unmappedOpaquesThisPass[0]
										: null,
								deviceUserId: recentPlain?.deviceUserId || null,
								displayName:
									String(
										(recentPlain?.payload as any)?.resolvedDisplayName || "",
									).trim() || null,
								windowMs: 10 * 60_000,
								source: "OPLOG_PASS_RECENT_SDK_PLAIN",
							});
							if (bf.backfilledEvents > 0) {
								console.log(
									`[device-person-token] oplog pass sibling backfill plain=${plain} count=${bf.backfilledEvents}`,
								);
							}
						}
					}
				})
				.catch((error: any) => {
					console.warn(
						"[device-person-token] panel inventory delta crashed",
						deviceId,
						error?.message || error,
					);
				});
		} else if (created > 0) {
			// Lifecycle rows may have been saved with empty person while SYNC_SIGNAL already has plain.
			void (async () => {
				const recentPlain = await params.prisma.deviceEvent.findFirst({
					where: {
						organizationId,
						deviceId,
						receivedAt: { gte: new Date(Date.now() - 10 * 60_000) },
						AND: [{ employeeNo: { not: null } }, { NOT: { employeeNo: "" } }],
						eventAction: { in: ["SYNC_SIGNAL", "USER_CREATED", "USER_UPDATED"] },
					},
					orderBy: { receivedAt: "desc" },
					select: { employeeNo: true, deviceUserId: true, payload: true },
				});
				const plain = String(recentPlain?.employeeNo || "").trim();
				if (!plain || isOpaqueHikvisionPersonToken(plain)) return;
				await backfillRecentLifecycleEventsWithPlain({
					prisma: params.prisma,
					req: params.req,
					organizationId,
					deviceId,
					plainEmployeeNo: plain,
					deviceUserId: recentPlain?.deviceUserId || null,
					displayName:
						String((recentPlain?.payload as any)?.resolvedDisplayName || "").trim() ||
						null,
					windowMs: 10 * 60_000,
					source: "OPLOG_CREATED_EMPTY_PERSON_BACKFILL",
				});
			})().catch(() => undefined);
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

/**
 * True when the callback is a user/enroll lifecycle event (create/update/delete/FP/card),
 * not an attendance punch and not a bare major=3 SYNC_SIGNAL.
 */
export const isHikvisionEnrollmentLifecycleCallback = (event: {
	major?: string | number | null;
	minor?: string | number | null;
	eventKind?: string | null;
	actionCode?: string | null;
	eventAction?: string | null;
	payload?: any;
}): boolean => {
	const eventKind = String(event.eventKind ?? event.payload?.eventKind ?? "").trim();
	const actionCode = String(event.actionCode ?? event.payload?.actionCode ?? "")
		.trim()
		.toUpperCase();
	const eventAction = String(
		event.eventAction ?? event.payload?.eventAction ?? "",
	)
		.trim()
		.toUpperCase();
	if (
		eventKind === "biometric_user_management" ||
		eventKind === "biometric_fingerprint_management" ||
		eventKind === "biometric_card_management"
	) {
		return true;
	}
	if (
		actionCode.includes("USER_INFO") ||
		actionCode.includes("FINGER") ||
		actionCode.includes("CARD") ||
		actionCode === "MINOR_ADD_USER_INFO" ||
		actionCode === "MINOR_MODIFY_USER_INFO" ||
		actionCode === "MINOR_CLR_USER_INFO"
	) {
		return true;
	}
	if (
		eventAction === "USER_CREATED" ||
		eventAction === "USER_UPDATED" ||
		eventAction === "USER_DELETED" ||
		eventAction === "FINGERPRINT_ENROLLED" ||
		eventAction === "FINGERPRINT_UPDATED" ||
		eventAction === "FINGERPRINT_DELETED" ||
		eventAction === "CARD_ENROLLED" ||
		eventAction === "CARD_UPDATED" ||
		eventAction === "CARD_DELETED"
	) {
		return true;
	}
	return false;
};

export type FastEnrollmentIdentityResult = {
	ok: boolean;
	plainEmployeeNo: string | null;
	opaqueToken: string | null;
	deviceUserId: string | null;
	linkedEmployeeId: string | null;
	path:
		| "plain_immediate"
		| "opaque_mapped"
		| "pending_log_resolve"
		| "skipped";
	reason?: string;
};

/**
 * SDK enrollment / user-management callback fast path.
 *
 * Device truth:
 * - SDK ACS callback may carry plain dwEmployeeNo (device person id), empty, or later opaque log tokens.
 * - Plain device person id is NOT HRIS Employee.employeeId; HRIS link is DeviceUser / deviceEmpId map.
 * - Raw UserInfo metadata always belongs on DeviceUser (rawPayload + vendorMetadata), not only on DeviceEvent.
 *
 * Behavior:
 * 1) If plain employeeNo is already on the callback → stub DeviceUser + socket identity immediately,
 *    then pull full UserInfo onto DeviceUser.rawPayload/vendorMetadata and re-socket.
 * 2) If opaque token only → map via DevicePersonToken when known, then same as (1).
 * 3) If neither → caller keeps multipass logSearch resolve (not invented plain ids).
 */
export const applyFastEnrollmentIdentityOnSdkCallback = async (params: {
	prisma: PrismaClient | any;
	req: any;
	organizationId: string;
	deviceId: string;
	eventId: string;
	eventAction?: string | null;
	employeeNo?: string | null;
	opaqueToken?: string | null;
	displayName?: string | null;
	/** When true, always fire UserInfo enrich in background after stub. Default true. */
	enrichUserInfo?: boolean;
}): Promise<FastEnrollmentIdentityResult> => {
	const organizationId = String(params.organizationId || "").trim();
	const deviceId = String(params.deviceId || "").trim();
	const eventId = String(params.eventId || "").trim();
	if (!organizationId || !deviceId || !eventId) {
		return {
			ok: false,
			plainEmployeeNo: null,
			opaqueToken: null,
			deviceUserId: null,
			linkedEmployeeId: null,
			path: "skipped",
			reason: "missing_ids",
		};
	}

	let plain = String(params.employeeNo || "").trim() || null;
	let opaque = String(params.opaqueToken || "").trim() || null;
	let displayName = String(params.displayName || "").trim() || null;
	let path: FastEnrollmentIdentityResult["path"] = "pending_log_resolve";

	if (plain && isOpaqueHikvisionPersonToken(plain)) {
		opaque = opaque || plain;
		const mapped = await resolveDevicePersonToken(params.prisma, {
			organizationId,
			deviceId,
			opaqueToken: plain,
		}).catch(() => null);
		if (mapped?.employeeNo) {
			plain = mapped.employeeNo;
			if (mapped.displayName) displayName = mapped.displayName;
			path = "opaque_mapped";
		} else {
			plain = null;
		}
	} else if (plain) {
		path = "plain_immediate";
	}

	if (!plain && opaque && isOpaqueHikvisionPersonToken(opaque)) {
		const mapped = await resolveDevicePersonToken(params.prisma, {
			organizationId,
			deviceId,
			opaqueToken: opaque,
		}).catch(() => null);
		if (mapped?.employeeNo) {
			plain = mapped.employeeNo;
			if (mapped.displayName) displayName = mapped.displayName;
			path = "opaque_mapped";
		}
	}

	if (!plain) {
		return {
			ok: false,
			plainEmployeeNo: null,
			opaqueToken: opaque,
			deviceUserId: null,
			linkedEmployeeId: null,
			path: "pending_log_resolve",
			reason: "plain_employee_no_not_on_callback",
		};
	}

	// Immediate inventory + HRIS link (no device round-trip yet) so socket carries plain id now.
	const deviceUser = await upsertDeviceUserInventoryStub(params.prisma, {
		organizationId,
		deviceId,
		employeeNo: plain,
		displayName,
		opaqueToken: opaque,
	}).catch(() => null);

	const linkedEmployeeId = deviceUser?.employeeId
		? String(deviceUser.employeeId)
		: (
				await resolveLinkedEmployeeForDevicePerson(params.prisma, {
					organizationId,
					employeeNo: plain,
				}).catch(() => null)
			)?.id || null;

	if (!displayName && deviceUser?.displayName) {
		displayName = String(deviceUser.displayName);
	}

	const existingEvent = await params.prisma.deviceEvent.findUnique({
		where: { id: eventId },
		select: { id: true, payload: true, status: true, employeeNo: true },
	});
	if (!existingEvent) {
		return {
			ok: false,
			plainEmployeeNo: plain,
			opaqueToken: opaque,
			deviceUserId: deviceUser?.id || null,
			linkedEmployeeId,
			path,
			reason: "event_missing",
		};
	}

	const priorPayload = (existingEvent.payload as any) || {};
	const initialSnapshot = buildEnrollmentSnapshot({
		eventAction: params.eventAction,
		plainEmployeeNo: plain,
		displayName,
		opaqueToken: opaque,
		deviceUserId: deviceUser?.id || null,
		linkedEmployeeId,
		biometricTemplateStatus: "pending_plain_employee_no",
	});
	// Mark that UserInfo raw metadata is still loading onto DeviceUser.
	(initialSnapshot as any).biometricCustody = {
		...(initialSnapshot.biometricCustody as any),
		status: "userinfo_enrich_pending",
	};

	const updated = await params.prisma.deviceEvent.update({
		where: { id: eventId },
		data: {
			employeeNo: plain,
			employeeId: linkedEmployeeId || null,
			deviceUserId: deviceUser?.id || null,
			// Enrollment lifecycle is not attendance; still MATCHED/UNMATCHED for person truth.
			status: linkedEmployeeId ? "MATCHED" : "UNMATCHED",
			errorMessage: null,
			payload: {
				...priorPayload,
				personTokenResolved: Boolean(opaque),
				opaquePersonToken: opaque || priorPayload.opaquePersonToken || null,
				resolvedEmployeeNo: plain,
				resolvedDisplayName: displayName || priorPayload.resolvedDisplayName || null,
				fastEnrollmentIdentityPath: path,
				enrollmentSnapshot: initialSnapshot,
				enrollmentGoal: {
					employeeNo: plain,
					displayName,
					opaquePersonToken: opaque,
					deviceUserId: deviceUser?.id || null,
					rawTemplateOnDeviceEvent: false,
					fingerprintTemplateLocation: deviceUser?.id
						? `DeviceUser(${deviceUser.id}).vendorMetadata.biometricBundle`
						: "DeviceUser.vendorMetadata.biometricBundle (encrypted)",
				},
			},
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
		},
	});

	let employeeForSocket: any = null;
	if (linkedEmployeeId) {
		employeeForSocket = await params.prisma.employee
			.findUnique({
				where: { id: linkedEmployeeId },
				select: {
					id: true,
					employeeId: true,
					deviceEmpId: true,
					person: { select: { personalInfo: true } },
				},
			})
			.catch(() => null);
	}

	// First socket: plain device person id (+ HRIS when already linked) without waiting on UserInfo.
	emitDeviceEventSaved(params.req?.io, {
		...updated,
		employee: employeeForSocket,
	});

	// Sibling lifecycle rows (USER_CREATED / FINGERPRINT_ENROLLED) often land via logSearch
	// with opaque only after this SYNC_SIGNAL already has plain. Backfill them now.
	void backfillRecentLifecycleEventsWithPlain({
		prisma: params.prisma,
		req: params.req,
		organizationId,
		deviceId,
		plainEmployeeNo: plain,
		opaqueToken: opaque,
		displayName,
		deviceUserId: deviceUser?.id || null,
		excludeEventId: eventId,
		windowMs: 10 * 60_000,
		source: "SDK_FAST_IDENTITY_SIBLING_BACKFILL",
	}).catch((error: any) => {
		console.warn(
			"[device-person-token] sibling lifecycle plain backfill failed",
			eventId,
			error?.message || error,
		);
	});

	// Always attempt raw FP pull when plain person id is known (create/enroll/signal).
	// Operator goal: Device User details must show fingerData base64, not only numOfFP.
	scheduleRawFingerprintCaptureForEnrollment({
		prisma: params.prisma,
		req: params.req,
		organizationId,
		deviceId,
		eventId,
		employeeNo: plain,
		deviceUserId: deviceUser?.id || null,
	});

	// Second wave: full UserInfo raw metadata always lands on DeviceUser, then re-socket.
	if (params.enrichUserInfo !== false) {
		void enrichEnrollmentLifecycleEvent({
			prisma: params.prisma,
			req: params.req,
			organizationId,
			deviceId,
			eventId,
			eventAction: params.eventAction,
			plainEmployeeNo: plain,
			displayName,
			opaqueToken: opaque,
			linkedEmployeeId,
			deviceUserId: deviceUser?.id || null,
		}).catch((error: any) => {
			console.warn(
				"[device-person-token] fast enroll UserInfo enrich failed",
				eventId,
				error?.message || error,
			);
		});
	}

	return {
		ok: true,
		plainEmployeeNo: plain,
		opaqueToken: opaque,
		deviceUserId: deviceUser?.id || null,
		linkedEmployeeId,
		path,
	};
};

/**
 * Fire-and-forget wrapper for the callback controller.
 * Never blocks HTTP ack more than the immediate stub/socket path.
 */
export const scheduleFastEnrollmentIdentityOnSdkCallback = (params: {
	prisma: PrismaClient | any;
	req: any;
	organizationId: string;
	deviceId: string;
	eventId: string;
	eventAction?: string | null;
	employeeNo?: string | null;
	opaqueToken?: string | null;
	displayName?: string | null;
}): void => {
	void applyFastEnrollmentIdentityOnSdkCallback(params).catch((error: any) => {
		console.warn(
			"[device-person-token] fast enroll identity crashed",
			params.eventId,
			error?.message || error,
		);
	});
};
