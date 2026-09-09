import type { PrismaClient } from "../generated/prisma";
import { buildAttendanceTimekeepingFields } from "./attendance.helper";
import {
	deriveBehaviorFlags,
	formatMinutesAsTime,
	type AttendanceBehaviorFlag,
	type TimekeepingCalculation,
} from "./timekeeping.helper";
import { getOrCreateNormalizedTimesheetConfig } from "./timesheet-config.helper";

export const OT_CANDIDATE_BEHAVIOR_FLAG = "OT_CANDIDATE" as const;

export type OvertimeCandidateReason = "POST_SHIFT_EXCESS" | "REST_DAY" | "HOLIDAY";

export type OvertimeApprovalStatus = "NONE" | "REQUESTED" | "APPROVED" | "REJECTED";

export type OvertimeCandidateMetadata = {
	overtimeCandidate?: boolean;
	pendingOvertimeMinutes?: number;
	pendingOvertimeHours?: string;
	overtimeCandidateReason?: OvertimeCandidateReason | null;
	overtimeRequestId?: string | null;
	overtimeApprovalStatus?: OvertimeApprovalStatus;
	/** REGULAR = after shift; EARLY = pre-shift overtime (early OT). */
	overtimeKind?: "REGULAR" | "EARLY";
	earlyOvertime?: boolean;
};

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

export function parseOvertimeHoursToMinutes(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return Math.round(value * 60);
	}
	const raw = String(value || "").trim();
	if (!raw) return 0;
	const clock = raw.match(/^(\d+):(\d{1,2})$/);
	if (clock) {
		const hours = Number(clock[1]);
		const minutes = Number(clock[2]);
		if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
		return Math.max(0, hours * 60 + minutes);
	}
	const asNumber = Number(raw);
	if (Number.isFinite(asNumber) && asNumber > 0) {
		return Math.round(asNumber * 60);
	}
	return 0;
}

export function resolveRequestedOvertimeMinutes(metadata: unknown): number {
	const record = asRecord(metadata);
	const requested = Number(record.requestedOvertimeMinutes);
	if (Number.isFinite(requested) && requested > 0) return Math.round(requested);
	const detected = Number(record.detectedOvertimeMinutes);
	if (Number.isFinite(detected) && detected > 0) return Math.round(detected);
	const fromClock = parseOvertimeHoursToMinutes(
		record.requestedOvertimeHours ?? record.detectedOvertimeHours ?? record.overtimeHours,
	);
	if (fromClock > 0) return fromClock;
	return parseOvertimeHoursToMinutes(record.hours);
}

export function isPreApprovedOvertimeMetadata(metadata: unknown): boolean {
	const record = asRecord(metadata);
	if (record.bandaiPayrollSourceRepair) return true;
	const repair = asRecord(record.bandaiPayrollSourceRepair);
	return Boolean(repair.approvedBuckets || repair.source);
}

export function requiresManagerApprovedOvertime(
	config: { requireManagerApprovedOvertime?: boolean | null } | null | undefined,
): boolean {
	return config?.requireManagerApprovedOvertime !== false;
}

export function resolveOvertimeCandidateMinutes(calc: TimekeepingCalculation): number {
	return Math.max(0, Number(calc.overtimeMinutes || 0));
}

export function resolveOvertimeCandidateReason(
	calc: TimekeepingCalculation,
	options?: { isRestDay?: boolean; isHoliday?: boolean },
): OvertimeCandidateReason | null {
	const candidateMinutes = resolveOvertimeCandidateMinutes(calc);
	if (candidateMinutes <= 0) return null;
	if (options?.isHoliday) return "HOLIDAY";
	if (options?.isRestDay) return "REST_DAY";
	return "POST_SHIFT_EXCESS";
}

export function buildOvertimeCandidateMetadata(params: {
	calc: TimekeepingCalculation;
	candidateReason?: OvertimeCandidateReason | null;
	existingMetadata?: Record<string, unknown> | null;
	overtimeRequestId?: string | null;
	overtimeApprovalStatus?: OvertimeApprovalStatus;
}): OvertimeCandidateMetadata {
	const existing = asRecord(params.existingMetadata);
	const candidateMinutes = resolveOvertimeCandidateMinutes(params.calc);
	if (candidateMinutes <= 0) {
		return {
			overtimeCandidate: false,
			pendingOvertimeMinutes: 0,
			pendingOvertimeHours: "0:00",
			overtimeCandidateReason: null,
			overtimeRequestId: existing.overtimeRequestId
				? String(existing.overtimeRequestId)
				: params.overtimeRequestId ?? null,
			overtimeApprovalStatus:
				(existing.overtimeApprovalStatus as OvertimeApprovalStatus | undefined) ||
				params.overtimeApprovalStatus ||
				"NONE",
		};
	}

	return {
		overtimeCandidate: true,
		pendingOvertimeMinutes: candidateMinutes,
		pendingOvertimeHours: formatMinutesAsTime(candidateMinutes),
		overtimeCandidateReason:
			params.candidateReason ||
			(existing.overtimeCandidateReason as OvertimeCandidateReason | undefined) ||
			"POST_SHIFT_EXCESS",
		overtimeRequestId:
			params.overtimeRequestId ??
			(existing.overtimeRequestId ? String(existing.overtimeRequestId) : null),
		overtimeApprovalStatus:
			params.overtimeApprovalStatus ||
			(existing.overtimeApprovalStatus as OvertimeApprovalStatus | undefined) ||
			"NONE",
	};
}

