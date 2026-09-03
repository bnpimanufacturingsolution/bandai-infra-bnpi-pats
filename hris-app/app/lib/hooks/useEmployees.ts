import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import employeesService, {
	type Employee,
	type EmployeesResponse,
	type CreateEmployeeRequest,
	type CreateEmployeeWithAccountRequest,
	type UpdateEmployeeDocumentsRequest,
	type UpdateEmployeeRequest,
	type EmployeeAttendanceRecord,
	type EmployeeAttendanceResponse,
	type EmployeeAttendanceQueryParams,
	type DebugAttendanceResetResult,
	type MarkAttendanceRequest,
	type UpdateAttendanceRequest,
	type ManagedDepartment,
	type ManagedDepartmentsResponse,
	type EligibilityCandidate,
	type EmployeeEligibilityResponse,
	type EmployeeSchedulesResponse,
	type SetActiveEmployeeScheduleRequest,
	type TeamScheduleCalendarResponse,
	type TeamScheduleCalendarGridResponse,
	type TeamScheduleCollectionsResponse,
} from "~/services/employees.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";
import { getToastErrorMessage } from "~/lib/utils/error-formatter";
import { queryKeys as metricsQueryKeys } from "~/lib/hooks/useMetrics";
import { timesheetQueryKeys } from "~/lib/hooks/useTimesheets";

// Query keys structure
export const employeesQueryKeys = {
	employees: {
		all: ["employees"] as const,
		lists: () => [...employeesQueryKeys.employees.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...employeesQueryKeys.employees.lists(), { params }] as const,
		details: () => [...employeesQueryKeys.employees.all, "detail"] as const,
		detail: (id: string, fields?: string | string[]) =>
			[...employeesQueryKeys.employees.details(), id, { fields }] as const,
		attendance: () => [...employeesQueryKeys.employees.all, "attendance"] as const,
		attendanceByEmployee: (employeeId: string) =>
			[...employeesQueryKeys.employees.attendance(), employeeId] as const,
		attendanceList: (employeeId: string, params?: EmployeeAttendanceQueryParams) =>
			[...employeesQueryKeys.employees.attendanceByEmployee(employeeId), params] as const,
		attendanceToday: (employeeId: string) =>
			[...employeesQueryKeys.employees.attendance(), employeeId, "today"] as const,
		attendanceRecord: (employeeId: string, attendanceId: string) =>
			[...employeesQueryKeys.employees.attendance(), employeeId, attendanceId] as const,
		managedDepartments: () =>
			[...employeesQueryKeys.employees.all, "managed-departments"] as const,
		managedDepartmentsList: (employeeId: string, params?: any) =>
			[...employeesQueryKeys.employees.managedDepartments(), employeeId, params] as const,
		managedDepartment: (employeeId: string, departmentId: string) =>
			[
				...employeesQueryKeys.employees.managedDepartments(),
				employeeId,
				departmentId,
			] as const,
		// removed default managed department
		departmentOfEmployee: (employeeId: string, params?: any) =>
			[
				...employeesQueryKeys.employees.all,
				"department-of-employee",
				employeeId,
				params,
			] as const,
		filterUsers: () => [...employeesQueryKeys.employees.all, "filter-users"] as const,
		eligibility: (params?: ApiQueryParams) =>
			[...employeesQueryKeys.employees.all, "eligibility", params] as const,
		schedules: (employeeId: string) =>
			[...employeesQueryKeys.employees.all, "schedules", employeeId] as const,
		scheduleCalendar: (params: {
			from: string;
			to: string;
			departmentId?: string;
			managerId?: string;
			employeeId?: string;
		}) => [...employeesQueryKeys.employees.all, "schedule-calendar", params] as const,
		scheduleCalendarGrid: (params: {
			from: string;
			to: string;
			departmentId?: string;
			employeeId?: string;
			consecutiveLimit?: number;
		}) => [...employeesQueryKeys.employees.all, "schedule-calendar-grid", params] as const,
		teamScheduleCollections: (departmentId?: string) =>
			[
				...employeesQueryKeys.employees.all,
				"team-schedule-collections",
				departmentId,
			] as const,
		documentApprovals: (params?: ApiQueryParams) =>
			[...employeesQueryKeys.employees.all, "document-approvals", params] as const,
		documentReviewEvents: (params?: ApiQueryParams) =>
			[...employeesQueryKeys.employees.all, "document-review-events", params] as const,
		organizationReportingCounts: (departmentId?: string | null) =>
			[
				...employeesQueryKeys.employees.all,
				"organization-reporting-counts",
				departmentId || "all",
			] as const,
	},
};

