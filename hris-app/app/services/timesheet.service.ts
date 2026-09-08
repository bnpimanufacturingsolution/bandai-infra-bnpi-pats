import { hrisApiClient } from "~/lib/api-client";
import { APIService } from "./api-service";
import type { Attendance } from "./attendance.service";
import type { Timesheetline } from "./timesheetline.service";

export type TimesheetEditPermissionStatus =
	| "NONE"
	| "REQUESTED"
	| "APPROVED"
	| "REJECTED"
	| "CONSUMED"
	| "EXPIRED"
	| "REVOKED";

export type TimesheetPrimaryMarker = "HOLIDAY" | "LEAVE" | "REST_DAY" | "ABSENT" | "HOURS";

export interface TimesheetLeaveEntry {
	requestId?: string;
	leaveType: string;
	label: string;
	durationUnit?: string;
	halfDaySession?: string;
	startDate?: string;
	endDate?: string;
}

export interface TimesheetHolidayEntry {
	calendarItemId: string;
	title: string;
	startDate: string;
	endDate: string;
	tags?: string[];
}

export interface TimesheetCompensatoryLeaveCreditDay {
	date: string;
	overtimeHours: string;
	overtimeMinutes: number;
	workdayHours: number;
	approvalReason: string | null;
	employeeReason: string | null;
}

export interface TimesheetCompensatoryLeaveCredit {
	source: "APPROVED_OVERTIME_TIMESHEETLINES";
	leaveType: "COMPENSATORY";
	totalMinutes: number;
	totalDays: number;
	deltaMinutes: number;
	deltaDays: number;
	lineCount: number;
	creditedAt: string;
	creditedByEmployeeId: string | null;
	approvedOvertimeDays: TimesheetCompensatoryLeaveCreditDay[];
	creditApplied?: boolean;
	skipReason?: "NO_COMPENSATORY_LEAVE_POLICY";
}

export interface TimesheetBreakdown {
	approvalStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "REVISED";
	date: string;
	timeIn: string | null;
	timeOut: string | null;
	hoursWorked: string;
	regularHours: string;
	overtimeHours: string;
	undertimeHours: string;
	lateHours: string;
	earlyOutHours: string;
	status: string | null;
	leaveType?: string | null;
	leaveEntries?: TimesheetLeaveEntry[];
	holidayEntries?: TimesheetHolidayEntry[];
	primaryMarker?: TimesheetPrimaryMarker;
	employeeNotes: string | null;
	approverNotes: string | null;
	dayLaborType?: "DIRECT" | "INDIRECT" | null;
	projectCode?: string | null;
	metadata?: {
		businessDate?: string | null;
		totalMinutes?: number;
		regularMinutes?: number;
		overtimeMinutes?: number;
		undertimeMinutes?: number;
		lateMinutes?: number;
		earlyOutMinutes?: number;
		breakMinutes?: number;
		breakDisplay?: string;
		scheduleRepair?: {
			code?: string | null;
			source?: string | null;
		} | null;
		rawLateMinutes?: number;
		gracePeriodMinutes?: number;
		withinGrace?: boolean;
		scheduleSnapshot?: any;
		overtimeCandidate?: boolean;
		pendingOvertimeMinutes?: number;
		pendingOvertimeHours?: string;
		overtimeCandidateReason?: string | null;
		overtimeRequestId?: string | null;
		overtimeApprovalStatus?: "NONE" | "REQUESTED" | "APPROVED" | "REJECTED";
	};
	revisionSummary?: {
		isModified: boolean;
		lineId: string;
		previousLineId: string;
		revisionNo: number;
		ledgerType: string;
		editedAt: string | null;
		editedBy: string | null;
		editReason: string | null;
		changeType: "TIME" | "STATUS" | "NOTES" | "MIXED";
		changedFields: Array<{
			field: string;
			label: string;
			before: unknown;
			after: unknown;
		}>;
	};
	nightShift?: {
		isNightShiftDay: boolean;
		scheduledWindow?: {
			startTime: string;
			endTime: string;
			isOvernight: boolean;
		};
		actualNightHours?: string;
	};
}

