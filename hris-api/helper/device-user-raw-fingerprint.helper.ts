/**
 * Raw Hikvision fingerprint templates on DeviceUser.
 *
 * Operator expectation (2026-07-19): on fingerprint enroll for plain person id
 * (e.g. "15"), HRIS must store the actual fingerData blobs on DeviceUser so
 * they are viewable and usable — NOT only encrypted envelopes or numOfFP counts.
 *
 * DeviceEvent keeps a pointer/summary only (no multi-KB fingerData on ledger).
 * DeviceUser.vendorMetadata.rawFingerprints holds the real base64 template data.
 */
import type { PrismaClient } from "../generated/prisma";
import { hikvisionFetch } from "../lib/hikvision-client";
import { emitDeviceEventSaved } from "./device-event-realtime.helper";
import { isOpaqueHikvisionPersonToken } from "./hikvision-event-contract.helper";

export const RAW_FINGERPRINT_SCHEMA = "project-truth.hikvision-fingerprint-raw.v1";

export type RawFingerprintTemplate = {
	fingerPrintId: number;
	fingerType: number | string | null;
	length: number;
	/** Base64 finger template bytes from device ISAPI (raw, not AES-wrapped). */
	data: string;
};

export type RawFingerprintCustody = {
	schema: typeof RAW_FINGERPRINT_SCHEMA;
	vendorUserId: string;
	fingerprints: RawFingerprintTemplate[];
	fingerprintCount: number;
	capturedAt: string;
	source: string;
	deviceId: string;
	/** True when at least one finger has non-empty data. */
	rawPresent: boolean;
	totalDataChars: number;
};

export const envBool = (name: string, defaultValue: boolean) => {
	const raw = String(process.env[name] || "").trim().toLowerCase();
	if (!raw) return defaultValue;
	if (["0", "false", "no", "off"].includes(raw)) return false;
	if (["1", "true", "yes", "on"].includes(raw)) return true;
	return defaultValue;
};

/** Default ON — operator wants raw templates on enroll. Set HIKVISION_ENROLL_RAW_FINGERPRINT=false to skip. */
export const isRawFingerprintEnrollCaptureEnabled = () =>
	envBool("HIKVISION_ENROLL_RAW_FINGERPRINT", true);

export const extractFingerDataFromIsapiNode = (node: any): string => {
	if (!node || typeof node !== "object") return "";
	const candidates = [
		node.fingerData,
		node.FingerData,
		node.fingerPrintData,
		node.templateData,
		node.byFingerData,
		node.data,
	];
	for (const c of candidates) {
		const text = String(c || "").trim();
		if (text.length >= 8) return text;
	}
	return "";
};

