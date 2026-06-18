// @ts-nocheck
import { PrismaClient } from "../generated/prisma";
const prisma = new PrismaClient();
/**
 * Generates a unique schedule code for an organization
 *
 * @param organizationId - The organization ID
 * @param name - Optional schedule name to generate human-readable code
 * @returns A unique schedule code
 *
 * Examples:
 * - With name: "Morning Shift" -> "SCH-MORNING-SHIFT-001"
 * - Without name: -> "SCH-20241223-001"
 */
export async function generateScheduleCode(organizationId: string, name?: string): Promise<string> {
	let prefix: string;
	let searchPattern: string;
	if (name) {
		// Generate human-readable code from name
		const cleanedName = name
			.toUpperCase()
			.replace(/[^A-Z0-9\s]/g, "") // Remove special characters
			.replace(/\s+/g, "-") // Replace spaces with hyphens
			.slice(0, 20); // Limit length

		prefix = `SCH-${cleanedName}`;
		searchPattern = prefix;
	} else {
		// Generate date-based code
		const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
		prefix = `SCH-${dateStr}`;
		searchPattern = prefix;
	}

	// Find the highest sequence number for this prefix
	const existingSchedules = await prisma.scheduleTemplate.findMany({
		where: {
			organizationId,
			code: {
				startsWith: searchPattern,
			},
		},
		select: { code: true },
		orderBy: { code: "desc" },
		take: 1,
	});

	let sequenceNumber = 1;

	if (existingSchedules.length > 0) {
		// Extract sequence from last code (e.g., "SCH-20241223-001" -> "001")
		const lastCode = existingSchedules[0].code;
		const parts = lastCode.split("-");
		const lastSequence = parts[parts.length - 1];

		if (lastSequence && /^\d+$/.test(lastSequence)) {
			sequenceNumber = parseInt(lastSequence, 10) + 1;
		}
	}

	// Pad sequence to 3 digits
	const paddedSequence = sequenceNumber.toString().padStart(3, "0");

	return `${prefix}-${paddedSequence}`;
}

