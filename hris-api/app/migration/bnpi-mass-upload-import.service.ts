import * as XLSX from "xlsx";
import type { PrismaClient } from "../../generated/prisma";
import {
	compensationBenefitLabel,
	DEDUCTION_BENEFIT_CODE_LABELS,
	parseCompensationMassUploadRow,
	parseDeductionMassUploadRow,
} from "../../helper/bnpi-mass-upload-import.helper";
import {
	parseStatutoryBenefitsWorkbook,
	STATUTORY_MP2_BENEFIT_NAME,
} from "../../helper/bnpi-statutory-benefits-import.helper";
import { normalizeEmployeeBenefitPayload } from "../../helper/employee-benefit-program.helper";

export type MassUploadImportSummary = {
	kind: "compensation" | "deduction" | "statutory";
	total: number;
	created: number;
	updated: number;
	skipped: number;
	failed: number;
	errors: Array<{ row: number; field?: string; message: string }>;
	/** Payroll period codes that received at least one benefit enrollment. */
	periodCodes?: string[];
	/** Present for statutory remittance imports. */
	sheetName?: string;
	contributionOnlyEmployees?: number;
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

async function ensureBenefitType(
	prisma: PrismaClient,
	organizationId: string,
	code: string,
	options?: { name?: string; direction?: "COMPENSATION" | "DEDUCTION" },
) {
	const existing = await prisma.benefitType.findFirst({
		where: {
			organizationId,
			isDeleted: false,
			OR: [{ code: { equals: code, mode: "insensitive" } }, { name: { equals: code, mode: "insensitive" } }],
		},
		select: { id: true, code: true, name: true },
	});
	if (existing) return existing;

	const name = options?.name || compensationBenefitLabel(code);
	const direction = options?.direction || "COMPENSATION";
	// BenefitCategory has no DEDUCTION value ΓÇö use OTHER for deduction-direction types.
	// payrollDirection is the field that marks compensation vs deduction.
	return prisma.benefitType.create({
		data: {
			organizationId,
			code,
			name,
			category: direction === "DEDUCTION" ? "OTHER" : "ALLOWANCE",
			payrollDirection: direction,
			description: `Auto-created from BNPI mass upload (${code})`,
			isTaxable: direction === "COMPENSATION",
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

const MAX_MASS_UPLOAD_ERRORS = 50;

function pushImportError(
	summary: MassUploadImportSummary,
	error: { row: number; field?: string; message: string },
) {
	summary.failed += 1;
	if (summary.errors.length < MAX_MASS_UPLOAD_ERRORS) {
		summary.errors.push(error);
	}
}

export async function importCompensationMassUpload(params: {
	prisma: PrismaClient;
	organizationId: string;
	buffer: Buffer;
}): Promise<MassUploadImportSummary> {
	const rows = readSheetRows(params.buffer);
	const summary: MassUploadImportSummary = {
		kind: "compensation",
		total: rows.length,
		created: 0,
		updated: 0,
		skipped: 0,
		failed: 0,
		errors: [],
		periodCodes: [],
	};

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
		const parsed = parseCompensationMassUploadRow(raw);
		if (!parsed.ok) {
			pushImportError(summary, { row: rowNumber, message: parsed.error });
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
	if (!okRows.length) return summary;

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
	// Prefetch existing period-scoped enrollments once periods and types are known.
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

	// Warm period + type caches and collect period IDs for bulk existing lookup.
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
				pushImportError(summary, {
					row: row.rowNumber,
					field: "EmployeeID",
					message: `Employee ${row.employeeId} was not found.`,
				});
				continue;
			}

			const { dayKey, period } = await ensurePeriod(row.startDate);
			if (!period) {
				pushImportError(summary, {
					row: row.rowNumber,
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
				summary.updated += 1;
			} else {
				const created = await params.prisma.employeeBenefit.create({
					data: payload as any,
					select: { id: true },
				});
				existingByKey.set(key, created.id);
				summary.created += 1;
			}
			trackPeriodCode(summary, period.code);
		} catch (error: any) {
			pushImportError(summary, {
				row: row.rowNumber,
				message: error?.message || "Failed to import compensation row",
			});
		}
	}

	return summary;
}

export async function importDeductionMassUpload(params: {
	prisma: PrismaClient;
	organizationId: string;
	buffer: Buffer;
}): Promise<MassUploadImportSummary> {
	const rows = readSheetRows(params.buffer);
	const summary: MassUploadImportSummary = {
		kind: "deduction",
		total: rows.length,
		created: 0,
		updated: 0,
		skipped: 0,
		failed: 0,
		errors: [],
		periodCodes: [],
	};

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
		const parsed = parseDeductionMassUploadRow(raw);
		if (!parsed.ok) {
			pushImportError(summary, { row: rowNumber, message: parsed.error });
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
	if (!okRows.length) return summary;

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

	// Warm period + benefit-type caches and bulk-load existing period-scoped benefits.
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
				pushImportError(summary, {
					row: row.rowNumber,
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
					summary.updated += 1;
				} else {
					await params.prisma.employeeLoan.create({ data: loanData });
					summary.created += 1;
				}
				if (period) trackPeriodCode(summary, period.code);
				continue;
			}

			if (!period) {
				pushImportError(summary, {
					row: row.rowNumber,
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
				summary.updated += 1;
			} else {
				const created = await params.prisma.employeeBenefit.create({
					data: payload as any,
					select: { id: true },
				});
				existingBenefitByKey.set(key, created.id);
				summary.created += 1;
			}
			trackPeriodCode(summary, period.code);
		} catch (error: any) {
			pushImportError(summary, {
				row: row.rowNumber,
				message: error?.message || "Failed to import deduction row",
			});
		}
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
 * amounts into benefits ΓÇö those stay engine-computed by payroll schedule.
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
		sheetName: parsedBook.sheetName,
		contributionOnlyEmployees: parsedBook.contributionOnlyEmployees,
	};

	if (!parsedBook.deductionRows.length && parsedBook.errors.length) {
		summary.failed = Math.max(1, parsedBook.errors.length);
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
				// No end date in source ΓåÆ recurring every cutoff until superseded.
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
				message: error?.message || "Failed to import statutory deduction row",
			});
		}
	}

	return summary;
}
