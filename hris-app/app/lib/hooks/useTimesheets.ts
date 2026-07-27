import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import timesheetService, {
	type Timesheet,
	type HRTimesheetQueuesResponse,
	type TimesheetsResponse,
	type TimesheetActionRequest,
	type TimesheetViewResponse,
	type SubmitTimesheetRequest,
	type UpdateTimesheetConfigRequest,
	type RequestEditPermissionPayload,
	type CreateOvertimeRequestPayload,
	type CreatePayrollCorrectionPayload,
	type RequestCurrentEditPermissionPayload,
	type ReviewEditPermissionPayload,
	type NormalizeTimesheetBreakdownPreviewRequest,
	type NormalizeTimesheetBreakdownPreviewResponse,
	type TimesheetReminderKind,
	type CurrentPeriodRepairRequest,
} from "~/services/timesheet.service";
import { toast } from "sonner";
import { timesheetlineQueryKeys } from "./useTimesheetlines";

// Query keys
export const timesheetQueryKeys = {
	timesheets: {
		all: ["timesheets"] as const,
		lists: () => [...timesheetQueryKeys.timesheets.all, "list"] as const,
		list: (params?: any) => [...timesheetQueryKeys.timesheets.lists(), { params }] as const,
		hrQueues: (params?: any) =>
			[...timesheetQueryKeys.timesheets.lists(), "hr-queues", { params }] as const,
		details: () => [...timesheetQueryKeys.timesheets.all, "detail"] as const,
		detail: (id: string) => [...timesheetQueryKeys.timesheets.details(), id] as const,
		config: () => [...timesheetQueryKeys.timesheets.all, "config"] as const,
	},
};

const getTimesheetErrorMessage = (error: any, fallback: string) => {
	const rawMessage = String(error?.message || "").toUpperCase();
	if (rawMessage.includes("POLICY_DISABLED")) {
		return "Timesheet editing is disabled by company policy.";
	}
	if (rawMessage.includes("EDIT_PERMISSION_REQUIRED_FOR_RESUBMISSION")) {
		return "Edit permission is required before you can resubmit this timesheet.";
	}
	if (rawMessage.includes("NO_CHANGES_TO_RESUBMIT")) {
		return "No changes were detected to resubmit.";
	}
	if (rawMessage.includes("OVERTIME_REQUEST_REQUIRED")) {
		return "File overtime requests for all detected overtime days before submitting.";
	}
	return error?.message || fallback;
};

export const TIMESHEET_LIST_FIELDS = [
	"id",
	"code",
	"status",
	"lockedAt",
	"lockedBy",
	"lockReason",
	"lockRunId",
	"totalHoursWorked",
	"totalRegularHours",
	"totalOvertimeHours",
	"totalUndertimeHours",
	"totalLateHours",
	"totalEarlyOutHours",
	"employeeId",
	"employee.id",
	"employee.employeeId",
	"employee.employeeCode",
	"employee.user.avatar",
	"employee.embeddedSchedule",
	"employee.department.id",
	"employee.department.name",
	"employee.department.code",
	"employee.section.id",
	"employee.section.name",
	"employee.section.code",
	"employee.person.personalInfo",
	"employee.reportTo.id",
	"employee.reportTo.employeeId",
	"employee.reportTo.employeeCode",
	"employee.reportTo.person.personalInfo",
	"payrollPeriodId",
	"payrollPeriod.name",
	"payrollPeriod.code",
	"payrollPeriod.startDate",
	"payrollPeriod.endDate",
];

/**
 * Hook to fetch list of timesheets
 */
