import { DMMF } from "@prisma/client/runtime/library";
import { Prisma } from "../generated/prisma";

const dmmf: DMMF.Document = Prisma.dmmf as unknown as DMMF.Document;
const jsonFieldNames = new Set(
	dmmf.datamodel.models.flatMap((model) =>
		model.fields
			.filter((field) => field.kind === "scalar" && field.type === "Json")
			.map((field) => field.name),
	),
);
const compositeFieldNames = new Set(
	dmmf.datamodel.models.flatMap((model) =>
		model.fields
			.filter((field) => field.kind === "object" && !field.relationName)
			.map((field) => field.name),
	),
);
const relationFieldTargetByName = new Map<string, string>();
for (const model of dmmf.datamodel.models) {
	for (const field of model.fields) {
		if (field.kind !== "object" || !field.relationName) continue;
		const existingTarget = relationFieldTargetByName.get(field.name);
		if (!existingTarget) {
			relationFieldTargetByName.set(field.name, field.type);
		} else if (existingTarget !== field.type) {
			relationFieldTargetByName.delete(field.name);
		}
	}
}
const isCompositeField = (field?: DMMF.Field) => field?.kind === "object" && !field.relationName;
const isJsonField = (field?: DMMF.Field) => field?.kind === "scalar" && field.type === "Json";

function getEnumValues(enumName: string): string[] {
	return (
		dmmf.datamodel.enums
			.find((item) => item.name === enumName)
			?.values.map((item) => item.name) || []
	);
}

function buildEnumSearchCondition(fieldName: string, enumName: string, searchTerm: string): any {
	const normalizedTerm = searchTerm.trim().toLowerCase();
	if (!normalizedTerm) return {};

	const matchingValues = getEnumValues(enumName).filter((value) =>
		value.toLowerCase().includes(normalizedTerm),
	);

	if (matchingValues.length === 0) return {};
	if (matchingValues.length === 1) return { [fieldName]: matchingValues[0] };
	return { [fieldName]: { in: matchingValues } };
}

const resolveFieldPathParts = (parts: string[], modelName?: string): string[] => {
	const resolvedParts: string[] = [];
	let currentModel = modelName;

	for (let index = 0; index < parts.length; index++) {
		const part = parts[index];
		const cleanPart = part.replace(/:latest$/, "");
		const fieldMeta = currentModel ? getFieldMeta(currentModel, cleanPart) : undefined;

		if (currentModel && !fieldMeta) {
			return [];
		}

		resolvedParts.push(part);

		if (fieldMeta?.kind === "object" && fieldMeta.relationName) {
			currentModel = fieldMeta.type;
		} else if (!currentModel && relationFieldTargetByName.has(cleanPart)) {
			currentModel = relationFieldTargetByName.get(cleanPart);
		} else if (isJsonField(fieldMeta) || isCompositeField(fieldMeta)) {
			break;
		} else if (!currentModel && index < parts.length - 1) {
			return [];
		} else if (!fieldMeta || index < parts.length - 1) {
			currentModel = undefined;
		}
	}

	return resolvedParts;
};
const inferModelNameFromWhere = (whereClause: unknown): string | undefined => {
	const constructorName = (whereClause as any)?.constructor?.name;
	if (typeof constructorName === "string" && constructorName !== "Object") {
		return constructorName.replace(/Where.*$/, "");
	}
	return undefined;
};

/**
 * Helper to build nested sort object from dot notation string
 * e.g. "payrollPeriod.endDate" -> { payrollPeriod: { endDate: "desc" } }
 */
function buildSortObject(sort: string, order: "asc" | "desc"): any {
	if (sort.includes(".")) {
		const parts = sort.split(".");
		const result: any = {};
		let current = result;
		// Initialize the loop
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (i === parts.length - 1) {
				current[part] = order;
			} else {
				current[part] = {};
				current = current[part];
			}
		}
		return result;
	}
	return { [sort]: order };
}

