const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const XLSX = require("xlsx");

const repoRoot = path.resolve(__dirname, "..", "..");
const importDir = path.join(repoRoot, "data", "import");

const DM1_OUTPUT = path.join(importDir, "DM1-master-data-migration.xlsx");
const DM2_OUTPUT = path.join(importDir, "DM2-policy-data-migration.xlsx");
const DM3_OUTPUT = path.join(importDir, "DM3-employee-data-migration.xlsx");
const DM4_OUTPUT = path.join(importDir, "DM4-attendance-timesheet-migration.xlsx");

const LEVEL_HEADERS = ["NAME", "RANK", "DESCRIPTION", "IS_MANAGER"];
const AGENCY_HEADERS = ["CODE", "NAME", "STATUS", "CONTACT_NAME", "CONTACT_EMAIL", "CONTACT_PHONE"];
const LOAN_TYPE_HEADERS = [
	"NAME",
	"CATEGORY",
	"DESCRIPTION",
	"MIN_AMOUNT",
	"MAX_AMOUNT",
	"INTEREST_RATE",
	"MAX_TERM_MONTHS",
	"MIN_SERVICE_MONTHS",
	"IS_ACTIVE",
];
const DOCUMENT_TYPE_HEADERS = [
	"CODE",
	"NAME",
	"CATEGORY",
	"UPLOAD_BY",
	"IS_REQUIRED",
	"IS_EMPLOYEE_VISIBLE",
	"IS_ACTIVE",
	"DISPLAY_ORDER",
	"FIELDS_JSON",
];
const EMPLOYEE_SCHEDULE_HEADERS = [
	"EMP_ID",
	"SCHEDULE_CODE",
	"EFFECTIVE_FROM",
	"EFFECTIVE_TO",
	"NOTES",
];
const REPORTING_LINE_HEADERS = ["EMP_ID", "REPORT_TO_EMP_ID", "EFFECTIVE_FROM", "NOTES"];
const EMPLOYEE_DOCUMENT_HEADERS = [
	"EMP_ID",
	"DOCUMENT_TYPE_CODE",
	"DOCUMENT_NUMBER",
	"ISSUE_DATE",
	"EXPIRY_DATE",
	"STATUS",
	"NOTES",
];
const OPENING_LEAVE_BALANCE_HEADERS = [
	"EMP_ID",
	"LEAVE_TYPE_CODE",
	"BALANCE",
	"AS_OF_DATE",
	"NOTES",
];
const EMPLOYEE_BENEFIT_LOAN_HEADERS = [
	"EMP_ID",
	"TYPE",
	"CODE_OR_NAME",
	"AMOUNT",
	"PAYROLL_PERIOD_CODE",
	"START_DATE",
	"END_DATE",
	"INSTALLMENTS",
	"STATUS",
	"NOTES",
];
const ATTENDANCE_HISTORY_HEADERS = [
	"EMP_ID",
	"DATE",
	"SHIFT_CODE",
	"TIME_IN",
	"TIME_BREAK",
	"TIME_OUT",
	"STATUS",
	"LEAVE_TYPE_CODE",
	"CATEGORY",
	"AWOL",
	"SOURCE_WORKBOOK",
	"SOURCE_SHEET",
	"SOURCE_ROW",
	"NOTES",
];
const TIMESHEET_HEADERS = [
	"EMP_ID",
	"PAYROLL_PERIOD_CODE",
	"DATE",
	"TIME_IN",
	"TIME_BREAK",
	"TIME_OUT",
	"STATUS",
	"REGULAR_HOURS",
	"OVERTIME_HOURS",
	"UNDERTIME_HOURS",
	"LATE_HOURS",
	"EARLY_OUT_HOURS",
	"BREAK_MINUTES",
	"REVISION_NO",
	"IS_EFFECTIVE",
	"NOTES",
];

const WORKBOOK_STYLE = {
	header: "FFC65911",
	headerBottom: "FF92400E",
	border: "FFE5E7EB",
};

