import { PrismaClient } from "../generated/prisma";
import {
	mergeOvertimeMetadata,
	readOvertimeCandidateFromMetadata,
} from "../helper/overtime-approval.helper";
import { getOrCreateNormalizedTimesheetConfig } from "../helper/timesheet-config.helper";
import { formatMinutesAsTime } from "../helper/timekeeping.helper";

const prisma = new PrismaClient();

const parseTimeToMinutes = (value?: string | null) => {
	if (!value || value === "0:00") return 0;
	const [hours, minutes] = String(value).split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	return Math.max(0, hours * 60 + minutes);
};

async function main() {
	const dryRun = process.argv.includes("--dry-run");
	const organizations = await prisma.organization.findMany({
		where: { isDeleted: false },
		select: { id: true, name: true },
	});

	let scanned = 0;
	let updated = 0;

	for (const organization of organizations) {
		const config = await getOrCreateNormalizedTimesheetConfig(prisma, organization.id);
		if (config.requireManagerApprovedOvertime === false) {
			console.log(`Skipping ${organization.name}: policy disabled`);
			continue;
		}

		const lines = await prisma.timesheetline.findMany({
			where: {
				organizationId: organization.id,
				isDeleted: false,
				isEffective: true,
				overtimeHours: { not: "0:00" },
			},
			select: {
				id: true,
				overtimeHours: true,
				metadata: true,
			},
		});

		for (const line of lines) {
			scanned += 1;
			const existing = readOvertimeCandidateFromMetadata(line.metadata);
			if (existing.overtimeApprovalStatus === "APPROVED") continue;

			const pendingMinutes =
				existing.pendingOvertimeMinutes || parseTimeToMinutes(line.overtimeHours);
			if (pendingMinutes <= 0) continue;

			const nextMetadata = mergeOvertimeMetadata(line.metadata, {
				overtimeCandidate: true,
				pendingOvertimeMinutes: pendingMinutes,
				pendingOvertimeHours: formatMinutesAsTime(pendingMinutes),
				overtimeApprovalStatus: existing.overtimeApprovalStatus || "NONE",
			});

			if (!dryRun) {
				await prisma.timesheetline.update({
					where: { id: line.id },
					data: {
						overtimeHours: "0:00",
						metadata: nextMetadata as any,
					},
				});
			}
			updated += 1;
		}
	}

	console.log(
		`${dryRun ? "[dry-run] " : ""}Scanned ${scanned} lines; ${updated} moved to pending OT candidates.`,
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