import * as XLSX from "xlsx";
import type { PrismaClient } from "../../generated/prisma";
import {
	compensationBenefitLabel,
	DEDUCTION_BENEFIT_CODE_LABELS,
	normalizeMassUploadRow,
	padEmployeeId,
	parseCompensationMassUploadRow,
	parseDeductionMassUploadRow,
} from "../../helper/bnpi-mass-upload-import.helper";
import {
	parseStatutoryBenefitsWorkbook,
	STATUTORY_MP2_BENEFIT_NAME,
} from "../../helper/bnpi-statutory-benefits-import.helper";
import { normalizeEmployeeBenefitPayload } from "../../helper/employee-benefit-program.helper";

/** HTTP response sample caps (full lists live in MassUploadImportLog when persisted). */
export const MASS_UPLOAD_HTTP_ERROR_CAP = 200;
export const MASS_UPLOAD_HTTP_RESULT_CAP = 200;
/** Persist full success rows only up to this size; beyond that store samples + truncation flag. */
export const MASS_UPLOAD_PERSIST_RESULT_CAP = 2000;

export type MassUploadRowAction = "created" | "updated" | "failed" | "skipped";

export type MassUploadRowError = {
	row: number;
	employeeId?: string;
	code?: string;
	field?: string;
	message: string;
};

export type MassUploadRowResult = {
	row: number;
	employeeId?: string;
	code?: string;
	amount?: number;
	paymentAmount?: number;
	action: MassUploadRowAction;
	field?: string;
	message?: string;
	periodCode?: string | null;
};

export type MassUploadImportSummary = {
	kind: "compensation" | "deduction" | "statutory";
	total: number;
	created: number;
	updated: number;
	skipped: number;
	failed: number;
	errors: MassUploadRowError[];
	/** Successful row samples (may be truncated for HTTP). */
	results?: MassUploadRowResult[];
	/** True failed count (may exceed errors.length when truncated). */
	errorTotal?: number;
	/** True success count (created + updated; may exceed results.length when truncated). */
	resultTotal?: number;
	errorsTruncated?: boolean;
	resultsTruncated?: boolean;
	/** Payroll period codes that received at least one benefit enrollment. */
	periodCodes?: string[];
	/** Present for statutory remittance imports. */
	sheetName?: string;
	contributionOnlyEmployees?: number;
	importLogId?: string;
	sourceFilename?: string;
	startedAt?: string;
	finishedAt?: string;
	durationMs?: number;
	status?: "completed" | "partial" | "failed";
};

type ResolvedPayrollPeriod = {
	id: string;
	code: string | null;
	startDate: Date;
	endDate: Date;
};

type InternalImportState = {
	summary: MassUploadImportSummary;
	allErrors: MassUploadRowError[];
	allResults: MassUploadRowResult[];
};

function utcDayStart(date: Date): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function utcDayEnd(date: Date): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
	);
}

/**
 * Resolve the single payroll period that owns a BNPI mass-upload StartPayDate / StartPayment.
 * Prefer exact period-start calendar match; fallback to startDate inside [period.start, period.end].
 */
async function resolvePayrollPeriodForMassUploadStart(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
): Promise<ResolvedPayrollPeriod | null> {
	const dayStart = utcDayStart(startDate);
	const dayEnd = utcDayEnd(startDate);

	const exactStart = await prisma.payrollPeriod.findFirst({
		where: {
			organizationId,
			isDeleted: false,
			startDate: { gte: dayStart, lte: dayEnd },
		},
		select: { id: true, code: true, startDate: true, endDate: true },
		orderBy: { startDate: "asc" },
	});
	if (exactStart) {
		return {
			id: exactStart.id,
			code: exactStart.code || null,
			startDate: exactStart.startDate,
			endDate: exactStart.endDate,
		};
	}

	const containing = await prisma.payrollPeriod.findFirst({
		where: {
			organizationId,
			isDeleted: false,
			startDate: { lte: dayEnd },
			endDate: { gte: dayStart },
		},
		select: { id: true, code: true, startDate: true, endDate: true },
		orderBy: { startDate: "asc" },
	});
	if (!containing) return null;
	return {
		id: containing.id,
		code: containing.code || null,
		startDate: containing.startDate,
		endDate: containing.endDate,
	};
}

function trackPeriodCode(summary: MassUploadImportSummary, code: string | null | undefined) {
	if (!code) return;
	if (!summary.periodCodes) summary.periodCodes = [];
	if (!summary.periodCodes.includes(code)) summary.periodCodes.push(code);
}

function readSheetRows(buffer: Buffer): Record<string, unknown>[] {
	const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
	const sheetName = workbook.SheetNames[0];
	if (!sheetName) return [];
	return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
		defval: "",
		raw: true,
	});
}

function addMonths(date: Date, months: number): Date {
	const next = new Date(date.getTime());
	next.setUTCMonth(next.getUTCMonth() + months);
	return next;
}

/** BNPI post-NetPay / TotalReceivable codes (register columns after NetPay). */
const BNPI_RECEIVABLE_ONLY_CODES = new Set([
	"INC",
	"ARP",
	"PFA",
	"LLA",
	"MLA",
]);

async function ensureBenefitType(
	prisma: PrismaClient,
	organizationId: string,
	code: string,
	options?: { name?: string; direction?: "COMPENSATION" | "DEDUCTION" },
) {
	const normalized = String(code || "").trim().toUpperCase();
	const existing = await prisma.benefitType.findFirst({
		where: {
			organizationId,
			isDeleted: false,
			OR: [
				{ code: { equals: code, mode: "insensitive" } },
				{ name: { equals: code, mode: "insensitive" } },
			],
		},
		select: {
			id: true,
			code: true,
			name: true,
			reconciliationAction: true,
		},
	});
	if (existing) {
		// Heal known BNPI post-net codes that were auto-created with null action.
		if (
			BNPI_RECEIVABLE_ONLY_CODES.has(String(existing.code || "").toUpperCase()) &&
			!existing.reconciliationAction
		) {
			await prisma.benefitType.update({
				where: { id: existing.id },
				data: {
					reconciliationAction: "RECEIVABLE_ONLY",
					isTaxable: false,
				},
			});
		}
		return existing;
	}

	const name = options?.name || compensationBenefitLabel(code);
	const direction = options?.direction || "COMPENSATION";
	const receivableOnly =
		direction === "COMPENSATION" && BNPI_RECEIVABLE_ONLY_CODES.has(normalized);
	// BenefitCategory has no DEDUCTION value — use OTHER for deduction-direction types.
	// payrollDirection is the field that marks compensation vs deduction.
	return prisma.benefitType.create({
		data: {
			organizationId,
			code,
			name,
			category: direction === "DEDUCTION" ? "OTHER" : "ALLOWANCE",
			payrollDirection: direction,
			description: `Auto-created from BNPI mass upload (${code})`,
			isTaxable: direction === "COMPENSATION" && !receivableOnly,
			reconciliationAction: receivableOnly ? "RECEIVABLE_ONLY" : null,
			isActive: true,
			isDefault: false,
			defaultInstallments: 1,
			payrollCycleDays: 15,
			requireTermsAgreement: false,
		},
		select: { id: true, code: true, name: true },
	});
}

