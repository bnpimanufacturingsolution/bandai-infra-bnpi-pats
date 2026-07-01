import { createHash } from "crypto";

export type HikvisionDeviceEventSource = "HIKVISION_CALLBACK" | "EN_HCNETSDK_ALARM";

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
	const regex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i");
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
		time: getXmlTagValue(text, "time"),
		employeeNo: getXmlTagValue(text, "employeeNo"),
		employeeNoString: getXmlTagValue(text, "employeeNoString"),
		name: getXmlTagValue(text, "name"),
		deviceIP: getXmlTagValue(text, "deviceIP"),
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
	device: { address?: string | null },
) => {
	const observedAddress = normalizeHikvisionAddress(event.deviceIP);
	if (!observedAddress) return true;
	return observedAddress === normalizeHikvisionAddress(device.address);
};

export const isHikvisionAttendancePunchEvent = (
	event: Pick<NormalizedHikvisionEvent, "major" | "minor" | "actionCode">,
) => {
	const major = String(event.major ?? "").trim();
	const minor = String(event.minor ?? "").trim();
	const actionCode = String(event.actionCode || "").trim().toUpperCase();

	if (major === "5" && minor === "38") return true;
	if (major === "5" && minor === "75") return true;
	return actionCode === "MINOR_FINGERPRINT_COMPARE_PASS";
};

export const isHikvisionAttendancePunchPayload = (payload: Record<string, any>) =>
	isHikvisionAttendancePunchEvent(extractHikvisionEventData(payload));

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
) => {
	const parsed = parseHikvisionEventTime(rawTime);
	const knownSkewMs =
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
	if (skewMs > FUTURE_SKEW_TOLERANCE_MS && skewMs <= MAX_AUTO_ADJUST_SKEW_MS) {
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
) => {
	if (!Array.isArray(events) || events.length === 0) return events;
	const observedSkewSeconds = getHikvisionObservedClockSkewSeconds(events, referenceDate);
	const knownSkewIsCurrentlyVisible =
		typeof knownSkewSeconds === "number" &&
		knownSkewSeconds > 0 &&
		observedSkewSeconds > 0;
	const skewSeconds = knownSkewIsCurrentlyVisible
		? normalizeClockSkewSeconds(knownSkewSeconds)
		: normalizeClockSkewSeconds(observedSkewSeconds);
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
