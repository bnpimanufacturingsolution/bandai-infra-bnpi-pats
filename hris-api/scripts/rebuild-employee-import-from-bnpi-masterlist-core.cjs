const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const XLSX = require("xlsx");

const repoRoot = path.resolve(__dirname, "..", "..");
const importDir = path.join(repoRoot, "data", "import");
const employeeMasterlistPath = path.join(repoRoot, "docs", "BNPI_MASTERLIST.xlsx");
const employeeMasterlistSheetName = "Manpower Databank";
const payrollComputationWorkbookPath = path.join(
  repoRoot,
  "docs",
  "HRIS Payroll Computation April 26 - May 10, 2026.xlsx",
);
const payrollComputationWorkbookPassword = "9090";
const reconciliationWorkbookPath = path.join(repoRoot, "data", "FROM_SCRSHOT_RECONCILLATION.xlsx");

const employeesCsvPath = path.join(importDir, "employees-import.csv");
const sectionsCsvPath = path.join(importDir, "sections-import.csv");
const levelsCsvPath = path.join(importDir, "levels-import.csv");
const assumptionsPath = path.join(importDir, "employee-import-assumptions.md");
const gapsPath = path.join(importDir, "employee-mapping-gaps.md");

const SECTION_HEADERS = ["CODE", "NAME", "DEPARTMENT", "DESCRIPTION", "IS_ACTIVE", "IS_HR"];
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

const VALID_GENDERS = new Set(["male", "female", "other", "prefer_not_to_say", "unknown", "not_applicable", ""]);
const VALID_PAY_FREQUENCIES = new Set(["DAILY", "WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "QUARTERLY", "ANNUALLY"]);

const clean = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeKey = (value) => clean(value).toLowerCase();
const normalizePayrollHeaderKey = (value) => normalizeKey(value).replace(/[^a-z0-9]+/g, " ").trim();
const isActiveManpowerDatabankRow = (row) => normalizeKey(row.Status || row.STATUS) === "active";
const cleanOptional = (value) => {
  const normalized = clean(value);
  return ["n/a", "na", "none", "-"].includes(normalizeKey(normalized)) ? "" : normalized;
};
const normalizeMatchKey = (value) =>
  normalizeKey(value)
    .replace(/&/g, " and ")
    .replace(/\bmaintenance\b/g, "")
    .replace(/\bdept\b/g, "department")
    .replace(/\bimpex\b/g, "import export")
    .replace(/\biso\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sectionBaseKey = (value) =>
  normalizeMatchKey(value).replace(/\s+\d+$/, "").trim();

const SECTION_CODE_OVERRIDES = new Map(Object.entries({
  "accounting": "ACC",
  "assembly": "ASY",
  "decoration": "DEC",
  "facilities": "FAC",
  "ga/hr": "GAHR",
  "injection and mold maintenance": "IMM",
  "president": "PRES",
  "process engineering": "PRE",
  "product engineering": "PDE",
  "production engineering": "PNE",
  "production planning": "PP",
  "project engineering": "PE",
  "purchasing": "PUR",
  "quality assurance": "QA",
  "quality control": "QC",
  "strategic planning": "SP",
  "warehouse": "WH",
}));

const SECTION_CODE_STOPWORDS = new Set(["and", "of", "the", "for"]);

const buildSectionCodeBase = (name) => {
  const raw = clean(name);
  const override = SECTION_CODE_OVERRIDES.get(normalizeKey(raw));
  if (override) return override;

  const tokens = raw
    .replace(/&/g, " and ")
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !SECTION_CODE_STOPWORDS.has(token.toLowerCase()));

  if (tokens.length === 0) return "SEC";
  if (tokens.length === 1) {
    const token = tokens[0].toUpperCase().replace(/[^A-Z0-9]/g, "");
    return token.slice(0, 3) || "SEC";
  }

  return tokens
    .map((token) => token.replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase())
    .join("")
    .slice(0, 8) || "SEC";
};

const assignSectionCodes = (sectionRows) => {
  const usedCodes = new Set();
  for (const row of sectionRows) {
    const base = buildSectionCodeBase(row.NAME);
    let code = base;
    let suffix = 2;
    while (usedCodes.has(code)) {
      const suffixText = String(suffix);
      code = `${base.slice(0, Math.max(1, 10 - suffixText.length))}${suffixText}`;
      suffix++;
    }
    row.CODE = code;
    usedCodes.add(code);
  }
};

const normalizeSourceEmail = (value) => {
  const email = clean(value).toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "";
  return email;
};

const csvEscape = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toNumberText = (value) => {
  const text = clean(value).replace(/,/g, "").replace(/[₱PHP\s]/gi, "");
  if (!text || text === "-") return "";
  const parsed = Number(text);
  return Number.isFinite(parsed) ? String(parsed) : "";
};

const exportProtectedWorkbookSheetToCsv = (workbookPath, password, sheetName) => {
  if (!fs.existsSync(workbookPath)) return null;
  if (process.platform !== "win32") return null;

  const exportPath = path.join(
    os.tmpdir(),
    `bnpi-payroll-${Date.now()}-${Math.random().toString(16).slice(2)}.csv`,
  );
  const psPath = path.join(
    os.tmpdir(),
    `bnpi-payroll-export-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`,
  );
  const script = `
$ErrorActionPreference = "Stop"
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $workbook = $excel.Workbooks.Open($env:BNPI_PAYROLL_WORKBOOK, 0, $true, 5, $env:BNPI_PAYROLL_PASSWORD)
  $worksheet = $workbook.Worksheets.Item($env:BNPI_PAYROLL_SHEET)
  $worksheet.Activate() | Out-Null
  if (Test-Path -LiteralPath $env:BNPI_PAYROLL_EXPORT) {
    Remove-Item -LiteralPath $env:BNPI_PAYROLL_EXPORT -Force
  }
  $workbook.SaveAs($env:BNPI_PAYROLL_EXPORT, 6)
  $workbook.Close($false)
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
`;
  fs.writeFileSync(psPath, script, "utf8");
  try {
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psPath],
      {
        stdio: "pipe",
        env: {
          ...process.env,
          BNPI_PAYROLL_WORKBOOK: workbookPath,
          BNPI_PAYROLL_PASSWORD: password,
          BNPI_PAYROLL_SHEET: sheetName,
          BNPI_PAYROLL_EXPORT: exportPath,
        },
      },
    );
    return fs.existsSync(exportPath) ? exportPath : null;
  } catch (error) {
    console.warn(
      `WARN Could not export protected payroll workbook with Excel COM: ${error.message}`,
    );
    return null;
  } finally {
    try {
      fs.unlinkSync(psPath);
    } catch {
      // ignore cleanup failure
    }
  }
};

