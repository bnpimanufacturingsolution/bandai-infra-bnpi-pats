import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getLogger } from "./logger.helper";
import {
	asPayrollSourceDetails,
	formatPayrollSourceLabelWithCategory,
	getCoveredRegisterFieldsFromSourceDetails,
	groupPayrollSourceDetailsByRole,
	groupPayrollSourceDetailsByTaxability,
	type PayrollSourceDisplayDetail,
} from "./payroll-source-display.helper";

const logger = getLogger();
const payslipPdfLogger = logger.child({ module: "payslip-pdf-helper" });

export const DEFAULT_PAYSLIP_LOGO_URL =
	process.env.PAYSLIP_LOGO_URL ||
	"https://res.cloudinary.com/dyal0wstg/image/upload/v1759107126/Bandai_Ni_Bryan_1_1_ruj2ty.webp";

type PayslipEmployeeLike = {
	id: string;
	employeeId?: string | null;
	person?: {
		personalInfo?: {
			firstName?: string | null;
			lastName?: string | null;
		} | null;
	} | null;
	department?: {
		name?: string | null;
	} | null;
	position?: {
		title?: string | null;
	} | null;
};

type PayslipPeriodLike = {
	id: string;
	name?: string | null;
	startDate?: Date | string | null;
	endDate?: Date | string | null;
	payDate?: Date | string | null;
};

type PayslipPayrollLike = {
	id: string;
	basicPay: number;
	overtimePay?: number;
	nightDiffPay?: number;
	holidayPay?: number;
	allowances?: number;
	bonuses?: number;
	obAllowance?: number;
	deMinimisAllowance?: number;
	adjustmentOtNd?: number;
	otherCompensation?: number;
	grossPay: number;
	taxAmount: number;
	sssContribution: number;
	philHealthContribution: number;
	pagibigContribution: number;
	loanDeductions?: number;
	sssSalaryLoan?: number;
	otherDeductions?: number;
	modifiedHdmf2?: number;
	lateDeduction?: number;
	earlyOutDeduction?: number;
	absentDeduction?: number;
	totalDeductions: number;
	netPay: number;
	perfectAttendance?: number;
	mealAllowance?: number;
	lineLeaderAllowance?: number;
	assemblyStanding?: number;
	totalReceivable?: number;
	metadata?: {
		payrollSourceDetails?: unknown;
		/** Explicit next-period retro lines from PayrollCorrection apply */
		payrollCorrections?: Array<{
			correctionId?: string;
			label?: string;
			amount?: number;
			sourcePayrollPeriodName?: string | null;
			[key: string]: unknown;
		}>;
		[key: string]: unknown;
	} | null;
};

type PayslipRowKind = "group" | "item" | "subtotal";
type PayslipDisplayRow = {
	kind: PayslipRowKind;
	label: string;
	amount?: number;
};
type PayslipComputationRow = {
	label: string;
	amount: number;
	operation: "ADD" | "SUBTRACT" | "RESULT";
	emphasis?: "gross" | "deduction" | "net" | "receivable";
};
type PayslipAmountRow = {
	label: string;
	amount: number;
	/** group = section header (no amount contribution); item = normal line (default). */
	kind?: "group" | "item";
};

/** Map applied PayrollCorrection lines into payslip earnings rows (label + amount). */
export const extractPayrollCorrectionEarningsRows = (
	metadata?: PayslipPayrollLike["metadata"] | null,
): Array<PayslipAmountRow & { operation: "ADD" }> => {
	const lines = Array.isArray(metadata?.payrollCorrections) ? metadata!.payrollCorrections! : [];
	return lines
		.map((line) => {
			const label = String(line?.label || "Prior-period correction").trim() || "Prior-period correction";
			const amount = Number(line?.amount) || 0;
			return { label, amount, operation: "ADD" as const };
		})
		.filter((row) => Math.abs(row.amount) >= 0.005);
};
type PayslipFormulaProof = {
	grossRows: Array<PayslipAmountRow & { operation: "ADD" | "SUBTRACT" }>;
	grossRowsTotal: number;
	grossPay: number;
	grossGap: number;
	deductionRows: PayslipAmountRow[];
	deductionRowsTotal: number;
	totalDeductions: number;
	deductionGap: number;
	netPay: number;
	netPayGap: number;
	postNetRows: PayslipAmountRow[];
	postNetTotal: number;
	totalReceivable: number;
	totalReceivableGap: number;
};

