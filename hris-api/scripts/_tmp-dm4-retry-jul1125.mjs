/**
 * Retry the DM4 Jul run (idempotent) and wait for terminal status.
 */
import fs from "fs";

const API = "http://localhost:3001";
const login = await fetch(`${API}/api/auth/login`, {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({ email: "admin@bandai.local", password: "password123", appCode: "hris" }),
}).then((r) => r.json());
const token = login.data.token;

const boundary = "----dm4retry" + Date.now();
const buf = fs.readFileSync("../confidential-files/july11-july25/Biometrics Data_Jul 11 - 25_3.xlsx");
const data = JSON.stringify({
	organizationId: "cmryhwpv70000vgaktlmrubmx",
	workbookId: "dm4",
	idempotencyKey: `jul1125-fix-dm4-retry-${Date.now()}`,
	options: {
		sourceFiles: [
			"confidential-files/july11-july25/Biometrics Data_Jul 11 - 25_3.xlsx",
			"confidential-files/july11-july25/rptOvertimeDetails - July 11 to 25, 2026.xlsx",
		],
		periodCode: "PP-20260711-20260726",
		approveHistoricalTimesheets: true,
	},
});
const parts = [
	Buffer.from(
		`--${boundary}\r\nContent-Disposition: form-data; name="organizationId"\r\n\r\ncmryhwpv70000vgaktlmrubmx\r\n`,
	),
	Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${data}\r\n`),
	Buffer.from(
		`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="bio.xlsx"\r\nContent-Type: application/octet-stream\r\n\r\n`,
	),
	buf,
	Buffer.from(`\r\n--${boundary}--\r\n`),
];
const res = await fetch(`${API}/api/migration/runs`, {
	method: "POST",
	headers: {
		Authorization: `Bearer ${token}`,
		"Content-Type": `multipart/form-data; boundary=${boundary}`,
	},
	body: Buffer.concat(parts),
});
const j = await res.json();
const runId = j?.data?.runId;
console.log("started", res.status, runId);
if (!runId) {
	console.log(JSON.stringify(j).slice(0, 400));
	process.exit(1);
}
for (let i = 0; i < 120; i++) {
	await new Promise((r) => setTimeout(r, 3000));
	const p = await fetch(`${API}/api/migration/runs/${runId}/progress`, {
		headers: { Authorization: `Bearer ${token}` },
	}).then((r) => r.json());
	const prog = p?.data?.progress || {};
	const st = String(prog.status || "").toUpperCase();
	if (
		["COMPLETED", "COMPLETED_WITH_WARNINGS", "FAILED", "BLOCKED", "STALE"].includes(st)
	) {
		console.log("final:", st, JSON.stringify(prog.latestEvent || {}).slice(0, 300));
		console.log("steps:", JSON.stringify(prog.parentProgress || {}));
		break;
	}
}
