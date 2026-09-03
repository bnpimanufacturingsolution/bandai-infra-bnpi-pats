/**
 * Re-derive Employee.role from department/section IS_HR + level manager flags.
 * Fixes accounts that sit under GA/HR (section.isHr=true) but still login as hris-employee.
 *
 * Usage (from hris-api):
 *   node scripts/repair-employee-roles-from-section-hr.cjs
 *   node scripts/repair-employee-roles-from-section-hr.cjs --section-codes=GAHR,52,53
 */
const fs = require("fs");
const path = require("path");

function loadEnv(filePath, { override = false } = {}) {
	if (!fs.existsSync(filePath)) return;
	for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const i = line.indexOf("=");
		if (i <= 0) continue;
		const key = line.slice(0, i).trim();
		let value = line.slice(i + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (override || process.env[key] === undefined) process.env[key] = value;
	}
}

function argValue(name) {
	const prefix = `--${name}=`;
	const found = process.argv.find((arg) => arg.startsWith(prefix));
	return found ? found.slice(prefix.length) : "";
}

async function main() {
	loadEnv(path.join(process.cwd(), ".env.local-clone"), { override: true });
	loadEnv(path.join(process.cwd(), ".env"));
	if (!process.env.DATABASE_URL && process.env.PG_DATABASE_URL) {
		process.env.DATABASE_URL = process.env.PG_DATABASE_URL;
	}

	// Prefer tsx-register for TS helper; fall back to inlined derivation.
	let syncEmployeeRolesFromOrgStructure;
	try {
		require("tsx/cjs/api").register();
		({ syncEmployeeRolesFromOrgStructure } = require("../helper/employee-role-sync.helper.ts"));
	} catch {
		({ syncEmployeeRolesFromOrgStructure } = require("../helper/employee-role-sync.helper"));
	}
	const { PrismaClient } = require("../generated/prisma");
	const prisma = new PrismaClient();

	try {
		const org =
			(await prisma.organization.findFirst({
				where: { isDeleted: false },
				select: { id: true, code: true, name: true },
			})) || null;
		if (!org) throw new Error("No organization found");

		const sectionCodes = String(argValue("section-codes") || "")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);

		let sectionIds;
		if (sectionCodes.length) {
			const sections = await prisma.section.findMany({
				where: {
					organizationId: org.id,
					isDeleted: false,
					code: { in: sectionCodes },
				},
				select: { id: true, code: true, name: true, isHr: true },
			});
			sectionIds = sections.map((s) => s.id);
			console.log("scoped sections", sections);
		}

		const summary = await syncEmployeeRolesFromOrgStructure(prisma, {
			organizationId: org.id,
			sectionIds,
			sampleLimit: 30,
		});
		console.log(JSON.stringify({ ok: true, organizationId: org.id, ...summary }, null, 2));
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
