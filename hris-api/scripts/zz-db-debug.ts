import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
	const { PrismaClient } = await import("../generated/prisma");
	const prisma = new PrismaClient();
	try {
		const tables: Array<{ table_name: string }> = await prisma.$queryRawUnsafe(
			"SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%user%' OR table_name ILIKE '%employee%') ORDER BY table_name",
		);
		console.log("TABLES:", tables.map((t) => t.table_name).join(", "));
		const roleCounts: Array<{ role: string; count: number }> = await prisma.$queryRawUnsafe(
			'SELECT role, COUNT(*)::int AS count FROM users GROUP BY role ORDER BY count DESC LIMIT 15',
		);
		console.log("USER_ROLES:", roleCounts.map((r) => `${r.role}=${r.count}`).join(", "));
		const adminCount: Array<{ count: number }> = await prisma.$queryRawUnsafe(
			"SELECT COUNT(*)::int AS count FROM users WHERE role IN ('hris-admin','admin','super_admin','superadmin') AND \"isDeleted\" = false",
		);
		console.log("ADMIN_USERS:", adminCount[0]?.count);
		const adminsWithEmployee: Array<{ id: string; role: string; employeeId: string | null }> =
			await prisma.$queryRawUnsafe(
				'SELECT u.id, u.role, e.id AS "employeeId" FROM users u LEFT JOIN employees e ON e."userId" = u.id AND e."isDeleted" = false WHERE u.role IN (\'hris-admin\',\'admin\',\'super_admin\',\'superadmin\') AND u."isDeleted" = false',
			);
		console.log(
			"ADMIN_DETAILS:",
			adminsWithEmployee
				.map((a) => `${a.role}:${a.employeeId ? "has-employee" : "no-employee"}`)
				.join(", "),
		);
		const prismaAdmins = await prisma.user.findMany({
			where: { role: { in: ["hris-admin", "admin", "super_admin", "superadmin"] }, isDeleted: false },
			select: { id: true, role: true },
		});
		console.log("PRISMA_USER_FINDMANY:", prismaAdmins.length);
		const empWithUser: Array<{ count: number }> = await prisma.$queryRawUnsafe(
			'SELECT COUNT(*)::int AS count FROM employees WHERE "isDeleted" = false AND "userId" IS NOT NULL',
		);
		console.log("EMPLOYEES_WITH_USERID:", empWithUser[0]?.count);
	} finally {
		await prisma.$disconnect();
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("DBG_FAILED:", error.message?.slice(0, 200));
		process.exit(1);
	});
