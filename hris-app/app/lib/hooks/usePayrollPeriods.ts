import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import payrollPeriodsService, {
	type PayrollPeriodsResponse,
	type PayrollPeriod,
	type CreatePayrollPeriodRequest,
	type UpdatePayrollPeriodRequest,
	type PayrollGenerationProgress,
	type PayrollGenerationStartResponse,
	type TimesheetPayrollPreviewParams,
	type TimesheetPayrollPreviewResponse,
	type PayrollCycleConfig,
	type UpdatePayrollCycleConfigRequest,
	type BulkGeneratePayrollPeriodsRequest,
	type BulkGeneratePayrollPeriodsResponse,
	type BulkAdjustPayrollPeriodsRequest,
	type BulkAdjustPayrollPeriodsResponse,
} from "../../services/payroll-periods.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";
import { employeePayrollQueryKeys } from "./useEmployeePayroll";

// Query keys structure
export const payrollPeriodsQueryKeys = {
	payrollPeriods: {
		all: ["payrollPeriods"] as const,
		lists: () => [...payrollPeriodsQueryKeys.payrollPeriods.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...payrollPeriodsQueryKeys.payrollPeriods.lists(), { params }] as const,
		details: () => [...payrollPeriodsQueryKeys.payrollPeriods.all, "detail"] as const,
		detail: (id: string) => [...payrollPeriodsQueryKeys.payrollPeriods.details(), id] as const,
		cycleConfig: () => [...payrollPeriodsQueryKeys.payrollPeriods.all, "cycle-config"] as const,
	},
};

/**
 * Hook to fetch list of payroll periods with filters
 * @param params Optional query parameters for filtering, sorting, pagination
 * @returns React Query result with payroll periods data
 */
export const usePayrollPeriods = (
	params?: ApiQueryParams,
	enabled: boolean = true,
) => {
	return useQuery<PayrollPeriodsResponse>({
		queryKey: payrollPeriodsQueryKeys.payrollPeriods.list(params),
		queryFn: () => {
			return payrollPeriodsService
				.clearQueryParams()
				.select([
					"id",
					"name",
					"code",
					"startDate",
					"endDate",
					"payDate",
					"calculatorId",
					"status",
					"cutoffDay",
					"notes",
					"generationMetadata",
					"processedBy",
					"payFrequency",
					"periodNumber",
					"processedAt",
					"isDeleted",
					"organizationId",
					"createdAt",
					"updatedAt",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort || "createdAt", params?.order || "desc")
				.setParams({ ...params, document: true })
				.getPayrollPeriods();
		},
		enabled,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch a single payroll period by ID
 * @param id Payroll period ID
 * @returns React Query result with payroll period data
 */
export const usePayrollPeriod = (id: string) => {
	return useQuery<PayrollPeriod>({
		queryKey: payrollPeriodsQueryKeys.payrollPeriods.detail(id),
		queryFn: () =>
			payrollPeriodsService
				.clearQueryParams()
				.select([
					"id",
					"name",
					"startDate",
					"endDate",
					"payDate",
					"calculatorId",
					"status",
					"cutoffDay",
					"notes",
					"generationMetadata",
					"processedBy",
					"code",
					"payFrequency",
					"processedAt",
					"isDeleted",
					"periodNumber",
					"organizationId",
					"createdAt",
					"updatedAt",
				])
				.getPayrollPeriod(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});
};

/**
 * Hook to create a new payroll period
 * @returns Mutation function to create a payroll period
 */
export const useCreatePayrollPeriod = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: CreatePayrollPeriodRequest) =>
			payrollPeriodsService.createPayrollPeriod(payload),
		onSuccess: (data) => {
			queryClient.invalidateQueries({
				queryKey: payrollPeriodsQueryKeys.payrollPeriods.lists(),
			});
			sonnerToast.success("Payroll period created successfully");
		},
		onError: (error: any) => {
			const message = error?.response?.data?.message || "Failed to create payroll period";
			sonnerToast.error(message);
		},
	});
};

/**
 * Hook to update an existing payroll period
 * @returns Mutation function to update a payroll period
 */
export const useUpdatePayrollPeriod = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: UpdatePayrollPeriodRequest }) =>
			payrollPeriodsService.updatePayrollPeriod(id, payload),
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({
				queryKey: payrollPeriodsQueryKeys.payrollPeriods.lists(),
			});
			queryClient.invalidateQueries({
				queryKey: payrollPeriodsQueryKeys.payrollPeriods.detail(variables.id),
			});
			sonnerToast.success("Payroll period updated successfully");
		},
		onError: (error: any) => {
			const message = error?.response?.data?.message || "Failed to update payroll period";
			sonnerToast.error(message);
		},
	});
};

