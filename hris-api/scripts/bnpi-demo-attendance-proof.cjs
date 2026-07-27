require("dotenv").config();

const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const { PrismaClient } = require("../generated/prisma");

const prisma = new PrismaClient();

const SCHEDULE_CODE = "BNPI_MON_FRI_DAY_8_5";
const SCHEDULE_NAME = "BNPI Mon-Fri Day 8-5";
const SOURCE_TAG = "BNPI_DM4_DEMO_PROOF_2026";
const DEFAULT_LIMIT = 8;
const REPORT_SAMPLE_LIMIT = 25;
const DEFAULT_ORG_CODE = "bnei";
const DEFAULT_SOURCE_CONFIG = path.resolve(
	__dirname,
	"../../data/import/bnpi-dm4-demo-sources.json",
);
const DEFAULT_FILES = [
	"../../docs/2026-20260527T124252Z-3-001/2026",
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

const scheduleSlots = [
	{ type: "WORK", startTime: "08:00", endTime: "12:00" },
	{ type: "BREAK", startTime: "12:00", endTime: "13:00" },
	{ type: "WORK", startTime: "13:00", endTime: "17:00" },
];

const unwrapJsonSetEnvelope = (value) => {
	if (
		value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		value.set &&
		typeof value.set === "object" &&
		!Array.isArray(value.set)
	) {
		return value.set;
	}
	return value;
};

const normalizeDateOnlyUtc = (value) => {
	const date = value instanceof Date ? new Date(value) : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	date.setUTCHours(0, 0, 0, 0);
	return date;
};

const toMinutes = (value) => {
	const [hours, minutes] = String(value || "").split(":").map(Number);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
	return hours * 60 + minutes;
};

const normalizeSlots = (timeSlots) => {
	let previousEnd = null;
	return (Array.isArray(timeSlots) ? timeSlots : [])
		.map((slot) => {
			const start = toMinutes(slot?.startTime);
			const end = toMinutes(slot?.endTime);
			if (start === null || end === null) return null;
			let absoluteStart = start;
			let absoluteEnd = end <= start ? end + 24 * 60 : end;
			if (previousEnd !== null) {
				while (absoluteStart < previousEnd) {
					absoluteStart += 24 * 60;
					absoluteEnd += 24 * 60;
				}
			}
			previousEnd = absoluteEnd;
			return {
				...slot,
				type: String(slot?.type || "").toLowerCase(),
				absoluteStart,
				absoluteEnd,
			};
		})
		.filter(Boolean);
};

const deriveWorkWindow = (timeSlots) => {
	const workSlots = normalizeSlots(timeSlots).filter((slot) => slot.type === "work");
	if (!workSlots.length) return { startTime: null, endTime: null };
	const first = workSlots.reduce((earliest, current) =>
		current.absoluteStart < earliest.absoluteStart ? current : earliest,
	);
	const last = workSlots.reduce((latest, current) =>
		current.absoluteEnd > latest.absoluteEnd ? current : latest,
	);
	return { startTime: first.startTime || null, endTime: last.endTime || null };
};

const deriveBreakMinutes = (timeSlots) =>
	normalizeSlots(timeSlots)
		.filter((slot) => slot.type === "break")
		.reduce((total, slot) => total + Math.max(0, slot.absoluteEnd - slot.absoluteStart), 0);

const deriveBreakStartTime = (timeSlots) => {
	const breakSlots = normalizeSlots(timeSlots).filter((slot) => slot.type === "break");
	if (!breakSlots.length) return null;
	return breakSlots.reduce((earliest, current) =>
		current.absoluteStart < earliest.absoluteStart ? current : earliest,
	).startTime || null;
};

const deriveRegularMinutes = (timeSlots) =>
	normalizeSlots(timeSlots)
		.filter((slot) => slot.type === "work")
		.reduce((total, slot) => total + Math.max(0, slot.absoluteEnd - slot.absoluteStart), 0);

const resolveEffectiveEmbeddedSchedule = (employee, date) => {
	const target = normalizeDateOnlyUtc(date);
	if (!target) return null;
	const targetTime = target.getTime();
	const records = Array.isArray(employee?.scheduleHistoryRecords)
		? employee.scheduleHistoryRecords
		: [];
	const matching = records
		.filter((record) => record?.afterSchedule && typeof record.afterSchedule === "object")
		.filter((record) => {
			const effective = normalizeDateOnlyUtc(record.effectiveAt);
			return effective && effective.getTime() <= targetTime;
		})
		.sort((left, right) => {
			const leftEffective = normalizeDateOnlyUtc(left.effectiveAt)?.getTime() || 0;
			const rightEffective = normalizeDateOnlyUtc(right.effectiveAt)?.getTime() || 0;
			if (rightEffective !== leftEffective) return rightEffective - leftEffective;
			return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
		});
	if (matching.length > 0) return unwrapJsonSetEnvelope(matching[0].afterSchedule);

	const earliest = records
		.filter((record) => record?.effectiveAt)
		.sort((left, right) => {
			const leftEffective = normalizeDateOnlyUtc(left.effectiveAt)?.getTime() || 0;
			const rightEffective = normalizeDateOnlyUtc(right.effectiveAt)?.getTime() || 0;
			if (leftEffective !== rightEffective) return leftEffective - rightEffective;
			return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
		})[0];
	if (earliest?.beforeSchedule && typeof earliest.beforeSchedule === "object") {
		const earliestEffective = normalizeDateOnlyUtc(earliest.effectiveAt)?.getTime();
		if (Number.isFinite(earliestEffective) && targetTime < earliestEffective) {
			return unwrapJsonSetEnvelope(earliest.beforeSchedule);
		}
	}

	return unwrapJsonSetEnvelope(employee?.embeddedSchedule);
};

const resolveEmployeeScheduleSnapshotForDate = (employee, date) => {
	const target = normalizeDateOnlyUtc(date);
	const embedded = resolveEffectiveEmbeddedSchedule(employee, target);
	const pattern = Array.isArray(embedded?.pattern) ? embedded.pattern : [];
	if (!target || !embedded || !pattern.length) return null;

	if (embedded.effectiveStartDate) {
		const start = normalizeDateOnlyUtc(embedded.effectiveStartDate);
		if (start && target.getTime() < start.getTime()) return null;
	}
	const shouldIgnoreBnpiWorksharingEnd =
		String(embedded.templateCode || "").startsWith("BNPI_WS_MON_SAT_") &&
		String(embedded.reason || "").includes("WorkSharingSchedule");
	if (embedded.effectiveEndDate && !shouldIgnoreBnpiWorksharingEnd) {
		const end = normalizeDateOnlyUtc(embedded.effectiveEndDate);
		if (end && target.getTime() > end.getTime()) return null;
	}

	const anchor =
		normalizeDateOnlyUtc(embedded.effectiveStartDate) ||
		normalizeDateOnlyUtc(employee?.employmentStartDate) ||
		normalizeDateOnlyUtc(employee?.employmentHireDate) ||
		target;
	const cycleDays = Math.max(1, Number(embedded.cycleDays || pattern.length || 1));
	const diffDays = Math.floor((target.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
	const templateDay = ((diffDays % cycleDays) + cycleDays) % cycleDays + 1;
	const matchedPattern = pattern.find((item) => Number(item?.day || 0) === templateDay);
	const shiftSnapshot = unwrapJsonSetEnvelope(matchedPattern?.shiftSnapshot);
	if (!shiftSnapshot) return null;

	const timeSlots = Array.isArray(shiftSnapshot.timeSlots) ? shiftSnapshot.timeSlots : [];
	const { startTime, endTime } = deriveWorkWindow(timeSlots);
	const regularMinutes = deriveRegularMinutes(timeSlots);
	const breakMinutes = deriveBreakMinutes(timeSlots);
	return {
		source: "employee_schedule",
		scheduleCode: embedded.templateCode || shiftSnapshot.code || SCHEDULE_CODE,
		scheduleName: embedded.templateName || shiftSnapshot.name || SCHEDULE_NAME,
		scheduleTemplateId: embedded.templateId || null,
		shiftTypeId: matchedPattern?.shiftTypeId || shiftSnapshot.shiftTypeId || null,
		shiftTypeCode: shiftSnapshot.code || null,
		shiftTypeName: shiftSnapshot.name || null,
		templateDay,
		cycleDays,
		isOff: Boolean(shiftSnapshot.isOff),
		isOvernight: Boolean(shiftSnapshot.isOvernight),
		timeSlots,
		breakMinutes,
		regularMinutes,
		regularHours: regularMinutes / 60,
		startTime,
		endTime,
	};
};

const resolveCurrentEmbeddedScheduleSnapshotForDate = (employee, date) => {
	const target = normalizeDateOnlyUtc(date);
	const embedded = unwrapJsonSetEnvelope(employee?.embeddedSchedule);
	const pattern = Array.isArray(embedded?.pattern) ? embedded.pattern : [];
	if (!target || !embedded || !pattern.length) return null;

	const anchor =
		normalizeDateOnlyUtc(embedded.effectiveStartDate) ||
		normalizeDateOnlyUtc(employee?.employmentStartDate) ||
		normalizeDateOnlyUtc(employee?.employmentHireDate) ||
		target;
	const cycleDays = Math.max(1, Number(embedded.cycleDays || pattern.length || 1));
	const diffDays = Math.floor((target.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
	const templateDay = ((diffDays % cycleDays) + cycleDays) % cycleDays + 1;
	const matchedPattern = pattern.find((item) => Number(item?.day || 0) === templateDay);
	const shiftSnapshot = unwrapJsonSetEnvelope(matchedPattern?.shiftSnapshot);
	if (!shiftSnapshot) return null;

	const timeSlots = Array.isArray(shiftSnapshot.timeSlots) ? shiftSnapshot.timeSlots : [];
	const { startTime, endTime } = deriveWorkWindow(timeSlots);
	const regularMinutes = deriveRegularMinutes(timeSlots);
	const breakMinutes = deriveBreakMinutes(timeSlots);
	return {
		source: "employee_current_embedded_schedule_historical_dm4_fallback",
		scheduleCode: embedded.templateCode || shiftSnapshot.code || SCHEDULE_CODE,
		scheduleName: embedded.templateName || shiftSnapshot.name || SCHEDULE_NAME,
		scheduleTemplateId: embedded.templateId || null,
		shiftTypeId: matchedPattern?.shiftTypeId || shiftSnapshot.shiftTypeId || null,
		shiftTypeCode: shiftSnapshot.code || null,
		shiftTypeName: shiftSnapshot.name || null,
		templateDay,
		cycleDays,
		isOff: Boolean(shiftSnapshot.isOff),
		isOvernight: Boolean(shiftSnapshot.isOvernight),
		timeSlots,
		breakMinutes,
		regularMinutes,
		regularHours: regularMinutes / 60,
		startTime,
		endTime,
		fallbackScheduleApplied: true,
		fallbackReason: "DM4 source date predates imported schedule effective window.",
	};
};

const buildFallbackScheduleSnapshot = (source) => ({
	source,
	scheduleCode: SCHEDULE_CODE,
	scheduleName: SCHEDULE_NAME,
	timeSlots: scheduleSlots,
	breakMinutes: 60,
	regularMinutes: 480,
	regularHours: 8,
});

const resolveDm4ScheduleSnapshotForRow = (row, fallbackIds = {}) => {
	const employeeSchedule =
		resolveEmployeeScheduleSnapshotForDate(row.employeeScheduleData, dateOnly(row.date)) ||
		resolveCurrentEmbeddedScheduleSnapshotForDate(row.employeeScheduleData, dateOnly(row.date));
	if (employeeSchedule) return employeeSchedule;
	return {
		...buildFallbackScheduleSnapshot("DM4_BNPI_DEFAULT_PRESENT_FALLBACK"),
		shiftTypeId: fallbackIds.shiftTypeId || null,
		scheduleTemplateId: fallbackIds.scheduleTemplateId || null,
		fallbackScheduleApplied: true,
		fallbackReason: "No employee-specific schedule covered this DM4 PRESENT source date.",
	};
};

const planDm4SelectedRowMaterialization = (selectedRows) => {
	const counts = {
		selectedRows: selectedRows.length,
		specificScheduleRows: 0,
		currentEmbeddedHistoricalFallbackRows: 0,
		defaultScheduleFallbackRows: 0,
		rowsWithoutAnySchedulePlan: 0,
	};
	const sampleFallbackRows = [];
	for (const row of selectedRows) {
		const direct = resolveEmployeeScheduleSnapshotForDate(row.employeeScheduleData, dateOnly(row.date));
		if (direct) {
			counts.specificScheduleRows += 1;
			continue;
		}
		const currentEmbedded = resolveCurrentEmbeddedScheduleSnapshotForDate(
			row.employeeScheduleData,
			dateOnly(row.date),
		);
		if (currentEmbedded) {
			counts.currentEmbeddedHistoricalFallbackRows += 1;
			if (sampleFallbackRows.length < REPORT_SAMPLE_LIMIT) {
				sampleFallbackRows.push({
					employeeId: row.dbEmployeeId || row.employeeId,
					date: row.date,
					sourceWorkbook: row.sourceWorkbook,
					sourceSheet: row.sourceSheet,
					sourceRow: row.sourceRow,
					fallbackReason: currentEmbedded.fallbackReason,
					scheduleCode: currentEmbedded.scheduleCode,
				});
			}
			continue;
		}
		counts.defaultScheduleFallbackRows += 1;
		if (sampleFallbackRows.length < REPORT_SAMPLE_LIMIT) {
			sampleFallbackRows.push({
				employeeId: row.dbEmployeeId || row.employeeId,
				date: row.date,
				sourceWorkbook: row.sourceWorkbook,
				sourceSheet: row.sourceSheet,
				sourceRow: row.sourceRow,
				fallbackReason: "No employee-specific schedule covered this DM4 PRESENT source date.",
				scheduleCode: SCHEDULE_CODE,
			});
		}
	}
	return {
		...counts,
		rowsWouldApply:
			counts.specificScheduleRows +
			counts.currentEmbeddedHistoricalFallbackRows +
			counts.defaultScheduleFallbackRows,
		sampleFallbackRows,
	};
};

const minutesToHoursText = (minutes) =>
	`${Math.floor(Math.max(0, minutes) / 60)}:${String(Math.max(0, minutes) % 60).padStart(2, "0")}`;

const timeTextToMinutes = (value) => {
	const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return null;
	return Number(match[1]) * 60 + Number(match[2]);
};

const workedMinutesFromTimeText = (timeIn, timeOut, breakMinutes) => {
	const start = timeTextToMinutes(timeIn);
	let end = timeTextToMinutes(timeOut);
	if (start === null || end === null) return null;
	if (end <= start) end += 24 * 60;
	return Math.max(0, end - start - Math.max(0, Number(breakMinutes || 0)));
};

const splitWorkedMinutes = (workedMinutes, scheduledRegularMinutes) => {
	const regularMinutes = Math.min(
		Math.max(0, Number(workedMinutes || 0)),
		Math.max(0, Number(scheduledRegularMinutes || 0)),
	);
	return {
		regularMinutes,
		overtimeMinutes: Math.max(0, Number(workedMinutes || 0) - regularMinutes),
	};
};

const getArg = (name, fallback = "") => {
	const prefix = `${name}=`;
	const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : fallback;
};

const hasFlag = (name) => process.argv.includes(name);

const PROGRESS_FILE = getArg("--progressFile", "");

const emitProgress = (event) => {
	if (!PROGRESS_FILE) return;
	try {
		fs.appendFileSync(
			PROGRESS_FILE,
			`${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`,
		);
	} catch {
		// Progress is diagnostic only; the import result remains the source of truth.
	}
};

const getLimit = () => {
	const rawLimit = getArg("--limit", String(DEFAULT_LIMIT)).trim().toLowerCase();
	if (["all", "full", "0", "none"].includes(rawLimit)) return 0;
	const parsed = Number(rawLimit);
	return Number.isFinite(parsed) ? parsed : DEFAULT_LIMIT;
};

const getBatchSize = () => {
	const parsed = Number(getArg("--batchSize", process.env.BNPI_DM4_BATCH_SIZE || "500"));
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 500;
};

const normalizeHeader = (value) =>
	String(value || "")
		.replace(/\r?\n/g, " ")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

const normalizeEmployeeId = (value) => {
	const text = String(value || "").trim();
	if (!text) return "";
	return text.endsWith(".0") ? text.slice(0, -2) : text;
};

const normalizeBadgeId = (value) => {
	const text = normalizeEmployeeId(value);
	if (!text) return "";
	return /^\d+$/.test(text) ? text.padStart(5, "0") : text;
};

const isPresentValue = (value) => String(value || "").trim().toLowerCase() === "present";

const isSummaryOrBlankEmployee = (employeeId) => {
	const text = String(employeeId || "").trim().toLowerCase();
	return !text || ["total", "direct", "indirect", "present", "absent", "no work"].includes(text);
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

const getDepartmentFromFile = (filePath) => {
	const directory = path.basename(path.dirname(filePath));
	if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)$/i.test(directory)) {
		return path.basename(path.dirname(path.dirname(filePath)));
	}
	return directory;
};

const getSourceFiles = () => {
	const rawFiles = getArg(
		"--files",
		process.env.BNPI_DM4_SOURCE_FILES || "",
	);
	if (rawFiles) {
		return rawFiles
			.split(";")
			.map((item) => item.trim())
			.filter(Boolean);
	}

	const configPath = getArg(
		"--sourceConfig",
		process.env.BNPI_DM4_SOURCE_CONFIG || DEFAULT_SOURCE_CONFIG,
	);
	if (!configPath) return DEFAULT_FILES;

	const absoluteConfigPath = path.isAbsolute(configPath)
		? configPath
		: path.resolve(process.cwd(), configPath);
	if (!require("fs").existsSync(absoluteConfigPath)) return DEFAULT_FILES;

	const config = JSON.parse(require("fs").readFileSync(absoluteConfigPath, "utf8"));
	const files = Array.isArray(config) ? config : config.files;
	if (!Array.isArray(files) || files.length === 0) return DEFAULT_FILES;

	const configDir = path.dirname(absoluteConfigPath);
	return files
		.map((item) => String(item || "").trim())
		.map((item) => (path.isAbsolute(item) ? item : path.resolve(configDir, item)))
		.filter(Boolean);
};

const expandSourceFiles = (sourcePaths) => {
	const fs = require("fs");
	const expanded = [];
	const visit = (sourcePath) => {
		const absolutePath = path.isAbsolute(sourcePath)
			? sourcePath
			: path.resolve(__dirname, sourcePath);
		if (!fs.existsSync(absolutePath)) return;
		const stat = fs.statSync(absolutePath);
		if (stat.isDirectory()) {
			for (const entry of fs.readdirSync(absolutePath)) {
				visit(path.join(absolutePath, entry));
			}
			return;
		}
		if (/\.(xlsx|xls)$/i.test(absolutePath)) expanded.push(absolutePath);
	};
	sourcePaths.forEach(visit);
	return expanded;
};

const parseBiometricTimestamp = (value) => {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	const text = String(value || "").trim();
	const match = text.match(
		/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i,
	);
	if (!match) {
		const parsed = new Date(text);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}
	const [, month, day, year, rawHour, minute, second = "00", meridiem = ""] = match;
	let hour = Number(rawHour);
	const normalizedMeridiem = meridiem.toUpperCase();
	if (normalizedMeridiem === "PM" && hour < 12) hour += 12;
	if (normalizedMeridiem === "AM" && hour === 12) hour = 0;
	return new Date(
		`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute}:${second}.000+08:00`,
	);
};

const getManilaDateKey = (date) =>
	new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);

const getManilaTimeText = (date) =>
	new Intl.DateTimeFormat("en-GB", {
		timeZone: "Asia/Manila",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);

const isBiometricWorkbookRows = (rows) =>
	rows.some((row) => {
		const headers = row.map(normalizeHeader);
		return headers.includes("no") && headers.includes("date time");
	});

const findBiometricPunchRows = (filePath, options = {}) => {
	const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, filePath);
	if (!require("fs").existsSync(absolutePath)) {
		return [];
	}
	const maxRows = Number(options.maxPresentRows || 0);
	const workbook = XLSX.readFile(absolutePath, { cellDates: true, raw: false, dense: true });
	const grouped = new Map();

	for (const sheetName of workbook.SheetNames) {
		const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
			header: 1,
			defval: "",
			blankrows: false,
			raw: false,
		});
		const headerIndex = rows.findIndex((row) => {
			const headers = row.map(normalizeHeader);
			return headers.includes("no") && headers.includes("date time");
		});
		if (headerIndex < 0) continue;

		const headers = rows[headerIndex];
		const badgeIndex = getColumnIndex(headers, ["No.", "No", "Badge ID", "Device ID"]);
		const timestampIndex = getColumnIndex(headers, ["Date/Time", "Date Time", "Timestamp"]);
		if (badgeIndex < 0 || timestampIndex < 0) continue;

		for (let index = headerIndex + 1; index < rows.length; index++) {
			const row = rows[index];
			const rawBadge = normalizeEmployeeId(row[badgeIndex]);
			const normalizedBadge = normalizeBadgeId(rawBadge);
			const timestamp = parseBiometricTimestamp(row[timestampIndex]);
			if (!normalizedBadge || !timestamp) continue;
			const date = getManilaDateKey(timestamp);
			const key = `${normalizedBadge}:${date}`;
			const existing = grouped.get(key) || {
				sourceKind: "biometric_punch",
				sourceWorkbookPath: path.relative(path.resolve(__dirname, "..", ".."), absolutePath),
				sourceWorkbook: path.basename(filePath),
				sourceSheet: sheetName,
				sourceRow: index + 1,
				sourceRows: [],
				date,
				dayOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay(),
				employeeId: normalizedBadge,
				rawBadge,
				normalizedBadge,
				employeeName: "",
				department: "Biometrics",
				presentMarker: "Date/Time",
				category: "BIOMETRIC_RAW",
				awol: "",
				punches: [],
			};
			existing.sourceRows.push(index + 1);
			existing.punches.push({
				sourceRow: index + 1,
				rawBadge,
				normalizedBadge,
				timestamp,
				time: getManilaTimeText(timestamp),
			});
			grouped.set(key, existing);
		}
	}

	const rowsOut = Array.from(grouped.values()).map((row) => {
		row.punches.sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
		const firstPunch = row.punches[0];
		const lastPunch = row.punches[row.punches.length - 1];
		return {
			...row,
			sourceRow: row.sourceRows[0],
			sourceRows: row.sourceRows,
			isWeekend: row.dayOfWeek === 0 || row.dayOfWeek === 6,
			timeIn: firstPunch?.time || "08:00",
			timeOut: lastPunch?.time || firstPunch?.time || "17:00",
			notes: `Raw biometric punches: ${row.punches.map((punch) => `${punch.time}#${punch.sourceRow}`).join(", ")}`,
		};
	});

	return maxRows > 0 ? rowsOut.slice(0, maxRows) : rowsOut;
};

const findPresentRows = (filePath, options = {}) => {
	const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, filePath);
	if (!require("fs").existsSync(absolutePath)) {
		return [];
	}
	const maxPresentRows = Number(options.maxPresentRows || 0);
	const workbook = XLSX.readFile(absolutePath, { cellDates: false, raw: false, dense: true });
	const { year, month } = parseYearMonthFromFile(filePath);
	const department = getDepartmentFromFile(filePath);
	const rowsOut = [];

	for (const sheetName of workbook.SheetNames) {
		const day = parseDayFromSheet(sheetName);
		if (!day) continue;

		const date = toIsoDate({
			year,
			month: parseMonthFromSheet(sheetName) || month,
			day,
		});
		const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
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
			employeeName: getColumnIndex(headers, ["Employee Name", "Name", "Full Name"]),
			leaveDate: getColumnIndex(headers, ["Leave Date"]),
			leaveType: getColumnIndex(headers, ["Leave Type"]),
			category: getColumnIndex(headers, ["Category"]),
			awol: getColumnIndex(headers, ["AWOL"]),
		};
		if ([indexes.employeeId, indexes.leaveDate, indexes.leaveType].some((index) => index < 0)) {
			continue;
		}

		for (let index = headerIndex + 1; index < rows.length; index++) {
			const row = rows[index];
			const employeeId = normalizeEmployeeId(row[indexes.employeeId]);
			if (isSummaryOrBlankEmployee(employeeId)) continue;
			const presentMarker = isPresentValue(row[indexes.leaveDate])
				? "Leave Date"
				: isPresentValue(row[indexes.leaveType])
					? "Leave Type"
					: "";
			if (!presentMarker) continue;

			rowsOut.push({
				sourceWorkbookPath: path.relative(path.resolve(__dirname, "..", ".."), absolutePath),
				sourceWorkbook: path.basename(filePath),
				sourceSheet: sheetName,
				sourceRow: index + 1,
				date,
				dayOfWeek,
				isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
				employeeId,
				employeeName: indexes.employeeName >= 0 ? String(row[indexes.employeeName] || "").trim() : "",
				department,
				presentMarker,
				category: indexes.category >= 0 ? String(row[indexes.category] || "").trim() : "",
				awol: indexes.awol >= 0 ? String(row[indexes.awol] || "").trim() : "",
			});
			if (maxPresentRows > 0 && rowsOut.length >= maxPresentRows) {
				return rowsOut;
			}
		}
	}

	return rowsOut;
};

