/**
 * Rich samples for the WS-vs-Sheet2 absent disagreement:
 * 5 Class A (WS-OFF contradiction) + 5 Class B (punch contradiction),
 * each with a day-by-day table: WS flag | app line status | hours.
 * Reads the existing classification summary; lines via local clone psql.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const dirs = fs.readdirSync(path.join(root, ".runtime")).filter((d) => d.startsWith("ws-vs-sheet2-disagreement-")).sort();
const SRC = path.join(root, ".runtime", dirs[dirs.length - 1]);
const summary = JSON.parse(fs.readFileSync(path.join(SRC, "summary.json"), "utf8"));
const WINDOW = ["2026-07-11","2026-07-12","2026-07-13","2026-07-14","2026-07-15","2026-07-16","2026-07-17","2026-07-18","2026-07-19","2026-07-20","2026-07-21","2026-07-22","2026-07-23","2026-07-24","2026-07-25"];

const pick = (list, n) => list.slice(0, n);
const samples = [
	...pick(summary.A, 5).map((r) => ({ ...r, cls: "A (WS-OFF contradiction)" })),
	...pick(summary.B, 5).map((r) => ({ ...r, cls: "B (punch contradiction)" })),
];
const codes = samples.map((s) => `'${s.code}'`).join(",");

// WS flags straight from the client file (XLSX date headers -> ISO)
import XLSX from "xlsx";
const WS = path.join(root, "confidential-files/july11-july25/WorkSharingSchedule - July 11-25, 2026.xlsx");
const wsw = XLSX.readFile(WS, { cellDates: true });
const wsRows = XLSX.utils.sheet_to_json(wsw.Sheets[wsw.SheetNames[0]], { header: 1, defval: null, raw: false });
const wsHdr = wsRows[0].map((h) => (h == null ? "" : String(h).trim()));
const dateCols = [];
for (let i = 0; i < wsHdr.length; i++) {
	const m = wsHdr[i].match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
	if (m) {
		const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
		let y = Number(m[3]);
		if (y < 100) y += 2000;
		dateCols.push({ col: i, iso: `${y}-${String(months[m[2]] + 1).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}` });
	}
}
const wsFlags = new Map(); // code -> Map(iso -> 0/1)
for (let i = 1; i < wsRows.length; i++) {
	const r = wsRows[i];
	if (!r) continue;
	const code = N(r[0]) || N(r[1]);
	if (!code) continue;
	const m2 = new Map();
	for (const dc of dateCols) {
		const v = String(r[dc.col] ?? "").trim();
		if (v === "1" || v === "0") m2.set(dc.iso, Number(v));
	}
	wsFlags.set(code, m2);
}

const sql = `
SELECT e."employeeId" AS code, tl.date, tl.status, tl."hoursWorked"
FROM timesheet_lines tl
JOIN timesheets ts ON ts.id = tl."timesheetId"
JOIN employees e ON e.id = ts."employeeId"
WHERE e."employeeId" IN (${codes})
  AND tl.date BETWEEN '2026-07-11' AND '2026-07-25'
ORDER BY e."employeeId", tl.date;`;
const sqlFile = path.join(SRC, "samples.sql");
fs.writeFileSync(sqlFile, sql);
const out = execSync(
	`docker exec -i hris-local-dev-clone psql -U postgres -d hris -A -t -F "|" -v ON_ERROR_STOP=1 < "${sqlFile}"`,
	{ encoding: "utf8", maxBuffer: 16 * 1024 * 1024, shell: true },
);
const lines = new Map();
for (const line of out.split("\n")) {
	if (!line.trim()) continue;
	const [code, date, status, hours] = line.split("|");
	if (!lines.has(code)) lines.set(code, new Map());
	lines.get(code).set(date, { status, hours });
}

const md = [];
md.push(`# WS-vs-Sheet2 disagreement — rich samples (5 per class)`);
md.push("");
for (const s of samples) {
	const w = summary.A.find((r) => r.code === s.code) || summary.B.find((r) => r.code === s.code);
	const offSample = w?.wsOffSample || [];
	const dayByDay = summary.A.find((r) => r.code === s.code)?.dayByDay || summary.B.find((r) => r.code === s.code)?.dayByDay || [];
	md.push(`## ${s.cls} — ${s.code} ${s.name}`);
	md.push("");
	md.push(
		`Sheet2 absent ₱${s.sheetAbsent} (${s.sheetAbsentDays} day(s) × monthly×12/313) · Sheet2 worked ${s.workedDays}d · WS ON ${s.wsOnDays}d / OFF ${s.wsOffDays}d${offSample.length ? ` (off: ${offSample.join(", ")})` : ""}`,
	);
	md.push("");
	md.push(`| Date | WS flag | App line | Hours |`);
	md.push(`|---|---|---|---|`);
	for (const d of WINDOW) {
		const wsFlag = dayByDay.find((x) => x.date === d)?.wsFlag;
		const line = lines.get(s.code)?.get(d) || { status: "—", hours: "—" };
		md.push(`| ${d} | ${wsFlag ?? "—"} | ${line.status} | ${line.hours} |`);
	}
	md.push("");
}
fs.writeFileSync(path.join(SRC, "SAMPLES.md"), md.join("\n"));
console.log(md.join("\n"));
