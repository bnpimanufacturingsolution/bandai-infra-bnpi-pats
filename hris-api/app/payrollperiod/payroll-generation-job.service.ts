import { randomUUID } from "crypto";
import { getLogger } from "../../helper/logger.helper";
import { prisma } from "../../config/database";

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
	/** Last progress heartbeat — used for stuck detection and FE timestamps */
	updatedAt?: Date;
	completedAt?: Date;
	message?: string;
	cancellationRequested?: boolean;
	cancellationRequestedAt?: Date;
	pauseRequested?: boolean;
	pauseRequestedAt?: Date;
	/** True when this process no longer owns a live worker for a processing job */
	orphaned?: boolean;
};

type StoredPayrollGenerationSnapshot = {
	jobId: string;
	periodId?: string;
	status: PayrollGenerationJobProgress["status"];
	total: number;
	processed: number;
	success: number;
	failed: number;
	errors: PayrollGenerationJobError[];
	startedAt: string;
	updatedAt?: string;
	completedAt?: string | null;
	message?: string;
	cancellationRequested?: boolean;
	cancellationRequestedAt?: string;
	pauseRequested?: boolean;
	pauseRequestedAt?: string;
	orphaned?: boolean;
};

/**
 * Durable payroll generation jobs.
 *
 * Memory holds live workers in this process. Progress is also written to
 * PayrollPeriod.generationMetadata.payrollGeneration so:
 * - FE can reopen progress after navigation (URL jobId + period metadata)
 * - API pod restart does not invent "still processing" with no recoverable state
 *
 * After restart, processing jobs without a live worker are returned as orphaned
 * (status failed + orphaned flag) so the UI can show stuck/resume instead of
 * spinning forever.
 */
export class PayrollGenerationJobService {
	private static jobs: Map<string, PayrollGenerationJobProgress> = new Map();
	private static activeJobIdsByPeriodId: Map<string, string> = new Map();
	/** jobIds that have an in-process async worker loop */
	private static liveWorkers: Set<string> = new Set();
	private static readonly TTL_MS = 24 * 60 * 60 * 1000;
	private static hydratePromise: Promise<void> | null = null;
	private static persistQueue: Promise<void> = Promise.resolve();

	private static clearPeriodMapping(job: PayrollGenerationJobProgress) {
		if (!job.periodId) return;
		const activeJobId = PayrollGenerationJobService.activeJobIdsByPeriodId.get(job.periodId);
		if (activeJobId === job.jobId) {
			PayrollGenerationJobService.activeJobIdsByPeriodId.delete(job.periodId);
		}
	}

	private static toSnapshot(job: PayrollGenerationJobProgress): StoredPayrollGenerationSnapshot {
		return {
			jobId: job.jobId,
			periodId: job.periodId,
			status: job.status,
			total: job.total,
			processed: job.processed,
			success: job.success,
			failed: job.failed,
			errors: Array.isArray(job.errors) ? job.errors.slice(0, 100) : [],
			startedAt: job.startedAt.toISOString(),
			updatedAt: (job.updatedAt || job.startedAt).toISOString(),
			completedAt: job.completedAt ? job.completedAt.toISOString() : null,
			message: job.message,
			cancellationRequested: job.cancellationRequested,
			cancellationRequestedAt: job.cancellationRequestedAt?.toISOString(),
			pauseRequested: job.pauseRequested,
			pauseRequestedAt: job.pauseRequestedAt?.toISOString(),
			orphaned: job.orphaned,
		};
	}

	private static fromSnapshot(
		snapshot: StoredPayrollGenerationSnapshot,
		periodId?: string,
	): PayrollGenerationJobProgress {
		return {
			jobId: snapshot.jobId,
			periodId: snapshot.periodId || periodId,
			status: snapshot.status,
			total: Number(snapshot.total || 0),
			processed: Number(snapshot.processed || 0),
			success: Number(snapshot.success || 0),
			failed: Number(snapshot.failed || 0),
			errors: Array.isArray(snapshot.errors) ? snapshot.errors : [],
			startedAt: snapshot.startedAt ? new Date(snapshot.startedAt) : new Date(),
			updatedAt: snapshot.updatedAt
				? new Date(snapshot.updatedAt)
				: snapshot.startedAt
					? new Date(snapshot.startedAt)
					: new Date(),
			completedAt: snapshot.completedAt ? new Date(snapshot.completedAt) : undefined,
			message: snapshot.message,
			cancellationRequested: Boolean(snapshot.cancellationRequested),
			cancellationRequestedAt: snapshot.cancellationRequestedAt
				? new Date(snapshot.cancellationRequestedAt)
				: undefined,
			pauseRequested: Boolean(snapshot.pauseRequested),
			pauseRequestedAt: snapshot.pauseRequestedAt
				? new Date(snapshot.pauseRequestedAt)
				: undefined,
			orphaned: Boolean(snapshot.orphaned),
		};
	}