/**
 * Hook to delete a payroll period
 * @returns Mutation function to delete a payroll period
 */
export const useDeletePayrollPeriod = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => payrollPeriodsService.deletePayrollPeriod(id),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: payrollPeriodsQueryKeys.payrollPeriods.lists(),
			});
			sonnerToast.success("Payroll period deleted successfully");
		},
		onError: (error: any) => {
			const message = error?.response?.data?.message || "Failed to delete payroll period";
			sonnerToast.error(message);
		},
	});
};

/**
 * Hook to generate payroll for all employees in a period
 * @returns Mutation function to generate payroll
 */
export const useGeneratePayroll = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => payrollPeriodsService.generatePayroll(id),
		onSuccess: (data) => {
			queryClient.invalidateQueries({
				queryKey: payrollPeriodsQueryKeys.payrollPeriods.lists(),
			});
			queryClient.invalidateQueries({
				queryKey: employeePayrollQueryKeys.employeePayroll.lists(),
			});
			const message = data?.message || "Payroll generated successfully";
			sonnerToast.success(message);
		},
		onError: (error: any) => {
			const message = error?.response?.data?.message || "Failed to generate payroll";
			sonnerToast.error(message);
		},
	});
};

/**
 * Hook to generate payroll from approved timesheets
 * @returns Mutation function to generate payroll from timesheets
 */
export const useGenerateTimesheetPayroll = () => {
	return useMutation({
		mutationFn: ({
			id,
			departmentId,
			sectionId,
		}: {
			id: string;
			departmentId?: string | null;
			sectionId?: string | null;
		}): Promise<PayrollGenerationStartResponse> =>
			payrollPeriodsService.generateTimesheetPayroll(id, { departmentId, sectionId }),
		onError: (error: any) => {
			console.error("Generate payroll error:", error);
			const message =
				error?.response?.data?.message ||
				error?.message ||
				"Failed to generate payroll from timesheets";
			sonnerToast.error(message);
		},
	});
};

export const useRequestStopTimesheetPayroll = () => {
	return useMutation({
		mutationFn: (id: string): Promise<PayrollGenerationStartResponse> =>
			payrollPeriodsService.requestStopTimesheetPayroll(id),
		onError: (error: any) => {
			const message =
				error?.response?.data?.message ||
				error?.message ||
				"Failed to request payroll stop";
			sonnerToast.error(message);
		},
	});
};

export const useRequestPauseTimesheetPayroll = () => {
	return useMutation({
		mutationFn: (id: string): Promise<PayrollGenerationStartResponse> =>
			payrollPeriodsService.requestPauseTimesheetPayroll(id),
		onError: (error: any) => {
			const message =
				error?.response?.data?.message ||
				error?.message ||
				"Failed to request payroll pause";
			sonnerToast.error(message);
		},
	});
};

export const usePayrollOtReadiness = (
	id: string | null | undefined,
	params?: {
		page?: number;
		limit?: number;
		query?: string;
		onlyWithOt?: boolean;
		departmentId?: string | null;
		sectionId?: string | null;
	},
	enabled: boolean = true,
) => {
	return useQuery({
		queryKey: ["payrollOtReadiness", id, params],
		queryFn: () => {
			if (!id) return null;
			return payrollPeriodsService.getOtReadiness(id, params);
		},
		enabled: Boolean(id) && enabled,
		// List summary is stable within a period; avoid hammering while accordion open.
		staleTime: 60_000,
		gcTime: 5 * 60_000,
		refetchOnWindowFocus: false,
		// Do not spin forever if API is slow/down — service uses 45s client timeout.
		retry: 1,
		retryDelay: 1500,
	});
};

