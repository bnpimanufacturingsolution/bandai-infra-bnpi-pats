import Papa from "papaparse";
import {
	ALL_BENEFIT_ENROLLMENT_IMPORT_FIELDS,
	BENEFIT_ENROLLMENT_TEMPLATE_EXAMPLE_ROW,
	BENEFIT_ENROLLMENT_TEMPLATE_HEADERS,
} from "~/constants/benefit-enrollment-import-fields";
import { autoMapHeaders } from "~/lib/helpers/import.helpers";

export type ParsedWorkbook = {
	headers: string[];
	rows: string[][];
};

function isExcelFile(file: File): boolean {
	const name = file.name.toLowerCase();
	return name.endsWith(".xlsx") || name.endsWith(".xls");
}

function isCsvFile(file: File): boolean {
	return file.name.toLowerCase().endsWith(".csv");
}

/**
 * Parse CSV or Excel into string headers + row matrix.
 * Excel uses dynamic import of `xlsx` when available.
 */
export async function parseEnrollmentWorkbook(file: File): Promise<ParsedWorkbook> {
	if (isCsvFile(file)) {
		return parseCsvWorkbook(file);
	}
	if (isExcelFile(file)) {
		return parseExcelWorkbook(file);
	}
	throw new Error("Unsupported file type. Upload a .csv, .xlsx, or .xls file.");
}

function parseCsvWorkbook(file: File): Promise<ParsedWorkbook> {
	return new Promise((resolve, reject) => {
		Papa.parse<string[]>(file, {
			skipEmptyLines: true,
			complete: (results) => {
				const allRows = (results.data || []) as string[][];
				const validRows = allRows.filter(
					(row) =>
						Array.isArray(row) &&
						row.some((cell) => String(cell ?? "").trim() !== ""),
				);
				if (validRows.length === 0) {
					reject(new Error("File is empty"));
					return;
				}
				const headers = validRows[0].map((h) => String(h ?? "").trim());
				const rows = validRows.slice(1).map((row) =>
					headers.map((_, i) => String(row[i] ?? "").trim()),
				);
				resolve({ headers, rows });
			},
			error: (error) => reject(new Error(error.message || "Failed to parse CSV")),
		});
	});
}

async function parseExcelWorkbook(file: File): Promise<ParsedWorkbook> {
	let xlsx: typeof import("xlsx");
	try {
		xlsx = await import("xlsx");
	} catch {
		throw new Error(
			"Excel support is not available. Convert the file to CSV, or install the xlsx package.",
		);
	}

	const buffer = await file.arrayBuffer();
	const workbook = xlsx.read(buffer, { type: "array", cellDates: true });
	const sheetName = workbook.SheetNames[0];
	if (!sheetName) throw new Error("File has no worksheets");
	const sheet = workbook.Sheets[sheetName];
	const matrix = xlsx.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
		header: 1,
		defval: "",
		raw: false,
	});

	const validRows = matrix.filter(
		(row) =>
			Array.isArray(row) && row.some((cell) => String(cell ?? "").trim() !== ""),
	);
	if (validRows.length === 0) throw new Error("File is empty");

	const headers = validRows[0].map((h) => String(h ?? "").trim());
	const rows = validRows.slice(1).map((row) =>
		headers.map((_, i) => {
			const cell = row[i];
			if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
				const dd = String(cell.getDate()).padStart(2, "0");
				const mm = String(cell.getMonth() + 1).padStart(2, "0");
				const yyyy = cell.getFullYear();
				return `${dd}/${mm}/${yyyy}`;
			}
			return String(cell ?? "").trim();
		}),
	);
	return { headers, rows };
}

export function autoMapBenefitEnrollmentHeaders(headers: string[]): Record<string, string> {
	return autoMapHeaders(headers, ALL_BENEFIT_ENROLLMENT_IMPORT_FIELDS);
}

/**
 * Required map check: EMPLOYEE_NUMBER, AMOUNT, START_DATE, and BENEFIT_CODE or BENEFIT_TYPE.
 */
