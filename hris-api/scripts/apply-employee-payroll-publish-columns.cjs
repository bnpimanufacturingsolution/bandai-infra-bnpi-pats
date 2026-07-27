/**
 * Apply employee_payrolls publish/payslip columns using current process env
 * (DATABASE_URL / PG_DATABASE_URL). For local clone DB prefer
 * apply-employee-payroll-publish-columns-local.cjs.
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
	// Load default env files without forcing local-clone override.
	loadEnvFile(path.join(process.cwd(), ".env"));
	loadEnvFile(path.join(process.cwd(), ".env.local"));
	if (!process.env.DATABASE_URL && process.env.PG_DATABASE_URL) {
		process.env.DATABASE_URL = process.env.PG_DATABASE_URL;
	}
	if (!process.env.DATABASE_URL) {
		throw new Error("No DATABASE_URL / PG_DATABASE_URL set");
	}

	const target = new URL(process.env.DATABASE_URL);
	console.log(`Applying on ${target.hostname}:${target.port || "5432"}${target.pathname}`);

	const { PrismaClient } = require("../generated/prisma");
	const prisma = new PrismaClient();
	try {
		const sqlPath = path.join(
			process.cwd(),
			"prisma",
			"schema-postgres",
			"migrations",
			"20260723_add_employee_payroll_publish_payslip_columns.sql",
		);
		const sql = fs.readFileSync(sqlPath, "utf8");
		// Split on statement boundaries that end with semicolon + newline.
		const statements = sql
			.split(/;\s*\n/)
			.map((s) => s.trim())
			.filter((s) => s && !s.startsWith("--"));
		for (const statement of statements) {
			const body = statement.endsWith(";") ? statement : `${statement};`;
			await prisma.$executeRawUnsafe(body);
		}
		const sample = await prisma.employeePayroll.findFirst({
			select: { id: true, isPublished: true, hasPaymentIssue: true },
		});
		console.log(
			JSON.stringify(
				{
					ok: true,
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
