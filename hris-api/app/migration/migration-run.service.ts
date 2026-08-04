import { PrismaClient } from "../../generated/prisma";
import * as fs from "fs";
import * as path from "path";
import { MigrationEventService } from "./migration-event.service";
import { MigrationDryRunService } from "./migration-dry-run.service";
import { Dm3MigrationAdapter } from "./dm3-migration.adapter";
import { Dm4MigrationAdapter } from "./dm4-migration.adapter";
import { EmployeeImportService } from "../employee/employee-import.service";
import {
	MigrationRunAdapterResult,
	MigrationRunRequest,
	MigrationRunStatus,
	MigrationRunSourceFile,
} from "./migration-run.types";
import { getMigrationStepPlan } from "./migration-step-registry";
import {
	buildDm4UploadActivityFromRunResult,
	persistDm3ImportActivityLog,
	resolveMassUploadImportStatus,
} from "./bnpi-mass-upload-import.service";

const activeRunJobs = new Set<string>();
const NON_TERMINAL_RUN_STATUSES = [
	"DRY_RUNNING",
	"QUEUED",
	"STARTING",
	"READING_SOURCE",
	"VALIDATING",
	"IMPORTING",
	"FINALIZING",
	"MATERIALIZING",
	"VERIFYING",
	"RERUNNING",
];

function now() {
	return new Date();
}

function normalizeSourceFiles(request: MigrationRunRequest) {
	if (Array.isArray(request.sourceFiles) && request.sourceFiles.length > 0) {
		return request.sourceFiles;
	}
	return (request.files || []).map((file) => ({
		name: file.originalname,
		size: file.size,
		mimeType: file.mimetype,
	}));
}

function normalizePersistedSourceFiles(value: any): MigrationRunSourceFile[] {
	if (!Array.isArray(value)) return [];
	const sourceFiles: MigrationRunSourceFile[] = [];
	for (const file of value) {
		if (typeof file === "string") {
			sourceFiles.push({ path: file });
			continue;
		}
		if (file && typeof file === "object") {
			sourceFiles.push({
				name: typeof file.name === "string" ? file.name : undefined,
				path: typeof file.path === "string" ? file.path : undefined,
				size: typeof file.size === "number" ? file.size : undefined,
				mimeType: typeof file.mimeType === "string" ? file.mimeType : undefined,
			});
			continue;
		}
	}
	return sourceFiles.filter((file) => Boolean(file.path || file.name));
}

function getSourceFilePaths(sourceFiles: MigrationRunSourceFile[]) {
	return sourceFiles
		.map((file) => file.path || file.name || "")
		.map((value) => value.trim())
		.filter(Boolean);
}

function countReportingLineSourceRows() {
	const csvPath = path.resolve(
		__dirname,
		"..",
		"..",
		"..",
		"data",
		"import",
		"reporting-lines-import.csv",
	);
	if (!fs.existsSync(csvPath)) return 0;
	const content = fs.readFileSync(csvPath, "utf8").trim();
	if (!content) return 0;
	return Math.max(0, content.split(/\r?\n/).length - 1);
}

export class MigrationRunService {
	private readonly events: MigrationEventService;
	private readonly dryRunService: MigrationDryRunService;
	private readonly dm3Adapter: Dm3MigrationAdapter;
	private readonly dm4Adapter: Dm4MigrationAdapter;

	constructor(private readonly prisma: PrismaClient) {
		this.events = new MigrationEventService(prisma);
		this.dryRunService = new MigrationDryRunService(prisma, this.events);
		this.dm3Adapter = new Dm3MigrationAdapter(prisma, this.events);
		this.dm4Adapter = new Dm4MigrationAdapter(prisma, this.events);
	}

	async dryRun(request: MigrationRunRequest) {
		const idempotencyKey =
			request.idempotencyKey || `dry-run:${request.workbookId}:${Date.now()}:${Math.random()}`;
		const run = await this.createOrReuseRun({
			...request,
			idempotencyKey,
			dryRun: true,
			status: "DRY_RUNNING",
			phase: "DRY_RUNNING",
		});
		if (run.status !== "DRY_RUNNING") return this.getRun(run.id);

		await this.events.append({
			runId: run.id,
			stage: request.workbookId.toUpperCase(),
			eventType: "DRY_RUN_STARTED",
			status: "DRY_RUNNING",
			message: `${request.workbookId.toUpperCase()} dry-run started.`,
		});
		await this.persistStepPlan(run.id, request.workbookId);
		try {
			const result =
				request.workbookId === "dm3"
					? await this.dryRunService.dryRunDm3(run.id, request)
					: await this.dryRunService.dryRunDm4(run.id, request);
			await this.finishRun(run.id, result, true);
		} catch (error: any) {
			await this.events.append({
				runId: run.id,
				stage: request.workbookId.toUpperCase(),
				eventType: "RUN_FAILED",
				status: "FAILED",
				message: error?.message || "Migration dry-run failed.",
			});
			await this.finishRun(
				run.id,
				{
					status: "FAILED",
					phase: "FAILED",
					errorJson: { message: error?.message || "Migration dry-run failed." },
				},
				true,
			);
			throw error;
		}
		return this.getRun(run.id);
	}