const readPayrollSalaryByEmployeeId = (notes) => {
  const csvPath = exportProtectedWorkbookSheetToCsv(
    payrollComputationWorkbookPath,
    payrollComputationWorkbookPassword,
    "Sheet2",
  );
  if (!csvPath) {
    notes.salaryWorkbookStatus =
      "Payroll workbook salary extraction skipped: protected workbook export was unavailable.";
    return new Map();
  }

  try {
    const workbook = XLSX.read(fs.readFileSync(csvPath, "utf8"), { type: "string" });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Sheet1, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    const headerIndex = rows.findIndex((row) =>
      row.some((cell) => normalizePayrollHeaderKey(cell) === "emp no") &&
      row.some((cell) => normalizePayrollHeaderKey(cell) === "basic salary"),
    );
    if (headerIndex < 0) {
      notes.salaryWorkbookStatus =
        "Payroll workbook salary extraction failed: Sheet2 header row was not found.";
      return new Map();
    }

    const headers = rows[headerIndex].map(normalizePayrollHeaderKey);
    const empIndex = headers.indexOf("emp no");
    const basicSalaryIndex = headers.indexOf("basic salary");
    const salaryByEmployeeId = new Map();

    for (let index = headerIndex + 1; index < rows.length; index++) {
      const row = rows[index];
      const employeeId = clean(row[empIndex]);
      const salary = toNumberText(row[basicSalaryIndex]);
      if (!employeeId || !salary) continue;
      salaryByEmployeeId.set(employeeId.padStart(5, "0"), salary);
    }

    notes.salaryWorkbookStatus = `Payroll workbook Sheet2 Basic Salary extraction succeeded with ${salaryByEmployeeId.size} employee salary rows.`;
    return salaryByEmployeeId;
  } finally {
    try {
      fs.unlinkSync(csvPath);
    } catch {
      // ignore cleanup failure
    }
  }
};

const readCsv = (relativePath) => {
  const filePath = path.join(repoRoot, relativePath);
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return XLSX.utils.sheet_to_json(XLSX.read(raw, { type: "string" }).Sheets.Sheet1, {
    defval: "",
    raw: false,
  });
};

const writeCsv = (filePath, headers, rows) => {
  const lines = [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))];
  try {
    fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
  } catch (error) {
    if (error && error.code === "EBUSY") {
      const fallbackPath = `${filePath}.generated`;
      fs.writeFileSync(fallbackPath, `${lines.join("\n")}\n`, "utf8");
      console.warn(`WARN ${path.relative(repoRoot, filePath)} is locked; wrote ${path.relative(repoRoot, fallbackPath)} instead.`);
      return fallbackPath;
    }
    throw error;
  }
  return filePath;
};

