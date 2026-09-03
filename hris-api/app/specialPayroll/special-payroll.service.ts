import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma";
import type { Server as SocketIOServer } from "socket.io";
import {
	buildSourceFingerprint,
	buildSpecialPayrollRunCode,
	buildSpecialPayslipNumber,
	formatEmployeeDisplayName,
	isMaterialEmployeeNameMismatch,
	normalizeSpecialPayrollImportRow,
	parseSpecialPayrollDate,
	roundMoney,
	toIsoDateOnly,
	type SpecialPayrollNormalizedInputRow,
	type SpecialPayrollPreviewRowError,
	type SpecialPayrollResolvedRow,
	validateSpecialPayrollRow,
} from "../../helper/special-payroll.helper";
import { publishNotification } from "../../helper/notification-dispatch.helper";
import { getLogger } from "../../helper/logger.helper";

const logger = getLogger().child({ module: "special-payroll-service" });

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export type SpecialPayrollPeriodContext = {
	contextPayrollPeriodId: string | null;
	contextPeriodCode: string | null;
	contextPeriodName: string | null;
	contextStartDate: Date;
	contextEndDate: Date;
	contextPayDate: Date;
};

export type SpecialPayrollPreviewResult = {
	previewId: string;
	valid: boolean;
	label: string;
	periodContext: {
		contextPayrollPeriodId: string | null;
		contextPeriodCode: string | null;
		contextPeriodName: string | null;
		contextStartDate: string;
		contextEndDate: string;
		contextPayDate: string;
	};
	rows: SpecialPayrollResolvedRow[];
	errors: SpecialPayrollPreviewRowError[];
	totals: {
		lineCount: number;
		employeeCount: number;
		totalGross: number;
		totalNet: number;
		currency: string;
	};
	sourceFingerprint: string;
	sourceFilename: string | null;
	sourceHash: string | null;
	expiresAt: string;
};

type PreviewCacheEntry = {
	organizationId: string;
	createdByUserId: string | null;
	result: SpecialPayrollPreviewResult;
	inputRows: SpecialPayrollNormalizedInputRow[];
	expiresAtMs: number;
};

const PREVIEW_TTL_MS = 30 * 60 * 1000;
const previewCache = new Map<string, PreviewCacheEntry>();

function prunePreviewCache(now = Date.now()) {
	for (const [key, entry] of previewCache.entries()) {
		if (entry.expiresAtMs <= now) previewCache.delete(key);
	}
}

export function clearSpecialPayrollPreviewCacheForTests() {
	previewCache.clear();
}

function hashBuffer(buffer: Buffer): string {
	return createHash("sha256").update(buffer).digest("hex");
}

async function resolvePeriodContext(
	prisma: PrismaExecutor,
	organizationId: string,
	opts: {
		contextPayrollPeriodId?: string | null;
		contextPeriodCode?: string | null;
	},
): Promise<SpecialPayrollPeriodContext> {
	const periodId = opts.contextPayrollPeriodId ? String(opts.contextPayrollPeriodId) : null;
	const periodCode = opts.contextPeriodCode ? String(opts.contextPeriodCode).trim() : null;

	let period =
		periodId
			? await prisma.payrollPeriod.findFirst({
					where: { id: periodId, organizationId, isDeleted: false },
					select: {
						id: true,
						code: true,
						name: true,
						startDate: true,
						endDate: true,
						payDate: true,
					},
				})
			: null;

	if (!period && periodCode) {
		period = await prisma.payrollPeriod.findFirst({
			where: { organizationId, code: periodCode, isDeleted: false },
			select: {
				id: true,
				code: true,
				name: true,
				startDate: true,
				endDate: true,
				payDate: true,
			},
		});
	}

	if (!period) {
		throw Object.assign(new Error("Selected payroll period context not found"), {
			statusCode: 400,
			code: "PERIOD_CONTEXT_NOT_FOUND",
		});
	}

	return {
		contextPayrollPeriodId: period.id,
		contextPeriodCode: period.code || periodCode,
		contextPeriodName: period.name,
		contextStartDate: new Date(period.startDate),
		contextEndDate: new Date(period.endDate),
		contextPayDate: new Date(period.payDate),
	};
}

