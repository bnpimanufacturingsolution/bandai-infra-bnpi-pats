import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";
import type {
	BoardingTemplate,
	CreateBoardingTemplate,
	UpdateBoardingTemplate,
} from "~/zod/boarding-template";
import type { CreateTemplateItem } from "~/zod/template-item";
import templateItemService from "./template-item.service";

export interface BoardingTemplateResponse {
	boardingTemplate: BoardingTemplate;
}

export interface BoardingTemplatesResponse {
	boardingTemplates: BoardingTemplate[];
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

// API Response wrappers (what the API actually returns)
// response.data contains the actual data directly
interface BoardingTemplateAPIResponse extends BoardingTemplate {}

interface BoardingTemplatesAPIResponse extends BoardingTemplatesResponse {}

export type { BoardingTemplate, CreateBoardingTemplate, UpdateBoardingTemplate };

class BoardingTemplateService extends APIService {
	async getBoardingTemplates(document: boolean = true): Promise<BoardingTemplatesResponse> {
		const queryString = this.getQueryString();
		const response = await hrisApiClient.get<BoardingTemplatesAPIResponse>(
			`/api/boardingTemplate${queryString}`,
		);

		if (!response?.data) throw new Error("Invalid boarding templates response");

		return response.data;
	}

	async getBoardingTemplateById(
		id: string,
		fields?: string[],
	): Promise<BoardingTemplateResponse> {
		const queryString = fields && fields.length > 0 ? `?fields=${fields.join(",")}` : "";
		const response = await hrisApiClient.get<BoardingTemplateAPIResponse>(
			`/api/boardingTemplate/${id}${queryString}`,
		);
		if (!response?.data) throw new Error("Invalid boarding template response");
		return { boardingTemplate: response.data };
	}

	async createBoardingTemplate(
		payload: CreateBoardingTemplate,
	): Promise<BoardingTemplateResponse> {
		const response = await hrisApiClient.post<BoardingTemplateAPIResponse>(
			"/api/boardingTemplate",
			payload,
		);
		if (!response?.data) throw new Error("Invalid create boarding template response");
		return { boardingTemplate: response.data };
	}

	async updateBoardingTemplate(
		id: string,
		payload: UpdateBoardingTemplate,
	): Promise<BoardingTemplateResponse> {
		const response = await hrisApiClient.patch<BoardingTemplateAPIResponse>(
			`/api/boardingTemplate/${id}`,
			payload,
		);
		if (!response?.data) throw new Error("Invalid update boarding template response");
		return { boardingTemplate: response.data };
	}

	async deleteBoardingTemplate(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/boardingTemplate/${id}`);
	}

	/**
	 * Helper method to create template items for a boarding template
	 * Automatically sets the organizationId and templateId from the boarding template
	 */
	async createTemplateItemsForTemplate(
		boardingTemplateId: string,
		organizationId: string,
		items: Omit<CreateTemplateItem, "organizationId" | "templateId">[],
	) {
		// First get the boarding template to get its organizationId

		// Create template items with the correct organizationId and templateId
		const templateItemsWithOrgId: CreateTemplateItem[] = items.map((item) => ({
			...item,
			organizationId: organizationId,
			templateId: boardingTemplateId,
		}));

		// Use bulk create if multiple items, single create if just one
		if (templateItemsWithOrgId.length > 1) {
			return templateItemService.bulkCreateTemplateItems(templateItemsWithOrgId);
		} else if (templateItemsWithOrgId.length === 1) {
			return templateItemService.createTemplateItem(templateItemsWithOrgId[0]);
		}

		throw new Error("No template items provided");
	}
}

const boardingTemplateService = new BoardingTemplateService();
export default boardingTemplateService;

