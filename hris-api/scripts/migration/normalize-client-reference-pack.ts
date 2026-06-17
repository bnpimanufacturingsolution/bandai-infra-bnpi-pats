import fs from "fs";
import os from "os";
import path from "path";
import * as XLSX from "xlsx";

type CsvRow = Record<string, string | number | boolean | Date | null | undefined>;

type SectionRow = {
	DivCode?: string | number | null;
	DivisionName?: string | null;
	DMApprover?: string | number | null;
	DGMApprover?: string | number | null;
	Maker?: string | number | null;
	Active?: string | boolean | null;
};

type ShiftRow = {
	ShiftCode?: string | null;
	ShiftStart?: string | null;
	ShiftEnd?: string | null;
	ShiftHrs?: string | number | null;
};

type HolidayRow = {
	Date?: string | number | Date | null;
	Description?: string | null;
	Type?: string | null;
};

type PositionWorkbookRow = {
	ID?: string | number | null;
	EmpPosition?: string | null;
};

type DepartmentRow = {
	code: string;
	name: string;
	description?: string;
	parentCode?: string;
};

type PositionRow = {
	title: string;
	code: string;
	description?: string;
	departmentCode: string;
	minSalary?: number;
	maxSalary?: number;
};

type PositionLevelRow = {
	positionCode: string;
	levelName: string;
};

type LevelRow = {
	name: string;
	rank: number;
	description?: string;
};

type NormalizedSection = {
	code: string;
	name: string;
	parentCode?: string;
	description: string;
	sourceDivCode?: string;
	dmApprover?: string;
	dgmApprover?: string;
	maker?: string;
	active: boolean;
};

type PositionRule = PositionRow & {
	levelName: string;
};

const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads");

const DEFAULT_INPUTS = {
	workbookPath: path.join(DOWNLOADS_DIR, "FROM_SCRSHOT_RECONCILLATION_1.xlsx"),
	divisionsCsvPath: path.join(DOWNLOADS_DIR, "divisions_visible.csv"),
	holidaysCsvPath: path.join(DOWNLOADS_DIR, "holidays_visible.csv"),
	shiftCodesCsvPath: path.join(DOWNLOADS_DIR, "shift_codes_visible.csv"),
};

const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "output", "client-reference-pack");

const CANONICAL_LEVELS: LevelRow[] = [
	{ name: "Entry", rank: 1, description: "Entry-level role" },
	{ name: "Junior", rank: 2, description: "Junior-level role" },
	{ name: "Mid", rank: 3, description: "Mid-level role" },
	{ name: "Staff", rank: 3, description: "Legacy sample-pack individual contributor level" },
	{ name: "Senior", rank: 4, description: "Senior-level role" },
	{ name: "Manager", rank: 5, description: "People leader level used in the sample pack and shared seeders" },
	{ name: "Director", rank: 6, description: "Director role" },
];

const PARENT_NAME_ALIASES = new Map<string, { name: string; code: string }>([
	["assembly", { name: "Assembly", code: "ASM" }],
	["decoration", { name: "Decoration", code: "DECOR" }],
	["project engineering", { name: "Project Engineering", code: "PROJ-ENG" }],
	["production planning", { name: "Production Planning", code: "PROD-PLAN" }],
	["purchasing", { name: "Purchasing", code: "PUR" }],
	["quality assurance", { name: "Quality Assurance", code: "QA" }],
	["quality control", { name: "Quality Control", code: "QC" }],
	["sales", { name: "Sales", code: "SALES" }],
	["warehouse", { name: "Warehouse", code: "WH" }],
	["ga/hr", { name: "GA/HR", code: "GA-HR" }],
	["accounting", { name: "Accounting", code: "ACCT" }],
	["process engineering", { name: "Process Engineering", code: "PROC-ENG" }],
	["strategic planning", { name: "Strategic Planning", code: "STRAT-PLAN" }],
	["facilities", { name: "Facilities", code: "FAC" }],
	["quality & compliance unit", { name: "Quality & Compliance Unit", code: "QCU" }],
	["quality and compliance unit", { name: "Quality & Compliance Unit", code: "QCU" }],
	["import/export", { name: "Import/Export", code: "IMP-EXP" }],
	["import and export", { name: "Import/Export", code: "IMP-EXP" }],
	["import and impex", { name: "Import/Export", code: "IMP-EXP" }],
	[
		"production planning/purchasing",
		{ name: "Production Planning/Purchasing", code: "PP-PUR" },
	],
	[
		"product assurance/product engineering/purchasing",
		{ name: "Product Assurance/Product Engineering/Purchasing", code: "PA-PE-PUR" },
	],
	["warehouse/facilities", { name: "Warehouse/Facilities", code: "WH-FAC" }],
	["production/administration", { name: "Production/Administration", code: "PROD-ADMIN" }],
	[
		"injection and mold",
		{ name: "Injection and Mold Maintenance", code: "INJ-MOLD" },
	],
	[
		"injection and mold maintenance",
		{ name: "Injection and Mold Maintenance", code: "INJ-MOLD" },
	],
]);

