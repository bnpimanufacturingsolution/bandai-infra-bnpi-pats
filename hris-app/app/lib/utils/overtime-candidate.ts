export type OvertimeApprovalStatus = "NONE" | "REQUESTED" | "APPROVED" | "REJECTED";

export type OvertimeCandidateReason = "POST_SHIFT_EXCESS" | "REST_DAY" | "HOLIDAY";

export type OvertimeCandidateView = {
	isCandidate: boolean;
	pendingOvertimeMinutes: number;
	pendingOvertimeHours: string;
	overtimeRequestId: string | null;
	overtimeApprovalStatus: OvertimeApprovalStatus;
	overtimeCandidateReason: OvertimeCandidateReason | null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const parseDurationToMinutes = (timeStr?: string | null): number => {
	if (!timeStr || timeStr === "0:00") return 0;
	const [hours, minutes] = String(timeStr).split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	return hours * 60 + minutes;
};

export const readOvertimeCandidateFromMetadata = (
	metadata?: Record<string, unknown> | null,
): OvertimeCandidateView => {
	const record = asRecord(metadata);
	const pendingOvertimeMinutes = Math.max(0, Number(record.pendingOvertimeMinutes || 0));
	const pendingOvertimeHours =
		typeof record.pendingOvertimeHours === "string"
			? record.pendingOvertimeHours
			: formatMinutesAsTime(pendingOvertimeMinutes);

	return {
		isCandidate: Boolean(record.overtimeCandidate) && pendingOvertimeMinutes > 0,
		pendingOvertimeMinutes,
		pendingOvertimeHours,
		overtimeRequestId: record.overtimeRequestId ? String(record.overtimeRequestId) : null,
		overtimeApprovalStatus:
			(record.overtimeApprovalStatus as OvertimeApprovalStatus | undefined) || "NONE",
		overtimeCandidateReason:
			(record.overtimeCandidateReason as OvertimeCandidateReason | undefined) || null,
	};
};

export type OvertimeCandidateBadgeTone = "ot" | "ot-filed" | "ot-approved" | "ot-rejected";

export type OvertimeCandidateBadgeView = {
	label: string;
	tone: OvertimeCandidateBadgeTone;
};

export const getOvertimeCandidateBadge = (
	candidate: OvertimeCandidateView,
): OvertimeCandidateBadgeView | null => {
	if (!candidate.isCandidate) return null;

	if (
		candidate.overtimeApprovalStatus === "REQUESTED" ||
		candidate.overtimeRequestId
	) {
		return { label: "OT", tone: "ot-filed" };
	}

	switch (candidate.overtimeApprovalStatus) {
		case "APPROVED":
			return { label: "+OT", tone: "ot-approved" };
		case "REJECTED":
			return { label: "OT", tone: "ot-rejected" };
		default:
			return { label: "OT", tone: "ot" };
	}
};

export const getOvertimeCandidateBadgeLabel = (candidate: OvertimeCandidateView): string | null =>
	getOvertimeCandidateBadge(candidate)?.label ?? null;

export const getOvertimeCandidateActionLabel = (candidate: OvertimeCandidateView): string => {
	if (!candidate.isCandidate) return "";
	if (candidate.overtimeApprovalStatus === "REQUESTED") {
		return "Overtime request filed — awaiting manager approval";
	}
	if (candidate.overtimeApprovalStatus === "APPROVED") {
		return `Overtime approved (${candidate.pendingOvertimeHours})`;
	}
	if (candidate.overtimeApprovalStatus === "REJECTED") {
		return "Overtime rejected — file a new request";
	}
	return `File overtime request (${candidate.pendingOvertimeHours})`;
};

/** Includes legacy +OT lines that have payable hours but no candidate metadata yet. */
export const readOvertimeCandidateFromDay = (day: {
	overtimeHours?: string | null;
	metadata?: Record<string, unknown> | null;
}): OvertimeCandidateView => {
	const fromMetadata = readOvertimeCandidateFromMetadata(day.metadata);
	if (fromMetadata.isCandidate) return fromMetadata;

	const record = asRecord(day.metadata);
	const legacyMinutes = Math.max(
		0,
		Number(record.overtimeMinutes || 0),
		parseDurationToMinutes(day.overtimeHours),
	);
	if (legacyMinutes <= 0) return fromMetadata;
	if (fromMetadata.overtimeRequestId) return fromMetadata;
	if (
		fromMetadata.overtimeApprovalStatus === "REQUESTED" ||
		fromMetadata.overtimeApprovalStatus === "APPROVED"
	) {
		return fromMetadata;
	}

	return {
		isCandidate: true,
		pendingOvertimeMinutes: legacyMinutes,
		pendingOvertimeHours: formatMinutesAsTime(legacyMinutes),
		overtimeRequestId: fromMetadata.overtimeRequestId,
		overtimeApprovalStatus: fromMetadata.overtimeApprovalStatus,
		overtimeCandidateReason: fromMetadata.overtimeCandidateReason || "POST_SHIFT_EXCESS",
	};
};

export const canFileOvertimeRequest = (candidate: OvertimeCandidateView): boolean =>
	candidate.isCandidate &&
	!candidate.overtimeRequestId &&
	candidate.overtimeApprovalStatus !== "REQUESTED" &&
	candidate.overtimeApprovalStatus !== "APPROVED";

export type UnfiledOvertimeDay = {
	dateKey: string;
	pendingOvertimeHours: string;
};

export const findUnfiledOvertimeCandidateDays = (
	breakdown?: Array<{
		date?: string | null;
		businessDate?: string | null;
		overtimeHours?: string | null;
		metadata?: Record<string, unknown> | null;
	}>,
): UnfiledOvertimeDay[] => {
	const seen = new Set<string>();
	const results: UnfiledOvertimeDay[] = [];

	for (const day of breakdown || []) {
		const candidate = readOvertimeCandidateFromDay(day);
		if (!candidate.isCandidate || candidate.overtimeRequestId) continue;

		const dateKey = String(
			day.businessDate ||
				(day.metadata && typeof day.metadata.businessDate === "string"
					? day.metadata.businessDate
					: null) ||
				day.date ||
				"",
		).slice(0, 10);
		if (!dateKey || seen.has(dateKey)) continue;

		seen.add(dateKey);
		results.push({
			dateKey,
			pendingOvertimeHours: candidate.pendingOvertimeHours,
		});
	}

	return results.sort((left, right) => left.dateKey.localeCompare(right.dateKey));
};

const formatMinutesAsTime = (minutes: number): string => {
	const safeMinutes = Math.max(0, Math.round(minutes));
	const hours = Math.floor(safeMinutes / 60);
	const remainder = safeMinutes % 60;
	return `${hours}:${String(remainder).padStart(2, "0")}`;
};