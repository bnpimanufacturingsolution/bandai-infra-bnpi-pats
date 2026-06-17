import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

// Enums
export enum BenefitCategory {
	INSURANCE = "INSURANCE",
	ALLOWANCE = "ALLOWANCE",
	BONUS = "BONUS",
	RETIREMENT = "RETIREMENT",
	HEALTH = "HEALTH",
	EDUCATION = "EDUCATION",
	TRANSPORTATION = "TRANSPORTATION",
	OTHER = "OTHER",
}
	
export enum BenefitPayrollDirection {
	COMPENSATION = "COMPENSATION",
	DEDUCTION = "DEDUCTION",
}

export interface BenefitType {
	id: string;
	organizationId: string;
	code: string;
	name: string;
	description?: string;
	category: BenefitCategory;
	payrollDirection: BenefitPayrollDirection;
	reconciliationAction?: string;
	provider?: string;
	coverage?: number;
	minAmount?: number;
	maxAmount?: number;
	fixedAmount?: number;
	percentage?: number;
	requiresEmploymentType: string[];
	minServiceMonths?: number;
	isTaxable: boolean;
	isActive: boolean;
	isDefault: boolean;
	defaultInstallments?: number;
	payrollCycleDays?: number;
	requireTermsAgreement?: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CreateBenefitTypeRequest {
	code: string;
	name: string;
	description?: string;
	category?: BenefitCategory;
	payrollDirection?: BenefitPayrollDirection;
	reconciliationAction?: string;
	provider?: string;
	coverage?: number;
	minAmount?: number;
	maxAmount?: number;
	fixedAmount?: number;
	percentage?: number;
	requiresEmploymentType?: string[];
	minServiceMonths?: number;
	isTaxable?: boolean;
	isActive?: boolean;
	isDefault?: boolean;
	defaultInstallments?: number;
	payrollCycleDays?: number;
	requireTermsAgreement?: boolean;
	organizationId: string;
}

export interface UpdateBenefitTypeRequest {
	code?: string;
	name?: string;
	description?: string;
	category?: BenefitCategory;
	payrollDirection?: BenefitPayrollDirection;
	reconciliationAction?: string;
	provider?: string;
	coverage?: number;
	minAmount?: number;
	maxAmount?: number;
	fixedAmount?: number;
	percentage?: number;
	requiresEmploymentType?: string[];
	minServiceMonths?: number;
	isTaxable?: boolean;
	isActive?: boolean;
	isDefault?: boolean;
	defaultInstallments?: number;
	payrollCycleDays?: number;
	requireTermsAgreement?: boolean;
}

export interface BenefitTypeResponse {
	status: string;
	message: string;
	data: BenefitType;
	code: number;
	timestamp: string;
}

export interface BenefitTypesResponse {
	benefitTypes: BenefitType[];
	pagination?: {
		total: number;
		page: number;
		limit: number;
	};
}

class BenefitTypesService extends APIService {
	/**
	 * Get all benefit types with optional filtering, pagination, and sorting
	 * Uses query parameters set via method chaining (select, search, paginate, sort, setParams)
	 * @returns Promise<BenefitTypesResponse> - Benefit types response with pagination
	 */
	async getBenefitTypes(): Promise<BenefitTypesResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/benefitType${queryString}`;

			const response = await hrisApiClient.get<BenefitTypesResponse>(endpoint);

			// Handle nested data structure if API returns { data: { ... } }
			let benefitTypesData = response.data;
			if (
				benefitTypesData &&
				typeof benefitTypesData === "object" &&
				"data" in benefitTypesData
			) {
				benefitTypesData = (benefitTypesData as any).data;
			}

			if (!benefitTypesData) {
				throw new Error("Failed to fetch benefit types");
			}
			return benefitTypesData as BenefitTypesResponse;
		} catch (error: any) {
			console.error("Error fetching benefit types:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching benefit types",
			);
		}
	}

	async getBenefitType(id: string): Promise<BenefitTypeResponse> {
		const response = await hrisApiClient.get<any>(`/api/benefitType/${id}`);
		if (!response?.data) throw new Error("Invalid benefit type response");
		return response as unknown as BenefitTypeResponse;
	}

	async createBenefitType(payload: CreateBenefitTypeRequest): Promise<BenefitTypeResponse> {
		const response = await hrisApiClient.post<any>("/api/benefitType", payload);
		if (!response?.data) throw new Error("Invalid create benefit type response");
		return response as unknown as BenefitTypeResponse;
	}

	async updateBenefitType(
		id: string,
		payload: UpdateBenefitTypeRequest,
	): Promise<BenefitTypeResponse> {
		const response = await hrisApiClient.patch<any>(`/api/benefitType/${id}`, payload);
		if (!response?.data) throw new Error("Invalid update benefit type response");
		return response as unknown as BenefitTypeResponse;
	}

	async deleteBenefitType(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/benefitType/${id}`);
	}

	async importBenefitTypes(file: File): Promise<any> {
		const formData = new FormData();
		formData.append("file", file);
		const response = await hrisApiClient.post<any>("/api/benefitType/import", formData, {
			headers: {
				"Content-Type": "multipart/form-data",
			},
		});
		return {
			...response.data,
			summary: response.data?.summary || response.data?.data,
		};
	}
}

const benefitTypesService = new BenefitTypesService();
export default benefitTypesService;

