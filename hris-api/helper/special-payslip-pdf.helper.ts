import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type SpecialPayslipPdfInput = {
	organizationName?: string;
	runLabel: string;
	runCode: string;
	payslipNumber: string;
	employeeNumber: string;
	employeeName: string;
	contextPeriodName?: string | null;
	contextStartDate?: string | Date | null;
	contextEndDate?: string | Date | null;
	contextPayDate?: string | Date | null;
	grossPay: number;
	netPay: number;
	lines: Array<{
		compensationCode: string;
		compensationName: string;
		amount: number;
		isTaxable?: boolean;
	}>;
};

const money = (value: number) =>
	`PHP ${Number(value || 0).toLocaleString("en-PH", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;

const dateOnly = (value?: string | Date | null) => {
	if (!value) return "—";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return String(value);
	return d.toISOString().slice(0, 10);
};

/**
 * Minimal Special Payroll payslip PDF.
 * Distinct from regular EmployeePayroll payslips: no statutory deductions; gross === net.
 */
export async function generateSpecialPayslipPdfBuffer(
	input: SpecialPayslipPdfInput,
): Promise<Buffer> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);

	const margin = 48;
	let y = 740;
	const draw = (text: string, opts?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> }) => {
		const size = opts?.size ?? 11;
		const use = opts?.bold ? bold : font;
		page.drawText(text, {
			x: margin,
			y,
			size,
			font: use,
			color: opts?.color ?? rgb(0.1, 0.1, 0.12),
		});
		y -= size + 6;
	};

	draw(input.organizationName || "Organization", { size: 14, bold: true });
	draw("SPECIAL PAYROLL PAYSLIP", {
		size: 16,
		bold: true,
		color: rgb(0.85, 0.35, 0.05),
	});
	y -= 4;
	draw(`Run: ${input.runLabel}`);
	draw(`Run code: ${input.runCode}`);
	draw(`Payslip: ${input.payslipNumber}`);
	draw(`Type: Special Payroll (one-time compensation)`);
	y -= 8;
	draw(`Employee: ${input.employeeName}`, { bold: true });
	draw(`Employee number: ${input.employeeNumber}`);
	if (input.contextPeriodName) {
		draw(`Period context: ${input.contextPeriodName}`);
	}
	draw(
		`Period dates: ${dateOnly(input.contextStartDate)} – ${dateOnly(input.contextEndDate)}`,
	);
	draw(`Pay date (context): ${dateOnly(input.contextPayDate)}`);
	y -= 10;
	draw("Compensation lines", { bold: true, size: 12 });
	y -= 2;

	for (const line of input.lines) {
		const tax = line.isTaxable ? " (taxable classification)" : "";
		draw(
			`• ${line.compensationCode} — ${line.compensationName}${tax}: ${money(line.amount)}`,
			{ size: 10 },
		);
	}

	y -= 12;
	draw(`Gross pay: ${money(input.grossPay)}`, { bold: true, size: 12 });
	draw(`Net pay: ${money(input.netPay)}`, { bold: true, size: 12 });
	y -= 8;
	draw("No statutory, withholding-tax, or regular payroll deductions apply to this payslip.", {
		size: 9,
		color: rgb(0.35, 0.35, 0.4),
	});
	draw("This document is not a regular employee payroll payslip.", {
		size: 9,
		color: rgb(0.35, 0.35, 0.4),
	});

	const bytes = await doc.save();
	return Buffer.from(bytes);
}
