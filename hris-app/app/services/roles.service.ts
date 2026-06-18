import { apiClient, hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface Role {
	id: string;
	name: string;
	displayName?: string;
	source?: "local" | "idp";
	code?: string;
	description?: string;
	scope?: string;
	level?: number;
	isActive?: boolean;
	appSubscription?: {
		app?: {
			id?: string;
			name?: string;
			code?: string;
		};
	};
	appRoles?: Array<{
		app?: {
			id?: string;
			name?: string;
			code?: string;
		};
	}>;
	createdAt?: string;
	updatedAt?: string;
}

export interface CreateRoleRequest {
	name: string;
	code: string;
	description?: string;
	level: number;
	isActive: boolean;
	organizationId: string;
}

export interface UpdateRoleRequest {
	name?: string;
	code?: string;
	description?: string;
	level?: number;
	isActive?: boolean;
}

export interface RolesPagination {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
	hasNext?: boolean;
	hasPrev?: boolean;
}

export interface RolesPayload {
	roles: Role[];
	count?: number;
	pagination?: RolesPagination;
}

export interface RolesResponse {
	status?: string;
	message?: string;
	data: RolesPayload;
	code?: number;
	timestamp?: string;
}

export interface RolesListResponse {
	roles: Role[];
	pagination?: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

class RolesService extends APIService {
	private shouldFallbackToAuthApi(error: any): boolean {
		const status = Number(error?.status || 0);
		return status === 0 || status === 404 || status === 405 || status === 501;
	}

	/**
	 * Get all roles with optional filtering, pagination, and sorting
	 * @param document - Include document information
	 * @param params - Optional query parameters override
	 * @returns Promise<RolesResponse> - Roles response with pagination
	 */
	async getRoles(
		document: boolean = true,
		params?: Partial<
			ApiQueryParams & {
				pagination?: boolean;
				count?: boolean;
				document?: boolean;
			}
		>,
	): Promise<RolesResponse> {
		try {
			void document;
			void params;
			const endpoint = "/api/auth/roles";
			let response;
			try {
				response = await hrisApiClient.get<RolesPayload>(endpoint);
			} catch (error: any) {
				if (this.shouldFallbackToAuthApi(error)) {
					response = await apiClient.get<RolesPayload>(endpoint);
				} else {
					throw error;
				}
			}
			if (!response.data) {
				throw new Error("Failed to fetch roles");
			}
			return response as unknown as RolesResponse;
		} catch (error: any) {
			console.error("Error fetching roles:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching roles",
			);
		}
	}

	/**
	 * Create a new role
	 * @param payload Role creation payload
	 * @returns Promise<Role> - Created role
	 */
	async createRole(payload: CreateRoleRequest): Promise<Role> {
		try {
			// Set the auth token for HRIS API client

			console.log("Creating role with payload:", payload);

			const response = await hrisApiClient.post<Role>("/api/role", payload);
			if (!response.data) {
				throw new Error("Failed to create role");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error creating role:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error creating role",
			);
		}
	}

	/**
	 * Update an existing role
	 * @param roleId Role ID
	 * @param payload Role update payload
	 * @returns Promise<Role> - Updated role
	 */
	async updateRole(roleId: string, payload: UpdateRoleRequest): Promise<Role> {
		try {
			// Set the auth token for HRIS API client

			console.log("Updating role:", roleId, "with payload:", payload);

			const response = await hrisApiClient.patch<Role>(`/api/role/${roleId}`, payload);
			if (!response.data) {
				throw new Error("Failed to update role");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating role:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating role",
			);
		}
	}

	/**
	 * Delete a role
	 * @param roleId Role ID
	 * @returns Promise<{ id: string }> - Deleted role ID
	 */
	async deleteRole(roleId: string): Promise<{ id: string }> {
		try {
			// Set the auth token for HRIS API client

			console.log("Deleting role:", roleId);

			const response = await hrisApiClient.delete<{ id: string }>(`/api/role/${roleId}`);
			if (!response.data) {
				throw new Error("Failed to delete role");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error deleting role:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error deleting role",
			);
		}
	}

	/**
	 * Get role by ID with optional field selection
	 * @param roleId Role ID
	 * @returns Promise<Role> - Role data
	 */
	async getRoleById(roleId: string): Promise<Role> {
		try {
			// Set the auth token for HRIS API client

			const endpoint = `/api/role/${roleId}`;
			const response = await hrisApiClient.get<{ role: Role }>(endpoint);
			if (!response.data) {
				throw new Error("Role not found");
			}
			return response.data.role;
		} catch (error: any) {
			console.error("Error fetching role:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching role",
			);
		}
	}

	/**
	 * Get roles with specific parameters
	 * @param params Query parameters
	 * @returns Promise<RolesResponse> - Roles response
	 */
	async getRolesWithParams(params: ApiQueryParams): Promise<RolesResponse> {
		return this.getRoles(params.document !== false, params);
	}

	/**
	 * Search roles by name or description
	 * @param query Search term
	 * @param params Optional query parameters
	 * @returns Promise<RolesResponse> - Roles response
	 */
	async searchRoles(query: string, params?: ApiQueryParams): Promise<RolesResponse> {
		return this.getRoles(params?.document !== false, {
			...(params || {}),
			query,
		});
	}

	/**
	 * Get roles grouped by a specific field
	 * @param groupBy Field to group by
	 * @param params Optional query parameters
	 * @returns Promise<RolesResponse> - Roles response
	 */
	async getRolesGrouped(groupBy: string, params?: ApiQueryParams): Promise<RolesResponse> {
		return this.getRoles(params?.document !== false, {
			...params,
			groupBy,
		});
	}
}

// Export singleton instance
const rolesService = new RolesService();
export default rolesService;

