import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";
import type {
	BenefitAttendanceAmountBasis,
	BenefitRecurrenceFrequency,
	BenefitScheduleMode,
} from "../zod/employee-benefit.zod";

export type {
	BenefitScheduleMode,
	BenefitAttendanceAmountBasis,
	BenefitRecurrenceFrequency,
} from "../zod/employee-benefit.zod";

export interface EmployeeBenefit {
	id: string;
	organizationId: string;
	employeeId: string;
	benefitTypeId: string;
	payrollPeriodId?: string | null;
	name: string;
	description?: string | null;
	amount: number;
	startDate: string;
	endDate?: string | null;
	scheduleMode?: BenefitScheduleMode | null;
	recurrenceFrequency?: BenefitRecurrenceFrequency | null;
	totalInstallments?: number | null;
	attendanceBased?: boolean | null;
	attendanceAmountBasis?: BenefitAttendanceAmountBasis | null;
	eligibilityMode?: "ENROLLED_ALWAYS" | "ATTENDANCE_QUALIFIED" | null;
	eligibilityDisqualifyOnAbsent?: boolean | null;
	eligibilityDisqualifyOnLate?: boolean | null;
	eligibilityDisqualifyOnUndertime?: boolean | null;
	eligibilityDisqualifyOnLeave?: boolean | null;
	status?: "PENDING" | "APPROVED" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "DEFAULTED";
	isActive: boolean;
	approvedBy?: string | null;
	approvedAt?: string | null;
	notes?: string | null;
	isDeleted: boolean;
	createdAt: string;
	updatedAt: string;
	employee?: {
		id: string;
		employeeId?: string;
		firstName?: string;
		lastName?: string;
		person?: {
			personalInfo?: {
				firstName?: string;
				middleName?: string;
				lastName?: string;
			};
			email?: string;
		};
		user?: {
			avatar?: string | null;
		};
		department?: {
			name: string;
		};
		position?: {
			title: string;
		};
	};
	benefitType?: {
		id: string;
		code?: string | null;
		name: string;
		category: string;
		payrollDirection?: "COMPENSATION" | "DEDUCTION";
		provider?: string;
		coverage?: number;
	};
	payrollPeriod?: {
		id: string;
		name: string;
		code?: string | null;
		startDate: string;
		endDate: string;
	};
}

export interface CreateEmployeeBenefitRequest {
	organizationId: string;
	employeeId: string;
	benefitTypeId: string;
	payrollPeriodId?: string;
	name: string;
	description?: string;
	amount: number;
	startDate: string;
	scheduleMode: BenefitScheduleMode;
	recurrenceFrequency?: BenefitRecurrenceFrequency | null;
	endDate?: string;
	totalInstallments?: number;
	attendanceBased?: boolean;
	attendanceAmountBasis?: BenefitAttendanceAmountBasis | null;
	eligibilityMode?: "ENROLLED_ALWAYS" | "ATTENDANCE_QUALIFIED";
	eligibilityDisqualifyOnAbsent?: boolean;
	eligibilityDisqualifyOnLate?: boolean;
	eligibilityDisqualifyOnUndertime?: boolean;
	eligibilityDisqualifyOnLeave?: boolean;
	status?: "PENDING" | "APPROVED" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "DEFAULTED";
	notes?: string;
	isActive?: boolean;
}

/** Bulk create: shared benefit fields applied to many employees. */
export interface BulkCreateEmployeeBenefitRequest
	extends Omit<CreateEmployeeBenefitRequest, "employeeId"> {
	employeeIds: string[];
}

export interface BulkCreateEmployeeBenefitResult {
	created: EmployeeBenefit[];
	failed: { employeeId: string; message: string }[];
}

export interface UpdateEmployeeBenefitRequest {
	employeeId?: string;
	benefitTypeId?: string;
	payrollPeriodId?: string;
	name?: string;
	description?: string;
	amount?: number;
	startDate?: string;
	scheduleMode?: BenefitScheduleMode;
	recurrenceFrequency?: BenefitRecurrenceFrequency | null;
	endDate?: string;
	totalInstallments?: number;
	attendanceBased?: boolean;
	attendanceAmountBasis?: BenefitAttendanceAmountBasis | null;
	eligibilityMode?: "ENROLLED_ALWAYS" | "ATTENDANCE_QUALIFIED";
	eligibilityDisqualifyOnAbsent?: boolean;
	eligibilityDisqualifyOnLate?: boolean;
	eligibilityDisqualifyOnUndertime?: boolean;
	eligibilityDisqualifyOnLeave?: boolean;
	status?: "PENDING" | "APPROVED" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "DEFAULTED";
	notes?: string;
	isActive?: boolean;
}

