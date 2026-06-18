import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import leaveTypesService, {
	type CreateLeaveTypeRequest,
	type LeaveType,
	type LeaveTypesResponse,
	type UpdateLeaveTypeRequest,
} from "~/services/leaveTypes.service";
import type { ApiQueryParams } from "~/services/api-service";
import { leaveSettingsQueryKeys } from "./useLeaveSettings";

export const leaveTypeQueryKeys = {
	all: ["leave-types"] as const,
	lists: () => [...leaveTypeQueryKeys.all, "list"] as const,
	list: (params?: ApiQueryParams) => [...leaveTypeQueryKeys.lists(), { params }] as const,
	details: () => [...leaveTypeQueryKeys.all, "detail"] as const,
	detail: (id: string) => [...leaveTypeQueryKeys.details(), id] as const,
};

export const useLeaveTypes = (
	params?: ApiQueryParams,
	options?: {
		enabled?: boolean;
	},
) => {
	return useQuery<LeaveTypesResponse>({
		queryKey: leaveTypeQueryKeys.list(params),
		queryFn: () =>
			leaveTypesService
				.clearQueryParams()
				.select([
					"id",
					"code",
					"name",
					"description",
					"sortOrder",
					"isActive",
					"enabled",
					"isPaid",
					"requiresApproval",
					"minAdvanceNoticeDays",
					"maxDaysPerRequest",
					"allowHalfDay",
					"requireAttachment",
					"allowedEmploymentTypes",
					"updatedAt",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort || "sortOrder", params?.order || "asc")
				.setParams({ ...params, document: true, pagination: true, count: true })
				.getLeaveTypes(),
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000,
	});
};

export const useLeaveType = (id: string) => {
	return useQuery<LeaveType>({
		queryKey: leaveTypeQueryKeys.detail(id),
		queryFn: () => leaveTypesService.getLeaveTypeById(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});
};

const invalidateLeaveTypeConsumers = (queryClient: ReturnType<typeof useQueryClient>) => {
	queryClient.invalidateQueries({ queryKey: leaveTypeQueryKeys.all });
	queryClient.invalidateQueries({ queryKey: leaveSettingsQueryKeys.all });
};

export const useCreateLeaveType = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: CreateLeaveTypeRequest) => leaveTypesService.createLeaveType(payload),
		onSuccess: () => {
			invalidateLeaveTypeConsumers(queryClient);
			toast.success("Leave type created successfully");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to create leave type");
		},
	});
};

export const useUpdateLeaveType = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: UpdateLeaveTypeRequest }) =>
			leaveTypesService.updateLeaveType(id, payload),
		onSuccess: () => {
			invalidateLeaveTypeConsumers(queryClient);
			toast.success("Leave type updated successfully");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to update leave type");
		},
	});
};

export const useDeleteLeaveType = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => leaveTypesService.deleteLeaveType(id),
		onSuccess: () => {
			invalidateLeaveTypeConsumers(queryClient);
			toast.success("Leave type deactivated successfully");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to deactivate leave type");
		},
	});
};

export const useImportLeaveTypes = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (file: File) => leaveTypesService.importLeaveTypes(file),
		onSuccess: () => {
			invalidateLeaveTypeConsumers(queryClient);
			// Let GenericImportModal show partial failures from the summary payload.
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to import leave types");
		},
	});
};
