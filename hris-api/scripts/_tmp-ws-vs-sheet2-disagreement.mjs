/**
 * WS-vs-Sheet2 disagreement report (Jul 11-25 absent wall).
 *
 * Classifies every Sheet2 absent-charged employee against the client's own
 * WorkSharing flags:
 *   A  WS-OFF contradiction : worked all WS-ON days, Sheet2 still charges absent
 *   B  Genuine absence      : WS-ON days > worked days (absence real per WS;
 *                             app not charging it would be an app/data fault)
 *   C  Partial / other
 * Also emits a day-by-day sample for one employee per class.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const WS = path.join(root, "confidential-files/july11-july25/WorkSharingSchedule - July 11-25, 2026.xlsx");
const TARGET = path.join(root, ".runtime/tally-jul11-25-20260817/hris_payroll_jul11_unlocked.xlsx");
const OUT = path.join(root, ".runtime", `ws-vs-sheet2-disagreement-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13)}`);
fs.mkdirSync(OUT, { recursive: true });

const money = (v) => (v == null || v === "" ? 0 : typeof v === "number" ? v : Number(String(v).replace(/,/g, "")) || 0);
const N = (s) => (/^\d+$/.test(String(s ?? "").trim()) ? String(s).trim().padStart(5, "0") : "");
const WINDOW = ["2026-07-11", "2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19", "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24", "2026-07-25"];

// ---- WorkSharing flags ----
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
const ws = new Map(); // code -> {onDays: string[], offDays: string[], shift}
for (let i = 1; i < wsRows.length; i++) {
	const r = wsRows[i];
	if (!r) continue;
	const code = N(r[0]) || N(r[1]);
	if (!code) continue;
	const onDays = [], offDays = [];
	for (const dc of dateCols) {
		const v = String(r[dc.col] ?? "").trim();
		if (!WINDOW.includes(dc.iso)) continue;
		if (v === "1") onDays.push(dc.iso);
		else if (v === "0") offDays.push(dc.iso);
	}
	ws.set(code, { onDays, offDays, shift: String(r[5] ?? "").trim() });
}

// ---- Sheet2 ----
const wb = XLSX.readFile(TARGET, { cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets.Sheet2, { header: 1, defval: null, raw: true });
const headers = rows[3].map((h) => (h == null ? "" : String(h).trim()));
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
const s2 = new Map();
for (let i = 4; i < rows.length; i++) {
	const r = rows[i];
	if (!r) continue;
	const code = N(r[idx["Emp. No."]]);
	if (!code) continue;
	s2.set(code, {
		absent: money(r[idx["Absent-Amt"]]),
		days: money(r[idx["No. of Days"]]),
		monthly: money(r[idx["Monthly Salary"]]),
		daily: money(r[idx["Daily Salary"]]),
		name: String(r[idx["Employee Name"]] || "").trim(),
	});
}

// ---- Classify ----
const classes = { A_contradiction: [], B_genuine: [], C_partial: [], notInWS: [], noRate: [] };
for (const [code, t] of s2) {
	if (!(t.absent > 0)) continue;
	const rate = t.monthly > 0 ? (t.monthly * 12) / 313 : t.daily > 0 ? (t.daily * 12) / 313 : 0;
	if (!(rate > 0)) {
		classes.noRate.push({ code, absent: t.absent });
		continue;
	}
	const absentDays = Math.round((t.absent / rate) * 100) / 100;
	const w = ws.get(code);
	if (!w) {
		classes.notInWS.push({ code, absentDays });
		continue;
	}
	const gap = w.onDays.length - t.days; // WS-scheduled work minus actually-worked(paid) days
	const rec = {
		code,
		name: t.name,
		sheetAbsent: t.absent,
		sheetAbsentDays: absentDays,
		workedDays: t.days,
		wsOnDays: w.onDays.length,
		wsOffDays: w.offDays.length,
		wsOffSample: w.offDays.slice(0, 6),
	};
	if (gap <= 0.01) classes.A_contradiction.push(rec);
	else if (gap >= 0.5) classes.B_genuine.push(rec);
	else classes.C_partial.push(rec);
}

// ---- Samples: one day-by-day per class (from WS + Sheet2 numbers) ----
function sampleFor(rec) {
	const w = ws.get(rec.code);
	const days = WINDOW.map((d) => ({
		date: d,
		wsFlag: w.onDays.includes(d) ? 1 : w.offDays.includes(d) ? 0 : null,
	}));
	return { ...rec, dayByDay: days };
}
const sampleA = classes.A_contradiction[0] ? sampleFor(classes.A_contradiction[0]) : null;
const sampleB = classes.B_genuine[0] ? sampleFor(classes.B_genuine[0]) : null;

const summary = {
	generatedAt: new Date().toISOString(),
	window: "2026-07-11..2026-07-25",
	totalSheet2AbsentPeople: classes.A_contradiction.length + classes.B_genuine.length + classes.C_partial.length + classes.notInWS.length + classes.noRate.length,
	counts: {
		A_wsOffContradiction: classes.A_contradiction.length,
		B_genuineAbsencePerWS: classes.B_genuine.length,
		C_partial: classes.C_partial.length,
		notInWSFile: classes.notInWS.length,
		noRateDerived: classes.noRate.length,
	},
	sampleA,
	sampleB,
};
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ ...summary, A: classes.A_contradiction, B: classes.B_genuine, C: classes.C_partial, notInWS: classes.notInWS }, null, 2));

const md = [];
md.push(`# WorkSharing vs Sheet2 disagreement — Jul 11–25 absent wall`);
md.push("");
md.push(`Sheet2 absent-charged people: **${summary.totalSheet2AbsentPeople}**`);
md.push("");
md.push(`| Class | Meaning | People |`);
md.push(`|---|---|---:|`);
md.push(`| A | WS flags OFF, worked all WS-ON days, Sheet2 still charges absent → **client file contradiction** | ${classes.A_contradiction.length} |`);
md.push(`| B | WS-ON days > worked days → genuine absence per WS (app should charge) | ${classes.B_genuine.length} |`);
md.push(`| C | Partial (0 < gap < 0.5 day) | ${classes.C_partial.length} |`);
md.push(`| — | Not in WS file | ${classes.notInWS.length} |`);
md.push(`| — | Rate not derivable | ${classes.noRate.length} |`);
md.push("");
if (sampleA) {
	md.push(`## Sample A (contradiction) — ${sampleA.code} ${sampleA.name}`);
	md.push("");
	md.push(`Sheet2 absent: ₱${sampleA.sheetAbsent} (${sampleA.sheetAbsentDays} day(s) at monthly×12/313) · worked ${sampleA.workedDays}d · WS ON ${sampleA.wsOnDays}d / OFF ${sampleA.wsOffDays}d`);
	md.push("");
	md.push(`| Date | WS flag (1=work, 0=off) |`);
	md.push(`|---|---|`);
	for (const d of sampleA.dayByDay) md.push(`| ${d.date} | ${d.wsFlag ?? "—"} |`);
	md.push("");
}
if (sampleB) {
	md.push(`## Sample B (genuine absence per WS) — ${sampleB.code} ${sampleB.name}`);
	md.push("");
	md.push(`Sheet2 absent: ₱${sampleB.sheetAbsent} (${sampleB.sheetAbsentDays}d) · worked ${sampleB.workedDays}d · WS ON ${sampleB.wsOnDays}d → gap ${sampleB.wsOnDays - sampleB.workedDays}d`);
	md.push("");
	md.push(`| Date | WS flag |`);
	md.push(`|---|---|`);
	for (const d of sampleB.dayByDay) md.push(`| ${d.date} | ${d.wsFlag ?? "—"} |`);
	md.push("");
}
fs.writeFileSync(path.join(OUT, "REPORT.md"), md.join("\n"));
console.log(JSON.stringify(summary, null, 1));
console.log("OUT", OUT);
