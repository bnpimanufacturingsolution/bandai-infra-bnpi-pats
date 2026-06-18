import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import departmentsService, {
	type DepartmentsResponse,
	type Department,
	type CreateDepartmentRequest,
	type UpdateDepartmentRequest,
} from "../../services/departments.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";

// Query keys structure
export const queryKeys = {
	departments: {
		all: ["departments"] as const,
		lists: () => [...queryKeys.departments.all, "list"] as const,
		list: (params?: ApiQueryParams) => [...queryKeys.departments.lists(), { params }] as const,
		details: () => [...queryKeys.departments.all, "detail"] as const,
		detail: (id: string) => [...queryKeys.departments.details(), id] as const,
	},
};

/**
 * Hook to fetch list of departments with filters
 */
export const useDepartments = (
	params?: ApiQueryParams,
	options?: {
		enabled?: boolean;
	},
) => {
	return useQuery<DepartmentsResponse>({
		queryKey: queryKeys.departments.list(params),
		queryFn: () => {
			return departmentsService
				.clearQueryParams()
				.select([
					"id",
					"organizationId",
					"name",
					"code",
					"isHr",
					"description",
					"managerId",
					"manager.person.personalInfo",
					"parentId",
					"isActive",
					"createdAt",
					"updatedAt",
					"isActive",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getDepartments();
		},
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useDepartment = (id: string) => {
	return useQuery({
		queryKey: queryKeys.departments.detail(id),
		queryFn: () => departmentsService.getDepartmentById(id) as any,
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Mutation hooks
export const useCreateDepartment = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateDepartmentRequest) => {
			return await departmentsService.createDepartment(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.departments.all });
			sonnerToast.success("Department created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create department");
		},
	});
};

export const useUpdateDepartment = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdateDepartmentRequest }) => {
			return await departmentsService.updateDepartment(id, payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.departments.all });
			sonnerToast.success("Department updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update department");
		},
	});
};

export const useDeleteDepartment = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			return await departmentsService.deleteDepartment(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.departments.all });
			sonnerToast.success("Department deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete department");
		},
	});
};

export const useImportDepartments = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (file: File) => {
			return await departmentsService.importDepartments(file);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.departments.all });
			// Let GenericImportModal handle success/partial-error messaging based on response summary.
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to import departments");
		},
	});
};
