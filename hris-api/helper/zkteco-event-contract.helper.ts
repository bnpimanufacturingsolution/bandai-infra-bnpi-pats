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

export const DEFAULT_ZKTECO_MIN_PUNCH_PAIR_GAP_MINUTES = 0;

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

export const buildZktecoEmployeeNoCandidates = (employeeNo: unknown) => {
	const raw = String(employeeNo || "").trim();
	if (!raw) return [];

	const candidates = new Set<string>([raw]);
	if (/^\d+$/.test(raw)) {
		const stripped = raw.replace(/^0+/, "") || "0";
		candidates.add(stripped);
		candidates.add(stripped.padStart(5, "0"));
	}

	return [...candidates];
};

export const isZktecoAttendancePunchEvent = (
	event: Pick<NormalizedZktecoEvent, "eventType" | "isValid">,
) => {
	const eventType = String(event.eventType || "").trim().toUpperCase();
	const isExplicitlyInvalid = String(event.isValid).trim().toLowerCase() === "false";
	return !isExplicitlyInvalid && (!eventType || eventType === "ATTENDANCETRANSACTION");
};

export const isZktecoAttendancePunchPayload = (payload: Record<string, any>) =>
	isZktecoAttendancePunchEvent(normalizeZktecoPayload(payload));

export const selectZktecoPunchPair = (
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
				? isZktecoAttendancePunchPayload(row.payload)
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