export interface TimesheetEmployee {
	id: string;
	employeeCode?: string;
	employeeId?: string;
	user?: {
		avatar?: string | null;
	};
	embeddedSchedule?: unknown;
	schedule?: {
		scheduleCode?: string;
		scheduleName?: string;
		startDate?: string | null;
		endDate?: string | null;
		gracePeriodMinutes?: number;
		shifts?: Array<{
			label: string;
			isRestDay?: boolean;
			timeSlots?: Array<{
				type: "work" | "break" | string;
				label?: string;
				startTime: string;
				endTime: string;
			}>;
		}>;
	} | null;
	reportTo?: {
		id: string;
		firstName?: string | null;
		lastName?: string | null;
		employeeId?: string | null;
		employeeCode?: string | null;
		person?: {
			personalInfo?: {
				firstName?: string;
				middleName?: string;
				lastName?: string;
				suffix?: string;
				email?: string;
				mobile?: string;
			};
		};
	} | null;
	person?: {
		personalInfo?: {
			firstName?: string;
			middleName?: string;
			lastName?: string;
			suffix?: string;
			email?: string;
			mobile?: string;
		};
	};
	position?: {
		id: string;
		title: string;
		code?: string;
	};
	department?: {
		id: string;
		name: string;
		code?: string;
	};
	section?: {
		id: string;
		name: string;
		code?: string;
	} | null;
}

export interface Timesheet {
	id: string | null;
	code: string;
	tempId?: string;
	organizationId: string;
	employeeId: string;
	payrollPeriodId: string;
	totalDays?: number;
	totalHoursWorked?: string;
	totalRegularHours?: string;
	totalOvertimeHours?: string;
	totalUndertimeHours?: string;
	totalLateHours?: string;
	totalEarlyOutHours?: string;
	metadata?: {
		totalMinutesWorked?: number;
		totalRegularMinutes?: number;
		totalOvertimeMinutes?: number;
		totalUndertimeMinutes?: number;
		totalLateMinutes?: number;
		totalEarlyOutMinutes?: number;
		compensatoryLeaveCredit?: TimesheetCompensatoryLeaveCredit;
		[key: string]: unknown;
	};
	status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "REVISED";
	submittedAt?: string | null;
	submittedBy?: string | null;
	approvedBy?: string | null;
	approvalDate?: string | null;
	lockedAt?: string | null;
	lockedBy?: string | null;
	lockReason?: string | null;
	lockRunId?: string | null;
	lockedEmployeePayrollId?: string | null;
	rejectionReason?: string | null;
	notes?: string | null;
	editPermissionStatus?: TimesheetEditPermissionStatus;
	editPermissionRequestId?: string | null;
	editPermissionRequestedAt?: string | null;
	editPermissionGrantedAt?: string | null;
	editPermissionGrantedBy?: string | null;
	editPermissionGrantedByEmployee?: {
		id: string;
		firstName?: string | null;
		lastName?: string | null;
		employeeId?: string | null;
	} | null;
	editPermissionRejectedAt?: string | null;
	editPermissionRejectedBy?: string | null;
	editPermissionRejectedByEmployee?: {
		id: string;
		firstName?: string | null;
		lastName?: string | null;
		employeeId?: string | null;
	} | null;
	editPermissionRejectionReason?: string | null;
	editPermissionConsumedAt?: string | null;
	editPermissionExpiresAt?: string | null;
	editPermissionReason?: string | null;
	breakdown?: TimesheetBreakdown[];
	timesheetlines?: Timesheetline[];
	attendances?: Attendance[];
	isDeleted: boolean;
	createdAt: string;
	updatedAt: string;
	isCalculated?: boolean;
	canRequestEditPermission?: boolean;
	requestEditPermissionMode?: "CREATE_DRAFT_THEN_REQUEST";
	employee?: TimesheetEmployee;
	payrollPeriod?: {
		id: string;
		code?: string;
		name: string;
		startDate: string;
		endDate: string;
		payDate: string;
		status: string;
	};
	approvedEditedDaysSummary?: ApprovedEditedDaysSummary;
}

export interface TimesheetsResponse {
	timesheets: Timesheet[];
	count?: number;
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages: number;
	};
}

export interface HRTimesheetQueueBucket {
	timesheets: Timesheet[];
	count: number;
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages: number;
	};
}

export interface HRTimesheetQueuesResponse {
	timesheetSummary: {
		total: number;
		draft: number;
		submitted: number;
		approved: number;
		correction: number;
	};
	timesheetQueues: {
		draft: HRTimesheetQueueBucket;
		submitted: HRTimesheetQueueBucket;
		correction: HRTimesheetQueueBucket;
		approved: HRTimesheetQueueBucket;
	};
}