/**
 * Hook to fetch list of employees with filters
 */
export const useEmployees = (
	params?: ApiQueryParams,
	options?: {
		enabled?: boolean;
	},
) => {
	return useQuery<EmployeesResponse>({
		queryKey: employeesQueryKeys.employees.list(params),
		queryFn: () => {
			return employeesService
				.clearQueryParams()
				.select([
					"id",
					"role",
					"userId",
					"person.personalInfo",
					"person.contactInfo",
					"employeeId",
					"deviceEmpId",
					"deviceId",
					"isManager",
					"isHrManager",
					"employmentHireDate",
					"employmentTerminationDate",
					"departmentId",
					"department.id",
					"department.name",
					"department.code",
					"department.managerId",
					"sectionId",
					"section.id",
					"section.name",
					"section.code",
					"positionId",
					"levelId",
					"level.id",
					"level.name",
					"level.rank",
					"level.isManager",
					"position.id",
					"position.title",
					"position.code",
					"employmentStatus",
					"employmentType",
					"workforceSource",
					"agencyId",
					"agency.id",
					"agency.name",
					"agency.code",
					"probationEndDate",
					"reportToId",
					"reportTo.person.personalInfo",
					"reportTo.id",
					// Avatar is not a Prisma relation on Employee; user data is enriched
					// client/API-side when document=true (do not select user.* here).
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getEmployees(true);
		},
		enabled: options?.enabled ?? true,
		placeholderData: keepPreviousData,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const EMPLOYEE_SCHEDULE_ROSTER_FIELDS = [
	"id",
	"employeeId",
	"organizationId",
	"person.personalInfo",
	"departmentId",
	"department.id",
	"department.name",
	"department.code",
	"sectionId",
	"section.id",
	"section.name",
	"section.code",
	"employmentStatus",
	"embeddedSchedule",
] as const;

export const useEmployeeScheduleRoster = (
	params?: ApiQueryParams,
	options?: {
		enabled?: boolean;
	},
) => {
	return useQuery<EmployeesResponse>({
		queryKey: [...employeesQueryKeys.employees.lists(), "schedule-roster", { params }],
		queryFn: () => {
			return employeesService
				.clearQueryParams()
				.select([...EMPLOYEE_SCHEDULE_ROSTER_FIELDS])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 25)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getEmployees(true);
		},
		enabled: options?.enabled ?? true,
		placeholderData: keepPreviousData,
		staleTime: 60 * 1000,
	});
};

export const useEmployee = (id: string, fields?: string | string[], params?: ApiQueryParams) => {
	// Default fields to include if not specified
	const defaultFields = [
		"id",
		"employeeId",
		"organizationId",
		"personId",
		"userId",
		"deviceEmpId",
		"deviceId",
		"employmentHireDate",
		"employmentStartDate",
		"employmentTerminationDate",
		"employmentStatus",
		"employmentType",
		"isManager",
		"isHrManager",
		"probationEndDate",
		"leaveBalances",
		"departmentId",
		"positionId",
		"workLocation",
		"workforceSource",
		"agencyId",
		"agency.id",
		"agency.name",
		"agency.code",
		"basicSalary",
		"currency",
		"payFrequency",
		"person.personalInfo",
		"person.contactInfo",
		"person.identification",
		"person.children",
		"department.id",
		"department.name",
		"department.code",
		"department.managerId",
		"sectionId",
		"section.id",
		"section.name",
		"section.code",
		"section.departmentId",
		"position.id",
		"position.title",
		"position.code",
		"reportToId",
		"reportTo.person.personalInfo",
		"levelId",
		"level.id",
		"level.name",
		"level.rank",
		"level.isManager",
		"documents",
		"role",
		"activeSchedule",
		"schedules.id",
		"schedules.startDate",
		"schedules.endDate",
		"schedules.scheduleId",
		"schedules.scheduleCode",
		"schedules.scheduleName",
		"schedules.shifts",
		"schedules.gracePeriodMinutes",
		"schedules.source",
		"schedules.changedByEmployeeId",
		"schedules.changedAt",
		// Explicit benefit scalars only. Bare `employeeBenefits` expands to every
		// Prisma scalar and 500s when the DB is behind an additive migration
		// (for example eligibilityMode on employee_benefits).
		"employeeBenefits.id",
		"employeeBenefits.benefitTypeId",
		"employeeBenefits.name",
		"employeeBenefits.description",
		"employeeBenefits.totalAmount",
		"employeeBenefits.currency",
		"employeeBenefits.totalInstallments",
		"employeeBenefits.installmentAmount",
		"employeeBenefits.remainingBalance",
		"employeeBenefits.scheduleMode",
		"employeeBenefits.amount",
		"employeeBenefits.startDate",
		"employeeBenefits.endDate",
		"employeeBenefits.status",
		"employeeBenefits.isActive",
		"employeeBenefits.notes",
	];

	const selectedFields = fields || defaultFields;

	return useQuery<Employee>({
		queryKey: employeesQueryKeys.employees.detail(id, selectedFields), // TODO: Add params to queryKey if needed for caching uniqueness
		queryFn: () => employeesService.getEmployeeById(id, selectedFields, params),
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useOrganizationReportingCounts = (
	params?: { departmentId?: string | null },
	options?: { enabled?: boolean },
) => {
	return useQuery({
		queryKey: employeesQueryKeys.employees.organizationReportingCounts(params?.departmentId),
		queryFn: () => employeesService.getOrganizationReportingCounts(params),
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000,
	});
};

/**
 * Hook to fetch users for filtering (e.g., HR and Managers)
 */
export const useFilterUsers = () => {
	return useQuery({
		queryKey: employeesQueryKeys.employees.filterUsers(),
		queryFn: () => employeesService.getFilterUsers(),
		staleTime: 10 * 60 * 1000, // 10 minutes
	});
};

/**
 * Hook to fetch employee eligibility candidates
 */
export const useEmployeeEligibility = (params?: ApiQueryParams) => {
	return useQuery<EmployeeEligibilityResponse>({
		queryKey: employeesQueryKeys.employees.eligibility(params),
		queryFn: () => employeesService.getEmployeeEligibility(params),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useEmployeeSchedules = (employeeId: string) => {
	return useQuery<EmployeeSchedulesResponse>({
		queryKey: employeesQueryKeys.employees.schedules(employeeId),
		queryFn: () => employeesService.getEmployeeSchedules(employeeId),
		enabled: !!employeeId,
		staleTime: 2 * 60 * 1000,
	});
};

export const useTeamScheduleCalendar = (params: {
	from: string;
	to: string;
	departmentId?: string;
	managerId?: string;
	employeeId?: string;
}) => {
	return useQuery<TeamScheduleCalendarResponse>({
		queryKey: employeesQueryKeys.employees.scheduleCalendar(params),
		queryFn: () => employeesService.getTeamScheduleCalendar(params),
		enabled: !!params.from && !!params.to,
		staleTime: 2 * 60 * 1000,
	});
};

export const useTeamScheduleCalendarGrid = (
	params: {
		from: string;
		to: string;
		departmentId?: string;
		employeeId?: string;
		consecutiveLimit?: number;
	},
	options?: {
		enabled?: boolean;
	},
) => {
	return useQuery<TeamScheduleCalendarGridResponse>({
		queryKey: employeesQueryKeys.employees.scheduleCalendarGrid(params),
		queryFn: () => employeesService.getTeamScheduleCalendarGrid(params),
		enabled: !!params.from && !!params.to && (options?.enabled ?? true),
		staleTime: 2 * 60 * 1000,
	});
};

export const useTeamScheduleCollections = (
	departmentId?: string,
	options?: {
		enabled?: boolean;
	},
) => {
	return useQuery<TeamScheduleCollectionsResponse>({
		queryKey: employeesQueryKeys.employees.teamScheduleCollections(departmentId),
		queryFn: () => employeesService.getTeamScheduleCollections(departmentId),
		enabled: options?.enabled ?? true,
		staleTime: 2 * 60 * 1000,
	});
};

// Mutation hooks
export const useCreateEmployee = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateEmployeeRequest) => {
			return await employeesService.createEmployee(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: employeesQueryKeys.employees.all });
			sonnerToast.success("Employee created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create employee");
		},
	});
};

// Create employee together with a linked user account
export const useCreateEmployeeWithAccount = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateEmployeeWithAccountRequest) => {
			return await employeesService.createEmployeeWithAccount(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: employeesQueryKeys.employees.all });
			sonnerToast.success("Employee and account created successfully");
		},
		onError: (error: any) => {
			const { title, description } = getToastErrorMessage(error);
			sonnerToast.error(title, description ? { description } : undefined);
		},
	});
};