const formatDate = (value) => {
  const raw = clean(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  let date;
  if (typeof value === "number") {
    date = new Date(Math.round((value - 25569) * 86400 * 1000));
  } else {
    date = new Date(raw);
  }
  if (Number.isNaN(date?.getTime())) return "";
  const year = date.getFullYear();
  if (year < 1900 || year > 9999) return "";
  return `${year}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const formatTin = (value) => {
  const raw = clean(value);
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
  return raw;
};

const normalizeStatutoryNumber = (value) => cleanOptional(value);

const normalizeEmployeeNo = (value, notes, context) => {
  const raw = clean(value);
  if (!raw) return "";
  if (/^\d{1,4}$/.test(raw)) {
    const padded = raw.padStart(5, "0");
    notes.employeeIds.push(`${context}: employee number "${raw}" padded to "${padded}".`);
    return padded;
  }
  return raw;
};

const normalizeGender = (value) => {
  const normalized = normalizeKey(value);
  if (!normalized) return "";
  if (["male", "m"].includes(normalized)) return "male";
  if (["female", "f"].includes(normalized)) return "female";
  return "";
};

const buildReferenceData = () => {
  const departments = readCsv("data/import/departments-import.csv");
  const sections = readCsv("data/import/sections-import.csv");
  const positions = readCsv("data/import/positions-import.csv");

  const departmentByName = new Map();
  const departmentByCode = new Map();
  for (const row of departments) {
    const code = clean(row.CODE);
    const name = clean(row.NAME);
    if (name) departmentByName.set(normalizeKey(name), name);
    if (code && name) departmentByCode.set(normalizeKey(code), name);
  }

  const sectionByName = new Map();
  const sectionByCode = new Map();
  const sectionNameCounts = new Map();
  const sectionByMatchKey = new Map();
  const sectionByBaseKey = new Map();
  for (const row of sections) {
    const code = clean(row.CODE);
    const name = clean(row.NAME);
    const department = clean(row.DEPARTMENT);
    if (!name || !department || !departmentByName.has(normalizeKey(department))) continue;
    sectionNameCounts.set(normalizeKey(name), (sectionNameCounts.get(normalizeKey(name)) || 0) + 1);
    sectionByName.set(normalizeKey(name), { name, department });
    if (code) sectionByCode.set(normalizeKey(code), { name, department });

    const matchKey = normalizeMatchKey(name);
    if (matchKey) {
      const matches = sectionByMatchKey.get(matchKey) || [];
      matches.push({ name, department });
      sectionByMatchKey.set(matchKey, matches);
    }

    const baseKey = sectionBaseKey(name);
    if (baseKey) {
      const baseMatches = sectionByBaseKey.get(baseKey) || [];
      baseMatches.push({ name, department });
      sectionByBaseKey.set(baseKey, baseMatches);
    }
  }

  const positionByName = new Map();
  for (const row of positions) {
    const title = clean(row.TITLE);
    if (title) positionByName.set(normalizeKey(title), title);
  }

  return {
    departmentByName,
    departmentByCode,
    sectionByName,
    sectionByCode,
    sectionNameCounts,
    sectionByMatchKey,
    sectionByBaseKey,
    positionByName,
  };
};

const SECTION_DEPARTMENT_ALIASES = new Map(Object.entries({
  "accounting": "Administration",
  "assembly": "Production",
  "business strategy/purchasing": "Business Strategy",
  "customer service": "N/A",
  "design / injection / molding": "Production",
  "design / molding": "Production",
  "decoration": "Production",
  "development": "Product Engineering",
  "ga/hr": "Administration",
  "import and export": "Purchasing",
  "import/export": "Purchasing",
  "injection": "Production",
  "injection / mold": "Production",
  "injection/mold": "Production",
  "injection and mold": "Production",
  "injection and mold maintenance": "Production",
  "mold maintenance": "Production",
  "mold/injection": "Production",
  "president": "N/A",
  "process engineering": "Product Engineering",
  "product engineering/customer service": "Product Engineering",
  "project engineering": "Product Engineering",
  "project engineering/customer service/purchasing": "Product Engineering",
  "project engineering/technical support": "Product Engineering",
  "production": "Production",
  "production 1": "Production",
  "production 2": "Production",
  "production engineering": "Product Engineering",
  "production engineering and assurance": "Product Engineering",
  "production/product assurance/business strategy/administration": "Production",
  "production/administration": "Production",
  "production planning": "Business Strategy",
  "production planning/customer service": "Business Strategy",
  "production planning/purchasing": "Business Strategy",
  "product assurance": "Product Assurance",
  "purchasing": "Purchasing",
  "purchasing/administration": "Purchasing",
  "purchasing/product engineering/product assurance": "Purchasing",
  "qcu/business strategy/customer service": "N/A",
  "quality assurance": "Product Assurance",
  "quality and compliance unit": "N/A",
  "quality control": "Product Assurance",
  "quality control /iso": "Product Assurance",
  "quality management": "Product Assurance",
  "sales": "N/A",
  "sales /customer service": "N/A",
  "strategic planning": "Business Strategy",
  "system affair": "Administration",
  "technical support": "N/A",
  "warehouse": "Purchasing",
  "warehouse/facilities": "Purchasing",
  "warehouse/facility": "Purchasing",
}));

const POSITION_ALIASES = new Map(Object.entries({
  "assistant supervisor": "Supervisor",
  "junior supervisor": "Supervisor",
  "line leader": "Senior Operator",
  "president": "Director",
  "production staff": "Operator",
}));

const buildDepartmentRefs = () => {
  const departments = readCsv("data/import/departments-import.csv");
  const departmentByName = new Map();
  const departmentByCode = new Map();
  for (const row of departments) {
    const code = clean(row.CODE);
    const name = clean(row.NAME);
    if (name) departmentByName.set(normalizeKey(name), name);
    if (code && name) departmentByCode.set(normalizeKey(code), name);
  }
  return { departmentByName, departmentByCode };
};

const resolveSectionDepartmentForImport = (sourceSection, sourceDepartment, departmentRefs) => {
  const sectionKey = normalizeKey(sourceSection);
  const departmentKey = normalizeKey(sourceDepartment);

  return (
    departmentRefs.departmentByName.get(departmentKey) ||
    departmentRefs.departmentByCode.get(departmentKey) ||
    SECTION_DEPARTMENT_ALIASES.get(sectionKey) ||
    SECTION_DEPARTMENT_ALIASES.get(departmentKey) ||
    "N/A"
  );
};

const buildSectionImportRows = (rawRows) => {
  const departmentRefs = buildDepartmentRefs();
  const sectionsByName = new Map();

  rawRows.forEach((rawRow) => {
    const row = {};
    for (const [key, value] of Object.entries(rawRow)) row[clean(key)] = value;

    const sourceSection = clean(row.Section);
    const sourceDepartment = clean(row.Department || row.Division);
    const sectionName = sourceSection || sourceDepartment;
    if (!sectionName) return;

    const key = normalizeKey(sectionName);
    if (!sectionsByName.has(key)) {
      sectionsByName.set(key, {
        CODE: "",
        NAME: sectionName,
        DEPARTMENT: resolveSectionDepartmentForImport(sectionName, sourceDepartment, departmentRefs),
        DESCRIPTION: "From Manpower Databank",
        IS_ACTIVE: "TRUE",
        IS_HR: normalizeKey(sectionName) === "ga/hr" ? "TRUE" : "FALSE",
      });
      return;
    }

    const existing = sectionsByName.get(key);
    if (existing.DEPARTMENT === "N/A") {
      existing.DEPARTMENT = resolveSectionDepartmentForImport(sectionName, sourceDepartment, departmentRefs);
    }
  });

  const rows = Array.from(sectionsByName.values()).sort((a, b) => a.NAME.localeCompare(b.NAME));
  assignSectionCodes(rows);
  return rows;
};

const resolveSectionAndDepartment = (sourceValue, refs, notes, context) => {
  const raw = clean(sourceValue);
  const key = normalizeKey(raw);
  if (!raw) {
    notes.departmentGaps.push(`${context}: blank source section/division; DEPARTMENT set to N/A and SECTION left blank.`);
    return { section: "", department: "N/A" };
  }

  const section = refs.sectionByCode.get(key) || refs.sectionByName.get(key);
  if (section && (refs.sectionNameCounts.get(key) || 0) <= 1) {
    notes.sectionMappings.push(`${context}: "${raw}" matched section "${section.name}" under department "${section.department}".`);
    return { section: section.name, department: section.department };
  }

  const matchKey = normalizeMatchKey(raw);
  const normalizedSectionMatches = refs.sectionByMatchKey.get(matchKey) || [];
  if (normalizedSectionMatches.length === 1) {
    const matched = normalizedSectionMatches[0];
    if (matched.name !== raw) notes.aliases.push(`${context}: source section "${raw}" -> section "${matched.name}".`);
    notes.sectionMappings.push(`${context}: "${raw}" matched section "${matched.name}" under department "${matched.department}".`);
    return { section: matched.name, department: matched.department };
  }

  const baseMatches = refs.sectionByBaseKey.get(sectionBaseKey(raw)) || [];
  if (baseMatches.length === 1) {
    const matched = baseMatches[0];
    notes.aliases.push(`${context}: source section "${raw}" -> section "${matched.name}".`);
    notes.sectionMappings.push(`${context}: "${raw}" matched section "${matched.name}" under department "${matched.department}".`);
    return { section: matched.name, department: matched.department };
  }
  if (baseMatches.length > 1 || normalizedSectionMatches.length > 1) {
    const candidates = (baseMatches.length > 1 ? baseMatches : normalizedSectionMatches)
      .map((match) => match.name)
      .sort()
      .join(", ");
    const department = refs.departmentByCode.get(key) || refs.departmentByName.get(key) || SECTION_DEPARTMENT_ALIASES.get(key) || "N/A";
    notes.sectionGaps.push(`${context}: source section "${raw}" has multiple existing section candidates (${candidates}); DEPARTMENT set to ${department} and SECTION left blank.`);
    return { section: "", department };
  }

  const department = refs.departmentByCode.get(key) || refs.departmentByName.get(key) || SECTION_DEPARTMENT_ALIASES.get(key);
  if (department) {
    if (SECTION_DEPARTMENT_ALIASES.has(key)) notes.aliases.push(`${context}: Manpower Databank section "${raw}" -> department "${department}".`);
    notes.sectionGaps.push(`${context}: source section "${raw}" mapped only to department "${department}"; no unique section match exists.`);
    return { section: "", department };
  }

  notes.departmentGaps.push(`${context}: unresolved Manpower Databank org value "${raw}"; DEPARTMENT set to N/A and SECTION left blank.`);
  return { section: "", department: "N/A" };
};

const resolvePosition = (sourceValue, refs, notes, context) => {
  const raw = clean(sourceValue);
  const key = normalizeKey(raw);
  if (!raw) {
    notes.positionGaps.push(`${context}: blank source position; POSITION set to Staff.`);
    return "Staff";
  }
  if (refs.positionByName.has(key)) return refs.positionByName.get(key);
  if (POSITION_ALIASES.has(key)) {
    const mapped = POSITION_ALIASES.get(key);
    notes.aliases.push(`${context}: Manpower Databank position "${raw}" -> "${mapped}".`);
    return mapped;
  }
  notes.positionGaps.push(`${context}: unresolved position "${raw}"; POSITION set to Staff.`);
  return "Staff";
};

const mapEmployeeMasterlistRow = (rawRow, sheetName, index, refs, notes, salaryByEmployeeId) => {
  const row = {};
  for (const [key, value] of Object.entries(rawRow)) row[clean(key)] = value;

  const sourceRowNumber = Number.isFinite(Number(rawRow.__rowNum__))
    ? Number(rawRow.__rowNum__) + 1
    : index + 4;
  const rawEmployeeNo = clean(row["No."] || row["Employee No."] || row["Employee No"] || row["S.N."]);
  const context = `${sheetName} row ${sourceRowNumber}${rawEmployeeNo ? ` EMP_ID ${rawEmployeeNo}` : ""}`;
  const employeeNo = normalizeEmployeeNo(rawEmployeeNo, notes, context);
  const fullName = clean(row["Employee Name"]);
  if (!employeeNo || !fullName) {
    notes.missingRequired.push(`${context}: missing Employee No. or Employee Name; row excluded.`);
    return null;
  }

  const lastName = cleanOptional(row["Last Name"] || row["Last Name "]);
  const firstName = cleanOptional(row["First Name"] || row["First Name "]);
  const middleName = cleanOptional(row["Middle Name"]);
  const canonicalName = lastName && firstName ? `${lastName}, ${[firstName, middleName].filter(Boolean).join(" ")}` : fullName;
  const sourceSection = clean(row.Section);
  const sourceDivision = clean(row.Department || row.Division);
  const sourceOrg = sourceSection || sourceDivision;
  const position = resolvePosition(row.Position, refs, notes, context);
  const org = resolveSectionAndDepartment(sourceOrg, refs, notes, context);
  const hireDate = formatDate(row["Date Hired"]);
  const birthday = formatDate(row.Birthday || row["Birthday "]);
  const resignationDate = formatDate(row["Resignation date"] || row["Date of Resignation"] || row["DATE of RESIGNATION"]);
  const sourceStatus = clean(row.Status || row["Active as of Dec. 2025"] || row["Active as of Dec.2024"] || row.STATUS);
  const rawTin = clean(row.TIN);
  const tin = formatTin(row.TIN);
  const officialEmail = normalizeSourceEmail(row["Official Email Address"]);
  const personalEmail = normalizeSourceEmail(row["Email Address"]);
  const sourceEmail = officialEmail || personalEmail;
  const workforceSource = normalizeKey(row["Employment Status"]).includes("recruitment") ? "AGENCY" : "DIRECT";
  const previousEmployer =
    cleanOptional(row["If yes, what is the name of company"]) ||
    cleanOptional(row["Previous Employer"]);
  const basicSalary = salaryByEmployeeId.get(employeeNo) || "0";

  if (!hireDate) notes.missingRequired.push(`${context}: Date Hired is blank/invalid; HIRE_DATE left blank.`);
  if (!birthday && clean(row.Birthday || row["Birthday "])) notes.reviewRows.push(`${context}: Birthday "${clean(row.Birthday || row["Birthday "])}" could not be normalized.`);
  if (resignationDate) notes.reviewRows.push(`${context}: source resignation date ${resignationDate}; employee status remains source metadata only.`);
  if (tin && tin !== rawTin) notes.tinFormatting.push(`${context}: TIN "${rawTin}" formatted as "${tin}" without branch code.`);

  return {
    EMP_ID: employeeNo,
    NAME: canonicalName,
    REPORT_TO_EMP_ID: "",
    POSITION: position,
    LEVEL: "",
    DEPARTMENT: org.department,
    SECTION: org.section,
    GENDER: normalizeGender(row.Gender),
    NATIONALITY: cleanOptional(row.Nationality) || "Filipino",
    BASIC_SALARY: basicSalary,
    PAY_FREQUENCY: "SEMI_MONTHLY",
    HIRE_DATE: hireDate,
    START_DATE: hireDate,
    EMAIL: sourceEmail,
    ROLE: "hris-employee",
    SCHEDULE: "",
    TIN: tin,
    PREVIOUS_EMPLOYER: previousEmployer,
    CIVIL_STATUS: cleanOptional(row["Civil Status"] || row.STATUS || row.Status),
    NO_OF_DEPENDENTS: clean(row["No. of Dependents"] || row["NO OF DEPENDENTS"]),
    DATE_OF_RESIGNATION: resignationDate,
    SOURCE_STATUS: sourceStatus,
    SSS: normalizeStatutoryNumber(row.SSS),
    PHILHEALTH: normalizeStatutoryNumber(row.PHIC || row.PHILHEALTH),
    PAGIBIG: normalizeStatutoryNumber(row.HDMF || row.PAGIBIG),
    DEVICE_ID: employeeNo,
    PHONE: cleanOptional(row["Contact No. "] || row["Contact No."]),
    BIRTHDAY: birthday,
    PLACE_OF_BIRTH: "",
    STREET: clean(row["Present Address"] || row["Registered Address"]),
    CITY: "",
    STATE: "",
    COUNTRY: "Philippines",
    POSTAL_CODE: clean(row["Zip Code"]),
    WORK_LOCATION: "ONSITE",
    WORKFORCE_SOURCE: workforceSource,
    AGENCY_CODE: "",
    CURRENCY: "PHP",
    SOURCE_WORKBOOK: "docs/BNPI_MASTERLIST.xlsx",
    SOURCE_SHEET: sheetName,
    SOURCE_ROW: String(sourceRowNumber),
    _source: context,
    _sourceOrg: sourceOrg,
    _sourceSheet: sheetName,
    _sourceRow: String(sourceRowNumber),
  };
};

const validateRows = (rows, refs) => {
  const errors = [];
  const warnings = [];
  const employeeIds = new Map();
  const tins = new Map();

  rows.forEach((row, index) => {
    const rowNum = index + 2;
    for (const field of ["EMP_ID", "NAME", "POSITION", "DEPARTMENT", "BASIC_SALARY", "PAY_FREQUENCY", "HIRE_DATE"]) {
      if (!clean(row[field])) errors.push(`Row ${rowNum}: ${field} is required`);
    }
    if (!refs.positionByName.has(normalizeKey(row.POSITION))) errors.push(`Row ${rowNum}: POSITION "${row.POSITION}" is not in positions-import.csv`);
    if (!refs.departmentByName.has(normalizeKey(row.DEPARTMENT))) errors.push(`Row ${rowNum}: DEPARTMENT "${row.DEPARTMENT}" is not in departments-import.csv`);
    if (row.SECTION && !refs.sectionByName.has(normalizeKey(row.SECTION))) errors.push(`Row ${rowNum}: SECTION "${row.SECTION}" is not in sections-import.csv`);
    if (!VALID_PAY_FREQUENCIES.has(row.PAY_FREQUENCY)) errors.push(`Row ${rowNum}: PAY_FREQUENCY "${row.PAY_FREQUENCY}" is invalid`);
    if (!VALID_GENDERS.has(normalizeKey(row.GENDER))) errors.push(`Row ${rowNum}: GENDER "${row.GENDER}" is invalid`);
    if (clean(row.EMAIL) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(clean(row.EMAIL))) errors.push(`Row ${rowNum}: EMAIL "${row.EMAIL}" is not a valid email address`);
    if (Number.isNaN(Number(row.BASIC_SALARY))) errors.push(`Row ${rowNum}: BASIC_SALARY "${row.BASIC_SALARY}" is not numeric`);
    for (const dateField of ["HIRE_DATE", "START_DATE", "BIRTHDAY", "DATE_OF_RESIGNATION"]) {
      const value = clean(row[dateField]);
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors.push(`Row ${rowNum}: ${dateField} "${value}" is not YYYY-MM-DD`);
    }
    const empKey = normalizeKey(row.EMP_ID);
    if (empKey) {
      if (employeeIds.has(empKey)) warnings.push(`Duplicate EMP_ID ${row.EMP_ID}: rows ${employeeIds.get(empKey)} and ${rowNum}`);
      else employeeIds.set(empKey, rowNum);
    }
    const tinKey = clean(row.TIN).replace(/\D/g, "");
    if (tinKey) {
      if (tins.has(tinKey)) warnings.push(`Duplicate TIN ${row.TIN}: rows ${tins.get(tinKey)} and ${rowNum}`);
      else tins.set(tinKey, rowNum);
    }
  });

  const emails = new Map();
  rows.forEach((row, index) => {
    const emailKey = normalizeKey(row.EMAIL);
    if (!emailKey) return;
    const rowNum = index + 2;
    if (emails.has(emailKey)) errors.push(`Duplicate EMAIL ${row.EMAIL}: rows ${emails.get(emailKey)} and ${rowNum}`);
    else emails.set(emailKey, rowNum);
  });
  return { errors, warnings };
};

const writeMarkdown = (notes, rows, validation, sheetStats) => {
  const assumptions = [
    "# Employee Import Assumptions",
    "",
    `Generated from active \`Status=Active\` rows in \`docs/BNPI_MASTERLIST.xlsx\` sheet \`${employeeMasterlistSheetName}\` using ${rows.length} import rows.`,
    "",
    "## Workbook Sheets Used",
    ...sheetStats.map((line) => `- ${line}`),
    "",
    "## Default Values Used",
    `- \`BASIC_SALARY\` is sourced from \`docs/HRIS Payroll Computation April 26 - May 10, 2026.xlsx\` Sheet2 using password \`${payrollComputationWorkbookPassword}\`. ${notes.salaryWorkbookStatus}`,
    "- `PAY_FREQUENCY=SEMI_MONTHLY`, `CURRENCY=PHP`, and `WORK_LOCATION=ONSITE`.",
    "- `WORKFORCE_SOURCE` is `AGENCY` for BNPI `Employment Status=Recruitment Program`; otherwise it is `DIRECT`.",
    "- `NATIONALITY` uses the BNPI masterlist value when present; `COUNTRY=Philippines`, and `DEVICE_ID` mirrors `EMP_ID`.",
    "- `START_DATE` mirrors `HIRE_DATE`; the workbook exposes one employment date labelled Date Hired.",
    "- `EMAIL` uses source email from `Official Email Address`, falling back to `Email Address`, from the BNPI masterlist; missing values stay blank and are not generated.",
    "- `SSS`, `PHILHEALTH`, and `PAGIBIG` come from BNPI masterlist columns `SSS`, `PHIC`, and `HDMF`.",
    "",
    "## Section Import",
    `- \`sections-import.csv\` was regenerated from ${notes.sectionImportRows} unique active Manpower Databank section names.`,
    "- Section `CODE` values are stable readable acronyms generated from section `NAME`; duplicate acronym bases receive deterministic numeric suffixes.",
    "- Section `DESCRIPTION` is `From Manpower Databank`.",
    "",
    "## Employee Import Fields",
    "- The canonical CSV is schema/import-contract based and carries `SOURCE_SHEET` and `SOURCE_ROW` so imported employee metadata can be traced back to Manpower Databank.",
    "- `POSITION`, `DEPARTMENT`, and `SECTION` are the import-ready mapped values from Manpower Databank.",
    "- `SECTION` uses the Manpower Databank section wording and is not forced to pre-existing split section names.",
    "- `PREVIOUS_EMPLOYER`, `CIVIL_STATUS`, `NO_OF_DEPENDENTS`, `DATE_OF_RESIGNATION`, `SOURCE_STATUS`, statutory IDs, source email, and phone are retained because the current employee importer accepts them.",
    "- Resignation dates and active/inactive status are source information only; lifecycle updates still require the HRIS employee import behavior or an approved separation workflow.",
    "",
    "## Level Import",
    "- No level master CSV was generated in strict mode because the BNPI masterlist has no explicit level/rank/grade column.",
    "- Employee `LEVEL` values are blank unless a verified source or explicit user-approved mapping is supplied.",
    "",
    "## Position-To-Level Assumptions",
    "- None. Position-to-level inference is intentionally disabled for this strict run.",
    "",
    "## Aliases Applied",
    ...(notes.aliases.length ? notes.aliases.map((line) => `- ${line}`) : ["- None."]),
    "",
    "## Section Matches Applied",
    ...(notes.sectionMappings.length ? notes.sectionMappings.map((line) => `- ${line}`) : ["- None."]),
    "",
    "## TIN Formatting",
    "- 9-digit TIN values were formatted as `000-000-000`; no branch code was invented.",
    ...notes.tinFormatting.slice(0, 50).map((line) => `- ${line}`),
    ...(notes.tinFormatting.length > 50 ? [`- ...and ${notes.tinFormatting.length - 50} more TIN formatting entries.`] : []),
    "",
    "## Employee Number Formatting",
    "- Numeric employee numbers shorter than five digits were left-padded to match the BNPI employee-code pattern.",
    ...notes.employeeIds.slice(0, 50).map((line) => `- ${line}`),
    ...(notes.employeeIds.length > 50 ? [`- ...and ${notes.employeeIds.length - 50} more employee number padding entries.`] : []),
    "",
    "## Email Source",
    "- Missing source emails are left blank. DM3 employee import must not invent contact emails from employee names.",
    "- Existing CSV rows do not carry passwords; the backend generates passwords during account provisioning and returns them through `credentialExports`.",
    ...(notes.emailDuplicates.length ? notes.emailDuplicates.slice(0, 50).map((line) => `- ${line}`) : ["- No duplicate source emails found."]),
    ...(notes.emailDuplicates.length > 50 ? [`- ...and ${notes.emailDuplicates.length - 50} more duplicate email suffix assignments.`] : []),
    ...(notes.emailGaps.length ? notes.emailGaps.map((line) => `- ${line}`) : []),
    "",
    "## Dry Validation",
    `- Errors: ${validation.errors.length}`,
    `- Warnings: ${validation.warnings.length}`,
  ];

  const gaps = [
    "# Employee Import Mapping Gaps",
    "",
    "## Unresolved Departments",
    ...(notes.departmentGaps.length ? notes.departmentGaps.map((line) => `- ${line}`) : ["- None."]),
    "",
    "## Unresolved Sections",
    ...(notes.sectionGaps.length ? notes.sectionGaps.map((line) => `- ${line}`) : ["- None."]),
    "",
    "## Unresolved Positions",
    ...(notes.positionGaps.length ? notes.positionGaps.map((line) => `- ${line}`) : ["- None."]),
    "",
    "## Missing Required Fields",
    ...(notes.missingRequired.length ? notes.missingRequired.map((line) => `- ${line}`) : ["- None."]),
    "",
    "## Level Mapping Review",
    "- BNPI masterlist has no explicit level/rank/grade column; employee LEVEL remains blank by approved optional-level contract.",
    "",
    "## Duplicate Employee Numbers",
    ...validation.warnings.filter((line) => line.includes("Duplicate EMP_ID")).map((line) => `- ${line}`),
    ...(validation.warnings.some((line) => line.includes("Duplicate EMP_ID")) ? [] : ["- None."]),
    "",
    "## Duplicate TINs",
    ...validation.warnings.filter((line) => line.includes("Duplicate TIN")).map((line) => `- ${line}`),
    ...(validation.warnings.some((line) => line.includes("Duplicate TIN")) ? [] : ["- None."]),
    "",
    "## Duplicate Source Emails",
    ...(notes.emailDuplicates.length ? notes.emailDuplicates.map((line) => `- ${line}`) : ["- No duplicate source emails found."]),
    ...(notes.emailGaps.length ? notes.emailGaps.map((line) => `- ${line}`) : []),
    "",
    "## Rows That May Import But Need Human Review",
    ...(notes.reviewRows.length ? notes.reviewRows.map((line) => `- ${line}`) : ["- None."]),
    "",
    "## Dry Validation Errors",
    ...(validation.errors.length ? validation.errors.map((line) => `- ${line}`) : ["- None."]),
  ];

  fs.writeFileSync(assumptionsPath, `${assumptions.join("\n")}\n`, "utf8");
  fs.writeFileSync(gapsPath, `${gaps.join("\n")}\n`, "utf8");
};

