import { PrismaClient } from "../generated/prisma";
import {
	buildNonOverlappingWorkBreakSlots,
	calculateShiftHour,
} from "../helper/schedule-normalization.helper";

const prisma = new PrismaClient();
const execute = process.argv.includes("--execute");
const worksharingShiftCodePattern = /^WS_\d{4}_\d{4}_BR_\d{4}_\d{4}$/;
const worksharingTemplateCodePattern =
	/^(?:BNPI_WS_MON_SAT|BNPI_SCHED_MON_SAT)_WS_\d{4}_\d{4}_BR_\d{4}_\d{4}$/;

type Slot = {
	type?: string | null;
	label?: string | null;
	startTime?: string | null;
	endTime?: string | null;
};

const slotKey = (slots: Slot[]) =>
	slots
		.map((slot) =>
			[
				String(slot?.type || "").toLowerCase(),
				slot?.startTime || "",
				slot?.endTime || "",
			].join(":"),
		)
		.join("|");

const normalizeSnapshot = (snapshot: any) => {
	if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
		return { value: snapshot, changed: false };
	}
	const slots = Array.isArray(snapshot.timeSlots) ? snapshot.timeSlots : [];
	const workSlots = slots.filter((slot: Slot) => String(slot?.type || "").toLowerCase() === "work");
	const breakSlots = slots.filter((slot: Slot) => String(slot?.type || "").toLowerCase() === "break");
	if (workSlots.length !== 1 || breakSlots.length !== 1) {
		return { value: snapshot, changed: false };
	}
	const workSlot = workSlots[0];
	const breakSlot = breakSlots[0];
	if (!workSlot?.startTime || !workSlot?.endTime || !breakSlot?.startTime || !breakSlot?.endTime) {
		return { value: snapshot, changed: false };
	}

	const timeSlots = buildNonOverlappingWorkBreakSlots({
		startTime: workSlot.startTime,
		endTime: workSlot.endTime,
		breakStartTime: breakSlot.startTime,
		breakEndTime: breakSlot.endTime,
	});
	if (!timeSlots.length || slotKey(timeSlots) === slotKey(slots)) {
		return { value: snapshot, changed: false };
	}

	const value = {
		...snapshot,
		timeSlots,
		shiftHour: calculateShiftHour({ ...snapshot, timeSlots }),
	};
	return { value, changed: true };
};

async function repairShiftTypes() {
	const rows = await (prisma as any).shiftType.findMany({
		where: { code: { contains: "_BR_" }, isDeleted: false },
	});
	let changed = 0;
	for (const shiftType of rows) {
		if (!worksharingShiftCodePattern.test(String(shiftType.code || ""))) continue;
		const { value, changed: didChange } = normalizeSnapshot(shiftType);
		if (!didChange) continue;
		changed += 1;
		if (execute) {
			await (prisma as any).shiftType.update({
				where: { id: shiftType.id },
				data: {
					timeSlots: value.timeSlots,
					shiftHour: value.shiftHour,
				},
			});
		}
	}
	return { scanned: rows.length, changed };
}

async function repairScheduleTemplates() {
	const rows = await (prisma as any).scheduleTemplate.findMany({
		where: { code: { contains: "_BR_" }, isDeleted: false },
	});
	let changed = 0;
	for (const template of rows) {
		if (!worksharingTemplateCodePattern.test(String(template.code || ""))) continue;
		const pattern = Array.isArray(template.pattern) ? template.pattern : [];
		let templateChanged = false;
		const nextPattern = pattern.map((day: any) => {
			const { value, changed: didChange } = normalizeSnapshot(day?.shiftSnapshot);
			if (!didChange) return day;
			templateChanged = true;
			return {
				...day,
				shiftSnapshot: value,
				shiftHour: calculateShiftHour(value),
			};
		});
		if (!templateChanged) continue;
		changed += 1;
		const totalHour = Number(
			nextPattern
				.reduce((total: number, day: any) => total + Math.max(0, Number(day?.shiftHour || 0)), 0)
				.toFixed(2),
		);
		const totalDay = nextPattern.filter((day: any) => Number(day?.shiftHour || 0) > 0).length;
		if (execute) {
			await (prisma as any).scheduleTemplate.update({
				where: { id: template.id },
				data: { pattern: nextPattern, totalHour, totalDay },
			});
		}
	}
	return { scanned: rows.length, changed };
}

async function repairEmployeeEmbeddedSchedules() {
	const rows = await (prisma as any).employee.findMany({
		where: { isDeleted: false },
		select: { id: true, employeeId: true, embeddedSchedule: true },
	});
	let changed = 0;
	for (const employee of rows) {
		const schedule = employee.embeddedSchedule;
		if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) continue;
		if (!worksharingTemplateCodePattern.test(String(schedule.templateCode || ""))) continue;
		const pattern = Array.isArray(schedule.pattern) ? schedule.pattern : [];
		let scheduleChanged = false;
		const nextPattern = pattern.map((day: any) => {
			const { value, changed: didChange } = normalizeSnapshot(day?.shiftSnapshot);
			if (!didChange) return day;
			scheduleChanged = true;
			return { ...day, shiftSnapshot: value };
		});
		if (!scheduleChanged) continue;
		changed += 1;
		if (execute) {
			await (prisma as any).employee.update({
				where: { id: employee.id },
				data: {
					embeddedSchedule: {
						...schedule,
						pattern: nextPattern,
					},
				},
			});
		}
	}
	return { scanned: rows.length, changed };
}

async function main() {
	const [shiftTypes, templates, employees] = await Promise.all([
		repairShiftTypes(),
		repairScheduleTemplates(),
		repairEmployeeEmbeddedSchedules(),
	]);
	console.log(
		JSON.stringify(
			{
				mode: execute ? "execute" : "dry-run",
				shiftTypes,
				templates,
				employees,
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