export const useReserveEmployeeId = () => {
	return useMutation({
		mutationFn: async ({ organizationId }: { organizationId: string }) => {
			return await employeesService.reserveEmployeeId(organizationId);
		},
	});
};

export const useUpdateEmployee = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdateEmployeeRequest }) => {
			return await employeesService.updateEmployee(id, payload);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: employeesQueryKeys.employees.all });
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.detail(data.id),
			});
			sonnerToast.success("Employee updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update employee");
		},
	});
};

export const useAssignEmployeeSchedule = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			employeeId,
			payload,
		}: {
			employeeId: string;
			payload: SetActiveEmployeeScheduleRequest;
		}) => {
			return await employeesService.setActiveEmployeeSchedule(employeeId, payload);
		},
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: employeesQueryKeys.employees.all });
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.detail(variables.employeeId),
			});
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.schedules(variables.employeeId),
			});
			sonnerToast.success("Schedule assigned successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to assign schedule");
		},
	});
};

export const useDeactivateEmployeeSchedule = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ employeeId, entryId }: { employeeId: string; entryId: string }) => {
			return await employeesService.deactivateEmployeeSchedule(employeeId, entryId);
		},
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: employeesQueryKeys.employees.all });
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.detail(variables.employeeId),
			});
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.schedules(variables.employeeId),
			});
			sonnerToast.success("Scheduled change cancelled");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to cancel scheduled change");
		},
	});
};

