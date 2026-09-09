import type { Prisma, PrismaClient } from "../../generated/prisma";
import {
	applyAttendanceToObligation,
	materializeTimesheetLinesFromObligations,
} from "../../helper/attendance-obligation.helper";
import {
	formatMinutesAsTime,
	calculateTimekeeping,
} from "../../helper/timekeeping.helper";
import {
	mergeOvertimeMetadata,
	resolveOvertimeCandidateForLine,
	resolveOvertimePolicyApplication,
	resolveRequestedOvertimeMinutes,
} from "../../helper/overtime-approval.helper";
import { getBusinessDayBounds } from "../../helper/attendance.helper";
import {
	createRequestStepExecutions,
	getDefaultRequestWorkflow,
	updateRequestStepProgress,
} from "../../helper/request-runtime.helper";
import { REQUEST_WORKFLOW_CODES } from "../../helper/workflow-config.helper";
import { refreshTimesheetForAttendanceDate } from "../../helper/timesheet.helper";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

export async function createOvertimeRequestForTimesheetLine(params: {
	prisma: PrismaClient;
	organizationId: string;
	employeeId: string;
	timesheetId: string;
	timesheetLineId?: string | null;
	date: Date | string;
	description?: string;
	notes?: string;
	generateRequestCode: (organizationId: string) => Promise<string>;
}) {
	const date = new Date(params.date);
	date.setUTCHours(0, 0, 0, 0);

	const timesheet = await params.prisma.timesheet.findFirst({
		where: {
			id: params.timesheetId,
			organizationId: params.organizationId,
			employeeId: params.employeeId,
			isDeleted: false,
		},
		include: {
			payrollPeriod: {
				select: {
					id: true,
					code: true,
					startDate: true,
					endDate: true,
				},
			},
		},
	});

	if (!timesheet) {
		throw new Error("TIMESHEET_NOT_FOUND");
	}

	const line = params.timesheetLineId
		? await params.prisma.timesheetline.findFirst({
				where: {
					id: params.timesheetLineId,
					organizationId: params.organizationId,
					timesheetId: params.timesheetId,
					isDeleted: false,
					isEffective: true,
				},
			})
		: await params.prisma.timesheetline.findFirst({
				where: {
					organizationId: params.organizationId,
					timesheetId: params.timesheetId,
					date,
					isDeleted: false,
					isEffective: true,
				},
			});

	if (!line) {
		throw new Error("TIMESHEET_LINE_NOT_FOUND");
	}

	const candidate = resolveOvertimeCandidateForLine({
		metadata: line.metadata,
		overtimeHours: line.overtimeHours,
	});
	if (!candidate.isCandidate) {
		throw new Error("NOT_OVERTIME_CANDIDATE");
	}
	if (candidate.overtimeRequestId) {
		throw new Error("OVERTIME_REQUEST_ALREADY_FILED");
	}

	const requester = await params.prisma.employee.findFirst({
		where: {
			id: params.employeeId,
			organizationId: params.organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			reportToId: true,
		},
	});
	if (!requester) {
		throw new Error("REQUESTER_NOT_FOUND");
	}

	const workflow = await getDefaultRequestWorkflow(
		params.prisma,
		params.organizationId,
		"OVERTIME",
		REQUEST_WORKFLOW_CODES.OVERTIME_DEFAULT,
	);
	if (!workflow) {
		throw new Error("WORKFLOW_NOT_CONFIGURED");
	}

	const requestCode = await params.generateRequestCode(params.organizationId);
	const now = new Date();
	const description =
		params.description?.trim() ||
		`Overtime approval for ${date.toISOString().split("T")[0]} (${candidate.pendingOvertimeHours})`;

	const request = await params.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
		const created = await tx.request.create({
			data: {
				organizationId: params.organizationId,
				code: requestCode,
				type: "OVERTIME",
				currentWorkflowStateKey: "OPEN",
				description,
				startDate: date,
				endDate: date,
				requester: {
					connect: { id: requester.id },
				},
				metadata: {
					timesheetId: timesheet.id,
					timesheetCode: timesheet.code,
					timesheetLineId: line.id,
					attendanceId: line.attendanceId || null,
					date: date.toISOString().split("T")[0],
					detectedOvertimeMinutes: candidate.pendingOvertimeMinutes,
					detectedOvertimeHours: candidate.pendingOvertimeHours,
					overtimeHours: candidate.pendingOvertimeHours,
					hours: Number((candidate.pendingOvertimeMinutes / 60).toFixed(2)),
					overtimeCandidateReason: candidate.overtimeCandidateReason,
					periodCode: timesheet.payrollPeriod?.code || null,
				},
				notes: params.notes || null,
			},
		});

		await createRequestStepExecutions(tx, {
			organizationId: params.organizationId,
			requestId: created.id,
			steps: workflow.steps,
			workflowStates: workflow.states,
			workflowCode: workflow.code,
			workflowName: workflow.name,
			workflowDescription: workflow.description,
			requestType: "OVERTIME",
			requesterId: requester.id,
			reportToId: requester.reportToId,
		});

		const nextMetadata = mergeOvertimeMetadata(line.metadata, {
			overtimeCandidate: true,
			pendingOvertimeMinutes: candidate.pendingOvertimeMinutes,
			pendingOvertimeHours: candidate.pendingOvertimeHours,
			overtimeCandidateReason: candidate.overtimeCandidateReason,
			overtimeRequestId: created.id,
			overtimeApprovalStatus: "REQUESTED",
		});

		await tx.timesheetline.update({
			where: { id: line.id },
			data: {
				metadata: nextMetadata as Prisma.InputJsonValue,
			},
		});

		if (line.attendanceId) {
			const obligation = await (tx as any).attendanceObligation.findFirst({
				where: {
					organizationId: params.organizationId,
					employeeId: params.employeeId,
					attendanceId: line.attendanceId,
					isDeleted: false,
				},
				select: { id: true, metadata: true },
			});
			if (obligation) {
				await (tx as any).attendanceObligation.update({
					where: { id: obligation.id },
					data: {
						metadata: mergeOvertimeMetadata(obligation.metadata, {
							overtimeCandidate: true,
							pendingOvertimeMinutes: candidate.pendingOvertimeMinutes,
							pendingOvertimeHours: candidate.pendingOvertimeHours,
							overtimeCandidateReason: candidate.overtimeCandidateReason,
							overtimeRequestId: created.id,
							overtimeApprovalStatus: "REQUESTED",
						}) as Prisma.InputJsonValue,
					},
				});
			}
		}

		return created;
	});

	return {
		requestId: request.id,
		requestCode: request.code,
		timesheetId: timesheet.id,
		timesheetLineId: line.id,
		overtimeApprovalStatus: "REQUESTED" as const,
	};
}

