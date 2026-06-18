import { PrismaClient } from "../generated/prisma";
import {
	recomputeAttendanceObligationsForRange,
} from "../helper/attendance-obligation.helper";
import { resolveEffectiveShift } from "../helper/employee-schedule.helper";
import {
	calculateTimekeeping,
	determineAttendanceStatus,
	deriveBehaviorFlags,
	formatMinutesAsTime,
} from "../helper/timekeeping.helper";

const prisma = new PrismaClient();

const MARKER = "DEMO_BACKDATED_ATTENDANCE_WINDOW";
const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;

function dateKey(date: Date): string {
	return date.toISOString().split("T")[0];
}

function toDateOnlyUtc(value: string | Date): Date {
	const parsed = value instanceof Date ? value : new Date(value);
	return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function yesterdayUtc(): Date {
	const now = new Date();
	const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	today.setUTCDate(today.getUTCDate() - 1);
	return today;
}

function getArg(name: string): string | undefined {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseTimeToMinutes(value?: string | null): number | null {
	if (!value) return null;
	const [hours, minutes] = value.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
	return hours * 60 + minutes;
}

function createDateAtPhilippineMinutes(dateOnly: Date, minutes: number): Date {
	const dayStart = Date.UTC(
		dateOnly.getUTCFullYear(),
		dateOnly.getUTCMonth(),
		dateOnly.getUTCDate(),
		0,
		0,
		0,
		0,
	);
	return new Date(dayStart + (minutes - BUSINESS_UTC_OFFSET_MINUTES) * 60 * 1000);
}

function hashSeed(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function deterministicInt(seed: string, min: number, max: number): number {
	const range = max - min + 1;
	return min + (hashSeed(seed) % range);
}

function toAttendanceScheduleSnapshot(shift: any) {
	return {
		source: shift.source || "template",
		scheduleOverrideId: shift.scheduleOverrideId || null,
		scheduleTemplateId: shift.scheduleTemplateId || null,
		scheduleTemplateName: shift.scheduleTemplateName || null,
		shiftTypeId: shift.shiftTypeId || null,
		shiftTypeCode: shift.shiftTypeCode || null,
		shiftTypeName: shift.shiftTypeName || null,
		templateDay: shift.templateDay ?? null,
		cycleDays: shift.cycleDays ?? null,
		isOff: Boolean(shift.isOff),
		isOvernight: Boolean(shift.isOvernight),
		breakMinutes: shift.breakMinutes ?? null,
		graceLateMinutes: shift.graceLateMinutes ?? null,
		graceEarlyOutMinutes: shift.graceEarlyOutMinutes ?? null,
		startTime: shift.startTime || null,
		endTime: shift.endTime || null,
		timeSlots: Array.isArray(shift.timeSlots) ? shift.timeSlots : [],
		metadata: shift.metadata || null,
	};
}

async function main() {
	const fromDate = toDateOnlyUtc(getArg("from") || "2026-04-01");
	const toDate = toDateOnlyUtc(getArg("to") || yesterdayUtc());
	const organizationId =
		getArg("organizationId") ||
		(
			await prisma.employee.findFirst({
				where: { isDeleted: false },
				select: { organizationId: true },
			})
		)?.organizationId;

	if (!organizationId) {
		throw new Error("No organization found for demo attendance backfill.");
	}

	const employees = await prisma.employee.findMany({
		where: {
			organizationId,
			isDeleted: false,
			OR: [
				{ employmentStatus: { in: ["ACTIVE", "ONBOARDING"] } },
				{ employmentTerminationDate: { gte: fromDate } },
			],
			AND: [
				{
					OR: [
						{ employmentStartDate: null },
						{ employmentStartDate: { lte: toDate } },
					],
				},
			],
		},
		include: { person: true, department: true },
	});

	let created = 0;
	let updated = 0;
	let preservedExisting = 0;
	let intentionallyAbsent = 0;
	let skippedOffDays = 0;

	for (const employee of employees) {
		let cursor = new Date(fromDate);
		const employmentStart = employee.employmentStartDate || employee.employmentHireDate || null;
		while (cursor <= toDate) {
			if (employmentStart && cursor < toDateOnlyUtc(employmentStart)) {
				cursor.setUTCDate(cursor.getUTCDate() + 1);
				continue;
			}

			const shift = await resolveEffectiveShift(prisma, {
				organizationId,
				employeeId: employee.id,
				date: cursor,
			});

			if (!shift || shift.isOff) {
				skippedOffDays += 1;
				cursor.setUTCDate(cursor.getUTCDate() + 1);
				continue;
			}

			const key = dateKey(cursor);
			const seedPrefix = `${employee.employeeId}-${key}`;
			const existing = await prisma.attendance.findFirst({
				where: {
					organizationId,
					employeeId: employee.id,
					isDeleted: false,
					ledgerType: "RAW",
					date: cursor,
				},
				orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
			});

			const isSeededExisting = String(existing?.notes || "").includes(MARKER);
			if (existing && !isSeededExisting) {
				preservedExisting += 1;
				cursor.setUTCDate(cursor.getUTCDate() + 1);
				continue;
			}

			const absenceRoll = deterministicInt(`${seedPrefix}-absence`, 0, 99);
			if (absenceRoll < 14) {
				if (existing && isSeededExisting) {
					await prisma.attendance.delete({ where: { id: existing.id } });
					updated += 1;
				}
				intentionallyAbsent += 1;
				cursor.setUTCDate(cursor.getUTCDate() + 1);
				continue;
			}

			const workSlots = Array.isArray(shift.timeSlots)
				? shift.timeSlots.filter((slot: any) => String(slot?.type).toLowerCase() === "work")
				: [];
			const shiftStartMinutes =
				parseTimeToMinutes(workSlots[0]?.startTime || shift.startTime || "08:00") ?? 8 * 60;
			const shiftEndMinutes =
				parseTimeToMinutes(
					workSlots[workSlots.length - 1]?.endTime || shift.endTime || "17:00",
				) ?? 17 * 60;
			const scheduleEndMinutes =
				Boolean(shift.isOvernight) && shiftEndMinutes <= shiftStartMinutes
					? shiftEndMinutes + 24 * 60
					: shiftEndMinutes;
			const graceLateMinutes = Math.max(0, Number(shift.graceLateMinutes ?? 0));
			const lateRoll = deterministicInt(`${seedPrefix}-late`, 0, 99);
			const timeInOffset =
				lateRoll < 45
					? deterministicInt(`${seedPrefix}-early`, -15, -2)
					: lateRoll < 78
						? deterministicInt(`${seedPrefix}-near`, -3, 7)
						: lateRoll < 92
							? deterministicInt(`${seedPrefix}-grace`, 8, Math.max(8, graceLateMinutes))
							: deterministicInt(`${seedPrefix}-late-heavy`, graceLateMinutes + 1, graceLateMinutes + 25);
			const outRoll = deterministicInt(`${seedPrefix}-out`, 0, 99);
			const timeOutOffset =
				outRoll < 18
					? deterministicInt(`${seedPrefix}-early-out`, -35, -8)
					: outRoll < 82
						? deterministicInt(`${seedPrefix}-normal-out`, -8, 8)
						: deterministicInt(`${seedPrefix}-ot-out`, 10, 75);
			const timeIn = createDateAtPhilippineMinutes(cursor, shiftStartMinutes + timeInOffset);
			const timeOut = createDateAtPhilippineMinutes(
				cursor,
				scheduleEndMinutes + timeOutOffset,
			);
			const calc = calculateTimekeeping(timeIn, timeOut, shift as any, cursor);
			const status = determineAttendanceStatus(calc, true);
			const scheduleSnapshot = toAttendanceScheduleSnapshot(shift);
			const employeeName = [
				(employee.person?.personalInfo as any)?.firstName,
				(employee.person?.personalInfo as any)?.lastName,
			]
				.filter(Boolean)
				.join(" ")
				.trim();

			const data = {
				timeIn,
				timeOut,
				status,
				behaviorFlags: deriveBehaviorFlags({
					timeIn,
					timeOut,
					schedule: shift as any,
					date: cursor,
				}),
				breakMinutes: calc.breakMinutes,
				totalMinutesWorked: calc.totalMinutesWorked,
				regularMinutes: calc.regularMinutes,
				overtimeMinutes: calc.overtimeMinutes,
				undertimeMinutes: calc.undertimeMinutes,
				lateMinutes: calc.lateMinutes,
				earlyOutMinutes: calc.earlyOutMinutes,
				hoursWorked: formatMinutesAsTime(calc.totalMinutesWorked),
				regularHours: formatMinutesAsTime(calc.regularMinutes),
				overtimeHours: formatMinutesAsTime(calc.overtimeMinutes),
				undertimeHours: formatMinutesAsTime(calc.undertimeMinutes),
				lateHours: formatMinutesAsTime(calc.lateMinutes),
				earlyOutHours: formatMinutesAsTime(calc.earlyOutMinutes),
				scheduleSnapshot: { set: scheduleSnapshot } as any,
				isManualEntry: true,
				ledgerType: "RAW" as const,
				isEffective: true,
				employeeCodeSnapshot: employee.employeeId,
				employeeNameSnapshot: employeeName || employee.employeeId,
				departmentIdSnapshot: employee.departmentId || null,
				departmentNameSnapshot: employee.department?.name || null,
				reportToIdSnapshot: employee.reportToId || null,
				workforceSourceSnapshot: employee.workforceSource || null,
				agencyIdSnapshot: employee.agencyId || null,
				notes: `${MARKER}:${key}`,
			};

			if (existing) {
				await prisma.attendance.update({ where: { id: existing.id }, data });
				updated += 1;
			} else {
				await prisma.attendance.create({
					data: {
						organizationId,
						employeeId: employee.id,
						date: cursor,
						...data,
					},
				});
				created += 1;
			}

			cursor.setUTCDate(cursor.getUTCDate() + 1);
		}
	}

	const obligationResult = await recomputeAttendanceObligationsForRange(prisma, {
		organizationId,
		fromDate,
		toDate,
		reason: MARKER,
	});

	console.log(
		JSON.stringify(
			{
				organizationId,
				from: dateKey(fromDate),
				to: dateKey(toDate),
				employees: employees.length,
				created,
				updated,
				preservedExisting,
				intentionallyAbsent,
				skippedOffDays,
				obligations: obligationResult,
			},
			null,
			2,
		),
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