	async startRun(request: MigrationRunRequest) {
		if (!request.idempotencyKey) {
			const error: any = new Error("idempotencyKey is required for migration runs.");
			error.statusCode = 400;
			throw error;
		}
		let activeRun = await this.findActiveRun(request.organizationId, request.workbookId);
		if (
			activeRun &&
			NON_TERMINAL_RUN_STATUSES.includes(activeRun.status) &&
			!activeRunJobs.has(activeRun.id)
		) {
			await this.events.append({
				runId: activeRun.id,
				stage: activeRun.workbookId.toUpperCase(),
				eventType: "RUN_STALE",
				status: "STALE",
				message:
					"Backend worker memory is no longer tracking this run. A new migration run may start.",
			});
			await (this.prisma as any).migrationRun.update({
				where: { id: activeRun.id },
				data: {
					status: "STALE",
					phase: "STALE",
					finishedAt: now(),
					errorJson: {
						message:
							"Backend worker memory is no longer tracking this run. A new migration run may start.",
					},
				},
			});
			activeRun = null;
		}
		if (
			request.workbookId === "dm4" &&
			activeRun &&
			activeRun.idempotencyKey !== request.idempotencyKey &&
			!["STALE", "BLOCKED", "FAILED", "COMPLETED", "COMPLETED_WITH_WARNINGS"].includes(
				activeRun.status,
			)
		) {
			await this.closeSupersededRun(
				activeRun,
				"A new DM4 migration run was started, so the previous DM4 run was closed to avoid concurrent materialization.",
			);
			activeRun = null;
		}
		if (
			activeRun &&
			activeRun.idempotencyKey !== request.idempotencyKey &&
			!["STALE", "BLOCKED", "FAILED", "COMPLETED", "COMPLETED_WITH_WARNINGS"].includes(
				activeRun.status,
			)
		) {
			return this.getRun(activeRun.id);
		}
		const run = await this.createOrReuseRun({
			...request,
			dryRun: false,
			status: "QUEUED",
			phase: "QUEUED",
		});
		if (run.status !== "QUEUED" || activeRunJobs.has(run.id)) {
			return this.getRun(run.id);
		}

		activeRunJobs.add(run.id);
		await this.events.append({
			runId: run.id,
			stage: request.workbookId.toUpperCase(),
			eventType: "RUN_CREATED",
			status: "QUEUED",
			message: `${request.workbookId.toUpperCase()} migration run queued.`,
		});
		await this.persistStepPlan(run.id, request.workbookId);
		void this.executeRun(run.id, request).finally(() => activeRunJobs.delete(run.id));
		return this.getRun(run.id);
	}

	async getRun(runId: string) {
		const run = await (this.prisma as any).migrationRun.findUnique({
			where: { id: runId },
			include: {
				steps: { orderBy: { sequence: "asc" } },
				events: { orderBy: { sequence: "desc" }, take: 200 },
			},
		});
		if (!run) return null;
		if (Array.isArray(run.events)) run.events.reverse();
		if (!activeRunJobs.has(run.id) && NON_TERMINAL_RUN_STATUSES.includes(run.status)) {
			await this.events.append({
				runId: run.id,
				stage: run.workbookId.toUpperCase(),
				eventType: "RUN_STALE",
				status: "STALE",
				message:
					"Backend worker memory is no longer tracking this run. Durable run and events remain available for recover/rerun.",
			});
			const updated = await (this.prisma as any).migrationRun.update({
				where: { id: run.id },
				data: {
					status: "STALE",
					phase: "STALE",
					finishedAt: now(),
					errorJson: {
						message:
							"Backend worker memory is no longer tracking this run. Durable run and events remain available for recover/rerun.",
					},
				},
				include: {
					steps: { orderBy: { sequence: "asc" } },
					events: { orderBy: { sequence: "desc" }, take: 200 },
				},
			});
			if (Array.isArray(updated.events)) updated.events.reverse();
			return updated;
		}
		return run;
	}