async function ensureLoanType(prisma: PrismaClient, organizationId: string, name: string) {
	const existing = await prisma.loanType.findFirst({
		where: {
			organizationId,
			isDeleted: false,
			name: { equals: name, mode: "insensitive" },
		},
		select: { id: true, name: true, interestRate: true, maxTermMonths: true },
	});
	if (existing) return existing;

	return prisma.loanType.create({
		data: {
			organizationId,
			name,
			category: "OTHER",
			description: `Auto-created from BNPI deduction mass upload (${name})`,
			interestRate: 0,
			maxTermMonths: 12,
			minAmount: 0,
			maxAmount: 0,
			minServiceMonths: 0,
			isActive: true,
		},
		select: { id: true, name: true, interestRate: true, maxTermMonths: true },
	});
}

function emptyInternalState(kind: MassUploadImportSummary["kind"], total: number): InternalImportState {
	return {
		summary: {
			kind,
			total,
			created: 0,
			updated: 0,
			skipped: 0,
			failed: 0,
			errors: [],
			results: [],
			errorTotal: 0,
			resultTotal: 0,
			errorsTruncated: false,
			resultsTruncated: false,
			periodCodes: [],
		},
		allErrors: [],
		allResults: [],
	};
}

function pushImportError(
	state: InternalImportState,
	error: MassUploadRowError,
) {
	state.summary.failed += 1;
	state.allErrors.push(error);
}

function pushImportSuccess(
	state: InternalImportState,
	result: MassUploadRowResult,
) {
	if (result.action === "created") state.summary.created += 1;
	else if (result.action === "updated") state.summary.updated += 1;
	state.allResults.push(result);
}

export function resolveMassUploadImportStatus(
	summary: Pick<MassUploadImportSummary, "total" | "created" | "updated" | "failed">,
): "completed" | "partial" | "failed" {
	const ok = Number(summary.created || 0) + Number(summary.updated || 0);
	const failed = Number(summary.failed || 0);
	if (failed > 0 && ok > 0) return "partial";
	if (failed > 0 || ok === 0) return "failed";
	return "completed";
}

export type Dm4UploadActivitySnapshot = {
	total: number;
	created: number;
	updated: number;
	skipped: number;
	failed: number;
	status: "completed" | "partial" | "failed";
	errors: MassUploadRowError[];
	results: MassUploadRowResult[];
	otOnly: boolean;
};

/**
 * Map a durable DM4 run result into mass-upload activity counts/status.
 * DM4 proof counts use attendance/timesheet metrics, not compensation created/updated.
 * A COMPLETED run must never be persisted as "failed" with 0 ok.
 */
export function buildDm4UploadActivityFromRunResult(params: {
	resultStatus: string;
	counts?: Record<string, any> | null;
	proofJson?: Record<string, any> | null;
	errorMessage?: string | null;
}): Dm4UploadActivitySnapshot {
	const counts = (params.counts || {}) as Record<string, any>;
	const proof = (params.proofJson || {}) as Record<string, any>;
	const statusText = String(params.resultStatus || "").toUpperCase();
	const writeCounts = (proof?.phase2Application?.writeCounts || {}) as Record<string, any>;
	const materialization =
		(proof?.timesheetMaterialization ||
			proof?.phase2Materialization?.timesheetDays ||
			{}) as Record<string, any>;

	const otOnly = Boolean(
		proof?.guardrails?.otOnly ||
			proof?.mode === "OT_ONLY_SKIP_ATTENDANCE" ||
			(Number(counts.attendanceWorkbookCount || 0) === 0 &&
				Number(counts.approvedOvertimeWorkbookCount || 0) > 0),
	);

	const selectedRows = Number(
		counts.selectedRowsTotal ??
			counts.total ??
			proof?.phase1Selection?.selectedRowsTotal ??
			proof?.phase2Application?.appliedTotal ??
			0,
	);
	const sourceWorkbookCount = Number(counts.sourceWorkbookCount ?? 0);
	const attendanceCreated = Number(
		counts.created ?? writeCounts.attendanceCreated ?? 0,
	);
	const attendanceUpdated = Number(
		counts.attendanceUpdated ?? writeCounts.attendanceUpdated ?? 0,
	);
	const attendanceRowsFound = Number(
		counts.attendanceRowsFound ?? proof?.phase3DbProof?.attendanceRowsFound ?? 0,
	);
	const timesheetlineRowsFound = Number(
		counts.timesheetlineRowsFound ?? proof?.phase3DbProof?.timesheetlineRowsFound ?? 0,
	);
	const materializedMissingLines = Number(
		counts.materializedMissingLines ?? materialization.materializedMissingLines ?? 0,
	);
	const timesheetsRecalculated = Number(
		counts.timesheetsRecalculated ?? materialization.timesheetsRecalculated ?? 0,
	);
	const otLineUpdates = Number(
		counts.approvedOvertimePlannedLineUpdates ??
			counts.plannedLineUpdates ??
			proof?.approvedOvertimeRepair?.plannedLineUpdates ??
			0,
	);
	const explicitFailed = Number(counts.failed ?? counts.failures ?? 0);
	const blocked = Number(counts.blocked ?? 0);

	const isTerminalFail = statusText.includes("FAIL") || statusText === "BLOCKED";
	const isTerminalSuccess =
		statusText === "COMPLETED" || statusText === "COMPLETED_WITH_WARNINGS";

	let created = 0;
	let updated = 0;
	let failed = Math.max(0, explicitFailed + blocked);
	let skipped = Number(counts.skipped ?? 0);
	let total = 0;

	if (otOnly) {
		updated = Math.max(0, otLineUpdates);
		total = Math.max(updated, sourceWorkbookCount, isTerminalSuccess || updated > 0 ? 1 : 0);
		if (isTerminalFail && updated === 0) {
			failed = Math.max(failed, 1);
		}
	} else {
		created = Math.max(0, attendanceCreated);
		// Prefer explicit write/materialization counts; accept counts.updated from adapter.
		const materializationUpdates = timesheetsRecalculated + materializedMissingLines;
		updated = Math.max(
			0,
			attendanceUpdated + materializationUpdates,
			// Adapter may already fold attendance+timesheet work into counts.updated.
			Number(counts.updated ?? 0),
		);
		if (created + updated === 0 && isTerminalSuccess) {
			// Idempotent re-import: proof rows still prove successful materialization.
			updated = Math.max(
				attendanceRowsFound,
				timesheetlineRowsFound,
				selectedRows,
				sourceWorkbookCount,
				1,
			);
		}
		total = Math.max(
			selectedRows,
			created + updated + failed,
			sourceWorkbookCount,
			isTerminalSuccess ? 1 : 0,
		);
		if (isTerminalFail && created + updated === 0) {
			failed = Math.max(failed, 1);
			total = Math.max(total, failed);
		}
	}

	let status: "completed" | "partial" | "failed";
	if (isTerminalSuccess) {
		status = failed > 0 && created + updated > 0 ? "partial" : failed > 0 ? "failed" : "completed";
	} else if (isTerminalFail) {
		status = created + updated > 0 ? "partial" : "failed";
	} else {
		status = resolveMassUploadImportStatus({ total, created, updated, failed });
	}

	// Never invent a failure message for a completed run with zero failures.
	const errors: MassUploadRowError[] =
		status === "failed" || (failed > 0 && params.errorMessage)
			? [
					{
						row: 0,
						message:
							String(params.errorMessage || "").trim() ||
							(isTerminalFail
								? "DM4 import failed or blocked."
								: "DM4 import finished with failures."),
					},
				]
			: failed > 0
				? [
						{
							row: 0,
							message: String(params.errorMessage || "DM4 import finished with failures."),
						},
					]
				: [];

	const results: MassUploadRowResult[] = [
		{
			row: 1,
			code: otOnly ? "DM4.3" : "DM4",
			action: status === "failed" ? "failed" : updated > 0 || created > 0 ? "updated" : "created",
			message: otOnly
				? `Approved overtime only · ${updated} line update(s)`
				: `Attendance/timesheet proof · ${created} created · ${updated} updated · attendanceRows=${attendanceRowsFound} · timesheetlines=${timesheetlineRowsFound}`,
		},
	];

	return {
		total,
		created,
		updated,
		skipped,
		failed,
		status,
		errors,
		results,
		otOnly,
	};
}

