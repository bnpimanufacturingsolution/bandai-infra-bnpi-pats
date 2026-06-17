import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import {
	EnterpriseMigrationDataSchema,
	type EnterpriseMigrationData,
	type EnterpriseMigrationStage,
} from "../../zod/migration.zod";

export const ENTERPRISE_CSV_FILENAME_MAP: Record<string, keyof EnterpriseMigrationData> = {
	organization: "organization",
	payroll_cycle_config: "payrollCycleConfig",
	calculators: "calculators",
	payroll_periods: "payrollPeriods",
	leave_policies: "leavePolicies",
	timesheet_configs: "timesheetConfigs",
	workflow_configs: "workflowConfigs",
	document_types: "documentTypes",
	benefit_types: "benefitTypes",
	loan_types: "loanTypes",
	agencies: "agencies",
	calendar_items: "calendarItems",
	shift_types: "shiftTypes",
	schedule_templates: "scheduleTemplates",
	departments: "departments",
	levels: "levels",
	positions: "positions",
	position_levels: "positionLevels",
	department_schedule_links: "departmentScheduleLinks",
	persons: "persons",
	employees: "employees",
	reporting_lines: "reportingLines",
	department_managers: "departmentManagers",
	schedule_overrides: "scheduleOverrides",
	employee_schedule_histories: "employeeScheduleHistories",
	document_folders: "documentFolders",
	documents: "documents",
	leave_balances: "leaveBalances",
	employee_benefits: "employeeBenefits",
	employee_benefit_installments: "employeeBenefitInstallments",
	employee_loans: "employeeLoans",
	attendances: "attendances",
	timesheets: "timesheets",
	timesheet_lines: "timesheetLines",
	employee_payrolls: "employeePayrolls",
	statements_of_account: "statementsOfAccount",
	soa_remittances: "soaRemittances",
	workflow_instances: "workflowInstances",
	requests: "requests",
	workflow_step_executions: "workflowStepExecutions",
	request_transactions: "requestTransactions",
	terminations: "terminations",
};

export const ENTERPRISE_DATASET_STAGE_MAP: Partial<
	Record<keyof EnterpriseMigrationData, EnterpriseMigrationStage>
> = {
	organization: "FOUNDATION_MASTER",
	agencies: "FOUNDATION_MASTER",
	calendarItems: "FOUNDATION_MASTER",
	payrollCycleConfig: "CORE_CONFIGURATION",
	calculators: "CORE_CONFIGURATION",
	payrollPeriods: "CORE_CONFIGURATION",
	leavePolicies: "CORE_CONFIGURATION",
	timesheetConfigs: "CORE_CONFIGURATION",
	workflowConfigs: "CORE_CONFIGURATION",
	documentTypes: "CORE_CONFIGURATION",
	benefitTypes: "CORE_CONFIGURATION",
	loanTypes: "CORE_CONFIGURATION",
	shiftTypes: "WORK_PATTERN_MASTER",
	scheduleTemplates: "WORK_PATTERN_MASTER",
	departments: "ORG_STRUCTURE_SKELETON",
	levels: "ORG_STRUCTURE_SKELETON",
	positions: "ORG_STRUCTURE_SKELETON",
	positionLevels: "ORG_STRUCTURE_SKELETON",
	departmentScheduleLinks: "ORG_STRUCTURE_SKELETON",
	persons: "IDENTITY_MASTER",
	employees: "EMPLOYMENT_BASE",
	reportingLines: "EMPLOYMENT_RELATIONSHIP_PATCH",
	departmentManagers: "EMPLOYMENT_RELATIONSHIP_PATCH",
	scheduleOverrides: "EMPLOYMENT_RELATIONSHIP_PATCH",
	employeeScheduleHistories: "EMPLOYMENT_RELATIONSHIP_PATCH",
	terminations: "EMPLOYMENT_RELATIONSHIP_PATCH",
	documentFolders: "EMPLOYEE_ATTACHMENT_OPENING_BALANCE",
	documents: "EMPLOYEE_ATTACHMENT_OPENING_BALANCE",
	leaveBalances: "EMPLOYEE_ATTACHMENT_OPENING_BALANCE",
	employeeBenefits: "EMPLOYEE_ATTACHMENT_OPENING_BALANCE",
	employeeBenefitInstallments: "EMPLOYEE_ATTACHMENT_OPENING_BALANCE",
	employeeLoans: "EMPLOYEE_ATTACHMENT_OPENING_BALANCE",
	attendances: "CLOSED_HISTORICAL_OPERATIONAL_LEDGER",
	timesheets: "CLOSED_HISTORICAL_OPERATIONAL_LEDGER",
	timesheetLines: "CLOSED_HISTORICAL_OPERATIONAL_LEDGER",
	employeePayrolls: "CLOSED_HISTORICAL_OPERATIONAL_LEDGER",
	statementsOfAccount: "CLOSED_HISTORICAL_OPERATIONAL_LEDGER",
	soaRemittances: "CLOSED_HISTORICAL_OPERATIONAL_LEDGER",
	workflowInstances: "OPEN_IN_FLIGHT_TRANSACTIONAL_HISTORY",
	requests: "OPEN_IN_FLIGHT_TRANSACTIONAL_HISTORY",
	workflowStepExecutions: "OPEN_IN_FLIGHT_TRANSACTIONAL_HISTORY",
	requestTransactions: "OPEN_IN_FLIGHT_TRANSACTIONAL_HISTORY",
};

