import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	employeePayrollService,
	type ImportEmployeePayrollResponse,
	type EmployeePayrollBreakdown,
	type EmployeePayrollResetResponse,
} from "../../services/employee-payroll.service";
import type { EmployeePayrollsResponse, EmployeePayroll } from "~/types/employee-payroll";
import type { ApiQueryParams } from "~/services/api-service";
import { toast as sonnerToast } from "sonner";

// Query keys structure
export const employeePayrollQueryKeys = {
	employeePayroll: {
		all: ["employeePayroll"] as const,
		lists: () => [...employeePayrollQueryKeys.employeePayroll.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...employeePayrollQueryKeys.employeePayroll.lists(), { params }] as const,
		details: () => [...employeePayrollQueryKeys.employeePayroll.all, "detail"] as const,
		detail: (id: string) =>
			[...employeePayrollQueryKeys.employeePayroll.details(), id] as const,
		breakdowns: () => [...employeePayrollQueryKeys.employeePayroll.all, "breakdown"] as const,
		breakdown: (id: string) =>
			[...employeePayrollQueryKeys.employeePayroll.breakdowns(), id] as const,
	},
};

/**
 * Hook to fetch list of employee payrolls with filters
 * @param params Optional query parameters for filtering, sorting, pagination
 * @returns React Query result with employee payroll data
 */
export const useEmployeePayrolls = (params?: ApiQueryParams) => {
	return useQuery<EmployeePayrollsResponse>({
		queryKey: employeePayrollQueryKeys.employeePayroll.list(params),
		queryFn: () => {
			return employeePayrollService
				.clearQueryParams()
				.select([
					"id",
					"employee.person.personalInfo",
					"employee.employeeId",
					"employee.basicSalary",
					"employee.payFrequency",
					"employee.id",
					"payrollPeriod",
					"basicPay",
					"taxAmount",
					"sssContribution",
					"philHealthContribution",
					"pagibigContribution",
					"lateDeduction",
					"earlyOutDeduction",
					"absentDeduction",
					"grossPay",
					"taxableIncome",
					"totalDeductions",
					"netPay",
					"isPaid",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getEmployeePayrolls();
		},
		enabled: params?.enabled !== false,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch a single employee payroll record by ID
 * @param id Employee payroll ID
 * @returns React Query result with single employee payroll record
 */
export const useEmployeePayroll = (id: string) => {
	return useQuery<EmployeePayroll>({
		queryKey: employeePayrollQueryKeys.employeePayroll.detail(id),
		queryFn: () =>
			employeePayrollService
				.clearQueryParams()
				.select([
					"id",
					"employee.person.personalInfo",
					"employee.id",
					"employee.employeeId",
					"employee.department.name",
					"employee.position.title",
					"payrollPeriod.id",
					"payrollPeriod.name",
					"payrollPeriod.startDate",
					"payrollPeriod.endDate",
					"payrollPeriod.payDate",
					"payrollPeriod.status",
					"timesheet",
					"timesheetSnapshot",
					"basicPay",
					"overtimePay",
					"nightDiffPay",
					"holidayPay",
					"allowances",
					"bonuses",
					"taxAmount",
					"sssContribution",
					"philHealthContribution",
					"pagibigContribution",
					"loanDeductions",
					"absentDeduction",
					"lateDeduction",
					"earlyOutDeduction",
					"otherDeductions",
					"grossPay",
					"taxableIncome",
					"totalDeductions",
					"netPay",
					"isPaid",
					"paidAt",
					"paymentMethod",
					"referenceNumber",
					"dailyBreakdown",
					"rateBreakdown",
					"notes",
					"isDeleted",
					"createdAt",
					"updatedAt",
					"metadata",
				])
				.getEmployeePayrollById(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch detailed payroll breakdown including attendance
 * @param id Employee payroll ID
 * @returns React Query result with detailed breakdown
 */
export const useEmployeePayrollBreakdown = (id: string) => {
	return useQuery<EmployeePayrollBreakdown>({
		queryKey: employeePayrollQueryKeys.employeePayroll.breakdown(id),
		queryFn: () => employeePayrollService.getEmployeePayrollBreakdown(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to import employee payrolls from file
 * @returns React Query mutation for importing employee payrolls
 */
export const useImportEmployeePayroll = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (file: File) => {
			return await employeePayrollService.importEmployeePayrolls(file);
		},
		onSuccess: (data: ImportEmployeePayrollResponse) => {
			queryClient.invalidateQueries({
				queryKey: employeePayrollQueryKeys.employeePayroll.all,
			});

			// Check if there are errors
			if (data.summary.errors && data.summary.errors.length > 0) {
				// Don't show success toast if there are errors
				// The component will handle displaying the errors
				return;
			}

			// Only show success if there were actual imports
			if (data.summary.created > 0 || data.summary.updated > 0) {
				sonnerToast.success(
					`Import completed: ${data.summary.created} created, ${data.summary.updated} updated`,
				);
			}
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to import employee payrolls");
		},
	});
};

/**
 * Hook to generate and download payslip PDF
 * @returns React Query mutation for downloading payslip
 */
export const useDownloadPayslip = () => {
	return useMutation({
		mutationFn: async ({ id, name }: { id: string; name: string }) => {
			const blob = await employeePayrollService.generatePayslipPdf(id);
			return { blob, name };
		},
		onSuccess: ({ blob, name }) => {
			// Create url and download
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `Payslip-${name.replace(/\s+/g, "_")}.pdf`;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);

			sonnerToast.success("Payslip downloaded successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to download payslip");
		},
	});
};

export const useResetGeneratedPayrolls = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async () => employeePayrollService.resetGeneratedPayrolls(),
		onSuccess: (data: EmployeePayrollResetResponse) => {
			queryClient.invalidateQueries({
				queryKey: employeePayrollQueryKeys.employeePayroll.all,
			});
			queryClient.invalidateQueries({ queryKey: ["payrollPeriods"] });
			sonnerToast.success(
				`Payroll reset complete: ${data.deletedEmployeePayrolls} payroll rows deleted, ${data.resetPayrollPeriods} periods reopened.`,
			);
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to reset generated payroll data");
		},
	});
};