const findSourceRows = (filePath, options = {}) => {
	const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, filePath);
	if (!require("fs").existsSync(absolutePath)) return [];
	const workbook = XLSX.readFile(absolutePath, { cellDates: true, raw: false, dense: true });
	const sampleRows = workbook.SheetNames.flatMap((sheetName) =>
		XLSX.utils
			.sheet_to_json(workbook.Sheets[sheetName], {
				header: 1,
				defval: "",
				blankrows: false,
				raw: false,
			})
			.slice(0, 5),
	);
	if (isBiometricWorkbookRows(sampleRows)) return findBiometricPunchRows(absolutePath, options);
	return findPresentRows(absolutePath, options);
};

const dateOnly = (date) => new Date(`${date}T00:00:00.000Z`);
const manilaTime = (date, time) => new Date(`${date}T${time}:00.000+08:00`);

const manilaTimeIsoOrNull = (date, time) => {
	if (!time) return null;
	const parsed = manilaTime(date, time);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const buildScheduleSnapshot = buildFallbackScheduleSnapshot;

const formatPersonName = (person) => {
	const info = person?.personalInfo || {};
	return [info.firstName, info.middleName, info.lastName]
		.filter(Boolean)
		.map(String)
		.join(" ")
		.trim();
};

const selectMatchedRows = async ({ organizationId, limit }) => {
	const fullImport = limit <= 0;
	const requiredDepartmentCount = Math.min(3, limit);
	const files = getSourceFiles();
	const expandedFiles = expandSourceFiles(files);
	emitProgress({
		phase: "READING_SOURCE",
		eventType: "STEP_PROGRESS",
		message: `Scanning ${expandedFiles.length} DM4 source workbook file(s).`,
		counts: { sourceWorkbookCount: expandedFiles.length, processed: 0, total: expandedFiles.length },
	});
	const sourceRows = [];
	const matched = [];
	const picked = [];
	const pickedDepartments = new Set();
	const employeeByCode = new Map();
	const employeeByDeviceEmpId = new Map();
	const allEmployeeIds = new Set();
	const sourceDepartmentCounts = {};
	const matchedDepartmentCounts = {};
	let weekendPresentCandidates = 0;

	const addPickedRows = (rows) => {
		if (fullImport) return;
		const weekdayMatches = rows.filter((item) => !item.isWeekend);
		for (const row of weekdayMatches) {
			if (picked.length >= Math.min(limit, requiredDepartmentCount)) break;
			if (!pickedDepartments.has(row.department)) {
				picked.push(row);
				pickedDepartments.add(row.department);
			}
		}
		for (const row of weekdayMatches) {
			if (picked.length >= limit) break;
			if (!picked.some((item) => item.employeeId === row.employeeId && item.date === row.date)) {
				picked.push(row);
				pickedDepartments.add(row.department);
			}
		}
	};

	for (const [fileIndex, file] of expandedFiles.entries()) {
		const rows = findSourceRows(file, {
			maxPresentRows: fullImport ? 0 : Math.max(limit * 4, 16),
		});
		sourceRows.push(...rows);
		for (const row of rows) {
			allEmployeeIds.add(row.employeeId);
			sourceDepartmentCounts[row.department] = (sourceDepartmentCounts[row.department] || 0) + 1;
		}

		const employeeIds = Array.from(new Set(rows.map((row) => row.employeeId))).filter(
			(employeeId) => !employeeByCode.has(employeeId) && !employeeByDeviceEmpId.has(employeeId),
		);
		const employees = employeeIds.length
			? await prisma.employee.findMany({
					where: {
						organizationId,
						isDeleted: false,
						OR: [{ deviceEmpId: { in: employeeIds } }, { employeeId: { in: employeeIds } }],
					},
					select: {
						id: true,
						employeeId: true,
						deviceEmpId: true,
						embeddedSchedule: true,
						employmentStartDate: true,
						employmentHireDate: true,
						scheduleHistoryRecords: {
							where: { organizationId },
							orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
							select: {
								effectiveAt: true,
								createdAt: true,
								beforeSchedule: true,
								afterSchedule: true,
							},
						},
						department: { select: { name: true, code: true } },
						section: { select: { name: true, code: true } },
						person: { select: { personalInfo: true } },
					},
				})
			: [];
		for (const employee of employees) {
			employeeByCode.set(employee.employeeId, employee);
			if (employee.deviceEmpId) employeeByDeviceEmpId.set(employee.deviceEmpId, employee);
		}

		const fileMatched = rows
			.map((row) => {
				const employee = employeeByDeviceEmpId.get(row.employeeId) || employeeByCode.get(row.employeeId);
				if (!employee) return null;
				const matchField = employee.deviceEmpId === row.employeeId ? "deviceEmpId" : "employeeId_fallback";
				return {
					...row,
					dbEmployeeDbId: employee.id,
					dbEmployeeId: employee.employeeId,
					dbDeviceEmpId: employee.deviceEmpId || "",
					matchField,
					dbEmployeeName: formatPersonName(employee.person),
					dbDepartment: employee.department?.name || "",
					dbSection: employee.section?.name || "",
					embeddedScheduleBefore: employee.embeddedSchedule || null,
					employeeScheduleData: employee,
				};
			})
			.filter(Boolean);
		matched.push(...fileMatched);
		weekendPresentCandidates += fileMatched.filter((item) => item.isWeekend).length;
		for (const row of fileMatched) {
			matchedDepartmentCounts[row.department] = (matchedDepartmentCounts[row.department] || 0) + 1;
		}
		addPickedRows(fileMatched);
		emitProgress({
			phase: "READING_SOURCE",
			eventType: "STEP_PROGRESS",
			message: `Scanned ${path.basename(file)} and matched ${fileMatched.length.toLocaleString()} attendance day(s).`,
			sourceWorkbook: path.relative(path.resolve(__dirname, "..", ".."), file),
			counts: {
				processed: fileIndex + 1,
				total: expandedFiles.length,
				sourceRowsScanned: sourceRows.length,
				dbEmployeesMatched: matched.length,
				selectedRows: fullImport ? matched.length : picked.length,
			},
		});
		if (!fullImport && picked.length >= limit && pickedDepartments.size >= requiredDepartmentCount) {
			break;
		}
	}
	const employeeIds = Array.from(allEmployeeIds);
	/*
	 * Demo proof only needs a representative, multi-department slice. Stop scanning
	 * once the selected proof set is complete instead of parsing every workbook.
	 */
	if (!fullImport && picked.length >= limit && pickedDepartments.size >= requiredDepartmentCount) {
		return {
			sourceRowsScanned: sourceRows.length,
			dbEmployeesMatched: matched.length,
			sourceDepartmentCounts,
			matchedDepartmentCounts,
			sourceFilesScanned: expandedFiles.length,
			sourceFilesPreview: expandedFiles
				.slice(0, REPORT_SAMPLE_LIMIT)
				.map((file) => path.relative(path.resolve(__dirname, "..", ".."), file)),
			unmatchedEmployeeIds: employeeIds
				.filter((employeeId) => !employeeByDeviceEmpId.has(employeeId) && !employeeByCode.has(employeeId))
				.slice(0, 25),
			selectedRows: picked.slice(0, limit),
			departmentsSelected: Array.from(pickedDepartments),
			weekendPresentCandidates,
			hasBiometricRows: sourceRows.some((row) => row.sourceKind === "biometric_punch"),
		};
	}

	const allMatched = sourceRows
		.map((row) => {
		const employee = employeeByDeviceEmpId.get(row.employeeId) || employeeByCode.get(row.employeeId);
		if (!employee) return null;
		const matchField = employee.deviceEmpId === row.employeeId ? "deviceEmpId" : "employeeId_fallback";
		return {
			...row,
			dbEmployeeDbId: employee.id,
			dbEmployeeId: employee.employeeId,
			dbDeviceEmpId: employee.deviceEmpId || "",
			matchField,
			dbEmployeeName: formatPersonName(employee.person),
			dbDepartment: employee.department?.name || "",
			dbSection: employee.section?.name || "",
				embeddedScheduleBefore: employee.embeddedSchedule || null,
				employeeScheduleData: employee,
			};
		})
		.filter(Boolean);

	if (fullImport) {
		const deduped = new Map();
		for (const row of allMatched) {
			const key = `${row.dbEmployeeDbId}:${row.date}`;
			const existing = deduped.get(key);
			if (!existing) {
				deduped.set(key, row);
				continue;
			}
			const existingPunches = Array.isArray(existing.punches) ? existing.punches.length : 0;
			const rowPunches = Array.isArray(row.punches) ? row.punches.length : 0;
			if (rowPunches > existingPunches) {
				deduped.set(key, row);
			}
		}
		const selectedRows = Array.from(deduped.values()).sort((left, right) => {
			const dateCompare = String(left.date).localeCompare(String(right.date));
			if (dateCompare !== 0) return dateCompare;
			return String(left.employeeId).localeCompare(String(right.employeeId));
		});

		return {
			sourceRowsScanned: sourceRows.length,
			dbEmployeesMatched: allMatched.length,
			sourceDepartmentCounts,
			matchedDepartmentCounts,
			sourceFilesScanned: expandedFiles.length,
			sourceFilesPreview: expandedFiles
				.slice(0, REPORT_SAMPLE_LIMIT)
				.map((file) => path.relative(path.resolve(__dirname, "..", ".."), file)),
			unmatchedEmployeeIds: employeeIds
				.filter((employeeId) => !employeeByDeviceEmpId.has(employeeId) && !employeeByCode.has(employeeId))
				.slice(0, 25),
			selectedRows,
			selectedRowsTotal: selectedRows.length,
			departmentsSelected: Array.from(new Set(selectedRows.map((row) => row.department))).filter(Boolean),
			weekendPresentCandidates,
			hasBiometricRows: sourceRows.some((row) => row.sourceKind === "biometric_punch"),
			fullImport: true,
		};
	}

	const fallbackPicked = [];
	const fallbackPickedDepartments = new Set();
	const weekdayMatches = allMatched.filter((item) => !item.isWeekend);
	for (const row of weekdayMatches) {
		if (fallbackPicked.length >= Math.min(limit, 3)) break;
		if (!fallbackPickedDepartments.has(row.department)) {
			fallbackPicked.push(row);
			fallbackPickedDepartments.add(row.department);
		}
	}
	for (const row of weekdayMatches) {
		if (fallbackPicked.length >= limit) break;
		if (!fallbackPicked.some((item) => item.employeeId === row.employeeId && item.date === row.date)) {
			fallbackPicked.push(row);
			fallbackPickedDepartments.add(row.department);
		}
	}

	return {
		sourceRowsScanned: sourceRows.length,
		dbEmployeesMatched: allMatched.length,
		sourceDepartmentCounts,
		matchedDepartmentCounts,
		sourceFilesScanned: expandedFiles.length,
		sourceFilesPreview: expandedFiles
			.slice(0, REPORT_SAMPLE_LIMIT)
			.map((file) => path.relative(path.resolve(__dirname, "..", ".."), file)),
		unmatchedEmployeeIds: employeeIds
			.filter((employeeId) => !employeeByDeviceEmpId.has(employeeId) && !employeeByCode.has(employeeId))
			.slice(0, 25),
		selectedRows: fallbackPicked.slice(0, limit),
		departmentsSelected: Array.from(fallbackPickedDepartments),
		weekendPresentCandidates: allMatched.filter((item) => item.isWeekend).length,
		hasBiometricRows: sourceRows.some((row) => row.sourceKind === "biometric_punch"),
	};
};

const ensureDefaultSchedule = async (organizationId) => {
	const shiftType = await prisma.shiftType.upsert({
		where: { organizationId_code: { organizationId, code: SCHEDULE_CODE } },
		create: {
			organizationId,
			code: SCHEDULE_CODE,
			name: SCHEDULE_NAME,
			isOvernight: false,
			isOff: false,
			isActive: true,
			shiftHour: 8,
			timeSlots: scheduleSlots,
		},
		update: {
			name: SCHEDULE_NAME,
			isOvernight: false,
			isOff: false,
			isActive: true,
			shiftHour: 8,
			timeSlots: scheduleSlots,
		},
	});

	const pattern = [1, 2, 3, 4, 5, 6, 7].map((day) => {
		if (day <= 5) {
			return {
				day,
				shiftTypeId: shiftType.id,
				shiftSnapshot: buildScheduleSnapshot("DM0_SHIFT_TYPE_BNPI_DEFAULT"),
			};
		}
		return { day, shiftTypeId: null, shiftSnapshot: { isOff: true, label: "REST" } };
	});

	const scheduleTemplate = await prisma.scheduleTemplate.upsert({
		where: { organizationId_code: { organizationId, code: SCHEDULE_CODE } },
		create: {
			organizationId,
			code: SCHEDULE_CODE,
			name: SCHEDULE_NAME,
			description: "Default BNPI 2026 migration schedule for attendance reconciliation.",
			cycleDays: 7,
			graceLateMinutes: 0,
			graceEarlyOutMinutes: 0,
			pattern,
			totalHour: 40,
			totalDay: 5,
			isActive: true,
		},
		update: {
			name: SCHEDULE_NAME,
			description: "Default BNPI 2026 migration schedule for attendance reconciliation.",
			cycleDays: 7,
			graceLateMinutes: 0,
			graceEarlyOutMinutes: 0,
			pattern,
			totalHour: 40,
			totalDay: 5,
			isActive: true,
		},
	});

	return { shiftType, scheduleTemplate };
};

// Only fields DM4 materialization needs. Avoid selecting schema-only columns that may not
// exist yet on older DBs (e.g. payslipReleaseAttachmentUrl) during findMany/findFirst.
const PAYROLL_PERIOD_SELECT = {
	id: true,
	organizationId: true,
	name: true,
	code: true,
	startDate: true,
	endDate: true,
	payDate: true,
	status: true,
	isDeleted: true,
};

const ensurePayrollPeriod = async (organizationId, date) => {
	const target = dateOnly(date);
	const existing = await prisma.payrollPeriod.findFirst({
		where: {
			organizationId,
			isDeleted: false,
			startDate: { lte: target },
			endDate: { gte: target },
		},
		orderBy: { startDate: "asc" },
		select: PAYROLL_PERIOD_SELECT,
	});
	if (existing) return { payrollPeriod: existing, created: false };

	const [year, month] = date.split("-").map(Number);
	const startDate = new Date(Date.UTC(year, month - 1, 1));
	const endDate = new Date(Date.UTC(year, month, 0));
	const payDate = new Date(Date.UTC(year, month, 5));
	const payrollPeriod = await prisma.payrollPeriod.create({
		data: {
			organizationId,
			name: `BNPI Demo ${date.slice(0, 7)} Attendance Period`,
			code: `BNPI-DEMO-${date.slice(0, 7)}`,
			startDate,
			endDate,
			payDate,
			status: "OPEN",
			notes: `${SOURCE_TAG}: created for selected BNPI attendance demo proof.`,
			generationMetadata: { source: SOURCE_TAG, reason: "selected_bnpi_attendance_demo_proof" },
		},
		select: PAYROLL_PERIOD_SELECT,
	});
	return { payrollPeriod, created: true };
};

const bulkMaterializePresentRows = async (organizationId, rows, options = {}) => {
	if (!rows.length) {
		return {
			applied: [],
			touchedTimesheetCount: 0,
			writeCounts: {
				attendanceCreated: 0,
				attendanceUpdated: 0,
				timesheetlineCreated: 0,
				timesheetlineUpdated: 0,
				attendanceObligationCreated: 0,
				attendanceObligationUpdated: 0,
				attendanceObligationSkippedPaid: 0,
				timesheetsCreated: 0,
				timesheetsApproved: 0,
			},
		};
	}
	const approveHistoricalTimesheets = Boolean(options.approveHistoricalTimesheets);
	const payload = rows.map((row) => ({
		employeeDbId: row.dbEmployeeDbId,
		employeeCode: row.dbEmployeeId || row.employeeId,
		employeeName: row.dbEmployeeName || row.employeeName || row.employeeId,
		departmentName: row.dbDepartment || row.department || null,
		payrollPeriodId: row.payrollPeriod.id,
		payrollPeriodCode: row.payrollPeriod.code,
		date: row.date,
		timeIn: manilaTime(row.date, row.timeIn).toISOString(),
		timeBreak: manilaTimeIsoOrNull(row.date, row.timeBreak),
		timeOut: manilaTime(row.date, row.timeOut).toISOString(),
		expectedStartAt: manilaTime(row.date, row.scheduleSnapshot.startTime || "08:00").toISOString(),
		expectedEndAt: manilaTime(row.date, row.scheduleSnapshot.endTime || "17:00").toISOString(),
		status: "PRESENT",
		sourceRequestId: row.sourceRequestId,
		scheduleSnapshot: row.scheduleSnapshot,
		scheduleFingerprint: row.scheduleSnapshot.scheduleCode || SCHEDULE_CODE,
		totalMinutesWorked: row.totalMinutesWorked,
		regularMinutes: row.regularMinutes,
		overtimeMinutes: row.overtimeMinutes,
		hoursWorked: row.hoursWorked,
		regularHours: row.regularHours,
		overtimeHours: row.overtimeHours,
		breakMinutes: row.breakMinutes,
		sourceWorkbook: row.sourceWorkbook,
		sourceWorkbookPath: row.sourceWorkbookPath,
		sourceSheet: row.sourceSheet,
		sourceRow: row.sourceRow,
		sourceRows: row.sourceRows || [row.sourceRow],
		sourceKind: row.sourceKind || "attendance_summary",
		rawBadge: row.rawBadge || null,
		normalizedBadge: row.normalizedBadge || row.employeeId,
		matchField: row.matchField || null,
		dbDeviceEmpId: row.dbDeviceEmpId || null,
		punches: row.punches
			? row.punches.map((punch) => ({
					sourceRow: punch.sourceRow,
					rawBadge: punch.rawBadge,
					normalizedBadge: punch.normalizedBadge,
					timestamp: punch.timestamp.toISOString(),
					time: punch.time,
				}))
			: null,
		notes:
			row.notes ||
			`${SOURCE_TAG}: ${row.sourceWorkbook} / ${row.sourceSheet} / row ${row.sourceRow}; PRESENT normalized to 08:00-17:00 with 12:00-13:00 unpaid break.`,
	}));
	const resultRows = await prisma.$queryRawUnsafe(
		`
WITH input_rows AS (
	SELECT DISTINCT ON ("sourceRequestId")
		$1::text AS "organizationId",
		x."employeeDbId",
		x."employeeCode",
		x."employeeName",
		x."departmentName",
		x."payrollPeriodId",
		x."payrollPeriodCode",
		x.date::date AS date,
		x."timeIn"::timestamptz AS "timeIn",
		x."timeBreak"::timestamptz AS "timeBreak",
		x."timeOut"::timestamptz AS "timeOut",
		x."expectedStartAt"::timestamptz AS "expectedStartAt",
		x."expectedEndAt"::timestamptz AS "expectedEndAt",
		x.status,
		x."sourceRequestId",
		x."scheduleSnapshot",
		x."scheduleFingerprint",
		x."totalMinutesWorked",
		x."regularMinutes",
		x."overtimeMinutes",
		x."hoursWorked",
		x."regularHours",
		x."overtimeHours",
		x."breakMinutes",
		x."sourceWorkbook",
		x."sourceWorkbookPath",
		x."sourceSheet",
		x."sourceRow",
		x."sourceRows",
		x."sourceKind",
		x."rawBadge",
		x."normalizedBadge",
		x."matchField",
		x."dbDeviceEmpId",
		x.punches,
		x.notes
	FROM jsonb_to_recordset($2::jsonb) AS x(
		"employeeDbId" text,
		"employeeCode" text,
		"employeeName" text,
		"departmentName" text,
		"payrollPeriodId" text,
		"payrollPeriodCode" text,
		date text,
		"timeIn" text,
		"timeBreak" text,
		"timeOut" text,
		"expectedStartAt" text,
		"expectedEndAt" text,
		status text,
		"sourceRequestId" text,
		"scheduleSnapshot" jsonb,
		"scheduleFingerprint" text,
		"totalMinutesWorked" int,
		"regularMinutes" int,
		"overtimeMinutes" int,
		"hoursWorked" text,
		"regularHours" text,
		"overtimeHours" text,
		"breakMinutes" int,
		"sourceWorkbook" text,
		"sourceWorkbookPath" text,
		"sourceSheet" text,
		"sourceRow" int,
		"sourceRows" jsonb,
		"sourceKind" text,
		"rawBadge" text,
		"normalizedBadge" text,
		"matchField" text,
		"dbDeviceEmpId" text,
		punches jsonb,
		notes text
	)
	WHERE x."employeeDbId" IS NOT NULL
		AND x."payrollPeriodId" IS NOT NULL
		AND x."sourceRequestId" IS NOT NULL
	ORDER BY "sourceRequestId", date
),
existing_timesheets AS (
	SELECT DISTINCT ON (t."employeeId", t."payrollPeriodId")
		t.id, t."employeeId", t."payrollPeriodId"
	FROM timesheets t
	JOIN input_rows i
		ON i."organizationId" = t."organizationId"
		AND i."employeeDbId" = t."employeeId"
		AND i."payrollPeriodId" = t."payrollPeriodId"
	WHERE t."isDeleted" = false
	ORDER BY t."employeeId", t."payrollPeriodId", t."updatedAt" DESC, t.id
),
input_totals AS (
	SELECT
		i."organizationId",
		i."employeeDbId",
		i."payrollPeriodId",
		min(i.date) AS "firstDate",
		COUNT(*)::int AS line_count,
		COALESCE(SUM((split_part(COALESCE(i."hoursWorked", '0:00'), ':', 1)::int * 60) + split_part(COALESCE(i."hoursWorked", '0:00'), ':', 2)::int), 0)::int AS worked_minutes,
		COALESCE(SUM((split_part(COALESCE(i."regularHours", '0:00'), ':', 1)::int * 60) + split_part(COALESCE(i."regularHours", '0:00'), ':', 2)::int), 0)::int AS regular_minutes,
		COALESCE(SUM((split_part(COALESCE(i."overtimeHours", '0:00'), ':', 1)::int * 60) + split_part(COALESCE(i."overtimeHours", '0:00'), ':', 2)::int), 0)::int AS overtime_minutes
	FROM input_rows i
	GROUP BY i."organizationId", i."employeeDbId", i."payrollPeriodId"
),
historical_approval_periods AS (
	SELECT DISTINCT it."payrollPeriodId"
	FROM input_totals it
	JOIN payroll_periods pp
		ON pp.id = it."payrollPeriodId"
		AND pp."organizationId" = it."organizationId"
		AND pp."isDeleted" = false
	WHERE $4::boolean
		AND pp."endDate"::date < (now() AT TIME ZONE 'Asia/Manila')::date
),
timesheet_insert AS (
	INSERT INTO timesheets (
		id,
		code,
		"organizationId",
		"employeeId",
		"payrollPeriodId",
		status,
		"totalDays",
		"totalHoursWorked",
		"totalRegularHours",
		"totalOvertimeHours",
		"totalUndertimeHours",
		"totalLateHours",
		"totalEarlyOutHours",
		"submittedAt",
		"approvalDate",
		notes,
		metadata,
		"isDeleted",
		"createdAt",
		"updatedAt"
	)
	SELECT
		'dm4ts_' || substr(md5(it."organizationId" || ':' || it."employeeDbId" || ':' || it."payrollPeriodId"), 1, 20),
		'BNPI-' || replace(it."firstDate"::text, '-', '') || '-' || upper(right(it."employeeDbId", 8)),
		it."organizationId",
		it."employeeDbId",
		it."payrollPeriodId",
		CASE
			WHEN EXISTS (
				SELECT 1 FROM historical_approval_periods hap
				WHERE hap."payrollPeriodId" = it."payrollPeriodId"
			) THEN 'APPROVED'::"TimesheetStatus"
			ELSE 'DRAFT'::"TimesheetStatus"
		END,
		it.line_count,
		floor(it.worked_minutes / 60)::text || ':' || lpad((it.worked_minutes % 60)::text, 2, '0'),
		floor(it.regular_minutes / 60)::text || ':' || lpad((it.regular_minutes % 60)::text, 2, '0'),
		floor(it.overtime_minutes / 60)::text || ':' || lpad((it.overtime_minutes % 60)::text, 2, '0'),
		'0:00',
		'0:00',
		'0:00',
		CASE
			WHEN EXISTS (
				SELECT 1 FROM historical_approval_periods hap
				WHERE hap."payrollPeriodId" = it."payrollPeriodId"
			) THEN now()
			ELSE NULL
		END,
		CASE
			WHEN EXISTS (
				SELECT 1 FROM historical_approval_periods hap
				WHERE hap."payrollPeriodId" = it."payrollPeriodId"
			) THEN now()
			ELSE NULL
		END,
		$3::text || ': created for selected BNPI attendance demo proof.',
		jsonb_build_object(
			'source', $3::text,
			'totalMinutesWorked', it.worked_minutes,
			'totalRegularMinutes', it.regular_minutes,
			'totalOvertimeMinutes', it.overtime_minutes,
			'totalUndertimeMinutes', 0,
			'totalLateMinutes', 0,
			'totalEarlyOutMinutes', 0,
			'approvedFromDm4Proof', EXISTS (
				SELECT 1 FROM historical_approval_periods hap
				WHERE hap."payrollPeriodId" = it."payrollPeriodId"
			)
		),
		false,
		now(),
		now()
	FROM input_totals it
	LEFT JOIN existing_timesheets et
		ON et."employeeId" = it."employeeDbId"
		AND et."payrollPeriodId" = it."payrollPeriodId"
	WHERE et.id IS NULL
	ON CONFLICT ("organizationId", "employeeId", "payrollPeriodId") DO NOTHING
	RETURNING id, "employeeId", "payrollPeriodId"
),
target_timesheets AS (
	SELECT DISTINCT ON ("employeeId", "payrollPeriodId")
		id, "employeeId", "payrollPeriodId"
	FROM (
		SELECT id, "employeeId", "payrollPeriodId" FROM existing_timesheets
		UNION ALL
		SELECT id, "employeeId", "payrollPeriodId" FROM timesheet_insert
	) t
	ORDER BY "employeeId", "payrollPeriodId", id
),
rows_with_timesheets AS (
	SELECT i.*, tt.id AS "timesheetId"
	FROM input_rows i
	JOIN target_timesheets tt
		ON tt."employeeId" = i."employeeDbId"
		AND tt."payrollPeriodId" = i."payrollPeriodId"
),
historical_approval_timesheets AS (
	SELECT DISTINCT r."timesheetId"
	FROM rows_with_timesheets r
	JOIN historical_approval_periods hap
		ON hap."payrollPeriodId" = r."payrollPeriodId"
),
existing_attendance AS (
	SELECT DISTINCT ON (a."sourceRequestId")
		a.id,
		a."sourceRequestId"
	FROM attendances a
	JOIN rows_with_timesheets r
		ON r."organizationId" = a."organizationId"
		AND r."sourceRequestId" = a."sourceRequestId"
	WHERE a."isDeleted" = false
	ORDER BY a."sourceRequestId", a."updatedAt" DESC, a.id
),
attendance_update AS (
	UPDATE attendances a
	SET
		"employeeId" = r."employeeDbId",
		date = r.date,
		"timeIn" = r."timeIn",
		"timeBreak" = r."timeBreak",
		"timeOut" = r."timeOut",
		status = 'PRESENT'::"AttendanceStatus",
		"ledgerType" = 'RAW'::"AttendanceLedgerType",
		"isManualEntry" = true,
		"isEffective" = true,
		"sourceRequestId" = r."sourceRequestId",
		"scheduleSnapshot" = r."scheduleSnapshot",
		"totalMinutesWorked" = r."totalMinutesWorked",
		"regularMinutes" = r."regularMinutes",
		"overtimeMinutes" = r."overtimeMinutes",
		"undertimeMinutes" = 0,
		"lateMinutes" = 0,
		"earlyOutMinutes" = 0,
		"breakMinutes" = r."breakMinutes",
		"hoursWorked" = r."hoursWorked",
		"regularHours" = r."regularHours",
		"overtimeHours" = r."overtimeHours",
		"undertimeHours" = '0:00',
		"lateHours" = '0:00',
		"earlyOutHours" = '0:00',
		"timesheetId" = r."timesheetId",
		"employeeCodeSnapshot" = r."employeeCode",
		"employeeNameSnapshot" = r."employeeName",
		"departmentNameSnapshot" = r."departmentName",
		notes = r.notes,
		"isDeleted" = false,
		"updatedAt" = now()
	FROM rows_with_timesheets r
	JOIN existing_attendance ea ON ea."sourceRequestId" = r."sourceRequestId"
	WHERE ea.id = a.id
	RETURNING a.id, a."sourceRequestId"
),
attendance_insert AS (
	INSERT INTO attendances (
		id,
		"organizationId",
		"employeeId",
		date,
		"timeIn",
		"timeBreak",
		"timeOut",
		status,
		"ledgerType",
		"isManualEntry",
		"isEffective",
		"sourceRequestId",
		"scheduleSnapshot",
		"totalMinutesWorked",
		"regularMinutes",
		"overtimeMinutes",
		"undertimeMinutes",
		"lateMinutes",
		"earlyOutMinutes",
		"breakMinutes",
		"hoursWorked",
		"regularHours",
		"overtimeHours",
		"undertimeHours",
		"lateHours",
		"earlyOutHours",
		"timesheetId",
		"employeeCodeSnapshot",
		"employeeNameSnapshot",
		"departmentNameSnapshot",
		notes,
		"isDeleted",
		"createdAt",
		"updatedAt"
	)
	SELECT
		'dm4att_' || substr(md5(r."organizationId" || ':' || r."sourceRequestId"), 1, 19),
		r."organizationId",
		r."employeeDbId",
		r.date,
		r."timeIn",
		r."timeBreak",
		r."timeOut",
		'PRESENT'::"AttendanceStatus",
		'RAW'::"AttendanceLedgerType",
		true,
		true,
		r."sourceRequestId",
		r."scheduleSnapshot",
		r."totalMinutesWorked",
		r."regularMinutes",
		r."overtimeMinutes",
		0,
		0,
		0,
		r."breakMinutes",
		r."hoursWorked",
		r."regularHours",
		r."overtimeHours",
		'0:00',
		'0:00',
		'0:00',
		r."timesheetId",
		r."employeeCode",
		r."employeeName",
		r."departmentName",
		r.notes,
		false,
		now(),
		now()
	FROM rows_with_timesheets r
	LEFT JOIN existing_attendance ea ON ea."sourceRequestId" = r."sourceRequestId"
	WHERE ea.id IS NULL
	ON CONFLICT (id) DO UPDATE SET
		"employeeId" = EXCLUDED."employeeId",
		date = EXCLUDED.date,
		"timeIn" = EXCLUDED."timeIn",
		"timeBreak" = EXCLUDED."timeBreak",
		"timeOut" = EXCLUDED."timeOut",
		status = EXCLUDED.status,
		"ledgerType" = EXCLUDED."ledgerType",
		"isManualEntry" = EXCLUDED."isManualEntry",
		"isEffective" = EXCLUDED."isEffective",
		"sourceRequestId" = EXCLUDED."sourceRequestId",
		"scheduleSnapshot" = EXCLUDED."scheduleSnapshot",
		"totalMinutesWorked" = EXCLUDED."totalMinutesWorked",
		"regularMinutes" = EXCLUDED."regularMinutes",
		"overtimeMinutes" = EXCLUDED."overtimeMinutes",
		"undertimeMinutes" = EXCLUDED."undertimeMinutes",
		"lateMinutes" = EXCLUDED."lateMinutes",
		"earlyOutMinutes" = EXCLUDED."earlyOutMinutes",
		"breakMinutes" = EXCLUDED."breakMinutes",
		"hoursWorked" = EXCLUDED."hoursWorked",
		"regularHours" = EXCLUDED."regularHours",
		"overtimeHours" = EXCLUDED."overtimeHours",
		"undertimeHours" = EXCLUDED."undertimeHours",
		"lateHours" = EXCLUDED."lateHours",
		"earlyOutHours" = EXCLUDED."earlyOutHours",
		"timesheetId" = EXCLUDED."timesheetId",
		"employeeCodeSnapshot" = EXCLUDED."employeeCodeSnapshot",
		"employeeNameSnapshot" = EXCLUDED."employeeNameSnapshot",
		"departmentNameSnapshot" = EXCLUDED."departmentNameSnapshot",
		notes = EXCLUDED.notes,
		"isDeleted" = false,
		"updatedAt" = now()
	RETURNING id, "sourceRequestId", (xmax = 0) AS inserted
),
attendance_after AS (
	SELECT id, "sourceRequestId" FROM attendance_update
	UNION ALL
	SELECT id, "sourceRequestId" FROM attendance_insert
),
line_upsert AS (
	INSERT INTO timesheet_lines (
		id,
		"organizationId",
		"employeeId",
		"timesheetId",
		"payrollPeriodId",
		"attendanceId",
		date,
		"timeIn",
		"timeBreak",
		"timeOut",
		status,
		"behaviorFlags",
		"scheduleSnapshot",
		"hoursWorked",
		"regularHours",
		"overtimeHours",
		"undertimeHours",
		"lateHours",
		"earlyOutHours",
		"breakMinutes",
		metadata,
		"primaryMarker",
		"isManualEntry",
		"isVirtual",
		"revisionNo",
		"isEffective",
		"ledgerType",
		"employeeCodeSnapshot",
		"employeeNameSnapshot",
		"departmentNameSnapshot",
		notes,
		"isDeleted",
		"createdAt",
		"updatedAt"
	)
	SELECT
		'dm4tlp_' || substr(md5(r."organizationId" || ':' || r."timesheetId" || ':' || r.date::text || ':present'), 1, 19),
		r."organizationId",
		r."employeeDbId",
		r."timesheetId",
		r."payrollPeriodId",
		aa.id,
		r.date,
		r."timeIn",
		r."timeBreak",
		r."timeOut",
		'PRESENT',
		ARRAY[]::text[],
		r."scheduleSnapshot",
		r."hoursWorked",
		r."regularHours",
		r."overtimeHours",
		'0:00',
		'0:00',
		'0:00',
		r."breakMinutes",
		jsonb_build_object(
			'source', $3::text,
			'sourceRequestId', r."sourceRequestId",
			'sourceWorkbook', r."sourceWorkbook",
			'sourceWorkbookPath', r."sourceWorkbookPath",
			'sourceSheet', r."sourceSheet",
			'sourceRow', r."sourceRow",
			'sourceRows', r."sourceRows",
			'sourceKind', r."sourceKind",
			'rawBadge', r."rawBadge",
			'normalizedBadge', r."normalizedBadge",
			'matchField', r."matchField",
			'dbEmployeeId', r."employeeCode",
			'dbDeviceEmpId', r."dbDeviceEmpId",
			'punches', r.punches,
			'shiftCode', r."scheduleFingerprint",
			'regularMinutes', r."regularMinutes",
			'overtimeMinutes', r."overtimeMinutes",
			'totalMinutesWorked', r."totalMinutesWorked",
			'breakMinutes', r."breakMinutes"
		),
		'PRESENT',
		true,
		false,
		1,
		true,
		'SNAPSHOT',
		r."employeeCode",
		r."employeeName",
		r."departmentName",
		COALESCE(r.notes, $3::text || ': selected BNPI source row ' || r."sourceRow"::text || '.'),
		false,
		now(),
		now()
	FROM rows_with_timesheets r
	JOIN attendance_after aa ON aa."sourceRequestId" = r."sourceRequestId"
	ON CONFLICT ("organizationId", "timesheetId", date, "revisionNo")
	DO UPDATE SET
		"attendanceId" = EXCLUDED."attendanceId",
		"timeIn" = EXCLUDED."timeIn",
		"timeBreak" = EXCLUDED."timeBreak",
		"timeOut" = EXCLUDED."timeOut",
		status = EXCLUDED.status,
		"behaviorFlags" = EXCLUDED."behaviorFlags",
		"scheduleSnapshot" = EXCLUDED."scheduleSnapshot",
		"hoursWorked" = EXCLUDED."hoursWorked",
		"regularHours" = EXCLUDED."regularHours",
		"overtimeHours" = EXCLUDED."overtimeHours",
		"undertimeHours" = EXCLUDED."undertimeHours",
		"lateHours" = EXCLUDED."lateHours",
		"earlyOutHours" = EXCLUDED."earlyOutHours",
		"breakMinutes" = EXCLUDED."breakMinutes",
		metadata = EXCLUDED.metadata,
		"primaryMarker" = EXCLUDED."primaryMarker",
		"isManualEntry" = EXCLUDED."isManualEntry",
		"isVirtual" = EXCLUDED."isVirtual",
		"isEffective" = true,
		"ledgerType" = EXCLUDED."ledgerType",
		"employeeCodeSnapshot" = EXCLUDED."employeeCodeSnapshot",
		"employeeNameSnapshot" = EXCLUDED."employeeNameSnapshot",
		"departmentNameSnapshot" = EXCLUDED."departmentNameSnapshot",
		notes = EXCLUDED.notes,
		"isDeleted" = false,
		"updatedAt" = now()
	RETURNING id, "organizationId", "employeeId", "timesheetId", "payrollPeriodId", date, "attendanceId", (xmax = 0) AS inserted
),
paid_obligations AS (
	SELECT ao.id
	FROM attendance_obligations ao
	JOIN rows_with_timesheets r
		ON r."organizationId" = ao."organizationId"
		AND r."employeeDbId" = ao."employeeId"
		AND r."payrollPeriodId" = ao."payrollPeriodId"
		AND r.date = ao.date
	WHERE ao."isDeleted" = false
		AND upper(COALESCE(ao.phase, '')) = 'PAID'
),
obligation_upsert AS (
	INSERT INTO attendance_obligations (
		id,
		"organizationId",
		"employeeId",
		"payrollPeriodId",
		date,
		"businessDate",
		timezone,
		status,
		phase,
		"attendanceId",
		"timesheetId",
		"timesheetlineId",
		"expectedStartAt",
		"expectedEndAt",
		"timeIn",
		"timeBreak",
		"timeOut",
		"hoursWorked",
		"regularHours",
		"overtimeHours",
		"undertimeHours",
		"lateHours",
		"earlyOutHours",
		"breakMinutes",
		"behaviorFlags",
		"scheduleSnapshot",
		"scheduleFingerprint",
		source,
		"sourceRequestId",
		metadata,
		"employeeCodeSnapshot",
		"employeeNameSnapshot",
		"departmentNameSnapshot",
		"isDeleted",
		"createdAt",
		"updatedAt"
	)
	SELECT
		'dm4ao_' || substr(md5(r."organizationId" || ':' || r."employeeDbId" || ':' || r."payrollPeriodId" || ':' || r.date::text), 1, 20),
		r."organizationId",
		r."employeeDbId",
		r."payrollPeriodId",
		r.date,
		r.date::text,
		'Asia/Manila',
		'PRESENT',
		'ACTIVE',
		lu."attendanceId",
		r."timesheetId",
		lu.id,
		r."expectedStartAt",
		r."expectedEndAt",
		r."timeIn",
		r."timeBreak",
		r."timeOut",
		r."hoursWorked",
		r."regularHours",
		r."overtimeHours",
		'0:00',
		'0:00',
		'0:00',
		r."breakMinutes",
		ARRAY[]::text[],
		r."scheduleSnapshot",
		r."scheduleFingerprint",
		'RAW',
		r."sourceRequestId",
		jsonb_build_object(
			'source', $3::text,
			'sourceWorkbook', r."sourceWorkbook",
			'sourceWorkbookPath', r."sourceWorkbookPath",
			'sourceSheet', r."sourceSheet",
			'sourceRow', r."sourceRow",
			'sourceRows', r."sourceRows",
			'sourceKind', r."sourceKind",
			'timesheetlineId', lu.id,
			'attendanceAppliedAt', now()
		),
		r."employeeCode",
		r."employeeName",
		r."departmentName",
		false,
		now(),
		now()
	FROM rows_with_timesheets r
	JOIN line_upsert lu
		ON lu."organizationId" = r."organizationId"
		AND lu."employeeId" = r."employeeDbId"
		AND lu."payrollPeriodId" = r."payrollPeriodId"
		AND lu.date = r.date
	WHERE NOT EXISTS (
		SELECT 1
		FROM attendance_obligations paid
		WHERE paid."organizationId" = r."organizationId"
			AND paid."employeeId" = r."employeeDbId"
			AND paid."payrollPeriodId" = r."payrollPeriodId"
			AND paid.date = r.date
			AND paid."isDeleted" = false
			AND upper(COALESCE(paid.phase, '')) = 'PAID'
	)
	ON CONFLICT ("organizationId", "employeeId", "payrollPeriodId", date)
	DO UPDATE SET
		status = EXCLUDED.status,
		"attendanceId" = EXCLUDED."attendanceId",
		"timesheetId" = EXCLUDED."timesheetId",
		"timesheetlineId" = EXCLUDED."timesheetlineId",
		"expectedStartAt" = EXCLUDED."expectedStartAt",
		"expectedEndAt" = EXCLUDED."expectedEndAt",
		"timeIn" = EXCLUDED."timeIn",
		"timeBreak" = EXCLUDED."timeBreak",
		"timeOut" = EXCLUDED."timeOut",
		"hoursWorked" = EXCLUDED."hoursWorked",
		"regularHours" = EXCLUDED."regularHours",
		"overtimeHours" = EXCLUDED."overtimeHours",
		"undertimeHours" = EXCLUDED."undertimeHours",
		"lateHours" = EXCLUDED."lateHours",
		"earlyOutHours" = EXCLUDED."earlyOutHours",
		"breakMinutes" = EXCLUDED."breakMinutes",
		"behaviorFlags" = EXCLUDED."behaviorFlags",
		"scheduleSnapshot" = EXCLUDED."scheduleSnapshot",
		"scheduleFingerprint" = EXCLUDED."scheduleFingerprint",
		source = EXCLUDED.source,
		"sourceRequestId" = EXCLUDED."sourceRequestId",
		metadata = COALESCE(attendance_obligations.metadata, '{}'::jsonb) || EXCLUDED.metadata,
		"employeeCodeSnapshot" = EXCLUDED."employeeCodeSnapshot",
		"employeeNameSnapshot" = EXCLUDED."employeeNameSnapshot",
		"departmentNameSnapshot" = EXCLUDED."departmentNameSnapshot",
		"isDeleted" = false,
		"updatedAt" = now()
	WHERE upper(COALESCE(attendance_obligations.phase, '')) <> 'PAID'
	RETURNING id, (xmax = 0) AS inserted
),
line_totals AS (
	SELECT
		tl."timesheetId",
		COUNT(*)::int AS line_count,
		COALESCE(SUM((split_part(COALESCE(tl."hoursWorked", '0:00'), ':', 1)::int * 60) + split_part(COALESCE(tl."hoursWorked", '0:00'), ':', 2)::int), 0)::int AS worked_minutes,
		COALESCE(SUM((split_part(COALESCE(tl."regularHours", '0:00'), ':', 1)::int * 60) + split_part(COALESCE(tl."regularHours", '0:00'), ':', 2)::int), 0)::int AS regular_minutes,
		COALESCE(SUM((split_part(COALESCE(tl."overtimeHours", '0:00'), ':', 1)::int * 60) + split_part(COALESCE(tl."overtimeHours", '0:00'), ':', 2)::int), 0)::int AS overtime_minutes,
		COALESCE(SUM((split_part(COALESCE(tl."undertimeHours", '0:00'), ':', 1)::int * 60) + split_part(COALESCE(tl."undertimeHours", '0:00'), ':', 2)::int), 0)::int AS undertime_minutes,
		COALESCE(SUM((split_part(COALESCE(tl."lateHours", '0:00'), ':', 1)::int * 60) + split_part(COALESCE(tl."lateHours", '0:00'), ':', 2)::int), 0)::int AS late_minutes,
		COALESCE(SUM((split_part(COALESCE(tl."earlyOutHours", '0:00'), ':', 1)::int * 60) + split_part(COALESCE(tl."earlyOutHours", '0:00'), ':', 2)::int), 0)::int AS early_out_minutes
	FROM timesheet_lines tl
	WHERE tl."timesheetId" IN (SELECT DISTINCT "timesheetId" FROM rows_with_timesheets)
		AND tl."organizationId" = $1
		AND tl."isDeleted" = false
		AND tl."isEffective" = true
	GROUP BY tl."timesheetId"
),
timesheet_update AS (
	UPDATE timesheets t
	SET
		"totalDays" = lt.line_count,
		"totalHoursWorked" = floor(lt.worked_minutes / 60)::text || ':' || lpad((lt.worked_minutes % 60)::text, 2, '0'),
		"totalRegularHours" = floor(lt.regular_minutes / 60)::text || ':' || lpad((lt.regular_minutes % 60)::text, 2, '0'),
		"totalOvertimeHours" = floor(lt.overtime_minutes / 60)::text || ':' || lpad((lt.overtime_minutes % 60)::text, 2, '0'),
		"totalUndertimeHours" = floor(lt.undertime_minutes / 60)::text || ':' || lpad((lt.undertime_minutes % 60)::text, 2, '0'),
		"totalLateHours" = floor(lt.late_minutes / 60)::text || ':' || lpad((lt.late_minutes % 60)::text, 2, '0'),
		"totalEarlyOutHours" = floor(lt.early_out_minutes / 60)::text || ':' || lpad((lt.early_out_minutes % 60)::text, 2, '0'),
		metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object(
			'source', $3::text,
			'totalMinutesWorked', lt.worked_minutes,
			'totalRegularMinutes', lt.regular_minutes,
			'totalOvertimeMinutes', lt.overtime_minutes,
			'totalUndertimeMinutes', lt.undertime_minutes,
			'totalLateMinutes', lt.late_minutes,
			'totalEarlyOutMinutes', lt.early_out_minutes,
			'approvedFromDm4Proof', EXISTS (
				SELECT 1 FROM historical_approval_timesheets hat
				WHERE hat."timesheetId" = t.id
			)
		),
		status = CASE
			WHEN EXISTS (
				SELECT 1 FROM historical_approval_timesheets hat
				WHERE hat."timesheetId" = t.id
			) THEN 'APPROVED'::"TimesheetStatus"
			ELSE t.status
		END,
		"submittedAt" = CASE
			WHEN EXISTS (
				SELECT 1 FROM historical_approval_timesheets hat
				WHERE hat."timesheetId" = t.id
			) THEN COALESCE(t."submittedAt", now())
			ELSE t."submittedAt"
		END,
		"approvalDate" = CASE
			WHEN EXISTS (
				SELECT 1 FROM historical_approval_timesheets hat
				WHERE hat."timesheetId" = t.id
			) THEN COALESCE(t."approvalDate", now())
			ELSE t."approvalDate"
		END,
		"rejectionReason" = CASE
			WHEN EXISTS (
				SELECT 1 FROM historical_approval_timesheets hat
				WHERE hat."timesheetId" = t.id
			) THEN NULL
			ELSE t."rejectionReason"
		END,
		notes = CASE
			WHEN EXISTS (
				SELECT 1 FROM historical_approval_timesheets hat
				WHERE hat."timesheetId" = t.id
			) THEN $3::text || ': approved historical imported timesheet snapshot for DM4 proof.'
			ELSE t.notes
		END,
		"updatedAt" = now()
	FROM line_totals lt
	WHERE t.id = lt."timesheetId"
	RETURNING t.id
),
applied_sample AS (
	SELECT jsonb_agg(jsonb_build_object(
		'rawBadge', r."rawBadge",
		'normalizedBadge', r."normalizedBadge",
		'matchField', r."matchField",
		'employeeId', r."employeeCode",
		'deviceEmpId', r."dbDeviceEmpId",
		'date', r.date::text,
		'attendanceId', lu."attendanceId",
		'timesheetId', r."timesheetId",
		'timesheetlineId', lu.id,
		'payrollPeriodCode', r."payrollPeriodCode",
		'sourceRequestId', r."sourceRequestId"
	) ORDER BY r.date, r."employeeCode") AS rows
	FROM (
		SELECT *
		FROM rows_with_timesheets
		ORDER BY date, "employeeCode"
		LIMIT 20
	) r
	JOIN line_upsert lu
		ON lu."organizationId" = r."organizationId"
		AND lu."employeeId" = r."employeeDbId"
		AND lu."payrollPeriodId" = r."payrollPeriodId"
		AND lu.date = r.date
)
SELECT
	(SELECT COUNT(*)::int FROM input_rows) AS "inputRows",
	(SELECT COUNT(*)::int FROM timesheet_insert) AS "timesheetsCreated",
	(SELECT COUNT(DISTINCT "timesheetId")::int FROM rows_with_timesheets) AS "timesheetsTouched",
	(SELECT COUNT(*)::int FROM attendance_insert WHERE inserted) AS "attendanceCreated",
	((SELECT COUNT(*)::int FROM attendance_update) + (SELECT COUNT(*)::int FROM attendance_insert WHERE NOT inserted)) AS "attendanceUpdated",
	(SELECT COUNT(*)::int FROM line_upsert WHERE inserted) AS "timesheetlineCreated",
	(SELECT COUNT(*)::int FROM line_upsert WHERE NOT inserted) AS "timesheetlineUpdated",
	(SELECT COUNT(*)::int FROM obligation_upsert WHERE inserted) AS "attendanceObligationCreated",
	(SELECT COUNT(*)::int FROM obligation_upsert WHERE NOT inserted) AS "attendanceObligationUpdated",
	(SELECT COUNT(*)::int FROM paid_obligations) AS "attendanceObligationSkippedPaid",
	(SELECT COUNT(DISTINCT "timesheetId")::int FROM historical_approval_timesheets) AS "timesheetsApproved",
	COALESCE((SELECT rows FROM applied_sample), '[]'::jsonb) AS "applied";
		`,
		organizationId,
		JSON.stringify(payload),
		SOURCE_TAG,
		approveHistoricalTimesheets,
	);
	const result = resultRows?.[0] || {};
	return {
		applied: Array.isArray(result.applied) ? result.applied : [],
		touchedTimesheetCount: Number(result.timesheetsTouched || 0),
		writeCounts: {
			attendanceCreated: Number(result.attendanceCreated || 0),
			attendanceUpdated: Number(result.attendanceUpdated || 0),
			timesheetlineCreated: Number(result.timesheetlineCreated || 0),
			timesheetlineUpdated: Number(result.timesheetlineUpdated || 0),
			attendanceObligationCreated: Number(result.attendanceObligationCreated || 0),
			attendanceObligationUpdated: Number(result.attendanceObligationUpdated || 0),
			attendanceObligationSkippedPaid: Number(result.attendanceObligationSkippedPaid || 0),
			rowsSkippedNoEmployeeSchedule: 0,
			timesheetsCreated: Number(result.timesheetsCreated || 0),
			timesheetsApproved: Number(result.timesheetsApproved || 0),
		},
	};
};

const applySelectedRows = async (organizationId, selectedRows, options = {}) => {
	const approveHistoricalTimesheets = Boolean(options.approveHistoricalTimesheets);
	const batchSize = getBatchSize();
	const { shiftType, scheduleTemplate } = await ensureDefaultSchedule(organizationId);
	const selectedEmployeeDbIds = Array.from(
		new Set(selectedRows.map((row) => row.dbEmployeeDbId).filter(Boolean)),
	);
	const beforeEmployees = await prisma.employee.findMany({
		where: { id: { in: selectedEmployeeDbIds } },
		select: { id: true, employeeId: true, embeddedSchedule: true },
	});
	const embeddedBefore = new Map(beforeEmployees.map((employee) => [employee.id, employee.embeddedSchedule]));
	const rowsSkippedNoEmployeeSchedule = [];
	let rowsSkippedNoEmployeeScheduleCount = 0;
	const preparedRows = selectedRows.flatMap((row) => {
		const employeeSchedule = resolveDm4ScheduleSnapshotForRow(row, {
			shiftTypeId: shiftType.id,
			scheduleTemplateId: scheduleTemplate.id,
		});
		if (!employeeSchedule) return [];
		const resolvedSchedule = employeeSchedule;
		const timeIn = row.timeIn || resolvedSchedule.startTime || "08:00";
		const timeOut = row.timeOut || resolvedSchedule.endTime || "17:00";
		const sourceBreakMinutes =
			typeof row.breakMinutes === "number" && Number.isFinite(row.breakMinutes)
				? row.breakMinutes
				: null;
		const scheduleBreakMinutes =
			typeof resolvedSchedule.breakMinutes === "number" && Number.isFinite(resolvedSchedule.breakMinutes)
				? resolvedSchedule.breakMinutes
				: deriveBreakMinutes(resolvedSchedule.timeSlots);
		const breakMinutes = sourceBreakMinutes ?? scheduleBreakMinutes ?? 0;
		const timeBreak =
			row.timeBreak ||
			(breakMinutes > 0 ? deriveBreakStartTime(resolvedSchedule.timeSlots) : null);
		const scheduleRegularMinutes = resolvedSchedule.regularMinutes ?? row.regularMinutes ?? 480;
		const workedMinutes =
			workedMinutesFromTimeText(timeIn, timeOut, breakMinutes) ?? scheduleRegularMinutes;
		const splitMinutes = splitWorkedMinutes(workedMinutes, scheduleRegularMinutes);
		const hoursWorked = minutesToHoursText(workedMinutes);
		const regularHours = minutesToHoursText(splitMinutes.regularMinutes);
		const overtimeHours = minutesToHoursText(splitMinutes.overtimeMinutes);
		const sourceRequestId = `${SOURCE_TAG}:${row.employeeId}:${row.date}:${row.sourceRow}`;
		const scheduleSnapshot = {
			...resolvedSchedule,
			source: "DM4_ATTENDANCE_HISTORY_EVIDENCE",
			shiftTypeId: resolvedSchedule.shiftTypeId || shiftType.id,
			scheduleTemplateId: resolvedSchedule.scheduleTemplateId || scheduleTemplate.id,
			sourceWorkbook: row.sourceWorkbook,
			sourceSheet: row.sourceSheet,
			sourceRow: row.sourceRow,
			sourceRows: row.sourceRows || [row.sourceRow],
			rawBadge: row.rawBadge || null,
			normalizedBadge: row.normalizedBadge || row.employeeId,
			matchField: row.matchField || null,
			sourceKind: row.sourceKind || "attendance_summary",
			fallbackScheduleApplied: Boolean(resolvedSchedule.fallbackScheduleApplied),
			fallbackReason: resolvedSchedule.fallbackReason || null,
		};
		return [{
			...row,
			timeIn,
			timeBreak,
			timeOut,
			breakMinutes,
			totalMinutesWorked: workedMinutes,
			regularMinutes: splitMinutes.regularMinutes,
			overtimeMinutes: splitMinutes.overtimeMinutes,
			hoursWorked,
			regularHours,
			overtimeHours,
			sourceRequestId,
			scheduleSnapshot,
			dateObject: dateOnly(row.date),
		}];
	});

	const uniqueDates = Array.from(new Set(preparedRows.map((row) => row.date))).sort();
	const payrollPeriods = await prisma.payrollPeriod.findMany({
		where: { organizationId, isDeleted: false },
		orderBy: { startDate: "asc" },
		select: PAYROLL_PERIOD_SELECT,
	});
	const payrollPeriodByDate = new Map();
	for (const date of uniqueDates) {
		const target = dateOnly(date);
		let payrollPeriod = payrollPeriods.find(
			(period) => period.startDate <= target && period.endDate >= target,
		);
		if (!payrollPeriod) {
			const created = await ensurePayrollPeriod(organizationId, date);
			payrollPeriod = created.payrollPeriod;
			payrollPeriods.push(payrollPeriod);
		}
		payrollPeriodByDate.set(date, payrollPeriod);
	}

	for (const row of preparedRows) {
		const payrollPeriod = payrollPeriodByDate.get(row.date);
		row.payrollPeriod = payrollPeriod;
	}
	const presentMaterializations = [];
	const writeCountTotals = {
		attendanceCreated: 0,
		attendanceUpdated: 0,
		timesheetlineCreated: 0,
		timesheetlineUpdated: 0,
		attendanceObligationCreated: 0,
		attendanceObligationUpdated: 0,
		attendanceObligationSkippedPaid: 0,
		timesheetsCreated: 0,
		timesheetsApproved: 0,
	};
	let touchedTimesheetCount = 0;
	const appliedSample = [];
	emitProgress({
		phase: "IMPORTING",
		eventType: "STEP_PROGRESS",
		message: `Applying ${preparedRows.length.toLocaleString()} scheduled PRESENT attendance row(s) in ${batchSize.toLocaleString()} row batch(es).`,
		counts: {
			processed: 0,
			total: preparedRows.length,
			selectedRows: selectedRows.length,
			rowsSkippedNoEmployeeSchedule: rowsSkippedNoEmployeeScheduleCount,
		},
	});
	for (let index = 0; index < preparedRows.length; index += batchSize) {
		const batch = preparedRows.slice(index, index + batchSize);
		const materialization = await bulkMaterializePresentRows(organizationId, batch, {
			approveHistoricalTimesheets,
		});
		presentMaterializations.push(materialization);
		touchedTimesheetCount += Number(materialization.touchedTimesheetCount || 0);
		for (const key of Object.keys(writeCountTotals)) {
			writeCountTotals[key] += Number(materialization.writeCounts?.[key] || 0);
		}
		if (appliedSample.length < REPORT_SAMPLE_LIMIT && Array.isArray(materialization.applied)) {
			appliedSample.push(...materialization.applied.slice(0, REPORT_SAMPLE_LIMIT - appliedSample.length));
		}
		emitProgress({
			phase: "IMPORTING",
			eventType: "STEP_PROGRESS",
			message: `Applied DM4 attendance batch ${Math.floor(index / batchSize) + 1} of ${Math.ceil(preparedRows.length / batchSize)}.`,
			counts: {
				processed: Math.min(index + batch.length, preparedRows.length),
				total: preparedRows.length,
				created: writeCountTotals.attendanceCreated,
				updated: writeCountTotals.attendanceUpdated,
				timesheetlineCreated: writeCountTotals.timesheetlineCreated,
				timesheetlineUpdated: writeCountTotals.timesheetlineUpdated,
				rowsSkippedNoEmployeeSchedule: rowsSkippedNoEmployeeScheduleCount,
			},
		});
	}
	const presentMaterialization = {
		applied: appliedSample,
		touchedTimesheetCount,
		writeCounts: writeCountTotals,
	};
	const writeCounts = {
		...presentMaterialization.writeCounts,
		rowsSkippedNoEmployeeSchedule: rowsSkippedNoEmployeeScheduleCount,
	};

	const afterEmployees = await prisma.employee.findMany({
		where: { id: { in: selectedEmployeeDbIds } },
		select: { id: true, employeeId: true, embeddedSchedule: true },
	});
	const embeddedMutation = afterEmployees
		.map((employee) => ({
			employeeId: employee.employeeId,
			changed:
				JSON.stringify(embeddedBefore.get(employee.id) || null) !==
				JSON.stringify(employee.embeddedSchedule || null),
		}))
		.filter((item) => item.changed);

	return {
		applied: presentMaterialization.applied,
		appliedTotal: selectedRows.length,
		appliedScheduledTotal: preparedRows.length,
		payrollPeriodCodes: Array.from(
			new Set(preparedRows.map((row) => row.payrollPeriod?.code).filter(Boolean)),
		).sort(),
		rowsSkippedNoEmployeeSchedule,
		touchedTimesheetCount: presentMaterialization.touchedTimesheetCount,
		embeddedMutation,
		writeCounts,
		queryShape:
			"DM4 PRESENT rows are written with one PostgreSQL JSONB CTE/upsert that creates headers, Attendance, effective Timesheetline rows, AttendanceObligation links, summary totals, and optional historical approval.",
	};
};

const materializeMissingTimesheetDays = async (organizationId, periodCodes = [], options = {}) => {
	const scopedPeriodCodes = Array.from(
		new Set((periodCodes || []).map((code) => String(code || "").trim()).filter(Boolean)),
	);
	const scopedTimesheetId = String(options.timesheetId || "").trim() || null;
	const dryRun = Boolean(options.dryRun);
	const params = [organizationId, scopedPeriodCodes.length ? scopedPeriodCodes : null, scopedTimesheetId];
	const baseCandidateSql = `
WITH target_periods AS (
	SELECT pp.id, pp.code, pp."startDate", pp."endDate"
	FROM payroll_periods pp
	WHERE pp."organizationId" = $1
		AND pp."isDeleted" = false
		AND ($2::text[] IS NULL OR pp.code = ANY($2::text[]))
),
target_timesheets AS (
	SELECT
		t.id,
		t."organizationId",
		t."employeeId",
		t."payrollPeriodId",
		t.status,
		tp.code AS "periodCode",
		tp."startDate",
		tp."endDate"
	FROM timesheets t
	JOIN target_periods tp ON tp.id = t."payrollPeriodId"
	WHERE t."organizationId" = $1
		AND t."isDeleted" = false
		AND t.status IN ('SUBMITTED', 'APPROVED', 'REVISED', 'REJECTED')
		AND ($3::text IS NULL OR t.id = $3::text)
),
period_days AS (
	SELECT
		tt.id AS "timesheetId",
		tt."organizationId",
		tt."employeeId",
		tt."payrollPeriodId",
		tt."periodCode",
		gs.day::date AS date
	FROM target_timesheets tt
	CROSS JOIN LATERAL generate_series(tt."startDate", tt."endDate", interval '1 day') AS gs(day)
),
candidate AS (
	SELECT
		pd."organizationId",
		pd."employeeId",
		pd."payrollPeriodId",
		pd."periodCode",
		pd.date,
		pd.date::text AS "businessDate",
		pd."timesheetId",
		a.id AS "attendanceId",
		ao.id AS "obligationId",
		COALESCE(a."timeIn", ao."timeIn") AS "timeIn",
		COALESCE(a."timeBreak", ao."timeBreak") AS "timeBreak",
		COALESCE(a."timeOut", ao."timeOut") AS "timeOut",
		CASE
			WHEN a.id IS NOT NULL THEN COALESCE(a.status::text, 'PRESENT')
			WHEN upper(COALESCE(ao.status, '')) IN ('HOLIDAY', 'REST_DAY', 'LEAVE', 'ABSENT', 'PRESENT', 'INCOMPLETE', 'NO_SCHEDULE') THEN upper(ao.status)
			WHEN ci.id IS NOT NULL THEN 'HOLIDAY'
			WHEN COALESCE((sched.item->'shiftSnapshot'->>'isOff')::boolean, false) THEN 'REST_DAY'
			WHEN sched.item IS NULL AND EXTRACT(ISODOW FROM pd.date)::int = 7 THEN 'REST_DAY'
			WHEN pd.date < CURRENT_DATE THEN 'ABSENT'
			ELSE 'SCHEDULED'
		END AS "lineStatus",
		CASE
			WHEN a.id IS NOT NULL THEN 'attendance'
			WHEN ao.id IS NOT NULL THEN 'obligation'
			WHEN ci.id IS NOT NULL THEN 'holiday'
			WHEN sched.item IS NOT NULL THEN 'schedule'
			ELSE 'date_series'
		END AS "sourceKind",
		COALESCE(a."behaviorFlags", ao."behaviorFlags", ARRAY[]::text[]) AS "behaviorFlags",
		COALESCE(a."scheduleSnapshot", ao."scheduleSnapshot", sched.item->'shiftSnapshot') AS "scheduleSnapshot",
		CASE
			WHEN a.id IS NOT NULL THEN COALESCE(a."hoursWorked", ao."hoursWorked", '0:00')
			WHEN upper(COALESCE(ao.status, '')) = 'PRESENT' THEN COALESCE(ao."hoursWorked", '0:00')
			ELSE '0:00'
		END AS "hoursWorked",
		CASE
			WHEN a.id IS NOT NULL THEN COALESCE(a."regularHours", ao."regularHours", '0:00')
			WHEN upper(COALESCE(ao.status, '')) = 'PRESENT' THEN COALESCE(ao."regularHours", '0:00')
			ELSE '0:00'
		END AS "regularHours",
		CASE
			WHEN a.id IS NOT NULL THEN COALESCE(a."overtimeHours", ao."overtimeHours", '0:00')
			WHEN upper(COALESCE(ao.status, '')) = 'PRESENT' THEN COALESCE(ao."overtimeHours", '0:00')
			ELSE '0:00'
		END AS "overtimeHours",
		COALESCE(a."undertimeHours", ao."undertimeHours", '0:00') AS "undertimeHours",
		COALESCE(a."lateHours", ao."lateHours", '0:00') AS "lateHours",
		COALESCE(a."earlyOutHours", ao."earlyOutHours", '0:00') AS "earlyOutHours",
		COALESCE(a."breakMinutes", ao."breakMinutes", 0) AS "breakMinutes",
		e."employeeId" AS "employeeCodeSnapshot",
		trim(concat_ws(' ', p."personalInfo"->>'firstName', p."personalInfo"->>'lastName')) AS "employeeNameSnapshot",
		e."departmentId" AS "departmentIdSnapshot",
		d.name AS "departmentNameSnapshot",
		e."reportToId" AS "reportToIdSnapshot",
		e."workforceSource" AS "workforceSourceSnapshot",
		e."agencyId" AS "agencyIdSnapshot",
		COALESCE(ao.metadata, '{}'::jsonb) AS "obligationMetadata"
	FROM period_days pd
	JOIN employees e ON e.id = pd."employeeId" AND e."isDeleted" = false
	LEFT JOIN "Person" p ON p.id = e."personId"
	LEFT JOIN departments d ON d.id = e."departmentId"
	LEFT JOIN LATERAL (
		SELECT pattern_item AS item
		FROM jsonb_array_elements(COALESCE(e."embeddedSchedule"->'pattern', '[]'::jsonb)) pattern_item
		WHERE (pattern_item->>'day')::int = EXTRACT(ISODOW FROM pd.date)::int
		LIMIT 1
	) sched ON true
	LEFT JOIN attendance_obligations ao
		ON ao."organizationId" = pd."organizationId"
		AND ao."employeeId" = pd."employeeId"
		AND ao."payrollPeriodId" = pd."payrollPeriodId"
		AND ao.date = pd.date
		AND ao."isDeleted" = false
	LEFT JOIN attendances a
		ON a."organizationId" = pd."organizationId"
		AND a."employeeId" = pd."employeeId"
		AND a.date = pd.date
		AND a."isDeleted" = false
		AND a."isEffective" = true
	LEFT JOIN calendar_items ci
		ON ci."organizationId" = pd."organizationId"
		AND ci.type = 'HOLIDAY'
		AND ci.status = 'ACTIVE'
		AND pd.date BETWEEN ci."startDate"::date AND ci."endDate"::date
	LEFT JOIN timesheet_lines effective_line
		ON effective_line."organizationId" = pd."organizationId"
		AND effective_line."timesheetId" = pd."timesheetId"
		AND effective_line.date = pd.date
		AND effective_line."isDeleted" = false
		AND effective_line."isEffective" = true
	WHERE effective_line.id IS NULL
),
final_candidate AS (
	SELECT DISTINCT ON ("organizationId", "timesheetId", date) *
	FROM candidate
	ORDER BY
		"organizationId",
		"timesheetId",
		date,
		CASE "sourceKind"
			WHEN 'attendance' THEN 1
			WHEN 'obligation' THEN 2
			WHEN 'holiday' THEN 3
			WHEN 'schedule' THEN 4
			ELSE 5
		END,
		"attendanceId" NULLS LAST,
		"obligationId" NULLS LAST
)`;
	if (dryRun) {
		const rows = await prisma.$queryRawUnsafe(
			`
${baseCandidateSql}
SELECT
	(SELECT COUNT(*)::int FROM target_periods) AS "periodCount",
	(SELECT COUNT(*)::int FROM target_timesheets) AS "timesheetsScanned",
	(SELECT COUNT(*)::int FROM final_candidate) AS "candidateCount",
	(SELECT COUNT(*)::int FROM final_candidate) AS "wouldMaterializeMissingLines",
	COALESCE(
		(SELECT jsonb_object_agg("lineStatus", status_count) FROM (
			SELECT "lineStatus", COUNT(*)::int AS status_count
			FROM final_candidate
			GROUP BY "lineStatus"
			ORDER BY "lineStatus"
		) status_counts),
		'{}'::jsonb
	) AS "statusCounts",
	COALESCE(
		(SELECT jsonb_agg(jsonb_build_object(
			'timesheetId', "timesheetId",
			'periodCode', "periodCode",
			'date', date,
			'status', "lineStatus",
			'hoursWorked', "hoursWorked",
			'regularHours', "regularHours",
			'overtimeHours', "overtimeHours",
			'sourceKind', "sourceKind",
			'scheduleCode', "scheduleSnapshot"->>'code'
		) ORDER BY date)
		FROM (SELECT * FROM final_candidate ORDER BY date LIMIT 20) sample),
		'[]'::jsonb
	) AS "sampleDates";
			`,
			...params,
		);
		const result = rows?.[0] || {};
		return {
			mode: "DRY_RUN",
			periodCodes: scopedPeriodCodes,
			timesheetId: scopedTimesheetId,
			periodCount: Number(result.periodCount || 0),
			timesheetsScanned: Number(result.timesheetsScanned || 0),
			candidateCount: Number(result.candidateCount || 0),
			wouldMaterializeMissingLines: Number(result.wouldMaterializeMissingLines || 0),
			statusCounts: result.statusCounts || {},
			sampleDates: result.sampleDates || [],
			source: "bnpi-demo-attendance-proof.cjs:set_based_date_series_materialization",
		};
	}
	const rows = await prisma.$queryRawUnsafe(
		`
${baseCandidateSql},
line_upsert AS (
	INSERT INTO timesheet_lines (
		id,
		"organizationId",
		"employeeId",
		"timesheetId",
		"payrollPeriodId",
		"attendanceId",
		date,
		"timeIn",
		"timeBreak",
		"timeOut",
		status,
		"behaviorFlags",
		"scheduleSnapshot",
		"hoursWorked",
		"regularHours",
		"overtimeHours",
		"undertimeHours",
		"lateHours",
		"earlyOutHours",
		"breakMinutes",
		metadata,
		"primaryMarker",
		"isManualEntry",
		"isVirtual",
		"revisionNo",
		"isEffective",
		"ledgerType",
		"employeeCodeSnapshot",
		"employeeNameSnapshot",
		"departmentIdSnapshot",
		"departmentNameSnapshot",
		"reportToIdSnapshot",
		"workforceSourceSnapshot",
		"agencyIdSnapshot",
		notes,
		"isDeleted",
		"createdAt",
		"updatedAt"
	)
	SELECT
		'dm4tl_' || substr(md5(c."organizationId" || ':' || c."timesheetId" || ':' || c.date::text), 1, 20),
		c."organizationId",
		c."employeeId",
		c."timesheetId",
		c."payrollPeriodId",
		c."attendanceId",
		c.date,
		c."timeIn",
		c."timeBreak",
		c."timeOut",
		c."lineStatus",
		c."behaviorFlags",
		c."scheduleSnapshot",
		c."hoursWorked",
		c."regularHours",
		c."overtimeHours",
		CASE WHEN c."lineStatus" IN ('ABSENT', 'REST_DAY', 'HOLIDAY', 'LEAVE', 'NO_SCHEDULE') THEN '0:00' ELSE c."undertimeHours" END,
		CASE WHEN c."lineStatus" IN ('ABSENT', 'REST_DAY', 'HOLIDAY', 'LEAVE', 'NO_SCHEDULE') THEN '0:00' ELSE c."lateHours" END,
		CASE WHEN c."lineStatus" IN ('ABSENT', 'REST_DAY', 'HOLIDAY', 'LEAVE', 'NO_SCHEDULE') THEN '0:00' ELSE c."earlyOutHours" END,
		c."breakMinutes",
		c."obligationMetadata" || jsonb_build_object(
			'source', 'BNPI_DM4_MATERIALIZED_TIMESHEET_DAY',
			'snapshotType', 'TIMESHEET_DAY',
			'snapshottedAt', now(),
			'primaryMarker', c."lineStatus",
			'timesheetMaterialization', jsonb_build_object(
				'source', 'bnpi-demo-attendance-proof.cjs',
				'code', 'DM4_MISSING_LINE_MATERIALIZED',
				'materializedAt', now()
			)
		),
		c."lineStatus",
		false,
		(c."attendanceId" IS NULL),
		1,
		true,
		'SYSTEM_REBUILD',
		c."employeeCodeSnapshot",
		NULLIF(c."employeeNameSnapshot", ''),
		c."departmentIdSnapshot",
		c."departmentNameSnapshot",
		c."reportToIdSnapshot",
		c."workforceSourceSnapshot",
		c."agencyIdSnapshot",
		CASE
			WHEN c."lineStatus" = 'ABSENT' THEN 'BNPI DM4 materialization: scheduled workday with no attendance evidence.'
			WHEN c."lineStatus" = 'REST_DAY' THEN 'BNPI DM4 materialization: rest day snapshot.'
			WHEN c."lineStatus" = 'HOLIDAY' THEN 'BNPI DM4 materialization: holiday snapshot.'
			ELSE 'BNPI DM4 materialization: missing timesheet day snapshot.'
		END,
		false,
		now(),
		now()
	FROM final_candidate c
	ON CONFLICT ("organizationId", "timesheetId", date, "revisionNo")
	DO UPDATE SET
		"attendanceId" = EXCLUDED."attendanceId",
		"timeIn" = EXCLUDED."timeIn",
		"timeBreak" = EXCLUDED."timeBreak",
		"timeOut" = EXCLUDED."timeOut",
		status = EXCLUDED.status,
		"behaviorFlags" = EXCLUDED."behaviorFlags",
		"scheduleSnapshot" = EXCLUDED."scheduleSnapshot",
		"hoursWorked" = EXCLUDED."hoursWorked",
		"regularHours" = EXCLUDED."regularHours",
		"overtimeHours" = EXCLUDED."overtimeHours",
		"undertimeHours" = EXCLUDED."undertimeHours",
		"lateHours" = EXCLUDED."lateHours",
		"earlyOutHours" = EXCLUDED."earlyOutHours",
		"breakMinutes" = EXCLUDED."breakMinutes",
		metadata = EXCLUDED.metadata,
		"primaryMarker" = EXCLUDED."primaryMarker",
		"isManualEntry" = EXCLUDED."isManualEntry",
		"isVirtual" = EXCLUDED."isVirtual",
		"isEffective" = true,
		"ledgerType" = EXCLUDED."ledgerType",
		"employeeCodeSnapshot" = EXCLUDED."employeeCodeSnapshot",
		"employeeNameSnapshot" = EXCLUDED."employeeNameSnapshot",
		"departmentIdSnapshot" = EXCLUDED."departmentIdSnapshot",
		"departmentNameSnapshot" = EXCLUDED."departmentNameSnapshot",
		"reportToIdSnapshot" = EXCLUDED."reportToIdSnapshot",
		"workforceSourceSnapshot" = EXCLUDED."workforceSourceSnapshot",
		"agencyIdSnapshot" = EXCLUDED."agencyIdSnapshot",
		notes = EXCLUDED.notes,
		"isDeleted" = false,
		"updatedAt" = now()
	RETURNING
		id,
		"organizationId",
		"employeeId",
		"payrollPeriodId",
		"timesheetId",
		date,
		status,
		"hoursWorked",
		"regularHours",
		"overtimeHours",
		"undertimeHours",
		"lateHours",
		"earlyOutHours"
),
obligation_update AS (
	UPDATE attendance_obligations ao
	SET
		"timesheetId" = lu."timesheetId",
		"timesheetlineId" = lu.id,
		"updatedAt" = now(),
		metadata = COALESCE(ao.metadata, '{}'::jsonb) || jsonb_build_object(
			'timesheetlineId', lu.id,
			'dm4MaterializedAt', now()
		)
	FROM line_upsert lu
	WHERE ao."organizationId" = lu."organizationId"
		AND ao."employeeId" = lu."employeeId"
		AND ao."payrollPeriodId" = lu."payrollPeriodId"
		AND ao.date = lu.date
		AND ao."isDeleted" = false
	RETURNING ao.id
),
summary_line_source AS (
	SELECT
		tl."timesheetId",
		tl.date,
		tl."hoursWorked",
		tl."regularHours",
		tl."overtimeHours",
		tl."undertimeHours",
		tl."lateHours",
		tl."earlyOutHours"
	FROM timesheet_lines tl
	WHERE tl."timesheetId" IN (SELECT id FROM target_timesheets)
		AND tl."organizationId" = $1
		AND tl."isDeleted" = false
		AND tl."isEffective" = true
		AND NOT EXISTS (
			SELECT 1
			FROM line_upsert lu
			WHERE lu."timesheetId" = tl."timesheetId"
				AND lu.date = tl.date
		)
	UNION ALL
	SELECT
		lu."timesheetId",
		lu.date,
		lu."hoursWorked",
		lu."regularHours",
		lu."overtimeHours",
		lu."undertimeHours",
		lu."lateHours",
		lu."earlyOutHours"
	FROM line_upsert lu
),
line_totals AS (
	SELECT
		tl."timesheetId",
		COUNT(*)::int AS line_count,
		COALESCE(SUM((split_part(COALESCE(tl."hoursWorked", '0:00'), ':', 1)::int * 60) + split_part(COALESCE(tl."hoursWorked", '0:00'), ':', 2)::int), 0)::int AS worked_minutes,
		COALESCE(SUM((split_part(COALESCE(tl."regularHours", '0:00'), ':', 1)::int * 60) + split_part(COALESCE(tl."regularHours", '0:00'), ':', 2)::int), 0)::int AS regular_minutes,
		COALESCE(SUM((split_part(COALESCE(tl."overtimeHours", '0:00'), ':', 1)::int * 60) + split_part(COALESCE(tl."overtimeHours", '0:00'), ':', 2)::int), 0)::int AS overtime_minutes,
		COALESCE(SUM((split_part(COALESCE(tl."undertimeHours", '0:00'), ':', 1)::int * 60) + split_part(COALESCE(tl."undertimeHours", '0:00'), ':', 2)::int), 0)::int AS undertime_minutes,
		COALESCE(SUM((split_part(COALESCE(tl."lateHours", '0:00'), ':', 1)::int * 60) + split_part(COALESCE(tl."lateHours", '0:00'), ':', 2)::int), 0)::int AS late_minutes,
		COALESCE(SUM((split_part(COALESCE(tl."earlyOutHours", '0:00'), ':', 1)::int * 60) + split_part(COALESCE(tl."earlyOutHours", '0:00'), ':', 2)::int), 0)::int AS early_out_minutes
	FROM summary_line_source tl
	GROUP BY tl."timesheetId"
),
timesheet_update AS (
	UPDATE timesheets t
	SET
		"totalDays" = lt.line_count,
		"totalHoursWorked" = floor(lt.worked_minutes / 60)::text || ':' || lpad((lt.worked_minutes % 60)::text, 2, '0'),
		"totalRegularHours" = floor(lt.regular_minutes / 60)::text || ':' || lpad((lt.regular_minutes % 60)::text, 2, '0'),
		"totalOvertimeHours" = floor(lt.overtime_minutes / 60)::text || ':' || lpad((lt.overtime_minutes % 60)::text, 2, '0'),
		"totalUndertimeHours" = floor(lt.undertime_minutes / 60)::text || ':' || lpad((lt.undertime_minutes % 60)::text, 2, '0'),
		"totalLateHours" = floor(lt.late_minutes / 60)::text || ':' || lpad((lt.late_minutes % 60)::text, 2, '0'),
		"totalEarlyOutHours" = floor(lt.early_out_minutes / 60)::text || ':' || lpad((lt.early_out_minutes % 60)::text, 2, '0'),
		metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object(
			'totalMinutesWorked', lt.worked_minutes,
			'totalRegularMinutes', lt.regular_minutes,
			'totalOvertimeMinutes', lt.overtime_minutes,
			'totalUndertimeMinutes', lt.undertime_minutes,
			'totalLateMinutes', lt.late_minutes,
			'totalEarlyOutMinutes', lt.early_out_minutes,
			'dm4MaterializedAt', now()
		),
		"updatedAt" = now()
	FROM line_totals lt
	WHERE t.id = lt."timesheetId"
	RETURNING t.id
)
SELECT
	(SELECT COUNT(*)::int FROM target_periods) AS "periodCount",
	(SELECT COUNT(*)::int FROM target_timesheets) AS "timesheetsScanned",
	(SELECT COUNT(*)::int FROM final_candidate) AS "candidateCount",
	(SELECT COUNT(*)::int FROM line_upsert) AS "materializedMissingLines",
	(SELECT COUNT(*)::int FROM obligation_update) AS "obligationsLinked",
	(SELECT COUNT(*)::int FROM timesheet_update) AS "timesheetsRecalculated",
	COALESCE(
		(SELECT jsonb_object_agg(status, status_count) FROM (
			SELECT status, COUNT(*)::int AS status_count
			FROM line_upsert
			GROUP BY status
			ORDER BY status
		) status_counts),
		'{}'::jsonb
	) AS "statusCounts";
		`,
		...params,
	);
	const result = rows?.[0] || {};
	return {
		mode: "EXECUTE",
		periodCodes: scopedPeriodCodes,
		timesheetId: scopedTimesheetId,
		periodCount: Number(result.periodCount || 0),
		timesheetsScanned: Number(result.timesheetsScanned || 0),
		candidateCount: Number(result.candidateCount || 0),
		materializedMissingLines: Number(result.materializedMissingLines || 0),
		obligationsLinked: Number(result.obligationsLinked || 0),
		timesheetsRecalculated: Number(result.timesheetsRecalculated || 0),
		statusCounts: result.statusCounts || {},
		source: "bnpi-demo-attendance-proof.cjs:set_based_date_series_materialization",
	};
};

const materializeDm4AttendanceAndTimesheetRows = async (
	organizationId,
	selectedRows,
	options = {},
) => {
	const presentRows = await applySelectedRows(organizationId, selectedRows, options);
	emitProgress({
		phase: "MATERIALIZING",
		eventType: "MATERIALIZATION_STARTED",
		message: "Completing missing timesheet day snapshots from attendance obligations and schedules.",
		counts: {
			processed: presentRows.appliedScheduledTotal || presentRows.appliedTotal || 0,
			total: presentRows.appliedScheduledTotal || presentRows.appliedTotal || 0,
		},
	});
	const timesheetDays = await materializeMissingTimesheetDays(
		organizationId,
		presentRows?.payrollPeriodCodes || [],
	);
	emitProgress({
		phase: "MATERIALIZING",
		eventType: "MATERIALIZATION_COMPLETED",
		message: "Missing timesheet day snapshots were materialized.",
		counts: {
			materializedMissingLines: timesheetDays?.materializedMissingLines || 0,
			timesheetsRecalculated: timesheetDays?.timesheetsRecalculated || 0,
		},
	});
	return {
		mode: "DM4_SINGLE_MATERIALIZATION",
		queryShape:
			"PRESENT source rows are applied first, then the full period timesheet-day snapshot is completed by one set-based PostgreSQL CTE/upsert.",
		presentRows,
		timesheetDays,
		payrollPeriodCodes: presentRows?.payrollPeriodCodes || timesheetDays?.periodCodes || [],
		materializedMissingLines: timesheetDays?.materializedMissingLines || 0,
		obligationsLinked: timesheetDays?.obligationsLinked || 0,
		timesheetsRecalculated: timesheetDays?.timesheetsRecalculated || 0,
		statusCounts: timesheetDays?.statusCounts || {},
	};
};

const verifySelectedRows = async (organizationId, selectedRows) => {
	if (selectedRows.length > 500) {
		const attendanceRowsFound = await prisma.attendance.count({
			where: { organizationId, sourceRequestId: { startsWith: SOURCE_TAG }, isDeleted: false },
		});
		const timesheetlineRowsFound = await prisma.timesheetline.count({
			where: {
				organizationId,
				isDeleted: false,
				isEffective: true,
				metadata: { path: ["source"], equals: SOURCE_TAG },
			},
		});
		const attendances = await prisma.attendance.findMany({
			where: { organizationId, sourceRequestId: { startsWith: SOURCE_TAG }, isDeleted: false },
			select: {
				id: true,
				employeeId: true,
				date: true,
				timeIn: true,
				timeBreak: true,
				timeOut: true,
				status: true,
				sourceRequestId: true,
				breakMinutes: true,
				regularMinutes: true,
				scheduleSnapshot: true,
			},
			orderBy: [{ date: "asc" }],
			take: REPORT_SAMPLE_LIMIT,
		});
		const timesheetlines = await prisma.timesheetline.findMany({
			where: {
				organizationId,
				isDeleted: false,
				isEffective: true,
				metadata: { path: ["source"], equals: SOURCE_TAG },
			},
			select: {
				id: true,
				employeeId: true,
				date: true,
				timeIn: true,
				timeBreak: true,
				timeOut: true,
				status: true,
				regularHours: true,
				hoursWorked: true,
				breakMinutes: true,
				metadata: true,
				timesheet: {
					select: {
						id: true,
						code: true,
						status: true,
						totalDays: true,
						totalHoursWorked: true,
						totalRegularHours: true,
					},
				},
			},
			orderBy: [{ date: "asc" }],
			take: REPORT_SAMPLE_LIMIT,
		});
		return { attendances, timesheetlines, attendanceRowsFound, timesheetlineRowsFound };
	}
	const sourceIds = selectedRows.map(
		(row) => `${SOURCE_TAG}:${row.employeeId}:${row.date}:${row.sourceRow}`,
	);
	const attendances = await prisma.attendance.findMany({
		where: { organizationId, sourceRequestId: { in: sourceIds }, isDeleted: false },
		select: {
			id: true,
			employeeId: true,
			date: true,
			timeIn: true,
			timeBreak: true,
			timeOut: true,
			status: true,
			sourceRequestId: true,
			breakMinutes: true,
			regularMinutes: true,
			scheduleSnapshot: true,
		},
		orderBy: [{ date: "asc" }],
	});
	const timesheetlines = await prisma.timesheetline.findMany({
		where: {
			organizationId,
			isDeleted: false,
			isEffective: true,
			OR: sourceIds.map((sourceRequestId) => ({
				metadata: { path: ["sourceRequestId"], equals: sourceRequestId },
			})),
		},
		select: {
			id: true,
			employeeId: true,
			date: true,
			timeIn: true,
			timeBreak: true,
			timeOut: true,
			status: true,
			regularHours: true,
			hoursWorked: true,
			breakMinutes: true,
			metadata: true,
			timesheet: {
				select: {
					id: true,
					code: true,
					status: true,
					totalDays: true,
					totalHoursWorked: true,
					totalRegularHours: true,
				},
			},
		},
		orderBy: [{ date: "asc" }],
	});
	return {
		attendances,
		timesheetlines,
		attendanceRowsFound: attendances.length,
		timesheetlineRowsFound: timesheetlines.length,
	};
};

const main = async () => {
	const apply = hasFlag("--apply");
	const execute = hasFlag("--execute");
	const materializeTimesheetDaysOnly = hasFlag("--materializeTimesheetDays");
	const approveHistoricalTimesheets = hasFlag("--approveHistoricalTimesheets");
	const limit = getLimit();
	const orgCode = getArg("--orgCode", DEFAULT_ORG_CODE);
	const periodCode = getArg("--periodCode", "");
	const timesheetId = getArg("--timesheetId", "");

	await prisma.$connect();
	const organization = await prisma.organization.findUnique({ where: { code: orgCode } });
	if (!organization) throw new Error(`Organization code not found: ${orgCode}`);

	if (materializeTimesheetDaysOnly) {
		const materialization = await materializeMissingTimesheetDays(
			organization.id,
			periodCode ? [periodCode] : [],
			{
				timesheetId,
				dryRun: !execute,
			},
		);
		console.log(
			JSON.stringify(
				{
					mode: execute ? "MATERIALIZE_TIMESHEET_DAYS_EXECUTE" : "MATERIALIZE_TIMESHEET_DAYS_DRY_RUN",
					organization: { id: organization.id, code: organization.code, name: organization.name },
					periodCode: periodCode || null,
					timesheetId: timesheetId || null,
					materialization,
				},
				null,
				2,
			),
		);
		await prisma.$disconnect();
		return;
	}

	const selection = await selectMatchedRows({ organizationId: organization.id, limit });
	const selectionMeetsThreshold =
		selection.hasBiometricRows
			? selection.selectedRows.length > 0
			: selection.selectedRows.length >= 5 && selection.departmentsSelected.length >= 3;

	let application = null;
	let timesheetMaterialization = null;
	let dm4Materialization = null;
	const dryRunMaterializationPlan = !apply
		? planDm4SelectedRowMaterialization(selection.selectedRows)
		: null;
	if (apply) {
		dm4Materialization = await materializeDm4AttendanceAndTimesheetRows(organization.id, selection.selectedRows, {
			approveHistoricalTimesheets,
		});
		application = dm4Materialization.presentRows;
		timesheetMaterialization = dm4Materialization.timesheetDays;
	}
	const verification = await verifySelectedRows(organization.id, selection.selectedRows);
	const expectedCount = apply ? selection.selectedRows.length : 0;
	const proof = {
		mode: apply ? "APPLY_AND_VERIFY" : "DRY_RUN_SELECTION_ONLY",
		sourceTag: SOURCE_TAG,
		organization: { id: organization.id, code: organization.code, name: organization.name },
		defaultSchedule: {
			code: SCHEDULE_CODE,
			name: SCHEDULE_NAME,
			timeIn: "08:00",
			timeBreak: "12:00-13:00",
			timeOut: "17:00",
			breakMinutes: 60,
			regularHours: 8,
		},
		phase1Selection: {
			meetsThreshold: selectionMeetsThreshold,
			sourceRowsScanned: selection.sourceRowsScanned,
			sourceFilesScanned: selection.sourceFilesScanned,
			sourceFilesPreview: selection.sourceFilesPreview,
			dbEmployeesMatched: selection.dbEmployeesMatched,
			sourceDepartmentCounts: selection.sourceDepartmentCounts,
			matchedDepartmentCounts: selection.matchedDepartmentCounts,
			selectedRowsTotal: selection.selectedRowsTotal || selection.selectedRows.length,
			selectedRows: selection.selectedRows.slice(0, REPORT_SAMPLE_LIMIT).map((row) => ({
				sourceKind: row.sourceKind || "attendance_summary",
				sourceWorkbookPath: row.sourceWorkbookPath,
				sourceSheet: row.sourceSheet,
				sourceRow: row.sourceRow,
				sourceRows: row.sourceRows || [row.sourceRow],
				date: row.date,
				rawBadge: row.rawBadge || null,
				normalizedBadge: row.normalizedBadge || row.employeeId,
				sourceEmployeeId: row.employeeId,
				sourceEmployeeName: row.employeeName,
				dbEmployeeDbId: row.dbEmployeeDbId,
				dbEmployeeId: row.dbEmployeeId,
				dbDeviceEmpId: row.dbDeviceEmpId || null,
				matchField: row.matchField || null,
				dbEmployeeName: row.dbEmployeeName,
				sourceDepartment: row.department,
				dbDepartment: row.dbDepartment,
				dbSection: row.dbSection,
				presentMarker: row.presentMarker,
				timeIn: row.timeIn || "08:00",
				timeOut: row.timeOut || "17:00",
				punches: row.punches
					? row.punches.map((punch) => ({
							sourceRow: punch.sourceRow,
							rawBadge: punch.rawBadge,
							normalizedBadge: punch.normalizedBadge,
							timestamp: punch.timestamp.toISOString(),
							time: punch.time,
						}))
					: undefined,
				isWeekend: row.isWeekend,
			})),
			departmentsSelected: selection.departmentsSelected,
			weekendPresentCandidates: selection.weekendPresentCandidates,
			unmatchedEmployeeIdsPreview: selection.unmatchedEmployeeIds,
		},
		dryRunMaterializationPlan,
		phase2Materialization: dm4Materialization,
		phase2Application: application,
		phase3DbProof: {
			expectedRowsAfterApply: expectedCount,
			attendanceRowsFound: verification.attendanceRowsFound,
			timesheetlineRowsFound: verification.timesheetlineRowsFound,
			attendances: verification.attendances.map((row) => ({
				id: row.id,
				employeeDbId: row.employeeId,
				date: row.date?.toISOString().slice(0, 10),
				timeIn: row.timeIn?.toISOString(),
				timeBreak: row.timeBreak?.toISOString(),
				timeOut: row.timeOut?.toISOString(),
				status: row.status,
				sourceRequestId: row.sourceRequestId,
				breakMinutes: row.breakMinutes,
				regularMinutes: row.regularMinutes,
				scheduleCode: row.scheduleSnapshot?.scheduleCode,
				sourceKind: row.scheduleSnapshot?.sourceKind,
				rawBadge: row.scheduleSnapshot?.rawBadge,
				normalizedBadge: row.scheduleSnapshot?.normalizedBadge,
				matchField: row.scheduleSnapshot?.matchField,
			})),
			timesheetlines: verification.timesheetlines.map((row) => ({
				id: row.id,
				employeeDbId: row.employeeId,
				date: row.date?.toISOString().slice(0, 10),
				timeIn: row.timeIn?.toISOString(),
				timeBreak: row.timeBreak?.toISOString(),
				timeOut: row.timeOut?.toISOString(),
				status: row.status,
				regularHours: row.regularHours,
				hoursWorked: row.hoursWorked,
				breakMinutes: row.breakMinutes,
				sourceRequestId: row.metadata?.sourceRequestId,
				shiftCode: row.metadata?.shiftCode,
				timesheet: row.timesheet,
			})),
		},
		timesheetMaterialization,
		guardrails: {
			dm4EmbeddedScheduleMutationCount: application?.embeddedMutation?.length || 0,
			dm4EmbeddedScheduleMutations: application?.embeddedMutation || [],
			approveHistoricalTimesheets,
			weekendRule:
				"No weekend paid work row is created by this proof unless the selected source workbook row itself is marked PRESENT.",
			timesheetSourceOfTruth:
				"Selected demo rows write effective Timesheetline snapshots; submitted/approved/payroll-paid rows are not recomputed.",
			timesheetMaterialization:
				"DM4 import presents one materialization lifecycle. PRESENT source rows are applied, then missing ABSENT/REST/HOLIDAY day snapshots are completed by one set-based PostgreSQL CTE/upsert from period dates, employee schedules, holidays, AttendanceObligation, and Attendance evidence.",
		},
		nextUiProof: {
			attendanceRoute:
				"/hr/attendance with a May 2026 date filter and one selected employee/date from phase1Selection.selectedRows",
			timesheetRoute:
				"/hr/timesheets or the selected employee timesheet detail for the payroll period shown in phase2Application.applied[].payrollPeriodCode",
		},
	};

	console.log(JSON.stringify(proof, null, 2));
	if (!selectionMeetsThreshold) {
		throw new Error(
			`Selection did not meet proof threshold. selectedRows=${selection.selectedRows.length}, departments=${selection.departmentsSelected.length}`,
		);
	}
	await prisma.$disconnect();
};

module.exports = {
	normalizeBadgeId,
	parseBiometricTimestamp,
	findBiometricPunchRows,
	expandSourceFiles,
	findSourceRows,
	resolveEmployeeScheduleSnapshotForDate,
	resolveCurrentEmbeddedScheduleSnapshotForDate,
	resolveDm4ScheduleSnapshotForRow,
	planDm4SelectedRowMaterialization,
};

if (require.main === module) {
	main().catch(async (error) => {
		console.error(error);
		try {
			await prisma.$disconnect();
		} catch {
			// ignore disconnect errors during failure handling
		}
		process.exit(1);
	});
}
