import { PrismaClient } from "../generated/prisma";
import { applyAttendanceCorrectionRequest } from "../app/attendance/apply-attendance-correction-request";

const requestId = process.argv[2] || "cmszee5hy009j8ht0kx98v79f";

async function main() {
	const prisma = new PrismaClient();
	try {
		const request = await prisma.request.findFirst({
			where: { id: requestId, isDeleted: false },
		});
		if (!request) {
			throw new Error(`Request not found: ${requestId}`);
		}

		const result = await applyAttendanceCorrectionRequest({
			prisma,
			organizationId: request.organizationId,
			requestId: request.id,
			requesterId: request.requesterId,
			targetEmployeeId: request.targetEmployeeId,
			startDate: request.startDate,
			endDate: request.endDate,
			notes: request.notes,
			metadata: request.metadata,
			actorEmployeeId: request.requesterId,
		});

		console.log(
			JSON.stringify(
				{
					requestId,
					state: request.currentWorkflowStateKey,
					attendanceId: result.createdAttendance?.id,
					status: result.createdAttendance?.status,
					timeIn: result.createdAttendance?.timeIn,
					timeOut: result.createdAttendance?.timeOut,
					date: result.createdAttendance?.date,
				},
				null,
				2,
			),
		);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
