/**
 * BNPI Manpower Databank workbook helpers.
 * Accepts client files such as:
 * - docs/BNPI_MASTERLIST.xlsx sheet "Manpower Databank"
 * - confidential-files/2026_07_July Manpower Databank.xlsx (daily sheets 07-01 … 07-24)
 */

import { padEmployeeId } from "./bnpi-mass-upload-import.helper";

export type ManpowerDatabankSheetSelectionReason =
	| "manpower_databank_name"
	| "latest_day_sheet"
	| "first_sheet_fallback";

export type ManpowerDatabankSheetSelection = {
	sheetName: string;
	reason: ManpowerDatabankSheetSelectionReason;
};

export type ManpowerDatabankMappedRow = {
	sourceRow: number;
	employeeId: string;
	name: string;
	firstName: string;
	middleName?: string;
	lastName: string;
	department: string;
	section: string;
	position: string;
	company: string;
	employmentStatusLabel: string;
	statusLabel: string;
	nationality: string;
	gender?: "male" | "female" | "other";
	hireDate: Date | null;
	birthday: Date | null;
	separationDate: Date | null;
	separationReason: string;
	workforceSource: "DIRECT" | "AGENCY";
	employmentStatus: "ACTIVE" | "INACTIVE" | "RESIGNED" | "TERMINATED";
	jobCategory: string;
	classification: string;
	workStatus: string;
	opsMetadata: Record<string, string>;
};

const HEADER_ALIASES: Record<string, string[]> = {
	employeeId: ["id no", "id no.", "no", "no.", "employee no", "employee no.", "emp id", "employee id"],
	name: ["employee name", "name"],
	department: ["department"],
	section: ["section"],
	position: ["position"],
	company: ["company"],
	employmentStatus: ["employment status"],
	status: ["status"],
	nationality: ["nationality"],
	gender: ["gender"],
	hireDate: ["date hired", "hire date", "date of hire"],
	birthday: ["birthday", "date of birth", "birth date"],
	separationDate: [
		"if inactive, separation date",
		"if inactive separation date",
		"separation date",
		"date of separation",
		"date of resignation",
	],
	separationReason: ["reason of separation", "separation reason", "reason for separation"],
	jobCategory: ["job category"],
	classification: ["classification"],
	workStatus: ["work status"],
};

const OPS_HEADER_KEYS = [
	"pregnant",
	"health insurance",
	"uniform type",
	"invoice no",
	"invoice no.",
	"shoes amount",
	"id lace amount",
	"shuttle route",
	"vaccination",
];

function normalizeHeaderKey(value: unknown): string {
	return String(value ?? "")
		.normalize("NFKC")
		.replace(/\u3000/g, " ")
		.replace(/[\r\n]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase()
		.replace(/[._]+$/g, "");
}

function cellText(value: unknown): string {
	if (value == null) return "";
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toISOString().slice(0, 10);
	}
	if (typeof value === "object") {
		const anyVal = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: string }> };
		if (typeof anyVal.text === "string") return anyVal.text.trim();
		if (anyVal.result != null) return cellText(anyVal.result);
		if (Array.isArray(anyVal.richText)) {
			return anyVal.richText.map((part) => String(part?.text ?? "")).join("").trim();
		}
	}
	return String(value).trim();
}

export function parseBnpiPersonName(fullName: string): {
	firstName: string;
	middleName?: string;
	lastName: string;
} {
	const trimmed = String(fullName || "").trim();
	if (!trimmed) {
		return { firstName: "Unknown", lastName: "Unknown" };
	}

	if (trimmed.includes(",")) {
		const [lastNamePart, firstNamePart = ""] = trimmed.split(",").map((part) => part.trim());
		const firstParts = firstNamePart.split(/\s+/).filter(Boolean);
		if (firstParts.length <= 1) {
			return {
				firstName: firstParts[0] || lastNamePart || "Unknown",
				lastName: lastNamePart || firstParts[0] || "Unknown",
			};
		}
		return {
			firstName: firstParts[0],
			middleName: firstParts.slice(1).join(" ") || undefined,
			lastName: lastNamePart || "Unknown",
		};
	}

	const parts = trimmed.split(/\s+/).filter(Boolean);
	if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
	if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
	return {
		firstName: parts[0],
		middleName: parts.slice(1, -1).join(" ") || undefined,
		lastName: parts[parts.length - 1],
	};
}