export const useCreateTeamScheduleCollection = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: any) => employeesService.createTeamScheduleCollection(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.teamScheduleCollections(),
			});
			queryClient.invalidateQueries({ queryKey: employeesQueryKeys.employees.all });
			sonnerToast.success("Department schedule created");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create department schedule");
		},
	});
};

export const useUpdateTeamScheduleCollection = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ collectionId, payload }: { collectionId: string; payload: any }) =>
			employeesService.updateTeamScheduleCollection(collectionId, payload),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.teamScheduleCollections(),
			});
			queryClient.invalidateQueries({ queryKey: employeesQueryKeys.employees.all });
			sonnerToast.success("Department schedule updated");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update department schedule");
		},
	});
};

export const useArchiveTeamScheduleCollection = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ collectionId }: { collectionId: string }) =>
			employeesService.archiveTeamScheduleCollection(collectionId),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.teamScheduleCollections(),
			});
			queryClient.invalidateQueries({ queryKey: employeesQueryKeys.employees.all });
			sonnerToast.success("Department schedule archived");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to archive department schedule");
		},
	});
};

export const useApplyTeamScheduleRotation = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: any) => employeesService.applyTeamScheduleRotation(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [...employeesQueryKeys.employees.all, "schedule-calendar-grid"],
			});
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.teamScheduleCollections(),
			});
			sonnerToast.success("Rotation applied");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to apply rotation");
		},
	});
};

