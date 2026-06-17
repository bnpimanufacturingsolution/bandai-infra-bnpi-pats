import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma";
import { previewPayrollFromTimesheets } from "./payroll-period.helper";
import {
	calculateTotalContributions,
	calculateWithholdingTax,
	roundToCentavo,
} from "./tax-calculator.helper";

const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

export type PayrollComparisonCategory =
	| "MATCH"
	| "TOLERANCE_MATCH"
	| "EMPLOYEE_NOT_FOUND"
	| "CUTOFF_MISMATCH"
	| "TIMESHEET_NOT_FOUND"
	| "TIMESHEET_NOT_APPROVED"
	| "SOURCE_MISSING_APPROVED_OT"
	| "SOURCE_MISSING_MANUAL_ADJUSTMENT"
	| "SOURCE_MISSING_ALLOWANCE"
	| "SOURCE_MISSING_DEDUCTION_OR_LOAN"
	| "SOURCE_MISSING_STATUTORY_CONFIG"
	| "PAYROLL_FORMULA_UNSUPPORTED"
	| "HRIS_LOGIC_MISMATCH_REPAIRABLE"
	| "PAID_OR_LOCKED_SKIP";

export type BandaiWorkbookRow = {
	sheetName: string;
	rowNumber: number;
	employeeCode: string;
	employeeName: string;
	values: Record<string, number | string | null>;
	cells: Record<string, string>;
	formulas: Record<string, string>;
};

export type BandaiWorkbookAnalysis = {
	workbookPath: string;
	unlockedWorkbookPath?: string;
	unlock: {
		attempted: boolean;
		succeeded: boolean;
		method: string;
		message?: string;
	};
	sheets: Array<{
		name: string;
		hidden: boolean;
		ref?: string;
		merges: string[];
		detectedHeaderRows: Array<{
			rowNumber: number;
			score: number;
			headers: string[];
		}>;
		formulaColumns: Array<{ header: string; column: string; formulaCount: number }>;
		valueColumns: Array<{ header: string; column: string; nonBlankCount: number }>;
	}>;
	detectedCutoff?: {
		startDate: string;
		endDate: string;
		payDate?: string;
		sourceSheet: string;
		sourceCell: string;
		rawText: string;
	};
	payrollFieldMap: Record<string, string | null>;
	rows: BandaiWorkbookRow[];
	candidateSourceFiles: string[];
};

export type BandaiPayrollSourceEvidence = {
	metadata: {
		workbookPath: string;
		detectedCutoff?: BandaiWorkbookAnalysis["detectedCutoff"];
		referenceWorkbookPath?: string;
		compensationUploadPath?: string;
		deductionUploadPath?: string;
		overtimeWorkbookPath?: string;
	};
	payrollWorkbookTotals: {
		rows: number;
		employees: number;
		components: Record<string, { total: number; rows: number }>;
	};
	referenceWorkbook?: SourceWorkbookSummary;
	compensationUpload?: SourceWorkbookSummary;
	deductionUpload?: SourceWorkbookSummary;
	overtimeDetails?: OvertimeDetailsSummary;
	sourceCoverage: Array<{
		component: string;
		workbookTotal: number;
		sourceTotal: number;
		difference: number;
		source: string;
		note: string;
	}>;
};

export type SourceWorkbookSummary = {
	filePath: string;
	sheets: Array<{
		name: string;
		rows: number;
		amountColumns: string[];
		byAmountColumn: Record<string, { rows: number; total: number }>;
		byCodeOrDetail: Record<string, { rows: number; total: number }>;
		sampleRows: Array<Record<string, string | number>>;
	}>;
	totalRows: number;
	totalAmount: number;
	employeeCount: number;
	byEmployee: Record<string, { name?: string; total: number; rows: number; sources: Record<string, number> }>;
};

export type OvertimeDetailsSummary = {
	filePath: string;
	sheetName: string;
	dateRange?: { startDate: string; endDate: string };
	rowsInCutoff: number;
	employeeCount: number;
	totals: Record<string, number>;
	byEmployee: Record<string, {
		name: string;
		department?: string;
		rows: number;
		regOtHrs: number;
		regNdHrs: number;
		spclHrs: number;
		spclOtHrs: number;
		rholHrs: number;
		rholOtHrs: number;
		rdHrs: number;
		rdOtHrs: number;
	}>;
};

export type PayrollComparisonResult = {
	metadata: {
		workbookPath: string;
		unlockedWorkbookPath?: string;
		dbUrl: string;
		dbName: string | null;
		organizationId?: string;
		payrollPeriod?: {
			id: string;
			code?: string | null;
			name: string;
			startDate: string;
			endDate: string;
			status: string;
		} | null;
		detectedCutoff?: BandaiWorkbookAnalysis["detectedCutoff"];
		dryRunOnly: boolean;
		runPayrollReuse: {
			usedExistingPreviewHelper: boolean;
			helper: string;
			blocker?: string;
		};
	};
	summary: {
		workbookRows: number;
		employeesMatched: number;
		approvedTimesheetsFound: number;
		exactMatches: number;
		toleranceMatches: number;
		mismatches: number;
		skippedRows: number;
		byCategory: Record<string, number>;
	};
	rows: Array<{
		employeeCode: string;
		employeeName: string;
		rowNumber: number;
		sheetName: string;
		employeeMatch: boolean;
		timesheetStatus?: string | null;
		previewFound: boolean;
		overallCategory: PayrollComparisonCategory;
		fields: PayrollFieldComparison[];
		timesheetAggregate?: Record<string, number | string | null>;
		rateAnalysis?: PayrollRateAnalysis;
		recommendation: string;
	}>;
	candidateSourceFiles: string[];
};

export type PayrollRateAnalysis = {
	formulaSource: string;
	basicSalary: number;
	workbookWorkDays: number;
	hrisWorkDays: number;
	workbookDailyRate: number;
	hrisDailyRate: number;
	bnpi313DailyRateFromPeriodBasic: number;
	bnpi313MonthlyRateFromWorkbookDaily: number;
	workbookDailyRateMatchesBnpi313: boolean;
	hrisHourlyRate: number;
	hrisMinuteRate: number;
	workbookAbsentDaysImplied: number;
	hrisAbsentDays: number;
	workbookLateMinutesImplied: number;
	hrisLateMinutes: number;
	workbookGrossFormula: number;
	hrisGrossFormula: number;
	grossFormulaDelta: number;
	grossResidualAfterComparedComponents: number;
};

export type PayrollFieldComparison = {
	field: string;
	category: PayrollComparisonCategory;
	workbookValue: number | string | null;
	hrisValue: number | string | null;
	difference?: number;
	sourceCell?: string;
	sourceColumn?: string;
	sourceBreakdown?: Array<{
		label: string;
		value: number;
		sourceCell?: string;
		formula?: string;
	}>;
	hrisSource: string;
	likelyReason: string;
	repairRecommendation: string;
};

const DEFAULT_WORKBOOK_PATH = path.resolve(
	__dirname,
	"..",
	"..",
	"docs",
	"Bandai Payroll",
	"PAYROLL 2024-2026",
	"PAYROLL 2026",
	"HRIS Payroll Computation April 26 - May 10, 2026.xlsx",
);

const PAYROLL_FIELD_ALIASES: Record<string, string[]> = {
	employeeId: ["emp no", "emp. no.", "employee id", "employee no"],
	employeeName: ["employee name", "name"],
	basicSalary: ["basic salary"],
	monthlySalary: ["monthly salary"],
	days: ["no. of days", "no of days", "days"],
	absentAmount: ["absent-amt", "absent amt", "absent amount"],
	lateUndertimeAmount: ["ut/late-amt", "ut late amt", "late", "undertime"],
	overtimeHours: ["no. of reg ot hrs", "reg ot hrs"],
	overtimePay: ["reg ot"],
	restDayPay: ["rd hrs pay"],
	restDayOtPay: ["rd ot pay"],
	specialHolidayPay: [
		"spc hol ot",
		"sun/spc hol ot exc",
		"spc rd ot",
		"spc rd exc ot",
	],
	legalHolidayPay: ["leg hol ot", "leg hol rd", "leg hol rd ot"],
	nightDiffPay: ["night differential"],
	leavePay: ["leave"],
	restDayHours: ["rd hrs"],
	restDayPayLegacy: ["rd hrs pay", "rd ot pay", "rd ot"],
	holidayPay: [
		"spc hol ot",
		"spc hol ot hrs",
		"leg hol ot",
		"leg hol rd",
		"adjustment holiday pay",
	],
	allowances: [
		"hys meal allowance",
		"ob allowance",
		"overtime meal allownce",
		"de minimis allowance",
		"other compensation",
		"adjustment ot/nd",
		"meal allowance",
		"line leader allowance",
		"perfect attendance",
	],
	grossIncludedAllowances: [
		"hys meal allowance",
		"ob allowance",
		"overtime meal allownce",
		"de minimis allowance",
		"other compensation",
		"adjustment ot/nd",
	],
	receivableOnlyAllowances: [
		"ot meal allowance",
		"perfect attendance",
		"meal allowance",
		"line leader allowance",
	],
	postNetReceivableAdjustments: [
		"adjustment holiday pay",
		"1k christmas gift",
		"tax refund",
		"13th month",
		"acl/vl conversion",
	],
	grossPay: ["grosspay", "gross pay"],
	withholdingTax: ["w/tax", "withholding tax"],
	sssContribution: ["sss cont", "sss contribution"],
	philHealthContribution: ["philhealth", "phic", "philhealth contribution"],
	pagibigContribution: ["pagibig", "hdmf", "pag-ibig"],
	loanDeductions: [
		"sss emergency loan",
		"bnpi emergency loan",
		"bnpi salary loan",
		"rcbc loan",
		"hdmf calamity loan",
		"hdmf salary loan",
		"sss calamity loan",
		"sss salary loan",
		"sss loan restructuring program",
	],
	uniformDeduction: ["uniform deduction"],
	deductionBenefits: ["modified hdmf 2"],
	totalDeductions: ["total dedn", "total deductions"],
	netPay: ["netpay", "net pay"],
	manualAdjustments: [
		"other adjustment",
		"adjustment basic",
		"adjustment ot/nd",
		"adjustment non-tax",
		"excess deduction",
		"negative adjustment",
	],
	totalReceivable: ["totalreceivable", "total receivable"],
};

const moneyTolerance = 0.05;
const hourTolerance = 0.01;

function normalizeHeader(value: unknown): string {
	return String(value ?? "")
		.replace(/\r?\n/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

function safeDateKey(value: Date | string): string {
	if (typeof value === "string") {
		const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
		if (match) {
			const month = Number(match[1]);
			const day = Number(match[2]);
			const year = Number(match[3]);
			return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
		}
	}
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toISOString().slice(0, 10);
}

function dateCellToKey(value: unknown): string | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return safeDateKey(value);
	const text = String(value ?? "").trim();
	if (!text) return null;
	const parsed = new Date(text);
	return Number.isNaN(parsed.getTime()) ? null : safeDateKey(parsed);
}

function parseNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	const text = String(value ?? "")
		.replace(/PHP/gi, "")
		.replace(/[,\s]/g, "")
		.replace(/[()]/g, (char) => (char === "(" ? "-" : ""))
		.replace(/-$/g, "");
	if (!text || text === "-" || text === "." || /^-+$/.test(text)) return 0;
	const parsed = Number(text);
	return Number.isFinite(parsed) ? parsed : null;
}

function toCellAddress(rowIndex: number, columnIndex: number): string {
	return XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
}

function columnName(columnIndex: number): string {
	return XLSX.utils.encode_col(columnIndex);
}

function findMatchingHeader(headers: string[], aliases: string[]): string | null {
	for (const alias of aliases) {
		const normalizedAlias = normalizeHeader(alias);
		const direct = headers.find((header) => normalizeHeader(header) === normalizedAlias);
		if (direct) return direct;
		const contains = headers.find((header) => normalizeHeader(header).includes(normalizedAlias));
		if (contains) return contains;
	}
	return null;
}

function findDetectedCutoff(workbook: XLSX.WorkBook): BandaiWorkbookAnalysis["detectedCutoff"] {
	for (const sheetName of workbook.SheetNames) {
		const sheet = workbook.Sheets[sheetName];
		if (!sheet) continue;
		const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
		for (let row = range.s.r; row <= Math.min(range.e.r, 20); row++) {
			for (let col = range.s.c; col <= Math.min(range.e.c, 10); col++) {
				const address = toCellAddress(row, col);
				const raw = sheet[address]?.w || sheet[address]?.v;
				const text = String(raw ?? "");
				const match = text.match(
					/Payroll Period:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})\s*to\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})(?:\s+Pay Date:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4}))?/i,
				);
				if (!match) continue;
				return {
					startDate: safeDateKey(match[1]),
					endDate: safeDateKey(match[2]),
					payDate: match[3] ? safeDateKey(match[3]) : undefined,
					sourceSheet: sheetName,
					sourceCell: address,
					rawText: text.trim(),
				};
			}
		}
	}
	return undefined;
}

function detectHeaderRows(rows: unknown[][]) {
	return rows
		.map((row, index) => {
			const normalized = row.map(normalizeHeader);
			const score = [
				"emp. no.",
				"emp no",
				"employee name",
				"basic salary",
				"grosspay",
				"netpay",
			].filter((token) => normalized.includes(token)).length;
			return {
				rowNumber: index + 1,
				score,
				headers: row.map((cell) => String(cell ?? "").trim()),
			};
		})
		.filter((candidate) => candidate.score >= 2)
		.sort((a, b) => b.score - a.score);
}

export function ensureUnlockedWorkbook(params: {
	workbookPath?: string;
	password?: string;
	outputDir: string;
}): BandaiWorkbookAnalysis["unlock"] & { workbookPath: string } {
	const workbookPath = path.resolve(params.workbookPath || DEFAULT_WORKBOOK_PATH);
	fs.mkdirSync(params.outputDir, { recursive: true });

	try {
		XLSX.readFile(workbookPath, { cellDates: true, raw: false });
		return {
			workbookPath,
			attempted: false,
			succeeded: true,
			method: "xlsx-direct",
			message: "Workbook was readable without COM unlock.",
		};
	} catch (error) {
		if (process.platform !== "win32") {
			return {
				workbookPath,
				attempted: true,
				succeeded: false,
				method: "xlsx-direct",
				message: error instanceof Error ? error.message : String(error),
			};
		}
	}

	const unlockedPath = path.join(
		params.outputDir,
		`${path.basename(workbookPath, path.extname(workbookPath))}.${Date.now()}.unlocked.xlsx`,
	);
	const psPath = path.join(
		os.tmpdir(),
		`bandai-payroll-unlock-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`,
	);
	const script = `
$ErrorActionPreference = "Stop"
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $workbook = $excel.Workbooks.Open($env:BANDAI_PAYROLL_WORKBOOK, 0, $true, 5, $env:BANDAI_PAYROLL_PASSWORD)
  if (Test-Path -LiteralPath $env:BANDAI_PAYROLL_UNLOCKED) {
    Remove-Item -LiteralPath $env:BANDAI_PAYROLL_UNLOCKED -Force
  }
  $workbook.SaveAs($env:BANDAI_PAYROLL_UNLOCKED, 51, "", "")
  $workbook.Close($false)
} finally {
  if ($workbook) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) | Out-Null }
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
`;
	fs.writeFileSync(psPath, script, "utf8");

	try {
		execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psPath], {
			stdio: "pipe",
			env: {
				...process.env,
				BANDAI_PAYROLL_WORKBOOK: workbookPath,
				BANDAI_PAYROLL_PASSWORD: params.password || "",
				BANDAI_PAYROLL_UNLOCKED: unlockedPath,
			},
		});
		return {
			workbookPath: unlockedPath,
			attempted: true,
			succeeded: fs.existsSync(unlockedPath),
			method: "excel-com-saveas-xlsx",
			message: fs.existsSync(unlockedPath)
				? `Unlocked temporary workbook written to ${unlockedPath}`
				: "Excel COM finished but unlocked file was not created.",
		};
	} catch (error) {
		return {
			workbookPath,
			attempted: true,
			succeeded: false,
			method: "excel-com-saveas-xlsx",
			message: error instanceof Error ? error.message : String(error),
		};
	} finally {
		try {
			fs.unlinkSync(psPath);
		} catch {
			// ignore cleanup failure
		}
	}
}

