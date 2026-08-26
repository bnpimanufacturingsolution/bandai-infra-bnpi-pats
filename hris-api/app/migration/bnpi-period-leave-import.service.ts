import type { PrismaClient } from "../../generated/prisma";
import {
	aggregatePaidLeaveDaysByEmployee,
	computePeriodLeaveAmount,
	PERIOD_LEAVE_BENEFIT_CODE,
	PERIOD_LEAVE_BENEFIT_NAME,
	parsePeriodLeaveWorkbook,
	resolvePeriodLeaveDailyBasis,
	roundPeriodLeaveMoney,
	type PeriodLeaveAggregated,
	type PeriodLeaveRawRow,
} from "../../helper/bnpi-period-leave-import.helper";
import { normalizeEmployeeBenefitPayload } from "../../helper/employee-benefit-program.helper";
import {
	ensureBenefitType,
	persistDm3ImportActivityLog,
	resolveMassUploadImportStatus,
	type MassUploadRowError,
	type MassUploadRowResult,
} from "./bnpi-mass-upload-import.service";

export type PeriodLeaveImportSummary = {
	kind: "leave";
	dryRun: boolean;
	total: number;
	created: number;
	updated: number;
	skipped: number;
	failed: number;
	errors: MassUploadRowError[];
	results?: MassUploadRowResult[];
	errorTotal?: number;
	resultTotal?: number;
	errorsTruncated?: boolean;
	resultsTruncated?: boolean;
	status?: "completed" | "partial" | "failed";
	periodCodes?: string[];
	importLogId?: string;
	sourceFilename?: string;
	startedAt?: string;
	finishedAt?: string;
	durationMs?: number;
	sheetName?: string;
	qualifyingSheetNames?: string[];
	windowStart?: string;
	windowEnd?: string;
	/** Overlapping periods considered, with paid-day counts (chosen first). */
	periodCandidates?: Array<{
		periodCode: string;
		startDate: string;
		endDate: string;
		paidDays: number;
		employees: number;
		chosen?: boolean;
	}>;
	totalPaidDays?: number;
	skippedUnpaidRows?: number;
	skippedOutsideWindowRows?: number;
	amountTotal?: number;
	employeesMatched?: number;
	employeesMissing?: string[];
};

type InternalState = {
	summary: PeriodLeaveImportSummary;
	allErrors: MassUploadRowError[];
	allResults: MassUploadRowResult[];
};

type ResolvedPayrollPeriod = {
	id: string;
	code: string | null;
	startDate: Date;
	endDate: Date;
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
 * Resolve the payroll period that owns the cutoff window. Prefers an explicit
 * period id; else picks, among periods overlapping the file's date span, the one
 * holding the MOST paid leave days (month-wide files span two cutoffs; the
 * dominant cutoff is the import target). Ties break to the later period.
 */
async function resolvePeriodLeavePayrollPeriod(params: {
	prisma: PrismaClient;
	organizationId: string;
	payrollPeriodId?: string | null;
	spanStart?: Date | null;
	spanEnd?: Date | null;
	rows?: PeriodLeaveRawRow[];
}): Promise<{
	period: ResolvedPayrollPeriod | null;
	candidates: string[];
	candidateStats: Array<{ periodCode: string; startDate: string; endDate: string; paidDays: number; employees: number }>;
}> {
	const candidates: string[] = [];
	const candidateStats: Array<{ periodCode: string; startDate: string; endDate: string; paidDays: number; employees: number }> = [];
	if (params.payrollPeriodId) {
		const row = await params.prisma.payrollPeriod.findFirst({
			where: {
				id: params.payrollPeriodId,
				organizationId: params.organizationId,
				isDeleted: false,
			},
			select: { id: true, code: true, startDate: true, endDate: true },
		});
		if (!row) return { period: null, candidates, candidateStats };
		return {
			period: {
				id: row.id,
				code: row.code || null,
				startDate: row.startDate,
				endDate: row.endDate,
			},
			candidates,
			candidateStats,
		};
	}
	if (!params.spanStart || !params.spanEnd) return { period: null, candidates, candidateStats };

	const overlapping = await params.prisma.payrollPeriod.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			startDate: { lte: utcDayEnd(params.spanEnd) },
			endDate: { gte: utcDayStart(params.spanStart) },
		},
		select: { id: true, code: true, startDate: true, endDate: true },
		orderBy: { startDate: "asc" },
	});
	for (const row of overlapping) {
		const stats = aggregatePaidLeaveDaysByEmployee(params.rows || [], {
			startDate: row.startDate,
			endDate: row.endDate,
		});
		candidates.push(
			`${row.code || row.id} (${row.startDate.toISOString().slice(0, 10)}..${row.endDate.toISOString().slice(0, 10)}) = ${stats.totalPaidDays} days / ${stats.byCode.size} emps`,
		);
		candidateStats.push({
			periodCode: row.code || row.id,
			startDate: row.startDate.toISOString().slice(0, 10),
			endDate: row.endDate.toISOString().slice(0, 10),
			paidDays: roundPeriodLeaveMoney(stats.totalPaidDays),
			employees: stats.byCode.size,
		});
	}
	if (overlapping.length === 0) return { period: null, candidates, candidateStats };

	let best: { row: (typeof overlapping)[number]; days: number } | null = null;
	for (const row of overlapping) {
		const days = aggregatePaidLeaveDaysByEmployee(params.rows || [], {
			startDate: row.startDate,
			endDate: row.endDate,
		}).totalPaidDays;
		if (
			!best ||
			days > best.days ||
			(days === best.days && row.startDate.getTime() > best.row.startDate.getTime())
		) {
			best = { row, days };
		}
	}
	return {
		period: {
			id: best!.row.id,
			code: best!.row.code || null,
			startDate: best!.row.startDate,
			endDate: best!.row.endDate,
		},
		candidates,
		candidateStats,
	};
}

