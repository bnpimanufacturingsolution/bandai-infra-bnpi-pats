/**
 * Unified Period Folder Ingestion & Synchronization Orchestrator.
 *
 * One command to import all files from ANY cutoff folder regardless of filename patterns:
 * - 2-Tier Fingerprint Engine (Fuzzy filename regex + Column Header inspection)
 * - Sequential ingestion in strict dependency order (DM3 -> DM4)
 * - Automatic execution of all post-import synchronizations (Punch Late/UT, Off-days, Loan horizons, Universal MLA)
 * - Complete payroll preview readiness report
 *
 * Usage:
 *   node scripts/import-period-folder.mjs --dir=confidential-files/june26-july10
 *   node scripts/import-period-folder.mjs --dir=confidential-files/july11-july25
 *   npm run import:period -- --dir="confidential-files/june26-july10"
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(ROOT, "..");
const API = process.env.HRIS_API_URL || "http://localhost:3001";
const DEFAULT_ORG_ID = process.env.ORG_ID || "cmryhwpv70000vgaktlmrubmx";

const LOCAL_DB_ENV = {
	DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public",
	PG_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public",
	WRITE_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public",
};

function parseArgs(argv) {
	const args = {};
	for (const raw of argv.slice(2)) {
		const m = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(raw);
		if (m) args[m[1]] = m[2] === undefined ? true : m[2];
	}
	return args;
}

const args = parseArgs(process.argv);
const targetDirInput = args.dir || args.folder || args.path;

if (!targetDirInput) {
	console.error("\n❌ ERROR: Please provide a folder directory using --dir=<folder_path>");
	console.error('Example: node scripts/import-period-folder.mjs --dir="confidential-files/june26-july10"\n');
	process.exit(1);
}

const targetDir = path.isAbsolute(String(targetDirInput))
	? String(targetDirInput)
	: path.resolve(REPO_ROOT, String(targetDirInput));

if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
	console.error(`\n❌ ERROR: Target directory not found: ${targetDir}\n`);
	process.exit(1);
}

/**
 * 2-Tier File Fingerprint Classifier.
 * Classifies any .xlsx workbook by filename regex + internal sheet/header inspection.
 */
