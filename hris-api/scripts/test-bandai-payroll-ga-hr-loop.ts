import fs from "fs";
import path from "path";
import { PrismaClient } from "../generated/prisma";
import {
	type BandaiWorkbookAnalysis,
	type BandaiWorkbookRow,
	type BandaiPayrollSourceEvidence,
	buildBandaiPayrollSourceEvidence,
	parseBandaiPayrollWorkbook,
	runBandaiPayrollComparison,
	writeJson,
} from "../helper/payroll-reconciliation.helper";
import { roundToCentavo } from "../helper/tax-calculator.helper";

const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const repoRoot = path.resolve(__dirname, "..", "..");
const outputDir = path.resolve(repoRoot, "test-results", "payroll-bandai-ga-hr-loop");
const dbUrl = process.env.PG_DATABASE_URL || process.env.DATABASE_URL || process.env.WRITE_DATABASE_URL || "";
const payroll2026Dir = path.join(repoRoot, "docs", "Bandai Payroll", "PAYROLL 2024-2026", "PAYROLL 2026");
const defaultSourceWorkbooks = {
	referenceWorkbookPath: path.join(payroll2026Dir, "2026 Reference per cutoff", "May 15, 2026.xlsx"),
	compensationUploadPath: path.join(payroll2026Dir, "HRIS Reference for Download", "Compensation Mass Upload 05.15.26.xlsx"),
	deductionUploadPath: path.join(payroll2026Dir, "HRIS Reference for Download", "Deduction Mass Upload 05.15.26.xlsx"),
	overtimeWorkbookPath: path.join(repoRoot, "docs", "Bandai Payroll", "2026 rptOvertimeDetails.xlsx"),
};

const args = new Map(
	process.argv
		.slice(2)
		.filter((arg) => arg.startsWith("--"))
		.map((arg) => {
			const [key, ...rest] = arg.slice(2).split("=");
			return [key, rest.join("=") || "true"];
		}),
);

function npmArgName(name: string) {
	return `npm_config_${name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).toLowerCase()}`;
}

function argValue(name: string, fallback = "") {
	return args.get(name) || process.env[npmArgName(name)] || fallback;
}

function hasArg(name: string) {
	return args.has(name) || process.env[npmArgName(name)] === "true";
}

const sampleSize = Number(argValue("sample", "5"));
const maxIterations = Math.max(1, Number(argValue("maxIterations", hasArg("loop") ? "10" : "1")));
const intervalMs = Math.max(1000, Number(argValue("intervalMs", "15000")));
const tolerance = Number(argValue("tolerance", "0.05"));
const showAllPayrollColumns = hasArg("allColumns");
const password = argValue("password", "9090");
const organizationId = argValue("organizationId") || undefined;
const sourceWorkbookPaths = {
	referenceWorkbookPath: argValue("referenceWorkbook", defaultSourceWorkbooks.referenceWorkbookPath),
	compensationUploadPath: argValue("compensationUpload", defaultSourceWorkbooks.compensationUploadPath),
	deductionUploadPath: argValue("deductionUpload", defaultSourceWorkbooks.deductionUploadPath),
	overtimeWorkbookPath: argValue("overtimeWorkbook", defaultSourceWorkbooks.overtimeWorkbookPath),
};
const explicitEmployeeIds = argValue("employees")
	.split(",")
	.map((value) => value.trim())
	.filter(Boolean);
const normalizedExplicitEmployeeIds = explicitEmployeeIds.map((value) => value.padStart(5, "0"));
const divisionPattern = new RegExp(argValue("division", "GA/HR [12]"), "i");
const requiredStopFields = argValue("stopFields")
	.split(",")
	.map((value) => value.trim())
	.filter(Boolean);

type PayrollLineEvidence = {
	date: string;
	status: string;
	regularHours: number;
	overtimeHours: number;
	lateHours: number;
	earlyOutHours: number;
	approvedBuckets: Record<string, number>;
	dayPay?: Record<string, number>;
};

type SampleEvidence = {
	employeeId: string;
	employeeName: string;
	workbook: Record<string, number | string | null>;
	db: Record<string, any>;
	hrResult: {
		cutoff: string;
		payDate: string;
		status: string;
		employee: {
			id: string;
			name: string;
			department: string | null;
			section: string | null;
			position: string | null;
			scheduleCode: string | null;
		};
		earnings: Record<string, number>;
		deductions: Record<string, number>;
		net: Record<string, number>;
		sourceSummary: {
			allowanceUploadBacked: boolean;
			deductionUploadBacked: boolean;
			timesheetBacked: boolean;
			generatedPayrollFound: boolean;
		};
	};
	payrollComputationColumns: Array<{
		column: string;
		label: string;
		workbookValue: number | string | null;
		hrisValue: number | string | null;
		difference: number | null;
		source: string;
	}>;
	rate: Record<string, number | string | boolean>;
	tax: Record<string, number | string | null>;
	approvedBucketPay: Record<string, any> | null;
	componentChecks: Array<{
		field: string;
		workbookValue: number | string | null;
		hrisValue: number | string | null;
		difference: number;
		matched: boolean;
		category: string;
		sourceColumn?: string;
		sourceCell?: string;
		sourceBreakdown?: Array<{
			label: string;
			value: number;
			sourceCell?: string;
			formula?: string;
		}>;
	}>;
	lines: PayrollLineEvidence[];
	nextActions: string[];
	matched: boolean;
};

const moneyFields = [
	"basicSalary",
	"overtimePay",
	"restDayPay",
	"restDayOtPay",
	"specialHolidayPay",
	"legalHolidayPay",
	"nightDiffPay",
	"leavePay",
	"grossIncludedAllowances",
	"receivableOnlyAllowances",
	"postNetReceivableAdjustments",
	"grossPay",
	"sssContribution",
	"philHealthContribution",
	"pagibigContribution",
	"withholdingTax",
	"loanDeductions",
	"uniformDeduction",
	"deductionBenefits",
	"totalDeductions",
	"netPay",
	"totalReceivable",
];

const defaultStopFields = [
	"basicSalary",
	"overtimePay",
	"restDayPay",
	"restDayOtPay",
	"specialHolidayPay",
	"legalHolidayPay",
	"nightDiffPay",
	"leavePay",
	"grossIncludedAllowances",
	"receivableOnlyAllowances",
	"postNetReceivableAdjustments",
	"grossPay",
	"withholdingTax",
	"sssContribution",
	"philHealthContribution",
	"pagibigContribution",
	"loanDeductions",
	"uniformDeduction",
	"totalDeductions",
	"netPay",
	"totalReceivable",
];

const stopFields = requiredStopFields.length ? requiredStopFields : defaultStopFields;

const PAYROLL_COMPUTATION_REPORT_COLUMNS = [
	["A", "No."],
	["B", "Emp. No."],
	["C", "Employee Name"],
	["D", "Department"],
	["E", "Division"],
	["F", "Position"],
	["G", "Monthly Salary"],
	["H", "Daily Salary"],
	["I", "No. of Days"],
	["J", "Basic Salary"],
	["K", "Absent-Amt"],
	["L", "UT/Late-Amt"],
	["M", "No. of Reg OT Hrs"],
	["N", "Reg OT"],
	["O", "RD Hrs"],
	["P", "RD Hrs Pay"],
	["Q", "RD OT"],
	["R", "RD OT Pay"],
	["S", "Spc Hol OT Hrs"],
	["T", "Spc Hol OT"],
	["U", "Sun/Spc Hol OT Exc Hrs"],
	["V", "Sun/Spc Hol OT Exc"],
	["W", "Spc Hol RD OT Hrs"],
	["X", "Spc RD OT"],
	["Y", "Spc RD Exc Hrs"],
	["Z", "Spc RD Exc OT"],
	["AA", "Leg Hol OT Hrs"],
	["AB", "Leg Hol OT"],
	["AC", "Leg Hol Exc"],
	["AD", "Leg Hol RD"],
	["AE", "Leg Hol Exc1"],
	["AF", "Leg Hol RD Exc"],
	["AG", "Night Differential"],
	["AH", "Leave"],
	["AI", "Christmas Gift"],
	["AJ", "Special Bonus"],
	["AK", "Mandatory Cont Adjustment"],
	["AL", "Guaranteed Bonus"],
	["AM", "HYS Meal Allowance"],
	["AN", "OB Allowance"],
	["AO", "Other Adjustment"],
	["AP", "Overtime Meal Allownce"],
	["AQ", "Sportsfest OT"],
	["AR", "Fringe Benefit"],
	["AS", "Annual Incentive"],
	["AT", "Technical Skills Allowance"],
	["AU", "ACL/VL Conversion Taxable"],
	["AV", "Adjustment Overused Leave"],
	["AW", "13th Month Adjustment"],
	["AX", "Production Incentives"],
	["AY", "Other Compensation"],
	["AZ", "Adjustment Basic"],
	["BA", "Adjustment OT/ND"],
	["BB", "Adjustment Non-Tax"],
	["BC", "Excess Deduction"],
	["BD", "De Minimis Allowance"],
	["BE", "Christmas Gift (Kid)"],
	["BF", "Birthday Gift (Kid)"],
	["BG", "Birthday Gift (Employee)"],
	["BH", "GrossPay"],
	["BI", "W/Tax"],
	["BJ", "FBTax"],
	["BK", "SSS Cont"],
	["BL", "PhilHealth"],
	["BM", "Pagibig"],
	["BN", "SSS Emergency Loan"],
	["BO", "PHEALTH CONTRI Adjustment"],
	["BP", "Excess Internet Usage"],
	["BQ", "Tax Payable"],
	["BR", "Adjustment Basic Deduction"],
	["BS", "Excess ML Benefits"],
	["BT", "Uniform Deduction"],
	["BU", "SSS Loan Restructuring Program"],
	["BV", "PHIC 1% DIFFERENTIAL"],
	["BW", "Modified HDMF 2"],
	["BX", "Community Tax Certificate"],
	["BY", "HDMF Contribution Adjustment"],
	["BZ", "Personal Calls Usage"],
	["CA", "Health Insurance"],
	["CB", "Shuttle Service"],
	["CC", "Negative Adjustment"],
	["CD", "BNPI Emergency Loan"],
	["CE", "BNPI Salary Loan"],
	["CF", "RCBC Loan"],
	["CG", "HDMF Calamity Loan"],
	["CH", "HDMF Salary Loan"],
	["CI", "SSS Calamity Loan"],
	["CJ", "SSS Salary Loan"],
	["CK", "TOTAL DEDN"],
	["CL", "NetPay"],
	["CM", "Adjustment Holiday Pay"],
	["CN", "Community Tax Cert"],
	["CO", "1K Christmas Gift"],
	["CP", "Tax Refund"],
	["CQ", "13th Month"],
	["CR", "ACL/VL Conversion"],
	["CS", "OT Meal Allowance"],
	["CT", "Perfect Attendance"],
	["CU", "Meal Allowance"],
	["CV", "Line Leader Allowance"],
	["CW", "TotalReceivable"],
	["CX", "Remarks"],
] as const;

