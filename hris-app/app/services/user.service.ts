import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";
import type { User } from "../types/common";

export interface CreateUserRequest {
	email: string;
	password?: string;
	userName: string;
	roleId: string;
	organizationId?: string;
	avatar?: string;
	status?: "active" | "inactive" | "suspended" | "archived";
	loginMethod?: "email" | "username";
}

export interface UpdateUserRequest {
	email?: string;
	userName?: string;
	roleId?: string;
	avatar?: string;
	status?: "active" | "inactive" | "suspended" | "archived";
	loginMethod?: "email" | "username";
}

export interface UserWithAvatar {
	id: string;
	email: string;
	name?: string;
	firstName?: string;
	lastName?: string;
	avatar?: string;
	avatarUrl?: string;
	profilePicture?: string;
	image?: string;
	photo?: string;
	role: string;
	userName?: string;
	status?: "active" | "inactive" | "suspended" | "archived";
	organizationId?: string;
	userRoles?: any[];
	metadata?: Record<string, any>;
	person?: {
		personalInfo: {
			firstName: string;
			lastName: string;
		};
	};
}

export interface UsersPagination {
	total: number;
	page: number;
	limit: number;
	totalPages?: number;
	hasNext?: boolean;
	hasPrev?: boolean;
}

export interface UsersPayload {
	users: UserWithAvatar[];
	count?: number;
	pagination?: UsersPagination;
}

export interface UsersResponse {
	status?: string;
	message?: string;
	data: UsersPayload;
	code?: number;
	timestamp?: string;
}

class UserService extends APIService {
	private readonly authMeEndpoint = "/api/auth/me";
	private readonly authUsersEndpoint = "/api/auth/users";

	/**
	 * Get current user information
	 * @returns Promise<User> - Current user data
	 */
	async getCurrentUser(): Promise<User> {
		try {
			const response = await hrisApiClient.get<User>(this.authMeEndpoint);
			return (response.data || response) as User;
		} catch (error: any) {
			console.error("Error fetching current user:", error);
			throw new Error(error.message || "Error fetching current user");
		}
	}

	async updateCurrentUserAvatar(formData: FormData): Promise<User> {
		try {
			const response = await hrisApiClient.patchForm<User>(
				`${this.authMeEndpoint}/avatar`,
				formData,
			);
			if (!response.data) {
				throw new Error("Failed to update avatar");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating current user avatar:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating avatar",
			);
		}
	}

