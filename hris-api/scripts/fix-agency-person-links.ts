/**
 * Fix agency-employee Person links from the databank files.
 *
 * Mid-run script versions matched Persons by first/last name against EXISTING
 * HRIS people, so some imported agency employees may point at the wrong
 * Person. For every employee whose linked Person's name does not equal the
 * file row's name, create the correct Person and relink the employee
 * (one query per fix; the old Person is left untouched).
 *
 *   npx tsx scripts/fix-agency-person-links.ts
 */
import { PrismaClient } from "../generated/prisma";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const ORG_ID = "cmpxw0mfe00007zws3iypuu9d";
const BASE_PATH = "C:/Users/Renz/Documents/bnpi-sm/bandai-infra/AGENCY-20260914T052438Z-1-001/AGENCY";
const FILES = ["Avance.xlsx", "Cepol.xlsx", "CGSI.xlsx", "Kohsai.xlsx", "Natcorp.xlsx"];

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
	const d = new Date(cellText(v));
	return Number.isNaN(d.getTime()) ? null : d;
}

function parseName(full: string) {
	const t = String(full || "").trim();
	if (!t.includes(",")) {
		const parts = t.split(/\s+/).filter(Boolean);
		return {
			firstName: parts[0] || "Unknown",
			middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : undefined,
			lastName: parts[parts.length - 1] || "Unknown",
		};
	}
	const [lastPart, firstPart = ""] = t.split(",").map((p) => p.trim());
	const parts = firstPart.split(/\s+/).filter(Boolean);
	return {
		firstName: parts[0] || lastPart || "Unknown",
		middleName: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
		lastName: lastPart || "Unknown",
	};
}

function genderOf(v: unknown): "male" | "female" | "other" {
	const k = cellText(v).toLowerCase();
	if (k === "m" || k.startsWith("male")) return "male";
	if (k === "f" || k.startsWith("female")) return "female";
	return "other";
}

function readRows(file: string) {
	const wb = XLSX.readFile(path.join(BASE_PATH, file));
	const ws = wb.Sheets[wb.SheetNames[0]];
	const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
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
	if (header < 0) return [];
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
	const out: {
		employeeId: string;
		firstName: string;
		middleName?: string;
		lastName: string;
		gender: "male" | "female" | "other";
		birthday: string | null;
	}[] = [];
	for (let i = header + 1; i < rows.length; i++) {
		const r = (rows[i] || []) as unknown[];
		const employeeId = cellText(at(r, ["id no", "no", "no.", "id no."]));
		const empName = cellText(at(r, ["employee name"]));
		if (!employeeId || !empName || /^grand total$/i.test(employeeId)) continue;
		const pn = parseName(empName);
		const b = parseDate(at(r, ["birthday", "date of birth"]));
		out.push({
			employeeId,
			firstName: pn.firstName,
			middleName: pn.middleName,
			lastName: pn.lastName,
			gender: genderOf(at(r, ["gender"])),
			birthday: b ? b.toISOString().slice(0, 10) : null,
		});
	}
	return out;
}

const eq = (a: unknown, b: unknown) =>
	String(a ?? "").trim().toLowerCase().replace(/\s+/g, " ") === String(b ?? "").trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
	// file map: employeeId -> expected person fields (files are disjoint by code prefix)
	const expected = new Map<string, ReturnType<typeof readRows>[number]>();
	for (const f of FILES) {
		if (!fs.existsSync(path.join(BASE_PATH, f))) continue;
		for (const row of readRows(f)) expected.set(row.employeeId, row);
	}
	console.log(`file rows: ${expected.size}`);

	const employees = await prisma.employee.findMany({
		where: { organizationId: ORG_ID, isDeleted: false, employeeId: { in: [...expected.keys()] } },
		select: { id: true, employeeId: true, personId: true, person: { select: { personalInfo: true } } },
	});
	console.log(`employees found: ${employees.length} of ${expected.size}`);

	let missing = 0;
	let ok = 0;
	let fixed = 0;
	let notFound = [...expected.keys()];
	const foundIds = new Set(employees.map((e) => e.employeeId));
	notFound = notFound.filter((id) => !foundIds.has(id));

	const queue = employees.filter((e) => {
		const pi = (e.person?.personalInfo ?? {}) as Record<string, unknown>;
		return !eq(pi.firstName, expected.get(e.employeeId)!.firstName) || !eq(pi.lastName, expected.get(e.employeeId)!.lastName);
	});

	for (const e of queue) {
		const exp = expected.get(e.employeeId)!;
		try {
			await prisma.employee.update({
				where: { id: e.id },
				data: {
					person: {
						create: {
							contactInfo: {},
							personalInfo: {
								firstName: exp.firstName,
								middleName: exp.middleName ?? null,
								lastName: exp.lastName,
								gender: exp.gender,
								birthday: exp.birthday,
							},
						},
					},
				},
			});
			fixed++;
			if (fixed % 50 === 0) console.log(`  relinked ${fixed}...`);
		} catch (err: any) {
			console.error(`  FAIL ${e.employeeId}: ${String(err?.message).slice(0, 160)}`);
			missing++;
		}
	}
	ok = employees.length - queue.length;
	console.log(`RESULT: correct ${ok}, relinked ${fixed}, relink-failed ${missing}, employees-missing-in-DB ${notFound.length}`);
	if (notFound.length) console.log("missing ids:", notFound.slice(0, 20).join(", "));
	await prisma.$disconnect();
}

main().catch(async (e) => {
	console.error(e);
	await prisma.$disconnect();
	process.exit(1);
});