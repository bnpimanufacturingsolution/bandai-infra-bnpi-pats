/**
 * PhilHealth RF-1 (Remittance Schedule) generator.
 *
 * Sourced from the payroll register truth: `EmployeePayroll.philHealthContribution`
 * (+ `philHealthContributionAdjustment`). The stored contribution is the TOTAL
 * monthly premium; PHIC rule splits it evenly (2.5% employee / 2.5% employer per
 * `PHILHEALTH_CONFIG`). The PhilHealth PIN is read from Postgres-truth
 * `Employee.metadata.manpowerDatabank.philhealthNo` when present.
 */
import ExcelJS from "exceljs";
import type { PrismaClient } from "../generated/prisma";
import { PHILHEALTH_CONFIG } from "../config/payroll.config";

export interface PhilhealthRf1Row {
	employeeCode: string;
	lastName: string;
	firstName: string;
	middleName: string;
	philhealthNo: string | null;
	monthlySalary: number;
	contribution: number;
	adjustment: number;
	employeeShare: number;
	employerShare: number;
	totalContribution: number;
}

const round2 = (value: number) => Math.round(Number(value || 0) * 100) / 100;

export function buildPhilhealthRf1Row(input: {
	employeeCode: string;
	personalInfo?: { firstName?: string; middleName?: string; lastName?: string } | null;
	philhealthNo?: string | null;
	basicSalary?: number | null;
	contribution?: number | null;
	adjustment?: number | null;
}): PhilhealthRf1Row {
	const contribution = round2(input.contribution);
	const adjustment = round2(input.adjustment);
	const half = round2(contribution / 2);
	return {
		employeeCode: input.employeeCode,
		lastName: String(input.personalInfo?.lastName || "").trim(),
		firstName: String(input.personalInfo?.firstName || "").trim(),
		middleName: String(input.personalInfo?.middleName || "").trim(),
		philhealthNo: input.philhealthNo ? String(input.philhealthNo).trim() : null,
		monthlySalary: round2(input.basicSalary),
		contribution,
		adjustment,
		employeeShare: half,
		employerShare: round2(contribution - half),
		totalContribution: round2(contribution + adjustment),
	};
}

export function summarizePhilhealthRf1Rows(rows: PhilhealthRf1Row[]) {
	return {
		employees: rows.length,
		withPin: rows.filter((row) => row.philhealthNo).length,
		missingPin: rows.filter((row) => !row.philhealthNo).length,
		totalContribution: round2(rows.reduce((sum, row) => sum + row.totalContribution, 0)),
	};
}

export async function generatePhilhealthRf1Workbook(
	prisma: PrismaClient,
	params: { organizationId: string; periodId: string },
): Promise<{ buffer: Buffer; filename: string; summary: ReturnType<typeof summarizePhilhealthRf1Rows> }> {
	const period = await prisma.payrollPeriod.findFirst({
		where: { id: params.periodId, organizationId: params.organizationId },
		select: {
			id: true,
			name: true,
			code: true,
			startDate: true,
			endDate: true,
			payDate: true,
			employeePayrolls: {
				where: { isDeleted: false },
				select: {
					id: true,
					philHealthContribution: true,
					philHealthContributionAdjustment: true,
					isPaid: true,
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
				orderBy: { id: "asc" },
			},
		},
	});

	if (!period) {
		throw new Error("Payroll period not found");
	}

	const rows = period.employeePayrolls.map((entry) =>
		buildPhilhealthRf1Row({
			employeeCode: entry.employee.employeeId,
			personalInfo: entry.employee.person?.personalInfo as
				| { firstName?: string; middleName?: string; lastName?: string }
				| undefined,
			philhealthNo:
				(entry.employee.metadata as any)?.manpowerDatabank?.philhealthNo || null,
			basicSalary: entry.employee.basicSalary,
			contribution: entry.philHealthContribution,
			adjustment: entry.philHealthContributionAdjustment,
		}),
	);

	rows.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
	const summary = summarizePhilhealthRf1Rows(rows);
	const totalEmployeeShare = round2(rows.reduce((sum, row) => sum + row.employeeShare, 0));
	const totalEmployerShare = round2(rows.reduce((sum, row) => sum + row.employerShare, 0));
	const totalAdjustment = round2(rows.reduce((sum, row) => sum + row.adjustment, 0));

	const workbook = new ExcelJS.Workbook();
	workbook.creator = "BNPI HRIS";
	const sheet = workbook.addWorksheet("RF-1");

	sheet.mergeCells("A1:I1");
	sheet.getCell("A1").value = "PHILHEALTH RF-1 — REMITTANCE SCHEDULE";
	sheet.getCell("A1").font = { bold: true, size: 14 };
	sheet.mergeCells("A2:I2");
	sheet.getCell("A2").value = `${period.name}${period.code ? ` (${period.code})` : ""}`;
	sheet.mergeCells("A3:I3");
	sheet.getCell("A3").value = `Period: ${period.startDate.toISOString().slice(0, 10)} to ${period.endDate.toISOString().slice(0, 10)} | Pay date: ${period.payDate.toISOString().slice(0, 10)}`;
	sheet.mergeCells("A4:I4");
	sheet.getCell("A4").value = `Premium rate: ${PHILHEALTH_CONFIG.premiumRate * 100}% total (${PHILHEALTH_CONFIG.employeeRate * 100}% employee / ${PHILHEALTH_CONFIG.employerRate * 100}% employer). Generated ${new Date().toISOString().slice(0, 10)}.`;

	const headerRowIndex = 6;
	const headers = [
		"#",
		"PhilHealth PIN",
		"Last Name",
		"First Name",
		"Middle Name",
		"Monthly Salary",
		"Employee Share",
		"Employer Share",
		"Total Contribution",
	];
	const headerRow = sheet.getRow(headerRowIndex);
	headerRow.values = headers;
	headerRow.font = { bold: true };
	headerRow.eachCell((cell) => {
		cell.border = { top: { style: "thin" }, bottom: { style: "thin" } };
	});
	sheet.columns.forEach((column, index) => {
		if (index >= 5) column.width = 18;
		else if (index >= 1 && index <= 4) column.width = 20;
		else column.width = 6;
	});

	rows.forEach((row, index) => {
		const dataRow = sheet.getRow(headerRowIndex + 1 + index);
		dataRow.values = [
			index + 1,
			row.philhealthNo || "Not on file",
			row.lastName,
			row.firstName,
			row.middleName,
			row.monthlySalary,
			row.employeeShare,
			row.employerShare,
			row.totalContribution,
		];
		[6, 7, 8, 9].forEach((col) => {
			dataRow.getCell(col).numFmt = "#,##0.00";
		});
	});

	const totalRowIndex = headerRowIndex + rows.length + 1;
	const totalRow = sheet.getRow(totalRowIndex);
	totalRow.values = [
		"",
		"TOTAL",
		`${summary.employees} employees`,
		`${summary.missingPin} missing PIN`,
		"",
		"",
		totalEmployeeShare,
		totalEmployerShare + totalAdjustment,
		summary.totalContribution,
	];
	totalRow.font = { bold: true };
	[7, 8, 9].forEach((col) => {
		totalRow.getCell(col).numFmt = "#,##0.00";
		totalRow.getCell(col).border = { top: { style: "double" } };
	});

	const arrayBuffer = await workbook.xlsx.writeBuffer();
	const filename = `PhilHealth-RF1-${period.code || period.id}.xlsx`;

	return {
		buffer: Buffer.from(arrayBuffer as ArrayBuffer),
		filename,
		summary,
	};
}