	private static async persistJob(job: PayrollGenerationJobProgress): Promise<void> {
		if (!job.periodId) return;
		const snapshot = PayrollGenerationJobService.toSnapshot(job);
		PayrollGenerationJobService.persistQueue = PayrollGenerationJobService.persistQueue
			.then(async () => {
				try {
					const period = await prisma.payrollPeriod.findUnique({
						where: { id: job.periodId! },
						select: { generationMetadata: true },
					});
					const existing =
						period?.generationMetadata &&
						typeof period.generationMetadata === "object" &&
						!Array.isArray(period.generationMetadata)
							? (period.generationMetadata as Record<string, unknown>)
							: {};
					await prisma.payrollPeriod.update({
						where: { id: job.periodId! },
						data: {
							generationMetadata: {
								...existing,
								payrollGeneration: snapshot,
							},
						},
					});
				} catch (error) {
					payrollJobLogger.warn(
						`Failed to persist payroll job ${job.jobId}: ${
							error instanceof Error ? error.message : String(error)
						}`,
					);
				}
			})
			.catch(() => undefined);
		await PayrollGenerationJobService.persistQueue;
	}

	private static queuePersist(job: PayrollGenerationJobProgress) {
		void PayrollGenerationJobService.persistJob(job);
	}

	private static async loadJobFromDb(jobId: string): Promise<PayrollGenerationJobProgress | null> {
		try {
			const period = await prisma.payrollPeriod.findFirst({
				where: {
					isDeleted: false,
					generationMetadata: {
						path: ["payrollGeneration", "jobId"],
						equals: jobId,
					},
				},
				select: { id: true, generationMetadata: true, status: true },
			});
			if (!period) return null;
			const meta =
				period.generationMetadata &&
				typeof period.generationMetadata === "object" &&
				!Array.isArray(period.generationMetadata)
					? (period.generationMetadata as Record<string, unknown>)
					: null;
			const snap = meta?.payrollGeneration as StoredPayrollGenerationSnapshot | undefined;
			if (!snap?.jobId) return null;
			return PayrollGenerationJobService.fromSnapshot(snap, period.id);
		} catch (error) {
			payrollJobLogger.warn(
				`loadJobFromDb failed for ${jobId}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			return null;
		}
	}

	private static async hydrateFromDatabase(): Promise<void> {
		if (PayrollGenerationJobService.hydratePromise) {
			return PayrollGenerationJobService.hydratePromise;
		}
		PayrollGenerationJobService.hydratePromise = (async () => {
			try {
				const periods = await prisma.payrollPeriod.findMany({
					where: {
						isDeleted: false,
						OR: [
							{ status: "PROCESSING" },
							{
								generationMetadata: {
									path: ["payrollGeneration", "status"],
									equals: "processing",
								},
							},
							{
								generationMetadata: {
									path: ["payrollGeneration", "status"],
									equals: "paused",
								},
							},
						],
					},
					select: { id: true, generationMetadata: true, status: true },
					take: 200,
				});
				for (const period of periods) {
					const meta =
						period.generationMetadata &&
						typeof period.generationMetadata === "object" &&
						!Array.isArray(period.generationMetadata)
							? (period.generationMetadata as Record<string, unknown>)
							: null;
					const snap = meta?.payrollGeneration as StoredPayrollGenerationSnapshot | undefined;
					if (!snap?.jobId) continue;
					if (PayrollGenerationJobService.jobs.has(snap.jobId)) continue;

					// Period already terminal: never rehydrate as paused/processing (Resume would 400).
					const periodTerminal =
						period.status === "COMPLETED" || period.status === "CLOSED";
					if (
						periodTerminal &&
						(snap.status === "paused" ||
							snap.status === "processing" ||
							snap.status === "failed")
					) {
						const repaired: PayrollGenerationJobProgress = {
							...PayrollGenerationJobService.fromSnapshot(snap, period.id),
							status: "completed",
							orphaned: false,
							pauseRequested: false,
							pauseRequestedAt: undefined,
							cancellationRequested: false,
							cancellationRequestedAt: undefined,
							completedAt: snap.completedAt
								? new Date(snap.completedAt)
								: new Date(snap.updatedAt || snap.startedAt || Date.now()),
							message:
								snap.message ||
								"Payroll period already completed; job closed as completed",
						};
						PayrollGenerationJobService.jobs.set(repaired.jobId, repaired);
						// Heal DB so FE metadata matches period status.
						void PayrollGenerationJobService.persistJob(repaired);
						continue;
					}

					const job = PayrollGenerationJobService.fromSnapshot(snap, period.id);
					// Restored from disk after process start: no live worker in this process.
					if (job.status === "processing") {
						job.orphaned = true;
					}
					PayrollGenerationJobService.jobs.set(job.jobId, job);
					// Do NOT put orphaned processing jobs into active map — FE uses stuck/resume.
				}
				payrollJobLogger.info(
					`Hydrated ${PayrollGenerationJobService.jobs.size} payroll generation job(s) from database`,
				);
			} catch (error) {
				payrollJobLogger.warn(
					`hydrateFromDatabase failed: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		})();
		return PayrollGenerationJobService.hydratePromise;
	}

