import type { EnterpriseMigrationData, EnterpriseMigrationStage } from "../../zod/migration.zod";
import {
	ENTERPRISE_DATASET_STAGE_MAP,
	ENTERPRISE_CSV_FILENAME_MAP,
} from "./enterprise-csv-loader";
import {
	DM_REPORT_DEFINITIONS,
	type DmReportRowDefinition,
} from "./migration-dm-report";

type DatasetKey = keyof EnterpriseMigrationData;

export type MigrationDmQualityGate =
	| "mapping-coverage"
	| "schema-validation"
	| "dry-run"
	| "idempotency"
	| "referential-integrity"
	| "count-reconciliation"
	| "timing-capture"
	| "go-no-go-reporting"
	| "source-truth-split"
	| "effective-timesheet-line-totals"
	| "approved-ot-from-timesheetline"
	| "paid-payroll-snapshot-boundary"
	| "correction-immutability"
	| "historical-ledger-preservation";

export interface MigrationDmMasterlistEntry {
	dmCode: string;
	dmGroup: string;
	businessGroup: string;
	businessName: string;
	sourceFile: string;
	sourceType: "dataset" | "stage";
	datasetKey?: DatasetKey;
	stage: EnterpriseMigrationStage;
	targetModels: string[];
	keyFields: string[];
	dependencies: string[];
	qualityGates: MigrationDmQualityGate[];
}

interface DatasetMasterlistMetadata {
	businessName: string;
	targetModels: string[];
	keyFields: string[];
	dependencies?: string[];
	qualityGates?: MigrationDmQualityGate[];
}

const BASE_QUALITY_GATES: MigrationDmQualityGate[] = [
	"mapping-coverage",
	"schema-validation",
	"dry-run",
	"idempotency",
	"count-reconciliation",
	"timing-capture",
	"go-no-go-reporting",
];

const RELATIONAL_QUALITY_GATES: MigrationDmQualityGate[] = ["referential-integrity"];

export const TIMESHEET_MIGRATION_QUALITY_GATES: MigrationDmQualityGate[] = [
	"source-truth-split",
	"effective-timesheet-line-totals",
	"approved-ot-from-timesheetline",
	"paid-payroll-snapshot-boundary",
	"correction-immutability",
	"historical-ledger-preservation",
];

export const DM_GROUP_BUSINESS_NAMES: Record<string, string> = {
	DM0: "Foundation master",
	DM1: "Core configuration",
	DM2: "Work pattern master",
	DM3: "Organization structure",
	DM4: "Identity and employment",
	DM5: "Employee attachments and openings",
	DM6: "Historical operational ledger",
	DM7: "Post-migration reconciliation",
};

