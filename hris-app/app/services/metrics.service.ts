import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";

export interface MetricsRequest {
	model: string;
	data: string[];
	filter?: Record<string, any>;
}

export interface ActionMetricsResponse {
	total: number;
	summary: {
		total: number;
		high: number;
		medium: number;
		low: number;
	};
	counts: {
		dashboard: number;
		tickets: {
			total: number;
		};
		requests: {
			total: number;
		};
		approvals: {
			total: number;
			requests: number;
			timesheet: number;
		};
		documents: {
			total: number;
			missing: number;
			rejected: number;
			expired: number;
			needsUpdate: number;
			pendingApproval: number;
			hrPendingApproval: number;
			optional: number;
		};
		timesheets: {
			total: number;
		};
		notifications: {
			total: number;
		};
	};
	items: {
		dashboard: ActionMetricDashboardItem[];
		documents: ActionMetricDocumentItem[];
		onboardingDocuments: ActionMetricDocumentItem[];
	};
	categories: {
		documents: ActionMetricDocumentCategorySummary[];
	};
	analytics?: {
		hrQueue?: {
			teamQueue: number;
		};
	};
}

export type ActionMetricPriority = "high" | "medium" | "low";
export type ActionMetricKind =
	| "ATTENDANCE_CLOCK_IN"
	| "TIMESHEET_REMINDER"
	| "APPROVAL_REQUEST"
	| "PAN_APPROVAL"
	| "NOTIFICATION_UNREAD"
	| "ONBOARDING_DOCUMENT";

export interface ActionMetricDashboardItem {
	id: string;
	kind: ActionMetricKind;
	title: string;
	description: string;
	priority: ActionMetricPriority;
	statusLabel: string;
	createdAt: string;
	dueDate: string | null;
	targetPath: string;
	metadata?: Record<string, any>;
}

export type ActionMetricDocumentState =
	| "missing_required"
	| "rejected"
	| "pending_approval"
	| "expired"
	| "needs_update"
	| "ready"
	| "optional";

export type ActionMetricDocumentPriorityLevel = "high" | "medium" | "low";

export interface ActionMetricDocumentItem {
	key: string;
	type: string;
	documentTypeId?: string | null;
	category?: string | null;
	displayName: string;
	name?: string | null;
	number?: string | null;
	issueDate?: string | null;
	expiryDate?: string | null;
	fileUrl?: string | null;
	ext?: string | null;
	documentId?: string | null;
	priorityState: ActionMetricDocumentState;
	actionLabel?: "Upload" | "Fill up" | "Update" | null;
	actionDescription?: string | null;
	isActionable: boolean;
	isVirtual: boolean;
	isExpired: boolean;
	displayOrder: number;
	priorityLevel: ActionMetricDocumentPriorityLevel;
	isMandated: boolean;
	requiredForPayroll: boolean;
	requiredForOnboarding: boolean;
	requireFileForCompliance: boolean;
}

export interface ActionMetricDocumentCategorySummary {
	key: string;
	label: string;
	total: number;
	missingRequired: number;
	rejected: number;
	expired: number;
	needsUpdate: number;
	optional: number;
}

export interface TodayAttendance {
	hasAttendance: boolean;
	id?: string;
	employeeId?: string;
	employeeName?: string;
	date?: string;
	timeIn: string | null;
	timeOut: string | null;
	status: string;
	isManualEntry?: boolean;
	notes?: string | null;
}

export interface AttendanceMetrics {
	todayAttendance: TodayAttendance;
}

export interface MetricsResponse {
	filter: {
		dateFrom: string;
		dateTo: string;
		employeeId: string;
	};
	metrics: AttendanceMetrics;
}

export interface StatusSummary {
	totalEmployees: number;
	PRESENT: number;
	LEAVE: number;
	ABSENT: number;
	LATE: number;
	UNDERTIME: number;
	OVERTIME: number;
	NOT_YET_IN: number;
	attendanceRate: number;
}

export interface StatusSummaryMetrics {
	statusSummary: StatusSummary;
}

export interface StatusSummaryResponse {
	filter: {
		dateFrom: string;
		dateTo: string;
	};
	metrics: StatusSummaryMetrics;
}

export interface EmployeeStatusSummary {
	employeeId: string;
	employeeName: string;
	status: "PRESENT" | "LEAVE" | "ABSENT";
}

export interface EmployeeStatusSummaryMetrics {
	employeeStatusSummary: EmployeeStatusSummary[];
}

export interface EmployeeStatusSummaryResponse {
	filter: {
		dateFrom: string;
		dateTo: string;
		reportToId: string;
	};
	metrics: EmployeeStatusSummaryMetrics;
}

export interface DocumentReviewAuditDetail {
	id: string;
	code: string;
	name: string;
	status: string | null;
	documentId: string | null;
	documentNumber: string | null;
	issueDate: string | null;
	expiryDate: string | null;
	fileUrl: string | null;
	ext: string | null;
	submittedAt: string | null;
	submittedByEmployeeId: string | null;
	submittedByLabel: string | null;
	approvedAt: string | null;
	approvedByEmployeeId: string | null;
	approvedByLabel: string | null;
	rejectedAt: string | null;
	rejectedByEmployeeId: string | null;
	rejectedByLabel: string | null;
	rejectionReason: string | null;
	source: string | null;
}