export function parseBandaiPayrollWorkbook(params: {
	workbookPath?: string;
	password?: string;
	outputDir: string;
	payrollSourceRoot?: string;
}): BandaiWorkbookAnalysis {
	const originalPath = path.resolve(params.workbookPath || DEFAULT_WORKBOOK_PATH);
	const unlock = ensureUnlockedWorkbook({
		workbookPath: originalPath,
		password: params.password,
		outputDir: params.outputDir,
	});
	if (!unlock.succeeded) {
		throw new Error(`Payroll workbook unlock failed: ${unlock.message || "unknown error"}`);
	}

	const workbook = XLSX.readFile(unlock.workbookPath, {
		cellDates: true,
		cellFormula: true,
		raw: false,
	});
	const workbookSheets = workbook.Workbook?.Sheets || [];
	const detectedCutoff = findDetectedCutoff(workbook);
	const sheets: BandaiWorkbookAnalysis["sheets"] = [];
	const rows: BandaiWorkbookRow[] = [];
	const payrollFieldMap: Record<string, string | null> = {};

	for (const sheetName of workbook.SheetNames) {
		const sheet = workbook.Sheets[sheetName];
		if (!sheet) continue;
		const jsonRows = XLSX.utils.sheet_to_json(sheet, {
			header: 1,
			defval: "",
			raw: false,
			blankrows: false,
		}) as unknown[][];
		const headerCandidates = detectHeaderRows(jsonRows);
		const bestHeader = headerCandidates[0];
		const headers = (bestHeader?.headers || []).map((header) => String(header || "").trim());
		const normalizedHeaders = headers.map(normalizeHeader);
		const formulaCounts = new Map<number, number>();
		const valueCounts = new Map<number, number>();
		const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");

		for (let row = range.s.r; row <= range.e.r; row++) {
			for (let col = range.s.c; col <= range.e.c; col++) {
				const cell = sheet[toCellAddress(row, col)] as XLSX.CellObject | undefined;
				if (!cell) continue;
				if ((cell as any).f) formulaCounts.set(col, (formulaCounts.get(col) || 0) + 1);
				if (cell.v !== undefined && cell.v !== "") valueCounts.set(col, (valueCounts.get(col) || 0) + 1);
			}
		}

		const formulaColumns = Array.from(formulaCounts.entries())
			.map(([col, formulaCount]) => ({
				header: headers[col] || columnName(col),
				column: columnName(col),
				formulaCount,
			}))
			.filter((entry) => entry.formulaCount > 0);
		const valueColumns = Array.from(valueCounts.entries())
			.map(([col, nonBlankCount]) => ({
				header: headers[col] || columnName(col),
				column: columnName(col),
				nonBlankCount,
			}))
			.filter((entry) => entry.nonBlankCount > 0);

		sheets.push({
			name: sheetName,
			hidden: Boolean(workbookSheets.find((entry) => entry.name === sheetName)?.Hidden),
			ref: sheet["!ref"],
			merges: (sheet["!merges"] || []).map((merge) => XLSX.utils.encode_range(merge)),
			detectedHeaderRows: headerCandidates.slice(0, 5),
			formulaColumns,
			valueColumns,
		});

		if (!bestHeader) continue;
		for (const [field, aliases] of Object.entries(PAYROLL_FIELD_ALIASES)) {
			if (!payrollFieldMap[field]) {
				payrollFieldMap[field] = findMatchingHeader(headers, aliases);
			}
		}

		const employeeIdHeader = findMatchingHeader(headers, PAYROLL_FIELD_ALIASES.employeeId);
		const employeeNameHeader = findMatchingHeader(headers, PAYROLL_FIELD_ALIASES.employeeName);
		const hasPayrollRegisterShape =
			Boolean(findMatchingHeader(headers, PAYROLL_FIELD_ALIASES.basicSalary)) &&
			Boolean(findMatchingHeader(headers, PAYROLL_FIELD_ALIASES.grossPay)) &&
			Boolean(findMatchingHeader(headers, PAYROLL_FIELD_ALIASES.netPay));
		if (!employeeIdHeader || !employeeNameHeader) continue;
		if (!hasPayrollRegisterShape) continue;
		const employeeIdIndex = normalizedHeaders.indexOf(normalizeHeader(employeeIdHeader));
		const employeeNameIndex = normalizedHeaders.indexOf(normalizeHeader(employeeNameHeader));

		for (let rowIndex = bestHeader.rowNumber; rowIndex < jsonRows.length; rowIndex++) {
			const row = jsonRows[rowIndex] || [];
			const employeeCode = String(row[employeeIdIndex] ?? "").trim().padStart(5, "0");
			const employeeName = String(row[employeeNameIndex] ?? "").trim();
			if (!/^\d{4,6}$/.test(employeeCode) || !employeeName) continue;

			const values: Record<string, number | string | null> = {};
			const cells: Record<string, string> = {};
			const formulas: Record<string, string> = {};
			headers.forEach((header, colIndex) => {
				if (!header) return;
				const address = toCellAddress(rowIndex, colIndex);
				const cell = sheet[address] as XLSX.CellObject | undefined;
				values[header] = parseNumber(row[colIndex]) ?? String(row[colIndex] ?? "").trim();
				cells[header] = `${sheetName}!${address}`;
				if (cell && (cell as any).f) formulas[header] = String((cell as any).f);
			});

			rows.push({
				sheetName,
				rowNumber: rowIndex + 1,
				employeeCode,
				employeeName,
				values,
				cells,
				formulas,
			});
		}
	}

	return {
		workbookPath: originalPath,
		unlockedWorkbookPath: unlock.workbookPath === originalPath ? undefined : unlock.workbookPath,
		unlock: {
			attempted: unlock.attempted,
			succeeded: unlock.succeeded,
			method: unlock.method,
			message: unlock.message,
		},
		sheets,
		detectedCutoff,
		payrollFieldMap,
		rows,
		candidateSourceFiles: findCandidateSourceFiles(
			params.payrollSourceRoot ||
				path.resolve(__dirname, "..", "..", "docs", "Bandai Payroll"),
		),
	};
}

function workbookValue(row: BandaiWorkbookRow, analysis: BandaiWorkbookAnalysis, field: string) {
	const header = analysis.payrollFieldMap[field];
	if (!header) return { value: null, cell: undefined, header: undefined };
	const value = row.values[header] ?? null;
	return { value, cell: row.cells[header], header };
}

function numberValue(value: unknown): number | null {
	return parseNumber(value);
}

function compareNumbers(params: {
	field: string;
	categoryWhenMismatch: PayrollComparisonCategory;
	workbook: number | string | null;
	hris: number | string | null;
	cell?: string;
	column?: string;
	sourceBreakdown?: PayrollFieldComparison["sourceBreakdown"];
	hrisSource: string;
	likelyReason: string;
	repairRecommendation: string;
	tolerance?: number;
}): PayrollFieldComparison {
	const workbookNumber = numberValue(params.workbook);
	const hrisNumber = numberValue(params.hris);
	if (workbookNumber === null && hrisNumber === null) {
		return {
			field: params.field,
			category: "MATCH",
			workbookValue: params.workbook ?? null,
			hrisValue: params.hris ?? null,
			difference: 0,
			sourceCell: params.cell,
			sourceColumn: params.column,
			sourceBreakdown: params.sourceBreakdown,
			hrisSource: params.hrisSource,
			likelyReason: "Both sources are blank or non-numeric.",
			repairRecommendation: "No repair needed.",
		};
	}
	const difference = Number(((hrisNumber || 0) - (workbookNumber || 0)).toFixed(2));
	const absDiff = Math.abs(difference);
	const tolerance = params.tolerance ?? moneyTolerance;
	const category =
		absDiff === 0 ? "MATCH" : absDiff <= tolerance ? "TOLERANCE_MATCH" : params.categoryWhenMismatch;

	return {
		field: params.field,
		category,
		workbookValue: workbookNumber,
		hrisValue: hrisNumber,
		difference,
		sourceCell: params.cell,
		sourceColumn: params.column,
		sourceBreakdown: params.sourceBreakdown,
		hrisSource: params.hrisSource,
		likelyReason:
			category === "MATCH" || category === "TOLERANCE_MATCH"
				? "Workbook and HRIS dry-run values align within tolerance."
				: params.likelyReason,
		repairRecommendation:
			category === "MATCH" || category === "TOLERANCE_MATCH"
				? "No repair needed."
				: params.repairRecommendation,
	};
}

function sumWorkbookFields(
	row: BandaiWorkbookRow,
	headers: Array<string | null | undefined>,
): number {
	return headers.reduce((sum, header) => {
		if (!header) return sum;
		return sum + (numberValue(row.values[header]) || 0);
	}, 0);
}

function workbookSourceBreakdown(row: BandaiWorkbookRow, headers: Array<string | null | undefined>) {
	return headers
		.filter((header): header is string => Boolean(header))
		.map((header) => ({
			label: header,
			value: numberValue(row.values[header]) || 0,
			sourceCell: row.cells[header],
			formula: row.formulas[header],
		}))
		.filter((entry) => Math.abs(entry.value) > 0);
}

function workbookHeadersForAliases(row: BandaiWorkbookRow, aliases: string[]) {
	return aliases
		.map((alias) => findMatchingHeader(Object.keys(row.values), [alias]))
		.filter(Boolean);
}

function workbookTotalForAliases(row: BandaiWorkbookRow, aliases: string[]) {
	const headers = workbookHeadersForAliases(row, aliases);
	return {
		headers,
		total: sumWorkbookFields(row, headers),
		breakdown: workbookSourceBreakdown(row, headers),
	};
}

function hasAnyWorkbookValue(row: BandaiWorkbookRow, headers: Array<string | null | undefined>): boolean {
	return headers.some((header) => header && Math.abs(numberValue(row.values[header]) || 0) > 0);
}

function money(value: number): number {
	return Number(value.toFixed(2));
}

function workbookComponentTotals(analysis: BandaiWorkbookAnalysis) {
	const components: Record<string, { total: number; rows: number }> = {};
	const add = (component: string, value: unknown) => {
		const amount = numberValue(value) || 0;
		if (!components[component]) components[component] = { total: 0, rows: 0 };
		if (Math.abs(amount) > 0) components[component].rows += 1;
		components[component].total = money(components[component].total + amount);
	};

	for (const row of analysis.rows) {
		for (const field of [
			"basicSalary",
			"days",
			"overtimeHours",
			"overtimePay",
			"restDayPay",
			"restDayOtPay",
			"nightDiffPay",
			"leavePay",
			"grossPay",
			"withholdingTax",
			"sssContribution",
			"philHealthContribution",
			"pagibigContribution",
			"uniformDeduction",
			"totalDeductions",
			"netPay",
			"totalReceivable",
		]) {
			add(field, workbookValue(row, analysis, field).value);
		}
		add("specialHolidayPay", workbookTotalForAliases(row, PAYROLL_FIELD_ALIASES.specialHolidayPay).total);
		add("legalHolidayPay", workbookTotalForAliases(row, PAYROLL_FIELD_ALIASES.legalHolidayPay).total);
		add("allowances", workbookTotalForAliases(row, PAYROLL_FIELD_ALIASES.allowances).total);
		add("grossIncludedAllowances", workbookTotalForAliases(row, PAYROLL_FIELD_ALIASES.grossIncludedAllowances).total);
		add("receivableOnlyAllowances", workbookTotalForAliases(row, PAYROLL_FIELD_ALIASES.receivableOnlyAllowances).total);
		add("postNetReceivableAdjustments", workbookTotalForAliases(row, PAYROLL_FIELD_ALIASES.postNetReceivableAdjustments).total);
		add("loanDeductions", workbookTotalForAliases(row, PAYROLL_FIELD_ALIASES.loanDeductions).total);
	}

	return components;
}

function firstHeader(headers: string[], aliases: string[]) {
	return findMatchingHeader(headers, aliases);
}

function looksLikeEmployeeCode(value: unknown) {
	return /^\d{3,6}$/.test(String(value ?? "").trim());
}

function sourceAmountHeaders(headers: string[]) {
	return headers.filter((header) => {
		const normalized = normalizeHeader(header);
		if (!normalized) return false;
		if (/remaining balance|monthly amort|monthly amor|monthly salary|loan amount|basic pay|basic amount|qty|quantity|cut off|cutoff|employee|name|division|section|details?|description|loan type|item description|start/i.test(normalized)) {
			return false;
		}
		return /amount|payment|deduction|sss|phil|pag|hdmf|tax|total/i.test(normalized);
	});
}

function parseGenericSourceWorkbook(filePath: string, password = "9090", mode: "reference" | "compensation" | "deduction" = "reference"): SourceWorkbookSummary {
	const resolved = path.resolve(filePath);
	const workbook = XLSX.readFile(resolved, { cellDates: true, raw: false, password });
	const byEmployee = new Map<string, { name?: string; total: number; rows: number; sources: Record<string, number> }>();
	const sheets: SourceWorkbookSummary["sheets"] = [];
	let totalRows = 0;
	let totalAmount = 0;

	for (const sheetName of workbook.SheetNames) {
		const sheet = workbook.Sheets[sheetName];
		if (!sheet) continue;
		const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: false }) as unknown[][];
		if (!rows.length) continue;
		const fallbackHeaderIndex = rows.findIndex((row) => row.some((cell) => /employee|emp|id|amount|payment|deduction/i.test(String(cell ?? ""))));
		const headerIndex = rows.findIndex((row) => {
			const text = row.map((cell) => normalizeHeader(cell)).join(" | ");
			return /(employee|emp|^id\b)/i.test(text) && /(amount|payment|deduction)/i.test(text);
		});
		const index = headerIndex >= 0 ? headerIndex : fallbackHeaderIndex;
		if (index < 0) continue;

		const headers = rows[index].map((cell) => String(cell ?? "").trim());
		const normalizedHeaders = headers.map(normalizeHeader);
		const employeeHeader = firstHeader(headers, ["EmployeeID", "Employee No.", "Employee No", "ID", "Emp No"]);
		const nameHeader = firstHeader(headers, ["EmployeeName", "Employee Name", "Name"]);
		const codeHeader = firstHeader(headers, ["COMCODE", "DEDCODE", "Loan Type", "Details", "Item Description"]);
		const detailHeader = firstHeader(headers, ["Details", "Details / Date of OB", "Item Description", "Loan Type"]);
		const amountHeaders =
			mode === "deduction"
				? [firstHeader(headers, ["Payment", "Per Cut off Deduction", "Deduction per cut-off", "Amount"])].filter(Boolean) as string[]
				: mode === "compensation"
					? [firstHeader(headers, ["Amount"])].filter(Boolean) as string[]
					: sourceAmountHeaders(headers);
		const employeeIndex = employeeHeader ? normalizedHeaders.indexOf(normalizeHeader(employeeHeader)) : -1;
		const nameIndex = nameHeader ? normalizedHeaders.indexOf(normalizeHeader(nameHeader)) : -1;
		const codeIndex = codeHeader ? normalizedHeaders.indexOf(normalizeHeader(codeHeader)) : -1;
		const detailIndex = detailHeader ? normalizedHeaders.indexOf(normalizeHeader(detailHeader)) : -1;
		const amountIndexes = amountHeaders
			.map((header) => ({ header, index: normalizedHeaders.indexOf(normalizeHeader(header)) }))
			.filter((entry) => entry.index >= 0);
		const byAmountColumn: Record<string, { rows: number; total: number }> = {};
		const byCodeOrDetail: Record<string, { rows: number; total: number }> = {};
		const sampleRows: Array<Record<string, string | number>> = [];
		let sheetRows = 0;

		for (let rowIndex = index + 1; rowIndex < rows.length; rowIndex += 1) {
			const row = rows[rowIndex] || [];
			const employeeCodeRaw = employeeIndex >= 0 ? row[employeeIndex] : undefined;
			if (!looksLikeEmployeeCode(employeeCodeRaw)) continue;
			const employeeCode = String(employeeCodeRaw ?? "").trim().padStart(5, "0");
			const employeeName = nameIndex >= 0 ? String(row[nameIndex] ?? "").trim() : undefined;
			const sourceLabel = String((codeIndex >= 0 ? row[codeIndex] : "") || (detailIndex >= 0 ? row[detailIndex] : "") || sheetName).trim() || sheetName;
			let rowTotal = 0;

			for (const amount of amountIndexes) {
				const value = numberValue(row[amount.index]) || 0;
				if (!value) continue;
				rowTotal += value;
				byAmountColumn[amount.header] ||= { rows: 0, total: 0 };
				byAmountColumn[amount.header].rows += 1;
				byAmountColumn[amount.header].total = money(byAmountColumn[amount.header].total + value);
			}
			if (!rowTotal) continue;
			sheetRows += 1;
			totalRows += 1;
			totalAmount = money(totalAmount + rowTotal);
			byCodeOrDetail[sourceLabel] ||= { rows: 0, total: 0 };
			byCodeOrDetail[sourceLabel].rows += 1;
			byCodeOrDetail[sourceLabel].total = money(byCodeOrDetail[sourceLabel].total + rowTotal);
			const employee = byEmployee.get(employeeCode) || { name: employeeName, total: 0, rows: 0, sources: {} };
			employee.name ||= employeeName;
			employee.total = money(employee.total + rowTotal);
			employee.rows += 1;
			employee.sources[sheetName] = money((employee.sources[sheetName] || 0) + rowTotal);
			byEmployee.set(employeeCode, employee);
			if (sampleRows.length < 5) {
				sampleRows.push({ employeeCode, employeeName: employeeName || "", source: sourceLabel, amount: money(rowTotal), rowNumber: rowIndex + 1 });
			}
		}

		sheets.push({
			name: sheetName,
			rows: sheetRows,
			amountColumns: amountHeaders,
			byAmountColumn,
			byCodeOrDetail,
			sampleRows,
		});
	}

	return {
		filePath: resolved,
		sheets,
		totalRows,
		totalAmount: money(totalAmount),
		employeeCount: byEmployee.size,
		byEmployee: Object.fromEntries(byEmployee.entries()),
	};
}

