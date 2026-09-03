import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import type { EnterpriseMigrationResult } from "../../app/migration/enterprise-migration.service";
import {
	ENTERPRISE_DATASET_STAGE_MAP,
	type LoadedEnterpriseCsvData,
} from "./enterprise-csv-loader";
import type { EnterpriseMigrationStage } from "../../zod/migration.zod";

type DatasetKey = LoadedEnterpriseCsvData["loadedFiles"][number]["datasetKey"];

type DatasetDmDefinition = {
	dmCode: string;
	sheetName: string;
	rowLabel: string;
	sourceType: "dataset";
	datasetKey: DatasetKey;
	fileName: string;
	columnHints: string[];
	stage?: EnterpriseMigrationStage;
};

type StageDmDefinition = {
	dmCode: string;
	sheetName: string;
	rowLabel: string;
	sourceType: "stage";
	stage: EnterpriseMigrationStage;
	fileName: string;
	columnHints: string[];
};

export type DmReportRowDefinition = DatasetDmDefinition | StageDmDefinition;

export interface GenerateMigrationDmReportParams {
	templatePath?: string;
	outputPath: string;
	logPath: string;
	csvDir: string;
	loadedData: Pick<LoadedEnterpriseCsvData, "loadedFiles">;
	result: EnterpriseMigrationResult;
	runSummary: {
		runLabel: string;
		sourceSystem: string;
		dryRun: boolean;
	};
}

const DEFAULT_REPORT_SHEET = "Report Metadata";
const WARNING_REPORT_SHEET = "Report Warnings";
const DEV_START_COLUMN = 5;
const SHEET_ORDER = ["DM0", "DM1", "DM2", "DM3", "DM4", "DM5", "DM6", "DM7"];
const ENVIRONMENT_HEADERS = ["DEV", "UAT", "PROD"] as const;
const METRIC_HEADERS = ["Count", "Start Time", "End Time", "Elapse"] as const;

const DATASET_COLUMN_HINTS: Partial<Record<DatasetKey, string[]>> = {
	organization: ["code", "name"],
	agencies: ["code", "name"],
	calendarItems: ["code", "name", "date"],
	calculators: ["code", "name", "type"],
	payrollCycleConfig: ["defaultPayFrequency", "businessDayRule"],
	payrollPeriods: ["code", "startDate", "endDate"],
	leavePolicies: ["code", "name", "leaveTypeCode"],
	timesheetConfigs: ["code", "name"],
	workflowConfigs: ["code", "domain", "name"],
	documentTypes: ["code", "name", "uploadBy"],
	benefitTypes: ["code", "name", "coverage"],
	loanTypes: ["code", "name", "maxAmount"],
	shiftTypes: ["code", "name"],
	scheduleTemplates: ["code", "name", "shiftTypeCode"],
	departments: ["code", "name"],
	levels: ["name", "rank"],
	positions: ["code", "title", "departmentCode"],
	positionLevels: ["positionCode", "levelName"],
	departmentScheduleLinks: ["departmentCode", "scheduleTemplateCode"],
	persons: ["employeeNumber", "firstName", "lastName"],
	employees: ["employeeId", "departmentCode", "positionCode"],
	reportingLines: ["employeeId", "managerEmployeeId"],
	departmentManagers: ["departmentCode", "employeeId"],
	scheduleOverrides: ["employeeId", "scheduleTemplateCode", "effectiveDate"],
	employeeScheduleHistories: ["employeeId", "changeType", "effectiveAt"],
	terminations: ["employeeId", "effectiveDate", "reason"],
	documentFolders: ["code", "name"],
	documents: ["employeeId", "documentTypeCode", "documentNumber"],
	leaveBalances: ["employeeId", "leaveTypeCode", "balance"],
	employeeBenefits: ["employeeId", "benefitTypeCode", "amount"],
	employeeBenefitInstallments: ["employeeBenefitCode", "installmentNumber", "amount"],
	employeeLoans: ["employeeId", "loanTypeCode", "principalAmount"],
	attendances: ["employeeId", "date", "status"],
	timesheets: ["employeeId", "payrollPeriodCode", "status"],
	timesheetLines: ["employeeId", "date", "status"],
	employeePayrolls: ["employeeId", "payrollPeriodCode", "netPay"],
	statementsOfAccount: ["employeeId", "code", "totalOutstanding"],
	soaRemittances: ["soaCode", "amount", "remittedAt"],
	workflowInstances: ["referenceCode", "workflowCode", "status"],
	requests: ["referenceCode", "type", "status"],
	workflowStepExecutions: ["workflowInstanceCode", "stepNumber", "status"],
	requestTransactions: ["requestCode", "transactionType", "amount"],
};

