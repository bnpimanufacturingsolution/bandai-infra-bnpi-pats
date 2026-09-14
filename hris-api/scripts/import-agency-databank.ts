/**
 * Agency Daily Report databank importer (one-off, idempotent, resumable).
 *
 * Reads AGENCY-20260914T052438Z-1-001/AGENCY/*.xlsx (one file per agency),
 * ensures the Agency + one agency-coordinator user (hris-agency,
 * metadata.agencyId) per file, and upserts every employee row onto the
 * agency (workforceSource=AGENCY). New employees get a fresh Person;
 * existing employees keep their person link and get agency/department/
 * section/position/status refreshed.
 *
 * Usage (from hris-api, with the 55435 DB forward up):
 *   npx tsx scripts/import-agency-databank.ts            # all agencies
 *   npx tsx scripts/import-agency-databank.ts CGSI       # one agency
 * Re-run any time: agencies, departments, sections, positions, employees
 * and coordinators are all matched-then-created.
 */
import { PrismaClient } from "../generated/prisma";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ORG_ID = "cmpxw0mfe00007zws3iypuu9d"; // Bandai Namco (live DEV/K3s org)
const BASE_PATH = "C:/Users/Renz/Documents/bnpi-sm/bandai-infra/AGENCY-20260914T052438Z-1-001/AGENCY";

const AGENCY_FILES = [
	{ file: "Avance.xlsx", code: "AVANCE", name: "Avance" },
	{ file: "Cepol.xlsx", code: "CEPOL", name: "Cepol Services" },
	{ file: "CGSI.xlsx", code: "CGSI", name: "Cebu General Services Inc." },
	{ file: "Kohsai.xlsx", code: "KOHSAI", name: "Kohsai Contracting System Services Inc." },
	{ file: "Natcorp.xlsx", code: "NATCORP", name: "NATCORP" },
];

const ACTIVE_STATUSES = ["ONBOARDING", "ON_LEAVE"];

function normKey(s: string): string {
	return String(s || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 20);
}

function cellText(v: unknown): string {
	if (v == null) return "";
	if (v instanceof Date) return v.toISOString().slice(0, 10);
	return String(v).trim();
}