export const useTimesheets = (params?: any) => {
	const { enabled, ...queryParams } = params || {};
	const { includeAttendances, ...apiQueryParams } = queryParams;
	const selectFields = [...TIMESHEET_LIST_FIELDS];

	if (includeAttendances) {
		selectFields.push(
			"attendances.id",
			"attendances.date",
			"attendances.timeIn",
			"attendances.timeBreak",
			"attendances.timeOut",
			"attendances.status",
			"attendances.behaviorFlags",
			"attendances.scheduleSnapshot",
			"attendances.hoursWorked",
			"attendances.regularHours",
			"attendances.overtimeHours",
			"attendances.undertimeHours",
			"attendances.lateHours",
			"attendances.earlyOutHours",
			"attendances.breakMinutes",
			"attendances.isManualEntry",
			"attendances.notes",
			"attendances.isEffective",
		);
	}

	return useQuery<TimesheetsResponse>({
		queryKey: timesheetQueryKeys.timesheets.list(queryParams),
		queryFn: () =>
			timesheetService
				.clearQueryParams()
				.select(selectFields)
				.search(apiQueryParams?.query)
				.paginate(apiQueryParams?.page || 1, apiQueryParams?.limit || 10)
				.sort(apiQueryParams?.sort, apiQueryParams?.order)
				.setParams({ ...apiQueryParams, document: true })
				.getTimesheets(),
		enabled: enabled !== false,
		staleTime: 2 * 60 * 1000, // 2 minutes
	});
};

export const useHRTimesheetQueues = (params?: any) => {
	const { enabled, ...queryParams } = params || {};

	return useQuery<HRTimesheetQueuesResponse>({
		queryKey: timesheetQueryKeys.timesheets.hrQueues(queryParams),
		queryFn: () =>
			timesheetService
				.clearQueryParams()
				.select(TIMESHEET_LIST_FIELDS)
				.search(queryParams?.query)
				.paginate(1, queryParams?.limit || 5)
				.sort(queryParams?.sort || "updatedAt", queryParams?.order || "desc")
				.setParams({
					...queryParams,
					document: true,
					count: true,
					timesheetQueues: "hr",
					queueLimit: queryParams?.queueLimit || queryParams?.limit || 5,
					page: 1,
				})
				.getTimesheets() as unknown as Promise<HRTimesheetQueuesResponse>,
		enabled: enabled !== false,
		staleTime: 2 * 60 * 1000,
	});
};

/**
 * Hook to view current timesheet for authenticated employee
 */
export const useViewTimesheets = (params?: any) => {
	const { enabled, ...queryParams } = params || {};

	return useQuery<TimesheetViewResponse>({
		queryKey: [...timesheetQueryKeys.timesheets.lists(), "view", { params: queryParams }],
		queryFn: () => timesheetService.viewTimesheets(queryParams),
		staleTime: 2 * 60 * 1000, // 2 minutes
		enabled: enabled !== false, // Default to true unless explicitly disabled
		retry: false, // Don't retry on error to show error state immediately
	});
};

export const useEnsurePeriodDrafts = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (
			input: string | { payrollPeriodId: string; createLimit?: number },
		) => {
			const payrollPeriodId =
				typeof input === "string" ? input : input.payrollPeriodId;
			const createLimit = typeof input === "string" ? undefined : input.createLimit;
			return await timesheetService.ensurePeriodDrafts(payrollPeriodId, {
				createLimit,
			});
		},
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			queryClient.invalidateQueries({ queryKey: timesheetlineQueryKeys.timesheetlines.all });
			const created = result.created ?? 0;
			const refreshed = result.refreshed ?? 0;
			const existing = result.existing ?? 0;
			const skipped = result.skippedExistingEmployees ?? existing;
			const missing = result.missingEmployees ?? 0;
			const remaining = result.remainingDraftsToPrepare;
			const errorCount = result.errors?.length ?? 0;
			const details = [
				`${created} draft${created === 1 ? "" : "s"} created`,
				`${refreshed} today line${refreshed === 1 ? "" : "s"} refreshed`,
				`${skipped} existing skipped`,
			];

			if (missing > 0) {
				details.push(`${missing} employee${missing === 1 ? "" : "s"} missing`);
			}

			if (remaining === null) {
				details.push("more may remain");
			} else if (remaining && remaining > 0) {
				details.push(`${remaining} remaining`);
			}

			if (created > 0 || refreshed > 0) {
				toast.success(`Prepare complete: ${details.join(", ")}.`);
			} else if (errorCount === 0 && (remaining || 0) === 0) {
				toast.info(`Already prepared: ${details.join(", ")}.`);
			}

			if (errorCount > 0) {
				toast.warning(
					`${errorCount} draft timesheet${errorCount === 1 ? "" : "s"} could not be prepared.`,
				);
			}
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to prepare draft timesheets");
		},
	});
};