export type PayslipPdfInput = {
	employee: PayslipEmployeeLike;
	payrollPeriod: PayslipPeriodLike;
	employeePayroll: PayslipPayrollLike;
	payslipReferenceNumber?: string;
	organizationName?: string;
	logoUrl?: string | null;
};

export const buildPayslipDeductionRows = (payroll: PayslipPayrollLike): Array<[string, number]> => {
	const attendanceTotal =
		Number(payroll.absentDeduction || 0) +
		Number(payroll.lateDeduction || 0) +
		Number(payroll.earlyOutDeduction || 0);
	const deductionRowsSource: Array<[string, number]> = [
		["Absent", payroll.absentDeduction || 0],
		["Late", payroll.lateDeduction || 0],
		["Early Out", payroll.earlyOutDeduction || 0],
		["Attendance Subtotal", attendanceTotal],
		["Withholding", payroll.taxAmount],
		["SSS", payroll.sssContribution],
		["PhilHealth", payroll.philHealthContribution],
		["Pag-IBIG", payroll.pagibigContribution],
		["Loans", payroll.loanDeductions || 0],
		["Other", payroll.otherDeductions || 0],
	];

	return deductionRowsSource.filter(([, amount]) => amount > 0);
};

const buildPayslipDeductionLayoutRows = (payroll: PayslipPayrollLike): PayslipDisplayRow[] => {
	const attendanceRows = [
		{ label: "Absent", amount: Number(payroll.absentDeduction || 0) },
		{ label: "Late", amount: Number(payroll.lateDeduction || 0) },
		{ label: "Early Out", amount: Number(payroll.earlyOutDeduction || 0) },
	].filter((row) => row.amount > 0);
	const attendanceSubtotal = attendanceRows.reduce((sum, row) => sum + row.amount, 0);

	const rows: PayslipDisplayRow[] = [];
	if (attendanceRows.length > 0) {
		rows.push({ kind: "group", label: "Attendance Deductions" });
		rows.push(...attendanceRows.map((row) => ({ kind: "item" as const, ...row })));
		rows.push({ kind: "subtotal", label: "Attendance Subtotal", amount: attendanceSubtotal });
	}

	rows.push({ kind: "group", label: "Taxes" });
	if ((payroll.taxAmount || 0) > 0) {
		rows.push({ kind: "item", label: "Withholding", amount: Number(payroll.taxAmount || 0) });
	}

	rows.push({ kind: "group", label: "Contributions" });
	if ((payroll.sssContribution || 0) > 0) {
		rows.push({ kind: "item", label: "SSS", amount: Number(payroll.sssContribution || 0) });
	}
	if ((payroll.philHealthContribution || 0) > 0) {
		rows.push({
			kind: "item",
			label: "PhilHealth",
			amount: Number(payroll.philHealthContribution || 0),
		});
	}
	if ((payroll.pagibigContribution || 0) > 0) {
		rows.push({
			kind: "item",
			label: "Pag-IBIG",
			amount: Number(payroll.pagibigContribution || 0),
		});
	}
	if ((payroll.loanDeductions || 0) > 0) {
		rows.push({ kind: "item", label: "Loans", amount: Number(payroll.loanDeductions || 0) });
	}
	if ((payroll.otherDeductions || 0) > 0) {
		rows.push({ kind: "item", label: "Other", amount: Number(payroll.otherDeductions || 0) });
	}

	return rows;
};