export interface ApprovedEditedDaySummaryItem {
	entryId: string;
	timesheetId: string;
	date: string;
	periodLabel: string;
	sourcePeriodType: "CURRENT" | "PAST";
	approvedAt: string;
	changeType: "TIME" | "STATUS" | "NOTES" | "MIXED";
	isManualEdit?: boolean;
	changedFields?: Array<{
		field: string;
		label: string;
		before: unknown;
		after: unknown;
	}>;
	dayPreview?: {
		timeIn: string | null;
		timeOut: string | null;
		status: string | null;
		hoursWorked: string;
		regularHours: string;
		overtimeHours: string;
		undertimeHours: string;
		lateHours: string;
		earlyOutHours: string;
		leaveType?: string | null;
		leaveEntries?: TimesheetLeaveEntry[];
		holidayEntries?: TimesheetHolidayEntry[];
		primaryMarker?: TimesheetPrimaryMarker;
		approvalStatus?: string | null;
		employeeNotes: string | null;
		approverNotes: string | null;
		metadata?: {
			breakMinutes: number | null;
			breakDisplay: string | null;
			rawLateMinutes?: number | null;
			gracePeriodMinutes?: number | null;
			withinGrace?: boolean | null;
		};
		nightShift?: {
			isNightShiftDay: boolean;
			scheduledWindow?: {
				startTime: string;
				endTime: string;
				isOvernight: boolean;
			};
			actualNightHours?: string;
		};
	};
}

export interface ApprovedEditedDaysSummary {
	total: number;
	items: ApprovedEditedDaySummaryItem[];
}

export interface TimesheetViewResponse {
	timesheet: Timesheet;
	approvedEditedDaysSummary?: ApprovedEditedDaysSummary;
}

export interface GenerateTimesheetRequest {
	date?: string;
	notes?: string;
}

export interface TimesheetActionRequest {
	action: "SUBMIT" | "APPROVE" | "REJECT" | "REVISE";
	rejectionReason?: string;
	notes?: string;
	breakdown?: TimesheetBreakdown[];
	editedDayKeys?: string[];
}

export interface TimesheetConfig {
	id: string;
	organizationId: string;
	enableAutoApprove: boolean;
	enableEditBeforeSubmission: boolean;
	rejectBehavior?: "REVISE" | "REJECT";
	overtimeFlagThresholdMinutes: number;
	workTimeRounding: WorkTimeRoundingRule;
	overtimeQualification: OvertimeQualificationRule;
	payrollFinalization: PayrollFinalizationRule;
	approvalRequired: boolean;
	blockPayrollOnUnsubmitted: boolean;
	createdAt: string;
	updatedAt: string;
}

export type RoundingMode = "NONE" | "NEAREST" | "UP" | "DOWN";
export type RoundingIncrementMinutes = 1 | 5 | 10 | 15 | 30 | 60;

export interface WorkTimeRoundingRule {
	enabled: boolean;
	incrementMinutes: RoundingIncrementMinutes;
	mode: RoundingMode;
	applyTo: "WORKED_MINUTES" | "PAYABLE_MINUTES";
}

export interface OvertimeQualificationRule {
	enabled: boolean;
	minimumMinutesBeforeQualification: number;
	rounding: {
		enabled: boolean;
		incrementMinutes: RoundingIncrementMinutes;
		mode: Exclude<RoundingMode, "NONE">;
	};
	basis: "POST_SHIFT_EXCESS";
}

export interface PayrollFinalizationRule {
	enabled: boolean;
	lockTimesheetOnCutoffFinalization: boolean;
	allowUnlockWithAuthorizedPayrollRun: boolean;
	freezeComputedValuesOnLock: boolean;
}

export interface UpdateTimesheetConfigRequest {
	enableAutoApprove?: boolean;
	enableEditBeforeSubmission?: boolean;
	rejectBehavior?: "REVISE" | "REJECT";
	overtimeFlagThresholdMinutes?: number;
	workTimeRounding?: WorkTimeRoundingRule;
	overtimeQualification?: OvertimeQualificationRule;
	payrollFinalization?: PayrollFinalizationRule;
}

export interface SubmitTimesheetRequest {
	notes?: string;
	breakdown?: TimesheetBreakdown[];
	editedDayKeys?: string[];
}

export interface RequestEditPermissionPayload {
	reason: string;
}

export interface CreateOvertimeRequestPayload {
	date?: string;
	timesheetLineId?: string;
	description?: string;
	notes?: string;
}

export type PayrollCorrectionHoursType =
	| "REGULAR"
	| "OT"
	| "ND"
	| "LATE"
	| "ABSENT"
	| "EARLY_OUT"
	| "OTHER";

