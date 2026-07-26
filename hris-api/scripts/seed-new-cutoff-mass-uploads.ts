import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env.development.local"), override: true });

const prisma = new PrismaClient();

type UploadRow = {
	rowNumber: number;
	code: string;
	employeeCode: string;
	employeeName: string;
	amount: number;
	payment: number;
	startDate: string;
};

const compensationCodeMap: Record<
	string,
	{ name: string; reconciliationAction: "GROSS_INCLUDED" | "NET_ADJUSTMENT" | "RECEIVABLE_ONLY"; category?: string; note?: string }
> = {
	AON: { name: "Adjustment OT/ND", reconciliationAction: "GROSS_INCLUDED" },
	ARP: {
		name: "ARP",
		reconciliationAction: "RECEIVABLE_ONLY",
		note: "Code label NEEDS_CONFIRMATION; treated as receivable-only so it increases total receivable without changing gross.",
	},
	ABS: {
		name: "ABS",
		reconciliationAction: "NET_ADJUSTMENT",
		note: "Code label NEEDS_CONFIRMATION; treated as post-gross net adjustment until HRIS label is confirmed.",
	},
	LLA: { name: "Line Leader Allowance", reconciliationAction: "RECEIVABLE_ONLY" },
	MTX: {
		name: "MTX",
		reconciliationAction: "GROSS_INCLUDED",
		note: "Code label NEEDS_CONFIRMATION; treated as gross-included compensation.",
	},
	OAD: { name: "Other Compensation", reconciliationAction: "GROSS_INCLUDED" },
	OBA: { name: "OB Allowance", reconciliationAction: "GROSS_INCLUDED" },
	PFA: { name: "Perfect Attendance", reconciliationAction: "RECEIVABLE_ONLY" },
	TSA: { name: "Technical Skills Allowance", reconciliationAction: "GROSS_INCLUDED" },
};

const deductionLoanMap: Record<string, { name: string; category: string }> = {
	BNPISALLN: { name: "BNPI Salary Loan", category: "SALARY_LOAN" },
	HDMFCALLN: { name: "HDMF Calamity Loan", category: "PAGIBIG_LOAN" },
	HDMFSALLN: { name: "HDMF Salary Loan", category: "PAGIBIG_LOAN" },
	RCBCLN: { name: "RCBC Loan", category: "OTHER" },
	SSSCALLN: { name: "SSS Calamity Loan", category: "SSS_LOAN" },
	SSSELN: { name: "SSS Emergency Loan", category: "SSS_LOAN" },
	SSSSALLN: { name: "SSS Salary Loan", category: "SSS_LOAN" },
};

function arg(name: string) {
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string) {
	return process.argv.includes(`--${name}`);
}

function numberFrom(value: unknown) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	const text = String(value ?? "")
		.replace(/PHP/gi, "")
		.replace(/,/g, "")
		.trim();
	if (!text) return 0;
	const parsed = Number(text);
	return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeEmployeeCode(value: unknown) {
	const text = String(value ?? "").trim();
	const digits = text.replace(/[^0-9]/g, "");
	return digits ? digits.padStart(5, "0") : text.toUpperCase();
}

function dateOnlyUtc(key: string) {
	return new Date(`${key}T00:00:00.000Z`);
}

function dateKey(value: Date) {
	return value.toISOString().slice(0, 10);
}