const formatCurrency = (value: number) => {
	const amount = new Intl.NumberFormat("en-PH", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(Number(value || 0));
	return `PHP ${amount}`;
};

const formatSignedCurrency = (row: PayslipComputationRow) => {
	const amount = formatCurrency(Math.abs(Number(row.amount || 0)));
	if (row.operation === "ADD") return `+${amount}`;
	if (row.operation === "SUBTRACT") return `-${amount}`;
	return amount;
};

const formatDeductionCurrency = (value: number) => `-${formatCurrency(Math.abs(Number(value || 0)))}`;

const roundPayslipMoney = (value: unknown) => {
	const rounded = Math.round(Number(value || 0) * 100) / 100;
	return Object.is(rounded, -0) ? 0 : rounded;
};

const nonZeroPayslipAmount = (value: unknown) => Math.abs(Number(value || 0)) >= 0.005;

/** Benefit lines under Non-taxable / Taxable group headers for payslip display. */
const sourceAmountRowsWithTaxGroups = (
	details: PayrollSourceDisplayDetail[],
	sectionLabel = "Benefits applied",
): PayslipAmountRow[] => {
	if (!details.length) return [];
	const { nonTaxable, taxable } = groupPayrollSourceDetailsByTaxability(details);
	const rows: PayslipAmountRow[] = [];
	const pushGroup = (taxLabel: string, groupDetails: PayrollSourceDisplayDetail[]) => {
		if (!groupDetails.length) return;
		rows.push({
			kind: "group",
			label: `${sectionLabel} — ${taxLabel}`,
			amount: 0,
		});
		for (const detail of groupDetails) {
			rows.push({
				kind: "item",
				label: formatPayrollSourceLabelWithCategory(detail),
				amount: Number(detail.amount || 0),
			});
		}
	};
	// Non-taxable first (common de minimis), then taxable
	pushGroup("Non-taxable", nonTaxable);
	pushGroup("Taxable", taxable);
	return rows;
};

export const buildPayslipFormulaProof = (payroll: PayslipPayrollLike): PayslipFormulaProof => {
	const sssSalaryLoan = Number(payroll.sssSalaryLoan ?? payroll.loanDeductions ?? 0);
	const modifiedHdmf2 = Number(payroll.modifiedHdmf2 ?? payroll.otherDeductions ?? 0);
	const sourceDetails = asPayrollSourceDetails(payroll.metadata?.payrollSourceDetails);
	const sourceByRole = groupPayrollSourceDetailsByRole(sourceDetails);
	const coveredRegisterFields = getCoveredRegisterFieldsFromSourceDetails(sourceDetails);
	const includeRegisterField = (field: string) => !coveredRegisterFields.has(field);
	const sourceAmountRows = (details: typeof sourceByRole.gross) =>
		details.map((detail) => ({
			label: formatPayrollSourceLabelWithCategory(detail),
			amount: Number(detail.amount || 0),
			kind: "item" as const,
		}));

	const postNetSourceGrouped = sourceAmountRowsWithTaxGroups(
		sourceByRole.postNet,
		"Post-net benefits",
	);
	const postNetRegisterRows = [
		...(includeRegisterField("perfectAttendance")
			? [{ label: "Perfect Attendance", amount: Number(payroll.perfectAttendance || 0), kind: "item" as const }]
			: []),
		...(includeRegisterField("mealAllowance")
			? [{ label: "Meal Allowance", amount: Number(payroll.mealAllowance || 0), kind: "item" as const }]
			: []),
		...(includeRegisterField("lineLeaderAllowance")
			? [
					{
						label: "Line Leader Allowance",
						amount: Number(payroll.lineLeaderAllowance || 0),
						kind: "item" as const,
					},
				]
			: []),
		...(includeRegisterField("assemblyStanding")
			? [
					{
						label: "Assembly Standing Allowance",
						amount: Number((payroll as any).assemblyStanding || 0),
						kind: "item" as const,
					},
				]
			: []),
	].filter((row) => nonZeroPayslipAmount(row.amount));
	const postNetRows = [...postNetRegisterRows, ...postNetSourceGrouped];
	const postNetTotal = roundPayslipMoney(
		postNetRows.reduce((sum, row) => sum + (row.kind === "group" ? 0 : row.amount), 0),
	);
	const totalReceivable = roundPayslipMoney(
		payroll.totalReceivable ?? Number(payroll.netPay || 0) + postNetTotal,
	);
	const benefitGrossRows = sourceAmountRowsWithTaxGroups(sourceByRole.gross).map((row) => ({
		...row,
		operation: "ADD" as const,
	}));
	const grossRows = [
		{ label: "Basic Pay", amount: Number(payroll.basicPay || 0), operation: "ADD" as const, kind: "item" as const },
		{
			label: "Absent Deduction",
			amount: Number(payroll.absentDeduction || 0),
			operation: "SUBTRACT" as const,
			kind: "item" as const,
		},
		{ label: "Overtime Pay", amount: Number(payroll.overtimePay || 0), operation: "ADD" as const, kind: "item" as const },
		{
			label: "Night Differential Pay",
			amount: Number(payroll.nightDiffPay || 0),
			operation: "ADD" as const,
			kind: "item" as const,
		},
		{ label: "Holiday Pay", amount: Number(payroll.holidayPay || 0), operation: "ADD" as const, kind: "item" as const },
		...(includeRegisterField("obAllowance")
			? [
					{
						label: "OB Allowance",
						amount: Number(payroll.obAllowance || 0),
						operation: "ADD" as const,
						kind: "item" as const,
					},
				]
			: []),
		...(includeRegisterField("deMinimisAllowance")
			? [
					{
						label: "De Minimis Allowance",
						amount: Number(payroll.deMinimisAllowance || 0),
						operation: "ADD" as const,
						kind: "item" as const,
					},
				]
			: []),
		...(includeRegisterField("adjustmentOtNd")
			? [
					{
						label: "Adjustment OT/ND",
						amount: Number(payroll.adjustmentOtNd || 0),
						operation: "ADD" as const,
						kind: "item" as const,
					},
				]
			: []),
		...benefitGrossRows,
		// Explicit next-period retro lines (PayrollCorrection apply → metadata.payrollCorrections)
		...extractPayrollCorrectionEarningsRows(payroll.metadata).map((row) => ({
			...row,
			kind: "item" as const,
		})),
		// Fallback when compensation was increased without labeled correction lines
		...(() => {
			const correctionRows = extractPayrollCorrectionEarningsRows(payroll.metadata);
			const correctionTotal = roundPayslipMoney(
				correctionRows.reduce((sum, row) => sum + row.amount, 0),
			);
			const otherCompensation = roundPayslipMoney(payroll.otherCompensation || 0);
			const residual = roundPayslipMoney(otherCompensation - correctionTotal);
			if (Math.abs(residual) < 0.005) return [];
			// Only surface residual when there are no explicit correction lines, or residual is extra
			if (correctionRows.length === 0) {
				return [
					{
						label: "Other Compensation",
						amount: otherCompensation,
						operation: "ADD" as const,
						kind: "item" as const,
					},
				];
			}
			if (Math.abs(residual) >= 0.005) {
				return [
					{
						label: "Other Compensation",
						amount: residual,
						operation: "ADD" as const,
						kind: "item" as const,
					},
				];
			}
			return [];
		})(),
	].filter(
		(row) =>
			row.kind === "group" ||
			row.label === "Basic Pay" ||
			row.label === "Absent Deduction" ||
			nonZeroPayslipAmount(row.amount),
	);
	const grossRowsTotal = roundPayslipMoney(
		grossRows.reduce((sum, row) => {
			if (row.kind === "group") return sum;
			return sum + (row.operation === "SUBTRACT" ? -row.amount : row.amount);
		}, 0),
	);
	const hasLoanSourceDetails = sourceByRole.deduction.some(
		(detail) => String(detail.direction || "").toUpperCase() === "LOAN",
	);
	const deductionRows = [
		{ label: "W/Tax", amount: Number(payroll.taxAmount || 0) },
		{ label: "SSS Contribution", amount: Number(payroll.sssContribution || 0) },
		{ label: "PhilHealth Contribution", amount: Number(payroll.philHealthContribution || 0) },
		{ label: "Pag-IBIG Contribution", amount: Number(payroll.pagibigContribution || 0) },
		...(hasLoanSourceDetails ? [] : [{ label: "SSS Salary Loan", amount: sssSalaryLoan }]),
		...(includeRegisterField("modifiedHdmf2")
			? [{ label: "Modified HDMF 2", amount: modifiedHdmf2 }]
			: []),
		...sourceAmountRows(sourceByRole.deduction),
	];
	const deductionRowsTotal = roundPayslipMoney(
		deductionRows.reduce((sum, row) => sum + (row.kind === "group" ? 0 : row.amount), 0),
	);
	const grossPay = roundPayslipMoney(payroll.grossPay);
	const totalDeductions = roundPayslipMoney(payroll.totalDeductions);
	const netPay = roundPayslipMoney(payroll.netPay);

	return {
		grossRows,
		grossRowsTotal,
		grossPay,
		grossGap: roundPayslipMoney(grossRowsTotal - grossPay),
		deductionRows,
		deductionRowsTotal,
		totalDeductions,
		deductionGap: roundPayslipMoney(deductionRowsTotal - totalDeductions),
		netPay,
		netPayGap: roundPayslipMoney(grossPay - totalDeductions - netPay),
		postNetRows,
		postNetTotal,
		totalReceivable,
		totalReceivableGap: roundPayslipMoney(netPay + postNetTotal - totalReceivable),
	};
};

export const buildPayslipComputationRows = (
	payroll: PayslipPayrollLike,
): PayslipComputationRow[] => {
	const proof = buildPayslipFormulaProof(payroll);
	// Skip group headers — computation proof rows are amount-only
	const grossRows: PayslipComputationRow[] = proof.grossRows
		.filter((row) => row.kind !== "group")
		.map((row) => ({
			label: row.label,
			amount: row.amount,
			operation: row.operation,
		}));

	const rows: PayslipComputationRow[] = [
		...grossRows,
		{ label: "GrossPay", amount: payroll.grossPay, operation: "RESULT", emphasis: "gross" },
		...proof.deductionRows
			.filter((row) => row.kind !== "group")
			.map((row) => ({
				label: row.label,
				amount: row.amount,
				operation: "SUBTRACT" as const,
			})),
		{
			label: "Total Deductions",
			amount: payroll.totalDeductions,
			operation: "SUBTRACT",
			emphasis: "deduction",
		},
		{ label: "NetPay", amount: payroll.netPay, operation: "RESULT", emphasis: "net" },
		...proof.postNetRows
			.filter((row) => row.kind !== "group")
			.map((row) => ({
				label: row.label,
				amount: row.amount,
				operation: "ADD" as const,
			})),
		{
			label: "TotalReceivable",
			amount: proof.totalReceivable,
			operation: "RESULT",
			emphasis: "receivable",
		},
	];

	return rows.filter(
		(row) =>
			row.emphasis ||
			[
				"W/Tax",
				"SSS Contribution",
				"PhilHealth Contribution",
			"Pag-IBIG Contribution",
			"SSS Salary Loan",
			"Modified HDMF 2",
			"Absent Deduction",
		].includes(row.label) ||
		Math.abs(Number(row.amount || 0)) >= 0.005,
	);
};

const formatDate = (value?: Date | string | null) => {
	if (!value) return "N/A";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "N/A";
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "2-digit",
	});
};

