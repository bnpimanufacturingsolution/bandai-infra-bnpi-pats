import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma";
import { buildAttendanceEmployeeSnapshotFields, buildAttendanceTimekeepingFields } from "../helper/attendance.helper";
import { calculateTimekeeping, determineAttendanceStatus } from "../helper/timekeeping.helper";
import { generateTimesheetForPayrollPeriod } from "../helper/timesheet.helper";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env.development.local"), override: true });

const prisma = new PrismaClient();

function arg(name: string) {
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string) {
	return process.argv.includes(`--${name}`);
}

function normalizeCode(value: unknown) {
	const raw = String(value ?? "").trim();
	if (!raw) return "";
	const digits = raw.replace(/[^0-9]/g, "");
	return digits ? digits.padStart(5, "0") : raw.toUpperCase();
}

function parseDateTime(value: unknown): Date | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	if (typeof value === "number") {
		const utcMs = (value - 25569) * 86400 * 1000;
		const date = new Date(utcMs);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	const parsed = new Date(String(value ?? "").trim());
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateKey(value: Date) {
	const y = value.getFullYear();
	const m = String(value.getMonth() + 1).padStart(2, "0");
	const d = String(value.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function dateOnlyUtc(key: string) {
	return new Date(`${key}T00:00:00.000Z`);
}

function endOfDayUtc(key: string) {
	return new Date(`${key}T23:59:59.999Z`);
}

function readPunches(workbookPath: string, startDate: string, endDate: string) {
	const workbook = XLSX.readFile(workbookPath, { cellDates: true });
	const sheet = workbook.Sheets[workbook.SheetNames[0]];
	const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: null });
	const groups = new Map<string, { code: string; dateKey: string; punches: Date[] }>();
	for (const row of rows) {
		const code = normalizeCode(row["No."] ?? row.No ?? row.EMPLOYEE_ID ?? row.EmployeeID);
		const punch = parseDateTime(row["Date/Time"] ?? row.DateTime ?? row.TIME ?? row.Time);
		if (!code || !punch) continue;
		const key = dateKey(punch);
		if (key < startDate || key > endDate) continue;
		const groupKey = `${code}:${key}`;
		const group = groups.get(groupKey) || { code, dateKey: key, punches: [] };
		group.punches.push(punch);
		groups.set(groupKey, group);
	}
	return { rawRows: rows.length, groups: Array.from(groups.values()), sheets: workbook.SheetNames };
}

async function snapshot(organizationId: string, payrollPeriodId: string, startDate: string, endDate: string) {
	return {
		attendance: await prisma.attendance.count({
			where: {
				organizationId,
				isDeleted: false,
				date: { gte: dateOnlyUtc(startDate), lte: endOfDayUtc(endDate) },
			},
		}),
		timesheets: await prisma.timesheet.groupBy({
			by: ["status"],
			where: { organizationId, isDeleted: false, payrollPeriodId },
			_count: { _all: true },
		}),
		timesheetLines: await prisma.timesheetline.count({
			where: { organizationId, isDeleted: false, payrollPeriodId },
		}),
	};
}

async function main() {
	const workbookPath = arg("workbook");
	const startDate = arg("start");
	const endDate = arg("end");
	const payrollPeriodId = arg("payrollPeriodId");
	const outputDir = path.resolve(arg("output-dir") || "../.runtime/fast-new-cutoff-biometrics");
	const apply = hasFlag("apply");
	if (!workbookPath || !startDate || !endDate || !payrollPeriodId) {
		throw new Error("Usage: --workbook=<xlsx> --start=YYYY-MM-DD --end=YYYY-MM-DD --payrollPeriodId=<id> [--apply]");
	}
	fs.mkdirSync(outputDir, { recursive: true });

	const organizationId =
		arg("organizationId") ||
		(await prisma.organization.findFirst({
			where: { isDeleted: false },
			orderBy: { createdAt: "asc" },
			select: { id: true },
		}))?.id;
	if (!organizationId) throw new Error("No organization found.");

	const payrollPeriod = await prisma.payrollPeriod.findFirst({
		where: { id: payrollPeriodId, organizationId, isDeleted: false },
		select: { id: true, code: true, status: true, startDate: true, endDate: true },
	});
	if (!payrollPeriod) throw new Error(`Payroll period not found: ${payrollPeriodId}`);

	const before = await snapshot(organizationId, payrollPeriodId, startDate, endDate);
	const punchRead = readPunches(path.resolve(workbookPath), startDate, endDate);
	const employees = await prisma.employee.findMany({
		where: { organizationId, isDeleted: false },
		select: {
			id: true,
			employeeId: true,
			deviceEmpId: true,
			embeddedSchedule: true,
			workforceSource: true,
			agencyId: true,
			reportToId: true,
			departmentId: true,
			department: { select: { id: true, name: true } },
			person: { select: { personalInfo: true } },
		},
	});
	const byEmployeeCode = new Map(employees.map((employee) => [normalizeCode(employee.employeeId), employee]));
	const byDeviceCode = new Map(
		employees.filter((employee) => employee.deviceEmpId).map((employee) => [normalizeCode(employee.deviceEmpId), employee]),
	);

	const unmatched: Array<{ code: string; date: string; punches: number }> = [];
	const attendanceRows = [];
	const employeeIds = new Set<string>();
	for (const group of punchRead.groups) {
		const employee = byDeviceCode.get(group.code) || byEmployeeCode.get(group.code);
		if (!employee) {
			unmatched.push({ code: group.code, date: group.dateKey, punches: group.punches.length });
			continue;
		}
		group.punches.sort((a, b) => a.getTime() - b.getTime());
		const date = dateOnlyUtc(group.dateKey);
		const timeIn = group.punches[0] || null;
		const timeOut = group.punches.length > 1 ? group.punches[group.punches.length - 1] : null;
		const scheduleSnapshot = (employee.embeddedSchedule as any) || null;
		const calc = calculateTimekeeping(timeIn, timeOut, scheduleSnapshot, date);
		const status = determineAttendanceStatus(calc, Boolean(timeOut));
		employeeIds.add(employee.id);
		attendanceRows.push({
			organizationId,
			employeeId: employee.id,
			date,
			timeIn,
			timeOut,
			status,
			behaviorFlags: [],
			isManualEntry: false,
			notes: `new-cutoff biometrics seed from ${path.basename(workbookPath)}`,
			scheduleSnapshot,
			...buildAttendanceEmployeeSnapshotFields(employee as any),
			...buildAttendanceTimekeepingFields(calc),
			isDeleted: false,
			isEffective: true,
		});
	}

	const existing = await prisma.attendance.findMany({
		where: {
			organizationId,
			isDeleted: false,
			date: { gte: dateOnlyUtc(startDate), lte: endOfDayUtc(endDate) },
			employeeId: { in: Array.from(employeeIds) },
		},
		select: { id: true, employeeId: true, date: true },
	});
	const existingByKey = new Map(existing.map((row) => [`${row.employeeId}:${dateKey(row.date!)}`, row.id]));
	const toUpdate = attendanceRows.filter((row) => existingByKey.has(`${row.employeeId}:${dateKey(row.date)}`));
	const toCreate = attendanceRows.filter((row) => !existingByKey.has(`${row.employeeId}:${dateKey(row.date)}`));

	const dryRun = {
		mode: apply ? "apply" : "dry-run",
		workbookPath: path.resolve(workbookPath),
		sheets: punchRead.sheets,
		rawRows: punchRead.rawRows,
		payrollPeriod,
		before,
		groupedEmployeeDays: punchRead.groups.length,
		importableRows: attendanceRows.length,
		wouldUpdateAttendanceRows: toUpdate.length,
		wouldCreateAttendanceRows: toCreate.length,
		employeesWithImportRows: employeeIds.size,
		unmatchedRows: unmatched.length,
		unmatchedSample: unmatched.slice(0, 100),
	};
	fs.writeFileSync(path.join(outputDir, "fast-biometrics-dry-run.json"), JSON.stringify(dryRun, null, 2));
	if (!apply) {
		console.log(JSON.stringify(dryRun, null, 2));
		return;
	}

	for (const row of toUpdate) {
		const id = existingByKey.get(`${row.employeeId}:${dateKey(row.date)}`);
		if (!id) continue;
		const { organizationId: _organizationId, employeeId: _employeeId, date: _date, ...data } = row;
		await prisma.attendance.update({ where: { id }, data });
	}
	if (toCreate.length) {
		await prisma.attendance.createMany({ data: toCreate as any[], skipDuplicates: true });
	}

	let timesheetsGenerated = 0;
	let timesheetErrors = 0;
	const timesheetErrorSamples = [];
	for (const employeeId of employeeIds) {
		try {
			await generateTimesheetForPayrollPeriod(
				prisma,
				employeeId,
				organizationId,
				payrollPeriodId,
				`Approved timesheet from new-cutoff biometrics seed ${path.basename(workbookPath)}`,
				"APPROVED",
			);
			timesheetsGenerated += 1;
		} catch (error) {
			timesheetErrors += 1;
			if (timesheetErrorSamples.length < 50) {
				timesheetErrorSamples.push({ employeeId, error: error instanceof Error ? error.message : String(error) });
			}
		}
	}

	const after = await snapshot(organizationId, payrollPeriodId, startDate, endDate);
	const result = {
		...dryRun,
		createdAttendanceRows: toCreate.length,
		updatedAttendanceRows: toUpdate.length,
		timesheetsGenerated,
		timesheetErrors,
		timesheetErrorSamples,
		after,
	};
	fs.writeFileSync(path.join(outputDir, "fast-biometrics-apply.json"), JSON.stringify(result, null, 2));
	console.log(JSON.stringify(result, null, 2));
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.stack || error.message : error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
