import { hrisApiClient } from "../lib/api-client";

export interface CreateEmployeeLoanRequest {
	organizationId: string;
	employeeId: string;
	loanTypeId: string;
	principalAmount: number;
	interestRate: number;
	totalAmount: number;
	termMonths: number;
	monthlyPayment: number;
	startDate: string;
	endDate: string;
	amountPaid: number;
	balance: number;
	status: "PENDING";
	notes?: string;
}

export interface EmployeeLoanResponse {
	status: string;
	message: string;
	data: { employeeLoan?: { id: string }; id?: string };
}

class EmployeeLoansService {
	async createApplication(payload: CreateEmployeeLoanRequest): Promise<EmployeeLoanResponse> {
		const response = await hrisApiClient.post<EmployeeLoanResponse>(
			"/api/employeeLoan",
			payload,
		);
		if (!response?.data) throw new Error("Invalid loan application response");
		return response.data;
	}

	async listMine(employeeId: string): Promise<any[]> {
		const response = await hrisApiClient.get<any>(
			`/api/employeeLoan?document=true&pagination=true&page=1&limit=20&sort=createdAt&order=desc&filter=${encodeURIComponent(
				JSON.stringify({ employeeId }),
			)}`,
		);
		const data = (response?.data as any)?.data || {};
		return Array.isArray(data.employeeLoans) ? data.employeeLoans : [];
	}
}

export default new EmployeeLoansService();