export const useCurrentPeriodRepair = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CurrentPeriodRepairRequest) => {
			return await timesheetService.repairCurrentPeriodCoverage(payload);
		},
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			queryClient.invalidateQueries({ queryKey: timesheetlineQueryKeys.timesheetlines.all });
			if (result.dryRun) {
				toast.success("Dry run complete");
				return;
			}
			const created = result.timesheets.createdDrafts || 0;
			const repaired = result.attendanceObligations.repaired || 0;
			toast.success(
				`Repair applied: ${created} draft${created === 1 ? "" : "s"} created, ${repaired} obligation row${repaired === 1 ? "" : "s"} touched.`,
			);
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to run current period repair");
		},
	});
};

export const useLockPeriodTimesheets = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payrollPeriodId: string) => {
			return await timesheetService.lockPeriodTimesheets(payrollPeriodId);
		},
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			queryClient.invalidateQueries({ queryKey: timesheetlineQueryKeys.timesheetlines.all });

			const blockerCount = Object.values(result.blockers || {}).reduce(
				(total, count) => total + Number(count || 0),
				0,
			);
			if (blockerCount > 0) {
				toast.warning(
					`${blockerCount} timesheet${blockerCount === 1 ? "" : "s"} still need action before payroll.`,
				);
			}
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to lock period timesheets");
		},
	});
};

export type UseTimesheetOptions = {
	enabled?: boolean;
	staleTime?: number;
	refetchOnMount?: boolean | "always";
};

/**
 * Hook to fetch a single timesheet by ID
 */
export const useTimesheet = (id: string, options?: UseTimesheetOptions) => {
	return useQuery<Timesheet>({
		queryKey: timesheetQueryKeys.timesheets.detail(id),
		queryFn: () =>
			timesheetService
				.clearQueryParams()
				.select([
					"id",
					"code",
					"organizationId",
					"employeeId",
					"employee.id",
					"employee.employeeId",
					"employee.embeddedSchedule",
					"employee.person",
					"employee.department",
					"employee.position",
					"payrollPeriodId",
					"payrollPeriod.name",
					"payrollPeriod.code",
					"payrollPeriod.startDate",
					"payrollPeriod.endDate",
					"timesheetlines.date",
					"timesheetlines.timeIn",
					"timesheetlines.timeOut",
					"timesheetlines.hoursWorked",
					"timesheetlines.regularHours",
					"timesheetlines.overtimeHours",
					"timesheetlines.undertimeHours",
					"timesheetlines.lateHours",
					"timesheetlines.earlyOutHours",
					"timesheetlines.status",
					"timesheetlines.employeeNotes",
					"timesheetlines.approverNotes",
					"timesheetlines.notes",
					"timesheetlines.metadata",
					"timesheetlines.breakMinutes",
					"timesheetlines.primaryMarker",
					"timesheetlines.isDeleted",
					"timesheetlines.isEffective",
					"totalDays",
					"totalHoursWorked",
					"totalRegularHours",
					"totalOvertimeHours",
					"totalUndertimeHours",
					"totalLateHours",
					"totalEarlyOutHours",
					"metadata",
					"status",
					"lockedAt",
					"lockedBy",
					"lockReason",
					"lockRunId",
					"submittedAt",
					"submittedBy",
					"approvedBy",
					"approvalDate",
					"rejectionReason",
					"notes",
					"editPermissionStatus",
					"editPermissionRequestId",
					"editPermissionRequestedAt",
					"editPermissionGrantedAt",
					"editPermissionRejectedAt",
					"editPermissionRejectionReason",
					"editPermissionConsumedAt",
					"isDeleted",
					"createdAt",
					"updatedAt",
				])
				.getTimesheetById(id),
		enabled: options?.enabled ?? !!id,
		staleTime: options?.staleTime ?? 2 * 60 * 1000, // 2 minutes
		refetchOnMount: options?.refetchOnMount,
	});
};

