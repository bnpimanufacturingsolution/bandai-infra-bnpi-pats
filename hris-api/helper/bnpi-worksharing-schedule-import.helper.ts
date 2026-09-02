/**
 * BNPI WorkSharingSchedule workbook parser for DM3.2 employee schedule import.
 *
 * Source shape (sheet name starts with "WorkSharingSchedule"):
 *   Employeeid | EmployeeName | Department | Division | Position | Shift | <date columns...>
 * Shift values look like "08:15 to 16:15". Date cells are 0/1 work flags.
 *
 * One employee may appear on multiple rows with different shifts; each date flag
 * of 1 assigns that day's shift. Shortfall (late/EO) must use the day-level shift.
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

/** Period-level assignment used for embedded Mon-Sat template (majority shift). */
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
	/** Days this employee is on this shift (flag=1). */
	activeDates: string[];
};

/** Exact day → shift assignment for schedule_overrides / shortfall. */
export type WorkSharingDayAssignment = {
	employeeExternalId: string;
	sourceEmployeeId: string;
	employeeName: string;
	department: string;
	division: string;
	position: string;
	date: Date;
	dateKey: string;
	shiftLabel: string;
	shiftCode: string;
	scheduleCode: string;
	sourceSheet: string;
	sourceRow: number;
};

/**
 * Explicit WorkSharing flag=0 day (not scheduled).
 * Must become REST_DAY / isOff — otherwise empty bio charges ABSENT vs computation.
 */
export type WorkSharingDayOffAssignment = {
	employeeExternalId: string;
	sourceEmployeeId: string;
	employeeName: string;
	date: Date;
	dateKey: string;
	sourceSheet: string;
	sourceRow: number;
	reason: string;
};

export type ParseWorkSharingWorkbookResult = {
	sheetName: string;
	dateColumns: WorkSharingDateColumn[];
	/** One row per employee + majority (or first) shift for embedded template. */
	assignments: WorkSharingSourceAssignment[];
	/** Day-level shifts (employee × date with flag 1). */
	dayAssignments: WorkSharingDayAssignment[];
	/** Day-level offs (employee × date with explicit flag 0 and no flag 1). */
	dayOffAssignments: WorkSharingDayOffAssignment[];
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

/**
 * Parse workbook date headers.
 * Handles Excel serials and UTC midnights that represent Manila calendar days
 * (e.g. 2026-06-25T16:00:00.000Z → 2026-06-26 in UTC+8).
 */
export function parseWorkSharingSourceDate(value: unknown): Date | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		// If time component is non-midnight UTC, treat as Manila wall date.
		const hours = value.getUTCHours();
		const minutes = value.getUTCMinutes();
		if (hours !== 0 || minutes !== 0) {
			const manila = new Date(value.getTime() + 8 * 60 * 60 * 1000);
			return new Date(Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate()));
		}
		return normalizeDateOnly(value);
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		// Excel serial date (days since 1899-12-30)
		const excelEpoch = Date.UTC(1899, 11, 30);
		const ms = excelEpoch + value * 24 * 60 * 60 * 1000;
		const parsed = new Date(ms);
		if (!Number.isNaN(parsed.getTime())) {
			// Serials are date-only; keep UTC date.
			return normalizeDateOnly(parsed);
		}
	}
	const text = clean(value);
	if (!text || /^total/i.test(text)) return null;

	// ISO with time (often prior UTC day for PH files)
	const isoTime = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
	if (isoTime) {
		const hour = Number(isoTime[4]);
		const minute = Number(isoTime[5]);
		if (hour !== 0 || minute !== 0) {
			const parsed = new Date(text.endsWith("Z") || text.includes("+") ? text : `${text}Z`);
			if (!Number.isNaN(parsed.getTime())) {
				const manila = new Date(parsed.getTime() + 8 * 60 * 60 * 1000);
				return new Date(Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate()));
			}
		}
		return new Date(Date.UTC(Number(isoTime[1]), Number(isoTime[2]) - 1, Number(isoTime[3])));
	}

	const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (iso) {
		return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
	}
	const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
	if (slash) {
		const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
		// Prefer M/D/Y (BNPI workbooks)
		return new Date(Date.UTC(year, Number(slash[1]) - 1, Number(slash[2])));
	}
	const parsed = new Date(`${text} UTC`);
	if (!Number.isNaN(parsed.getTime())) return normalizeDateOnly(parsed);
	return null;
}

