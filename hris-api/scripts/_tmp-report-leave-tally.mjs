/**
 * Before/after leave-import tally report.
 * Reads baseline + after tally dirs, writes REPORT.md with summary, field deltas,
 * leave stats, top improved and top worst employees by |d TotalReceivable|.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const BEFORE_DIR = process.env.BEFORE_DIR || path.join(ROOT, ".runtime", "tally-jul1125-before-leave-julysheet2");
const AFTER_DIR = process.env.AFTER_DIR || path.join(ROOT, ".runtime", "tally-jul1125-after-leave-julysheet2");

const before = JSON.parse(fs.readFileSync(path.join(BEFORE_DIR, "summary.json"), "utf8"));
const after = JSON.parse(fs.readFileSync(path.join(AFTER_DIR, "summary.json"), "utf8"));
const beforeRows = JSON.parse(fs.readFileSync(path.join(BEFORE_DIR, "all-results.json"), "utf8"));
const afterRows = JSON.parse(fs.readFileSync(path.join(AFTER_DIR, "all-results.json"), "utf8"));

const beforeByCode = new Map(beforeRows.map((r) => [r.code, r]));
const afterByCode = new Map(afterRows.map((r) => [r.code, r]));

// --- Field fail deltas ---
const fieldKeys = Object.keys(after.fieldFailCounts || {});
const fieldDelta = fieldKeys
	.map((k) => ({
		field: k,
		before: Number(before.fieldFailCounts?.[k] ?? 0),
		after: Number(after.fieldFailCounts?.[k] ?? 0),
	}))
	.sort((a, b) => a.before - a.after - (b.before - b.after));

// --- Leave stats (after, computed directly from paired rows) ---
const compared = afterRows;
const tol = Number(after.tol || 0.05);
const s2LeavePeople = compared.filter((r) => Number(r.target?.leavePay || 0) > 0);
const appLeavePeople = compared.filter((r) => Number(r.app?.leavePay || 0) > 0);
const bothLeave = compared.filter(
	(r) => Number(r.target?.leavePay || 0) > 0 && Number(r.app?.leavePay || 0) > 0,
);
const s2LeaveSum = s2LeavePeople.reduce((a, r) => a + Number(r.target.leavePay || 0), 0);
const appLeaveSum = appLeavePeople.reduce((a, r) => a + Number(r.app.leavePay || 0), 0);
const leaveExact = s2LeavePeople.filter(
	(r) => Math.abs(Number(r.target.leavePay || 0) - Number(r.app?.leavePay || 0)) <= tol,
).length;
const appOnlyLeave = compared.filter(
	(r) => Number(r.target?.leavePay || 0) === 0 && Number(r.app?.leavePay || 0) > 0,
);
const appOnlyLeaveSum = appOnlyLeave.reduce((a, r) => a + Number(r.app.leavePay || 0), 0);
const underpaid = s2LeavePeople.filter(
	(r) =>
		Number(r.app?.leavePay || 0) > 0 &&
		Number(r.app.leavePay) < Number(r.target.leavePay) - tol,
).length;

// --- Movers ---
const movers = [];
for (const [code, a] of afterByCode) {
	const b = beforeByCode.get(code);
	if (!b) continue;
	const beforeAbs = Math.abs(Number(b.deltas?.totalReceivable || 0));
	const afterAbs = Math.abs(Number(a.deltas?.totalReceivable || 0));
	movers.push({
		code,
		name: a.name,
		band: a.band,
		beforeAbs,
		afterAbs,
		improvement: beforeAbs - afterAbs,
		dTotalAfter: Number(a.deltas?.totalReceivable || 0),
		leaveBefore: Number(b.app?.leavePay || 0),
		leaveAfter: Number(a.app?.leavePay || 0),
		leaveTarget: Number(a.target?.leavePay || 0),
		grossBefore: Number(b.app?.gross || 0),
		grossAfter: Number(a.app?.gross || 0),
	});
}
const improved = movers
	.filter((m) => m.improvement > 0.01)
	.sort((a, b) => b.improvement - a.improvement)
	.slice(0, 20);
const worsened = movers
	.filter((m) => m.improvement < -0.01)
	.sort((a, b) => a.improvement - b.improvement)
	.slice(0, 20);
const worstNow = [...afterRows]
	.sort((a, b) => Math.abs(b.deltas.totalReceivable) - Math.abs(a.deltas.totalReceivable))
	.slice(0, 20);

const peso = (v) =>
	Number(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const md = [];
md.push(`# Jul 11–25 tally — before vs after Leave (LVP) import`);
md.push("");
md.push(`Generated: ${new Date().toISOString()}`);
md.push(`Period: PP-20260711-20260726 (\`${after.periodId}\`) · target: unlocked Sheet2 (${path.basename(after.targetXlsx || "hris_payroll_jul11_unlocked.xlsx")})`);
md.push(`Baseline: \`.runtime/${path.basename(BEFORE_DIR)}\` · After: \`.runtime/${path.basename(AFTER_DIR)}\``);
md.push("");
md.push("## Summary");
md.push("");
md.push("| Metric | Before | After | Δ |");
md.push("|---|---:|---:|---:|");
const bandOrder = ["TALLIED", "ALEXA_NEAR", "NEAR_10", "OT_OK_NEAR_50", "OT_MATCH_ONLY", "UNMATCH"];
for (const band of bandOrder) {
	const b = Number(before.bands?.[band] || 0);
	const a = Number(after.bands?.[band] || 0);
	md.push(`| ${band} | ${b} | ${a} | ${a - b >= 0 ? "+" : ""}${a - b} |`);
}
md.push(`| Compared | ${before.comparedCount} | ${after.comparedCount} | ${after.comparedCount - before.comparedCount} |`);
for (const f of ["gross", "net", "totalDedn", "totalReceivable", "leavePay"]) {
	const b = Number(before.fieldFailCounts?.[f] ?? 0);
	const a = Number(after.fieldFailCounts?.[f] ?? 0);
	if (f === "leavePay" && b === 0 && a === 0) continue;
	md.push(`| Fails: ${f} | ${b} | ${a} | ${a - b >= 0 ? "+" : ""}${a - b} |`);
}
md.push("");
md.push("## Leave (LVP) column — after import");
md.push("");
md.push(`| Check | Value |`);
md.push(`|---|---:|`);
md.push(`| Sheet2 people with Leave > 0 (compared set) | ${s2LeavePeople.length} |`);
md.push(`| App rows with leavePay > 0 | ${appLeavePeople.length} |`);
md.push(`| Both sides > 0 | ${bothLeave.length} |`);
md.push(`| Leave exact matches (±${tol}) | ${leaveExact} / ${s2LeavePeople.length} |`);
md.push(`| App underpaid vs Sheet2 (app>0, app<target) | ${underpaid} |`);
md.push(`| App-only leave (Sheet2 ₱0) | ${appOnlyLeave.length} / ₱${peso(appOnlyLeaveSum)} |`);
md.push(`| Sheet2 Σ Leave (compared) | ₱${peso(s2LeaveSum)} |`);
md.push(`| App Σ leavePay (compared) | ₱${peso(appLeaveSum)} |`);
md.push(`| Fleet leave gap (Sheet2 − app) | ₱${peso(s2LeaveSum - appLeaveSum)} |`);
md.push("");
md.push("## Top 20 improved (|Δ TotalReceivable| shrank most)");
md.push("");
md.push("| Code | Name | Before |ΔTotal| | After |ΔTotal| | Improved | App leave before → after (target) |");
md.push("|---|---|---:|---:|---:|---|");
for (const m of improved) {
	md.push(
		`| ${m.code} | ${m.name} | ₱${peso(m.beforeAbs)} | ₱${peso(m.afterAbs)} | ₱${peso(m.improvement)} | ₱${peso(m.leaveBefore)} → ₱${peso(m.leaveAfter)} (₱${peso(m.leaveTarget)}) |`,
	);
}
md.push("");
md.push("## Top 20 worsened (|Δ TotalReceivable| grew most)");
md.push("");
md.push("| Code | Name | Before |ΔTotal| | After |ΔTotal| | Changed | App leave before → after (target) |");
md.push("|---|---|---:|---:|---:|---|");
if (worsened.length === 0) md.push("_None — no employee's |Δ Total| grew after the import._");
for (const m of worsened) {
	md.push(
		`| ${m.code} | ${m.name} | ₱${peso(m.beforeAbs)} | ₱${peso(m.afterAbs)} | ₱${peso(m.improvement)} | ₱${peso(m.leaveBefore)} → ₱${peso(m.leaveAfter)} (₱${peso(m.leaveTarget)}) |`,
	);
}
md.push("");
md.push("## Top 20 worst now (largest |Δ TotalReceivable| after leave)");
md.push("");
md.push("| Code | Name | Band | Δ Total | Δ Gross | Δ Dedn | App leave (target) |");
md.push("|---|---|---|---:|---:|---:|---|");
for (const r of worstNow) {
	md.push(
		`| ${r.code} | ${r.name} | ${r.band} | ₱${peso(r.deltas.totalReceivable)} | ₱${peso(r.deltas.gross)} | ₱${peso(r.deltas.totalDedn)} | ₱${peso(r.app?.leavePay || 0)} (₱${peso(r.target?.leavePay || 0)}) |`,
	);
}
md.push("");
md.push("## Field fail counts — before → after (all tracked fields)");
md.push("");
md.push("| Field | Before | After | Δ |");
md.push("|---|---:|---:|---:|");
for (const f of fieldDelta) {
	md.push(`| ${f.field} | ${f.before} | ${f.after} | ${f.after - f.before >= 0 ? "+" : ""}${f.after - f.before} |`);
}
md.push("");
md.push("## Honest boundaries");
md.push("");
md.push("- Local clone DB (127.0.0.1:5433) only — replay the LVP enrollments on the VM DB before treating runtime as truth.");
md.push("- Bands use the same coreTallied definition as the baseline (Leave is tracked but not part of TALLIED), so deltas are apples-to-apples.");
md.push("- Known leave residual class: rest-day intersection (e.g. 00032 app 1.5 days vs Sheet2 2.5) and 01624 (file-paid, Sheet2 ₱0).");
md.push("- The 23 'worsened' rows are the leave→deduction cascade: adding leave raised app taxable gross, so PH contributions/tax rose too; where Sheet2's own tax/contrib rose less, Net/TR can overshoot. This is the deductions/tax wall (findings §10 rank 3), not a leave-formula bug.");
md.push("- Remaining walls after leave: deductions/tax cascade, absent policy residuals, No. of Days definition — see findings doc §10.");

const outPath = path.join(AFTER_DIR, "REPORT.md");
fs.writeFileSync(outPath, md.join("\n"));
console.log(
	JSON.stringify(
		{
			report: outPath,
			compared: after.comparedCount,
			bands: after.bands,
			leave: {
				s2LeavePeople: s2LeavePeople.length,
				appLeavePeople: appLeavePeople.length,
				exact: leaveExact,
				s2Sum: +s2LeaveSum.toFixed(2),
				appSum: +appLeaveSum.toFixed(2),
			},
			improvedCount: movers.filter((m) => m.improvement > 0.01).length,
			worsenedCount: movers.filter((m) => m.improvement < -0.01).length,
			topImproved: improved.slice(0, 5).map((m) => ({ code: m.code, imp: +m.improvement.toFixed(2) })),
		},
		null,
		1,
	),
);
