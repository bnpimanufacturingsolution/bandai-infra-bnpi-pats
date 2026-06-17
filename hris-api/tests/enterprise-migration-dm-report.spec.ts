import fs from "fs";
import assert from "node:assert/strict";
import os from "os";
import path from "path";
import { describe, it } from "mocha";
import * as XLSX from "xlsx";
import {
	DM_REPORT_DEFINITIONS,
	generateMigrationDmExcelReport,
	resolveMigrationReportOutputPath,
} from "../scripts/migration/migration-dm-report";
import { ENTERPRISE_CSV_FILENAME_MAP } from "../scripts/migration/enterprise-csv-loader";

const EXPECTED_DM_ROWS = [
	"DM0.1 organization.csv",
	"DM0.2 agencies.csv",
	"DM0.3 calendar_items.csv",
	"DM1.1 calculators.csv",
	"DM1.2 payroll_cycle_config.csv",
	"DM1.3 payroll_periods.csv",
	"DM1.4 leave_policies.csv",
	"DM1.5 timesheet_configs.csv",
	"DM1.6 workflow_configs.csv",
	"DM1.7 document_types.csv",
	"DM1.8 benefit_types.csv",
	"DM1.9 loan_types.csv",
	"DM2.1 shift_types.csv",
	"DM2.2 schedule_templates.csv",
	"DM3.1 departments.csv",
	"DM3.2 levels.csv",
	"DM3.3 positions.csv",
	"DM3.4 position_levels.csv",
	"DM3.5 department_schedule_links.csv",
	"DM4.1 persons.csv",
	"DM4.2 employees.csv",
	"DM4.3 reporting_lines.csv",
	"DM4.4 department_managers.csv",
	"DM4.5 schedule_overrides.csv",
	"DM4.6 employee_schedule_histories.csv",
	"DM4.7 terminations.csv",
	"DM5.1 document_folders.csv",
	"DM5.2 documents.csv",
	"DM5.3 leave_balances.csv",
	"DM5.4 employee_benefits.csv",
	"DM5.5 employee_benefit_installments.csv",
	"DM5.6 employee_loans.csv",
	"DM6.1 attendances.csv",
	"DM6.2 timesheets.csv",
	"DM6.3 timesheet_lines.csv",
	"DM6.4 employee_payrolls.csv",
	"DM6.5 statements_of_account.csv",
	"DM6.6 soa_remittances.csv",
	"DM6.7 workflow_instances.csv",
	"DM6.8 requests.csv",
	"DM6.9 workflow_step_executions.csv",
	"DM6.10 request_transactions.csv",
	"DM7.1 reconciliation",
];

