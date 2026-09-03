import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import benefitPlansService, {
	type BenefitPlan,
	type CreateBenefitPlanRequest,
	type UpdateBenefitPlanRequest,
	type BenefitPlansResponse,
} from "~/services/benefitPlans.service";

// Query keys for benefit plans
export const benefitPlansQueryKeys = {
	all: ["benefitPlans"] as const,
	lists: () => [...benefitPlansQueryKeys.all, "list"] as const,
	list: (document?: boolean) => [...benefitPlansQueryKeys.lists(), { document }] as const,
	details: () => [...benefitPlansQueryKeys.all, "detail"] as const,
	detail: (id: string) => [...benefitPlansQueryKeys.details(), id] as const,
};

/**
 * Hook to fetch all benefit plans
 * @param document - Include document information
 * @returns Query result with benefit plans data
 */
export const useBenefitPlans = (document: boolean = false) => {
	return useQuery<BenefitPlansResponse>({
		queryKey: benefitPlansQueryKeys.list(document),
		queryFn: () => benefitPlansService.getBenefitPlans(document),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch a single benefit plan by ID
 * @param id - Benefit plan ID
 * @returns Query result with benefit plan data
 */
export const useBenefitPlan = (id: string) => {
	return useQuery<BenefitPlan>({
		queryKey: benefitPlansQueryKeys.detail(id),
		queryFn: () => benefitPlansService.getBenefitPlanById(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to create a new benefit plan
 * @returns Mutation for creating benefit plans
 */
export const useCreateBenefitPlan = () => {
	const queryClient = useQueryClient();

	return useMutation<BenefitPlan, Error, CreateBenefitPlanRequest>({
		mutationFn: (payload) => benefitPlansService.createBenefitPlan(payload),
		onSuccess: (data) => {
			// Invalidate and refetch benefit plans list
			queryClient.invalidateQueries({ queryKey: benefitPlansQueryKeys.lists() });
			toast.success("Benefit plan created successfully");
			console.log("Benefit plan created:", data);
		},
		onError: (error) => {
			toast.error(error.message || "Failed to create benefit plan");
			console.error("Error creating benefit plan:", error);
		},
	});
};

/**
 * Hook to update an existing benefit plan
 * @returns Mutation for updating benefit plans
 */
export const useUpdateBenefitPlan = () => {
	const queryClient = useQueryClient();

	return useMutation<BenefitPlan, Error, { id: string; payload: UpdateBenefitPlanRequest }>({
		mutationFn: ({ id, payload }) => benefitPlansService.updateBenefitPlan(id, payload),
		onSuccess: (data, variables) => {
			// Invalidate and refetch benefit plans list
			queryClient.invalidateQueries({ queryKey: benefitPlansQueryKeys.lists() });
			// Update the specific benefit plan in cache
			queryClient.setQueryData(benefitPlansQueryKeys.detail(variables.id), data);
			toast.success("Benefit plan updated successfully");
			console.log("Benefit plan updated:", data);
		},
		onError: (error) => {
			toast.error(error.message || "Failed to update benefit plan");
			console.error("Error updating benefit plan:", error);
		},
	});
};

/**
 * Hook to delete a benefit plan
 * @returns Mutation for deleting benefit plans
 */
export const useDeleteBenefitPlan = () => {
	const queryClient = useQueryClient();

	return useMutation<{ id: string }, Error, string>({
		mutationFn: (id) => benefitPlansService.deleteBenefitPlan(id),
		onSuccess: (data, id) => {
			// Invalidate and refetch benefit plans list
			queryClient.invalidateQueries({ queryKey: benefitPlansQueryKeys.lists() });
			// Remove the specific benefit plan from cache
			queryClient.removeQueries({ queryKey: benefitPlansQueryKeys.detail(id) });
			toast.success("Benefit plan deleted successfully");
			console.log("Benefit plan deleted:", data);
		},
		onError: (error) => {
			toast.error(error.message || "Failed to delete benefit plan");
			console.error("Error deleting benefit plan:", error);
		},
	});
};

