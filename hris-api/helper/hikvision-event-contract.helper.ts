import { createHash } from "crypto";

export type HikvisionDeviceEventSource = "HIKVISION_CALLBACK" | "EN_HCNETSDK_ALARM";
export type HikvisionEvidenceSource =
	| "SDK_CALLBACK"
	| "ISAPI_LOGSEARCH"
	| "STATE_TRANSITION_INFERRED";

export type NormalizedHikvisionEvent = {
	deviceId?: string;
	source?: string;
	eventType?: string;
	major?: string | number;
	minor?: string | number;
	actionCode?: string;
	time?: string | Date;
	employeeNo?: string;
	name?: string;
	deviceIP?: string;
	doorNo?: string | number;
	verifyMode?: string;
	serialNo?: string | number;
	deviceTime?: string;
	timeAdjusted?: boolean;
	deviceClockSkewSeconds?: number;
};

export type HikvisionLogSearchRow = {
	index: number;
	metaId?: string;
	time?: string;
	majorType?: string;
	minorType?: string;
	channelNo?: string;
	localOrRemote?: string;
	operator?: string;
	remoteHost?: string;
	parameter?: string;
	information?: string;
	employeeNo?: string;
	rawXml: string;
	raw: Record<string, string>;
};

export type NormalizedHikvisionEvidenceEvent = NormalizedHikvisionEvent & {
	evidenceSource: HikvisionEvidenceSource;
	directDeviceEvidence: boolean;
	eventCategory: string;
	eventAction: string;
	eventLabel: string;
	eventConfidence: "PROVEN" | "SUPPORTED" | "INFERRED" | "UNKNOWN";
	rawEvidence?: unknown;
};

const MANILA_OFFSET = "+08:00";
const FUTURE_SKEW_TOLERANCE_MS = 60 * 1000;
const MAX_AUTO_ADJUST_SKEW_MS = 30 * 60 * 1000;
export const DEFAULT_HIKVISION_MIN_PUNCH_PAIR_GAP_MINUTES = 0;

const normalizeClockSkewSeconds = (skewSeconds: number) => {
	if (skewSeconds <= 0 || skewSeconds * 1000 > MAX_AUTO_ADJUST_SKEW_MS) return 0;
	return Math.ceil(skewSeconds / 60) * 60;
};

const tryParseJson = (value: string): Record<string, any> | null => {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
};

const getXmlTagValue = (xml: string, tagName: string): string | undefined => {
	const regex = new RegExp(
		`<(?:[A-Za-z0-9_-]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_-]+:)?${tagName}>`,
		"i",
	);
	const match = xml.match(regex);
	return match?.[1]?.trim();
};

export const parseHikvisionBodyPayload = (rawBody: unknown): Record<string, any> => {
	if (rawBody && typeof rawBody === "object") {
		return rawBody as Record<string, any>;
	}

	const text = String(rawBody || "").trim();
	if (!text) return {};

	const asJson = tryParseJson(text);
	if (asJson) return asJson;

	return {
		deviceId: getXmlTagValue(text, "deviceId"),
		source: getXmlTagValue(text, "source"),
		eventType: getXmlTagValue(text, "eventType"),
		major: getXmlTagValue(text, "major"),
		minor: getXmlTagValue(text, "minor"),
		time: getXmlTagValue(text, "time") || getXmlTagValue(text, "dateTime"),
		employeeNo: getXmlTagValue(text, "employeeNo"),
		employeeNoString: getXmlTagValue(text, "employeeNoString"),
		name: getXmlTagValue(text, "name"),
		deviceIP:
			getXmlTagValue(text, "deviceIP") ||
			getXmlTagValue(text, "deviceIp") ||
			getXmlTagValue(text, "ipAddress"),
		doorNo: getXmlTagValue(text, "doorNo"),
		verifyMode: getXmlTagValue(text, "verifyMode"),
		currentVerifyMode: getXmlTagValue(text, "currentVerifyMode"),
		serialNo: getXmlTagValue(text, "serialNo"),
	};
};

export const extractHikvisionEventData = (
	payload: Record<string, any>,
): NormalizedHikvisionEvent => {
	const candidates = [
		payload,
		payload?.EventNotificationAlert,
		payload?.EventNotificationAlert?.AccessControllerEvent,
		payload?.AccessControllerEvent,
		payload?.AcsEventInfo,
	].filter(Boolean);

	const pick = (...keys: string[]): any => {
		for (const candidate of candidates) {
			for (const key of keys) {
				if (candidate?.[key] !== undefined && candidate?.[key] !== null) {
					return candidate[key];
				}
			}
		}
		return undefined;
	};

	return {
		deviceId: pick("deviceId", "hikvisionDeviceId"),
		source: pick("source", "eventSource"),
		eventType: pick("eventType", "EventType", "userType"),
		major: pick("major", "Major"),
		minor: pick("minor", "Minor"),
		actionCode: pick("actionCode"),
		time: pick("time", "dateTime", "eventTime"),
		employeeNo: pick("employeeNo", "employeeID", "EmployeeNo", "employeeNoString"),
		name: pick("name", "employeeName"),
		deviceIP: pick("deviceIP", "ipAddress", "deviceIp"),
		doorNo: pick("doorNo"),
		verifyMode: pick("verifyMode", "currentVerifyMode"),
		serialNo: pick("serialNo"),
		deviceTime: pick("deviceTime"),
		timeAdjusted: Boolean(pick("timeAdjusted")),
		deviceClockSkewSeconds: Number(pick("deviceClockSkewSeconds") || 0),
	};
};