const datasetDefinition = (
	dmCode: string,
	sheetName: string,
	datasetKey: DatasetKey,
	fileName: string,
): DatasetDmDefinition => ({
	dmCode,
	sheetName,
	rowLabel: `${dmCode} ${fileName}`,
	sourceType: "dataset",
	datasetKey,
	fileName,
	columnHints: DATASET_COLUMN_HINTS[datasetKey] || ["code", "name"],
});

const stageDefinition = (
	dmCode: string,
	sheetName: string,
	stage: EnterpriseMigrationStage,
	fileName: string,
	columnHints: string[],
): StageDmDefinition => ({
	dmCode,
	sheetName,
	rowLabel: `${dmCode} ${fileName}`,
	sourceType: "stage",
	stage,
	fileName,
	columnHints,
});

export const DM_REPORT_DEFINITIONS: DmReportRowDefinition[] = [
	datasetDefinition("DM0.1", "DM0", "organization", "organization.csv"),
	datasetDefinition("DM0.2", "DM0", "agencies", "agencies.csv"),
	datasetDefinition("DM0.3", "DM0", "calendarItems", "calendar_items.csv"),
	datasetDefinition("DM1.1", "DM1", "calculators", "calculators.csv"),
	datasetDefinition("DM1.2", "DM1", "payrollCycleConfig", "payroll_cycle_config.csv"),
	datasetDefinition("DM1.3", "DM1", "payrollPeriods", "payroll_periods.csv"),
	datasetDefinition("DM1.4", "DM1", "leavePolicies", "leave_policies.csv"),
	datasetDefinition("DM1.5", "DM1", "timesheetConfigs", "timesheet_configs.csv"),
	datasetDefinition("DM1.6", "DM1", "workflowConfigs", "workflow_configs.csv"),
	datasetDefinition("DM1.7", "DM1", "documentTypes", "document_types.csv"),
	datasetDefinition("DM1.8", "DM1", "benefitTypes", "benefit_types.csv"),
	datasetDefinition("DM1.9", "DM1", "loanTypes", "loan_types.csv"),
	datasetDefinition("DM2.1", "DM2", "shiftTypes", "shift_types.csv"),
	datasetDefinition("DM2.2", "DM2", "scheduleTemplates", "schedule_templates.csv"),
	datasetDefinition("DM3.1", "DM3", "departments", "departments.csv"),
	datasetDefinition("DM3.2", "DM3", "levels", "levels.csv"),
	datasetDefinition("DM3.3", "DM3", "positions", "positions.csv"),
	datasetDefinition("DM3.4", "DM3", "positionLevels", "position_levels.csv"),
	datasetDefinition("DM3.5", "DM3", "departmentScheduleLinks", "department_schedule_links.csv"),
	datasetDefinition("DM4.1", "DM4", "persons", "persons.csv"),
	datasetDefinition("DM4.2", "DM4", "employees", "employees.csv"),
	datasetDefinition("DM4.3", "DM4", "reportingLines", "reporting_lines.csv"),
	datasetDefinition("DM4.4", "DM4", "departmentManagers", "department_managers.csv"),
	datasetDefinition("DM4.5", "DM4", "scheduleOverrides", "schedule_overrides.csv"),
	datasetDefinition(
		"DM4.6",
		"DM4",
		"employeeScheduleHistories",
		"employee_schedule_histories.csv",
	),
	datasetDefinition("DM4.7", "DM4", "terminations", "terminations.csv"),
	datasetDefinition("DM5.1", "DM5", "documentFolders", "document_folders.csv"),
	datasetDefinition("DM5.2", "DM5", "documents", "documents.csv"),
	datasetDefinition("DM5.3", "DM5", "leaveBalances", "leave_balances.csv"),
	datasetDefinition("DM5.4", "DM5", "employeeBenefits", "employee_benefits.csv"),
	datasetDefinition(
		"DM5.5",
		"DM5",
		"employeeBenefitInstallments",
		"employee_benefit_installments.csv",
	),
	datasetDefinition("DM5.6", "DM5", "employeeLoans", "employee_loans.csv"),
	datasetDefinition("DM6.1", "DM6", "attendances", "attendances.csv"),
	datasetDefinition("DM6.2", "DM6", "timesheets", "timesheets.csv"),
	datasetDefinition("DM6.3", "DM6", "timesheetLines", "timesheet_lines.csv"),
	datasetDefinition("DM6.4", "DM6", "employeePayrolls", "employee_payrolls.csv"),
	datasetDefinition("DM6.5", "DM6", "statementsOfAccount", "statements_of_account.csv"),
	datasetDefinition("DM6.6", "DM6", "soaRemittances", "soa_remittances.csv"),
	datasetDefinition("DM6.7", "DM6", "workflowInstances", "workflow_instances.csv"),
	datasetDefinition("DM6.8", "DM6", "requests", "requests.csv"),
	datasetDefinition(
		"DM6.9",
		"DM6",
		"workflowStepExecutions",
		"workflow_step_executions.csv",
	),
	datasetDefinition("DM6.10", "DM6", "requestTransactions", "request_transactions.csv"),
	stageDefinition(
		"DM7.1",
		"DM7",
		"POST_MIGRATION_RECONCILIATION",
		"reconciliation",
		["goNoGo", "reasons"],
	),
];

