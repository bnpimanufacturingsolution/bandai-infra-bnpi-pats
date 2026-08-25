/**
 * SSS R-3 (Contribution Collection List) and Pag-ibig MF (Membership
 * Savings) remittance schedule generators — same register-truth pattern as
 * the PhilHealth RF-1 generator.
 *
 * SSS: stored `EmployeePayroll.sssContribution` is the remitted total for the
 * period. The EE/ER/EC split is derived from the SSS bracket table by monthly
 * basic salary; when the stored total differs from the bracket total, the
 * bracket shares are scaled proportionally to match the stored amount (the
 * register is the money truth, the table only supplies the split ratio).
 *
 * Pag-ibig: stored `pagibigContribution` is the member+employer total.
 */
import ExcelJS from "exceljs";
import type { PrismaClient } from "../generated/prisma";
import { SSS_CONFIG } from "../config/payroll.config";

export interface SssR3Row {
	employeeCode: string;
	lastName: string;
	firstName: string;
	middleName: string;
	sssNo: string | null;
	monthlySalary: number;
	contribution: number;
	adjustment: number;
	employeeShare: number;
	employerShare: number;
	ec: number;
	total: number;
}

const round2 = (value: number) => Math.round(Number(value || 0) * 100) / 100;

function sssBracketFor(monthlySalary: number) {
	const salary = Number(monthlySalary || 0);
	const brackets = SSS_CONFIG.contributionTable as readonly {
		min: number;
		max: number;
		employeeShare: number;
		employerShare: number;
		ec: number;
		total: number;
	}[];
	return (
		brackets.find((bracket) => salary >= bracket.min && salary <= bracket.max) ||
		brackets.find((bracket) => salary < bracket.min) ||
		brackets[brackets.length - 1]
	);
}

export function buildSssR3Row(input: {
	employeeCode: string;
	personalInfo?: { firstName?: string; middleName?: string; lastName?: string } | null;
	sssNo?: string | null;
	basicSalary?: number | null;
	contribution?: number | null;
	adjustment?: number | null;
}): SssR3Row {
	const contribution = round2(input.contribution);
	const adjustment = round2(input.adjustment);
	const bracket = sssBracketFor(Number(input.basicSalary || 0));
	const bracketTotal = round2(bracket.employeeShare + bracket.employerShare + bracket.ec);

	let employeeShare = bracket.employeeShare;
	let employerShare = bracket.employerShare;
	let ec = bracket.ec;

	if (bracketTotal > 0 && contribution !== bracketTotal) {
		// Scale the bracket split to match the register truth.
		const factor = contribution / bracketTotal;
		employeeShare = Math.round(bracket.employeeShare * factor * 100) / 100;
		employerShare = Math.round(bracket.employerShare * factor * 100) / 100;
		ec = Math.round((contribution - employeeShare - employerShare) * 100) / 100;
	}

	return {
		employeeCode: input.employeeCode,
		lastName: String(input.personalInfo?.lastName || "").trim(),
		firstName: String(input.personalInfo?.firstName || "").trim(),
		middleName: String(input.personalInfo?.middleName || "").trim(),
		sssNo: input.sssNo ? String(input.sssNo).trim() : null,
		monthlySalary: round2(input.basicSalary),
		contribution,
		adjustment,
		employeeShare: round2(employeeShare),
		employerShare: round2(employerShare),
		ec,
		total: round2(contribution + adjustment),
	};
}

export function summarizeSssR3(rows: SssR3Row[]) {
	return {
		employees: rows.length,
		withSssNo: rows.filter((row) => row.sssNo).length,
		missingSssNo: rows.filter((row) => !row.sssNo).length,
		totalEmployeeShare: round2(rows.reduce((sum, row) => sum + row.employeeShare, 0)),
		totalEmployerShare: round2(rows.reduce((sum, row) => sum + row.employerShare, 0)),
		totalEc: round2(rows.reduce((sum, row) => sum + row.ec, 0)),
		total: round2(rows.reduce((sum, row) => sum + row.total, 0)),
	};
}

async function fetchPeriodRegister(
	prisma: PrismaClient,
	params: { organizationId: string; periodId: string },
) {
	const period = await prisma.payrollPeriod.findFirst({
		where: { id: params.periodId, organizationId: params.organizationId },
		select: { id: true, name: true, code: true, startDate: true, endDate: true, payDate: true },
	});
	if (!period) throw new Error("Payroll period not found");

	const entries = await prisma.employeePayroll.findMany({
		where: { organizationId: params.organizationId, isDeleted: false, payrollPeriodId: period.id },
		select: {
			id: true,
			isPaid: true,
			sssContribution: true,
			pagibigContribution: true,
			employee: {
				select: {
					id: true,
					employeeId: true,
					basicSalary: true,
					metadata: true,
					person: { select: { personalInfo: true } },
				},
			},
		},
	});

	return { period, entries };
}

