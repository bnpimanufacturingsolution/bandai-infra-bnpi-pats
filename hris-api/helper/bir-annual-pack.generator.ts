/**
 * Annual BIR pack generator (spec gap M8.2):
 *  - Sheet "Alphalist": one row per employee with payroll in the year
 *    (emp code, name, TIN, gross compensation, taxable compensation,
 *    tax withheld) — the BIR-required alphabetical list of payees.
 *  - Sheet "1604-CF": remittance-return summary totals for the year.
 *
 * Source of truth: `EmployeePayroll` register rows (grossPay / taxableIncome /
 * taxAmount). TIN read from Postgres truth `metadata.manpowerDatabank.tin`.
 */
import ExcelJS from "exceljs";
import type { PrismaClient } from "../generated/prisma";

export interface BirAlphalistRow {
	employeeCode: string;
	lastName: string;
	firstName: string;
	middleName: string;
	tin: string | null;
	grossCompensation: number;
	taxableCompensation: number;
	taxWithheld: number;
	registerRows: number;
}

const round2 = (value: number) => Math.round(Number(value || 0) * 100) / 100;

export function aggregateBirAlphalistRows(
	payrolls: Array<{
		employee: {
			employeeId: string;
			basicSalary?: number;
			metadata?: unknown;
			person?: { personalInfo?: { firstName?: string; middleName?: string; lastName?: string } | null } | null;
		};
		grossPay?: number | null;
		taxableIncome?: number | null;
		taxAmount?: number | null;
	}[]>,
): BirAlphalistRow[] {
	const byEmployee = new Map<string, BirAlphalistRow>();
	for (const entry of payrolls) {
		const key = entry.employee.employeeId;
		let existing = byEmployee.get(key);
		const md = (entry.employee.metadata as any)?.manpowerDatabank || {};
		if (!existing) {
			existing = {
				employeeCode: key,
				lastName: String(entry.employee.person?.personalInfo?.lastName || "").trim(),
				firstName: String(entry.employee.person?.personalInfo?.firstName || "").trim(),
				middleName: String(entry.employee.person?.personalInfo?.middleName || "").trim(),
				tin: md.tin ? String(md.tin).trim() : null,
				grossCompensation: 0,
				taxableCompensation: 0,
				taxWithheld: 0,
				registerRows: 0,
			};
			byEmployee.set(key, existing);
		}
		existing.grossCompensation += Number(entry.grossPay || 0);
		existing.taxableCompensation += Number(entry.taxableIncome || 0);
		existing.taxWithheld += Number(entry.taxAmount || 0);
		existing.registerRows += 1;
	}
	const rows = Array.from(byEmployee.values()).map((row) => ({
		...row,
		grossCompensation: round2(row.grossCompensation),
		taxableCompensation: round2(row.taxableCompensation),
		taxWithheld: round2(row.taxWithheld),
	}));
	rows.sort(
		(a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
	);
	return rows;
}

export function summarizeBir1604Cf(rows: BirAlphalistRow[]) {
	return {
		employees: rows.length,
		totalGrossCompensation: round2(rows.reduce((sum, row) => sum + row.grossCompensation, 0)),
		totalTaxableCompensation: round2(
			rows.reduce((sum, row) => sum + row.taxableCompensation, 0),
		),
		totalTaxWithheld: round2(rows.reduce((sum, row) => sum + row.taxWithheld, 0)),
		employeesWithTin: rows.filter((row) => row.tin).length,
		employeesMissingTin: rows.filter((row) => !row.tin).length,
	};
}

export async function generateBirAnnualPackWorkbook(
	prisma: PrismaClient,
	params: { organizationId: string; year: number },
): Promise<{ buffer: Buffer; filename: string; summary: ReturnType<typeof summarizeBir1604Cf> }> {
	const yearStart = new Date(Date.UTC(params.year, 0, 1));
	const yearEnd = new Date(Date.UTC(params.year + 1, 0, 1));

	const periods = await prisma.payrollPeriod.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			startDate: { gte: yearStart, lt: yearEnd },
		},
		select: { id: true },
	});

	const periodIds = periods.map((period) => period.id);

	const payrolls =
		periodIds.length > 0
			? await prisma.employeePayroll.findMany({
					where: {
						organizationId: params.organizationId,
						isDeleted: false,
						payrollPeriodId: { in: periodIds },
					},
					select: {
						id: true,
						grossPay: true,
						taxableIncome: true,
						taxAmount: true,
						employee: {
							select: {
								id: true,
								employeeId: true,
								metadata: true,
								person: { select: { personalInfo: true } },
							},
						},
					},
				})
			: [];

	const rows = aggregateBirAlphalistRows(payrolls);
	const summary = summarizeBir1604Cf(rows);

	const workbook = new ExcelJS.Workbook();
	workbook.creator = "BNPI HRIS";

	const alphaSheet = workbook.addWorksheet("Alphalist");
	alphaSheet.mergeCells("A1:H1");
	alphaSheet.getCell("A1").value = `BIR ALPHALIST OF PAYEES — ${params.year}`;
	alphaSheet.getCell("A1").font = { bold: true, size: 14 };
	alphaSheet.mergeCells("A2:H2");
	alphaSheet.getCell("A2").value = `Generated ${new Date().toISOString().slice(0, 10)}. Sorted alphabetically by last name.`;

	const headerRowIndex = 4;
	const headers = [
		"#",
		"TIN",
		"Last Name",
		"First Name",
		"Middle Name",
		"Gross Compensation",
		"Taxable Compensation",
		"Tax Withheld",
	];
	const headerRow = alphaSheet.getRow(headerRowIndex);
	headerRow.values = headers;
	headerRow.font = { bold: true };
	headerRow.eachCell((cell) => {
		cell.border = { top: { style: "thin" }, bottom: { style: "thin" } };
	});
	alphaSheet.columns.forEach((column, index) => {
		if (index === 0) column.width = 6;
		else if (index >= 1 && index <= 4) column.width = 22;
		else column.width = 20;
	});

	rows.forEach((row, index) => {
		const dataRow = alphaSheet.getRow(headerRowIndex + 1 + index);
		dataRow.values = [
			index + 1,
			row.tin || "Not on file",
			row.lastName,
			row.firstName,
			row.middleName,
			row.grossCompensation,
			row.taxableCompensation,
			row.taxWithheld,
		];
		[6, 7, 8].forEach((col) => {
			dataRow.getCell(col).numFmt = "#,##0.00";
		});
	});

	const cfSheet = workbook.addWorksheet("1604-CF");
	cfSheet.getCell("A1").value = `BIR FORM 1604-CF SUMMARY — ${params.year}`;
	cfSheet.getCell("A1").font = { bold: true, size: 14 };
	const cfRows: Array<[string, number | string]> = [
		["Number of employees with compensation", summary.employees],
		["Total gross compensation", summary.totalGrossCompensation],
		["Total taxable compensation", summary.totalTaxableCompensation],
		["Total taxes withheld", summary.totalTaxWithheld],
		["Employees with TIN on file", summary.employeesWithTin],
		["Employees missing TIN", summary.employeesMissingTin],
	];
	cfRows.forEach(([label, value], index) => {
		cfSheet.getCell(`A${3 + index}`).value = label;
		const valueCell = cfSheet.getCell(`C${3 + index}`);
		valueCell.value = value;
		if (typeof value === "number") valueCell.numFmt = "#,##0.00";
	});
	cfSheet.getColumn("A").width = 42;
	cfSheet.getColumn("C").width = 18;

	const arrayBuffer = await workbook.xlsx.writeBuffer();
	const filename = `BIR-Annual-Pack-${params.year}.xlsx`;

	return { buffer: Buffer.from(arrayBuffer as ArrayBuffer), filename, summary };
}
