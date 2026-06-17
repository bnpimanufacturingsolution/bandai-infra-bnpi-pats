import fs from "fs";
import path from "path";
import { PrismaClient } from "../../generated/prisma";
import {
	EnterpriseMigrationStageEnum,
	type EnterpriseMigrationStage,
	type EnterpriseMigrationRequest,
} from "../../zod/migration.zod";
import { enterpriseMigrationService } from "../../app/migration/enterprise-migration.service";
import { loadEnterpriseMigrationDataFromCsvDir } from "./enterprise-csv-loader";
import { resolveEnterpriseOrganizationBootstrap } from "./enterprise-organization-bootstrap";
import {
	generateMigrationDmExcelReport,
	resolveMigrationReportOutputPath,
} from "./migration-dm-report";
import { resolveMigrationReportEnabled } from "./migration-report-env";

const DEFAULT_CSV_DIR = path.resolve(process.cwd(), "docs", "csv");
const DEFAULT_LOG_PATH = path.resolve(
	process.cwd(),
	"logs",
	"enterprise-csv-migration-last-run.json",
);

export const parseBoolean = (value: string | undefined, fallback: boolean) => {
	if (!value) return fallback;
	if (value.toLowerCase() === "true") return true;
	if (value.toLowerCase() === "false") return false;
	return fallback;
};

export const parseNumber = (value: string | undefined, fallback: number) => {
	if (!value) return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

export const parseStages = (value: string | undefined): EnterpriseMigrationStage[] | undefined => {
	if (!value?.trim()) return undefined;
	const stages = value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean)
		.map((item) => item.toUpperCase());

	return stages.filter((item): item is EnterpriseMigrationStage =>
		EnterpriseMigrationStageEnum.options.includes(item as EnterpriseMigrationStage),
	);
};

