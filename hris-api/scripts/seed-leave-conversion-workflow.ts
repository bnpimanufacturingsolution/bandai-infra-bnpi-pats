/**
 * Targeted seed: WF-PAN-LEAVE-CONVERSION workflow template (spec gap M3.1).
 * Idempotent upsert into WorkflowInstance (domain REQUEST, domainRecordId null)
 * for the given organization. Safe to re-run.
 *
 * Run: npx tsx scripts/seed-leave-conversion-workflow.ts [organizationId]
 */
import { PrismaClient } from "../generated/prisma";
import { DEFAULT_REQUEST_WORKFLOW_TEMPLATES } from "../prisma/seeds/requestWorkflowCatalog";

const prisma = new PrismaClient();

(async () => {
	const organizationId =
		process.argv[2] || "cmpxw0mfe00007zws3iypuu9d";
	const template = DEFAULT_REQUEST_WORKFLOW_TEMPLATES.find(
		(t) => t.code === "WF-PAN-LEAVE-CONVERSION",
	);
	if (!template) {
		console.log("TEMPLATE_NOT_FOUND_IN_CATALOG");
		process.exit(1);
	}

	const existing = await prisma.workflowInstance.findFirst({
		where: {
			organizationId,
			domain: "REQUEST",
			domainRecordId: null,
			code: template.code,
			isDeleted: false,
		},
		select: { id: true },
	});

	if (existing) {
		console.log(`ALREADY_SEEDED: ${existing.id}`);
		await prisma.$disconnect();
		process.exit(0);
	}

	const created = await prisma.workflowInstance.create({
		data: {
			organizationId,
			domain: "REQUEST",
			domainRecordId: null,
			code: template.code,
			name: template.name,
			description: template.description,
			requestType: template.requestType,
			steps: template.steps as any,
			states: template.states as any,
			isDeleted: false,
		},
		select: { id: true, code: true },
	});

	console.log(`SEEDED: ${created.id} ${created.code}`);
	await prisma.$disconnect();
	process.exit(0);
})();
