const path = require("path");
const ExcelJS = require("exceljs");

const outputPath = path.resolve(__dirname, "../../docs/hris-dm-stage-migration-list.xlsx");

const rows = [
	["0", "DM0 / /setup", "DM0.1", "Company Profile", "Company identity, timezone, logo, colors", "Already in /setup"],
	[
		"0",
		"DM0 / /setup",
		"DM0.2",
		"Timesheet Rules",
		"Rounding, OT qualification, edit/approve rules",
		"Already in /setup",
	],
	[
		"0",
		"DM0 / /setup",
		"DM0.3",
		"Payroll Rules / Cycle",
		"Payroll frequency, cutoffs, calculator, rates",
		"Already in /setup",
	],
	["0", "DM0 / /setup", "DM0.4", "Workflow Templates", "Default approval workflows", "Already in /setup"],
	[
		"0",
		"DM0 / /setup",
		"DM0.5",
		"201 Document Types",
		"Mandated default 201 document types",
		"Seeded during setup, also has config page",
	],
	["", "", "", "", "", ""],
	["1", "DM1", "DM1.1", "Departments", "Company structure", "Already in migration"],
	["1", "DM1", "DM1.2", "Sections", "Department child units", "Already in migration"],
	["1", "DM1", "DM1.3", "Levels", "Rank / level / manager flag", "Already in migration"],
	[
		"1",
		"DM1",
		"DM1.4",
		"Positions",
		"Job titles, dept/section links, salary range, levels",
		"Already in migration",
	],
	[
		"1",
		"DM1",
		"DM1.5",
		"Shift Types / Schedules",
		"Shift codes, time slots, off/overnight flag",
		"Already in migration",
	],
	[
		"1",
		"DM1",
		"DM1.6",
		"Agencies",
		"Agency/vendor workforce source",
		"Importable from the DM1 workbook",
	],
	["", "", "", "", "", ""],
	["2", "DM2", "DM2.1", "Holidays", "Calendar / holiday master", "Already in migration"],
	["2", "DM2", "DM2.2", "Leave Types", "Leave catalog", "Already in migration"],
	[
		"2",
		"DM2",
		"DM2.3",
		"Benefit Types",
		"Benefit/allowance/deduction type catalog",
		"Already in migration",
	],
	[
		"2",
		"DM2",
		"DM2.4",
		"Loan Types",
		"Loan/deduction catalog",
		"Template-only in migration workbook; config page exists",
	],
	[
		"2",
		"DM2",
		"DM2.5",
		"201 Document Types",
		"Client-specific 201 document requirements",
		"Template-only in migration workbook; setup can seed defaults",
	],
	["", "", "", "", "", ""],
	[
		"3",
		"DM3",
		"DM3.1",
		"Employees",
		"Employee master data, including payroll-approved period BASIC_SALARY",
		"Workbook sheet can feed existing employee migration import",
	],
	[
		"3",
		"DM3",
		"DM3.2",
		"Employee Schedule Assignments",
		"Employee-to-shift/schedule mapping",
		"Importable after employees + shift types",
	],
	[
		"3",
		"DM3",
		"DM3.3",
		"Reporting Lines",
		"Manager/supervisor relationships",
		"Template-only; should come after employees",
	],
	[
		"3",
		"DM3",
		"DM3.4",
		"Employee Documents / 201 Files",
		"Document compliance per employee",
		"Template-only; should come after employees + document types",
	],
	[
		"3",
		"DM3",
		"DM3.5",
		"Opening Leave Balances",
		"Initial employee leave credits",
		"Template-only; should come after employees + leave types",
	],
	[
		"3",
		"DM3",
		"DM3.6",
		"Employee Benefits / Loans",
		"Employee-level assigned benefits and loan openings",
		"Template-only; should come after employees + benefit/loan types",
	],
	["", "", "", "", "", ""],
	[
		"4",
		"DM4",
		"DM4.1",
		"Attendance History",
		"Legacy attendance/DTR and clock ledger",
		"Template-only after employees + schedules",
	],
	[
		"4",
		"DM4",
		"DM4.2",
		"Timesheets",
		"Legacy timesheet headers and effective line snapshots",
		"Template-only after attendance + payroll periods",
	],
	["", "", "", "", "", ""],
	[
		"5",
		"DM5",
		"DM5.1",
		"Payroll History",
		"Legacy payroll records, payslip history, generated payroll snapshots",
		"After payroll setup + employees + timesheets",
	],
	["", "", "", "", "", ""],
	[
		"6",
		"DM6",
		"DM6.1",
		"Requests / Approval History",
		"Legacy request history, workflow movement, approval outcomes",
		"After workflows + employees",
	],
	["", "", "", "", "", ""],
	[
		"7",
		"FINAL",
		"FINAL.1",
		"Reconciliation / Sign-off",
		"Counts, spot checks, payroll/attendance/request validation",
		"Manual QA",
	],
];