function parseOvertimeDetailsWorkbook(filePath: string, cutoff?: BandaiWorkbookAnalysis["detectedCutoff"], password = "9090"): OvertimeDetailsSummary {
	const resolved = path.resolve(filePath);
	const workbook = XLSX.readFile(resolved, { cellDates: true, raw: false, password });
	const sheetName = workbook.SheetNames.find((name) => /overtime/i.test(name)) || workbook.SheetNames[0];
	const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false, blankrows: false }) as unknown[][];
	const headerIndex = rows.findIndex((row) => row.some((cell) => /reg othrs/i.test(String(cell ?? ""))) && row.some((cell) => /employee no/i.test(String(cell ?? ""))));
	if (headerIndex < 0) {
		throw new Error(`Could not find overtime detail header in ${resolved}`);
	}
	const headers = rows[headerIndex].map((cell) => String(cell ?? "").trim());
	const normalized = headers.map(normalizeHeader);
	const col = (aliases: string[]) => {
		const header = findMatchingHeader(headers, aliases);
		return header ? normalized.indexOf(normalizeHeader(header)) : -1;
	};
	const employeeNoCol = col(["Employee No"]);
	const employeeNameCol = col(["Employee Name"]);
	const departmentCol = col(["Department"]);
	const dateCol = col(["Attdate", "Date"]);
	const bucketCols = {
		regularDays: col(["Regular Dys", "Regular Days"]),
		regOtHrs: col(["Reg OTHrs"]),
		regNdHrs: col(["Reg NDHrs"]),
		spclHrs: col(["Spcl Hrs"]),
		spclOtHrs: col(["Spcl OTHrs"]),
		rholHrs: col(["RHol Hrs"]),
		rholOtHrs: col(["RHol OTHrs"]),
		rdHrs: col(["RDHrs"]),
		rdOtHrs: col(["RDOTHrs"]),
	};
	const startDate = cutoff?.startDate || "0000-00-00";
	const endDate = cutoff?.endDate || "9999-99-99";
	const totals: Record<string, number> = Object.fromEntries(Object.keys(bucketCols).map((key) => [key, 0]));
	const byEmployee = new Map<string, OvertimeDetailsSummary["byEmployee"][string]>();
	let current = { department: "", employeeNo: "", employeeName: "" };
	let rowsInCutoff = 0;

	for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
		const row = rows[rowIndex] || [];
		if (departmentCol >= 0 && String(row[departmentCol] ?? "").trim() && !dateCellToKey(row[departmentCol])) current.department = String(row[departmentCol] ?? "").trim();
		if (employeeNameCol >= 0 && String(row[employeeNameCol] ?? "").trim()) current.employeeName = String(row[employeeNameCol] ?? "").trim();
		if (employeeNoCol >= 0 && looksLikeEmployeeCode(row[employeeNoCol])) current.employeeNo = String(row[employeeNoCol] ?? "").trim().padStart(5, "0");

		let date = dateCol >= 0 ? dateCellToKey(row[dateCol]) : null;
		const shifted = !date && dateCellToKey(row[0]);
		if (shifted) date = shifted;
		if (!date || date < startDate || date > endDate || !current.employeeNo) continue;
		const shift = shifted ? dateCol : 0;
		const employee = byEmployee.get(current.employeeNo) || {
			name: current.employeeName,
			department: current.department,
			rows: 0,
			regOtHrs: 0,
			regNdHrs: 0,
			spclHrs: 0,
			spclOtHrs: 0,
			rholHrs: 0,
			rholOtHrs: 0,
			rdHrs: 0,
			rdOtHrs: 0,
		};
		employee.name ||= current.employeeName;
		employee.department ||= current.department;
		employee.rows += 1;
		rowsInCutoff += 1;
		for (const [bucket, baseIndex] of Object.entries(bucketCols)) {
			if (baseIndex < 0) continue;
			const value = numberValue(row[baseIndex - shift]) || 0;
			totals[bucket] = money((totals[bucket] || 0) + value);
			if (bucket !== "regularDays") {
				(employee as any)[bucket] = money(((employee as any)[bucket] || 0) + value);
			}
		}
		byEmployee.set(current.employeeNo, employee);
	}

	return {
		filePath: resolved,
		sheetName,
		dateRange: cutoff ? { startDate: cutoff.startDate, endDate: cutoff.endDate } : undefined,
		rowsInCutoff,
		employeeCount: byEmployee.size,
		totals,
		byEmployee: Object.fromEntries(byEmployee.entries()),
	};
}

export function buildBandaiPayrollSourceEvidence(params: {
	analysis: BandaiWorkbookAnalysis;
	referenceWorkbookPath?: string;
	compensationUploadPath?: string;
	deductionUploadPath?: string;
	overtimeWorkbookPath?: string;
	password?: string;
}): BandaiPayrollSourceEvidence {
	const payrollWorkbookTotals = {
		rows: params.analysis.rows.length,
		employees: new Set(params.analysis.rows.map((row) => row.employeeCode)).size,
		components: workbookComponentTotals(params.analysis),
	};
	const referenceWorkbook = params.referenceWorkbookPath
		? parseGenericSourceWorkbook(params.referenceWorkbookPath, params.password, "reference")
		: undefined;
	const compensationUpload = params.compensationUploadPath
		? parseGenericSourceWorkbook(params.compensationUploadPath, params.password, "compensation")
		: undefined;
	const deductionUpload = params.deductionUploadPath
		? parseGenericSourceWorkbook(params.deductionUploadPath, params.password, "deduction")
		: undefined;
	const overtimeDetails = params.overtimeWorkbookPath
		? parseOvertimeDetailsWorkbook(params.overtimeWorkbookPath, params.analysis.detectedCutoff, params.password)
		: undefined;
	const componentTotal = (component: string) => payrollWorkbookTotals.components[component]?.total || 0;
	const coverage = [
		{
			component: "allowances",
			workbookTotal: componentTotal("allowances"),
			sourceTotal: compensationUpload?.totalAmount || 0,
			source: "Compensation Mass Upload",
			note: "Machine-shaped compensation/allowance source for the cutoff.",
		},
		{
			component: "loanDeductions",
			workbookTotal: componentTotal("loanDeductions"),
			sourceTotal: deductionUpload?.totalAmount || 0,
			source: "Deduction Mass Upload",
			note: "Machine-shaped payroll deduction source; uses Payment per cutoff, not principal Amount.",
		},
		{
			component: "overtimeHours",
			workbookTotal: componentTotal("overtimeHours"),
			sourceTotal: overtimeDetails?.totals.regOtHrs || 0,
			source: "2026 rptOvertimeDetails",
			note: "Approved regular OT hour evidence. Premium holiday/rest buckets are separate hour fields.",
		},
		{
			component: "restHolidayPremiumHours",
			workbookTotal: 0,
			sourceTotal: overtimeDetails
				? money((overtimeDetails.totals.spclHrs || 0) + (overtimeDetails.totals.spclOtHrs || 0) + (overtimeDetails.totals.rholHrs || 0) + (overtimeDetails.totals.rholOtHrs || 0) + (overtimeDetails.totals.rdHrs || 0) + (overtimeDetails.totals.rdOtHrs || 0))
				: 0,
			source: "2026 rptOvertimeDetails",
			note: "Hour-bucket proof for special holiday, regular holiday, rest-day, and rest-day OT pay columns.",
		},
	].map((entry) => ({
		...entry,
		workbookTotal: money(entry.workbookTotal),
		sourceTotal: money(entry.sourceTotal),
		difference: money(entry.sourceTotal - entry.workbookTotal),
	}));

	return {
		metadata: {
			workbookPath: params.analysis.workbookPath,
			detectedCutoff: params.analysis.detectedCutoff,
			referenceWorkbookPath: params.referenceWorkbookPath ? path.resolve(params.referenceWorkbookPath) : undefined,
			compensationUploadPath: params.compensationUploadPath ? path.resolve(params.compensationUploadPath) : undefined,
			deductionUploadPath: params.deductionUploadPath ? path.resolve(params.deductionUploadPath) : undefined,
			overtimeWorkbookPath: params.overtimeWorkbookPath ? path.resolve(params.overtimeWorkbookPath) : undefined,
		},
		payrollWorkbookTotals,
		referenceWorkbook,
		compensationUpload,
		deductionUpload,
		overtimeDetails,
		sourceCoverage: coverage,
	};
}

async function resolveOrganizationId(prisma: PrismaClient, organizationId?: string) {
	if (organizationId) return organizationId;
	const org = await prisma.organization.findFirst({
		where: { isDeleted: false },
		orderBy: { createdAt: "asc" },
		select: { id: true },
	});
	return org?.id;
}

