import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import requestsService, {
	type Request,
	type HRTicketQueuesResponse,
	type RequestsResponse,
	type CreateRequestData,
	type UpdateRequestData,
} from "~/services/requests.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";
import { timesheetQueryKeys } from "./useTimesheets";
import { scheduleQueryKeys } from "./useSchedules";

// Query keys structure
export const requestsQueryKeys = {
	requests: {
		all: ["requests"] as const,
		lists: () => [...requestsQueryKeys.requests.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...requestsQueryKeys.requests.lists(), { params }] as const,
		hrTicketQueues: (params?: ApiQueryParams) =>
			[...requestsQueryKeys.requests.lists(), "hr-ticket-queues", { params }] as const,
		details: () => [...requestsQueryKeys.requests.all, "detail"] as const,
		detail: (id: string) => [...requestsQueryKeys.requests.details(), id] as const,
	},
};

/**
 * Hook to fetch list of requests with filters
 */
export const useRequests = (params?: ApiQueryParams) => {
	return useQuery<RequestsResponse>({
		queryKey: requestsQueryKeys.requests.list(params),
		enabled: params?.enabled !== false,
		queryFn: () => {
			return requestsService
				.select(
					params?.fields
						? (params.fields as string).split(",")
						: [
								"code",
								"requester.person.personalInfo",
								"requester.employeeId",
								"requester.position.title",
								"requester.department.name",
								"requester.id",
								"requesterId",
								"targetEmployee.id",
								"targetEmployee.employeeId",
								"targetEmployee.person.personalInfo",
								"targetEmployee.reportTo.id",
								"targetEmployee.reportTo.employeeId",
								"targetEmployee.reportTo.person.personalInfo",
								"targetEmployee.department.name",
								"targetEmployee.position.title",
								"description",
								"type",
								"startDate",
								"endDate",
								"metadata",
								"currentWorkflowStateKey",
								"createdAt",
								"currentStepExecution.stepName",
								"currentStepExecution.stepNumber",
								"currentStepExecution.assigneeType",
								"currentStepExecution.status",
								"currentStepExecution.assignee.person.personalInfo",
								"currentStepExecution.assignee.employeeId",
								"lastCompletedStepExecution.stepName",
								"lastCompletedStepExecution.completedAt",
								"lastCompletedStepExecution.assignee.person.personalInfo",
								"lastCompletedStepExecution.assignee.employeeId",
							],
				)
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams(params || {})
				.getRequests();
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useHRTicketQueues = (params?: ApiQueryParams) => {
	return useQuery<HRTicketQueuesResponse>({
		queryKey: requestsQueryKeys.requests.hrTicketQueues(params),
		enabled: params?.enabled !== false,
		queryFn: () => {
			return requestsService
				.select(params?.fields ? (params.fields as string).split(",") : undefined)
				.search(params?.query)
				.paginate(1, params?.limit || 3)
				.sort(params?.sort, params?.order)
				.setParams({
					...(params || {}),
					ticketQueues: "hr",
					queueLimit: params?.queueLimit || params?.limit || 3,
					page: 1,
				})
				.getRequests() as unknown as Promise<HRTicketQueuesResponse>;
		},
		staleTime: 5 * 60 * 1000,
	});
};

/**
 * Hook to fetch a single request by ID
 */
export const useRequest = (id: string, params?: ApiQueryParams) => {
	return useQuery<Request>({
		queryKey: [...requestsQueryKeys.requests.detail(id), { params }] as const,
		queryFn: () =>
			requestsService
				.select(
					params?.fields
						? (params.fields as string).split(",")
						: [
								"code",
								"requester.person.personalInfo",
								"requester.employeeId",
								"requester.position.title",
								"requester.department.name",
								"requester.id",
								"requesterId",
								"description",
								"type",
								"startDate",
								"endDate",
								"metadata",
								"currentWorkflowStateKey",
								"notes",
								"attachments",
								"createdAt",
								"updatedAt",
								"stepExecutions",
								"currentStepExecution",
								"lastCompletedStepExecution",
								"transactions",
							],
				)
				.getRequestById(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});
};

/**
 * Mutation hook to create a new request
 */
export const useCreateRequest = (
	options: { showSuccessToast?: boolean; showErrorToast?: boolean } = {},
) => {
	const queryClient = useQueryClient();
	const { showSuccessToast = true, showErrorToast = true } = options;

	return useMutation({
		mutationFn: async (payload: CreateRequestData) => {
			return await requestsService.createRequest(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: requestsQueryKeys.requests.all });
			if (showSuccessToast) {
				sonnerToast.success("Request created successfully");
			}
		},
		onError: (error: any) => {
			if (showErrorToast) {
				const toastErr = getToastErrorMessage(error);
				sonnerToast.error(toastErr.title, {
					description: toastErr.description,
				});
			}
		},
	});
};

/**
 * Mutation hook to update an existing request
 */
export const useUpdateRequest = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdateRequestData }) => {
			return await requestsService.updateRequest(id, payload);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: requestsQueryKeys.requests.all });
			queryClient.invalidateQueries({ queryKey: requestsQueryKeys.requests.detail(data.id) });
			sonnerToast.success("Request updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update request");
		},
	});
};