const BANDAI_PAYROLL_FORMULA_CONFIG = {
	name: "BNPI April 26-May 10 2026 payroll parity config",
	cutoff: {
		startDate: "2026-04-26",
		endDate: "2026-05-10",
		payDate: "2026-05-15",
	},
	rateBasis: {
		directMonthlyFormula: "Daily Rate = (Monthly Rate x 12) / 313",
		semiMonthlyPeriodBasicToMonthly: "Monthly Rate = Period Basic x 2",
		annualWorkDays: 313,
		workingHoursPerDay: 8,
		sourceDailyRateFallbackMax: 700,
	},
	approvedBucketMultipliers: {
		regularOt: 1.25,
		restDay: 1.3,
		restDayOt: 1.69,
		specialHolidayPremiumFrom313: 0.3,
		specialHolidayFullFromSourceDaily: 1.3,
		specialHolidayOt: 1.69,
		legalHoliday: 1,
		legalHolidayOt: 2.6,
		nightDiffPremium: 0.1,
	},
	withholdingTax: {
		table: "BIR RR 11-2018 Annex E, effective 2023 onward; values match the screenshot's semi-monthly rows.",
		frequency: "SEMI_MONTHLY",
		brackets: [
			{ floor: 0, ceiling: 10417, fixed: 0, rate: 0 },
			{ floor: 10417, ceiling: 16667, fixed: 0, rate: 0.15 },
			{ floor: 16667, ceiling: 33333, fixed: 937.5, rate: 0.2 },
			{ floor: 33333, ceiling: 83333, fixed: 4270.7, rate: 0.25 },
			{ floor: 83333, ceiling: 333333, fixed: 16770.7, rate: 0.3 },
			{ floor: 333333, ceiling: null, fixed: 91770.7, rate: 0.35 },
		],
	},
	contributions: {
		rule: "Workbook values are the parity target; DB Calculator config remains runtime source for generated payroll.",
		monthlyBasis:
			"Use monthly compensation basis. For this semi-monthly proof, monthlyRate = Basic Salary x 2 unless the workbook supplies Monthly Salary.",
		periodSplit:
			"Default BNPI current config appears first-cutoff statutory-heavy; compare against workbook per column before changing global calculator behavior.",
		sss: {
			formula:
				"Employee SSS = rounded Monthly Salary Credit x 5%, where MSC is rounded to nearest 500 and capped at PHP 35,000 for 2025+ guidance.",
			employeeRate: 0.05,
			monthlySalaryCreditStep: 500,
			minimumMonthlySalaryCredit: 5000,
			maximumMonthlySalaryCredit: 35000,
		},
		philHealth: {
			formula:
				"Employee PhilHealth = min(max(monthly basis, 10000), 100000) x 5% / 2.",
			premiumRate: 0.05,
			employeeShare: 0.5,
			salaryFloor: 10000,
			salaryCeiling: 100000,
		},
		pagIbig: {
			formula:
				"Employee Pag-IBIG = min(monthly basis, 10000) x 2%, capped at PHP 200.",
			employeeRate: 0.02,
			maximumFundSalary: 10000,
			maximumEmployeeShare: 200,
		},
	},
	sourceInputs: {
		rule: "Do not make these amounts appear from payroll math. Import them from the matching cutoff source workbook/upload, then let generated payroll consume active EmployeeBenefit/EmployeeLoan rows.",
		referenceWorkbook: {
			path: sourceWorkbookPaths.referenceWorkbookPath,
			usage:
				"Human-readable per-cutoff proof workbook. Use for audit labels and source totals such as line leader allowance, technical skills allowance, uniform deduction, and named loan schedules.",
		},
		compensationMassUpload: {
			path: sourceWorkbookPaths.compensationUploadPath,
			usage:
				"Machine-shaped allowance upload for the pay date. Formula: allowance amount = uploaded Amount for employee/code/cutoff.",
			codeExamples: ["PFA", "ABS", "OBA", "AON", "LLA", "OAD", "TSA"],
		},
		deductionMassUpload: {
			path: sourceWorkbookPaths.deductionUploadPath,
			usage:
				"Machine-shaped deduction/loan upload for the pay date. Formula: deduction amount = uploaded Payment for employee/code/cutoff.",
			codeExamples: ["UNIDED", "HDMFSALLN", "NEGADJ", "BNPISALLN", "SSSSALLN", "RCBCLN", "SSSCALLN", "SSSELN"],
			loanContext:
				"SSS/Pag-IBIG loan payroll deduction is an amortization/payment collection workflow. HRIS should store principal/interest/term as loan metadata when available, but payroll parity for imported BNPI periods must use the uploaded cutoff payment.",
			officialContextUrls: [
				"https://www.sss.gov.ph/salary-loan/",
				"https://member.sss.gov.ph/members/portlets/members/salaryLoanApplication/termsandconditions.pdf",
				"https://www.pagibigfund.gov.ph/document/pdf/dlforms/providentrelated/SLF066_CalamityLoanApplicationForm_V08.pdf",
			],
		},
		overtimeDetails: {
			path: sourceWorkbookPaths.overtimeWorkbookPath,
			usage:
				"Approved OT/rest/holiday hour buckets. Formula converts approved hours to pay using the 313-day daily/hourly rate multipliers.",
		},
	},
	payrollColumnMap: {
		employeeRate: ["G Monthly Salary", "H Daily Salary", "I No. of Days", "J Basic Salary"],
		attendanceDeductions: ["K Absent-Amt", "L UT/Late-Amt"],
		approvedOtPremiums: [
			"M No. of Reg OT Hrs",
			"N Reg OT",
			"O/P RD Hrs/Pay",
			"Q/R RD OT/Pay",
			"S/T Spc Hol OT Hrs/Pay",
			"AA/AB Leg Hol OT Hrs/Pay",
			"AG Night Differential",
		],
		grossIncludedAllowances: ["AM HYS Meal Allowance", "AN OB Allowance", "AP Overtime Meal Allownce", "BD De Minimis Allowance"],
		receivableOnlyAllowances: ["CS OT Meal Allowance", "CT Perfect Attendance", "CU Meal Allowance", "CV Line Leader Allowance"],
		postNetReceivableAdjustments: ["CM Adjustment Holiday Pay", "CO 1K Christmas Gift", "CP Tax Refund", "CQ 13th Month", "CR ACL/VL Conversion"],
		statutory: ["BI W/Tax", "BK SSS Cont", "BL PhilHealth", "BM Pagibig"],
		loanAndPayrollDeductions: [
			"BN SSS Emergency Loan",
			"BT Uniform Deduction",
			"BU SSS Loan Restructuring Program",
			"CD BNPI Emergency Loan",
			"CE BNPI Salary Loan",
			"CF RCBC Loan",
			"CG HDMF Calamity Loan",
			"CH HDMF Salary Loan",
			"CI SSS Calamity Loan",
			"CJ SSS Salary Loan",
		],
		rollups: ["BH GrossPay", "CK TOTAL DEDN", "CL NetPay", "CW TotalReceivable"],
	},
	stopCondition:
		"All sampled rows must have employee, period timesheet, effective lines, and every stop field equal to the workbook within tolerance.",
} as const;

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

const colorEnabled = !hasArg("noColor") && process.env.NO_COLOR !== "1";
const ansi = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	gray: "\x1b[90m",
};

function color(text: string, tone: keyof typeof ansi) {
	if (!colorEnabled || tone === "reset") return text;
	return `${ansi[tone]}${text}${ansi.reset}`;
}

function asRecord(value: unknown): Record<string, any> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function numberValue(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value.replace(/,/g, ""));
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function durationToHours(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string" || !value.includes(":")) return 0;
	const [hours, minutes] = value.split(":").map(Number);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
	return hours + minutes / 60;
}

function dateOnly(value: Date | string) {
	return new Date(value).toISOString().slice(0, 10);
}

function workbookNumber(row: BandaiWorkbookRow, field: string, analysis: BandaiWorkbookAnalysis) {
	const header = analysis.payrollFieldMap[field];
	return header ? numberValue(row.values[header]) : 0;
}

function workbookValue(row: BandaiWorkbookRow, field: string, analysis: BandaiWorkbookAnalysis) {
	const header = analysis.payrollFieldMap[field];
	return header ? row.values[header] ?? null : null;
}

function sumWorkbookColumns(row: BandaiWorkbookRow, columns: string[]) {
	return roundToCentavo(columns.reduce((total, column) => total + numberValue(row.values[column]), 0));
}

function buildSourceBreakdownMap(componentChecks: SampleEvidence["componentChecks"]) {
	const values = new Map<string, { value: number; sourceCell?: string }>();
	for (const check of componentChecks) {
		for (const source of check.sourceBreakdown || []) {
			const current = values.get(source.label)?.value || 0;
			values.set(source.label, {
				value: roundToCentavo(current + numberValue(source.value)),
				sourceCell: source.sourceCell,
			});
		}
	}
	return values;
}

function reportNumberDifference(workbookValue: unknown, hrisValue: unknown) {
	if (
		typeof workbookValue === "string" &&
		typeof hrisValue === "string" &&
		workbookValue.trim().toLowerCase() === hrisValue.trim().toLowerCase()
	) {
		return null;
	}
	const workbookNumberValue = numberValue(workbookValue);
	const hrisNumberValue = numberValue(hrisValue);
	const workbookLooksNumeric =
		typeof workbookValue === "number" ||
		(typeof workbookValue === "string" && workbookValue.trim() !== "" && Number.isFinite(Number(workbookValue.replace(/,/g, ""))));
	const hrisLooksNumeric =
		typeof hrisValue === "number" ||
		(typeof hrisValue === "string" && hrisValue.trim() !== "" && Number.isFinite(Number(hrisValue.replace(/,/g, ""))));
	if ((!workbookLooksNumeric && !hrisLooksNumeric) || (workbookValue === null && hrisValue === null)) {
		return null;
	}
	return roundToCentavo(workbookNumberValue - hrisNumberValue);
}

function calculateBandaiSemiMonthlyTax(taxableIncome: number) {
	for (const bracket of BANDAI_PAYROLL_FORMULA_CONFIG.withholdingTax.brackets) {
		const inside =
			taxableIncome >= bracket.floor &&
			(bracket.ceiling === null || taxableIncome < bracket.ceiling);
		if (!inside) continue;
		return roundToCentavo(bracket.fixed + (taxableIncome - bracket.floor) * bracket.rate);
	}
	return 0;
}

function solveTaxableIncomeFromBandaiTax(tax: number) {
	for (const bracket of BANDAI_PAYROLL_FORMULA_CONFIG.withholdingTax.brackets) {
		if (bracket.rate === 0) {
			if (tax === 0) return bracket.floor;
			continue;
		}
		const taxable = bracket.floor + (tax - bracket.fixed) / bracket.rate;
		const inside =
			taxable >= bracket.floor &&
			(bracket.ceiling === null || taxable < bracket.ceiling);
		if (inside) return roundToCentavo(taxable);
	}
	return null;
}

function calculateConfiguredContributions(monthlyBasis: number) {
	const config = BANDAI_PAYROLL_FORMULA_CONFIG.contributions;
	const sssConfig = config.sss;
	const philHealthConfig = config.philHealth;
	const pagIbigConfig = config.pagIbig;
	const roundedMsc = Math.round(monthlyBasis / sssConfig.monthlySalaryCreditStep) *
		sssConfig.monthlySalaryCreditStep;
	const sssMsc = Math.max(
		sssConfig.minimumMonthlySalaryCredit,
		Math.min(roundedMsc, sssConfig.maximumMonthlySalaryCredit),
	);
	const philHealthBase = Math.max(
		philHealthConfig.salaryFloor,
		Math.min(monthlyBasis, philHealthConfig.salaryCeiling),
	);
	const pagIbigBase = Math.min(monthlyBasis, pagIbigConfig.maximumFundSalary);
	return {
		monthlyBasis: roundToCentavo(monthlyBasis),
		sssMonthlyEmployeeShare: roundToCentavo(sssMsc * sssConfig.employeeRate),
		sssMsc,
		philHealthMonthlyEmployeeShare: roundToCentavo(
			philHealthBase * philHealthConfig.premiumRate * philHealthConfig.employeeShare,
		),
		philHealthBase,
		pagIbigMonthlyEmployeeShare: roundToCentavo(
			Math.min(pagIbigBase * pagIbigConfig.employeeRate, pagIbigConfig.maximumEmployeeShare),
		),
		pagIbigBase,
	};
}

function getApprovedBuckets(line: any): Record<string, number> {
	const repair = asRecord(line?.metadata?.bandaiPayrollSourceRepair);
	const bucket = asRecord(repair.approvedBuckets);
	const result: Record<string, number> = {};
	for (const [key, value] of Object.entries(bucket)) result[key] = numberValue(value);
	return result;
}

function hasApprovedBuckets(line: any) {
	return Object.keys(getApprovedBuckets(line)).length > 0;
}

function calculateApprovedBucketPay(lines: any[], periodBasic: number) {
	const totals = {
		regularDays: 0,
		regOtHrs: 0,
		rdHrs: 0,
		rdOtHrs: 0,
		spclHrs: 0,
		spclOtHrs: 0,
		rholHrs: 0,
		rholOtHrs: 0,
		regNdHrs: 0,
		nightDiffPayAmount: 0,
	};
	let sourceDayCount = 0;
	for (const line of lines) {
		const bucket = getApprovedBuckets(line);
		if (!Object.keys(bucket).length) continue;
		sourceDayCount += 1;
		for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
			totals[key] += numberValue(bucket[key]);
		}
	}
	if (!sourceDayCount || !(periodBasic > 0)) return null;
	const sourceDailyRate = totals.regularDays > 0 ? periodBasic / totals.regularDays : 0;
	const useSourceDailyRate =
		sourceDailyRate > 0 &&
		sourceDailyRate <= BANDAI_PAYROLL_FORMULA_CONFIG.rateBasis.sourceDailyRateFallbackMax;
	const dailyRate = useSourceDailyRate
		? sourceDailyRate
		: (periodBasic * 2 * 12) / BANDAI_PAYROLL_FORMULA_CONFIG.rateBasis.annualWorkDays;
	const hourlyRate = dailyRate / BANDAI_PAYROLL_FORMULA_CONFIG.rateBasis.workingHoursPerDay;
	const multipliers = BANDAI_PAYROLL_FORMULA_CONFIG.approvedBucketMultipliers;
	const specialHolidayWorkMultiplier = useSourceDailyRate
		? multipliers.specialHolidayFullFromSourceDaily
		: multipliers.specialHolidayPremiumFrom313;
	const overtimePay = roundToCentavo(totals.regOtHrs * hourlyRate * multipliers.regularOt);
	const restDayPay = roundToCentavo(totals.rdHrs * hourlyRate * multipliers.restDay);
	const restDayOtPay = roundToCentavo(totals.rdOtHrs * hourlyRate * multipliers.restDayOt);
	const specialHolidayPay = roundToCentavo(
		totals.spclHrs * hourlyRate * specialHolidayWorkMultiplier +
			totals.spclOtHrs * hourlyRate * multipliers.specialHolidayOt,
	);
	const legalHolidayPay = roundToCentavo(
		totals.rholHrs * hourlyRate * multipliers.legalHoliday +
			totals.rholOtHrs * hourlyRate * multipliers.legalHolidayOt,
	);
	const nightDiffPay =
		totals.nightDiffPayAmount > 0
			? roundToCentavo(totals.nightDiffPayAmount)
			: roundToCentavo(totals.regNdHrs * hourlyRate * multipliers.nightDiffPremium);
	return {
		source: "Timesheetline.metadata.bandaiPayrollSourceRepair.approvedBuckets",
		formula: useSourceDailyRate ? "BANDAI_SOURCE_DAILY_APPROVED_BUCKETS" : "BNPI_DIRECT_313_APPROVED_BUCKETS",
		sourceDayCount,
		sourceRegularDays: roundToCentavo(totals.regularDays),
		sourceDailyRate: roundToCentavo(sourceDailyRate),
		dailyRate: roundToCentavo(dailyRate),
		hourlyRate: roundToCentavo(hourlyRate),
		specialHolidayWorkMultiplier,
		totals,
		overtimePay,
		restDayPay,
		restDayOtPay,
		specialHolidayPay,
		legalHolidayPay,
		nightDiffPay,
		premiumHolidayRestPay: roundToCentavo(restDayPay + restDayOtPay + specialHolidayPay + legalHolidayPay),
	};
}