const STANDALONE_DEPARTMENT_CODES = new Map<string, string>([
	["customer service", "CUST-SVC"],
	["japanese", "JPN"],
	["korean", "KOR"],
	["production", "PROD"],
	["technical support", "TECH-SUP"],
	["sales /cs / production planning", "SALES-CS-PROD-PLAN"],
	["qcu/business strategy/customer service", "QCU-BIZ-STRAT-CUST-SVC"],
	["administration/production", "ADMIN-PROD"],
	["facilities/warehouse", "FAC-WH"],
	["assembly/decoration/injection", "ASM-DECOR-INJ"],
	["business strategy/purchasing/administration", "BIZ-STRAT-PUR-ADMIN"],
	["product assurance/production", "PROD-ASSUR-PROD"],
	[
		"purchasing/product engineering/product assurance",
		"PUR-PROJ-ENG-PROD-ASSUR",
	],
	[
		"product assurance/product engineering/purchasing",
		"PA-PE-PUR",
	],
]);

const TOKEN_CODE_MAP: Record<string, string> = {
	accounting: "ACCT",
	administration: "ADMIN",
	affairs: "GA",
	assembly: "ASM",
	business: "BIZ",
	compliance: "COMP",
	customer: "CUST",
	decoration: "DECOR",
	engineer: "ENG",
	engineering: "ENG",
	export: "EXP",
	facilities: "FAC",
	factory: "FACT",
	general: "GEN",
	hr: "HR",
	import: "IMP",
	injection: "INJ",
	japanese: "JPN",
	korean: "KOR",
	maintenance: "MAIN",
	mold: "MOLD",
	planning: "PLAN",
	process: "PROC",
	product: "PROD",
	production: "PROD",
	project: "PROJ",
	purchasing: "PUR",
	quality: "QUAL",
	sales: "SALES",
	section: "SEC",
	service: "SVC",
	services: "SVC",
	strategic: "STRAT",
	strategy: "STRAT",
	support: "SUP",
	technical: "TECH",
	unit: "UNIT",
	warehouse: "WH",
};