/**
 * Hook to submit a timesheet (auto-generates if needed)
 */
export const useSubmitTimesheet = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload?: SubmitTimesheetRequest) => {
			return await timesheetService.submitTimesheet(payload);
		},
		onSuccess: (submittedTimesheet) => {
			// Optimistically sync common timesheet caches so UI reflects SUBMITTED immediately.
			queryClient.setQueriesData(
				{ queryKey: [...timesheetQueryKeys.timesheets.lists(), "view"] },
				(oldData: TimesheetViewResponse | undefined) => {
					if (!oldData?.timesheet) return oldData;
					return {
						...oldData,
						timesheet: {
							...oldData.timesheet,
							...submittedTimesheet,
						},
					};
				},
			);

			if (submittedTimesheet?.id) {
				queryClient.setQueryData(
					timesheetQueryKeys.timesheets.detail(submittedTimesheet.id),
					(oldData: Timesheet | undefined) =>
						oldData
							? {
									...oldData,
									...submittedTimesheet,
								}
							: oldData,
				);
			}

			queryClient.setQueriesData(
				{ queryKey: timesheetQueryKeys.timesheets.lists() },
				(oldData: TimesheetsResponse | undefined) => {
					if (!oldData?.timesheets?.length) return oldData;
					return {
						...oldData,
						timesheets: oldData.timesheets.map((item) =>
							submittedTimesheet?.id && item.id === submittedTimesheet.id
								? { ...item, ...submittedTimesheet }
								: item,
						),
					};
				},
			);

			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			toast.success("Timesheet submitted successfully");
		},
		onError: (error: any) => {
			toast.error(getTimesheetErrorMessage(error, "Failed to submit timesheet"));
		},
	});
};

/**
 * Hook to perform actions on timesheets (submit, approve, reject, revise)
 */
export const useTimesheetAction = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, action }: { id: string; action: TimesheetActionRequest }) => {
			return await timesheetService.timesheetAction(id, action);
		},
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			queryClient.invalidateQueries({
				queryKey: timesheetQueryKeys.timesheets.detail(variables.id),
			});
			queryClient.invalidateQueries({ queryKey: ["employees"] });
			queryClient.invalidateQueries({ queryKey: ["metrics"] });

			const actionMap = {
				SUBMIT: "submitted",
				APPROVE: "approved",
				REJECT: "rejected",
				REVISE: "revised",
			};
			const actionText = actionMap[variables.action.action] || "updated";
			toast.success(`Timesheet ${actionText} successfully`);
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to perform action on timesheet");
		},
	});
};

export const useSendTimesheetReminder = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			timesheetId,
			kind,
		}: {
			timesheetId: string;
			kind: TimesheetReminderKind;
		}) => {
			return await timesheetService.sendReminder(timesheetId, kind);
		},
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			const labelMap: Record<TimesheetReminderKind, string> = {
				employee_submit: "Employee submission reminder sent",
				employee_correct: "Employee correction reminder sent",
				manager_approval: "Supervisor approval reminder sent",
			};
			toast.success(labelMap[result.kind] || "Timesheet reminder sent");
		},
		onError: (error: any) => {
			toast.error(getTimesheetErrorMessage(error, "Failed to send timesheet reminder"));
		},
	});
};

/**
 * Hook to delete a timesheet
 */
export const useDeleteTimesheet = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			return await timesheetService.deleteTimesheet(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			toast.success("Timesheet deleted successfully");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to delete timesheet");
		},
	});
};

/**
 * Hook to update a timesheet
 */
export const useUpdateTimesheet = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
			return await timesheetService.updateTimesheet(id, payload);
		},
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			queryClient.invalidateQueries({
				queryKey: timesheetQueryKeys.timesheets.detail(variables.id),
			});
			toast.success("Timesheet updated successfully");
		},
		onError: (error: any) => {
			toast.error(getTimesheetErrorMessage(error, "Failed to update timesheet"));
		},
	});
};

