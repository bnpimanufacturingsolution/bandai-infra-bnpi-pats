import { connectAllDatabases, disconnectAllDatabases, prisma } from "../config/database";
import { runDisciplinaryAutoEscalation } from "../app/cron/cron.service";

const run = async () => {
	await connectAllDatabases();
	const orgId = "cmpxw0mfe00007zws3iypuu9d";
	await runDisciplinaryAutoEscalation(orgId);
	const drafts = await prisma.disciplinaryAction.findMany({
		where: {
			organizationId: orgId,
			status: "DRAFT",
			offenseType: { equals: "ABSENTEEISM", mode: "insensitive" },
		},
		select: { employeeName: true, offenseDate: true, severity: true, status: true, metadata: true },
		orderBy: { createdAt: "desc" },
		take: 25,
	});
	console.log("=== DRAFT absenteeism cases now:", drafts.length, "===");
	for (const d of drafts) {
		const meta = d.metadata as any;
		const rule = meta?.autoRule || {};
		console.log(
			`${d.employeeName} | ${d.offenseDate} | ${d.severity} | window ${rule.occurrenceWindow?.start}..${rule.occurrenceWindow?.end} | days ${rule.absentDays} | source ${rule.source}`,
		);
	}
	await disconnectAllDatabases();
	process.exit(0);
};

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
