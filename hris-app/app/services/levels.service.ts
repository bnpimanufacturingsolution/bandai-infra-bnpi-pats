import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface Level {
	id: string;
	name: string;
	rank?: number;
	description?: string;
	isManager?: boolean | string | null;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CreateLevelRequest {
	name: string;
	rank?: number;
	description?: string;
	isManager?: boolean;
	isActive?: boolean;
	organizationId: string;
}

export interface UpdateLevelRequest {
	name?: string;
	rank?: number;
	description?: string;
	isManager?: boolean;
	isActive?: boolean;
}

export interface LevelResponse {
	success: boolean;
	message: string;
	data: {
		level: Level;
	};
}

export interface LevelsResponse {
	success: boolean;
	message: string;
	data: {
		levels: Level[];
		pagination?: {
			total: number;
			page: number;
			limit: number;
		};
	};
}

class LevelsService extends APIService {
	/**
	 * Get all levels with optional filtering, pagination, and sorting
	 * Uses query parameters set via method chaining (select, search, paginate, sort, setParams)
	 * @returns Promise<LevelsResponse> - Levels response with pagination
	 */
	async getLevels(): Promise<LevelsResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/level${queryString}`;

			console.log("Fetching levels from HRIS API:", endpoint);

			const response = await hrisApiClient.get<LevelsResponse>(endpoint);

			// Handle nested data structure if API returns { data: { ... } }
			let levelsData = response.data;
			if (
				levelsData &&
				typeof levelsData === "object" &&
				"data" in levelsData
			) {
				levelsData = (levelsData as any).data;
			}

			if (!levelsData) {
				throw new Error("Failed to fetch levels");
			}
			return levelsData as LevelsResponse;
		} catch (error: any) {
			console.error("Error fetching levels:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching levels",
			);
		}
	}

	async getLevel(id: string): Promise<Level> {
		try {

			const queryString = this.getQueryString();
			const endpoint = `/api/level/${id}${queryString}`;

			const response = await hrisApiClient.get<any>(endpoint);
			if (!response?.data) throw new Error("Level not found");

			// Normalize common response shapes:
			// 1) { data: { level: {...} } }
			// 2) { data: {...levelFields} }
			// 3) { level: {...} }
			// 4) {...levelFields}
			let payload = response.data;
			if (payload && typeof payload === "object" && "data" in payload) {
				payload = payload.data;
			}

			const levelData =
				payload && typeof payload === "object" && "level" in payload
					? (payload as any).level
					: payload;

			if (!levelData || typeof levelData !== "object" || !(levelData as any).id) {
				throw new Error("Invalid level response");
			}

			return levelData as Level;
		} catch (error: any) {
			console.error("Error fetching level:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching level",
			);
		}
	}

	async createLevel(payload: CreateLevelRequest): Promise<LevelResponse> {
		try {
			const response = await hrisApiClient.post<LevelResponse>("/api/level", payload);
			if (!response?.data) throw new Error("Invalid create level response");
			return response.data;
		} catch (error: any) {
			console.error("Error creating level:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error creating level",
			);
		}
	}

	async updateLevel(
		id: string,
		payload: UpdateLevelRequest,
	): Promise<LevelResponse> {
		try {
			const response = await hrisApiClient.patch<LevelResponse>(
				`/api/level/${id}`,
				payload,
			);
			if (!response?.data) throw new Error("Invalid update level response");
			return response.data;
		} catch (error: any) {
			console.error("Error updating level:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error updating level",
			);
		}
	}

	async deleteLevel(id: string): Promise<void> {
		try {
			await hrisApiClient.delete(`/api/level/${id}`);
		} catch (error: any) {
			console.error("Error deleting level:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error deleting level",
			);
		}
	}

	async importLevels(file: File): Promise<any> {
		const formData = new FormData();
		formData.append("file", file);
		const response = await hrisApiClient.post<any>("/api/level/import", formData, {
			headers: { "Content-Type": "multipart/form-data" },
		});
		return response.data;
	}
}

const levelsService = new LevelsService();
export default levelsService;