function normalizeInputRows(
	rows: SpecialPayrollNormalizedInputRow[],
): Array<SpecialPayrollNormalizedInputRow & { rowNumber: number }> {
	return rows.map((row, index) => ({
		...row,
		employeeNumber: String(row.employeeNumber || "").trim(),
		compensationCode: String(row.compensationCode || "").trim().toUpperCase(),
		amount: Number(row.amount),
		employeeName: row.employeeName ?? null,
		sourcePayDate: row.sourcePayDate ?? null,
		sourceRowNumber: row.sourceRowNumber ?? index + 1,
		rowNumber: row.sourceRowNumber ?? index + 1,
	}));
}

export async function buildSpecialPayrollPreview(
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		createdByUserId?: string | null;
		label: string;
		contextPayrollPeriodId?: string | null;
		contextPeriodCode?: string | null;
		rows: SpecialPayrollNormalizedInputRow[];
		sourceFilename?: string | null;
		sourceHash?: string | null;
	},
): Promise<SpecialPayrollPreviewResult> {
	const label = String(params.label || "").trim();
	if (!label) {
		throw Object.assign(new Error("Run label is required"), {
			statusCode: 400,
			code: "LABEL_REQUIRED",
		});
	}

	const periodContext = await resolvePeriodContext(prisma, params.organizationId, {
		contextPayrollPeriodId: params.contextPayrollPeriodId,
		contextPeriodCode: params.contextPeriodCode,
	});

	const inputRows = normalizeInputRows(params.rows);
	if (inputRows.length === 0) {
		throw Object.assign(new Error("At least one row is required"), {
			statusCode: 400,
			code: "ROWS_REQUIRED",
		});
	}

	const errors: SpecialPayrollPreviewRowError[] = [];
	const resolved: SpecialPayrollResolvedRow[] = [];
	const seenInRun = new Map<string, number>();

	const employeeNumbers = Array.from(
		new Set(inputRows.map((r) => r.employeeNumber).filter(Boolean)),
	);
	const compensationCodes = Array.from(
		new Set(inputRows.map((r) => r.compensationCode).filter(Boolean)),
	);

	const employees = await prisma.employee.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			employeeId: { in: employeeNumbers },
		},
		select: {
			id: true,
			employeeId: true,
			employmentStatus: true,
			person: {
				select: {
					personalInfo: true,
				},
			},
		},
	});
	const employeesByNumber = new Map(employees.map((e) => [e.employeeId, e]));

	const benefitTypes = await prisma.benefitType.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			code: { in: compensationCodes },
		},
		select: {
			id: true,
			code: true,
			name: true,
			payrollDirection: true,
			isTaxable: true,
			isActive: true,
		},
	});
	const benefitsByCode = new Map(
		benefitTypes.map((b) => [String(b.code || "").toUpperCase(), b]),
	);

	// Once-per-period uniqueness across non-cancelled runs
	const existingLines = periodContext.contextPayrollPeriodId
		? await prisma.specialPayrollLine.findMany({
				where: {
					organizationId: params.organizationId,
					employee: {
						employeeId: { in: employeeNumbers },
					},
					run: {
						organizationId: params.organizationId,
						isDeleted: false,
						status: { not: "CANCELLED" },
						contextPayrollPeriodId: periodContext.contextPayrollPeriodId,
					},
				},
				select: {
					employeeId: true,
					compensationCode: true,
					employeeNumber: true,
					runId: true,
				},
			})
		: [];

	const existingKeys = new Set(
		existingLines.map(
			(l) => `${l.employeeNumber}::${String(l.compensationCode).toUpperCase()}`,
		),
	);

	for (const row of inputRows) {
		const rowNumber = row.rowNumber;
		const canonical = validateSpecialPayrollRow({
			EMPLOYEE_NUMBER: row.employeeNumber,
			COMPENSATION_CODE: row.compensationCode,
			AMOUNT: row.amount,
			EMPLOYEE_NAME: row.employeeName,
			START_PAY_DATE: row.sourcePayDate,
		});

		if (!canonical.ok) {
			errors.push({
				rowNumber,
				employeeNumber: row.employeeNumber,
				compensationCode: row.compensationCode,
				error: canonical.error,
				code: "VALIDATION",
			});
			continue;
		}

		const runKey = `${canonical.employeeNumber}::${canonical.compensationCode}`;
		if (seenInRun.has(runKey)) {
			errors.push({
				rowNumber,
				employeeNumber: canonical.employeeNumber,
				compensationCode: canonical.compensationCode,
				error: `Duplicate employee + compensation code in this run (also row ${seenInRun.get(runKey)})`,
				code: "DUPLICATE_IN_RUN",
			});
			continue;
		}
		seenInRun.set(runKey, rowNumber);

		if (existingKeys.has(runKey)) {
			errors.push({
				rowNumber,
				employeeNumber: canonical.employeeNumber,
				compensationCode: canonical.compensationCode,
				error:
					"Employee + compensation code already used in a non-cancelled Special Payroll for this period context",
				code: "DUPLICATE_IN_PERIOD",
			});
			continue;
		}

		const employee = employeesByNumber.get(canonical.employeeNumber);
		if (!employee) {
			errors.push({
				rowNumber,
				employeeNumber: canonical.employeeNumber,
				compensationCode: canonical.compensationCode,
				error: `Active employee not found for number ${canonical.employeeNumber}`,
				code: "EMPLOYEE_NOT_FOUND",
			});
			continue;
		}

		if (employee.employmentStatus !== "ACTIVE") {
			errors.push({
				rowNumber,
				employeeNumber: canonical.employeeNumber,
				compensationCode: canonical.compensationCode,
				error: `Employee ${canonical.employeeNumber} is not currently ACTIVE`,
				code: "EMPLOYEE_INACTIVE",
			});
			continue;
		}

		const employeeName = formatEmployeeDisplayName(employee.person as any) || canonical.employeeNumber;
		if (isMaterialEmployeeNameMismatch(canonical.employeeName, employeeName)) {
			errors.push({
				rowNumber,
				employeeNumber: canonical.employeeNumber,
				compensationCode: canonical.compensationCode,
				error: `Employee name mismatch for ${canonical.employeeNumber}`,
				code: "NAME_MISMATCH",
			});
			continue;
		}

		const benefit = benefitsByCode.get(canonical.compensationCode);
		if (!benefit) {
			errors.push({
				rowNumber,
				employeeNumber: canonical.employeeNumber,
				compensationCode: canonical.compensationCode,
				error: `Compensation type not found: ${canonical.compensationCode}`,
				code: "COMPENSATION_NOT_FOUND",
			});
			continue;
		}
		if (!benefit.isActive) {
			errors.push({
				rowNumber,
				employeeNumber: canonical.employeeNumber,
				compensationCode: canonical.compensationCode,
				error: `Compensation type is inactive: ${canonical.compensationCode}`,
				code: "COMPENSATION_INACTIVE",
			});
			continue;
		}
		if (benefit.payrollDirection !== "COMPENSATION") {
			errors.push({
				rowNumber,
				employeeNumber: canonical.employeeNumber,
				compensationCode: canonical.compensationCode,
				error: `Compensation type ${canonical.compensationCode} is not COMPENSATION direction`,
				code: "COMPENSATION_DIRECTION",
			});
			continue;
		}

		const amount = roundMoney(canonical.amount);
		resolved.push({
			rowNumber,
			employeeId: employee.id,
			employeeNumber: canonical.employeeNumber,
			employeeName,
			benefitTypeId: benefit.id,
			compensationCode: String(benefit.code || canonical.compensationCode).toUpperCase(),
			compensationName: benefit.name,
			direction: benefit.payrollDirection,
			isTaxable: Boolean(benefit.isTaxable),
			amount,
			gross: amount,
			net: amount,
			sourcePayDate: canonical.sourcePayDate,
		});
	}

	const totalGross = roundMoney(resolved.reduce((sum, r) => sum + r.gross, 0));
	const totalNet = totalGross;
	const employeeCount = new Set(resolved.map((r) => r.employeeId)).size;

	const sourceFingerprint = buildSourceFingerprint({
		organizationId: params.organizationId,
		contextPayrollPeriodId: periodContext.contextPayrollPeriodId,
		contextStartDate: toIsoDateOnly(periodContext.contextStartDate),
		contextEndDate: toIsoDateOnly(periodContext.contextEndDate),
		label,
		rows: resolved.map((r) => ({
			employeeNumber: r.employeeNumber,
			compensationCode: r.compensationCode,
			amount: r.amount,
		})),
	});

	const previewId = `spp_${randomUUID().replace(/-/g, "")}`;
	const expiresAtMs = Date.now() + PREVIEW_TTL_MS;
	const result: SpecialPayrollPreviewResult = {
		previewId,
		valid: errors.length === 0 && resolved.length > 0,
		label,
		periodContext: {
			contextPayrollPeriodId: periodContext.contextPayrollPeriodId,
			contextPeriodCode: periodContext.contextPeriodCode,
			contextPeriodName: periodContext.contextPeriodName,
			contextStartDate: toIsoDateOnly(periodContext.contextStartDate),
			contextEndDate: toIsoDateOnly(periodContext.contextEndDate),
			contextPayDate: toIsoDateOnly(periodContext.contextPayDate),
		},
		rows: resolved,
		errors,
		totals: {
			lineCount: resolved.length,
			employeeCount,
			totalGross,
			totalNet,
			currency: "PHP",
		},
		sourceFingerprint,
		sourceFilename: params.sourceFilename || null,
		sourceHash: params.sourceHash || null,
		expiresAt: new Date(expiresAtMs).toISOString(),
	};

	prunePreviewCache();
	previewCache.set(previewId, {
		organizationId: params.organizationId,
		createdByUserId: params.createdByUserId || null,
		result,
		inputRows: params.rows,
		expiresAtMs,
	});

	return result;
}

