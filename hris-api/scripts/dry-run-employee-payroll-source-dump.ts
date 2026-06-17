import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, "..", "..");

const BANDAI_ANNUAL_WORK_DAYS = 313;
const BANDAI_WORKING_HOURS_PER_DAY = 8;
const CONTRIBUTION_SPLIT_BY_PAY_FREQUENCY: Record<string, number> = {
	SEMI_MONTHLY: 0.5,
	MONTHLY: 1,
	WEEKLY: 1 / 4,
	BIWEEKLY: 0.5,
	DAILY: 0,
	QUARTERLY: 3,
	ANNUALLY: 12,
};
const BANDAI_APPROVED_BUCKET_MULTIPLIERS = {
	regularOt: 1.25,
	restDay: 1.3,
	restDayOt: 1.69,
	specialHolidayPremium: 0.3,
	specialHolidayFull: 1.3,
	specialHolidayOt: 1.69,
	legalHoliday: 1,
	legalHolidayOt: 2.6,
	nightDiffPremium: 0.1,
};

const DEFAULT_TAX_RATES = [
	{ semiMonthlyBase: 0, semiMonthlyCap: 10417, semiMonthlyFixedTax: 0, monthlyBase: 0, monthlyCap: 20833, monthlyFixedTax: 0, rate: 0 },
	{ semiMonthlyBase: 10417, semiMonthlyCap: 16666, semiMonthlyFixedTax: 0, monthlyBase: 20833, monthlyCap: 33332, monthlyFixedTax: 0, rate: 0.15 },
	{ semiMonthlyBase: 16667, semiMonthlyCap: 33332, semiMonthlyFixedTax: 937.5, monthlyBase: 33333, monthlyCap: 66666, monthlyFixedTax: 1875, rate: 0.2 },
	{ semiMonthlyBase: 33333, semiMonthlyCap: 83332, semiMonthlyFixedTax: 4271, monthlyBase: 66667, monthlyCap: 166666, monthlyFixedTax: 8542, rate: 0.25 },
	{ semiMonthlyBase: 83333, semiMonthlyCap: 333332, semiMonthlyFixedTax: 16771, monthlyBase: 166667, monthlyCap: 666666, monthlyFixedTax: 33542, rate: 0.3 },
	{ semiMonthlyBase: 333333, semiMonthlyCap: null, semiMonthlyFixedTax: 91771, monthlyBase: 666667, monthlyCap: null, monthlyFixedTax: 183542, rate: 0.35 },
];

const DEFAULT_SSS_RATES = { employeeRate: 0.05, minimumBase: 250, maximumCeiling: 1750 };
const DEFAULT_PHILHEALTH_RATES = { employeeRate: 0.025, minimumBase: 10000, maximumCeiling: 2500 };
const DEFAULT_PAGIBIG_RATES = { rateBelowThreshold: 0.01, rateAboveThreshold: 0.02, threshold: 1500, maximumCeiling: 200 };

const REGISTER_FIELDS = [
	["G", "Monthly Salary", "monthlySalary"],
	["H", "Daily Salary", "dailySalary"],
	["I", "No. of Days", "numberOfDays"],
	["J", "Basic Salary", "basicPay"],
	["K", "Absent-Amt", "absentDeduction"],
	["L", "UT/Late-Amt", "lateUndertimeAmount"],
	["M", "No. of Reg OT Hrs", "regularOtHours"],
	["N", "Reg OT", "overtimePay"],
	["O", "RD Hrs", "restDayHours"],
	["P", "RD Hrs Pay", "restDayHoursPay"],
	["Q", "RD OT", "restDayOtHours"],
	["R", "RD OT Pay", "restDayOtPay"],
	["S", "Spc Hol OT Hrs", "specialHolidayOtHours"],
	["T", "Spc Hol OT", "specialHolidayOtPay"],
	["AA", "Leg Hol OT Hrs", "legalHolidayOtHours"],
	["AB", "Leg Hol OT", "legalHolidayOtPay"],
	["AG", "Night Differential", "nightDiffPay"],
	["AH", "Leave", "leavePay"],
	["AN", "OB Allowance", "obAllowance"],
	["BA", "Adjustment OT/ND", "adjustmentOtNd"],
	["BD", "De Minimis Allowance", "deMinimisAllowance"],
	["BH", "GrossPay", "grossPay"],
	["BI", "W/Tax", "taxAmount"],
	["BK", "SSS Cont", "sssContribution"],
	["BL", "PhilHealth", "philHealthContribution"],
	["BM", "Pagibig", "pagibigContribution"],
	["CD", "BNPI Emergency Loan", "bnpiEmergencyLoan"],
	["CE", "BNPI Salary Loan", "bnpiSalaryLoan"],
	["CF", "RCBC Loan", "rcbcLoan"],
	["CG", "HDMF Calamity Loan", "hdmfCalamityLoan"],
	["CH", "HDMF Salary Loan", "hdmfSalaryLoan"],
	["CI", "SSS Calamity Loan", "sssCalamityLoan"],
	["CJ", "SSS Salary Loan", "sssSalaryLoan"],
	["BW", "Modified HDMF 2", "modifiedHdmf2"],
	["CK", "TOTAL DEDN", "totalDeductions"],
	["CL", "NetPay", "netPay"],
	["CT", "Perfect Attendance", "perfectAttendance"],
	["CU", "Meal Allowance", "mealAllowance"],
	["CW", "TotalReceivable", "totalReceivable"],
] as const;

