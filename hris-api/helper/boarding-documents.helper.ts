import {
	Prisma,
	PrismaClient,
	ChecklistCategory,
	Priority,
	ChecklistStatus,
	EmploymentStatus,
	type DocumentType,
} from "../generated/prisma";
import { getLogger } from "./logger.helper";
import { createBoardingProcess } from "./boarding.helper";
import { ensureOnboardingChecklistForEmployee } from "../app/onboarding/onboardingLifecycle.helper";
import {
	evaluateEmployeeDocumentCompleteness,
	getDocumentReviewSnapshot,
	getDocumentReviewStatus,
	resolveDocumentTypeRequirementMeta,
} from "./employee-document-priority.helper";

const logger = getLogger();
const docLogger = logger.child({ module: "boarding-documents-helper" });

const normalizeDocumentKey = (value: unknown) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");

const resolveChecklistCategory = (category?: string | null): ChecklistCategory => {
	switch (String(category || "").trim().toUpperCase()) {
		case "COMPLIANCE":
			return ChecklistCategory.COMPLIANCE;
		case "PAYROLL":
			return ChecklistCategory.PAYROLL;
		case "ONBOARDING":
		case "LEGAL":
			return ChecklistCategory.HR_DOCUMENTATION;
		default:
			return ChecklistCategory.OTHER;
	}
};

const resolveChecklistPriority = (params: {
	isRequired: boolean;
	priorityLevel?: "high" | "medium" | "low";
}): Priority => {
	if (params.priorityLevel === "high") return Priority.HIGH;
	if (params.priorityLevel === "low") return Priority.LOW;
	if (params.priorityLevel === "medium") return Priority.MEDIUM;
	return params.isRequired ? Priority.HIGH : Priority.MEDIUM;
};

const buildChecklistTitle = (documentType: Pick<DocumentType, "name">) =>
	`Complete ${documentType.name}`;

const buildChecklistDescription = (
	documentType: Pick<DocumentType, "name" | "uploadBy">,
	reviewStatus?: "FOR_REVIEW" | "REJECTED" | null,
) => {
	if (reviewStatus === "FOR_REVIEW") {
		switch (documentType.uploadBy) {
			case "HR":
				return `${documentType.name} is ready for HR review and approval.`;
			case "BOTH":
				return `${documentType.name} has been submitted and is awaiting HR review. Coordinate with HR if follow-up is needed.`;
			case "EMPLOYEE":
			default:
				return `${documentType.name} has been submitted and is awaiting HR approval.`;
		}
	}

	if (reviewStatus === "REJECTED") {
		switch (documentType.uploadBy) {
			case "HR":
				return `${documentType.name} was sent back for correction and still needs HR action to finish onboarding.`;
			case "BOTH":
				return `${documentType.name} was reviewed and needs correction before HR can approve it. Coordinate with HR to finish this requirement.`;
			case "EMPLOYEE":
			default:
				return `${documentType.name} was reviewed and needs correction before approval.`;
		}
	}

	switch (documentType.uploadBy) {
		case "HR":
			return `${documentType.name} still needs to be set up during onboarding. HR will complete this requirement.`;
		case "BOTH":
			return `${documentType.name} still needs to be completed during onboarding. Coordinate with HR to finish this requirement.`;
		case "EMPLOYEE":
		default:
			return `${documentType.name} still needs to be completed during onboarding.`;
	}
};

type PendingDocumentChecklistCandidate = {
	documentTypeId: string;
	code: string;
	name: string;
	category: ChecklistCategory;
	priority: Priority;
	isOptional: boolean;
	displayOrder: number;
	uploadBy: string;
	checklistStatus: ChecklistStatus;
	reviewStatus?: "FOR_REVIEW" | "REJECTED" | null;
	documentId?: string | null;
	documentDisplayName?: string | null;
	documentNumber?: string | null;
	documentIssueDate?: string | null;
	documentExpiryDate?: string | null;
	documentFileUrl?: string | null;
	documentExt?: string | null;
	documentFieldValues?: Prisma.InputJsonValue | null;
	reviewSubmittedAt?: string | null;
	reviewSubmittedByEmployeeId?: string | null;
	reviewSubmittedByLabel?: string | null;
	reviewApprovedAt?: string | null;
	reviewApprovedByEmployeeId?: string | null;
	reviewApprovedByLabel?: string | null;
	reviewRejectedAt?: string | null;
	reviewRejectedByEmployeeId?: string | null;
	reviewRejectedByLabel?: string | null;
	reviewRejectionReason?: string | null;
};