export function parseWorkbookRowsFromBuffer(buffer: Buffer): {
	rows: SpecialPayrollNormalizedInputRow[];
	sourceHash: string;
} {
	// Lazy require keeps unit tests for pure helpers free of xlsx if unused
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const xlsx = require("xlsx") as typeof import("xlsx");
	const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });
	const sheetName = workbook.SheetNames[0];
	if (!sheetName) {
		throw Object.assign(new Error("File has no worksheets"), {
			statusCode: 400,
			code: "EMPTY_WORKBOOK",
		});
	}
	const sheet = workbook.Sheets[sheetName];
	const rawData = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, {
		defval: "",
		raw: true,
	});
	if (!rawData.length) {
		throw Object.assign(new Error("File is empty"), {
			statusCode: 400,
			code: "EMPTY_FILE",
		});
	}

	const rows: SpecialPayrollNormalizedInputRow[] = rawData.map((raw, index) => {
		const normalized = normalizeSpecialPayrollImportRow(raw);
		const validated = validateSpecialPayrollRow(normalized);
		if (!validated.ok) {
			// Keep invalid rows so preview can report all-or-nothing errors
			return {
				employeeNumber: String(normalized.EMPLOYEE_NUMBER ?? "").trim(),
				compensationCode: String(normalized.COMPENSATION_CODE ?? "").trim(),
				amount: Number(normalized.AMOUNT) || 0,
				employeeName: String(normalized.EMPLOYEE_NAME ?? "").trim() || null,
				sourcePayDate: normalized.START_PAY_DATE
					? parseSpecialPayrollDate(normalized.START_PAY_DATE)
					: null,
				sourceRowNumber: index + 2,
			};
		}
		return {
			employeeNumber: validated.employeeNumber,
			compensationCode: validated.compensationCode,
			amount: validated.amount,
			employeeName: validated.employeeName,
			sourcePayDate: validated.sourcePayDate,
			sourceRowNumber: index + 2,
		};
	});

	return { rows, sourceHash: hashBuffer(buffer) };
}