export type OvertimeTargetLine = {
	id: string;
	timesheetId: string;
	employeeId: string;
	date: Date;
	attendanceId: string | null;
	metadata: unknown;
};

/**
 * Resolve the effective timesheet line an OVERTIME approval would write to.
 * Lookup order (shared by the approval pre-check and the side effect so both
 * always agree):
 *   1. explicit metadata.timesheetLineId (timesheet-page filed OT)
 *   2. (employeeId, date) effective line
 *   3. materialize lines from obligations when a period timesheet exists and
 *      is not already frozen (APPROVED/SUBMITTED state truth)
 * Returns line: null when nothing applies â€” the caller decides whether that is
 * a hard refusal (approve path) or a silent skip (reject path).
 */
export async function resolveOvertimeApprovalTargetLine(params: {
	prisma: PrismaClient;
	organizationId: string;
	requestMetadata: Record<string, unknown>;
	targetEmployeeId?: string | null;
	requesterEmployeeId?: string | null;
}): Promise<{ line: OvertimeTargetLine | null; employeeId: string; dateKey: string }> {
	const metadata = asRecord(params.requestMetadata);
	const timesheetLineId = String(metadata.timesheetLineId || "");
	const timesheetId = String(metadata.timesheetId || "");
	const attendanceId = metadata.attendanceId ? String(metadata.attendanceId) : null;
	// Target resolution order: explicit metadata.employeeId (set by self-service
	// and by the leader-filed UI payload), then the request's on-behalf target,
	// then the requester. For leader-filed requests the requester is the LEADER,
	// so skipping the target would write OT to the leader's timesheet.
	const employeeId = String(
		metadata.employeeId || params.targetEmployeeId || params.requesterEmployeeId || "",
	);
	const dateKey = String(metadata.date || "").slice(0, 10);

	if (timesheetLineId) {
		const line = await params.prisma.timesheetline.findFirst({
			where: {
				id: timesheetLineId,
				organizationId: params.organizationId,
				isDeleted: false,
				isEffective: true,
				// Frozen timesheets are never valid approval targets â€” even when the
				// line id was passed explicitly (timesheet-page filed OT).
				timesheet: { isDeleted: false, status: { notIn: ["APPROVED", "SUBMITTED"] } },
			},
		});
		if (line) {
			return { line: line as unknown as OvertimeTargetLine, employeeId, dateKey };
		}
	}

	if (employeeId && dateKey) {
		const bounds = getBusinessDayBounds(new Date(`${dateKey}T00:00:00.000Z`));
		// Prefer the exact-date line inside a NON-FROZEN timesheet. The business
		// window spans two calendar dates (Manila offset), so a desc-only lookup
		// could pick the neighboring day's line from an APPROVED (frozen)
		// timesheet and overwrite payroll-ready OT. Frozen timesheets are never
		// valid approval targets.
		const line = await params.prisma.timesheetline.findFirst({
			where: {
				organizationId: params.organizationId,
				employeeId,
				isDeleted: false,
				isEffective: true,
				date: { gte: bounds.start, lte: bounds.end },
				timesheet: { isDeleted: false, status: { notIn: ["APPROVED", "SUBMITTED"] } },
			},
			orderBy: [{ date: "asc" as const }, { createdAt: "asc" as const }],
		});
		if (line) {
			return { line: line as unknown as OvertimeTargetLine, employeeId, dateKey };
		}

		const timesheet = await params.prisma.timesheet.findFirst({
			where: {
				organizationId: params.organizationId,
				employeeId,
				isDeleted: false,
				// Only unfrozen timesheets may be materialized into / targeted.
				status: { notIn: ["APPROVED", "SUBMITTED"] },
				payrollPeriod: {
					startDate: { lte: bounds.end },
					endDate: { gte: bounds.start },
				},
			},
			select: { id: true, employeeId: true, payrollPeriodId: true },
		});
		if (timesheet) {
			await materializeTimesheetLinesFromObligations(params.prisma, {
				organizationId: params.organizationId,
				employeeId: timesheet.employeeId,
				payrollPeriodId: timesheet.payrollPeriodId,
				timesheetId: timesheet.id,
				fromDate: bounds.start,
				toDate: bounds.end,
			});
			const materialized = await params.prisma.timesheetline.findFirst({
				where: {
					organizationId: params.organizationId,
					timesheetId: timesheet.id,
					employeeId,
					isDeleted: false,
					isEffective: true,
					date: { gte: bounds.start, lte: bounds.end },
				},
			});
			if (materialized) {
				return { line: materialized as unknown as OvertimeTargetLine, employeeId, dateKey };
			}
		}
	}

	return { line: null, employeeId, dateKey };
}

