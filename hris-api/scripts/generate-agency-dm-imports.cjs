const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const repoRoot = path.resolve(__dirname, "..", "..");
const importDir = path.join(repoRoot, "data", "import");
const agencyDir = path.join(repoRoot, "docs", "AGENCY");
const employeesCsvPath = path.join(importDir, "employees-import.csv");
const agenciesCsvPath = path.join(importDir, "agencies-import.csv");
const assumptionsPath = path.join(importDir, "employee-import-assumptions.md");

const EMPLOYEE_HEADERS = [
	"EMP_ID",
	"NAME",
	"REPORT_TO_EMP_ID",
	"POSITION",
	"LEVEL",
	"DEPARTMENT",
	"SECTION",
	"GENDER",
	"NATIONALITY",
	"BASIC_SALARY",
	"PAY_FREQUENCY",
	"HIRE_DATE",
	"START_DATE",
	"EMAIL",
	"ROLE",
	"SCHEDULE",
	"TIN",
	"PREVIOUS_EMPLOYER",
	"CIVIL_STATUS",
	"NO_OF_DEPENDENTS",
	"DATE_OF_RESIGNATION",
	"SOURCE_STATUS",
	"SSS",
	"PHILHEALTH",
	"PAGIBIG",
	"DEVICE_ID",
	"PHONE",
	"BIRTHDAY",
	"PLACE_OF_BIRTH",
	"STREET",
	"CITY",
	"STATE",
	"COUNTRY",
	"POSTAL_CODE",
	"WORK_LOCATION",
	"WORKFORCE_SOURCE",
	"AGENCY_CODE",
	"CURRENCY",
	"SOURCE_WORKBOOK",
	"SOURCE_SHEET",
	"SOURCE_ROW",
];

const AGENCY_MASTER_ROWS = [
	{ code: "AVANCE", name: "Avance Pilipinas, Inc." },
	{ code: "CGSI", name: "Cebu General Services, Inc." },
	{ code: "CEPOL", name: "Cepol Services" },
	{ code: "KOHSAI", name: "Kohsai Contracting System Services, Inc." },
	{ code: "NATCORP", name: "NatCorp Career Growth and Manpower Services, Inc" },
];

const AGENCY_SOURCES = [
	{ fileName: "Avance.xlsx", code: "AVANCE", name: "Avance Pilipinas, Inc." },
	{ fileName: "Cepol.xlsx", code: "CEPOL", name: "Cepol Services" },
	{ fileName: "CGSI.xlsx", code: "CGSI", name: "Cebu General Services, Inc." },
	{ fileName: "Kohsai.xlsx", code: "KOHSAI", name: "Kohsai Contracting System Services, Inc." },
	{ fileName: "Natcorp.xlsx", code: "NATCORP", name: "NatCorp Career Growth and Manpower Services, Inc" },
];

const DEPARTMENT_ALIASES = new Map([
	["prchasing", "Purchasing"],
	["quality management", "Product Assurance"],
]);

const SECTION_ALIASES = new Map([
	["facility", "Facilities"],
	["injection", "Injection and Mold"],
	["injection and mold maintenance", "Injection and Mold"],
	["warehouseman", "Warehouse"],
]);

const POSITION_ALIASES = new Map([
	["operator", "Operator"],
	["production operator", "Operator"],
	["product engineering operator", "Operator"],
	["quality assurance", "Operator"],
	["quality control", "Operator"],
	["warehouse", "Operator"],
	["costumer service", "Staff"],
	["customer service", "Staff"],
	["hr staff", "Staff"],
]);

const clean = (value) =>
	String(value ?? "")
		.normalize("NFKC")
		.replace(/\u3000/g, " ")
		.replace(/\s+/g, " ")
		.trim();
