import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import employeeBenefitService, {
	type EmployeeBenefit,
	type EmployeeBenefitsResponse,
	type CreateEmployeeBenefitRequest,
	type UpdateEmployeeBenefitRequest,
} from "~/services/employee-benefit.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";

export const queryKeys = {
	employeeBenefits: {
		all: ["employeeBenefits"] as const,
		lists: () => [...queryKeys.employeeBenefits.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...queryKeys.employeeBenefits.lists(), { params }] as const,
		details: () => [...queryKeys.employeeBenefits.all, "detail"] as const,
		detail: (id: string) => [...queryKeys.employeeBenefits.details(), id] as const,
	},
};

export const useEmployeeBenefits = (params?: ApiQueryParams) => {
	return useQuery<EmployeeBenefitsResponse>({
		queryKey: queryKeys.employeeBenefits.list(params),
		queryFn: () => {
			return employeeBenefitService
				.clearQueryParams()
				.select([
					"id",
					"organizationId",
					"employeeId",
					"benefitTypeId",
					"name",
					"description",
					"amount",
					"startDate",
					"endDate",
					"payrollPeriodId",
					"status",
					"isActive",
					"notes",
					"createdAt",
					"employee.id",
					"employee.employeeId",
					"employee.person.personalInfo",
					"employee.person.email",
					"employee.position.id",
					"employee.position.title",
					"employee.position.code",
					"benefitType.id",
					"benefitType.code",
					"benefitType.name",
					"benefitType.category",
					"benefitType.payrollDirection",
					"benefitType.provider",
					"benefitType.coverage",
					"payrollPeriod.id",
					"payrollPeriod.name",
					"payrollPeriod.code",
					"payrollPeriod.startDate",
					"payrollPeriod.endDate",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getEmployeeBenefits();
		},
		enabled: params?.enabled !== false,
		placeholderData: keepPreviousData,
		staleTime: 5 * 60 * 1000,
	});
};

export const useEmployeeBenefit = (id: string) => {
	return useQuery<EmployeeBenefit>({
		queryKey: queryKeys.employeeBenefits.detail(id),
		queryFn: () => employeeBenefitService.getEmployeeBenefit(id),
		enabled: !!id,
	});
};

export const useCreateEmployeeBenefit = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: CreateEmployeeBenefitRequest) =>
			employeeBenefitService.createEmployeeBenefit(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.employeeBenefits.all });
			sonnerToast.success("Employee benefit created successfully");
		},
		onError: (error: any) => {
			if (error.errors && Array.isArray(error.errors)) {
				error.errors.forEach((err: any) => {
					sonnerToast.error(err.message || "Validation error");
				});
			} else {
				sonnerToast.error(error?.message || "Failed to create employee benefit");
			}
		},
	});
};

export const useUpdateEmployeeBenefit = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateEmployeeBenefitRequest }) =>
			employeeBenefitService.updateEmployeeBenefit(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.employeeBenefits.all });
			sonnerToast.success("Employee benefit updated successfully");
		},
		onError: (error: any) => {
			if (error.errors && Array.isArray(error.errors)) {
				error.errors.forEach((err: any) => {
					sonnerToast.error(err.message || "Validation error");
				});
			} else {
				sonnerToast.error(error?.message || "Failed to update employee benefit");
			}
		},
	});
};

export const useDeleteEmployeeBenefit = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => employeeBenefitService.deleteEmployeeBenefit(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.employeeBenefits.all });
			sonnerToast.success("Employee benefit deleted successfully");
		},
		onError: (error: any) => {
			if (error.errors && Array.isArray(error.errors)) {
				error.errors.forEach((err: any) => {
					sonnerToast.error(err.message || "Validation error");
				});
			} else {
				sonnerToast.error(error?.message || "Failed to delete employee benefit");
			}
		},
	});
};
