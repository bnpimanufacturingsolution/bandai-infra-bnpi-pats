export type MigrationScriptExecutionMode = {
	execute: boolean;
	dryRun: boolean;
	source: "default" | "argv" | "env";
};

export type MigrationDatabaseTarget = {
	label: string;
	url?: string;
	requiredForExecute?: boolean;
};

export type MigrationTargetSafety = {
	allowed: boolean;
	reason: string;
	host?: string;
	databaseName?: string;
};

export type MigrationScriptSafetyRegistration = {
	scriptPath: string;
	category: "migration" | "backfill" | "repair" | "seed" | "qa";
	mutatesData: boolean;
	defaultMode: "dry-run" | "execute-only" | "no-op";
	requiresExplicitExecute: boolean;
	requiresTargetGuard: boolean;
	notes: string;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SAFE_LOCAL_DATABASE_NAMES = [/test/i, /isolated/i, /fault/i, /local/i, /sandbox/i, /e2e/i];
const BLOCKED_DATABASE_NAMES = [/^hris$/i, /^hris-new$/i, /prod/i, /production/i, /stage/i, /staging/i, /uat/i, /shared/i, /dev/i];

export const MIGRATION_SCRIPT_SAFETY_REGISTRY: MigrationScriptSafetyRegistration[] = [
	{
		scriptPath: "scripts/materialize-computed-attendance.ts",
		category: "backfill",
		mutatesData: true,
		defaultMode: "dry-run",
		requiresExplicitExecute: true,
		requiresTargetGuard: true,
		notes: "Materializes computed Attendance ledger rows; default dry-run already exists.",
	},
	{
		scriptPath: "scripts/backfill-timesheet-lines.ts",
		category: "backfill",
		mutatesData: true,
		defaultMode: "dry-run",
		requiresExplicitExecute: true,
		requiresTargetGuard: true,
		notes: "Materializes effective Timesheetline rows from AttendanceObligation rows.",
	},
	{
		scriptPath: "scripts/migrate-attendance-schedule.ts",
		category: "migration",
		mutatesData: true,
		defaultMode: "dry-run",
		requiresExplicitExecute: true,
		requiresTargetGuard: true,
		notes: "Updates Attendance.employeeScheduleId and may create EmployeeSchedule rows.",
	},
	{
		scriptPath: "scripts/migrate-attendance-status-and-flags.ts",
		category: "migration",
		mutatesData: true,
		defaultMode: "dry-run",
		requiresExplicitExecute: true,
		requiresTargetGuard: true,
		notes: "Rewrites Attendance status and behaviorFlags from legacy hour fields.",
	},
	{
		scriptPath: "scripts/migrate-attendance-undertime-status.ts",
		category: "migration",
		mutatesData: true,
		defaultMode: "dry-run",
		requiresExplicitExecute: true,
		requiresTargetGuard: true,
		notes: "Rewrites legacy UNDERTIME Attendance status to PRESENT.",
	},
	{
		scriptPath: "scripts/migrate-timesheet-codes.ts",
		category: "migration",
		mutatesData: true,
		defaultMode: "dry-run",
		requiresExplicitExecute: true,
		requiresTargetGuard: true,
		notes: "Backfills missing Timesheet.code values.",
	},
	{
		scriptPath: "scripts/migration/mongo-to-postgres-backfill.ts",
		category: "migration",
		mutatesData: true,
		defaultMode: "execute-only",
		requiresExplicitExecute: true,
		requiresTargetGuard: true,
		notes: "Copies rows from MongoDB to PostgreSQL and writes checkpoints.",
	},
	{
		scriptPath: "scripts/migration/mongo-postgres-parity.ts",
		category: "migration",
		mutatesData: false,
		defaultMode: "dry-run",
		requiresExplicitExecute: false,
		requiresTargetGuard: false,
		notes: "Read-only parity check; still must not be treated as write safety proof.",
	},
	{
		scriptPath: "scripts/qa-migration-post-actions.ts",
		category: "qa",
		mutatesData: true,
		defaultMode: "execute-only",
		requiresExplicitExecute: true,
		requiresTargetGuard: true,
		notes: "Creates/deletes migration QA fixtures and invokes migration upload dryRun false.",
	},
	{
		scriptPath: "scripts/backfill-employee-documents.ts",
		category: "backfill",
		mutatesData: true,
		defaultMode: "execute-only",
		requiresExplicitExecute: true,
		requiresTargetGuard: true,
		notes: "Backfills employee document rows from legacy embedded fields.",
	},
	{
		scriptPath: "scripts/backfill-applicant-assigned-hr.ts",
		category: "backfill",
		mutatesData: false,
		defaultMode: "no-op",
		requiresExplicitExecute: false,
		requiresTargetGuard: false,
		notes: "Current placeholder/no-op script; keep registered so stale docs do not hide it.",
	},
	{
		scriptPath: "scripts/audit-dm3-opening-leave-balances.ts",
		category: "repair",
		mutatesData: true,
		defaultMode: "dry-run",
		requiresExplicitExecute: true,
		requiresTargetGuard: true,
		notes: "Repairs stale embedded Employee.leaveBalances from normalized DM3.5 EmployeeLeaveBalance rows.",
	},
];

export function resolveExecutionMode(
	args = process.argv.slice(2),
	env: NodeJS.ProcessEnv = process.env,
): MigrationScriptExecutionMode {
	let execute = false;
	let source: MigrationScriptExecutionMode["source"] = "default";

	for (const arg of args) {
		if (arg === "--execute" || arg === "--execute=true") {
			execute = true;
			source = "argv";
		}
		if (arg === "--dry-run" || arg === "--execute=false") {
			execute = false;
			source = "argv";
		}
	}

	if (source === "default") {
		if (env.npm_config_execute === "true" || env.MIGRATION_EXECUTE === "true") {
			execute = true;
			source = "env";
		} else if (env.npm_config_dry_run === "true" || env.MIGRATION_DRY_RUN === "true") {
			execute = false;
			source = "env";
		}
	}

	return {
		execute,
		dryRun: !execute,
		source,
	};
}

function databaseNameFromUrl(url: URL): string {
	if (url.protocol.startsWith("mongo")) {
		return url.pathname.split("/").filter(Boolean)[0] || "";
	}
	return url.pathname.replace(/^\//, "").split("?")[0] || "";
}

export function inspectMigrationDatabaseTarget(urlValue: string | undefined): MigrationTargetSafety {
	if (!urlValue?.trim()) {
		return {
			allowed: false,
			reason: "database URL is required before execute mode can be validated",
		};
	}

	let parsed: URL;
	try {
		parsed = new URL(urlValue);
	} catch {
		return {
			allowed: false,
			reason: "database URL is not parseable",
		};
	}

	const host = parsed.hostname;
	const databaseName = databaseNameFromUrl(parsed);

	if (!LOCAL_HOSTS.has(host)) {
		return {
			allowed: false,
			host,
			databaseName,
			reason: "execute mode requires localhost or 127.0.0.1 database targets",
		};
	}

	if (!databaseName) {
		return {
			allowed: false,
			host,
			databaseName,
			reason: "execute mode requires an explicit database name",
		};
	}

	if (BLOCKED_DATABASE_NAMES.some((pattern) => pattern.test(databaseName))) {
		return {
			allowed: false,
			host,
			databaseName,
			reason: `database "${databaseName}" is blocked for migration/backfill execution`,
		};
	}

	if (!SAFE_LOCAL_DATABASE_NAMES.some((pattern) => pattern.test(databaseName))) {
		return {
			allowed: false,
			host,
			databaseName,
			reason: `database "${databaseName}" is not named like an isolated/local test target`,
		};
	}

	return {
		allowed: true,
		host,
		databaseName,
		reason: "database target is local and named like an isolated test target",
	};
}

export function collectMigrationDatabaseTargets(
	env: NodeJS.ProcessEnv = process.env,
): MigrationDatabaseTarget[] {
	return [
		{ label: "DATABASE_URL", url: env.DATABASE_URL, requiredForExecute: false },
		{ label: "MONGODB_URI", url: env.MONGODB_URI, requiredForExecute: false },
		{ label: "PG_DATABASE_URL", url: env.PG_DATABASE_URL, requiredForExecute: false },
		{ label: "ISOLATED_TEST_DATABASE_URL", url: env.ISOLATED_TEST_DATABASE_URL, requiredForExecute: false },
	].filter((target) => Boolean(target.url));
}

export function assertSafeMigrationExecution(params: {
	scriptName: string;
	execute: boolean;
	databaseTargets?: MigrationDatabaseTarget[];
}): void {
	if (!params.execute) return;

	const targets = params.databaseTargets || collectMigrationDatabaseTargets();
	if (!targets.length) {
		throw new Error(
			`${params.scriptName}: execute mode requires a database URL so the target can be safety-checked.`,
		);
	}

	for (const target of targets) {
		const safety = inspectMigrationDatabaseTarget(target.url);
		if (!safety.allowed) {
			throw new Error(`${params.scriptName}: unsafe ${target.label}: ${safety.reason}`);
		}
	}
}

export function summarizeIdempotentBackfillRun(params: {
	scanned: number;
	created: number;
	updated?: number;
	skippedExisting?: number;
	failures?: number;
	dryRun: boolean;
}) {
	const updated = params.updated || 0;
	const skippedExisting = params.skippedExisting || 0;
	const failures = params.failures || 0;
	return {
		...params,
		updated,
		skippedExisting,
		failures,
		idempotentRerunExpected: failures === 0 && params.created === 0 && updated === 0,
		writesAttempted: !params.dryRun && (params.created > 0 || updated > 0),
	};
}
