import type { Guide, CreateGuide, UpdateGuide } from "~/zod/guide.zod";
import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";

export interface GuideResponse {
	success: boolean;
	message: string;
	data: {
		guide: Guide;
	};
}

export interface GuidesResponse {
	success?: boolean;
	message?: string;
	data?: {
		guides: Guide[];
		pagination?: {
			total: number;
			page: number;
			limit: number;
			totalPages?: number;
			hasNext?: boolean;
			hasPrev?: boolean;
		};
	};
	// Support direct response format as well
	guides?: Guide[];
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
		hasNext?: boolean;
		hasPrev?: boolean;
	};
}

class GuideService extends APIService {
	/**
	 * Get all guides with optional filtering, pagination, and sorting
	 * Uses query parameters set via method chaining (select, search, paginate, sort, setParams)
	 * @returns Promise<GuidesResponse> - Guides response with pagination
	 */
	async getGuides(): Promise<GuidesResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/guide${queryString}`;

			console.log("Fetching guides from HRIS API:", endpoint);

			const response = await hrisApiClient.get<any>(endpoint);

			console.log("Raw API Response:", response);
			console.log("Response.data:", response.data);

			if (!response.data) {
				throw new Error("Failed to fetch guides - no data in response");
			}

			// The API returns { data: { guides: [...], pagination: {...} } }
			// Wrap it in the expected format if needed
			const apiData = response.data;

			// Check if response.data has the nested structure
			if (apiData.data && apiData.data.guides) {
				// Already in correct format: { data: { guides, pagination } }
				return apiData as GuidesResponse;
			} else if (apiData.guides) {
				// Direct format: { guides, pagination }
				// Wrap it
				return {
					data: {
						guides: apiData.guides,
						pagination: apiData.pagination,
					},
				} as GuidesResponse;
			} else {
				console.error("Unexpected API response structure:", apiData);
				throw new Error("Invalid API response structure");
			}
		} catch (error: any) {
			console.error("Error fetching guides:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching guides",
			);
		}
	}

	async getGuide(id: string): Promise<GuideResponse> {
		try {
			const response = await hrisApiClient.get<GuideResponse>(`/api/guide/${id}`);
			console.log("Raw API Response for getGuide:", response);
			if (!response?.data) throw new Error("Invalid guide response");
			return response.data;
		} catch (error: any) {
			console.error("Error fetching guide:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching guide",
			);
		}
	}

	async getGuideWithSections(id: string): Promise<GuideResponse> {
		try {
			const response = await hrisApiClient.get<any>(
				`/api/guide/${id}?fields=sections,id,title,description,published,author,version,isDeleted`,
			);
			console.log("Raw API Response for getGuideWithSections:", response);
			if (!response?.data) throw new Error("Invalid guide response");

			// Check if response is already wrapped
			if (response.data.data?.guide) {
				return response.data;
			}

			// If response.data is the guide directly, wrap it
			return {
				success: true,
				message: "Guide fetched successfully",
				data: {
					guide: response.data,
				},
			};
		} catch (error: any) {
			console.error("Error fetching guide with sections:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching guide with sections",
			);
		}
	}

	async createGuide(payload: CreateGuide): Promise<GuideResponse> {
		try {
			const response = await hrisApiClient.post<GuideResponse>("/api/guide", payload);
			if (!response?.data) throw new Error("Invalid create guide response");
			return response.data;
		} catch (error: any) {
			console.error("Error creating guide:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error creating guide",
			);
		}
	}

	async updateGuide(id: string, payload: UpdateGuide): Promise<GuideResponse> {
		try {
			const response = await hrisApiClient.patch<GuideResponse>(`/api/guide/${id}`, payload);
			if (!response?.data) throw new Error("Invalid update guide response");
			return response.data;
		} catch (error: any) {
			console.error("Error updating guide:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error updating guide",
			);
		}
	}

	async deleteGuide(id: string): Promise<void> {
		try {
			await hrisApiClient.delete(`/api/guide/${id}`);
		} catch (error: any) {
			console.error("Error deleting guide:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error deleting guide",
			);
		}
	}

	/**
	 * Soft delete a guide by setting isDeleted to true
	 * @param id - Guide ID
	 * @returns Promise<GuideResponse>
	 */
	async softDeleteGuide(id: string): Promise<GuideResponse> {
		try {
			const response = await hrisApiClient.patch<GuideResponse>(`/api/guide/${id}`, {
				isDeleted: true,
			});
			if (!response?.data) throw new Error("Invalid soft delete guide response");
			return response.data;
		} catch (error: any) {
			console.error("Error soft deleting guide:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error soft deleting guide",
			);
		}
	}

	/**
	 * Publish or unpublish a guide
	 * @param id - Guide ID
	 * @param published - Published status
	 * @returns Promise<GuideResponse>
	 */
	async togglePublishGuide(id: string, published: boolean): Promise<GuideResponse> {
		try {
			const response = await hrisApiClient.patch<GuideResponse>(`/api/guide/${id}`, {
				published,
			});
			if (!response?.data) throw new Error("Invalid publish guide response");
			return response.data;
		} catch (error: any) {
			console.error("Error toggling publish guide:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error toggling publish guide",
			);
		}
	}
}

const guideService = new GuideService();
export default guideService;

