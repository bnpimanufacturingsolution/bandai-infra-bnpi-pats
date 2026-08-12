/**
 * OT rate proof: compare app OT pay to pure BNPI 313 and to current dual-path formula.
 * Local clone: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/hris
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient({
	datasources: {
		db: {
			url:
				process.env.DATABASE_URL ||
				"postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public",
		},
	},
});

const PERIOD_ID = process.env.PERIOD_ID || "cmryhzl4d0030vgaka9dd2v99";
const SCAN =
	process.env.SCAN_DIR ||
	path.resolve(
		__dirname,
		"../../.runtime/payroll-scan-june26-jul10-20260812-121904",
	);
const OUT = path.resolve(
	__dirname,
	`../../.runtime/ot-rate-proof-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
);

const ANNUAL = 313;
const HPD = 8;
const OT_MULT = 1.25;
const SOURCE_DAILY_MAX = 700;
const TOL = 0.05;

const money = (v: unknown) => {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
};
const almost = (a: unknown, b: unknown, tol = TOL) =>
	Math.abs(money(a) - money(b)) <= tol;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function main() {
	fs.mkdirSync(OUT, { recursive: true });
	const scan = JSON.parse(
		fs.readFileSync(path.join(SCAN, "all-results.json"), "utf8"),
	) as any[];
	const byCode = new Map(scan.map((r) => [r.code, r]));

	const dbRows = await prisma.$queryRawUnsafe<any[]>(
		`
    SELECT
      e."employeeId" AS code,
      e."basicSalary"::float AS basic_salary,
      e."payFrequency" AS pay_freq,
      COALESCE(SUM((tl.metadata->'bandaiPayrollSourceRepair'->'approvedBuckets'->>'regOtHrs')::float),0)::float AS reg_ot_hrs,
      COALESCE(SUM((tl.metadata->'bandaiPayrollSourceRepair'->'approvedBuckets'->>'regularDays')::float),0)::float AS reg_days,
      COUNT(*) FILTER (
        WHERE tl.metadata->'bandaiPayrollSourceRepair'->'approvedBuckets' IS NOT NULL
      )::int AS bucket_days
    FROM employees e
    JOIN timesheet_lines tl ON tl."employeeId" = e.id
    WHERE tl."payrollPeriodId" = $1
      AND tl."isDeleted" = false
      AND tl."isEffective" = true
      AND e."isDeleted" = false
    GROUP BY e.id, e."employeeId", e."basicSalary", e."payFrequency"
    HAVING COALESCE(SUM((tl.metadata->'bandaiPayrollSourceRepair'->'approvedBuckets'->>'regOtHrs')::float),0) > 0
    ORDER BY e."employeeId"
  `,
		PERIOD_ID,
	);

	const rows: any[] = [];
	const counts: Record<string, number> = {};

	for (const d of dbRows) {
		const code = String(d.code).padStart(5, "0");
		const scanRow = byCode.get(code) || byCode.get(d.code);
		const periodBasic = money(d.basic_salary);
		const hrs = money(d.reg_ot_hrs);
		const regDays = money(d.reg_days);
		const sourceDaily = regDays > 0 ? periodBasic / regDays : 0;
		const useSource = sourceDaily > 0 && sourceDaily <= SOURCE_DAILY_MAX;

		const daily313 = (periodBasic * 24) / ANNUAL;
		const hourly313 = daily313 / HPD;
		const bnpiOt = round2(hrs * hourly313 * OT_MULT);

		const dailyCur = useSource ? sourceDaily : daily313;
		const hourlyCur = dailyCur / HPD;
		const currentOt = round2(hrs * hourlyCur * OT_MULT);

		const appOt = money(scanRow?.app?.ot);
		const targetOt = money(scanRow?.target?.ot);
		const hrsT = money(scanRow?.target?.regOtHrs);
		const hrsMatch = almost(hrsT, hrs) || almost(hrsT, money(scanRow?.app?.regOtHrs));

		const appEqBnpi = almost(appOt, bnpiOt);
		const appEqCurrent = almost(appOt, currentOt);

		let klass: string;
		if (periodBasic <= 0) klass = "bad_basic";
		else if (!hrsMatch && scanRow) klass = "hours_mismatch_scan";
		else if (appEqBnpi && almost(appOt, targetOt)) klass = "all_match";
		else if (appEqBnpi && !almost(appOt, targetOt))
			klass = "bnpi_correct_target_diff";
		else if (!appEqBnpi && useSource && appEqCurrent)
			klass = "code_rate_method_source_daily";
		else if (!appEqBnpi && !useSource && appEqCurrent)
			klass = "app_matches_313_but_not_bnpi_round"; // should be rare
		else if (!appEqBnpi) klass = "app_not_bnpi_other";
		else klass = "other";

		counts[klass] = (counts[klass] || 0) + 1;

		rows.push({
			code,
			name: scanRow?.name || null,
			periodBasic,
			payFreq: d.pay_freq,
			regDays,
			bucketDays: d.bucket_days,
			hrs,
			hrsT,
			hrsMatch,
			sourceDaily: round2(sourceDaily),
			useSource,
			method: useSource
				? "BANDAI_SOURCE_DAILY_APPROVED_BUCKETS"
				: "BNPI_DIRECT_313_APPROVED_BUCKETS",
			bnpiOt,
			bnpiHourly: round2(hourly313),
			currentOt,
			appOt,
			targetOt,
			appEqBnpi,
			appEqCurrent,
			klass,
			dAppMinusBnpi: round2(appOt - bnpiOt),
			dAppMinusTarget: round2(appOt - targetOt),
			// if we force 313, new delta to target
			dBnpiMinusTarget: round2(bnpiOt - targetOt),
		});
	}

	const withOt = rows.filter((r) => r.hrs > 0);
	const summary = {
		generatedAt: new Date().toISOString(),
		periodId: PERIOD_ID,
		scan: SCAN,
		employeesWithBucketOt: withOt.length,
		counts,
		amongWithOt: {
			appEqBnpi: withOt.filter((r) => r.appEqBnpi).length,
			appNotBnpi: withOt.filter((r) => !r.appEqBnpi).length,
			useSourceDaily: withOt.filter((r) => r.useSource).length,
			code_rate_method_source_daily: withOt.filter(
				(r) => r.klass === "code_rate_method_source_daily",
			).length,
			bnpi_correct_target_diff: withOt.filter(
				(r) => r.klass === "bnpi_correct_target_diff",
			).length,
			app_not_bnpi_other: withOt.filter((r) => r.klass === "app_not_bnpi_other")
				.length,
			// After B1 fix: everyone on 313 — how many would still ≠ target?
			afterB1_bnpiEqTarget: withOt.filter((r) => almost(r.bnpiOt, r.targetOt))
				.length,
			afterB1_bnpiNeTarget: withOt.filter((r) => !almost(r.bnpiOt, r.targetOt))
				.length,
		},
		samples: {
			sourceDaily: withOt
				.filter((r) => r.klass === "code_rate_method_source_daily")
				.slice(0, 20),
			bnpiOkTargetDiff: withOt
				.filter((r) => r.klass === "bnpi_correct_target_diff")
				.slice(0, 15),
			appNotBnpiOther: withOt
				.filter((r) => r.klass === "app_not_bnpi_other")
				.slice(0, 15),
		},
	};

	fs.writeFileSync(path.join(OUT, "proof.json"), JSON.stringify(summary, null, 2));
	fs.writeFileSync(path.join(OUT, "all-rows.json"), JSON.stringify(rows, null, 2));

	const md: string[] = [];
	md.push("# OT rate proof — BNPI 313 vs current app path vs target");
	md.push("");
	md.push(`Generated: ${summary.generatedAt}`);
	md.push(`Period: \`${PERIOD_ID}\``);
	md.push("");
	md.push("## BNPI formula (operator-confirmed)");
	md.push("```");
	md.push("daily = periodBasic * 24 / 313   # SEMI_MONTHLY period basic");
	md.push("hourly = daily / 8");
	md.push("reg OT pay = regOtHrs * hourly * 1.25");
	md.push("```");
	md.push("");
	md.push("## Current code dual path");
	md.push(
		"If `periodBasic/sourceRegularDays ≤ 700` → use **source daily** for OT; else BNPI 313.",
	);
	md.push("");
	md.push("## Counts (employees with bucket OT hours > 0)");
	md.push("");
	md.push("| Class | Count |");
	md.push("|---|---:|");
	for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
		md.push(`| ${k} | ${v} |`);
	}
	md.push("");
	md.push("## Among bucket-OT employees");
	md.push("");
	md.push("| Metric | Count |");
	md.push("|---|---:|");
	for (const [k, v] of Object.entries(summary.amongWithOt)) {
		md.push(`| ${k} | ${v} |`);
	}
	md.push("");
	md.push("## Recommendation");
	const srcN = summary.amongWithOt.code_rate_method_source_daily;
	const bnpiOk = summary.amongWithOt.bnpi_correct_target_diff;
	if (srcN > 50) {
		md.push(
			`- **B1 apply:** ${srcN} employees use source-daily OT rate (≤700). Force **BNPI 313** for approved-bucket OT pay per operator choice.`,
		);
	} else {
		md.push(`- Source-daily class count is ${srcN}; review samples before changing formula.`);
	}
	md.push(
		`- **${bnpiOk}** already match BNPI but not Sheet2 → leave as target drift after B1.`,
	);
	md.push("- Absent policy unchanged: empty bio = full-day ABSENT.");
	md.push("");
	md.push("## Sample source-daily (app follows dual path, not pure 313)");
	md.push("");
	md.push("| Code | basic | regDays | sourceDaily | bnpiOt | appOt | targetOt |");
	md.push("|---|---:|---:|---:|---:|---:|---:|");
	for (const r of summary.samples.sourceDaily.slice(0, 15)) {
		md.push(
			`| ${r.code} | ${r.periodBasic} | ${r.regDays} | ${r.sourceDaily} | ${r.bnpiOt} | ${r.appOt} | ${r.targetOt} |`,
		);
	}

	fs.writeFileSync(path.join(OUT, "REPORT.md"), md.join("\n"));
	console.log(JSON.stringify({ out: OUT, ...summary.amongWithOt, counts }, null, 2));
	await prisma.$disconnect();
}

main().catch(async (e) => {
	console.error(e);
	await prisma.$disconnect();
	process.exit(1);
});
