import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface PayrollPeriod {
	id: string;
	name: string;
	code?: string;
	startDate: string;
	endDate: string;
	payDate: string;
	payFrequency?:
		| "DAILY"
		| "WEEKLY"
		| "BIWEEKLY"
		| "SEMI_MONTHLY"
		| "MONTHLY"
		| "QUARTERLY"
		| "ANNUALLY";
	calculatorId?: string;
	status: "DRAFT" | "OPEN" | "PROCESSING" | "COMPLETED" | "CLOSED";
	cutoffDay?: number;
	periodNumber?: number;
	notes?: string;
	generationMetadata?: Record<string, any>;
	processedBy?: string;
	processedAt?: string;
	createdAt: string;
	updatedAt: string;
	_count?: {
		attendanceObligations?: number;
		timesheets?: number;
		timesheetlines?: number;
		employeePayrolls?: number;
	};
}

/**
 * Prefer `code` when present (stable, human-friendly), otherwise fallback to `id`.
 * This works with the API which supports `GET /api/payrollperiod/:identifier` (id or code).
 */
export function getPayrollPeriodIdentifier(period?: { id?: string; code?: string | null }) {
	const code = typeof period?.code === "string" ? period.code.trim() : "";
	if (code) return code;
	return typeof period?.id === "string" ? period.id : "";
}

export interface CreatePayrollPeriodRequest {
	name: string;
	startDate: string;
	endDate: string;
	payDate: string;
	calculatorId?: string;
	payFrequency?:
		| "DAILY"
		| "WEEKLY"
		| "BIWEEKLY"
		| "SEMI_MONTHLY"
		| "MONTHLY"
		| "QUARTERLY"
		| "ANNUALLY";
	status?: "DRAFT" | "OPEN" | "PROCESSING" | "COMPLETED" | "CLOSED";
	cutoffDay?: number;
	periodNumber?: number;
	notes?: string;
	organizationId: string;
}

export interface UpdatePayrollPeriodRequest {
	name?: string;
	startDate?: string;
	endDate?: string;
	payDate?: string;
	payFrequency?:
		| "DAILY"
		| "WEEKLY"
		| "BIWEEKLY"
		| "SEMI_MONTHLY"
		| "MONTHLY"
		| "QUARTERLY"
		| "ANNUALLY";
	calculatorId?: string;
	status?: "DRAFT" | "OPEN" | "PROCESSING" | "COMPLETED" | "CLOSED";
	cutoffDay?: number;
	periodNumber?: number;
	notes?: string;
}

export interface PayrollPeriodResponse {
	status: string;
	message: string;
	data: PayrollPeriod;
	code?: number;
	timestamp?: string;
}

export interface PayrollPeriodsResponse {
	status: string;
	message: string;
	data: {
		payrollPeriods: PayrollPeriod[];
		pagination?: {
			total: number;
			page: number;
			limit: number;
		};
	};
	code?: number;
	timestamp?: string;
}

export interface PayrollGenerationStartResponse {
	action?: "started" | "pause_requested" | "cancellation_requested" | "reopened";
	cancellationRequested?: boolean;
	pauseRequested?: boolean;
	jobId?: string;
	message: string;
	total?: number;
}

export interface PayrollGenerationProgress {
	jobId: string;
	periodId?: string;
	status: "processing" | "paused" | "completed" | "failed" | "cancelled";
	total: number;
	processed: number;
	success: number;
	failed: number;
	errors: Array<{ row: number; employeeId: string; error: string }>;
	startedAt: string;
	/** Heartbeat timestamp while job runs — survives navigation when persisted */
	updatedAt?: string;
	completedAt?: string;
	message?: string;
	cancellationRequested?: boolean;
	cancellationRequestedAt?: string;
	pauseRequested?: boolean;
	pauseRequestedAt?: string;
	/**
	 * True when the API process no longer owns a live worker for this job
	 * (e.g. pod restart). Period may still be PROCESSING — use Resume.
	 */
	orphaned?: boolean;
}

export type PayrollBusinessDayRule = "NONE" | "NEXT_BUSINESS_DAY";
export type PayrollFrequency =
	| "DAILY"
	| "WEEKLY"
	| "BIWEEKLY"
	| "SEMI_MONTHLY"
	| "MONTHLY"
	| "QUARTERLY"
	| "ANNUALLY";

