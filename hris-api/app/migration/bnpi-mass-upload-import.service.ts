import * as XLSX from "xlsx";
import type { PrismaClient } from "../../generated/prisma";
import {
	compensationBenefitLabel,
	parseCompensationMassUploadRow,
	parseDeductionMassUploadRow,
} from "../../helper/bnpi-mass-upload-import.helper";
import { normalizeEmployeeBenefitPayload } from "../../helper/employee-benefit-program.helper";

export type MassUploadImportSummary = {
	kind: "compensation" | "deduction";
	total: number;
	created: number;
	updated: number;
	skipped: number;
	failed: number;
	errors: Array<{ row: number; field?: string; message: string }>;
};

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
	return prisma.benefitType.create({
		data: {
			organizationId,
			code,
			name,
			category: direction === "DEDUCTION" ? "DEDUCTION" : "ALLOWANCE",
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
	};

	for (const [index, raw] of rows.entries()) {
		const rowNumber = index + 2;
		const parsed = parseCompensationMassUploadRow(raw);
		if (!parsed.ok) {
			summary.failed += 1;
			summary.errors.push({ row: rowNumber, message: parsed.error });
			continue;
		}

		try {
			const employee = await params.prisma.employee.findFirst({
				where: {
					organizationId: params.organizationId,
					isDeleted: false,
					employeeId: parsed.employeeId,
				},
				select: { id: true },
			});
			if (!employee) {
				summary.failed += 1;
				summary.errors.push({
					row: rowNumber,
					field: "EmployeeID",
					message: `Employee ${parsed.employeeId} was not found.`,
				});
				continue;
			}

			const benefitType = await ensureBenefitType(params.prisma, params.organizationId, parsed.code, {
				name: compensationBenefitLabel(parsed.code),
				direction: "COMPENSATION",
			});

			const existing = await params.prisma.employeeBenefit.findFirst({
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
				amount: parsed.amount,
				totalAmount: parsed.amount,
				startDate: parsed.startDate,
				startPayrollCutOff: parsed.startDate,
				scheduleMode: "RECURRING",
				recurrenceFrequency: "EVERY_CUTOFF",
				totalInstallments: 0,
				attendanceBased: false,
				isActive: true,
				status: "ACTIVE",
				name: benefitType.name,
				notes: `BNPI Compensation Mass Upload row ${rowNumber}; COMCODE=${parsed.code}`,
				currency: "PHP",
				agreedToTerms: true,
			});

			if (existing) {
				await params.prisma.employeeBenefit.update({
					where: { id: existing.id },
					data: payload as any,
				});
				summary.updated += 1;
			} else {
				await params.prisma.employeeBenefit.create({
					data: payload as any,
				});
				summary.created += 1;
			}
		} catch (error: any) {
			summary.failed += 1;
			summary.errors.push({
				row: rowNumber,
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
	};

	for (const [index, raw] of rows.entries()) {
		const rowNumber = index + 2;
		const parsed = parseDeductionMassUploadRow(raw);
		if (!parsed.ok) {
			summary.failed += 1;
			summary.errors.push({ row: rowNumber, message: parsed.error });
			continue;
		}

		try {
			const employee = await params.prisma.employee.findFirst({
				where: {
					organizationId: params.organizationId,
					isDeleted: false,
					employeeId: parsed.employeeId,
				},
				select: { id: true },
			});
			if (!employee) {
				summary.failed += 1;
				summary.errors.push({
					row: rowNumber,
					field: "EmployeeID",
					message: `Employee ${parsed.employeeId} was not found.`,
				});
				continue;
			}

			if (parsed.kind === "loan" && parsed.loanTypeName) {
				const loanType = await ensureLoanType(
					params.prisma,
					params.organizationId,
					parsed.loanTypeName,
				);
				const termMonths = Math.max(1, Number(loanType.maxTermMonths || 12));
				const principal = parsed.principalAmount;
				const monthlyPayment = parsed.paymentAmount;
				const endDate = addMonths(parsed.startDate, termMonths);
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
					startDate: parsed.startDate,
					endDate,
					amountPaid: 0,
					balance: principal,
					status: "ACTIVE" as const,
					notes: `BNPI Deduction Mass Upload row ${rowNumber}; DEDCODE=${parsed.code}; payment=${monthlyPayment}`,
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

			const benefitCode = parsed.benefitCode || parsed.code;
			const benefitType = await ensureBenefitType(params.prisma, params.organizationId, benefitCode, {
				name: benefitCode,
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
				amount: parsed.paymentAmount,
				totalAmount: parsed.paymentAmount,
				startDate: parsed.startDate,
				startPayrollCutOff: parsed.startDate,
				scheduleMode: "RECURRING",
				recurrenceFrequency: "EVERY_CUTOFF",
				totalInstallments: 0,
				attendanceBased: false,
				isActive: true,
				status: "ACTIVE",
				name: benefitType.name,
				notes: `BNPI Deduction Mass Upload row ${rowNumber}; DEDCODE=${parsed.code}`,
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
				row: rowNumber,
				message: error?.message || "Failed to import deduction row",
			});
		}
	}

	return summary;
}