	async getProgress(runId: string) {
		const run = await this.getRun(runId);
		if (!run) return null;
		const steps = Array.isArray(run.steps) ? run.steps : [];
		const events = Array.isArray(run.events) ? run.events : [];
		const runStartedAt = run.startedAt || run.createdAt || null;
		const runIsTerminal = !NON_TERMINAL_RUN_STATUSES.includes(run.status);
		const latestEvent = events[events.length - 1] || null;
		const runFinishedAt =
			run.finishedAt || (runIsTerminal ? latestEvent?.timestamp || run.updatedAt || null : null);
		const runDurationMs = runStartedAt
			? Math.max(
					0,
					(runFinishedAt ? new Date(runFinishedAt).getTime() : Date.now()) -
						new Date(runStartedAt).getTime(),
				)
			: null;
		const employeeImportJob = this.resolveDm3EmployeeImportJob(run, steps);
		if (employeeImportJob) {
			const employeeStep = steps.find((step: any) => step.stepCode === "DM3.1");
			if (employeeStep) {
				employeeStep.status =
					employeeImportJob.status === "completed"
						? "COMPLETED"
						: employeeImportJob.status === "failed"
							? "FAILED"
							: "RUNNING";
				employeeStep.counts = {
					...(employeeStep.counts || {}),
					jobId: employeeImportJob.jobId,
					phase: employeeImportJob.phase,
					processed: employeeImportJob.processed,
					total: employeeImportJob.total,
					success: employeeImportJob.success,
					created: employeeImportJob.created,
					updated: employeeImportJob.updated,
					skipped: employeeImportJob.skipped,
					blocked: employeeImportJob.blocked,
					failed: employeeImportJob.failed,
					warnings: employeeImportJob.warnings?.length || 0,
				};
				employeeStep.errorJson =
					employeeImportJob.status === "failed"
						? { message: employeeImportJob.errors?.[0]?.error || "Employee import failed." }
						: employeeStep.errorJson;
			}
		} else if (
			run.workbookId === "dm3" &&
			(["COMPLETED", "COMPLETED_WITH_WARNINGS", "STALE", "BLOCKED", "FAILED"].includes(run.status) ||
				(NON_TERMINAL_RUN_STATUSES.includes(run.status) && !activeRunJobs.has(run.id)))
		) {
			await this.hydrateDm3DbProofSteps(run, steps);
		}
		const progressStep = steps.find((step: any) => step.stepCode === run.progress?.currentStepCode);
		const currentStep = runIsTerminal
			? steps[steps.length - 1] || null
			: (progressStep && !["COMPLETED", "WARNING", "BLOCKED", "NOT_WIRED"].includes(progressStep.status)
					? progressStep
					: null) ||
				steps.find((step: any) => step.status === "RUNNING") ||
				steps.find((step: any) => step.status === "PLANNED") ||
				steps.find((step: any) => step.status === "NOT_WIRED") ||
				steps[steps.length - 1] ||
				null;
		const completedSteps = steps.filter((step: any) =>
			["COMPLETED", "WARNING", "BLOCKED", "NOT_WIRED"].includes(step.status),
		).length;
		const activeChildJobs = steps
			.filter((step: any) => step.status === "RUNNING")
			.map((step: any) => ({
				jobId: run.jobId || run.id,
				stepCode: step.stepCode,
				label: step.summaryJson?.label || step.stepCode,
				status: step.status,
				processed: Number(step.counts?.processed || step.counts?.processedEmployeeDays || step.counts?.processedBatches || 0),
				total: step.counts?.total ?? step.counts?.expectedScheduledEmployeeDays ?? step.counts?.targetBatches ?? null,
				goalStatus: step.counts?.status === "GOAL_LOCKED" ? "LOCKED" : step.counts?.status ? step.counts.status : "UNKNOWN",
				lastHeartbeatAt: run.progress?.lastHeartbeatAt || run.updatedAt,
			}));
		return {
			runId: run.id,
			status: run.status,
			startedAt: runStartedAt,
			finishedAt: runFinishedAt,
			durationMs: runDurationMs,
			currentStepCode: currentStep?.stepCode || null,
			currentStepLabel: currentStep?.summaryJson?.label || currentStep?.stepCode || null,
			parentProgress: {
				completedSteps,
				totalSteps: steps.length,
			},
			activeChildJobs,
			steps: steps.map((step: any) => ({
				code: step.stepCode,
				label: step.summaryJson?.label || step.stepCode,
				status: step.status,
				processed: Number(step.counts?.processed || step.counts?.processedEmployeeDays || step.counts?.processedBatches || 0),
				total: step.counts?.total ?? step.counts?.expectedScheduledEmployeeDays ?? step.counts?.targetBatches ?? null,
				created: Number(step.counts?.created || step.counts?.inserted || 0),
				updated: Number(step.counts?.updated || 0),
				skipped: Number(step.counts?.skipped || step.counts?.skippedPayFrequency || 0),
				failed: Number(step.counts?.failed || 0),
				blockerReason: step.errorJson?.message || step.counts?.blockerReason || null,
				counts: step.counts || {},
				startedAt: step.startedAt,
				completedAt: step.finishedAt,
				elapsedMs: step.startedAt
					? Math.max(
							0,
							(step.finishedAt
								? new Date(step.finishedAt).getTime()
								: runIsTerminal && runFinishedAt
									? new Date(runFinishedAt).getTime()
									: Date.now()) -
								new Date(step.startedAt).getTime(),
						)
					: 0,
			})),
			latestEvent: latestEvent
				? {
						type: latestEvent.eventType,
						message: latestEvent.message,
						createdAt: latestEvent.timestamp,
					}
				: null,
			recentEvents: events.slice(-20).map((event: any) => ({
				type: event.eventType,
				status: event.status,
				stepCode: event.stepCode,
				sourceSheet: event.sourceSheet,
				sourceRow: event.sourceRow,
				employeeId: event.employeeId,
				employeeName: event.employeeName,
				message: event.message,
				counts: event.counts || {},
				metadata: event.metadata || {},
				createdAt: event.timestamp,
			})),
			summary: run.summaryJson || {},
			proof: run.proofJson || {},
		};
	}

