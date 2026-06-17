import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import userService, {
	type CreateUserRequest,
	type UpdateUserRequest,
	type UsersResponse,
} from "~/services/user.service";
import { toast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";

export type { CreateUserRequest, UpdateUserRequest, UsersResponse };

export const AUTH_USER_ROLE_FIELDS = [
	"id",
	"email",
	"userName",
	"role",
	"roleId",
	"status",
	"organizationId",
	"createdAt",
	"updatedAt",
	"metadata",
	"userRoles.organizationRole.role.id",
	"userRoles.organizationRole.role.name",
	"userRoles.organizationRole.role.scope",
	"userRoles.organizationRole.appSubscription.id",
	"userRoles.organizationRole.appSubscription.appId",
	"userRoles.organizationRole.appSubscription.app.id",
	"userRoles.organizationRole.appSubscription.app.name",
	"userRoles.organizationRole.appSubscription.app.code",
] as const;

export interface AuthUserRoleApp {
	id?: string;
	name?: string;
	code?: string;
}

export interface AuthUserRoleAppSubscription {
	id?: string;
	appId?: string;
	app?: AuthUserRoleApp;
}

export interface AuthUserRoleInfo {
	id?: string;
	name?: string;
	scope?: string;
}

export interface AuthUserOrganizationRole {
	role?: AuthUserRoleInfo;
	appSubscription?: AuthUserRoleAppSubscription;
}

export interface AuthUserRoleAssignment {
	organizationRole?: AuthUserOrganizationRole;
}

export interface UserEmployeeReference {
	id?: string;
	name?: string;
	code?: string;
	title?: string;
	firstName?: string;
	lastName?: string;
	email?: string;
	rank?: number;
}

export interface UserEmployeeMetadata {
	id?: string;
	isDepartmentManager?: boolean;
	personalInfo?: {
		firstName?: string;
		lastName?: string;
	};
	department?: UserEmployeeReference;
	position?: UserEmployeeReference;
	level?: UserEmployeeReference;
	reportTo?: UserEmployeeReference;
}

export interface UserDeviceAccessMetadata {
	status?: string;
	empId?: string;
}

export interface UserMetadata {
	employee?: UserEmployeeMetadata;
	requirePasswordChange?: boolean;
	device?: {
		access?: UserDeviceAccessMetadata;
	};
}

export interface UserListItem {
	id: string;
	email?: string;
	userName?: string;
	role?: string;
	roleId?: string;
	status?: "active" | "inactive" | "suspended" | "archived";
	organizationId?: string;
	createdAt?: string;
	updatedAt?: string;
	userRoles?: AuthUserRoleAssignment[];
	metadata?: UserMetadata | null;
	[key: string]: any;
}

export const buildAuthUserFields = (extraFields: string[] = []) =>
	[...AUTH_USER_ROLE_FIELDS, ...extraFields].join(",");

export const buildAuthAppUserFilter = (organizationId?: string, extraFilters: string[] = []) =>
	[organizationId ? `organizationId:${organizationId}` : null, ...extraFilters]
		.filter(Boolean)
		.join(",");

export const getAppRoleNames = (user: UserListItem, appCode: string = "hris") =>
	(() => {
		const roleNamesFromAssignments = (user.userRoles || [])
			.filter(
				(assignment) =>
					assignment.organizationRole?.role?.scope === "APP" &&
					assignment.organizationRole?.appSubscription?.app?.code === appCode,
			)
			.map((assignment) => assignment.organizationRole?.role?.name)
			.filter(Boolean)
			.join(", ");

		if (roleNamesFromAssignments) return roleNamesFromAssignments;
		if (user.role && String(user.role).trim().length > 0) return String(user.role);
		if (user.roleId && String(user.roleId).trim().length > 0) return String(user.roleId);
		return "";
	})();

// Query keys
export const userKeys = {
	all: ["users"] as const,
	lists: () => [...userKeys.all, "list"] as const,
	list: (params?: ApiQueryParams) => [...userKeys.lists(), { params }] as const,
	details: () => [...userKeys.all, "detail"] as const,
	detail: (id: string) => [...userKeys.details(), id] as const,
};

// Get all users
export function useUsers(
	params?: ApiQueryParams,
	options?: {
		enabled?: boolean;
	},
) {
	return useQuery<UsersResponse>({
		queryKey: userKeys.list(params),
		queryFn: () => {
			return userService
				.clearQueryParams()
				.select(params?.fields)
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams(params || {})
				.getUsers();
		},
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

// Get user by ID
export function useUser(id: string, enabled = true) {
	return useQuery({
		queryKey: userKeys.detail(id),
		queryFn: () => userService.getUserById(id),
		enabled: enabled && !!id,
	});
}

// Create user mutation
export function useCreateUser() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: CreateUserRequest) => userService.createUser(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: userKeys.lists() });
			toast.success("User created successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to create user");
		},
	});
}

