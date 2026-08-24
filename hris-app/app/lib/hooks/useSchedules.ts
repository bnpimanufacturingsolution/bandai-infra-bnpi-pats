import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";
import { employeesQueryKeys } from "~/lib/hooks/useEmployees";
import schedulesService, {
	type CreateEmployeeScheduleRequest,
	type CreateScheduleOverrideRequest,
	type CreateScheduleTemplateRequest,
	type CreateShiftTypeRequest,
	type EmployeeScheduleCalendarResponse,
	type EmployeeSchedulesResponse,
	type ScheduleOverride,
	type ScheduleOverridesResponse,
	type ScheduleTemplate,
	type ScheduleTemplatesResponse,
	type ShiftType,
	type ShiftTypesResponse,
	type UpdateEmployeeScheduleRequest,
	type UpdateScheduleOverrideRequest,
	type UpdateScheduleTemplateRequest,
	type UpdateShiftTypeRequest,
} from "../../services/schedules.service";

const getErrorMessage = (error: any, fallback: string) =>
	error?.errors?.[0]?.message || error?.message || fallback;

export const scheduleQueryKeys = {
	shiftTypes: {
		all: ["shiftTypes"] as const,
		lists: () => [...scheduleQueryKeys.shiftTypes.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...scheduleQueryKeys.shiftTypes.lists(), { params }] as const,
		details: () => [...scheduleQueryKeys.shiftTypes.all, "detail"] as const,
		detail: (id: string) => [...scheduleQueryKeys.shiftTypes.details(), id] as const,
	},
	scheduleTemplates: {
		all: ["scheduleTemplates"] as const,
		lists: () => [...scheduleQueryKeys.scheduleTemplates.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...scheduleQueryKeys.scheduleTemplates.lists(), { params }] as const,
		details: () => [...scheduleQueryKeys.scheduleTemplates.all, "detail"] as const,
		detail: (id: string) => [...scheduleQueryKeys.scheduleTemplates.details(), id] as const,
	},
	employeeScheduleTimeline: {
		all: ["employeeScheduleTimeline"] as const,
		lists: () => [...scheduleQueryKeys.employeeScheduleTimeline.all, "list"] as const,
		list: (employeeId?: string) =>
			[...scheduleQueryKeys.employeeScheduleTimeline.lists(), { employeeId }] as const,
		calendar: (employeeId: string, start: string, end: string) =>
			[
				...scheduleQueryKeys.employeeScheduleTimeline.all,
				"calendar",
				employeeId,
				start,
				end,
			] as const,
	},
	scheduleOverrides: {
		all: ["scheduleOverrides"] as const,
		lists: () => [...scheduleQueryKeys.scheduleOverrides.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...scheduleQueryKeys.scheduleOverrides.lists(), { params }] as const,
		details: () => [...scheduleQueryKeys.scheduleOverrides.all, "detail"] as const,
		detail: (id: string) => [...scheduleQueryKeys.scheduleOverrides.details(), id] as const,
	},
};

export const useShiftTypes = (params?: ApiQueryParams, options?: { enabled?: boolean }) =>
	useQuery<ShiftTypesResponse>({
		queryKey: scheduleQueryKeys.shiftTypes.list(params),
		queryFn: () => schedulesService.getShiftTypes(params),
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000,
	});

export const useShiftType = (id: string, options?: { enabled?: boolean }) =>
	useQuery<ShiftType>({
		queryKey: scheduleQueryKeys.shiftTypes.detail(id),
		queryFn: () => schedulesService.getShiftType(id),
		enabled: !!id && (options?.enabled ?? true),
		staleTime: 5 * 60 * 1000,
	});

export const useScheduleTemplates = (params?: ApiQueryParams, options?: { enabled?: boolean }) =>
	useQuery<ScheduleTemplatesResponse>({
		queryKey: scheduleQueryKeys.scheduleTemplates.list(params),
		queryFn: () => schedulesService.getScheduleTemplates(params),
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000,
	});

export const useScheduleTemplate = (id: string, options?: { enabled?: boolean }) =>
	useQuery<ScheduleTemplate>({
		queryKey: scheduleQueryKeys.scheduleTemplates.detail(id),
		queryFn: () => schedulesService.getScheduleTemplate(id),
		enabled: !!id && (options?.enabled ?? true),
		staleTime: 5 * 60 * 1000,
	});

export const useEmployeeSchedules = (employeeId?: string, options?: { enabled?: boolean }) =>
	useQuery<EmployeeSchedulesResponse>({
		queryKey: scheduleQueryKeys.employeeScheduleTimeline.list(employeeId),
		queryFn: () => schedulesService.getEmployeeSchedules({ employeeId }),
		enabled: options?.enabled ?? true,
		staleTime: 2 * 60 * 1000,
	});