	private resolveDm3EmployeeImportJob(run: any, steps: any[]) {
		if (run.workbookId !== "dm3") return null;
		const directJobId =
			typeof run.jobId === "string" && run.jobId ? run.jobId : null;
		if (directJobId) {
			const progress = EmployeeImportService.getJobProgress(directJobId);
			if (progress) return progress;
		}
		const employeeStep = steps.find((step: any) => step.stepCode === "DM3.1");
		const knownTotal = Number(employeeStep?.counts?.total || 0);
		const activeJobs = EmployeeImportService.getActiveImportJobs();
		if (activeJobs.length === 1) return activeJobs[0];
		return activeJobs.find((job) => !knownTotal || job.total === knownTotal) || null;
	}

	private async hydrateDm3DbProofSteps(run: any, steps: any[]) {
		const dm3EmployeeWhere = {
			organizationId: run.organizationId,
			isDeleted: false,
			OR: [
				{ metadata: { path: ["sourceOfTruth", "step"], equals: "DM3.1 Employees" } },
				{ person: { metadata: { path: ["sourceOfTruth", "step"], equals: "DM3.1 Employees" } } },
			],
		};
		const dm3ScheduledEmployeeWhere = {
			...dm3EmployeeWhere,
			NOT: { embeddedSchedule: { equals: null as any } },
		};

		const [
			employeeResult,
			scheduledResult,
			reportingLineResult,
			documentResult,
			openingLeaveResult,
			benefitResult,
			loanResult,
			openPeriodResult,
			obligationResult,
			timesheetDraftResult,
		] =
			await Promise.allSettled([
				(this.prisma as any).employee.count({ where: dm3EmployeeWhere }),
				(this.prisma as any).employee.count({ where: dm3ScheduledEmployeeWhere }),
				(this.prisma as any).employee.count({
					where: {
						organizationId: run.organizationId,
						isDeleted: false,
						reportToId: { not: null },
						metadata: { path: ["dm3ReportingLine", "sourceSheet"], equals: "Reporting Lines" },
					},
				}),
				(this.prisma as any).document.count({
					where: {
						isDeleted: false,
						reviewSource: "MIGRATION",
						employee: dm3EmployeeWhere,
					},
				}),
				(this.prisma as any).employeeLeaveBalance.count({
					where: {
						organizationId: run.organizationId,
						employee: dm3EmployeeWhere,
					},
				}),
				(this.prisma as any).employeeBenefit.count({
					where: {
						organizationId: run.organizationId,
						isDeleted: false,
						employee: { is: dm3EmployeeWhere },
					},
				}),
				(this.prisma as any).employeeLoan.count({
					where: {
						organizationId: run.organizationId,
						isDeleted: false,
						employee: dm3EmployeeWhere,
					},
				}),
				(this.prisma as any).payrollPeriod.count({
					where: {
						organizationId: run.organizationId,
						isDeleted: false,
						status: { in: ["OPEN", "PROCESSING"] },
					},
				}),
				(this.prisma as any).attendanceObligation.count({
					where: {
						organizationId: run.organizationId,
						isDeleted: false,
						employee: dm3EmployeeWhere,
						payrollPeriod: { status: { in: ["OPEN", "PROCESSING"] } },
					},
				}),
				(this.prisma as any).timesheet.count({
					where: {
						organizationId: run.organizationId,
						isDeleted: false,
						status: "DRAFT",
						notes: { contains: "Prepared draft header from DM3 employee import" },
						employee: dm3EmployeeWhere,
					},
				}),
			]);

		const dm3Employees =
			employeeResult.status === "fulfilled" ? Number(employeeResult.value || 0) : 0;
		const scheduledEmployees =
			scheduledResult.status === "fulfilled" ? Number(scheduledResult.value || 0) : 0;
		const reportingLines =
			reportingLineResult.status === "fulfilled" ? Number(reportingLineResult.value || 0) : 0;
		const documents =
			documentResult.status === "fulfilled" ? Number(documentResult.value || 0) : 0;
		const openingLeaveBalances =
			openingLeaveResult.status === "fulfilled" ? Number(openingLeaveResult.value || 0) : 0;
		const benefits =
			benefitResult.status === "fulfilled" ? Number(benefitResult.value || 0) : 0;
		const loans = loanResult.status === "fulfilled" ? Number(loanResult.value || 0) : 0;
		const openPeriods =
			openPeriodResult.status === "fulfilled" ? Number(openPeriodResult.value || 0) : 0;
		const obligations =
			obligationResult.status === "fulfilled" ? Number(obligationResult.value || 0) : 0;
		const timesheetDrafts =
			timesheetDraftResult.status === "fulfilled" ? Number(timesheetDraftResult.value || 0) : 0;
		const proofSource = {
			source: "db_proof_fallback",
			reason: "Durable worker progress was unavailable; counts were hydrated from Prisma tables.",
		};

		const validateStep = steps.find((step: any) => step.stepCode === "DM3.validate");
		if (validateStep && Number(validateStep.counts?.employees || 0) > 0) {
			validateStep.status = "COMPLETED";
			validateStep.counts = {
				...(validateStep.counts || {}),
				...proofSource,
			};
		}

		const employeeStep = steps.find((step: any) => step.stepCode === "DM3.1");
		if (employeeStep && dm3Employees > 0) {
			const total = Number(employeeStep.counts?.total || dm3Employees);
			employeeStep.status =
				total > 0 && dm3Employees >= total ? "COMPLETED" : employeeStep.status || "RUNNING";
			employeeStep.counts = {
				...(employeeStep.counts || {}),
				...proofSource,
				total,
				processed: Math.max(Number(employeeStep.counts?.processed || 0), Math.min(dm3Employees, total)),
				success: Math.max(Number(employeeStep.counts?.success || 0), dm3Employees),
				updated: Math.max(Number(employeeStep.counts?.updated || 0), dm3Employees),
				dbProofCount: dm3Employees,
			};
		}

		const scheduleStep = steps.find((step: any) => step.stepCode === "DM3.2");
		if (scheduleStep && scheduledEmployees > 0) {
			const total = Number(scheduleStep.counts?.total || scheduledEmployees);
			scheduleStep.status =
				total > 0 && scheduledEmployees >= total ? "COMPLETED" : scheduleStep.status || "RUNNING";
			scheduleStep.counts = {
				...(scheduleStep.counts || {}),
				...proofSource,
				total,
				processed: Math.max(Number(scheduleStep.counts?.processed || 0), Math.min(scheduledEmployees, total)),
				updated: Math.max(Number(scheduleStep.counts?.updated || 0), scheduledEmployees),
				dbProofCount: scheduledEmployees,
			};
		}

		const reportingLineStep = steps.find((step: any) => step.stepCode === "DM3.3");
		if (reportingLineStep && reportingLines > 0) {
			const sourceRows = Math.max(countReportingLineSourceRows(), Number(reportingLineStep.counts?.total || 0), reportingLines);
			const skipped = Math.max(0, sourceRows - reportingLines);
			reportingLineStep.status = skipped > 0 ? "WARNING" : "COMPLETED";
			reportingLineStep.counts = {
				...(reportingLineStep.counts || {}),
				...proofSource,
				total: sourceRows,
				processed: sourceRows,
				updated: reportingLines,
				created: 0,
				skipped,
				failed: 0,
				dbProofCount: reportingLines,
				blockerReason:
					skipped > 0
						? `${skipped} source rows remain skipped or unmatched; BNPI org chart total-manpower gap remains documented.`
						: null,
			};
			reportingLineStep.errorJson = null;
			reportingLineStep.summaryJson = {
				...(reportingLineStep.summaryJson || {}),
				label: "Reporting Lines",
				mode: "sheet_import",
				registryStatus: "wired",
				dependsOn: ["DM3.1"],
			};
		}

		const documentStep = steps.find((step: any) => step.stepCode === "DM3.4");
		if (documentStep && documents > 0) {
			const total = Math.max(Number(documentStep.counts?.total || 0), documents);
			documentStep.status = "COMPLETED";
			documentStep.counts = {
				...(documentStep.counts || {}),
				...proofSource,
				total,
				processed: total,
				updated: Math.max(Number(documentStep.counts?.updated || 0), documents),
				created: Number(documentStep.counts?.created || 0),
				failed: 0,
				dbProofCount: documents,
			};
			documentStep.errorJson = null;
		}

		const openingLeaveStep = steps.find((step: any) => step.stepCode === "DM3.5");
		if (openingLeaveStep && openingLeaveBalances > 0) {
			const total = Math.max(Number(openingLeaveStep.counts?.total || 0), openingLeaveBalances);
			openingLeaveStep.status = "COMPLETED";
			openingLeaveStep.counts = {
				...(openingLeaveStep.counts || {}),
				...proofSource,
				total,
				processed: total,
				updated: Math.max(Number(openingLeaveStep.counts?.updated || 0), openingLeaveBalances),
				created: Number(openingLeaveStep.counts?.created || 0),
				failed: 0,
				dbProofCount: openingLeaveBalances,
			};
			openingLeaveStep.errorJson = null;
		}

		const benefitLoanStep = steps.find((step: any) => step.stepCode === "DM3.6");
		if (benefitLoanStep && benefits + loans > 0) {
			const total = Math.max(Number(benefitLoanStep.counts?.total || 0), benefits + loans);
			benefitLoanStep.status = "COMPLETED";
			benefitLoanStep.counts = {
				...(benefitLoanStep.counts || {}),
				...proofSource,
				total,
				processed: total,
				updated: Math.max(Number(benefitLoanStep.counts?.updated || 0), benefits + loans),
				created: Number(benefitLoanStep.counts?.created || 0),
				failed: 0,
				dbProofCount: benefits + loans,
				benefits,
				loans,
			};
			benefitLoanStep.errorJson = null;
		}

		const attendanceStep = steps.find(
			(step: any) => step.stepCode === "DM3.2.attendance_obligations",
		);
		if (attendanceStep) {
			const blockerReason =
				scheduledEmployees > 0 && openPeriods === 0
					? "Attendance obligations could not be materialized because there are no OPEN or PROCESSING payroll periods."
					: scheduledEmployees === 0
						? "Attendance obligations are waiting for imported employee schedules."
						: null;
			attendanceStep.status =
				obligations > 0
					? "COMPLETED"
					: blockerReason
						? "BLOCKED"
						: attendanceStep.status || "PLANNED";
			attendanceStep.counts = {
				...(attendanceStep.counts || {}),
				...proofSource,
				total: obligations || attendanceStep.counts?.total || null,
				processed: obligations || Number(attendanceStep.counts?.processed || 0),
				updated: Math.max(Number(attendanceStep.counts?.updated || 0), obligations),
				existingAfter: obligations,
				employeesWithSchedules: scheduledEmployees,
				periodsProcessed: openPeriods,
				dbProofCount: obligations,
				blockerReason: blockerReason || attendanceStep.counts?.blockerReason || null,
			};
			attendanceStep.errorJson =
				blockerReason && obligations === 0
					? { message: blockerReason }
					: attendanceStep.errorJson;
		}

		const timesheetDraftStep = steps.find(
			(step: any) => step.stepCode === "DM3.2.timesheet_drafts",
		);
		if (timesheetDraftStep && timesheetDrafts > 0) {
			timesheetDraftStep.status = "COMPLETED";
			timesheetDraftStep.counts = {
				...(timesheetDraftStep.counts || {}),
				...proofSource,
				total: Math.max(Number(timesheetDraftStep.counts?.total || 0), timesheetDrafts),
				processed: timesheetDrafts,
				updated: Math.max(Number(timesheetDraftStep.counts?.updated || 0), timesheetDrafts),
				dbProofCount: timesheetDrafts,
			};
			timesheetDraftStep.errorJson = null;
		}
	}

