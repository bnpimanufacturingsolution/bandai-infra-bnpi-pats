import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface Calculator {
	id: string;
	code?: string;
	name: string;
	description?: string;
	type: "BASIC" | "GROSS_TO_NET" | "NET_TO_GROSS" | "THIRTEENTH_MONTH" | "CUSTOM";
	taxRates: Record<string, any>;
	sssRates?: Record<string, any>;
	philHealthRates?: Record<string, any>;
	pagibigRates?: Record<string, any>;
	rateMultipliers?: {
		ordinaryDay: { work: number; ot: number; nd: number; ndot: number };
		restDayOrSpecialHoliday: { work: number; ot: number; nd: number; ndot: number };
		specialHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
		regularHoliday: { work: number; ot: number; nd: number; ndot: number };
		regularHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
		doubleHoliday: { work: number; ot: number; nd: number; ndot: number };
		doubleHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
	};
	overtimeRates?: Record<string, any>;
	nightDiffRate?: number;
	isActive: boolean;
	isDefault: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CreateCalculatorRequest {
	code?: string;
	name: string;
	description?: string;
	type?: "BASIC" | "GROSS_TO_NET" | "NET_TO_GROSS" | "THIRTEENTH_MONTH" | "CUSTOM";
	taxRates: Record<string, any>;
	sssRates?: Record<string, any>;
	philHealthRates?: Record<string, any>;
	pagibigRates?: Record<string, any>;
	rateMultipliers?: {
		ordinaryDay: { work: number; ot: number; nd: number; ndot: number };
		restDayOrSpecialHoliday: { work: number; ot: number; nd: number; ndot: number };
		specialHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
		regularHoliday: { work: number; ot: number; nd: number; ndot: number };
		regularHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
		doubleHoliday: { work: number; ot: number; nd: number; ndot: number };
		doubleHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
	};
	overtimeRates?: Record<string, any>;
	nightDiffRate?: number;
	isActive?: boolean;
	isDefault?: boolean;
	organizationId: string;
}

export interface UpdateCalculatorRequest {
	code?: string;
	name?: string;
	description?: string;
	type?: "BASIC" | "GROSS_TO_NET" | "NET_TO_GROSS" | "THIRTEENTH_MONTH" | "CUSTOM";
	taxRates?: Record<string, any>;
	sssRates?: Record<string, any>;
	philHealthRates?: Record<string, any>;
	pagibigRates?: Record<string, any>;
	rateMultipliers?: {
		ordinaryDay: { work: number; ot: number; nd: number; ndot: number };
		restDayOrSpecialHoliday: { work: number; ot: number; nd: number; ndot: number };
		specialHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
		regularHoliday: { work: number; ot: number; nd: number; ndot: number };
		regularHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
		doubleHoliday: { work: number; ot: number; nd: number; ndot: number };
		doubleHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
	};
	overtimeRates?: Record<string, any>;
	nightDiffRate?: number;
	isActive?: boolean;
	isDefault?: boolean;
}

export interface CalculatorsResponse {
	calculators: Calculator[];
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
		hasNext?: boolean;
		hasPrev?: boolean;
	};
}

class CalculatorService extends APIService {
	/**
	 * Get all calculators with optional filtering, pagination, and sorting
	 * Uses query parameters set via method chaining (select, search, paginate, sort, setParams)
	 * @returns Promise<CalculatorsResponse> - Calculators response with pagination
	 */
	async getCalculators(): Promise<CalculatorsResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/calculator${queryString}`;

			const response = await hrisApiClient.get<any>(endpoint);

			// Handle nested data structure if API returns { data: { calculators: [...] } }
			let calculatorsData = response.data;
			if (
				calculatorsData &&
				typeof calculatorsData === "object" &&
				"data" in calculatorsData
			) {
				calculatorsData = calculatorsData.data;
			}

			if (!calculatorsData) {
				throw new Error("Failed to fetch calculators");
			}
			return calculatorsData as CalculatorsResponse;
		} catch (error: any) {
			console.error("Error fetching calculators:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching calculators",
			);
		}
	}

	/**
	 * Get calculator by ID or code with optional field selection
	 * @param id Calculator ID or code
	 * @returns Promise<Calculator> - Calculator data
	 */
	async getCalculatorById(id: string): Promise<Calculator> {
		try {

			const endpoint = `/api/calculator/${id}`;
			const response = await hrisApiClient.get<any>(endpoint);

			if (!response.data) {
				throw new Error("Calculator not found");
			}

			// Extract calculator from nested structure: response.data.data
			let calculatorData = response.data;
			if (calculatorData && typeof calculatorData === "object" && "data" in calculatorData) {
				calculatorData = calculatorData.data;
			}

			if (!calculatorData) {
				throw new Error("Calculator data is undefined");
			}

			return calculatorData as Calculator;
		} catch (error: any) {
			console.error("Error fetching calculator:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching calculator",
			);
		}
	}

	/**
	 * Create a new calculator
	 * @param payload Calculator creation payload
	 * @returns Promise<Calculator> - Created calculator
	 */
	async createCalculator(payload: CreateCalculatorRequest): Promise<Calculator> {
		try {
			// Set the auth token for HRIS API client

			console.log("Creating calculator with payload:", payload);

			const response = await hrisApiClient.post<Calculator>("/api/calculator", payload);
			if (!response.data) {
				throw new Error("Failed to create calculator");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error creating calculator:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error creating calculator",
			);
		}
	}

	/**
	 * Update an existing calculator
	 * @param id Calculator ID or code
	 * @param payload Calculator update payload
	 * @returns Promise<Calculator> - Updated calculator
	 */
	async updateCalculator(id: string, payload: UpdateCalculatorRequest): Promise<Calculator> {
		try {
			// Set the auth token for HRIS API client

			console.log("Updating calculator:", id, "with payload:", payload);

			const response = await hrisApiClient.patch<Calculator>(
				`/api/calculator/${id}`,
				payload,
			);
			if (!response.data) {
				throw new Error("Failed to update calculator");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating calculator:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error updating calculator",
			);
		}
	}

	/**
	 * Delete a calculator
	 * @param id Calculator ID or code
	 * @returns Promise<{ id: string }> - Deleted calculator ID
	 */
	async deleteCalculator(id: string): Promise<{ id: string }> {
		try {
			// Set the auth token for HRIS API client

			console.log("Deleting calculator:", id);

			const response = await hrisApiClient.delete<{ id: string }>(`/api/calculator/${id}`);
			if (!response.data) {
				throw new Error("Failed to delete calculator");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error deleting calculator:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error deleting calculator",
			);
		}
	}
}

const calculatorService = new CalculatorService();
export default calculatorService;