export function parseManpowerDatabankDate(value: unknown): Date | null {
	if (value == null || value === "") return null;
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		// Excel serial date (approx; SheetJS often already converts with cellDates)
		const excelEpoch = Date.UTC(1899, 11, 30);
		const ms = excelEpoch + value * 24 * 60 * 60 * 1000;
		const date = new Date(ms);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	const text = cellText(value);
	if (!text || /^invalid date$/i.test(text)) return null;
	const parsed = new Date(text);
	if (!Number.isNaN(parsed.getTime())) return parsed;
	const mdy = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
	if (mdy) {
		const month = Number(mdy[1]);
		const day = Number(mdy[2]);
		let year = Number(mdy[3]);
		if (year < 100) year += 2000;
		const date = new Date(Date.UTC(year, month - 1, day));
		return Number.isNaN(date.getTime()) ? null : date;
	}
	return null;
}

export function mapManpowerEmploymentStatus(statusLabel: string): "ACTIVE" | "INACTIVE" | "RESIGNED" | "TERMINATED" {
	const key = normalizeHeaderKey(statusLabel);
	if (!key || key === "active") return "ACTIVE";
	if (key.includes("resign")) return "RESIGNED";
	if (key.includes("terminat")) return "TERMINATED";
	if (key.includes("retire")) return "INACTIVE";
	if (key.includes("inactive") || key.includes("separated") || key.includes("end of contract")) {
		return "INACTIVE";
	}
	return "INACTIVE";
}

export function mapManpowerWorkforceSource(
	employmentStatusLabel: string,
	company: string,
): "DIRECT" | "AGENCY" {
	const employment = normalizeHeaderKey(employmentStatusLabel);
	const companyKey = normalizeHeaderKey(company);
	if (employment.includes("agency") || companyKey.includes("agency")) return "AGENCY";
	if (employment.includes("direct")) return "DIRECT";
	// Company BNPI / empty → DIRECT; known agency names stay AGENCY only when employment says so
	return "DIRECT";
}

export function mapManpowerGender(value: unknown): "male" | "female" | "other" | undefined {
	const key = normalizeHeaderKey(value);
	if (!key) return undefined;
	if (key === "m" || key === "male" || key.startsWith("male")) return "male";
	if (key === "f" || key === "female" || key.startsWith("female")) return "female";
	if (key === "other") return "other";
	return undefined;
}

function parseDaySheetSortKey(sheetName: string): number | null {
	const match = String(sheetName || "")
		.trim()
		.match(/^(\d{1,2})-(\d{1,2})$/);
	if (!match) return null;
	const month = Number(match[1]);
	const day = Number(match[2]);
	if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12 || day < 1 || day > 31) {
		return null;
	}
	return month * 100 + day;
}

export function pickManpowerDatabankSheet(sheetNames: string[]): ManpowerDatabankSheetSelection {
	const names = (sheetNames || []).map((name) => String(name || "").trim()).filter(Boolean);
	if (names.length === 0) {
		return { sheetName: "", reason: "first_sheet_fallback" };
	}

	const named = names.find((name) => /manpower\s*databank/i.test(name));
	if (named) {
		return { sheetName: named, reason: "manpower_databank_name" };
	}

	const daySheets = names
		.map((name) => ({ name, key: parseDaySheetSortKey(name) }))
		.filter((entry): entry is { name: string; key: number } => entry.key != null)
		.sort((a, b) => a.key - b.key);

	if (daySheets.length > 0) {
		return {
			sheetName: daySheets[daySheets.length - 1].name,
			reason: "latest_day_sheet",
		};
	}

	return { sheetName: names[0], reason: "first_sheet_fallback" };
}

function findHeaderColumnMap(headerCells: unknown[]): Map<string, number> {
	const map = new Map<string, number>();
	headerCells.forEach((cell, index) => {
		const key = normalizeHeaderKey(cell);
		if (!key) return;
		if (!map.has(key)) map.set(key, index);
	});
	return map;
}

function getByAliases(headerMap: Map<string, number>, row: unknown[], field: keyof typeof HEADER_ALIASES): unknown {
	const aliases = HEADER_ALIASES[field] || [];
	for (const alias of aliases) {
		const index = headerMap.get(alias);
		if (index == null) continue;
		const value = row[index];
		if (value != null && cellText(value) !== "") return value;
	}
	return "";
}

