import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma";
import { generateDailyBreakdown, generateTimesheetSummary } from "../helper/timekeeping.helper";

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

function dateOnlyUtc(key: string) {
	return new Date(`${key}T00:00:00.000Z`);
}

function endOfDayUtc(key: string) {
	return new Date(`${key}T23:59:59.999Z`);
}

function dateKey(value: Date) {
	return value.toISOString().slice(0, 10);
}

function lineStatus(day: any) {
	return String(day?.status || "").toUpperCase() || "PRESENT";
}

async function main() {
	const payrollPeriodId = arg("payrollPeriodId");
	const startDate = arg("start");
	const endDate = arg("end");
	const outputDir = path.resolve(arg("output-dir") || "../.runtime/fast-new-cutoff-timesheets");
	const apply = hasFlag("apply");
	if (!payrollPeriodId || !startDate || !endDate) {
		throw new Error("Usage: --payrollPeriodId=<id> --start=YYYY-MM-DD --end=YYYY-MM-DD [--apply]");
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
		select: { id: true, code: true, status: true },
	});
	if (!payrollPeriod) throw new Error(`Payroll period not found: ${payrollPeriodId}`);

	const attendances = await prisma.attendance.findMany({
		where: {
			organizationId,
			isDeleted: false,
			isEffective: true,
			date: { gte: dateOnlyUtc(startDate), lte: endOfDayUtc(endDate) },
		},
		include: {
			employee: {
				select: {
					id: true,
					employeeId: true,
					person: { select: { personalInfo: true } },
					departmentId: true,
					department: { select: { id: true, name: true } },
					reportToId: true,
					workforceSource: true,
					agencyId: true,
				},
			},
		},
		orderBy: [{ employeeId: "asc" }, { date: "asc" }],
	});
	const byEmployee = new Map<string, typeof attendances>();
	for (const attendance of attendances) {
		const bucket = byEmployee.get(attendance.employeeId) || [];
		bucket.push(attendance);
		byEmployee.set(attendance.employeeId, bucket);
	}

	const existingTimesheets = await prisma.timesheet.findMany({
		where: {
			organizationId,
			payrollPeriodId,
			isDeleted: false,
			employeeId: { in: Array.from(byEmployee.keys()) },
		},
		select: { id: true, employeeId: true, status: true },
	});
	const existingByEmployee = new Map(existingTimesheets.map((timesheet) => [timesheet.employeeId, timesheet]));
	const missingEmployeeIds = Array.from(byEmployee.keys()).filter((employeeId) => !existingByEmployee.has(employeeId));
	const dryRun = {
		mode: apply ? "apply" : "dry-run",
		payrollPeriod,
		attendanceRows: attendances.length,
		employeesWithAttendance: byEmployee.size,
		existingTimesheets: existingTimesheets.length,
		wouldCreateTimesheets: missingEmployeeIds.length,
	};
	fs.writeFileSync(path.join(outputDir, "fast-timesheets-dry-run.json"), JSON.stringify(dryRun, null, 2));
	if (!apply) {
		console.log(JSON.stringify(dryRun, null, 2));
		return;
	}

	let createdTimesheets = 0;
	let createdLines = 0;
	const errors = [];
	let index = 0;
	for (const employeeId of missingEmployeeIds) {
		index += 1;
		const employeeAttendances = byEmployee.get(employeeId) || [];
		if (!employeeAttendances.length) continue;
		const employee = employeeAttendances[0].employee;
		const summary = generateTimesheetSummary(employeeAttendances);
		const breakdown = generateDailyBreakdown(employeeAttendances);
		try {
			const timesheet = await prisma.timesheet.create({
				data: {
					code: `NCJ15-${employee.employeeId}-${Date.now()}-${index}`,
					organizationId,
					employeeId,
					payrollPeriodId,
					status: "APPROVED",
					submittedAt: new Date(),
					approvalDate: new Date(),
					notes: "Fast approved timesheet seed from new-cutoff biometrics attendance.",
					totalDays: employeeAttendances.length,
					totalHoursWorked: summary.totalHoursWorked,
					totalRegularHours: summary.totalRegularHours,
					totalOvertimeHours: summary.totalOvertimeHours,
					totalUndertimeHours: summary.totalUndertimeHours,
					totalLateHours: summary.totalLateHours,
					totalEarlyOutHours: summary.totalEarlyOutHours,
					metadata: summary.metadata,
					attendances: {
						connect: employeeAttendances.map((attendance) => ({ id: attendance.id })),
					},
				},
			});
			createdTimesheets += 1;
			const attendanceByDate = new Map(employeeAttendances.map((attendance) => [dateKey(attendance.date!), attendance]));
			const lines = breakdown.map((day: any) => {
				const key = dateKey(day.date);
				const attendance = attendanceByDate.get(key);
				return {
					organizationId,
					employeeId,
					timesheetId: timesheet.id,
					payrollPeriodId,
					attendanceId: attendance?.id || null,
					date: dateOnlyUtc(key),
					timeIn: day.timeIn || null,
					timeOut: day.timeOut || null,
					status: lineStatus(day),
					behaviorFlags: [],
					scheduleSnapshot: day.scheduleSnapshot || attendance?.scheduleSnapshot || null,
					hoursWorked: day.hoursWorked || "0:00",
					regularHours: day.regularHours || "0:00",
					overtimeHours: day.overtimeHours || "0:00",
					undertimeHours: day.undertimeHours || "0:00",
					lateHours: day.lateHours || "0:00",
					earlyOutHours: day.earlyOutHours || "0:00",
					breakMinutes: day.breakMinutes ?? attendance?.breakMinutes ?? null,
					metadata: {
						source: "fast-new-cutoff-biometrics-seed",
						attendanceId: attendance?.id || null,
						day,
					},
					primaryMarker: lineStatus(day) === "PRESENT" ? "HOURS" : lineStatus(day),
					isManualEntry: false,
					isVirtual: false,
					revisionNo: 1,
					isEffective: true,
					ledgerType: "SNAPSHOT",
					employeeCodeSnapshot: employee.employeeId,
					employeeNameSnapshot:
						`${(employee.person?.personalInfo as any)?.firstName || ""} ${(employee.person?.personalInfo as any)?.lastName || ""}`.trim() ||
						employee.employeeId,
					departmentIdSnapshot: employee.departmentId || employee.department?.id || null,
					departmentNameSnapshot: employee.department?.name || null,
					reportToIdSnapshot: employee.reportToId || null,
					workforceSourceSnapshot: employee.workforceSource || "DIRECT",
					agencyIdSnapshot: employee.agencyId || null,
				};
			});
			if (lines.length) {
				await prisma.timesheetline.createMany({ data: lines as any[] });
				createdLines += lines.length;
			}
		} catch (error) {
			if (errors.length < 100) errors.push({ employeeId, error: error instanceof Error ? error.message : String(error) });
		}
	}

	const after = {
		timesheets: await prisma.timesheet.groupBy({
			by: ["status"],
			where: { organizationId, payrollPeriodId, isDeleted: false },
			_count: { _all: true },
		}),
		lines: await prisma.timesheetline.count({
			where: { organizationId, payrollPeriodId, isDeleted: false },
		}),
	};
	const result = { ...dryRun, createdTimesheets, createdLines, errors, after };
	fs.writeFileSync(path.join(outputDir, "fast-timesheets-apply.json"), JSON.stringify(result, null, 2));
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
