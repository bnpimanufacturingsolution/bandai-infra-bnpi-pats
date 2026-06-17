const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const repoRoot = path.resolve(__dirname, "..", "..");
const importDir = path.join(repoRoot, "data", "import");

const breaktimeScheduleSource = path.join(repoRoot, "docs", "Breaktime Schedule.xlsx");
const leaveSource = path.join(
	repoRoot,
	"docs",
	"rptLeaveBalance as of June 4, 2026.xlsx",
);

const scheduleOutput = path.join(importDir, "employee-schedules-import.csv");
const leaveOutput = path.join(importDir, "opening-leave-balances-import.csv");
const employeeImportSource = path.join(importDir, "employees-import.csv");

const clean = (value) => String(value ?? "").trim();
const normalizeText = (value) =>
	clean(value)
		.normalize("NFKC")
		.replace(/\u3000/g, " ")
		.replace(/\s+/g, " ")
		.trim();

const csvCell = (value) => {
	const text = clean(value);
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const writeCsv = (filePath, rows) => {
	fs.writeFileSync(filePath, rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n");
};

const normalizeEmployeeId = (value) => {
	const text = clean(value);
	return /^\d+$/.test(text) ? text.padStart(5, "0") : text;
};

const normalizeNameKey = (value) => {
	const text = normalizeText(value)
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z, ]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	const [last = "", rest = ""] = text.split(",").map((part) => part.trim());
	const first = rest.split(" ").filter(Boolean)[0] || "";
	return last && first ? `${last}|${first}` : "";
};

const parseCsvLine = (line) => {
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

const loadEmployeeMaster = () => {
	if (!fs.existsSync(employeeImportSource)) return null;
	const lines = fs.readFileSync(employeeImportSource, "utf8").split(/\r?\n/).filter(Boolean);
	const headers = parseCsvLine(lines[0]);
	const rows = [];
	const ids = new Map();
	const agencySuffixes = new Map();
	const duplicateAgencySuffixes = new Set();
	for (const line of lines.slice(1)) {
		const values = parseCsvLine(line);
		const row = headers.reduce((entry, header, index) => {
			entry[header] = values[index] ?? "";
			return entry;
		}, {});
		const employeeId = normalizeEmployeeId(row.EMP_ID);
		if (!employeeId) continue;
		rows.push(row);
		ids.set(employeeId, row);
		if (row.WORKFORCE_SOURCE === "AGENCY" && clean(row.AGENCY_CODE)) {
			const suffix = clean(employeeId).match(/(\d{5,})$/)?.[1]?.slice(-5);
			if (suffix) {
				if (agencySuffixes.has(suffix)) duplicateAgencySuffixes.add(suffix);
				else agencySuffixes.set(suffix, row);
			}
		}
	}
	for (const suffix of duplicateAgencySuffixes) agencySuffixes.delete(suffix);
	return { rows, ids, agencySuffixes, duplicateAgencySuffixes };
};

const resolveScheduleEmployee = (employeeMaster, sourceEmployeeId, sourceEmployeeName) => {
	if (!employeeMaster) return { employeeId: sourceEmployeeId, matchType: "source-id" };
	const direct = employeeMaster.ids.get(sourceEmployeeId);
	if (direct) return { employeeId: sourceEmployeeId, matchType: "employee-id", employee: direct };
	const agencyCandidate = employeeMaster.agencySuffixes.get(sourceEmployeeId);
	if (!agencyCandidate) return null;
	if (normalizeNameKey(sourceEmployeeName) !== normalizeNameKey(agencyCandidate.NAME)) return null;
	return {
		employeeId: agencyCandidate.EMP_ID,
		matchType: "agency-id-suffix-name",
		employee: agencyCandidate,
	};
};

const normalizeTime = (value) => {
	const text = clean(value).replace(/\s+/g, "");
	const match = text.match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) return null;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const parseTimeRanges = (value) => {
	const text = clean(value)
		.replace(/[–—]/g, "-")
		.replace(/\bto\b/gi, "-")
		.replace(/\s+/g, " ");
	const ranges = [];
	for (const match of text.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:?\d{2})/g)) {
		const startTime = normalizeTime(match[1]);
		const endRaw = match[2].includes(":")
			? match[2]
			: `${match[2].slice(0, -2)}:${match[2].slice(-2)}`;
		const endTime = normalizeTime(endRaw);
		if (startTime && endTime) ranges.push({ startTime, endTime });
	}
	return ranges;
};

const scheduleCodeFor = (workWindow, breakWindow) => {
	const base = `BNPI_SCHED_MON_SAT_WS_${workWindow.startTime.replace(":", "")}_${workWindow.endTime.replace(":", "")}`;
	if (!breakWindow) return base;
	return `${base}_BR_${breakWindow.startTime.replace(":", "")}_${breakWindow.endTime.replace(":", "")}`;
};

const getScheduleEffectiveFrom = (employee) =>
	clean(employee?.HIRE_DATE) || clean(employee?.START_DATE);