function looksLikeHeaderRow(cells: unknown[]): boolean {
	const keys = cells.map((cell) => normalizeHeaderKey(cell)).filter(Boolean);
	const hasId = keys.some((key) =>
		["id no", "id no.", "no", "no.", "employee no", "employee no.", "emp id", "employee id"].includes(key),
	);
	const hasName = keys.some((key) => key === "employee name" || key === "name");
	return hasId && hasName;
}

export function detectManpowerDatabankHeaderRow(matrix: unknown[][]): number {
	const limit = Math.min(8, matrix.length);
	for (let i = 0; i < limit; i++) {
		if (looksLikeHeaderRow(matrix[i] || [])) return i;
	}
	return 0;
}

export function mapManpowerDatabankMatrix(matrix: unknown[][]): {
	headerRowIndex: number;
	rows: ManpowerDatabankMappedRow[];
	skippedBlank: number;
} {
	const headerRowIndex = detectManpowerDatabankHeaderRow(matrix);
	const headerCells = (matrix[headerRowIndex] || []) as unknown[];
	const headerMap = findHeaderColumnMap(headerCells);
	const rows: ManpowerDatabankMappedRow[] = [];
	let skippedBlank = 0;
	let blankRun = 0;

	for (let i = headerRowIndex + 1; i < matrix.length; i++) {
		const raw = (matrix[i] || []) as unknown[];
		const sourceRow = i + 1; // 1-based Excel row
		const employeeIdRaw = getByAliases(headerMap, raw, "employeeId");
		const employeeId = padEmployeeId(employeeIdRaw);
		const name = cellText(getByAliases(headerMap, raw, "name"));

		if (!employeeId) {
			skippedBlank += 1;
			blankRun += 1;
			if (blankRun > 200) break;
			continue;
		}
		blankRun = 0;

		if (/^grand total$/i.test(employeeId) || /^id no\.?$/i.test(employeeId)) {
			skippedBlank += 1;
			continue;
		}
		if (!name || /^employee name$/i.test(name)) {
			skippedBlank += 1;
			continue;
		}

		const department = cellText(getByAliases(headerMap, raw, "department"));
		const section = cellText(getByAliases(headerMap, raw, "section"));
		const position = cellText(getByAliases(headerMap, raw, "position"));
		const company = cellText(getByAliases(headerMap, raw, "company"));
		const employmentStatusLabel = cellText(getByAliases(headerMap, raw, "employmentStatus"));
		const statusLabel = cellText(getByAliases(headerMap, raw, "status"));
		const nationality = cellText(getByAliases(headerMap, raw, "nationality"));
		const jobCategory = cellText(getByAliases(headerMap, raw, "jobCategory"));
		const classification = cellText(getByAliases(headerMap, raw, "classification"));
		const workStatus = cellText(getByAliases(headerMap, raw, "workStatus"));
		const separationReason = cellText(getByAliases(headerMap, raw, "separationReason"));
		const hireDate = parseManpowerDatabankDate(getByAliases(headerMap, raw, "hireDate"));
		const birthday = parseManpowerDatabankDate(getByAliases(headerMap, raw, "birthday"));
		const separationDate = parseManpowerDatabankDate(getByAliases(headerMap, raw, "separationDate"));
		const gender = mapManpowerGender(getByAliases(headerMap, raw, "gender"));
		const parsedName = parseBnpiPersonName(name);

		const opsMetadata: Record<string, string> = {};
		headerCells.forEach((header, colIndex) => {
			const key = normalizeHeaderKey(header);
			if (!key || !OPS_HEADER_KEYS.some((ops) => key.includes(ops))) return;
			const value = cellText(raw[colIndex]);
			if (value) opsMetadata[key] = value;
		});

		rows.push({
			sourceRow,
			employeeId,
			name,
			firstName: parsedName.firstName,
			middleName: parsedName.middleName,
			lastName: parsedName.lastName,
			department,
			section,
			position,
			company,
			employmentStatusLabel,
			statusLabel,
			nationality,
			gender,
			hireDate,
			birthday,
			separationDate,
			separationReason,
			workforceSource: mapManpowerWorkforceSource(employmentStatusLabel, company),
			employmentStatus: mapManpowerEmploymentStatus(statusLabel),
			jobCategory,
			classification,
			workStatus,
			opsMetadata,
		});
	}

	return { headerRowIndex, rows, skippedBlank };
}
