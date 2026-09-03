/**
 * Prove OT workbook vs effective timesheetline mapping (row-level).
 * Does NOT trust plannedLineUpdates alone.
 *
 * Usage:
 *   $env:PG_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public'
 *   $env:PERIOD_CODE='PP-20260611-20260626'
 *   $env:OT_WORKBOOK='../docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx'
 *   npx tsx scripts/prove-ot-file-vs-lines.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma";

const periodCode = process.env.PERIOD_CODE || "PP-20260611-20260626";
const workbookPath = path.resolve(
	process.env.OT_WORKBOOK ||
		path.join(
			__dirname,
			"..",
			"..",
			"docs",
			"new-cutoff",
			"june-11-25",
			"1rptOvertimeDetails - June 11-25, 2026.xlsx",
		),
);
const sampleFilter = new Set(
	(process.env.SAMPLES || "01360,00032,00021")
		.split(",")
		.map((s) => s.trim().padStart(5, "0"))
		.filter(Boolean),
);
const outDir =
	process.env.EVIDENCE_DIR ||
	path.resolve(__dirname, "..", "..", ".runtime", "ot-map-proof");

if (!process.env.FORCE_ENV_DB) {
	process.env.PG_DATABASE_URL =
		process.env.PG_DATABASE_URL ||
		"postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public";
	process.env.DATABASE_URL = process.env.PG_DATABASE_URL;
}

const prisma = new PrismaClient();
const text = (v: unknown) => String(v ?? "").trim();
const numberValue = (v: unknown) => {
	const n = Number(String(v ?? "").replace(/,/g, ""));
	return Number.isFinite(n) ? n : 0;
};
const dateKey = (v: unknown) => {
	const raw = text(v);
	const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
	const d = new Date(raw);
	return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const mins = (v?: string | null) => {
	if (!v || !v.includes(":")) return 0;
	const [h, m] = v.split(":").map(Number);
	return (h || 0) * 60 + (m || 0);
};

type OtRow = {
	employeeNo: string;
	date: string;
	regOtHrs: number;
	regNdHrs: number;
	spclHrs: number;
	spclOtHrs: number;
	rholHrs: number;
	rholOtHrs: number;
	rdHrs: number;
	rdOtHrs: number;
	payableOt: number;
	premium: number;
};

function parseOt(filePath: string) {
	const wb = XLSX.readFile(filePath, { cellDates: true, dense: true, raw: false });
	const sheetName = wb.SheetNames.find((n) => /overtime/i.test(n)) || wb.SheetNames[0];
	const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
		header: 1,
		defval: "",
		raw: false,
		blankrows: false,
	}) as unknown[][];
	let current = { employeeNo: "", name: "" };
	const map = new Map<string, OtRow>();
	for (let i = 6; i < rows.length; i++) {
		const row = rows[i] || [];
		if (text(row[2])) current.name = text(row[2]);
		if (/^\d{3,6}$/.test(text(row[3]))) current.employeeNo = text(row[3]).padStart(5, "0");
		const directDate = dateKey(row[4]);
		const shiftedDate = directDate ? "" : dateKey(row[0]);
		const date = directDate || shiftedDate;
		const shift = shiftedDate ? 4 : 0;
		if (!date || !current.employeeNo) continue;
		const regOtHrs = numberValue(row[7 - shift]);
		const regNdHrs = numberValue(row[8 - shift]);
		const spclHrs = numberValue(row[9 - shift]);
		const spclOtHrs = numberValue(row[10 - shift]);
		const rholHrs = numberValue(row[11 - shift]);
		const rholOtHrs = numberValue(row[13 - shift]);
		const rdHrs = numberValue(row[14 - shift]);
		const rdOtHrs = numberValue(row[15 - shift]);
		const payableOt = regOtHrs + spclOtHrs + rholOtHrs + rdOtHrs;
		const premium = spclHrs + spclOtHrs + rholHrs + rholOtHrs + rdHrs + rdOtHrs;
		map.set(`${current.employeeNo}:${date}`, {
			employeeNo: current.employeeNo,
			date,
			regOtHrs,
			regNdHrs,
			spclHrs,
			spclOtHrs,
			rholHrs,
			rholOtHrs,
			rdHrs,
			rdOtHrs,
			payableOt,
			premium,
		});
	}
	return { map, sheetName, rowCount: rows.length };
}

async function main() {
	fs.mkdirSync(outDir, { recursive: true });
	const parsed = parseOt(workbookPath);
	const period = await prisma.payrollPeriod.findFirst({
		where: { code: periodCode, isDeleted: false },
	});
	if (!period) throw new Error(`Period not found: ${periodCode}`);

	// Population totals from file for period date range
	const start = period.startDate.toISOString().slice(0, 10);
	const end = period.endDate.toISOString().slice(0, 10);
	const fileInPeriod = [...parsed.map.values()].filter((r) => r.date >= start && r.date <= end);
	const fileEmpSet = new Set(fileInPeriod.map((r) => r.employeeNo));
	const filePayableOt = fileInPeriod.reduce((s, r) => s + r.payableOt, 0);
	const filePremium = fileInPeriod.reduce((s, r) => s + r.premium, 0);
	const fileDaysWithOt = fileInPeriod.filter((r) => r.payableOt > 0).length;

	const employees = await prisma.employee.findMany({
		where: {
			organizationId: period.organizationId,
			isDeleted: false,
			employeeId: { in: [...fileEmpSet].slice(0, 2000) },
		},
		select: { id: true, employeeId: true },
	});
	const empByCode = new Map(
		employees.map((e) => [String(e.employeeId || "").padStart(5, "0"), e]),
	);

	// Sample + top OT people from file
	const byEmpFile = new Map<string, number>();
	for (const r of fileInPeriod) {
		byEmpFile.set(r.employeeNo, (byEmpFile.get(r.employeeNo) || 0) + r.payableOt);
	}
	const topFile = [...byEmpFile.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 8)
		.map(([e]) => e);
	const probeEmps = [...new Set([...sampleFilter, ...topFile])];

	const sampleRows: any[] = [];
	let mismatchDays = 0;
	let matchDays = 0;
	let missingLineDays = 0;
	let missingEmp = 0;
	let samplePayableFile = 0;
	let samplePayableLine = 0;

	for (const code of probeEmps) {
		const emp = empByCode.get(code);
		const fileDays = fileInPeriod.filter((r) => r.employeeNo === code);
		const fileSum = fileDays.reduce((s, r) => s + r.payableOt, 0);
		if (!emp) {
			missingEmp += 1;
			sampleRows.push({ code, missingEmployee: true, filePayableOt: fileSum, days: fileDays.length });
			continue;
		}
		const ts = await prisma.timesheet.findFirst({
			where: {
				organizationId: period.organizationId,
				payrollPeriodId: period.id,
				employeeId: emp.id,
				isDeleted: false,
			},
			select: {
				id: true,
				status: true,
				totalOvertimeHours: true,
				timesheetlines: {
					where: { isDeleted: false, isEffective: true },
					select: {
						id: true,
						date: true,
						overtimeHours: true,
						status: true,
						metadata: true,
					},
				},
			},
		});
		if (!ts) {
			missingEmp += 1;
			sampleRows.push({ code, missingTimesheet: true, filePayableOt: fileSum });
			continue;
		}
		const lineByDate = new Map(
			ts.timesheetlines.map((l) => [
				new Date(l.date).toISOString().slice(0, 10),
				l,
			]),
		);
		const dayCmp = [];
		let lineSum = 0;
		for (const fr of fileDays) {
			const line = lineByDate.get(fr.date);
			const lineHrs = line ? mins(line.overtimeHours) / 60 : null;
			const metaBuckets = (line?.metadata as any)?.bandaiPayrollSourceRepair?.approvedBuckets;
			const metaOt = metaBuckets
				? numberValue(metaBuckets.regOtHrs) +
					numberValue(metaBuckets.spclOtHrs) +
					numberValue(metaBuckets.rholOtHrs) +
					numberValue(metaBuckets.rdOtHrs)
				: null;
			const ok =
				lineHrs != null && Math.abs(lineHrs - fr.payableOt) <= 0.05;
			if (!line) missingLineDays += 1;
			else if (ok) matchDays += 1;
			else mismatchDays += 1;
			if (lineHrs != null) lineSum += lineHrs;
			if (sampleFilter.has(code) || topFile.includes(code)) {
				dayCmp.push({
					date: fr.date,
					filePayableOt: fr.payableOt,
					fileRegOt: fr.regOtHrs,
					fileNd: fr.regNdHrs,
					filePremium: fr.premium,
					lineOt: lineHrs,
					metaOt,
					status: line?.status || null,
					match: ok,
				});
			}
		}
		samplePayableFile += fileSum;
		samplePayableLine += lineSum;
		sampleRows.push({
			code,
			timesheetStatus: ts.status,
			summaryOt: ts.totalOvertimeHours,
			fileDays: fileDays.length,
			filePayableOt: Number(fileSum.toFixed(2)),
			linePayableOt: Number(lineSum.toFixed(2)),
			delta: Number((lineSum - fileSum).toFixed(2)),
			daySample: dayCmp.filter((d) => d.filePayableOt > 0 || (d.lineOt || 0) > 0).slice(0, 8),
		});
	}

	// Population: compare file OT people to timesheet totalOvertimeHours / line sums for all matched employees (capped)
	const allTs = await prisma.timesheet.findMany({
		where: { payrollPeriodId: period.id, isDeleted: false },
		select: {
			totalOvertimeHours: true,
			employee: { select: { employeeId: true } },
			timesheetlines: {
				where: { isDeleted: false, isEffective: true },
				select: { overtimeHours: true },
			},
		},
	});
	let popLineMin = 0;
	let popWithLineOt = 0;
	for (const t of allTs) {
		let lm = 0;
		for (const l of t.timesheetlines) lm += mins(l.overtimeHours);
		if (lm > 0) popWithLineOt += 1;
		popLineMin += lm;
	}

	const result = {
		periodCode,
		periodId: period.id,
		start,
		end,
		workbookPath,
		sheet: parsed.sheetName,
		file: {
			employeeDays: fileInPeriod.length,
			uniqueEmployees: fileEmpSet.size,
			daysWithPayableOt: fileDaysWithOt,
			payableOtHours: Number(filePayableOt.toFixed(2)),
			premiumHours: Number(filePremium.toFixed(2)),
		},
		db: {
			timesheets: allTs.length,
			peopleWithLineOt: popWithLineOt,
			totalLineOtHours: Number((popLineMin / 60).toFixed(2)),
		},
		gap: {
			fileMinusLineHours: Number((filePayableOt - popLineMin / 60).toFixed(2)),
			probeMismatchDays: mismatchDays,
			probeMatchDays: matchDays,
			probeMissingLineDays: missingLineDays,
			probeMissingEmp: missingEmp,
			sampleFileOt: Number(samplePayableFile.toFixed(2)),
			sampleLineOt: Number(samplePayableLine.toFixed(2)),
		},
		verdict:
			Math.abs(filePayableOt - popLineMin / 60) > 50 || mismatchDays > 0
				? "LIKELY_FALSE_GREEN_OR_SCOPE_GAP"
				: "POPULATION_CLOSE",
		samples: sampleRows.filter((s) => sampleFilter.has(s.code) || topFile.includes(s.code)),
	};

	fs.writeFileSync(path.join(outDir, `${periodCode}-ot-proof.json`), JSON.stringify(result, null, 2));
	const md = [
		`# OT file vs lines — ${periodCode}`,
		``,
		`| Metric | File | DB lines | Delta |`,
		`|---|---:|---:|---:|`,
		`| Payable OT hours | ${result.file.payableOtHours} | ${result.db.totalLineOtHours} | ${result.gap.fileMinusLineHours} |`,
		`| People / days | ${result.file.uniqueEmployees} emps / ${result.file.daysWithPayableOt} OT days | ${result.db.peopleWithLineOt} people w/ line OT | |`,
		`| Probe match days | | ${matchDays} match / ${mismatchDays} mismatch / ${missingLineDays} missing line | |`,
		``,
		`**Verdict:** ${result.verdict}`,
		``,
		`## Samples`,
		...sampleRows
			.filter((s) => sampleFilter.has(s.code))
			.map(
				(s) =>
					`- **${s.code}** file=${s.filePayableOt} line=${s.linePayableOt} Δ=${s.delta} status=${s.timesheetStatus} summary=${s.summaryOt}`,
			),
	].join("\n");
	fs.writeFileSync(path.join(outDir, `${periodCode}-ot-proof.md`), md);
	console.log(JSON.stringify(result, null, 2));
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
