import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma";
import {
	appendEmployeeScheduleHistory,
	copyTemplateToEmployeeEmbeddedSchedule,
	copyShiftTypeToTemplatePatternDay,
} from "../helper/employee-schedule.helper";
import { calculateShiftHour } from "../helper/schedule-normalization.helper";

const prisma = new PrismaClient();

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const writeCsv = args.has("--write-csv");
const sourcePathArg = process.argv.find((arg) => arg.startsWith("--source="))?.split("=")[1];
const sheetNameArg = process.argv.find((arg) => arg.startsWith("--sheet="))?.split("=")[1];
const organizationIdArg = process.argv.find((arg) => arg.startsWith("--org="))?.split("=")[1];
const organizationCodeArg =
	process.argv.find((arg) => arg.startsWith("--orgCode="))?.split("=")[1] || "bnei";

type SourceAssignment = {
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
	patternValues: string[];
	sourceSheet: string;
	sourceRow: number;
};

type DateColumn = {
	index: number;
	date: Date;
	label: string;
};

const clean = (value: unknown) => String(value ?? "").trim();

const normalizeEmployeeId = (value: unknown) => {
	const text = clean(value);
	if (/^\d+$/.test(text)) return text.padStart(5, "0");
	return text;
};

const normalizeDateOnly = (date: Date) => {
	const next = new Date(date);
	next.setUTCHours(0, 0, 0, 0);
	return next;
};

const anchorToMondayUtc = (date: Date) => {
	const anchored = normalizeDateOnly(date);
	const day = anchored.getUTCDay();
	const diffToMonday = day === 0 ? -6 : 1 - day;
	anchored.setUTCDate(anchored.getUTCDate() + diffToMonday);
	return anchored;
};

const toDateKey = (date: Date | string | null | undefined) => {
	if (!date) return "";
	const value = date instanceof Date ? date : new Date(date);
	if (Number.isNaN(value.getTime())) return "";
	return normalizeDateOnly(value).toISOString().slice(0, 10);
};

const unwrapEmbeddedSchedule = (value: any) => {
	if (value?.set && typeof value.set === "object" && !Array.isArray(value.set)) {
		return value.set;
	}
	return value;
};

const parseSourceDate = (value: unknown): Date | null => {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return normalizeDateOnly(value);
	}
	const text = clean(value);
	if (!text || /^total/i.test(text)) return null;
	const parsed = new Date(`${text} UTC`);
	if (!Number.isNaN(parsed.getTime())) return normalizeDateOnly(parsed);
	return null;
};