function parseDate(v: unknown): Date | null {
	if (v == null || v === "") return null;
	if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
	if (typeof v === "number" && Number.isFinite(v)) {
		const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	const t = cellText(v);
	if (!t || /^invalid date$/i.test(t)) return null;
	const d = new Date(t);
	return Number.isNaN(d.getTime()) ? null : d;
}

function parseName(full: string): { firstName: string; middleName?: string; lastName: string } {
	const trimmed = String(full || "").trim();
	if (!trimmed) return { firstName: "Unknown", lastName: "Unknown" };
	if (trimmed.includes(",")) {
		const [lastPart, firstPart = ""] = trimmed.split(",").map((p) => p.trim());
		const parts = firstPart.split(/\s+/).filter(Boolean);
		if (parts.length <= 1) {
			return { firstName: parts[0] || lastPart || "Unknown", lastName: lastPart || parts[0] || "Unknown" };
		}
		return { firstName: parts[0], middleName: parts.slice(1).join(" "), lastName: lastPart || "Unknown" };
	}
	const parts = trimmed.split(/\s+/).filter(Boolean);
	if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
	if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
	return { firstName: parts[0], middleName: parts.slice(1, -1).join(" "), lastName: parts[parts.length - 1] };
}

function parseGender(v: unknown): "male" | "female" | "other" {
	const k = cellText(v).toLowerCase();
	if (k === "m" || k.startsWith("male")) return "male";
	if (k === "f" || k.startsWith("female")) return "female";
	return "other";
}

function parseStatus(v: string): any {
	const k = String(v || "").trim().toLowerCase();
	if (!k || k === "active") return "ACTIVE";
	if (k.includes("onboard")) return "ONBOARDING";
	if (k.includes("leave")) return "ON_LEAVE";
	if (k.includes("resign")) return "RESIGNED";
	if (k.includes("terminat")) return "TERMINATED";
	return "ACTIVE"; // databank rows are the current working roster
}

// ---- cached ensures (keep query count per row near zero after warmup) ----
const deptCache = new Map<string, string>();
const secCache = new Map<string, string>();
const posCache = new Map<string, string>();

async function ensureDepartment(name: string): Promise<string> {
	const key = normKey(name);
	const hit = deptCache.get(key);
	if (hit) return hit;
	let row = await prisma.department.findFirst({
		where: { organizationId: ORG_ID, OR: [{ code: key }, { name }] },
	});
	if (!row) {
		row = await prisma.department.create({ data: { organizationId: ORG_ID, name, code: key } });
	}
	deptCache.set(key, row.id);
	return row.id;
}

async function ensureSection(name: string, departmentId: string): Promise<string> {
	const key = `${departmentId}::${normKey(name)}`;
	const hit = secCache.get(key);
	if (hit) return hit;
	const code = normKey(name);
	let row = await prisma.section.findFirst({
		where: { organizationId: ORG_ID, OR: [{ code }, { name, departmentId }] },
	});
	if (!row) {
		row = await prisma.section.create({
			data: { organizationId: ORG_ID, name, code, departmentId },
		});
	}
	secCache.set(key, row.id);
	return row.id;
}

async function ensurePosition(title: string): Promise<string> {
	const key = normKey(title);
	const hit = posCache.get(key);
	if (hit) return hit;
	let row = await prisma.position.findFirst({
		where: { organizationId: ORG_ID, OR: [{ code: key }, { title }] },
	});
	if (!row) {
		row = await prisma.position.create({ data: { organizationId: ORG_ID, code: key, title } });
	}
	posCache.set(key, row.id);
	return row.id;
}

async function ensureAgency(code: string, name: string) {
	let agency = await prisma.agency.findFirst({ where: { organizationId: ORG_ID, code } });
	if (!agency) {
		agency = await prisma.agency.create({
			data: { organizationId: ORG_ID, code, name, status: "ACTIVE" },
		});
		console.log(`agency created: ${code} (${agency.id})`);
	}
	return agency;
}

async function ensureCoordinator(agencyId: string, code: string, name: string) {
	const email = `coordinator-${code.toLowerCase()}@bandai.local`;
	let user = await prisma.user.findUnique({ where: { email } });
	if (!user) {
		user = await prisma.user.create({
			data: {
				email,
				userName: email.split("@")[0],
				password: await bcrypt.hash("password123", 10),
				role: "hris-agency",
				status: "active",
				organizationId: ORG_ID,
				metadata: { agencyId, agencyCode: code },
			},
		});
		console.log(`coordinator created: ${email} (login password123)`);
		return user;
	}
	// idempotent repairs: real password (earlier runs stored a placeholder),
	// active status, and agency metadata link.
	const data: Record<string, unknown> = {};
	if (!(await bcrypt.compare("password123", user.password ?? "$invalid$"))) {
		data.password = await bcrypt.hash("password123", 10);
	}
	if (String(user.status ?? "").toLowerCase() !== "active") data.status = "active";
	const meta = (user.metadata ?? {}) as Record<string, unknown>;
	if (meta.agencyId !== agencyId) data.metadata = { ...meta, agencyId, agencyCode: code };
	if (Object.keys(data).length) {
		await prisma.user.update({ where: { id: user.id }, data });
		console.log(`coordinator repaired: ${email} (${Object.keys(data).join(", ")})`);
	}
}

async function importFile(entry: { file: string; code: string; name: string }) {
	const filePath = path.join(BASE_PATH, entry.file);
	if (!fs.existsSync(filePath)) {
		console.log(`SKIP ${entry.code}: file not found ${filePath}`);
		return;
	}
	const agency = await ensureAgency(entry.code, entry.name);
	await ensureCoordinator(agency.id, entry.code, entry.name);

	const wb = XLSX.readFile(filePath);
	const ws = wb.Sheets[wb.SheetNames[0]];
	const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

	// locate header row by "No."/"ID No." + "Employee Name"
	let header = -1;
	for (let i = 0; i < Math.min(10, rows.length); i++) {
		const keys = (rows[i] || []).map((c) => cellText(c).toLowerCase().replace(/[.\s]+$/g, ""));
		if (
			keys.some((k) => ["no", "id no", "no.", "id no."].includes(k)) &&
			keys.some((k) => k === "employee name")
		) {
			header = i;
			break;
		}
	}
	if (header < 0) {
		console.log(`SKIP ${entry.code}: header row not found`);
		return;
	}
	const col = new Map<string, number>();
	(rows[header] as unknown[]).forEach((c, i) => {
		const k = cellText(c).toLowerCase().replace(/[.\s]+$/g, "").replace(/\s+/g, " ");
		if (k && !col.has(k)) col.set(k, i);
	});
	const at = (r: unknown[], keys: string[]): unknown => {
		for (const k of keys) {
			const i = col.get(k);
			if (i != null && cellText(r[i]) !== "") return r[i];
		}
		return "";
	};

	let created = 0;
	let updated = 0;
	let errors = 0;
	for (let i = header + 1; i < rows.length; i++) {
		const r = (rows[i] || []) as unknown[];
		const employeeId = cellText(at(r, ["id no", "no", "no.", "id no.", "employee no", "employee no."]));
		const empName = cellText(at(r, ["employee name"]));
		if (
			!employeeId ||
			!empName ||
			/^grand total$/i.test(employeeId) ||
			/^(id no|no\.?|employee no\.?)$/i.test(employeeId) ||
			/^employee name$/i.test(empName) ||
			/^company name/i.test(employeeId)
		)
			continue;

		const deptName = cellText(at(r, ["department"]));
		const secName = cellText(at(r, ["section"]));
		const posTitle = cellText(at(r, ["position"])) || "Operator";
		const hireDate = parseDate(at(r, ["date hired", "hire date"]));
		const birthday = parseDate(at(r, ["birthday", "date of birth"]));
		const gender = parseGender(at(r, ["gender"]));
		const status = parseStatus(cellText(at(r, ["status", "employment status"])));

		try {
			await withTunnelRetry(`${entry.code} ${employeeId}`, async () => {
				const departmentId = await ensureDepartment(deptName || "Unassigned");
				const sectionId = secName ? await ensureSection(secName, departmentId) : null;
				const positionId = await ensurePosition(posTitle);

				const shared = {
					employmentStatus: status,
					workforceSource: "AGENCY" as const,
					isDeleted: false, // databank rows are current workers; undelete stale test-soft-deletes
					agency: { connect: { id: agency.id } },
					department: { connect: { id: departmentId } },
					section: sectionId ? { connect: { id: sectionId } } : undefined,
					position: { connect: { id: positionId } },
					role: "employee",
					employmentHireDate: hireDate,
				};

				const existing = await prisma.employee.findUnique({
					where: { organizationId_employeeId: { organizationId: ORG_ID, employeeId } },
					select: { id: true },
				});
				if (existing) {
					await prisma.employee.update({ where: { id: existing.id }, data: shared });
					updated++;
				} else {
					const pn = parseName(empName);
					await prisma.employee.create({
						data: {
							organizationId: ORG_ID,
							employeeId,
							basicSalary: 0,
							currency: "PHP",
							payFrequency: "SEMI_MONTHLY",
							employmentType: "CONTRACTUAL",
							leaveBalances: {},
							employmentHistory: {},
							...shared,
						person: {
							create: {
								contactInfo: {},
								personalInfo: {
										firstName: pn.firstName,
										middleName: pn.middleName ?? null,
										lastName: pn.lastName,
										gender,
										birthday: birthday ? birthday.toISOString().slice(0, 10) : null,
									},
								},
							},
						},
					});
					created++;
				}
			});
			if ((created + updated) % 200 === 0) console.log(`  ${entry.code}: ${created + updated} rows...`);
		} catch (e: any) {
			const msg = String(e?.message || e);
			if (isTunnelDown(msg)) {
				console.error(`DB TUNNEL DOWN at ${entry.code} row ${employeeId} — rerun the same command to resume.`);
				process.exit(2);
			}
			console.error(`  ${entry.code} ${employeeId}: ${msg.slice(0, 160)}`);
			errors++;
		}
	}
	console.log(`${entry.code}: created ${created}, updated ${updated}, errors ${errors}`);
}

function isTunnelDown(msg: string): boolean {
	return msg.includes("Can't reach database server") || msg.includes("Server has closed the connection");
}

function restartTunnel(): boolean {
	const { execSync } = require("child_process");
	try {
		// clear stale forwarders, then let the canonical script re-open + verify
		execSync("taskkill /F /IM ssh.exe /T", { stdio: "ignore", timeout: 15000 });
	} catch {
		/* none running */
	}
	try {
		execSync('powershell -NoProfile -ExecutionPolicy Bypass -File "C:/Users/Renz/Documents/bnpi-sm/bandai-infra/scripts/start-k8s-dev-db-access.ps1"', {
			stdio: "pipe",
			timeout: 120000,
		});
		return true;
	} catch {
		return false;
	}
}

async function withTunnelRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
	for (let i = 1; ; i++) {
		try {
			return await fn();
		} catch (e: any) {
			const msg = String(e?.message || e);
			if (!isTunnelDown(msg) || i >= attempts) throw e;
			console.log(`  ${label}: tunnel down, reconnect (${i}/${attempts})...`);
			if (!restartTunnel()) throw new Error("tunnel rebuild failed - complete Cloudflare Access browser auth and rerun");
			// fresh client after a dead connection
			await prisma.$disconnect().catch(() => {});
		}
	}
}