export const normalizeIsapiFingerprintList = (response: any): RawFingerprintTemplate[] => {
	// Proven TEST A 2026-07-19 shape:
	// { FingerPrintInfo: { status: "OK", FingerPrintList: [ { fingerPrintID, fingerType, fingerData } ] } }
	const roots = [
		response?.FingerPrintInfo?.FingerPrintList,
		response?.FingerPrintList,
		response?.FingerPrintInfo,
		response?.FingerPrintCfg,
		response?.FingerPrintUpload,
		response?.FingerPrint,
		response?.data?.FingerPrintInfo?.FingerPrintList,
		response?.data?.FingerPrintList,
		response,
	];
	const out: RawFingerprintTemplate[] = [];
	const seen = new Set<string>();

	const pushNode = (node: any) => {
		if (!node || typeof node !== "object") return;
		// Nested list container (e.g. FingerPrintInfo object itself).
		const nested =
			node.FingerPrintList ||
			node.FingerPrint ||
			node.FingerPrintCfg ||
			node.list ||
			node.MatchList;
		if (Array.isArray(nested)) {
			for (const item of nested) pushNode(item);
			return;
		}
		if (nested && typeof nested === "object" && extractFingerDataFromIsapiNode(nested)) {
			pushNode(nested);
			return;
		}
		const data = extractFingerDataFromIsapiNode(node);
		if (!data) return;
		const fingerPrintId = Number(
			node.fingerPrintID ?? node.fingerPrintId ?? node.FingerPrintID ?? out.length + 1,
		);
		const fingerType = node.fingerType ?? node.FingerType ?? null;
		const length = Number(node.fingerPrintLen ?? node.length ?? data.length) || data.length;
		const key = `${fingerPrintId}:${data.slice(0, 32)}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push({
			fingerPrintId: Number.isFinite(fingerPrintId) && fingerPrintId > 0 ? fingerPrintId : out.length + 1,
			fingerType,
			length,
			data,
		});
	};

	for (const root of roots) {
		if (!root) continue;
		if (Array.isArray(root)) {
			for (const item of root) pushNode(item);
			continue;
		}
		pushNode(root);
	}
	return out;
};

/**
 * Read fingerprint templates from device via ISAPI FingerPrintUpload (query shape).
 * Tries per-finger ids 1..maxFingerId plus a bulk-style cond when maxResults is accepted.
 */
export const fetchRawFingerprintsViaIsapi = async (params: {
	prisma: PrismaClient | any;
	req: any;
	deviceId: string;
	employeeNo: string;
	maxFingerId?: number;
	timeoutMs?: number;
}): Promise<{ fingerprints: RawFingerprintTemplate[]; attempts: number; lastError?: string }> => {
	const employeeNo = String(params.employeeNo || "").trim();
	if (!employeeNo || isOpaqueHikvisionPersonToken(employeeNo)) {
		return { fingerprints: [], attempts: 0, lastError: "invalid_employee_no" };
	}
	const maxFingerId = Math.min(Math.max(Number(params.maxFingerId) || 10, 1), 10);
	const timeoutMs = Number(params.timeoutMs) || 12_000;
	const collected: RawFingerprintTemplate[] = [];
	const seen = new Set<string>();
	let attempts = 0;
	let lastError: string | undefined;

	const merge = (list: RawFingerprintTemplate[]) => {
		for (const fp of list) {
			const key = `${fp.fingerPrintId}:${fp.data.slice(0, 48)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			collected.push(fp);
		}
	};

	// Bulk-style search first (some firmware returns FingerPrintList).
	try {
		attempts += 1;
		const bulk = await hikvisionFetch("/ISAPI/AccessControl/FingerPrintUpload?format=json", {
			method: "POST",
			deviceId: params.deviceId,
			prisma: params.prisma,
			request: params.req,
			timeoutMs,
			body: {
				FingerPrintCond: {
					searchID: `enroll-raw-fp-${Date.now()}`,
					searchResultPosition: 0,
					maxResults: 32,
					employeeNo,
					EmployeeNoList: [{ employeeNo }],
				},
			},
		});
		merge(normalizeIsapiFingerprintList(bulk));
	} catch (error: any) {
		lastError = String(error?.message || error || "bulk_isapi_failed");
	}

	if (collected.length > 0) {
		return { fingerprints: collected, attempts, lastError };
	}

	// Per-finger probe (common when bulk cond is ignored).
	for (let fingerPrintID = 1; fingerPrintID <= maxFingerId; fingerPrintID += 1) {
		try {
			attempts += 1;
			const one = await hikvisionFetch("/ISAPI/AccessControl/FingerPrintUpload?format=json", {
				method: "POST",
				deviceId: params.deviceId,
				prisma: params.prisma,
				request: params.req,
				timeoutMs,
				body: {
					FingerPrintCond: {
						searchID: `enroll-raw-fp-${employeeNo}-${fingerPrintID}-${Date.now()}`,
						employeeNo,
						cardReaderNo: 1,
						fingerPrintID,
					},
				},
			});
			merge(normalizeIsapiFingerprintList(one));
		} catch (error: any) {
			lastError = String(error?.message || error || `finger_${fingerPrintID}_failed`);
		}
	}

	return { fingerprints: collected, attempts, lastError };
};

export const buildRawFingerprintCustody = (params: {
	deviceId: string;
	vendorUserId: string;
	fingerprints: RawFingerprintTemplate[];
	source?: string;
}): RawFingerprintCustody => {
	const fingerprints = (params.fingerprints || []).filter((fp) => String(fp?.data || "").trim());
	const totalDataChars = fingerprints.reduce((sum, fp) => sum + String(fp.data || "").length, 0);
	return {
		schema: RAW_FINGERPRINT_SCHEMA,
		vendorUserId: params.vendorUserId,
		fingerprints,
		fingerprintCount: fingerprints.length,
		capturedAt: new Date().toISOString(),
		source: params.source || "isapi_FingerPrintUpload_on_enroll",
		deviceId: params.deviceId,
		rawPresent: fingerprints.length > 0 && totalDataChars > 0,
		totalDataChars,
	};
};