export interface PayrollCorrectionDayDeltaPayload {
	date: string;
	hoursType: PayrollCorrectionHoursType;
	beforeMinutes: number;
	afterMinutes: number;
	deltaMinutes?: number;
	/** Proposed clocks (HH:mm) from the correction form; optional audit fields */
	timeIn?: string;
	timeOut?: string;
	notes?: string;
}

export interface CreatePayrollCorrectionPayload {
	reason: string;
	dayDeltas: PayrollCorrectionDayDeltaPayload[];
	description?: string;
	notes?: string;
}

export interface RequestCurrentEditPermissionPayload {
	reason: string;
	periodCode?: string;
}

export interface ReviewEditPermissionPayload {
	requestId: string;
	decision: "approve" | "reject";
	reason?: string;
}

export interface UpdateTimesheetRequest {
	breakdown?: TimesheetBreakdown[];
	editedDayKeys?: string[];
	status?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "REVISED";
	notes?: string;
}

export interface TimesheetSubmitPayload {
	breakdown: TimesheetBreakdown[];
	editedDayKeys: string[];
}

export interface NormalizeTimesheetBreakdownPreviewRequest {
	timesheetId: string;
	breakdown: TimesheetBreakdown[];
}

export interface NormalizeTimesheetBreakdownPreviewResponse {
	breakdown: TimesheetBreakdown[];
	summary: {
		totalDays: number;
		totalHoursWorked: string;
		totalRegularHours: string;
		totalOvertimeHours: string;
		totalUndertimeHours: string;
		totalLateHours: string;
		totalEarlyOutHours: string;
		metadata: {
			totalMinutesWorked: number;
			totalRegularMinutes: number;
			totalOvertimeMinutes: number;
			totalUndertimeMinutes: number;
			totalLateMinutes: number;
			totalEarlyOutMinutes: number;
		};
	};
}

export interface EnsurePeriodDraftsResponse {
	payrollPeriodId: string;
	eligibleEmployees: number;
	existing: number;
	created: number;
	refreshed?: number;
	skippedExistingEmployees?: number;
	missingEmployees?: number;
	createLimit?: number;
	remainingDraftsToPrepare?: number | null;
	errors: Array<{ employeeId: string; message: string }>;
}

export interface EnsureAutoApprovedTimesheetsResponse {
	payrollPeriodId: string;
	eligibleEmployees: number;
	created: number;
	autoApproved: number;
	refreshedLines: number;
	preservedManual: number;
	skippedLocked: number;
	skippedPaid: number;
	remainingToPrepare?: number | null;
	createLimit?: number;
	errors: Array<{ employeeId: string; message: string }>;
}

export interface CurrentPeriodRepairOptions {
	repairAttendanceObligations: boolean;
	repairDraftTimesheets: boolean;
	includeEmployeesMissingSchedules: boolean;
	showSampleRows: boolean;
}

export interface CurrentPeriodRepairReport {
	dryRun: boolean;
	options: CurrentPeriodRepairOptions;
	payrollPeriod: {
		id: string;
		code?: string | null;
		name: string;
		status: string;
		startDate: string;
		endDate: string;
		payDate: string;
		payFrequency?: string | null;
	};
	employees: {
		checked: number;
		activeEligible: number;
		withSchedules: number;
		missingSchedules: number;
		sampleMissingSchedules: Array<Record<string, unknown>>;
	};
	attendanceObligations: {
		checkedEmployees: number;
		existingBefore: number;
		existingAfter: number;
		missing: number;
		stale: number;
		wouldRepair: number;
		repaired: number;
		repairResult?: Record<string, unknown> | null;
		sampleMissingRows: Array<Record<string, unknown>>;
	};
	timesheets: {
		existing: number;
		existingDrafts: number;
		existingByStatus: Record<string, number>;
		missingDrafts: number;
		wouldCreateDrafts: number;
		createdDrafts: number;
		skippedNonDraftOrLocked: number;
		paidPayrollRows: number;
		sampleMissingDraftEmployees: Array<Record<string, unknown>>;
	};
	skipped: {
		employeesMissingSchedules: number;
		nonDraftOrLockedTimesheets: number;
		paidPayrollRows: number;
		reasons: string[];
	};
}

export interface CurrentPeriodRepairRequest {
	dryRun?: boolean;
	options: CurrentPeriodRepairOptions;
}

export interface LockPeriodTimesheetsResponse {
	payrollPeriodId: string;
	approvedTotal: number;
	locked: number;
	alreadyLocked: number;
	lockRunId: string;
	blockers: Record<string, number>;
}