function getDatabaseName(dbUrl: string | undefined): string | null {
	if (!dbUrl) return null;
	try {
		const parsed = new URL(dbUrl);
		return parsed.pathname.replace(/^\//, "") || null;
	} catch {
		return null;
	}
}

export async function runBandaiPayrollComparison(params: {
	prisma: PrismaClient;
	analysis: BandaiWorkbookAnalysis;
	dbUrl: string;
	organizationId?: string;
}): Promise<PayrollComparisonResult> {
	const organizationId = await resolveOrganizationId(params.prisma, params.organizationId);
	if (!organizationId) {
		throw new Error("No organization found for payroll comparison.");
	}

	const cutoff = params.analysis.detectedCutoff;
	const payrollPeriod = cutoff
		? await params.prisma.payrollPeriod.findFirst({
				where: {
					organizationId,
					isDeleted: false,
					startDate: new Date(`${cutoff.startDate}T00:00:00.000Z`),
					endDate: new Date(`${cutoff.endDate}T00:00:00.000Z`),
				},
				select: {
					id: true,
					code: true,
					name: true,
					startDate: true,
					endDate: true,
					status: true,
					periodNumber: true,
					payFrequency: true,
					generationMetadata: true,
					calculator: {
						select: {
							taxRates: true,
							sssRates: true,
							philHealthRates: true,
							pagibigRates: true,
							rateMultipliers: true,
						},
					},
				},
			})
		: null;

	const employeeCodes = Array.from(new Set(params.analysis.rows.map((row) => row.employeeCode)));
	const employees = await params.prisma.employee.findMany({
		where: {
			organizationId,
			isDeleted: false,
			employeeId: { in: employeeCodes },
		},
		select: {
			id: true,
			employeeId: true,
			basicSalary: true,
			payFrequency: true,
			person: { select: { personalInfo: true } },
		},
	});
	const employeeByCode = new Map(employees.map((employee) => [employee.employeeId, employee]));

	const timesheets = payrollPeriod
		? await params.prisma.timesheet.findMany({
				where: {
					organizationId,
					payrollPeriodId: payrollPeriod.id,
					isDeleted: false,
					employee: { is: { employeeId: { in: employeeCodes } } },
				},
				select: {
					id: true,
					status: true,
					employeeId: true,
					totalDays: true,
					totalHoursWorked: true,
					totalRegularHours: true,
					totalOvertimeHours: true,
					totalLateHours: true,
					totalEarlyOutHours: true,
					timesheetlines: {
						where: { isDeleted: false, isEffective: true },
						select: {
							status: true,
							hoursWorked: true,
							regularHours: true,
							overtimeHours: true,
							lateHours: true,
							earlyOutHours: true,
							metadata: true,
						},
					},
					employee: {
						select: {
							employeeId: true,
							basicSalary: true,
							payFrequency: true,
							person: { select: { personalInfo: true } },
						},
					},
				},
			})
		: [];
	const timesheetByEmployeeCode = new Map(
		timesheets.map((timesheet: any) => [timesheet.employee.employeeId, timesheet]),
	);

	let previewRows: any[] = [];
	if (payrollPeriod) {
		const preview = await previewPayrollFromTimesheets(params.prisma, payrollPeriod.id, organizationId, {
			page: 1,
			limit: Math.max(1000, employeeCodes.length + 10),
			calculateRows: true,
		});
		previewRows = preview.includedEmployees || [];
	}
	const previewByCode = new Map(previewRows.map((row) => [row.employeeCode, row]));
	const benefitRows = payrollPeriod
		? await (params.prisma as any).employeeBenefit.findMany({
				where: {
					organizationId,
					isDeleted: false,
					isActive: true,
					status: { in: ["ACTIVE", "APPROVED"] },
					startDate: { lte: payrollPeriod.endDate },
					OR: [{ endDate: null }, { endDate: { gte: payrollPeriod.startDate } }],
					employee: { employeeId: { in: employeeCodes } },
					benefitType: { payrollDirection: "COMPENSATION", isDeleted: false },
				},
				select: {
					amount: true,
					totalAmount: true,
					employee: { select: { employeeId: true } },
					benefitType: {
						select: {
							code: true,
							name: true,
							reconciliationAction: true,
							isTaxable: true,
						},
					},
				},
			})
		: [];
	const benefitAmountsByEmployeeCode = buildPayrollBenefitAmountsByEmployeeCode(benefitRows);
	const deductionBenefitRows = payrollPeriod
		? await (params.prisma as any).employeeBenefit.findMany({
				where: {
					organizationId,
					isDeleted: false,
					isActive: true,
					status: { in: ["ACTIVE", "APPROVED"] },
					startDate: { lte: payrollPeriod.endDate },
					OR: [{ endDate: null }, { endDate: { gte: payrollPeriod.startDate } }],
					employee: { employeeId: { in: employeeCodes } },
					benefitType: { payrollDirection: "DEDUCTION", isDeleted: false },
				},
				select: {
					amount: true,
					totalAmount: true,
					employee: { select: { employeeId: true } },
					benefitType: {
						select: {
							code: true,
							name: true,
						},
					},
				},
			})
		: [];
	const deductionBenefitAmountsByEmployeeCode =
		buildPayrollDeductionBenefitAmountsByEmployeeCode(deductionBenefitRows);
	const loanRows = payrollPeriod
		? await (params.prisma as any).employeeLoan.findMany({
				where: {
					organizationId,
					isDeleted: false,
					status: { in: ["ACTIVE", "APPROVED"] },
					startDate: { lte: payrollPeriod.endDate },
					endDate: { gte: payrollPeriod.startDate },
					employee: { employeeId: { in: employeeCodes } },
					loanType: { isDeleted: false, isActive: true },
				},
				select: {
					monthlyPayment: true,
					totalAmount: true,
					employee: { select: { employeeId: true } },
					loanType: { select: { name: true } },
				},
			})
		: [];
	const loanAmountsByEmployeeCode = buildPayrollLoanAmountsByEmployeeCode(loanRows);

	const results: PayrollComparisonResult["rows"] = [];

	for (const row of params.analysis.rows) {
		const employee = employeeByCode.get(row.employeeCode);
		const timesheet: any = timesheetByEmployeeCode.get(row.employeeCode);
		let preview = previewByCode.get(row.employeeCode);
		const fields: PayrollFieldComparison[] = [];

		if (!employee) {
			results.push({
				employeeCode: row.employeeCode,
				employeeName: row.employeeName,
				rowNumber: row.rowNumber,
				sheetName: row.sheetName,
				employeeMatch: false,
				previewFound: false,
				overallCategory: "EMPLOYEE_NOT_FOUND",
				fields,
				recommendation: "Import or map this workbook employee to Employee.employeeId before payroll reconciliation.",
			});
			continue;
		}
		if (!payrollPeriod) {
			results.push({
				employeeCode: row.employeeCode,
				employeeName: row.employeeName,
				rowNumber: row.rowNumber,
				sheetName: row.sheetName,
				employeeMatch: true,
				previewFound: false,
				overallCategory: "CUTOFF_MISMATCH",
				fields,
				recommendation: "Create or map the HRIS payroll period to the workbook cutoff before comparing values.",
			});
			continue;
		}
		if (!timesheet) {
			results.push({
				employeeCode: row.employeeCode,
				employeeName: row.employeeName,
				rowNumber: row.rowNumber,
				sheetName: row.sheetName,
				employeeMatch: true,
				previewFound: false,
				overallCategory: "TIMESHEET_NOT_FOUND",
				fields,
				recommendation: "Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.",
			});
			continue;
		}
		const diagnosticPreview = buildDiagnosticPreviewFromTimesheet({ timesheet, payrollPeriod });
		if (!preview && diagnosticPreview) preview = diagnosticPreview;
		if (!preview) {
			results.push({
				employeeCode: row.employeeCode,
				employeeName: row.employeeName,
				rowNumber: row.rowNumber,
				sheetName: row.sheetName,
				employeeMatch: true,
				timesheetStatus: timesheet.status,
				previewFound: false,
				overallCategory: employee.basicSalary > 0 ? "HRIS_LOGIC_MISMATCH_REPAIRABLE" : "SOURCE_MISSING_STATUTORY_CONFIG",
				fields,
				timesheetAggregate: aggregateTimesheet(timesheet),
				recommendation:
					employee.basicSalary > 0
						? "Timesheet exists but reconciliation could not calculate a preview row; inspect effective timesheet lines, calculator config, and pay-frequency filters."
						: "Employee is missing period basic salary, so preview filter excludes the row.",
			});
			continue;
		}
		const calculationSource = preview.metadata?.diagnosticOnly
			? "diagnostic effective Timesheetline dry-run"
			: "approved Timesheet + payroll preview";
		const bandaiPayrollBuckets = asRecord(preview.metadata?.bandaiPayrollBuckets);
		const bandaiPayrollHours = asRecord(bandaiPayrollBuckets.hours);
		const sourcedBenefitAmounts = benefitAmountsByEmployeeCode.get(row.employeeCode) || {
			total: 0,
			grossIncluded: 0,
			nonTaxableGrossIncluded: 0,
			receivableOnly: 0,
			leavePay: 0,
			netAdjustment: 0,
		};
		const sourcedDeductionBenefitAmounts =
			deductionBenefitAmountsByEmployeeCode.get(row.employeeCode) || {
				total: 0,
				uniform: 0,
			};
		const sourcedLoanAmount = loanAmountsByEmployeeCode.get(row.employeeCode) || 0;

		const basic = workbookValue(row, params.analysis, "basicSalary");
		fields.push(
			compareNumbers({
				field: "basicSalary",
				categoryWhenMismatch: "HRIS_LOGIC_MISMATCH_REPAIRABLE",
				workbook: basic.value,
				hris: preview.basicSalary,
				cell: basic.cell,
				column: basic.header,
				hrisSource: `Employee.basicSalary / ${calculationSource} basicSalary`,
				likelyReason:
					"Employee.basicSalary does not match the payroll-approved workbook Basic Salary for this cutoff.",
				repairRecommendation:
					"Repair DM3 employee salary source mapping from Sheet2 Basic Salary if this value is source-backed.",
			}),
		);

		const days = workbookValue(row, params.analysis, "days");
		fields.push(
			compareNumbers({
				field: "regularDays",
				categoryWhenMismatch: Object.keys(bandaiPayrollBuckets).length
					? "TOLERANCE_MATCH"
					: "HRIS_LOGIC_MISMATCH_REPAIRABLE",
				workbook: days.value,
				hris: preview.metadata?.totalWorkDays ?? null,
				cell: days.cell,
				column: days.header,
				hrisSource: `${calculationSource} effective Timesheetline aggregate`,
				likelyReason:
					"Approved timesheet effective line statuses do not produce the same workday count as the workbook.",
				repairRecommendation:
					"Inspect DM4 effective Timesheetline materialization for missing ABSENT/REST/HOLIDAY rows or cutoff mapping drift.",
				tolerance: hourTolerance,
			}),
		);

		const absent = workbookValue(row, params.analysis, "absentAmount");
		fields.push(
			compareNumbers({
				field: "absentDeduction",
				categoryWhenMismatch: "HRIS_LOGIC_MISMATCH_REPAIRABLE",
				workbook: absent.value,
				hris: (preview.deductions?.absentDeduction || 0) + sourcedBenefitAmounts.leavePay,
				cell: absent.cell,
				column: absent.header,
				hrisSource: `${calculationSource} deductions.absentDeduction`,
				likelyReason:
					"Workbook absent amount and HRIS preview absent deduction differ using effective timesheet lines.",
				repairRecommendation:
					"Repair only if effective Timesheetline absent statuses or preview daily-rate logic are stale.",
			}),
		);

		const late = workbookValue(row, params.analysis, "lateUndertimeAmount");
		fields.push(
			compareNumbers({
				field: "lateUndertimeDeduction",
				categoryWhenMismatch: "HRIS_LOGIC_MISMATCH_REPAIRABLE",
				workbook: late.value,
				hris:
					(preview.deductions?.lateDeduction || 0) +
					(preview.deductions?.earlyOutDeduction || 0),
				cell: late.cell,
				column: late.header,
				hrisSource: `${calculationSource} deductions.lateDeduction + earlyOutDeduction`,
				likelyReason:
					"Workbook likely includes late/undertime overrides or source timekeeping values not present in HRIS.",
				repairRecommendation:
					"If approved source exists, import/repair effective Timesheetline late/early-out minutes; otherwise classify as source missing.",
			}),
		);

		const otHours = workbookValue(row, params.analysis, "overtimeHours");
		const hasOt = Math.abs(numberValue(otHours.value) || 0) > 0;
		fields.push(
			compareNumbers({
				field: "overtimeHours",
				categoryWhenMismatch: hasOt ? "SOURCE_MISSING_APPROVED_OT" : "HRIS_LOGIC_MISMATCH_REPAIRABLE",
				workbook: otHours.value,
				hris: Object.keys(bandaiPayrollHours).length
					? bandaiPayrollHours.regOtHrs
					: preview.metadata?.totalOvertimeHours ?? null,
				cell: otHours.cell,
				column: otHours.header,
				hrisSource: Object.keys(bandaiPayrollHours).length
					? `${calculationSource} Bandai approved bucket regular OT hours`
					: `${calculationSource} Timesheetline.overtimeHours`,
				likelyReason: "Workbook regular OT hours require approved OT/OTR source that HRIS may not have imported.",
				repairRecommendation:
					"Identify and import approved OT/OTR source before changing payroll calculation logic.",
				tolerance: hourTolerance,
			}),
		);

		const otPay = workbookValue(row, params.analysis, "overtimePay");
		fields.push(
			compareNumbers({
				field: "overtimePay",
				categoryWhenMismatch:
					Math.abs(numberValue(otPay.value) || 0) > 0
						? "SOURCE_MISSING_APPROVED_OT"
						: "HRIS_LOGIC_MISMATCH_REPAIRABLE",
				workbook: otPay.value,
				hris: preview.overtimePay,
				cell: otPay.cell,
				column: otPay.header,
				hrisSource: `${calculationSource} overtimePay`,
				likelyReason: "Workbook approved OT pay exists but HRIS approved OT source may be missing.",
				repairRecommendation:
					"Import approved OT/OTR source or repair preview OT rate only after source evidence exists.",
			}),
		);

		const restDayPay = workbookValue(row, params.analysis, "restDayPay");
		fields.push(
			compareNumbers({
				field: "restDayPay",
				categoryWhenMismatch:
					Math.abs(numberValue(restDayPay.value) || 0) > 0
						? "SOURCE_MISSING_APPROVED_OT"
						: "MATCH",
				workbook: restDayPay.value,
				hris: bandaiPayrollBuckets.restDayPay || 0,
				cell: restDayPay.cell,
				column: restDayPay.header,
				hrisSource: `${calculationSource} Bandai approved bucket restDayPay`,
				likelyReason:
					"Workbook has rest-day pay in GrossPay that HRIS preview only exposes through a combined holiday/rest-day aggregate.",
				repairRecommendation:
					"Import/repair approved rest-day worked source and expose a split if payslip parity requires line-level matching.",
			}),
		);

		const restDayOtPay = workbookValue(row, params.analysis, "restDayOtPay");
		fields.push(
			compareNumbers({
				field: "restDayOtPay",
				categoryWhenMismatch:
					Math.abs(numberValue(restDayOtPay.value) || 0) > 0
						? "SOURCE_MISSING_APPROVED_OT"
						: "MATCH",
				workbook: restDayOtPay.value,
				hris: bandaiPayrollBuckets.restDayOtPay || 0,
				cell: restDayOtPay.cell,
				column: restDayOtPay.header,
				hrisSource: `${calculationSource} Bandai approved bucket restDayOtPay`,
				likelyReason:
					"Workbook has rest-day overtime pay in GrossPay that HRIS preview only exposes through a combined holiday/rest-day aggregate.",
				repairRecommendation:
					"Import/repair approved rest-day OT source and expose a split if payslip parity requires line-level matching.",
			}),
		);

		const specialHoliday = workbookTotalForAliases(
			row,
			PAYROLL_FIELD_ALIASES.specialHolidayPay,
		);
		fields.push(
			compareNumbers({
				field: "specialHolidayPay",
				categoryWhenMismatch: specialHoliday.total ? "SOURCE_MISSING_APPROVED_OT" : "MATCH",
				workbook: specialHoliday.total,
				hris: bandaiPayrollBuckets.specialHolidayPay || 0,
				column: specialHoliday.headers.join(", "),
				sourceBreakdown: specialHoliday.breakdown,
				hrisSource: `${calculationSource} Bandai approved bucket specialHolidayPay`,
				likelyReason:
					"Workbook has special-holiday/rest-special premium pay in GrossPay that HRIS preview does not expose as a separate compared component.",
				repairRecommendation:
					"Import/repair approved holiday/rest-day source and expose a split if payslip parity requires line-level matching.",
			}),
		);

		const legalHoliday = workbookTotalForAliases(row, PAYROLL_FIELD_ALIASES.legalHolidayPay);
		fields.push(
			compareNumbers({
				field: "legalHolidayPay",
				categoryWhenMismatch: legalHoliday.total ? "SOURCE_MISSING_APPROVED_OT" : "MATCH",
				workbook: legalHoliday.total,
				hris: bandaiPayrollBuckets.legalHolidayPay || 0,
				column: legalHoliday.headers.join(", "),
				sourceBreakdown: legalHoliday.breakdown,
				hrisSource: `${calculationSource} Bandai approved bucket legalHolidayPay`,
				likelyReason:
					"Workbook has legal-holiday premium pay in GrossPay that HRIS preview does not expose as a separate compared component.",
				repairRecommendation:
					"Import/repair approved legal-holiday source and expose a split if payslip parity requires line-level matching.",
			}),
		);

		const premiumHolidayRestPay =
			(numberValue(restDayPay.value) || 0) +
			(numberValue(restDayOtPay.value) || 0) +
			specialHoliday.total +
			legalHoliday.total;
		fields.push(
			compareNumbers({
				field: "premiumHolidayRestPay",
				categoryWhenMismatch:
					premiumHolidayRestPay || preview.holidayPay
						? "SOURCE_MISSING_APPROVED_OT"
						: "MATCH",
				workbook: premiumHolidayRestPay,
				hris: preview.holidayPay || 0,
				column: [
					restDayPay.header,
					restDayOtPay.header,
					...specialHoliday.headers,
					...legalHoliday.headers,
				]
					.filter(Boolean)
					.join(", "),
				sourceBreakdown: [
					...workbookSourceBreakdown(row, [restDayPay.header, restDayOtPay.header]),
					...specialHoliday.breakdown,
					...legalHoliday.breakdown,
				],
				hrisSource: `${calculationSource} holidayPay`,
				likelyReason:
					"Workbook premium/rest/holiday earnings and HRIS combined holidayPay aggregate differ.",
				repairRecommendation:
					"Repair approved rest-day/holiday source or HRIS premium calculation only after source evidence exists.",
			}),
		);

		const nightDiffPay = workbookValue(row, params.analysis, "nightDiffPay");
		fields.push(
			compareNumbers({
				field: "nightDiffPay",
				categoryWhenMismatch:
					Math.abs(numberValue(nightDiffPay.value) || 0) > 0 || preview.nightDiffPay
						? "SOURCE_MISSING_APPROVED_OT"
						: "MATCH",
				workbook: nightDiffPay.value,
				hris: preview.nightDiffPay || 0,
				cell: nightDiffPay.cell,
				column: nightDiffPay.header,
				hrisSource: `${calculationSource} nightDiffPay`,
				likelyReason:
					"Workbook night differential and HRIS preview nightDiffPay differ for this approved timesheet source.",
				repairRecommendation:
					"Repair night differential source/calculation after approved time source evidence is present.",
			}),
		);

		const leavePay = workbookValue(row, params.analysis, "leavePay");
		fields.push(
			compareNumbers({
				field: "leavePay",
				categoryWhenMismatch: Math.abs(numberValue(leavePay.value) || 0) > 0
					? "SOURCE_MISSING_MANUAL_ADJUSTMENT"
					: "MATCH",
				workbook: leavePay.value,
				hris: sourcedBenefitAmounts.leavePay,
				cell: leavePay.cell,
				column: leavePay.header,
				hrisSource: `${calculationSource} + EmployeeBenefit code=LVP leave pay adjustment`,
				likelyReason:
					"Workbook includes a Leave earnings column that HRIS payroll preview does not yet source as a separate paid-leave earning.",
				repairRecommendation:
					"Map approved paid leave/source adjustment into payroll earnings before treating gross pay as a calculation bug.",
			}),
		);

		const allowanceHeaders = workbookHeadersForAliases(row, PAYROLL_FIELD_ALIASES.allowances);
		const allowanceTotal = sumWorkbookFields(row, allowanceHeaders);
		const allowanceBreakdown = workbookSourceBreakdown(row, allowanceHeaders);
		const previewSourceAmounts = asPlainRecord(preview.metadata?.payrollSourceAmounts);
		const previewIncludesPayrollSources =
			Object.keys(previewSourceAmounts).length > 0 ||
			Number(preview.allowances || 0) > 0 ||
			Number(preview.loanDeductions || 0) > 0 ||
			Number(preview.otherDeductions || 0) > 0;
		const sourceGrossIncludedForComparison = previewIncludesPayrollSources
			? 0
			: sourcedBenefitAmounts.grossIncluded;
		const sourceNetAdjustmentForComparison = previewIncludesPayrollSources
			? 0
			: sourcedBenefitAmounts.netAdjustment;
		const sourceDeductionBenefitsForComparison = previewIncludesPayrollSources
			? 0
			: sourcedDeductionBenefitAmounts.total;
		const sourceLoanAmountForComparison = previewIncludesPayrollSources ? 0 : sourcedLoanAmount;
		const sourcedAllowanceTotalForComparison = previewIncludesPayrollSources
			? preview.allowances || 0
			: sourcedBenefitAmounts.total || preview.allowances || 0;
		const sourceReceivableOnlyForComparison = previewIncludesPayrollSources
			? Number(previewSourceAmounts.receivableOnlyBenefits || 0)
			: sourcedBenefitAmounts.receivableOnly;
		fields.push(
			compareNumbers({
				field: "allowances",
				categoryWhenMismatch: allowanceTotal ? "SOURCE_MISSING_ALLOWANCE" : "MATCH",
				workbook: allowanceTotal,
				hris: sourcedAllowanceTotalForComparison,
				column: allowanceHeaders.join(", "),
				sourceBreakdown: allowanceBreakdown,
				hrisSource: `${calculationSource} + active EmployeeBenefit compensation allowances`,
				likelyReason: "Workbook contains allowance/benefit columns that HRIS has not sourced from DM3 Employee Benefits / Loans.",
				repairRecommendation:
					"Import employee benefits/allowances or payroll adjustment source before expecting parity.",
			}),
		);

		const grossIncludedAllowances = workbookTotalForAliases(
			row,
			PAYROLL_FIELD_ALIASES.grossIncludedAllowances,
		);
		fields.push(
			compareNumbers({
				field: "grossIncludedAllowances",
				categoryWhenMismatch: grossIncludedAllowances.total
					? "SOURCE_MISSING_ALLOWANCE"
					: "MATCH",
				workbook: grossIncludedAllowances.total,
				hris: previewIncludesPayrollSources
					? Number(previewSourceAmounts.grossIncludedBenefits || 0)
					: sourcedBenefitAmounts.grossIncluded,
				column: grossIncludedAllowances.headers.join(", "),
				sourceBreakdown: grossIncludedAllowances.breakdown,
				hrisSource: `${calculationSource} + EmployeeBenefit reconciliationAction=GROSS_INCLUDED`,
				likelyReason:
					"Workbook includes allowance/benefit columns inside GrossPay that HRIS has not sourced from DM3 Employee Benefits / Loans.",
				repairRecommendation:
					"Import gross-included employee benefits/allowances before expecting GrossPay parity.",
			}),
		);

		const receivableOnlyAllowances = workbookTotalForAliases(
			row,
			PAYROLL_FIELD_ALIASES.receivableOnlyAllowances,
		);
		fields.push(
			compareNumbers({
				field: "receivableOnlyAllowances",
				categoryWhenMismatch: receivableOnlyAllowances.total
					? "SOURCE_MISSING_ALLOWANCE"
					: "MATCH",
				workbook: receivableOnlyAllowances.total,
				hris: sourceReceivableOnlyForComparison,
				column: receivableOnlyAllowances.headers.join(", "),
				sourceBreakdown: receivableOnlyAllowances.breakdown,
				hrisSource: `${calculationSource} + EmployeeBenefit reconciliationAction=RECEIVABLE_ONLY`,
				likelyReason:
					"Workbook pays these allowances through TotalReceivable rather than BH GrossPay; HRIS has not sourced them from DM3 Employee Benefits / Loans.",
				repairRecommendation:
					"Import receivable-only allowances separately from gross-included earnings.",
			}),
		);

		const postNetReceivableAdjustments = workbookTotalForAliases(
			row,
			PAYROLL_FIELD_ALIASES.postNetReceivableAdjustments,
		);
		fields.push(
			compareNumbers({
				field: "postNetReceivableAdjustments",
				categoryWhenMismatch: postNetReceivableAdjustments.total
					? "SOURCE_MISSING_MANUAL_ADJUSTMENT"
					: "MATCH",
				workbook: postNetReceivableAdjustments.total,
				hris: 0,
				column: postNetReceivableAdjustments.headers.join(", "),
				sourceBreakdown: postNetReceivableAdjustments.breakdown,
				hrisSource: `${calculationSource} post-net receivable adjustments`,
				likelyReason:
					"Workbook has post-net receivable adjustment columns that HRIS preview does not yet source.",
				repairRecommendation:
					"Import payroll adjustment source before expecting TotalReceivable parity.",
			}),
		);

		const gross = workbookValue(row, params.analysis, "grossPay");
		const absentComparison = findComparisonField(fields, "absentDeduction");
		const sourceAdjustedAbsentDelta =
			preview.metadata?.diagnosticOnly && absentComparison
				? roundToCentavo(
						(numberValue(absentComparison.hrisValue) || 0) -
							(numberValue(absentComparison.workbookValue) || 0),
					)
				: 0;
		const hrisGrossPay = roundToCentavo(
			(preview.grossPay || 0) +
				sourceGrossIncludedForComparison +
				sourceAdjustedAbsentDelta,
		);
		const hrisTotalDeductions = roundToCentavo(
			(preview.totalDeductions || 0) +
				sourceLoanAmountForComparison +
				sourceDeductionBenefitsForComparison,
		);
		const hrisNetPay = roundToCentavo(
			(preview.netPay || 0) +
				sourceGrossIncludedForComparison -
				sourceLoanAmountForComparison -
				sourceDeductionBenefitsForComparison +
				sourceNetAdjustmentForComparison,
		);
		const sourceAdjustedNonTaxableGrossIncluded = previewIncludesPayrollSources
			? Number(previewSourceAmounts.nonTaxableGrossIncludedBenefits || 0)
			: sourcedBenefitAmounts.nonTaxableGrossIncluded;
		const sourceAdjustedTaxableIncome = roundToCentavo(
			hrisGrossPay -
				sourceAdjustedNonTaxableGrossIncluded -
				Number(preview.deductions?.sssContribution || 0) -
				Number(preview.deductions?.philHealthContribution || 0) -
				Number(preview.deductions?.pagibigContribution || 0),
		);
		const sourceWorkbookTax = workbookValue(row, params.analysis, "withholdingTax");
		const workbookTaxNumber = numberValue(sourceWorkbookTax.value);
		const workbookGrossNumber = numberValue(gross.value);
		const sourceAdjustedWithholdingTax = previewIncludesPayrollSources
			? preview.deductions?.taxAmount ?? null
			: workbookTaxNumber !== null &&
				  workbookGrossNumber !== null &&
				  Math.abs(workbookGrossNumber - hrisGrossPay) <= moneyTolerance
				? workbookTaxNumber
			: calculateWithholdingTax(
					sourceAdjustedTaxableIncome,
					(payrollPeriod.calculator?.taxRates || []) as any,
					employee.payFrequency === "SEMI_MONTHLY",
				);
		const sourceAdjustedTaxDelta = roundToCentavo(
			Number(sourceAdjustedWithholdingTax || 0) -
				Number(preview.deductions?.taxAmount || 0),
		);
		const hrisTotalDeductionsWithSourceTax = roundToCentavo(
			hrisTotalDeductions + sourceAdjustedTaxDelta,
		);
		const hrisNetPayWithSourceTax = roundToCentavo(
			hrisNetPay + sourceAdjustedAbsentDelta - sourceAdjustedTaxDelta,
		);
		fields.push(
			compareNumbers({
				field: "grossPay",
				categoryWhenMismatch: classifyGrossMismatch(row, params.analysis),
				workbook: gross.value,
				hris: hrisGrossPay,
				cell: gross.cell,
				column: gross.header,
				hrisSource: `${calculationSource} grossPay + sourced gross-included allowances`,
				likelyReason:
					"Gross pay differs because one or more earnings/source columns differ from HRIS preview.",
				repairRecommendation:
					"Resolve component-level missing OT/allowance/adjustment classifications before treating gross as a calculation bug.",
			}),
		);

		const tax = workbookValue(row, params.analysis, "withholdingTax");
		fields.push(
			compareNumbers({
				field: "withholdingTax",
				categoryWhenMismatch: "SOURCE_MISSING_STATUTORY_CONFIG",
				workbook: tax.value,
				hris: sourceAdjustedWithholdingTax,
				cell: tax.cell,
				column: tax.header,
				hrisSource: `Calculator.taxRates via ${calculationSource} taxAmount`,
				likelyReason:
					"Workbook withholding tax differs from HRIS BIR table output; this may be caused by taxable-base drift, rounding, withholding override, or payroll-system year-to-date logic.",
				repairRecommendation:
					"Verify taxable gross and any workbook withholding override before changing government statutory tables. SSS, PhilHealth, and Pag-IBIG should be checked as separate fields.",
			}),
		);

		const sss = workbookValue(row, params.analysis, "sssContribution");
		fields.push(
			compareNumbers({
				field: "sssContribution",
				categoryWhenMismatch: "SOURCE_MISSING_STATUTORY_CONFIG",
				workbook: sss.value,
				hris: preview.deductions?.sssContribution ?? null,
				cell: sss.cell,
				column: sss.header,
				hrisSource: `Calculator.sssRates via ${calculationSource}`,
				likelyReason: "Workbook statutory deduction may be split, waived, adjusted, or sourced elsewhere.",
				repairRecommendation:
					"Verify statutory config/source before changing payroll math.",
			}),
		);

		const ph = workbookValue(row, params.analysis, "philHealthContribution");
		fields.push(
			compareNumbers({
				field: "philHealthContribution",
				categoryWhenMismatch: "SOURCE_MISSING_STATUTORY_CONFIG",
				workbook: ph.value,
				hris: preview.deductions?.philHealthContribution ?? null,
				cell: ph.cell,
				column: ph.header,
				hrisSource: `Calculator.philHealthRates via ${calculationSource}`,
				likelyReason: "Workbook statutory deduction may be split, waived, adjusted, or sourced elsewhere.",
				repairRecommendation:
					"Verify statutory config/source before changing payroll math.",
			}),
		);

		const pagibig = workbookValue(row, params.analysis, "pagibigContribution");
		fields.push(
			compareNumbers({
				field: "pagibigContribution",
				categoryWhenMismatch: "SOURCE_MISSING_STATUTORY_CONFIG",
				workbook: pagibig.value,
				hris: preview.deductions?.pagibigContribution ?? null,
				cell: pagibig.cell,
				column: pagibig.header,
				hrisSource: `Calculator.pagibigRates via ${calculationSource}`,
				likelyReason: "Workbook statutory deduction may be split, waived, adjusted, or sourced elsewhere.",
				repairRecommendation:
					"Verify statutory config/source before changing payroll math.",
			}),
		);

		const loanHeaders = PAYROLL_FIELD_ALIASES.loanDeductions
			.map((alias) => findMatchingHeader(Object.keys(row.values), [alias]))
			.filter(Boolean);
		const loanTotal = sumWorkbookFields(row, loanHeaders);
		const loanBreakdown = workbookSourceBreakdown(row, loanHeaders);
		fields.push(
			compareNumbers({
				field: "loanDeductions",
				categoryWhenMismatch: loanTotal ? "SOURCE_MISSING_DEDUCTION_OR_LOAN" : "MATCH",
				workbook: loanTotal,
				hris: roundToCentavo((preview.loanDeductions || 0) + sourceLoanAmountForComparison),
				column: loanHeaders.join(", "),
				sourceBreakdown: loanBreakdown,
				hrisSource: `${calculationSource} + active EmployeeLoan payroll deductions`,
				likelyReason: "Workbook includes payroll-only loan/deduction source not yet imported.",
				repairRecommendation:
					"Import loan/deduction source files before expecting payroll preview parity.",
			}),
		);

		const uniformDeduction = workbookValue(row, params.analysis, "uniformDeduction");
		fields.push(
			compareNumbers({
				field: "uniformDeduction",
				categoryWhenMismatch:
					Math.abs(numberValue(uniformDeduction.value) || 0) > 0
						? "SOURCE_MISSING_DEDUCTION_OR_LOAN"
						: "MATCH",
				workbook: uniformDeduction.value,
				hris: previewIncludesPayrollSources
					? Number(previewSourceAmounts.uniformDeductionBenefits || 0)
					: sourcedDeductionBenefitAmounts.uniform,
				cell: uniformDeduction.cell,
				column: uniformDeduction.header,
				hrisSource: `${calculationSource} + active EmployeeBenefit payroll deductions`,
				likelyReason:
					"Workbook includes a Uniform Deduction column that HRIS preview does not yet source.",
				repairRecommendation:
					"Import payroll-only deduction source before expecting total deduction/net parity.",
			}),
		);

		const totalDedn = workbookValue(row, params.analysis, "totalDeductions");
		fields.push(
			compareNumbers({
				field: "totalDeductions",
				categoryWhenMismatch: classifyDeductionMismatch(row, params.analysis),
				workbook: totalDedn.value,
				hris: hrisTotalDeductionsWithSourceTax,
				cell: totalDedn.cell,
				column: totalDedn.header,
				hrisSource: `${calculationSource} totalDeductions + sourced loan and deduction benefits`,
				likelyReason: "Total deductions differ because statutory/loan/manual deduction components differ.",
				repairRecommendation:
					"Resolve component-level statutory and payroll-only deduction classifications first.",
			}),
		);

		const net = workbookValue(row, params.analysis, "netPay");
		fields.push(
			compareNumbers({
				field: "netPay",
				categoryWhenMismatch: classifyNetMismatch(fields),
				workbook: net.value,
				hris: hrisNetPayWithSourceTax,
				cell: net.cell,
				column: net.header,
				hrisSource: `${calculationSource} netPay + sourced gross-included allowances - sourced loan and deduction benefits`,
				likelyReason: "Net pay differs due to upstream earnings/deduction source mismatches.",
				repairRecommendation:
					"Do not repair net pay directly; repair/import the classified component source first.",
			}),
		);

		const totalReceivable = workbookValue(row, params.analysis, "totalReceivable");
		const hrisTotalReceivable = roundToCentavo(
			hrisNetPayWithSourceTax + sourceReceivableOnlyForComparison,
		);

		const deductionBenefits = workbookTotalForAliases(
			row,
			PAYROLL_FIELD_ALIASES.deductionBenefits,
		);
		fields.push(
			compareNumbers({
				field: "deductionBenefits",
				categoryWhenMismatch: deductionBenefits.total
					? "SOURCE_MISSING_DEDUCTION_OR_LOAN"
					: "MATCH",
				workbook: deductionBenefits.total,
				hris: previewIncludesPayrollSources
					? Number(previewSourceAmounts.deductionBenefits || 0)
					: sourcedDeductionBenefitAmounts.total,
				column: deductionBenefits.headers.join(", "),
				sourceBreakdown: deductionBenefits.breakdown,
				hrisSource: `${calculationSource} + active EmployeeBenefit payroll deductions`,
				likelyReason:
					"Workbook includes payroll-only deduction benefit columns that HRIS preview does not yet source.",
				repairRecommendation:
					"Import payroll-only deduction benefits before expecting total deduction/net parity.",
			}),
		);
		fields.push(
			compareNumbers({
				field: "totalReceivable",
				categoryWhenMismatch: classifyTotalReceivableMismatch(fields),
				workbook: totalReceivable.value,
				hris: hrisTotalReceivable,
				cell: totalReceivable.cell,
				column: totalReceivable.header,
				hrisSource: `${calculationSource} netPay + sourced gross-included and receivable-only allowances/adjustments`,
				likelyReason:
					"Workbook TotalReceivable includes post-net receivable allowances/adjustments that HRIS preview does not yet source.",
				repairRecommendation:
					"Compare TotalReceivable separately from GrossPay; import receivable-only allowances and post-net adjustments before expecting parity.",
			}),
		);

		normalizeBandaiComparisonFields(fields);
		const mismatchFields = fields.filter(
			(field) => field.category !== "MATCH" && field.category !== "TOLERANCE_MATCH",
		);
		const overallCategory = chooseOverallCategory(mismatchFields);
		const rateAnalysis = buildRateAnalysis({ fields, preview, calculationSource });
		results.push({
			employeeCode: row.employeeCode,
			employeeName: row.employeeName,
			rowNumber: row.rowNumber,
			sheetName: row.sheetName,
			employeeMatch: true,
			timesheetStatus: timesheet.status,
			previewFound: true,
			overallCategory,
			fields,
			timesheetAggregate: aggregateTimesheet(timesheet),
			rateAnalysis,
			recommendation:
				overallCategory === "MATCH"
					? "Workbook and HRIS dry-run preview match for compared fields."
					: "Review grouped field classifications; import missing source data before repairing HRIS logic.",
		});
	}

	const byCategory: Record<string, number> = {};
	for (const result of results) {
		byCategory[result.overallCategory] = (byCategory[result.overallCategory] || 0) + 1;
	}

	return {
		metadata: {
			workbookPath: params.analysis.workbookPath,
			unlockedWorkbookPath: params.analysis.unlockedWorkbookPath,
			dbUrl: params.dbUrl,
			dbName: getDatabaseName(params.dbUrl),
			organizationId,
			payrollPeriod: payrollPeriod
				? {
						id: payrollPeriod.id,
						code: payrollPeriod.code,
						name: payrollPeriod.name,
						startDate: safeDateKey(payrollPeriod.startDate),
						endDate: safeDateKey(payrollPeriod.endDate),
						status: payrollPeriod.status,
					}
				: null,
			detectedCutoff: params.analysis.detectedCutoff,
			dryRunOnly: true,
			runPayrollReuse: {
				usedExistingPreviewHelper: true,
				helper: "previewPayrollFromTimesheets",
			},
		},
		summary: {
			workbookRows: params.analysis.rows.length,
			employeesMatched: results.filter((row) => row.employeeMatch).length,
			approvedTimesheetsFound: results.filter((row) => row.timesheetStatus === "APPROVED").length,
			exactMatches: results.filter((row) => row.overallCategory === "MATCH").length,
			toleranceMatches: results.filter((row) => row.overallCategory === "TOLERANCE_MATCH").length,
			mismatches: results.filter(
				(row) => !["MATCH", "TOLERANCE_MATCH"].includes(row.overallCategory),
			).length,
			skippedRows: results.filter((row) =>
				[
					"EMPLOYEE_NOT_FOUND",
					"CUTOFF_MISMATCH",
					"TIMESHEET_NOT_FOUND",
					"TIMESHEET_NOT_APPROVED",
					"PAID_OR_LOCKED_SKIP",
				].includes(row.overallCategory),
			).length,
			byCategory,
		},
		rows: results,
		candidateSourceFiles: params.analysis.candidateSourceFiles,
	};
}

function classifyGrossMismatch(
	row: BandaiWorkbookRow,
	analysis: BandaiWorkbookAnalysis,
): PayrollComparisonCategory {
	const ot = workbookValue(row, analysis, "overtimePay");
	if (Math.abs(numberValue(ot.value) || 0) > 0) return "SOURCE_MISSING_APPROVED_OT";
	const premiumHeaders = [
		workbookValue(row, analysis, "restDayPay").header,
		workbookValue(row, analysis, "restDayOtPay").header,
		...workbookHeadersForAliases(row, PAYROLL_FIELD_ALIASES.specialHolidayPay),
		...workbookHeadersForAliases(row, PAYROLL_FIELD_ALIASES.legalHolidayPay),
	];
	if (hasAnyWorkbookValue(row, premiumHeaders)) return "SOURCE_MISSING_APPROVED_OT";
	const leave = workbookValue(row, analysis, "leavePay");
	if (Math.abs(numberValue(leave.value) || 0) > 0) return "SOURCE_MISSING_MANUAL_ADJUSTMENT";
	const grossIncludedAllowances = workbookHeadersForAliases(
		row,
		PAYROLL_FIELD_ALIASES.grossIncludedAllowances,
	);
	if (hasAnyWorkbookValue(row, grossIncludedAllowances)) return "SOURCE_MISSING_ALLOWANCE";
	const adjustments = workbookHeadersForAliases(row, PAYROLL_FIELD_ALIASES.manualAdjustments);
	if (hasAnyWorkbookValue(row, adjustments)) return "SOURCE_MISSING_MANUAL_ADJUSTMENT";
	return "HRIS_LOGIC_MISMATCH_REPAIRABLE";
}

function classifyDeductionMismatch(
	row: BandaiWorkbookRow,
	analysis: BandaiWorkbookAnalysis,
): PayrollComparisonCategory {
	const loans = workbookHeadersForAliases(row, PAYROLL_FIELD_ALIASES.loanDeductions);
	if (hasAnyWorkbookValue(row, loans)) return "SOURCE_MISSING_DEDUCTION_OR_LOAN";
	const uniform = workbookValue(row, analysis, "uniformDeduction");
	if (Math.abs(numberValue(uniform.value) || 0) > 0) return "SOURCE_MISSING_DEDUCTION_OR_LOAN";
	const deductionBenefits = workbookHeadersForAliases(row, PAYROLL_FIELD_ALIASES.deductionBenefits);
	if (hasAnyWorkbookValue(row, deductionBenefits)) return "SOURCE_MISSING_DEDUCTION_OR_LOAN";
	const statutory = ["withholdingTax", "sssContribution", "philHealthContribution", "pagibigContribution"].some(
		(field) => Math.abs(numberValue(workbookValue(row, analysis, field).value) || 0) > 0,
	);
	return statutory ? "SOURCE_MISSING_STATUTORY_CONFIG" : "HRIS_LOGIC_MISMATCH_REPAIRABLE";
}

function classifyTotalReceivableMismatch(fields: PayrollFieldComparison[]): PayrollComparisonCategory {
	const receivableFieldNames = [
		"receivableOnlyAllowances",
		"postNetReceivableAdjustments",
		"netPay",
		"grossPay",
		"totalDeductions",
	];
	for (const fieldName of receivableFieldNames) {
		const field = findComparisonField(fields, fieldName);
		if (field && !["MATCH", "TOLERANCE_MATCH"].includes(field.category)) return field.category;
	}
	return "HRIS_LOGIC_MISMATCH_REPAIRABLE";
}

function classifyNetMismatch(fields: PayrollFieldComparison[]): PayrollComparisonCategory {
	const ranked: PayrollComparisonCategory[] = [
		"SOURCE_MISSING_APPROVED_OT",
		"SOURCE_MISSING_MANUAL_ADJUSTMENT",
		"SOURCE_MISSING_ALLOWANCE",
		"SOURCE_MISSING_DEDUCTION_OR_LOAN",
		"HRIS_LOGIC_MISMATCH_REPAIRABLE",
		"SOURCE_MISSING_STATUTORY_CONFIG",
	];
	for (const category of ranked) {
		if (fields.some((field) => field.category === category)) return category;
	}
	return "HRIS_LOGIC_MISMATCH_REPAIRABLE";
}

function chooseOverallCategory(fields: PayrollFieldComparison[]): PayrollComparisonCategory {
	if (!fields.length) return "MATCH";
	const ranked: PayrollComparisonCategory[] = [
		"SOURCE_MISSING_APPROVED_OT",
		"SOURCE_MISSING_MANUAL_ADJUSTMENT",
		"SOURCE_MISSING_ALLOWANCE",
		"SOURCE_MISSING_DEDUCTION_OR_LOAN",
		"PAYROLL_FORMULA_UNSUPPORTED",
		"HRIS_LOGIC_MISMATCH_REPAIRABLE",
		"SOURCE_MISSING_STATUTORY_CONFIG",
	];
	for (const category of ranked) {
		if (fields.some((field) => field.category === category)) return category;
	}
	return fields[0]?.category || "MATCH";
}

function findComparisonField(fields: PayrollFieldComparison[], fieldName: string) {
	return fields.find((field) => field.field === fieldName);
}

function isComparisonMismatch(field?: PayrollFieldComparison) {
	return Boolean(field && !["MATCH", "TOLERANCE_MATCH"].includes(field.category));
}

function markComparisonFieldAsTolerance(
	field: PayrollFieldComparison | undefined,
	likelyReason: string,
	repairRecommendation = "No repair needed.",
) {
	if (!field) return;
	field.category = "TOLERANCE_MATCH";
	field.likelyReason = likelyReason;
	field.repairRecommendation = repairRecommendation;
}

function firstMismatchCategory(
	fields: PayrollFieldComparison[],
	fieldNames: string[],
): PayrollComparisonCategory | null {
	for (const fieldName of fieldNames) {
		const field = findComparisonField(fields, fieldName);
		if (isComparisonMismatch(field)) return field!.category;
	}
	return null;
}

function normalizeBandaiComparisonFields(fields: PayrollFieldComparison[]) {
	const absent = findComparisonField(fields, "absentDeduction");
	const leave = findComparisonField(fields, "leavePay");
	const absentValue = numberValue(absent?.workbookValue) || 0;
	const leaveValue = numberValue(leave?.workbookValue) || 0;
	const hrisAbsent = numberValue(absent?.hrisValue) || 0;
	const hrisLeave = numberValue(leave?.hrisValue) || 0;
	if (
		isComparisonMismatch(absent) &&
		isComparisonMismatch(leave) &&
		Math.abs(absentValue - leaveValue) <= moneyTolerance &&
		Math.abs(hrisAbsent) <= moneyTolerance &&
		Math.abs(hrisLeave) <= moneyTolerance
	) {
		const reason =
			"Workbook presents paid leave as equal absent deduction plus leave earning; HRIS nets the same amount without separate offset lines.";
		markComparisonFieldAsTolerance(absent, reason);
		markComparisonFieldAsTolerance(leave, reason);
	}

	const approvedComponentFields = [
		"overtimeHours",
		"overtimePay",
		"restDayPay",
		"restDayOtPay",
		"specialHolidayPay",
		"legalHolidayPay",
		"premiumHolidayRestPay",
		"nightDiffPay",
	];
	const grossComponentFields = [
		"basicSalary",
		"absentDeduction",
		"lateUndertimeDeduction",
		...approvedComponentFields,
		"leavePay",
		"grossIncludedAllowances",
		"postNetReceivableAdjustments",
	];
	const deductionComponentFields = [
		"withholdingTax",
		"sssContribution",
		"philHealthContribution",
		"pagibigContribution",
		"loanDeductions",
		"uniformDeduction",
	];
	const approvedCategory = firstMismatchCategory(fields, approvedComponentFields);
	const grossCategory = firstMismatchCategory(fields, grossComponentFields);
	const deductionCategory = firstMismatchCategory(fields, deductionComponentFields);

	const gross = findComparisonField(fields, "grossPay");
	if (isComparisonMismatch(gross)) {
		gross!.category = approvedCategory || grossCategory || "HRIS_LOGIC_MISMATCH_REPAIRABLE";
	}
	const totalDeductions = findComparisonField(fields, "totalDeductions");
	if (isComparisonMismatch(totalDeductions)) {
		totalDeductions!.category = deductionCategory || "HRIS_LOGIC_MISMATCH_REPAIRABLE";
	}
	const net = findComparisonField(fields, "netPay");
	if (isComparisonMismatch(net)) {
		net!.category = approvedCategory || grossCategory || deductionCategory || "HRIS_LOGIC_MISMATCH_REPAIRABLE";
	}
	const totalReceivable = findComparisonField(fields, "totalReceivable");
	if (isComparisonMismatch(totalReceivable)) {
		const receivableCategory = firstMismatchCategory(fields, [
			"receivableOnlyAllowances",
			"postNetReceivableAdjustments",
		]);
		totalReceivable!.category =
			receivableCategory || approvedCategory || grossCategory || deductionCategory || "HRIS_LOGIC_MISMATCH_REPAIRABLE";
	}
}

function comparisonNumber(fields: PayrollFieldComparison[], fieldName: string, side: "workbook" | "hris") {
	const field = findComparisonField(fields, fieldName);
	return numberValue(side === "workbook" ? field?.workbookValue : field?.hrisValue) || 0;
}

function buildRateAnalysis(params: {
	fields: PayrollFieldComparison[];
	preview: any;
	calculationSource: string;
}): PayrollRateAnalysis {
	const fields = params.fields;
	const basicSalary = comparisonNumber(fields, "basicSalary", "workbook");
	const workbookWorkDays = comparisonNumber(fields, "regularDays", "workbook");
	const hrisWorkDays = comparisonNumber(fields, "regularDays", "hris");
	const workbookDailyRate = workbookWorkDays > 0 ? basicSalary / workbookWorkDays : 0;
	const hrisDailyRate = hrisWorkDays > 0 ? basicSalary / hrisWorkDays : 0;
	const bnpi313DailyRateFromPeriodBasic = (basicSalary * 2 * 12) / 313;
	const bnpi313MonthlyRateFromWorkbookDaily = workbookDailyRate * 313 / 12;
	const hrisHourlyRate = hrisDailyRate / 8;
	const hrisMinuteRate = hrisHourlyRate / 60;
	const workbookAbsentDeduction = comparisonNumber(fields, "absentDeduction", "workbook");
	const hrisAbsentDeduction = comparisonNumber(fields, "absentDeduction", "hris");
	const workbookLateDeduction = comparisonNumber(fields, "lateUndertimeDeduction", "workbook");
	const hrisLateDeduction = comparisonNumber(fields, "lateUndertimeDeduction", "hris");
	const workbookOvertimePay = comparisonNumber(fields, "overtimePay", "workbook");
	const hrisOvertimePay = comparisonNumber(fields, "overtimePay", "hris");
	const workbookPremiumHolidayRestPay = comparisonNumber(fields, "premiumHolidayRestPay", "workbook");
	const hrisPremiumHolidayRestPay = comparisonNumber(fields, "premiumHolidayRestPay", "hris");
	const workbookNightDiffPay = comparisonNumber(fields, "nightDiffPay", "workbook");
	const hrisNightDiffPay = comparisonNumber(fields, "nightDiffPay", "hris");
	const workbookLeavePay = comparisonNumber(fields, "leavePay", "workbook");
	const hrisLeavePay = comparisonNumber(fields, "leavePay", "hris");
	const workbookGrossIncludedAllowance = comparisonNumber(fields, "grossIncludedAllowances", "workbook");
	const hrisGrossIncludedAllowance = comparisonNumber(fields, "grossIncludedAllowances", "hris");
	const workbookGross = comparisonNumber(fields, "grossPay", "workbook");
	const hrisGross = comparisonNumber(fields, "grossPay", "hris");
	const workbookGrossFormula =
		basicSalary -
		workbookAbsentDeduction -
		workbookLateDeduction +
		workbookOvertimePay +
		workbookPremiumHolidayRestPay +
		workbookNightDiffPay +
		workbookLeavePay +
		workbookGrossIncludedAllowance;
	const hrisGrossFormula =
		basicSalary -
		hrisAbsentDeduction -
		hrisLateDeduction +
		hrisOvertimePay +
		hrisPremiumHolidayRestPay +
		hrisNightDiffPay +
		hrisLeavePay +
		hrisGrossIncludedAllowance;
	const grossComparedDelta =
		(workbookGross - hrisGross) -
		((comparisonNumber(fields, "basicSalary", "workbook") - comparisonNumber(fields, "basicSalary", "hris")) +
			(workbookOvertimePay - hrisOvertimePay) +
			(workbookPremiumHolidayRestPay - hrisPremiumHolidayRestPay) +
			(workbookNightDiffPay - hrisNightDiffPay) +
			(workbookLeavePay - hrisLeavePay) +
			(workbookGrossIncludedAllowance - hrisGrossIncludedAllowance));

	return {
		formulaSource: params.calculationSource,
		basicSalary: roundToCentavo(basicSalary),
		workbookWorkDays: roundToCentavo(workbookWorkDays),
		hrisWorkDays: roundToCentavo(hrisWorkDays),
		workbookDailyRate: roundToCentavo(workbookDailyRate),
		hrisDailyRate: roundToCentavo(hrisDailyRate),
		bnpi313DailyRateFromPeriodBasic: roundToCentavo(bnpi313DailyRateFromPeriodBasic),
		bnpi313MonthlyRateFromWorkbookDaily: roundToCentavo(bnpi313MonthlyRateFromWorkbookDaily),
		workbookDailyRateMatchesBnpi313: Math.abs(workbookDailyRate - bnpi313DailyRateFromPeriodBasic) <= 0.05,
		hrisHourlyRate: roundToCentavo(hrisHourlyRate),
		hrisMinuteRate: roundToCentavo(hrisMinuteRate),
		workbookAbsentDaysImplied: workbookDailyRate > 0 ? roundToCentavo(workbookAbsentDeduction / workbookDailyRate) : 0,
		hrisAbsentDays: Number(params.preview?.metadata?.daysAbsent || 0),
		workbookLateMinutesImplied: workbookDailyRate > 0 ? roundToCentavo(workbookLateDeduction / (workbookDailyRate / 8 / 60)) : 0,
		hrisLateMinutes: roundToCentavo(Number(params.preview?.metadata?.totalLateHours || 0) * 60),
		workbookGrossFormula: roundToCentavo(workbookGrossFormula),
		hrisGrossFormula: roundToCentavo(hrisGrossFormula),
		grossFormulaDelta: roundToCentavo(workbookGrossFormula - hrisGrossFormula),
		grossResidualAfterComparedComponents: roundToCentavo(grossComparedDelta),
	};
}

function durationToMinutes(value?: string | null): number {
	if (!value || typeof value !== "string" || !value.includes(":")) return 0;
	const [hours, minutes] = value.split(":").map(Number);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
	return hours * 60 + minutes;
}

function aggregateTimesheet(timesheet: any): Record<string, number | string | null> {
	const lines = Array.isArray(timesheet?.timesheetlines) ? timesheet.timesheetlines : [];
	const statusCounts: Record<string, number> = {};
	let overtimeMinutes = 0;
	let lateMinutes = 0;
	let earlyOutMinutes = 0;
	for (const line of lines) {
		const status = String(line.status || "UNKNOWN").toUpperCase();
		statusCounts[status] = (statusCounts[status] || 0) + 1;
		overtimeMinutes += durationToMinutes(line.overtimeHours);
		lateMinutes += durationToMinutes(line.lateHours);
		earlyOutMinutes += durationToMinutes(line.earlyOutHours);
	}
	return {
		totalEffectiveLines: lines.length,
		overtimeHours: Number((overtimeMinutes / 60).toFixed(2)),
		lateHours: Number((lateMinutes / 60).toFixed(2)),
		earlyOutHours: Number((earlyOutMinutes / 60).toFixed(2)),
		statusCounts: JSON.stringify(statusCounts),
		headerTotalDays: timesheet.totalDays ?? null,
		headerTotalHoursWorked: timesheet.totalHoursWorked ?? null,
		headerTotalOvertimeHours: timesheet.totalOvertimeHours ?? null,
		headerTotalLateHours: timesheet.totalLateHours ?? null,
		headerTotalEarlyOutHours: timesheet.totalEarlyOutHours ?? null,
	};
}

function buildDiagnosticPreviewFromTimesheet(params: {
	timesheet: any;
	payrollPeriod: any;
}): any | null {
	const calculator = params.payrollPeriod?.calculator;
	const employee = params.timesheet?.employee;
	const lines = Array.isArray(params.timesheet?.timesheetlines) ? params.timesheet.timesheetlines : [];
	if (!calculator || !employee || !lines.length || !(employee.basicSalary > 0)) return null;

	let totalWorkDays = 0;
	let daysAbsent = 0;
	let overtimeMinutes = 0;
	let lateMinutes = 0;
	let earlyOutMinutes = 0;

	for (const line of lines) {
		const status = String(line.status || "").toUpperCase();
		if (status !== "REST_DAY") {
			totalWorkDays += 1;
			if (status === "ABSENT") daysAbsent += 1;
		}
		overtimeMinutes += durationToMinutes(line.overtimeHours);
		lateMinutes += durationToMinutes(line.lateHours);
		earlyOutMinutes += durationToMinutes(line.earlyOutHours);
	}

	const periodBasic = employee.basicSalary || 0;
	const workingHoursPerDay = 8;
	const dailyRate = totalWorkDays > 0 ? periodBasic / totalWorkDays : 0;
	const hourlyRate = dailyRate / workingHoursPerDay;
	const minuteRate = hourlyRate / 60;
	const rateMultipliers = calculator.rateMultipliers as any;
	const ordinaryOtMultiplier = getRateMultiplierForDiagnostic(rateMultipliers, "ordinaryDay", "ot") ?? 1;
	const overtimeHours = overtimeMinutes / 60;
	const lateHours = lateMinutes / 60;
	const earlyOutHours = earlyOutMinutes / 60;
	const absentDeduction = roundToCentavo(daysAbsent * dailyRate);
	const lateDeduction = roundToCentavo(lateMinutes * minuteRate);
	const earlyOutDeduction = roundToCentavo(earlyOutMinutes * minuteRate);
	const bandaiPayrollBuckets = calculateDiagnosticBandaiApprovedBucketPay(lines, periodBasic);
	const overtimePay = bandaiPayrollBuckets
		? bandaiPayrollBuckets.overtimePay
		: roundToCentavo(overtimeHours * hourlyRate * ordinaryOtMultiplier);
	const nightDiffPay = bandaiPayrollBuckets?.nightDiffPay || 0;
	const holidayPay = bandaiPayrollBuckets?.holidayPay || 0;
	const basicPay = roundToCentavo(periodBasic - absentDeduction - lateDeduction - earlyOutDeduction);
	const grossPay = roundToCentavo(basicPay + overtimePay + nightDiffPay + holidayPay);

	const contributionSplitFactor = resolveDiagnosticContributionSplitFactor({
		payFrequency: employee.payFrequency,
		periodNumber: params.payrollPeriod?.periodNumber,
		payrollPeriodMetadata: params.payrollPeriod?.generationMetadata,
	});
	let contributionBaseAmount = grossPay;
	if (employee.payFrequency === "SEMI_MONTHLY") contributionBaseAmount = grossPay * 2;
	const monthlyContributions = calculateTotalContributions(
		contributionBaseAmount,
		calculator.sssRates as any,
		calculator.philHealthRates as any,
		calculator.pagibigRates as any,
	);
	const periodContributions = {
		sss: roundToCentavo(monthlyContributions.sss * contributionSplitFactor),
		philHealth: roundToCentavo(monthlyContributions.philHealth * contributionSplitFactor),
		pagIbig: roundToCentavo(monthlyContributions.pagIbig * contributionSplitFactor),
	};
	const periodTaxableIncome =
		grossPay -
		(periodContributions.sss + periodContributions.philHealth + periodContributions.pagIbig);
	const withholdingTax = calculateWithholdingTax(
		periodTaxableIncome,
		calculator.taxRates as any[],
		employee.payFrequency === "SEMI_MONTHLY",
	);
	const totalDeductions = roundToCentavo(
		periodContributions.sss +
			periodContributions.philHealth +
			periodContributions.pagIbig +
			withholdingTax,
	);

	return {
		employeeCode: employee.employeeId,
		name:
			`${employee.person?.personalInfo?.firstName || ""} ${employee.person?.personalInfo?.lastName || ""}`.trim() ||
			employee.employeeId,
		basicSalary: periodBasic,
		timesheetId: params.timesheet.id,
		basicPay,
		overtimePay,
		nightDiffPay,
		holidayPay,
		grossPay,
		totalDeductions,
		netPay: roundToCentavo(grossPay - totalDeductions),
		allowances: 0,
		loanDeductions: 0,
		deductions: {
			sssContribution: periodContributions.sss,
			philHealthContribution: periodContributions.philHealth,
			pagibigContribution: periodContributions.pagIbig,
			taxAmount: roundToCentavo(withholdingTax),
			absentDeduction,
			lateDeduction,
			earlyOutDeduction,
		},
		metadata: {
			diagnosticOnly: true,
			source:
				params.timesheet.status === "APPROVED"
					? "approved effective Timesheetline diagnostic dry-run; row excluded by production preview filter"
					: "non-approved effective Timesheetline diagnostic dry-run",
			daysAbsent,
			totalWorkDays,
			totalLateHours: roundToCentavo(lateHours),
			totalEarlyOutHours: roundToCentavo(earlyOutHours),
			totalOvertimeHours: roundToCentavo(overtimeHours),
			overtimeRate: roundToCentavo(hourlyRate * ordinaryOtMultiplier),
			...(bandaiPayrollBuckets ? { bandaiPayrollBuckets } : {}),
		},
	};
}

const DIAGNOSTIC_BANDAI_DIRECT_ANNUAL_WORK_DAYS = 313;
const DIAGNOSTIC_BANDAI_SOURCE_DAILY_RATE_MAX = 700;

function calculateDiagnosticBandaiApprovedBucketPay(lines: any[], periodBasic: number) {
	if (!(periodBasic > 0)) return null;
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
		const repair = asRecord(line?.metadata?.bandaiPayrollSourceRepair);
		const bucket = asRecord(repair.approvedBuckets);
		if (!Object.keys(bucket).length) continue;
		sourceDayCount += 1;
		totals.regularDays += numberValue(bucket.regularDays) || 0;
		totals.regOtHrs += numberValue(bucket.regOtHrs) || 0;
		totals.rdHrs += numberValue(bucket.rdHrs) || 0;
		totals.rdOtHrs += numberValue(bucket.rdOtHrs) || 0;
		totals.spclHrs += numberValue(bucket.spclHrs) || 0;
		totals.spclOtHrs += numberValue(bucket.spclOtHrs) || 0;
		totals.rholHrs += numberValue(bucket.rholHrs) || 0;
		totals.rholOtHrs += numberValue(bucket.rholOtHrs) || 0;
		totals.regNdHrs += numberValue(bucket.regNdHrs) || 0;
		totals.nightDiffPayAmount += numberValue(bucket.nightDiffPayAmount) || 0;
	}

	if (!sourceDayCount) return null;
	const sourceDailyRate = totals.regularDays > 0 ? periodBasic / totals.regularDays : 0;
	const useSourceDailyRate =
		sourceDailyRate > 0 && sourceDailyRate <= DIAGNOSTIC_BANDAI_SOURCE_DAILY_RATE_MAX;
	const dailyRate = useSourceDailyRate
		? sourceDailyRate
		: (periodBasic * 24) / DIAGNOSTIC_BANDAI_DIRECT_ANNUAL_WORK_DAYS;
	const hourlyRate = dailyRate / 8;
	const specialHolidayWorkMultiplier = useSourceDailyRate ? 1.3 : 0.3;
	const overtimePay = roundToCentavo(totals.regOtHrs * hourlyRate * 1.25);
	const restDayPay = roundToCentavo(totals.rdHrs * hourlyRate * 1.3);
	const restDayOtPay = roundToCentavo(totals.rdOtHrs * hourlyRate * 1.69);
	const specialHolidayPay = roundToCentavo(
		totals.spclHrs * hourlyRate * specialHolidayWorkMultiplier +
			totals.spclOtHrs * hourlyRate * 1.69,
	);
	const legalHolidayPay = roundToCentavo(
		totals.rholHrs * hourlyRate * 1 + totals.rholOtHrs * hourlyRate * 2.6,
	);
	const sourceNightDiffPay = roundToCentavo(totals.nightDiffPayAmount);
	const nightDiffPay =
		sourceNightDiffPay > 0 ? sourceNightDiffPay : roundToCentavo(totals.regNdHrs * hourlyRate * 0.1);
	const holidayPay = roundToCentavo(restDayPay + restDayOtPay + specialHolidayPay + legalHolidayPay);

	return {
		source: "Timesheetline.metadata.bandaiPayrollSourceRepair.approvedBuckets",
		formula: useSourceDailyRate
			? "BANDAI_SOURCE_DAILY_APPROVED_BUCKETS"
			: "BNPI_DIRECT_313_APPROVED_BUCKETS",
		sourceDayCount,
		sourceRegularDays: roundToCentavo(totals.regularDays),
		sourceDailyRate: roundToCentavo(sourceDailyRate),
		dailyRate: roundToCentavo(dailyRate),
		hourlyRate: roundToCentavo(hourlyRate),
		specialHolidayWorkMultiplier,
		hours: totals,
		overtimePay,
		restDayPay,
		restDayOtPay,
		specialHolidayPay,
		legalHolidayPay,
		nightDiffPay,
		holidayPay,
	};
}