const scheduleSources = [
	{
		label: "Breaktime Schedule",
		filePath: breaktimeScheduleSource,
		role: "primary-and-only-dm3-schedule-source",
	},
];

const readScheduleSourceRows = () => {
	const recordsByEmployeeId = new Map();
	const stats = {
		sourceWorkbooks: scheduleSources.map((source) => ({
			label: source.label,
			role: source.role,
			path: path.relative(repoRoot, source.filePath).replace(/\\/g, "/"),
		})),
		sourceRowsScanned: 0,
		sourceRowsSelected: 0,
		sourceRowsOverriddenByNewerSource: 0,
		duplicateRowsIgnoredWithinWorkbook: 0,
		rowsByWorkbook: {},
		rowsBySheet: {},
	};

	for (const source of scheduleSources) {
		const workbook = XLSX.readFile(source.filePath, { cellDates: false, raw: false });
		const sourceSeenEmployeeIds = new Set();
		for (const sheetName of workbook.SheetNames) {
			const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
				header: 1,
				defval: "",
				blankrows: false,
				raw: false,
			});
			for (let rowIndex = 1; rowIndex < sheetRows.length; rowIndex++) {
				const row = sheetRows[rowIndex] || [];
				const employeeId = normalizeEmployeeId(row[1]);
				const employeeName = clean(row[2]);
				const workSchedule = clean(row[6]);
				if (!/^\d{5}$/.test(employeeId) || !employeeName || !workSchedule) {
					continue;
				}
				stats.sourceRowsScanned += 1;
				if (sourceSeenEmployeeIds.has(employeeId)) {
					stats.duplicateRowsIgnoredWithinWorkbook += 1;
					continue;
				}
				sourceSeenEmployeeIds.add(employeeId);
				if (recordsByEmployeeId.has(employeeId)) {
					stats.sourceRowsOverriddenByNewerSource += 1;
				}
				recordsByEmployeeId.set(employeeId, {
					sourceLabel: source.label,
					sourceWorkbook: path.relative(repoRoot, source.filePath).replace(/\\/g, "/"),
					sheetName,
					rowIndex,
					row,
					employeeId,
					employeeName,
					workSchedule,
				});
				stats.rowsByWorkbook[source.label] = (stats.rowsByWorkbook[source.label] || 0) + 1;
				const sheetKey = `${source.label} / ${sheetName}`;
				stats.rowsBySheet[sheetKey] = (stats.rowsBySheet[sheetKey] || 0) + 1;
			}
		}
	}

	stats.sourceRowsSelected = recordsByEmployeeId.size;
	return { records: Array.from(recordsByEmployeeId.values()), stats };
};

const buildScheduleRows = () => {
	const scheduleSourceRows = readScheduleSourceRows();
	const employeeMaster = loadEmployeeMaster();
	const rows = [["EMP_ID", "SCHEDULE_CODE", "EFFECTIVE_FROM", "EFFECTIVE_TO", "NOTES"]];
	const seen = new Set();
	const stats = {
		...scheduleSourceRows.stats,
		employeeMaster: employeeMaster
			? path.relative(repoRoot, employeeImportSource).replace(/\\/g, "/")
			: null,
		sourceRows: 0,
		skippedRows: 0,
		skippedMissingEmployeeMaster: 0,
		missingEmployeeMasterIds: [],
		agencySuffixNameMatches: 0,
		duplicateAgencySuffixesIgnored: employeeMaster?.duplicateAgencySuffixes?.size || 0,
		missingHireDates: 0,
		uniqueScheduleCodes: new Set(),
	};

	for (const sourceRow of scheduleSourceRows.records) {
		const {
			sourceLabel,
			sourceWorkbook,
			sheetName,
			rowIndex,
			row,
			employeeId,
			employeeName,
			workSchedule,
		} = sourceRow;
		if (seen.has(employeeId)) {
			continue;
		}
			const resolvedEmployee = resolveScheduleEmployee(employeeMaster, employeeId, employeeName);
			if (!resolvedEmployee) {
				stats.skippedMissingEmployeeMaster += 1;
				stats.missingEmployeeMasterIds.push(employeeId);
				continue;
			}
			if (seen.has(resolvedEmployee.employeeId)) continue;
			if (resolvedEmployee.matchType === "agency-id-suffix-name") {
				stats.agencySuffixNameMatches += 1;
			}
			const workWindow = parseTimeRanges(workSchedule)[0];
			if (!workWindow) {
				stats.skippedRows += 1;
				continue;
			}
			seen.add(resolvedEmployee.employeeId);
			const lunchBreak = clean(row[7]);
			const breakWindow = parseTimeRanges(lunchBreak)[0] || null;
			const scheduleCode = scheduleCodeFor(workWindow, breakWindow);
			const effectiveFrom = getScheduleEffectiveFrom(resolvedEmployee.employee);
			if (!effectiveFrom) stats.missingHireDates += 1;
			stats.sourceRows += 1;
			stats.uniqueScheduleCodes.add(scheduleCode);
			rows.push([
				resolvedEmployee.employeeId,
				scheduleCode,
				effectiveFrom,
				"",
				[
					`${sourceLabel} source ${sheetName} row ${rowIndex + 1}`,
					`source workbook ${sourceWorkbook}`,
					`source employee ${employeeId} ${employeeName}`,
					resolvedEmployee.matchType === "agency-id-suffix-name"
						? `matched agency employee ${resolvedEmployee.employeeId} by source id suffix and name`
						: "",
					`work schedule ${workSchedule}`,
					lunchBreak ? `lunch ${lunchBreak}` : "",
					clean(row[8]) ? `break ${clean(row[8])}` : "",
					clean(row[9]) ? `AM ${clean(row[9])}` : "",
					clean(row[10]) ? `PM ${clean(row[10])}` : "",
				]
					.filter(Boolean)
					.join("; "),
			]);
	}

	return { rows, stats: { ...stats, uniqueScheduleCodes: stats.uniqueScheduleCodes.size } };
};