	async findActiveRun(organizationId: string, workbookId: MigrationRunRequest["workbookId"]) {
		return (this.prisma as any).migrationRun.findFirst({
			where: {
				organizationId,
				workbookId,
				isDeleted: false,
				status: { in: [...NON_TERMINAL_RUN_STATUSES, "STALE", "BLOCKED"] },
			},
			orderBy: { updatedAt: "desc" },
			include: {
				steps: { orderBy: { sequence: "asc" } },
				events: { orderBy: { sequence: "desc" }, take: 200 },
			},
		}).then((run: any) => {
			if (Array.isArray(run?.events)) run.events.reverse();
			return run;
		});
	}

	async findLatestRun(
		organizationId: string,
		workbookId: MigrationRunRequest["workbookId"],
		options: { includeDryRun?: boolean } = {},
	) {
		return (this.prisma as any).migrationRun.findFirst({
			where: {
				organizationId,
				workbookId,
				isDeleted: false,
				...(options.includeDryRun ? {} : { dryRun: false }),
			},
			orderBy: { updatedAt: "desc" },
			include: {
				steps: { orderBy: { sequence: "asc" } },
				events: { orderBy: { sequence: "desc" }, take: 200 },
			},
		}).then((run: any) => {
			if (Array.isArray(run?.events)) run.events.reverse();
			return run;
		});
	}

