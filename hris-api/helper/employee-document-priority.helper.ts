import { Prisma, PrismaClient } from "../generated/prisma";
import {
	extractDocumentReviewSnapshot,
	getDocumentReviewStatusValue,
} from "./document-review.helper";

export type EmployeeDocumentPriorityState =
	| "missing_required"
	| "rejected"
	| "pending_approval"
	| "expired"
	| "needs_update"
	| "ready"
	| "optional";

export type EmployeeDocumentPriorityLevel = "high" | "medium" | "low";

type EmployeeDocumentTypeField = {
	key?: string | null;
	type?: string | null;
	required?: boolean | null;
};

type EmployeeDocumentContext = {
	departmentId?: string | null;
	positionId?: string | null;
	employmentType?: string | null;
	role?: string | null;
};

type EmployeeDocumentFieldValues = Prisma.JsonValue | Record<string, unknown> | null | undefined;

const RESERVED_DOCUMENT_FIELD_KEYS = new Set(["number", "issueDate", "expiryDate"]);

export type EmployeeDocumentPriorityItem = {
	key: string;
	type: string;
	documentTypeId?: string | null;
	category?: string | null;
	displayName: string;
	name?: string | null;
	number?: string | null;
	issueDate?: string | null;
	expiryDate?: string | null;
	fileUrl?: string | null;
	ext?: string | null;
	documentId?: string | null;
	priorityState: EmployeeDocumentPriorityState;
	actionLabel?: "Upload" | "Fill up" | "Update" | null;
	actionDescription?: string | null;
	isActionable: boolean;
	isVirtual: boolean;
	isExpired: boolean;
	displayOrder: number;
	priorityLevel: EmployeeDocumentPriorityLevel;
	isMandated: boolean;
	requiredForPayroll: boolean;
	requiredForOnboarding: boolean;
	requireFileForCompliance: boolean;
};

export type EmployeeDocumentPrioritySummary = {
	totalActionable: number;
	missingRequired: number;
	rejected: number;
	expired: number;
	needsUpdate: number;
	ready: number;
	optional: number;
};

export type EmployeeDocumentPriorityCategorySummary = {
	key: string;
	label: string;
	total: number;
	missingRequired: number;
	rejected: number;
	expired: number;
	needsUpdate: number;
	optional: number;
};

export const EMPLOYEE_DOCUMENT_PRIORITY_ORDER: Record<EmployeeDocumentPriorityState, number> = {
	missing_required: 0,
	rejected: 1,
	pending_approval: 2,
	expired: 3,
	needs_update: 4,
	ready: 5,
	optional: 6,
};

export const normalizeEmployeeDocumentTypeKey = (value: unknown) => {
	const normalized = String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");
	if (normalized === "tin" || normalized === "tinid" || normalized.includes("taxidentification")) {
		return "tin";
	}
	if (normalized === "sss" || normalized === "sssid" || normalized.includes("socialsecurity")) {
		return "sss";
	}
	if (normalized.includes("philhealth")) return "philhealth";
	if (normalized.includes("pagibig") || normalized.includes("hdmf")) return "pagibig";
	if (
		normalized === "validid" ||
		normalized === "governmentid" ||
		normalized === "validgovernmentid"
	) {
		return "validid";
	}
	return normalized;
};

const normalizeComparableValue = (value: unknown) =>
	String(value || "")
		.trim()
		.toLowerCase();

const toComparableArray = (value: unknown): string[] => {
	if (!value) return [];
	if (Array.isArray(value)) {
		return value.map((item) => normalizeComparableValue(item)).filter(Boolean);
	}
	if (typeof value === "string") {
		return value
			.split(",")
			.map((item) => normalizeComparableValue(item))
			.filter(Boolean);
	}
	return [];
};

const toBoolean = (value: unknown) => value === true || String(value || "").trim() === "true";

const getMetadataRecord = (value: unknown) =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

export const getDocumentReviewSnapshot = (value: unknown) => {
	return extractDocumentReviewSnapshot(value);
};

export const getDocumentReviewStatus = (value: unknown) => {
	return getDocumentReviewStatusValue(value);
};

export const isDocumentApprovedForCompliance = (document: {
	metadata?: unknown;
}) => {
	const reviewStatus = getDocumentReviewStatus(document);
	if (!reviewStatus) return true;
	return reviewStatus === "APPROVED";
};

