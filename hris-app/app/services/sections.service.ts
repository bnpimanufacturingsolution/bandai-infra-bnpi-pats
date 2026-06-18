import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { GeneratedConfigCodeResponse } from "./departments.service";

export interface Section {
	id: string;
	organizationId: string;
	name: string;
	code: string;
	description?: string | null;
	departmentId: string;
	department?: { id: string; name: string; code?: string };
	headId?: string | null;
	head?: {
		id: string;
		employeeId?: string;
		person?: {
			firstName?: string;
			lastName?: string;
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
		};
	};
	scheduleId?: string | null;
	scheduleTemplate?: {
		id: string;
		name?: string | null;
		code?: string | null;
	} | null;
	isHr?: boolean | string | null;
	isActive: boolean;
	isDefault?: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CreateSectionRequest {
	organizationId: string;
	name: string;
	code: string;
	departmentId: string;
	description?: string;
	headId?: string | null;
	scheduleId?: string | null;
	isHr?: boolean;
	isActive?: boolean;
	isDefault?: boolean;
}

export interface UpdateSectionRequest {
	name?: string;
	code?: string;
	departmentId?: string;
	description?: string;
	headId?: string | null;
	scheduleId?: string | null;
	isHr?: boolean;
	isActive?: boolean;
	isDefault?: boolean;
}

export interface SectionResponse {
	success: boolean;
	message: string;
	data: {
		section: Section;
	};
}

export interface SectionsResponse {
	success: boolean;
	message: string;
	data?: {
		sections: Section[];
		count?: number;
		pagination?: {
			total: number;
			page: number;
			limit: number;
		};
	};
	sections?: Section[];
	count?: number;
	pagination?: {
		total: number;
		page: number;
		limit: number;
	};
}

class SectionsService extends APIService {
	async getSections(): Promise<SectionsResponse> {
		const response = await hrisApiClient.get<SectionsResponse>(
			`/api/section${this.getQueryString()}`,
		);
		const payload = response.data as any;
		return payload?.data || payload;
	}

	async getSection(id: string): Promise<Section> {
		const response = await hrisApiClient.get<any>(`/api/section/${id}${this.getQueryString()}`);
		let payload = response.data;
		if (payload && typeof payload === "object" && "data" in payload) payload = payload.data;
		const section = payload?.section || payload;
		if (!section?.id) throw new Error("Invalid section response");
		return section as Section;
	}

	async createSection(payload: CreateSectionRequest): Promise<SectionResponse> {
		const response = await hrisApiClient.post<SectionResponse>("/api/section", payload);
		if (!response.data) throw new Error("Invalid create section response");
		return response.data;
	}

	async updateSection(id: string, payload: UpdateSectionRequest): Promise<SectionResponse> {
		const response = await hrisApiClient.patch<SectionResponse>(`/api/section/${id}`, payload);
		if (!response.data) throw new Error("Invalid update section response");
		return response.data;
	}

	async deleteSection(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/section/${id}`);
	}

	async importSections(file: File): Promise<any> {
		const formData = new FormData();
		formData.append("file", file);
		const response = await hrisApiClient.post<any>("/api/section/import", formData, {
			headers: { "Content-Type": "multipart/form-data" },
		});
		return response.data;
	}

	async generateSectionCode(name: string): Promise<GeneratedConfigCodeResponse> {
		const response = await hrisApiClient.get<any>(
			`/api/section/generate-code?name=${encodeURIComponent(name)}`,
		);
		let data = response.data;
		if (data && typeof data === "object" && "data" in data) data = data.data;
		if (!data) throw new Error("Failed to generate section code");
		return data as GeneratedConfigCodeResponse;
	}
}

const sectionsService = new SectionsService();
export default sectionsService;
