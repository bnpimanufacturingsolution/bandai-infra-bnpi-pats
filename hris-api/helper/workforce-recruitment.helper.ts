import type { Prisma, PrismaClient, WorkforceRecruitmentSetting } from "../generated/prisma";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export const WORKFORCE_REQUISITION_REQUEST_SUBTYPE = "DEPARTMENT_JOB_REQUISITION" as const;
export const WORKFORCE_REQUISITION_WORKFLOW_CODE =
	"WF-REQUEST-HIRING-REQUISITION-DEFAULT" as const;

const ACTIVE_HEADCOUNT_STATUSES = [
	"ACTIVE",
	"ONBOARDING",
	"ON_LEAVE",
	"SERVING_NOTICE",
] as const;

export type WorkforceRecruitmentPolicyRecord = {
	id: string;
	departmentId: string | null;
	sectionId: string | null;
	positionId: string | null;
	levelId: string | null;
	targetHeadcount: number;
	limitBehavior: "WARN" | "BLOCK";
	defaultWorkflowCode: string | null;
	autoCreateJobOnApproval: boolean;
	jobType: string | null;
	jobLocation: string | null;
	jobTags: string[];
	jobDescriptionTemplate: string | null;
	isActive: boolean;
};

export type WorkforceRecruitmentSettingsRecord = {
	id: string;
	organizationId: string;
	isEnabled: boolean;
	enforceDepartmentManagerScope: boolean;
	defaultWorkflowCode: string;
	requestSubtype: typeof WORKFORCE_REQUISITION_REQUEST_SUBTYPE;
	autoCreateJobOnApproval: boolean;
	seededAt?: string;
	updatedAt?: string;
	policies: WorkforceRecruitmentPolicyRecord[];
};

export const DEFAULT_WORKFORCE_RECRUITMENT_SETTINGS = {
	isEnabled: true,
	enforceDepartmentManagerScope: true,
	defaultWorkflowCode: WORKFORCE_REQUISITION_WORKFLOW_CODE,
	requestSubtype: WORKFORCE_REQUISITION_REQUEST_SUBTYPE,
	autoCreateJobOnApproval: true,
	policies: [] as WorkforceRecruitmentPolicyRecord[],
} as const;

const toOptionalId = (value: unknown): string | null => {
	const normalized = String(value || "").trim();
	return normalized || null;
};

const normalizeTags = (value: unknown): string[] =>
	Array.isArray(value)
		? value
				.map((item) => String(item || "").trim())
				.filter(Boolean)
		: [];

export const normalizeWorkforceRecruitmentPolicyInput = (
	policy: Partial<WorkforceRecruitmentPolicyRecord> | null | undefined,
): Omit<WorkforceRecruitmentPolicyRecord, "id"> => ({
	departmentId: toOptionalId(policy?.departmentId),
	sectionId: toOptionalId((policy as any)?.sectionId),
	positionId: toOptionalId(policy?.positionId),
	levelId: toOptionalId(policy?.levelId),
	targetHeadcount: Math.max(0, Math.floor(Number(policy?.targetHeadcount || 0))),
	limitBehavior:
		String(policy?.limitBehavior || "BLOCK").trim().toUpperCase() === "BLOCK"
			? "BLOCK"
			: "WARN",
	defaultWorkflowCode:
		String(policy?.defaultWorkflowCode || "").trim().toUpperCase() || null,
	autoCreateJobOnApproval:
		typeof policy?.autoCreateJobOnApproval === "boolean"
			? policy.autoCreateJobOnApproval
			: true,
	jobType: String(policy?.jobType || "").trim() || null,
	jobLocation: String(policy?.jobLocation || "").trim() || null,
	jobTags: normalizeTags(policy?.jobTags),
	jobDescriptionTemplate: String(policy?.jobDescriptionTemplate || "").trim() || null,
	isActive: policy?.isActive !== false,
});

export const buildWorkforceRecruitmentPolicyCreateInput = (
	organizationId: string,
	policy: Partial<WorkforceRecruitmentPolicyRecord> | null | undefined,
): Prisma.WorkforceRecruitmentPolicyUncheckedCreateWithoutSettingInput => {
	const normalized = normalizeWorkforceRecruitmentPolicyInput(policy);
	return {
		organizationId,
		departmentId: normalized.departmentId,
		sectionId: normalized.sectionId,
		positionId: normalized.positionId,
		levelId: normalized.levelId,
		targetHeadcount: normalized.targetHeadcount,
		limitBehavior: normalized.limitBehavior,
		defaultWorkflowCode: normalized.defaultWorkflowCode,
		autoCreateJobOnApproval: normalized.autoCreateJobOnApproval,
		jobType: normalized.jobType,
		jobLocation: normalized.jobLocation,
		jobTags: normalized.jobTags,
		jobDescriptionTemplate: normalized.jobDescriptionTemplate,
		isActive: normalized.isActive,
	};
};