export async function createSpecialPayrollRun(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		createdByUserId?: string | null;
		previewId: string;
		idempotencyKey: string;
		label?: string | null;
		rows?: SpecialPayrollNormalizedInputRow[];
		contextPayrollPeriodId?: string | null;
		contextPeriodCode?: string | null;
		sourceFilename?: string | null;
		sourceHash?: string | null;
		sourceFingerprint?: string | null;
	},
) {
	const idempotencyKey = String(params.idempotencyKey || "").trim();
	if (idempotencyKey.length < 8) {
		throw Object.assign(new Error("idempotencyKey is required (min 8 chars)"), {
			statusCode: 400,
			code: "IDEMPOTENCY_REQUIRED",
		});
	}

	const existing = await prisma.specialPayrollRun.findFirst({
		where: {
			organizationId: params.organizationId,
			idempotencyKey,
			isDeleted: false,
		},
		include: {
			lines: true,
			payslips: true,
		},
	});
	if (existing) {
		return { run: existing, reused: true as const };
	}

	prunePreviewCache();
	const cached = previewCache.get(params.previewId);
	if (!cached || cached.organizationId !== params.organizationId) {
		throw Object.assign(
			new Error("Preview expired or not found. Run preview again before create."),
			{ statusCode: 400, code: "PREVIEW_EXPIRED" },
		);
	}
	if (cached.expiresAtMs <= Date.now()) {
		previewCache.delete(params.previewId);
		throw Object.assign(new Error("Preview expired. Run preview again before create."), {
			statusCode: 400,
			code: "PREVIEW_EXPIRED",
		});
	}
	if (!cached.result.valid) {
		throw Object.assign(
			new Error("Cannot create Special Payroll from an invalid preview"),
			{ statusCode: 400, code: "PREVIEW_INVALID" },
		);
	}

	// Revalidate against current employee/catalog ownership inside one transaction path
	const revalidated = await buildSpecialPayrollPreview(prisma, {
		organizationId: params.organizationId,
		createdByUserId: params.createdByUserId,
		label: params.label || cached.result.label,
		contextPayrollPeriodId:
			params.contextPayrollPeriodId ??
			cached.result.periodContext.contextPayrollPeriodId,
		contextPeriodCode:
			params.contextPeriodCode ?? cached.result.periodContext.contextPeriodCode,
		rows: params.rows && params.rows.length > 0 ? params.rows : cached.inputRows,
		sourceFilename: params.sourceFilename ?? cached.result.sourceFilename,
		sourceHash: params.sourceHash ?? cached.result.sourceHash,
	});

	if (!revalidated.valid) {
		throw Object.assign(
			new Error("Revalidation failed; one or more rows are no longer valid"),
			{
				statusCode: 400,
				code: "REVALIDATION_FAILED",
				errors: revalidated.errors,
				preview: revalidated,
			},
		);
	}

	if (
		params.sourceFingerprint &&
		params.sourceFingerprint !== revalidated.sourceFingerprint
	) {
		throw Object.assign(new Error("Source fingerprint does not match revalidated preview"), {
			statusCode: 400,
			code: "FINGERPRINT_MISMATCH",
		});
	}

	// Prevent silent re-application of the same normalized payload in the same period context.
	const fingerprintHit = await prisma.specialPayrollRun.findFirst({
		where: {
			organizationId: params.organizationId,
			sourceFingerprint: revalidated.sourceFingerprint,
			isDeleted: false,
			status: { not: "CANCELLED" },
		},
		include: { lines: true, payslips: true },
	});
	if (fingerprintHit) {
		return { run: fingerprintHit, reused: true as const };
	}

	const runCode = buildSpecialPayrollRunCode();
	const period = revalidated.periodContext;

	try {
		const run = await prisma.$transaction(async (tx) => {
			// Idempotency race: re-check inside transaction
			const raced = await tx.specialPayrollRun.findFirst({
				where: {
					organizationId: params.organizationId,
					idempotencyKey,
					isDeleted: false,
				},
				include: { lines: true, payslips: true },
			});
			if (raced) return raced;

			const created = await tx.specialPayrollRun.create({
				data: {
					organizationId: params.organizationId,
					runCode,
					label: revalidated.label,
					runType: "SPECIAL_PAYROLL",
					status: "FINALIZED",
					contextPayrollPeriodId: period.contextPayrollPeriodId,
					contextPeriodCode: period.contextPeriodCode,
					contextPeriodName: period.contextPeriodName,
					contextStartDate: new Date(period.contextStartDate),
					contextEndDate: new Date(period.contextEndDate),
					contextPayDate: new Date(period.contextPayDate),
					totalGross: revalidated.totals.totalGross,
					totalNet: revalidated.totals.totalNet,
					lineCount: revalidated.totals.lineCount,
					employeeCount: revalidated.totals.employeeCount,
					currency: revalidated.totals.currency,
					sourceFilename: revalidated.sourceFilename,
					sourceHash: revalidated.sourceHash,
					sourceFingerprint: revalidated.sourceFingerprint,
					idempotencyKey,
					createdByUserId: params.createdByUserId || null,
					metadata: {
						previewId: params.previewId,
						createdMode: revalidated.sourceFilename ? "MASS_UPLOAD" : "MANUAL",
					},
				},
			});

			await tx.specialPayrollLine.createMany({
				data: revalidated.rows.map((row) => ({
					organizationId: params.organizationId,
					runId: created.id,
					employeeId: row.employeeId,
					employeeNumber: row.employeeNumber,
					employeeName: row.employeeName,
					benefitTypeId: row.benefitTypeId,
					compensationCode: row.compensationCode,
					compensationName: row.compensationName,
					direction: row.direction,
					isTaxable: row.isTaxable,
					amount: row.amount,
					sourceRowNumber: row.rowNumber,
					sourcePayDate: row.sourcePayDate,
				})),
			});

			// One payslip per employee aggregating their lines
			const byEmployee = new Map<string, typeof revalidated.rows>();
			for (const row of revalidated.rows) {
				const list = byEmployee.get(row.employeeId) || [];
				list.push(row);
				byEmployee.set(row.employeeId, list);
			}

			let sequence = 1;
			for (const [employeeId, lines] of byEmployee.entries()) {
				const first = lines[0];
				const gross = roundMoney(lines.reduce((s, l) => s + l.amount, 0));
				await tx.specialPayrollPayslip.create({
					data: {
						organizationId: params.organizationId,
						runId: created.id,
						employeeId,
						employeeNumber: first.employeeNumber,
						employeeName: first.employeeName,
						payslipNumber: buildSpecialPayslipNumber(runCode, sequence),
						grossPay: gross,
						netPay: gross,
						lineSnapshot: lines.map((l) => ({
							compensationCode: l.compensationCode,
							compensationName: l.compensationName,
							amount: l.amount,
							direction: l.direction,
							isTaxable: l.isTaxable,
							sourceRowNumber: l.rowNumber,
						})),
						isReleased: false,
					},
				});
				sequence += 1;
			}

			return tx.specialPayrollRun.findFirstOrThrow({
				where: { id: created.id },
				include: { lines: true, payslips: true },
			});
		});

		previewCache.delete(params.previewId);
		return { run, reused: false as const };
	} catch (error: any) {
		// Unique constraint on idempotencyKey under concurrency
		if (error?.code === "P2002") {
			const raced = await prisma.specialPayrollRun.findFirst({
				where: {
					organizationId: params.organizationId,
					idempotencyKey,
					isDeleted: false,
				},
				include: { lines: true, payslips: true },
			});
			if (raced) return { run: raced, reused: true as const };
		}
		throw error;
	}
}

