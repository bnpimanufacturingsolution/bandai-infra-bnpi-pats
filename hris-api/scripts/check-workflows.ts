import { PrismaClient } from "../generated/prisma";
import { DEFAULT_REQUEST_WORKFLOW_TEMPLATES } from "../prisma/seeds/requestWorkflowCatalog";
const prisma = new PrismaClient();

async function main() {
	console.log(
		JSON.stringify(
			DEFAULT_REQUEST_WORKFLOW_TEMPLATES.map((workflow) => ({
				code: workflow.code,
				name: workflow.name,
				requestType: workflow.requestType,
				stepCount: workflow.steps.length,
				stateCount: workflow.states.length,
			})),
			null,
			2,
		),
	);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
