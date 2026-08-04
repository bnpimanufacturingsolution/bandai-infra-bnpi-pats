/**
 * BNPI WorkSharingSchedule workbook parser for DM3.2 employee schedule import.
 *
 * Source shape (sheet name starts with "WorkSharingSchedule"):
 *   Employeeid | EmployeeName | Department | Division | Position | Shift | <date columns...>
 * Shift values look like "08:15 to 16:15". Date cells are 0/1 work flags.
 *
 * Schedule codes match existing DM3 WorkSharing templates:
 *   BNPI_WS_MON_SAT_WS_HHMM_HHMM
 */

import * as XLSX from "xlsx";

export type WorkSharingShiftWindow = {
	startTime: string;
	endTime: string;
};

export type WorkSharingDateColumn = {
	index: number;
	date: Date;
	label: string;
};

export type WorkSharingSourceAssignment = {
	employeeExternalId: string;
	sourceEmployeeId: string;
	employeeName: string;
	department: string;
	division: string;
	position: string;
	shiftLabel: string;
	shiftCode: string;
	scheduleCode: string;
	effectiveFrom: Date;
	effectiveTo: Date;
	sourceSheet: string;
	sourceRow: number;
};

export type ParseWorkSharingWorkbookResult = {
	sheetName: string;
	dateColumns: WorkSharingDateColumn[];
	assignments: WorkSharingSourceAssignment[];
	skippedRows: Array<{ row: number; reason: string }>;
	effectiveFrom: string;
	effectiveTo: string;
};

const clean = (value: unknown) => String(value ?? "").trim();

export function normalizeWorkSharingEmployeeId(value: unknown): string {
	const text = clean(value);
	if (/^\d+$/.test(text)) return text.padStart(5, "0");
	return text;
}

export function parseWorkSharingShiftWindow(value: string): WorkSharingShiftWindow | null {
	const match = clean(value).match(/^(\d{1,2}):(\d{2})\s+to\s+(\d{1,2}):(\d{2})$/i);
	if (!match) return null;
	const startHour = Number(match[1]);
	const startMinute = Number(match[2]);
	const endHour = Number(match[3]);
	const endMinute = Number(match[4]);
	if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) {
		return null;
	}
	return {
		startTime: `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}`,
		endTime: `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`,
	};
}

export function toWorkSharingShiftCode(shiftLabel: string): string {
	const window = parseWorkSharingShiftWindow(shiftLabel);
	if (!window) {
		return clean(shiftLabel)
			.toUpperCase()
			.replace(/[^A-Z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "")
			.slice(0, 40);
	}
	return `WS_${window.startTime.replace(":", "")}_${window.endTime.replace(":", "")}`;
}

export function toWorkSharingMonSatScheduleCode(shiftCode: string): string {
	return `BNPI_WS_MON_SAT_${shiftCode}`;
}

export function toWorkSharingDateKey(date: Date | string | null | undefined): string {
	if (!date) return "";
	const value = date instanceof Date ? date : new Date(date);
	if (Number.isNaN(value.getTime())) return "";
	const normalized = new Date(value);
	normalized.setUTCHours(0, 0, 0, 0);
	return normalized.toISOString().slice(0, 10);
}

function normalizeDateOnly(date: Date): Date {
	const next = new Date(date);
	next.setUTCHours(0, 0, 0, 0);
	return next;
}

export function parseWorkSharingSourceDate(value: unknown): Date | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return normalizeDateOnly(value);
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		// Excel serial date (days since 1899-12-30)
		const excelEpoch = Date.UTC(1899, 11, 30);
		const ms = excelEpoch + value * 24 * 60 * 60 * 1000;
		const parsed = new Date(ms);
		if (!Number.isNaN(parsed.getTime())) return normalizeDateOnly(parsed);
	}
	const text = clean(value);
	if (!text || /^total/i.test(text)) return null;
	const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (iso) {
		return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
	}
	const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
	if (slash) {
		const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
		return new Date(Date.UTC(year, Number(slash[1]) - 1, Number(slash[2])));
	}
	const parsed = new Date(`${text} UTC`);
	if (!Number.isNaN(parsed.getTime())) return normalizeDateOnly(parsed);
	return null;
}