export interface PayrollCycleRules {
	SEMI_MONTHLY?: {
		firstStartDay: number;
		secondStartDay: number;
		secondEndDay: number | "LAST_DAY";
	};
	WEEKLY?: { anchorWeekday: number };
	BIWEEKLY?: { anchorWeekday: number };
	MONTHLY?: { startDay: number; endDay: number | "LAST_DAY" };
	QUARTERLY?: { startMonth: number };
	ANNUALLY?: { startMonth: number };
}

export interface PayrollCycleConfig {
	id: string;
	organizationId: string;
	defaultPayFrequency: PayrollFrequency;
	payDateOffsetDays: number;
	businessDayRule: PayrollBusinessDayRule;
	includeHolidaysInBusinessDayCheck: boolean;
	cycleRules?: PayrollCycleRules;
	createdAt: string;
	updatedAt: string;
}

export interface UpdatePayrollCycleConfigRequest {
	defaultPayFrequency?: PayrollFrequency;
	payDateOffsetDays?: number;
	businessDayRule?: PayrollBusinessDayRule;
	includeHolidaysInBusinessDayCheck?: boolean;
	cycleRules?: PayrollCycleRules;
}

export interface BulkGeneratePayrollPeriodsRequest {
	frequency: PayrollFrequency;
	rangeStart: string;
	rangeEnd: string;
	calculatorId?: string;
	namingMode?: "DEFAULT" | "MONTHLY_LABEL" | "CUSTOM_PREFIX";
	customNamePrefix?: string;
	dryRun?: boolean;
}

export interface BulkGeneratePayrollPeriodsResponse {
	totalComputed: number;
	created: number;
	updated: number;
	skipped: number;
	items: Array<{ code: string; action: string; reason?: string }>;
}

export interface BulkAdjustPayrollPeriodsRequest {
	frequency?: PayrollFrequency;
	periodIds?: string[];
	forceRetroactive?: boolean;
	dryRun?: boolean;
}

export interface BulkAdjustPayrollPeriodsResponse {
	total: number;
	updated: number;
	skipped: number;
	dryRunApplied?: boolean;
	items: Array<{ id: string; code?: string | null; action: string; reason?: string }>;
}

export interface TimesheetPayrollPreviewSummary {
	scopeEmployeesCount?: number;
	approvedTimesheetsCount: number;
	includedEmployeesCount: number;
	excludedEmployeesCount: number;
	approvedExcludedEmployeesCount?: number;
	notSubmittedEmployeesCount?: number;
	estimatedGrossPay: number;
	estimatedTotalDeductions: number;
	estimatedNetPay: number;
}

export interface TimesheetPayrollPreviewEmployee {
	employeeId: string;
	employeeCode?: string | null;
	name: string;
	department: string;
	position: string;
	payFrequency: string;
	basicSalary: number;
	timesheetId: string;
	timesheetCode?: string;
	timesheetStatus?: string;
	payrollComputationStatus?: string;
	basicPay?: number;
	overtimePay?: number;
	nightDiffPay?: number;
	holidayPay?: number;
	grossPay?: number;
	taxableIncome?: number;
	totalDeductions?: number;
	netPay?: number;
	allowances?: number;
	loanDeductions?: number;
	otherDeductions?: number;
	totalReceivable?: number;
	payrollRegister?: Record<string, number | string | null | undefined>;
	payrollRegisterColumns?: Array<{
		column: string;
		label: string;
		field: string;
		value: number;
		source?: string;
	}>;
	deductions?: {
		sssContribution: number;
		philHealthContribution: number;
		pagibigContribution: number;
		taxAmount: number;
		absentDeduction: number;
		lateDeduction: number;
		earlyOutDeduction: number;
	};
	metadata?: Record<string, any>;
}

export interface TimesheetPayrollSourceDetail {
	id: string;
	source: "employeeBenefit" | "employeeLoan";
	code?: string | null;
	/** Primary label: payroll adjustment / enrollment name. */
	name: string;
	/** Benefit type name shown as category. */
	benefitTypeName?: string | null;
	direction: "COMPENSATION" | "DEDUCTION" | "LOAN";
	reconciliationAction?: string | null;
	/** From BenefitType when known; unknown treated as taxable for disclosure. */
	isTaxable?: boolean | null;
	amount: number;
	startDate?: string | null;
	endDate?: string | null;
	payrollPeriodId?: string | null;
	payrollPeriodCode?: string | null;
}

