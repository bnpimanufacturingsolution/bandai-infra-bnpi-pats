import path from "path";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma";
import { ensureDm3ScheduleBackedAttendanceObligations } from "../helper/dm3-attendance-obligation-repair.helper";
import {
	appendEmployeeScheduleHistory,
	copyShiftTypeToTemplatePatternDay,
	copyTemplateToEmployeeEmbeddedSchedule,
	isSameEmployeeScheduleAssignment,
} from "../helper/employee-schedule.helper";
import {
	buildNonOverlappingWorkBreakSlots,
	calculateShiftHour,
} from "../helper/schedule-normalization.helper";

const prisma = new PrismaClient();

const repoRoot = path.resolve(__dirname, "..", "..");
const defaultSource = path.join(repoRoot, "data", "import", "employee-schedules-import.csv");

function argValue(name: string) {
	const prefix = `--${name}=`;
	const found = process.argv.find((arg) => arg.startsWith(prefix));
	return found ? found.slice(prefix.length) : "";
}

function hasFlag(name: string) {
	return process.argv.includes(`--${name}`);
}

function parseDateOnlyInput(value: unknown): Date | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
	}
	const text = String(value || "").trim();
	if (!text) return null;
	const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (match) return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
	const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
	if (slashMatch) {
		const year = Number(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]);
		const month = Number(slashMatch[1]);
		const day = Number(slashMatch[2]);
		return new Date(Date.UTC(year, month - 1, day));
	}
	const parsed = new Date(text);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseScheduleCode(scheduleCode: string) {
	const normalized = String(scheduleCode || "")
		.trim()
		.toUpperCase();
	if (!/^(?:BNPI_WS_MON_SAT|BNPI_SCHED_MON_SAT)_WS_\d{4}_\d{4}/.test(normalized)) return null;
	const workWindows = Array.from(normalized.matchAll(/(?:^|_)WS_(\d{2})(\d{2})_(\d{2})(\d{2})/g)).map((match) => ({
		startTime: `${match[1]}:${match[2]}`,
		endTime: `${match[3]}:${match[4]}`,
		raw: match,
	}));
	const breakWindows = Array.from(normalized.matchAll(/(?:^|_)BR_(\d{2})(\d{2})_(\d{2})(\d{2})/g)).map((match) => ({
		startTime: `${match[1]}:${match[2]}`,
		endTime: `${match[3]}:${match[4]}`,
		raw: match,
	}));
	const values = [...workWindows, ...breakWindows]
		.flatMap((window) => [window.raw[1], window.raw[2], window.raw[3], window.raw[4]])
		.map(Number);
	if (values.some((value, index) => value > (index % 2 === 0 ? 23 : 59))) return null;
	const startTime = workWindows[0]?.startTime;
	const endTime = workWindows[workWindows.length - 1]?.endTime;
	if (!startTime || !endTime) return null;
	const breakStartTime = breakWindows[0]?.startTime || null;
	const breakEndTime = breakWindows[0]?.endTime || null;
	const breakCode = breakWindows.map((window) => `_BR_${window.startTime.replace(":", "")}_${window.endTime.replace(":", "")}`).join("");
	return {
		shiftCode: `${workWindows.map((window) => `WS_${window.startTime.replace(":", "")}_${window.endTime.replace(":", "")}`).join("_")}${breakCode}`,
		shiftLabel: `${workWindows.map((window) => `${window.startTime} to ${window.endTime}`).join(" / ")}${breakWindows.length ? `, breaks ${breakWindows.map((window) => `${window.startTime} to ${window.endTime}`).join(" / ")}` : ""}`,
		startTime,
		endTime,
		breakStartTime,
		breakEndTime,
		workWindows,
		breakWindows,
	};
}

function offDaySnapshot() {
	return {
		name: "Off day",
		code: "OFF",
		isOvernight: false,
		isOff: true,
		shiftHour: 0,
		timeSlots: [],
	};
}

