import { createHash } from "crypto";
import { parseHikvisionEventTime } from "./hikvision-event-contract.helper";

export const ZKTECO_DEVICE_EVENT_SOURCE = "ZKTECO_EVENT" as const;

export type NormalizedZktecoEvent = {
	deviceId?: string;
	deviceIP?: string;
	devicePort?: number;
	employeeNo?: string;
	name?: string;
	time?: string | Date;
	eventType?: string;
	verifyMode?: string;
	attState?: string | number;
	attStateName?: string;
	workCode?: string | number;
	serialNo?: string | number;
	isValid?: boolean;
};

const pickFirst = (candidates: any[], keys: string[]) => {
	for (const candidate of candidates) {
		if (!candidate || typeof candidate !== "object") continue;
		for (const key of keys) {
			if (candidate[key] !== undefined && candidate[key] !== null) return candidate[key];
		}
	}
	return undefined;
};

export const normalizeZktecoPayload = (payload: Record<string, any>): NormalizedZktecoEvent => {
	const candidates = [
		payload,
		payload?.event,
		payload?.attendance,
		payload?.attendanceData,
		payload?.device,
		payload?.source,
	].filter(Boolean);
	const device = payload?.device || payload?.source || {};
	const attendance = payload?.attendance || payload?.event || payload?.attendanceData || {};

	return {
		deviceId: pickFirst(candidates, ["deviceId", "hrisDeviceId"]),
		deviceIP: pickFirst([device, payload], ["ip", "deviceIP", "deviceIp", "address"]),
		devicePort: Number(pickFirst([device, payload], ["port", "devicePort"]) || 4370),
		employeeNo: String(
			pickFirst([attendance, payload], ["enrollNumber", "employeeNo", "employeeID", "pin"]) ||
				"",
		).trim(),
		name: pickFirst([attendance, payload], ["userName", "name", "employeeName"]),
		time: pickFirst([attendance, payload], ["timestamp", "time", "eventTime"]),
		eventType: pickFirst([payload, attendance], ["eventType", "type"]) || "AttendanceTransaction",
		verifyMode: String(
			pickFirst([attendance, payload], ["verifyMethodName", "verifyMode", "verifyMethod"]) || "",
		).trim(),
		attState: pickFirst([attendance, payload], ["attState"]),
		attStateName: pickFirst([attendance, payload], ["attStateName"]),
		workCode: pickFirst([attendance, payload], ["workCode"]),
		serialNo: pickFirst([attendance, payload], ["serialNo", "sequenceNo"]),
		isValid: pickFirst([attendance, payload], ["isValid"]),
	};
};

export const parseZktecoEventTime = (rawTime: unknown) => parseHikvisionEventTime(rawTime);

export const buildZktecoDeviceEventDedupeKey = (input: {
	deviceId: string;
	eventTime: Date;
	employeeNo: string;
	event: NormalizedZktecoEvent;
}) => {
	const basis = [
		input.deviceId,
		ZKTECO_DEVICE_EVENT_SOURCE,
		input.eventTime.toISOString(),
		input.employeeNo,
		input.event.eventType || "",
		input.event.verifyMode || "",
		input.event.attState || "",
		input.event.workCode || "",
		input.event.serialNo || "",
	].join("|");

	return createHash("sha256").update(basis).digest("hex");
};
