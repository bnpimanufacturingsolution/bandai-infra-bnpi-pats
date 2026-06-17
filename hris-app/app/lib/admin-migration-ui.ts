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