const ensureDirectory = (targetPath: string) => {
	const dir = path.dirname(targetPath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const sanitizeFileName = (value: string) =>
	String(value || "")
		.trim()
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "") || "migration-dm-report";

const toElapsedDisplay = (durationMs: number | null | undefined) => {
	const totalSeconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const toRowsPerSecondDisplay = (count: number | null | undefined, durationMs: number | null | undefined) => {
	const numericCount = Number(count ?? 0);
	const numericDuration = Number(durationMs ?? 0);
	if (!Number.isFinite(numericCount) || !Number.isFinite(numericDuration) || numericDuration <= 0) {
		return "";
	}
	return (numericCount / (numericDuration / 1000)).toFixed(2);
};

const getSuccessfulStageCount = (result: EnterpriseMigrationResult["stageResults"][number]) =>
	Number(result.counts.created || 0) +
	Number(result.counts.updated || 0) +
	Number(result.counts.skipped || 0);

const addOrReplaceSheet = (workbook: XLSX.WorkBook, name: string, rows: Array<Array<string | number>>) => {
	const sheet = XLSX.utils.aoa_to_sheet(rows);
	workbook.Sheets[name] = sheet;
	if (!workbook.SheetNames.includes(name)) workbook.SheetNames.push(name);
};

const resolveMappingStage = (definition: DmReportRowDefinition): EnterpriseMigrationStage | null => {
	if (definition.sourceType === "stage") return definition.stage;
	return (
		definition.stage ||
		(ENTERPRISE_DATASET_STAGE_MAP[definition.datasetKey] as EnterpriseMigrationStage | undefined) ||
		null
	);
};

const resolveReportMetric = (
	definition: DmReportRowDefinition,
	params: GenerateMigrationDmReportParams,
	warnings: string[],
) => {
	const stage = resolveMappingStage(definition);
	const stageResult = stage
		? params.result.stageResults.find((item) => item.stage === stage) || null
		: null;

	if (definition.sourceType === "dataset") {
		const file =
			params.loadedData.loadedFiles.find((item) => item.datasetKey === definition.datasetKey) || null;
		if (!file) {
			warnings.push(
				`${definition.rowLabel}: dataset "${definition.datasetKey}" was not present in loadedFiles.`,
			);
		}
		if (!stageResult && stage) {
			warnings.push(
				`${definition.rowLabel}: stage "${stage}" was not executed, so timing could not be resolved.`,
			);
		}
		return {
			count: file?.rowCount ?? "",
			startedAt: stageResult?.startedAt ?? null,
			completedAt: stageResult?.completedAt ?? null,
			elapsed: stageResult ? toElapsedDisplay(stageResult.durationMs) : "",
			rowsPerSecond: stageResult ? toRowsPerSecondDisplay(file?.rowCount ?? 0, stageResult.durationMs) : "",
			failed: stageResult?.counts.failed ?? "",
			warnings: stageResult?.warnings.length ?? "",
			errors: stageResult?.errors.length ?? "",
			stage: stage || "",
			datasetKey: definition.datasetKey,
			countSource: "loadedRows",
		};
	}

	if (!stageResult) {
		warnings.push(`${definition.rowLabel}: stage "${definition.stage}" was not executed.`);
		return {
			count: "",
			startedAt: null,
			completedAt: null,
			elapsed: "",
			rowsPerSecond: "",
			failed: "",
			warnings: "",
			errors: "",
			stage: definition.stage,
			datasetKey: "",
			countSource: "successfulStageRows",
		};
	}

	return {
		count: getSuccessfulStageCount(stageResult),
		startedAt: stageResult.startedAt,
		completedAt: stageResult.completedAt,
		elapsed: toElapsedDisplay(stageResult.durationMs),
		rowsPerSecond: toRowsPerSecondDisplay(getSuccessfulStageCount(stageResult), stageResult.durationMs),
		failed: stageResult.counts.failed,
		warnings: stageResult.warnings.length,
		errors: stageResult.errors.length,
		stage: definition.stage,
		datasetKey: "",
		countSource: "successfulStageRows",
	};
};

const createCell = (value: string | number, type: "s" | "n" = "s"): XLSX.CellObject => ({
	t: type,
	v: value,
});

const createDateCell = (value?: string | null): XLSX.CellObject | undefined => {
	if (!value) return undefined;
	return {
		t: "d",
		v: new Date(value),
		z: "m/d/yyyy h:mm:ss",
	};
};

const applyCell = (
	sheet: XLSX.WorkSheet,
	rowIndex: number,
	columnIndex: number,
	cell?: XLSX.CellObject,
) => {
	if (!cell) return;
	sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })] = cell;
};