function calculateApprovedBucketDayPay(bucket: Record<string, number>, approvedPay: Record<string, any>, periodBasic: number) {
	const hourlyRate = numberValue(approvedPay.hourlyRate);
	const sourceRegularDays = numberValue(approvedPay.sourceRegularDays);
	const regularDailyRate = sourceRegularDays > 0 ? periodBasic / sourceRegularDays : 0;
	const multipliers = BANDAI_PAYROLL_FORMULA_CONFIG.approvedBucketMultipliers;
	return {
		regularPay: roundToCentavo(numberValue(bucket.regularDays) * regularDailyRate),
		overtimePay: roundToCentavo(numberValue(bucket.regOtHrs) * hourlyRate * multipliers.regularOt),
		restDayPay: roundToCentavo(numberValue(bucket.rdHrs) * hourlyRate * multipliers.restDay),
		restDayOtPay: roundToCentavo(numberValue(bucket.rdOtHrs) * hourlyRate * multipliers.restDayOt),
		specialHolidayPay: roundToCentavo(
			numberValue(bucket.spclHrs) * hourlyRate * numberValue(approvedPay.specialHolidayWorkMultiplier || 0.3) +
				numberValue(bucket.spclOtHrs) * hourlyRate * multipliers.specialHolidayOt,
		),
		legalHolidayPay: roundToCentavo(
			numberValue(bucket.rholHrs) * hourlyRate * multipliers.legalHoliday +
				numberValue(bucket.rholOtHrs) * hourlyRate * multipliers.legalHolidayOt,
		),
		nightDiffPay: roundToCentavo(
			numberValue(bucket.nightDiffPayAmount) ||
				numberValue(bucket.regNdHrs) * hourlyRate * multipliers.nightDiffPremium,
		),
	};
}

function buildNextActions(params: {
	employeeFound: boolean;
	timesheetFound: boolean;
	effectiveLineCount: number;
	approvedBucketLineCount: number;
	componentChecks: SampleEvidence["componentChecks"];
}) {
	const actions: string[] = [];
	if (!params.employeeFound) actions.push("Import or repair the DM3 employee master row first.");
	if (!params.timesheetFound) actions.push("Materialize/import and approve the employee timesheet for this cutoff.");
	if (params.timesheetFound && params.effectiveLineCount === 0) {
		actions.push("Repair effective Timesheetline snapshots for the approved payroll period.");
	}
	if (
		params.componentChecks.some((check) => check.category === "SOURCE_MISSING_APPROVED_OT") ||
		(params.timesheetFound && params.approvedBucketLineCount === 0)
	) {
		actions.push("Import/repair approved OT, rest-day, holiday, and night-diff buckets into effective Timesheetline metadata.");
	}
	if (params.componentChecks.some((check) => check.category === "SOURCE_MISSING_ALLOWANCE")) {
		actions.push("Import/repair workbook allowance rows through DM3.6 employee benefits/loans.");
	}
	if (params.componentChecks.some((check) => check.category === "SOURCE_MISSING_DEDUCTION_OR_LOAN")) {
		actions.push("Import/repair workbook deduction and loan rows through DM3.6 employee benefits/loans.");
	}
	if (params.componentChecks.some((check) => check.category === "SOURCE_MISSING_STATUTORY_CONFIG")) {
		actions.push("Verify calculator tax/contribution config and contribution split for this cutoff before changing formulas.");
	}
	if (params.componentChecks.some((check) => check.category === "HRIS_LOGIC_MISMATCH_REPAIRABLE")) {
		actions.push("After source gaps are fixed, inspect formula classification for grossPay/totalDeductions rollups; do not edit downstream totals directly.");
	}
	if (!actions.length) actions.push("All required stop fields match; no payroll repair needed for this sample.");
	return actions;
}

function selectWorkbookRows(analysis: BandaiWorkbookAnalysis) {
	const rows = analysis.rows.filter((row) => divisionPattern.test(String(row.values.Division || "")));
	if (normalizedExplicitEmployeeIds.length) {
		const wanted = new Set(normalizedExplicitEmployeeIds);
		return rows.filter((row) => wanted.has(row.employeeCode)).slice(0, Math.max(sampleSize, normalizedExplicitEmployeeIds.length));
	}
	const preferred = rows.filter((row) => {
		const workbookGross = workbookNumber(row, "grossPay", analysis);
		const workbookNet = workbookNumber(row, "netPay", analysis);
		const workbookOtOrPremium =
			workbookNumber(row, "overtimePay", analysis) +
			workbookNumber(row, "restDayPay", analysis) +
			workbookNumber(row, "restDayOtPay", analysis) +
			workbookNumber(row, "specialHolidayPay", analysis) +
			workbookNumber(row, "legalHolidayPay", analysis);
		return workbookGross > 0 && workbookNet > 0 && workbookOtOrPremium > 0;
	});
	return [...preferred, ...rows.filter((row) => !preferred.includes(row))].slice(0, sampleSize);
}