const normalizeKey = (value) => clean(value).toLowerCase();
const normalizeStatutoryNumber = (value) => clean(value).replace(/\s+/g, "");
const normalizeEmployeeId = (value) => clean(value).toUpperCase();
const normalizeGender = (value) => {
	const normalized = normalizeKey(value).replace(/\./g, "");
	if (normalized === "m" || normalized === "male") return "male";
	if (normalized === "f" || normalized === "female") return "female";
	return "";
};
const normalizeEmail = (value) => {
	const email = clean(value).toLowerCase();
	if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "";
	return email;
};
const normalizeDate = (value) => {
	const text = clean(value);
	if (!text) return "";
	const parsed = value instanceof Date ? value : new Date(text);
	if (Number.isNaN(parsed.getTime())) return "";
	return parsed.toISOString().slice(0, 10);
};
const csvEscape = (value) => {
	const text = String(value ?? "");
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const writeCsv = (filePath, headers, rows) => {
	const content = [
		headers.join(","),
		...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
	].join("\n");
	fs.writeFileSync(filePath, `${content}\n`, "utf8");
};
const readCsv = (filePath) => {
	const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
	const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
	if (lines.length === 0) return { headers: [], rows: [] };
	const parseLine = (line) => {
		const values = [];
		let current = "";
		let quoted = false;
		for (let index = 0; index < line.length; index++) {
			const char = line[index];
			if (char === '"') {
				if (quoted && line[index + 1] === '"') {
					current += '"';
					index += 1;
				} else {
					quoted = !quoted;
				}
			} else if (char === "," && !quoted) {
				values.push(current);
				current = "";
			} else {
				current += char;
			}
		}
		values.push(current);
		return values;
	};
	const headers = parseLine(lines[0]);
	const rows = lines.slice(1).map((line) => {
		const values = parseLine(line);
		return headers.reduce((row, header, index) => {
			row[header] = values[index] ?? "";
			return row;
		}, {});
	});
	return { headers, rows };
};

const mapDepartment = (value) => DEPARTMENT_ALIASES.get(normalizeKey(value)) || clean(value);
const mapSection = (value) => SECTION_ALIASES.get(normalizeKey(value)) || clean(value);
const mapPosition = (value) => POSITION_ALIASES.get(normalizeKey(value)) || clean(value) || "Operator";

const getCell = (row, index) => clean(row[index]);

const buildAgencyRows = () =>
	AGENCY_MASTER_ROWS.map((agency) => ({
		CODE: agency.code,
		NAME: agency.name,
		STATUS: "ACTIVE",
		CONTACT_NAME: "",
		CONTACT_EMAIL: "",
		CONTACT_PHONE: "",
	}));

const buildEmployeeRowsFromAgencyWorkbook = (source) => {
	const workbookPath = path.join(agencyDir, source.fileName);
	if (!fs.existsSync(workbookPath)) throw new Error(`Missing agency source workbook: ${workbookPath}`);
	const workbook = XLSX.readFile(workbookPath, { cellDates: false, raw: false });
	const sheetName = workbook.SheetNames[0];
	const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
		header: 1,
		defval: "",
		blankrows: false,
		raw: false,
	});
	const rows = [];
	for (let rowIndex = 3; rowIndex < sheetRows.length; rowIndex++) {
		const row = sheetRows[rowIndex] || [];
		const employeeId = normalizeEmployeeId(getCell(row, 0));
		const name = getCell(row, 3);
		const employeeIdKey = normalizeKey(employeeId);
		const nameKey = normalizeKey(name);
		if (employeeIdKey === "id no." || employeeIdKey === "no." || nameKey === "employee name") continue;
		if (!employeeId || !name) continue;
		const department = mapDepartment(getCell(row, 4));
		const section = mapSection(getCell(row, 5));
		rows.push({
			EMP_ID: employeeId,
			NAME: name,
			REPORT_TO_EMP_ID: "",
			POSITION: mapPosition(getCell(row, 6)),
			LEVEL: "",
			DEPARTMENT: department,
			SECTION: section,
			GENDER: normalizeGender(getCell(row, 11)),
			NATIONALITY: clean(getCell(row, 2)) || "Filipino",
			BASIC_SALARY: "0",
			PAY_FREQUENCY: "SEMI_MONTHLY",
			HIRE_DATE: normalizeDate(getCell(row, 1)),
			START_DATE: normalizeDate(getCell(row, 1)),
			EMAIL: normalizeEmail(getCell(row, 35)),
			ROLE: "hris-employee",
			SCHEDULE: "",
			TIN: normalizeStatutoryNumber(getCell(row, 23)),
			PREVIOUS_EMPLOYER: getCell(row, 39),
			CIVIL_STATUS: getCell(row, 24),
			NO_OF_DEPENDENTS: "",
			DATE_OF_RESIGNATION: "",
			SOURCE_STATUS: "Active",
			SSS: normalizeStatutoryNumber(getCell(row, 18)),
			PHILHEALTH: normalizeStatutoryNumber(getCell(row, 19)),
			PAGIBIG: normalizeStatutoryNumber(getCell(row, 20)),
			DEVICE_ID: employeeId,
			PHONE: getCell(row, 34),
			BIRTHDAY: normalizeDate(getCell(row, 12)),
			PLACE_OF_BIRTH: "",
			STREET: getCell(row, 30),
			CITY: "",
			STATE: "",
			COUNTRY: "Philippines",
			POSTAL_CODE: getCell(row, 31),
			WORK_LOCATION: "ONSITE",
			WORKFORCE_SOURCE: "AGENCY",
			AGENCY_CODE: source.code,
			CURRENCY: "PHP",
			SOURCE_WORKBOOK: `docs/AGENCY/${source.fileName}`,
			SOURCE_SHEET: sheetName,
			SOURCE_ROW: String(rowIndex + 1),
		});
	}
	return {
		sourceWorkbook: `docs/AGENCY/${source.fileName}`,
		sourceSheet: sheetName,
		rows,
	};
};