export type TimesheetReminderKind =
	| "employee_submit"
	| "employee_correct"
	| "manager_approval";

export interface SendTimesheetReminderResponse {
	timesheetId: string;
	notificationId: string;
	kind: TimesheetReminderKind;
}

function normalizeTimesheetLineBreakdown(
	line: Timesheetline,
	approvalStatus: Timesheet["status"] = "DRAFT",
): TimesheetBreakdown {
	const metadata =
		line.metadata && typeof line.metadata === "object" && !Array.isArray(line.metadata)
			? line.metadata
			: {};
	const leaveEntries = Array.isArray((metadata as any).leaveEntries)
		? ((metadata as any).leaveEntries as TimesheetLeaveEntry[])
		: [];
	const holidayEntries = Array.isArray((metadata as any).holidayEntries)
		? ((metadata as any).holidayEntries as TimesheetHolidayEntry[])
		: [];
	const leaveType =
		typeof (metadata as any).leaveType === "string" ? ((metadata as any).leaveType as string) : null;

	return {
		approvalStatus,
		date: line.date,
		timeIn: line.timeIn ?? null,
		timeOut: line.timeOut ?? null,
		hoursWorked: line.hoursWorked || "0:00",
		regularHours: line.regularHours || "0:00",
		overtimeHours: line.overtimeHours || "0:00",
		undertimeHours: line.undertimeHours || "0:00",
		lateHours: line.lateHours || "0:00",
		earlyOutHours: line.earlyOutHours || "0:00",
		status: line.status || "NOT_CLOCKED_IN",
		leaveType,
		leaveEntries,
		holidayEntries,
		primaryMarker: line.primaryMarker as TimesheetPrimaryMarker | undefined,
		employeeNotes: line.employeeNotes ?? line.notes ?? null,
		approverNotes: line.approverNotes ?? null,
		dayLaborType:
			line.dayLaborType === "DIRECT" || line.dayLaborType === "INDIRECT"
				? line.dayLaborType
				: null,
		projectCode: typeof line.projectCode === "string" ? line.projectCode : null,
		metadata: {
			...metadata,
			breakMinutes: line.breakMinutes ?? metadata.breakMinutes ?? null,
		},
	};
}

function normalizeAttendanceBreakdown(
	attendance: Attendance,
	approvalStatus: Timesheet["status"] = "DRAFT",
): TimesheetBreakdown {
	const metadata =
		(attendance as any).metadata && typeof (attendance as any).metadata === "object"
			? ((attendance as any).metadata as Record<string, any>)
			: {};
	const leaveEntries = Array.isArray(attendance.leaveEntries) ? attendance.leaveEntries : [];
	const holidayEntries = Array.isArray(attendance.holidayEntries)
		? attendance.holidayEntries
		: [];
	const primaryMarker =
		attendance.primaryMarker ||
		(holidayEntries.length
			? "HOLIDAY"
			: leaveEntries.length || attendance.leaveType || attendance.status === "LEAVE"
				? "LEAVE"
				: attendance.status === "REST_DAY"
					? "REST_DAY"
					: attendance.status === "ABSENT"
						? "ABSENT"
						: "HOURS");

	return {
		approvalStatus,
		date: attendance.date,
		timeIn: attendance.timeIn ?? null,
		timeOut: attendance.timeOut ?? null,
		hoursWorked: attendance.hoursWorked || "0:00",
		regularHours: attendance.regularHours || "0:00",
		overtimeHours: attendance.overtimeHours || "0:00",
		undertimeHours: attendance.undertimeHours || "0:00",
		lateHours: attendance.lateHours || "0:00",
		earlyOutHours: attendance.earlyOutHours || "0:00",
		status: attendance.status || "NOT_CLOCKED_IN",
		leaveType: attendance.leaveType ?? leaveEntries[0]?.leaveType ?? null,
		leaveEntries,
		holidayEntries,
		primaryMarker: primaryMarker as TimesheetPrimaryMarker,
		employeeNotes: attendance.notes ?? null,
		approverNotes: null,
		metadata: {
			...metadata,
			breakMinutes: attendance.breakMinutes ?? metadata.breakMinutes ?? null,
			scheduleSnapshot: attendance.scheduleSnapshot ?? metadata.scheduleSnapshot ?? null,
		},
	};
}