/** Finalize summary samples for HTTP (full lists remain on state for persist). */
export function finalizeMassUploadSummary(
	state: InternalImportState,
	meta?: { sourceFilename?: string; startedAt?: Date; finishedAt?: Date },
): MassUploadImportSummary {
	const errorTotal = state.allErrors.length;
	const resultTotal = state.allResults.length;
	const errorsTruncated = errorTotal > MASS_UPLOAD_HTTP_ERROR_CAP;
	const resultsTruncated = resultTotal > MASS_UPLOAD_HTTP_RESULT_CAP;
	const startedAt = meta?.startedAt;
	const finishedAt = meta?.finishedAt || new Date();
	const summary: MassUploadImportSummary = {
		...state.summary,
		errors: state.allErrors.slice(0, MASS_UPLOAD_HTTP_ERROR_CAP),
		results: state.allResults.slice(0, MASS_UPLOAD_HTTP_RESULT_CAP),
		errorTotal,
		resultTotal,
		errorsTruncated,
		resultsTruncated,
		status: resolveMassUploadImportStatus(state.summary),
		sourceFilename: meta?.sourceFilename,
		startedAt: startedAt?.toISOString(),
		finishedAt: finishedAt.toISOString(),
		durationMs:
			startedAt && finishedAt ? Math.max(0, finishedAt.getTime() - startedAt.getTime()) : undefined,
	};
	return summary;
}

function resultsForPersist(allResults: MassUploadRowResult[]): {
	results: MassUploadRowResult[];
	truncated: boolean;
} {
	if (allResults.length <= MASS_UPLOAD_PERSIST_RESULT_CAP) {
		return { results: allResults, truncated: false };
	}
	// Keep head + tail samples so operators can still spot patterns.
	const head = allResults.slice(0, 1000);
	const tail = allResults.slice(-200);
	return { results: [...head, ...tail], truncated: true };
}

/**
 * Operator upload activity kinds stored in mass_upload_import_logs.
 * DM3 uses workbook/databank/comp/deduction; DM1/DM2/DM4 use stage workbook kinds.
 */
export type Dm3ImportActivityKind =
	| "workbook"
	| "manpower-databank"
	| "compensation"
	| "deduction"
	| "worksharing-schedule"
	| "dm1-workbook"
	| "dm2-workbook"
	| "dm4-workbook"
	| "dm4-overtime";

/** @deprecated Prefer MigrationUploadActivityKind alias — kept for call-site compatibility. */
export type MigrationUploadActivityKind = Dm3ImportActivityKind;

export const DM_UPLOAD_ACTIVITY_KINDS_BY_WORKBOOK: Record<string, Dm3ImportActivityKind[]> = {
	dm1: ["dm1-workbook"],
	dm2: ["dm2-workbook"],
	dm3: ["workbook", "manpower-databank", "compensation", "deduction", "worksharing-schedule"],
	dm4: ["dm4-workbook", "dm4-overtime"],
};

export function resolveUploadActivityKindsForWorkbook(
	workbookId?: string | null,
): Dm3ImportActivityKind[] | null {
	const key = String(workbookId || "")
		.trim()
		.toLowerCase();
	if (!key) return null;
	return DM_UPLOAD_ACTIVITY_KINDS_BY_WORKBOOK[key] || null;
}

export function isKnownUploadActivityKind(kind?: string | null): kind is Dm3ImportActivityKind {
	const value = String(kind || "")
		.trim()
		.toLowerCase();
	return (
		value === "workbook" ||
		value === "manpower-databank" ||
		value === "compensation" ||
		value === "deduction" ||
		value === "worksharing-schedule" ||
		value === "dm1-workbook" ||
		value === "dm2-workbook" ||
		value === "dm4-workbook" ||
		value === "dm4-overtime"
	);
}

/**
 * Durable operator activity for migration uploads (DM1–DM4).
 * Best-effort: never throws into the import path.
 */
export async function persistDm3ImportActivityLog(params: {
	prisma: PrismaClient;
	organizationId: string;
	kind: Dm3ImportActivityKind;
	sourceFilename?: string | null;
	migrationRunId?: string | null;
	startedByUserId?: string | null;
	startedAt: Date;
	finishedAt: Date;
	total?: number;
	created?: number;
	updated?: number;
	skipped?: number;
	failed?: number;
	status?: "completed" | "partial" | "failed";
	periodCodes?: string[];
	errors?: MassUploadRowError[];
	results?: MassUploadRowResult[];
	summaryExtra?: Record<string, unknown>;
}): Promise<{ id: string } | null> {
	const prismaAny = params.prisma as any;
	if (!prismaAny.massUploadImportLog?.create) {
		return null;
	}

	const total = Number(params.total || 0);
	const created = Number(params.created || 0);
	const updated = Number(params.updated || 0);
	const skipped = Number(params.skipped || 0);
	const failed = Number(params.failed || 0);
	const status =
		params.status ||
		resolveMassUploadImportStatus({ total, created, updated, failed });
	const allErrors = Array.isArray(params.errors) ? params.errors : [];
	const allResults = Array.isArray(params.results) ? params.results : [];
	const persistResults = resultsForPersist(allResults);
	const userId =
		params.startedByUserId && params.startedByUserId !== "unknown"
			? params.startedByUserId
			: null;

	try {
		const row = await prismaAny.massUploadImportLog.create({
			data: {
				organizationId: params.organizationId,
				kind: params.kind,
				status,
				sourceFilename: params.sourceFilename || null,
				migrationRunId: params.migrationRunId || null,
				startedByUserId: userId,
				total,
				created,
				updated,
				skipped,
				failed,
				periodCodes: params.periodCodes || [],
				summaryJson: {
					kind: params.kind,
					total,
					created,
					updated,
					skipped,
					failed,
					periodCodes: params.periodCodes || [],
					errorTotal: allErrors.length,
					resultTotal: allResults.length,
					errorsTruncated: false,
					resultsTruncated: persistResults.truncated,
					status,
					sourceFilename: params.sourceFilename || null,
					startedAt: params.startedAt.toISOString(),
					finishedAt: params.finishedAt.toISOString(),
					durationMs: Math.max(
						0,
						params.finishedAt.getTime() - params.startedAt.getTime(),
					),
					...(params.summaryExtra || {}),
				},
				errorsJson: allErrors,
				resultsJson: persistResults.results,
				errorsTruncated: false,
				resultsTruncated: persistResults.truncated,
				startedAt: params.startedAt,
				finishedAt: params.finishedAt,
			},
			select: { id: true },
		});
		return row;
	} catch {
		return null;
	}
}