export const useEmployeeScheduleCalendar = (
	params: { employeeId: string; start: string; end: string },
	options?: { enabled?: boolean },
) =>
	useQuery<EmployeeScheduleCalendarResponse>({
		queryKey: scheduleQueryKeys.employeeScheduleTimeline.calendar(
			params.employeeId,
			params.start,
			params.end,
		),
		queryFn: () => schedulesService.getEmployeeScheduleCalendar(params),
		enabled:
			(options?.enabled ?? true) && !!params.employeeId && !!params.start && !!params.end,
		staleTime: 2 * 60 * 1000,
	});

export const useScheduleOverrides = (params?: ApiQueryParams, options?: { enabled?: boolean }) =>
	useQuery<ScheduleOverridesResponse>({
		queryKey: scheduleQueryKeys.scheduleOverrides.list(params),
		queryFn: () => schedulesService.getScheduleOverrides(params),
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000,
	});

export const useScheduleOverride = (id: string, options?: { enabled?: boolean }) =>
	useQuery<ScheduleOverride>({
		queryKey: scheduleQueryKeys.scheduleOverrides.detail(id),
		queryFn: () => schedulesService.getScheduleOverride(id),
		enabled: !!id && (options?.enabled ?? true),
		staleTime: 5 * 60 * 1000,
	});

export const useCreateShiftType = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: CreateShiftTypeRequest) => schedulesService.createShiftType(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.shiftTypes.all });
			sonnerToast.success("Shift type created successfully");
		},
		onError: (error: any) =>
			sonnerToast.error(getErrorMessage(error, "Failed to create shift type")),
	});
};

export const useUpdateShiftType = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: UpdateShiftTypeRequest }) =>
			schedulesService.updateShiftType(id, payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.shiftTypes.all });
			sonnerToast.success("Shift type updated successfully");
		},
		onError: (error: any) =>
			sonnerToast.error(getErrorMessage(error, "Failed to update shift type")),
	});
};

export const useDeleteShiftType = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => schedulesService.deleteShiftType(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.shiftTypes.all });
			sonnerToast.success("Shift type deleted successfully");
		},
		onError: (error: any) =>
			sonnerToast.error(getErrorMessage(error, "Failed to delete shift type")),
	});
};

export const useImportShiftTypes = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (file: File) => schedulesService.importShiftTypes(file),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.shiftTypes.all });
			queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.scheduleTemplates.all });
			sonnerToast.success("Shift types imported successfully");
		},
		onError: (error: any) =>
			sonnerToast.error(getErrorMessage(error, "Failed to import shift types")),
	});
};

export const useCreateScheduleTemplate = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: CreateScheduleTemplateRequest) =>
			schedulesService.createScheduleTemplate(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.scheduleTemplates.all });
			sonnerToast.success("Schedule template created successfully");
		},
		onError: (error: any) =>
			sonnerToast.error(getErrorMessage(error, "Failed to create schedule template")),
	});
};

export const useUpdateScheduleTemplate = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: UpdateScheduleTemplateRequest }) =>
			schedulesService.updateScheduleTemplate(id, payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.scheduleTemplates.all });
			sonnerToast.success("Schedule template updated successfully");
		},
		onError: (error: any) =>
			sonnerToast.error(getErrorMessage(error, "Failed to update schedule template")),
	});
};

export const useDeleteScheduleTemplate = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => schedulesService.deleteScheduleTemplate(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.scheduleTemplates.all });
			sonnerToast.success("Schedule template deleted successfully");
		},
		onError: (error: any) =>
			sonnerToast.error(getErrorMessage(error, "Failed to delete schedule template")),
	});
};

export const useDuplicateScheduleTemplate = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => schedulesService.duplicateScheduleTemplate(id),
		onSuccess: (duplicatedTemplate, sourceId) => {
			queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.scheduleTemplates.all });
			queryClient.invalidateQueries({
				queryKey: scheduleQueryKeys.scheduleTemplates.detail(sourceId),
			});
			if (duplicatedTemplate?.id) {
				queryClient.invalidateQueries({
					queryKey: scheduleQueryKeys.scheduleTemplates.detail(duplicatedTemplate.id),
				});
			}
			sonnerToast.success("Schedule template duplicated successfully");
		},
		onError: (error: any) =>
			sonnerToast.error(getErrorMessage(error, "Failed to duplicate schedule template")),
	});
};

