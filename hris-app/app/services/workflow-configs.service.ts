import { hrisApiClient } from "~/lib/api-client";
import { APIService, type ApiQueryParams } from "./api-service";

export type WorkflowConfigDomain =
	| "REQUEST"
	| "RECRUITMENT"
	| "PAYROLL";

export type WorkflowConfigStepType = "SUBMISSION" | "APPROVAL" | "TASK";
export type WorkflowConfigAssigneeType = "REQUESTER" | "SUPERVISOR" | "HR" | "SYSTEM";

export interface WorkflowConfigState {
	key: string;
	label: string;
	order: number;
	isTerminal?: boolean;
}

export interface WorkflowConfigStep {
	step_number: number;
	step_name: string;
	step_type: WorkflowConfigStepType;
	assignee_type: WorkflowConfigAssigneeType;
	is_required?: boolean;
	state_on_enter?: string;
	state_on_approve?: string;
	state_on_reject?: string;
	state_on_complete?: string;
	state_on_skip?: string;
}

export interface WorkflowConfig {
	code: string;
	name: string;
	description?: string | null;
	domain: WorkflowConfigDomain;
	requestType?: string | null;
	states: WorkflowConfigState[];
	steps: WorkflowConfigStep[];
	isActive: boolean;
	isDefault?: boolean;
	createdAt?: string;
	updatedAt?: string;
}

export interface WorkflowConfigsListResponse {
	workflowConfigs: WorkflowConfig[];
	count: number;
}

export interface InitializeWorkflowDefaultsResponse extends WorkflowConfigsListResponse {
	created: number;
}

export type CreateWorkflowConfigRequest = WorkflowConfig;
export type UpdateWorkflowConfigRequest = Omit<WorkflowConfig, "code">;

class WorkflowConfigsService extends APIService {
	async getWorkflowConfigs(params?: ApiQueryParams): Promise<WorkflowConfigsListResponse> {
		const queryParams = params
			? {
					...params,
					fields: Array.isArray(params.fields) ? params.fields.join(",") : params.fields,
					filter: typeof params.filter === "string" ? params.filter : undefined,
					sort: typeof params.sort === "string" ? params.sort : undefined,
				}
			: undefined;
		const response = await hrisApiClient.get<any>("/api/workflow-config", queryParams);
		const data = response.data?.data || response.data;
		if (!data) {
			throw new Error("Failed to fetch workflow configs");
		}
		return data as WorkflowConfigsListResponse;
	}

	async getWorkflowConfig(code: string): Promise<WorkflowConfig> {
		const response = await hrisApiClient.get<any>(`/api/workflow-config/${code}`);
		const data = response.data?.data || response.data;
		const workflowConfig = data?.workflowConfig || data;
		if (!workflowConfig) {
			throw new Error("Failed to fetch workflow config");
		}
		return workflowConfig as WorkflowConfig;
	}

	async initializeDefaults(): Promise<InitializeWorkflowDefaultsResponse> {
		const response = await hrisApiClient.post<any>("/api/workflow-config/initialize-defaults");
		const data = response.data?.data || response.data;
		if (!data) {
			throw new Error("Failed to initialize workflow defaults");
		}
		return data as InitializeWorkflowDefaultsResponse;
	}

	async createWorkflowConfig(payload: CreateWorkflowConfigRequest): Promise<WorkflowConfig> {
		const response = await hrisApiClient.post<any>("/api/workflow-config", payload);
		const data = response.data?.data || response.data;
		const workflowConfig = data?.workflowConfig || data;
		if (!workflowConfig) {
			throw new Error("Failed to create workflow config");
		}
		return workflowConfig as WorkflowConfig;
	}

	async updateWorkflowConfig(
		code: string,
		payload: UpdateWorkflowConfigRequest,
	): Promise<WorkflowConfig> {
		const response = await hrisApiClient.patch<any>(`/api/workflow-config/${code}`, payload);
		const data = response.data?.data || response.data;
		const workflowConfig = data?.workflowConfig || data;
		if (!workflowConfig) {
			throw new Error("Failed to update workflow config");
		}
		return workflowConfig as WorkflowConfig;
	}

	async resetWorkflowConfig(code: string): Promise<WorkflowConfig> {
		const response = await hrisApiClient.post<any>(`/api/workflow-config/${code}/reset`);
		const data = response.data?.data || response.data;
		const workflowConfig = data?.workflowConfig || data;
		if (!workflowConfig) {
			throw new Error("Failed to reset workflow config");
		}
		return workflowConfig as WorkflowConfig;
	}

	async deleteWorkflowConfig(code: string): Promise<void> {
		await hrisApiClient.delete(`/api/workflow-config/${code}`);
	}
}

const workflowConfigsService = new WorkflowConfigsService();
export default workflowConfigsService;
