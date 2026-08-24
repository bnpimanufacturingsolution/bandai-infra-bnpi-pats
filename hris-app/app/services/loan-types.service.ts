import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface LoanType {
	id: string;
	name: string;
	description?: string;
	category:
		| "SALARY_LOAN"
		| "EMERGENCY_LOAN"
		| "HOUSING_LOAN"
		| "CALAMITY_LOAN"
		| "SSS_LOAN"
		| "PAGIBIG_LOAN"
		| "VEHICLE_LOAN"
		| "EDUCATION_LOAN"
		| "OTHER";
	maxAmount?: number;
	minAmount?: number;
	interestRate: number;
	maxTermMonths: number;
	minServiceMonths?: number;
	requiresEmploymentType: string[];
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CreateLoanTypeRequest {
	name: string;
	description?: string;
	category?:
		| "SALARY_LOAN"
		| "EMERGENCY_LOAN"
		| "HOUSING_LOAN"
		| "CALAMITY_LOAN"
		| "SSS_LOAN"
		| "PAGIBIG_LOAN"
		| "VEHICLE_LOAN"
		| "EDUCATION_LOAN"
		| "OTHER";
	maxAmount?: number;
	minAmount?: number;
	interestRate?: number;
	maxTermMonths?: number;
	minServiceMonths?: number;
	requiresEmploymentType?: string[];
	isActive?: boolean;
	organizationId: string;
}

export interface UpdateLoanTypeRequest {
	name?: string;
	description?: string;
	category?:
		| "SALARY_LOAN"
		| "EMERGENCY_LOAN"
		| "HOUSING_LOAN"
		| "CALAMITY_LOAN"
		| "SSS_LOAN"
		| "PAGIBIG_LOAN"
		| "VEHICLE_LOAN"
		| "EDUCATION_LOAN"
		| "OTHER";
	maxAmount?: number;
	minAmount?: number;
	interestRate?: number;
	maxTermMonths?: number;
	minServiceMonths?: number;
	requiresEmploymentType?: string[];
	isActive?: boolean;
}

export interface LoanTypeResponse {
	success: boolean;
	message: string;
	data: {
		loanType: LoanType;
	};
}

export interface LoanTypesResponse {
	success: boolean;
	message: string;
	data: {
		loanTypes: LoanType[];
		pagination?: {
			total: number;
			page: number;
			limit: number;
		};
	};
}

class LoanTypesService extends APIService {
	/**
	 * Get all loan types with optional filtering, pagination, and sorting
	 * Uses query parameters set via method chaining (select, search, paginate, sort, setParams)
	 * @returns Promise<LoanTypesResponse> - Loan types response with pagination
	 */
	async getLoanTypes(): Promise<LoanTypesResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/loanType${queryString}`;

			console.log("Fetching loan types from HRIS API:", endpoint);

			const response = await hrisApiClient.get<LoanTypesResponse>(endpoint);

			// Handle nested data structure if API returns { data: { ... } }
			let loanTypesData = response.data;
			if (loanTypesData && typeof loanTypesData === "object" && "data" in loanTypesData) {
				loanTypesData = (loanTypesData as any).data;
			}

			if (!loanTypesData) {
				throw new Error("Failed to fetch loan types");
			}
			return loanTypesData as LoanTypesResponse;
		} catch (error: any) {
			console.error("Error fetching loan types:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching loan types",
			);
		}
	}

	async getLoanType(id: string): Promise<LoanTypeResponse> {
		const response = await hrisApiClient.get<LoanTypeResponse>(`/api/loanType/${id}`);
		if (!response?.data) throw new Error("Invalid loan type response");
		return response.data;
	}

	async createLoanType(payload: CreateLoanTypeRequest): Promise<LoanTypeResponse> {
		const response = await hrisApiClient.post<LoanTypeResponse>("/api/loanType", payload);
		if (!response?.data) throw new Error("Invalid create loan type response");
		return response.data;
	}

	async updateLoanType(id: string, payload: UpdateLoanTypeRequest): Promise<LoanTypeResponse> {
		const response = await hrisApiClient.patch<LoanTypeResponse>(
			`/api/loanType/${id}`,
			payload,
		);
		if (!response?.data) throw new Error("Invalid update loan type response");
		return response.data;
	}

	async deleteLoanType(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/loanType/${id}`);
	}

	async importLoanTypes(file: File): Promise<any> {
		const formData = new FormData();
		formData.append("file", file);
		const response = await hrisApiClient.post<any>("/api/loanType/import", formData, {
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

const loanTypesService = new LoanTypesService();
export default loanTypesService;

