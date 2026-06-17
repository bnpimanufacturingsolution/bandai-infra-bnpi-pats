import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import attendanceService, {
	type AttendancesResponse,
	type Attendance,
	type CreateAttendanceCorrectionPayload,
	type ImportAttendanceResponse,
	type ImportAttendanceOptions,
} from "../../services/attendance.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";

// Query keys structure
export const queryKeys = {
	attendances: {
		all: ["attendances"] as const,
		lists: () => [...queryKeys.attendances.all, "list"] as const,
		list: (params?: ApiQueryParams) => [...queryKeys.attendances.lists(), { params }] as const,
		details: () => [...queryKeys.attendances.all, "detail"] as const,
		detail: (id: string) => [...queryKeys.attendances.details(), id] as const,
	},
};

/**
 * Hook to fetch list of attendances with filters
 */
export const useAttendances = (params?: ApiQueryParams) => {
	return useQuery<AttendancesResponse>({
		queryKey: queryKeys.attendances.list(params),
		queryFn: () => {
			return attendanceService
				.clearQueryParams()
				.select([
					"id",
					"organizationId",
					"employeeId",
					"date",
					"timeIn",
					"timeOut",
					"status",
					"scheduleSnapshot",
					"timeInLocation",
					"timeOutLocation",
					"deviceInfo",
					"isManualEntry",
					"approvedBy",
					"ledgerType",
					"appliedAt",
					"appliedBy",
					"isEffective",
					"notes",
					"isDeleted",
					"createdAt",
					"updatedAt",
					"hasCorrection",
					"rawAttendanceId",
					"effectiveAttendanceId",
					"employee.id",
					"employee.employeeId",
					"employee.person.personalInfo",
					"employee.position.title",
					"employee.department.name",
					"appliedByEmployee.id",
					"appliedByEmployee.employeeId",
					"appliedByEmployee.person.personalInfo",
					"appliedByEmployee.position.title",
					"appliedByEmployee.department.name",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getAttendances();
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useAttendance = (id: string) => {
	return useQuery({
		queryKey: queryKeys.attendances.detail(id),
		queryFn: () => attendanceService.getAttendanceById(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Mutation hooks
export const useImportAttendance = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			file,
			options,
		}: {
			file: File;
			options?: ImportAttendanceOptions;
		}) => {
			return await attendanceService.importAttendance(file, options);
		},
		onSuccess: (data: ImportAttendanceResponse) => {
			// New async format returns jobId - don't invalidate queries here
			// The progress modal will handle invalidation after completion
			if (data.jobId) {
				// Import started successfully, progress modal will handle the rest
				return;
			}

			// Legacy format handling (if backend returns old format)
			// This code path should not be hit with the new async implementation
			queryClient.invalidateQueries({ queryKey: queryKeys.attendances.all });
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to import attendance");
		},
	});
};

export const useCreateAttendanceCorrection = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateAttendanceCorrectionPayload) => {
			return attendanceService.createAttendanceCorrection(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.attendances.all });
		},
		onError: (error: any) => {
			sonnerToast.error(
				error?.errors?.[0]?.message ||
					error?.message ||
					"Failed to apply attendance correction",
			);
		},
	});
};