const CLIENT_POSITION_RULES = new Map<string, PositionRule>([
	[
		"President",
		{
			title: "President",
			code: "PRES",
			description: "President",
			departmentCode: "STRAT-PLAN",
			levelName: "Director",
			minSalary: 150000,
			maxSalary: 220000,
		},
	],
	[
		"General Manager",
		{
			title: "General Manager",
			code: "GM",
			description: "General manager",
			departmentCode: "STRAT-PLAN",
			levelName: "Director",
			minSalary: 130000,
			maxSalary: 190000,
		},
	],
	[
		"Manager",
		{
			title: "Manager",
			code: "MGR",
			description: "Manager",
			departmentCode: "PROD-ADMIN",
			levelName: "Manager",
			minSalary: 65000,
			maxSalary: 105000,
		},
	],
	[
		"Assistant Manager",
		{
			title: "Assistant Manager",
			code: "ASST-MGR",
			description: "Assistant manager",
			departmentCode: "PROD-ADMIN",
			levelName: "Manager",
			minSalary: 70000,
			maxSalary: 110000,
		},
	],
	[
		"Senior Supervisor",
		{
			title: "Senior Supervisor",
			code: "SR-SUP",
			description: "Senior supervisor",
			departmentCode: "PROD-ADMIN",
			levelName: "Senior",
			minSalary: 50000,
			maxSalary: 85000,
		},
	],
	[
		"Senior Engineer",
		{
			title: "Senior Engineer",
			code: "SR-ENG",
			description: "Senior engineer",
			departmentCode: "PROJ-ENG",
			levelName: "Senior",
			minSalary: 70000,
			maxSalary: 120000,
		},
	],
	[
		"Specialist",
		{
			title: "Specialist",
			code: "SPEC",
			description: "Specialist",
			departmentCode: "PROD-ADMIN",
			levelName: "Mid",
			minSalary: 28000,
			maxSalary: 52000,
		},
	],
	[
		"Supervisor",
		{
			title: "Supervisor",
			code: "SUP",
			description: "Supervisor",
			departmentCode: "PROD-ADMIN",
			levelName: "Senior",
			minSalary: 45000,
			maxSalary: 75000,
		},
	],
	[
		"Engineer",
		{
			title: "Engineer",
			code: "ENG",
			description: "Engineer",
			departmentCode: "PROJ-ENG",
			levelName: "Mid",
			minSalary: 30000,
			maxSalary: 70000,
		},
	],
	[
		"Junior Supervisor",
		{
			title: "Junior Supervisor",
			code: "JR-SUP",
			description: "Junior supervisor",
			departmentCode: "PROD-ADMIN",
			levelName: "Junior",
			minSalary: 32000,
			maxSalary: 55000,
		},
	],
	[
		"Junior Engineer",
		{
			title: "Junior Engineer",
			code: "JR-ENG",
			description: "Junior engineer",
			departmentCode: "PROJ-ENG",
			levelName: "Junior",
			minSalary: 24000,
			maxSalary: 50000,
		},
	],
	[
		"Junior Specialist",
		{
			title: "Junior Specialist",
			code: "JR-SPEC",
			description: "Junior specialist",
			departmentCode: "PROD-ADMIN",
			levelName: "Junior",
			minSalary: 22000,
			maxSalary: 40000,
		},
	],
	[
		"Staff Engineer",
		{
			title: "Staff Engineer",
			code: "STF-ENG",
			description: "Staff engineer",
			departmentCode: "PROJ-ENG",
			levelName: "Mid",
			minSalary: 32000,
			maxSalary: 72000,
		},
	],
	[
		"Senior Staff",
		{
			title: "Senior Staff",
			code: "SR-STF",
			description: "Senior staff",
			departmentCode: "PROD-ADMIN",
			levelName: "Senior",
			minSalary: 35000,
			maxSalary: 60000,
		},
	],
	[
		"Staff",
		{
			title: "Staff",
			code: "STF",
			description: "Staff",
			departmentCode: "PROD-ADMIN",
			levelName: "Mid",
			minSalary: 22000,
			maxSalary: 42000,
		},
	],
	[
		"Senior Operator",
		{
			title: "Senior Operator",
			code: "SR-OPR",
			description: "Senior operator",
			departmentCode: "ASM",
			levelName: "Senior",
			minSalary: 30000,
			maxSalary: 50000,
		},
	],
	[
		"Operator",
		{
			title: "Operator",
			code: "OPR",
			description: "Operator",
			departmentCode: "ASM",
			levelName: "Entry",
			minSalary: 20000,
			maxSalary: 38000,
		},
	],
	[
		"Technician",
		{
			title: "Technician",
			code: "TECH",
			description: "Technician",
			departmentCode: "PROD-ADMIN",
			levelName: "Entry",
			minSalary: 22000,
			maxSalary: 40000,
		},
	],
	[
		"Deputy General Manager",
		{
			title: "Deputy General Manager",
			code: "DGM",
			description: "Deputy general manager",
			departmentCode: "STRAT-PLAN",
			levelName: "Director",
			minSalary: 120000,
			maxSalary: 180000,
		},
	],
	[
		"Senior Manager",
		{
			title: "Senior Manager",
			code: "SR-MGR",
			description: "Senior manager",
			departmentCode: "PROD-ADMIN",
			levelName: "Manager",
			minSalary: 90000,
			maxSalary: 150000,
		},
	],
	[
		"Management Trainee",
		{
			title: "Management Trainee",
			code: "MGMT-TRN",
			description: "Management trainee",
			departmentCode: "PROD-ADMIN",
			levelName: "Entry",
			minSalary: 18000,
			maxSalary: 32000,
		},
	],
	[
		"Factory Manager",
		{
			title: "Factory Manager",
			code: "FACT-MGR",
			description: "Factory manager",
			departmentCode: "PROD-ADMIN",
			levelName: "Manager",
			minSalary: 80000,
			maxSalary: 140000,
		},
	],
]);

