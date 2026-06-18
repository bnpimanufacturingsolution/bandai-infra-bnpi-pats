import { PrismaClient } from "../generated/prisma";
import { redisClient } from "../config/redis";

const EMPLOYEE_ID_SEQUENCE_KEY_PREFIX = "employee:id:sequence:";

export const formatEmployeeId = (sequence: number): string =>
	`EMP${String(sequence).padStart(3, "0")}`;

const getMaxEmployeeSequence = async (
	prisma: PrismaClient,
	organizationId: string,
): Promise<number> => {
	const rows = await prisma.employee.findMany({
		where: {
			organizationId,
			employeeId: {
				startsWith: "EMP",
				mode: "insensitive",
			},
		},
		select: {
			employeeId: true,
		},
	});
	const sequences = rows
		.map((row) => {
			const match = String(row.employeeId || "").match(/^EMP(\d+)$/i);
			return match ? Number(match[1]) : 0;
		})
		.filter((value) => Number.isFinite(value) && value > 0);
	return sequences.length ? Math.max(...sequences) : 0;
};

export const reserveNextEmployeeId = async (
	prisma: PrismaClient,
	organizationId: string,
): Promise<{ employeeId: string; sequence: number; source: "redis" | "db-fallback" }> => {
	const sequenceKey = `${EMPLOYEE_ID_SEQUENCE_KEY_PREFIX}${organizationId}`;
	const redis = redisClient as any;
	let reservedSequence = 0;
	let source: "redis" | "db-fallback" = "db-fallback";

	try {
		const currentValue = await redis.get(sequenceKey);
		if (!currentValue) {
			const maxSequence = await getMaxEmployeeSequence(prisma, organizationId);
			await redis.set(sequenceKey, String(maxSequence), "NX");
		}

		for (let attempt = 0; attempt < 25; attempt += 1) {
			const nextSequence = await redis.incr(sequenceKey);
			const candidateEmployeeId = formatEmployeeId(nextSequence);
			const existingEmployee = await prisma.employee.findFirst({
				where: {
					organizationId,
					employeeId: candidateEmployeeId,
				},
				select: { id: true },
			});

			if (!existingEmployee) {
				reservedSequence = nextSequence;
				source = "redis";
				break;
			}
		}
	} catch {
		// fallback below
	}

	if (!reservedSequence) {
		const maxSequence = await getMaxEmployeeSequence(prisma, organizationId);
		let candidateSequence = maxSequence + 1;
		for (let attempt = 0; attempt < 200; attempt += 1) {
			const candidateEmployeeId = formatEmployeeId(candidateSequence);
			const existingEmployee = await prisma.employee.findFirst({
				where: {
					organizationId,
					employeeId: candidateEmployeeId,
				},
				select: { id: true },
			});
			if (!existingEmployee) {
				reservedSequence = candidateSequence;
				source = "db-fallback";
				break;
			}
			candidateSequence += 1;
		}
	}

	if (!reservedSequence) {
		throw new Error("Failed to reserve employee ID");
	}

	return {
		employeeId: formatEmployeeId(reservedSequence),
		sequence: reservedSequence,
		source,
	};
};

