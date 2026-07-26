import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import applicantService, {
	type ApplicantActionRequest,
	type ApplicantAttachmentRecord,
	type ApplicantsResponse,
	type RecruitmentActivityRecord,
} from "../../services/applicant.service";
import type { CreateApplicant, Applicant, UpdateApplicant } from "~/zod/applicant";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";

const optimisticStageActions = new Set<ApplicantActionRequest["action"]>([
	"ADVANCE",
	"APPROVE_STEP",
	"REJECT_STEP",
	"COMPLETE_STEP",
	"SCHEDULE_INTERVIEW",
	"SEND_OFFER",
	"MARK_ONBOARDING_READY",
	"MARK_HIRED",
]);

const patchApplicantInCachedValue = (
	value: unknown,
	applicantId: string,
	patch: Record<string, unknown>,
): unknown => {
	if (!value || typeof value !== "object") return value;

	if (Array.isArray(value)) {
		let changed = false;
		const next = value.map((item) => {
			if (!item || typeof item !== "object" || (item as any).id !== applicantId) {
				return item;
			}
			changed = true;
			return { ...(item as any), ...patch };
		});
		return changed ? next : value;
	}

	const record = value as Record<string, any>;
	if (record.id === applicantId) {
		return { ...record, ...patch };
	}

	if (record.data !== undefined) {
		const patchedData = patchApplicantInCachedValue(record.data, applicantId, patch);
		if (patchedData !== record.data) return { ...record, data: patchedData };
	}

	if (Array.isArray(record.applicants)) {
		const patchedApplicants = patchApplicantInCachedValue(
			record.applicants,
			applicantId,
			patch,
		);
		if (patchedApplicants !== record.applicants) {
			return { ...record, applicants: patchedApplicants };
		}
	}

	if (record.applicants && typeof record.applicants === "object") {
		let changed = false;
		const patchedGroups = Object.fromEntries(
			Object.entries(record.applicants).map(([key, applicants]) => {
				const patchedApplicants = patchApplicantInCachedValue(
					applicants,
					applicantId,
					patch,
				);
				if (patchedApplicants !== applicants) changed = true;
				return [key, patchedApplicants];
			}),
		);
		if (changed) return { ...record, applicants: patchedGroups };
	}

	if (record.applicant && typeof record.applicant === "object") {
		const patchedApplicant = patchApplicantInCachedValue(record.applicant, applicantId, patch);
		if (patchedApplicant !== record.applicant) return { ...record, applicant: patchedApplicant };
	}

	return value;
};

const getResolvedApplicant = (data: unknown): Applicant | null => {
	if (!data || typeof data !== "object") return null;
	const record = data as Record<string, any>;
	if (record.id) return record as Applicant;
	if (record.applicant?.id) return record.applicant as Applicant;
	if (record.data?.id) return record.data as Applicant;
	if (record.data?.applicant?.id) return record.data.applicant as Applicant;
	return null;
};

// Query keys structure
export const queryKeys = {
	applicants: {
		all: ["applicants"] as const,
		lists: () => [...queryKeys.applicants.all, "list"] as const,
		list: (params?: ApiQueryParams) => [...queryKeys.applicants.lists(), { params }] as const,
		grouped: (groupBy: string, params?: ApiQueryParams) =>
			[...queryKeys.applicants.lists(), "grouped", groupBy, { params }] as const,
		details: () => [...queryKeys.applicants.all, "detail"] as const,
		detail: (id: string) => [...queryKeys.applicants.details(), id] as const,
	},
};

/**
 * Hook to fetch list of applicants with filters
 */
