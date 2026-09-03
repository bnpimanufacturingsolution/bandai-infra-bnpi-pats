import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo } from "react";

import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";
import { queryClient } from "~/lib/query-client";
import type { Guide, CreateGuide, UpdateGuide, Section, Page, Block } from "~/zod/guide.zod";
import type { GuideResponse, GuidesResponse } from "~/services/guide.service";
import guideService from "~/services/guide.service";

/**
 * Hook to fetch all guides with optional filtering, pagination, and sorting
 * @param params - Query parameters (query, page, limit, sort, order, fields)
 * @returns Query result with guides data
 */
export const useGuides = (params?: ApiQueryParams) => {
	return useQuery<GuidesResponse>({
		queryKey: ["guides", params],
		queryFn: () => {
			const service = guideService.clearQueryParams();

			// Only use select if fields is not provided in params
			if (!params?.fields) {
				service.select([
					"id",
					"title",
					"description",
					"published",
					"author",
					"version",
					"isDeleted",
					"createdAt",
					"updatedAt",
				]);
			}

			return service
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: "true" })
				.getGuides();
		},
		staleTime: 5 * 60 * 1000,
	});
};

/**
 * Hook to fetch a single guide by ID
 * @param id - Guide ID
 * @param params - Query parameters (fields)
 * @returns Query result with guide data
 */
export const useGuide = (id: string, params?: ApiQueryParams) => {
	return useQuery<GuideResponse, Error, Guide>({
		queryKey: ["guide-by-id", id, params],
		queryFn: () => {
			const service = guideService.clearQueryParams();
			if (params?.fields) {
				service.setParams({ fields: params.fields });
			}
			return service.getGuide(id);
		},
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
		select: (data) => data.data.guide,
	});
};

/**
 * Hook to fetch a guide with all its sections and nested content
 * @param id - Guide ID
 * @param params - Query parameters
 * @returns Query result with guide data including sections
 */
export const useGuideWithSections = (id: string, params?: ApiQueryParams) => {
	console.log("useGuideWithSections called with id:", id);

	return useQuery<GuideResponse, Error, Guide>({
		queryKey: ["guide-by-id", id, "sections", params],
		queryFn: () => {
			console.log("Fetching guide with sections for id:", id);
			return guideService.getGuideWithSections(id);
		},
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
		select: (data) => {
			console.log("Raw API response:", data);
			console.log("Selected guide data:", data.data.guide);
			return data.data.guide;
		},
	});
};

/**
 * Hook to create a new guide
 * @returns Mutation result for creating a guide
 */
export const useCreateGuide = () => {
	return useMutation({
		mutationFn: async (payload: CreateGuide) => {
			return await guideService.createGuide(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["guides"] });
			sonnerToast.success("Guide created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error.errors?.[0]?.message || error.message || "Failed to create guide");
		},
	});
};

/**
 * Hook to update an existing guide
 * @returns Mutation result for updating a guide
 */
export const useUpdateGuide = () => {
	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdateGuide }) => {
			return await guideService.updateGuide(id, payload);
		},
		onSuccess: (data, variables) => {
			// Invalidate list + specific detail view
			queryClient.invalidateQueries({ queryKey: ["guides"] });
			queryClient.invalidateQueries({
				queryKey: ["guide-by-id", variables.id],
			});
			// Optionally set updated data immediately for instant UI update
			queryClient.setQueryData(["guide-by-id", variables.id], data);
			sonnerToast.success("Guide updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error.errors?.[0]?.message || error.message || "Failed to update guide");
		},
	});
};

/**
 * Hook to delete a guide (hard delete)
 * @returns Mutation result for deleting a guide
 */