/**
 * Mutation hook to approve or reject a request
 */
export const useApproveRequest = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			id,
			action,
			comment,
		}: {
			id: string;
			action: "approve" | "reject";
			comment?: string;
		}) => {
			return await requestsService.approveRequest(id, action, comment);
		},
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({ queryKey: requestsQueryKeys.requests.all });
			queryClient.invalidateQueries({
				queryKey: requestsQueryKeys.requests.detail(variables.id),
			});
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			queryClient.invalidateQueries({ queryKey: ["employees"] });
			queryClient.invalidateQueries({ queryKey: ["metrics"] });
			queryClient.invalidateQueries({
				queryKey: scheduleQueryKeys.employeeScheduleTimeline.all,
			});
			queryClient.invalidateQueries({
				queryKey: scheduleQueryKeys.scheduleOverrides.all,
			});
			const message =
				variables.action === "approve"
					? "Request approved successfully"
					: "Request rejected successfully";
			sonnerToast.success(message);
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to process request approval");
		},
	});
};

/**
 * Mutation hook to cancel a request
 */
export const useCancelRequest = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			id,
			reason,
		}: {
			id: string;
			reason?: string;
			successMessage?: string;
			errorMessage?: string;
		}) => {
			return await requestsService.cancelRequest(id, reason);
		},
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({ queryKey: requestsQueryKeys.requests.all });
			queryClient.invalidateQueries({ queryKey: requestsQueryKeys.requests.detail(data.id) });
			sonnerToast.success(variables.successMessage || "Request cancelled successfully");
		},
		onError: (error: any, variables) => {
			sonnerToast.error(error?.message || variables.errorMessage || "Failed to cancel request");
		},
	});
};

/**
 * Mutation hook to delegate the current step to the employee's supervisor.
 * The backend records whether this is a temporary delegation or a reassignment.
 */
export const useDelegateRequestStep = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			requestId,
			mode = "REASSIGN",
			reason,
		}: {
			requestId: string;
			mode?: "TEMPORARY" | "REASSIGN";
			reason?: string;
		}) => {
			return await requestsService.delegateStepToSupervisor(requestId, mode, reason);
		},
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({ queryKey: requestsQueryKeys.requests.all });
			queryClient.invalidateQueries({
				queryKey: requestsQueryKeys.requests.detail(variables.requestId),
			});
			sonnerToast.success(
				`${variables.mode === "TEMPORARY" ? "Step delegated" : "Step reassigned"} to ${data.delegatedToName} successfully`,
			);
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delegate step to supervisor");
		},
	});
};

export const useEscalateRequest = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (requestId: string) => {
			return await requestsService.escalateToSupervisor(requestId);
		},
		onSuccess: (data, requestId) => {
			queryClient.invalidateQueries({ queryKey: requestsQueryKeys.requests.all });
			queryClient.invalidateQueries({
				queryKey: requestsQueryKeys.requests.detail(requestId),
			});
			sonnerToast.success(`Step reassigned to ${data.delegatedToName} successfully`);
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to reassign step to supervisor");
		},
	});
};

/**
 * Mutation hook to delete a request
 */
export const useDeleteRequest = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (
			payload:
				| string
				| {
						id: string;
						successMessage?: string;
						errorMessage?: string;
				  },
		) => {
			const id = typeof payload === "string" ? payload : payload.id;
			return await requestsService.deleteRequest(id);
		},
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: requestsQueryKeys.requests.all });
			const successMessage =
				typeof variables === "string" ? undefined : variables.successMessage;
			sonnerToast.success(successMessage || "Request deleted successfully");
		},
		onError: (error: any, variables) => {
			const errorMessage =
				typeof variables === "string" ? undefined : variables.errorMessage;
			sonnerToast.error(error?.message || errorMessage || "Failed to delete request");
		},
	});
};

/**
 * Mutation hook to generate a document
 */
export const useGenerateDocument = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			requestId,
			type,
			year,
		}: {
			requestId: string;
			type?: string;
			year?: number;
		}) => {
			return await requestsService.generateDocument(requestId, type, year);
		},
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({ queryKey: requestsQueryKeys.requests.all });
			queryClient.invalidateQueries({
				queryKey: requestsQueryKeys.requests.detail(variables.requestId),
			});
			sonnerToast.success("Document generated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to generate document");
		},
	});
};

/**
 * Mutation hook to start offboarding process for a resignation request
 */
export const useStartOffboarding = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ requestId }: { requestId: string }) => {
			return await requestsService.startOffboarding(requestId);
		},
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({ queryKey: requestsQueryKeys.requests.all });
			queryClient.invalidateQueries({
				queryKey: requestsQueryKeys.requests.detail(variables.requestId),
			});
			queryClient.invalidateQueries({ queryKey: ["boardingProcesses"] });
			sonnerToast.success("Exit clearance started successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to start exit clearance");
		},
	});
};