export const useApplicants = (params?: ApiQueryParams) => {
	return useQuery<ApplicantsResponse>({
		queryKey: queryKeys.applicants.list(params),
		queryFn: () => {
			return applicantService
				.clearQueryParams()
				.select([
					"id",
					"applicantId",
					"jobId",
					"job.id",
					"job.positionId",
					"job.levelId",
					"job.position.id",
					"job.position.title",
					"job.position.section.department.id",
					"job.position.section.department.name",
					"job.level.id",
					"job.level.name",
					"personId",
					"person",
					"position",
					"appliedDate",
					"workflowInstanceId",
					"currentWorkflowStateKey",
					"currentStepExecutionId",
					"lastCompletedStepExecutionId",
					"convertedToEmployeeId",
					"convertedToEmployee.id",
					"convertedToEmployee.employeeId",
					"convertedToEmployee.basicSalary",
					"convertedToEmployee.currency",
					"convertedToEmployee.payFrequency",
					"convertedToEmployee.employmentHireDate",
					"convertedToEmployee.employmentStartDate",
					"convertedToEmployee.probationEndDate",
					"convertedToEmployee.employmentType",
					"convertedToEmployee.workLocation",
					"convertedToEmployee.reportToId",
					"convertedToEmployee.departmentId",
					"convertedToEmployee.positionId",
					"convertedToEmployee.levelId",
					"convertedToEmployee.embeddedSchedule.templateId",
					"convertedToEmployee.embeddedSchedule.templateCode",
					"convertedToEmployee.embeddedSchedule.templateName",
					"convertedToEmployee.person.personalInfo",
					"convertedToEmployee.person.contactInfo",
					"convertedToEmployee.department.id",
					"convertedToEmployee.department.name",
					"convertedToEmployee.position.id",
					"convertedToEmployee.position.title",
					"convertedToEmployee.level.id",
					"convertedToEmployee.level.name",
					"applicationSource",
					"expectedSalary",
					"currency",
					"availabilityDate",
					"noticePeriod",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true, filter: { isDeleted: false } })
				.getApplicants();
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch applicants grouped by a field (e.g., position.title)
 */
export const useApplicantsGrouped = (groupBy: string, params?: ApiQueryParams) => {
	return useQuery({
		queryKey: queryKeys.applicants.grouped(groupBy, params),
		queryFn: () => {
			return applicantService
				.clearQueryParams()
				.select([
					"id",
					"applicantId",
					"jobId",
					"job.id",
					"job.positionId",
					"job.levelId",
					"job.position.id",
					"job.position.title",
					"job.position.section.department.id",
					"job.position.section.department.name",
					"job.level.id",
					"job.level.name",
					"personId",
					"person",
					"position",
					"appliedDate",
					"workflowInstanceId",
					"currentWorkflowStateKey",
					"currentStepExecutionId",
					"lastCompletedStepExecutionId",
					"convertedToEmployeeId",
					"convertedToEmployee.id",
					"convertedToEmployee.employeeId",
					"convertedToEmployee.basicSalary",
					"convertedToEmployee.currency",
					"convertedToEmployee.payFrequency",
					"convertedToEmployee.employmentHireDate",
					"convertedToEmployee.employmentStartDate",
					"convertedToEmployee.probationEndDate",
					"convertedToEmployee.employmentType",
					"convertedToEmployee.workLocation",
					"convertedToEmployee.reportToId",
					"convertedToEmployee.departmentId",
					"convertedToEmployee.positionId",
					"convertedToEmployee.levelId",
					"convertedToEmployee.embeddedSchedule.templateId",
					"convertedToEmployee.embeddedSchedule.templateCode",
					"convertedToEmployee.embeddedSchedule.templateName",
					"convertedToEmployee.person.personalInfo",
					"convertedToEmployee.person.contactInfo",
					"convertedToEmployee.department.name",
					"convertedToEmployee.position.title",
					"convertedToEmployee.level.name",
					"applicationSource",
					"expectedSalary",
					"currency",
					"availabilityDate",
					"noticePeriod",
				])
				.search(params?.query)
				.document(true)
				.paginate(params?.page || 1, params?.limit || 1000)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, groupBy, filter: { isDeleted: false } })
				.getApplicants();
		},
		enabled: !!groupBy,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useApplicant = (id: string) => {
	return useQuery({
		queryKey: queryKeys.applicants.detail(id),
		queryFn: () =>
			applicantService
				.clearQueryParams()
				.select([
					"id",
					"applicantId",
					"jobId",
					"job.id",
					"job.positionId",
					"job.levelId",
					"job.position.id",
					"job.position.title",
					"job.position.section.department.id",
					"job.position.section.department.name",
					"job.level.id",
					"job.level.name",
					"personId",
					"person",
					"position",
					"positionId",
					"departmentId",
					"appliedDate",
					"workflowInstanceId",
					"currentWorkflowStateKey",
					"currentStepExecutionId",
					"lastCompletedStepExecutionId",
					"convertedToEmployeeId",
					"convertedToEmployee.id",
					"convertedToEmployee.employeeId",
					"convertedToEmployee.basicSalary",
					"convertedToEmployee.currency",
					"convertedToEmployee.payFrequency",
					"convertedToEmployee.employmentHireDate",
					"convertedToEmployee.employmentStartDate",
					"convertedToEmployee.probationEndDate",
					"convertedToEmployee.employmentType",
					"convertedToEmployee.workLocation",
					"convertedToEmployee.reportToId",
					"convertedToEmployee.departmentId",
					"convertedToEmployee.positionId",
					"convertedToEmployee.levelId",
					"convertedToEmployee.embeddedSchedule.templateId",
					"convertedToEmployee.embeddedSchedule.templateCode",
					"convertedToEmployee.embeddedSchedule.templateName",
					"convertedToEmployee.person.personalInfo",
					"convertedToEmployee.person.contactInfo",
					"convertedToEmployee.department.name",
					"convertedToEmployee.position.title",
					"convertedToEmployee.level.name",
					"applicationSource",
					"expectedSalary",
					"currency",
					"availabilityDate",
					"noticePeriod",
					"portfolioUrl",
					"attachments",
					"activities",
					"currentStepExecution.id",
					"currentStepExecution.stepName",
					"currentStepExecution.stepType",
					"currentStepExecution.status",
					"currentStepExecution.assigneeId",
					"currentStepExecution.assigneeType",
				])
				.getApplicantById(id) as any,
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Mutation hooks
export const useCreateApplicant = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateApplicant | FormData) => {
			return await applicantService.createApplicant(payload);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.applicants.all });
			sonnerToast.success("Applicant created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create applicant");
		},
	});
};

export const useUpdateApplicant = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			id,
			payload,
		}: {
			id: string;
			payload: UpdateApplicant | FormData;
		}) => {
			return await applicantService.updateApplicant(id, payload);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.applicants.all });
			sonnerToast.success("Applicant updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update applicant");
		},
	});
};