export async function persistMassUploadImportLog(params: {
	prisma: PrismaClient;
	organizationId: string;
	kind: "compensation" | "deduction";
	sourceFilename?: string | null;
	migrationRunId?: string | null;
	startedByUserId?: string | null;
	startedAt: Date;
	finishedAt: Date;
	state: InternalImportState;
	summary: MassUploadImportSummary;
}): Promise<{ id: string } | null> {
	return persistDm3ImportActivityLog({
		prisma: params.prisma,
		organizationId: params.organizationId,
		kind: params.kind,
		sourceFilename: params.sourceFilename,
		migrationRunId: params.migrationRunId,
		startedByUserId: params.startedByUserId,
		startedAt: params.startedAt,
		finishedAt: params.finishedAt,
		total: params.summary.total,
		created: params.summary.created,
		updated: params.summary.updated,
		skipped: params.summary.skipped,
		failed: params.summary.failed,
		periodCodes: params.summary.periodCodes,
		errors: params.state.allErrors,
		results: params.state.allResults,
		summaryExtra: {
			massUploadKind: params.summary.kind,
		},
	});
}

export function buildMassUploadReportCsv(params: {
	kind: string;
	errors: MassUploadRowError[];
	results: MassUploadRowResult[];
}): string {
	const lines: string[] = [
		"section,row,employeeId,code,amount,paymentAmount,action,field,message,periodCode",
	];
	const esc = (value: unknown) => {
		const raw = value === null || value === undefined ? "" : String(value);
		if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
		return raw;
	};
	for (const error of params.errors || []) {
		lines.push(
			[
				"failure",
				error.row,
				error.employeeId || "",
				error.code || "",
				"",
				"",
				"failed",
				error.field || "",
				error.message || "",
				"",
			]
				.map(esc)
				.join(","),
		);
	}
	for (const result of params.results || []) {
		lines.push(
			[
				"success",
				result.row,
				result.employeeId || "",
				result.code || "",
				result.amount ?? "",
				result.paymentAmount ?? "",
				result.action || "",
				result.field || "",
				result.message || "",
				result.periodCode || "",
			]
				.map(esc)
				.join(","),
		);
	}
	return lines.join("\n");
}

/**
 * Repair DM4 activity rows that were persisted as "failed" while the durable
 * migration run status was COMPLETED and created/updated/failed were all zero.
 * Presentation-only by default; callers may persist the returned patch.
 */
export function presentDm4MassUploadImportLog<T extends Record<string, any>>(item: T): T {
	if (!item) return item;
	const kind = String(item.kind || "");
	if (kind !== "dm4-workbook" && kind !== "dm4-overtime") return item;

	const summary =
		item.summaryJson && typeof item.summaryJson === "object"
			? (item.summaryJson as Record<string, any>)
			: {};
	const runStatus = String(summary.runStatus || "").toUpperCase();
	// Only rewrite the known bad shape: status=failed with zero failed/created/updated
	// while the durable run was COMPLETED (or proof counts prove materialization).
	const hasProofSuccess =
		Number(summary.attendanceRowsFound || summary.counts?.attendanceRowsFound || 0) > 0 ||
		Number(summary.timesheetlineRowsFound || summary.counts?.timesheetlineRowsFound || 0) > 0;
	const looksMisclassified =
		String(item.status || "").toLowerCase() === "failed" &&
		Number(item.failed || 0) === 0 &&
		Number(item.created || 0) === 0 &&
		Number(item.updated || 0) === 0 &&
		(runStatus === "COMPLETED" ||
			runStatus === "COMPLETED_WITH_WARNINGS" ||
			hasProofSuccess);

	// Only rewrite when status says failed with zero work — not true failures.
	if (!looksMisclassified) return item;
	// If runStatus is explicitly FAILED/BLOCKED, keep failed.
	if (runStatus.includes("FAIL") || runStatus === "BLOCKED") return item;

	const repaired = buildDm4UploadActivityFromRunResult({
		resultStatus: runStatus || "COMPLETED",
		counts: (summary.counts as Record<string, any>) || {
			sourceWorkbookCount: Number(item.total || 1),
			attendanceRowsFound: Number(summary.attendanceRowsFound || 0),
			timesheetlineRowsFound: Number(summary.timesheetlineRowsFound || 0),
			materializedMissingLines: Number(summary.materializedMissingLines || 0),
			approvedOvertimeWorkbookCount: summary.otOnly ? 1 : 0,
			attendanceWorkbookCount: summary.otOnly ? 0 : 1,
			approvedOvertimePlannedLineUpdates: Number(
				summary.counts?.approvedOvertimePlannedLineUpdates || 0,
			),
		},
		proofJson: {
			guardrails: { otOnly: Boolean(summary.otOnly) },
			mode: summary.otOnly ? "OT_ONLY_SKIP_ATTENDANCE" : undefined,
			phase3DbProof: {
				attendanceRowsFound: Number(
					summary.attendanceRowsFound || summary.counts?.attendanceRowsFound || 0,
				),
				timesheetlineRowsFound: Number(
					summary.timesheetlineRowsFound || summary.counts?.timesheetlineRowsFound || 0,
				),
			},
		},
	});

	return {
		...item,
		status: repaired.status,
		total: repaired.total,
		created: repaired.created,
		updated: repaired.updated,
		skipped: repaired.skipped,
		failed: repaired.failed,
		errorsJson: repaired.errors,
		resultsJson: repaired.results,
		summaryJson: {
			...summary,
			status: repaired.status,
			total: repaired.total,
			created: repaired.created,
			updated: repaired.updated,
			failed: repaired.failed,
			errorTotal: repaired.errors.length,
			resultTotal: repaired.results.length,
			repairedFromMisclassified: true,
		},
	};
}