function normalizeTimesheetContract(timesheet: Timesheet): Timesheet {
	if (Array.isArray(timesheet.breakdown) && timesheet.breakdown.length > 0) return timesheet;
	if (Array.isArray(timesheet.timesheetlines) && timesheet.timesheetlines.length > 0) {
		return {
			...timesheet,
			breakdown: timesheet.timesheetlines
				.filter((line) => !line.isDeleted)
				.slice()
				.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
				.map((line) => normalizeTimesheetLineBreakdown(line, timesheet.status)),
		};
	}

	if (Array.isArray(timesheet.attendances) && timesheet.attendances.length > 0) {
		return {
			...timesheet,
			breakdown: timesheet.attendances
				.filter((attendance) => !attendance.isDeleted)
				.slice()
				.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
				.map((attendance) => normalizeAttendanceBreakdown(attendance, timesheet.status)),
		};
	}

	return {
		...timesheet,
		breakdown: Array.isArray(timesheet.breakdown) ? timesheet.breakdown : [],
	};
}

function normalizeTimesheetsResponse<T extends TimesheetsResponse | HRTimesheetQueuesResponse>(
	response: T,
): T {
	const normalizedResponse: any = {
		...response,
	};

	if (Array.isArray((response as TimesheetsResponse).timesheets)) {
		normalizedResponse.timesheets = (response as TimesheetsResponse).timesheets.map(
			normalizeTimesheetContract,
		);
	}

	const queues = (response as HRTimesheetQueuesResponse).timesheetQueues;
	if (queues) {
		normalizedResponse.timesheetQueues = Object.fromEntries(
			Object.entries(queues).map(([key, bucket]) => [
				key,
				{
					...bucket,
					timesheets: Array.isArray(bucket.timesheets)
						? bucket.timesheets.map(normalizeTimesheetContract)
						: [],
				},
			]),
		);
	}

	return normalizedResponse as T;
}

class TimesheetService extends APIService {
	/**
	 * Get all timesheets for the current user
	 */
	async getTimesheets(params?: any): Promise<TimesheetsResponse> {
		try {
			if (params) {
				this.setParams(params);
			}
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<TimesheetsResponse>(`/api/timesheet${queryString}`);
			if (!response.data) {
				throw new Error(response.message || "Failed to fetch timesheets");
			}
			return normalizeTimesheetsResponse(response.data);
		} catch (error: any) {
			console.error("Error fetching timesheets:", error);
			throw new Error(error.message || "Failed to fetch timesheets");
		}
	}

	async getTimesheetsForExport(params?: any): Promise<TimesheetsResponse> {
		try {
			const response = await hrisApiClient.get<TimesheetsResponse>("/api/timesheet", {
				...params,
				document: true,
				count: true,
				pagination: true,
			});
			if (!response.data) {
				throw new Error(response.message || "Failed to fetch timesheets for export");
			}
			return normalizeTimesheetsResponse(response.data);
		} catch (error: any) {
			console.error("Error fetching timesheets for export:", error);
			throw new Error(error.message || "Failed to fetch timesheets for export");
		}
	}

	/**
	 * View current timesheet for the authenticated employee
	 */
	async viewTimesheets(params?: any): Promise<TimesheetViewResponse> {
		try {
			const { enabled, ...queryParams } = params || {};
			const response = await hrisApiClient.get<TimesheetViewResponse>("/api/timesheet/view", queryParams);
			if (!response.data) {
				throw new Error(response.message || "Failed to fetch timesheet");
			}
			return {
				...response.data,
				timesheet: normalizeTimesheetContract(response.data.timesheet),
			};
		} catch (error: any) {
			console.error("Error viewing timesheet:", error);
			throw new Error(error.message || "Failed to view timesheet");
		}
	}

	async ensurePeriodDrafts(
		payrollPeriodId: string,
		options: { createLimit?: number; employeeIds?: string[] } = {},
	): Promise<EnsurePeriodDraftsResponse> {
		try {
			const response = await hrisApiClient.post<EnsurePeriodDraftsResponse>(
				"/api/timesheet/ensure-period-drafts",
				{ payrollPeriodId, ...options },
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to prepare draft timesheets");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error preparing draft timesheets:", error);
			throw new Error(error.message || "Failed to prepare draft timesheets");
		}
	}

	async ensureAutoApprovedTimesheets(
		payrollPeriodId: string,
		options: { createLimit?: number; employeeIds?: string[] } = {},
	): Promise<EnsureAutoApprovedTimesheetsResponse> {
		try {
			const response = await hrisApiClient.post<EnsureAutoApprovedTimesheetsResponse>(
				"/api/timesheet/ensure-auto-approved",
				{ payrollPeriodId, ...options },
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to generate auto-approved timesheets");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error generating auto-approved timesheets:", error);
			throw new Error(error.message || "Failed to generate auto-approved timesheets");
		}
	}