const workbooks = [
	{
		label: "DM1",
		outputPath: DM1_OUTPUT,
		sheets: [
			{ name: "Departments", csv: "departments-import.csv" },
			{ name: "Sections", csv: "sections-import.csv" },
			{ name: "Positions", csv: "positions-import.csv" },
			{ name: "Levels", csv: "levels-import.csv", fallbackHeaders: LEVEL_HEADERS },
			{ name: "Shift Types Schedules", csv: "shift-types-import.csv" },
			{ name: "Agencies", csv: "agencies-import.csv", fallbackHeaders: AGENCY_HEADERS },
		],
	},
	{
		label: "DM2",
		outputPath: DM2_OUTPUT,
		sheets: [
			{ name: "Holidays", csv: "holidays-import.csv" },
			{ name: "Leave Types", csv: "leave-types-import.csv" },
			{ name: "Benefit Types", csv: "benefit-types-import.csv" },
			{ name: "Loan Types", csv: "loan-types-import.csv", fallbackHeaders: LOAN_TYPE_HEADERS },
			{
				name: "201 Document Types",
				csv: "document-201-types-import.csv",
				fallbackHeaders: DOCUMENT_TYPE_HEADERS,
			},
		],
	},
	{
		label: "DM3",
		outputPath: DM3_OUTPUT,
		sheets: [
			{ name: "Employees", csv: "employees-import.csv" },
			{
				name: "Employee Schedule Assignments",
				csv: "employee-schedules-import.csv",
				fallbackHeaders: EMPLOYEE_SCHEDULE_HEADERS,
			},
			{
				name: "Reporting Lines",
				csv: "reporting-lines-import.csv",
				fallbackHeaders: REPORTING_LINE_HEADERS,
			},
			{
				name: "Employee Documents 201 Files",
				csv: "employee-documents-201-import.csv",
				fallbackHeaders: EMPLOYEE_DOCUMENT_HEADERS,
			},
			{
				name: "Opening Leave Balances",
				csv: "opening-leave-balances-import.csv",
				fallbackHeaders: OPENING_LEAVE_BALANCE_HEADERS,
			},
			{
				name: "Employee Benefits Loans",
				csv: "employee-benefits-loans-import.csv",
				fallbackHeaders: EMPLOYEE_BENEFIT_LOAN_HEADERS,
			},
		],
	},
	{
		label: "DM4",
		outputPath: DM4_OUTPUT,
		sheets: [
			{
				name: "Attendance History",
				csv: "attendance-history-import.csv",
				fallbackHeaders: ATTENDANCE_HISTORY_HEADERS,
			},
			{
				name: "Timesheets",
				csv: "timesheets-import.csv",
				fallbackHeaders: TIMESHEET_HEADERS,
			},
		],
	},
];

const readCsvRows = (sheetConfig) => {
	const csvPath = path.join(importDir, sheetConfig.csv);

	if (!fs.existsSync(csvPath)) {
		if (!sheetConfig.fallbackHeaders) {
			throw new Error(`Required CSV file is missing: ${csvPath}`);
		}

		return {
			rows: [sheetConfig.fallbackHeaders],
			rowCount: 0,
			sourcePath: csvPath,
			usedFallback: true,
		};
	}

	const csvContent = fs.readFileSync(csvPath, "utf8");
	const csvWorkbook = XLSX.read(csvContent, { type: "string", raw: true, FS: "," });
	const firstSheet = csvWorkbook.Sheets[csvWorkbook.SheetNames[0]];
	const rows = XLSX.utils.sheet_to_json(firstSheet, {
		header: 1,
		blankrows: false,
		defval: "",
	});

	return {
		rows,
		rowCount: Math.max(rows.length - 1, 0),
		sourcePath: csvPath,
		usedFallback: false,
	};
};

