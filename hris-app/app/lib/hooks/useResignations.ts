import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import resignationService, {
	type ResignationsResponse,
	type ResignationDetailResponse,
	type ManagerApproveRequest,
	type ManagerRejectRequest,
	type ManagerRequestDiscussionRequest,
	type HRApproveRequest,
	type HRRejectRequest,
	type WithdrawRequest,
	type FinalClearanceRequest,
} from "~/services/resignation.service";
import type {
	Resignation,
	CreateResignation,
	UpdateResignation,
	CreateAttachment,
	ResignationAuditLog,
	ResignationAttachment,
} from "~/zod/resignation.zod";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";

// Query keys structure
export const resignationsQueryKeys = {
	resignations: {
		all: ["resignations"] as const,
		lists: () => [...resignationsQueryKeys.resignations.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...resignationsQueryKeys.resignations.lists(), { params }] as const,
		details: () => [...resignationsQueryKeys.resignations.all, "detail"] as const,
		detail: (id: string) => [...resignationsQueryKeys.resignations.details(), id] as const,
		auditLogs: () => [...resignationsQueryKeys.resignations.all, "audit-logs"] as const,
		auditLogsList: (id: string) =>
			[...resignationsQueryKeys.resignations.auditLogs(), id] as const,
		attachments: () => [...resignationsQueryKeys.resignations.all, "attachments"] as const,
		attachmentsList: (id: string) =>
			[...resignationsQueryKeys.resignations.attachments(), id] as const,
		byEmployee: (employeeId: string, params?: ApiQueryParams) =>
			[...resignationsQueryKeys.resignations.all, "by-employee", employeeId, params] as const,
		byManager: (managerId: string, params?: ApiQueryParams) =>
			[...resignationsQueryKeys.resignations.all, "by-manager", managerId, params] as const,
		byStatus: (status: string, params?: ApiQueryParams) =>
			[...resignationsQueryKeys.resignations.all, "by-status", status, params] as const,
	},
};

/**
 * Hook to fetch list of resignations with filters
 */
