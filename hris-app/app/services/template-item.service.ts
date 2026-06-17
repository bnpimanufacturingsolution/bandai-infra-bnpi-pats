import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";
import type { TemplateItem, CreateTemplateItem, UpdateTemplateItem } from "~/zod/template-item";

export interface TemplateItemResponse {
	success: boolean;
	message: string;
	data: {
		templateItem: TemplateItem;
	};
}

export interface TemplateItemsResponse {
	success: boolean;
	message: string;
	data: {
		templateItems: TemplateItem[];
		pagination?: {
			total: number;
			page: number;
			limit: number;
		};
	};
}

export interface BulkTemplateItemsResponse {
	success: boolean;
	message: string;
	data: {
		templateItems: TemplateItem[];
		count: number;
	};
}

export type { TemplateItem, CreateTemplateItem, UpdateTemplateItem };

class TemplateItemService extends APIService {
	async getTemplateItems(document: boolean = true): Promise<TemplateItemsResponse> {
		const queryString = this.document(document).getQueryString();
		const response = await hrisApiClient.get<TemplateItemsResponse>(
			`/api/templateItem${queryString}`,
		);
		if (!response?.data) throw new Error("Invalid template items response");
		return response.data;
	}

	async getTemplateItemById(id: string): Promise<TemplateItemResponse> {
		const response = await hrisApiClient.get<TemplateItemResponse>(`/api/templateItem/${id}`);
		if (!response?.data) throw new Error("Invalid template item response");
		return response.data;
	}

	async createTemplateItem(payload: CreateTemplateItem): Promise<TemplateItemResponse> {
		const response = await hrisApiClient.post<TemplateItemResponse>(
			"/api/templateItem",
			payload,
		);
		if (!response?.data) throw new Error("Invalid create template item response");
		return response.data;
	}

	async updateTemplateItem(
		id: string,
		payload: UpdateTemplateItem,
	): Promise<TemplateItemResponse> {
		const response = await hrisApiClient.patch<TemplateItemResponse>(
			`/api/templateItem/${id}`,
			payload,
		);
		if (!response?.data) throw new Error("Invalid update template item response");
		return response.data;
	}

	async deleteTemplateItem(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/templateItem/${id}`);
	}

	async bulkCreateTemplateItems(
		payload: CreateTemplateItem[],
	): Promise<BulkTemplateItemsResponse> {
		const response = await hrisApiClient.post<BulkTemplateItemsResponse>(
			"/api/templateItem/bulk",
			payload,
		);
		if (!response?.data) throw new Error("Invalid bulk create template items response");
		return response.data;
	}
}

const templateItemService = new TemplateItemService();
export default templateItemService;

