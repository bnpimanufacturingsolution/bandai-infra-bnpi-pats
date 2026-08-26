/**
 * Re-import BNPI deduction mass history oldest → newest so last payment wins,
 * with multi-cutoff endDate (never shrink) from repair + import code.
 *
 * Usage from repo root (local clone 5433):
 *   set PG_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public
 *   node --import tsx hris-api/scripts/import-prior-deduction-mass-history.mjs
 *
 * Or via tsx:
 *   cd hris-api && set PG_DATABASE_URL=... && npx tsx scripts/import-prior-deduction-mass-history.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..");

process.env.PG_DATABASE_URL =
	process.env.PG_DATABASE_URL ||
	"postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public";
process.env.DATABASE_URL = process.env.PG_DATABASE_URL;
process.env.WRITE_DATABASE_URL = process.env.PG_DATABASE_URL;

const require = createRequire(path.join(apiRoot, "package.json"));

// Dynamic import compiled TS via tsx register when run with npx tsx
const { PrismaClient } = await import("../generated/prisma/index.js").catch(() =>
	import("../generated/prisma-postgres/index.js"),
);
const { importDeductionMassUpload } = await import(
	"../app/migration/bnpi-mass-upload-import.service.ts"
);

const orgId = process.env.ORG_ID || "cmpxw0mfe00007zws3iypuu9d";
const evidenceDir = path.join(
	repoRoot,
	".runtime",
	"prior-deduction-recur-20260817",
	"reimport",
);
fs.mkdirSync(evidenceDir, { recursive: true });

const priorDir = path.join(repoRoot, "confidential-files", "deduction mass upload");
const extra = [
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
];

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

const files = [...priorFiles, ...extra.filter((p) => fs.existsSync(p))];

const prisma = new PrismaClient();
const report = { orgId, files: [], startedAt: new Date().toISOString() };

async function main() {
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
		report.files.push(entry);
		console.log(JSON.stringify({ phase: "import_done", ...entry }));
		fs.writeFileSync(
			path.join(evidenceDir, `${path.basename(file)}.json`),
			JSON.stringify(summary, null, 2),
		);
	}
	report.finishedAt = new Date().toISOString();
	fs.writeFileSync(
		path.join(evidenceDir, "SUMMARY.json"),
		JSON.stringify(report, null, 2),
	);
	console.log(JSON.stringify({ phase: "all_done", fileCount: files.length }, null, 2));
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
