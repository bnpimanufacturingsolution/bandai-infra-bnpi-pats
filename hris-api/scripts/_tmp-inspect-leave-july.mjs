/**
 * Inspect "Leave (July 1-31, 2026).xlsx": sheets, headers, row counts, samples.
 * Evidence -> .runtime/leave-july-inspect-<stamp>/
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "confidential-files", "Leave (July 1-31, 2026).xlsx");
const OUT = path.join(ROOT, ".runtime", "leave-july-inspect-" + new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13));
fs.mkdirSync(OUT, { recursive: true });

const wb = XLSX.readFile(SRC, { cellDates: true });
const summary = { file: SRC, sheetNames: wb.SheetNames, sheets: {} };

for (const name of wb.SheetNames) {
	const ws = wb.Sheets[name];
	const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
	// find first non-empty row as header candidate
	let headerIdx = -1;
	for (let i = 0; i < Math.min(rows.length, 15); i++) {
		const vals = (rows[i] || []).filter((v) => v != null && String(v).trim() !== "");
		if (vals.length >= 3) { headerIdx = i; break; }
	}
	const headers = headerIdx >= 0 ? rows[headerIdx].map((h) => (h == null ? "" : String(h).trim())) : [];
	const sample = [];
	for (let i = headerIdx + 1; i < Math.min(rows.length, headerIdx + 9); i++) {
		sample.push(rows[i]);
	}
	summary.sheets[name] = {
		dims: ws["!ref"],
		totalRows: rows.length,
		headerRowGuess: headerIdx + 1,
		headers,
		sampleRows: sample.slice(0, 8),
	};
}

fs.writeFileSync(path.join(OUT, "structure.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log("OUT", OUT);
