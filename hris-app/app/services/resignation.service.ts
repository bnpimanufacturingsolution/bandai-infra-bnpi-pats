import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";
import type {
	Resignation,
	CreateResignation,
	UpdateResignation,
	ResignationAttachment,
	CreateAttachment,
	ResignationAuditLog,
} from "../zod/resignation.zod";

// Response types
export interface ResignationsResponse {
	resignations: Resignation[];
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages: number;
	};
}

export interface ResignationDetailResponse {
	resignation: Resignation;
	auditLogs?: ResignationAuditLog[];
	attachments?: ResignationAttachment[];
}

// Request types for actions
export interface ManagerApproveRequest {
	managerComments?: string;
	managerId: string;
}

export interface ManagerRejectRequest {
	managerComments: string;
	managerId: string;
}

export interface ManagerRequestDiscussionRequest {
	managerComments: string;
	managerId: string;
}

export interface HRApproveRequest {
	hrComments?: string;
	hrId: string;
	adjustedLastWorkingDay?: string;
}

export interface HRRejectRequest {
	hrComments: string;
	hrId: string;
}

export interface WithdrawRequest {
	withdrawnReason: string;
	withdrawnBy: string;
}

export interface FinalClearanceRequest {
	finalClearanceBy: string;
	comments?: string;
}

