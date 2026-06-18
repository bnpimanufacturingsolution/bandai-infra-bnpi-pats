import { buildSetupCreateHref } from "./import-setup-redirect";

export type EmployeeImportPreviewIssueSeverity = "error" | "warning";

export interface EmployeeImportPreviewValidationIssue {
	rowIndex: number;
	fieldKey: string;
	severity: EmployeeImportPreviewIssueSeverity;
	value: string;
	message: string;
	createLabel?: string;
	createHref?: string;
}

export interface EmployeeImportPreviewValidationSummaryItem {
	fieldKey: string;
	severity: EmployeeImportPreviewIssueSeverity;
	count: number;
	title: string;
	description: string;
	createLabel?: string;
	createHref?: string;
}

export interface EmployeeImportPreviewValidationResult {
	issues: EmployeeImportPreviewValidationIssue[];
	summary: EmployeeImportPreviewValidationSummaryItem[];
	hasBlockingIssues: boolean;
	blockingMessage?: string;
}

interface ValidationLookupContext {
	previewHeaders: string[];
	previewData: string[][];
	columnMapping: Record<string, string>;
	autoCreateResources: boolean;
	departmentOptions: Array<{ value: string; label: string }>;
	sectionOptions?: Array<{ value: string; label: string }>;
	levelOptions: Array<{ value: string; label: string }>;
	positionOptions: Array<{ value: string; label: string }>;
	roleOptions: Array<{ value: string; label: string }>;
	scheduleOptions: Array<{ value: string; label: string }>;
}

