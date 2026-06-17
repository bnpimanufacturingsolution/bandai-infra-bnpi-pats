import { randomUUID } from "crypto";
import { getLogger } from "../../helper/logger.helper";

const logger = getLogger();
const payrollJobLogger = logger.child({ module: "payroll-generation-job-service" });

export type PayrollGenerationJobError = {
	row: number;
	employeeId: string;
	error: string;
};

export type PayrollGenerationJobProgress = {
	jobId: string;
	periodId?: string;
	status: "processing" | "paused" | "completed" | "failed" | "cancelled";
	total: number;
	processed: number;
	success: number;
	failed: number;
	errors: PayrollGenerationJobError[];
	startedAt: Date;
	completedAt?: Date;
	message?: string;
	cancellationRequested?: boolean;
	cancellationRequestedAt?: Date;
	pauseRequested?: boolean;
	pauseRequestedAt?: Date;
};

export class PayrollGenerationJobService {
	private static jobs: Map<string, PayrollGenerationJobProgress> = new Map();
	private static activeJobIdsByPeriodId: Map<string, string> = new Map();
	private static readonly TTL_MS = 60 * 60 * 1000;

	private static clearPeriodMapping(job: PayrollGenerationJobProgress) {
		if (!job.periodId) return;
		const activeJobId = PayrollGenerationJobService.activeJobIdsByPeriodId.get(job.periodId);
		if (activeJobId === job.jobId) {
			PayrollGenerationJobService.activeJobIdsByPeriodId.delete(job.periodId);
		}
	}

	private static cleanupOldJobs() {
		const cutoff = Date.now() - PayrollGenerationJobService.TTL_MS;
		for (const [jobId, job] of PayrollGenerationJobService.jobs.entries()) {
			if (job.startedAt.getTime() < cutoff) {
				PayrollGenerationJobService.clearPeriodMapping(job);
				PayrollGenerationJobService.jobs.delete(jobId);
				payrollJobLogger.info(`Cleaned up stale payroll job: ${jobId}`);
			}
		}
	}

	static createJob(params?: { total?: number; periodId?: string }): string {
		const jobId = randomUUID();
		const total = params?.total || 0;
		const periodId = params?.periodId;
		PayrollGenerationJobService.jobs.set(jobId, {
			jobId,
			periodId,
			status: "processing",
			total,
			processed: 0,
			success: 0,
			failed: 0,
			errors: [],
			startedAt: new Date(),
			cancellationRequested: false,
			pauseRequested: false,
		});
		if (periodId) {
			PayrollGenerationJobService.activeJobIdsByPeriodId.set(periodId, jobId);
		}
		payrollJobLogger.info(`Created payroll generation job ${jobId} (total=${total})`);
		return jobId;
	}

	static getJobProgress(jobId: string): PayrollGenerationJobProgress | null {
		PayrollGenerationJobService.cleanupOldJobs();
		return PayrollGenerationJobService.jobs.get(jobId) || null;
	}

	static updateJob(
		jobId: string,
		update: Partial<Omit<PayrollGenerationJobProgress, "jobId" | "startedAt">>,
	) {
		const job = PayrollGenerationJobService.jobs.get(jobId);
		if (!job) return;

		Object.assign(job, update);
		PayrollGenerationJobService.jobs.set(jobId, job);
	}

	static getActiveJobForPeriod(periodId: string): PayrollGenerationJobProgress | null {
		PayrollGenerationJobService.cleanupOldJobs();
		const jobId = PayrollGenerationJobService.activeJobIdsByPeriodId.get(periodId);
		if (!jobId) return null;
		const job = PayrollGenerationJobService.jobs.get(jobId) || null;
		if (!job) {
			PayrollGenerationJobService.activeJobIdsByPeriodId.delete(periodId);
			return null;
		}
		if (job.status !== "processing") {
			PayrollGenerationJobService.clearPeriodMapping(job);
			return null;
		}
		return job;
	}

	static requestStop(jobId: string, message?: string) {
		const job = PayrollGenerationJobService.jobs.get(jobId);
		if (!job || job.status !== "processing") return null;

		job.cancellationRequested = true;
		job.cancellationRequestedAt = new Date();
		job.message = message || job.message;
		PayrollGenerationJobService.jobs.set(jobId, job);
		return job;
	}

	static requestPause(jobId: string, message?: string) {
		const job = PayrollGenerationJobService.jobs.get(jobId);
		if (!job || job.status !== "processing") return null;

		job.pauseRequested = true;
		job.pauseRequestedAt = new Date();
		job.message = message || job.message;
		PayrollGenerationJobService.jobs.set(jobId, job);
		return job;
	}

	static isStopRequested(jobId: string): boolean {
		const job = PayrollGenerationJobService.jobs.get(jobId);
		return Boolean(job?.cancellationRequested);
	}

	static isPauseRequested(jobId: string): boolean {
		const job = PayrollGenerationJobService.jobs.get(jobId);
		return Boolean(job?.pauseRequested);
	}

	static appendError(jobId: string, error: PayrollGenerationJobError) {
		const job = PayrollGenerationJobService.jobs.get(jobId);
		if (!job) return;

		if (job.errors.length < 100) {
			job.errors.push(error);
		}
		PayrollGenerationJobService.jobs.set(jobId, job);
	}

	static markCompleted(jobId: string, message?: string) {
		const job = PayrollGenerationJobService.jobs.get(jobId);
		if (!job) return;
		PayrollGenerationJobService.updateJob(jobId, {
			status: "completed",
			completedAt: new Date(),
			message,
		});
		PayrollGenerationJobService.clearPeriodMapping(job);
	}

	static markFailed(jobId: string, message?: string) {
		const job = PayrollGenerationJobService.jobs.get(jobId);
		if (!job) return;
		PayrollGenerationJobService.updateJob(jobId, {
			status: "failed",
			completedAt: new Date(),
			message,
		});
		PayrollGenerationJobService.clearPeriodMapping(job);
	}

	static markCancelled(jobId: string, message?: string) {
		const job = PayrollGenerationJobService.jobs.get(jobId);
		if (!job) return;
		PayrollGenerationJobService.updateJob(jobId, {
			status: "cancelled",
			completedAt: new Date(),
			message,
			cancellationRequested: true,
			cancellationRequestedAt: job.cancellationRequestedAt || new Date(),
		});
		PayrollGenerationJobService.clearPeriodMapping(job);
	}

	static markPaused(jobId: string, message?: string) {
		const job = PayrollGenerationJobService.jobs.get(jobId);
		if (!job) return;
		PayrollGenerationJobService.updateJob(jobId, {
			status: "paused",
			completedAt: new Date(),
			message,
			pauseRequested: true,
			pauseRequestedAt: job.pauseRequestedAt || new Date(),
		});
		PayrollGenerationJobService.clearPeriodMapping(job);
	}
}