export const buildFindManyQuery = <T extends any | undefined>(
	whereClause: T,
	skip: number,
	limit: number,
	order: "asc" | "desc",
	sort?: string | object,
	fields?: string,
	aggregateBy?: string,
	countBy?: string,
	groupBy?: string,
	fieldAliases?: Record<string, string>,
	modelName?: string,
): any => {
	const query: any = {
		where: whereClause,
		skip,
		take: limit,
		orderBy: sort
			? typeof sort === "string"
				? sort.startsWith("{")
					? JSON.parse(sort)
					: buildSortObject(sort, order)
				: sort
			: { id: order as Prisma.SortOrder },
	};

	// Auto-include groupBy field if it's a nested field (e.g., position.title)
	let enhancedFields = fields;
	if (groupBy && groupBy.includes(".")) {
		if (fields) {
			const fieldsList = fields.split(",").map((f) => f.trim());
			if (!fieldsList.includes(groupBy)) {
				enhancedFields = `${fields},${groupBy}`;
			}
		} else {
			enhancedFields = groupBy;
		}
	}

	const selectFields = getNestedFields(
		enhancedFields,
		fieldAliases,
		modelName || inferModelNameFromWhere(whereClause),
	);
	const aggregateSelections = buildAggregateSelections(aggregateBy, countBy);

	if (selectFields) {
		// When fields are explicitly requested we must use select, merge in aggregates
		query.select = mergeDeep(selectFields, aggregateSelections ?? {});
	} else if (aggregateSelections) {
		// When no explicit select is present we can use include to preserve default includes later
		query.include = mergeDeep(query.include ?? {}, aggregateSelections);
	} else {
		query.select = selectFields;
	}

	return query;
};

export const getNestedFields = (
	fields?: string,
	fieldAliases: Record<string, string> = {},
	modelName?: string,
) => {
	if (fields) {
		const normalizeFieldPath = (fieldPath: string) => {
			const trimmed = fieldPath.trim();
			if (!trimmed) return trimmed;
			const normalizedParts = resolveFieldPathParts(trimmed.split("."), modelName);
			const [root, ...rest] = normalizedParts;
			const mappedRoot = fieldAliases[root] || root;
			if (root === "activeSchedule" && rest.length > 0) {
				return mappedRoot;
			}
			return [mappedRoot, ...rest].join(".");
		};
		const fieldSelections = fields
			.split(",")
			.map((field) => normalizeFieldPath(field))
			.filter(Boolean)
			.reduce(
				(acc, field) => {
					const parts = field.trim().split(".");
					if (parts.length > 1) {
						// Handle nested fields
						let current = acc;
						let currentModel = modelName;

						for (let i = 0; i < parts.length; i++) {
							let part = parts[i];
							let isLatest = false;

							// Check for :latest modifier
							if (part.endsWith(":latest")) {
								part = part.replace(":latest", "");
								isLatest = true;
							}

							const isLast = i === parts.length - 1;
							const fieldMeta = currentModel
								? getFieldMeta(currentModel, part)
								: undefined;

							if (
								!isLast &&
								(isJsonField(fieldMeta) ||
									(!currentModel && jsonFieldNames.has(part)))
							) {
								current[part] = true;
								break;
							}

							if (
								!isLast &&
								(isCompositeField(fieldMeta) ||
									(!currentModel && compositeFieldNames.has(part)))
							) {
								current[part] = true;
								break;
							}

							if (isLast) {
								// Terminal field
								// Ensure we're inside a select object if we're technically just setting a field to true
								// But if specific fields were requested on a relation that has args (like take/orderBy),
								// we are already in a 'select' block from the parent loop iteration.
								// If we are at the root, current is 'acc' (the select object itself).

								current[part] = true;
							} else {
								// Non-terminal: it's a relation/object
								// Clean up if it was previously set to true (scalar usage)
								if (current[part] === true) {
									current[part] = { select: {} };
								}

								// Initialize if not exists
								current[part] = current[part] || { select: {} };

								// Apply args if :latest
								if (isLatest) {
									current[part].take = 1;
									current[part].orderBy = { createdAt: "desc" };
								}

								// Move down
								current = current[part].select;
								currentModel =
									fieldMeta?.kind === "object" && fieldMeta.relationName
										? fieldMeta.type
										: undefined;
							}
						}
					} else {
						// Top level field
						let part = parts[0];
						let isLatest = false;

						if (part.endsWith(":latest")) {
							part = part.replace(":latest", "");
							isLatest = true;
						}

						// Only set to true if not already a nested select object
						if (!acc[part] || typeof acc[part] !== "object") {
							if (isLatest) {
								acc[part] = {
									select: { id: true }, // Default select if only relation:latest is specified? Or typically used with fields?
									// Use include-like behavior? No, getNestedFields implies select.
									// If user asks for `boardingProcesses:latest`, they probably want all fields?
									// But standard Prisma select requires selecting fields.
									// If we just return 'true', we can't add args.
									// So we must make it an object.
									take: 1,
									orderBy: { createdAt: "desc" },
								};
								// If we use select, we must select something.
								// If the user didn't specify subfields (parts.length === 1),
								// we might default to all scalars? We don't know them here.
								// Let's default to 'id' or leave select empty if Prisma allows (it doesn't typically).
								// Actually, if we return an object with take/orderBy but NO select/include, it might fail in a select clause context.
								// But wait, the caller puts this into `query.select`.
								// `select: { boardingProcesses: { take: 1, orderBy: ... } }` is invalid if it doesn't have `select` or `include` inside?
								// Actually `select: { boardingProcesses: { take: 1, select: { ... } } }` is valid.
								// `select: { boardingProcesses: { take: 1 } }` -> "The `select` statement for type ... needs at least one truthy value."
								// So we MUST select something.
								// If the user just says `boardingProcesses:latest`, maybe we assume they want to select * (which is hard in select mode) or we just fail/require subfields.
								// But let's fallback to `id: true` so it doesn't crash, or assume user will provide `boardingProcesses:latest.field` separately?
								// If user provides `boardingProcesses:latest.status`, this block (parts.length === 1) isn't hit for that.
								// This block is hit if they have `fields=boardingProcesses:latest`.
								// Let's add `true` (all fields) if possible? No, `true` doesn't work with args.
								// Let's default to `include` behavior if possible?
								// Logic: If they want args, they get an object. If they don't specify sub-fields, we default to selecting `id`.
							} else {
								acc[part] = true;
							}
						} else if (isLatest && typeof acc[part] === "object") {
							// Already exists (maybe from other fields), add args
							acc[part].take = 1;
							acc[part].orderBy = { createdAt: "desc" };
						}
					}
					return acc;
				},
				{ id: true } as Record<string, any>,
			);

		return fieldSelections;
	}
};

