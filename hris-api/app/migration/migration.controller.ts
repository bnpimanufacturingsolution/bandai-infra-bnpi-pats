import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../generated/prisma";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { transformFormDataToObject } from "../../helper/transformObject";
import {
	EmployeeImportHelper,
	EmployeeImportRow,
} from "../../helper/employee-import.helper";
import {
	appendEmployeeScheduleHistory,
	copyTemplateToEmployeeEmbeddedSchedule,
	copyShiftTypeToTemplatePatternDay,
	isSameEmployeeScheduleAssignment,
} from "../../helper/employee-schedule.helper";
import { backfillOpenPayrollPeriodAttendanceObligations } from "../../helper/attendance-obligation.helper";
import { ensureDm3ScheduleBackedAttendanceObligations } from "../../helper/dm3-attendance-obligation-repair.helper";
import {
	buildNonOverlappingWorkBreakSlots,
	calculateShiftHour,
} from "../../helper/schedule-normalization.helper";

import { config } from "../../config/constant";
import { config as appConfig } from "../../config/config";
import { getLogger } from "../../helper/logger.helper";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import {
	BulkMigrationSchema,
	MigrationConfigSchema,
	TestCredentialsEmailSchema,
} from "../../zod/migration.zod";
import {
	isEmployeeEmailConfigured,
	sendEmployeeCredentialsEmail,
} from "../../helper/employee-credentials-email.helper";
import { runEmployeePostActions } from "../../helper/employee-post-actions.helper";
import { migrationService } from "./migration.service";
import { EmployeeImportService } from "../employee/employee-import.service";
import { MigrationOrchestratorService } from "./migration-orchestrator.service";
import { MigrationReconciliationReportService } from "./migration-reconciliation-report.service";
import {
	importDm3ReportingLines as importDm3ReportingLinesService,
	importOpeningLeaveBalances,
} from "./dm3-workbook-import.service";
import {
	buildMassUploadReportCsv,
	getMassUploadImportLog,
	importCompensationMassUpload,
	importDeductionMassUpload,
	listMassUploadImportLogs,
} from "./bnpi-mass-upload-import.service";
import {
	getManpowerDatabankJobProgress,
	startManpowerDatabankImport,
} from "./bnpi-manpower-databank-import.service";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";

const logger = getLogger();
const migrationLogger = logger.child({ module: "migration" });
const TEST_EMAIL_ALLOWED_ROLES = new Set([
	"hris-hr-manager",
	"hris-hr-user",
	"hris-admin",
	"admin",
	"superadmin",
	"super_admin",
]);
const WORKBOOK_TEMPLATE_FILES = new Set([
	"DM1-master-data-migration.xlsx",
	"DM2-policy-data-migration.xlsx",
	"DM3-employee-data-migration.xlsx",
	"DM4-attendance-timesheet-migration.xlsx",
]);
const WORKBOOK_TEMPLATE_SOURCE_FILES: Record<string, string[]> = {
	"DM1-master-data-migration.xlsx": [
		"departments-import.csv",
		"sections-import.csv",
		"positions-import.csv",
		"levels-import.csv",
		"shift-types-import.csv",
		"agencies-import.csv",
	],
	"DM2-policy-data-migration.xlsx": [
		"holidays-import.csv",
		"leave-types-import.csv",
		"benefit-types-import.csv",
		"loan-types-import.csv",
		"document-201-types-import.csv",
	],
	"DM3-employee-data-migration.xlsx": [
		"employees-import.csv",
		"employee-schedules-import.csv",
		"reporting-lines-import.csv",
		"employee-documents-201-import.csv",
		"opening-leave-balances-import.csv",
		"employee-benefits-loans-import.csv",
	],
	"DM4-attendance-timesheet-migration.xlsx": [
		"attendance-history-import.csv",
		"timesheets-import.csv",
	],
};
const SOURCE_INPUT_MANIFEST_FILE = "dm-source-input-manifest.json";

type SourceInputSheetMapping = {
	step?: string;
	sheet?: string;
	rowCount?: number;
};

type SourceInputManifestItem = {
	id: string;
	dmPhase: string;
	displayName: string;
	sourceRef: string;
	description?: string;
	sheetMappings?: SourceInputSheetMapping[];
	rowCount?: number;
	checksum?: string;
	downloadable?: boolean;
	confidential?: boolean;
};

function getRepoRoot() {
	return path.resolve(process.cwd(), "..");
}

function getSourceInputManifestPath() {
	return resolveRepoPath("docs", SOURCE_INPUT_MANIFEST_FILE);
}

function readSourceInputManifestItems(): SourceInputManifestItem[] {
	const manifestPath = getSourceInputManifestPath();
	if (!fs.existsSync(manifestPath)) return [];
	const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
	return Array.isArray(parsed?.items) ? parsed.items : [];
}

function resolveConfiguredSourcePath(sourceRef: string) {
	const trimmed = String(sourceRef || "").trim();
	if (!trimmed || trimmed === "Not configured" || trimmed === "Manual QA") return null;
	if (trimmed.includes("*")) return null;
	const sourcePath = resolveRepoPath(...trimmed.split(/[\\/]/).filter(Boolean));
	const repoRoot = getRepoRoot();
	const relative = path.relative(repoRoot, sourcePath);
	if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
	return sourcePath;
}

function resolveConfiguredSourceChildren(sourceRef: string) {
	const trimmed = String(sourceRef || "").trim();
	if (!trimmed || trimmed === "Not configured" || trimmed === "Manual QA") return [];
	const repoRoot = getRepoRoot();

	if (trimmed.includes("*")) {
		const normalized = trimmed.replace(/\\/g, "/");
		const folderRef = path.posix.dirname(normalized);
		const pattern = path.posix.basename(normalized).toLowerCase();
		if (!["*.xlsx", "*.xls"].includes(pattern)) return [];
		const folderPath = resolveRepoPath(...folderRef.split("/").filter(Boolean));
		const relative = path.relative(repoRoot, folderPath);
		if (relative.startsWith("..") || path.isAbsolute(relative)) return [];
		if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) return [];
		const extension = pattern.slice(1);
		return fs
			.readdirSync(folderPath)
			.filter((entry) => entry.toLowerCase().endsWith(extension) && !entry.startsWith("~$"))
			.map((entry) => path.join(folderPath, entry))
			.sort((left, right) => left.localeCompare(right));
	}

	const sourcePath = resolveConfiguredSourcePath(trimmed);
	if (!sourcePath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
		return [];
	}
	return collectWorkbookFiles(sourcePath);
}

function getSourceInputStatus(item: SourceInputManifestItem, sourcePath: string | null) {
	if (!item.sourceRef || item.sourceRef === "Not configured" || item.sourceRef === "Manual QA") {
		return "not_configured";
	}
	if (!sourcePath) return "not_downloadable";
	if (!fs.existsSync(sourcePath)) return "missing";
	if (fs.statSync(sourcePath).isDirectory()) return "not_downloadable";
	return "available";
}

function toSourceInputPayload(item: SourceInputManifestItem) {
	const sourcePath = resolveConfiguredSourcePath(item.sourceRef);
	const status = getSourceInputStatus(item, sourcePath);
	const children = resolveConfiguredSourceChildren(item.sourceRef);
	const canDownload =
		Boolean(item.downloadable) &&
		Boolean(sourcePath) &&
		status === "available" &&
		!fs.statSync(sourcePath as string).isDirectory();
	const fileName =
		sourcePath && fs.existsSync(sourcePath) && !fs.statSync(sourcePath).isDirectory()
			? path.basename(sourcePath)
			: undefined;

	return {
		id: item.id,
		dmPhase: item.dmPhase,
		displayName: item.displayName,
		sourceRef: item.sourceRef,
		description: item.description,
		sheetMappings: item.sheetMappings || [],
		rowCount: item.rowCount,
		checksum: item.checksum,
		confidential: Boolean(item.confidential),
		status,
		available: status === "available",
		downloadable: canDownload,
		childCount: children.length,
		fileName,
		downloadUrl: canDownload
			? `/api/migration/source-inputs/${encodeURIComponent(item.id)}/download`
			: null,
	};
}

function toResolvedSourceInputPayload(
	parent: SourceInputManifestItem,
	filePath: string,
	index: number,
) {
	const sourceRef = toRepoDisplayPath(filePath);
	const id = `${parent.id}--${index + 1}`;
	return {
		id,
		parentId: parent.id,
		dmPhase: parent.dmPhase,
		displayName: path.basename(filePath),
		sourceRef,
		description: `Resolved source workbook from ${parent.displayName}.`,
		sheetMappings: parent.sheetMappings || [],
		rowCount: undefined,
		checksum: undefined,
		confidential: Boolean(parent.confidential),
		status: "available",
		available: true,
		downloadable: true,
		fileName: path.basename(filePath),
		downloadUrl: `/api/migration/source-inputs/${encodeURIComponent(id)}/download`,
	};
}

function getExpandedSourceInputPayloads() {
	const items = readSourceInputManifestItems();
	const payloads: any[] = [];
	for (const item of items) {
		payloads.push(toSourceInputPayload(item));
		resolveConfiguredSourceChildren(item.sourceRef).forEach((filePath, index) => {
			payloads.push(toResolvedSourceInputPayload(item, filePath, index));
		});
	}
	return payloads;
}

function resolveSourceInputDownloadPath(sourceId: string) {
	const items = readSourceInputManifestItems();
	const directItem = items.find((entry) => entry.id === sourceId);
	if (directItem) {
		if (!directItem.downloadable) return { blocked: true };
		const sourcePath = resolveConfiguredSourcePath(directItem.sourceRef);
		return { sourcePath };
	}

	const childMatch = sourceId.match(/^(.*)--(\d+)$/);
	if (!childMatch) return {};
	const parent = items.find((entry) => entry.id === childMatch[1]);
	const childIndex = Number(childMatch[2]) - 1;
	if (
		!parent ||
		!Number.isInteger(childIndex) ||
		childIndex < 0
	) {
		return {};
	}
	const sourcePath = resolveConfiguredSourceChildren(parent.sourceRef)[childIndex];
	return { sourcePath };
}

function parseMultipartJsonBody(req: Request) {
	const rawData = req.body?.data;
	if (rawData === undefined || rawData === null || rawData === "") {
		return { body: req.body || {} };
	}
	if (typeof rawData === "object") {
		return { body: rawData };
	}
	if (typeof rawData !== "string") {
		return {
			error:
				"Invalid multipart field 'data'. Send organizationId as a separate form field or send valid JSON in data.",
		};
	}
	try {
		const parsed = JSON.parse(rawData);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {
				error:
					"Invalid multipart field 'data'. Expected a JSON object such as {\"organizationId\":\"...\"}.",
			};
		}
		return { body: { ...(req.body || {}), ...parsed } };
	} catch {
		return {
			error:
				"Invalid JSON in multipart field 'data'. Send organizationId as a separate form field or send valid JSON such as {\"organizationId\":\"...\"}.",
		};
	}
}
const WORKBOOK_AUDIT_TYPE = "MIGRATION_WORKBOOK_IMPORT";
const WORKBOOK_AUDIT_RESOURCE = "migration-workbook-import";
const FALLBACK_AUDIT_ENTITY_ID = "000000000000000000000000";
const execFileAsync = promisify(execFile);

type Dm3PostActionsJobStatus = "queued" | "running" | "completed" | "failed";

type Dm3RecoveryEmployee = {
	id: string;
	employeeId: string;
	personId: string | null;
	role: string;
	userId: string | null;
	metadata: any;
	person?: {
		contactInfo?: any;
		metadata?: any;
	} | null;
};

type Dm3PostActionsJob = {
	id: string;
	status: Dm3PostActionsJobStatus;
	mode: "finalize" | "recover";
	startedAt: string;
	finishedAt?: string;
	message: string;
	organizationId: string;
	sourceFilename?: string | null;
	total: number;
	processed: number;
	summary?: any;
	warnings?: any[];
	events: Array<{
		row?: number;
		employeeId: string;
		fullName?: string;
		stage: string;
		message: string;
	}>;
	error?: string;
};

const dm3PostActionsJobs = new Map<string, Dm3PostActionsJob>();

async function appendMigrationRunEvent(params: {
	prisma: PrismaClient;
	runId: string;
	stage: string;
	stepCode?: string | null;
	phase?: string | null;
	eventType: string;
	status: string;
	message: string;
	counts?: Record<string, any> | null;
	metadata?: Record<string, any> | null;
}) {
	const aggregate = await (params.prisma as any).migrationRunEvent.aggregate({
		where: { runId: params.runId },
		_max: { sequence: true },
	});
	await (params.prisma as any).migrationRunEvent.create({
		data: {
			runId: params.runId,
			sequence: Number(aggregate._max.sequence || 0) + 1,
			stage: params.stage,
			stepCode: params.stepCode || null,
			phase: params.phase || null,
			eventType: params.eventType,
			status: params.status,
			message: params.message,
			counts: params.counts || undefined,
			metadata: params.metadata || undefined,
		},
	});
}

async function persistDm3PostActionsRunProof(params: {
	prisma: PrismaClient;
	runId?: string;
	organizationId: string;
	jobId: string;
	summary: any;
	warningsCount: number;
	failed: number;
	recovery?: {
		sourceFilename?: string;
		sourceMatched: number;
		fallbackToAllDm3Employees: boolean;
	};
	errorMessage?: string;
}) {
	const runId = String(params.runId || "").trim();
	if (!runId) return;
	const run = await (params.prisma as any).migrationRun.findFirst({
		where: {
			id: runId,
			organizationId: params.organizationId,
			workbookId: "dm3",
			isDeleted: false,
		},
		select: { id: true, status: true },
	});
	if (!run) return;

	const now = new Date();
	const total = Number(params.summary?.total || 0);
	const completed = Number(params.summary?.postActions?.completed || params.summary?.created || 0);
	const hasIssues = params.failed > 0 || params.warningsCount > 0;
	const stepStatus = params.errorMessage ? "FAILED" : hasIssues ? "WARNING" : "COMPLETED";
	const counts = {
		total,
		processed: completed,
		created: completed,
		updated: 0,
		skipped: Number(params.summary?.skipped || 0),
		failed: Number(params.failed || 0),
		warnings: Number(params.warningsCount || 0),
		jobId: params.jobId,
		source: params.recovery ? "dm3_post_action_recovery" : "dm3_post_action_finalizer",
		postActions: params.summary?.postActions || {},
		...(params.recovery ? { recovery: params.recovery } : {}),
	};

	await (params.prisma as any).migrationRunStep.updateMany({
		where: { runId, stepCode: "DM3.post_actions" },
		data: {
			status: stepStatus,
			counts,
			errorJson: params.errorMessage
				? { message: params.errorMessage }
				: hasIssues
					? {
							message:
								"Employee post-actions completed with warnings. Review account/email provisioning warnings before go-live.",
						}
					: null,
			startedAt: now,
			finishedAt: now,
		},
	});

	if (!params.errorMessage) {
		await (params.prisma as any).migrationRunStep.updateMany({
			where: { runId, stepCode: "DM3.verify_surfaces" },
			data: {
				status: hasIssues ? "WARNING" : "COMPLETED",
				counts: {
					total: 4,
					processed: 4,
					created: 0,
					updated: 4,
					failed: 0,
					warnings: Number(params.warningsCount || 0),
					source: "dm3_generated_work_proof",
					proof: {
						employeesFinalized: completed,
						postActionsJobId: params.jobId,
						message:
							"DM3 source sheets, generated attendance obligations, draft timesheets, and post-actions have durable DB proof.",
					},
				},
				errorJson: hasIssues
					? {
							message:
								"HRIS surface proof completed with warnings from employee post-actions.",
						}
					: null,
				startedAt: now,
				finishedAt: now,
			},
		});
	}

	await appendMigrationRunEvent({
		prisma: params.prisma,
		runId,
		stage: "DM3",
		stepCode: "DM3.post_actions",
		phase: "side_effect",
		eventType: params.errorMessage ? "STEP_FAILED" : "SIDE_EFFECT_COMPLETED",
		status: stepStatus,
		message:
			params.errorMessage ||
			`DM3 employee post-actions completed for ${completed.toLocaleString()} employee records.`,
		counts,
	});

	if (!params.errorMessage) {
		await appendMigrationRunEvent({
			prisma: params.prisma,
			runId,
			stage: "DM3",
			stepCode: "DM3.verify_surfaces",
			phase: "verification",
			eventType: "VERIFICATION_COMPLETED",
			status: hasIssues ? "COMPLETED_WITH_WARNINGS" : "COMPLETED",
			message:
				"DM3 generated-work surface proof completed from persisted run and DB evidence.",
			counts: { total: 4, processed: 4, warnings: Number(params.warningsCount || 0) },
		});
		await (params.prisma as any).migrationRun.update({
			where: { id: runId },
			data: {
				status: hasIssues ? "COMPLETED_WITH_WARNINGS" : "COMPLETED",
				phase: "COMPLETED",
				jobId: params.jobId,
				finishedAt: now,
				summaryJson: {
					dm3PostActions: counts,
					generatedWork: {
						attendanceObligations: "DB_PROOF",
						draftTimesheetHeaders: "DB_PROOF",
						employeePostActions: stepStatus,
						verifyHrisSurfaces: hasIssues ? "WARNING" : "COMPLETED",
					},
				},
				errorJson: hasIssues
					? {
							message:
								"DM3 completed with employee post-action warnings. Review account/email provisioning warnings before go-live.",
						}
					: null,
			},
		});
		await appendMigrationRunEvent({
			prisma: params.prisma,
			runId,
			stage: "DM3",
			eventType: "RUN_COMPLETED",
			status: hasIssues ? "COMPLETED_WITH_WARNINGS" : "COMPLETED",
			message: hasIssues
				? "DM3 run completed with employee post-action warnings."
				: "DM3 run completed.",
			counts: { warnings: Number(params.warningsCount || 0), failed: Number(params.failed || 0) },
		});
	}
}

function getElapsedSeconds(startedAt: string) {
	const started = new Date(startedAt).getTime();
	if (!Number.isFinite(started)) return 0;
	return Math.max(0, Math.floor((Date.now() - started) / 1000));
}

