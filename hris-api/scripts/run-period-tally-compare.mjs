/**
 * BNPI all-period payroll tally compare — import → run this → read REPORT.md.
 *
 * Compares the client Sheet2 register workbook for ANY cutoff against the LIVE
 * HRIS payroll preview for that period, then writes evidence:
 *   .runtime/tally-<PERIODCODE>-<stamp>/{REPORT.md,summary.json,all-results.json,compare.csv}
 *
 * Usage (hris-api):
 *   npx tsx scripts/run-period-tally-compare.mjs --period=PP-20260626-20260711
 *   npx tsx scripts/run-period-tally-compare.mjs --period=cmryhzl500032vgakz1uy1k7l
 *   npx tsx scripts/run-period-tally-compare.mjs --period=PP-20260626-20260711 --target-xlsx="...unlocked.xlsx"
 *
 * Password-protected registers are auto-unlocked via Excel COM
 * (helper/payroll-reconciliation.helper.ts ensureUnlockedWorkbook; client password 9090).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

// Dynamic TS imports (tsx) — ESM named-import from transpiled CJS helpers is unreliable.
const {
	bucketBands,
	classifyTally,
	money,
	normCode,
	TALLY_KEY_FIELDS,
} = await import("../helper/tally-compare.helper");
const { ensureUnlockedWorkbook } = await import("../helper/payroll-reconciliation.helper");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const API = process.env.HRIS_API_URL || "http://localhost:3001";
const DEFAULT_PASSWORD = "9090"; // client register password (sensitive; do not log)

/** Known cutoff → default Sheet2 register workbook. Override with --target-xlsx. */
const KNOWN_TARGETS = {
	"PP-20260426-20260511": "confidential-files/HRIS Payroll Computation April 26 - May 10, 2026.xlsx",
	"PP-20260626-20260711": "confidential-files/june26-july10/HRIS Payroll Computation June_26 - July 10, 2026.xlsx",
	"PP-20260711-20260726": "confidential-files/july11-july25/HRIS Payroll Computation July 11 - 25, 2026.xlsx",
};

function parseArgs(argv) {
	const args = {};
	for (const raw of argv.slice(2)) {
		const m = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(raw);
		if (m) args[m[1]] = m[2] === undefined ? true : m[2];
	}
	return args;
}

async function resolvePeriod(periodRef) {
	process.env.PG_DATABASE_URL =
		process.env.PG_DATABASE_URL ||
		process.env.DATABASE_URL ||
		"postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public";
	process.env.DATABASE_URL = process.env.PG_DATABASE_URL;
	const { PrismaClient } = await import("../generated/prisma/index.js").catch(() =>
		import("../generated/prisma-postgres/index.js"),
	);
	const prisma = new PrismaClient();
	try {
		return await prisma.payrollPeriod.findFirst({
			where: {
				isDeleted: false,
				OR: [{ code: periodRef }, { id: periodRef }],
			},
			select: { id: true, code: true, startDate: true, endDate: true, status: true },
		});
	} finally {
		await prisma.$disconnect();
	}
}

function loadTargetRows(targetXlsx) {
	const wb = XLSX.readFile(targetXlsx, { cellDates: true });
	let ws = wb.Sheets.Sheet2;
	if (!ws) {
		const candidate = wb.SheetNames.find((name) => {
			const probe = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null });
			return probe.slice(0, 8).some((r) => (r || []).some((c) => String(c ?? "").trim() === "Emp. No."));
		});
		if (!candidate) throw new Error(`No sheet with "Emp. No." header found in ${targetXlsx}`);
		ws = wb.Sheets[candidate];
	}
	const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

	// Header row: index 3 in client registers; fall back to first row containing "Emp. No.".
	let headerIndex = rows.findIndex(
		(r, i) => i <= 8 && (r || []).some((c) => String(c ?? "").trim() === "Emp. No."),
	);
	if (headerIndex < 0) headerIndex = 3;
	const headers = (rows[headerIndex] || []).map((h) => String(h ?? "").trim());
	const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
	const missingCols = TALLY_KEY_FIELDS.filter((f) => !(f.target in idx)).map((f) => f.target);

	const byCode = new Map();
	for (let i = headerIndex + 1; i < rows.length; i++) {
		const r = rows[i];
		if (!r) continue;
		const code = normCode(r[idx["Emp. No."]]);
		if (!code) continue;
		const rec = { code, name: String(r[idx["Employee Name"]] || "").trim(), row: i + 1 };
		for (const f of TALLY_KEY_FIELDS) rec[f.key] = money(r[idx[f.target]]);
		byCode.set(code, rec);
	}
	return { byCode, missingCols, rowCount: byCode.size };
}

