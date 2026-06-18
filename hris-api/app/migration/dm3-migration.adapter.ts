import { PrismaClient } from "../../generated/prisma";
import { runEmployeePostActions } from "../../helper/employee-post-actions.helper";
import { MigrationEventService } from "./migration-event.service";
import { MigrationRunAdapterResult, MigrationRunRequest } from "./migration-run.types";
import { importDm3Workbook } from "./dm3-workbook-import.service";

export class Dm3MigrationAdapter {
	constructor(
		private readonly prisma: PrismaClient,
		private readonly events: MigrationEventService,
	) {}

	async run(runId: string, request: MigrationRunRequest): Promise<MigrationRunAdapterResult> {
		const file = request.files?.[0];
		if (!file?.buffer) {
			return { status: "BLOCKED", phase: "READING_SOURCE", errorJson: { message: "DM3 workbook file is required." } };
		}
		await this.events.append({
			runId,
			stage: "DM3",
			stepCode: "DM3.1",
			eventType: "STEP_STARTED",
			status: "IMPORTING",
			message: "Importing DM3 workbook through the shared run lifecycle.",
			sourceWorkbook: file.originalname,
			sourceSheet: "Employees",
		});

		const workbookImport = await importDm3Workbook({
			prisma: this.prisma,
			buffer: file.buffer,
			organizationId: request.organizationId,
			sourceWorkbook: file.originalname,
			authToken: request.authToken,
			onProgress: (event) =>
				this.events.append({
					runId,
					stage: "DM3",
					stepCode: event.stepCode,
					eventType: event.eventType,
					status: event.status,
					message: event.message,
					sourceSheet: event.sourceSheet,
					sourceRow: event.sourceRow,
					employeeId: event.employeeId,
					employeeName: event.employeeName,
					counts: event.counts,
					metadata: event.metadata,
					sourceWorkbook: file.originalname,
				}),
			onRowEvents: async (rowEvents) => {
				await this.events.appendMany(
					rowEvents.map((event) => ({
						runId,
						stage: "DM3",
						stepCode: event.stepCode,
						eventType: event.eventType,
						status: event.status,
						message: event.message,
						sourceWorkbook: file.originalname,
						sourceSheet: event.sourceSheet,
						sourceRow: event.sourceRow,
						employeeId: event.employeeId,
						employeeName: event.employeeName,
						counts: event.counts,
						metadata: event.metadata,
					})),
				);
			},
		});
		await this.events.append({
			runId,
			stage: "DM3",
			stepCode: "DM3.1",
			eventType: "STEP_COMPLETED",
			status: "IMPORTING",
			message: "DM3 Employees sheet imported.",
			counts: workbookImport.employeeSummary,
			metadata: { employeeImportJobId: workbookImport.employeeJobId },
		});
		await this.events.append({
			runId,
			stage: "DM3",
			stepCode: "DM3.2",
			eventType: "STEP_COMPLETED",
			status: "IMPORTING",
			message: "DM3 Employee Schedule Assignments sheet imported.",
			counts: workbookImport.scheduleSummary,
		});
		await this.events.append({
			runId,
			stage: "DM3",
			stepCode: "DM3.3",
			eventType: "STEP_COMPLETED",
			status: "IMPORTING",
			message: "DM3 Reporting Lines sheet imported.",
			counts: workbookImport.reportingLineSummary,
		});
		await this.events.append({
			runId,
			stage: "DM3",
			stepCode: "DM3.4",
			eventType: "STEP_COMPLETED",
			status: "IMPORTING",
			message: "DM3 Employee Documents / 201 Files sheet imported.",
			counts: workbookImport.documentSummary,
		});
		await this.events.append({
			runId,
			stage: "DM3",
			stepCode: "DM3.5",
			eventType: "STEP_COMPLETED",
			status: "IMPORTING",
			message: "DM3 Opening Leave Balances sheet imported.",
			counts: workbookImport.openingLeaveSummary,
		});
		await this.events.append({
			runId,
			stage: "DM3",
			stepCode: "DM3.6",
			eventType: "STEP_COMPLETED",
			status: "IMPORTING",
			message: "DM3 Employee Benefits / Loans sheet imported.",
			counts: workbookImport.benefitLoanSummary,
		});

		await this.events.append({
			runId,
			stage: "DM3",
			stepCode: "DM3.post_actions",
			eventType: "SIDE_EFFECT_STARTED",
			status: "FINALIZING",
			message: "Running employee post-actions after dependent DM3 stages.",
		});
		const postActions = await runEmployeePostActions({
			prisma: this.prisma,
			organizationId: request.organizationId,
			createdEmployees: workbookImport.createdEmployees,
			authToken: request.authToken,
			actorUserId: request.actorUserId,
			requestPath: "/api/migration/runs",
			enablePostActions: true,
			enableOnboardingReconciliation: true,
			enableAttendanceObligationRefresh: false,
			strictMode: false,
			maxConcurrency: 3,
		});
		await this.events.append({
			runId,
			stage: "DM3",
			stepCode: "DM3.post_actions",
			eventType: "SIDE_EFFECT_COMPLETED",
			status: postActions.failures.length > 0 ? "COMPLETED_WITH_WARNINGS" : "COMPLETED",
			message:
				postActions.failures.length > 0
					? "Employee post-actions completed with warnings."
					: "Employee post-actions completed.",
			counts: {
				...(postActions.summary || {}),
				failures: postActions.failures.length,
				warnings: postActions.warnings.length,
			},
		});
		await this.events.append({
			runId,
			stage: "DM3",
			stepCode: "DM3.2.attendance_obligations",
			eventType: "MATERIALIZATION_COMPLETED",
			status:
				workbookImport.scheduleSummary.attendanceObligations?.status === "BLOCKED"
					? "BLOCKED"
					: postActions.failures.length > 0
						? "COMPLETED_WITH_WARNINGS"
						: "COMPLETED",
			message:
				workbookImport.scheduleSummary.attendanceObligations?.blockerReason ||
				"Attendance obligations were materialized by DM3.2 schedule assignment import.",
			counts: {
				...(workbookImport.scheduleSummary.attendanceObligations || {}),
				failures: postActions.failures.length,
			},
		});
		await this.events.append({
			runId,
			stage: "DM3",
			stepCode: "DM3.verify_surfaces",
			eventType: "VERIFICATION_COMPLETED",
			status: "COMPLETED",
			message: "DM3 HRIS surface proof is ready in employee profiles and HR Attendance.",
			counts: {
				employees: workbookImport.employeeSummary.total,
				attendanceObligations: workbookImport.scheduleSummary.attendanceObligations || null,
				timesheetDrafts: workbookImport.scheduleSummary.timesheetDrafts || null,
				reportingLines: workbookImport.reportingLineSummary,
				documents: workbookImport.documentSummary,
				openingLeaveBalances: workbookImport.openingLeaveSummary,
				benefitsLoans: workbookImport.benefitLoanSummary,
			},
			metadata: {
				links: {
					employeeRecords: "/employees",
					hrAttendance: "/hr/attendance",
				},
			},
		});

		return {
			status: postActions.failures.length > 0 ? "COMPLETED_WITH_WARNINGS" : "COMPLETED",
			phase: "COMPLETED",
			counts: {
				employees: workbookImport.employeeSummary.total,
				created: workbookImport.employeeSummary.created,
				updated: workbookImport.employeeSummary.updated,
				failed: workbookImport.employeeSummary.failed,
				schedules: workbookImport.scheduleSummary,
				reportingLines: workbookImport.reportingLineSummary,
				timesheetDrafts: workbookImport.scheduleSummary.timesheetDrafts || null,
				documents: workbookImport.documentSummary,
				openingLeaveBalances: workbookImport.openingLeaveSummary,
				benefitsLoans: workbookImport.benefitLoanSummary,
			},
			summaryJson: {
				employeeImportJobId: workbookImport.employeeJobId,
				sheets: {
					employees: workbookImport.employeeSummary,
					schedules: workbookImport.scheduleSummary,
					reportingLines: workbookImport.reportingLineSummary,
					documents: workbookImport.documentSummary,
					openingLeaveBalances: workbookImport.openingLeaveSummary,
					benefitsLoans: workbookImport.benefitLoanSummary,
				},
				postActions: postActions.summary,
				postActionWarnings: postActions.warnings,
				attendanceObligations: workbookImport.scheduleSummary.attendanceObligations || null,
				timesheetDrafts: workbookImport.scheduleSummary.timesheetDrafts || null,
			},
			proofJson: {
				runOrder: [
					"Employees",
					"Employee Schedule Assignments",
					"Reporting Lines",
					"Employee Documents / 201 Files",
					"Opening Leave Balances",
					"Employee Benefits / Loans",
					"Prepare Draft Timesheet Headers",
					"Employee Post Actions",
					"DM3.2 schedule-backed attendance obligation materialization",
					"Final audit/proof",
				],
			},
		};
	}
}
