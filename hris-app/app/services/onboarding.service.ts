import { hrisApiClient } from "../lib/api-client";
import type {
	OnboardingRosterEmployee,
	OnboardingRosterPagination,
	OnboardingVisibleChecklist,
	OnboardingTemplateSummary,
	OnboardingTemplateTree,
	ReplaceTemplateTreePayload,
	SignOnboardingItemPayload,
	CreateOnboardingChecklistPayload,
} from "~/zod/onboarding";

const unwrap = <T>(payload: any): T => {
	if (payload && typeof payload === "object" && "data" in payload) {
		return (payload as any).data as T;
	}
	return payload as T;
};

export interface OnboardingRosterParams {
	search?: string;
	departmentId?: string;
	page?: number;
	limit?: number;
}

class OnboardingService {
	async getRoster(
		params?: OnboardingRosterParams,
	): Promise<{ employees: OnboardingRosterEmployee[]; pagination?: OnboardingRosterPagination }> {
		const query = new URLSearchParams();
		if (params?.search?.trim()) query.set("search", params.search.trim());
		if (params?.departmentId) query.set("departmentId", params.departmentId);
		if (params?.page && params.page > 1) query.set("page", String(params.page));
		if (params?.limit) query.set("limit", String(params.limit));
		const suffix = query.toString() ? `?${query.toString()}` : "";
		const response = await hrisApiClient.get(`/api/onboarding/employees${suffix}`);
		return unwrap<{ employees: OnboardingRosterEmployee[]; pagination?: OnboardingRosterPagination }>(
			response.data,
		);
	}

	async listChecklists(employeeId?: string): Promise<{ checklists: any[] }> {
		const suffix = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : "";
		const response = await hrisApiClient.get(`/api/onboarding/checklists${suffix}`);
		return unwrap<{ checklists: any[] }>(response.data);
	}

	async getVisibleChecklist(checklistId: string): Promise<{ checklist: OnboardingVisibleChecklist }> {
		const response = await hrisApiClient.get(`/api/onboarding/checklists/${checklistId}/visible`);
		return unwrap<{ checklist: OnboardingVisibleChecklist }>(response.data);
	}

	async signItem(
		itemId: string,
		payload: SignOnboardingItemPayload,
	): Promise<{ item: unknown; signature: unknown; checklist: unknown }> {
		const response = await hrisApiClient.post(
			`/api/onboarding/items/${itemId}/sign`,
			payload,
		);
		return unwrap(response.data);
	}

	async unsignItem(itemId: string, reason?: string): Promise<{ item: unknown }> {
		const response = await hrisApiClient.post(`/api/onboarding/items/${itemId}/unsign`, {
			reason: reason || null,
		});
		return unwrap(response.data);
	}

	async listTemplates(): Promise<{ templates: OnboardingTemplateSummary[] }> {
		const response = await hrisApiClient.get("/api/onboarding/templates");
		return unwrap<{ templates: OnboardingTemplateSummary[] }>(response.data);
	}

	async getTemplate(templateId: string): Promise<{ template: OnboardingTemplateTree }> {
		const response = await hrisApiClient.get(`/api/onboarding/templates/${templateId}`);
		return unwrap<{ template: OnboardingTemplateTree }>(response.data);
	}

	async createTemplate(name: string, description?: string): Promise<{ template: { id: string } }> {
		const response = await hrisApiClient.post("/api/onboarding/templates", {
			name,
			description: description || null,
		});
		return unwrap(response.data);
	}

	async replaceTemplateTree(
		templateId: string,
		payload: ReplaceTemplateTreePayload,
	): Promise<{ template: OnboardingTemplateTree }> {
		const response = await hrisApiClient.put(
			`/api/onboarding/templates/${templateId}/tree`,
			payload,
		);
		return unwrap<{ template: OnboardingTemplateTree }>(response.data);
	}

	async createChecklist(payload: CreateOnboardingChecklistPayload): Promise<{ checklist: unknown }> {
		const response = await hrisApiClient.post("/api/onboarding/checklists", payload);
		return unwrap(response.data);
	}
}

const onboardingService = new OnboardingService();
export default onboardingService;
