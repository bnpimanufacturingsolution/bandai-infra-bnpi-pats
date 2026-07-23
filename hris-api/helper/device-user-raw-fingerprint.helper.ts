/**
 * Raw Hikvision fingerprint templates on DeviceUser.
 *
 * Operator expectation (2026-07-19): on fingerprint enroll for plain person id
 * (e.g. "15"), HRIS must store the actual fingerData blobs on DeviceUser so
 * they are viewable and usable — NOT only encrypted envelopes or numOfFP counts.
 *
 * DeviceUser remains the inventory custody plane, while create/enroll DeviceEvent
 * payloads also keep the same usable base64 templates for a complete ledger journey.
 */
import type { PrismaClient } from "../generated/prisma";
import { hikvisionFetch, hikvisionFetchBinary } from "../lib/hikvision-client";
import { emitDeviceEventSaved } from "./device-event-realtime.helper";
import { isOpaqueHikvisionPersonToken } from "./hikvision-event-contract.helper";

export const RAW_FINGERPRINT_SCHEMA = "project-truth.hikvision-fingerprint-raw.v1";
export const RAW_FACE_SCHEMA = "project-truth.hikvision-face-raw.v1";

export type RawFaceBinaryClassification =
	| { ok: true; reason: null }
	| {
			ok: false;
			reason:
				| "face_image_not_found_on_device"
				| "face_image_unauthorized"
				| "face_binary_empty"
				| "face_binary_not_image";
	  };

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

/**
 * Legacy JS/ISAPI device pull after enroll identity.
 * Always enabled: when the C++ listener does not provide raw template bytes,
 * HRIS must still try the ISAPI fallback so environment defaults cannot
 * suppress biometric custody.
 */
export const isRawFingerprintEnrollCaptureEnabled = () => true;

export const markDeviceUserRawBiometricFailure = async (params: {
	prisma: PrismaClient | any;
	organizationId: string;
	deviceId: string;
	employeeNo: string;
	modality: "fingerprint" | "face";
	reason: string;
	diagnosticPath?: string | null;
	diagnosticStatus?: number | null;
	expectedCount?: number;
	attempts?: number;
}) => {
	const organizationId = String(params.organizationId || "").trim();
	const deviceId = String(params.deviceId || "").trim();
	const employeeNo = String(params.employeeNo || "").trim();
	const reason = String(params.reason || "raw_capture_failed").trim();
	if (!organizationId || !deviceId || !employeeNo || !reason) return null;
	const row = await params.prisma.deviceUser.findFirst({
		where: {
			organizationId,
			deviceId,
			OR: [{ vendorUserId: employeeNo }, { employeeNo }],
		},
		select: { id: true, vendorUserId: true, rawPayload: true, vendorMetadata: true },
	});
	if (!row) return null;
	const priorVendor = row.vendorMetadata && typeof row.vendorMetadata === "object" ? row.vendorMetadata : {};
	const priorRaw = row.rawPayload && typeof row.rawPayload === "object" ? row.rawPayload : {};
	const previousFailures =
		priorVendor.rawBiometricFailures && typeof priorVendor.rawBiometricFailures === "object"
			? priorVendor.rawBiometricFailures
			: {};
	const failure = {
		reason,
		status:
			reason === "no_fingerprint_data_from_device" ||
			reason === "no_face_on_device" ||
			reason === "face_image_not_found_on_device" ||
			reason === "face_image_unauthorized"
				? "stale_count_only"
				: "capture_failed",
		expectedCount: Math.max(Number(params.expectedCount || 0) || 0, 0),
		attempts: Math.max(Number(params.attempts || 0) || 0, 0),
		...(params.diagnosticPath ? { diagnosticPath: params.diagnosticPath } : {}),
		...(Number(params.diagnosticStatus || 0)
			? { diagnosticStatus: Number(params.diagnosticStatus || 0) }
			: {}),
		checkedAt: new Date().toISOString(),
		source: "live_device_raw_capture",
	};
	const rawBiometricFailures = {
		...previousFailures,
		[params.modality]: failure,
	};
	const rawMetadata = {
		...(priorRaw._hrisDeviceMetadata || {}),
		rawBiometricFailures,
	};
	return params.prisma.deviceUser.update({
		where: { id: row.id },
		data: {
			vendorMetadata: {
				...priorVendor,
				rawBiometricFailures,
			},
			rawPayload: {
				...priorRaw,
				_hrisDeviceMetadata: rawMetadata,
			},
			lastSyncedAt: new Date(),
		},
		select: { id: true, vendorUserId: true, vendorMetadata: true, rawPayload: true },
	});
};

const bufferPreviewText = (buffer?: Buffer | Uint8Array | string | null) => {
	if (!buffer) return "";
	if (typeof buffer === "string") return buffer.slice(0, 1024);
	return Buffer.from(buffer).toString("utf8", 0, Math.min(buffer.length, 1024));
};

