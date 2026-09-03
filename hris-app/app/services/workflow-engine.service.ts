import { hrisApiClient } from "~/lib/api-client";
import { APIService, type ApiQueryParams } from "./api-service";

export type WorkflowDomain =
	| "REQUEST"
	| "RECRUITMENT"
	| "PAYROLL";

export type WorkflowStepType = "SUBMISSION" | "APPROVAL" | "TASK";
export type WorkflowAssigneeType =
	| "REQUESTER"
	| "SUPERVISOR"
	| "TARGET_DEPARTMENT_MANAGER"
	| "HR"
	| "SYSTEM";

export interface WorkflowRuntimeState {
	key: string;
	label: string;
	order: number;
	isTerminal?: boolean;
}

export interface WorkflowRuntimeStep {
	step_number: number;
	step_name: string;
	step_type: WorkflowStepType;
	assignee_type: WorkflowAssigneeType;
	assignee_role?: string | null;
	is_required?: boolean;
	state_on_enter?: string | null;
	state_on_approve?: string | null;
	state_on_reject?: string | null;
	state_on_complete?: string | null;
	state_on_skip?: string | null;
}

export interface WorkflowInstance {
	id: string;
	organizationId: string;
	domain: WorkflowDomain;
	domainRecordId?: string | null;
	requestType?: string | null;
	code?: string | null;
	name?: string | null;
	description?: string | null;
	steps: WorkflowRuntimeStep[] | Record<string, unknown> | unknown;
	states?: WorkflowRuntimeState[] | Record<string, unknown> | unknown;
	currentStateKey: string;
	stateHistory: unknown[];
	isDeleted?: boolean;
	createdAt?: string;
	updatedAt?: string;
}

export interface WorkflowInstanceQueryParams extends ApiQueryParams {
	templateOnly?: boolean;
}

export interface CreateWorkflowInstanceRequest {
	domain: WorkflowDomain;
	domainRecordId?: string;
	requestType?: string;
	code?: string;
	name?: string;
	description?: string;
	steps: unknown;
	states?: unknown;
	currentStateKey?: string;
	stateHistory?: unknown[];
}

export interface UpdateWorkflowInstanceRequest {
	domain?: WorkflowDomain;
	domainRecordId?: string;
	requestType?: string;
	code?: string;
	name?: string;
	description?: string;
	steps?: unknown;
	states?: unknown;
	currentStateKey?: string;
	stateHistory?: unknown[];
	isDeleted?: boolean;
}

export interface WorkflowInstancesResponse {
	workflowInstances: WorkflowInstance[];
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

const unwrapData = (response: any) => {
	let data = response?.data;
	if (data && typeof data === "object" && "data" in data) {
		data = data.data;
	}
	return data;
};

class WorkflowEngineService extends APIService {
	async getWorkflowInstances(): Promise<WorkflowInstancesResponse> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<any>(`/api/workflowEngine${queryString}`);
			const data = unwrapData(response);

			if (!data) {
				throw new Error("Failed to fetch workflow instances");
			}

			return {
				...data,
				workflowInstances: data.workflowInstances || data.workflowEngines || [],
			} as WorkflowInstancesResponse;
		} catch (error: any) {
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching workflow instances",
			);
		}
	}

	async getWorkflowInstanceById(
		id: string,
		fields?: string[] | string,
	): Promise<WorkflowInstance> {
		try {
			const endpoint = this.clearQueryParams().select(fields).getQueryString();
			const response = await hrisApiClient.get<any>(`/api/workflowEngine/${id}${endpoint}`);
			const data = unwrapData(response);

			if (!data) {
				throw new Error("Workflow instance not found");
			}

			return (data.workflowInstance || data.workflowEngine || data) as WorkflowInstance;
		} catch (error: any) {
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching workflow instance",
			);
		}
	}

	async createWorkflowInstance(
		payload: CreateWorkflowInstanceRequest,
	): Promise<WorkflowInstance> {
		try {
			const response = await hrisApiClient.post<any>("/api/workflowEngine", payload);
			const data = unwrapData(response);

			if (!data) {
				throw new Error("Failed to create workflow instance");
			}

			return (data.workflowInstance || data.workflowEngine || data) as WorkflowInstance;
		} catch (error: any) {
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error creating workflow instance",
			);
		}
	}

	async updateWorkflowInstance(
		id: string,
		payload: UpdateWorkflowInstanceRequest,
	): Promise<WorkflowInstance> {
		try {
			const response = await hrisApiClient.patch<any>(`/api/workflowEngine/${id}`, payload);
			const data = unwrapData(response);

			if (!data) {
				throw new Error("Failed to update workflow instance");
			}

			return (data.workflowInstance || data.workflowEngine || data) as WorkflowInstance;
		} catch (error: any) {
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error updating workflow instance",
			);
		}
	}

	async deleteWorkflowInstance(id: string): Promise<{ id: string }> {
		try {
			const response = await hrisApiClient.delete<any>(`/api/workflowEngine/${id}`);
			const data = unwrapData(response);

			if (!data) {
				return { id };
			}

			return (data.workflowInstance || data.workflowEngine || data) as { id: string };
		} catch (error: any) {
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error deleting workflow instance",
			);
		}
	}

	async getWorkflowInstancesWithParams(
		params: WorkflowInstanceQueryParams,
	): Promise<WorkflowInstancesResponse> {
		return this.clearQueryParams().setParams(params).getWorkflowInstances();
	}
}

const workflowEngineService = new WorkflowEngineService();
export default workflowEngineService;