	/** Call at process boot (optional) so first poll is warm */
	static warmHydrate() {
		void PayrollGenerationJobService.hydrateFromDatabase();
	}

	private static cleanupOldJobs() {
		const cutoff = Date.now() - PayrollGenerationJobService.TTL_MS;
		for (const [jobId, job] of PayrollGenerationJobService.jobs.entries()) {
			const anchor = job.updatedAt || job.completedAt || job.startedAt;
			if (anchor.getTime() < cutoff && job.status !== "processing") {
				PayrollGenerationJobService.clearPeriodMapping(job);
				PayrollGenerationJobService.jobs.delete(jobId);
				PayrollGenerationJobService.liveWorkers.delete(jobId);
				payrollJobLogger.info(`Cleaned up stale payroll job: ${jobId}`);
			}
		}
	}

	static createJob(params?: { total?: number; periodId?: string }): string {
		const jobId = randomUUID();
		const total = params?.total || 0;
		const periodId = params?.periodId;
		const now = new Date();
		const job: PayrollGenerationJobProgress = {
			jobId,
			periodId,
			status: "processing",
			total,
			processed: 0,
			success: 0,
			failed: 0,
			errors: [],
			startedAt: now,
			updatedAt: now,
			cancellationRequested: false,
			pauseRequested: false,
			orphaned: false,
		};
		PayrollGenerationJobService.jobs.set(jobId, job);
		PayrollGenerationJobService.liveWorkers.add(jobId);
		if (periodId) {
			PayrollGenerationJobService.activeJobIdsByPeriodId.set(periodId, jobId);
		}
		PayrollGenerationJobService.queuePersist(job);
		payrollJobLogger.info(`Created payroll generation job ${jobId} (total=${total})`);
		return jobId;
	}

	/** Mark that this Node process owns the worker loop for jobId */
	static attachLiveWorker(jobId: string) {
		PayrollGenerationJobService.liveWorkers.add(jobId);
		const job = PayrollGenerationJobService.jobs.get(jobId);
		if (job) {
			job.orphaned = false;
			job.updatedAt = new Date();
			PayrollGenerationJobService.jobs.set(jobId, job);
		}
	}

	static detachLiveWorker(jobId: string) {
		PayrollGenerationJobService.liveWorkers.delete(jobId);
	}

	static getJobProgress(jobId: string): PayrollGenerationJobProgress | null {
		PayrollGenerationJobService.cleanupOldJobs();
		// Kick hydrate in background; sync path uses memory first.
		void PayrollGenerationJobService.hydrateFromDatabase();
		const mem = PayrollGenerationJobService.jobs.get(jobId);
		if (mem) {
			return PayrollGenerationJobService.presentJob(mem);
		}
		return null;
	}

	/** Async getter used by controllers after await hydrate */
	static async getJobProgressAsync(jobId: string): Promise<PayrollGenerationJobProgress | null> {
		PayrollGenerationJobService.cleanupOldJobs();
		await PayrollGenerationJobService.hydrateFromDatabase();
		let job = PayrollGenerationJobService.jobs.get(jobId) || null;
		if (!job) {
			job = await PayrollGenerationJobService.loadJobFromDb(jobId);
			if (job) {
				if (job.status === "processing" && !PayrollGenerationJobService.liveWorkers.has(jobId)) {
					job.orphaned = true;
				}
				PayrollGenerationJobService.jobs.set(jobId, job);
			}
		}
		return job ? PayrollGenerationJobService.presentJob(job) : null;
	}

	private static presentJob(job: PayrollGenerationJobProgress): PayrollGenerationJobProgress {
		if (
			job.status === "processing" &&
			!PayrollGenerationJobService.liveWorkers.has(job.jobId)
		) {
			// Orphan: period may still be PROCESSING; FE shows stuck + Resume.
			return {
				...job,
				orphaned: true,
				status: "failed",
				message:
					job.message ||
					"Payroll background worker is not running in this API process (restart or deploy). The period may still be PROCESSING — use Resume processing to continue from existing payroll rows, or Reopen period to clear the stale lock.",
				updatedAt: job.updatedAt || job.startedAt,
			};
		}
		return { ...job, orphaned: false };
	}

