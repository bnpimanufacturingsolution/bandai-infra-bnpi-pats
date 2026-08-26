import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";
import type { EmployeePayroll, EmployeePayrollsResponse } from "../types/employee-payroll";

class EmployeePayrollService extends APIService {
	/**
	 * Get all employee payrolls with optional filtering, pagination, and sorting
	 * Uses query parameters set via method chaining (select, search, paginate, sort, setParams)
	 * @returns Promise<EmployeePayrollsResponse> - Employee payrolls response with pagination
	 */
	async getEmployeePayrolls(): Promise<EmployeePayrollsResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/employeePayroll${queryString}`;

			console.log("Fetching employee payrolls from HRIS API:", endpoint);

			const response = await hrisApiClient.get<EmployeePayrollsResponse>(endpoint);

			// Handle nested data structure if API returns { data: { ... } }
			let payrollData = response.data;
			if (payrollData && typeof payrollData === "object" && "data" in payrollData) {
				payrollData = (payrollData as any).data;
			}

			if (!payrollData) {
				throw new Error("Failed to fetch employee payrolls");
			}

			return payrollData as EmployeePayrollsResponse;
		} catch (error: any) {
			console.error("Error fetching employee payrolls:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching employee payrolls",
			);
		}
	}

	/**
	 * Get employee payroll by ID with optional field selection
	 * @param id Employee payroll ID
	 * @returns Promise<EmployeePayroll> - Employee payroll data
	 */
	async getEmployeePayrollById(id: string): Promise<EmployeePayroll> {
		try {

			const queryString = this.getQueryString();
			const endpoint = `/api/employeePayroll/${id}${queryString}`;
			const response = await hrisApiClient.get<any>(endpoint);

			if (!response.data) {
				throw new Error("Employee payroll not found");
			}

			// Extract payroll from nested structure: response.data.data
			let payrollData = response.data;
			if (payrollData && typeof payrollData === "object" && "data" in payrollData) {
				payrollData = payrollData.data;
			}

			if (!payrollData) {
				throw new Error("Employee payroll data is undefined");
			}

			return payrollData as EmployeePayroll;
		} catch (error: any) {
			console.error("Error fetching employee payroll:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching employee payroll",
			);
		}
	}

	/**
	 * Get employee payrolls with specific parameters
	 * @param params Query parameters
	 * @returns Promise<EmployeePayrollsResponse> - Employee payrolls response
	 */
	async getEmployeePayrollsWithParams(params: ApiQueryParams): Promise<EmployeePayrollsResponse> {
		return this.setParams(params).getEmployeePayrolls();
	}

	/**
	 * Search employee payrolls
	 * @param query Search term
	 * @param params Optional query parameters
	 * @returns Promise<EmployeePayrollsResponse> - Employee payrolls response
	 */
	async searchEmployeePayrolls(
		query: string,
		params?: ApiQueryParams,
	): Promise<EmployeePayrollsResponse> {
		return this.search(query)
			.setParams(params || {})
			.getEmployeePayrolls();
	}

	/**
	 * Get employee payrolls grouped by a specific field
	 * @param groupBy Field to group by
	 * @param params Optional query parameters
	 * @returns Promise<EmployeePayrollsResponse> - Employee payrolls response
	 */
	async getEmployeePayrollsGrouped(
		groupBy: string,
		params?: ApiQueryParams,
	): Promise<EmployeePayrollsResponse> {
		return this.setParams({
			...params,
			groupBy,
		}).getEmployeePayrolls();
	}

	/**
	 * Get detailed breakdown of employee payroll including attendance
	 * @param id Employee payroll ID
	 * @returns Promise<EmployeePayrollBreakdown> - Detailed breakdown
	 */
	async getEmployeePayrollBreakdown(id: string): Promise<EmployeePayrollBreakdown> {
		try {

			const endpoint = `/api/employeePayroll/${id}/breakdown`;
			const response = await hrisApiClient.get<any>(endpoint);

			if (!response.data) {
				throw new Error("Payroll breakdown not found");
			}

			// Extract breakdown from nested structure
			let breakdownData = response.data;
			if (breakdownData && typeof breakdownData === "object" && "data" in breakdownData) {
				breakdownData = breakdownData.data;
			}

			if (!breakdownData) {
				throw new Error("Payroll breakdown data is undefined");
			}

			return breakdownData as EmployeePayrollBreakdown;
		} catch (error: any) {
			console.error("Error fetching payroll breakdown:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching payroll breakdown",
			);
		}
	}

	/**
	 * Import employee payrolls from XLSX file
	 * @param file File to upload
	 * @returns Promise<ImportEmployeePayrollResponse> - Import summary
	 */
	async importEmployeePayrolls(file: File): Promise<ImportEmployeePayrollResponse> {
		try {

			const formData = new FormData();
			formData.append("file", file);

			console.log("Importing employee payrolls from XLSX file");

			const response = await hrisApiClient.post<{ data: ImportEmployeePayrollResponse }>(
				"/api/employeePayroll/import",
				formData,
			);

			if (!response.data) {
				throw new Error("Failed to import employee payrolls");
			}

			// Handle nested data structure
			const importData = response.data.data || response.data;
			return importData as ImportEmployeePayrollResponse;
		} catch (error: any) {
			console.error("Error importing employee payrolls:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error importing employee payrolls",
			);
		}
	}

	/**
	 * Generate and download payslip PDF
	 * @param id Employee payroll ID
	 * @returns Promise<Blob> - PDF Blob
	 */
	async generatePayslipPdf(id: string): Promise<Blob> {
		try {

			const endpoint = `/api/employeePayroll/${id}/payslip`;
			console.log(`Generating payslip PDF for ID: ${id}`);

			// Use the new getBlob method
			const blob = await hrisApiClient.getBlob(endpoint);

			if (!blob) {
				throw new Error("Failed to generate payslip PDF");
			}

			return blob;
		} catch (error: any) {
			console.error("Error generating payslip PDF:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error generating payslip PDF",
			);
		}
	}
 
	/**
	 * Upload a payslip release attachment for a payroll period.
	 * The backend will store the uploaded file URL into each EmployeePayroll.metadata.payslipRelease.attachmentUrls
	 */
	async uploadPayslipReleaseAttachment(params: {
		payrollPeriodId: string;
		file: File;
	}): Promise<{
		upload: { url: string; format?: string; bytes?: number };
		payrollPeriodId: string;
		updatedEmployeePayrolls: number;
	}> {
		const formData = new FormData();
		formData.append("file", params.file);

		const endpoint = `/api/employeePayroll/period/${params.payrollPeriodId}/payslip-release/attachment`;
		const response = await hrisApiClient.post<any>(endpoint, formData);
		const payload = response.data?.data || response.data;
		if (!payload) {
			throw new Error("Failed to upload payslip release attachment");
		}
		return payload;
	}

	/**
	 * Generate payslip PDFs for all EmployeePayroll records in a period
	 * that already have release attachments.
	 */
	async generatePayslipsForPeriod(payrollPeriodId: string): Promise<{
		payrollPeriodId: string;
		totalEmployeePayrolls: number;
		generated: number;
		skippedMissingAttachment: number;
		skippedAlreadyGenerated: number;
		failed: number;
	}> {
		const endpoint = `/api/employeePayroll/period/${payrollPeriodId}/payslip-release/generate-payslips`;
		const response = await hrisApiClient.post<any>(endpoint);
		const payload = response.data?.data || response.data;
		if (!payload) {
			throw new Error("Failed to generate payslips for period");
		}
		return payload;
	}

	async releasePayslipsForPeriod(payrollPeriodId: string): Promise<{
		payrollPeriodId: string;
		totalEmployeePayrolls: number;
		released: number;
		skippedMissingPayslip: number;
	}> {
		const endpoint = `/api/employeePayroll/period/${payrollPeriodId}/payslip-release/release`;
		const response = await hrisApiClient.post<any>(endpoint);
		const payload = response.data?.data || response.data;
		if (!payload) {
			throw new Error("Failed to release payslips for period");
		}
		return payload;
	}

	async resetGeneratedPayrolls(): Promise<EmployeePayrollResetResponse> {
		const response = await hrisApiClient.post<any>(
			"/api/employeePayroll/debug/reset-generated-payrolls",
			{ confirm: "DELETE_EMPLOYEE_PAYROLLS" },
		);
		const payload = response.data?.data || response.data;
		if (!payload) {
			throw new Error("Failed to reset employee payroll data");
		}
		return payload as EmployeePayrollResetResponse;
	}
}

export interface EmployeePayrollResetResponse {
	deletedEmployeePayrolls: number;
	resetPayrollPeriods: number;
	unlinkedSoaLineItems: number;
	preservedFutureDraftPeriods: boolean;
	resetPeriodStatuses: string[];
}

export interface ImportEmployeePayrollResponse {
	summary: {
		totalRows: number;
		processedRows: number;
		created: number;
		updated: number;
		skipped: number;
		errors: string[];
	};
}

export interface AttendanceRecord {
	date: Date | string;
	dayOfWeek: string;
	status: "present" | "absent" | "rest";
	timeIn?: string | null;
	timeOut?: string | null;
	hoursWorked?: number;
	isLate?: boolean;
	remarks?: string;
}

export interface EmployeePayrollBreakdown {
	employeeInfo: {
		id: string;
		employeeId: string;
		name: string;
		department: string;
		position: string;
		level: string;
		basicSalary: number;
		payFrequency: string;
	};
	payrollPeriod: {
		id: string;
		name: string;
		startDate: Date | string;
		endDate: Date | string;
		payDate: Date | string;
		status: string;
		cutoffDay?: number;
	};
	schedule: any;
	workingDays: {
		totalScheduledDays: number;
		totalWorkDays: number;
		totalRestDays: number;
	};
	rates: {
		basicSalary: number;
		dailyRate: number;
		hourlyRate: number;
	};
	attendanceSummary: {
		daysPresent: number;
		daysAbsent: number;
		daysLate: number;
	};
	attendanceBreakdown: AttendanceRecord[];
	calculations: {
		absentDeduction: number;
		estimatedBasicPay: number;
	};
	payroll: {
		id: string;
		basicPay: number;
		overtimePay: number;
		nightDiffPay: number;
		holidayPay: number;
		allowances: number;
		bonuses: number;
		grossPay: number;
		contributions: {
			sss: number;
			philHealth: number;
			pagIbig: number;
			total: number;
		};
		taxableIncome: number;
		withholdingTax: number;
		deductions: {
			tax: number;
			sss: number;
			philHealth: number;
			pagIbig: number;
			loans: number;
			other: number;
			total: number;
		};
		netPay: number;
		regularHours: number;
		overtimeHours: number;
		isPaid: boolean;
		paidAt?: Date | string | null;
		paymentMethod?: string | null;
		referenceNumber?: string | null;
		notes?: string | null;
	};
}

// Export singleton instance
export const employeePayrollService = new EmployeePayrollService();
export default employeePayrollService;

