import { useQuery } from "@tanstack/react-query";
import { useAuth } from "~/lib/hooks/use-auth";
import metricsService, {
	type ActionMetricsResponse,
	type ActionMetricDashboardItem,
	type ActionMetricDocumentCategorySummary,
	type ActionMetricDocumentItem,
	type MetricsResponse,
	type StatusSummaryResponse,
	type EmployeeStatusSummaryResponse,
	type DocumentComplianceResponse,
	type PayrollBlockersResponse,
	type PayrollReadinessScope,
	type PayrollRunSummaryResponse,
	type AttendanceMetricsDetailedResponse,
	type AttendanceTimesheetLineSummaryResponse,
	type AttendanceDailyTrendByDepartmentResponse,
	type AttendanceTodayOpsSummaryResponse,
	type TimesheetStatisticsResponse,
	type MetricsRequest,
	type PerfectAttendanceResponse,
	type TardinessMetricsResponse,
	type OvertimeMetricsResponse,
	type PayrollSummaryResponse,
	type NoWorkReportResponse,
	type DailyActiveManpowerResponse,
	type AgencyAttendanceSummaryResponse,
	type DirectIndirectLaborSummaryResponse,
	type LeaveBalanceMetricsResponse,
	type Bir1601CMetricsResponse,
	type TurnoverAttritionReportResponse,
	type TurnoverAttritionGroupBy,
} from "~/services/metrics.service";