export const useApplicantAction = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: ApplicantActionRequest }) => {
			return await applicantService.runAction(id, payload);
		},
		onMutate: async (variables) => {
			const nextStateKey = variables.payload.targetStateKey?.trim();
			if (
				!nextStateKey ||
				!optimisticStageActions.has(variables.payload.action)
			) {
				return { snapshots: [] as Array<[QueryKey, unknown]> };
			}

			await queryClient.cancelQueries({ queryKey: queryKeys.applicants.all });
			const snapshots = queryClient.getQueriesData({ queryKey: queryKeys.applicants.all });
			const patch = {
				currentWorkflowStateKey: nextStateKey.toUpperCase(),
				lastCompletedStepExecutionId: variables.payload.stepExecutionId || undefined,
			};

			snapshots.forEach(([queryKey, data]) => {
				const patched = patchApplicantInCachedValue(data, variables.id, patch);
				if (patched !== data) {
					queryClient.setQueryData(queryKey, patched);
				}
			});

			return { snapshots };
		},
		onSuccess: async (data, variables) => {
			const updatedApplicant = getResolvedApplicant(data);
			if (updatedApplicant?.id) {
				queryClient.setQueriesData(
					{ queryKey: queryKeys.applicants.all },
					(current) =>
						patchApplicantInCachedValue(current, variables.id, updatedApplicant),
				);
				queryClient.setQueryData(
					queryKeys.applicants.detail(variables.id),
					updatedApplicant,
				);
			}

			await Promise.all([
				queryClient.invalidateQueries({ queryKey: queryKeys.applicants.all }),
				queryClient.invalidateQueries({
					queryKey: queryKeys.applicants.detail(variables.id),
				}),
			]);
			sonnerToast.success("Applicant action completed");
		},
		onError: (error: any, _variables, context) => {
			context?.snapshots?.forEach(([queryKey, data]) => {
				queryClient.setQueryData(queryKey, data);
			});
			sonnerToast.error(error?.message || "Failed to run applicant action");
		},
	});
};

export const useApplicantActivities = (id: string) =>
	useQuery<RecruitmentActivityRecord[]>({
		queryKey: [...queryKeys.applicants.detail(id), "activities"],
		queryFn: () => applicantService.getActivities(id),
		enabled: !!id,
	});

export const useApplicantAttachments = (id: string) =>
	useQuery<ApplicantAttachmentRecord[]>({
		queryKey: [...queryKeys.applicants.detail(id), "attachments"],
		queryFn: () => applicantService.getAttachments(id),
		enabled: !!id,
	});

export const useUploadApplicantAttachment = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, formData }: { id: string; formData: FormData }) =>
			applicantService.uploadAttachment(id, formData),
		onSuccess: async (_data, variables) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: queryKeys.applicants.detail(variables.id) }),
				queryClient.invalidateQueries({ queryKey: queryKeys.applicants.all }),
			]);
			sonnerToast.success("Attachment uploaded successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to upload attachment");
		},
	});
};

export const useDeleteApplicant = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			return await applicantService.deleteApplicant(id);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.applicants.all });
			sonnerToast.success("Applicant deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete applicant");
		},
	});
};