export interface DocumentComplianceMetrics {
	totalEmployees: number;
	compliantEmployeesCount: number;
	warningEmployeesCount?: number;
	pendingApprovalEmployeesCount?: number;
	nonCompliantEmployeesCount: number;
	compliancePercentage: number;
	totalDocuments: number;
	verifiedDocuments: number;
	verificationPercentage: number;
	documentBreakdown: Array<{
		id: string;
		code: string;
		name: string;
		count: number;
		applicableEmployees?: number;
		missingCount?: number;
		priorityLevel?: "high" | "medium" | "low";
		isMandated?: boolean;
		percentage: number;
	}>;
	compliantEmployees: Array<{
		id: string;
		employeeId: string;
		name: string;
		department: string;
		section?: string;
		position: string;
		compliancePercent?: number;
		overallStatus?: "compliant";
		documentCount: number;
		documentTypeCodes: string[];
		documentTypeNames: string[];
		compliantDocDetails?: Array<{
			id: string;
			code: string;
			name: string;
			priorityLevel: "high" | "medium" | "low";
			isMandated: boolean;
			requiredForPayroll: boolean;
			requiredForOnboarding: boolean;
		}>;
		recommendedMissingDocs?: string[];
		recommendedMissingDocCodes?: string[];
		recommendedMissingDocDetails?: Array<{
			id: string;
			code: string;
			name: string;
			priorityLevel: "high" | "medium" | "low";
			isMandated: boolean;
			requiredForPayroll: boolean;
			requiredForOnboarding: boolean;
		}>;
		reviewAuditDetails?: DocumentReviewAuditDetail[];
	}>;
	warningEmployees?: Array<{
		id: string;
		employeeId: string;
		name: string;
		department: string;
		section?: string;
		position: string;
		compliancePercent?: number;
		overallStatus?: "warning";
		documentCount: number;
		documentTypeCodes: string[];
		documentTypeNames: string[];
		compliantDocDetails?: Array<{
			id: string;
			code: string;
			name: string;
			priorityLevel: "high" | "medium" | "low";
			isMandated: boolean;
			requiredForPayroll: boolean;
			requiredForOnboarding: boolean;
		}>;
		recommendedMissingDocs?: string[];
		recommendedMissingDocCodes?: string[];
		recommendedMissingDocDetails?: Array<{
			id: string;
			code: string;
			name: string;
			priorityLevel: "high" | "medium" | "low";
			isMandated: boolean;
			requiredForPayroll: boolean;
			requiredForOnboarding: boolean;
		}>;
		reviewAuditDetails?: DocumentReviewAuditDetail[];
	}>;
	pendingApprovalEmployees?: Array<{
		id: string;
		employeeId: string;
		name: string;
		department: string;
		section?: string;
		position: string;
		compliancePercent?: number;
		overallStatus?: "non_compliant";
		pendingApprovalDocs: string[];
		pendingApprovalDocCodes: string[];
		pendingApprovalDocDetails?: Array<{
			id: string;
			code: string;
			name: string;
			priorityLevel: "high" | "medium" | "low";
			isMandated: boolean;
			requiredForPayroll: boolean;
			requiredForOnboarding: boolean;
		}>;
		reviewAuditDetails?: DocumentReviewAuditDetail[];
	}>;
	nonCompliantEmployees: Array<{
		id: string;
		employeeId: string;
		name: string;
		department: string;
		section?: string;
		position: string;
		compliancePercent?: number;
		overallStatus?: "non_compliant";
		missingDocs: string[];
		missingDocCodes: string[];
		missingMandatedDocs?: string[];
		missingRecommendedDocs?: string[];
		missingDocDetails?: Array<{
			id: string;
			code: string;
			name: string;
			priorityLevel: "high" | "medium" | "low";
			isMandated: boolean;
			requiredForPayroll: boolean;
			requiredForOnboarding: boolean;
		}>;
		pendingApprovalDocs?: string[];
		pendingApprovalDocCodes?: string[];
		pendingApprovalDocDetails?: Array<{
			id: string;
			code: string;
			name: string;
			priorityLevel: "high" | "medium" | "low";
			isMandated: boolean;
			requiredForPayroll: boolean;
			requiredForOnboarding: boolean;
		}>;
		reviewAuditDetails?: DocumentReviewAuditDetail[];
	}>;
}

export interface DocumentComplianceResponse {
	filter?: {
		organizationId?: string;
		departmentId?: string;
		sectionId?: string;
	};
	metrics: {
		documentComplianceMetrics: DocumentComplianceMetrics;
	};
}

export interface PayrollBlockersResponse {
	filter?: Record<string, any>;
	metrics: {
		payrollBlockers: {
			missingInfo: any[];
			timesheetNotSubmitted: any[];
			pendingApproval: any[];
			correctionNeeded?: any[];
			readyForPayroll?: any[];
			semiMonthlyEmployeesTotal: number;
			blockedEmployeesTotal?: number;
			includedEmployeesTotal?: number;
			total: number;
		};
	};
}

export interface PayrollReadinessScope {
	departmentId?: string | null;
	sectionId?: string | null;
}

export interface PayrollRunSummaryResponse {
	filter?: Record<string, any>;
	metrics: {
		payrollRunSummary: {
			payrollScopeEmployeesTotal: number;
			previewEligibleEmployeesTotal: number;
			includedEmployeesTotal: number;
			missingInfoEmployeesTotal: number;
			approvedMissingInfoEmployeesTotal?: number;
			missingInfoAndNotSubmittedEmployeesTotal?: number;
			approvedExcludedEmployeesTotal?: number;
			notReadyEmployeesTotal?: number;
			timesheetNotSubmittedEmployeesTotal: number;
			pendingApprovalEmployeesTotal: number;
			correctionNeededEmployeesTotal?: number;
			blockedEmployeesTotal: number;
			total: number;
		};
	};
}

export interface PayrollSummaryPeriod {
	id: string;
	name: string;
	code?: string | null;
	startDate: string | Date;
	endDate: string | Date;
	payDate: string | Date;
	status: string;
	processedEmployees: number;
	pendingEmployees: number;
	paidEmployees: number;
	unpaidEmployees: number;
	totalBenefits: number;
	totalAllowances: number;
	totalBonuses: number;
	totalGrossPay: number;
	totalTaxAmount: number;
	totalSSS: number;
	totalPhilHealth: number;
	totalPagibig: number;
	totalGovernmentContributions: number;
	totalLoans: number;
	totalPenaltyDeductions: number;
	totalDeductions: number;
	totalNetPay: number;
}

export interface PayrollSummaryEmployee {
	id: string;
	rowNo?: number;
	payrollPeriodId: string;
	payrollPeriodName: string;
	employeeId: string;
	employeeCode: string;
	employeeName: string;
	department: string;
	division: string;
	position: string;
	payFrequency: string;
	status: "PAID" | "UNPAID";
	monthlySalary: number;
	dailySalary: number;
	numberOfDays: number;
	basicPay: number;
	absentDeduction: number;
	lateDeduction: number;
	earlyOutDeduction: number;
	lateUndertimeAmount: number;
	overtimePay: number;
	regularOtHours: number;
	holidayPay: number;
	nightDiffPay: number;
	restDayHours: number;
	restDayHoursPay: number;
	restDayOtHours: number;
	restDayOtPay: number;
	specialHolidayOtHours: number;
	specialHolidayOtPay: number;
	sunSpecialHolidayOtExcessHours: number;
	sunSpecialHolidayOtExcessPay: number;
	specialHolidayRestDayOtHours: number;
	specialHolidayRestDayOtPay: number;
	specialRestDayExcessHours: number;
	specialRestDayExcessOtPay: number;
	legalHolidayOtHours: number;
	legalHolidayOtPay: number;
	legalHolidayExcessPay: number;
	legalHolidayRestDayPay: number;
	legalHolidayExcess1Pay: number;
	legalHolidayRestDayExcessPay: number;
	leavePay: number;
	christmasGift: number;
	specialBonus: number;
	mandatoryContributionAdjustment: number;
	guaranteedBonus: number;
	hysMealAllowance: number;
	obAllowance: number;
	otherAdjustment: number;
	overtimeMealAllowance: number;
	sportsfestOt: number;
	fringeBenefit: number;
	annualIncentive: number;
	technicalSkillsAllowance: number;
	aclVlConversionTaxable: number;
	adjustmentOverusedLeave: number;
	thirteenthMonthAdjustment: number;
	productionIncentives: number;
	otherCompensation: number;
	adjustmentBasic: number;
	adjustmentOtNd: number;
	adjustmentNonTax: number;
	excessDeduction: number;
	deMinimisAllowance: number;
	allowances: number;
	bonuses: number;
	benefitsTotal: number;
	otherEarn: number;
	grossPay: number;
	taxAmount: number;
	sssContribution: number;
	philHealthContribution: number;
	pagibigContribution: number;
	christmasGiftKid: number;
	birthdayGiftKid: number;
	birthdayGiftEmployee: number;
	fringeBenefitTax: number;
	sssEmergencyLoan: number;
	philHealthContributionAdjustment: number;
	excessInternetUsage: number;
	taxPayable: number;
	adjustmentBasicDeduction: number;
	excessMlBenefits: number;
	uniformDeduction: number;
	sssLoanRestructuringProgram: number;
	phicOnePercentDifferential: number;
	modifiedHdmf2: number;
	communityTaxCertificate: number;
	hdmfContributionAdjustment: number;
	personalCallsUsage: number;
	healthInsurance: number;
	shuttleService: number;
	negativeAdjustment: number;
	bnpiEmergencyLoan: number;
	bnpiSalaryLoan: number;
	rcbcLoan: number;
	hdmfCalamityLoan: number;
	hdmfSalaryLoan: number;
	sssCalamityLoan: number;
	sssSalaryLoan: number;
	governmentContributions: number;
	loanDeductions: number;
	penaltyDeductions: number;
	otherDeductions: number;
	totalDeductions: number;
	netPay: number;
	adjustmentHolidayPay: number;
	communityTaxCert: number;
	oneKChristmasGift: number;
	taxRefund: number;
	thirteenthMonthPay: number;
	aclVlConversion: number;
	otMealAllowance: number;
	perfectAttendance: number;
	mealAllowance: number;
	lineLeaderAllowance: number;
	totalReceivable: number;
	receivableAdd: number;
	workDays: number;
}

