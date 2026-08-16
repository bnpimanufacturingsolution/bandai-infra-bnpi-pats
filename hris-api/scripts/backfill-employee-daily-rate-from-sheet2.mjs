/**
 * Backfill Employee.dailyRate from payroll computation Sheet2 "Daily Salary".
 * Path A when Daily > 0; leave null when blank (Path B BNPI).
 *
 * Usage (from hris-api):
 *   node scripts/backfill-employee-daily-rate-from-sheet2.mjs
 *   node scripts/backfill-employee-daily-rate-from-sheet2.mjs --dry-run
 *
 * Env: PG_DATABASE_URL
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import XLSX from "xlsx";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../generated/prisma/index.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const dryRun = process.argv.includes("--dry-run");

const DEFAULT_XLSX = path.join(
	ROOT,
	".runtime/alexa-payroll-compare/hris_payroll_unlocked.xlsx",
);
const XLSX_PATH = process.env.SHEET2_XLSX || DEFAULT_XLSX;
const OUT_DIR = path.join(
	ROOT,
	`.runtime/ot-dual-path-backfill-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`,
);

function num(v) {
	if (v == null || v === "" || v === "-") return 0;
	if (typeof v === "number" && Number.isFinite(v)) return v;
	const n = Number(String(v).replace(/,/g, "").trim());
	return Number.isFinite(n) ? n : 0;
}

function codeOf(v) {
	const s = String(v ?? "").trim();
	if (!s) return "";
	if (/^\d+(\.0+)?$/.test(s)) return String(parseInt(s, 10)).padStart(5, "0");
	return s;
}

function loadDailyByCode(xlsxPath) {
	const wb = XLSX.readFile(xlsxPath, { cellDates: true });
	const sheet = wb.Sheets.Sheet2 || wb.Sheets[wb.SheetNames[0]];
	const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
	let headerIdx = -1;
	let headers = [];
	for (let i = 0; i < Math.min(15, rows.length); i++) {
		const cells = (rows[i] || []).map((c) => (c == null ? "" : String(c).trim()));
		if (
			cells.some((c) => /emp/i.test(c)) &&
			cells.some((c) => /daily/i.test(c) && /salary/i.test(c))
		) {
			headerIdx = i;
			headers = cells;
			break;
		}
	}
	if (headerIdx < 0) throw new Error("Sheet2 header with Emp + Daily Salary not found");
	const idx = Object.fromEntries(
		headers.map((h, i) => [h.toLowerCase().replace(/\s+/g, " ").trim(), i]),
	);
	const empCol = idx["emp. no."] ?? idx["emp no."] ?? idx["emp no"] ?? 1;
	const dailyCol =
		idx["daily salary"] ??
		headers.findIndex((h) => /daily/i.test(h) && /salary/i.test(h));
	if (dailyCol < 0) throw new Error("Daily Salary column not found");

	const map = new Map();
	for (let r = headerIdx + 1; r < rows.length; r++) {
		const row = rows[r] || [];
		const code = codeOf(row[empCol]);
		if (!code || !/^\d+$/.test(code)) continue;
		const daily = num(row[dailyCol]);
		map.set(code, daily > 0 ? daily : null);
	}
	return map;
}

async function ensureColumn(prisma) {
	try {
		await prisma.$executeRawUnsafe(
			`ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "dailyRate" DOUBLE PRECISION`,
		);
	} catch (e) {
		// Column may already exist or Prisma client may reject unknown field on updates.
		console.warn("ensureColumn:", e.message || e);
	}
}

async function main() {
	fs.mkdirSync(OUT_DIR, { recursive: true });
	if (!fs.existsSync(XLSX_PATH)) {
		throw new Error(`Workbook not found: ${XLSX_PATH}`);
	}
	const dailyByCode = loadDailyByCode(XLSX_PATH);
	const pathA = [...dailyByCode.values()].filter((v) => v != null && v > 0).length;
	const pathB = dailyByCode.size - pathA;

	const prisma = new PrismaClient();
	await ensureColumn(prisma);

	// Raw query so we work even before prisma generate knows dailyRate
	const emps = await prisma.$queryRawUnsafe(
		`SELECT id, "employeeId", "dailyRate", "basicSalary" FROM "Employee" WHERE "isDeleted" = false`,
	);

	let updated = 0;
	let skippedNoMatch = 0;
	let skippedUnchanged = 0;
	const samples = [];

	for (const emp of emps) {
		const code = codeOf(emp.employeeId);
		if (!dailyByCode.has(code)) {
			skippedNoMatch++;
			continue;
		}
		const next = dailyByCode.get(code);
		const prev = emp.dailyRate == null ? null : Number(emp.dailyRate);
		const nextN = next == null ? null : Number(next);
		if (prev === nextN || (prev == null && nextN == null)) {
			skippedUnchanged++;
			continue;
		}
		if (!dryRun) {
			if (nextN == null) {
				await prisma.$executeRawUnsafe(
					`UPDATE "Employee" SET "dailyRate" = NULL, "updatedAt" = NOW() WHERE id = $1`,
					emp.id,
				);
			} else {
				await prisma.$executeRawUnsafe(
					`UPDATE "Employee" SET "dailyRate" = $1, "updatedAt" = NOW() WHERE id = $2`,
					nextN,
					emp.id,
				);
			}
		}
		updated++;
		if (samples.length < 20) {
			samples.push({ code, prev, next: nextN, basicSalary: emp.basicSalary });
		}
	}

	const report = {
		generatedAt: new Date().toISOString(),
		dryRun,
		xlsx: XLSX_PATH,
		sheetEmployees: dailyByCode.size,
		sheetPathA_dailyGt0: pathA,
		sheetPathB_dailyBlank: pathB,
		dbEmployees: emps.length,
		updated,
		skippedNoMatch,
		skippedUnchanged,
		samples,
	};
	fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
	console.log(JSON.stringify(report, null, 2));
	await prisma.$disconnect();
}

main().catch(async (e) => {
	console.error(e);
	process.exit(1);
});