type FieldValidationOptions = {
	disallowedRoots?: string[];
	derivedRoots?: string[];
};

export const normalizeAndValidateFieldSelection = (
	modelName: string,
	fields?: string,
	fieldAliases: Record<string, string> = {},
	options: FieldValidationOptions = {},
): { normalizedFields?: string; errors: string[] } => {
	if (!fields) {
		return { normalizedFields: undefined, errors: [] };
	}

	const disallowedRoots = new Set((options.disallowedRoots || []).map((item) => item.trim()));
	const derivedRoots = new Set((options.derivedRoots || []).map((item) => item.trim()));
	const errors: string[] = [];
	const normalizedPaths: string[] = [];

	for (const rawField of fields.split(",")) {
		const trimmed = rawField.trim();
		if (!trimmed) continue;

		const originalParts = trimmed
			.split(".")
			.map((part) => part.trim())
			.filter(Boolean);
		const originalRoot = originalParts[0]?.replace(/:latest$/, "");
		if (!originalRoot) continue;

		if (disallowedRoots.has(originalRoot)) {
			errors.push(`Invalid field "${originalRoot}". This field is no longer supported.`);
			continue;
		}

		if (derivedRoots.has(originalRoot)) {
			if (originalParts.length > 1) {
				errors.push(
					`Invalid field "${trimmed}". "${originalRoot}" is a derived field and does not support nested selection.`,
				);
				continue;
			}
			const mappedRoot = fieldAliases[originalRoot] || originalRoot;
			normalizedPaths.push(mappedRoot);
			continue;
		}

		const rawParts = resolveFieldPathParts(originalParts, modelName);
		if (originalParts.length > 0 && rawParts.length === 0) {
			errors.push(`Invalid field "${trimmed}" for model "${modelName}".`);
			continue;
		}
		if (rawParts.length === 0) continue;

		const rootRaw = rawParts[0].replace(/:latest$/, "");
		const mappedRoot = fieldAliases[rootRaw] || rootRaw;
		const normalizedParts = [mappedRoot, ...rawParts.slice(1)].map((part) =>
			part.replace(/:latest$/, ""),
		);
		normalizedPaths.push(normalizedParts.join("."));

		let currentModel = modelName;
		for (let i = 0; i < normalizedParts.length; i++) {
			const part = normalizedParts[i];
			const meta = getFieldMeta(currentModel, part);

			if (!meta) {
				errors.push(`Invalid field "${trimmed}" for model "${currentModel}".`);
				break;
			}

			const isLast = i === normalizedParts.length - 1;
			if (!isLast) {
				if (isJsonField(meta)) {
					break;
				}
				if (meta.kind !== "object") {
					errors.push(
						`Invalid nested field "${trimmed}". "${part}" is not a relation on "${currentModel}".`,
					);
					break;
				}
				currentModel = meta.type;
			}
		}
	}

	const dedupedNormalized = Array.from(new Set(normalizedPaths));
	return {
		normalizedFields: dedupedNormalized.length > 0 ? dedupedNormalized.join(",") : undefined,
		errors,
	};
};

