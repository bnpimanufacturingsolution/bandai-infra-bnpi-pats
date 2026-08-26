/**
 * Re-import BNPI deduction mass history oldest → newest.
 *
 * Usage (from hris-api, local clone):
 *   $env:PG_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public'
 *   npx tsx scripts/import-prior-deduction-mass-history.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";
import { importDeductionMassUpload } from "../app/migration/bnpi-mass-upload-import.service";

const repoRoot = path.resolve(__dirname, "..", "..");
// Local BNPI clone org (Bandai Namco). Override with ORG_ID when needed.
const orgId = process.env.ORG_ID || "cmryhwpv70000vgaktlmrubmx";

process.env.PG_DATABASE_URL =
	process.env.PG_DATABASE_URL ||
	"postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public";
process.env.DATABASE_URL = process.env.PG_DATABASE_URL;
process.env.WRITE_DATABASE_URL = process.env.PG_DATABASE_URL;

const evidenceDir = path.join(
	repoRoot,
	".runtime",
	"prior-deduction-recur-20260817",
	"reimport",
);
fs.mkdirSync(evidenceDir, { recursive: true });

const priorDir = path.join(repoRoot, "confidential-files", "deduction mass upload");
const priorFiles = fs
	.readdirSync(priorDir)
	.filter(
		(f) =>
			f.endsWith(".xlsx") &&
			!f.includes("Abarracoso") &&
			!f.includes("Almeron") &&
			!f.includes("Valera"),
	)
	.sort()
	.map((f) => path.join(priorDir, f));

const extras = [
	path.join(
		repoRoot,
		"confidential-files",
		"june26-july10",
		"Deduction Mass Upload 07.15.26.xlsx",
	),
	path.join(
		repoRoot,
		"confidential-files",
		"july11-july25",
		"Deduction Mass Upload 07.31.26.xlsx",
	),
].filter((p) => fs.existsSync(p));

const files = [...priorFiles, ...extras];
const prisma = new PrismaClient();

async function main() {
	const report: Record<string, unknown> = {
		orgId,
		db: process.env.PG_DATABASE_URL?.replace(/:[^:@/]+@/, ":***@"),
		startedAt: new Date().toISOString(),
		files: [] as unknown[],
	};
	await prisma.$queryRaw`SELECT 1`;
	for (const file of files) {
		const t0 = Date.now();
		console.log(JSON.stringify({ phase: "import_start", file: path.basename(file) }));
		const summary = await importDeductionMassUpload({
			prisma,
			organizationId: orgId,
			buffer: fs.readFileSync(file),
		});
		const entry = {
			file: path.basename(file),
			elapsedMs: Date.now() - t0,
			created: summary.created,
			updated: summary.updated,
			skipped: summary.skipped,
			failed: summary.failed,
			status: summary.status,
			errorTotal: summary.errorTotal,
			errorsSample: (summary.errors || []).slice(0, 5),
		};
		(report.files as unknown[]).push(entry);
		console.log(JSON.stringify({ phase: "import_done", ...entry }));
		fs.writeFileSync(
			path.join(evidenceDir, `${path.basename(file)}.json`),
			JSON.stringify(
				{
					...summary,
					// keep evidence smaller
					results: (summary.results || []).slice(0, 20),
					errors: (summary.errors || []).slice(0, 50),
				},
				null,
				2,
			),
		);
	}
	report.finishedAt = new Date().toISOString();
	fs.writeFileSync(path.join(evidenceDir, "SUMMARY.json"), JSON.stringify(report, null, 2));
	console.log(JSON.stringify({ phase: "all_done", fileCount: files.length }, null, 2));
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
