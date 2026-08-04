const { PrismaClient } = require("../generated/prisma");
const fs = require("fs");
const path = require("path");

function splitSqlStatements(sql) {
	return sql
		.split(/;\s*\n/)
		.map((part) => part.replace(/^\s*--.*$/gm, "").trim())
		.filter((part) => part.length > 0)
		.map((part) => (part.endsWith(";") ? part : `${part};`));
}

async function main() {
	const prisma = new PrismaClient();
	const sqlPath = path.join(
		__dirname,
		"../prisma/schema-postgres/migrations/20260804_add_mass_upload_import_logs.sql",
	);
	const sql = fs.readFileSync(sqlPath, "utf8");
	const statements = splitSqlStatements(sql);
	try {
		for (const statement of statements) {
			await prisma.$executeRawUnsafe(statement);
		}
		const cols = await prisma.$queryRawUnsafe(
			"SELECT column_name FROM information_schema.columns WHERE table_name = 'mass_upload_import_logs' ORDER BY ordinal_position",
		);
		const count = await prisma.$queryRawUnsafe(
			'SELECT COUNT(*)::int AS n FROM "mass_upload_import_logs"',
		);
		console.log(
			JSON.stringify(
				{
					ok: true,
					db: process.env.PG_DATABASE_URL || process.env.DATABASE_URL || null,
					columns: cols,
					rowCount: count,
					statements: statements.length,
				},
				null,
				2,
			),
		);
	} catch (error) {
		console.error(
			JSON.stringify(
				{
					ok: false,
					message: error?.message || String(error),
					code: error?.code,
					db: process.env.PG_DATABASE_URL || process.env.DATABASE_URL || null,
				},
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
