import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import loanTypesService, {
	type LoanTypesResponse,
	type LoanType,
	type CreateLoanTypeRequest,
	type UpdateLoanTypeRequest,
} from "../../services/loan-types.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";

// Query keys structure
export const queryKeys = {
	loanTypes: {
		all: ["loanTypes"] as const,
		lists: () => [...queryKeys.loanTypes.all, "list"] as const,
		list: (params?: ApiQueryParams) => [...queryKeys.loanTypes.lists(), { params }] as const,
		details: () => [...queryKeys.loanTypes.all, "detail"] as const,
		detail: (id: string) => [...queryKeys.loanTypes.details(), id] as const,
	},
};

/**
 * Hook to fetch list of loan types with filters
 */
export const useLoanTypes = (params?: ApiQueryParams) => {
	return useQuery<LoanTypesResponse>({
		queryKey: queryKeys.loanTypes.list(params),
		queryFn: () => {
			return loanTypesService
				.clearQueryParams()
				.select([
					"id",
					"name",
					"description",
					"category",
					"maxAmount",
					"minAmount",
					"interestRate",
					"maxTermMonths",
					"minServiceMonths",
					"isActive",
					"createdAt",
					"updatedAt",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getLoanTypes();
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useLoanType = (id: string) => {
	return useQuery<LoanType>({
		queryKey: queryKeys.loanTypes.detail(id),
		queryFn: async () => {
			const response = await loanTypesService.getLoanType(id);
			return response.data.loanType;
		},
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Mutation hooks
export const useCreateLoanType = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateLoanTypeRequest) => {
			return await loanTypesService.createLoanType(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.loanTypes.all });
			sonnerToast.success("Loan type created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create loan type");
		},
	});
};

export const useUpdateLoanType = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdateLoanTypeRequest }) => {
			return await loanTypesService.updateLoanType(id, payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.loanTypes.all });
			sonnerToast.success("Loan type updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update loan type");
		},
	});
};

export const useDeleteLoanType = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			return await loanTypesService.deleteLoanType(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.loanTypes.all });
			sonnerToast.success("Loan type deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete loan type");
		},
	});
};

export const useImportLoanTypes = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (file: File) => {
			return await loanTypesService.importLoanTypes(file);
		},
		onSuccess: (response: any) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.loanTypes.all });
			const summary = response?.summary || response?.data?.summary || response?.data;
			const hasImportIssues =
				Number(summary?.failed || summary?.skipped || 0) > 0 ||
				(Array.isArray(summary?.errors) && summary.errors.length > 0);
			if (!hasImportIssues) {
				sonnerToast.success("Loan types imported successfully");
			}
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to import loan types");
			throw error;
		},
	});
};