const asText = (value?: string | null) => (value || "").trim();
const hasObjectIdPattern = (value?: string | null) => Boolean(value && /[a-f0-9]{24}/i.test(value));

const buildEmployeeName = (employee: PayslipEmployeeLike) => {
	const firstName = asText(employee.person?.personalInfo?.firstName);
	const lastName = asText(employee.person?.personalInfo?.lastName);
	const fullName = `${firstName} ${lastName}`.trim();
	return fullName || "Employee";
};

async function loadLogoBytes(logoUrl?: string | null): Promise<Uint8Array | null> {
	if (!logoUrl) return null;

	const normalizedLogoUrl = normalizeLogoUrlForPdf(logoUrl);
	const logoCandidates =
		normalizedLogoUrl && normalizedLogoUrl !== logoUrl
			? [normalizedLogoUrl, logoUrl]
			: [logoUrl];

	for (const candidate of logoCandidates) {
		try {
			const response = await fetch(candidate);
			if (!response.ok) {
				payslipPdfLogger.warn(
					`Failed to fetch payslip logo (${response.status}) from ${candidate}`,
				);
				continue;
			}

			const arrayBuffer = await response.arrayBuffer();
			return new Uint8Array(arrayBuffer);
		} catch (candidateError: any) {
			payslipPdfLogger.warn(
				`Failed to fetch payslip logo from ${candidate}: ${candidateError?.message || candidateError}`,
			);
		}
	}

	return null;
}

