import { hrisApiClient } from "../lib/api-client";

export type DisciplinaryRuleCategory =
	| "ATTENDANCE"
	| "BEHAVIOR"
	| "PERFORMANCE"
	| "SAFETY"
	| "POLICY_VIOLATION"
	| "MISCONDUCT"
	| "HARASSMENT"
	| "DRESS_CODE"
	| "PUNCTUALITY"
	| "OTHER";

export type DisciplinaryRuleSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DisciplinaryConsequenceStep {
	action: string;
	employeeStep: string;
	managerStep?: string | null;
	responseWindowDays?: number | null;
}

export interface DisciplinaryConsequencePlan {
	LOW?: DisciplinaryConsequenceStep | null;
	MEDIUM?: DisciplinaryConsequenceStep | null;
	HIGH?: DisciplinaryConsequenceStep | null;
	CRITICAL?: DisciplinaryConsequenceStep | null;
}

export interface DisciplinaryRule {
	id: string;
	code: string | null;
	title: string;
	category: DisciplinaryRuleCategory;
	severity: DisciplinaryRuleSeverity;
	description: string;
	consequences: string | null;
	consequencePlan?: DisciplinaryConsequencePlan | null;
	isActive: boolean;
	effectiveDate?: string;
	expiryDate?: string | null;
	createdAt?: string;
	updatedAt?: string;
}

export interface DisciplinaryRuleListResponse {
	rules?: DisciplinaryRule[];
	Rules?: DisciplinaryRule[];
	count?: number;
	pagination?: { total: number; page: number; limit: number };
}

export interface DisciplinaryRulePayload {
	code?: string;
	title: string;
	category: DisciplinaryRuleCategory;
	severity: DisciplinaryRuleSeverity;
	description: string;
	consequences?: string;
	consequencePlan?: DisciplinaryConsequencePlan;
	isActive?: boolean;
	effectiveDate?: string;
	expiryDate?: string | null;
}

export const disciplinaryRulesService = {
	async list(params?: {
		page?: number;
		limit?: number;
		category?: DisciplinaryRuleCategory;
		severity?: DisciplinaryRuleSeverity;
	}): Promise<DisciplinaryRuleListResponse> {
		const filters = [
			...(params?.category ? [`category:${params.category}`] : []),
			...(params?.severity ? [`severity:${params.severity}`] : []),
		];
		const response = await hrisApiClient.get<any>("/api/Rule", {
			document: true,
			pagination: true,
			count: true,
			page: params?.page ?? 1,
			limit: params?.limit ?? 10,
			sort: "code",
			order: "asc",
			...(filters.length ? { filter: filters.join(",") } : {}),
		});
		const data = response.data?.data || response.data || {};
		return {
			rules: (data.Rules || data.rules || []) as DisciplinaryRule[],
			count: Number(data.count ?? 0),
			pagination: data.pagination as DisciplinaryRuleListResponse["pagination"],
		};
	},

	async getById(id: string): Promise<DisciplinaryRule> {
		const response = await hrisApiClient.get<any>(`/api/Rule/${id}`);
		return (response.data?.data || response.data) as DisciplinaryRule;
	},

	async create(payload: DisciplinaryRulePayload): Promise<DisciplinaryRule> {
		const response = await hrisApiClient.post<any>("/api/Rule", payload);
		return (response.data?.data?.Rule || response.data?.Rule || response.data?.data || response.data) as DisciplinaryRule;
	},

	async update(id: string, payload: Partial<DisciplinaryRulePayload>): Promise<DisciplinaryRule> {
		const response = await hrisApiClient.put<any>(`/api/Rule/${id}`, payload);
		return (response.data?.data?.Rule || response.data?.Rule || response.data?.data || response.data) as DisciplinaryRule;
	},

	async remove(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/Rule/${id}`);
	},
};