export interface TimesheetPayrollPreviewExcludedEmployee {
	employeeId?: string | null;
	employeeCode?: string | null;
	name: string;
	department?: string | null;
	position?: string | null;
	payFrequency?: string | null;
	basicSalary?: number | null;
	timesheetId?: string | null;
	timesheetStatus?: string | null;
	reason: string;
	blockerType: string;
}

export interface TimesheetPayrollPreviewPagination {
	page: number;
	limit: number;
	totalItems: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPreviousPage: boolean;
}

export type OtApprovalSource = "system" | "manager" | "none";

export interface PayrollOtReadinessPerson {
	employeeId: string;
	employeeCode: string | null;
	name: string;
	department: string | null;
	timesheetId: string;
	timesheetStatus: string;
	timesheetOtHours: string;
	timesheetOtMinutes: number;
	lineOtHours: string;
	lineOtMinutes: number;
	attendanceOtHours: string;
	attendanceOtMinutes: number;
	deltaMinutes: number;
	deltaHours: number;
	lineDaysWithOt: number;
	isPayableApproved?: boolean;
	approvalSource?: OtApprovalSource;
	approvedBy?: string | null;
	approvalDate?: string | null;
	approvalLabel?: string;
	blockerClass:
		| "ok"
		| "ot_on_lines_only"
		| "attendance_ot_without_line"
		| "no_ot"
		| "timesheet_not_approved";
	nextStep: string;
}

export interface PayrollOtDayDetail {
	lineId: string;
	date: string;
	status: string | null;
	overtimeHours: string;
	overtimeMinutes: number;
	regularHours: string | null;
	hoursWorked: string | null;
	primaryMarker: string | null;
	approvedBuckets: Record<string, number> | null;
	sourceRow: number | null;
	sourceLabel: string | null;
	appliedAt: string | null;
}

export interface PayrollOtCategoryTotals {
	payableOtHours: number;
	regOtHrs: number;
	regNdHrs: number;
	spclHrs: number;
	spclOtHrs: number;
	rholHrs: number;
	rholOtHrs: number;
	rdHrs: number;
	rdOtHrs: number;
	regularDays: number;
}

export interface PayrollOtPersonDetail {
	employeeId: string;
	employeeCode: string | null;
	name: string;
	department: string | null;
	timesheetId: string;
	timesheetStatus: string;
	approvalSource: OtApprovalSource;
	approvalLabel: string;
	approvedBy: string | null;
	approvalDate: string | null;
	totalLineOtHours: string;
	totalLineOtMinutes: number;
	otDayCount: number;
	categoryTotals?: PayrollOtCategoryTotals;
	days: PayrollOtDayDetail[];
	truth: {
		note: string;
		payableWhen: string;
	};
}

/** WorkSharing / schedule assignment deltas for Run Payroll accordion. */
export interface PayrollScheduleDeltaRow {
	historyId: string;
	employeeId: string;
	employeeCode: string | null;
	name: string;
	action: string;
	effectiveAt: string | null;
	createdAt: string;
	reason: string | null;
	beforeTemplateCode: string | null;
	afterTemplateCode: string | null;
	sourceWorkbook: string | null;
	sourceSheet: string | null;
	sourceRow: number | null;
	isWorkshare: boolean;
}

export interface PayrollScheduleDeltaResponse {
	period: {
		id: string;
		code: string | null;
		startDate: string;
		endDate: string;
	};
	summary: {
		totalDeltas: number;
		workshareDeltas: number;
		otherDeltas: number;
		uniqueEmployees: number;
		templateChanges: number;
		alreadySameSkipped: number;
	};
	rows: PayrollScheduleDeltaRow[];
	pagination: {
		page: number;
		limit: number;
		totalItems: number;
		totalPages: number;
		hasNextPage: boolean;
	};
	truth: {
		source: string;
		note: string;
	};
}