export async function listSpecialPayrollRuns(
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		status?: string | null;
		contextPayrollPeriodId?: string | null;
		page?: number;
		limit?: number;
	},
) {
	const page = Math.max(1, params.page || 1);
	const limit = Math.min(100, Math.max(1, params.limit || 20));
	const where: Prisma.SpecialPayrollRunWhereInput = {
		organizationId: params.organizationId,
		isDeleted: false,
		...(params.status ? { status: params.status as any } : {}),
		...(params.contextPayrollPeriodId
			? { contextPayrollPeriodId: params.contextPayrollPeriodId }
			: {}),
	};

	const [total, runs] = await Promise.all([
		prisma.specialPayrollRun.count({ where }),
		prisma.specialPayrollRun.findMany({
			where,
			orderBy: { createdAt: "desc" },
			skip: (page - 1) * limit,
			take: limit,
			include: {
				_count: { select: { lines: true, payslips: true } },
			},
		}),
	]);

	return { runs, total, page, limit };
}

export async function getSpecialPayrollRun(
	prisma: PrismaExecutor,
	params: { organizationId: string; runId: string },
) {
	const run = await prisma.specialPayrollRun.findFirst({
		where: {
			id: params.runId,
			organizationId: params.organizationId,
			isDeleted: false,
		},
		include: {
			lines: { orderBy: { employeeNumber: "asc" } },
			payslips: { orderBy: { employeeNumber: "asc" } },
		},
	});
	if (!run) {
		throw Object.assign(new Error("Special Payroll run not found"), {
			statusCode: 404,
			code: "RUN_NOT_FOUND",
		});
	}
	return run;
}

