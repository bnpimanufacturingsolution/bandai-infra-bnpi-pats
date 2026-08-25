/**
 * Probe: per-payroll-period paid-day counts for the July leave file (Leave (2)).
 * Mirrors the service selection to explain which period wins.
 */
import * as XLSX from "xlsx";
import { aggregatePaidLeaveDaysByEmployee, parsePeriodLeaveWorkbook } from "../helper/bnpi-period-leave-import.helper.ts";

const SRC = "../confidential-files/Leave (July 1-31, 2026).xlsx";
const wb = XLSX.read(SRC, { type: "file", cellDates: true });
const wbBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
const parsed = parsePeriodLeaveWorkbook(Buffer.from(wbBuffer));
console.log("sheet:", parsed.sheetName);

const periods = [
	{ code: "PP-20260611-20260626", start: "2026-06-11", end: "2026-06-26" },
	{ code: "PP-20260626-20260711", start: "2026-06-26", end: "2026-07-10" },
	{ code: "PP-20260711-20260726", start: "2026-07-11", end: "2026-07-25" },
	{ code: "PP-20260726-20260811", start: "2026-07-26", end: "2026-08-10" },
];
for (const p of periods) {
	const agg = aggregatePaidLeaveDaysByEmployee(parsed.rows, {
		startDate: new Date(p.start + "T00:00:00Z"),
		endDate: new Date(p.end + "T00:00:00Z"),
	});
	console.log(`${p.code}: days=${agg.totalPaidDays} emps=${agg.byCode.size}`);
}