/**
 * Look up field metadata in Prisma DMMF for a single field
 */
function getFieldMeta(modelName: string, field: string): DMMF.Field | undefined {
	const model = dmmf.datamodel.models.find((m) => m.name === modelName);
	if (model) {
		return model.fields.find((f) => f.name === field);
	}
	const type = dmmf.datamodel.types.find((t) => t.name === modelName);
	if (type) {
		return type.fields.find((f) => f.name === field);
	}
	return undefined;
}

/**
 * Parse value based on field type
 */
function parseValue(field: DMMF.Field, val: string): any {
	switch (field.type) {
		case "String":
			return val;
		case "Int":
		case "BigInt":
			return parseInt(val, 10);
		case "Float":
		case "Decimal":
			return parseFloat(val);
		case "Boolean":
			return val.toLowerCase() === "true" || val.toLowerCase() === "yes" || val === "1";
		case "DateTime":
			// Support year-mm-dd format (e.g., 2024-01-01) and ISO 8601
			// If it's a date-only string (YYYY-MM-DD), parse it as UTC
			if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
				// Date-only format: set to UTC midnight for consistent comparisons
				return new Date(val + "T00:00:00.000Z");
			}
			// Otherwise, parse as-is (handles ISO 8601 and other formats)
			return new Date(val);
		case "Json":
			try {
				return JSON.parse(val);
			} catch {
				return val;
			}
		default:
			// Handle enums and other types as strings
			return val;
	}
}

/**
 * Parse filter value to extract operator and value
 * Supports: >, <, >=, <=, :, ^, !, ~, and range (-)
 */
function parseFilterOperator(filterValue: string): { operator: string; value: string } {
	// Check for >= and <= first (before > and <)
	if (filterValue.startsWith(">=")) {
		return { operator: ">=", value: filterValue.slice(2) };
	}
	if (filterValue.startsWith("<=")) {
		return { operator: "<=", value: filterValue.slice(2) };
	}
	// Check for > and <
	if (filterValue.startsWith(">")) {
		return { operator: ">", value: filterValue.slice(1) };
	}
	if (filterValue.startsWith("<")) {
		return { operator: "<", value: filterValue.slice(1) };
	}
	// Check for startsWith (^)
	if (filterValue.startsWith("^")) {
		return { operator: "^", value: filterValue.slice(1) };
	}
	// Check for not equals (!)
	if (filterValue.startsWith("!")) {
		return { operator: "!=", value: filterValue.slice(1) };
	}
	// Check for contains (~)
	if (filterValue.startsWith("~")) {
		return { operator: "~", value: filterValue.slice(1) };
	}
	// Check for range (-)
	if (filterValue.includes("-") && !filterValue.startsWith("-")) {
		const parts = filterValue.split("-");
		if (parts.length === 2) {
			return { operator: "-", value: filterValue };
		}
	}
	// Check for null
	if (filterValue.toLowerCase() === "null") {
		return { operator: "null", value: "" };
	}
	// Default: exact match (:)
	return { operator: ":", value: filterValue };
}

/**
 * Build Prisma condition based on operator
 */
