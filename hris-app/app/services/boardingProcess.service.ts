import type { Employee } from "~/zod/employee.zod";
import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type {
	BoardingProcess,
	BoardingType,
	BoardingStatus,
	CreateBoardingProcess,
	UpdateBoardingProcess,
} from "~/zod/boarding-process";
import type { ChecklistItem } from "~/zod/checklist-item";

export interface BoardingProcessWithChecklistItems extends BoardingProcess {
	checklistItems?: ChecklistItem[];
	employee: Employee;
}

export interface BoardingProcessResponse {
	boardingProcesss: BoardingProcessWithChecklistItems[];
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
	};
}

class BoardingProcessService extends APIService {
	/**
	 * Get all boarding processes with optional filters
	 */
	async getBoardingProcesses(
		document: boolean = true,
		count: boolean = false,
	): Promise<BoardingProcessResponse> {
		try {

			const queryString = this.getQueryString();
			const endpoint = `/api/boardingProcess${queryString}`;

			const response = await hrisApiClient.get<BoardingProcessResponse>(endpoint);

			// Handle nested data structure if API returns { data: { ... } }
			let boardingProcessData = response.data;
			if (
				boardingProcessData &&
				typeof boardingProcessData === "object" &&
				"data" in boardingProcessData
			) {
				boardingProcessData = (boardingProcessData as any).data;
			}

			if (!boardingProcessData) {
				throw new Error("Failed to fetch boarding processes");
			}
			return boardingProcessData as BoardingProcessResponse;
		} catch (error: any) {
			console.error("Error fetching boarding processes:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching boarding processes",
			);
		}
	}

	/**
	 * Get a single boarding process by ID
	 */
	/**
	 * Get a single boarding process by ID
	 */
	async getBoardingProcessById(
		processId: string,
		options?: {
			includeChecklistItems?: boolean;
			fields?: string;
			category?: string;
		},
	): Promise<BoardingProcessWithChecklistItems> {
		try {

			const params = new URLSearchParams();

			if (options?.fields) {
				params.append("fields", options.fields);
			} else if (options?.includeChecklistItems) {
				// If fields are not provided but includeChecklistItems is true, we might rely on default fields or just requesting checklistItems
				// However, the controller seems to rely on 'fields' param for nested selects usually.
				// But let's follow existing pattern: if no fields, maybe it returns all?
				// The previous code had `params.append("fields", "checklistItems")` inside an else if.
				// We should preserve that logic but potentially append category.
				params.append("fields", "checklistItems");
			}

			if (options?.category) {
				params.append("category", options.category);
			}

			const queryString = params.toString() ? `?${params.toString()}` : "";
			const endpoint = `/api/boardingProcess/${processId}${queryString}`;

			const response = await hrisApiClient.get<BoardingProcessWithChecklistItems>(endpoint);

			// Handle nested data structure
			let processData = response.data;
			if (processData && typeof processData === "object" && "data" in processData) {
				processData = (processData as any).data;
			}

			if (!processData) {
				throw new Error("Boarding process not found");
			}
			return processData as BoardingProcessWithChecklistItems;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching boarding process",
			);
		}
	}

	/**
	 * Create a new boarding process
	 */
	async createBoardingProcess(
		data: CreateBoardingProcess,
	): Promise<BoardingProcessWithChecklistItems> {
		try {
			const response = await hrisApiClient.post<BoardingProcessWithChecklistItems>(
				"/api/boardingProcess",
				data,
			);

			// Handle nested data structure if API returns { data: { ... } }
			let processData = response.data;
			if (processData && typeof processData === "object" && "data" in processData) {
				processData = (processData as any).data;
			}

			if (!processData) {
				throw new Error("Failed to create boarding process");
			}
			return processData as BoardingProcessWithChecklistItems;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error creating boarding process",
			);
		}
	}

	/**
	 * Update an existing boarding process
	 */
	async updateBoardingProcess(
		processId: string,
		data: UpdateBoardingProcess,
	): Promise<BoardingProcessWithChecklistItems> {
		try {
			const response = await hrisApiClient.patch<BoardingProcessWithChecklistItems>(
				`/api/boardingProcess/${processId}`,
				data,
			);

			// Handle nested data structure
			let processData = response.data;
			if (processData && typeof processData === "object" && "data" in processData) {
				processData = (processData as any).data;
			}

			if (!processData) {
				throw new Error("Failed to update boarding process");
			}
			return processData as BoardingProcessWithChecklistItems;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error updating boarding process",
			);
		}
	}

	/**
	 * Delete a boarding process
	 */
	async deleteBoardingProcess(processId: string): Promise<void> {
		try {
			await hrisApiClient.delete(`/api/boardingProcess/${processId}`);
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error deleting boarding process",
			);
		}
	}

	/**
	 * Get boarding process by employee ID
	 */
	async getBoardingProcessByEmployeeId(
		employeeId: string,
		type?: BoardingType,
		includeChecklistItems: boolean = true,
	): Promise<BoardingProcessWithChecklistItems | null> {
		try {

			// Build filter
			const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
				employeeId,
			);
			const isObjectId = /^[0-9a-f]{24}$/i.test(employeeId);
			const filters: Record<string, any> = {};

			// Employee actions in HR pages pass Mongo ObjectId (24-hex) in many flows.
			if (isUuid || isObjectId) {
				filters.employeeId = employeeId;
			} else {
				// For custom IDs (e.g. EMP-HR-MGR-001), use the relation field
				filters["employee.employeeId"] = employeeId;
			}

			if (type) {
				filters.type = type;
			}

			// Build fields
			const fields = [
				"id",
				"organizationId",
				"employeeId",
				"type",
				"status",
				"startDate",
				"targetDate",
				"actualCompleteDate",
				"exitReason",
				"assignedToId",
				"assignedToName",
				"metadata",
			];

			if (includeChecklistItems) {
				fields.push("checklistItems");
			}

			const response = await this.document(true)
				.filter(filters)
				.select(fields)
				.getBoardingProcesses();

			// Return the first boarding process or null
			if (response.boardingProcesss && response.boardingProcesss.length > 0) {
				return response.boardingProcesss[0];
			}

			return null;
		} catch (error: any) {
			console.error("Error fetching boarding process by employee ID:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching boarding process",
			);
		}
	}
}

// Export singleton instance
const boardingProcessService = new BoardingProcessService();
export default boardingProcessService;