/** Merge raw fingerprint custody onto an in-memory DeviceUser row shape. */
export const applyRawFingerprintCustodyToRow = (row: any, custody: RawFingerprintCustody) => {
	const priorRaw = row?.rawPayload && typeof row.rawPayload === "object" ? row.rawPayload : {};
	const priorVendor =
		row?.vendorMetadata && typeof row.vendorMetadata === "object" ? row.vendorMetadata : {};
	const priorSummary =
		priorVendor.credentialSummary || priorRaw?._hrisDeviceMetadata?.credentialSummary || {};
	const fingerprintCount = Math.max(
		Number(priorSummary.fingerprintCount || 0) || 0,
		custody.fingerprintCount,
	);
	const credentialSummary = {
		...priorSummary,
		fingerprintCount,
		hasFingerprint: fingerprintCount > 0,
	};

	// Public raw plane — what the operator expects to open on Device User details.
	const rawFingerprints = {
		schema: custody.schema,
		present: custody.rawPresent,
		fingerprintCount: custody.fingerprintCount,
		totalDataChars: custody.totalDataChars,
		capturedAt: custody.capturedAt,
		source: custody.source,
		// Actual blobs (base64 fingerData).
		templates: custody.fingerprints,
	};

	row.rawPayload = {
		...priorRaw,
		_hrisDeviceMetadata: {
			...(priorRaw._hrisDeviceMetadata || {}),
			credentialSummary,
			rawFingerprints,
		},
	};
	row.vendorMetadata = {
		...priorVendor,
		credentialSummary,
		// Top-level for easy API/UI discovery.
		rawFingerprints,
		// Keep a short status flag for badges.
		rawFingerprintPresent: custody.rawPresent,
		rawFingerprintCount: custody.fingerprintCount,
		rawFingerprintCapturedAt: custody.capturedAt,
		rawFingerprintSource: custody.source,
	};
	return row;
};

export const persistRawFingerprintCustody = async (params: {
	prisma: PrismaClient | any;
	organizationId: string;
	deviceId: string;
	vendorUserId: string;
	row: any;
}) => {
	return params.prisma.deviceUser.update({
		where: {
			organizationId_deviceId_vendorUserId: {
				organizationId: params.organizationId,
				deviceId: params.deviceId,
				vendorUserId: params.vendorUserId,
			},
		},
		data: {
			rawPayload: params.row.rawPayload || {},
			vendorMetadata: params.row.vendorMetadata || {},
			lastSyncedAt: new Date(),
		},
		select: {
			id: true,
			vendorUserId: true,
			employeeNo: true,
			displayName: true,
			vendorMetadata: true,
			rawPayload: true,
			updatedAt: true,
		},
	});
};

/**
 * Capture raw fingerprint templates from the physical device and store them on DeviceUser.
 * Updates DeviceEvent enrollment snapshot with presence summary (not the raw blobs).
 */