export const useOverrideTeamScheduleLedger = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: any) => employeesService.overrideTeamScheduleLedger(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [...employeesQueryKeys.employees.all, "schedule-calendar-grid"],
			});
			sonnerToast.success("Schedule override saved");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to save override");
		},
	});
};

// Update employee together with linked user account
export const useUpdateEmployeeWithAccount = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			id,
			payload,
		}: {
			id: string;
			payload: CreateEmployeeWithAccountRequest;
		}) => {
			return await employeesService.updateEmployeeWithAccount(id, payload);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: employeesQueryKeys.employees.all });
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.detail(data.id),
			});
			sonnerToast.success("Employee and account updated successfully");
		},
		onError: (error: any) => {
			const { title, description } = getToastErrorMessage(error);
			sonnerToast.error(title, description ? { description } : undefined);
		},
	});
};

export const useDeleteEmployee = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			return await employeesService.deleteEmployee(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: employeesQueryKeys.employees.all });
			sonnerToast.success("Employee deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete employee");
		},
	});
};

// Employee Attendance Query hooks
export const useEmployeeAttendance = (
	employeeId: string,
	params?: EmployeeAttendanceQueryParams,
	options?: {
		enabled?: boolean;
	},
) => {
	return useQuery<EmployeeAttendanceResponse>({
		queryKey: employeesQueryKeys.employees.attendanceList(employeeId, params),
		queryFn: () => employeesService.getEmployeeAttendance(employeeId, params),
		enabled: !!employeeId && (options?.enabled ?? true),
		placeholderData: keepPreviousData,
		staleTime: 2 * 60 * 1000, // 2 minutes
	});
};

export const useTodayAttendance = (
	employeeId: string,
	options?: {
		enabled?: boolean;
	},
) => {
	return useQuery<EmployeeAttendanceRecord | null>({
		queryKey: employeesQueryKeys.employees.attendanceToday(employeeId),
		queryFn: () => employeesService.getTodayAttendance(employeeId),
		enabled: !!employeeId && (options?.enabled ?? true),
		staleTime: 1 * 60 * 1000, // 1 minute
	});
};

export const useAttendanceRecord = (employeeId: string, attendanceId: string) => {
	return useQuery<EmployeeAttendanceRecord>({
		queryKey: employeesQueryKeys.employees.attendanceRecord(employeeId, attendanceId),
		queryFn: () => employeesService.getAttendanceRecord(employeeId, attendanceId),
		enabled: !!employeeId && !!attendanceId,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Employee Attendance Mutation hooks
export const useMarkAttendance = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			employeeId,
			data,
		}: {
			employeeId: string;
			data: MarkAttendanceRequest;
		}) => {
			return await employeesService.markEmployeeAttendance(employeeId, data);
		},
		onSuccess: (data, variables) => {
			// Invalidate specific employee attendance
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendanceByEmployee(variables.employeeId),
			});
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendanceToday(variables.employeeId),
			});
			// Invalidate all attendance queries (for manager/admin views)
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendance(),
			});
			sonnerToast.success("Attendance marked successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to mark attendance");
		},
	});
};