	async getEvents(runId: string, limit = 500) {
		const take = Math.max(1, Math.min(1000, Number(limit || 500)));
		const events = await (this.prisma as any).migrationRunEvent.findMany({
			where: { runId },
			orderBy: { sequence: "desc" },
			take,
		});
		return events.reverse();
	}

	private async closeSupersededRun(run: any, message: string) {
		const cancelledWorker = run.workbookId === "dm4" ? this.dm4Adapter.cancelRun(run.id) : false;
		activeRunJobs.delete(run.id);
		await this.events.append({
			runId: run.id,
			stage: String(run.workbookId || run.stage || "migration").toUpperCase(),
			eventType: "RUN_STALE",
			status: "STALE",
			message,
			counts: { cancelledWorker: cancelledWorker ? 1 : 0 },
			metadata: { reason: "SUPERSEDED_BY_NEW_RUN" },
		});
		await (this.prisma as any).migrationRun.update({
			where: { id: run.id },
			data: {
				status: "STALE",
				phase: "STALE",
				finishedAt: now(),
				errorJson: {
					message,
					reason: "SUPERSEDED_BY_NEW_RUN",
					cancelledWorker,
				},
			},
		});
		await (this.prisma as any).migrationRunStep.updateMany({
			where: { runId: run.id, status: "RUNNING" },
			data: {
				status: "BLOCKED",
				finishedAt: now(),
				errorJson: { message },
			},
		});
	}

	async recover(runId: string, actorUserId?: string) {
		return this.rerun(runId, actorUserId);
	}

