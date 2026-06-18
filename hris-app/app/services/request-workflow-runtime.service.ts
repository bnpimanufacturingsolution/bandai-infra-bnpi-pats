import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";

export interface WorkflowStatusConfig {
	key: string;
	label: string;
	order: number;
	isTerminal?: boolean;
	color?: string;
	permissions?: string[];
	allowed_transitions?: string[];
}

export interface WorkflowStatusesResponse {
	states: WorkflowStatusConfig[];
	statuses?: WorkflowStatusConfig[];
	workflowCode: string | null;
	workflowName?: string | null;
}

export interface WorkflowPermissionsResponse {
	permissions: Record<string, string[]>;
	userId?: string;
	userRole?: string;
}

class RequestWorkflowRuntimeService extends APIService {
	async getStatusesByRequestType(requestType: string): Promise<WorkflowStatusesResponse> {
		const response = await hrisApiClient.get<any>(`/api/request/statuses/${requestType}`);
		let data = response.data;
		if (data && typeof data === "object" && "data" in data) {
			data = data.data;
		}

		if (!data) {
			throw new Error("Failed to fetch workflow states");
		}

		const normalized = data as WorkflowStatusesResponse;
		if (!normalized.states && normalized.statuses) {
			normalized.states = normalized.statuses;
		}
		return normalized;
	}

	async getWorkflowPermissions(_workflowCode: string): Promise<WorkflowPermissionsResponse> {
		return {
			permissions: {},
		};
	}
}

const requestWorkflowRuntimeService = new RequestWorkflowRuntimeService();
export default requestWorkflowRuntimeService;