function normalizeLogoUrlForPdf(logoUrl: string): string {
	if (!logoUrl) return logoUrl;

	let normalized = logoUrl;
	if (normalized.includes("/upload/") && !normalized.includes("/upload/f_png/")) {
		normalized = normalized.replace("/upload/", "/upload/f_png/");
	}
	normalized = normalized.replace(/\.webp(\?.*)?$/i, ".png$1");
	return normalized;
}

export function buildLegacyPayslipDocumentNumber(payrollPeriodId: string, employeeId: string) {
	return `PAYSLIP-${payrollPeriodId}-${employeeId}`;
}

const toReferenceToken = (value?: string | null, maxLength = 24) => {
	if (!value) return "";
	return value
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "")
		.slice(0, maxLength);
};

export function buildPayslipDocumentNumber(
	payrollPeriodId: string,
	employeeId: string,
	options?: {
		payrollPeriodName?: string | null;
		employeeCode?: string | null;
	},
) {
	const periodToken =
		toReferenceToken(options?.payrollPeriodName, 16) ||
		`P${payrollPeriodId.slice(-6).toUpperCase()}`;
	const employeeToken =
		toReferenceToken(options?.employeeCode, 16) || `E${employeeId.slice(-6).toUpperCase()}`;

	return `PSL-${periodToken}-${employeeToken}`;
}