export const useCreateEmployeeSchedule = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: CreateEmployeeScheduleRequest) =>
			schedulesService.createEmployeeSchedule(payload),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({
				queryKey: scheduleQueryKeys.employeeScheduleTimeline.all,
			});
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.all,
			});
			queryClient.invalidateQueries({
				queryKey: [...employeesQueryKeys.employees.all, "schedule-calendar"],
			});
			queryClient.invalidateQueries({
				queryKey: [...employeesQueryKeys.employees.all, "schedule-calendar-grid"],
			});
			queryClient.invalidateQueries({
				queryKey: [...employeesQueryKeys.employees.all, "team-schedule-collections"],
			});
			if (variables.employeeId) {
				queryClient.invalidateQueries({
					queryKey: scheduleQueryKeys.employeeScheduleTimeline.list(variables.employeeId),
				});
				queryClient.invalidateQueries({
					queryKey: employeesQueryKeys.employees.detail(variables.employeeId),
				});
				queryClient.invalidateQueries({
					queryKey: employeesQueryKeys.employees.schedules(variables.employeeId),
				});
			}
			sonnerToast.success("Employee schedule assigned successfully");
		},
		onError: (error: any) =>
			sonnerToast.error(getErrorMessage(error, "Failed to assign employee schedule")),
	});
};

export const useUpdateEmployeeSchedule = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: UpdateEmployeeScheduleRequest }) =>
			schedulesService.updateEmployeeSchedule(id, payload),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: scheduleQueryKeys.employeeScheduleTimeline.all,
			});
			sonnerToast.success("Employee schedule updated successfully");
		},
		onError: (error: any) =>
			sonnerToast.error(getErrorMessage(error, "Failed to update employee schedule")),
	});
};

export const useCreateScheduleOverride = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: CreateScheduleOverrideRequest) =>
			schedulesService.createScheduleOverride(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.scheduleOverrides.all });
			queryClient.invalidateQueries({
				queryKey: scheduleQueryKeys.employeeScheduleTimeline.all,
			});
			queryClient.invalidateQueries({
				queryKey: [...employeesQueryKeys.employees.all, "schedule-calendar"],
			});
			queryClient.invalidateQueries({
				queryKey: [...employeesQueryKeys.employees.all, "schedule-calendar-grid"],
			});
			queryClient.invalidateQueries({
				queryKey: [...employeesQueryKeys.employees.all, "team-schedule-collections"],
			});
			sonnerToast.success("Schedule override created successfully");
		},
		onError: (error: any) =>
			sonnerToast.error(getErrorMessage(error, "Failed to create schedule override")),
	});
};

export const useUpdateScheduleOverride = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: UpdateScheduleOverrideRequest }) =>
			schedulesService.updateScheduleOverride(id, payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.scheduleOverrides.all });
			queryClient.invalidateQueries({
				queryKey: scheduleQueryKeys.employeeScheduleTimeline.all,
			});
			queryClient.invalidateQueries({
				queryKey: [...employeesQueryKeys.employees.all, "schedule-calendar"],
			});
			queryClient.invalidateQueries({
				queryKey: [...employeesQueryKeys.employees.all, "schedule-calendar-grid"],
			});
			queryClient.invalidateQueries({
				queryKey: [...employeesQueryKeys.employees.all, "team-schedule-collections"],
			});
			sonnerToast.success("Schedule override updated successfully");
		},
		onError: (error: any) =>
			sonnerToast.error(getErrorMessage(error, "Failed to update schedule override")),
	});
};

export const useDeleteScheduleOverride = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => schedulesService.deleteScheduleOverride(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.scheduleOverrides.all });
			queryClient.invalidateQueries({
				queryKey: scheduleQueryKeys.employeeScheduleTimeline.all,
			});
			queryClient.invalidateQueries({
				queryKey: [...employeesQueryKeys.employees.all, "schedule-calendar"],
			});
			queryClient.invalidateQueries({
				queryKey: [...employeesQueryKeys.employees.all, "schedule-calendar-grid"],
			});
			queryClient.invalidateQueries({
				queryKey: [...employeesQueryKeys.employees.all, "team-schedule-collections"],
			});
			sonnerToast.success("Schedule override deleted successfully");
		},
		onError: (error: any) =>
			sonnerToast.error(getErrorMessage(error, "Failed to delete schedule override")),
	});
};

export const useImportSchedules = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (file: File) => schedulesService.importSchedules(file),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.scheduleTemplates.all });
			sonnerToast.success("Schedule templates imported successfully");
		},
		onError: (error: any) =>
			sonnerToast.error(getErrorMessage(error, "Failed to import schedules")),
	});
};

export type { ScheduleTemplate, ShiftType, EmployeeSchedulesResponse, ScheduleOverridesResponse };
