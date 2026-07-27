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

/** Shared surfaces so day-cell +OT text and tooltip OT box stay the same color family. */
export type OvertimeCandidateToneSurface = {
	/** Tailwind classes for the day-cell +OT text */
	badgeText: string;
	/** Tooltip / callout box border + background */
	box: string;
	/** Tooltip title / status line */
	title: string;
	/** Tooltip primary body (e.g. "2:09 detected") */
	body: string;
};

export const OVERTIME_CANDIDATE_TONE_SURFACES: Record<
	OvertimeCandidateBadgeTone,
	OvertimeCandidateToneSurface
> = {
	// Unfiled — still needs request (green, matches TimesheetDayCell `ot`)
	ot: {
		badgeText: "text-green-700",
		box: "border-green-200 bg-green-50",
		title: "text-green-800",
		body: "text-green-900",
	},
	// Filed / pending manager (sky, matches TimesheetDayCell `ot-filed`)
	"ot-filed": {
		badgeText: "text-sky-600 font-semibold",
		box: "border-sky-200 bg-sky-50",
		title: "text-sky-800",
		body: "text-sky-900",
	},
	// Approved payable OT
	"ot-approved": {
		badgeText: "text-emerald-700",
		box: "border-emerald-200 bg-emerald-50",
		title: "text-emerald-800",
		body: "text-emerald-900",
	},
	// Rejected
	"ot-rejected": {
		badgeText: "text-rose-600",
		box: "border-rose-200 bg-rose-50",
		title: "text-rose-800",
		body: "text-rose-900",
	},
};

export const getOvertimeCandidateToneSurface = (
	tone: OvertimeCandidateBadgeTone | null | undefined,
): OvertimeCandidateToneSurface =>
	OVERTIME_CANDIDATE_TONE_SURFACES[tone || "ot"] || OVERTIME_CANDIDATE_TONE_SURFACES.ot;

const hasPayableOvertimeHours = (overtimeHours?: string | null): boolean =>
	parseDurationToMinutes(overtimeHours) > 0;

/**
 * Badge for OT candidate metadata only.
 * Unfiled: green +OT · Filed (requested): blue +OT · Approved: emerald +OT · Rejected: rose OT
 */
export const getOvertimeCandidateBadge = (
	candidate: OvertimeCandidateView,
): OvertimeCandidateBadgeView | null => {
	if (!candidate.isCandidate) return null;

	// Status first: approved/rejected must not look like "still pending request".
	if (candidate.overtimeApprovalStatus === "APPROVED") {
		return { label: "+OT", tone: "ot-approved" };
	}
	if (candidate.overtimeApprovalStatus === "REJECTED") {
		return { label: "+OT", tone: "ot-rejected" };
	}
	// Filed and awaiting manager approval (REQUESTED or request id present).
	if (
		candidate.overtimeApprovalStatus === "REQUESTED" ||
		candidate.overtimeRequestId
	) {
		// Keep "+OT" label so the mark is recognizable; color distinguishes "already requested".
		return { label: "+OT", tone: "ot-filed" };
	}

	// Unfiled candidate — still needs employee OT request.
	return { label: "+OT", tone: "ot" };
};

/**
 * Resolve the day-cell OT badge for a timesheet breakdown day.
 * Prefer request status over raw payable hours so REQUESTED days do not look "approved".
 */
export const resolveOvertimeDayBadge = (day: {
	overtimeHours?: string | null;
	metadata?: Record<string, unknown> | null;
}): OvertimeCandidateBadgeView | null => {
	const candidate = readOvertimeCandidateFromDay(day);
	const candidateBadge = getOvertimeCandidateBadge(candidate);
	if (candidateBadge) return candidateBadge;

	// Filed/approved request without isCandidate (edge: pending minutes cleared) still needs a mark.
	if (
		candidate.overtimeApprovalStatus === "REQUESTED" ||
		candidate.overtimeRequestId
	) {
		return { label: "+OT", tone: "ot-filed" };
	}
	if (candidate.overtimeApprovalStatus === "APPROVED") {
		return { label: "+OT", tone: "ot-approved" };
	}

	// Legacy payable OT with no candidate metadata.
	if (hasPayableOvertimeHours(day.overtimeHours)) {
		return { label: "+OT", tone: "ot-approved" };
	}

	return null;
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