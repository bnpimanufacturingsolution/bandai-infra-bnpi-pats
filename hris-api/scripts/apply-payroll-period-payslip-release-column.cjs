/**
 * Apply missing payroll_periods.payslipReleaseAttachmentUrl column.
 * Safe/idempotent. Unblocks DM4 attendance materialization when Prisma
 * schema is ahead of the live Postgres table.
 *
 * Usage (from hris-api):
 *   node scripts/apply-payroll-period-payslip-release-column.cjs
 */
const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
	if (!fs.existsSync(filePath)) return;
	const text = fs.readFileSync(filePath, "utf8");
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq <= 0) continue;
		const key = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

function loadDatabaseUrlCandidates(cwd) {
	const candidates = [];
	const pushFromFile = (filePath, override = false) => {
		if (!fs.existsSync(filePath)) return;
		const env = {};
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
			if (override || env[key] === undefined) env[key] = value;
		}
		const url = env.DATABASE_URL || env.PG_DATABASE_URL || env.WRITE_DATABASE_URL;
		if (url) candidates.push({ source: path.basename(filePath), url });
	};

	// Prefer local clone first on Windows workstations when present.
	pushFromFile(path.join(cwd, ".env.local-clone"), true);
	pushFromFile(path.join(cwd, ".env.development.local"));
	pushFromFile(path.join(cwd, ".env"));
	pushFromFile(path.join(cwd, "..", ".env"));

	if (process.env.DATABASE_URL) {
		candidates.unshift({ source: "process.env.DATABASE_URL", url: process.env.DATABASE_URL });
	} else if (process.env.PG_DATABASE_URL) {
		candidates.unshift({
			source: "process.env.PG_DATABASE_URL",
			url: process.env.PG_DATABASE_URL,
		});
	}

	// de-dupe by URL
	const seen = new Set();
	return candidates.filter((item) => {
		if (seen.has(item.url)) return false;
		seen.add(item.url);
		return true;
	});
}

async function applyOnUrl(databaseUrl, source) {
	process.env.DATABASE_URL = databaseUrl;
	const { PrismaClient } = require("../generated/prisma");
	const prisma = new PrismaClient();
	try {
		const target = new URL(databaseUrl);
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
		const sample = await prisma.payrollPeriod.findFirst({
			where: { isDeleted: false },
			select: { id: true, payslipReleaseAttachmentUrl: true },
		});
		return {
			ok: true,
			source,
			host: `${target.hostname}:${target.port || "5432"}`,
			columnExistedBefore: Array.isArray(before) && before.length > 0,
			columnExistsAfter: Array.isArray(after) && after.length > 0,
			samplePeriodId: sample?.id || null,
		};
	} finally {
		await prisma.$disconnect();
	}
}

async function main() {
	const cwd = process.cwd();
	const candidates = loadDatabaseUrlCandidates(cwd);
	if (candidates.length === 0) {
		throw new Error("DATABASE_URL / PG_DATABASE_URL is required.");
	}

	const errors = [];
	for (const candidate of candidates) {
		try {
			const result = await applyOnUrl(candidate.url, candidate.source);
			console.log(JSON.stringify(result, null, 2));
			return;
		} catch (error) {
			errors.push({
				source: candidate.source,
				error: error?.message || String(error),
			});
		}
	}

	console.error(JSON.stringify({ ok: false, errors }, null, 2));
	process.exit(1);
}

main().catch((error) => {
	console.error(error?.message || error);
	process.exit(1);
});