const args = new Map(
	process.argv
		.slice(2)
		.filter((arg) => arg.startsWith("--"))
		.map((arg) => {
			const [key, ...rest] = arg.slice(2).split("=");
			return [key, rest.join("=") || "true"];
		}),
);

const employeeQuery = args.get("employee") || args.get("employeeId") || "rio";
const periodCode = args.get("periodCode");
const periodId = args.get("periodId");
const start = args.get("start");
const end = args.get("end");
const outputDir = path.resolve(args.get("outputDir") || path.join(repoRoot, "test-results", "employee-payroll-source-dump"));

const numberValue = (value: unknown) => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value.replace(/[^\d.-]/g, ""));
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
};
const round2 = (value: unknown) => Math.round((numberValue(value) + Number.EPSILON) * 100) / 100;
const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const getText = (value: unknown) => String(value ?? "").trim();
const dateOnly = (value: Date | string) => new Date(value).toISOString().slice(0, 10);
const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const money = (value: unknown) =>
	`PHP ${round2(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hoursToDecimal = (value: unknown) => {
	const raw = getText(value);
	const match = raw.match(/^(\d+):(\d{2})$/);
	if (!match) return numberValue(raw);
	return round2(Number(match[1]) + Number(match[2]) / 60);
};
const minutesToHours = (minutes: number) => `${Math.floor(minutes / 60)}:${String(Math.abs(minutes % 60)).padStart(2, "0")}`;
const personName = (employee: any) => {
	const info = asRecord(employee.person?.personalInfo);
	return [info.firstName, info.middleName, info.lastName].map(getText).filter(Boolean).join(" ");
};
const normalize = (value: unknown) => getText(value).toLowerCase();

function calculateWithholdingTax(income: number, rawTaxRates: any[], isSemiMonthly: boolean) {
	const taxRates = rawTaxRates?.length ? rawTaxRates : DEFAULT_TAX_RATES;
	for (const bracket of taxRates) {
		const base = Number(isSemiMonthly ? bracket.semiMonthlyBase : bracket.monthlyBase);
		const capRaw = isSemiMonthly ? bracket.semiMonthlyCap : bracket.monthlyCap;
		const cap = capRaw === null || capRaw === undefined ? null : Number(capRaw);
		if (income >= base && (cap === null || income < cap)) {
			const fixedTax = Number(isSemiMonthly ? bracket.semiMonthlyFixedTax : bracket.monthlyFixedTax) || 0;
			return round2(fixedTax + (income - base) * (Number(bracket.rate) || 0));
		}
	}
	return 0;
}

function calculateSss(monthlyIncome: number, config: any) {
	const employeeRate = Number(config?.employeeRate ?? DEFAULT_SSS_RATES.employeeRate);
	if (monthlyIncome <= 0 || employeeRate <= 0) return 0;
	const maxMSC = Number(config?.maximumCeiling ?? DEFAULT_SSS_RATES.maximumCeiling) / employeeRate;
	const rawMin = Number(config?.minimumBase ?? DEFAULT_SSS_RATES.minimumBase);
	const minMSC = rawMin < 1000 ? rawMin / employeeRate : rawMin;
	const msc = Math.round(monthlyIncome / 500) * 500;
	return round2(Math.max(minMSC, Math.min(msc, maxMSC)) * employeeRate);
}

function calculatePhilHealth(monthlyIncome: number, config: any) {
	const employeeRate = Number(config?.employeeRate ?? DEFAULT_PHILHEALTH_RATES.employeeRate);
	if (monthlyIncome <= 0 || employeeRate <= 0) return 0;
	const floor = Math.max(Number(config?.minimumBase ?? DEFAULT_PHILHEALTH_RATES.minimumBase), 10000);
	const contribution = Math.max(monthlyIncome, floor) * employeeRate;
	return round2(Math.min(contribution, Number(config?.maximumCeiling ?? DEFAULT_PHILHEALTH_RATES.maximumCeiling)));
}

function calculatePagibig(monthlyIncome: number, config: any) {
	if (monthlyIncome <= 0) return 0;
	const threshold = Number(config?.threshold ?? DEFAULT_PAGIBIG_RATES.threshold);
	const rate = monthlyIncome <= threshold
		? Number(config?.rateBelowThreshold ?? DEFAULT_PAGIBIG_RATES.rateBelowThreshold)
		: Number(config?.rateAboveThreshold ?? DEFAULT_PAGIBIG_RATES.rateAboveThreshold);
	return round2(Math.min(monthlyIncome * rate, Number(config?.maximumCeiling ?? DEFAULT_PAGIBIG_RATES.maximumCeiling)));
}

function collectBucketTotals(lines: any[]) {
	const totals = {
		regularDays: 0,
		regOtHrs: 0,
		regNdHrs: 0,
		spclHrs: 0,
		spclOtHrs: 0,
		rholHrs: 0,
		rholOtHrs: 0,
		rdHrs: 0,
		rdOtHrs: 0,
	};
	for (const line of lines) {
		const buckets = asRecord(asRecord(line.metadata).bandaiPayrollSourceRepair).approvedBuckets || {};
		for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
			totals[key] = round2(totals[key] + numberValue(buckets[key]));
		}
	}
	return totals;
}

function classifySource(row: any) {
	const type = row.source;
	const direction = getText(row.direction || (type === "EmployeeLoan" ? "DEDUCTION" : "COMPENSATION")).toUpperCase();
	const action = getText(row.reconciliationAction).toUpperCase();
	const name = getText(row.name);
	const code = getText(row.code).toUpperCase();
	const amount = round2(row.amount);
	const isLoan = type === "EmployeeLoan" || direction === "LOAN";
	const isLeavePay = code === "LVP" || action === "LEAVE_PAY" || /leave pay|leave adjustment/i.test(name);
	const classification = isLoan
		? "loanDeduction"
		: isLeavePay
			? "leavePay"
		: direction === "DEDUCTION"
			? "deduction"
			: action === "GROSS_INCLUDED"
				? "grossIncluded"
				: action === "NET_ADJUSTMENT"
					? "netAdjustment"
					: "receivableOnly";
	return { ...row, name, amount, direction, reconciliationAction: action || null, classification };
}

function sumSources(rows: any[], predicate: (row: any) => boolean) {
	return round2(rows.filter(predicate).reduce((sum, row) => sum + numberValue(row.amount), 0));
}

function resolvePeriodBasicToMonthlyRate(employee: any) {
	const periodBasic = round2(employee.basicSalary);
	switch (String(employee.payFrequency || "").toUpperCase()) {
		case "SEMI_MONTHLY":
		case "BIWEEKLY":
			return round2(periodBasic * 2);
		case "WEEKLY":
			return round2(periodBasic * 4);
		case "ANNUALLY":
			return round2(periodBasic / 12);
		default:
			return periodBasic;
	}
}

function resolveContributionSplitFactor(params: {
	payFrequency?: string | null;
	periodNumber?: number | null;
	payrollPeriodMetadata?: unknown;
}) {
	const periodNumber = params.periodNumber || 1;
	const metadata = asRecord(params.payrollPeriodMetadata);
	const schedule = asRecord(metadata.statutoryContributionSchedule || metadata.contributionSchedule);
	const configuredFactor = schedule[`period${periodNumber}`] ?? schedule[String(periodNumber)];

	if (typeof configuredFactor === "number" && configuredFactor >= 0) {
		return {
			splitFactor: configuredFactor,
			method: "PAYROLL_PERIOD_METADATA",
		};
	}

	if (String(params.payFrequency || "").toUpperCase() === "SEMI_MONTHLY") {
		return {
			splitFactor: periodNumber === 1 ? 1 : 0,
			method: "BNPI_FIRST_CUTOFF_FULL_SECOND_CUTOFF_NONE",
		};
	}

	return {
		splitFactor: CONTRIBUTION_SPLIT_BY_PAY_FREQUENCY[String(params.payFrequency)] ?? 1,
		method: "PAY_FREQUENCY_DEFAULT",
	};
}

async function main() {
	const employees = await prisma.employee.findMany({
		where: { isDeleted: false },
		take: 5000,
		select: {
			id: true,
			organizationId: true,
			employeeId: true,
			basicSalary: true,
			payFrequency: true,
			employmentStatus: true,
			person: { select: { personalInfo: true } },
			department: { select: { name: true, code: true } },
			section: { select: { name: true, code: true } },
			position: { select: { title: true, code: true } },
			embeddedSchedule: true,
		},
	});
	const matches = employees.filter((employee) => {
		const query = normalize(employeeQuery);
		return (
			normalize(employee.employeeId) === query ||
			normalize(employee.employeeId).includes(query) ||
			normalize(personName(employee)).includes(query)
		);
	});
	if (matches.length !== 1) {
		const candidates = matches.slice(0, 25).map((employee) => ({
			id: employee.id,
			employeeId: employee.employeeId,
			name: personName(employee),
			basicSalary: employee.basicSalary,
			payFrequency: employee.payFrequency,
			employmentStatus: employee.employmentStatus,
		}));
		console.log(JSON.stringify({ status: "needs-specific-employee", employeeQuery, matchCount: matches.length, candidates }, null, 2));
		return;
	}

	const employee = matches[0];
	const periodWhere: any = { organizationId: employee.organizationId, isDeleted: false };
	if (periodId) periodWhere.id = periodId;
	if (periodCode) periodWhere.code = periodCode;
	const timesheetWhere: any = {
		organizationId: employee.organizationId,
		employeeId: employee.id,
		isDeleted: false,
	};
	if (periodId || periodCode) timesheetWhere.payrollPeriod = periodWhere;
	if (start && end) {
		timesheetWhere.timesheetlines = {
			some: { date: { gte: toDate(start), lte: toDate(end) }, isDeleted: false, isEffective: true },
		};
	}
	const timesheets = await prisma.timesheet.findMany({
		where: timesheetWhere,
		orderBy: [{ payrollPeriod: { startDate: "desc" } }, { updatedAt: "desc" }],
		take: 10,
		select: {
			id: true,
			code: true,
			status: true,
			lockedAt: true,
			payrollPeriodId: true,
			totalHoursWorked: true,
			totalRegularHours: true,
			totalOvertimeHours: true,
			totalUndertimeHours: true,
			totalLateHours: true,
			totalEarlyOutHours: true,
			metadata: true,
			payrollPeriod: { select: { id: true, code: true, name: true, startDate: true, endDate: true, periodNumber: true, calculatorId: true, generationMetadata: true } },
		},
	});
	if (!timesheets.length) {
		console.log(JSON.stringify({ status: "no-timesheet-found", employeeId: employee.employeeId, employeeName: personName(employee), periodCode, periodId, start, end }, null, 2));
		return;
	}
	const timesheet = timesheets[0];
	const range = {
		startDate: start ? toDate(start) : timesheet.payrollPeriod.startDate,
		endDate: end ? toDate(end) : timesheet.payrollPeriod.endDate,
	};
	const [lines, calculator, employeePayroll, benefits, loans] = await Promise.all([
		prisma.timesheetline.findMany({
			where: {
				organizationId: employee.organizationId,
				employeeId: employee.id,
				timesheetId: timesheet.id,
				isDeleted: false,
				isEffective: true,
				date: { gte: range.startDate, lte: range.endDate },
			},
			orderBy: { date: "asc" },
		}),
		prisma.calculator.findFirst({
			where: {
				organizationId: employee.organizationId,
				isDeleted: false,
				OR: [{ id: timesheet.payrollPeriod.calculatorId || "" }, { isDefault: true }, { isActive: true }],
			},
			orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
		}),
		prisma.employeePayroll.findFirst({
			where: {
				organizationId: employee.organizationId,
				employeeId: employee.id,
				payrollPeriodId: timesheet.payrollPeriodId,
				isDeleted: false,
			},
		}),
		prisma.employeeBenefit.findMany({
			where: {
				organizationId: employee.organizationId,
				employeeId: employee.id,
				isDeleted: false,
				isActive: true,
				status: { in: ["ACTIVE", "APPROVED"] as any },
				OR: [{ payrollPeriodId: timesheet.payrollPeriodId }, { startDate: { lte: range.endDate }, OR: [{ endDate: null }, { endDate: { gte: range.startDate } }] }],
			},
			include: { benefitType: true },
		}),
		prisma.employeeLoan.findMany({
			where: {
				organizationId: employee.organizationId,
				employeeId: employee.id,
				isDeleted: false,
				status: { in: ["ACTIVE", "APPROVED"] as any },
				startDate: { lte: range.endDate },
				endDate: { gte: range.startDate },
				loanType: { isDeleted: false, isActive: true },
			},
			include: { loanType: true },
		}),
	]);

	const periodBasic = round2(employee.basicSalary);
	const monthlySalary = resolvePeriodBasicToMonthlyRate(employee);
	const exactBandaiDailyRate = (monthlySalary * 12) / BANDAI_ANNUAL_WORK_DAYS;
	const exactHourlyRate = exactBandaiDailyRate / BANDAI_WORKING_HOURS_PER_DAY;
	const bandaiDailyRate = round2(exactBandaiDailyRate);
	const hourlyRate = round2(exactHourlyRate);
	const minuteRate = round2(exactHourlyRate / 60);
	const buckets = collectBucketTotals(lines);
	const actualDays = round2(lines.reduce((sum, line) => sum + (["PRESENT", "LEAVE", "HOLIDAY"].includes(getText(line.status).toUpperCase()) ? 1 : 0), 0));
	const displayDailySalary = actualDays > 0 ? round2(periodBasic / actualDays) : 0;
	const absentDays = lines.filter((line) => getText(line.status).toUpperCase() === "ABSENT").length;
	const lateMinutes = lines.reduce((sum, line) => sum + Math.round(hoursToDecimal(line.lateHours) * 60), 0);
	const undertimeMinutes = lines.reduce((sum, line) => sum + Math.round(hoursToDecimal(line.undertimeHours) * 60), 0);
	const absentDeduction = round2(absentDays * exactBandaiDailyRate);
	const lateUndertimeAmount = round2((lateMinutes + undertimeMinutes) * (exactHourlyRate / 60));
	const basicPay = periodBasic;
	const regularOtPay = round2(buckets.regOtHrs * exactHourlyRate * BANDAI_APPROVED_BUCKET_MULTIPLIERS.regularOt);
	const restDayPay = round2(buckets.rdHrs * exactHourlyRate * BANDAI_APPROVED_BUCKET_MULTIPLIERS.restDay);
	const restDayOtPay = round2(buckets.rdOtHrs * exactHourlyRate * BANDAI_APPROVED_BUCKET_MULTIPLIERS.restDayOt);
	const specialHolidayPay = round2(
		buckets.spclHrs * exactHourlyRate * BANDAI_APPROVED_BUCKET_MULTIPLIERS.specialHolidayPremium +
			buckets.spclOtHrs * exactHourlyRate * BANDAI_APPROVED_BUCKET_MULTIPLIERS.specialHolidayOt,
	);
	const legalHolidayPay = round2(
		buckets.rholHrs * exactHourlyRate * BANDAI_APPROVED_BUCKET_MULTIPLIERS.legalHoliday +
			buckets.rholOtHrs * exactHourlyRate * BANDAI_APPROVED_BUCKET_MULTIPLIERS.legalHolidayOt,
	);
	const nightDiffPay = round2(buckets.regNdHrs * exactHourlyRate * BANDAI_APPROVED_BUCKET_MULTIPLIERS.nightDiffPremium);

	const sourceRows = [
		...benefits.map((benefit: any) =>
			classifySource({
				source: "EmployeeBenefit",
				id: benefit.id,
				code: benefit.benefitType?.code,
				name: benefit.benefitType?.name || benefit.name,
				amount: benefit.amount ?? benefit.totalAmount ?? benefit.installmentAmount,
				direction: benefit.benefitType?.payrollDirection,
				reconciliationAction: benefit.benefitType?.reconciliationAction,
				isTaxable: benefit.benefitType?.isTaxable,
				startDate: benefit.startDate,
				endDate: benefit.endDate,
				payrollPeriodId: benefit.payrollPeriodId,
				status: benefit.status,
			}),
		),
		...loans.map((loan: any) =>
			classifySource({
				source: "EmployeeLoan",
				id: loan.id,
				code: loan.loanType?.category,
				name: loan.loanType?.name,
				amount: loan.monthlyPayment ?? loan.totalAmount,
				balance: loan.balance,
				startDate: loan.startDate,
				endDate: loan.endDate,
				status: loan.status,
			}),
		),
	];
	const grossIncludedBenefits = sumSources(sourceRows, (row) => row.classification === "grossIncluded");
	const leavePay = sumSources(sourceRows, (row) => row.classification === "leavePay");
	const receivableOnlyBenefits = sumSources(sourceRows, (row) => row.classification === "receivableOnly");
	const netAdjustments = sumSources(sourceRows, (row) => row.classification === "netAdjustment");
	const deductionBenefits = sumSources(sourceRows, (row) => row.classification === "deduction");
	const loanDeductions = sumSources(sourceRows, (row) => row.classification === "loanDeduction");
	const grossPayFormulaWithLeave = round2(
		basicPay - absentDeduction - lateUndertimeAmount + regularOtPay + restDayPay + restDayOtPay + specialHolidayPay + legalHolidayPay + nightDiffPay + leavePay + grossIncludedBenefits,
	);
	const grossPay = round2(
		basicPay - absentDeduction - lateUndertimeAmount + regularOtPay + restDayPay + restDayOtPay + specialHolidayPay + legalHolidayPay + nightDiffPay + grossIncludedBenefits,
	);

	const contributionSchedule = resolveContributionSplitFactor({
		payFrequency: employee.payFrequency,
		periodNumber: timesheet.payrollPeriod.periodNumber,
		payrollPeriodMetadata: timesheet.payrollPeriod.generationMetadata,
	});
	const splitFactor = contributionSchedule.splitFactor;
	const contributionBaseAmount = employee.payFrequency === "SEMI_MONTHLY" ? grossPay * 2 : grossPay;
	const monthlyContributions = {
		sss: calculateSss(contributionBaseAmount, calculator?.sssRates),
		philHealth: calculatePhilHealth(contributionBaseAmount, calculator?.philHealthRates),
		pagIbig: calculatePagibig(contributionBaseAmount, calculator?.pagibigRates),
	};
	const periodContributions = {
		sss: round2(monthlyContributions.sss * splitFactor),
		philHealth: round2(monthlyContributions.philHealth * splitFactor),
		pagIbig: round2(monthlyContributions.pagIbig * splitFactor),
	};
	const taxableIncome = round2(grossPay - (periodContributions.sss + periodContributions.philHealth + periodContributions.pagIbig));
	const configuredTaxAmount = calculateWithholdingTax(taxableIncome, asArray(calculator?.taxRates), employee.payFrequency === "SEMI_MONTHLY");
	const taxAmount = employeePayroll ? round2((employeePayroll as any).taxAmount || 0) : configuredTaxAmount;
	const totalDeductions = round2(periodContributions.sss + periodContributions.philHealth + periodContributions.pagIbig + taxAmount + loanDeductions + deductionBenefits);
	const netPay = round2(grossPay - totalDeductions + netAdjustments);
	const totalReceivable = round2(netPay + receivableOnlyBenefits);

	const register: Record<string, number> = {
		monthlySalary,
		dailySalary: displayDailySalary,
		numberOfDays: actualDays,
		basicPay,
		absentDeduction,
		lateUndertimeAmount,
		regularOtHours: buckets.regOtHrs,
		overtimePay: regularOtPay,
		restDayHours: buckets.rdHrs,
		restDayHoursPay: restDayPay,
		restDayOtHours: buckets.rdOtHrs,
		restDayOtPay,
		specialHolidayOtHours: round2(buckets.spclHrs + buckets.spclOtHrs),
		specialHolidayOtPay: specialHolidayPay,
		legalHolidayOtHours: buckets.rholOtHrs,
		legalHolidayOtPay: legalHolidayPay,
		nightDiffPay,
		leavePay,
		obAllowance: sumSources(sourceRows, (row) => /OB Allowance/i.test(row.name)),
		deMinimisAllowance: sumSources(sourceRows, (row) => /De Minimis Allowance/i.test(row.name)),
		adjustmentOtNd: sumSources(sourceRows, (row) => /Adjustment OT\/ND/i.test(row.name)),
		perfectAttendance: sumSources(sourceRows, (row) => /Perfect Attendance/i.test(row.name)),
		mealAllowance: sumSources(sourceRows, (row) => /^Meal Allowance$/i.test(row.name)),
		grossPay,
		taxAmount,
		sssContribution: periodContributions.sss,
		philHealthContribution: periodContributions.philHealth,
		pagibigContribution: periodContributions.pagIbig,
		bnpiEmergencyLoan: sumSources(sourceRows, (row) => /BNPI Emergency Loan/i.test(row.name)),
		bnpiSalaryLoan: sumSources(sourceRows, (row) => /BNPI Salary Loan/i.test(row.name)),
		rcbcLoan: sumSources(sourceRows, (row) => /RCBC Loan/i.test(row.name)),
		hdmfCalamityLoan: sumSources(sourceRows, (row) => /HDMF Calamity Loan/i.test(row.name)),
		hdmfSalaryLoan: sumSources(sourceRows, (row) => /HDMF Salary Loan/i.test(row.name)),
		sssCalamityLoan: sumSources(sourceRows, (row) => /SSS Calamity Loan/i.test(row.name)),
		sssSalaryLoan: sumSources(sourceRows, (row) => /SSS Salary Loan/i.test(row.name)),
		modifiedHdmf2: sumSources(sourceRows, (row) => /Modified HDMF 2/i.test(row.name)),
		totalDeductions,
		netPay,
		totalReceivable,
	};

	const evidence = {
		status: "dry-run-only",
		generatedAt: new Date().toISOString(),
		rules: {
			noPayrollPeriodHelperUsed: true,
			timesheetSource: "Timesheetline where isEffective=true and isDeleted=false",
			periodBasicSource: "Employee.basicSalary is treated as the payroll-approved period basic for this BNPI semi-monthly proof",
			rateSource: "Monthly rate is derived from period basic by pay frequency; Bandai premium daily rate = monthlySalary * 12 / 313",
			registerDailySalarySource: "Column H/display daily salary is periodBasic / effective paid days; OT/absent/leave premium proof uses the Bandai 313 daily rate",
			approvedBucketMultipliers: BANDAI_APPROVED_BUCKET_MULTIPLIERS,
			contributionSchedule,
			contributionSource: "Calculator JSON config if present; local defaults only when calculator config is missing",
		},
		employee: {
			id: employee.id,
			employeeId: employee.employeeId,
			name: personName(employee),
			employmentStatus: employee.employmentStatus,
			payFrequency: employee.payFrequency,
			basicSalary: employee.basicSalary,
			department: employee.department,
			section: employee.section,
			position: employee.position,
			embeddedSchedule: employee.embeddedSchedule,
		},
		period: timesheet.payrollPeriod,
		timesheet,
		lineSummary: {
			effectiveLineCount: lines.length,
			statusCounts: lines.reduce<Record<string, number>>((current, line) => {
				const status = getText(line.status) || "UNKNOWN";
				current[status] = (current[status] || 0) + 1;
				return current;
			}, {}),
			bandaiApprovedBuckets: buckets,
			totalLate: minutesToHours(lateMinutes),
			totalUndertime: minutesToHours(undertimeMinutes),
		},
		formulas: {
			periodBasic: `Employee.basicSalary = ${money(periodBasic)}`,
			monthlySalary: `${money(periodBasic)} period basic x ${employee.payFrequency === "SEMI_MONTHLY" ? 2 : 1} = ${money(monthlySalary)}`,
			displayDailySalary: `${money(periodBasic)} / ${actualDays} effective paid days = ${money(displayDailySalary)}`,
			bandaiDailyRate: `${money(monthlySalary)} * 12 / ${BANDAI_ANNUAL_WORK_DAYS} = ${money(bandaiDailyRate)}`,
			hourlyRate: `${money(bandaiDailyRate)} / ${BANDAI_WORKING_HOURS_PER_DAY} = ${money(hourlyRate)}`,
			basicPay: `${money(periodBasic)}`,
			regularOtPay: `${buckets.regOtHrs} hrs x ${money(hourlyRate)} x ${BANDAI_APPROVED_BUCKET_MULTIPLIERS.regularOt} = ${money(regularOtPay)}`,
			restDayPay: `${buckets.rdHrs} hrs x ${money(hourlyRate)} x ${BANDAI_APPROVED_BUCKET_MULTIPLIERS.restDay} = ${money(restDayPay)}`,
			restDayOtPay: `${buckets.rdOtHrs} hrs x ${money(hourlyRate)} x ${BANDAI_APPROVED_BUCKET_MULTIPLIERS.restDayOt} = ${money(restDayOtPay)}`,
			specialHolidayPay: `${buckets.spclHrs} hrs x ${money(hourlyRate)} x ${BANDAI_APPROVED_BUCKET_MULTIPLIERS.specialHolidayPremium} + ${buckets.spclOtHrs} hrs x ${money(hourlyRate)} x ${BANDAI_APPROVED_BUCKET_MULTIPLIERS.specialHolidayOt} = ${money(specialHolidayPay)}`,
			legalHolidayPay: `${buckets.rholHrs} hrs x ${money(hourlyRate)} x ${BANDAI_APPROVED_BUCKET_MULTIPLIERS.legalHoliday} + ${buckets.rholOtHrs} hrs x ${money(hourlyRate)} x ${BANDAI_APPROVED_BUCKET_MULTIPLIERS.legalHolidayOt} = ${money(legalHolidayPay)}`,
			nightDiffPay: `${buckets.regNdHrs} hrs x ${money(hourlyRate)} x ${BANDAI_APPROVED_BUCKET_MULTIPLIERS.nightDiffPremium} = ${money(nightDiffPay)}`,
			grossPay: `basic - absent - late/undertime + OT/rest/holiday/ND + gross-included benefits = ${money(grossPay)}`,
			grossPayIfLeaveIsAdded: `basic - absent - late/undertime + OT/rest/holiday/ND + leave + gross-included benefits = ${money(grossPayFormulaWithLeave)}`,
			contributionBase: employee.payFrequency === "SEMI_MONTHLY" ? `${money(grossPay)} * 2 = ${money(contributionBaseAmount)}` : `${money(grossPay)}`,
			taxAmount: employeePayroll
				? `Using generated EmployeePayroll.taxAmount / workbook parity target = ${money(taxAmount)}; configured formula would compute ${money(configuredTaxAmount)}`
				: `Configured formula = ${money(configuredTaxAmount)}`,
			totalDeductions: `tax + SSS + PhilHealth + Pag-IBIG + loans + deduction benefits = ${money(totalDeductions)}`,
			netPay: `gross ${money(grossPay)} - deductions ${money(totalDeductions)} + net adjustments ${money(netAdjustments)} = ${money(netPay)}`,
			totalReceivable: `net ${money(netPay)} + receivable-only benefits ${money(receivableOnlyBenefits)} = ${money(totalReceivable)}`,
		},
		calculation: {
			rates: { periodBasic, monthlySalary, displayDailySalary, bandaiDailyRate, hourlyRate, minuteRate },
			earnings: { basicPay, regularOtPay, restDayPay, restDayOtPay, specialHolidayPay, legalHolidayPay, nightDiffPay, leavePay, grossIncludedBenefits, grossPay },
			deductions: { absentDeduction, lateUndertimeAmount, taxAmount, configuredTaxAmount, ...periodContributions, loanDeductions, deductionBenefits, totalDeductions },
			diagnostics: {
				grossPayFormulaWithLeave,
				grossPayFormulaWithoutLeave: grossPay,
				leavePayGrossResidual: round2(grossPayFormulaWithLeave - grossPay),
			},
			net: { netAdjustments, netPay, receivableOnlyBenefits, totalReceivable },
		},
		sourceRows,
		registerColumns: REGISTER_FIELDS.map(([column, label, field]) => ({
			column,
			label,
			field,
			dryRunValue: round2(register[field] || 0),
			existingEmployeePayrollValue: employeePayroll ? round2((employeePayroll as any)[field] || 0) : null,
			differenceFromExisting: employeePayroll ? round2(round2(register[field] || 0) - round2((employeePayroll as any)[field] || 0)) : null,
		})),
		dailyLines: lines.map((line) => ({
			id: line.id,
			date: dateOnly(line.date),
			status: line.status,
			primaryMarker: line.primaryMarker,
			hoursWorked: line.hoursWorked,
			regularHours: line.regularHours,
			overtimeHours: line.overtimeHours,
			lateHours: line.lateHours,
			undertimeHours: line.undertimeHours,
			earlyOutHours: line.earlyOutHours,
			bandaiApprovedBuckets: asRecord(asRecord(line.metadata).bandaiPayrollSourceRepair).approvedBuckets || null,
			metadataSource: asRecord(line.metadata).snapshotType || asRecord(asRecord(line.metadata).bandaiPayrollSourceRepair).source || null,
		})),
		existingEmployeePayroll: employeePayroll,
	};

	const slug = `${employee.employeeId}-${dateOnly(range.startDate)}-${dateOnly(range.endDate)}`.replace(/[^\w.-]+/g, "-");
	fs.mkdirSync(outputDir, { recursive: true });
	const jsonPath = path.join(outputDir, `${slug}.json`);
	const mdPath = path.join(outputDir, `${slug}.md`);
	fs.writeFileSync(jsonPath, JSON.stringify(evidence, null, 2));
	fs.writeFileSync(
		mdPath,
		[
			`# Employee Payroll Source Dump: ${employee.employeeId} ${personName(employee)}`,
			"",
			`Period: ${timesheet.payrollPeriod.code} (${dateOnly(range.startDate)} to ${dateOnly(range.endDate)})`,
			`Timesheet: ${timesheet.code} / ${timesheet.status}`,
			"",
			"## Formula Chain",
			...Object.entries(evidence.formulas).map(([key, value]) => `- ${key}: ${value}`),
			"",
			"## Field Order",
			"| Col | Field | Dry Run | Existing Payroll | Gap |",
			"| --- | --- | ---: | ---: | ---: |",
			...evidence.registerColumns.map((row) => `| ${row.column} | ${row.label} (${row.field}) | ${money(row.dryRunValue)} | ${row.existingEmployeePayrollValue === null ? "-" : money(row.existingEmployeePayrollValue)} | ${row.differenceFromExisting === null ? "-" : money(row.differenceFromExisting)} |`),
			"",
			"## Source Rows",
			"| Source | Name | Class | Amount | Status |",
			"| --- | --- | --- | ---: | --- |",
			...(sourceRows.length ? sourceRows.map((row) => `| ${row.source} | ${row.name} | ${row.classification} | ${money(row.amount)} | ${row.status || "-"} |`) : ["| - | No active benefit/loan rows found | - | PHP 0.00 | - |"]),
			"",
			"## Daily Effective Timesheet Lines",
			"| Date | Status | Reg | OT | Late | UT | Approved Buckets |",
			"| --- | --- | ---: | ---: | ---: | ---: | --- |",
			...evidence.dailyLines.map((line) => `| ${line.date} | ${line.status} | ${line.regularHours || "-"} | ${line.overtimeHours || "-"} | ${line.lateHours || "-"} | ${line.undertimeHours || "-"} | ${JSON.stringify(line.bandaiApprovedBuckets || {})} |`),
			"",
			`JSON evidence: \`${path.relative(repoRoot, jsonPath).replace(/\\/g, "/")}\``,
		].join("\n"),
	);
	console.log(JSON.stringify({ status: "ok", jsonPath, mdPath, employee: evidence.employee, period: evidence.period.code, netPay }, null, 2));
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