type DocumentChecklistIdentity = {
	documentTypeId: string;
	documentCode: string;
	documentName?: string;
};

interface GetPendingDocumentChecklistCandidatesParams {
	prisma: PrismaClient;
	organizationId: string;
	employeeId: string;
	processId?: string;
}

interface CreateDocumentChecklistParams extends GetPendingDocumentChecklistCandidatesParams {
	processId: string;
	targetDate: Date;
}

interface ReconcileEmployeeOnboardingStateParams {
	prisma: PrismaClient;
	organizationId: string;
	employeeId: string;
	targetDate?: Date | null;
	departmentId?: string | null;
	role?: string | null;
}

interface SyncOnboardingProcessProgressParams {
	prisma: PrismaClient;
	processId: string;
}

const ACTIVE_ONBOARDING_STATUSES = ["NOT_STARTED", "IN_PROGRESS"] as const;

const buildDocumentChecklistIdentity = (
	input:
		| PendingDocumentChecklistCandidate
		| {
				documentTypeId?: string | null;
				code?: string | null;
				name?: string | null;
		  },
): DocumentChecklistIdentity => ({
	documentTypeId: String(input?.documentTypeId || "").trim(),
	documentCode: String(input?.code || "").trim(),
	documentName: input?.name ? String(input.name).trim() : undefined,
});

const getDocumentIdentityKey = (identity: {
	documentTypeId?: string | null;
	documentCode?: string | null;
}) => {
	const documentTypeId = String(identity?.documentTypeId || "").trim();
	if (documentTypeId) return `id:${documentTypeId}`;

	const normalizedCode = normalizeDocumentKey(identity?.documentCode);
	return normalizedCode ? `code:${normalizedCode}` : "";
};

const getChecklistItemDocumentIdentity = (metadata: unknown): DocumentChecklistIdentity => {
	const record = (metadata || {}) as Record<string, any>;
	return {
		documentTypeId: String(record.documentTypeId || "").trim(),
		documentCode: String(record.documentCode || record.documentType || "").trim(),
		documentName: record.documentName ? String(record.documentName).trim() : undefined,
	};
};

export const isSystemGeneratedDocumentChecklistItem = (metadata: unknown) => {
	const record = (metadata || {}) as Record<string, any>;
	if (!record || record.isSystemGenerated !== true) return false;
	return Boolean(getDocumentIdentityKey(getChecklistItemDocumentIdentity(record)));
};

const toInputJsonValue = (value: Prisma.JsonValue | null | undefined): Prisma.InputJsonValue | null =>
	value === null || value === undefined ? null : (value as Prisma.InputJsonValue);

const buildChecklistMetadata = (
	candidate: PendingDocumentChecklistCandidate,
	existingMetadata?: Record<string, any> | null,
) =>
	({
	...(existingMetadata || {}),
	documentTypeId: candidate.documentTypeId,
	documentCode: candidate.code,
	documentName: candidate.name,
	documentType: candidate.code,
	documentDisplayOrder: candidate.displayOrder,
	uploadBy: candidate.uploadBy,
	documentId: candidate.documentId || null,
	documentDisplayName: candidate.documentDisplayName || null,
	documentNumber: candidate.documentNumber || null,
	documentIssueDate: candidate.documentIssueDate || null,
	documentExpiryDate: candidate.documentExpiryDate || null,
	documentFileUrl: candidate.documentFileUrl || null,
	documentExt: candidate.documentExt || null,
	documentFieldValues: candidate.documentFieldValues || null,
	reviewStatus: candidate.reviewStatus || null,
	reviewSubmittedAt: candidate.reviewSubmittedAt || null,
	reviewSubmittedByEmployeeId: candidate.reviewSubmittedByEmployeeId || null,
	reviewSubmittedByLabel: candidate.reviewSubmittedByLabel || null,
	reviewApprovedAt: candidate.reviewApprovedAt || null,
	reviewApprovedByEmployeeId: candidate.reviewApprovedByEmployeeId || null,
	reviewApprovedByLabel: candidate.reviewApprovedByLabel || null,
	reviewRejectedAt: candidate.reviewRejectedAt || null,
	reviewRejectedByEmployeeId: candidate.reviewRejectedByEmployeeId || null,
	reviewRejectedByLabel: candidate.reviewRejectedByLabel || null,
	reviewRejectionReason: candidate.reviewRejectionReason || null,
	isSystemGenerated: true,
	}) as Prisma.InputJsonObject;

