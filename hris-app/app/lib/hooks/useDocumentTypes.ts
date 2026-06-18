import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import documentTypesService, {
	type CreateDocumentTypeRequest,
	type DocumentType,
	type DocumentTypesResponse,
	type DocumentTypeQueryParams,
	type UpdateDocumentTypeRequest,
} from "~/services/document-types.service";

export const documentTypeQueryKeys = {
	all: ["document-types"] as const,
	lists: () => [...documentTypeQueryKeys.all, "list"] as const,
	list: (params?: DocumentTypeQueryParams) => [...documentTypeQueryKeys.lists(), params] as const,
	details: () => [...documentTypeQueryKeys.all, "detail"] as const,
	detail: (id: string) => [...documentTypeQueryKeys.details(), id] as const,
};

export const useDocumentTypes = (
	params?: DocumentTypeQueryParams,
	options?: { enabled?: boolean },
) =>
	useQuery<DocumentTypesResponse>({
		queryKey: documentTypeQueryKeys.list(params),
		queryFn: () =>
			documentTypesService
				.clearQueryParams()
				.select([
					"id",
					"organizationId",
					"code",
					"name",
					"category",
					"uploadBy",
					"isRequired",
					"isEmployeeVisible",
					"isActive",
					"displayOrder",
					"fields",
					"metadata",
					"createdAt",
					"updatedAt",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 50)
				.sort(params?.sort || "displayOrder", params?.order || "asc")
				.setParams({ ...params, document: true, count: true, pagination: true })
				.getDocumentTypes(),
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000,
	});

export const useDocumentType = (id: string) =>
	useQuery<DocumentType>({
		queryKey: documentTypeQueryKeys.detail(id),
		queryFn: () => documentTypesService.getDocumentTypeById(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});

export const useCreateDocumentType = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: CreateDocumentTypeRequest) =>
			documentTypesService.createDocumentType(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: documentTypeQueryKeys.all });
			toast.success("Document type created successfully");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to create document type");
		},
	});
};

export const useUpdateDocumentType = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: UpdateDocumentTypeRequest }) =>
			documentTypesService.updateDocumentType(id, payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: documentTypeQueryKeys.all });
			toast.success("Document type updated successfully");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to update document type");
		},
	});
};

export const useDeleteDocumentType = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => documentTypesService.deleteDocumentType(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: documentTypeQueryKeys.all });
			toast.success("Document type archived successfully");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to archive document type");
		},
	});
};
