/**
 * Phase A: prove OT pay vs pure BNPI 313 for hours-matched employees.
 * Uses latest payroll scan all-results + BNPI formula (periodBasic×24/313/8×1.25).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SCAN =
	process.env.SCAN_DIR ||
	path.join(ROOT, ".runtime/payroll-scan-june26-jul10-20260812-121904");
const OUT = path.join(
	ROOT,
	".runtime",
	`ot-rate-proof-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
);

const ANNUAL = 313;
const HPD = 8;
const OT_MULT = 1.25;
const SOURCE_DAILY_MAX = 700;
const TOL = 0.05;

function money(v) {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}
function almost(a, b, tol = TOL) {
	return Math.abs(money(a) - money(b)) <= tol;
}
function round2(n) {
	return Math.round((n + Number.EPSILON) * 100) / 100;
}

function bnpiFromPeriodBasic(periodBasic, regOtHrs) {
	const pb = money(periodBasic);
	const hrs = money(regOtHrs);
	const daily313 = (pb * 24) / ANNUAL;
	const hourly313 = daily313 / HPD;
	const otPay313 = hrs * hourly313 * OT_MULT;
	return {
		daily313,
		hourly313,
		otPay313: round2(otPay313),
	};
}

function sourcePath(periodBasic, sourceRegularDays, regOtHrs) {
	const pb = money(periodBasic);
	const days = money(sourceRegularDays);
	const hrs = money(regOtHrs);
	const sourceDaily = days > 0 ? pb / days : 0;
	const useSource = sourceDaily > 0 && sourceDaily <= SOURCE_DAILY_MAX;
	const daily = useSource ? sourceDaily : (pb * 24) / ANNUAL;
	const hourly = daily / HPD;
	const otPay = round2(hrs * hourly * OT_MULT);
	return {
		sourceDaily,
		useSource,
		method: useSource
			? "BANDAI_SOURCE_DAILY_APPROVED_BUCKETS"
			: "BNPI_DIRECT_313_APPROVED_BUCKETS",
		daily,
		hourly,
		otPay,
	};
}

function main() {
	fs.mkdirSync(OUT, { recursive: true });
	const all = JSON.parse(
		fs.readFileSync(path.join(SCAN, "all-results.json"), "utf8"),
	);

	const rows = [];
	for (const r of all) {
		const hrsT = money(r.target.regOtHrs);
		const hrsA = money(r.app.regOtHrs);
		const hrs = almost(hrsT, hrsA) ? hrsA : hrsA; // prefer app hours for BNPI self-check
		const periodBasic = money(r.app.basicPay || r.target.basicPay);
		// sourceRegularDays not in scan — approximate from target days or app days when present
		const sourceRegularDays = money(
			r.app.sourceRegularDays ?? r.target.days ?? r.app.days ?? 0,
		);
		// Prefer target reg days as paid regular days when available
		const regDays = money(r.target.days) > 0 ? money(r.target.days) : sourceRegularDays;

		const bnpi = bnpiFromPeriodBasic(periodBasic, hrs);
		const current = sourcePath(periodBasic, regDays, hrs);
		const appOt = money(r.app.ot);
		const targetOt = money(r.target.ot);

		const appEqBnpi = almost(appOt, bnpi.otPay313);
		const appEqCurrent = almost(appOt, current.otPay);
		const hrsMatch = almost(hrsT, hrsA);

		let klass;
		if (!(hrs > 0 || targetOt > 0 || appOt > 0)) klass = "no_ot";
		else if (!hrsMatch) klass = "hours_mismatch";
		else if (appEqBnpi && almost(appOt, targetOt)) klass = "all_match";
		else if (appEqBnpi && !almost(appOt, targetOt))
			klass = "bnpi_correct_target_diff";
		else if (!appEqBnpi && appEqCurrent && current.useSource)
			klass = "code_rate_method_source_daily";
		else if (!appEqBnpi && periodBasic <= 0) klass = "bad_basic";
		else if (!appEqBnpi) klass = "app_not_bnpi_other";
		else klass = "other";

		rows.push({
			code: r.code,
			name: r.name,
			periodBasic,
			regDays,
			hrsT,
			hrsA: hrs,
			hrsMatch,
			appOt,
			targetOt,
			bnpiOt: bnpi.otPay313,
			bnpiHourly: round2(bnpi.hourly313),
			currentMethod: current.method,
			currentUseSource: current.useSource,
			currentOt: current.otPay,
			sourceDaily: round2(current.sourceDaily),
			appEqBnpi,
			appEqCurrent,
			klass,
			dAppMinusBnpi: round2(appOt - bnpi.otPay313),
			dAppMinusTarget: round2(appOt - targetOt),
		});
	}

	const counts = {};
	for (const r of rows) counts[r.klass] = (counts[r.klass] || 0) + 1;

	const hoursMatched = rows.filter((r) => r.hrsMatch && r.hrsA > 0);
	const sourceDailyUsers = hoursMatched.filter((r) => r.currentUseSource);
	const appNotBnpi = hoursMatched.filter((r) => !r.appEqBnpi);
	const bnpiOkTargetDiff = hoursMatched.filter(
		(r) => r.klass === "bnpi_correct_target_diff",
	);
	const methodClass = hoursMatched.filter(
		(r) => r.klass === "code_rate_method_source_daily",
	);

	// If app matches "current" path that uses source daily, count how many
	const appMatchesSourcePath = hoursMatched.filter(
		(r) => r.currentUseSource && r.appEqCurrent,
	);
	const appMatches313Path = hoursMatched.filter(
		(r) => !r.currentUseSource && r.appEqCurrent,
	);

	const report = {
		generatedAt: new Date().toISOString(),
		scanDir: SCAN,
		formulaBnpi:
			"daily=periodBasic*24/313; hourly=daily/8; ot=hrs*hourly*1.25 (SEMI_MONTHLY periodBasic)",
		counts,
		hoursMatchedWithOt: hoursMatched.length,
		amongHoursMatched: {
			appEqBnpi: hoursMatched.filter((r) => r.appEqBnpi).length,
			appNotBnpi: appNotBnpi.length,
			wouldUseSourceDaily: sourceDailyUsers.length,
			appMatchesSourcePath: appMatchesSourcePath.length,
			appMatches313Path: appMatches313Path.length,
			bnpiCorrectTargetDiff: bnpiOkTargetDiff.length,
			codeRateMethodSourceDaily: methodClass.length,
		},
		samples: {
			sourceDailyMethod: methodClass.slice(0, 15),
			appNotBnpiOther: hoursMatched
				.filter((r) => r.klass === "app_not_bnpi_other")
				.slice(0, 15),
			bnpiOkTargetDiff: bnpiOkTargetDiff.slice(0, 10),
			badBasic: rows.filter((r) => r.klass === "bad_basic").slice(0, 10),
		},
	};

	fs.writeFileSync(path.join(OUT, "proof.json"), JSON.stringify(report, null, 2));
	fs.writeFileSync(path.join(OUT, "all-rows.json"), JSON.stringify(rows, null, 2));

	const md = [];
	md.push("# OT rate proof — BNPI 313 vs app vs target");
	md.push("");
	md.push(`Generated: ${report.generatedAt}`);
	md.push(`Scan: \`${SCAN}\``);
	md.push("");
	md.push("## BNPI formula (this pass)");
	md.push("```");
	md.push(report.formulaBnpi);
	md.push("```");
	md.push("");
	md.push("## Classification (all compared employees)");
	md.push("");
	md.push("| Class | Count |");
	md.push("|---|---:|");
	for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
		md.push(`| ${k} | ${v} |`);
	}
	md.push("");
	md.push("## Among hours-matched with OT hours > 0");
	md.push("");
	md.push("| Metric | Count |");
	md.push("|---|---:|");
	for (const [k, v] of Object.entries(report.amongHoursMatched)) {
		md.push(`| ${k} | ${v} |`);
	}
	md.push("");
	md.push("## Interpretation");
	md.push("");
	md.push(
		"- `bnpi_correct_target_diff`: app OT pay already matches BNPI 313; Sheet2 differs → do not change code for Sheet2.",
	);
	md.push(
		"- `code_rate_method_source_daily`: app matches periodBasic/regDays path (≤700 daily) instead of pure 313 → candidate fix B1.",
	);
	md.push(
		"- `app_not_bnpi_other` / `bad_basic`: inspect basicSalary or other buckets (RD/holiday).",
	);
	md.push("");
	md.push("## Sample: source-daily method candidates");
	md.push("");
	md.push("| Code | basic | regDays | sourceDaily | bnpiOt | appOt | targetOt |");
	md.push("|---|---:|---:|---:|---:|---:|---:|");
	for (const r of report.samples.sourceDailyMethod) {
		md.push(
			`| ${r.code} | ${r.periodBasic} | ${r.regDays} | ${r.sourceDaily} | ${r.bnpiOt} | ${r.appOt} | ${r.targetOt} |`,
		);
	}
	fs.writeFileSync(path.join(OUT, "REPORT.md"), md.join("\n"));
	console.log(JSON.stringify({ out: OUT, ...report.amongHoursMatched, counts }, null, 2));
}

main();
