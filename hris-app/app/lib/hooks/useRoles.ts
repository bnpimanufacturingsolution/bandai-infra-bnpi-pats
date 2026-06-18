import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import rolesService, {
	type RolesResponse,
	type Role,
	type CreateRoleRequest,
	type UpdateRoleRequest,
} from "../../services/roles.service";
import { toast as sonnerToast } from "sonner";

export const AUTH_ROLE_FIELDS =
	"id,name,description,scope,createdAt,updatedAt,appRoles.app.id,appRoles.app.name,appRoles.app.code";
const HRIS_ROLE_FILTER = "scope:APP,appRoles.app.code:hris";

export const queryKeys = {
	roles: {
		all: ["roles"] as const,
		lists: () => [...queryKeys.roles.all, "list"] as const,
		list: (document?: boolean, params?: Record<string, any>) =>
			[...queryKeys.roles.lists(), { document, ...(params || {}) }] as const,
		details: () => [...queryKeys.roles.all, "detail"] as const,
		detail: (id: string) => [...queryKeys.roles.details(), id] as const,
	},
};

// Query hooks
export const useRoles = (
	document: boolean = true,
	params?: Partial<{
		page: number;
		limit: number;
		sort: string;
		order: "asc" | "desc";
		filter: string;
		fields: string;
		query: string;
		pagination: boolean;
		count: boolean;
	}>,
	options?: {
		enabled?: boolean;
	},
) => {
	const mergedParams = {
		page: 1,
		limit: 10,
		sort: "createdAt",
		order: "desc" as const,
		fields: AUTH_ROLE_FIELDS,
		pagination: true,
		count: true,
		filter: HRIS_ROLE_FILTER,
		...(params || {}),
	};

	return useQuery<RolesResponse>({
		queryKey: queryKeys.roles.list(document, mergedParams),
		queryFn: () => rolesService.getRoles(document, mergedParams),
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useRole = (id: string) => {
	return useQuery<Role>({
		queryKey: queryKeys.roles.detail(id),
		queryFn: () => rolesService.getRoleById(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Mutation hooks
export const useCreateRole = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateRoleRequest) => {
			return await rolesService.createRole(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
			sonnerToast.success("Role created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create role");
		},
	});
};

export const useUpdateRole = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdateRoleRequest }) => {
			return await rolesService.updateRole(id, payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
			sonnerToast.success("Role updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update role");
		},
	});
};

export const useDeleteRole = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			return await rolesService.deleteRole(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
			sonnerToast.success("Role deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete role");
		},
	});
};
