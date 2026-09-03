import fs from "fs";
import path from "path";
import { expect } from "chai";
import {
	EnterpriseMigrationDataSchema,
	type EnterpriseMigrationStage,
} from "../zod/migration.zod";
import {
	buildEnterpriseStageRequest,
	ENTERPRISE_STAGE_SCRIPT_DEFINITIONS,
	resolveEnterpriseStageLogPath,
	resolveEnterpriseStageRunLabel,
} from "../scripts/migration/enterprise/stage-runner";

describe("enterprise stage runner", () => {
	it("builds a request with exactly one forced stage", () => {
		const loadedData = {
			data: EnterpriseMigrationDataSchema.parse({
				departments: [{ code: "HR", name: "Human Resources" }],
			}),
			loadedFiles: [{ fileName: "departments.csv", datasetKey: "departments" as const, rowCount: 1 }],
			inferredStages: [
				"PRE_MIGRATION_CONTROLS",
				"ORG_STRUCTURE_SKELETON",
			] as EnterpriseMigrationStage[],
		};

		process.env.MIGRATION_DRY_RUN = "true";
		delete process.env.MIGRATION_LOG_PATH;

		const request = buildEnterpriseStageRequest({
			forcedStage: "ORG_STRUCTURE_SKELETON",
			organizationId: "org-1",
			loadedData,
		});

		expect(request.options?.stages).to.deep.equal(["ORG_STRUCTURE_SKELETON"]);
		expect(request.config.organizationId).to.equal("org-1");
		expect(request.manifest.baselineCounts).to.deep.equal({ departments: 1 });
	});

	it("keeps deterministic metadata for named stage scripts", () => {
		const runLabel = resolveEnterpriseStageRunLabel(
			"OPEN_IN_FLIGHT_TRANSACTIONAL_HISTORY",
			new Date("2026-05-21T00:00:00.000Z"),
		);

		expect(runLabel).to.equal(
			"enterprise-csv-open-in-flight-transactional-history-2026-05-21T00-00-00-000Z",
		);

		const logPath = resolveEnterpriseStageLogPath("ORG_STRUCTURE_SKELETON");
		expect(logPath.endsWith(path.join("logs", "enterprise-csv-org-structure-skeleton-last-run.json"))).to.equal(true);
	});

	it("exposes stage script definitions and matching files for smoke coverage", () => {
		const orgStructure = ENTERPRISE_STAGE_SCRIPT_DEFINITIONS.find(
			(item) => item.stage === "ORG_STRUCTURE_SKELETON",
		);
		const inFlight = ENTERPRISE_STAGE_SCRIPT_DEFINITIONS.find(
			(item) => item.stage === "OPEN_IN_FLIGHT_TRANSACTIONAL_HISTORY",
		);

		expect(orgStructure?.scriptName).to.equal("migrate:enterprise:org-structure");
		expect(inFlight?.scriptName).to.equal("migrate:enterprise:in-flight");
		expect(
			fs.existsSync(
				path.resolve(__dirname, "../scripts/migration/enterprise", orgStructure?.fileName || ""),
			),
		).to.equal(true);
		expect(
			fs.existsSync(
				path.resolve(__dirname, "../scripts/migration/enterprise", inFlight?.fileName || ""),
			),
		).to.equal(true);
	});
});
