import type { Prisma, PrismaClient } from "../../generated/prisma";
import {
	buildPayrollCorrectionPayslipLine,
	computePayrollCorrectionAmount,
	dayKeysFromDeltas,
	hasOverlappingOpenDay,
	mergePayrollCorrectionsIntoMetadata,
	OPEN_PAYROLL_CORRECTION_STATUSES,
	parsePayrollCorrectionDayDeltas,
	resolvePostApprovalStatus,
	sumAppliedCorrectionAmounts,
	validatePayrollCorrectionDayDeltas,
	type PayrollCorrectionDayDelta,
	type PayrollCorrectionPayslipLine,
	type PayrollCorrectionRateContext,
} from "../../helper/payroll-correction.helper";
import {
	createRequestStepExecutions,
	getDefaultRequestWorkflow,
} from "../../helper/request-runtime.helper";
import { REQUEST_WORKFLOW_CODES } from "../../helper/workflow-config.helper";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

const pc = (prisma: PrismaExecutor) => (prisma as any).payrollCorrection;

export const PAYROLL_CORRECTION_REQUEST_TYPE = "PAYROLL_CORRECTION";

function roundMoney(n: number): number {
	return Math.round((Number(n) || 0) * 100) / 100;
}

export async function createPayrollCorrectionRequest(params: {
	prisma: PrismaClient;
	organizationId: string;
	employeeId: string;
	timesheetId: string;
	reason: string;
	dayDeltas: unknown;
	description?: string;
	notes?: string;
	generateRequestCode: (organizationId: string) => Promise<string>;
	rateContext?: PayrollCorrectionRateContext | null;
}) {
	const reason = String(params.reason || "").trim();
	if (!reason) {
		throw new Error("REASON_REQUIRED");
	}

	const validated = validatePayrollCorrectionDayDeltas(params.dayDeltas);
	if (!validated.ok) {
		throw new Error(validated.error || "DAY_DELTAS_REQUIRED");
	}
	const dayDeltas = validated.deltas;

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
					name: true,
					startDate: true,
					endDate: true,
				},
			},
			employeePayroll: {
				select: {
					id: true,
					isPaid: true,
					metadata: true,
				},
			},
		},
	});

	if (!timesheet) {
		throw new Error("TIMESHEET_NOT_FOUND");
	}

	const isPayrollLocked = Boolean(
		timesheet.lockedAt || timesheet.lockedEmployeePayrollId || timesheet.employeePayroll,
	);
	if (!isPayrollLocked) {
		throw new Error("TIMESHEET_NOT_PAYROLL_LOCKED");
	}

	const openExisting = await pc(params.prisma).findMany({
		where: {
			organizationId: params.organizationId,
			sourceTimesheetId: timesheet.id,
			employeeId: params.employeeId,
			isDeleted: false,
			status: { in: OPEN_PAYROLL_CORRECTION_STATUSES },
		},
		select: {
			id: true,
			dayDeltas: true,
		},
	});

	for (const existing of openExisting) {
		const existingDeltas = parsePayrollCorrectionDayDeltas(existing.dayDeltas);
		if (hasOverlappingOpenDay(existingDeltas, dayDeltas)) {
			throw new Error("DUPLICATE_OPEN_CORRECTION_DAY");
		}
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
			basicSalary: true,
		},
	});
	if (!requester) {
		throw new Error("REQUESTER_NOT_FOUND");
	}

	const workflow = await getDefaultRequestWorkflow(
		params.prisma,
		params.organizationId,
		PAYROLL_CORRECTION_REQUEST_TYPE,
		REQUEST_WORKFLOW_CODES.PAYROLL_CORRECTION_DEFAULT,
	);
	if (!workflow) {
		throw new Error("WORKFLOW_NOT_CONFIGURED");
	}

	const rateContext: PayrollCorrectionRateContext = params.rateContext || {
		hourlyRate: estimateHourlyRateFromBasicSalary(requester.basicSalary),
		otMultiplier: 1.5,
		ndPremiumMultiplier: 0.2,
	};
	const estimatedAmount = computePayrollCorrectionAmount(dayDeltas, rateContext);

	const requestCode = await params.generateRequestCode(params.organizationId);
	const dateKeys = dayKeysFromDeltas(dayDeltas).sort();
	const startDate = dateKeys[0] ? new Date(`${dateKeys[0]}T00:00:00.000Z`) : null;
	const endDate = dateKeys[dateKeys.length - 1]
		? new Date(`${dateKeys[dateKeys.length - 1]}T00:00:00.000Z`)
		: null;

	const description =
		params.description?.trim() ||
		`Payroll correction for timesheet ${timesheet.code} (${dateKeys.join(", ")})`;

	const result = await params.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
		const createdRequest = await tx.request.create({
			data: {
				organizationId: params.organizationId,
				code: requestCode,
				type: PAYROLL_CORRECTION_REQUEST_TYPE as any,
				currentWorkflowStateKey: "OPEN",
				description,
				startDate,
				endDate,
				requester: {
					connect: { id: requester.id },
				},
				metadata: {
					timesheetAction: "PAYROLL_CORRECTION",
					timesheetId: timesheet.id,
					timesheetCode: timesheet.code,
					sourcePayrollPeriodId: timesheet.payrollPeriodId,
					sourcePayrollPeriodCode: timesheet.payrollPeriod?.code || null,
					sourcePayrollPeriodName: timesheet.payrollPeriod?.name || null,
					sourceEmployeePayrollId:
						timesheet.lockedEmployeePayrollId || timesheet.employeePayroll?.id || null,
					dayDeltas,
					reason,
					estimatedAmount,
					rateContext,
				},
				notes: params.notes || null,
			},
		});

		await createRequestStepExecutions(tx, {
			organizationId: params.organizationId,
			requestId: createdRequest.id,
			steps: workflow.steps,
			workflowStates: workflow.states,
			workflowCode: workflow.code,
			workflowName: workflow.name,
			workflowDescription: workflow.description,
			requestType: PAYROLL_CORRECTION_REQUEST_TYPE,
			requesterId: requester.id,
			reportToId: requester.reportToId,
		});

		const correction = await pc(tx).create({
			data: {
				organizationId: params.organizationId,
				employeeId: requester.id,
				sourcePayrollPeriodId: timesheet.payrollPeriodId,
				sourceTimesheetId: timesheet.id,
				sourceEmployeePayrollId:
					timesheet.lockedEmployeePayrollId || timesheet.employeePayroll?.id || null,
				requestId: createdRequest.id,
				status: "REQUESTED",
				reason,
				dayDeltas,
				estimatedAmount,
				metadata: {
					timesheetCode: timesheet.code,
					periodCode: timesheet.payrollPeriod?.code || null,
					periodName: timesheet.payrollPeriod?.name || null,
					rateContext,
				},
			},
		});

		return {
			requestId: createdRequest.id,
			requestCode: createdRequest.code,
			correctionId: correction.id,
			status: correction.status as string,
			estimatedAmount,
			dayDeltas,
		};
	});

	return result;
}