const buildSectionRows = (
	definition: DmReportRowDefinition,
	params: GenerateMigrationDmReportParams,
	warnings: string[],
	touchedRows: Array<Array<string | number>>,
) => {
	const metric = resolveReportMetric(definition, params, warnings);
	const titleRow = new Array(17).fill("");
	const hintRow = new Array(17).fill("");
	const spacerRow = new Array(17).fill("");

	titleRow[0] = definition.rowLabel;
	hintRow[0] = definition.columnHints[0] || "";
	hintRow[1] = definition.columnHints[1] || "";
	hintRow[2] = definition.columnHints[2] || "";
	titleRow[DEV_START_COLUMN] = metric.count;
	titleRow[DEV_START_COLUMN + 3] = metric.elapsed;

	touchedRows.push([
		definition.sheetName,
		definition.rowLabel,
		metric.datasetKey || metric.stage,
		String(metric.count),
		metric.startedAt || "",
		metric.completedAt || "",
		metric.elapsed,
		metric.rowsPerSecond,
		String(metric.failed),
		String(metric.warnings),
		String(metric.errors),
		metric.countSource,
	]);

	return {
		rows: [titleRow, hintRow, spacerRow],
		metric,
	};
};

const buildDmSheet = (
	sheetName: string,
	definitions: DmReportRowDefinition[],
	params: GenerateMigrationDmReportParams,
	warnings: string[],
	touchedRows: Array<Array<string | number>>,
) => {
	const rows: Array<Array<string | number>> = [];
	rows.push(["", "", "", "", "", "DEV", "", "", "", "UAT", "", "", "", "PROD", "", "", ""]);
	rows.push(["", "", "", "", "", ...METRIC_HEADERS, ...METRIC_HEADERS, ...METRIC_HEADERS]);

	const metricAssignments: Array<{
		rowIndex: number;
		metric: ReturnType<typeof resolveReportMetric>;
	}> = [];

	for (const definition of definitions) {
		const built = buildSectionRows(definition, params, warnings, touchedRows);
		const rowIndex = rows.length;
		rows.push(...built.rows);
		metricAssignments.push({ rowIndex, metric: built.metric });
	}

	const sheet = XLSX.utils.aoa_to_sheet(rows);
	sheet["!cols"] = [
		{ wch: 34 },
		{ wch: 22 },
		{ wch: 22 },
		{ wch: 4 },
		{ wch: 4 },
		{ wch: 10 },
		{ wch: 20 },
		{ wch: 20 },
		{ wch: 12 },
		{ wch: 10 },
		{ wch: 20 },
		{ wch: 20 },
		{ wch: 12 },
		{ wch: 10 },
		{ wch: 20 },
		{ wch: 20 },
		{ wch: 12 },
	];
	sheet["!merges"] = definitions.map((_, index) => {
		const rowIndex = 2 + index * 3;
		return { s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: 2 } };
	});

	for (const assignment of metricAssignments) {
		const { rowIndex, metric } = assignment;
		applyCell(
			sheet,
			rowIndex,
			DEV_START_COLUMN,
			createCell(metric.count as string | number, typeof metric.count === "number" ? "n" : "s"),
		);
		applyCell(sheet, rowIndex, DEV_START_COLUMN + 1, createDateCell(metric.startedAt));
		applyCell(sheet, rowIndex, DEV_START_COLUMN + 2, createDateCell(metric.completedAt));
		applyCell(sheet, rowIndex, DEV_START_COLUMN + 3, createCell(String(metric.elapsed || "")));
	}

	const totalRows = Math.max(rows.length - 1, 0);
	sheet["!ref"] = XLSX.utils.encode_range({
		s: { r: 0, c: 0 },
		e: { r: totalRows, c: 16 },
	});

	return sheet;
};