async function ensureTemplates(organizationId: string, scheduleCodes: string[], apply: boolean) {
	const createdCodes: string[] = [];
	const updatedCodes: string[] = [];
	const unparseableCodes: string[] = [];

	for (const scheduleCode of scheduleCodes) {
		const parsed = parseScheduleCode(scheduleCode);
		if (!parsed) {
			unparseableCodes.push(scheduleCode);
			continue;
		}
		const existingTemplate = await (prisma as any).scheduleTemplate.findUnique({
			where: { organizationId_code: { organizationId, code: scheduleCode } },
			select: { id: true },
		});
		if (!apply) {
			if (existingTemplate) updatedCodes.push(scheduleCode);
			else createdCodes.push(scheduleCode);
			continue;
		}
		const shiftPayload = {
			organizationId,
			name: parsed.shiftLabel,
			code: parsed.shiftCode,
			isOvernight: parsed.endTime <= parsed.startTime,
			isOff: false,
			isActive: true,
			isDeleted: false,
			timeSlots: buildNonOverlappingWorkBreakSlots(parsed),
		};
		const shiftHour = calculateShiftHour(shiftPayload);
		const shiftType = await (prisma as any).shiftType.upsert({
			where: { organizationId_code: { organizationId, code: parsed.shiftCode } },
			update: { ...shiftPayload, shiftHour },
			create: { ...shiftPayload, shiftHour },
		});
		const rawPattern = Array.from({ length: 7 }, (_, index) =>
			index < 6
				? { day: index + 1, shiftTypeId: shiftType.id, shiftSnapshot: null }
				: { day: index + 1, shiftTypeId: null, shiftSnapshot: offDaySnapshot() },
		);
		const pattern = await copyShiftTypeToTemplatePatternDay(prisma, { organizationId, pattern: rawPattern });
		const totalHour = pattern.reduce((total: number, day: any) => total + Math.max(0, Number(day.shiftHour || 0)), 0);
		const totalDay = pattern.filter((day: any) => Number(day.shiftHour || 0) > 0).length;
		await (prisma as any).scheduleTemplate.upsert({
			where: { organizationId_code: { organizationId, code: scheduleCode } },
			update: {
				name: `BNPI Mon-Sat ${parsed.shiftLabel}`,
				description: "DM3.2 BNPI recurring schedule template",
				cycleDays: 7,
				graceLateMinutes: 0,
				graceEarlyOutMinutes: 0,
				pattern,
				totalHour,
				totalDay,
				isActive: true,
				isDeleted: false,
			},
			create: {
				organizationId,
				code: scheduleCode,
				name: `BNPI Mon-Sat ${parsed.shiftLabel}`,
				description: "DM3.2 BNPI recurring schedule template",
				cycleDays: 7,
				graceLateMinutes: 0,
				graceEarlyOutMinutes: 0,
				pattern,
				totalHour,
				totalDay,
				isActive: true,
				isDeleted: false,
			},
		});
		if (existingTemplate) updatedCodes.push(scheduleCode);
		else createdCodes.push(scheduleCode);
	}

	return { createdCodes, updatedCodes, unparseableCodes };
}

function readRows(filePath: string) {
	const workbook = XLSX.readFile(filePath, { raw: false, cellDates: false });
	const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
	return XLSX.utils.sheet_to_json(firstSheet, { defval: "", raw: false }) as Record<string, any>[];
}

async function resolveOrganizationId(employeeIds: string[], explicitOrganizationId: string) {
	if (explicitOrganizationId) return explicitOrganizationId;
	const employees = await prisma.employee.findMany({
		where: { isDeleted: false, employeeId: { in: employeeIds } },
		select: { organizationId: true },
	});
	const counts = new Map<string, number>();
	for (const employee of employees) counts.set(employee.organizationId, (counts.get(employee.organizationId) || 0) + 1);
	const best = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
	if (!best) throw new Error("Could not infer organizationId from schedule employee IDs.");
	return best[0];
}

