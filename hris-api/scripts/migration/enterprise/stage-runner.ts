import fs from "fs";
import path from "path";
import { PrismaClient } from "../../../generated/prisma";
import type { LoadedEnterpriseCsvData } from "../enterprise-csv-loader";
import { loadEnterpriseMigrationDataFromCsvDir } from "../enterprise-csv-loader";
import {
	EnterpriseMigrationStageEnum,
	type EnterpriseMigrationStage,
	type EnterpriseMigrationRequest,
} from "../../../zod/migration.zod";
import { enterpriseMigrationService } from "../../../app/migration/enterprise-migration.service";
import {
	resolveEnterpriseOrganizationBootstrap,
	type EnterpriseOrganizationBootstrapResult,
} from "../enterprise-organization-bootstrap";

const DEFAULT_CSV_DIR = path.resolve(process.cwd(), "docs", "csv");
const DEFAULT_RUN_PREFIX = "enterprise-csv";
const DEFAULT_SOURCE_SYSTEM = "csv-docs-folder";

export const ENTERPRISE_STAGE_SCRIPT_DEFINITIONS: Array<{
	stage: EnterpriseMigrationStage;
	fileName: string;
	scriptName: string;
	logFileName: string;
}> = [
	{
		stage: "PRE_MIGRATION_CONTROLS",
		fileName: "pre-migration-controls.ts",
		scriptName: "migrate:enterprise:pre-checks",
		logFileName: "enterprise-csv-pre-migration-controls-last-run.json",
	},
	{
		stage: "FOUNDATION_MASTER",
		fileName: "foundation-master.ts",
		scriptName: "migrate:enterprise:foundation",
		logFileName: "enterprise-csv-foundation-master-last-run.json",
	},
	{
		stage: "CORE_CONFIGURATION",
		fileName: "core-configuration.ts",
		scriptName: "migrate:enterprise:core-config",
		logFileName: "enterprise-csv-core-configuration-last-run.json",
	},
	{
		stage: "WORK_PATTERN_MASTER",
		fileName: "work-pattern-master.ts",
		scriptName: "migrate:enterprise:work-pattern",
		logFileName: "enterprise-csv-work-pattern-master-last-run.json",
	},
	{
		stage: "ORG_STRUCTURE_SKELETON",
		fileName: "org-structure-skeleton.ts",
		scriptName: "migrate:enterprise:org-structure",
		logFileName: "enterprise-csv-org-structure-skeleton-last-run.json",
	},
	{
		stage: "IDENTITY_MASTER",
		fileName: "identity-master.ts",
		scriptName: "migrate:enterprise:identity",
		logFileName: "enterprise-csv-identity-master-last-run.json",
	},
	{
		stage: "EMPLOYMENT_BASE",
		fileName: "employment-base.ts",
		scriptName: "migrate:enterprise:employment-base",
		logFileName: "enterprise-csv-employment-base-last-run.json",
	},
	{
		stage: "EMPLOYMENT_RELATIONSHIP_PATCH",
		fileName: "employment-relationship-patch.ts",
		scriptName: "migrate:enterprise:employment-relationships",
		logFileName: "enterprise-csv-employment-relationship-patch-last-run.json",
	},
	{
		stage: "EMPLOYEE_ATTACHMENT_OPENING_BALANCE",
		fileName: "employee-attachment-opening-balance.ts",
		scriptName: "migrate:enterprise:attachments",
		logFileName: "enterprise-csv-employee-attachment-opening-balance-last-run.json",
	},
	{
		stage: "CLOSED_HISTORICAL_OPERATIONAL_LEDGER",
		fileName: "closed-historical-operational-ledger.ts",
		scriptName: "migrate:enterprise:historical-ledger",
		logFileName: "enterprise-csv-closed-historical-operational-ledger-last-run.json",
	},
	{
		stage: "OPEN_IN_FLIGHT_TRANSACTIONAL_HISTORY",
		fileName: "open-in-flight-transactional-history.ts",
		scriptName: "migrate:enterprise:in-flight",
		logFileName: "enterprise-csv-open-in-flight-transactional-history-last-run.json",
	},
	{
		stage: "POST_MIGRATION_RECONCILIATION",
		fileName: "post-migration-reconciliation.ts",
		scriptName: "migrate:enterprise:reconciliation",
		logFileName: "enterprise-csv-post-migration-reconciliation-last-run.json",
	},
] as const;