function buildOperatorCondition(
	fieldName: string,
	operator: string,
	value: string,
	fieldMeta: DMMF.Field,
): any {
	const parsedValue = value ? parseValue(fieldMeta, value) : null;

	switch (operator) {
		case ">":
			// For DateTime fields with date-only format, ensure we compare correctly
			if (fieldMeta.type === "DateTime" && parsedValue instanceof Date) {
				return { [fieldName]: { gt: parsedValue } };
			}
			return { [fieldName]: { gt: parsedValue } };
		case "<":
			// For DateTime fields with date-only format, ensure we compare correctly
			if (fieldMeta.type === "DateTime" && parsedValue instanceof Date) {
				return { [fieldName]: { lt: parsedValue } };
			}
			return { [fieldName]: { lt: parsedValue } };
		case ">=":
			return { [fieldName]: { gte: parsedValue } };
		case "<=":
			return { [fieldName]: { lte: parsedValue } };
		case "!=":
			return { [fieldName]: { not: parsedValue } };
		case "^":
			// startsWith - only for String fields
			if (fieldMeta.type === "String") {
				return { [fieldName]: { startsWith: parsedValue, mode: "insensitive" } };
			}
			return {};
		case "~":
			// contains - only for String fields
			if (fieldMeta.type === "String") {
				return { [fieldName]: { contains: parsedValue, mode: "insensitive" } };
			}
			return {};
		case "-":
			// range - parse min-max
			const [min, max] = value.split("-");
			const parsedMin = min ? parseValue(fieldMeta, min) : undefined;
			let parsedMax = max ? parseValue(fieldMeta, max) : undefined;

			// For DateTime ranges, ensure end date includes the full day
			if (fieldMeta.type === "DateTime" && parsedMax instanceof Date) {
				const endOfDay = new Date(parsedMax);
				endOfDay.setUTCHours(23, 59, 59, 999);
				parsedMax = endOfDay;
			}

			const rangeCondition: any = {};
			if (parsedMin !== undefined) rangeCondition.gte = parsedMin;
			if (parsedMax !== undefined) rangeCondition.lte = parsedMax;
			return Object.keys(rangeCondition).length > 0 ? { [fieldName]: rangeCondition } : {};
		case "null":
			return { [fieldName]: null };
		case ":":
		default:
			// Exact match
			if (fieldMeta.isList) {
				return { [fieldName]: { has: parsedValue } };
			}
			return { [fieldName]: parsedValue };
	}
}

/**
 * Recursively build Prisma filter condition with operator support
 */
function buildCondition(
	modelName: string,
	path: string[],
	value: string,
	operator: string = ":",
): any {
	if (path.length === 0) return {};

	// Get metadata for the current (first) field
	const fieldMeta = getFieldMeta(modelName, path[0]);
	if (!fieldMeta) return {};

	// Terminal field (scalar or enum)
	if (path.length === 1) {
		if (fieldMeta.kind === "scalar" || fieldMeta.kind === "enum") {
			return buildOperatorCondition(path[0], operator, value, fieldMeta);
		}

		// Support filtering by relation existence (e.g. directReports:exists, directReports:!=null)
		if (fieldMeta.kind === "object") {
			const lowerValue = value ? value.toLowerCase() : "";
			const isAffirmative =
				["true", "exists", "some", "any"].includes(lowerValue) ||
				(operator === "!=" && lowerValue === "null");
			const isNegated =
				["false", "none"].includes(lowerValue) ||
				operator === "null" ||
				(operator === ":" && lowerValue === "null");

			if (fieldMeta.isList) {
				if (isAffirmative) return { [path[0]]: { some: {} } };
				if (isNegated) return { [path[0]]: { none: {} } };
			} else {
				if (isAffirmative) return { [path[0]]: { isNot: null } };
				if (isNegated) return { [path[0]]: { is: null } };
			}
		}

		return {}; // Other terminal fields are not supported for filtering
	}

	if (fieldMeta.kind === "scalar" && fieldMeta.type === "Json") {
		const jsonPath = path.slice(1);
		if (operator === "!=") {
			return { [path[0]]: { path: jsonPath, not: parseValue(fieldMeta, value) } };
		}
		if (operator === "~" || operator === "contains") {
			return {
				[path[0]]: {
					path: jsonPath,
					string_contains: value,
					mode: "insensitive",
				},
			};
		}
		return { [path[0]]: { path: jsonPath, equals: parseValue(fieldMeta, value) } };
	}

	// Non-terminal field: recurse
	const nextModelName = fieldMeta.kind === "object" ? fieldMeta.type : modelName;
	const nestedCondition = buildCondition(nextModelName, path.slice(1), value, operator);

	if (Object.keys(nestedCondition).length === 0) return {};

	if (fieldMeta.kind === "object") {
		if (fieldMeta.isList) {
			// For to-many relations or list composites (e.g., contactInfo.phones)
			return {
				[path[0]]: {
					some: fieldMeta.relationName ? nestedCondition : { is: nestedCondition },
				},
			};
		}
		// For to-one relations or composites (e.g., contactInfo, contactInfo.address)
		return { [path[0]]: fieldMeta.relationName ? nestedCondition : { is: nestedCondition } };
	}

	return {};
}

