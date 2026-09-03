/**
 * Sample-debug special-holiday-OT / ND / Sun-Exc mismatches:
 * Sheet2 hrs+pay vs app bucket hours + hourly + multiplier.
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

const wb = XLSX.readFile(TARGET, { cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets.Sheet2, { header: 1, defval: null, raw: true });
const headers = rows[3].map((h) => (h == null ? "" : String(h).trim()));
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
const money = (v) => (v == null || v === "" ? 0 : typeof v === "number" ? v : Number(String(v).replace(/,/g, "")) || 0);
const num = money;
const norm = (s) => (/^\d+$/.test(String(s).trim()) ? String(s).trim().padStart(5, "0") : "");
const s2 = new Map();
for (let i = 4; i < rows.length; i++) {
	const r = rows[i];
	if (!r) continue;
	const code = norm(r[idx["Emp. No."]]);
	if (!code) continue;
	s2.set(code, {
		daily: num(r[idx["Daily Salary"]]),
		monthly: num(r[idx["Monthly Salary"]]),
		spcHrs: num(r[idx["Spc Hol OT Hrs"]]),
		spcPay: num(r[idx["Spc Hol OT"]]),
		sunExcHrs: num(r[idx["Sun/Spc Hol OT Exc Hrs"]]),
		sunExcPay: num(r[idx["Sun/Spc Hol OT Exc"]]),
		nd: num(r[idx["Night Differential"]]),
		rdHrs: num(r[idx["RD Hrs"]]),
		rdPay: num(r[idx["RD Hrs Pay"]]),
	});
}

// find worst spc mismatches from app
const app = new Map();
let page = 1, totalPages = 1;
while (page <= totalPages) {
	const r = await fetch(
		`${API}/api/payrollperiod/${PERIOD_ID}/generate-timesheet/preview?calculateRows=true&page=${page}&limit=50`,
		{ headers: { Authorization: `Bearer ${token}` } },
	).then((x) => x.json());
	if (page === 1) totalPages = Number(r.data?.pagination?.totalPages || 1) || 1;
	for (const row of r.data.includedEmployees || []) {
		const code = String(row.employeeCode || "").padStart(5, "0");
		const reg = row.payrollRegister || {};
		app.set(code, {
			spcPay: Number(reg.specialHolidayOtPay || 0),
			spcHrs: Number(reg.specialHolidayOtHours || 0),
			sunExcPay: Number(reg.sunSpecialHolidayOtExcessPay || 0),
			sunExcHrs: Number(reg.sunSpecialHolidayOtExcessHours || 0),
			nd: Number(reg.nightDiffPay || 0),
			rdPay: Number(reg.restDayHoursPay || 0),
			rdHrs: Number(reg.restDayHours || 0),
			daily: Number(reg.dailySalary || 0),
			hourly: Number(reg.hourlySalary || 0),
			buckets: row.metadata?.bandaiApprovedBucketPay || null,
			lineMeta: row.timesheetLineSample || null,
		});
	}
	page++;
}

const samples = [];
for (const [code, t] of s2) {
	const a = app.get(code);
	if (!a) continue;
	if (Math.abs((t.spcPay || 0) - (a.spcPay || 0)) > 1 && (t.spcPay > 0 || a.spcPay > 0)) {
		samples.push({ code, t, a });
		if (samples.length >= 8) break;
	}
}
for (const s of samples) {
	const { code, t, a } = s;
	const impliedRate = t.spcHrs > 0 ? +(t.spcPay / t.spcHrs).toFixed(3) : null;
	const appRate = a.spcHrs > 0 ? +(a.spcPay / a.spcHrs).toFixed(3) : null;
	const hourlyA = t.daily > 0 ? +(t.daily / 8).toFixed(3) : t.monthly > 0 ? +((t.monthly * 12) / 313 / 8).toFixed(3) : null;
	console.log(
		JSON.stringify({
			code,
			sheet: { hrs: t.spcHrs, pay: t.spcPay, impliedPerHr: impliedRate, daily: t.daily, monthly: t.monthly, hourlyFromSheet: hourlyA },
			app: { hrs: a.spcHrs, pay: a.spcPay, perHr: appRate, hourlySnapshot: a.hourly, buckets: a.buckets },
		}),
	);
}
// Sun exc + ND samples
const sunSamples = [];
for (const [code, t] of s2) {
	const a = app.get(code);
	if (!a) continue;
	if ((t.sunExcPay || 0) > 0 && Math.abs((t.sunExcPay||0) - (a.sunExcPay||0)) > 1) {
		sunSamples.push({ code, sheetHrs: t.sunExcHrs, sheetPay: t.sunExcPay, appHrs: a.sunExcHrs, appPay: a.sunExcPay, appBuckets: a.buckets });
		if (sunSamples.length >= 4) break;
	}
}
console.log("SUN-EXC samples:", JSON.stringify(sunSamples, null, 1));
const ndSamples = [];
for (const [code, t] of s2) {
	const a = app.get(code);
	if (!a) continue;
	if (Math.abs((t.nd || 0) - (a.nd || 0)) > 1) {
		ndSamples.push({ code, sheetND: t.nd, appND: a.nd, appBuckets: a.buckets });
		if (ndSamples.length >= 4) break;
	}
}
console.log("ND samples:", JSON.stringify(ndSamples, null, 1));