const DATASET_MASTERLIST_METADATA: Record<DatasetKey, DatasetMasterlistMetadata> = {
	organization: {
		businessName: "Company profile",
		targetModels: ["Organization"],
		keyFields: ["code"],
	},
	agencies: {
		businessName: "Agencies",
		targetModels: ["Agency"],
		keyFields: ["code"],
		dependencies: ["organization"],
	},
	calendarItems: {
		businessName: "Holidays and calendar items",
		targetModels: ["CalendarItem"],
		keyFields: ["code", "startDate"],
		dependencies: ["organization"],
	},
	calculators: {
		businessName: "Payroll calculators",
		targetModels: ["Calculator"],
		keyFields: ["code", "name"],
		dependencies: ["organization"],
	},
	payrollCycleConfig: {
		businessName: "Payroll rules and cycle",
		targetModels: ["PayrollCycleConfig"],
		keyFields: ["organizationId"],
		dependencies: ["organization"],
	},
	payrollPeriods: {
		businessName: "Payroll periods",
		targetModels: ["PayrollPeriod"],
		keyFields: ["code", "startDate", "endDate"],
		dependencies: ["organization", "payrollCycleConfig", "calculators"],
	},
	leavePolicies: {
		businessName: "Leave policies",
		targetModels: ["LeaveType", "Organization.branding"],
		keyFields: ["leaveType"],
		dependencies: ["organization"],
	},
	timesheetConfigs: {
		businessName: "Timesheet rules",
		targetModels: ["TimesheetConfig"],
		keyFields: ["organizationId"],
		dependencies: ["organization"],
		qualityGates: ["source-truth-split"],
	},
	workflowConfigs: {
		businessName: "Workflow templates",
		targetModels: ["WorkflowConfig", "Organization.branding"],
		keyFields: ["code"],
		dependencies: ["organization"],
	},
	documentTypes: {
		businessName: "201 document types",
		targetModels: ["DocumentType"],
		keyFields: ["code"],
		dependencies: ["organization"],
	},
	benefitTypes: {
		businessName: "Benefit types",
		targetModels: ["BenefitType"],
		keyFields: ["name"],
		dependencies: ["organization"],
	},
	loanTypes: {
		businessName: "Loan types",
		targetModels: ["LoanType"],
		keyFields: ["name"],
		dependencies: ["organization"],
	},
	shiftTypes: {
		businessName: "Shift types",
		targetModels: ["ShiftType"],
		keyFields: ["code"],
		dependencies: ["organization"],
	},
	scheduleTemplates: {
		businessName: "Schedule templates",
		targetModels: ["ScheduleTemplate"],
		keyFields: ["code"],
		dependencies: ["organization", "shiftTypes"],
	},
	departments: {
		businessName: "Departments and sections",
		targetModels: ["Department"],
		keyFields: ["code"],
		dependencies: ["organization"],
	},
	levels: {
		businessName: "Levels",
		targetModels: ["Level"],
		keyFields: ["name"],
		dependencies: ["organization"],
	},
	positions: {
		businessName: "Positions",
		targetModels: ["Position"],
		keyFields: ["code"],
		dependencies: ["organization", "departments"],
	},
	positionLevels: {
		businessName: "Position-level mappings",
		targetModels: ["PositionLevel"],
		keyFields: ["positionCode", "levelName"],
		dependencies: ["positions", "levels"],
	},
	departmentScheduleLinks: {
		businessName: "Department schedule links",
		targetModels: ["DepartmentScheduleTemplate"],
		keyFields: ["departmentCode", "scheduleTemplateCode"],
		dependencies: ["departments", "scheduleTemplates"],
	},
	persons: {
		businessName: "Person identity master",
		targetModels: ["Person"],
		keyFields: ["sourcePersonKey", "employeeId", "userId"],
		dependencies: ["organization"],
	},
	employees: {
		businessName: "Employees",
		targetModels: ["Employee", "User"],
		keyFields: ["employeeId"],
		dependencies: ["persons", "departments", "positions", "levels", "agencies"],
	},
	reportingLines: {
		businessName: "Reporting lines",
		targetModels: ["Employee.reportToId"],
		keyFields: ["employeeId", "reportToEmployeeId"],
		dependencies: ["employees"],
	},
	departmentManagers: {
		businessName: "Department managers",
		targetModels: ["Department.managerId"],
		keyFields: ["departmentCode", "managerEmployeeId"],
		dependencies: ["departments", "employees"],
	},
	scheduleOverrides: {
		businessName: "Schedule overrides",
		targetModels: ["ScheduleOverride"],
		keyFields: ["employeeId", "date"],
		dependencies: ["employees", "shiftTypes"],
	},
	employeeScheduleHistories: {
		businessName: "Employee schedule assignments",
		targetModels: ["EmployeeScheduleHistory"],
		keyFields: ["employeeId", "action", "effectiveAt"],
		dependencies: ["employees", "scheduleTemplates", "shiftTypes"],
	},
	terminations: {
		businessName: "Terminations",
		targetModels: ["Termination"],
		keyFields: ["terminationNumber"],
		dependencies: ["employees"],
	},
	documentFolders: {
		businessName: "Employee document folders",
		targetModels: ["DocumentFolder"],
		keyFields: ["employeeId", "name"],
		dependencies: ["employees"],
	},
	documents: {
		businessName: "Employee documents and 201 files",
		targetModels: ["Document"],
		keyFields: ["employeeId", "number", "documentTypeCode"],
		dependencies: ["employees", "documentTypes", "documentFolders"],
	},
	leaveBalances: {
		businessName: "Opening leave balances",
		targetModels: ["EmployeeLeaveBalance"],
		keyFields: ["employeeId", "leaveType", "asOfDate"],
		dependencies: ["employees", "leavePolicies"],
	},
	employeeBenefits: {
		businessName: "Employee benefits",
		targetModels: ["EmployeeBenefit"],
		keyFields: ["employeeId", "benefitTypeName", "startDate"],
		dependencies: ["employees", "benefitTypes"],
	},
	employeeBenefitInstallments: {
		businessName: "Employee benefit installments",
		targetModels: ["EmployeeBenefitInstallment"],
		keyFields: ["sourceBenefitKey", "installmentNumber"],
		dependencies: ["employeeBenefits"],
	},
	employeeLoans: {
		businessName: "Employee loans",
		targetModels: ["EmployeeLoan"],
		keyFields: ["sourceLoanKey", "employeeId", "loanTypeName"],
		dependencies: ["employees", "loanTypes"],
	},
	attendances: {
		businessName: "Attendance history",
		targetModels: ["Attendance"],
		keyFields: ["employeeId", "date"],
		dependencies: ["employees", "shiftTypes", "scheduleTemplates"],
		qualityGates: ["source-truth-split", "historical-ledger-preservation"],
	},
	timesheets: {
		businessName: "Timesheet headers",
		targetModels: ["Timesheet"],
		keyFields: ["employeeId", "payrollPeriodCode", "code"],
		dependencies: ["employees", "payrollPeriods"],
		qualityGates: TIMESHEET_MIGRATION_QUALITY_GATES,
	},
	timesheetLines: {
		businessName: "Effective timesheet lines",
		targetModels: ["Timesheetline"],
		keyFields: ["employeeId", "timesheetCode", "date", "revisionNo"],
		dependencies: ["employees", "payrollPeriods", "timesheets", "attendances"],
		qualityGates: TIMESHEET_MIGRATION_QUALITY_GATES,
	},
	employeePayrolls: {
		businessName: "Payroll history",
		targetModels: ["EmployeePayroll"],
		keyFields: ["employeeId", "payrollPeriodCode"],
		dependencies: ["employees", "payrollPeriods", "timesheets"],
		qualityGates: ["paid-payroll-snapshot-boundary", "historical-ledger-preservation"],
	},
	statementsOfAccount: {
		businessName: "Statements of account",
		targetModels: ["StatementOfAccount", "SOALineItem"],
		keyFields: ["soaNumber"],
		dependencies: ["payrollPeriods"],
	},
	soaRemittances: {
		businessName: "SOA remittances",
		targetModels: ["SOARemittance"],
		keyFields: ["soaNumber", "referenceNumber", "paymentDate"],
		dependencies: ["statementsOfAccount"],
	},
	workflowInstances: {
		businessName: "Workflow instances",
		targetModels: ["WorkflowInstance"],
		keyFields: ["code", "sourceWorkflowKey"],
		dependencies: ["workflowConfigs"],
	},
	requests: {
		businessName: "Requests and approval history",
		targetModels: ["Request"],
		keyFields: ["code", "sourceRequestKey"],
		dependencies: ["employees", "workflowInstances"],
	},
	workflowStepExecutions: {
		businessName: "Workflow step executions",
		targetModels: ["WorkflowStepExecution"],
		keyFields: ["workflowCode", "requestCode", "stepNumber"],
		dependencies: ["workflowInstances", "requests", "employees"],
	},
	requestTransactions: {
		businessName: "Request transactions",
		targetModels: ["RequestTransaction"],
		keyFields: ["requestCode", "sequenceNumber"],
		dependencies: ["requests", "workflowStepExecutions", "employees"],
	},
};

