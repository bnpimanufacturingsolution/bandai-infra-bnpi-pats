import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";

export interface DashboardOverview {
	totalEmployees: number;
	activeEmployees: number;
	inactiveEmployees: number;
	totalDepartments: number;
	totalPositions: number;
	newHiresThisMonth: number;
	employeeRetentionRate: string;
}

export interface DashboardOverviewResponse {
	overview: DashboardOverview;
}

class DashboardService extends APIService {
	/**
	 * Get dashboard overview statistics
	 * @returns Promise<DashboardOverviewResponse> - Dashboard overview response with statistics
	 */
	async getOverview(): Promise<DashboardOverviewResponse> {
		try {
			const response = await hrisApiClient.get<any>("/api/dashboard/overview");

			// Handle nested data structure if API returns { data: { ... } }
			let dashboardData = response.data;
			if (dashboardData && typeof dashboardData === "object" && "data" in dashboardData) {
				dashboardData = dashboardData.data;
			}

			if (!dashboardData || !dashboardData.overview) {
				throw new Error("Failed to fetch dashboard overview");
			}

			return dashboardData as DashboardOverviewResponse;
		} catch (error: any) {
			console.error("Error fetching dashboard overview:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching dashboard overview",
			);
		}
	}
}

const dashboardService = new DashboardService();
export default dashboardService;