const workbookColors = {
	"DM0 / /setup": "FFF3F4F6",
	DM0: "FFF3F4F6",
	DM1: "FFF3F4F6",
	DM2: "FFF3F4F6",
	DM3: "FFF3F4F6",
	DM4: "FFF3F4F6",
	DM5: "FFF3F4F6",
	DM6: "FFF3F4F6",
	FINAL: "FFF3F4F6",
};

const statusColors = [
	{ text: "Already in", color: "FFE5E7EB" },
	{ text: "Separate Employee Import exists", color: "FFE5E7EB" },
	{ text: "Seeded", color: "FFE5E7EB" },
	{ text: "Missing", color: "FFFFF7ED" },
	{ text: "Template-only", color: "FFFFF7ED" },
	{ text: "Workbook sheet can feed", color: "FFE5E7EB" },
	{ text: "Should come after", color: "FFF3F4F6" },
	{ text: "After ", color: "FFF3F4F6" },
	{ text: "Manual QA", color: "FFF3F4F6" },
];

const wb = new ExcelJS.Workbook();
wb.creator = "HRIS Codex";
wb.created = new Date();
wb.modified = new Date();

const sheet = wb.addWorksheet("DM Migration List");
sheet.columns = [
	{ header: "Stage", key: "stage", width: 10 },
	{ header: "Workbook", key: "workbook", width: 16 },
	{ header: "Step Code", key: "stepCode", width: 14 },
	{ header: "Sheet / Step", key: "sheet", width: 34 },
	{ header: "Purpose", key: "purpose", width: 54 },
	{ header: "Status In App", key: "status", width: 48 },
];

rows.forEach((row) => sheet.addRow(row));

sheet.views = [{ state: "frozen", ySplit: 1 }];
sheet.autoFilter = "A1:F1";

sheet.getRow(1).height = 24;
sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
sheet.getRow(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
sheet.getRow(1).fill = {
	type: "pattern",
	pattern: "solid",
	fgColor: { argb: "FF4B5563" },
};

sheet.eachRow((row, rowNumber) => {
	row.height = rowNumber === 1 ? 24 : 22;
	row.eachCell((cell) => {
		cell.alignment = { vertical: "middle", wrapText: true };
		cell.border = {
			top: { style: "thin", color: { argb: "FFD9D9D9" } },
			left: { style: "thin", color: { argb: "FFD9D9D9" } },
			bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
			right: { style: "thin", color: { argb: "FFD9D9D9" } },
		};
	});

	if (rowNumber === 1) return;

	const workbookName = String(row.getCell(2).value || "");
	const status = String(row.getCell(6).value || "");

	if (!workbookName && !status) {
		row.height = 10;
		return;
	}

	const workbookColor = workbookColors[workbookName];
	if (workbookColor) {
		row.getCell(1).fill = {
			type: "pattern",
			pattern: "solid",
			fgColor: { argb: workbookColor },
		};
		row.getCell(2).font = { bold: true };
		row.getCell(2).fill = {
			type: "pattern",
			pattern: "solid",
			fgColor: { argb: workbookColor },
		};
		row.getCell(3).font = { bold: true };
	}

	const statusColor = statusColors.find((item) => status.startsWith(item.text) || status.includes(item.text));
	if (statusColor) {
		row.getCell(6).fill = {
			type: "pattern",
			pattern: "solid",
			fgColor: { argb: statusColor.color },
		};
	}
});

sheet.pageSetup = {
	orientation: "landscape",
	fitToPage: true,
	fitToWidth: 1,
	fitToHeight: 0,
};

wb.xlsx.writeFile(outputPath).then(() => {
	console.log(outputPath);
});
