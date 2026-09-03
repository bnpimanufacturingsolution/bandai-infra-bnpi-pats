import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import benefitTypesService, {
	type BenefitTypesResponse,
	type BenefitTypeResponse,
	type BenefitType,
	type CreateBenefitTypeRequest,
	type UpdateBenefitTypeRequest,
} from "../../services/benefit-types.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";

// Query keys structure
export const queryKeys = {
	benefitTypes: {
		all: ["benefitTypes"] as const,
		lists: () => [...queryKeys.benefitTypes.all, "list"] as const,
		list: (params?: ApiQueryParams) => [...queryKeys.benefitTypes.lists(), { params }] as const,
		details: () => [...queryKeys.benefitTypes.all, "detail"] as const,
		detail: (id: string) => [...queryKeys.benefitTypes.details(), id] as const,
	},
};

/**
 * Hook to fetch list of benefit types with filters
 */
export const useBenefitTypes = (params?: ApiQueryParams) => {
	return useQuery<BenefitTypesResponse>({
		queryKey: queryKeys.benefitTypes.list(params),
		queryFn: () => {
			return benefitTypesService
				.clearQueryParams()
				.select([
					"id",
					"code",
					"name",
					"description",
					"category",
					"payrollDirection",
					"reconciliationAction",
					"fixedAmount",
					"percentage",
					"minServiceMonths",
					"defaultInstallments",
					"payrollCycleDays",
					"requireTermsAgreement",
					"isDefault",
					"isTaxable",
					"isActive",
					"createdAt",
					"updatedAt",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getBenefitTypes();
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useBenefitType = (id: string) => {
	return useQuery<BenefitType>({
		queryKey: queryKeys.benefitTypes.detail(id),
		queryFn: async () => {
			const response = await benefitTypesService.getBenefitType(id);
			return response.data;
		},
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Mutation hooks
export const useCreateBenefitType = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateBenefitTypeRequest) => {
			return await benefitTypesService.createBenefitType(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.benefitTypes.all });
			sonnerToast.success("Benefit type created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create benefit type");
		},
	});
};

export const useUpdateBenefitType = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdateBenefitTypeRequest }) => {
			return await benefitTypesService.updateBenefitType(id, payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.benefitTypes.all });
			sonnerToast.success("Benefit type updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update benefit type");
		},
	});
};

export const useDeleteBenefitType = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			return await benefitTypesService.deleteBenefitType(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.benefitTypes.all });
			sonnerToast.success("Benefit type deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete benefit type");
		},
	});
};

export const useImportBenefitTypes = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (file: File) => {
			return await benefitTypesService.importBenefitTypes(file);
		},
    		onSuccess: (response: any) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.benefitTypes.all });
			const summary = response?.summary || response?.data?.summary || response?.data;
			const hasImportIssues =
				Number(summary?.failed || summary?.skipped || 0) > 0 ||
				(Array.isArray(summary?.errors) && summary.errors.length > 0);
			if (!hasImportIssues) {
				sonnerToast.success("Benefit types imported successfully");
			}
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to import benefit types");
			throw error;
		},
	});
};
