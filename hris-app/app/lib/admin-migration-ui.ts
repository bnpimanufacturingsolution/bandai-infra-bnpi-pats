export type AdminMigrationImportAction =
	| "import-departments"
	| "import-sections"
	| "import-positions"
	| "import-levels"
	| "import-shift-types"
	| "import-agencies"
	| "import-holidays"
	| "import-leave-types"
	| "import-benefit-types"
	| "import-employees";

export type AdminMigrationStepStatus = {
	countLabelSingular: string;
	countLabelPlural: string;
	count: number;
	isLoading?: boolean;
	unavailable?: boolean;
};

const IMPORT_MODAL_STATE_PARAMS = [
	"action",
	"importStep",
	"importAutoCreate",
	"importDefaultLeaveBalances",
	"importCreateTimesheets",
] as const;

/**
 * Workbook detail is a full page (`workbook=dm1..dm4`).
 * Upload is a small modal via `upload`:
 * - `1` → DM1–DM3 single workbook upload
 * - `compensation` / `deduction` → DM3 BNPI mass upload sources
 *   (all benefits and deductions; statutory/monthly-payment register is not a UI path)
 * - `manpower-databank` → DM3 BNPI employee roster refresh (create/update master data)
 * - `biometrics` / `overtime` → DM4 attendance sources
 */
const WORKBOOK_PAGE_STATE_PARAMS = ["workbook", "runId", "importJobId", "upload"] as const;
const WORKBOOK_UPLOAD_PARAM = "upload";
const WORKBOOK_UPLOAD_VALUE = "1";

export type WorkbookUploadKind =
	| "workbook"
	| "biometrics"
	| "overtime"
	| "compensation"
	| "deduction"
	| "manpower-databank";

export const ADMIN_MIGRATION_WORKBOOK_IDS = ["dm1", "dm2", "dm3", "dm4"] as const;
export type AdminMigrationWorkbookId = (typeof ADMIN_MIGRATION_WORKBOOK_IDS)[number];

export function isAdminMigrationWorkbookId(value: string | null | undefined): value is AdminMigrationWorkbookId {
	return Boolean(value && (ADMIN_MIGRATION_WORKBOOK_IDS as readonly string[]).includes(value));
}

function workbookUploadParamValue(kind: WorkbookUploadKind): string {
	if (kind === "workbook") return WORKBOOK_UPLOAD_VALUE;
	return kind;
}

export function getWorkbookUploadKind(
	params: URLSearchParams,
): WorkbookUploadKind | null {
	const value = params.get(WORKBOOK_UPLOAD_PARAM);
	if (value === WORKBOOK_UPLOAD_VALUE) return "workbook";
	if (
		value === "biometrics" ||
		value === "overtime" ||
		value === "compensation" ||
		value === "deduction" ||
		value === "manpower-databank"
	) {
		return value;
	}
	return null;
}

export function isWorkbookUploadOpen(params: URLSearchParams): boolean {
	return getWorkbookUploadKind(params) !== null;
}

export function buildOpenWorkbookSearchParams(
	previousParams: URLSearchParams,
	workbookId: string,
	options?: {
		upload?: boolean | WorkbookUploadKind;
		runId?: string | null;
		importJobId?: string | null;
	},
): URLSearchParams {
	const nextParams = new URLSearchParams(previousParams);
	nextParams.set("workbook", workbookId);
	if (options?.upload) {
		const kind: WorkbookUploadKind =
			options.upload === true ? "workbook" : options.upload;
		nextParams.set(WORKBOOK_UPLOAD_PARAM, workbookUploadParamValue(kind));
	} else {
		nextParams.delete(WORKBOOK_UPLOAD_PARAM);
	}
	if (options?.runId) {
		nextParams.set("runId", options.runId);
	}
	if (options?.importJobId) {
		nextParams.set("importJobId", options.importJobId);
	}
	return nextParams;
}

export function buildCloseWorkbookSearchParams(previousParams: URLSearchParams): URLSearchParams {
	const nextParams = new URLSearchParams(previousParams);
	for (const param of WORKBOOK_PAGE_STATE_PARAMS) {
		nextParams.delete(param);
	}
	return nextParams;
}

export function buildOpenWorkbookUploadSearchParams(
	previousParams: URLSearchParams,
	kind: WorkbookUploadKind = "workbook",
): URLSearchParams {
	const nextParams = new URLSearchParams(previousParams);
	nextParams.set(WORKBOOK_UPLOAD_PARAM, workbookUploadParamValue(kind));
	return nextParams;
}