export interface PayrollSummaryResponse {
	filter?: {
		dateFrom?: string;
		dateTo?: string;
		payrollPeriodId?: string;
		departmentId?: string;
		reportToId?: string;
	};
	metrics: {
		payrollSummary: {
			payrollPeriodId?: string | null;
			periodsCovered: number;
			totalEmployees: number;
			processedEmployees: number;
			pendingEmployees: number;
			totalBenefits: number;
			totalAllowances: number;
			totalBonuses: number;
			totalGrossPay: number;
			totalTaxAmount: number;
			totalSSS: number;
			totalPhilHealth: number;
			totalPagibig: number;
			totalGovernmentContributions: number;
			totalLoans: number;
			totalPenaltyDeductions: number;
			totalDeductions: number;
			totalNetPay: number;
			payrollPeriods: PayrollSummaryPeriod[];
			payrolls: PayrollSummaryEmployee[];
		};
	};
}

export interface PayrollPeriodCard {
	id: string;
	name: string;
	code?: string | null;
	startDate: string | Date;
	endDate: string | Date;
	payDate: string | Date;
	status: string;
	payFrequency?: string | null;
	periodNumber?: number | null;
	period: {
		month: string; // e.g. "JAN"
		day: number; // end date day (15, 31, 28...)
		dayOfWeek: string;
		year: number;
	};
}

export interface PayrollPeriodsForYearResponse {
	filter?: Record<string, any>;
	metrics: {
		payrollPeriodsForYear: PayrollPeriodCard[];
	};
}

export interface TimesheetStatistics {
	total: number;
	submitted: number;
	approved: number;
	actionRequired: number;
	draft: number;
	approvalRate: number;
	submissionRate: number;
	actionRate: number;
	draftRate: number;
}

export interface TimesheetStatisticsResponse {
	filter?: Record<string, any>;
	metrics: {
		timesheetStatistics: TimesheetStatistics;
	};
}

// Attendance Metrics Detailed (with records)
export interface AttendanceRecord {
	id: string;
	employeeRefId?: string;
	employeeId: string;
	employeeName: string;
	departmentId?: string | null;
	departmentName?: string | null;
	workforceSource?: "DIRECT" | "AGENCY";
	agencyId?: string | null;
	agencyName?: string | null;
	agencyCode?: string | null;
	date: string;
	timeIn: string | null;
	timeBreak: string | null;
	timeOut: string | null;
	isOvernight?: boolean | null;
	timeOutNextDay?: boolean | null;
	status: string;
	behaviorFlags?: string[];
	computationMeta?: {
		rawLateMinutes?: number | null;
		gracePeriodMinutes?: number | null;
		withinGrace?: boolean | null;
		evaluatedFromSchedule?: boolean | null;
		[key: string]: unknown;
	} | null;
	scheduleSnapshot?: {
		isOff?: boolean | null;
		isRestDay?: boolean | null;
		startTime?: string | null;
		endTime?: string | null;
		graceLateMinutes?: number | null;
		gracePeriodMinutes?: number | null;
		timeSlots?: Array<{ type?: string | null; startTime?: string | null; endTime?: string | null }>;
		[key: string]: unknown;
	} | null;
	hoursWorked: string | null;
	regularHours: string | null;
	overtimeHours: string | null;
	undertimeHours: string | null;
	lateHours: string | null;
	earlyOutHours: string | null;
	breakMinutes: number | null;
	isManualEntry: boolean;
	notes: string | null;
	timesheetId: string | null;
	isVirtual: boolean; // Flag for virtual records (ABSENT/REST_DAY)
	primaryMarker?: "HOLIDAY" | "LEAVE" | "REST_DAY" | "ABSENT" | "HOURS";
	leaveType?: string | null;
	leaveEntries?: Array<{
		requestId?: string;
		leaveType: string;
		label: string;
		durationUnit?: string;
		halfDaySession?: string;
		startDate?: string;
		endDate?: string;
	}>;
	holidayEntries?: Array<{
		calendarItemId: string;
		title: string;
		startDate: string;
		endDate: string;
		tags?: string[];
	}>;
	isPeriodRollup?: boolean;
	periodTotals?: {
		scheduled: number;
		present: number;
		late: number;
		undertime: number;
		absent: number;
		onTime?: number;
	};
}

export interface AttendanceMetricsDetailed {
	totalPresent: number;
	totalAbsent: number;
	totalNotClockedIn?: number;
	totalLate: number;
	totalOnLeave: number;
	totalRestDay: number;
	totalHoliday: number;
	totalHolidayDateCount?: number;
	totalWorkedOnRestDay?: number;
	totalWorkedOnHoliday?: number;
	totalClockedIn: number;
	totalClockedInObligated?: number;
	totalObligatedToWork?: number;
	totalOnTime: number;
	totalScheduledWorkDays: number;
	totalCalendarDays: number;
	totalCompanyEventDays: number;
	totalEmployeesMissingSchedule?: number;
	totalClockedOut?: number;
	totalEarlyOut?: number;
	totalOvertime?: number;
	approvedOvertimeCount?: number;
	unapprovedOvertimeCount?: number;
	leaveTypeBreakdown?: Array<{
		leaveType: string;
		total: number;
	}>;
	shiftTypeBreakdown?: Array<{
		shiftType: string;
		label: string;
		total: number;
	}>;
	avgAttendanceRate: number;
	utilizationRate: number;
	totalMinutesWorked: number;
	totalOvertimeMinutes: number;
	totalUndertimeMinutes: number;
	totalLateMinutes: number;
}

