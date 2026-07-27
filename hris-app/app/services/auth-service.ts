import { apiClient, hrisApiClient } from "~/lib/api-client";
import type { User, LoginCredentials, AuthResponse } from "~/types/auth";
import { APIService } from "./api-service";
import { getRuntimeApiBase } from "~/lib/runtime-api-base";
import { getErrorMessage } from "~/lib/utils/error-formatter";

class AuthService extends APIService {
	private resolveHrisMeEndpoint(): string {
		const rawBase = (getRuntimeApiBase() || "/api").trim();
		const normalized = rawBase.replace(/\/+$/, "");
		const hasApiPrefix = normalized.toLowerCase().endsWith("/api");

		// If base does not include /api, prepend it for /auth/me.
		if (!hasApiPrefix) {
			return "/api/auth/me";
		}

		return "/auth/me";
	}

	/**
	 * Login user with employee ID or email and password
	 * @param credentials Login credentials
	 * @returns Promise<User> - User data
	 */
	async login(credentials: LoginCredentials): Promise<User> {
		try {
			const response = await apiClient.post<User>("/auth/login", credentials);
			if (!response?.data) throw new Error("Invalid login response");
			return response.data;
		} catch (error: any) {
			console.error("Error logging in:", error);
			throw new Error(getErrorMessage(error) || "Error logging in");
		}
	}

	/**
	 * SSO Login user with email, password, redirect_uri and state
	 * @param credentials SSO login credentials
	 * @returns Promise<any> - SSO response with handoff token
	 */
	async ssoLogin(
		credentials: LoginCredentials & { redirect_uri: string; state: string },
	): Promise<any> {
		try {
			const response = await apiClient.post<any>("/auth/login", credentials);
			if (!response?.data) throw new Error("Invalid SSO login response");
			return response.data;
		} catch (error: any) {
			console.error("Error in SSO login:", error);
			throw new Error(getErrorMessage(error) || "Error in SSO login");
		}
	}

	/**
	 * Logout current user
	 * @returns Promise<void>
	 */
	async logout(): Promise<void> {
		try {
			await apiClient.post("/auth/logout");
		} catch (error: any) {
			console.error("Error logging out:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error logging out",
			);
		}
	}

	/**
	 * Get current user information
	 * @returns Promise<User> - Current user data
	 */
	async getCurrentUser(): Promise<User> {
		try {
			const primaryEndpoint = this.resolveHrisMeEndpoint();
			const fallbackEndpoint =
				primaryEndpoint === "/auth/me" ? "/api/auth/me" : "/auth/me";

			let response: any;
			try {
				response = await hrisApiClient.get<any>(primaryEndpoint);
			} catch (primaryError: any) {
				// Graceful fallback across env/base URL differences.
				if (primaryError?.status === 404 || primaryError?.status === 0) {
					response = await hrisApiClient.get<any>(fallbackEndpoint);
				} else {
					throw primaryError;
				}
			}

			const userData = response?.data;

			if (!userData) {
				console.error("getCurrentUser - No data in response:", response);
				throw new Error("Invalid current user response - no data found");
			}

			// Ensure organizationId is available (either directly or from nested organization)
			if (!userData.organizationId && userData.organization?.id) {
				userData.organizationId = userData.organization.id;
			}

			return userData as User;
		} catch (error: any) {
			console.error("Error getting current user:", error);
			throw error;
		}
	}

	/**
	 * Validate existing handoff token and set httpOnly cookie
	 */
	async validateHandoffToken(
		token: string,
	): Promise<{ user: User; token?: string; redirect_uri?: string; state?: string }> {
		try {
			const response = await apiClient.post<{
				user: User;
				token?: string;
				redirect_uri?: string;
				state?: string;
			}>("/auth/validate", { token });
			if (!response?.data) throw new Error("Invalid validate response");
			return response.data;
		} catch (error: any) {
			console.error("Error validating handoff token:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error validating token",
			);
		}
	}

	/**
	 * Register a new user
	 * @param userData User registration data
	 * @returns Promise<User> - Created user data
	 */
	async register(userData: any): Promise<User> {
		try {
			const response = await apiClient.post<User>("/auth/register", userData);
			if (!response?.data) throw new Error("Invalid register response");
			return response.data;
		} catch (error: any) {
			console.error("Error registering user:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error registering user",
			);
		}
	}

	/**
	 * Update user password
	 * @param passwordData Password update data
	 * @returns Promise<void>
	 */
	async updatePassword(passwordData: {
		currentPassword: string;
		newPassword: string;
	}): Promise<void> {
		try {
			await apiClient.patch("/auth/update-password", passwordData);
		} catch (error: any) {
			console.error("Error updating password:", error);
			throw new Error("Error updating password");
		}
	}
}

const authService = new AuthService();

export default authService;
