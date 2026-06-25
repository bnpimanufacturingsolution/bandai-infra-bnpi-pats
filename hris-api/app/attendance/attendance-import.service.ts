import { AttendanceStatus, PrismaClient } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { randomUUID } from "crypto";
import {
	calculateTimekeeping,
	determineAttendanceStatus,
	deriveBehaviorFlags,
} from "../../helper/timekeeping.helper";
import {
	buildAttendanceTimekeepingFields,
	fetchAttendanceEmployeeSnapshotFields,
} from "../../helper/attendance.helper";
import {
	generateTimesheetForPayrollPeriod,
	resolvePayrollPeriodIdForAttendanceDate,
} from "../../helper/timesheet.helper";
import { resolveEffectiveShift } from "../../helper/employee-schedule.helper";
import { applyAttendanceToObligation } from "../../helper/attendance-obligation.helper";
import { traceAsync } from "../../middleware/functionTracing";

const logger = getLogger();
const attendanceLogger = logger.child({ module: "attendance-import" });

export interface ImportJobProgress {
	jobId: string;
	status: "processing" | "completed" | "failed";
	total: number;
	processed: number;
	success: number;
	failed: number;
	errors: Array<{ row: number; employeeId: string; error: string }>;
	startedAt: Date;
	completedAt?: Date;
}

interface AttendanceRow {
	employeeId: string;
	date: Date;
	timeIn: Date | null;
	timeOut: Date | null;
	status?: string;
	notes?: string;
}

interface ImportResult {
	success: boolean;
	employeeId: string;
	date: string;
	error?: string;
	resolvedEmployeeId?: string;
	payrollPeriodId?: string | null;
}

interface AttendanceImportOptions {
	createTimesheets?: boolean;
}

export const ATTENDANCE_IMPORT_SOURCE_TRUTH_CONTRACT = {
	writeTarget: "Attendance",
	clockLedgerTruth: "Attendance",
	operationalProjection: "AttendanceObligation",
	timesheetGenerationSource: "AttendanceObligation -> Timesheetline.effectiveRows",
	paidPayrollHistory: "EmployeePayroll.timesheetSnapshot",
} as const;

export function normalizeAttendanceImportStatus(value?: string | null): {
	status?: AttendanceStatus;
	error?: string;
} {
	const normalizedStatus = value?.trim().toUpperCase();
	if (!normalizedStatus) return {};
	if (!AttendanceImportService.isAttendanceStatus(normalizedStatus)) {
		return {
			error: `Invalid STATUS "${normalizedStatus}". Must be one of: PRESENT, LEAVE, INCOMPLETE, ABSENT, REST_DAY`,
		};
	}
	return { status: normalizedStatus };
}

export function buildAttendanceImportTimesheetKey(params: {
	employeeId?: string | null;
	payrollPeriodId?: string | null;
}): string | null {
	if (!params.employeeId || !params.payrollPeriodId) return null;
	return `${params.employeeId}:${params.payrollPeriodId}`;
}

export class AttendanceImportService {
	private static readonly VALID_STATUSES: ReadonlySet<AttendanceStatus> = new Set<
		AttendanceStatus
	>(["PRESENT", "LEAVE", "INCOMPLETE", "ABSENT", "REST_DAY"]);

	// Static map to store import job progress (use Redis in production for multi-instance support)
	private static importJobs: Map<string, ImportJobProgress> = new Map();

	// Cleanup jobs older than 1 hour
	private static cleanupOldJobs() {
		const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
		for (const [jobId, job] of this.importJobs.entries()) {
			if (job.startedAt < oneHourAgo) {
				this.importJobs.delete(jobId);
				attendanceLogger.info(`Cleaned up old import job: ${jobId}`);
			}
		}
	}

	// Get job progress by ID
	static getJobProgress(jobId: string): ImportJobProgress | null {
		this.cleanupOldJobs();
		return this.importJobs.get(jobId) || null;
	}

	// Create new import job
	private createImportJob(total: number): string {
		const jobId = randomUUID();
		const job: ImportJobProgress = {
			jobId,
			status: "processing",
			total,
			processed: 0,
			success: 0,
			failed: 0,
			errors: [],
			startedAt: new Date(),
		};
		AttendanceImportService.importJobs.set(jobId, job);
		attendanceLogger.info(`Created import job ${jobId} for ${total} attendance records`);
		return jobId;
	}

	// Update job progress
	private updateJobProgress(
		jobId: string,
		update: Partial<Omit<ImportJobProgress, "jobId" | "startedAt">>,
	) {
		const job = AttendanceImportService.importJobs.get(jobId);
		if (job) {
			Object.assign(job, update);
			AttendanceImportService.importJobs.set(jobId, job);
		}
	}

	private prisma: PrismaClient;
	private organizationId: string;
	private createTimesheets: boolean;
	private overtimeFlagThresholdMinutesCache: number | null = null;

