import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { repairCompletedScheduleChangeOverrideApplications } from "../helper/request-runtime.helper";

const prisma = new PrismaClient();

const getArgValue = (name: string) => {
	const prefix = `--${name}=`;
	const value = process.argv.find((arg) => arg.startsWith(prefix));
	return value ? value.slice(prefix.length).trim() : "";
};

async function main() {
	const organizationId = getArgValue("organizationId") || undefined;
	const limitRaw = getArgValue("limit");
	const limit = limitRaw ? Number(limitRaw) : undefined;

	const repaired = await repairCompletedScheduleChangeOverrideApplications(prisma, {
		organizationId,
		limit: Number.isFinite(limit) ? limit : undefined,
	});

	console.log(`Repaired ${repaired} completed schedule change override application(s).`);
}

main()
	.catch((error) => {
		console.error("Failed to repair completed schedule change overrides:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
