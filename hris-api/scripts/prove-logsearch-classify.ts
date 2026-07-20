import { readFileSync } from "node:fs";
import { parseHikvisionLogSearchResponse, classifyHikvisionLogSearchRow } from "../helper/hikvision-event-contract.helper.ts";

const xml = readFileSync("../.runtime/sync-truth-finish-20260717-080103/logsearch-curl.xml", "utf8");
const parsed = parseHikvisionLogSearchResponse(xml);
const counts = new Map<string, number>();
for (const row of parsed.rows) {
  const c = classifyHikvisionLogSearchRow(row);
  const action = String(c?.eventAction || "UNKNOWN_OPERATION");
  counts.set(action, (counts.get(action) || 0) + 1);
  console.log(JSON.stringify({ metaId: row.metaId, minor: row.minorType, action, label: c?.eventLabel }));
}
console.log("TOTAL_MATCHES", parsed.totalMatches);
console.log("ROW_COUNT", parsed.rows.length);
console.log("BY_ACTION", Object.fromEntries(counts));
const sampleSize = parsed.rows.length || 1;
const total = Number(parsed.totalMatches || sampleSize);
const extrapolated: Record<string, number> = {};
let assigned = 0;
for (const [action, count] of counts.entries()) {
  if (action === "UNKNOWN" || action === "UNKNOWN_OPERATION") continue;
  const estimated = Math.round((count / sampleSize) * total);
  extrapolated[action] = estimated;
  assigned += estimated;
}
extrapolated.UNKNOWN_OPERATION = Math.max(0, total - assigned);
console.log("EXTRAPOLATED", extrapolated);
