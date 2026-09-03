import { PrismaClient } from "../generated/prisma";
import {
	buildAttendanceTimekeepingFields,
	fetchAttendanceEmployeeSnapshotFields,
	getDateKeyInBusinessTimeZone,
} from "../helper/attendance.helper";
import {
	applyAttendanceToObligation,
	materializeTimesheetLinesFromObligations,
} from "../helper/attendance-obligation.helper";
import { calculateAttendanceObligationDetailed } from "../helper/attendance-obligation-metrics.helper";
import { emitAttendanceRealtimeEvent } from "../helper/attendance-realtime.helper";
import { resolveEffectiveShift } from "../helper/employee-schedule.helper";
import {
	calculateTimekeeping,
	deriveBehaviorFlags,
	determineAttendanceStatus,
} from "../helper/timekeeping.helper";

const prisma = new PrismaClient();
const ROLLBACK = "DRY_RUN_ROLLBACK";

const parseArgs = () => {
	const options: Record<string, string> = {};
	for (const arg of process.argv.slice(2)) {
		if (!arg.startsWith("--") || !arg.includes("=")) continue;
		const [key, ...rest] = arg.slice(2).split("=");
		options[key] = rest.join("=");
	}
	return options;
};

const dateOnlyUtc = (dateKey: string) => new Date(`${dateKey}T00:00:00.000Z`);

