import { PrismaClient } from "../generated/prisma";
import {
	buildPeriodsFromRange,
	computePayDateFromEndDate,
	getMergedCycleRules,
} from "../app/payrollperiod/payroll-cycle.helper";

const prisma = new PrismaClient();
const DEFAULT_ORG_ID = "69b7bf258c551e7562b01d8e";

function getArgValue(args: string[], flag: string): string | null {
	const index = args.indexOf(flag);
	if (index !== -1 && index + 1 < args.length) return args[index + 1];
	const equalsToken = `${flag}=`;
	const match = args.find((arg) => arg.startsWith(equalsToken));
	if (match) return match.slice(equalsToken.length);
	return null;
}

function toStamp(value: Date) {
	return value.toISOString();
}

function isSameDateTime(a: Date, b: Date) {
	return toStamp(a) === toStamp(b);
}

async function getHolidayDateKeys(
	organizationId: string,
	rangeStart: Date,
	rangeEnd: Date,
): Promise<Set<string>> {
	const holidays = await prisma.calendarItem.findMany({
		where: {
			organizationId,
			type: "HOLIDAY",
			status: "ACTIVE",
			startDate: { lte: rangeEnd },
			endDate: { gte: rangeStart },
		},
		select: { startDate: true, endDate: true },
	});

	const keys = new Set<string>();
	for (const holiday of holidays) {
		const cursor = new Date(
			Date.UTC(
				holiday.startDate.getUTCFullYear(),
				holiday.startDate.getUTCMonth(),
				holiday.startDate.getUTCDate(),
			),
		);
		const end = new Date(
			Date.UTC(
				holiday.endDate.getUTCFullYear(),
				holiday.endDate.getUTCMonth(),
				holiday.endDate.getUTCDate(),
			),
		);
		while (cursor <= end) {
			keys.add(cursor.toISOString().slice(0, 10));
			cursor.setUTCDate(cursor.getUTCDate() + 1);
		}
	}
	return keys;
}