export const syncEmployeeEmploymentStatus = async (params: {
	prisma: PrismaClient;
	employeeId: string;
}) => {
	const employee = await params.prisma.employee.findUnique({
		where: { id: params.employeeId },
		select: { id: true, employmentStatus: true },
	});

	if (!employee) return null;

	const activeOnboardingProcesses = await params.prisma.boardingProcess.findMany({
		where: {
			employeeId: params.employeeId,
			type: "ONBOARDING",
			status: { in: [...ACTIVE_ONBOARDING_STATUSES] },
			isDeleted: false,
		},
		select: {
			id: true,
			checklistItems: {
				where: { isDeleted: false },
				select: { status: true },
			},
		},
	});

	const hasPendingLegacyOnboarding = activeOnboardingProcesses.some((process) =>
		process.checklistItems.some((item) => item.status !== ChecklistStatus.COMPLETED),
	);

	// Design C gate: a provisioned dedicated OnboardingChecklist must ALSO be fully
	// signed before ONBOARDING -> ACTIVE. Employees with no dedicated checklist keep
	// pure legacy behavior (no dedicated rows = nothing pending here).
	const pendingDedicatedItem = await params.prisma.onboardingItem.findFirst({
		where: {
			status: "PENDING",
			isDeleted: false,
			section: {
				isDeleted: false,
				checklist: { employeeId: params.employeeId, isDeleted: false },
			},
		},
		select: { id: true },
	});

	const hasPendingOnboarding = hasPendingLegacyOnboarding || !!pendingDedicatedItem;

	let nextStatus: EmploymentStatus | null = null;
	if (hasPendingOnboarding) {
		nextStatus = EmploymentStatus.ONBOARDING;
	} else if (
		employee.employmentStatus === EmploymentStatus.ONBOARDING ||
		employee.employmentStatus === EmploymentStatus.ACTIVE
	) {
		nextStatus = EmploymentStatus.ACTIVE;
	}

	if (nextStatus && nextStatus !== employee.employmentStatus) {
		await params.prisma.employee.update({
			where: { id: params.employeeId },
			data: { employmentStatus: nextStatus },
		});
	}

	return {
		hasPendingOnboarding,
		employmentStatus: nextStatus || employee.employmentStatus,
	};
};

