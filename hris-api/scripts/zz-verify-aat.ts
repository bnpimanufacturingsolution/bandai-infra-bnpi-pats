import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
	const { PrismaClient } = await import("../generated/prisma");
	const prisma = new PrismaClient();
	try {
		const columns: Array<{ column_name: string; data_type: string }> = await prisma.$queryRawUnsafe(
			"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'EmployeeApplicationAccess' ORDER BY ordinal_position",
		);
		console.log(
			"TABLE:",
			columns.map((c) => `${c.column_name}:${c.data_type}`).join(", ") || "MISSING",
		);
		const indexes: Array<{ indexname: string }> = await prisma.$queryRawUnsafe(
			"SELECT indexname FROM pg_indexes WHERE tablename = 'EmployeeApplicationAccess' ORDER BY indexname",
		);
		console.log(
			"INDEXES:",
			indexes.map((i) => i.indexname).join(", ") || "MISSING",
		);
		const count = await prisma.employeeApplicationAccess.count();
		console.log("ROW_COUNT:", count);
	} finally {
		await prisma.$disconnect();
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("VERIFY_FAILED:", error.message);
		process.exit(1);
	});