const resolvePath = (value: string | undefined, fallback: string) =>
	path.resolve(process.cwd(), value && value.trim() ? value.trim() : fallback);

const sheetRowsFromWorkbook = <T extends CsvRow>(filePath: string, sheetName: string) => {
	const workbook = XLSX.readFile(filePath, { raw: false });
	if (!workbook.SheetNames.includes(sheetName)) {
		throw new Error(`Workbook ${filePath} does not contain required sheet ${sheetName}.`);
	}
	return XLSX.utils.sheet_to_json<T>(workbook.Sheets[sheetName], { raw: false, defval: null });
};

const rowsFromCsv = <T extends CsvRow>(filePath: string) => {
	const workbook = XLSX.readFile(filePath, { raw: false });
	const firstSheet = workbook.SheetNames[0];
	return XLSX.utils.sheet_to_json<T>(workbook.Sheets[firstSheet], { raw: false, defval: null });
};

const normalizeSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

const toKey = (value: string) =>
	normalizeSpaces(value)
		.toLowerCase()
		.replace(/\u00a0/g, " ");

const toNullableString = (value: unknown) => {
	if (value === null || value === undefined) return "";
	return String(value).trim();
};

const isTruthy = (value: unknown) => /^true$/i.test(toNullableString(value));

const ensureDir = (dirPath: string) => {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}
};

const zeroPad = (value: string) => value.padStart(2, "0");

const normalizeTime = (value: string) => {
	const trimmed = value.trim();
	const [hourRaw, minuteRaw] = trimmed.split(":");
	return `${zeroPad(hourRaw || "0")}:${zeroPad(minuteRaw || "0")}`;
};

const parseUsDate = (value: string | number | Date | null | undefined) => {
	if (value instanceof Date) {
		return {
			year: value.getFullYear(),
			month: value.getMonth() + 1,
			day: value.getDate(),
		};
	}

	const raw = toNullableString(value);
	const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
	if (!match) {
		throw new Error(`Unsupported date format: ${raw}`);
	}

	let year = Number(match[3]);
	if (year < 100) {
		year += 2000;
	}

	return {
		month: Number(match[1]),
		day: Number(match[2]),
		year,
	};
};

const toManilaDayStart = (parts: { year: number; month: number; day: number }) =>
	`${parts.year}-${zeroPad(String(parts.month))}-${zeroPad(String(parts.day))}T00:00:00+08:00`;

const toManilaDayEnd = (parts: { year: number; month: number; day: number }) =>
	`${parts.year}-${zeroPad(String(parts.month))}-${zeroPad(String(parts.day))}T23:59:59+08:00`;

