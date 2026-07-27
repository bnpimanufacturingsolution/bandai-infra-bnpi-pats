import { normalizeApiBase, resolveApiUrl } from "./api-url.helper";
import { getRuntimeApiBase } from "./runtime-api-base";
import { ACCOUNT_DEACTIVATED_MESSAGE } from "./employee-action-block";

// API Base configuration
const runtimeApiBase = getRuntimeApiBase();
const API_BASE_URL = normalizeApiBase(
	runtimeApiBase || "/api",
	"/api",
);
const API_HRIS_URL = API_BASE_URL;
const ROLE_API_BASE_URL =
	(import.meta.env.VITE_API_ROLES_URL as string | undefined)?.trim() ||
	API_BASE_URL.replace(/\/api\/?$/, "");
const AUTH_TOKEN_STORAGE_KEY = "authToken";
const AUTH_TOKEN_STORAGE_ENABLED =
	String(import.meta.env.VITE_AUTH_TOKEN_STORAGE_ENABLED || "true")
		.trim()
		.toLowerCase() !== "disabled";
// API Response types
export interface ApiResponse<T = any> {
	success: boolean;
	message: string;
	data?: T;
	error?: string;
	errors?: Array<{ field: string; message: string }>;
}

export interface PaginatedResponse<T> {
	data: T[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
		hasNextPage: boolean;
		hasPrevPage: boolean;
	};
}

export interface GroupedResponse<T> {
	grouped: Record<string, { count: number; data: T[] }>;
	groupBy: string;
	totalGroups: number;
	totalItems: number;
}

// Query parameters for list endpoints
export interface QueryParams {
	page?: number;
	limit?: number;
	sort?: string;
	order?: "asc" | "desc";
	fields?: string;
	query?: string;
	filter?: string;
	groupBy?: string;
	documents?: boolean;
	pagination?: boolean;
	count?: boolean;
}

export interface ApiRequestOptions extends RequestInit {
	timeoutMs?: number;
}

// HTTP Client class
class ApiClient {
	private baseURL: string;
	private defaultHeaders: Record<string, string>;

	constructor(baseURL: string) {
		this.baseURL = baseURL;
		this.defaultHeaders = {
			"Content-Type": "application/json",
		};
	}

	// Set authorization token
	setAuthToken(token: string) {
		this.defaultHeaders["Authorization"] = `Bearer ${token}`;
	}

	// Remove authorization token
	removeAuthToken() {
		delete this.defaultHeaders["Authorization"];
	}

	// Get current headers (for debugging)
	getHeaders() {
		return { ...this.defaultHeaders };
	}

