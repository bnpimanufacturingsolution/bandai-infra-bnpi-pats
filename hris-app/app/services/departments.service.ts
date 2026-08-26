import { apiClient, hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface Department {
	id: string;
	organizationId?: string;
	name: string;
	code: string;
	description?: string;
	managerId?: string | null;
	scheduleId?: string | null;
	scheduleIds?: string[];
	scheduleTemplate?: {
		id?: string;
		name?: string;
		code?: string;
	} | null;
	schedules?: Array<{
		id?: string;
		scheduleId?: string;
		scheduleTemplateId?: string;
		source?: "department_default" | "department_head_created" | "department_head_linked";
		isActive?: boolean;
		scheduleTemplate?: {
			id?: string;
			name?: string;
			code?: string;
		} | null;
	}> | null;
	manager?: {
		person?: {
			personalInfo?: {
				firstName?: string;
				middleName?: string;
				lastName?: string;
			};
		};
	} | null;
	parentId?: string | null;
	isHr?: boolean | string | null;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface Position {
	id: string;
	title: string;
	description?: string;
	sectionId?: string | null;
	section?: {
		departmentId?: string | null;
		department?: { id?: string | null; name?: string | null } | null;
	} | null;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CreateDepartmentRequest {
	name: string;
	code: string;
	description?: string;
	managerId?: string | null;
	parentId?: string | null;
	scheduleId?: string | null;
	scheduleIds?: string[];
	isHr?: boolean;
	isActive: boolean;
	organizationId: string;
}

export interface UpdateDepartmentRequest {
	name?: string;
	code?: string;
	description?: string;
	managerId?: string | null;
	parentId?: string | null;
	scheduleId?: string | null;
	scheduleIds?: string[];
	isHr?: boolean;
	isActive?: boolean;
}

export interface CreatePositionRequest {
	title: string;
	description?: string;
	sectionId?: string | null;
	isActive?: boolean;
}

export interface UpdatePositionRequest {
	title?: string;
	description?: string;
	sectionId?: string | null;
	isActive?: boolean;
}

export interface DepartmentsResponse {
	departments: Department[];
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
		hasNext?: boolean;
		hasPrev?: boolean;
	};
}

export interface PositionsResponse {
	data: Position[] | { positions: Position[] };
	pagination?: {
		total: number;
		page: number;
		limit: number;
	};
}

export interface GeneratedConfigCodeResponse {
	baseCode: string;
	code: string;
	isAvailable: boolean;
}

class DepartmentsService extends APIService {
	/**
	 * Get all departments with optional filtering, pagination, and sorting
	 * Uses query parameters set via method chaining (select, search, paginate, sort, setParams)
	 * @returns Promise<DepartmentsResponse> - Departments response with pagination
	 */
	async getDepartments(): Promise<DepartmentsResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/department${queryString}`;

			const response = await hrisApiClient.get<any>(endpoint);

			// Handle nested data structure if API returns { data: { departments: [...] } }
			let departmentsData = response.data;
			if (
				departmentsData &&
				typeof departmentsData === "object" &&
				"data" in departmentsData
			) {
				departmentsData = departmentsData.data;
			}

			if (!departmentsData) {
				throw new Error("Failed to fetch departments");
			}
			return departmentsData as DepartmentsResponse;
		} catch (error: any) {
			console.error("Error fetching departments:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching departments",
			);
		}
	}

	/**
	 * Create a new department
	 * @param payload Department creation payload
	 * @returns Promise<Department> - Created department
	 */
	async createDepartment(payload: CreateDepartmentRequest): Promise<Department> {
		try {
			// Set the auth token for HRIS API client

			console.log("Creating department with payload:", payload);

			const response = await hrisApiClient.post<Department>("/api/department", payload);
			if (!response.data) {
				throw new Error("Failed to create department");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error creating department:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error creating department",
			);
		}
	}

	/**
	 * Update an existing department
	 * @param departmentId Department ID
	 * @param payload Department update payload
	 * @returns Promise<Department> - Updated department
	 */
	async updateDepartment(
		departmentId: string,
		payload: UpdateDepartmentRequest,
	): Promise<Department> {
		try {
			// Set the auth token for HRIS API client

			console.log("Updating department:", departmentId, "with payload:", payload);

			const response = await hrisApiClient.patch<Department>(
				`/api/department/${departmentId}`,
				payload,
			);
			if (!response.data) {
				throw new Error("Failed to update department");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating department:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error updating department",
			);
		}
	}

	/**
	 * Delete a department
	 * @param departmentId Department ID
	 * @returns Promise<{ id: string }> - Deleted department ID
	 */
	async deleteDepartment(departmentId: string): Promise<{ id: string }> {
		try {
			// Set the auth token for HRIS API client

			console.log("Deleting department:", departmentId);

			const response = await hrisApiClient.delete<{ id: string }>(
				`/api/department/${departmentId}`,
			);
			if (!response.data) {
				throw new Error("Failed to delete department");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error deleting department:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error deleting department",
			);
		}
	}

	/**
	 * Get department by ID with optional field selection
	 * @param departmentId Department ID
	 * @returns Promise<Department> - Department data
	 */
	async getDepartmentById(departmentId: string): Promise<Department> {
		try {

			const endpoint = `/api/department/${departmentId}`;
			const response = await hrisApiClient.get<any>(endpoint);

			if (!response.data) {
				throw new Error("Department not found");
			}

			// Extract department from nested structure: response.data.data
			let departmentData = response.data;
			if (departmentData && typeof departmentData === "object" && "data" in departmentData) {
				departmentData = departmentData.data;
			}

			if (!departmentData) {
				throw new Error("Department data is undefined");
			}

			return departmentData as Department;
		} catch (error: any) {
			console.error("Error fetching department:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching department",
			);
		}
	}

	/**
	 * Get departments with specific parameters
	 * @param params Query parameters
	 * @returns Promise<DepartmentsResponse> - Departments response
	 */
	async getDepartmentsWithParams(params: ApiQueryParams): Promise<DepartmentsResponse> {
		return this.setParams(params).getDepartments();
	}

	/**
	 * Search departments by name or description
	 * @param query Search term
	 * @param params Optional query parameters
	 * @returns Promise<DepartmentsResponse> - Departments response
	 */
	async searchDepartments(query: string, params?: ApiQueryParams): Promise<DepartmentsResponse> {
		return this.search(query)
			.setParams(params || {})
			.getDepartments();
	}

	/**
	 * Get departments grouped by a specific field
	 * @param groupBy Field to group by
	 * @param params Optional query parameters
	 * @returns Promise<DepartmentsResponse> - Departments response
	 */
	async getDepartmentsGrouped(
		groupBy: string,
		params?: ApiQueryParams,
	): Promise<DepartmentsResponse> {
		return this.setParams({
			...params,
			groupBy,
		}).getDepartments();
	}

	/**
	 * Import departments from XLSX file
	 * @param file - The XLSX file to import
	 * @returns Promise<any> - Import summary
	 */
	async importDepartments(file: File): Promise<any> {
		const formData = new FormData();
		formData.append("file", file);
		const response = await hrisApiClient.post<any>("/api/department/import", formData, {
			headers: { "Content-Type": "multipart/form-data" },
		});
		return response.data;
	}

	async generateDepartmentCode(name: string): Promise<GeneratedConfigCodeResponse> {
		const response = await hrisApiClient.get<any>(
			`/api/department/generate-code?name=${encodeURIComponent(name)}`,
		);
		let data = response.data;
		if (data && typeof data === "object" && "data" in data) {
			data = data.data;
		}
		if (!data) throw new Error("Failed to generate department code");
		return data as GeneratedConfigCodeResponse;
	}
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
	 * Get position by ID with optional field selection
	 * @param positionId Position ID
	 * @returns Promise<Position> - Position data
	 */
	async getPositionById(positionId: string): Promise<Position> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<Position>(
				`/api/position/${positionId}${queryString}`,
			);
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
	 * Create a new position
	 * @param data Position creation data
	 * @returns Promise<Position> - Created position data
	 */
	async createPosition(data: CreatePositionRequest): Promise<Position> {
		try {
			const response = await apiClient.post<Position>("/positions", data);
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
	 * @param data Position update data
	 * @returns Promise<Position> - Updated position data
	 */
	async updatePosition(positionId: string, data: UpdatePositionRequest): Promise<Position> {
		try {
			const response = await apiClient.patch<Position>(`/positions/${positionId}`, data);
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
	 * @returns Promise<void>
	 */
	async deletePosition(positionId: string): Promise<void> {
		try {
			await apiClient.delete(`/positions/${positionId}`);
		} catch (error: any) {
			console.error("Error deleting position:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error deleting position",
			);
		}
	}

	/**
	 * Get positions by department ID
	 * @param departmentId Department ID
	 * @param params Optional query parameters
	 * @returns Promise<PositionsResponse> - Positions response
	 */
	async getPositionsByDepartment(
		departmentId: string,
		params?: ApiQueryParams,
	): Promise<PositionsResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<PositionsResponse>(
				`/api/position?departmentId=${departmentId}${queryString}`,
			);
			if (!response.data) {
				throw new Error("Failed to fetch department positions");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error fetching department positions:", error);
			throw new Error(
				error.errors?.[0]?.message ||
					error.message ||
					"Error fetching department positions",
			);
		}
	}

	/**
	 * Get positions with specific parameters
	 * @param params Query parameters
	 * @returns Promise<PositionsResponse> - Positions response
	 */
	async getPositionsWithParams(params: ApiQueryParams): Promise<PositionsResponse> {
		return this.setParams(params).getPositions();
	}

	/**
	 * Search positions by title or description
	 * @param query Search term
	 * @param params Optional query parameters
	 * @returns Promise<PositionsResponse> - Positions response
	 */
	async searchPositions(query: string, params?: ApiQueryParams): Promise<PositionsResponse> {
		return this.search(query)
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
		return this.setParams({
			...params,
			groupBy,
		}).getPositions();
	}

	/**
	 * Import positions from XLSX file
	 * @param file - The XLSX file to import
	 * @returns Promise<any> - Import summary
	 */
	async importPositions(file: File): Promise<any> {
		const formData = new FormData();
		formData.append("file", file);
		const response = await hrisApiClient.post<any>("/api/position/import", formData, {
			headers: { "Content-Type": "multipart/form-data" },
		});
		return response.data;
	}
}

// Export singleton instances
const departmentsService = new DepartmentsService();
const positionsService = new PositionsService();

export default departmentsService;
export { positionsService };

