/**
 * Backfill default project codes on existing effective timesheet lines.
 *
 * Rule (operator requirement 2026-09-08):
 *   DIRECT  -> bnpi-dl-<manila-year-of-line-date>
 *   INDIRECT -> bnpi-id-<manila-year-of-line-date>
 * Per-day classification: dayLaborType tag first, else workforceSourceSnapshot
 * (AGENCY = INDIRECT; missing/BNPI = DIRECT). Lines with no classification AND
 * no workforce source are reported as unclassified and left untouched.
 *
 * Dry-run by default. Execute only with --execute.
 *
 * Usage (from hris-api):
 *   npx tsx scripts/backfill-timesheet-project-codes.ts
 *   npx tsx scripts/backfill-timesheet-project-codes.ts --execute
 *   npx tsx scripts/backfill-timesheet-project-codes.ts --execute --org=<organizationId>
 *   npx tsx scripts/backfill-timesheet-project-codes.ts --execute --force-overwrite
 */
import { PrismaClient } from "../generated/prisma";
import {
	normalizeWorkforceSourceBucket,
	resolveManilaYearOfDate,
} from "../helper/timesheet-project-code.helper";

const prisma = new PrismaClient();

function parseArgs() {
	const args: { execute: boolean; org?: string; forceOverwrite: boolean } = {
		execute: false,
		forceOverwrite: false,
	};
	for (const arg of process.argv.slice(2)) {
		if (arg === "--execute") args.execute = true;
		else if (arg === "--force-overwrite") args.forceOverwrite = true;
		else if (arg.startsWith("--org=")) args.org = arg.slice("--org=".length);
	}
	return args;
}

async function main() {
	const args = parseArgs();
	const mode = args.execute ? "EXECUTE" : "DRY-RUN";
	console.log(`[project-code-backfill] mode=${mode}`);

	const orgFilter = args.org ? { organizationId: args.org } : {};
	const lines = await (prisma as any).timesheetline.findMany({
		where: { isDeleted: false, isEffective: true, ...orgFilter },
		select: {
			id: true,
			organizationId: true,
			date: true,
			dayLaborType: true,
			workforceSourceSnapshot: true,
			projectCode: true,
		},
		orderBy: [{ organizationId: "asc" }, { date: "asc" }],
	});

	console.log(`[project-code-backfill] effective lines scanned=${lines.length}`);

	const updates: Array<{ id: string; projectCode: string; mode: string }> = [];
	let alreadyCorrect = 0;
	let unclassified = 0;
	const unclassifiedSamples: string[] = [];

	for (const line of lines) {
		const bucket =
			(line.dayLaborType as string | null)?.trim().toUpperCase() ||
			normalizeWorkforceSourceBucket(line.workforceSourceSnapshot as string | null);
		const year = resolveManilaYearOfDate(line.date);
		if (!bucket || !year) {
			unclassified += 1;
			if (unclassifiedSamples.length < 5) {
				unclassifiedSamples.push(
					`${line.id} date=${new Date(line.date).toISOString().slice(0, 10)} dayLaborType=${line.dayLaborType ?? "null"} workforceSource=${line.workforceSourceSnapshot ?? "null"}`,
				);
			}
			continue;
		}
		const expected =
			bucket === "DIRECT" ? `bnpi-dl-${year}` : `bnpi-id-${year}`;
		if (line.projectCode === expected) {
			alreadyCorrect += 1;
			continue;
		}
		if (line.projectCode && !args.forceOverwrite) {
			// Existing explicit code is preserved unless --force-overwrite.
			alreadyCorrect += 1;
			continue;
		}
		updates.push({ id: line.id, projectCode: expected, mode: line.projectCode ? "overwrite" : "fill" });
	}

	const byCode = new Map<string, number>();
	for (const u of updates) byCode.set(u.projectCode, (byCode.get(u.projectCode) || 0) + 1);

	console.log(
		`[project-code-backfill] wouldUpdate=${updates.length} alreadyCorrectOrKept=${alreadyCorrect} unclassified=${unclassified}`,
	);
	for (const [code, count] of [...byCode.entries()].sort()) {
		console.log(`  ${code}: ${count}`);
	}
	for (const s of unclassifiedSamples) {
		console.log(`  unclassified sample: ${s}`);
	}

	if (!args.execute) {
		console.log("[project-code-backfill] dry-run complete; no writes. Use --execute to apply.");
		return;
	}

	// Single grouped UPDATE (one round-trip class): the stored `date` column is the
	// Manila business date, so to_char("date",'YYYY') is the Manila year. Tag wins,
	// else workforce source (AGENCY -> id, everything else -> dl).
	const orgClause = args.org ? `AND "organizationId" = '${args.org.replace(/'/g, "''")}'` : "";
	const keepClause = args.forceOverwrite ? "" : `AND "projectCode" IS NULL`;
	const classification = `CASE
		WHEN UPPER(COALESCE("dayLaborType"::text,'')) = 'DIRECT' THEN 'bnpi-dl-' || to_char("date", 'YYYY')
		WHEN UPPER(COALESCE("dayLaborType"::text,'')) = 'INDIRECT' THEN 'bnpi-id-' || to_char("date", 'YYYY')
		WHEN UPPER(COALESCE("workforceSourceSnapshot"::text,'')) = 'AGENCY' THEN 'bnpi-id-' || to_char("date", 'YYYY')
		ELSE 'bnpi-dl-' || to_char("date", 'YYYY')
	END`;
	const updateSql = `UPDATE "timesheet_lines"
		SET "projectCode" = ${classification}
		WHERE "isDeleted" = false AND "isEffective" = true ${orgClause} ${keepClause}`;

	const result = await prisma.$executeRawUnsafe(updateSql);
	console.log(`[project-code-backfill] done rowsUpdated=${result}`);
	const verify = await prisma.$queryRawUnsafe<Array<{ projectCode: string; count: bigint }>>(
		`SELECT "projectCode", COUNT(*)::bigint AS count FROM "timesheet_lines"
		 WHERE "isDeleted" = false AND "isEffective" = true ${orgClause}
		 GROUP BY "projectCode" ORDER BY "projectCode"`,
	);
	for (const row of verify) {
		console.log(`  ${row.projectCode ?? "NULL"}: ${row.count}`);
	}
}

main()
	.catch((error) => {
		console.error("[project-code-backfill] failed:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