	// Build query string from parameters
	private buildQueryString(params: QueryParams): string {
		const searchParams = new URLSearchParams();

		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined && value !== null && value !== "") {
				searchParams.append(key, String(value));
			}
		});

		const queryString = searchParams.toString();
		return queryString ? `?${queryString}` : "";
	}

	private resolveUrl(endpoint: string): string {
		return resolveApiUrl(this.baseURL, endpoint);
	}

	private shouldAttachHrisBearer(headers: Record<string, string>): boolean {
		return (
			typeof window !== "undefined" &&
			AUTH_TOKEN_STORAGE_ENABLED &&
			!headers["Authorization"] &&
			this.baseURL === API_HRIS_URL
		);
	}

	// Generic request method
	private async request<T>(
		endpoint: string,
		options: ApiRequestOptions = {},
	): Promise<ApiResponse<T>> {
		const url = this.resolveUrl(endpoint);
		const { timeoutMs, signal, ...requestOptions } = options;

		// Check if body is FormData
		const isFormData = requestOptions.body instanceof FormData;

		// Build headers - don't set Content-Type for FormData (browser will set it with boundary)
		const headers: Record<string, string> = { ...this.defaultHeaders };

		if (isFormData) {
			// Remove Content-Type for FormData - browser will set it automatically with boundary
			delete headers["Content-Type"];
		}
		// Merge with custom headers (but don't override FormData Content-Type)
		if (requestOptions.headers) {
			Object.entries(requestOptions.headers).forEach(([key, value]) => {
				if (isFormData && key.toLowerCase() === "content-type") {
					// Skip Content-Type header for FormData
					return;
				}
				headers[key] = value as string;
			});
		}

		// Temporary browser fallback while auth and HRIS APIs live on different domains.
		// Prefer cookie auth, but attach a bearer token when one was issued by login/SSO validate.
		if (this.shouldAttachHrisBearer(headers)) {
			const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
			if (token) {
				headers["Authorization"] = `Bearer ${token}`;
			}
		}

		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		let effectiveSignal = signal;

		if (timeoutMs && timeoutMs > 0) {
			const controller = new AbortController();
			timeoutId = setTimeout(() => controller.abort(), timeoutMs);
			effectiveSignal = controller.signal;

			if (signal) {
				if (signal.aborted) {
					controller.abort();
				} else {
					signal.addEventListener("abort", () => controller.abort(), { once: true });
				}
			}
		}

		const config: RequestInit = {
			...requestOptions,
			credentials: "include", // Include cookies in requests
			headers,
			signal: effectiveSignal,
		};

		const shouldRetryEndpoint = (ep: string) =>
			ep.includes("/auth/login") ||
			ep.includes("/auth/me") ||
			ep.includes("system-provisioning/status");
		const shouldRetryMethod = (requestOptions.method || "GET").toUpperCase();
		const retryableMethod = shouldRetryMethod === "GET" || shouldRetryMethod === "POST";
		const maxRetries = shouldRetryEndpoint(endpoint) && retryableMethod ? 2 : 0;
		const retryDelayMs = [250, 700];

		const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

		try {
			for (let attempt = 0; attempt <= maxRetries; attempt++) {
				try {
					const response = await fetch(url, config);
					const responseText = await response.text();
					let data: any = null;
					try {
						data = responseText ? JSON.parse(responseText) : {};
					} catch {
						data = {
							message: responseText || `Non-JSON response from ${url}`,
							raw: responseText,
						};
					}

					if (!response.ok) {
						const retryableStatus = [502, 503, 504].includes(response.status);
						if (retryableStatus && attempt < maxRetries) {
							const waitMs = retryDelayMs[Math.min(attempt, retryDelayMs.length - 1)];
							await sleep(waitMs);
							continue;
						}

						const serverMessage = (data?.message || data?.error || "").toString();
						const isDeactivated =
							response.status === 403 &&
							(serverMessage.includes("deactivated due to termination or resignation") ||
								data?.error === "ACCOUNT_DEACTIVATED");

						if (isDeactivated && typeof window !== "undefined") {
							window.dispatchEvent(
								new CustomEvent("auth:deactivated", {
									detail: {
										message: ACCOUNT_DEACTIVATED_MESSAGE,
										employmentStatus: data?.data?.employmentStatus,
									},
								}),
							);
						}

						throw {
							status: response.status,
							statusText: response.statusText,
							...data,
						};
					}

					return data as ApiResponse<T>;
				} catch (error: any) {
					if (error?.name === "AbortError") {
						throw {
							status: 408,
							statusText: "Request Timeout",
							message: "The request took too long to complete",
							error: "REQUEST_TIMEOUT",
						};
					}

					const networkLike =
						error?.name === "TypeError" || error?.message?.includes("fetch");
					if (networkLike && attempt < maxRetries) {
						const waitMs = retryDelayMs[Math.min(attempt, retryDelayMs.length - 1)];
						await sleep(waitMs);
						continue;
					}

					if (networkLike) {
						throw {
							status: 0,
							statusText: "Network Error",
							message: "Unable to connect to the server",
							error: "NETWORK_ERROR",
						};
					}

					throw error;
				}
			}

			throw {
				status: 503,
				statusText: "Service Unavailable",
				message: "Request failed after retries",
				error: "RETRY_EXHAUSTED",
			};
		} finally {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		}
	}

	// GET request
	async get<T>(endpoint: string, params?: QueryParams): Promise<ApiResponse<T>> {
		const queryString = params ? this.buildQueryString(params) : "";
		return this.request<T>(`${endpoint}${queryString}`, {
			method: "GET",
		});
	}

	// GET request for Blob (files)
	async getBlob(endpoint: string, params?: QueryParams): Promise<Blob> {
		const queryString = params ? this.buildQueryString(params) : "";
		const url = `${this.resolveUrl(endpoint)}${queryString}`;

		const headers = { ...this.defaultHeaders };
		if (this.shouldAttachHrisBearer(headers)) {
			const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
			if (token) {
				headers["Authorization"] = `Bearer ${token}`;
			}
		}

		const config: RequestInit = {
			method: "GET",
			headers,
			credentials: "include",
		};

		try {
			const response = await fetch(url, config);

			if (!response.ok) {
				const responseText = await response.text();
				let errorPayload: any = {};
				try {
					errorPayload = responseText ? JSON.parse(responseText) : {};
				} catch {
					errorPayload = { message: responseText };
				}
				throw {
					status: response.status,
					statusText: response.statusText,
					...errorPayload,
				};
			}

			return await response.blob();
		} catch (error: any) {
			if (error.name === "TypeError" || error.message?.includes("fetch")) {
				throw {
					status: 0,
					statusText: "Network Error",
					message: "Unable to connect to the server",
					error: "NETWORK_ERROR",
				};
			}
			throw error;
		}
	}

	// POST request
	async post<T>(endpoint: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
		// If data is FormData, pass it directly without stringifying
		// Otherwise, stringify as JSON
		const body = data instanceof FormData ? data : data ? JSON.stringify(data) : undefined;

		return this.request<T>(endpoint, {
			method: "POST",
			body,
			...options,
		});
	}

	// PATCH request (JSON only)
	async patch<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
		return this.request<T>(endpoint, {
			method: "PATCH",
			body: data ? JSON.stringify(data) : undefined,
		});
	}

	// PATCH request with FormData (for file uploads)
	async patchForm<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
		return this.request<T>(endpoint, {
			method: "PATCH",
			body: formData,
		});
	}

	// PUT request (JSON only)
	async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
		return this.request<T>(endpoint, {
			method: "PUT",
			body: data ? JSON.stringify(data) : undefined,
		});
	}

	// PUT request with FormData (for file uploads)
	async putForm<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
		return this.request<T>(endpoint, {
			method: "PUT",
			body: formData,
		});
	}

	// DELETE request
	async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
		return this.request<T>(endpoint, {
			method: "DELETE",
		});
	}
}