function resolveDiagnosticContributionSplitFactor(params: {
	payFrequency?: string | null;
	periodNumber?: number | null;
	payrollPeriodMetadata?: unknown;
}) {
	const periodNumber = params.periodNumber || 1;
	const metadata = asPlainRecord(params.payrollPeriodMetadata);
	const schedule = asPlainRecord(
		metadata.statutoryContributionSchedule ?? metadata.contributionSchedule,
	);
	const configuredFactor = schedule[`period${periodNumber}`] ?? schedule[String(periodNumber)];

	if (typeof configuredFactor === "number" && configuredFactor >= 0) return configuredFactor;
	if (params.payFrequency === "SEMI_MONTHLY") return periodNumber === 1 ? 1 : 0;
	return 1;
}

function asPlainRecord(value: unknown): Record<string, any> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, any>)
		: {};
}

function buildPayrollBenefitAmountsByEmployeeCode(benefitRows: any[]) {
	const totals = new Map<
		string,
		{
			total: number;
			grossIncluded: number;
			nonTaxableGrossIncluded: number;
			receivableOnly: number;
			leavePay: number;
			netAdjustment: number;
		}
	>();
	for (const row of benefitRows) {
		const employeeCode = row.employee?.employeeId;
		if (!employeeCode) continue;
		const amount = Number(row.amount ?? row.totalAmount ?? 0);
		if (!Number.isFinite(amount) || amount <= 0) continue;
		const current = totals.get(employeeCode) || {
			total: 0,
			grossIncluded: 0,
			nonTaxableGrossIncluded: 0,
			receivableOnly: 0,
			leavePay: 0,
			netAdjustment: 0,
		};
		const action = String(row.benefitType?.reconciliationAction || "").toUpperCase();
		const code = String(row.benefitType?.code || "").toUpperCase();
		if (code !== "LVP") {
			current.total = roundToCentavo(current.total + amount);
		}
		if (action === "GROSS_INCLUDED" && code !== "LVP") {
			current.grossIncluded = roundToCentavo(current.grossIncluded + amount);
			if (row.benefitType?.isTaxable === false) {
				current.nonTaxableGrossIncluded = roundToCentavo(
					current.nonTaxableGrossIncluded + amount,
				);
			}
		} else if (action === "NET_ADJUSTMENT") {
			current.netAdjustment = roundToCentavo(current.netAdjustment + amount);
		} else if (action === "RECEIVABLE_ONLY") {
			current.receivableOnly = roundToCentavo(current.receivableOnly + amount);
		}
		if (code === "LVP") {
			current.leavePay = roundToCentavo(current.leavePay + amount);
		}
		totals.set(employeeCode, current);
	}
	return totals;
}