export async function releaseSpecialPayrollRun(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		runId: string;
		releasedByUserId?: string | null;
		io?: SocketIOServer | null;
		sourceEmployeeId?: string | null;
	},
) {
	const run = await getSpecialPayrollRun(prisma, {
		organizationId: params.organizationId,
		runId: params.runId,
	});

	if (run.status === "CANCELLED") {
		throw Object.assign(new Error("Cannot release a cancelled Special Payroll run"), {
			statusCode: 400,
			code: "RUN_CANCELLED",
		});
	}
	if (run.status === "RELEASED") {
		return { run, alreadyReleased: true as const };
	}

	const releasedAt = new Date();
	const updated = await prisma.$transaction(async (tx) => {
		await tx.specialPayrollPayslip.updateMany({
			where: { runId: run.id, organizationId: params.organizationId },
			data: { isReleased: true, releasedAt },
		});
		return tx.specialPayrollRun.update({
			where: { id: run.id },
			data: {
				status: "RELEASED",
				releasedAt,
				releasedByUserId: params.releasedByUserId || null,
			},
			include: { lines: true, payslips: true },
		});
	});

	// Notifications (best-effort; do not roll back release)
	for (const payslip of updated.payslips) {
		try {
			await publishNotification({
				prisma,
				io: params.io,
				organizationId: params.organizationId,
				sourceEmployeeId: params.sourceEmployeeId ?? null,
				recipientEmployeeIds: [payslip.employeeId],
				category: "ANNOUNCEMENT",
				type: "SUCCESS",
				title: "Payslip available",
				description: `Your Special Payroll payslip for ${updated.label} is now available.`,
				eventKey: `specialPayrollPayslip:${payslip.id}:payslip-released`,
				metadata: {
					entityType: "SPECIAL_PAYROLL_PAYSLIP",
					entityId: payslip.id,
					employeeId: payslip.employeeId,
					specialPayrollRunId: updated.id,
					specialPayrollPayslipId: payslip.id,
					routeKey: "PAYSLIP_SELF_VIEW",
					action: "view",
					status: "PAYSLIP_RELEASED",
					specialPayroll: true,
					runLabel: updated.label,
				},
			});
		} catch (err) {
			logger.error(
				`Failed special payslip notification for payslip ${payslip.id}: ${err}`,
			);
		}
	}

	return { run: updated, alreadyReleased: false as const };
}

