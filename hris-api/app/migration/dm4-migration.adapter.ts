import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PrismaClient } from "../../generated/prisma";
import { MigrationEventService } from "./migration-event.service";
import { MigrationRunAdapterResult, MigrationRunRequest } from "./migration-run.types";
import {
	isDm4ApprovedOvertimeWorkbookPath,
	resolveMigrationDm4SourceFiles,
} from "./migration-dry-run.service";

const activeDm4ProofScripts = new Map<string, ReturnType<typeof spawn>>();
const BANDAI_2026_PAYROLL_PERIOD_CODE = "PP-20260426-20260511";

export class Dm4MigrationAdapter {
	constructor(
		private readonly prisma: PrismaClient,
		private readonly events: MigrationEventService,
	) {}

	cancelRun(runId: string) {
		const child = activeDm4ProofScripts.get(runId);
		if (!child) return false;
		if (!child.killed) {
			child.kill();
		}
		activeDm4ProofScripts.delete(runId);
		return true;
	}

	async run(runId: string, request: MigrationRunRequest): Promise<MigrationRunAdapterResult> {
		const rawSourceFiles = Array.isArray(request.options?.sourceFiles)
			? request.options?.sourceFiles
			: Array.isArray(request.sourceFiles)
				? request.sourceFiles.map((file) => file.path || file.name)
				: [];
		const hasExplicitApprovedOvertimeOption =
			Array.isArray(request.options?.approvedOvertimeFiles) ||
			Array.isArray(request.options?.approvedOvertimeSourceFiles);
		const explicitApprovedOvertimeFiles = Array.isArray(request.options?.approvedOvertimeFiles)
			? request.options.approvedOvertimeFiles
			: Array.isArray(request.options?.approvedOvertimeSourceFiles)
				? request.options.approvedOvertimeSourceFiles
				: [];
		const resolution = resolveMigrationDm4SourceFiles(rawSourceFiles, {
			approvedOvertimeFiles: explicitApprovedOvertimeFiles,
			// UI sends an explicit list (possibly empty); do not force the legacy default OT file.
			autoAppendDefaultApprovedOvertime: !hasExplicitApprovedOvertimeOption,
		});
		const sourceConfig = String(request.options?.sourceConfig || "").trim();
		const approveHistoricalTimesheets = request.options?.approveHistoricalTimesheets === true;
		const scriptPath = path.resolve(process.cwd(), "scripts", "bnpi-demo-attendance-proof.cjs");

		await this.events.append({
			runId,
			stage: "DM4",
			eventType: "SOURCE_FILES_RESOLVED",
			status: "READING_SOURCE",
			message: `Resolved ${resolution.sourceWorkbookFiles.length} DM4 source workbook file(s).`,
			counts: { sourceWorkbookCount: resolution.sourceWorkbookFiles.length },
			metadata: { sourceWorkbookFiles: resolution.sourceWorkbookFiles.slice(0, 50) },
		});

		if (!fs.existsSync(scriptPath)) {
			await this.events.append({
				runId,
				stage: "DM4",
				eventType: "RUN_BLOCKED",
				status: "BLOCKED",
				message: "DM4 proof script was not found.",
			});
			return { status: "BLOCKED", phase: "READING_SOURCE", errorJson: { message: "DM4 proof script was not found." } };
		}

		const organization = await this.prisma.organization.findUnique({
			where: { code: "bnei" },
			select: { id: true },
		});
		const employeeCount = organization
			? await this.prisma.employee.count({ where: { organizationId: organization.id, isDeleted: false } })
			: 0;
		if (!organization || employeeCount === 0) {
			const message = !organization
				? "DM4 proof requires the BNEI organization seed before attendance proof can run."
				: "DM4 proof needs DM3 employee records imported first.";
			await this.events.append({
				runId,
				stage: "DM4",
				eventType: "BLOCKER_FOUND",
				status: "BLOCKED",
				message,
				counts: { matchedEmployees: employeeCount },
			});
			return { status: "BLOCKED", phase: "VALIDATING", counts: { matchedEmployees: employeeCount }, errorJson: { message } };
		}

		const progressFile = path.join(os.tmpdir(), `dm4-progress-${runId}.jsonl`);
		try {
			fs.rmSync(progressFile, { force: true });
		} catch {
			// Ignore stale diagnostic-file cleanup failures.
		}

		const args = [scriptPath, "--apply", "--limit=all", "--batchSize=500", `--progressFile=${progressFile}`];
		if (approveHistoricalTimesheets) args.push("--approveHistoricalTimesheets");
		const attendanceWorkbookFiles =
			resolution.attendanceWorkbookFiles ||
			resolution.workbookFiles.filter((filePath) => !isDm4ApprovedOvertimeWorkbookPath(filePath));
		if (attendanceWorkbookFiles.length > 0) {
			args.push(`--files=${attendanceWorkbookFiles.join(";")}`);
		} else if (sourceConfig) {
			args.push(`--sourceConfig=${sourceConfig}`);
		}

		await this.events.append({
			runId,
			stage: "DM4",
			stepCode: "DM4.1",
			eventType: "STEP_STARTED",
			status: "IMPORTING",
			message: "Reading source workbooks and applying attendance evidence.",
			counts: { sourceWorkbookCount: resolution.sourceWorkbookFiles.length, matchedEmployees: employeeCount },
		});

		const { stdout, stderr } = await this.runProofScriptWithProgress({
			runId,
			args,
			progressFile,
			sourceWorkbookCount: resolution.sourceWorkbookFiles.length,
			matchedEmployees: employeeCount,
		});
		const jsonStart = stdout.indexOf("{");
		const proof = jsonStart >= 0 ? JSON.parse(stdout.slice(jsonStart)) : null;
		if (!proof) throw new Error("DM4 proof script did not return a JSON report.");
		const selectedRowsTotal = Number(
			proof?.phase1Selection?.selectedRowsTotal || proof?.phase2Application?.appliedTotal || 0,
		);
		const attendanceRowsFound = Number(proof?.phase3DbProof?.attendanceRowsFound || 0);
		const timesheetlineRowsFound = Number(proof?.phase3DbProof?.timesheetlineRowsFound || 0);
		if (selectedRowsTotal > 0 && attendanceRowsFound === 0 && timesheetlineRowsFound === 0) {
			const skippedNoSchedule = Number(
				proof?.phase2Application?.writeCounts?.rowsSkippedNoEmployeeSchedule ||
					proof?.phase2Materialization?.presentRows?.writeCounts?.rowsSkippedNoEmployeeSchedule ||
					0,
			);
			const message =
				skippedNoSchedule >= selectedRowsTotal
					? "DM4 proof selected source rows, but all rows were skipped because no active employee schedule covered the source dates."
					: "DM4 proof selected source rows, but no attendance or timesheetline DB proof rows were found.";
			await this.events.append({
				runId,
				stage: "DM4",
				eventType: "BLOCKER_FOUND",
				status: "BLOCKED",
				message,
				counts: { selectedRowsTotal, attendanceRowsFound, timesheetlineRowsFound, skippedNoSchedule },
			});
			return {
				status: "BLOCKED",
				phase: "VERIFYING",
				counts: {
					sourceWorkbookCount: resolution.sourceWorkbookFiles.length,
					matchedEmployees: employeeCount,
					attendanceRowsFound,
					timesheetlineRowsFound,
					materializedMissingLines: 0,
					skippedNoSchedule,
				},
				summaryJson: {
					sourceFiles: resolution.sourceFiles,
					sourceWorkbookFiles: resolution.sourceWorkbookFiles,
					stderr: stderr ? stderr.slice(0, 4000) : undefined,
				},
				proofJson: proof,
				errorJson: { message },
			};
		}

		const selectedRows = Array.isArray(proof?.phase1Selection?.selectedRows)
			? proof.phase1Selection.selectedRows
			: [];
		const appliedRows = Array.isArray(proof?.phase2Application?.applied)
			? proof.phase2Application.applied
			: Array.isArray(proof?.phase2Materialization?.presentRows?.applied)
				? proof.phase2Materialization.presentRows.applied
				: [];
		const selectedRowsByEmployeeDate = new Map(
			selectedRows.map((row: any) => [
				`${row.dbEmployeeId || row.sourceEmployeeId || row.employeeId || ""}:${row.date || ""}`,
				row,
			]),
		);
		const rowEvidence = (
			appliedRows.length > 0
				? appliedRows.map((row: any) => ({
						...((selectedRowsByEmployeeDate.get(
							`${row.employeeId || ""}:${row.date || ""}`,
						) || {}) as Record<string, any>),
						...row,
					}))
				: selectedRows
		).slice(0, 500);
		if (rowEvidence.length > 0) {
			for (let index = 0; index < rowEvidence.length; index += 100) {
				await this.events.appendMany(
					rowEvidence.slice(index, index + 100).map((row: any) => ({
						runId,
						stage: "DM4",
						stepCode: "DM4.1",
						eventType: "ROW_IMPORTED",
						status: "COMPLETED",
						sourceWorkbook: row.sourceWorkbook || row.sourceWorkbookPath || null,
						sourceFile: row.sourceWorkbookPath || row.sourceWorkbook || null,
						sourceSheet: row.sourceSheet || "Attendance History",
						sourceRow: Number(row.sourceRow || 0) || null,
						employeeId: row.employeeId || row.dbEmployeeId || row.sourceEmployeeId || null,
						employeeName: row.dbEmployeeName || row.sourceEmployeeName || row.employeeName || null,
						message: `DM4 attendance row materialized for ${row.date || "source date"}.`,
						counts: {
							attendanceRowsFound: Number(proof?.phase3DbProof?.attendanceRowsFound || 0),
							timesheetlineRowsFound: Number(proof?.phase3DbProof?.timesheetlineRowsFound || 0),
						},
						metadata: {
							businessDate: row.date || null,
							payrollPeriodCode: row.payrollPeriodCode || null,
							timesheetlineId: row.timesheetlineId || null,
							attendanceId: row.attendanceId || null,
							sourceKind: row.sourceKind || "attendance_summary",
						},
					})),
				);
			}
		}
		await this.events.append({
			runId,
			stage: "DM4",
			stepCode: "DM4.1",
			eventType: "STEP_COMPLETED",
			status: "COMPLETED",
			message: "Attendance History rows were materialized with set-based SQL.",
			counts: {
				total: Number(proof?.phase1Selection?.selectedRowsTotal || proof?.phase2Application?.appliedTotal || 0),
				created: Number(proof?.phase2Application?.writeCounts?.attendanceCreated || 0),
				updated: Number(proof?.phase2Application?.writeCounts?.attendanceUpdated || proof?.phase3DbProof?.attendanceRowsFound || 0),
				failed: 0,
				sourceRowsScanned: Number(proof?.phase1Selection?.sourceRowsScanned || 0),
				matchedEmployees: Number(proof?.phase1Selection?.dbEmployeesMatched || employeeCount),
			},
		});

		const materialization = proof?.timesheetMaterialization || proof?.phase2Materialization?.timesheetDays || {};
		await this.events.append({
			runId,
			stage: "DM4",
			stepCode: "DM4.2",
			eventType: "MATERIALIZATION_COMPLETED",
			status: "VERIFYING",
			message: "Materialized DM4 timesheet candidates idempotently.",
			counts: {
				total: Number(
					proof?.phase3DbProof?.timesheetlineRowsFound ||
						materialization.scanned ||
						materialization.timesheetsRecalculated ||
						0,
				),
				updated: Number(materialization.timesheetsRecalculated || 0),
				materializedMissingLines: Number(materialization.materializedMissingLines || 0),
				timesheetsRecalculated: Number(materialization.timesheetsRecalculated || 0),
			},
			metadata: { mutatesRecurringSchedule: false },
		});

		const approvedOvertimeWorkbook =
			resolution.approvedOvertimeWorkbookFiles?.[0] ||
			resolution.workbookFiles.find((filePath) => isDm4ApprovedOvertimeWorkbookPath(filePath));
		const approvedOvertimeRepair = approvedOvertimeWorkbook
			? await this.runApprovedOvertimeRepair({
					runId,
					workbookPath: approvedOvertimeWorkbook,
					periodCode: BANDAI_2026_PAYROLL_PERIOD_CODE,
				})
			: null;
		if (!approvedOvertimeWorkbook) {
			await this.events.append({
				runId,
				stage: "DM4",
				stepCode: "DM4.3",
				eventType: "MATERIALIZATION_COMPLETED",
				status: "COMPLETED",
				message: "No approved overtime details workbook was supplied for DM4.",
				counts: { total: 0, updated: 0, skipped: 0, approvedOvertimeWorkbookCount: 0 },
			});
		}
		await this.events.append({
			runId,
			stage: "DM4",
			eventType: "DB_PROOF_COMPLETED",
			status: "VERIFYING",
			message: "DM4 DB proof completed.",
			counts: {
				attendanceRowsFound: Number(proof?.phase3DbProof?.attendanceRowsFound || 0),
				timesheetlineRowsFound: Number(proof?.phase3DbProof?.timesheetlineRowsFound || 0),
			},
		});
		await this.events.append({
			runId,
			stage: "DM4",
			eventType: "UI_PROOF_READY",
			status: "COMPLETED",
			message: "HR Timesheets review link is ready.",
			metadata: { route: "/hr/timesheets" },
		});

		return {
			status: "COMPLETED",
			phase: "COMPLETED",
			counts: {
				sourceWorkbookCount: resolution.sourceWorkbookFiles.length,
				matchedEmployees: employeeCount,
				attendanceRowsFound: Number(proof?.phase3DbProof?.attendanceRowsFound || 0),
				timesheetlineRowsFound: Number(proof?.phase3DbProof?.timesheetlineRowsFound || 0),
				materializedMissingLines: Number(materialization.materializedMissingLines || 0),
			},
			summaryJson: {
				sourceFiles: resolution.sourceFiles,
				sourceWorkbookFiles: resolution.sourceWorkbookFiles,
				approvedOvertimeWorkbook: approvedOvertimeWorkbook ? approvedOvertimeWorkbook.replace(/\\/g, "/") : undefined,
				stderr: stderr ? stderr.slice(0, 4000) : undefined,
			},
			proofJson: {
				...proof,
				approvedOvertimeRepair,
				timesheetMaterialization: materialization,
				timesheetReviewLink: "/hr/timesheets",
				guardrails: {
					...(proof?.guardrails || {}),
					mutatesRecurringSchedule: false,
				},
			},
		};
	}

