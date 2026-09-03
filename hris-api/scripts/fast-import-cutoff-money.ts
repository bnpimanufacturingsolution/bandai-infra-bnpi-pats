/**
 * Fast DEV import of BNPI compensation + deduction mass uploads for any cutoff pack.
 *
 * Usage (from hris-api):
 *   $env:PG_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public'
 *   $env:PACK_DIR='docs/new-cutoff/june-26-10'
 *   $env:COMP_FILE='Compensation Mass Upload 07.15.26.xlsx'
 *   $env:DED_FILE='Deduction Mass Upload 07.15.26.xlsx'
 *   $env:EVIDENCE_DIR='.runtime/.../june-26-10'
 *   npx tsx scripts/fast-import-cutoff-money.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";
import {
	importCompensationMassUpload,
	importDeductionMassUpload,
} from "../app/migration/bnpi-mass-upload-import.service";

const repoRoot = path.resolve(__dirname, "..", "..");
const packRel = process.env.PACK_DIR || "docs/new-cutoff/june-11-25";
const pack = path.isAbsolute(packRel) ? packRel : path.join(repoRoot, packRel);
const stamp =
	process.env.EVIDENCE_DIR ||
	path.join(repoRoot, ".runtime", "cutoff-money-import", path.basename(pack));
const orgId = process.env.ORG_ID || "cmpxw0mfe00007zws3iypuu9d";
const samples = (process.env.SAMPLES || "01360,00032,00021").split(",").map((s) => s.trim());
const compFile = process.env.COMP_FILE || "Compensation Mass Upload 06.30.26.xlsx";
const dedFile = process.env.DED_FILE || "Deduction Mass Upload 06.30.26.xlsx";

// Prefer K3s DEV forward when not overridden
if (!process.env.FORCE_ENV_DB) {
	process.env.PG_DATABASE_URL =
		process.env.PG_DATABASE_URL ||
		"postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public";
	process.env.DATABASE_URL = process.env.PG_DATABASE_URL;
	process.env.WRITE_DATABASE_URL = process.env.PG_DATABASE_URL;
}

fs.mkdirSync(stamp, { recursive: true });
const prisma = new PrismaClient();

async function main() {
	const out: Record<string, unknown> = {
		orgId,
		pack,
		stamp,
		db: process.env.PG_DATABASE_URL?.replace(/:[^:@/]+@/, ":***@"),
		compFile,
		dedFile,
	};

	const compPath = path.join(pack, compFile);
	const dedPath = path.join(pack, dedFile);
	if (!fs.existsSync(compPath) || !fs.existsSync(dedPath)) {
		throw new Error(`Missing pack files under ${pack}: ${compFile} / ${dedFile}`);
	}

	// Cloudflare SSH tunnel blips — retry connection before each phase.
	async function waitDb(label: string, attempts = 12) {
		let last: unknown;
		for (let i = 1; i <= attempts; i++) {
			try {
				await prisma.$queryRaw`SELECT 1`;
				console.log(JSON.stringify({ phase: "db_ok", label, attempt: i, stamp }));
				return;
			} catch (error) {
				last = error;
				console.log(JSON.stringify({ phase: "db_retry", label, attempt: i, message: String((error as Error)?.message || error).slice(0, 160) }));
				await new Promise((r) => setTimeout(r, 1500 * i));
			}
		}
		throw last instanceof Error ? last : new Error(String(last));
	}

	await waitDb("pre_compensation");
	const t0 = Date.now();
	console.log(JSON.stringify({ phase: "compensation_start", path: compPath }));
	const compensation = await importCompensationMassUpload({
		prisma,
		organizationId: orgId,
		buffer: fs.readFileSync(compPath),
	});
	out.compensation = { ...compensation, elapsedMs: Date.now() - t0 };
	console.log(JSON.stringify({ phase: "compensation_done", ...out.compensation }));
	fs.writeFileSync(path.join(stamp, "import-comp-direct.json"), JSON.stringify(out.compensation, null, 2));

	await waitDb("pre_deduction");
	const t1 = Date.now();
	console.log(JSON.stringify({ phase: "deduction_start", path: dedPath }));
	const deduction = await importDeductionMassUpload({
		prisma,
		organizationId: orgId,
		buffer: fs.readFileSync(dedPath),
	});
	out.deduction = { ...deduction, elapsedMs: Date.now() - t1 };
	console.log(JSON.stringify({ phase: "deduction_done", ...out.deduction }));
	fs.writeFileSync(path.join(stamp, "import-ded-direct.json"), JSON.stringify(out.deduction, null, 2));

	const employees = await prisma.employee.findMany({
		where: { organizationId: orgId, isDeleted: false, employeeId: { in: samples } },
		select: { id: true, employeeId: true },
	});
	const spot = [];
	for (const emp of employees) {
		const benefits = await prisma.employeeBenefit.findMany({
			where: { organizationId: orgId, employeeId: emp.id, isDeleted: false },
			include: {
				benefitType: { select: { code: true, name: true, payrollDirection: true } },
			},
			orderBy: { updatedAt: "desc" },
			take: 40,
		});
		spot.push({
			employeeId: emp.employeeId,
			benefitCount: benefits.length,
			codes: benefits.slice(0, 15).map((b) => b.benefitType?.code || b.name),
			massUploadNotes: benefits.filter((b) =>
				String(b.notes || "").toLowerCase().includes("mass upload"),
			).length,
		});
	}
	out.spotcheck = spot;
	fs.writeFileSync(path.join(stamp, "enrollment-spotcheck.json"), JSON.stringify(spot, null, 2));
	fs.writeFileSync(path.join(stamp, "ROOT-money-done.json"), JSON.stringify(out, null, 2));
	console.log(JSON.stringify({ phase: "done", spot }));
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