export interface EnterpriseCsvNormalizationSummary {
	normalizedEmployeeRows: number;
	defaultedEmployeeRoles: number;
	reusedDepartments: number;
	createdDepartments: number;
	reusedPositions: number;
	createdPositions: number;
	derivedBasicSalaries: number;
	warnings: string[];
	errors: string[];
}

export interface EnterpriseCsvRowSource {
	fileName: string;
	rowNumber: number;
	datasetKey: keyof EnterpriseMigrationData;
}

const NUMERIC_FIELD_NAMES = new Set([
	"batchSize",
	"stageBatchSize",
	"maxParallelBatches",
	"rank",
	"minSalary",
	"maxSalary",
	"payDateOffsetDays",
	"minAdvanceNoticeDays",
	"maxDaysPerRequest",
	"displayOrder",
	"overtimeFlagThresholdMinutes",
	"coverage",
	"minAmount",
	"maxAmount",
	"fixedAmount",
	"percentage",
	"minServiceMonths",
	"defaultInstallments",
	"payrollCycleDays",
	"interestRate",
	"maxTermMonths",
	"cycleDays",
	"graceLateMinutes",
	"graceEarlyOutMinutes",
	"basicSalary",
	"balance",
	"carryover",
	"totalAmount",
	"totalInstallments",
	"installmentAmount",
	"remainingBalance",
	"amount",
	"principalAmount",
	"termMonths",
	"monthlyPayment",
	"amountPaid",
	"breakMinutes",
	"revisionNo",
	"basicPay",
	"overtimePay",
	"nightDiffPay",
	"holidayPay",
	"allowances",
	"bonuses",
	"taxAmount",
	"sssContribution",
	"philHealthContribution",
	"pagibigContribution",
	"loanDeductions",
	"absentDeduction",
	"lateDeduction",
	"earlyOutDeduction",
	"otherDeductions",
	"grossPay",
	"totalDeductions",
	"netPay",
	"regularHours",
	"overtimeHours",
	"periodNumber",
	"cutoffDay",
	"year",
	"sequenceNumber",
	"installmentNumber",
	"stepNumber",
	"currentStepNumber",
	"lastCompletedStepNumber",
	"totalEmployeeShare",
	"totalEmployerShare",
	"totalTax",
	"totalRemitted",
	"totalOutstanding",
	"amount",
]);

