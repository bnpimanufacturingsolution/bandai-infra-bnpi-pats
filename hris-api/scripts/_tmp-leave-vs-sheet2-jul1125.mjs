/**
 * Refined: which leave sheet matches Sheet2, and does Leave$ = days x (Monthly x 12 / 313)
 * for monthly-rated + days x dailySalary for Path A?
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const LEAVE_XLSX = path.join(ROOT, "confidential-files", "Leave (July 1-31, 2026).xlsx");
const SHEET2_XLSX = path.join(ROOT, ".runtime", "tally-jul11-25-20260817", "hris_payroll_jul11_unlocked.xlsx");
const OUT = path.join(ROOT, ".runtime", `leave-vs-sheet2-refined-${Date.now()}`);
fs.mkdirSync(OUT, { recursive: true });

const WIN_START = new Date(2026, 6, 11);
const WIN_END = new Date(2026, 6, 25);

function normCode(v) {
	const s = String(v ?? "").trim();
	if (!s || s === "undefined" || s === "null") return "";
	if (/^\d+$/.test(s)) return s.padStart(5, "0");
	return s;
}
function money(v) {
	if (v == null || v === "" || v === "-") return 0;
	if (typeof v === "number") return v;
	const n = Number(String(v).replace(/,/g, ""));
	return Number.isFinite(n) ? n : 0;
}
function parseDate(v) {
	if (!v) return null;
	if (v instanceof Date && !isNaN(v)) return v;
	const m = String(v).trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
	if (m) {
		let y = Number(m[3]);
		if (y < 100) y += 2000;
		return new Date(y, Number(m[1]) - 1, Number(m[2]));
	}
	const d = new Date(v);
	return isNaN(d) ? null : d;
}

const lwb = XLSX.readFile(LEAVE_XLSX, { cellDates: true });
function loadLeaveSheet(name) {
	const rows = XLSX.utils.sheet_to_json(lwb.Sheets[name], { defval: null, raw: false });
	return rows.map((r) => ({
		code: normCode(r.EmployeeNumber),
		date: parseDate(r.DateOfLeave),
		type: String(r.LeaveType || "").trim().toUpperCase(),
		days: money(r.Days),
		paid: String(r.PaidUnpaid || "").trim().toLowerCase(),
		status: String(r.CurrentStatus || "").trim().toLowerCase(),
	}));
}

// ---- Sheet2 ----
const wb = XLSX.readFile(SHEET2_XLSX, { cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets.Sheet2, { header: 1, defval: null, raw: true });
const headers = rows[3].map((h) => (h == null ? "" : String(h).trim()));
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
const target = new Map();
for (let i = 4; i < rows.length; i++) {
	const r = rows[i];
	if (!r) continue;
	const code = normCode(r[idx["Emp. No."]]);
	if (!code || /grand total/i.test(code)) continue;
	target.set(code, {
		code,
		leave: money(r[idx["Leave"]]),
		dailySalary: money(r[idx["Daily Salary"]]),
		basic: money(r[idx["Basic Salary"]]),
		noDays: money(r[idx["No. of Days"]]),
		monthly: money(r[idx["Monthly Salary"]]),
	});
}
const s2LeavePeople = [...target.values()].filter((t) => t.leave > 0);

function analyze(sheetName) {
	const leaveRows = loadLeaveSheet(sheetName);
	const inWindow = leaveRows.filter(
		(r) => r.date && r.date >= WIN_START && r.date <= WIN_END && r.paid === "paid"
	);
	const daysByEmp = new Map();
	for (const r of inWindow) daysByEmp.set(r.code, (daysByEmp.get(r.code) || 0) + r.days);

	let covered = 0;
	const uncoveredCodes = [];
	for (const t of s2LeavePeople) {
		if (daysByEmp.has(t.code)) covered++;
		else uncoveredCodes.push(t.code);
	}
	const extraInFile = [...daysByEmp.keys()].filter((c) => !(target.get(c)?.leave > 0));

	// Money tests among Sheet2-leave∩file people
	let pathA = 0, pathB313 = 0, fail = 0, noMonthly = 0;
	const failSamples = [];
	for (const [code, days] of daysByEmp) {
		const t = target.get(code);
		if (!t || t.leave <= 0) continue;
		const expA = t.dailySalary > 0 ? days * t.dailySalary : null;
		const expB = t.monthly > 0 ? days * ((t.monthly * 12) / 313) : null;
		const okA = expA != null && Math.abs(expA - t.leave) <= 1;
		const okB = expB != null && Math.abs(expB - t.leave) <= 1;
		if (okA) pathA++;
		else if (okB) pathB313++;
		else {
			fail++;
			if (t.monthly <= 0) noMonthly++;
			if (failSamples.length < 15)
				failSamples.push({ code, days: +days.toFixed(2), s2Leave: t.leave, dailySalary: t.dailySalary, monthly: t.monthly });
		}
	}
	return {
		sheetName,
		rowsTotal: leaveRows.length,
		paidRowsInWindow: inWindow.length,
		empsWithPaidLeaveInWindow: daysByEmp.size,
		totalPaidDays: +[...daysByEmp.values()].reduce((a, b) => a + b, 0).toFixed(2),
		coverage: { s2LeavePeople: s2LeavePeople.length, covered, uncoveredCodes },
		extraInFile,
		money: { pathA_daily: pathA, pathB_313: pathB313, fail, noMonthlyAmongFail: noMonthly, failSamples },
	};
}

const r1 = analyze("Leave (1)");
const r2 = analyze("Leave (2)");

const report = { generatedAt: new Date().toISOString(), sheet2: { totalPeople: target.size, leavePeople: s2LeavePeople.length, sumLeave: +s2LeavePeople.reduce((a, t) => a + t.leave, 0).toFixed(2) }, leave1: r1, leave2: r2 };
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log("OUT", OUT);