class ResignationService extends APIService {
	/**
	 * Get all resignations with optional filtering, pagination, and sorting
	 * @returns Promise<ResignationsResponse> - Resignations response with pagination
	 */
	async getResignations(): Promise<ResignationsResponse> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<ResignationsResponse>(
				`/api/resignations${queryString}`,
			);
			return (response.data || response) as ResignationsResponse;
		} catch (error: any) {
			console.error("Error fetching resignations:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching resignations",
			);
		}
	}

	/**
	 * Get resignation by ID with optional field selection
	 * @param resignationId Resignation ID
	 * @returns Promise<ResignationDetailResponse> - Resignation data with related info
	 */
	async getResignationById(resignationId: string): Promise<ResignationDetailResponse> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<ResignationDetailResponse>(
				`/api/resignations/${resignationId}${queryString}`,
			);
			if (!response.data) {
				throw new Error("Resignation not found");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error fetching resignation:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching resignation",
			);
		}
	}

	/**
	 * Create a new resignation (draft)
	 * @param data Resignation creation data
	 * @returns Promise<Resignation> - Created resignation data
	 */
	async createResignation(data: CreateResignation): Promise<Resignation> {
		try {
			const response = await hrisApiClient.post<Resignation>("/api/resignations/draft", data);
			if (!response.data) {
				throw new Error("Failed to create resignation");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error creating resignation:", error.errors);
			console.log("Error response data:", error.response?.data);
			// Throw the error response data which contains the errors array
			if (error.errors) {
				throw error; // This preserves the errors array
			}

			// Fallback for other types of errors
			throw new Error(error.message || "Error creating resignation");
		}
	}

	/**
	 * Submit resignation (from DRAFT to RESIGNATION_REQUESTED)
	 * @param resignationId Resignation ID
	 * @returns Promise<Resignation> - Updated resignation data
	 */
	async submitResignation(resignationId: string): Promise<Resignation> {
		try {
			const response = await hrisApiClient.post<Resignation>(
				`/api/resignations/${resignationId}/submit`,
				{},
			);
			if (!response.data) {
				throw new Error("Failed to submit resignation");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error submitting resignation:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error submitting resignation",
			);
		}
	}

	/**
	 * Update an existing resignation (only in DRAFT status)
	 * @param resignationId Resignation ID
	 * @param data Resignation update data
	 * @returns Promise<Resignation> - Updated resignation data
	 */
	async updateResignation(resignationId: string, data: UpdateResignation): Promise<Resignation> {
		try {
			const response = await hrisApiClient.patch<Resignation>(
				`/api/resignations/${resignationId}`,
				data,
			);
			if (!response.data) {
				throw new Error("Failed to update resignation");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating resignation:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating resignation",
			);
		}
	}

	/**
	 * Delete a resignation (only in DRAFT status)
	 * @param resignationId Resignation ID
	 * @returns Promise<void>
	 */
	async deleteResignation(resignationId: string): Promise<void> {
		try {
			await hrisApiClient.delete(`/api/resignations/${resignationId}`);
		} catch (error: any) {
			console.error("Error deleting resignation:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error deleting resignation",
			);
		}
	}

	/**
	 * Manager approves resignation
	 * @param resignationId Resignation ID
	 * @param data Manager approval data
	 * @returns Promise<Resignation> - Updated resignation data
	 */
	async managerApprove(resignationId: string, data: ManagerApproveRequest): Promise<Resignation> {
		try {
			const response = await hrisApiClient.post<Resignation>(
				`/api/resignations/${resignationId}/manager/approve`,
				data,
			);
			if (!response.data) {
				throw new Error("Failed to approve resignation");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error approving resignation:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error approving resignation",
			);
		}
	}

	/**
	 * Manager rejects resignation
	 * @param resignationId Resignation ID
	 * @param data Manager rejection data
	 * @returns Promise<Resignation> - Updated resignation data
	 */
	async managerReject(resignationId: string, data: ManagerRejectRequest): Promise<Resignation> {
		try {
			const response = await hrisApiClient.post<Resignation>(
				`/api/resignations/${resignationId}/manager/reject`,
				data,
			);
			if (!response.data) {
				throw new Error("Failed to reject resignation");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error rejecting resignation:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error rejecting resignation",
			);
		}
	}

	/**
	 * Manager requests discussion with employee
	 * @param resignationId Resignation ID
	 * @param data Manager discussion request data
	 * @returns Promise<Resignation> - Updated resignation data
	 */
	async managerRequestDiscussion(
		resignationId: string,
		data: ManagerRequestDiscussionRequest,
	): Promise<Resignation> {
		try {
			const response = await hrisApiClient.post<Resignation>(
				`/api/resignations/${resignationId}/manager/request-discussion`,
				data,
			);
			if (!response.data) {
				throw new Error("Failed to request discussion");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error requesting discussion:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error requesting discussion",
			);
		}
	}

	/**
	 * HR approves resignation
	 * @param resignationId Resignation ID
	 * @param data HR approval data
	 * @returns Promise<Resignation> - Updated resignation data
	 */
	async hrApprove(resignationId: string, data: HRApproveRequest): Promise<Resignation> {
		try {
			const response = await hrisApiClient.post<Resignation>(
				`/api/resignations/${resignationId}/hr/approve`,
				data,
			);
			if (!response.data) {
				throw new Error("Failed to approve resignation");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error approving resignation:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error approving resignation",
			);
		}
	}

	/**
	 * HR rejects resignation
	 * @param resignationId Resignation ID
	 * @param data HR rejection data
	 * @returns Promise<Resignation> - Updated resignation data
	 */
	async hrReject(resignationId: string, data: HRRejectRequest): Promise<Resignation> {
		try {
			const response = await hrisApiClient.post<Resignation>(
				`/api/resignations/${resignationId}/hr/reject`,
				data,
			);
			if (!response.data) {
				throw new Error("Failed to reject resignation");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error rejecting resignation:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error rejecting resignation",
			);
		}
	}

	/**
	 * Withdraw resignation
	 * @param resignationId Resignation ID
	 * @param data Withdrawal data
	 * @returns Promise<Resignation> - Updated resignation data
	 */
	async withdrawResignation(resignationId: string, data: WithdrawRequest): Promise<Resignation> {
		try {
			const response = await hrisApiClient.post<Resignation>(
				`/api/resignations/${resignationId}/withdraw`,
				data,
			);
			if (!response.data) {
				throw new Error("Failed to withdraw resignation");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error withdrawing resignation:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error withdrawing resignation",
			);
		}
	}

	/**
	 * Approve final clearance
	 * @param resignationId Resignation ID
	 * @param data Final clearance data
	 * @returns Promise<Resignation> - Updated resignation data
	 */
	async approveFinalClearance(
		resignationId: string,
		data: FinalClearanceRequest,
	): Promise<Resignation> {
		try {
			const response = await hrisApiClient.post<Resignation>(
				`/api/resignations/${resignationId}/final-clearance`,
				data,
			);
			if (!response.data) {
				throw new Error("Failed to approve final clearance");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error approving final clearance:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error approving final clearance",
			);
		}
	}

	/**
	 * Get resignations by employee ID
	 * @param employeeId Employee ID
	 * @param params Optional query parameters
	 * @returns Promise<ResignationsResponse> - Resignations response
	 */
	async getResignationsByEmployee(
		employeeId: string,
		params?: ApiQueryParams,
	): Promise<ResignationsResponse> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<ResignationsResponse>(
				`/api/resignations/${employeeId}${queryString}`,
			);
			return (response.data || response) as ResignationsResponse;
		} catch (error: any) {
			console.error("Error fetching employee resignations:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching employee resignations",
			);
		}
	}

	/**
	 * Get resignations by manager ID
	 * @param managerId Manager ID
	 * @param params Optional query parameters
	 * @returns Promise<ResignationsResponse> - Resignations response
	 */
	async getResignationsByManager(
		managerId: string,
		params?: ApiQueryParams,
	): Promise<ResignationsResponse> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<ResignationsResponse>(
				`/api/resignations?managerId=${managerId}${queryString}`,
			);
			return (response.data || response) as ResignationsResponse;
		} catch (error: any) {
			console.error("Error fetching manager resignations:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching manager resignations",
			);
		}
	}

	/**
	 * Get resignations by status
	 * @param status Resignation status
	 * @param params Optional query parameters
	 * @returns Promise<ResignationsResponse> - Resignations response
	 */
	async getResignationsByStatus(
		status: string,
		params?: ApiQueryParams,
	): Promise<ResignationsResponse> {
		return this.setParams({
			...params,
			filter: { status },
		}).getResignations();
	}

	/**
	 * Get resignation audit logs
	 * @param resignationId Resignation ID
	 * @returns Promise<ResignationAuditLog[]> - Audit logs
	 */
	async getResignationAuditLogs(resignationId: string): Promise<ResignationAuditLog[]> {
		try {
			const response = await hrisApiClient.get<ResignationAuditLog[]>(
				`/api/resignations/${resignationId}/audit-logs`,
			);
			return (response.data || response) as ResignationAuditLog[];
		} catch (error: any) {
			console.error("Error fetching resignation audit logs:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching resignation audit logs",
			);
		}
	}

	/**
	 * Get resignation attachments
	 * @param resignationId Resignation ID
	 * @returns Promise<ResignationAttachment[]> - Attachments
	 */
	async getResignationAttachments(resignationId: string): Promise<ResignationAttachment[]> {
		try {
			const response = await hrisApiClient.get<ResignationAttachment[]>(
				`/api/resignations/${resignationId}/attachments`,
			);
			return (response.data || response) as ResignationAttachment[];
		} catch (error: any) {
			console.error("Error fetching resignation attachments:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching resignation attachments",
			);
		}
	}

	/**
	 * Add attachment to resignation
	 * @param data Attachment data
	 * @returns Promise<ResignationAttachment> - Created attachment
	 */
	async addAttachment(data: CreateAttachment): Promise<ResignationAttachment> {
		try {
			const response = await hrisApiClient.post<ResignationAttachment>(
				`/api/resignations/${data.resignationId}/attachments`,
				data,
			);
			if (!response.data) {
				throw new Error("Failed to add attachment");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error adding attachment:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error adding attachment",
			);
		}
	}

	/**
	 * Delete attachment from resignation
	 * @param resignationId Resignation ID
	 * @param attachmentId Attachment ID
	 * @returns Promise<void>
	 */
	async deleteAttachment(resignationId: string, attachmentId: string): Promise<void> {
		try {
			await hrisApiClient.delete(
				`/api/resignations/${resignationId}/attachments/${attachmentId}`,
			);
		} catch (error: any) {
			console.error("Error deleting attachment:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error deleting attachment",
			);
		}
	}

	/**
	 * Search resignations
	 * @param query Search term
	 * @param params Optional query parameters
	 * @returns Promise<ResignationsResponse> - Resignations response
	 */
	async searchResignations(
		query: string,
		params?: ApiQueryParams,
	): Promise<ResignationsResponse> {
		return this.search(query)
			.setParams(params || {})
			.getResignations();
	}

	/**
	 * Get resignations with parameters
	 * @param params Query parameters
	 * @returns Promise<ResignationsResponse> - Resignations response
	 */
	async getResignationsWithParams(params: ApiQueryParams): Promise<ResignationsResponse> {
		return this.setParams(params).getResignations();
	}

	/**
	 * Start offboarding process for an approved resignation
	 * Creates an OFFBOARDING BoardingProcess with checklist items
	 * @param requestId Request/Resignation ID
	 * @param boardingTemplateId ID of the offboarding template to use
	 * @returns Promise with request and boardingProcess data
	 */
	async startOffboarding(
		requestId: string,
		boardingTemplateId: string,
	): Promise<{ request: any; boardingProcess: any }> {
		try {
			const response = await hrisApiClient.post<{ request: any; boardingProcess: any }>(
				`/api/request/${requestId}/start-offboarding`,
				{ boardingTemplateId },
			);
			if (!response.data) {
				throw new Error("Failed to start offboarding");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error starting offboarding:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error starting offboarding",
			);
		}
	}
}

// Export singleton instance
const resignationService = new ResignationService();
export default resignationService;