function estimateHourlyRateFromBasicSalary(basicSalary: number | null | undefined): number {
	const monthly = Number(basicSalary) || 0;
	// Rough default: monthly / 22 days / 8 hours (generate-time recalculates with real rates)
	if (monthly <= 0) return 0;
	return Math.round((monthly / 22 / 8) * 100) / 100;
}

export async function applyPayrollCorrectionApprovalSideEffects(params: {
	prisma: PrismaClient;
	organizationId: string;
	requestId: string;
	requestMetadata?: Record<string, unknown> | null;
	isApprove: boolean;
	approverEmployeeId?: string | null;
	rejectionReason?: string | null;
}) {
	const now = new Date();
	const existing = await pc(params.prisma).findFirst({
		where: {
			organizationId: params.organizationId,
			requestId: params.requestId,
			isDeleted: false,
		},
	});

	if (!existing) {
		// Create from request metadata if correction row missing (resilience)
		if (!params.isApprove) return { updated: false };
		const meta = params.requestMetadata || {};
		const timesheetId = String(meta.timesheetId || "");
		if (!timesheetId) return { updated: false };
		return { updated: false, missing: true as const };
	}

	if (existing.status === "APPLIED" || existing.status === "VOID") {
		return { updated: false, status: existing.status as string };
	}

	if (!params.isApprove) {
		const updated = await pc(params.prisma).update({
			where: { id: existing.id },
			data: {
				status: "REJECTED",
				rejectedAt: now,
				rejectedBy: params.approverEmployeeId || null,
				rejectionReason: params.rejectionReason || "Rejected by approver",
			},
		});
		return { updated: true, status: updated.status as string, correctionId: updated.id };
	}

	const dayDeltas = parsePayrollCorrectionDayDeltas(existing.dayDeltas);
	const estimatedAmount =
		existing.estimatedAmount != null
			? Number(existing.estimatedAmount)
			: computePayrollCorrectionAmount(dayDeltas, {
					hourlyRate: 0,
				});
	const resolved = resolvePostApprovalStatus(estimatedAmount);
	const metadata = {
		...((existing.metadata as Record<string, unknown>) || {}),
		holdReason: resolved.holdReason || null,
	};

	const updated = await pc(params.prisma).update({
		where: { id: existing.id },
		data: {
			status: resolved.status,
			approvedAt: now,
			approvedBy: params.approverEmployeeId || null,
			estimatedAmount,
			metadata,
			rejectedAt: null,
			rejectedBy: null,
			rejectionReason: null,
		},
	});

	return {
		updated: true,
		status: updated.status as string,
		correctionId: updated.id,
		holdReason: resolved.holdReason || null,
	};
}

