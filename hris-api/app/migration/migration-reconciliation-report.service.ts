import ExcelJS from "exceljs";
import { PrismaClient } from "../../generated/prisma";
import { getMigrationStepRegistry } from "./migration-step-registry";

type SheetRow = Array<string | number | boolean | Date | null | undefined>;

type ReportWorkbook = {
	buffer: Buffer;
	fileName: string;
};

const WORKBOOK_NAMES: Record<string, string> = {
	dm3: "DM3 - Employee Data Workbook",
	dm4: "DM4 - Attendance & Timesheet Workbook",
};

const DM3_DETAIL_SHEETS = [
	{ name: "DM3.1 Employees", stepCode: "DM3.1", target: "Employee / Person / User" },
	{ name: "DM3.2 Schedules", stepCode: "DM3.2", target: "EmployeeScheduleHistory / Employee.embeddedSchedule" },
	{ name: "DM3.3 Reporting Lines", stepCode: "DM3.3", target: "Employee.reportToId" },
	{ name: "DM3.4 Documents", stepCode: "DM3.4", target: "Document" },
	{ name: "DM3.5 Leave Balances", stepCode: "DM3.5", target: "EmployeeLeaveBalance / Employee.leaveBalances" },
	{ name: "DM3.6 Benefits Loans", stepCode: "DM3.6", target: "EmployeeBenefit / EmployeeLoan" },
];

const DETAIL_SHEETS = [
	{ name: "DM1 Details", stepCodePrefix: "DM1", target: "Master data prerequisite" },
	{ name: "DM2 Details", stepCodePrefix: "DM2", target: "Policy prerequisite" },
	...DM3_DETAIL_SHEETS.map((sheet) => ({ ...sheet, stepCodePrefix: sheet.stepCode })),
	{ name: "DM4 Details", stepCodePrefix: "DM4", target: "Attendance / Timesheet proof" },
	{ name: "DM5 Details", stepCodePrefix: "DM5", target: "Payroll history readiness" },
	{ name: "DM6 Details", stepCodePrefix: "DM6", target: "Request / workflow readiness" },
	{ name: "FINAL Reconciliation", stepCodePrefix: "FINAL", target: "Migration sign-off" },
];

const normalizeCode = (value: unknown) => String(value ?? "").trim();
const normalizeLower = (value: unknown) => normalizeCode(value).toLowerCase();

function getDetailSheetsForWorkbook(workbookId: string) {
	const normalizedWorkbookId = normalizeLower(workbookId);
	if (!normalizedWorkbookId) return DETAIL_SHEETS;
	const workbookPrefix = normalizedWorkbookId.toUpperCase();
	return DETAIL_SHEETS.filter((sheet) =>
		normalizeCode(sheet.stepCodePrefix).startsWith(workbookPrefix),
	);
}

function sanitizeFileName(value: string) {
	return (
		String(value || "")
			.trim()
			.replace(/[^a-zA-Z0-9._-]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-+|-+$/g, "") || "migration-reconciliation-report"
	);
}

function toIso(value: unknown) {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(String(value));
	return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function getFullName(person: any) {
	const personalInfo = person?.personalInfo || {};
	return [
		personalInfo.firstName || personalInfo.first_name,
		personalInfo.middleName || personalInfo.middle_name,
		personalInfo.lastName || personalInfo.last_name,
	]
		.map((part) => String(part || "").trim())
		.filter(Boolean)
		.join(" ");
}

function addSheet(workbook: ExcelJS.Workbook, name: string, rows: SheetRow[]) {
	const sheet = workbook.addWorksheet(name.slice(0, 31), {
		properties: { tabColor: { argb: getTabColor(name) } },
		views: [{ state: "frozen", ySplit: 1 }],
	});
	sheet.addRows(rows);
	const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
	sheet.columns = Array.from({ length: columnCount }, (_, columnIndex) => {
		const maxLength = rows.reduce((max, row) => {
			const value = row[columnIndex];
			return Math.max(max, String(value ?? "").length);
		}, 10);
		return { width: Math.min(Math.max(maxLength + 2, 12), 48) };
	});
	sheet.autoFilter = {
		from: { row: 1, column: 1 },
		to: { row: 1, column: Math.max(columnCount, 1) },
	};
	const header = sheet.getRow(1);
	header.height = 22;
	header.eachCell((cell) => {
		cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
		cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: getHeaderColor(name) } };
		cell.alignment = { vertical: "middle", wrapText: true };
		cell.border = thinBorder();
	});
	sheet.eachRow((row, rowNumber) => {
		if (rowNumber === 1) return;
		row.eachCell((cell, columnNumber) => {
			cell.alignment = { vertical: "top", wrapText: true };
			cell.border = thinBorder("FFE5E7EB");
			if (rowNumber % 2 === 0) {
				cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAFA" } };
			}
			const headerValue = String(sheet.getRow(1).getCell(columnNumber).value || "");
			const text = String(cell.value || "");
			const semantic = getSemanticFill(headerValue, text);
			if (semantic) {
				cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: semantic.fill } };
				cell.font = { color: { argb: semantic.font }, bold: semantic.bold };
			}
		});
	});
}

function thinBorder(color = "FFD1D5DB"): Partial<ExcelJS.Borders> {
	return {
		top: { style: "thin", color: { argb: color } },
		left: { style: "thin", color: { argb: color } },
		bottom: { style: "thin", color: { argb: color } },
		right: { style: "thin", color: { argb: color } },
	};
}

function getTabColor(name: string) {
	if (/missing|gap/i.test(name)) return "FFB91C1C";
	if (/employee reconciliation/i.test(name)) return "FF0F766E";
	if (/intake/i.test(name)) return "FF1D4ED8";
	if (/summary/i.test(name)) return "FF374151";
	return "FF64748B";
}

function getHeaderColor(name: string) {
	if (/missing|gap/i.test(name)) return "FF991B1B";
	if (/employee reconciliation/i.test(name)) return "FF115E59";
	if (/intake/i.test(name)) return "FF1E40AF";
	if (/step/i.test(name)) return "FF9A3412";
	return "FF334155";
}

function getSemanticFill(header: string, value: string) {
	const haystack = `${header} ${value}`.toUpperCase();
	if (haystack.includes("BLOCKER") || haystack.includes("FAILED") || haystack.includes("MISSING")) {
		return { fill: "FFFEE2E2", font: "FF7F1D1D", bold: true };
	}
	if (haystack.includes("WARNING") || haystack.includes("SKIPPED") || haystack.includes("REVIEW")) {
		return { fill: "FFFFF7ED", font: "FF9A3412", bold: true };
	}
	if (haystack.includes("MATCHED") || haystack.includes("READY") || haystack.includes("IMPORTED")) {
		return { fill: "FFDCFCE7", font: "FF14532D", bold: true };
	}
	if (haystack.includes("INFO")) {
		return { fill: "FFDBEAFE", font: "FF1E3A8A", bold: true };
	}
	return null;
}

