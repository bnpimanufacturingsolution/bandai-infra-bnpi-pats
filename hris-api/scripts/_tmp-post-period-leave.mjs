/**
 * Execute period-leave import via multipart POST from Node (avoids PS curl quoting).
 * Usage: node scripts/_tmp-post-period-leave.mjs <dryRunTrueFalse> [payrollPeriodId]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = "http://localhost:3001";
const dryRun = String(process.argv[2] || "true") !== "false";
const payrollPeriodId = process.argv[3] || "";
const OUT = path.resolve(process.argv[4] || "../.runtime/period-leave-import-last-response.json");

async function login() {
	const res = await fetch(`${API}/api/auth/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: "admin@bandai.local", password: "password123", appCode: "hris" }),
	});
	if (!res.ok) throw new Error(`login ${res.status}`);
	const json = await res.json();
	return json.data.token;
}

const filePath = process.env.LEAVE_FILE_PATH || path.resolve(__dirname, "../../confidential-files/Leave (July 1-31, 2026).xlsx");
const fileBuffer = fs.readFileSync(filePath);
const fileName = path.basename(filePath);

const boundary = "----periodLeave" + Date.now();
const parts = [];
function field(name, value) {
	parts.push(
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
		),
	);
}
field("organizationId", "cmryhwpv70000vgaktlmrubmx");
field("dryRun", String(dryRun));
if (payrollPeriodId) field("payrollPeriodId", payrollPeriodId);
parts.push(
	Buffer.from(
		`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
	),
);
parts.push(fileBuffer);
parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
const body = Buffer.concat(parts);

const token = await login();
const started = Date.now();
const res = await fetch(`${API}/api/migration/dm3/import-period-leave`, {
	method: "POST",
	headers: {
		Authorization: `Bearer ${token}`,
		"Content-Type": `multipart/form-data; boundary=${boundary}`,
	},
	body,
});
const text = await res.text();
let json;
try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 400) }; }
const summary = json?.data?.summary || {};
const out = {
	httpStatus: res.status,
	elapsedMs: Date.now() - started,
	message: json?.message || null,
	summary,
	importLogId: json?.data?.importLogId || null,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(
	JSON.stringify(
		{
			httpStatus: out.httpStatus,
			elapsedMs: out.elapsedMs,
			message: out.message,
			dryRun: summary.dryRun,
			status: summary.status,
			sheet: summary.sheetName,
			window: `${summary.windowStart}..${summary.windowEnd}`,
			total: summary.total,
			matched: summary.employeesMatched,
			paidDays: summary.totalPaidDays,
			amountTotal: summary.amountTotal,
			created: summary.created,
			updated: summary.updated,
			failed: summary.failed,
			importLogId: out.importLogId,
		},
		null,
		1,
	),
);