export interface AttendanceMetricsDetailedResponse {
	filter?: {
		dateFrom: string;
		dateTo: string;
		status?: string;
	};
	metrics: {
		attendanceObligationDetailed: {
			metrics: AttendanceMetricsDetailed;
			records: AttendanceRecord[];
			dateRange: {
				from: string;
				to: string;
			};
			totalRecords: number;
			departmentBreakdown?: Array<{
				departmentId: string | null;
				departmentName: string;
				totalRecords: number;
				employeeCount: number;
				scheduled: number;
				present: number;
				late: number;
				undertime?: number;
				absent: number;
				leave: number;
				missing: number;
				overtimeHours: number;
			}>;
			departmentPreviewRows?: Array<{
				departmentId: string | null;
				departmentName: string;
				rows: AttendanceRecord[];
			}>;
		};
	};
}

export interface AttendanceTimesheetLineSummaryResponse {
	filter?: {
		dateFrom: string;
		dateTo: string;
		status?: string;
	};
	metrics: {
		attendanceObligationSummary: AttendanceMetricsDetailed;
	};
}

export interface AttendanceDailyTrendDepartmentTotal {
	departmentId: string | null;
	departmentName: string;
	total: number;
}

export interface AttendanceDailyTrendDayBucket {
	businessDate: string;
	total: number;
	departmentBreakdown: AttendanceDailyTrendDepartmentTotal[];
}

export interface AttendanceDailyTrendResult {
	startDate: string | Date;
	endDate: string | Date;
	totalDays: number;
	totalRecords: number;
	departments: AttendanceDailyTrendDepartmentTotal[];
	series: AttendanceDailyTrendDayBucket[];
}

export interface AttendanceDailyTrendByDepartmentResponse {
	filter?: {
		dateFrom?: string;
		dateTo?: string;
		search?: string;
		status?: string;
		departmentId?: string;
		reportToId?: string;
		employeeId?: string;
		shiftType?: string;
	};
	metrics: {
		attendanceDailyTrendByDepartment: AttendanceDailyTrendResult;
	};
}

export interface AttendanceTodayOpsSummary {
	businessDate: string;
	scheduledTodayCount: number;
	notYetInCount: number;
	clockedInTodayCount: number;
	clockedOutTodayCount?: number;
	onTimeTodayCount: number;
	lateRightNowCount: number;
	earlyOutTodayCount?: number;
	overtimeTodayCount?: number;
	approvedOvertimeCount?: number;
	unapprovedOvertimeCount?: number;
	approvedLeaveTodayCount: number;
	workDayTodayCount?: number;
	leaveTypeBreakdown?: Array<{
		leaveType: string;
		total: number;
	}>;
	shiftTypeBreakdown?: Array<{
		shiftType: string;
		label: string;
		total: number;
	}>;
	holidayTodayCount: number;
	restDayTodayCount: number;
	companyEventDayCount: number;
}

export interface AttendanceTodayOpsSummaryResponse {
	filter?: {
		dateFrom: string;
		dateTo: string;
	};
	metrics: {
		attendanceObligationTodayOpsSummary: AttendanceTodayOpsSummary;
	};
}

// Perfect Attendance Metrics
export interface PerfectAttendanceEmployee {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	daysPresent: number;
	totalWorkDays: number;
	isPerfect: boolean;
}

export interface PerfectAttendanceMetrics {
	totalEmployees: number;
	perfectAttendanceCount: number;
	perfectAttendanceRate: number;
	averageAttendanceRate: number;
	employees: PerfectAttendanceEmployee[];
}

export interface PerfectAttendanceResponse {
	filter?: {
		dateFrom?: string;
		dateTo?: string;
		departmentId?: string;
	};
	metrics: {
		perfectAttendanceMetrics: PerfectAttendanceMetrics;
	};
}

// Tardiness Metrics
export interface TardinessEmployee {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	tardinessCount: number;
	totalLateMinutes: number;
	avgLateMinutes: number;
	maxLateMinutes: number;
}

export interface TardinessMetrics {
	totalTardinessInstances: number;
	totalUndertimeHours: number;
	employees: TardinessEmployee[];
}

export interface TardinessMetricsResponse {
	filter?: {
		dateFrom: string;
		dateTo: string;
		departmentId?: string;
	};
	metrics: {
		tardinessMetrics: TardinessMetrics;
	};
}

// Overtime Metrics
export interface OvertimeMetricsEmployee {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	workforceSource: "DIRECT" | "AGENCY";
	overtimeCount: number;
	totalOvertimeHours: number;
}

export interface OvertimeLaborSplit {
	totalOvertimeHours: number;
	employeesWithOvertime: number;
}

export interface OvertimeMetrics {
	totalOvertimeHours: number;
	employeesWithOvertime: number;
	employees: OvertimeMetricsEmployee[];
	split: {
		direct: OvertimeLaborSplit;
		agency: OvertimeLaborSplit;
	};
}

export interface OvertimeMetricsResponse {
	filter?: {
		dateFrom: string;
		dateTo: string;
		departmentId?: string;
	};
	metrics: {
		overtimeMetrics: OvertimeMetrics;
	};
}

// TIN Library
export interface TinLibraryRow {
	employeeId: string;
	empCode: string;
	name: string;
	department: string;
	tin: string | null;
	status: "OK" | "MISSING" | "DUPLICATE";
}

export interface TinLibraryResponse {
	filter?: Record<string, unknown>;
	metrics: {
		tinLibrary: {
			summary: { total: number; withTin: number; missing: number; duplicateEmployees: number };
			rows: TinLibraryRow[];
		};
	};
}
// Labor Cost Analysis
export interface LaborCostRow {
	departmentId: string;
	department: string;
	headcount: number;
	directHeadcount: number;
	agencyHeadcount: number;
	basicPay: number;
	overtimePay: number;
	allowances: number;
	grossPay: number;
	totalDeductions: number;
	netPay: number;
	directGrossPay: number;
	agencyGrossPay: number;
}

export interface LaborCostAnalysis {
	periodCount: number;
	headcount: number;
	basicPay: number;
	overtimePay: number;
	allowances: number;
	grossPay: number;
	totalDeductions: number;
	netPay: number;
	split: {
		direct: { headcount: number; grossPay: number };
		agency: { headcount: number; grossPay: number };
	};
	rows: LaborCostRow[];
}

export interface LaborCostAnalysisResponse {
	filter?: {
		dateFrom: string;
		dateTo: string;
		departmentId?: string;
	};
	metrics: {
		laborCostAnalysis: LaborCostAnalysis;
	};
}

export interface Bir1601CEmployeeBreakdown {
	employeeId: string;
	employeeCode: string;
	employeeName: string;
	department: string;
	isMwe: boolean;
	basicNet: number;
	overtimeHolidayHazard: number;
	deMinimis: number;
	contributions: number;
	withholdingTax: number;
	totalCompensation: number;
}

export interface Bir1601CMetricsResponse {
	filter?: {
		month: number;
		year: number;
		departmentId?: string;
		reportToId?: string;
		employeeId?: string;
	};
	metrics: {
		bir1601CMetrics: {
			period: {
				month: number;
				year: number;
				dateFrom: string;
				dateTo: string;
				payDateBasis: true;
				mweMonthlyThreshold: number;
				totalPayrollPeriods: number;
				totalPayrollRows: number;
			};
			fields: {
				"14": number;
				"15": number;
				"16": number;
				"18": number;
				"19": number;
				"21": number;
				"22": number;
				"25": number;
			};
			breakdown: {
				employees: Bir1601CEmployeeBreakdown[];
				totals: {
					mweEmployees: number;
					nonMweEmployees: number;
					allowancesMappedAsDeMinimis: number;
				};
			};
		};
	};
}