export interface EmployeeBenefitsResponse {
	employeeBenefits: EmployeeBenefit[];
	pagination: {
		total: number;
		page: number;
		limit: number;
		totalPages: number;
	};
}

class EmployeeBenefitService extends APIService {
	/**
	 * Get all employee benefits with optional filtering, pagination, and sorting
	 * Uses query parameters set via method chaining (select, search, paginate, sort, setParams)
	 * @returns Promise<EmployeeBenefitsResponse> - Employee benefits response with pagination
	 */
	async getEmployeeBenefits(params?: ApiQueryParams): Promise<EmployeeBenefitsResponse> {
		try {
			// Set the auth token for HRIS API client

			// Use params argument if provided, but method chaining is preferred
			// Merging potentially existing params in 'this.queryParams' with 'params' could be complex
			// For consistency with devices.service.ts, we'll rely on method chaining or 'setParams'
			// defaulting to the current gathered query string.
			// However, if params IS passed directly, we might want to respect it.
			// Base APIService might handle this, but let's follow the devices pattern:
			// getDevices() just uses this.getQueryString() which implies parameters were set via chaining.
			// If params are passed, we should simpler call setParams first in a wrapper or handle it here.
			// To match devices.service.ts pattern, we will assume chaining or use the params to set it.

			if (params) {
				this.setParams(params);
			}

			const finalQueryString = this.getQueryString();
			const defaultFields =
				"id,organizationId,employeeId,benefitTypeId,name,description,amount,startDate,endDate,scheduleMode,recurrenceFrequency,totalInstallments,attendanceBased,attendanceAmountBasis,payrollPeriodId,status,isActive,notes,employee.id,employee.employeeId,employee.person.personalInfo,employee.position.title,benefitType.id,benefitType.code,benefitType.name,benefitType.category,benefitType.payrollDirection,payrollPeriod.id,payrollPeriod.name,payrollPeriod.code,payrollPeriod.startDate,payrollPeriod.endDate";
			// Note: eligibilityMode / disqualify flags require regenerated Prisma client + migration.
			const endpoint = finalQueryString.includes("fields=")
				? `/api/employeeBenefit${finalQueryString}`
				: `/api/employeeBenefit${finalQueryString}${finalQueryString ? "&" : "?"}fields=${defaultFields}`;

			const response = await hrisApiClient.get<EmployeeBenefitsResponse>(endpoint);

			// Handle nested data structure if API returns { data: { ... } }
			// Adjust based on actual API response structure for lists
			// Assuming the structure matches EmployeeBenefitsResponse interface directly or nested
			let data = response.data;
			if (data && typeof data === "object" && "data" in data) {
				data = (data as any).data;
			}

			if (!data) {
				throw new Error("Failed to fetch employee benefits");
			}

			return data as EmployeeBenefitsResponse;
		} catch (error: any) {
			console.error("Error fetching employee benefits:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching employee benefits",
			);
		}
	}

	/**
	 * Get employee benefit by ID
	 * @param id Employee Benefit ID
	 * @returns Promise<EmployeeBenefit> - Employee benefit data
	 */
	async getEmployeeBenefit(id: string): Promise<EmployeeBenefit> {
		try {

			const endpoint = `/api/employeeBenefit/${id}?fields=id,organizationId,employeeId,benefitTypeId,name,description,amount,startDate,endDate,scheduleMode,recurrenceFrequency,totalInstallments,attendanceBased,attendanceAmountBasis,payrollPeriodId,status,isActive,notes,employee.id,employee.employeeId,employee.person.personalInfo,employee.position.title,employee.person.contactInfo.email,benefitType.id,benefitType.code,benefitType.name,benefitType.category,benefitType.payrollDirection,payrollPeriod.id,payrollPeriod.name,payrollPeriod.code,payrollPeriod.startDate,payrollPeriod.endDate`;
			const response = await hrisApiClient.get<any>(endpoint);

			if (!response.data) {
				throw new Error("Employee benefit not found");
			}

			// Extract from nested structure: response.data.data
			let data = response.data;
			if (data && typeof data === "object" && "data" in data) {
				data = data.data;
			}
			// Sometimes the API might return { data: { employeeBenefit: ... } }
			if (data && "employeeBenefit" in data) {
				data = data.employeeBenefit;
			}

			if (!data) {
				throw new Error("Employee benefit data is undefined");
			}

			return data as EmployeeBenefit;
		} catch (error: any) {
			console.error("Error fetching employee benefit:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching employee benefit",
			);
		}
	}

