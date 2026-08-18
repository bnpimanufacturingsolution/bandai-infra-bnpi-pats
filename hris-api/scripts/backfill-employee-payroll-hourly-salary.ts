/**
 * Backfill EmployeePayroll.hourlySalary from already-frozen row data.
 *
 * Writes ONLY hourlySalary. Does not regenerate payroll or change money fields.
 * Includes paid rows (new empty snapshot column). Skips isDeleted.
 *
 * Default is dry-run. Pass --execute to UPDATE.
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { Prisma, PrismaClient } from "../generated/prisma";
import { resolveEmployeePayrollHourlySalaryFromExistingRow } from "../helper/payroll-period.helper";

const apiRoot = path.join(__dirname, "..");
dotenv.config({ path: path.join(apiRoot, ".env") });
dotenv.config({ path: path.join(apiRoot, ".env.development.local"), override: true });

const BATCH_SIZE = 200;
const SAMPLE_LIMIT = 10;
const COLUMN_SQL_RELATIVE =
	"prisma/schema-postgres/migrations/20260819_add_employee_payroll_hourly_salary.sql";

type CliOptions = {
	execute: boolean;
	force: boolean;
	payrollPeriodId?: string;
	organizationId?: string;
	limit?: number;
	help: boolean;
};

type SampleRow = {
	id: string;
	employeeId: string;
	dailySalary: number;
	hourlySalary: number;
	next: number;
	source: string;
};

function getFlagValue(args: string[], name: string): string | undefined {
	const prefix = `--${name}=`;
	const inline = args.find((arg) => arg.startsWith(prefix));
	if (inline) {
		const value = inline.slice(prefix.length).trim();
		return value || undefined;
	}
	const index = args.indexOf(`--${name}`);
	if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) {
		return args[index + 1].trim() || undefined;
	}
	return undefined;
}

function parseArgs(argv = process.argv.slice(2)): CliOptions {
	const flags = new Set(argv.filter((arg) => !arg.includes("=")));
	const limitRaw = getFlagValue(argv, "limit");
	const limit = limitRaw === undefined ? undefined : Number(limitRaw);
	if (limitRaw !== undefined && (!Number.isFinite(limit) || Number(limit) < 0)) {
		throw new Error(`Invalid --limit=${limitRaw}`);
	}
	return {
		execute: flags.has("--execute"),
		force: flags.has("--force"),
		payrollPeriodId: getFlagValue(argv, "payrollPeriodId"),
		organizationId: getFlagValue(argv, "organizationId"),
		limit: limit === undefined ? undefined : Math.floor(limit),
		help: flags.has("--help") || flags.has("-h"),
	};
}

function splitSqlStatements(sql: string): string[] {
	return sql
		.split(";")
		.map((part) => part.replace(/^\s*--.*$/gm, "").trim())
		.filter((part) => part.length > 0)
		.map((part) => `${part};`);
}

async function ensureHourlySalaryColumn(prisma: PrismaClient): Promise<void> {
	const sqlPath = path.join(__dirname, "..", COLUMN_SQL_RELATIVE);
	if (!fs.existsSync(sqlPath)) {
		throw new Error(`Missing column SQL at ${sqlPath}`);
	}
	const statements = splitSqlStatements(fs.readFileSync(sqlPath, "utf8"));
	if (statements.length === 0) {
		throw new Error(`No executable SQL in ${sqlPath}`);
	}
	for (const statement of statements) {
		await prisma.$executeRawUnsafe(statement);
	}
	console.log(`column ensure ran: ${COLUMN_SQL_RELATIVE.replace(/\\/g, "/")}`);
}

function printHelp(): void {
	console.log(`backfill-employee-payroll-hourly-salary

Fills EmployeePayroll.hourlySalary from existing dailySalary / metadata / rateBreakdown.
Writes ONLY hourlySalary. Does not regenerate payroll or change money fields.

Usage:
  npx tsx scripts/backfill-employee-payroll-hourly-salary.ts
  npx tsx scripts/backfill-employee-payroll-hourly-salary.ts --execute
  npx tsx scripts/backfill-employee-payroll-hourly-salary.ts --execute --force
  npx tsx scripts/backfill-employee-payroll-hourly-salary.ts --payrollPeriodId=<id>
  npx tsx scripts/backfill-employee-payroll-hourly-salary.ts --organizationId=<id>
  npx tsx scripts/backfill-employee-payroll-hourly-salary.ts --limit=N

Flags:
  (default)   dry-run: print counts + up to 10 sample rows
  --execute   UPDATE only { hourlySalary }
  --force     overwrite rows that already have hourlySalary !== 0
  --help      show this text
`);
}

async function main(): Promise<void> {
	const options = parseArgs();
	if (options.help) {
		printHelp();
		return;
	}

	const prisma = new PrismaClient();
	const summary = {
		mode: options.execute ? "execute" : "dry-run",
		scanned: 0,
		alreadySet: 0,
		wouldUpdate: 0,
		updated: 0,
		skippedNoSource: 0,
		errors: 0,
		force: options.force,
		payrollPeriodId: options.payrollPeriodId || null,
		organizationId: options.organizationId || null,
		limit: options.limit ?? null,
	};
	const samples: SampleRow[] = [];
	const errorMessages: string[] = [];

	try {
		await ensureHourlySalaryColumn(prisma);

		const where: Prisma.EmployeePayrollWhereInput = {
			isDeleted: false,
			...(options.payrollPeriodId ? { payrollPeriodId: options.payrollPeriodId } : {}),
			...(options.organizationId ? { organizationId: options.organizationId } : {}),
		};

		let cursorId: string | undefined;
		let remaining = options.limit;

		while (remaining === undefined || remaining > 0) {
			const take =
				remaining === undefined ? BATCH_SIZE : Math.min(BATCH_SIZE, remaining);
			const rows = await prisma.employeePayroll.findMany({
				where,
				select: {
					id: true,
					employeeId: true,
					dailySalary: true,
					hourlySalary: true,
					metadata: true,
					rateBreakdown: true,
				},
				take,
				...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
				orderBy: { id: "asc" },
			});
			if (rows.length === 0) break;
			cursorId = rows[rows.length - 1].id;
			if (remaining !== undefined) remaining -= rows.length;

			for (const row of rows) {
				summary.scanned += 1;
				const current = Number(row.hourlySalary || 0);
				const resolved = resolveEmployeePayrollHourlySalaryFromExistingRow(row);
				const next = Number(resolved.hourlySalary || 0);
				const hasSource = resolved.source !== "none" && next !== 0;

				if (!hasSource) {
					summary.skippedNoSource += 1;
					continue;
				}
				if (current !== 0 && !options.force) {
					summary.alreadySet += 1;
					continue;
				}
				if (current === next) {
					summary.alreadySet += 1;
					continue;
				}

				summary.wouldUpdate += 1;
				if (samples.length < SAMPLE_LIMIT) {
					samples.push({
						id: row.id,
						employeeId: row.employeeId,
						dailySalary: Number(row.dailySalary || 0),
						hourlySalary: current,
						next,
						source: resolved.source,
					});
				}

				if (!options.execute) continue;

				try {
					await prisma.employeePayroll.update({
						where: { id: row.id },
						data: { hourlySalary: next },
					});
					summary.updated += 1;
				} catch (error) {
					summary.errors += 1;
					const message = error instanceof Error ? error.message : String(error);
					if (errorMessages.length < SAMPLE_LIMIT) {
						errorMessages.push(`${row.id}: ${message}`);
					}
				}
			}
		}

		if (samples.length > 0) {
			console.log("sample rows (up to 10):");
			console.log(JSON.stringify(samples, null, 2));
		}

		console.log(
			JSON.stringify(
				{
					...summary,
					samples: samples.length,
					errorMessages,
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
	console.error(error);
	process.exitCode = 1;
});