async function buildIterationEvidence(iteration: number): Promise<{
	metadata: Record<string, any>;
	sourceEvidence: BandaiPayrollSourceEvidence;
	samples: SampleEvidence[];
	allMatched: boolean;
}> {
	const analysis = parseBandaiPayrollWorkbook({ password, outputDir });
	const sourceEvidence = buildBandaiPayrollSourceEvidence({
		analysis,
		password,
		...sourceWorkbookPaths,
	});
	const comparison = await runBandaiPayrollComparison({
		prisma,
		analysis,
		dbUrl,
		organizationId,
	});
	const workbookRows = selectWorkbookRows(analysis);
	const employeeCodes = workbookRows.map((row) => row.employeeCode);
	const comparisonByCode = new Map(comparison.rows.map((row) => [row.employeeCode, row]));
	const payrollPeriod = comparison.metadata.payrollPeriod;
	if (!payrollPeriod?.id) throw new Error("Payroll period 2026-04-26 to 2026-05-10 was not found in the DB.");

	const employees = await prisma.employee.findMany({
		where: {
			organizationId: comparison.metadata.organizationId,
			isDeleted: false,
			employeeId: { in: employeeCodes },
		},
		select: {
			id: true,
			employeeId: true,
			basicSalary: true,
			payFrequency: true,
			workforceSource: true,
			embeddedSchedule: true,
			department: { select: { name: true, code: true } },
			section: { select: { name: true, code: true } },
			position: { select: { title: true, code: true } },
			person: { select: { personalInfo: true } },
			timesheets: {
				where: { payrollPeriodId: payrollPeriod.id, isDeleted: false },
				select: {
					id: true,
					status: true,
					totalDays: true,
					totalHoursWorked: true,
					totalRegularHours: true,
					totalOvertimeHours: true,
					totalLateHours: true,
					totalEarlyOutHours: true,
					timesheetlines: {
						where: { isDeleted: false, isEffective: true },
						orderBy: { date: "asc" },
						select: {
							date: true,
							status: true,
							regularHours: true,
							overtimeHours: true,
							lateHours: true,
							earlyOutHours: true,
							metadata: true,
						},
					},
				},
			},
			employeeBenefits: {
				where: {
					isDeleted: false,
					isActive: true,
					status: { in: ["ACTIVE", "APPROVED"] },
					startDate: { lte: new Date(`${payrollPeriod.endDate}T00:00:00.000Z`) },
					OR: [{ endDate: null }, { endDate: { gte: new Date(`${payrollPeriod.startDate}T00:00:00.000Z`) } }],
				},
				select: {
					amount: true,
					totalAmount: true,
					benefitType: { select: { code: true, name: true, payrollDirection: true } },
				},
			},
			employeeLoans: {
				where: {
					isDeleted: false,
					status: { in: ["ACTIVE", "APPROVED"] },
					startDate: { lte: new Date(`${payrollPeriod.endDate}T00:00:00.000Z`) },
					endDate: { gte: new Date(`${payrollPeriod.startDate}T00:00:00.000Z`) },
				},
				select: {
					monthlyPayment: true,
					totalAmount: true,
					loanType: { select: { name: true } },
				},
			},
			employeePayrolls: {
				where: { payrollPeriodId: payrollPeriod.id, isDeleted: false },
				select: {
					id: true,
					isPaid: true,
					basicPay: true,
					overtimePay: true,
					nightDiffPay: true,
					holidayPay: true,
					allowances: true,
					grossPay: true,
					taxAmount: true,
					sssContribution: true,
					philHealthContribution: true,
					pagibigContribution: true,
					loanDeductions: true,
					absentDeduction: true,
					lateDeduction: true,
					earlyOutDeduction: true,
					otherDeductions: true,
					taxableIncome: true,
					totalDeductions: true,
					netPay: true,
					metadata: true,
					rateBreakdown: true,
				},
			},
		},
	});
	const employeesByCode = new Map(employees.map((employee) => [employee.employeeId, employee]));

	const samples = workbookRows.map((workbookRow) => {
		const employee = employeesByCode.get(workbookRow.employeeCode);
		const comparisonRow = comparisonByCode.get(workbookRow.employeeCode);
		const timesheet = employee?.timesheets?.[0];
		const lines = timesheet?.timesheetlines || [];
		const monthlyRate = workbookNumber(workbookRow, "monthlySalary", analysis) || workbookNumber(workbookRow, "basicSalary", analysis) * 2;
		const periodBasic = workbookNumber(workbookRow, "basicSalary", analysis);
		const workbookDailySalary = numberValue(workbookRow.values["Daily Salary"]);
		const dailyRate313 = roundToCentavo(
			(monthlyRate * 12) / BANDAI_PAYROLL_FORMULA_CONFIG.rateBasis.annualWorkDays,
		);
		const hourlyRate313 = roundToCentavo(
			dailyRate313 / BANDAI_PAYROLL_FORMULA_CONFIG.rateBasis.workingHoursPerDay,
		);
		const approvedBucketPay = calculateApprovedBucketPay(lines, periodBasic);
		const workbookGrossPay = workbookNumber(workbookRow, "grossPay", analysis);
		const workbookWithholdingTax = workbookNumber(workbookRow, "withholdingTax", analysis);
		const impliedTaxableIncome = solveTaxableIncomeFromBandaiTax(workbookWithholdingTax);
		const impliedTaxExcludedFromGross =
			impliedTaxableIncome === null ? null : roundToCentavo(workbookGrossPay - impliedTaxableIncome);
		const taxFromGross = calculateBandaiSemiMonthlyTax(workbookGrossPay);
		const taxFromImpliedTaxable =
			impliedTaxableIncome === null ? null : calculateBandaiSemiMonthlyTax(impliedTaxableIncome);
		const configuredContributions = calculateConfiguredContributions(monthlyRate);
		const benefitRows = employee?.employeeBenefits || [];
		const loanRows = employee?.employeeLoans || [];
		const componentChecks = moneyFields
			.map((field) => {
				const comparisonField = comparisonRow?.fields.find((candidate) => candidate.field === field);
				const workbookSide = comparisonField?.workbookValue ?? workbookValue(workbookRow, field, analysis);
				const hrisSide = comparisonField?.hrisValue ?? null;
				const difference =
					typeof workbookSide === "number" || typeof hrisSide === "number"
						? roundToCentavo(numberValue(workbookSide) - numberValue(hrisSide))
						: 0;
				return {
					field,
					workbookValue: workbookSide,
					hrisValue: hrisSide,
					difference,
					matched: Math.abs(difference) <= tolerance,
					category: comparisonField?.category || "NOT_COMPARED",
					sourceColumn: comparisonField?.sourceColumn,
					sourceCell: comparisonField?.sourceCell,
					sourceBreakdown: comparisonField?.sourceBreakdown,
				};
			})
			.filter((check) => check.workbookValue !== null || check.hrisValue !== null);
		const stopChecks = componentChecks.filter((check) => stopFields.includes(check.field));
		const hrisAmount = (field: string) =>
			numberValue(componentChecks.find((check) => check.field === field)?.hrisValue);
		const lineEvidence = lines.map((line) => {
			const bucket = getApprovedBuckets(line);
			return {
				date: dateOnly(line.date),
				status: line.status,
				regularHours: roundToCentavo(durationToHours(line.regularHours)),
				overtimeHours: roundToCentavo(durationToHours(line.overtimeHours)),
				lateHours: roundToCentavo(durationToHours(line.lateHours)),
				earlyOutHours: roundToCentavo(durationToHours(line.earlyOutHours)),
				approvedBuckets: bucket,
				dayPay: Object.keys(bucket).length && approvedBucketPay
					? calculateApprovedBucketDayPay(bucket, approvedBucketPay, periodBasic)
					: undefined,
			};
		});
		const employeeFound = Boolean(employee);
		const timesheetFound = Boolean(timesheet);
		const approvedBucketLineCount = lines.filter(hasApprovedBuckets).length;
		const nextActions = buildNextActions({
			employeeFound,
			timesheetFound,
			effectiveLineCount: lines.length,
			approvedBucketLineCount,
			componentChecks,
		});
		const generatedPayroll = employee?.employeePayrolls?.[0] || null;
		const sourceBreakdownByLabel = buildSourceBreakdownMap(componentChecks);
		const bucketTotals = asRecord(approvedBucketPay?.totals);
		const sourceValue = (label: string) => sourceBreakdownByLabel.get(label)?.value || 0;
		const sourceLabel = (label: string, fallback: string) =>
			sourceBreakdownByLabel.get(label)?.sourceCell || fallback;
		const exactHrisValue = (column: string, label: string): number | string | null => {
			switch (column) {
				case "A":
					return workbookRow.values[label] ?? workbookRow.rowNumber - 4;
				case "B":
					return workbookRow.employeeCode;
				case "C":
					return workbookRow.employeeName;
				case "D":
					return employee?.department?.name || String(workbookRow.values.Department || "") || null;
				case "E":
					return employee?.section?.name || String(workbookRow.values.Division || "") || null;
				case "F":
					return employee?.position?.title || String(workbookRow.values.Position || "") || null;
				case "G":
					return monthlyRate;
				case "H":
					return workbookRow.values[label] ?? workbookDailySalary;
				case "I":
					return workbookRow.values[label] ?? workbookNumber(workbookRow, "days", analysis);
				case "J":
					return hrisAmount("basicSalary");
				case "K":
					return workbookRow.values[label] ?? generatedPayroll?.absentDeduction ?? 0;
				case "L":
					return roundToCentavo(numberValue(generatedPayroll?.lateDeduction) + numberValue(generatedPayroll?.earlyOutDeduction));
				case "M":
					return roundToCentavo(numberValue(bucketTotals.regOtHrs));
				case "N":
					return hrisAmount("overtimePay");
				case "O":
					return roundToCentavo(numberValue(bucketTotals.rdHrs));
				case "P":
					return hrisAmount("restDayPay");
				case "Q":
					return roundToCentavo(numberValue(bucketTotals.rdOtHrs));
				case "R":
					return hrisAmount("restDayOtPay");
				case "S":
					return workbookRow.values[label] ?? roundToCentavo(numberValue(bucketTotals.spclOtHrs));
				case "T":
					return sourceValue("Spc Hol OT") || hrisAmount("specialHolidayPay");
				case "U":
					return numberValue(workbookRow.values[label]);
				case "V":
					return sourceValue("Sun/Spc Hol OT Exc");
				case "W":
					return numberValue(workbookRow.values[label]);
				case "X":
					return sourceValue("Spc RD OT");
				case "Y":
					return numberValue(workbookRow.values[label]);
				case "Z":
					return sourceValue("Spc RD Exc OT");
				case "AA":
					return roundToCentavo(numberValue(bucketTotals.rholOtHrs));
				case "AB":
					return hrisAmount("legalHolidayPay");
				case "AG":
					return hrisAmount("nightDiffPay");
				case "AH":
					return hrisAmount("leavePay");
				case "AM":
				case "AN":
				case "AP":
				case "AT":
				case "BD":
				case "CS":
				case "CT":
				case "CU":
				case "CV":
					return sourceValue(label);
				case "AO":
				case "AZ":
				case "BA":
				case "BB":
				case "BC":
				case "CM":
				case "CO":
				case "CP":
				case "CQ":
				case "CR":
					return sourceValue(label);
				case "BH":
					return hrisAmount("grossPay");
				case "BI":
					return hrisAmount("withholdingTax");
				case "BK":
					return hrisAmount("sssContribution");
				case "BL":
					return hrisAmount("philHealthContribution");
				case "BM":
					return hrisAmount("pagibigContribution");
				case "BN":
				case "BU":
				case "CD":
				case "CE":
				case "CF":
				case "CG":
				case "CH":
				case "CI":
				case "CJ":
					return sourceValue(label);
				case "BT":
					return sourceValue(label) || hrisAmount("uniformDeduction");
				case "CK":
					return hrisAmount("totalDeductions");
				case "CL":
					return hrisAmount("netPay");
				case "CW":
					return hrisAmount("totalReceivable");
				case "CX":
					return workbookRow.values.Remarks ? String(workbookRow.values.Remarks) : "";
				default:
					return sourceValue(label);
			}
		};
		const exactSource = (column: string, label: string) => {
			if (["A", "B", "C", "D", "E", "F"].includes(column)) return "Employee master/DB assignment";
			if (["H", "I", "K", "S"].includes(column)) return "Payroll register export column / workbook parity";
			if (["G", "H", "I", "J"].includes(column)) return "Employee rate + approved period/timesheet";
			if (["K", "L", "BH", "BI", "BK", "BL", "BM", "CK", "CL", "CW"].includes(column)) {
				return generatedPayroll ? "EmployeePayroll generated row / parity comparison" : "Payroll preview parity comparison";
			}
			if (["M", "O", "Q", "S", "AA"].includes(column)) return "Effective Timesheetline approved buckets";
			if (["N", "P", "R", "T", "V", "X", "Z", "AB", "AG", "AH"].includes(column)) {
				return sourceLabel(label, "Approved bucket formula / parity comparison");
			}
			if (["AM", "AN", "AP", "AT", "BD", "CS", "CT", "CU", "CV"].includes(column)) {
				return sourceLabel(label, "Compensation Mass Upload / per-cutoff reference");
			}
			if (["BN", "BT", "BU", "CD", "CE", "CF", "CG", "CH", "CI", "CJ", "CC"].includes(column)) {
				return sourceLabel(label, "Deduction Mass Upload / loan amortization source");
			}
			return sourceLabel(label, "No HRIS source value for this cutoff column");
		};
		const payrollComputationColumns = PAYROLL_COMPUTATION_REPORT_COLUMNS.map(([column, label]) => {
			const rawWorkbookSide = workbookRow.values[label] ?? null;
			const workbookSide = column === "B" && rawWorkbookSide !== null
				? String(rawWorkbookSide).padStart(5, "0")
				: rawWorkbookSide;
			const hrisSide = exactHrisValue(column, label);
			return {
				column,
				label,
				workbookValue: workbookSide,
				hrisValue: hrisSide,
				difference: reportNumberDifference(workbookSide, hrisSide),
				source: exactSource(column, label),
			};
		});
		return {
			employeeId: workbookRow.employeeCode,
			employeeName: workbookRow.employeeName,
			workbook: {
				sheet: workbookRow.sheetName,
				row: workbookRow.rowNumber,
				department: workbookRow.values.Department ?? null,
				division: workbookRow.values.Division ?? null,
				position: workbookRow.values.Position ?? null,
				monthlyRate,
				dailySalaryColumn: workbookDailySalary,
				noOfDays: workbookNumber(workbookRow, "days", analysis),
				basicSalary: periodBasic,
				grossPay: workbookGrossPay,
				netPay: workbookNumber(workbookRow, "netPay", analysis),
				totalReceivable: workbookNumber(workbookRow, "totalReceivable", analysis),
				regularOtHours: workbookNumber(workbookRow, "overtimeHours", analysis),
				regularOtPay: workbookNumber(workbookRow, "overtimePay", analysis),
				restDayHours: workbookNumber(workbookRow, "restDayHours", analysis),
				restDayPay: workbookNumber(workbookRow, "restDayPay", analysis),
				restDayOtPay: workbookNumber(workbookRow, "restDayOtPay", analysis),
				specialHolidayPay: workbookNumber(workbookRow, "specialHolidayPay", analysis),
				legalHolidayPay: workbookNumber(workbookRow, "legalHolidayPay", analysis),
				nightDiffPay: workbookNumber(workbookRow, "nightDiffPay", analysis),
				allowanceColumnsTotal: sumWorkbookColumns(workbookRow, [
					"HYS Meal Allowance",
					"OB Allowance",
					"Overtime Meal Allownce",
					"De Minimis Allowance",
					"Meal Allowance",
					"Line Leader Allowance",
					"Perfect Attendance",
				]),
			},
			db: {
				found: employeeFound,
				department: employee?.department?.name || null,
				section: employee?.section?.name || null,
				position: employee?.position?.title || null,
				workforceSource: employee?.workforceSource || null,
				basicSalary: employee?.basicSalary ?? null,
				payFrequency: employee?.payFrequency || null,
				scheduleCode: asRecord(employee?.embeddedSchedule).templateCode || asRecord(employee?.embeddedSchedule).code || null,
				timesheetId: timesheet?.id || null,
				timesheetStatus: timesheet?.status || null,
				effectiveLineCount: lines.length,
				approvedBucketLineCount,
				timesheetSummary: timesheet
					? {
							totalDays: timesheet.totalDays,
							totalHoursWorked: timesheet.totalHoursWorked,
							totalRegularHours: timesheet.totalRegularHours,
							totalOvertimeHours: timesheet.totalOvertimeHours,
							totalLateHours: timesheet.totalLateHours,
							totalEarlyOutHours: timesheet.totalEarlyOutHours,
						}
					: null,
				compensationBenefits: benefitRows
					.filter((row) => row.benefitType?.payrollDirection === "COMPENSATION")
					.map((row) => ({
						code: row.benefitType?.code,
						name: row.benefitType?.name,
						amount: row.amount ?? row.totalAmount ?? 0,
					})),
				deductionBenefits: benefitRows
					.filter((row) => row.benefitType?.payrollDirection === "DEDUCTION")
					.map((row) => ({
						code: row.benefitType?.code,
						name: row.benefitType?.name,
						amount: row.amount ?? row.totalAmount ?? 0,
					})),
				loans: loanRows.map((row) => ({
					name: row.loanType?.name,
					amount: row.monthlyPayment ?? row.totalAmount ?? 0,
				})),
				generatedPayroll,
			},
			hrResult: {
				cutoff: `${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.startDate} to ${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.endDate}`,
				payDate: BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.payDate,
				status: generatedPayroll ? (generatedPayroll.isPaid ? "PAID" : "GENERATED_UNPAID") : "PREVIEW_ONLY_OR_MISSING",
				employee: {
					id: workbookRow.employeeCode,
					name: workbookRow.employeeName,
					department: employee?.department?.name || String(workbookRow.values.Department || "") || null,
					section: employee?.section?.name || String(workbookRow.values.Division || "") || null,
					position: employee?.position?.title || String(workbookRow.values.Position || "") || null,
					scheduleCode:
						(asRecord(employee?.embeddedSchedule).templateCode as string) ||
						(asRecord(employee?.embeddedSchedule).code as string) ||
						null,
				},
				earnings: {
					basicSalary: hrisAmount("basicSalary"),
					overtimePay: hrisAmount("overtimePay"),
					restDayPay: hrisAmount("restDayPay"),
					restDayOtPay: hrisAmount("restDayOtPay"),
					specialHolidayPay: hrisAmount("specialHolidayPay"),
					legalHolidayPay: hrisAmount("legalHolidayPay"),
					nightDiffPay: hrisAmount("nightDiffPay"),
					leavePay: hrisAmount("leavePay"),
					grossIncludedAllowances: hrisAmount("grossIncludedAllowances"),
					grossPay: hrisAmount("grossPay"),
				},
				deductions: {
					withholdingTax: hrisAmount("withholdingTax"),
					sssContribution: hrisAmount("sssContribution"),
					philHealthContribution: hrisAmount("philHealthContribution"),
					pagibigContribution: hrisAmount("pagibigContribution"),
					loanDeductions: hrisAmount("loanDeductions"),
					uniformDeduction: hrisAmount("uniformDeduction"),
					totalDeductions: hrisAmount("totalDeductions"),
				},
				net: {
					netPay: hrisAmount("netPay"),
					receivableOnlyAllowances: hrisAmount("receivableOnlyAllowances"),
					postNetReceivableAdjustments: hrisAmount("postNetReceivableAdjustments"),
					totalReceivable: hrisAmount("totalReceivable"),
				},
				sourceSummary: {
					allowanceUploadBacked: benefitRows.some((row) => row.benefitType?.payrollDirection === "COMPENSATION"),
					deductionUploadBacked:
						loanRows.length > 0 ||
						benefitRows.some((row) => row.benefitType?.payrollDirection === "DEDUCTION"),
					timesheetBacked: Boolean(timesheet && lines.length),
					generatedPayrollFound: Boolean(generatedPayroll),
				},
			},
			payrollComputationColumns,
			rate: {
				formula: "Daily Rate = (Monthly Rate x 12) / 313",
				monthlyRate,
				periodBasic,
				dailyRate313,
				hourlyRate313,
				workbookDailySalary,
				workbookDailyMatches313:
					workbookDailySalary > 0 ? Math.abs(workbookDailySalary - dailyRate313) <= tolerance : null,
				helperRateFormula: comparisonRow?.rateAnalysis?.formulaSource || null,
				helperWorkbookDailyRate: comparisonRow?.rateAnalysis?.workbookDailyRate || null,
				helperBnpi313DailyRate: comparisonRow?.rateAnalysis?.bnpi313DailyRateFromPeriodBasic || null,
			},
			tax: {
				table: BANDAI_PAYROLL_FORMULA_CONFIG.withholdingTax.table,
				workbookWithholdingTax,
				taxIfGrossPayFullyTaxable: taxFromGross,
				impliedTaxableIncomeFromWorkbookTax: impliedTaxableIncome,
				impliedTaxExcludedFromGross,
				taxFromImpliedTaxable,
				configuredMonthlySss: configuredContributions.sssMonthlyEmployeeShare,
				configuredMonthlyPhilHealth: configuredContributions.philHealthMonthlyEmployeeShare,
				configuredMonthlyPagIbig: configuredContributions.pagIbigMonthlyEmployeeShare,
				configuredContributionMonthlyBasis: configuredContributions.monthlyBasis,
				sssMsc: configuredContributions.sssMsc,
				philHealthBase: configuredContributions.philHealthBase,
				pagIbigBase: configuredContributions.pagIbigBase,
			},
			approvedBucketPay,
			componentChecks,
			lines: lineEvidence,
			nextActions,
			matched: stopChecks.length > 0 && stopChecks.every((check) => check.matched),
		} satisfies SampleEvidence;
	});

	return {
		metadata: {
			iteration,
			generatedAt: new Date().toISOString(),
			dbName: comparison.metadata.dbName,
			organizationId: comparison.metadata.organizationId,
			cutoff: analysis.detectedCutoff,
			payrollPeriod,
			divisionPattern: divisionPattern.source,
			sampleSize: samples.length,
			tolerance,
			allPayrollColumns: showAllPayrollColumns,
			formulaConfig: BANDAI_PAYROLL_FORMULA_CONFIG,
			sourceCoverage: sourceEvidence.sourceCoverage,
			stopCondition:
				"Stop only when every sampled employee has a DB employee, a period timesheet, effective timesheet lines, and every stopFields component matches the workbook within tolerance.",
			stopFields,
			comparisonSummary: comparison.summary,
		},
		sourceEvidence,
		samples,
		allMatched: samples.every((sample) => sample.matched),
	};
}