	constructor(prisma: PrismaClient, organizationId: string, options: AttendanceImportOptions = {}) {
		this.prisma = prisma;
		this.organizationId = organizationId;
		this.createTimesheets = options.createTimesheets === true;
	}

	private async getOvertimeFlagThresholdMinutes(): Promise<number> {
		return traceAsync(
			async () => {
				if (this.overtimeFlagThresholdMinutesCache !== null) {
					return this.overtimeFlagThresholdMinutesCache;
				}

				try {
					const timesheetConfig = await this.prisma.timesheetConfig.findUnique({
						where: { organizationId: this.organizationId },
						select: { overtimeFlagThresholdMinutes: true } as any,
					});
					const threshold = (timesheetConfig as any)?.overtimeFlagThresholdMinutes;
					this.overtimeFlagThresholdMinutesCache =
						typeof threshold === "number" ? threshold : 60;
				} catch {
					this.overtimeFlagThresholdMinutesCache = 60;
				}

				return this.overtimeFlagThresholdMinutesCache;
			},
			"AttendanceImportService.getOvertimeFlagThresholdMinutes",
			"attendance-import",
		);
	}

	static isAttendanceStatus(value: string): value is AttendanceStatus {
		return AttendanceImportService.VALID_STATUSES.has(value as AttendanceStatus);
	}

	private async importAttendanceRecord(
		row: AttendanceRow,
		rowIndex: number,
	): Promise<ImportResult> {
		return traceAsync(
			async () => {
				try {
					// Generic string identifier lookup for both Mongo and Postgres-backed IDs.
					const whereClause = {
						organizationId: this.organizationId,
						OR: [{ employeeId: row.employeeId }, { deviceEmpId: row.employeeId }, { id: row.employeeId }],
					};
					const employee = await this.prisma.employee.findFirst({
						where: whereClause,
					});

					if (!employee) {
						return {
							success: false,
							employeeId: row.employeeId,
							date: row.date.toISOString().split("T")[0],
							error: `Employee not found: ${row.employeeId}`,
						};
					}

					// Check if attendance already exists for this date
					const existingAttendance = await this.prisma.attendance.findFirst({
						where: {
							organizationId: this.organizationId,
							employeeId: employee.id,
							date: row.date,
						},
					});

					// Calculate timekeeping when timeIn exists (timeOut may be null for in-progress day)
					let timekeepingData: any = {};
					let computedStatus: AttendanceStatus | null = null;
					let behaviorFlags: Array<"TARDINESS" | "EARLY_OUT" | "OVERTIME"> = [];
					const scheduleSnapshot = await resolveEffectiveShift(this.prisma, {
						organizationId: this.organizationId,
						employeeId: employee.id,
						date: row.date,
					});
					if (row.timeIn) {
						try {
							const overtimeFlagThresholdMinutes =
								await this.getOvertimeFlagThresholdMinutes();
							const result = calculateTimekeeping(
								row.timeIn,
								row.timeOut,
								scheduleSnapshot,
								row.date,
							);
							timekeepingData = buildAttendanceTimekeepingFields(result);
							behaviorFlags = deriveBehaviorFlags({
								timeIn: row.timeIn,
								timeOut: row.timeOut,
								schedule: scheduleSnapshot,
								date: row.date,
								overtimeThresholdMinutes: overtimeFlagThresholdMinutes,
							});
							computedStatus = determineAttendanceStatus(result, !!row.timeOut);
						} catch (error) {
							attendanceLogger.warn(
								`Failed to calculate timekeeping for ${row.employeeId}: ${error}`,
							);
						}
					}

					const manualStatus = normalizeAttendanceImportStatus(row.status);
					if (manualStatus.error) {
						return {
							success: false,
							employeeId: row.employeeId,
							date: row.date.toISOString().split("T")[0],
							error: manualStatus.error,
						};
					}

					// Manual STATUS takes precedence. If omitted, auto-compute from metrics when possible.
					const finalStatus: AttendanceStatus = manualStatus.status || computedStatus || "PRESENT";
					const finalBehaviorFlags =
						finalStatus === "LEAVE" || finalStatus === "ABSENT" || finalStatus === "REST_DAY"
							? []
							: behaviorFlags;

					const attendanceData = {
						organizationId: this.organizationId,
						employeeId: employee.id,
						date: row.date,
						timeIn: row.timeIn,
						timeOut: row.timeOut,
						status: finalStatus,
						behaviorFlags: finalBehaviorFlags,
						isManualEntry: true,
						notes: row.notes,
						scheduleSnapshot,
						...(await fetchAttendanceEmployeeSnapshotFields(this.prisma, employee.id)),
						...timekeepingData,
					};

					const savedAttendance = existingAttendance
						// Update existing attendance
						? await this.prisma.attendance.update({
							where: { id: existingAttendance.id },
							data: attendanceData,
						})
						// Create new attendance
						: await this.prisma.attendance.create({
							data: attendanceData,
						});

					await applyAttendanceToObligation(this.prisma, {
						organizationId: this.organizationId,
						employeeId: employee.id,
						attendanceId: savedAttendance.id,
					});

					return {
						success: true,
						employeeId: row.employeeId,
						date: row.date.toISOString().split("T")[0],
						resolvedEmployeeId: employee.id,
						payrollPeriodId: this.createTimesheets
							? await resolvePayrollPeriodIdForAttendanceDate(
									this.prisma,
									this.organizationId,
									row.date,
							  )
							: null,
					};
				} catch (error: any) {
					return {
						success: false,
						employeeId: row.employeeId,
						date: row.date.toISOString().split("T")[0],
						error: error.message || "Unknown error",
					};
				}
			},
			"AttendanceImportService.importAttendanceRecord",
			"attendance-import",
		);
	}