export function deriveOvertimeAwareBehaviorFlags(params: {
	timeIn?: Date | null;
	timeOut?: Date | null;
	schedule?: unknown;
	date: Date;
	calc: TimekeepingCalculation;
	requireManagerApprovedOvertime: boolean;
	overtimeThresholdMinutes?: number;
	isRestDay?: boolean;
	isHoliday?: boolean;
	approvedOvertimeMinutes?: number;
}): AttendanceBehaviorFlag[] {
	const candidateMinutes = resolveOvertimeCandidateMinutes(params.calc);
	const approvedMinutes = Math.max(0, Number(params.approvedOvertimeMinutes || 0));

	if (params.requireManagerApprovedOvertime) {
		const flags: AttendanceBehaviorFlag[] = deriveBehaviorFlags({
			timeIn: params.timeIn,
			timeOut: params.timeOut,
			schedule: params.schedule as any,
			date: params.date,
			overtimeThresholdMinutes: params.overtimeThresholdMinutes,
		}).filter((flag) => flag !== "OVERTIME");

		if (candidateMinutes > 0) {
			flags.push(OT_CANDIDATE_BEHAVIOR_FLAG);
		}
		if (approvedMinutes >= Number(params.overtimeThresholdMinutes ?? 60)) {
			flags.push("OVERTIME");
		}
		return flags;
	}

	return deriveBehaviorFlags({
		timeIn: params.timeIn,
		timeOut: params.timeOut,
		schedule: params.schedule as any,
		date: params.date,
		overtimeThresholdMinutes: params.overtimeThresholdMinutes,
	});
}

export function applyOvertimeApprovalPolicyToTimekeepingFields(params: {
	calc: TimekeepingCalculation;
	requireManagerApprovedOvertime: boolean;
	isNonWorked?: boolean;
	existingMetadata?: Record<string, unknown> | null;
	candidateReason?: OvertimeCandidateReason | null;
	overtimeRequestId?: string | null;
	overtimeApprovalStatus?: OvertimeApprovalStatus;
	approvedOvertimeMinutes?: number;
}): {
	timekeepingFields: ReturnType<typeof buildAttendanceTimekeepingFields>;
	metadata: OvertimeCandidateMetadata;
} {
	const baseFields = buildAttendanceTimekeepingFields(params.calc, {
		isNonWorked: params.isNonWorked,
	});

	if (
		!params.requireManagerApprovedOvertime ||
		isPreApprovedOvertimeMetadata(params.existingMetadata)
	) {
		return {
			timekeepingFields: baseFields,
			metadata: buildOvertimeCandidateMetadata({
				calc: params.calc,
				existingMetadata: params.existingMetadata,
				candidateReason: null,
			}),
		};
	}

	const candidateMetadata = buildOvertimeCandidateMetadata({
		calc: params.calc,
		candidateReason: params.candidateReason,
		existingMetadata: params.existingMetadata,
		overtimeRequestId: params.overtimeRequestId,
		overtimeApprovalStatus: params.overtimeApprovalStatus,
	});

	const approvedMinutes = Math.max(0, Number(params.approvedOvertimeMinutes || 0));
	const payableOvertimeMinutes =
		candidateMetadata.overtimeApprovalStatus === "APPROVED"
			? approvedMinutes || candidateMetadata.pendingOvertimeMinutes || 0
			: 0;

	return {
		timekeepingFields: {
			...baseFields,
			overtimeMinutes: payableOvertimeMinutes,
			overtimeHours: formatMinutesAsTime(payableOvertimeMinutes),
		},
		metadata: candidateMetadata,
	};
}

export function mergeOvertimeMetadata(
	existingMetadata: unknown,
	patch: OvertimeCandidateMetadata,
): Record<string, unknown> {
	return {
		...asRecord(existingMetadata),
		...patch,
	};
}

export function parseDurationToMinutes(timeStr?: string | null): number {
	if (!timeStr || timeStr === "0:00") return 0;
	const [hours, minutes] = String(timeStr).split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	return hours * 60 + minutes;
}

