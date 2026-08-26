/**
 * Probe premium pay columns (RD/Hol/ND/OT components): app preview vs Sheet2.
 * Read-only. Finds where the unexplained gross gap lives.
 */
import XLSX from "xlsx";

const API = "http://localhost:3001";
const PERIOD_ID = "cmryhzl500032vgakz1uy1k7l";
const TARGET = "../.runtime/tally-jul11-25-20260817/hris_payroll_jul11_unlocked.xlsx";

const login = await fetch(`${API}/api/auth/login`, {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({ email: "admin@bandai.local", password: "password123", appCode: "hris" }),
}).then((r) => r.json());
const token = login.data.token;

const PREMIUM = [
	"restDayHoursPay",
	"restDayOtPay",
	"specialHolidayOtPay",
	"specialHolidayRestDayOtPay",
	"sunSpecialHolidayOtExcessPay",
	"legalHolidayOtPay",
	"nightDiffPay",
];
const SHEET_COLS = {
	restDayHoursPay: "RD Hrs Pay",
	restDayOtPay: "RD OT Pay",
	specialHolidayOtPay: "Spc Hol OT",
	specialHolidayRestDayOtPay: "Spc RD OT",
	sunSpecialHolidayOtExcessPay: "Sun/Spc Hol OT Exc",
	legalHolidayOtPay: "Leg Hol OT",
	nightDiffPay: "Night Differential",
};

// Sheet2 side
const wb = XLSX.readFile(TARGET, { cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets.Sheet2, { header: 1, defval: null, raw: true });
const headers = rows[3].map((h) => (h == null ? "" : String(h).trim()));
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
const money = (v) => (v == null || v === "" ? 0 : typeof v === "number" ? v : Number(String(v).replace(/,/g, "")) || 0);
const norm = (s) => (/^\d+$/.test(String(s).trim()) ? String(s).trim().padStart(5, "0") : "");
const s2 = new Map();
for (let i = 4; i < rows.length; i++) {
	const r = rows[i];
	if (!r) continue;
	const code = norm(r[idx["Emp. No."]]);
	if (!code) continue;
	const rec = {};
	for (const [k, col] of Object.entries(SHEET_COLS)) rec[k] = money(r[idx[col]]);
	s2.set(code, rec);
}

// App side (page preview)
const app = new Map();
let page = 1, totalPages = 1;
while (page <= totalPages) {
	const r = await fetch(
		`${API}/api/payrollperiod/${PERIOD_ID}/generate-timesheet/preview?calculateRows=true&page=${page}&limit=50`,
		{ headers: { Authorization: `Bearer ${token}` } },
	).then((x) => x.json());
	const d = r.data;
	if (page === 1) totalPages = Number(d?.pagination?.totalPages || Math.ceil(Number(d?.pagination?.total || 50) / 50)) || 1;
	for (const row of d.includedEmployees || []) {
		const code = String(row.employeeCode || "").padStart(5, "0");
		const reg = row.payrollRegister || {};
		const rec = {};
		for (const k of PREMIUM) rec[k] = Number(reg[k] || 0);
		app.set(code, rec);
	}
	page++;
}

console.log("field | fails | sheet2Sum | appSum | gap(s2-app)");
for (const k of PREMIUM) {
	let fails = 0, s = 0, a = 0;
	for (const [code, rec] of s2) {
		const av = app.get(code)?.[k] || 0;
		if (Math.abs(rec[k] - av) > 0.05) fails++;
		s += rec[k];
		a += av;
	}
	console.log(`${k} | ${fails} | ${s.toFixed(0)} | ${a.toFixed(0)} | ${(s - a).toFixed(0)}`);
}