export const useClockIn = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			employeeId,
			location,
			notes,
		}: {
			employeeId: string;
			location?: { lat: number; lng: number };
			notes?: string;
		}) => {
			return await employeesService.clockIn(employeeId, location, notes);
		},
		onSuccess: (data, variables) => {
			const attendance = (data as any)?.attendance || data;
			if (attendance) {
				queryClient.setQueryData(
					employeesQueryKeys.employees.attendanceToday(variables.employeeId),
					attendance,
				);
			}
			// Invalidate specific employee attendance
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendanceByEmployee(variables.employeeId),
			});
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendanceToday(variables.employeeId),
			});
			// Invalidate all attendance queries (for manager/admin views)
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendance(),
			});
			queryClient.invalidateQueries({ queryKey: metricsQueryKeys.metrics.all });
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			sonnerToast.success("Clocked in successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to clock in");
		},
	});
};

export const useClockOut = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			employeeId,
			location,
			notes,
		}: {
			employeeId: string;
			location?: { lat: number; lng: number };
			notes?: string;
		}) => {
			return await employeesService.clockOut(employeeId, location, notes);
		},
		onSuccess: (data, variables) => {
			const attendance = (data as any)?.attendance || data;
			if (attendance) {
				queryClient.setQueryData(
					employeesQueryKeys.employees.attendanceToday(variables.employeeId),
					attendance,
				);
			}
			// Invalidate specific employee attendance
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendanceByEmployee(variables.employeeId),
			});
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendanceToday(variables.employeeId),
			});
			// Invalidate all attendance queries (for manager/admin views)
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendance(),
			});
			queryClient.invalidateQueries({ queryKey: metricsQueryKeys.metrics.all });
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			sonnerToast.success("Clocked out successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to clock out");
		},
	});
};

export const useUpdateAttendanceRecord = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			employeeId,
			attendanceId,
			data,
		}: {
			employeeId: string;
			attendanceId: string;
			data: UpdateAttendanceRequest;
		}) => {
			return await employeesService.updateAttendanceRecord(employeeId, attendanceId, data);
		},
		onSuccess: (data, variables) => {
			// Invalidate specific employee attendance
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendanceByEmployee(variables.employeeId),
			});
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendanceToday(variables.employeeId),
			});
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendanceRecord(
					variables.employeeId,
					variables.attendanceId,
				),
			});
			// Invalidate all attendance queries (for manager/admin views)
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendance(),
			});
			queryClient.invalidateQueries({ queryKey: metricsQueryKeys.metrics.all });
			sonnerToast.success("Attendance record updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update attendance record");
		},
	});
};

export const useDeleteAttendanceRecord = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			employeeId,
			attendanceId,
		}: {
			employeeId: string;
			attendanceId: string;
		}) => {
			return await employeesService.deleteAttendanceRecord(employeeId, attendanceId);
		},
		onSuccess: (_, variables) => {
			// Invalidate specific employee attendance
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendanceByEmployee(variables.employeeId),
			});
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendanceToday(variables.employeeId),
			});
			// Invalidate all attendance queries (for manager/admin views)
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendance(),
			});
			queryClient.invalidateQueries({ queryKey: metricsQueryKeys.metrics.all });
			sonnerToast.success("Attendance record deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete attendance record");
		},
	});
};

export const useDebugDeleteTodayAttendance = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (employeeId: string) => {
			return await employeesService.debugDeleteTodayAttendance(employeeId);
		},
		onSuccess: (result: DebugAttendanceResetResult, employeeId) => {
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendanceByEmployee(employeeId),
			});
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendanceToday(employeeId),
			});
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendance(),
			});
			queryClient.invalidateQueries({ queryKey: metricsQueryKeys.metrics.all });
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			sonnerToast.success(
				`Reset ${result.attendanceDeleted} attendance and ${result.attendanceObligationsDeleted} obligation row(s) for ${result.businessDate}`,
			);
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to reset today's attendance");
		},
	});
};