export function resolveOvertimeCandidateForLine(line: {
	metadata?: unknown;
	overtimeHours?: string | null;
}): ReturnType<typeof readOvertimeCandidateFromMetadata> {
	const fromMetadata = readOvertimeCandidateFromMetadata(line.metadata);
	if (fromMetadata.isCandidate) return fromMetadata;

	const record = asRecord(line.metadata);
	const legacyMinutes = Math.max(
		0,
		Number(record.overtimeMinutes || 0),
		parseDurationToMinutes(line.overtimeHours),
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
}

export function readOvertimeCandidateFromMetadata(metadata: unknown): {
	isCandidate: boolean;
	pendingOvertimeMinutes: number;
	pendingOvertimeHours: string;
	overtimeRequestId: string | null;
	overtimeApprovalStatus: OvertimeApprovalStatus;
	overtimeCandidateReason: OvertimeCandidateReason | null;
} {
	const record = asRecord(metadata);
	const pendingOvertimeMinutes = Math.max(0, Number(record.pendingOvertimeMinutes || 0));
	return {
		isCandidate: Boolean(record.overtimeCandidate) && pendingOvertimeMinutes > 0,
		pendingOvertimeMinutes,
		pendingOvertimeHours:
			typeof record.pendingOvertimeHours === "string"
				? record.pendingOvertimeHours
				: formatMinutesAsTime(pendingOvertimeMinutes),
		overtimeRequestId: record.overtimeRequestId ? String(record.overtimeRequestId) : null,
		overtimeApprovalStatus:
			(record.overtimeApprovalStatus as OvertimeApprovalStatus | undefined) || "NONE",
		overtimeCandidateReason:
			(record.overtimeCandidateReason as OvertimeCandidateReason | undefined) || null,
	};
}

export function isActiveOvertimeRequestState(stateKey: string | null | undefined): boolean {
	const normalized = String(stateKey || "").trim().toUpperCase();
	return ["OPEN", "SUBMITTED", "FOR_APPROVAL", "APPROVED", "COMPLETED"].includes(normalized);
}

export type OvertimeSubmitGateViolation = {
	date: string;
	pendingOvertimeHours: string;
	reason: OvertimeCandidateReason | null;
};

export function findUnfiledOvertimeCandidateLines(
	lines: Array<{
		date: Date | string;
		metadata?: unknown;
	}>,
): OvertimeSubmitGateViolation[] {
	const violations: OvertimeSubmitGateViolation[] = [];
	for (const line of lines || []) {
		const candidate = readOvertimeCandidateFromMetadata(line.metadata);
		if (!candidate.isCandidate) continue;
		if (candidate.overtimeRequestId) continue;
		const dateKey =
			line.date instanceof Date
				? line.date.toISOString().split("T")[0]
				: String(line.date).split("T")[0];
		violations.push({
			date: dateKey,
			pendingOvertimeHours: candidate.pendingOvertimeHours,
			reason: candidate.overtimeCandidateReason,
		});
	}
	return violations.sort((left, right) => left.date.localeCompare(right.date));
}

export async function resolveOvertimePolicyApplication(
	prisma: PrismaClient,
	organizationId: string,
	params: {
		calc: TimekeepingCalculation;
		timeIn?: Date | null;
		timeOut?: Date | null;
		schedule?: unknown;
		date: Date;
		isNonWorked?: boolean;
		existingMetadata?: Record<string, unknown> | null;
		attendanceStatus?: string | null;
		approvedOvertimeMinutes?: number;
	},
) {
	const policy = await getTimesheetOvertimePolicy(prisma, organizationId);
	const isRestDay = String(params.attendanceStatus || "").toUpperCase() === "REST_DAY";
	const candidateReason = resolveOvertimeCandidateReason(params.calc, {
		isRestDay,
	});
	const applied = applyOvertimeApprovalPolicyToTimekeepingFields({
		calc: params.calc,
		requireManagerApprovedOvertime: policy.requireManagerApprovedOvertime,
		isNonWorked: params.isNonWorked,
		existingMetadata: params.existingMetadata,
		candidateReason,
		approvedOvertimeMinutes: params.approvedOvertimeMinutes,
	});
	const behaviorFlags =
		params.isNonWorked || String(params.attendanceStatus || "").toUpperCase() === "LEAVE"
			? []
			: deriveOvertimeAwareBehaviorFlags({
					timeIn: params.timeIn,
					timeOut: params.timeOut,
					schedule: params.schedule,
					date: params.date,
					calc: params.calc,
					requireManagerApprovedOvertime: policy.requireManagerApprovedOvertime,
					overtimeThresholdMinutes: policy.overtimeFlagThresholdMinutes,
					isRestDay,
					approvedOvertimeMinutes: params.approvedOvertimeMinutes,
				});

	return {
		policy,
		timekeepingFields: applied.timekeepingFields,
		metadata: applied.metadata,
		behaviorFlags,
	};
}

export async function getTimesheetOvertimePolicy(
	prisma: PrismaClient,
	organizationId: string,
): Promise<{
	requireManagerApprovedOvertime: boolean;
	overtimeFlagThresholdMinutes: number;
}> {
	const config = await getOrCreateNormalizedTimesheetConfig(prisma, organizationId);
	return {
		requireManagerApprovedOvertime: requiresManagerApprovedOvertime(config as any),
		overtimeFlagThresholdMinutes: Number(
			(config as any).overtimeFlagThresholdMinutes ??
				(config as any)?.overtimeQualification?.minimumMinutesBeforeQualification ??
				60,
		),
	};
}