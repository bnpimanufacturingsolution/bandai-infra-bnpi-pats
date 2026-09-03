import {
	useQuery,
	useMutation,
	useQueryClient,
	type UseQueryResult,
	type UseMutationResult,
} from "@tanstack/react-query";
import terminationService, { type TerminationsResponse } from "../../services/termination.service";
import type { ApiQueryParams } from "../../services/api-service";
import type {
	Termination,
	CreateTermination,
	UpdateTermination,
	TerminationWithRelations,
	HRDirectorApproval,
	LegalApproval,
	CompleteTermination,
} from "../../zod/termination.zod";

// ============================================================================
// QUERY KEYS
// ============================================================================

export const terminationKeys = {
	all: ["terminations"] as const,
	lists: () => [...terminationKeys.all, "list"] as const,
	list: (filters: Record<string, unknown>) => [...terminationKeys.lists(), filters] as const,
	details: () => [...terminationKeys.all, "detail"] as const,
	detail: (id: string) => [...terminationKeys.details(), id] as const,
};

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Hook to fetch all terminations with optional filtering
 */
export function useTerminations(
	params?: ApiQueryParams & {
		status?: string;
		terminationType?: string;
		employeeId?: string;
	},
): UseQueryResult<TerminationsResponse> {
	return useQuery({
		queryKey: terminationKeys.list(params || {}),
		queryFn: () =>
			terminationService
				.clearQueryParams()
				.setParams(params || {})
				.getTerminations(),
	});
}

/**
 * Hook to fetch a single termination by ID
 */
export function useTermination(
	terminationId: string | undefined,
): UseQueryResult<TerminationWithRelations> {
	return useQuery({
		queryKey: terminationKeys.detail(terminationId || ""),
		queryFn: () => terminationService.getTerminationById(terminationId!),
		enabled: !!terminationId,
	});
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Hook to create a new termination
 */
export function useCreateTermination(): UseMutationResult<Termination, Error, CreateTermination> {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: CreateTermination) => terminationService.createTermination(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: terminationKeys.lists() });
		},
	});
}

/**
 * Hook to submit a termination for approval
 */
export function useSubmitTermination(): UseMutationResult<Termination, Error, string> {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (terminationId: string) => terminationService.submitTermination(terminationId),
		onSuccess: (_, terminationId) => {
			queryClient.invalidateQueries({ queryKey: terminationKeys.lists() });
			queryClient.invalidateQueries({
				queryKey: terminationKeys.detail(terminationId),
			});
		},
	});
}

/**
 * Hook to update a termination
 */
export function useUpdateTermination(): UseMutationResult<
	Termination,
	Error,
	{ terminationId: string; data: UpdateTermination }
> {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ terminationId, data }) =>
			terminationService.updateTermination(terminationId, data),
		onSuccess: (_, { terminationId }) => {
			queryClient.invalidateQueries({ queryKey: terminationKeys.lists() });
			queryClient.invalidateQueries({
				queryKey: terminationKeys.detail(terminationId),
			});
		},
	});
}

/**
 * Hook to delete a termination
 */
export function useDeleteTermination(): UseMutationResult<{ id: string }, Error, string> {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (terminationId: string) => terminationService.deleteTermination(terminationId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: terminationKeys.lists() });
		},
	});
}

/**
 * Hook for HR Director approval action
 */
export function useHRDirectorApproval(): UseMutationResult<
	Termination,
	Error,
	{ terminationId: string; data: HRDirectorApproval }
> {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ terminationId, data }) =>
			terminationService.hrDirectorApproval(terminationId, data),
		onSuccess: (_, { terminationId }) => {
			queryClient.invalidateQueries({ queryKey: terminationKeys.lists() });
			queryClient.invalidateQueries({
				queryKey: terminationKeys.detail(terminationId),
			});
		},
	});
}

/**
 * Hook for Legal approval action
 */
export function useLegalApproval(): UseMutationResult<
	Termination,
	Error,
	{ terminationId: string; data: LegalApproval }
> {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ terminationId, data }) =>
			terminationService.legalApproval(terminationId, data),
		onSuccess: (_, { terminationId }) => {
			queryClient.invalidateQueries({ queryKey: terminationKeys.lists() });
			queryClient.invalidateQueries({
				queryKey: terminationKeys.detail(terminationId),
			});
		},
	});
}

/**
 * Hook to start processing/offboarding
 */
export function useStartProcessing(): UseMutationResult<Termination, Error, string> {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (terminationId: string) => terminationService.startProcessing(terminationId),
		onSuccess: (_, terminationId) => {
			queryClient.invalidateQueries({ queryKey: terminationKeys.lists() });
			queryClient.invalidateQueries({
				queryKey: terminationKeys.detail(terminationId),
			});
		},
	});
}

/**
 * Hook to complete termination
 */
export function useCompleteTermination(): UseMutationResult<
	Termination,
	Error,
	{ terminationId: string; data?: CompleteTermination }
> {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ terminationId, data }) =>
			terminationService.completeTermination(terminationId, data),
		onSuccess: (_, { terminationId }) => {
			queryClient.invalidateQueries({ queryKey: terminationKeys.lists() });
			queryClient.invalidateQueries({
				queryKey: terminationKeys.detail(terminationId),
			});
		},
	});
}