export const isDocumentPendingApproval = (document: { metadata?: unknown }) =>
	getDocumentReviewStatus(document) === "PENDING";

export const isDocumentRejected = (document: { metadata?: unknown }) =>
	getDocumentReviewStatus(document) === "REJECTED";

const getMetadataScope = (metadata: Record<string, unknown>, keys: string[]) =>
	keys.flatMap((key) => toComparableArray(metadata[key]));

export const getDocumentTypeFields = (documentType: any): EmployeeDocumentTypeField[] =>
	Array.isArray(documentType?.fields) ? (documentType.fields as EmployeeDocumentTypeField[]) : [];

export const getRequiredDocumentTypeFields = (documentType: any): EmployeeDocumentTypeField[] =>
	getDocumentTypeFields(documentType).filter((field) => field?.required);

const getDocumentFieldValuesRecord = (
	fieldValues: EmployeeDocumentFieldValues,
): Record<string, unknown> | null =>
	fieldValues && typeof fieldValues === "object" && !Array.isArray(fieldValues)
		? (fieldValues as Record<string, unknown>)
		: null;

export const getDocumentFieldValue = (
	document: {
		number?: string | null;
		issueDate?: Date | string | null;
		expiryDate?: Date | string | null;
		fieldValues?: EmployeeDocumentFieldValues;
	},
	fieldKey?: string | null,
) => {
	const normalizedFieldKey = String(fieldKey || "").trim();
	if (!normalizedFieldKey) return undefined;

	if (RESERVED_DOCUMENT_FIELD_KEYS.has(normalizedFieldKey)) {
		return (document as any)?.[normalizedFieldKey];
	}

	return getDocumentFieldValuesRecord(document.fieldValues)?.[normalizedFieldKey];
};

export const documentMatchesType = (document: any, documentType: any) => {
	if (!documentType) return false;
	if (document?.documentTypeId && document.documentTypeId === documentType.id) return true;
	const documentKeys = [document?.documentTypeId, document?.type, document?.name].map(
		normalizeEmployeeDocumentTypeKey,
	);
	const documentTypeKeys = [documentType?.id, documentType?.code, documentType?.name].map(
		normalizeEmployeeDocumentTypeKey,
	);

	return documentKeys.some(
		(documentKey) => documentKey && documentTypeKeys.includes(documentKey),
	);
};

const matchesScope = (scopes: string[], actualValue: unknown) => {
	if (scopes.length === 0) return true;
	const normalizedActual = normalizeComparableValue(actualValue);
	if (!normalizedActual) return false;
	return scopes.includes(normalizedActual);
};

const resolvePriorityLevel = (params: {
	metadata: Record<string, unknown>;
	isMandated: boolean;
	requiredForPayroll: boolean;
}): EmployeeDocumentPriorityLevel => {
	const rawPriority = normalizeComparableValue(
		params.metadata.priorityLevel ||
			params.metadata.priority ||
			params.metadata.compliancePriority ||
			"",
	);

	if (rawPriority === "critical" || rawPriority === "urgent" || rawPriority === "high") {
		return "high";
	}
	if (rawPriority === "medium" || rawPriority === "normal") {
		return "medium";
	}
	if (rawPriority === "low" || rawPriority === "optional") {
		return "low";
	}

	if (params.requiredForPayroll) return "high";
	return params.isMandated ? "medium" : "low";
};

export const resolveDocumentTypeRequirementMeta = (
	documentType: any,
	employeeContext?: EmployeeDocumentContext | null,
) => {
	const metadata = getMetadataRecord(documentType?.metadata);
	const departmentScope = getMetadataScope(metadata, [
		"departments",
		"departmentIds",
		"requiredForDepartments",
	]);
	const positionScope = getMetadataScope(metadata, [
		"positions",
		"positionIds",
		"requiredForPositions",
	]);
	const employmentTypeScope = getMetadataScope(metadata, [
		"employmentTypes",
		"requiredForEmploymentTypes",
	]);
	const roleScope = getMetadataScope(metadata, ["roles", "requiredForRoles"]);

	const isApplicable =
		matchesScope(departmentScope, employeeContext?.departmentId) &&
		matchesScope(positionScope, employeeContext?.positionId) &&
		matchesScope(employmentTypeScope, employeeContext?.employmentType) &&
		matchesScope(roleScope, employeeContext?.role);

	const requiredForPayroll = toBoolean(metadata.requiredForPayroll);
	const requiredForOnboarding = toBoolean(metadata.requiredForOnboarding);
	const requireFileForCompliance = toBoolean(metadata.requireFileForCompliance);
	const metadataMandated =
		toBoolean(metadata.mandated) ||
		toBoolean(metadata.isMandatory) ||
		toBoolean(metadata.mandatory);
	const isMandated = Boolean(
		documentType?.isRequired || requiredForPayroll || requiredForOnboarding || metadataMandated,
	);

	const priorityLevel = resolvePriorityLevel({
		metadata,
		isMandated,
		requiredForPayroll,
	});

	return {
		isApplicable,
		isMandated,
		priorityLevel,
		requiredForPayroll,
		requiredForOnboarding,
		requireFileForCompliance,
	};
};