function normalizeLookupKey(value?: string | null): string {
	return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function createLookupSet(options: Array<{ value: string; label: string }>): Set<string> {
	const values = new Set<string>();
	options.forEach((option) => {
		const valueKey = normalizeLookupKey(option.value);
		if (valueKey) values.add(valueKey);
		const labelKey = normalizeLookupKey(option.label);
		if (labelKey) values.add(labelKey);
	});
	return values;
}

function createMappedFieldIndexGetter(
	previewHeaders: string[],
	columnMapping: Record<string, string>,
) {
	const headerIndexMap = new Map<string, number>();
	const fieldIndexCache = new Map<string, number>();

	previewHeaders.forEach((header, index) => {
		headerIndexMap.set(header, index);
	});

	return (fieldKey: string) => {
		const cached = fieldIndexCache.get(fieldKey);
		if (cached !== undefined) return cached;

		const mappedHeader = columnMapping[fieldKey] || fieldKey;
		const mappedIndex = headerIndexMap.get(mappedHeader);
		const fieldIndex = mappedIndex ?? headerIndexMap.get(fieldKey) ?? -1;
		fieldIndexCache.set(fieldKey, fieldIndex);
		return fieldIndex;
	};
}

export function buildEmployeeImportPreviewValidation({
	previewHeaders,
	previewData,
	columnMapping,
	autoCreateResources,
	departmentOptions,
	sectionOptions = [],
	levelOptions,
	positionOptions,
	roleOptions,
	scheduleOptions,
}: ValidationLookupContext): EmployeeImportPreviewValidationResult {
	const departmentSet = createLookupSet(departmentOptions);
	const sectionSet = createLookupSet(sectionOptions);
	const levelSet = createLookupSet(levelOptions);
	const positionSet = createLookupSet(positionOptions);
	const roleSet = createLookupSet(roleOptions);
	const scheduleSet = createLookupSet(scheduleOptions);
	const getMappedFieldIndex = createMappedFieldIndexGetter(previewHeaders, columnMapping);

	const issues: EmployeeImportPreviewValidationIssue[] = [];

	const validateLookupField = (
		fieldKey: "DEPARTMENT" | "LEVEL" | "POSITION" | "ROLE" | "SCHEDULE",
		displayName: string,
		lookupSet: Set<string>,
		createHref?: string,
		createLabel?: string,
	) => {
		const fieldIndex = getMappedFieldIndex(fieldKey);
		previewData.forEach((row, rowIndex) => {
			const value = fieldIndex >= 0 ? String(row[fieldIndex] || "").trim() : "";
			if (!value) {
				issues.push({
					rowIndex,
					fieldKey,
					severity: "error",
					value,
					message: `${displayName} is required before import.`,
					createHref,
					createLabel,
				});
				return;
			}

			if (lookupSet.has(normalizeLookupKey(value))) return;

			if (
				autoCreateResources &&
				(fieldKey === "DEPARTMENT" || fieldKey === "LEVEL" || fieldKey === "POSITION")
			) {
				issues.push({
					rowIndex,
					fieldKey,
					severity: "warning",
					value,
					message: `${displayName} "${value}" will need to be auto-created during import.`,
					createHref,
					createLabel,
				});
				return;
			}

			issues.push({
				rowIndex,
				fieldKey,
				severity: "error",
				value,
				message: `${displayName} "${value}" does not exist in configuration yet.`,
				createHref,
				createLabel,
			});
		});
	};

	const validateOptionalLookupField = (
		fieldKey: "SECTION" | "SCHEDULE" | "LEVEL",
		displayName: string,
		lookupSet: Set<string>,
		createHref?: string,
		createLabel?: string,
	) => {
		const fieldIndex = getMappedFieldIndex(fieldKey);
		previewData.forEach((row, rowIndex) => {
			const value = fieldIndex >= 0 ? String(row[fieldIndex] || "").trim() : "";
			if (!value || lookupSet.has(normalizeLookupKey(value))) return;

			if (fieldKey === "LEVEL") {
				issues.push({
					rowIndex,
					fieldKey,
					severity: autoCreateResources ? "warning" : "error",
					value,
					message: autoCreateResources
						? `${displayName} "${value}" will need to be auto-created during import.`
						: `${displayName} "${value}" does not match a configured level. Leave it blank or create the level before import.`,
					createHref,
					createLabel,
				});
				return;
			}

			issues.push({
				rowIndex,
				fieldKey,
				severity: "warning",
				value,
				message:
					fieldKey === "SCHEDULE"
						? `${displayName} "${value}" does not match a configured schedule. Leave it blank or choose a configured schedule before import.`
						: `${displayName} "${value}" does not match a configured section. It will be left blank and kept in metadata unless fixed.`,
				createHref,
				createLabel,
			});
		});
	};

	validateLookupField(
		"DEPARTMENT",
		"Department",
		departmentSet,
		buildSetupCreateHref({
			basePath: "/admin/configuration/departments",
			prefillName: "Department",
		}),
		"Create Department",
	);
	validateOptionalLookupField(
		"SECTION",
		"Section",
		sectionSet,
		buildSetupCreateHref({
			basePath: "/admin/configuration/sections",
			prefillName: "Section",
		}),
		"Create Section",
	);
	validateOptionalLookupField(
		"LEVEL",
		"Level",
		levelSet,
		buildSetupCreateHref({
			basePath: "/admin/configuration/levels",
			prefillName: "Level",
		}),
		"Create Level",
	);
	validateLookupField("POSITION", "Position", positionSet, undefined, "Create Position");
	validateLookupField("ROLE", "System role", roleSet);
	validateLookupField("SCHEDULE", "Schedule", scheduleSet, undefined, "Create Schedule");

	issues.forEach((issue) => {
		if (!issue.createLabel) return;
		if (issue.fieldKey === "POSITION") {
			issue.createHref = buildSetupCreateHref({
				basePath: "/admin/configuration/positions",
				prefillName: issue.value || "Position",
			});
			return;
		}
		if (issue.fieldKey === "SCHEDULE") {
			issue.createHref = buildSetupCreateHref({
				basePath: "/admin/configuration/schedule-templates",
				prefillName: issue.value || "Schedule",
			});
			return;
		}
		if (issue.fieldKey === "SECTION") {
			issue.createHref = buildSetupCreateHref({
				basePath: "/admin/configuration/sections",
				prefillName: issue.value || "Section",
			});
			return;
		}
		if (issue.fieldKey === "DEPARTMENT" && issue.value) {
			issue.createHref = buildSetupCreateHref({
				basePath: "/admin/configuration/departments",
				prefillName: issue.value,
			});
			return;
		}
		if (issue.fieldKey === "LEVEL" && issue.value) {
			issue.createHref = buildSetupCreateHref({
				basePath: "/admin/configuration/levels",
				prefillName: issue.value,
			});
		}
	});

	const byField = new Map<string, EmployeeImportPreviewValidationIssue[]>();
	issues.forEach((issue) => {
		const current = byField.get(issue.fieldKey) || [];
		current.push(issue);
		byField.set(issue.fieldKey, current);
	});

	const summary: EmployeeImportPreviewValidationSummaryItem[] = Array.from(
		byField.entries(),
	).map(([fieldKey, fieldIssues]) => {
		const severity: EmployeeImportPreviewIssueSeverity = fieldIssues.some(
			(issue) => issue.severity === "error",
		)
			? "error"
			: "warning";
		const firstIssue = fieldIssues[0];
		const titleMap: Record<string, string> = {
			DEPARTMENT: "Department setup needed",
			LEVEL: "Level setup needed",
			POSITION: "Position setup needed",
			SECTION: "Section review needed",
			ROLE: "System role required",
			SCHEDULE: "Schedule setup needed",
		};

		return {
			fieldKey,
			severity,
			count: fieldIssues.length,
			title: titleMap[fieldKey] || `${fieldKey} attention needed`,
			description:
				severity === "error"
					? `${fieldIssues.length} row${fieldIssues.length === 1 ? "" : "s"} must be fixed before import.`
					: `${fieldIssues.length} row${fieldIssues.length === 1 ? "" : "s"} will rely on auto-create.`,
			createHref: firstIssue?.createHref,
			createLabel: firstIssue?.createLabel,
		};
	});

	const hasBlockingIssues = issues.some((issue) => issue.severity === "error");

	return {
		issues,
		summary,
		hasBlockingIssues,
		blockingMessage: hasBlockingIssues
			? "Resolve the highlighted department, level, position, role, or schedule issues before importing."
			: undefined,
	};
}