const csvEscape = (value: unknown) => {
	if (value === null || value === undefined) return "";
	const stringValue =
		typeof value === "string" ? value : Array.isArray(value) || typeof value === "object" ? JSON.stringify(value) : String(value);
	if (/[",\n\r]/.test(stringValue)) {
		return `"${stringValue.replace(/"/g, "\"\"")}"`;
	}
	return stringValue;
};

const writeCsv = (filePath: string, headers: string[], rows: CsvRow[]) => {
	const lines = [headers.join(",")];
	for (const row of rows) {
		lines.push(headers.map((header) => csvEscape(row[header])).join(","));
	}
	fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
};

const normalizeDivisionName = (name: string) => {
	const compact = normalizeSpaces(name).replace(/\u00a0/g, " ");
	if (/^quality and compliance unit$/i.test(compact)) {
		return "Quality & Compliance Unit";
	}
	if (/^import and export\b/i.test(compact)) {
		return compact.replace(/^import and export/i, "Import/Export");
	}
	if (/^import and impex\b/i.test(compact)) {
		return compact.replace(/^import and impex/i, "Import/Export");
	}
	if (/^production planning\/purchasing$/i.test(compact)) {
		return "Production Planning/Purchasing";
	}
	if (/^purchasing\/product engineering\/product assura/i.test(compact)) {
		return "Purchasing/Product Engineering/Product Assurance";
	}
	if (/^purchasing\/product engineering\/product assura\.\.\.$/i.test(compact)) {
		return "Purchasing/Product Engineering/Product Assurance";
	}
	return compact;
};

const buildFallbackCode = (name: string) => {
	const tokens = normalizeDivisionName(name)
		.replace(/[()]/g, " ")
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean)
		.map((token) => TOKEN_CODE_MAP[token.toLowerCase()] || token.toUpperCase().slice(0, 4));
	const uniqueTokens = tokens.filter((token, index) => token && tokens.indexOf(token) === index);
	return uniqueTokens.join("-").slice(0, 30) || "DEPT";
};

const resolveSection = (row: SectionRow): NormalizedSection => {
	const rawName = toNullableString(row.DivisionName);
	if (!rawName) {
		throw new Error(`Section row is missing DivisionName for DivCode ${toNullableString(row.DivCode) || "unknown"}.`);
	}

	const normalizedName = normalizeDivisionName(rawName);
	const description = `Client section imported from ${isTruthy(row.Active) ? "active" : "inactive"} section export`;
	const numberedMatch = normalizedName.match(/^(.*?)(?:\s+)(\d+)$/);
	if (numberedMatch) {
		const baseName = normalizeDivisionName(numberedMatch[1]);
		const alias = PARENT_NAME_ALIASES.get(toKey(baseName));
		if (alias) {
			return {
				code: `${alias.code}-${numberedMatch[2]}`,
				name: `${alias.name} ${numberedMatch[2]}`,
				parentCode: alias.code,
				description,
				sourceDivCode: toNullableString(row.DivCode),
				dmApprover: toNullableString(row.DMApprover),
				dgmApprover: toNullableString(row.DGMApprover),
				maker: toNullableString(row.Maker),
				active: isTruthy(row.Active),
			};
		}
	}

	const alias = PARENT_NAME_ALIASES.get(toKey(normalizedName));
	if (alias) {
		return {
			code: alias.code,
			name: alias.name,
			description,
			sourceDivCode: toNullableString(row.DivCode),
			dmApprover: toNullableString(row.DMApprover),
			dgmApprover: toNullableString(row.DGMApprover),
			maker: toNullableString(row.Maker),
			active: isTruthy(row.Active),
		};
	}

	const standaloneCode =
		STANDALONE_DEPARTMENT_CODES.get(toKey(normalizedName)) || buildFallbackCode(normalizedName);

	return {
		code: standaloneCode,
		name: normalizedName,
		description,
		sourceDivCode: toNullableString(row.DivCode),
		dmApprover: toNullableString(row.DMApprover),
		dgmApprover: toNullableString(row.DGMApprover),
		maker: toNullableString(row.Maker),
		active: isTruthy(row.Active),
	};
};

const loadCanonicalDepartments = (sampleDepartmentsPath: string): DepartmentRow[] => {
	const rows = rowsFromCsv<DepartmentRow>(sampleDepartmentsPath);
	return rows.map((row) => ({
		code: toNullableString(row.code),
		name: toNullableString(row.name),
		description: toNullableString(row.description),
		parentCode: toNullableString(row.parentCode) || undefined,
	}));
};

