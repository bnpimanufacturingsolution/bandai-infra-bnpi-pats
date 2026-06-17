import { QueryClient } from "@tanstack/react-query";

// Create a client
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// Time in milliseconds that data remains fresh
			staleTime: 5 * 60 * 1000, // 5 minutes
			// Time in milliseconds that unused/inactive cache data remains in memory
			gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
			// Retry failed requests
			retry: (failureCount, error: any) => {
				// Don't retry on 4xx errors (client errors)
				if (error?.response?.status >= 400 && error?.response?.status < 500) {
					return false;
				}
				// Retry up to 3 times for other errors
				return failureCount < 3;
			},
			// Refetch on window focus
			refetchOnWindowFocus: false,
			// Refetch on reconnect
			refetchOnReconnect: true,
		},
		mutations: {
			// Retry failed mutations
			retry: (failureCount, error: any) => {
				// Don't retry on 4xx errors (client errors)
				if (error?.response?.status >= 400 && error?.response?.status < 500) {
					return false;
				}
				// Retry up to 2 times for other errors
				return failureCount < 2;
			},
		},
	},
});

// Query keys factory for consistent key management
export const queryKeys = {
	// Auth queries
	auth: {
		user: ["auth", "user"] as const,
		profile: ["auth", "profile"] as const,
	},

	// Employee queries
	employees: {
		all: ["employees"] as const,
		lists: () => [...queryKeys.employees.all, "list"] as const,
		list: (filters: Record<string, any>) =>
			[...queryKeys.employees.lists(), { filters }] as const,
		details: () => [...queryKeys.employees.all, "detail"] as const,
		detail: (id: string) => [...queryKeys.employees.details(), id] as const,
	},

	// Attendance queries
	attendance: {
		all: ["attendance"] as const,
		lists: () => [...queryKeys.attendance.all, "list"] as const,
		list: (filters: Record<string, any>) =>
			[...queryKeys.attendance.lists(), { filters }] as const,
		summary: (filters: Record<string, any>) =>
			[...queryKeys.attendance.all, "summary", { filters }] as const,
	},

	// Leave queries
	leave: {
		all: ["leave"] as const,
		lists: () => [...queryKeys.leave.all, "list"] as const,
		list: (filters: Record<string, any>) => [...queryKeys.leave.lists(), { filters }] as const,
		balance: (employeeId?: string) => [...queryKeys.leave.all, "balance", employeeId] as const,
		approvals: (filters: Record<string, any>) =>
			[...queryKeys.leave.all, "approvals", { filters }] as const,
	},

	// Payroll queries
	payroll: {
		all: ["payroll"] as const,
		lists: () => [...queryKeys.payroll.all, "list"] as const,
		list: (filters: Record<string, any>) =>
			[...queryKeys.payroll.lists(), { filters }] as const,
		summary: (filters: Record<string, any>) =>
			[...queryKeys.payroll.all, "summary", { filters }] as const,
	},
} as const;