function buildPayrollLoanAmountsByEmployeeCode(loanRows: any[]) {
	const totals = new Map<string, number>();
	for (const row of loanRows) {
		const employeeCode = row.employee?.employeeId;
		if (!employeeCode) continue;
		const amount = Number(row.monthlyPayment ?? row.totalAmount ?? 0);
		if (!Number.isFinite(amount) || amount <= 0) continue;
		totals.set(employeeCode, roundToCentavo((totals.get(employeeCode) || 0) + amount));
	}
	return totals;
}

function buildPayrollDeductionBenefitAmountsByEmployeeCode(benefitRows: any[]) {
	const totals = new Map<string, { total: number; uniform: number }>();
	for (const row of benefitRows) {
		const employeeCode = row.employee?.employeeId;
		if (!employeeCode) continue;
		const amount = Number(row.amount ?? row.totalAmount ?? 0);
		if (!Number.isFinite(amount) || amount <= 0) continue;
		const current = totals.get(employeeCode) || { total: 0, uniform: 0 };
		current.total = roundToCentavo(current.total + amount);
		const code = String(row.benefitType?.code || "").toUpperCase();
		const name = String(row.benefitType?.name || "").toUpperCase();
		if (code === "UFD" || name.includes("UNIFORM")) {
			current.uniform = roundToCentavo(current.uniform + amount);
		}
		totals.set(employeeCode, current);
	}
	return totals;
}