	async rerun(runId: string, actorUserId?: string) {
		const run = await this.getRun(runId);
		if (!run) return null;
		const sourceFiles = normalizePersistedSourceFiles(run.sourceFiles);
		const sourceFilePaths = getSourceFilePaths(sourceFiles);
		const request: MigrationRunRequest = {
			organizationId: run.organizationId,
			workbookId: run.workbookId,
			sourceFilename:
				run.sourceFilename ||
				(sourceFilePaths.length > 0 ? `${sourceFilePaths.length} source workbook path(s)` : null),
			sourceFiles,
			idempotencyKey: `${run.idempotencyKey || run.id}:rerun:${Date.now()}`,
			actorUserId: actorUserId || run.startedByUserId || undefined,
			options: {
				sourceFiles: sourceFilePaths,
				...(run.workbookId === "dm4" ? { approveHistoricalTimesheets: true } : {}),
				rerunOf: run.id,
			},
		};
		await this.events.append({
			runId: run.id,
			stage: run.workbookId.toUpperCase(),
			eventType: "RECOVERY_STARTED",
			status: "QUEUED",
			message: "A fresh migration rerun was queued from this durable run.",
		});
		return this.startRun(request);
	}

	private async createOrReuseRun(
		request: MigrationRunRequest & { status: MigrationRunStatus; phase: string },
	) {
		const sourceFiles = normalizeSourceFiles(request);
		const existing = await (this.prisma as any).migrationRun.findUnique({
			where: {
				organizationId_idempotencyKey: {
					organizationId: request.organizationId,
					idempotencyKey: request.idempotencyKey,
				},
			},
		});
		if (existing) return existing;

		return (this.prisma as any).migrationRun.create({
			data: {
				organizationId: request.organizationId,
				stage: request.workbookId.toUpperCase(),
				workbookId: request.workbookId,
				sourceFilename: request.sourceFilename || request.files?.[0]?.originalname || null,
				sourceFiles: sourceFiles.length > 0 ? sourceFiles : undefined,
				idempotencyKey: request.idempotencyKey,
				dryRun: request.dryRun === true,
				status: request.status,
				phase: request.phase,
				startedByUserId: request.actorUserId || null,
				startedAt: now(),
				progress: { source: request.files?.[0]?.originalname || request.options?.sourceFiles || null },
			},
		});
	}

	private async persistStepPlan(runId: string, workbookId: MigrationRunRequest["workbookId"]) {
		const plan = getMigrationStepPlan(workbookId);
		await (this.prisma as any).migrationRunStep.createMany({
			data: plan.map((step, index) => ({
				runId,
				sequence: index + 1,
				stage: step.workbookId.toUpperCase(),
				stepCode: step.stepCode,
				phase: step.mode,
				status: step.status === "wired" ? "PLANNED" : "NOT_WIRED",
				summaryJson: {
					label: step.label,
					mode: step.mode,
					dependsOn: step.dependsOn,
					registryStatus: step.status,
				},
			})),
			skipDuplicates: true,
		});
		await this.events.append({
			runId,
			stage: workbookId.toUpperCase(),
			eventType: "GRAPH_BUILT",
			status: "VALIDATING",
			message: `${workbookId.toUpperCase()} dependency graph built from migration step registry.`,
			counts: {
				steps: plan.length,
				wired: plan.filter((step) => step.status === "wired").length,
				notWired: plan.filter((step) => step.status !== "wired").length,
			},
			metadata: { steps: plan },
		});
	}

	private async executeRun(runId: string, request: MigrationRunRequest) {
		try {
			await (this.prisma as any).migrationRun.update({
				where: { id: runId },
				data: { status: "STARTING", phase: "STARTING", startedAt: now() },
			});
			const result =
				request.workbookId === "dm3"
					? await this.dm3Adapter.run(runId, request)
					: await this.dm4Adapter.run(runId, request);
			await this.finishRun(runId, result, false);
		} catch (error: any) {
			const current = await (this.prisma as any).migrationRun.findUnique({
				where: { id: runId },
				select: {
					status: true,
					organizationId: true,
					workbookId: true,
					sourceFilename: true,
					startedByUserId: true,
					startedAt: true,
					createdAt: true,
				},
			});
			if (current?.status === "STALE") return;
			const finishedAt = now();
			const failMessage = error?.message || "Migration run failed.";
			await (this.prisma as any).migrationRunStep.updateMany({
				where: { runId, status: "RUNNING" },
				data: {
					status: "FAILED",
					finishedAt,
					errorJson: { message: failMessage },
				},
			});
			await this.events.append({
				runId,
				stage: request.workbookId.toUpperCase(),
				eventType: "RUN_FAILED",
				status: "FAILED",
				message: failMessage,
			});
			await (this.prisma as any).migrationRun.update({
				where: { id: runId },
				data: {
					status: "FAILED",
					phase: "FAILED",
					finishedAt,
					errorJson: { message: failMessage },
				},
			});
			if (
				current?.organizationId &&
				(current.workbookId === "dm3" || current.workbookId === "dm4")
			) {
				const kind =
					current.workbookId === "dm4" ? ("dm4-workbook" as const) : ("workbook" as const);
				await persistDm3ImportActivityLog({
					prisma: this.prisma,
					organizationId: current.organizationId,
					kind,
					sourceFilename:
						current.sourceFilename ||
						(current.workbookId === "dm4" ? "dm4-sources.xlsx" : "dm3-workbook.xlsx"),
					migrationRunId: runId,
					startedByUserId: current.startedByUserId || null,
					startedAt: current.startedAt || current.createdAt || finishedAt,
					finishedAt,
					total: 0,
					created: 0,
					updated: 0,
					skipped: 0,
					failed: 1,
					status: "failed",
					errors: [{ row: 0, message: failMessage }],
					summaryExtra: { runStatus: "FAILED", workbookId: current.workbookId },
				});
			}
		}
	}