export async function cancelSpecialPayrollRun(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		runId: string;
		cancelledByUserId?: string | null;
		reason?: string | null;
	},
) {
	const run = await getSpecialPayrollRun(prisma, {
		organizationId: params.organizationId,
		runId: params.runId,
	});

	if (run.status === "RELEASED") {
		throw Object.assign(
			new Error("Released Special Payroll runs are immutable and cannot be cancelled"),
			{ statusCode: 400, code: "RUN_RELEASED_IMMUTABLE" },
		);
	}
	if (run.status === "CANCELLED") {
		return { run, alreadyCancelled: true as const };
	}

	const updated = await prisma.specialPayrollRun.update({
		where: { id: run.id },
		data: {
			status: "CANCELLED",
			cancelledAt: new Date(),
			cancelledByUserId: params.cancelledByUserId || null,
			cancelReason: params.reason || null,
		},
		include: { lines: true, payslips: true },
	});

	return { run: updated, alreadyCancelled: false as const };
}

export async function listSpecialPayrollPayslipsForRun(
	prisma: PrismaExecutor,
	params: { organizationId: string; runId: string },
) {
	await getSpecialPayrollRun(prisma, {
		organizationId: params.organizationId,
		runId: params.runId,
	});
	return prisma.specialPayrollPayslip.findMany({
		where: { runId: params.runId, organizationId: params.organizationId },
		orderBy: { employeeNumber: "asc" },
	});
}

