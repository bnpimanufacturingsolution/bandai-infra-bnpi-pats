import { PrismaClient } from "../generated/prisma";
import { seedWorkflowInstanceTemplates } from "../prisma/seeds/workflowInstanceTemplateSeeder";

/**
 * Materialize the seeded request workflow templates (including the three new
 * leader-filed templates) into an organization's WorkflowInstance rows.
 * Idempotent (create-or-update). Usage: npx tsx scripts/seed-workflow-templates.ts [organizationId]
 */
const prisma = new PrismaClient();
(async () => {
	const orgId = process.argv[2];
	if (!orgId) {
		console.error("Usage: npx tsx scripts/seed-workflow-templates.ts <organizationId>");
		process.exit(1);
	}
	const result = await seedWorkflowInstanceTemplates(prisma, orgId);
	console.log(JSON.stringify(result));
	await prisma.$disconnect();
})().catch((error) => {
	console.error("ERR", error.message);
	process.exit(1);
});