function getRateMultiplierForDiagnostic(
	rateMultipliers: any,
	dayType: string,
	payType: "work" | "ot" | "nd" | "ndot",
): number | null {
	return rateMultipliers?.[dayType]?.[payType] || null;
}

export function writeWorkbookPreviewMarkdown(analysis: BandaiWorkbookAnalysis): string {
	const lines: string[] = [];
	lines.push("# Bandai Payroll Workbook Preview", "");
	lines.push(`- Workbook: ${analysis.workbookPath}`);
	lines.push(`- Unlock: ${analysis.unlock.succeeded ? "succeeded" : "failed"} (${analysis.unlock.method})`);
	if (analysis.unlockedWorkbookPath) lines.push(`- Unlocked copy: ${analysis.unlockedWorkbookPath}`);
	if (analysis.detectedCutoff) {
		lines.push(
			`- Detected cutoff: ${analysis.detectedCutoff.startDate} to ${analysis.detectedCutoff.endDate}`,
		);
		lines.push(`- Pay date: ${analysis.detectedCutoff.payDate || "not detected"}`);
	}
	lines.push(`- Parsed employee rows: ${analysis.rows.length}`, "");
	lines.push("## Sheets", "");
	for (const sheet of analysis.sheets) {
		lines.push(`### ${sheet.name}`);
		lines.push(`- Hidden: ${sheet.hidden ? "yes" : "no"}`);
		lines.push(`- Range: ${sheet.ref || "unknown"}`);
		lines.push(`- Merges: ${sheet.merges.length}`);
		lines.push(
			`- Header candidates: ${sheet.detectedHeaderRows
				.map((row) => `row ${row.rowNumber} (score ${row.score})`)
				.join(", ") || "none"}`,
		);
		lines.push(
			`- Formula columns: ${sheet.formulaColumns
				.slice(0, 20)
				.map((column) => `${column.column} ${column.header}`)
				.join(", ") || "none detected"}`,
		);
		lines.push("");
	}
	lines.push("## Payroll Fields", "");
	for (const [field, header] of Object.entries(analysis.payrollFieldMap)) {
		lines.push(`- ${field}: ${header || "not detected"}`);
	}
	lines.push("", "## Row Preview", "");
	for (const row of analysis.rows.slice(0, 15)) {
		const gross = workbookValue(row, analysis, "grossPay").value;
		const net = workbookValue(row, analysis, "netPay").value;
		lines.push(`- ${row.employeeCode} ${row.employeeName}: gross=${gross}, net=${net} (${row.sheetName} row ${row.rowNumber})`);
	}
	return `${lines.join("\n")}\n`;
}