export async function getSpecialPayrollPayslip(
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		payslipId: string;
		/** When set, enforce employee ownership for non-HR reads */
		employeeId?: string | null;
		allowUnreleased?: boolean;
	},
) {
	const payslip = await prisma.specialPayrollPayslip.findFirst({
		where: {
			id: params.payslipId,
			organizationId: params.organizationId,
		},
		include: {
			run: true,
		},
	});
	if (!payslip || payslip.run.isDeleted) {
		throw Object.assign(new Error("Special payslip not found"), {
			statusCode: 404,
			code: "PAYSLIP_NOT_FOUND",
		});
	}
	if (params.employeeId && payslip.employeeId !== params.employeeId) {
		throw Object.assign(new Error("Special payslip not found"), {
			statusCode: 404,
			code: "PAYSLIP_NOT_FOUND",
		});
	}
	if (!params.allowUnreleased && !payslip.isReleased) {
		throw Object.assign(new Error("Special payslip is not released"), {
			statusCode: 403,
			code: "PAYSLIP_NOT_RELEASED",
		});
	}
	return payslip;
}

export async function listReleasedSpecialPayslipsForEmployee(
	prisma: PrismaExecutor,
	params: { organizationId: string; employeeId: string },
) {
	return prisma.specialPayrollPayslip.findMany({
		where: {
			organizationId: params.organizationId,
			employeeId: params.employeeId,
			isReleased: true,
			run: { isDeleted: false, status: "RELEASED" },
		},
		include: {
			run: {
				select: {
					id: true,
					runCode: true,
					label: true,
					status: true,
					contextPeriodCode: true,
					contextPeriodName: true,
					contextStartDate: true,
					contextEndDate: true,
					contextPayDate: true,
					releasedAt: true,
				},
			},
		},
		orderBy: { releasedAt: "desc" },
	});
}
