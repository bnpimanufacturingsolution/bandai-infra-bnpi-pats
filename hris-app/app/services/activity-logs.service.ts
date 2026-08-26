import { hrisApiClient } from "../lib/api-client";
import { APIService, type ApiQueryParams } from "./api-service";

export interface ActivityLogPage {
	url: string;
	title: string;
}

export interface ActivityLogHeaders {
	userAgent?: string;
}

export interface ActivityLogArchive {
	status: boolean;
	date: string;
}

export interface ActivityLogRecord {
	id: string;
	employeeId?: string | null;
	headers?: ActivityLogHeaders | null;
	ip: string;
	path: string;
	method: string;
	page?: ActivityLogPage | null;
	action: string;
	description?: string;
	payload?: unknown;
	organizationId?: string | null;
	entityType?: string | null;
	archive?: ActivityLogArchive | null;
	isDeleted?: boolean;
	createdAt?: string;
	updatedAt?: string;
}

export interface ActivityLogsResponse {
	activityLoggings: ActivityLogRecord[];
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

class ActivityLogsService extends APIService {
	async getActivityLogs(): Promise<ActivityLogsResponse> {
		try {

			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<ActivityLogsResponse>(
				`/api/activityLogging${queryString}`,
			);

			let activityLogsData = response.data;
			if (
				activityLogsData &&
				typeof activityLogsData === "object" &&
				"data" in activityLogsData
			) {
				activityLogsData = (activityLogsData as any).data;
			}

			if (!activityLogsData) {
				return { activityLoggings: [] };
			}

			return activityLogsData as ActivityLogsResponse;
		} catch (error: any) {
			console.error("Error fetching activity logs:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching activity logs",
			);
		}
	}

	async getActivityLogById(id: string, params?: ApiQueryParams): Promise<ActivityLogRecord> {
		try {

			const queryString = this.setParams(params || {}).getQueryString();
			const response = await hrisApiClient.get<ActivityLogRecord>(
				`/api/activityLogging/${id}${queryString}`,
			);

			let activityLogData = response.data;
			if (
				activityLogData &&
				typeof activityLogData === "object" &&
				"data" in activityLogData
			) {
				activityLogData = (activityLogData as any).data;
			}

			if (!activityLogData) {
				throw new Error("Activity log not found");
			}

			return activityLogData as ActivityLogRecord;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching activity log",
			);
		}
	}
}

const activityLogsService = new ActivityLogsService();

export default activityLogsService;