	async importAttendance(rows: AttendanceRow[]): Promise<{
		jobId: string;
		success: number;
		failed: number;
		results: ImportResult[];
	}> {
		return traceAsync(
			async () => {
				const jobId = this.createImportJob(rows.length);

				// Start background processing - do NOT await
				this.processImportBatch(jobId, rows).catch((error) => {
					attendanceLogger.error(`Background import job ${jobId} failed: ${error}`);
				});

				// Return initial jobId immediately
				return { jobId, success: 0, failed: 0, results: [] };
			},
			"AttendanceImportService.importAttendance",
			"attendance-import",
		);
	}

	private async processImportBatch(jobId: string, rows: AttendanceRow[]) {
		return traceAsync(
			async () => {
				const results: ImportResult[] = [];
				const affectedPayrollPeriods = new Map<
					string,
					{ employeeId: string; payrollPeriodId: string }
				>();
				let processed = 0;
				let successCount = 0;
				let failedCount = 0;

				for (let i = 0; i < rows.length; i++) {
					const row = rows[i];

					try {
						const result = await this.importAttendanceRecord(row, i);

						results.push(result);
						processed++;

						if (result.success) {
							successCount++;
							const timesheetKey = buildAttendanceImportTimesheetKey({
								employeeId: result.resolvedEmployeeId,
								payrollPeriodId: result.payrollPeriodId,
							});
							if (this.createTimesheets && timesheetKey && result.resolvedEmployeeId && result.payrollPeriodId) {
								affectedPayrollPeriods.set(timesheetKey, {
									employeeId: result.resolvedEmployeeId,
									payrollPeriodId: result.payrollPeriodId,
								});
							}
						} else {
							failedCount++;
							// Store error details (limit to last 50 errors to prevent memory issues)
							const job = AttendanceImportService.importJobs.get(jobId);
							if (job && job.errors.length < 50) {
								job.errors.push({
									row: i + 1,
									employeeId: row.employeeId || "unknown",
									error: result.error || "Unknown error",
								});
							}
						}

						// Update progress every 5 rows or on the last row
						if (processed % 5 === 0 || processed === rows.length) {
							this.updateJobProgress(jobId, {
								processed,
								success: successCount,
								failed: failedCount,
							});
						}
					} catch (error: any) {
						// Handle unexpected errors
						processed++;
						failedCount++;
						const errorResult: ImportResult = {
							success: false,
							employeeId: row.employeeId || "unknown",
							date: row.date?.toISOString().split("T")[0] || "unknown",
							error: error.message || "Unexpected error during import",
						};
						results.push(errorResult);

						const job = AttendanceImportService.importJobs.get(jobId);
						if (job && job.errors.length < 50) {
							job.errors.push({
								row: i + 1,
								employeeId: row.employeeId || "unknown",
								error: error.message || "Unexpected error",
							});
						}

						this.updateJobProgress(jobId, {
							processed,
							success: successCount,
							failed: failedCount,
						});
					}
				}

				if (this.createTimesheets && affectedPayrollPeriods.size > 0) {
					for (const { employeeId, payrollPeriodId } of affectedPayrollPeriods.values()) {
						try {
							await generateTimesheetForPayrollPeriod(
								this.prisma,
								employeeId,
								this.organizationId,
								payrollPeriodId,
								"System-approved timesheet created from attendance import",
								"APPROVED",
							);
						} catch (error: any) {
							attendanceLogger.warn(
								`Failed to generate import timesheet for employee ${employeeId}, period ${payrollPeriodId}: ${error?.message || error}`,
							);
						}
					}
				}

				// Mark job as completed
				this.updateJobProgress(jobId, {
					status: "completed",
					completedAt: new Date(),
				});

				attendanceLogger.info(
					`Import job ${jobId} completed: ${successCount} success, ${failedCount} failed`,
				);
			},
			"AttendanceImportService.processImportBatch",
			"attendance-import",
		);
	}
}