const buildDepartmentRows = (params: {
	activeWorkbookSections: SectionRow[];
	inactiveCsvSections: SectionRow[];
	sampleDepartmentsPath: string;
}) => {
	const baseDepartments = loadCanonicalDepartments(params.sampleDepartmentsPath);
	const activeSections = params.activeWorkbookSections.map((row) =>
		resolveSection({ ...row, Active: "true" }),
	);
	const inactiveSections = params.inactiveCsvSections
		.filter((row) => !isTruthy(row.Active))
		.map((row) => resolveSection(row));

	const departmentMap = new Map<string, DepartmentRow>();
	for (const department of baseDepartments) {
		departmentMap.set(department.code, department);
	}

	for (const section of activeSections) {
		if (!departmentMap.has(section.code)) {
			departmentMap.set(section.code, {
				code: section.code,
				name: section.name,
				description: section.description,
				parentCode: section.parentCode,
			});
		}
	}

	return {
		departments: Array.from(departmentMap.values()).sort((left, right) =>
			left.code.localeCompare(right.code),
		),
		activeSections,
		inactiveSections,
	};
};

const buildPositionRows = (positionRows: PositionWorkbookRow[]) => {
	const seen = new Set<string>();
	const positions: PositionRow[] = [];
	const positionLevels: PositionLevelRow[] = [];

	for (const row of positionRows) {
		const title = toNullableString(row.EmpPosition);
		if (!title || seen.has(title)) continue;
		seen.add(title);

		const rule = CLIENT_POSITION_RULES.get(title);
		if (!rule) {
			throw new Error(`No client position mapping exists for title "${title}".`);
		}

		positions.push({
			title: rule.title,
			code: rule.code,
			description: rule.description,
			departmentCode: rule.departmentCode,
			minSalary: rule.minSalary,
			maxSalary: rule.maxSalary,
		});
		positionLevels.push({
			positionCode: rule.code,
			levelName: rule.levelName,
		});
	}

	return {
		positions: positions.sort((left, right) => left.code.localeCompare(right.code)),
		positionLevels: positionLevels.sort((left, right) =>
			left.positionCode.localeCompare(right.positionCode),
		),
	};
};

const buildShiftTypeRows = (shiftRows: ShiftRow[]) => {
	return shiftRows
		.map((row) => {
			const code = toNullableString(row.ShiftCode);
			if (!code) {
				throw new Error("Encountered shift row without ShiftCode.");
			}
			const startTime = normalizeTime(toNullableString(row.ShiftStart));
			const endTime = normalizeTime(toNullableString(row.ShiftEnd));
			const isOvernight = endTime < startTime;
			return {
				code,
				name: code,
				isOvernight,
				isOff: false,
				timeSlots: JSON.stringify([{ label: "work", startTime, endTime }]),
				isActive: true,
			};
		})
		.sort((left, right) => left.code.localeCompare(right.code));
};

const buildCalendarItemRows = (holidayRows: HolidayRow[]) => {
	return holidayRows
		.map((row) => {
			const description = toNullableString(row.Description);
			const holidayType = toNullableString(row.Type).toUpperCase() || "HOLIDAY";
			const dateParts = parseUsDate(row.Date);
			return {
				title: description,
				description,
				type: "HOLIDAY",
				startDate: toManilaDayStart(dateParts),
				endDate: toManilaDayEnd(dateParts),
				isAllDay: true,
				timezone: "Asia/Manila",
				year: dateParts.year,
				tags: JSON.stringify(["holiday", `source-code:${holidayType}`]),
				status: "ACTIVE",
			};
		})
		.sort((left, right) => left.startDate.localeCompare(right.startDate));
};

const holidaySignature = (row: HolidayRow) => {
	const dateParts = parseUsDate(row.Date);
	return [
		`${dateParts.year}-${zeroPad(String(dateParts.month))}-${zeroPad(String(dateParts.day))}`,
		toNullableString(row.Description),
		toNullableString(row.Type).toUpperCase(),
	].join("|");
};

