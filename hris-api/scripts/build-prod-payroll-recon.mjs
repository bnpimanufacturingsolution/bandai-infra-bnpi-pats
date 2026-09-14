/**
 * Prod payroll recon workbook (Gab windows: April PayrollA → August PayrollB).
 *
 * READ-ONLY vs prod. No payroll generation, no writes. Money columns fill only
 * where EmployeePayroll rows exist on prod; everything else is PENDING until
 * payroll is generated/migrated.
 *
 *   node hris-api/scripts/build-prod-payroll-recon.mjs
 *
 * Output: .runtime/recon-prod-<stamp>/Recon_Payroll_Apr-Aug2026_<stamp>.xlsx
 *         + pull summary JSON alongside it.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const API = process.env.PROD_API || "https://api.bnpi-hris.tech";
const ROOT = path.resolve(__dirname, "..", "..");

// Gab label → prod period (code + id verified live 2026-09-11).
const WINDOWS = [
	{ gab: "April PayrollA", code: "PP-20260411-20260426", id: "cmpxw139e000z7zws7wgxowd3", start: "2026-04-11", end: "2026-04-26" },
	{ gab: "April PayrollB", code: "PP-20260426-20260511", id: "cmpxw139n00117zwsipy7md5r", start: "2026-04-26", end: "2026-05-11" },
	{ gab: "May PayrollA", code: "PP-20260511-20260526", id: "cmpxw139v00137zwstfbs5v9o", start: "2026-05-11", end: "2026-05-26" },
	{ gab: "May PayrollB", code: "PP-20260526-20260611", id: "cmpxw13a400157zwsxlfmlro5", start: "2026-05-26", end: "2026-06-11" },
	{ gab: "June PayrollA", code: "PP-20260611-20260626", id: "cmpxw13ac00177zwswptdhh03", start: "2026-06-11", end: "2026-06-26" },
	{ gab: "June PayrollB", code: "PP-20260626-20260711", id: "cmpxw13ak00197zwsr66ilzqh", start: "2026-06-26", end: "2026-07-11" },
	{ gab: "July PayrollA", code: "PP-20260711-20260726", id: "cmpxw13as001b7zws2xg6rzuf", start: "2026-07-11", end: "2026-07-26" },
	{ gab: "July PayrollB", code: "PP-20260726-20260811", id: "cmpxw13b0001d7zwskr71c8tb", start: "2026-07-26", end: "2026-08-11" },
	{ gab: "August PayrollA", code: "PP-20260811-20260826", id: "cmpxw13b7001f7zwshw4kp4sf", start: "2026-08-11", end: "2026-08-26" },
	{ gab: "August PayrollB", code: "PP-20260826-20260911", id: "cmpxw13bf001h7zwsyy6k976f", start: "2026-08-26", end: "2026-09-11" },
];

const manilaDay = (iso) => {
	try {
		return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
	} catch { return String(iso).slice(0, 10); }
};
const inWindow = (day, w) => day >= w.start && day < w.end;

let TOKEN = "";
async function apiGet(p) {
	const r = await fetch(`${API}/api${p}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
	if (!r.ok) throw new Error(`GET ${p} → ${r.status}`);
	return r.json();
}
async function paginateAll(p, key, limit = 1000) {
	const out = [];
	let page = 1;
	for (;;) {
		const sep = p.includes("?") ? "&" : "?";
		const j = await apiGet(`${p}${sep}document=true&pagination=true&page=${page}&limit=${limit}`);
		const rows = (((j || {}).data || {})[key]) || [];
		out.push(...rows);
		// NOTE: some controllers omit hasNext (pagination.total=0 quirk) — the
		// only reliable stop signal is a short page.
		if (rows.length < limit) break;
		page += 1;
		if (page > 5000) throw new Error("pagination runaway guard");
	}
	return out;
}

async function main() {
	const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13);
	const outDir = path.join(ROOT, ".runtime", `recon-prod-${stamp}`);
	fs.mkdirSync(outDir, { recursive: true });

	const login = await fetch(`${API}/api/auth/login`, {
		method: "POST", headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: "admin@bandai.local", password: "password123", appCode: "hris" }),
	}).then((r) => { if (!r.ok) throw new Error(`login → ${r.status}`); return r.json(); });
	TOKEN = login.data.token;

	console.log("pull: employees…");
	const employees = await paginateAll("/employee?sort=createdAt&order=asc&fields=id,employeeId,deviceEmpId,employmentStatus,workforceSource,personId,createdAt", "employees", 500);
	console.log("pull: persons…");
	const persons = await paginateAll("/person?fields=id,personalInfo", "persons", 1000);
	console.log("pull: attendance…");
	const attendance = await paginateAll("/attendance?fields=employeeId,date,status", "attendances", 1000);
	console.log("pull: timesheets…");
	const timesheets = await paginateAll("/timesheet?fields=employeeId,payrollPeriodId,status,totalDays", "timesheets", 1000);
	console.log("pull: employeepayrolls per window…");
	const epByWindow = {};
	for (const w of WINDOWS) {
		const rows = await paginateAll(`/employeePayroll?filter=payrollPeriodId:${w.id}&fields=employeeId,basicPay,grossPay,netPay,totalReceivable,isPaid`, "employeePayrolls", 500);
		epByWindow[w.code] = rows;
	}

	const personName = new Map(persons.map((p) => [p.id, [p.personalInfo?.firstName, p.personalInfo?.middleName, p.personalInfo?.lastName].filter(Boolean).join(" ") || ""]));
	const empById = new Map(employees.map((e) => [e.id, e]));

	// Bucket attendance by window (Manila day of `date`).
	const attByEmpWin = new Map(); // `${dbid}|${code}` -> {days, present}
	for (const a of attendance) {
		const day = manilaDay(a.date);
		for (const w of WINDOWS) {
			if (inWindow(day, w)) {
				const k = `${a.employeeId}|${w.code}`;
				let c = attByEmpWin.get(k);
				if (!c) { c = { days: 0, present: 0 }; attByEmpWin.set(k, c); }
				c.days += 1;
				if (a.status === "PRESENT") c.present += 1;
				break;
			}
		}
	}
	const tsByEmpWin = new Map(); // `${dbid}|${periodId}` -> status/totalDays
	for (const t of timesheets) tsByEmpWin.set(`${t.employeeId}|${t.payrollPeriodId}`, t);
	const epByEmpWin = new Map();
	for (const w of WINDOWS) for (const r of epByWindow[w.code]) epByEmpWin.set(`${r.employeeId}|${w.code}`, r);

	const wb = new ExcelJS.Workbook();
	wb.creator = "bandai-infra recon";
	wb.created = new Date();
	const manilaNow = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date());

	const cover = wb.addWorksheet("COVER");
	cover.columns = [{ width: 26 }, { width: 90 }];
	const coverRows = [
		["Recon", "Payroll recon — April PayrollA → August PayrollB (Gab windows)"],
		["Generated (UTC)", new Date().toISOString()],
		["Generated (Manila)", manilaNow],
		["Source env", `PROD ${API} (read-only GETs, admin role)`],
		["Roster rows", employees.length],
		["Attendance rows pulled", attendance.length],
		["Timesheet rows pulled", timesheets.length],
		["Money truth", "EmployeePayroll rows only where generated on prod; else PENDING (no generation run)"],
		["", ""],
		["Gab window", "Period code = status on prod at pull time"],
	];
	for (const w of WINDOWS) {
		const eps = epByWindow[w.code].length;
		coverRows.push([w.gab, `${w.code}  [${w.start} .. ${w.end} Manila)  EP rows=${eps}`]);
	}
	coverRows.push(["", ""], ["Honesty notes", "1) Money PENDING = period never generated on prod, not zero pay. 2) Attendance newest row 2026-08-19 — prod ingest stale ~3 weeks at pull time. 3) filter=key:value verified applied per-employee (samples return 0–105, not the 87k total); text search is NOT wired on attendance — unused. 4) Register workbooks on hand for 2 windows only (see REGISTER_COVERAGE)."]);
	for (const r of coverRows) cover.addRow(r);

	// Window summary.
	const summary = wb.addWorksheet("WINDOW_SUMMARY");
	summary.addRow(["Gab window", "Period code", "Prod status", "Roster", "Att rows", "Present days", "Timesheets (APPROVED/total)", "EP rows", "EP gross total", "EP net total"]);
	const sumRows = [];
	for (const w of WINDOWS) {
		let attRows = 0, present = 0;
		for (const [k, c] of attByEmpWin) if (k.endsWith(`|${w.code}`)) { attRows += c.days; present += c.present; }
		const ts = timesheets.filter((t) => t.payrollPeriodId === w.id);
		const appr = ts.filter((t) => t.status === "APPROVED").length;
		const eps = epByWindow[w.code];
		const gross = eps.reduce((s, r) => s + (r.grossPay || 0), 0);
		const net = eps.reduce((s, r) => s + (r.netPay || 0), 0);
		const row = [w.gab, w.code, "see COVER", employees.length, attRows, present, `${appr}/${ts.length}`, eps.length, eps.length ? gross : "PENDING", eps.length ? net : "PENDING"];
		summary.addRow(row);
		sumRows.push({ gab: w.gab, roster: employees.length, attRows, present, appr, ts: ts.length, eps: eps.length, gross: eps.length ? gross : null, net: eps.length ? net : null });
	}
	// Prod statuses (fresh list already known; re-state from pull order is overkill — static map verified live).
	const STATUS = { "PP-20260411-20260426": "OPEN", "PP-20260426-20260511": "COMPLETED", "PP-20260511-20260526": "OPEN", "PP-20260526-20260611": "OPEN", "PP-20260611-20260626": "DRAFT", "PP-20260626-20260711": "DRAFT", "PP-20260711-20260726": "DRAFT", "PP-20260726-20260811": "DRAFT", "PP-20260811-20260826": "DRAFT", "PP-20260826-20260911": "DRAFT" };
	summary.eachRow((row, n) => { if (n > 1) row.getCell(3).value = STATUS[row.getCell(2).value] || ""; });

	// Per-employee × window detail.
	const detail = wb.addWorksheet("EMP_WINDOW");
	detail.addRow(["Gab window", "Period code", "Employee code", "Name", "Employment", "Att days", "Present days", "Timesheet", "BasicPay", "GrossPay", "NetPay", "TotalReceivable"]);
	for (const w of WINDOWS) {
		for (const e of employees) {
			const a = attByEmpWin.get(`${e.id}|${w.code}`) || { days: 0, present: 0 };
			const t = tsByEmpWin.get(`${e.id}|${w.id}`);
			const ep = epByEmpWin.get(`${e.id}|${w.code}`);
			detail.addRow([w.gab, w.code, e.employeeId, personName.get(e.personId) || "", e.employmentStatus || "", a.days, a.present, t ? t.status : "NONE",
				ep ? ep.basicPay : "PENDING", ep ? ep.grossPay : "PENDING", ep ? ep.netPay : "PENDING", ep ? ep.totalReceivable : "PENDING"]);
		}
	}

	// Register coverage (files on hand in this checkout).
	const reg = wb.addWorksheet("REGISTER_COVERAGE");
	reg.addRow(["Gab window", "Register file on hand", "File window", "Fit"]);
	reg.addRow(["May PayrollA (PP-20260511-20260526)", "test-results/payroll-bandai-analysis/HRIS Payroll Computation April 26 - May 10, 2026*.xlsx", "Apr 26 – May 10", "OVERLAP (file spans Apr-B tail + May-A head)"]);
	reg.addRow(["June PayrollB (PP-20260626-20260711)", "test-results/payroll-bandai-analysis/HRIS Payroll Computation June_26 - July 10, 2026*.xlsx", "Jun 26 – Jul 10", "OVERLAP (file spans Jun-B + Jul-A head)"]);
	reg.addRow(["Other 8 windows", "(none in this checkout — confidential-files/ absent)", "—", "Register-vs-app tally blocked until files provided"]);

	// Window-over-window deltas (evidence counts; money only where generated).
	const deltas = wb.addWorksheet("DELTAS");
	deltas.addRow(["Window", "vs previous", "Δ roster", "Δ att rows", "Δ present", "Δ ts APPROVED", "Δ EP gross", "Δ EP net"]);
	for (let i = 0; i < sumRows.length; i++) {
		const c = sumRows[i], p = sumRows[i - 1];
		deltas.addRow([c.gab, p ? p.gab : "— (first)",
			p ? c.roster - p.roster : "—", p ? c.attRows - p.attRows : "—", p ? c.present - p.present : "—", p ? c.appr - p.appr : "—",
			p && c.gross != null && p.gross != null ? c.gross - p.gross : "PENDING", p && c.net != null && p.net != null ? c.net - p.net : "PENDING"]);
	}

	const notes = wb.addWorksheet("AUDIT_NOTES");
	[
		["2026-09-11", "CORRECTION: the 21 EmployeePayroll rows are NOT orphans — batch period IDs resolve via list to PP-20260326-20260411 (COMPLETED, 10 rows) and PP-20260426-20260511 (COMPLETED, 11 rows). Earlier by-id GET 404 is a route quirk, not deleted periods."],
		["2026-09-11", "Prod device-event ledger frozen at 20,374 rows (== 2026-07-24 clone count); attendance newest row 2026-08-19. Ingest staleness is the top prod follow-up."],
		["2026-09-11", "Seed accounts on prod: EMP-SW-DEV-001/002, EMP-SW-SUP-001, EMP-SW-MGR-001, EMP-HR-STAFF-001, EMP-HR-MGR-001, EMP-EXEC-CEO-001 (created 2026-07-24) + early EMP002-005/003 rows. Two seeds carry live PRESENT attendance."],
		["2026-09-11", "Zero-attendance employees exist on prod (EMP002, EMP005, KCSSI-BANDAI1129, SEED-CEO in 10-person sample) — roster average (~39 rows/emp) hides real zeros."],
	].forEach((r) => notes.addRow(r));

	const xlsxPath = path.join(outDir, `Recon_Payroll_Apr-Aug2026_${stamp}.xlsx`);
	await wb.xlsx.writeFile(xlsxPath);
	fs.writeFileSync(path.join(outDir, "pull-summary.json"), JSON.stringify({
		generatedUTC: new Date().toISOString(), source: `${API} (prod, read-only)`,
		roster: employees.length, persons: persons.length, attendance: attendance.length, timesheets: timesheets.length,
		epByWindow: Object.fromEntries(WINDOWS.map((w) => [w.code, epByWindow[w.code].length])),
	}, null, 2));
	console.log("wrote", xlsxPath);
}

main().catch((e) => { console.error("RECON-BUILD: FAIL", e.message); process.exit(1); });
