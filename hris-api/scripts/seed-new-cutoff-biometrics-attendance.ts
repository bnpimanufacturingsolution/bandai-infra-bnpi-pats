import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";
import * as XLSX from "xlsx";
import { AttendanceImportService } from "../app/attendance/attendance-import.service";
import { PrismaClient } from "../generated/prisma";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env.development.local"), override: true });

const prisma = new PrismaClient();

type PunchGroup = {
	code: string;
	dateKey: string;
	punches: Date[];
};

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

function readPunchGroups(workbookPath: string, startDate: string, endDate: string) {
	const workbook = XLSX.readFile(workbookPath, { cellDates: true });
	const sheet = workbook.Sheets[workbook.SheetNames[0]];
	const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: null });
	const groups = new Map<string, PunchGroup>();
	const skipped: Array<{ row: number; reason: string; sample: Record<string, unknown> }> = [];

	rows.forEach((row, index) => {
		const code = normalizeCode(row["No."] ?? row.No ?? row.EMPLOYEE_ID ?? row.EmployeeID);
		const punch = parseDateTime(row["Date/Time"] ?? row.DateTime ?? row.TIME ?? row.Time);
		if (!code || !punch) {
			if (skipped.length < 50) skipped.push({ row: index + 2, reason: "missing code or datetime", sample: row });
			return;
		}
		const key = dateKey(punch);
		if (key < startDate || key > endDate) return;
		const groupKey = `${code}:${key}`;
		const group = groups.get(groupKey) || { code, dateKey: key, punches: [] };
		group.punches.push(punch);
		groups.set(groupKey, group);
	});

	return { workbookSheets: workbook.SheetNames, rawRows: rows.length, groups: Array.from(groups.values()), skipped };
}

async function waitForJob(jobId: string) {
	for (let attempt = 0; attempt < 720; attempt += 1) {
		const progress = AttendanceImportService.getJobProgress(jobId);
		if (progress && progress.status !== "processing") return progress;
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw new Error(`Attendance import job did not finish: ${jobId}`);
}

async function main() {
	const workbookPath = arg("workbook");
	const startDate = arg("start");
	const endDate = arg("end");
	const outputDir = path.resolve(arg("output-dir") || "../.runtime/new-cutoff-biometrics-attendance");
	const apply = hasFlag("apply");
	const createTimesheets = !hasFlag("no-timesheets");
	const organizationId =
		arg("organizationId") ||
		(await prisma.organization.findFirst({
			where: { isDeleted: false },
			orderBy: { createdAt: "asc" },
			select: { id: true },
		}))?.id;

	if (!workbookPath || !startDate || !endDate) {
		throw new Error("Usage: --workbook=<xlsx> --start=YYYY-MM-DD --end=YYYY-MM-DD [--apply]");
	}
	if (!organizationId) throw new Error("No organization found.");

	fs.mkdirSync(outputDir, { recursive: true });

	const before = {
		attendance: await prisma.attendance.count({
			where: {
				organizationId,
				isDeleted: false,
				date: { gte: dateOnlyUtc(startDate), lte: new Date(`${endDate}T23:59:59.999Z`) },
			},
		}),
		timesheets: await prisma.timesheet.groupBy({
			by: ["status"],
			where: {
				organizationId,
				isDeleted: false,
				payrollPeriod: {
					is: {
						startDate: dateOnlyUtc(startDate),
						endDate: dateOnlyUtc(endDate),
					},
				},
			},
			_count: { _all: true },
		}),
	};

	const punchRead = readPunchGroups(path.resolve(workbookPath), startDate, endDate);
	const employees = await prisma.employee.findMany({
		where: { organizationId, isDeleted: false },
		select: { id: true, employeeId: true, deviceEmpId: true },
	});
	const byEmployeeCode = new Map(employees.map((employee) => [normalizeCode(employee.employeeId), employee]));
	const byDeviceCode = new Map(
		employees.filter((employee) => employee.deviceEmpId).map((employee) => [normalizeCode(employee.deviceEmpId), employee]),
	);

	const rows = [];
	const unmatched = [];
	for (const group of punchRead.groups) {
		const employee = byDeviceCode.get(group.code) || byEmployeeCode.get(group.code);
		if (!employee) {
			unmatched.push({ code: group.code, date: group.dateKey, punches: group.punches.length });
			continue;
		}
		group.punches.sort((a, b) => a.getTime() - b.getTime());
		rows.push({
			employeeId: group.code,
			date: dateOnlyUtc(group.dateKey),
			timeIn: group.punches[0] || null,
			timeOut: group.punches.length > 1 ? group.punches[group.punches.length - 1] : null,
			status: group.punches.length > 1 ? "PRESENT" : "INCOMPLETE",
			notes: `new-cutoff biometrics import dry-run source ${path.basename(workbookPath)}`,
		});
	}

	const dryRunResult = {
		mode: apply ? "apply" : "dry-run",
		workbookPath: path.resolve(workbookPath),
		sheets: punchRead.workbookSheets,
		rawRows: punchRead.rawRows,
		period: { startDate, endDate },
		before,
		groupedEmployeeDays: punchRead.groups.length,
		importableRows: rows.length,
		unmatchedRows: unmatched.length,
		unmatchedSample: unmatched.slice(0, 100),
		skippedSample: punchRead.skipped,
		createTimesheets,
	};
	fs.writeFileSync(path.join(outputDir, "biometrics-attendance-dry-run.json"), JSON.stringify(dryRunResult, null, 2));

	if (!apply) {
		console.log(JSON.stringify(dryRunResult, null, 2));
		return;
	}

	const service = new AttendanceImportService(prisma, organizationId, { createTimesheets });
	const started = await service.importAttendance(rows);
	const progress = await waitForJob(started.jobId);
	const after = {
		attendance: await prisma.attendance.count({
			where: {
				organizationId,
				isDeleted: false,
				date: { gte: dateOnlyUtc(startDate), lte: new Date(`${endDate}T23:59:59.999Z`) },
			},
		}),
		timesheets: await prisma.timesheet.groupBy({
			by: ["status"],
			where: {
				organizationId,
				isDeleted: false,
				payrollPeriod: {
					is: {
						startDate: dateOnlyUtc(startDate),
						endDate: dateOnlyUtc(endDate),
					},
				},
			},
			_count: { _all: true },
		}),
	};
	const applied = { ...dryRunResult, jobId: started.jobId, progress, after };
	fs.writeFileSync(path.join(outputDir, "biometrics-attendance-apply.json"), JSON.stringify(applied, null, 2));
	console.log(JSON.stringify(applied, null, 2));
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.stack || error.message : error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
