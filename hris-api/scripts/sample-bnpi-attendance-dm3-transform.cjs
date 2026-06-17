const path = require("path");
const XLSX = require("xlsx");

const BNPI_DEFAULT_SCHEDULE_CODE = "BNPI_MON_FRI_DAY_8_5";
const DEFAULT_TIME_IN = "08:00";
const DEFAULT_TIME_BREAK = "12:00-13:00";
const DEFAULT_TIME_OUT = "17:00";
const DEFAULT_BREAK_MINUTES = 60;
const DEFAULT_REGULAR_HOURS = 8;

const DEFAULT_FILES = [
	"../../docs/BNPI ATTENDANCE-20260525T112857Z-3-001/BNPI ATTENDANCE/FY_2026/Assembly Section/2026_05_May_Assembly_Attendance.xlsx",
	"../../docs/BNPI ATTENDANCE-20260525T112857Z-3-001/BNPI ATTENDANCE/FY_2026/Accounting Section/2026_05_May_Accounting_Attendance.xlsx",
	"../../docs/BNPI ATTENDANCE-20260525T112857Z-3-001/BNPI ATTENDANCE/FY_2026/GAHR Section/2026_05_May_GAHR_Attendance.xlsx",
	"../../docs/BNPI ATTENDANCE-20260525T112857Z-3-001/BNPI ATTENDANCE/FY_2026/Warehouse Section/May/2026_05_May_Warehouse Facility_Attendance.xlsx",
	"../../docs/BNPI ATTENDANCE-20260525T112857Z-3-001/BNPI ATTENDANCE/FY_2026/Facilities Section/2026_05_ May_Facilities_Attendance.xlsx",
];

const MONTHS = {
	jan: 1,
	january: 1,
	feb: 2,
	february: 2,
	mar: 3,
	march: 3,
	apr: 4,
	april: 4,
	may: 5,
	jun: 6,
	june: 6,
	jul: 7,
	july: 7,
	aug: 8,
	august: 8,
	sep: 9,
	september: 9,
	oct: 10,
	october: 10,
	nov: 11,
	november: 11,
	dec: 12,
	december: 12,
};

const normalizeHeader = (value) =>
	String(value || "")
		.replace(/\r?\n/g, " ")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

const getArgValue = (name) => {
	const prefix = `${name}=`;
	const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : "";
};

const getFilesFromArgs = () => {
	const rawFiles = getArgValue("--files");
	if (!rawFiles) return DEFAULT_FILES;
	return rawFiles
		.split(";")
		.map((item) => item.trim())
		.filter(Boolean);
};

const parseLimit = () => {
	const parsed = Number(getArgValue("--limit"));
	return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 15;
};

const parseYearMonthFromFile = (filePath) => {
	const baseName = path.basename(filePath).toLowerCase();
	const yearMatch = baseName.match(/\b(20\d{2})\b/);
	const monthNumberMatch = baseName.match(/20\d{2}[_ -]+(\d{1,2})/);
	if (yearMatch && monthNumberMatch) {
		return { year: Number(yearMatch[1]), month: Number(monthNumberMatch[1]) };
	}

	const monthNameMatch = baseName.match(
		/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\b/,
	);
	return {
		year: yearMatch ? Number(yearMatch[1]) : 2026,
		month: monthNameMatch ? MONTHS[monthNameMatch[1]] : 1,
	};
};

const parseMonthFromSheet = (sheetName) => {
	const match = String(sheetName || "")
		.toLowerCase()
		.match(
			/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\b/,
		);
	return match ? MONTHS[match[1]] : null;
};

const parseDayFromSheet = (sheetName) => {
	const match = String(sheetName || "").match(/\b(\d{1,2})\b/);
	if (!match) return null;
	const day = Number(match[1]);
	return day >= 1 && day <= 31 ? day : null;
};

