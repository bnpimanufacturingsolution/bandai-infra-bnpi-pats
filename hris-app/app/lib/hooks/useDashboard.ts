import { useQuery } from "@tanstack/react-query";
import dashboardService, {
	type DashboardOverviewResponse,
} from "~/services/dashboard.service";

// Query keys structure
export const queryKeys = {
	dashboard: {
		all: ["dashboard"] as const,
		overview: () => [...queryKeys.dashboard.all, "overview"] as const,
	},
};

/**
 * Hook to fetch dashboard overview statistics
 */
export const useDashboardOverview = () => {
	return useQuery<DashboardOverviewResponse>({
		queryKey: queryKeys.dashboard.overview(),
		queryFn: () => dashboardService.getOverview(),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