export interface PayrollOtReadinessResponse {
	period: {
		id: string;
		code: string | null;
		name: string | null;
		startDate: string;
		endDate: string;
		periodNumber: number | null;
		status: string;
	};
	truth: {
		payableSource: string;
		rawAttendanceRole: string;
		note: string;
	};
	summary: {
		timesheetsTotal: number;
		timesheetsApproved: number;
		peopleWithLineOt: number;
		peopleWithApprovedOt?: number;
		peopleWithPendingOtApproval?: number;
		peopleWithTimesheetOtSummary: number;
		peopleWithoutOt: number;
		totalLineOtMinutes: number;
		totalLineOtHours: number;
		totalApprovedLineOtMinutes?: number;
		totalApprovedLineOtHours?: number;
		totalAttendanceOtMinutes: number;
		totalAttendanceOtHours: number;
		totalDeltaMinutes: number;
	};
	people: PayrollOtReadinessPerson[];
	pagination: {
		page: number;
		limit: number;
		totalItems: number;
		totalPages: number;
		hasNextPage: boolean;
	};
}

export interface TimesheetPayrollPreviewParams {
	page?: number;
	limit?: number;
	query?: string;
	departmentId?: string | null;
	sectionId?: string | null;
	employeeId?: string | null;
	/** When true, compute gross/net/deductions for each included row (dry-run). */
	calculateRows?: boolean;
}

export interface TimesheetPayrollPreviewResponse {
	period: {
		id: string;
		code?: string | null;
		name: string;
		startDate: string;
		endDate: string;
		payDate: string;
		status: string;
	};
	summary: TimesheetPayrollPreviewSummary;
	includedEmployees: TimesheetPayrollPreviewEmployee[];
	excludedEmployees?: TimesheetPayrollPreviewExcludedEmployee[];
	pagination: TimesheetPayrollPreviewPagination;
}

class PayrollPeriodsService extends APIService {
	async getPayrollPeriods(): Promise<PayrollPeriodsResponse> {
		const queryString = this.getQueryString();
		const response = await hrisApiClient.get<PayrollPeriodsResponse>(
			`/api/payrollperiod${queryString}`,
		);
		if (!response?.data) throw new Error("Invalid payroll periods response");
		return response.data;
	}

	async getPayrollPeriod(id: string): Promise<PayrollPeriod> {
		const queryString = this.getQueryString();
		const response = await hrisApiClient.get<any>(`/api/payrollperiod/${id}${queryString}`);
		if (!response?.data) throw new Error("Invalid payroll period response");

		// Extract period from nested structure: response.data.data
		let periodData = response.data;
		if (periodData && typeof periodData === "object" && "data" in periodData) {
			periodData = periodData.data;
		}

		if (!periodData) {
			throw new Error("Payroll period data is undefined");
		}

		return periodData as PayrollPeriod;
	}

	async createPayrollPeriod(payload: CreatePayrollPeriodRequest): Promise<PayrollPeriodResponse> {
		const response = await hrisApiClient.post<PayrollPeriodResponse>(
			"/api/payrollperiod",
			payload,
		);
		if (!response?.data) throw new Error("Invalid create payroll period response");
		return response.data;
	}

	async updatePayrollPeriod(
		id: string,
		payload: UpdatePayrollPeriodRequest,
	): Promise<PayrollPeriodResponse> {
		const response = await hrisApiClient.patch<PayrollPeriodResponse>(
			`/api/payrollperiod/${id}`,
			payload,
		);
		if (!response?.data) throw new Error("Invalid update payroll period response");
		return response.data;
	}

