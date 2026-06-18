import { PrismaClient as MongoPrismaClient } from "../../generated/prisma";
import { PrismaClient as PostgresPrismaClient } from "../../generated/prisma-postgres/index";

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

export const getClientModel = (client: any, modelName: string) => client[modelName];

export interface CountParityRow {
	modelName: string;
	sourceCount: number;
	targetCount: number;
	ok: boolean;
	skipped?: boolean;
}

export const buildCountParityRows = async (
	source: any,
	target: any,
	modelNames: readonly string[] = MODEL_NAMES,
): Promise<CountParityRow[]> => {
	const rows: CountParityRow[] = [];
	for (const modelName of modelNames) {
		const sourceModel = getClientModel(source, modelName);
		const targetModel = getClientModel(target, modelName);
		if (!sourceModel || !targetModel) {
			rows.push({ modelName, sourceCount: 0, targetCount: 0, ok: true, skipped: true });
			continue;
		}
		const [sourceCount, targetCount] = await Promise.all([sourceModel.count(), targetModel.count()]);
		rows.push({
			modelName,
			sourceCount,
			targetCount,
			ok: sourceCount === targetCount,
		});
	}
	return rows;
};

export const summarizeCountParityRows = (rows: CountParityRow[]) => ({
	checked: rows.filter((row) => !row.skipped).length,
	skipped: rows.filter((row) => row.skipped).length,
	mismatches: rows.filter((row) => !row.ok && !row.skipped).map((row) => row.modelName),
	hasMismatch: rows.some((row) => !row.ok && !row.skipped),
});

export const buildStableRowSignature = (
	row: Record<string, unknown>,
	keys: string[] = ["id", "code", "employeeId", "date", "updatedAt"],
) => {
	const signature: Record<string, unknown> = {};
	for (const key of keys) {
		if (Object.prototype.hasOwnProperty.call(row, key)) {
			signature[key] = row[key] instanceof Date ? (row[key] as Date).toISOString() : row[key];
		}
	}
	return JSON.stringify(signature, Object.keys(signature).sort());
};

export const compareSampleRowSignatures = (params: {
	modelName: string;
	sourceRows: Array<Record<string, unknown>>;
	targetRows: Array<Record<string, unknown>>;
	keys?: string[];
}) => {
	const source = params.sourceRows.map((row) => buildStableRowSignature(row, params.keys)).sort();
	const target = params.targetRows.map((row) => buildStableRowSignature(row, params.keys)).sort();
	return {
		modelName: params.modelName,
		ok: JSON.stringify(source) === JSON.stringify(target),
		source,
		target,
	};
};

export const main = async () => {
	const mongoUrl = process.env.DATABASE_URL;
	const postgresUrl = process.env.PG_DATABASE_URL;
	if (!mongoUrl) throw new Error("DATABASE_URL (MongoDB) is required.");
	if (!postgresUrl) throw new Error("PG_DATABASE_URL (PostgreSQL) is required.");

	const source = new MongoPrismaClient({
		datasources: { db: { url: mongoUrl } },
	});
	const target = new PostgresPrismaClient({
		datasources: { db: { url: postgresUrl } },
	});

	let hasMismatch = false;
	try {
		console.log("Model parity (count-only):");
		const rows = await buildCountParityRows(source, target);
		for (const row of rows) {
			if (row.skipped) {
				console.log(`- ${row.modelName}: skipped (missing model)`);
				continue;
			}
			if (!row.ok) hasMismatch = true;
			console.log(
				`- ${row.modelName}: source=${row.sourceCount} target=${row.targetCount} ${row.ok ? "OK" : "MISMATCH"}`,
			);
		}
	} finally {
		await source.$disconnect();
		await target.$disconnect();
	}

	if (hasMismatch) {
		process.exitCode = 2;
		console.error("Parity mismatch detected.");
	} else {
		console.log("Parity check passed.");
	}
};

if (require.main === module) {
	main().catch((error) => {
		console.error("Parity check failed:", error);
		process.exit(1);
	});
}