export function getMissingRequiredBenefitMaps(
	columnMapping: Record<string, string>,
): string[] {
	const missing: string[] = [];
	for (const key of ["EMPLOYEE_NUMBER", "AMOUNT", "START_DATE"] as const) {
		if (!columnMapping[key]) missing.push(key);
	}
	if (!columnMapping.BENEFIT_CODE && !columnMapping.BENEFIT_TYPE) {
		missing.push("BENEFIT_CODE or BENEFIT_TYPE");
	}
	return missing;
}

export type MappedEnrollmentRow = Record<string, string>;

export function applyBenefitColumnMapping(
	headers: string[],
	rows: string[][],
	columnMapping: Record<string, string>,
): MappedEnrollmentRow[] {
	const headerIndex = new Map(headers.map((h, i) => [h, i]));
	return rows.map((row) => {
		const mapped: MappedEnrollmentRow = {};
		for (const [canonical, sourceHeader] of Object.entries(columnMapping)) {
			if (!sourceHeader) continue;
			const idx = headerIndex.get(sourceHeader);
			mapped[canonical] = idx === undefined ? "" : String(row[idx] ?? "").trim();
		}
		return mapped;
	});
}

export type BenefitImportPreviewIssue = {
	row: number;
	field?: string;
	message: string;
};

export function validateMappedEnrollmentRows(
	mappedRows: MappedEnrollmentRow[],
): BenefitImportPreviewIssue[] {
	const issues: BenefitImportPreviewIssue[] = [];
	mappedRows.forEach((row, index) => {
		const sheetRow = index + 2;
		if (!row.EMPLOYEE_NUMBER?.trim()) {
			issues.push({ row: sheetRow, field: "EMPLOYEE_NUMBER", message: "Missing employee ID" });
		}
		if (!row.BENEFIT_CODE?.trim() && !row.BENEFIT_TYPE?.trim()) {
			issues.push({
				row: sheetRow,
				field: "BENEFIT_CODE",
				message: "Missing benefit code or type name",
			});
		}
		const amount = Number(String(row.AMOUNT || "").replace(/,/g, ""));
		if (!Number.isFinite(amount) || amount <= 0) {
			issues.push({
				row: sheetRow,
				field: "AMOUNT",
				message: "Amount must be greater than zero",
			});
		}
		if (!String(row.START_DATE || "").trim()) {
			issues.push({ row: sheetRow, field: "START_DATE", message: "Missing start date" });
		}
	});
	return issues;
}

/** Build a CSV File with canonical headers for API import. */
export function buildMappedEnrollmentCsvFile(
	mappedRows: MappedEnrollmentRow[],
	fileName = "benefit-enrollments-mapped.csv",
): File {
	const keys = Array.from(
		new Set(mappedRows.flatMap((row) => Object.keys(row).filter((k) => row[k] !== undefined))),
	);
	// Prefer stable order (matches downloadable template)
	const preferred = [
		"BENEFIT_CODE",
		"AMOUNT",
		"EMPLOYEE_NUMBER",
		"EMPLOYEE_NAME",
		"START_DATE",
		"END_DATE",
		"BENEFIT_TYPE",
		"NAME",
		"DESCRIPTION",
		"NOTES",
	];
	const ordered = [
		...preferred.filter((k) => keys.includes(k)),
		...keys.filter((k) => !preferred.includes(k) && k !== "IS_ACTIVE"),
	];

	const escape = (value: string) => {
		const text = String(value ?? "");
		if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
		return text;
	};

	const lines = [
		ordered.join(","),
		...mappedRows.map((row) => ordered.map((k) => escape(row[k] ?? "")).join(",")),
	];
	const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
	return new File([blob], fileName, { type: "text/csv" });
}

const escapeCsvCell = (value: string) => {
	const text = String(value ?? "");
	if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
	return text;
};

export function downloadBenefitEnrollmentTemplate(): void {
	const lines = [
		BENEFIT_ENROLLMENT_TEMPLATE_HEADERS.join(","),
		BENEFIT_ENROLLMENT_TEMPLATE_EXAMPLE_ROW.map((cell) => escapeCsvCell(cell)).join(","),
	];
	const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "benefit-enrollment-import-template.csv";
	a.click();
	URL.revokeObjectURL(url);
}