export interface WorkforceEmployeeRow {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	position: string;
	employer?: string;
	status?: string;
}

export interface NoWorkReportResult {
	date: string;
	totalEmployeesConsidered: number;
	noWorkCount: number;
	employees: WorkforceEmployeeRow[];
}

export interface NoWorkReportResponse {
	filter?: {
		dateFrom?: string;
		dateTo?: string;
		departmentId?: string;
		reportToId?: string;
	};
	metrics: {
		noWorkReport: NoWorkReportResult;
	};
}

export interface DailyActiveManpowerResult {
	date: string;
	totalEmployeesConsidered: number;
	activeManpowerCount: number;
	employees: WorkforceEmployeeRow[];
}

export interface DailyActiveManpowerResponse {
	filter?: {
		dateFrom?: string;
		dateTo?: string;
		departmentId?: string;
		reportToId?: string;
	};
	metrics: {
		dailyActiveManpower: DailyActiveManpowerResult;
	};
}

export interface AgencyAttendanceSummaryItem {
	agency: string;
	totalAgencyEmployees: number;
	scheduledWorkDays: number;
	activeManpower: number;
	noWorkReportCount: number;
	leaveCount: number;
	attendanceRate: number;
}

export interface AgencyAttendanceSummaryResult {
	startDate: string;
	endDate: string;
	totalAgencies: number;
	items: AgencyAttendanceSummaryItem[];
}

export interface AgencyAttendanceSummaryResponse {
	filter?: {
		dateFrom?: string;
		dateTo?: string;
		departmentId?: string;
		reportToId?: string;
	};
	metrics: {
		agencyAttendanceSummary: AgencyAttendanceSummaryResult;
	};
}

export interface DirectIndirectDepartmentSummaryItem {
	department: string;
	directEmployees: number;
	indirectEmployees: number;
	directScheduledWorkDays: number;
	indirectScheduledWorkDays: number;
	directActiveManpower: number;
	indirectActiveManpower: number;
	directNoWorkCount: number;
	indirectNoWorkCount: number;
	directAttendanceRate: number;
	indirectAttendanceRate: number;
}

export interface DirectIndirectLaborSummaryResult {
	startDate: string;
	endDate: string;
	totalDirectEmployees: number;
	totalIndirectEmployees: number;
	directScheduledWorkDays: number;
	indirectScheduledWorkDays: number;
	directActiveManpower: number;
	indirectActiveManpower: number;
	directNoWorkCount: number;
	indirectNoWorkCount: number;
	items: DirectIndirectDepartmentSummaryItem[];
}

export interface DirectIndirectLaborSummaryResponse {
	filter?: {
		dateFrom?: string;
		dateTo?: string;
		departmentId?: string;
		reportToId?: string;
		laborType?: "ALL" | "DIRECT" | "INDIRECT" | string;
	};
	metrics: {
		directIndirectLaborSummary: DirectIndirectLaborSummaryResult;
	};
}

export interface LeaveBalanceDetail {
	leaveType: string;
	totalEntitled: number;
	used: number;
	pending: number;
	available: number;
	carriedOver: number;
	periodStart?: string | null;
	periodEnd?: string | null;
}

export interface LeaveBalanceEmployee {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	leaveBalances: LeaveBalanceDetail[];
}

export interface LeaveTypeSummary {
	leaveType: string;
	employeeCount: number;
	avgEntitled: number;
	avgUsed: number;
	avgAvailable: number;
	utilizationRate: number;
}

export interface LeaveBalanceMetrics {
	totalEmployees: number;
	leaveTypeSummary: LeaveTypeSummary[];
	employees: LeaveBalanceEmployee[];
}

export interface LeaveBalanceMetricsResponse {
	filter?: {
		departmentId?: string;
		sectionId?: string;
		reportToId?: string;
		employeeId?: string;
		leaveType?: string;
		periodFrom?: string;
		periodTo?: string;
	};
	metrics: {
		leaveBalanceMetrics: LeaveBalanceMetrics;
	};
}

export type TurnoverAttritionGroupBy = "day" | "week" | "month" | "year";

export interface TurnoverAttritionBucket {
	periodStart: string;
	periodEnd: string;
	label: string;
	openingHeadcount: number;
	closingHeadcount: number;
	averageHeadcount: number;
	totalSeparations: number;
	voluntarySeparations: number;
	involuntarySeparations: number;
	turnoverRate: number;
	attritionRate: number;
}

export interface TurnoverAttritionReport {
	summary: TurnoverAttritionBucket;
	buckets: TurnoverAttritionBucket[];
}

export interface TurnoverAttritionReportResponse {
	filter?: {
		dateFrom?: string;
		dateTo?: string;
		groupBy?: TurnoverAttritionGroupBy;
	};
	metrics: {
		turnoverAttritionReport: TurnoverAttritionReport;
	};
}

class MetricsService extends APIService {
	async getActionMetrics(employeeId?: string): Promise<ActionMetricsResponse> {
		try {
			const query = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : "";
			const response = await hrisApiClient.get<any>(`/api/metrics/actions${query}`);
			const payload = (response.data as any)?.data || response.data;
			if (!payload) {
				throw new Error("Failed to fetch action metrics");
			}
			return payload as ActionMetricsResponse;
		} catch (error: any) {
			console.error("Error fetching action metrics:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching action metrics",
			);
		}
	}

	private extractMetricsData(response: any): any {
		// The API usually returns { status, message, data } where data contains { filter, metrics }
		let metricsData = response?.data;

		// If response.data doesn't exist, check if the response itself has the structure
		if (!metricsData && response && typeof response === "object") {
			// Sometimes callers already pass the "data" object
			if ("metrics" in response) {
				metricsData = response;
			} else if ("data" in response) {
				metricsData = response.data;
			}
		}

		return metricsData;
	}

	/**
	 * Get attendance metrics for an employee
	 * @param employeeId Employee ID
	 * @param dateFrom Start date (YYYY-MM-DD)
	 * @param dateTo End date (YYYY-MM-DD)
	 * @returns Promise<MetricsResponse> - Metrics response with attendance data
	 */
	async getAttendanceMetrics(
		employeeId: string,
		dateFrom?: string,
		dateTo?: string,
	): Promise<MetricsResponse> {
		try {
			const payload: MetricsRequest = {
				model: "Attendance",
				data: ["todayAttendance"],
				filter: {
					employeeId,
					...(dateFrom && { dateFrom }),
					...(dateTo && { dateTo }),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);

			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch attendance metrics");
			}

			return metricsData as MetricsResponse;
		} catch (error: any) {
			console.error("Error fetching attendance metrics:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching attendance metrics",
			);
		}
	}