const getColumnWidth = (rows, columnIndex) => {
	const maxLength = rows.reduce((max, row) => {
		const value = row[columnIndex] ?? "";
		return Math.max(max, String(value).length);
	}, 10);

	return Math.min(Math.max(maxLength + 3, 14), 54);
};

const styleWorksheet = (worksheet, rows, sheetName) => {
	const headers = rows[0] || [];

	worksheet.views = [{ state: "frozen", ySplit: 1, activeCell: "A2", showGridLines: true }];
	worksheet.autoFilter = {
		from: { row: 1, column: 1 },
		to: { row: 1, column: Math.max(headers.length, 1) },
	};

	worksheet.columns = headers.map((header, index) => ({
		header,
		key: `col_${index}`,
		width: getColumnWidth(rows, index),
	}));

	worksheet.getRow(1).height = 28;
	worksheet.getRow(1).eachCell((cell) => {
		cell.fill = {
			type: "pattern",
			pattern: "solid",
			fgColor: { argb: WORKBOOK_STYLE.header },
		};
		cell.font = {
			bold: true,
			color: { argb: "FFFFFFFF" },
			size: 12,
		};
		cell.alignment = {
			horizontal: "center",
			vertical: "middle",
			wrapText: true,
		};
		cell.border = {
			top: { style: "thin", color: { argb: WORKBOOK_STYLE.border } },
			left: { style: "thin", color: { argb: WORKBOOK_STYLE.border } },
			right: { style: "thin", color: { argb: WORKBOOK_STYLE.border } },
			bottom: {
				style: "thin",
				color: { argb: WORKBOOK_STYLE.headerBottom },
			},
		};
	});

	for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
		const row = worksheet.getRow(rowNumber);
		row.height = 21;
		row.eachCell({ includeEmpty: true }, (cell) => {
			cell.alignment = { vertical: "middle", wrapText: false };
			cell.border = {
				bottom: { style: "hair", color: { argb: WORKBOOK_STYLE.border } },
			};
		});
	}
};

const writeWorkbook = async (config) => {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = "HRIS Migration";
	workbook.created = new Date();
	workbook.modified = new Date();
	const summary = [];

	for (const sheetConfig of config.sheets) {
		const result = readCsvRows(sheetConfig);
		const worksheet = workbook.addWorksheet(sheetConfig.name);
		result.rows.forEach((row) => worksheet.addRow(row));
		styleWorksheet(worksheet, result.rows, sheetConfig.name);
		summary.push({
			sheet: sheetConfig.name,
			rows: result.rowCount,
			source: result.sourcePath,
			fallback: result.usedFallback,
		});
	}

	await workbook.xlsx.writeFile(config.outputPath);

	return summary;
};

const verifyWorkbook = async (outputPath) => {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.readFile(outputPath);
	return workbook.worksheets.map((worksheet) => ({
		sheet: worksheet.name,
		rows: Math.max(worksheet.rowCount - 1, 0),
		headerFill: worksheet.getCell("A1").fill?.fgColor?.argb,
		frozen: worksheet.views?.[0]?.state === "frozen",
	}));
};

const main = async () => {
	if (!fs.existsSync(importDir)) {
		throw new Error(`Import directory does not exist: ${importDir}`);
	}

	for (const config of workbooks) {
		const summary = await writeWorkbook(config);
		const verification = await verifyWorkbook(config.outputPath);

		console.log(`\n${config.label} workbook created: ${config.outputPath}`);
		for (const sheet of summary) {
			const fallbackNote = sheet.fallback
				? ` (${path.basename(sheet.source)} missing; header-only sheet)`
				: "";
			console.log(`- ${sheet.sheet}: ${sheet.rows} rows${fallbackNote}`);
		}

		console.log(`${config.label} reopened verification:`);
		for (const sheet of verification) {
			console.log(
				`- ${sheet.sheet}: ${sheet.rows} rows, header=${sheet.headerFill}, frozen=${sheet.frozen}`,
			);
		}
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
