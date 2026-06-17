import { PrismaClient } from "../generated/prisma";
import { getSeededWorkflowConfigs } from "../helper/workflow-config.helper";
import {
	isStaleScheduleChangeHrTaskExecution,
	SCHEDULE_CHANGE_HR_APPROVAL_STEP_NUMBER,
	SCHEDULE_CHANGE_WORKFLOW_CODE,
} from "../helper/schedule-change-workflow.helper";
import { repairScheduleChangeHrApprovalQueueIfNeeded } from "../helper/request-runtime.helper";

const prisma = new PrismaClient();

async function assertSeededWorkflowIsCanonical() {
	const workflow = getSeededWorkflowConfigs().find(
		(config) => config.code === SCHEDULE_CHANGE_WORKFLOW_CODE,
	);
	const hrStep = workflow?.steps.find(
		(step) => Number(step.step_number) === SCHEDULE_CHANGE_HR_APPROVAL_STEP_NUMBER,
	);

	if (!workflow || !hrStep) {
		throw new Error("Schedule change workflow template is missing from seeded configs.");
	}

	if (hrStep.step_type !== "APPROVAL" || hrStep.assignee_type !== "HR") {
		throw new Error(
			`Schedule change HR step is not canonical. Found ${hrStep.step_type}/${hrStep.assignee_type}.`,
		);
	}
}

async function main() {
	await assertSeededWorkflowIsCanonical();

	const organizations = await prisma.organization.findMany({
		where: { isDeleted: false },
		select: { id: true, name: true, code: true },
	});

	if (organizations.length === 0) {
		console.log("No organizations found. Seeded workflow config is canonical.");
		return;
	}

	for (const organization of organizations) {
		const repaired = await repairScheduleChangeHrApprovalQueueIfNeeded(prisma, {
			organizationId: organization.id,
			limit: 500,
		});

		const activeScheduleRequests = await prisma.request.findMany({
			where: {
				organizationId: organization.id,
				type: "SCHEDULE_CHANGE",
				isDeleted: false,
				currentStepExecutionId: { not: null },
				currentWorkflowStateKey: {
					in: ["OPEN", "SUBMITTED", "FOR_APPROVAL", "IN_PROCESS", "APPROVED"],
				},
			},
			select: {
				id: true,
				code: true,
				currentWorkflowStateKey: true,
				currentStepExecution: {
					select: {
						stepNumber: true,
						stepName: true,
						stepType: true,
						assigneeType: true,
						status: true,
					},
				},
			},
		});

		const staleRequests = activeScheduleRequests.filter((request) =>
			isStaleScheduleChangeHrTaskExecution(request.currentStepExecution),
		);
		if (staleRequests.length > 0) {
			throw new Error(
				`Stale schedule-change HR task rows remain for ${organization.code || organization.name}: ${staleRequests
					.map((request) => request.code || request.id)
					.join(", ")}`,
			);
		}

		const pendingHrApprovals = activeScheduleRequests.filter((request) => {
			const step = request.currentStepExecution;
			return (
				step?.status === "PENDING" &&
				step.stepType === "APPROVAL" &&
				step.assigneeType === "HR"
			);
		});

		console.log(
			[
				organization.code || organization.name || organization.id,
				`repaired=${repaired}`,
				`pendingScheduleHrApprovals=${pendingHrApprovals.length}`,
			].join(" "),
		);
	}
}

main()
	.catch((error) => {
		console.error(error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