export const normalizeHikvisionAddress = (value: unknown): string => {
	const text = String(value || "").trim();
	if (!text) return "";
	try {
		return new URL(text).hostname.toLowerCase();
	} catch {
		return text
			.replace(/^https?:\/\//i, "")
			.split("/")[0]
			.split(":")[0]
			.trim()
			.toLowerCase();
	}
};

export const getHikvisionObservedDeviceIp = (payload: Record<string, any>): string => {
	const event = extractHikvisionEventData(payload);
	const rawAlarm = payload?.rawAlarm || {};
	return String(
		event.deviceIP ||
			rawAlarm.deviceIp ||
			rawAlarm.deviceIP ||
			payload?.socketCandidate?.deviceIP ||
			payload?.socketCandidate?.deviceIp ||
			"",
	).trim();
};

export const hikvisionEventMatchesConfiguredDevice = (
	event: Pick<NormalizedHikvisionEvent, "deviceIP">,
	device: { address?: string | null; config?: unknown },
) => {
	const observedAddress = normalizeHikvisionAddress(event.deviceIP);
	if (!observedAddress) return true;

	const config = device.config && typeof device.config === "object" ? (device.config as any) : {};
	const configuredAddresses = [
		device.address,
		config.hikvisionRuntimeAddress,
		config.hikvisionSdkRuntimeAddress,
		config.runtimeAddress,
	]
		.map((value) => normalizeHikvisionAddress(value))
		.filter(Boolean);

	return configuredAddresses.length === 0
		? true
		: configuredAddresses.includes(observedAddress);
};

const getXmlTagValues = (xml: string, tagName: string): string[] => {
	const regex = new RegExp(
		`<(?:[A-Za-z0-9_-]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_-]+:)?${tagName}>`,
		"gi",
	);
	const values: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = regex.exec(xml))) {
		values.push(match[1]?.trim() || "");
	}
	return values;
};