export function isWorkSharingActiveFlag(value: unknown): boolean {
	if (value === true || value === 1) return true;
	const text = clean(value);
	return text === "1" || text.toLowerCase() === "true" || text.toLowerCase() === "yes";
}

/** Explicit off flag (0). Empty/blank is unknown — not treated as off. */
export function isWorkSharingOffFlag(value: unknown): boolean {
	if (value === false || value === 0) return true;
	const text = clean(value);
	return text === "0" || text.toLowerCase() === "false" || text.toLowerCase() === "no";
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
	const dayCount = assignment.activeDates?.length || 0;
	return `BNPI WorkSharingSchedule source row ${assignment.sourceRow}; source span ${toWorkSharingDateKey(assignment.effectiveFrom)} to ${toWorkSharingDateKey(assignment.effectiveTo)}; majority/primary shift ${assignment.shiftLabel}${dayCount ? ` (${dayCount} day flag(s))` : ""}`;
}

/**
 * Build day→shift lookup: employeeExternalId -> dateKey -> day assignment.
 */
export function indexWorkSharingDayAssignments(
	dayAssignments: WorkSharingDayAssignment[],
): Map<string, Map<string, WorkSharingDayAssignment>> {
	const byEmployee = new Map<string, Map<string, WorkSharingDayAssignment>>();
	for (const day of dayAssignments) {
		let byDate = byEmployee.get(day.employeeExternalId);
		if (!byDate) {
			byDate = new Map();
			byEmployee.set(day.employeeExternalId, byDate);
		}
		// Later rows win if same date flagged twice (should be rare).
		byDate.set(day.dateKey, day);
	}
	return byEmployee;
}