const minutesToTime = (minutes: number) => {
	const normalized = ((minutes % 1440) + 1440) % 1440;
	const hours = Math.floor(normalized / 60);
	const mins = normalized % 60;
	return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const timeToMinutes = (value?: string | null) => {
	if (!value) return null;
	const [hours, minutes] = value.split(":").map(Number);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
	return hours * 60 + minutes;
};

const manilaDateTime = (dateKey: string, minutes: number) => {
	const [year, month, day] = dateKey.split("-").map(Number);
	const normalized = ((minutes % 1440) + 1440) % 1440;
	const hours = Math.floor(normalized / 60);
	const mins = normalized % 60;
	return new Date(Date.UTC(year, month - 1, day, hours - 8, mins, 0, 0));
};

const fail = (message: string): never => {
	throw new Error(message);
};

const getOvertimeFlagThresholdMinutes = async (tx: PrismaClient, organizationId: string) => {
	const config = await tx.timesheetConfig.findUnique({
		where: { organizationId },
		select: { overtimeFlagThresholdMinutes: true } as any,
	});
	return Number((config as any)?.overtimeFlagThresholdMinutes || 60);
};

const pickScenario = async (
	tx: PrismaClient,
	options: { dateKey: string; employeeId?: string; organizationId?: string },
) => {
	const date = dateOnlyUtc(options.dateKey);
	const period = await tx.payrollPeriod.findFirst({
		where: {
			...(options.organizationId ? { organizationId: options.organizationId } : {}),
			isDeleted: false,
			status: { in: ["OPEN", "DRAFT"] as any },
			startDate: { lte: date },
			endDate: { gte: date },
		},
		orderBy: [{ status: "desc" }, { startDate: "desc" }],
	});
	if (!period) {
		fail(`No OPEN/DRAFT payroll period covers ${options.dateKey}`);
	}

	const obligation = await (tx as any).attendanceObligation.findFirst({
		where: {
			organizationId: period.organizationId,
			payrollPeriodId: period.id,
			date,
			isDeleted: false,
			...(options.employeeId ? { employeeId: options.employeeId } : {}),
			phase: { notIn: ["LOCKED", "PAID"] },
			OR: [{ timesheetId: null }, { timesheet: { status: "DRAFT" } }],
		},
		include: {
			employee: { select: { id: true, employeeId: true } },
			timesheet: { select: { id: true, code: true, status: true } },
		},
		orderBy: { updatedAt: "desc" },
	});
	if (!obligation) {
		fail(`No live/draft attendance obligation found for ${options.dateKey}`);
	}

	return { period, obligation };
};

const main = async () => {
	const options = parseArgs();
	const dateKey = options.date || getDateKeyInBusinessTimeZone(new Date());
	const result: any = {};

	try {
		await prisma.$transaction(
			async (tx) => {
				const { period, obligation: beforeObligation } = await pickScenario(tx as any, {
					dateKey,
					employeeId: options.employeeId,
					organizationId: options.organizationId,
				});
				const organizationId = period.organizationId;
				const employeeId = beforeObligation.employeeId;
				const date = dateOnlyUtc(dateKey);
				const schedule = await resolveEffectiveShift(tx as any, {
					organizationId,
					employeeId,
					date,
				});
				if (!schedule || schedule.isOff) {
					fail(`Selected employee-day has no working schedule for ${dateKey}`);
				}

				const startMinutes = timeToMinutes(schedule.startTime) ?? 8 * 60;
				const endMinutes = timeToMinutes(schedule.endTime) ?? 17 * 60;
				const graceLateMinutes = Math.max(0, Number(schedule.graceLateMinutes || 0));
				const lateOffsetMinutes = graceLateMinutes + 20;
				const earlyOutOffsetMinutes = 35;
				const timeIn = manilaDateTime(dateKey, startMinutes + lateOffsetMinutes);
				const timeOut = manilaDateTime(dateKey, endMinutes - earlyOutOffsetMinutes);
				const calc = calculateTimekeeping(timeIn, timeOut, schedule, date);
				const status = determineAttendanceStatus(calc, true);
				const overtimeFlagThresholdMinutes = await getOvertimeFlagThresholdMinutes(
					tx as any,
					organizationId,
				);
				const behaviorFlags = deriveBehaviorFlags({
					timeIn,
					timeOut,
					schedule,
					date,
					overtimeThresholdMinutes: overtimeFlagThresholdMinutes,
				});
				const attendance = await tx.attendance.create({
					data: {
						organizationId,
						employeeId,
						date,
						timeIn,
						timeOut,
						status,
						behaviorFlags,
						scheduleSnapshot: schedule as any,
						isManualEntry: true,
						deviceInfo: {
							source: "dry-run-attendance-clock-contract",
							dryRun: true,
						},
						notes: "dry-run attendance clock contract rollback",
						...(await fetchAttendanceEmployeeSnapshotFields(tx as any, employeeId)),
						...buildAttendanceTimekeepingFields(calc),
					} as any,
				});
				const appliedObligation = await applyAttendanceToObligation(tx as any, {
					organizationId,
					employeeId,
					attendanceId: attendance.id,
					businessDate: dateKey,
				});
				if (!appliedObligation) fail("Attendance did not apply to an obligation");

				const emitted: Array<{ room: string; event: string; payload: any }> = [];
				const io = {
					to(room: string) {
						return {
							emit(event: string, payload: any) {
								emitted.push({ room, event, payload });
							},
						};
					},
				};
				const socketPayload = emitAttendanceRealtimeEvent(io as any, {
					attendance,
					obligation: appliedObligation,
					action: "clock_out_updated",
					source: "DRY_RUN",
				});

				const metrics = await calculateAttendanceObligationDetailed(
					tx as any,
					organizationId,
					date,
					date,
					50,
					1,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					employeeId,
					undefined,
				);
				const metricRecord = metrics.records.find(
					(row: any) => row.attendanceId === attendance.id || row.employeeRefId === employeeId,
				);
				if (!metricRecord) fail("HR attendance metrics did not return the updated employee-day");

				let timesheet = beforeObligation.timesheet;
				if (!timesheet) {
					timesheet = await tx.timesheet.create({
						data: {
							code: `DRY-RUN-${Date.now()}`,
							organizationId,
							employeeId,
							payrollPeriodId: period.id,
							status: "DRAFT",
							notes: "dry-run attendance contract rollback",
						} as any,
						select: { id: true, code: true, status: true },
					});
				}
				const beforeLineCount = await (tx as any).timesheetline.count({
					where: {
						organizationId,
						employeeId,
						timesheetId: timesheet.id,
						date,
						isDeleted: false,
						isEffective: true,
					},
				});
				await materializeTimesheetLinesFromObligations(tx as any, {
					organizationId,
					employeeId,
					payrollPeriodId: period.id,
					timesheetId: timesheet.id,
					fromDate: date,
					toDate: date,
					skipEnsureAttendanceObligations: true,
				});
				const timesheetLine = await (tx as any).timesheetline.findFirst({
					where: {
						organizationId,
						employeeId,
						timesheetId: timesheet.id,
						date,
						isDeleted: false,
						isEffective: true,
					},
					orderBy: { revisionNo: "desc" },
				});
				if (!timesheetLine) fail("Timesheetline materialization did not create/read an effective line");

				const expected = {
					status: "PRESENT",
					lateHours: buildAttendanceTimekeepingFields(calc).lateHours,
					earlyOutHours: buildAttendanceTimekeepingFields(calc).earlyOutHours,
				};
				if (calc.lateMinutes <= 0) fail("Scenario did not generate late minutes");
				if (calc.earlyOutMinutes <= 0) fail("Scenario did not generate early-out minutes");
				if (attendance.lateHours !== expected.lateHours) fail("Attendance lateHours mismatch");
				if (attendance.earlyOutHours !== expected.earlyOutHours) {
					fail("Attendance earlyOutHours mismatch");
				}
				if (String(appliedObligation.status) !== expected.status) {
					fail(`Obligation status mismatch: ${appliedObligation.status}`);
				}
				if (appliedObligation.lateHours !== expected.lateHours) {
					fail("Obligation lateHours mismatch");
				}
				if (appliedObligation.earlyOutHours !== expected.earlyOutHours) {
					fail("Obligation earlyOutHours mismatch");
				}
				if (metricRecord.storedStatus !== expected.status || metricRecord.status !== expected.status) {
					fail("FE metrics status mismatch");
				}
				if (metricRecord.lateHours !== expected.lateHours) fail("FE metrics lateHours mismatch");
				if (metricRecord.earlyOutHours !== expected.earlyOutHours) {
					fail("FE metrics earlyOutHours mismatch");
				}
				if (timesheetLine.lateHours !== expected.lateHours) {
					fail("Timesheetline lateHours mismatch");
				}
				if (timesheetLine.earlyOutHours !== expected.earlyOutHours) {
					fail("Timesheetline earlyOutHours mismatch");
				}
				if (!emitted.some((item) => item.room === `attendance:org:${organizationId}`)) {
					fail("Socket event did not target the attendance organization room");
				}

				result.ok = true;
				result.dryRunRolledBack = true;
				result.scenario = {
					organizationId,
					employeeId,
					employeeCode: beforeObligation.employee?.employeeId || null,
					date: dateKey,
					schedule: {
						startTime: schedule.startTime,
						endTime: schedule.endTime,
						graceLateMinutes,
					},
					clock: {
						timeIn: timeIn.toISOString(),
						timeOut: timeOut.toISOString(),
						manilaTimeIn: minutesToTime(startMinutes + lateOffsetMinutes),
						manilaTimeOut: minutesToTime(endMinutes - earlyOutOffsetMinutes),
					},
				};
				result.sourceOfTruth = {
					attendance: {
						id: attendance.id,
						status: attendance.status,
						lateMinutes: attendance.lateMinutes,
						earlyOutMinutes: attendance.earlyOutMinutes,
						lateHours: attendance.lateHours,
						earlyOutHours: attendance.earlyOutHours,
						behaviorFlags: attendance.behaviorFlags,
					},
					attendanceObligation: {
						id: appliedObligation.id,
						status: appliedObligation.status,
						phase: appliedObligation.phase,
						attendanceId: appliedObligation.attendanceId,
						lateHours: appliedObligation.lateHours,
						earlyOutHours: appliedObligation.earlyOutHours,
						behaviorFlags: appliedObligation.behaviorFlags,
					},
					hrAttendanceMetricsRecord: {
						status: metricRecord.status,
						storedStatus: metricRecord.storedStatus,
						attendanceId: metricRecord.attendanceId,
						lateHours: metricRecord.lateHours,
						earlyOutHours: metricRecord.earlyOutHours,
						behaviorFlags: metricRecord.behaviorFlags,
					},
					socket: {
						payload: socketPayload,
						rooms: emitted.map((item) => item.room),
					},
					timesheetlineAfterMaterialization: {
						id: timesheetLine.id,
						timesheetId: timesheetLine.timesheetId,
						status: timesheetLine.status,
						isEffective: timesheetLine.isEffective,
						revisionNo: timesheetLine.revisionNo,
						attendanceId: timesheetLine.attendanceId,
						lateHours: timesheetLine.lateHours,
						earlyOutHours: timesheetLine.earlyOutHours,
						behaviorFlags: timesheetLine.behaviorFlags,
						beforeLineCount,
					},
				};

				throw new Error(ROLLBACK);
			},
			{ timeout: 60_000 },
		);
	} catch (error: any) {
		if (error?.message !== ROLLBACK) throw error;
	}

	console.log(JSON.stringify(result, null, 2));
};

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