export const useDeleteGuide = () => {
	return useMutation({
		mutationFn: async (id: string) => {
			return await guideService.deleteGuide(id);
		},
		onSuccess: (_data, id) => {
			queryClient.invalidateQueries({ queryKey: ["guides"] });
			queryClient.removeQueries({ queryKey: ["guide-by-id", id] });
			sonnerToast.success("Guide deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error.errors?.[0]?.message || error.message || "Failed to delete guide");
		},
	});
};

/**
 * Hook to soft delete a guide (sets isDeleted to true)
 * @returns Mutation result for soft deleting a guide
 */
export const useSoftDeleteGuide = () => {
	return useMutation({
		mutationFn: async (id: string) => {
			return await guideService.softDeleteGuide(id);
		},
		onSuccess: (_data, id) => {
			queryClient.invalidateQueries({ queryKey: ["guides"] });
			queryClient.invalidateQueries({ queryKey: ["guide-by-id", id] });
			sonnerToast.success("Guide moved to trash");
		},
		onError: (error: any) => {
			sonnerToast.error(error.errors?.[0]?.message || error.message || "Failed to delete guide");
		},
	});
};

/**
 * Hook to toggle guide publish status
 * @returns Mutation result for publishing/unpublishing a guide
 */
export const useTogglePublishGuide = () => {
	return useMutation({
		mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
			return await guideService.togglePublishGuide(id, published);
		},
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["guides"] });
			queryClient.invalidateQueries({ queryKey: ["guide-by-id", variables.id] });
			queryClient.setQueryData(["guide-by-id", variables.id], data);
			sonnerToast.success(
				variables.published
					? "Guide published successfully"
					: "Guide unpublished successfully",
			);
		},
		onError: (error: any) => {
			sonnerToast.error(error.errors?.[0]?.message || error.message || "Failed to update guide status");
		},
	});
};

/**
 * Helper hook to get all sections from a guide
 * @param guide - Guide object
 * @returns Sorted array of sections
 */
export const useGuideSections = (guide: Guide | undefined): Section[] => {
	return useMemo(() => {
		if (!guide || !guide.sections) return [];
		// Sort sections by order if available
		return [...guide.sections].sort((a, b) => (a.order || 0) - (b.order || 0));
	}, [guide]);
};

/**
 * Helper hook to get all pages from a specific section
 * @param section - Section object
 * @returns Sorted array of pages
 */
export const useSectionPages = (section: Section | undefined): Page[] => {
	return useMemo(() => {
		if (!section || !section.pages) return [];
		// Sort pages by order if available
		return [...section.pages].sort((a, b) => (a.order || 0) - (b.order || 0));
	}, [section]);
};

/**
 * Helper hook to find a specific section by ID
 * @param guide - Guide object
 * @param sectionId - Section ID to find
 * @returns Section object or undefined
 */
export const useGuideSection = (
	guide: Guide | undefined,
	sectionId: string,
): Section | undefined => {
	return useMemo(() => {
		if (!guide || !guide.sections) return undefined;
		return guide.sections.find((section) => section.id === sectionId);
	}, [guide, sectionId]);
};

/**
 * Helper hook to find a specific page within a section
 * @param section - Section object
 * @param pageId - Page ID to find
 * @returns Page object or undefined
 */
export const useSectionPage = (section: Section | undefined, pageId: string): Page | undefined => {
	return useMemo(() => {
		if (!section || !section.pages) return undefined;
		return section.pages.find((page) => page.id === pageId);
	}, [section, pageId]);
};

/**
 * Helper hook to get total page count across all sections
 * @param guide - Guide object
 * @returns Total number of pages
 */
export const useGuidePageCount = (guide: Guide | undefined): number => {
	return useMemo(() => {
		if (!guide || !guide.sections) return 0;
		return guide.sections.reduce((total, section) => total + (section.pages?.length || 0), 0);
	}, [guide]);
};

/**
 * Helper hook to get total block count across all pages
 * @param guide - Guide object
 * @returns Total number of blocks
 */
export const useGuideBlockCount = (guide: Guide | undefined): number => {
	return useMemo(() => {
		if (!guide || !guide.sections) return 0;
		return guide.sections.reduce((total, section) => {
			const sectionBlocks =
				section.pages?.reduce(
					(pageTotal, page) => pageTotal + (page.blocks?.length || 0),
					0,
				) || 0;
			return total + sectionBlocks;
		}, 0);
	}, [guide]);
};

/**
 * Helper hook to check if a guide is empty (no content)
 * @param guide - Guide object
 * @returns Boolean indicating if guide is empty
 */
export const useIsGuideEmpty = (guide: Guide | undefined): boolean => {
	return useMemo(() => {
		if (!guide) return true;
		return !guide.sections || guide.sections.length === 0;
	}, [guide]);
};