const toIsoDate = ({ year, month, day }) =>
	`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const getColumnIndex = (headers, aliases) => {
	const normalizedAliases = aliases.map(normalizeHeader);
	return headers.findIndex((header) => normalizedAliases.includes(normalizeHeader(header)));
};

const isPresentValue = (value) => String(value || "").trim().toLowerCase() === "present";

const isSummaryOrBlankEmployee = (employeeId) => {
	const text = String(employeeId || "").trim();
	return !text || ["total", "direct", "indirect", "present", "absent", "no work"].includes(text.toLowerCase());
};

const normalizeAttendanceRow = ({ row, indexes, sourceWorkbook, sourceSheet, sourceRow, date }) => {
	const employeeId = String(row[indexes.employeeId] || "").trim();
	if (isSummaryOrBlankEmployee(employeeId)) return null;

	const leaveDate = row[indexes.leaveDate];
	const leaveType = row[indexes.leaveType];
	if (!isPresentValue(leaveDate) && !isPresentValue(leaveType)) return null;

	return {
		EMP_ID: employeeId,
		DATE: date,
		SHIFT_CODE: BNPI_DEFAULT_SCHEDULE_CODE,
		TIME_IN: DEFAULT_TIME_IN,
		TIME_BREAK: DEFAULT_TIME_BREAK,
		TIME_OUT: DEFAULT_TIME_OUT,
		STATUS: "PRESENT",
		LEAVE_TYPE_CODE: "",
		CATEGORY: String(row[indexes.category] || "").trim(),
		AWOL: String(row[indexes.awol] || "").trim(),
		SOURCE_WORKBOOK: sourceWorkbook,
		SOURCE_SHEET: sourceSheet,
		SOURCE_ROW: sourceRow,
		NOTES: "BNPI PRESENT normalized to 8 paid hours; recurring schedule assignment remains DM3.2",
		BREAK_MINUTES: DEFAULT_BREAK_MINUTES,
		REGULAR_HOURS: DEFAULT_REGULAR_HOURS,
	};
};

const sampleFile = (filePath, limitPerFile) => {
	const absolutePath = path.resolve(__dirname, filePath);
	const workbook = XLSX.readFile(absolutePath, { cellDates: false, raw: false });
	const { year, month } = parseYearMonthFromFile(filePath);
	const samples = [];
	const weekendRows = [];

	for (const sheetName of workbook.SheetNames) {
		const day = parseDayFromSheet(sheetName);
		if (!day) continue;
		const date = toIsoDate({ year, month: parseMonthFromSheet(sheetName) || month, day });
		const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
		const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
		const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
			header: 1,
			defval: "",
			blankrows: false,
			raw: false,
		});
		const headerIndex = rows.findIndex((row) =>
			row.some((cell) => normalizeHeader(cell) === "employee id"),
		);
		if (headerIndex < 0) continue;

		const headers = rows[headerIndex];
		const indexes = {
			employeeId: getColumnIndex(headers, ["Employee ID"]),
			leaveDate: getColumnIndex(headers, ["Leave Date"]),
			leaveType: getColumnIndex(headers, ["Leave Type"]),
			category: getColumnIndex(headers, ["Category"]),
			awol: getColumnIndex(headers, ["AWOL"]),
		};
		if (Object.values(indexes).some((index) => index < 0)) continue;

		for (let index = headerIndex + 1; index < rows.length; index++) {
			const normalized = normalizeAttendanceRow({
				row: rows[index],
				indexes,
				sourceWorkbook: path.basename(filePath),
				sourceSheet: sheetName,
				sourceRow: index + 1,
				date,
			});
			if (!normalized) continue;
			if (isWeekend) {
				weekendRows.push(normalized);
			}
			samples.push(normalized);
			if (samples.length >= limitPerFile) return { filePath, samples, weekendRows };
		}
	}

	return { filePath, samples, weekendRows };
};

const main = () => {
	const files = getFilesFromArgs();
	const limit = parseLimit();
	const perFileLimit = Math.max(1, Math.ceil(limit / Math.max(files.length, 1)));
	const results = files.map((file) => sampleFile(file, perFileLimit));
	const samples = results.flatMap((result) => result.samples).slice(0, limit);
	const departments = new Set(
		results
			.filter((result) => result.samples.length > 0)
			.map((result) => {
				const directory = path.basename(path.dirname(result.filePath));
				if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)$/i.test(directory)) {
					return path.basename(path.dirname(path.dirname(result.filePath)));
				}
				return directory;
			}),
	);
	const weekendSamples = results.flatMap((result) => result.weekendRows);

	console.log(
		JSON.stringify(
			{
				defaultSchedule: {
					code: BNPI_DEFAULT_SCHEDULE_CODE,
					timeIn: DEFAULT_TIME_IN,
					timeBreak: DEFAULT_TIME_BREAK,
					timeOut: DEFAULT_TIME_OUT,
					breakMinutes: DEFAULT_BREAK_MINUTES,
					regularHours: DEFAULT_REGULAR_HOURS,
				},
				filesChecked: files.length,
				departmentsWithPresentSamples: Array.from(departments),
				sampleCount: samples.length,
				weekendPresentEvidenceCount: weekendSamples.length,
				weekendRule:
					"Weekend rows are normalized only when the source workbook explicitly marks the employee-day PRESENT.",
				employeeEmbeddedScheduleMutation: false,
				samples,
			},
			null,
			2,
		),
	);
};

main();