export async function listReadyPayrollCorrectionsForEmployees(params: {
	prisma: PrismaExecutor;
	organizationId: string;
	employeeIds: string[];
	/** When set, only corrections with null target or matching target */
	targetPayrollPeriodId?: string | null;
}) {
	if (!params.employeeIds.length) return [];
	const where: Record<string, unknown> = {
		organizationId: params.organizationId,
		employeeId: { in: params.employeeIds },
		status: "READY",
		isDeleted: false,
	};
	if (params.targetPayrollPeriodId) {
		where.OR = [
			{ targetPayrollPeriodId: null },
			{ targetPayrollPeriodId: params.targetPayrollPeriodId },
		];
	}
	return pc(params.prisma).findMany({
		where,
		orderBy: { approvedAt: "asc" },
	});
}

export async function countReadyPayrollCorrections(params: {
	prisma: PrismaExecutor;
	organizationId: string;
	employeeIds?: string[];
}) {
	const where: Record<string, unknown> = {
		organizationId: params.organizationId,
		status: "READY",
		isDeleted: false,
	};
	if (params.employeeIds?.length) {
		where.employeeId = { in: params.employeeIds };
	}
	return pc(params.prisma).count({ where });
}

export type ApplyCorrectionsResult = {
	applied: PayrollCorrectionPayslipLine[];
	appliedAmount: number;
	correctionIds: string[];
	skipped: Array<{ id: string; reason: string }>;
};

/**
 * Apply READY corrections onto a just-generated EmployeePayroll (idempotent).
 * Also re-includes corrections already APPLIED to this target period so re-generate
 * restores retro money without double-counting status transitions.
 */