const createWorkbookFromDefinition = (
	params: GenerateMigrationDmReportParams,
	warnings: string[],
	touchedRows: Array<Array<string | number>>,
) => {
	const workbook = XLSX.utils.book_new();
	for (const sheetName of SHEET_ORDER) {
		const definitions = DM_REPORT_DEFINITIONS.filter((item) => item.sheetName === sheetName);
		const sheet = buildDmSheet(sheetName, definitions, params, warnings, touchedRows);
		workbook.Sheets[sheetName] = sheet;
		workbook.SheetNames.push(sheetName);
	}
	return workbook;
};

const addUnmappedDatasetWarnings = (
	params: GenerateMigrationDmReportParams,
	warnings: string[],
) => {
	const mappedDatasetKeys = new Set(
		DM_REPORT_DEFINITIONS.filter(
			(item): item is DatasetDmDefinition => item.sourceType === "dataset",
		).map((item) => item.datasetKey),
	);

	for (const file of params.loadedData.loadedFiles) {
		if (!mappedDatasetKeys.has(file.datasetKey)) {
			warnings.push(
				`Loaded dataset "${file.datasetKey}" from "${file.fileName}" does not have a DM report row definition.`,
			);
		}
	}
};

export const resolveMigrationReportOutputPath = (runLabel: string, explicitOutputPath?: string) => {
	const trimmed = String(explicitOutputPath || "").trim();
	const fileName = `${sanitizeFileName(runLabel)}-dm-report.xlsx`;
	if (!trimmed) {
		return path.resolve(process.cwd(), "output", "spreadsheet", fileName);
	}
	if (trimmed.toLowerCase().endsWith(".xlsx")) {
		return path.resolve(process.cwd(), trimmed);
	}
	return path.resolve(process.cwd(), trimmed, fileName);
};

export const generateMigrationDmExcelReport = (params: GenerateMigrationDmReportParams) => {
	const warnings: string[] = [];
	const touchedRows: Array<Array<string | number>> = [
		[
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
		],
	];

	if (params.templatePath && !fs.existsSync(params.templatePath)) {
		warnings.push(`Migration report template was not found and was ignored: ${params.templatePath}`);
	}

	addUnmappedDatasetWarnings(params, warnings);
	const workbook = createWorkbookFromDefinition(params, warnings, touchedRows);

	addOrReplaceSheet(workbook, DEFAULT_REPORT_SHEET, [
		["Run Label", params.runSummary.runLabel],
		["Source System", params.runSummary.sourceSystem],
		["Dry Run", params.runSummary.dryRun ? "true" : "false"],
		["CSV Directory", params.csvDir],
		["Log Path", params.logPath],
		["Template Path", params.templatePath || ""],
		["Generated At", new Date().toISOString()],
		[],
		["Updated Rows"],
		...touchedRows,
	]);

	addOrReplaceSheet(
		workbook,
		WARNING_REPORT_SHEET,
		warnings.length > 0
			? [["Warning"], ...warnings.map((warning) => [warning])]
			: [["Warning"], ["No report warnings."]],
	);

	ensureDirectory(params.outputPath);
	XLSX.writeFile(workbook, params.outputPath, { cellStyles: true });
	return {
		outputPath: params.outputPath,
		warnings,
		updatedRows: touchedRows.length - 1,
	};
};
