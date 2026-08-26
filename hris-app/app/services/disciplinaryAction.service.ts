import { hrisApiClient } from "../lib/api-client";

export type DisciplinaryActionStatus = "OPEN" | "ONGOING" | "RESOLVED" | "DISMISSED";

export interface DisciplinaryAction {
	id: string;
	employeeId: string;
	employeeName?: string | null;
	offenseType: string;
	offenseDate: string;
	description: string;
	severity: "LOW" | "MEDIUM" | "HIGH";
	status: DisciplinaryActionStatus;
	actionTaken?: string | null;
	resolutionNotes?: string | null;
	createdAt?: string;
	updatedAt?: string;
}

export interface DisciplinaryActionListResponse {
	disciplinaryActions?: DisciplinaryAction[];
	count?: number;
	pagination?: { total: number; page: number; limit: number };
}

export const disciplinaryActionService = {
	async list(params: {
		page?: number;
		limit?: number;
		query?: string;
		status?: string;
		employeeId?: string;
	}): Promise<DisciplinaryActionListResponse> {
		const response = await hrisApiClient.get<any>("/api/disciplinaryAction", {
			params: {
				document: true,
				pagination: true,
				count: true,
				page: params.page ?? 1,
				limit: params.limit ?? 20,
				...(params.query && { query: params.query }),
				...(params.status && { "filter[status]": params.status }),
				...(params.employeeId && { "filter[employeeId]": params.employeeId }),
			},
		});
		return (response.data?.data || response.data) as DisciplinaryActionListResponse;
	},

	async create(payload: {
		employeeId: string;
		offenseType: string;
		offenseDate: string;
		description: string;
		severity: string;
		status?: DisciplinaryActionStatus;
		actionTaken?: string;
	}): Promise<DisciplinaryAction> {
		const response = await hrisApiClient.post<any>("/api/disciplinaryAction", payload);
		return (response.data?.data?.disciplinaryAction || response.data?.data) as DisciplinaryAction;
	},

	async update(
		id: string,
		payload: Partial<{
			offenseType: string;
			offenseDate: string;
			description: string;
			severity: string;
			status: DisciplinaryActionStatus;
			actionTaken: string;
			resolutionNotes: string;
		}>,
	): Promise<DisciplinaryAction> {
		const response = await hrisApiClient.put<any>(`/api/disciplinaryAction/${id}`, payload);
		return (response.data?.data?.disciplinaryAction || response.data?.data) as DisciplinaryAction;
	},

	async remove(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/disciplinaryAction/${id}`);
	},
};