const ensureOnboardingProcess = async ({
	prisma,
	organizationId,
	employeeId,
	targetDate,
	departmentId,
	role,
}: Required<ReconcileEmployeeOnboardingStateParams>) => {
	const resolvedTargetDate =
		targetDate instanceof Date && !Number.isNaN(targetDate.getTime())
			? targetDate
			: new Date();

	const activeProcess = await prisma.boardingProcess.findFirst({
		where: {
			employeeId,
			type: "ONBOARDING",
			status: { in: [...ACTIVE_ONBOARDING_STATUSES] },
			isDeleted: false,
		},
		orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
	});

	if (activeProcess) return activeProcess;

	const latestCompletedProcess = await prisma.boardingProcess.findFirst({
		where: {
			employeeId,
			type: "ONBOARDING",
			status: "COMPLETED",
			isDeleted: false,
		},
		orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
	});

	if (latestCompletedProcess) {
		return prisma.boardingProcess.update({
			where: { id: latestCompletedProcess.id },
			data: {
				status: "NOT_STARTED",
				actualCompleteDate: null,
				targetDate: resolvedTargetDate,
				metadata: {
					...((latestCompletedProcess.metadata as Record<string, any> | null) || {}),
					reopenedForMissingDocuments: true,
					reopenedAt: new Date().toISOString(),
				},
			},
		});
	}

	const template = await prisma.boardingTemplate.findFirst({
		where: {
			role: role || undefined,
			type: "ONBOARDING",
			isActive: true,
			isDeleted: false,
			organizationId,
		},
		select: { id: true },
	});

	const createdFromTemplate = await createBoardingProcess({
		prisma,
		organizationId,
		employeeId,
		type: "ONBOARDING",
		targetDate: resolvedTargetDate,
		departmentId,
		role,
		templateId: template?.id,
	});

	if (createdFromTemplate) return createdFromTemplate;

	return prisma.boardingProcess.create({
		data: {
			organizationId,
			employeeId,
			departmentId,
			type: "ONBOARDING",
			status: "NOT_STARTED",
			startDate: new Date(),
			targetDate: resolvedTargetDate,
			metadata: {
				generatedFromSkippedDocuments: true,
			},
		},
	});
};