export function buildCloseWorkbookUploadSearchParams(previousParams: URLSearchParams): URLSearchParams {
	const nextParams = new URLSearchParams(previousParams);
	nextParams.delete(WORKBOOK_UPLOAD_PARAM);
	return nextParams;
}

/** Stable sonner toast id so progress updates replace one toast per workbook. */
export function getWorkbookImportProgressToastId(workbookId: string): string {
	return `admin-migration-import-${String(workbookId || "").toLowerCase()}`;
}

export function formatWorkbookImportProgressTitle(
	workbookId: string,
	status?: string | null,
): string {
	const label = String(workbookId || "workbook").toUpperCase();
	const upper = String(status || "").toUpperCase();
	if (upper === "COMPLETED" || upper === "COMPLETED_WITH_WARNINGS") {
		return `${label} import completed`;
	}
	if (upper === "FAILED" || upper === "BLOCKED" || upper === "STALE") {
		return `${label} import failed`;
	}
	if (upper === "running" || upper === "RUNNING" || upper === "QUEUED" || upper === "IN_PROGRESS") {
		return `${label} import in progress`;
	}
	if (!status) return `${label} import in progress`;
	return `${label} import in progress`;
}

export type WorkbookImportProgressToastParts = {
	completedSteps?: number | null;
	totalSteps?: number | null;
	currentStepLabel?: string | null;
	latestMessage?: string | null;
	childLabel?: string | null;
	childProcessed?: number | null;
	childTotal?: number | null;
	sheetIndex?: number | null;
	sheetTotal?: number | null;
	sheetLabel?: string | null;
	percent?: number | null;
	elapsedSeconds?: number | null;
};

