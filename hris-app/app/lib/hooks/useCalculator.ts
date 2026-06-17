import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import calculatorService, {
	type CalculatorsResponse,
	type Calculator,
	type CreateCalculatorRequest,
	type UpdateCalculatorRequest,
} from "../../services/calculator.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";

// Query keys structure
export const queryKeys = {
	calculators: {
		all: ["calculators"] as const,
		lists: () => [...queryKeys.calculators.all, "list"] as const,
		list: (params?: ApiQueryParams) => [...queryKeys.calculators.lists(), { params }] as const,
		details: () => [...queryKeys.calculators.all, "detail"] as const,
		detail: (id: string) => [...queryKeys.calculators.details(), id] as const,
	},
};

/**
 * Hook to fetch list of calculators with filters
 */
export const useCalculators = (params?: ApiQueryParams) => {
	return useQuery<CalculatorsResponse>({
		queryKey: queryKeys.calculators.list(params),
		queryFn: () => {
			return calculatorService
				.clearQueryParams()
				.select([
					"id",
					"code",
					"name",
					"description",
					"type",
					"taxRates",
					"sssRates",
					"philHealthRates",
					"pagibigRates",
					"overtimeRates",
					"nightDiffRate",
					"isActive",
					"isDefault",
					"createdAt",
					"updatedAt",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getCalculators();
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch a single calculator by ID or code
 */
export const useCalculator = (id: string, enabled: boolean = true) => {
	return useQuery<Calculator>({
		queryKey: queryKeys.calculators.detail(id),
		queryFn: () => calculatorService.getCalculatorById(id),
		enabled: !!id && enabled,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Mutation hooks
export const useCreateCalculator = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateCalculatorRequest) => {
			return await calculatorService.createCalculator(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.calculators.all });
			sonnerToast.success("Calculator created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create calculator");
		},
	});
};

export const useUpdateCalculator = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdateCalculatorRequest }) => {
			return await calculatorService.updateCalculator(id, payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.calculators.all });
			sonnerToast.success("Calculator updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update calculator");
		},
	});
};

export const useDeleteCalculator = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			return await calculatorService.deleteCalculator(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.calculators.all });
			sonnerToast.success("Calculator deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete calculator");
		},
	});
};