export const useResignations = (params?: ApiQueryParams) => {
	return useQuery<ResignationsResponse>({
		queryKey: resignationsQueryKeys.resignations.list(params),
		queryFn: () => {
			return resignationService
				.clearQueryParams()
				.select([
					"id",
					"resignationNumber",
					"employeeId",
					"managerId",
					"status",
					"resignationDate",
					"lastWorkingDay",
					"effectiveDate",
					"noticePeriodDays",
					"reasonCategory",
					"submittedAt",
					"createdAt",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getResignations();
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch a single resignation by ID
 */
export const useResignation = (id: string, fields?: string | string[]) => {
	// Default fields to include if not specified
	const defaultFields = [
		"id",
		"resignationNumber",
		"employeeId",
		"managerId",
		"status",
		"resignationDate",
		"lastWorkingDay",
		"effectiveDate",
		"noticePeriodDays",
		"reasonCategory",
		"reasonDetails",
		"additionalComments",
		"submittedAt",
		"managerReviewedAt",
		"managerReviewedBy",
		"managerComments",
		"managerApproved",
		"hrReviewedAt",
		"hrReviewedBy",
		"hrComments",
		"hrApproved",
		"offboardingStartedAt",
		"offboardingCompletedAt",
		"finalClearanceAt",
		"finalClearanceBy",
		"isWithdrawn",
		"withdrawnAt",
		"withdrawnReason",
		"withdrawnBy",
		"createdAt",
		"updatedAt",
		"createdBy",
	];

	const selectedFields = fields || defaultFields;

	return useQuery<ResignationDetailResponse>({
		queryKey: resignationsQueryKeys.resignations.detail(id),
		queryFn: () => resignationService.select(selectedFields).getResignationById(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch resignations by employee ID
 */
export const useResignationsByEmployee = (employeeId: string, params?: ApiQueryParams) => {
	return useQuery<ResignationsResponse>({
		queryKey: resignationsQueryKeys.resignations.byEmployee(employeeId, params),
		queryFn: () => resignationService.getResignationsByEmployee(employeeId, params),
		enabled: !!employeeId,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch resignations by manager ID
 */
export const useResignationsByManager = (managerId: string, params?: ApiQueryParams) => {
	return useQuery<ResignationsResponse>({
		queryKey: resignationsQueryKeys.resignations.byManager(managerId, params),
		queryFn: () => resignationService.getResignationsByManager(managerId, params),
		enabled: !!managerId,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch resignations by status
 */
export const useResignationsByStatus = (status: string, params?: ApiQueryParams) => {
	return useQuery<ResignationsResponse>({
		queryKey: resignationsQueryKeys.resignations.byStatus(status, params),
		queryFn: () => resignationService.getResignationsByStatus(status, params),
		enabled: !!status,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch resignation audit logs
 */
export const useResignationAuditLogs = (resignationId: string) => {
	return useQuery<ResignationAuditLog[]>({
		queryKey: resignationsQueryKeys.resignations.auditLogsList(resignationId),
		queryFn: () => resignationService.getResignationAuditLogs(resignationId),
		enabled: !!resignationId,
		staleTime: 2 * 60 * 1000, // 2 minutes
	});
};

/**
 * Hook to fetch resignation attachments
 */
export const useResignationAttachments = (resignationId: string) => {
	return useQuery<ResignationAttachment[]>({
		queryKey: resignationsQueryKeys.resignations.attachmentsList(resignationId),
		queryFn: () => resignationService.getResignationAttachments(resignationId),
		enabled: !!resignationId,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Hook to create a new resignation
 */
export const useCreateResignation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateResignation) => {
			return await resignationService.createResignation(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: resignationsQueryKeys.resignations.all });
			sonnerToast.success("Resignation created successfully");
		},
		onError: (error: any) => {
			// Check if errors array exists
			if (error?.errors && Array.isArray(error.errors) && error.errors.length > 0) {
				// Display each error from the errors array
				error.errors.forEach((err: any) => {
					sonnerToast.error(err.message); // Only show the error message
				});
			} else {
				// Fallback if no errors array
				sonnerToast.error(error?.message || "Failed to create resignation");
			}
		},
	});
};
/**
 * Hook to submit a resignation (from DRAFT to RESIGNATION_REQUESTED)
 */
export const useSubmitResignation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (resignationId: string) => {
			return await resignationService.submitResignation(resignationId);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: resignationsQueryKeys.resignations.all });
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.detail(data.id),
			});
			sonnerToast.success("Resignation submitted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to submit resignation");
		},
	});
};

/**
 * Hook to update a resignation
 */
export const useUpdateResignation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: { id: string; data: UpdateResignation }) => {
			return await resignationService.updateResignation(payload.id, payload.data);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: resignationsQueryKeys.resignations.all });
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.detail(data.id),
			});
			sonnerToast.success("Resignation updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update resignation");
		},
	});
};

/**
 * Hook to delete a resignation
 */
export const useDeleteResignation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (resignationId: string) => {
			return await resignationService.deleteResignation(resignationId);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: resignationsQueryKeys.resignations.all });
			sonnerToast.success("Resignation deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete resignation");
		},
	});
};

/**
 * Hook for manager to approve resignation
 */
export const useManagerApproveResignation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: { id: string; data: ManagerApproveRequest }) => {
			return await resignationService.managerApprove(payload.id, payload.data);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: resignationsQueryKeys.resignations.all });
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.detail(data.id),
			});
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.auditLogsList(data.id),
			});
			sonnerToast.success("Resignation approved successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to approve resignation");
		},
	});
};

/**
 * Hook for manager to reject resignation
 */