async function run() {
	const args = process.argv.slice(2);
	const requestedOrgId = getArgValue(args, "-org") || DEFAULT_ORG_ID;
	const frequencyArg =
		getArgValue(args, "-frequency") ||
		getArgValue(args, "--frequency") ||
		getArgValue(args, "--freq") ||
		getArgValue(args, "-freq");
	const forceRetroactiveArg =
		getArgValue(args, "-forceRetroactive") || getArgValue(args, "--forceRetroactive");
	const executeArg = getArgValue(args, "-execute") || getArgValue(args, "--execute");

	const frequency = (frequencyArg || "SEMI_MONTHLY") as
		| "SEMI_MONTHLY"
		| "WEEKLY"
		| "BIWEEKLY"
		| "MONTHLY"
		| "QUARTERLY"
		| "ANNUALLY"
		| "DAILY";
	const forceRetroactive = (forceRetroactiveArg || "true").toLowerCase() === "true";
	const execute = (executeArg || "true").toLowerCase() !== "false";

	const orgConfig =
		(await prisma.payrollCycleConfig.findFirst({
			where: requestedOrgId
				? { organizationId: requestedOrgId, isDeleted: false }
				: { isDeleted: false },
			orderBy: { createdAt: "asc" },
		})) || null;

	if (!orgConfig) {
		throw new Error("No payroll cycle config found.");
	}

	const organizationId = orgConfig.organizationId;
	const cycleConfig = {
		defaultPayFrequency: orgConfig.defaultPayFrequency,
		payDateOffsetDays: orgConfig.payDateOffsetDays,
		businessDayRule: orgConfig.businessDayRule,
		includeHolidaysInBusinessDayCheck: orgConfig.includeHolidaysInBusinessDayCheck,
		cycleRules: orgConfig.cycleRules,
	};

	const periods = await prisma.payrollPeriod.findMany({
		where: {
			organizationId,
			payFrequency: frequency,
			isDeleted: false,
		},
		orderBy: [{ startDate: "asc" }, { periodNumber: "asc" }],
	});

	if (!periods.length) {
		throw new Error(`No ${frequency} payroll periods found for organization ${organizationId}.`);
	}

	const minStart = periods[0].startDate;
	const maxEnd = periods[periods.length - 1].endDate;
	const holidayKeys = await getHolidayDateKeys(
		organizationId,
		minStart,
		new Date(maxEnd.getTime() + 1000 * 60 * 60 * 24 * 60),
	);

	const mergedRules = getMergedCycleRules(cycleConfig as any);
	console.log("=== Bulk Adjust Function Test ===");
	console.log(`defaultOrgId=${DEFAULT_ORG_ID}`);
	console.log(`organizationId=${organizationId}`);
	console.log(`frequency=${frequency}`);
	console.log(`forceRetroactive=${forceRetroactive}`);
	console.log(`execute=${execute} (default true)`);
	if (frequency === "SEMI_MONTHLY") {
		console.log(
			`rules: firstStartDay=${mergedRules.SEMI_MONTHLY.firstStartDay}, secondStartDay=${mergedRules.SEMI_MONTHLY.secondStartDay}, secondEndDay=${mergedRules.SEMI_MONTHLY.secondEndDay}`,
		);
	}

	let updated = 0;
	let skipped = 0;
	let unchanged = 0;

	for (const period of periods) {
		if (!forceRetroactive && ["COMPLETED", "CLOSED"].includes(period.status)) {
			skipped += 1;
			continue;
		}

		let nextStart = period.startDate;
		let nextEnd = period.endDate;
		let nextCutoffDay = period.cutoffDay || undefined;
		let nextPeriodNumber = period.periodNumber || undefined;
		let nextName = period.name;
		let nextNotes = period.notes || undefined;
		let nextCode = period.code || undefined;

		if (period.payFrequency === "SEMI_MONTHLY") {
			const monthWindowStart = new Date(
				Date.UTC(period.startDate.getUTCFullYear(), period.startDate.getUTCMonth() - 1, 1, 0, 0, 0, 0),
			);
			const monthWindowEnd = new Date(
				Date.UTC(period.startDate.getUTCFullYear(), period.startDate.getUTCMonth() + 2, 0, 23, 59, 59, 999),
			);
			const projected = buildPeriodsFromRange({
				frequency: "SEMI_MONTHLY",
				rangeStart: monthWindowStart,
				rangeEnd: monthWindowEnd,
				config: cycleConfig as any,
				holidayKeys,
			}).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

			const byPeriodNumber = projected.find(
				(row) =>
					row.periodNumber === period.periodNumber &&
					row.startDate.getUTCMonth() === period.startDate.getUTCMonth(),
			);
			const nearest = projected
				.slice()
				.sort(
					(a, b) =>
						Math.abs(a.startDate.getTime() - period.startDate.getTime()) -
						Math.abs(b.startDate.getTime() - period.startDate.getTime()),
				)[0];
			const resolved = byPeriodNumber || nearest;
			if (resolved) {
				nextStart = resolved.startDate;
				nextEnd = resolved.endDate;
				nextCutoffDay = resolved.cutoffDay;
				nextPeriodNumber = resolved.periodNumber;
				nextName = resolved.name;
				nextNotes = resolved.notes;
				nextCode = resolved.code;
			}
		}

		const nextPayDate = computePayDateFromEndDate(nextEnd, cycleConfig as any, holidayKeys);
		const noChange =
			isSameDateTime(period.startDate, nextStart) &&
			isSameDateTime(period.endDate, nextEnd) &&
			isSameDateTime(period.payDate, nextPayDate) &&
			(period.cutoffDay || undefined) === nextCutoffDay &&
			(period.periodNumber || undefined) === nextPeriodNumber &&
			(period.name || "") === (nextName || "") &&
			(period.notes || "") === (nextNotes || "") &&
			(period.code || "") === (nextCode || "");

		if (noChange) {
			unchanged += 1;
			continue;
		}

		if (execute) {
			await prisma.payrollPeriod.update({
				where: { id: period.id },
				data: {
					startDate: nextStart,
					endDate: nextEnd,
					payDate: nextPayDate,
					cutoffDay: nextCutoffDay,
					periodNumber: nextPeriodNumber,
					name: nextName,
					notes: nextNotes,
					code: nextCode,
					generationMetadata: {
						source: "PAYROLL_CYCLE_CONFIG_BULK_ADJUST_FUNCTION_TEST",
						ruleVersion: 1,
						payDateOffsetDays: cycleConfig.payDateOffsetDays,
						businessDayRule: cycleConfig.businessDayRule,
						includeHolidaysInBusinessDayCheck:
							cycleConfig.includeHolidaysInBusinessDayCheck,
					},
				},
			});
		}
		updated += 1;
	}

	console.log("\nResult:");
	console.log(`total=${periods.length}`);
	console.log(`updated=${updated}`);
	console.log(`skipped=${skipped}`);
	console.log(`unchanged=${unchanged}`);
	console.log(`mode=${execute ? "execute (writes applied)" : "preview only (no writes)"}`);
}

run()
	.catch((error) => {
		console.error("Bulk adjust function test failed.");
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