const stripXmlTags = (value: string) =>
	String(value || "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();

const decodeXmlEntities = (value: string) =>
	String(value || "")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'");

const unwrapCdata = (value: string) =>
	String(value || "")
		.replace(/^\s*<!\[CDATA\[/i, "")
		.replace(/\]\]>\s*$/i, "")
		.trim();

const getFirstXmlTagValue = (xml: string, ...tagNames: string[]) => {
	for (const tagName of tagNames) {
		const value = getXmlTagValue(xml, tagName);
		if (value !== undefined && value !== "") return decodeXmlEntities(stripXmlTags(value));
	}
	return "";
};

const normalizeVendorText = (value: unknown) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ");

const escapeXml = (value: unknown) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");

export const buildHikvisionLogSearchXml = (params: {
	searchId: string;
	startTime: string;
	endTime: string;
	maxResults: number;
	searchResultPosition: number;
	metaId?: string;
}) => `<?xml version="1.0" encoding="utf-8"?>
<CMSearchDescription version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<searchID>${escapeXml(params.searchId)}</searchID>
<metaId>${escapeXml(params.metaId || "log.std-cgi.com")}</metaId>
<timeSpanList>
<timeSpan>
<startTime>${escapeXml(params.startTime)}</startTime>
<endTime>${escapeXml(params.endTime)}</endTime>
</timeSpan>
</timeSpanList>
<maxResults>${Math.max(1, Math.floor(Number(params.maxResults) || 20))}</maxResults>
<searchResultPostion>${Math.max(0, Math.floor(Number(params.searchResultPosition) || 0))}</searchResultPostion>
</CMSearchDescription>`;

export const paginateHikvisionLogSearch = async (params: {
	startPosition?: number;
	pageSize?: number;
	maxRows?: number;
	fetchPage: (searchResultPosition: number, maxResults: number) => Promise<string>;
}) => {
	const pageSize = Math.max(1, Math.min(Math.floor(Number(params.pageSize) || 50), 200));
	const maxRows = Math.max(1, Math.min(Math.floor(Number(params.maxRows) || 1000), 10000));
	let position = Math.max(0, Math.floor(Number(params.startPosition) || 0));
	const rows: HikvisionLogSearchRow[] = [];
	const pages: Array<{
		searchResultPosition: number;
		maxResults: number;
		responseStatus?: string;
		totalMatches?: number;
		rowCount: number;
		rawXml: string;
	}> = [];

	while (rows.length < maxRows) {
		const requested = Math.min(pageSize, maxRows - rows.length);
		const rawXml = await params.fetchPage(position, requested);
		const parsed = parseHikvisionLogSearchResponse(rawXml);
		pages.push({
			searchResultPosition: position,
			maxResults: requested,
			responseStatus: parsed.responseStatus,
			totalMatches: parsed.totalMatches,
			rowCount: parsed.rows.length,
			rawXml,
		});
		rows.push(...parsed.rows.map((row, index) => ({ ...row, index: position + index })));
		if (!parsed.rows.length) break;
		position += parsed.rows.length;
		if (parsed.totalMatches !== undefined && position >= parsed.totalMatches) break;
		if (String(parsed.responseStatus || "").toUpperCase() !== "MORE") break;
	}

	return { rows, pages, nextSearchResultPosition: position };
};

export const parseHikvisionLogSearchResponse = (rawXml: string): {
	rows: HikvisionLogSearchRow[];
	totalMatches?: number;
	responseStatus?: string;
	rawXml: string;
} => {
	const xml = String(rawXml || "");
	const responseStatus =
		getFirstXmlTagValue(xml, "responseStatusStrg", "responseStatus", "statusString") ||
		undefined;
	const totalMatchesRaw = getFirstXmlTagValue(xml, "totalMatches", "numOfMatches");
	const totalMatches = Number(totalMatchesRaw);
	const rowXmlBlocks =
		getXmlTagValues(xml, "matchElement").length > 0
			? getXmlTagValues(xml, "matchElement")
			: getXmlTagValues(xml, "searchMatchItem").length > 0
				? getXmlTagValues(xml, "searchMatchItem")
				: getXmlTagValues(xml, "logInfo");
	const rows = rowXmlBlocks.map((rowXml, index) => {
		const metaId = getFirstXmlTagValue(rowXml, "metaId");
		const metaParts = metaId.split("/").filter(Boolean);
		const additionInformation = unwrapCdata(
			decodeXmlEntities(getXmlTagValue(rowXml, "additionInformation") || ""),
		);
		const additionJson = tryParseJson(additionInformation);
		const logAddInfo = additionJson?.LogAddInfo || additionJson?.logAddInfo || {};
		const raw = {
			metaId,
			time: getFirstXmlTagValue(rowXml, "time", "dateTime", "logTime", "eventTime", "StartDateTime"),
			majorType:
				getFirstXmlTagValue(rowXml, "majorType", "major", "majorTypeString") ||
				metaParts[metaParts.length - 2] ||
				"",
			minorType:
				getFirstXmlTagValue(rowXml, "minorType", "minor", "minorTypeString") ||
				metaParts[metaParts.length - 1] ||
				"",
			channelNo: getFirstXmlTagValue(rowXml, "channelNo", "channel"),
			localOrRemote: getFirstXmlTagValue(rowXml, "localOrRemote", "localRemote", "operatorType"),
			operator: getFirstXmlTagValue(rowXml, "userName", "operator", "operatorName"),
			remoteHost: getFirstXmlTagValue(rowXml, "remoteHost", "remoteHostAddr", "ipAddress", "deviceIP"),
			parameter:
				getFirstXmlTagValue(rowXml, "parameter", "param", "paraType", "localID") ||
				"",
			information:
				getFirstXmlTagValue(rowXml, "information", "info", "description") ||
				additionInformation,
			employeeNo: getFirstXmlTagValue(
				rowXml,
				"employeeNo",
				"employeeNoString",
				"employeeID",
				"userID",
				"userId",
				"cardNo",
			) || String(logAddInfo.EmployeeNo || logAddInfo.employeeNo || "").trim(),
		};
		const employeeNoFromText =
			raw.employeeNo ||
			(raw.information.match(/\b(?:employee|user|person)\s*(?:no|id|number)?\s*[:=]?\s*([A-Za-z0-9_-]+)/i)?.[1] ||
				raw.parameter.match(/\b(?:employee|user|person)\s*(?:no|id|number)?\s*[:=]?\s*([A-Za-z0-9_-]+)/i)?.[1] ||
				"");
		return {
			index,
			metaId: raw.metaId || undefined,
			time: raw.time || undefined,
			majorType: raw.majorType || undefined,
			minorType: raw.minorType || undefined,
			channelNo: raw.channelNo || undefined,
			localOrRemote: raw.localOrRemote || undefined,
			operator: raw.operator || undefined,
			remoteHost: raw.remoteHost || undefined,
			parameter: raw.parameter || undefined,
			information: raw.information || undefined,
			employeeNo: employeeNoFromText || undefined,
			rawXml: rowXml,
			raw,
		};
	});
	return {
		rows,
		totalMatches: Number.isFinite(totalMatches) ? totalMatches : undefined,
		responseStatus,
		rawXml: xml,
	};
};

export const classifyHikvisionLogSearchRow = (
	row: Pick<HikvisionLogSearchRow, "metaId" | "majorType" | "minorType" | "information" | "parameter">,
) => {
	const metaId = normalizeVendorText(row.metaId).replace(/\s+/g, "");
	const major = normalizeVendorText(row.majorType);
	const minor = normalizeVendorText(row.minorType);
	const information = normalizeVendorText(row.information);
	const parameter = normalizeVendorText(row.parameter);
	const haystack = [minor, information, parameter].filter(Boolean).join(" | ");
	const vendorAction = String(row.metaId || row.minorType || "")
		.split("/")
		.pop()
		?.trim()
		.toLowerCase();

	if (vendorAction === "addfpbyemployeeno" || vendorAction === "addfpbycard") {
		return {
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_ENROLLED",
			eventLabel: "Fingerprint enrolled",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (vendorAction === "adduserinfo") {
		return {
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_CREATED",
			eventLabel: "Device user created",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (vendorAction === "clearuserinfo") {
		return {
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_DELETED",
			eventLabel: "Device user deleted",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (vendorAction === "addcard") {
		return {
			eventCategory: "ENROLLMENT",
			eventAction: "CARD_ENROLLED",
			eventLabel: "Card enrolled",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (vendorAction === "localfacedataappend") {
		return {
			eventCategory: "ENROLLMENT",
			eventAction: "FACE_ENROLLED",
			eventLabel: "Face enrolled",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (vendorAction === "localfacedatadelete") {
		return {
			eventCategory: "ENROLLMENT",
			eventAction: "FACE_DELETED",
			eventLabel: "Face deleted",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (vendorAction === "localfacedatamodify" || vendorAction === "localfacedataupdate") {
		return {
			eventCategory: "ENROLLMENT",
			eventAction: "FACE_UPDATED",
			eventLabel: "Face updated",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (vendorAction === "modifyuserinfo" || vendorAction === "moduserinfo") {
		return {
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_UPDATED",
			eventLabel: "Device user updated",
			eventConfidence: "PROVEN",
		} as const;
	}

	if (/\bfinger(print)?\b/.test(haystack) && /\b(add|added|enroll|enrolled|register|registered)\b/.test(haystack)) {
		return {
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_ENROLLED",
			eventLabel: "Fingerprint enrolled",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (/\bfinger(print)?\b/.test(haystack) && /\b(mod|modify|modified|update|updated)\b/.test(haystack)) {
		return {
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_UPDATED",
			eventLabel: "Fingerprint updated",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (/\bfinger(print)?\b/.test(haystack) && /\b(del|delete|deleted|clear|cleared|remove|removed)\b/.test(haystack)) {
		return {
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_DELETED",
			eventLabel: "Fingerprint deleted",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (/\bface\b/.test(haystack) && /\b(add|added|append|enroll|enrolled|register|registered)\b/.test(haystack)) {
		return {
			eventCategory: "ENROLLMENT",
			eventAction: "FACE_ENROLLED",
			eventLabel: "Face enrolled",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (/\bface\b/.test(haystack) && /\b(mod|modify|modified|update|updated)\b/.test(haystack)) {
		return {
			eventCategory: "ENROLLMENT",
			eventAction: "FACE_UPDATED",
			eventLabel: "Face updated",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (/\bface\b/.test(haystack) && /\b(del|delete|deleted|clear|cleared|remove|removed)\b/.test(haystack)) {
		return {
			eventCategory: "ENROLLMENT",
			eventAction: "FACE_DELETED",
			eventLabel: "Face deleted",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (/\bcard\b/.test(haystack) && /\b(add|added|enroll|enrolled|register|registered)\b/.test(haystack)) {
		return {
			eventCategory: "ENROLLMENT",
			eventAction: "CARD_ENROLLED",
			eventLabel: "Card enrolled",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (/\bcard\b/.test(haystack) && /\b(mod|modify|modified|update|updated)\b/.test(haystack)) {
		return {
			eventCategory: "ENROLLMENT",
			eventAction: "CARD_UPDATED",
			eventLabel: "Card updated",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (/\bcard\b/.test(haystack) && /\b(del|delete|deleted|clear|cleared|remove|removed)\b/.test(haystack)) {
		return {
			eventCategory: "ENROLLMENT",
			eventAction: "CARD_DELETED",
			eventLabel: "Card deleted",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (
		/\b(add|added|create|created|register|registered)\b/.test(haystack) &&
		/\b(person|user|employee)\b/.test(haystack)
	) {
		return {
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_CREATED",
			eventLabel: "Device user created",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (/\b(mod|modify|modified|update|updated)\b/.test(haystack) && /\b(person|user|employee)\b/.test(haystack)) {
		return {
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_UPDATED",
			eventLabel: "Device user updated",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (/\b(del|delete|deleted|clear|cleared|remove|removed)\b/.test(haystack) && /\b(person|user|employee)\b/.test(haystack)) {
		return {
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_DELETED",
			eventLabel: "Device user deleted",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (major || minor || metaId) {
		return {
			eventCategory: "UNKNOWN_VENDOR",
			eventAction: "UNKNOWN",
			eventLabel: row.minorType || row.information || "Hikvision log event",
			eventConfidence: "UNKNOWN",
		} as const;
	}
	return null;
};

export const normalizeHikvisionLogSearchRow = (
	row: HikvisionLogSearchRow,
	device?: { id?: string; address?: string | null; name?: string | null },
): NormalizedHikvisionEvidenceEvent => {
	const taxonomy =
		classifyHikvisionLogSearchRow(row) || ({
			eventCategory: "UNKNOWN_VENDOR",
			eventAction: "UNKNOWN",
			eventLabel: "Hikvision log event",
			eventConfidence: "UNKNOWN",
		} as const);
	return {
		deviceId: device?.id,
		source: "HIKVISION_CALLBACK",
		eventType: "ISAPI_LOGSEARCH",
		major: row.majorType,
		minor: row.minorType,
		actionCode: row.minorType,
		time: row.time,
		employeeNo: row.employeeNo,
		deviceIP: device?.address || row.remoteHost,
		evidenceSource: "ISAPI_LOGSEARCH",
		directDeviceEvidence: true,
		...taxonomy,
		rawEvidence: row,
	};
};

const classifyHikvisionSdkEvidence = (event: NormalizedHikvisionEvent) => {
	const actionCode = String(event.actionCode || "").trim().toUpperCase();
	const major = String(event.major ?? "").trim();
	const minor = String(event.minor ?? "").trim();
	if (isHikvisionAttendancePunchEvent(event)) {
		return {
			eventCategory: "ATTENDANCE",
			eventAction: "TAP",
			eventLabel: "Attendance tap",
			eventConfidence: "PROVEN",
		} as const;
	}
	if (
		actionCode === "MINOR_FINGERPRINT_COMPARE_FAIL" ||
		actionCode === "MINOR_CARD_FINGERPRINT_VERIFY_FAIL" ||
		actionCode === "MINOR_FINGERPRINT_INEXISTENCE" ||
		String((event as any).eventKind || "").trim() === "attendance_fingerprint_failed"
	) {
		return {
			eventCategory: "ATTENDANCE",
			eventAction: "TAP_REJECTED",
			eventLabel: "Rejected tap",
			eventConfidence: "SUPPORTED",
		} as const;
	}
	const mappings: Record<
		string,
		Pick<NormalizedHikvisionEvidenceEvent, "eventCategory" | "eventAction" | "eventLabel">
	> = {
		MINOR_ADD_FINGER_BY_CARD: {
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_ENROLLED",
			eventLabel: "Fingerprint enrolled",
		},
		MINOR_ADD_FINGER_BY_EMPLOYEE_NO: {
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_ENROLLED",
			eventLabel: "Fingerprint enrolled",
		},
		MINOR_MOD_FINGER_BY_CARD: {
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_UPDATED",
			eventLabel: "Fingerprint updated",
		},
		MINOR_MOD_FINGER_BY_EMPLOYEE_NO: {
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_UPDATED",
			eventLabel: "Fingerprint updated",
		},
		MINOR_DEL_FINGER: {
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_DELETED",
			eventLabel: "Fingerprint deleted",
		},
		MINOR_ADD_FACE: {
			eventCategory: "ENROLLMENT",
			eventAction: "FACE_ENROLLED",
			eventLabel: "Face enrolled",
		},
		MINOR_FACE_DATA_APPEND: {
			eventCategory: "ENROLLMENT",
			eventAction: "FACE_ENROLLED",
			eventLabel: "Face enrolled",
		},
		MINOR_MOD_FACE: {
			eventCategory: "ENROLLMENT",
			eventAction: "FACE_UPDATED",
			eventLabel: "Face updated",
		},
		MINOR_FACE_DATA_MODIFY: {
			eventCategory: "ENROLLMENT",
			eventAction: "FACE_UPDATED",
			eventLabel: "Face updated",
		},
		MINOR_DEL_FACE: {
			eventCategory: "ENROLLMENT",
			eventAction: "FACE_DELETED",
			eventLabel: "Face deleted",
		},
		MINOR_FACE_DATA_DELETE: {
			eventCategory: "ENROLLMENT",
			eventAction: "FACE_DELETED",
			eventLabel: "Face deleted",
		},
		MINOR_ADD_CARD: {
			eventCategory: "ENROLLMENT",
			eventAction: "CARD_ENROLLED",
			eventLabel: "Card enrolled",
		},
		MINOR_ADD_CARD_INFO: {
			eventCategory: "ENROLLMENT",
			eventAction: "CARD_ENROLLED",
			eventLabel: "Card enrolled",
		},
		MINOR_MOD_CARD: {
			eventCategory: "ENROLLMENT",
			eventAction: "CARD_UPDATED",
			eventLabel: "Card updated",
		},
		MINOR_DELETE_CARD_INFO: {
			eventCategory: "ENROLLMENT",
			eventAction: "CARD_DELETED",
			eventLabel: "Card deleted",
		},
		MINOR_ADD_USER_INFO: {
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_CREATED",
			eventLabel: "Device user created",
		},
		MINOR_MODIFY_USER_INFO: {
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_UPDATED",
			eventLabel: "Device user updated",
		},
		MINOR_CLR_USER_INFO: {
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_DELETED",
			eventLabel: "Device user deleted",
		},
	};
	if (mappings[actionCode]) {
		return { ...mappings[actionCode], eventConfidence: "SUPPORTED" as const };
	}
	return {
		eventCategory: "UNKNOWN_VENDOR",
		eventAction: "UNKNOWN",
		eventLabel: actionCode || [major, minor].filter(Boolean).join("/") || "Hikvision SDK event",
		eventConfidence: "UNKNOWN",
	} as const;
};

export const normalizeHikvisionSdkCallbackEvidence = (
	payload: Record<string, any>,
): NormalizedHikvisionEvidenceEvent => {
	const event = extractHikvisionEventData(payload);
	const rawActionCode =
		event.actionCode ||
		payload?.actionCode ||
		payload?.minorName ||
		payload?.rawAlarm?.actionCode;
	const normalizedEvent = { ...event, actionCode: rawActionCode };
	const evidenceSource: HikvisionEvidenceSource =
		payload?.evidenceSource === "ISAPI_LOGSEARCH" ? "ISAPI_LOGSEARCH" : "SDK_CALLBACK";
	return {
		...normalizedEvent,
		source: normalizeHikvisionDeviceEventSource(normalizedEvent.source),
		evidenceSource,
		directDeviceEvidence: true,
		...classifyHikvisionSdkEvidence(normalizedEvent),
		rawEvidence: payload,
	};
};

export type HikvisionDeviceUserState = {
	vendorUserId: string;
	fingerprintCount?: number | null;
	faceCount?: number | null;
	cardCount?: number | null;
	raw?: unknown;
};

/**
 * Produces inferred lifecycle evidence only from two complete, verified device
 * snapshots. A single current-state list is deliberately insufficient.
 */
export const normalizeHikvisionStateTransitionEvidence = (params: {
	beforeSnapshot?: HikvisionDeviceUserState[] | null;
	afterSnapshot?: HikvisionDeviceUserState[] | null;
	beforeCapturedAt?: string | Date | null;
	afterCapturedAt?: string | Date | null;
	deviceId?: string;
	deviceIP?: string;
}): NormalizedHikvisionEvidenceEvent[] => {
	if (
		!Array.isArray(params.beforeSnapshot) ||
		!Array.isArray(params.afterSnapshot) ||
		!params.beforeCapturedAt ||
		!params.afterCapturedAt
	) {
		return [];
	}
	const before = new Map(
		params.beforeSnapshot.map((row) => [String(row.vendorUserId || "").trim(), row]),
	);
	const after = new Map(
		params.afterSnapshot.map((row) => [String(row.vendorUserId || "").trim(), row]),
	);
	const transitions: NormalizedHikvisionEvidenceEvent[] = [];
	const push = (
		vendorUserId: string,
		eventCategory: string,
		eventAction: string,
		eventLabel: string,
		beforeState: HikvisionDeviceUserState | null,
		afterState: HikvisionDeviceUserState | null,
	) =>
		transitions.push({
			deviceId: params.deviceId,
			deviceIP: params.deviceIP,
			source: "HIKVISION_CALLBACK",
			eventType: "DeviceUserStateTransition",
			time: params.afterCapturedAt as string | Date,
			employeeNo: vendorUserId,
			evidenceSource: "STATE_TRANSITION_INFERRED",
			directDeviceEvidence: false,
			eventCategory,
			eventAction,
			eventLabel,
			eventConfidence: "INFERRED",
			rawEvidence: {
				beforeCapturedAt: params.beforeCapturedAt,
				afterCapturedAt: params.afterCapturedAt,
				before: beforeState,
				after: afterState,
			},
		});

	for (const [vendorUserId, afterState] of after) {
		if (!vendorUserId) continue;
		const beforeState = before.get(vendorUserId) || null;
		if (!beforeState) {
			push(vendorUserId, "USER_MANAGEMENT", "USER_CREATED", "Device user appeared", null, afterState);
			continue;
		}
		const beforeFingerprints = Math.max(0, Number(beforeState.fingerprintCount || 0));
		const afterFingerprints = Math.max(0, Number(afterState.fingerprintCount || 0));
		if (afterFingerprints > beforeFingerprints) {
			push(
				vendorUserId,
				"ENROLLMENT",
				beforeFingerprints === 0 ? "FINGERPRINT_ENROLLED" : "FINGERPRINT_UPDATED",
				beforeFingerprints === 0 ? "Fingerprint count increased from zero" : "Fingerprint count increased",
				beforeState,
				afterState,
			);
		} else if (beforeFingerprints > 0 && afterFingerprints === 0) {
			push(vendorUserId, "ENROLLMENT", "FINGERPRINT_DELETED", "Fingerprint count fell to zero", beforeState, afterState);
		}
		const beforeFaces = Math.max(0, Number(beforeState.faceCount || 0));
		const afterFaces = Math.max(0, Number(afterState.faceCount || 0));
		if (afterFaces > beforeFaces) {
			push(
				vendorUserId,
				"ENROLLMENT",
				beforeFaces === 0 ? "FACE_ENROLLED" : "FACE_UPDATED",
				beforeFaces === 0 ? "Face count increased from zero" : "Face count increased",
				beforeState,
				afterState,
			);
		} else if (beforeFaces > 0 && afterFaces === 0) {
			push(vendorUserId, "ENROLLMENT", "FACE_DELETED", "Face count fell to zero", beforeState, afterState);
		}
		const beforeCards = Math.max(0, Number(beforeState.cardCount || 0));
		const afterCards = Math.max(0, Number(afterState.cardCount || 0));
		if (afterCards > beforeCards) {
			push(
				vendorUserId,
				"ENROLLMENT",
				beforeCards === 0 ? "CARD_ENROLLED" : "CARD_UPDATED",
				beforeCards === 0 ? "Card count increased from zero" : "Card count increased",
				beforeState,
				afterState,
			);
		} else if (beforeCards > 0 && afterCards === 0) {
			push(vendorUserId, "ENROLLMENT", "CARD_DELETED", "Card count fell to zero", beforeState, afterState);
		}
	}
	for (const [vendorUserId, beforeState] of before) {
		if (vendorUserId && !after.has(vendorUserId)) {
			push(vendorUserId, "USER_MANAGEMENT", "USER_DELETED", "Device user disappeared", beforeState, null);
		}
	}
	return transitions;
};

export const isHikvisionAttendancePunchEvent = (
	event: Pick<NormalizedHikvisionEvent, "major" | "minor" | "actionCode" | "employeeNo" | "verifyMode">,
) => {
	const major = String(event.major ?? "").trim();
	const minor = String(event.minor ?? "").trim();
	const actionCode = String(event.actionCode || "").trim().toUpperCase();
	const verifyMode = String(event.verifyMode || "").trim().toLowerCase();

	if (major === "5" && minor === "38") return true;
	if (major === "5" && minor === "75") return true;
	if (major === "5" && event.employeeNo && verifyMode) {
		return (
			verifyMode.includes("face") ||
			verifyMode.includes("fp") ||
			verifyMode.includes("finger") ||
			verifyMode.includes("card")
		);
	}
	return [
		"MINOR_FINGERPRINT_COMPARE_PASS",
		"MINOR_FACE_COMPARE_PASS",
		"MINOR_FACE_RECOGNITION_PASS",
		"MINOR_CARD_PASS",
	].includes(actionCode);
};

export const isHikvisionAttendancePunchPayload = (payload: Record<string, any>) =>
	isHikvisionAttendancePunchEvent(extractHikvisionEventData(payload));

export const isHikvisionBiometricVerificationEvent = (
	event: Pick<NormalizedHikvisionEvent, "major" | "minor" | "verifyMode">,
) => {
	const major = String(event.major ?? "").trim();
	const minor = String(event.minor ?? "").trim();
	const verifyMode = String(event.verifyMode || "").trim().toLowerCase();

	if (major !== "5" || !verifyMode) return false;
	if (
		!verifyMode.includes("face") &&
		!verifyMode.includes("fp") &&
		!verifyMode.includes("finger") &&
		!verifyMode.includes("card")
	) {
		return false;
	}

	return minor === "38" || minor === "39" || minor === "75";
};

export const selectHikvisionPunchPair = (
	rows: Array<{ eventTime: Date | string; payload?: any }>,
	options?: { minPairGapMinutes?: number },
) => {
	const rawGapMinutes = Number(options?.minPairGapMinutes);
	const minPairGapMs =
		Number.isFinite(rawGapMinutes) && rawGapMinutes > 0
			? rawGapMinutes * 60 * 1000
			: 0;
	const punchTimes = rows
		.filter((row) =>
			row.payload && typeof row.payload === "object"
				? isHikvisionAttendancePunchPayload(row.payload)
				: true,
		)
		.map((row) => (row.eventTime instanceof Date ? row.eventTime : new Date(row.eventTime)))
		.filter((date) => !Number.isNaN(date.getTime()))
		.sort((left, right) => left.getTime() - right.getTime());

	const timeIn = punchTimes[0] || null;
	const eligibleTimeOuts = timeIn
		? punchTimes.filter(
				(punchTime) => punchTime.getTime() - timeIn.getTime() >= minPairGapMs,
			)
		: [];
	const latest = eligibleTimeOuts[eligibleTimeOuts.length - 1] || null;
	const timeOut = timeIn && latest && latest.getTime() > timeIn.getTime() ? latest : null;

	return {
		timeIn,
		timeOut,
		count: punchTimes.length,
	};
};

export const parseHikvisionEventTime = (rawTime: unknown): Date => {
	if (rawTime instanceof Date && !Number.isNaN(rawTime.getTime())) {
		return rawTime;
	}
	const value = String(rawTime || "").trim();
	const normalized =
		value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
			? `${value}${MANILA_OFFSET}`
			: value;
	const parsed = new Date(normalized);
	return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const toManilaIsoOffset = (date: Date) => {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).formatToParts(date);
	const get = (type: string) => parts.find((part) => part.type === type)?.value || "00";
	return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${MANILA_OFFSET}`;
};

export const normalizeHikvisionFutureSkewedEventTime = (
	rawTime: unknown,
	referenceDate = new Date(),
	knownSkewSeconds?: number | null,
	options?: { allowStoredSkew?: boolean; allowAutoAdjust?: boolean },
) => {
	const parsed = parseHikvisionEventTime(rawTime);
	const allowStoredSkew = options?.allowStoredSkew === true;
	const allowAutoAdjust = options?.allowAutoAdjust === true;
	const knownSkewMs =
		allowStoredSkew &&
		typeof knownSkewSeconds === "number" &&
		knownSkewSeconds > 0 &&
		knownSkewSeconds * 1000 <= MAX_AUTO_ADJUST_SKEW_MS
			? normalizeClockSkewSeconds(knownSkewSeconds) * 1000
			: 0;
	if (knownSkewMs) {
		const currentSkewMs = parsed.getTime() - referenceDate.getTime();
		if (currentSkewMs > FUTURE_SKEW_TOLERANCE_MS) {
			return {
				eventTime: new Date(parsed.getTime() - knownSkewMs),
				adjusted: true,
				originalTime: rawTime,
				skewSeconds: Math.round(knownSkewMs / 1000),
			};
		}
	}
	const skewMs = parsed.getTime() - referenceDate.getTime();
	if (
		allowAutoAdjust &&
		skewMs > FUTURE_SKEW_TOLERANCE_MS &&
		skewMs <= MAX_AUTO_ADJUST_SKEW_MS
	) {
		const normalizedSkewMs = normalizeClockSkewSeconds(Math.round(skewMs / 1000)) * 1000;
		return {
			eventTime: new Date(parsed.getTime() - normalizedSkewMs),
			adjusted: true,
			originalTime: rawTime,
			skewSeconds: Math.round(normalizedSkewMs / 1000),
		};
	}
	return {
		eventTime: parsed,
		adjusted: false,
		originalTime: rawTime,
		skewSeconds: Math.round(skewMs / 1000),
	};
};

export const getHikvisionObservedClockSkewSeconds = (
	events: any[],
	referenceDate = new Date(),
) => {
	if (!Array.isArray(events) || events.length === 0) return 0;
	const parsedTimes = events
		.map((event) => parseHikvisionEventTime(event?.time))
		.filter((date) => !Number.isNaN(date.getTime()))
		.map((date) => date.getTime());
	if (!parsedTimes.length) return 0;
	const skewMs = Math.max(...parsedTimes) - referenceDate.getTime();
	if (skewMs <= FUTURE_SKEW_TOLERANCE_MS || skewMs > MAX_AUTO_ADJUST_SKEW_MS) return 0;
	return Math.round(skewMs / 1000);
};

export const normalizeHikvisionAcsEventListTimes = (
	events: any[],
	referenceDate = new Date(),
	knownSkewSeconds?: number | null,
	options?: { allowStoredSkew?: boolean; allowAutoAdjust?: boolean },
) => {
	if (!Array.isArray(events) || events.length === 0) return events;
	const observedSkewSeconds = getHikvisionObservedClockSkewSeconds(events, referenceDate);
	const knownSkewIsCurrentlyVisible =
		options?.allowStoredSkew === true &&
		typeof knownSkewSeconds === "number" &&
		knownSkewSeconds > 0 &&
		observedSkewSeconds > 0;
	const skewSeconds = knownSkewIsCurrentlyVisible
		? normalizeClockSkewSeconds(knownSkewSeconds)
		: options?.allowAutoAdjust === true
			? normalizeClockSkewSeconds(observedSkewSeconds)
			: 0;
	const skewMs = skewSeconds * 1000;

	if (skewMs <= 0 || skewMs > MAX_AUTO_ADJUST_SKEW_MS) {
		return events;
	}

	return events.map((event) => {
		const parsedTime = parseHikvisionEventTime(event?.time);
		if (Number.isNaN(parsedTime.getTime())) return event;
		const adjustedTime = new Date(parsedTime.getTime() - skewMs);
		return {
			...event,
			time: toManilaIsoOffset(adjustedTime),
			deviceTime: event?.time,
			timeAdjusted: true,
			deviceClockSkewSeconds: skewSeconds,
		};
	});
};

export const extractHikvisionSystemLocalTime = (payload: any): string | null => {
	const raw = typeof payload?.raw === "string" ? payload.raw : "";
	if (raw) {
		const match =
			raw.match(/<localTime>([\s\S]*?)<\/localTime>/i) ||
			raw.match(/<time>([\s\S]*?)<\/time>/i);
		if (match?.[1]) return match[1].trim();
	}
	const time = payload?.Time || payload?.TimeCfg || payload?.SystemTime || payload;
	return (
		time?.localTime ||
		time?.time ||
		time?.dateTime ||
		time?.currentTime ||
		null
	);
};

export const getHikvisionClockSkewSecondsFromSystemTime = (
	payload: any,
	referenceDate = new Date(),
) => {
	const rawTime = extractHikvisionSystemLocalTime(payload);
	if (!rawTime) return 0;
	const parsedTime = parseHikvisionEventTime(rawTime);
	if (Number.isNaN(parsedTime.getTime())) return 0;
	const skewSeconds = Math.round((parsedTime.getTime() - referenceDate.getTime()) / 1000);
	return normalizeClockSkewSeconds(skewSeconds);
};

export const parseHikvisionBusinessDateBound = (
	value: string,
	endOfDay = false,
): Date | null => {
	const trimmed = String(value || "").trim();
	if (!trimmed) return null;

	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
		const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
		return new Date(`${trimmed}T${time}${MANILA_OFFSET}`);
	}

	const parsed = parseHikvisionEventTime(trimmed);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const normalizeHikvisionDeviceEventSource = (
	rawSource: unknown,
): HikvisionDeviceEventSource => {
	const value = String(rawSource || "").trim().toUpperCase();
	return value === "EN_HCNETSDK_ALARM" ? "EN_HCNETSDK_ALARM" : "HIKVISION_CALLBACK";
};

export const buildHikvisionDeviceEventDedupeKey = (input: {
	deviceId: string;
	source: string;
	eventTime: Date;
	employeeNo: string;
	event: NormalizedHikvisionEvent;
}) => {
	const basis = [
		input.deviceId,
		input.source,
		input.eventTime.toISOString(),
		input.employeeNo,
		input.event.eventType || "",
		input.event.major || "",
		input.event.minor || "",
		input.event.doorNo || "",
		input.event.verifyMode || "",
		input.event.serialNo || "",
	].join("|");

	return createHash("sha256").update(basis).digest("hex");
};