export const getPendingActiveDocumentChecklistCandidates = async ({
	prisma,
	organizationId,
	employeeId,
	processId,
}: GetPendingDocumentChecklistCandidatesParams): Promise<PendingDocumentChecklistCandidate[]> => {
	const [employee, activeDocumentTypes] = await Promise.all([
		prisma.employee.findUnique({
			where: { id: employeeId },
			select: {
				id: true,
				departmentId: true,
				positionId: true,
				employmentType: true,
				role: true,
			},
		}),
		prisma.documentType.findMany({
			where: {
				organizationId,
				isActive: true,
				isDeleted: false,
			},
			orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
			select: {
				id: true,
				code: true,
				name: true,
				category: true,
				uploadBy: true,
				isRequired: true,
				displayOrder: true,
				metadata: true,
			},
		}),
	]);

	if (activeDocumentTypes.length === 0) {
		return [];
	}

	const existingDocuments = await prisma.document.findMany({
		where: {
			employeeId,
			isDeleted: false,
		},
		select: {
			id: true,
			documentTypeId: true,
			type: true,
			name: true,
			number: true,
			fileUrl: true,
			ext: true,
			issueDate: true,
			expiryDate: true,
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
			createdAt: true,
		},
	});

	let existingChecklistTypeIds = new Set<string>();
	let existingChecklistCodes = new Set<string>();

	if (processId) {
		const existingChecklistItems = await prisma.checklistItem.findMany({
			where: {
				processId,
				isDeleted: false,
			},
			select: {
				metadata: true,
			},
		});

		existingChecklistTypeIds = new Set(
			existingChecklistItems
				.map((item) => String((item.metadata as any)?.documentTypeId || "").trim())
				.filter(Boolean),
		);
		existingChecklistCodes = new Set(
			existingChecklistItems
				.map((item) =>
					normalizeDocumentKey(
						(item.metadata as any)?.documentCode || (item.metadata as any)?.documentType,
					),
				)
				.filter(Boolean),
		);
	}

	return activeDocumentTypes
		.filter((documentType) => {
			const requirementMeta = resolveDocumentTypeRequirementMeta(documentType, {
				departmentId: employee?.departmentId || null,
				positionId: employee?.positionId || null,
				employmentType: employee?.employmentType || null,
				role: employee?.role || null,
			});
			if (!requirementMeta.isApplicable) return false;
			if (!requirementMeta.isMandated) return false;

			const matchingDocuments = existingDocuments.filter((document) => {
				if (String(document.documentTypeId || "").trim() === documentType.id) return true;
				const normalizedDocumentCode = normalizeDocumentKey(document.type);
				return normalizedDocumentCode === normalizeDocumentKey(documentType.code);
			});

			const completeDocuments = matchingDocuments.filter((document) =>
				evaluateEmployeeDocumentCompleteness({
					document,
					documentType,
					employeeContext: {
						departmentId: employee?.departmentId || null,
						positionId: employee?.positionId || null,
						employmentType: employee?.employmentType || null,
						role: employee?.role || null,
					},
				}).isComplete,
			);

			const approvedOrUnreviewedDocumentExists = completeDocuments.some((document) => {
				const reviewStatus = getDocumentReviewStatus(document);
				return reviewStatus !== "PENDING" && reviewStatus !== "REJECTED";
			});

			if (approvedOrUnreviewedDocumentExists) {
				return false;
			}

			const normalizedCode = normalizeDocumentKey(documentType.code);
			const latestDocument = [...completeDocuments].sort(
				(left, right) =>
					new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
			)[0];
			const latestReviewStatus = latestDocument
				? getDocumentReviewStatus(latestDocument)
				: "";

			if (!latestDocument) {
				if (processId && existingChecklistTypeIds.has(documentType.id)) return false;
				if (processId && normalizedCode && existingChecklistCodes.has(normalizedCode))
					return false;
			}

			return true;
		})
		.map((documentType) => {
			const requirementMeta = resolveDocumentTypeRequirementMeta(documentType, {
				departmentId: employee?.departmentId || null,
				positionId: employee?.positionId || null,
				employmentType: employee?.employmentType || null,
				role: employee?.role || null,
			});
			const matchingDocuments = existingDocuments.filter((document) => {
				if (String(document.documentTypeId || "").trim() === documentType.id) return true;
				return normalizeDocumentKey(document.type) === normalizeDocumentKey(documentType.code);
			});
			const completeDocuments = matchingDocuments.filter((document) =>
				evaluateEmployeeDocumentCompleteness({
					document,
					documentType,
					employeeContext: {
						departmentId: employee?.departmentId || null,
						positionId: employee?.positionId || null,
						employmentType: employee?.employmentType || null,
						role: employee?.role || null,
					},
				}).isComplete,
			);
			const latestDocument = [...completeDocuments].sort(
				(left, right) =>
					new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
			)[0];
			const latestReviewStatus = latestDocument
				? getDocumentReviewStatus(latestDocument)
				: "";
			const latestReviewSnapshot = latestDocument
				? getDocumentReviewSnapshot(latestDocument)
				: null;

			let checklistStatus = ChecklistStatus.PENDING;
			let reviewStatus: "FOR_REVIEW" | "REJECTED" | null = null;
			if (latestReviewStatus === "PENDING") {
				checklistStatus = ChecklistStatus.PENDING;
				reviewStatus = "FOR_REVIEW";
			} else if (latestReviewStatus === "REJECTED") {
				checklistStatus = ChecklistStatus.PENDING;
				reviewStatus = "REJECTED";
			}

			return {
				documentTypeId: documentType.id,
				code: documentType.code,
				name: documentType.name,
				category: resolveChecklistCategory(documentType.category),
				priority: resolveChecklistPriority({
					isRequired: requirementMeta.isMandated,
					priorityLevel: requirementMeta.priorityLevel,
				}),
				isOptional: !requirementMeta.isMandated,
				displayOrder: documentType.displayOrder,
				uploadBy: documentType.uploadBy,
				checklistStatus,
				reviewStatus,
				documentId: latestDocument?.id || null,
				documentDisplayName: latestDocument?.name || null,
				documentNumber: latestDocument?.number || null,
				documentIssueDate: latestDocument?.issueDate
					? new Date(latestDocument.issueDate).toISOString()
					: null,
				documentExpiryDate: latestDocument?.expiryDate
					? new Date(latestDocument.expiryDate).toISOString()
					: null,
				documentFileUrl: latestDocument?.fileUrl || null,
				documentExt: latestDocument?.ext || null,
				documentFieldValues:
					toInputJsonValue(latestDocument?.fieldValues),
				reviewSubmittedAt: String(latestReviewSnapshot?.submittedAt || "").trim() || null,
				reviewSubmittedByEmployeeId:
					String(latestReviewSnapshot?.submittedByEmployeeId || "").trim() || null,
				reviewSubmittedByLabel:
					String(latestReviewSnapshot?.submittedByLabel || "").trim() || null,
				reviewApprovedAt: String(latestReviewSnapshot?.approvedAt || "").trim() || null,
				reviewApprovedByEmployeeId:
					String(latestReviewSnapshot?.approvedByEmployeeId || "").trim() || null,
				reviewApprovedByLabel:
					String(latestReviewSnapshot?.approvedByLabel || "").trim() || null,
				reviewRejectedAt: String(latestReviewSnapshot?.rejectedAt || "").trim() || null,
				reviewRejectedByEmployeeId:
					String(latestReviewSnapshot?.rejectedByEmployeeId || "").trim() || null,
				reviewRejectedByLabel:
					String(latestReviewSnapshot?.rejectedByLabel || "").trim() || null,
				reviewRejectionReason:
					String(latestReviewSnapshot?.rejectionReason || "").trim() || null,
			};
		});
};

