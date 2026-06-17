import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface LeaveType {
	id: string;
	organizationId?: string;
	code: string;
	name: string;
	description?: string | null;
	sortOrder: number;
	isActive: boolean;
	enabled: boolean;
	isPaid: boolean;
	requiresApproval: boolean;
	minAdvanceNoticeDays: number;
	maxDaysPerRequest: number;
	allowHalfDay: boolean;
	requireAttachment: boolean;
	allowedEmploymentTypes: string[];
	createdAt: string;
	updatedAt: string;
}

export interface CreateLeaveTypeRequest {
	code: string;
	name: string;
	description?: string;
	sortOrder?: number;
	isActive?: boolean;
	organizationId: string;
	enabled?: boolean;
	isPaid?: boolean;
	requiresApproval?: boolean;
	minAdvanceNoticeDays?: number;
	maxDaysPerRequest?: number;
	allowHalfDay?: boolean;
	requireAttachment?: boolean;
	allowedEmploymentTypes?: string[];
}

export interface UpdateLeaveTypeRequest {
	code?: string;
	name?: string;
	description?: string;
	sortOrder?: number;
	isActive?: boolean;
	enabled?: boolean;
	isPaid?: boolean;
	requiresApproval?: boolean;
	minAdvanceNoticeDays?: number;
	maxDaysPerRequest?: number;
	allowHalfDay?: boolean;
	requireAttachment?: boolean;
	allowedEmploymentTypes?: string[];
}

export interface LeaveTypesResponse {
	leaveTypes: LeaveType[];
	leavetypes: LeaveType[];
	count?: number;
	pagination?: {
		page: number;
		limit: number;
		total: number;
		totalPages?: number;
		hasNext?: boolean;
		hasPrev?: boolean;
	};
}

const unwrapApiData = (payload: any) => {
	if (payload && typeof payload === "object" && "data" in payload) {
		return payload.data;
	}
	return payload;
};

const normalizeLeaveType = (payload: any): LeaveType => {
	const data = unwrapApiData(payload);
	const leaveType = data?.leaveType || data?.leavetype || data;
	if (!leaveType || typeof leaveType !== "object" || !leaveType.id) {
		throw new Error("Invalid leave type response");
	}
	return leaveType as LeaveType;
};

const normalizeLeaveTypesResponse = (payload: any): LeaveTypesResponse => {
	const data = unwrapApiData(payload);
	const directArray = Array.isArray(data) ? data : undefined;
	const leaveTypes = (directArray ||
		data?.leaveTypes ||
		data?.leavetypes ||
		data?.data?.leaveTypes ||
		data?.data?.leavetypes ||
		[]) as LeaveType[];

	return {
		leaveTypes,
		leavetypes: leaveTypes,
		count: data?.count ?? data?.pagination?.total ?? leaveTypes.length,
		pagination: data?.pagination,
	};
};

class LeaveTypesService extends APIService {
	async getLeaveTypes(): Promise<LeaveTypesResponse> {
		try {
			const queryString = this.getQueryString();
			const endpoint = `/api/leaveType${queryString}`;
			const response = await hrisApiClient.get<any>(endpoint);
			return normalizeLeaveTypesResponse(response);
		} catch (error: any) {
			console.error("Error fetching leave types:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching leave types",
			);
		}
	}

	async getLeaveTypeById(leaveTypeId: string): Promise<LeaveType> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<any>(
				`/api/leaveType/${leaveTypeId}${queryString}`,
			);
			return normalizeLeaveType(response);
		} catch (error: any) {
			console.error("Error fetching leave type:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching leave type",
			);
		}
	}

	async createLeaveType(payload: CreateLeaveTypeRequest): Promise<LeaveType> {
		try {
			const response = await hrisApiClient.post<any>("/api/leaveType", payload);
			return normalizeLeaveType(response);
		} catch (error: any) {
			console.error("Error creating leave type:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error creating leave type",
			);
		}
	}

	async updateLeaveType(
		leaveTypeId: string,
		payload: UpdateLeaveTypeRequest,
	): Promise<LeaveType> {
		try {
			const response = await hrisApiClient.patch<any>(
				`/api/leaveType/${leaveTypeId}`,
				payload,
			);
			return normalizeLeaveType(response);
		} catch (error: any) {
			console.error("Error updating leave type:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error updating leave type",
			);
		}
	}

	async deleteLeaveType(leaveTypeId: string): Promise<void> {
		try {
			await hrisApiClient.delete(`/api/leaveType/${leaveTypeId}`);
		} catch (error: any) {
			console.error("Error deleting leave type:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error deleting leave type",
			);
		}
	}

	async importLeaveTypes(file: File): Promise<any> {
		const formData = new FormData();
		formData.append("file", file);
		const response = await hrisApiClient.post<any>("/api/leaveType/import", formData, {
			headers: { "Content-Type": "multipart/form-data" },
		});
		return response.data || response;
	}

	async getLeaveTypesWithParams(params: ApiQueryParams): Promise<LeaveTypesResponse> {
		return this.setParams(params).getLeaveTypes();
	}

	async searchLeaveTypes(query: string, params?: ApiQueryParams): Promise<LeaveTypesResponse> {
		return this.search(query)
			.setParams(params || {})
			.getLeaveTypes();
	}
}

const leaveTypesService = new LeaveTypesService();
export default leaveTypesService;