	/**
	 * Get attendance status summary (PRESENT, LEAVE, ABSENT counts)
	 * @param dateFrom Start date (YYYY-MM-DD)
	 * @param dateTo End date (YYYY-MM-DD)
	 * @returns Promise<StatusSummaryResponse> - Status summary metrics
	 */
	async getBirthdaysSummary(organizationId: string): Promise<any> {
		try {
			const payload = {
				model: "CalendarItem",
				data: ["birthdaysSummary"],
				filter: {
					organizationId,
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);

			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch birthdays summary");
			}

			return metricsData;
		} catch (error: any) {
			console.error("Error fetching birthdays summary:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching birthdays summary",
			);
		}
	}

	async getStatusSummary(dateFrom: string, dateTo: string): Promise<StatusSummaryResponse> {
		try {
			const payload = {
				model: "Attendance",
				data: ["statusSummary"],
				filter: {
					dateFrom,
					dateTo,
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);

			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch status summary");
			}

			return metricsData as StatusSummaryResponse;
		} catch (error: any) {
			console.error("Error fetching status summary:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching status summary",
			);
		}
	}

	/**
	 * Get employee status summary for manager's direct reports
	 * @param reportToId Manager's employee ID
	 * @param dateFrom Start date (YYYY-MM-DD)
	 * @param dateTo End date (YYYY-MM-DD)
	 * @returns Promise<EmployeeStatusSummaryResponse> - Per-employee attendance summary
	 */
	async getEmployeeStatusSummary(
		reportToId: string,
		dateFrom: string,
		dateTo: string,
	): Promise<EmployeeStatusSummaryResponse> {
		try {
			const payload = {
				model: "Attendance",
				data: ["employeeStatusSummary"],
				filter: {
					reportToId,
					dateFrom,
					dateTo,
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);

			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch employee status summary");
			}

			return metricsData as EmployeeStatusSummaryResponse;
		} catch (error: any) {
			console.error("Error fetching employee status summary:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching employee status summary",
			);
		}
	}

	/**
	 * Get employee document compliance metrics
	 * @param organizationId Optional organization ID filter
	 * @param departmentId Optional department ID filter
	 * @param sectionId Optional section ID filter
	 * @param reportToId Optional manager filter
	 * @returns Promise<DocumentComplianceResponse> - Document compliance metrics
	 */
	async getDocumentComplianceMetrics(
		organizationId?: string,
		departmentId?: string,
		sectionId?: string,
		reportToId?: string,
	): Promise<DocumentComplianceResponse> {
		try {
			const payload = {
				model: "Employee",
				data: ["documentComplianceMetrics"],
				filter: {
					...(organizationId && { organizationId }),
					...(departmentId && { departmentId }),
					...(sectionId && { sectionId }),
					...(reportToId && { reportToId }),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);

			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch document compliance metrics");
			}

			return metricsData as DocumentComplianceResponse;
		} catch (error: any) {
			console.error("Error fetching document compliance metrics:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching document compliance metrics",
			);
		}
	}