const validateParity = (params: {
	workbookSections: SectionRow[];
	divisionsCsvRows: SectionRow[];
	workbookShiftRows: ShiftRow[];
	shiftCsvRows: ShiftRow[];
	workbookHolidayRows: HolidayRow[];
	holidayCsvRows: HolidayRow[];
}) => {
	const errors: string[] = [];

	const csvActiveSections = params.divisionsCsvRows.filter((row) => isTruthy(row.Active));
	if (params.workbookSections.length !== csvActiveSections.length) {
		errors.push(
			`SECTION active row count mismatch: workbook=${params.workbookSections.length}, csv=${csvActiveSections.length}.`,
		);
	}

	const workbookSectionNames = new Set(
		params.workbookSections.map((row) => normalizeDivisionName(toNullableString(row.DivisionName))),
	);
	const csvSectionNames = new Set(
		csvActiveSections.map((row) => normalizeDivisionName(toNullableString(row.DivisionName))),
	);
	for (const sectionName of workbookSectionNames) {
		if (!csvSectionNames.has(sectionName)) {
			errors.push(`Active section "${sectionName}" is missing from divisions_visible.csv.`);
		}
	}

	const workbookShiftCodes = new Set(
		params.workbookShiftRows.map((row) => toNullableString(row.ShiftCode)),
	);
	const csvShiftCodes = new Set(params.shiftCsvRows.map((row) => toNullableString(row.ShiftCode)));
	for (const shiftCode of workbookShiftCodes) {
		if (!csvShiftCodes.has(shiftCode)) {
			errors.push(`Shift code "${shiftCode}" is missing from shift_codes_visible.csv.`);
		}
	}
	for (const shiftCode of csvShiftCodes) {
		if (!workbookShiftCodes.has(shiftCode)) {
			errors.push(`Shift code "${shiftCode}" is missing from workbook SHIFT_TYPE sheet.`);
		}
	}

	const workbookHolidaySignatures = new Set(params.workbookHolidayRows.map((row) => holidaySignature(row)));
	const csvHolidaySignatures = new Set(params.holidayCsvRows.map((row) => holidaySignature(row)));
	for (const signature of workbookHolidaySignatures) {
		if (!csvHolidaySignatures.has(signature)) {
			errors.push(`Holiday "${signature}" is missing from holidays_visible.csv.`);
		}
	}
	for (const signature of csvHolidaySignatures) {
		if (!workbookHolidaySignatures.has(signature)) {
			errors.push(`Holiday "${signature}" is missing from workbook HOLIDAY sheet.`);
		}
	}

	return errors;
};