const BOOLEAN_FIELD_NAMES = new Set([
	"dryRun",
	"skipDuplicates",
	"stopOnStageFailure",
	"enabled",
	"isPaid",
	"requiresApproval",
	"allowHalfDay",
	"requireAttachment",
	"enableAutoApprove",
	"enableEditBeforeSubmission",
	"isRequired",
	"isEmployeeVisible",
	"isActive",
	"isDefault",
	"isTaxable",
	"requireTermsAgreement",
	"isOvernight",
	"isOff",
	"strictIntegrity",
	"allowFallbackSchedule",
	"agreedToTerms",
	"eppReconciled",
	"isAllDay",
	"legalApprovalRequired",
	"finalPayCalculated",
	"clearanceCompleted",
	"isSystemGenerated",
	"isPaid",
	"isRequired",
	"isActive",
]);

const normalizeFilename = (filename: string) =>
	path
		.basename(filename, path.extname(filename))
		.replace(/^sample[-_]/i, "")
		.replace(/[ -]+/g, "_")
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.toLowerCase();

const normalizeSemanticName = (value: unknown) =>
	String(value || "")
		.trim()
		.replace(/\s+/g, " ")
		.toLowerCase();

const sanitizeCodeToken = (value: string) =>
	value
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");

const buildGeneratedCode = (
	sourceValue: string,
	usedCodes: Set<string>,
	codeToSemanticName: Map<string, string>,
) => {
	const semanticName = normalizeSemanticName(sourceValue);
	const baseCode = sanitizeCodeToken(sourceValue) || "GENERATED";

	if (!usedCodes.has(baseCode)) return baseCode;
	if (codeToSemanticName.get(baseCode) === semanticName) return baseCode;

	let suffix = 2;
	while (true) {
		const candidate = `${baseCode}-${suffix}`;
		if (!usedCodes.has(candidate) || codeToSemanticName.get(candidate) === semanticName) {
			return candidate;
		}
		suffix += 1;
	}
};

const parseScalarValue = (fieldPath: string, rawValue: unknown): unknown => {
	if (rawValue === null || rawValue === undefined) return undefined;
	if (typeof rawValue !== "string") return rawValue;

	const trimmed = rawValue.trim();
	if (!trimmed) return undefined;

	if (
		(trimmed.startsWith("{") && trimmed.endsWith("}")) ||
		(trimmed.startsWith("[") && trimmed.endsWith("]"))
	) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return trimmed;
		}
	}

	const leafField = fieldPath.split(".").pop() || fieldPath;
	const normalizedLeaf = leafField.replace(/[^a-zA-Z0-9]/g, "");

	if (BOOLEAN_FIELD_NAMES.has(leafField) || BOOLEAN_FIELD_NAMES.has(normalizedLeaf)) {
		if (/^(true|false)$/i.test(trimmed)) {
			return trimmed.toLowerCase() === "true";
		}
	}

	if (NUMERIC_FIELD_NAMES.has(leafField) || NUMERIC_FIELD_NAMES.has(normalizedLeaf)) {
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			return Number(trimmed);
		}
	}

	if (/^(true|false)$/i.test(trimmed)) {
		return trimmed.toLowerCase() === "true";
	}

	return trimmed;
};

const setNestedValue = (target: Record<string, any>, keyPath: string, value: unknown) => {
	const segments = keyPath.split(".").filter(Boolean);
	if (!segments.length) return;

	let cursor = target;
	for (let index = 0; index < segments.length - 1; index += 1) {
		const segment = segments[index];
		if (!cursor[segment] || typeof cursor[segment] !== "object" || Array.isArray(cursor[segment])) {
			cursor[segment] = {};
		}
		cursor = cursor[segment];
	}

	cursor[segments[segments.length - 1]] = value;
};

const parseCsvRows = (params: {
	filePath: string;
	fileName: string;
	datasetKey: keyof EnterpriseMigrationData;
}): Record<string, any>[] => {
	const { filePath, fileName, datasetKey } = params;
	const workbook = XLSX.readFile(filePath, { raw: false, cellDates: false });
	const firstSheet = workbook.SheetNames[0];
	const worksheet = workbook.Sheets[firstSheet];
	const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
		defval: "",
		blankrows: false,
		raw: false,
	});

	return rows
		.map((row, index) => {
			const parsed: Record<string, any> = {};
			for (const [key, value] of Object.entries(row || {})) {
				const normalizedKey = String(key || "").trim();
				if (!normalizedKey) continue;
				const parsedValue = parseScalarValue(normalizedKey, value);
				if (parsedValue === undefined) continue;
				setNestedValue(parsed, normalizedKey, parsedValue);
			}
			parsed._csvSource = {
				fileName,
				rowNumber: index + 2,
				datasetKey,
			} satisfies EnterpriseCsvRowSource;
			return parsed;
		})
		.filter((row) => Object.keys(row).length > 0);
};

