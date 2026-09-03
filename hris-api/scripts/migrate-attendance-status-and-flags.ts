import { PrismaClient } from "../generated/prisma";
import {
	assertSafeMigrationExecution,
	collectMigrationDatabaseTargets,
	resolveExecutionMode,
} from "./migration/script-safety";

export function parseTimeStringToMinutes(value: string | null | undefined): number {
	if (!value) return 0;
	const [h, m] = value.split(":").map((v) => Number(v || 0));
	if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
	return h * 60 + m;
}

export function deriveFlagsFromHours(
	undertimeHours: string | null | undefined,
	overtimeHours: string | null | undefined,
): Array<"UNDERTIME" | "OVERTIME"> {
	const flags: Array<"UNDERTIME" | "OVERTIME"> = [];
	if (parseTimeStringToMinutes(undertimeHours) > 0) flags.push("UNDERTIME");
	if (parseTimeStringToMinutes(overtimeHours) >= 60) flags.push("OVERTIME");
	return flags;
}

export function deriveAttendanceStatusAndFlags(row: {
	status?: string | null;
	timeIn?: Date | string | null;
	timeOut?: Date | string | null;
	undertimeHours?: string | null;
	overtimeHours?: string | null;
}) {
	const nextStatus =
		row.status === "LEAVE" ? "LEAVE" : row.timeIn && !row.timeOut ? "INCOMPLETE" : "PRESENT";
	const behaviorFlags =
		row.status === "LEAVE" ? [] : deriveFlagsFromHours(row.undertimeHours, row.overtimeHours);
	return { status: nextStatus, behaviorFlags };
}

export async function migrateAttendanceStatusAndFlags() {
	const prisma = new PrismaClient();
	const executionMode = resolveExecutionMode();
	try {
		assertSafeMigrationExecution({
			scriptName: "migrate-attendance-status-and-flags",
			execute: executionMode.execute,
			databaseTargets: collectMigrationDatabaseTargets(),
		});
		console.log("Fetching attendance records for status/flags migration...");
		const records = await prisma.attendance.findMany({
			where: { isDeleted: false },
			select: {
				id: true,
				status: true,
				timeIn: true,
				timeOut: true,
				undertimeHours: true,
				overtimeHours: true,
			},
		});

		console.log(`Found ${records.length} attendance records`);
		let updated = 0;

		for (const row of records) {
			const next = deriveAttendanceStatusAndFlags(row);
			if (!executionMode.execute) continue;

			await prisma.attendance.update({
				where: { id: row.id },
				data: {
					status: next.status,
					behaviorFlags: next.behaviorFlags,
				},
			});
			updated++;
		}

		console.log(
			`Migration complete. ${executionMode.execute ? "Updated" : "Would update"} ${executionMode.execute ? updated : records.length} attendance records.`,
		);
	} catch (error) {
		console.error("Migration failed:", error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

if (require.main === module) {
	migrateAttendanceStatusAndFlags()
		.then(() => process.exit(0))
		.catch(() => process.exit(1));
}