export const captureRawFingerprintsForEnrollment = async (params: {
	prisma: PrismaClient | any;
	req: any;
	organizationId: string;
	deviceId: string;
	eventId?: string | null;
	employeeNo: string;
	deviceUserId?: string | null;
	/** Injectable for unit tests. */
	fetchFingerprints?: typeof fetchRawFingerprintsViaIsapi;
}): Promise<{
	ok: boolean;
	rawPresent: boolean;
	fingerprintCount: number;
	totalDataChars: number;
	deviceUserId: string | null;
	reason?: string;
	source?: string;
}> => {
	if (!isRawFingerprintEnrollCaptureEnabled()) {
		return {
			ok: false,
			rawPresent: false,
			fingerprintCount: 0,
			totalDataChars: 0,
			deviceUserId: params.deviceUserId || null,
			reason: "disabled_by_env",
		};
	}

	const organizationId = String(params.organizationId || "").trim();
	const deviceId = String(params.deviceId || "").trim();
	const employeeNo = String(params.employeeNo || "").trim();
	if (!organizationId || !deviceId || !employeeNo || isOpaqueHikvisionPersonToken(employeeNo)) {
		return {
			ok: false,
			rawPresent: false,
			fingerprintCount: 0,
			totalDataChars: 0,
			deviceUserId: params.deviceUserId || null,
			reason: "missing_ids_or_opaque",
		};
	}

	const fetchFn = params.fetchFingerprints || fetchRawFingerprintsViaIsapi;
	const { fingerprints, attempts, lastError } = await fetchFn({
		prisma: params.prisma,
		req: params.req,
		deviceId,
		employeeNo,
	});

	if (!fingerprints.length) {
		await patchEnrollmentEventRawStatus(params, {
			status: "raw_capture_failed",
			reason: lastError || "no_fingerprint_data_from_device",
			attempts,
			fingerprintCount: 0,
			totalDataChars: 0,
		}).catch(() => undefined);
		return {
			ok: false,
			rawPresent: false,
			fingerprintCount: 0,
			totalDataChars: 0,
			deviceUserId: params.deviceUserId || null,
			reason: lastError || "no_fingerprint_data_from_device",
		};
	}

	const custody = buildRawFingerprintCustody({
		deviceId,
		vendorUserId: employeeNo,
		fingerprints,
		source: "isapi_FingerPrintUpload_on_enroll",
	});

	let row =
		(await params.prisma.deviceUser.findFirst({
			where: {
				organizationId,
				deviceId,
				OR: [{ vendorUserId: employeeNo }, { employeeNo }],
			},
		})) || null;

	if (!row) {
		row = await params.prisma.deviceUser.create({
			data: {
				organizationId,
				deviceId,
				vendorUserId: employeeNo,
				employeeNo,
				status: "UNMATCHED",
				rawPayload: {},
				vendorMetadata: {},
				lastSyncedAt: new Date(),
			},
		});
	}

	applyRawFingerprintCustodyToRow(row, custody);
	const saved = await persistRawFingerprintCustody({
		prisma: params.prisma,
		organizationId,
		deviceId,
		vendorUserId: String(row.vendorUserId || employeeNo),
		row,
	});

	await patchEnrollmentEventRawStatus(params, {
		status: "raw_on_device_user",
		reason: null,
		attempts,
		fingerprintCount: custody.fingerprintCount,
		totalDataChars: custody.totalDataChars,
		deviceUserId: saved?.id || row.id,
		rawFingerprintLocation: `DeviceUser(${saved?.id || row.id}).vendorMetadata.rawFingerprints.templates[].data`,
	}).catch(() => undefined);

	return {
		ok: true,
		rawPresent: true,
		fingerprintCount: custody.fingerprintCount,
		totalDataChars: custody.totalDataChars,
		deviceUserId: saved?.id || row.id || null,
		source: custody.source,
	};
};