export interface LoadedEnterpriseCsvData {
	data: EnterpriseMigrationData;
	loadedFiles: Array<{
		fileName: string;
		datasetKey: keyof EnterpriseMigrationData;
		rowCount: number;
	}>;
	inferredStages: EnterpriseMigrationStage[];
	normalizationSummary?: EnterpriseCsvNormalizationSummary;
}

const normalizeEmployeeDataset = (base: EnterpriseMigrationData) => {
	const summary: EnterpriseCsvNormalizationSummary = {
		normalizedEmployeeRows: 0,
		defaultedEmployeeRoles: 0,
		reusedDepartments: 0,
		createdDepartments: 0,
		reusedPositions: 0,
		createdPositions: 0,
		derivedBasicSalaries: 0,
		warnings: [],
		errors: [],
	};

	const departments = Array.isArray(base.departments) ? [...base.departments] : [];
	const positions = Array.isArray(base.positions) ? [...base.positions] : [];
	const employees = Array.isArray(base.employees) ? [...base.employees] : [];

	const departmentsByName = new Map<string, (typeof departments)[number]>();
	const departmentCodes = new Set<string>();
	const departmentCodeToName = new Map<string, string>();
	for (const department of departments) {
		const semanticName = normalizeSemanticName(department.name);
		if (semanticName && !departmentsByName.has(semanticName)) {
			departmentsByName.set(semanticName, department);
		}
		const code = sanitizeCodeToken(String(department.code || ""));
		if (code) {
			departmentCodes.add(code);
			departmentCodeToName.set(code, semanticName);
		}
	}

	const positionsByTitle = new Map<string, (typeof positions)[number]>();
	const positionCodes = new Set<string>();
	const positionCodeToTitle = new Map<string, string>();
	for (const position of positions) {
		const semanticTitle = normalizeSemanticName(position.title);
		if (semanticTitle && !positionsByTitle.has(semanticTitle)) {
			positionsByTitle.set(semanticTitle, position);
		}
		const code = sanitizeCodeToken(String(position.code || ""));
		if (code) {
			positionCodes.add(code);
			positionCodeToTitle.set(code, semanticTitle);
		}
	}

	const normalizedEmployees = employees.map((employee, index) => {
		const row = { ...(employee as Record<string, any>) };
		const employeeId =
			String(
				row.employeeId || row["Employee No."] || row["Employee No"] || row.employeeNo || "",
			).trim() || undefined;
		const role = String(row.role || "").trim() || "hris-employee";
		if (!String(row.role || "").trim()) summary.defaultedEmployeeRoles += 1;

		const rawDepartmentName =
			String(row.departmentName || row.Section || row.section || "").trim() || undefined;
		let departmentCode = String(row.departmentCode || "").trim() || undefined;
		let resolvedDepartmentName =
			String(row.departmentName || row.Section || row.section || "").trim() || undefined;

		if (!departmentCode && rawDepartmentName) {
			const existingDepartment = departmentsByName.get(normalizeSemanticName(rawDepartmentName));
			if (existingDepartment) {
				departmentCode = existingDepartment.code;
				resolvedDepartmentName = existingDepartment.name;
				summary.reusedDepartments += 1;
			} else {
				const generatedDepartmentCode = buildGeneratedCode(
					rawDepartmentName,
					departmentCodes,
					departmentCodeToName,
				);
				const inferredDepartment = {
					code: generatedDepartmentCode,
					name: rawDepartmentName,
					description: `Inferred from employees.csv Section column.`,
				};
				departments.push(inferredDepartment as any);
				departmentsByName.set(normalizeSemanticName(rawDepartmentName), inferredDepartment as any);
				departmentCodes.add(generatedDepartmentCode);
				departmentCodeToName.set(generatedDepartmentCode, normalizeSemanticName(rawDepartmentName));
				departmentCode = generatedDepartmentCode;
				resolvedDepartmentName = rawDepartmentName;
				summary.createdDepartments += 1;
				summary.warnings.push(
					`employees[${index}] inferred department "${rawDepartmentName}" as code "${generatedDepartmentCode}".`,
				);
			}
		}

		const rawPositionTitle =
			String(row.positionTitle || row.Position || row.position || "").trim() || undefined;
		let positionCode = String(row.positionCode || "").trim() || undefined;
		let matchedPosition: ((typeof positions)[number] & Record<string, any>) | undefined;

		if (!positionCode && rawPositionTitle) {
			const existingPosition = positionsByTitle.get(normalizeSemanticName(rawPositionTitle));
			if (existingPosition) {
				positionCode = existingPosition.code;
				matchedPosition = existingPosition as any;
				summary.reusedPositions += 1;
			} else if (departmentCode) {
				const generatedPositionCode = buildGeneratedCode(
					rawPositionTitle,
					positionCodes,
					positionCodeToTitle,
				);
				const inferredPosition = {
					title: rawPositionTitle,
					code: generatedPositionCode,
					description: `Inferred from employees.csv Position column.`,
					departmentCode,
				};
				positions.push(inferredPosition as any);
				positionsByTitle.set(normalizeSemanticName(rawPositionTitle), inferredPosition as any);
				positionCodes.add(generatedPositionCode);
				positionCodeToTitle.set(generatedPositionCode, normalizeSemanticName(rawPositionTitle));
				positionCode = generatedPositionCode;
				matchedPosition = inferredPosition as any;
				summary.createdPositions += 1;
				summary.warnings.push(
					`employees[${index}] inferred position "${rawPositionTitle}" as code "${generatedPositionCode}".`,
				);
			}
		} else if (positionCode) {
			matchedPosition = positions.find((position) => String(position.code || "").trim() === positionCode) as
				| ((typeof positions)[number] & Record<string, any>)
				| undefined;
		}

		const rawBasicSalary = row.basicSalary;
		let basicSalary: number | undefined;
		if (rawBasicSalary !== undefined) {
			if (typeof rawBasicSalary !== "number" || !Number.isFinite(rawBasicSalary)) {
				summary.errors.push(
					`employees[${index}] (${employeeId || "unknown employee"}) has invalid basicSalary "${String(rawBasicSalary)}". Expected a positive number.`,
				);
			} else if (rawBasicSalary <= 0) {
				summary.errors.push(
					`employees[${index}] (${employeeId || "unknown employee"}) has non-positive basicSalary ${rawBasicSalary}. Salary must be greater than 0.`,
				);
			} else {
				basicSalary = rawBasicSalary;
			}
		} else if (matchedPosition && typeof matchedPosition.minSalary === "number") {
			if (!Number.isFinite(matchedPosition.minSalary) || matchedPosition.minSalary <= 0) {
				summary.errors.push(
					`employees[${index}] (${employeeId || "unknown employee"}) matched position "${String(matchedPosition.code || rawPositionTitle || positionCode || "unknown")}" but position.minSalary is missing or invalid.`,
				);
			} else {
				basicSalary = matchedPosition.minSalary;
				summary.derivedBasicSalaries += 1;
				summary.warnings.push(
					`employees[${index}] (${employeeId || "unknown employee"}) derived basicSalary=${matchedPosition.minSalary} from position.minSalary for "${String(matchedPosition.code || rawPositionTitle || positionCode || "unknown")}".`,
				);
			}
		} else {
			const missingReason =
				positionCode || rawPositionTitle
					? `position "${String(positionCode || rawPositionTitle)}" has no trusted minSalary fallback`
					: "position could not be resolved for salary fallback";
			summary.errors.push(
				`employees[${index}] (${employeeId || "unknown employee"}) is missing basicSalary and ${missingReason}.`,
			);
		}

		const normalizedEmployee = {
			...row,
			...(employeeId ? { employeeId } : {}),
			role,
			...(departmentCode ? { departmentCode } : {}),
			...(resolvedDepartmentName ? { departmentName: resolvedDepartmentName } : {}),
			...(positionCode ? { positionCode } : {}),
			...(rawPositionTitle ? { positionTitle: rawPositionTitle } : {}),
			...(basicSalary !== undefined ? { basicSalary } : {}),
			...(row.employmentStatus
				? {}
				: row["Employment Status"]
					? { employmentStatus: String(row["Employment Status"]).trim().toUpperCase() }
					: {}),
		};

		if (
			row["Employee No."] ||
			row.Section ||
			row.Position ||
			!String(row.role || "").trim() ||
			(rawBasicSalary === undefined && basicSalary !== undefined)
		) {
			summary.normalizedEmployeeRows += 1;
		}

		return normalizedEmployee;
	});

	base.departments = departments as any;
	base.positions = positions as any;
	base.employees = normalizedEmployees as any;

	return summary;
};