// Query keys structure
export const queryKeys = {
	metrics: {
		all: ["metrics"] as const,
		generic: (model: string, data: string[], filter?: any) =>
			[...queryKeys.metrics.all, "generic", model, data, filter] as const,
		attendance: (employeeId: string, dateFrom?: string, dateTo?: string) =>
			[...queryKeys.metrics.all, "attendance", employeeId, dateFrom, dateTo] as const,
		statusSummary: (dateFrom: string, dateTo: string) =>
			[...queryKeys.metrics.all, "statusSummary", dateFrom, dateTo] as const,
		employeeStatusSummary: (reportToId: string, dateFrom: string, dateTo: string) =>
			[
				...queryKeys.metrics.all,
				"employeeStatusSummary",
				reportToId,
				dateFrom,
				dateTo,
			] as const,
		birthdaysSummary: (organizationId: string) =>
			[...queryKeys.metrics.all, "birthdaysSummary", organizationId] as const,
		documentCompliance: (
			organizationId?: string,
			departmentId?: string,
			sectionId?: string,
			reportToId?: string,
		) =>
			[
				...queryKeys.metrics.all,
				"documentCompliance",
				organizationId,
				departmentId,
				sectionId,
				reportToId,
			] as const,
		actionMetrics: (employeeId?: string) =>
			[...queryKeys.metrics.all, "actionMetrics", employeeId || "self"] as const,
		payrollBlockers: (payrollPeriodId?: string, scope?: PayrollReadinessScope) =>
			[
				...queryKeys.metrics.all,
				"payrollBlockers",
				payrollPeriodId,
				scope?.departmentId || null,
				scope?.sectionId || null,
			] as const,
		payrollRunSummary: (payrollPeriodId?: string, scope?: PayrollReadinessScope) =>
			[
				...queryKeys.metrics.all,
				"payrollRunSummary",
				payrollPeriodId,
				scope?.departmentId || null,
				scope?.sectionId || null,
			] as const,
		attendanceMetricsDetailed: (
			dateFrom?: string,
			dateTo?: string,
			limit?: number,
			page?: number,
			search?: string,
			status?: string,
			departmentId?: string,
			sectionId?: string,
			positionId?: string,
			levelId?: string,
			reportToId?: string,
			employeeId?: string,
			shiftType?: string,
		) =>
			[
				...queryKeys.metrics.all,
				"attendanceMetricsDetailed",
				dateFrom,
				dateTo,
				limit,
				page,
				search,
				status,
				departmentId,
				sectionId,
				positionId,
				levelId,
				reportToId,
				employeeId,
				shiftType,
			] as const,
		attendanceTodayOpsSummary: (
			dateFrom?: string,
			dateTo?: string,
			search?: string,
			departmentId?: string,
			sectionId?: string,
			positionId?: string,
			levelId?: string,
			reportToId?: string,
			employeeId?: string,
			shiftType?: string,
		) =>
			[
				...queryKeys.metrics.all,
				"attendanceTodayOpsSummary",
				dateFrom,
				dateTo,
				search,
				departmentId,
				sectionId,
				positionId,
				levelId,
				reportToId,
				employeeId,
				shiftType,
			] as const,
		attendanceTimesheetLineSummary: (
			dateFrom?: string,
			dateTo?: string,
			search?: string,
			status?: string,
			departmentId?: string,
			sectionId?: string,
			positionId?: string,
			levelId?: string,
			reportToId?: string,
			employeeId?: string,
			shiftType?: string,
		) =>
			[
				...queryKeys.metrics.all,
				"attendanceTimesheetLineSummary",
				dateFrom,
				dateTo,
				search,
				status,
				departmentId,
				sectionId,
				positionId,
				levelId,
				reportToId,
				employeeId,
				shiftType,
			] as const,
		attendanceObligationSummary: (
			dateFrom?: string,
			dateTo?: string,
			search?: string,
			status?: string,
			departmentId?: string,
			sectionId?: string,
			positionId?: string,
			levelId?: string,
			reportToId?: string,
			employeeId?: string,
			shiftType?: string,
		) =>
			[
				...queryKeys.metrics.all,
				"attendanceObligationSummary",
				dateFrom,
				dateTo,
				search,
				status,
				departmentId,
				sectionId,
				positionId,
				levelId,
				reportToId,
				employeeId,
				shiftType,
			] as const,
		attendanceDailyTrendByDepartment: (
			dateFrom?: string,
			dateTo?: string,
			search?: string,
			status?: string,
			departmentId?: string,
			reportToId?: string,
			employeeId?: string,
			shiftType?: string,
		) =>
			[
				...queryKeys.metrics.all,
				"attendanceDailyTrendByDepartment",
				dateFrom,
				dateTo,
				search,
				status,
				departmentId,
				reportToId,
				employeeId,
				shiftType,
			] as const,
		timesheetStatistics: (filter?: Record<string, any>) =>
			[...queryKeys.metrics.all, "timesheetStatistics", filter] as const,
		perfectAttendance: (dateFrom?: string, dateTo?: string, departmentId?: string) =>
			[
				...queryKeys.metrics.all,
				"perfectAttendance",
				dateFrom,
				dateTo,
				departmentId,
			] as const,
		tardinessMetrics: (dateFrom?: string, dateTo?: string, departmentId?: string) =>
			[...queryKeys.metrics.all, "tardinessMetrics", dateFrom, dateTo, departmentId] as const,
		overtimeMetrics: (dateFrom?: string, dateTo?: string, departmentId?: string) =>
			[...queryKeys.metrics.all, "overtimeMetrics", dateFrom, dateTo, departmentId] as const,
		noWorkReport: (dateFrom?: string, departmentId?: string, reportToId?: string) =>
			[...queryKeys.metrics.all, "noWorkReport", dateFrom, departmentId, reportToId] as const,
		dailyActiveManpower: (dateFrom?: string, departmentId?: string, reportToId?: string) =>
			[
				...queryKeys.metrics.all,
				"dailyActiveManpower",
				dateFrom,
				departmentId,
				reportToId,
			] as const,
		agencyAttendanceSummary: (
			dateFrom?: string,
			dateTo?: string,
			departmentId?: string,
			reportToId?: string,
		) =>
			[
				...queryKeys.metrics.all,
				"agencyAttendanceSummary",
				dateFrom,
				dateTo,
				departmentId,
				reportToId,
			] as const,
		directIndirectLaborSummary: (
			dateFrom?: string,
			dateTo?: string,
			departmentId?: string,
			reportToId?: string,
			laborType?: "ALL" | "DIRECT" | "INDIRECT",
		) =>
			[
				...queryKeys.metrics.all,
				"directIndirectLaborSummary",
				dateFrom,
				dateTo,
				departmentId,
				reportToId,
				laborType,
			] as const,
		payrollSummary: (
			dateFrom?: string,
			dateTo?: string,
			payrollPeriodId?: string,
			departmentId?: string,
			reportToId?: string,
		) =>
			[
				...queryKeys.metrics.all,
				"payrollSummary",
				dateFrom,
				dateTo,
				payrollPeriodId,
				departmentId,
				reportToId,
			] as const,
		turnoverAttritionReport: (
			dateFrom?: string,
			dateTo?: string,
			groupBy?: TurnoverAttritionGroupBy,
			filters?: {
				departmentId?: string;
				sectionId?: string;
				positionId?: string;
				levelId?: string;
			},
		) =>
			[
				...queryKeys.metrics.all,
				"turnoverAttritionReport",
				dateFrom,
				dateTo,
				groupBy,
				filters?.departmentId,
				filters?.sectionId,
				filters?.positionId,
				filters?.levelId,
			] as const,
		bir1601CMetrics: (filter: {
			month: number;
			year: number;
			departmentId?: string;
			reportToId?: string;
			employeeId?: string;
		}) => [...queryKeys.metrics.all, "bir1601CMetrics", filter] as const,
		leaveBalanceMetrics: (filter?: {
			departmentId?: string;
			reportToId?: string;
			employeeId?: string;
			leaveType?: string;
			periodFrom?: string;
			periodTo?: string;
		}) => [...queryKeys.metrics.all, "leaveBalanceMetrics", filter] as const,
	},
};