export const createDocumentChecklistItems = async ({
	prisma,
	organizationId,
	employeeId,
	processId,
	targetDate,
}: CreateDocumentChecklistParams) => {
	try {
		docLogger.info(`Checking skipped active documents for employee ${employeeId}`);

		const employee = await prisma.employee.findUnique({
			where: { id: employeeId },
			select: { id: true },
		});

		if (!employee) {
			docLogger.error(`Employee ${employeeId} not found`);
			return { created: 0, skipped: 0 };
		}

		const candidates = await getPendingActiveDocumentChecklistCandidates({
			prisma,
			organizationId,
			employeeId,
			processId,
		});

		if (candidates.length === 0) {
			docLogger.info("Employee has no skipped active document tasks to create.");
			return { created: 0, skipped: 0 };
		}

		const existingOrders = await prisma.checklistItem.findMany({
			where: {
				processId,
				isDeleted: false,
			},
			select: {
				order: true,
			},
		});
		const baseOrder =
			existingOrders.reduce((max, item) => Math.max(max, Number(item.order || 0)), 0) + 1;

		const today = new Date();
		const dueDate = new Date(today);
		dueDate.setDate(today.getDate() + 14);
		const resolvedDueDate =
			targetDate instanceof Date && !Number.isNaN(targetDate.getTime()) && targetDate < dueDate
				? new Date(targetDate)
				: dueDate;

		const checklistItemsData = candidates.map((candidate, index) => ({
			organizationId,
			processId,
			title: buildChecklistTitle(candidate),
			description: buildChecklistDescription(candidate, candidate.reviewStatus),
			category: candidate.category,
			status: candidate.checklistStatus,
			priority: candidate.priority,
			dueDate: resolvedDueDate,
			order: baseOrder + index,
			estimatedTime: 15,
			isOptional: candidate.isOptional,
			metadata: buildChecklistMetadata(candidate),
		}));

		await prisma.checklistItem.createMany({
			data: checklistItemsData,
		});

		docLogger.info(
			`Successfully created ${checklistItemsData.length} active document checklist items`,
		);

		return {
			created: checklistItemsData.length,
			skipped: 0,
		};
	} catch (error) {
		docLogger.error(`Error creating document checklist items: ${error}`);
		return { created: 0, skipped: 0, error };
	}
};

