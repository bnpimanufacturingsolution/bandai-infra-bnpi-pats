import { apiClient, hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface Position {
	id: string;
	title: string;
	code: string;
	description?: string;
	sectionId?: string | null;
	section?: {
		id: string;
		name: string;
		code?: string;
		departmentId?: string | null;
		department?: { id: string; name: string; code?: string } | null;
	} | null;
	levelIds?: string[];
	levels?: Array<{ id: string; name: string; rank?: number }>;
	minSalary?: number;
	maxSalary?: number;
	isManager?: boolean;
	isOffer?: boolean;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CreatePositionRequest {
	title: string;
	code: string;
	description?: string;
	sectionId?: string | null;
	levelIds?: string[];
	minSalary?: number;
	maxSalary?: number;
	isManager?: boolean;
	isActive: boolean;
	organizationId: string;
}

export interface UpdatePositionRequest {
	title?: string;
	code?: string;
	description?: string;
	sectionId?: string | null;
	levelIds?: string[];
	minSalary?: number;
	maxSalary?: number;
	isManager?: boolean;
	isActive?: boolean;
}

export interface PositionsResponse {
	positions: Position[];
	pagination?: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

export interface GeneratedConfigCodeResponse {
	baseCode: string;
	code: string;
	isAvailable: boolean;
}

class PositionsService extends APIService {
	/**
	 * Get all positions with optional filtering, pagination, and sorting
	 * Uses query parameters set via method chaining (select, search, paginate, sort, setParams)
	 * @returns Promise<PositionsResponse> - Positions response with pagination
	 */
	async getPositions(): Promise<PositionsResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/position${queryString}`;

			console.log("Fetching positions from HRIS API:", endpoint);

			const response = await hrisApiClient.get<PositionsResponse>(endpoint);

			// Handle nested data structure if API returns { data: { ... } }
			let positionsData = response.data;
			if (positionsData && typeof positionsData === "object" && "data" in positionsData) {
				positionsData = (positionsData as any).data;
			}

			if (!positionsData) {
				throw new Error("Failed to fetch positions");
			}
			return positionsData as PositionsResponse;
		} catch (error: any) {
			console.error("Error fetching positions:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching positions",
			);
		}
	}

	/**
	 * Create a new position
	 * @param payload Position creation payload
	 * @returns Promise<Position> - Created position
	 */
	async createPosition(payload: CreatePositionRequest): Promise<Position> {
		try {
			// Set the auth token for HRIS API client

			console.log("Creating position with payload:", payload);

			const response = await hrisApiClient.post<Position>("/api/position", payload);
			if (!response.data) {
				throw new Error("Failed to create position");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error creating position:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error creating position",
			);
		}
	}

	/**
	 * Update an existing position
	 * @param positionId Position ID
	 * @param payload Position update payload
	 * @returns Promise<Position> - Updated position
	 */
	async updatePosition(positionId: string, payload: UpdatePositionRequest): Promise<Position> {
		try {
			// Set the auth token for HRIS API client

			console.log("Updating position:", positionId, "with payload:", payload);

			const response = await hrisApiClient.patch<Position>(
				`/api/position/${positionId}`,
				payload,
			);
			if (!response.data) {
				throw new Error("Failed to update position");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating position:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error updating position",
			);
		}
	}

	/**
	 * Delete a position
	 * @param positionId Position ID
	 * @returns Promise<{ id: string }> - Deleted position ID
	 */
	async deletePosition(positionId: string): Promise<{ id: string }> {
		try {
			// Set the auth token for HRIS API client

			console.log("Deleting position:", positionId);

			const response = await hrisApiClient.delete<{ id: string }>(
				`/api/position/${positionId}`,
			);
			if (!response.data) {
				throw new Error("Failed to delete position");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error deleting position:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error deleting position",
			);
		}
	}

	/**
	 * Get position by ID with optional field selection
	 * Uses query parameters set via method chaining (select, etc.)
	 * @param positionId Position ID
	 * @returns Promise<Position> - Position data
	 */
	async getPositionById(positionId: string): Promise<Position> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/position/${positionId}${queryString}`;

			console.log("Fetching position from HRIS API:", endpoint);

			const response = await hrisApiClient.get<Position>(endpoint);
			if (!response.data) {
				throw new Error("Position not found");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error fetching position:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching position",
			);
		}
	}

	/**
	 * Get positions with specific parameters
	 * @param params Query parameters
	 * @returns Promise<PositionsResponse> - Positions response
	 */
	async getPositionsWithParams(params: ApiQueryParams): Promise<PositionsResponse> {
		return this.clearQueryParams().setParams(params).getPositions();
	}

	/**
	 * Search positions by title or description
	 * @param query Search term
	 * @param params Optional query parameters
	 * @returns Promise<PositionsResponse> - Positions response
	 */
	async searchPositions(query: string, params?: ApiQueryParams): Promise<PositionsResponse> {
		return this.clearQueryParams()
			.search(query)
			.setParams(params || {})
			.getPositions();
	}

	/**
	 * Get positions grouped by a specific field
	 * @param groupBy Field to group by
	 * @param params Optional query parameters
	 * @returns Promise<PositionsResponse> - Positions response
	 */
	async getPositionsGrouped(
		groupBy: string,
		params?: ApiQueryParams,
	): Promise<PositionsResponse> {
		return this.clearQueryParams()
			.setParams({
				...params,
				groupBy,
			})
			.getPositions();
	}

	async importPositions(file: File): Promise<any> {
		const formData = new FormData();
		formData.append("file", file);
		const response = await hrisApiClient.post<any>("/api/position/import", formData, {
			headers: { "Content-Type": "multipart/form-data" },
		});
		return response.data;
	}

	async generatePositionCode(name: string): Promise<GeneratedConfigCodeResponse> {
		const response = await hrisApiClient.get<any>(
			`/api/position/generate-code?name=${encodeURIComponent(name)}`,
		);
		let data = response.data;
		if (data && typeof data === "object" && "data" in data) {
			data = data.data;
		}
		if (!data) throw new Error("Failed to generate position code");
		return data as GeneratedConfigCodeResponse;
	}
}

// Export singleton instance
const positionsService = new PositionsService();
export default positionsService;

