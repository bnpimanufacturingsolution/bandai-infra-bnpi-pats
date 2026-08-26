/**
 * Sample people where Sheet2 (SpcHolOT + SunExc) > app specialHolidayPay.
 * Distinguish column-split issue vs genuinely missing premium money.
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
const N = (s) => (/^\d+$/.test(String(s ?? "").trim()) ? String(s).trim().padStart(5, "0") : "");
const s2 = new Map();
for (let i = 4; i < rows.length; i++) {
	const r = rows[i];
	if (!r) continue;
	const code = N(r[idx["Emp. No."]]);
	if (!code) continue;
	s2.set(code, {
		spcHrs: money(r[idx["Spc Hol OT Hrs"]]),
		spcPay: money(r[idx["Spc Hol OT"]]),
		sunHrs: money(r[idx["Sun/Spc Hol OT Exc Hrs"]]),
		sunPay: money(r[idx["Sun/Spc Hol OT Exc"]]),
		nd: money(r[idx["Night Differential"]]),
	});
}

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
			nd: Number(reg.nightDiffPay || 0),
			hourly: Number(reg.hourlySalary || 0),
			bucketInfo: row.metadata?.bandaiApprovedBucketPay
				? {
					hours: row.metadata.bandaiApprovedBucketPay.hours,
					hourlyRate: row.metadata.bandaiApprovedBucketPay.hourlyRate,
					specialHolidayWorkMultiplier: row.metadata.bandaiApprovedBucketPay.specialHolidayWorkMultiplier,
					specialHolidayPay: row.metadata.bandaiApprovedBucketPay.specialHolidayPay,
				}
				: null,
		});
	}
	page++;
}

let shortCount = 0, shortSum = 0;
const samples = [];
for (const [code, t] of s2) {
	const a = app.get(code) || { spcPay: 0, spcHrs: 0, nd: 0, hourly: 0, bucketInfo: null };
	const sheetTotal = t.spcPay + t.sunPay;
	const diff = sheetTotal - a.spcPay;
	if (diff > 1) {
		shortCount++;
		shortSum += diff;
		if (samples.length < 6) {
			samples.push({
				code,
				sheet: { spcHrs: t.spcHrs, spcPay: t.spcPay, sunHrs: t.sunHrs, sunPay: t.sunPay, total: sheetTotal },
				app: { spcHrs: a.spcHrs, spcPay: a.spcPay, hourly: a.hourly, bucketHours: a.bucketInfo?.hours || null, bucketMult: a.bucketInfo?.specialHolidayWorkMultiplier ?? null, bucketSpcPay: a.bucketInfo?.specialHolidayPay ?? null },
				diff: +diff.toFixed(2),
			});
		}
	}
}
console.log(JSON.stringify({ shortCount, shortSum: +shortSum.toFixed(0), samples }, null, 1));
