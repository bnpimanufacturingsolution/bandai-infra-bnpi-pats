import { hrisApiClient } from "../lib/api-client";
import { APIService, type ApiQueryParams } from "./api-service";

export interface AuditLogEntity {
	type: string;
	id: string;
}

export interface AuditLogChanges {
	before?: unknown;
	after?: unknown;
}

export interface AuditLogMetadata {
	userAgent?: string;
	ip?: string;
	path?: string;
	method?: string;
}

export interface AuditLogRecord {
	id: string;
	employeeId?: string | null;
	type: string;
	severity: string;
	entity: AuditLogEntity;
	changes?: AuditLogChanges | null;
	metadata?: AuditLogMetadata | null;
	description?: string | null;
	payload?: unknown;
	archiveStatus?: boolean;
	archiveDate?: string | null;
	isDeleted?: boolean;
	timestamp?: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface AuditLogsResponse {
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
}

class AuditLogsService extends APIService {
	async getAuditLogs(): Promise<AuditLogsResponse> {
		try {

			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<AuditLogsResponse>(
				`/api/auditLogging${queryString}`,
			);

			let auditLogsData = response.data;
			if (auditLogsData && typeof auditLogsData === "object" && "data" in auditLogsData) {
				auditLogsData = (auditLogsData as any).data;
			}

			if (!auditLogsData) {
				return { auditLoggings: [] };
			}

			return auditLogsData as AuditLogsResponse;
		} catch (error: any) {
			console.error("Error fetching audit logs:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching audit logs",
			);
		}
	}

	async getAuditLogById(id: string, params?: ApiQueryParams): Promise<AuditLogRecord> {
		try {

			const queryString = this.setParams(params || {}).getQueryString();
			const response = await hrisApiClient.get<AuditLogRecord>(
				`/api/auditLogging/${id}${queryString}`,
			);

			let auditLogData = response.data;
			if (auditLogData && typeof auditLogData === "object" && "data" in auditLogData) {
				auditLogData = (auditLogData as any).data;
			}

			if (!auditLogData) {
				throw new Error("Audit log not found");
			}

			return auditLogData as AuditLogRecord;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching audit log",
			);
		}
	}
}

const auditLogsService = new AuditLogsService();

export default auditLogsService;