const personalInfoOf = (entry: any) => entry?.employee?.person?.personalInfo || {};

const databankOf = (entry: any) =>
	(entry?.employee?.metadata as any)?.manpowerDatabank || {};

function sortByName<T extends { lastName: string; firstName: string }>(rows: T[]): T[] {
	return rows.sort(
		(a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
	);
}

export async function generateSssR3Workbook(
	prisma: PrismaClient,
	params: { organizationId: string; periodId: string },
): Promise<{ buffer: Buffer; filename: string; summary: ReturnType<typeof summarizeSssR3> }> {
	const { period, entries } = await fetchPeriodRegister(prisma, params);

	const rows = sortByName(
		entries.map((entry) =>
			buildSssR3Row({
				employeeCode: entry.employee.employeeId,
				personalInfo: personalInfoOf(entry),
				sssNo: databankOf(entry).sssNo || null,
				basicSalary: entry.employee.basicSalary,
				contribution: entry.sssContribution,
			}),
		),
	);
	const summary = summarizeSssR3(rows);

	const workbook = new ExcelJS.Workbook();
	workbook.creator = "BNPI HRIS";
	const sheet = workbook.addWorksheet("R-3");
	sheet.mergeCells("A1:H1");
	sheet.getCell("A1").value = "SSS R-3 — CONTRIBUTION COLLECTION LIST";
	sheet.getCell("A1").font = { bold: true, size: 14 };
	sheet.mergeCells("A2:H2");
	sheet.getCell("A2").value = `${period.name}${period.code ? ` (${period.code})` : ""}`;
	sheet.mergeCells("A3:H3");
	sheet.getCell("A3").value = `Period: ${period.startDate.toISOString().slice(0, 10)} to ${period.endDate.toISOString().slice(0, 10)} | Pay date: ${period.payDate.toISOString().slice(0, 10)}. Generated ${new Date().toISOString().slice(0, 10)}.`;

	const headerRowIndex = 5;
	const headerRow = sheet.getRow(headerRowIndex);
	headerRow.values = [
		"#",
		"SS Number",
		"Last Name",
		"First Name",
		"Middle Name",
		"Monthly Salary",
		"Employee Share",
		"Employer Share",
		"EC",
		"Total",
	];
	headerRow.font = { bold: true };
	headerRow.eachCell((cell) => {
		cell.border = { top: { style: "thin" }, bottom: { style: "thin" } };
	});
	sheet.columns.forEach((column, index) => {
		column.width = index === 0 ? 6 : index >= 5 && index <= 9 ? 18 : 22;
	});

	rows.forEach((row, index) => {
		const dataRow = sheet.getRow(headerRowIndex + 1 + index);
		dataRow.values = [
			index + 1,
			row.sssNo || "Not on file",
			row.lastName,
			row.firstName,
			row.middleName,
			row.monthlySalary,
			row.employeeShare,
			row.employerShare,
			row.ec,
			row.total,
		];
		[6, 7, 8, 9, 10].forEach((col) => {
			dataRow.getCell(col).numFmt = "#,##0.00";
		});
	});

	const totalRow = sheet.getRow(headerRowIndex + rows.length + 1);
	totalRow.values = [
		"",
		"TOTAL",
		`${summary.employees} employees`,
		`${summary.missingSssNo} missing SS No.`,
		"",
		"",
		summary.totalEmployeeShare,
		summary.totalEmployerShare,
		summary.totalEc,
		summary.total,
	];
	totalRow.font = { bold: true };
	[7, 8, 9, 10].forEach((col) => {
		totalRow.getCell(col).numFmt = "#,##0.00";
		totalRow.getCell(col).border = { top: { style: "double" } };
	});

	const arrayBuffer = await workbook.xlsx.writeBuffer();
	return {
		buffer: Buffer.from(arrayBuffer as ArrayBuffer),
		filename: `SSS-R3-${period.code || period.id}.xlsx`,
		summary,
	};
}

export interface PagibigMfRow {
	employeeCode: string;
	lastName: string;
	firstName: string;
	middleName: string;
	pagibigNo: string | null;
	monthlySalary: number;
	contribution: number;
	employeeShare: number;
	employerShare: number;
	total: number;
}

export function buildPagibigMfRow(input: {
	employeeCode: string;
	personalInfo?: { firstName?: string; middleName?: string; lastName?: string } | null;
	pagibigNo?: string | null;
	basicSalary?: number | null;
	contribution?: number | null;
}): PagibigMfRow {
	const contribution = round2(input.contribution);
	// Pag-ibig MF is a 50/50 member/employer match of the stored remittance.
	const half = round2(contribution / 2);
	return {
		employeeCode: input.employeeCode,
		lastName: String(input.personalInfo?.lastName || "").trim(),
		firstName: String(input.personalInfo?.firstName || "").trim(),
		middleName: String(input.personalInfo?.middleName || "").trim(),
		pagibigNo: input.pagibigNo ? String(input.pagibigNo).trim() : null,
		monthlySalary: round2(input.basicSalary),
		contribution,
		employeeShare: half,
		employerShare: round2(contribution - half),
		total: contribution,
	};
}

export function summarizePagibigMf(rows: PagibigMfRow[]) {
	return {
		employees: rows.length,
		withPagibigNo: rows.filter((row) => row.pagibigNo).length,
		missingPagibigNo: rows.filter((row) => !row.pagibigNo).length,
		totalEmployeeShare: round2(rows.reduce((sum, row) => sum + row.employeeShare, 0)),
		totalEmployerShare: round2(rows.reduce((sum, row) => sum + row.employerShare, 0)),
		total: round2(rows.reduce((sum, row) => sum + row.total, 0)),
	};
}

export async function generatePagibigMfWorkbook(
	prisma: PrismaClient,
	params: { organizationId: string; periodId: string },
): Promise<{ buffer: Buffer; filename: string; summary: ReturnType<typeof summarizePagibigMf> }> {
	const { period, entries } = await fetchPeriodRegister(prisma, params);

	const rows = sortByName(
		entries.map((entry) =>
			buildPagibigMfRow({
				employeeCode: entry.employee.employeeId,
				personalInfo: personalInfoOf(entry),
				pagibigNo: databankOf(entry).pagibigNo || null,
				basicSalary: entry.employee.basicSalary,
				contribution: entry.pagibigContribution,
			}),
		),
	);
	const summary = summarizePagibigMf(rows);

	const workbook = new ExcelJS.Workbook();
	workbook.creator = "BNPI HRIS";
	const sheet = workbook.addWorksheet("MF");
	sheet.mergeCells("A1:F1");
	sheet.getCell("A1").value = "PAG-IBIG (HDMF) MF — MEMBERSHIP SAVINGS REMITTANCE";
	sheet.getCell("A1").font = { bold: true, size: 14 };
	sheet.mergeCells("A2:F2");
	sheet.getCell("A2").value = `${period.name}${period.code ? ` (${period.code})` : ""}`;
	sheet.mergeCells("A3:F3");
	sheet.getCell("A3").value = `Period: ${period.startDate.toISOString().slice(0, 10)} to ${period.endDate.toISOString().slice(0, 10)} | Pay date: ${period.payDate.toISOString().slice(0, 10)}. Generated ${new Date().toISOString().slice(0, 10)}.`;

	const headerRowIndex = 5;
	const headerRow = sheet.getRow(headerRowIndex);
	headerRow.values = [
		"#",
		"PAG-IBIG MID No.",
		"Last Name",
		"First Name",
		"Employee Share",
		"Employer Share",
		"Total Savings",
	];
	headerRow.font = { bold: true };
	headerRow.eachCell((cell) => {
		cell.border = { top: { style: "thin" }, bottom: { style: "thin" } };
	});
	sheet.columns.forEach((column, index) => {
		column.width = index === 0 ? 6 : index >= 4 && index <= 6 ? 18 : 24;
	});

	rows.forEach((row, index) => {
		const dataRow = sheet.getRow(headerRowIndex + 1 + index);
		dataRow.values = [
			index + 1,
			row.pagibigNo || "Not on file",
			row.lastName,
			row.firstName,
			row.employeeShare,
			row.employerShare,
			row.total,
		];
		[5, 6, 7].forEach((col) => {
			dataRow.getCell(col).numFmt = "#,##0.00";
		});
	});

	const totalRow = sheet.getRow(headerRowIndex + rows.length + 1);
	totalRow.values = [
		"",
		"TOTAL",
		`${summary.employees} employees`,
		`${summary.missingPagibigNo} missing MID`,
		summary.totalEmployeeShare,
		summary.totalEmployerShare,
		summary.total,
	];
	totalRow.font = { bold: true };
	[5, 6, 7].forEach((col) => {
		totalRow.getCell(col).numFmt = "#,##0.00";
		totalRow.getCell(col).border = { top: { style: "double" } };
	});

	const arrayBuffer = await workbook.xlsx.writeBuffer();
	return {
		buffer: Buffer.from(arrayBuffer as ArrayBuffer),
		filename: `Pagibig-MF-${period.code || period.id}.xlsx`,
		summary,
	};
}