export const ensureDirectory = (filePath: string) => {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

export const main = async () => {
	const prisma = new PrismaClient();
	const csvDir = path.resolve(process.cwd(), process.env.MIGRATION_CSV_DIR || DEFAULT_CSV_DIR);
	const runLabel =
		String(process.env.MIGRATION_RUN_LABEL || "").trim() ||
		`enterprise-csv-${new Date().toISOString().replace(/[:.]/g, "-")}`;
	const sourceSystem = String(process.env.MIGRATION_SOURCE_SYSTEM || "csv-docs-folder").trim();
	const cutoffAt = String(process.env.MIGRATION_CUTOFF_AT || new Date().toISOString()).trim();
	const dryRun = parseBoolean(process.env.MIGRATION_DRY_RUN, true);
	const requestedStages = parseStages(process.env.MIGRATION_STAGES);
	const operator = String(process.env.MIGRATION_OPERATOR || "codex-script").trim();
	const reportEnabled = resolveMigrationReportEnabled(process.env);
	const reportTemplatePath = String(process.env.MIGRATION_REPORT_TEMPLATE_PATH || "").trim();
	const reportOutputPath = resolveMigrationReportOutputPath(
		runLabel,
		String(process.env.MIGRATION_REPORT_OUTPUT_PATH || "").trim(),
	);
	const stopOnStageFailure = parseBoolean(process.env.MIGRATION_STOP_ON_STAGE_FAILURE, true);
	const strictIntegrity = parseBoolean(process.env.MIGRATION_STRICT_INTEGRITY, true);
	const allowFallbackSchedule = parseBoolean(
		process.env.MIGRATION_ALLOW_FALLBACK_SCHEDULE,
		false,
	);
	const fallbackShiftTypeCode = String(
		process.env.MIGRATION_FALLBACK_SHIFT_TYPE_CODE || "",
	).trim();

	try {
		const { data, loadedFiles, inferredStages, normalizationSummary } =
			loadEnterpriseMigrationDataFromCsvDir(csvDir);
		const organizationBootstrap = await resolveEnterpriseOrganizationBootstrap(prisma, {
			data,
			loadedFiles,
			inferredStages,
			normalizationSummary,
		});
		const organizationId = organizationBootstrap.organizationId;

		const input: EnterpriseMigrationRequest = {
			config: {
				organizationId,
				batchSize: parseNumber(process.env.MIGRATION_BATCH_SIZE, 500),
				maxParallelBatches: parseNumber(process.env.MIGRATION_MAX_PARALLEL_BATCHES, 6),
				skipDuplicates: parseBoolean(process.env.MIGRATION_SKIP_DUPLICATES, false),
				dryRun,
				stageBatchSize: parseNumber(process.env.MIGRATION_STAGE_BATCH_SIZE, 500),
				stopOnStageFailure,
			},
			manifest: {
				runLabel,
				sourceSystem,
				cutoffAt: new Date(cutoffAt),
				operator,
				dryRun,
				assumptions: [
					"Files are loaded from docs/csv using filename-to-dataset mapping.",
					"Historical payroll, timesheet, and attendance data are preserved and not recomputed.",
				],
				baselineCounts: Object.fromEntries(
					loadedFiles.map((file) => [String(file.datasetKey), file.rowCount]),
				),
			},
			data,
			options: {
				stages: requestedStages?.length ? requestedStages : inferredStages,
				strictIntegrity,
				allowFallbackSchedule,
				fallbackShiftTypeCode: fallbackShiftTypeCode || undefined,
			},
		};

		const service = enterpriseMigrationService(prisma);
		const result = await service.executeEnterpriseMigration(input);

	const logPath = path.resolve(process.cwd(), process.env.MIGRATION_LOG_PATH || DEFAULT_LOG_PATH);
	ensureDirectory(logPath);
	fs.writeFileSync(
		logPath,
		JSON.stringify(
			{
				csvDir,
				loadedFiles,
				normalizationSummary,
				inputSummary: {
					organizationId,
					organizationCode: organizationBootstrap.organizationCode,
					organizationName: organizationBootstrap.organizationName,
					bootstrapSource: organizationBootstrap.source,
					bootstrapWarnings: organizationBootstrap.warnings,
					runLabel,
					sourceSystem,
					dryRun,
					stages: input.options?.stages || [],
				},
				result,
			},
			null,
			2,
		),
	);

	let reportArtifact:
		| {
				outputPath: string;
				warnings: string[];
				updatedRows: number;
		  }
		| undefined;
	if (reportEnabled) {
		reportArtifact = generateMigrationDmExcelReport({
			templatePath: reportTemplatePath ? path.resolve(reportTemplatePath) : undefined,
			outputPath: reportOutputPath,
			logPath,
			csvDir,
			loadedData: { loadedFiles },
			result,
			runSummary: {
				runLabel,
				sourceSystem,
				dryRun,
			},
		});
	}

	console.log(`Enterprise CSV migration ${result.success ? "succeeded" : "completed with blockers"}.`);
	console.log(`Run label: ${runLabel}`);
	console.log(`CSV directory: ${csvDir}`);
	console.log(`Loaded files: ${loadedFiles.length}`);
	if (normalizationSummary && normalizationSummary.normalizedEmployeeRows > 0) {
		console.log(
			`Employee normalization: ${normalizationSummary.normalizedEmployeeRows} row(s), ` +
				`${normalizationSummary.createdDepartments} department(s) created, ` +
				`${normalizationSummary.createdPositions} position(s) created, ` +
				`${normalizationSummary.derivedBasicSalaries} salary fallback(s) derived from position.minSalary.`,
		);
	}
	console.log(`Organization bootstrap: ${organizationBootstrap.source} (${organizationId})`);
	console.log(`Executed stages: ${(result.manifest.executedStages || []).join(", ")}`);
	console.log(`Go/No-Go: ${result.goNoGo.decision}`);
	console.log(`Result log: ${logPath}`);
	if (reportArtifact) {
		console.log(`Migration DM report: ${reportArtifact.outputPath}`);
		console.log(`Report rows updated: ${reportArtifact.updatedRows}`);
	}

	if (organizationBootstrap.warnings.length > 0) {
		console.log("Bootstrap warnings:");
		for (const warning of organizationBootstrap.warnings) {
			console.log(`- ${warning}`);
		}
	}

	if (normalizationSummary && normalizationSummary.warnings.length > 0) {
		console.log("Normalization warnings:");
		for (const warning of normalizationSummary.warnings) {
			console.log(`- ${warning}`);
		}
	}

	if (normalizationSummary && normalizationSummary.errors.length > 0) {
		console.log("Normalization errors:");
		for (const error of normalizationSummary.errors) {
			console.log(`- ${error}`);
		}
	}

	if (result.goNoGo.reasons.length > 0) {
		console.log("Reasons:");
		for (const reason of result.goNoGo.reasons) {
			console.log(`- ${reason}`);
		}
	}

	if (reportArtifact && reportArtifact.warnings.length > 0) {
		console.log("Report warnings:");
		for (const warning of reportArtifact.warnings) {
			console.log(`- ${warning}`);
		}
	}

	if (!result.success) {
		process.exitCode = 1;
	}
	} finally {
		await prisma.$disconnect();
	}
};

if (require.main === module) {
	main().catch((error) => {
		console.error("Enterprise CSV migration failed:", error);
		process.exit(1);
	});
}