	async deletePayrollPeriod(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/payrollperiod/${id}`);
	}

	async generatePayroll(id: string): Promise<any> {
		const response = await hrisApiClient.post<any>(`/api/payrollperiod/${id}/generate`);
		if (!response?.data) throw new Error("Invalid generate payroll response");
		return response.data;
	}

	async generateTimesheetPayroll(
		id: string,
		scope?: { departmentId?: string | null; sectionId?: string | null },
	): Promise<PayrollGenerationStartResponse> {
		const response = await hrisApiClient.post<any>(
			`/api/payrollperiod/${id}/generate-timesheet`,
			{
				...(scope?.departmentId ? { departmentId: scope.departmentId } : {}),
				...(scope?.sectionId ? { sectionId: scope.sectionId } : {}),
			},
		);
		if (!response?.data) throw new Error("Invalid generate timesheet payroll response");
		const payload = response.data?.data || response.data;
		return payload as PayrollGenerationStartResponse;
	}

	async requestStopTimesheetPayroll(id: string): Promise<PayrollGenerationStartResponse> {
		const response = await hrisApiClient.post<any>(
			`/api/payrollperiod/${id}/generate-timesheet/stop`,
		);
		if (!response?.data) throw new Error("Invalid stop timesheet payroll response");
		const payload = response.data?.data || response.data;
		return payload as PayrollGenerationStartResponse;
	}

	async requestPauseTimesheetPayroll(id: string): Promise<PayrollGenerationStartResponse> {
		const response = await hrisApiClient.post<any>(
			`/api/payrollperiod/${id}/generate-timesheet/pause`,
		);
		if (!response?.data) throw new Error("Invalid pause timesheet payroll response");
		const payload = response.data?.data || response.data;
		return payload as PayrollGenerationStartResponse;
	}

	async getGenerateTimesheetPayrollPreview(
		id: string,
		params?: TimesheetPayrollPreviewParams,
	): Promise<TimesheetPayrollPreviewResponse> {
		const query = new URLSearchParams();
		if (params?.page) {
			query.set("page", String(params.page));
		}
		if (params?.limit) {
			query.set("limit", String(params.limit));
		}
		if (params?.query) {
			query.set("query", params.query);
		}
		if (params?.departmentId) {
			query.set("departmentId", params.departmentId);
		}
		if (params?.sectionId) {
			query.set("sectionId", params.sectionId);
		}
		if (params?.employeeId) {
			query.set("employeeId", params.employeeId);
		}
		if (params?.calculateRows) {
			query.set("calculateRows", "true");
		}
		const queryString = query.toString();
		const response = await hrisApiClient.get<any>(
			`/api/payrollperiod/${id}/generate-timesheet/preview${
				queryString ? `?${queryString}` : ""
			}`,
		);
		if (!response?.data) throw new Error("Invalid timesheet payroll preview response");
		const payload = response.data?.data || response.data;
		return payload as TimesheetPayrollPreviewResponse;
	}

	async getOtReadiness(
		id: string,
		params?: {
			page?: number;
			limit?: number;
			query?: string;
			onlyWithOt?: boolean;
			departmentId?: string | null;
			sectionId?: string | null;
		},
	): Promise<PayrollOtReadinessResponse> {
		const query = new URLSearchParams();
		if (params?.page) query.set("page", String(params.page));
		if (params?.limit) query.set("limit", String(params.limit));
		if (params?.query) query.set("query", params.query);
		if (params?.onlyWithOt === false) query.set("onlyWithOt", "false");
		if (params?.departmentId && params.departmentId !== "all") {
			query.set("departmentId", params.departmentId);
		}
		if (params?.sectionId && params.sectionId !== "all") {
			query.set("sectionId", params.sectionId);
		}
		const queryString = query.toString();
		// Cap client wait so Run Payroll accordion never spins forever if API is slow/down.
		const response = await hrisApiClient.get<any>(
			`/api/payrollperiod/${id}/ot-readiness${queryString ? `?${queryString}` : ""}`,
			undefined,
			{ timeoutMs: 45_000 },
		);
		if (!response?.data) throw new Error("Invalid payroll OT readiness response");
		const payload = response.data?.data || response.data;
		return payload as PayrollOtReadinessResponse;
	}

	async getOtPersonDetail(
		periodId: string,
		timesheetId: string,
	): Promise<PayrollOtPersonDetail> {
		const response = await hrisApiClient.get<any>(
			`/api/payrollperiod/${periodId}/ot-readiness/person/${timesheetId}`,
			undefined,
			{ timeoutMs: 30_000 },
		);
		if (!response?.data) throw new Error("Invalid payroll OT person detail response");
		const payload = response.data?.data || response.data;
		return payload as PayrollOtPersonDetail;
	}

	async getScheduleDeltas(
		periodId: string,
		params?: { page?: number; limit?: number; onlyWorkshare?: boolean },
	): Promise<PayrollScheduleDeltaResponse> {
		const query = new URLSearchParams();
		if (params?.page) query.set("page", String(params.page));
		if (params?.limit) query.set("limit", String(params.limit));
		if (params?.onlyWorkshare === false) query.set("onlyWorkshare", "false");
		const qs = query.toString();
		const response = await hrisApiClient.get<any>(
			`/api/payrollperiod/${periodId}/schedule-deltas${qs ? `?${qs}` : ""}`,
			undefined,
			{ timeoutMs: 45_000 },
		);
		if (!response?.data) throw new Error("Invalid payroll schedule deltas response");
		const payload = response.data?.data || response.data;
		return payload as PayrollScheduleDeltaResponse;
	}

	async getGenerateTimesheetPayrollProgress(
		jobId: string,
	): Promise<PayrollGenerationProgress | null> {
		try {
			const response = await hrisApiClient.get<any>(
				`/api/payrollperiod/generate-timesheet/progress/${jobId}`,
			);
			if (!response?.data) throw new Error("Invalid payroll generation progress response");
			const payload = response.data?.data || response.data;
			return payload as PayrollGenerationProgress;
		} catch (error: any) {
			// 404 = job never existed / TTL expired / not hydrated. FE treats as stuck when period is PROCESSING.
			const status = error?.response?.status ?? error?.status;
			if (status === 404) return null;
			throw error;
		}
	}

	async getActiveTimesheetPayrollProgress(
		id: string,
	): Promise<PayrollGenerationProgress | null> {
		const response = await hrisApiClient.get<any>(
			`/api/payrollperiod/${id}/generate-timesheet/progress`,
		);
		// hrisApiClient may return either the envelope { data: progress|null } or already-unwrapped progress.
		// Prefer nested data when present; otherwise use the body itself when it looks like a job.
		const body = response?.data;
		if (body == null) {
			throw new Error("Invalid active payroll generation progress response");
		}
		const nested = body?.data;
		if (nested === null) return null; // explicit no active job
		if (nested && typeof nested === "object" && (nested.jobId || nested.status)) {
			return nested as PayrollGenerationProgress;
		}
		if (typeof body === "object" && (body.jobId || body.status === "processing")) {
			return body as PayrollGenerationProgress;
		}
		// Envelope with data: null already handled; empty success without job
		if (body.status === "success" && (body.data === null || body.data === undefined)) {
			return null;
		}
		return (nested ?? null) as PayrollGenerationProgress | null;
	}

	async getPayrollCycleConfig(): Promise<PayrollCycleConfig> {
		const response = await hrisApiClient.get<any>("/api/payrollperiod/config");
		if (!response?.data) throw new Error("Invalid payroll cycle config response");
		const payload = response.data?.data || response.data;
		return payload as PayrollCycleConfig;
	}

	async updatePayrollCycleConfig(
		payload: UpdatePayrollCycleConfigRequest,
	): Promise<PayrollCycleConfig> {
		const response = await hrisApiClient.patch<any>("/api/payrollperiod/config", payload);
		if (!response?.data) throw new Error("Invalid update payroll cycle config response");
		const responsePayload = response.data?.data || response.data;
		return responsePayload as PayrollCycleConfig;
	}

	async bulkGeneratePayrollPeriods(
		payload: BulkGeneratePayrollPeriodsRequest,
	): Promise<BulkGeneratePayrollPeriodsResponse> {
		const response = await hrisApiClient.post<any>("/api/payrollperiod/bulk-generate", payload);
		if (!response?.data) throw new Error("Invalid bulk generate payroll periods response");
		const responsePayload = response.data?.data || response.data;
		return responsePayload as BulkGeneratePayrollPeriodsResponse;
	}

	async bulkAdjustPayrollPeriods(
		payload: BulkAdjustPayrollPeriodsRequest,
	): Promise<BulkAdjustPayrollPeriodsResponse> {
		const response = await hrisApiClient.post<any>("/api/payrollperiod/bulk-adjust", payload);
		if (!response?.data) throw new Error("Invalid bulk adjust payroll periods response");
		const responsePayload = response.data?.data || response.data;
		return responsePayload as BulkAdjustPayrollPeriodsResponse;
	}
}

const payrollPeriodsService = new PayrollPeriodsService();
export default payrollPeriodsService;
