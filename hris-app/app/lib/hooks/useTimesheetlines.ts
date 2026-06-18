import { useQuery } from "@tanstack/react-query";
import timesheetlineService, {
	type TimesheetlinesResponse,
} from "~/services/timesheetline.service";
import type { ApiQueryParams } from "~/services/api-service";

export const timesheetlineQueryKeys = {
	timesheetlines: {
		all: ["timesheetlines"] as const,
		lists: () => [...timesheetlineQueryKeys.timesheetlines.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...timesheetlineQueryKeys.timesheetlines.lists(), { params }] as const,
	},
};

export const useTimesheetlines = (params?: ApiQueryParams) => {
	const { enabled, ...queryParams } = params || {};
	return useQuery<TimesheetlinesResponse>({
		queryKey: timesheetlineQueryKeys.timesheetlines.list(queryParams),
		queryFn: () =>
			timesheetlineService
				.clearQueryParams()
				.select([
					"id",
					"organizationId",
					"employeeId",
					"timesheetId",
					"payrollPeriodId",
					"attendanceId",
					"date",
					"timeIn",
					"timeBreak",
					"timeOut",
					"status",
					"behaviorFlags",
					"scheduleSnapshot",
					"hoursWorked",
					"regularHours",
					"overtimeHours",
					"undertimeHours",
					"lateHours",
					"earlyOutHours",
					"breakMinutes",
					"employeeNotes",
					"approverNotes",
					"notes",
					"metadata",
					"primaryMarker",
					"isManualEntry",
					"isVirtual",
					"employeeCodeSnapshot",
					"employeeNameSnapshot",
					"departmentIdSnapshot",
					"departmentNameSnapshot",
					"reportToIdSnapshot",
					"timesheet.id",
					"timesheet.code",
					"timesheet.status",
					"employee.id",
					"employee.employeeId",
					"employee.person.personalInfo",
					"employee.position.title",
					"employee.department.name",
					"payrollPeriod.id",
					"payrollPeriod.name",
					"payrollPeriod.code",
					"payrollPeriod.startDate",
					"payrollPeriod.endDate",
				])
				.search(queryParams.query)
				.paginate(queryParams.page || 1, queryParams.limit || 10)
				.sort(queryParams.sort, queryParams.order)
				.setParams({ ...queryParams, document: true })
				.getTimesheetlines(),
		enabled: enabled !== false,
		staleTime: 2 * 60 * 1000,
	});
};