	async syncObligationLines(
		timesheetId: string,
	): Promise<{ timesheetId: string; lineCount: number }> {		try {
			const response = await hrisApiClient.post<{ timesheetId: string; lineCount: number }>(
				`/api/timesheet/${timesheetId}/sync-obligation-lines`,
				{},
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to sync timesheet obligation lines");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error syncing timesheet obligation lines:", error);
			throw new Error(error.message || "Failed to sync timesheet obligation lines");
		}
	}

	async repairCurrentPeriodCoverage(
		payload: CurrentPeriodRepairRequest,
	): Promise<CurrentPeriodRepairReport> {
		try {
			const response = await hrisApiClient.post<CurrentPeriodRepairReport>(
				"/api/timesheet/current-period-repair",
				payload,
				{ timeoutMs: 120000 },
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to run current period repair");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error running current period repair:", error);
			throw new Error(error.message || "Failed to run current period repair");
		}
	}

	async lockPeriodTimesheets(payrollPeriodId: string): Promise<LockPeriodTimesheetsResponse> {
		try {
			const response = await hrisApiClient.post<LockPeriodTimesheetsResponse>(
				"/api/timesheet/lock-period",
				{ payrollPeriodId },
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to lock period timesheets");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error locking period timesheets:", error);
			throw new Error(error.message || "Failed to lock period timesheets");
		}
	}

	/**
	 * Get a timesheet by ID or Code
	 * @param idOrCode - Can be MongoDB ObjectId or timesheet code
	 * @param params - Optional query parameters
	 */
	async getTimesheetById(idOrCode: string, params?: any): Promise<Timesheet> {
		try {
			if (params) {
				this.setParams(params);
			}
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<Timesheet>(`/api/timesheet/${idOrCode}${queryString}`);
			if (!response.data) {
				throw new Error(response.message || "Failed to fetch timesheet");
			}
			return normalizeTimesheetContract(response.data);
		} catch (error: any) {
			console.error("Error fetching timesheet:", error);
			throw new Error(error.message || "Failed to fetch timesheet");
		}
	}

	/**
	 * Get a timesheet by code
	 * @param code - Timesheet code (format: YYYYMMDDTTTTTTTTTTT)
	 * @param params - Optional query parameters
	 */
	async getTimesheetByCode(code: string, params?: any): Promise<Timesheet> {
		return this.getTimesheetById(code, params); // API auto-detects if it's ID or code
	}

	/**
	 * Submit, approve, reject, or revise a timesheet
	 */
	async timesheetAction(id: string, action: TimesheetActionRequest): Promise<Timesheet> {
		try {
			const response = await hrisApiClient.post<Timesheet>(
				`/api/timesheet/${id}/action`,
				action,
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to perform action on timesheet");
			}
			return normalizeTimesheetContract(response.data);
		} catch (error: any) {
			console.error("Error performing timesheet action:", error);
			throw new Error(error.message || "Failed to perform action on timesheet");
		}
	}

	async sendReminder(
		timesheetId: string,
		kind: TimesheetReminderKind,
	): Promise<SendTimesheetReminderResponse> {
		try {
			const response = await hrisApiClient.post<SendTimesheetReminderResponse>(
				`/api/timesheet/${timesheetId}/reminder`,
				{ kind },
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to send timesheet reminder");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error sending timesheet reminder:", error);
			throw new Error(error.message || "Failed to send timesheet reminder");
		}
	}

	/**
	 * Update a timesheet
	 * @param idOrCode - Can be MongoDB ObjectId or timesheet code
	 * @param data - Update data (breakdown, status, notes)
	 */
	async updateTimesheet(idOrCode: string, data: UpdateTimesheetRequest): Promise<Timesheet> {
		try {
			const response = await hrisApiClient.patch<Timesheet>(
				`/api/timesheet/${idOrCode}`,
				data,
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to update timesheet");
			}
			return normalizeTimesheetContract(response.data);
		} catch (error: any) {
			console.error("Error updating timesheet:", error);
			throw new Error(error.message || "Failed to update timesheet");
		}
	}

	async normalizeTimesheetBreakdownPreview(
		payload: NormalizeTimesheetBreakdownPreviewRequest,
	): Promise<NormalizeTimesheetBreakdownPreviewResponse> {
		try {
			const response = await hrisApiClient.post<NormalizeTimesheetBreakdownPreviewResponse>(
				"/api/timesheet/normalize-breakdown-preview",
				payload,
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to normalize breakdown preview");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error normalizing timesheet breakdown preview:", error);
			throw new Error(error.message || "Failed to normalize breakdown preview");
		}
	}