export function pickWorkSharingSheetName(sheetNames: string[]): string | null {
	if (!sheetNames.length) return null;
	return (
		sheetNames.find((name) => /^WorkSharingSchedule/i.test(String(name || "").trim())) ||
		sheetNames[0] ||
		null
	);
}

export function buildWorkSharingAssignmentNotes(assignment: WorkSharingSourceAssignment): string {
	return `BNPI WorkSharingSchedule source row ${assignment.sourceRow}; source span ${toWorkSharingDateKey(assignment.effectiveFrom)} to ${toWorkSharingDateKey(assignment.effectiveTo)}; recurring Mon-Sat shift ${assignment.shiftLabel}`;
}

/**
 * Parse a WorkSharingSchedule workbook buffer into employee schedule assignments.
 * effectiveFrom/effectiveTo span all date columns on the sheet (period window).
 */
export function parseWorkSharingScheduleWorkbook(
	buffer: Buffer,
	options?: { sheetName?: string },
): ParseWorkSharingWorkbookResult {
	// Prefer string/serial headers over local Date objects so Excel timezone
	// offsets do not shift cutoff day boundaries (e.g. PH UTC+8 → prior UTC day).
	const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
	const sheetName =
		options?.sheetName ||
		pickWorkSharingSheetName(workbook.SheetNames || []) ||
		"";
	if (!sheetName || !workbook.Sheets[sheetName]) {
		throw new Error(
			`WorkSharingSchedule sheet was not found. Expected a sheet named WorkSharingSchedule*. Found: ${(workbook.SheetNames || []).join(", ") || "(none)"}`,
		);
	}

	const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], {
		header: 1,
		defval: "",
		blankrows: false,
		raw: false,
	});
	const headers = rows[0] || [];
	const dateColumns: WorkSharingDateColumn[] = headers
		.map((header: unknown, index: number) => ({
			index,
			date: parseWorkSharingSourceDate(header),
			label: clean(header),
		}))
		.filter((item): item is WorkSharingDateColumn & { date: Date } => Boolean(item.date));

	if (!dateColumns.length) {
		throw new Error(`No date columns were found in sheet "${sheetName}".`);
	}

	const effectiveFrom = dateColumns.reduce(
		(earliest, column) => (column.date < earliest ? column.date : earliest),
		dateColumns[0].date,
	);
	const effectiveTo = dateColumns.reduce(
		(latest, column) => (column.date > latest ? column.date : latest),
		dateColumns[0].date,
	);

	const assignments: WorkSharingSourceAssignment[] = [];
	const skippedRows: Array<{ row: number; reason: string }> = [];
	const seenEmployees = new Set<string>();

	for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
		const row = rows[rowIndex] || [];
		const sourceRow = rowIndex + 1;
		const sourceEmployeeId = clean(row[0]);
		const employeeExternalId = normalizeWorkSharingEmployeeId(sourceEmployeeId);
		const shiftLabel = clean(row[5]);

		if (!sourceEmployeeId || sourceEmployeeId.toLowerCase() === "total") {
			skippedRows.push({ row: sourceRow, reason: "empty_or_total_row" });
			continue;
		}
		if (!shiftLabel) {
			skippedRows.push({ row: sourceRow, reason: "missing_shift" });
			continue;
		}
		if (!parseWorkSharingShiftWindow(shiftLabel)) {
			skippedRows.push({ row: sourceRow, reason: `unsupported_shift:${shiftLabel}` });
			continue;
		}
		if (seenEmployees.has(employeeExternalId)) {
			skippedRows.push({ row: sourceRow, reason: "duplicate_employee_id" });
			continue;
		}
		seenEmployees.add(employeeExternalId);

		const shiftCode = toWorkSharingShiftCode(shiftLabel);
		assignments.push({
			employeeExternalId,
			sourceEmployeeId,
			employeeName: clean(row[1]),
			department: clean(row[2]),
			division: clean(row[3]),
			position: clean(row[4]),
			shiftLabel,
			shiftCode,
			scheduleCode: toWorkSharingMonSatScheduleCode(shiftCode),
			effectiveFrom,
			effectiveTo,
			sourceSheet: sheetName,
			sourceRow,
		});
	}

	return {
		sheetName,
		dateColumns,
		assignments,
		skippedRows,
		effectiveFrom: toWorkSharingDateKey(effectiveFrom),
		effectiveTo: toWorkSharingDateKey(effectiveTo),
	};
}