const unique = <T>(values: T[]) => Array.from(new Set(values));

const getSourceFile = (definition: DmReportRowDefinition) =>
	definition.sourceType === "dataset" ? definition.fileName : "reconciliation";

const resolveStage = (definition: DmReportRowDefinition): EnterpriseMigrationStage => {
	if (definition.sourceType === "stage") return definition.stage;
	const stage = ENTERPRISE_DATASET_STAGE_MAP[definition.datasetKey];
	if (!stage) {
		throw new Error(`DM ${definition.dmCode} has no enterprise migration stage.`);
	}
	return stage;
};

const buildQualityGates = (metadata: DatasetMasterlistMetadata) =>
	unique([
		...BASE_QUALITY_GATES,
		...(metadata.dependencies?.length ? RELATIONAL_QUALITY_GATES : []),
		...(metadata.qualityGates || []),
	]);

export const buildMigrationDmMasterlistRows = (): MigrationDmMasterlistEntry[] =>
	DM_REPORT_DEFINITIONS.map((definition) => {
		if (definition.sourceType === "stage") {
			return {
				dmCode: definition.dmCode,
				dmGroup: definition.sheetName,
				businessGroup: DM_GROUP_BUSINESS_NAMES[definition.sheetName] || definition.sheetName,
				businessName: "Reconciliation and sign-off",
				sourceFile: getSourceFile(definition),
				sourceType: definition.sourceType,
				stage: definition.stage,
				targetModels: ["PostMigrationReconciliation"],
				keyFields: ["goNoGo", "reasons"],
				dependencies: Object.values(ENTERPRISE_CSV_FILENAME_MAP),
				qualityGates: unique([
					...BASE_QUALITY_GATES,
					"referential-integrity",
					"source-truth-split",
					"historical-ledger-preservation",
				]),
			};
		}

		const metadata = DATASET_MASTERLIST_METADATA[definition.datasetKey];
		if (!metadata) {
			throw new Error(`DM ${definition.dmCode} has no masterlist metadata.`);
		}

		return {
			dmCode: definition.dmCode,
			dmGroup: definition.sheetName,
			businessGroup: DM_GROUP_BUSINESS_NAMES[definition.sheetName] || definition.sheetName,
			businessName: metadata.businessName,
			sourceFile: getSourceFile(definition),
			sourceType: definition.sourceType,
			datasetKey: definition.datasetKey,
			stage: resolveStage(definition),
			targetModels: metadata.targetModels,
			keyFields: metadata.keyFields,
			dependencies: metadata.dependencies || [],
			qualityGates: buildQualityGates(metadata),
		};
	});

export const MIGRATION_DM_MASTERLIST = buildMigrationDmMasterlistRows();

export const getTimesheetMigrationQualityEntries = () =>
	MIGRATION_DM_MASTERLIST.filter((entry) =>
		["timesheets", "timesheetLines", "employeePayrolls"].includes(String(entry.datasetKey || "")),
	);
