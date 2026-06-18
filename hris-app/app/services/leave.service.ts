import { APIService } from "./api-service";
import { API_CONFIG } from "../lib/api/config";
import type { LeaveRequest, PaginatedResponse, ApiResponse } from "../lib/api/config";

export class LeaveService extends APIService {
	async getLeaveRequests(params?: {
		page?: number;
		limit?: number;
		employeeId?: string;
		status?: string;
		type?: string;
		startDate?: string;
		endDate?: string;
	}): Promise<PaginatedResponse<LeaveRequest>> {
		const queryParams = new URLSearchParams();

		if (params?.page) queryParams.append("page", params.page.toString());
		if (params?.limit) queryParams.append("limit", params.limit.toString());
		if (params?.employeeId) queryParams.append("employeeId", params.employeeId);
		if (params?.status) queryParams.append("status", params.status);
		if (params?.type) queryParams.append("type", params.type);
		if (params?.startDate) queryParams.append("startDate", params.startDate);
		if (params?.endDate) queryParams.append("endDate", params.endDate);

		const url = `${API_CONFIG.ENDPOINTS.LEAVE.LIST}${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
		return this.get<LeaveRequest[]>(url) as Promise<PaginatedResponse<LeaveRequest>>;
	}

	async createLeaveRequest(leaveData: {
		type: LeaveRequest["type"];
		startDate: string;
		endDate: string;
		reason: string;
		employeeId?: string; // Optional, defaults to current user
	}): Promise<ApiResponse<LeaveRequest>> {
		return this.post<LeaveRequest>(API_CONFIG.ENDPOINTS.LEAVE.REQUEST, leaveData);
	}

	async approveLeaveRequest(id: string, comments?: string): Promise<ApiResponse<LeaveRequest>> {
		const url = this.buildUrl(API_CONFIG.ENDPOINTS.LEAVE.APPROVE, { id });
		return this.post<LeaveRequest>(url, { comments });
	}

	async rejectLeaveRequest(id: string, reason: string): Promise<ApiResponse<LeaveRequest>> {
		const url = this.buildUrl(API_CONFIG.ENDPOINTS.LEAVE.REJECT, { id });
		return this.post<LeaveRequest>(url, { reason });
	}

	async getLeaveBalance(employeeId?: string): Promise<
		ApiResponse<{
			sick: number;
			vacation: number;
			personal: number;
			maternity: number;
			paternity: number;
			total: number;
		}>
	> {
		const queryParams = new URLSearchParams();
		if (employeeId) queryParams.append("employeeId", employeeId);

		const url = `${API_CONFIG.ENDPOINTS.LEAVE.BALANCE}${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
		return this.get(url);
	}

	async getMyLeaveRequests(params?: {
		page?: number;
		limit?: number;
		status?: string;
		type?: string;
	}): Promise<PaginatedResponse<LeaveRequest>> {
		return this.getLeaveRequests({ ...params });
	}

	async getPendingApprovals(params?: {
		page?: number;
		limit?: number;
		type?: string;
	}): Promise<PaginatedResponse<LeaveRequest>> {
		return this.getLeaveRequests({ ...params, status: "pending" });
	}

	async updateLeaveRequest(
		id: string,
		updates: Partial<LeaveRequest>,
	): Promise<ApiResponse<LeaveRequest>> {
		const url = this.buildUrl(API_CONFIG.ENDPOINTS.LEAVE.LIST + "/:id", { id });
		return this.put<LeaveRequest>(url, updates);
	}

	async cancelLeaveRequest(id: string, reason: string): Promise<ApiResponse<LeaveRequest>> {
		const url = this.buildUrl(API_CONFIG.ENDPOINTS.LEAVE.LIST + "/:id", { id });
		return this.patch<LeaveRequest>(url, {
			status: "cancelled",
			cancellationReason: reason,
		});
	}
}

// Export singleton instance
export const leaveService = new LeaveService();
