/**
 * Apply payslipReleaseAttachmentUrl against .env.local-clone DB (usually 127.0.0.1:5433).
 */
const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath, { override = false } = {}) {
	if (!fs.existsSync(filePath)) return;
	for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const i = line.indexOf("=");
		if (i <= 0) continue;
		const key = line.slice(0, i).trim();
		let value = line.slice(i + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (override || process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

async function main() {
	// Prefer local clone env for this workstation.
	loadEnvFile(path.join(process.cwd(), ".env.local-clone"), { override: true });
	if (!process.env.DATABASE_URL && process.env.PG_DATABASE_URL) {
		process.env.DATABASE_URL = process.env.PG_DATABASE_URL;
	}
	if (!process.env.DATABASE_URL) {
		throw new Error("No DATABASE_URL in .env.local-clone");
	}

	const target = new URL(process.env.DATABASE_URL);
	console.log(`Applying on ${target.hostname}:${target.port || "5432"}${target.pathname}`);

	const { PrismaClient } = require("../generated/prisma");
	const prisma = new PrismaClient();
	try {
		const before = await prisma.$queryRawUnsafe(`
			SELECT column_name
			FROM information_schema.columns
			WHERE table_schema = 'public'
			  AND table_name = 'payroll_periods'
			  AND column_name = 'payslipReleaseAttachmentUrl'
		`);
		await prisma.$executeRawUnsafe(`
			ALTER TABLE "payroll_periods"
			ADD COLUMN IF NOT EXISTS "payslipReleaseAttachmentUrl" TEXT
		`);
		const after = await prisma.$queryRawUnsafe(`
			SELECT column_name
			FROM information_schema.columns
			WHERE table_schema = 'public'
			  AND table_name = 'payroll_periods'
			  AND column_name = 'payslipReleaseAttachmentUrl'
		`);
		// Sanity: full model findUnique should no longer throw P2022
		const sample = await prisma.payrollPeriod.findFirst({
			where: { isDeleted: false },
			select: { id: true, payslipReleaseAttachmentUrl: true },
		});
		console.log(
			JSON.stringify(
				{
					ok: true,
					columnExistedBefore: Array.isArray(before) && before.length > 0,
					columnExistsAfter: Array.isArray(after) && after.length > 0,
					samplePeriodId: sample?.id || null,
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
	console.error(error?.message || error);
	process.exit(1);
});