const main = () => {
	if (!fs.existsSync(employeesCsvPath)) {
		throw new Error(`Missing BNPI employee import CSV: ${employeesCsvPath}`);
	}
	const existing = readCsv(employeesCsvPath);
	const generatedAgencyCodes = new Set(AGENCY_MASTER_ROWS.map((agency) => agency.code));
	const directRows = existing.rows
		.filter((row) => {
			const sourceWorkbook = clean(row.SOURCE_WORKBOOK).replace(/\\/g, "/").toLowerCase();
			const agencyCode = clean(row.AGENCY_CODE).toUpperCase();
			return !sourceWorkbook.startsWith("docs/agency/") && !generatedAgencyCodes.has(agencyCode);
		})
		.map((row) => ({
			...row,
			SOURCE_WORKBOOK: clean(row.SOURCE_WORKBOOK) || "docs/BNPI_MASTERLIST.xlsx",
		}));
	const agencyBuilds = AGENCY_SOURCES.map(buildEmployeeRowsFromAgencyWorkbook);
	const agencyRows = agencyBuilds.flatMap((build) => build.rows);
	const employeeIds = new Set();
	const emails = new Set();
	let duplicateEmailsBlanked = 0;
	const dedupedRows = [];
	for (const row of [...directRows, ...agencyRows]) {
		const key = normalizeKey(row.EMP_ID);
		if (!key || employeeIds.has(key)) continue;
		employeeIds.add(key);
		const emailKey = normalizeKey(row.EMAIL);
		if (emailKey && emails.has(emailKey)) {
			row.EMAIL = "";
			duplicateEmailsBlanked += 1;
		} else if (emailKey) {
			emails.add(emailKey);
		}
		dedupedRows.push(row);
	}

	writeCsv(agenciesCsvPath, ["CODE", "NAME", "STATUS", "CONTACT_NAME", "CONTACT_EMAIL", "CONTACT_PHONE"], buildAgencyRows());
	writeCsv(employeesCsvPath, EMPLOYEE_HEADERS, dedupedRows);

	const stats = {
		agenciesOutput: path.relative(repoRoot, agenciesCsvPath).replace(/\\/g, "/"),
		employeesOutput: path.relative(repoRoot, employeesCsvPath).replace(/\\/g, "/"),
		directEmployeeRows: directRows.length,
		agencyEmployeeRows: agencyRows.length,
		totalEmployeeRows: dedupedRows.length,
		duplicateEmailsBlanked,
		agencies: agencyBuilds.map((build) => ({
			sourceWorkbook: build.sourceWorkbook,
			sourceSheet: build.sourceSheet,
			rows: build.rows.length,
		})),
	};

	fs.appendFileSync(
		assumptionsPath,
		`\n## Agency Workforce DM3 Append - ${new Date().toISOString().slice(0, 10)}\n\n` +
			`Generated DM1 agencies and appended DM3 agency employees from docs/AGENCY workbooks.\n\n` +
			`- DM1 Agencies: ${AGENCY_MASTER_ROWS.map((agency) => `${agency.code} (${agency.name})`).join(", ")}\n` +
			`- Workbook-backed agency employee sources: ${AGENCY_SOURCES.map((source) => `${source.code} (${source.fileName})`).join(", ")}\n` +
			`- Agency employee rows appended: ${agencyRows.length}\n` +
			`- Total employees in DM3 Employees CSV after append: ${dedupedRows.length}\n` +
			`- Duplicate source emails blanked to avoid account collisions: ${duplicateEmailsBlanked}\n` +
			`- Agency workbooks do not contain salary amounts, so agency employee BASIC_SALARY is set to 0 for master-data import only.\n`,
		"utf8",
	);

	console.log(JSON.stringify(stats, null, 2));
};

main();