function splitTopLevelFilterItems(input: string, separator: string): string[] {
	const items: string[] = [];
	let current = "";
	let depth = 0;

	for (const char of input) {
		if (char === "(") depth += 1;
		if (char === ")") depth = Math.max(0, depth - 1);

		if (char === separator && depth === 0) {
			if (current.trim()) items.push(current.trim());
			current = "";
			continue;
		}

		current += char;
	}

	if (current.trim()) {
		items.push(current.trim());
	}

	return items;
}

function parseFilterItem(item: string): { key: string; operator: string; value: string } {
	let key = "";
	let operator = ":";
	let value = "";

	if (item.includes(">=")) {
		const parts = item.split(">=");
		key = parts[0];
		operator = ">=";
		value = parts.slice(1).join(">=");
	} else if (item.includes("<=")) {
		const parts = item.split("<=");
		key = parts[0];
		operator = "<=";
		value = parts.slice(1).join("<=");
	} else if (item.includes(">")) {
		const parts = item.split(">");
		key = parts[0];
		operator = ">";
		value = parts.slice(1).join(">");
	} else if (item.includes("<")) {
		const parts = item.split("<");
		key = parts[0];
		operator = "<";
		value = parts.slice(1).join("<");
	} else if (item.includes("^")) {
		const parts = item.split("^");
		key = parts[0];
		operator = "^";
		value = parts.slice(1).join("^");
	} else if (item.includes("!")) {
		const parts = item.split("!");
		key = parts[0];
		operator = "!=";
		value = parts.slice(1).join("!");
	} else if (item.includes("~")) {
		const parts = item.split("~");
		key = parts[0];
		operator = "~";
		value = parts.slice(1).join("~");
	} else if (item.includes(":")) {
		const colonIndex = item.indexOf(":");
		key = item.substring(0, colonIndex);
		const valuePart = item.substring(colonIndex + 1);
		const isNumericRange = /^\d+(\.\d+)?-\d+(\.\d+)?$/.test(valuePart);
		const isDateRange = /^\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}$/.test(valuePart);

		if (isNumericRange || isDateRange) {
			operator = "-";
			value = valuePart;
		} else {
			operator = ":";
			value = valuePart;
		}
	} else {
		key = item;
	}

	if (value.toLowerCase() === "null") {
		operator = "null";
		value = "";
	}

	return {
		key: key.trim(),
		operator,
		value,
	};
}

/**
 * Parse ?filter=key:value,key>value,key^value,key!value,key~value,key:min-max into an array of Prisma conditions
 * Supports enhanced operators: >, <, >=, <=, :, ^, !, ~, and range (-)
 */
export function buildFilterConditions(modelName: string, filterParam?: string): any[] {
	if (!filterParam) return [];

	const items = splitTopLevelFilterItems(filterParam, ",");

	const groups = new Map<string, Array<{ operator: string; value: string }>>();
	const conditions: any[] = [];

	for (const item of items) {
		if (item.startsWith("or(") && item.endsWith(")")) {
			const branchItems = splitTopLevelFilterItems(item.slice(3, -1), ";");
			const orConditions = branchItems
				.map((branchItem) => parseFilterItem(branchItem))
				.map(({ key, operator, value }) =>
					buildCondition(modelName, key.split("."), value, operator),
				)
				.filter((condition) => Object.keys(condition).length > 0);

			if (orConditions.length > 0) {
				conditions.push({ OR: orConditions });
			}
			continue;
		}

		const { key, operator, value } = parseFilterItem(item);

		if (!groups.has(key)) {
			groups.set(key, []);
		}
		groups.get(key)!.push({ operator, value });
	}

	for (const [rawKey, filterItems] of groups) {
		const path = rawKey.split(".");
		if (filterItems.length === 1) {
			const { operator, value } = filterItems[0];
			const condition = buildCondition(modelName, path, value, operator);
			if (Object.keys(condition).length > 0) {
				conditions.push(condition);
			}
		} else {
			const orConditions = filterItems
				.map(({ operator, value }) => buildCondition(modelName, path, value, operator))
				.filter((c) => Object.keys(c).length > 0);
			if (orConditions.length > 0) {
				conditions.push({ OR: orConditions });
			}
		}
	}

	return conditions;
}