const writeSummary = (filePath: string, payload: Record<string, unknown>) => {
	fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const main = () => {
	const workbookPath = resolvePath(
		process.env.CLIENT_RECONCILIATION_WORKBOOK,
		DEFAULT_INPUTS.workbookPath,
	);
	const divisionsCsvPath = resolvePath(
		process.env.CLIENT_DIVISIONS_CSV,
		DEFAULT_INPUTS.divisionsCsvPath,
	);
	const holidaysCsvPath = resolvePath(
		process.env.CLIENT_HOLIDAYS_CSV,
		DEFAULT_INPUTS.holidaysCsvPath,
	);
	const shiftCodesCsvPath = resolvePath(
		process.env.CLIENT_SHIFT_CODES_CSV,
		DEFAULT_INPUTS.shiftCodesCsvPath,
	);
	const outputDir = resolvePath(process.env.CLIENT_REFERENCE_OUTPUT_DIR, DEFAULT_OUTPUT_DIR);
	const sampleDepartmentsPath = path.resolve(process.cwd(), "docs", "csv", "sample-departments.csv");

	const workbookSections = sheetRowsFromWorkbook<SectionRow>(workbookPath, "SECTION").filter((row) =>
		isTruthy(row.Active),
	);
	const workbookShifts = sheetRowsFromWorkbook<ShiftRow>(workbookPath, "SHIFT_TYPE");
	const workbookHolidays = sheetRowsFromWorkbook<HolidayRow>(workbookPath, "HOLIDAY");
	const workbookPositions = sheetRowsFromWorkbook<PositionWorkbookRow>(workbookPath, "POSITION");

	const divisionsCsvRows = rowsFromCsv<SectionRow>(divisionsCsvPath);
	const holidaysCsvRows = rowsFromCsv<HolidayRow>(holidaysCsvPath);
	const shiftCsvRows = rowsFromCsv<ShiftRow>(shiftCodesCsvPath);

	const parityErrors = validateParity({
		workbookSections,
		divisionsCsvRows,
		workbookShiftRows: workbookShifts,
		shiftCsvRows,
		workbookHolidayRows: workbookHolidays,
		holidayCsvRows: holidaysCsvRows,
	});

	if (parityErrors.length > 0) {
		throw new Error(`Client reference parity check failed:\n- ${parityErrors.join("\n- ")}`);
	}

	const { departments, activeSections, inactiveSections } = buildDepartmentRows({
		activeWorkbookSections: workbookSections,
		inactiveCsvSections: divisionsCsvRows,
		sampleDepartmentsPath,
	});
	const { positions, positionLevels } = buildPositionRows(workbookPositions);
	const shiftTypes = buildShiftTypeRows(workbookShifts);
	const calendarItems = buildCalendarItemRows(workbookHolidays);

	ensureDir(outputDir);

	writeCsv(
		path.join(outputDir, "departments.csv"),
		["code", "name", "description", "parentCode"],
		departments,
	);
	writeCsv(path.join(outputDir, "levels.csv"), ["name", "rank", "description"], CANONICAL_LEVELS);
	writeCsv(
		path.join(outputDir, "positions.csv"),
		["title", "code", "description", "departmentCode", "minSalary", "maxSalary"],
		positions,
	);
	writeCsv(
		path.join(outputDir, "position_levels.csv"),
		["positionCode", "levelName"],
		positionLevels,
	);
	writeCsv(
		path.join(outputDir, "shift_types.csv"),
		["code", "name", "isOvernight", "isOff", "timeSlots", "isActive"],
		shiftTypes,
	);
	writeCsv(
		path.join(outputDir, "calendar_items.csv"),
		[
			"title",
			"description",
			"type",
			"startDate",
			"endDate",
			"isAllDay",
			"timezone",
			"year",
			"tags",
			"status",
		],
		calendarItems,
	);
	writeCsv(
		path.join(outputDir, "client_inactive_sections.csv"),
		[
			"sourceDivCode",
			"name",
			"code",
			"parentCode",
			"dmApprover",
			"dgmApprover",
			"maker",
			"active",
		],
		inactiveSections,
	);

	writeSummary(path.join(outputDir, "client_reference_summary.json"), {
		inputs: {
			workbookPath,
			divisionsCsvPath,
			holidaysCsvPath,
			shiftCodesCsvPath,
		},
		outputDir,
		counts: {
			activeWorkbookSections: workbookSections.length,
			inactiveSections: inactiveSections.length,
			departments: departments.length,
			positions: positions.length,
			positionLevels: positionLevels.length,
			shiftTypes: shiftTypes.length,
			calendarItems: calendarItems.length,
		},
		outOfScope: [
			"DMApprover is not migrated without an employee crosswalk.",
			"DGMApprover is not migrated without a target-field decision.",
			"Maker is not migrated without a target-field decision.",
			"Schedule templates and employee-to-shift assignments are not generated from these exports.",
		],
	});

	console.log(
		JSON.stringify(
			{
				outputDir,
				counts: {
					activeWorkbookSections: workbookSections.length,
					departments: departments.length,
					positions: positions.length,
					positionLevels: positionLevels.length,
					shiftTypes: shiftTypes.length,
					calendarItems: calendarItems.length,
					inactiveSections: inactiveSections.length,
				},
			},
			null,
			2,
		),
	);
};

main();