function countByEmployee(rows: any[], employeeIdField = "employeeId") {
	const counts = new Map<string, number>();
	for (const row of rows) {
		const employeeId = normalizeCode(row?.[employeeIdField]);
		if (!employeeId) continue;
		counts.set(employeeId, (counts.get(employeeId) || 0) + 1);
	}
	return counts;
}

function eventEmployeeCode(event: any, employeesByDbId: Map<string, any>) {
	const employeeId = normalizeCode(event?.employeeId);
	if (!employeeId) return "";
	const matched = employeesByDbId.get(employeeId);
	return matched?.employeeId || employeeId;
}

function eventEmployeeName(event: any, employeesByCode: Map<string, any>, employeesByDbId: Map<string, any>) {
	const employeeId = normalizeCode(event?.employeeId);
	const matched = employeesByDbId.get(employeeId) || employeesByCode.get(employeeId);
	return normalizeCode(event?.employeeName) || matched?.employeeName || "";
}

function pickActionForStatus(status: string) {
	const normalized = normalizeLower(status);
	if (normalized.includes("fail")) return "FAILED";
	if (normalized.includes("block")) return "BLOCKED";
	if (normalized.includes("skip")) return "SKIPPED";
	if (normalized.includes("create")) return "CREATED";
	if (normalized.includes("update")) return "UPDATED";
	if (normalized.includes("import") || normalized.includes("complete")) return "MATCHED";
	return "REVIEW";
}

function severityFromAction(action: string) {
	if (["FAILED", "BLOCKED", "MISSING"].includes(action)) return "BLOCKER";
	if (["SKIPPED", "REVIEW"].includes(action)) return "WARNING";
	return "INFO";
}

export class MigrationReconciliationReportService {
	constructor(private readonly prisma: PrismaClient) {}

	async generateRunReport(runId: string): Promise<ReportWorkbook | null> {
		const run = await (this.prisma as any).migrationRun.findUnique({
			where: { id: runId },
			include: {
				steps: { orderBy: { sequence: "asc" } },
				events: { orderBy: { sequence: "asc" } },
			},
		});
		if (!run || run.isDeleted) return this.generateLegacyAuditReport(runId);

		const organizationId = run.organizationId;
		const employees = await this.loadEmployees(organizationId);
		const employeesByDbId = new Map<string, any>(
			employees.map((employee: any) => [String(employee.id), employee]),
		);
		const employeesByCode = new Map<string, any>(
			employees.map((employee: any) => [String(employee.employeeId), employee]),
		);
		const proof: any = await this.loadEmployeeProof(organizationId);
		proof.reportTo = new Map<string, number>(
			employees
				.filter((employee: any) => Boolean(employee.reportToId))
				.map((employee: any) => [String(employee.id), 1]),
		);
		const sourceStats = this.buildSourceStats(run, employeesByCode, employeesByDbId);
		const stepStats = this.buildStepStats(run, sourceStats, employees.length, proof);
		const reconciliation = this.buildEmployeeReconciliation(employees, proof);
		const gaps = this.buildGaps(reconciliation, run, sourceStats, employeesByCode, employeesByDbId);
		const workbook = new ExcelJS.Workbook();
		workbook.creator = "HRIS Migration";
		workbook.created = new Date();

		addSheet(workbook, "Missing And Gaps", this.buildGapRows(gaps));
		addSheet(workbook, "Employee Reconciliation", this.buildEmployeeReconciliationRows(reconciliation));
		addSheet(workbook, "Workbook Intake", this.buildWorkbookIntakeRows(run, sourceStats, employees.length));
		addSheet(workbook, "Step Summary", this.buildStepSummaryRows(stepStats));
		for (const detailSheet of getDetailSheetsForWorkbook(run.workbookId || run.stage)) {
			addSheet(
				workbook,
				detailSheet.name,
				this.buildDetailRows(detailSheet, run, employees, proof, sourceStats, employeesByCode, employeesByDbId),
			);
		}
		addSheet(workbook, "Run Summary", this.buildRunSummaryRows(run, sourceStats, stepStats, reconciliation, gaps));

		const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
		const workbookId = normalizeLower(run.workbookId || run.stage || "dm");
		const started = toIso(run.startedAt || run.createdAt).slice(0, 16).replace(/[:T]/g, "-");
		return {
			buffer,
			fileName: `${sanitizeFileName(workbookId)}-detailed-reconciliation-${started || Date.now()}.xlsx`,
		};
	}

