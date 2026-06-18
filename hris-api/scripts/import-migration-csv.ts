import fs from "fs";
import path from "path";
import { PrismaClient } from "../generated/prisma";
import {
	BulkMigrationInput,
	DepartmentInput,
	EmployeeRowInput,
	EmployeeRowSchema,
	PositionInput,
} from "../zod/migration.zod";
import { migrationService } from "../app/migration/migration.service";

type CliConfig = {
	file: string;
	organizationId: string;
	batchSize: number;
	dryRun: boolean;
	skipDuplicates: boolean;
};

const DEFAULTS: CliConfig = {
	file: "prisma/seeds/data/employees-6000.csv",
	organizationId: "org-sample-001",
	batchSize: 500,
	dryRun: false,
	skipDuplicates: true,
};

// Limit connection pool to avoid saturating MongoDB Atlas
const prisma = new PrismaClient({
	datasources: {
		db: {
			url: process.env.DATABASE_URL,
		},
	},
	log: [{ level: "warn", emit: "stdout" }],
});

const usage = `
Usage:
  npx ts-node scripts/import-migration-csv.ts [options]

Options:
  --file <path>              CSV file path (default: prisma/seeds/data/employees-6000.csv)
  --org <organizationId>     Organization ID (default: org-sample-001)
  --batch <size>             Batch size 50..2000 (default: 500)
  --dry-run                  Validate and simulate without DB writes
  --no-skip-duplicates       Update existing employees instead of no-op upsert
`;

function parseArgs(argv: string[]): CliConfig {
	const config = { ...DEFAULTS };

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--file" && argv[i + 1]) {
			config.file = argv[++i];
		} else if (arg === "--org" && argv[i + 1]) {
			config.organizationId = argv[++i];
		} else if (arg === "--batch" && argv[i + 1]) {
			config.batchSize = Number(argv[++i]);
		} else if (arg === "--dry-run") {
			config.dryRun = true;
		} else if (arg === "--no-skip-duplicates") {
			config.skipDuplicates = false;
		} else if (arg === "--help" || arg === "-h") {
			console.log(usage.trim());
			process.exit(0);
		}
	}

	return config;
}

function splitCsvLine(line: string): string[] {
	return line.split(",").map((v) => v.trim());
}

function normalizeEmpty(value?: string): string | undefined {
	if (value === undefined) return undefined;
	return value.trim() === "" ? undefined : value.trim();
}

function readEmployeesFromCsv(filePath: string): EmployeeRowInput[] {
	const absolutePath = path.resolve(process.cwd(), filePath);
	const raw = fs.readFileSync(absolutePath, "utf-8").replace(/\r/g, "");
	const lines = raw.split("\n").filter((line) => line.trim().length > 0);

	if (lines.length < 2) {
		throw new Error("CSV must include header and at least one data row");
	}

	const headers = splitCsvLine(lines[0]);
	const employees: EmployeeRowInput[] = [];
	const rowErrors: string[] = [];

	for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
		const values = splitCsvLine(lines[rowIdx]);
		if (values.length !== headers.length) {
			rowErrors.push(
				`Row ${rowIdx + 1}: expected ${headers.length} columns but got ${values.length}`,
			);
			continue;
		}

		const row: Record<string, string> = {};
		for (let col = 0; col < headers.length; col++) {
			row[headers[col]] = values[col];
		}

		const parsed = EmployeeRowSchema.safeParse({
			employeeId: normalizeEmpty(row.employeeId),
			firstName: normalizeEmpty(row.firstName),
			lastName: normalizeEmpty(row.lastName),
			middleName: normalizeEmpty(row.middleName),
			email: normalizeEmpty(row.email),
			role: normalizeEmpty(row.role),
			departmentCode: normalizeEmpty(row.departmentCode),
			departmentName: normalizeEmpty(row.departmentName),
			positionCode: normalizeEmpty(row.positionCode),
			positionTitle: normalizeEmpty(row.positionTitle),
			levelName: normalizeEmpty(row.levelName),
			levelRank: normalizeEmpty(row.levelRank),
			basicSalary: normalizeEmpty(row.basicSalary),
			currency: normalizeEmpty(row.currency),
			payFrequency: normalizeEmpty(row.payFrequency),
			employmentType: normalizeEmpty(row.employmentType),
			employmentStatus: normalizeEmpty(row.employmentStatus),
			workLocation: normalizeEmpty(row.workLocation),
			hireDate: normalizeEmpty(row.hireDate),
			reportToEmployeeId: normalizeEmpty(row.reportToEmployeeId),
		});

		if (!parsed.success) {
			const first = parsed.error.issues[0];
			rowErrors.push(`Row ${rowIdx + 1}: ${first.path.join(".")} - ${first.message}`);
			continue;
		}

		employees.push(parsed.data);
	}

	if (rowErrors.length > 0) {
		console.error("CSV validation failed:");
		for (const err of rowErrors.slice(0, 20)) console.error(`- ${err}`);
		if (rowErrors.length > 20) console.error(`- ...and ${rowErrors.length - 20} more`);
		throw new Error(`Found ${rowErrors.length} invalid CSV rows`);
	}

	return employees;
}