// Update user mutation
export function useUpdateUser() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateUserRequest }) =>
			userService.updateUser(id, data),
		onSuccess: (_, { id }) => {
			queryClient.invalidateQueries({ queryKey: userKeys.detail(id) });
			queryClient.invalidateQueries({ queryKey: userKeys.lists() });
			toast.success("User updated successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to update user");
		},
	});
}

// Reset user password mutation
export function useResetUserPassword() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => userService.resetUserPassword(id),
		onSuccess: (_, id) => {
			queryClient.invalidateQueries({ queryKey: userKeys.detail(id) });
			queryClient.invalidateQueries({ queryKey: userKeys.lists() });
			toast.success("Password reset successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to reset password");
		},
	});
}

// Delete user mutation
export function useDeleteUser() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => userService.deleteUser(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: userKeys.lists() });
			toast.success("User deleted successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to delete user");
		},
	});
}

// Enroll users to device mutation
export interface EnrollDeviceUserRequest {
	deviceId: string;
	userIds: string[];
}

export function useEnrollDeviceUser() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ deviceId, userIds }: EnrollDeviceUserRequest) => {
			const results = [];
			const errors = [];

			// Fetch each user to get their employeeId
			for (const userId of userIds) {
				try {
					const user = await userService.getUserById(userId);
					const employeeId = (user as any)?.metadata?.employee?.id;

					if (!employeeId) {
						errors.push({
							userId,
							error: "User does not have an associated employee ID",
						});
						continue;
					}

					// Get existing metadata or create new structure
					const existingMetadata = (user as any).metadata || {};
					const existingAccess = existingMetadata.access || {};

					// Update metadata with device access
					const updatedMetadata = {
						...existingMetadata,
						access: {
							...existingAccess,
							device: {
								employeeId: employeeId,
							},
						},
					};

					// Update user metadata
					await userService.updateUserMetadata(userId, updatedMetadata);
					results.push({ userId, employeeId, success: true });
				} catch (error: any) {
					errors.push({
						userId,
						error: error.message || "Failed to enroll user",
					});
				}
			}

			if (errors.length > 0 && results.length === 0) {
				throw new Error(
					`Failed to enroll all users: ${errors.map((e) => e.error).join(", ")}`,
				);
			}

			return { results, errors, deviceId };
		},
		onSuccess: (data) => {
			// Invalidate user queries for all enrolled users
			data.results.forEach((result) => {
				queryClient.invalidateQueries({ queryKey: userKeys.detail(result.userId) });
			});
			queryClient.invalidateQueries({ queryKey: userKeys.lists() });

			if (data.errors.length > 0) {
				toast.warning(
					`Enrolled ${data.results.length} user(s), ${data.errors.length} failed`,
				);
			} else {
				toast.success(`Successfully enrolled ${data.results.length} user(s) to device`);
			}
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to enroll users to device");
		},
	});
}