const parseBoolean = (value: string | undefined, fallback: boolean) => {
	if (!value) return fallback;
	if (value.toLowerCase() === "true") return true;
	if (value.toLowerCase() === "false") return false;
	return fallback;
};

const parseNumber = (value: string | undefined, fallback: number) => {
	if (!value) return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const ensureDirectory = (filePath: string) => {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const resolveStageDefinition = (stage: EnterpriseMigrationStage) => {
	const definition = ENTERPRISE_STAGE_SCRIPT_DEFINITIONS.find((item) => item.stage === stage);
	if (!definition) {
		throw new Error(`Unsupported enterprise migration stage: ${stage}`);
	}
	return definition;
};

export const resolveEnterpriseStageLogPath = (stage: EnterpriseMigrationStage) => {
	const explicitLogPath = String(process.env.MIGRATION_LOG_PATH || "").trim();
	if (explicitLogPath) return path.resolve(process.cwd(), explicitLogPath);
	const definition = resolveStageDefinition(stage);
	return path.resolve(process.cwd(), "logs", definition.logFileName);
};

export const resolveEnterpriseStageRunLabel = (
	stage: EnterpriseMigrationStage,
	timestamp = new Date(),
) => {
	const explicit = String(process.env.MIGRATION_RUN_LABEL || "").trim();
	if (explicit) return explicit;
	const stageSlug = stage.toLowerCase().replace(/_/g, "-");
	return `${DEFAULT_RUN_PREFIX}-${stageSlug}-${timestamp.toISOString().replace(/[:.]/g, "-")}`;
};

export const buildEnterpriseStageRequest = (params: {
	forcedStage: EnterpriseMigrationStage;
	organizationId: string;
	loadedData: LoadedEnterpriseCsvData;
}): EnterpriseMigrationRequest => {
	const { forcedStage, organizationId, loadedData } = params;
	const runLabel = resolveEnterpriseStageRunLabel(forcedStage);
	const sourceSystem = String(process.env.MIGRATION_SOURCE_SYSTEM || DEFAULT_SOURCE_SYSTEM).trim();
	const cutoffAt = String(process.env.MIGRATION_CUTOFF_AT || new Date().toISOString()).trim();
	const dryRun = parseBoolean(process.env.MIGRATION_DRY_RUN, true);
	const operator = String(process.env.MIGRATION_OPERATOR || "codex-script").trim();
	const stopOnStageFailure = parseBoolean(process.env.MIGRATION_STOP_ON_STAGE_FAILURE, true);
	const strictIntegrity = parseBoolean(process.env.MIGRATION_STRICT_INTEGRITY, true);
	const allowFallbackSchedule = parseBoolean(
		process.env.MIGRATION_ALLOW_FALLBACK_SCHEDULE,
		false,
	);
	const fallbackShiftTypeCode = String(
		process.env.MIGRATION_FALLBACK_SHIFT_TYPE_CODE || "",
	).trim();

	return {
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
				loadedData.loadedFiles.map((file) => [String(file.datasetKey), file.rowCount]),
			),
		},
		data: loadedData.data,
		options: {
			stages: [forcedStage],
			strictIntegrity,
			allowFallbackSchedule,
			fallbackShiftTypeCode: fallbackShiftTypeCode || undefined,
		},
	};
};

export const loadEnterpriseStageData = () => {
	const csvDir = path.resolve(process.cwd(), process.env.MIGRATION_CSV_DIR || DEFAULT_CSV_DIR);
	const loaded = loadEnterpriseMigrationDataFromCsvDir(csvDir);
	return { csvDir, loaded };
};