export async function importPeriodLeave(params: {
	prisma: PrismaClient;
	organizationId: string;
	buffer: Buffer;
	sourceFilename?: string;
	startedByUserId?: string | null;
	migrationRunId?: string | null;
	persistLog?: boolean;
	/** Preview is opt-in; default executes like the other DM3 mass uploads. */
	dryRun?: boolean;
	/** Optional explicit sheet override (defaults to first qualifying sheet). */
	sheetName?: string | null;
	/** Optional explicit period; defaults to resolving from leave dates. */
	payrollPeriodId?: string | null;
}): Promise<PeriodLeaveImportSummary> {
	const dryRun = params.dryRun === true;
	const startedAt = new Date();
	const state: InternalState = {
		summary: {
			kind: "leave",
			dryRun,
			total: 0,
			created: 0,
			updated: 0,
			skipped: 0,
			failed: 0,
			errors: [],
		},
		allErrors: [],
		allResults: [],
	};

	const parsed = parsePeriodLeaveWorkbook(params.buffer, {
		sheetName: params.sheetName,
	});
	state.summary.sheetName = parsed.sheetName || undefined;
	state.summary.qualifyingSheetNames = parsed.qualifyingSheetNames;

	if (!parsed.sheetName) {
		state.allErrors.push({
			row: 0,
			field: "sheet",
			message: "Workbook has no readable sheet.",
		});
		return await finalizePeriodLeaveImport(params, state, startedAt, new Map(), new Date());
	}

	// Window comes from the resolved period when available; before resolution we
	// compute the file's paid-date span so month-wide workbooks can be matched to
	// the cutoff holding the most paid days.
	const datedRows = parsed.rows.filter((row) => row.date && row.paid && row.days > 0);
	let provisionalStart: Date | null = null;
	let provisionalEnd: Date | null = null;
	for (const row of datedRows) {
		const day = utcDayStart(row.date as Date);
		if (!provisionalStart || day < provisionalStart) provisionalStart = day;
		const dayEnd = utcDayEnd(row.date as Date);
		if (!provisionalEnd || dayEnd > provisionalEnd) provisionalEnd = dayEnd;
	}

	const { period, candidates, candidateStats } = await resolvePeriodLeavePayrollPeriod({
		prisma: params.prisma,
		organizationId: params.organizationId,
		payrollPeriodId: params.payrollPeriodId,
		spanStart: provisionalStart,
		spanEnd: provisionalEnd,
		rows: parsed.rows,
	});
	if (period) {
		state.summary.periodCandidates = candidateStats.map((stat) => ({
			...stat,
			chosen:
				stat.startDate === period.startDate.toISOString().slice(0, 10) &&
				stat.endDate === period.endDate.toISOString().slice(0, 10),
		}));
	}

	if (datedRows.length === 0) {
		state.allErrors.push({
			row: 0,
			field: "rows",
			message:
				"No paid leave rows with a date were found in this workbook. Nothing to import.",
		});
		return await finalizePeriodLeaveImport(params, state, startedAt, new Map(), new Date());
	}

	if (!period) {
		state.allErrors.push({
			row: 0,
			field: "payrollPeriodId",
			message: candidates.length
				? `No payroll period matched. Pass payrollPeriodId explicitly (overlapping periods found: ${candidates.join("; ")}).`
				: "No payroll period found for the leave dates. Pass payrollPeriodId or create the period first.",
		});
		return await finalizePeriodLeaveImport(params, state, startedAt, new Map(), new Date());
	}

	state.summary.windowStart = period.startDate.toISOString().slice(0, 10);
	state.summary.windowEnd = period.endDate.toISOString().slice(0, 10);

	const aggregated = aggregatePaidLeaveDaysByEmployee(parsed.rows, {
		startDate: period.startDate,
		endDate: period.endDate,
	});
	state.summary.totalPaidDays = roundPeriodLeaveMoney(aggregated.totalPaidDays);
	state.summary.skippedUnpaidRows = aggregated.skippedUnpaid;
	state.summary.skippedOutsideWindowRows = aggregated.skippedOutsideWindow;

	if (aggregated.byCode.size === 0) {
		state.allErrors.push({
			row: 0,
			field: "window",
			message: `No paid leave rows fall inside ${state.summary.windowStart}..${state.summary.windowEnd}.`,
		});
		return await finalizePeriodLeaveImport(
			params,
			state,
			startedAt,
			aggregated.byCode,
			new Date(),
		);
	}

	const employeeCodes = Array.from(aggregated.byCode.keys());
	const employees = await params.prisma.employee.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			employeeId: { in: employeeCodes },
		},
		select: {
			id: true,
			employeeId: true,
			dailyRate: true,
			basicSalary: true,
		},
	});
	const employeeByCode = new Map(employees.map((e) => [e.employeeId, e]));

	// Resolve benefit type (LVP). Execute ensures the catalog row exists; dry-run
	// only reads an existing type so the preview can still show update-vs-create.
	let benefitTypeId: string | null = null;
	if (!dryRun) {
		const type = await ensureBenefitType(
			params.prisma,
			params.organizationId,
			PERIOD_LEAVE_BENEFIT_CODE,
			{ name: PERIOD_LEAVE_BENEFIT_NAME, direction: "COMPENSATION" },
		);
		benefitTypeId = type.id;
	} else {
		const existingType = await params.prisma.benefitType.findFirst({
			where: {
				organizationId: params.organizationId,
				isDeleted: false,
				code: { equals: PERIOD_LEAVE_BENEFIT_CODE, mode: "insensitive" },
			},
			select: { id: true },
		});
		benefitTypeId = existingType?.id || null;
	}

	const existing = benefitTypeId
		? await params.prisma.employeeBenefit.findMany({
				where: {
					organizationId: params.organizationId,
					isDeleted: false,
					payrollPeriodId: period.id,
					benefitTypeId,
					employeeId: { in: employees.map((e) => e.id) },
				},
				select: { id: true, employeeId: true },
			})
		: [];
	const existingByEmployee = new Map(
		existing.map((row) => [row.employeeId, row.id] as const),
	);

	let amountTotal = 0;
	let employeesMatched = 0;
	const missingEmployees: string[] = [];

	for (const code of employeeCodes) {
		const aggregate: PeriodLeaveAggregated = aggregated.byCode.get(code)!;
		const employee = employeeByCode.get(code);
		if (!employee) {
			missingEmployees.push(code);
			state.allErrors.push({
				row: aggregate.sourceRows[0] || 0,
				employeeId: code,
				code: PERIOD_LEAVE_BENEFIT_CODE,
				field: "EmployeeNumber",
				message: `Employee ${code} was not found.`,
			});
			continue;
		}

		const basis = resolvePeriodLeaveDailyBasis(employee);
		const amount = computePeriodLeaveAmount({
			paidDays: aggregate.paidDays,
			dailyRate: basis.dailyRate,
		});
		amountTotal += amount;
		employeesMatched += 1;

		const existingId = existingByEmployee.get(employee.id);
		const action: MassUploadRowResult["action"] = existingId ? "updated" : "created";
		state.allResults.push({
			row: aggregate.sourceRows[0] || 0,
			employeeId: code,
			code: PERIOD_LEAVE_BENEFIT_CODE,
			amount,
			action,
			periodCode: period.code || period.id,
			message: `${aggregate.paidDays} paid day(s) via ${basis.basis} at ${basis.dailyRate}/day`,
		});

		if (dryRun) continue;

		const payload = normalizeEmployeeBenefitPayload({
			organizationId: params.organizationId,
			employeeId: employee.id,
			benefitTypeId,
			payrollPeriodId: period.id,
			amount,
			totalAmount: amount,
			// One cutoff only: pin to period bounds like COMP mass-upload enrollments.
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
			name: PERIOD_LEAVE_BENEFIT_NAME,
			notes: `BNPI Period Leave Import; sheet=${parsed.sheetName}; days=${aggregate.paidDays}; dates=${aggregate.dates.join("+")}; types=${aggregate.leaveTypes.join("+")}; basis=${basis.basis}@${basis.dailyRate}; source=${params.sourceFilename || "upload"}; period=${period.code || period.id}`,
			currency: "PHP",
			agreedToTerms: true,
		});

		try {
			if (existingId) {
				await params.prisma.employeeBenefit.update({
					where: { id: existingId },
					data: payload as any,
				});
				state.summary.updated += 1;
			} else {
				await params.prisma.employeeBenefit.create({
					data: payload as any,
					select: { id: true },
				});
				state.summary.created += 1;
			}
		} catch (error: any) {
			state.allErrors.push({
				row: aggregate.sourceRows[0] || 0,
				employeeId: code,
				code: PERIOD_LEAVE_BENEFIT_CODE,
				message: error?.message || "Failed to write leave pay enrollment",
			});
		}
	}

	state.summary.amountTotal = roundPeriodLeaveMoney(amountTotal);
	state.summary.employeesMatched = employeesMatched;
	state.summary.employeesMissing = missingEmployees;
	if (!dryRun && benefitTypeId) {
		state.summary.periodCodes = [period.code || period.id];
	}

	return finalizePeriodLeaveImport(
		params,
		state,
		startedAt,
		aggregated.byCode,
		new Date(),
	);
}

