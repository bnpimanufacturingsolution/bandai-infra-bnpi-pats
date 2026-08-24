import { PrismaClient } from "../../generated/prisma";
import { applyAttendanceBackfill } from "./attendance-backfill.service";
import {
	AttendanceCorrectionError,
	applyAttendanceCorrection,
	type AttendanceCorrectionMutationDependencies,
	type AttendanceCorrectionRawInput,
	type AttendanceCorrectionSource,
} from "./attendance-correction.service";

const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

export const isVirtualAttendanceId = (value?: unknown): boolean => {
	const id = String(value || "").trim();
	if (!id) return true;
	return (
		id.startsWith("absent-") ||
		id.startsWith("expected-") ||
		id.startsWith("virtual-") ||
		id.startsWith("obligation-")
	);
};

const resolveRealAttendanceId = (value?: unknown): string | null => {
	const id = String(value || "").trim();
	if (!id || isVirtualAttendanceId(id)) return null;
	return id;
};

export type ApplyAttendanceCorrectionRequestInput = {
	prisma: PrismaClient;
	organizationId: string;
	requestId: string;
	requesterId?: string | null;
	targetEmployeeId?: string | null;
	startDate?: Date | string | null;
	endDate?: Date | string | null;
	notes?: string | null;
	metadata?: unknown;
	actorEmployeeId?: string | null;
	now?: Date;
	dependencies?: AttendanceCorrectionMutationDependencies;
};

const buildRawInput = (
	params: ApplyAttendanceCorrectionRequestInput,
): AttendanceCorrectionRawInput => {
	const metadata = asRecord(params.metadata);
	const correction = asRecord(metadata.attendanceCorrection);
	const correctedValues = asRecord(correction.correctedValues);
	return {
		attendanceId: resolveRealAttendanceId(
			correction.attendanceId ||
				asRecord(correction.attendance).id ||
				correction.targetAttendanceId,
		),
		employeeId:
			String(
				params.targetEmployeeId || params.requesterId || correction.employeeId || "",
			).trim() || null,
		correctionDate: correction.correctionDate || params.startDate || params.endDate,
		status: correctedValues.status ?? correction.status ?? null,
		timeIn: correctedValues.timeIn ?? correction.timeIn ?? metadata.timeIn ?? null,
		timeOut: correctedValues.timeOut ?? correction.timeOut ?? metadata.timeOut ?? null,
		reasonCategory:
			correction.reasonCategory ||
			correctedValues.reasonCategory ||
			metadata.adjustmentType ||
			null,
		notes:
			correction.reason ||
			params.notes ||
			correctedValues.notes ||
			metadata.reason ||
			null,
		timeInLocation: correctedValues.timeInLocation ?? correction.timeInLocation ?? null,
		timeOutLocation: correctedValues.timeOutLocation ?? correction.timeOutLocation ?? null,
	};
};

export async function applyAttendanceCorrectionRequest(
	params: ApplyAttendanceCorrectionRequestInput,
) {
	const rawInput = buildRawInput(params);
	const source: AttendanceCorrectionSource = "ATTENDANCE_CORRECTION_REQUEST";
	const dependencies = {
		...(params.dependencies || {}),
		...(params.now ? { now: () => params.now as Date } : {}),
	};
	const backfillArgs = {
		prisma: params.prisma,
		organizationId: params.organizationId,
		rawInput,
		source,
		actorEmployeeId: params.actorEmployeeId || null,
		sourceRequestId: params.requestId,
		notesFallbacks: [rawInput.notes, params.notes],
		dependencies,
	};

	if (!rawInput.attendanceId) {
		return applyAttendanceBackfill(backfillArgs);
	}

	try {
		return await applyAttendanceCorrection({
			...backfillArgs,
			allowDerivedStatus: true,
		});
	} catch (error) {
		if (
			error instanceof AttendanceCorrectionError &&
			(error.statusCode === 400 || error.statusCode === 404)
		) {
			return applyAttendanceBackfill({
				...backfillArgs,
				rawInput: { ...rawInput, attendanceId: null },
			});
		}
		throw error;
	}
}