async function main() {
	const apply = hasFlag("apply") || hasFlag("execute");
	const sourceFile = path.resolve(argValue("file") || defaultSource);
	const effectiveFromOverride = parseDateOnlyInput(argValue("effectiveFrom"));
	const rows = readRows(sourceFile);
	const employeeIds = Array.from(new Set(rows.map((row) => String(row.EMP_ID || "").trim()).filter(Boolean)));
	const scheduleCodes = Array.from(new Set(rows.map((row) => String(row.SCHEDULE_CODE || "").trim()).filter(Boolean)));
	const organizationId = await resolveOrganizationId(employeeIds, argValue("organizationId"));
	const employees = await prisma.employee.findMany({
		where: { organizationId, isDeleted: false, employeeId: { in: employeeIds } },
		select: { id: true, employeeId: true, embeddedSchedule: true },
	});
	const employeesByExternalId = new Map(employees.map((employee: any) => [String(employee.employeeId), employee]));
	const templateRepair = await ensureTemplates(organizationId, scheduleCodes, apply);
	const templates = await (prisma as any).scheduleTemplate.findMany({
		where: { organizationId, isDeleted: false, code: { in: scheduleCodes } },
		select: { id: true, code: true, name: true, cycleDays: true, graceLateMinutes: true, graceEarlyOutMinutes: true, pattern: true },
	});
	const templatesByCode = new Map(templates.map((template: any) => [String(template.code), template]));
	const summary = {
		mode: apply ? "apply" : "dry-run",
		sourceFile: path.relative(repoRoot, sourceFile).replace(/\\/g, "/"),
		organizationId,
		rows: rows.length,
		employeesMatched: employees.length,
		missingEmployees: employeeIds.filter((employeeId) => !employeesByExternalId.has(employeeId)),
		scheduleCodes: scheduleCodes.length,
		templateRepairCreated: templateRepair.createdCodes.length,
		templateRepairUpdated: templateRepair.updatedCodes.length,
		unparseableScheduleCodes: templateRepair.unparseableCodes,
		effectiveFromOverride: effectiveFromOverride
			? effectiveFromOverride.toISOString().slice(0, 10)
			: null,
		wouldAssign: 0,
		wouldUpdateExistingSchedule: 0,
		unchangedScheduleAssignments: 0,
		wouldWriteScheduleChanges: 0,
		failedRows: [] as Array<{ row: number; field: string; message: string }>,
		attendanceObligations: null as any,
	};
	const affectedEmployeeIds = new Set<string>();

	for (const [index, row] of rows.entries()) {
		const rowNumber = index + 2;
		const employeeExternalId = String(row.EMP_ID || "").trim();
		const scheduleCode = String(row.SCHEDULE_CODE || "").trim();
		const sourceEffectiveFrom = parseDateOnlyInput(row.EFFECTIVE_FROM);
		const effectiveFrom = effectiveFromOverride || sourceEffectiveFrom;
		const effectiveTo = parseDateOnlyInput(row.EFFECTIVE_TO);
		const employee = employeesByExternalId.get(employeeExternalId);
		const template = templatesByCode.get(scheduleCode);
		const scheduleIsResolvable = Boolean(template || (!apply && parseScheduleCode(scheduleCode)));
		if (!employee || !scheduleIsResolvable || !effectiveFrom) {
			summary.failedRows.push({
				row: rowNumber,
				field: !employee ? "EMP_ID" : !scheduleIsResolvable ? "SCHEDULE_CODE" : "EFFECTIVE_FROM",
				message: !employee
					? `Employee ${employeeExternalId} was not found.`
					: !scheduleIsResolvable
						? `Schedule template ${scheduleCode} was not found.`
						: "EFFECTIVE_FROM is required.",
			});
			continue;
		}
		if (employee.embeddedSchedule) summary.wouldUpdateExistingSchedule += 1;
		summary.wouldAssign += 1;
		affectedEmployeeIds.add(employee.id);
		const nextEmbeddedSchedule = copyTemplateToEmployeeEmbeddedSchedule({
			template,
			effectiveStartDate: effectiveFrom,
			effectiveEndDate: effectiveTo || null,
			reason: String(row.NOTES || "").trim() || "DM3.2 employee schedule assignment repair",
			version: Number((employee.embeddedSchedule as any)?.version || 0) + 1,
		});
		if (isSameEmployeeScheduleAssignment(employee.embeddedSchedule || null, nextEmbeddedSchedule)) {
			summary.unchangedScheduleAssignments += 1;
			continue;
		}
		summary.wouldWriteScheduleChanges += 1;
		if (!apply) continue;
		await prisma.employee.update({
			where: { id: employee.id },
			data: { embeddedSchedule: nextEmbeddedSchedule as any },
		});
		await appendEmployeeScheduleHistory(prisma, {
			organizationId,
			employeeId: employee.id,
			action: employee.embeddedSchedule ? "reassigned" : "assigned",
			reason: String(row.NOTES || "").trim() || "DM3.2 employee schedule assignment repair",
			effectiveAt: effectiveFrom,
			beforeSchedule: employee.embeddedSchedule || null,
			afterSchedule: nextEmbeddedSchedule,
			metadata: {
				sourceWorkbook: path.basename(sourceFile),
				sourceSheet: "Employee Schedule Assignments",
				sourceRow: rowNumber,
				sourceEffectiveFrom: sourceEffectiveFrom
					? sourceEffectiveFrom.toISOString().slice(0, 10)
					: null,
				effectiveFromOverride: effectiveFromOverride
					? effectiveFromOverride.toISOString().slice(0, 10)
					: null,
				repairScript: "repair-bnpi-dm3-schedule-assignments",
			},
		});
	}

	if (apply && affectedEmployeeIds.size > 0) {
		summary.attendanceObligations = await ensureDm3ScheduleBackedAttendanceObligations(prisma, {
			organizationId,
			employeeIds: Array.from(affectedEmployeeIds),
			currentOnly: true,
		});
	}

	console.log(JSON.stringify({ ...summary, missingEmployees: summary.missingEmployees.slice(0, 25), failedRows: summary.failedRows.slice(0, 25) }, null, 2));
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