export const useNormalizeTimesheetBreakdownPreview = () => {
	return useMutation({
		mutationFn: async (
			payload: NormalizeTimesheetBreakdownPreviewRequest,
		): Promise<NormalizeTimesheetBreakdownPreviewResponse> => {
			return await timesheetService.normalizeTimesheetBreakdownPreview(payload);
		},
	});
};

/**
 * Hook to fetch organization timesheet settings
 */
export const useTimesheetConfig = () => {
	return useQuery({
		queryKey: timesheetQueryKeys.timesheets.config(),
		queryFn: () => timesheetService.getTimesheetConfig(),
		staleTime: 5 * 60 * 1000,
	});
};

/**
 * Hook to update organization timesheet settings
 */
export const useUpdateTimesheetConfig = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: UpdateTimesheetConfigRequest) => {
			return await timesheetService.updateTimesheetConfig(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.config() });
			toast.success("Timesheet settings updated successfully");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to update timesheet settings");
		},
	});
};

export const useCreateOvertimeRequest = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			timesheetId,
			payload,
		}: {
			timesheetId: string;
			payload: CreateOvertimeRequestPayload;
		}) => {
			return await timesheetService.createOvertimeRequest(timesheetId, payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			toast.success("Overtime request submitted");
		},
		onError: (error: any) => {
			toast.error(getTimesheetErrorMessage(error, "Failed to file overtime request"));
		},
	});
};

export const useCreatePayrollCorrection = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			timesheetId,
			payload,
		}: {
			timesheetId: string;
			payload: CreatePayrollCorrectionPayload;
		}) => {
			return await timesheetService.createPayrollCorrection(timesheetId, payload);
		},
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			queryClient.invalidateQueries({
				queryKey: [
					...timesheetQueryKeys.timesheets.details(),
					"payroll-corrections",
					variables.timesheetId,
				],
			});
			toast.success(
				"Payroll correction submitted — it will apply on the next open payroll after approval",
			);
		},
		onError: (error: any) => {
			const msg = String(error?.message || "");
			if (msg.includes("TIMESHEET_NOT_PAYROLL_LOCKED")) {
				toast.error("This timesheet is not payroll-locked. Use normal edit instead.");
				return;
			}
			if (msg.includes("DUPLICATE_OPEN_CORRECTION_DAY")) {
				toast.error("An open correction already covers one of the selected days.");
				return;
			}
			if (msg.includes("WORKFLOW_NOT_CONFIGURED")) {
				toast.error("Payroll correction workflow is not configured. Contact HR.");
				return;
			}
			toast.error(getTimesheetErrorMessage(error, "Failed to submit payroll correction"));
		},
	});
};

export const useTimesheetPayrollCorrections = (
	timesheetId?: string | null,
	options?: { enabled?: boolean },
) => {
	return useQuery({
		queryKey: [
			...timesheetQueryKeys.timesheets.details(),
			"payroll-corrections",
			timesheetId || "",
		],
		enabled: Boolean(timesheetId) && options?.enabled !== false,
		queryFn: async () => {
			return await timesheetService.listPayrollCorrections(String(timesheetId));
		},
		staleTime: 30_000,
	});
};

export const useRequestTimesheetEditPermission = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			timesheetId,
			payload,
		}: {
			timesheetId: string;
			payload: RequestEditPermissionPayload;
		}) => {
			return await timesheetService.requestEditPermission(timesheetId, payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			toast.success("Edit permission request submitted");
		},
		onError: (error: any) => {
			toast.error(getTimesheetErrorMessage(error, "Failed to request edit permission"));
		},
	});
};

export const useReviewTimesheetEditPermission = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			timesheetId,
			payload,
		}: {
			timesheetId: string;
			payload: ReviewEditPermissionPayload;
		}) => {
			return await timesheetService.reviewEditPermission(timesheetId, payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			toast.success("Edit permission review submitted");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to review edit permission");
		},
	});
};

export const useRequestTimesheetEditPermissionCurrent = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: RequestCurrentEditPermissionPayload) => {
			return await timesheetService.requestEditPermissionCurrent(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			toast.success("Edit permission request submitted");
		},
		onError: (error: any) => {
			toast.error(getTimesheetErrorMessage(error, "Failed to request edit permission"));
		},
	});
};