export const isEmployeeVisibleActionableDocumentType = (
	documentType: any,
	employeeContext?: EmployeeDocumentContext | null,
) => {
	if (!documentType?.isEmployeeVisible) return false;
	if (!(documentType?.uploadBy === "EMPLOYEE" || documentType?.uploadBy === "BOTH")) return false;
	const requirementMeta = resolveDocumentTypeRequirementMeta(documentType, employeeContext);
	return requirementMeta.isApplicable;
};

export const isEmployeeDocumentValueEmpty = (value: unknown) => {
	if (value === null || value === undefined) return true;
	if (value instanceof Date) return Number.isNaN(value.getTime());
	if (typeof value === "string") return value.trim() === "";
	if (typeof value === "boolean") return false;
	if (Array.isArray(value)) return value.length === 0;
	if (typeof value === "object")
		return Object.keys(value as Record<string, unknown>).length === 0;
	return false;
};

export const evaluateEmployeeDocumentCompleteness = (params: {
	document: {
		number?: string | null;
		issueDate?: Date | string | null;
		expiryDate?: Date | string | null;
		fileUrl?: string | null;
		fieldValues?: EmployeeDocumentFieldValues;
	};
	documentType: any;
	employeeContext?: EmployeeDocumentContext | null;
}) => {
	const { document, documentType, employeeContext } = params;
	const requirementMeta = resolveDocumentTypeRequirementMeta(documentType, employeeContext);
	const requiredFields = getRequiredDocumentTypeFields(documentType);
	const requiresFile =
		requirementMeta.requireFileForCompliance ||
		requiredFields.some((field) => String(field?.type || "").toLowerCase() === "file");

	const missingRequiredFields = requiredFields.filter((field) => {
		if (String(field?.type || "").toLowerCase() === "file") return false;
		const rawValue = getDocumentFieldValue(document, field.key);

		return isEmployeeDocumentValueEmpty(rawValue);
	});

	const missingFile = requiresFile && !String(document.fileUrl || "").trim();
	const expiryDate =
		document.expiryDate instanceof Date
			? document.expiryDate
			: document.expiryDate
				? new Date(document.expiryDate)
				: null;
	const expired = expiryDate ? expiryDate.getTime() < Date.now() : false;

	return {
		requirementMeta,
		requiredFields,
		requiresFile,
		missingRequiredFields,
		expired,
		missingFile,
		isComplete: !missingFile && missingRequiredFields.length === 0 && !expired,
	};
};

const isEmployeeActionableDocumentType = (
	documentType: any,
	employeeContext?: EmployeeDocumentContext | null,
	requirementMeta?: ReturnType<typeof resolveDocumentTypeRequirementMeta>,
) => {
	const resolvedRequirementMeta =
		requirementMeta || resolveDocumentTypeRequirementMeta(documentType, employeeContext);
	if (!documentType?.isEmployeeVisible) return false;
	if (!(documentType?.uploadBy === "EMPLOYEE" || documentType?.uploadBy === "BOTH")) return false;
	return resolvedRequirementMeta.isApplicable;
};

