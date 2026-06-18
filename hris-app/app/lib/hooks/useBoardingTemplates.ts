import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import boardingTemplateService, {
	type BoardingTemplate,
	type CreateBoardingTemplate,
	type UpdateBoardingTemplate,
} from "~/services/boarding-template.service";
import type { CreateTemplateItem } from "~/services/template-item.service";
import type { ApiQueryParams } from "~/services/api-service";

interface GetBoardingTemplatesParams {
	page?: number;
	limit?: number;
	query?: string;
	type?: string;
	isActive?: boolean;
}

// Fetch all boarding templates
export const useBoardingTemplates = (params: GetBoardingTemplatesParams = {}) => {
	return useQuery({
		queryKey: ["boardingTemplates", params],
		queryFn: async () => {
			const filters: Record<string, any> = {};
			if (params.type) filters.type = params.type;
			if (params.isActive !== undefined) filters.isActive = params.isActive;

			const result = await boardingTemplateService
				.select([
					"id",
					"organizationId",
					"name",
					"description",
					"type",
					"role",
					"metadata",
					"isDefault",
					"isActive",
					"isDeleted",
					"createdAt",
					"updatedAt",
				])
				.search(params.query)
				.paginate(params.page || 1, params.limit || 10)
				.filter(Object.keys(filters).length > 0 ? filters : undefined)
				.setParams({ document: true, count: true, pagination: true })
				.getBoardingTemplates();

			return result;
		},
	});
};

// Fetch single boarding template by ID
export const useBoardingTemplate = (
	id: string | undefined,
	options?: { enabled?: boolean; fields?: string[] },
) => {
	const enabled = options?.enabled ?? true;
	const fields = options?.fields;

	return useQuery({
		queryKey: ["boardingTemplate", id, fields],
		queryFn: () => {
			if (!id) throw new Error("Template ID is required");
			return boardingTemplateService.getBoardingTemplateById(id, fields);
		},
		enabled: enabled && !!id,
	});
};

// Create boarding template
export const useCreateBoardingTemplate = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: CreateBoardingTemplate) => {
			return boardingTemplateService.createBoardingTemplate(data);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["boardingTemplates"] });
		},
	});
};

// Update boarding template
export const useUpdateBoardingTemplate = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateBoardingTemplate }) => {
			return boardingTemplateService.updateBoardingTemplate(id, data);
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["boardingTemplates"] });
			queryClient.invalidateQueries({ queryKey: ["boardingTemplate", variables.id] });
		},
	});
};

// Delete boarding template
export const useDeleteBoardingTemplate = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => {
			return boardingTemplateService.deleteBoardingTemplate(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["boardingTemplates"] });
		},
	});
};

// Create boarding template with template items
export const useCreateBoardingTemplateWithItems = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			template,
			items,
		}: {
			template: CreateBoardingTemplate;
			items: Omit<CreateTemplateItem, "organizationId" | "templateId">[];
		}) => {
			// First create the boarding template
			const templateResponse = await boardingTemplateService.createBoardingTemplate(template);
			const createdTemplate = templateResponse.boardingTemplate;

			// If no items provided, return just the template
			if (!items || items.length === 0) {
				return {
					template: createdTemplate,
					templateItems: [],
				};
			}

			// Create template items using the boarding template service helper
			const itemsResponse = await boardingTemplateService.createTemplateItemsForTemplate(
				createdTemplate.id,
				createdTemplate.organizationId,
				items,
			);

			// Handle both single and bulk create responses
			const templateItems =
				"templateItems" in itemsResponse.data
					? itemsResponse.data.templateItems
					: [itemsResponse.data.templateItem];

			return {
				template: createdTemplate,
				templateItems,
			};
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["boardingTemplates"] });
			queryClient.invalidateQueries({ queryKey: ["boardingTemplate", data.template.id] });
			queryClient.invalidateQueries({ queryKey: ["templateItems", data.template.id] });
		},
	});
};
