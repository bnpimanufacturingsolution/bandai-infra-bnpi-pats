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
} from "../../helper/overtime-approval.helper";
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

export async function applyOvertimeRequestApprovalSideEffects(params: {
	prisma: PrismaClient;
	organizationId: string;
	requestId: string;
	requestMetadata: Record<string, unknown>;
	isApprove: boolean;
	approverEmployeeId?: string | null;
	rejectionReason?: string | null;
}) {
	const metadata = asRecord(params.requestMetadata);
	const timesheetLineId = String(metadata.timesheetLineId || "");
	const timesheetId = String(metadata.timesheetId || "");
	const attendanceId = metadata.attendanceId ? String(metadata.attendanceId) : null;
	const detectedOvertimeMinutes = Math.max(0, Number(metadata.detectedOvertimeMinutes || 0));

	if (!timesheetLineId || !timesheetId) {
		throw new Error("OVERTIME_REQUEST_METADATA_INCOMPLETE");
	}

	const line = await params.prisma.timesheetline.findFirst({
		where: {
			id: timesheetLineId,
			organizationId: params.organizationId,
			timesheetId,
			isDeleted: false,
			isEffective: true,
		},
	});

	if (!line) {
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
	const approvedMetadata = mergeOvertimeMetadata(line.metadata, {
		overtimeApprovalStatus: "APPROVED",
		overtimeRequestId: params.requestId,
		pendingOvertimeMinutes: detectedOvertimeMinutes,
		pendingOvertimeHours: approvedHours,
		overtimeCandidate: detectedOvertimeMinutes > 0,
	});

	await params.prisma.timesheetline.update({
		where: { id: line.id },
		data: {
			overtimeHours: approvedHours,
			metadata: approvedMetadata as Prisma.InputJsonValue,
		},
	});

	if (attendanceId) {
		const attendance = await params.prisma.attendance.findFirst({
			where: {
				id: attendanceId,
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

	const timesheet = await params.prisma.timesheet.findFirst({
		where: {
			id: timesheetId,
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

	return {
		overtimeApprovalStatus: "APPROVED" as const,
		approvedOvertimeHours: approvedHours,
	};
}