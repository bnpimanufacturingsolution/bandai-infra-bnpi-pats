import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { payrollService } from "~/services/payroll.service";
import { queryKeys } from "~/lib/query-client";
import type { PayrollRecord } from "~/lib/api/config";

// Hook to get payroll records
export const usePayrollRecords = (params?: {
	page?: number;
	limit?: number;
	employeeId?: string;
	month?: number;
	year?: number;
	status?: string;
}) => {
	return useQuery({
		queryKey: queryKeys.payroll.list(params || {}),
		queryFn: () => payrollService.getPayrollRecords(params),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Hook to get single payroll record
export const usePayrollRecord = (id: string) => {
	return useQuery({
		queryKey: [...queryKeys.payroll.all, "detail", id],
		queryFn: () => payrollService.getPayrollRecord(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Hook to get payroll summary
export const usePayrollSummary = (params?: {
	month?: number;
	year?: number;
	department?: string;
}) => {
	return useQuery({
		queryKey: queryKeys.payroll.summary(params || {}),
		queryFn: () => payrollService.getPayrollSummary(params),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Hook to generate payroll
export const useGeneratePayroll = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (params: { month: number; year: number; employeeIds?: string[] }) =>
			payrollService.generatePayroll(params),
		onSuccess: () => {
			// Invalidate payroll queries to refetch
			queryClient.invalidateQueries({ queryKey: queryKeys.payroll.all });
		},
		onError: (error: any) => {
			console.error("Generate payroll failed:", error?.message || error);
		},
	});
};

// Hook to update payroll status
export const useUpdatePayrollStatus = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, status }: { id: string; status: PayrollRecord["status"] }) =>
			payrollService.updatePayrollStatus(id, status),
		onSuccess: (response, { id }) => {
			// Update the specific payroll record in cache
			queryClient.setQueryData([...queryKeys.payroll.all, "detail", id], response);
			// Invalidate payroll list to refetch
			queryClient.invalidateQueries({ queryKey: queryKeys.payroll.lists() });
		},
		onError: (error: any) => {
			console.error("Update payroll status failed:", error?.message || "Unknown error");
		},
	});
};

// Hook to download payroll slip
export const useDownloadPayrollSlip = () => {
	return useMutation({
		mutationFn: (id: string) => payrollService.downloadPayrollSlip(id),
		onSuccess: (blob, id) => {
			// Create download link
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `payroll-slip-${id}.pdf`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			window.URL.revokeObjectURL(url);
		},
		onError: (error: any) => {
			console.error("Download payroll slip failed:", error?.message || "Unknown error");
		},
	});
};

// Hook to bulk update payroll status
export const useBulkUpdatePayrollStatus = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ ids, status }: { ids: string[]; status: PayrollRecord["status"] }) =>
			payrollService.bulkUpdatePayrollStatus(ids, status),
		onSuccess: () => {
			// Invalidate payroll queries to refetch
			queryClient.invalidateQueries({ queryKey: queryKeys.payroll.all });
		},
		onError: (error: any) => {
			console.error("Bulk update payroll status failed:", error?.message || "Unknown error");
		},
	});
};