// Employee Managed Departments Query hooks
export const useManagedDepartments = (employeeId: string, params?: any) => {
	return useQuery<ManagedDepartmentsResponse>({
		queryKey: employeesQueryKeys.employees.managedDepartmentsList(employeeId, params),
		queryFn: () => employeesService.getManagedDepartments(employeeId, params),
		enabled: !!employeeId,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useManagedDepartment = (employeeId: string, departmentId: string) => {
	return useQuery<ManagedDepartment>({
		queryKey: employeesQueryKeys.employees.managedDepartment(employeeId, departmentId),
		queryFn: () => employeesService.getManagedDepartmentById(employeeId, departmentId),
		enabled: !!employeeId && !!departmentId,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// removed useDefaultManagedDepartment

// Employee Department (belongs-to) Query hook
export const useEmployeeDepartment = (employeeId: string, params?: any) => {
	return useQuery<ManagedDepartment>({
		queryKey: employeesQueryKeys.employees.departmentOfEmployee(employeeId, params),
		queryFn: () => employeesService.getEmployeeDepartment(employeeId, params),
		enabled: !!employeeId,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Employee Import Mutation hook
export const useImportEmployees = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			file,
			options,
		}: {
			file: File;
			options?: {
				autoCreate?: boolean;
				applyDefaultLeaveBalances?: boolean;
				importMode?: "fast" | "full";
				enableAccountProvisioning?: boolean;
				enableCredentialEmails?: boolean;
				enablePostActions?: boolean;
			};
		}) => {
			return await employeesService.importEmployees(file, options);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: employeesQueryKeys.employees.all });
			// Don't show toast here - let the component handle it
		},
		onError: (error: any) => {
			// Don't show toast here - let the component handle it
		},
	});
};

/**
 * Migration import hook — uses the migration API (POST /api/migration/upload-csv).
 * Returns the full migration result synchronously (no jobId polling needed).
 * Preferred for bulk imports of thousands of employees.
 */
export const useMigrateEmployees = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			file,
			options,
		}: {
			file: File;
			options?: { autoCreate?: boolean; dryRun?: boolean };
		}) => {
			return await employeesService.migrateEmployees(file, options);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: employeesQueryKeys.employees.all });
		},
		onError: () => {
			// Let the component handle toast messages
		},
	});
};

export const useExtractMigrationSources = () => {
	return useMutation({
		mutationFn: async ({ files }: { files: File[] }) => {
			return await employeesService.extractMigrationSources(files);
		},
		onError: () => {
			// Let the page handle extractor-specific error messaging
		},
	});
};

export const useTransformMigrationSource = () => {
	return useMutation({
		mutationFn: async (options: {
			file: File;
			sheetName: string;
			fieldMapping: Record<string, string>;
			splitRules?: Array<{
				targetField: string;
				sourceColumn: string;
				delimiter: string;
				segmentIndex: number;
			}>;
		}) => {
			return await employeesService.transformMigrationSource(options as any);
		},
		onError: () => {
			// Let the page handle transform-specific error messaging
		},
	});
};

/**
 * Hook to upload a document for an employee
 */
export const useUploadEmployeeDocument = (employeeId: string) => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (formData: {
			file?: File;
			type: string;
			number?: string;
			issueDate?: string;
			expiryDate?: string;
			documentTypeId?: string;
			fieldValues?: Record<string, unknown>;
		}) => {
			return await employeesService.uploadDocument(employeeId, formData);
		},
		onSuccess: (data) => {
			// Invalidate the employee detail query to refresh documents
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.detail(employeeId),
			});
		},
	});
};

/**
 * Hook to update a document for an employee
 */
export const useUpdateEmployeeDocument = (employeeId: string) => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: {
			documentNumber: string;
			formData: {
				file?: File;
				type?: string;
				documentTypeId?: string;
				number?: string;
				issueDate?: string;
				expiryDate?: string;
				fieldValues?: Record<string, unknown>;
			};
		}) => {
			return await employeesService.updateDocument(payload.documentNumber, payload.formData);
		},
		onSuccess: (data) => {
			// Invalidate the employee detail query to refresh documents
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.detail(employeeId),
			});
		},
	});
};

/**
 * Hook to delete a document for an employee
 */