export const useManagerRejectResignation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: { id: string; data: ManagerRejectRequest }) => {
			return await resignationService.managerReject(payload.id, payload.data);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: resignationsQueryKeys.resignations.all });
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.detail(data.id),
			});
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.auditLogsList(data.id),
			});
			sonnerToast.success("Resignation rejected");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to reject resignation");
		},
	});
};

/**
 * Hook for manager to request discussion
 */
export const useManagerRequestDiscussion = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: { id: string; data: ManagerRequestDiscussionRequest }) => {
			return await resignationService.managerRequestDiscussion(payload.id, payload.data);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: resignationsQueryKeys.resignations.all });
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.detail(data.id),
			});
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.auditLogsList(data.id),
			});
			sonnerToast.success("Discussion requested successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to request discussion");
		},
	});
};

/**
 * Hook for HR to approve resignation
 */
export const useHRApproveResignation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: { id: string; data: HRApproveRequest }) => {
			return await resignationService.hrApprove(payload.id, payload.data);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: resignationsQueryKeys.resignations.all });
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.detail(data.id),
			});
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.auditLogsList(data.id),
			});
			sonnerToast.success("Resignation approved by HR");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to approve resignation");
		},
	});
};

/**
 * Hook for HR to reject resignation
 */
export const useHRRejectResignation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: { id: string; data: HRRejectRequest }) => {
			return await resignationService.hrReject(payload.id, payload.data);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: resignationsQueryKeys.resignations.all });
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.detail(data.id),
			});
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.auditLogsList(data.id),
			});
			sonnerToast.success("Resignation rejected by HR");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to reject resignation");
		},
	});
};

/**
 * Hook to withdraw resignation
 */
export const useWithdrawResignation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: { id: string; data: WithdrawRequest }) => {
			return await resignationService.withdrawResignation(payload.id, payload.data);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: resignationsQueryKeys.resignations.all });
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.detail(data.id),
			});
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.auditLogsList(data.id),
			});
			sonnerToast.success("Resignation withdrawn successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to withdraw resignation");
		},
	});
};

/**
 * Hook to approve final clearance
 */
export const useApproveFinalClearance = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: { id: string; data: FinalClearanceRequest }) => {
			return await resignationService.approveFinalClearance(payload.id, payload.data);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: resignationsQueryKeys.resignations.all });
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.detail(data.id),
			});
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.auditLogsList(data.id),
			});
			sonnerToast.success("Final clearance approved successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to approve final clearance");
		},
	});
};

/**
 * Hook to add attachment to resignation
 */
export const useAddResignationAttachment = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateAttachment) => {
			return await resignationService.addAttachment(payload);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.attachmentsList(data.resignationId),
			});
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.detail(data.resignationId),
			});
			sonnerToast.success("Attachment added successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to add attachment");
		},
	});
};

/**
 * Hook to delete attachment from resignation
 */
export const useDeleteResignationAttachment = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: { resignationId: string; attachmentId: string }) => {
			return await resignationService.deleteAttachment(
				payload.resignationId,
				payload.attachmentId,
			);
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.attachmentsList(
					variables.resignationId,
				),
			});
			queryClient.invalidateQueries({
				queryKey: resignationsQueryKeys.resignations.detail(variables.resignationId),
			});
			sonnerToast.success("Attachment deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete attachment");
		},
	});
};

/**
 * Hook to start offboarding process for an approved resignation
 * Creates an OFFBOARDING BoardingProcess with checklist items from template
 */
export const useStartOffboarding = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: { requestId: string; boardingTemplateId: string }) => {
			return await resignationService.startOffboarding(
				payload.requestId,
				payload.boardingTemplateId,
			);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: resignationsQueryKeys.resignations.all });
			queryClient.invalidateQueries({ queryKey: ["boardingProcesses"] });
			if (data.request?.id) {
				queryClient.invalidateQueries({
					queryKey: resignationsQueryKeys.resignations.detail(data.request.id),
				});
			}
			sonnerToast.success("Exit clearance started successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to start exit clearance");
		},
	});
};