function summarizeWorkbookBreakdown(
	comparison: PayrollComparisonResult,
	fieldName: string,
	category: PayrollComparisonCategory,
) {
	const totals = new Map<string, { rows: number; total: number; examples: string[] }>();
	for (const row of comparison.rows) {
		const field = row.fields.find((entry) => entry.field === fieldName && entry.category === category);
		if (!field?.sourceBreakdown?.length) continue;
		for (const source of field.sourceBreakdown) {
			const entry = totals.get(source.label) || { rows: 0, total: 0, examples: [] };
			entry.rows += 1;
			entry.total = Number((entry.total + source.value).toFixed(2));
			if (entry.examples.length < 3) {
				entry.examples.push(`${row.employeeCode} ${source.sourceCell || ""}`.trim());
			}
			totals.set(source.label, entry);
		}
	}
	return Array.from(totals.entries())
		.map(([label, value]) => ({ label, ...value }))
		.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

function topPartialMatchRows(comparison: PayrollComparisonResult, limit: number) {
	return comparison.rows
		.map((row) => {
			const matched = row.fields.filter((field) =>
				["MATCH", "TOLERANCE_MATCH"].includes(field.category),
			).length;
			const mismatched = row.fields.length - matched;
			return { row, matched, mismatched };
		})
		.filter((entry) => entry.matched > 0 && entry.mismatched > 0)
		.sort((a, b) => b.matched - a.matched || a.mismatched - b.mismatched)
		.slice(0, limit);
}

export function writeComparisonMarkdown(comparison: PayrollComparisonResult): string {
	const lines: string[] = [];
	const parsedSheets = Array.from(new Set(comparison.rows.map((row) => row.sheetName))).sort();
	const fieldCategories: Record<string, number> = {};
	const fieldByCategory: Record<string, number> = {};
	const timesheetStatusCounts: Record<string, number> = {};
	const allowanceSources = summarizeWorkbookBreakdown(
		comparison,
		"allowances",
		"SOURCE_MISSING_ALLOWANCE",
	);
	const loanSources = summarizeWorkbookBreakdown(
		comparison,
		"loanDeductions",
		"SOURCE_MISSING_DEDUCTION_OR_LOAN",
	);
	const rowsWithCategory = (category: PayrollComparisonCategory) =>
		comparison.rows.filter((row) =>
			row.overallCategory === category ||
			row.fields.some((field) => field.category === category),
		).length;
	for (const row of comparison.rows) {
		const timesheetStatus = row.employeeMatch === false ? "NO_EMPLOYEE" : row.timesheetStatus || "NO_TIMESHEET";
		timesheetStatusCounts[timesheetStatus] = (timesheetStatusCounts[timesheetStatus] || 0) + 1;
		for (const field of row.fields) {
			fieldCategories[field.category] = (fieldCategories[field.category] || 0) + 1;
			const key = `${field.category} / ${field.field}`;
			fieldByCategory[key] = (fieldByCategory[key] || 0) + 1;
		}
	}
	lines.push("# Bandai Payroll Dry-Run Comparison", "");
	lines.push(`- Workbook: ${comparison.metadata.workbookPath}`);
	if (comparison.metadata.unlockedWorkbookPath) {
		lines.push(`- Unlocked workbook: ${comparison.metadata.unlockedWorkbookPath}`);
	}
	lines.push(`- DB: ${comparison.metadata.dbName || "unknown"}`);
	lines.push(`- PG_DATABASE_URL used: ${comparison.metadata.dbUrl}`);
	if (comparison.metadata.detectedCutoff) {
		lines.push(
			`- Detected cutoff: ${comparison.metadata.detectedCutoff.startDate} to ${comparison.metadata.detectedCutoff.endDate}`,
		);
	}
	lines.push(
		`- Payroll period: ${
			comparison.metadata.payrollPeriod
				? `${comparison.metadata.payrollPeriod.code || comparison.metadata.payrollPeriod.id} (${comparison.metadata.payrollPeriod.status})`
				: "not found"
		}`,
	);
	lines.push(`- Dry-run only: ${comparison.metadata.dryRunOnly ? "yes" : "no"}`);
	lines.push(
		`- Run Payroll reuse: ${comparison.metadata.runPayrollReuse.usedExistingPreviewHelper ? "used" : "blocked"} ${comparison.metadata.runPayrollReuse.helper}`,
		"",
	);
	lines.push("## Counts", "");
	lines.push(`- Sheets parsed: ${parsedSheets.join(", ") || "none"}`);
	lines.push(`- Workbook rows parsed: ${comparison.summary.workbookRows}`);
	lines.push(`- Employees matched: ${comparison.summary.employeesMatched}`);
	lines.push(`- Approved timesheets found: ${comparison.summary.approvedTimesheetsFound}`);
	lines.push(`- Exact row matches: ${comparison.summary.exactMatches}`);
	lines.push(`- Tolerance row matches: ${comparison.summary.toleranceMatches}`);
	lines.push(`- Mismatch/skipped rows: ${comparison.summary.mismatches}`);
	lines.push(`- Skipped rows: ${comparison.summary.skippedRows}`, "");
	lines.push("## Timesheet Calculation Coverage", "");
	for (const [status, count] of Object.entries(timesheetStatusCounts).sort()) {
		lines.push(`- ${status}: ${count}`);
	}
	lines.push(
		"- Approved rows use the production payroll preview. Non-approved rows, when present with effective lines, use a diagnostic dry-run from effective `Timesheetline` rows so calculation differences can still be inspected without marking them payroll-ready.",
		"",
	);
	lines.push("## Source Gap Summary", "");
	lines.push(`- Rows requiring approved OT/OTR source: ${rowsWithCategory("SOURCE_MISSING_APPROVED_OT")}`);
	lines.push(`- Rows requiring allowance source import: ${rowsWithCategory("SOURCE_MISSING_ALLOWANCE")}`);
	lines.push(`- Rows requiring deduction or loan source import: ${rowsWithCategory("SOURCE_MISSING_DEDUCTION_OR_LOAN")}`);
	lines.push(`- Rows requiring withholding-tax/statutory source verification: ${rowsWithCategory("SOURCE_MISSING_STATUTORY_CONFIG")}`);
	lines.push(`- Rows with timesheet source missing: ${rowsWithCategory("TIMESHEET_NOT_FOUND")}`);
	lines.push(`- Rows with employee source missing: ${rowsWithCategory("EMPLOYEE_NOT_FOUND")}`);
	lines.push(
		`- Repair-candidate field comparisons after source gaps are resolved: ${fieldCategories.HRIS_LOGIC_MISMATCH_REPAIRABLE || 0}`,
		"",
	);
	lines.push("## Reconciliation Repair Plan", "");
	lines.push(
		"- Guardrail: payroll preview must keep reading approved `Timesheet` plus effective `Timesheetline` snapshots for this cutoff. Do not change payroll math just to match workbook totals while OT, allowances, statutory config, loans, or missing approved timesheets are still classified as source gaps.",
	);
	lines.push(
		"- First repair/import source gaps: approved OT/OTR, allowance/benefit earnings, payroll-only loans/deductions, statutory configuration/source splits, then missing approved timesheets.",
	);
	lines.push(
		"- Only after those sources exist should `HRIS_LOGIC_MISMATCH_REPAIRABLE` rows be treated as calculation or timesheet-line defects.",
	);
	lines.push(
		"- Do not repair `grossPay`, `totalDeductions`, or `netPay` directly. They are downstream rollups; fix the classified component that feeds them.",
		"",
	);
	lines.push("### Top Partial Matches", "");
	for (const entry of topPartialMatchRows(comparison, 5)) {
		lines.push(
			`- ${entry.row.employeeCode} ${entry.row.employeeName}: ${entry.matched} matched fields, ${entry.mismatched} remaining differences (${entry.row.overallCategory})`,
		);
	}
	lines.push("", "### Allowance Columns To Import", "");
	for (const source of allowanceSources.slice(0, 10)) {
		lines.push(
			`- ${source.label}: ${source.rows} rows, workbook total ${source.total.toFixed(2)}; examples ${source.examples.join(", ")}`,
		);
	}
	if (!allowanceSources.length) lines.push("- No per-column allowance breakdown was captured. Re-run the dry-run script after this helper change.");
	lines.push("", "### Loan/Deduction Columns To Import", "");
	for (const source of loanSources.slice(0, 10)) {
		lines.push(
			`- ${source.label}: ${source.rows} rows, workbook total ${source.total.toFixed(2)}; examples ${source.examples.join(", ")}`,
		);
	}
	if (!loanSources.length) lines.push("- No per-column loan/deduction breakdown was captured. Re-run the dry-run script after this helper change.");
	lines.push("");
	lines.push("## Mismatch Categories", "");
	for (const [category, count] of Object.entries(comparison.summary.byCategory).sort()) {
		lines.push(`- ${category}: ${count}`);
	}
	lines.push("", "## Field-Level Matches", "");
	for (const [key, count] of Object.entries(fieldByCategory)
		.filter(([key]) => key.startsWith("MATCH / ") || key.startsWith("TOLERANCE_MATCH / "))
		.sort((a, b) => b[1] - a[1])
		.slice(0, 20)) {
		lines.push(`- ${key}: ${count}`);
	}
	lines.push("", "## Top Reasons", "");
	for (const [key, count] of Object.entries(fieldByCategory)
		.filter(([key]) => !key.startsWith("MATCH / ") && !key.startsWith("TOLERANCE_MATCH / "))
		.sort((a, b) => b[1] - a[1])
		.slice(0, 20)) {
		lines.push(`- ${key}: ${count}`);
	}
	lines.push("", "## Statutory Config Check", "");
	lines.push(
		"- SSS: official SSS contribution guidance states the 15% contribution rate effective January 1, 2025, with MSC up to PHP 35,000; HRIS calculator config should be checked against the active table before treating SSS mismatches as code bugs. Source: https://www.sss.gov.ph/pay-contribution/",
	);
	lines.push(
		"- PhilHealth: PhilHealth Advisory 2025-0002 keeps the 5.0% premium rate with PHP 10,000 floor and PHP 100,000 ceiling; employee/employer split should be verified against the calculator config. Source: https://www.philhealth.gov.ph/advisories/2025/PA2025-0002.pdf",
	);
	lines.push(
		"- Pag-IBIG: Pag-IBIG Fund Circular No. 460 sets the maximum fund salary increase effective February 2024; HRIS currently needs config/source verification before parity claims. Source: https://naro.law.upd.edu.ph/documents/3217",
	);
	lines.push(
		"- BIR: RR 11-2018 Annex E is the current withholding table effective January 1, 2023 onward, including semi-monthly brackets. Source: https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf",
	);
	lines.push("", "## Sample Mismatches", "");
	for (const row of comparison.rows.filter((entry) => entry.overallCategory !== "MATCH").slice(0, 25)) {
		lines.push(`### ${row.employeeCode} ${row.employeeName} (${row.overallCategory})`);
		lines.push(`- Recommendation: ${row.recommendation}`);
		for (const field of row.fields.filter((entry) => entry.category !== "MATCH" && entry.category !== "TOLERANCE_MATCH").slice(0, 8)) {
			lines.push(
				`- ${field.field}: workbook=${field.workbookValue}, HRIS=${field.hrisValue}, diff=${field.difference ?? ""}, category=${field.category}, cell=${field.sourceCell || field.sourceColumn || ""}`,
			);
		}
		lines.push("");
	}
	lines.push("## Candidate Missing Source Files", "");
	for (const file of comparison.candidateSourceFiles.slice(0, 40)) {
		lines.push(`- ${file}`);
	}
	return `${lines.join("\n")}\n`;
}

function topEntries(record: Record<string, { rows: number; total: number }>, limit = 12) {
	return Object.entries(record)
		.map(([label, value]) => ({ label, ...value }))
		.sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
		.slice(0, limit);
}

function topEmployees(
	record: SourceWorkbookSummary["byEmployee"] | OvertimeDetailsSummary["byEmployee"],
	valueSelector: (value: any) => number,
	limit = 12,
) {
	return Object.entries(record)
		.map(([employeeCode, value]) => ({
			employeeCode,
			name: (value as any).name || "",
			rows: (value as any).rows || 0,
			total: money(valueSelector(value)),
		}))
		.sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
		.slice(0, limit);
}

export function writeBandaiPayrollSourceEvidenceMarkdown(evidence: BandaiPayrollSourceEvidence): string {
	const lines: string[] = [];
	lines.push("# Bandai Payroll Source-Only Dry Run", "");
	lines.push(`- Payroll workbook: ${evidence.metadata.workbookPath}`);
	if (evidence.metadata.detectedCutoff) {
		lines.push(`- Cutoff: ${evidence.metadata.detectedCutoff.startDate} to ${evidence.metadata.detectedCutoff.endDate}`);
		lines.push(`- Pay date: ${evidence.metadata.detectedCutoff.payDate || "not detected"}`);
	}
	lines.push(`- Payroll workbook rows: ${evidence.payrollWorkbookTotals.rows}`);
	lines.push(`- Payroll workbook employees: ${evidence.payrollWorkbookTotals.employees}`, "");
	lines.push("## Source Coverage", "");
	lines.push("| Component | Workbook total | Source total | Source minus workbook | Source | Note |");
	lines.push("| --- | ---: | ---: | ---: | --- | --- |");
	for (const row of evidence.sourceCoverage) {
		lines.push(`| ${row.component} | ${row.workbookTotal.toFixed(2)} | ${row.sourceTotal.toFixed(2)} | ${row.difference.toFixed(2)} | ${row.source} | ${row.note} |`);
	}
	lines.push("");
	lines.push("## Payroll Workbook Component Totals", "");
	for (const [component, value] of Object.entries(evidence.payrollWorkbookTotals.components).sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total)).slice(0, 30)) {
		lines.push(`- ${component}: rows ${value.rows}, total ${value.total.toFixed(2)}`);
	}

	const writeSource = (title: string, source?: SourceWorkbookSummary) => {
		lines.push("", `## ${title}`, "");
		if (!source) {
			lines.push("- Not provided.");
			return;
		}
		lines.push(`- File: ${source.filePath}`);
		lines.push(`- Rows with amount: ${source.totalRows}`);
		lines.push(`- Employees: ${source.employeeCount}`);
		lines.push(`- Total parsed amount: ${source.totalAmount.toFixed(2)}`, "");
		for (const sheet of source.sheets.filter((entry) => entry.rows > 0).slice(0, 20)) {
			lines.push(`### ${sheet.name}`);
			lines.push(`- Rows: ${sheet.rows}`);
			lines.push(`- Amount columns: ${sheet.amountColumns.join(", ") || "none detected"}`);
			const entries = topEntries(sheet.byCodeOrDetail, 8);
			if (entries.length) {
				lines.push("- Top source labels:");
				for (const entry of entries) {
					lines.push(`  - ${entry.label}: rows ${entry.rows}, total ${entry.total.toFixed(2)}`);
				}
			}
			if (sheet.sampleRows.length) {
				lines.push("- Sample rows:");
				for (const sample of sheet.sampleRows.slice(0, 3)) {
					lines.push(`  - ${sample.employeeCode} ${sample.employeeName}: ${sample.source} = ${Number(sample.amount).toFixed(2)} (row ${sample.rowNumber})`);
				}
			}
			lines.push("");
		}
		lines.push("### Top Employees");
		for (const employee of topEmployees(source.byEmployee, (value) => value.total, 12)) {
			lines.push(`- ${employee.employeeCode} ${employee.name}: rows ${employee.rows}, total ${employee.total.toFixed(2)}`);
		}
	};

	writeSource("May 15 Reference Workbook", evidence.referenceWorkbook);
	writeSource("Compensation Mass Upload", evidence.compensationUpload);
	writeSource("Deduction Mass Upload", evidence.deductionUpload);

	lines.push("", "## Overtime Detail Evidence", "");
	if (!evidence.overtimeDetails) {
		lines.push("- Not provided.");
	} else {
		const overtime = evidence.overtimeDetails;
		lines.push(`- File: ${overtime.filePath}`);
		lines.push(`- Sheet: ${overtime.sheetName}`);
		if (overtime.dateRange) lines.push(`- Parsed cutoff window: ${overtime.dateRange.startDate} to ${overtime.dateRange.endDate}`);
		lines.push(`- Rows in cutoff: ${overtime.rowsInCutoff}`);
		lines.push(`- Employees in cutoff: ${overtime.employeeCount}`, "");
		lines.push("### Hour Buckets");
		for (const [bucket, total] of Object.entries(overtime.totals)) {
			lines.push(`- ${bucket}: ${total.toFixed(2)}`);
		}
		lines.push("", "### Top Employees By Premium/OT Hours");
		for (const employee of topEmployees(
			overtime.byEmployee,
			(value) => value.regOtHrs + value.regNdHrs + value.spclHrs + value.spclOtHrs + value.rholHrs + value.rholOtHrs + value.rdHrs + value.rdOtHrs,
			15,
		)) {
			lines.push(`- ${employee.employeeCode} ${employee.name}: rows ${employee.rows}, hours ${employee.total.toFixed(2)}`);
		}
	}

	lines.push(
		"",
		"## Stop Condition",
		"",
		"- This source-only dry run does not read or write the database.",
		"- Use it to prove that payroll register totals are explainable from source workbooks before running the DB comparison or any repair/apply script.",
		"- For DB repair, approved overtime/rest/holiday hours must become effective `Timesheetline` evidence for the period; net pay should only be judged after source earnings, deductions, and timesheet evidence are present.",
	);
	return `${lines.join("\n")}\n`;
}

function findCandidateSourceFiles(root: string): string[] {
	if (!fs.existsSync(root)) return [];
	const candidates: string[] = [];
	const walk = (dir: string) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.name.startsWith("~$")) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			if (!/\.(xlsx|xls)$/i.test(entry.name)) continue;
			if (
				/(OT|OVERTIME|OTR|Compensation Mass Upload|Deduction Mass Upload|RCBC|Statutory|PHIC|Gross Pay|RTPL|Payroll)/i.test(
					full,
				)
			) {
				candidates.push(full);
			}
		}
	};
	walk(root);
	return candidates.sort();
}

export function writeJson(filePath: string, value: unknown) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeText(filePath: string, value: string) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, value, "utf8");
}

export function writeComparisonCsv(filePath: string, comparison: PayrollComparisonResult) {
	const lines = [
		[
			"employeeCode",
			"employeeName",
			"rowNumber",
			"overallCategory",
			"field",
			"fieldCategory",
			"workbookValue",
			"hrisValue",
			"difference",
			"source",
			"sourceBreakdown",
			"hrisSource",
			"reason",
			"recommendation",
		],
	];
	for (const row of comparison.rows) {
		if (!row.fields.length) {
			lines.push([
				row.employeeCode,
				row.employeeName,
				String(row.rowNumber),
				row.overallCategory,
				"",
				row.overallCategory,
				"",
				"",
				"",
				"",
				"",
				"",
				row.recommendation,
				row.recommendation,
			]);
			continue;
		}
		for (const field of row.fields) {
			lines.push([
				row.employeeCode,
				row.employeeName,
				String(row.rowNumber),
				row.overallCategory,
				field.field,
				field.category,
				String(field.workbookValue ?? ""),
				String(field.hrisValue ?? ""),
				String(field.difference ?? ""),
				field.sourceCell || field.sourceColumn || "",
				(field.sourceBreakdown || [])
					.map((entry) => `${entry.label}=${entry.value}`)
					.join("; "),
				field.hrisSource,
				field.likelyReason,
				field.repairRecommendation,
			]);
		}
	}
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(
		filePath,
		lines
			.map((row) =>
				row
					.map((cell) => {
						const text = String(cell ?? "");
						return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
					})
					.join(","),
			)
			.join("\n"),
		"utf8",
	);
}
