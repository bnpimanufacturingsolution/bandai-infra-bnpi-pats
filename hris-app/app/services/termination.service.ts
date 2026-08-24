import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";
import type {
	Termination,
	CreateTermination,
	UpdateTermination,
	TerminationWithRelations,
	TerminationAuditLog,
	HRDirectorApproval,
	LegalApproval,
	CompleteTermination,
} from "../zod/termination.zod";

// Response types
export interface TerminationsResponse {
	terminations: TerminationWithRelations[];
	pagination?: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
	count?: number;
}

export interface TerminationDetailResponse {
	termination: TerminationWithRelations;
	auditLogs?: TerminationAuditLog[];
}

class TerminationService extends APIService {
	/**
	 * Get all terminations with optional filtering, pagination, and sorting
	 * Uses query parameters set via method chaining (select, search, paginate, sort, setParams)
	 * @returns Promise<TerminationsResponse> - Terminations response with pagination
	 */
	async getTerminations(): Promise<TerminationsResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/termination${queryString}`;

			console.log("Fetching terminations from HRIS API:", endpoint);

			const response = await hrisApiClient.get<TerminationsResponse>(endpoint);

			// Handle nested data structure if API returns { data: { ... } }
			let terminationsData = response.data;
			if (
				terminationsData &&
				typeof terminationsData === "object" &&
				"data" in terminationsData
			) {
				terminationsData = (terminationsData as any).data;
			}

			if (!terminationsData) {
				throw new Error("Failed to fetch terminations");
			}
			return terminationsData as TerminationsResponse;
		} catch (error: any) {
			console.error("Error fetching terminations:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching terminations",
			);
		}
	}

	/**
	 * Get termination by ID with optional field selection
	 * Uses query parameters set via method chaining (select, etc.)
	 * @param terminationId Termination ID
	 * @returns Promise<TerminationWithRelations> - Termination data
	 */
	async getTerminationById(terminationId: string): Promise<TerminationWithRelations> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/termination/${terminationId}${queryString}`;

			console.log("Fetching termination from HRIS API:", endpoint);

			const response = await hrisApiClient.get<TerminationWithRelations>(endpoint);

			// Handle nested data structure
			let terminationData = response.data;
			if (
				terminationData &&
				typeof terminationData === "object" &&
				"data" in terminationData
			) {
				terminationData = (terminationData as any).data;
			}