function localDateKey(value: Date) {
	return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parseUploadDate(value: unknown, fallback: string) {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return localDateKey(value);
	const text = String(value ?? "").trim();
	if (!text) return fallback;
	const parts = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
	if (parts) {
		const year = Number(parts[3].length === 2 ? `20${parts[3]}` : parts[3]);
		return `${year}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
	}
	const parsed = new Date(text);
	return Number.isNaN(parsed.getTime()) ? fallback : localDateKey(parsed);
}

function readRows(filePath: string, kind: "compensation" | "deduction", startFallback: string): UploadRow[] {
	const workbook = XLSX.readFile(path.resolve(filePath), { cellDates: true });
	const sheet = workbook.Sheets[workbook.SheetNames[0]];
	const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
	return rows
		.map((row, index) => {
			const code = String(kind === "compensation" ? row.COMCODE : row.DEDCODE).trim().toUpperCase();
			const amount = kind === "compensation" ? numberFrom(row.Amount) : numberFrom(row[" Amount "] ?? row.Amount);
			const payment = kind === "compensation" ? amount : numberFrom(row[" Payment "] ?? row.Payment);
			return {
				rowNumber: index + 2,
				code,
				employeeCode: normalizeEmployeeCode(row.EmployeeID),
				employeeName: String(row.EmployeeName ?? "").trim(),
				amount,
				payment,
				startDate: parseUploadDate(kind === "compensation" ? row.StartPayDate : row.StartPayment, startFallback),
			};
		})
		.filter((row) => row.code && row.employeeCode && row.payment > 0);
}

function groupRows(rows: UploadRow[]) {
	const groups = new Map<string, UploadRow & { sourceRows: number[]; sourceRowCount: number }>();
	for (const row of rows) {
		const key = `${row.employeeCode}:${row.code}`;
		const current =
			groups.get(key) || {
				...row,
				amount: 0,
				payment: 0,
				sourceRows: [],
				sourceRowCount: 0,
			};
		current.amount += row.amount;
		current.payment += row.payment;
		current.sourceRows.push(row.rowNumber);
		current.sourceRowCount += 1;
		groups.set(key, current);
	}
	return Array.from(groups.values()).map((row) => ({
		...row,
		amount: Math.round(row.amount * 100) / 100,
		payment: Math.round(row.payment * 100) / 100,
	}));
}

async function snapshot(organizationId: string, payrollPeriodId: string, startDate: Date, endDate: Date) {
	return {
		employeeBenefits: await prisma.employeeBenefit.count({
			where: {
				organizationId,
				isDeleted: false,
				OR: [{ payrollPeriodId }, { payrollPeriodId: null, startDate: { lte: endDate }, OR: [{ endDate: null }, { endDate: { gte: startDate } }] }],
			},
		}),
		employeeLoans: await (prisma as any).employeeLoan.count({
			where: { organizationId, isDeleted: false, startDate: { lte: endDate }, endDate: { gte: startDate } },
		}),
	};
}

async function main() {
	const compensationWorkbook = arg("compensation");
	const deductionWorkbook = arg("deduction");
	const payrollPeriodId = arg("payrollPeriodId");
	const start = arg("start");
	const end = arg("end");
	const outputDir = path.resolve(arg("output-dir") || "../.runtime/new-cutoff-mass-upload-seed");
	const apply = hasFlag("apply");
	if (!compensationWorkbook || !deductionWorkbook || !payrollPeriodId || !start || !end) {
		throw new Error("Usage: --compensation=<xlsx> --deduction=<xlsx> --payrollPeriodId=<id> --start=YYYY-MM-DD --end=YYYY-MM-DD [--apply]");
	}
	fs.mkdirSync(outputDir, { recursive: true });

	const organizationId =
		arg("organizationId") ||
		(await prisma.organization.findFirst({
			where: { isDeleted: false },
			orderBy: { createdAt: "asc" },
			select: { id: true },
		}))?.id;
	if (!organizationId) throw new Error("No organization found.");

	const payrollPeriod = await prisma.payrollPeriod.findFirst({
		where: { id: payrollPeriodId, organizationId, isDeleted: false },
		select: { id: true, code: true, startDate: true, endDate: true, payDate: true, status: true },
	});
	if (!payrollPeriod) throw new Error(`Payroll period not found: ${payrollPeriodId}`);

	const startDate = dateOnlyUtc(start);
	const endDate = dateOnlyUtc(end);
	const compensationRows = readRows(compensationWorkbook, "compensation", start);
	const deductionRows = readRows(deductionWorkbook, "deduction", start);
	const groupedCompensationRows = groupRows(compensationRows);
	const groupedDeductionRows = groupRows(deductionRows);
	const employeeCodes = Array.from(new Set([...groupedCompensationRows, ...groupedDeductionRows].map((row) => row.employeeCode)));
	const employees = await prisma.employee.findMany({
		where: { organizationId, employeeId: { in: employeeCodes }, isDeleted: false },
		select: { id: true, employeeId: true },
	});
	const employeeByCode = new Map(employees.map((employee) => [employee.employeeId, employee]));
	const before = await snapshot(organizationId, payrollPeriodId, startDate, endDate);

	const compToImport = groupedCompensationRows.filter((row) => employeeByCode.has(row.employeeCode) && compensationCodeMap[row.code]);
	const compUnknownCodes = Array.from(new Set(groupedCompensationRows.filter((row) => !compensationCodeMap[row.code]).map((row) => row.code)));
	const deductionLoansToImport = groupedDeductionRows.filter((row) => employeeByCode.has(row.employeeCode) && deductionLoanMap[row.code]);
	const deductionBenefitToImport = groupedDeductionRows.filter((row) => employeeByCode.has(row.employeeCode) && row.code === "NEGADJ");
	const deductionUnknownCodes = Array.from(new Set(groupedDeductionRows.filter((row) => !deductionLoanMap[row.code] && row.code !== "NEGADJ").map((row) => row.code)));
	const unmatchedEmployees = employeeCodes.filter((code) => !employeeByCode.has(code));

	const existingBenefitTypes = await prisma.benefitType.findMany({
		where: {
			organizationId,
			code: { in: Array.from(new Set([...compToImport.map((row) => row.code), "NEGADJ"])) },
		},
		select: { id: true, code: true },
	});
	const existingLoanTypes = await (prisma as any).loanType.findMany({
		where: { organizationId, name: { in: Array.from(new Set(deductionLoansToImport.map((row) => deductionLoanMap[row.code].name))) } },
		select: { id: true, name: true },
	});
	const benefitTypeByCode = new Map(existingBenefitTypes.map((row) => [row.code.toUpperCase(), row]));
	const loanTypeByName = new Map(existingLoanTypes.map((row: any) => [String(row.name).toUpperCase(), row]));
	let benefitTypeCreates = 0;
	let benefitTypeUpdates = 0;
	let loanTypeCreates = 0;
	let loanTypeUpdates = 0;
	let employeeBenefitCreates = 0;
	let employeeBenefitUpdates = 0;
	let employeeLoanCreates = 0;
	let employeeLoanUpdates = 0;

	for (const code of new Set(compToImport.map((row) => row.code))) {
		if (benefitTypeByCode.has(code)) benefitTypeUpdates += 1;
		else benefitTypeCreates += 1;
	}
	if (deductionBenefitToImport.length) {
		if (benefitTypeByCode.has("NEGADJ")) benefitTypeUpdates += 1;
		else benefitTypeCreates += 1;
	}
	for (const name of new Set(deductionLoansToImport.map((row) => deductionLoanMap[row.code].name))) {
		if (loanTypeByName.has(name.toUpperCase())) loanTypeUpdates += 1;
		else loanTypeCreates += 1;
	}
	const compensationTotal = Math.round(compensationRows.reduce((sum, row) => sum + Math.round(row.payment * 100), 0)) / 100;
	const deductionPaymentTotal = Math.round(deductionRows.reduce((sum, row) => sum + Math.round(row.payment * 100), 0)) / 100;

	const evidenceBase = {
		mode: apply ? "apply" : "dry-run",
		files: { compensationWorkbook: path.resolve(compensationWorkbook), deductionWorkbook: path.resolve(deductionWorkbook) },
		organizationId,
		payrollPeriod,
		codeMaps: { compensationCodeMap, deductionLoanMap, deductionBenefitCodes: { NEGADJ: "Negative Adjustment" } },
		workbookRows: {
			compensationRows: compensationRows.length,
			compensationGroupedRows: groupedCompensationRows.length,
			deductionRows: deductionRows.length,
			deductionGroupedRows: groupedDeductionRows.length,
			compensationTotal,
			deductionPaymentTotal,
		},
		before,
		planned: {
			benefitTypeCreates,
			benefitTypeUpdates,
			loanTypeCreates,
			loanTypeUpdates,
			employeeBenefitRows: compToImport.length + deductionBenefitToImport.length,
			employeeLoanRows: deductionLoansToImport.length,
			compensationSkippedUnknownCodeCount: groupedCompensationRows.filter((row) => !compensationCodeMap[row.code]).length,
			deductionSkippedUnknownCodeCount: groupedDeductionRows.filter((row) => !deductionLoanMap[row.code] && row.code !== "NEGADJ").length,
		},
		gaps: {
			unmatchedEmployeeCount: unmatchedEmployees.length,
			unmatchedEmployees: unmatchedEmployees.slice(0, 100),
			compUnknownCodes,
			deductionUnknownCodes,
		},
		samples: {
			compensation: compToImport.slice(0, 20),
			deductionLoans: deductionLoansToImport.slice(0, 20),
			deductionBenefits: deductionBenefitToImport.slice(0, 20),
		},
	};
	fs.writeFileSync(path.join(outputDir, "mass-upload-seed-dry-run.json"), JSON.stringify(evidenceBase, null, 2));
	if (!apply) {
		console.log(JSON.stringify(evidenceBase, null, 2));
		return;
	}

	for (const [code, mapping] of Object.entries(compensationCodeMap)) {
		if (!compToImport.some((row) => row.code === code)) continue;
		await prisma.benefitType.upsert({
			where: { organizationId_code: { organizationId, code } },
			update: {
				name: mapping.name,
				category: (mapping.category || "ALLOWANCE") as any,
				payrollDirection: "COMPENSATION",
				reconciliationAction: mapping.reconciliationAction,
				isTaxable: mapping.reconciliationAction === "GROSS_INCLUDED",
				isActive: true,
				isDeleted: false,
				description: mapping.note || `New cutoff compensation upload code ${code}`,
			} as any,
			create: {
				organizationId,
				code,
				name: mapping.name,
				category: (mapping.category || "ALLOWANCE") as any,
				payrollDirection: "COMPENSATION",
				reconciliationAction: mapping.reconciliationAction,
				isTaxable: mapping.reconciliationAction === "GROSS_INCLUDED",
				isActive: true,
				isDeleted: false,
				description: mapping.note || `New cutoff compensation upload code ${code}`,
			} as any,
		});
	}
	if (deductionBenefitToImport.length) {
		await prisma.benefitType.upsert({
			where: { organizationId_code: { organizationId, code: "NEGADJ" } },
			update: {
				name: "Negative Adjustment",
				category: "OTHER" as any,
				payrollDirection: "DEDUCTION",
				reconciliationAction: "DEDUCTION",
				isTaxable: false,
				isActive: true,
				isDeleted: false,
				description: "New cutoff deduction upload code NEGADJ",
			} as any,
			create: {
				organizationId,
				code: "NEGADJ",
				name: "Negative Adjustment",
				category: "OTHER" as any,
				payrollDirection: "DEDUCTION",
				reconciliationAction: "DEDUCTION",
				isTaxable: false,
				isActive: true,
				isDeleted: false,
				description: "New cutoff deduction upload code NEGADJ",
			} as any,
		});
	}
	for (const mapping of new Map(deductionLoansToImport.map((row) => [deductionLoanMap[row.code].name, deductionLoanMap[row.code]])).values()) {
		await (prisma as any).loanType.upsert({
			where: { organizationId_name: { organizationId, name: mapping.name } },
			update: { category: mapping.category, isActive: true, isDeleted: false, maxTermMonths: 1 },
			create: { organizationId, name: mapping.name, category: mapping.category, isActive: true, isDeleted: false, maxTermMonths: 1 },
		});
	}

	const refreshedBenefitTypes = await prisma.benefitType.findMany({
		where: { organizationId, code: { in: Array.from(new Set([...compToImport.map((row) => row.code), "NEGADJ"])) }, isDeleted: false },
		select: { id: true, code: true, name: true },
	});
	const refreshedLoanTypes = await (prisma as any).loanType.findMany({
		where: { organizationId, name: { in: Array.from(new Set(deductionLoansToImport.map((row) => deductionLoanMap[row.code].name))) }, isDeleted: false },
		select: { id: true, name: true },
	});
	const refreshedBenefitTypeByCode = new Map(refreshedBenefitTypes.map((row) => [row.code.toUpperCase(), row]));
	const refreshedLoanTypeByName = new Map(refreshedLoanTypes.map((row: any) => [String(row.name).toUpperCase(), row]));

	for (const row of [...compToImport, ...deductionBenefitToImport]) {
		const employee = employeeByCode.get(row.employeeCode);
		const benefitType = refreshedBenefitTypeByCode.get(row.code === "NEGADJ" ? "NEGADJ" : row.code);
		if (!employee || !benefitType) continue;
		const existing = await prisma.employeeBenefit.findFirst({
			where: { organizationId, employeeId: employee.id, benefitTypeId: benefitType.id, payrollPeriodId, isDeleted: false },
			select: { id: true },
		});
		if (existing) employeeBenefitUpdates += 1;
		else employeeBenefitCreates += 1;
		const notes = [
			"new-cutoff mass upload seed",
			path.basename(row.code === "NEGADJ" ? deductionWorkbook : compensationWorkbook),
			`source rows ${row.sourceRows.join("/")}`,
			compensationCodeMap[row.code]?.note,
		]
			.filter(Boolean)
			.join(" | ");
		const payload = {
			name: benefitType.name,
			totalAmount: row.payment,
			totalInstallments: 1,
			installmentAmount: row.payment,
			remainingBalance: row.payment,
			amount: row.payment,
			payrollPeriodId,
			startDate,
			endDate,
			status: "ACTIVE",
			notes,
			remarks: notes,
			isActive: true,
			isDeleted: false,
		};
		if (existing) await prisma.employeeBenefit.update({ where: { id: existing.id }, data: payload as any });
		else {
			await prisma.employeeBenefit.create({
				data: { ...payload, organizationId, employeeId: employee.id, benefitTypeId: benefitType.id, currency: "PHP" } as any,
			});
		}
	}

	for (const row of deductionLoansToImport) {
		const employee = employeeByCode.get(row.employeeCode);
		const loanMapping = deductionLoanMap[row.code];
		const loanType = refreshedLoanTypeByName.get(loanMapping.name.toUpperCase());
		if (!employee || !loanType) continue;
		const existing = await (prisma as any).employeeLoan.findFirst({
			where: { organizationId, employeeId: employee.id, loanTypeId: loanType.id, startDate, endDate, isDeleted: false },
			select: { id: true },
		});
		if (existing) employeeLoanUpdates += 1;
		else employeeLoanCreates += 1;
		const payload = {
			principalAmount: row.amount || row.payment,
			totalAmount: row.amount || row.payment,
			termMonths: 1,
			monthlyPayment: row.payment,
			startDate,
			endDate,
			amountPaid: 0,
			balance: row.amount || row.payment,
			status: "ACTIVE",
			notes: ["new-cutoff mass upload seed", path.basename(deductionWorkbook), row.code, `source rows ${row.sourceRows.join("/")}`].join(" | "),
			isDeleted: false,
		};
		if (existing) await (prisma as any).employeeLoan.update({ where: { id: existing.id }, data: payload });
		else {
			await (prisma as any).employeeLoan.create({
				data: { ...payload, organizationId, employeeId: employee.id, loanTypeId: loanType.id },
			});
		}
	}

	const after = await snapshot(organizationId, payrollPeriodId, startDate, endDate);
	const result = {
		...evidenceBase,
		actual: { employeeBenefitCreates, employeeBenefitUpdates, employeeLoanCreates, employeeLoanUpdates },
		after,
	};
	fs.writeFileSync(path.join(outputDir, "mass-upload-seed-apply.json"), JSON.stringify(result, null, 2));
	console.log(JSON.stringify(result, null, 2));
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
