const { PrismaClient } = require("../generated/prisma");

async function main() {
	const prisma = new PrismaClient();
	try {
		const info = await prisma.$queryRawUnsafe(
			"SELECT current_database() AS db, inet_server_addr()::text AS addr, inet_server_port() AS port",
		);
		const hasTable = await prisma.$queryRawUnsafe(
			"SELECT to_regclass('public.mass_upload_import_logs')::text AS reg",
		);
		const employees = await prisma.employee.count({ where: { isDeleted: false } });
		let logCount = null;
		if (hasTable?.[0]?.reg) {
			const rows = await prisma.$queryRawUnsafe(
				'SELECT COUNT(*)::int AS n FROM "mass_upload_import_logs"',
			);
			logCount = rows?.[0]?.n ?? 0;
		}
		console.log(
			JSON.stringify(
				{
					ok: true,
					url: process.env.PG_DATABASE_URL || process.env.DATABASE_URL,
					info,
					table: hasTable,
					employees,
					logCount,
					hasDelegate: Boolean(prisma.massUploadImportLog),
				},
				null,
				2,
			),
		);
	} catch (error) {
		console.error(
			JSON.stringify(
				{ ok: false, message: error?.message || String(error), code: error?.code },
				null,
				2,
			),
		);
		process.exitCode = 1;
	} finally {
		await prisma.$disconnect();
	}
}

main();