	private async generateLegacyAuditReport(runId: string): Promise<ReportWorkbook | null> {
		const records = await (this.prisma as any).auditLogging.findMany({
			where: { isDeleted: false, type: "MIGRATION_WORKBOOK_IMPORT" },
			orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }],
			take: 1000,
		});
		let report: any = null;
		for (const record of records) {
			const payload = record?.payload || {};
			const entity = record?.entity || {};
			const candidates = [payload?.report, payload, entity?.report, entity].filter(Boolean);
			const candidate = candidates.find((entry) => normalizeCode(entry?.runId) === runId);
			if (candidate) {
				report = candidate;
				break;
			}
		}
		if (!report) return null;
		const workbook = new ExcelJS.Workbook();
		workbook.creator = "HRIS Migration";
		workbook.created = new Date();
		const stepStats = this.buildLegacyStepStats(report);
		const gaps = this.buildLegacyGaps(report);
		addSheet(workbook, "Missing And Gaps", this.buildGapRows(gaps));
		addSheet(workbook, "Workbook Intake", this.buildLegacyWorkbookIntakeRows(report));
		addSheet(workbook, "Step Summary", this.buildStepSummaryRows(stepStats));
		addSheet(workbook, "Detail Rows", this.buildLegacyDetailRows(report));
		addSheet(workbook, "Run Summary", this.buildLegacyRunSummaryRows(report, stepStats, gaps));
		const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
		const workbookId = normalizeLower(report.workbookId || "dm");
		const started = toIso(report.startedAt || new Date()).slice(0, 16).replace(/[:T]/g, "-");
		return {
			buffer,
			fileName: `${sanitizeFileName(workbookId)}-detailed-reconciliation-${started || Date.now()}.xlsx`,
		};
	}

	private async loadEmployees(organizationId: string) {
		const rows = await (this.prisma as any).employee.findMany({
			where: { organizationId, isDeleted: false },
			select: {
				id: true,
				employeeId: true,
				workforceSource: true,
				agency: { select: { code: true, name: true } },
				department: { select: { name: true, code: true } },
				section: { select: { name: true, code: true } },
				position: { select: { title: true, code: true } },
				level: { select: { name: true } },
				person: { select: { personalInfo: true } },
				embeddedSchedule: true,
				reportToId: true,
				userId: true,
				basicSalary: true,
			},
			orderBy: [{ employeeId: "asc" }],
		});
		return rows.map((employee: any) => ({
			...employee,
			employeeName: getFullName(employee.person) || employee.employeeId,
		}));
	}

	private async loadEmployeeProof(organizationId: string) {
		const [
			scheduleRows,
			documentRows,
			leaveRows,
			benefitRows,
			loanRows,
			attendanceRows,
			obligationRows,
			timesheetRows,
			timesheetLineRows,
			payrollRows,
			requestRows,
			workflowRows,
		] = await Promise.all([
			(this.prisma as any).employeeScheduleHistory.findMany({ where: { organizationId }, select: { id: true, employeeId: true } }),
			(this.prisma as any).document.findMany({ where: { employee: { organizationId }, isDeleted: false }, select: { id: true, employeeId: true } }),
			(this.prisma as any).employeeLeaveBalance.findMany({ where: { organizationId }, select: { id: true, employeeId: true } }),
			(this.prisma as any).employeeBenefit.findMany({ where: { organizationId, isDeleted: false }, select: { id: true, employeeId: true } }),
			(this.prisma as any).employeeLoan.findMany({ where: { organizationId, isDeleted: false }, select: { id: true, employeeId: true } }),
			(this.prisma as any).attendance.findMany({ where: { organizationId, isDeleted: false }, select: { id: true, employeeId: true } }),
			(this.prisma as any).attendanceObligation.findMany({ where: { organizationId, isDeleted: false }, select: { id: true, employeeId: true } }),
			(this.prisma as any).timesheet.findMany({ where: { organizationId }, select: { id: true, employeeId: true } }),
			(this.prisma as any).timesheetline.findMany({ where: { organizationId, isDeleted: false }, select: { id: true, employeeId: true } }),
			(this.prisma as any).employeePayroll.findMany({ where: { organizationId }, select: { id: true, employeeId: true } }),
			(this.prisma as any).request.findMany({ where: { organizationId, isDeleted: false }, select: { id: true, requesterId: true, targetEmployeeId: true } }),
			(this.prisma as any).workflowStepExecution.findMany({ where: { organizationId, isDeleted: false }, select: { id: true, assigneeId: true } }),
		]);

		const requestProofRows = requestRows.flatMap((row: any) => [
			row.requesterId ? { employeeId: row.requesterId } : null,
			row.targetEmployeeId ? { employeeId: row.targetEmployeeId } : null,
		]).filter(Boolean);

		return {
			schedule: countByEmployee(scheduleRows),
			document: countByEmployee(documentRows),
			leave: countByEmployee(leaveRows),
			benefit: countByEmployee(benefitRows),
			loan: countByEmployee(loanRows),
			attendance: countByEmployee(attendanceRows),
			obligation: countByEmployee(obligationRows),
			timesheet: countByEmployee(timesheetRows),
			timesheetLine: countByEmployee(timesheetLineRows),
			payroll: countByEmployee(payrollRows),
			request: countByEmployee(requestProofRows),
			workflow: countByEmployee(workflowRows, "assigneeId"),
		};
	}

	private buildSourceStats(run: any, employeesByCode: Map<string, any>, employeesByDbId: Map<string, any>) {
		const events = Array.isArray(run.events) ? run.events : [];
		const byStep = new Map<string, any>();
		for (const step of run.steps || []) {
			const counts = step.counts || {};
			const summary = step.summaryJson || {};
			byStep.set(step.stepCode, {
				stepCode: step.stepCode,
				sheetName: summary.label || step.sourceSheet || step.stepCode,
				sourceWorkbook: step.sourceWorkbook || run.sourceFilename || "",
				sourceFile: step.sourceFile || run.sourceFilename || "",
				found: step.status !== "NOT_WIRED",
				expected: true,
				parsedRows: Number(counts.total || counts.rows || counts.candidateRows || counts.processed || 0),
				validRows: Number(counts.valid || counts.processed || counts.updated || counts.created || counts.existingAfter || 0),
				invalidRows: Number(counts.invalid || counts.failed || 0),
				duplicateRows: Number(counts.duplicates || counts.duplicateRows || 0),
				blankRows: Number(counts.blankRows || 0),
				sourceEmployeeIds: new Set<string>(),
				unknownEmployeeIds: new Set<string>(),
				firstSourceRow: "",
				lastSourceRow: "",
				parseIssue: step.errorJson?.message || step.summaryJson?.blockerReason || "",
				status: step.status,
			});
		}
		for (const event of events) {
			const stepCode = normalizeCode(event.stepCode || "RUN");
			const stat = byStep.get(stepCode) || {
				stepCode,
				sheetName: event.sourceSheet || stepCode,
				sourceWorkbook: event.sourceWorkbook || run.sourceFilename || "",
				sourceFile: event.sourceFile || run.sourceFilename || "",
				found: true,
				expected: true,
				parsedRows: 0,
				validRows: 0,
				invalidRows: 0,
				duplicateRows: 0,
				blankRows: 0,
				sourceEmployeeIds: new Set<string>(),
				unknownEmployeeIds: new Set<string>(),
				firstSourceRow: "",
				lastSourceRow: "",
				parseIssue: "",
				status: event.status,
			};
			const employeeCode = eventEmployeeCode(event, employeesByDbId);
			if (employeeCode) {
				stat.sourceEmployeeIds.add(employeeCode);
				if (!employeesByCode.has(employeeCode)) stat.unknownEmployeeIds.add(employeeCode);
			}
			if (typeof event.sourceRow === "number") {
				if (!stat.firstSourceRow || event.sourceRow < Number(stat.firstSourceRow)) stat.firstSourceRow = event.sourceRow;
				if (!stat.lastSourceRow || event.sourceRow > Number(stat.lastSourceRow)) stat.lastSourceRow = event.sourceRow;
			}
			if (normalizeLower(event.eventType).includes("failed")) stat.invalidRows += 1;
			if (!stat.parseIssue && normalizeLower(event.status).includes("block")) stat.parseIssue = event.message;
			byStep.set(stepCode, stat);
		}
		return Array.from(byStep.values());
	}

	private buildStepStats(run: any, sourceStats: any[], employeeCount: number, proof: any) {
		const registryByCode = new Map(getMigrationStepRegistry().map((step) => [step.stepCode, step]));
		const sourceByCode = new Map(sourceStats.map((stat) => [stat.stepCode, stat]));
		return (run.steps || []).map((step: any) => {
			const registry = registryByCode.get(step.stepCode);
			const source = sourceByCode.get(step.stepCode) || {};
			const counts = step.counts || {};
			const created = Number(counts.created || step.created || 0);
			const updated = Number(counts.updated || step.updated || counts.existingAfter || 0);
			const skipped = Number(counts.skipped || step.skipped || 0);
			const failed = Number(counts.failed || step.failed || 0);
			const blocked = step.status === "BLOCKED" ? Math.max(1, Number(counts.blocked || 0)) : Number(counts.blocked || 0);
			const dbRows = this.getDbTargetRowsForStep(step.stepCode, employeeCount, proof);
			const expected = this.getExpectedRowsForStep(step.stepCode, employeeCount, Number(source.parsedRows || counts.total || 0));
			const missing = Math.max(0, expected - dbRows);
			return {
				stepCode: step.stepCode,
				sheetName: registry?.label || source.sheetName || step.stepCode,
				sourceParsedRows: Number(source.parsedRows || counts.total || counts.rows || 0),
				validSourceRows: Number(source.validRows || counts.processed || updated + created || 0),
				invalidSourceRows: Number(source.invalidRows || failed || 0),
				distinctEmployeeIds: source.sourceEmployeeIds?.size || 0,
				expectedDbRows: expected,
				actualDbRows: dbRows,
				dbMatchedEmployees: Math.min(employeeCount, dbRows),
				created,
				updated,
				matchedExisting: Math.max(0, dbRows - created - updated),
				skipped,
				blocked,
				failed,
				missing,
				severity: failed || blocked || missing ? "WARNING" : "INFO",
				issueSummary: this.getStepIssueSummary(step, missing),
				nextAction: this.getStepNextAction(step.stepCode, missing),
			};
		});
	}

	private getDbTargetRowsForStep(stepCode: string, employeeCount: number, proof: any) {
		if (stepCode === "DM3.1") return employeeCount;
		if (stepCode === "DM3.2") return proof.schedule.size;
		if (stepCode === "DM3.3") return proof.reportTo.size;
		if (stepCode === "DM3.4") return proof.document.size;
		if (stepCode === "DM3.5") return proof.leave.size;
		if (stepCode === "DM3.6") return proof.benefit.size + proof.loan.size;
		if (stepCode.startsWith("DM4")) return proof.attendance.size + proof.obligation.size + proof.timesheetLine.size;
		if (stepCode.startsWith("DM5")) return proof.payroll.size;
		if (stepCode.startsWith("DM6")) return proof.request.size + proof.workflow.size;
		return 0;
	}

	private getExpectedRowsForStep(stepCode: string, employeeCount: number, parsedRows: number) {
		if (["DM3.1", "DM3.2", "DM3.3"].includes(stepCode)) return employeeCount;
		return Math.max(parsedRows, 0);
	}

	private getStepIssueSummary(step: any, missing: number) {
		if (step.errorJson?.message) return step.errorJson.message;
		if (step.blockerReason) return step.blockerReason;
		if (missing > 0) return `${missing.toLocaleString()} employee or source outcomes still need proof.`;
		return "No unresolved gap detected from current HRIS proof.";
	}

	private getStepNextAction(stepCode: string, missing: number) {
		if (missing <= 0) return "No repair needed from current proof.";
		if (stepCode === "DM3.2") return "Review employees missing schedule source, then upload a corrected DM3.2 schedule sheet.";
		if (stepCode === "DM3.3") return "Review reporting-line source rows and only apply employee-ID backed relationships.";
		if (stepCode === "DM3.4") return "Review 201 document source rows or seeded statutory document generation.";
		if (stepCode === "DM3.5") return "Review opening leave balance rows for employees without balance proof.";
		if (stepCode === "DM3.6") return "Review employee benefit and loan source rows for missing employee assignments.";
		return "Review the detail sheet and rerun the affected DM step after source repair.";
	}

	private buildEmployeeReconciliation(employees: any[], proof: any) {
		return employees.map((employee) => {
			const hasEmbeddedSchedule = Boolean(employee.embeddedSchedule && Object.keys(employee.embeddedSchedule || {}).length);
			const scheduleProof = proof.schedule.get(employee.id) || (hasEmbeddedSchedule ? 1 : 0);
			const reportProof = employee.reportToId ? 1 : 0;
			const docs = proof.document.get(employee.id) || 0;
			const leave = proof.leave.get(employee.id) || 0;
			const benefits = (proof.benefit.get(employee.id) || 0) + (proof.loan.get(employee.id) || 0);
			const dm4 = (proof.attendance.get(employee.id) || 0) + (proof.obligation.get(employee.id) || 0) + (proof.timesheet.get(employee.id) || 0) + (proof.timesheetLine.get(employee.id) || 0);
			const payroll = proof.payroll.get(employee.id) || 0;
			const request = (proof.request.get(employee.id) || 0) + (proof.workflow.get(employee.id) || 0);
			const issues: string[] = [];
			if (!scheduleProof) issues.push("MISSING_SCHEDULE_SOURCE");
			if (!reportProof) issues.push("REPORTING_LINE_NOT_PROVEN");
			if (!docs) issues.push("NO_201_DOCUMENT_PROOF");
			if (!leave) issues.push("NO_OPENING_LEAVE_BALANCE_PROOF");
			if (!benefits) issues.push("NO_BENEFIT_OR_LOAN_PROOF");
			const blocker = issues.includes("MISSING_SCHEDULE_SOURCE");
			return {
				employee,
				dm31: "MATCHED",
				dm32Source: scheduleProof ? "SOURCE_OR_DB_PROOF_FOUND" : "MISSING_SCHEDULE_SOURCE",
				dm32Db: scheduleProof ? "MATCHED" : "MISSING",
				dm33Source: reportProof ? "SOURCE_OR_DB_PROOF_FOUND" : "NO_VALID_REPORTING_LINE_PROOF",
				dm33Db: reportProof ? "MATCHED" : "MISSING",
				dm34: docs ? `MATCHED (${docs})` : "MISSING",
				dm35: leave ? `MATCHED (${leave})` : "MISSING",
				dm36: benefits ? `MATCHED (${benefits})` : "MISSING",
				dm4: dm4 ? `READY (${dm4})` : "NO_OPERATIONAL_PROOF",
				dm5: payroll ? `READY (${payroll})` : "NO_PAYROLL_HISTORY_PROOF",
				dm6: request ? `READY (${request})` : "NO_REQUEST_HISTORY_PROOF",
				severity: blocker ? "BLOCKER" : issues.length ? "WARNING" : "INFO",
				gapCount: issues.length,
				mainIssueCode: issues[0] || "",
				mainIssueMessage: issues[0] ? this.explainIssue(issues[0]) : "Employee has current HRIS proof for tracked DM3 checks.",
				nextAction: issues[0] ? this.repairAction(issues[0]) : "No action needed.",
				counts: { scheduleProof, reportProof, docs, leave, benefits, dm4, payroll, request },
			};
		});
	}

	private explainIssue(issueCode: string) {
		const messages: Record<string, string> = {
			MISSING_SCHEDULE_SOURCE: "No schedule assignment proof exists for this employee. Attendance can still have draft shells, but recurring schedule coverage is incomplete.",
			REPORTING_LINE_NOT_PROVEN: "No valid employee-ID backed manager relationship is stored for this employee.",
			NO_201_DOCUMENT_PROOF: "No employee document proof is currently linked to this employee.",
			NO_OPENING_LEAVE_BALANCE_PROOF: "No opening leave balance row is currently linked to this employee.",
			NO_BENEFIT_OR_LOAN_PROOF: "No employee benefit or loan opening is currently linked to this employee.",
		};
		return messages[issueCode] || "This item needs review.";
	}

	private repairAction(issueCode: string) {
		const actions: Record<string, string> = {
			MISSING_SCHEDULE_SOURCE: "Add or correct the employee in DM3.2 Employee Schedule Assignments, then rerun DM3.2/post-actions.",
			REPORTING_LINE_NOT_PROVEN: "Confirm the manager employee ID in DM3.3 Reporting Lines and rerun only source-backed relationships.",
			NO_201_DOCUMENT_PROOF: "Import DM3.4 document rows or verify statutory document generation for this employee.",
			NO_OPENING_LEAVE_BALANCE_PROOF: "Import DM3.5 opening leave balance rows if this employee should start with leave credits.",
			NO_BENEFIT_OR_LOAN_PROOF: "Import DM3.6 benefit or loan rows if this employee has opening payroll-related assignments.",
		};
		return actions[issueCode] || "Review source data and rerun the affected DM step.";
	}

	private buildGaps(reconciliation: any[], run: any, sourceStats: any[], employeesByCode: Map<string, any>, employeesByDbId: Map<string, any>) {
		const gaps = reconciliation
			.filter((row) => row.gapCount > 0)
			.map((row) => ({
				severity: row.severity,
				stepCode: row.mainIssueCode === "MISSING_SCHEDULE_SOURCE" ? "DM3.2" : row.mainIssueCode === "REPORTING_LINE_NOT_PROVEN" ? "DM3.3" : "DM3",
				sourceFile: run.sourceFilename || "",
				sourceSheet: "",
				sourceRow: "",
				businessKey: row.employee.employeeId,
				employeeName: row.employee.employeeName,
				missingTarget: row.mainIssueCode,
				expected: "Source-backed row and matching HRIS DB proof",
				actual: row.mainIssueMessage,
				issueCode: row.mainIssueCode,
				issueMessage: row.mainIssueMessage,
				nextAction: row.nextAction,
				rerunNeeded: "Yes",
			}));
		for (const event of run.events || []) {
			const action = pickActionForStatus(event.status || event.eventType);
			if (!["FAILED", "BLOCKED", "SKIPPED"].includes(action)) continue;
			const employeeCode = eventEmployeeCode(event, employeesByDbId);
			gaps.push({
				severity: severityFromAction(action),
				stepCode: event.stepCode || "",
				sourceFile: event.sourceFile || event.sourceWorkbook || run.sourceFilename || "",
				sourceSheet: event.sourceSheet || "",
				sourceRow: event.sourceRow || "",
				businessKey: employeeCode,
				employeeName: eventEmployeeName(event, employeesByCode, employeesByDbId),
				missingTarget: action,
				expected: "Source row should either import, match, or be explained.",
				actual: event.message,
				issueCode: event.eventType || action,
				issueMessage: event.message,
				nextAction: "Review the source row and rerun the affected migration step after correction.",
				rerunNeeded: "Yes",
			});
		}
		if (!sourceStats.some((stat) => stat.firstSourceRow || stat.lastSourceRow)) {
			gaps.unshift({
				severity: "INFO",
				stepCode: "SOURCE",
				sourceFile: run.sourceFilename || "",
				sourceSheet: "",
				sourceRow: "",
				businessKey: "",
				employeeName: "",
				missingTarget: "SOURCE_ROW_PROVENANCE",
				expected: "Workbook sheet and source row metadata for each row",
				actual: "Historical run events did not preserve complete source row metadata. This report uses DB proof where row metadata is unavailable.",
				issueCode: "SOURCE_ROW_UNKNOWN",
				issueMessage: "Source rows are partially unknown for this saved run.",
				nextAction: "Rerun using the durable migration flow to capture source workbook, sheet, and row evidence.",
				rerunNeeded: "No",
			});
		}
		return gaps;
	}

	private buildRunSummaryRows(run: any, sourceStats: any[], stepStats: any[], reconciliation: any[], gaps: any[]) {
		const totals = stepStats.reduce(
			(acc, step) => {
				acc.parsed += Number(step.sourceParsedRows || 0);
				acc.valid += Number(step.validSourceRows || 0);
				acc.invalid += Number(step.invalidSourceRows || 0);
				acc.created += Number(step.created || 0);
				acc.updated += Number(step.updated || 0);
				acc.skipped += Number(step.skipped || 0);
				acc.blocked += Number(step.blocked || 0);
				acc.failed += Number(step.failed || 0);
				acc.missing += Number(step.missing || 0);
				return acc;
			},
			{ parsed: 0, valid: 0, invalid: 0, created: 0, updated: 0, skipped: 0, blocked: 0, failed: 0, missing: 0 },
		);
		const expectedSheets = stepStats.length;
		const foundSheets = sourceStats.filter((stat) => stat.found).length;
		return [
			["Field", "Value", "Business meaning"],
			["Run ID", run.id, "Unique migration run reviewed by this workbook."],
			["Workbook", WORKBOOK_NAMES[normalizeLower(run.workbookId)] || run.workbookId, "DM stage being reconciled."],
			["Source filename", run.sourceFilename || "", "Uploaded/source workbook label saved on the run."],
			["Source files", Array.isArray(run.sourceFiles) ? run.sourceFiles.map((file: any) => file.path || file.name || "").filter(Boolean).join("; ") : "", "Resolved source paths or file names when available."],
			["Organization ID", run.organizationId, "Tenant/organization reconciled."],
			["Actor user ID", run.startedByUserId || "", "User that started the run."],
			["Status", run.status, "Final migration run state."],
			["Started at", toIso(run.startedAt), ""],
			["Finished at", toIso(run.finishedAt), ""],
			["Expected sheets/steps", expectedSheets, "Steps expected from the DM workflow graph."],
			["Sheets/steps found", foundSheets, "Steps with saved run evidence."],
			["Sheets/steps missing", Math.max(0, expectedSheets - foundSheets), "Expected steps without saved evidence."],
			["Total parsed rows", totals.parsed, "Rows reported by importer step counts."],
			["Total valid rows", totals.valid, "Rows that made it past importer validation or proof counts."],
			["Total invalid rows", totals.invalid, "Rows with validation or import failure evidence."],
			["Distinct employees in HRIS", reconciliation.length, "Current employee records in the organization."],
			["Employees with unresolved gaps", reconciliation.filter((row) => row.gapCount > 0).length, "Employees with at least one missing proof item."],
			["Created", totals.created, "Rows created by migration steps."],
			["Updated", totals.updated, "Rows updated by migration steps."],
			["Skipped", totals.skipped, "Rows intentionally skipped or not applied."],
			["Blocked", totals.blocked, "Steps/rows blocked by missing prerequisites or unavailable proof."],
			["Failed", totals.failed, "Rows or steps that failed."],
			["Unresolved gaps", gaps.filter((gap) => gap.severity !== "INFO").length, "Actionable rows HR/data migration should review."],
		];
	}

	private buildWorkbookIntakeRows(run: any, sourceStats: any[], employeeCount: number) {
		return [
			[
				"Workbook",
				"Source file",
				"Sheet / Step",
				"DM step",
				"Expected",
				"Found",
				"Header row detected",
				"Parsed rows",
				"Blank rows",
				"Nonblank rows",
				"Valid rows",
				"Invalid rows",
				"Duplicate rows",
				"Distinct EMP_ID count",
				"Missing EMP_ID count",
				"Unknown employee count",
				"DB matched employee count",
				"First source row",
				"Last source row",
				"Parse status",
				"Parse issue",
			],
			...sourceStats.map((stat) => [
				WORKBOOK_NAMES[normalizeLower(run.workbookId)] || run.workbookId,
				stat.sourceFile || run.sourceFilename || "",
				stat.sheetName,
				stat.stepCode,
				stat.expected ? "Yes" : "No",
				stat.found ? "Yes" : "No",
				stat.firstSourceRow ? "Yes" : "Unknown",
				stat.parsedRows,
				stat.blankRows,
				Math.max(0, Number(stat.parsedRows || 0) - Number(stat.blankRows || 0)),
				stat.validRows,
				stat.invalidRows,
				stat.duplicateRows,
				stat.sourceEmployeeIds?.size || 0,
				"",
				stat.unknownEmployeeIds?.size || 0,
				Math.min(employeeCount, stat.sourceEmployeeIds?.size || employeeCount),
				stat.firstSourceRow || "",
				stat.lastSourceRow || "",
				stat.status || "",
				stat.parseIssue || (stat.firstSourceRow ? "" : "Source row range unavailable for this saved run."),
			]),
		];
	}

	private buildStepSummaryRows(stepStats: any[]) {
		return [
			[
				"DM step",
				"Sheet / Step",
				"Source parsed rows",
				"Valid source rows",
				"Invalid source rows",
				"Distinct employee IDs",
				"Expected DB target rows",
				"Actual DB proof rows",
				"DB matched employees",
				"Created",
				"Updated",
				"Matched existing",
				"Skipped",
				"Blocked",
				"Failed",
				"Missing",
				"Highest severity",
				"Issue explained",
				"What HR should do next",
			],
			...stepStats.map((step) => [
				step.stepCode,
				step.sheetName,
				step.sourceParsedRows,
				step.validSourceRows,
				step.invalidSourceRows,
				step.distinctEmployeeIds,
				step.expectedDbRows,
				step.actualDbRows,
				step.dbMatchedEmployees,
				step.created,
				step.updated,
				step.matchedExisting,
				step.skipped,
				step.blocked,
				step.failed,
				step.missing,
				step.severity,
				step.issueSummary,
				step.nextAction,
			]),
		];
	}

	private buildLegacyStepStats(report: any) {
		return (report.sheets || []).map((sheet: any) => {
			const parsed = Number(sheet.totalRows || 0);
			const created = Number(sheet.created || 0);
			const updated = Number(sheet.updated || 0);
			const skipped = Number(sheet.skipped || 0);
			const blocked = Number(sheet.blocked || 0);
			const failed = Number(sheet.failed || 0);
			const missing = Math.max(0, parsed - created - updated - skipped - blocked - failed);
			return {
				stepCode: sheet.stepCode || sheet.sheetName || "",
				sheetName: sheet.sheetName || "",
				sourceParsedRows: parsed,
				validSourceRows: Math.max(0, parsed - failed - blocked),
				invalidSourceRows: failed + blocked,
				distinctEmployeeIds: "",
				expectedDbRows: parsed,
				actualDbRows: created + updated,
				dbMatchedEmployees: "",
				created,
				updated,
				matchedExisting: 0,
				skipped,
				blocked,
				failed,
				missing,
				severity: failed || blocked ? "BLOCKER" : skipped || missing ? "WARNING" : "INFO",
				issueSummary: sheet.firstError || sheet.issue || "No unresolved issue reported by this sheet.",
				nextAction:
					failed || blocked || skipped || missing
						? "Review the detail rows and source workbook, then rerun this DM sheet after correction."
						: "No action needed.",
			};
		});
	}

	private buildLegacyWorkbookIntakeRows(report: any) {
		const sheets = report.sheets || [];
		return [
			[
				"Workbook",
				"Source file",
				"Sheet / Step",
				"DM step",
				"Expected",
				"Found",
				"Header row detected",
				"Parsed rows",
				"Blank rows",
				"Nonblank rows",
				"Valid rows",
				"Invalid rows",
				"Duplicate rows",
				"Distinct EMP_ID count",
				"Missing EMP_ID count",
				"Unknown employee count",
				"DB matched employee count",
				"First source row",
				"Last source row",
				"Parse status",
				"Parse issue",
			],
			...sheets.map((sheet: any) => {
				const parsed = Number(sheet.totalRows || 0);
				const failed = Number(sheet.failed || 0) + Number(sheet.blocked || 0);
				return [
					report.workbookName || report.workbookId || "",
					report.sourceFilename || "",
					sheet.sheetName || "",
					sheet.stepCode || sheet.sheetName || "",
					"Yes",
					sheet.status === "Skipped" ? "No" : "Yes",
					"Unknown",
					parsed,
					0,
					parsed,
					Math.max(0, parsed - failed),
					failed,
					0,
					"",
					"",
					"",
					Number(sheet.created || 0) + Number(sheet.updated || 0),
					"",
					"",
					sheet.status || "",
					sheet.firstError || "",
				];
			}),
		];
	}

	private buildLegacyDetailRows(report: any) {
		const rows: SheetRow[] = [
			[
				"DM step",
				"Source workbook",
				"Source sheet",
				"Source row",
				"EMP_ID / business key",
				"Source employee name",
				"DB employee ID",
				"DB employee name",
				"Target model/table",
				"Target record/proof count",
				"Action",
				"Issue code",
				"Issue explained",
				"DB proof field",
				"DB proof value",
				"Timestamp",
				"What HR should do next",
			],
		];
		for (const sheet of report.sheets || []) {
			const action = pickActionForStatus(sheet.status || "");
			rows.push([
				sheet.stepCode || sheet.sheetName || "",
				report.sourceFilename || "",
				sheet.sheetName || "",
				"",
				"",
				"",
				"",
				"",
				sheet.target || sheet.sheetName || "",
				Number(sheet.created || 0) + Number(sheet.updated || 0),
				action,
				sheet.firstError ? "SHEET_REVIEW_NEEDED" : "",
				sheet.firstError || "Sheet completed without row-level issue evidence.",
				"Summary counts",
				`${Number(sheet.created || 0)} created, ${Number(sheet.updated || 0)} updated`,
				toIso(report.finishedAt || report.startedAt),
				sheet.firstError
					? "Review the sheet issue and rerun after source correction."
					: "No action needed from this saved summary.",
			]);
			for (const error of sheet.errors || []) {
				rows.push([
					error.stepCode || sheet.stepCode || sheet.sheetName || "",
					report.sourceFilename || "",
					error.sheetName || sheet.sheetName || "",
					error.row || "",
					"",
					"",
					"",
					"",
					sheet.target || sheet.sheetName || "",
					"",
					pickActionForStatus(error.status || "FAILED"),
					error.field || "ROW_ISSUE",
					error.message || "",
					"",
					"",
					toIso(report.finishedAt || report.startedAt),
					"Correct this source row and rerun the affected sheet.",
				]);
			}
		}
		return rows;
	}

	private buildLegacyGaps(report: any) {
		const gaps: any[] = [];
		for (const sheet of report.sheets || []) {
			const failed = Number(sheet.failed || 0);
			const blocked = Number(sheet.blocked || 0);
			const skipped = Number(sheet.skipped || 0);
			const errors = Array.isArray(sheet.errors) ? sheet.errors : [];
			const hasRealIssue =
				failed > 0 ||
				blocked > 0 ||
				skipped > 0 ||
				errors.length > 0 ||
				["Failed", "Blocked", "Needs recovery"].includes(String(sheet.status || ""));
			if (!hasRealIssue) continue;
			gaps.push({
				severity: failed || blocked ? "BLOCKER" : "WARNING",
				stepCode: sheet.stepCode || sheet.sheetName || "",
				sourceFile: report.sourceFilename || "",
				sourceSheet: sheet.sheetName || "",
				sourceRow: "",
				businessKey: "",
				employeeName: "",
				missingTarget: sheet.target || sheet.sheetName || "",
				expected: "Sheet rows should import, match, skip with reason, or fail with row evidence.",
				actual: sheet.firstError || `${skipped} skipped, ${blocked} blocked, ${failed} failed.`,
				issueCode: errors.length ? "ROW_ISSUE" : "SUMMARY_GAP",
				issueMessage: sheet.firstError || `${sheet.sheetName || "Sheet"} has unresolved summary counts.`,
				nextAction: "Review the source workbook and rerun this DM sheet after correction.",
				rerunNeeded: "Yes",
			});
		}
		for (const event of report.events || []) {
			const action = pickActionForStatus(event.status || event.eventType || "");
			if (!["FAILED", "BLOCKED", "SKIPPED"].includes(action)) continue;
			gaps.push({
				severity: severityFromAction(action),
				stepCode: event.stepCode || "",
				sourceFile: event.sourceFile || event.sourceWorkbook || report.sourceFilename || "",
				sourceSheet: event.sourceSheet || "",
				sourceRow: event.sourceRow || "",
				businessKey: event.employeeId || "",
				employeeName: event.employeeName || "",
				missingTarget: action,
				expected: "Source row should either import, match, or be explained.",
				actual: event.message || "",
				issueCode: event.eventType || action,
				issueMessage: event.message || "",
				nextAction: "Review the source row and rerun the affected migration step after correction.",
				rerunNeeded: "Yes",
			});
		}
		if (!gaps.length) {
			gaps.push({
				severity: "INFO",
				stepCode: "",
				sourceFile: report.sourceFilename || "",
				sourceSheet: "",
				sourceRow: "",
				businessKey: "",
				employeeName: "",
				missingTarget: "No unresolved gaps",
				expected: "No unresolved gaps",
				actual: "No unresolved gaps were saved in this report.",
				issueCode: "",
				issueMessage: "No unresolved gaps were saved in this report.",
				nextAction: "No action needed.",
				rerunNeeded: "No",
			});
		}
		return gaps;
	}

	private buildLegacyRunSummaryRows(report: any, stepStats: any[], gaps: any[]) {
		const totals = stepStats.reduce(
			(acc, step) => {
				acc.parsed += Number(step.sourceParsedRows || 0);
				acc.created += Number(step.created || 0);
				acc.updated += Number(step.updated || 0);
				acc.skipped += Number(step.skipped || 0);
				acc.blocked += Number(step.blocked || 0);
				acc.failed += Number(step.failed || 0);
				return acc;
			},
			{ parsed: 0, created: 0, updated: 0, skipped: 0, blocked: 0, failed: 0 },
		);
		return [
			["Field", "Value", "Business meaning"],
			["Run ID", report.runId || "", "Saved workbook audit run reviewed by this workbook."],
			["Workbook", report.workbookName || report.workbookId || "", "DM stage being reconciled."],
			["Source filename", report.sourceFilename || "", "Uploaded/source workbook label saved on the audit report."],
			["Status", report.status || "", "Saved import status."],
			["Started at", toIso(report.startedAt), ""],
			["Finished at", toIso(report.finishedAt), ""],
			["Sheets/steps", stepStats.length, "Sheets represented in the saved audit report."],
			["Total parsed rows", totals.parsed, "Rows reported by sheet summary counts."],
			["Created", totals.created, "Rows created by migration sheets."],
			["Updated", totals.updated, "Rows updated by migration sheets."],
			["Skipped", totals.skipped, "Rows intentionally skipped or not applied."],
			["Blocked", totals.blocked, "Sheets/rows blocked by prerequisites or unavailable proof."],
			["Failed", totals.failed, "Rows or sheets that failed."],
			["Unresolved gaps", gaps.filter((gap) => gap.severity !== "INFO").length, "Actionable rows HR/data migration should review."],
		];
	}

	private buildEmployeeReconciliationRows(reconciliation: any[]) {
		return [
			[
				"EMP_ID",
				"Employee DB ID",
				"Employee name",
				"Workforce source",
				"Agency",
				"Department",
				"Section",
				"Position",
				"Level",
				"DM3.1 Employee master",
				"DM3.2 Schedule source",
				"DM3.2 DB schedule proof",
				"DM3.3 Reporting source",
				"DM3.3 DB report-to proof",
				"DM3.4 201 documents",
				"DM3.5 Leave balances",
				"DM3.6 Benefits / loans",
				"DM4 Attendance / timesheet readiness",
				"DM5 Payroll readiness",
				"DM6 Request / workflow readiness",
				"Highest severity",
				"Gap count",
				"Main issue code",
				"Issue explained",
				"What HR should do next",
			],
			...reconciliation.map((row) => {
				const employee = row.employee;
				return [
					employee.employeeId,
					employee.id,
					employee.employeeName,
					employee.workforceSource,
					employee.agency ? `${employee.agency.code || ""} ${employee.agency.name || ""}`.trim() : "",
					employee.department?.name || employee.department?.code || "",
					employee.section?.name || employee.section?.code || "",
					employee.position?.title || employee.position?.code || "",
					employee.level?.name || "",
					row.dm31,
					row.dm32Source,
					row.dm32Db,
					row.dm33Source,
					row.dm33Db,
					row.dm34,
					row.dm35,
					row.dm36,
					row.dm4,
					row.dm5,
					row.dm6,
					row.severity,
					row.gapCount,
					row.mainIssueCode,
					row.mainIssueMessage,
					row.nextAction,
				];
			}),
		];
	}

	private buildDetailRows(detailSheet: any, run: any, employees: any[], proof: any, sourceStats: any[], employeesByCode: Map<string, any>, employeesByDbId: Map<string, any>) {
		const header = [
			"DM step",
			"Source workbook",
			"Source sheet",
			"Source row",
			"EMP_ID / business key",
			"Source employee name",
			"DB employee ID",
			"DB employee name",
			"Target model/table",
			"Target record/proof count",
			"Action",
			"Issue code",
			"Issue explained",
			"DB proof field",
			"DB proof value",
			"Timestamp",
			"What HR should do next",
		];
		const rows: SheetRow[] = [header];
		const matchingEvents = (run.events || []).filter((event: any) => {
			const stepCode = normalizeCode(event.stepCode);
			return detailSheet.stepCode ? stepCode === detailSheet.stepCode : stepCode.startsWith(detailSheet.stepCodePrefix);
		});
		for (const event of matchingEvents) {
			const employeeCode = eventEmployeeCode(event, employeesByDbId);
			const employee = employeesByCode.get(employeeCode) || employeesByDbId.get(normalizeCode(event.employeeId));
			const action = pickActionForStatus(event.status || event.eventType);
			rows.push([
				event.stepCode || detailSheet.stepCodePrefix,
				event.sourceWorkbook || run.sourceFilename || "",
				event.sourceSheet || detailSheet.name,
				event.sourceRow || "",
				employeeCode,
				eventEmployeeName(event, employeesByCode, employeesByDbId),
				employee?.id || "",
				employee?.employeeName || "",
				detailSheet.target,
				"",
				action,
				event.eventType || action,
				event.message || "",
				employee ? "Employee.employeeId" : "",
				employee?.employeeId || "",
				toIso(event.timestamp || event.createdAt),
				action === "MATCHED" ? "No action needed." : "Review this row and rerun the affected DM step after correction.",
			]);
		}
		if (detailSheet.stepCode === "DM3.2") {
			for (const employee of employees) {
				const proofCount = (proof.schedule.get(employee.id) || 0) + (employee.embeddedSchedule ? 1 : 0);
				rows.push([
					"DM3.2",
					run.sourceFilename || "",
					"Employee Schedule Assignments",
					"",
					employee.employeeId,
					"",
					employee.id,
					employee.employeeName,
					"EmployeeScheduleHistory / Employee.embeddedSchedule",
					proofCount,
					proofCount ? "MATCHED" : "MISSING",
					proofCount ? "" : "MISSING_SCHEDULE_SOURCE",
					proofCount ? "Schedule proof exists in HRIS." : this.explainIssue("MISSING_SCHEDULE_SOURCE"),
					"Employee.id",
					employee.id,
					toIso(run.finishedAt || run.updatedAt),
					proofCount ? "No action needed." : this.repairAction("MISSING_SCHEDULE_SOURCE"),
				]);
			}
		}
		if (detailSheet.stepCode === "DM3.3") {
			for (const employee of employees) {
				rows.push([
					"DM3.3",
					run.sourceFilename || "",
					"Reporting Lines",
					"",
					employee.employeeId,
					"",
					employee.id,
					employee.employeeName,
					"Employee.reportToId",
					employee.reportToId ? 1 : 0,
					employee.reportToId ? "MATCHED" : "MISSING",
					employee.reportToId ? "" : "REPORTING_LINE_NOT_PROVEN",
					employee.reportToId ? "Report-to proof exists in HRIS." : this.explainIssue("REPORTING_LINE_NOT_PROVEN"),
					"Employee.reportToId",
					employee.reportToId || "",
					toIso(run.finishedAt || run.updatedAt),
					employee.reportToId ? "No action needed." : this.repairAction("REPORTING_LINE_NOT_PROVEN"),
				]);
			}
		}
		if (rows.length === 1) {
			const stat = sourceStats.find((entry) => normalizeCode(entry.stepCode).startsWith(detailSheet.stepCodePrefix));
			rows.push([
				detailSheet.stepCode || detailSheet.stepCodePrefix,
				run.sourceFilename || "",
				stat?.sheetName || detailSheet.name,
				"",
				"",
				"",
				"",
				"",
				detailSheet.target,
				0,
				"REVIEW",
				"NO_ROW_LEVEL_EVIDENCE",
				"No row-level evidence was saved for this detail sheet in the selected run.",
				"",
				"",
				toIso(run.updatedAt),
				"Use the summary and rerun the durable workflow if row-level proof is required.",
			]);
		}
		return rows;
	}

	private buildGapRows(gaps: any[]) {
		return [
			[
				"Severity",
				"DM step",
				"Source file",
				"Source sheet",
				"Source row",
				"EMP_ID / business key",
				"Employee name",
				"Missing target",
				"Expected condition",
				"Actual HRIS condition",
				"Issue code",
				"Issue explained",
				"What HR should do next",
				"Rerun needed",
			],
			...(gaps.length
				? gaps.map((gap) => [
						gap.severity,
						gap.stepCode,
						gap.sourceFile,
						gap.sourceSheet,
						gap.sourceRow,
						gap.businessKey,
						gap.employeeName,
						gap.missingTarget,
						gap.expected,
						gap.actual,
						gap.issueCode,
						gap.issueMessage,
						gap.nextAction,
						gap.rerunNeeded,
					])
				: [["INFO", "", "", "", "", "", "", "No unresolved gaps", "", "", "", "No unresolved gaps detected from current proof.", "No action needed.", "No"]]),
		];
	}
}
