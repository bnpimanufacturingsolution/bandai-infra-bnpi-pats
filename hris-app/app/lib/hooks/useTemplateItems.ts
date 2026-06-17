import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import templateItemService, {
	type TemplateItem,
	type CreateTemplateItem,
	type UpdateTemplateItem,
} from "~/services/template-item.service";
import type { ApiQueryParams } from "~/services/api-service";

interface GetTemplateItemsParams {
	templateId: string;
	page?: number;
	limit?: number;
}

// Fetch all template items for a template
export const useTemplateItems = (params: GetTemplateItemsParams) => {
	return useQuery({
		queryKey: ["templateItems", params.templateId, params],
		queryFn: () => {
			return templateItemService
				.select([
					"id",
					"organizationId",
					"templateId",
					"title",
					"description",
					"category",
					"dueOffset",
					"priority",
					"order",
					"metadata",
					"isDeleted",
					"createdAt",
					"updatedAt",
				])
				.filter({ templateId: params.templateId })
				.sort("order", "asc")
				.paginate(params.page || 1, params.limit || 100)
				.setParams({ document: true, count: true })
				.getTemplateItems();
		},
		enabled: !!params.templateId,
	});
};

// Fetch single template item by ID
export const useTemplateItem = (id: string | undefined, enabled = true) => {
	return useQuery({
		queryKey: ["templateItem", id],
		queryFn: () => {
			if (!id) throw new Error("Template item ID is required");
			return templateItemService.getTemplateItemById(id);
		},
		enabled: enabled && !!id,
	});
};

// Create template item
export const useCreateTemplateItem = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: CreateTemplateItem) => {
			return templateItemService.createTemplateItem(data);
		},
		onSuccess: (response) => {
			queryClient.invalidateQueries({
				queryKey: ["templateItems", response.data.templateItem.templateId],
			});
		},
	});
};

// Update template item
export const useUpdateTemplateItem = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateTemplateItem }) => {
			return templateItemService.updateTemplateItem(id, data);
		},
		onSuccess: (response, variables) => {
			queryClient.invalidateQueries({
				queryKey: ["templateItems", response.data.templateItem.templateId],
			});
			queryClient.invalidateQueries({
				queryKey: ["templateItem", variables.id],
			});
		},
	});
};

// Bulk update template items (useful for reordering)
export const useBulkUpdateTemplateItems = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			templateId,
			items,
		}: {
			templateId: string;
			items: Array<{ id: string; order: number }>;
		}) => {
			// Update each item individually
			const updatePromises = items.map((item) =>
				templateItemService.updateTemplateItem(item.id, { order: item.order }),
			);
			await Promise.all(updatePromises);
			return { templateId };
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({
				queryKey: ["templateItems", data.templateId],
			});
		},
	});
};

// Delete template item
export const useDeleteTemplateItem = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, templateId }: { id: string; templateId: string }) => {
			return templateItemService.deleteTemplateItem(id).then(() => ({ templateId }));
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({
				queryKey: ["templateItems", data.templateId],
			});
		},
	});
};

// Bulk create template items
export const useBulkCreateTemplateItems = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: CreateTemplateItem[]) => {
			return templateItemService.bulkCreateTemplateItems(data);
		},
		onSuccess: (response) => {
			// Invalidate queries for all affected templates
			if (response.data.templateItems.length > 0) {
				const templateId = response.data.templateItems[0].templateId;
				queryClient.invalidateQueries({
					queryKey: ["templateItems", templateId],
				});
			}
		},
	});
};