export async function applyReadyPayrollCorrectionsToEmployeePayroll(params: {
	prisma: PrismaExecutor;
	organizationId: string;
	employeeId: string;
	targetPayrollPeriodId: string;
	employeePayrollId: string;
	existingMetadata: unknown;
	existingOtherCompensation?: number;
	existingGrossPay?: number;
	existingNetPay?: number;
	rateContext: PayrollCorrectionRateContext;
	sourcePeriodNameById?: Map<string, string>;
}): Promise<ApplyCorrectionsResult> {
	const ready = await listReadyPayrollCorrectionsForEmployees({
		prisma: params.prisma,
		organizationId: params.organizationId,
		employeeIds: [params.employeeId],
		targetPayrollPeriodId: params.targetPayrollPeriodId,
	});

	// Re-generate: restore lines already applied to this period (status stays APPLIED)
	const alreadyOnPeriod = await pc(params.prisma).findMany({
		where: {
			organizationId: params.organizationId,
			employeeId: params.employeeId,
			status: "APPLIED",
			appliedPayrollPeriodId: params.targetPayrollPeriodId,
			isDeleted: false,
		},
	});

	const applied: PayrollCorrectionPayslipLine[] = [];
	const skipped: Array<{ id: string; reason: string }> = [];
	const now = new Date();
	const seenIds = new Set<string>();

	const toLine = (row: any, amount: number, dayDeltas: PayrollCorrectionDayDelta[]) => {
		const periodName =
			params.sourcePeriodNameById?.get(row.sourcePayrollPeriodId) ||
			((row.metadata as any)?.periodName as string | undefined) ||
			null;
		return buildPayrollCorrectionPayslipLine({
			correctionId: row.id,
			requestId: row.requestId,
			sourcePayrollPeriodId: row.sourcePayrollPeriodId,
			sourcePayrollPeriodName: periodName,
			sourceTimesheetId: row.sourceTimesheetId,
			dayDeltas,
			amount,
			appliedAt: row.appliedAt ? new Date(row.appliedAt) : now,
		});
	};

	for (const row of alreadyOnPeriod) {
		const dayDeltas = parsePayrollCorrectionDayDeltas(row.dayDeltas);
		const amount =
			row.appliedAmount != null
				? Number(row.appliedAmount)
				: computePayrollCorrectionAmount(dayDeltas, params.rateContext);
		if (amount < 0) {
			skipped.push({ id: row.id, reason: "NEGATIVE_SKIP" });
			continue;
		}
		// Keep FK pointing at current employee payroll row after re-upsert
		await pc(params.prisma).updateMany({
			where: { id: row.id, status: "APPLIED", isDeleted: false },
			data: {
				appliedEmployeePayrollId: params.employeePayrollId,
				appliedAmount: amount,
			},
		});
		applied.push(toLine(row, amount, dayDeltas));
		seenIds.add(row.id);
	}

	for (const row of ready) {
		if (seenIds.has(row.id)) {
			skipped.push({ id: row.id, reason: "ALREADY_INCLUDED" });
			continue;
		}
		// Idempotency: never re-apply
		if (row.status !== "READY") {
			skipped.push({ id: row.id, reason: "NOT_READY" });
			continue;
		}
		if (row.appliedEmployeePayrollId || row.appliedAt) {
			skipped.push({ id: row.id, reason: "ALREADY_APPLIED" });
			continue;
		}
		if (
			row.targetPayrollPeriodId &&
			row.targetPayrollPeriodId !== params.targetPayrollPeriodId
		) {
			skipped.push({ id: row.id, reason: "TARGET_MISMATCH" });
			continue;
		}

		const dayDeltas = parsePayrollCorrectionDayDeltas(row.dayDeltas);
		const amount = computePayrollCorrectionAmount(dayDeltas, params.rateContext);

		// Negative should not be READY in normal path; skip defensively
		if (amount < 0) {
			await pc(params.prisma).update({
				where: { id: row.id },
				data: {
					status: "APPROVED_HOLD",
					metadata: {
						...((row.metadata as Record<string, unknown>) || {}),
						holdReason: "NEGATIVE_DELTA_REQUIRES_HR_PATH",
						heldAtGenerate: now.toISOString(),
					},
				},
			});
			skipped.push({ id: row.id, reason: "NEGATIVE_HELD" });
			continue;
		}

		const line = toLine(row, amount, dayDeltas);

		// Conditional update prevents double-apply races
		const updateResult = await pc(params.prisma).updateMany({
			where: {
				id: row.id,
				status: "READY",
				appliedAt: null,
				isDeleted: false,
			},
			data: {
				status: "APPLIED",
				appliedAt: now,
				appliedPayrollPeriodId: params.targetPayrollPeriodId,
				appliedEmployeePayrollId: params.employeePayrollId,
				appliedAmount: amount,
				targetPayrollPeriodId: params.targetPayrollPeriodId,
			},
		});

		if (!updateResult.count) {
			skipped.push({ id: row.id, reason: "RACE_OR_ALREADY_APPLIED" });
			continue;
		}

		applied.push(line);
		seenIds.add(row.id);
	}

	const appliedAmount = sumAppliedCorrectionAmounts(applied);
	return {
		applied,
		appliedAmount,
		correctionIds: applied.map((l) => l.correctionId),
		skipped,
	};
}

export function buildUpdatedPayrollMoneyAfterCorrections(params: {
	existingMetadata: unknown;
	lines: PayrollCorrectionPayslipLine[];
	otherCompensation: number;
	grossPay: number;
	netPay: number;
	/** When set, bumped by the same applied amount so receivable stays aligned with net */
	totalReceivable?: number;
}): {
	metadata: Record<string, unknown>;
	otherCompensation: number;
	grossPay: number;
	netPay: number;
	totalReceivable?: number;
	appliedAmount: number;
} {
	const appliedAmount = sumAppliedCorrectionAmounts(params.lines);
	const metadata = mergePayrollCorrectionsIntoMetadata(params.existingMetadata, params.lines, {
		payrollCorrectionsAppliedAmount: appliedAmount,
	});
	const nextNet = roundMoney(params.netPay + appliedAmount);
	return {
		metadata,
		otherCompensation: roundMoney(params.otherCompensation + appliedAmount),
		grossPay: roundMoney(params.grossPay + appliedAmount),
		netPay: nextNet,
		...(params.totalReceivable != null
			? { totalReceivable: roundMoney(Number(params.totalReceivable) + appliedAmount) }
			: {}),
		appliedAmount,
	};
}

export async function listPayrollCorrectionsForTimesheet(params: {
	prisma: PrismaExecutor;
	organizationId: string;
	timesheetId: string;
	employeeId?: string;
}) {
	const where: Record<string, unknown> = {
		organizationId: params.organizationId,
		sourceTimesheetId: params.timesheetId,
		isDeleted: false,
	};
	if (params.employeeId) {
		where.employeeId = params.employeeId;
	}
	return pc(params.prisma).findMany({
		where,
		orderBy: { createdAt: "desc" },
	});
}

export type { PayrollCorrectionDayDelta, PayrollCorrectionPayslipLine };