const parseShiftWindow = (value: string) => {
	const match = clean(value).match(/^(\d{1,2}):(\d{2})\s+to\s+(\d{1,2}):(\d{2})$/i);
	if (!match) return null;
	const startHour = Number(match[1]);
	const startMinute = Number(match[2]);
	const endHour = Number(match[3]);
	const endMinute = Number(match[4]);
	if (
		startHour > 23 ||
		endHour > 23 ||
		startMinute > 59 ||
		endMinute > 59
	) {
		return null;
	}
	const startTime = `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}`;
	const endTime = `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
	return { startTime, endTime };
};

const toShiftCode = (shiftLabel: string) => {
	const window = parseShiftWindow(shiftLabel);
	if (!window) {
		return clean(shiftLabel)
			.toUpperCase()
			.replace(/[^A-Z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "")
			.slice(0, 40);
	}
	return `WS_${window.startTime.replace(":", "")}_${window.endTime.replace(":", "")}`;
};

const isWorkValue = (value: unknown) => clean(value).toUpperCase() === "1";

const buildOffDaySnapshot = () => ({
	name: "Off day",
	code: "OFF",
	isOvernight: false,
	isOff: true,
	shiftHour: 0,
	timeSlots: [],
});

const toMonSatScheduleCode = (shiftCode: string) => `BNPI_WS_MON_SAT_${shiftCode}`;

const toMinutes = (value: unknown) => {
	const text = clean(value);
	const match = text.match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) return null;
	return hours * 60 + minutes;
};

const normalizeSlots = (slots: any[] | undefined | null) =>
	(Array.isArray(slots) ? slots : [])
		.map((slot) => ({
			type: clean(slot?.type).toLowerCase() || "work",
			startTime: clean(slot?.startTime),
			endTime: clean(slot?.endTime),
		}))
		.filter((slot) => slot.startTime && slot.endTime);

const getWorkWindow = (value: any) => {
	const workSlots = normalizeSlots(value?.timeSlots).filter((slot) => slot.type === "work");
	if (!workSlots.length) return null;
	const starts = workSlots.map((slot) => toMinutes(slot.startTime)).filter((item) => item !== null);
	const ends = workSlots.map((slot) => toMinutes(slot.endTime)).filter((item) => item !== null);
	if (!starts.length || !ends.length) return null;
	return {
		start: Math.min(...(starts as number[])),
		end: Math.max(...(ends as number[])),
	};
};

const sameShiftWindow = (left: any, right: any) => {
	const leftWindow = getWorkWindow(left);
	const rightWindow = getWorkWindow(right);
	return Boolean(
		leftWindow &&
			rightWindow &&
			leftWindow.start === rightWindow.start &&
			leftWindow.end === rightWindow.end,
	);
};

const isEquivalentMonSatTemplate = (template: any, shiftType: any) => {
	const pattern = Array.isArray(template?.pattern) ? template.pattern : [];
	if (Number(template?.cycleDays || 0) !== 7 || pattern.length !== 7) return false;
	for (let day = 1; day <= 7; day++) {
		const patternDay = pattern.find((item: any) => Number(item?.day) === day);
		const shiftSnapshot = patternDay?.shiftSnapshot || null;
		if (day <= 6) {
			if (!shiftSnapshot || Boolean(shiftSnapshot.isOff)) return false;
			if (!sameShiftWindow(shiftSnapshot, shiftType)) return false;
		} else if (!shiftSnapshot || !Boolean(shiftSnapshot.isOff)) {
			return false;
		}
	}
	return true;
};

const csvCell = (value: unknown) => {
	const text = clean(value);
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const resolveOrganizationId = async () => {
	if (organizationIdArg) return organizationIdArg;
	const organization = await prisma.organization.findUnique({
		where: { code: organizationCodeArg },
		select: { id: true, code: true, name: true },
	});
	if (!organization) {
		throw new Error(`Organization code ${organizationCodeArg} was not found.`);
	}
	return organization.id;
};

const readSourceAssignments = () => {
	const repoRoot = path.resolve(__dirname, "..", "..");
	const sourcePath = path.resolve(
		repoRoot,
		sourcePathArg || "docs/May - WorkSharingSchedule (17).xlsx",
	);
	if (!fs.existsSync(sourcePath)) {
		throw new Error(`Missing WorkSharingSchedule source workbook at ${sourcePath}`);
	}

	const workbook = XLSX.readFile(sourcePath, { cellDates: false, raw: false });
	const sheetName =
		sheetNameArg ||
		workbook.SheetNames.find((name) => /^WorkSharingSchedule/i.test(name)) ||
		workbook.SheetNames[0];
	if (!sheetName || !workbook.Sheets[sheetName]) {
		throw new Error(`Sheet ${sheetNameArg || "(first WorkSharingSchedule sheet)"} was not found.`);
	}

	const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], {
		header: 1,
		defval: "",
		blankrows: false,
		raw: false,
	});
	const headers = rows[0] || [];
	const dateColumns: DateColumn[] = headers
		.map((header, index) => ({ index, date: parseSourceDate(header), label: clean(header) }))
		.filter((item): item is DateColumn & { date: Date } => Boolean(item.date));
	if (!dateColumns.length) {
		throw new Error(`No date columns were found in ${sheetName}.`);
	}

	const effectiveFrom = dateColumns.reduce((earliest, column) =>
		column.date < earliest ? column.date : earliest,
		dateColumns[0].date,
	);
	const effectiveTo = dateColumns.reduce((latest, column) =>
		column.date > latest ? column.date : latest,
		dateColumns[0].date,
	);

	const assignments: SourceAssignment[] = [];
	const seenEmployees = new Set<string>();
	for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
		const row = rows[rowIndex] || [];
		const sourceEmployeeId = clean(row[0]);
		const employeeExternalId = normalizeEmployeeId(sourceEmployeeId);
		const shiftLabel = clean(row[5]);
		if (!sourceEmployeeId || sourceEmployeeId.toLowerCase() === "total" || !shiftLabel) {
			continue;
		}
		if (seenEmployees.has(employeeExternalId)) continue;
		seenEmployees.add(employeeExternalId);

		const patternValues = dateColumns.map((column) =>
			isWorkValue(row[column.index]) ? "1" : "0",
		);
		const shiftCode = toShiftCode(shiftLabel);
		assignments.push({
			employeeExternalId,
			sourceEmployeeId,
			employeeName: clean(row[1]),
			department: clean(row[2]),
			division: clean(row[3]),
			position: clean(row[4]),
			shiftLabel,
			shiftCode,
			scheduleCode: toMonSatScheduleCode(shiftCode),
			effectiveFrom,
			effectiveTo,
			patternValues,
			sourceSheet: sheetName,
			sourceRow: rowIndex + 1,
		});
	}

	return { sourcePath, sheetName, dateColumns, assignments };
};

const buildShiftPayload = (organizationId: string, assignment: SourceAssignment) => {
	const window = parseShiftWindow(assignment.shiftLabel);
	if (!window) {
		throw new Error(`Unsupported shift label "${assignment.shiftLabel}"`);
	}
	const payload = {
		organizationId,
		name: assignment.shiftLabel,
		code: assignment.shiftCode,
		isOvernight: window.endTime <= window.startTime,
		isOff: false,
		isActive: true,
		timeSlots: [
			{
				type: "work",
				label: "Work",
				startTime: window.startTime,
				endTime: window.endTime,
			},
		],
	};
	return {
		...payload,
		shiftHour: calculateShiftHour(payload),
	};
};

const main = async () => {
	const organizationId = await resolveOrganizationId();
	const { sourcePath, sheetName, dateColumns, assignments } = readSourceAssignments();
	const employeeIds = assignments.map((assignment) => assignment.employeeExternalId);
	const employees = await prisma.employee.findMany({
		where: { organizationId, isDeleted: false, employeeId: { in: employeeIds } },
		select: { id: true, employeeId: true, embeddedSchedule: true },
	});
	const employeesByExternalId = new Map(
		employees.map((employee) => [employee.employeeId, employee]),
	);
	const existingTemplateCodes = Array.from(
		new Set(assignments.map((assignment) => assignment.scheduleCode)),
	);
	const allExistingTemplates = await (prisma as any).scheduleTemplate.findMany({
		where: { organizationId, isDeleted: false },
		select: {
			id: true,
			code: true,
			name: true,
			cycleDays: true,
			graceLateMinutes: true,
			graceEarlyOutMinutes: true,
			pattern: true,
			totalDay: true,
			totalHour: true,
		},
	});
	const existingTemplates = allExistingTemplates.filter((template: any) =>
		existingTemplateCodes.includes(String(template.code)),
	);
	const existingTemplateByCode = new Map(
		existingTemplates.map((template: any) => [String(template.code), template]),
	);

	const stats = {
		sourceWorkbook: path.relative(path.resolve(__dirname, "..", ".."), sourcePath).replace(/\\/g, "/"),
		sourceSheet: sheetName,
		mode: execute ? "execute" : "dry-run",
		sourceRows: assignments.length,
		dateColumns: dateColumns.length,
		effectiveFrom: toDateKey(assignments[0]?.effectiveFrom),
		effectiveTo: toDateKey(assignments[0]?.effectiveTo),
		employeesMatched: 0,
		missingEmployees: 0,
		uniqueShiftCodes: new Set(assignments.map((assignment) => assignment.shiftCode)).size,
		uniqueScheduleTemplates: existingTemplateCodes.length,
		reusedSimilarScheduleTemplates: 0,
		shiftTypesCreated: 0,
		shiftTypesUpdated: 0,
		scheduleTemplatesCreated: 0,
		scheduleTemplatesUpdated: 0,
		oldScheduleTemplatesDeleted: 0,
		oldScheduleHistoryDeleted: 0,
		employeeSchedulesAlreadyTally: 0,
		employeeSchedulesToUpdate: 0,
		employeeSchedulesUpdated: 0,
		staleDefaultSchedulesToClear: 0,
		staleDefaultSchedulesCleared: 0,
	};
	const samples: string[] = [];

	const shiftTypeByCode = new Map<string, any>();
	const uniqueAssignmentsByShift = new Map<string, SourceAssignment>();
	for (const assignment of assignments) {
		if (!uniqueAssignmentsByShift.has(assignment.shiftCode)) {
			uniqueAssignmentsByShift.set(assignment.shiftCode, assignment);
		}
	}

	for (const assignment of uniqueAssignmentsByShift.values()) {
		const payload = buildShiftPayload(organizationId, assignment);
		const existing = await (prisma as any).shiftType.findUnique({
			where: { organizationId_code: { organizationId, code: assignment.shiftCode } },
		});
		if (existing) {
			stats.shiftTypesUpdated++;
			shiftTypeByCode.set(assignment.shiftCode, execute
				? await (prisma as any).shiftType.update({
						where: { id: existing.id },
						data: {
							name: payload.name,
							isOvernight: payload.isOvernight,
							isOff: payload.isOff,
							isActive: payload.isActive,
							timeSlots: payload.timeSlots,
							shiftHour: payload.shiftHour,
						},
					})
				: existing);
		} else {
			stats.shiftTypesCreated++;
			if (execute) {
				const created = await (prisma as any).shiftType.create({ data: payload });
				shiftTypeByCode.set(assignment.shiftCode, created);
			}
		}
	}

	if (!execute) {
		const shiftTypes = await (prisma as any).shiftType.findMany({
			where: {
				organizationId,
				isDeleted: false,
				code: { in: Array.from(uniqueAssignmentsByShift.keys()) },
			},
		});
		for (const shiftType of shiftTypes) {
			shiftTypeByCode.set(String(shiftType.code), shiftType);
		}
	}

	const templatesByCode = new Map<string, any>();
	const uniqueAssignmentsByTemplate = new Map<string, SourceAssignment>();
	for (const assignment of assignments) {
		if (!uniqueAssignmentsByTemplate.has(assignment.scheduleCode)) {
			uniqueAssignmentsByTemplate.set(assignment.scheduleCode, assignment);
		}
	}

	for (const assignment of uniqueAssignmentsByTemplate.values()) {
		const shiftType = shiftTypeByCode.get(assignment.shiftCode);
		if (!shiftType && !execute) {
			if (existingTemplateByCode.has(assignment.scheduleCode)) {
				stats.scheduleTemplatesUpdated++;
			} else {
				stats.scheduleTemplatesCreated++;
			}
			continue;
		}
		if (!shiftType) {
			throw new Error(`Shift type ${assignment.shiftCode} was not available after upsert.`);
		}
		const rawPattern = Array.from({ length: 7 }, (_, index) =>
			index < 6
				? { day: index + 1, shiftTypeId: shiftType.id, shiftSnapshot: null }
				: { day: index + 1, shiftTypeId: null, shiftSnapshot: buildOffDaySnapshot() },
		);
		const pattern = await copyShiftTypeToTemplatePatternDay(prisma, {
			organizationId,
			pattern: rawPattern,
		});
		const totalHour = pattern.reduce(
			(total: number, day: any) => total + Math.max(0, Number(day.shiftHour || 0)),
			0,
		);
		const totalDay = pattern.filter((day: any) => Number(day.shiftHour || 0) > 0).length;
		const existingTemplate =
			existingTemplateByCode.get(assignment.scheduleCode) ||
			allExistingTemplates.find((template: any) =>
				isEquivalentMonSatTemplate(template, shiftType),
			);
		const data = {
			organizationId,
			code: assignment.scheduleCode,
			name: `BNPI Mon-Sat ${assignment.shiftLabel}`,
			description: `Mon-Sat schedule derived from ${path.basename(sourcePath)} ${assignment.sourceSheet}`,
			cycleDays: 7,
			graceLateMinutes: 0,
			graceEarlyOutMinutes: 0,
			pattern,
			totalHour,
			totalDay,
			isActive: true,
			isDeleted: false,
		};
		if (existingTemplate) {
			const isSameCode = String(existingTemplate.code) === assignment.scheduleCode;
			if (!isSameCode) stats.reusedSimilarScheduleTemplates++;
			else stats.scheduleTemplatesUpdated++;
			templatesByCode.set(
				assignment.scheduleCode,
				execute && isSameCode
					? await (prisma as any).scheduleTemplate.update({
							where: { id: existingTemplate.id },
							data,
						})
					: existingTemplate,
			);
		} else {
			stats.scheduleTemplatesCreated++;
			if (execute) {
				const created = await (prisma as any).scheduleTemplate.create({ data });
				templatesByCode.set(assignment.scheduleCode, created);
			}
		}
	}

	if (!execute) {
		const templates = await (prisma as any).scheduleTemplate.findMany({
			where: { organizationId, isDeleted: false, code: { in: existingTemplateCodes } },
		});
		for (const template of templates) {
			templatesByCode.set(String(template.code), template);
		}
	}

	const csvRows = [
		["EMP_ID", "SCHEDULE_CODE", "EFFECTIVE_FROM", "EFFECTIVE_TO", "NOTES"],
		...assignments.map((assignment) => {
			const template = templatesByCode.get(assignment.scheduleCode);
			return [
				assignment.employeeExternalId,
				String(template?.code || assignment.scheduleCode),
				toDateKey(assignment.effectiveFrom),
				"",
				`BNPI WorkSharingSchedule source row ${assignment.sourceRow}; source span ${toDateKey(assignment.effectiveFrom)} to ${toDateKey(assignment.effectiveTo)}; recurring Mon-Sat shift ${assignment.shiftLabel}`,
			];
		}),
	];

	for (const assignment of assignments) {
		const employee = employeesByExternalId.get(assignment.employeeExternalId);
		if (!employee) {
			stats.missingEmployees++;
			if (samples.length < 12) {
				samples.push(`${assignment.employeeExternalId}: source row ${assignment.sourceRow} missing in DB`);
			}
			continue;
		}
		stats.employeesMatched++;
		const rawCurrent = (employee.embeddedSchedule || {}) as any;
		const current = unwrapEmbeddedSchedule(rawCurrent) || {};
		const resolvedTemplate = templatesByCode.get(assignment.scheduleCode);
		const resolvedScheduleCode = String(resolvedTemplate?.code || assignment.scheduleCode);
		const expectedEffectiveStart =
			Number(resolvedTemplate?.cycleDays || 0) % 7 === 0
				? anchorToMondayUtc(assignment.effectiveFrom)
				: assignment.effectiveFrom;
		const tallies =
			!rawCurrent?.set &&
			current?.templateCode === resolvedScheduleCode &&
			toDateKey(current?.effectiveStartDate) === toDateKey(expectedEffectiveStart) &&
			!toDateKey(current?.effectiveEndDate);
		if (tallies) {
			stats.employeeSchedulesAlreadyTally++;
			continue;
		}
		stats.employeeSchedulesToUpdate++;
		if (samples.length < 12) {
			samples.push(
				`${assignment.employeeExternalId}: ${current?.templateCode || "(blank)"} -> ${resolvedScheduleCode}`,
			);
		}
		if (!execute) continue;
		const template = resolvedTemplate;
		if (!template) {
			throw new Error(`Schedule template ${assignment.scheduleCode} was not available after upsert.`);
		}
		const nextEmbeddedSchedule = copyTemplateToEmployeeEmbeddedSchedule({
			template,
			effectiveStartDate: assignment.effectiveFrom,
			effectiveEndDate: null,
			reason: "BNPI WorkSharingSchedule employee schedule assignment backfill",
			version: Number(current?.version || 0) + 1,
		});
		await prisma.employee.update({
			where: { id: employee.id },
			data: { embeddedSchedule: nextEmbeddedSchedule as any },
		});
		await appendEmployeeScheduleHistory(prisma, {
			organizationId,
			employeeId: employee.id,
			action: current?.templateCode ? "reassigned" : "assigned",
			effectiveAt: assignment.effectiveFrom,
			reason: "BNPI WorkSharingSchedule employee schedule assignment backfill",
			beforeSchedule: current || null,
			afterSchedule: nextEmbeddedSchedule,
			metadata: {
				sourceWorkbook: stats.sourceWorkbook,
				sourceSheet: assignment.sourceSheet,
				sourceRow: assignment.sourceRow,
				sourceEmployeeId: assignment.sourceEmployeeId,
				sourceEffectiveFrom: toDateKey(assignment.effectiveFrom),
				sourceEffectiveTo: toDateKey(assignment.effectiveTo),
				effectiveTo: null,
				employeeName: assignment.employeeName,
				department: assignment.department,
				division: assignment.division,
				position: assignment.position,
				shift: assignment.shiftLabel,
			},
		});
		stats.employeeSchedulesUpdated++;
	}

	const sourceEmployeeIds = new Set(assignments.map((assignment) => assignment.employeeExternalId));
	const staleDefaultEmployees = await prisma.employee.findMany({
		where: {
			organizationId,
			isDeleted: false,
			employeeId: { notIn: Array.from(sourceEmployeeIds) },
			embeddedSchedule: {
				path: ["templateCode"],
				equals: "BNPI_MON_FRI_DAY_8_5",
			},
		},
		select: { id: true, employeeId: true, embeddedSchedule: true },
	});
	for (const employee of staleDefaultEmployees as any[]) {
		const current = unwrapEmbeddedSchedule(employee.embeddedSchedule);
		if (
			current?.reason !== "employee_import" &&
			current?.templateCode !== "BNPI_MON_FRI_DAY_8_5"
		) {
			continue;
		}
		stats.staleDefaultSchedulesToClear++;
		if (samples.length < 12) {
			samples.push(
				`${employee.employeeId}: clearing stale BNPI_MON_FRI_DAY_8_5 import default`,
			);
		}
		if (!execute) continue;
		await prisma.employee.update({
			where: { id: employee.id },
			data: { embeddedSchedule: null as any },
		});
		await appendEmployeeScheduleHistory(prisma, {
			organizationId,
			employeeId: employee.id,
			action: "cleared",
			effectiveAt: new Date(),
			reason: "Cleared stale BNPI 8-5 employee import default; no DM3.2 source assignment found",
			beforeSchedule: current || null,
			afterSchedule: null,
			metadata: {
				sourceWorkbook: stats.sourceWorkbook,
				sourceSheet: sheetName,
				sourceEmployeeId: employee.employeeId,
				clearReason: "not_present_in_worksharing_schedule_source",
			},
		});
		stats.staleDefaultSchedulesCleared++;
	}

	if (writeCsv) {
		const csvPath = path.resolve(__dirname, "..", "..", "data", "import", "employee-schedules-import.csv");
		fs.writeFileSync(
			csvPath,
			csvRows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n",
		);
	}

	const oldTemplatePrefixes = ["BNPI_WS_202505_", "BNPI_WS_MON_FRI_"];
	if (execute) {
		const sourceHistoryRows = await prisma.employeeScheduleHistory.findMany({
			where: { organizationId },
			select: { id: true, metadata: true, afterSchedule: true },
		});
		const oldHistoryIds = sourceHistoryRows
			.filter(
				(row: any) =>
					row.metadata?.sourceWorkbook === stats.sourceWorkbook &&
					oldTemplatePrefixes.some((prefix) =>
						String(row.afterSchedule?.templateCode || "").startsWith(prefix),
					),
			)
			.map((row: any) => row.id);
		if (oldHistoryIds.length > 0) {
			const result = await prisma.employeeScheduleHistory.deleteMany({
				where: { id: { in: oldHistoryIds } },
			});
			stats.oldScheduleHistoryDeleted = result.count;
		}
		const currentSourceHistoryRows = await prisma.employeeScheduleHistory.findMany({
			where: { organizationId },
			select: {
				id: true,
				employeeId: true,
				createdAt: true,
				metadata: true,
			},
			orderBy: { createdAt: "desc" },
		});
		const seenHistoryKeys = new Set<string>();
		const duplicateHistoryIds: string[] = [];
		for (const row of currentSourceHistoryRows as any[]) {
			if (row.metadata?.sourceWorkbook !== stats.sourceWorkbook) continue;
			const key = `${row.employeeId}:${row.metadata?.sourceRow || ""}`;
			if (seenHistoryKeys.has(key)) duplicateHistoryIds.push(row.id);
			else seenHistoryKeys.add(key);
		}
		if (duplicateHistoryIds.length > 0) {
			const result = await prisma.employeeScheduleHistory.deleteMany({
				where: { id: { in: duplicateHistoryIds } },
			});
			stats.oldScheduleHistoryDeleted += result.count;
		}
		for (const prefix of oldTemplatePrefixes) {
			const result = await (prisma as any).scheduleTemplate.deleteMany({
				where: {
					organizationId,
					code: { startsWith: prefix },
				},
			});
			stats.oldScheduleTemplatesDeleted += result.count;
		}
	} else {
		for (const prefix of oldTemplatePrefixes) {
			stats.oldScheduleTemplatesDeleted += await (prisma as any).scheduleTemplate.count({
				where: {
					organizationId,
					code: { startsWith: prefix },
				},
			});
		}
	}

	console.log(
		JSON.stringify(
			{
				organizationId,
				writeCsv,
				stats,
				samples,
			},
			null,
			2,
		),
	);
};

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
