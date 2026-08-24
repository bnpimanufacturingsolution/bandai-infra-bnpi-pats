import {
	extractHikvisionSystemLocalTime,
	parseHikvisionEventTime,
} from "./hikvision-event-contract.helper";

export const HIKVISION_MANILA_TIME_ZONE = "CST-8:00:00";
export const HIKVISION_MANILA_OFFSET = "+08:00";
export const HIKVISION_MANUAL_TIME_MODE = "manual";

export type HikvisionTimeSnapshot = {
	localTime: string | null;
	timeMode: string | null;
	timeZone: string | null;
};

const firstXmlTag = (raw: string, tag: string): string | null => {
	const match = raw.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
	const value = match?.[1]?.trim();
	return value || null;
};

const firstNonEmpty = (...values: Array<unknown>): string | null => {
	for (const value of values) {
		const text = String(value ?? "").trim();
		if (text) return text;
	}
	return null;
};

export const formatHikvisionManilaLocalTime = (date = new Date()): string => {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
		hourCycle: "h23",
	}).formatToParts(date);
	const get = (type: string) => parts.find((part) => part.type === type)?.value || "00";
	return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${HIKVISION_MANILA_OFFSET}`;
};

export const extractHikvisionTimeSnapshot = (payload: unknown): HikvisionTimeSnapshot => {
	const record = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
	const raw = typeof record.raw === "string" ? record.raw : "";
	const time = record.Time || record.TimeCfg || record.SystemTime || record;
	return {
		localTime: extractHikvisionSystemLocalTime(payload),
		timeMode: firstNonEmpty(firstXmlTag(raw, "timeMode"), time?.timeMode),
		timeZone: firstNonEmpty(firstXmlTag(raw, "timeZone"), time?.timeZone),
	};
};

export const hikvisionClockSkewSeconds = (
	deviceLocalTime: string | null | undefined,
	referenceDate = new Date(),
): number | null => {
	const raw = String(deviceLocalTime || "").trim();
	if (!raw) return null;
	const parsed = parseHikvisionEventTime(raw);
	if (Number.isNaN(parsed.getTime())) return null;
	return Math.round((parsed.getTime() - referenceDate.getTime()) / 1000);
};

export const buildHikvisionManualTimePut = (localTime: string) => {
	const trimmed = String(localTime || "").trim();
	const jsonBody = {
		Time: {
			timeMode: HIKVISION_MANUAL_TIME_MODE,
			localTime: trimmed,
			timeZone: HIKVISION_MANILA_TIME_ZONE,
		},
	};
	const xmlBody = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<Time version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">',
		`  <timeMode>${HIKVISION_MANUAL_TIME_MODE}</timeMode>`,
		`  <localTime>${trimmed}</localTime>`,
		`  <timeZone>${HIKVISION_MANILA_TIME_ZONE}</timeZone>`,
		"</Time>",
	].join("\n");
	return { jsonBody, xmlBody };
};

export const hikvisionTimePutSucceeded = (payload: unknown): boolean => {
	const record = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
	const status = record.ResponseStatus || record;
	const code = Number(status.statusCode);
	const sub = String(status.subStatusCode || "").trim().toLowerCase();
	const text = String(status.statusString || status.statusMsg || "").trim().toLowerCase();
	if (code === 1) return true;
	if (sub === "ok") return true;
	if (text === "ok") return true;
	return false;
};