	/**
	 * Create a new employee benefit
	 * @param data Creation payload
	 * @returns Promise<EmployeeBenefit> - Created employee benefit
	 */
	async createEmployeeBenefit(data: CreateEmployeeBenefitRequest): Promise<EmployeeBenefit> {
		try {

			const response = await hrisApiClient.post<any>("/api/employeeBenefit", data);

			if (!response.data) {
				throw new Error("Failed to create employee benefit");
			}

			// Handle nested response: { data: { employeeBenefit: ... } }
			let responseData = response.data;
			if (responseData && typeof responseData === "object" && "data" in responseData) {
				responseData = responseData.data;
			}
			if (responseData && "employeeBenefit" in responseData) {
				responseData = responseData.employeeBenefit;
			}

			return responseData as EmployeeBenefit;
		} catch (error: any) {
			console.error("Error creating employee benefit:", error);
			if (error.status === 400 && error.errors) {
				throw error;
			}
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error creating employee benefit",
			);
		}
	}

	/**
	 * Create the same benefit enrollment for multiple employees.
	 */
	async bulkCreateEmployeeBenefits(
		data: BulkCreateEmployeeBenefitRequest,
	): Promise<BulkCreateEmployeeBenefitResult> {
		try {
			const response = await hrisApiClient.post<any>("/api/employeeBenefit/bulk", data);

			if (!response.data) {
				throw new Error("Failed to bulk create employee benefits");
			}

			let responseData = response.data;
			if (responseData && typeof responseData === "object" && "data" in responseData) {
				responseData = responseData.data;
			}

			const created = Array.isArray(responseData?.created)
				? (responseData.created as EmployeeBenefit[])
				: [];
			const failed = Array.isArray(responseData?.failed)
				? (responseData.failed as { employeeId: string; message: string }[])
				: [];

			return { created, failed };
		} catch (error: any) {
			console.error("Error bulk creating employee benefits:", error);
			if (error.status === 400 && error.errors) {
				throw error;
			}
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error bulk creating employee benefits",
			);
		}
	}

	/**
	 * Update an existing employee benefit
	 * @param id Employee Benefit ID
	 * @param data Update payload
	 * @returns Promise<EmployeeBenefit> - Updated employee benefit
	 */
	async updateEmployeeBenefit(
		id: string,
		data: UpdateEmployeeBenefitRequest,
	): Promise<EmployeeBenefit> {
		try {

			const response = await hrisApiClient.patch<any>(`/api/employeeBenefit/${id}`, data);

			if (!response.data) {
				throw new Error("Failed to update employee benefit");
			}

			// Handle nested response
			let responseData = response.data;
			if (responseData && typeof responseData === "object" && "data" in responseData) {
				responseData = responseData.data;
			}
			if (responseData && "employeeBenefit" in responseData) {
				responseData = responseData.employeeBenefit;
			}

			return responseData as EmployeeBenefit;
		} catch (error: any) {
			console.error("Error updating employee benefit:", error);
			if (error.status === 400 && error.errors) {
				throw error;
			}
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error updating employee benefit",
			);
		}
	}

	/**
	 * Delete an employee benefit
	 * @param id Employee Benefit ID
	 * @returns Promise<void>
	 */
	async deleteEmployeeBenefit(id: string): Promise<void> {
		try {

			const response = await hrisApiClient.delete(`/api/employeeBenefit/${id}`);
			if (!response.data) {
				// Some delete endpoints might return 204 No Content with no body, check status if needed
				// But assuming consistent API response structure for now
				// throw new Error("Failed to delete employee benefit");
			}
		} catch (error: any) {
			console.error("Error deleting employee benefit:", error);
			if (error.status === 400 && error.errors) {
				throw error;
			}
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error deleting employee benefit",
			);
		}
	}
}

export const employeeBenefitService = new EmployeeBenefitService();
export default employeeBenefitService;