export const serializeWorkforceRecruitmentSetting = (
	record: WorkforceRecruitmentSetting & { policies?: any[] },
): WorkforceRecruitmentSettingsRecord => ({
	id: record.id,
	organizationId: record.organizationId,
	isEnabled: record.isEnabled !== false,
	enforceDepartmentManagerScope: record.enforceDepartmentManagerScope !== false,
	defaultWorkflowCode:
		String(record.defaultWorkflowCode || WORKFORCE_REQUISITION_WORKFLOW_CODE)
			.trim()
			.toUpperCase() || WORKFORCE_REQUISITION_WORKFLOW_CODE,
	requestSubtype: WORKFORCE_REQUISITION_REQUEST_SUBTYPE,
	autoCreateJobOnApproval: record.autoCreateJobOnApproval !== false,
	seededAt: record.seededAt?.toISOString(),
	updatedAt: record.updatedAt?.toISOString(),
	policies: Array.isArray(record.policies)
		? record.policies.map((policy: any) => ({
				id: policy.id,
				departmentId: toOptionalId(policy.departmentId),
				sectionId: toOptionalId(policy.sectionId),
				positionId: toOptionalId(policy.positionId),
				levelId: toOptionalId(policy.levelId),
				targetHeadcount: Math.max(0, Math.floor(Number(policy.targetHeadcount || 0))),
				limitBehavior:
					String(policy.limitBehavior || "BLOCK").trim().toUpperCase() === "BLOCK"
						? "BLOCK"
						: "WARN",
				defaultWorkflowCode:
					String(policy.defaultWorkflowCode || "").trim().toUpperCase() || null,
				autoCreateJobOnApproval: policy.autoCreateJobOnApproval !== false,
				jobType: String(policy.jobType || "").trim() || null,
				jobLocation: String(policy.jobLocation || "").trim() || null,
				jobTags: normalizeTags(policy.jobTags),
				jobDescriptionTemplate:
					String(policy.jobDescriptionTemplate || "").trim() || null,
				isActive: policy.isActive !== false,
		  }))
		: [],
});

export const getOrCreateWorkforceRecruitmentSetting = async (
	prisma: PrismaExecutor,
	organizationId: string,
) => {
	const existing = await prisma.workforceRecruitmentSetting.findFirst({
		where: { organizationId },
		include: {
			policies: {
				orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
			},
		},
	});

	if (existing) {
		return existing;
	}

	return prisma.workforceRecruitmentSetting.create({
		data: {
			organizationId,
			isEnabled: DEFAULT_WORKFORCE_RECRUITMENT_SETTINGS.isEnabled,
			enforceDepartmentManagerScope:
				DEFAULT_WORKFORCE_RECRUITMENT_SETTINGS.enforceDepartmentManagerScope,
			defaultWorkflowCode:
				DEFAULT_WORKFORCE_RECRUITMENT_SETTINGS.defaultWorkflowCode,
			requestSubtype: DEFAULT_WORKFORCE_RECRUITMENT_SETTINGS.requestSubtype,
			autoCreateJobOnApproval:
				DEFAULT_WORKFORCE_RECRUITMENT_SETTINGS.autoCreateJobOnApproval,
			seededAt: new Date(),
		},
		include: {
			policies: true,
		},
	});
};

export const isDepartmentJobRequisitionMetadata = (metadata: unknown) => {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
	return (
		String((metadata as Record<string, unknown>).requestSubtype || "")
			.trim()
			.toUpperCase() === WORKFORCE_REQUISITION_REQUEST_SUBTYPE
	);
};

export const resolveWorkforcePolicy = (
	settings: WorkforceRecruitmentSettingsRecord,
	scope: {
		departmentId?: string | null;
		sectionId?: string | null;
		positionId?: string | null;
		levelId?: string | null;
	},
): WorkforceRecruitmentPolicyRecord | null => {
	const departmentId = toOptionalId(scope.departmentId);
	const sectionId = toOptionalId(scope.sectionId);
	const positionId = toOptionalId(scope.positionId);
	const levelId = toOptionalId(scope.levelId);

	const scoredMatches = settings.policies
		.filter((policy) => {
			if (!policy.isActive) return false;
			if (policy.departmentId && policy.departmentId !== departmentId) return false;
			if (policy.sectionId && policy.sectionId !== sectionId) return false;
			if (policy.positionId && policy.positionId !== positionId) return false;
			if (policy.levelId && policy.levelId !== levelId) return false;
			return true;
		})
		.map((policy) => {
			const rank =
				policy.departmentId && policy.sectionId && policy.positionId && policy.levelId
					? 600
					: policy.departmentId && policy.sectionId && policy.positionId
						? 500
						: policy.departmentId && policy.positionId && policy.levelId
							? 400
							: policy.departmentId && policy.positionId
								? 300
								: policy.departmentId && policy.sectionId
									? 200
									: policy.departmentId
										? 100
										: 0;
			return { policy, rank };
		})
		.sort((left, right) => right.rank - left.rank);

	return scoredMatches[0]?.policy || null;
};

export const countCurrentHeadcount = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		departmentId?: string | null;
		sectionId?: string | null;
		positionId?: string | null;
		levelId?: string | null;
	},
) =>
	prisma.employee.count({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			employmentStatus: {
				in: [...ACTIVE_HEADCOUNT_STATUSES],
			},
			...(params.departmentId ? { departmentId: params.departmentId } : {}),
			...(params.sectionId ? { sectionId: params.sectionId } : {}),
			...(params.positionId ? { positionId: params.positionId } : {}),
			...(params.levelId ? { levelId: params.levelId } : {}),
		},
	});

export const buildHiringRequisitionDescription = (params: {
	departmentName?: string | null;
	sectionName?: string | null;
	positionTitle?: string | null;
	levelName?: string | null;
	requestedHeadcount: number;
}) => {
	const segments = [
		params.requestedHeadcount > 0 ? `${params.requestedHeadcount} headcount` : "Hiring request",
		params.levelName || null,
		params.positionTitle || null,
		params.sectionName ? `in ${params.sectionName}` : null,
		params.departmentName ? `for ${params.departmentName}` : null,
	].filter(Boolean);

	return segments.join(" ");
};