describe("enterprise migration DM report", () => {
	it("keeps the canonical DM definition complete, unique, and aligned to recognized datasets", () => {
		const rowLabels = DM_REPORT_DEFINITIONS.map((item) => item.rowLabel);
		assert.deepEqual(rowLabels, EXPECTED_DM_ROWS);
		assert.equal(new Set(rowLabels).size, EXPECTED_DM_ROWS.length, "DM row labels must be unique");
		assert.equal(
			new Set(DM_REPORT_DEFINITIONS.map((item) => item.dmCode)).size,
			EXPECTED_DM_ROWS.length,
			"DM codes must be unique",
		);

		const expectedSheetGroups: Record<string, string[]> = {
			DM0: ["DM0.1", "DM0.2", "DM0.3"],
			DM1: ["DM1.1", "DM1.2", "DM1.3", "DM1.4", "DM1.5", "DM1.6", "DM1.7", "DM1.8", "DM1.9"],
			DM2: ["DM2.1", "DM2.2"],
			DM3: ["DM3.1", "DM3.2", "DM3.3", "DM3.4", "DM3.5"],
			DM4: ["DM4.1", "DM4.2", "DM4.3", "DM4.4", "DM4.5", "DM4.6", "DM4.7"],
			DM5: ["DM5.1", "DM5.2", "DM5.3", "DM5.4", "DM5.5", "DM5.6"],
			DM6: ["DM6.1", "DM6.2", "DM6.3", "DM6.4", "DM6.5", "DM6.6", "DM6.7", "DM6.8", "DM6.9", "DM6.10"],
			DM7: ["DM7.1"],
		};

		for (const [sheetName, expectedCodes] of Object.entries(expectedSheetGroups)) {
			assert.deepEqual(
				DM_REPORT_DEFINITIONS.filter((item) => item.sheetName === sheetName).map((item) => item.dmCode),
				expectedCodes,
				`${sheetName} should expose the expected DM order`,
			);
		}

		const recognizedDatasetKeys = new Set(Object.values(ENTERPRISE_CSV_FILENAME_MAP));
		for (const item of DM_REPORT_DEFINITIONS) {
			if (item.sourceType === "dataset") {
				assert.ok(
					recognizedDatasetKeys.has(item.datasetKey),
					`${item.rowLabel} should map to a recognized dataset key`,
				);
			} else {
				assert.equal(item.dmCode, "DM7.1");
				assert.equal(item.stage, "POST_MIGRATION_RECONCILIATION");
			}
		}
	});

	it("generates DM0 to DM7 sheets from the canonical definition", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "enterprise-dm-report-"));
		const outputPath = path.join(tempDir, "report.xlsx");

		try {
			const artifact = generateMigrationDmExcelReport({
				outputPath,
				logPath: path.join(tempDir, "run.json"),
				csvDir: "docs/csv",
				loadedData: {
					loadedFiles: [
						{ fileName: "sample-organization.csv", datasetKey: "organization", rowCount: 1 },
						{ fileName: "sample-departments.csv", datasetKey: "departments", rowCount: 24 },
						{ fileName: "sample-employees.csv", datasetKey: "employees", rowCount: 13 },
						{ fileName: "sample-timesheets.csv", datasetKey: "timesheets", rowCount: 1 },
					],
				},
				result: {
					success: true,
					manifest: {
						runLabel: "enterprise-csv-test",
						sourceSystem: "csv-docs-folder",
						cutoffAt: "2026-05-25T00:00:00.000Z",
						dryRun: true,
						requestedStages: [
							"FOUNDATION_MASTER",
							"ORG_STRUCTURE_SKELETON",
							"EMPLOYMENT_BASE",
							"CLOSED_HISTORICAL_OPERATIONAL_LEDGER",
							"POST_MIGRATION_RECONCILIATION",
						],
						executedStages: [
							"FOUNDATION_MASTER",
							"ORG_STRUCTURE_SKELETON",
							"EMPLOYMENT_BASE",
							"CLOSED_HISTORICAL_OPERATIONAL_LEDGER",
							"POST_MIGRATION_RECONCILIATION",
						],
						operator: "test",
					},
					stageResults: [
						{
							stage: "FOUNDATION_MASTER",
							status: "success",
							counts: { created: 2, updated: 0, skipped: 0, failed: 0 },
							validations: [],
							warnings: [],
							errors: [],
							reconciliation: {},
							startedAt: "2026-05-25T00:00:00.000Z",
							completedAt: "2026-05-25T00:00:30.000Z",
							durationMs: 30000,
						},
						{
							stage: "ORG_STRUCTURE_SKELETON",
							status: "success",
							counts: { created: 24, updated: 0, skipped: 0, failed: 0 },
							validations: [],
							warnings: [],
							errors: [],
							reconciliation: {},
							startedAt: "2026-05-25T00:01:00.000Z",
							completedAt: "2026-05-25T00:01:45.000Z",
							durationMs: 45000,
						},
						{
							stage: "EMPLOYMENT_BASE",
							status: "success",
							counts: { created: 13, updated: 0, skipped: 0, failed: 0 },
							validations: [],
							warnings: [],
							errors: [],
							reconciliation: {},
							startedAt: "2026-05-25T00:02:00.000Z",
							completedAt: "2026-05-25T00:02:25.000Z",
							durationMs: 25000,
						},
						{
							stage: "CLOSED_HISTORICAL_OPERATIONAL_LEDGER",
							status: "success",
							counts: { created: 5, updated: 0, skipped: 0, failed: 0 },
							validations: [],
							warnings: [],
							errors: [],
							reconciliation: {},
							startedAt: "2026-05-25T00:03:00.000Z",
							completedAt: "2026-05-25T00:03:50.000Z",
							durationMs: 50000,
						},
						{
							stage: "POST_MIGRATION_RECONCILIATION",
							status: "success",
							counts: { created: 0, updated: 0, skipped: 1, failed: 0 },
							validations: [],
							warnings: [],
							errors: [],
							reconciliation: {},
							startedAt: "2026-05-25T00:04:00.000Z",
							completedAt: "2026-05-25T00:04:12.000Z",
							durationMs: 12000,
						},
					],
					globalWarnings: [],
					globalErrors: [],
					goNoGo: { decision: "GO", reasons: [] },
					reconciliation: { stageCount: 5 },
				},
				runSummary: {
					runLabel: "enterprise-csv-test",
					sourceSystem: "csv-docs-folder",
					dryRun: true,
				},
			});

			assert.equal(artifact.updatedRows, DM_REPORT_DEFINITIONS.length);
			assert.equal(fs.existsSync(outputPath), true);

			const generated = XLSX.readFile(outputPath, { cellDates: true });
			for (const sheetName of [
				"DM0",
				"DM1",
				"DM2",
				"DM3",
				"DM4",
				"DM5",
				"DM6",
				"DM7",
				"Report Metadata",
				"Report Warnings",
			]) {
				assert.ok(generated.SheetNames.includes(sheetName), `${sheetName} should exist`);
			}

			const dm0Rows = XLSX.utils.sheet_to_json(generated.Sheets.DM0, {
				header: 1,
				raw: false,
				defval: "",
			}) as any[][];
			assert.equal(dm0Rows[2][0], "DM0.1 organization.csv");
			assert.equal(dm0Rows[2][5], "1");
			assert.equal(dm0Rows[2][8], "0:00:30");

			const dm3Rows = XLSX.utils.sheet_to_json(generated.Sheets.DM3, {
				header: 1,
				raw: false,
				defval: "",
			}) as any[][];
			assert.equal(dm3Rows[2][0], "DM3.1 departments.csv");
			assert.equal(dm3Rows[2][5], "24");
			assert.equal(dm3Rows[2][8], "0:00:45");

			const dm4Rows = XLSX.utils.sheet_to_json(generated.Sheets.DM4, {
				header: 1,
				raw: false,
				defval: "",
			}) as any[][];
			assert.equal(dm4Rows[5][0], "DM4.2 employees.csv");
			assert.equal(dm4Rows[5][5], "13");
			assert.equal(dm4Rows[5][8], "0:00:25");

			const dm6Rows = XLSX.utils.sheet_to_json(generated.Sheets.DM6, {
				header: 1,
				raw: false,
				defval: "",
			}) as any[][];
			assert.equal(dm6Rows[5][0], "DM6.2 timesheets.csv");
			assert.equal(dm6Rows[5][5], "1");
			assert.equal(dm6Rows[5][8], "0:00:50");

			const dm7Rows = XLSX.utils.sheet_to_json(generated.Sheets.DM7, {
				header: 1,
				raw: false,
				defval: "",
			}) as any[][];
			assert.equal(dm7Rows[2][0], "DM7.1 reconciliation");
			assert.equal(dm7Rows[2][5], "1");
			assert.equal(dm7Rows[2][8], "0:00:12");

			const metadataRows = XLSX.utils.sheet_to_json(generated.Sheets["Report Metadata"], {
				header: 1,
				raw: false,
				defval: "",
			}) as any[][];
			const updatedRowsHeader = metadataRows.find((row) => row[0] === "Sheet");
			assert.deepEqual(updatedRowsHeader?.slice(0, 12), [
				"Sheet",
				"DM Row",
				"Dataset/Stage",
				"Count",
				"Start Time",
				"End Time",
				"Elapsed",
				"Rows/Sec",
				"Failed",
				"Warnings",
				"Errors",
				"Count Source",
			]);
			const dm0Metadata = metadataRows.find((row) => row[1] === "DM0.1 organization.csv");
			assert.equal(dm0Metadata?.[7], "0.03");
			assert.equal(dm0Metadata?.[8], "0");
			assert.equal(dm0Metadata?.[9], "0");
			assert.equal(dm0Metadata?.[10], "0");
			const timesheetMetadata = metadataRows.find((row) => row[1] === "DM6.2 timesheets.csv");
			assert.equal(timesheetMetadata?.[6], "0:00:50");
			assert.equal(timesheetMetadata?.[7], "0.02");

			const warningsRows = XLSX.utils.sheet_to_json(generated.Sheets["Report Warnings"], {
				header: 1,
				raw: false,
				defval: "",
			});
			assert.ok(warningsRows.length > 1);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("renders blank metrics and warnings for missing datasets and stages", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "enterprise-dm-report-missing-"));
		const outputPath = path.join(tempDir, "report.xlsx");

		try {
			const artifact = generateMigrationDmExcelReport({
				outputPath,
				logPath: path.join(tempDir, "run.json"),
				csvDir: "docs/csv",
				loadedData: {
					loadedFiles: [{ fileName: "sample-organization.csv", datasetKey: "organization", rowCount: 1 }],
				},
				result: {
					success: true,
					manifest: {
						runLabel: "enterprise-csv-test",
						sourceSystem: "csv-docs-folder",
						cutoffAt: "2026-05-25T00:00:00.000Z",
						dryRun: true,
						requestedStages: ["FOUNDATION_MASTER"],
						executedStages: ["FOUNDATION_MASTER"],
						operator: "test",
					},
					stageResults: [
						{
							stage: "FOUNDATION_MASTER",
							status: "success",
							counts: { created: 1, updated: 0, skipped: 0, failed: 0 },
							validations: [],
							warnings: [],
							errors: [],
							reconciliation: {},
							startedAt: "2026-05-25T00:00:00.000Z",
							completedAt: "2026-05-25T00:00:10.000Z",
							durationMs: 10000,
						},
					],
					globalWarnings: [],
					globalErrors: [],
					goNoGo: { decision: "NO_GO", reasons: ["missing stages"] },
					reconciliation: { stageCount: 1 },
				},
				runSummary: {
					runLabel: "enterprise-csv-test",
					sourceSystem: "csv-docs-folder",
					dryRun: true,
				},
			});

			assert.ok(artifact.warnings.length > 0);

			const generated = XLSX.readFile(outputPath, { cellDates: true });
			const dm4Rows = XLSX.utils.sheet_to_json(generated.Sheets.DM4, {
				header: 1,
				raw: false,
				defval: "",
			}) as any[][];
			assert.equal(dm4Rows[5][0], "DM4.2 employees.csv");
			assert.equal(dm4Rows[5][5], "");
			assert.equal(dm4Rows[5][6], "");
			assert.equal(dm4Rows[5][8], "");
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("builds a stable default output path", () => {
		const output = resolveMigrationReportOutputPath("enterprise-csv-2026-05-25T12-00-00-000Z");
		assert.ok(output.toLowerCase().includes(path.join("output", "spreadsheet").toLowerCase()));
		assert.ok(
			output
				.toLowerCase()
				.includes("enterprise-csv-2026-05-25t12-00-00-000z-dm-report.xlsx"),
		);
	});
});