function createDm3PostActionsJobId() {
	return `dm3-post-actions-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function pruneDm3PostActionsJobs() {
	const maxAgeMs = 1000 * 60 * 60 * 6;
	const now = Date.now();
	for (const [jobId, job] of dm3PostActionsJobs) {
		const startedAt = new Date(job.startedAt).getTime();
		if (Number.isFinite(startedAt) && now - startedAt > maxAgeMs) {
			dm3PostActionsJobs.delete(jobId);
		}
	}
}

function updateDm3PostActionsJob(jobId: string, patch: Partial<Dm3PostActionsJob>) {
	const current = dm3PostActionsJobs.get(jobId);
	if (!current) return;
	dm3PostActionsJobs.set(jobId, { ...current, ...patch });
}

function toNumber(value: unknown, fallback = 0) {
	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toOptionalString(value: unknown) {
	const text = String(value || "").trim();
	return text || undefined;
}

function sanitizeReportError(error: any, sheetName: string) {
	return {
		sheetName: toOptionalString(error?.sheetName) || sheetName,
		row: typeof error?.row === "number" ? error.row : null,
		field: toOptionalString(error?.field) || null,
		status: toOptionalString(error?.status) || "failed",
		message: String(error?.message || "Import row failed"),
	};
}

function sanitizeReportSheet(sheet: any) {
	const sheetName = toOptionalString(sheet?.sheetName) || "Unknown sheet";
	const errors = Array.isArray(sheet?.errors)
		? sheet.errors.slice(0, 500).map((error: any) => sanitizeReportError(error, sheetName))
		: [];

	return {
		sheetName,
		target: toOptionalString(sheet?.target) || sheetName,
		status: toOptionalString(sheet?.status) || "Pending",
		jobId: toOptionalString(sheet?.jobId),
		totalRows: toNumber(sheet?.totalRows),
		created: toNumber(sheet?.created),
		updated: toNumber(sheet?.updated),
		skipped: toNumber(sheet?.skipped),
		blocked: toNumber(sheet?.blocked),
		failed: toNumber(sheet?.failed),
		elapsedMs: toNumber(sheet?.elapsedMs),
		firstError: toOptionalString(sheet?.firstError),
		errors,
	};
}

function sanitizeReportEvent(event: any) {
	return {
		id: toOptionalString(event?.id) || `${Date.now()}`,
		at: toOptionalString(event?.at) || new Date().toISOString(),
		sheetName: toOptionalString(event?.sheetName),
		status: toOptionalString(event?.status) || "running",
		message: String(event?.message || "").slice(0, 500),
		rowCount: toNumber(event?.rowCount),
		eventType: toOptionalString(event?.eventType),
		stepCode: toOptionalString(event?.stepCode) || null,
		sourceRow: typeof event?.sourceRow === "number" ? event.sourceRow : null,
		employeeId: toOptionalString(event?.employeeId) || null,
		employeeName: toOptionalString(event?.employeeName) || null,
		metadata:
			event?.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
				? event.metadata
				: undefined,
	};
}

function sanitizeWorkbookReport(body: any) {
	const rawReport = body.report || {};
	const runId = toOptionalString(rawReport.runId || body.runId) || "";
	const workbookId = toOptionalString(rawReport.workbookId || body.workbookId) || "";
	const workbookName = toOptionalString(rawReport.workbookName || body.workbookName) || workbookId;
	const rawSheets = Array.isArray(rawReport.sheets)
		? rawReport.sheets
		: Array.isArray(body.sheets)
			? body.sheets
			: null;
	const sheets = rawSheets
		? rawSheets.map(sanitizeReportSheet)
		: body.sheet
			? [sanitizeReportSheet(body.sheet)]
			: [];
	const rawEvents = Array.isArray(rawReport.events)
		? rawReport.events
		: Array.isArray(body.events)
			? body.events
			: [];
	const events = rawEvents.slice(0, 50).map(sanitizeReportEvent);

	return {
		runId,
		workbookId,
		workbookName,
		sourceFilename:
			toOptionalString(rawReport.sourceFilename || body.sourceFilename) || "",
		actorUserId: toOptionalString(rawReport.actorUserId || body.actorUserId),
		organizationId: toOptionalString(rawReport.organizationId || body.organizationId),
		startedAt:
			toOptionalString(rawReport.startedAt || body.startedAt) || new Date().toISOString(),
		finishedAt: toOptionalString(rawReport.finishedAt || body.finishedAt),
		elapsedMs:
			rawReport.elapsedMs !== undefined || body.elapsedMs !== undefined
				? toNumber(rawReport.elapsedMs ?? body.elapsedMs)
				: undefined,
		status: toOptionalString(rawReport.status || body.status) || "running",
		sheets,
		events,
	};
}

function getAuditPayload(record: any) {
	const payload = record?.payload || {};
	return typeof payload === "object" && payload !== null ? payload : {};
}

function getRecordTimeMs(record: any) {
	const candidates = [record?.timestamp, record?.createdAt, record?.updatedAt];
	for (const candidate of candidates) {
		const time = new Date(candidate || "").getTime();
		if (Number.isFinite(time)) return time;
	}
	return 0;
}

function mergeWorkbookReports(base: any, incoming: any) {
	const baseReport = sanitizeWorkbookReport(base || {});
	const incomingReport = sanitizeWorkbookReport(incoming || {});
	const bySheet = new Map<string, any>();

	for (const sheet of baseReport.sheets || []) {
		bySheet.set(String(sheet.sheetName || "").trim().toLowerCase(), sheet);
	}
	for (const sheet of incomingReport.sheets || []) {
		const key = String(sheet.sheetName || "").trim().toLowerCase();
		const current = bySheet.get(key);
		const currentSignal =
			toNumber(current?.totalRows) +
			toNumber(current?.created) +
			toNumber(current?.updated) +
			toNumber(current?.skipped) +
			toNumber(current?.blocked) +
			toNumber(current?.failed) +
			toNumber(current?.errors?.length);
		const incomingSignal =
			toNumber(sheet?.totalRows) +
			toNumber(sheet?.created) +
			toNumber(sheet?.updated) +
			toNumber(sheet?.skipped) +
			toNumber(sheet?.blocked) +
			toNumber(sheet?.failed) +
			toNumber(sheet?.errors?.length);
		if (!current || incomingSignal >= currentSignal) {
			bySheet.set(key, sheet);
		}
	}

	const preferIncomingHeader =
		incomingReport.status !== "running" ||
		baseReport.status === "running" ||
		!baseReport.finishedAt;

	return {
		...(preferIncomingHeader ? baseReport : incomingReport),
		...(preferIncomingHeader ? incomingReport : baseReport),
		sheets: Array.from(bySheet.values()),
		events: [...(incomingReport.events || []), ...(baseReport.events || [])].slice(0, 50),
	};
}

function isWorkbookAuditSheetTerminal(status?: string) {
	return ["Imported", "Skipped", "Failed", "Blocked", "Needs recovery"].includes(String(status || ""));
}

function markWorkbookReportUnavailable(report: any, message: string) {
	const normalizedReport = sanitizeWorkbookReport(report || {});
	const sheets = [...(normalizedReport.sheets || [])];
	const activeIndex = sheets.findIndex((sheet) => !isWorkbookAuditSheetTerminal(sheet.status));
	const fallbackIndex = sheets.findIndex((sheet) => sheet.jobId);
	const targetIndex = activeIndex >= 0 ? activeIndex : fallbackIndex;
	const blockedSheet =
		targetIndex >= 0
			? {
					...sheets[targetIndex],
					status: "Blocked",
					blocked: Math.max(1, toNumber(sheets[targetIndex]?.blocked)),
					firstError: message,
					errors: [
						...(Array.isArray(sheets[targetIndex]?.errors)
							? sheets[targetIndex].errors
							: []),
						{
							sheetName: sheets[targetIndex]?.sheetName || "Workbook",
							row: null,
							field: "jobId",
							status: "blocked",
							message,
						},
					],
				}
			: {
					sheetName: "Workbook",
					target: "Migration workbook",
					status: "Blocked",
					totalRows: 0,
					created: 0,
					updated: 0,
					skipped: 0,
					blocked: 1,
					failed: 0,
					elapsedMs: 0,
					firstError: message,
					errors: [
						{
							sheetName: "Workbook",
							row: null,
							field: "jobId",
							status: "blocked",
							message,
						},
					],
				};

	if (targetIndex >= 0) sheets[targetIndex] = blockedSheet;
	else sheets.push(blockedSheet);

	return {
		...normalizedReport,
		status: "blocked",
		finishedAt: normalizedReport.finishedAt || new Date().toISOString(),
		sheets,
		events: [
			{
				id: `stale-${Date.now()}`,
				at: new Date().toISOString(),
				status: "blocked",
				message,
			},
			...(normalizedReport.events || []),
		].slice(0, 50),
	};
}

function normalizeWorkbookReportAvailability(report: any) {
	const normalizedReport = sanitizeWorkbookReport(report || {});
	if (normalizedReport.status !== "running") return normalizedReport;

	const activeSheets = (normalizedReport.sheets || []).filter(
		(sheet: any) => !isWorkbookAuditSheetTerminal(sheet.status),
	);
	const pollableSheet = activeSheets.find((sheet: any) => sheet.jobId);
	if (pollableSheet?.jobId) {
		const jobId = String(pollableSheet.jobId);
		const isDm3PostActionsJob =
			normalizedReport.workbookId === "dm3" &&
			String(pollableSheet.sheetName || "").trim().toLowerCase() ===
				"employee post actions";
		const jobProgress = isDm3PostActionsJob
			? dm3PostActionsJobs.get(jobId)
			: EmployeeImportService.getJobProgress(jobId);
		if (jobProgress) return normalizedReport;
		return markWorkbookReportUnavailable(
			normalizedReport,
			isDm3PostActionsJob
				? "DM3 employee post-actions job status is no longer available after a server restart or cleanup. Review the last durable report, then use Recover to rebuild post-actions from persisted DM3 employee records."
				: "Import job status is no longer available after a server restart or cleanup. Review the last durable report and rerun the workbook from the blocked sheet.",
		);
	}

	if (activeSheets.length === 0) {
		return markWorkbookReportUnavailable(
			normalizedReport,
			"Workbook report is still marked running, but no active pollable job remains. Review the last durable report and rerun the workbook from the next pending sheet.",
		);
	}

	return markWorkbookReportUnavailable(
		normalizedReport,
		"Workbook report is running without a durable job id. Review the last durable report and rerun the workbook from the blocked sheet.",
	);
}

function getNestedRecordValue(source: any, pathParts: string[]) {
	let current = source;
	for (const part of pathParts) {
		if (!current || typeof current !== "object") return undefined;
		current = current[part];
	}
	return current;
}

function isDm3EmployeeMasterRecord(employee: Dm3RecoveryEmployee) {
	const employeeSource = getNestedRecordValue(employee.metadata, [
		"sourceOfTruth",
		"step",
	]);
	const personSource = getNestedRecordValue(employee.person?.metadata, [
		"sourceOfTruth",
		"step",
	]);
	return employeeSource === "DM3.1 Employees" || personSource === "DM3.1 Employees";
}

function matchesDm3RecoverySource(employee: Dm3RecoveryEmployee, sourceFilename?: string) {
	if (!sourceFilename) return true;
	const normalizedSource = sourceFilename.trim().toLowerCase();
	if (!normalizedSource) return true;
	const candidates = [
		getNestedRecordValue(employee.metadata, ["sourceOfTruth", "importWorkbook"]),
		getNestedRecordValue(employee.metadata, [
			"sourceOfTruth",
			"employeeMaster",
			"sourceWorkbook",
		]),
		getNestedRecordValue(employee.person?.metadata, ["sourceOfTruth", "sourceWorkbook"]),
	]
		.map((value) => String(value || "").trim().toLowerCase())
		.filter(Boolean);
	return candidates.includes(normalizedSource);
}

function buildDm3PostActionInputs(employees: Dm3RecoveryEmployee[]) {
	return employees
		.filter((employee) => employee.id && employee.personId)
		.map((employee) => {
			const contactInfo =
				employee.person?.contactInfo && typeof employee.person.contactInfo === "object"
					? (employee.person.contactInfo as Record<string, any>)
					: {};
			return {
				employeeDbId: employee.id,
				employeeId: employee.employeeId,
				personId: employee.personId as string,
				role: employee.role,
				email: String(contactInfo.email || "").trim() || null,
				sourceWorkbook:
					String(
						getNestedRecordValue(employee.metadata, ["sourceOfTruth", "importWorkbook"]) ||
							getNestedRecordValue(employee.person?.metadata, [
								"sourceOfTruth",
								"sourceWorkbook",
							]) ||
							"DM3.1 Employees",
					) || null,
				sourceSheet: "Employees",
			};
		});
}

function resolveRepoPath(...segments: string[]) {
	const candidates = [
		path.resolve(process.cwd(), "..", ...segments),
		path.resolve(process.cwd(), ...segments),
	];
	return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function collectWorkbookFiles(sourcePath: string): string[] {
	if (!fs.existsSync(sourcePath)) return [];
	const stat = fs.statSync(sourcePath);
	if (!stat.isDirectory()) {
		const fileName = path.basename(sourcePath);
		return /\.(xlsx|xls)$/i.test(sourcePath) && !fileName.startsWith("~$")
			? [sourcePath]
			: [];
	}

	return fs
		.readdirSync(sourcePath)
		.flatMap((entry) => collectWorkbookFiles(path.join(sourcePath, entry)))
		.sort((left, right) => left.localeCompare(right));
}

function toRepoDisplayPath(filePath: string) {
	const repoRoot = path.resolve(process.cwd(), "..");
	const relative = path.relative(repoRoot, filePath);
	return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
		? relative.replace(/\\/g, "/")
		: filePath.replace(/\\/g, "/");
}

function resolveDm4SourceFiles(rawSourceFiles: unknown[]) {
	const resolvedInputs = rawSourceFiles
		.map((item) => String(item || "").trim())
		.filter(Boolean)
		.map((filePath: string) => (path.isAbsolute(filePath) ? filePath : resolveRepoPath(filePath)));
	const defaultApprovedOvertimeWorkbook = resolveRepoPath(
		"docs",
		"Bandai Payroll",
		"2026 rptOvertimeDetails.xlsx",
	);
	const hasApprovedOvertimeWorkbook = resolvedInputs.some((filePath) =>
		/2026\s+rptOvertimeDetails\.xlsx$/i.test(filePath.replace(/\\/g, "/")),
	);
	if (
		resolvedInputs.length > 0 &&
		fs.existsSync(defaultApprovedOvertimeWorkbook) &&
		!hasApprovedOvertimeWorkbook
	) {
		resolvedInputs.push(defaultApprovedOvertimeWorkbook);
	}

	const missing = resolvedInputs.filter((filePath) => !fs.existsSync(filePath));
	const invalid = resolvedInputs.filter((filePath) => {
		if (!fs.existsSync(filePath)) return false;
		if (fs.statSync(filePath).isDirectory()) return false;
		return !/\.(xlsx|xls)$/i.test(filePath);
	});
	const workbookFiles = Array.from(
		new Set(resolvedInputs.flatMap((filePath) => collectWorkbookFiles(filePath))),
	).sort((left, right) => left.localeCompare(right));
	const emptyDirectories = resolvedInputs.filter(
		(filePath) =>
			fs.existsSync(filePath) &&
			fs.statSync(filePath).isDirectory() &&
			collectWorkbookFiles(filePath).length === 0,
	);

	return {
		resolvedInputs,
		missing,
		invalid,
		emptyDirectories,
		workbookFiles,
	};
}

function isWorkbookTemplateStale(filePath: string, fileName: string) {
	const sourceFiles = WORKBOOK_TEMPLATE_SOURCE_FILES[fileName] || [];
	if (sourceFiles.length === 0) return false;

	const workbookTime = fs.statSync(filePath).mtimeMs;
	const sourcePaths = sourceFiles
		.map((sourceFile) => resolveRepoPath("data", "import", sourceFile))
		.filter((sourcePath) => fs.existsSync(sourcePath));

	return sourcePaths.some((sourcePath) => fs.statSync(sourcePath).mtimeMs > workbookTime);
}

type ExtractFieldKey =
	| "employeeId"
	| "name"
	| "department"
	| "position"
	| "level"
	| "schedule"
	| "reportTo";

type NormalizedFieldKey =
	| "EMP_ID"
	| "NAME"
	| "DEPARTMENT"
	| "POSITION"
	| "LEVEL"
	| "SCHEDULE"
	| "REPORT_TO_EMP_ID";

interface ExtractedValueEntry {
	value: string;
	count: number;
}

interface SheetColumnSummary {
	header: string;
	nonEmptyCount: number;
	sampleValues: string[];
}

interface MigrationSplitRule {
	targetField: NormalizedFieldKey;
	sourceColumn: string;
	delimiter: string;
	segmentIndex: number;
}

interface SheetExtractionSummary {
	sheetName: string;
	rowCount: number;
	headers: string[];
	rows: Record<string, any>[];
	columns: SheetColumnSummary[];
	sampleRows: Record<string, any>[];
	previewRows: Record<string, any>[];
	normalizedRows: Record<string, any>[];
	detectedColumns: Partial<Record<ExtractFieldKey, string>>;
	extractedValues: {
		departments: ExtractedValueEntry[];
		positions: ExtractedValueEntry[];
		levels: ExtractedValueEntry[];
		schedules: ExtractedValueEntry[];
		reportTo: ExtractedValueEntry[];
	};
	stats: {
		blankCounts: Partial<Record<ExtractFieldKey, number>>;
		duplicateCounts: Partial<Record<ExtractFieldKey, number>>;
	};
}

const EXTRACTION_COLUMN_ALIASES: Record<ExtractFieldKey, string[]> = {
	employeeId: ["emp_id", "employee_id", "employee code", "employee no", "employee number", "id"],
	name: ["name", "employee_name", "employee name", "full_name", "full name"],
	department: ["department", "department_name", "department code", "dept", "dept_name"],
	position: ["position", "position_name", "position title", "job title", "title"],
	level: ["level", "level_name", "rank", "grade"],
	schedule: ["schedule", "schedule_name", "schedule code", "shift"],
	reportTo: ["report_to_emp_id", "report to", "reports to", "manager", "supervisor"],
};

const NORMALIZED_FIELD_KEYS: NormalizedFieldKey[] = [
	"EMP_ID",
	"NAME",
	"DEPARTMENT",
	"POSITION",
	"LEVEL",
	"SCHEDULE",
	"REPORT_TO_EMP_ID",
];

const DETECTED_TO_NORMALIZED_FIELD: Record<ExtractFieldKey, NormalizedFieldKey> = {
	employeeId: "EMP_ID",
	name: "NAME",
	department: "DEPARTMENT",
	position: "POSITION",
	level: "LEVEL",
	schedule: "SCHEDULE",
	reportTo: "REPORT_TO_EMP_ID",
};

function normalizeHeaderKey(value: string): string {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[_\-]+/g, " ")
		.replace(/\s+/g, " ");
}

function detectColumns(headers: string[]): Partial<Record<ExtractFieldKey, string>> {
	const normalizedHeaders = headers.map((header) => ({
		original: header,
		normalized: normalizeHeaderKey(header),
	}));

	const detected: Partial<Record<ExtractFieldKey, string>> = {};

	(Object.keys(EXTRACTION_COLUMN_ALIASES) as ExtractFieldKey[]).forEach((fieldKey) => {
		const aliases = EXTRACTION_COLUMN_ALIASES[fieldKey];
		const exactMatch = normalizedHeaders.find(({ normalized }) => aliases.includes(normalized));
		if (exactMatch) {
			detected[fieldKey] = exactMatch.original;
			return;
		}

		const fuzzyMatch = normalizedHeaders.find(({ normalized }) =>
			aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized)),
		);
		if (fuzzyMatch) {
			detected[fieldKey] = fuzzyMatch.original;
		}
	});

	return detected;
}

function collectValueStats(
	rows: Record<string, any>[],
	columnName?: string,
): { values: ExtractedValueEntry[]; blankCount: number; duplicateCount: number } {
	if (!columnName) {
		return { values: [], blankCount: 0, duplicateCount: 0 };
	}

	const counts = new Map<string, number>();
	let blankCount = 0;

	rows.forEach((row) => {
		const rawValue = row?.[columnName];
		const trimmedValue = String(rawValue ?? "").trim();
		if (!trimmedValue) {
			blankCount++;
			return;
		}
		counts.set(trimmedValue, (counts.get(trimmedValue) || 0) + 1);
	});

	const values = Array.from(counts.entries())
		.map(([value, count]) => ({ value, count }))
		.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

	const duplicateCount = values.reduce((total, entry) => total + Math.max(0, entry.count - 1), 0);

	return { values, blankCount, duplicateCount };
}

function buildColumnSummaries(
	headers: string[],
	rows: Record<string, any>[],
): SheetColumnSummary[] {
	return headers.map((header) => {
		const nonEmptyValues = rows
			.map((row) => String(row?.[header] ?? "").trim())
			.filter(Boolean);

		return {
			header,
			nonEmptyCount: nonEmptyValues.length,
			sampleValues: Array.from(new Set(nonEmptyValues)).slice(0, 3),
		};
	});
}

function buildNormalizedRowsFromRules(
	rows: Record<string, any>[],
	fieldMapping: Partial<Record<NormalizedFieldKey, string>>,
	splitRules: MigrationSplitRule[] = [],
): Record<string, string>[] {
	const splitRuleMap = new Map<NormalizedFieldKey, MigrationSplitRule>(
		splitRules.map((rule) => [rule.targetField, rule]),
	);

	return rows.map((row) => {
		const normalizedRow: Record<string, string> = {};

		NORMALIZED_FIELD_KEYS.forEach((fieldKey) => {
			const splitRule = splitRuleMap.get(fieldKey);
			if (splitRule) {
				const rawValue = String(row?.[splitRule.sourceColumn] ?? "");
				const segments = rawValue.split(splitRule.delimiter).map((value) => value.trim());
				normalizedRow[fieldKey] = segments[splitRule.segmentIndex] || "";
				return;
			}

			const sourceColumn = fieldMapping[fieldKey];
			normalizedRow[fieldKey] = sourceColumn ? String(row?.[sourceColumn] ?? "").trim() : "";
		});

		return normalizedRow;
	});
}

function buildAutoFieldMapping(
	detectedColumns: Partial<Record<ExtractFieldKey, string>>,
): Partial<Record<NormalizedFieldKey, string>> {
	const mapping: Partial<Record<NormalizedFieldKey, string>> = {};

	(Object.entries(detectedColumns) as Array<[ExtractFieldKey, string]>).forEach(
		([detectedKey, sourceColumn]) => {
			mapping[DETECTED_TO_NORMALIZED_FIELD[detectedKey]] = sourceColumn;
		},
	);

	return mapping;
}

function sanitizeFieldMapping(input: any): Partial<Record<NormalizedFieldKey, string>> {
	if (!input || typeof input !== "object") return {};

	return NORMALIZED_FIELD_KEYS.reduce<Partial<Record<NormalizedFieldKey, string>>>(
		(mapping, fieldKey) => {
			const value = input[fieldKey];
			if (typeof value === "string" && value.trim()) {
				mapping[fieldKey] = value.trim();
			}
			return mapping;
		},
		{},
	);
}

function sanitizeSplitRules(input: any): MigrationSplitRule[] {
	if (!Array.isArray(input)) return [];

	return input
		.map((rule) => ({
			targetField: rule?.targetField,
			sourceColumn: typeof rule?.sourceColumn === "string" ? rule.sourceColumn.trim() : "",
			delimiter: typeof rule?.delimiter === "string" ? rule.delimiter : "",
			segmentIndex: Number(rule?.segmentIndex),
		}))
		.filter(
			(rule): rule is MigrationSplitRule =>
				NORMALIZED_FIELD_KEYS.includes(rule.targetField) &&
				!!rule.sourceColumn &&
				!!rule.delimiter &&
				Number.isInteger(rule.segmentIndex) &&
				rule.segmentIndex >= 0,
		);
}

function parseJsonField<T>(value: any, fallback: T): T {
	if (typeof value !== "string" || !value.trim()) return fallback;

	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

function buildSheetExtractionSummary(
	sheetName: string,
	rows: Record<string, any>[],
): SheetExtractionSummary {
	const headerSet = rows.reduce<Set<string>>((set, row) => {
		Object.keys(row || {}).forEach((key) => set.add(String(key)));
		return set;
	}, new Set<string>());
	const headers = Array.from(headerSet);
	const columns = buildColumnSummaries(headers, rows);
	const detected = detectColumns(headers);
	const departmentStats = collectValueStats(rows, detected.department);
	const positionStats = collectValueStats(rows, detected.position);
	const levelStats = collectValueStats(rows, detected.level);
	const scheduleStats = collectValueStats(rows, detected.schedule);
	const reportToStats = collectValueStats(rows, detected.reportTo);
	const normalizedRows = buildNormalizedRowsFromRules(rows, buildAutoFieldMapping(detected));

	return {
		sheetName,
		rowCount: rows.length,
		headers,
		rows,
		columns,
		sampleRows: rows.slice(0, 5),
		previewRows: rows.slice(0, 20),
		normalizedRows,
		detectedColumns: detected,
		extractedValues: {
			departments: departmentStats.values,
			positions: positionStats.values,
			levels: levelStats.values,
			schedules: scheduleStats.values,
			reportTo: reportToStats.values,
		},
		stats: {
			blankCounts: {
				department: departmentStats.blankCount,
				position: positionStats.blankCount,
				level: levelStats.blankCount,
				schedule: scheduleStats.blankCount,
				reportTo: reportToStats.blankCount,
			},
			duplicateCounts: {
				department: departmentStats.duplicateCount,
				position: positionStats.duplicateCount,
				level: levelStats.duplicateCount,
				schedule: scheduleStats.duplicateCount,
				reportTo: reportToStats.duplicateCount,
			},
		},
	};
}

function parseWorkbookSheets(
	buffer: Buffer,
): Array<{ sheetName: string; rows: Record<string, any>[] }> {
	const workbook = XLSX.read(buffer, {
		type: "buffer",
		raw: false,
		cellDates: false,
	});

	return workbook.SheetNames.map((sheetName) => {
		const worksheet = workbook.Sheets[sheetName];
		const rows = XLSX.utils.sheet_to_json(worksheet, {
			defval: "",
			blankrows: false,
			raw: false,
		}) as Record<string, any>[];

		const cleanedRows = rows.map((row) => {
			const cleanedRow: Record<string, any> = {};
			Object.keys(row || {}).forEach((key) => {
				const value = row[key];
				cleanedRow[key] = typeof value === "string" ? value.trim() : value;
			});
			return cleanedRow;
		});

		return { sheetName, rows: cleanedRows };
	});
}

function parseWorkbookSheetByName(
	buffer: Buffer,
	targetSheetName: string,
): { sheetName: string; rows: Record<string, any>[] } {
	const parsedSheets = parseWorkbookSheets(buffer);
	const selectedSheet = parsedSheets.find((sheet) => sheet.sheetName === targetSheetName);

	if (!selectedSheet) {
		throw new Error(`Sheet "${targetSheetName}" was not found in the uploaded file.`);
	}

	return selectedSheet;
}

function mergeExtractedBuckets(files: Array<{ sheets: SheetExtractionSummary[] }>): {
	departments: ExtractedValueEntry[];
	positions: ExtractedValueEntry[];
	levels: ExtractedValueEntry[];
	schedules: ExtractedValueEntry[];
} {
	const bucketMaps = {
		departments: new Map<string, number>(),
		positions: new Map<string, number>(),
		levels: new Map<string, number>(),
		schedules: new Map<string, number>(),
	};

	files.forEach((file) => {
		file.sheets.forEach((sheet) => {
			(["departments", "positions", "levels", "schedules"] as const).forEach((bucketKey) => {
				sheet.extractedValues[bucketKey].forEach((entry) => {
					bucketMaps[bucketKey].set(
						entry.value,
						(bucketMaps[bucketKey].get(entry.value) || 0) + entry.count,
					);
				});
			});
		});
	});

	return {
		departments: Array.from(bucketMaps.departments.entries())
			.map(([value, count]) => ({ value, count }))
			.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
		positions: Array.from(bucketMaps.positions.entries())
			.map(([value, count]) => ({ value, count }))
			.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
		levels: Array.from(bucketMaps.levels.entries())
			.map(([value, count]) => ({ value, count }))
			.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
		schedules: Array.from(bucketMaps.schedules.entries())
			.map(([value, count]) => ({ value, count }))
			.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
	};
}

// â”€â”€â”€ Shared file-parsing helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Parse an uploaded file buffer (CSV or XLSX) into an array of EmployeeImportRow.
 * Uses the same logic as the employee-import module:
 *  - Parses with XLSX (works for both .csv and .xlsx)
 *  - Trims all strings; converts whitespace-only to undefined
 *  - Casts EMP_ID to string to prevent numeric truncation
 */
function parseFileBufferToImportRows(buffer: Buffer): EmployeeImportRow[] {
	const workbook = XLSX.read(buffer, {
		type: "buffer",
		raw: false,
		cellDates: false,
	});

	const sheetName = workbook.SheetNames[0];
	const worksheet = workbook.Sheets[sheetName];

	const rawData = XLSX.utils.sheet_to_json(worksheet, {
		defval: "",
		blankrows: true,
		raw: false,
	}) as any[];

	if (!rawData || rawData.length === 0) {
		throw new Error("File is empty or invalid");
	}

	return rawData.map((row: any) => {
		const cleaned: any = {};
		Object.keys(row).forEach((key) => {
			const value = row[key];
			if (typeof value === "string") {
				const trimmed = value.trim();
				cleaned[key] = trimmed === "" ? undefined : trimmed;
			} else {
				cleaned[key] = value;
			}
		});
		// Ensure EMP_ID is always a string (prevents numeric truncation)
		if (cleaned.EMP_ID !== undefined) {
			cleaned.EMP_ID = String(cleaned.EMP_ID);
		}
		return cleaned as EmployeeImportRow;
	});
}

function parseDateOnlyInput(value: unknown): Date | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
	}
	const text = String(value || "").trim();
	if (!text) return null;
	const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (match) {
		const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
	if (slashMatch) {
		const year = Number(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]);
		const month = Number(slashMatch[1]);
		const day = Number(slashMatch[2]);
		return new Date(Date.UTC(year, month - 1, day));
	}
	const parsed = new Date(text);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveEmployeeScheduleEffectiveStart(employee: any, sourceEffectiveFrom: Date | null): Date | null {
	const employeeStart =
		parseDateOnlyInput(employee?.employmentStartDate) ||
		parseDateOnlyInput(employee?.employmentHireDate);
	return employeeStart || sourceEffectiveFrom;
}

function parseMoneyInput(value: unknown, fallback = 0) {
	const cleaned = String(value ?? "")
		.replace(/,/g, "")
		.trim();
	const parsed = Number(cleaned);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePositiveIntInput(value: unknown, fallback = 1) {
	const parsed = Number.parseInt(String(value ?? "").trim(), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function addMonths(date: Date, months: number) {
	const next = new Date(date);
	next.setUTCMonth(next.getUTCMonth() + months);
	return next;
}

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

const payrollPeriodDateKey = (startDate: Date, endDate: Date) =>
	`${dateOnly(startDate)}:${dateOnly(endDate)}`;

function normalizeDocumentReviewStatus(value: unknown) {
	const normalized = String(value || "APPROVED")
		.trim()
		.toUpperCase()
		.replace(/[\s-]+/g, "_");
	if (["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(normalized)) {
		return normalized;
	}
	if (normalized === "FOR_REVIEW" || normalized === "SUBMITTED") return "PENDING";
	return "APPROVED";
}

function normalizeBenefitProgramStatus(value: unknown) {
	const normalized = String(value || "ACTIVE")
		.trim()
		.toUpperCase()
		.replace(/[\s-]+/g, "_");
	if (["PENDING", "APPROVED", "ACTIVE", "COMPLETED", "CANCELLED", "DEFAULTED"].includes(normalized)) {
		return normalized;
	}
	return "ACTIVE";
}

function normalizeLoanStatus(value: unknown) {
	const normalized = String(value || "ACTIVE")
		.trim()
		.toUpperCase()
		.replace(/[\s-]+/g, "_");
	if (["PENDING", "APPROVED", "ACTIVE", "PAID", "DEFAULTED", "CANCELLED"].includes(normalized)) {
		return normalized;
	}
	return "ACTIVE";
}

function parseDm3WorksharingScheduleCode(scheduleCode: string) {
	const normalized = String(scheduleCode || "")
		.trim()
		.toUpperCase();
	if (!/^(?:BNPI_WS_MON_SAT|BNPI_SCHED_MON_SAT)_WS_\d{4}_\d{4}/.test(normalized)) return null;
	const workWindows = Array.from(normalized.matchAll(/(?:^|_)WS_(\d{2})(\d{2})_(\d{2})(\d{2})/g)).map((match) => ({
		startTime: `${match[1]}:${match[2]}`,
		endTime: `${match[3]}:${match[4]}`,
		raw: match,
	}));
	const breakWindows = Array.from(normalized.matchAll(/(?:^|_)BR_(\d{2})(\d{2})_(\d{2})(\d{2})/g)).map((match) => ({
		startTime: `${match[1]}:${match[2]}`,
		endTime: `${match[3]}:${match[4]}`,
		raw: match,
	}));
	const allParts = [...workWindows, ...breakWindows].flatMap((window) => [
		Number(window.raw[1]),
		Number(window.raw[2]),
		Number(window.raw[3]),
		Number(window.raw[4]),
	]);
	if (!workWindows.length || allParts.some((value, index) => value > (index % 2 === 0 ? 23 : 59))) return null;
	const startTime = workWindows[0].startTime;
	const endTime = workWindows[workWindows.length - 1].endTime;
	const breakStartTime = breakWindows[0]?.startTime || null;
	const breakEndTime = breakWindows[0]?.endTime || null;
	const breakCode = breakWindows.map((window) => `_BR_${window.startTime.replace(":", "")}_${window.endTime.replace(":", "")}`).join("");
	return {
		shiftCode: `${workWindows.map((window) => `WS_${window.startTime.replace(":", "")}_${window.endTime.replace(":", "")}`).join("_")}${breakCode}`,
		shiftLabel: `${workWindows.map((window) => `${window.startTime} to ${window.endTime}`).join(" / ")}${breakWindows.length ? `, breaks ${breakWindows.map((window) => `${window.startTime} to ${window.endTime}`).join(" / ")}` : ""}`,
		startTime,
		endTime,
		breakStartTime,
		breakEndTime,
		workWindows,
		breakWindows,
	};
}

const buildDm3WorksharingOffDaySnapshot = () => ({
	name: "Off day",
	code: "OFF",
	isOvernight: false,
	isOff: true,
	shiftHour: 0,
	timeSlots: [],
});

async function ensureDm3EmployeeScheduleTemplates(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		scheduleCodes: string[];
	},
) {
	const createdCodes: string[] = [];
	const updatedCodes: string[] = [];
	const parsedCodes = params.scheduleCodes
		.map((scheduleCode) => ({
			scheduleCode,
			parsed: parseDm3WorksharingScheduleCode(scheduleCode),
		}))
		.filter((entry): entry is { scheduleCode: string; parsed: NonNullable<ReturnType<typeof parseDm3WorksharingScheduleCode>> } =>
			Boolean(entry.parsed),
		);

	for (const entry of parsedCodes) {
		const shiftPayload = {
			organizationId: params.organizationId,
			name: entry.parsed.shiftLabel,
			code: entry.parsed.shiftCode,
			isOvernight: entry.parsed.endTime <= entry.parsed.startTime,
			isOff: false,
			isActive: true,
			isDeleted: false,
			timeSlots: buildNonOverlappingWorkBreakSlots(entry.parsed),
		};
		const shiftHour = calculateShiftHour(shiftPayload);
		const shiftType = await (prisma as any).shiftType.upsert({
			where: {
				organizationId_code: {
					organizationId: params.organizationId,
					code: entry.parsed.shiftCode,
				},
			},
			update: {
				name: shiftPayload.name,
				isOvernight: shiftPayload.isOvernight,
				isOff: shiftPayload.isOff,
				isActive: true,
				isDeleted: false,
				timeSlots: shiftPayload.timeSlots,
				shiftHour,
			},
			create: {
				...shiftPayload,
				shiftHour,
			},
		});
		const rawPattern = Array.from({ length: 7 }, (_, index) =>
			index < 6
				? { day: index + 1, shiftTypeId: shiftType.id, shiftSnapshot: null }
				: {
						day: index + 1,
						shiftTypeId: null,
						shiftSnapshot: buildDm3WorksharingOffDaySnapshot(),
					},
		);
		const pattern = await copyShiftTypeToTemplatePatternDay(prisma, {
			organizationId: params.organizationId,
			pattern: rawPattern,
		});
		const totalHour = pattern.reduce(
			(total: number, day: any) => total + Math.max(0, Number(day.shiftHour || 0)),
			0,
		);
		const totalDay = pattern.filter((day: any) => Number(day.shiftHour || 0) > 0).length;
		const existingTemplate = await (prisma as any).scheduleTemplate.findUnique({
			where: {
				organizationId_code: {
					organizationId: params.organizationId,
					code: entry.scheduleCode,
				},
			},
			select: { id: true },
		});
		await (prisma as any).scheduleTemplate.upsert({
			where: {
				organizationId_code: {
					organizationId: params.organizationId,
					code: entry.scheduleCode,
				},
			},
			update: {
				name: `BNPI Mon-Sat ${entry.parsed.shiftLabel}`,
				description: "DM3.2 WorkSharing recurring schedule template",
				cycleDays: 7,
				graceLateMinutes: 0,
				graceEarlyOutMinutes: 0,
				pattern,
				totalHour,
				totalDay,
				isActive: true,
				isDeleted: false,
			},
			create: {
				organizationId: params.organizationId,
				code: entry.scheduleCode,
				name: `BNPI Mon-Sat ${entry.parsed.shiftLabel}`,
				description: "DM3.2 WorkSharing recurring schedule template",
				cycleDays: 7,
				graceLateMinutes: 0,
				graceEarlyOutMinutes: 0,
				pattern,
				totalHour,
				totalDay,
				isActive: true,
				isDeleted: false,
			},
		});
		if (existingTemplate) updatedCodes.push(entry.scheduleCode);
		else createdCodes.push(entry.scheduleCode);
	}

	return {
		created: createdCodes.length,
		updated: updatedCodes.length,
		createdCodes,
		updatedCodes,
	};
}

const getMigrationRequestUserId = (req: Request): string =>
	(typeof (req as any).userId === "string" && (req as any).userId) ||
	(typeof (req as any).user?.id === "string" && (req as any).user.id) ||
	"unknown";

const logMigrationActivity = (
	req: Request,
	action: string,
	description: string,
	pageTitle: string,
): void => {
	logActivity(req, {
		userId: getMigrationRequestUserId(req),
		action,
		description,
		page: {
			url: req.originalUrl,
			title: pageTitle,
		},
	});
};

const logMigrationAudit = (
	req: Request,
	params: {
		auditAction: string;
		entityId: string;
		description: string;
		changesAfter: Record<string, unknown> | null;
	},
): void => {
	logAudit(req, {
		userId: getMigrationRequestUserId(req),
		action: params.auditAction,
		resource: config.AUDIT_LOG.RESOURCES.MIGRATION,
		severity: config.AUDIT_LOG.SEVERITY.HIGH,
		entityType: config.AUDIT_LOG.ENTITY_TYPES.MIGRATION,
		entityId: params.entityId,
		changesBefore: null,
		changesAfter: params.changesAfter,
		description: params.description,
	});
};

const summarizeImportSummary = (summary: {
	total?: number;
	created?: number;
	updated?: number;
	skipped?: number;
	failed?: number;
	blocked?: number;
	[key: string]: unknown;
}) => ({
	total: summary.total ?? 0,
	created: summary.created ?? 0,
	updated: summary.updated ?? 0,
	skipped: summary.skipped ?? 0,
	failed: summary.failed ?? 0,
	blocked: summary.blocked ?? 0,
});

const logDm3ImportSuccess = (
	req: Request,
	organizationId: string,
	sourceId: string,
	importType: string,
	summary: {
		total?: number;
		created?: number;
		updated?: number;
		skipped?: number;
		failed?: number;
		blocked?: number;
		[key: string]: unknown;
	},
): void => {
	const summaryCounts = summarizeImportSummary(summary);
	logMigrationActivity(
		req,
		config.ACTIVITY_LOG.MIGRATION.ACTIONS.IMPORT_MIGRATION_DATA,
		`${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_DATA_IMPORTED}: ${importType}`,
		config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_IMPORT,
	);
	logMigrationAudit(req, {
		auditAction: config.AUDIT_LOG.ACTIONS.CREATE,
		entityId: organizationId,
		description: `${config.AUDIT_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_DATA_IMPORTED}: ${importType}`,
		changesAfter: {
			organizationId,
			sourceId,
			importType,
			summary: summaryCounts,
		},
	});
};

export const controller = (prisma: PrismaClient) => {
	const migrationRunService = new MigrationOrchestratorService(prisma);
	const migrationReconciliationReportService = new MigrationReconciliationReportService(prisma);
	const service = migrationService(prisma);
	const isTestEmailRoleAllowed = (roleValue: unknown): boolean => {
		const normalizedRole = String(roleValue || "")
			.trim()
			.toLowerCase();
		return TEST_EMAIL_ALLOWED_ROLES.has(normalizedRole);
	};

	/**
	 * POST /api/migration/execute
	 * Execute bulk employee migration with hierarchy-aware batch processing.
	 *
	 * Body: {
	 *   config: { organizationId, batchSize?, skipDuplicates?, dryRun? },
	 *   departments?: [...],
	 *   positions?: [...],
	 *   levels?: [...],
	 *   employees: [...]
	 * }
	 */
	const execute = async (req: Request, res: Response, _next: NextFunction) => {
		const validation = BulkMigrationSchema.safeParse(req.body);

		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			migrationLogger.error(
				`Migration validation failed: ${JSON.stringify(formattedErrors)}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.VALIDATION_ERROR || "Validation failed",
				400,
				formattedErrors,
			);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			migrationLogger.info(
				`Migration request received: ${validation.data.employees.length} employees, org=${validation.data.config.organizationId}`,
			);

			const authHeader = req.headers.authorization;
			let authToken: string | undefined;
			if (typeof authHeader === "string" && authHeader.trim().length > 0) {
				authToken = authHeader.startsWith("Bearer ")
					? authHeader.substring(7).trim()
					: authHeader.trim();
			}
			if (!authToken && typeof (req as any).cookies?.token === "string") {
				authToken = String((req as any).cookies.token).trim();
			}

			const actorUserId =
				(typeof (req as any).userId === "string" && (req as any).userId) ||
				(typeof (req as any).user?.id === "string" && (req as any).user.id) ||
				undefined;

			const enablePostActionsRaw = (req.body as any)?.enablePostActions;
			const enablePostActions =
				typeof enablePostActionsRaw === "boolean"
					? enablePostActionsRaw
					: typeof enablePostActionsRaw === "string"
						? enablePostActionsRaw.trim().toLowerCase() !== "false"
						: true;

			const result = await service.executeMigration(validation.data, {
				authToken,
				actorUserId,
				enablePostActions,
				requestPath: req.originalUrl,
			});

			const statusCode = result.success ? 200 : 207; // 207 Multi-Status if partial
			const message = result.success
				? `Migration completed successfully. ${result.summary.employees.created} employees created.`
				: `Migration completed with ${result.errors.length} errors. ${result.summary.employees.created} created, ${result.summary.employees.failed} failed.`;

			const organizationId = validation.data.config.organizationId;
			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.EXECUTE_MIGRATION,
				`${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_EXECUTED}: ${result.summary.employees.created} created`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_EXECUTE,
			);
			logMigrationAudit(req, {
				auditAction: config.AUDIT_LOG.ACTIONS.UPDATE,
				entityId: organizationId,
				description: `${config.AUDIT_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_EXECUTED}: ${result.summary.employees.created} employees created`,
				changesAfter: {
					organizationId,
					success: result.success,
					employeeCount: validation.data.employees.length,
					summary: result.summary,
					errorCount: result.errors?.length ?? 0,
				},
			});

			const successResponse = buildSuccessResponse(message, result, statusCode);
			res.status(statusCode).json(successResponse);
		} catch (error: any) {
			migrationLogger.error(`Migration execution failed: ${error.message}`, { error });
			const errorResponse = buildErrorResponse(
				"Migration failed due to an internal error",
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * POST /api/migration/dry-run
	 * Validate migration data without actually inserting.
	 * Returns what WOULD happen.
	 */
	const dryRun = async (req: Request, res: Response, _next: NextFunction) => {
		// Force dryRun = true
		const body = {
			...req.body,
			config: { ...req.body?.config, dryRun: true },
		};

		const validation = BulkMigrationSchema.safeParse(body);

		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const result = await service.executeMigration(validation.data);
			const organizationId = validation.data.config.organizationId;
			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.DRY_RUN_MIGRATION,
				`${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_DRY_RUN}: ${validation.data.employees.length} employees`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_DRY_RUN,
			);
			logMigrationAudit(req, {
				auditAction: config.AUDIT_LOG.ACTIONS.UPDATE,
				entityId: organizationId,
				description: `${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_DRY_RUN}: ${validation.data.employees.length} employees`,
				changesAfter: {
					organizationId,
					dryRun: true,
					employeeCount: validation.data.employees.length,
					summary: result.summary,
					errorCount: result.errors?.length ?? 0,
				},
			});
			const successResponse = buildSuccessResponse(
				"Dry run completed. No data was modified.",
				result,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error: any) {
			migrationLogger.error(`Dry run failed: ${error.message}`);
			const errorResponse = buildErrorResponse("Dry run failed", 500);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * GET /api/migration/stats?organizationId=xxx
	 * Get migration statistics: counts by department, level, etc.
	 */
	const stats = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = req.query.organizationId as string;

		if (!organizationId) {
			const errorResponse = buildErrorResponse("organizationId query param is required", 400);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const data = await service.getMigrationStats(organizationId);
			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.GET_MIGRATION_STATS,
				`${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_STATS_RETRIEVED}: ${organizationId}`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_STATS,
			);
			const successResponse = buildSuccessResponse("Migration stats retrieved", data, 200);
			res.status(200).json(successResponse);
		} catch (error: any) {
			migrationLogger.error(`Failed to get migration stats: ${error.message}`);
			const errorResponse = buildErrorResponse("Failed to retrieve migration stats", 500);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * GET /api/migration/hierarchy?organizationId=xxx&departmentCode=yyy
	 * Get the employee hierarchy tree structured by department â†’ level.
	 * Leverages compound B-tree index: @@index([departmentId, levelId])
	 */
	const hierarchy = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = req.query.organizationId as string;
		const departmentCode = req.query.departmentCode as string | undefined;

		if (!organizationId) {
			const errorResponse = buildErrorResponse("organizationId query param is required", 400);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const tree = await service.getHierarchyTree(organizationId, departmentCode);
			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.GET_MIGRATION_HIERARCHY,
				`${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_HIERARCHY_RETRIEVED}: ${organizationId}`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_STATS,
			);
			const successResponse = buildSuccessResponse("Hierarchy tree retrieved", tree, 200);
			res.status(200).json(successResponse);
		} catch (error: any) {
			migrationLogger.error(`Failed to get hierarchy: ${error.message}`);
			const errorResponse = buildErrorResponse("Failed to retrieve hierarchy", 500);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * POST /api/migration/test-credentials-email
	 * Sends a credentials-style test email using the same helper used by migration/import.
	 */
	const testCredentialsEmail = async (req: Request, res: Response, _next: NextFunction) => {
		const requesterRole = (req as any).role;
		if (!isTestEmailRoleAllowed(requesterRole)) {
			const errorResponse = buildErrorResponse(
				"Forbidden: your role is not allowed to send test credential emails",
				403,
			);
			res.status(403).json(errorResponse);
			return;
		}

		const validation = TestCredentialsEmailSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		const payload = validation.data;

		if (payload.dryRun) {
			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.EXECUTE_MIGRATION,
				`${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_DRY_RUN}: credentials email test`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_EXECUTE,
			);
			logMigrationAudit(req, {
				auditAction: config.AUDIT_LOG.ACTIONS.UPDATE,
				entityId: payload.employeeId,
				description: "Credentials email dry-run completed",
				changesAfter: {
					employeeId: payload.employeeId,
					to: payload.to,
					dryRun: true,
					configured: isEmployeeEmailConfigured,
				},
			});
			const successResponse = buildSuccessResponse(
				isEmployeeEmailConfigured
					? "Credentials email dry-run passed"
					: "Credentials email dry-run completed: SMTP configuration is missing",
				{
					sent: false,
					dryRun: true,
					configured: isEmployeeEmailConfigured,
				},
				200,
			);
			res.status(200).json(successResponse);
			return;
		}

		if (!isEmployeeEmailConfigured) {
			const errorResponse = buildErrorResponse(
				"Credentials email service is not configured. Set EMPLOYEE_EMAIL_USER/EMPLOYEE_EMAIL_PASS (or EMAIL_USER/EMAIL_PASS, SMTP_USER/APP_PASSWORD).",
				503,
			);
			res.status(503).json(errorResponse);
			return;
		}

		try {
			const emailResult = await sendEmployeeCredentialsEmail({
				to: payload.to,
				employeeId: payload.employeeId,
				email: payload.email,
				userName: payload.userName,
				password: payload.password,
				fullName: payload.fullName,
			});

			if (!emailResult.sent) {
				const errorResponse = buildErrorResponse(
					emailResult.reason || "Failed to send credentials test email",
					500,
				);
				res.status(500).json(errorResponse);
				return;
			}

			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.EXECUTE_MIGRATION,
				`Sent credentials test email to ${payload.to}`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_EXECUTE,
			);
			logMigrationAudit(req, {
				auditAction: config.AUDIT_LOG.ACTIONS.UPDATE,
				entityId: payload.employeeId,
				description: `Sent credentials test email to ${payload.to}`,
				changesAfter: {
					employeeId: payload.employeeId,
					to: payload.to,
					sent: true,
					messageId: emailResult.messageId,
				},
			});
			const successResponse = buildSuccessResponse(
				"Credentials test email sent successfully",
				{
					sent: true,
					to: payload.to,
					employeeId: payload.employeeId,
					messageId: emailResult.messageId,
					dryRun: false,
				},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error: any) {
			migrationLogger.error(`Failed to send credentials test email: ${error?.message}`, {
				error,
			});
			const errorResponse = buildErrorResponse(
				`Failed to send credentials test email: ${error?.message || "Unknown error"}`,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * POST /api/migration/upload-csv
	 * Upload a CSV or XLSX file and execute the migration pipeline.
	 *
	 * Uses the SAME CSV format as the employee import module:
	 *   Required columns: EMP_ID, NAME, POSITION, LEVEL, DEPARTMENT, TIN, SSS, PHILHEALTH, PAGIBIG, BASIC_SALARY
	 *   Optional columns: HIRE_DATE, EMAIL, PHONE, BIRTHDAY, GENDER, NATIONALITY, PLACE_OF_BIRTH,
	 *                     DEVICE_ID, STREET, CITY, STATE, COUNTRY, POSTAL_CODE, ROLE, START_DATE,
	 *                     END_DATE, WORK_LOCATION, REPORT_TO_EMP_ID, CURRENCY, PAY_FREQUENCY, SCHEDULE
	 *
	 * multipart/form-data:
	 *   - file: CSV or XLSX file (required, field name 'file')
	 *   - organizationId: string (required, or comes from JWT middleware)
	 *   - batchSize: number (optional, default 500)
	 *   - skipDuplicates: boolean (optional, default true)
	 *   - dryRun: boolean (optional, default false)
	 *   - autoCreate: boolean (optional, default false â€” auto-create missing dept/pos/level)
	 */
	const uploadCsv = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const file = (req as any).file as Express.Multer.File | undefined;
			const files = (req as any).files as
				| Express.Multer.File[]
				| Record<string, Express.Multer.File[]>
				| undefined;
			let requestData: any = req.body;
			const contentType = req.get("Content-Type") || "";

			migrationLogger.info("Received CSV upload request with content-type:", contentType);

			const uploadedFile =
				file ||
				(Array.isArray(files) ? files[0] : undefined) ||
				(files && !Array.isArray(files) ? files.file?.[0] : undefined);

			if (!uploadedFile || !uploadedFile.buffer) {
				const receivedBodyKeys = Object.keys(req.body || {});
				const errorResponse = buildErrorResponse(
					`File is required. Upload as multipart/form-data with field name 'file'. Received content-type="${contentType}" and body keys=[${receivedBodyKeys.join(", ")}].`,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			// Parse form-data body if needed
			if (
				contentType.includes("application/x-www-form-urlencoded") ||
				contentType.includes("multipart/form-data")
			) {
				if (req.body?.data) {
					try {
						requestData = JSON.parse(req.body.data);
					} catch {
						requestData = transformFormDataToObject(req.body);
					}
				} else {
					requestData = transformFormDataToObject(req.body);
				}
			}

			const parseBoolean = (value: unknown, defaultValue: boolean): boolean => {
				if (typeof value === "boolean") return value;
				if (typeof value === "string") {
					const normalized = value.trim().toLowerCase();
					if (normalized === "true") return true;
					if (normalized === "false") return false;
				}
				return defaultValue;
			};

			const parseNumber = (value: unknown, defaultValue: number): number => {
				if (typeof value === "number" && Number.isFinite(value)) return value;
				if (typeof value === "string" && value.trim() !== "") {
					const parsed = Number(value);
					if (Number.isFinite(parsed)) return parsed;
				}
				return defaultValue;
			};

			// Parse config from form fields or JWT middleware
			const organizationId = requestData.organizationId || (req as any).organizationId;

			const configInput = {
				organizationId,
				batchSize: parseNumber(requestData.batchSize, 500),
				maxParallelBatches: parseNumber(requestData.maxParallelBatches, 6),
				skipDuplicates: parseBoolean(requestData.skipDuplicates, true),
				dryRun: parseBoolean(requestData.dryRun, false),
			};

			const configValidation = MigrationConfigSchema.safeParse(configInput);
			if (!configValidation.success) {
				const formattedErrors = formatZodErrors(configValidation.error.format());
				const errorResponse = buildErrorResponse("Invalid config", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			const autoCreate = parseBoolean(requestData.autoCreate, false);

			// â”€â”€ Step 1: Parse file buffer into EmployeeImportRow[] â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
			let rows: EmployeeImportRow[];
			try {
				rows = parseFileBufferToImportRows(uploadedFile.buffer);
			} catch (parseErr: any) {
				const errorResponse = buildErrorResponse(
					`Failed to parse file: ${parseErr.message}`,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			if (rows.length === 0) {
				const errorResponse = buildErrorResponse(
					"No employee rows found in the uploaded file.",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			migrationLogger.info(`Parsed ${rows.length} rows from "${uploadedFile.originalname}"`);

			// â”€â”€ Step 2: Load caches and optionally auto-create resources â”€â”€â”€â”€â”€â”€â”€â”€â”€
			const helper = new EmployeeImportHelper(prisma, organizationId);
			await helper.loadCaches();

			if (autoCreate) {
				migrationLogger.info(
					"autoCreate=true: ensuring departments, positions, and levels exist",
				);
				for (const row of rows) {
					try {
						await helper.ensureResources(row);
					} catch (ensureErr: any) {
						migrationLogger.warn(
							`ensureResources failed for row EMP_ID=${row.EMP_ID}: ${ensureErr.message}`,
						);
					}
				}
				// Reload caches after auto-creating resources
				await helper.loadCaches();
			}

			// â”€â”€ Step 3: Map rows â†’ migrationService employee format â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
			// The EmployeeImportHelper.mapRowToEmployeeData resolves all IDs.
			// We then adapt the result to the EmployeeRowInput shape expected by the migration service.
			const mappedEmployees: any[] = [];
			const rowErrors: string[] = [];

			for (let i = 0; i < rows.length; i++) {
				const row = rows[i];
				try {
					const mapped = helper.mapRowToEmployeeData(row);
					const embeddedSchedule = (mapped.employee as any).embeddedSchedule;

					// Resolve role name from explicit ROLE, otherwise derive from department + level.isManager.
					const resolvedRole = helper.resolveRoleName(
						row.ROLE,
						row.DEPARTMENT,
						row.LEVEL,
					);

					// Build the employee entry in the format the migration service expects
					mappedEmployees.push({
						employeeId: row.EMP_ID,
						// Parse NAME into firstName / lastName
						firstName: (mapped.person.personalInfo as any).firstName,
						lastName: (mapped.person.personalInfo as any).lastName,
						middleName: (mapped.person.personalInfo as any).middleName,
						email: row.EMAIL,
						role: resolvedRole,
						// Pass original CSV values for Zod schema validation (departmentCode/positionCode required)
						departmentCode: row.DEPARTMENT,
						departmentName: row.DEPARTMENT,
						positionCode: row.POSITION,
						positionTitle: row.POSITION,
						levelName: row.LEVEL,
						// Also pass pre-resolved DB IDs for direct use (bypass code-based lookup)
						departmentId: (mapped.employee as any).departmentId,
						positionId: (mapped.employee as any).positionId,
						levelId: (mapped.employee as any).levelId,
						reportToEmployeeId: row.REPORT_TO_EMP_ID || undefined,
						basicSalary: (mapped.employee as any).basicSalary,
						currency: (mapped.employee as any).currency,
						payFrequency: (mapped.employee as any).payFrequency,
						workLocation: (mapped.employee as any).workLocation,
						employmentHireDate: (mapped.employee as any).employmentHireDate,
						employmentStartDate: (mapped.employee as any).employmentStartDate,
						employmentTerminationDate: (mapped.employee as any)
							.employmentTerminationDate,
						embeddedSchedule,
						deviceEmpId: (mapped.employee as any).deviceEmpId,
						// Person contact/personal info
						personalInfo: mapped.person.personalInfo,
						contactInfo: mapped.person.contactInfo,
						sourceRow: i + 2,
					});
				} catch (mapErr: any) {
					rowErrors.push(`Row ${i + 2} (EMP_ID=${row.EMP_ID}): ${mapErr.message}`);
				}
			}

			// If every row failed mapping log but still proceed if some succeeded
			if (mappedEmployees.length === 0) {
				const errorResponse = buildErrorResponse(
					`All CSV rows failed field mapping:\n${rowErrors.slice(0, 20).join("\n")}`,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			if (rowErrors.length > 0) {
				migrationLogger.warn(
					`${rowErrors.length} rows failed field mapping and will be skipped:\n${rowErrors.slice(0, 20).join("\n")}`,
				);
			}

			migrationLogger.info(
				`CSV upload: ${mappedEmployees.length} valid employees from "${uploadedFile.originalname}" (${rowErrors.length} skipped)`,
			);

			const authHeader = req.headers.authorization;
			let authToken: string | undefined;
			if (typeof authHeader === "string" && authHeader.trim().length > 0) {
				authToken = authHeader.startsWith("Bearer ")
					? authHeader.substring(7).trim()
					: authHeader.trim();
			}
			if (!authToken && typeof (req as any).cookies?.token === "string") {
				authToken = String((req as any).cookies.token).trim();
			}

			const actorUserId =
				(typeof (req as any).userId === "string" && (req as any).userId) ||
				(typeof (req as any).user?.id === "string" && (req as any).user.id) ||
				undefined;

			if (requestData.enablePostActions !== undefined) {
				const requestedPostActions = parseBoolean(requestData.enablePostActions, true);
				if (!requestedPostActions) {
					migrationLogger.warn(
						"upload-csv strict mode ignores enablePostActions=false; post-actions remain enabled.",
					);
				}
			}
			const enablePostActions = true;
			const strictPostActions = true;

			// â”€â”€ Step 4: Execute migration service â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
			const result = await service.executeMigration(
				{
					config: configValidation.data,
					employees: mappedEmployees,
				},
				{
					authToken,
					actorUserId,
					enablePostActions,
					requestPath: req.originalUrl,
					strictPostActions,
				},
			);

			const statusCode = result.success ? 200 : 207;
			const message = result.success
				? `CSV migration completed successfully. ${result.summary.employees.created} employees created from "${uploadedFile.originalname}".`
				: `CSV migration completed with ${result.errors.length} errors. ${result.summary.employees.created} created, ${result.summary.employees.failed} failed.`;

			// Include any mapping-level row errors in the response
			const responseData =
				rowErrors.length > 0 ? { ...result, mappingErrors: rowErrors } : result;

			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.UPLOAD_MIGRATION_CSV,
				`${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_CSV_UPLOADED}: ${uploadedFile.originalname}`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_IMPORT,
			);
			logMigrationAudit(req, {
				auditAction: config.AUDIT_LOG.ACTIONS.CREATE,
				entityId: configValidation.data.organizationId,
				description: `${config.AUDIT_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_DATA_IMPORTED}: ${uploadedFile.originalname}`,
				changesAfter: {
					organizationId: configValidation.data.organizationId,
					sourceId: uploadedFile.originalname,
					summary: result.summary,
					errorCount: result.errors?.length ?? 0,
					mappingErrorCount: rowErrors.length,
				},
			});

			const successResponse = buildSuccessResponse(message, responseData, statusCode);
			res.status(statusCode).json(successResponse);
		} catch (error: any) {
			migrationLogger.error(`CSV migration failed: ${error.message}`, { error });
			const errorResponse = buildErrorResponse(`CSV migration failed: ${error.message}`, 500);
			res.status(500).json(errorResponse);
		}
	};

	const extractSources = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const singleFile = (req as any).file as Express.Multer.File | undefined;
			const anyFiles = ((req as any).files || []) as Express.Multer.File[];
			const uploadedFiles = [
				...(singleFile ? [singleFile] : []),
				...(Array.isArray(anyFiles) ? anyFiles : []).filter(Boolean),
			];

			if (uploadedFiles.length === 0) {
				const errorResponse = buildErrorResponse(
					"At least one CSV/XLSX/XLS file is required. Upload using field name 'files' or 'file'.",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			const extractedFiles = uploadedFiles.map((file) => {
				const parsedSheets = parseWorkbookSheets(file.buffer);
				const sheets = parsedSheets.map(({ sheetName, rows }) =>
					buildSheetExtractionSummary(sheetName, rows),
				);

				return {
					fileName: file.originalname,
					mimeType: file.mimetype,
					size: file.size,
					sheets,
				};
			});

			const merged = mergeExtractedBuckets(extractedFiles);

			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.IMPORT_MIGRATION_DATA,
				`Extracted structural values from ${uploadedFiles.length} source file${uploadedFiles.length === 1 ? "" : "s"}`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_IMPORT,
			);

			const successResponse = buildSuccessResponse(
				`Extracted structural values from ${uploadedFiles.length} file${uploadedFiles.length === 1 ? "" : "s"}.`,
				{
					files: extractedFiles,
					merged,
				},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error: any) {
			migrationLogger.error(`Source extraction failed: ${error.message}`, { error });
			const errorResponse = buildErrorResponse(
				`Source extraction failed: ${error.message || "Unknown error"}`,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const transformSources = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const uploadedFile = ((req as any).file || (req as any).files?.[0]) as
				| Express.Multer.File
				| undefined;

			if (!uploadedFile) {
				const errorResponse = buildErrorResponse(
					"A source file is required. Upload using field name 'file'.",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			const sheetName = String(req.body?.sheetName || "").trim();
			if (!sheetName) {
				const errorResponse = buildErrorResponse("sheetName is required.", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const rawFieldMapping = parseJsonField<Record<string, string>>(
				req.body?.fieldMapping,
				{},
			);
			const rawSplitRules = parseJsonField<any[]>(req.body?.splitRules, []);
			const fieldMapping = sanitizeFieldMapping(rawFieldMapping);
			const splitRules = sanitizeSplitRules(rawSplitRules);
			const { rows } = parseWorkbookSheetByName(uploadedFile.buffer, sheetName);
			const normalizedRows = buildNormalizedRowsFromRules(rows, fieldMapping, splitRules);
			const headers = NORMALIZED_FIELD_KEYS.slice();
			const populatedRowCount = normalizedRows.filter((row) =>
				headers.some((header) => String(row?.[header] ?? "").trim()),
			).length;

			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.IMPORT_MIGRATION_DATA,
				`Transformed sheet "${sheetName}" from "${uploadedFile.originalname}"`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_IMPORT,
			);

			const successResponse = buildSuccessResponse(
				`Transformed sheet "${sheetName}" from "${uploadedFile.originalname}".`,
				{
					fileName: uploadedFile.originalname,
					sheetName,
					headers,
					rowCount: rows.length,
					populatedRowCount,
					previewRows: normalizedRows.slice(0, 20),
					normalizedRows,
					fieldMapping,
					splitRules,
				},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error: any) {
			migrationLogger.error(`Source transform failed: ${error.message}`, { error });
			const errorResponse = buildErrorResponse(
				`Source transform failed: ${error.message || "Unknown error"}`,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const importDm3EmployeeSchedules = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const file = (req as any).file as Express.Multer.File | undefined;
			const files = (req as any).files as
				| Express.Multer.File[]
				| Record<string, Express.Multer.File[]>
				| undefined;
			const uploadedFile =
				file ||
				(Array.isArray(files) ? files[0] : undefined) ||
				(files && !Array.isArray(files) ? files.file?.[0] : undefined);

			if (!uploadedFile?.buffer) {
				res.status(400).json(
					buildErrorResponse(
						"File is required. Upload the DM3 Employee Schedule Assignments sheet as multipart/form-data with field name 'file'.",
						400,
					),
				);
				return;
			}

			const parsedBody = parseMultipartJsonBody(req);
			if (parsedBody.error) {
				res.status(400).json(buildErrorResponse(parsedBody.error, 400));
				return;
			}
			const body = parsedBody.body || {};
			const organizationId = String(body.organizationId || (req as any).organizationId || "").trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("organizationId is required", 400));
				return;
			}

			const rows = parseFileBufferToImportRows(uploadedFile.buffer) as any[];
			const summary = {
				total: rows.length,
				created: 0,
				updated: 0,
				skipped: 0,
				failed: 0,
				scheduleTemplatesCreated: 0,
				scheduleTemplatesUpdated: 0,
				attendanceObligationsRefreshed: 0,
				attendanceObligationsInserted: 0,
				attendanceObligationRemainingGap: 0,
				errors: [] as Array<{ row: number; field?: string; message: string }>,
			};
			const affectedEmployeeIds = new Set<string>();

			const employeeIds = Array.from(
				new Set(rows.map((row) => String(row.EMP_ID || "").trim()).filter(Boolean)),
			);
			const scheduleCodes = Array.from(
				new Set(rows.map((row) => String(row.SCHEDULE_CODE || "").trim()).filter(Boolean)),
			);
			const scheduleTemplateEnsureResult = await ensureDm3EmployeeScheduleTemplates(prisma, {
				organizationId,
				scheduleCodes,
			});
			summary.scheduleTemplatesCreated = scheduleTemplateEnsureResult.created;
			summary.scheduleTemplatesUpdated = scheduleTemplateEnsureResult.updated;
			const employees = employeeIds.length
				? await prisma.employee.findMany({
						where: { organizationId, isDeleted: false, employeeId: { in: employeeIds } },
						select: {
							id: true,
							employeeId: true,
							embeddedSchedule: true,
							employmentStartDate: true,
							employmentHireDate: true,
						},
					})
				: [];
			const scheduleTemplates = scheduleCodes.length
				? await (prisma as any).scheduleTemplate.findMany({
						where: {
							organizationId,
							isDeleted: false,
							code: { in: scheduleCodes },
						},
						select: {
							id: true,
							code: true,
							name: true,
							cycleDays: true,
							graceLateMinutes: true,
							graceEarlyOutMinutes: true,
							pattern: true,
						},
					})
				: [];
			const employeesByExternalId = new Map(
				employees.map((employee: any) => [String(employee.employeeId), employee]),
			);
			const templatesByCode = new Map(
				scheduleTemplates.map((template: any) => [String(template.code), template]),
			);

			for (const [index, row] of rows.entries()) {
				const rowNumber = index + 2;
				const employeeExternalId = String(row.EMP_ID || "").trim();
				const scheduleCode = String(row.SCHEDULE_CODE || "").trim();
				const sourceEffectiveFrom = parseDateOnlyInput(row.EFFECTIVE_FROM);
				const employee = employeesByExternalId.get(employeeExternalId);
				const effectiveFrom = resolveEmployeeScheduleEffectiveStart(employee, sourceEffectiveFrom);
				const effectiveTo = parseDateOnlyInput(row.EFFECTIVE_TO);
				const notes = String(row.NOTES || "").trim();
				const effectiveStartSource =
					parseDateOnlyInput(employee?.employmentStartDate) ||
					parseDateOnlyInput(employee?.employmentHireDate)
						? "employee_start_or_hire_date"
						: "workbook_effective_from";

				if (!employeeExternalId || !scheduleCode || !effectiveFrom) {
					summary.failed += 1;
					summary.errors.push({
						row: rowNumber,
						field: !employeeExternalId ? "EMP_ID" : !scheduleCode ? "SCHEDULE_CODE" : "EFFECTIVE_FROM",
						message: "EMP_ID, SCHEDULE_CODE, and employee start/hire date or EFFECTIVE_FROM are required.",
					});
					continue;
				}
				if (effectiveTo && effectiveTo < effectiveFrom) {
					summary.failed += 1;
					summary.errors.push({
						row: rowNumber,
						field: "EFFECTIVE_TO",
						message: "EFFECTIVE_TO must be on or after EFFECTIVE_FROM.",
					});
					continue;
				}
				if (!employee) {
					summary.skipped += 1;
					summary.errors.push({
						row: rowNumber,
						field: "EMP_ID",
						message: `Employee ${employeeExternalId} was not found. Import DM3 Employees first, then rerun DM3.2 schedules.`,
					});
					continue;
				}
				const scheduleTemplate = templatesByCode.get(scheduleCode);
				if (!scheduleTemplate) {
					summary.failed += 1;
					summary.errors.push({
						row: rowNumber,
						field: "SCHEDULE_CODE",
						message: `Schedule template ${scheduleCode} was not found.`,
					});
					continue;
				}

				const previousEmbeddedSchedule = employee.embeddedSchedule || null;
				const nextEmbeddedSchedule = copyTemplateToEmployeeEmbeddedSchedule({
					template: scheduleTemplate,
					effectiveStartDate: effectiveFrom,
					effectiveEndDate: effectiveTo || null,
					reason: notes || "DM3.2 employee schedule assignment import",
					version: Number((previousEmbeddedSchedule as any)?.version || 0) + 1,
				});
				if (isSameEmployeeScheduleAssignment(previousEmbeddedSchedule, nextEmbeddedSchedule)) {
					const previousReason = String((previousEmbeddedSchedule as any)?.reason || "").trim();
					const nextReason = String((nextEmbeddedSchedule as any)?.reason || "").trim();
					if (previousReason !== nextReason) {
						const refreshedSchedule = {
							...(previousEmbeddedSchedule as any),
							reason: (nextEmbeddedSchedule as any).reason,
							assignedAt: (nextEmbeddedSchedule as any).assignedAt,
							version: Number((previousEmbeddedSchedule as any)?.version || 0) + 1,
						};
						await prisma.employee.update({
							where: { id: employee.id },
							data: { embeddedSchedule: refreshedSchedule as any },
						});
						await appendEmployeeScheduleHistory(prisma, {
							organizationId,
							employeeId: employee.id,
							action: "reassigned",
							reason: nextReason || "DM3.2 employee schedule source evidence refresh",
							effectiveAt: effectiveFrom,
							beforeSchedule: previousEmbeddedSchedule,
							afterSchedule: refreshedSchedule,
							metadata: {
								sourceWorkbook: uploadedFile.originalname,
								sourceSheet: "Employee Schedule Assignments",
								sourceRow: rowNumber,
								effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
								effectiveStartSource,
								sourceEffectiveFrom: sourceEffectiveFrom?.toISOString().slice(0, 10) || null,
								effectiveTo: effectiveTo ? effectiveTo.toISOString().slice(0, 10) : null,
								reason: "same_timeslot_source_refreshed",
							},
						});
						summary.updated += 1;
						employee.embeddedSchedule = refreshedSchedule;
					} else {
						summary.skipped += 1;
					}
					affectedEmployeeIds.add(employee.id);
					continue;
				}
				await prisma.employee.update({
					where: { id: employee.id },
					data: { embeddedSchedule: nextEmbeddedSchedule as any },
				});
				await appendEmployeeScheduleHistory(prisma, {
					organizationId,
					employeeId: employee.id,
					action: previousEmbeddedSchedule ? "reassigned" : "assigned",
					reason: notes || "DM3.2 employee schedule assignment import",
					effectiveAt: effectiveFrom,
					beforeSchedule: previousEmbeddedSchedule,
					afterSchedule: nextEmbeddedSchedule,
					metadata: {
						sourceWorkbook: uploadedFile.originalname,
						sourceSheet: "Employee Schedule Assignments",
						sourceRow: rowNumber,
						effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
						effectiveStartSource,
						sourceEffectiveFrom: sourceEffectiveFrom?.toISOString().slice(0, 10) || null,
						effectiveTo: effectiveTo ? effectiveTo.toISOString().slice(0, 10) : null,
					},
				});

				if (previousEmbeddedSchedule) summary.updated += 1;
				else summary.created += 1;
				affectedEmployeeIds.add(employee.id);
			}

			if (affectedEmployeeIds.size > 0) {
				const materialization = await ensureDm3ScheduleBackedAttendanceObligations(prisma, {
					organizationId,
					employeeIds: Array.from(affectedEmployeeIds),
					currentOnly: true,
				});
				summary.attendanceObligationsRefreshed = materialization.existingAfter;
				summary.attendanceObligationsInserted = materialization.inserted;
				summary.attendanceObligationRemainingGap = materialization.remainingScheduledGap;
				(summary as any).attendanceObligations = materialization;
			}

			logDm3ImportSuccess(
				req,
				organizationId,
				uploadedFile.originalname,
				"dm3-employee-schedules",
				summary,
			);

			res.status(summary.failed > 0 ? 207 : 200).json(
				buildSuccessResponse(
					summary.failed > 0
						? "DM3 employee schedule assignment import completed with issues."
						: "DM3 employee schedule assignments imported.",
					{ summary },
					summary.failed > 0 ? 207 : 200,
				),
			);
		} catch (error: any) {
			migrationLogger.error(`DM3 employee schedule assignment import failed: ${error.message}`, { error });
			res.status(500).json(
				buildErrorResponse(
					`DM3 employee schedule assignment import failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	const importDm3ReportingLines = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const file = (req as any).file as Express.Multer.File | undefined;
			const files = (req as any).files as
				| Express.Multer.File[]
				| Record<string, Express.Multer.File[]>
				| undefined;
			const uploadedFile =
				file ||
				(Array.isArray(files) ? files[0] : undefined) ||
				(files && !Array.isArray(files) ? files.file?.[0] : undefined);

			if (!uploadedFile?.buffer) {
				res.status(400).json(
					buildErrorResponse(
						"File is required. Upload the DM3 Reporting Lines sheet as multipart/form-data with field name 'file'.",
						400,
					),
				);
				return;
			}

			const parsedBody = parseMultipartJsonBody(req);
			if (parsedBody.error) {
				res.status(400).json(buildErrorResponse(parsedBody.error, 400));
				return;
			}
			const body = parsedBody.body || {};
			const organizationId = String(body.organizationId || (req as any).organizationId || "").trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("organizationId is required", 400));
				return;
			}

			const rows = parseFileBufferToImportRows(uploadedFile.buffer) as any[];
			const summary = await importDm3ReportingLinesService(
				{
					prisma,
					buffer: uploadedFile.buffer,
					organizationId,
					sourceWorkbook: uploadedFile.originalname,
				},
				rows,
			);

			logDm3ImportSuccess(
				req,
				organizationId,
				uploadedFile.originalname,
				"dm3-reporting-lines",
				summary,
			);

			res.status(summary.failed > 0 ? 207 : 200).json(
				buildSuccessResponse(
					summary.failed > 0
						? "DM3 reporting line import completed with issues."
						: "DM3 reporting lines imported.",
					{ summary },
					summary.failed > 0 ? 207 : 200,
				),
			);
		} catch (error: any) {
			migrationLogger.error(`DM3 reporting line import failed: ${error.message}`, { error });
			res.status(500).json(
				buildErrorResponse(
					`DM3 reporting line import failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	const importDm3EmployeeDocuments = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const file = (req as any).file as Express.Multer.File | undefined;
			const files = (req as any).files as
				| Express.Multer.File[]
				| Record<string, Express.Multer.File[]>
				| undefined;
			const uploadedFile =
				file ||
				(Array.isArray(files) ? files[0] : undefined) ||
				(files && !Array.isArray(files) ? files.file?.[0] : undefined);

			if (!uploadedFile?.buffer) {
				res.status(400).json(
					buildErrorResponse(
						"File is required. Upload the DM3 Employee Documents 201 Files sheet as multipart/form-data with field name 'file'.",
						400,
					),
				);
				return;
			}

			const parsedBody = parseMultipartJsonBody(req);
			if (parsedBody.error) {
				res.status(400).json(buildErrorResponse(parsedBody.error, 400));
				return;
			}
			const body = parsedBody.body || {};
			const organizationId = String(body.organizationId || (req as any).organizationId || "").trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("organizationId is required", 400));
				return;
			}

			const rows = parseFileBufferToImportRows(uploadedFile.buffer) as any[];
			const summary = {
				total: rows.length,
				created: 0,
				updated: 0,
				skipped: 0,
				failed: 0,
				errors: [] as Array<{ row: number; field?: string; message: string }>,
			};
			const employeeIds = Array.from(
				new Set(rows.map((row) => String(row.EMP_ID || "").trim()).filter(Boolean)),
			);
			const documentCodes = Array.from(
				new Set(
					rows
						.map((row) => String(row.DOCUMENT_TYPE_CODE || "").trim())
						.filter(Boolean),
				),
			);
			const [employees, documentTypes] = await Promise.all([
				employeeIds.length
					? prisma.employee.findMany({
							where: { organizationId, isDeleted: false, employeeId: { in: employeeIds } },
							select: { id: true, employeeId: true },
						})
					: [],
				documentCodes.length
					? (prisma as any).documentType.findMany({
							where: {
								organizationId,
								isDeleted: false,
								OR: [{ code: { in: documentCodes } }, { name: { in: documentCodes } }],
							},
							select: { id: true, code: true, name: true },
						})
					: [],
			]);
			const employeesByExternalId = new Map(
				employees.map((employee: any) => [String(employee.employeeId), employee]),
			);
			const documentTypesByKey = new Map<string, any>();
			for (const documentType of documentTypes as any[]) {
				[String(documentType.id), String(documentType.code), String(documentType.name)]
					.filter(Boolean)
					.forEach((key) => documentTypesByKey.set(key.trim().toUpperCase(), documentType));
			}

			for (const [index, row] of rows.entries()) {
				const rowNumber = index + 2;
				const employeeExternalId = String(row.EMP_ID || "").trim();
				const documentTypeCode = String(row.DOCUMENT_TYPE_CODE || "").trim();
				if (!employeeExternalId || !documentTypeCode) {
					summary.failed += 1;
					summary.errors.push({
						row: rowNumber,
						field: !employeeExternalId ? "EMP_ID" : "DOCUMENT_TYPE_CODE",
						message: "EMP_ID and DOCUMENT_TYPE_CODE are required.",
					});
					continue;
				}

				const employee = employeesByExternalId.get(employeeExternalId);
				const documentType = documentTypesByKey.get(documentTypeCode.toUpperCase());
				if (!employee || !documentType) {
					summary.failed += 1;
					summary.errors.push({
						row: rowNumber,
						field: !employee ? "EMP_ID" : "DOCUMENT_TYPE_CODE",
						message: !employee
							? `Employee ${employeeExternalId} was not found.`
							: `Document type ${documentTypeCode} was not found.`,
					});
					continue;
				}

				const reviewStatus = normalizeDocumentReviewStatus(row.STATUS);
				const issueDate = parseDateOnlyInput(row.ISSUE_DATE) || new Date();
				const expiryDate = parseDateOnlyInput(row.EXPIRY_DATE);
				const documentNumber =
					String(row.DOCUMENT_NUMBER || "").trim() ||
					`${documentType.code || documentType.name}-${employeeExternalId}`;
				const existingDocument = await (prisma as any).document.findFirst({
					where: {
						employeeId: employee.id,
						isDeleted: false,
						OR: [{ documentTypeId: documentType.id }, { type: documentType.code }],
					},
					select: { id: true, reviewStatus: true },
				});
				const documentPayload = {
					name: documentType.name || documentType.code,
					type: documentType.code || documentType.name,
					number: documentNumber,
					issueDate,
					expiryDate,
					documentTypeId: documentType.id,
					reviewStatus: reviewStatus as any,
					reviewSource: "MIGRATION" as any,
					reviewSubmittedAt: new Date(),
					reviewApprovedAt: reviewStatus === "APPROVED" ? new Date() : null,
					metadata: {
						source: "DM3.4 Employee Documents / 201 Files",
						sourceWorkbook: uploadedFile.originalname,
						sourceSheet: "Employee Documents 201 Files",
						sourceRow: rowNumber,
						notes: String(row.NOTES || "").trim() || null,
					},
				};
				const document = existingDocument
					? await (prisma as any).document.update({
							where: { id: existingDocument.id },
							data: documentPayload,
						})
					: await (prisma as any).document.create({
							data: { ...documentPayload, employeeId: employee.id },
						});
				if (!existingDocument) {
					await (prisma as any).documentReviewEvent.create({
						data: {
							organizationId,
							documentId: document.id,
							employeeId: employee.id,
							eventType: reviewStatus === "APPROVED" ? "APPROVED" : "SUBMITTED",
							fromStatus: null,
							toStatus: reviewStatus as any,
							source: "MIGRATION",
							comments: String(row.NOTES || "").trim() || null,
						},
					});
					summary.created += 1;
				} else {
					summary.updated += 1;
				}
			}

			logDm3ImportSuccess(
				req,
				organizationId,
				uploadedFile.originalname,
				"dm3-employee-documents",
				summary,
			);

			res.status(summary.failed > 0 ? 207 : 200).json(
				buildSuccessResponse(
					summary.failed > 0
						? "DM3 employee document import completed with issues."
						: "DM3 employee documents imported.",
					{ summary },
					summary.failed > 0 ? 207 : 200,
				),
			);
		} catch (error: any) {
			migrationLogger.error(`DM3 employee document import failed: ${error.message}`, { error });
			res.status(500).json(
				buildErrorResponse(
					`DM3 employee document import failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	const importDm3OpeningLeaveBalances = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const file = (req as any).file as Express.Multer.File | undefined;
			const files = (req as any).files as
				| Express.Multer.File[]
				| Record<string, Express.Multer.File[]>
				| undefined;
			const uploadedFile =
				file ||
				(Array.isArray(files) ? files[0] : undefined) ||
				(files && !Array.isArray(files) ? files.file?.[0] : undefined);

			if (!uploadedFile?.buffer) {
				res.status(400).json(
					buildErrorResponse(
						"File is required. Upload the DM3 Opening Leave Balances sheet as multipart/form-data with field name 'file'.",
						400,
					),
				);
				return;
			}

			const parsedBody = parseMultipartJsonBody(req);
			if (parsedBody.error) {
				res.status(400).json(buildErrorResponse(parsedBody.error, 400));
				return;
			}
			const body = parsedBody.body || {};
			const organizationId = String(body.organizationId || (req as any).organizationId || "").trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("organizationId is required", 400));
				return;
			}

			const rows = parseFileBufferToImportRows(uploadedFile.buffer) as any[];
			const employeeIds = Array.from(
				new Set(rows.map((row) => String(row.EMP_ID || "").trim()).filter(Boolean)),
			);
			const employees = employeeIds.length
				? await prisma.employee.findMany({
						where: { organizationId, isDeleted: false, employeeId: { in: employeeIds } },
						select: { id: true, employeeId: true, leaveBalances: true },
					})
				: [];
			const employeesByExternalId = new Map(
				employees.map((employee: any) => [String(employee.employeeId), employee]),
			);
			const summary = await importOpeningLeaveBalances(
				{
					prisma,
					buffer: uploadedFile.buffer,
					organizationId,
					sourceWorkbook: uploadedFile.originalname,
				},
				rows,
				employeesByExternalId,
			);

			logDm3ImportSuccess(
				req,
				organizationId,
				uploadedFile.originalname,
				"dm3-opening-leave-balances",
				summary,
			);

			res.status(summary.failed > 0 ? 207 : 200).json(
				buildSuccessResponse(
					summary.failed > 0
						? "DM3 opening leave balance import completed with issues."
						: "DM3 opening leave balances imported.",
					{ summary },
					summary.failed > 0 ? 207 : 200,
				),
			);
		} catch (error: any) {
			migrationLogger.error(`DM3 opening leave balance import failed: ${error.message}`, { error });
			res.status(500).json(
				buildErrorResponse(
					`DM3 opening leave balance import failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	const resolveUploadedMigrationFile = (req: Request) => {
		const file = (req as any).file as Express.Multer.File | undefined;
		const files = (req as any).files as
			| Express.Multer.File[]
			| Record<string, Express.Multer.File[]>
			| undefined;
		return (
			file ||
			(Array.isArray(files) ? files[0] : undefined) ||
			(files && !Array.isArray(files) ? files.file?.[0] : undefined)
		);
	};

	/** BNPI mass uploads can exceed default 120s socket idle timeout on large workbooks. */
	const armHeavyMassUploadTimeouts = (req: Request, res: Response) => {
		const heavyMs =
			Number((appConfig as any).heavyRequestTimeoutMs) > 0
				? Number((appConfig as any).heavyRequestTimeoutMs)
				: 300000;
		try {
			if (typeof (req as any).setTimeout === "function") (req as any).setTimeout(heavyMs);
			if (typeof res.setTimeout === "function") res.setTimeout(heavyMs);
			if (req.socket && typeof req.socket.setTimeout === "function") {
				req.socket.setTimeout(heavyMs);
			}
		} catch {
			// best-effort; import still runs
		}
	};

	const resolveMassUploadMigrationRunId = (body: any, req: Request): string | null => {
		const raw =
			body?.migrationRunId ||
			body?.runId ||
			(req as any).body?.migrationRunId ||
			(req as any).body?.runId ||
			"";
		const value = String(raw || "").trim();
		return value || null;
	};

	const importDm3CompensationMassUpload = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		armHeavyMassUploadTimeouts(req, res);
		try {
			const uploadedFile = resolveUploadedMigrationFile(req);
			if (!uploadedFile?.buffer) {
				res.status(400).json(
					buildErrorResponse(
						"File is required. Upload Compensation Mass Upload .xlsx as multipart field 'file'.",
						400,
					),
				);
				return;
			}
			const parsedBody = parseMultipartJsonBody(req);
			if (parsedBody.error) {
				res.status(400).json(buildErrorResponse(parsedBody.error, 400));
				return;
			}
			const organizationId = String(
				parsedBody.body?.organizationId || (req as any).organizationId || "",
			).trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("organizationId is required", 400));
				return;
			}

			const sourceFilename = uploadedFile.originalname || "compensation-mass-upload.xlsx";
			const summary = await importCompensationMassUpload({
				prisma,
				organizationId,
				buffer: uploadedFile.buffer,
				sourceFilename,
				migrationRunId: resolveMassUploadMigrationRunId(parsedBody.body, req),
				startedByUserId: getMigrationRequestUserId(req),
				persistLog: true,
			});

			const okCount = Number(summary.created || 0) + Number(summary.updated || 0);
			const failedCount = Number(summary.failed || 0);
			const userActivityMessage = `Uploaded compensation file "${sourceFilename}" — ${okCount} succeeded (${summary.created} new, ${summary.updated} updated), ${failedCount} failed`;
			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.IMPORT_MIGRATION_DATA,
				userActivityMessage,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_IMPORT,
			);
			logMigrationAudit(req, {
				auditAction: config.AUDIT_LOG.ACTIONS.CREATE,
				entityId: summary.importLogId || organizationId,
				description: userActivityMessage,
				changesAfter: {
					kind: "compensation",
					importLogId: summary.importLogId || null,
					sourceFilename,
					total: summary.total,
					created: summary.created,
					updated: summary.updated,
					failed: summary.failed,
					status: summary.status,
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Compensation mass upload imported",
					{
						summary,
						importLogId: summary.importLogId || null,
						userActivity: {
							kind: "compensation",
							message: userActivityMessage,
							importLogId: summary.importLogId || null,
						},
					},
					200,
				),
			);
		} catch (error: any) {
			migrationLogger.error(
				`DM3 compensation mass upload failed: ${error?.message || "Unknown error"}`,
				{ error },
			);
			res.status(500).json(
				buildErrorResponse(
					`Compensation mass upload failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	const importDm3DeductionMassUpload = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		armHeavyMassUploadTimeouts(req, res);
		try {
			const uploadedFile = resolveUploadedMigrationFile(req);
			if (!uploadedFile?.buffer) {
				res.status(400).json(
					buildErrorResponse(
						"File is required. Upload Deduction Mass Upload .xlsx as multipart field 'file'.",
						400,
					),
				);
				return;
			}
			const parsedBody = parseMultipartJsonBody(req);
			if (parsedBody.error) {
				res.status(400).json(buildErrorResponse(parsedBody.error, 400));
				return;
			}
			const organizationId = String(
				parsedBody.body?.organizationId || (req as any).organizationId || "",
			).trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("organizationId is required", 400));
				return;
			}

			const sourceFilename = uploadedFile.originalname || "deduction-mass-upload.xlsx";
			const summary = await importDeductionMassUpload({
				prisma,
				organizationId,
				buffer: uploadedFile.buffer,
				sourceFilename,
				migrationRunId: resolveMassUploadMigrationRunId(parsedBody.body, req),
				startedByUserId: getMigrationRequestUserId(req),
				persistLog: true,
			});

			const okCount = Number(summary.created || 0) + Number(summary.updated || 0);
			const failedCount = Number(summary.failed || 0);
			const userActivityMessage = `Uploaded deduction file "${sourceFilename}" — ${okCount} succeeded (${summary.created} new, ${summary.updated} updated), ${failedCount} failed`;
			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.IMPORT_MIGRATION_DATA,
				userActivityMessage,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_IMPORT,
			);
			logMigrationAudit(req, {
				auditAction: config.AUDIT_LOG.ACTIONS.CREATE,
				entityId: summary.importLogId || organizationId,
				description: userActivityMessage,
				changesAfter: {
					kind: "deduction",
					importLogId: summary.importLogId || null,
					sourceFilename,
					total: summary.total,
					created: summary.created,
					updated: summary.updated,
					failed: summary.failed,
					status: summary.status,
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Deduction mass upload imported",
					{
						summary,
						importLogId: summary.importLogId || null,
						userActivity: {
							kind: "deduction",
							message: userActivityMessage,
							importLogId: summary.importLogId || null,
						},
					},
					200,
				),
			);
		} catch (error: any) {
			migrationLogger.error(
				`DM3 deduction mass upload failed: ${error?.message || "Unknown error"}`,
				{ error },
			);
			res.status(500).json(
				buildErrorResponse(
					`Deduction mass upload failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	const listDm3MassUploadImports = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const organizationId = String(
				req.query.organizationId || (req as any).organizationId || "",
			).trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("organizationId is required", 400));
				return;
			}
			const kindRaw = String(req.query.kind || "").trim().toLowerCase();
			const kind =
				kindRaw === "compensation" ||
				kindRaw === "deduction" ||
				kindRaw === "workbook" ||
				kindRaw === "manpower-databank"
					? (kindRaw as
							| "compensation"
							| "deduction"
							| "workbook"
							| "manpower-databank")
					: null;
			const migrationRunId = String(req.query.migrationRunId || req.query.runId || "").trim() || null;
			const limit = Number(req.query.limit || 50);
			const result = await listMassUploadImportLogs({
				prisma,
				organizationId,
				kind,
				migrationRunId,
				limit,
			});
			res.status(200).json(
				buildSuccessResponse("Mass upload import history retrieved", result, 200),
			);
		} catch (error: any) {
			migrationLogger.error(
				`List mass upload imports failed: ${error?.message || "Unknown error"}`,
				{ error },
			);
			res.status(500).json(
				buildErrorResponse(
					`List mass upload imports failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	const getDm3MassUploadImport = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const organizationId = String(
				req.query.organizationId || (req as any).organizationId || "",
			).trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("organizationId is required", 400));
				return;
			}
			const id = String(req.params.id || "").trim();
			if (!id) {
				res.status(400).json(buildErrorResponse("import log id is required", 400));
				return;
			}
			const item = await getMassUploadImportLog({ prisma, organizationId, id });
			if (!item) {
				res.status(404).json(buildErrorResponse("Mass upload import log not found", 404));
				return;
			}
			const errors = Array.isArray(item.errorsJson) ? item.errorsJson : [];
			const results = Array.isArray(item.resultsJson) ? item.resultsJson : [];
			const summaryFromJson =
				item.summaryJson && typeof item.summaryJson === "object" ? item.summaryJson : {};
			res.status(200).json(
				buildSuccessResponse(
					"Mass upload import log retrieved",
					{
						importLog: item,
						summary: {
							kind: item.kind,
							total: item.total,
							created: item.created,
							updated: item.updated,
							skipped: item.skipped,
							failed: item.failed,
							periodCodes: item.periodCodes || [],
							errors,
							results,
							errorTotal: Number((summaryFromJson as any).errorTotal ?? errors.length),
							resultTotal: Number((summaryFromJson as any).resultTotal ?? results.length),
							errorsTruncated: Boolean(item.errorsTruncated),
							resultsTruncated: Boolean(item.resultsTruncated),
							status: item.status,
							sourceFilename: item.sourceFilename,
							importLogId: item.id,
							startedAt: item.startedAt,
							finishedAt: item.finishedAt,
						},
					},
					200,
				),
			);
		} catch (error: any) {
			migrationLogger.error(
				`Get mass upload import failed: ${error?.message || "Unknown error"}`,
				{ error },
			);
			res.status(500).json(
				buildErrorResponse(
					`Get mass upload import failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	const downloadDm3MassUploadImportReport = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const organizationId = String(
				req.query.organizationId || (req as any).organizationId || "",
			).trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("organizationId is required", 400));
				return;
			}
			const id = String(req.params.id || "").trim();
			if (!id) {
				res.status(400).json(buildErrorResponse("import log id is required", 400));
				return;
			}
			const item = await getMassUploadImportLog({ prisma, organizationId, id });
			if (!item) {
				res.status(404).json(buildErrorResponse("Mass upload import log not found", 404));
				return;
			}
			const csv = buildMassUploadReportCsv({
				kind: item.kind,
				errors: Array.isArray(item.errorsJson) ? item.errorsJson : [],
				results: Array.isArray(item.resultsJson) ? item.resultsJson : [],
			});
			const safeKind = String(item.kind || "mass-upload").replace(/[^a-z0-9_-]+/gi, "-");
			const filename = `${safeKind}-import-${id}.csv`;
			res.setHeader("Content-Type", "text/csv; charset=utf-8");
			res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
			res.status(200).send(csv);
		} catch (error: any) {
			migrationLogger.error(
				`Download mass upload report failed: ${error?.message || "Unknown error"}`,
				{ error },
			);
			res.status(500).json(
				buildErrorResponse(
					`Download mass upload report failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	const importDm3ManpowerDatabank = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const uploadedFile = resolveUploadedMigrationFile(req);
			if (!uploadedFile?.buffer) {
				res.status(400).json(
					buildErrorResponse(
						"File is required. Upload Manpower Databank .xlsx as multipart field 'file'.",
						400,
					),
				);
				return;
			}
			const parsedBody = parseMultipartJsonBody(req);
			if (parsedBody.error) {
				res.status(400).json(buildErrorResponse(parsedBody.error, 400));
				return;
			}
			const organizationId = String(
				parsedBody.body?.organizationId || (req as any).organizationId || "",
			).trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("organizationId is required", 400));
				return;
			}

			// DM-style async job: return jobId immediately and poll progress.
			const started = startManpowerDatabankImport({
				prisma,
				organizationId,
				buffer: uploadedFile.buffer,
				sourceFileName: uploadedFile.originalname || "manpower-databank.xlsx",
				migrationRunId: resolveMassUploadMigrationRunId(parsedBody.body, req),
				startedByUserId: getMigrationRequestUserId(req),
			});

			res.setHeader(
				"Location",
				`/api/migration/dm3/import-manpower-databank/progress/${started.jobId}`,
			);
			res.setHeader("Retry-After", "1");
			res.status(202).json(
				buildSuccessResponse(
					"Manpower databank import started",
					{
						jobId: started.jobId,
						message: "Import started",
					},
					202,
				),
			);
		} catch (error: any) {
			migrationLogger.error(
				`DM3 manpower databank import failed: ${error?.message || "Unknown error"}`,
				{ error },
			);
			res.status(500).json(
				buildErrorResponse(
					`Manpower databank import failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	const getDm3ManpowerDatabankProgress = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const jobId = String(req.params.jobId || "").trim();
			if (!jobId) {
				res.status(400).json(buildErrorResponse("Job ID is required", 400));
				return;
			}
			const progress = getManpowerDatabankJobProgress(jobId);
			if (!progress) {
				res.status(404).json(
					buildErrorResponse("Manpower databank import job not found or expired", 404),
				);
				return;
			}
			const payload = {
				...progress,
				startedAt: progress.startedAt?.toISOString?.() || progress.startedAt,
				completedAt: progress.completedAt?.toISOString?.() || progress.completedAt || null,
				durationMs: progress.completedAt
					? progress.completedAt.getTime() - progress.startedAt.getTime()
					: Date.now() - progress.startedAt.getTime(),
				percent:
					progress.total > 0
						? Math.min(100, Math.round((progress.processed / progress.total) * 100))
						: progress.phase === "parsing"
							? 0
							: progress.status === "completed"
								? 100
								: 0,
			};
			res.status(200).json(
				buildSuccessResponse("Manpower databank import progress loaded", { progress: payload }, 200),
			);
		} catch (error: any) {
			migrationLogger.error(
				`DM3 manpower databank progress failed: ${error?.message || "Unknown error"}`,
				{ error },
			);
			res.status(500).json(
				buildErrorResponse(
					`Manpower databank progress failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	const importDm3EmployeeBenefitsLoans = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const uploadedFile = resolveUploadedMigrationFile(req);

			if (!uploadedFile?.buffer) {
				res.status(400).json(
					buildErrorResponse(
						"File is required. Upload the DM3 Employee Benefits Loans sheet as multipart/form-data with field name 'file'.",
						400,
					),
				);
				return;
			}

			const parsedBody = parseMultipartJsonBody(req);
			if (parsedBody.error) {
				res.status(400).json(buildErrorResponse(parsedBody.error, 400));
				return;
			}
			const body = parsedBody.body || {};
			const organizationId = String(body.organizationId || (req as any).organizationId || "").trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("organizationId is required", 400));
				return;
			}

			const rows = parseFileBufferToImportRows(uploadedFile.buffer) as any[];
			const summary = {
				total: rows.length,
				created: 0,
				updated: 0,
				skipped: 0,
				failed: 0,
				errors: [] as Array<{ row: number; field?: string; message: string }>,
			};
			const employeeIds = Array.from(
				new Set(rows.map((row) => String(row.EMP_ID || "").trim()).filter(Boolean)),
			);
			const codesOrNames = Array.from(
				new Set(rows.map((row) => String(row.CODE_OR_NAME || "").trim()).filter(Boolean)),
			);
			const periodCodes = Array.from(
				new Set(rows.map((row) => String(row.PAYROLL_PERIOD_CODE || "").trim()).filter(Boolean)),
			);
			const datePairs = Array.from(
				new Map(
					rows
						.map((row) => {
							const startDate = parseDateOnlyInput(row.START_DATE);
							const endDate = parseDateOnlyInput(row.END_DATE);
							return startDate && endDate
								? [payrollPeriodDateKey(startDate, endDate), { startDate, endDate }]
								: null;
						})
						.filter(Boolean) as Array<[string, { startDate: Date; endDate: Date }]>,
				).values(),
			);
			const [employees, benefitTypes, loanTypes, payrollPeriodsByCode, payrollPeriodsByDates] = await Promise.all([
				employeeIds.length
					? prisma.employee.findMany({
							where: { organizationId, isDeleted: false, employeeId: { in: employeeIds } },
							select: { id: true, employeeId: true },
						})
					: [],
				codesOrNames.length
					? (prisma as any).benefitType.findMany({
							where: {
								organizationId,
								isDeleted: false,
								OR: [{ code: { in: codesOrNames } }, { name: { in: codesOrNames } }],
							},
							select: { id: true, code: true, name: true, defaultInstallments: true },
						})
					: [],
				codesOrNames.length
					? (prisma as any).loanType.findMany({
							where: {
								organizationId,
								isDeleted: false,
								name: { in: codesOrNames },
							},
							select: { id: true, name: true, interestRate: true, maxTermMonths: true },
						})
					: [],
				periodCodes.length
					? (prisma as any).payrollPeriod.findMany({
							where: {
								organizationId,
								isDeleted: false,
								OR: [{ code: { in: periodCodes } }, { id: { in: periodCodes } }],
							},
							select: { id: true, code: true, startDate: true, endDate: true },
						})
					: [],
				datePairs.length
					? (prisma as any).payrollPeriod.findMany({
							where: {
								organizationId,
								isDeleted: false,
								OR: datePairs.map((pair) => ({
									startDate: pair.startDate,
									endDate: pair.endDate,
								})),
							},
							select: { id: true, code: true, startDate: true, endDate: true },
						})
					: [],
			]);
			const employeesByExternalId = new Map(
				employees.map((employee: any) => [String(employee.employeeId), employee]),
			);
			const benefitTypesByKey = new Map<string, any>();
			for (const benefitType of benefitTypes as any[]) {
				[String(benefitType.id), String(benefitType.code), String(benefitType.name)]
					.filter(Boolean)
					.forEach((key) => benefitTypesByKey.set(key.trim().toUpperCase(), benefitType));
			}
			const loanTypesByKey = new Map<string, any>();
			for (const loanType of loanTypes as any[]) {
				[String(loanType.id), String(loanType.name)]
					.filter(Boolean)
					.forEach((key) => loanTypesByKey.set(key.trim().toUpperCase(), loanType));
			}
			const payrollPeriodsByKey = new Map<string, any>();
			for (const payrollPeriod of payrollPeriodsByCode as any[]) {
				[String(payrollPeriod.id), String(payrollPeriod.code)]
					.filter(Boolean)
					.forEach((key) => payrollPeriodsByKey.set(key.trim().toUpperCase(), payrollPeriod));
			}
			for (const payrollPeriod of payrollPeriodsByDates as any[]) {
				payrollPeriodsByKey.set(
					payrollPeriodDateKey(payrollPeriod.startDate, payrollPeriod.endDate),
					payrollPeriod,
				);
			}

			for (const [index, row] of rows.entries()) {
				const rowNumber = index + 2;
				const employeeExternalId = String(row.EMP_ID || "").trim();
				const entryType = String(row.TYPE || "").trim().toUpperCase();
				const codeOrName = String(row.CODE_OR_NAME || "").trim();
				if (!employeeExternalId || !entryType || !codeOrName) {
					summary.failed += 1;
					summary.errors.push({
						row: rowNumber,
						field: !employeeExternalId ? "EMP_ID" : !entryType ? "TYPE" : "CODE_OR_NAME",
						message: "EMP_ID, TYPE, and CODE_OR_NAME are required.",
					});
					continue;
				}
				const employee = employeesByExternalId.get(employeeExternalId);
				if (!employee) {
					summary.failed += 1;
					summary.errors.push({
						row: rowNumber,
						field: "EMP_ID",
						message: `Employee ${employeeExternalId} was not found.`,
					});
					continue;
				}

				const amount = parseMoneyInput(row.AMOUNT);
				const startDate = parseDateOnlyInput(row.START_DATE) || new Date();
				const installments = parsePositiveIntInput(row.INSTALLMENTS, 1);
				const endDate = parseDateOnlyInput(row.END_DATE) || addMonths(startDate, installments);
				const payrollPeriodCode = String(row.PAYROLL_PERIOD_CODE || "").trim();
				const payrollPeriod = payrollPeriodCode
					? payrollPeriodsByKey.get(payrollPeriodCode.toUpperCase())
					: payrollPeriodsByKey.get(payrollPeriodDateKey(startDate, endDate));
				if (payrollPeriodCode && !payrollPeriod) {
					summary.failed += 1;
					summary.errors.push({
						row: rowNumber,
						field: "PAYROLL_PERIOD_CODE",
						message: `Payroll period ${payrollPeriodCode} was not found.`,
					});
					continue;
				}
				const notes = String(row.NOTES || "").trim() || null;

				if (entryType === "BENEFIT") {
					const benefitType = benefitTypesByKey.get(codeOrName.toUpperCase());
					if (!benefitType) {
						summary.failed += 1;
						summary.errors.push({
							row: rowNumber,
							field: "CODE_OR_NAME",
							message: `Benefit type ${codeOrName} was not found.`,
						});
						continue;
					}
					const existing = await (prisma as any).employeeBenefit.findFirst({
						where: {
							organizationId,
							employeeId: employee.id,
							benefitTypeId: benefitType.id,
							isDeleted: false,
							...(payrollPeriod
								? { OR: [{ payrollPeriodId: payrollPeriod.id }, { startDate, endDate }] }
								: { startDate, endDate }),
						},
						select: { id: true },
					});
					const totalInstallments = installments || Number(benefitType.defaultInstallments || 1);
					const installmentAmount = totalInstallments > 0 ? amount / totalInstallments : amount;
					const payload = {
						name: benefitType.name,
						totalAmount: amount,
						totalInstallments,
						installmentAmount,
						remainingBalance: amount,
						amount,
						payrollPeriodId: payrollPeriod?.id,
						startDate,
						endDate,
						status: normalizeBenefitProgramStatus(row.STATUS) as any,
						notes,
						remarks: notes,
					};
					if (existing) {
						await (prisma as any).employeeBenefit.update({
							where: { id: existing.id },
							data: payload,
						});
						summary.updated += 1;
					} else {
						await (prisma as any).employeeBenefit.create({
							data: {
								...payload,
								organizationId,
								employeeId: employee.id,
								benefitTypeId: benefitType.id,
								currency: "PHP",
							},
						});
						summary.created += 1;
					}
					continue;
				}

				if (entryType === "LOAN") {
					const loanType = loanTypesByKey.get(codeOrName.toUpperCase());
					if (!loanType) {
						summary.failed += 1;
						summary.errors.push({
							row: rowNumber,
							field: "CODE_OR_NAME",
							message: `Loan type ${codeOrName} was not found.`,
						});
						continue;
					}
					const existing = await (prisma as any).employeeLoan.findFirst({
						where: {
							organizationId,
							employeeId: employee.id,
							loanTypeId: loanType.id,
							isDeleted: false,
						},
						select: { id: true },
					});
					const termMonths = installments || Number(loanType.maxTermMonths || 1);
					const totalAmount = amount;
					const monthlyPayment = termMonths > 0 ? totalAmount / termMonths : totalAmount;
					const payload = {
						principalAmount: amount,
						interestRate: Number(loanType.interestRate || 0),
						totalAmount,
						termMonths,
						monthlyPayment,
						startDate,
						endDate,
						balance: totalAmount,
						status: normalizeLoanStatus(row.STATUS) as any,
						notes,
					};
					if (existing) {
						await (prisma as any).employeeLoan.update({
							where: { id: existing.id },
							data: payload,
						});
						summary.updated += 1;
					} else {
						await (prisma as any).employeeLoan.create({
							data: {
								...payload,
								organizationId,
								employeeId: employee.id,
								loanTypeId: loanType.id,
							},
						});
						summary.created += 1;
					}
					continue;
				}

				summary.failed += 1;
				summary.errors.push({
					row: rowNumber,
					field: "TYPE",
					message: "TYPE must be BENEFIT or LOAN.",
				});
			}

			logDm3ImportSuccess(
				req,
				organizationId,
				uploadedFile.originalname,
				"dm3-employee-benefits-loans",
				summary,
			);

			res.status(summary.failed > 0 ? 207 : 200).json(
				buildSuccessResponse(
					summary.failed > 0
						? "DM3 employee benefit/loan import completed with issues."
						: "DM3 employee benefits/loans imported.",
					{ summary },
					summary.failed > 0 ? 207 : 200,
				),
			);
		} catch (error: any) {
			migrationLogger.error(`DM3 employee benefit/loan import failed: ${error.message}`, { error });
			res.status(500).json(
				buildErrorResponse(
					`DM3 employee benefit/loan import failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	const runDm3PostActionsJob = async (params: {
		jobId: string;
		organizationId: string;
		createdEmployees: Array<{
			employeeDbId: string;
			employeeId: string;
			personId: string;
			role: string;
			email: string | null;
			sourceRow?: number;
			sourceWorkbook?: string | null;
			sourceSheet?: string | null;
		}>;
		authToken?: string;
		actorUserId?: string;
		runId?: string;
		requestPath: string;
		missingEmployeeIds?: string[];
		recovery?: {
			sourceFilename?: string;
			sourceMatched: number;
			fallbackToAllDm3Employees: boolean;
		};
	}) => {
		const progressEvents: Dm3PostActionsJob["events"] = [];
		try {
			updateDm3PostActionsJob(params.jobId, {
				status: "running",
				message: "Employee post-actions are running.",
				processed: 0,
			});
			const postActions = await runEmployeePostActions({
				prisma,
				organizationId: params.organizationId,
				createdEmployees: params.createdEmployees,
				authToken: params.authToken,
				actorUserId: params.actorUserId,
				requestPath: params.requestPath,
				enablePostActions: true,
				enableOnboardingReconciliation: true,
				enableAttendanceObligationRefresh: false,
				strictMode: false,
				maxConcurrency: 3,
				onProgress: (progress) => {
					progressEvents.push(progress);
					if (progressEvents.length > 50) {
						progressEvents.splice(0, progressEvents.length - 50);
					}
					updateDm3PostActionsJob(params.jobId, {
						processed: Math.min(
							params.createdEmployees.length,
							Math.max(0, progressEvents.length),
						),
						events: [...progressEvents],
						message: progress.message || "Employee post-actions are running.",
					});
				},
			});
			const missingEmployeeIds = params.missingEmployeeIds || [];
			const failed = missingEmployeeIds.length + postActions.failures.length;
			const summary = {
				total: params.createdEmployees.length + missingEmployeeIds.length,
				created: postActions.summary.completed,
				updated: 0,
				skipped: missingEmployeeIds.length,
				blocked: failed,
				failed,
				postActions: postActions.summary,
				attendanceObligations: {
					owner: "DM3.2 Employee Schedule Assignments",
					message:
						"Attendance obligations are materialized when DM3.2 schedule assignments import.",
				},
				...(params.recovery ? { recovery: params.recovery } : {}),
				errors: [
					...missingEmployeeIds.slice(0, 50).map((employeeId) => ({
						row: null,
						field: "EMP_ID",
						message: `Employee ${employeeId} was not found for DM3 finalization.`,
					})),
					...postActions.failures.slice(0, 50).map((failure) => ({
						row: failure.row || null,
						field: failure.stage,
						message: `[${failure.code}] ${failure.message}`,
					})),
				],
			};

			updateDm3PostActionsJob(params.jobId, {
				status: "completed",
				finishedAt: new Date().toISOString(),
				message:
					failed > 0
						? "DM3 employee post-actions completed with issues."
						: "DM3 employee post-actions completed.",
				processed: summary.total,
				summary,
				warnings: postActions.warnings,
				events: progressEvents,
			});
			await persistDm3PostActionsRunProof({
				prisma,
				runId: params.runId,
				organizationId: params.organizationId,
				jobId: params.jobId,
				summary,
				warningsCount: postActions.warnings.length,
				failed,
				recovery: params.recovery,
			});
		} catch (error: any) {
			migrationLogger.error(`DM3 employee post-actions job failed: ${error.message}`, { error });
			updateDm3PostActionsJob(params.jobId, {
				status: "failed",
				finishedAt: new Date().toISOString(),
				message: "DM3 employee post-actions failed.",
				error: error?.message || "Unknown error",
				summary: {
					total: params.createdEmployees.length + (params.missingEmployeeIds?.length || 0),
					created: 0,
					updated: 0,
					skipped: params.missingEmployeeIds?.length || 0,
					blocked: params.createdEmployees.length,
					failed: params.createdEmployees.length,
					errors: [
						{
							row: null,
							field: "post-actions",
							message: error?.message || "DM3 employee post-actions failed",
						},
					],
				},
				events: progressEvents,
			});
			await persistDm3PostActionsRunProof({
				prisma,
				runId: params.runId,
				organizationId: params.organizationId,
				jobId: params.jobId,
				summary: {
					total: params.createdEmployees.length + (params.missingEmployeeIds?.length || 0),
					created: 0,
					skipped: params.missingEmployeeIds?.length || 0,
				},
				warningsCount: 0,
				failed: params.createdEmployees.length,
				recovery: params.recovery,
				errorMessage: error?.message || "DM3 employee post-actions failed",
			});
		}
	};

	const finalizeDm3EmployeeImport = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const file = (req as any).file as Express.Multer.File | undefined;
			const files = (req as any).files as
				| Express.Multer.File[]
				| Record<string, Express.Multer.File[]>
				| undefined;
			const uploadedFile =
				file ||
				(Array.isArray(files) ? files[0] : undefined) ||
				(files && !Array.isArray(files) ? files.file?.[0] : undefined);

			if (!uploadedFile?.buffer) {
				res.status(400).json(
					buildErrorResponse(
						"File is required. Upload the DM3 Employees sheet as multipart/form-data with field name 'file'.",
						400,
					),
				);
				return;
			}

			const parsedBody = parseMultipartJsonBody(req);
			if (parsedBody.error) {
				res.status(400).json(buildErrorResponse(parsedBody.error, 400));
				return;
			}
			const body = parsedBody.body || {};
			const organizationId = String(body.organizationId || (req as any).organizationId || "").trim();
			const runId = String(body.runId || "").trim() || undefined;
			const authToken = req.headers.authorization?.split(" ")[1];
			const actorUserId = String((req as any).userId || (req as any).user?.id || "").trim() || undefined;
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("organizationId is required", 400));
				return;
			}

			const rows = parseFileBufferToImportRows(uploadedFile.buffer) as any[];
			const employeeIds = Array.from(
				new Set(rows.map((row) => String(row.EMP_ID || "").trim()).filter(Boolean)),
			);
			const employees = employeeIds.length
				? await prisma.employee.findMany({
						where: {
							organizationId,
							isDeleted: false,
							employeeId: { in: employeeIds },
						},
						select: {
							id: true,
							employeeId: true,
							personId: true,
							role: true,
							userId: true,
							person: {
								select: {
									contactInfo: true,
								},
							},
						},
					})
				: [];
			const employeesByExternalId = new Map(
				employees.map((employee: any) => [String(employee.employeeId), employee]),
			);
			const missingEmployeeIds = employeeIds.filter(
				(employeeId) => !employeesByExternalId.has(employeeId),
			);
			const createdEmployees = rows
				.map((row, index) => {
					const employeeExternalId = String(row.EMP_ID || "").trim();
					const employee = employeesByExternalId.get(employeeExternalId);
					if (!employee?.id || !employee?.personId) return null;
					const contactInfo =
						employee.person?.contactInfo && typeof employee.person.contactInfo === "object"
							? (employee.person.contactInfo as Record<string, any>)
							: {};
					return {
						employeeDbId: employee.id,
						employeeId: employee.employeeId,
						personId: employee.personId,
						role: employee.role,
						email: String(contactInfo.email || row.EMAIL || "").trim() || null,
						sourceRow: index + 2,
						sourceWorkbook: uploadedFile.originalname,
						sourceSheet: "Employees",
					};
				})
				.filter(Boolean) as Array<{
					employeeDbId: string;
					employeeId: string;
					personId: string;
					role: string;
					email: string | null;
					sourceRow: number;
					sourceWorkbook: string;
					sourceSheet: string;
				}>;

			pruneDm3PostActionsJobs();
			const jobId = createDm3PostActionsJobId();
			const job: Dm3PostActionsJob = {
				id: jobId,
				status: "queued",
				mode: "finalize",
				startedAt: new Date().toISOString(),
				message: "DM3 employee post-actions queued.",
				organizationId,
				sourceFilename: uploadedFile.originalname,
				total: rows.length,
				processed: 0,
				events: [],
			};
			dm3PostActionsJobs.set(jobId, job);
			void runDm3PostActionsJob({
				jobId,
				organizationId,
				createdEmployees,
				authToken,
				actorUserId,
				runId,
				requestPath: "/api/migration/dm3/finalize-employee-import",
				missingEmployeeIds,
			});

			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.IMPORT_MIGRATION_DATA,
				`${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_DATA_IMPORTED}: DM3 employee finalization queued`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_IMPORT,
			);
			logMigrationAudit(req, {
				auditAction: config.AUDIT_LOG.ACTIONS.CREATE,
				entityId: organizationId,
				description: `${config.AUDIT_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_DATA_IMPORTED}: DM3 employee finalization`,
				changesAfter: {
					organizationId,
					runId: runId || null,
					sourceId: uploadedFile.originalname,
					jobId,
					summary: {
						total: rows.length,
						queued: createdEmployees.length,
						missing: missingEmployeeIds.length,
					},
				},
			});

			res.setHeader("Location", `/api/migration/dm3/employee-post-actions/jobs/${jobId}`);
			res.setHeader("Retry-After", "2");
			res.status(202).json(
				buildSuccessResponse(
					"DM3 employee post-actions queued. Poll the job status before marking DM3 complete.",
					{
						jobId,
						job,
						statusUrl: `/api/migration/dm3/employee-post-actions/jobs/${jobId}`,
					},
					202,
				),
			);
		} catch (error: any) {
			migrationLogger.error(`DM3 employee finalization failed: ${error.message}`, { error });
			res.status(500).json(
				buildErrorResponse(
					`DM3 employee finalization failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	const recoverDm3EmployeePostActions = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const body = req.body || {};
			const organizationId = String(body.organizationId || (req as any).organizationId || "").trim();
			const sourceFilename = String(body.sourceFilename || "").trim() || undefined;
			const runId = String(body.runId || "").trim() || undefined;
			const authToken = req.headers.authorization?.split(" ")[1];
			const actorUserId =
				String((req as any).userId || (req as any).user?.id || "").trim() || undefined;

			if (!organizationId) {
				res.status(400).json(buildErrorResponse("organizationId is required", 400));
				return;
			}

			const employees = (await prisma.employee.findMany({
				where: {
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					employeeId: true,
					personId: true,
					role: true,
					userId: true,
					metadata: true,
					person: {
						select: {
							contactInfo: true,
							metadata: true,
						},
					},
				},
				orderBy: { employeeId: "asc" },
			})) as Dm3RecoveryEmployee[];

			const dm3Employees = employees.filter(isDm3EmployeeMasterRecord);
			const sourceMatchedEmployees = dm3Employees.filter((employee) =>
				matchesDm3RecoverySource(employee, sourceFilename),
			);
			const recoveryEmployees =
				sourceFilename && sourceMatchedEmployees.length === 0
					? dm3Employees
					: sourceMatchedEmployees;
			const createdEmployees = buildDm3PostActionInputs(recoveryEmployees);

			if (createdEmployees.length === 0) {
				res.status(404).json(
					buildErrorResponse(
						"Could not find DM3 employee master records to recover. Re-upload the DM3 workbook so the Employees sheet can be used as recovery evidence.",
						404,
					),
				);
				return;
			}

			pruneDm3PostActionsJobs();
			const jobId = createDm3PostActionsJobId();
			const job: Dm3PostActionsJob = {
				id: jobId,
				status: "queued",
				mode: "recover",
				startedAt: new Date().toISOString(),
				message: "DM3 employee post-action recovery queued.",
				organizationId,
				sourceFilename: sourceFilename || null,
				total: createdEmployees.length,
				processed: 0,
				events: [],
			};
			dm3PostActionsJobs.set(jobId, job);
			void runDm3PostActionsJob({
				jobId,
				organizationId,
				createdEmployees,
				authToken,
				actorUserId,
				runId,
				requestPath: "/api/migration/dm3/recover-employee-post-actions",
				recovery: {
					sourceFilename,
					sourceMatched: sourceMatchedEmployees.length,
					fallbackToAllDm3Employees:
						Boolean(sourceFilename) && sourceMatchedEmployees.length === 0,
				},
			});

			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.RECOVER_MIGRATION_RUN,
				`${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_RUN_RECOVERED}: DM3 employee post-actions`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_RUN,
			);
			logMigrationAudit(req, {
				auditAction: config.AUDIT_LOG.ACTIONS.UPDATE,
				entityId: organizationId,
				description: `${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_RUN_RECOVERED}: DM3 employee post-actions`,
				changesAfter: {
					organizationId,
					runId: runId || null,
					sourceId: sourceFilename || null,
					jobId,
					summary: {
						total: createdEmployees.length,
						sourceMatched: sourceMatchedEmployees.length,
						fallbackToAllDm3Employees:
							Boolean(sourceFilename) && sourceMatchedEmployees.length === 0,
					},
				},
			});

			res.setHeader("Location", `/api/migration/dm3/employee-post-actions/jobs/${jobId}`);
			res.setHeader("Retry-After", "2");
			res.status(202).json(
				buildSuccessResponse(
					"DM3 employee post-action recovery queued.",
					{
						jobId,
						job,
						statusUrl: `/api/migration/dm3/employee-post-actions/jobs/${jobId}`,
					},
					202,
				),
			);
		} catch (error: any) {
			migrationLogger.error(`DM3 employee post-action recovery failed: ${error.message}`, {
				error,
			});
			res.status(500).json(
				buildErrorResponse(
					`DM3 employee post-action recovery failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	const getDm3EmployeePostActionsJob = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		pruneDm3PostActionsJobs();
		const jobId = String(req.params.jobId || "").trim();
		const job = dm3PostActionsJobs.get(jobId);
		if (!job) {
			res.status(404).json(buildErrorResponse("DM3 employee post-actions job was not found.", 404));
			return;
		}
		if (job.status === "running") {
			job.message =
				job.message ||
				`DM3 employee post-actions are running for ${getElapsedSeconds(job.startedAt)}s.`;
			dm3PostActionsJobs.set(jobId, job);
		}
		res.status(200).json(
			buildSuccessResponse("DM3 employee post-actions job status loaded.", { job }, 200),
		);
	};

	const workbookAudit = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const body = req.body || {};
			const event = String(body.event || "").trim();
			const runId = String(body.runId || "").trim();
			const workbookId = String(body.workbookId || "").trim();
			const workbookName = String(body.workbookName || "").trim();
			const sourceFilename = String(body.sourceFilename || "").trim();
			const organizationId =
				String(body.organizationId || (req as any).organizationId || "").trim() ||
				undefined;
			const actorUserId =
				String((req as any).userId || (req as any).user?.id || body.actorUserId || "").trim() ||
				undefined;

			if (!event || !runId || !workbookId) {
				const errorResponse = buildErrorResponse(
					"event, runId, and workbookId are required for workbook audit logging.",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			const safeSheet = body.sheet
				? {
						sheetName: body.sheet.sheetName,
						target: body.sheet.target,
						status: body.sheet.status,
						jobId: body.sheet.jobId,
						totalRows: Number(body.sheet.totalRows || 0),
						created: Number(body.sheet.created || 0),
						updated: Number(body.sheet.updated || 0),
						skipped: Number(body.sheet.skipped || 0),
						blocked: Number(body.sheet.blocked || 0),
						failed: Number(body.sheet.failed || 0),
						elapsedMs: Number(body.sheet.elapsedMs || 0),
						firstError: body.sheet.firstError,
						errorCount: Number(body.sheet.errorCount || 0),
					}
				: undefined;
			const report = sanitizeWorkbookReport({
				...body,
				actorUserId,
				organizationId,
			});

			migrationLogger.info("Workbook migration audit event", {
				event,
				runId,
				workbookId,
				workbookName,
				sourceFilename,
				organizationId,
				actorUserId,
				status: body.status,
				startedAt: body.startedAt,
				finishedAt: body.finishedAt,
				elapsedMs: body.elapsedMs,
				totals: body.totals,
				sheet: safeSheet,
			});

			await (prisma as any).auditLogging.create({
				data: {
					employeeId: null,
					type: WORKBOOK_AUDIT_TYPE,
					severity:
						event === "end" && ["failed", "blocked"].includes(String(body.status))
							? "HIGH"
							: "LOW",
					entity: {
						type: "MigrationWorkbookImport",
						id: FALLBACK_AUDIT_ENTITY_ID,
					},
					changes: undefined,
					metadata: {
						userAgent: req.get("User-Agent") || "unknown",
						ip:
							req.ip ||
							req.get("x-forwarded-for") ||
							req.socket.remoteAddress ||
							"unknown",
						path: req.originalUrl,
						method: req.method,
					},
					description: `Workbook migration ${event}: ${workbookId}`,
					payload: {
						resource: WORKBOOK_AUDIT_RESOURCE,
						event,
						runId,
						workbookId,
						workbookName,
						sourceFilename,
						organizationId,
						actorUserId,
						status: body.status,
						startedAt: body.startedAt,
						finishedAt: body.finishedAt,
						elapsedMs: body.elapsedMs,
						totals: body.totals,
						sheet: safeSheet,
						report,
					},
				},
			});

			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.IMPORT_MIGRATION_DATA,
				`Workbook migration audit ${event}: ${workbookId}`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_IMPORT,
			);
			logMigrationAudit(req, {
				auditAction: config.AUDIT_LOG.ACTIONS.UPDATE,
				entityId: runId,
				description: `Workbook migration ${event}: ${workbookId}`,
				changesAfter: {
					runId,
					workbookId,
					workbookName: workbookName || null,
					sourceId: sourceFilename || null,
					organizationId: organizationId || null,
					event,
					status: body.status || null,
					totals: body.totals || null,
					sheet: safeSheet || null,
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Workbook migration audit event logged.",
					{ logged: true, runId, event },
					200,
				),
			);
		} catch (error: any) {
			migrationLogger.error(`Workbook audit logging failed: ${error.message}`, { error });
			const errorResponse = buildErrorResponse("Workbook audit logging failed", 500);
			res.status(500).json(errorResponse);
		}
	};

	const getWorkbookAuditLatest = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId =
				String(req.query.organizationId || (req as any).organizationId || "").trim() ||
				undefined;
			const limit = Math.min(Math.max(Number(req.query.limit || 250), 1), 500);
			const records = await (prisma as any).auditLogging.findMany({
				where: {
					type: WORKBOOK_AUDIT_TYPE,
					isDeleted: false,
				},
				orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }],
				take: limit,
			});
			const latestRunByWorkbook: Record<string, { runId: string; timeMs: number }> = {};
			for (const record of records) {
				const payload = getAuditPayload(record);
				if (payload.resource !== WORKBOOK_AUDIT_RESOURCE) continue;
				const report = sanitizeWorkbookReport(payload.report || payload);
				if (!report.workbookId || !report.runId) continue;
				if (organizationId && report.organizationId && report.organizationId !== organizationId) {
					continue;
				}
				const timeMs = getRecordTimeMs(record);
				const current = latestRunByWorkbook[report.workbookId];
				if (!current || timeMs > current.timeMs) {
					latestRunByWorkbook[report.workbookId] = { runId: report.runId, timeMs };
				}
			}

			const byWorkbook: Record<string, any> = {};
			const reports: any[] = [];

			for (const record of records) {
				const payload = getAuditPayload(record);
				if (payload.resource !== WORKBOOK_AUDIT_RESOURCE) continue;
				const report = sanitizeWorkbookReport(payload.report || payload);
				if (!report.workbookId || !report.runId) continue;
				if (organizationId && report.organizationId && report.organizationId !== organizationId) {
					continue;
				}
				if (latestRunByWorkbook[report.workbookId]?.runId !== report.runId) continue;
				byWorkbook[report.workbookId] = byWorkbook[report.workbookId]
					? mergeWorkbookReports(byWorkbook[report.workbookId], report)
					: report;
			}

			for (const report of Object.values(byWorkbook)) {
				reports.push(normalizeWorkbookReportAvailability(report));
			}
			for (const report of reports) {
				byWorkbook[report.workbookId] = report;
			}

			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.GET_MIGRATION_STATS,
				`${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_STATS_RETRIEVED}: workbook audit reports`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_STATS,
			);

			res.status(200).json(
				buildSuccessResponse(
					"Workbook migration audit reports retrieved.",
					{ reports, byWorkbook },
					200,
				),
			);
		} catch (error: any) {
			migrationLogger.error(`Workbook audit reports failed: ${error.message}`, { error });
			const errorResponse = buildErrorResponse("Workbook audit reports failed", 500);
			res.status(500).json(errorResponse);
		}
	};

	const downloadWorkbookTemplate = async (req: Request, res: Response, _next: NextFunction) => {
		const fileName = String(req.params.fileName || "").trim();

		if (!WORKBOOK_TEMPLATE_FILES.has(fileName)) {
			const errorResponse = buildErrorResponse("Unknown workbook template.", 404);
			res.status(404).json(errorResponse);
			return;
		}

		const candidates = [
			path.resolve(process.cwd(), "..", "data", "import", fileName),
			path.resolve(process.cwd(), "data", "import", fileName),
		];
		let filePath = candidates.find((candidate) => fs.existsSync(candidate));

		if (filePath && isWorkbookTemplateStale(filePath, fileName)) {
			migrationLogger.info(`Workbook template is stale; regenerating ${fileName}`);
			filePath = undefined;
		}

		if (!filePath) {
			const generatorPath = path.resolve(
				process.cwd(),
				"scripts",
				"create-dm-migration-workbooks.cjs",
			);
			if (fs.existsSync(generatorPath)) {
				try {
					await execFileAsync(process.execPath, [generatorPath], {
						cwd: process.cwd(),
						maxBuffer: 1024 * 1024 * 20,
						windowsHide: true,
					});
					filePath = candidates.find((candidate) => fs.existsSync(candidate));
				} catch (error: any) {
					migrationLogger.error(
						`Workbook template generation failed: ${error.message}`,
						{ error },
					);
				}
			}
		}

		if (!filePath) {
			const errorResponse = buildErrorResponse("Workbook template file was not found.", 404);
			res.status(404).json(errorResponse);
			return;
		}

		logMigrationActivity(
			req,
			config.ACTIVITY_LOG.MIGRATION.ACTIONS.GET_MIGRATION_STATS,
			`Downloaded workbook template: ${fileName}`,
			config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_STATS,
		);

		res.download(filePath, fileName);
	};

	const getSourceInputs = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const phase = String(req.query.phase || "").trim().toLowerCase();
			const items = getExpandedSourceInputPayloads().filter(
				(item) => !phase || String(item.dmPhase || "").toLowerCase() === phase,
			);

			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.GET_MIGRATION_STATS,
				`${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_STATS_RETRIEVED}: source inputs`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_STATS,
			);

			res.status(200).json(
				buildSuccessResponse(
					"Migration source inputs loaded.",
					{ items, manifest: SOURCE_INPUT_MANIFEST_FILE },
					200,
				),
			);
		} catch (error: any) {
			migrationLogger.error(`Migration source input manifest failed: ${error.message}`, { error });
			res.status(500).json(buildErrorResponse("Migration source inputs failed.", 500));
		}
	};

	const downloadSourceInput = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const sourceId = String(req.params.sourceId || "").trim();
			const resolved = resolveSourceInputDownloadPath(sourceId);
			if (resolved.blocked) {
				res.status(403).json(buildErrorResponse("Migration source input is not downloadable.", 403));
				return;
			}
			if (!resolved.sourcePath) {
				res.status(404).json(buildErrorResponse("Unknown migration source input.", 404));
				return;
			}
			const sourcePath = resolved.sourcePath;
			if (!sourcePath || !fs.existsSync(sourcePath) || fs.statSync(sourcePath).isDirectory()) {
				res.status(404).json(buildErrorResponse("Migration source file was not found.", 404));
				return;
			}

			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.GET_MIGRATION_STATS,
				`Downloaded migration source input: ${sourceId}`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_STATS,
			);

			res.download(sourcePath, path.basename(sourcePath));
		} catch (error: any) {
			migrationLogger.error(`Migration source input download failed: ${error.message}`, { error });
			res.status(500).json(buildErrorResponse("Migration source input download failed.", 500));
		}
	};

	const getUploadedMigrationFiles = (req: Request): Express.Multer.File[] => {
		const file = (req as any).file as Express.Multer.File | undefined;
		const files = (req as any).files as
			| Express.Multer.File[]
			| Record<string, Express.Multer.File[]>
			| undefined;
		if (file) return [file];
		if (Array.isArray(files)) return files;
		if (files && typeof files === "object") {
			return Object.values(files).flat();
		}
		return [];
	};

	const parseMigrationRunBody = (req: Request) => {
		const parsedBody = parseMultipartJsonBody(req);
		if (parsedBody.error) {
			const error = new Error(parsedBody.error) as Error & { statusCode?: number };
			error.statusCode = 400;
			throw error;
		}
		const body = parsedBody.body || {};
		const workbookId = String(body.workbookId || body.stage || body.workbook || "").toLowerCase();
		const organizationId = String(body.organizationId || (req as any).organizationId || "").trim();
		const actorUserId =
			String((req as any).userId || (req as any).user?.id || body.actorUserId || "").trim() ||
			undefined;
		const sourceFiles = Array.isArray(body.sourceFiles)
			? body.sourceFiles.map((entry: any) =>
					typeof entry === "string" ? { path: entry } : entry,
				)
			: [];
		return {
			organizationId,
			workbookId,
			idempotencyKey: String(body.idempotencyKey || "").trim() || undefined,
			sourceFilename: String(body.sourceFilename || "").trim() || undefined,
			sourceFiles,
			options: body.options && typeof body.options === "object" ? body.options : body,
			actorUserId,
			authToken: req.headers.authorization?.split(" ")[1],
			files: getUploadedMigrationFiles(req),
		};
	};

	const validateMigrationRunRequest = (request: any, requireIdempotencyKey: boolean) => {
		if (!request.organizationId) {
			return buildErrorResponse("organizationId is required.", 400);
		}
		if (!["dm3", "dm4"].includes(request.workbookId)) {
			return buildErrorResponse("workbookId must be dm3 or dm4.", 400);
		}
		if (requireIdempotencyKey && !request.idempotencyKey) {
			return buildErrorResponse("idempotencyKey is required for migration runs.", 400);
		}
		return null;
	};

	const dryRunMigrationRun = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const request = parseMigrationRunBody(req) as any;
			const validationError = validateMigrationRunRequest(request, false);
			if (validationError) {
				res.status(400).json(validationError);
				return;
			}
			const run = await migrationRunService.dryRun(request);
			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.DRY_RUN_MIGRATION,
				`${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_DRY_RUN}: ${request.workbookId}`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_DRY_RUN,
			);
			logMigrationAudit(req, {
				auditAction: config.AUDIT_LOG.ACTIONS.UPDATE,
				entityId: run.id,
				description: `${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_DRY_RUN}: ${request.workbookId}`,
				changesAfter: {
					runId: run.id,
					organizationId: request.organizationId,
					workbookId: request.workbookId,
					sourceId: request.sourceFilename || null,
					status: run.status,
					summary: run.summary || null,
				},
			});
			res.status(200).json(buildSuccessResponse("Migration dry-run completed.", { run }, 200));
		} catch (error: any) {
			migrationLogger.error(`Migration run dry-run failed: ${error.message}`, { error });
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(error?.message || "Migration dry-run failed.", error?.statusCode || 500),
			);
		}
	};

	const startMigrationRun = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const request = parseMigrationRunBody(req) as any;
			const validationError = validateMigrationRunRequest(request, true);
			if (validationError) {
				res.status(400).json(validationError);
				return;
			}
			const run = await migrationRunService.startRun(request);
			const statusUrl = `/api/migration/runs/${run.id}`;
			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.START_MIGRATION_RUN,
				`${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_RUN_STARTED}: ${request.workbookId}`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_RUN,
			);
			logMigrationAudit(req, {
				auditAction: config.AUDIT_LOG.ACTIONS.CREATE,
				entityId: run.id,
				description: `${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_RUN_STARTED}: ${request.workbookId}`,
				changesAfter: {
					runId: run.id,
					organizationId: request.organizationId,
					workbookId: request.workbookId,
					sourceId: request.sourceFilename || null,
					idempotencyKey: request.idempotencyKey || null,
					status: run.status,
				},
			});
			res.setHeader("Location", statusUrl);
			res.setHeader("Retry-After", "2");
			res.status(202).json(
				buildSuccessResponse(
					"Migration run accepted.",
					{ runId: run.id, jobId: run.id, statusUrl, retryAfterSeconds: 2, run },
					202,
				),
			);
		} catch (error: any) {
			migrationLogger.error(`Migration run start failed: ${error.message}`, { error });
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(error?.message || "Migration run start failed.", error?.statusCode || 500),
			);
		}
	};

	const getMigrationRun = async (req: Request, res: Response, _next: NextFunction) => {
		const run = await migrationRunService.getRun(String(req.params.runId || ""));
		if (!run) {
			res.status(404).json(buildErrorResponse("Migration run was not found.", 404));
			return;
		}
		logMigrationActivity(
			req,
			config.ACTIVITY_LOG.MIGRATION.ACTIONS.GET_MIGRATION_STATS,
			`Retrieved migration run: ${run.id}`,
			config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_RUN,
		);
		res.status(200).json(buildSuccessResponse("Migration run loaded.", { run }, 200));
	};

	const getMigrationRunProgress = async (req: Request, res: Response, _next: NextFunction) => {
		const progress = await migrationRunService.getProgress(String(req.params.runId || ""));
		if (!progress) {
			res.status(404).json(buildErrorResponse("Migration run was not found.", 404));
			return;
		}
		res.status(200).json(buildSuccessResponse("Migration run progress loaded.", { progress }, 200));
	};

	const getActiveMigrationRun = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = String(req.query.organizationId || (req as any).organizationId || "").trim();
		const workbookId = String(req.query.workbookId || req.query.workbook || "").toLowerCase() as any;
		if (!organizationId || !["dm3", "dm4"].includes(workbookId)) {
			res.status(400).json(buildErrorResponse("organizationId and workbookId are required.", 400));
			return;
		}
		const run = await migrationRunService.findActiveRun(organizationId, workbookId);
		res.status(200).json(buildSuccessResponse("Active migration run checked.", { run }, 200));
	};

	const getLatestMigrationRun = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = String(req.query.organizationId || (req as any).organizationId || "").trim();
		const workbookId = String(req.query.workbookId || req.query.workbook || "").toLowerCase() as any;
		const includeDryRun = String(req.query.includeDryRun || "").toLowerCase() === "true";
		if (!organizationId || !["dm3", "dm4"].includes(workbookId)) {
			res.status(400).json(buildErrorResponse("organizationId and workbookId are required.", 400));
			return;
		}
		const run = await migrationRunService.findLatestRun(organizationId, workbookId, { includeDryRun });
		logMigrationActivity(
			req,
			config.ACTIVITY_LOG.MIGRATION.ACTIONS.GET_MIGRATION_STATS,
			`Retrieved latest migration run: ${workbookId}`,
			config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_RUN,
		);
		res.status(200).json(buildSuccessResponse("Latest migration run loaded.", { run }, 200));
	};

	const getMigrationRunEvents = async (req: Request, res: Response, _next: NextFunction) => {
		const limit = Number(req.query.limit || 500);
		const runId = String(req.params.runId || "");
		const events = await migrationRunService.getEvents(runId, limit);
		logMigrationActivity(
			req,
			config.ACTIVITY_LOG.MIGRATION.ACTIONS.GET_MIGRATION_STATS,
			`Retrieved migration run events: ${runId}`,
			config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_RUN,
		);
		res.status(200).json(buildSuccessResponse("Migration run events loaded.", { events }, 200));
	};

	const downloadMigrationRunReconciliationReport = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const report = await migrationReconciliationReportService.generateRunReport(
				String(req.params.runId || ""),
			);
			if (!report) {
				res.status(404).json(buildErrorResponse("Migration run was not found.", 404));
				return;
			}
			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.GET_MIGRATION_STATS,
				`Downloaded migration reconciliation report: ${req.params.runId}`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_RUN,
			);

			res.setHeader(
				"Content-Type",
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			);
			res.setHeader("Content-Disposition", `attachment; filename="${report.fileName}"`);
			res.status(200).send(report.buffer);
		} catch (error: any) {
			migrationLogger.error(`Migration reconciliation report failed: ${error.message}`, { error });
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(
					error?.message || "Migration reconciliation report failed.",
					error?.statusCode || 500,
				),
			);
		}
	};

	const recoverMigrationRun = async (req: Request, res: Response, _next: NextFunction) => {
		const actorUserId = String((req as any).userId || (req as any).user?.id || "").trim() || undefined;
		const run = await migrationRunService.recover(String(req.params.runId || ""), actorUserId);
		if (!run) {
			res.status(404).json(buildErrorResponse("Migration run was not found.", 404));
			return;
		}
		logMigrationActivity(
			req,
			config.ACTIVITY_LOG.MIGRATION.ACTIONS.RECOVER_MIGRATION_RUN,
			`${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_RUN_RECOVERED}: ${run.id}`,
			config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_RUN,
		);
		logMigrationAudit(req, {
			auditAction: config.AUDIT_LOG.ACTIONS.UPDATE,
			entityId: run.id,
			description: `${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_RUN_RECOVERED}: ${run.id}`,
			changesAfter: {
				runId: run.id,
				organizationId: run.organizationId,
				workbookId: run.workbookId,
				status: run.status,
			},
		});

		res.status(202).json(
			buildSuccessResponse(
				"Migration run recovery queued.",
				{ runId: run.id, jobId: run.id, statusUrl: `/api/migration/runs/${run.id}`, retryAfterSeconds: 2, run },
				202,
			),
		);
	};

	const rerunMigrationRun = async (req: Request, res: Response, _next: NextFunction) => {
		const actorUserId = String((req as any).userId || (req as any).user?.id || "").trim() || undefined;
		const run = await migrationRunService.rerun(String(req.params.runId || ""), actorUserId);
		if (!run) {
			res.status(404).json(buildErrorResponse("Migration run was not found.", 404));
			return;
		}
		logMigrationActivity(
			req,
			config.ACTIVITY_LOG.MIGRATION.ACTIONS.RERUN_MIGRATION_RUN,
			`${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_RUN_RERUN}: ${run.id}`,
			config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_RUN,
		);
		logMigrationAudit(req, {
			auditAction: config.AUDIT_LOG.ACTIONS.UPDATE,
			entityId: run.id,
			description: `${config.ACTIVITY_LOG.MIGRATION.DESCRIPTIONS.MIGRATION_RUN_RERUN}: ${run.id}`,
			changesAfter: {
				runId: run.id,
				organizationId: run.organizationId,
				workbookId: run.workbookId,
				status: run.status,
			},
		});

		res.status(202).json(
			buildSuccessResponse(
				"Migration rerun created.",
				{ runId: run.id, jobId: run.id, statusUrl: `/api/migration/runs/${run.id}`, retryAfterSeconds: 2, run },
				202,
			),
		);
	};

	const uploadDm4SourceWorkbooks = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const anyFiles = ((req as any).files || []) as Express.Multer.File[];
			const uploadedFiles = [
				...(((req as any).file ? [(req as any).file] : []) as Express.Multer.File[]),
				...(Array.isArray(anyFiles) ? anyFiles : []),
			].filter((file) => file?.buffer && file.originalname);

			if (uploadedFiles.length === 0) {
				res.status(400).json(
					buildErrorResponse(
						"At least one .xlsx/.xls biometrics workbook is required. Use multipart field 'files' or 'file'.",
						400,
						[{ field: "files", message: "No workbook files were uploaded." }],
					),
				);
				return;
			}

			const organizationId =
				String((req as any).organizationId || req.body?.organizationId || "org").trim() ||
				"org";
			const stamp = new Date().toISOString().replace(/[:.]/g, "-");
			const uploadDir = resolveRepoPath(
				".runtime",
				"dm4-uploads",
				organizationId,
				stamp,
			);
			fs.mkdirSync(uploadDir, { recursive: true });

			const savedDisplayPaths: string[] = [];
			const rejected: string[] = [];
			for (const file of uploadedFiles) {
				const original = String(file.originalname || "workbook.xlsx").trim();
				const lower = original.toLowerCase();
				if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
					rejected.push(original);
					continue;
				}
				if (path.basename(original).startsWith("~$")) {
					rejected.push(original);
					continue;
				}
				const safeName = path
					.basename(original)
					.replace(/[<>:"|?*\u0000-\u001f]/g, "_")
					.replace(/\s+/g, " ")
					.trim();
				const dest = path.join(uploadDir, safeName || `workbook-${savedDisplayPaths.length + 1}.xlsx`);
				fs.writeFileSync(dest, file.buffer);
				savedDisplayPaths.push(toRepoDisplayPath(dest));
			}

			if (savedDisplayPaths.length === 0) {
				res.status(400).json(
					buildErrorResponse(
						"No valid .xlsx/.xls workbook files were uploaded.",
						400,
						[
							{
								field: "files",
								message:
									rejected.length > 0
										? `Rejected: ${rejected.slice(0, 5).join(", ")}`
										: "Upload at least one Excel workbook.",
							},
						],
					),
				);
				return;
			}

			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.GET_MIGRATION_STATS,
				`Uploaded DM4 source workbooks: ${savedDisplayPaths.length} files`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_STATS,
			);

			res.status(200).json(
				buildSuccessResponse(
					`Uploaded ${savedDisplayPaths.length} DM4 source workbook${savedDisplayPaths.length === 1 ? "" : "s"}.`,
					{
						sourceWorkbookFiles: savedDisplayPaths,
						sourceWorkbookCount: savedDisplayPaths.length,
						rejected,
						uploadDir: toRepoDisplayPath(uploadDir),
					},
					200,
				),
			);
		} catch (error: any) {
			migrationLogger.error(`DM4 source workbook upload failed: ${error.message}`, { error });
			res.status(500).json(
				buildErrorResponse(
					`DM4 source workbook upload failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	const resolveDm4SourceWorkbooks = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const rawSourceFiles = Array.isArray(req.body?.sourceFiles)
				? req.body.sourceFiles
				: typeof req.body?.sourceFiles === "string"
					? req.body.sourceFiles.split(/\r?\n|;/)
					: [];
			const sourceResolution = resolveDm4SourceFiles(rawSourceFiles);
			const invalidSource = sourceResolution.invalid[0];
			if (invalidSource) {
				res.status(400).json(
					buildErrorResponse(
						"DM4 source entries must be .xlsx/.xls workbook files or folders containing workbook files.",
						400,
						[{ field: "sourceFiles", message: `Invalid workbook file or folder: ${invalidSource}` }],
					),
				);
				return;
			}
			const missingSource = sourceResolution.missing[0];
			if (missingSource) {
				res.status(400).json(
					buildErrorResponse("DM4 source workbook file or folder was not found.", 400, [
						{ field: "sourceFiles", message: `Missing workbook file or folder: ${missingSource}` },
					]),
				);
				return;
			}
			const emptyDirectory = sourceResolution.emptyDirectories[0];
			if (sourceResolution.resolvedInputs.length > 0 && sourceResolution.workbookFiles.length === 0) {
				res.status(400).json(
					buildErrorResponse("DM4 source folder did not contain any .xlsx/.xls workbook files.", 400, [
						{
							field: "sourceFiles",
							message: emptyDirectory
								? `No workbook files found in folder: ${emptyDirectory}`
								: "No workbook files were resolved from the supplied source entries.",
						},
					]),
				);
				return;
			}

			const sourceWorkbookFiles = sourceResolution.workbookFiles.map(toRepoDisplayPath);
			logMigrationActivity(
				req,
				config.ACTIVITY_LOG.MIGRATION.ACTIONS.GET_MIGRATION_STATS,
				`Resolved DM4 source workbooks: ${sourceWorkbookFiles.length} files`,
				config.ACTIVITY_LOG.MIGRATION.PAGES.MIGRATION_STATS,
			);

			res.status(200).json(
				buildSuccessResponse(
					"DM4 source workbooks resolved.",
					{
						sourceFiles: sourceResolution.resolvedInputs.map(toRepoDisplayPath),
						sourceWorkbookFiles,
						sourceWorkbookCount: sourceWorkbookFiles.length,
					},
					200,
				),
			);
		} catch (error: any) {
			migrationLogger.error(`DM4 source workbook resolution failed: ${error.message}`, { error });
			res.status(500).json(
				buildErrorResponse(
					`DM4 source workbook resolution failed: ${error?.message || "Unknown error"}`,
					500,
				),
			);
		}
	};

	return {
		execute,
		dryRun,
		stats,
		hierarchy,
		testCredentialsEmail,
		uploadCsv,
		extractSources,
		transformSources,
		importDm3EmployeeSchedules,
		importDm3ReportingLines,
		importDm3EmployeeDocuments,
		importDm3OpeningLeaveBalances,
		importDm3EmployeeBenefitsLoans,
		importDm3CompensationMassUpload,
		importDm3DeductionMassUpload,
		listDm3MassUploadImports,
		getDm3MassUploadImport,
		downloadDm3MassUploadImportReport,
		importDm3ManpowerDatabank,
		getDm3ManpowerDatabankProgress,
		finalizeDm3EmployeeImport,
		recoverDm3EmployeePostActions,
		getDm3EmployeePostActionsJob,
		workbookAudit,
		getWorkbookAuditLatest,
		downloadWorkbookTemplate,
		getSourceInputs,
		downloadSourceInput,
		dryRunMigrationRun,
		startMigrationRun,
		getMigrationRun,
		getMigrationRunProgress,
		getActiveMigrationRun,
		getLatestMigrationRun,
		getMigrationRunEvents,
		downloadMigrationRunReconciliationReport,
		recoverMigrationRun,
		rerunMigrationRun,
		resolveDm4SourceWorkbooks,
		uploadDm4SourceWorkbooks,
	};
};
