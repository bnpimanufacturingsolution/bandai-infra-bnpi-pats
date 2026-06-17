import { PrismaClient } from "../../generated/prisma";
import { MigrationEventInput } from "./migration-run.types";

export class MigrationEventService {
	constructor(private readonly prisma: PrismaClient) {}

	async append(input: MigrationEventInput) {
		const aggregate = await (this.prisma as any).migrationRunEvent.aggregate({
			where: { runId: input.runId },
			_max: { sequence: true },
		});
		const sequence = Number(aggregate?._max?.sequence || 0) + 1;
		const event = await (this.prisma as any).migrationRunEvent.create({
			data: {
				runId: input.runId,
				sequence,
				stage: input.stage,
				stepCode: input.stepCode || null,
				phase: input.phase || null,
				eventType: input.eventType,
				status: input.status,
				message: input.message,
				sourceWorkbook: input.sourceWorkbook || null,
				sourceFile: input.sourceFile || null,
				sourceSheet: input.sourceSheet || null,
				sourceRow: input.sourceRow || null,
				employeeId: input.employeeId || null,
				employeeName: input.employeeName || null,
				counts: input.counts || undefined,
				metadata: input.metadata || undefined,
			},
		});
		await this.applyEventToRunState(input);
		return event;
	}

	async appendMany(inputs: MigrationEventInput[]) {
		if (inputs.length === 0) return [];
		const runId = inputs[0].runId;
		const aggregate = await (this.prisma as any).migrationRunEvent.aggregate({
			where: { runId },
			_max: { sequence: true },
		});
		const startSequence = Number(aggregate?._max?.sequence || 0) + 1;
		const data = inputs.map((input, index) => ({
			runId: input.runId,
			sequence: startSequence + index,
			stage: input.stage,
			stepCode: input.stepCode || null,
			phase: input.phase || null,
			eventType: input.eventType,
			status: input.status,
			message: input.message,
			sourceWorkbook: input.sourceWorkbook || null,
			sourceFile: input.sourceFile || null,
			sourceSheet: input.sourceSheet || null,
			sourceRow: input.sourceRow || null,
			employeeId: input.employeeId || null,
			employeeName: input.employeeName || null,
			counts: input.counts || undefined,
			metadata: input.metadata || undefined,
		}));
		await (this.prisma as any).migrationRunEvent.createMany({ data });
		await this.applyEventToRunState(inputs[inputs.length - 1]);
		return data;
	}

	private getStepStatus(input: MigrationEventInput) {
		if (input.eventType === "STEP_STARTED" || input.eventType === "SIDE_EFFECT_STARTED" || input.eventType === "MATERIALIZATION_STARTED" || input.eventType === "VERIFICATION_STARTED") {
			return "RUNNING";
		}
		if (
			input.eventType === "STEP_COMPLETED" ||
			input.eventType === "SIDE_EFFECT_COMPLETED" ||
			input.eventType === "MATERIALIZATION_COMPLETED" ||
			input.eventType === "VERIFICATION_COMPLETED" ||
			input.eventType === "DRY_RUN_STEP_COMPLETED"
		) {
			return input.status === "BLOCKED" ? "BLOCKED" : input.status === "COMPLETED_WITH_WARNINGS" ? "WARNING" : "COMPLETED";
		}
		if (input.eventType === "STEP_FAILED") return "FAILED";
		if (input.eventType === "STEP_PROGRESS") return "RUNNING";
		return null;
	}

	private async applyEventToRunState(input: MigrationEventInput) {
		const stepStatus = this.getStepStatus(input);
		if (input.stepCode && stepStatus) {
			await (this.prisma as any).migrationRunStep.updateMany({
				where: { runId: input.runId, stepCode: input.stepCode },
				data: {
					status: stepStatus,
					phase: input.phase || input.status,
					counts: input.counts || undefined,
					startedAt: stepStatus === "RUNNING" ? new Date() : undefined,
					finishedAt: ["COMPLETED", "WARNING", "BLOCKED", "FAILED"].includes(stepStatus) ? new Date() : undefined,
					errorJson: stepStatus === "FAILED" || stepStatus === "BLOCKED" ? { message: input.message } : undefined,
				},
			});
		}

		if (["STEP_STARTED", "STEP_PROGRESS", "SIDE_EFFECT_STARTED", "MATERIALIZATION_STARTED", "VERIFICATION_STARTED"].includes(input.eventType)) {
			await (this.prisma as any).migrationRun.updateMany({
				where: { id: input.runId },
				data: {
					status: input.status,
					phase: input.phase || input.status,
					jobId:
						typeof input.metadata?.employeeImportJobId === "string"
							? input.metadata.employeeImportJobId
							: undefined,
					progress: {
						currentStepCode: input.stepCode || null,
						currentStepLabel: input.metadata?.label || null,
						latestMessage: input.message,
						counts: input.counts || null,
						lastHeartbeatAt: new Date().toISOString(),
					},
				},
			});
		}
	}
}