export const patchEnrollmentEventRawStatus = async (
	params: {
		prisma: PrismaClient | any;
		req: any;
		eventId?: string | null;
		deviceUserId?: string | null;
	},
	status: {
		status: string;
		reason: string | null;
		attempts: number;
		fingerprintCount: number;
		totalDataChars: number;
		deviceUserId?: string | null;
		rawFingerprintLocation?: string;
	},
) => {
	const eventId = String(params.eventId || "").trim();
	if (!eventId) return;

	const existing = await params.prisma.deviceEvent.findUnique({
		where: { id: eventId },
		select: { id: true, payload: true, deviceUserId: true, employeeId: true },
	});
	if (!existing) return;

	const prior = (existing.payload as any) || {};
	const priorSnap = prior.enrollmentSnapshot || {};
	const priorCustody = priorSnap.biometricCustody || {};
	const nextPayload = {
		...prior,
		rawFingerprintCustody: {
			status: status.status,
			reason: status.reason,
			attempts: status.attempts,
			fingerprintCount: status.fingerprintCount,
			totalDataChars: status.totalDataChars,
			rawPresent: status.status === "raw_on_device_user",
			// Blobs live on DeviceUser only.
			rawTemplateOnDeviceEvent: false,
			rawFingerprintLocation:
				status.rawFingerprintLocation ||
				"DeviceUser.vendorMetadata.rawFingerprints.templates[].data",
			updatedAt: new Date().toISOString(),
		},
		enrollmentSnapshot: {
			...priorSnap,
			biometricTemplateStatus:
				status.status === "raw_on_device_user" ? "raw_on_device_user" : status.status,
			biometricCustody: {
				...priorCustody,
				plane: "DEVICE_USER",
				templateStorage: "raw_base64_on_device_user",
				status: status.status,
				fingerprintCount: status.fingerprintCount,
				totalDataChars: status.totalDataChars,
				note: "Raw fingerData (base64) is stored on DeviceUser.vendorMetadata.rawFingerprints — not AES-wrapped, not on DeviceEvent.",
			},
		},
		enrollmentGoal: {
			...(prior.enrollmentGoal || {}),
			rawTemplateOnDeviceEvent: false,
			rawFingerprintPresent: status.status === "raw_on_device_user",
			rawFingerprintCount: status.fingerprintCount,
			fingerprintTemplateLocation:
				status.rawFingerprintLocation ||
				"DeviceUser.vendorMetadata.rawFingerprints.templates[].data",
		},
	};

	const updated = await params.prisma.deviceEvent.update({
		where: { id: eventId },
		data: {
			deviceUserId: status.deviceUserId || existing.deviceUserId || params.deviceUserId || null,
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

	emitDeviceEventSaved(params.req?.io, updated);
};

/**
 * Fire-and-forget after FINGERPRINT_ENROLLED (or any enroll path that needs raw templates).
 */
export const scheduleRawFingerprintCaptureForEnrollment = (params: {
	prisma: PrismaClient | any;
	req: any;
	organizationId: string;
	deviceId: string;
	eventId?: string | null;
	employeeNo: string;
	deviceUserId?: string | null;
}): void => {
	if (!isRawFingerprintEnrollCaptureEnabled()) return;
	const employeeNo = String(params.employeeNo || "").trim();
	if (!employeeNo || isOpaqueHikvisionPersonToken(employeeNo)) return;

	void captureRawFingerprintsForEnrollment(params)
		.then((result) => {
			if (result.ok) {
				console.log(
					`[raw-fingerprint] stored ${result.fingerprintCount} template(s) (${result.totalDataChars} chars) for ${employeeNo} device=${params.deviceId}`,
				);
			} else {
				console.warn(
					`[raw-fingerprint] capture failed for ${employeeNo} device=${params.deviceId}: ${result.reason}`,
				);
			}
		})
		.catch((error: any) => {
			console.warn(
				"[raw-fingerprint] capture crashed",
				params.deviceId,
				employeeNo,
				error?.message || error,
			);
		});
};

export const shouldCaptureRawFingerprintForEventAction = (eventAction?: string | null) => {
	const action = String(eventAction || "").trim().toUpperCase();
	return (
		action === "FINGERPRINT_ENROLLED" ||
		action === "FINGERPRINT_UPDATED" ||
		action === "USER_CREATED" ||
		action === "USER_UPDATED"
	);
};

/** Parse fingerprints array from C++ EN_HCNETSDK_ALARM callback body (raw base64). */
export const normalizeCallbackFingerprintArray = (raw: unknown): RawFingerprintTemplate[] => {
	let list: any[] = [];
	if (Array.isArray(raw)) list = raw;
	else if (typeof raw === "string" && raw.trim().startsWith("[")) {
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) list = parsed;
		} catch {
			list = [];
		}
	}
	const out: RawFingerprintTemplate[] = [];
	for (const node of list) {
		const data = extractFingerDataFromIsapiNode(node);
		if (!data) continue;
		const fingerPrintId = Number(node?.fingerPrintId ?? node?.fingerPrintID ?? out.length + 1);
		out.push({
			fingerPrintId: Number.isFinite(fingerPrintId) && fingerPrintId > 0 ? fingerPrintId : out.length + 1,
			fingerType: node?.fingerType ?? null,
			length: Number(node?.length ?? data.length) || data.length,
			data,
		});
	}
	return out;
};

/**
 * When C++ already attached raw templates on the callback, store them on DeviceUser
 * immediately (no second ISAPI round-trip). Prefer this over delayed ISAPI capture.
 */
export const persistRawFingerprintsFromSdkCallback = async (params: {
	prisma: PrismaClient | any;
	req?: any;
	organizationId: string;
	deviceId: string;
	employeeNo: string;
	deviceUserId?: string | null;
	eventId?: string | null;
	fingerprints: unknown;
	faceTemplate?: string | null;
	facePicture?: string | null;
	source?: string;
}): Promise<{
	ok: boolean;
	rawPresent: boolean;
	fingerprintCount: number;
	totalDataChars: number;
	deviceUserId: string | null;
	reason?: string;
}> => {
	const organizationId = String(params.organizationId || "").trim();
	const deviceId = String(params.deviceId || "").trim();
	const employeeNo = String(params.employeeNo || "").trim();
	const fingerprints = normalizeCallbackFingerprintArray(params.fingerprints);
	const faceTemplate = String(params.faceTemplate || "").trim();
	const facePicture = String(params.facePicture || "").trim();

	if (!organizationId || !deviceId || !employeeNo || isOpaqueHikvisionPersonToken(employeeNo)) {
		return {
			ok: false,
			rawPresent: false,
			fingerprintCount: 0,
			totalDataChars: 0,
			deviceUserId: params.deviceUserId || null,
			reason: "missing_ids_or_opaque",
		};
	}
	if (!fingerprints.length && !faceTemplate && !facePicture) {
		return {
			ok: false,
			rawPresent: false,
			fingerprintCount: 0,
			totalDataChars: 0,
			deviceUserId: params.deviceUserId || null,
			reason: "no_templates_on_callback",
		};
	}

	const custody = buildRawFingerprintCustody({
		deviceId,
		vendorUserId: employeeNo,
		fingerprints,
		source: params.source || "cpp_sdk_callback_raw",
	});

	let row =
		(await params.prisma.deviceUser.findFirst({
			where: {
				organizationId,
				deviceId,
				OR: [{ vendorUserId: employeeNo }, { employeeNo }],
			},
		})) || null;

	if (!row) {
		row = await params.prisma.deviceUser.create({
			data: {
				organizationId,
				deviceId,
				vendorUserId: employeeNo,
				employeeNo,
				status: "UNMATCHED",
				rawPayload: {},
				vendorMetadata: {},
				lastSyncedAt: new Date(),
			},
		});
	}

	applyRawFingerprintCustodyToRow(row, custody);
	// Optional face blobs on the same custody plane (raw base64, not AES).
	if (faceTemplate || facePicture) {
		const priorVendor = (row.vendorMetadata as any) || {};
		const priorRaw = (row.rawPayload as any) || {};
		row.vendorMetadata = {
			...priorVendor,
			rawFace: {
				present: true,
				faceTemplateChars: faceTemplate.length,
				facePictureChars: facePicture.length,
				faceTemplate: faceTemplate || null,
				facePicture: facePicture || null,
				capturedAt: new Date().toISOString(),
				source: params.source || "cpp_sdk_callback_raw",
			},
			rawFacePresent: true,
		};
		row.rawPayload = {
			...priorRaw,
			_hrisDeviceMetadata: {
				...(priorRaw._hrisDeviceMetadata || {}),
				rawFace: (row.vendorMetadata as any).rawFace,
			},
		};
	}

	const saved = await persistRawFingerprintCustody({
		prisma: params.prisma,
		organizationId,
		deviceId,
		vendorUserId: String(row.vendorUserId || employeeNo),
		row,
	});

	if (params.eventId) {
		await patchEnrollmentEventRawStatus(
			{
				prisma: params.prisma,
				req: params.req,
				eventId: params.eventId,
				deviceUserId: saved?.id || row.id,
			},
			{
				status: "raw_on_device_user",
				reason: null,
				attempts: 0,
				fingerprintCount: custody.fingerprintCount,
				totalDataChars: custody.totalDataChars,
				deviceUserId: saved?.id || row.id,
				rawFingerprintLocation: `DeviceUser(${saved?.id || row.id}).vendorMetadata.rawFingerprints.templates[].data`,
			},
		).catch(() => undefined);
	}

	return {
		ok: true,
		rawPresent: custody.rawPresent || Boolean(faceTemplate || facePicture),
		fingerprintCount: custody.fingerprintCount,
		totalDataChars: custody.totalDataChars,
		deviceUserId: saved?.id || row.id || null,
	};
};