async function finalizePeriodLeaveImport(
	params: {
		prisma: PrismaClient;
		organizationId: string;
		sourceFilename?: string;
		startedByUserId?: string | null;
		migrationRunId?: string | null;
		persistLog?: boolean;
		dryRun?: boolean;
	},
	state: InternalState,
	startedAt: Date,
	aggregatedByCode: Map<string, PeriodLeaveAggregated>,
	finishedAt: Date,
): Promise<PeriodLeaveImportSummary> {
	const summary = state.summary;
	summary.total = aggregatedByCode.size;
	summary.failed = state.allErrors.length;
	summary.errorTotal = state.allErrors.length;
	summary.resultTotal =
		Number(summary.created || 0) + Number(summary.updated || 0);
	// Dry-run plans are results, not writes; surface them for operator review.
	summary.results = state.allResults.slice(0, 200);
	summary.resultsTruncated = state.allResults.length > summary.results.length;
	summary.errors = state.allErrors.slice(0, 200);
	summary.errorsTruncated = state.allErrors.length > summary.errors.length;
	summary.status =
		summary.dryRun
			? state.allErrors.length > 0
				? "partial"
				: "completed"
			: resolveMassUploadImportStatus({
					total: summary.total,
					created: summary.created,
					updated: summary.updated,
					failed: summary.failed,
				});
	summary.sourceFilename = params.sourceFilename;
	summary.startedAt = startedAt.toISOString();
	summary.finishedAt = finishedAt.toISOString();
	summary.durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());

	if (params.persistLog !== false && !summary.dryRun) {
		const log = await persistDm3ImportActivityLog({
			prisma: params.prisma,
			organizationId: params.organizationId,
			kind: "period-leave",
			sourceFilename: params.sourceFilename,
			migrationRunId: params.migrationRunId,
			startedByUserId: params.startedByUserId,
			startedAt,
			finishedAt,
			total: summary.total,
			created: summary.created,
			updated: summary.updated,
			skipped: summary.skipped,
			failed: summary.failed,
			status: summary.status as "completed" | "partial" | "failed" | undefined,
			periodCodes: summary.periodCodes,
			errors: state.allErrors,
			results: state.allResults,
			summaryExtra: {
				massUploadKind: "leave",
				dryRun: false,
				sheetName: summary.sheetName,
				windowStart: summary.windowStart,
				windowEnd: summary.windowEnd,
				totalPaidDays: summary.totalPaidDays,
				amountTotal: summary.amountTotal,
				employeesMatched: summary.employeesMatched,
			},
		});
		if (log?.id) summary.importLogId = log.id;
	}

	return summary;
}
