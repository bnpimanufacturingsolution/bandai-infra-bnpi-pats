import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type {
	ChecklistItem,
	CreateChecklistItem,
	UpdateChecklistItem,
	ChecklistStatus,
} from "~/zod/checklist-item";

export interface ChecklistItemsResponse {
	checklistItems: ChecklistItem[];
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
	};
}

class ChecklistItemsService extends APIService {
	/**
	 * Get all checklist items with optional filters
	 */
	async getChecklistItems(
		document: boolean = true,
		count: boolean = false,
	): Promise<ChecklistItemsResponse> {
		try {

			const queryString = this.getQueryString();
			const endpoint = `/api/checklistItem${queryString}`;

			const response = await hrisApiClient.get<ChecklistItemsResponse>(endpoint);

			// Handle nested data structure if API returns { data: { ... } }
			let checklistItemsData = response.data;
			if (
				checklistItemsData &&
				typeof checklistItemsData === "object" &&
				"data" in checklistItemsData
			) {
				checklistItemsData = (checklistItemsData as any).data;
			}

			if (!checklistItemsData) {
				throw new Error("Failed to fetch checklist items");
			}
			return checklistItemsData as ChecklistItemsResponse;
		} catch (error: any) {
			console.error("Error fetching checklist items:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching checklist items",
			);
		}
	}

	/**
	 * Get a single checklist item by ID
	 */
	async getChecklistItemById(itemId: string): Promise<ChecklistItem> {
		try {
			const response = await hrisApiClient.get<ChecklistItem>(`/api/checklistItem/${itemId}`);

			// Handle nested data structure
			let itemData = response.data;
			if (itemData && typeof itemData === "object" && "data" in itemData) {
				itemData = (itemData as any).data;
			}

			if (!itemData) {
				throw new Error("Checklist item not found");
			}
			return itemData as ChecklistItem;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching checklist item",
			);
		}
	}

	/**
	 * Create a new checklist item
	 */
	async createChecklistItem(data: CreateChecklistItem): Promise<ChecklistItem> {
		try {
			const response = await hrisApiClient.post<ChecklistItem>("/api/checklistItem", data);

			// Handle nested data structure if API returns { data: { ... } }
			let itemData = response.data;
			if (itemData && typeof itemData === "object" && "data" in itemData) {
				itemData = (itemData as any).data;
			}

			if (!itemData) {
				throw new Error("Failed to create checklist item");
			}
			return itemData as ChecklistItem;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error creating checklist item",
			);
		}
	}

	/**
	 * Update an existing checklist item
	 */
	async updateChecklistItem(itemId: string, data: UpdateChecklistItem): Promise<ChecklistItem> {
		try {
			const response = await hrisApiClient.patch<ChecklistItem>(
				`/api/checklistItem/${itemId}`,
				data,
			);

			// Handle nested data structure
			let itemData = response.data;
			if (itemData && typeof itemData === "object" && "data" in itemData) {
				itemData = (itemData as any).data;
			}

			if (!itemData) {
				throw new Error("Failed to update checklist item");
			}
			return itemData as ChecklistItem;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error updating checklist item",
			);
		}
	}

	/**
	 * Delete a checklist item
	 */
	async deleteChecklistItem(itemId: string): Promise<void> {
		try {
			await hrisApiClient.delete(`/api/checklistItem/${itemId}`);
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error deleting checklist item",
			);
		}
	}

	/**
	 * Update checklist item status
	 */
	async updateChecklistItemStatus(
		itemId: string,
		status: ChecklistStatus,
		completedBy?: string,
		completedByName?: string,
		comments?: string,
	): Promise<ChecklistItem> {
		try {

			const updateData: UpdateChecklistItem = {
				status,
			};

			if (status === "COMPLETED") {
				updateData.completedDate = new Date();
				if (completedBy) updateData.completedBy = completedBy;
				if (completedByName) updateData.completedByName = completedByName;
			}

			if (comments) {
				updateData.comments = comments;
			}

			return await this.updateChecklistItem(itemId, updateData);
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error updating checklist item status",
			);
		}
	}

	/**
	 * Get checklist items by process ID
	 */
	async getChecklistItemsByProcessId(processId: string): Promise<ChecklistItem[]> {
		try {

			const response = await this.document(true)
				.filter({ processId })
				.sort("order", "asc")
				.getChecklistItems();

			return response.checklistItems || [];
		} catch (error: any) {
			console.error("Error fetching checklist items by process ID:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching checklist items",
			);
		}
	}
}

// Export singleton instance
const checklistItemsService = new ChecklistItemsService();
export default checklistItemsService;

