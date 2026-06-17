import { apiClient, hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface BenefitPlan {
	id: string;
	name: string;
	type: string;
	description?: string;
	provider?: string;
	employerContribution?: number;
	employeeContribution?: number;
	maxCoverage?: number;
	isActive?: boolean;
	organizationId: string;
	createdAt: string;
	updatedAt: string;
}

export interface CreateBenefitPlanRequest {
	name: string;
	type?: string;
	description?: string;
	provider?: string;
	employerContribution?: number;
	employeeContribution?: number;
	maxCoverage?: number;
	isActive?: boolean;
	organizationId: string;
}

export interface UpdateBenefitPlanRequest {
	name?: string;
	type?: string;
	description?: string;
	provider?: string;
	employerContribution?: number;
	employeeContribution?: number;
	maxCoverage?: number;
	isActive?: boolean;
	organizationId?: string;
}

export interface BenefitPlansResponse {
	benefits: BenefitPlan[];
	pagination?: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

class BenefitPlansService extends APIService {
	/**
	 * Get all benefit plans with optional filtering, pagination, and sorting
	 * @param document - Include document information
	 * @returns Promise<BenefitPlansResponse> - Benefit plans response with pagination
	 */
	async getBenefitPlans(document: boolean = false): Promise<BenefitPlansResponse> {
		try {
			// Set the auth token for HRIS API client

			// Build query parameters - only include document=true if needed
			const params = new URLSearchParams();
			if (document) {
				params.append("document", "true");
			}

			const queryString = params.toString() ? `?${params.toString()}` : "";
			const endpoint = `/api/benefit${queryString}`;

			console.log("Fetching benefit plans from HRIS API:", endpoint);

			const response = await hrisApiClient.get<BenefitPlansResponse>(endpoint);
			if (!response.data) {
				throw new Error("Failed to fetch benefit plans");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error fetching benefit plans:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching benefit plans",
			);
		}
	}

	/**
	 * Create a new benefit plan
	 * @param payload Benefit plan creation payload
	 * @returns Promise<BenefitPlan> - Created benefit plan
	 */
	async createBenefitPlan(payload: CreateBenefitPlanRequest): Promise<BenefitPlan> {
		try {
			// Set the auth token for HRIS API client

			console.log("Creating benefit plan with payload:", payload);

			const response = await hrisApiClient.post<BenefitPlan>("/api/benefit", payload);
			if (!response.data) {
				throw new Error("Failed to create benefit plan");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error creating benefit plan:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error creating benefit plan",
			);
		}
	}

	/**
	 * Update an existing benefit plan
	 * @param benefitPlanId Benefit plan ID
	 * @param payload Benefit plan update payload
	 * @returns Promise<BenefitPlan> - Updated benefit plan
	 */
	async updateBenefitPlan(
		benefitPlanId: string,
		payload: UpdateBenefitPlanRequest,
	): Promise<BenefitPlan> {
		try {
			// Set the auth token for HRIS API client

			console.log("Updating benefit plan:", benefitPlanId, "with payload:", payload);

			const response = await hrisApiClient.patch<BenefitPlan>(
				`/api/benefit/${benefitPlanId}`,
				payload,
			);
			if (!response.data) {
				throw new Error("Failed to update benefit plan");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating benefit plan:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating benefit plan",
			);
		}
	}

	/**
	 * Delete a benefit plan
	 * @param benefitPlanId Benefit plan ID
	 * @returns Promise<{ id: string }> - Deleted benefit plan ID
	 */
	async deleteBenefitPlan(benefitPlanId: string): Promise<{ id: string }> {
		try {
			// Set the auth token for HRIS API client

			console.log("Deleting benefit plan:", benefitPlanId);

			const response = await hrisApiClient.delete<{ id: string }>(
				`/api/benefit/${benefitPlanId}`,
			);
			if (!response.data) {
				throw new Error("Failed to delete benefit plan");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error deleting benefit plan:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error deleting benefit plan",
			);
		}
	}

	/**
	 * Get benefit plan by ID with optional field selection
	 * @param benefitPlanId Benefit plan ID
	 * @returns Promise<BenefitPlan> - Benefit plan data
	 */
	async getBenefitPlanById(benefitPlanId: string): Promise<BenefitPlan> {
		try {
			// Set the auth token for HRIS API client

			const endpoint = `/api/benefit/${benefitPlanId}`;
			const response = await hrisApiClient.get<{ benefit: BenefitPlan }>(endpoint);
			if (!response.data) {
				throw new Error("Benefit plan not found");
			}
			return response.data.benefit;
		} catch (error: any) {
			console.error("Error fetching benefit plan:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching benefit plan",
			);
		}
	}

	/**
	 * Get benefit plans with specific parameters
	 * @param params Query parameters
	 * @returns Promise<BenefitPlansResponse> - Benefit plans response
	 */
	async getBenefitPlansWithParams(params: ApiQueryParams): Promise<BenefitPlansResponse> {
		return this.setParams(params).getBenefitPlans();
	}

	/**
	 * Search benefit plans by name or description
	 * @param query Search term
	 * @param params Optional query parameters
	 * @returns Promise<BenefitPlansResponse> - Benefit plans response
	 */
	async searchBenefitPlans(
		query: string,
		params?: ApiQueryParams,
	): Promise<BenefitPlansResponse> {
		return this.search(query)
			.setParams(params || {})
			.getBenefitPlans();
	}

	/**
	 * Get benefit plans grouped by a specific field
	 * @param groupBy Field to group by
	 * @param params Optional query parameters
	 * @returns Promise<BenefitPlansResponse> - Benefit plans response
	 */
	async getBenefitPlansGrouped(
		groupBy: string,
		params?: ApiQueryParams,
	): Promise<BenefitPlansResponse> {
		return this.setParams({
			...params,
			groupBy,
		}).getBenefitPlans();
	}
}

// Export singleton instance
const benefitPlansService = new BenefitPlansService();
export default benefitPlansService;