function deriveDepartmentsAndPositions(employees: EmployeeRowInput[]): {
	departments: DepartmentInput[];
	positions: PositionInput[];
} {
	const departmentsByCode = new Map<string, DepartmentInput>();
	const positionsByCode = new Map<string, PositionInput>();

	for (const emp of employees) {
		if (!departmentsByCode.has(emp.departmentCode)) {
			departmentsByCode.set(emp.departmentCode, {
				code: emp.departmentCode,
				name: emp.departmentName || emp.departmentCode,
			});
		}

		if (!positionsByCode.has(emp.positionCode)) {
			positionsByCode.set(emp.positionCode, {
				code: emp.positionCode,
				title: emp.positionTitle || emp.positionCode,
				departmentCode: emp.departmentCode,
			});
		}
	}

	return {
		departments: Array.from(departmentsByCode.values()),
		positions: Array.from(positionsByCode.values()),
	};
}

async function main() {
	const cli = parseArgs(process.argv.slice(2));
	await prisma.$connect();

	const employees = readEmployeesFromCsv(cli.file);
	const { departments, positions } = deriveDepartmentsAndPositions(employees);

	const payload: BulkMigrationInput = {
		config: {
			organizationId: cli.organizationId,
			batchSize: cli.batchSize,
			dryRun: cli.dryRun,
			skipDuplicates: cli.skipDuplicates,
		},
		departments,
		positions,
		employees,
	};

	console.log(
		`Starting migration from CSV: employees=${employees.length}, depts=${departments.length}, positions=${positions.length}, batch=${cli.batchSize}, dryRun=${cli.dryRun}`,
	);

	const service = migrationService(prisma);
	const result = await service.executeMigration(payload);

	console.log("Migration result summary:");
	console.log(
		`- departments: created=${result.summary.departments.created}, existing=${result.summary.departments.existing}`,
	);
	console.log(
		`- positions: created=${result.summary.positions.created}, existing=${result.summary.positions.existing}`,
	);
	console.log(
		`- levels: created=${result.summary.levels.created}, existing=${result.summary.levels.existing}`,
	);
	console.log(
		`- employees: created=${result.summary.employees.created}, skipped=${result.summary.employees.skipped}, failed=${result.summary.employees.failed}`,
	);
	console.log(`- durationMs=${result.summary.totalDurationMs}`);

	if (result.errors.length > 0) {
		console.log(`- errors=${result.errors.length}`);
		for (const err of result.errors.slice(0, 20)) {
			console.log(
				`  row=${err.row} employeeId=${err.employeeId || "n/a"} field=${err.field || "n/a"} message=${err.message}`,
			);
		}
	}

	process.exit(result.success ? 0 : 1);
}

main()
	.catch((error) => {
		console.error("CSV migration import failed:", error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
