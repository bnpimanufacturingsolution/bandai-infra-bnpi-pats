import type { PrismaClient } from "../../generated/prisma";

export type EffectiveTimesheetLineConflict = {
	date: string;
	lineIds: string[];
	timesheetId: string;
};

export type PaidPayrollSnapshotViolation = {
	id: string;
	reasons: string[];
};

function businessDateKey(value: Date) {
	return value.toISOString().slice(0, 10);
}

export async function findEffectiveTimesheetLineConflicts(
	prisma: PrismaClient,
	organizationId: string,
): Promise<EffectiveTimesheetLineConflict[]> {
	const lines = await prisma.timesheetline.findMany({
		where: {
			isDeleted: false,
			isEffective: true,
			organizationId,
		},
		select: {
			date: true,
			id: true,
			timesheetId: true,
		},
		orderBy: [{ timesheetId: "asc" }, { date: "asc" }, { id: "asc" }],
	});

	const grouped = new Map<string, EffectiveTimesheetLineConflict>();
	for (const line of lines) {
		const date = businessDateKey(line.date);
		const key = `${line.timesheetId}:${date}`;
		const group =
			grouped.get(key) ||
			({
				date,
				lineIds: [],
				timesheetId: line.timesheetId,
			} satisfies EffectiveTimesheetLineConflict);
		group.lineIds.push(line.id);
		grouped.set(key, group);
	}

	return Array.from(grouped.values()).filter((group) => group.lineIds.length > 1);
}

export async function findPaidPayrollSnapshotViolations(
	prisma: PrismaClient,
	organizationId: string,
): Promise<PaidPayrollSnapshotViolation[]> {
	const payrolls = await prisma.employeePayroll.findMany({
		where: {
			isDeleted: false,
			isPaid: true,
			organizationId,
		},
		select: {
			id: true,
			snapshotLockReason: true,
			snapshotLockedAt: true,
			snapshotLockedBy: true,
			timesheetSnapshot: true,
		},
		orderBy: { id: "asc" },
	});

	return payrolls
		.map((payroll) => {
			const reasons: string[] = [];
			if (payroll.timesheetSnapshot == null) {
				reasons.push("MISSING_TIMESHEET_SNAPSHOT");
			}
			if (!payroll.snapshotLockedAt) {
				reasons.push("MISSING_SNAPSHOT_LOCKED_AT");
			}
			if (!payroll.snapshotLockedBy) {
				reasons.push("MISSING_SNAPSHOT_LOCKED_BY");
			}
			if (!payroll.snapshotLockReason) {
				reasons.push("MISSING_SNAPSHOT_LOCK_REASON");
			}
			return { id: payroll.id, reasons };
		})
		.filter((violation) => violation.reasons.length > 0);
}
