import { apiClient } from "~/lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface CreateAnnouncementRequest {
	title: string;
	message: string;
	priority?: "low" | "normal" | "high";
	audience?: "all" | "managers" | "employees";
	publishAt?: string; // ISO
	expiresAt?: string; // ISO
	files?: File[]; // optional attachments
}

export interface UpdateAnnouncementRequest {
	title?: string;
	message?: string;
	priority?: "low" | "normal" | "high";
	audience?: "all" | "managers" | "employees";
	publishAt?: string;
	expiresAt?: string;
}

export interface Announcement {
	id: string;
	title: string;
	message: string;
	priority: "low" | "normal" | "high";
	audience: "all" | "managers" | "employees";
	publishAt?: string;
	expiresAt?: string;
	createdAt: string;
	updatedAt: string;
}

export interface AnnouncementsResponse {
	data: Announcement[] | { announcements: Announcement[] };
	pagination?: {
		total: number;
		page: number;
		limit: number;
	};
}

class AnnouncementsService extends APIService {
	/**
	 * Get all announcements with optional filtering, pagination, and sorting
	 * @returns Promise<AnnouncementsResponse> - Announcements response with pagination
	 */
	async getAnnouncements(): Promise<AnnouncementsResponse> {
		try {
			const queryString = this.getQueryString();
			const response = await apiClient.get<AnnouncementsResponse>(
				`/announcements${queryString}`,
			);
			return (response.data || response) as AnnouncementsResponse;
		} catch (error: any) {
			console.error("Error fetching announcements:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching announcements",
			);
		}
	}

	/**
	 * Get announcement by ID
	 * @param announcementId Announcement ID
	 * @returns Promise<Announcement> - Announcement data
	 */
	async getAnnouncementById(announcementId: string): Promise<Announcement> {
		try {
			const queryString = this.getQueryString();
			const response = await apiClient.get<Announcement>(
				`/announcements/${announcementId}${queryString}`,
			);
			if (!response.data) {
				throw new Error("Announcement not found");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error fetching announcement:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching announcement",
			);
		}
	}

	/**
	 * Create a new announcement
	 * @param data Announcement creation data
	 * @returns Promise<Announcement> - Created announcement data
	 */
	async createAnnouncement(data: CreateAnnouncementRequest | FormData): Promise<Announcement> {
		try {
			let payload: any = data;
			let config: any = undefined;

			if (!(data instanceof FormData)) {
				// If there are files, build a multipart body
				if (data.files && data.files.length) {
					const form = new FormData();
					form.append("title", data.title);
					form.append("message", data.message);
					if (data.priority) form.append("priority", data.priority);
					if (data.audience) form.append("audience", data.audience);
					if (data.publishAt) form.append("publishAt", data.publishAt);
					if (data.expiresAt) form.append("expiresAt", data.expiresAt);
					for (const f of data.files) form.append("files", f);
					payload = form;
					config = { headers: { "Content-Type": "multipart/form-data" } };
				}
			}

			const response = await apiClient.post<Announcement>("/announcements", payload);
			if (!response.data) {
				throw new Error("Failed to create announcement");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error creating announcement:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error creating announcement",
			);
		}
	}

	/**
	 * Update an existing announcement
	 * @param announcementId Announcement ID
	 * @param data Announcement update data
	 * @returns Promise<Announcement> - Updated announcement data
	 */
	async updateAnnouncement(
		announcementId: string,
		data: UpdateAnnouncementRequest,
	): Promise<Announcement> {
		try {
			const response = await apiClient.patch<Announcement>(
				`/announcements/${announcementId}`,
				data,
			);
			if (!response.data) {
				throw new Error("Failed to update announcement");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating announcement:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating announcement",
			);
		}
	}

	/**
	 * Delete an announcement
	 * @param announcementId Announcement ID
	 * @returns Promise<void>
	 */
	async deleteAnnouncement(announcementId: string): Promise<void> {
		try {
			await apiClient.delete(`/announcements/${announcementId}`);
		} catch (error: any) {
			console.error("Error deleting announcement:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error deleting announcement",
			);
		}
	}

	/**
	 * Get announcements with specific parameters
	 * @param params Query parameters
	 * @returns Promise<AnnouncementsResponse> - Announcements response
	 */
	async getAnnouncementsWithParams(params: ApiQueryParams): Promise<AnnouncementsResponse> {
		return this.setParams(params).getAnnouncements();
	}

	/**
	 * Search announcements by title or message
	 * @param query Search term
	 * @param params Optional query parameters
	 * @returns Promise<AnnouncementsResponse> - Announcements response
	 */
	async searchAnnouncements(
		query: string,
		params?: ApiQueryParams,
	): Promise<AnnouncementsResponse> {
		return this.search(query)
			.setParams(params || {})
			.getAnnouncements();
	}

	// Legacy methods for backward compatibility
	async create(data: CreateAnnouncementRequest | FormData): Promise<Announcement> {
		return this.createAnnouncement(data);
	}

	async list(): Promise<Announcement[]> {
		const response = await this.getAnnouncements();
		return Array.isArray(response.data) ? response.data : response.data.announcements || [];
	}

	async remove(id: string): Promise<void> {
		return this.deleteAnnouncement(id);
	}
}

// Export singleton instance
const announcementsService = new AnnouncementsService();
export default announcementsService;
