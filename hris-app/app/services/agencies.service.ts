import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";
import { hrisApiClient } from "../lib/api-client";

export type AgencyStatus = "ACTIVE" | "INACTIVE";

export interface Agency {
	id: string;
	organizationId: string;
	name: string;
	code: string;
	status: AgencyStatus;
	contactName?: string | null;
	contactEmail?: string | null;
	contactPhone?: string | null;
	metadata?: any;
	createdAt: string;
	updatedAt: string;
}

export interface AgenciesResponse {
	agencies: Agency[];
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
		hasNext?: boolean;
		hasPrev?: boolean;
	};
}

export interface CreateAgencyRequest {
	name: string;
	code: string;
	status?: AgencyStatus;
	contactName?: string | null;
	contactEmail?: string | null;
	contactPhone?: string | null;
	metadata?: any;
}

export interface UpdateAgencyRequest {
	name?: string;
	code?: string;
	status?: AgencyStatus;
	contactName?: string | null;
	contactEmail?: string | null;
	contactPhone?: string | null;
	metadata?: any;
}

export interface GeneratedConfigCodeResponse {
	baseCode: string;
	code: string;
	isAvailable: boolean;
}

class AgenciesService extends APIService {
	async getAgencies(): Promise<AgenciesResponse> {
		const queryString = this.getQueryString();
		const response = await hrisApiClient.get<any>(`/api/agency${queryString}`);
		let payload = response.data;
		if (payload && typeof payload === "object" && "data" in payload) {
			payload = payload.data;
		}
		if (!payload) throw new Error("Failed to fetch agencies");
		return payload as AgenciesResponse;
	}

	async getAgencyById(id: string): Promise<Agency> {
		const response = await hrisApiClient.get<any>(`/api/agency/${id}`);
		let payload = response.data;
		if (payload && typeof payload === "object" && "data" in payload) {
			payload = payload.data;
		}
		if (!payload) throw new Error("Agency not found");
		return payload as Agency;
	}

	async createAgency(payload: CreateAgencyRequest): Promise<Agency> {
		const response = await hrisApiClient.post<any>("/api/agency", payload);
		let data = response.data;
		if (data && typeof data === "object" && "data" in data) {
			data = data.data;
		}
		if (!data) throw new Error("Failed to create agency");
		return data as Agency;
	}

	async updateAgency(id: string, payload: UpdateAgencyRequest): Promise<Agency> {
		const response = await hrisApiClient.patch<any>(`/api/agency/${id}`, payload);
		let data = response.data;
		if (data && typeof data === "object" && "data" in data) {
			data = data.data;
		}
		if (!data) throw new Error("Failed to update agency");
		return data as Agency;
	}

	async deleteAgency(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/agency/${id}`);
	}

	async importAgencies(file: File): Promise<any> {
		const formData = new FormData();
		formData.append("file", file);
		const response = await hrisApiClient.post<any>("/api/agency/import", formData, {
			timeoutMs: 300_000,
		});
		return response.data;
	}

	async getAgenciesWithParams(params: ApiQueryParams): Promise<AgenciesResponse> {
		return this.setParams(params).getAgencies();
	}

	async generateAgencyCode(name: string): Promise<GeneratedConfigCodeResponse> {
		const response = await hrisApiClient.get<any>(
			`/api/agency/generate-code?name=${encodeURIComponent(name)}`,
		);
		let data = response.data;
		if (data && typeof data === "object" && "data" in data) {
			data = data.data;
		}
		if (!data) throw new Error("Failed to generate agency code");
		return data as GeneratedConfigCodeResponse;
	}
}

const agenciesService = new AgenciesService();
export default agenciesService;