export function resolvePayslipReferenceNumber(
	candidate: string | null | undefined,
	payrollPeriodId: string,
	employeeId: string,
	options?: {
		payrollPeriodName?: string | null;
		employeeCode?: string | null;
	},
) {
	const normalizedCandidate = asText(candidate);
	if (normalizedCandidate && !hasObjectIdPattern(normalizedCandidate)) {
		return normalizedCandidate;
	}

	return buildPayslipDocumentNumber(payrollPeriodId, employeeId, options);
}

export function buildPayslipFilename(employeeCode: string, periodName: string) {
	const safeEmployeeCode = employeeCode.replace(/[^a-zA-Z0-9_-]/g, "_");
	const safePeriodName = periodName.replace(/[^a-zA-Z0-9_-]/g, "_");
	return `Payslip-${safeEmployeeCode}-${safePeriodName}.pdf`;
}

const formatPayrollPeriodLabel = (period: PayslipPeriodLike) => {
	const start = formatDate(period.startDate);
	const end = formatDate(period.endDate);

	const hasRange = start !== "N/A" && end !== "N/A";
	if (hasRange) return `${start} - ${end}`;
	if (start !== "N/A") return start;
	if (end !== "N/A") return end;
	return "Payroll Period";
};

export async function generatePayslipPdfBuffer(input: PayslipPdfInput): Promise<Buffer> {
	const employeeName = buildEmployeeName(input.employee);
	const employeeCode = asText(input.employee.employeeId) || "-";
	const departmentName = asText(input.employee.department?.name);
	const positionTitle = asText(input.employee.position?.title);
	const payrollPeriodLabel = formatPayrollPeriodLabel(input.payrollPeriod);
	const organizationName = asText(input.organizationName) || "Bandai";
	const payroll = input.employeePayroll;

	const pdfDoc = await PDFDocument.create();
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

	const PAGE_WIDTH = 595;
	const MARGIN_X = 40;
	const TOP_MARGIN = 44;
	const BOTTOM_MARGIN = 44;
	const hasPositionOrDepartment = Boolean(positionTitle || departmentName);
	const formulaProof = buildPayslipFormulaProof(payroll);
	const totalReceivable = formulaProof.totalReceivable;
	const earningsRows = formulaProof.grossRows;
	const deductionRows = formulaProof.deductionRows;
	const postNetRows = formulaProof.postNetRows;
	const postNetSummaryHeight = postNetRows.length > 0 ? 18 + postNetRows.length * 18 : 0;

	const requiredHeight =
		TOP_MARGIN + // initial top margin
		26 + // header title/logo row
		18 + // header separator space
		18 + // employee + employee id row
		(hasPositionOrDepartment ? 18 : 0) + // optional position/department row
		18 + // payroll period row
		22 + // info separator and gap
		28 + // grouped section title
		Math.max(earningsRows.length, deductionRows.length) * 20 + // grouped rows
		96 + // gross/net/receivable summary
		postNetSummaryHeight + // post-net additions proof
		12 + // footer text row
		BOTTOM_MARGIN;

	const pageHeight = Math.max(620, requiredHeight);
	const page = pdfDoc.addPage([PAGE_WIDTH, pageHeight]);
	const { width } = page.getSize();

	const drawRightAmount = (
		text: string,
		anchorX: number,
		y: number,
		size: number,
		isBold = false,
	) => {
		const activeFont = isBold ? boldFont : font;
		const textWidth = activeFont.widthOfTextAtSize(text, size);
		page.drawText(text, {
			x: anchorX - textWidth,
			y,
			size,
			font: activeFont,
			color: rgb(0.1, 0.1, 0.1),
		});
	};
	const drawLineItem = (
		label: string,
		amountText: string,
		x: number,
		amountAnchorX: number,
		y: number,
		isBold = false,
	) => {
		page.drawText(label, {
			x,
			y,
			size: isBold ? 10 : 9.5,
			font: isBold ? boldFont : font,
			color: rgb(0.14, 0.14, 0.14),
		});
		drawRightAmount(amountText, amountAnchorX, y, isBold ? 10 : 9.5, isBold);
	};
	const drawGroupHeader = (label: string, x: number, y: number) => {
		const clipped =
			label.length > 42 ? `${label.slice(0, 41)}…` : label;
		page.drawText(clipped, {
			x,
			y,
			size: 8,
			font: boldFont,
			color: rgb(0.4, 0.4, 0.4),
		});
	};

	let cursorY = pageHeight - TOP_MARGIN;

	// Header and optional logo
	const logoBytes = await loadLogoBytes(input.logoUrl || DEFAULT_PAYSLIP_LOGO_URL);
	let usedLogo = false;
	if (logoBytes) {
		try {
			const logoImage = await pdfDoc.embedPng(logoBytes);
			const logoDims = logoImage.scale(0.2);
			const logoHeight = Math.min(42, logoDims.height);
			const logoWidth = Math.min(140, logoDims.width);
			page.drawImage(logoImage, {
				x: 40,
				y: cursorY - logoHeight + 6,
				width: logoWidth,
				height: logoHeight,
			});
			usedLogo = true;
		} catch {
			try {
				const logoImage = await pdfDoc.embedJpg(logoBytes);
				const logoDims = logoImage.scale(0.2);
				const logoHeight = Math.min(42, logoDims.height);
				const logoWidth = Math.min(140, logoDims.width);
				page.drawImage(logoImage, {
					x: 40,
					y: cursorY - logoHeight + 6,
					width: logoWidth,
					height: logoHeight,
				});
				usedLogo = true;
			} catch {
				payslipPdfLogger.warn(
					"Payslip logo could not be embedded (unsupported format). Falling back to text header.",
				);
			}
		}
	}

	if (!usedLogo) {
		page.drawText(organizationName, {
			x: 40,
			y: cursorY,
			size: 16,
			font: boldFont,
			color: rgb(0.9, 0.1, 0.1),
		});
	}

	page.drawText("EMPLOYEE PAYSLIP", {
		x: width - 200,
		y: cursorY,
		size: 12,
		font: boldFont,
		color: rgb(0.2, 0.2, 0.2),
	});

	cursorY -= 30;

	// Employee info
	cursorY -= 26;
	page.drawText(`Employee: ${employeeName}`, {
		x: MARGIN_X,
		y: cursorY,
		size: 11,
		font: boldFont,
		color: rgb(0.12, 0.12, 0.12),
	});
	page.drawText(`Employee ID: ${employeeCode}`, {
		x: 330,
		y: cursorY,
		size: 10,
		font,
		color: rgb(0.25, 0.25, 0.25),
	});

	if (hasPositionOrDepartment) {
		cursorY -= 18;
		if (positionTitle) {
			page.drawText(`Position: ${positionTitle}`, {
				x: MARGIN_X,
				y: cursorY,
				size: 10,
				font,
				color: rgb(0.25, 0.25, 0.25),
			});
		}
		if (departmentName) {
			page.drawText(`Department: ${departmentName}`, {
				x: 330,
				y: cursorY,
				size: 10,
				font,
				color: rgb(0.25, 0.25, 0.25),
			});
		}
	}

	cursorY -= 18;
	page.drawText(`Payroll Period: ${payrollPeriodLabel}`, {
		x: MARGIN_X,
		y: cursorY,
		size: 10,
		font,
		color: rgb(0.25, 0.25, 0.25),
	});

	cursorY -= 22;
	page.drawLine({
		start: { x: MARGIN_X, y: cursorY },
		end: { x: width - MARGIN_X, y: cursorY },
		thickness: 1,
		color: rgb(0.85, 0.85, 0.85),
	});

	// Grouped payroll computation
	cursorY -= 24;
	const leftX = MARGIN_X;
	const rightX = 330;
	const leftAmountX = 282;
	const rightAmountX = width - MARGIN_X;
	page.drawText("EARNINGS", {
		x: MARGIN_X,
		y: cursorY,
		size: 11,
		font: boldFont,
		color: rgb(0.88, 0.16, 0.16),
	});
	page.drawText("DEDUCTIONS", {
		x: rightX,
		y: cursorY,
		size: 11,
		font: boldFont,
		color: rgb(0.88, 0.16, 0.16),
	});

	cursorY -= 20;
	const sectionStartY = cursorY;
	for (let index = 0; index < earningsRows.length; index++) {
		const row = earningsRows[index];
		const y = sectionStartY - index * 20;
		if (row.kind === "group") {
			drawGroupHeader(row.label, leftX, y);
			continue;
		}
		const amountText = row.operation === "SUBTRACT"
			? formatDeductionCurrency(row.amount)
			: formatCurrency(row.amount);
		drawLineItem(row.label, amountText, leftX, leftAmountX, y);
	}
	for (let index = 0; index < deductionRows.length; index++) {
		const row = deductionRows[index];
		const y = sectionStartY - index * 20;
		if (row.kind === "group") {
			drawGroupHeader(row.label, rightX, y);
			continue;
		}
		drawLineItem(
			row.label,
			formatDeductionCurrency(row.amount),
			rightX,
			rightAmountX,
			y,
		);
	}

	cursorY = sectionStartY - Math.max(earningsRows.length, deductionRows.length) * 20 - 8;
	page.drawLine({
		start: { x: MARGIN_X, y: cursorY },
		end: { x: width - MARGIN_X, y: cursorY },
		thickness: 1,
		color: rgb(0.85, 0.85, 0.85),
	});

	cursorY -= 24;
	drawLineItem("GROSS PAY", formatCurrency(payroll.grossPay), leftX, leftAmountX, cursorY, true);
	drawLineItem(
		"TOTAL DEDUCTIONS",
		formatDeductionCurrency(payroll.totalDeductions),
		rightX,
		rightAmountX,
		cursorY,
		true,
	);

	cursorY -= 30;
	drawLineItem("NET PAY", formatCurrency(payroll.netPay), leftX, leftAmountX, cursorY, true);

	if (postNetRows.length > 0) {
		cursorY -= 24;
		page.drawText("POST-NET ADDITIONS", {
			x: leftX,
			y: cursorY,
			size: 9,
			font: boldFont,
			color: rgb(0.45, 0.45, 0.45),
		});
		for (let index = 0; index < postNetRows.length; index++) {
			const row = postNetRows[index];
			const y = cursorY - 18 - index * 18;
			if (row.kind === "group") {
				drawGroupHeader(row.label, leftX, y);
				continue;
			}
			drawLineItem(row.label, formatCurrency(row.amount), leftX, leftAmountX, y);
		}
		cursorY -= 18 + postNetRows.length * 18;
	}

	cursorY -= 40;
	page.drawRectangle({
		x: MARGIN_X,
		y: cursorY - 12,
		width: width - MARGIN_X * 2,
		height: 40,
		borderWidth: 1,
		borderColor: rgb(0.82, 0.82, 0.82),
		color: rgb(0.98, 0.98, 0.98),
	});
	page.drawText("TOTAL RECEIVABLE", {
		x: MARGIN_X + 12,
		y: cursorY,
		size: 13,
		font: boldFont,
		color: rgb(0.88, 0.16, 0.16),
	});
	drawRightAmount(formatCurrency(totalReceivable), width - MARGIN_X - 12, cursorY, 13, true);

	cursorY -= 34;
	const payslipRef = resolvePayslipReferenceNumber(
		input.payslipReferenceNumber,
		input.payrollPeriod.id,
		input.employee.id,
		{
			payrollPeriodName: input.payrollPeriod.name,
			employeeCode: input.employee.employeeId,
		},
	);
	page.drawText(`Payslip Ref: ${payslipRef} | Generated: ${new Date().toLocaleString("en-US")}`, {
		x: MARGIN_X,
		y: cursorY,
		size: 10,
		font,
		color: rgb(0.45, 0.45, 0.45),
	});

	const pdfBytes = await pdfDoc.save();
	return Buffer.from(pdfBytes);
}
