import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma";

type CsvRow = {
	EMP_ID?: string;
	EMAIL?: string;
	SOURCE_SHEET?: string;
	SOURCE_ROW?: string;
};

const prisma = new PrismaClient();

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const organizationId = process.argv.find((arg) => arg.startsWith("--org="))?.split("=")[1];

const clean = (value: unknown) => String(value || "").trim();

const normalizeEmail = (value: unknown) => {
	const email = clean(value).toLowerCase();
	if (!email) return "";
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(email)) return "";
	return email;
};

const readRows = () => {
	const repoRoot = path.resolve(__dirname, "..", "..");
	const csvPath = path.join(repoRoot, "data", "import", "employees-import.csv");
	if (!fs.existsSync(csvPath)) {
		throw new Error(`Missing import CSV at ${csvPath}`);
	}

	const workbook = XLSX.read(fs.readFileSync(csvPath, "utf8"), { type: "string" });
	return XLSX.utils.sheet_to_json<CsvRow>(workbook.Sheets.Sheet1, {
		defval: "",
		raw: false,
	});
};

const main = async () => {
	const rows = readRows();
	const stats = {
		rows: rows.length,
		employeesMatched: 0,
		metadataUpdates: 0,
		emailUpdates: 0,
		emailConflicts: 0,
		missingEmployees: 0,
	};
	const samples: string[] = [];

	for (const row of rows) {
		const employeeId = clean(row.EMP_ID);
		if (!employeeId) continue;

		const employee = await prisma.employee.findFirst({
			where: {
				employeeId,
				...(organizationId ? { organizationId } : {}),
			},
			select: {
				id: true,
				employeeId: true,
				metadata: true,
				person: {
					select: {
						id: true,
						contactInfo: true,
					},
				},
			},
		});

		if (!employee) {
			stats.missingEmployees++;
			continue;
		}

		stats.employeesMatched++;
		const sourceEmail = normalizeEmail(row.EMAIL);
		const sourceSheet = clean(row.SOURCE_SHEET) || "Manpower Databank";
		const sourceRow = clean(row.SOURCE_ROW) || null;
		const metadata = ((employee.metadata || {}) as Record<string, any>) || {};
		const manpowerDatabank = {
			...(metadata.manpowerDatabank || {}),
			sourceWorkbook:
				metadata.manpowerDatabank?.sourceWorkbook || "docs/BNPI_MASTERLIST.xlsx",
			sourceSheet,
			sourceRow,
		};
		const nextMetadata = {
			...metadata,
			manpowerDatabank,
		};

		const currentSourceRow = metadata.manpowerDatabank?.sourceRow || null;
		if (currentSourceRow !== sourceRow || metadata.manpowerDatabank?.sourceSheet !== sourceSheet) {
			stats.metadataUpdates++;
			if (execute) {
				await prisma.employee.update({
					where: { id: employee.id },
					data: { metadata: nextMetadata },
				});
			}
		}

		const contactInfo = ((employee.person?.contactInfo || {}) as Record<string, any>) || {};
		const currentEmail = clean(contactInfo.email).toLowerCase();
		if (sourceEmail && !currentEmail && employee.person?.id) {
			stats.emailUpdates++;
			if (execute) {
				await prisma.person.update({
					where: { id: employee.person.id },
					data: {
						contactInfo: {
							...contactInfo,
							email: sourceEmail,
						},
					},
				});
			}
			if (samples.length < 10) samples.push(`${employee.employeeId}: email <- ${sourceEmail}`);
		} else if (sourceEmail && currentEmail && currentEmail !== sourceEmail) {
			stats.emailConflicts++;
			if (samples.length < 10) {
				samples.push(`${employee.employeeId}: kept ${currentEmail}, source ${sourceEmail}`);
			}
		}
	}

	console.log(
		JSON.stringify(
			{
				mode: execute ? "execute" : "dry-run",
				organizationId: organizationId || null,
				stats,
				samples,
			},
			null,
			2,
		),
	);
};

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