export async function listMassUploadImportLogs(params: {
	prisma: PrismaClient;
	organizationId: string;
	kind?: Dm3ImportActivityKind | null;
	/** When set (and kind not set), filter to all kinds for that DM stage. */
	kinds?: Dm3ImportActivityKind[] | null;
	migrationRunId?: string | null;
	limit?: number;
}) {
	const prismaAny = params.prisma as any;
	if (!prismaAny.massUploadImportLog?.findMany) {
		return { items: [], total: 0, unavailable: true };
	}
	const take = Math.min(Math.max(Number(params.limit || 50), 1), 100);
	const where: Record<string, unknown> = {
		organizationId: params.organizationId,
		isDeleted: false,
	};
	if (params.kind) {
		where.kind = params.kind;
	} else if (params.kinds && params.kinds.length > 0) {
		where.kind = { in: params.kinds };
	}
	if (params.migrationRunId) where.migrationRunId = params.migrationRunId;

	try {
		const [items, total] = await Promise.all([
			prismaAny.massUploadImportLog.findMany({
				where,
				orderBy: { createdAt: "desc" },
				take,
				select: {
					id: true,
					kind: true,
					status: true,
					sourceFilename: true,
					migrationRunId: true,
					total: true,
					created: true,
					updated: true,
					skipped: true,
					failed: true,
					periodCodes: true,
					summaryJson: true,
					errorsTruncated: true,
					resultsTruncated: true,
					startedAt: true,
					finishedAt: true,
					createdAt: true,
					startedByUser: {
						select: { id: true, email: true, userName: true },
					},
				},
			}),
			prismaAny.massUploadImportLog.count({ where }),
		]);
		return {
			items: (items || []).map((item: any) => presentDm4MassUploadImportLog(item)),
			total,
		};
	} catch (error: any) {
		// Table not applied yet (migration pending) — return empty rather than 500 the DM3 page.
		const message = String(error?.message || "");
		if (
			message.includes("mass_upload_import_logs") ||
			message.includes("does not exist") ||
			error?.code === "P2021"
		) {
			return { items: [], total: 0, unavailable: true };
		}
		throw error;
	}
}

export async function getMassUploadImportLog(params: {
	prisma: PrismaClient;
	organizationId: string;
	id: string;
}) {
	const prismaAny = params.prisma as any;
	if (!prismaAny.massUploadImportLog?.findFirst) return null;
	try {
		const item = await prismaAny.massUploadImportLog.findFirst({
			where: {
				id: params.id,
				organizationId: params.organizationId,
				isDeleted: false,
			},
			include: {
				startedByUser: {
					select: { id: true, email: true, userName: true },
				},
			},
		});
		if (!item) return null;
		const presented = presentDm4MassUploadImportLog(item);
		// Persist repair so list/detail stay consistent after first open.
		if (
			presented !== item &&
			(presented as any).summaryJson?.repairedFromMisclassified &&
			prismaAny.massUploadImportLog?.update
		) {
			try {
				await prismaAny.massUploadImportLog.update({
					where: { id: item.id },
					data: {
						status: presented.status,
						total: presented.total,
						created: presented.created,
						updated: presented.updated,
						skipped: presented.skipped,
						failed: presented.failed,
						errorsJson: presented.errorsJson,
						resultsJson: presented.resultsJson,
						summaryJson: presented.summaryJson,
					},
				});
			} catch {
				// Presentation still returns repaired view even if persist fails.
			}
		}
		return presented;
	} catch (error: any) {
		const message = String(error?.message || "");
		if (
			message.includes("mass_upload_import_logs") ||
			message.includes("does not exist") ||
			error?.code === "P2021"
		) {
			return null;
		}
		throw error;
	}
}

function peekCompensationHints(raw: Record<string, unknown>): {
	employeeId?: string;
	code?: string;
} {
	const row = normalizeMassUploadRow(raw);
	const employeeId = padEmployeeId(row.EMPLOYEEID ?? row.EMPLOYEE_ID ?? row.EMP_ID) || undefined;
	const code =
		String(row.COMCODE ?? row.BENEFIT_CODE ?? row.CODE ?? "")
			.trim()
			.toUpperCase() || undefined;
	return { employeeId, code };
}

function peekDeductionHints(raw: Record<string, unknown>): {
	employeeId?: string;
	code?: string;
} {
	const row = normalizeMassUploadRow(raw);
	const employeeId = padEmployeeId(row.EMPLOYEEID ?? row.EMPLOYEE_ID ?? row.EMP_ID) || undefined;
	const code =
		String(row.DEDCODE ?? row.CODE ?? "")
			.trim()
			.toUpperCase() || undefined;
	return { employeeId, code };
}

