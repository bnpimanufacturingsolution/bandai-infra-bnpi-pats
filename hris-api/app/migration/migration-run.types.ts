export const MIGRATION_RUN_STATUSES = [
	"IDLE",
	"READY",
	"DRY_RUNNING",
	"DRY_RUN_COMPLETED",
	"STARTING",
	"QUEUED",
	"READING_SOURCE",
	"VALIDATING",
	"IMPORTING",
	"FINALIZING",
	"MATERIALIZING",
	"VERIFYING",
	"COMPLETED",
	"COMPLETED_WITH_WARNINGS",
	"FAILED",
	"BLOCKED",
	"STALE",
	"RERUNNING",
] as const;

export type MigrationRunStatus = (typeof MIGRATION_RUN_STATUSES)[number];

export const MIGRATION_EVENT_TYPES = [
	"RUN_CREATED",
	"GRAPH_BUILT",
	"DEPENDENCY_BLOCKED",
	"DRY_RUN_STARTED",
	"SOURCE_SELECTED",
	"SOURCE_FILES_RESOLVED",
	"SOURCE_READ_STARTED",
	"SOURCE_READ_COMPLETED",
	"PREREQUISITE_CHECKED",
	"BLOCKER_FOUND",
	"STEP_PLANNED",
	"DRY_RUN_COMPLETED",
	"VALIDATION_STARTED",
	"VALIDATION_FAILED",
	"STEP_STARTED",
	"STEP_PROGRESS",
	"STEP_COMPLETED",
	"STEP_FAILED",
	"DRY_RUN_STEP_COMPLETED",
	"ROW_IMPORTED",
	"ROW_SKIPPED",
	"SIDE_EFFECT_STARTED",
	"SIDE_EFFECT_COMPLETED",
	"MATERIALIZATION_STARTED",
	"MATERIALIZATION_COMPLETED",
	"VERIFICATION_STARTED",
	"VERIFICATION_COMPLETED",
	"DB_PROOF_STARTED",
	"DB_PROOF_COMPLETED",
	"UI_PROOF_READY",
	"AUDIT_PERSISTED",
	"RUN_COMPLETED",
	"RUN_FAILED",
	"RUN_BLOCKED",
	"RUN_STALE",
	"RECOVERY_STARTED",
	"RECOVERY_COMPLETED",
] as const;

export type MigrationEventType = (typeof MIGRATION_EVENT_TYPES)[number];

export type MigrationWorkbookId = "dm3" | "dm4";

export type MigrationRunSourceFile = {
	name?: string;
	path?: string;
	size?: number;
	mimeType?: string;
};

export type MigrationRunRequest = {
	organizationId: string;
	workbookId: MigrationWorkbookId;
	idempotencyKey?: string;
	dryRun?: boolean;
	sourceFilename?: string | null;
	sourceFiles?: MigrationRunSourceFile[];
	options?: Record<string, any>;
	actorUserId?: string;
	authToken?: string;
	files?: Express.Multer.File[];
};

export type MigrationEventInput = {
	runId: string;
	stage: string;
	stepCode?: string | null;
	phase?: string | null;
	eventType: MigrationEventType;
	status: MigrationRunStatus | string;
	message: string;
	sourceWorkbook?: string | null;
	sourceFile?: string | null;
	sourceSheet?: string | null;
	sourceRow?: number | null;
	employeeId?: string | null;
	employeeName?: string | null;
	counts?: Record<string, any> | null;
	metadata?: Record<string, any> | null;
};

export type MigrationRunAdapterResult = {
	status: MigrationRunStatus;
	phase?: string;
	progress?: Record<string, any>;
	counts?: Record<string, any>;
	summaryJson?: Record<string, any>;
	proofJson?: Record<string, any>;
	errorJson?: Record<string, any>;
};