function formatMoney(value: unknown) {
	return `PHP ${numberValue(value).toLocaleString("en-PH", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function pad(text: unknown, width: number) {
	const value = String(text ?? "");
	return value.length >= width ? `${value.slice(0, Math.max(0, width - 3))}...` : value.padEnd(width);
}

function signed(value: number) {
	const formatted = formatMoney(Math.abs(value));
	return value < 0 ? `-${formatted}` : `+${formatted}`;
}

function isReportQuantityColumn(column: string) {
	return ["A", "I", "M", "O", "Q", "S", "U", "W", "Y", "AA"].includes(column);
}

function isReportTextColumn(column: string) {
	return ["B", "C", "D", "E", "F", "CX"].includes(column);
}

function formatReportValue(value: unknown, column: string) {
	if (value === null || value === undefined || value === "") return "-";
	if (column === "B") return String(value).padStart(5, "0");
	if (isReportTextColumn(column)) return String(value);
	if (isReportQuantityColumn(column)) {
		return numberValue(value).toLocaleString("en-PH", {
			minimumFractionDigits: 0,
			maximumFractionDigits: 2,
		});
	}
	return formatMoney(value);
}

function formatReportDifference(value: number | null, column: string) {
	if (value === null) return "-";
	if (isReportQuantityColumn(column)) {
		const absValue = Math.abs(value).toLocaleString("en-PH", {
			minimumFractionDigits: 0,
			maximumFractionDigits: 2,
		});
		return value < 0 ? `-${absValue}` : `+${absValue}`;
	}
	return signed(value);
}

function reportCellDisplay(value: unknown, column: string) {
	if (value === null || value === undefined || value === "") return "-";
	if (column === "B") return String(value).padStart(5, "0");
	if (isReportTextColumn(column)) return String(value);
	const numericValue = numberValue(value);
	if (!numericValue) return "-";
	if (isReportQuantityColumn(column)) {
		return numericValue.toLocaleString("en-PH", {
			minimumFractionDigits: 0,
			maximumFractionDigits: 2,
		});
	}
	return numericValue.toLocaleString("en-PH", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

function reportColumnWidth(column: string) {
	if (column === "C") return 26;
	if (["D", "E", "F"].includes(column)) return 22;
	if (["A", "B"].includes(column)) return 12;
	return 16;
}

function reportRowLine(
	columns: Array<(typeof PAYROLL_COMPUTATION_REPORT_COLUMNS)[number]>,
	values: Map<string, unknown>,
) {
	return columns
		.map(([column]) => pad(reportCellDisplay(values.get(column), column), reportColumnWidth(column)))
		.join(" ");
}

type RegisterBand = {
	columns: Array<(typeof PAYROLL_COMPUTATION_REPORT_COLUMNS)[number]>;
	rows: Array<{ label: string; values: Map<string, unknown> }>;
	totalMap: Map<string, unknown>;
};

function visibleReportColumns(samples: SampleEvidence[]) {
	if (showAllPayrollColumns) return [...PAYROLL_COMPUTATION_REPORT_COLUMNS];
	const mustShow = new Set(["A", "B", "C", "D", "E", "F", "CJ", "CK", "CL", "CM", "CN", "CO", "CP", "CQ", "CR", "CS", "CT", "CU", "CV", "CW"]);
	return PAYROLL_COMPUTATION_REPORT_COLUMNS.filter(([column]) => {
		if (mustShow.has(column)) return true;
		return samples.some((sample) => {
			const row = sample.payrollComputationColumns.find((entry) => entry.column === column);
			return numberValue(row?.workbookValue) !== 0 || numberValue(row?.hrisValue) !== 0;
		});
	});
}

function shouldShowPayrollComputationColumn(row: SampleEvidence["payrollComputationColumns"][number]) {
	return (
		showAllPayrollColumns ||
		["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "BH", "BI", "BK", "BL", "BM", "CK", "CL", "CW"].includes(
			row.column,
		) ||
		numberValue(row.workbookValue) !== 0 ||
		numberValue(row.hrisValue) !== 0 ||
		Boolean(row.workbookValue && isReportTextColumn(row.column))
	);
}

function buildRegisterBands(evidence: Awaited<ReturnType<typeof buildIterationEvidence>>, bandSize = 8) {
	const columns = visibleReportColumns(evidence.samples);
	const bands: RegisterBand[] = [];
	for (let start = 0; start < columns.length; start += bandSize) {
		const band = columns.slice(start, start + bandSize);
		const rows = evidence.samples.map((sample) => ({
			label: sample.employeeId,
			values: new Map(sample.payrollComputationColumns.map((entry) => [entry.column, entry.hrisValue])),
		}));
		const totalMap = new Map<string, unknown>();
		for (const [column] of band) {
			if (column === "C") {
				totalMap.set(column, "GRAND TOTAL:");
				continue;
			}
			if (isReportTextColumn(column) || column === "A" || column === "B") {
				totalMap.set(column, "");
				continue;
			}
			const total = evidence.samples.reduce((sum, sample) => {
				const row = sample.payrollComputationColumns.find((entry) => entry.column === column);
				return sum + numberValue(row?.hrisValue);
			}, 0);
			totalMap.set(column, roundToCentavo(total));
		}
		bands.push({ columns: band, rows, totalMap });
	}
	return bands;
}

function reportColumnWeight(column: string) {
	if (column === "C") return 2.2;
	if (["D", "E", "F"].includes(column)) return 1.6;
	if (["A", "B"].includes(column)) return 0.9;
	if (column === "CX") return 1.7;
	return 1.05;
}

function bandColumnWidths(columns: Array<(typeof PAYROLL_COMPUTATION_REPORT_COLUMNS)[number]>, tableWidth: number) {
	const totalWeight = columns.reduce((sum, [column]) => sum + reportColumnWeight(column), 0);
	return columns.map(([column]) => Math.floor((tableWidth * reportColumnWeight(column)) / totalWeight));
}

function bandTitle(index: number, total: number) {
	return `Workbook Columns ${index + 1} of ${total}`;
}

const reportColumnByCode = new Map<string, (typeof PAYROLL_COMPUTATION_REPORT_COLUMNS)[number]>(
	PAYROLL_COMPUTATION_REPORT_COLUMNS.map((column) => [column[0], column]),
);

const REPORT_SECTION_DEFINITIONS = [
	{
		title: "Employee and Base Pay",
		note: "",
		columns: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"],
	},
	{
		title: "Attendance and Premium Pay",
		note: "",
		columns: ["B", "C", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH"],
	},
	{
		title: "Allowances and Earnings Adjustments",
		note: "",
		columns: ["B", "C", "AI", "AJ", "AK", "AL", "AM", "AN", "AO", "AP", "AQ", "AR", "AS", "AT", "AU", "AV", "AW", "AX", "AY", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH"],
	},
	{
		title: "Taxes, Loans, and Deductions",
		note: "",
		columns: ["B", "C", "BI", "BJ", "BK", "BL", "BM", "BN", "BO", "BP", "BQ", "BR", "BS", "BT", "BU", "BV", "BW", "BX", "BY", "BZ", "CA", "CB", "CC", "CD", "CE", "CF", "CG", "CH", "CI", "CJ", "CK", "CL"],
	},
	{
		title: "Receivables and Remarks",
		note: "",
		columns: ["B", "C", "CM", "CN", "CO", "CP", "CQ", "CR", "CS", "CT", "CU", "CV", "CW", "CX"],
	},
] as const;

function reportColumnsForCodes(codes: readonly string[]) {
	return codes.map((code) => reportColumnByCode.get(code)).filter(Boolean) as Array<(typeof PAYROLL_COMPUTATION_REPORT_COLUMNS)[number]>;
}

function sectionColumns(samples: SampleEvidence[], codes: readonly string[]) {
	const visible = new Set(visibleReportColumns(samples).map(([column]) => column));
	return reportColumnsForCodes(codes).filter(([column]) => visible.has(column));
}

function shouldTotalReportColumn(column: string) {
	return !isReportTextColumn(column) && column !== "A" && column !== "B";
}

function buildReportSectionRows(
	evidence: Awaited<ReturnType<typeof buildIterationEvidence>>,
	columns: Array<(typeof PAYROLL_COMPUTATION_REPORT_COLUMNS)[number]>,
) {
	const rows = evidence.samples.map((sample) => ({
		label: sample.employeeId,
		values: new Map(sample.payrollComputationColumns.map((entry) => [entry.column, entry.hrisValue])),
	}));
	const totalMap = new Map<string, unknown>();
	for (const [column] of columns) {
		if (column === "C") {
			totalMap.set(column, "TOTAL");
			continue;
		}
		if (!shouldTotalReportColumn(column)) {
			totalMap.set(column, "");
			continue;
		}
		const total = evidence.samples.reduce((sum, sample) => {
			const row = sample.payrollComputationColumns.find((entry) => entry.column === column);
			return sum + numberValue(row?.hrisValue);
		}, 0);
		totalMap.set(column, roundToCentavo(total));
	}
	return { rows, totalMap };
}

function splitColumnsForReadableTables(columns: Array<(typeof PAYROLL_COMPUTATION_REPORT_COLUMNS)[number]>, maxColumns = 9) {
	const pinned = columns.filter(([column]) => column === "B" || column === "C");
	const details = columns.filter(([column]) => column !== "B" && column !== "C");
	if (columns.length <= maxColumns || !pinned.length) return [columns];
	const chunks: Array<(typeof PAYROLL_COMPUTATION_REPORT_COLUMNS)[number][]> = [];
	const detailSlots = Math.max(1, maxColumns - pinned.length);
	for (let start = 0; start < details.length; start += detailSlots) {
		chunks.push([...pinned, ...details.slice(start, start + detailSlots)]);
	}
	return chunks;
}

function payrollInputLabel(component: string) {
	const labels: Record<string, string> = {
		allowances: "Allowances",
		loanDeductions: "Loans and Deductions",
		overtimeHours: "Overtime Hours",
		restHolidayPremiumHours: "Rest Day / Holiday Hours",
	};
	return labels[component] || component;
}

function printPayrollRegisterReport(evidence: Awaited<ReturnType<typeof buildIterationEvidence>>) {
	const columns = visibleReportColumns(evidence.samples);
	const bandSize = 8;
	console.log(color("\nBANDAI NAMCO PHILIPPINES INC.", "bold"));
	console.log(color("PAYROLL REGISTER PER DEPARTMENT/EMPLOYEE", "bold"));
	console.log(
		color(
			`Payroll Period: ${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.startDate} to ${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.endDate}     Pay Date: ${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.payDate}`,
			"bold",
		),
	);
	console.log(color("HRIS dry-generation/register view, shown in Excel column bands", "gray"));
	for (let start = 0; start < columns.length; start += bandSize) {
		const band = columns.slice(start, start + bandSize);
		console.log("");
		console.log(band.map(([column]) => pad(column, reportColumnWidth(column))).join(" "));
		console.log(band.map(([column, label]) => pad(label, reportColumnWidth(column))).join(" "));
		console.log(band.map(([column]) => "-".repeat(reportColumnWidth(column))).join(" "));
		for (const sample of evidence.samples) {
			const valueMap = new Map(sample.payrollComputationColumns.map((entry) => [entry.column, entry.hrisValue]));
			console.log(reportRowLine(band, valueMap));
		}
		const totalMap = new Map<string, unknown>();
		for (const [column] of band) {
			if (column === "C") {
				totalMap.set(column, "GRAND TOTAL:");
				continue;
			}
			if (isReportTextColumn(column) || column === "A" || column === "B") {
				totalMap.set(column, "");
				continue;
			}
			const total = evidence.samples.reduce((sum, sample) => {
				const row = sample.payrollComputationColumns.find((entry) => entry.column === column);
				return sum + numberValue(row?.hrisValue);
			}, 0);
			totalMap.set(column, roundToCentavo(total));
		}
		console.log(band.map(([column]) => "=".repeat(reportColumnWidth(column))).join(" "));
		console.log(reportRowLine(band, totalMap));
	}
}

function payrollRegisterReportLines(evidence: Awaited<ReturnType<typeof buildIterationEvidence>>) {
	const columns = visibleReportColumns(evidence.samples);
	const lines: string[] = [];
	const bandSize = 8;
	lines.push("BANDAI NAMCO PHILIPPINES INC.");
	lines.push("PAYROLL REGISTER PER DEPARTMENT/EMPLOYEE");
	lines.push(
		`Payroll Period: ${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.startDate} to ${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.endDate}     Pay Date: ${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.payDate}`,
	);
	lines.push("HRIS dry-generation/register view, shown in Excel column bands");
	lines.push("");
	for (let start = 0; start < columns.length; start += bandSize) {
		const band = columns.slice(start, start + bandSize);
		lines.push(band.map(([column]) => pad(column, reportColumnWidth(column))).join(" "));
		lines.push(band.map(([column, label]) => pad(label, reportColumnWidth(column))).join(" "));
		lines.push(band.map(([column]) => "-".repeat(reportColumnWidth(column))).join(" "));
		for (const sample of evidence.samples) {
			const valueMap = new Map(sample.payrollComputationColumns.map((entry) => [entry.column, entry.hrisValue]));
			lines.push(reportRowLine(band, valueMap));
		}
		const totalMap = new Map<string, unknown>();
		for (const [column] of band) {
			if (column === "C") {
				totalMap.set(column, "GRAND TOTAL:");
				continue;
			}
			if (isReportTextColumn(column) || column === "A" || column === "B") {
				totalMap.set(column, "");
				continue;
			}
			const total = evidence.samples.reduce((sum, sample) => {
				const row = sample.payrollComputationColumns.find((entry) => entry.column === column);
				return sum + numberValue(row?.hrisValue);
			}, 0);
			totalMap.set(column, roundToCentavo(total));
		}
		lines.push(band.map(([column]) => "=".repeat(reportColumnWidth(column))).join(" "));
		lines.push(reportRowLine(band, totalMap));
		lines.push("");
	}
	return lines;
}

async function writePdfReport(filePath: string, evidence: Awaited<ReturnType<typeof buildIterationEvidence>>) {
	const matched = evidence.samples.filter((sample) => sample.matched).length;
	const doc = new PDFDocument({ size: "LEGAL", layout: "landscape", margin: 24 });
	await new Promise<void>((resolve, reject) => {
		const stream = fs.createWriteStream(filePath);
		stream.on("finish", resolve);
		stream.on("error", reject);
		doc.on("error", reject);
		doc.pipe(stream);

		const pageBottom = () => doc.page.height - doc.page.margins.bottom;
		const tableLeft = doc.page.margins.left;
		const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
		const borderColor = "#9ca3af";
		const headerFill = "#e5e7eb";
		const subheaderFill = "#f3f4f6";
		const totalFill = "#fef3c7";
		const accentFill = "#dbeafe";
		const rowHeight = 22;
		const headerHeight = 38;
		const cellPadding = 3;
		const bands = buildRegisterBands(evidence, 8);

		const writeLine = (text = "", fontSize = 8, options: Record<string, any> = {}) => {
			const height = doc.heightOfString(text, { width: tableWidth, ...options }) + 2;
			if (doc.y + height > pageBottom()) doc.addPage();
			doc.fontSize(fontSize).fillColor("#111827").text(text, tableLeft, doc.y, { width: tableWidth, lineGap: 1, ...options });
		};

		const ensureSpace = (height: number) => {
			if (doc.y + height > pageBottom()) doc.addPage();
		};

		const drawCell = (text: string, x: number, y: number, width: number, height: number, options: Record<string, any> = {}) => {
			if (options.fill) doc.rect(x, y, width, height).fill(options.fill);
			doc.rect(x, y, width, height).strokeColor(borderColor).lineWidth(0.45).stroke();
			doc
				.fillColor(options.color || "#111827")
				.font(options.bold ? "Helvetica-Bold" : "Helvetica")
				.fontSize(options.fontSize || 6.2)
				.text(text || "-", x + cellPadding, y + 4, {
					width: Math.max(1, width - cellPadding * 2),
					height: Math.max(1, height - 6),
					align: options.align || "left",
					ellipsis: true,
				});
		};

		const drawTable = (
			title: string,
			columns: Array<(typeof PAYROLL_COMPUTATION_REPORT_COLUMNS)[number]>,
			rows: Array<{ label: string; values: Map<string, unknown> }>,
			totalMap: Map<string, unknown>,
			options: Record<string, any> = {},
		) => {
			const widths = bandColumnWidths(columns, tableWidth);
			const tableHeight = headerHeight + rowHeight * (rows.length + 1) + 28;
			ensureSpace(tableHeight);
			doc.font("Helvetica-Bold").fontSize(options.titleSize || 8.8).fillColor("#111827");
			doc.text(title, tableLeft, doc.y, { width: tableWidth });
			if (options.note) {
				doc.moveDown(0.1);
				doc.font("Helvetica").fontSize(6.8).fillColor("#4b5563").text(options.note, tableLeft, doc.y, { width: tableWidth });
			}
			doc.moveDown(0.25);
			const startY = doc.y;
			let x = tableLeft;
			for (const [column, label] of columns) {
				const width = widths.shift() || 60;
				drawCell(column, x, startY, width, 13, { fill: options.accent ? accentFill : headerFill, bold: true, align: "center", fontSize: 6.9 });
				drawCell(label, x, startY + 12, width, headerHeight - 12, {
					fill: subheaderFill,
					bold: true,
					align: isReportTextColumn(column) ? "left" : "right",
					fontSize: 6.1,
				});
				x += width;
			}
			let y = startY + headerHeight;
			for (const row of rows) {
				x = tableLeft;
				const rowWidths = bandColumnWidths(columns, tableWidth);
				for (const [column] of columns) {
					const width = rowWidths.shift() || 60;
					drawCell(reportCellDisplay(row.values.get(column), column), x, y, width, rowHeight, {
						align: isReportTextColumn(column) ? "left" : "right",
						fontSize: isReportTextColumn(column) ? 6.2 : 6.5,
					});
					x += width;
				}
				y += rowHeight;
			}
			x = tableLeft;
			const totalWidths = bandColumnWidths(columns, tableWidth);
			for (const [column] of columns) {
				const width = totalWidths.shift() || 60;
				drawCell(reportCellDisplay(totalMap.get(column), column), x, y, width, rowHeight, {
					fill: totalFill,
					bold: true,
					align: isReportTextColumn(column) ? "left" : "right",
					fontSize: 6.5,
				});
				x += width;
			}
			doc.y = y + rowHeight + 10;
		};

		doc.font("Helvetica-Bold");
		writeLine("BNPI GA/HR Payroll Review", 15);
		doc.font("Helvetica");
		writeLine(
			`Payroll Period: ${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.startDate} to ${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.endDate}     Pay Date: ${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.payDate}`,
			8.5,
		);
		writeLine(`Review Status: ${matched === evidence.samples.length ? "All sampled employees reconciled" : `${matched}/${evidence.samples.length} sampled employees reconciled`}`, 8);
		writeLine("", 6);

		const mismatches = evidence.samples.filter((sample) => !sample.matched);
		doc.font("Helvetica-Bold");
		writeLine("Exceptions", 10);
		doc.font("Helvetica");
		if (!mismatches.length) {
			writeLine("None", 8);
		} else {
			for (const sample of mismatches) {
				const diffText = sample.componentChecks
					.filter((check) => !check.matched && stopFields.includes(check.field))
					.map((check) => `${check.workbookColumn || check.field} ${signed(check.difference)}`)
					.join("; ");
				writeLine(`${sample.employeeId} ${sample.employeeName}: ${diffText}`, 7);
			}
		}
		writeLine("", 6);

		const coverageColumns = reportColumnsForCodes(["B", "C", "D", "E", "F", "BH", "CK", "CL", "CW"]);
		const { rows: coverageRows, totalMap: coverageTotalMap } = buildReportSectionRows(evidence, coverageColumns);
		drawTable("Payroll Summary", coverageColumns, coverageRows, coverageTotalMap, {
			note: "",
			accent: true,
			titleSize: 10,
		});

		doc.font("Helvetica-Bold");
		writeLine("Payroll Inputs", 10);
		const sourceStartY = doc.y + 2;
		const sourceCols = [
			{ label: "Component", width: tableWidth * 0.2, align: "left" },
			{ label: "Payroll Register", width: tableWidth * 0.16, align: "right" },
			{ label: "Input File", width: tableWidth * 0.16, align: "right" },
			{ label: "Variance", width: tableWidth * 0.16, align: "right" },
			{ label: "Reference", width: tableWidth * 0.32, align: "left" },
		];
		ensureSpace(24 + evidence.sourceEvidence.sourceCoverage.length * 20);
		let sourceX = tableLeft;
		for (const col of sourceCols) {
			drawCell(col.label, sourceX, sourceStartY, col.width, 18, { fill: headerFill, bold: true, fontSize: 6.8, align: col.align });
			sourceX += col.width;
		}
		let sourceY = sourceStartY + 18;
		for (const row of evidence.sourceEvidence.sourceCoverage) {
			sourceX = tableLeft;
			const values = [payrollInputLabel(row.component), formatMoney(row.workbookTotal), formatMoney(row.sourceTotal), signed(row.difference), row.source];
			for (const [index, value] of values.entries()) {
				const col = sourceCols[index];
				drawCell(value, sourceX, sourceY, col.width, 20, { fontSize: 6.5, align: col.align });
				sourceX += col.width;
			}
			sourceY += 20;
		}
		doc.y = sourceY + 12;

		doc.font("Helvetica-Bold");
		writeLine("Payroll Details", 11);
		for (const section of REPORT_SECTION_DEFINITIONS) {
			const columns = sectionColumns(evidence.samples, section.columns);
			if (!columns.length) continue;
			const { rows, totalMap } = buildReportSectionRows(evidence, columns);
			const chunks = splitColumnsForReadableTables(columns, 10);
			for (const [chunkIndex, chunk] of chunks.entries()) {
				const title = chunks.length > 1 ? `${section.title} (${chunkIndex + 1}/${chunks.length})` : section.title;
				drawTable(title, chunk, rows, totalMap, { note: chunkIndex === 0 ? section.note : "" });
			}
		}

		doc.addPage();
		doc.font("Helvetica-Bold");
		writeLine("Workbook Column Appendix", 11);
		for (const [index, band] of bands.entries()) drawTable(bandTitle(index, bands.length), band.columns, band.rows, band.totalMap);
		doc.end();
	});
}

async function writeXlsxReport(filePath: string, evidence: Awaited<ReturnType<typeof buildIterationEvidence>>) {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = "HRIS payroll verification";
	workbook.created = new Date();
	const matched = evidence.samples.filter((sample) => sample.matched).length;
	const border = { style: "thin", color: { argb: "FF9CA3AF" } };
	const fill = (argb: string) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
	const pageSetup = {
			paperSize: 5,
			orientation: "landscape",
			fitToPage: true,
			fitToWidth: 1,
			fitToHeight: 0,
			pageOrder: "overThenDown",
			horizontalCentered: true,
			margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
	};

	const styleRow = (sheet: any, rowNumber: number, options: Record<string, any> = {}) => {
		const row = sheet.getRow(rowNumber);
		row.eachCell((cell: any) => {
			cell.font = { name: "Arial", size: options.size || 9, bold: Boolean(options.bold), color: { argb: "FF111827" } };
			cell.alignment = { vertical: "middle", horizontal: options.align || "left", wrapText: Boolean(options.wrap) };
			if (options.fill) cell.fill = options.fill;
		});
	};

	const writeSheetHeader = (sheet: any, span = 9) => {
		sheet.addRow(["BNPI GA/HR Payroll Review"]);
		sheet.addRow([`Payroll Period: ${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.startDate} to ${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.endDate}; Pay Date: ${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.payDate}`]);
		sheet.addRow([`Review Status: ${matched === evidence.samples.length ? "All sampled employees reconciled" : `${matched}/${evidence.samples.length} sampled employees reconciled`}`]);
		sheet.addRow([]);
		for (let row = 1; row <= 3; row += 1) sheet.mergeCells(row, 1, row, span);
		styleRow(sheet, 1, { bold: true, size: 14 });
		styleRow(sheet, 2, { size: 9 });
		styleRow(sheet, 3, { size: 9 });
	};

	const writeExcelTable = (
		sheet: any,
		title: string,
		note: string,
		columns: Array<(typeof PAYROLL_COMPUTATION_REPORT_COLUMNS)[number]>,
		rows: Array<{ label: string; values: Map<string, unknown> }>,
		totalMap: Map<string, unknown>,
		accent = false,
	) => {
		const titleRow = sheet.addRow([title]).number;
		sheet.mergeCells(titleRow, 1, titleRow, columns.length);
		styleRow(sheet, titleRow, { bold: true, size: 10, fill: fill(accent ? "FFDBEAFE" : "FFE5E7EB") });
		if (note) {
			const noteRow = sheet.addRow([note]).number;
			sheet.mergeCells(noteRow, 1, noteRow, columns.length);
			styleRow(sheet, noteRow, { size: 8, wrap: true });
		}
		const codeRow = sheet.addRow(columns.map(([column]) => column));
		const labelRow = sheet.addRow(columns.map(([, label]) => label));
		for (const row of [codeRow, labelRow]) {
			row.eachCell((cell: any, columnNumber: number) => {
				const column = columns[columnNumber - 1]?.[0] || "";
				cell.font = { name: "Arial", size: row.number === codeRow.number ? 8 : 7, bold: true, color: { argb: "FF111827" } };
				cell.alignment = { vertical: "middle", horizontal: isReportTextColumn(column) ? "left" : "right", wrapText: true };
				cell.fill = fill(row.number === codeRow.number ? "FFE5E7EB" : "FFF3F4F6");
				cell.border = { top: border, left: border, bottom: border, right: border };
			});
		}
		for (const row of rows) {
			const excelRow = sheet.addRow(columns.map(([column]) => reportCellDisplay(row.values.get(column), column)));
			excelRow.eachCell((cell: any, columnNumber: number) => {
				const column = columns[columnNumber - 1]?.[0] || "";
				cell.font = { name: "Arial", size: 8, color: { argb: "FF111827" } };
				cell.alignment = { vertical: "middle", horizontal: isReportTextColumn(column) ? "left" : "right", wrapText: false };
				cell.border = { top: border, left: border, bottom: border, right: border };
			});
		}
		const totalRow = sheet.addRow(columns.map(([column]) => reportCellDisplay(totalMap.get(column), column)));
		totalRow.eachCell((cell: any, columnNumber: number) => {
			const column = columns[columnNumber - 1]?.[0] || "";
			cell.font = { name: "Arial", size: 8, bold: true, color: { argb: "FF111827" } };
			cell.alignment = { vertical: "middle", horizontal: isReportTextColumn(column) ? "left" : "right", wrapText: false };
			cell.fill = fill("FFFEF3C7");
			cell.border = { top: border, left: border, bottom: border, right: border };
		});
		sheet.addRow([]);
		return totalRow.number;
	};

	const groupedSheet = workbook.addWorksheet("Payroll Review", {
		views: [{ state: "frozen", xSplit: 0, ySplit: 4 }],
		pageSetup,
	});
	writeSheetHeader(groupedSheet, 10);
	let lastGroupedRow = groupedSheet.rowCount;
	const rollupColumns = reportColumnsForCodes(["B", "C", "D", "E", "F", "BH", "CK", "CL", "CW"]);
	const rollup = buildReportSectionRows(evidence, rollupColumns);
	lastGroupedRow = writeExcelTable(
		groupedSheet,
		"Payroll Summary",
		"",
		rollupColumns,
		rollup.rows,
		rollup.totalMap,
		true,
	);
	for (const section of REPORT_SECTION_DEFINITIONS) {
		const columns = sectionColumns(evidence.samples, section.columns);
		if (!columns.length) continue;
		const sectionRows = buildReportSectionRows(evidence, columns);
		const chunks = splitColumnsForReadableTables(columns, 10);
		for (const [chunkIndex, chunk] of chunks.entries()) {
			lastGroupedRow = writeExcelTable(
				groupedSheet,
				chunks.length > 1 ? `${section.title} (${chunkIndex + 1}/${chunks.length})` : section.title,
				chunkIndex === 0 ? section.note : "",
				chunk,
				sectionRows.rows,
				sectionRows.totalMap,
			);
		}
	}
	groupedSheet.columns = Array.from({ length: 10 }).map((_, index) => ({ width: index === 1 ? 13 : index === 2 ? 26 : 13 }));
	groupedSheet.pageSetup.printTitlesRow = "1:4";
	groupedSheet.pageSetup.printArea = `A1:J${lastGroupedRow}`;

	const appendixSheet = workbook.addWorksheet("Workbook Columns", {
		views: [{ state: "frozen", xSplit: 0, ySplit: 4 }],
		pageSetup,
	});
	writeSheetHeader(appendixSheet, 8);
	const bands = buildRegisterBands(evidence, 8);
	let lastAppendixRow = appendixSheet.rowCount;
	for (const [bandIndex, band] of bands.entries()) {
		lastAppendixRow = writeExcelTable(
			appendixSheet,
			bandTitle(bandIndex, bands.length),
			"",
			band.columns,
			band.rows,
			band.totalMap,
		);
	}
	appendixSheet.columns = Array.from({ length: 8 }).map((_, index) => ({ width: index === 2 ? 24 : index >= 3 && index <= 5 ? 18 : 14 }));
	appendixSheet.pageSetup.printTitlesRow = "1:4";
	appendixSheet.pageSetup.printArea = `A1:H${lastAppendixRow}`;

	await workbook.xlsx.writeFile(filePath);
}

function printFormulaConfig() {
	console.log(color("\nBNPI Payroll Formula Config", "bold"));
	console.log(
		[
			`${color("rate", "cyan")} ${BANDAI_PAYROLL_FORMULA_CONFIG.rateBasis.directMonthlyFormula}`,
			`${color("period", "cyan")} ${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.startDate} to ${BANDAI_PAYROLL_FORMULA_CONFIG.cutoff.endDate}`,
			`${color("tax", "cyan")} ${BANDAI_PAYROLL_FORMULA_CONFIG.withholdingTax.frequency} BIR table`,
			`${color("SSS", "cyan")} ${BANDAI_PAYROLL_FORMULA_CONFIG.contributions.sss.formula}`,
			`${color("PHIC", "cyan")} ${BANDAI_PAYROLL_FORMULA_CONFIG.contributions.philHealth.formula}`,
			`${color("HDMF", "cyan")} ${BANDAI_PAYROLL_FORMULA_CONFIG.contributions.pagIbig.formula}`,
			`${color("allowance", "cyan")} ${BANDAI_PAYROLL_FORMULA_CONFIG.sourceInputs.compensationMassUpload.usage}`,
			`${color("loan", "cyan")} ${BANDAI_PAYROLL_FORMULA_CONFIG.sourceInputs.deductionMassUpload.usage}`,
			`${color("columns", "cyan")} ${
				showAllPayrollColumns ? "showing every client payroll computation column A:CX" : "showing key/non-zero workbook columns"
			}`,
			`${color("stop", "cyan")} ${stopFields.join(", ")}`,
		].join("\n"),
	);
}

function printSourceCoverage(evidence: Awaited<ReturnType<typeof buildIterationEvidence>>) {
	console.log(color("\nCutoff Source Coverage", "bold"));
	console.log(
		`  ${color(pad("component", 24), "gray")} ${color(pad("workbook", 16), "gray")} ${color(
			pad("source", 16),
			"gray",
		)} ${color(pad("gap", 16), "gray")} source file`,
	);
	for (const row of evidence.sourceEvidence.sourceCoverage) {
		const tone = Math.abs(row.difference) <= tolerance ? "green" : "yellow";
		console.log(
			`  ${pad(row.component, 24)} ${pad(formatMoney(row.workbookTotal), 16)} ${pad(
				formatMoney(row.sourceTotal),
				16,
			)} ${pad(signed(row.difference), 16)} ${color(row.source, tone)}`,
		);
	}
}

function printMismatchSummary(evidence: Awaited<ReturnType<typeof buildIterationEvidence>>) {
	const failed = evidence.samples.filter((sample) => !sample.matched);
	if (!failed.length) {
		console.log(color("\nPayroll Tally Stop Check: all sampled employees match.", "green"));
		return;
	}
	console.log(color("\nPayroll Tally Stop Check: remaining mismatches", "red"));
	for (const sample of failed) {
		const mismatches = sample.componentChecks
			.filter((check) => stopFields.includes(check.field) && !check.matched)
			.map((check) => `${check.field} ${signed(check.difference)} (${check.category})`)
			.slice(0, 8);
		console.log(
			`  ${color(sample.employeeId, "bold")} ${sample.employeeName}: ${mismatches.join(" | ") || "report column mismatch only"}`,
		);
	}
}

function checkByField(sample: SampleEvidence, field: string) {
	return sample.componentChecks.find((check) => check.field === field);
}

function printSourceBreakdowns(sample: SampleEvidence) {
	const fields = ["allowances", "grossIncludedAllowances", "receivableOnlyAllowances", "loanDeductions", "uniformDeduction"];
	for (const field of fields) {
		const check = checkByField(sample, field);
		const breakdown = check?.sourceBreakdown?.filter((entry) => entry.value);
		if (!breakdown?.length) continue;
		const text = breakdown
			.map((entry) => `${entry.label} ${formatMoney(entry.value)}${entry.sourceCell ? ` ${entry.sourceCell}` : ""}`)
			.join(" | ");
		console.log(`  ${color(field, "blue")} ${text}`);
	}
}

function printHrEmployeeResult(sample: SampleEvidence) {
	const result = sample.hrResult;
	const source = result.sourceSummary;
	console.log(color("  HR employee result", "bold"));
	console.log(
		`  ${color("employee", "cyan")} ${result.employee.id} ${result.employee.name} | ${result.employee.department || "-"} / ${result.employee.section || "-"} / ${result.employee.position || "-"} | schedule ${result.employee.scheduleCode || "-"}`,
	);
	console.log(
		`  ${color("period", "cyan")} ${result.cutoff} | pay date ${result.payDate} | ${color(result.status, result.status === "PAID" || result.status === "GENERATED_UNPAID" ? "green" : "yellow")}`,
	);
	console.log(
		`  ${color("earnings", "cyan")} basic ${formatMoney(result.earnings.basicSalary)} | OT/rest/holiday ${formatMoney(
			result.earnings.overtimePay +
				result.earnings.restDayPay +
				result.earnings.restDayOtPay +
				result.earnings.specialHolidayPay +
				result.earnings.legalHolidayPay,
		)} | ND ${formatMoney(result.earnings.nightDiffPay)} | allowances ${formatMoney(
			result.earnings.grossIncludedAllowances,
		)} | gross ${formatMoney(result.earnings.grossPay)}`,
	);
	console.log(
		`  ${color("deductions", "cyan")} tax ${formatMoney(result.deductions.withholdingTax)} | SSS ${formatMoney(
			result.deductions.sssContribution,
		)} | PHIC ${formatMoney(result.deductions.philHealthContribution)} | HDMF ${formatMoney(
			result.deductions.pagibigContribution,
		)} | loan/calamity ${formatMoney(result.deductions.loanDeductions)} | uniform ${formatMoney(
			result.deductions.uniformDeduction,
		)} | total ${formatMoney(result.deductions.totalDeductions)}`,
	);
	console.log(
		`  ${color("take-home", "cyan")} net ${formatMoney(result.net.netPay)} | receivable-only ${formatMoney(
			result.net.receivableOnlyAllowances,
		)} | post-net adj ${formatMoney(result.net.postNetReceivableAdjustments)} | total receivable ${formatMoney(
			result.net.totalReceivable,
		)}`,
	);
	console.log(
		`  ${color("source", "cyan")} timesheet ${source.timesheetBacked ? "yes" : "no"} | allowance upload ${source.allowanceUploadBacked ? "yes" : "no"} | deduction/loan upload ${source.deductionUploadBacked ? "yes" : "no"} | generated payroll ${source.generatedPayrollFound ? "yes" : "no"}`,
	);
}

function printPayrollComputationColumnTally(sample: SampleEvidence) {
	console.log(color("  Payroll computation column tally", "bold"));
	console.log(
		`  ${color(pad("col", 4), "gray")} ${color(pad("client workbook column", 30), "gray")} ${color(
			pad("old workbook", 16),
			"gray",
		)} ${color(pad("HRIS/source", 16), "gray")} ${color(pad("gap", 16), "gray")} source`,
	);
	for (const row of sample.payrollComputationColumns) {
		if (!shouldShowPayrollComputationColumn(row)) continue;
		const matched = row.difference === null || Math.abs(row.difference) <= tolerance;
		const tone = matched ? "green" : "red";
		console.log(
			`  ${pad(row.column, 4)} ${pad(row.label, 30)} ${pad(
				formatReportValue(row.workbookValue, row.column),
				16,
			)} ${pad(formatReportValue(row.hrisValue, row.column), 16)} ${pad(
				formatReportDifference(row.difference, row.column),
				16,
			)} ${color(row.source, tone as any)}`,
		);
	}
}

function printWorkbookColumnTable(sample: SampleEvidence) {
	const rows = [
		["J", "Basic Salary", "basicSalary"],
		["N", "Reg OT", "overtimePay"],
		["P", "RD Hrs Pay", "restDayPay"],
		["R", "RD OT Pay", "restDayOtPay"],
		["T", "Spc Hol OT", "specialHolidayPay"],
		["AB", "Leg Hol OT", "legalHolidayPay"],
		["AG", "Night Diff", "nightDiffPay"],
		["AH", "Leave", "leavePay"],
		["BH", "GrossPay", "grossPay"],
		["BI", "W/Tax", "withholdingTax"],
		["BK", "SSS Cont", "sssContribution"],
		["BL", "PhilHealth", "philHealthContribution"],
		["BM", "Pag-IBIG", "pagibigContribution"],
		["CK", "TOTAL DEDN", "totalDeductions"],
		["CL", "NetPay", "netPay"],
		["CW", "TotalReceivable", "totalReceivable"],
	];
	console.log(
		`  ${color(pad("col", 4), "gray")} ${color(pad("workbook col", 16), "gray")} ${color(
			pad("workbook", 16),
			"gray",
		)} ${color(pad("generated", 16), "gray")} ${color(pad("diff", 16), "gray")} status`,
	);
	for (const [col, label, field] of rows) {
		const check = checkByField(sample, field);
		if (!check) continue;
		const tone = check.matched ? "green" : check.category === "SOURCE_MISSING_APPROVED_OT" ? "yellow" : "red";
		console.log(
			`  ${pad(col, 4)} ${pad(label, 16)} ${pad(formatMoney(check.workbookValue), 16)} ${pad(
				formatMoney(check.hrisValue),
				16,
			)} ${pad(signed(check.difference), 16)} ${color(check.matched ? "MATCH" : check.category, tone as any)}`,
		);
	}
}

function printSampleCli(sample: SampleEvidence) {
	const status = sample.matched ? color("MATCH", "green") : color("FAIL", "red");
	console.log(
		`\n${color(sample.employeeId, "bold")} ${pad(sample.employeeName, 32)} ${status} ${color(
			String(sample.workbook.division || ""),
			"gray",
		)}`,
	);
	console.log(
		`  ${color("rate", "cyan")} (${formatMoney(sample.rate.monthlyRate)} x 12) / 313 = ${color(
			formatMoney(sample.rate.dailyRate313),
			"yellow",
		)} daily | hourly ${formatMoney(sample.rate.hourlyRate313)}`,
	);
	console.log(
		`  ${color("tax", "cyan")} workbook ${formatMoney(sample.tax.workbookWithholdingTax)} | gross taxable tax ${formatMoney(
			sample.tax.taxIfGrossPayFullyTaxable,
		)} | implied taxable ${formatMoney(sample.tax.impliedTaxableIncomeFromWorkbookTax)} | excluded ${formatMoney(
			sample.tax.impliedTaxExcludedFromGross,
		)}`,
	);
	console.log(
		`  ${color("statutory", "cyan")} basis ${formatMoney(
			sample.tax.configuredContributionMonthlyBasis,
		)} | SSS ${formatMoney(sample.tax.configuredMonthlySss)} @ MSC ${formatMoney(
			sample.tax.sssMsc,
		)} | PHIC ${formatMoney(sample.tax.configuredMonthlyPhilHealth)} @ base ${formatMoney(
			sample.tax.philHealthBase,
		)} | HDMF ${formatMoney(sample.tax.configuredMonthlyPagIbig)} @ base ${formatMoney(
			sample.tax.pagIbigBase,
		)}`,
	);
	if (sample.approvedBucketPay) {
		console.log(
			`  ${color("OT", "cyan")} ${sample.approvedBucketPay.formula} daily ${formatMoney(
				sample.approvedBucketPay.dailyRate,
			)} | regOT ${formatMoney(sample.approvedBucketPay.overtimePay)} | rest/holiday ${formatMoney(
				sample.approvedBucketPay.premiumHolidayRestPay,
			)}`,
		);
	} else {
		console.log(`  ${color("OT", "cyan")} ${color("no approved-bucket evidence on effective lines", "yellow")}`);
	}
	printHrEmployeeResult(sample);
	printPayrollComputationColumnTally(sample);
	printWorkbookColumnTable(sample);
	printSourceBreakdowns(sample);
	console.log(`  ${color("next", "magenta")} ${sample.nextActions.join(" ")}`);
}

function printIterationCli(evidence: Awaited<ReturnType<typeof buildIterationEvidence>>) {
	const matched = evidence.samples.filter((sample) => sample.matched).length;
	console.log(color("\nBandai Payroll Agent Loop", "bold"));
	console.log(
		`${color("iteration", "cyan")} ${evidence.metadata.iteration} | ${color(
			"matched",
			matched === evidence.samples.length ? "green" : "yellow",
		)} ${matched}/${evidence.samples.length} | ${color("db", "gray")} ${evidence.metadata.dbName || "(unknown)"}`,
	);
	printSourceCoverage(evidence);
	printMismatchSummary(evidence);
	printPayrollRegisterReport(evidence);
	for (const sample of evidence.samples) printSampleCli(sample);
}

function writeMarkdown(filePath: string, evidence: Awaited<ReturnType<typeof buildIterationEvidence>>) {
	const lines: string[] = [];
	lines.push("# BNPI GA/HR Payroll Loop Evidence", "");
	lines.push(`Generated: ${evidence.metadata.generatedAt}`);
	lines.push(`Cutoff: ${evidence.metadata.cutoff?.startDate} to ${evidence.metadata.cutoff?.endDate}`);
	lines.push(`DB: ${evidence.metadata.dbName || "(unknown)"}`);
	lines.push(`Samples matched: ${evidence.samples.filter((sample) => sample.matched).length}/${evidence.samples.length}`);
	lines.push(`Stop condition: ${evidence.metadata.stopCondition}`);
	lines.push(`Stop fields: ${(evidence.metadata.stopFields || []).join(", ")}`);
	lines.push(
		`Workbook payroll columns shown: ${
			evidence.metadata.allPayrollColumns ? "all client workbook columns A:CX" : "key, non-zero, and text columns"
		}`,
	);
	lines.push("");
	lines.push("## Formula", "");
	lines.push("- Direct monthly-rate basis: `Daily Rate = (Monthly Rate x 12) / 313`");
	lines.push("- BNPI proof period stores semi-monthly `Employee.basicSalary`, so monthly rate is `periodBasic x 2` when no separate monthly source is used.");
	lines.push("- Approved OT/rest/holiday proof comes from effective `Timesheetline.metadata.bandaiPayrollSourceRepair.approvedBuckets`.");
	lines.push("- Allowance formula: `employee allowance = uploaded amount for employee/code/cutoff` from the matching Compensation Mass Upload or per-cutoff reference workbook.");
	lines.push("- Loan/deduction formula: `employee loan deduction = uploaded payment/amortization for employee/loan code/cutoff`; calamity loans are not derived from salary in payroll generation.");
	lines.push(`- SSS: ${BANDAI_PAYROLL_FORMULA_CONFIG.contributions.sss.formula}`);
	lines.push(`- PhilHealth: ${BANDAI_PAYROLL_FORMULA_CONFIG.contributions.philHealth.formula}`);
	lines.push(`- Pag-IBIG: ${BANDAI_PAYROLL_FORMULA_CONFIG.contributions.pagIbig.formula}`);
	lines.push("");
	lines.push("## Cutoff Source Coverage", "");
	lines.push("| Component | Workbook total | Source total | Gap | Source | Note |");
	lines.push("| --- | ---: | ---: | ---: | --- | --- |");
	for (const row of evidence.sourceEvidence.sourceCoverage) {
		lines.push(
			`| ${row.component} | ${formatMoney(row.workbookTotal)} | ${formatMoney(row.sourceTotal)} | ${formatMoney(row.difference)} | ${row.source} | ${row.note} |`,
		);
	}
	lines.push("");

	for (const sample of evidence.samples) {
		lines.push(`## ${sample.employeeId} ${sample.employeeName}`, "");
		lines.push(`Workbook: ${sample.workbook.department} / ${sample.workbook.division}, row ${sample.workbook.row}`);
		lines.push(`DB: ${sample.db.department || "-"} / ${sample.db.section || "-"} / ${sample.db.position || "-"}`);
		lines.push(`Timesheet: ${sample.db.timesheetStatus || "missing"} (${sample.db.effectiveLineCount} effective lines, ${sample.db.approvedBucketLineCount} approved-bucket lines)`);
		lines.push(`Next action: ${sample.nextActions.join(" ")}`);
		lines.push("");
		lines.push("### HR Employee Result", "");
		lines.push(`- Employee: ${sample.hrResult.employee.id} ${sample.hrResult.employee.name}`);
		lines.push(`- Assignment: ${sample.hrResult.employee.department || "-"} / ${sample.hrResult.employee.section || "-"} / ${sample.hrResult.employee.position || "-"}; schedule ${sample.hrResult.employee.scheduleCode || "-"}`);
		lines.push(`- Cutoff/pay date: ${sample.hrResult.cutoff}; ${sample.hrResult.payDate}`);
		lines.push(`- Payroll status: ${sample.hrResult.status}`);
		lines.push(`- Earnings: basic ${formatMoney(sample.hrResult.earnings.basicSalary)}, OT/rest/holiday ${formatMoney(sample.hrResult.earnings.overtimePay + sample.hrResult.earnings.restDayPay + sample.hrResult.earnings.restDayOtPay + sample.hrResult.earnings.specialHolidayPay + sample.hrResult.earnings.legalHolidayPay)}, night diff ${formatMoney(sample.hrResult.earnings.nightDiffPay)}, gross-included allowances ${formatMoney(sample.hrResult.earnings.grossIncludedAllowances)}, gross ${formatMoney(sample.hrResult.earnings.grossPay)}`);
		lines.push(`- Deductions: tax ${formatMoney(sample.hrResult.deductions.withholdingTax)}, SSS ${formatMoney(sample.hrResult.deductions.sssContribution)}, PhilHealth ${formatMoney(sample.hrResult.deductions.philHealthContribution)}, Pag-IBIG ${formatMoney(sample.hrResult.deductions.pagibigContribution)}, loan/calamity ${formatMoney(sample.hrResult.deductions.loanDeductions)}, uniform ${formatMoney(sample.hrResult.deductions.uniformDeduction)}, total ${formatMoney(sample.hrResult.deductions.totalDeductions)}`);
		lines.push(`- Take-home: net ${formatMoney(sample.hrResult.net.netPay)}, receivable-only ${formatMoney(sample.hrResult.net.receivableOnlyAllowances)}, post-net adjustments ${formatMoney(sample.hrResult.net.postNetReceivableAdjustments)}, total receivable ${formatMoney(sample.hrResult.net.totalReceivable)}`);
		lines.push(`- Source flags: timesheet=${sample.hrResult.sourceSummary.timesheetBacked ? "yes" : "no"}, allowanceUpload=${sample.hrResult.sourceSummary.allowanceUploadBacked ? "yes" : "no"}, deductionLoanUpload=${sample.hrResult.sourceSummary.deductionUploadBacked ? "yes" : "no"}, generatedPayroll=${sample.hrResult.sourceSummary.generatedPayrollFound ? "yes" : "no"}`);
		lines.push("");
		lines.push("### Payroll Computation Column Tally", "");
		lines.push("| Col | Client workbook column | Old workbook | HRIS/source | Gap | HRIS source |");
		lines.push("| --- | --- | ---: | ---: | ---: | --- |");
		for (const column of sample.payrollComputationColumns) {
			if (!shouldShowPayrollComputationColumn(column)) continue;
			lines.push(
				`| ${column.column} | ${column.label} | ${formatReportValue(column.workbookValue, column.column)} | ${formatReportValue(column.hrisValue, column.column)} | ${formatReportDifference(column.difference, column.column)} | ${column.source} |`,
			);
		}
		lines.push("");
		lines.push("### Daily Rate", "");
		lines.push(`- Monthly rate: ${formatMoney(sample.rate.monthlyRate)}`);
		lines.push(`- Formula: (${formatMoney(sample.rate.monthlyRate)} x 12) / 313 = ${formatMoney(sample.rate.dailyRate313)}`);
		lines.push(`- Hourly rate: ${formatMoney(sample.rate.dailyRate313)} / 8 = ${formatMoney(sample.rate.hourlyRate313)}`);
		lines.push(`- Workbook Daily Salary column: ${formatMoney(sample.rate.workbookDailySalary)}`);
		lines.push(`- Workbook Basic Salary / period basic: ${formatMoney(sample.workbook.basicSalary)}; DB Employee.basicSalary: ${formatMoney(sample.db.basicSalary)}`);
		lines.push("");
		lines.push("### Withholding Tax", "");
		lines.push(`- Table: ${sample.tax.table}`);
		lines.push(`- Workbook W/Tax: ${formatMoney(sample.tax.workbookWithholdingTax)}`);
		lines.push(`- If GrossPay is fully taxable: ${formatMoney(sample.tax.taxIfGrossPayFullyTaxable)}`);
		lines.push(`- Implied taxable income from workbook W/Tax: ${formatMoney(sample.tax.impliedTaxableIncomeFromWorkbookTax)}`);
		lines.push(`- Implied non-tax/excluded amount from GrossPay: ${formatMoney(sample.tax.impliedTaxExcludedFromGross)}`);
		lines.push(`- Configured monthly SSS employee share: ${formatMoney(sample.tax.configuredMonthlySss)} from MSC ${formatMoney(sample.tax.sssMsc)}`);
		lines.push(`- Configured monthly PhilHealth employee share: ${formatMoney(sample.tax.configuredMonthlyPhilHealth)} from base ${formatMoney(sample.tax.philHealthBase)}`);
		lines.push(`- Configured monthly Pag-IBIG employee share: ${formatMoney(sample.tax.configuredMonthlyPagIbig)} from base ${formatMoney(sample.tax.pagIbigBase)}`);
		lines.push("");
		if (sample.approvedBucketPay) {
			lines.push("### Approved OT / Rest / Holiday Buckets", "");
			lines.push(`- Formula source: ${sample.approvedBucketPay.formula}`);
			lines.push(`- Approved-bucket daily rate: ${formatMoney(sample.approvedBucketPay.dailyRate)}`);
			lines.push(`- Regular OT: ${formatMoney(sample.approvedBucketPay.overtimePay)}`);
			lines.push(`- Rest day pay: ${formatMoney(sample.approvedBucketPay.restDayPay)}`);
			lines.push(`- Rest day OT pay: ${formatMoney(sample.approvedBucketPay.restDayOtPay)}`);
			lines.push(`- Special holiday pay: ${formatMoney(sample.approvedBucketPay.specialHolidayPay)}`);
			lines.push(`- Legal holiday pay: ${formatMoney(sample.approvedBucketPay.legalHolidayPay)}`);
			lines.push(`- Night diff pay: ${formatMoney(sample.approvedBucketPay.nightDiffPay)}`);
			lines.push("");
		}
		lines.push("### Component Checks", "");
		lines.push("| Field | Workbook | HRIS | Diff | Status |");
		lines.push("| --- | ---: | ---: | ---: | --- |");
		for (const check of sample.componentChecks.filter((entry) => !entry.matched || numberValue(entry.workbookValue) || numberValue(entry.hrisValue))) {
			lines.push(
				`| ${check.field} | ${formatMoney(check.workbookValue)} | ${formatMoney(check.hrisValue)} | ${formatMoney(check.difference)} | ${check.matched ? "MATCH" : check.category} |`,
			);
		}
		lines.push("");
		lines.push("### Source Breakdown", "");
		for (const check of sample.componentChecks.filter((entry) => entry.sourceBreakdown?.length)) {
			lines.push(`- ${check.field}:`);
			for (const source of check.sourceBreakdown || []) {
				if (!source.value) continue;
				lines.push(
					`  - ${source.label}: ${formatMoney(source.value)}${source.sourceCell ? ` (${source.sourceCell})` : ""}`,
				);
			}
		}
		lines.push("");
		lines.push("### Daily Evidence", "");
		lines.push("| Date | Status | Reg Hrs | OT Hrs | Late | Approved Buckets | Day Pay |");
		lines.push("| --- | --- | ---: | ---: | ---: | --- | --- |");
		for (const line of sample.lines) {
			const bucketText = Object.entries(line.approvedBuckets)
				.filter(([, value]) => value)
				.map(([key, value]) => `${key}=${value}`)
				.join(", ");
			const payText = line.dayPay
				? Object.entries(line.dayPay)
						.filter(([, value]) => value)
						.map(([key, value]) => `${key}=${formatMoney(value)}`)
						.join(", ")
				: "";
			lines.push(
				`| ${line.date} | ${line.status} | ${line.regularHours} | ${line.overtimeHours} | ${line.lateHours} | ${bucketText || "-"} | ${payText || "-"} |`,
			);
		}
		lines.push("");
	}
	fs.writeFileSync(filePath, lines.join("\n"));
}