// Create and export the API client instance for authentication
export const apiClient = new ApiClient(API_BASE_URL);

// Create and export the HRIS API client instance
export const hrisApiClient = new ApiClient(API_HRIS_URL);

// Create and export the Roles API client instance (AWS API Gateway)
export const rolesApiClient = new ApiClient(ROLE_API_BASE_URL);

// Deprecated for browser cookie-auth flows. Explicit tokens may still be passed by non-browser callers.
export const setHrisAuthToken = (token?: string) => {
	if (typeof window !== "undefined") {
		if (!AUTH_TOKEN_STORAGE_ENABLED) {
			hrisApiClient.removeAuthToken();
			return;
		}

		if (token) {
			localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
			hrisApiClient.setAuthToken(token);
			return;
		}

		hrisApiClient.removeAuthToken();
		return;
	}

	if (token) {
		hrisApiClient.setAuthToken(token);
	}
};

// Helper function to clear HRIS auth token
export const clearHrisAuthToken = () => {
	if (typeof window !== "undefined") {
		localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
	}
	hrisApiClient.removeAuthToken();
};

// Helper function to get token from localStorage and set it for Roles client
export const setRolesAuthToken = () => {
	if (!AUTH_TOKEN_STORAGE_ENABLED) {
		rolesApiClient.removeAuthToken();
		return;
	}

	const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
	console.log("setRolesAuthToken called, token exists:", !!token);
	if (token) {
		console.log("Setting auth token for Roles client:", token.substring(0, 20) + "...");
		rolesApiClient.setAuthToken(token);
		console.log("Roles client headers after setting token:", rolesApiClient.getHeaders());
	} else {
		console.log("No auth token found in localStorage");
		console.log("Available localStorage keys:", Object.keys(localStorage));
	}
};

// Export the class for testing purposes
export { ApiClient };
