import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";
import { PrismaClient as MongoPrismaClient } from "../../generated/prisma";
import { PrismaClient as PostgresPrismaClient } from "../../generated/prisma-postgres/index";
import { Prisma as PostgresPrisma } from "../../generated/prisma-postgres/index";
import {
	assertSafeMigrationExecution,
	resolveExecutionMode,
} from "./script-safety";

dotenv.config();

const CHECKPOINT_PATH = path.resolve(process.cwd(), "logs", "mongo-postgres-backfill-checkpoint.json");
const BATCH_SIZE = Number(process.env.MIGRATION_BATCH_SIZE || 500);

export const MODEL_NAMES = [
	"organization",
	"level",
	"device",
	"agency",
	"calendarItem",
	"benefitType",
	"loanType",
	"documentType",
	"department",
	"section",
	"position",
	"person",
	"employee",
	"employeeScheduleHistory",
	"scheduleOverride",
	"calculator",
	"payrollPeriod",
	"timesheet",
	"timesheetline",
	"attendance",
	"attendanceObligation",
	"documentFolder",
	"document",
	"employeeLeaveBalance",
	"employeeBenefit",
	"employeeBenefitInstallment",
	"employeeLoan",
	"employeePayroll",
	"statementOfAccount",
	"sOALineItem",
	"sOARemittance",
	"request",
	"requestTransaction",
	"workflowInstance",
	"workflowStepExecution",
] as const;

type Checkpoint = Record<string, { completed: boolean; copied: number; updatedAt: string }>;

const ensureCheckpointDir = () => {
	const dir = path.dirname(CHECKPOINT_PATH);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const loadCheckpoint = (): Checkpoint => {
	if (!fs.existsSync(CHECKPOINT_PATH)) return {};
	return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf8")) as Checkpoint;
};

const saveCheckpoint = (checkpoint: Checkpoint) => {
	ensureCheckpointDir();
	fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
};

export const getClientModel = (client: any, modelName: string) => client[modelName];

export const getAllowedFieldsMap = (): Map<string, Set<string>> => {
	const map = new Map<string, Set<string>>();
	for (const model of PostgresPrisma.dmmf.datamodel.models) {
		const allowed = new Set(
			model.fields
				.filter((field) => field.kind === "scalar" || field.kind === "enum")
				.map((field) => field.name),
		);
		map.set(model.name.toLowerCase(), allowed);
	}
	return map;
};

export const sanitizeRowForTarget = (
	modelName: string,
	row: Record<string, unknown>,
	allowedFieldsMap: Map<string, Set<string>>,
) => {
	const allowedFields = allowedFieldsMap.get(modelName.toLowerCase());
	if (!allowedFields) return row;
	const sanitized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(row)) {
		if (allowedFields.has(key)) {
			sanitized[key] = value;
		}
	}
	return sanitized;
};

export const extractFkFieldName = (fieldNameMeta: unknown): string | null => {
	if (typeof fieldNameMeta !== "string") return null;
	const match = fieldNameMeta.match(/_([A-Za-z0-9]+)_fkey/);
	return match?.[1] ?? null;
};

export const createWithFkFallback = async (
	targetModel: any,
	modelName: string,
	inputRow: Record<string, unknown>,
) => {
	const row = { ...inputRow };
	const nulledFields = new Set<string>();
	const maxAttempts = 8;

	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		try {
			await targetModel.create({ data: row });
			return;
		} catch (error: any) {
			if (error?.code === "P2002") return;
			if (error?.code !== "P2003") throw error;

			const fkField = extractFkFieldName(error?.meta?.field_name);
			if (!fkField || !(fkField in row) || nulledFields.has(fkField)) {
				// Preserve existing explicit fallbacks for known legacy relationships.
				if (modelName === "department" && row.managerId && !nulledFields.has("managerId")) {
					row.managerId = null;
					nulledFields.add("managerId");
					continue;
				}
				if (modelName === "employee" && row.reportToId && !nulledFields.has("reportToId")) {
					row.reportToId = null;
					nulledFields.add("reportToId");
					continue;
				}
				if (
					modelName === "payrollPeriod" &&
					row.calculatorId &&
					!nulledFields.has("calculatorId")
				) {
					row.calculatorId = null;
					nulledFields.add("calculatorId");
					continue;
				}
				throw error;
			}

			row[fkField] = null;
			nulledFields.add(fkField);
		}
	}

	throw new Error(`Exceeded FK fallback attempts for model ${modelName}`);
};

export const main = async () => {
	const mongoUrl = process.env.DATABASE_URL;
	const postgresUrl = process.env.PG_DATABASE_URL;
	if (!mongoUrl) throw new Error("DATABASE_URL (MongoDB) is required.");
	if (!postgresUrl) throw new Error("PG_DATABASE_URL (PostgreSQL) is required.");
	const executionMode = resolveExecutionMode();
	if (!executionMode.execute) {
		throw new Error(
			"Mongo to Postgres backfill is a write migration. Re-run with --execute only after validating isolated/local targets.",
		);
	}
	assertSafeMigrationExecution({
		scriptName: "mongo-to-postgres-backfill",
		execute: executionMode.execute,
		databaseTargets: [
			{ label: "DATABASE_URL", url: mongoUrl },
			{ label: "PG_DATABASE_URL", url: postgresUrl },
		],
	});

	const source = new MongoPrismaClient({
		datasources: { db: { url: mongoUrl } },
	});
	const target = new PostgresPrismaClient({
		datasources: { db: { url: postgresUrl } },
	});

	const checkpoint = loadCheckpoint();
	const allowedFieldsMap = getAllowedFieldsMap();

	try {
		for (const modelName of MODEL_NAMES) {
			if (checkpoint[modelName]?.completed) {
				console.log(`- ${modelName}: already completed, skipping`);
				continue;
			}

			const sourceModel = getClientModel(source, modelName);
			const targetModel = getClientModel(target, modelName);

			if (!sourceModel || !targetModel) {
				console.log(`- ${modelName}: missing on source/target client, skipping`);
				continue;
			}

			console.log(`\n== Migrating ${modelName} ==`);

			const total = await sourceModel.count();
			console.log(`source count: ${total}`);

			let copied = 0;
			for (let skip = 0; skip < total; skip += BATCH_SIZE) {
				const rows = await sourceModel.findMany({
					skip,
					take: BATCH_SIZE,
				});
				if (!rows.length) break;

				for (const rawRow of rows) {
					const row = sanitizeRowForTarget(
						modelName,
						{ ...(rawRow as Record<string, unknown>) },
						allowedFieldsMap,
					);
					await createWithFkFallback(targetModel, modelName, row);
				}

				copied += rows.length;
				checkpoint[modelName] = {
					completed: false,
					copied,
					updatedAt: new Date().toISOString(),
				};
				saveCheckpoint(checkpoint);
				console.log(`${modelName}: ${copied}/${total}`);
			}

			checkpoint[modelName] = {
				completed: true,
				copied,
				updatedAt: new Date().toISOString(),
			};
			saveCheckpoint(checkpoint);
			console.log(`completed ${modelName}: ${copied} copied`);
		}

		console.log("\nBackfill finished.");
		console.log(`Checkpoint: ${CHECKPOINT_PATH}`);
	} finally {
		await source.$disconnect();
		await target.$disconnect();
	}
};

if (require.main === module) {
	main().catch((error) => {
		console.error("Backfill failed:", error);
		process.exit(1);
	});
}