	private async runApprovedOvertimeRepair(input: {
		runId: string;
		workbookPath: string;
		periodCode: string;
	}) {
		const scriptPath = path.resolve(process.cwd(), "scripts", "repair-bandai-payroll-source-timesheet-lines.ts");
		if (!fs.existsSync(scriptPath)) {
			await this.events.append({
				runId: input.runId,
				stage: "DM4",
				stepCode: "DM4.3",
				eventType: "BLOCKER_FOUND",
				status: "BLOCKED",
				message: "Approved overtime repair script was not found.",
			});
			return { skipped: true, reason: "script_missing" };
		}

		await this.events.append({
			runId: input.runId,
			stage: "DM4",
			stepCode: "DM4.3",
			eventType: "MATERIALIZATION_STARTED",
			status: "IMPORTING",
			sourceWorkbook: input.workbookPath.replace(/\\/g, "/"),
			message: "Applying approved overtime details to effective timesheet lines.",
			counts: { approvedOvertimeWorkbookCount: 1 },
		});

		const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
			let stdout = "";
			let stderr = "";
			const tsxCliPath = path.resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
			const child = spawn(
				process.execPath,
				[
					tsxCliPath,
					scriptPath,
					"--apply",
					`--periodCode=${input.periodCode}`,
					`--overtime-workbook=${input.workbookPath}`,
				],
				{
					cwd: process.cwd(),
					windowsHide: true,
					stdio: ["ignore", "pipe", "pipe"],
				},
			);
			child.stdout.on("data", (chunk) => {
				stdout += chunk.toString();
			});
			child.stderr.on("data", (chunk) => {
				stderr += chunk.toString();
			});
			child.on("error", reject);
			child.on("close", (code) => {
				if (code === 0) {
					resolve({ stdout, stderr });
					return;
				}
				reject(new Error(stderr.trim() || `Approved overtime repair exited with code ${code}.`));
			});
		});
		const jsonStart = result.stdout.indexOf("{");
		const report = jsonStart >= 0 ? JSON.parse(result.stdout.slice(jsonStart)) : {};
		const verification = await this.runApprovedOvertimeDryRun({
			runId: input.runId,
			workbookPath: input.workbookPath,
			periodCode: input.periodCode,
			scriptPath,
		});
		const remainingLineUpdates = Number(verification.plannedLineUpdates || 0);
		await this.events.append({
			runId: input.runId,
			stage: "DM4",
			stepCode: "DM4.3",
			eventType: "MATERIALIZATION_COMPLETED",
			status: "COMPLETED",
			sourceWorkbook: input.workbookPath.replace(/\\/g, "/"),
			message: "Approved overtime details were applied to effective timesheet lines.",
			counts: {
				total: Number(report.sourceRowsParsed || report.effectiveLinesChecked || report.plannedLineUpdates || 0),
				updated: Number(report.plannedLineUpdates || 0),
				skipped: Number(report.missingSourceRows || 0),
				sourceRowsParsed: Number(report.sourceRowsParsed || 0),
				effectiveLinesChecked: Number(report.effectiveLinesChecked || 0),
				plannedLineUpdates: Number(report.plannedLineUpdates || 0),
				touchedTimesheets: Number(report.touchedTimesheets || 0),
				missingSourceRows: Number(report.missingSourceRows || 0),
			},
			metadata: {
				periodCode: input.periodCode,
				stderr: result.stderr ? result.stderr.slice(0, 2000) : undefined,
			},
		});
		await this.events.append({
			runId: input.runId,
			stage: "DM4",
			stepCode: "DM4.3",
			eventType: remainingLineUpdates > 0 ? "BLOCKER_FOUND" : "VERIFICATION_COMPLETED",
			status: remainingLineUpdates > 0 ? "BLOCKED" : "COMPLETED",
			sourceWorkbook: input.workbookPath.replace(/\\/g, "/"),
			message:
				remainingLineUpdates > 0
					? "Approved overtime verification still found effective timesheet-line updates after apply."
					: "Approved overtime verification found zero remaining effective timesheet-line updates.",
			counts: {
				total: Number(verification.sourceRowsParsed || verification.effectiveLinesChecked || 0),
				plannedLineUpdates: remainingLineUpdates,
				sourceRowsParsed: Number(verification.sourceRowsParsed || 0),
				effectiveLinesChecked: Number(verification.effectiveLinesChecked || 0),
				touchedTimesheets: Number(verification.touchedTimesheets || 0),
				missingSourceRows: Number(verification.missingSourceRows || 0),
			},
			metadata: { periodCode: input.periodCode },
		});
		if (remainingLineUpdates > 0) {
			throw new Error(
				`DM4 approved overtime verification failed: ${remainingLineUpdates} effective timesheet-line update(s) remain after apply.`,
			);
		}
		return { ...report, verification };
	}

	private async runApprovedOvertimeDryRun(input: {
		runId: string;
		workbookPath: string;
		periodCode: string;
		scriptPath: string;
	}) {
		const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
			let stdout = "";
			let stderr = "";
			const tsxCliPath = path.resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
			const child = spawn(
				process.execPath,
				[
					tsxCliPath,
					input.scriptPath,
					`--periodCode=${input.periodCode}`,
					`--overtime-workbook=${input.workbookPath}`,
				],
				{
					cwd: process.cwd(),
					windowsHide: true,
					stdio: ["ignore", "pipe", "pipe"],
				},
			);
			child.stdout.on("data", (chunk) => {
				stdout += chunk.toString();
			});
			child.stderr.on("data", (chunk) => {
				stderr += chunk.toString();
			});
			child.on("error", reject);
			child.on("close", (code) => {
				if (code === 0) {
					resolve({ stdout, stderr });
					return;
				}
				reject(new Error(stderr.trim() || `Approved overtime verification dry-run exited with code ${code}.`));
			});
		});
		const jsonStart = result.stdout.indexOf("{");
		if (jsonStart < 0) return { plannedLineUpdates: 0, touchedTimesheets: 0, missingSourceRows: 0 };
		return JSON.parse(result.stdout.slice(jsonStart));
	}

	private async runProofScriptWithProgress(input: {
		runId: string;
		args: string[];
		progressFile: string;
		sourceWorkbookCount: number;
		matchedEmployees: number;
	}) {
		let stdout = "";
		let stderr = "";
		let progressOffset = 0;
		let progressAppenderRunning = false;
		let lastProgressAt = Date.now();

		const appendProgressEvents = async () => {
			if (progressAppenderRunning || !fs.existsSync(input.progressFile)) return;
			progressAppenderRunning = true;
			try {
				const content = fs.readFileSync(input.progressFile, "utf8");
				const nextContent = content.slice(progressOffset);
				progressOffset = content.length;
				for (const line of nextContent.split(/\r?\n/).filter(Boolean)) {
					let event: any;
					try {
						event = JSON.parse(line);
					} catch {
						continue;
					}
					const eventType = String(event.eventType || "STEP_PROGRESS");
					const isMaterialization = eventType.startsWith("MATERIALIZATION");
					lastProgressAt = Date.now();
					await this.events.append({
						runId: input.runId,
						stage: "DM4",
						stepCode: isMaterialization ? "DM4.2" : "DM4.1",
						eventType: eventType as any,
						status: isMaterialization ? "MATERIALIZING" : "IMPORTING",
						message: String(event.message || "DM4 import progress updated."),
						sourceWorkbook: event.sourceWorkbook || null,
						counts: {
							sourceWorkbookCount: input.sourceWorkbookCount,
							matchedEmployees: input.matchedEmployees,
							...(event.counts || {}),
						},
						metadata: { progressEventAt: event.at || null },
					});
				}
			} finally {
				progressAppenderRunning = false;
			}
		};

		return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
			const child = spawn(process.execPath, input.args, {
				cwd: process.cwd(),
				windowsHide: true,
				stdio: ["ignore", "pipe", "pipe"],
			});
			activeDm4ProofScripts.set(input.runId, child);

			const interval = setInterval(() => {
				void appendProgressEvents().then(async () => {
					if (Date.now() - lastProgressAt < 30000) return;
					lastProgressAt = Date.now();
					await this.events.append({
						runId: input.runId,
						stage: "DM4",
						stepCode: "DM4.1",
						eventType: "STEP_PROGRESS",
						status: "IMPORTING",
						message: "DM4 attendance proof is still running.",
						counts: {
							sourceWorkbookCount: input.sourceWorkbookCount,
							matchedEmployees: input.matchedEmployees,
						},
					});
				});
			}, 2000);

			child.stdout.on("data", (chunk) => {
				stdout += chunk.toString();
			});
			child.stderr.on("data", (chunk) => {
				stderr += chunk.toString();
			});
			child.on("error", (error) => {
				clearInterval(interval);
				activeDm4ProofScripts.delete(input.runId);
				reject(error);
			});
			child.on("close", (code) => {
				clearInterval(interval);
				activeDm4ProofScripts.delete(input.runId);
				void appendProgressEvents().finally(() => {
					try {
						fs.rmSync(input.progressFile, { force: true });
					} catch {
						// Progress file cleanup is best effort.
					}
					if (code === 0) {
						resolve({ stdout, stderr });
						return;
					}
					reject(new Error(stderr.trim() || `DM4 proof script exited with code ${code}.`));
				});
			});
		});
	}
}