const getPriorityAction = (params: {
	priorityState: EmployeeDocumentPriorityState;
	isEmployeeActionable: boolean;
	missingRequiredFieldsCount: number;
	missingFile: boolean;
}): Pick<EmployeeDocumentPriorityItem, "actionLabel" | "actionDescription"> => {
	if (!params.isEmployeeActionable) {
		return {
			actionLabel: null,
			actionDescription: null,
		};
	}

	if (params.priorityState === "missing_required") {
		return {
			actionLabel: "Upload",
			actionDescription: "Required document missing",
		};
	}

	if (params.priorityState === "rejected") {
		return {
			actionLabel: "Update",
			actionDescription: "Re-upload the corrected document",
		};
	}

	if (params.priorityState === "pending_approval") {
		return {
			actionLabel: null,
			actionDescription: "Awaiting HR approval",
		};
	}

	if (params.priorityState === "expired") {
		return {
			actionLabel: "Update",
			actionDescription: "Renew the expired document",
		};
	}

	if (params.priorityState === "optional") {
		if (params.missingFile) {
			return {
				actionLabel: "Upload",
				actionDescription: "Add this when applicable",
			};
		}

		if (params.missingRequiredFieldsCount > 0) {
			return {
				actionLabel: "Fill up",
				actionDescription: "Add this when applicable",
			};
		}

		return {
			actionLabel: "Upload",
			actionDescription: "Add this when applicable",
		};
	}

	if (params.priorityState !== "needs_update") {
		return {
			actionLabel: null,
			actionDescription: null,
		};
	}

	if (params.missingFile) {
		return {
			actionLabel: "Upload",
			actionDescription: "Upload required file",
		};
	}

	if (params.missingRequiredFieldsCount > 0) {
		return {
			actionLabel: "Fill up",
			actionDescription: "Complete required details",
		};
	}

	return {
		actionLabel: "Update",
		actionDescription: "Update document details",
	};
};

