import { describe, it, expect, beforeEach } from "vitest";
import { PayrollGenerationJobService } from "../../app/payrollperiod/payroll-generation-job.service";

/**
 * Unit tests for durable payroll job service (in-process worker + orphan presentation).
 * DB persist is best-effort and may log warnings without a live Prisma connection.
 */
describe("PayrollGenerationJobService", () => {
	beforeEach(() => {
		// Isolate maps between tests via public API only: create unique period ids
	});

	it("createJob returns id and getActiveJobForPeriod finds live worker", () => {
		const periodId = `period-test-${Date.now()}-a`;
		const jobId = PayrollGenerationJobService.createJob({ total: 10, periodId });
		PayrollGenerationJobService.attachLiveWorker(jobId);
		const active = PayrollGenerationJobService.getActiveJobForPeriod(periodId);
		expect(active?.jobId).toBe(jobId);
		expect(active?.status).toBe("processing");
		expect(active?.total).toBe(10);
	});

	it("getJobProgress shows orphaned failed when no live worker", () => {
		const periodId = `period-test-${Date.now()}-b`;
		const jobId = PayrollGenerationJobService.createJob({ total: 5, periodId });
		// Simulate process restart: drop live worker but keep job record
		PayrollGenerationJobService.detachLiveWorker(jobId);
		const progress = PayrollGenerationJobService.getJobProgress(jobId);
		expect(progress).not.toBeNull();
		expect(progress?.orphaned).toBe(true);
		expect(progress?.status).toBe("failed");
		expect(String(progress?.message || "")).toMatch(/Resume processing|worker|restart/i);
		// Orphaned jobs must not count as active (stuck UI + Resume)
		expect(PayrollGenerationJobService.getActiveJobForPeriod(periodId)).toBeNull();
	});

	it("updateJob progress keeps job active while processing", () => {
		const periodId = `period-test-${Date.now()}-c`;
		const jobId = PayrollGenerationJobService.createJob({ total: 3, periodId });
		PayrollGenerationJobService.attachLiveWorker(jobId);
		PayrollGenerationJobService.updateJob(jobId, { processed: 1, success: 1 });
		const progress = PayrollGenerationJobService.getJobProgress(jobId);
		expect(progress?.processed).toBe(1);
		expect(progress?.status).toBe("processing");
		expect(progress?.orphaned).toBeFalsy();
		expect(PayrollGenerationJobService.getActiveJobForPeriod(periodId)?.jobId).toBe(jobId);
	});

	it("markCompleted clears active mapping", () => {
		const periodId = `period-test-${Date.now()}-d`;
		const jobId = PayrollGenerationJobService.createJob({ total: 2, periodId });
		PayrollGenerationJobService.attachLiveWorker(jobId);
		PayrollGenerationJobService.markCompleted(jobId, "done");
		expect(PayrollGenerationJobService.getActiveJobForPeriod(periodId)).toBeNull();
		const progress = PayrollGenerationJobService.getJobProgress(jobId);
		expect(progress?.status).toBe("completed");
		expect(progress?.orphaned).toBeFalsy();
	});
});