	async getTurnoverAttritionReport(
		dateFrom: string,
		dateTo: string,
		groupBy: TurnoverAttritionGroupBy,
		filters?: {
			departmentId?: string;
			sectionId?: string;
			positionId?: string;
			levelId?: string;
		},
	): Promise<TurnoverAttritionReportResponse> {
		try {
			const payload = {
				model: "Employee",
				data: ["turnoverAttritionReport"],
				filter: {
					dateFrom,
					dateTo,
					groupBy,
					...(filters?.departmentId ? { departmentId: filters.departmentId } : {}),
					...(filters?.sectionId ? { sectionId: filters.sectionId } : {}),
					...(filters?.positionId ? { positionId: filters.positionId } : {}),
					...(filters?.levelId ? { levelId: filters.levelId } : {}),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch turnover and attrition report");
			}

			return metricsData as TurnoverAttritionReportResponse;
		} catch (error: any) {
			console.error("Error fetching turnover and attrition report:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching turnover and attrition report",
			);
		}
	}

	/**
	 * Get comprehensive attendance metrics with full records (including virtual ABSENT/REST_DAY)
	 * @param dateFrom Start date (YYYY-MM-DD)
	 * @param dateTo End date (YYYY-MM-DD)
	 * @param limit Maximum number of records to return (default 100)
	 * @returns Promise<AttendanceMetricsDetailedResponse> - Detailed metrics with records
	 */
	async getAttendanceMetricsDetailed(
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
	): Promise<AttendanceMetricsDetailedResponse> {
		try {
			const payload = {
				model: "Attendance",
				data: ["attendanceObligationDetailed"],
				filter: {
					...(dateFrom && { dateFrom }),
					...(dateTo && { dateTo }),
					limit,
					page,
					...(search && { search }),
					...(status && { status }),
					...(departmentId && { departmentId }),
					...(sectionId && { sectionId }),
					...(positionId && { positionId }),
					...(levelId && { levelId }),
					...(reportToId && { reportToId }),
					...(employeeId && { employeeId }),
					...(shiftType && { shiftType }),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);

			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch attendance metrics detailed");
			}

			return metricsData as AttendanceMetricsDetailedResponse;
		} catch (error: any) {
			console.error("Error fetching attendance metrics detailed:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching attendance metrics detailed",
			);
		}
	}

	async getAttendanceTodayOpsSummary(
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
	): Promise<AttendanceTodayOpsSummaryResponse> {
		try {
			const payload = {
				model: "Attendance",
				data: ["attendanceObligationTodayOpsSummary"],
				filter: {
					...(dateFrom && { dateFrom }),
					...(dateTo && { dateTo }),
					...(search && { search }),
					...(departmentId && { departmentId }),
					...(sectionId && { sectionId }),
					...(positionId && { positionId }),
					...(levelId && { levelId }),
					...(reportToId && { reportToId }),
					...(employeeId && { employeeId }),
					...(shiftType && { shiftType }),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch attendance today ops summary");
			}

			return metricsData as AttendanceTodayOpsSummaryResponse;
		} catch (error: any) {
			console.error("Error fetching attendance today ops summary:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching attendance today ops summary",
			);
		}
	}

	async getAttendanceTimesheetLineSummary(
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
	): Promise<AttendanceTimesheetLineSummaryResponse> {
		try {
			const payload = {
				model: "Attendance",
				data: ["attendanceObligationSummary"],
				filter: {
					...(dateFrom && { dateFrom }),
					...(dateTo && { dateTo }),
					...(search && { search }),
					...(status && { status }),
					...(departmentId && { departmentId }),
					...(sectionId && { sectionId }),
					...(positionId && { positionId }),
					...(levelId && { levelId }),
					...(reportToId && { reportToId }),
					...(employeeId && { employeeId }),
					...(shiftType && { shiftType }),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch attendance timesheet line summary");
			}

			return metricsData as AttendanceTimesheetLineSummaryResponse;
		} catch (error: any) {
			console.error("Error fetching attendance timesheet line summary:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching attendance timesheet line summary",
			);
		}
	}

	async getAttendanceObligationSummary(
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
	): Promise<AttendanceTimesheetLineSummaryResponse> {
		return this.getAttendanceTimesheetLineSummary(
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
		);
	}

	async getAttendanceDailyTrendByDepartment(
		dateFrom?: string,
		dateTo?: string,
		search?: string,
		status?: string,
		departmentId?: string,
		reportToId?: string,
		employeeId?: string,
		shiftType?: string,
	): Promise<AttendanceDailyTrendByDepartmentResponse> {
		try {
			const payload = {
				model: "Attendance",
				data: ["attendanceDailyTrendByDepartment"],
				filter: {
					...(dateFrom && { dateFrom }),
					...(dateTo && { dateTo }),
					...(search && { search }),
					...(status && { status }),
					...(departmentId && { departmentId }),
					...(reportToId && { reportToId }),
					...(employeeId && { employeeId }),
					...(shiftType && { shiftType }),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch attendance daily trend by department");
			}

			return metricsData as AttendanceDailyTrendByDepartmentResponse;
		} catch (error: any) {
			console.error("Error fetching attendance daily trend by department:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching attendance daily trend by department",
			);
		}
	}

	/**
	 * Get payroll blockers for a specific payroll period
	 */
	async getPayrollBlockers(
		payrollPeriodId: string,
		limit?: number,
		scope?: PayrollReadinessScope,
	): Promise<PayrollBlockersResponse> {
		try {
			const departmentId =
				scope?.departmentId && scope.departmentId !== "all" ? scope.departmentId : undefined;
			const sectionId =
				scope?.sectionId && scope.sectionId !== "all" ? scope.sectionId : undefined;
			const payload = {
				model: "PayrollPeriod",
				data: ["payrollBlockers"],
				filter: {
					payrollPeriodId,
					...(limit ? { limit } : {}),
					...(departmentId ? { departmentId } : {}),
					...(sectionId ? { sectionId } : {}),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch payroll blockers");
			}

			return metricsData as PayrollBlockersResponse;
		} catch (error: any) {
			console.error("Error fetching payroll blockers:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching payroll blockers",
			);
		}
	}

	/**
	 * Get lightweight payroll run summary counts for a specific payroll period
	 */
	async getPayrollRunSummary(
		payrollPeriodId: string,
		scope?: PayrollReadinessScope,
	): Promise<PayrollRunSummaryResponse> {
		try {
			const departmentId =
				scope?.departmentId && scope.departmentId !== "all" ? scope.departmentId : undefined;
			const sectionId =
				scope?.sectionId && scope.sectionId !== "all" ? scope.sectionId : undefined;
			const payload = {
				model: "PayrollPeriod",
				data: ["payrollRunSummary"],
				filter: {
					payrollPeriodId,
					...(departmentId ? { departmentId } : {}),
					...(sectionId ? { sectionId } : {}),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch payroll run summary");
			}

			return metricsData as PayrollRunSummaryResponse;
		} catch (error: any) {
			console.error("Error fetching payroll run summary:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching payroll run summary",
			);
		}
	}

	/**
	 * Get payroll summary by payroll period or pay-date range
	 */
	async getPayrollSummary(
		dateFrom?: string,
		dateTo?: string,
		payrollPeriodId?: string,
		departmentId?: string,
		reportToId?: string,
	): Promise<PayrollSummaryResponse> {
		try {
			const payload = {
				model: "PayrollPeriod",
				data: ["payrollSummary"],
				filter: {
					...(dateFrom && { dateFrom }),
					...(dateTo && { dateTo }),
					...(payrollPeriodId && { payrollPeriodId }),
					...(departmentId && { departmentId }),
					...(reportToId && { reportToId }),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch payroll summary");
			}

			return metricsData as PayrollSummaryResponse;
		} catch (error: any) {
			console.error("Error fetching payroll summary:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching payroll summary",
			);
		}
	}

	/**
	 * Get timesheet statistics
	 */
	async getTimesheetStatistics(
		filter: Record<string, any> = {},
	): Promise<TimesheetStatisticsResponse> {
		try {
			const payload = {
				model: "Timesheet",
				data: ["timesheetStatistics"],
				filter,
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch timesheet statistics");
			}

			return metricsData as TimesheetStatisticsResponse;
		} catch (error: any) {
			console.error("Error fetching timesheet statistics:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching timesheet statistics",
			);
		}
	}

	/**
	 * Get perfect attendance metrics for a date range
	 * @param dateFrom Start date (YYYY-MM-DD) - optional, defaults to last 365 days
	 * @param dateTo End date (YYYY-MM-DD) - optional, defaults to today
	 * @param departmentId Optional department filter
	 * @returns Promise<PerfectAttendanceResponse> - Perfect attendance metrics
	 */
	async getPerfectAttendanceMetrics(
		dateFrom?: string,
		dateTo?: string,
		departmentId?: string,
	): Promise<PerfectAttendanceResponse> {
		try {
			const payload = {
				model: "Attendance",
				data: ["perfectAttendanceMetrics"],
				filter: {
					...(dateFrom && { dateFrom }),
					...(dateTo && { dateTo }),
					...(departmentId && { departmentId }),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch perfect attendance metrics");
			}

			return metricsData as PerfectAttendanceResponse;
		} catch (error: any) {
			console.error("Error fetching perfect attendance metrics:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching perfect attendance metrics",
			);
		}
	}

	/**
	 * Get tardiness and undertime metrics for a date range
	 * @param dateFrom Start date (YYYY-MM-DD)
	 * @param dateTo End date (YYYY-MM-DD)
	 * @param departmentId Optional department filter
	 * @returns Promise<TardinessMetricsResponse> - Tardiness metrics
	 */
	async getTardinessMetrics(
		dateFrom?: string,
		dateTo?: string,
		departmentId?: string,
	): Promise<TardinessMetricsResponse> {
		try {
			console.log("[FRONTEND] getTardinessMetrics called with:", {
				dateFrom,
				dateTo,
				departmentId,
			});

			const payload = {
				model: "Attendance",
				data: ["tardinessMetrics"],
				filter: {
					dateFrom,
					dateTo,
					...(departmentId && { departmentId }),
				},
			};

			console.log("[FRONTEND] Sending payload:", JSON.stringify(payload, null, 2));

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch tardiness metrics");
			}

			return metricsData as TardinessMetricsResponse;
		} catch (error: any) {
			console.error("Error fetching tardiness metrics:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching tardiness metrics",
			);
		}
	}

	/**
	 * Get overtime metrics for a date range
	 * @param dateFrom Start date (YYYY-MM-DD)
	 * @param dateTo End date (YYYY-MM-DD)
	 * @param departmentId Optional department filter
	 * @returns Promise<OvertimeMetricsResponse> - Overtime metrics
	 */
	async getLaborCostAnalysis(
		dateFrom?: string,
		dateTo?: string,
		departmentId?: string,
		workforceSource?: string,
		payrollPeriodId?: string,
	): Promise<LaborCostAnalysisResponse> {
		try {
			const payload = {
				model: "PayrollPeriod",
				data: ["laborCostAnalysis"],
				filter: {
					dateFrom,
					dateTo,
					...(departmentId && { departmentId }),
					...(workforceSource && workforceSource !== "all" && { workforceSource }),
					...(payrollPeriodId && { payrollPeriodId }),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch labor cost analysis");
			}

			return metricsData as LaborCostAnalysisResponse;
		} catch (error: any) {
			console.error("Error fetching labor cost analysis:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching labor cost analysis",
			);
		}
	}
	async getOvertimeMetrics(
		dateFrom?: string,
		dateTo?: string,
		departmentId?: string,
		workforceSource?: string,
	): Promise<OvertimeMetricsResponse> {
		try {
			const payload = {
				model: "Attendance",
				data: ["overtimeMetrics"],
				filter: {
					dateFrom,
					dateTo,
					...(departmentId && { departmentId }),
					...(workforceSource &&
						workforceSource !== "all" && { workforceSource }),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch overtime metrics");
			}

			return metricsData as OvertimeMetricsResponse;
		} catch (error: any) {
			console.error("Error fetching overtime metrics:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching overtime metrics",
			);
		}
	}

	/**
	 * Get BIR 1601-C metrics by pay-date month
	 */
	async getBir1601CMetrics(filter: {
		month: number;
		year: number;
		departmentId?: string;
		reportToId?: string;
		employeeId?: string;
	}): Promise<Bir1601CMetricsResponse> {
		try {
			const payload = {
				model: "PayrollPeriod",
				data: ["bir1601CMetrics"],
				filter,
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch BIR 1601-C metrics");
			}

			return metricsData as Bir1601CMetricsResponse;
		} catch (error: any) {
			console.error("Error fetching BIR 1601-C metrics:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching BIR 1601-C metrics",
			);
		}
	}

	/**
	 * Get no-work report metrics for a single date
	 * @param dateFrom Target date (YYYY-MM-DD)
	 * @param departmentId Optional department filter
	 * @returns Promise<NoWorkReportResponse> - No-work report metrics
	 */
	async getNoWorkReport(
		dateFrom?: string,
		departmentId?: string,
		reportToId?: string,
	): Promise<NoWorkReportResponse> {
		try {
			const payload = {
				model: "Attendance",
				data: ["noWorkReport"],
				filter: {
					...(dateFrom && { dateFrom, dateTo: dateFrom }),
					...(departmentId && { departmentId }),
					...(reportToId && { reportToId }),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch no-work report");
			}

			return metricsData as NoWorkReportResponse;
		} catch (error: any) {
			console.error("Error fetching no-work report:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching no-work report",
			);
		}
	}

	/**
	 * Get daily active manpower metrics for a single date
	 * @param dateFrom Target date (YYYY-MM-DD)
	 * @param departmentId Optional department filter
	 * @returns Promise<DailyActiveManpowerResponse> - Daily manpower metrics
	 */
	async getDailyActiveManpower(
		dateFrom?: string,
		departmentId?: string,
		reportToId?: string,
	): Promise<DailyActiveManpowerResponse> {
		try {
			const payload = {
				model: "Attendance",
				data: ["dailyActiveManpower"],
				filter: {
					...(dateFrom && { dateFrom, dateTo: dateFrom }),
					...(departmentId && { departmentId }),
					...(reportToId && { reportToId }),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch daily active manpower");
			}

			return metricsData as DailyActiveManpowerResponse;
		} catch (error: any) {
			console.error("Error fetching daily active manpower:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching daily active manpower",
			);
		}
	}

	/**
	 * Get agency attendance summary metrics for a date range
	 * @param dateFrom Start date (YYYY-MM-DD)
	 * @param dateTo End date (YYYY-MM-DD)
	 * @param departmentId Optional department filter
	 * @returns Promise<AgencyAttendanceSummaryResponse> - Agency attendance summary metrics
	 */
	async getAgencyAttendanceSummary(
		dateFrom?: string,
		dateTo?: string,
		departmentId?: string,
		reportToId?: string,
	): Promise<AgencyAttendanceSummaryResponse> {
		try {
			const payload = {
				model: "Attendance",
				data: ["agencyAttendanceSummary"],
				filter: {
					...(dateFrom && { dateFrom }),
					...(dateTo && { dateTo }),
					...(departmentId && { departmentId }),
					...(reportToId && { reportToId }),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch agency attendance summary");
			}

			return metricsData as AgencyAttendanceSummaryResponse;
		} catch (error: any) {
			console.error("Error fetching agency attendance summary:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching agency attendance summary",
			);
		}
	}

	/**
	 * Get direct vs indirect labor summary metrics for a date range
	 */
	async getDirectIndirectLaborSummary(
		dateFrom?: string,
		dateTo?: string,
		departmentId?: string,
		reportToId?: string,
		laborType?: "ALL" | "DIRECT" | "INDIRECT",
	): Promise<DirectIndirectLaborSummaryResponse> {
		try {
			const payload = {
				model: "Attendance",
				data: ["directIndirectLaborSummary"],
				filter: {
					...(dateFrom && { dateFrom }),
					...(dateTo && { dateTo }),
					...(departmentId && { departmentId }),
					...(reportToId && { reportToId }),
					...(laborType && laborType !== "ALL" && { laborType }),
				},
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch direct vs indirect labor summary");
			}

			return metricsData as DirectIndirectLaborSummaryResponse;
		} catch (error: any) {
			console.error("Error fetching direct vs indirect labor summary:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching direct vs indirect labor summary",
			);
		}
	}

	/**
	 * Get leave balance metrics
	 */
	async getTinLibrary(): Promise<TinLibraryResponse> {
		try {
			const payload = {
				model: "Employee",
				data: ["tinLibrary"],
				filter: {},
			};
			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);
			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch TIN library");
			}
			return metricsData as TinLibraryResponse;
		} catch (error: any) {
			throw new Error(error.data?.errors?.[0]?.message || error.message || "Error fetching TIN library");
		}
	}
	async getLeaveBalanceMetrics(
		filter: {
			departmentId?: string;
			sectionId?: string;
			positionId?: string;
			levelId?: string;
			reportToId?: string;
			employeeId?: string;
			leaveType?: string;
			periodFrom?: string;
			periodTo?: string;
		} = {},
	): Promise<LeaveBalanceMetricsResponse> {
		try {
			const payload = {
				model: "Employee",
				data: ["leaveBalanceMetrics"],
				filter,
			};

			const response = await hrisApiClient.post<any>("/api/metrics", payload);
			const metricsData = this.extractMetricsData(response);

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch leave balance metrics");
			}

			return metricsData as LeaveBalanceMetricsResponse;
		} catch (error: any) {
			console.error("Error fetching leave balance metrics:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching leave balance metrics",
			);
		}
	}

	/**
	 * Generic method to fetch metrics
	 * @param payload MetricsRequest payload
	 * @returns Promise<T> - Generic metrics response
	 */
	async getMetrics<T>(payload: MetricsRequest): Promise<T> {
		try {
			const response = await hrisApiClient.post<any>("/api/metrics", payload);

			let metricsData = response?.data;

			if (!metricsData && response && typeof response === "object") {
				if ("metrics" in response && "filter" in response) {
					metricsData = response;
				} else if ("data" in response) {
					metricsData = response.data;
				}
			}

			if (!metricsData || !metricsData.metrics) {
				throw new Error("Failed to fetch metrics");
			}

			return metricsData as T;
		} catch (error: any) {
			console.error("Error fetching metrics:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching metrics",
			);
		}
	}
}

// Export singleton instance
const metricsService = new MetricsService();
export default metricsService;