export const writeEnterpriseStageLog = (params: {
	stage: EnterpriseMigrationStage;
	csvDir: string;
	organizationBootstrap: EnterpriseOrganizationBootstrapResult;
	input: EnterpriseMigrationRequest;
	loadedData: LoadedEnterpriseCsvData;
	result: Awaited<
		ReturnType<ReturnType<typeof enterpriseMigrationService>["executeEnterpriseMigration"]>
	>;
}) => {
	const logPath = resolveEnterpriseStageLogPath(params.stage);
	ensureDirectory(logPath);
	fs.writeFileSync(
		logPath,
		JSON.stringify(
			{
				csvDir: params.csvDir,
				loadedFiles: params.loadedData.loadedFiles,
				normalizationSummary: params.loadedData.normalizationSummary,
				inputSummary: {
					organizationId: params.organizationBootstrap.organizationId,
					organizationCode: params.organizationBootstrap.organizationCode,
					organizationName: params.organizationBootstrap.organizationName,
					bootstrapSource: params.organizationBootstrap.source,
					bootstrapWarnings: params.organizationBootstrap.warnings,
					runLabel: params.input.manifest.runLabel,
					sourceSystem: params.input.manifest.sourceSystem,
					dryRun: params.input.config.dryRun,
					stages: params.input.options?.stages || [],
				},
				result: params.result,
			},
			null,
			2,
		),
	);
	return logPath;
};

export const runEnterpriseMigrationStage = async (forcedStage: EnterpriseMigrationStage) => {
	if (!EnterpriseMigrationStageEnum.options.includes(forcedStage)) {
		throw new Error(`Invalid enterprise migration stage: ${forcedStage}`);
	}

	const prisma = new PrismaClient();

	try {
		const { csvDir, loaded } = loadEnterpriseStageData();
		const organizationBootstrap = await resolveEnterpriseOrganizationBootstrap(prisma, loaded);
		const organizationId = organizationBootstrap.organizationId;
		const input = buildEnterpriseStageRequest({
			forcedStage,
			organizationId,
			loadedData: loaded,
		});
		const service = enterpriseMigrationService(prisma);
		const result = await service.executeEnterpriseMigration(input);
		const logPath = writeEnterpriseStageLog({
			stage: forcedStage,
			csvDir,
			organizationBootstrap,
			input,
			loadedData: loaded,
			result,
		});

		console.log(
			`Enterprise CSV ${forcedStage} ${result.success ? "succeeded" : "completed with blockers"}.`,
		);
		console.log(`Run label: ${input.manifest.runLabel}`);
		console.log(`CSV directory: ${csvDir}`);
		console.log(`Loaded files: ${loaded.loadedFiles.length}`);
		if (loaded.normalizationSummary && loaded.normalizationSummary.normalizedEmployeeRows > 0) {
			console.log(
				`Employee normalization: ${loaded.normalizationSummary.normalizedEmployeeRows} row(s), ` +
					`${loaded.normalizationSummary.createdDepartments} department(s) created, ` +
					`${loaded.normalizationSummary.createdPositions} position(s) created, ` +
					`${loaded.normalizationSummary.derivedBasicSalaries} salary fallback(s) derived from position.minSalary.`,
			);
		}
		console.log(
			`Organization bootstrap: ${organizationBootstrap.source} (${organizationBootstrap.organizationId})`,
		);
		console.log(`Executed stages: ${(result.manifest.executedStages || []).join(", ")}`);
		console.log(`Go/No-Go: ${result.goNoGo.decision}`);
		console.log(`Result log: ${logPath}`);

		if (organizationBootstrap.warnings.length > 0) {
			console.log("Bootstrap warnings:");
			for (const warning of organizationBootstrap.warnings) {
				console.log(`- ${warning}`);
			}
		}

		if (loaded.normalizationSummary && loaded.normalizationSummary.warnings.length > 0) {
			console.log("Normalization warnings:");
			for (const warning of loaded.normalizationSummary.warnings) {
				console.log(`- ${warning}`);
			}
		}

		if (loaded.normalizationSummary && loaded.normalizationSummary.errors.length > 0) {
			console.log("Normalization errors:");
			for (const error of loaded.normalizationSummary.errors) {
				console.log(`- ${error}`);
			}
		}

		if (result.goNoGo.reasons.length > 0) {
			console.log("Reasons:");
			for (const reason of result.goNoGo.reasons) {
				console.log(`- ${reason}`);
			}
		}

		if (!result.success) {
			process.exitCode = 1;
		}
	} finally {
		await prisma.$disconnect();
	}
};
