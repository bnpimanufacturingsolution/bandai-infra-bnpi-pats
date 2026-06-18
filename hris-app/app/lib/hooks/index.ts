// Export all hooks
export * from "./useAuth";
export * from "./useEmployees";
export * from "./usePayroll";
export * from "./useTeamAttendance";
export * from "./useRequests";
export * from "./useEmployeePayroll";
export * from "./useApplicants";
export * from "./useLeaveSettings";
export * from "./useAgencies";

// Export hooks with queryKeys conflicts using named exports
export {
	useShiftTypes,
	useShiftType,
	useCreateShiftType,
	useUpdateShiftType,
	useDeleteShiftType,
	useImportShiftTypes,
	useScheduleTemplates,
	useScheduleTemplate,
	useCreateScheduleTemplate,
	useUpdateScheduleTemplate,
	useDeleteScheduleTemplate,
	useDuplicateScheduleTemplate,
	useEmployeeSchedules,
	useEmployeeScheduleCalendar,
	useCreateEmployeeSchedule,
	useUpdateEmployeeSchedule,
	useScheduleOverrides,
	useScheduleOverride,
	useCreateScheduleOverride,
	useUpdateScheduleOverride,
	useDeleteScheduleOverride,
	useImportSchedules,
} from "./useSchedules";

export { useRoles, useRole, useCreateRole, useUpdateRole, useDeleteRole } from "./useRoles";