	private async finishRun(runId: string, result: MigrationRunAdapterResult, dryRun: boolean) {
		const current = await (this.prisma as any).migrationRun.findUnique({
			where: { id: runId },
			select: {
				status: true,
				organizationId: true,
				workbookId: true,
				sourceFilename: true,
				startedByUserId: true,
				startedAt: true,
				createdAt: true,
			},
		});
		if (!dryRun && current?.status === "STALE") return;
		const finishedAt = now();
		await (this.prisma as any).migrationRun.update({
			where: { id: runId },
			data: {
				status: result.status,
				phase: result.phase || result.status,
				progress: result.progress || undefined,
				counts: result.counts || undefined,
				summaryJson: result.summaryJson || undefined,
				proofJson: result.proofJson || undefined,
				errorJson: result.errorJson || undefined,
				finishedAt,
			},
		});
		await this.events.append({
			runId,
			stage: "MIGRATION",
			eventType: dryRun ? "DRY_RUN_COMPLETED" : result.status === "BLOCKED" ? "RUN_BLOCKED" : "RUN_COMPLETED",
			status: result.status,
			message: dryRun ? "Migration dry-run persisted." : "Migration run persisted.",
			counts: result.counts || null,
		});

		// DM3/DM4 durable runs: operator Upload activity (clickable history, same table as mass uploads).
		if (
			!dryRun &&
			current?.organizationId &&
			(current.workbookId === "dm3" || current.workbookId === "dm4")
		) {
			const counts = (result.counts || {}) as Record<string, any>;
			const proof = (result.proofJson || {}) as Record<string, any>;

			if (current.workbookId === "dm4") {
				const activity = buildDm4UploadActivityFromRunResult({
					resultStatus: String(result.status || ""),
					counts,
					proofJson: proof,
					errorMessage: (result.errorJson as any)?.message || null,
				});
				const kind = activity.otOnly
					? ("dm4-overtime" as const)
					: ("dm4-workbook" as const);
				await persistDm3ImportActivityLog({
					prisma: this.prisma,
					organizationId: current.organizationId,
					kind,
					sourceFilename:
						current.sourceFilename ||
						(activity.otOnly ? "dm4-overtime.xlsx" : "dm4-sources.xlsx"),
					migrationRunId: runId,
					startedByUserId: current.startedByUserId || null,
					startedAt: current.startedAt || current.createdAt || finishedAt,
					finishedAt,
					total: activity.total,
					created: activity.created,
					updated: activity.updated,
					skipped: activity.skipped,
					failed: activity.failed,
					status: activity.status,
					errors: activity.errors,
					results: activity.results,
					summaryExtra: {
						runStatus: result.status,
						phase: result.phase || result.status,
						counts,
						workbookId: current.workbookId,
						otOnly: activity.otOnly,
						attendanceRowsFound: Number(counts.attendanceRowsFound || 0),
						timesheetlineRowsFound: Number(counts.timesheetlineRowsFound || 0),
						materializedMissingLines: Number(counts.materializedMissingLines || 0),
					},
				});
			} else {
				const total = Number(
					counts.totalRows ??
						counts.total ??
						counts.rows ??
						counts.processed ??
						0,
				);
				const created = Number(counts.created ?? counts.success ?? 0);
				const updated = Number(counts.updated ?? 0);
				const skipped = Number(counts.skipped ?? 0);
				const failed = Number(counts.failed ?? counts.failures ?? 0);
				const blocked = Number(counts.blocked ?? 0);
				const statusText = String(result.status || "").toUpperCase();
				const status =
					statusText.includes("FAIL") || statusText === "BLOCKED"
						? failed + blocked > 0 && created + updated > 0
							? ("partial" as const)
							: ("failed" as const)
						: resolveMassUploadImportStatus({
								total: total || created + updated + failed + blocked,
								created,
								updated,
								failed: failed + blocked,
							});
				const errorMessage =
					(result.errorJson as any)?.message ||
					(status === "failed"
						? "DM3 import failed or blocked."
						: undefined);
				await persistDm3ImportActivityLog({
					prisma: this.prisma,
					organizationId: current.organizationId,
					kind: "workbook",
					sourceFilename: current.sourceFilename || "dm3-workbook.xlsx",
					migrationRunId: runId,
					startedByUserId: current.startedByUserId || null,
					startedAt: current.startedAt || current.createdAt || finishedAt,
					finishedAt,
					total: total || created + updated + failed + blocked,
					created,
					updated,
					skipped,
					failed: failed + blocked,
					status,
					errors: errorMessage ? [{ row: 0, message: String(errorMessage) }] : [],
					results: [],
					summaryExtra: {
						runStatus: result.status,
						phase: result.phase || result.status,
						counts,
						workbookId: current.workbookId,
					},
				});
			}
		}
	}
}
