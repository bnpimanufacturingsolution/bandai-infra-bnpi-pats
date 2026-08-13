export const HIKVISION_PANEL_SELECT_STATUS_CODES = [
	"checkIn",
	"checkOut",
	"breakOut",
	"breakIn",
	"overtimeIn",
	"overtimeOut",
] as const;

export type HikvisionPanelSelectStatusCode =
	(typeof HIKVISION_PANEL_SELECT_STATUS_CODES)[number];

export type HikvisionPanelSelectStatus = {
	code: HikvisionPanelSelectStatusCode | "undefined" | null;
	label: string;
	present: boolean;
};

const ENUM_LABELS: Record<HikvisionPanelSelectStatusCode, string> = {
	checkIn: "Check In",
	checkOut: "Check Out",
	breakOut: "Break Out",
	breakIn: "Break In",
	overtimeIn: "Overtime In",
	overtimeOut: "Overtime Out",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeCode = (
	raw: unknown,
): HikvisionPanelSelectStatusCode | "undefined" | null => {
	const value = String(raw ?? "")
		.trim()
		.replace(/[_-\s]/g, "")
		.toLowerCase();
	if (!value) return null;
	if (value === "undefined" || value === "0") return "undefined";
	if (value === "checkin") return "checkIn";
	if (value === "checkout") return "checkOut";
	if (value === "breakout") return "breakOut";
	if (value === "breakin") return "breakIn";
	if (value === "overtimein") return "overtimeIn";
	if (value === "overtimeout") return "overtimeOut";
	return null;
};

const readNested = (root: unknown, path: string[]): unknown => {
	let current: unknown = root;
	for (const key of path) {
		if (!isRecord(current)) return undefined;
		current = current[key];
	}
	return current;
};

const STATUS_PATHS = [
	["panelSelectStatus", "code"],
	["attendanceStatus"],
	["AcsEventInfo", "attendanceStatus"],
	["rawEvidence", "AcsEventInfo", "attendanceStatus"],
	["rawEvidence", "attendanceStatus"],
	["AccessControllerEvent", "attendanceStatus"],
	["EventNotificationAlert", "AccessControllerEvent", "attendanceStatus"],
	["payload", "AcsEventInfo", "attendanceStatus"],
];

const LABEL_PATHS = [
	["panelSelectStatus", "label"],
	["label"],
	["AcsEventInfo", "label"],
	["rawEvidence", "AcsEventInfo", "label"],
	["rawEvidence", "label"],
	["AccessControllerEvent", "label"],
	["EventNotificationAlert", "AccessControllerEvent", "label"],
	["payload", "AcsEventInfo", "label"],
];

const firstPresent = (root: unknown, paths: string[][]) => {
	for (const path of paths) {
		const value = readNested(root, path);
		if (value !== undefined && value !== null && String(value).trim()) return value;
	}
	return undefined;
};

export const formatHikvisionPanelSelectStatusLabel = (
	code: HikvisionPanelSelectStatus["code"],
	rawLabel?: unknown,
) => {
	const trimmedLabel = String(rawLabel ?? "").trim();
	if (code && code !== "undefined" && ENUM_LABELS[code]) {
		return trimmedLabel || ENUM_LABELS[code];
	}
	if (code === "undefined") return trimmedLabel || "Unset";
	return trimmedLabel || "Not sent";
};

export const extractHikvisionPanelSelectStatus = (
	payload?: unknown,
	liveEvent?: unknown,
): HikvisionPanelSelectStatus => {
	const sources = [liveEvent, payload].filter((value) => value !== undefined);
	let code: HikvisionPanelSelectStatus["code"] = null;
	let rawLabel: unknown;
	for (const source of sources) {
		const foundCode = normalizeCode(firstPresent(source, STATUS_PATHS));
		if (foundCode) {
			code = foundCode;
			rawLabel = firstPresent(source, LABEL_PATHS);
			break;
		}
		if (!rawLabel) rawLabel = firstPresent(source, LABEL_PATHS);
	}
	if (!code && rawLabel) {
		code = normalizeCode(rawLabel);
	}
	const present = code !== null;
	return {
		code: present ? code : null,
		label: formatHikvisionPanelSelectStatusLabel(present ? code : null, rawLabel),
		present,
	};
};

export const withHikvisionPanelSelectStatus = <T extends Record<string, unknown>>(
	payload: T,
): T & { panelSelectStatus: HikvisionPanelSelectStatus } => ({
	...payload,
	panelSelectStatus: extractHikvisionPanelSelectStatus(payload),
});
