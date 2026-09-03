import { hrisApiClient } from "../lib/api-client";
import { APIService, type ApiQueryParams } from "./api-service";

export interface UserActivityLogEmployeeSummary {
	id: string;
	employeeId?: string | null;
	firstName?: string | null;
	lastName?: string | null;
	departmentName?: string | null;
	positionTitle?: string | null;
	levelName?: string | null;
	role?: string | null;
}

export interface UserActivityLogRecord {
	id: string;
	source: "activity" | "audit" | "request" | "schedule";
	category:
		| "attendance"
		| "timesheet"
		| "payroll"
		| "leave"
		| "overtime"
		| "schedule"
		| "profile"
		| "login"
		| "account"
		| "request"
		| "audit";
	title: string;
	description: string;
	occurredAt: string;
	actorName: string;
	actorRole?: string | null;
	referenceLabel?: string | null;
	referenceType?: string | null;
	referenceId?: string | null;
	path?: string | null;
	method?: string | null;
	severity?: string | null;
	searchText?: string;
	metadata?: Record<string, any> | null;
}

export interface UserActivityLogsPayload {
	user: {
		id: string;
		email: string;
		userName?: string | null;
		role: string;
		status: string;
		organizationId?: string | null;
		lastLogin?: string | null;
		loginMethod?: string | null;
		createdAt: string;
		updatedAt: string;
		metadata?: Record<string, any> | null;
	};
	employee: UserActivityLogEmployeeSummary | null;
	activityLogs: UserActivityLogRecord[];
	count?: number;
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
		hasNext?: boolean;
		hasPrev?: boolean;
	};
}

export interface UserActivityLogsResponse {
	status?: string;
	message?: string;
	data: UserActivityLogsPayload;
	code?: number;
	timestamp?: string;
}

class UserActivityLogsService extends APIService {
	async getUserActivityLogs(userId: string): Promise<UserActivityLogsPayload> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<UserActivityLogsResponse>(
				`/api/auth/users/${userId}/activity-logs${queryString}`,
			);

			let payload = response.data;
			if (payload && typeof payload === "object" && "data" in payload) {
				payload = (payload as any).data;
			}

			if (!payload) {
				return {
					user: {
						id: "",
						email: "",
						role: "",
						status: "",
						createdAt: new Date(0).toISOString(),
						updatedAt: new Date(0).toISOString(),
					} as any,
					employee: null,
					activityLogs: [],
				};
			}

			return payload as unknown as UserActivityLogsPayload;
		} catch (error: any) {
			console.error("Error fetching user activity logs:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching user activity logs",
			);
		}
	}
}

const userActivityLogsService = new UserActivityLogsService();

export default userActivityLogsService;