async function login() {
	const res = await fetch(`${API}/api/auth/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: "admin@bandai.local", password: "password123", appCode: "hris" }),
	});
	if (!res.ok) throw new Error(`login ${res.status}`);
	const json = await res.json();
	if (!json?.data?.token) throw new Error("no token");
	return json.data.token;
}

async function fetchAllPreview(token, periodId, limit) {
	const headers = { Authorization: `Bearer ${token}` };
	const byCode = new Map();
	let page = 1;
	let totalPages = 1;
	let summary = null;
	const t0 = Date.now();
	while (page <= totalPages) {
		const url = `${API}/api/payrollperiod/${periodId}/generate-timesheet/preview?calculateRows=true&page=${page}&limit=${limit}`;
		const res = await fetch(url, { headers });
		if (!res.ok) throw new Error(`preview page ${page} ${res.status}: ${(await res.text()).slice(0, 300)}`);
		const json = await res.json();
		const data = json.data || {};
		if (!summary) summary = data.summary || {};
		const pag = data.pagination || {};
		const total = Number(pag.total ?? summary.includedEmployeesCount ?? 0);
		totalPages = pag.totalPages ? Number(pag.totalPages) : Math.max(1, Math.ceil(total / limit) || 1);
		for (const row of data.includedEmployees || []) {
			const code = normCode(row.employeeCode);
			if (!code) continue;
			const reg = row.payrollRegister || {};
			byCode.set(code, {
				code,
				name: row.name || "",
				gross: money(row.grossPay ?? reg.grossPay),
				net: money(row.netPay ?? reg.netPay),
				totalReceivable: money(row.totalReceivable ?? reg.totalReceivable),
				ot: money(row.overtimePay ?? reg.overtimePay),
				totalDedn: money(row.totalDeductions ?? reg.totalDeductions),
				monthlySalary: money(reg.monthlySalary),
				numberOfDays: money(reg.numberOfDays),
				basicPay: money(reg.basicPay ?? row.basicPay),
				absent: money(reg.absentDeduction ?? row.deductions?.absentDeduction),
				late: money(reg.lateUndertimeAmount ?? row.deductions?.lateDeduction),
				regOtHrs: money(reg.regularOtHours),
				aon: money(reg.adjustmentOtNd),
				dma: money(reg.deMinimisAllowance),
				tax: money(reg.taxAmount ?? row.deductions?.taxAmount),
				mhdmf2: money(reg.modifiedHdmf2),
				rcbc: money(reg.rcbcLoan),
				hdmfSl: money(reg.hdmfSalaryLoan),
				sssSl: money(reg.sssSalaryLoan),
				arp: money(reg.attendanceRecognitionProgram),
				leavePay: money(reg.leavePay ?? row.leavePay),
				pfa: money(reg.perfectAttendance),
				mla: money(reg.mealAllowance),
				receivableOnly: money(row.metadata?.payrollSourceAmounts?.receivableOnlyBenefits),
				sourceCodes: (row.metadata?.payrollSourceDetails || []).map((d) => d.code).filter(Boolean),
			});
		}
		console.log(JSON.stringify({ page, totalPages, cumulative: byCode.size, elapsedSec: ((Date.now() - t0) / 1000).toFixed(1) }));
		page += 1;
		if ((data.includedEmployees || []).length === 0) break;
	}
	return { byCode, summary };
}

function writeCompareCsv(outPath, results) {
	const keys = ["band", "code", "name", ...TALLY_KEY_FIELDS.map((f) => `t_${f.key}`), ...TALLY_KEY_FIELDS.map((f) => `a_${f.key}`), "d_totalReceivable"];
	const esc = (v) => {
		const s = v == null ? "" : String(v);
		return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const lines = [keys.join(",")];
	for (const r of results) {
		const vals = [
			r.band, r.code, r.name,
			...TALLY_KEY_FIELDS.map((f) => r.target[f.key]),
			...TALLY_KEY_FIELDS.map((f) => r.app[f.key] ?? 0),
			r.deltas?.totalReceivable ?? "",
		];
		lines.push(vals.map(esc).join(","));
	}
	fs.writeFileSync(outPath, lines.join("\n"), "utf8");
}

async function main() {
	const args = parseArgs(process.argv);
	const periodRef = args.period;
	if (!periodRef || typeof periodRef !== "string") {
		console.error("Usage: npx tsx scripts/run-period-tally-compare.mjs --period=<CODE|id> [--target-xlsx=path] [--password=9090] [--limit=50]");
		console.error(`Known cutoff targets: ${Object.keys(KNOWN_TARGETS).join(", ")}`);
		process.exit(1);
	}
	const tol = Number(args.tol ?? 0.05);
	const nearTol = Number(args["near-tol"] ?? args.nearTol ?? 10);
	const limit = Number(args.limit ?? 50);

	console.log(`Resolving period ${periodRef}...`);
	const period = await resolvePeriod(periodRef);
	if (!period) {
		console.error(`Period not found for "${periodRef}".`);
		process.exit(1);
	}
	const periodCode = period.code || period.id;
	console.log(`Period: ${periodCode} (${new Date(period.startDate).toISOString().slice(0, 10)}..${new Date(period.endDate).toISOString().slice(0, 10)}) status=${period.status}`);

	let targetPath = typeof args["target-xlsx"] === "string" ? args["target-xlsx"] : null;
	if (!targetPath) {
		const known = KNOWN_TARGETS[periodCode] || KNOWN_TARGETS[periodRef];
		if (!known) {
			console.error(`No known Sheet2 register for ${periodCode}. Pass --target-xlsx=<path>. Known: ${Object.keys(KNOWN_TARGETS).join(", ")}`);
			process.exit(1);
		}
		targetPath = path.join(ROOT, known);
	}
	if (!fs.existsSync(targetPath)) {
		console.error(`Target workbook not found: ${targetPath}`);
		process.exit(1);
	}

	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const outDir = path.join(ROOT, ".runtime", `tally-${periodCode}-${stamp}`);
	fs.mkdirSync(outDir, { recursive: true });

	console.log("Ensuring readable (unlocked) register workbook...");
	const unlock = ensureUnlockedWorkbook({
		workbookPath: targetPath,
		password: typeof args.password === "string" ? args.password : DEFAULT_PASSWORD,
		outputDir: fs.realpathSync(os.tmpdir()),
	});
	if (!unlock.succeeded) {
		console.error(`Workbook unlock failed: ${unlock.message}`);
		process.exit(1);
	}
	console.log(`Register: ${unlock.workbookPath} (method=${unlock.method})`);

	const target = loadTargetRows(unlock.workbookPath);
	console.log(`Target employees: ${target.rowCount}${target.missingCols.length ? ` | MISSING COLUMNS: ${target.missingCols.join(", ")}` : ""}`);

	console.log("Login + live payroll preview...");
	const token = await login();
	const app = await fetchAllPreview(token, period.id, limit);
	console.log(`App employees with register calc: ${app.byCode.size}`);

	const results = [];
	const onlyTarget = [];
	const onlyApp = [];
	for (const [code, t] of target.byCode) {
		const a = app.byCode.get(code);
		if (!a) {
			onlyTarget.push({ code, name: t.name, totalReceivable: t.totalReceivable });
			continue;
		}
		const c = classifyTally(t, a, { tol, nearTol });
		results.push({
			code,
			name: t.name,
			appName: a.name,
			band: c.band,
			matchCount: c.matchCount,
			compared: c.compared,
			deltas: c.deltas,
			fieldMatch: c.fieldMatch,
			target: Object.fromEntries(TALLY_KEY_FIELDS.map((f) => [f.key, t[f.key]])),
			app: Object.fromEntries(TALLY_KEY_FIELDS.map((f) => [f.key, a[f.key] ?? 0])),
			absDeltaTotal: c.absDeltaTotal,
			absDeltaGross: c.absDeltaGross,
		});
	}
	for (const [code, a] of app.byCode) {
		if (!target.byCode.has(code)) onlyApp.push({ code, name: a.name, totalReceivable: a.totalReceivable });
	}

	const bands = bucketBands(results);
	const samples = [...results]
		.sort((x, y) => y.absDeltaTotal - x.absDeltaTotal)
		.slice(0, 5)
		.map((r) => ({ code: r.code, band: r.band, dTotal: r.deltas.totalReceivable }));

	const summaryJson = {
		period: { id: period.id, code: periodCode, start: period.startDate, end: period.endDate, status: period.status },
		register: { source: targetPath, unlockedCopy: unlock.workbookPath, unlockMethod: unlock.method },
		compared: results.length,
		onlyInRegister: onlyTarget.length,
		onlyInApp: onlyApp.length,
		tallied: bands.TALLIED || 0,
		bands,
		samples,
		keyFields: TALLY_KEY_FIELDS.map((f) => f.key),
		finishedAt: new Date().toISOString(),
	};

	fs.writeFileSync(path.join(outDir, "all-results.json"), JSON.stringify(results, null, 1));
	fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summaryJson, null, 2));
	writeCompareCsv(path.join(outDir, "compare.csv"), results);

	const md = [
		`# Payroll tally compare — ${periodCode}`,
		``,
		`| Metric | Value |`,
		`|---|---|`,
		`| Window | ${new Date(period.startDate).toISOString().slice(0, 10)} .. ${new Date(period.endDate).toISOString().slice(0, 10)} |`,
		`| Register (Sheet2) | ${path.basename(unlock.workbookPath)} (${unlock.method}) |`,
		`| Compared | **${results.length}** |`,
		`| TALLIED | **${bands.TALLIED || 0}** |`,
		`| Bands | ${Object.entries(bands).map(([k, v]) => `${k} ${v}`).join(" · ")} |`,
		`| Only in register / only in app | ${onlyTarget.length} / ${onlyApp.length} |`,
		``,
		`Largest TR deltas: ${samples.map((s) => `${s.code} ${s.band} Δ${Number(s.dTotal).toFixed(2)}`).join("; ")}`,
		``,
		`Next: fix data walls per band class; re-run this script after repairs.`,
	].join("\n");
	fs.writeFileSync(path.join(outDir, "REPORT.md"), md);

	console.log("\n=== SUMMARY ===");
	console.log(JSON.stringify(summaryJson, null, 2));
	console.log(`OUT ${outDir}`);
}

main().catch((e) => {
	console.error("TALLY COMPARE FAILED:", e?.message || e);
	process.exit(1);
});
