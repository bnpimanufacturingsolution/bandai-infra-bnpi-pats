import {
	documentMatchesType,
	evaluateEmployeeDocumentCompleteness,
	getDocumentReviewStatus,
	resolveDocumentTypeRequirementMeta,
	type EmployeeDocumentPriorityLevel,
} from "./employee-document-priority.helper";

type EmployeeDocumentContext = {
	departmentId?: string | null;
	positionId?: string | null;
	employmentType?: string | null;
	role?: string | null;
};

export type EmployeeDocumentComplianceStatus = "non_compliant" | "warning" | "compliant";

export type EmployeeDocumentComplianceDetail = {
	id: string;
	code: string;
	name: string;
	priorityLevel: EmployeeDocumentPriorityLevel;
	isMandated: boolean;
	requiredForPayroll: boolean;
	requiredForOnboarding: boolean;
	displayOrder: number;
};

export type EmployeeDocumentComplianceRequirementEvaluation = EmployeeDocumentComplianceDetail & {
	isApplicable: boolean;
	isSatisfied: boolean;
};

export type EmployeeDocumentComplianceResult = {
	missingDocuments: EmployeeDocumentComplianceDetail[];
	warningDocuments: EmployeeDocumentComplianceDetail[];
	compliantDocuments: EmployeeDocumentComplianceDetail[];
	applicableDocumentEvaluations: EmployeeDocumentComplianceRequirementEvaluation[];
	overallStatus: EmployeeDocumentComplianceStatus;
	compliancePercent: number;
	applicableMandatedCount: number;
	satisfiedMandatedCount: number;
};

const sortComplianceDetails = (items: EmployeeDocumentComplianceDetail[]) =>
	[...items].sort(
		(left, right) =>
			left.displayOrder - right.displayOrder || left.name.localeCompare(right.name),
	);

export const computeEmployeeDocumentCompliance = (params: {
	documentTypes: any[];
	documents: any[];
	employeeContext?: EmployeeDocumentContext | null;
}): EmployeeDocumentComplianceResult => {
	const { documentTypes, documents, employeeContext } = params;

	const missingDocuments: EmployeeDocumentComplianceDetail[] = [];
	const warningDocuments: EmployeeDocumentComplianceDetail[] = [];
	const compliantDocuments: EmployeeDocumentComplianceDetail[] = [];
	const applicableDocumentEvaluations: EmployeeDocumentComplianceRequirementEvaluation[] = [];

	let applicableMandatedCount = 0;
	let satisfiedMandatedCount = 0;

	for (const documentType of documentTypes) {
		const requirementMeta = resolveDocumentTypeRequirementMeta(documentType, employeeContext);
		if (!requirementMeta.isApplicable) continue;

		const detail: EmployeeDocumentComplianceDetail = {
			id: documentType.id,
			code: documentType.code || documentType.id,
			name: documentType.name || documentType.code || documentType.id,
			priorityLevel: requirementMeta.priorityLevel,
			isMandated: requirementMeta.isMandated,
			requiredForPayroll: requirementMeta.requiredForPayroll,
			requiredForOnboarding: requirementMeta.requiredForOnboarding,
			displayOrder: Number(documentType.displayOrder || 9999),
		};

		const matchingDocuments = documents.filter((document) =>
			documentMatchesType(document, documentType),
		);
		const isSatisfied = matchingDocuments.some((document) => {
			const reviewStatus = getDocumentReviewStatus(document);
			if (reviewStatus === "PENDING" || reviewStatus === "REJECTED") {
				return false;
			}

			return evaluateEmployeeDocumentCompleteness({
				document,
				documentType,
				employeeContext,
			}).isComplete;
		});

		applicableDocumentEvaluations.push({
			...detail,
			isApplicable: true,
			isSatisfied,
		});

		if (detail.isMandated) {
			applicableMandatedCount += 1;
			if (isSatisfied) {
				satisfiedMandatedCount += 1;
				compliantDocuments.push(detail);
			} else {
				missingDocuments.push(detail);
			}
			continue;
		}

		if (!isSatisfied) {
			warningDocuments.push(detail);
		}
	}

	const overallStatus: EmployeeDocumentComplianceStatus =
		missingDocuments.length > 0
			? "non_compliant"
			: warningDocuments.length > 0
				? "warning"
				: "compliant";

	const compliancePercent =
		applicableMandatedCount > 0
			? Math.round((satisfiedMandatedCount / applicableMandatedCount) * 100 * 100) / 100
			: 100;

	return {
		missingDocuments: sortComplianceDetails(missingDocuments),
		warningDocuments: sortComplianceDetails(warningDocuments),
		compliantDocuments: sortComplianceDetails(compliantDocuments),
		applicableDocumentEvaluations: applicableDocumentEvaluations.sort(
			(left, right) =>
				left.displayOrder - right.displayOrder || left.name.localeCompare(right.name),
		),
		overallStatus,
		compliancePercent,
		applicableMandatedCount,
		satisfiedMandatedCount,
	};
};
