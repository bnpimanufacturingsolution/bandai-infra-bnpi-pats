import { PrismaClient } from "../generated/prisma";
import { repairAttendanceCorrectionSupervisorWorkflowIfNeeded } from "../helper/request-runtime.helper";
import { normalizeAttendanceCorrectionWorkflowSteps } from "../helper/attendance-correction-workflow.helper";

const prisma = new PrismaClient();

const main = async () => {
	const requestId = process.argv[2] || "cmszcwnik04eq8h804nzpmlfi";
	const request = await prisma.request.findFirst({
		where: { id: requestId },
		select: { id: true, code: true, organizationId: true, type: true },
	});
	if (!request) {
		console.log(`REQUEST_NOT_FOUND ${requestId}`);
		return;
	}

	const templates = await prisma.workflowInstance.updateMany({
		where: {
			organizationId: request.organizationId,
			domain: "REQUEST",
			domainRecordId: null,
			isDeleted: false,
			OR: [
				{ code: "WF-ATTENDANCE-CORRECTION-DEFAULT" },
				{ requestType: "ATTENDANCE_CORRECTION" },
			],
		},
		data: {
			steps: normalizeAttendanceCorrectionWorkflowSteps() as any,
			description:
				"Attendance correction workflow: employee submit, supervisor (report-to) approval, then HR review",
		},
	});

	const pending = await prisma.request.findMany({
		where: {
			organizationId: request.organizationId,
			type: "ATTENDANCE_CORRECTION",
			isDeleted: false,
			currentWorkflowStateKey: { in: ["SUBMITTED", "OPEN", "FOR_APPROVAL"] },
		},
		select: { id: true, code: true },
	});

	const results: Array<{ id: string; code: string | null; repaired: boolean }> = [];
	for (const item of pending) {
		const repaired = await repairAttendanceCorrectionSupervisorWorkflowIfNeeded(
			prisma,
			item.id,
		);
		results.push({ id: item.id, code: item.code, repaired });
	}

	console.log(
		JSON.stringify(
			{
				templateUpdated: templates.count,
				pending: results,
			},
			null,
			2,
		),
	);
};

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