export const syncOnboardingProcessProgress = async ({
	prisma,
	processId,
}: SyncOnboardingProcessProgressParams) => {
	const process = await prisma.boardingProcess.findFirst({
		where: {
			id: processId,
			isDeleted: false,
		},
		select: {
			id: true,
			employeeId: true,
			type: true,
			status: true,
			checklistItems: {
				where: { isDeleted: false },
				select: { id: true, status: true },
			},
		},
	});

	if (!process) return null;

	const totalItems = process.checklistItems.length;
	const completedItems = process.checklistItems.filter(
		(item) => item.status === ChecklistStatus.COMPLETED,
	).length;
	const completionPercentage =
		totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 100;

	let nextStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
	if (totalItems === 0 || completedItems === totalItems) {
		nextStatus = "COMPLETED";
	} else if (completedItems > 0) {
		nextStatus = "IN_PROGRESS";
	} else {
		nextStatus = "NOT_STARTED";
	}

	await prisma.boardingProcess.update({
		where: { id: processId },
		data: {
			status: nextStatus,
			completionPercentage,
			actualCompleteDate: nextStatus === "COMPLETED" ? new Date() : null,
		},
	});

	if (process.type === "ONBOARDING") {
		await syncEmployeeEmploymentStatus({
			prisma,
			employeeId: process.employeeId,
		});
	}

	return {
		processId,
		employeeId: process.employeeId,
		status: nextStatus,
		completionPercentage,
	};
};