export async function importCompensationMassUpload(params: {
	prisma: PrismaClient;
	organizationId: string;
	buffer: Buffer;
	sourceFilename?: string | null;
	migrationRunId?: string | null;
	startedByUserId?: string | null;
	persistLog?: boolean;
}): Promise<MassUploadImportSummary> {
	const startedAt = new Date();
	const rows = readSheetRows(params.buffer);
	const state = emptyInternalState("compensation", rows.length);

	type OkRow = {
		rowNumber: number;
		employeeId: string;
		code: string;
		amount: number;
		startDate: Date;
	};
	const okRows: OkRow[] = [];
	for (const [index, raw] of rows.entries()) {
		const rowNumber = index + 2;
		const hints = peekCompensationHints(raw);
		const parsed = parseCompensationMassUploadRow(raw);
		if (!parsed.ok) {
			pushImportError(state, {
				row: rowNumber,
				employeeId: hints.employeeId,
				code: hints.code,
				message: parsed.error,
			});
			continue;
		}
		okRows.push({
			rowNumber,
			employeeId: parsed.employeeId,
			code: parsed.code,
			amount: parsed.amount,
			startDate: parsed.startDate,
		});
	}
	if (!okRows.length) {
		const finishedAt = new Date();
		const summary = finalizeMassUploadSummary(state, {
			sourceFilename: params.sourceFilename || undefined,
			startedAt,
			finishedAt,
		});
		if (params.persistLog !== false) {
			const log = await persistMassUploadImportLog({
				prisma: params.prisma,
				organizationId: params.organizationId,
				kind: "compensation",
				sourceFilename: params.sourceFilename,
				migrationRunId: params.migrationRunId,
				startedByUserId: params.startedByUserId,
				startedAt,
				finishedAt,
				state,
				summary,
			});
			if (log) summary.importLogId = log.id;
		}
		return summary;
	}

	const employeeCodes = Array.from(new Set(okRows.map((r) => r.employeeId)));
	const employees = await params.prisma.employee.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			employeeId: { in: employeeCodes },
		},
		select: { id: true, employeeId: true },
	});
	const employeeByCode = new Map(employees.map((e) => [e.employeeId, e.id]));

	const periodCache = new Map<string, ResolvedPayrollPeriod | null>();
	const benefitTypeCache = new Map<string, { id: string; code: string; name: string }>();
	const existingByKey = new Map<string, string>();

	const ensurePeriod = async (startDate: Date) => {
		const dayKey = startDate.toISOString().slice(0, 10);
		if (!periodCache.has(dayKey)) {
			periodCache.set(
				dayKey,
				await resolvePayrollPeriodForMassUploadStart(
					params.prisma,
					params.organizationId,
					startDate,
				),
			);
		}
		return { dayKey, period: periodCache.get(dayKey) || null };
	};

	const ensureType = async (code: string) => {
		const key = code.toUpperCase();
		if (!benefitTypeCache.has(key)) {
			const type = await ensureBenefitType(params.prisma, params.organizationId, key, {
				name: compensationBenefitLabel(key),
				direction: "COMPENSATION",
			});
			benefitTypeCache.set(key, type);
		}
		return benefitTypeCache.get(key)!;
	};

	const periodIds = new Set<string>();
	const typeIds = new Set<string>();
	for (const row of okRows) {
		const { period } = await ensurePeriod(row.startDate);
		if (period) periodIds.add(period.id);
		const type = await ensureType(row.code);
		typeIds.add(type.id);
	}

	if (periodIds.size > 0 && typeIds.size > 0) {
		const existing = await params.prisma.employeeBenefit.findMany({
			where: {
				organizationId: params.organizationId,
				isDeleted: false,
				payrollPeriodId: { in: Array.from(periodIds) },
				benefitTypeId: { in: Array.from(typeIds) },
				employeeId: { in: employees.map((e) => e.id) },
			},
			select: {
				id: true,
				employeeId: true,
				benefitTypeId: true,
				payrollPeriodId: true,
			},
		});
		for (const row of existing) {
			if (!row.payrollPeriodId) continue;
			existingByKey.set(
				`${row.employeeId}|${row.benefitTypeId}|${row.payrollPeriodId}`,
				row.id,
			);
		}
	}

	for (const row of okRows) {
		try {
			const employeePk = employeeByCode.get(row.employeeId);
			if (!employeePk) {
				pushImportError(state, {
					row: row.rowNumber,
					employeeId: row.employeeId,
					code: row.code,
					field: "EmployeeID",
					message: `Employee ${row.employeeId} was not found.`,
				});
				continue;
			}

			const { dayKey, period } = await ensurePeriod(row.startDate);
			if (!period) {
				pushImportError(state, {
					row: row.rowNumber,
					employeeId: row.employeeId,
					code: row.code,
					field: "StartPayDate",
					message: `No payroll period found for StartPayDate ${dayKey}. Create the period (e.g. PP starting that day) before mass upload.`,
				});
				continue;
			}

			const benefitType = await ensureType(row.code);
			const key = `${employeePk}|${benefitType.id}|${period.id}`;
			const existingId = existingByKey.get(key);

			const payload = normalizeEmployeeBenefitPayload({
				organizationId: params.organizationId,
				employeeId: employeePk,
				benefitTypeId: benefitType.id,
				payrollPeriodId: period.id,
				amount: row.amount,
				totalAmount: row.amount,
				// One period only: pin to period bounds so Run Payroll Adjustments (filter by
				// payrollPeriodId) and generation both see the same cutoff-scoped enrollment.
				startDate: period.startDate,
				endDate: period.endDate,
				startPayrollCutOff: period.startDate,
				endPayrollCutOff: period.endDate,
				scheduleMode: "RECURRING",
				recurrenceFrequency: "EVERY_CUTOFF",
				totalInstallments: 0,
				attendanceBased: false,
				isActive: true,
				status: "ACTIVE",
				name: benefitType.name,
				notes: `BNPI Compensation Mass Upload row ${row.rowNumber}; COMCODE=${row.code}; period=${period.code || period.id}`,
				currency: "PHP",
				agreedToTerms: true,
			});

			if (existingId) {
				await params.prisma.employeeBenefit.update({
					where: { id: existingId },
					data: payload as any,
				});
				pushImportSuccess(state, {
					row: row.rowNumber,
					employeeId: row.employeeId,
					code: row.code,
					amount: row.amount,
					action: "updated",
					periodCode: period.code,
				});
			} else {
				const created = await params.prisma.employeeBenefit.create({
					data: payload as any,
					select: { id: true },
				});
				existingByKey.set(key, created.id);
				pushImportSuccess(state, {
					row: row.rowNumber,
					employeeId: row.employeeId,
					code: row.code,
					amount: row.amount,
					action: "created",
					periodCode: period.code,
				});
			}
			trackPeriodCode(state.summary, period.code);
		} catch (error: any) {
			pushImportError(state, {
				row: row.rowNumber,
				employeeId: row.employeeId,
				code: row.code,
				message: error?.message || "Failed to import compensation row",
			});
		}
	}

	const finishedAt = new Date();
	const summary = finalizeMassUploadSummary(state, {
		sourceFilename: params.sourceFilename || undefined,
		startedAt,
		finishedAt,
	});
	if (params.persistLog !== false) {
		const log = await persistMassUploadImportLog({
			prisma: params.prisma,
			organizationId: params.organizationId,
			kind: "compensation",
			sourceFilename: params.sourceFilename,
			migrationRunId: params.migrationRunId,
			startedByUserId: params.startedByUserId,
			startedAt,
			finishedAt,
			state,
			summary,
		});
		if (log) summary.importLogId = log.id;
	}
	return summary;
}