export const classifyHikvisionRawFaceBinaryResponse = (params: {
	buffer?: Buffer | Uint8Array | string | null;
	contentType?: string | null;
	status?: number | null;
}): RawFaceBinaryClassification => {
	const contentType = String(params.contentType || "").toLowerCase();
	const status = Number(params.status || 0) || 0;
	const preview = bufferPreviewText(params.buffer).trim().toLowerCase();

	if (status === 401 || preview.includes("<statusvalue>401</statusvalue>") || preview.includes("unauthorized")) {
		return { ok: false, reason: "face_image_unauthorized" };
	}
	if (
		status === 404 ||
		preview.includes("404 -- not found") ||
		preview.includes("can't locate document") ||
		preview.includes("cant locate document")
	) {
		return { ok: false, reason: "face_image_not_found_on_device" };
	}
	if (!params.buffer || (typeof params.buffer !== "string" && params.buffer.length < 32)) {
		return { ok: false, reason: "face_binary_empty" };
	}
	if (
		contentType.includes("text/html") ||
		contentType.includes("text/xml") ||
		contentType.includes("application/xml") ||
		preview.startsWith("<!doctype html") ||
		preview.startsWith("<html") ||
		preview.startsWith("<?xml")
	) {
		return { ok: false, reason: "face_binary_not_image" };
	}
	return { ok: true, reason: null };
};

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
		response?.templates,
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