	/**
	 * Get all users with optional filtering, pagination, and sorting
	 * @returns Promise<UsersResponse> - Users response with pagination
	 */
	async getUsers(): Promise<UsersResponse> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<UsersPayload>(
				`${this.authUsersEndpoint}${queryString}`,
			);
			return response as unknown as UsersResponse;
		} catch (error: any) {
			console.error("Error fetching users:", error);
			throw new Error(error.errors?.[0]?.message || error.message || "Error fetching users");
		}
	}

	/**
	 * Get user by ID with optional field selection
	 * @param userId User ID
	 * @returns Promise<User> - User data
	 */
	async getUserById(userId: string): Promise<User> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<User>(
				`${this.authUsersEndpoint}/${userId}${queryString}`,
			);
			if (!response.data) {
				throw new Error("User not found");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error fetching user:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching user",
			);
		}
	}

	/**
	 * Create a new user
	 * @param data User creation data
	 * @returns Promise<User> - Created user data
	 */
	async createUser(data: CreateUserRequest): Promise<User> {
		try {
			const response = await hrisApiClient.post<User>(this.authUsersEndpoint, data);
			if (!response.data) {
				throw new Error("Failed to create user");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error creating user:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error creating user",
			);
		}
	}

	/**
	 * Update an existing user
	 * @param userId User ID
	 * @param data User update data
	 * @returns Promise<User> - Updated user data
	 */
	async updateUser(userId: string, data: UpdateUserRequest): Promise<User> {
		try {
			const response = await hrisApiClient.patch<User>(
				`${this.authUsersEndpoint}/${userId}`,
				data,
			);
			if (!response.data) {
				throw new Error("Failed to update user");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating user:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating user",
			);
		}
	}

	/**
	 * Reset an existing user's password to the canonical temporary password
	 * and require them to change it on next login.
	 * @param userId User ID
	 * @returns Promise<User> - Updated user data
	 */
	async resetUserPassword(userId: string): Promise<User> {
		try {
			const response = await hrisApiClient.patch<User>(
				`${this.authUsersEndpoint}/${userId}/reset-password`,
			);
			if (!response.data) {
				throw new Error("Failed to reset user password");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error resetting user password:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error resetting user password",
			);
		}
	}

	/**
	 * Delete a user (soft delete using DELETE)
	 * @param userId User ID
	 * @returns Promise<void>
	 */
	async deleteUser(userId: string): Promise<void> {
		try {
			await hrisApiClient.delete(`${this.authUsersEndpoint}/${userId}`);
		} catch (error: any) {
			console.error("Error deleting user:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error deleting user",
			);
		}
	}

	/**
	 * Get users by organization ID
	 * @param organizationId Organization ID
	 * @param params Optional query parameters
	 * @returns Promise<UsersResponse> - Users response
	 */
	async getUsersByOrganization(
		organizationId: string,
		params?: ApiQueryParams,
	): Promise<UsersResponse> {
		try {
			const queryString = this.getQueryString();
			const hasFilter = queryString.includes("filter=");
			const scopedQuery = hasFilter
				? queryString
				: `${queryString}${queryString ? "&" : "?"}filter=organizationId:${organizationId}`;
			const response = await hrisApiClient.get<UsersPayload>(
				`${this.authUsersEndpoint}${scopedQuery}`,
			);
			return response as unknown as UsersResponse;
		} catch (error: any) {
			console.error("Error fetching organization users:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching organization users",
			);
		}
	}

	/**
	 * Get users with specific parameters
	 * @param params Query parameters
	 * @returns Promise<UsersResponse> - Users response
	 */
	async getUsersWithParams(params: ApiQueryParams): Promise<UsersResponse> {
		return this.setParams(params).getUsers();
	}

	/**
	 * Search users by name or email
	 * @param query Search term
	 * @param params Optional query parameters
	 * @returns Promise<UsersResponse> - Users response
	 */
	async searchUsers(query: string, params?: ApiQueryParams): Promise<UsersResponse> {
		return this.search(query)
			.setParams(params || {})
			.getUsers();
	}

	/**
	 * Get users grouped by a specific field
	 * @param groupBy Field to group by
	 * @param params Optional query parameters
	 * @returns Promise<UsersResponse> - Users response
	 */
	async getUsersGrouped(groupBy: string, params?: ApiQueryParams): Promise<UsersResponse> {
		return this.setParams({
			...params,
			groupBy,
		}).getUsers();
	}

	/**
	 * Get users with avatars (legacy method for backward compatibility)
	 * @returns Promise<UserWithAvatar[]> - Users with avatar data
	 */
	async getUsersWithAvatars(): Promise<UserWithAvatar[]> {
		try {
			const response = await this.select([
				"id",
				"email",
				"firstName",
				"lastName",
				"avatar",
				"avatarUrl",
				"profilePicture",
				"role",
			]).getUsers();
			return response.data?.users || [];
		} catch (error) {
			console.error("Error fetching users with avatars:", error);
			return [];
		}
	}

	/**
	 * Get all users with avatars (legacy method for backward compatibility)
	 * @returns Promise<UserWithAvatar[]> - All users with avatar data
	 */
	async getAllUsersWithAvatars(): Promise<UserWithAvatar[]> {
		return this.getUsersWithAvatars();
	}

	/**
	 * Update user metadata
	 * @param userId User ID
	 * @param metadata Metadata object to update
	 * @returns Promise<User> - Updated user data
	 */
	async updateUserMetadata(userId: string, metadata: Record<string, any>): Promise<User> {
		try {
			const response = await hrisApiClient.patch<User>(`${this.authUsersEndpoint}/${userId}`, {
				metadata,
			});
			if (!response.data) {
				throw new Error("Failed to update user metadata");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating user metadata:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating user metadata",
			);
		}
	}

	/**
	 * Import device enrollment from file
	 * @param formData FormData containing the file
	 * @returns Promise<any> - Import summary
	 */
	async importDeviceEnrollment(formData: FormData): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>("/user/enroll/import", formData);
			if (!response.data) {
				throw new Error("Failed to import device enrollment");
			}
			return response.data.data || response.data;
		} catch (error: any) {
			console.error("Error importing device enrollment:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error importing device enrollment",
			);
		}
	}
}

// Export singleton instance
const userService = new UserService();
export default userService;
