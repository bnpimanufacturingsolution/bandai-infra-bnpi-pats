import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { attendanceService } from "~/services/attendance.service";
import type { WeeklyAttendanceApproval } from "~/types/attendance";

export function useTeamAttendance(
	managerId?: string,
	weekStartDate?: string,
	weekEndDate?: string,
) {
	return useQuery({
		queryKey: ["team-attendance", managerId, weekStartDate, weekEndDate],
		queryFn: async () => {
			const response = await attendanceService.getTeamWeeklyAttendance({
				managerId,
				weekStartDate,
				weekEndDate,
			});
			return response as WeeklyAttendanceApproval[];
		},
		enabled: !!managerId,
	});
}

export function useApproveWeeklyAttendance() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			employeeId,
			weekStartDate,
			weekEndDate,
			notes,
		}: {
			employeeId: string;
			weekStartDate: string;
			weekEndDate: string;
			notes?: string;
		}) => {
			const response = await attendanceService.approveWeeklyAttendance(
				employeeId,
				weekStartDate,
				weekEndDate,
				notes,
			);
			return response;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["team-attendance"] });
		},
	});
}

export function useRejectWeeklyAttendance() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			employeeId,
			weekStartDate,
			weekEndDate,
			reason,
		}: {
			employeeId: string;
			weekStartDate: string;
			weekEndDate: string;
			reason: string;
		}) => {
			const response = await attendanceService.rejectWeeklyAttendance(
				employeeId,
				weekStartDate,
				weekEndDate,
				reason,
			);
			return response;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["team-attendance"] });
		},
	});
}

export function useApproveAttendanceRecord() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ recordId, notes }: { recordId: string; notes?: string }) => {
			const response = await attendanceService.approveAttendanceRecord(recordId, notes);
			return response;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["team-attendance"] });
			queryClient.invalidateQueries({ queryKey: ["attendance"] });
		},
	});
}

export function useRejectAttendanceRecord() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ recordId, reason }: { recordId: string; reason: string }) => {
			const response = await attendanceService.rejectAttendanceRecord(recordId, reason);
			return response;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["team-attendance"] });
			queryClient.invalidateQueries({ queryKey: ["attendance"] });
		},
	});
}