export async function applyOvertimeRequestApprovalSideEffects(params: {
	prisma: PrismaClient;
	organizationId: string;
	requestId: string;
	requestMetadata: Record<string, unknown>;
	isApprove: boolean;
	approverEmployeeId?: string | null;
	requesterEmployeeId?: string | null;
	/** On-behalf target (e.g. leader-filed OT for a section member). */
	targetEmployeeId?: string | null;
	rejectionReason?: string | null;
}) {
	const metadata = asRecord(params.requestMetadata);
	const timesheetId = String(metadata.timesheetId || "");
	const attendanceId = metadata.attendanceId ? String(metadata.attendanceId) : null;
	const detectedOvertimeMinutes = resolveRequestedOvertimeMinutes(metadata);

	const resolved = await resolveOvertimeApprovalTargetLine({
		prisma: params.prisma,
		organizationId: params.organizationId,
		requestMetadata: metadata,
		targetEmployeeId: params.targetEmployeeId,
		requesterEmployeeId: params.requesterEmployeeId,
	});
	const line = resolved.line;
	const employeeId = resolved.employeeId;
	const dateKey = resolved.dateKey;

	if (!line) {
		// Reject path: nothing to stamp on a missing line â€” skip gracefully.
		if (!params.isApprove) {
			return { overtimeApprovalStatus: "REJECTED" as const, lineUpdated: false };
		}
		// Approve path: refusing here is a policy violation signal â€” the caller
		// (approval pre-check) must have refused with a clear 409 already.
		throw new Error("TIMESHEET_LINE_NOT_FOUND");
	}

	if (!params.isApprove) {
		const rejectedMetadata = mergeOvertimeMetadata(line.metadata, {
			overtimeApprovalStatus: "REJECTED",
			overtimeRequestId: params.requestId,
		});
		await params.prisma.timesheetline.update({
			where: { id: line.id },
			data: { metadata: rejectedMetadata as Prisma.InputJsonValue },
		});
		return { overtimeApprovalStatus: "REJECTED" as const };
	}

	const approvedHours = formatMinutesAsTime(detectedOvertimeMinutes);
	// Early OT support: carry the requested kind (REGULAR | EARLY) from the
	// request metadata onto the effective timesheet line so payroll/register
	// mapping can bucket pre-shift OT separately from after-shift OT.
	const requestedOvertimeKind = String(metadata.overtimeKind || "")
		.toUpperCase()
		=== "EARLY"
		? "EARLY"
		: "REGULAR";


	const resolvedAttendanceId = attendanceId || line.attendanceId || null;
	if (resolvedAttendanceId) {
		const attendance = await params.prisma.attendance.findFirst({
			where: {
				id: resolvedAttendanceId,
				organizationId: params.organizationId,
				isDeleted: false,
			},
		});
		if (attendance) {
			const calc = calculateTimekeeping(
				attendance.timeIn,
				attendance.timeOut,
				attendance.scheduleSnapshot as any,
				attendance.date || line.date,
			);
			const applied = await resolveOvertimePolicyApplication(
				params.prisma,
				params.organizationId,
				{
					calc,
					timeIn: attendance.timeIn,
					timeOut: attendance.timeOut,
					schedule: attendance.scheduleSnapshot,
					date: attendance.date || line.date,
					attendanceStatus: attendance.status,
					approvedOvertimeMinutes: detectedOvertimeMinutes,
				},
			);

			await params.prisma.attendance.update({
				where: { id: attendance.id },
				data: {
					...applied.timekeepingFields,
					behaviorFlags: applied.behaviorFlags,
				},
			});

			await applyAttendanceToObligation(params.prisma, {
				organizationId: params.organizationId,
				employeeId: line.employeeId,
				attendanceId: attendance.id,
			});
		}
	}
	// NOTE: the payable-OT stamp below must be the LAST write to the target
	// line. Materialization/refresh recomputes lines from obligations and
	// replaces metadata, which would erase the approval stamp â€” so refresh
	// first (when the timesheet is unfrozen), then stamp.
	const timesheet = await params.prisma.timesheet.findFirst({
		where: {
			id: timesheetId || line.timesheetId,
			organizationId: params.organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			employeeId: true,
			payrollPeriodId: true,
			status: true,
		},
	});

	if (timesheet && !["SUBMITTED", "APPROVED"].includes(String(timesheet.status || "").toUpperCase())) {
		await materializeTimesheetLinesFromObligations(params.prisma, {
			organizationId: params.organizationId,
			employeeId: timesheet.employeeId,
			payrollPeriodId: timesheet.payrollPeriodId,
			timesheetId: timesheet.id,
			fromDate: line.date,
			toDate: line.date,
		});
		await refreshTimesheetForAttendanceDate(params.prisma, {
			organizationId: params.organizationId,
			employeeId: timesheet.employeeId,
			date: line.date,
		});
	}

	// Re-read the line: materialization/refresh may have replaced it.
	const refreshed = await params.prisma.timesheetline.findFirst({
		where: {
			organizationId: params.organizationId,
			timesheetId: line.timesheetId,
			employeeId: line.employeeId,
			isDeleted: false,
			isEffective: true,
			date: line.date,
		},
	});
	const stampTarget = refreshed || line;
	const refreshedApprovedMetadata = mergeOvertimeMetadata(stampTarget.metadata, {
		overtimeApprovalStatus: "APPROVED",
		overtimeRequestId: params.requestId,
		pendingOvertimeMinutes: detectedOvertimeMinutes,
		pendingOvertimeHours: approvedHours,
		overtimeCandidate: detectedOvertimeMinutes > 0,
		overtimeKind: requestedOvertimeKind,
		...(requestedOvertimeKind === "EARLY" ? { earlyOvertime: true } : {}),
	});

	await params.prisma.timesheetline.update({
		where: { id: stampTarget.id },
		data: {
			overtimeHours: approvedHours,
			metadata: refreshedApprovedMetadata as Prisma.InputJsonValue,
		},
	});

	return {
		overtimeApprovalStatus: "APPROVED" as const,
		approvedOvertimeHours: approvedHours,
	};

}

