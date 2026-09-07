import { PrismaClient } from "../generated/prisma";
import fs from "fs";
import path from "path";

/**
 * Read-only export of the stale DEV backup table `requests_type_backup_20260826`
 * before it is dropped to unblock the schema-only `prisma-postgres:push` in the
 * DEV `hris-api-db-init` GitOps job. Evidence: .runtime/dev-dbinit-drift-repair-20260907/.
 */
const prisma = new PrismaClient();
(async () => {
	const rows: Array<Record<string, unknown>> =
		await prisma.$queryRawUnsafe(`SELECT * FROM requests_type_backup_20260826`);
	const out = {
		exportedAt: new Date().toISOString(),
		source: "K3s DEV Postgres 127.0.0.1:55435 (hris)",
		table: "requests_type_backup_20260826",
		purpose:
			"Backup of requests_type taken 2026-08-26 during day-status repair; blocks schema-only prisma db push on DEV db-init.",
		rowCount: rows.length,
		rows,
	};
	const dir = path.join(__dirname, "..", ".runtime", "dev-dbinit-drift-repair-20260907");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "requests_type_backup_20260826.export.json"), JSON.stringify(out, null, 2));
	console.log(JSON.stringify({ rowCount: rows.length }, null, 2));
	await prisma.$disconnect();
})().catch((error) => {
	console.error("ERR", error.message);
	process.exit(1);
});
