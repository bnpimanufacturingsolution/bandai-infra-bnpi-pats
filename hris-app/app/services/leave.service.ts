import { API_CONFIG } from "../lib/api/config";
import type { LeaveRequest, PaginatedResponse, ApiResponse } from "../lib/api/config";
import { hrisApiClient } from "../lib/api-client";

const withId = (endpoint: string, id: string) => endpoint.replace(":id", id);

export class LeaveService {
	async getLeaveRequests(params?: {
		page?: number;
		limit?: number;
		employeeId?: string;
		status?: string;
		type?: string;
		startDate?: string;
		endDate?: string;
	}): Promise<PaginatedResponse<LeaveRequest>> {
		const response = await hrisApiClient.get<PaginatedResponse<LeaveRequest>>(
			API_CONFIG.ENDPOINTS.LEAVE.LIST,
			params,
		);
		return (response.data as PaginatedResponse<LeaveRequest>) || response;
	}

	async createLeaveRequest(leaveData: {
		type: LeaveRequest["type"];
		startDate: string;
		endDate: string;
		reason: string;
		employeeId?: string;
	}): Promise<ApiResponse<LeaveRequest>> {
		return hrisApiClient.post<LeaveRequest>(API_CONFIG.ENDPOINTS.LEAVE.REQUEST, leaveData);
	}

	async approveLeaveRequest(id: string, comments?: string): Promise<ApiResponse<LeaveRequest>> {
		return hrisApiClient.post<LeaveRequest>(withId(API_CONFIG.ENDPOINTS.LEAVE.APPROVE, id), {
			comments,
		});
	}

	async rejectLeaveRequest(id: string, reason: string): Promise<ApiResponse<LeaveRequest>> {
		return hrisApiClient.post<LeaveRequest>(withId(API_CONFIG.ENDPOINTS.LEAVE.REJECT, id), {
			reason,
		});
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
		const endpoint = employeeId
			? `${API_CONFIG.ENDPOINTS.LEAVE.BALANCE}?employeeId=${encodeURIComponent(employeeId)}`
			: API_CONFIG.ENDPOINTS.LEAVE.BALANCE;
		return hrisApiClient.get(endpoint);
	}

	async getMyLeaveRequests(params?: {
		page?: number;
		limit?: number;
		status?: string;
		type?: string;
	}): Promise<PaginatedResponse<LeaveRequest>> {
		return this.getLeaveRequests(params);
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
		return hrisApiClient.put<LeaveRequest>(withId(API_CONFIG.ENDPOINTS.LEAVE.DETAIL, id), updates);
	}

	async cancelLeaveRequest(id: string, reason: string): Promise<ApiResponse<LeaveRequest>> {
		return hrisApiClient.patch<LeaveRequest>(withId(API_CONFIG.ENDPOINTS.LEAVE.DETAIL, id), {
			status: "cancelled",
			cancellationReason: reason,
		});
	}
}

export const leaveService = new LeaveService();