/** Compact OT day detail for one employee timesheet (Run Payroll modal). Always live DB. */
export const usePayrollOtPersonDetail = (
	periodId: string | null | undefined,
	timesheetId: string | null | undefined,
	enabled: boolean = true,
) => {
	return useQuery({
		queryKey: ["payrollOtPersonDetail", periodId, timesheetId],
		queryFn: () => {
			if (!periodId || !timesheetId) return null;
			return payrollPeriodsService.getOtPersonDetail(periodId, timesheetId);
		},
		enabled: Boolean(periodId) && Boolean(timesheetId) && enabled,
		// Always re-query lines from DB when modal opens — not a precomputed list cache.
		staleTime: 0,
		gcTime: 60_000,
		refetchOnMount: "always",
		refetchOnWindowFocus: false,
		retry: 1,
	});
};

/** WorkSharing / schedule assignment deltas for Run Payroll (under Approved OT stack). */
export const usePayrollScheduleDeltas = (
	periodId: string | null | undefined,
	params?: { page?: number; limit?: number; onlyWorkshare?: boolean },
	enabled: boolean = true,
) => {
	return useQuery({
		queryKey: ["payrollScheduleDeltas", periodId, params],
		queryFn: () => {
			if (!periodId) return null;
			return payrollPeriodsService.getScheduleDeltas(periodId, params);
		},
		enabled: Boolean(periodId) && enabled,
		staleTime: 60_000,
		gcTime: 5 * 60_000,
		refetchOnWindowFocus: false,
		retry: 1,
	});
};

/** Honest empty-state copy when OT readiness fails or times out (accordion-safe). */
export function payrollOtReadinessErrorMessage(error: unknown): string {
	const status = (error as any)?.status ?? (error as any)?.response?.status;
	const msg = String(
		(error as any)?.message ||
			(error as any)?.response?.data?.message ||
			(error as any)?.error ||
			"",
	);
	if (status === 408 || /timeout|took too long|aborted/i.test(msg)) {
		return "Approved OT readiness timed out. Payroll can still run; refresh this panel or check timesheet OT totals.";
	}
	if (status === 404 || /not found/i.test(msg)) {
		return "Payroll period not found for OT readiness.";
	}
	if (!msg) {
		return "Could not load approved OT readiness. Try again; Run Payroll is not blocked by this panel.";
	}
	return msg;
}

export const useGenerateTimesheetPayrollPreview = (
	id: string | null | undefined,
	params?: TimesheetPayrollPreviewParams,
	enabled: boolean = true,
) => {
	return useQuery<TimesheetPayrollPreviewResponse | null>({
		queryKey: [
			"timesheetPayrollPreview",
			id,
			params?.page || 1,
			params?.limit || 10,
			params?.query || "",
			params?.departmentId || "",
			params?.sectionId || "",
			params?.employeeId || "",
		],
		queryFn: async () => {
			if (!id) return null;
			return payrollPeriodsService.getGenerateTimesheetPayrollPreview(id, params);
		},
		enabled: enabled && !!id,
		placeholderData: (previousData) => previousData,
		staleTime: 60 * 1000,
		refetchOnWindowFocus: false,
	});
};

/**
 * Hook to poll async timesheet payroll generation progress
 */
