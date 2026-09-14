import { apiClient } from "~/lib/api-client";

/**
 * Training & Performance access API client (Phase 3 minimum scope).
 * Phase 4 UI consumes these; no UI is implemented in Phase 3.
 */

export interface ApplicationAccessListItem {
	employeeId: string;
	employeeNumber: string;
	employeeName: string;
	department: string | null;
	lmsRole: string | null;
	epmrSubroles: string[];
	provenance: {
		lmsRole: string;
		epmrSubroles: Record<string, string>;
	} | null;
	inherited: boolean;
	eligible: boolean;
	employmentStatus: string;
	provisioningStatus: string;
	hasExplicitConfig: boolean;
}

export interface ApplicationAccessCatalog {
	lmsRoles: { assignable: string[]; nonAssignable: string[]; all: string[] };
	epmrSubroles: { assignable: string[]; removable: string[]; explicitOnly: string[] };
	defaultEpmrSubroles: string[];
	provisioningStatuses: string[];
	employmentBlockingStatuses: string[];
}

export interface UpdateApplicationAccessPayload {
	lmsRoleOverride: "employee" | "instructor" | "admin" | null;
	epmrGrants: string[];
	epmrRemovals: string[];
}

export interface ApplicationAccessListResponse {
	status: string;
	message: string;
	data?: {
		items: ApplicationAccessListItem[];
		pagination: { total: number; page: number; limit: number; totalPages: number };
	};
}

export interface ApplicationAccessDetailResponse {
	status: string;
	message: string;
	data?: {
		employee: {
			id: string;
			employeeNumber: string;
			name: string;
			department: string | null;
			employmentStatus: string;
		};
		explicitConfig: {
			lmsRoleOverride: string | null;
			epmrGrants: string[];
			epmrRemovals: string[];
		} | null;
		effective: {
			lmsRole: string | null;
			epmrSubroles: string[];
			provenance: {
				lmsRole: string;
				epmrSubroles: Record<string, string>;
			};
			inherited: boolean;
			eligible: boolean;
		};
		provisioning: {
			status: string;
			lastProvisionedAt: string | null;
			lastSyncError: string | null;
		};
	};
}

const BASE = "/admin/applications";

export const applicationAccessService = {
	async list(params?: {
		page?: number;
		limit?: number;
		search?: string;
		departmentId?: string;
	}): Promise<ApplicationAccessListResponse> {
		const query = new URLSearchParams();
		if (params?.page) query.set("page", String(params.page));
		if (params?.limit) query.set("limit", String(params.limit));
		if (params?.search) query.set("search", params.search);
		if (params?.departmentId) query.set("departmentId", params.departmentId);
		const suffix = query.toString() ? `?${query.toString()}` : "";
		return apiClient.get<ApplicationAccessListResponse["data"]>(`${BASE}/access${suffix}`) as unknown as Promise<ApplicationAccessListResponse>;
	},

	async get(employeeId: string): Promise<ApplicationAccessDetailResponse> {
		return apiClient.get<ApplicationAccessDetailResponse["data"]>(
			`${BASE}/access/${employeeId}`,
		) as unknown as Promise<ApplicationAccessDetailResponse>;
	},

	async update(
		employeeId: string,
		payload: UpdateApplicationAccessPayload,
	): Promise<ApplicationAccessDetailResponse> {
		return apiClient.put<ApplicationAccessDetailResponse["data"]>(
			`${BASE}/access/${employeeId}`,
			payload,
		) as unknown as Promise<ApplicationAccessDetailResponse>;
	},

	async getCatalog(): Promise<{ status: string; data?: ApplicationAccessCatalog }> {
		return apiClient.get<ApplicationAccessCatalog>(`${BASE}/catalog`) as unknown as Promise<{
			status: string;
			data?: ApplicationAccessCatalog;
		}>;
	},
};
