/**
 * Apply employee_payrolls publish/payslip columns against .env.local-clone DB
 * (usually 127.0.0.1:5433). Fixes P2022: column `isPublished` does not exist.
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

const REQUIRED_COLUMNS = [
	"isPublished",
	"publishedAt",
	"publishedBy",
	"payslipGeneratedAt",
	"payslipReleasedAt",
	"payslipReleasedBy",
	"hasPaymentIssue",
	"paymentIssueAt",
	"paymentIssueBy",
	"paymentIssueNote",
];

async function main() {
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
			  AND table_name = 'employee_payrolls'
			  AND column_name = ANY($1)
			ORDER BY column_name
		`, REQUIRED_COLUMNS);

		await prisma.$executeRawUnsafe(`
			ALTER TABLE "employee_payrolls"
			  ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT false
		`);
		await prisma.$executeRawUnsafe(`
			ALTER TABLE "employee_payrolls"
			  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3)
		`);
		await prisma.$executeRawUnsafe(`
			ALTER TABLE "employee_payrolls"
			  ADD COLUMN IF NOT EXISTS "publishedBy" TEXT
		`);
		await prisma.$executeRawUnsafe(`
			ALTER TABLE "employee_payrolls"
			  ADD COLUMN IF NOT EXISTS "payslipGeneratedAt" TIMESTAMP(3)
		`);
		await prisma.$executeRawUnsafe(`
			ALTER TABLE "employee_payrolls"
			  ADD COLUMN IF NOT EXISTS "payslipReleasedAt" TIMESTAMP(3)
		`);
		await prisma.$executeRawUnsafe(`
			ALTER TABLE "employee_payrolls"
			  ADD COLUMN IF NOT EXISTS "payslipReleasedBy" TEXT
		`);
		await prisma.$executeRawUnsafe(`
			ALTER TABLE "employee_payrolls"
			  ADD COLUMN IF NOT EXISTS "hasPaymentIssue" BOOLEAN NOT NULL DEFAULT false
		`);
		await prisma.$executeRawUnsafe(`
			ALTER TABLE "employee_payrolls"
			  ADD COLUMN IF NOT EXISTS "paymentIssueAt" TIMESTAMP(3)
		`);
		await prisma.$executeRawUnsafe(`
			ALTER TABLE "employee_payrolls"
			  ADD COLUMN IF NOT EXISTS "paymentIssueBy" TEXT
		`);
		await prisma.$executeRawUnsafe(`
			ALTER TABLE "employee_payrolls"
			  ADD COLUMN IF NOT EXISTS "paymentIssueNote" TEXT
		`);
		await prisma.$executeRawUnsafe(`
			CREATE INDEX IF NOT EXISTS "employee_payrolls_organizationId_payrollPeriodId_isPublished_isDeleted_idx"
			  ON "employee_payrolls"("organizationId", "payrollPeriodId", "isPublished", "isDeleted")
		`);

		const after = await prisma.$queryRawUnsafe(`
			SELECT column_name
			FROM information_schema.columns
			WHERE table_schema = 'public'
			  AND table_name = 'employee_payrolls'
			  AND column_name = ANY($1)
			ORDER BY column_name
		`, REQUIRED_COLUMNS);

		// Sanity: model select of isPublished should not throw P2022
		const sample = await prisma.employeePayroll.findFirst({
			where: { isDeleted: false },
			select: { id: true, isPublished: true, hasPaymentIssue: true },
		});

		console.log(
			JSON.stringify(
				{
					ok: true,
					columnsBefore: (before || []).map((r) => r.column_name),
					columnsAfter: (after || []).map((r) => r.column_name),
					samplePayrollId: sample?.id || null,
					sampleIsPublished: sample?.isPublished ?? null,
				},
				null,
				2,
			),
		);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
