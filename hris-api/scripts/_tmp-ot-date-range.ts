import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";

const files = [
  path.resolve("..", "docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx"),
  path.resolve("..", "docs/Bandai Payroll"),
];
const bandai = path.resolve("..", "docs/Bandai Payroll");
if (fs.existsSync(bandai)) {
  for (const n of fs.readdirSync(bandai)) {
    if (/overtime|rpt/i.test(n) && n.endsWith(".xlsx")) {
      files.push(path.join(bandai, n));
    }
  }
}
console.log("files", files.filter((f) => fs.existsSync(f) || f.includes("Bandai")));

function minMaxDates(filePath: string) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return null;
  const wb = XLSX.readFile(filePath, { cellDates: true, dense: true, raw: false, password: "9090" });
  const sh = wb.SheetNames.find((n) => /overtime/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sh], { header: 1, defval: "", raw: false }) as any[][];
  const dates: string[] = [];
  for (let i = 6; i < rows.length; i++) {
    const r = rows[i] || [];
    const raw = String(r[4] || "").trim() || String(r[0] || "").trim();
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) dates.push(`${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`);
  }
  dates.sort();
  return {
    file: path.basename(filePath),
    count: dates.length,
    min: dates[0],
    max: dates[dates.length - 1],
    inMay26Period: dates.filter((d) => d >= "2026-05-26" && d <= "2026-06-10").length,
  };
}

for (const f of [
  path.resolve("..", "docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx"),
  path.resolve("..", "docs/new-cutoff/june-26-10/2rptOvertimeDetails - June 26 - July 10, 2026.xlsx"),
]) {
  console.log(JSON.stringify(minMaxDates(f)));
}
if (fs.existsSync(bandai)) {
  for (const n of fs.readdirSync(bandai)) {
    if (n.endsWith(".xlsx") && /overtime|rpt/i.test(n)) {
      console.log(JSON.stringify(minMaxDates(path.join(bandai, n))));
    }
  }
}