export const useGenerateTimesheetPayrollProgress = (
	jobId: string | null,
	enabled: boolean = true,
) => {
	return useQuery<PayrollGenerationProgress | null>({
		queryKey: ["payrollGenerationProgress", jobId],
		queryFn: async () => {
			if (!jobId) return null;
			return payrollPeriodsService.getGenerateTimesheetPayrollProgress(jobId);
		},
		enabled: enabled && !!jobId,
		refetchInterval: (query) => {
			const data = query.state.data as PayrollGenerationProgress | null | undefined;
			// null after 404 or missing job — stop hammering; stuck UI uses period PROCESSING
			if (!data) return false;
			if (data.orphaned) return false;
			if (
				data.status === "completed" ||
				data.status === "failed" ||
				data.status === "paused" ||
				data.status === "cancelled"
			) {
				return false;
			}
			// Background worker continues server-side; poll while page is open
			return 1000;
		},
		retry: false,
		refetchOnWindowFocus: true,
	});
};

export const useActiveTimesheetPayrollProgress = (
	payrollPeriodId: string | null | undefined,
	enabled: boolean = true,
) => {
	return useQuery<PayrollGenerationProgress | null>({
		queryKey: ["payrollGenerationProgress", "active", payrollPeriodId],
		queryFn: async () => {
			if (!payrollPeriodId) return null;
			return payrollPeriodsService.getActiveTimesheetPayrollProgress(payrollPeriodId);
		},
		enabled: enabled && !!payrollPeriodId,
		refetchInterval: (query) => {
			const data = query.state.data as PayrollGenerationProgress | null | undefined;
			// Keep looking for an active background job while this query is enabled
			// (period is PROCESSING). Do not stop after a single null — user may
			// return to the page after starting a run on another tab/session.
			if (data?.status === "processing") return 1000;
			if (data == null) return 2000;
			return false;
		},
		retry: 1,
		refetchOnWindowFocus: true,
		refetchOnMount: "always",
	});
};

export const usePayrollCycleConfig = () => {
	return useQuery<PayrollCycleConfig>({
		queryKey: payrollPeriodsQueryKeys.payrollPeriods.cycleConfig(),
		queryFn: () => payrollPeriodsService.getPayrollCycleConfig(),
		staleTime: 5 * 60 * 1000,
	});
};

export const useUpdatePayrollCycleConfig = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: UpdatePayrollCycleConfigRequest) =>
			payrollPeriodsService.updatePayrollCycleConfig(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: payrollPeriodsQueryKeys.payrollPeriods.cycleConfig(),
			});
			sonnerToast.success("Payroll cycle settings updated successfully");
		},
		onError: (error: any) => {
			const message = error?.response?.data?.message || "Failed to update payroll cycle settings";
			sonnerToast.error(message);
		},
	});
};

export const useBulkGeneratePayrollPeriods = () => {
	const queryClient = useQueryClient();
	return useMutation<BulkGeneratePayrollPeriodsResponse, any, BulkGeneratePayrollPeriodsRequest>({
		mutationFn: (payload) => payrollPeriodsService.bulkGeneratePayrollPeriods(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: payrollPeriodsQueryKeys.payrollPeriods.lists(),
			});
			sonnerToast.success("Bulk payroll period generation completed");
		},
		onError: (error: any) => {
			const message = error?.response?.data?.message || "Failed to generate payroll periods";
			sonnerToast.error(message);
		},
	});
};

export const useBulkAdjustPayrollPeriods = () => {
	const queryClient = useQueryClient();
	return useMutation<BulkAdjustPayrollPeriodsResponse, any, BulkAdjustPayrollPeriodsRequest>({
		mutationFn: (payload) => payrollPeriodsService.bulkAdjustPayrollPeriods(payload),
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({
				queryKey: payrollPeriodsQueryKeys.payrollPeriods.lists(),
			});
			const updated = data?.updated ?? 0;
			const skipped = data?.skipped ?? 0;
			if (variables?.dryRun) {
				sonnerToast.success(
					`Preview generated. No periods updated. Projected: ${updated}, Skipped: ${skipped}.`,
				);
				return;
			}
			sonnerToast.success(
				`Bulk payroll period adjustment completed. Updated: ${updated}, Skipped: ${skipped}.`,
			);
		},
		onError: (error: any) => {
			const message = error?.response?.data?.message || "Failed to adjust payroll periods";
			sonnerToast.error(message);
		},
	});
};