export const useDeleteEmployeeDocument = (employeeId: string) => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (documentId: string) => {
			return await employeesService.deleteDocument(employeeId, documentId);
		},
		onSuccess: (data) => {
			// Invalidate the employee detail query to refresh documents
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.detail(employeeId),
			});
		},
	});
};

export const useReviewEmployeeDocument = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: {
			documentId: string;
			action: "approve" | "reject";
			rejectionReason?: string;
			comments?: string;
			employeeId?: string;
		}) => {
			return await employeesService.reviewDocument(payload.documentId, {
				action: payload.action,
				rejectionReason: payload.rejectionReason,
				comments: payload.comments,
			});
		},
		onSuccess: async (_data, variables) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: employeesQueryKeys.employees.all }),
				queryClient.invalidateQueries({
					queryKey: employeesQueryKeys.employees.documentApprovals(),
				}),
				queryClient.invalidateQueries({
					queryKey: employeesQueryKeys.employees.documentReviewEvents(),
				}),
				variables.employeeId
					? queryClient.invalidateQueries({
							queryKey: employeesQueryKeys.employees.detail(variables.employeeId),
						})
					: Promise.resolve(),
				queryClient.invalidateQueries({ queryKey: metricsQueryKeys.metrics.all }),
			]);
			sonnerToast.success("Document review saved");
		},
		onError: (error: any) => {
			const { title, description } = getToastErrorMessage(error);
			sonnerToast.error(title, { description });
		},
	});
};

export const useEmployeeDocumentApprovals = (
	params?: ApiQueryParams,
	options?: { enabled?: boolean },
) => {
	return useQuery({
		queryKey: employeesQueryKeys.employees.documentApprovals(params),
		queryFn: () => employeesService.getDocumentApprovals(params),
		placeholderData: keepPreviousData,
		enabled: options?.enabled ?? true,
	});
};

export const useEmployeeDocumentReviewEvents = (
	params?: ApiQueryParams,
	options?: { enabled?: boolean },
) => {
	return useQuery({
		queryKey: employeesQueryKeys.employees.documentReviewEvents(params),
		queryFn: () => employeesService.getDocumentReviewEvents(params),
		placeholderData: keepPreviousData,
		enabled: options?.enabled ?? true,
	});
};

export const useUpdateEmployeeDocuments = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			employeeId,
			payload,
		}: {
			employeeId: string;
			payload: UpdateEmployeeDocumentsRequest;
		}) => {
			return await employeesService.updateEmployeeDocuments(employeeId, payload);
		},
		onSuccess: async (_data, variables) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: employeesQueryKeys.employees.all }),
				queryClient.invalidateQueries({
					queryKey: [...employeesQueryKeys.employees.details(), variables.employeeId],
				}),
				queryClient.invalidateQueries({
					queryKey: metricsQueryKeys.metrics.all,
				}),
			]);
			sonnerToast.success("Employee documents updated successfully");
		},
		onError: (error: any) => {
			const { title, description } = getToastErrorMessage(error);
			sonnerToast.error(title, { description });
		},
	});
};

// --- Document Folders Hooks ---
export const useCustomDocumentFolders = (employeeId?: string) => {
	return useQuery({
		queryKey: ["document-folders", employeeId],
		queryFn: async () => {
			if (!employeeId) return [];
			return await employeesService.getCustomDocumentFolders(employeeId);
		},
		enabled: !!employeeId,
	});
};

export const useCreateCustomDocumentFolder = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ employeeId, name }: { employeeId: string; name: string }) => {
			return await employeesService.createCustomDocumentFolder(employeeId, name);
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: ["document-folders", variables.employeeId],
			});
		},
	});
};

export const useDeleteCustomDocumentFolder = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ folderId, employeeId }: { folderId: string; employeeId: string }) => {
			return await employeesService.deleteCustomDocumentFolder(folderId);
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: ["document-folders", variables.employeeId],
			});
		},
	});
};

// Re-export types
export type { CreateEmployeeWithAccountRequest, EligibilityCandidate, EmployeeEligibilityResponse };