const attachRowProvenance = (params: {
	parsedData: EnterpriseMigrationData;
	rawData: EnterpriseMigrationData;
}) => {
	const { parsedData, rawData } = params;
	for (const [datasetKey, parsedValue] of Object.entries(parsedData as Record<string, any>)) {
		const rawValue = (rawData as Record<string, any>)[datasetKey];
		if (!Array.isArray(parsedValue) || !Array.isArray(rawValue)) continue;
		for (let index = 0; index < parsedValue.length; index += 1) {
			const parsedRow = parsedValue[index];
			const rawRow = rawValue[index];
			if (!parsedRow || !rawRow?._csvSource) continue;
			(parsedRow as Record<string, any>)._csvSource = rawRow._csvSource;
		}
	}
};

export const loadEnterpriseMigrationDataFromCsvDir = (csvDir: string): LoadedEnterpriseCsvData => {
	const base = EnterpriseMigrationDataSchema.parse({});
	if (!fs.existsSync(csvDir)) {
		throw new Error(`CSV directory not found: ${csvDir}`);
	}

	const loadedFiles: LoadedEnterpriseCsvData["loadedFiles"] = [];
	const inferredStages = new Set<EnterpriseMigrationStage>(["PRE_MIGRATION_CONTROLS"]);
	const csvFiles = fs
		.readdirSync(csvDir)
		.filter((file) => file.toLowerCase().endsWith(".csv"))
		.sort((left, right) => left.localeCompare(right));

	for (const fileName of csvFiles) {
		const normalized = normalizeFilename(fileName);
		const datasetKey = ENTERPRISE_CSV_FILENAME_MAP[normalized];
		if (!datasetKey) continue;

		const filePath = path.join(csvDir, fileName);
		const rows = parseCsvRows({
			filePath,
			fileName,
			datasetKey,
		});
		if (datasetKey === "organization" || datasetKey === "payrollCycleConfig") {
			(base as any)[datasetKey] = rows[0] || undefined;
		} else {
			(base as any)[datasetKey] = rows;
		}

		loadedFiles.push({
			fileName,
			datasetKey,
			rowCount: rows.length,
		});

		const stage = ENTERPRISE_DATASET_STAGE_MAP[datasetKey];
		if (stage) inferredStages.add(stage);
	}

	if (loadedFiles.length === 0) {
		throw new Error(`No recognized enterprise migration CSV files were found in ${csvDir}.`);
	}

	if (inferredStages.size > 1) {
		inferredStages.add("POST_MIGRATION_RECONCILIATION");
	}

	const normalizationSummary = normalizeEmployeeDataset(base as EnterpriseMigrationData);
	if (normalizationSummary.errors.length > 0) {
		throw new Error(
			`Enterprise CSV normalization failed:\n- ${normalizationSummary.errors.join("\n- ")}`,
		);
	}

	const parsedData = EnterpriseMigrationDataSchema.parse(base);
	attachRowProvenance({
		parsedData,
		rawData: base as EnterpriseMigrationData,
	});

	return {
		data: parsedData,
		loadedFiles,
		inferredStages: Array.from(inferredStages),
		normalizationSummary,
	};
};