export async function getEmployeeDocumentPriorityData(params: {
	prisma: PrismaClient;
	employeeId: string;
	organizationId: string;
}): Promise<{
	items: EmployeeDocumentPriorityItem[];
	summary: EmployeeDocumentPrioritySummary;
	categories: EmployeeDocumentPriorityCategorySummary[];
}> {
	const { prisma, employeeId, organizationId } = params;

	const [documentTypes, existingDocuments, employeeContext] = await Promise.all([
		prisma.documentType.findMany({
			where: {
				organizationId,
				isActive: true,
				isDeleted: false,
			},
			orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
			select: {
				id: true,
				code: true,
				name: true,
				category: true,
				uploadBy: true,
				isRequired: true,
				isEmployeeVisible: true,
				displayOrder: true,
				fields: true,
				metadata: true,
			},
		}),
		prisma.document.findMany({
			where: {
				employeeId,
				isDeleted: false,
			},
			orderBy: [{ createdAt: "asc" }],
			select: {
				id: true,
				documentTypeId: true,
				type: true,
				name: true,
				number: true,
				issueDate: true,
				expiryDate: true,
				fileUrl: true,
				ext: true,
				fieldValues: true,
				metadata: true,
				reviewStatus: true,
				reviewSubmittedAt: true,
				reviewSubmittedById: true,
				reviewApprovedAt: true,
				reviewApprovedById: true,
				reviewRejectedAt: true,
				reviewRejectedById: true,
				reviewRejectionReason: true,
				reviewSource: true,
			},
		}),
		prisma.employee.findUnique({
			where: { id: employeeId },
			select: {
				departmentId: true,
				positionId: true,
				employmentType: true,
				role: true,
			},
		}),
	]);

	const documentTypeById = new Map(
		documentTypes.map((documentType) => [documentType.id, documentType]),
	);
	const documentTypeByCode = new Map(
		documentTypes.flatMap((documentType) => {
			const keys = [documentType.id, documentType.code, documentType.name]
				.map(normalizeEmployeeDocumentTypeKey)
				.filter(Boolean);
			return keys.map((key) => [key, documentType] as const);
		}),
	);

	const matchedDocumentTypeForDocument = (document: (typeof existingDocuments)[number]) => {
		if (document.documentTypeId) {
			const matchedById = documentTypeById.get(document.documentTypeId);
			if (matchedById) return matchedById;
		}

		const normalizedCode = normalizeEmployeeDocumentTypeKey(document.type);
		if (!normalizedCode) return null;
		return documentTypeByCode.get(normalizedCode) || null;
	};

	const items: EmployeeDocumentPriorityItem[] = [];
	const matchedDocumentIds = new Set<string>();

	for (const documentType of documentTypes) {
		const requirementMeta = resolveDocumentTypeRequirementMeta(documentType, employeeContext);
		const isEmployeeActionable = isEmployeeActionableDocumentType(
			documentType,
			employeeContext,
			requirementMeta,
		);
		const matchingDocuments = existingDocuments.filter((document) =>
			documentMatchesType(document, documentType),
		);

		matchingDocuments.forEach((document) => matchedDocumentIds.add(document.id));

		if (!requirementMeta.isApplicable && matchingDocuments.length === 0) continue;
		if (!requirementMeta.isMandated && !isEmployeeActionable && matchingDocuments.length === 0) {
			continue;
		}

		if (matchingDocuments.length === 0) {
			const priorityState: EmployeeDocumentPriorityState = requirementMeta.isMandated
				? "missing_required"
				: "optional";
			const action = getPriorityAction({
				priorityState,
				isEmployeeActionable,
				missingRequiredFieldsCount: 0,
				missingFile: false,
			});

			items.push({
				key: `missing-${documentType.id}`,
				type: documentType.code,
				documentTypeId: documentType.id,
				category: documentType.category || null,
				displayName: documentType.name,
				name: documentType.name,
				number: null,
				issueDate: null,
				expiryDate: null,
				fileUrl: null,
				ext: null,
				priorityState,
				actionLabel: action.actionLabel,
				actionDescription: action.actionDescription,
				isActionable: isEmployeeActionable,
				isVirtual: true,
				isExpired: false,
				displayOrder: Number(documentType.displayOrder || 9999),
				priorityLevel: requirementMeta.priorityLevel,
				isMandated: requirementMeta.isMandated,
				requiredForPayroll: requirementMeta.requiredForPayroll,
				requiredForOnboarding: requirementMeta.requiredForOnboarding,
				requireFileForCompliance: requirementMeta.requireFileForCompliance,
			});
			continue;
		}

		const evaluatedDocuments = matchingDocuments.map((document) => ({
			document,
			evaluation: evaluateEmployeeDocumentCompleteness({
				document,
				documentType,
				employeeContext,
			}),
		}));
		const representativeMatch =
			[...evaluatedDocuments].reverse().find((item) => item.evaluation.isComplete) ||
			evaluatedDocuments[evaluatedDocuments.length - 1];
		const { document: representativeDocument, evaluation } = representativeMatch;
		const { missingRequiredFields, expired, missingFile } = evaluation;
		const reviewStatus = getDocumentReviewStatus(representativeDocument);

		const isApplicableMandated = requirementMeta.isApplicable && requirementMeta.isMandated;
		let priorityState: EmployeeDocumentPriorityState = "optional";
		if (reviewStatus === "REJECTED") {
			priorityState = "rejected";
		} else if (reviewStatus === "PENDING") {
			priorityState = "pending_approval";
		} else if (expired) {
			priorityState = "expired";
		} else if (evaluation.isComplete) {
			priorityState = "ready";
		} else if (isApplicableMandated) {
			priorityState = "needs_update";
		}

		const action = getPriorityAction({
			priorityState,
			isEmployeeActionable,
			missingRequiredFieldsCount: missingRequiredFields.length,
			missingFile,
		});

		items.push({
			key: representativeDocument.id,
			type: documentType.code,
			documentTypeId: documentType.id,
			category: documentType.category || null,
			displayName:
				representativeDocument.name ||
				documentType.name ||
				String(documentType.code || "Document"),
			name: representativeDocument.name || null,
			number: representativeDocument.number || null,
			issueDate: representativeDocument.issueDate
				? representativeDocument.issueDate.toISOString()
				: null,
			expiryDate: representativeDocument.expiryDate
				? representativeDocument.expiryDate.toISOString()
				: null,
			fileUrl: representativeDocument.fileUrl || null,
			ext: representativeDocument.ext || null,
			documentId: representativeDocument.id,
			priorityState,
			actionLabel: action.actionLabel,
			actionDescription: action.actionDescription,
			isActionable:
				isEmployeeActionable &&
				priorityState !== "ready" &&
				priorityState !== "pending_approval",
			isVirtual: false,
			isExpired: expired,
			displayOrder: Number(documentType.displayOrder || 9999),
			priorityLevel: requirementMeta.priorityLevel,
			isMandated: isApplicableMandated,
			requiredForPayroll: requirementMeta.requiredForPayroll,
			requiredForOnboarding: requirementMeta.requiredForOnboarding,
			requireFileForCompliance: requirementMeta.requireFileForCompliance,
		});
	}

	for (const document of existingDocuments) {
		if (matchedDocumentIds.has(document.id)) continue;

		const matchedDocumentType = matchedDocumentTypeForDocument(document);
		const documentEvaluation = evaluateEmployeeDocumentCompleteness({
			document,
			documentType: matchedDocumentType,
			employeeContext,
		});
		const requirementMeta = documentEvaluation.requirementMeta;

		items.push({
			key: document.id,
			type: matchedDocumentType?.code || document.type,
			documentTypeId: matchedDocumentType?.id || document.documentTypeId || null,
			category: matchedDocumentType?.category || null,
			displayName:
				document.name || matchedDocumentType?.name || String(document.type || "Document"),
			name: document.name || null,
			number: document.number || null,
			issueDate: document.issueDate ? document.issueDate.toISOString() : null,
			expiryDate: document.expiryDate ? document.expiryDate.toISOString() : null,
			fileUrl: document.fileUrl || null,
			ext: document.ext || null,
			documentId: document.id,
			priorityState:
				getDocumentReviewStatus(document) === "REJECTED"
					? "rejected"
				: getDocumentReviewStatus(document) === "PENDING"
					? "pending_approval"
					: documentEvaluation.expired
						? "expired"
						: "optional",
			actionLabel:
				getDocumentReviewStatus(document) === "REJECTED" || documentEvaluation.expired
					? "Update"
					: null,
			actionDescription:
				getDocumentReviewStatus(document) === "REJECTED"
					? "Re-upload the corrected document"
					: getDocumentReviewStatus(document) === "PENDING"
						? "Awaiting HR approval"
					: documentEvaluation.expired
						? "Renew the expired document"
						: null,
			isActionable:
				getDocumentReviewStatus(document) === "REJECTED" || documentEvaluation.expired,
			isVirtual: false,
			isExpired: documentEvaluation.expired,
			displayOrder: Number(matchedDocumentType?.displayOrder || 9999),
			priorityLevel: requirementMeta.priorityLevel,
			isMandated: false,
			requiredForPayroll: requirementMeta.requiredForPayroll,
			requiredForOnboarding: requirementMeta.requiredForOnboarding,
			requireFileForCompliance: requirementMeta.requireFileForCompliance,
		});
	}

	items.sort((left, right) => {
		const priorityDelta =
			EMPLOYEE_DOCUMENT_PRIORITY_ORDER[left.priorityState] -
			EMPLOYEE_DOCUMENT_PRIORITY_ORDER[right.priorityState];
		if (priorityDelta !== 0) return priorityDelta;

		if (left.displayOrder !== right.displayOrder) {
			return left.displayOrder - right.displayOrder;
		}

		return left.displayName.localeCompare(right.displayName);
	});

	const summary = {
		totalActionable: items.filter((item) => item.isActionable).length,
		missingRequired: items.filter(
			(item) => item.isActionable && item.priorityState === "missing_required",
		).length,
		rejected: items.filter((item) => item.isActionable && item.priorityState === "rejected")
			.length,
		expired: items.filter((item) => item.isActionable && item.priorityState === "expired")
			.length,
		needsUpdate: items.filter(
			(item) => item.isActionable && item.priorityState === "needs_update",
		).length,
		ready: items.filter((item) => item.priorityState === "ready").length,
		optional: items.filter((item) => item.priorityState === "optional").length,
	};

	const categoriesMap = new Map<string, EmployeeDocumentPriorityCategorySummary>();
	for (const item of items) {
		const key = String(item.category || "OTHER").trim().toUpperCase() || "OTHER";
		const existing = categoriesMap.get(key) || {
			key,
			label: key.replace(/_/g, " "),
			total: 0,
			missingRequired: 0,
			rejected: 0,
			expired: 0,
			needsUpdate: 0,
			optional: 0,
		};
		existing.total += 1;
		if (item.isActionable && item.priorityState === "missing_required") existing.missingRequired += 1;
		if (item.isActionable && item.priorityState === "rejected") existing.rejected += 1;
		if (item.isActionable && item.priorityState === "expired") existing.expired += 1;
		if (item.isActionable && item.priorityState === "needs_update") existing.needsUpdate += 1;
		if (item.priorityState === "optional") existing.optional += 1;
		categoriesMap.set(key, existing);
	}

	const categories = [...categoriesMap.values()].sort((left, right) =>
		left.label.localeCompare(right.label),
	);

	return {
		items,
		summary,
		categories,
	};
}
