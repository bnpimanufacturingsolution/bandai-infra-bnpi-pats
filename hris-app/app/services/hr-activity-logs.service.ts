import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { AuditLogRecord } from "./audit-logs.service";

export interface HrAuditLogsPayload {
	auditLoggings: AuditLogRecord[];
	count?: number;
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
		hasNext?: boolean;
		hasPrev?: boolean;
	};
	summary?: {
		total: number;
		types: Record<string, number>;
		severities: Record<string, number>;
		uniqueActors: number;
	};
}

export interface HrAuditLogsResponse {
	status?: string;
	message?: string;
	data: HrAuditLogsPayload;
	code?: number;
	timestamp?: string;
}

class HrAuditLogsService extends APIService {
	async getHrAuditLogs(): Promise<HrAuditLogsPayload> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<HrAuditLogsResponse>(
				`/api/auth/hr/audit-logs${queryString}`,
			);

			let payload: any = response.data;
			if (payload && typeof payload === "object" && "data" in payload) {
				payload = (payload as any).data;
			}

			if (!payload) {
				return { auditLoggings: [] };
			}

			return payload as HrAuditLogsPayload;
		} catch (error: any) {
			console.error("Error fetching HR audit logs:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching HR audit logs",
			);
		}
	}
}

const hrAuditLogsService = new HrAuditLogsService();

export default hrAuditLogsService;
export { HrAuditLogsService };
export type { AuditLogRecord };
