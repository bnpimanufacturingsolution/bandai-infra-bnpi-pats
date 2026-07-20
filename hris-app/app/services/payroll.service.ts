import { APIService } from "./api-service";
import { API_CONFIG } from "../lib/api/config";
import { hrisApiClient } from "../lib/api-client";
import type { PayrollRecord, PaginatedResponse, ApiResponse } from "../lib/api/config";

const buildEndpoint = (template: string, params: Record<string, string>) =>
	Object.entries(params).reduce(
		(endpoint, [key, value]) => endpoint.replace(`:${key}`, encodeURIComponent(value)),
		template,
	);

export class PayrollService extends APIService {
	async getPayrollRecords(params?: {
		page?: number;
		limit?: number;
		employeeId?: string;
		month?: number;
		year?: number;
		status?: string;
	}): Promise<PaginatedResponse<PayrollRecord>> {
		const queryParams = new URLSearchParams();

		if (params?.page) queryParams.append("page", params.page.toString());
		if (params?.limit) queryParams.append("limit", params.limit.toString());
		if (params?.employeeId) queryParams.append("employeeId", params.employeeId);
		if (params?.month) queryParams.append("month", params.month.toString());
		if (params?.year) queryParams.append("year", params.year.toString());
		if (params?.status) queryParams.append("status", params.status);

		const url = `${API_CONFIG.ENDPOINTS.PAYROLL.LIST}${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
		return hrisApiClient.get<PayrollRecord[]>(url) as unknown as Promise<
			PaginatedResponse<PayrollRecord>
		>;
	}

	async getPayrollRecord(id: string): Promise<ApiResponse<PayrollRecord>> {
		const url = buildEndpoint(API_CONFIG.ENDPOINTS.PAYROLL.DETAIL, { id });
		return hrisApiClient.get<PayrollRecord>(url);
	}

	async generatePayroll(params: {
		month: number;
		year: number;
		employeeIds?: string[];
	}): Promise<ApiResponse<{ generatedCount: number; payrollIds: string[] }>> {
		return hrisApiClient.post(API_CONFIG.ENDPOINTS.PAYROLL.GENERATE, params);
	}

	async getPayrollSummary(params?: {
		month?: number;
		year?: number;
		department?: string;
	}): Promise<
		ApiResponse<{
			totalEmployees: number;
			totalBasicSalary: number;
			totalAllowances: number;
			totalDeductions: number;
			totalNetSalary: number;
			averageSalary: number;
		}>
	> {
		const queryParams = new URLSearchParams();

		if (params?.month) queryParams.append("month", params.month.toString());
		if (params?.year) queryParams.append("year", params.year.toString());
		if (params?.department) queryParams.append("department", params.department);

		const url = `${API_CONFIG.ENDPOINTS.PAYROLL.LIST}/summary${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
		return hrisApiClient.get(url);
	}

	async updatePayrollStatus(
		id: string,
		status: PayrollRecord["status"],
	): Promise<ApiResponse<PayrollRecord>> {
		const url = buildEndpoint(API_CONFIG.ENDPOINTS.PAYROLL.DETAIL, { id });
		return hrisApiClient.patch<PayrollRecord>(url, { status });
	}

	async downloadPayrollSlip(id: string): Promise<Blob> {
		const url = buildEndpoint(API_CONFIG.ENDPOINTS.PAYROLL.DOWNLOAD, { id });
		return hrisApiClient.getBlob(url);
	}

	async bulkUpdatePayrollStatus(
		ids: string[],
		status: PayrollRecord["status"],
	): Promise<ApiResponse<{ updatedCount: number }>> {
		return hrisApiClient.post(`${API_CONFIG.ENDPOINTS.PAYROLL.LIST}/bulk-update`, {
			ids,
			status,
		});
	}
}

// Export singleton instance
export const payrollService = new PayrollService();