	static updateJob(
		jobId: string,
		update: Partial<Omit<PayrollGenerationJobProgress, "jobId" | "startedAt">>,
	) {
		const job = PayrollGenerationJobService.jobs.get(jobId);
		if (!job) return;

		Object.assign(job, update, { updatedAt: new Date() });
		const nextStatus = job.status;
		if (nextStatus === "processing") {
			job.orphaned = false;
			PayrollGenerationJobService.liveWorkers.add(jobId);
		} else {
			PayrollGenerationJobService.liveWorkers.delete(jobId);
		}
		PayrollGenerationJobService.jobs.set(jobId, job);
		PayrollGenerationJobService.queuePersist(job);
	}

	static getActiveJobForPeriod(periodId: string): PayrollGenerationJobProgress | null {
		PayrollGenerationJobService.cleanupOldJobs();
		void PayrollGenerationJobService.hydrateFromDatabase();
		const jobId = PayrollGenerationJobService.activeJobIdsByPeriodId.get(periodId);
		if (!jobId) return null;
		if (!PayrollGenerationJobService.liveWorkers.has(jobId)) {
			PayrollGenerationJobService.activeJobIdsByPeriodId.delete(periodId);
			return null;
		}
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

	static async getActiveJobForPeriodAsync(
		periodId: string,
	): Promise<PayrollGenerationJobProgress | null> {
		await PayrollGenerationJobService.hydrateFromDatabase();
		const live = PayrollGenerationJobService.getActiveJobForPeriod(periodId);
		if (live) return live;
		// No live worker — do not report active; FE stuck modal + Resume.
		return null;
	}

	static requestStop(jobId: string, message?: string) {
		const job = PayrollGenerationJobService.jobs.get(jobId);
		if (!job || job.status !== "processing") return null;
		if (!PayrollGenerationJobService.liveWorkers.has(jobId)) return null;

		job.cancellationRequested = true;
		job.cancellationRequestedAt = new Date();
		job.updatedAt = new Date();
		job.message = message || job.message;
		PayrollGenerationJobService.jobs.set(jobId, job);
		PayrollGenerationJobService.queuePersist(job);
		return job;
	}

	static requestPause(jobId: string, message?: string) {
		const job = PayrollGenerationJobService.jobs.get(jobId);
		if (!job || job.status !== "processing") return null;
		if (!PayrollGenerationJobService.liveWorkers.has(jobId)) return null;

		job.pauseRequested = true;
		job.pauseRequestedAt = new Date();
		job.updatedAt = new Date();
		job.message = message || job.message;
		PayrollGenerationJobService.jobs.set(jobId, job);
		PayrollGenerationJobService.queuePersist(job);
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
		job.updatedAt = new Date();
		PayrollGenerationJobService.jobs.set(jobId, job);
		PayrollGenerationJobService.queuePersist(job);
	}

	static markCompleted(jobId: string, message?: string) {
		const job = PayrollGenerationJobService.jobs.get(jobId);
		if (!job) return;
		PayrollGenerationJobService.updateJob(jobId, {
			status: "completed",
			completedAt: new Date(),
			message,
			orphaned: false,
		});
		PayrollGenerationJobService.detachLiveWorker(jobId);
		PayrollGenerationJobService.clearPeriodMapping(job);
		const updated = PayrollGenerationJobService.jobs.get(jobId);
		if (updated) PayrollGenerationJobService.queuePersist(updated);
	}

	static markFailed(jobId: string, message?: string) {
		const job = PayrollGenerationJobService.jobs.get(jobId);
		if (!job) return;
		PayrollGenerationJobService.updateJob(jobId, {
			status: "failed",
			completedAt: new Date(),
			message,
			orphaned: false,
		});
		PayrollGenerationJobService.detachLiveWorker(jobId);
		PayrollGenerationJobService.clearPeriodMapping(job);
		const updated = PayrollGenerationJobService.jobs.get(jobId);
		if (updated) PayrollGenerationJobService.queuePersist(updated);
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
			orphaned: false,
		});
		PayrollGenerationJobService.detachLiveWorker(jobId);
		PayrollGenerationJobService.clearPeriodMapping(job);
		const updated = PayrollGenerationJobService.jobs.get(jobId);
		if (updated) PayrollGenerationJobService.queuePersist(updated);
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
			orphaned: false,
		});
		PayrollGenerationJobService.detachLiveWorker(jobId);
		PayrollGenerationJobService.clearPeriodMapping(job);
		const updated = PayrollGenerationJobService.jobs.get(jobId);
		if (updated) PayrollGenerationJobService.queuePersist(updated);
	}
}

// Warm hydrate so first progress poll after boot can resolve DB snapshots.
PayrollGenerationJobService.warmHydrate();