export async function importDeductionMassUpload(params: {
	prisma: PrismaClient;
	organizationId: string;
	buffer: Buffer;
	sourceFilename?: string | null;
	migrationRunId?: string | null;
	startedByUserId?: string | null;
	persistLog?: boolean;
}): Promise<MassUploadImportSummary> {
	const startedAt = new Date();
	const rows = readSheetRows(params.buffer);
	const state = emptyInternalState("deduction", rows.length);

	type OkRow = {
		rowNumber: number;
		employeeId: string;
		code: string;
		principalAmount: number;
		paymentAmount: number;
		startDate: Date;
		kind: "loan" | "benefit";
		loanTypeName: string | null;
		benefitCode: string | null;
	};
	const okRows: OkRow[] = [];
	for (const [index, raw] of rows.entries()) {
		const rowNumber = index + 2;
		const hints = peekDeductionHints(raw);
		const parsed = parseDeductionMassUploadRow(raw);
		if (!parsed.ok) {
			pushImportError(state, {
				row: rowNumber,
				employeeId: hints.employeeId,
				code: hints.code,
				message: parsed.error,
			});
			continue;
		}
		okRows.push({
			rowNumber,
			employeeId: parsed.employeeId,
			code: parsed.code,
			principalAmount: parsed.principalAmount,
			paymentAmount: parsed.paymentAmount,
			startDate: parsed.startDate,
			kind: parsed.kind,
			loanTypeName: parsed.loanTypeName,
			benefitCode: parsed.benefitCode,
		});
	}
	if (!okRows.length) {
		const finishedAt = new Date();
		const summary = finalizeMassUploadSummary(state, {
			sourceFilename: params.sourceFilename || undefined,
			startedAt,
			finishedAt,
		});
		if (params.persistLog !== false) {
			const log = await persistMassUploadImportLog({
				prisma: params.prisma,
				organizationId: params.organizationId,
				kind: "deduction",
				sourceFilename: params.sourceFilename,
				migrationRunId: params.migrationRunId,
				startedByUserId: params.startedByUserId,
				startedAt,
				finishedAt,
				state,
				summary,
			});
			if (log) summary.importLogId = log.id;
		}
		return summary;
	}

	const employeeCodes = Array.from(new Set(okRows.map((r) => r.employeeId)));
	const employees = await params.prisma.employee.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			employeeId: { in: employeeCodes },
		},
		select: { id: true, employeeId: true },
	});
	const employeeByCode = new Map(employees.map((e) => [e.employeeId, e.id]));

	const periodCache = new Map<string, ResolvedPayrollPeriod | null>();
	const benefitTypeCache = new Map<string, { id: string; code: string; name: string }>();
	const loanTypeCache = new Map<
		string,
		{ id: string; name: string; interestRate: number | null; maxTermMonths: number | null }
	>();
	const existingBenefitByKey = new Map<string, string>();

	const ensurePeriod = async (startDate: Date) => {
		const dayKey = startDate.toISOString().slice(0, 10);
		if (!periodCache.has(dayKey)) {
			periodCache.set(
				dayKey,
				await resolvePayrollPeriodForMassUploadStart(
					params.prisma,
					params.organizationId,
					startDate,
				),
			);
		}
		return { dayKey, period: periodCache.get(dayKey) || null };
	};

	const periodIds = new Set<string>();
	const benefitTypeIds = new Set<string>();
	for (const row of okRows) {
		const { period } = await ensurePeriod(row.startDate);
		if (period) periodIds.add(period.id);
		if (row.kind === "benefit") {
			const benefitCode = (row.benefitCode || row.code).toUpperCase();
			if (!benefitTypeCache.has(benefitCode)) {
				const type = await ensureBenefitType(params.prisma, params.organizationId, benefitCode, {
					name: DEDUCTION_BENEFIT_CODE_LABELS[benefitCode] || benefitCode,
					direction: "DEDUCTION",
				});
				benefitTypeCache.set(benefitCode, type);
			}
			benefitTypeIds.add(benefitTypeCache.get(benefitCode)!.id);
		} else if (row.loanTypeName) {
			const loanName = row.loanTypeName;
			if (!loanTypeCache.has(loanName)) {
				loanTypeCache.set(
					loanName,
					await ensureLoanType(params.prisma, params.organizationId, loanName),
				);
			}
		}
	}

	if (periodIds.size > 0 && benefitTypeIds.size > 0 && employees.length > 0) {
		const existing = await params.prisma.employeeBenefit.findMany({
			where: {
				organizationId: params.organizationId,
				isDeleted: false,
				payrollPeriodId: { in: Array.from(periodIds) },
				benefitTypeId: { in: Array.from(benefitTypeIds) },
				employeeId: { in: employees.map((e) => e.id) },
			},
			select: {
				id: true,
				employeeId: true,
				benefitTypeId: true,
				payrollPeriodId: true,
			},
		});
		for (const row of existing) {
			if (!row.payrollPeriodId) continue;
			existingBenefitByKey.set(
				`${row.employeeId}|${row.benefitTypeId}|${row.payrollPeriodId}`,
				row.id,
			);
		}
	}

	for (const row of okRows) {
		try {
			const employeePk = employeeByCode.get(row.employeeId);
			if (!employeePk) {
				pushImportError(state, {
					row: row.rowNumber,
					employeeId: row.employeeId,
					code: row.code,
					field: "EmployeeID",
					message: `Employee ${row.employeeId} was not found.`,
				});
				continue;
			}

			const { dayKey, period } = await ensurePeriod(row.startDate);
			// Loans can still enroll from StartPayment even if period is missing, but prefer period start when available.
			const loanStart = period?.startDate || row.startDate;

			if (row.kind === "loan" && row.loanTypeName) {
				if (!loanTypeCache.has(row.loanTypeName)) {
					loanTypeCache.set(
						row.loanTypeName,
						await ensureLoanType(params.prisma, params.organizationId, row.loanTypeName),
					);
				}
				const loanType = loanTypeCache.get(row.loanTypeName)!;
				const termMonths = Math.max(1, Number(loanType.maxTermMonths || 12));
				const principal = row.principalAmount;
				const monthlyPayment = row.paymentAmount;
				const endDate = addMonths(loanStart, termMonths);
				const existing = await params.prisma.employeeLoan.findFirst({
					where: {
						organizationId: params.organizationId,
						employeeId: employeePk,
						loanTypeId: loanType.id,
						isDeleted: false,
						status: { in: ["PENDING", "APPROVED", "ACTIVE"] },
					},
					select: { id: true },
				});

				const loanData = {
					organizationId: params.organizationId,
					employeeId: employeePk,
					loanTypeId: loanType.id,
					principalAmount: principal,
					interestRate: Number(loanType.interestRate || 0),
					totalAmount: principal,
					termMonths,
					monthlyPayment,
					startDate: loanStart,
					endDate,
					amountPaid: 0,
					balance: principal,
					status: "ACTIVE" as const,
					notes: `BNPI Deduction Mass Upload row ${row.rowNumber}; DEDCODE=${row.code}; payment=${monthlyPayment}${period?.code ? `; period=${period.code}` : ""}`,
				};

				if (existing) {
					await params.prisma.employeeLoan.update({
						where: { id: existing.id },
						data: loanData,
					});
					pushImportSuccess(state, {
						row: row.rowNumber,
						employeeId: row.employeeId,
						code: row.code,
						amount: principal,
						paymentAmount: monthlyPayment,
						action: "updated",
						periodCode: period?.code || null,
					});
				} else {
					await params.prisma.employeeLoan.create({ data: loanData });
					pushImportSuccess(state, {
						row: row.rowNumber,
						employeeId: row.employeeId,
						code: row.code,
						amount: principal,
						paymentAmount: monthlyPayment,
						action: "created",
						periodCode: period?.code || null,
					});
				}
				if (period) trackPeriodCode(state.summary, period.code);
				continue;
			}

			if (!period) {
				pushImportError(state, {
					row: row.rowNumber,
					employeeId: row.employeeId,
					code: row.code,
					field: "StartPayment",
					message: `No payroll period found for StartPayment ${dayKey}. Create the period before mass upload.`,
				});
				continue;
			}

			const benefitCode = (row.benefitCode || row.code).toUpperCase();
			if (!benefitTypeCache.has(benefitCode)) {
				const type = await ensureBenefitType(params.prisma, params.organizationId, benefitCode, {
					name: DEDUCTION_BENEFIT_CODE_LABELS[benefitCode] || benefitCode,
					direction: "DEDUCTION",
				});
				benefitTypeCache.set(benefitCode, type);
			}
			const benefitType = benefitTypeCache.get(benefitCode)!;
			const key = `${employeePk}|${benefitType.id}|${period.id}`;
			const existingId = existingBenefitByKey.get(key);
			const payload = normalizeEmployeeBenefitPayload({
				organizationId: params.organizationId,
				employeeId: employeePk,
				benefitTypeId: benefitType.id,
				payrollPeriodId: period.id,
				amount: row.paymentAmount,
				totalAmount: row.paymentAmount,
				startDate: period.startDate,
				endDate: period.endDate,
				startPayrollCutOff: period.startDate,
				endPayrollCutOff: period.endDate,
				scheduleMode: "RECURRING",
				recurrenceFrequency: "EVERY_CUTOFF",
				totalInstallments: 0,
				attendanceBased: false,
				isActive: true,
				status: "ACTIVE",
				name: benefitType.name,
				notes: `BNPI Deduction Mass Upload row ${row.rowNumber}; DEDCODE=${row.code}; period=${period.code || period.id}`,
				currency: "PHP",
				agreedToTerms: true,
			});
			if (existingId) {
				await params.prisma.employeeBenefit.update({
					where: { id: existingId },
					data: payload as any,
				});
				pushImportSuccess(state, {
					row: row.rowNumber,
					employeeId: row.employeeId,
					code: row.code,
					paymentAmount: row.paymentAmount,
					action: "updated",
					periodCode: period.code,
				});
			} else {
				const created = await params.prisma.employeeBenefit.create({
					data: payload as any,
					select: { id: true },
				});
				existingBenefitByKey.set(key, created.id);
				pushImportSuccess(state, {
					row: row.rowNumber,
					employeeId: row.employeeId,
					code: row.code,
					paymentAmount: row.paymentAmount,
					action: "created",
					periodCode: period.code,
				});
			}
			trackPeriodCode(state.summary, period.code);
		} catch (error: any) {
			pushImportError(state, {
				row: row.rowNumber,
				employeeId: row.employeeId,
				code: row.code,
				message: error?.message || "Failed to import deduction row",
			});
		}
	}

	const finishedAt = new Date();
	const summary = finalizeMassUploadSummary(state, {
		sourceFilename: params.sourceFilename || undefined,
		startedAt,
		finishedAt,
	});
	if (params.persistLog !== false) {
		const log = await persistMassUploadImportLog({
			prisma: params.prisma,
			organizationId: params.organizationId,
			kind: "deduction",
			sourceFilename: params.sourceFilename,
			migrationRunId: params.migrationRunId,
			startedByUserId: params.startedByUserId,
			startedAt,
			finishedAt,
			state,
			summary,
		});
		if (log) summary.importLogId = log.id;
	}
	return summary;
}