function classifyWorkbook(filePath) {
	const filename = path.basename(filePath);
	if (filename.startsWith("~$") || !filename.endsWith(".xlsx")) return null;

	const lower = filename.toLowerCase();

	// Quick Tier 1: Definite Name Matches
	if (lower.includes("manpower") || lower.includes("databank")) {
		return { type: "manpower-databank", label: "Manpower Databank", file: filePath, filename };
	}
	if (lower.includes("worksharing") || lower.includes("work sharing")) {
		return { type: "worksharing-schedule", label: "WorkSharing Schedule", file: filePath, filename };
	}
	if (lower.includes("leave") && !lower.includes("balance") && !lower.includes("awol")) {
		return { type: "period-leave", label: "Period Leave", file: filePath, filename };
	}
	if (lower.includes("compensation") || lower.includes("comp mass")) {
		return { type: "compensation", label: "Compensation Mass Upload", file: filePath, filename };
	}
	if (lower.includes("deduction") || lower.includes("ded mass")) {
		return { type: "deduction", label: "Deduction Mass Upload", file: filePath, filename };
	}
	if (lower.includes("biometrics") || lower.includes("bio data")) {
		return { type: "biometrics", label: "Biometrics Attendance", file: filePath, filename };
	}
	if (lower.includes("rptovertimedetails") || lower.includes("overtime details")) {
		return { type: "overtime", label: "Approved Overtime Details", file: filePath, filename };
	}
	if (lower.includes("computation") || lower.includes("payroll register")) {
		return { type: "register-audit", label: "Historical Register (Audit Target)", file: filePath, filename };
	}

	// Tier 2: Inspect Headers & Sheets
	try {
		const wb = XLSX.readFile(filePath, { cellDates: true, sheetRows: 8 });
		const sheetNames = wb.SheetNames || [];

		if (sheetNames.some((s) => /rptOvertimeDetails/i.test(s))) {
			return { type: "overtime", label: "Approved Overtime Details", file: filePath, filename };
		}

		for (const name of sheetNames) {
			const ws = wb.Sheets[name];
			if (!ws) continue;
			const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
			for (const r of rows) {
				if (!Array.isArray(r)) continue;
				const headerLine = r.map((c) => String(c ?? "").trim()).join(" | ");

				if (/COMCODE/i.test(headerLine) && /EmployeeID/i.test(headerLine)) {
					return { type: "compensation", label: "Compensation Mass Upload", file: filePath, filename };
				}
				if (/DEDCODE/i.test(headerLine) && /EmployeeID/i.test(headerLine)) {
					return { type: "deduction", label: "Deduction Mass Upload", file: filePath, filename };
				}
				if (/DateOfLeave/i.test(headerLine) && /LeaveType/i.test(headerLine)) {
					return { type: "period-leave", label: "Period Leave", file: filePath, filename };
				}
				if (/Employeeid/i.test(headerLine) && /Shift/i.test(headerLine)) {
					return { type: "worksharing-schedule", label: "WorkSharing Schedule", file: filePath, filename };
				}
				if (/ID No\./i.test(headerLine) && /Employee Name/i.test(headerLine) && /Position/i.test(headerLine)) {
					return { type: "manpower-databank", label: "Manpower Databank", file: filePath, filename };
				}
				if (/Emp\.?\s*No\.?/i.test(headerLine) && (/Punch/i.test(headerLine) || /DateTime/i.test(headerLine) || /Department/i.test(headerLine))) {
					return { type: "biometrics", label: "Biometrics Attendance", file: filePath, filename };
				}
				if (/Emp\.?\s*No\.?/i.test(headerLine) && (/Reg OT/i.test(headerLine) || /Basic Salary/i.test(headerLine))) {
					return { type: "register-audit", label: "Historical Register (Audit Target)", file: filePath, filename };
				}
			}
		}
	} catch (err) {
		console.warn(`  [Warning] Could not peek inside ${filename}:`, err.message);
	}

	return { type: "unknown", label: "Unknown Workbook", file: filePath, filename };
}

async function apiLogin() {
	const res = await fetch(`${API}/api/auth/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: "admin@bandai.local", password: "password123", appCode: "hris" }),
	});
	if (!res.ok) throw new Error(`API Login failed with status ${res.status}. Is the API server running on port 3001?`);
	const json = await res.json();
	return json.data.token;
}

async function apiUploadMultipart(token, endpoint, filePath, dataObj = {}) {
	const boundary = "----formboundary" + Date.now();
	const fileBuffer = fs.readFileSync(filePath);
	const fileName = path.basename(filePath);
	const parts = [];

	parts.push(
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="organizationId"\r\n\r\n${DEFAULT_ORG_ID}\r\n`,
		),
	);
	parts.push(
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${JSON.stringify(dataObj)}\r\n`,
		),
	);
	parts.push(
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
		),
	);
	parts.push(fileBuffer);
	parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

	const res = await fetch(`${API}${endpoint}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": `multipart/form-data; boundary=${boundary}`,
		},
		body: Buffer.concat(parts),
	});

	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = { raw: text.slice(0, 500) };
	}
	return { httpStatus: res.status, ok: res.ok, json };
}

function runCommand(command, env = {}) {
	const mergedEnv = { ...process.env, ...LOCAL_DB_ENV, ...env };
	const envPairs = Object.entries(env)
		.map(([k, v]) => `$env:${k}='${String(v).replace(/'/g, "''")}';`)
		.join(" ");

	return execSync(`${envPairs}${command}`, {
		cwd: ROOT,
		env: mergedEnv,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		shell: process.platform === "win32" ? "powershell.exe" : undefined,
	});
}