const mergeRawFingerprintTemplates = (
	...lists: Array<RawFingerprintTemplate[] | null | undefined>
): RawFingerprintTemplate[] => {
	const out: RawFingerprintTemplate[] = [];
	const seen = new Set<string>();
	for (const list of lists) {
		for (const fp of list || []) {
			const data = String(fp?.data || "").trim();
			if (!data) continue;
			const fingerPrintId = Number(fp.fingerPrintId || out.length + 1);
			const key = `${Number.isFinite(fingerPrintId) && fingerPrintId > 0 ? fingerPrintId : out.length + 1}:${data.slice(0, 48)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push({
				fingerPrintId:
					Number.isFinite(fingerPrintId) && fingerPrintId > 0
						? fingerPrintId
						: out.length + 1,
				fingerType: fp.fingerType ?? null,
				length: Number(fp.length || data.length) || data.length,
				data,
			});
		}
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
	expectedFingerprintCount?: number;
	timeoutMs?: number;
}): Promise<{ fingerprints: RawFingerprintTemplate[]; attempts: number; lastError?: string }> => {
	const employeeNo = String(params.employeeNo || "").trim();
	if (!employeeNo || isOpaqueHikvisionPersonToken(employeeNo)) {
		return { fingerprints: [], attempts: 0, lastError: "invalid_employee_no" };
	}
	const maxFingerId = Math.min(Math.max(Number(params.maxFingerId) || 10, 1), 10);
	const expectedFingerprintCount = Math.min(
		Math.max(Number(params.expectedFingerprintCount || 0) || 0, 0),
		maxFingerId,
	);
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

	if (collected.length > 0 && (!expectedFingerprintCount || collected.length >= expectedFingerprintCount)) {
		return { fingerprints: collected, attempts, lastError };
	}

	// Per-finger probe (common when bulk cond is ignored or returns only one
	// template while UserInfo reports multiple enrolled fingers).
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

/**
 * Poll ISAPI FingerPrintProgress after FingerPrintDownload.
 * Live TEST A (2026-07-19): Download can return statusString=OK while async reader fails.
 * cardReaderRecvStatus=6 → applied; 5 → failed (errorMsg often donor employeeNo when clone rejected).
 * HTTP OK alone is NOT device enrollment truth.
 */
export type FingerPrintWriteProgress = {
	ok: boolean;
	cardReaderRecvStatus: number | null;
	errorMsg: string | null;
	totalStatus: number | null;
	raw: any;
	reason: string;
};

export const parseFingerPrintProgress = (response: any): FingerPrintWriteProgress => {
	const statusList =
		response?.FingerPrintStatus?.StatusList ||
		response?.FingerPrintProgress?.StatusList ||
		response?.StatusList ||
		[];
	const first = Array.isArray(statusList) ? statusList[0] : statusList;
	const cardReaderRecvStatus = first
		? Number(first.cardReaderRecvStatus ?? first.status ?? NaN)
		: NaN;
	const errorMsg =
		first?.errorMsg != null
			? String(first.errorMsg)
			: first?.errorCode != null
				? String(first.errorCode)
				: null;
	const totalStatus =
		response?.FingerPrintStatus?.totalStatus != null
			? Number(response.FingerPrintStatus.totalStatus)
			: null;
	const statusNum = Number.isFinite(cardReaderRecvStatus) ? cardReaderRecvStatus : null;
	// Device family evidence: 6 = success path on rewrite of existing person template.
	if (statusNum === 6) {
		return {
			ok: true,
			cardReaderRecvStatus: statusNum,
			errorMsg,
			totalStatus,
			raw: response,
			reason: "card_reader_recv_status_6_ok",
		};
	}
	if (statusNum === 5) {
		return {
			ok: false,
			cardReaderRecvStatus: statusNum,
			errorMsg,
			totalStatus,
			raw: response,
			reason: errorMsg
				? `card_reader_recv_status_5_fail_errorMsg=${errorMsg}`
				: "card_reader_recv_status_5_fail",
		};
	}
	return {
		ok: false,
		cardReaderRecvStatus: statusNum,
		errorMsg,
		totalStatus,
		raw: response,
		reason:
			statusNum == null
				? "progress_status_missing"
				: `card_reader_recv_status_${statusNum}_unknown`,
	};
};

export const pollFingerPrintWriteProgress = async (params: {
	prisma: PrismaClient | any;
	req: any;
	deviceId: string;
	timeoutMs?: number;
	attempts?: number;
	delayMs?: number;
}): Promise<FingerPrintWriteProgress> => {
	const attempts = Math.min(Math.max(Number(params.attempts) || 6, 1), 12);
	const delayMs = Math.min(Math.max(Number(params.delayMs) || 500, 100), 5000);
	const timeoutMs = Number(params.timeoutMs) || 10_000;
	let last: FingerPrintWriteProgress = {
		ok: false,
		cardReaderRecvStatus: null,
		errorMsg: null,
		totalStatus: null,
		raw: null,
		reason: "no_progress_polls",
	};
	for (let i = 0; i < attempts; i += 1) {
		if (i > 0) {
			await new Promise((r) => setTimeout(r, delayMs * i));
		}
		try {
			const raw = await hikvisionFetch(
				"/ISAPI/AccessControl/FingerPrintProgress?format=json",
				{
					method: "GET",
					deviceId: params.deviceId,
					prisma: params.prisma,
					request: params.req,
					timeoutMs,
				},
			);
			last = parseFingerPrintProgress(raw);
			if (last.cardReaderRecvStatus === 6 || last.cardReaderRecvStatus === 5) {
				return last;
			}
		} catch (error: any) {
			last = {
				ok: false,
				cardReaderRecvStatus: null,
				errorMsg: String(error?.message || error || "progress_fetch_failed"),
				totalStatus: null,
				raw: null,
				reason: "progress_fetch_failed",
			};
		}
	}
	return last;
};

export const classifyDeferredFingerprintWrite = (
	writeOk: boolean,
	progress: FingerPrintWriteProgress,
): { acceptedForGroupReread: boolean; source: string } => {
	const explicitlyRejected = progress.cardReaderRecvStatus === 5;
	const acceptedForGroupReread = writeOk && !explicitlyRejected;
	return {
		acceptedForGroupReread,
		source: !writeOk
			? "device_fp_write_failed"
			: explicitlyRejected
				? `device_fp_write_rejected_progress5:${progress.errorMsg || "unknown"}`
				: progress.cardReaderRecvStatus === 6
					? "device_fp_progress_verified_deferred_to_group_userinfo_reread"
					: "device_fp_progress_bounded_deferred_to_group_userinfo_reread",
	};
};

/**
 * Write fingerprint via FingerPrintDownload then verify Progress + re-read Upload.
 * Returns sticky=true only when device re-read yields fingerData for that employeeNo.
 * Never treats HTTP OK alone as enrolled.
 */
export const writeAndVerifyFingerprintOnDevice = async (params: {
	prisma: PrismaClient | any;
	req: any;
	deviceId: string;
	employeeNo: string;
	fingerData: string;
	fingerPrintID?: number;
	fingerType?: string | number;
	enableCardReader?: number[];
	cardNo?: string;
	deferRereadVerification?: boolean;
}): Promise<{
	writeOk: boolean;
	writeResponse: any;
	progress: FingerPrintWriteProgress;
	sticky: boolean;
	numOfFP: number;
	fingerprints: RawFingerprintTemplate[];
	source: string;
}> => {
	const employeeNo = String(params.employeeNo || "").trim();
	const fingerData = String(params.fingerData || "").trim();
	const fingerPrintID = Number(params.fingerPrintID || 1) || 1;
	const fingerType = params.fingerType != null ? params.fingerType : "normalFP";
	const enableCardReader = params.enableCardReader || [1];
	const cfg: Record<string, unknown> = {
		employeeNo,
		enableCardReader,
		fingerPrintID,
		fingerType,
		fingerData,
	};
	if (params.cardNo) cfg.cardNo = params.cardNo;

	let writeResponse: any = null;
	let writeOk = false;
	try {
		writeResponse = await hikvisionFetch(
			"/ISAPI/AccessControl/FingerPrintDownload?format=json",
			{
				method: "POST",
				deviceId: params.deviceId,
				prisma: params.prisma,
				request: params.req,
				timeoutMs: 25_000,
				body: { FingerPrintCfg: cfg },
			},
		);
		writeOk =
			Number(writeResponse?.statusCode) === 1 ||
			String(writeResponse?.statusString || "").toUpperCase() === "OK" ||
			String(writeResponse?.subStatusCode || "").toLowerCase() === "ok";
	} catch (error: any) {
		writeResponse = { error: String(error?.message || error) };
		writeOk = false;
	}

	if (params.deferRereadVerification) {
		// Defer only the expensive raw-template/UserInfo reread. The device handles
		// FingerPrintDownload asynchronously, so the next slot must not be posted
		// until this slot reaches a terminal progress state (or the bounded poll
		// window expires). Skipping this wait caused the second template in a
		// two-fingerprint bundle to be rejected while slot one was still applying.
		const progress = await pollFingerPrintWriteProgress({
			prisma: params.prisma,
			req: params.req,
			deviceId: params.deviceId,
		});
		const deferred = classifyDeferredFingerprintWrite(writeOk, progress);
		return {
			writeOk,
			writeResponse,
			progress,
			// The credential merge performs one authoritative UserInfo reread after
			// every slot in this exact person's bundle has been submitted. Progress
			// polling serializes the device writes; the group reread remains the
			// authoritative physical-count gate.
			sticky: deferred.acceptedForGroupReread,
			numOfFP: 0,
			fingerprints: [],
			source: deferred.source,
		};
	}
	const progress = await pollFingerPrintWriteProgress({
		prisma: params.prisma,
		req: params.req,
		deviceId: params.deviceId,
	});

	// Re-read device templates for THIS person only (never promote donor).
	let fingerprints: RawFingerprintTemplate[] = [];
	let numOfFP = 0;
	const delays = [500, 1500, 3000, 5000];
	for (const d of delays) {
		await new Promise((r) => setTimeout(r, d));
		const fetched = await fetchRawFingerprintsViaIsapi({
			prisma: params.prisma,
			req: params.req,
			deviceId: params.deviceId,
			employeeNo,
			maxFingerId: fingerPrintID,
			expectedFingerprintCount: fingerPrintID,
		});
		fingerprints = fetched.fingerprints;
		try {
			const ui = await hikvisionFetch(
				"/ISAPI/AccessControl/UserInfo/Search?format=json",
				{
					method: "POST",
					deviceId: params.deviceId,
					prisma: params.prisma,
					request: params.req,
					timeoutMs: 12_000,
					body: {
						UserInfoSearchCond: {
							searchID: `fp-verify-${Date.now()}`,
							searchResultPosition: 0,
							maxResults: 2,
							EmployeeNoList: [{ employeeNo }],
						},
					},
				},
			);
			const uu = Array.isArray(ui?.UserInfoSearch?.UserInfo)
				? ui.UserInfoSearch.UserInfo[0]
				: ui?.UserInfoSearch?.UserInfo;
			numOfFP = Number(uu?.numOfFP || 0) || 0;
		} catch {
			/* keep */
		}
		if (
			fingerprints.some(
				(fingerprint) => Number(fingerprint.fingerPrintId) === fingerPrintID,
			) ||
			numOfFP >= fingerPrintID
		) {
			break;
		}
	}

	const sticky =
		fingerprints.some(
			(fingerprint) => Number(fingerprint.fingerPrintId) === fingerPrintID,
		) || numOfFP >= fingerPrintID;
	const source = sticky
		? "device_fp_read_after_write_verified"
		: progress.cardReaderRecvStatus === 5
			? `device_fp_write_rejected_progress5:${progress.errorMsg || "unknown"}`
			: writeOk
				? "device_fp_write_http_ok_reread_empty"
				: "device_fp_write_failed";

	return {
		writeOk,
		writeResponse,
		progress,
		sticky,
		numOfFP,
		fingerprints,
		source,
	};
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
	const priorFailures =
		priorVendor.rawBiometricFailures && typeof priorVendor.rawBiometricFailures === "object"
			? priorVendor.rawBiometricFailures
			: {};
	const { fingerprint: _fingerprintFailure, ...remainingFailures } = priorFailures;

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
		rawBiometricFailures: remainingFailures,
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
 * Updates create/enroll DeviceEvent payloads with the same evidenced usable blobs.
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
	face?: unknown;
}> => {
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

	let row =
		(await params.prisma.deviceUser.findFirst({
			where: {
				organizationId,
				deviceId,
				OR: [{ vendorUserId: employeeNo }, { employeeNo }],
			},
		})) || null;
	const priorRaw = row?.rawPayload && typeof row.rawPayload === "object" ? row.rawPayload : {};
	const priorVendor =
		row?.vendorMetadata && typeof row.vendorMetadata === "object" ? row.vendorMetadata : {};
	const priorSummary =
		priorVendor.credentialSummary || priorRaw?._hrisDeviceMetadata?.credentialSummary || {};
	const expectedFingerprintCount = Math.max(
		Number(priorSummary.fingerprintCount || 0) || 0,
		0,
	);
	const priorFingerprints = mergeRawFingerprintTemplates(
		normalizeIsapiFingerprintList(priorVendor.rawFingerprints),
		normalizeIsapiFingerprintList(priorRaw?._hrisDeviceMetadata?.rawFingerprints),
	);
	const fetchFn = params.fetchFingerprints || fetchRawFingerprintsViaIsapi;
	const { fingerprints, attempts, lastError } = await fetchFn({
		prisma: params.prisma,
		req: params.req,
		deviceId,
		employeeNo,
		expectedFingerprintCount,
	});
	const mergedFingerprints = mergeRawFingerprintTemplates(priorFingerprints, fingerprints);

	if (!mergedFingerprints.length) {
		await markDeviceUserRawBiometricFailure({
			prisma: params.prisma,
			organizationId,
			deviceId,
			employeeNo,
			modality: "fingerprint",
			reason: lastError || "no_fingerprint_data_from_device",
			expectedCount: expectedFingerprintCount,
			attempts,
		}).catch(() => undefined);
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
		fingerprints: mergedFingerprints,
		source: "isapi_FingerPrintUpload_on_enroll",
	});

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

	// Best-effort face picture when device has faceURL (does not invent face).
	const face = await captureRawFaceForEnrollment({
		prisma: params.prisma,
		req: params.req,
		organizationId,
		deviceId,
		employeeNo,
		deviceUserId: saved?.id || row.id || null,
	}).catch((error: any) => ({
		ok: false,
		present: false,
		reason: String(error?.message || error || "face_capture_failed"),
	}));

	// Re-read DeviceUser for face custody after face capture.
	const withFace = await params.prisma.deviceUser
		.findUnique({
			where: { id: saved?.id || row.id },
			select: { id: true, vendorMetadata: true },
		})
		.catch(() => null);
	const rawFaceMeta = (withFace?.vendorMetadata as any)?.rawFace || null;

	// Primary event (if provided)
	if (params.eventId) {
		await patchEnrollmentEventRawStatus(
			{
				prisma: params.prisma,
				req: params.req,
				eventId: params.eventId,
				deviceUserId: saved?.id || row.id,
				custody,
				rawFace: rawFaceMeta,
				employeeNo,
			},
			{
				status: "raw_on_event_and_device_user",
				reason: null,
				attempts,
				fingerprintCount: custody.fingerprintCount,
				totalDataChars: custody.totalDataChars,
				deviceUserId: saved?.id || row.id,
				rawFingerprintLocation: `DeviceEvent.payload.rawFingerprints + DeviceUser(${saved?.id || row.id}).vendorMetadata.rawFingerprints`,
			},
		).catch(() => undefined);
	}

	// Also stamp recent create/enroll ledger rows for this person (operator journey).
	await attachRawToRecentLifecycleEventsForPerson({
		prisma: params.prisma,
		req: params.req,
		organizationId,
		deviceId,
		employeeNo,
		deviceUserId: saved?.id || row.id || null,
		custody,
		rawFace: rawFaceMeta,
		excludeEventId: params.eventId || null,
	}).catch(() => undefined);

	return {
		ok: true,
		rawPresent: true,
		fingerprintCount: custody.fingerprintCount,
		totalDataChars: custody.totalDataChars,
		deviceUserId: saved?.id || row.id || null,
		source: custody.source,
		face,
	};
};

/** Stamp raw FP/face onto recent USER_CREATED / FINGERPRINT_ENROLLED rows for plain person. */
export const attachRawToRecentLifecycleEventsForPerson = async (params: {
	prisma: PrismaClient | any;
	req?: any;
	organizationId: string;
	deviceId: string;
	employeeNo: string;
	deviceUserId?: string | null;
	custody: RawFingerprintCustody;
	rawFace?: any | null;
	excludeEventId?: string | null;
	windowMs?: number;
}): Promise<number> => {
	const organizationId = String(params.organizationId || "").trim();
	const deviceId = String(params.deviceId || "").trim();
	const employeeNo = String(params.employeeNo || "").trim();
	if (!organizationId || !deviceId || !employeeNo) return 0;
	const windowMs = Math.min(Math.max(Number(params.windowMs) || 30 * 60_000, 60_000), 2 * 60 * 60_000);
	const rows = await params.prisma.deviceEvent.findMany({
		where: {
			organizationId,
			deviceId,
			employeeNo,
			eventAction: {
				in: [
					"USER_CREATED",
					"USER_UPDATED",
					"FINGERPRINT_ENROLLED",
					"FINGERPRINT_UPDATED",
					"CARD_ENROLLED",
				],
			},
			receivedAt: { gte: new Date(Date.now() - windowMs) },
			...(params.excludeEventId ? { id: { not: String(params.excludeEventId) } } : {}),
		},
		select: { id: true },
		orderBy: { receivedAt: "desc" },
		take: 20,
	});
	let n = 0;
	for (const row of rows) {
		const ok = await attachRawBiometricsToDeviceEventPayload({
			prisma: params.prisma,
			req: params.req,
			eventId: row.id,
			deviceUserId: params.deviceUserId || null,
			employeeNo,
			custody: params.custody,
			rawFace: params.rawFace || null,
			source: params.custody.source,
		});
		if (ok) n += 1;
	}
	return n;
};

/**
 * Pull face photo from UserInfo faceURL (ISAPI binary) onto DeviceUser.vendorMetadata.rawFace.
 * Returns ok=false with reason when device has no face — do not invent.
 */
export const captureRawFaceForEnrollment = async (params: {
	prisma: PrismaClient | any;
	req: any;
	organizationId: string;
	deviceId: string;
	employeeNo: string;
	deviceUserId?: string | null;
}): Promise<{
	ok: boolean;
	present: boolean;
	byteLength?: number;
	base64Length?: number;
	contentType?: string;
	reason?: string;
	deviceUserId?: string | null;
}> => {
	const organizationId = String(params.organizationId || "").trim();
	const deviceId = String(params.deviceId || "").trim();
	const employeeNo = String(params.employeeNo || "").trim();
	if (!organizationId || !deviceId || !employeeNo || isOpaqueHikvisionPersonToken(employeeNo)) {
		return {
			ok: false,
			present: false,
			reason: "missing_ids_or_opaque",
			deviceUserId: params.deviceUserId || null,
		};
	}

	let faceURL = "";
	let userInfoNode: any = null;
	try {
		const ui = await hikvisionFetch("/ISAPI/AccessControl/UserInfo/Search?format=json", {
			method: "POST",
			deviceId,
			prisma: params.prisma,
			request: params.req,
			timeoutMs: 15_000,
			body: {
				UserInfoSearchCond: {
					searchID: `raw-face-${Date.now()}`,
					searchResultPosition: 0,
					maxResults: 2,
					EmployeeNoList: [{ employeeNo }],
				},
			},
		});
		userInfoNode = Array.isArray(ui?.UserInfoSearch?.UserInfo)
			? ui.UserInfoSearch.UserInfo[0]
			: ui?.UserInfoSearch?.UserInfo;
		faceURL = String(userInfoNode?.faceURL || "").trim();
		const numOfFace = Number(userInfoNode?.numOfFace || 0) || 0;
		if (!faceURL || numOfFace < 1) {
			await markDeviceUserRawBiometricFailure({
				prisma: params.prisma,
				organizationId,
				deviceId,
				employeeNo,
				modality: "face",
				reason: "no_face_on_device",
				expectedCount: numOfFace,
				attempts: 1,
			}).catch(() => undefined);
			return {
				ok: false,
				present: false,
				reason: "no_face_on_device",
				deviceUserId: params.deviceUserId || null,
			};
		}
	} catch (error: any) {
		await markDeviceUserRawBiometricFailure({
			prisma: params.prisma,
			organizationId,
			deviceId,
			employeeNo,
			modality: "face",
			reason: String(error?.message || error || "userinfo_face_lookup_failed"),
			attempts: 1,
		}).catch(() => undefined);
		return {
			ok: false,
			present: false,
			reason: String(error?.message || error || "userinfo_face_lookup_failed"),
			deviceUserId: params.deviceUserId || null,
		};
	}

	let picPath = faceURL;
	try {
		const u = new URL(faceURL);
		picPath = `${u.pathname}${u.search}`;
	} catch {
		/* relative path ok */
	}

	let buf: Buffer;
	let contentType = "image/jpeg";
	try {
		const binary = await hikvisionFetchBinary(picPath, {
			method: "GET",
			deviceId,
			prisma: params.prisma,
			request: params.req,
			timeoutMs: 20_000,
		});
		const raw =
			Buffer.isBuffer(binary)
				? binary
				: Buffer.isBuffer((binary as any)?.buffer)
					? (binary as any).buffer
					: Buffer.isBuffer((binary as any)?.data)
						? (binary as any).data
						: Buffer.from(
								(binary as any)?.body ||
									(binary as any)?.data ||
									(binary as any) ||
									[],
		);
		contentType = String(
			(binary as any)?.contentType ||
				(binary as any)?.headers?.["content-type"] ||
				"image/jpeg",
		);
		const classification = classifyHikvisionRawFaceBinaryResponse({
			buffer: raw,
			contentType,
			status: (binary as any)?.status,
		});
		if (!classification.ok) {
			await markDeviceUserRawBiometricFailure({
				prisma: params.prisma,
				organizationId,
				deviceId,
				employeeNo,
				modality: "face",
				reason: classification.reason,
				diagnosticPath: picPath,
				diagnosticStatus: (binary as any)?.status,
				attempts: 1,
			}).catch(() => undefined);
			return {
				ok: false,
				present: false,
				reason: classification.reason,
				deviceUserId: params.deviceUserId || null,
			};
		}
		buf = raw;
	} catch (error: any) {
		const classification = classifyHikvisionRawFaceBinaryResponse({
			buffer: String(error?.message || error || ""),
			status: error?.status,
		});
		const reason = classification.ok ? "face_binary_fetch_failed" : classification.reason;
		await markDeviceUserRawBiometricFailure({
			prisma: params.prisma,
			organizationId,
			deviceId,
			employeeNo,
			modality: "face",
			reason,
			diagnosticPath: picPath,
			diagnosticStatus: error?.status,
			attempts: 1,
		}).catch(() => undefined);
		return {
			ok: false,
			present: false,
			reason,
			deviceUserId: params.deviceUserId || null,
		};
	}

	const b64 = buf.toString("base64");
	const rawFace = {
		schema: RAW_FACE_SCHEMA,
		present: b64.length > 32,
		capturedAt: new Date().toISOString(),
		source: "isapi_faceURL_download",
		contentType,
		byteLength: buf.length,
		base64: b64,
		faceURL,
	};

	const row =
		(await params.prisma.deviceUser.findFirst({
			where: {
				organizationId,
				deviceId,
				OR: [{ vendorUserId: employeeNo }, { employeeNo }],
			},
		})) || null;
	if (!row) {
		return {
			ok: false,
			present: false,
			reason: "device_user_missing",
			deviceUserId: params.deviceUserId || null,
		};
	}

	const priorVm = (row.vendorMetadata as any) || {};
	const priorRaw = (row.rawPayload as any) || {};
	const credentialSummary = {
		...(priorVm.credentialSummary || {}),
		hasFace: true,
		faceCount: Math.max(Number(priorVm.credentialSummary?.faceCount || 0) || 0, 1),
	};
	const priorFailures =
		priorVm.rawBiometricFailures && typeof priorVm.rawBiometricFailures === "object"
			? priorVm.rawBiometricFailures
			: {};
	const { face: _faceFailure, ...remainingFailures } = priorFailures;
	const vendorMetadata = {
		...priorVm,
		rawFace,
		rawFacePresent: true,
		credentialSummary,
		rawBiometricFailures: remainingFailures,
	};
	const rawPayload = {
		...priorRaw,
		...(userInfoNode || {}),
		faceURL,
		_hrisDeviceMetadata: {
			...(priorRaw._hrisDeviceMetadata || {}),
			rawFace,
			credentialSummary,
			rawBiometricFailures: remainingFailures,
		},
	};

	const updated = await params.prisma.deviceUser.update({
		where: { id: row.id },
		data: {
			vendorMetadata,
			rawPayload,
			lastSyncedAt: new Date(),
		},
		select: { id: true },
	});

	return {
		ok: true,
		present: true,
		byteLength: buf.length,
		base64Length: b64.length,
		contentType,
		deviceUserId: updated.id,
	};
};

/**
 * Write raw biometric custody onto a DeviceEvent payload (operator wants blobs
 * visible on create/enroll ledger rows too, not only DeviceUser).
 * Also keeps DeviceUser as inventory plane.
 */
export const attachRawBiometricsToDeviceEventPayload = async (params: {
	prisma: PrismaClient | any;
	req?: any;
	eventId: string;
	deviceUserId?: string | null;
	employeeNo?: string | null;
	custody?: RawFingerprintCustody | null;
	rawFace?: any | null;
	source?: string;
}): Promise<boolean> => {
	const eventId = String(params.eventId || "").trim();
	if (!eventId) return false;
	const existing = await params.prisma.deviceEvent.findUnique({
		where: { id: eventId },
		select: {
			id: true,
			payload: true,
			deviceUserId: true,
			employeeNo: true,
			employeeId: true,
			eventAction: true,
		},
	});
	if (!existing) return false;

	const prior = (existing.payload as any) || {};
	const priorSnap = prior.enrollmentSnapshot || {};
	const priorCustody = priorSnap.biometricCustody || {};
	const custody = params.custody || null;
	const rawFace = params.rawFace || null;
	const fingerprintCount = custody?.fingerprintCount || 0;
	const totalDataChars = custody?.totalDataChars || 0;
	const rawPresent = Boolean(custody?.rawPresent && fingerprintCount > 0);
	const facePresent = Boolean(
		rawFace?.present ||
			String(rawFace?.base64 || rawFace?.facePicture || rawFace?.faceTemplate || "").length >
				32,
	);

	const nextPayload = {
		...prior,
		// Full usable blobs on the event ledger for create/enroll journey (operator 2026-07-19).
		rawFingerprints: custody
			? {
					schema: custody.schema,
					present: rawPresent,
					fingerprintCount,
					totalDataChars,
					capturedAt: custody.capturedAt,
					source: custody.source || params.source || "raw_capture",
					deviceUserId: params.deviceUserId || existing.deviceUserId || null,
					// Actual base64 fingerData templates (same as DeviceUser plane).
					templates: custody.fingerprints || [],
				}
			: prior.rawFingerprints || null,
		rawFace: facePresent
			? {
					present: true,
					schema: rawFace?.schema || RAW_FACE_SCHEMA,
					contentType: rawFace?.contentType || "image/jpeg",
					byteLength: rawFace?.byteLength || null,
					base64: rawFace?.base64 || rawFace?.facePicture || null,
					faceTemplate: rawFace?.faceTemplate || null,
					faceURL: rawFace?.faceURL || null,
					capturedAt: rawFace?.capturedAt || new Date().toISOString(),
					source: rawFace?.source || params.source || "raw_capture",
					deviceUserId: params.deviceUserId || existing.deviceUserId || null,
				}
			: prior.rawFace || null,
		rawFingerprintCustody: {
			status: rawPresent ? "raw_on_event_and_device_user" : priorCustody.status || "pending",
			reason: null,
			attempts: priorCustody.attempts || 0,
			fingerprintCount,
			totalDataChars,
			rawPresent,
			rawTemplateOnDeviceEvent: rawPresent,
			rawFaceOnDeviceEvent: facePresent,
			plane: "DEVICE_EVENT_AND_DEVICE_USER",
			location: params.deviceUserId
				? `DeviceEvent.payload.rawFingerprints + DeviceUser(${params.deviceUserId}).vendorMetadata.rawFingerprints`
				: "DeviceEvent.payload.rawFingerprints + DeviceUser.vendorMetadata.rawFingerprints",
			templateStorage: "raw_base64_on_event_and_device_user",
		},
		enrollmentSnapshot: {
			...priorSnap,
			biometricCustody: {
				...priorCustody,
				status: rawPresent ? "raw_on_event_and_device_user" : priorCustody.status,
				rawPresent,
				fingerprintCount,
				totalDataChars,
				rawTemplateOnDeviceEvent: rawPresent,
				rawFaceOnDeviceEvent: facePresent,
				location: params.deviceUserId
					? `DeviceEvent + DeviceUser(${params.deviceUserId})`
					: "DeviceEvent + DeviceUser",
				templateStorage: "raw_base64_on_event_and_device_user",
			},
		},
		enrollmentGoal: {
			...(prior.enrollmentGoal || {}),
			employeeNo: params.employeeNo || prior.enrollmentGoal?.employeeNo || existing.employeeNo,
			deviceUserId: params.deviceUserId || prior.enrollmentGoal?.deviceUserId || existing.deviceUserId,
			rawTemplateOnDeviceEvent: rawPresent,
			rawFaceOnDeviceEvent: facePresent,
			rawFingerprintExpected: true,
			fingerprintTemplateLocation:
				"DeviceEvent.payload.rawFingerprints.templates[].data + DeviceUser.vendorMetadata.rawFingerprints",
		},
	};

	const updated = await params.prisma.deviceEvent.update({
		where: { id: eventId },
		data: {
			deviceUserId: params.deviceUserId || existing.deviceUserId || null,
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
	return true;
};

export const patchEnrollmentEventRawStatus = async (
	params: {
		prisma: PrismaClient | any;
		req: any;
		eventId?: string | null;
		deviceUserId?: string | null;
		/** When provided, full templates are also written onto the event payload. */
		custody?: RawFingerprintCustody | null;
		rawFace?: any | null;
		employeeNo?: string | null;
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

	// Prefer full blob attach when custody is available (create/enroll journey).
	if (params.custody?.rawPresent || params.rawFace) {
		await attachRawBiometricsToDeviceEventPayload({
			prisma: params.prisma,
			req: params.req,
			eventId,
			deviceUserId: status.deviceUserId || params.deviceUserId || null,
			employeeNo: params.employeeNo || null,
			custody: params.custody || null,
			rawFace: params.rawFace || null,
			source: params.custody?.source || "raw_capture",
		});
		return;
	}

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
			rawPresent: status.status === "raw_on_device_user" || status.status === "raw_on_event_and_device_user",
			rawTemplateOnDeviceEvent: Boolean(prior.rawFingerprints?.present),
			// Prefer dual plane when blobs already on event.
			plane: prior.rawFingerprints?.present ? "DEVICE_EVENT_AND_DEVICE_USER" : "DEVICE_USER",
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
	const employeeNo = String(params.employeeNo || "").trim();
	if (!employeeNo || isOpaqueHikvisionPersonToken(employeeNo)) return;

	console.warn(
		`[raw-fingerprint] ISAPI fallback capture scheduled for ${employeeNo} device=${params.deviceId}`,
	);

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

	const rawFaceMeta = (row.vendorMetadata as any)?.rawFace || null;

	if (params.eventId) {
		await patchEnrollmentEventRawStatus(
			{
				prisma: params.prisma,
				req: params.req,
				eventId: params.eventId,
				deviceUserId: saved?.id || row.id,
				custody,
				rawFace: rawFaceMeta,
				employeeNo,
			},
			{
				status: "raw_on_event_and_device_user",
				reason: null,
				attempts: 0,
				fingerprintCount: custody.fingerprintCount,
				totalDataChars: custody.totalDataChars,
				deviceUserId: saved?.id || row.id,
				rawFingerprintLocation: `DeviceEvent.payload.rawFingerprints + DeviceUser(${saved?.id || row.id}).vendorMetadata.rawFingerprints`,
			},
		).catch(() => undefined);
	}

	await attachRawToRecentLifecycleEventsForPerson({
		prisma: params.prisma,
		req: params.req,
		organizationId,
		deviceId,
		employeeNo,
		deviceUserId: saved?.id || row.id || null,
		custody,
		rawFace: rawFaceMeta,
		excludeEventId: params.eventId || null,
	}).catch(() => undefined);

	return {
		ok: true,
		rawPresent: custody.rawPresent || Boolean(faceTemplate || facePicture),
		fingerprintCount: custody.fingerprintCount,
		totalDataChars: custody.totalDataChars,
		deviceUserId: saved?.id || row.id || null,
	};
};