async function main() {
	const only = process.argv[2]?.toUpperCase();
	const files = only ? AGENCY_FILES.filter((f) => f.code === only) : AGENCY_FILES;
	if (files.length === 0) {
		console.error(`unknown agency code ${only}; known: ${AGENCY_FILES.map((f) => f.code).join(", ")}`);
		process.exit(1);
	}
	for (const f of files) {
		console.log(`\n=== ${f.code} (${f.file}) ===`);
		await importFile(f);
	}
	const counts = await prisma.employee.groupBy({
		by: ["agencyId"],
		where: { organizationId: ORG_ID, workforceSource: "AGENCY", isDeleted: false, agency: { code: { in: files.map((f) => f.code) } } },
		_count: true,
	});
	const agencies = await prisma.agency.findMany({ where: { organizationId: ORG_ID, code: { in: files.map((f) => f.code) } } });
	const users = await prisma.user.findMany({
		where: { organizationId: ORG_ID, role: "hris-agency" },
		select: { email: true, metadata: true },
	});
	console.log("\n=== final ===");
	for (const a of agencies) {
		const n = counts.find((c) => c.agencyId === a.id)?._count ?? 0;
		const coord = users.find((u) => (u.metadata as any)?.agencyId === a.id)?.email ?? "NONE";
		console.log(`${a.code}: ${n} employees | coordinator ${coord}`);
	}
	await prisma.$disconnect();
}

main().catch(async (e) => {
	console.error(e);
	await prisma.$disconnect();
	process.exit(1);
});