export function appendAndConditions<T extends Record<string, any>>(
	whereClause: T,
	conditions: any[],
): T {
	if (conditions.length === 0) return whereClause;

	const existingAnd = Array.isArray(whereClause.AND)
		? whereClause.AND
		: whereClause.AND
			? [whereClause.AND]
			: [];

	return {
		...whereClause,
		AND: [...existingAnd, ...conditions],
	};
}

/**
 * Build Prisma search conditions for specified String scalar or enum fields (including nested) in a model
 * @throws Error if any provided field is invalid
 */
export function buildSearchConditions(
	modelName: string,
	searchTerm?: string,
	searchFields?: string[],
): any[] {
	if (!searchTerm || !searchFields || searchFields.length === 0) return [];

	const model = dmmf.datamodel.models.find((m) => m.name === modelName);
	if (!model) {
		throw new Error(`Model "${modelName}" not found in Prisma schema`);
	}

	const conditions: any[] = [];
	const invalidFields: string[] = [];
	const validFieldPaths: string[][] = [];

	for (const field of searchFields) {
		const path = field.split(".");
		const isValid = validateFieldPath(modelName, path);
		if (!isValid) {
			invalidFields.push(field);
		} else {
			validFieldPaths.push(path);
			const condition = buildConditionForSearch(modelName, path, searchTerm);
			if (Object.keys(condition).length > 0) {
				conditions.push(condition);
			}
		}
	}

	if (invalidFields.length > 0) {
		throw new Error(
			`Invalid fields found for model "${modelName}": ${invalidFields.join(", ")}. Fields must be scalar String or enum types.`,
		);
	}

	const terms = searchTerm
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (terms.length > 1 && validFieldPaths.length > 0) {
		const termConditions = terms
			.map((term) => {
				const termMatches = validFieldPaths
					.map((path) => buildConditionForSearch(modelName, path, term))
					.filter((condition) => Object.keys(condition).length > 0);
				return termMatches.length > 0 ? { OR: termMatches } : null;
			})
			.filter((condition): condition is { OR: any[] } => Boolean(condition));

		if (termConditions.length > 0) {
			conditions.push({ AND: termConditions });
		}
	}

	return conditions;
}

/**
 * Helper to validate a field path
 */
function validateFieldPath(modelName: string, path: string[]): boolean {
	if (path.length === 0) return false;

	const fieldMeta = getFieldMeta(modelName, path[0]);
	if (!fieldMeta) return false;

	if (path.length === 1) {
		return (
			(fieldMeta.kind === "scalar" && fieldMeta.type === "String" && !fieldMeta.isList) ||
			fieldMeta.kind === "enum"
		);
	}

	if (fieldMeta.kind === "scalar" && fieldMeta.type === "Json") {
		return path.length > 1;
	}

	if (fieldMeta.kind === "object") {
		const nextModelName = fieldMeta.type;
		return validateFieldPath(nextModelName, path.slice(1));
	}

	return false;
}

/**
 * Helper to build search condition for a single field path
 */
