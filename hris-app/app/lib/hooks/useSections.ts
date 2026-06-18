import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast as sonnerToast } from "sonner";
import sectionsService, {
	type CreateSectionRequest,
	type Section,
	type SectionsResponse,
	type UpdateSectionRequest,
} from "../../services/sections.service";
import type { ApiQueryParams } from "~/services/api-service";

export const sectionQueryKeys = {
	sections: {
		all: ["sections"] as const,
		lists: () => [...sectionQueryKeys.sections.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...sectionQueryKeys.sections.lists(), { params }] as const,
		details: () => [...sectionQueryKeys.sections.all, "detail"] as const,
		detail: (id: string) => [...sectionQueryKeys.sections.details(), id] as const,
	},
};

export const useSections = (
	params?: ApiQueryParams,
	options?: {
		enabled?: boolean;
	},
) => {
	return useQuery<SectionsResponse>({
		queryKey: sectionQueryKeys.sections.list(params),
		queryFn: () =>
			sectionsService
				.clearQueryParams()
				.select([
					"id",
					"name",
					"code",
					"description",
					"departmentId",
					"department.id",
					"department.name",
					"department.code",
					"headId",
					"head.id",
					"head.employeeId",
					"head.person.personalInfo",
					"scheduleId",
					"scheduleTemplate.id",
					"scheduleTemplate.name",
					"scheduleTemplate.code",
					"isHr",
					"isActive",
					"isDefault",
					"createdAt",
					"updatedAt",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getSections(),
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000,
	});
};

export const useSection = (id: string) => {
	return useQuery<Section>({
		queryKey: sectionQueryKeys.sections.detail(id),
		queryFn: () =>
			sectionsService
				.clearQueryParams()
				.select([
					"id",
					"name",
					"code",
					"description",
					"departmentId",
					"department.id",
					"department.name",
					"headId",
					"head.id",
					"head.employeeId",
					"head.person.personalInfo",
					"scheduleId",
					"scheduleTemplate.id",
					"scheduleTemplate.name",
					"scheduleTemplate.code",
					"isHr",
					"isActive",
					"isDefault",
				])
				.getSection(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});
};

export const useCreateSection = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: CreateSectionRequest) => sectionsService.createSection(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: sectionQueryKeys.sections.all });
			sonnerToast.success("Section created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create section");
		},
	});
};

export const useUpdateSection = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: UpdateSectionRequest }) =>
			sectionsService.updateSection(id, payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: sectionQueryKeys.sections.all });
			sonnerToast.success("Section updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update section");
		},
	});
};

export const useDeleteSection = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => sectionsService.deleteSection(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: sectionQueryKeys.sections.all });
			sonnerToast.success("Section deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete section");
		},
	});
};

export const useImportSections = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (file: File) => sectionsService.importSections(file),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: sectionQueryKeys.sections.all });
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to import sections");
		},
	});
};