const main = () => {
  XLSX.readFile(reconciliationWorkbookPath);

  const workbook = XLSX.readFile(employeeMasterlistPath, { cellDates: false });
  const preferredSheetOrder = [employeeMasterlistSheetName];
  const sourceRowsBySheet = new Map();
  const rawRowsForSections = [];

  for (const sheetName of preferredSheetOrder) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;
    const sheetOptions = {
      defval: "",
      raw: false,
      blankrows: false,
      ...(sheetName === employeeMasterlistSheetName ? { range: 2 } : {}),
    };
    const rows = XLSX.utils.sheet_to_json(worksheet, sheetOptions);
    const activeRows = rows.filter(isActiveManpowerDatabankRow);
    sourceRowsBySheet.set(sheetName, {
      allRows: rows,
      activeRows,
    });
    rawRowsForSections.push(...activeRows);
  }

  const sectionRows = buildSectionImportRows(rawRowsForSections);
  writeCsv(sectionsCsvPath, SECTION_HEADERS, sectionRows);

  const refs = buildReferenceData();
  const notes = {
    aliases: [],
    levels: new Set(),
    tinFormatting: [],
    employeeIds: [],
    departmentGaps: [],
    positionGaps: [],
    levelGaps: [],
    missingRequired: [],
    reviewRows: [],
    sectionMappings: [],
    sectionGaps: [],
    emailDuplicates: [],
    emailGaps: [],
    salaryWorkbookStatus: "",
    sectionImportRows: sectionRows.length,
  };
  const salaryByEmployeeId = readPayrollSalaryByEmployeeId(notes);

  const rowsByEmployeeId = new Map();
  const sheetStats = [];

  for (const sheetName of preferredSheetOrder) {
    const sourceRows = sourceRowsBySheet.get(sheetName) || { allRows: [], activeRows: [] };
    const rows = sourceRows.activeRows;
    let used = 0;
    for (const [index, rawRow] of rows.entries()) {
      const mapped = mapEmployeeMasterlistRow(rawRow, sheetName, index, refs, notes, salaryByEmployeeId);
      if (!mapped) continue;
      const key = normalizeKey(mapped.EMP_ID);
      if (rowsByEmployeeId.has(key)) {
        notes.reviewRows.push(`${mapped._source}: duplicate employee number already loaded from ${rowsByEmployeeId.get(key)._source}; row excluded.`);
        continue;
      }
      rowsByEmployeeId.set(key, mapped);
      used++;
    }
    sheetStats.push(`${sheetName}: ${used} active rows used from ${sourceRows.allRows.length} keyed source rows`);
  }

  const rows = Array.from(rowsByEmployeeId.values()).sort((a, b) => a.EMP_ID.localeCompare(b.EMP_ID));
  const validation = validateRows(rows, refs);
  writeCsv(employeesCsvPath, EMPLOYEE_HEADERS, rows);
  writeMarkdown(notes, rows, validation, sheetStats);

  console.log("Employee import CSV generated");
  console.log(`- rows=${rows.length}`);
  console.log(`- source=${path.relative(repoRoot, employeeMasterlistPath)}:${employeeMasterlistSheetName}`);
  console.log(`- levels=skipped (no explicit BNPI masterlist level/rank source)`);
  console.log(`- csv=${path.relative(repoRoot, employeesCsvPath)}`);
  console.log(`- assumptions=${path.relative(repoRoot, assumptionsPath)}`);
  console.log(`- gaps=${path.relative(repoRoot, gapsPath)}`);
  console.log(`- sheets=${sheetStats.join("; ")}`);
  console.log(`- validation errors=${validation.errors.length}`);
  console.log(`- validation warnings=${validation.warnings.length}`);
  if (validation.errors.length) {
    validation.errors.slice(0, 20).forEach((error) => console.log(`ERROR ${error}`));
    process.exitCode = 1;
  }
};

main();
