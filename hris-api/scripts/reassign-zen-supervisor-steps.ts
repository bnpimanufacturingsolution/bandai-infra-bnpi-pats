import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();
const zenId = "cmspnnxot02s5qw01yk7yy2er";
const hrManagerId = "cmryafemc00eqnj3ovl26xtsf";

const main = async () => {
	const pending = await prisma.workflowStepExecution.findMany({
		where: {
			isDeleted: false,
			status: "PENDING",
			assigneeType: "SUPERVISOR",
			request: {
				requesterId: zenId,
				type: "ATTENDANCE_CORRECTION",
				isDeleted: false,
			},
		},
		select: {
			id: true,
			assigneeId: true,
			stepName: true,
			request: { select: { code: true } },
		},
	});

	const updated = [];
	for (const step of pending) {
		if (step.assigneeId === hrManagerId) {
			updated.push({ id: step.id, code: step.request?.code, skipped: true });
			continue;
		}
		await prisma.workflowStepExecution.update({
			where: { id: step.id },
			data: {
				assigneeId: hrManagerId,
				metadata: {
					approvalResolution: {
						resolved_from_chain: "SUPERVISOR_CHAIN",
						fallback_reason: "DIRECT_SUPERVISOR_ASSIGNED",
						resolved_assignee_id: hrManagerId,
						resolved_at: new Date().toISOString(),
					},
					reassignedToDirectSupervisor: {
						from: step.assigneeId,
						to: hrManagerId,
						at: new Date().toISOString(),
					},
				} as any,
			},
		});
		updated.push({
			id: step.id,
			code: step.request?.code,
			from: step.assigneeId,
			to: hrManagerId,
		});
	}

	console.log(JSON.stringify({ count: pending.length, updated }, null, 2));
};

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