/**
 * Import BNPI Monthly Payment / Statutory Benefits remittance workbook.
 *
 * **Not exposed on the DM3 migration UI or HTTP route.** Operator truth is that
 * all cutoff benefits and deductions are imported via compensation + deduction
 * mass upload. This function remains for offline/script recovery only.
 *
 * Applies loan/deduction enrollments (SSS/HDMF loans, calamity, LRP, MP2) as
 * ACTIVE open-horizon obligations. Does not freeze SSS/PHIC/HDMF contribution
 * amounts into benefits — those stay engine-computed by payroll schedule.
 */
export async function importStatutoryBenefitsUpload(params: {
	prisma: PrismaClient;
	organizationId: string;
	buffer: Buffer;
}): Promise<MassUploadImportSummary> {
	const parsedBook = parseStatutoryBenefitsWorkbook(params.buffer);
	const summary: MassUploadImportSummary = {
		kind: "statutory",
		total: parsedBook.deductionRows.length,
		created: 0,
		updated: 0,
		skipped: parsedBook.contributionOnlyEmployees + parsedBook.skippedEmployees,
		failed: 0,
		errors: [...parsedBook.errors],
		results: [],
		errorTotal: parsedBook.errors.length,
		resultTotal: 0,
		errorsTruncated: false,
		resultsTruncated: false,
		sheetName: parsedBook.sheetName,
		contributionOnlyEmployees: parsedBook.contributionOnlyEmployees,
	};

	if (!parsedBook.deductionRows.length && parsedBook.errors.length) {
		summary.failed = Math.max(1, parsedBook.errors.length);
		summary.status = "failed";
		return summary;
	}

	// Open-horizon end date: source has no end-date column; keep ACTIVE for a long term.
	const OPEN_HORIZON_MONTHS = 240;

	for (const row of parsedBook.deductionRows) {
		try {
			const employee = await params.prisma.employee.findFirst({
				where: {
					organizationId: params.organizationId,
					isDeleted: false,
					employeeId: row.employeeId,
				},
				select: { id: true },
			});
			if (!employee) {
				summary.failed += 1;
				summary.errors.push({
					row: row.sourceRow,
					employeeId: row.employeeId,
					field: "Emp. No.",
					message: `Employee ${row.employeeId} was not found.`,
				});
				continue;
			}

			if (row.kind === "loan" && row.loanTypeName) {
				const loanType = await ensureLoanType(
					params.prisma,
					params.organizationId,
					row.loanTypeName,
				);
				const termMonths = OPEN_HORIZON_MONTHS;
				const principal = row.principalAmount;
				const monthlyPayment = row.paymentAmount;
				const endDate = addMonths(row.startDate, termMonths);
				const existing = await params.prisma.employeeLoan.findFirst({
					where: {
						organizationId: params.organizationId,
						employeeId: employee.id,
						loanTypeId: loanType.id,
						isDeleted: false,
						status: { in: ["PENDING", "APPROVED", "ACTIVE"] },
					},
					select: { id: true },
				});

				const loanData = {
					organizationId: params.organizationId,
					employeeId: employee.id,
					loanTypeId: loanType.id,
					principalAmount: principal,
					interestRate: Number(loanType.interestRate || 0),
					totalAmount: principal,
					termMonths,
					monthlyPayment,
					startDate: row.startDate,
					endDate,
					amountPaid: 0,
					balance: principal,
					status: "ACTIVE" as const,
					notes: `BNPI Statutory Benefits sheet "${row.sourceSheet}" row ${row.sourceRow}; family=${row.family}; 15th=${row.amount15}; 30th=${row.amount30}; open-horizon enrollment`,
				};

				if (existing) {
					await params.prisma.employeeLoan.update({
						where: { id: existing.id },
						data: loanData,
					});
					summary.updated += 1;
				} else {
					await params.prisma.employeeLoan.create({ data: loanData });
					summary.created += 1;
				}
				continue;
			}

			const benefitCode = row.benefitCode || STATUTORY_MP2_BENEFIT_NAME;
			const benefitType = await ensureBenefitType(params.prisma, params.organizationId, benefitCode, {
				name: benefitCode === "MHDMF2" ? STATUTORY_MP2_BENEFIT_NAME : benefitCode,
				direction: "DEDUCTION",
			});
			const existingBenefit = await params.prisma.employeeBenefit.findFirst({
				where: {
					organizationId: params.organizationId,
					employeeId: employee.id,
					benefitTypeId: benefitType.id,
					isDeleted: false,
				},
				select: { id: true },
			});
			const payload = normalizeEmployeeBenefitPayload({
				organizationId: params.organizationId,
				employeeId: employee.id,
				benefitTypeId: benefitType.id,
				amount: row.paymentAmount,
				totalAmount: row.paymentAmount,
				startDate: row.startDate,
				startPayrollCutOff: row.startDate,
				// No end date in source → recurring every cutoff until superseded.
				scheduleMode: "RECURRING",
				recurrenceFrequency: "EVERY_CUTOFF",
				totalInstallments: 0,
				attendanceBased: false,
				isActive: true,
				status: "ACTIVE",
				name: benefitType.name,
				notes: `BNPI Statutory Benefits sheet "${row.sourceSheet}" row ${row.sourceRow}; family=${row.family}; open-horizon deduction`,
				currency: "PHP",
				agreedToTerms: true,
			});
			if (existingBenefit) {
				await params.prisma.employeeBenefit.update({
					where: { id: existingBenefit.id },
					data: payload as any,
				});
				summary.updated += 1;
			} else {
				await params.prisma.employeeBenefit.create({ data: payload as any });
				summary.created += 1;
			}
		} catch (error: any) {
			summary.failed += 1;
			summary.errors.push({
				row: row.sourceRow,
				employeeId: row.employeeId,
				message: error?.message || "Failed to import statutory deduction row",
			});
		}
	}

	summary.errorTotal = summary.errors.length;
	summary.resultTotal = summary.created + summary.updated;
	summary.status = resolveMassUploadImportStatus(summary);
	return summary;
}