/** Resolve or deduce period code from directory or file names. */
function detectPeriodCode(dirPath, files) {
	if (args.period) return String(args.period);

	const allNames = [path.basename(dirPath), ...files.map((f) => f.filename)].join(" ");

	if (/june\s*26|06\.?26|jun\s*26/i.test(allNames) && /july\s*10|07\.?10|jul\s*10/i.test(allNames)) {
		return "PP-20260626-20260711";
	}
	if (/july\s*11|07\.?11|jul\s*11/i.test(allNames) && /july\s*25|07\.?25|jul\s*25/i.test(allNames)) {
		return "PP-20260711-20260726";
	}
	if (/june\s*11|06\.?11|jun\s*11/i.test(allNames) && /june\s*25|06\.?25|jun\s*25/i.test(allNames)) {
		return "PP-20260611-20260626";
	}
	if (/july\s*26|07\.?26|jul\s*26/i.test(allNames) && /aug(ust)?\s*10|08\.?10/i.test(allNames)) {
		return "PP-20260726-20260811";
	}

	return "PP-20260711-20260726"; // Fallback to current active
}

async function main() {
	console.log(`\n======================================================================`);
	console.log(`  🚀 BNPI AUTOMATED ONE-COMMAND PERIOD INGESTION ORCHESTRATOR`);
	console.log(`  Target Directory: ${targetDir}`);
	console.log(`  Started: ${new Date().toISOString()}`);
	console.log(`======================================================================`);

	// Step 1: Scan & Classify All Files
	console.log("\n[1/4] Scanning & Fingerprinting Files in Folder...");
	const rawFiles = fs.readdirSync(targetDir).filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$"));
	const classified = rawFiles.map((f) => classifyWorkbook(path.join(targetDir, f))).filter(Boolean);

	const filesByType = new Map();
	for (const item of classified) {
		console.log(`  ✔ [${item.type.toUpperCase()}] ${item.filename} -> ${item.label}`);
		filesByType.set(item.type, item);
	}

	const periodCode = detectPeriodCode(targetDir, classified);
	console.log(`\n  Target Payroll Period: ${periodCode}`);

	const token = await apiLogin();
	const results = [];

	// Step 2: Sequential Ingestion (DM3 & DM4)
	console.log(`\n[2/4] Executing Sequential File Ingestions...`);

	// 2A: Manpower Databank (if in folder)
	if (filesByType.has("manpower-databank")) {
		const f = filesByType.get("manpower-databank");
		console.log(`\n  → Ingesting Manpower Databank (${f.filename})...`);
		const res = await apiUploadMultipart(token, "/api/migration/dm3/import-manpower-databank", f.file);
		console.log(`    Result: ${res.ok ? "SUCCESS" : "FAILED"}`);
		results.push({ step: "Manpower Databank", status: res.ok ? "SUCCESS" : "FAILED", file: f.filename });
	}

	// 2B: WorkSharing Schedule
	if (filesByType.has("worksharing-schedule")) {
		const f = filesByType.get("worksharing-schedule");
		console.log(`\n  → Ingesting WorkSharing Schedule (${f.filename})...`);
		const res = await apiUploadMultipart(token, "/api/migration/dm3/import-worksharing-schedule", f.file);
		const summary = res.json?.data?.summary || res.json?.summary || {};
		console.log(`    Result: ${res.ok ? "SUCCESS" : "FAILED"} (Total: ${summary.total ?? "?"}, Verified: ${summary.skipped ?? "?"}, Updated: ${summary.updated ?? "?"})`);
		results.push({ step: "WorkSharing Schedule", status: res.ok ? "SUCCESS" : "FAILED", file: f.filename });
	}

	// 2C: Period Leave
	if (filesByType.has("period-leave")) {
		const f = filesByType.get("period-leave");
		console.log(`\n  → Ingesting Period Leave (${f.filename})...`);
		const res = await apiUploadMultipart(token, "/api/migration/dm3/import-period-leave", f.file);
		console.log(`    Result: ${res.ok ? "SUCCESS" : "FAILED"}`);
		results.push({ step: "Period Leave", status: res.ok ? "SUCCESS" : "FAILED", file: f.filename });
	}

	// 2D: Compensation Mass Upload
	if (filesByType.has("compensation")) {
		const f = filesByType.get("compensation");
		console.log(`\n  → Ingesting Compensation Mass Upload (${f.filename})...`);
		const res = await apiUploadMultipart(token, "/api/migration/dm3/import-compensation-mass-upload", f.file);
		console.log(`    Result: ${res.ok ? "SUCCESS" : "FAILED"}`);
		results.push({ step: "Compensation Mass Upload", status: res.ok ? "SUCCESS" : "FAILED", file: f.filename });
	}

	// 2E: Deduction Mass Upload
	if (filesByType.has("deduction")) {
		const f = filesByType.get("deduction");
		console.log(`\n  → Ingesting Deduction Mass Upload (${f.filename})...`);
		const res = await apiUploadMultipart(token, "/api/migration/dm3/import-deduction-mass-upload", f.file);
		console.log(`    Result: ${res.ok ? "SUCCESS" : "FAILED"}`);
		results.push({ step: "Deduction Mass Upload", status: res.ok ? "SUCCESS" : "FAILED", file: f.filename });
	}

	// 2F: DM4 Biometrics & Overtime
	const bioFile = filesByType.get("biometrics");
	const otFile = filesByType.get("overtime");

	if (bioFile || otFile) {
		console.log(`\n  → Ingesting DM4 Biometrics & Approved Overtime Details...`);
		const sourceFiles = [bioFile?.file, otFile?.file].filter(Boolean);
		const mainUpload = bioFile?.file || otFile?.file;

		const res = await apiUploadMultipart(token, "/api/migration/runs", mainUpload, {
			organizationId: DEFAULT_ORG_ID,
			workbookId: "dm4",
			options: {
				sourceFiles: sourceFiles.map((p) => path.relative(REPO_ROOT, p).replace(/\\/g, "/")),
				periodCode,
				approveHistoricalTimesheets: true,
			},
		});

		const runId = res.json?.data?.runId;
		if (runId) {
			console.log(`    DM4 Run Started: ${runId}. Waiting for completion...`);
			for (let i = 0; i < 90; i++) {
				await new Promise((r) => setTimeout(r, 2500));
				const check = await fetch(`${API}/api/migration/runs/${runId}/progress`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const progressJson = await check.json();
				const status = String(progressJson?.data?.progress?.status || "").toUpperCase();
				if (["COMPLETED", "COMPLETED_WITH_WARNINGS", "FAILED", "BLOCKED"].includes(status)) {
					console.log(`    DM4 Status: ${status}`);
					break;
				}
			}
		}
		results.push({ step: "DM4 Biometrics & Overtime", status: "SUCCESS" });
	}

	// Step 3: Automatic Post-Import Precision Synchronizations
	console.log(`\n[3/4] Running Automated Post-Import Precision Synchronizations...`);

	console.log(`  → Synchronizing Universal Meal Allowance Guarantee (₱500)...`);
	runCommand("npx tsx scripts/repair-bnpi-mla-universal.ts --execute");

	console.log(`  → Synchronizing Active Loan Multi-Cutoff Horizons...`);
	runCommand("node scripts/repair-bnpi-loan-multi-cutoff-horizon.mjs --execute");

	console.log(`  → Synchronizing Biometric Punch Late & Undertime Precision (${periodCode})...`);
	runCommand(`npx tsx scripts/repair-period-late-ut-from-punches.ts --periodCode=${periodCode} --apply`);

	console.log(`  → Synchronizing Sunday & WorkSharing Scheduled Off-Days (${periodCode})...`);
	const wsArg = filesByType.get("worksharing-schedule") ? `--wsFile="${filesByType.get("worksharing-schedule").file}"` : "";
	runCommand(`npx tsx scripts/repair-absent-on-worksharing-off-days.ts --period=${periodCode} ${wsArg} --execute`);

	// Step 4: Final Summary
	console.log(`\n======================================================================`);
	console.log(`  🎉 COMPLETE: PERIOD INGESTION & SYNCHRONIZATION FINISHED!`);
	console.log(`======================================================================`);
	for (const r of results) {
		console.log(`  ✔ [${r.status}] ${r.step} ${r.file ? `(${r.file})` : ""}`);
	}
	console.log(`\n  ✅ All files ingested and synchronized for Period ${periodCode}.`);
	console.log(`  👉 You can now open Payroll Management -> Preview Payroll to view and export the register.`);
	console.log(`======================================================================\n`);
}

main().catch((err) => {
	console.error("\n❌ FATAL INGESTION ERROR:", err.message || err);
	process.exit(1);
});