			if (!terminationData) {
				throw new Error("Termination not found");
			}
			return terminationData as TerminationWithRelations;
		} catch (error: any) {
			console.error("Error fetching termination:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching termination",
			);
		}
	}

	/**
	 * Create a new termination (draft)
	 * @param payload Termination creation payload
	 * @returns Promise<Termination> - Created termination
	 */
	async createTermination(payload: CreateTermination): Promise<Termination> {
		try {
			// Set the auth token for HRIS API client

			console.log("Creating termination with payload:", payload);

			const response = await hrisApiClient.post<Termination>("/api/termination", payload);

			// Handle nested data structure
			let terminationData = response.data;
			if (
				terminationData &&
				typeof terminationData === "object" &&
				"data" in terminationData
			) {
				terminationData = (terminationData as any).data;
			}

			if (!terminationData) {
				throw new Error("Failed to create termination");
			}
			return terminationData as Termination;
		} catch (error: any) {
			console.error("Error creating termination:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error creating termination",
			);
		}
	}

	/**
	 * Update an existing termination (only in DRAFT status)
	 * @param terminationId Termination ID
	 * @param payload Termination update payload
	 * @returns Promise<Termination> - Updated termination
	 */
	async updateTermination(
		terminationId: string,
		payload: UpdateTermination,
	): Promise<Termination> {
		try {
			// Set the auth token for HRIS API client

			console.log("Updating termination:", terminationId, "with payload:", payload);

			const response = await hrisApiClient.patch<Termination>(
				`/api/termination/${terminationId}`,
				payload,
			);

			// Handle nested data structure
			let terminationData = response.data;
			if (
				terminationData &&
				typeof terminationData === "object" &&
				"data" in terminationData
			) {
				terminationData = (terminationData as any).data;
			}

			if (!terminationData) {
				throw new Error("Failed to update termination");
			}
			return terminationData as Termination;
		} catch (error: any) {
			console.error("Error updating termination:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating termination",
			);
		}
	}

	/**
	 * Delete a termination (only in DRAFT status)
	 * @param terminationId Termination ID
	 * @returns Promise<{ id: string }> - Deleted termination ID
	 */
	async deleteTermination(terminationId: string): Promise<{ id: string }> {
		try {
			// Set the auth token for HRIS API client

			console.log("Deleting termination:", terminationId);

			const response = await hrisApiClient.delete<{ id: string }>(
				`/api/termination/${terminationId}`,
			);

			// Handle nested data structure
			let responseData = response.data;
			if (responseData && typeof responseData === "object" && "data" in responseData) {
				responseData = (responseData as any).data;
			}

			if (!responseData) {
				throw new Error("Failed to delete termination");
			}
			return responseData as { id: string };
		} catch (error: any) {
			console.error("Error deleting termination:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error deleting termination",
			);
		}
	}

	/**
	 * Submit termination (from DRAFT to PENDING_HR_DIRECTOR)
	 * @param terminationId Termination ID
	 * @returns Promise<Termination> - Updated termination
	 */
	async submitTermination(terminationId: string): Promise<Termination> {
		try {
			// Set the auth token for HRIS API client

			console.log("Submitting termination:", terminationId);

			const response = await hrisApiClient.post<Termination>(
				`/api/termination/${terminationId}/submit`,
				{},
			);

			// Handle nested data structure
			let terminationData = response.data;
			if (
				terminationData &&
				typeof terminationData === "object" &&
				"data" in terminationData
			) {
				terminationData = (terminationData as any).data;
			}

			if (!terminationData) {
				throw new Error("Failed to submit termination");
			}
			return terminationData as Termination;
		} catch (error: any) {
			console.error("Error submitting termination:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error submitting termination",
			);
		}
	}

	/**
	 * HR Director approves or rejects termination
	 * @param terminationId Termination ID
	 * @param payload Approval payload
	 * @returns Promise<Termination> - Updated termination
	 */
	async hrDirectorApproval(
		terminationId: string,
		payload: HRDirectorApproval,
	): Promise<Termination> {
		try {
			// Set the auth token for HRIS API client

			console.log("HR Director approval for termination:", terminationId, payload);

			const response = await hrisApiClient.post<Termination>(
				`/api/termination/${terminationId}/hr-director-approval`,
				payload,
			);

			// Handle nested data structure
			let terminationData = response.data;
			if (
				terminationData &&
				typeof terminationData === "object" &&
				"data" in terminationData
			) {
				terminationData = (terminationData as any).data;
			}

			if (!terminationData) {
				throw new Error("Failed to process HR Director approval");
			}
			return terminationData as Termination;
		} catch (error: any) {
			console.error("Error in HR Director approval:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error in HR Director approval",
			);
		}
	}

	/**
	 * Legal approves or rejects termination
	 * @param terminationId Termination ID
	 * @param payload Approval payload
	 * @returns Promise<Termination> - Updated termination
	 */
	async legalApproval(terminationId: string, payload: LegalApproval): Promise<Termination> {
		try {
			// Set the auth token for HRIS API client

			console.log("Legal approval for termination:", terminationId, payload);

			const response = await hrisApiClient.post<Termination>(
				`/api/termination/${terminationId}/legal-approval`,
				payload,
			);

			// Handle nested data structure
			let terminationData = response.data;
			if (
				terminationData &&
				typeof terminationData === "object" &&
				"data" in terminationData
			) {
				terminationData = (terminationData as any).data;
			}

			if (!terminationData) {
				throw new Error("Failed to process Legal approval");
			}
			return terminationData as Termination;
		} catch (error: any) {
			console.error("Error in Legal approval:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error in Legal approval",
			);
		}
	}

	/**
	 * Start processing/offboarding for approved termination
	 * @param terminationId Termination ID
	 * @returns Promise<Termination> - Updated termination
	 */
	async startProcessing(terminationId: string): Promise<Termination> {
		try {
			// Set the auth token for HRIS API client

			console.log("Starting processing for termination:", terminationId);

			const response = await hrisApiClient.post<Termination>(
				`/api/termination/${terminationId}/start-processing`,
				{},
			);

			// Handle nested data structure
			let terminationData = response.data;
			if (
				terminationData &&
				typeof terminationData === "object" &&
				"data" in terminationData
			) {
				terminationData = (terminationData as any).data;
			}

			if (!terminationData) {
				throw new Error("Failed to start processing");
			}
			return terminationData as Termination;
		} catch (error: any) {
			console.error("Error starting processing:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error starting processing",
			);
		}
	}

	/**
	 * Complete termination after all offboarding is done
	 * @param terminationId Termination ID
	 * @param payload Completion payload
	 * @returns Promise<Termination> - Completed termination
	 */
	async completeTermination(
		terminationId: string,
		payload?: CompleteTermination,
	): Promise<Termination> {
		try {
			// Set the auth token for HRIS API client

			console.log("Completing termination:", terminationId, payload);

			const response = await hrisApiClient.post<Termination>(
				`/api/termination/${terminationId}/complete`,
				payload || {},
			);

			// Handle nested data structure
			let terminationData = response.data;
			if (
				terminationData &&
				typeof terminationData === "object" &&
				"data" in terminationData
			) {
				terminationData = (terminationData as any).data;
			}

			if (!terminationData) {
				throw new Error("Failed to complete termination");
			}
			return terminationData as Termination;
		} catch (error: any) {
			console.error("Error completing termination:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error completing termination",
			);
		}
	}

	/**
	 * Get terminations with specific parameters
	 * @param params Query parameters
	 * @returns Promise<TerminationsResponse> - Terminations response
	 */
	async getTerminationsWithParams(params: ApiQueryParams): Promise<TerminationsResponse> {
		return this.clearQueryParams().setParams(params).getTerminations();
	}

	/**
	 * Search terminations by termination number or reason
	 * @param query Search term
	 * @param params Optional query parameters
	 * @returns Promise<TerminationsResponse> - Terminations response
	 */
	async searchTerminations(
		query: string,
		params?: ApiQueryParams,
	): Promise<TerminationsResponse> {
		return this.clearQueryParams()
			.search(query)
			.setParams(params || {})
			.getTerminations();
	}

	/**
	 * Get terminations grouped by a specific field
	 * @param groupBy Field to group by
	 * @param params Optional query parameters
	 * @returns Promise<TerminationsResponse> - Terminations response
	 */
	async getTerminationsGrouped(
		groupBy: string,
		params?: ApiQueryParams,
	): Promise<TerminationsResponse> {
		return this.clearQueryParams()
			.setParams({
				...params,
				groupBy,
			})
			.getTerminations();
	}
}

// Export singleton instance
const terminationService = new TerminationService();
export default terminationService;