export function formatWorkbookImportProgressDescription(
	parts: WorkbookImportProgressToastParts,
): string {
	const segments: string[] = [];

	if (
		typeof parts.sheetIndex === "number" &&
		typeof parts.sheetTotal === "number" &&
		parts.sheetTotal > 0
	) {
		segments.push(`Sheet ${parts.sheetIndex}/${parts.sheetTotal}`);
	} else if (
		typeof parts.completedSteps === "number" &&
		typeof parts.totalSteps === "number" &&
		parts.totalSteps > 0
	) {
		segments.push(`${parts.completedSteps}/${parts.totalSteps} steps`);
	}

	const stepLabel = parts.currentStepLabel || parts.sheetLabel || null;
	if (stepLabel) segments.push(stepLabel);

	if (parts.childLabel) {
		if (
			typeof parts.childProcessed === "number" &&
			typeof parts.childTotal === "number" &&
			parts.childTotal > 0
		) {
			segments.push(
				`${parts.childLabel}: ${parts.childProcessed.toLocaleString()}/${parts.childTotal.toLocaleString()}`,
			);
		} else if (typeof parts.childProcessed === "number") {
			segments.push(`${parts.childLabel}: ${parts.childProcessed.toLocaleString()} processed`);
		} else {
			segments.push(parts.childLabel);
		}
	}

	if (typeof parts.percent === "number" && Number.isFinite(parts.percent)) {
		segments.push(`${Math.max(0, Math.min(100, Math.round(parts.percent)))}%`);
	}

	if (typeof parts.elapsedSeconds === "number" && parts.elapsedSeconds > 0) {
		const mins = Math.floor(parts.elapsedSeconds / 60);
		const secs = parts.elapsedSeconds % 60;
		segments.push(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
	}

	if (
		parts.latestMessage &&
		!parts.childLabel &&
		parts.latestMessage !== stepLabel &&
		!segments.includes(parts.latestMessage)
	) {
		const msg =
			parts.latestMessage.length > 90
				? `${parts.latestMessage.slice(0, 87)}…`
				: parts.latestMessage;
		segments.push(msg);
	}

	return segments.filter(Boolean).join(" · ") || "Working…";
}

export function isMigrationRunStatusTerminal(status: string | null | undefined): boolean {
	const upper = String(status || "").toUpperCase();
	return (
		upper === "COMPLETED" ||
		upper === "COMPLETED_WITH_WARNINGS" ||
		upper === "FAILED" ||
		upper === "BLOCKED" ||
		upper === "STALE"
	);
}

export function isMigrationRunStatusSuccess(status: string | null | undefined): boolean {
	const upper = String(status || "").toUpperCase();
	return upper === "COMPLETED" || upper === "COMPLETED_WITH_WARNINGS";
}

export function buildWorkbookImportProgressFromRun(progress: {
	status?: string;
	currentStepLabel?: string | null;
	parentProgress?: { completedSteps?: number; totalSteps?: number };
	activeChildJobs?: Array<{
		label?: string;
		processed?: number;
		total?: number | null;
	}>;
	latestEvent?: { message?: string } | null;
	durationMs?: number;
	startedAt?: string;
}): WorkbookImportProgressToastParts {
	const child = progress.activeChildJobs?.[0];
	const completed = Number(progress.parentProgress?.completedSteps || 0);
	const total = Number(progress.parentProgress?.totalSteps || 0);
	let percent: number | undefined;
	if (total > 0) {
		const base = (completed / total) * 100;
		if (
			child &&
			typeof child.processed === "number" &&
			typeof child.total === "number" &&
			child.total > 0
		) {
			percent = Math.min(
				99,
				Math.round(base + (child.processed / child.total) * (100 / total)),
			);
		} else {
			const status = String(progress.status || "").toUpperCase();
			percent =
				status === "COMPLETED" || status === "COMPLETED_WITH_WARNINGS"
					? 100
					: Math.min(99, Math.round(base));
		}
	}

	let elapsedSeconds: number | undefined;
	if (typeof progress.durationMs === "number" && Number.isFinite(progress.durationMs)) {
		elapsedSeconds = Math.max(0, Math.floor(progress.durationMs / 1000));
	} else if (progress.startedAt) {
		const started = Date.parse(progress.startedAt);
		if (Number.isFinite(started)) {
			elapsedSeconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
		}
	}

	return {
		completedSteps: total > 0 ? completed : null,
		totalSteps: total > 0 ? total : null,
		currentStepLabel: progress.currentStepLabel || null,
		latestMessage: progress.latestEvent?.message || null,
		childLabel: child?.label || null,
		childProcessed: typeof child?.processed === "number" ? child.processed : null,
		childTotal: typeof child?.total === "number" ? child.total : null,
		percent: percent ?? null,
		elapsedSeconds: elapsedSeconds ?? null,
	};
}

function readObject(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object") return null;
	return value as Record<string, unknown>;
}

function readPathNumber(value: unknown, path: string[]): number | undefined {
	let current: unknown = value;

	for (const segment of path) {
		const currentObject = readObject(current);
		if (!currentObject) return undefined;
		current = currentObject[segment];
	}

	return typeof current === "number" ? current : undefined;
}

export function getCollectionTotal(data: unknown, collection: unknown): number {
	const total =
		readPathNumber(data, ["pagination", "total"]) ??
		readPathNumber(data, ["count"]) ??
		readPathNumber(data, ["data", "pagination", "total"]) ??
		readPathNumber(data, ["data", "count"]);

	if (typeof total === "number") return total;
	return Array.isArray(collection) ? collection.length : 0;
}

export function getStatusLabel(step: AdminMigrationStepStatus): string | null {
	if (step.unavailable) return "Skipped";
	if (step.isLoading) return "Checking";
	if (step.count > 0) return null;
	return "Nothing imported yet";
}

export function getStatusClassName(step: AdminMigrationStepStatus) {
	if (step.unavailable) return "border-slate-600 bg-slate-600 text-white";
	if (step.isLoading) return "border-gray-600 bg-gray-600 text-white";
	return "border-orange-600 bg-orange-600 text-white";
}

export function getCountLabel(step: AdminMigrationStepStatus) {
	if (step.isLoading) return "Counting";
	const noun = step.count === 1 ? step.countLabelSingular : step.countLabelPlural;
	return `${step.count.toLocaleString()} ${noun}`;
}

export function getCountClassName(step: AdminMigrationStepStatus) {
	if (step.unavailable) return "border-slate-500 bg-slate-500 text-white";
	if (step.isLoading) return "border-gray-500 bg-gray-500 text-white";
	if (step.count > 0) return "border-emerald-600 bg-emerald-600 text-white";
	return "border-gray-700 bg-gray-700 text-white";
}

export function buildOpenImportSearchParams(
	previousParams: URLSearchParams,
	nextAction: AdminMigrationImportAction,
): URLSearchParams {
	const nextParams = new URLSearchParams(previousParams);
	nextParams.set("action", nextAction);

	if (nextAction === "import-employees") {
		nextParams.set("importAutoCreate", "false");
	}

	return nextParams;
}

export function buildClosedImportSearchParams(previousParams: URLSearchParams): URLSearchParams {
	const nextParams = new URLSearchParams(previousParams);

	for (const param of IMPORT_MODAL_STATE_PARAMS) {
		nextParams.delete(param);
	}

	return nextParams;
}