	/**
	 * Delete a timesheet
	 */
	async deleteTimesheet(id: string): Promise<void> {
		try {
			const response = await hrisApiClient.delete(`/api/timesheet/${id}`);
			if (!response.success) {
				throw new Error(response.message || "Failed to delete timesheet");
			}
		} catch (error: any) {
			console.error("Error deleting timesheet:", error);
			throw new Error(error.message || "Failed to delete timesheet");
		}
	}

	/**
	 * Submit timesheet for the current period
	 * Auto-generates and submits timesheet for the authenticated employee
	 * @param notes - Optional notes to include with the submission
	 */
	async submitTimesheet(payload?: SubmitTimesheetRequest): Promise<Timesheet> {
		try {
			const response = await hrisApiClient.post<Timesheet>(
				"/api/timesheet/submit",
				payload || {},
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to submit timesheet");
			}
			return normalizeTimesheetContract(response.data);
		} catch (error: any) {
			console.error("Error submitting timesheet:", error);
			throw new Error(error.message || "Failed to submit timesheet");
		}
	}

	async createOvertimeRequest(
		timesheetId: string,
		payload: CreateOvertimeRequestPayload,
	): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>(
				`/api/timesheet/${timesheetId}/overtime-requests`,
				payload,
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to create overtime request");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error creating overtime request:", error);
			throw new Error(error.message || "Failed to create overtime request");
		}
	}

	async createPayrollCorrection(
		timesheetId: string,
		payload: CreatePayrollCorrectionPayload,
	): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>(
				`/api/timesheet/${timesheetId}/payroll-corrections`,
				payload,
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to create payroll correction");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error creating payroll correction:", error);
			throw new Error(error.message || "Failed to create payroll correction");
		}
	}

	async listPayrollCorrections(timesheetId: string): Promise<any> {
		try {
			const response = await hrisApiClient.get<any>(
				`/api/timesheet/${timesheetId}/payroll-corrections`,
			);
			return response.data;
		} catch (error: any) {
			console.error("Error listing payroll corrections:", error);
			throw new Error(error.message || "Failed to list payroll corrections");
		}
	}

	async requestEditPermission(
		timesheetId: string,
		payload: RequestEditPermissionPayload,
	): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>(
				`/api/timesheet/${timesheetId}/edit-permission/request`,
				payload,
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to request edit permission");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error requesting edit permission:", error);
			throw new Error(error.message || "Failed to request edit permission");
		}
	}

	async requestEditPermissionCurrent(payload: RequestCurrentEditPermissionPayload): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>(
				"/api/timesheet/edit-permission/request-current",
				payload,
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to request edit permission");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error requesting current edit permission:", error);
			throw new Error(error.message || "Failed to request edit permission");
		}
	}

	async reviewEditPermission(timesheetId: string, payload: ReviewEditPermissionPayload): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>(
				`/api/timesheet/${timesheetId}/edit-permission/review`,
				payload,
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to review edit permission");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error reviewing edit permission:", error);
			throw new Error(error.message || "Failed to review edit permission");
		}
	}

	async consumeEditPermission(timesheetId: string): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>(
				`/api/timesheet/${timesheetId}/edit-permission/consume`,
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to consume edit permission");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error consuming edit permission:", error);
			throw new Error(error.message || "Failed to consume edit permission");
		}
	}

	/**
	 * Get organization timesheet policy configuration
	 */
	async getTimesheetConfig(): Promise<TimesheetConfig> {
		try {
			const response = await hrisApiClient.get<TimesheetConfig>("/api/timesheet/config");
			if (!response.data) {
				throw new Error(response.message || "Failed to fetch timesheet settings");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error fetching timesheet settings:", error);
			throw new Error(error.message || "Failed to fetch timesheet settings");
		}
	}

	/**
	 * Update organization timesheet policy configuration
	 */
	async updateTimesheetConfig(payload: UpdateTimesheetConfigRequest): Promise<TimesheetConfig> {
		try {
			const response = await hrisApiClient.patch<TimesheetConfig>(
				"/api/timesheet/config",
				payload,
			);
			if (!response.data) {
				throw new Error(response.message || "Failed to update timesheet settings");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating timesheet settings:", error);
			throw new Error(error.message || "Failed to update timesheet settings");
		}
	}
}

const timesheetService = new TimesheetService();
export default timesheetService;