function buildConditionForSearch(modelName: string, path: string[], searchTerm: string): any {
	if (path.length === 0) return {};

	// Get metadata for the current (first) field
	const fieldMeta = getFieldMeta(modelName, path[0]);
	if (!fieldMeta) return {};

	// Terminal field (scalar String or enum)
	if (path.length === 1) {
		if (
			fieldMeta.kind === "scalar" &&
			fieldMeta.type === "String" &&
			!fieldMeta.isList
		) {
			return { [path[0]]: { contains: searchTerm, mode: "insensitive" } };
		}
		if (fieldMeta.kind === "enum") {
			return buildEnumSearchCondition(path[0], fieldMeta.type, searchTerm);
		}
		return {}; // Non-scalar String or non-enum fields are not supported
	}

	if (fieldMeta.kind === "scalar" && fieldMeta.type === "Json") {
		return {
			[path[0]]: {
				path: path.slice(1),
				string_contains: searchTerm,
				mode: "insensitive",
			},
		};
	}

	// Non-terminal field: recurse
	const nextModelName = fieldMeta.kind === "object" ? fieldMeta.type : modelName;
	const nestedCondition = buildConditionForSearch(nextModelName, path.slice(1), searchTerm);

	if (Object.keys(nestedCondition).length === 0) return {};

	if (fieldMeta.kind === "object") {
		if (fieldMeta.isList) {
			// For to-many relations or list composites (e.g., contactInfo.phones)
			return {
				[path[0]]: {
					some: fieldMeta.relationName ? nestedCondition : { is: nestedCondition },
				},
			};
		}
		// For to-one relations or composites (e.g., contactInfo, contactInfo.address)
		return { [path[0]]: fieldMeta.relationName ? nestedCondition : { is: nestedCondition } };
	}

	return {};
}

// Helper function to safely access nested values for groupBy function
function getNestedValue(obj: any, path: string): any {
	return path.split(".").reduce((acc, key) => {
		if (acc && typeof acc === "object" && key in acc) {
			return acc[key];
		}
		return undefined;
	}, obj);
}

// Helper function to group data by specified (possibly nested) field
export const groupDataByField = (data: any[], groupBy: string) => {
	const grouped: { [key: string]: any[] } = {};

	data.forEach((item, index) => {
		const groupValue = getNestedValue(item, groupBy) ?? "unassigned";
		if (index === 0) {
			console.log(`🔍 GroupBy="${groupBy}", First item groupValue:`, groupValue);
			console.log(`🔍 First item[position]:`, item.position);
		}
		if (!grouped[groupValue]) {
			grouped[groupValue] = [];
		}
		grouped[groupValue].push(item);
	});

	console.log(`🔍 Grouped keys:`, Object.keys(grouped));
	return grouped;
};

// Build a nested _count selection tree that supports dot-notation paths
// If countBy is provided, we need to include the relation data to group counts later
function buildAggregateSelections(aggregateBy?: string, countBy?: string) {
	if (!aggregateBy) return undefined;

	const root: Record<string, any> = {};

	const addPath = (target: Record<string, any>, parts: string[]) => {
		if (parts.length === 0) return;

		const [head, ...rest] = parts;

		if (rest.length === 0) {
			// Terminal: add to _count selection or include
			if (countBy) {
				// When countBy is specified, we need to include the actual records
				// so we can group them by the specified field in post-processing
				target[head] = target[head] || {};

				// For attendances, we need both the status field and the date field
				// to calculate absent days based on schedule
				if (head === "attendances" && countBy === "status") {
					target[head].select = { [countBy]: true, date: true };
				} else {
					// Only select the field we need to group by
					target[head].select = { [countBy]: true };
				}
			} else {
				// Simple count without grouping
				target._count = target._count || { select: {} };
				target._count.select[head] = true;
			}
			return;
		}

		target[head] = target[head] || { select: {} };
		target[head].select = target[head].select || {};
		addPath(target[head].select as Record<string, any>, rest);
	};

	aggregateBy
		.split(",")
		.map((p) => p.trim())
		.filter(Boolean)
		.forEach((path) => addPath(root, path.split(".")));

	return Object.keys(root).length > 0 ? root : undefined;
}

// Simple deep merge for select/include structures
function mergeDeep(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
	const output: Record<string, any> = { ...target };

	for (const key of Object.keys(source)) {
		const sourceValue = source[key];
		const targetValue = target[key];

		// If source value is an object and target has the same key with an object value, merge recursively
		if (
			sourceValue &&
			typeof sourceValue === "object" &&
			!Array.isArray(sourceValue) &&
			targetValue &&
			typeof targetValue === "object" &&
			!Array.isArray(targetValue)
		) {
			output[key] = mergeDeep(targetValue, sourceValue);
		} else {
			// Otherwise, source value takes precedence
			output[key] = sourceValue;
		}
	}

	return output;
}