const prisma = new PrismaClient();

async function main() {
	fs.mkdirSync(outputDir, { recursive: true });
	let finalEvidence: Awaited<ReturnType<typeof buildIterationEvidence>> | null = null;
	printFormulaConfig();
	for (let iteration = 1; iteration <= maxIterations; iteration++) {
		const evidence = await buildIterationEvidence(iteration);
		finalEvidence = evidence;
		const jsonPath = path.join(outputDir, `ga-hr-payroll-loop-iteration-${iteration}.json`);
		const mdPath = path.join(outputDir, `ga-hr-payroll-loop-iteration-${iteration}.md`);
		const pdfPath = path.join(outputDir, `ga-hr-payroll-loop-iteration-${iteration}.pdf`);
		const xlsxPath = path.join(outputDir, `ga-hr-payroll-loop-iteration-${iteration}.xlsx`);
		writeJson(jsonPath, evidence);
		writeMarkdown(mdPath, evidence);
		await writePdfReport(pdfPath, evidence);
		await writeXlsxReport(xlsxPath, evidence);
		const matched = evidence.samples.filter((sample) => sample.matched).length;
		printIterationCli(evidence);
		console.log(
			JSON.stringify(
				{
					iteration,
					matched: `${matched}/${evidence.samples.length}`,
					allMatched: evidence.allMatched,
					cutoff: evidence.metadata.cutoff,
					payrollPeriod: evidence.metadata.payrollPeriod,
					artifacts: [jsonPath, mdPath, pdfPath, xlsxPath],
				},
				null,
				2,
			),
		);
		if (evidence.allMatched) break;
		if (iteration < maxIterations) await sleep(intervalMs);
	}
	if (!finalEvidence?.allMatched) process.exitCode = 1;
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.stack || error.message : error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