const juneLeaveBalanceColumns = [
	{ columnIndex: 10, leaveCode: "VL" },
	{ columnIndex: 11, leaveCode: "SL" },
	{ columnIndex: 12, leaveCode: "ACL" },
];

const parseNumber = (value) => {
	const parsed = Number(clean(value).replace(/,/g, ""));
	return Number.isFinite(parsed) ? parsed : 0;
};

const cellValue = (worksheet, row, column) => {
	const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
	return cell?.w ?? cell?.v ?? "";
};

const buildLeaveRows = () => {
	const workbook = XLSX.readFile(leaveSource, { cellDates: false, raw: false, sheets: ["rptLeaveBalance"] });
	const sheetName = workbook.SheetNames.includes("rptLeaveBalance")
		? "rptLeaveBalance"
		: workbook.SheetNames[0];
	const worksheet = workbook.Sheets[sheetName];
	const rows = [["EMP_ID", "LEAVE_TYPE_CODE", "BALANCE", "AS_OF_DATE", "NOTES"]];
	const employeeMaster = loadEmployeeMaster();
	const stats = {
		sourceWorkbook: path.relative(repoRoot, leaveSource).replace(/\\/g, "/"),
		sourceSheet: sheetName,
		sourceRowsScanned: 0,
		matchedEmployees: 0,
		skippedMissingEmployeeMaster: 0,
		missingEmployeeMasterIds: [],
		zeroBalanceEmployees: 0,
		balanceRows: 0,
		leaveTypeTotals: {},
	};

	let blankStreak = 0;
	for (let rowIndex = 6; rowIndex < 5000; rowIndex++) {
		const employeeId = normalizeEmployeeId(cellValue(worksheet, rowIndex, 1));
		const employeeName = clean(cellValue(worksheet, rowIndex, 3));
		if (!employeeId && !employeeName) {
			blankStreak += 1;
			if (blankStreak > 100) break;
			continue;
		}
		blankStreak = 0;
		if (!/^\d{5}$/.test(employeeId)) continue;
		stats.sourceRowsScanned += 1;
		if (employeeMaster && !employeeMaster.ids.has(employeeId)) {
			stats.skippedMissingEmployeeMaster += 1;
			stats.missingEmployeeMasterIds.push(employeeId);
			continue;
		}
		stats.matchedEmployees += 1;
		let hasPositiveBalance = false;
		for (const { columnIndex, leaveCode } of juneLeaveBalanceColumns) {
			const balance = parseNumber(cellValue(worksheet, rowIndex, columnIndex));
			if (balance <= 0) continue;
			hasPositiveBalance = true;
			stats.balanceRows += 1;
			stats.leaveTypeTotals[leaveCode] = Number(
				((stats.leaveTypeTotals[leaveCode] || 0) + balance).toFixed(2),
			);
			rows.push([
				employeeId,
				leaveCode,
				String(balance),
				"2026-06-04",
				`BNPI rptLeaveBalance as of June 4, 2026 source row ${rowIndex + 1}; source column Remaining Balance ${leaveCode}; employee ${employeeName}`,
			]);
		}
		if (!hasPositiveBalance) stats.zeroBalanceEmployees += 1;
	}

	stats.missingEmployeeMasterIds = Array.from(new Set(stats.missingEmployeeMasterIds));
	return { rows, stats };
};

const main = () => {
	for (const source of scheduleSources) {
		if (!fs.existsSync(source.filePath)) throw new Error(`Missing source: ${source.filePath}`);
	}
	if (!fs.existsSync(leaveSource)) throw new Error(`Missing source: ${leaveSource}`);
	const schedules = buildScheduleRows();
	const leaves = buildLeaveRows();
	writeCsv(scheduleOutput, schedules.rows);
	writeCsv(leaveOutput, leaves.rows);
	console.log(
		JSON.stringify(
			{
				scheduleOutput: path.relative(repoRoot, scheduleOutput).replace(/\\/g, "/"),
				leaveOutput: path.relative(repoRoot, leaveOutput).replace(/\\/g, "/"),
				schedules: schedules.stats,
				leaveBalances: leaves.stats,
			},
			null,
			2,
		),
	);
};

main();