export const reconcileEmployeeOnboardingState = async ({
	prisma,
	organizationId,
	employeeId,
	targetDate,
	departmentId,
	role,
}: ReconcileEmployeeOnboardingStateParams) => {
	const employee = await prisma.employee.findUnique({
		where: { id: employeeId },
		select: {
			id: true,
			organizationId: true,
			departmentId: true,
			role: true,
			employmentHireDate: true,
			employmentStatus: true,
		},
	});

	if (!employee) {
		docLogger.warn(`Skipping onboarding reconciliation. Employee ${employeeId} not found.`);
		return null;
	}

	const resolvedOrganizationId = organizationId || employee.organizationId;
	const resolvedDepartmentId = departmentId ?? employee.departmentId ?? null;
	const resolvedRole = role ?? employee.role ?? null;
	const resolvedTargetDate = (() => {
		if (targetDate instanceof Date && !Number.isNaN(targetDate.getTime())) {
			return targetDate;
		}
		if (
			employee.employmentHireDate instanceof Date &&
			!Number.isNaN(employee.employmentHireDate.getTime())
		) {
			return employee.employmentHireDate;
		}
		return new Date();
	})();

	const pendingCandidates = await getPendingActiveDocumentChecklistCandidates({
		prisma,
		organizationId: resolvedOrganizationId,
		employeeId,
	});

	const latestOnboardingProcess = await prisma.boardingProcess.findFirst({
		where: {
			employeeId,
			type: "ONBOARDING",
			isDeleted: false,
		},
		orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
		select: {
			id: true,
			status: true,
			targetDate: true,
		},
	});

	let process =
		latestOnboardingProcess?.status &&
		ACTIVE_ONBOARDING_STATUSES.includes(
			latestOnboardingProcess.status as (typeof ACTIVE_ONBOARDING_STATUSES)[number],
		)
			? latestOnboardingProcess
			: null;

	if (!process && pendingCandidates.length > 0) {
		process = await ensureOnboardingProcess({
			prisma,
			organizationId: resolvedOrganizationId,
			employeeId,
			targetDate: resolvedTargetDate,
			departmentId: resolvedDepartmentId,
			role: resolvedRole,
		});
	}

	if (!process) {
		await syncEmployeeEmploymentStatus({ prisma, employeeId });
		return {
			processId: null,
			created: 0,
			reopened: 0,
			completed: 0,
			pendingCount: pendingCandidates.length,
		};
	}

	const checklistItems = await prisma.checklistItem.findMany({
		where: {
			processId: process.id,
			isDeleted: false,
		},
		select: {
			id: true,
			order: true,
			status: true,
			metadata: true,
			category: true,
			title: true,
			description: true,
			priority: true,
			isOptional: true,
			estimatedTime: true,
			dueDate: true,
		},
	});

	const checklistItemsByIdentity = new Map<string, (typeof checklistItems)[number]>();
	for (const item of checklistItems) {
		if (!isSystemGeneratedDocumentChecklistItem(item.metadata)) continue;
		const identityKey = getDocumentIdentityKey(getChecklistItemDocumentIdentity(item.metadata));
		if (identityKey && !checklistItemsByIdentity.has(identityKey)) {
			checklistItemsByIdentity.set(identityKey, item);
		}
	}

	const pendingByIdentity = new Map<string, PendingDocumentChecklistCandidate>();
	for (const candidate of pendingCandidates) {
		const identityKey = getDocumentIdentityKey(buildDocumentChecklistIdentity(candidate));
		if (identityKey) {
			pendingByIdentity.set(identityKey, candidate);
		}
	}

	const highestOrder = checklistItems.reduce(
		(max, item) => Math.max(max, Number(item.order || 0)),
		0,
	);
	let nextOrder = highestOrder + 1;
	let created = 0;
	let reopened = 0;
	let completed = 0;

	for (const [identityKey, candidate] of pendingByIdentity.entries()) {
		const existingChecklistItem = checklistItemsByIdentity.get(identityKey);
		if (existingChecklistItem) {
			const nextStatus = candidate.checklistStatus;
			const nextMetadata = buildChecklistMetadata(
				candidate,
				(existingChecklistItem.metadata as Record<string, any> | null) || null,
			);
			const metadataChanged =
				JSON.stringify((existingChecklistItem.metadata as Record<string, any> | null) || {}) !==
				JSON.stringify(nextMetadata);
			if (existingChecklistItem.status !== nextStatus || metadataChanged) {
				await prisma.checklistItem.update({
					where: { id: existingChecklistItem.id },
					data: {
						title: buildChecklistTitle(candidate),
						description: buildChecklistDescription(candidate, candidate.reviewStatus),
						category: candidate.category,
						priority: candidate.priority,
						isOptional: candidate.isOptional,
						status: nextStatus,
						completedDate: nextStatus === ChecklistStatus.COMPLETED ? new Date() : null,
						metadata: nextMetadata,
					},
				});
				reopened += 1;
			}
			continue;
		}

		await prisma.checklistItem.create({
			data: {
				organizationId: resolvedOrganizationId,
				processId: process.id,
				title: buildChecklistTitle(candidate),
				description: buildChecklistDescription(candidate, candidate.reviewStatus),
				category: candidate.category,
				status: candidate.checklistStatus,
				priority: candidate.priority,
				dueDate:
					process.targetDate instanceof Date && !Number.isNaN(process.targetDate.getTime())
						? process.targetDate
						: resolvedTargetDate,
				order: nextOrder++,
				estimatedTime: 15,
				isOptional: candidate.isOptional,
				metadata: buildChecklistMetadata(candidate),
			},
		});
		created += 1;
	}

	for (const item of checklistItems) {
		if (!isSystemGeneratedDocumentChecklistItem(item.metadata)) continue;

		const identity = getChecklistItemDocumentIdentity(item.metadata);
		const identityKey = getDocumentIdentityKey(identity);
		if (!identityKey) continue;

		if (pendingByIdentity.has(identityKey)) continue;

		if (item.status !== ChecklistStatus.COMPLETED) {
			await prisma.checklistItem.update({
				where: { id: item.id },
				data: {
					status: ChecklistStatus.COMPLETED,
					completedDate: new Date(),
					metadata: {
						...((item.metadata as Record<string, any> | null) || {}),
						autoResolved: true,
						autoResolvedAt: new Date().toISOString(),
					},
				},
			});
			completed += 1;
		}
	}

	const progress = await syncOnboardingProcessProgress({
		prisma,
		processId: process.id,
	});

	// Dedicated onboarding checklist module: best-effort create-on-hire provisioning.
	// Idempotent (skips when the employee already has one); never fails the reconciliation.
	if (employee.employmentStatus === EmploymentStatus.ONBOARDING) {
		try {
			await ensureOnboardingChecklistForEmployee(prisma, {
				employeeId,
				organizationId: resolvedOrganizationId,
				requireTemplate: true,
			});
		} catch (dedicatedError) {
			docLogger.warn(
				`Dedicated onboarding checklist provisioning skipped for ${employeeId}: ${dedicatedError}`,
			);
		}
	}

	return {
		processId: process.id,
		created,
		reopened,
		completed,
		pendingCount: pendingCandidates.length,
		progress,
	};
};