/**
 * Generic hook to fetch metrics
 */
export const useMetrics = <T = any>(
	model: string,
	data: string[],
	filter?: Record<string, any>,
) => {
	return useQuery<T>({
		queryKey: queryKeys.metrics.generic(model, data, filter),
		queryFn: () => metricsService.getMetrics<T>({ model, data, filter }),
		staleTime: 5 * 60 * 1000, // 5 minutes default
	});
};

/**
 * Hook to fetch attendance metrics for an employee
 */
export const useAttendanceMetrics = (
	employeeId: string | undefined,
	dateFrom?: string,
	dateTo?: string,
) => {
	return useQuery<MetricsResponse>({
		queryKey: queryKeys.metrics.attendance(employeeId || "", dateFrom, dateTo),
		queryFn: () => {
			if (!employeeId) {
				throw new Error("Employee ID is required");
			}
			return metricsService.getAttendanceMetrics(employeeId, dateFrom, dateTo);
		},
		enabled: !!employeeId,
		staleTime: 1 * 60 * 1000, // 1 minute (attendance data changes frequently)
	});
};

/**
 * Hook to fetch attendance status summary (PRESENT, LEAVE, ABSENT counts)
 */
export const useStatusSummary = (dateFrom: string, dateTo: string) => {
	return useQuery<StatusSummaryResponse>({
		queryKey: queryKeys.metrics.statusSummary(dateFrom, dateTo),
		queryFn: () => metricsService.getStatusSummary(dateFrom, dateTo),
		enabled: !!dateFrom && !!dateTo,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch employee status summary for manager's direct reports
 */
export const useEmployeeStatusSummary = (
	reportToId: string | undefined,
	dateFrom: string,
	dateTo: string,
) => {
	return useQuery<EmployeeStatusSummaryResponse>({
		queryKey: queryKeys.metrics.employeeStatusSummary(reportToId || "", dateFrom, dateTo),
		queryFn: () => {
			if (!reportToId) {
				throw new Error("Manager employee ID is required");
			}
			return metricsService.getEmployeeStatusSummary(reportToId, dateFrom, dateTo);
		},
		enabled: !!reportToId && !!dateFrom && !!dateTo,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch birthdays summary for the current month
 */
export const useBirthdaysSummary = (organizationId: string | undefined) => {
	return useQuery({
		queryKey: queryKeys.metrics.birthdaysSummary(organizationId || ""),
		queryFn: () => {
			if (!organizationId) {
				throw new Error("Organization ID is required");
			}
			return metricsService.getBirthdaysSummary(organizationId);
		},
		enabled: !!organizationId,
		staleTime: 60 * 60 * 1000, // 1 hour (birthdays don't change often)
	});
};

/**
 * Hook to fetch employee document compliance metrics
 */
export const useDocumentComplianceMetrics = (
	organizationId?: string,
	departmentId?: string,
	sectionId?: string,
	reportToId?: string,
) => {
	return useQuery<DocumentComplianceResponse>({
		queryKey: queryKeys.metrics.documentCompliance(
			organizationId,
			departmentId,
			sectionId,
			reportToId,
		),
		queryFn: () =>
			metricsService.getDocumentComplianceMetrics(
				organizationId,
				departmentId,
				sectionId,
				reportToId,
			),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch payroll blockers for a payroll period
 */
export const usePayrollBlockers = (
	payrollPeriodId: string | undefined,
	enabled: boolean = true,
	limit?: number,
	scope?: PayrollReadinessScope,
) => {
	return useQuery<PayrollBlockersResponse>({
		queryKey: [...queryKeys.metrics.payrollBlockers(payrollPeriodId, scope), { limit }] as const,
		queryFn: () => {
			if (!payrollPeriodId) throw new Error("Payroll period ID is required");
			return metricsService.getPayrollBlockers(payrollPeriodId, limit, scope);
		},
		enabled: !!payrollPeriodId && enabled,
		staleTime: 30 * 1000, // 30 seconds (blockers can change frequently)
		refetchOnWindowFocus: false,
	});
};

export const usePayrollRunSummary = (
	payrollPeriodId: string | undefined,
	enabled: boolean = true,
	scope?: PayrollReadinessScope,
) => {
	return useQuery<PayrollRunSummaryResponse>({
		queryKey: queryKeys.metrics.payrollRunSummary(payrollPeriodId, scope),
		queryFn: () => {
			if (!payrollPeriodId) throw new Error("Payroll period ID is required");
			return metricsService.getPayrollRunSummary(payrollPeriodId, scope);
		},
		enabled: !!payrollPeriodId && enabled,
		staleTime: 30 * 1000,
		refetchOnWindowFocus: false,
	});
};

/**
 * Hook to fetch detailed attendance metrics with employee information
 */
export const useAttendanceMetricsDetailed = (
	dateFrom?: string,
	dateTo?: string,
	limit: number = 100,
	page: number = 1,
	search?: string,
	status?: string,
	departmentId?: string,
	sectionId?: string,
	positionId?: string,
	levelId?: string,
	reportToId?: string,
	employeeId?: string,
	shiftType?: string,
	options: { enabled?: boolean; refetchInterval?: number | false; staleTime?: number } = {},
) => {
	return useQuery<AttendanceMetricsDetailedResponse>({
		queryKey: queryKeys.metrics.attendanceMetricsDetailed(
			dateFrom,
			dateTo,
			limit,
			page,
			search,
			status,
			departmentId,
			sectionId,
			positionId,
			levelId,
			reportToId,
			employeeId,
			shiftType,
		),
		queryFn: () =>
			metricsService.getAttendanceMetricsDetailed(
				dateFrom,
				dateTo,
				limit,
				page,
				search,
				status,
				departmentId,
				sectionId,
				positionId,
				levelId,
				reportToId,
				employeeId,
				shiftType,
			),
		staleTime: options.staleTime ?? 10 * 1000,
		enabled: options.enabled ?? true,
		refetchInterval: options.refetchInterval ?? false,
		refetchOnMount: "always",
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});
};

export const useAttendanceTodayOpsSummary = (
	dateFrom?: string,
	dateTo?: string,
	search?: string,
	departmentId?: string,
	sectionId?: string,
	positionId?: string,
	levelId?: string,
	reportToId?: string,
	employeeId?: string,
	shiftType?: string,
	options: { enabled?: boolean; refetchInterval?: number | false } = {},
) => {
	return useQuery<AttendanceTodayOpsSummaryResponse>({
		queryKey: queryKeys.metrics.attendanceTodayOpsSummary(
			dateFrom,
			dateTo,
			search,
			departmentId,
			sectionId,
			positionId,
			levelId,
			reportToId,
			employeeId,
			shiftType,
		),
		queryFn: () =>
			metricsService.getAttendanceTodayOpsSummary(
				dateFrom,
				dateTo,
				search,
				departmentId,
				sectionId,
				positionId,
				levelId,
				reportToId,
				employeeId,
				shiftType,
			),
		staleTime: 2 * 60 * 1000,
		enabled: options.enabled ?? true,
		refetchInterval: options.refetchInterval ?? false,
	});
};

export const useAttendanceTimesheetLineSummary = (
	dateFrom?: string,
	dateTo?: string,
	search?: string,
	status?: string,
	departmentId?: string,
	sectionId?: string,
	positionId?: string,
	levelId?: string,
	reportToId?: string,
	employeeId?: string,
	shiftType?: string,
	options: { enabled?: boolean } = {},
) => {
	return useQuery<AttendanceTimesheetLineSummaryResponse>({
		queryKey: queryKeys.metrics.attendanceTimesheetLineSummary(
			dateFrom,
			dateTo,
			search,
			status,
			departmentId,
			sectionId,
			positionId,
			levelId,
			reportToId,
			employeeId,
			shiftType,
		),
		queryFn: () =>
			metricsService.getAttendanceTimesheetLineSummary(
				dateFrom,
				dateTo,
				search,
				status,
				departmentId,
				sectionId,
				positionId,
				levelId,
				reportToId,
				employeeId,
				shiftType,
			),
		staleTime: 2 * 60 * 1000,
		enabled: options.enabled ?? true,
	});
};

export const useAttendanceObligationSummary = (
	dateFrom?: string,
	dateTo?: string,
	search?: string,
	status?: string,
	departmentId?: string,
	sectionId?: string,
	positionId?: string,
	levelId?: string,
	reportToId?: string,
	employeeId?: string,
	shiftType?: string,
	options: { enabled?: boolean } = {},
) => {
	return useQuery<AttendanceTimesheetLineSummaryResponse>({
		queryKey: queryKeys.metrics.attendanceObligationSummary(
			dateFrom,
			dateTo,
			search,
			status,
			departmentId,
			sectionId,
			positionId,
			levelId,
			reportToId,
			employeeId,
			shiftType,
		),
		queryFn: () =>
			metricsService.getAttendanceObligationSummary(
				dateFrom,
				dateTo,
				search,
				status,
				departmentId,
				sectionId,
				positionId,
				levelId,
				reportToId,
				employeeId,
				shiftType,
			),
		staleTime: 2 * 60 * 1000,
		enabled: options.enabled ?? true,
	});
};

export const useAttendanceDailyTrendByDepartment = (
	dateFrom?: string,
	dateTo?: string,
	search?: string,
	status?: string,
	departmentId?: string,
	reportToId?: string,
	employeeId?: string,
	shiftType?: string,
	options: { enabled?: boolean } = {},
) => {
	return useQuery<AttendanceDailyTrendByDepartmentResponse>({
		queryKey: queryKeys.metrics.attendanceDailyTrendByDepartment(
			dateFrom,
			dateTo,
			search,
			status,
			departmentId,
			reportToId,
			employeeId,
			shiftType,
		),
		queryFn: () =>
			metricsService.getAttendanceDailyTrendByDepartment(
				dateFrom,
				dateTo,
				search,
				status,
				departmentId,
				reportToId,
				employeeId,
				shiftType,
			),
		enabled: (options.enabled ?? true) && !!dateFrom && !!dateTo,
		staleTime: 2 * 60 * 1000,
	});
};

/**
 * Hook to fetch timesheet statistics
 */
export const useTimesheetStatistics = (
	filter?: Record<string, any>,
	options: { enabled?: boolean } = {},
) => {
	return useQuery<TimesheetStatisticsResponse>({
		queryKey: queryKeys.metrics.timesheetStatistics(filter),
		queryFn: () => metricsService.getTimesheetStatistics(filter),
		enabled: options.enabled !== false,
		staleTime: 2 * 60 * 1000, // 2 minutes
	});
};

/**
 * Hook to fetch perfect attendance metrics
 */
export const usePerfectAttendanceMetrics = (
	dateFrom?: string,
	dateTo?: string,
	departmentId?: string,
) => {
	return useQuery<PerfectAttendanceResponse>({
		queryKey: queryKeys.metrics.perfectAttendance(dateFrom, dateTo, departmentId),
		queryFn: () => metricsService.getPerfectAttendanceMetrics(dateFrom, dateTo, departmentId),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch tardiness metrics
 */
export const useTardinessMetrics = (dateFrom?: string, dateTo?: string, departmentId?: string) => {
	return useQuery<TardinessMetricsResponse>({
		queryKey: queryKeys.metrics.tardinessMetrics(dateFrom, dateTo, departmentId),
		queryFn: () => metricsService.getTardinessMetrics(dateFrom, dateTo, departmentId),
		enabled: !!dateFrom && !!dateTo,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch overtime metrics
 */
export const useOvertimeMetrics = (dateFrom?: string, dateTo?: string, departmentId?: string) => {
	return useQuery<OvertimeMetricsResponse>({
		queryKey: queryKeys.metrics.overtimeMetrics(dateFrom, dateTo, departmentId),
		queryFn: () => metricsService.getOvertimeMetrics(dateFrom, dateTo, departmentId),
		enabled: !!dateFrom && !!dateTo,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch no-work report metrics
 */
export const useNoWorkReport = (dateFrom?: string, departmentId?: string, reportToId?: string) => {
	return useQuery<NoWorkReportResponse>({
		queryKey: queryKeys.metrics.noWorkReport(dateFrom, departmentId, reportToId),
		queryFn: () => metricsService.getNoWorkReport(dateFrom, departmentId, reportToId),
		enabled: !!dateFrom,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch daily active manpower metrics
 */
export const useDailyActiveManpower = (
	dateFrom?: string,
	departmentId?: string,
	reportToId?: string,
) => {
	return useQuery<DailyActiveManpowerResponse>({
		queryKey: queryKeys.metrics.dailyActiveManpower(dateFrom, departmentId, reportToId),
		queryFn: () => metricsService.getDailyActiveManpower(dateFrom, departmentId, reportToId),
		enabled: !!dateFrom,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch agency attendance summary metrics
 */
export const useAgencyAttendanceSummary = (
	dateFrom?: string,
	dateTo?: string,
	departmentId?: string,
	reportToId?: string,
) => {
	return useQuery<AgencyAttendanceSummaryResponse>({
		queryKey: queryKeys.metrics.agencyAttendanceSummary(
			dateFrom,
			dateTo,
			departmentId,
			reportToId,
		),
		queryFn: () =>
			metricsService.getAgencyAttendanceSummary(dateFrom, dateTo, departmentId, reportToId),
		enabled: !!dateFrom && !!dateTo,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useTurnoverAttritionReport = (
	dateFrom?: string,
	dateTo?: string,
	groupBy?: TurnoverAttritionGroupBy,
	filters?: {
		departmentId?: string;
		sectionId?: string;
		positionId?: string;
		levelId?: string;
	},
) => {
	return useQuery<TurnoverAttritionReportResponse>({
		queryKey: queryKeys.metrics.turnoverAttritionReport(dateFrom, dateTo, groupBy, filters),
		queryFn: () =>
			metricsService.getTurnoverAttritionReport(
				dateFrom || "",
				dateTo || "",
				groupBy || "month",
				filters,
			),
		enabled: !!dateFrom && !!dateTo,
		staleTime: 5 * 60 * 1000,
	});
};

export const useActionMetrics = <TData = ActionMetricsResponse>(options?: {
	employeeId?: string;
	enabled?: boolean;
	select?: (metrics: ActionMetricsResponse) => TData;
}) => {
	return useQuery<ActionMetricsResponse, Error, TData>({
		queryKey: queryKeys.metrics.actionMetrics(options?.employeeId),
		queryFn: () => metricsService.getActionMetrics(options?.employeeId),
		enabled: options?.enabled ?? true,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchInterval: false,
		select: options?.select,
	});
};

export const useDashboardActionItems = (options?: { employeeId?: string; enabled?: boolean }) => {
	const { user } = useAuth();
	return useActionMetrics<{
		summary: ActionMetricsResponse["summary"];
		items: ActionMetricDashboardItem[];
	}>({
		employeeId: options?.employeeId,
		enabled: options?.enabled,
		select: (metrics) => {
			const items = [...metrics.items.dashboard];
			const summary = { ...metrics.summary };

			const hasAvatar = !!user?.avatar;
			if (!hasAvatar) {
				items.unshift({
					id: "missing-avatar-action-item",
					kind: "AVATAR_UPDATE" as any,
					title: "Upload Profile Photo",
					description: "You haven't set a profile photo yet. Please upload one.",
					priority: "medium",
					statusLabel: "Pending",
					createdAt: new Date().toISOString(),
					dueDate: null,
					targetPath: "/settings",
				});
				summary.total += 1;
				summary.medium += 1;
			}

			return {
				summary,
				items,
			};
		},
	});
};

export const useDocumentActionMetrics = (
	employeeId: string | undefined,
	options?: { enabled?: boolean },
) => {
	const { user } = useAuth();
	const currentEmployeeId = user?.metadata?.employee?.id;
	const usesSelfMetrics = !!employeeId && !!currentEmployeeId && employeeId === currentEmployeeId;

	return useActionMetrics<{
		counts: ActionMetricsResponse["counts"]["documents"];
		items: ActionMetricDocumentItem[];
		onboardingItems: ActionMetricDocumentItem[];
		categories: ActionMetricDocumentCategorySummary[];
	}>({
		employeeId: usesSelfMetrics ? undefined : employeeId,
		enabled: !!employeeId && (options?.enabled ?? true),
		select: (metrics) => {
			return {
				counts: metrics.counts.documents,
				items: metrics.items.documents,
				onboardingItems: metrics.items.onboardingDocuments,
				categories: metrics.categories.documents,
			};
		},
	});
};

/**
 * Hook to fetch direct vs indirect labor summary metrics for a date range
 */
export const useDirectIndirectLaborSummary = (
	dateFrom?: string,
	dateTo?: string,
	departmentId?: string,
	reportToId?: string,
	laborType?: "ALL" | "DIRECT" | "INDIRECT",
) => {
	return useQuery<DirectIndirectLaborSummaryResponse>({
		queryKey: queryKeys.metrics.directIndirectLaborSummary(
			dateFrom,
			dateTo,
			departmentId,
			reportToId,
			laborType,
		),
		queryFn: () =>
			metricsService.getDirectIndirectLaborSummary(
				dateFrom,
				dateTo,
				departmentId,
				reportToId,
				laborType,
			),
		enabled: !!dateFrom && !!dateTo,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch payroll summary metrics by pay-date range or payroll period
 */
export const usePayrollSummaryMetrics = (
	dateFrom?: string,
	dateTo?: string,
	payrollPeriodId?: string,
	departmentId?: string,
	reportToId?: string,
) => {
	return useQuery<PayrollSummaryResponse>({
		queryKey: queryKeys.metrics.payrollSummary(
			dateFrom,
			dateTo,
			payrollPeriodId,
			departmentId,
			reportToId,
		),
		queryFn: () =>
			metricsService.getPayrollSummary(
				dateFrom,
				dateTo,
				payrollPeriodId,
				departmentId,
				reportToId,
			),
		enabled: !!payrollPeriodId || (!!dateFrom && !!dateTo),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch leave balance metrics
 */
export const useLeaveBalanceMetrics = (filter?: {
	departmentId?: string;
	sectionId?: string;
	positionId?: string;
	levelId?: string;
	reportToId?: string;
	employeeId?: string;
	leaveType?: string;
	periodFrom?: string;
	periodTo?: string;
}, options: { enabled?: boolean } = {}) => {
	return useQuery<LeaveBalanceMetricsResponse>({
		queryKey: queryKeys.metrics.leaveBalanceMetrics(filter),
		queryFn: () => metricsService.getLeaveBalanceMetrics(filter),
		enabled: options.enabled ?? true,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

/**
 * Hook to fetch BIR 1601-C monthly metrics
 */
export const useBir1601CMetrics = (
	filter: {
		month: number;
		year: number;
		departmentId?: string;
		reportToId?: string;
		employeeId?: string;
	},
	enabled: boolean = true,
) => {
	return useQuery<Bir1601CMetricsResponse>({
		queryKey: queryKeys.metrics.bir1601CMetrics(filter),
		queryFn: () => metricsService.getBir1601CMetrics(filter),
		enabled: enabled && !!filter.month && !!filter.year,
		staleTime: 5 * 60 * 1000,
	});
};
