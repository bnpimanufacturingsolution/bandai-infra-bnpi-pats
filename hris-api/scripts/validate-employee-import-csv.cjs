const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const repoRoot = path.resolve(__dirname, "..", "..");
const employeeCsvRelativePath =
  process.argv[2] || "data/import/employees-import.csv";

const clean = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const normalizeKey = (value) => clean(value).toLowerCase();
const readCsv = (relativePath) => {
  const filePath = path.join(repoRoot, relativePath);
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const parseLine = (line) => {
    const values = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      if (char === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index++;
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
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
};

const EXPECTED_EMPLOYEE_HEADERS = [
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

const errors = [];
const warnings = [];

const readHeaders = (relativePath) => {
  const raw = fs.readFileSync(path.join(repoRoot, relativePath), "utf8").replace(/^\uFEFF/, "");
  return raw.split(/\r?\n/, 1)[0].split(",").map((header) => header.trim());
};

const assertHeaders = (relativePath, expected) => {
  const actual = readHeaders(relativePath);
  if (actual.join("|") !== expected.join("|")) {
    errors.push(`${relativePath}: headers mismatch. Expected ${expected.join(",")}; got ${actual.join(",")}`);
  }
};

assertHeaders(employeeCsvRelativePath, EXPECTED_EMPLOYEE_HEADERS);
assertHeaders("data/import/departments-import.csv", ["CODE", "NAME", "DESCRIPTION", "SCHEDULE", "IS_HR"]);
assertHeaders("data/import/sections-import.csv", ["CODE", "NAME", "DEPARTMENT", "DESCRIPTION", "IS_ACTIVE", "IS_HR"]);
if (fs.existsSync(path.join(repoRoot, "data/import/agencies-import.csv"))) {
  assertHeaders("data/import/agencies-import.csv", ["CODE", "NAME", "STATUS", "CONTACT_NAME", "CONTACT_EMAIL", "CONTACT_PHONE"]);
}

const departments = readCsv("data/import/departments-import.csv");
const sections = readCsv("data/import/sections-import.csv");
const positions = readCsv("data/import/positions-import.csv");
const agencies = fs.existsSync(path.join(repoRoot, "data/import/agencies-import.csv"))
  ? readCsv("data/import/agencies-import.csv")
  : [];
const levelsPath = path.join(repoRoot, "data/import/levels-import.csv");
const levels = fs.existsSync(levelsPath) ? readCsv("data/import/levels-import.csv") : [];
const employees = readCsv(employeeCsvRelativePath);

const departmentNames = new Set(departments.map((row) => normalizeKey(row.NAME)).filter(Boolean));
const departmentCodes = new Set(departments.map((row) => normalizeKey(row.CODE)).filter(Boolean));
const sectionNames = new Set(
  sections
    .filter((row) => departmentNames.has(normalizeKey(row.DEPARTMENT)))
    .map((row) => normalizeKey(row.NAME))
    .filter(Boolean),
);
const positionNames = new Set(positions.map((row) => normalizeKey(row.TITLE)).filter(Boolean));
const levelNames = new Set(levels.map((row) => normalizeKey(row.NAME)).filter(Boolean));
const agencyCodes = new Set(agencies.map((row) => normalizeKey(row.CODE)).filter(Boolean));
const managerLevels = new Set(
  levels
    .filter((row) => ["true", "1", "yes", "y"].includes(normalizeKey(row.IS_MANAGER)))
    .map((row) => clean(row.NAME))
    .filter(Boolean),
);

if (!sections.some((row) => normalizeKey(row.IS_HR) === "true")) {
  warnings.push("sections-import.csv: no section has IS_HR=TRUE; section-level HR markers will be unavailable after DM1 import.");
}
if (
  !departments.some((row) => normalizeKey(row.IS_HR) === "true") &&
  !sections.some((row) => normalizeKey(row.IS_HR) === "true")
) {
  warnings.push("departments-import.csv and sections-import.csv: no HR marker is TRUE; HR role derivation will not create HR actors from imported master data.");
}
if (levels.length > 0) {
  assertHeaders("data/import/levels-import.csv", ["NAME", "RANK", "DESCRIPTION", "IS_MANAGER"]);
}
if (levels.length > 0 && managerLevels.size === 0) {
  warnings.push("levels-import.csv: no level has IS_MANAGER=TRUE; imported employees with blank LEVEL will default to non-manager role derivation.");
}

sections.forEach((row, index) => {
  const department = normalizeKey(row.DEPARTMENT);
  if (!department) errors.push(`sections-import.csv row ${index + 2}: DEPARTMENT is required by backend importer.`);
  else if (!departmentNames.has(department) && !departmentCodes.has(department)) {
    errors.push(`sections-import.csv row ${index + 2}: department "${row.DEPARTMENT}" is not in departments-import.csv.`);
  }
});

positions.forEach((row, index) => {
  const departmentCode = normalizeKey(row.DEPARTMENT_CODE);
  if (departmentCode && !departmentCodes.has(departmentCode)) {
    errors.push(`positions-import.csv row ${index + 2}: DEPARTMENT_CODE "${row.DEPARTMENT_CODE}" is not in departments-import.csv.`);
  }
  const levelList = clean(row.LEVELS)
    .split(",")
    .map((item) => normalizeKey(item))
    .filter(Boolean);
  levelList.forEach((level) => {
    if (!levelNames.has(level)) errors.push(`positions-import.csv row ${index + 2}: LEVEL "${level}" is not in levels-import.csv.`);
  });
});

const employeeIds = new Map();
const tins = new Map();
const emails = new Map();
const validGenders = new Set(["male", "female", "other", "prefer_not_to_say", "unknown", "not_applicable", ""]);
const validPayFrequencies = new Set(["DAILY", "WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "QUARTERLY", "ANNUALLY"]);
const validWorkLocations = new Set(["ONSITE", "REMOTE", "HYBRID"]);
const validWorkforceSources = new Set(["DIRECT", "AGENCY"]);

employees.forEach((row, index) => {
  const rowNumber = index + 2;
  ["EMP_ID", "NAME", "POSITION", "DEPARTMENT", "BASIC_SALARY", "PAY_FREQUENCY", "HIRE_DATE"].forEach((field) => {
    if (!clean(row[field])) errors.push(`employees-import.csv row ${rowNumber}: ${field} is required.`);
  });
  if (!positionNames.has(normalizeKey(row.POSITION))) errors.push(`employees-import.csv row ${rowNumber}: POSITION "${row.POSITION}" is not in positions-import.csv.`);
  if (clean(row.LEVEL) && !levelNames.has(normalizeKey(row.LEVEL))) errors.push(`employees-import.csv row ${rowNumber}: LEVEL "${row.LEVEL}" is not in levels-import.csv.`);
  if (!departmentNames.has(normalizeKey(row.DEPARTMENT))) errors.push(`employees-import.csv row ${rowNumber}: DEPARTMENT "${row.DEPARTMENT}" is not in departments-import.csv.`);
  if (clean(row.SECTION) && !sectionNames.has(normalizeKey(row.SECTION))) errors.push(`employees-import.csv row ${rowNumber}: SECTION "${row.SECTION}" is not importable from sections-import.csv.`);
  if (!validGenders.has(normalizeKey(row.GENDER))) errors.push(`employees-import.csv row ${rowNumber}: GENDER "${row.GENDER}" is invalid.`);
  if (!validPayFrequencies.has(clean(row.PAY_FREQUENCY))) errors.push(`employees-import.csv row ${rowNumber}: PAY_FREQUENCY "${row.PAY_FREQUENCY}" is invalid.`);
  if (clean(row.WORK_LOCATION) && !validWorkLocations.has(clean(row.WORK_LOCATION))) errors.push(`employees-import.csv row ${rowNumber}: WORK_LOCATION "${row.WORK_LOCATION}" is invalid.`);
  if (clean(row.WORKFORCE_SOURCE) && !validWorkforceSources.has(clean(row.WORKFORCE_SOURCE))) errors.push(`employees-import.csv row ${rowNumber}: WORKFORCE_SOURCE "${row.WORKFORCE_SOURCE}" is invalid.`);
  if (clean(row.EMAIL) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(clean(row.EMAIL))) errors.push(`employees-import.csv row ${rowNumber}: EMAIL "${row.EMAIL}" is not a valid source email.`);
  if (Number.isNaN(Number(row.BASIC_SALARY))) errors.push(`employees-import.csv row ${rowNumber}: BASIC_SALARY "${row.BASIC_SALARY}" is not numeric.`);
  if (clean(row.AGENCY_CODE) && !agencyCodes.has(normalizeKey(row.AGENCY_CODE))) {
    errors.push(`employees-import.csv row ${rowNumber}: AGENCY_CODE "${row.AGENCY_CODE}" is not in agencies-import.csv.`);
  }
  ["HIRE_DATE", "START_DATE", "BIRTHDAY", "DATE_OF_RESIGNATION"].forEach((field) => {
    const value = clean(row[field]);
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors.push(`employees-import.csv row ${rowNumber}: ${field} "${value}" is not YYYY-MM-DD.`);
  });

  const employeeKey = normalizeKey(row.EMP_ID);
  if (employeeKey) {
    if (employeeIds.has(employeeKey)) warnings.push(`Duplicate EMP_ID ${row.EMP_ID}: rows ${employeeIds.get(employeeKey)} and ${rowNumber}.`);
    else employeeIds.set(employeeKey, rowNumber);
  }
  const tinKey = clean(row.TIN).replace(/\D/g, "");
  if (tinKey) {
    if (tins.has(tinKey)) warnings.push(`Duplicate TIN ${row.TIN}: rows ${tins.get(tinKey)} and ${rowNumber}.`);
    else tins.set(tinKey, rowNumber);
  }
  const emailKey = normalizeKey(row.EMAIL);
  if (emailKey) {
    if (emails.has(emailKey)) errors.push(`employees-import.csv row ${rowNumber}: duplicate EMAIL "${row.EMAIL}" also appears on row ${emails.get(emailKey)}.`);
    else emails.set(emailKey, rowNumber);
  }
});

console.log("Employee import dry validation");
console.log(`- employees=${employees.length}`);
console.log(`- departments=${departments.length}`);
console.log(`- sections=${sections.length}`);
console.log(`- positions=${positions.length}`);
console.log(`- levels=${levels.length}`);
console.log(`- manager levels=${Array.from(managerLevels).join(", ") || "(none)"}`);
console.log(`- errors=${errors.length}`);
console.log(`- warnings=${warnings.length}`);
warnings.slice(0, 20).forEach((warning) => console.log(`WARN ${warning}`));
errors.slice(0, 50).forEach((error) => console.log(`ERROR ${error}`));

if (errors.length) process.exitCode = 1;
