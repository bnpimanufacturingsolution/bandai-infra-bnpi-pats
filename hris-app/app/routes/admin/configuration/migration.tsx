import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import {
	AlertCircle,
	ArrowLeft,
	BadgeCheck,
	Briefcase,
	Building2,
	CalendarDays,
	ClipboardList,
	ChevronDown,
	Clock3,
	Download,
	ExternalLink,
	FileText,
	FileSpreadsheet,
	Gift,
	Layers3,
	Loader2,
	MapPinned,
	Plus,
	PlayCircle,
	Route,
	Upload,
	Users,
	X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { GenericImportModal } from "~/components/organisms/shared/GenericImportModal";
import { EmployeeImportModal } from "~/components/organisms/employee/EmployeeImportModal";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { useAuth } from "~/lib/hooks/use-auth";
import { useAgencies, useImportAgencies } from "~/lib/hooks/useAgencies";
import { useAttendances } from "~/lib/hooks/useAttendances";
import { useCalendarItems, useImportCalendarItems } from "~/lib/hooks/use-calendar-items";
import { useBenefitTypes, useImportBenefitTypes } from "~/lib/hooks/useBenefitTypes";
import { useDepartments, useImportDepartments } from "~/lib/hooks/useDepartments";
import { useDocumentTypes } from "~/lib/hooks/useDocumentTypes";
import {
	useEmployees,
	useExtractMigrationSources,
	useImportEmployees,
} from "~/lib/hooks/useEmployees";
import { useImportLeaveTypes, useLeaveTypes } from "~/lib/hooks/useLeaveTypes";
import { useImportLevels, useLevels } from "~/lib/hooks/useLevels";
import { useImportLoanTypes, useLoanTypes } from "~/lib/hooks/useLoanTypes";
import { useImportPositions, usePositions } from "~/lib/hooks/usePositions";
import { useImportSections, useSections } from "~/lib/hooks/useSections";
import { useImportShiftTypes, useShiftTypes } from "~/lib/hooks/useSchedules";
import { useTimesheets } from "~/lib/hooks/useTimesheets";
import { hrisApiClient } from "~/lib/api-client";
import { HR_MODAL_STANDARD_CLASS } from "~/lib/ui/admin-configuration-modal";
import {
	buildCloseWorkbookSearchParams,
	buildCloseWorkbookUploadSearchParams,
	buildOpenWorkbookSearchParams,
	buildOpenWorkbookUploadSearchParams,
	buildWorkbookImportProgressFromRun,
	formatWorkbookImportProgressDescription,
	formatWorkbookImportProgressTitle,
	getWorkbookImportProgressToastId,
	isMigrationRunStatusSuccess,
	isMigrationRunStatusTerminal,
	isWorkbookUploadOpen,
} from "~/lib/admin-migration-ui";

export type ImportAction =
	| "import-departments"
	| "import-sections"
	| "import-positions"
	| "import-levels"
	| "import-shift-types"
	| "import-agencies"
	| "import-holidays"
	| "import-leave-types"
	| "import-benefit-types"
	| "import-loan-types"
	| "import-employees";

export const ADMIN_MIGRATION_IMPORT_ACTION_SEQUENCE: ImportAction[] = [
	"import-departments",
	"import-sections",
	"import-positions",
	"import-levels",
	"import-shift-types",
	"import-agencies",
	"import-holidays",
	"import-leave-types",
	"import-benefit-types",
	"import-loan-types",
	"import-employees",
];

export const ADMIN_MIGRATION_MODAL_TITLES: Record<ImportAction, string> = {
	"import-departments": "Import Departments",
	"import-sections": "Import Sections",
	"import-positions": "Import Positions",
	"import-levels": "Import Levels",
	"import-shift-types": "Import Shift Types",
	"import-agencies": "Import Agencies",
	"import-holidays": "Import Holidays",
	"import-leave-types": "Import Leave Types",
	"import-benefit-types": "Import Benefit Types",
	"import-loan-types": "Import Loan Types",
	"import-employees": "Import Employees",
};

type ImportStep = {
	id: string;
	label: string;
	fileName: string;
	sheetName?: string;
	expectedHeaders?: string[];
	target: string;
	countLabelSingular: string;
	countLabelPlural: string;
	count: number;
	isLoading?: boolean;
	action?: ImportAction;
	icon: ComponentType<{ className?: string }>;
	optional?: boolean;
	unavailable?: boolean;
};

type ImportWorkbookGroup = {
	id: string;
	title: string;
	fileName: string;
	steps: ImportStep[];
	generatedSteps?: ImportStep[];
};

type MigrationSourceSheetMapping = {
	step?: string;
	sheet?: string;
	rowCount?: number;
};

type MigrationSourceInput = {
	id: string;
	parentId?: string;
	dmPhase: string;
	displayName: string;
	sourceRef: string;
	description?: string;
	sheetMappings: MigrationSourceSheetMapping[];
	rowCount?: number;
	checksum?: string;
	confidential?: boolean;
	status: "available" | "missing" | "not_configured" | "not_downloadable" | string;
	available: boolean;
	downloadable: boolean;
	childCount?: number;
	fileName?: string;
	downloadUrl?: string | null;
};

type MigrationSourceInputsResponse = {
	items: MigrationSourceInput[];
	manifest: string;
};

type WorkbookSheetStatus =
	| "Pending"
	| "Checking"
	| "Importing"
	| "Finalizing"
	| "Imported"
	| "Skipped"
	| "Failed"
	| "Blocked"
	| "Needs recovery";

const WORKBOOK_LIFECYCLE = {
	IDLE: "idle",
	OPEN: "open",
	CHECKING: "checking",
	UPLOADING: "uploading",
	POLLING: "polling",
	FINALIZING: "finalizing",
	COMPLETED: "completed",
	FAILED: "failed",
	BLOCKED: "blocked",
	STALE: "stale",
} as const;

type WorkbookLifecycleState = (typeof WORKBOOK_LIFECYCLE)[keyof typeof WORKBOOK_LIFECYCLE];

type WorkbookSheetProgress = {
	status: WorkbookSheetStatus;
	rowCount?: number;
	processed?: number;
	created?: number;
	updated?: number;
	skipped?: number;
	blocked?: number;
	failed?: number;
	message?: string;
};

type WorkbookProgressState = Record<string, Record<string, WorkbookSheetProgress>>;
type SelectedWorkbookFiles = Record<string, File | null>;

type MigrationReportError = {
	sheetName: string;
	row?: number | null;
	field?: string | null;
	status: "blocked" | "skipped" | "failed";
	message: string;
};

type MigrationReportSheet = {
	sheetName: string;
	target: string;
	status: WorkbookSheetStatus;
	jobId?: string;
	totalRows: number;
	created: number;
	updated: number;
	skipped: number;
	blocked: number;
	failed: number;
	elapsedMs: number;
	firstError?: string;
	errors: MigrationReportError[];
};

type MigrationImportReport = {
	runId: string;
	workbookId: string;
	workbookName: string;
	sourceFilename: string;
	actorUserId?: string;
	organizationId?: string;
	startedAt: string;
	finishedAt?: string;
	elapsedMs?: number;
	status: "running" | "completed" | "failed" | "blocked";
	sheets: MigrationReportSheet[];
	events?: MigrationLiveEvent[];
};

type MigrationAuditReportsResponse = {
	reports: MigrationImportReport[];
	byWorkbook: Record<string, MigrationImportReport>;
};

type Dm4TimesheetMaterialization = {
	periodCodes?: string[];
	scanned?: number;
	materializedMissingLines?: number;
	skippedNoChange?: number;
	skippedNoWorkSchedule?: number;
	skippedPaid?: number;
	obligationsLinked?: number;
	timesheetsRecalculated?: number;
	statusCounts?: Record<string, number>;
};

type Dm4ProofReport = {
	sourceTag?: string;
	sourceMode?: string;
	sourceWorkbookFiles?: string[];
	sourceWorkbookCount?: number;
	defaultSchedule?: {
		code?: string;
		timeIn?: string;
		timeBreak?: string;
		timeOut?: string;
		regularHours?: number;
	};
	phase1Selection?: {
		sourceRowsScanned?: number;
		sourceFilesScanned?: number;
		sourceFilesPreview?: string[];
		dbEmployeesMatched?: number;
		sourceDepartmentCounts?: Record<string, number>;
		matchedDepartmentCounts?: Record<string, number>;
		departmentsSelected?: string[];
		weekendPresentCandidates?: number;
		meetsThreshold?: boolean;
		selectedRowsTotal?: number;
		selectedRows?: Array<{
			sourceWorkbookPath?: string;
			sourceSheet?: string;
			sourceRow?: number;
			date?: string;
			employeeId?: string;
			sourceEmployeeName?: string;
			dbEmployeeName?: string;
			sourceDepartment?: string;
		}>;
	};
	phase2Application?: {
		appliedTotal?: number;
		touchedTimesheetCount?: number;
		applied?: Array<{
			employeeId?: string;
			date?: string;
			attendanceId?: string;
			timesheetlineId?: string;
			payrollPeriodCode?: string;
		}>;
		embeddedMutation?: Array<{ employeeId?: string; changed?: boolean }>;
		writeCounts?: {
			attendanceCreated?: number;
			attendanceUpdated?: number;
			timesheetlineCreated?: number;
			timesheetlineUpdated?: number;
			attendanceObligationCreated?: number;
			attendanceObligationUpdated?: number;
			attendanceObligationSkippedPaid?: number;
		};
	} | null;
	phase2Materialization?: {
		mode?: string;
		queryShape?: string;
		presentRows?: Dm4ProofReport["phase2Application"];
		timesheetDays?: Dm4TimesheetMaterialization;
		payrollPeriodCodes?: string[];
		materializedMissingLines?: number;
		obligationsLinked?: number;
		timesheetsRecalculated?: number;
		statusCounts?: Record<string, number>;
	} | null;
	timesheetMaterialization?: Dm4TimesheetMaterialization;
	approvedOvertimeRepair?: {
		mode?: string;
		sourceRowsParsed?: number;
		effectiveLinesChecked?: number;
		plannedLineUpdates?: number;
		touchedTimesheets?: number;
		missingSourceRows?: number;
		skipped?: boolean;
		reason?: string;
		verification?: {
			plannedLineUpdates?: number;
			sourceRowsParsed?: number;
			effectiveLinesChecked?: number;
			touchedTimesheets?: number;
			missingSourceRows?: number;
		};
	};
	phase3DbProof?: {
		expectedRowsAfterApply?: number;
		attendanceRowsFound?: number;
		timesheetlineRowsFound?: number;
	};
	guardrails?: {
		dm4EmbeddedScheduleMutationCount?: number;
		dm4EmbeddedScheduleMutations?: Array<{ employeeId?: string; changed?: boolean }>;
		timesheetMaterialization?: string;
	};
};

type Dm4ProofRunState = {
	status: "idle" | "running" | "success" | "error";
	startedAt: number | null;
	elapsedSeconds: number;
	message: string;
	error?: string;
	sourceMode?: string;
	sourceCount?: number;
	sourceWorkbookCount?: number;
	phase?: string;
	progressPercent?: number;
	materializedMissingLines?: number;
};

function getDm4ProofRunSheetStatus(status: Dm4ProofRunState["status"]): WorkbookSheetStatus {
	if (status === "running") return "Importing";
	if (status === "success") return "Imported";
	if (status === "error") return "Failed";
	return "Pending";
}

type Dm4SourceWorkbooksResponse = {
	sourceFiles?: string[];
	sourceWorkbookFiles?: string[];
	sourceWorkbookCount?: number;
};

type Dm4RunSnapshot = {
	id: string;
	status: "queued" | "running" | "completed" | "failed";
	startedAt: string;
	finishedAt?: string;
	message: string;
	sourceMode: string;
	sourceFiles?: string[];
	sourceWorkbookFiles?: string[];
	sourceWorkbookCount?: number;
	sourceConfig?: string;
	proof?: Dm4ProofReport;
	timesheetMaterialization?: Dm4TimesheetMaterialization;
	phase?: string;
	progress?: {
		phase?: string;
		percent?: number;
		elapsedSeconds?: number;
		sourceWorkbookCount?: number;
		attendanceRowsFound?: number;
		timesheetlineRowsFound?: number;
		materializedMissingLines?: number;
	};
	stderr?: string;
	error?: string;
};

type MigrationRunProgressResponse = {
	progress?: {
		runId?: string;
		status?: string;
		startedAt?: string;
		finishedAt?: string;
		durationMs?: number;
		currentStepLabel?: string | null;
		parentProgress?: { completedSteps?: number; totalSteps?: number };
		steps?: Array<{
			code?: string;
			label?: string;
			status?: string;
			created?: number;
			updated?: number;
			failed?: number;
			counts?: Record<string, any>;
			blockerReason?: string | null;
		}>;
		latestEvent?: { message?: string; createdAt?: string };
		recentEvents?: Array<{
			type?: string;
			status?: string;
			stepCode?: string | null;
			message?: string;
			counts?: Record<string, any>;
			metadata?: Record<string, any>;
			createdAt?: string;
		}>;
		summary?: Record<string, any>;
		proof?: Dm4ProofReport;
	};
};

type MigrationLiveEvent = {
	id: string;
	at: string;
	sheetName?: string;
	status: WorkbookSheetStatus | MigrationImportReport["status"];
	message: string;
	rowCount?: number;
	eventType?: string;
	stepCode?: string | null;
	sourceRow?: number | null;
	employeeId?: string | null;
	employeeName?: string | null;
	metadata?: Record<string, any>;
};

const DM3_RUN_TERMINAL_STATUSES = [
	"COMPLETED",
	"COMPLETED_WITH_WARNINGS",
	"FAILED",
	"BLOCKED",
	"STALE",
];

const DM3_GENERATED_SHEET_NAMES = new Set([
	normalizeSheetName("Attendance Obligations"),
	normalizeSheetName("Draft Timesheet Headers"),
	normalizeSheetName("Employee Post Actions"),
	normalizeSheetName("Verify HRIS Surfaces"),
]);

type ExtractedSheet = {
	sheetName: string;
	rowCount: number;
	headers?: string[];
	rows?: Record<string, any>[];
	previewRows?: Record<string, any>[];
	sampleRows?: Record<string, any>[];
};

const IMPORT_FIELDS_DEPARTMENTS = {
	required: [
		{ key: "CODE", label: "Department Code", required: true, aliases: ["Department Code"] },
		{ key: "NAME", label: "Department Name", required: true, aliases: ["Department"] },
	],
	optional: [
		{ key: "DESCRIPTION", label: "Description", aliases: ["Notes"] },
		{ key: "SCHEDULE", label: "Schedule", aliases: ["Schedule Code", "Schedule Name"] },
		{ key: "IS_HR", label: "HR Department", aliases: ["HR Department", "Is HR"] },
	],
	system: [],
};

const IMPORT_FIELDS_SECTIONS = {
	required: [
		{ key: "CODE", label: "Section Code", required: true, aliases: ["Section Code"] },
		{ key: "NAME", label: "Section Name", required: true, aliases: ["Section"] },
		{
			key: "DEPARTMENT",
			label: "Department",
			required: true,
			aliases: ["Department Code", "Department Name"],
		},
	],
	optional: [
		{ key: "DESCRIPTION", label: "Description", aliases: ["Notes"] },
		{ key: "IS_ACTIVE", label: "Active", aliases: ["Active", "Status"] },
		{ key: "IS_HR", label: "HR Section", aliases: ["HR Section", "Is HR"] },
	],
	system: [],
};

const IMPORT_FIELDS_POSITIONS = {
	required: [
		{ key: "CODE", label: "Position Code", required: true, aliases: ["Position Code"] },
		{ key: "TITLE", label: "Position Title", required: true, aliases: ["Position", "Name"] },
	],
	optional: [
		{ key: "DESCRIPTION", label: "Description", aliases: ["Notes"] },
		{ key: "DEPARTMENT_CODE", label: "Department Code", aliases: ["Department"] },
		{ key: "SECTION_CODE", label: "Section Code", aliases: ["Section"] },
		{ key: "MIN_SALARY", label: "Minimum Salary", aliases: ["Min Salary"] },
		{ key: "MAX_SALARY", label: "Maximum Salary", aliases: ["Max Salary"] },
		{ key: "LEVELS", label: "Levels", aliases: ["Position Levels"] },
	],
	system: [],
};

const IMPORT_FIELDS_LEVELS = {
	required: [{ key: "NAME", label: "Level Name", required: true, aliases: ["Name"] }],
	optional: [
		{ key: "RANK", label: "Rank", aliases: ["Order"] },
		{ key: "DESCRIPTION", label: "Description", aliases: ["Notes"] },
		{
			key: "IS_MANAGER",
			label: "Manager Level",
			aliases: ["isManager", "Is Manager", "Manager Flag"],
		},
	],
	system: [],
};

const IMPORT_FIELDS_SHIFT_TYPES = {
	required: [{ key: "CODE", label: "Shift Code", required: true, aliases: ["Shift Code"] }],
	optional: [
		{ key: "NAME", label: "Shift Name", aliases: ["Shift Name"] },
		{ key: "SHIFT_HRS", label: "Shift Hours", aliases: ["Shift Hours"] },
		{ key: "TIME_SLOTS", label: "Time Slots", aliases: ["Slots", "Pattern"] },
		{ key: "IS_OVERNIGHT", label: "Overnight", aliases: ["Overnight"] },
		{ key: "IS_OFF", label: "Off Day", aliases: ["Off Day", "Is Off"] },
		{ key: "IS_ACTIVE", label: "Active", aliases: ["Active", "Status"] },
	],
	system: [],
};

const IMPORT_FIELDS_HOLIDAYS = {
	required: [
		{ key: "TITLE", label: "Holiday Name", required: true, aliases: ["Description"] },
		{ key: "START_DATE", label: "Start Date", required: true, aliases: ["Date"] },
	],
	optional: [
		{ key: "END_DATE", label: "End Date" },
		{ key: "HOLIDAY_TYPE", label: "Holiday Type", aliases: ["Type"] },
		{ key: "STATUS", label: "Status" },
		{ key: "DESCRIPTION", label: "Description", aliases: ["Notes"] },
	],
	system: [],
};

const IMPORT_FIELDS_LEAVE_TYPES = {
	required: [
		{ key: "CODE", label: "Leave Type Code", required: true, aliases: ["LeaveCode"] },
		{ key: "NAME", label: "Leave Type Name", required: true, aliases: ["LeaveType"] },
	],
	optional: [
		{ key: "DESCRIPTION", label: "Description", aliases: ["Notes"] },
		{ key: "SORT_ORDER", label: "Sort Order", aliases: ["Order"] },
		{ key: "IS_ACTIVE", label: "Active", aliases: ["Active", "Status"] },
		{ key: "IS_PAID", label: "Paid Leave", aliases: ["Paid"] },
	],
	system: [],
};

const IMPORT_FIELDS_BENEFIT_TYPES = {
	required: [
		{ key: "CODE", label: "Benefit Code", required: true, aliases: ["BenefitCode"] },
		{ key: "NAME", label: "Benefit Name", required: true, aliases: ["Benefit"] },
		{ key: "CATEGORY", label: "Category", required: true },
		{ key: "PAYROLL_DIRECTION", label: "Payroll Direction", required: true },
	],
	optional: [
		{ key: "DESCRIPTION", label: "Description", aliases: ["Notes"] },
		{ key: "IS_TAXABLE", label: "Taxable" },
		{ key: "IS_ACTIVE", label: "Active" },
		{ key: "IS_DEFAULT", label: "Default" },
		{ key: "DEFAULT_INSTALLMENTS", label: "Default Installments" },
		{ key: "PAYROLL_CYCLE_DAYS", label: "Payroll Cycle Days" },
		{ key: "REQUIRE_TERMS_AGREEMENT", label: "Terms Agreement" },
		{ key: "RECONCILIATION_ACTION", label: "Reconciliation Action" },
	],
	system: [],
};

const IMPORT_FIELDS_AGENCIES = {
	required: [
		{ key: "CODE", label: "Agency Code", required: true },
		{ key: "NAME", label: "Agency Name", required: true },
	],
	optional: [
		{ key: "STATUS", label: "Status" },
		{ key: "CONTACT_NAME", label: "Contact Name" },
		{ key: "CONTACT_EMAIL", label: "Contact Email" },
		{ key: "CONTACT_PHONE", label: "Contact Phone" },
	],
	system: [],
};

const IMPORT_FIELDS_LOAN_TYPES = {
	required: [{ key: "NAME", label: "Loan Type Name", required: true }],
	optional: [
		{ key: "CATEGORY", label: "Category" },
		{ key: "DESCRIPTION", label: "Description" },
		{ key: "MIN_AMOUNT", label: "Minimum Amount" },
		{ key: "MAX_AMOUNT", label: "Maximum Amount" },
		{ key: "INTEREST_RATE", label: "Interest Rate" },
		{ key: "MAX_TERM_MONTHS", label: "Max Term Months" },
		{ key: "MIN_SERVICE_MONTHS", label: "Min Service Months" },
		{ key: "IS_ACTIVE", label: "Active" },
	],
	system: [],
};

const IMPORT_FIELDS_DOCUMENT_201_TYPES = {
	required: [
		{ key: "CODE", label: "Document Type Code", required: true },
		{ key: "NAME", label: "Document Type Name", required: true },
	],
	optional: [
		{ key: "CATEGORY", label: "Category" },
		{ key: "UPLOAD_BY", label: "Upload By" },
		{ key: "IS_REQUIRED", label: "Required" },
		{ key: "IS_EMPLOYEE_VISIBLE", label: "Employee Visible" },
		{ key: "IS_ACTIVE", label: "Active" },
		{ key: "DISPLAY_ORDER", label: "Display Order" },
		{ key: "FIELDS_JSON", label: "Fields JSON" },
	],
	system: [],
};

const IMPORT_FIELDS_EMPLOYEES = {
	required: [
		{ key: "EMP_ID", label: "Employee ID", required: true },
		{ key: "NAME", label: "Employee Name", required: true },
		{ key: "POSITION", label: "Position", required: true },
		{ key: "LEVEL", label: "Level", required: true },
		{ key: "DEPARTMENT", label: "Department", required: true },
	],
	optional: [
		{ key: "SECTION", label: "Section" },
		{ key: "TIN", label: "TIN" },
		{ key: "SSS", label: "SSS" },
		{ key: "PHILHEALTH", label: "PhilHealth" },
		{ key: "PAGIBIG", label: "Pag-IBIG" },
		{ key: "BASIC_SALARY", label: "Basic Salary" },
		{ key: "HIRE_DATE", label: "Hire Date" },
		{ key: "START_DATE", label: "Start Date" },
		{ key: "EMAIL", label: "Email" },
		{ key: "PHONE", label: "Phone" },
		{ key: "BIRTHDAY", label: "Birthday" },
		{ key: "GENDER", label: "Gender" },
		{ key: "REPORT_TO_EMP_ID", label: "Reports To" },
		{ key: "SCHEDULE", label: "Schedule" },
		{ key: "ROLE", label: "Role" },
		{ key: "WORKFORCE_SOURCE", label: "Workforce Source" },
		{ key: "AGENCY_CODE", label: "Agency Code" },
		{ key: "SOURCE_WORKBOOK", label: "Source Workbook" },
		{ key: "SOURCE_SHEET", label: "Source Sheet" },
		{ key: "SOURCE_ROW", label: "Source Row" },
	],
	system: [],
};

const IMPORT_FIELDS_EMPLOYEE_SCHEDULES = {
	required: [
		{ key: "EMP_ID", label: "Employee ID", required: true },
		{ key: "SCHEDULE_CODE", label: "Schedule Code", required: true },
		{ key: "EFFECTIVE_FROM", label: "Effective From", required: true },
	],
	optional: [
		{ key: "EFFECTIVE_TO", label: "Effective To" },
		{ key: "NOTES", label: "Notes" },
	],
	system: [],
};

const IMPORT_FIELDS_REPORTING_LINES = {
	required: [
		{ key: "EMP_ID", label: "Employee ID", required: true },
		{ key: "REPORT_TO_EMP_ID", label: "Reports To Employee ID", required: true },
	],
	optional: [
		{ key: "EFFECTIVE_FROM", label: "Effective From" },
		{ key: "NOTES", label: "Notes" },
	],
	system: [],
};

const IMPORT_FIELDS_EMPLOYEE_DOCUMENTS = {
	required: [
		{ key: "EMP_ID", label: "Employee ID", required: true },
		{ key: "DOCUMENT_TYPE_CODE", label: "201 Document Type", required: true },
	],
	optional: [
		{ key: "DOCUMENT_NUMBER", label: "Document Number" },
		{ key: "ISSUE_DATE", label: "Issue Date" },
		{ key: "EXPIRY_DATE", label: "Expiry Date" },
		{ key: "STATUS", label: "Status" },
		{ key: "NOTES", label: "Notes" },
	],
	system: [],
};

const IMPORT_FIELDS_OPENING_LEAVE_BALANCES = {
	required: [
		{ key: "EMP_ID", label: "Employee ID", required: true },
		{ key: "LEAVE_TYPE_CODE", label: "Leave Type", required: true },
		{ key: "BALANCE", label: "Balance", required: true },
	],
	optional: [
		{ key: "AS_OF_DATE", label: "As Of Date" },
		{ key: "NOTES", label: "Notes" },
	],
	system: [],
};

const IMPORT_FIELDS_EMPLOYEE_BENEFITS_LOANS = {
	required: [
		{ key: "EMP_ID", label: "Employee ID", required: true },
		{ key: "TYPE", label: "Type", required: true },
		{ key: "CODE_OR_NAME", label: "Code Or Name", required: true },
	],
	optional: [
		{ key: "AMOUNT", label: "Amount" },
		{ key: "PAYROLL_PERIOD_CODE", label: "Payroll Period" },
		{ key: "START_DATE", label: "Start Date" },
		{ key: "END_DATE", label: "End Date" },
		{ key: "INSTALLMENTS", label: "Installments" },
		{ key: "STATUS", label: "Status" },
		{ key: "NOTES", label: "Notes" },
	],
	system: [],
};

const IMPORT_FIELDS_ATTENDANCE_HISTORY = {
	required: [
		{ key: "EMP_ID", label: "Employee ID", required: true },
		{ key: "DATE", label: "Date", required: true },
	],
	optional: [
		{ key: "SHIFT_CODE", label: "Shift Code" },
		{ key: "TIME_IN", label: "Time In" },
		{ key: "TIME_BREAK", label: "Time Break" },
		{ key: "TIME_OUT", label: "Time Out" },
		{ key: "STATUS", label: "Status" },
		{ key: "LEAVE_TYPE_CODE", label: "Leave Type Code" },
		{ key: "CATEGORY", label: "Category" },
		{ key: "AWOL", label: "AWOL" },
		{ key: "SOURCE_WORKBOOK", label: "Source Workbook" },
		{ key: "SOURCE_SHEET", label: "Source Sheet" },
		{ key: "SOURCE_ROW", label: "Source Row" },
		{ key: "NOTES", label: "Notes" },
	],
	system: [],
};

const IMPORT_FIELDS_TIMESHEETS = {
	required: [
		{ key: "EMP_ID", label: "Employee ID", required: true },
		{ key: "PAYROLL_PERIOD_CODE", label: "Payroll Period", required: true },
		{ key: "DATE", label: "Timesheet Date", required: true },
	],
	optional: [
		{ key: "TIME_IN", label: "Time In" },
		{ key: "TIME_BREAK", label: "Time Break" },
		{ key: "TIME_OUT", label: "Time Out" },
		{ key: "STATUS", label: "Status" },
		{ key: "REGULAR_HOURS", label: "Regular Hours" },
		{ key: "OVERTIME_HOURS", label: "Overtime Hours" },
		{ key: "UNDERTIME_HOURS", label: "Undertime Hours" },
		{ key: "LATE_HOURS", label: "Late Hours" },
		{ key: "EARLY_OUT_HOURS", label: "Early Out Hours" },
		{ key: "BREAK_MINUTES", label: "Break Minutes" },
		{ key: "REVISION_NO", label: "Revision No" },
		{ key: "IS_EFFECTIVE", label: "Effective Line" },
		{ key: "NOTES", label: "Notes" },
	],
	system: [],
};

const EMPTY_TEMPLATE = "";

const WORKBOOK_STATUS_CLASS: Record<WorkbookSheetStatus, string> = {
	Pending: "border-gray-200 bg-gray-50 text-gray-700",
	Checking: "border-gray-300 bg-gray-100 text-gray-700",
	Importing: "border-orange-200 bg-orange-50 text-orange-800",
	Finalizing: "border-sky-200 bg-sky-50 text-sky-800",
	Imported: "border-emerald-200 bg-emerald-50 text-emerald-800",
	Skipped: "border-slate-200 bg-slate-50 text-slate-700",
	Failed: "border-red-200 bg-red-50 text-red-700",
	Blocked: "border-amber-200 bg-amber-50 text-amber-800",
	"Needs recovery": "border-amber-200 bg-amber-50 text-amber-800",
};

const SOURCE_INPUT_STATUS_CLASS: Record<string, string> = {
	available: "border-emerald-200 bg-emerald-50 text-emerald-800",
	missing: "border-red-200 bg-red-50 text-red-700",
	not_configured: "border-slate-200 bg-slate-50 text-slate-700",
	not_downloadable: "border-gray-200 bg-gray-50 text-gray-700",
};

function formatSourceInputStatus(status: string) {
	if (status === "available") return "Available";
	if (status === "missing") return "Missing";
	if (status === "not_configured") return "Not configured";
	if (status === "not_downloadable") return "Listed";
	return status || "Unknown";
}

function getSourceInputFileName(sourceRef: string) {
	return sourceRef.split(/[\\/]/).filter(Boolean).pop() || sourceRef;
}

function normalizeSourceRef(sourceRef: string) {
	return sourceRef.replace(/\\/g, "/").replace(/^\.?\//, "").toLowerCase();
}

type Dm3PostActionsJob = {
	id: string;
	status: "queued" | "running" | "completed" | "failed";
	mode?: "finalize" | "recover";
	startedAt?: string;
	finishedAt?: string;
	message?: string;
	total?: number;
	processed?: number;
	summary?: any;
	warnings?: any[];
	events?: Array<{
		row?: number;
		employeeId?: string;
		fullName?: string;
		stage?: string;
		message?: string;
	}>;
	error?: string;
};

type MigrationRunProgress = {
	runId: string;
	status: string;
	startedAt?: string;
	finishedAt?: string;
	durationMs?: number;
	currentStepCode?: string | null;
	currentStepLabel?: string | null;
	parentProgress?: {
		completedSteps: number;
		totalSteps: number;
	};
	activeChildJobs?: Array<{
		jobId: string;
		stepCode: string;
		label: string;
		status: string;
		processed: number;
		total: number | null;
		goalStatus?: string;
		lastHeartbeatAt?: string;
	}>;
	steps: Array<{
		code: string;
		label: string;
		status: string;
		processed: number;
		total: number | null;
		created: number;
		updated: number;
		skipped: number;
		failed: number;
		blockerReason?: string | null;
		counts?: Record<string, any>;
		startedAt?: string;
		completedAt?: string;
		elapsedMs?: number;
	}>;
	latestEvent?: {
		type: string;
		message: string;
		createdAt: string;
	} | null;
	recentEvents?: Array<{
		type: string;
		status?: string;
		stepCode?: string | null;
		message: string;
		sourceSheet?: string | null;
		sourceRow?: number | null;
		employeeId?: string | null;
		employeeName?: string | null;
		counts?: Record<string, any>;
		metadata?: Record<string, any>;
		createdAt: string;
	}>;
	summary?: Record<string, any>;
	proof?: Record<string, any>;
};

type MigrationRunEventRow = {
	id: string;
	timestamp: string;
	eventType: string;
	status: string;
	stepCode?: string | null;
	sourceSheet?: string | null;
	sourceRow?: number | null;
	employeeId?: string | null;
	employeeName?: string | null;
	message: string;
	counts?: Record<string, any>;
	metadata?: Record<string, any>;
};

type MigrationRunRecord = {
	id: string;
	workbookId: string;
	status: string;
	dryRun?: boolean;
	sourceFilename?: string | null;
	sourceFiles?: Array<{ path?: string; name?: string } | string>;
	createdAt?: string;
	updatedAt?: string;
};

const getExpectedHeaders = (fields: {
	required: Array<{ key: string }>;
	optional: Array<{ key: string }>;
	system?: Array<{ key: string }>;
}) => [
	...fields.required.map((field) => field.key),
	...fields.optional.map((field) => field.key),
	...(fields.system || []).map((field) => field.key),
];

function getCollectionTotal(data: any, collection: any[] | undefined): number {
	const total =
		data?.pagination?.total ??
		data?.count ??
		data?.data?.pagination?.total ??
		data?.data?.count;
	if (typeof total === "number") return total;
	return Array.isArray(collection) ? collection.length : 0;
}

function getStatusLabel(step: ImportStep): string | null {
	if (step.unavailable) return "Skipped";
	if (step.isLoading) return "Checking";
	if (step.count > 0) return null;
	return "Nothing imported yet";
}

function getStatusClassName(step: ImportStep) {
	if (step.unavailable) return "border-slate-600 bg-slate-600 text-white";
	if (step.isLoading) return "border-gray-600 bg-gray-600 text-white";
	return "border-orange-600 bg-orange-600 text-white";
}

function getCountLabel(step: ImportStep) {
	if (step.isLoading) return "Counting";
	const noun = step.count === 1 ? step.countLabelSingular : step.countLabelPlural;
	return `${step.count.toLocaleString()} ${noun}`;
}

function getCountClassName(step: ImportStep) {
	if (step.unavailable) return "border-slate-500 bg-slate-500 text-white";
	if (step.isLoading) return "border-gray-500 bg-gray-500 text-white";
	if (step.count > 0) return "border-emerald-600 bg-emerald-600 text-white";
	return "border-gray-700 bg-gray-700 text-white";
}

function getWorkbookSummary(group: ImportWorkbookGroup) {
	const wiredImporters = group.steps.filter((step) => !step.unavailable).length;
	const loading = group.steps.some((step) => step.isLoading);
	const totalRecords = group.steps.reduce((total, step) => total + (step.count || 0), 0);

	if (loading) return "Loading…";
	if (totalRecords > 0) {
		return `${totalRecords.toLocaleString()} records in HRIS`;
	}
	if (group.id === "dm4") {
		return `${group.steps.length} stages · not imported yet`;
	}
	return `${wiredImporters} sheets · not imported yet`;
}

function downloadTemplate(fileName: string, content = EMPTY_TEMPLATE) {
	const blob = new Blob([content], { type: "text/csv" });
	const url = window.URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName.replace("-import", "-template");
	a.click();
	window.URL.revokeObjectURL(url);
}

function getSummaryFromImportResult(result: any) {
	const data = result?.data || result;
	const envelope = data?.data || result?.data?.data;
	return (
		data?.summary ||
		envelope?.summary ||
		result?.summary ||
		result?.data?.summary ||
		result?.data?.data?.summary
	);
}
function hasImportIssues(result: any) {
	const summary = getSummaryFromImportResult(result);
	return (
		(Array.isArray(summary?.errors) && summary.errors.length > 0) ||
		Number(summary?.failed || 0) > 0 ||
		Number(summary?.skipped || 0) > 0
	);
}

function getImportIssueMessage(result: any) {
	const summary = getSummaryFromImportResult(result);
	if (!summary) return "";
	if (Array.isArray(summary.errors) && summary.errors.length > 0) {
		const firstError = summary.errors[0];
		return typeof firstError === "string"
			? firstError
			: firstError?.message || firstError?.error || "Row-level issue reported";
	}
	if (Number(summary.failed || 0) > 0) return `${summary.failed} failed`;
	if (Number(summary.skipped || 0) > 0) return `${summary.skipped} skipped`;
	return "";
}

function getImportSuccessMessage(step: ImportStep, summary: any) {
	if (!summary) return "";
	if (step.id === "employee-schedules") {
		const attendance = summary.attendanceObligations || {
			inserted: summary.attendanceObligationsInserted,
			existingAfter: summary.attendanceObligationsRefreshed,
			remainingScheduledGap: summary.attendanceObligationRemainingGap,
		};
		return [
			`${Number(summary.created || 0).toLocaleString()} assigned`,
			`${Number(summary.updated || 0).toLocaleString()} reassigned`,
			`${Number(attendance.inserted || 0).toLocaleString()} obligations materialized`,
			`${Number(attendance.existingAfter || 0).toLocaleString()} obligations verified`,
			`${Number(attendance.remainingScheduledGap || 0).toLocaleString()} gaps remaining`,
		].join("; ");
	}
	if (step.id === "employee-post-actions") {
		const postActions = summary.postActions || {};
		return [
			`${Number(postActions.completed || summary.created || 0).toLocaleString()} employees finalized`,
			"attendance obligations are owned by DM3.2 schedules",
		].join("; ");
	}
	if (Number(summary.created || 0) > 0 || Number(summary.updated || 0) > 0) {
		return `${Number(summary.created || 0).toLocaleString()} created; ${Number(
			summary.updated || 0,
		).toLocaleString()} updated`;
	}
	return "";
}

function parseRowNumber(message: string): number | null {
	const match = String(message || "").match(/\brow\s+(\d+)\b/i);
	return match ? Number(match[1]) : null;
}

function normalizeReportError(
	error: unknown,
	sheetName: string,
	status: MigrationReportError["status"],
): MigrationReportError {
	if (typeof error === "string") {
		return { sheetName, row: parseRowNumber(error), field: null, status, message: error };
	}

	const value = (error || {}) as any;
	const message = value.message || value.error || JSON.stringify(value);
	return {
		sheetName,
		row: typeof value.row === "number" ? value.row : parseRowNumber(message),
		field: value.field || value.header || value.column || null,
		status: value.status || status,
		message,
	};
}

function getImportErrorRows(result: any, sheetName: string): MigrationReportError[] {
	const summary = getSummaryFromImportResult(result);
	return [
		...(Array.isArray(summary?.errors) ? summary.errors : []),
		...(Array.isArray(result?.mappingErrors) ? result.mappingErrors : []),
		...(Array.isArray(result?.data?.mappingErrors) ? result.data.mappingErrors : []),
		...(Array.isArray(result?.data?.data?.mappingErrors) ? result.data.data.mappingErrors : []),
	].map((error) => normalizeReportError(error, sheetName, "failed"));
}

function buildReportSheetFromResult(
	step: ImportStep,
	rowCount: number,
	result: any,
	elapsedMs: number,
): MigrationReportSheet {
	const sheetName = step.sheetName || step.label;
	const summary = getSummaryFromImportResult(result) || {};
	const errors = getImportErrorRows(result, sheetName);
	const skipped = Number(summary.skipped || summary.skippedRows || 0);
	const blocked = Number(summary.blocked || summary.blockedRows || 0);
	const failed = Number(summary.failed || summary.failures || errors.length || 0);
	const hasIssues = failed > 0 || skipped > 0 || blocked > 0;
	const firstError =
		getImportIssueMessage(result) ||
		errors[0]?.message ||
		(!hasIssues ? getImportSuccessMessage(step, summary) : undefined);

	return {
		sheetName,
		target: step.target,
		status: hasIssues ? "Failed" : "Imported",
		totalRows: rowCount,
		created: Number(summary.created || summary.inserted || 0),
		updated: Number(summary.updated || 0),
		skipped,
		blocked,
		failed,
		elapsedMs,
		firstError,
		errors,
	};
}

function getDm3PostActionsJobFromResult(result: any): Dm3PostActionsJob | null {
	const data = result?.data || result;
	const envelope = data?.data || result?.data?.data;
	const job = envelope?.job || data?.job || result?.job;
	const jobId = envelope?.jobId || data?.jobId || result?.jobId;
	if (job && typeof job === "object") return job as Dm3PostActionsJob;
	if (jobId) return { id: String(jobId), status: "queued" };
	return null;
}

function buildReportSheetFromDm3PostActionsJob(
	step: ImportStep,
	rowCount: number,
	job: Dm3PostActionsJob,
	elapsedMs: number,
): MigrationReportSheet {
	const summary = job.summary || {};
	const errors = (Array.isArray(summary.errors) ? summary.errors : []).map((error: any) =>
		normalizeReportError(error, step.sheetName || step.label, "failed"),
	);
	const failed = Number(
		summary.failed || (job.status === "failed" ? rowCount : 0) || errors.length,
	);
	const blocked = Number(summary.blocked || failed || 0);
	const totalRows = Number(summary.total || job.total || rowCount || 0);
	const firstError =
		errors[0]?.message ||
		job.error ||
		(failed > 0 || blocked > 0
			? job.message || "Employee post-actions need recovery"
			: undefined);

	return {
		sheetName: step.sheetName || step.label,
		target: step.target,
		jobId: job.id,
		status:
			job.status === "completed" && failed === 0 && blocked === 0
				? "Imported"
				: job.status === "failed" || failed > 0 || blocked > 0
					? "Failed"
					: "Finalizing",
		totalRows,
		created: Number(summary.created || summary.postActions?.completed || 0),
		updated: Number(summary.updated || 0),
		skipped: Number(summary.skipped || 0),
		blocked,
		failed,
		elapsedMs,
		firstError,
		errors,
	};
}

function buildReportSheetFromEmployeeProgress(
	step: ImportStep,
	rowCount: number,
	progress: any,
	elapsedMs: number,
): MigrationReportSheet {
	const progressErrors = Array.isArray(progress?.errors) ? progress.errors : [];
	const rawErrors = progressErrors.filter((error: any) => {
		const message = String(error?.error || error?.message || "");
		return !(
			message.includes("EMAIL_CONFIG_MISSING") ||
			message.includes("Credential email sending is disabled")
		);
	});
	const emailConfigOnly =
		progressErrors.length > 0 &&
		rawErrors.length === 0 &&
		Number(progress?.created || progress?.success || 0) >=
			Number(progress?.total || rowCount || 0);
	const errors = rawErrors.map((error: any) =>
		normalizeReportError(
			{
				row: error?.row,
				field: error?.field,
				message: error?.error || error?.message || "Employee import failed",
			},
			step.sheetName || step.label,
			"failed",
		),
	);
	const failed = emailConfigOnly ? 0 : Number(progress?.failed || errors.length || 0);
	const blocked = emailConfigOnly ? 0 : Number(progress?.blocked || failed || 0);
	return {
		sheetName: step.sheetName || step.label,
		target: step.target,
		jobId: typeof progress?.jobId === "string" ? progress.jobId : undefined,
		status:
			progress?.status === "failed" || failed > 0 || blocked > 0
				? "Failed"
				: progress?.status === "completed"
					? "Imported"
					: getEmployeeImportProgressStatus(progress),
		totalRows: Number(progress?.total || rowCount || 0),
		created: Number(progress?.created || progress?.success || 0),
		updated: Number(progress?.updated || 0),
		skipped: Number(progress?.skipped || 0),
		blocked,
		failed,
		elapsedMs,
		firstError:
			errors[0]?.message ||
			(progress?.status === "completed"
				? undefined
				: getEmployeeImportProgressMessage(progress)),
		errors,
	};
}

function upsertReportSheet(
	report: MigrationImportReport,
	sheet: MigrationReportSheet,
): MigrationImportReport {
	const sheetKey = normalizeSheetName(sheet.sheetName);
	const sheets = report.sheets.filter(
		(existingSheet) => normalizeSheetName(existingSheet.sheetName) !== sheetKey,
	);
	return { ...report, sheets: [...sheets, sheet] };
}

function isWorkbookSheetTerminal(status?: string) {
	return ["Imported", "Skipped", "Failed", "Blocked", "Needs recovery"].includes(status || "");
}

function isWorkbookReportTerminal(status?: string) {
	return ["completed", "failed", "blocked"].includes(status || "");
}

function getReportWorkbookStatus(status?: MigrationImportReport["status"]): WorkbookSheetStatus {
	if (status === "completed") return "Imported";
	if (status === "blocked") return "Blocked";
	if (status === "failed") return "Failed";
	return "Importing";
}

function isActiveMigrationStatus(status?: string) {
	return ["running", "Checking", "Importing", "Finalizing"].includes(String(status || ""));
}

function getTerminalSheetFallbackStatus(
	report: MigrationImportReport | null | undefined,
	step: ImportStep,
	progress?: WorkbookSheetProgress,
): WorkbookSheetStatus {
	if (!report || !isWorkbookReportTerminal(report.status)) {
		return progress?.status || "Pending";
	}
	if (report.status === "blocked") {
		return progress?.status || (step.unavailable ? "Skipped" : "Pending");
	}
	if (
		report.workbookId === "dm3" &&
		step.id === "employee-post-actions" &&
		report.status !== "completed"
	) {
		return "Needs recovery";
	}
	return getReportWorkbookStatus(report.status);
}

export function getWorkbookReportIssue(report?: MigrationImportReport | null) {
	if (!report) return undefined;
	const issueSheet = report.sheets.find(
		(sheet) => sheet.status === "Failed" || sheet.status === "Blocked",
	);
	return issueSheet?.firstError || issueSheet?.errors?.[0]?.message;
}

function isEmailConfigOnlyIssue(sheet: MigrationReportSheet) {
	const messages = [sheet.firstError, ...(sheet.errors || []).map((error) => error.message)]
		.filter(Boolean)
		.map((message) => String(message));

	return (
		messages.length > 0 &&
		messages.every(
			(message) =>
				message.includes("EMAIL_CONFIG_MISSING") ||
				message.includes("Credential email sending is disabled"),
		)
	);
}

function normalizeWorkbookSheetLifecycle(
	sheet: MigrationReportSheet,
	options?: { preserveActiveJob?: boolean },
): MigrationReportSheet {
	if (
		(sheet.status === "Failed" || sheet.status === "Blocked") &&
		isEmailConfigOnlyIssue(sheet) &&
		Number(sheet.totalRows || 0) > 0 &&
		Number(sheet.created || 0) + Number(sheet.updated || 0) >= Number(sheet.totalRows || 0)
	) {
		return {
			...sheet,
			status: "Imported",
			blocked: 0,
			failed: 0,
			firstError: "Credential email skipped during DM3 account provisioning",
			errors: [],
		};
	}

	if (isWorkbookSheetTerminal(sheet.status)) return sheet;

	const totalRows = Number(sheet.totalRows || 0);
	const completedRows =
		Number(sheet.created || 0) +
		Number(sheet.updated || 0) +
		Number(sheet.skipped || 0) +
		Number(sheet.failed || 0) +
		Number(sheet.blocked || 0);

	if (totalRows > 0 && completedRows >= totalRows) {
		if (Number(sheet.failed || 0) > 0) return { ...sheet, status: "Failed" };
		if (Number(sheet.blocked || 0) > 0) return { ...sheet, status: "Blocked" };
		return {
			...sheet,
			status: "Imported",
			firstError: undefined,
		};
	}

	if (options?.preserveActiveJob && sheet.jobId) return sheet;

	return sheet;
}

export function normalizeWorkbookReportLifecycle(
	report: MigrationImportReport,
): MigrationImportReport {
	const reportIsRunning = report.status === "running";
	const sheets = report.sheets.map((sheet) => {
		const normalizedSheet = normalizeWorkbookSheetLifecycle(sheet, {
			preserveActiveJob: reportIsRunning,
		});
		if (!reportIsRunning && !isWorkbookSheetTerminal(normalizedSheet.status)) {
			if (
				report.status === "blocked" &&
				normalizedSheet.status === "Pending" &&
				!normalizedSheet.jobId &&
				!normalizedSheet.firstError
			) {
				return normalizedSheet;
			}
			const fallbackStatus =
				report.status === "completed"
					? "Imported"
					: report.status === "blocked"
						? "Blocked"
						: report.workbookId === "dm3" &&
							  normalizeSheetName(normalizedSheet.sheetName) ===
									normalizeSheetName("Employee Post Actions")
							? "Needs recovery"
							: "Failed";
			return {
				...normalizedSheet,
				status: fallbackStatus as WorkbookSheetStatus,
				blocked:
					fallbackStatus === "Blocked" || fallbackStatus === "Needs recovery"
						? Math.max(1, Number(normalizedSheet.blocked || 0))
						: normalizedSheet.blocked,
				failed:
					fallbackStatus === "Failed"
						? Math.max(1, Number(normalizedSheet.failed || 0))
						: normalizedSheet.failed,
				firstError:
					normalizedSheet.firstError ||
					(fallbackStatus === "Needs recovery"
						? "Employee post-actions timed out. Import data was saved; recovery is required."
						: undefined),
			};
		}
		return normalizedSheet;
	});
	const hasSheets = sheets.length > 0;
	const allResolved =
		hasSheets &&
		sheets.every(
			(sheet) => isWorkbookSheetTerminal(sheet.status) || sheet.status === "Pending",
		);
	const hasFailed = sheets.some((sheet) => sheet.status === "Failed");
	const hasBlocked = sheets.some((sheet) => sheet.status === "Blocked");
	let status = report.status;
	if (report.status === "failed" && allResolved) {
		status = hasFailed ? "failed" : hasBlocked ? "blocked" : "completed";
	}
	const latestEventAtMs =
		status !== "running"
			? Math.max(
					0,
					...(report.events || []).map((event) => Date.parse(event.at || "")),
				)
			: 0;
	const latestEventAt = latestEventAtMs > 0 ? new Date(latestEventAtMs).toISOString() : undefined;
	const hasElapsedEvidence =
		typeof report.elapsedMs === "number" &&
		Number.isFinite(report.elapsedMs) &&
		report.elapsedMs > 0;
	const elapsedFinishedAt =
		status !== "running" && hasElapsedEvidence && getReportTimeMs(report.startedAt)
			? new Date(getReportTimeMs(report.startedAt) + Number(report.elapsedMs)).toISOString()
			: undefined;
	const finishedAt =
		status !== "running"
			? report.finishedAt ||
				latestEventAt ||
				elapsedFinishedAt
			: report.finishedAt;

	return {
		...report,
		status,
		finishedAt,
		elapsedMs: getWorkbookReportElapsedMs({ ...report, status, finishedAt, sheets }),
		sheets,
	};
}

function getEmployeeImportProgressStatus(progress: any): WorkbookSheetStatus {
	if (progress?.status === "failed") return "Failed";
	if (progress?.status === "completed") return "Imported";
	const processed = Number(progress?.processed || 0);
	const total = Number(progress?.total || 0);
	return total > 0 && processed >= total ? "Finalizing" : "Importing";
}

function getEmployeeImportProgressMessage(progress: any) {
	const processed = Number(progress?.processed || 0);
	const total = Number(progress?.total || 0);
	const phase = String(progress?.phase || "");
	if (phase === "running_post_actions") {
		return `Finalizing ${processed.toLocaleString()} rows: metadata and attendance obligations`;
	}
	if (phase === "syncing_metadata") {
		return `Finalizing ${processed.toLocaleString()} rows: syncing user metadata`;
	}
	if (phase === "resolving_reporting_lines") {
		return `Finalizing ${processed.toLocaleString()} rows: resolving reporting lines`;
	}
	if (total > 0 && processed >= total && progress?.status === "processing") {
		return `Finalizing ${processed.toLocaleString()} rows: post-actions are still running`;
	}
	return `${processed.toLocaleString()} of ${total.toLocaleString()} checked`;
}

function formatElapsed(ms?: number) {
	if (typeof ms !== "number" || !Number.isFinite(ms)) return "not run";
	if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} sec`;
	return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function getWorkbookReportElapsedMs(report?: MigrationImportReport | null) {
	if (!report) return undefined;
	const startedAtMs = Date.parse(report.startedAt || "");
	const finishedAtMs = Date.parse(report.finishedAt || "");
	if (Number.isFinite(startedAtMs) && Number.isFinite(finishedAtMs)) {
		return Math.max(0, finishedAtMs - startedAtMs);
	}
	if (report.status === "running" && Number.isFinite(startedAtMs)) {
		return Math.max(0, Date.now() - startedAtMs);
	}
	if (typeof report.elapsedMs === "number" && Number.isFinite(report.elapsedMs)) {
		return report.elapsedMs;
	}
	const sheetElapsedMs = report.sheets.reduce((sum, sheet) => {
		const elapsedMs = Number(sheet.elapsedMs || 0);
		return sum + (Number.isFinite(elapsedMs) ? elapsedMs : 0);
	}, 0);
	return sheetElapsedMs > 0 ? sheetElapsedMs : undefined;
}

function formatReportTimestamp(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

function getReportTotals(report: MigrationImportReport) {
	return report.sheets.reduce(
		(totals, sheet) => ({
			totalRows: totals.totalRows + sheet.totalRows,
			created: totals.created + sheet.created,
			updated: totals.updated + sheet.updated,
			skipped: totals.skipped + sheet.skipped,
			blocked: totals.blocked + sheet.blocked,
			failed: totals.failed + sheet.failed,
		}),
		{ totalRows: 0, created: 0, updated: 0, skipped: 0, blocked: 0, failed: 0 },
	);
}

function normalizeSheetName(value?: string) {
	return String(value || "")
		.trim()
		.toLowerCase();
}

function getDm3RunStepSheetName(code: string, label: string) {
	if (code === "DM3.validate") return "Validate Workbook";
	if (code === "DM3.1") return "Employees";
	if (code === "DM3.2") return "Employee Schedule Assignments";
	if (code === "DM3.2.attendance_obligations") return "Attendance Obligations";
	if (code === "DM3.2.timesheet_drafts") return "Draft Timesheet Headers";
	if (code === "DM3.4") return "Employee Documents 201 Files";
	if (code === "DM3.5") return "Opening Leave Balances";
	if (code === "DM3.6") return "Employee Benefits Loans";
	if (code === "DM3.post_actions") return "Employee Post Actions";
	if (code === "DM3.verify_surfaces") return "Verify HRIS Surfaces";
	return label;
}

function getDm4RunStepSheetName(code: string, label: string) {
	if (code === "DM4.1") return "Attendance History";
	if (code === "DM4.2") return "Timesheets";
	if (code === "DM4.3") return "Approved Overtime Details";
	return label;
}

function getMigrationRunStepSheetName(workbookId: string, code: string, label: string) {
	if (workbookId === "dm4") return getDm4RunStepSheetName(code, label);
	return getDm3RunStepSheetName(code, label);
}

function getWorkbookStatusFromRunStep(status: string): WorkbookSheetStatus {
	if (status === "RUNNING") return "Importing";
	if (status === "COMPLETED" || status === "WARNING") return "Imported";
	if (status === "BLOCKED") return "Blocked";
	if (status === "FAILED") return "Failed";
	if (status === "NOT_WIRED") return "Skipped";
	return "Pending";
}

function getWorkbookStatusFromRunEventStatus(status: string): WorkbookSheetStatus {
	if (["IMPORTING", "MATERIALIZING", "FINALIZING", "QUEUED", "STARTING"].includes(status)) {
		return status === "FINALIZING" ? "Finalizing" : "Importing";
	}
	if (["COMPLETED", "COMPLETED_WITH_WARNINGS"].includes(status)) return "Imported";
	if (["BLOCKED", "STALE"].includes(status)) return "Blocked";
	if (status === "FAILED") return "Failed";
	return getWorkbookStatusFromRunStep(status);
}

function getEventRowLabel(event: MigrationLiveEvent) {
	return typeof event.sourceRow === "number" ? `Row ${event.sourceRow}` : "-";
}

function getEventEmployeeLabel(event: MigrationLiveEvent) {
	return [event.employeeId, event.employeeName].filter(Boolean).join(" - ") || "-";
}

function getEventDateLabel(event: MigrationLiveEvent) {
	const businessDate = event.metadata?.businessDate;
	return typeof businessDate === "string" && businessDate.trim() ? businessDate : "-";
}

function getEventEvidenceLabel(event: MigrationLiveEvent) {
	return String(event.message || "").trim();
}

function getEventBadgeStatus(event: MigrationLiveEvent): WorkbookSheetStatus {
	const eventType = String(event.eventType || "").toUpperCase();
	if (eventType === "ROW_IMPORTED") return "Imported";
	if (eventType === "ROW_SKIPPED") return "Skipped";
	if (eventType === "ROW_FAILED") return "Failed";
	if (eventType === "ROW_BLOCKED") return "Blocked";
	return event.status as WorkbookSheetStatus;
}

function buildDm4ProofRowEvidenceEvents(
	proof?: Dm4ProofReport | null,
	runId = "dm4-proof",
): MigrationLiveEvent[] {
	const selectedRows = Array.isArray(proof?.phase1Selection?.selectedRows)
		? proof.phase1Selection.selectedRows
		: [];
	const appliedRows = Array.isArray(proof?.phase2Application?.applied)
		? proof.phase2Application.applied
		: Array.isArray(proof?.phase2Materialization?.presentRows?.applied)
			? proof.phase2Materialization.presentRows.applied
			: [];
	const selectedRowsByEmployeeDate = new Map(
		selectedRows.map((row: any) => [
			`${row.dbEmployeeId || row.sourceEmployeeId || row.employeeId || ""}:${row.date || ""}`,
			row,
		]),
	);
	const rows =
		appliedRows.length > 0
			? appliedRows.map((row: any) => ({
					...(selectedRowsByEmployeeDate.get(`${row.employeeId || ""}:${row.date || ""}`) ||
						{}),
					...row,
				}))
			: selectedRows;

	return rows.slice(0, 200).map((row: any, index: number) => ({
		id: `${runId}-dm4-proof-row-${row.employeeId || row.dbEmployeeId || row.sourceEmployeeId || index}-${row.date || index}-${row.sourceRow || index}`,
		at: new Date().toISOString(),
		sheetName: row.sourceSheet || "Attendance History",
		status: "Imported",
		message: `DM4 attendance row materialized for ${row.date || "source date"}.`,
		eventType: "ROW_IMPORTED",
		stepCode: "DM4.1",
		sourceRow: Number(row.sourceRow || 0) || null,
		employeeId: row.employeeId || row.dbEmployeeId || row.sourceEmployeeId || null,
		employeeName: row.dbEmployeeName || row.sourceEmployeeName || row.employeeName || null,
		metadata: {
			businessDate: row.date || null,
			sourceWorkbook: row.sourceWorkbook || row.sourceWorkbookPath || null,
			sourceFile: row.sourceWorkbookPath || row.sourceWorkbook || null,
			sourceKind: row.sourceKind || "attendance_summary",
			payrollPeriodCode: row.payrollPeriodCode || null,
			timesheetlineId: row.timesheetlineId || null,
			attendanceId: row.attendanceId || null,
		},
	}));
}

function isRowEvidenceEvent(event: MigrationLiveEvent) {
	return (
		event.eventType === "ROW_IMPORTED" ||
		event.eventType === "ROW_SKIPPED" ||
		typeof event.sourceRow === "number" ||
		Boolean(event.employeeId) ||
		Boolean(event.employeeName) ||
		typeof event.metadata?.businessDate === "string"
	);
}

function getReportStatusFromRunStatus(status: string): MigrationImportReport["status"] {
	if (["COMPLETED", "COMPLETED_WITH_WARNINGS"].includes(status)) return "completed";
	if (status === "FAILED") return "failed";
	if (["BLOCKED", "STALE"].includes(status)) return "blocked";
	return "running";
}

function buildReportFromMigrationRunProgress(
	progress: MigrationRunProgress,
	group: ImportWorkbookGroup,
	sourceFilename = "",
): MigrationImportReport {
	const stepPrefix = `${group.id.toUpperCase()}.`;
	const sheets: MigrationReportSheet[] = progress.steps
		.filter((step) => step.code.startsWith(stepPrefix))
		.map((step) => {
			const counts = step.counts || {};
			const sheetName = getMigrationRunStepSheetName(group.id, step.code, step.label);
			const total = Number(
				step.total ??
					counts.total ??
					counts.expectedScheduledEmployeeDays ??
					counts.candidateRows ??
					0,
			);
			const blocked =
				step.status === "BLOCKED" ? Math.max(1, Number(counts.blocked || 0)) : 0;
			const failed = Number(step.failed || counts.failed || 0);
			return {
				sheetName,
				target: sheetName,
				status: getWorkbookStatusFromRunStep(step.status),
				totalRows: total,
				created: Number(step.created || counts.created || counts.inserted || 0),
				updated: Number(step.updated || counts.updated || counts.existingAfter || 0),
				skipped: Number(step.skipped || counts.skipped || 0),
				blocked,
				failed,
				elapsedMs: Number(step.elapsedMs || 0),
				firstError:
					step.blockerReason ||
					(step.code === "DM3.2.attendance_obligations" && counts.existingAfter
						? `${Number(counts.existingAfter).toLocaleString()} attendance obligations verified`
						: undefined),
				errors: step.blockerReason
					? [
							{
								sheetName,
								row: null,
								field: "run",
								status: "blocked",
								message: step.blockerReason,
							},
						]
					: [],
			};
		});
	return normalizeWorkbookReportLifecycle({
		runId: progress.runId,
		workbookId: group.id,
		workbookName: group.fileName,
		sourceFilename,
		startedAt: progress.startedAt || progress.steps[0]?.startedAt || new Date().toISOString(),
		finishedAt:
			getReportStatusFromRunStatus(progress.status) === "running"
				? undefined
				: progress.finishedAt || new Date().toISOString(),
		elapsedMs: progress.durationMs,
		status: getReportStatusFromRunStatus(progress.status),
		sheets,
		events:
			progress.recentEvents && progress.recentEvents.length > 0
				? progress.recentEvents
						.slice()
						.reverse()
						.map((event) => ({
							id: `${progress.runId}-${event.createdAt}-${event.type}`,
							at: event.createdAt,
							status: getWorkbookStatusFromRunEventStatus(
								event.status || progress.status,
							),
							sheetName:
								event.sourceSheet ||
								getMigrationRunStepSheetName(
									group.id,
									event.stepCode || "",
									event.stepCode || "",
								),
							message: event.message,
							eventType: event.type,
							stepCode: event.stepCode,
							sourceRow: event.sourceRow,
							employeeId: event.employeeId,
							employeeName: event.employeeName,
							metadata: event.metadata,
						}))
				: progress.latestEvent
					? [
							{
								id: `${progress.runId}-${progress.latestEvent.createdAt}`,
								at: progress.latestEvent.createdAt,
								status: getReportStatusFromRunStatus(progress.status),
								message: progress.latestEvent.message,
							},
						]
					: [],
	});
}

function buildWorkbookProgressFromMigrationRunProgress(
	group: ImportWorkbookGroup,
	report: MigrationImportReport,
): Record<string, WorkbookSheetProgress> {
	const base = buildWorkbookProgressFromReport(group, report);
	const attendanceSheet = report.sheets.find(
		(sheet) =>
			normalizeSheetName(sheet.sheetName) === normalizeSheetName("Attendance Obligations"),
	);
	if (attendanceSheet) {
		base["attendance-obligations"] = {
			status: attendanceSheet.status,
			rowCount: attendanceSheet.totalRows,
			created: attendanceSheet.created,
			updated: attendanceSheet.updated,
			blocked: attendanceSheet.blocked,
			failed: attendanceSheet.failed,
			message: attendanceSheet.firstError,
		};
	}
	return base;
}

function getReportSignal(report?: MigrationImportReport | null) {
	if (!report) return 0;
	const totals = getReportTotals(report);
	return (
		report.sheets.length +
		totals.totalRows +
		totals.created +
		totals.updated +
		totals.skipped +
		totals.blocked +
		totals.failed
	);
}

function getReportTimeMs(value?: string) {
	const parsed = value ? Date.parse(value) : Number.NaN;
	return Number.isFinite(parsed) ? parsed : 0;
}

function mergeMigrationReports(
	current: MigrationImportReport | undefined,
	incoming: MigrationImportReport,
) {
	if (!current) return incoming;
	if (current.runId === incoming.runId) {
		if (current.status === "running" && incoming.status !== "running") return incoming;
		if (incoming.status === "running" && current.status !== "running") return current;
		return getReportSignal(incoming) >= getReportSignal(current) ? incoming : current;
	}
	if (current.status === "running" && incoming.status !== "running") return current;
	if (incoming.status === "running" && current.status !== "running") {
		const incomingStartedAt = getReportTimeMs(incoming.startedAt);
		const currentFinishedAt = getReportTimeMs(current.finishedAt || current.startedAt);
		return incomingStartedAt >= currentFinishedAt ? incoming : current;
	}
	return getReportSignal(incoming) >= getReportSignal(current) ? incoming : current;
}

function getWorkbookLifecycleState(params: {
	report?: MigrationImportReport | null;
	progress?: Record<string, WorkbookSheetProgress>;
	resumeTarget?: { jobId: string; sheetName: string } | null;
	isOpen?: boolean;
	hasSelectedFile?: boolean;
}): WorkbookLifecycleState {
	const progressItems = Object.values(params.progress || {});
	if (progressItems.some((progress) => progress.status === "Finalizing")) {
		return WORKBOOK_LIFECYCLE.FINALIZING;
	}
	if (progressItems.some((progress) => progress.status === "Importing")) {
		return params.resumeTarget ? WORKBOOK_LIFECYCLE.POLLING : WORKBOOK_LIFECYCLE.UPLOADING;
	}
	if (progressItems.some((progress) => progress.status === "Checking")) {
		return WORKBOOK_LIFECYCLE.CHECKING;
	}
	if (params.report?.status === "running") return WORKBOOK_LIFECYCLE.POLLING;
	if (params.report?.status === "completed") return WORKBOOK_LIFECYCLE.COMPLETED;
	if (params.report?.status === "failed") return WORKBOOK_LIFECYCLE.FAILED;
	if (params.report?.status === "blocked") return WORKBOOK_LIFECYCLE.BLOCKED;
	if (params.resumeTarget) return WORKBOOK_LIFECYCLE.STALE;
	if (params.isOpen)
		return params.hasSelectedFile ? WORKBOOK_LIFECYCLE.OPEN : WORKBOOK_LIFECYCLE.IDLE;
	return WORKBOOK_LIFECYCLE.IDLE;
}

function getWorkbookLifecycleView(state: WorkbookLifecycleState) {
	switch (state) {
		case WORKBOOK_LIFECYCLE.CHECKING:
			return {
				label: "Checking",
				message: "Reading workbook sheets",
				status: "Checking" as WorkbookSheetStatus,
			};
		case WORKBOOK_LIFECYCLE.UPLOADING:
			return {
				label: "Importing",
				message: "Workbook import is running",
				status: "Importing" as WorkbookSheetStatus,
			};
		case WORKBOOK_LIFECYCLE.POLLING:
			return {
				label: "Resume",
				message: "Job is running. Resume polling from the saved job id.",
				status: "Importing" as WorkbookSheetStatus,
			};
		case WORKBOOK_LIFECYCLE.FINALIZING:
			return {
				label: "Finalizing",
				message: "Post-actions and attendance refresh are running",
				status: "Finalizing" as WorkbookSheetStatus,
			};
		case WORKBOOK_LIFECYCLE.COMPLETED:
			return {
				label: "Imported",
				message: "Workbook import completed",
				status: "Imported" as WorkbookSheetStatus,
			};
		case WORKBOOK_LIFECYCLE.FAILED:
			return {
				label: "Failed",
				message: "Workbook import needs review",
				status: "Failed" as WorkbookSheetStatus,
			};
		case WORKBOOK_LIFECYCLE.BLOCKED:
		case WORKBOOK_LIFECYCLE.STALE:
			return {
				label: "Blocked",
				message: "Job status is unavailable. Review the report or rerun.",
				status: "Blocked" as WorkbookSheetStatus,
			};
		case WORKBOOK_LIFECYCLE.OPEN:
			return {
				label: "Ready",
				message: "Workbook is selected and ready to import",
				status: "Pending" as WorkbookSheetStatus,
			};
		case WORKBOOK_LIFECYCLE.IDLE:
		default:
			return {
				label: "Pending",
				message: "No workbook import is running",
				status: "Pending" as WorkbookSheetStatus,
			};
	}
}

function isWorkbookProgressActive(progress?: Record<string, WorkbookSheetProgress>) {
	return Object.values(progress || {}).some((item) =>
		["Checking", "Importing", "Finalizing"].includes(item.status),
	);
}

function canRecoverDm3PostActions(report?: MigrationImportReport | null) {
	if (!report || report.workbookId !== "dm3") return false;
	if (report.status === "running") return false;
	const hasUnfinishedPostActions = !report.sheets.some(
		(sheet) =>
			normalizeSheetName(sheet.sheetName) === normalizeSheetName("Employee Post Actions") &&
			sheet.status === "Imported",
	);
	const hasBlockedJob = report.sheets.some(
		(sheet) =>
			sheet.jobId &&
			(sheet.status === "Blocked" ||
				sheet.status === "Needs recovery" ||
				String(sheet.firstError || "")
					.toLowerCase()
					.includes("job status")),
	);
	return hasUnfinishedPostActions || hasBlockedJob || report.status === "blocked";
}

function isDm3PostActionsSheet(sheetName?: string) {
	return normalizeSheetName(sheetName) === normalizeSheetName("Employee Post Actions");
}

function buildDm3PostActionsStep(rowCount = 0): ImportStep {
	return {
		id: "employee-post-actions",
		label: "Employee post-actions",
		fileName: "employees-import.csv",
		target: "Employee post-action",
		sheetName: "Employee Post Actions",
		expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_EMPLOYEES),
		countLabelSingular: "employee",
		countLabelPlural: "employees",
		count: rowCount,
		icon: Users,
	};
}

function buildWorkbookProgressFromReport(
	group: ImportWorkbookGroup,
	report: MigrationImportReport,
): Record<string, WorkbookSheetProgress> {
	return Object.fromEntries(
		group.steps.map((step) => {
			const sheet = report.sheets.find(
				(candidate) =>
					normalizeSheetName(candidate.sheetName) ===
					normalizeSheetName(step.sheetName || step.label),
			);
			return [
				step.id,
				{
					status: sheet?.status || "Pending",
					rowCount: sheet?.totalRows,
					created: sheet?.created,
					updated: sheet?.updated,
					skipped: sheet?.skipped,
					blocked: sheet?.blocked,
					failed: sheet?.failed,
					message: sheet?.firstError,
				} satisfies WorkbookSheetProgress,
			];
		}),
	);
}

function completeUnresolvedWorkbookSheets(
	group: ImportWorkbookGroup,
	report: MigrationImportReport,
): MigrationImportReport {
	let nextReport = report;
	for (const step of group.steps) {
		const hasSheet = nextReport.sheets.some(
			(sheet) =>
				normalizeSheetName(sheet.sheetName) ===
				normalizeSheetName(step.sheetName || step.label),
		);
		if (hasSheet) continue;

		const sheet: MigrationReportSheet = {
			sheetName: step.sheetName || step.label,
			target: step.target,
			status: step.unavailable ? "Skipped" : "Pending",
			totalRows: 0,
			created: 0,
			updated: 0,
			skipped: 0,
			blocked: 0,
			failed: 0,
			elapsedMs: 0,
			firstError: step.unavailable ? "Template only" : undefined,
			errors: [],
		};
		nextReport = upsertReportSheet(nextReport, sheet);
	}
	return normalizeWorkbookReportLifecycle(nextReport);
}

function downloadBlob(blob: Blob, fileName: string) {
	const url = window.URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	window.URL.revokeObjectURL(url);
}

async function downloadMigrationReport(report: MigrationImportReport) {
	if (!report.runId) {
		toast.error("Report download needs a saved migration run.");
		return;
	}
	const isoStamp = new Date(report.startedAt).toISOString();
	const timestamp = `${isoStamp.slice(0, 10)}-${isoStamp.slice(11, 16).replace(":", "")}`;
	try {
		const blob = await hrisApiClient.getBlob(
			`/api/migration/runs/${encodeURIComponent(report.runId)}/report.xlsx`,
		);
		const headerBytes = Array.from(new Uint8Array(await blob.slice(0, 4).arrayBuffer()));
		const isXlsxZip = headerBytes[0] === 0x50 && headerBytes[1] === 0x4b;
		const isPdf = headerBytes[0] === 0x25 && headerBytes[1] === 0x50 && headerBytes[2] === 0x44;
		if (!isXlsxZip || isPdf || blob.type === "application/pdf") {
			throw new Error("Server returned a non-spreadsheet report. Please retry after the API refreshes.");
		}
		downloadBlob(
			blob,
			`${report.workbookId}-migration-report-${timestamp}.xlsx`,
		);
		toast.success("Report downloaded");
	} catch (error: any) {
		toast.error(
			error?.message ||
				"Report download was unavailable. No fallback report was downloaded.",
		);
	}
}

function buildCsvFileFromRows(
	sheet: ExtractedSheet,
	fileName: string,
	expectedHeaders: string[] = [],
): File {
	const rows = sheet.rows || sheet.previewRows || sheet.sampleRows || [];
	const headerSet = new Set<string>();
	(sheet.headers || []).forEach((header) => headerSet.add(header));
	rows.forEach((row) => {
		Object.keys(row || {}).forEach((key) => headerSet.add(key));
	});
	expectedHeaders.forEach((header) => headerSet.add(header));
	const headers = Array.from(headerSet).filter(Boolean);
	const formatCell = (header: string, value: unknown) => {
		if (value === null || value === undefined) return "";
		if (/_?DATE$/i.test(header) || /\bDATE\b/i.test(header)) {
			const numericValue =
				typeof value === "number"
					? value
					: typeof value === "string" && value.trim() !== ""
						? Number(value)
						: Number.NaN;
			if (Number.isFinite(numericValue) && numericValue > 20000 && numericValue < 80000) {
				const excelEpoch = Date.UTC(1899, 11, 30);
				const date = new Date(excelEpoch + numericValue * 86400 * 1000);
				if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
			}
		}
		return value;
	};
	const escapeCell = (value: unknown) => {
		const text = String(value ?? "");
		if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
		return text;
	};
	const csvRows = [
		headers.join(","),
		...rows.map((row) =>
			headers.map((header) => escapeCell(formatCell(header, row?.[header]))).join(","),
		),
	];
	const blob = new Blob([csvRows.join("\r\n")], { type: "text/csv;charset=utf-8" });
	return new File([blob], fileName.replace(/\.xlsx$/i, ".csv"), {
		type: "text/csv;charset=utf-8",
	});
}

const DM4_SOURCE_FILES_STORAGE_KEY = "admin-migration::dm4-source-files";
const DM4_TIMESHEET_PROOF_ROUTE =
	"/hr/timesheets?tab=past&periodCode=PP-20260501-20260516&employeeId=cmpl3zukr098f7zz0x8x7ak99";
const DM4_DEFAULT_SOURCE_FOLDER = "docs/2026-20260527T124252Z-3-001/2026";
const DM4_APPROVED_OVERTIME_SOURCE_FILE =
	"docs/Bandai Payroll/2026 rptOvertimeDetails.xlsx";
const DM4_DEFAULT_SOURCE_FILES = [
	"docs/2026-20260527T124252Z-3-001/2026/Biometrics Data_Apr 11 - 25.xlsx",
	"docs/2026-20260527T124252Z-3-001/2026/Biometrics Data_Apr 26 - May 10.xlsx",
	"docs/2026-20260527T124252Z-3-001/2026/Biometrics Data_Dec 26 - Jan 10.xlsx",
	"docs/2026-20260527T124252Z-3-001/2026/Biometrics Data_Feb 11 - 25.xlsx",
	"docs/2026-20260527T124252Z-3-001/2026/Biometrics Data_Feb 26 - Mar 10.xlsx",
	"docs/2026-20260527T124252Z-3-001/2026/Biometrics Data_Jan 11 - 25.xlsx",
	"docs/2026-20260527T124252Z-3-001/2026/Biometrics Data_Jan 26 - Feb 10.xlsx",
	"docs/2026-20260527T124252Z-3-001/2026/Biometrics Data_Mar 11 - 25.xlsx",
	"docs/2026-20260527T124252Z-3-001/2026/Biometrics Data_Mar 26 - Apr 10.xlsx",
	"docs/2026-20260527T124252Z-3-001/2026/Biometrics Data_May 11 - 25.xlsx",
	DM4_APPROVED_OVERTIME_SOURCE_FILE,
];
const DM4_DEFAULT_SOURCE_FILES_TEXT = DM4_DEFAULT_SOURCE_FILES.join("\n");
function parseDm4SourceFiles(value: string) {
	return value
		.split(/\r?\n|;/)
		.map((item) => item.trim())
		.filter(Boolean);
}

function formatDm4SourceMode(value?: string) {
	if (value === "ui_source_files") return "UI workbook files";
	if (value === "ui_source_config") return "UI source config";
	if (value === "server_default_config") return "Server default config";
	return value || "Server default config";
}

function getDm4WorkbookFileName(filePath: string) {
	return filePath.split(/[\\/]/).filter(Boolean).pop() || filePath;
}

function isDm4ApprovedOvertimeSource(filePath: string) {
	return /\d{4}\s+rptOvertimeDetails\.xlsx$/i.test(filePath.replace(/\\/g, "/"));
}

function isDm4ResolvableSourcePath(filePath: string) {
	return !/\.xlsx$/i.test(filePath.trim());
}

function ensureDm4ApprovedOvertimeSources(paths: string[]) {
	const existing = new Set(paths.map((filePath) => filePath.replace(/\\/g, "/").toLowerCase()));
	return [
		...paths,
		...(existing.has(DM4_APPROVED_OVERTIME_SOURCE_FILE.toLowerCase())
			? []
			: [DM4_APPROVED_OVERTIME_SOURCE_FILE]),
	];
}

function getDm4SourceCountFromReport(report?: MigrationImportReport | null) {
	const match = String(report?.sourceFilename || "").match(/^(\d+)\s+workbook file/);
	return match ? Number(match[1]) : 0;
}

function getDm4TimesheetMaterialization(
	proof?: Dm4ProofReport | null,
): Dm4TimesheetMaterialization | undefined {
	return proof?.timesheetMaterialization || proof?.phase2Materialization?.timesheetDays;
}

function hasDm4ProofPayload(proof?: Dm4ProofReport | null): proof is Dm4ProofReport {
	return Boolean(
		proof?.phase1Selection ||
			proof?.phase2Application ||
			proof?.phase2Materialization ||
			proof?.timesheetMaterialization ||
			proof?.approvedOvertimeRepair ||
			proof?.phase3DbProof,
	);
}

export default function AdminMigrationPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const queryClient = useQueryClient();
	const { user } = useAuth();
	const action = searchParams.get("action") as ImportAction | null;
	const workbookParam = searchParams.get("workbook");
	const importJobIdParam = searchParams.get("importJobId");
	const runIdParam = searchParams.get("runId");
	const organizationId = user?.organizationId || user?.organization?.id || "";
	const [activeWorkbookGroupId, setActiveWorkbookGroupId] = useState<string | null>(null);
	const [groupManualOpen, setGroupManualOpen] = useState<Record<string, boolean>>({});
	const [groupGeneratedOpen, setGroupGeneratedOpen] = useState<Record<string, boolean>>({});
	const [sourceInputOpen, setSourceInputOpen] = useState<Record<string, boolean>>({});
	const [selectedWorkbookFiles, setSelectedWorkbookFiles] = useState<SelectedWorkbookFiles>({});
	const [draggingWorkbookGroupId, setDraggingWorkbookGroupId] = useState<string | null>(null);
	const [workbookProgress, setWorkbookProgress] = useState<WorkbookProgressState>({});
	const [migrationReports, setMigrationReports] = useState<Record<string, MigrationImportReport>>(
		{},
	);
	const [workbookLiveEvents, setWorkbookLiveEvents] = useState<
		Record<string, MigrationLiveEvent[]>
	>({});
	const workbookLiveEventsRef = useRef<Record<string, MigrationLiveEvent[]>>({});
	const [recoveringDm3PostActions, setRecoveringDm3PostActions] = useState(false);
	const [dm4SourceFilesText, setDm4SourceFilesText] = useState("");
	const [dm4ProofReport, setDm4ProofReport] = useState<Dm4ProofReport | null>(null);
	const [isLoadingDm4Proof, setIsLoadingDm4Proof] = useState(false);
	const [isRetryingDm4Run, setIsRetryingDm4Run] = useState(false);
	const [dm4ResumedJobId, setDm4ResumedJobId] = useState<string | null>(null);
	const [dm3DurableRunSourceFilename, setDm3DurableRunSourceFilename] = useState("");
	const [dm3ActiveRunId, setDm3ActiveRunId] = useState<string | null>(null);
	const [dm4ActiveRunId, setDm4ActiveRunId] = useState<string | null>(null);
	const [dm4ProofRun, setDm4ProofRun] = useState<Dm4ProofRunState>({
		status: "idle",
		startedAt: null,
		elapsedSeconds: 0,
		message: "Not started",
	});
	const workbookInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
	/** Tracks which run/client session currently owns the progress toast per workbook. */
	const importProgressToastRunsRef = useRef<Record<string, string | null>>({});
	const resumedWorkbookJobRefs = useRef<Set<string>>(new Set());
	const dm4SourceResolutionKeyRef = useRef("");
	const dm4ProofEventKeyRef = useRef("");
	const [dm4SourcePathDraft, setDm4SourcePathDraft] = useState("");
	const [isUploadingDm4Files, setIsUploadingDm4Files] = useState(false);
	const dm4FileInputRef = useRef<HTMLInputElement | null>(null);
	const [downloadingReportRunIds, setDownloadingReportRunIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [downloadingTemplateWorkbookId, setDownloadingTemplateWorkbookId] = useState<
		string | null
	>(null);

	useEffect(() => {
		workbookLiveEventsRef.current = workbookLiveEvents;
	}, [workbookLiveEvents]);

	const { data: departmentsData, isLoading: isLoadingDepartments } = useDepartments({
		page: 1,
		limit: 1,
		count: true,
	});
	const { data: sectionsData, isLoading: isLoadingSections } = useSections({
		page: 1,
		limit: 1,
		count: true,
	});
	const { data: positionsData, isLoading: isLoadingPositions } = usePositions({
		page: 1,
		limit: 1,
		count: true,
	});
	const { data: levelsData, isLoading: isLoadingLevels } = useLevels({
		page: 1,
		limit: 1,
		count: true,
	});
	const { data: shiftTypesData, isLoading: isLoadingShiftTypes } = useShiftTypes({
		page: 1,
		limit: 1,
		count: true,
	});
	const { data: agenciesData, isLoading: isLoadingAgencies } = useAgencies({
		page: 1,
		limit: 1,
		count: true,
	});
	const { data: holidaysData, isLoading: isLoadingHolidays } = useCalendarItems(
		organizationId,
		undefined,
		{
			page: 1,
			limit: 1,
			count: true,
			filter: "type:HOLIDAY",
		},
	);
	const { data: leaveTypesData, isLoading: isLoadingLeaveTypes } = useLeaveTypes({
		page: 1,
		limit: 1,
		count: true,
	});
	const { data: benefitTypesData, isLoading: isLoadingBenefitTypes } = useBenefitTypes({
		page: 1,
		limit: 1,
		count: true,
	});
	const { data: loanTypesData, isLoading: isLoadingLoanTypes } = useLoanTypes({
		page: 1,
		limit: 1,
		count: true,
	});
	const { data: documentTypesData, isLoading: isLoadingDocumentTypes } = useDocumentTypes({
		page: 1,
		limit: 1,
		count: true,
	});
	const { data: employeesData, isLoading: isLoadingEmployees } = useEmployees({
		page: 1,
		limit: 1,
		count: true,
	});
	const { data: attendancesData, isLoading: isLoadingAttendances } = useAttendances({
		page: 1,
		limit: 1,
		count: true,
	});
	const { data: timesheetsData, isLoading: isLoadingTimesheets } = useTimesheets({
		page: 1,
		limit: 1,
		count: true,
	});

	const importDepartments = useImportDepartments();
	const importSections = useImportSections();
	const importPositions = useImportPositions();
	const importLevels = useImportLevels();
	const importShiftTypes = useImportShiftTypes();
	const importAgencies = useImportAgencies();
	const importHolidays = useImportCalendarItems();
	const importLeaveTypes = useImportLeaveTypes();
	const importBenefitTypes = useImportBenefitTypes();
	const importLoanTypes = useImportLoanTypes();
	const importEmployees = useImportEmployees();
	const extractWorkbook = useExtractMigrationSources();
	const { data: persistedWorkbookReportsData, isLoading: isLoadingPersistedWorkbookReports } =
		useQuery({
		queryKey: ["migration-workbook-reports", organizationId],
		queryFn: async () => {
			const response = await hrisApiClient.get<MigrationAuditReportsResponse>(
				"/api/migration/workbook-audit/latest",
				{ organizationId, limit: 250 } as any,
			);
			return response.data || { reports: [], byWorkbook: {} };
		},
		enabled: Boolean(organizationId),
		staleTime: 30_000,
		refetchInterval: (query) => {
			const data = query.state.data as MigrationAuditReportsResponse | undefined;
			const hasRunningReport = Object.values(data?.byWorkbook || {}).some(
				(report) => normalizeWorkbookReportLifecycle(report).status === "running",
			);
			return hasRunningReport && typeof document !== "undefined" && !document.hidden
				? 2_500
				: false;
		},
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		});
	const { data: migrationSourceInputsData, isLoading: isLoadingMigrationSourceInputs } =
		useQuery({
			queryKey: ["migration-source-inputs"],
			queryFn: async () => {
				const response = await hrisApiClient.get<MigrationSourceInputsResponse>(
					"/api/migration/source-inputs",
				);
				return response.data || { items: [], manifest: "" };
			},
			staleTime: 60_000,
		});
	const { data: latestDm3RunData, isLoading: isLoadingLatestDm3Run } = useQuery({
		queryKey: ["migration-run-latest", "dm3", organizationId],
		queryFn: async () => {
			const response = await hrisApiClient.get<{ run: MigrationRunRecord | null }>(
				"/api/migration/runs/latest",
				{ organizationId, workbookId: "dm3" } as any,
			);
			return response.data?.run || null;
		},
		enabled: Boolean(organizationId),
		staleTime: 10_000,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});
	const { data: latestDm4RunData, isLoading: isLoadingLatestDm4Run } = useQuery({
		queryKey: ["migration-run-latest", "dm4", organizationId],
		queryFn: async () => {
			const response = await hrisApiClient.get<{ run: MigrationRunRecord | null }>(
				"/api/migration/runs/latest",
				{ organizationId, workbookId: "dm4", includeDryRun: false } as any,
			);
			const run = response.data?.run || null;
			return run?.dryRun ? null : run;
		},
		enabled: Boolean(organizationId),
		staleTime: 10_000,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});
	const persistedDm3Report =
		persistedWorkbookReportsData?.byWorkbook?.dm3 &&
		normalizeWorkbookReportLifecycle(persistedWorkbookReportsData.byWorkbook.dm3);
	const persistedDm3RunId = persistedDm3Report?.runId || "";
	const latestDm3RunId = latestDm3RunData?.id || persistedDm3RunId;
	const dm3EffectiveSourceFilename =
		dm3DurableRunSourceFilename ||
		persistedDm3Report?.sourceFilename ||
		latestDm3RunData?.sourceFilename ||
		"";
	const effectiveDm3RunId =
		dm3ActiveRunId || (workbookParam === "dm3" ? runIdParam : "") || latestDm3RunId || "";
	const latestDm4RunId = latestDm4RunData?.id || "";
	const effectiveDm4RunId =
		dm4ActiveRunId || (workbookParam === "dm4" ? runIdParam : "") || latestDm4RunId || "";
	const { data: dm3RunProgressData, isLoading: isLoadingDm3RunProgress } = useQuery({
		queryKey: ["migration-run-progress", effectiveDm3RunId],
		queryFn: async () => {
			const response = await hrisApiClient.get<{ progress: MigrationRunProgress }>(
				`/api/migration/runs/${effectiveDm3RunId}/progress`,
			);
			return response.data?.progress;
		},
		enabled: Boolean(effectiveDm3RunId),
		refetchInterval: (query) => {
			const progress = query.state.data as MigrationRunProgress | undefined;
			return progress && !DM3_RUN_TERMINAL_STATUSES.includes(progress.status) ? 2_000 : false;
		},
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});
	const { data: dm3RunEventsData } = useQuery({
		queryKey: ["migration-run-events", effectiveDm3RunId],
		queryFn: async () => {
			const response = await hrisApiClient.get<{ events: MigrationRunEventRow[] }>(
				`/api/migration/runs/${effectiveDm3RunId}/events`,
				{ limit: 500 } as any,
			);
			return response.data?.events || [];
		},
		enabled: Boolean(effectiveDm3RunId),
		refetchInterval: (query) => {
			const progress = queryClient.getQueryData<MigrationRunProgress>([
				"migration-run-progress",
				effectiveDm3RunId,
			]);
			return progress && !DM3_RUN_TERMINAL_STATUSES.includes(progress.status) ? 2_000 : false;
		},
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});
	const { data: dm4RunProgressData, isLoading: isLoadingDm4RunProgress } = useQuery({
		queryKey: ["migration-run-progress", effectiveDm4RunId],
		queryFn: async () => {
			const response = await hrisApiClient.get<{ progress: MigrationRunProgress }>(
				`/api/migration/runs/${effectiveDm4RunId}/progress`,
			);
			return response.data?.progress;
		},
		enabled: Boolean(effectiveDm4RunId),
		refetchInterval: (query) => {
			const progress = query.state.data as MigrationRunProgress | undefined;
			return progress && !DM3_RUN_TERMINAL_STATUSES.includes(progress.status) ? 2_000 : false;
		},
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});
	const { data: dm4RunEventsData } = useQuery({
		queryKey: ["migration-run-events", effectiveDm4RunId],
		queryFn: async () => {
			const response = await hrisApiClient.get<{ events: MigrationRunEventRow[] }>(
				`/api/migration/runs/${effectiveDm4RunId}/events`,
				{ limit: 500 } as any,
			);
			return response.data?.events || [];
		},
		enabled: Boolean(effectiveDm4RunId),
		refetchInterval: () => {
			const progress = queryClient.getQueryData<MigrationRunProgress>([
				"migration-run-progress",
				effectiveDm4RunId,
			]);
			return progress && !DM3_RUN_TERMINAL_STATUSES.includes(progress.status) ? 2_000 : false;
		},
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});

	useEffect(() => {
		if (workbookParam !== "dm3") return;
		if (!latestDm3RunId || dm3ActiveRunId) return;
		if (runIdParam === latestDm3RunId) return;
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.set("workbook", "dm3");
			next.set("runId", latestDm3RunId);
			next.delete("importJobId");
			return next;
		});
	}, [dm3ActiveRunId, latestDm3RunId, runIdParam, setSearchParams, workbookParam]);

	useEffect(() => {
		if (!dm3ActiveRunId || !dm3RunProgressData) return;
		if (!DM3_RUN_TERMINAL_STATUSES.includes(dm3RunProgressData.status)) return;
		void queryClient.invalidateQueries({
			queryKey: ["migration-run-latest", "dm3", organizationId],
		});
		setDm3ActiveRunId(null);
	}, [dm3ActiveRunId, dm3RunProgressData, organizationId, queryClient]);

	useEffect(() => {
		if (!latestDm4RunId || dm4ActiveRunId) return;
		if (workbookParam !== "dm4") return;
		if (runIdParam === latestDm4RunId) return;
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.set("workbook", "dm4");
			next.set("runId", latestDm4RunId);
			next.delete("importJobId");
			return next;
		});
	}, [dm4ActiveRunId, latestDm4RunId, runIdParam, setSearchParams, workbookParam]);

	useEffect(() => {
		if (!dm4ActiveRunId || !dm4RunProgressData) return;
		if (!DM3_RUN_TERMINAL_STATUSES.includes(dm4RunProgressData.status)) return;
		void queryClient.invalidateQueries({
			queryKey: ["migration-run-latest", "dm4", organizationId],
		});
		setDm4ActiveRunId(null);
	}, [dm4ActiveRunId, dm4RunProgressData, organizationId, queryClient]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const savedSourceFiles = localStorage.getItem(DM4_SOURCE_FILES_STORAGE_KEY) || "";
		const savedPaths = parseDm4SourceFiles(savedSourceFiles);
		const defaultLikeSavedPaths =
			savedPaths.length > 0 &&
			savedPaths.some((path) => path.replace(/\\/g, "/").includes(DM4_DEFAULT_SOURCE_FOLDER)) &&
			!savedPaths.some(isDm4ApprovedOvertimeSource);
		setDm4SourceFilesText(
			savedPaths.length > 0
				? defaultLikeSavedPaths
					? ensureDm4ApprovedOvertimeSources(savedPaths).join("\n")
					: savedSourceFiles
				: DM4_DEFAULT_SOURCE_FOLDER,
		);
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;
		localStorage.setItem(DM4_SOURCE_FILES_STORAGE_KEY, dm4SourceFilesText);
	}, [dm4SourceFilesText]);

	useEffect(() => {
		const sourceFiles = parseDm4SourceFiles(dm4SourceFilesText);
		if (sourceFiles.length === 0) return;
		if (!sourceFiles.some(isDm4ResolvableSourcePath)) {
			const nextText = ensureDm4ApprovedOvertimeSources(sourceFiles).join("\n");
			if (nextText !== dm4SourceFilesText) {
				setDm4SourceFilesText(nextText);
			}
			return;
		}
		const resolutionKey = sourceFiles.join("\n");
		if (dm4SourceResolutionKeyRef.current === resolutionKey) return;
		dm4SourceResolutionKeyRef.current = resolutionKey;

		let cancelled = false;
		void hrisApiClient
			.post<Dm4SourceWorkbooksResponse>("/api/migration/dm4/resolve-source-workbooks", {
				sourceFiles,
			})
			.then((response) => {
				if (cancelled) return;
				const workbookFiles = response.data?.sourceWorkbookFiles || [];
				if (workbookFiles.length === 0) return;
				const nextText = ensureDm4ApprovedOvertimeSources(workbookFiles).join("\n");
				if (nextText !== dm4SourceFilesText) {
					setDm4SourceFilesText(nextText);
				}
			})
			.catch(() => {
				if (cancelled) return;
				if (
					sourceFiles.length === 1 &&
					sourceFiles[0].replace(/\\/g, "/") === DM4_DEFAULT_SOURCE_FOLDER
				) {
					setDm4SourceFilesText(DM4_DEFAULT_SOURCE_FILES_TEXT);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [dm4SourceFilesText]);

	useEffect(() => {
		if (dm4ProofRun.status !== "running" || !dm4ProofRun.startedAt) return;
		const intervalId = window.setInterval(() => {
			setDm4ProofRun((current) =>
				current.status === "running" && current.startedAt
					? {
							...current,
							elapsedSeconds: Math.max(
								1,
								Math.floor((Date.now() - current.startedAt) / 1000),
							),
						}
					: current,
			);
		}, 1000);
		return () => window.clearInterval(intervalId);
	}, [dm4ProofRun.status, dm4ProofRun.startedAt]);

	useEffect(() => {
		if (dm4ProofRun.status !== "idle") return;
		const report = migrationReports.dm4
			? normalizeWorkbookReportLifecycle(migrationReports.dm4)
			: null;
		if (!report || report.status !== "completed") return;
		const workbookCount = getDm4SourceCountFromReport(report);
		setDm4ProofRun({
			status: "success",
			startedAt: new Date(report.startedAt).getTime() || null,
			elapsedSeconds: Math.max(1, Math.floor((report.elapsedMs || 0) / 1000)),
			message: "DM4 checkpoint restored from the last saved workbook audit.",
			sourceMode:
				workbookCount > 0
					? "UI workbook files"
					: report.sourceFilename || "Server default config",
			sourceCount: workbookCount,
			sourceWorkbookCount: workbookCount,
		});
	}, [dm4ProofRun.status, migrationReports.dm4]);

	const counts = {
		departments: getCollectionTotal(departmentsData, (departmentsData as any)?.departments),
		sections: getCollectionTotal(sectionsData, (sectionsData as any)?.sections),
		positions: getCollectionTotal(positionsData, (positionsData as any)?.positions),
		levels: getCollectionTotal(levelsData, (levelsData as any)?.levels),
		shiftTypes: getCollectionTotal(shiftTypesData, (shiftTypesData as any)?.shiftTypes),
		agencies: getCollectionTotal(agenciesData, (agenciesData as any)?.agencies),
		holidays: getCollectionTotal(holidaysData, holidaysData as any),
		leaveTypes: getCollectionTotal(leaveTypesData, (leaveTypesData as any)?.leaveTypes),
		benefitTypes: getCollectionTotal(benefitTypesData, (benefitTypesData as any)?.benefitTypes),
		loanTypes: getCollectionTotal(loanTypesData, (loanTypesData as any)?.loanTypes),
		documentTypes: getCollectionTotal(
			documentTypesData,
			(documentTypesData as any)?.documentTypes,
		),
		employees: getCollectionTotal(employeesData, (employeesData as any)?.employees),
		attendances: getCollectionTotal(attendancesData, (attendancesData as any)?.attendances),
		timesheets: getCollectionTotal(timesheetsData, (timesheetsData as any)?.timesheets),
	};

	const steps: ImportStep[] = useMemo(
		() => [
			{
				id: "departments",
				label: "Departments",
				fileName: "departments-import.csv",
				target: "Department",
				sheetName: "Departments",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_DEPARTMENTS),
				countLabelSingular: "department",
				countLabelPlural: "departments",
				count: counts.departments,
				isLoading: isLoadingDepartments,
				action: "import-departments",
				icon: Building2,
			},
			{
				id: "sections",
				label: "Sections",
				fileName: "sections-import.csv",
				target: "Section",
				sheetName: "Sections",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_SECTIONS),
				countLabelSingular: "section",
				countLabelPlural: "sections",
				count: counts.sections,
				isLoading: isLoadingSections,
				action: "import-sections",
				icon: Layers3,
			},
			{
				id: "positions",
				label: "Positions",
				fileName: "positions-import.csv",
				target: "Position",
				sheetName: "Positions",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_POSITIONS),
				countLabelSingular: "position",
				countLabelPlural: "positions",
				count: counts.positions,
				isLoading: isLoadingPositions,
				action: "import-positions",
				icon: Briefcase,
			},
			{
				id: "levels",
				label: "Levels",
				fileName: "levels-import.csv",
				target: "Level",
				sheetName: "Levels",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_LEVELS),
				countLabelSingular: "level",
				countLabelPlural: "levels",
				count: counts.levels,
				isLoading: isLoadingLevels,
				action: "import-levels",
				icon: BadgeCheck,
			},
			{
				id: "shift-types",
				label: "Shift types / schedules",
				fileName: "shift-types-import.csv",
				target: "Shift type",
				sheetName: "Shift Types Schedules",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_SHIFT_TYPES),
				countLabelSingular: "shift type",
				countLabelPlural: "shift types",
				count: counts.shiftTypes,
				isLoading: isLoadingShiftTypes,
				action: "import-shift-types",
				icon: Route,
			},
			{
				id: "agencies",
				label: "Agencies",
				fileName: "agencies-import.csv",
				target: "Agency",
				sheetName: "Agencies",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_AGENCIES),
				countLabelSingular: "agency",
				countLabelPlural: "agencies",
				count: counts.agencies,
				isLoading: isLoadingAgencies,
				action: "import-agencies",
				icon: Building2,
			},
			{
				id: "holidays",
				label: "Holidays",
				fileName: "holidays-import.csv",
				target: "Calendar item",
				sheetName: "Holidays",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_HOLIDAYS),
				countLabelSingular: "holiday",
				countLabelPlural: "holidays",
				count: counts.holidays,
				isLoading: isLoadingHolidays,
				action: "import-holidays",
				icon: CalendarDays,
			},
			{
				id: "leave-types",
				label: "Leave types",
				fileName: "leave-types-import.csv",
				target: "Leave type",
				sheetName: "Leave Types",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_LEAVE_TYPES),
				countLabelSingular: "leave type",
				countLabelPlural: "leave types",
				count: counts.leaveTypes,
				isLoading: isLoadingLeaveTypes,
				action: "import-leave-types",
				icon: MapPinned,
			},
			{
				id: "benefit-types",
				label: "Benefit types",
				fileName: "benefit-types-import.csv",
				target: "Benefit type",
				sheetName: "Benefit Types",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_BENEFIT_TYPES),
				countLabelSingular: "benefit type",
				countLabelPlural: "benefit types",
				count: counts.benefitTypes,
				isLoading: isLoadingBenefitTypes,
				action: "import-benefit-types",
				icon: Gift,
			},
			{
				id: "loan-types",
				label: "Loan types",
				fileName: "loan-types-import.csv",
				target: "Loan type",
				sheetName: "Loan Types",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_LOAN_TYPES),
				countLabelSingular: "loan type",
				countLabelPlural: "loan types",
				count: counts.loanTypes,
				isLoading: isLoadingLoanTypes,
				action: "import-loan-types",
				icon: Gift,
			},
			{
				id: "document-201-types",
				label: "201 document types",
				fileName: "document-201-types-import.csv",
				target: "Document type",
				sheetName: "201 Document Types",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_DOCUMENT_201_TYPES),
				countLabelSingular: "document type",
				countLabelPlural: "document types",
				count: counts.documentTypes,
				isLoading: isLoadingDocumentTypes,
				icon: FileText,
				unavailable: true,
			},
			{
				id: "employees",
				label: "Employees",
				fileName: "employees-import.csv",
				target: "Employee",
				sheetName: "Employees",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_EMPLOYEES),
				countLabelSingular: "employee",
				countLabelPlural: "employees",
				count: counts.employees,
				isLoading: isLoadingEmployees,
				action: "import-employees",
				icon: Users,
			},
			{
				id: "employee-schedules",
				label: "Employee schedule assignments",
				fileName: "employee-schedules-import.csv",
				target: "Employee schedule",
				sheetName: "Employee Schedule Assignments",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_EMPLOYEE_SCHEDULES),
				countLabelSingular: "schedule assignment",
				countLabelPlural: "schedule assignments",
				count: 0,
				icon: Route,
			},
			{
				id: "reporting-lines",
				label: "Reporting lines",
				fileName: "reporting-lines-import.csv",
				target: "Employee reporting line",
				sheetName: "Reporting Lines",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_REPORTING_LINES),
				countLabelSingular: "reporting line",
				countLabelPlural: "reporting lines",
				count: 0,
				icon: Users,
			},
			{
				id: "employee-documents",
				label: "Employee documents / 201 files",
				fileName: "employee-documents-201-import.csv",
				target: "Employee document",
				sheetName: "Employee Documents 201 Files",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_EMPLOYEE_DOCUMENTS),
				countLabelSingular: "employee document",
				countLabelPlural: "employee documents",
				count: 0,
				icon: FileText,
			},
			{
				id: "opening-leave-balances",
				label: "Opening leave balances",
				fileName: "opening-leave-balances-import.csv",
				target: "Employee leave balance",
				sheetName: "Opening Leave Balances",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_OPENING_LEAVE_BALANCES),
				countLabelSingular: "opening balance",
				countLabelPlural: "opening balances",
				count: 0,
				icon: MapPinned,
			},
			{
				id: "employee-benefits-loans",
				label: "Employee benefits / loans",
				fileName: "employee-benefits-loans-import.csv",
				target: "Employee benefit or loan",
				sheetName: "Employee Benefits Loans",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_EMPLOYEE_BENEFITS_LOANS),
				countLabelSingular: "assignment",
				countLabelPlural: "assignments",
				count: 0,
				icon: Gift,
			},
			{
				id: "attendance-history",
				label: "Attendance History",
				fileName: "attendance-history-import.csv",
				target: "Attendance",
				sheetName: "Attendance History",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_ATTENDANCE_HISTORY),
				countLabelSingular: "attendance row",
				countLabelPlural: "attendance rows",
				count: counts.attendances,
				isLoading: isLoadingAttendances,
				icon: Clock3,
				unavailable: true,
			},
			{
				id: "timesheets",
				label: "Timesheets",
				fileName: "timesheets-import.csv",
				target: "Timesheet line",
				sheetName: "Timesheets",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_TIMESHEETS),
				countLabelSingular: "timesheet",
				countLabelPlural: "timesheets",
				count: counts.timesheets,
				isLoading: isLoadingTimesheets,
				icon: ClipboardList,
				unavailable: true,
			},
			{
				id: "approved-overtime-details",
				label: "Approved Overtime Details",
				fileName: "approved-overtime-details-import.xlsx",
				target: "Effective timesheet line",
				sheetName: "Approved Overtime Details",
				expectedHeaders: getExpectedHeaders(IMPORT_FIELDS_TIMESHEETS),
				countLabelSingular: "line update",
				countLabelPlural: "line updates",
				count: 0,
				icon: ClipboardList,
				unavailable: true,
			},
		],
		[
			counts.agencies,
			counts.attendances,
			counts.benefitTypes,
			counts.departments,
			counts.documentTypes,
			counts.employees,
			counts.holidays,
			counts.leaveTypes,
			counts.levels,
			counts.loanTypes,
			counts.positions,
			counts.sections,
			counts.shiftTypes,
			counts.timesheets,
			isLoadingAgencies,
			isLoadingBenefitTypes,
			isLoadingDepartments,
			isLoadingDocumentTypes,
			isLoadingEmployees,
			isLoadingAttendances,
			isLoadingHolidays,
			isLoadingLeaveTypes,
			isLoadingLevels,
			isLoadingLoanTypes,
			isLoadingPositions,
			isLoadingSections,
			isLoadingShiftTypes,
			isLoadingTimesheets,
		],
	);

	const workbookGroups = useMemo<ImportWorkbookGroup[]>(
		() => [
			{
				id: "dm1",
				title: "DM1 - Master Data Workbook",
				fileName: "DM1-master-data-migration.xlsx",
				steps: steps.filter((step) =>
					[
						"departments",
						"sections",
						"positions",
						"levels",
						"shift-types",
						"agencies",
					].includes(step.id),
				),
			},
			{
				id: "dm2",
				title: "DM2 - Policy Data Workbook",
				fileName: "DM2-policy-data-migration.xlsx",
				steps: steps.filter((step) =>
					[
						"holidays",
						"leave-types",
						"benefit-types",
						"loan-types",
						"document-201-types",
					].includes(step.id),
				),
			},
			{
				id: "dm3",
				title: "DM3 - Employee Data Workbook",
				fileName: "DM3-employee-data-migration.xlsx",
				steps: [
					...steps.filter((step) =>
						["employees", "employee-schedules"].includes(step.id),
					),
					...steps.filter((step) =>
						[
							"reporting-lines",
							"employee-documents",
							"opening-leave-balances",
							"employee-benefits-loans",
						].includes(step.id),
					),
				],
				generatedSteps: [
					{
						id: "attendance-obligations",
						label: "Attendance obligations",
						fileName: "attendance-obligations",
						target: "Attendance obligation",
						sheetName: "Attendance Obligations",
						countLabelSingular: "obligation",
						countLabelPlural: "obligations",
						count: 0,
						icon: Clock3,
						unavailable: true,
					},
					{
						id: "draft-timesheet-headers",
						label: "Draft timesheet headers",
						fileName: "draft-timesheet-headers",
						target: "Timesheet draft header",
						sheetName: "Draft Timesheet Headers",
						countLabelSingular: "draft header",
						countLabelPlural: "draft headers",
						count: 0,
						icon: ClipboardList,
						unavailable: true,
					},
					{
						id: "employee-post-actions",
						label: "Employee post actions",
						fileName: "employee-post-actions",
						target: "Employee post action",
						sheetName: "Employee Post Actions",
						countLabelSingular: "employee",
						countLabelPlural: "employees",
						count: 0,
						icon: Users,
						unavailable: true,
					},
					{
						id: "verify-hris-surfaces",
						label: "Verify HRIS surfaces",
						fileName: "verify-hris-surfaces",
						target: "HRIS surface proof",
						sheetName: "Verify HRIS Surfaces",
						countLabelSingular: "proof",
						countLabelPlural: "proofs",
						count: 0,
						icon: BadgeCheck,
						unavailable: true,
					},
				],
			},
			{
				id: "dm4",
				title: "DM4 - Attendance & Timesheet Workbook",
				fileName: "DM4-attendance-timesheet-migration.xlsx",
				steps: steps.filter((step) =>
					["attendance-history", "timesheets", "approved-overtime-details"].includes(
						step.id,
					),
				),
			},
		],
		[steps],
	);

	useEffect(() => {
		if (!workbookParam) {
			if (activeWorkbookGroupId !== null) setActiveWorkbookGroupId(null);
			return;
		}
		if (
			workbookGroups.some((group) => group.id === workbookParam) &&
			activeWorkbookGroupId !== workbookParam
		) {
			setActiveWorkbookGroupId(workbookParam);
		}
	}, [workbookParam, activeWorkbookGroupId, workbookGroups]);

	const activeWorkbookGroup =
		workbookGroups.find((group) => group.id === activeWorkbookGroupId) || null;
	const activeWorkbookSourceInputs = useMemo(
		() => {
			if (!activeWorkbookGroup) return [];
			const manifestInputs = (migrationSourceInputsData?.items || []).filter(
				(item) => item.dmPhase === activeWorkbookGroup.id,
			);
			if (activeWorkbookGroup.id !== "dm4") return manifestInputs;

			const bySourceRef = new Map(
				manifestInputs.map((item) => [normalizeSourceRef(item.sourceRef), item]),
			);
			const activeRefs = [
				...parseDm4SourceFiles(dm4SourceFilesText),
				...((dm4RunProgressData?.proof?.sourceWorkbookFiles as string[] | undefined) || []),
				...((dm4RunProgressData?.summary?.sourceWorkbookFiles as string[] | undefined) || []),
				...((dm4RunProgressData?.summary?.sourceFiles as string[] | undefined) || []),
				...((latestDm4RunData?.sourceFiles || []).map((source) =>
					typeof source === "string" ? source : source.path || source.name || "",
				)),
			].filter(Boolean);
			const extras: MigrationSourceInput[] = [];
			for (const sourceRef of activeRefs) {
				const normalized = normalizeSourceRef(sourceRef);
				if (!normalized || bySourceRef.has(normalized)) continue;
				bySourceRef.set(normalized, {
					id: `dm4-run-source-${extras.length + 1}`,
					dmPhase: "dm4",
					displayName: getSourceInputFileName(sourceRef),
					sourceRef,
					description: "Source reference recorded by the active or latest DM4 run.",
					sheetMappings: [
						{ step: "DM4", sheet: "Run source workbook" },
					],
					confidential: true,
					status: "not_downloadable",
					available: true,
					downloadable: false,
					downloadUrl: null,
				});
				extras.push(bySourceRef.get(normalized) as MigrationSourceInput);
			}
			return [...manifestInputs, ...extras];
		},
		[
			activeWorkbookGroup,
			dm4RunProgressData?.proof?.sourceWorkbookFiles,
			dm4RunProgressData?.summary,
			dm4SourceFilesText,
			latestDm4RunData?.sourceFiles,
			migrationSourceInputsData?.items,
		],
	);
	const employeeStep = steps.find((step) => step.id === "employees");
	useEffect(() => {
		if (!dm3RunProgressData) return;
		const group = workbookGroups.find((candidate) => candidate.id === "dm3");
		if (!group) return;
		const report = buildReportFromMigrationRunProgress(
			dm3RunProgressData,
			group,
			dm3EffectiveSourceFilename,
		);
		setMigrationReports((current) => ({ ...current, dm3: report }));
		setWorkbookProgress((current) => ({
			...current,
			dm3: buildWorkbookProgressFromMigrationRunProgress(group, report),
		}));
		const reportEvents = report.events || [];
		if (reportEvents.length > 0) {
			setWorkbookLiveEvents((current) => ({
				...current,
				dm3: reportEvents.slice(0, 10),
			}));
		}
	}, [dm3EffectiveSourceFilename, dm3RunProgressData, workbookGroups]);

	// Durable DM3 runs can take many minutes — keep a progress toast updated from poll data.
	useEffect(() => {
		if (!dm3RunProgressData) return;
		syncDurableRunProgressToast("dm3", dm3RunProgressData);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- toast helpers are stable for this page lifecycle
	}, [dm3RunProgressData]);
	useEffect(() => {
		if (!dm3RunEventsData || dm3RunEventsData.length === 0) return;
		const mappedEvents: MigrationLiveEvent[] = dm3RunEventsData
			.slice()
			.reverse()
			.map((event) => ({
				id: event.id,
				at: event.timestamp,
				status: getWorkbookStatusFromRunEventStatus(event.status),
				sheetName:
					event.sourceSheet ||
					getDm3RunStepSheetName(event.stepCode || "", event.stepCode || ""),
				message: event.message,
				eventType: event.eventType,
				stepCode: event.stepCode,
				sourceRow: event.sourceRow,
				employeeId: event.employeeId,
				employeeName: event.employeeName,
				metadata: event.metadata,
			}));
		setWorkbookLiveEvents((current) => ({
			...current,
			dm3: mappedEvents.slice(0, 200),
		}));
	}, [dm3RunEventsData]);
	useEffect(() => {
		if (!dm4RunProgressData) return;
		const group = workbookGroups.find((candidate) => candidate.id === "dm4");
		if (!group) return;
		const runReport = buildReportFromMigrationRunProgress(
			dm4RunProgressData,
			group,
			dm4RunProgressData.summary?.sourceFiles?.[0] || latestDm4RunData?.sourceFilename || "",
		);
		const report =
			hasDm4ProofPayload(dm4RunProgressData.proof) &&
			isWorkbookReportTerminal(runReport.status)
				? buildDm4ProofImportReport({
						runId: dm4RunProgressData.runId,
						proof: dm4RunProgressData.proof,
						startedAt:
							Date.parse(dm4RunProgressData.startedAt || "") ||
							Date.parse(runReport.startedAt || "") ||
							Date.now(),
						finishedAt:
							Date.parse(dm4RunProgressData.finishedAt || "") ||
							Date.parse(runReport.finishedAt || "") ||
							Date.now(),
						sourceMode:
							dm4RunProgressData.proof.sourceMode ||
							"UI workbook files",
						sourceCount:
							dm4RunProgressData.proof.sourceWorkbookCount ||
							dm4RunProgressData.proof.sourceWorkbookFiles?.length ||
							(dm4RunProgressData.summary?.sourceWorkbookFiles as string[] | undefined)
								?.length ||
							0,
					})
				: runReport;
		setMigrationReports((current) => ({ ...current, dm4: report }));
		setWorkbookProgress((current) => ({
			...current,
			dm4: buildWorkbookProgressFromMigrationRunProgress(group, report),
		}));
		if (hasDm4ProofPayload(dm4RunProgressData.proof)) {
			setDm4ProofReport(dm4RunProgressData.proof);
		} else {
			setDm4ProofReport(null);
		}
		const reportEvents = report.events || [];
		const proofRowEvents = buildDm4ProofRowEvidenceEvents(
			dm4RunProgressData.proof,
			dm4RunProgressData.runId,
		);
		if (reportEvents.length > 0 || proofRowEvents.length > 0) {
			setWorkbookLiveEvents((current) => ({
				...current,
				dm4: [...proofRowEvents, ...reportEvents].slice(0, 200),
			}));
		}
	}, [dm4RunProgressData, latestDm4RunData?.sourceFilename, workbookGroups]);
	useEffect(() => {
		if (!dm4RunEventsData || dm4RunEventsData.length === 0) return;
		const mappedEvents: MigrationLiveEvent[] = dm4RunEventsData
			.slice()
			.reverse()
			.map((event) => ({
				id: event.id,
				at: event.timestamp,
				status: getWorkbookStatusFromRunEventStatus(event.status),
				sheetName:
					event.sourceSheet ||
					getDm4RunStepSheetName(event.stepCode || "", event.stepCode || ""),
				message: event.message,
				eventType: event.eventType,
				stepCode: event.stepCode,
				sourceRow: event.sourceRow,
				employeeId: event.employeeId,
				employeeName: event.employeeName,
				metadata: event.metadata,
			}));
		const proofRowEvents = buildDm4ProofRowEvidenceEvents(
			dm4RunProgressData?.proof || dm4ProofReport,
			effectiveDm4RunId,
		);
		setWorkbookLiveEvents((current) => ({
			...current,
			dm4: [...proofRowEvents, ...mappedEvents].slice(0, 200),
		}));
	}, [dm4ProofReport, dm4RunEventsData, dm4RunProgressData?.proof, effectiveDm4RunId]);

	// Durable DM4 runs can also run long — mirror progress into the same toast pattern.
	useEffect(() => {
		if (!dm4RunProgressData) return;
		syncDurableRunProgressToast("dm4", dm4RunProgressData);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- toast helpers are stable for this page lifecycle
	}, [dm4RunProgressData]);

	const dm4SourcePaths = parseDm4SourceFiles(dm4SourceFilesText);
	const storedActiveWorkbookReport =
		activeWorkbookGroup && migrationReports[activeWorkbookGroup.id]
			? normalizeWorkbookReportLifecycle(migrationReports[activeWorkbookGroup.id])
			: null;
	const storedActiveWorkbookStartedAtMs = getReportTimeMs(storedActiveWorkbookReport?.startedAt);
	const storedActiveWorkbookFinishedAtMs =
		getReportTimeMs(storedActiveWorkbookReport?.finishedAt) ||
		(storedActiveWorkbookStartedAtMs && storedActiveWorkbookReport?.elapsedMs
			? storedActiveWorkbookStartedAtMs + storedActiveWorkbookReport.elapsedMs
			: 0);
	const dm3DurableRunFallbackReport =
		activeWorkbookGroup?.id === "dm3" && effectiveDm3RunId
			? normalizeWorkbookReportLifecycle({
					runId: effectiveDm3RunId,
					workbookId: "dm3",
					workbookName: activeWorkbookGroup.fileName,
					sourceFilename:
						dm3EffectiveSourceFilename ||
						latestDm3RunData?.sourceFilename ||
						persistedDm3Report?.sourceFilename ||
						activeWorkbookGroup.fileName,
					startedAt:
						latestDm3RunData?.createdAt ||
						persistedDm3Report?.startedAt ||
						new Date().toISOString(),
					finishedAt: latestDm3RunData?.updatedAt || persistedDm3Report?.finishedAt,
					elapsedMs: persistedDm3Report?.elapsedMs || 0,
					status: getReportStatusFromRunStatus(
						latestDm3RunData?.status || persistedDm3Report?.status || "STALE",
					),
					sheets: persistedDm3Report?.sheets || [],
					events: persistedDm3Report?.events || [],
				})
			: null;
	const dm4ProofImportReport =
		activeWorkbookGroup?.id === "dm4" && hasDm4ProofPayload(dm4ProofReport)
			? buildDm4ProofImportReport({
					runId: storedActiveWorkbookReport?.runId || effectiveDm4RunId,
					proof: dm4ProofReport,
					startedAt:
						storedActiveWorkbookStartedAtMs ||
						dm4ProofRun.startedAt ||
						Date.now(),
					finishedAt:
						storedActiveWorkbookFinishedAtMs ||
						(dm4ProofRun.startedAt && dm4ProofRun.elapsedSeconds
							? dm4ProofRun.startedAt + dm4ProofRun.elapsedSeconds * 1000
							: Date.now()),
					sourceMode:
						dm4ProofReport.sourceMode ||
						dm4ProofRun.sourceMode ||
						"Server default config",
					sourceCount:
						dm4ProofReport.sourceWorkbookCount ||
						dm4ProofRun.sourceWorkbookCount ||
						dm4SourcePaths.length,
				})
			: null;
	const activeWorkbookReport = activeWorkbookGroup
		? activeWorkbookGroup.id === "dm4"
			? dm4ProofImportReport || storedActiveWorkbookReport
			: storedActiveWorkbookReport || dm3DurableRunFallbackReport
		: null;
	const activeWorkbookReportIsTerminal = isWorkbookReportTerminal(activeWorkbookReport?.status);
	const activeWorkbookReportErrors = activeWorkbookReport
		? activeWorkbookReport.sheets.flatMap((sheet) => sheet.errors)
		: [];
	const activeWorkbookLiveEvents = activeWorkbookGroup
		? [
				...(activeWorkbookReport?.events || []),
				...(workbookLiveEvents[activeWorkbookGroup.id] || []),
			]
				.filter(
					(event, index, events) =>
						events.findIndex(
							(candidate) =>
								candidate.id === event.id ||
								(candidate.at === event.at && candidate.message === event.message),
						) === index,
				)
				.sort((left, right) => {
					if (!["dm3", "dm4"].includes(activeWorkbookGroup.id)) return 0;
					const evidenceDelta =
						Number(isRowEvidenceEvent(right)) - Number(isRowEvidenceEvent(left));
					if (evidenceDelta !== 0) return evidenceDelta;
					return getReportTimeMs(right.at) - getReportTimeMs(left.at);
				})
				.slice(0, 200)
		: [];
	const activeWorkbookReportRows = activeWorkbookGroup
		? [
				...[...activeWorkbookGroup.steps, ...(activeWorkbookGroup.generatedSteps || [])].map((step) => {
					const progress = workbookProgress[activeWorkbookGroup.id]?.[step.id];
					if (
						!activeWorkbookReportIsTerminal &&
						progress &&
						["Checking", "Importing", "Finalizing"].includes(progress.status)
					) {
						return {
							sheetName: step.sheetName || step.label,
							target: step.target,
							status: progress.status,
							totalRows: progress.rowCount ?? 0,
							created: progress.created ?? 0,
							updated: progress.updated ?? 0,
							skipped: progress.skipped ?? 0,
							blocked: progress.blocked ?? 0,
							failed: progress.failed ?? 0,
							elapsedMs: 0,
							firstError: progress.message,
							errors: [],
						} satisfies MigrationReportSheet;
					}
					const completedSheet = activeWorkbookReport?.sheets.find(
						(sheet) =>
							normalizeSheetName(sheet.sheetName) ===
							normalizeSheetName(step.sheetName || step.label),
					);
					if (completedSheet) {
						return step.unavailable &&
							["Pending", "Skipped"].includes(completedSheet.status)
							? {
									...completedSheet,
									status: "Skipped" as const,
									totalRows: 0,
									skipped: 0,
									firstError: completedSheet.firstError || "Template only",
								}
							: completedSheet;
					}

					return {
						sheetName: step.sheetName || step.label,
						target: step.target,
						status: getTerminalSheetFallbackStatus(
							activeWorkbookReport,
							step,
							progress,
						),
						totalRows: progress?.rowCount ?? 0,
						created: progress?.created ?? 0,
						updated: progress?.updated ?? 0,
						skipped: progress?.skipped ?? 0,
						blocked: progress?.blocked ?? 0,
						failed: progress?.failed ?? 0,
						elapsedMs: 0,
						firstError: progress?.message,
						errors: [],
					} satisfies MigrationReportSheet;
				}),
				...(activeWorkbookReport?.sheets.filter((sheet) => {
					const sheetKey = normalizeSheetName(sheet.sheetName);
					return ![
						...activeWorkbookGroup.steps,
						...(activeWorkbookGroup.generatedSteps || []),
					].some(
						(step) => normalizeSheetName(step.sheetName || step.label) === sheetKey,
					);
				}) || []),
			]
		: [];
	const activeWorkbookSourceReportRows = activeWorkbookReportRows.filter(
		(sheet) => !DM3_GENERATED_SHEET_NAMES.has(normalizeSheetName(sheet.sheetName)),
	);
	const activeWorkbookGeneratedReportRows = activeWorkbookReportRows.filter((sheet) =>
		DM3_GENERATED_SHEET_NAMES.has(normalizeSheetName(sheet.sheetName)),
	);
	const activeWorkbookDisplayTotals = activeWorkbookReportRows.reduce(
		(totals, sheet) => ({
			totalRows: totals.totalRows + sheet.totalRows,
			created: totals.created + sheet.created,
			updated: totals.updated + sheet.updated,
			skipped: totals.skipped + sheet.skipped,
			blocked: totals.blocked + sheet.blocked,
			failed: totals.failed + sheet.failed,
		}),
		{ totalRows: 0, created: 0, updated: 0, skipped: 0, blocked: 0, failed: 0 },
	);
	const activeWorkbookSelectedFile = activeWorkbookGroup
		? selectedWorkbookFiles[activeWorkbookGroup.id]
		: null;
	const activeWorkbookResumeTarget = activeWorkbookGroup
		? importJobIdParam
			? {
					jobId: importJobIdParam,
					sheetName:
						activeWorkbookReport?.sheets.find(
							(sheet) => sheet.jobId === importJobIdParam,
						)?.sheetName ||
						(activeWorkbookGroup.id === "dm3" &&
						importJobIdParam.startsWith("dm3-post-actions-")
							? "Employee Post Actions"
							: activeWorkbookGroup.steps.find((step) => step.id === "employees")
									?.sheetName || "Employees"),
				}
			: getWorkbookResumeTarget(activeWorkbookGroup)
		: null;
	const activeWorkbookLifecycle = getWorkbookLifecycleState({
		report: activeWorkbookReport,
		progress:
			activeWorkbookGroup && !activeWorkbookReportIsTerminal
				? workbookProgress[activeWorkbookGroup.id]
				: undefined,
		resumeTarget: activeWorkbookResumeTarget,
		isOpen: Boolean(activeWorkbookGroup),
		hasSelectedFile: Boolean(activeWorkbookSelectedFile),
	});
	const activeWorkbookLifecycleView = getWorkbookLifecycleView(activeWorkbookLifecycle);
	const activeWorkbookPhase =
		activeWorkbookGroup && !activeWorkbookReportIsTerminal
			? [
					...activeWorkbookGroup.steps,
					...(activeWorkbookGroup.id === "dm3" &&
					activeWorkbookReport?.sheets.some(
						(sheet) =>
							isDm3PostActionsSheet(sheet.sheetName) &&
							["Finalizing", "Importing"].includes(sheet.status),
					)
						? [
								buildDm3PostActionsStep(
									activeWorkbookReport.sheets.find((sheet) =>
										isDm3PostActionsSheet(sheet.sheetName),
									)?.totalRows || 0,
								),
							]
						: []),
				]
					.map((step) => ({
						step,
						progress:
							workbookProgress[activeWorkbookGroup.id]?.[step.id] ||
							(activeWorkbookReport?.sheets.find(
								(sheet) =>
									normalizeSheetName(sheet.sheetName) ===
									normalizeSheetName(step.sheetName || step.label),
							)
								? {
										status: activeWorkbookReport.sheets.find(
											(sheet) =>
												normalizeSheetName(sheet.sheetName) ===
												normalizeSheetName(step.sheetName || step.label),
										)?.status,
										message: activeWorkbookReport.sheets.find(
											(sheet) =>
												normalizeSheetName(sheet.sheetName) ===
												normalizeSheetName(step.sheetName || step.label),
										)?.firstError,
									}
								: undefined),
					}))
					.find(({ progress }) =>
						["Checking", "Importing", "Finalizing"].includes(progress?.status || ""),
					)
			: null;
	const activeWorkbookBottomStatus: WorkbookSheetStatus =
		activeWorkbookReportIsTerminal
			? activeWorkbookLifecycleView.status
			: activeWorkbookGroup?.id === "dm4" && dm4ProofRun.status !== "idle"
			? getDm4ProofRunSheetStatus(dm4ProofRun.status)
			: activeWorkbookPhase?.progress?.status || activeWorkbookLifecycleView.status;
	const activeWorkbookBottomMessage = activeWorkbookPhase
		? `${activeWorkbookPhase.step.label}${
				activeWorkbookPhase.progress?.message
					? ` - ${activeWorkbookPhase.progress.message}`
					: ""
			}`
		: activeWorkbookReportIsTerminal
			? getWorkbookReportIssue(activeWorkbookReport) || activeWorkbookLifecycleView.message
			: activeWorkbookGroup?.id === "dm4" && dm4ProofRun.status !== "idle"
				? dm4ProofRun.error || dm4ProofRun.message
				: activeWorkbookLifecycleView.message;
	const dm4RetryableRunId =
		activeWorkbookGroup?.id === "dm4"
			? effectiveDm4RunId || latestDm4RunId || runIdParam || ""
			: "";
	const dm4RetryableStatus = String(
		dm4RunProgressData?.status || latestDm4RunData?.status || activeWorkbookReport?.status || "",
	).toUpperCase();
	const canRetryDm4Run =
		activeWorkbookGroup?.id === "dm4" &&
		Boolean(dm4RetryableRunId) &&
		["FAILED", "BLOCKED", "STALE"].includes(dm4RetryableStatus);
	useEffect(() => {
		if (activeWorkbookGroup?.id !== "dm4") return;
		if (!activeWorkbookReportIsTerminal || !activeWorkbookReport) return;
		if (dm4ProofRun.status !== "running") return;
		setDm4ProofRun((current) => ({
			...current,
			status:
				activeWorkbookReport.status === "completed"
					? "success"
					: activeWorkbookReport.status === "failed" ||
						  activeWorkbookReport.status === "blocked"
						? "error"
						: current.status,
			elapsedSeconds: Math.max(
				1,
				Math.floor((getWorkbookReportElapsedMs(activeWorkbookReport) || 0) / 1000),
			),
			message:
				activeWorkbookReport.status === "completed"
					? "DM4 proof imported. Counts and source-row evidence are ready below."
					: getWorkbookReportIssue(activeWorkbookReport) || current.message,
			error:
				activeWorkbookReport.status === "failed" || activeWorkbookReport.status === "blocked"
					? getWorkbookReportIssue(activeWorkbookReport) || current.error
					: undefined,
			phase: activeWorkbookReport.status === "completed" ? "Completed" : current.phase,
			progressPercent:
				activeWorkbookReport.status === "completed" ? 100 : current.progressPercent,
		}));
	}, [
		activeWorkbookGroup?.id,
		activeWorkbookReport,
		activeWorkbookReportIsTerminal,
		dm4ProofRun.status,
	]);
	useEffect(() => {
		const byWorkbook = persistedWorkbookReportsData?.byWorkbook || {};
		const reports = Object.entries(byWorkbook) as Array<[string, MigrationImportReport]>;
		if (reports.length === 0) return;

		setMigrationReports((current) => {
			const next = { ...current };
			let changed = false;
			for (const [workbookId, report] of reports) {
				const merged = normalizeWorkbookReportLifecycle(
					mergeMigrationReports(next[workbookId], report),
				);
				if (merged !== next[workbookId]) {
					next[workbookId] = merged;
					changed = true;
				}
			}
			return changed ? next : current;
		});
		setWorkbookProgress((current) => {
			const next = { ...current };
			let changed = false;
			for (const [workbookId, report] of reports) {
				const currentGroupProgress = Object.values(next[workbookId] || {});
				const isImportActive = currentGroupProgress.some((progress) =>
					["Checking", "Importing", "Finalizing"].includes(progress.status),
				);
				const normalizedReport = normalizeWorkbookReportLifecycle(report);
				const group = workbookGroups.find((candidate) => candidate.id === workbookId);
				if (!group) continue;
				if (isImportActive && !isWorkbookReportTerminal(normalizedReport.status)) continue;
				next[workbookId] = buildWorkbookProgressFromReport(group, normalizedReport);
				changed = true;
			}
			return changed ? next : current;
		});
		setWorkbookLiveEvents((current) => {
			const next = { ...current };
			let changed = false;
			for (const [workbookId, report] of reports) {
				if (!Array.isArray(report.events) || report.events.length === 0) continue;
				if ((next[workbookId] || []).length > 0) continue;
				next[workbookId] = report.events.slice(0, 10);
				changed = true;
			}
			return changed ? next : current;
		});
	}, [persistedWorkbookReportsData, workbookGroups]);

	useEffect(() => {
		if (!action || action === "import-employees") return;
		const owningGroup = workbookGroups.find((group) =>
			group.steps.some((step) => step.action === action),
		);
		if (!owningGroup) return;
		setGroupManualOpen((current) =>
			current[owningGroup.id] ? current : { ...current, [owningGroup.id]: true },
		);
	}, [action, workbookGroups]);

	const openImportModal = (nextAction: ImportAction) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.set("action", nextAction);
			if (nextAction === "import-employees") {
				next.set("importAutoCreate", "false");
			}
			return next;
		});
	};

	const openWorkbookPage = (groupId: string, options?: { upload?: boolean }) => {
		setActiveWorkbookGroupId(groupId);
		setSearchParams((prev) =>
			buildOpenWorkbookSearchParams(prev, groupId, { upload: options?.upload === true }),
		);
	};

	function getWorkbookResumeTarget(group: ImportWorkbookGroup) {
		const report = migrationReports[group.id];
		if (!report || normalizeWorkbookReportLifecycle(report).status !== "running") return null;
		const runningSheet = report.sheets.find(
			(sheet) => sheet.jobId && !isWorkbookSheetTerminal(sheet.status),
		);
		if (!runningSheet?.jobId) return null;
		return {
			jobId: runningSheet.jobId,
			sheetName: runningSheet.sheetName,
		};
	}

	const resumeWorkbookPage = (group: ImportWorkbookGroup) => {
		const resumeTarget = getWorkbookResumeTarget(group);
		setActiveWorkbookGroupId(group.id);
		setSearchParams((prev) =>
			buildOpenWorkbookSearchParams(prev, group.id, {
				importJobId: resumeTarget?.jobId || null,
			}),
		);
	};

	const closeWorkbookPage = () => {
		setActiveWorkbookGroupId(null);
		setDm3ActiveRunId(null);
		setSearchParams((prev) => buildCloseWorkbookSearchParams(prev));
	};

	const openWorkbookUploadModal = () => {
		setSearchParams((prev) => buildOpenWorkbookUploadSearchParams(prev));
	};

	const closeWorkbookUploadModal = () => {
		setSearchParams((prev) => buildCloseWorkbookUploadSearchParams(prev));
	};

	const isUploadModalOpen =
		Boolean(activeWorkbookGroup) &&
		activeWorkbookGroup?.id !== "dm4" &&
		isWorkbookUploadOpen(searchParams);

	const closeImportModal = () => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.delete("action");
			next.delete("importStep");
			next.delete("importAutoCreate");
			next.delete("importDefaultLeaveBalances");
			next.delete("importCreateTimesheets");
			return next;
		});
	};

	const showWorkbookImportProgressToast = (
		workbookId: string,
		options?: {
			runKey?: string | null;
			status?: string | null;
			description?: string | null;
		},
	) => {
		const toastId = getWorkbookImportProgressToastId(workbookId);
		const runKey = options?.runKey ?? "active";
		importProgressToastRunsRef.current[workbookId] = runKey;
		toast.loading(formatWorkbookImportProgressTitle(workbookId, options?.status || "RUNNING"), {
			id: toastId,
			description: options?.description || "Working…",
			duration: Infinity,
		});
	};

	const finishWorkbookImportProgressToast = (
		workbookId: string,
		outcome: "success" | "error",
		options?: {
			runKey?: string | null;
			status?: string | null;
			description?: string | null;
			title?: string | null;
		},
	) => {
		const toastId = getWorkbookImportProgressToastId(workbookId);
		const runKey = options?.runKey;
		if (
			runKey &&
			importProgressToastRunsRef.current[workbookId] &&
			importProgressToastRunsRef.current[workbookId] !== runKey
		) {
			return;
		}
		const title =
			options?.title ||
			formatWorkbookImportProgressTitle(
				workbookId,
				options?.status || (outcome === "success" ? "COMPLETED" : "FAILED"),
			);
		if (outcome === "success") {
			toast.success(title, {
				id: toastId,
				description: options?.description || undefined,
				duration: 6_000,
			});
		} else {
			toast.error(title, {
				id: toastId,
				description: options?.description || undefined,
				duration: 8_000,
			});
		}
		importProgressToastRunsRef.current[workbookId] = null;
	};

	const syncDurableRunProgressToast = (
		workbookId: string,
		progress:
			| MigrationRunProgress
			| MigrationRunProgressResponse["progress"]
			| null
			| undefined,
	) => {
		if (!progress?.runId && !(progress as MigrationRunProgress | undefined)?.status) return;
		const runId = String(
			(progress as MigrationRunProgress).runId ||
				(progress as { runId?: string }).runId ||
				"",
		);
		const status = String((progress as MigrationRunProgress).status || "");
		if (!status) return;

		const description = formatWorkbookImportProgressDescription(
			buildWorkbookImportProgressFromRun(progress as MigrationRunProgress),
		);

		if (!isMigrationRunStatusTerminal(status)) {
			// Keep toast alive for long durable runs (DM3/DM4) even after refresh.
			showWorkbookImportProgressToast(workbookId, {
				runKey: runId || "active",
				status,
				description,
			});
			return;
		}

		const tracked = importProgressToastRunsRef.current[workbookId];
		if (!tracked || (runId && tracked !== runId && tracked !== "active" && tracked !== "pending")) {
			// Historical terminal run on page load — do not flash a completion toast.
			return;
		}

		if (isMigrationRunStatusSuccess(status)) {
			finishWorkbookImportProgressToast(workbookId, "success", {
				runKey: tracked,
				status,
				description,
			});
			return;
		}

		finishWorkbookImportProgressToast(workbookId, "error", {
			runKey: tracked,
			status,
			description:
				(progress as MigrationRunProgress).latestEvent?.message ||
				description ||
				`${workbookId.toUpperCase()} import failed`,
		});
	};

	const setWorkbookStepProgress = (
		groupId: string,
		stepId: string,
		progress: WorkbookSheetProgress,
	) => {
		setWorkbookProgress((current) => ({
			...current,
			[groupId]: {
				...(current[groupId] || {}),
				[stepId]: progress,
			},
		}));
	};

	const appendWorkbookLiveEvent = (
		groupId: string,
		event: Omit<MigrationLiveEvent, "id" | "at">,
	) => {
		const nextEvent = {
			...event,
			id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
			at: new Date().toISOString(),
		};
		workbookLiveEventsRef.current = {
			...workbookLiveEventsRef.current,
			[groupId]: [nextEvent, ...(workbookLiveEventsRef.current[groupId] || [])].slice(0, 10),
		};
		setWorkbookLiveEvents((current) => ({
			...current,
			[groupId]: [nextEvent, ...(current[groupId] || [])].slice(0, 10),
		}));
		setMigrationReports((current) => {
			const report = current[groupId];
			if (!report) return current;
			return {
				...current,
				[groupId]: {
					...report,
					events: [nextEvent, ...(report.events || [])].slice(0, 10),
				},
			};
		});
	};

	const appendDm4ProofEventOnce = (key: string, event: Omit<MigrationLiveEvent, "id" | "at">) => {
		if (dm4ProofEventKeyRef.current === key) return;
		dm4ProofEventKeyRef.current = key;
		appendWorkbookLiveEvent("dm4", event);
	};

	const pollEmployeeImportJob = async (
		groupId: string,
		step: ImportStep,
		jobId: string,
		rowCount: number,
		onProgress?: (sheet: MigrationReportSheet, progress: any) => void,
	) => {
		let latestProgress: any = null;
		const startedAt = performance.now();
		const seenLiveLogKeys = new Set<string>();

		for (let attempt = 0; attempt < 1800; attempt += 1) {
			await new Promise((resolve) => window.setTimeout(resolve, 500));
			const response = await hrisApiClient.get<any>(`/api/employee/import/progress/${jobId}`);
			latestProgress = response?.data?.data || response?.data || response;
			const processed = Number(latestProgress?.processed || 0);
			const total = Number(latestProgress?.total || rowCount || 0);
			const success = Number(latestProgress?.success || latestProgress?.created || 0);
			const failed = Number(latestProgress?.failed || latestProgress?.blocked || 0);
			const displayStatus = getEmployeeImportProgressStatus(latestProgress);
			const progressMessage = getEmployeeImportProgressMessage({
				...latestProgress,
				total,
				processed,
			});
			const recentLogs = Array.isArray(latestProgress?.recentLog)
				? latestProgress.recentLog
				: [];
			const lastLog = recentLogs[recentLogs.length - 1] || null;
			setWorkbookStepProgress(groupId, step.id, {
				status: displayStatus,
				rowCount: total,
				processed,
				created: success,
				updated: Number(latestProgress?.updated || 0),
				skipped: Number(latestProgress?.skipped || 0),
				blocked: Number(latestProgress?.blocked || failed || 0),
				failed,
				message: progressMessage,
			});
			const unseenLogs = recentLogs.filter((entry: any) => {
				const key = [
					entry.createdAt,
					entry.row,
					entry.employeeId,
					entry.fullName,
					entry.message,
				]
					.filter(Boolean)
					.join("|");
				if (!key || seenLiveLogKeys.has(key)) return false;
				seenLiveLogKeys.add(key);
				return true;
			});
			if (unseenLogs.length > 0) {
				for (const entry of unseenLogs.slice(-5)) {
					const label = [
						typeof entry.row === "number" && entry.row > 0 ? `Row ${entry.row}` : "",
						[entry.employeeId, entry.fullName].filter(Boolean).join(" - "),
					]
						.filter(Boolean)
						.join(" - ");
					appendWorkbookLiveEvent(groupId, {
						sheetName: step.sheetName || step.label,
						status: displayStatus,
						message: label
							? `${label}: ${entry.message || "Checked"}`
							: entry.message || progressMessage,
						rowCount: total,
					});
				}
			} else if (!lastLog && attempt % 20 === 0) {
				appendWorkbookLiveEvent(groupId, {
					sheetName: step.sheetName || step.label,
					status: displayStatus,
					message:
						failed > 0
							? `${step.label}: ${processed.toLocaleString()} checked, ${failed.toLocaleString()} failed`
							: `${step.label}: ${progressMessage}`,
					rowCount: total,
				});
			}

			if (
				onProgress &&
				(attempt === 0 ||
					attempt % 10 === 0 ||
					latestProgress?.status === "completed" ||
					latestProgress?.status === "failed")
			) {
				onProgress(
					buildReportSheetFromEmployeeProgress(
						step,
						rowCount,
						{
							...latestProgress,
							total,
							processed,
						},
						performance.now() - startedAt,
					),
					latestProgress,
				);
			}

			if (latestProgress?.status === "completed" || latestProgress?.status === "failed") {
				return buildReportSheetFromEmployeeProgress(
					step,
					rowCount,
					latestProgress,
					performance.now() - startedAt,
				);
			}
		}

		throw new Error("Employee import progress timed out.");
	};

	const pollDm3PostActionsJob = async (
		groupId: string,
		step: ImportStep,
		jobId: string,
		rowCount: number,
		startedAtMs: number,
	) => {
		for (let attempt = 0; attempt < 1800; attempt += 1) {
			await new Promise((resolve) => window.setTimeout(resolve, 1_000));
			const response = await hrisApiClient.get<any>(
				`/api/migration/dm3/employee-post-actions/jobs/${jobId}`,
			);
			const responsePayload = response as any;
			const job = (responsePayload?.data?.job ||
				responsePayload?.data?.data?.job ||
				responsePayload?.job) as Dm3PostActionsJob | undefined;
			if (!job) throw new Error("DM3 employee post-actions job response was empty.");
			const displayStatus: WorkbookSheetStatus =
				job.status === "completed"
					? Number(job.summary?.failed || job.summary?.blocked || 0) > 0
						? "Failed"
						: "Imported"
					: job.status === "failed"
						? "Failed"
						: "Finalizing";
			setWorkbookStepProgress(groupId, step.id, {
				status: displayStatus,
				rowCount: Number(job.summary?.total || job.total || rowCount || 0),
				processed: Number(job.processed || 0),
				created: Number(job.summary?.created || 0),
				updated: Number(job.summary?.updated || 0),
				skipped: Number(job.summary?.skipped || 0),
				blocked: Number(job.summary?.blocked || 0),
				failed: Number(job.summary?.failed || 0),
				message: job.message,
			});
			appendWorkbookLiveEvent(groupId, {
				sheetName: step.sheetName || step.label,
				status: displayStatus,
				message: job.message || "Employee post-actions are running",
				rowCount: Number(job.summary?.total || job.total || rowCount || 0),
			});
			if (job.status === "completed" || job.status === "failed") {
				return buildReportSheetFromDm3PostActionsJob(
					step,
					rowCount,
					job,
					performance.now() - startedAtMs,
				);
			}
		}
		throw new Error("Employee post-actions polling timed out.");
	};

	useEffect(() => {
		if (!workbookParam || !importJobIdParam) return;
		const group = workbookGroups.find((candidate) => candidate.id === workbookParam);
		if (!group) return;
		const existingReport = migrationReports[group.id];
		const existingSheetForJob = existingReport?.sheets.find(
			(sheet) => sheet.jobId === importJobIdParam,
		);
		const isPostActionsJob =
			group.id === "dm3" &&
			(isDm3PostActionsSheet(existingSheetForJob?.sheetName) ||
				importJobIdParam.startsWith("dm3-post-actions-"));
		const step = isPostActionsJob
			? buildDm3PostActionsStep(existingSheetForJob?.totalRows || 0)
			: group.steps.find((candidate) => candidate.id === "employees");
		if (!step) return;

		const resumeKey = `url:${group.id}:${step.id}:${importJobIdParam}`;
		if (resumedWorkbookJobRefs.current.has(resumeKey)) return;
		resumedWorkbookJobRefs.current.add(resumeKey);

		const existingSheet = existingReport?.sheets.find(
			(sheet) =>
				normalizeSheetName(sheet.sheetName) ===
				normalizeSheetName(step.sheetName || step.label),
		);
		if (
			existingReport &&
			isWorkbookReportTerminal(normalizeWorkbookReportLifecycle(existingReport).status) &&
			existingSheet &&
			isWorkbookSheetTerminal(existingSheet.status)
		) {
			return;
		}
		const startedAt = existingReport?.startedAt || new Date().toISOString();
		const report: MigrationImportReport = existingReport || {
			runId: `resume-${importJobIdParam}`,
			workbookId: group.id,
			workbookName: group.title,
			sourceFilename: group.fileName,
			organizationId,
			startedAt,
			status: "running",
			sheets: [],
			events: [],
		};
		const rowCount = existingSheet?.totalRows || 0;

		appendWorkbookLiveEvent(group.id, {
			sheetName: step.sheetName || step.label,
			status: "Importing",
			message: `Resuming ${step.label} job from URL: ${importJobIdParam}`,
			rowCount,
		});

		const pollJob = isPostActionsJob
			? pollDm3PostActionsJob(group.id, step, importJobIdParam, rowCount, performance.now())
			: pollEmployeeImportJob(group.id, step, importJobIdParam, rowCount, (sheetProgress) => {
					const progressReport = normalizeWorkbookReportLifecycle(
						upsertReportSheet(report, sheetProgress),
					);
					setMigrationReports((current) => ({
						...current,
						[group.id]: mergeMigrationReports(current[group.id], progressReport),
					}));
					void logWorkbookAudit({
						event: "sheet",
						report: progressReport,
						sheet: sheetProgress,
					});
				});

		void pollJob
			.then(async (sheetReport) => {
				let nextReport = normalizeWorkbookReportLifecycle(
					upsertReportSheet(report, sheetReport),
				);
				if (isPostActionsJob) {
					nextReport = completeUnresolvedWorkbookSheets(group, nextReport);
					nextReport = normalizeWorkbookReportLifecycle({
						...nextReport,
						status: nextReport.sheets.some(
							(sheet) =>
								sheet.status === "Failed" ||
								sheet.status === "Blocked" ||
								sheet.status === "Needs recovery",
						)
							? "failed"
							: "completed",
						finishedAt: new Date().toISOString(),
					});
				}
				setMigrationReports((current) => ({
					...current,
					[group.id]: mergeMigrationReports(current[group.id], nextReport),
				}));
				setWorkbookStepProgress(group.id, step.id, {
					status: sheetReport.status,
					rowCount: sheetReport.totalRows,
					created: sheetReport.created,
					updated: sheetReport.updated,
					skipped: sheetReport.skipped,
					blocked: sheetReport.blocked,
					failed: sheetReport.failed,
					message:
						sheetReport.firstError ||
						(sheetReport.status === "Imported" ? "Import completed" : undefined),
				});
				void logWorkbookAudit({ event: "sheet", report: nextReport, sheet: sheetReport });
				if (nextReport.status !== "running") {
					await refreshCounts();
					void logWorkbookAudit({ event: "end", report: nextReport });
				}
			})
			.catch((error: any) => {
				const blockedSheet: MigrationReportSheet = {
					sheetName: step.sheetName || step.label,
					target: step.target,
					status: "Blocked",
					jobId: importJobIdParam,
					totalRows: rowCount,
					created: existingSheet?.created || 0,
					updated: existingSheet?.updated || 0,
					skipped: existingSheet?.skipped || 0,
					blocked: Math.max(1, Number(existingSheet?.blocked || 0)),
					failed: existingSheet?.failed || 0,
					elapsedMs: 0,
					firstError:
						error?.message ||
						"Job status is no longer available. Check the latest report or rerun import.",
					errors: [
						{
							sheetName: step.sheetName || step.label,
							row: null,
							field: "jobId",
							status: "blocked",
							message:
								error?.message ||
								"Job status is no longer available. Check the latest report or rerun import.",
						},
					],
				};
				const blockedReport = normalizeWorkbookReportLifecycle({
					...upsertReportSheet(report, blockedSheet),
					status: "blocked",
					finishedAt: new Date().toISOString(),
				});
				setMigrationReports((current) => ({ ...current, [group.id]: blockedReport }));
				setWorkbookStepProgress(group.id, step.id, {
					status: "Blocked",
					rowCount: blockedSheet.totalRows,
					created: blockedSheet.created,
					updated: blockedSheet.updated,
					skipped: blockedSheet.skipped,
					blocked: blockedSheet.blocked,
					failed: blockedSheet.failed,
					message: blockedSheet.firstError,
				});
				appendWorkbookLiveEvent(group.id, {
					sheetName: step.sheetName || step.label,
					status: "Blocked",
					message: blockedSheet.firstError || "Job status unavailable",
					rowCount: blockedSheet.totalRows,
				});
				void logWorkbookAudit({ event: "end", report: blockedReport, sheet: blockedSheet });
			});
	}, [importJobIdParam, migrationReports, organizationId, workbookGroups, workbookParam]);

	useEffect(() => {
		for (const group of workbookGroups) {
			const report = migrationReports[group.id];
			if (!report || normalizeWorkbookReportLifecycle(report).status !== "running") continue;

			const dm3PostActionsSheet =
				group.id === "dm3"
					? report.sheets.find(
							(sheet) =>
								isDm3PostActionsSheet(sheet.sheetName) &&
								sheet.jobId &&
								!isWorkbookSheetTerminal(sheet.status),
						)
					: null;
			const resumableSteps = dm3PostActionsSheet
				? [...group.steps, buildDm3PostActionsStep(dm3PostActionsSheet.totalRows)]
				: group.steps;

			for (const step of resumableSteps) {
				const sheet = report.sheets.find(
					(candidate) =>
						normalizeSheetName(candidate.sheetName) ===
						normalizeSheetName(step.sheetName || step.label),
				);
				if (!sheet?.jobId || isWorkbookSheetTerminal(sheet.status)) continue;

				const resumeKey = `${report.runId}:${step.id}:${sheet.jobId}`;
				if (resumedWorkbookJobRefs.current.has(resumeKey)) continue;
				resumedWorkbookJobRefs.current.add(resumeKey);

				appendWorkbookLiveEvent(group.id, {
					sheetName: step.sheetName || step.label,
					status: "Importing",
					message: `Resuming ${step.label} job status`,
					rowCount: sheet.totalRows,
				});

				const isPostActionsJob =
					group.id === "dm3" && isDm3PostActionsSheet(sheet.sheetName);
				const pollJob = isPostActionsJob
					? pollDm3PostActionsJob(
							group.id,
							step,
							sheet.jobId,
							sheet.totalRows,
							performance.now(),
						)
					: pollEmployeeImportJob(
							group.id,
							step,
							sheet.jobId,
							sheet.totalRows,
							(sheetProgress) => {
								const progressReport = normalizeWorkbookReportLifecycle(
									upsertReportSheet(report, sheetProgress),
								);
								setMigrationReports((current) => ({
									...current,
									[group.id]: mergeMigrationReports(
										current[group.id],
										progressReport,
									),
								}));
								void logWorkbookAudit({
									event: "sheet",
									report: progressReport,
									sheet: sheetProgress,
								});
							},
						);

				void pollJob
					.then(async (sheetReport) => {
						let nextReport = normalizeWorkbookReportLifecycle(
							upsertReportSheet(report, sheetReport),
						);
						if (isPostActionsJob) {
							nextReport = completeUnresolvedWorkbookSheets(group, nextReport);
							nextReport = normalizeWorkbookReportLifecycle({
								...nextReport,
								status: nextReport.sheets.some(
									(sheet) =>
										sheet.status === "Failed" ||
										sheet.status === "Blocked" ||
										sheet.status === "Needs recovery",
								)
									? "failed"
									: "completed",
								finishedAt: new Date().toISOString(),
							});
						}
						setMigrationReports((current) => ({
							...current,
							[group.id]: mergeMigrationReports(current[group.id], nextReport),
						}));
						setWorkbookStepProgress(group.id, step.id, {
							status: sheetReport.status,
							rowCount: sheetReport.totalRows,
							created: sheetReport.created,
							updated: sheetReport.updated,
							skipped: sheetReport.skipped,
							blocked: sheetReport.blocked,
							failed: sheetReport.failed,
							message:
								sheetReport.firstError ||
								(sheetReport.status === "Imported"
									? "Import completed"
									: undefined),
						});
						void logWorkbookAudit({
							event: "sheet",
							report: nextReport,
							sheet: sheetReport,
						});
						if (nextReport.status !== "running") {
							await refreshCounts();
							void logWorkbookAudit({ event: "end", report: nextReport });
						}
					})
					.catch((error: any) => {
						const blockedSheet: MigrationReportSheet = {
							...sheet,
							status: "Blocked",
							blocked: Math.max(1, Number(sheet.blocked || 0)),
							failed: Number(sheet.failed || 0),
							firstError:
								error?.message ||
								"Job status is no longer available. Check the latest report or rerun import.",
							errors: [
								...(sheet.errors || []),
								{
									sheetName: sheet.sheetName,
									row: null,
									field: "jobId",
									status: "blocked",
									message:
										error?.message ||
										"Job status is no longer available. Check the latest report or rerun import.",
								},
							],
						};
						const blockedReport = normalizeWorkbookReportLifecycle({
							...upsertReportSheet(report, blockedSheet),
							status: "blocked",
							finishedAt: new Date().toISOString(),
						});
						setMigrationReports((current) => ({
							...current,
							[group.id]: blockedReport,
						}));
						setWorkbookStepProgress(group.id, step.id, {
							status: "Blocked",
							rowCount: blockedSheet.totalRows,
							created: blockedSheet.created,
							updated: blockedSheet.updated,
							skipped: blockedSheet.skipped,
							blocked: blockedSheet.blocked,
							failed: blockedSheet.failed,
							message: blockedSheet.firstError,
						});
						appendWorkbookLiveEvent(group.id, {
							sheetName: step.sheetName || step.label,
							status: "Blocked",
							message: blockedSheet.firstError || "Job status unavailable",
							rowCount: blockedSheet.totalRows,
						});
						void logWorkbookAudit({
							event: "end",
							report: blockedReport,
							sheet: blockedSheet,
						});
					});
			}
		}
	}, [migrationReports, workbookGroups]);

	const getStepImporter = (stepId: string) => {
		const importers: Record<string, (file: File) => Promise<any>> = {
			departments: (file) => importDepartments.mutateAsync(file),
			sections: (file) => importSections.mutateAsync(file),
			positions: (file) => importPositions.mutateAsync(file),
			levels: (file) => importLevels.mutateAsync(file),
			"shift-types": (file) => importShiftTypes.mutateAsync(file),
			agencies: (file) => importAgencies.mutateAsync(file),
			holidays: (file) => importHolidays.mutateAsync(file),
			"leave-types": (file) => importLeaveTypes.mutateAsync(file),
			"benefit-types": (file) => importBenefitTypes.mutateAsync(file),
			"loan-types": (file) => importLoanTypes.mutateAsync(file),
			employees: (file) =>
				importEmployees.mutateAsync({
					file,
					options: {
						autoCreate: false,
						importMode: "full",
						enableAccountProvisioning: true,
						enableCredentialEmails: false,
						enablePostActions: false,
					},
				}),
			"employee-schedules": (file) => {
				const formData = new FormData();
				formData.append("file", file);
				formData.append("data", JSON.stringify({ organizationId }));
				return hrisApiClient.post(
					"/api/migration/dm3/import-employee-schedules",
					formData,
					{
						timeoutMs: 300_000,
					},
				);
			},
			"reporting-lines": (file) => {
				const formData = new FormData();
				formData.append("file", file);
				formData.append("data", JSON.stringify({ organizationId }));
				return hrisApiClient.post(
					"/api/migration/dm3/import-reporting-lines",
					formData,
					{
						timeoutMs: 300_000,
					},
				);
			},
			"employee-documents": (file) => {
				const formData = new FormData();
				formData.append("file", file);
				formData.append("data", JSON.stringify({ organizationId }));
				return hrisApiClient.post(
					"/api/migration/dm3/import-employee-documents",
					formData,
					{
						timeoutMs: 300_000,
					},
				);
			},
			"opening-leave-balances": (file) => {
				const formData = new FormData();
				formData.append("file", file);
				formData.append("data", JSON.stringify({ organizationId }));
				return hrisApiClient.post(
					"/api/migration/dm3/import-opening-leave-balances",
					formData,
					{ timeoutMs: 300_000 },
				);
			},
			"employee-benefits-loans": (file) => {
				const formData = new FormData();
				formData.append("file", file);
				formData.append("data", JSON.stringify({ organizationId }));
				return hrisApiClient.post(
					"/api/migration/dm3/import-employee-benefits-loans",
					formData,
					{ timeoutMs: 300_000 },
				);
			},
			"employee-post-actions": (file) => {
				const formData = new FormData();
				formData.append("file", file);
				formData.append("data", JSON.stringify({ organizationId }));
				return hrisApiClient.post("/api/migration/dm3/finalize-employee-import", formData, {
					timeoutMs: 300_000,
				});
			},
		};
		return importers[stepId];
	};

	const recoverDm3PostActions = async (
		group: ImportWorkbookGroup,
		sourceReport?: MigrationImportReport | null,
	) => {
		if (group.id !== "dm3" || recoveringDm3PostActions) return;
		const startedAtMs = performance.now();
		const startedAt = new Date().toISOString();
		const baseReport = sourceReport ||
			migrationReports[group.id] || {
				runId: `dm3-recovery-${Date.now()}`,
				workbookId: group.id,
				workbookName: group.title,
				sourceFilename: group.fileName,
				actorUserId: String((user as any)?.id || (user as any)?.userId || ""),
				organizationId,
				startedAt,
				status: "running" as const,
				sheets: [],
				events: [],
			};
		const recoveryRunId = baseReport.runId || `dm3-recovery-${Date.now()}`;
		const reportBase: MigrationImportReport = {
			...baseReport,
			runId: recoveryRunId,
			status: "running",
			finishedAt: undefined,
		};
		const recoveryStep: ImportStep = {
			id: "employee-post-actions",
			label: "Employee post-actions",
			fileName: "employees-import.csv",
			target: "Employee post-action",
			sheetName: "Employee Post Actions",
			countLabelSingular: "employee",
			countLabelPlural: "employees",
			count: 0,
			icon: Users,
		};

		setRecoveringDm3PostActions(true);
		setWorkbookStepProgress(group.id, recoveryStep.id, {
			status: "Finalizing",
			message: "Recovering post-actions from persisted DM3 employee records",
		});
		appendWorkbookLiveEvent(group.id, {
			sheetName: recoveryStep.sheetName,
			status: "Finalizing",
			message: "Recovering DM3 post-actions from persisted employee records",
		});
		setMigrationReports((current) => ({
			...current,
			[group.id]: mergeMigrationReports(current[group.id], reportBase),
		}));

		try {
			const response = await hrisApiClient.post(
				"/api/migration/dm3/recover-employee-post-actions",
				{
					organizationId,
					sourceFilename: baseReport.sourceFilename,
					runId: recoveryRunId,
				},
				{ timeoutMs: 300_000 } as any,
			);
			const result: any = response?.data || response;
			const recoveryJob = getDm3PostActionsJobFromResult(result);
			const rowCount = Number(
				recoveryJob?.total ||
					getSummaryFromImportResult(result)?.total ||
					getSummaryFromImportResult(result)?.created ||
					0,
			);
			const sheetReport = recoveryJob?.id
				? await pollDm3PostActionsJob(
						group.id,
						recoveryStep,
						recoveryJob.id,
						rowCount,
						startedAtMs,
					)
				: buildReportSheetFromResult(
						recoveryStep,
						rowCount,
						result,
						performance.now() - startedAtMs,
					);
			const recoveredSheets = reportBase.sheets.map((sheet) => {
				const staleJobMessage = [
					sheet.firstError,
					...(sheet.errors || []).map((error) => error.message),
				]
					.filter(Boolean)
					.join(" ")
					.toLowerCase();
				const isUnavailableEmployeeJob =
					normalizeSheetName(sheet.sheetName) === normalizeSheetName("Employees") &&
					sheet.jobId &&
					(sheet.status === "Blocked" ||
						staleJobMessage.includes("no active pollable job") ||
						staleJobMessage.includes("job status") ||
						staleJobMessage.includes("server restart") ||
						String(sheet.firstError || "")
							.toLowerCase()
							.includes("job status"));
				return isUnavailableEmployeeJob
					? {
							...sheet,
							status: "Imported" as const,
							blocked: 0,
							failed: 0,
							firstError:
								"Recovered from persisted DM3 employee records after job status became unavailable.",
							errors: [],
						}
					: sheet;
			});
			let nextReport = upsertReportSheet(
				{
					...reportBase,
					sheets: recoveredSheets,
				},
				sheetReport,
			);
			nextReport = completeUnresolvedWorkbookSheets(group, nextReport);
			nextReport = normalizeWorkbookReportLifecycle({
				...nextReport,
				status: nextReport.sheets.some(
					(sheet) =>
						sheet.status === "Failed" ||
						sheet.status === "Blocked" ||
						sheet.status === "Needs recovery",
				)
					? "failed"
					: "completed",
				finishedAt: new Date().toISOString(),
				elapsedMs: performance.now() - startedAtMs,
			});
			setMigrationReports((current) => ({
				...current,
				[group.id]: mergeMigrationReports(current[group.id], nextReport),
			}));
			setWorkbookProgress((current) => ({
				...current,
				[group.id]: buildWorkbookProgressFromReport(group, nextReport),
			}));
			const responseEvents = (recoveryJob?.events ||
				result?.data?.events ||
				result?.data?.data?.events ||
				[]) as any[];
			for (const event of responseEvents.slice(-5)) {
				appendWorkbookLiveEvent(group.id, {
					sheetName: recoveryStep.sheetName,
					status: sheetReport.status,
					message: event?.message || `${event?.employeeId || "Employee"} recovered`,
				});
			}
			appendWorkbookLiveEvent(group.id, {
				sheetName: recoveryStep.sheetName,
				status: sheetReport.status,
				message:
					sheetReport.status === "Imported"
						? "DM3 post-actions and attendance obligations recovered"
						: sheetReport.firstError || "DM3 recovery completed with issues",
				rowCount,
			});
			await logWorkbookAudit({ event: "sheet", report: nextReport, sheet: sheetReport });
			await logWorkbookAudit({ event: "end", report: nextReport });
			await refreshCounts();
			toast.success("DM3 recovery finished");
		} catch (error: any) {
			const blockedSheet: MigrationReportSheet = {
				sheetName: recoveryStep.sheetName || recoveryStep.label,
				target: recoveryStep.target,
				status: "Blocked",
				totalRows: 0,
				created: 0,
				updated: 0,
				skipped: 0,
				blocked: 1,
				failed: 1,
				elapsedMs: performance.now() - startedAtMs,
				firstError: error?.message || "DM3 recovery failed",
				errors: [
					{
						sheetName: recoveryStep.sheetName || recoveryStep.label,
						row: null,
						field: "recovery",
						status: "blocked",
						message: error?.message || "DM3 recovery failed",
					},
				],
			};
			const blockedReport = normalizeWorkbookReportLifecycle({
				...upsertReportSheet(reportBase, blockedSheet),
				status: "blocked",
				finishedAt: new Date().toISOString(),
			});
			setMigrationReports((current) => ({ ...current, [group.id]: blockedReport }));
			setWorkbookProgress((current) => ({
				...current,
				[group.id]: buildWorkbookProgressFromReport(group, blockedReport),
			}));
			appendWorkbookLiveEvent(group.id, {
				sheetName: recoveryStep.sheetName,
				status: "Blocked",
				message: blockedSheet.firstError || "DM3 recovery failed",
			});
			await logWorkbookAudit({ event: "end", report: blockedReport, sheet: blockedSheet });
			toast.error(error?.message || "DM3 recovery failed");
		} finally {
			setRecoveringDm3PostActions(false);
		}
	};

	const refreshCounts = async () => {
		await queryClient.invalidateQueries({ queryKey: ["departments"] });
		await queryClient.invalidateQueries({ queryKey: ["sections"] });
		await queryClient.invalidateQueries({ queryKey: ["positions"] });
		await queryClient.invalidateQueries({ queryKey: ["levels"] });
		await queryClient.invalidateQueries({ queryKey: ["shiftTypes"] });
		await queryClient.invalidateQueries({ queryKey: ["calendar-items"] });
		await queryClient.invalidateQueries({ queryKey: ["leave-types"] });
		await queryClient.invalidateQueries({ queryKey: ["benefitTypes"] });
		await queryClient.invalidateQueries({ queryKey: ["employees"] });
		await queryClient.invalidateQueries({ queryKey: ["agencies"] });
		await queryClient.invalidateQueries({ queryKey: ["loanTypes"] });
		await queryClient.invalidateQueries({ queryKey: ["document-types"] });
		await queryClient.invalidateQueries({ queryKey: ["attendances"] });
		await queryClient.invalidateQueries({ queryKey: ["timesheets"] });
	};

	const handleMigrationReportDownload = async (report: MigrationImportReport) => {
		if (!report.runId || downloadingReportRunIds.has(report.runId)) return;
		setDownloadingReportRunIds((current) => {
			const next = new Set(current);
			next.add(report.runId);
			return next;
		});
		try {
			await downloadMigrationReport(report);
		} finally {
			setDownloadingReportRunIds((current) => {
				const next = new Set(current);
				next.delete(report.runId);
				return next;
			});
		}
	};

	const downloadWorkbookTemplate = async (group: ImportWorkbookGroup) => {
		if (downloadingTemplateWorkbookId === group.id) return;
		setDownloadingTemplateWorkbookId(group.id);
		try {
			const blob = await hrisApiClient.getBlob(
				`/api/migration/workbook-template/${encodeURIComponent(group.fileName)}`,
			);
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = group.fileName;
			link.click();
			window.URL.revokeObjectURL(url);
		} catch (error: any) {
			toast.error(error?.message || "Failed to download workbook template");
		} finally {
			setDownloadingTemplateWorkbookId(null);
		}
	};

	const downloadSourceInput = async (source: MigrationSourceInput) => {
		if (!source.downloadable) return;
		try {
			const blob = await hrisApiClient.getBlob(
				`/api/migration/source-inputs/${encodeURIComponent(source.id)}/download`,
			);
			downloadBlob(blob, source.fileName || `${source.id}.download`);
		} catch (error: any) {
			toast.error(error?.message || "Source input download is unavailable");
		}
	};

	const buildDm4RunSnapshotFromRunProgress = (
		progress: MigrationRunProgressResponse["progress"],
		fallback: {
			runId: string;
			startedAt: number;
			sourceFiles: string[];
			sourceMode: string;
		},
	): Dm4RunSnapshot | null => {
		if (!progress) return null;
		const status = String(progress.status || "").toUpperCase();
		const proof = progress.proof || null;
		const materialization = getDm4TimesheetMaterialization(proof);
		const progressStartedAtMs = getReportTimeMs(progress.startedAt) || fallback.startedAt;
		const progressFinishedAtMs =
			getReportTimeMs(progress.finishedAt) ||
			(typeof progress.durationMs === "number" && Number.isFinite(progress.durationMs)
				? progressStartedAtMs + progress.durationMs
				: 0);
		const elapsedSeconds =
			typeof progress.durationMs === "number" && Number.isFinite(progress.durationMs)
				? Math.max(0, Math.floor(progress.durationMs / 1000))
				: progressFinishedAtMs > 0
					? Math.max(0, Math.floor((progressFinishedAtMs - progressStartedAtMs) / 1000))
					: Math.max(1, Math.floor((Date.now() - progressStartedAtMs) / 1000));
		const sourceWorkbookFiles =
			(proof?.sourceWorkbookFiles as string[] | undefined) ||
			(progress.summary?.sourceWorkbookFiles as string[] | undefined) ||
			fallback.sourceFiles;
		const sourceWorkbookCount =
			proof?.sourceWorkbookCount ||
			sourceWorkbookFiles?.length ||
			Number(progress.summary?.sourceWorkbookCount || 0);
		const completedSteps = Number(progress.parentProgress?.completedSteps || 0);
		const totalSteps = Math.max(1, Number(progress.parentProgress?.totalSteps || 1));
		const percent =
			status === "COMPLETED" || status === "COMPLETED_WITH_WARNINGS"
				? 100
				: status === "FAILED" || status === "BLOCKED" || status === "STALE"
					? 100
					: Math.min(95, Math.max(5, Math.round((completedSteps / totalSteps) * 100)));

		return {
			id: fallback.runId,
			status:
				status === "COMPLETED" || status === "COMPLETED_WITH_WARNINGS"
					? "completed"
					: status === "FAILED" || status === "BLOCKED" || status === "STALE"
						? "failed"
						: "running",
			startedAt: new Date(progressStartedAtMs).toISOString(),
			finishedAt:
				status === "COMPLETED" || status === "COMPLETED_WITH_WARNINGS"
					? new Date(progressFinishedAtMs || Date.now()).toISOString()
					: undefined,
			message:
				progress.latestEvent?.message ||
				progress.currentStepLabel ||
				"DM4 durable migration run is processing.",
			sourceMode: fallback.sourceMode,
			sourceFiles: fallback.sourceFiles,
			sourceWorkbookFiles,
			sourceWorkbookCount,
			proof: proof || undefined,
			timesheetMaterialization: materialization,
			phase: progress.currentStepLabel || status || "Running",
			progress: {
				phase: progress.currentStepLabel || status || "Running",
				percent,
				elapsedSeconds,
				sourceWorkbookCount,
				attendanceRowsFound: proof?.phase3DbProof?.attendanceRowsFound,
				timesheetlineRowsFound: proof?.phase3DbProof?.timesheetlineRowsFound,
				materializedMissingLines: materialization?.materializedMissingLines,
			},
			error:
				status === "FAILED" || status === "BLOCKED" || status === "STALE"
					? progress.latestEvent?.message ||
						progress.steps?.find((step) => step.blockerReason)?.blockerReason ||
						`DM4 migration run ${status.toLowerCase()}.`
					: undefined,
		};
	};

	const applyCompletedDm4RunSnapshot = async ({
		completedJob,
		startedAt,
		sourceFiles,
	}: {
		completedJob: Dm4RunSnapshot;
		startedAt: number;
		sourceFiles: string[];
	}) => {
		const proof = completedJob.proof || null;
		if (!proof) {
			throw new Error("DM4 proof report was not returned.");
		}
		const finishedAt = Date.now();
		const sourceMode = formatDm4SourceMode(completedJob.sourceMode);
		const sourceWorkbookCount =
			completedJob.sourceWorkbookCount ??
			completedJob.sourceWorkbookFiles?.length ??
			proof.phase1Selection?.sourceFilesScanned ??
			0;
		const normalizedProof = {
			...proof,
			sourceMode,
			sourceWorkbookFiles: completedJob.sourceWorkbookFiles || proof.sourceWorkbookFiles,
			sourceWorkbookCount,
			timesheetMaterialization:
				completedJob.timesheetMaterialization || getDm4TimesheetMaterialization(proof),
		};
		setDm4ProofReport(normalizedProof);
		const dm4Report = buildDm4ProofImportReport({
			runId: completedJob.id,
			proof: normalizedProof,
			startedAt,
			finishedAt,
			sourceMode,
			sourceCount: sourceWorkbookCount,
		});
		setMigrationReports((current) => ({ ...current, dm4: dm4Report }));
		setWorkbookProgress((current) => ({
			...current,
			dm4: {
				...(current.dm4 || {}),
				...buildWorkbookProgressFromReport(
					workbookGroups.find((group) => group.id === "dm4") || {
						id: "dm4",
						title: "DM4 - Attendance & Timesheet Workbook",
						fileName: "DM4-attendance-timesheet-migration.xlsx",
						steps: [],
					},
					dm4Report,
				),
			},
		}));
		appendWorkbookLiveEvent("dm4", {
			sheetName: "DM4 proof",
			status: "Imported",
			message: `DM4 proof completed: ${(normalizedProof.phase1Selection?.sourceRowsScanned || 0).toLocaleString()} source rows scanned and ${Number(getDm4TimesheetMaterialization(normalizedProof)?.materializedMissingLines || 0).toLocaleString()} missing days materialized`,
			rowCount:
				normalizedProof.phase2Application?.appliedTotal ||
				normalizedProof.phase1Selection?.selectedRowsTotal ||
				0,
		});
		appendWorkbookLiveEvent("dm4", {
			sheetName: "Attendance History",
			status: "Imported",
			message: `Attendance proof verified: ${dm4Report.sheets[0].created} created, ${dm4Report.sheets[0].updated} updated`,
			rowCount: dm4Report.sheets[0].totalRows,
		});
		appendWorkbookLiveEvent("dm4", {
			sheetName: "Timesheets",
			status: "Imported",
			message: `Timesheet proof verified: ${dm4Report.sheets[1].created} created, ${dm4Report.sheets[1].updated} updated`,
			rowCount: dm4Report.sheets[1].totalRows,
		});
		appendWorkbookLiveEvent("dm4", {
			sheetName: "Approved Overtime Details",
			status: "Imported",
			message: `Approved overtime verified: ${dm4Report.sheets[2].updated} effective line updates planned or applied`,
			rowCount: dm4Report.sheets[2].totalRows,
		});
		await logWorkbookAudit({ event: "end", report: dm4Report });
		void queryClient.invalidateQueries({
			queryKey: ["migration-workbook-reports", organizationId],
		});
		await refreshCounts();
		setDm4ProofRun({
			status: "success",
			startedAt,
			elapsedSeconds: Math.max(1, Math.floor((finishedAt - startedAt) / 1000)),
			message: "DM4 proof imported. Counts and source-row evidence are ready below.",
			sourceMode,
			sourceCount: sourceFiles.length,
			sourceWorkbookCount,
			phase: "Completed",
			progressPercent: 100,
			materializedMissingLines:
				getDm4TimesheetMaterialization(normalizedProof)?.materializedMissingLines ??
				completedJob.timesheetMaterialization?.materializedMissingLines,
		});
	};

	const startDm4MigrationRun = async () => {
		setIsLoadingDm4Proof(true);
		const startedAt = Date.now();
		const sourceFiles = parseDm4SourceFiles(dm4SourceFilesText);
		const sourceMode = sourceFiles.length > 0 ? "UI workbook files" : "Server default config";
		setDm4ProofRun({
			status: "running",
			startedAt,
			elapsedSeconds: 0,
			message:
				"Import is running through the durable migration run API. Source workbooks are being scanned.",
			sourceMode,
			sourceCount: sourceFiles.length,
			sourceWorkbookCount: sourceFiles.length,
		});
		dm4ProofEventKeyRef.current = "";
		appendDm4ProofEventOnce("start", {
			sheetName: "DM4 proof",
			status: "Importing",
			message: "DM4 durable migration run started. Source workbooks are being scanned.",
			rowCount: sourceFiles.length,
		});
		showWorkbookImportProgressToast("dm4", {
			runKey: "pending",
			status: "RUNNING",
			description: "Starting durable DM4 run…",
		});
		try {
			const idempotencyKey =
				typeof crypto !== "undefined" && "randomUUID" in crypto
					? crypto.randomUUID()
					: `dm4-${Date.now()}`;
			const formData = new FormData();
			formData.append(
				"data",
				JSON.stringify({
					organizationId,
					workbookId: "dm4",
					sourceFilename:
						sourceFiles.length > 0
							? `${sourceFiles.length} DM4 source workbook path(s)`
							: "DM4 server default source config",
					idempotencyKey,
					sourceFiles,
					options: {
						sourceFiles,
						approveHistoricalTimesheets: true,
					},
				}),
			);
			const startResponse = await hrisApiClient.post<{
				runId?: string;
				jobId?: string;
				run?: { id?: string };
			}>("/api/migration/runs", formData, { timeoutMs: 30_000 });
			const runId = String(
				startResponse.data?.runId ||
					startResponse.data?.jobId ||
					startResponse.data?.run?.id ||
					"",
			);
			if (!runId) {
				throw new Error(startResponse.message || "DM4 migration run was not started.");
			}
			showWorkbookImportProgressToast("dm4", {
				runKey: runId,
				status: "RUNNING",
				description: "Durable run started · scanning source workbooks…",
			});
			setSearchParams((prev) => {
				const next = new URLSearchParams(prev);
				next.set("workbook", "dm4");
				next.set("runId", runId);
				next.delete("importJobId");
				return next;
			});

			const pollStartedAt = Date.now();
			let completedJob: Dm4RunSnapshot | null = null;
			while (Date.now() - pollStartedAt < 1000 * 60 * 60) {
				await new Promise((resolve) => window.setTimeout(resolve, 5_000));
				const statusResponse = await hrisApiClient.get<MigrationRunProgressResponse>(
					`/api/migration/runs/${runId}/progress`,
				);
				const job = buildDm4RunSnapshotFromRunProgress(statusResponse.data?.progress, {
					runId,
					startedAt,
					sourceFiles,
					sourceMode,
				});
				if (!job) {
					throw new Error(
						statusResponse.message || "DM4 migration run progress was not returned.",
					);
				}
				const phaseLabel = job.progress?.phase || job.phase || "Scanning source workbooks";
				const progressPercent = job.progress?.percent ?? 0;
				const eventBucket = Math.floor(Number(progressPercent || 0) / 10) * 10;
				appendDm4ProofEventOnce(
					`poll:${phaseLabel}:${eventBucket}:${job.progress?.materializedMissingLines ?? ""}`,
					{
						sheetName: "DM4 proof",
						status: "Importing",
						message: `${phaseLabel}${typeof job.progress?.percent === "number" ? ` (${job.progress.percent}%)` : ""}`,
						rowCount:
							job.progress?.timesheetlineRowsFound ||
							job.progress?.attendanceRowsFound ||
							job.progress?.materializedMissingLines,
					},
				);
				showWorkbookImportProgressToast("dm4", {
					runKey: runId,
					status: "RUNNING",
					description: formatWorkbookImportProgressDescription({
						currentStepLabel: phaseLabel,
						percent: progressPercent,
						elapsedSeconds: job.progress?.elapsedSeconds,
						latestMessage: job.message || null,
					}),
				});
				setDm4ProofRun((current) => ({
					...current,
					message: job.message || current.message,
					sourceMode: formatDm4SourceMode(job.sourceMode) || current.sourceMode,
					sourceWorkbookCount: job.sourceWorkbookCount ?? current.sourceWorkbookCount,
					elapsedSeconds: job.progress?.elapsedSeconds ?? current.elapsedSeconds,
					phase: job.progress?.phase || job.phase || current.phase,
					progressPercent: job.progress?.percent ?? current.progressPercent,
					materializedMissingLines:
						job.progress?.materializedMissingLines ?? current.materializedMissingLines,
				}));
				if (job.status === "completed") {
					completedJob = job;
					break;
				}
				if (job.status === "failed") {
					throw new Error(job.error || "DM4 migration run failed.");
				}
			}

			if (!completedJob) {
				throw new Error("DM4 migration run did not finish before the UI polling timeout.");
			}
			await applyCompletedDm4RunSnapshot({
				completedJob,
				startedAt,
				sourceFiles,
			});
			finishWorkbookImportProgressToast("dm4", "success", {
				runKey: runId,
				status: "COMPLETED",
				description: formatWorkbookImportProgressDescription({
					currentStepLabel: "Attendance & timesheet proof imported",
					percent: 100,
					elapsedSeconds: Math.max(1, Math.floor((Date.now() - startedAt) / 1000)),
				}),
			});
		} catch (error: any) {
			const message = error?.message || "Failed to import DM4 proof";
			appendDm4ProofEventOnce(`error:${message}`, {
				sheetName: "DM4 proof",
				status: "Failed",
				message,
				rowCount: sourceFiles.length,
			});
			setDm4ProofRun({
				status: "error",
				startedAt,
				elapsedSeconds: Math.max(1, Math.floor((Date.now() - startedAt) / 1000)),
				message: "DM4 migration run did not finish.",
				error: message,
				sourceMode,
				sourceCount: sourceFiles.length,
				sourceWorkbookCount: sourceFiles.length,
			});
			finishWorkbookImportProgressToast("dm4", "error", {
				runKey: importProgressToastRunsRef.current.dm4 || "pending",
				status: "FAILED",
				description: message,
			});
		} finally {
			setIsLoadingDm4Proof(false);
		}
	};

	const retryDm4MigrationRun = async () => {
		if (!dm4RetryableRunId || isRetryingDm4Run) return;
		const startedAt = Date.now();
		const sourceFiles = parseDm4SourceFiles(dm4SourceFilesText);
		const sourceMode = sourceFiles.length > 0 ? "UI workbook files" : "Server default config";
		setIsRetryingDm4Run(true);
		setDm4ProofReport(null);
		setDm4ProofRun({
			status: "running",
			startedAt,
			elapsedSeconds: 0,
			message: "Retrying DM4 through the durable migration run API.",
			sourceMode,
			sourceCount: sourceFiles.length,
			sourceWorkbookCount: sourceFiles.length,
			phase: "Retry queued",
		});
		appendDm4ProofEventOnce(`retry:${dm4RetryableRunId}:${startedAt}`, {
			sheetName: "DM4 proof",
			status: "Importing",
			message: `Retrying DM4 from run ${dm4RetryableRunId}.`,
			rowCount: sourceFiles.length,
		});

		try {
			const response = await hrisApiClient.post<{
				runId?: string;
				jobId?: string;
				run?: { id?: string };
			}>(`/api/migration/runs/${dm4RetryableRunId}/rerun`, {}, { timeoutMs: 30_000 });
			const nextRunId = String(
				response.data?.runId || response.data?.jobId || response.data?.run?.id || "",
			);
			if (!nextRunId) {
				throw new Error(response.message || "DM4 retry was not queued.");
			}
			setDm4ActiveRunId(nextRunId);
			setDm4ResumedJobId(null);
			setSearchParams((prev) => {
				const next = new URLSearchParams(prev);
				next.set("workbook", "dm4");
				next.set("runId", nextRunId);
				next.delete("importJobId");
				return next;
			});
			void queryClient.invalidateQueries({
				queryKey: ["migration-run-latest", "dm4", organizationId],
			});
			void queryClient.invalidateQueries({
				queryKey: ["migration-run-progress", dm4RetryableRunId],
			});
			void queryClient.invalidateQueries({
				queryKey: ["migration-run-events", dm4RetryableRunId],
			});
			toast.success("DM4 retry queued");
		} catch (error: any) {
			const message = error?.message || "Failed to retry DM4 migration run";
			setDm4ProofRun({
				status: "error",
				startedAt,
				elapsedSeconds: Math.max(1, Math.floor((Date.now() - startedAt) / 1000)),
				message: "DM4 retry was not queued.",
				error: message,
				sourceMode,
				sourceCount: sourceFiles.length,
				sourceWorkbookCount: sourceFiles.length,
			});
			toast.error(message);
		} finally {
			setIsRetryingDm4Run(false);
		}
	};

	useEffect(() => {
		const dm4RunId = runIdParam || importJobIdParam;
		if (workbookParam !== "dm4" || !dm4RunId) return;
		if (dm4ResumedJobId === dm4RunId) return;
		let cancelled = false;
		const sourceFiles = parseDm4SourceFiles(dm4SourceFilesText);
		const sourceMode = sourceFiles.length > 0 ? "UI workbook files" : "Server default config";
		const startedAt = Date.now();
		setDm4ResumedJobId(dm4RunId);
		dm4ProofEventKeyRef.current = "";
		setDm4ProofRun({
			status: "running",
			startedAt,
			elapsedSeconds: 0,
			message: `Resuming DM4 migration run ${dm4RunId}.`,
			sourceMode,
			sourceCount: sourceFiles.length,
			sourceWorkbookCount: sourceFiles.length,
			phase: "Resuming",
		});
		appendDm4ProofEventOnce(`resume:${dm4RunId}`, {
			sheetName: "DM4 proof",
			status: "Importing",
			message: `Resuming DM4 migration run ${dm4RunId}.`,
			rowCount: sourceFiles.length,
		});

		void hrisApiClient
			.get<MigrationRunProgressResponse>(`/api/migration/runs/${dm4RunId}/progress`)
			.then(async (response) => {
				if (cancelled) return;
				const job = buildDm4RunSnapshotFromRunProgress(response.data?.progress, {
					runId: dm4RunId,
					startedAt,
					sourceFiles,
					sourceMode,
				});
				if (!job) {
					throw new Error(
						response.message || "DM4 migration run progress was not returned.",
					);
				}
				if (job.status === "completed") {
					await applyCompletedDm4RunSnapshot({
						completedJob: job,
						startedAt: Date.parse(job.startedAt || "") || startedAt,
						sourceFiles: job.sourceWorkbookFiles || job.sourceFiles || sourceFiles,
					});
					toast.success("DM4 migration run restored");
					return;
				}
				if (job.status === "failed") {
					throw new Error(job.error || "DM4 migration run failed.");
				}
				const phaseLabel = job.progress?.phase || job.phase || "DM4 proof running";
				appendDm4ProofEventOnce(
					`resume-status:${phaseLabel}:${job.progress?.percent ?? ""}`,
					{
						sheetName: "DM4 proof",
						status: "Importing",
						message: `${phaseLabel}${typeof job.progress?.percent === "number" ? ` (${job.progress.percent}%)` : ""}`,
						rowCount:
							job.progress?.timesheetlineRowsFound ||
							job.progress?.attendanceRowsFound ||
							job.progress?.materializedMissingLines,
					},
				);
				setDm4ProofRun((current) => ({
					...current,
					message: job.message || current.message,
					sourceMode: formatDm4SourceMode(job.sourceMode) || current.sourceMode,
					sourceWorkbookCount: job.sourceWorkbookCount ?? current.sourceWorkbookCount,
					elapsedSeconds: job.progress?.elapsedSeconds ?? current.elapsedSeconds,
					phase: job.progress?.phase || job.phase || current.phase,
					progressPercent: job.progress?.percent ?? current.progressPercent,
					materializedMissingLines:
						job.progress?.materializedMissingLines ?? current.materializedMissingLines,
				}));
			})
			.catch((error: any) => {
				if (cancelled) return;
				const message = error?.message || "Failed to restore DM4 migration run.";
				appendDm4ProofEventOnce(`resume-error:${message}`, {
					sheetName: "DM4 proof",
					status: "Failed",
					message,
					rowCount: sourceFiles.length,
				});
				setDm4ProofRun({
					status: "error",
					startedAt,
					elapsedSeconds: Math.max(1, Math.floor((Date.now() - startedAt) / 1000)),
					message: "DM4 migration run restore failed.",
					error: message,
					sourceMode,
					sourceCount: sourceFiles.length,
					sourceWorkbookCount: sourceFiles.length,
				});
			});

		return () => {
			cancelled = true;
		};
	}, [workbookParam, runIdParam, importJobIdParam, dm4ResumedJobId, dm4SourceFilesText]);

	const selectWorkbookFile = (groupId: string, file: File | null) => {
		setSelectedWorkbookFiles((current) => ({ ...current, [groupId]: file }));
	};

	const selectDroppedWorkbookFile = (groupId: string, file?: File | null) => {
		if (!file) return;
		if (!file.name.toLowerCase().endsWith(".xlsx")) {
			toast.error("Upload an .xlsx workbook.");
			return;
		}
		selectWorkbookFile(groupId, file);
	};

	const setDm4SourcePaths = (paths: string[]) => {
		setDm4SourceFilesText(
			Array.from(new Set(paths.map((entry) => entry.trim()).filter(Boolean))).join("\n"),
		);
	};

	const addDm4SourcePath = (nextPathValue: string) => {
		const nextPath = nextPathValue.trim();
		if (!nextPath) {
			toast.error("Enter a server path or choose files to upload.");
			return;
		}
		const normalized = nextPath.replace(/\\/g, "/").toLowerCase();
		if (
			dm4SourcePaths.some(
				(existing) => existing.replace(/\\/g, "/").toLowerCase() === normalized,
			)
		) {
			toast.message("That file is already in the list.");
			setDm4SourcePathDraft("");
			return;
		}
		setDm4SourcePaths([...dm4SourcePaths, nextPath]);
		setDm4SourcePathDraft("");
		toast.success("Path added to DM4 sources.");
	};

	const removeDm4SourcePath = (index: number) => {
		setDm4SourcePaths(dm4SourcePaths.filter((_, pathIndex) => pathIndex !== index));
	};

	const restoreDm4DefaultSourcePaths = () => {
		setDm4SourceFilesText(DM4_DEFAULT_SOURCE_FILES_TEXT);
		setDm4SourcePathDraft("");
		toast.message("Restored default biometrics source list.");
	};

	const uploadDm4BrowserFiles = async (fileList: FileList | File[] | null | undefined) => {
		const files = Array.from(fileList || []).filter(Boolean);
		if (files.length === 0) return;

		const invalid = files.filter(
			(file) => !/\.xlsx?$/i.test(file.name) || file.name.startsWith("~$"),
		);
		const valid = files.filter(
			(file) => /\.xlsx?$/i.test(file.name) && !file.name.startsWith("~$"),
		);
		if (valid.length === 0) {
			toast.error("Choose .xlsx biometrics workbook files.");
			return;
		}
		if (invalid.length > 0) {
			toast.message(`Skipped ${invalid.length} non-Excel file(s).`);
		}

		setIsUploadingDm4Files(true);
		try {
			const formData = new FormData();
			for (const file of valid) {
				formData.append("files", file);
			}
			if (organizationId) {
				formData.append("organizationId", organizationId);
			}
			const response = await hrisApiClient.post<{
				data?: {
					sourceWorkbookFiles?: string[];
					sourceWorkbookCount?: number;
				};
				sourceWorkbookFiles?: string[];
			}>("/api/migration/dm4/upload-source-workbooks", formData, {
				timeoutMs: 120_000,
			});
			const payload = (response as any)?.data?.data || (response as any)?.data || response;
			const uploadedPaths = Array.isArray(payload?.sourceWorkbookFiles)
				? payload.sourceWorkbookFiles.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
				: [];
			if (uploadedPaths.length === 0) {
				throw new Error(
					(response as any)?.message || "Upload succeeded but no workbook paths were returned.",
				);
			}
			setDm4SourcePaths([...dm4SourcePaths, ...uploadedPaths]);
			toast.success(
				`Uploaded ${uploadedPaths.length} biometrics file${uploadedPaths.length === 1 ? "" : "s"}.`,
			);
		} catch (error: any) {
			toast.error(
				error?.data?.errors?.[0]?.message ||
					error?.message ||
					"Failed to upload biometrics workbook files.",
			);
		} finally {
			setIsUploadingDm4Files(false);
			if (dm4FileInputRef.current) {
				dm4FileInputRef.current.value = "";
			}
		}
	};

	function buildDm4ProofImportReport({
		runId,
		proof,
		startedAt,
		finishedAt,
		sourceMode,
		sourceCount,
	}: {
		runId?: string;
		proof: Dm4ProofReport;
		startedAt: number;
		finishedAt: number;
		sourceMode: string;
		sourceCount: number;
	}): MigrationImportReport {
		const selectedCount =
			proof.phase2Application?.appliedTotal ||
			proof.phase1Selection?.selectedRowsTotal ||
			proof.phase1Selection?.selectedRows?.length ||
			0;
		const scannedCount = proof.phase1Selection?.sourceRowsScanned || 0;
		const matchedCount = proof.phase1Selection?.dbEmployeesMatched || 0;
		const writeCounts = proof.phase2Application?.writeCounts || {};
		const scheduleMutations = proof.guardrails?.dm4EmbeddedScheduleMutationCount ?? 0;
		const materialization = getDm4TimesheetMaterialization(proof) || {};
		const approvedOvertimeRepair = proof.approvedOvertimeRepair || {};
		const approvedOvertimeVerification = approvedOvertimeRepair.verification || {};
		const approvedOvertimeSourceRows = Number(approvedOvertimeRepair.sourceRowsParsed || 0);
		const approvedOvertimeEffectiveLinesChecked = Number(
			approvedOvertimeRepair.effectiveLinesChecked || 0,
		);
		const approvedOvertimeLineUpdates = Number(
			approvedOvertimeRepair.plannedLineUpdates || 0,
		);
		const approvedOvertimeRemainingLineUpdates = Number(
			approvedOvertimeVerification.plannedLineUpdates || 0,
		);
		const approvedOvertimeTouchedTimesheets = Number(
			approvedOvertimeRepair.touchedTimesheets || 0,
		);
		const approvedOvertimeMissingRows = Number(approvedOvertimeRepair.missingSourceRows || 0);
		const sourceLabel =
			sourceCount > 0
				? `${sourceCount} workbook file(s)`
				: sourceMode || "Server default config";
		const baseSheet = {
			status: "Imported" as WorkbookSheetStatus,
			totalRows: selectedCount,
			skipped: 0,
			blocked: 0,
			failed: 0,
			elapsedMs: Math.max(1, finishedAt - startedAt),
			errors: [],
		};

		return {
			runId: runId || `dm4-proof-${startedAt}`,
			workbookId: "dm4",
			workbookName: "DM4 - Attendance & Timesheet Workbook",
			sourceFilename: sourceLabel,
			actorUserId: user?.id,
			organizationId,
			startedAt: new Date(startedAt).toISOString(),
			finishedAt: new Date(finishedAt).toISOString(),
			elapsedMs: Math.max(1, finishedAt - startedAt),
			status: "completed",
			sheets: [
				{
					...baseSheet,
					sheetName: "Attendance History",
					target: "Attendance",
					created:
						writeCounts.attendanceCreated ??
						proof.phase3DbProof?.attendanceRowsFound ??
						0,
					updated: writeCounts.attendanceUpdated ?? 0,
					firstError: `${scannedCount.toLocaleString()} source rows scanned; ${matchedCount.toLocaleString()} employees matched; ${(
						(writeCounts.attendanceObligationCreated ?? 0) +
						(writeCounts.attendanceObligationUpdated ?? 0)
					).toLocaleString()} obligations applied`,
				},
				{
					...baseSheet,
					sheetName: "Timesheets",
					target: "Timesheetline",
					created:
						Number(writeCounts.timesheetlineCreated ?? 0) +
						Number(materialization.materializedMissingLines ?? 0),
					updated: writeCounts.timesheetlineUpdated ?? 0,
					firstError: `${(
						proof.phase3DbProof?.timesheetlineRowsFound ?? 0
					).toLocaleString()} present lines verified; ${Number(
						materialization.materializedMissingLines ?? 0,
					).toLocaleString()} absent/rest/holiday days materialized; ${scheduleMutations} schedule mutations`,
				},
				{
					...baseSheet,
					sheetName: "Approved Overtime Details",
					target: "Effective timesheet line",
					status:
						approvedOvertimeRemainingLineUpdates > 0
							? "Blocked"
							: ("Imported" as WorkbookSheetStatus),
					totalRows:
						approvedOvertimeSourceRows ||
						approvedOvertimeEffectiveLinesChecked ||
						approvedOvertimeLineUpdates,
					created: 0,
					updated: approvedOvertimeLineUpdates,
					skipped: approvedOvertimeMissingRows,
					blocked: approvedOvertimeRemainingLineUpdates > 0 ? 1 : 0,
					failed: approvedOvertimeRemainingLineUpdates > 0 ? 1 : 0,
					firstError: approvedOvertimeRepair.skipped
						? `Approved overtime dry-run skipped: ${
								approvedOvertimeRepair.reason || "not available"
							}`
						: `${(
								approvedOvertimeSourceRows ||
								approvedOvertimeEffectiveLinesChecked ||
								approvedOvertimeLineUpdates
							).toLocaleString()} source/effective rows checked; ${approvedOvertimeLineUpdates.toLocaleString()} line updates applied; ${approvedOvertimeTouchedTimesheets.toLocaleString()} timesheets touched; verification remaining ${approvedOvertimeRemainingLineUpdates.toLocaleString()}`,
					errors:
						approvedOvertimeRemainingLineUpdates > 0
							? [
									{
										sheetName: "Approved Overtime Details",
										row: null,
										field: "verification",
										status: "blocked",
										message: `${approvedOvertimeRemainingLineUpdates.toLocaleString()} approved overtime effective line update(s) remain after apply.`,
									},
								]
							: [],
				},
			],
		};
	}

	const logWorkbookAudit = async (payload: {
		event: "start" | "sheet" | "end";
		report: MigrationImportReport;
		sheet?: MigrationReportSheet;
	}) => {
		try {
			const reportEvents =
				workbookLiveEventsRef.current[payload.report.workbookId] ||
				payload.report.events ||
				[];
			const reportWithEvents = {
				...payload.report,
				events: reportEvents.slice(0, 10),
			};
			await hrisApiClient.post("/api/migration/workbook-audit", {
				event: payload.event,
				runId: reportWithEvents.runId,
				workbookId: reportWithEvents.workbookId,
				workbookName: reportWithEvents.workbookName,
				sourceFilename: reportWithEvents.sourceFilename,
				organizationId: reportWithEvents.organizationId,
				startedAt: reportWithEvents.startedAt,
				finishedAt: reportWithEvents.finishedAt,
				elapsedMs: reportWithEvents.elapsedMs,
				status: reportWithEvents.status,
				report: reportWithEvents,
				sheet: payload.sheet
					? {
							sheetName: payload.sheet.sheetName,
							target: payload.sheet.target,
							status: payload.sheet.status,
							jobId: payload.sheet.jobId,
							totalRows: payload.sheet.totalRows,
							created: payload.sheet.created,
							updated: payload.sheet.updated,
							skipped: payload.sheet.skipped,
							blocked: payload.sheet.blocked,
							failed: payload.sheet.failed,
							elapsedMs: payload.sheet.elapsedMs,
							firstError: payload.sheet.firstError,
							errorCount: payload.sheet.errors.length,
						}
					: undefined,
				totals: getReportTotals(reportWithEvents),
			});
			if (payload.event === "end") {
				await queryClient.invalidateQueries({
					queryKey: ["migration-workbook-reports", organizationId],
				});
			}
		} catch (error) {
			console.warn("Migration audit log failed", error);
		}
	};

	const handleDurableDm3WorkbookUpload = async (group: ImportWorkbookGroup, file: File) => {
		const formData = new FormData();
		const idempotencyKey =
			typeof crypto !== "undefined" && "randomUUID" in crypto
				? crypto.randomUUID()
				: `dm3-${Date.now()}`;
		formData.append("file", file);
		formData.append(
			"data",
			JSON.stringify({
				organizationId,
				workbookId: "dm3",
				sourceFilename: file.name,
				idempotencyKey,
			}),
		);
		setDm3DurableRunSourceFilename(file.name);
		appendWorkbookLiveEvent(group.id, {
			status: "Importing",
			message: "Starting durable DM3 migration run",
		});
		showWorkbookImportProgressToast("dm3", {
			runKey: "pending",
			status: "RUNNING",
			description: `Uploading ${file.name} and starting durable run…`,
		});
		const response = await hrisApiClient.post<any>("/api/migration/runs", formData, {
			headers: { "Content-Type": "multipart/form-data" },
		});
		const runId = String(response.data?.runId || response.data?.run?.id || "");
		if (!runId) throw new Error("DM3 migration run did not return a run id.");
		setDm3ActiveRunId(runId);
		showWorkbookImportProgressToast("dm3", {
			runKey: runId,
			status: "RUNNING",
			description: "Durable run started · polling step progress…",
		});
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.set("workbook", group.id);
			next.set("runId", runId);
			next.delete("importJobId");
			return next;
		});
		await queryClient.invalidateQueries({ queryKey: ["migration-run-progress", runId] });
		await queryClient.invalidateQueries({
			queryKey: ["migration-run-latest", "dm3", organizationId],
		});
	};

	const handleWorkbookUpload = async (group: ImportWorkbookGroup, file: File) => {
		if (!file.name.toLowerCase().endsWith(".xlsx")) {
			toast.error("Upload an .xlsx workbook.");
			return;
		}
		// Close upload modal so progress shows on the workbook page.
		closeWorkbookUploadModal();
		if (group.id === "dm3") {
			try {
				await handleDurableDm3WorkbookUpload(group, file);
			} catch (error: any) {
				finishWorkbookImportProgressToast("dm3", "error", {
					runKey: importProgressToastRunsRef.current.dm3 || "pending",
					status: "FAILED",
					description: error?.message || "DM3 migration run failed to start.",
				});
			} finally {
				const input = workbookInputRefs.current[group.id];
				if (input) input.value = "";
				selectWorkbookFile(group.id, null);
			}
			return;
		}

		const startedAtMs = performance.now();
		const startedAt = new Date().toISOString();
		const runId =
			typeof crypto !== "undefined" && "randomUUID" in crypto
				? crypto.randomUUID()
				: `${group.id}-${Date.now()}`;
		let report: MigrationImportReport = {
			runId,
			workbookId: group.id,
			workbookName: group.fileName,
			sourceFilename: file.name,
			actorUserId: String((user as any)?.id || (user as any)?.userId || ""),
			organizationId,
			startedAt,
			status: "running",
			sheets: [],
		};

		setMigrationReports((current) => ({ ...current, [group.id]: report }));
		setWorkbookLiveEvents((current) => ({
			...current,
			[group.id]: [
				{
					id: `${Date.now()}-start`,
					at: startedAt,
					status: "running",
					message: `Started ${group.fileName}`,
				},
			],
		}));
		void logWorkbookAudit({ event: "start", report });
		showWorkbookImportProgressToast(group.id, {
			runKey: runId,
			status: "RUNNING",
			description: formatWorkbookImportProgressDescription({
				sheetIndex: 0,
				sheetTotal: group.steps.length,
				sheetLabel: "Reading workbook sheets",
			}),
		});

		setWorkbookProgress((current) => ({
			...current,
			[group.id]: Object.fromEntries(
				group.steps.map((step) => [step.id, { status: "Checking" as const }]),
			),
		}));

		try {
			appendWorkbookLiveEvent(group.id, {
				status: "Checking",
				message: "Reading workbook sheets",
			});
			const extraction = await extractWorkbook.mutateAsync({ files: [file] });
			const extractedSheets = ((extraction as any)?.files?.[0]?.sheets ||
				[]) as ExtractedSheet[];
			const sheetsByName = new Map(extractedSheets.map((sheet) => [sheet.sheetName, sheet]));
			appendWorkbookLiveEvent(group.id, {
				status: "Checking",
				message: `Found ${extractedSheets.length} workbook sheets`,
			});
			const missingSheets = group.steps
				.map((step) => step.sheetName)
				.filter((sheetName): sheetName is string => Boolean(sheetName))
				.filter((sheetName) => !sheetsByName.has(sheetName));

			if (missingSheets.length > 0) {
				report = {
					...report,
					finishedAt: new Date().toISOString(),
					elapsedMs: performance.now() - startedAtMs,
					status: "blocked",
					sheets: group.steps.map((step) => {
						const isMissing = missingSheets.includes(step.sheetName || "");
						return {
							sheetName: step.sheetName || step.label,
							target: step.target,
							status: isMissing ? ("Failed" as const) : ("Pending" as const),
							totalRows: 0,
							created: 0,
							updated: 0,
							skipped: 0,
							blocked: isMissing ? 1 : 0,
							failed: isMissing ? 1 : 0,
							elapsedMs: 0,
							firstError: isMissing ? "Missing sheet" : undefined,
							errors: isMissing
								? [
										{
											sheetName: step.sheetName || step.label,
											row: null,
											field: "sheet",
											status: "blocked" as const,
											message: "Required workbook sheet is missing.",
										},
									]
								: [],
						};
					}),
				};
				setMigrationReports((current) => ({ ...current, [group.id]: report }));
				group.steps.forEach((step) => {
					setWorkbookStepProgress(group.id, step.id, {
						status: missingSheets.includes(step.sheetName || "") ? "Failed" : "Pending",
						message: missingSheets.includes(step.sheetName || "")
							? "Missing sheet"
							: undefined,
					});
				});
				void logWorkbookAudit({ event: "end", report });
				appendWorkbookLiveEvent(group.id, {
					status: "blocked",
					message: `Missing sheet: ${missingSheets.join(", ")}`,
				});
				finishWorkbookImportProgressToast(group.id, "error", {
					runKey: runId,
					status: "BLOCKED",
					description: `Missing sheet: ${missingSheets.join(", ")}`,
				});
				return;
			}

			let dm3EmployeeFinalizeFile: File | null = null;
			let dm3EmployeeFinalizeRowCount = 0;
			const importableSteps = group.steps.filter((step) => Boolean(step.sheetName));
			let completedSheetCount = 0;

			for (const step of group.steps) {
				const sheet = sheetsByName.get(step.sheetName || "");
				const rowCount = Number(sheet?.rowCount || 0);
				if (!sheet) continue;
				const sheetIndex = Math.min(
					importableSteps.findIndex((candidate) => candidate.id === step.id) + 1,
					importableSteps.length || 1,
				);
				showWorkbookImportProgressToast(group.id, {
					runKey: runId,
					status: "RUNNING",
					description: formatWorkbookImportProgressDescription({
						sheetIndex,
						sheetTotal: importableSteps.length || group.steps.length,
						sheetLabel: step.sheetName || step.label,
						latestMessage: `${rowCount.toLocaleString()} rows detected`,
						percent: Math.round(
							(completedSheetCount / Math.max(1, importableSteps.length)) * 100,
						),
					}),
				});
				appendWorkbookLiveEvent(group.id, {
					sheetName: step.sheetName || step.label,
					status: step.unavailable ? "Skipped" : rowCount === 0 ? "Imported" : "Checking",
					message: `${step.sheetName || step.label}: ${rowCount.toLocaleString()} rows detected`,
					rowCount,
				});

				if (step.unavailable) {
					const sheetReport: MigrationReportSheet = {
						sheetName: step.sheetName || step.label,
						target: step.target,
						status: "Skipped",
						totalRows: 0,
						created: 0,
						updated: 0,
						skipped: 0,
						blocked: 0,
						failed: 0,
						elapsedMs: 0,
						firstError: "Template only",
						errors: [],
					};
					report = { ...report, sheets: [...report.sheets, sheetReport] };
					setMigrationReports((current) => ({ ...current, [group.id]: report }));
					setWorkbookStepProgress(group.id, step.id, {
						status: "Skipped",
						rowCount: 0,
						message: "Template only",
					});
					appendWorkbookLiveEvent(group.id, {
						sheetName: step.sheetName || step.label,
						status: "Skipped",
						message: `${step.sheetName || step.label} skipped: template only`,
						rowCount,
					});
					void logWorkbookAudit({ event: "sheet", report, sheet: sheetReport });
					completedSheetCount += 1;
					continue;
				}

				if (rowCount === 0) {
					const sheetReport: MigrationReportSheet = {
						sheetName: step.sheetName || step.label,
						target: step.target,
						status: "Imported",
						totalRows: 0,
						created: 0,
						updated: 0,
						skipped: 0,
						blocked: 0,
						failed: 0,
						elapsedMs: 0,
						errors: [],
					};
					report = { ...report, sheets: [...report.sheets, sheetReport] };
					setMigrationReports((current) => ({ ...current, [group.id]: report }));
					setWorkbookStepProgress(group.id, step.id, {
						status: "Imported",
						rowCount: 0,
						message: "0 rows",
					});
					appendWorkbookLiveEvent(group.id, {
						sheetName: step.sheetName || step.label,
						status: "Imported",
						message: `${step.sheetName || step.label} checked: 0 rows`,
						rowCount: 0,
					});
					void logWorkbookAudit({ event: "sheet", report, sheet: sheetReport });
					completedSheetCount += 1;
					continue;
				}

				const importer = getStepImporter(step.id);
				if (!importer) {
					const sheetReport: MigrationReportSheet = {
						sheetName: step.sheetName || step.label,
						target: step.target,
						status: "Failed",
						totalRows: rowCount,
						created: 0,
						updated: 0,
						skipped: 0,
						blocked: rowCount,
						failed: rowCount,
						elapsedMs: 0,
						firstError: "No importer",
						errors: [
							{
								sheetName: step.sheetName || step.label,
								row: null,
								field: "importer",
								status: "blocked",
								message: "No importer is configured for this sheet.",
							},
						],
					};
					report = { ...report, sheets: [...report.sheets, sheetReport] };
					setMigrationReports((current) => ({ ...current, [group.id]: report }));
					setWorkbookStepProgress(group.id, step.id, {
						status: "Failed",
						rowCount,
						message: "No importer",
					});
					appendWorkbookLiveEvent(group.id, {
						sheetName: step.sheetName || step.label,
						status: "Failed",
						message: `${step.sheetName || step.label} blocked: no importer configured`,
						rowCount,
					});
					void logWorkbookAudit({ event: "sheet", report, sheet: sheetReport });
					completedSheetCount += 1;
					continue;
				}

				setWorkbookStepProgress(group.id, step.id, { status: "Importing", rowCount });
				showWorkbookImportProgressToast(group.id, {
					runKey: runId,
					status: "RUNNING",
					description: formatWorkbookImportProgressDescription({
						sheetIndex,
						sheetTotal: importableSteps.length || group.steps.length,
						sheetLabel: `Importing ${step.sheetName || step.label}`,
						latestMessage: `${rowCount.toLocaleString()} rows`,
						percent: Math.round(
							(completedSheetCount / Math.max(1, importableSteps.length)) * 100,
						),
					}),
				});
				appendWorkbookLiveEvent(group.id, {
					sheetName: step.sheetName || step.label,
					status: "Importing",
					message: `Importing ${step.sheetName || step.label}`,
					rowCount,
				});
				const sheetStartedAtMs = performance.now();
				try {
					const sheetFile = buildCsvFileFromRows(
						sheet,
						step.fileName,
						step.expectedHeaders,
					);
					if (group.id === "dm3" && step.id === "employees") {
						dm3EmployeeFinalizeFile = sheetFile;
						dm3EmployeeFinalizeRowCount = rowCount;
					}
					const result = await importer(sheetFile);
					if (step.id === "employees" && (result?.jobId || result?.data?.jobId)) {
						const jobId = String(result.jobId || result.data.jobId);
						setSearchParams((prev) => {
							const next = new URLSearchParams(prev);
							next.set("workbook", group.id);
							next.set("importJobId", jobId);
							return next;
						});
						appendWorkbookLiveEvent(group.id, {
							sheetName: step.sheetName || step.label,
							status: "Importing",
							message: `${step.sheetName || step.label} job started: ${jobId}`,
							rowCount,
						});
						const sheetReport = await pollEmployeeImportJob(
							group.id,
							step,
							jobId,
							rowCount,
							(sheetProgress) => {
								const progressReport = upsertReportSheet(report, sheetProgress);
								setMigrationReports((current) => ({
									...current,
									[group.id]: progressReport,
								}));
								const processed = Number(
									(sheetProgress as any)?.processed ||
										sheetProgress.created +
											sheetProgress.updated +
											sheetProgress.skipped +
											sheetProgress.failed ||
										0,
								);
								const total = Number(sheetProgress.totalRows || rowCount || 0);
								showWorkbookImportProgressToast(group.id, {
									runKey: runId,
									status: "RUNNING",
									description: formatWorkbookImportProgressDescription({
										sheetIndex,
										sheetTotal: importableSteps.length || group.steps.length,
										sheetLabel: step.sheetName || step.label,
										childLabel: "Rows",
										childProcessed: processed,
										childTotal: total,
										percent: Math.round(
											((completedSheetCount +
												(total > 0 ? processed / total : 0)) /
												Math.max(1, importableSteps.length)) *
												100,
										),
									}),
								});
								void logWorkbookAudit({
									event: "sheet",
									report: progressReport,
									sheet: sheetProgress,
								});
							},
						);
						report = upsertReportSheet(report, sheetReport);
						setMigrationReports((current) => ({ ...current, [group.id]: report }));
						setWorkbookStepProgress(group.id, step.id, {
							status: sheetReport.status,
							rowCount: sheetReport.totalRows,
							message:
								sheetReport.firstError ||
								`${sheetReport.created.toLocaleString()} imported`,
						});
						appendWorkbookLiveEvent(group.id, {
							sheetName: step.sheetName || step.label,
							status: sheetReport.status,
							message:
								sheetReport.status === "Imported"
									? `${step.sheetName || step.label} imported`
									: `${step.sheetName || step.label} finished with issues`,
							rowCount: sheetReport.totalRows,
						});
						void logWorkbookAudit({ event: "sheet", report, sheet: sheetReport });
						completedSheetCount += 1;
						continue;
					}
					const issueMessage = getImportIssueMessage(result);
					const sheetReport = buildReportSheetFromResult(
						step,
						rowCount,
						result,
						performance.now() - sheetStartedAtMs,
					);
					report = { ...report, sheets: [...report.sheets, sheetReport] };
					setMigrationReports((current) => ({ ...current, [group.id]: report }));
					setWorkbookStepProgress(group.id, step.id, {
						status: hasImportIssues(result) ? "Failed" : "Imported",
						rowCount,
						message: issueMessage || undefined,
					});
					appendWorkbookLiveEvent(group.id, {
						sheetName: step.sheetName || step.label,
						status: hasImportIssues(result) ? "Failed" : "Imported",
						message: issueMessage
							? `${step.sheetName || step.label}: ${issueMessage}`
							: `${step.sheetName || step.label} imported`,
						rowCount,
					});
					void logWorkbookAudit({ event: "sheet", report, sheet: sheetReport });
					completedSheetCount += 1;
				} catch (error: any) {
					const sheetReport: MigrationReportSheet = {
						sheetName: step.sheetName || step.label,
						target: step.target,
						status: "Failed",
						totalRows: rowCount,
						created: 0,
						updated: 0,
						skipped: 0,
						blocked: 0,
						failed: rowCount,
						elapsedMs: performance.now() - sheetStartedAtMs,
						firstError: error?.message || "Import failed",
						errors: [
							{
								sheetName: step.sheetName || step.label,
								row: null,
								field: null,
								status: "failed",
								message: error?.message || "Import failed",
							},
						],
					};
					report = { ...report, sheets: [...report.sheets, sheetReport] };
					setMigrationReports((current) => ({ ...current, [group.id]: report }));
					setWorkbookStepProgress(group.id, step.id, {
						status: "Failed",
						rowCount,
						message: error?.message || "Import failed",
					});
					appendWorkbookLiveEvent(group.id, {
						sheetName: step.sheetName || step.label,
						status: "Failed",
						message: `${step.sheetName || step.label}: ${error?.message || "Import failed"}`,
						rowCount,
					});
					void logWorkbookAudit({ event: "sheet", report, sheet: sheetReport });
					completedSheetCount += 1;
				}
			}

			if (group.id === "dm3" && dm3EmployeeFinalizeFile && dm3EmployeeFinalizeRowCount > 0) {
				const finalizerStep = buildDm3PostActionsStep(dm3EmployeeFinalizeRowCount);
				appendWorkbookLiveEvent(group.id, {
					sheetName: finalizerStep.sheetName,
					status: "Importing",
					message:
						"Running post-actions after schedule, document, benefit, and loan imports",
					rowCount: dm3EmployeeFinalizeRowCount,
				});
				const finalizeStartedAtMs = performance.now();
				try {
					const finalizer = getStepImporter("employee-post-actions");
					if (!finalizer)
						throw new Error("No DM3 employee post-action importer configured.");
					const result = await finalizer(dm3EmployeeFinalizeFile);
					const postActionsJob = getDm3PostActionsJobFromResult(result);
					if (postActionsJob?.id) {
						const queuedSheet = buildReportSheetFromDm3PostActionsJob(
							finalizerStep,
							dm3EmployeeFinalizeRowCount,
							{
								...postActionsJob,
								id: postActionsJob.id,
								status: postActionsJob.status || "queued",
								total: postActionsJob.total || dm3EmployeeFinalizeRowCount,
							},
							performance.now() - finalizeStartedAtMs,
						);
						report = upsertReportSheet(report, queuedSheet);
						setMigrationReports((current) => ({ ...current, [group.id]: report }));
						setWorkbookStepProgress(group.id, finalizerStep.id, {
							status: "Finalizing",
							rowCount: queuedSheet.totalRows,
							processed: 0,
							message:
								postActionsJob.message ||
								"DM3 employee post-actions queued. Polling finalizer job.",
						});
						setSearchParams((prev) => {
							const next = new URLSearchParams(prev);
							next.set("workbook", group.id);
							next.set("importJobId", postActionsJob.id);
							return next;
						});
						void logWorkbookAudit({
							event: "sheet",
							report,
							sheet: queuedSheet,
						});
					}
					const sheetReport = postActionsJob?.id
						? await pollDm3PostActionsJob(
								group.id,
								finalizerStep,
								postActionsJob.id,
								dm3EmployeeFinalizeRowCount,
								finalizeStartedAtMs,
							)
						: buildReportSheetFromResult(
								finalizerStep,
								dm3EmployeeFinalizeRowCount,
								result,
								performance.now() - finalizeStartedAtMs,
							);
					report = upsertReportSheet(report, sheetReport);
					setMigrationReports((current) => ({ ...current, [group.id]: report }));
					appendWorkbookLiveEvent(group.id, {
						sheetName: finalizerStep.sheetName,
						status: sheetReport.status,
						message:
							sheetReport.status === "Failed"
								? "Employee post-actions finished with issues"
								: "Employee post-actions completed after schedule assignment",
						rowCount: dm3EmployeeFinalizeRowCount,
					});
					void logWorkbookAudit({ event: "sheet", report, sheet: sheetReport });
				} catch (error: any) {
					const timeoutMessage =
						error?.error === "REQUEST_TIMEOUT" || error?.status === 408
							? "Employee post-actions timed out. Import data was saved; recovery is required."
							: error?.message || "Employee post-actions failed";
					const sheetReport: MigrationReportSheet = {
						sheetName: finalizerStep.sheetName || finalizerStep.label,
						target: finalizerStep.target,
						status:
							error?.error === "REQUEST_TIMEOUT" || error?.status === 408
								? "Needs recovery"
								: "Failed",
						totalRows: dm3EmployeeFinalizeRowCount,
						created: 0,
						updated: 0,
						skipped: 0,
						blocked: dm3EmployeeFinalizeRowCount,
						failed: dm3EmployeeFinalizeRowCount,
						elapsedMs: performance.now() - finalizeStartedAtMs,
						firstError: timeoutMessage,
						errors: [
							{
								sheetName: finalizerStep.sheetName || finalizerStep.label,
								row: null,
								field: null,
								status: "failed",
								message: timeoutMessage,
							},
						],
					};
					report = upsertReportSheet(report, sheetReport);
					setMigrationReports((current) => ({ ...current, [group.id]: report }));
					appendWorkbookLiveEvent(group.id, {
						sheetName: finalizerStep.sheetName,
						status: sheetReport.status,
						message: timeoutMessage,
						rowCount: dm3EmployeeFinalizeRowCount,
					});
					void logWorkbookAudit({ event: "sheet", report, sheet: sheetReport });
				}
			}

			await refreshCounts();
			report = completeUnresolvedWorkbookSheets(group, report);
			report = {
				...report,
				finishedAt: new Date().toISOString(),
				elapsedMs: performance.now() - startedAtMs,
				status: report.sheets.some(
					(sheet) =>
						sheet.failed > 0 || sheet.blocked > 0 || sheet.status === "Needs recovery",
				)
					? "failed"
					: "completed",
			};
			report = normalizeWorkbookReportLifecycle(report);
			setMigrationReports((current) => ({ ...current, [group.id]: report }));
			setWorkbookProgress((current) => ({
				...current,
				[group.id]: buildWorkbookProgressFromReport(group, report),
			}));
			await logWorkbookAudit({ event: "end", report });
			appendWorkbookLiveEvent(group.id, {
				status: report.status,
				message:
					report.status === "completed"
						? `${group.id.toUpperCase()} workbook import completed`
						: `${group.id.toUpperCase()} workbook import finished with issues`,
			});
			const totals = getReportTotals(report);
			const elapsedSeconds = Math.max(1, Math.floor((report.elapsedMs || 0) / 1000));
			if (report.status === "completed") {
				finishWorkbookImportProgressToast(group.id, "success", {
					runKey: runId,
					status: "COMPLETED",
					description: formatWorkbookImportProgressDescription({
						sheetIndex: importableSteps.length || group.steps.length,
						sheetTotal: importableSteps.length || group.steps.length,
						latestMessage: `${totals.created.toLocaleString()} created · ${totals.failed.toLocaleString()} failed`,
						percent: 100,
						elapsedSeconds,
					}),
				});
			} else {
				finishWorkbookImportProgressToast(group.id, "error", {
					runKey: runId,
					status: "FAILED",
					description: formatWorkbookImportProgressDescription({
						latestMessage: `${group.id.toUpperCase()} finished with issues · ${totals.failed.toLocaleString()} failed`,
						elapsedSeconds,
					}),
				});
			}
		} catch (error: any) {
			report = {
				...report,
				finishedAt: new Date().toISOString(),
				elapsedMs: performance.now() - startedAtMs,
				status: "failed",
				sheets:
					report.sheets.length > 0
						? report.sheets
						: group.steps.map((step) => ({
								sheetName: step.sheetName || step.label,
								target: step.target,
								status: "Failed" as const,
								totalRows: 0,
								created: 0,
								updated: 0,
								skipped: 0,
								blocked: 1,
								failed: 1,
								elapsedMs: 0,
								firstError: error?.message || "Workbook check failed",
								errors: [
									{
										sheetName: step.sheetName || step.label,
										row: null,
										field: "workbook",
										status: "blocked" as const,
										message: error?.message || "Workbook check failed",
									},
								],
							})),
			};
			report = completeUnresolvedWorkbookSheets(group, report);
			setMigrationReports((current) => ({ ...current, [group.id]: report }));
			setWorkbookProgress((current) => ({
				...current,
				[group.id]: buildWorkbookProgressFromReport(group, report),
			}));
			await logWorkbookAudit({ event: "end", report });
			appendWorkbookLiveEvent(group.id, {
				status: "failed",
				message: error?.message || "Workbook import failed",
			});
			finishWorkbookImportProgressToast(group.id, "error", {
				runKey: runId,
				status: "FAILED",
				description: error?.message || "Workbook import failed",
			});
		} finally {
			const input = workbookInputRefs.current[group.id];
			if (input) input.value = "";
			selectWorkbookFile(group.id, null);
		}
	};

	const renderImportRow = (step: ImportStep, index: number) => {
		const Icon = step.icon;
		const statusLabel = getStatusLabel(step);

		return (
			<div
				key={step.id}
				className="grid gap-3 px-4 py-3 md:grid-cols-[40px_minmax(0,1fr)_auto] md:items-center">
				<div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600">
					<Icon className="h-4 w-4" />
				</div>
				<div className="min-w-0">
					<div className="truncate text-sm font-medium text-gray-950">
						{index + 1}. {step.label}
					</div>
				</div>

				<div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
					{statusLabel ? (
						<Badge
							variant="outline"
							className={`rounded-md px-2.5 py-1 text-[11px] leading-none whitespace-nowrap ${getStatusClassName(step)}`}>
							{statusLabel}
						</Badge>
					) : null}
					<Badge
						variant="outline"
						className={`rounded-md px-2.5 py-1 text-[11px] leading-none whitespace-nowrap ${getCountClassName(step)}`}>
						{getCountLabel(step)}
					</Badge>
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={!step.action || step.unavailable}
						onClick={() => step.action && openImportModal(step.action)}>
						{step.unavailable ? "Template only" : "Import"}
					</Button>
				</div>
			</div>
		);
	};

	const renderSourceInputPanel = (group: ImportWorkbookGroup) => {
		const sourceInputs = activeWorkbookSourceInputs;
		const topLevelSources = sourceInputs.filter((source) => !source.parentId);
		const childSourcesByParent = sourceInputs.reduce<Record<string, MigrationSourceInput[]>>(
			(accumulator, source) => {
				if (!source.parentId) return accumulator;
				accumulator[source.parentId] = [...(accumulator[source.parentId] || []), source];
				return accumulator;
			},
			{},
		);
		const sourceCount = topLevelSources.length;
		const renderMappingChips = (source: MigrationSourceInput, limit = 4) =>
			source.sheetMappings.length > 0 ? (
				<div className="flex flex-wrap gap-1.5">
					{source.sheetMappings.slice(0, limit).map((mapping, index) => (
						<Badge
							key={`${source.id}-${mapping.step}-${mapping.sheet}-${index}`}
							variant="outline"
							className="max-w-full rounded-md border-gray-200 bg-gray-50 px-1.5 py-0 text-[10px] font-normal text-gray-700">
							<span className="truncate">
								{[mapping.step, mapping.sheet].filter(Boolean).join(" / ")}
								{typeof mapping.rowCount === "number"
									? ` - ${mapping.rowCount.toLocaleString()} rows`
									: ""}
							</span>
						</Badge>
					))}
					{source.sheetMappings.length > limit ? (
						<Badge
							variant="outline"
							className="rounded-md border-gray-200 bg-white px-1.5 py-0 text-[10px] font-normal text-gray-500">
							+{source.sheetMappings.length - limit} more
						</Badge>
					) : null}
				</div>
			) : null;
		const renderSourceAction = (source: MigrationSourceInput) =>
			source.downloadable ? (
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="h-7 max-w-full shrink-0 justify-center px-2 text-[11px]"
					onClick={() => void downloadSourceInput(source)}>
					<Download className="mr-1 h-3 w-3" />
					Download
				</Button>
			) : (
				<span className="shrink-0 text-[10px] font-medium text-gray-500">
					Listed only
				</span>
			);
		const renderSourceStatus = (source: MigrationSourceInput) => (
			<Badge
				variant="outline"
				className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] ${SOURCE_INPUT_STATUS_CLASS[source.status] || "border-gray-200 bg-gray-50 text-gray-700"}`}>
				{formatSourceInputStatus(source.status)}
			</Badge>
		);

		return (
			<div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-gray-200 bg-white">
				<div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
					<div className="min-w-0">
						<p className="truncate text-xs font-semibold text-gray-900">
							{group.id.toUpperCase()} source inputs
						</p>
					</div>
					<Badge
						variant="outline"
						className="shrink-0 rounded-md border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700">
						{isLoadingMigrationSourceInputs ? "Loading" : `${sourceCount} listed`}
					</Badge>
				</div>
				<div className="max-h-[34vh] min-h-0 max-w-full divide-y divide-gray-100 overflow-y-auto overflow-x-hidden">
					{isLoadingMigrationSourceInputs ? (
						<div className="px-3 py-4 text-xs text-gray-500">
							Loading source inputs...
						</div>
					) : topLevelSources.length === 0 ? (
						<div className="px-3 py-4 text-xs text-gray-500">
							No configured source inputs for this DM phase.
						</div>
					) : (
						topLevelSources.map((source) => {
							const childSources = childSourcesByParent[source.id] || [];
							const isGroup = childSources.length > 0;
							const isOpen = Boolean(sourceInputOpen[source.id]);

							if (isGroup) {
								return (
									<Collapsible
										key={source.id}
										open={isOpen}
										onOpenChange={(open: boolean) =>
											setSourceInputOpen((current) => ({
												...current,
												[source.id]: open,
											}))
										}>
										<div className="space-y-2 px-3 py-2.5">
											<CollapsibleTrigger asChild>
												<button
													type="button"
													className="flex w-full min-w-0 flex-col items-start justify-between gap-2 text-left sm:flex-row">
													<div className="min-w-0">
														<p className="truncate text-xs font-semibold text-gray-950">
															{source.displayName}
														</p>
														<p className="mt-0.5 truncate font-mono text-[10px] text-gray-500">
															{source.sourceRef}
														</p>
													</div>
													<div className="flex shrink-0 items-center gap-1.5">
														<Badge
															variant="outline"
															className="rounded-md border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-700">
															{childSources.length} files
														</Badge>
														{renderSourceStatus(source)}
														<ChevronDown
															className={`h-3.5 w-3.5 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
														/>
													</div>
												</button>
											</CollapsibleTrigger>
											{source.description ? (
												<p className="line-clamp-2 text-[11px] leading-4 text-gray-600">
													{source.description}
												</p>
											) : null}
											{renderMappingChips(source)}
											<div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between">
												<span className="min-w-0 truncate text-[10px] text-gray-500">
													{source.confidential ? "Confidential source group" : "Workflow/source group"}
												</span>
												<span className="shrink-0 text-[10px] font-medium text-gray-500">
													Expand to download
												</span>
											</div>
										</div>
										<CollapsibleContent className="max-w-full overflow-hidden">
											<div className="min-w-0 max-w-full overflow-hidden border-t border-gray-100 bg-gray-50/60">
												{childSources.map((child) => (
													<div
														key={child.id}
														className="grid w-full min-w-0 max-w-full grid-cols-1 items-center gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto]">
														<div className="min-w-0">
															<div className="flex min-w-0 items-center gap-1.5">
																<p className="truncate text-xs font-medium text-gray-900">
																	{child.displayName}
																</p>
																{renderSourceStatus(child)}
															</div>
															<p className="mt-0.5 truncate font-mono text-[10px] text-gray-500">
																{child.sourceRef}
															</p>
														</div>
														{renderSourceAction(child)}
													</div>
												))}
											</div>
										</CollapsibleContent>
									</Collapsible>
								);
							}

							return (
								<div key={source.id} className="space-y-2 px-3 py-2.5">
									<div className="flex min-w-0 items-start justify-between gap-2">
										<div className="min-w-0">
											<p className="truncate text-xs font-semibold text-gray-950">
												{source.displayName}
											</p>
											<p className="mt-0.5 truncate font-mono text-[10px] text-gray-500">
												{source.sourceRef}
											</p>
										</div>
										{renderSourceStatus(source)}
									</div>
									{source.description ? (
										<p className="line-clamp-2 text-[11px] leading-4 text-gray-600">
											{source.description}
										</p>
									) : null}
									{renderMappingChips(source)}
									<div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between">
										<span className="min-w-0 truncate text-[10px] text-gray-500">
											{source.confidential ? "Confidential source" : "Workflow/template source"}
										</span>
										{renderSourceAction(source)}
									</div>
								</div>
							);
						})
					)}
				</div>
			</div>
		);
	};

	const renderWorkbookUploadPanel = (group: ImportWorkbookGroup) => {
		const selectedFile = selectedWorkbookFiles[group.id] || null;
		const isDragging = draggingWorkbookGroupId === group.id;
		const isWorkbookBusy = ["Checking", "Importing", "Finalizing"].includes(
			activeWorkbookBottomStatus,
		);

		return (
			<div className="rounded-lg border border-gray-200 bg-white p-3">
				<input
					ref={(input) => {
						workbookInputRefs.current[group.id] = input;
					}}
					type="file"
					accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
					className="hidden"
					onChange={(event) =>
						selectDroppedWorkbookFile(group.id, event.target.files?.[0] || null)
					}
				/>
				<button
					type="button"
					className={`flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition-colors ${
						isDragging
							? "border-orange-300 bg-orange-50"
							: "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-white"
					}`}
					onClick={() => workbookInputRefs.current[group.id]?.click()}
					onDragEnter={(event) => {
						event.preventDefault();
						setDraggingWorkbookGroupId(group.id);
					}}
					onDragOver={(event) => {
						event.preventDefault();
						setDraggingWorkbookGroupId(group.id);
					}}
					onDragLeave={(event) => {
						if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
							setDraggingWorkbookGroupId(null);
						}
					}}
					onDrop={(event) => {
						event.preventDefault();
						setDraggingWorkbookGroupId(null);
						selectDroppedWorkbookFile(group.id, event.dataTransfer.files?.[0]);
					}}>
					<div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500">
						<Upload className="h-4 w-4" />
					</div>
					<span className="text-sm font-semibold text-gray-950">
						{selectedFile
							? selectedFile.name
							: `Drop ${group.id.toUpperCase()} workbook here`}
					</span>
					<span className="text-xs text-gray-500">.xlsx workbook only</span>
				</button>
				<div className="mt-3 flex flex-wrap items-center justify-between gap-2">
					<div className="min-w-0 text-xs text-gray-600">
						{selectedFile ? (
							<span className="truncate">
								{(selectedFile.size / 1024 / 1024).toFixed(2)} MB selected
							</span>
						) : (
							<span>No workbook selected</span>
						)}
					</div>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="h-8 px-2.5 text-xs"
							onClick={() => workbookInputRefs.current[group.id]?.click()}>
							Choose file
						</Button>
						<Button
							type="button"
							size="sm"
							className="h-8 px-2.5 text-xs"
							disabled={!selectedFile || extractWorkbook.isPending || isWorkbookBusy}
							onClick={() => selectedFile && handleWorkbookUpload(group, selectedFile)}>
							{extractWorkbook.isPending || isWorkbookBusy ? (
								<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
							) : (
								<Upload className="mr-1.5 h-3.5 w-3.5" />
							)}
							Import workbook
						</Button>
					</div>
				</div>
			</div>
		);
	};

	const renderWorkbookRow = (
		group: ImportWorkbookGroup,
		step: ImportStep,
		index: number,
		options: { showIndex?: boolean } = {},
	) => {
		const progress = getDisplayedWorkbookProgress(group, step);
		const status = progress?.status || "Pending";
		const displayStatus =
			status === "Checking" && typeof progress?.rowCount !== "number" ? "Waiting" : status;
		const rowLabel =
			typeof progress?.rowCount === "number"
				? `${progress.rowCount.toLocaleString()} rows`
				: null;
		const shouldShowIssue =
			Boolean(progress?.message) && ["Failed", "Blocked", "Needs recovery"].includes(status);

		return (
			<div
				key={step.id}
				className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
				<div className="min-w-0">
					<div className="truncate text-sm font-medium text-gray-950">
						{options.showIndex === false ? step.label : `${index + 1}. ${step.label}`}
					</div>
					{shouldShowIssue ? (
						<p className="mt-0.5 truncate text-xs text-red-600" title={progress?.message}>
							{progress?.message}
						</p>
					) : null}
				</div>
				<div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
					{rowLabel ? (
						<span className="text-xs text-gray-500 tabular-nums">{rowLabel}</span>
					) : null}
					<Badge
						variant="outline"
						className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] leading-none whitespace-nowrap ${WORKBOOK_STATUS_CLASS[status]}`}>
						{displayStatus}
					</Badge>
				</div>
			</div>
		);
	};

	const renderGeneratedWorkbookRows = (group: ImportWorkbookGroup) => {
		if (!group.generatedSteps?.length) return null;
		const isOpen = Boolean(groupGeneratedOpen[group.id]);
		const generatedRowsWithProgress = group.generatedSteps.filter((step) => {
			const progress = getDisplayedWorkbookProgress(group, step);
			return (
				progress?.status !== "Pending" ||
				typeof progress?.rowCount === "number" ||
				Boolean(progress?.message)
			);
		});
		const completedCount = generatedRowsWithProgress.filter(
			(step) => getDisplayedWorkbookProgress(group, step)?.status === "Imported",
		).length;
		const summaryLabel =
			generatedRowsWithProgress.length > 0
				? `${completedCount}/${generatedRowsWithProgress.length} updated`
				: "Waiting";

		return (
			<Collapsible
				open={isOpen}
				onOpenChange={(open: boolean) =>
					setGroupGeneratedOpen((current) =>
						current[group.id] === open ? current : { ...current, [group.id]: open },
					)
				}>
				<CollapsibleTrigger asChild>
					<button
						type="button"
						className="flex w-full items-center justify-between gap-3 border-t border-gray-100 px-4 py-2.5 text-left">
						<div className="min-w-0">
							<span className="block truncate text-xs font-medium text-gray-800">
								Essential generated work
							</span>
							<span className="block truncate text-[11px] text-gray-500">
								Attendance, draft headers, post actions, and surface proof
							</span>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<Badge
								variant="outline"
								className="rounded-md border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700">
								{summaryLabel}
							</Badge>
							<ChevronDown
								className={`h-4 w-4 text-gray-500 transition-transform ${
									isOpen ? "rotate-180" : ""
								}`}
							/>
						</div>
					</button>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="divide-y divide-gray-100 border-t border-gray-100">
						{group.generatedSteps.map((step, index) =>
							renderWorkbookRow(group, step, index, { showIndex: false }),
						)}
					</div>
				</CollapsibleContent>
			</Collapsible>
		);
	};

	const getDisplayedWorkbookProgress = (
		group: ImportWorkbookGroup,
		step: ImportStep,
	): WorkbookSheetProgress | undefined => {
		const progress = workbookProgress[group.id]?.[step.id];
		const normalizedReport = migrationReports[group.id]
			? normalizeWorkbookReportLifecycle(migrationReports[group.id])
			: null;
		const reportSheet = normalizedReport?.sheets.find(
			(sheet) =>
				normalizeSheetName(sheet.sheetName) ===
				normalizeSheetName(step.sheetName || step.label),
		);
		if (
			!reportSheet ||
			(!isWorkbookReportTerminal(normalizedReport?.status) &&
				progress?.status &&
				progress.status !== "Pending")
		) {
			if (!reportSheet && isWorkbookHydrating(group.id)) {
				return {
					status: "Checking",
					message: "Loading durable migration status",
				};
			}
			return progress;
		}

		return {
			status: reportSheet.status,
			rowCount: reportSheet.totalRows,
			created: reportSheet.created,
			updated: reportSheet.updated,
			skipped: reportSheet.skipped,
			blocked: reportSheet.blocked,
			failed: reportSheet.failed,
			message: reportSheet.firstError,
		};
	};

	const isWorkbookHydrating = (groupId: string) => {
		if (!organizationId) return false;
		if (migrationReports[groupId]) return false;
		if (isLoadingPersistedWorkbookReports) return true;
		if (groupId === "dm3") {
			return isLoadingLatestDm3Run || Boolean(latestDm3RunId && isLoadingDm3RunProgress);
		}
		if (groupId === "dm4") {
			return isLoadingLatestDm4Run || Boolean(latestDm4RunId && isLoadingDm4RunProgress);
		}
		return false;
	};

	const renderManualFallback = (group: ImportWorkbookGroup) => {
		const isOpen = Boolean(groupManualOpen[group.id]);
		return (
			<Collapsible
				open={isOpen}
				onOpenChange={(open: boolean) =>
					setGroupManualOpen((current) =>
						current[group.id] === open ? current : { ...current, [group.id]: open },
					)
				}>
				<CollapsibleTrigger asChild>
					<button
						type="button"
						className="flex w-full items-center justify-between gap-3 border-t border-gray-200 px-4 py-2.5 text-left">
						<span className="text-xs font-medium text-gray-700">
							Advanced: import one sheet as CSV
						</span>
						<ChevronDown
							className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${
								isOpen ? "rotate-180" : ""
							}`}
						/>
					</button>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="divide-y divide-gray-100 border-t border-gray-100">
						{group.steps.map((step, index) => renderImportRow(step, index))}
					</div>
				</CollapsibleContent>
			</Collapsible>
		);
	};

	const renderWorkbookPage = () => {
		if (!activeWorkbookGroup) return null;
		const group = activeWorkbookGroup;
		const isDm4 = group.id === "dm4";
		const stepStatuses = group.steps.map((step) => getDisplayedWorkbookProgress(group, step));
		const completedCount = stepStatuses.filter((progress) => progress?.status === "Imported").length;
		const failedCount = stepStatuses.filter((progress) =>
			["Failed", "Blocked", "Needs recovery"].includes(String(progress?.status || "")),
		).length;
		const hasMeaningfulReport =
			Boolean(activeWorkbookReport) &&
			(activeWorkbookReportIsTerminal ||
				activeWorkbookDisplayTotals.totalRows > 0 ||
				["running", "failed", "completed", "blocked"].includes(
					String(activeWorkbookReport?.status || "").toLowerCase(),
				));
		// Optional reference panel only when real downloadable/mapped sources exist.
		// DM4 biometrics paths already live in the primary "What to do" card.
		const sourceInputsReady =
			!isDm4 &&
			activeWorkbookSourceInputs.some(
				(source) =>
					source.downloadable ||
					(Array.isArray(source.sheetMappings) && source.sheetMappings.length > 0),
			);
		const title = group.title.replace(/^DM\d+\s*-\s*/i, "");

		return (
			<div className="mx-auto max-w-3xl space-y-5 pb-10">
				<div className="space-y-3">
					<button
						type="button"
						onClick={() => closeWorkbookPage()}
						className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-gray-900">
						<ArrowLeft className="h-3.5 w-3.5" />
						All workbooks
					</button>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="min-w-0 space-y-1">
							<div className="flex flex-wrap items-center gap-2">
								<span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-gray-600">
									{group.id.toUpperCase()}
								</span>
								<h1 className="text-2xl font-semibold tracking-tight text-gray-950">
									{title}
								</h1>
							</div>
							<p className="text-sm text-gray-500">
								{isDm4
									? "Import biometrics punch files into attendance and timesheets."
									: "Upload one Excel workbook to import all sheets in order."}
							</p>
						</div>
						{activeWorkbookResumeTarget || canRetryDm4Run ? (
							<div className="flex shrink-0 flex-wrap gap-2">
								{activeWorkbookResumeTarget ? (
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="h-9 border-orange-200 bg-orange-50 px-3 text-xs text-orange-800 hover:bg-orange-100"
										onClick={() => resumeWorkbookPage(group)}>
										<PlayCircle className="mr-1.5 h-3.5 w-3.5" />
										Resume import
									</Button>
								) : null}
								{canRetryDm4Run ? (
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="h-9 border-orange-200 bg-orange-50 px-3 text-xs text-orange-800 hover:bg-orange-100"
										disabled={isRetryingDm4Run}
										onClick={() => void retryDm4MigrationRun()}>
										{isRetryingDm4Run ? (
											<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
										) : (
											<PlayCircle className="mr-1.5 h-3.5 w-3.5" />
										)}
										Retry import
									</Button>
								) : null}
							</div>
						) : null}
					</div>
				</div>

				<section className="rounded-2xl border border-orange-100 bg-gradient-to-b from-orange-50/80 to-white p-5 shadow-sm">
					<p className="text-[11px] font-semibold uppercase tracking-wide text-orange-700">
						What to do
					</p>
					{isDm4 ? (
						<div className="mt-2 space-y-4">
							<div>
								<h2 className="text-lg font-semibold text-gray-950">
									Import biometrics data
								</h2>
								<p className="mt-1 text-sm text-gray-600">
									Point to server-side biometrics Excel files, then run import.
									Employees and schedules from DM3 must already exist.
								</p>
							</div>
							<ol className="space-y-2 text-sm text-gray-700">
								<li className="flex gap-2">
									<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-orange-700 ring-1 ring-orange-200">
										1
									</span>
									<span>
										Upload biometrics Excel files (or add a server path)
									</span>
								</li>
								<li className="flex gap-2">
									<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-orange-700 ring-1 ring-orange-200">
										2
									</span>
									<span>
										Click Import attendance ({dm4SourcePaths.length} file
										{dm4SourcePaths.length === 1 ? "" : "s"} ready)
									</span>
								</li>
							</ol>
							<input
								ref={dm4FileInputRef}
								type="file"
								accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
								multiple
								className="hidden"
								onChange={(event) => {
									void uploadDm4BrowserFiles(event.target.files);
								}}
							/>
							<div className="rounded-xl border border-gray-200 bg-white p-3">
								<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
									<p className="text-xs font-semibold text-gray-900">Source files</p>
									<button
										type="button"
										className="text-[11px] font-medium text-gray-500 hover:text-gray-800"
										onClick={restoreDm4DefaultSourcePaths}>
										Use defaults
									</button>
								</div>
								<button
									type="button"
									disabled={isUploadingDm4Files || isLoadingDm4Proof}
									onClick={() => dm4FileInputRef.current?.click()}
									onDragEnter={(event) => {
										event.preventDefault();
										setDraggingWorkbookGroupId("dm4");
									}}
									onDragOver={(event) => {
										event.preventDefault();
										setDraggingWorkbookGroupId("dm4");
									}}
									onDragLeave={(event) => {
										if (
											!event.currentTarget.contains(
												event.relatedTarget as Node | null,
											)
										) {
											setDraggingWorkbookGroupId(null);
										}
									}}
									onDrop={(event) => {
										event.preventDefault();
										setDraggingWorkbookGroupId(null);
										void uploadDm4BrowserFiles(event.dataTransfer.files);
									}}
									className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
										draggingWorkbookGroupId === "dm4"
											? "border-orange-300 bg-orange-50"
											: "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-white"
									} disabled:cursor-not-allowed disabled:opacity-60`}>
									<div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500">
										{isUploadingDm4Files ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<Upload className="h-4 w-4" />
										)}
									</div>
									<span className="text-sm font-semibold text-gray-950">
										{isUploadingDm4Files
											? "Uploading biometrics files…"
											: "Drop biometrics .xlsx files here"}
									</span>
									<span className="text-xs text-gray-500">
										or click to choose one or more workbooks
									</span>
								</button>
								<div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
									<input
										value={dm4SourcePathDraft}
										onChange={(event) => setDm4SourcePathDraft(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												event.preventDefault();
												addDm4SourcePath(dm4SourcePathDraft);
											}
										}}
										className="h-9 min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 font-mono text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
										placeholder="Optional server path: docs/.../Biometrics Data_....xlsx"
									/>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="h-9 px-3 text-xs"
										disabled={isUploadingDm4Files || isLoadingDm4Proof}
										onClick={() => addDm4SourcePath(dm4SourcePathDraft)}>
										<Plus className="mr-1 h-3.5 w-3.5" />
										Add path
									</Button>
								</div>
								<div className="mt-3 max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100">
									{dm4SourcePaths.length === 0 ? (
										<p className="px-3 py-4 text-center text-xs text-gray-500">
											No source files yet. Upload biometrics workbooks or add a
											server path.
										</p>
									) : (
										dm4SourcePaths.map((filePath, index) => (
											<div
												key={`${filePath}-${index}`}
												className="flex items-center justify-between gap-2 px-3 py-2">
												<div className="min-w-0">
													<p className="truncate text-xs font-medium text-gray-900">
														{getDm4WorkbookFileName(filePath)}
													</p>
													{isDm4ApprovedOvertimeSource(filePath) ? (
														<span className="text-[10px] font-medium text-emerald-700">
															Approved overtime
														</span>
													) : (
														<p className="truncate font-mono text-[10px] text-gray-400">
															{filePath}
														</p>
													)}
												</div>
												<button
													type="button"
													className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-700"
													aria-label={`Remove ${getDm4WorkbookFileName(filePath)}`}
													onClick={() => removeDm4SourcePath(index)}>
													<X className="h-3.5 w-3.5" />
												</button>
											</div>
										))
									)}
								</div>
							</div>
							<div className="flex justify-end">
								<Button
									type="button"
									className="h-10 px-4 text-sm"
									disabled={
										isLoadingDm4Proof ||
										isUploadingDm4Files ||
										dm4SourcePaths.length === 0
									}
									onClick={() => void startDm4MigrationRun()}>
									{isLoadingDm4Proof ? (
										<Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
									) : (
										<PlayCircle className="mr-1.5 h-4 w-4" />
									)}
									{isLoadingDm4Proof ? "Importing…" : "Import attendance"}
								</Button>
							</div>
						</div>
					) : (
						<div className="mt-2 space-y-4">
							<div>
								<h2 className="text-lg font-semibold text-gray-950">
									Upload the workbook
								</h2>
								<p className="mt-1 text-sm text-gray-600">
									One Excel file fills all sheets below. Download the template if you
									do not already have a completed workbook.
								</p>
							</div>
							<ol className="space-y-2 text-sm text-gray-700">
								<li className="flex gap-2">
									<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-orange-700 ring-1 ring-orange-200">
										1
									</span>
									<span>Download template (optional)</span>
								</li>
								<li className="flex gap-2">
									<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-orange-700 ring-1 ring-orange-200">
										2
									</span>
									<span>Fill the sheets in Excel</span>
								</li>
								<li className="flex gap-2">
									<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-orange-700 ring-1 ring-orange-200">
										3
									</span>
									<span>Upload the completed .xlsx file</span>
								</li>
							</ol>
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="h-10 px-3 text-sm"
									disabled={downloadingTemplateWorkbookId === group.id}
									onClick={() => downloadWorkbookTemplate(group)}>
									{downloadingTemplateWorkbookId === group.id ? (
										<Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
									) : (
										<Download className="mr-1.5 h-4 w-4" />
									)}
									Download template
								</Button>
								<Button
									type="button"
									className="h-10 px-4 text-sm"
									onClick={() => openWorkbookUploadModal()}
									disabled={extractWorkbook.isPending}>
									<Upload className="mr-1.5 h-4 w-4" />
									Upload workbook
								</Button>
							</div>
						</div>
					)}
				</section>

				<section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
					<div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
						<div>
							<h2 className="text-sm font-semibold text-gray-950">Import checklist</h2>
							<p className="mt-0.5 text-xs text-gray-500">
								{completedCount}/{group.steps.length} sheets complete
								{failedCount > 0 ? ` · ${failedCount} need attention` : ""}
							</p>
						</div>
						<Badge
							variant="outline"
							className={`rounded-md px-2 py-0.5 text-[11px] ${WORKBOOK_STATUS_CLASS[activeWorkbookBottomStatus]}`}>
							{activeWorkbookBottomStatus === "Pending"
								? "Not started"
								: activeWorkbookBottomStatus}
						</Badge>
					</div>
					<div className="divide-y divide-gray-100">
						{group.steps.map((step, index) => renderWorkbookRow(group, step, index))}
					</div>
					{renderGeneratedWorkbookRows(group)}
				</section>

				{hasMeaningfulReport ? (
					<section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
						<div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
							<div className="flex flex-wrap items-center gap-2">
								<h2 className="text-sm font-semibold text-gray-950">
									Last import results
								</h2>
								<Badge
									variant="outline"
									className="rounded-md border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700">
									{activeWorkbookReport?.status || activeWorkbookBottomStatus}
								</Badge>
							</div>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-8 px-2.5 text-xs"
								disabled={
									!activeWorkbookReport ||
									downloadingReportRunIds.has(activeWorkbookReport.runId)
								}
								onClick={() =>
									activeWorkbookReport &&
									void handleMigrationReportDownload(activeWorkbookReport)
								}>
								{activeWorkbookReport &&
								downloadingReportRunIds.has(activeWorkbookReport.runId) ? (
									<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
								) : (
									<Download className="mr-1.5 h-3.5 w-3.5" />
								)}
								Download report
							</Button>
						</div>
						<div className="grid grid-cols-3 gap-px border-b border-gray-100 bg-gray-100 text-xs sm:grid-cols-6">
							{[
								["Rows", activeWorkbookDisplayTotals.totalRows],
								["Created", activeWorkbookDisplayTotals.created],
								["Updated", activeWorkbookDisplayTotals.updated],
								["Skipped", activeWorkbookDisplayTotals.skipped],
								["Blocked", activeWorkbookDisplayTotals.blocked],
								["Failed", activeWorkbookDisplayTotals.failed],
							].map(([label, value]) => (
								<div key={label} className="bg-white px-3 py-2.5">
									<div className="text-[11px] text-gray-500">{label}</div>
									<div className="font-semibold tabular-nums text-gray-950">
										{value}
									</div>
								</div>
							))}
						</div>
						<div className="overflow-x-auto">
							<table className="min-w-full text-left text-xs">
								<thead className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500">
									<tr>
										<th className="px-3 py-2 font-medium">Sheet</th>
										<th className="px-3 py-2 font-medium">Status</th>
										<th className="px-3 py-2 text-right font-medium">Rows</th>
										<th className="px-3 py-2 text-right font-medium">Created</th>
										<th className="px-3 py-2 font-medium">Issue</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-100">
									{activeWorkbookSourceReportRows.map((sheet) => (
										<tr key={sheet.sheetName}>
											<td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">
												{sheet.sheetName}
											</td>
											<td className="whitespace-nowrap px-3 py-2">
												<Badge
													variant="outline"
													className={`rounded-md px-2 py-0.5 text-[11px] ${WORKBOOK_STATUS_CLASS[sheet.status]}`}>
													{sheet.status}
												</Badge>
											</td>
											<td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
												{sheet.totalRows}
											</td>
											<td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
												{sheet.created}
											</td>
											<td className="min-w-[140px] px-3 py-2 text-gray-500">
												{sheet.firstError || "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						{activeWorkbookLiveEvents.length > 0 ? (
							<div className="border-t border-gray-100">
								<p className="px-4 py-2 text-xs font-semibold text-gray-900">
									Recent activity
								</p>
								<div className="max-h-48 overflow-auto border-t border-gray-100">
									<ul className="divide-y divide-gray-100 text-xs">
										{activeWorkbookLiveEvents.slice(0, 12).map((event) => (
											<li key={event.id} className="px-4 py-2 text-gray-700">
												<span className="text-gray-400">
													{formatReportTimestamp(event.at)}
												</span>
												{" · "}
												<span className="font-medium text-gray-900">
													{event.sheetName || event.stepCode || "Run"}
												</span>
												{" · "}
												{event.message || event.eventType || event.status}
											</li>
										))}
									</ul>
								</div>
							</div>
						) : null}
					</section>
				) : (
					<section className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-5 text-center">
						<p className="text-sm font-medium text-gray-800">No import run yet</p>
						<p className="mt-1 text-xs text-gray-500">
							{isDm4
								? "Results appear here after you import biometrics files."
								: "Results appear here after you upload a workbook."}
						</p>
					</section>
				)}

				{sourceInputsReady ? (
					<section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
						{renderSourceInputPanel(group)}
					</section>
				) : null}

				<section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
					{renderManualFallback(group)}
				</section>
			</div>
		);
	};

return (
		<div className="space-y-4">
			{activeWorkbookGroup ? (
				renderWorkbookPage()
			) : (
			<>
			<section className="rounded-xl border border-gray-200 bg-white p-5">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h1 className="text-xl font-semibold tracking-tight text-gray-950">
							Data Migration
						</h1>
						<p className="mt-1 text-sm text-gray-500">
							Work through DM1 → DM4 in order. Open a workbook, then upload or import.
						</p>
					</div>
					<Badge
						variant="outline"
						className="rounded-md border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-700">
						DM1 – DM4
					</Badge>
				</div>
			</section>

			<section className="space-y-3">
				<h2 className="text-sm font-semibold text-gray-950">Workbook imports</h2>
				<div className="flex min-w-0 flex-col gap-4">
					{workbookGroups.map((group) => {
						const resumeTarget = getWorkbookResumeTarget(group);
						return (
							<section
								key={group.id}
								className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
								<div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
									<div className="min-w-0">
										<p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
											{group.id.toUpperCase()}
										</p>
										<h3 className="truncate text-sm font-semibold text-gray-950">
											{group.title.replace(/^DM\d+\s*-\s*/i, "")}
										</h3>
									</div>
									<div className="flex min-w-0 flex-wrap items-center gap-2">
										<Badge
											variant="outline"
											className="min-w-0 max-w-full whitespace-normal break-words rounded-md border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-700 [overflow-wrap:anywhere]">
											{getWorkbookSummary(group)}
										</Badge>
										{resumeTarget ? (
											<Button
												type="button"
												size="sm"
												variant="outline"
												className="h-8 border-orange-200 bg-orange-50 px-2.5 text-xs text-orange-800 hover:bg-orange-100"
												aria-label={`Resume ${group.id.toUpperCase()} workbook import`}
												onClick={() => resumeWorkbookPage(group)}>
												<PlayCircle className="mr-1.5 h-3.5 w-3.5" />
												Resume
											</Button>
										) : null}
										<Button
											type="button"
											size="sm"
											className="h-8 px-2.5 text-xs"
											aria-label={`Open ${group.id.toUpperCase()} workbook`}
											onClick={() => openWorkbookPage(group.id)}
											disabled={extractWorkbook.isPending}>
											<FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
											Open
										</Button>
									</div>
								</div>
								<div className="divide-y divide-gray-100">
									{group.steps.map((step, index) =>
										renderWorkbookRow(group, step, index),
									)}
								</div>
								{renderGeneratedWorkbookRows(group)}
								{migrationReports[group.id] ? (
									<div className="border-t border-gray-100 px-4 py-3">
										{(() => {
											const report = migrationReports[group.id];
											const totals = getReportTotals(report);
											const statusClass =
												report.status === "completed"
													? WORKBOOK_STATUS_CLASS.Imported
													: report.status === "running"
														? WORKBOOK_STATUS_CLASS.Importing
														: WORKBOOK_STATUS_CLASS.Failed;
											return (
												<div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
													<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
														<span className="text-xs font-semibold text-gray-900">
															Import report
														</span>
														<Badge
															variant="outline"
															className={`rounded-md px-2 py-0.5 text-[11px] ${statusClass}`}>
															{report.status}
														</Badge>
														<span className="min-w-0 truncate text-[11px] text-gray-500">
															{report.finishedAt
																? formatReportTimestamp(
																		report.finishedAt,
																	)
																: formatReportTimestamp(
																		report.startedAt,
																	)}
														</span>
														<span className="min-w-0 break-words text-[11px] text-gray-600 [overflow-wrap:anywhere]">
															{totals.totalRows.toLocaleString()}{" "}
															rows, {totals.created.toLocaleString()}{" "}
															created,{" "}
															{totals.failed.toLocaleString()} failed
														</span>
													</div>
													<div className="flex shrink-0 flex-wrap items-center gap-2">
														{group.id === "dm3" &&
														canRecoverDm3PostActions(report) ? (
															<Button
																type="button"
																size="sm"
																variant="outline"
																className="h-8 border-orange-200 bg-orange-50 px-2.5 text-xs text-orange-800 hover:bg-orange-100"
																disabled={recoveringDm3PostActions}
																onClick={() =>
																	recoverDm3PostActions(
																		group,
																		report,
																	)
																}>
																{recoveringDm3PostActions ? (
																	<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
																) : (
																	<PlayCircle className="mr-1.5 h-3.5 w-3.5" />
																)}
																Recover
															</Button>
														) : null}
														<Button
															type="button"
															size="sm"
															variant="outline"
															className="h-8 px-2.5 text-xs"
															disabled={downloadingReportRunIds.has(
																report.runId,
															)}
															onClick={() =>
																void handleMigrationReportDownload(
																	report,
																)
															}>
															{downloadingReportRunIds.has(
																report.runId,
															) ? (
																<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
															) : (
																<Download className="mr-1.5 h-3.5 w-3.5" />
															)}
															{downloadingReportRunIds.has(report.runId)
																? "Downloading..."
																: "Download report"}
														</Button>
													</div>
												</div>
											);
										})()}
									</div>
								) : null}
								{renderManualFallback(group)}
							</section>
						);
					})}
				</div>
			</section>

			{Object.values(workbookProgress).some((group) =>
				Object.values(group).some((sheet) => sheet.status === "Failed"),
			) ? (
				<div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
					<span className="min-w-0">
						One or more workbook sheets reported an import issue. Check the sheet row
						above for the first row-level message.
					</span>
				</div>
			) : null}

			<section className="rounded-lg border border-gray-200 bg-white">
				<div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
					<div className="min-w-0">
						<h2 className="text-sm font-semibold text-gray-950">Employee Import</h2>
						{employeeStep ? (
							<div className="mt-2 flex flex-wrap items-center gap-2">
								<Badge
									variant="outline"
									className={`rounded-md px-2.5 py-1 text-[11px] leading-none whitespace-nowrap ${getCountClassName(employeeStep)}`}>
									{getCountLabel(employeeStep)}
								</Badge>
								{getStatusLabel(employeeStep) ? (
									<Badge
										variant="outline"
										className={`rounded-md px-2.5 py-1 text-[11px] leading-none whitespace-nowrap ${getStatusClassName(employeeStep)}`}>
										{getStatusLabel(employeeStep)}
									</Badge>
								) : null}
							</div>
						) : null}
					</div>
					<Button type="button" onClick={() => openImportModal("import-employees")}>
						Import employees
					</Button>
				</div>
			</section>
			</>
			)}


			{/* Upload-only modal (DM1–DM3). Workbook detail is a full page. */}
			<Modal
				open={isUploadModalOpen}
				onOpenChange={(open: boolean) => {
					if (!open) closeWorkbookUploadModal();
				}}
				title={
					activeWorkbookGroup
						? `Upload ${activeWorkbookGroup.id.toUpperCase()} workbook`
						: "Upload workbook"
				}
				description="Select the .xlsx workbook for this migration stage."
				className={HR_MODAL_STANDARD_CLASS}>
				{activeWorkbookGroup && activeWorkbookGroup.id !== "dm4"
					? renderWorkbookUploadPanel(activeWorkbookGroup)
					: null}
			</Modal>


			<GenericImportModal
				open={action === "import-departments"}
				onOpenChange={(open: boolean) => !open && closeImportModal()}
				persistenceKey="admin-migration::departments"
				title="Import Departments"
				fields={IMPORT_FIELDS_DEPARTMENTS}
				onDownloadTemplate={() => downloadTemplate("departments-import.csv")}
				onImport={(file) => importDepartments.mutateAsync(file)}
				isImporting={importDepartments.isPending}
			/>
			<GenericImportModal
				open={action === "import-sections"}
				onOpenChange={(open: boolean) => !open && closeImportModal()}
				persistenceKey="admin-migration::sections"
				title="Import Sections"
				fields={IMPORT_FIELDS_SECTIONS}
				onDownloadTemplate={() => downloadTemplate("sections-import.csv")}
				onImport={(file) => importSections.mutateAsync(file)}
				isImporting={importSections.isPending}
			/>
			<GenericImportModal
				open={action === "import-positions"}
				onOpenChange={(open: boolean) => !open && closeImportModal()}
				persistenceKey="admin-migration::positions"
				title="Import Positions"
				fields={IMPORT_FIELDS_POSITIONS}
				onDownloadTemplate={() => downloadTemplate("positions-import.csv")}
				onImport={(file) => importPositions.mutateAsync(file)}
				isImporting={importPositions.isPending}
			/>
			<GenericImportModal
				open={action === "import-levels"}
				onOpenChange={(open: boolean) => !open && closeImportModal()}
				persistenceKey="admin-migration::levels"
				title="Import Levels"
				fields={IMPORT_FIELDS_LEVELS}
				onDownloadTemplate={() => downloadTemplate("levels-import.csv")}
				onImport={(file) => importLevels.mutateAsync(file)}
				isImporting={importLevels.isPending}
			/>
			<GenericImportModal
				open={action === "import-shift-types"}
				onOpenChange={(open: boolean) => !open && closeImportModal()}
				persistenceKey="admin-migration::shift-types"
				title="Import Shift Types"
				fields={IMPORT_FIELDS_SHIFT_TYPES}
				onDownloadTemplate={() => downloadTemplate("shift-types-import.csv")}
				onImport={(file) => importShiftTypes.mutateAsync(file)}
				isImporting={importShiftTypes.isPending}
			/>
			<GenericImportModal
				open={action === "import-agencies"}
				onOpenChange={(open: boolean) => !open && closeImportModal()}
				persistenceKey="admin-migration::agencies"
				title="Import Agencies"
				fields={IMPORT_FIELDS_AGENCIES}
				onDownloadTemplate={() => downloadTemplate("agencies-import.csv")}
				onImport={(file) => importAgencies.mutateAsync(file)}
				isImporting={importAgencies.isPending}
			/>
			<GenericImportModal
				open={action === "import-holidays"}
				onOpenChange={(open: boolean) => !open && closeImportModal()}
				persistenceKey="admin-migration::holidays"
				title="Import Holidays"
				fields={IMPORT_FIELDS_HOLIDAYS}
				onDownloadTemplate={() => downloadTemplate("holidays-import.csv")}
				onImport={(file) => importHolidays.mutateAsync(file)}
				isImporting={importHolidays.isPending}
			/>
			<GenericImportModal
				open={action === "import-leave-types"}
				onOpenChange={(open: boolean) => !open && closeImportModal()}
				persistenceKey="admin-migration::leave-types"
				title="Import Leave Types"
				fields={IMPORT_FIELDS_LEAVE_TYPES}
				onDownloadTemplate={() => downloadTemplate("leave-types-import.csv")}
				onImport={(file) => importLeaveTypes.mutateAsync(file)}
				isImporting={importLeaveTypes.isPending}
			/>
			<GenericImportModal
				open={action === "import-benefit-types"}
				onOpenChange={(open: boolean) => !open && closeImportModal()}
				persistenceKey="admin-migration::benefit-types"
				title="Import Benefit Types"
				fields={IMPORT_FIELDS_BENEFIT_TYPES}
				onDownloadTemplate={() => downloadTemplate("benefit-types-import.csv")}
				onImport={(file) => importBenefitTypes.mutateAsync(file)}
				isImporting={importBenefitTypes.isPending}
			/>
			<GenericImportModal
				open={action === "import-loan-types"}
				onOpenChange={(open: boolean) => !open && closeImportModal()}
				persistenceKey="admin-migration::loan-types"
				title="Import Loan Types"
				fields={IMPORT_FIELDS_LOAN_TYPES}
				onDownloadTemplate={() => downloadTemplate("loan-types-import.csv")}
				onImport={(file) => importLoanTypes.mutateAsync(file)}
				isImporting={importLoanTypes.isPending}
			/>
			<EmployeeImportModal
				open={action === "import-employees"}
				onOpenChange={(open: boolean) => !open && closeImportModal()}
			/>
		</div>
	);
}