/**
 * Parse a WorkSharingSchedule workbook buffer.
 * Emits day-level assignments (flag=1) and primary period assignments
 * (majority shift per employee for embedded Mon-Sat template).
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

	const dayAssignments: WorkSharingDayAssignment[] = [];
	const skippedRows: Array<{ row: number; reason: string }> = [];
	// employeeExternalId -> shiftLabel -> meta + dates
	const employeeShiftBuckets = new Map<
		string,
		Map<
			string,
			{
				meta: Omit<WorkSharingDayAssignment, "date" | "dateKey" | "shiftLabel"> & {
					shiftLabel: string;
				};
				dates: string[];
			}
		>
	>();
	/** Track explicit 0/1 per emp|date across multi-shift rows (1 wins). */
	const dayFlagVotes = new Map<
		string,
		{ on: boolean; off: boolean; meta: { sourceEmployeeId: string; employeeName: string; sourceRow: number } }
	>();

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

		const shiftCode = toWorkSharingShiftCode(shiftLabel);
		const scheduleCode = toWorkSharingMonSatScheduleCode(shiftCode);
		const meta = {
			employeeExternalId,
			sourceEmployeeId,
			employeeName: clean(row[1]),
			department: clean(row[2]),
			division: clean(row[3]),
			position: clean(row[4]),
			shiftLabel,
			shiftCode,
			scheduleCode,
			sourceSheet: sheetName,
			sourceRow,
		};

		let activeOnAnyDay = false;
		for (const column of dateColumns) {
			const dateKey = toWorkSharingDateKey(column.date);
			const voteKey = `${employeeExternalId}|${dateKey}`;
			const cell = row[column.index];
			const vote = dayFlagVotes.get(voteKey) || {
				on: false,
				off: false,
				meta: {
					sourceEmployeeId,
					employeeName: meta.employeeName,
					sourceRow,
				},
			};
			if (isWorkSharingActiveFlag(cell)) {
				vote.on = true;
				activeOnAnyDay = true;
				dayAssignments.push({
					...meta,
					date: column.date,
					dateKey,
				});

				let shiftMap = employeeShiftBuckets.get(employeeExternalId);
				if (!shiftMap) {
					shiftMap = new Map();
					employeeShiftBuckets.set(employeeExternalId, shiftMap);
				}
				let bucket = shiftMap.get(shiftLabel);
				if (!bucket) {
					bucket = { meta, dates: [] };
					shiftMap.set(shiftLabel, bucket);
				}
				if (!bucket.dates.includes(dateKey)) bucket.dates.push(dateKey);
			} else if (isWorkSharingOffFlag(cell)) {
				vote.off = true;
			}
			dayFlagVotes.set(voteKey, vote);
		}

		if (!activeOnAnyDay) {
			// Row present but no day flags — still usable as period-wide primary if sole row.
			let shiftMap = employeeShiftBuckets.get(employeeExternalId);
			if (!shiftMap) {
				shiftMap = new Map();
				employeeShiftBuckets.set(employeeExternalId, shiftMap);
			}
			if (!shiftMap.has(shiftLabel)) {
				shiftMap.set(shiftLabel, { meta, dates: [] });
			}
			skippedRows.push({ row: sourceRow, reason: "no_active_day_flags" });
		}
	}

	const dayOffAssignments: WorkSharingDayOffAssignment[] = [];
	for (const [voteKey, vote] of dayFlagVotes) {
		if (vote.on || !vote.off) continue;
		const [employeeExternalId, dateKey] = voteKey.split("|");
		const date = new Date(`${dateKey}T00:00:00.000Z`);
		dayOffAssignments.push({
			employeeExternalId,
			sourceEmployeeId: vote.meta.sourceEmployeeId,
			employeeName: vote.meta.employeeName,
			date,
			dateKey,
			sourceSheet: sheetName,
			sourceRow: vote.meta.sourceRow,
			reason: `WorkSharing day flag OFF (row ${vote.meta.sourceRow})`,
		});
	}

	// Primary assignment = shift with most active days (ties: first seen / lowest sourceRow).
	const assignments: WorkSharingSourceAssignment[] = [];
	for (const [employeeExternalId, shiftMap] of employeeShiftBuckets) {
		const buckets = Array.from(shiftMap.values()).sort((a, b) => {
			if (b.dates.length !== a.dates.length) return b.dates.length - a.dates.length;
			return a.meta.sourceRow - b.meta.sourceRow;
		});
		const primary = buckets[0];
		if (!primary) continue;
		// If no flags anywhere for employee, still assign primary shift to whole window
		// (legacy behavior for rows with all zeros — rare).
		const activeDates =
			primary.dates.length > 0
				? primary.dates.slice().sort()
				: dateColumns.map((c) => toWorkSharingDateKey(c.date));
		assignments.push({
			employeeExternalId,
			sourceEmployeeId: primary.meta.sourceEmployeeId,
			employeeName: primary.meta.employeeName,
			department: primary.meta.department,
			division: primary.meta.division,
			position: primary.meta.position,
			shiftLabel: primary.meta.shiftLabel,
			shiftCode: primary.meta.shiftCode,
			scheduleCode: primary.meta.scheduleCode,
			effectiveFrom,
			effectiveTo,
			sourceSheet: primary.meta.sourceSheet,
			sourceRow: primary.meta.sourceRow,
			activeDates,
		});
	}

	// Stable order
	assignments.sort((a, b) => a.sourceRow - b.sourceRow || a.employeeExternalId.localeCompare(b.employeeExternalId));
	dayAssignments.sort(
		(a, b) =>
			a.employeeExternalId.localeCompare(b.employeeExternalId) ||
			a.dateKey.localeCompare(b.dateKey),
	);
	dayOffAssignments.sort(
		(a, b) =>
			a.employeeExternalId.localeCompare(b.employeeExternalId) ||
			a.dateKey.localeCompare(b.dateKey),
	);

	return {
		sheetName,
		dateColumns,
		assignments,
		dayAssignments,
		dayOffAssignments,
		skippedRows,
		effectiveFrom: toWorkSharingDateKey(effectiveFrom),
		effectiveTo: toWorkSharingDateKey(effectiveTo),
	};
}
