import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../../middleware/verifyToken";
import { Prisma, PrismaClient } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { MetricsRequestSchema } from "../../zod/metrics.zod";
import { logActivity } from "../../utils/activityLogger";
import { config } from "../../config/constant";
import { findShiftForDay } from "../../helper/schedule.helper";
import { getEffectiveEmploymentStartDate } from "../../helper/attendance.helper";
import {
	calculateAttendanceMetricsDetailed,
	calculateAttendanceTimesheetLineSummary,
	calculateAttendanceTodayOpsSummary,
} from "../../helper/attendance-metrics-detailed.helper";
import {
	calculateAttendanceObligationDetailed,
	calculateAttendanceDailyTrendByDepartment,
	calculateAttendanceObligationSummary,
	calculateAttendanceObligationTodayOpsSummary,
} from "../../helper/attendance-obligation-metrics.helper";
import { calculatePerfectAttendanceMetrics } from "../../helper/perfect-attendance-metrics.helper";
import { calculateTardinessMetrics } from "../../helper/tardiness-metrics.helper";
import { calculateManhoursMetrics } from "../../helper/manhours-metrics.helper";
import { calculateOvertimeMetrics } from "../../helper/overtime-metrics.helper";
import { calculateLaborCostAnalysis } from "../../helper/labor-cost-analysis.helper";
import { calculateLeaveBalanceMetrics } from "../../helper/leave-balance-metrics.helper";
import { calculateTurnoverAttritionReport } from "../../helper/turnover-attrition-metrics.helper";
import {
	getAttendanceSummaryReport,
	getCustomAttendanceSummary,
} from "../../helper/attendance-summary.helper";
import { getEligibilityCandidates } from "../../helper/eligibility.helper";
import {
	calculateAgencyAttendanceSummary,
	calculateDailyActiveManpower,
	calculateDirectIndirectLaborSummary,
	calculateNoWorkReport,
} from "../../helper/workforce-metrics.helper";
import { calculateBir1601CMetrics } from "../../helper/bir-1601c-metrics.helper";
import { resolveEmployeeActiveSchedule } from "../../helper/employee-schedule.helper";
import {
	documentMatchesType,
	evaluateEmployeeDocumentCompleteness,
	getDocumentReviewSnapshot,
	getDocumentReviewStatus,
	resolveDocumentTypeRequirementMeta,
} from "../../helper/employee-document-priority.helper";
import { computeEmployeeDocumentCompliance } from "../../helper/employee-document-compliance.helper";
import { getUserActionMetrics } from "../../helper/action-metrics.helper";

const logger = getLogger();
const metricsLogger = logger.child({ module: "metrics" });
// Define available metrics types for different models
const AVAILABLE_METRICS = {
	Request: [
		"totalRequests",
		"statusSummary",
		"typeSummary",
		"requestStatistics",
		"allRequests",
		"requestsByEmployee",
		"approvalRate",
		"averageProcessingTime",
	],
	Attendance: [
		"todayAttendance",
		"statusSummary",
		"employeeStatusSummary",
		"statusSummaryByEmployee",
		"attendanceMetricsDetailed", // Returns metrics + persisted timesheet-line records
		"attendanceObligationDetailed", // Returns metrics + records from live attendance obligations
		"attendanceObligationSummary", // Summary-only metrics from live attendance obligations
		"attendanceObligationTodayOpsSummary", // Lightweight today cards from live attendance obligations
		"attendanceTimesheetLineSummary", // Summary-only counts from persisted timesheet lines
		"attendanceTodayOpsSummary", // Lightweight today dashboard cards from timesheet lines
		"attendanceDailyTrendByDepartment", // Day-by-department attendance trend chart data
		"perfectAttendanceMetrics", // Perfect attendance (zero absences + zero tardiness)
		"tardinessMetrics", // Tardiness, undertime, and early out metrics
		"manhoursReport", // M2.4 manhour reference — hours worked per person
		"overtimeMetrics", // Overtime metrics
		"noWorkReport", // Employees scheduled but with no attendance record
		"dailyActiveManpower", // Employees with attendance activity for the day
		"agencyAttendanceSummary", // Attendance grouped by employee employer/agency
		"directIndirectLaborSummary", // Workforce split between direct and indirect labor
		"attendanceSummaryReport", // Attendance summary for today, this week, and this month
	],
	CalendarItem: ["birthdaysSummary"],
	Employee: [
		"documentComplianceMetrics",
		"eligibilityCandidates",
		"leaveBalanceMetrics",
		"turnoverAttritionReport",
		"tinLibrary",
		"pregnantEmployees",
	],
	PayrollPeriod: [
		"payrollPeriodByCode",
		"payrollRunSummary",
		"payrollBlockers",
		"payrollSummary",
		"laborCostAnalysis",
		"bir1601CMetrics",
	],
	Timesheet: ["timesheetStatistics"],
};
export const controller = (prisma: PrismaClient) => {
	const getMetrics = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			// Validate request body
			const validation = MetricsRequestSchema.safeParse(req.body);
			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error.format());
				metricsLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}
			const { model, data, filter } = validation.data;
			// Validate model is supported
			if (!AVAILABLE_METRICS[model as keyof typeof AVAILABLE_METRICS]) {
				const errorResponse = buildErrorResponse(
					`Model '${model}' is not supported for metrics. Available models: ${Object.keys(AVAILABLE_METRICS).join(", ")}`,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}
			// Validate that requested metrics are available for the specified model
			const availableMetrics = AVAILABLE_METRICS[model as keyof typeof AVAILABLE_METRICS];
			const invalidMetrics = data.filter((metric) => !availableMetrics.includes(metric));
			if (invalidMetrics.length > 0) {
				const errorResponse = buildErrorResponse(
					`Invalid metrics for model '${model}': ${invalidMetrics.join(", ")}. Available metrics: ${availableMetrics.join(", ")}`,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}
			metricsLogger.info(`Generating metrics for model: ${model}, data: ${data.join(", ")}`);
			// Build filter (date + other fields) if provided
			const whereFilter = buildFilter(filter, model);
			// Generate metrics based on model and requested data. Keep an in-request cache so
			// compatible detailed + summary requests do not repeat the same attendance helper work.
			const metricPromises = new Map<string, Promise<any>>();
			const getMetricResult = (metric: string) => {
				if (!metricPromises.has(metric)) {
					metricPromises.set(
						metric,
						generateMetric(prisma, model, metric, whereFilter, req, filter),
					);
				}
				return metricPromises.get(metric)!;
			};
			const results = Object.fromEntries(
				await Promise.all(
					data.map(async (metric) => {
						try {
							if (
								model === "Attendance" &&
								metric === "attendanceObligationSummary" &&
								data.includes("attendanceObligationDetailed")
							) {
								const detailed = await getMetricResult("attendanceObligationDetailed");
								return [metric, detailed?.metrics || detailed];
							}

							if (
								model === "Attendance" &&
								metric === "attendanceTimesheetLineSummary" &&
								data.includes("attendanceMetricsDetailed")
							) {
								const detailed = await getMetricResult("attendanceMetricsDetailed");
								return [metric, detailed?.metrics || detailed];
							}

							return [metric, await getMetricResult(metric)];
						} catch (error) {
							metricsLogger.error(
								`Error generating metric '${metric}' for model '${model}':`,
								error,
							);
							return [metric, { error: `Failed to generate ${metric}` }];
						}
					}),
				),
			);
			// Log activity and audit
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "GET_METRICS",
				description: `Generated metrics for ${model}: ${data.join(", ")}`,
				page: {
					url: req.originalUrl,
					title: "Metrics Dashboard",
				},
			});
			const successResponse = buildSuccessResponse(
				"Metrics generated successfully",
				{
					filter,
					metrics: results,
				},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error: any) {
			metricsLogger.error(`Metrics generation failed: ${error.message}`);
			const errorResponse = buildErrorResponse("Failed to generate metrics", 500, [
				{ field: "system", message: error.message },
			]);
			res.status(500).json(errorResponse);
		}
	};

	const getActionMetrics = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const metrics = await getUserActionMetrics({
				prisma,
				authReq: req,
				targetEmployeeId:
					typeof req.query.employeeId === "string" ? req.query.employeeId : undefined,
			});

			res.status(200).json(
				buildSuccessResponse("Action metrics retrieved successfully", metrics, 200),
			);
		} catch (error: any) {
			metricsLogger.error(`Action metrics generation failed: ${error.message}`);
			const statusCode = String(error?.message || "").includes("Employee context is required")
				? 400
				: 500;
			const errorResponse = buildErrorResponse(
				statusCode === 400
					? "Employee context is required for action metrics"
					: "Failed to generate action metrics",
				statusCode,
			);
			res.status(statusCode).json(errorResponse);
		}
	};

	return {
		getMetrics,
		getActionMetrics,
	};
};

function getDateKeyInTimeZone(date: Date, timeZone: string): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);

	const year = parts.find((part) => part.type === "year")?.value;
	const month = parts.find((part) => part.type === "month")?.value;
	const day = parts.find((part) => part.type === "day")?.value;

	if (!year || !month || !day) {
		return "";
	}

	return `${year}-${month}-${day}`;
}

function parseDateInputToUTC(value: string): Date | null {
	const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (dateOnlyMatch) {
		const [, year, month, day] = dateOnlyMatch;
		return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0));
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	return parsed;
}

function toUTCStartOfDay(value: string): Date | null {
	const date = parseDateInputToUTC(value);
	if (!date) {
		return null;
	}

	date.setUTCHours(0, 0, 0, 0);
	return date;
}

function toUTCEndOfDay(value: string): Date | null {
	const date = parseDateInputToUTC(value);
	if (!date) {
		return null;
	}

	date.setUTCHours(23, 59, 59, 999);
	return date;
}

// Helper function to build comprehensive filter (dates + other fields)
function buildFilter(
	filter?: {
		dateFrom?: string;
		dateTo?: string;
		[key: string]: string | number | boolean | null | undefined;
	},
	model?: string,
) {
	const whereFilter: any = {};
	const normalizedFilter = filter ? { ...filter } : {};
	// Default attendance range to today so absence math still works without explicit dates
	if (model === "Attendance" && !normalizedFilter.dateFrom && !normalizedFilter.dateTo) {
		const todayStr = getDateKeyInTimeZone(new Date(), "Asia/Manila");
		normalizedFilter.dateFrom = todayStr;
		normalizedFilter.dateTo = todayStr;
	}
	if (Object.keys(normalizedFilter).length === 0) {
		return whereFilter;
	}
	// Always exclude deleted records
	whereFilter.isDeleted = false;
	// Handle date filters - use appropriate field based on model
	const dateField =
		model === "Attendance" ? "date" : model === "PayrollPeriod" ? "payDate" : "createdAt";
	if (normalizedFilter.dateFrom || normalizedFilter.dateTo) {
		const startDate = normalizedFilter.dateFrom
			? toUTCStartOfDay(String(normalizedFilter.dateFrom))
			: null;
		const endDate = normalizedFilter.dateTo
			? toUTCEndOfDay(String(normalizedFilter.dateTo))
			: null;
		whereFilter[dateField] = {};
		if (startDate) {
			whereFilter[dateField].gte = startDate;
		}
		if (endDate) {
			whereFilter[dateField].lte = endDate;
		}
	}
	// Handle other filter fields (exclude dateFrom and dateTo)
	const reservedFields = [
		"dateFrom",
		"dateTo",
		"groupBy",
		"periodFrom",
		"periodTo",
		"leaveType",
		"payrollPeriodEndBefore",
		"payrollPeriodEndOnOrBefore",
		"payrollPeriodStartOnOrAfter",
	];
	for (const [key, value] of Object.entries(normalizedFilter)) {
		if (reservedFields.includes(key) || value === null || value === undefined) {
			continue;
		}
		// Normalize field name (e.g., "Status" -> "status", "employeeId" -> "employeeId")
		const normalizedKey = normalizeFieldName(key);
		const requestAwareKey =
			model === "Request" && normalizedKey === "status"
				? "currentWorkflowStateKey"
				: normalizedKey;
		// Handle enum values - try to normalize them
		const normalizedValue = normalizeEnumValue(requestAwareKey, value, model);
		whereFilter[requestAwareKey] = normalizedValue;
	}
	// Preserve non-where helper filters used by specific metric handlers.
	if (normalizedFilter.periodFrom) whereFilter.periodFrom = normalizedFilter.periodFrom;
	if (normalizedFilter.periodTo) whereFilter.periodTo = normalizedFilter.periodTo;
	if (normalizedFilter.leaveType) whereFilter.leaveType = normalizedFilter.leaveType;
	if (normalizedFilter.payrollPeriodEndBefore) {
		whereFilter.payrollPeriodEndBefore = normalizedFilter.payrollPeriodEndBefore;
	}
	if (normalizedFilter.payrollPeriodEndOnOrBefore) {
		whereFilter.payrollPeriodEndOnOrBefore = normalizedFilter.payrollPeriodEndOnOrBefore;
	}
	if (normalizedFilter.payrollPeriodStartOnOrAfter) {
		whereFilter.payrollPeriodStartOnOrAfter =
			normalizedFilter.payrollPeriodStartOnOrAfter;
	}
	return whereFilter;
}
// Helper to normalize field names (convert camelCase or PascalCase to camelCase)
function normalizeFieldName(fieldName: string): string {
	if (!fieldName) return fieldName;
	// Convert first letter to lowercase (Status -> status)
	return fieldName.charAt(0).toLowerCase() + fieldName.slice(1);
}
// Helper to normalize enum values (e.g., "pending" -> "PENDING", "approved" -> "APPROVED")
function normalizeEnumValue(
	fieldName: string,
	value: string | number | boolean,
	model?: string,
): any {
	if (typeof value !== "string") {
		return value;
	}
	// Common enum field mappings for Request and Attendance models
	const enumFieldMappings: Record<string, Record<string, string>> = {
		status: {
			pending: "FOR_APPROVAL",
			open: "OPEN",
			for_approval: "FOR_APPROVAL",
			"for approval": "FOR_APPROVAL",
			processing: "IN_PROCESS",
			in_process: "IN_PROCESS",
			"in process": "IN_PROCESS",
			approved: "APPROVED",
			rejected: "REJECTED",
			cancelled: "CANCELLED",
			canceled: "CANCELLED",
			completed: "COMPLETED",
			present: "PRESENT",
			leave: "LEAVE",
		},
		currentWorkflowStateKey: {
			open: "OPEN",
			pending: "FOR_APPROVAL",
			for_approval: "FOR_APPROVAL",
			"for approval": "FOR_APPROVAL",
			processing: "IN_PROCESS",
			in_process: "IN_PROCESS",
			"in process": "IN_PROCESS",
			approved: "APPROVED",
			rejected: "REJECTED",
			cancelled: "CANCELLED",
			canceled: "CANCELLED",
			completed: "COMPLETED",
		},
		type: {
			leave: "LEAVE",
			overtime: "OVERTIME",
			time_adjustment: "TIME_ADJUSTMENT",
			"time-adjustment": "TIME_ADJUSTMENT",
			timeAdjustment: "TIME_ADJUSTMENT",
			expense_reimbursement: "EXPENSE_REIMBURSEMENT",
			"expense-reimbursement": "EXPENSE_REIMBURSEMENT",
			expenseReimbursement: "EXPENSE_REIMBURSEMENT",
			document_request: "DOCUMENT_REQUEST",
			"document-request": "DOCUMENT_REQUEST",
			documentRequest: "DOCUMENT_REQUEST",
			other: "OTHER",
		},
	};
	const normalized = normalizeFieldName(fieldName);
	const mapping = enumFieldMappings[normalized] || enumFieldMappings[fieldName];
	if (mapping && mapping[value.toLowerCase()]) {
		return mapping[value.toLowerCase()];
	}
	// If no mapping found, check if value is already uppercase (enum format)
	if (value === value.toUpperCase() && value.includes("_")) {
		return value;
	}
	// Return as-is if no normalization needed
	return value;
}
// Main metric generation function
async function generateMetric(
	prisma: PrismaClient,
	model: string,
	metric: string,
	whereFilter: any,
	req?: AuthRequest,
	rawFilter?: {
		dateFrom?: string;
		dateTo?: string;
		[key: string]: string | number | boolean | null | undefined;
	},
) {
	switch (model) {
		case "Request":
			return generateRequestMetric(prisma, metric, whereFilter);
		case "Attendance":
			return generateAttendanceMetric(prisma, metric, whereFilter);
		case "CalendarItem":
			return generateCalendarItemMetric(prisma, metric, whereFilter);
		case "Employee":
			return generateEmployeeMetric(prisma, metric, whereFilter, req, rawFilter);
		case "PayrollPeriod":
			return generatePayrollPeriodMetric(prisma, metric, whereFilter, req);
		case "Timesheet":
			return generateTimesheetMetric(prisma, metric, whereFilter);
		default:
			throw new Error(`Unsupported model: ${model}`);
	}
}
// Helper function to get employee name from employee relation
function getEmployeeName(employee: any): string {
	if (!employee) {
		return "UNKNOWN";
	}
	// Try to get name from person's personalInfo (firstName + lastName)
	if (employee.person?.personalInfo?.firstName && employee.person?.personalInfo?.lastName) {
		const firstName = employee.person.personalInfo.firstName.trim();
		const lastName = employee.person.personalInfo.lastName.trim();
		return `${firstName} ${lastName}`;
	}
	// Fallback to employeeId
	return employee.employeeId || employee.id || "UNKNOWN";
}

function formatReviewActorLabel(params: {
	actorEmployeeId?: string | null;
	employeeId?: string | null;
	employeeName?: string | null;
	actorNameMap?: Map<string, string>;
}) {
	const actorEmployeeId = String(params.actorEmployeeId || "").trim();
	if (!actorEmployeeId) return null;
	if (actorEmployeeId === String(params.employeeId || "").trim()) {
		return params.employeeName || actorEmployeeId;
	}
	return params.actorNameMap?.get(actorEmployeeId) || actorEmployeeId;
}

type DocumentReviewAuditDetail = {
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
};

function buildEmployeeDocumentReviewAuditDetails(params: {
	details: Array<{ id: string; code: string; name: string }>;
	documents: any[];
	documentTypes: any[];
	employeeContext: {
		departmentId?: string | null;
		positionId?: string | null;
		employmentType?: string | null;
		role?: string | null;
	};
	employeeId: string;
	employeeName: string;
	actorNameMap: Map<string, string>;
}): DocumentReviewAuditDetail[] {
	return params.details.reduce<DocumentReviewAuditDetail[]>((accumulator, detail) => {
		const documentType = params.documentTypes.find((type) => type.id === detail.id);
		if (!documentType) return accumulator;

		const matchingDocuments = params.documents
			.filter((document) => documentMatchesType(document, documentType))
			.filter(
				(document) =>
					evaluateEmployeeDocumentCompleteness({
						document,
						documentType,
						employeeContext: params.employeeContext,
					}).isComplete,
			)
			.sort(
				(left, right) =>
					new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
			);

		const latestDocument = matchingDocuments[0];
		if (!latestDocument) return accumulator;

		const reviewSnapshot = (getDocumentReviewSnapshot(latestDocument) || {}) as Record<
			string,
			any
		>;
		const reviewStatus = getDocumentReviewStatus(latestDocument) || null;

		accumulator.push({
			id: detail.id,
			code: detail.code,
			name: detail.name,
			status: reviewStatus,
			documentId: String(latestDocument.id || "").trim() || null,
			documentNumber: String(latestDocument.number || "").trim() || null,
			issueDate: latestDocument.issueDate
				? new Date(latestDocument.issueDate).toISOString()
				: null,
			expiryDate: latestDocument.expiryDate
				? new Date(latestDocument.expiryDate).toISOString()
				: null,
			fileUrl: String(latestDocument.fileUrl || "").trim() || null,
			ext: String(latestDocument.ext || "").trim() || null,
			submittedAt: String(reviewSnapshot.submittedAt || "").trim() || null,
			submittedByEmployeeId:
				String(reviewSnapshot.submittedByEmployeeId || "").trim() || null,
			submittedByLabel: formatReviewActorLabel({
				actorEmployeeId: String(reviewSnapshot.submittedByEmployeeId || "").trim() || null,
				employeeId: params.employeeId,
				employeeName: params.employeeName,
				actorNameMap: params.actorNameMap,
			}),
			approvedAt: String(reviewSnapshot.approvedAt || "").trim() || null,
			approvedByEmployeeId: String(reviewSnapshot.approvedByEmployeeId || "").trim() || null,
			approvedByLabel: formatReviewActorLabel({
				actorEmployeeId: String(reviewSnapshot.approvedByEmployeeId || "").trim() || null,
				employeeId: params.employeeId,
				employeeName: params.employeeName,
				actorNameMap: params.actorNameMap,
			}),
			rejectedAt: String(reviewSnapshot.rejectedAt || "").trim() || null,
			rejectedByEmployeeId: String(reviewSnapshot.rejectedByEmployeeId || "").trim() || null,
			rejectedByLabel: formatReviewActorLabel({
				actorEmployeeId: String(reviewSnapshot.rejectedByEmployeeId || "").trim() || null,
				employeeId: params.employeeId,
				employeeName: params.employeeName,
				actorNameMap: params.actorNameMap,
			}),
			rejectionReason: String(reviewSnapshot.rejectionReason || "").trim() || null,
			source: String(reviewSnapshot.source || "").trim() || null,
		});

		return accumulator;
	}, []);
}
// Request metrics
async function generateRequestMetric(prisma: PrismaClient, metric: string, whereFilter: any) {
	const whereClause = Object.keys(whereFilter).length > 0 ? whereFilter : { isDeleted: false };
	switch (metric) {
		case "totalRequests":
			return await prisma.request.count({ where: whereClause });
		case "statusSummary":
			const statusCounts = await prisma.request.groupBy({
				by: ["currentWorkflowStateKey"],
				where: whereClause,
				_count: {
					_all: true,
				},
			});
			return statusCounts.reduce(
				(acc, item) => {
					acc[item.currentWorkflowStateKey || "UNKNOWN"] = item._count?._all ?? 0;
					return acc;
				},
				{} as Record<string, number>,
			);
		case "typeSummary":
			const typeCounts = await prisma.request.groupBy({
				by: ["type"],
				where: whereClause,
				_count: {
					id: true,
				},
			});
			return typeCounts.reduce(
				(acc, item) => {
					acc[item.type] = item._count.id ?? 0;
					return acc;
				},
				{} as Record<string, number>,
			);
		case "requestStatistics":
			return await generateRequestStatistics(prisma, whereFilter);
		case "allRequests": {
			const allRequests = await prisma.request.findMany({
				where: whereClause,
				include: {
					requester: {
						include: {
							person: true,
							position: true,
							department: {
								select: {
									id: true,
									name: true,
									code: true,
								},
							},
						},
					},
				},
				take: 100,
				orderBy: { createdAt: "desc" },
			});
			return {
				count: allRequests.length,
				data: allRequests.map((r) => ({
					id: r.id,
					employeeName: getEmployeeName(r.requester),
					employeeId: r.requesterId,
					type: r.type,
					currentWorkflowStateKey: r.currentWorkflowStateKey,
					startDate: r.startDate,
					endDate: r.endDate,
					description: r.description,
					attachments: r.attachments,
					notes: r.notes,
					createdAt: r.createdAt,
					updatedAt: r.updatedAt,
				})),
			};
		}
		case "requestsByEmployee":
			const employeeCounts = await prisma.request.groupBy({
				by: ["requesterId"],
				where: whereClause,
				_count: {
					id: true,
				},
			});
			// Fetch employee details for each requesterId
			const employeeDetails = await Promise.all(
				employeeCounts.map(async (item) => {
					const employee = await prisma.employee.findUnique({
						where: { id: item.requesterId },
						include: {
							person: true,
							position: true,
							department: {
								select: {
									id: true,
									name: true,
									code: true,
								},
							},
						},
					});
					return {
						employeeId: item.requesterId,
						employeeName: getEmployeeName(employee),
						count: item._count.id ?? 0,
					};
				}),
			);
			return employeeDetails;
		case "approvalRate":
			const totalRequests = await prisma.request.count({ where: whereClause });
			const approvedCount = await prisma.request.count({
				where: {
					...whereClause,
					currentWorkflowStateKey: { in: ["APPROVED", "COMPLETED"] },
				},
			});
			return {
				totalRequests,
				approvedRequests: approvedCount,
				approvalRate: totalRequests > 0 ? (approvedCount / totalRequests) * 100 : 0,
			};
		case "averageProcessingTime": {
			const processedSteps = await prisma.workflowStepExecution.findMany({
				where: {
					isDeleted: false,
					completedAt: { not: null },
					status: { in: ["APPROVED", "REJECTED", "COMPLETED"] },
					request: { is: whereClause },
				},
				select: {
					completedAt: true,
					request: {
						select: {
							createdAt: true,
						},
					},
				},
			});
			if (processedSteps.length === 0) {
				return {
					averageProcessingTimeHours: 0,
					averageProcessingTimeDays: 0,
					totalProcessed: 0,
				};
			}
			const totalProcessingTime = processedSteps.reduce((sum, step) => {
				if (step.completedAt && step.request?.createdAt) {
					const diffMs = step.completedAt.getTime() - step.request.createdAt.getTime();
					return sum + diffMs;
				}
				return sum;
			}, 0);
			const averageMs = totalProcessingTime / processedSteps.length;
			const averageHours = averageMs / (1000 * 60 * 60);
			const averageDays = averageHours / 24;
			return {
				averageProcessingTimeHours: Math.round(averageHours * 100) / 100,
				averageProcessingTimeDays: Math.round(averageDays * 100) / 100,
				totalProcessed: processedSteps.length,
			};
		}
		default:
			throw new Error(`Unknown request metric: ${metric}`);
	}
}
// Generate request statistics
async function generateRequestStatistics(prisma: PrismaClient, whereFilter: any) {
	const whereClause = Object.keys(whereFilter).length > 0 ? whereFilter : { isDeleted: false };
	// Get total requests
	const totalRequests = await prisma.request.count();
	// Get new requests in the filtered date range
	const newRequests = await prisma.request.count({ where: whereClause });
	// Calculate trend and percentage
	const { trend, percentage } = calculateTrendAndPercentage(totalRequests, newRequests);
	return {
		total: totalRequests,
		new: newRequests,
		trend: trend,
		percentage: percentage,
	};
}
// Helper function to calculate trend and percentage based on growth rate
function calculateTrendAndPercentage(
	currentTotal: number,
	newCount: number,
): { trend: "up" | "down" | "stable"; percentage: number } {
	if (newCount === 0) return { trend: "stable", percentage: 0 };
	const previousTotal = currentTotal - newCount;
	if (previousTotal === 0) return { trend: "up", percentage: 100 };
	const growthRate = ((currentTotal - previousTotal) / previousTotal) * 100;
	let trend: "up" | "down" | "stable";
	if (growthRate > 5) trend = "up";
	else if (growthRate < -5) trend = "down";
	else trend = "stable";
	return { trend, percentage: Math.round(growthRate * 100) / 100 };
}
// Attendance metrics
async function generateAttendanceMetric(prisma: PrismaClient, metric: string, whereFilter: any) {
	const whereClause = Object.keys(whereFilter).length > 0 ? whereFilter : { isDeleted: false };
	switch (metric) {
		case "statusSummary": {
			// Build date window
			const dateFrom = whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null;
			const dateTo = whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null;

			if (!dateFrom || !dateTo) {
				return { PRESENT: 0, LEAVE: 0, ABSENT: 0 };
			}

			// Resolve organizationId (prefer explicit filter)
			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;

			if (!organizationId) {
				return { PRESENT: 0, LEAVE: 0, ABSENT: 0 };
			}

			// Normalize bounds to full days
			const startDate = new Date(dateFrom);
			startDate.setUTCHours(0, 0, 0, 0);
			const endDate = new Date(dateTo);
			endDate.setUTCHours(23, 59, 59, 999);

			// Use the attendance summary helper for accurate aggregation
			const summary = await getCustomAttendanceSummary(
				prisma,
				organizationId,
				startDate,
				endDate,
				whereFilter.departmentId,
			);

			// Return the full summary with all fields
			return {
				totalEmployees: summary.totalEmployees,
				PRESENT: summary.present,
				LEAVE: summary.onLeave,
				ABSENT: summary.absent,
				LATE: summary.late,
				UNDERTIME: summary.undertime,
				OVERTIME: summary.overtime,
				NOT_YET_IN: summary.notYetIn,
				attendanceRate: summary.attendanceRate,
			};
		}
		case "employeeStatusSummary": {
			// Get the specific date from filter
			const dateFrom = whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null;
			const dateTo = whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null;
			if (!dateFrom || !dateTo) {
				return [];
			}
			// Get reportToId from filter
			const reportToId = whereFilter.reportToId;
			if (!reportToId) {
				return [];
			}
			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;
			if (!organizationId) {
				return [];
			}
			// Use the same date for start and end (single day)
			const targetDate = new Date(dateFrom);
			targetDate.setUTCHours(0, 0, 0, 0);
			const dayEnd = new Date(targetDate);
			dayEnd.setUTCHours(23, 59, 59, 999);
			const dayOfWeek = targetDate.getDay();
			// Get employees reporting to this manager
			// NOTE: Do NOT filter by employmentHireDate here - we check it in the loop below
			const employees = await prisma.employee.findMany({
				where: {
					organizationId,
					isDeleted: false,
					reportToId: reportToId,
				},
				select: {
					id: true,
					employeeId: true,
					employmentHireDate: true,
					employmentStartDate: true,
					employmentTerminationDate: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
					attendances: {
						where: {
							isDeleted: false,
							date: { gte: targetDate, lte: dayEnd },
						},
						select: { status: true, date: true },
					},
				},
			});
			// Get status for each employee on this specific day
			const results = employees
				.map((emp) => {
					// Skip if not employed on this day
					const effectiveStartDate = getEffectiveEmploymentStartDate(emp);
					if (effectiveStartDate && effectiveStartDate > dayEnd) return null;
					if (emp.employmentTerminationDate && emp.employmentTerminationDate < targetDate)
						return null;
					// Determine schedule to use
					const activeSchedule = resolveEmployeeActiveSchedule(emp);
					// If no schedule, skip this employee
					if (!activeSchedule) return null;
					const shift = findShiftForDay(activeSchedule as any, dayOfWeek);
					// If it's a rest day, skip this employee (they shouldn't be counted)
					if (!shift || shift.isRestDay) return null;
					// Check attendance for this day
					const attendance = emp.attendances.find((a) => {
						if (!a.date) return false;
						const d = new Date(a.date);
						return d >= targetDate && d <= dayEnd;
					});
					// Return the status - if no attendance record on a work day, it's ABSENT
					const status = attendance ? attendance.status : "ABSENT";
					return {
						employeeId: emp.id,
						employeeName: getEmployeeName(emp),
						status: status as "PRESENT" | "LEAVE" | "ABSENT",
					};
				})
				.filter((result) => result !== null) as Array<{
				employeeId: string;
				employeeName: string;
				status: "PRESENT" | "LEAVE" | "ABSENT";
			}>;
			return results;
		}
		case "statusSummaryByEmployee": {
			// Build date window
			const dateFrom = whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null;
			const dateTo = whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null;
			if (!dateFrom || !dateTo) {
				return [];
			}
			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;
			if (!organizationId) {
				return [];
			}
			const startDate = new Date(dateFrom);
			startDate.setUTCHours(0, 0, 0, 0);
			const endDate = new Date(dateTo);
			endDate.setUTCHours(23, 59, 59, 999);
			// NOTE: Do NOT filter by employmentHireDate here - we check it per day in the loop below
			const employeeWhere: any = {
				organizationId,
				isDeleted: false,
			};
			if (whereFilter.employeeId) {
				employeeWhere.id = whereFilter.employeeId;
			}
			if (whereFilter.reportToId) {
				employeeWhere.reportToId = whereFilter.reportToId;
			}
			if (whereFilter.departmentId) {
				employeeWhere.departmentId = whereFilter.departmentId;
			}
			if (whereFilter.positionId) {
				employeeWhere.positionId = whereFilter.positionId;
			}
			const employees = await prisma.employee.findMany({
				where: employeeWhere,
				select: {
					id: true,
					employeeId: true,
					employmentHireDate: true,
					employmentStartDate: true,
					employmentTerminationDate: true,
					person: { select: { personalInfo: true } },
					attendances: {
						where: {
							isDeleted: false,
							date: { gte: startDate, lte: endDate },
						},
						select: { status: true, date: true },
					},
				},
			});
			const results: Array<{
				employeeId: string;
				employeeCode?: string;
				employeeName: string;
				statusSummary: { PRESENT: number; LEAVE: number; ABSENT: number };
			}> = [];
			for (const emp of employees) {
				let present = 0;
				let leave = 0;
				let absent = 0;
				const cursorDate = new Date(startDate);
				while (cursorDate <= endDate) {
					const dayStart = new Date(cursorDate);
					const dayEnd = new Date(cursorDate);
					dayStart.setUTCHours(0, 0, 0, 0);
					dayEnd.setUTCHours(23, 59, 59, 999);
					const dayOfWeek = cursorDate.getDay();
					// Skip if not employed on this day
					const effectiveStartDate = getEffectiveEmploymentStartDate(emp);
					if (effectiveStartDate && effectiveStartDate > dayEnd) {
						cursorDate.setDate(cursorDate.getDate() + 1);
						continue;
					}
					if (emp.employmentTerminationDate && emp.employmentTerminationDate < dayStart) {
						cursorDate.setDate(cursorDate.getDate() + 1);
						continue;
					}
					const activeSchedule = resolveEmployeeActiveSchedule(emp);
					if (!activeSchedule) {
						cursorDate.setDate(cursorDate.getDate() + 1);
						continue;
					}
					const shift = findShiftForDay(activeSchedule as any, dayOfWeek);
					if (!shift || shift.isRestDay) {
						cursorDate.setDate(cursorDate.getDate() + 1);
						continue;
					}
					const attendance = emp.attendances.find((a) => {
						if (!a.date) return false;
						const d = new Date(a.date);
						return d >= dayStart && d <= dayEnd;
					});
					// Count based on actual status or absence
					if (!attendance) {
						// No attendance record on a work day = ABSENT
						absent++;
					} else if (attendance.status === "PRESENT") {
						present++;
					} else if (attendance.status === "LEAVE") {
						leave++;
					} else if ((attendance.status as string) === "ABSENT") {
						absent++;
					}
					// Note: Other statuses are not counted as they're filtered by schedule
					cursorDate.setDate(cursorDate.getDate() + 1);
				}
				results.push({
					employeeId: emp.id,
					employeeCode: emp.employeeId,
					employeeName: getEmployeeName(emp as any),
					statusSummary: { PRESENT: present, LEAVE: leave, ABSENT: absent },
				});
			}
			return results;
		}
		case "todayAttendance": {
			// Get today's date (start and end of day)
			const today = new Date();
			today.setUTCHours(0, 0, 0, 0);
			const todayEnd = new Date(today);
			todayEnd.setUTCHours(23, 59, 59, 999);
			// Find attendance for today
			const todayAttendance = await prisma.attendance.findFirst({
				where: {
					...whereClause,
					date: {
						gte: today,
						lte: todayEnd,
					},
				},
				include: {
					employee: {
						include: {
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					},
				},
			});
			if (!todayAttendance) {
				return {
					hasAttendance: false,
					date: today.toISOString(),
					employeeId: whereFilter.employeeId || null,
				};
			}
			return {
				hasAttendance: true,
				id: todayAttendance.id,
				employeeId: todayAttendance.employeeId,
				employeeName: getEmployeeName(todayAttendance.employee),
				date: todayAttendance.date?.toISOString(),
				timeIn: todayAttendance.timeIn?.toISOString(),
				timeOut: todayAttendance.timeOut?.toISOString(),
				status: todayAttendance.status,
				isManualEntry: todayAttendance.isManualEntry,
				notes: todayAttendance.notes,
			};
		}
		case "attendanceMetricsDetailed": {
			// Get comprehensive attendance metrics from persisted timesheet lines.
			const dateFrom = whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null;
			const dateTo = whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null;

			if (!dateFrom || !dateTo) {
				// Default to last 7 days if no date range provided
				const endDate = new Date();
				endDate.setUTCHours(23, 59, 59, 999);
				const startDate = new Date();
				startDate.setDate(startDate.getDate() - 7);
				startDate.setUTCHours(0, 0, 0, 0);

				const organizationId =
					whereFilter.organizationId ||
					(
						await prisma.employee.findFirst({
							where: { isDeleted: false },
							select: { organizationId: true },
						})
					)?.organizationId;

				if (!organizationId) {
					return {
						metrics: {
							totalPresent: 0,
							totalAbsent: 0,
							totalNotClockedIn: 0,
							totalLate: 0,
							totalOnLeave: 0,
							totalRestDay: 0,
							avgAttendanceRate: 0,
							totalMinutesWorked: 0,
							totalOvertimeMinutes: 0,
							totalUndertimeMinutes: 0,
							totalLateMinutes: 0,
						},
						records: [],
						dateRange: {
							from: startDate.toISOString().split("T")[0],
							to: endDate.toISOString().split("T")[0],
						},
						totalRecords: 0,
					};
				}

				return await calculateAttendanceMetricsDetailed(
					prisma,
					organizationId,
					startDate,
					endDate,
					100, // Default limit
					1, // Default page
					(whereFilter.search || whereFilter.query) as string,
					whereFilter.status as string,
					undefined,
					whereFilter.sectionId as string,
					whereFilter.positionId as string,
					whereFilter.levelId as string,
					(whereFilter.reportToId || whereFilter.managerId) as string,
					whereFilter.employeeId as string,
					whereFilter.shiftType as string,
				);
			}

			// Normalize bounds to full days
			const startDate = new Date(dateFrom);
			startDate.setUTCHours(0, 0, 0, 0);
			const endDate = new Date(dateTo);
			endDate.setUTCHours(23, 59, 59, 999);

			// Resolve organizationId
			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;

			if (!organizationId) {
				return {
					metrics: {
						totalPresent: 0,
						totalAbsent: 0,
						totalNotClockedIn: 0,
						totalLate: 0,
						totalOnLeave: 0,
						totalRestDay: 0,
						totalHoliday: 0,
						totalClockedIn: 0,
						totalOnTime: 0,
						totalScheduledWorkDays: 0,
						totalCalendarDays: 0,
						totalCompanyEventDays: 0,
						totalClockedOut: 0,
						totalEarlyOut: 0,
						totalOvertime: 0,
						avgAttendanceRate: 0,
						utilizationRate: 0,
						totalMinutesWorked: 0,
						totalOvertimeMinutes: 0,
						totalUndertimeMinutes: 0,
						totalLateMinutes: 0,
					},
					records: [],
					dateRange: {
						from: startDate.toISOString().split("T")[0],
						to: endDate.toISOString().split("T")[0],
					},
					totalRecords: 0,
				};
			}

			// Get limit from filter (default 100)
			const limit = Number(whereFilter.limit) || 100;
			const page = Number(whereFilter.page) || 1;
			const searchQuery = whereFilter.search || whereFilter.query;
			const status = whereFilter.status;
			const departmentId = whereFilter.departmentId;
			const reportToId = whereFilter.reportToId || whereFilter.managerId;
			const employeeId = whereFilter.employeeId;
			const shiftType = whereFilter.shiftType;

			return await calculateAttendanceMetricsDetailed(
				prisma,
				organizationId,
				startDate,
				endDate,
				limit,
				page,
				searchQuery as string,
				status as string,
				departmentId as string,
				whereFilter.sectionId as string,
				whereFilter.positionId as string,
				whereFilter.levelId as string,
				reportToId as string,
				employeeId as string,
				shiftType as string,
			);
		}
		case "attendanceObligationDetailed": {
			const dateFrom = whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null;
			const dateTo = whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null;
			const endDate = dateTo || new Date();
			endDate.setUTCHours(23, 59, 59, 999);
			const startDate = dateFrom || new Date(endDate);
			if (!dateFrom) startDate.setDate(startDate.getDate() - 7);
			startDate.setUTCHours(0, 0, 0, 0);
			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;

			if (!organizationId) {
				return {
					metrics: {
						totalPresent: 0,
						totalAbsent: 0,
						totalNotClockedIn: 0,
						totalLate: 0,
						totalOnLeave: 0,
						totalRestDay: 0,
						avgAttendanceRate: 0,
						totalMinutesWorked: 0,
						totalOvertimeMinutes: 0,
						totalUndertimeMinutes: 0,
						totalLateMinutes: 0,
					},
					records: [],
					dateRange: {
						from: startDate.toISOString().split("T")[0],
						to: endDate.toISOString().split("T")[0],
					},
					totalRecords: 0,
				};
			}

			return await calculateAttendanceObligationDetailed(
				prisma,
				organizationId,
				startDate,
				endDate,
				Number(whereFilter.limit) || 100,
				Number(whereFilter.page) || 1,
				(whereFilter.search || whereFilter.query) as string,
				whereFilter.status as string,
				whereFilter.departmentId as string,
				whereFilter.sectionId as string,
				whereFilter.positionId as string,
				whereFilter.levelId as string,
				(whereFilter.reportToId || whereFilter.managerId) as string,
				whereFilter.employeeId as string,
				whereFilter.shiftType as string,
			);
		}
		case "attendanceObligationSummary": {
			const dateFrom = whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null;
			const dateTo = whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null;
			const endDate = dateTo || new Date();
			endDate.setUTCHours(23, 59, 59, 999);
			const startDate = dateFrom || new Date(endDate);
			if (!dateFrom) startDate.setDate(startDate.getDate() - 7);
			startDate.setUTCHours(0, 0, 0, 0);
			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;
			if (!organizationId) {
				return {
					totalPresent: 0,
					totalAbsent: 0,
					totalNotClockedIn: 0,
					totalLate: 0,
					totalOnLeave: 0,
					totalRestDay: 0,
					totalHoliday: 0,
					totalClockedIn: 0,
					totalOnTime: 0,
					totalScheduledWorkDays: 0,
					totalCalendarDays: 0,
					totalCompanyEventDays: 0,
					totalClockedOut: 0,
					totalEarlyOut: 0,
					totalOvertime: 0,
					leaveTypeBreakdown: [],
					avgAttendanceRate: 0,
					utilizationRate: 0,
					totalMinutesWorked: 0,
					totalOvertimeMinutes: 0,
					totalUndertimeMinutes: 0,
					totalLateMinutes: 0,
				};
			}
			return await calculateAttendanceObligationSummary(
				prisma,
				organizationId,
				startDate,
				endDate,
				(whereFilter.search || whereFilter.query) as string,
				whereFilter.status as string,
				whereFilter.departmentId as string,
				whereFilter.sectionId as string,
				whereFilter.positionId as string,
				whereFilter.levelId as string,
				(whereFilter.reportToId || whereFilter.managerId) as string,
				whereFilter.employeeId as string,
				whereFilter.shiftType as string,
			);
		}
		case "attendanceObligationTodayOpsSummary": {
			const dateFrom = whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null;
			const dateTo = whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null;
			const targetDate = new Date(dateFrom || dateTo || new Date());
			targetDate.setUTCHours(0, 0, 0, 0);
			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;
			if (!organizationId) {
				return {
					businessDate: targetDate.toISOString().split("T")[0],
					scheduledTodayCount: 0,
					notYetInCount: 0,
					clockedInTodayCount: 0,
					clockedOutTodayCount: 0,
					onTimeTodayCount: 0,
					lateRightNowCount: 0,
					earlyOutTodayCount: 0,
					overtimeTodayCount: 0,
					approvedLeaveTodayCount: 0,
					workDayTodayCount: 0,
					leaveTypeBreakdown: [],
					holidayTodayCount: 0,
					restDayTodayCount: 0,
					companyEventDayCount: 0,
				};
			}
			return await calculateAttendanceObligationTodayOpsSummary(
				prisma,
				organizationId,
				targetDate,
				(whereFilter.search || whereFilter.query) as string,
				whereFilter.departmentId as string,
				whereFilter.sectionId as string,
				whereFilter.positionId as string,
				whereFilter.levelId as string,
				(whereFilter.reportToId || whereFilter.managerId) as string,
				whereFilter.employeeId as string,
				whereFilter.shiftType as string,
			);
		}
		case "attendanceTimesheetLineSummary": {
			const dateFrom = whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null;
			const dateTo = whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null;

			const endDate = dateTo || new Date();
			endDate.setUTCHours(23, 59, 59, 999);
			const startDate = dateFrom || new Date(endDate);
			if (!dateFrom) {
				startDate.setDate(startDate.getDate() - 7);
			}
			startDate.setUTCHours(0, 0, 0, 0);

			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;

			if (!organizationId) {
				return {
					totalPresent: 0,
					totalAbsent: 0,
					totalNotClockedIn: 0,
					totalLate: 0,
					totalOnLeave: 0,
					totalRestDay: 0,
					avgAttendanceRate: 0,
					totalMinutesWorked: 0,
					totalOvertimeMinutes: 0,
					totalUndertimeMinutes: 0,
					totalLateMinutes: 0,
				};
			}

			return await calculateAttendanceTimesheetLineSummary(
				prisma,
				organizationId,
				startDate,
				endDate,
				(whereFilter.search || whereFilter.query) as string,
				whereFilter.status as string,
				whereFilter.departmentId as string,
				whereFilter.sectionId as string,
				whereFilter.positionId as string,
				whereFilter.levelId as string,
				(whereFilter.reportToId || whereFilter.managerId) as string,
				whereFilter.employeeId as string,
			);
		}
		case "attendanceTodayOpsSummary": {
			const dateFrom = whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null;
			const dateTo = whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null;
			const baseDate = dateFrom || dateTo || new Date();
			const targetDate = new Date(baseDate);
			targetDate.setUTCHours(0, 0, 0, 0);

			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;

			if (!organizationId) {
				return {
					businessDate: targetDate.toISOString().split("T")[0],
					scheduledTodayCount: 0,
					notYetInCount: 0,
					lateRightNowCount: 0,
					approvedLeaveTodayCount: 0,
				};
			}

			return await calculateAttendanceTodayOpsSummary(
				prisma,
				organizationId,
				targetDate,
				(whereFilter.search || whereFilter.query) as string,
				whereFilter.departmentId as string,
				(whereFilter.reportToId || whereFilter.managerId) as string,
				whereFilter.employeeId as string,
			);
		}
		case "attendanceDailyTrendByDepartment": {
			const dateFrom = whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null;
			const dateTo = whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null;
			const endDate = dateTo || new Date();
			endDate.setUTCHours(23, 59, 59, 999);
			const startDate = dateFrom || new Date(endDate);
			if (!dateFrom) startDate.setDate(startDate.getDate() - 7);
			startDate.setUTCHours(0, 0, 0, 0);

			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;

			if (!organizationId) {
				return {
					startDate,
					endDate,
					totalDays: 0,
					totalRecords: 0,
					departments: [],
					series: [],
				};
			}

			return await calculateAttendanceDailyTrendByDepartment(
				prisma,
				organizationId,
				startDate,
				endDate,
				(whereFilter.search || whereFilter.query) as string,
				whereFilter.status as string,
				whereFilter.departmentId as string,
				(whereFilter.reportToId || whereFilter.managerId) as string,
				whereFilter.employeeId as string,
				whereFilter.shiftType as string,
			);
		}
		case "perfectAttendanceMetrics": {
			// Use dateFrom/dateTo pattern like other metrics
			const startDate = whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null;
			const endDate = whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null;

			// If no dates provided, use last 365 days for performance
			const finalStartDate =
				startDate ||
				(() => {
					const date = new Date();
					date.setDate(date.getDate() - 365);
					date.setUTCHours(0, 0, 0, 0);
					return date;
				})();

			const finalEndDate =
				endDate ||
				(() => {
					const date = new Date();
					date.setUTCHours(23, 59, 59, 999);
					return date;
				})();

			// Get organizationId
			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;

			if (!organizationId) {
				return {
					totalEmployees: 0,
					perfectAttendanceCount: 0,
					perfectAttendanceRate: 0,
					averageAttendanceRate: 0,
					employees: [],
				};
			}

			return await calculatePerfectAttendanceMetrics(
				prisma,
				organizationId,
				finalStartDate,
				finalEndDate,
				whereFilter.departmentId,
			);
		}
		case "tardinessMetrics": {
			try {
				// buildFilter transforms dateFrom/dateTo into date.gte/date.lte
				const startDate = whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null;
				const endDate = whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null;

				if (!startDate || !endDate) {
					throw new Error("Date range is required for tardiness metrics");
				}

				// Get organizationId
				const organizationId =
					whereFilter.organizationId ||
					(
						await prisma.employee.findFirst({
							where: { isDeleted: false },
							select: { organizationId: true },
						})
					)?.organizationId;

				if (!organizationId) {
					return {
						totalTardinessInstances: 0,
						totalUndertimeHours: 0,
						employees: [],
					};
				}

				return await calculateTardinessMetrics(
					prisma,
					organizationId,
					startDate,
					endDate,
					whereFilter.departmentId,
				);
			} catch (error: any) {
				logger.error("Error calculating tardiness metrics:", error);
				throw new Error(`Failed to calculate tardiness metrics: ${error.message}`);
			}
		}
		case "manhoursReport": {
			try {
				const startDate = whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null;
				const endDate = whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null;
				if (!startDate || !endDate) {
					throw new Error("Date range is required for manhours report");
				}
				const organizationId =
					whereFilter.organizationId ||
					(
						await prisma.employee.findFirst({
							where: { isDeleted: false },
							select: { organizationId: true },
						})
					)?.organizationId;
				if (!organizationId) {
					return {
						period: {
							from: startDate.toISOString().slice(0, 10),
							to: endDate.toISOString().slice(0, 10),
						},
						grandTotals: { employees: 0, daysWorked: 0, totalMinutes: 0, totalHours: 0 },
						employees: [],
						departments: [],
					};
				}
				return await calculateManhoursMetrics(
					prisma,
					organizationId,
					startDate,
					endDate,
					whereFilter.departmentId,
				);
			} catch (error: any) {
				logger.error("Error calculating manhours metrics:", error);
				throw new Error(`Failed to calculate manhours metrics: ${error.message}`);
			}
		}
		case "overtimeMetrics": {
			try {
				// buildFilter transforms dateFrom/dateTo into date.gte/date.lte
				const startDate = whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null;
				const endDate = whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null;

				if (!startDate || !endDate) {
					throw new Error("Date range is required for overtime metrics");
				}

				// Get organizationId
				const organizationId =
					whereFilter.organizationId ||
					(
						await prisma.employee.findFirst({
							where: { isDeleted: false },
							select: { organizationId: true },
						})
					)?.organizationId;

			if (!organizationId) {
				return {
					totalOvertimeHours: 0,
					employeesWithOvertime: 0,
					employees: [],
					split: {
						direct: { totalOvertimeHours: 0, employeesWithOvertime: 0 },
						agency: { totalOvertimeHours: 0, employeesWithOvertime: 0 },
					},
				};
			}

			return await calculateOvertimeMetrics(
				prisma,
				organizationId,
				startDate,
				endDate,
				whereFilter.departmentId,
				typeof whereFilter.workforceSource === "string"
					? whereFilter.workforceSource
					: undefined,
			);
			} catch (error: any) {
				logger.error("Error calculating overtime metrics:", error);
				throw new Error(`Failed to calculate overtime metrics: ${error.message}`);
			}
		}
		case "noWorkReport": {
			const targetDate =
				(whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null) ||
				(() => {
					const date = new Date();
					date.setUTCHours(0, 0, 0, 0);
					return date;
				})();

			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;

			if (!organizationId) {
				return {
					date: targetDate,
					totalEmployeesConsidered: 0,
					noWorkCount: 0,
					employees: [],
				};
			}

			return await calculateNoWorkReport(
				prisma,
				organizationId,
				targetDate,
				whereFilter.departmentId,
				whereFilter.reportToId || whereFilter.managerId,
			);
		}
		case "dailyActiveManpower": {
			const targetDate =
				(whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null) ||
				(() => {
					const date = new Date();
					date.setUTCHours(0, 0, 0, 0);
					return date;
				})();

			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;

			if (!organizationId) {
				return {
					date: targetDate,
					totalEmployeesConsidered: 0,
					activeManpowerCount: 0,
					employees: [],
				};
			}

			return await calculateDailyActiveManpower(
				prisma,
				organizationId,
				targetDate,
				whereFilter.departmentId,
				whereFilter.reportToId || whereFilter.managerId,
			);
		}
		case "agencyAttendanceSummary": {
			const startDate =
				(whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null) ||
				(() => {
					const date = new Date();
					date.setUTCHours(0, 0, 0, 0);
					return date;
				})();
			const endDate =
				(whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null) ||
				(() => {
					const date = new Date(startDate);
					date.setUTCHours(23, 59, 59, 999);
					return date;
				})();

			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;

			if (!organizationId) {
				return {
					startDate,
					endDate,
					totalAgencies: 0,
					items: [],
				};
			}

			return await calculateAgencyAttendanceSummary(
				prisma,
				organizationId,
				startDate,
				endDate,
				whereFilter.departmentId,
				whereFilter.reportToId || whereFilter.managerId,
			);
		}
		case "directIndirectLaborSummary": {
			const startDate =
				(whereFilter.date?.gte ? new Date(whereFilter.date.gte) : null) ||
				(() => {
					const date = new Date();
					date.setUTCHours(0, 0, 0, 0);
					return date;
				})();
			const endDate =
				(whereFilter.date?.lte ? new Date(whereFilter.date.lte) : null) ||
				(() => {
					const date = new Date(startDate);
					date.setUTCHours(23, 59, 59, 999);
					return date;
				})();

			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;

			if (!organizationId) {
				return {
					startDate,
					endDate,
					totalDirectEmployees: 0,
					totalIndirectEmployees: 0,
					directScheduledWorkDays: 0,
					indirectScheduledWorkDays: 0,
					directActiveManpower: 0,
					indirectActiveManpower: 0,
					directNoWorkCount: 0,
					indirectNoWorkCount: 0,
					items: [],
				};
			}

			return await calculateDirectIndirectLaborSummary(
				prisma,
				organizationId,
				startDate,
				endDate,
				whereFilter.departmentId,
				whereFilter.reportToId || whereFilter.managerId,
				whereFilter.laborType,
			);
		}
		default:
			throw new Error(`Unknown attendance metric: ${metric}`);
	}
}
// Employee metrics
async function generateEmployeeMetric(
	prisma: PrismaClient,
	metric: string,
	whereFilter: any,
	req?: AuthRequest,
	rawFilter?: {
		dateFrom?: string;
		dateTo?: string;
		[key: string]: string | number | boolean | null | undefined;
	},
) {
	switch (metric) {
		case "turnoverAttritionReport": {
			const organizationId =
				whereFilter.organizationId ||
				req?.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;

			const startDate = rawFilter?.dateFrom ? parseDateInputToUTC(String(rawFilter.dateFrom)) : null;
			const endDate = rawFilter?.dateTo ? parseDateInputToUTC(String(rawFilter.dateTo)) : null;
			if (!startDate || !endDate) {
				throw new Error("Date range is required for turnover and attrition metrics");
			}

			const normalizedGroupBy = String(rawFilter?.groupBy || "month").toLowerCase();
			const groupBy =
				normalizedGroupBy === "day" ||
				normalizedGroupBy === "week" ||
				normalizedGroupBy === "month" ||
				normalizedGroupBy === "year"
					? normalizedGroupBy
					: "month";

			return await calculateTurnoverAttritionReport(prisma, {
				organizationId,
				dateFrom: startDate,
				dateTo: endDate,
				groupBy,
				departmentId: whereFilter.departmentId,
				sectionId: whereFilter.sectionId,
				positionId: whereFilter.positionId,
				levelId: whereFilter.levelId,
			});
		}
		case "eligibilityCandidates": {
			// Extract organizationId from request if not in filter
			const organizationId = whereFilter.organizationId || req?.organizationId;

			if (!organizationId) {
				throw new Error("Organization ID is required for eligibility metrics");
			}

			return await getEligibilityCandidates(prisma, organizationId, req);
		}
		case "documentComplianceMetrics": {
			// Fetch active employees with documents
			const whereClause: any = {
				isDeleted: false,
				employmentStatus: {
					in: ["ACTIVE", "ONBOARDING"],
				},
			};

			// Add optional filters
			if (whereFilter.organizationId) {
				whereClause.organizationId = whereFilter.organizationId;
			}
			if (whereFilter.departmentId) {
				whereClause.departmentId = whereFilter.departmentId;
			}
			if (whereFilter.sectionId) {
				whereClause.sectionId = whereFilter.sectionId;
			}
			if (whereFilter.reportToId) {
				whereClause.reportToId = whereFilter.reportToId;
			}

			const documentTypeWhere: any = {
				isDeleted: false,
				isActive: true,
			};

			if (whereFilter.organizationId) {
				documentTypeWhere.organizationId = whereFilter.organizationId;
			}

			const documentTypes = await prisma.documentType.findMany({
				where: documentTypeWhere,
				orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
				select: {
					id: true,
					code: true,
					name: true,
					metadata: true,
					fields: true,
					isRequired: true,
					uploadBy: true,
					isEmployeeVisible: true,
					displayOrder: true,
				},
			});

			const employees = await prisma.employee.findMany({
				where: whereClause,
				select: {
					id: true,
					employeeId: true,
					documents: {
						where: { isDeleted: false },
					},
					person: {
						select: {
							personalInfo: true,
							identification: true,
						},
					},
					department: {
						select: {
							id: true,
							name: true,
						},
					},
					section: {
						select: {
							id: true,
							name: true,
							departmentId: true,
						},
					},
					position: {
						select: {
							id: true,
							title: true,
						},
					},
					employmentType: true,
					role: true,
				},
			});

			const reviewActorIds = [
				...new Set(
					employees.flatMap((employee) =>
						(employee.documents || []).flatMap((document: any) => {
							const reviewSnapshot = (getDocumentReviewSnapshot(document) ||
								{}) as Record<string, any>;
							return [
								String(reviewSnapshot.submittedByEmployeeId || "").trim(),
								String(reviewSnapshot.approvedByEmployeeId || "").trim(),
								String(reviewSnapshot.rejectedByEmployeeId || "").trim(),
							].filter(Boolean);
						}),
					),
				),
			];
			const reviewActors = reviewActorIds.length
				? await prisma.employee.findMany({
						where: {
							id: { in: reviewActorIds },
							isDeleted: false,
						},
						select: {
							id: true,
							employeeId: true,
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					})
				: [];
			const reviewActorNameMap = new Map(
				reviewActors.map((actor) => [actor.id, getEmployeeName(actor)]),
			);

			const totalEmployees = employees.length;
			let compliantCount = 0;
			let warningCount = 0;
			let verifiedMandatedDocuments = 0;
			let totalMandatedApplicableDocuments = 0;
			const documentCounts = new Map<string, number>();
			const applicableDocumentCounts = new Map<string, number>();
			const compliant: Array<{
				id: string;
				employeeId: string;
				name: string;
				department: string;
				section?: string;
				position: string;
				compliancePercent: number;
				overallStatus: "compliant" | "warning";
				documentCount: number;
				documentTypeCodes: string[];
				documentTypeNames: string[];
				compliantDocDetails: Array<{
					id: string;
					code: string;
					name: string;
					priorityLevel: "high" | "medium" | "low";
					isMandated: boolean;
					requiredForPayroll: boolean;
					requiredForOnboarding: boolean;
				}>;
				recommendedMissingDocs: string[];
				recommendedMissingDocCodes: string[];
				recommendedMissingDocDetails: Array<{
					id: string;
					code: string;
					name: string;
					priorityLevel: "high" | "medium" | "low";
					isMandated: boolean;
					requiredForPayroll: boolean;
					requiredForOnboarding: boolean;
				}>;
				reviewAuditDetails?: DocumentReviewAuditDetail[];
			}> = [];
			const warningEmployees: Array<{
				id: string;
				employeeId: string;
				name: string;
				department: string;
				section?: string;
				position: string;
				compliancePercent: number;
				overallStatus: "warning";
				documentCount: number;
				documentTypeCodes: string[];
				documentTypeNames: string[];
				compliantDocDetails: Array<{
					id: string;
					code: string;
					name: string;
					priorityLevel: "high" | "medium" | "low";
					isMandated: boolean;
					requiredForPayroll: boolean;
					requiredForOnboarding: boolean;
				}>;
				recommendedMissingDocs: string[];
				recommendedMissingDocCodes: string[];
				recommendedMissingDocDetails: Array<{
					id: string;
					code: string;
					name: string;
					priorityLevel: "high" | "medium" | "low";
					isMandated: boolean;
					requiredForPayroll: boolean;
					requiredForOnboarding: boolean;
				}>;
				reviewAuditDetails?: DocumentReviewAuditDetail[];
			}> = [];
			const pendingApprovalEmployees: Array<{
				id: string;
				employeeId: string;
				name: string;
				department: string;
				section?: string;
				position: string;
				compliancePercent: number;
				overallStatus: "non_compliant";
				pendingApprovalDocs: string[];
				pendingApprovalDocCodes: string[];
				pendingApprovalDocDetails: Array<{
					id: string;
					code: string;
					name: string;
					priorityLevel: "high" | "medium" | "low";
					isMandated: boolean;
					requiredForPayroll: boolean;
					requiredForOnboarding: boolean;
				}>;
				reviewAuditDetails?: DocumentReviewAuditDetail[];
			}> = [];

			const nonCompliant: Array<{
				id: string;
				employeeId: string;
				name: string;
				department: string;
				section?: string;
				position: string;
				compliancePercent: number;
				overallStatus: "non_compliant";
				missingDocs: string[];
				missingDocCodes: string[];
				missingMandatedDocs: string[];
				missingRecommendedDocs: string[];
				missingDocDetails: Array<{
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
			}> = [];

			employees.forEach((employee) => {
				const employeeName = getEmployeeName(employee);
				const departmentName = employee.department?.name || "N/A";
				const sectionName = employee.section?.name || "N/A";
				const positionName = employee.position?.title || "N/A";

				const docs = employee.documents || [];
				const employeeContext = {
					departmentId: employee.department?.id || null,
					positionId: employee.position?.id || null,
					employmentType: employee.employmentType || null,
					role: employee.role || null,
				};
				const compliance = computeEmployeeDocumentCompliance({
					documentTypes,
					documents: docs,
					employeeContext,
				});

				compliance.applicableDocumentEvaluations.forEach((evaluation) => {
					applicableDocumentCounts.set(
						evaluation.id,
						(applicableDocumentCounts.get(evaluation.id) || 0) + 1,
					);
					if (evaluation.isMandated) {
						totalMandatedApplicableDocuments += 1;
						if (evaluation.isSatisfied) {
							verifiedMandatedDocuments += 1;
						}
					}
					if (evaluation.isSatisfied) {
						documentCounts.set(
							evaluation.id,
							(documentCounts.get(evaluation.id) || 0) + 1,
						);
					}
				});

				const documentTypeCodesOnFile = compliance.compliantDocuments.map(
					(doc) => doc.code,
				);
				const documentTypeNamesOnFile = compliance.compliantDocuments.map(
					(doc) => doc.name,
				);
				const missingMandatedDocs = compliance.missingDocuments.map((doc) => doc.name);
				const missingRecommendedDocs = compliance.warningDocuments.map((doc) => doc.name);
				const pendingApprovalDocDetails = compliance.missingDocuments.filter((doc) => {
					const matchingDocuments = docs.filter((document) =>
						documentMatchesType(
							document,
							documentTypes.find((type) => type.id === doc.id),
						),
					);

					return matchingDocuments.some((document) => {
						if (getDocumentReviewStatus(document) !== "PENDING") return false;
						const documentType = documentTypes.find((type) => type.id === doc.id);
						if (!documentType) return false;
						return evaluateEmployeeDocumentCompleteness({
							document,
							documentType,
							employeeContext,
						}).isComplete;
					});
				});
				const pendingApprovalAuditDetails = buildEmployeeDocumentReviewAuditDetails({
					details: pendingApprovalDocDetails,
					documents: docs,
					documentTypes,
					employeeContext,
					employeeId: employee.id,
					employeeName,
					actorNameMap: reviewActorNameMap,
				});
				const compliantAuditDetails = buildEmployeeDocumentReviewAuditDetails({
					details: compliance.compliantDocuments,
					documents: docs,
					documentTypes,
					employeeContext,
					employeeId: employee.id,
					employeeName,
					actorNameMap: reviewActorNameMap,
				});

				if (compliance.overallStatus === "non_compliant") {
					if (pendingApprovalDocDetails.length > 0) {
						pendingApprovalEmployees.push({
							id: employee.id,
							employeeId: employee.employeeId,
							name: employeeName,
							department: departmentName,
							section: sectionName,
							position: positionName,
							compliancePercent: compliance.compliancePercent,
							overallStatus: "non_compliant",
							pendingApprovalDocs: pendingApprovalDocDetails.map((doc) => doc.name),
							pendingApprovalDocCodes: pendingApprovalDocDetails.map(
								(doc) => doc.code,
							),
							pendingApprovalDocDetails,
							reviewAuditDetails: pendingApprovalAuditDetails,
						});
					}

					nonCompliant.push({
						id: employee.id,
						employeeId: employee.employeeId,
						name: employeeName,
						department: departmentName,
						section: sectionName,
						position: positionName,
						compliancePercent: compliance.compliancePercent,
						overallStatus: "non_compliant",
						missingDocs: missingMandatedDocs,
						missingDocCodes: compliance.missingDocuments.map((doc) => doc.code),
						missingMandatedDocs,
						missingRecommendedDocs,
						missingDocDetails: compliance.missingDocuments,
						pendingApprovalDocs: pendingApprovalDocDetails.map((doc) => doc.name),
						pendingApprovalDocCodes: pendingApprovalDocDetails.map((doc) => doc.code),
						pendingApprovalDocDetails,
						reviewAuditDetails: pendingApprovalAuditDetails,
					});
					return;
				}

				if (compliance.overallStatus === "warning") {
					warningCount++;
					compliantCount++;
					compliant.push({
						id: employee.id,
						employeeId: employee.employeeId,
						name: employeeName,
						department: departmentName,
						section: sectionName,
						position: positionName,
						compliancePercent: compliance.compliancePercent,
						overallStatus: "warning",
						documentCount: documentTypeCodesOnFile.length,
						documentTypeCodes: documentTypeCodesOnFile,
						documentTypeNames: documentTypeNamesOnFile,
						compliantDocDetails: compliance.compliantDocuments,
						recommendedMissingDocs: missingRecommendedDocs,
						recommendedMissingDocCodes: compliance.warningDocuments.map(
							(doc) => doc.code,
						),
						recommendedMissingDocDetails: compliance.warningDocuments,
						reviewAuditDetails: compliantAuditDetails,
					});
					warningEmployees.push({
						id: employee.id,
						employeeId: employee.employeeId,
						name: employeeName,
						department: departmentName,
						section: sectionName,
						position: positionName,
						compliancePercent: compliance.compliancePercent,
						overallStatus: "warning",
						documentCount: documentTypeCodesOnFile.length,
						documentTypeCodes: documentTypeCodesOnFile,
						documentTypeNames: documentTypeNamesOnFile,
						compliantDocDetails: compliance.compliantDocuments,
						recommendedMissingDocs: missingRecommendedDocs,
						recommendedMissingDocCodes: compliance.warningDocuments.map(
							(doc) => doc.code,
						),
						recommendedMissingDocDetails: compliance.warningDocuments,
						reviewAuditDetails: compliantAuditDetails,
					});
					return;
				}

				compliantCount++;
				compliant.push({
					id: employee.id,
					employeeId: employee.employeeId,
					name: employeeName,
					department: departmentName,
					section: sectionName,
					position: positionName,
					compliancePercent: compliance.compliancePercent,
					overallStatus: "compliant",
					documentCount: documentTypeCodesOnFile.length,
					documentTypeCodes: documentTypeCodesOnFile,
					documentTypeNames: documentTypeNamesOnFile,
					compliantDocDetails: compliance.compliantDocuments,
					recommendedMissingDocs: [],
					recommendedMissingDocCodes: [],
					recommendedMissingDocDetails: [],
					reviewAuditDetails: compliantAuditDetails,
				});
			});

			const totalDocuments = totalMandatedApplicableDocuments;
			const documentBreakdown = documentTypes.map((docType) => {
				const requirementMeta = resolveDocumentTypeRequirementMeta(docType);
				const count = documentCounts.get(docType.id) || 0;
				const applicableEmployees = applicableDocumentCounts.get(docType.id) || 0;
				const missingCount = Math.max(applicableEmployees - count, 0);
				return {
					id: docType.id,
					code: docType.code,
					name: docType.name,
					count,
					applicableEmployees,
					missingCount,
					priorityLevel: requirementMeta.priorityLevel,
					isMandated: requirementMeta.isMandated,
					percentage:
						applicableEmployees > 0
							? Math.round((count / applicableEmployees) * 100 * 100) / 100
							: 0,
				};
			});

			return {
				totalEmployees,
				compliantEmployeesCount: compliantCount,
				warningEmployeesCount: warningCount,
				nonCompliantEmployeesCount: nonCompliant.length,
				compliancePercentage:
					totalEmployees > 0
						? Math.round((compliantCount / totalEmployees) * 100 * 100) / 100
						: 0,
				totalDocuments,
				verifiedDocuments: verifiedMandatedDocuments,
				verificationPercentage:
					totalDocuments > 0
						? Math.round((verifiedMandatedDocuments / totalDocuments) * 100 * 100) / 100
						: 0,
				documentBreakdown,
				pendingApprovalEmployeesCount: pendingApprovalEmployees.length,
				pendingApprovalEmployees,
				warningEmployees,
				compliantEmployees: compliant,
				nonCompliantEmployees: nonCompliant,
			};
		}
		case "leaveBalanceMetrics": {
			// Get organizationId
			const organizationId =
				whereFilter.organizationId ||
				(
					await prisma.employee.findFirst({
						where: { isDeleted: false },
						select: { organizationId: true },
					})
				)?.organizationId;

			if (!organizationId) {
				return {
					totalEmployees: 0,
					leaveTypeSummary: [],
					employees: [],
				};
			}

			return await calculateLeaveBalanceMetrics(
				prisma,
				organizationId,
				whereFilter.departmentId,
				whereFilter.sectionId,
				whereFilter.positionId,
				whereFilter.levelId,
				whereFilter.reportToId || whereFilter.managerId,
				whereFilter.employeeId,
				whereFilter.leaveType,
				whereFilter.periodFrom,
				whereFilter.periodTo,
			);
		}
		case "tinLibrary": {
			const organizationId = String(
				whereFilter.organizationId || req?.organizationId || "",
			);
			// Postgres truth: TIN lives in metadata.manpowerDatabank.tin (imported
			// from BNPI databank). The mongo-era Employee.tin column is not here.
			const employees = await prisma.employee.findMany({
				where: { organizationId, isDeleted: false },
				select: {
					id: true,
					employeeId: true,
					metadata: true,
					person: { select: { personalInfo: true } },
					department: { select: { name: true } },
				},
			});
			const tinCounts = new Map<string, number>();
			const tinOf = (employee: (typeof employees)[number]) => {
				const md = (employee.metadata as any)?.manpowerDatabank || {};
				return String(md.tin || "").trim() || null;
			};
			for (const employee of employees) {
				const tin = tinOf(employee);
				if (tin) tinCounts.set(tin, (tinCounts.get(tin) || 0) + 1);
			}
			const rows = employees.map((employee) => {
				const tin = tinOf(employee);
				const duplicate = tin ? (tinCounts.get(tin) || 0) > 1 : false;
				return {
					employeeId: employee.id,
					empCode: employee.employeeId,
					name: `${employee.person?.personalInfo?.firstName || ""} ${
						employee.person?.personalInfo?.lastName || ""
					}`.trim(),
					department: employee.department?.name || "No Department",
					tin,
					status: duplicate ? "DUPLICATE" : tin ? "OK" : "MISSING",
				};
			});
			const withTin = rows.filter((r) => r.tin).length;
			const duplicateEmployees = rows.filter((r) => r.status === "DUPLICATE").length;
			return {
				summary: {
					total: rows.length,
					withTin,
					missing: rows.length - withTin,
					duplicateEmployees,
				},
				rows,
			};
		}
		case "pregnantEmployees": {
			const organizationId = String(
				whereFilter.organizationId || req?.organizationId || "",
			);
			const employees = await prisma.employee.findMany({
				where: { organizationId, isDeleted: false, pregnant: true },
				select: {
					id: true,
					employeeId: true,
					expectedDueDate: true,
					person: { select: { personalInfo: true } },
					department: { select: { name: true } },
					position: { select: { title: true } },
				},
				orderBy: [{ expectedDueDate: "asc" }, { employeeId: "asc" }],
			});
			const rows = employees.map((employee) => ({
				employeeId: employee.id,
				empCode: employee.employeeId,
				name: `${employee.person?.personalInfo?.lastName || ""}, ${
					employee.person?.personalInfo?.firstName || ""
				}`.replace(/^, |,$/, ""),
				department: employee.department?.name || "No Department",
				position: employee.position?.title || "",
				expectedDueDate: employee.expectedDueDate
					? new Date(employee.expectedDueDate).toISOString().slice(0, 10)
					: null,
			}));
			return {
				total: rows.length,
				rows,
				privacyNote: "HR/admin-only visibility per M3.3 requirement.",
			};
		}
		default:
			throw new Error(`Unknown employee metric: ${metric}`);
	}
}

// CalendarItem metrics
async function generateCalendarItemMetric(prisma: PrismaClient, metric: string, whereFilter: any) {
	const whereClause = Object.keys(whereFilter).length > 0 ? whereFilter : { isDeleted: false };
	switch (metric) {
		case "birthdaysSummary": {
			// Get current month's start and end dates
			const now = new Date();
			const currentYear = now.getFullYear();
			const monthStart = new Date(Date.UTC(currentYear, now.getMonth(), 1, 0, 0, 0, 0));
			const monthEnd = new Date(
				Date.UTC(currentYear, now.getMonth() + 1, 0, 23, 59, 59, 999),
			);
			// Get organizationId from filter
			const organizationId = whereFilter.organizationId;
			if (!organizationId) {
				return [];
			}
			// Fetch birthday calendar items for this month directly by organizationId and year
			const birthdayItems = await prisma.calendarItem.findMany({
				where: {
					organizationId,
					year: currentYear,
					type: "BIRTHDAY",
					status: "ACTIVE",
					startDate: {
						gte: monthStart,
						lte: monthEnd,
					},
				},
				include: {
					assignedEmployee: {
						include: {
							person: {
								select: {
									personalInfo: true,
								},
							},
							department: {
								select: {
									id: true,
									name: true,
								},
							},
							position: {
								select: {
									id: true,
									title: true,
								},
							},
						},
					},
				},
				orderBy: {
					startDate: "asc",
				},
			});
			return birthdayItems.map((item) => ({
				id: item.id,
				employeeId: item.assignedEmployeeId,
				employeeName: getEmployeeName(item.assignedEmployee),
				department: item.assignedEmployee?.department?.name || "N/A",
				position: item.assignedEmployee?.position?.title || "N/A",
				date: item.startDate,
				title: item.title,
				description: item.description,
			}));
		}
		default:
			throw new Error(`Unknown calendar item metric: ${metric}`);
	}
}

// PayrollPeriod metrics
async function generatePayrollPeriodMetric(
	prisma: PrismaClient,
	metric: string,
	whereFilter: any,
	req?: AuthRequest,
) {
	const organizationId = whereFilter.organizationId || req?.organizationId;

	if (!organizationId) {
		throw new Error("Organization ID is required for payroll period metrics");
	}

	switch (metric) {
		case "payrollPeriodByCode": {
			const code = typeof whereFilter.code === "string" ? whereFilter.code.trim() : "";
			if (!code) {
				throw new Error("Payroll period code is required for payrollPeriodByCode metric");
			}

			const payrollPeriod = await prisma.payrollPeriod.findFirst({
				where: {
					organizationId,
					isDeleted: false,
					code,
				},
				select: {
					id: true,
					name: true,
					code: true,
					startDate: true,
					endDate: true,
					payDate: true,
					status: true,
				},
				orderBy: { startDate: "desc" },
			});

			if (!payrollPeriod) return null;

			return {
				id: payrollPeriod.id,
				name: payrollPeriod.name,
				code: payrollPeriod.code,
				startDate: payrollPeriod.startDate,
				endDate: payrollPeriod.endDate,
				payDate: payrollPeriod.payDate,
				status: payrollPeriod.status,
				period: {
					month: payrollPeriod.endDate
						.toLocaleString("en-US", { month: "short" })
						.toUpperCase(),
					day: payrollPeriod.endDate.getDate(),
					dayOfWeek: payrollPeriod.payDate.toLocaleString("en-US", { weekday: "long" }),
					year: payrollPeriod.endDate.getFullYear(),
				},
			};
		}

		case "payrollRunSummary": {
			const payrollPeriodId = whereFilter.payrollPeriodId;
			const departmentId =
				typeof whereFilter.departmentId === "string" && whereFilter.departmentId !== "all"
					? whereFilter.departmentId
					: undefined;
			const sectionId =
				typeof whereFilter.sectionId === "string" && whereFilter.sectionId !== "all"
					? whereFilter.sectionId
					: undefined;

			if (!payrollPeriodId) {
				throw new Error("Payroll Period ID is required for payroll run summary metric");
			}

			const payrollPeriod = await prisma.payrollPeriod.findUnique({
				where: { id: payrollPeriodId },
				select: {
					id: true,
					payFrequency: true,
				},
			});

			if (!payrollPeriod) {
				throw new Error("Payroll period not found");
			}

			const previewEligibleEmployeeWhere: any = {
				organizationId,
				isDeleted: false,
				workforceSource: "DIRECT",
				...(payrollPeriod.payFrequency && {
					payFrequency: payrollPeriod.payFrequency,
				}),
				...(departmentId ? { departmentId } : {}),
				...(sectionId ? { sectionId } : {}),
			};
			const employeeScopeWhere: any = {
				organizationId,
				isDeleted: false,
				workforceSource: "DIRECT",
				...(payrollPeriod.payFrequency && {
					payFrequency: payrollPeriod.payFrequency,
				}),
				...(departmentId ? { departmentId } : {}),
				...(sectionId ? { sectionId } : {}),
			};

			const [
				payrollScopeEmployeesTotal,
				previewEligibleEmployeesTotal,
				includedEmployeesTotal,
				missingInfoEmployeesTotal,
				approvedMissingInfoEmployeesTotal,
				missingInfoAndNotSubmittedEmployeesTotal,
				timesheetNotSubmittedEmployeesTotal,
				pendingApprovalEmployeesTotal,
				correctionNeededEmployeesTotal,
			] = await Promise.all([
				prisma.employee.count({
					where: employeeScopeWhere,
				}),
				prisma.timesheet.count({
					where: {
						organizationId,
						payrollPeriodId,
						isDeleted: false,
						status: "APPROVED",
						employee: previewEligibleEmployeeWhere,
					},
				}),
				prisma.timesheet.count({
					where: {
						organizationId,
						payrollPeriodId,
						isDeleted: false,
						status: "APPROVED",
						employee: {
							...previewEligibleEmployeeWhere,
							basicSalary: { gt: 0 },
							NOT: [{ embeddedSchedule: { equals: Prisma.DbNull } }],
						},
					},
				}),
				prisma.employee.count({
					where: {
						...employeeScopeWhere,
						OR: [
							{ basicSalary: { lte: 0 } },
							{ embeddedSchedule: { equals: Prisma.DbNull } },
						],
					},
				}),
				prisma.employee.count({
					where: {
						...employeeScopeWhere,
						timesheets: {
							some: {
								payrollPeriodId,
								isDeleted: false,
								status: "APPROVED",
							},
						},
						OR: [
							{ basicSalary: { lte: 0 } },
							{ embeddedSchedule: { equals: Prisma.DbNull } },
						],
					},
				}),
				prisma.employee.count({
					where: {
						...employeeScopeWhere,
						AND: [
							{
								OR: [
									{ basicSalary: { lte: 0 } },
									{ embeddedSchedule: { equals: Prisma.DbNull } },
								],
							},
							{
								OR: [
									{
										timesheets: {
											none: {
												payrollPeriodId,
												isDeleted: false,
											},
										},
									},
									{
										timesheets: {
											some: {
												payrollPeriodId,
												isDeleted: false,
												status: "DRAFT",
											},
										},
									},
								],
							},
						],
					},
				}),
				prisma.employee.count({
					where: {
						...employeeScopeWhere,
						OR: [
							{
								timesheets: {
									none: {
										payrollPeriodId,
										isDeleted: false,
									},
								},
							},
							{
								timesheets: {
									some: {
										payrollPeriodId,
										isDeleted: false,
										status: "DRAFT",
									},
								},
							},
						],
					},
				}),
				prisma.employee.count({
					where: {
						...employeeScopeWhere,
						timesheets: {
							some: {
								payrollPeriodId,
								isDeleted: false,
								status: "SUBMITTED",
							},
						},
					},
				}),
				prisma.employee.count({
					where: {
						...employeeScopeWhere,
						timesheets: {
							some: {
								payrollPeriodId,
								isDeleted: false,
								status: { in: ["REJECTED", "REVISED"] },
							},
						},
					},
				}),
			]);

			return {
				payrollScopeEmployeesTotal,
				previewEligibleEmployeesTotal,
				includedEmployeesTotal,
				missingInfoEmployeesTotal,
				approvedMissingInfoEmployeesTotal,
				missingInfoAndNotSubmittedEmployeesTotal,
				approvedExcludedEmployeesTotal: Math.max(
					0,
					previewEligibleEmployeesTotal - includedEmployeesTotal,
				),
				notReadyEmployeesTotal: Math.max(
					0,
					payrollScopeEmployeesTotal - includedEmployeesTotal,
				),
				timesheetNotSubmittedEmployeesTotal,
				pendingApprovalEmployeesTotal,
				correctionNeededEmployeesTotal,
				blockedEmployeesTotal: timesheetNotSubmittedEmployeesTotal,
				total:
					missingInfoEmployeesTotal +
					timesheetNotSubmittedEmployeesTotal +
					pendingApprovalEmployeesTotal +
					correctionNeededEmployeesTotal,
			};
		}

		case "payrollBlockers": {
			const payrollPeriodId = whereFilter.payrollPeriodId;
			const departmentId =
				typeof whereFilter.departmentId === "string" && whereFilter.departmentId !== "all"
					? whereFilter.departmentId
					: undefined;
			const sectionId =
				typeof whereFilter.sectionId === "string" && whereFilter.sectionId !== "all"
					? whereFilter.sectionId
					: undefined;

			if (!payrollPeriodId) {
				throw new Error("Payroll Period ID is required for payroll blockers metric");
			}

			// Get the payroll period details
			const payrollPeriod = await prisma.payrollPeriod.findUnique({
				where: { id: payrollPeriodId },
			});

			if (!payrollPeriod) {
				throw new Error("Payroll period not found");
			}

			const payrollEmployeeWhere: any = {
				organizationId,
				isDeleted: false,
				workforceSource: "DIRECT",
				...(payrollPeriod.payFrequency && {
					payFrequency: payrollPeriod.payFrequency,
				}),
				...(departmentId ? { departmentId } : {}),
				...(sectionId ? { sectionId } : {}),
			};
			const detailLimitRaw = Number(whereFilter.limit || 0);
			// Cap list payload size, but keep high enough for payroll issues modal.
			const detailLimit =
				Number.isFinite(detailLimitRaw) && detailLimitRaw > 0
					? Math.min(Math.floor(detailLimitRaw), 500)
					: 100;
			const employeeBlockerSelect = {
				id: true,
				employeeId: true,
				basicSalary: true,
				embeddedSchedule: true,
				person: {
					select: {
						personalInfo: true,
					},
				},
				department: {
					select: {
						id: true,
						name: true,
					},
				},
				position: {
					select: {
						id: true,
						title: true,
					},
				},
				reportTo: {
					select: {
						id: true,
						employeeId: true,
						person: {
							select: {
								personalInfo: true,
							},
						},
					},
				},
				timesheets: {
					where: {
						payrollPeriodId: payrollPeriodId,
						isDeleted: false,
					},
					select: {
						id: true,
						status: true,
						updatedAt: true,
					},
					orderBy: {
						updatedAt: "desc",
					},
					take: 1,
				},
			} as const;

			const buildMissingFields = (emp: {
				basicSalary?: number | null;
				embeddedSchedule?: unknown;
			}) => {
				const missing: any[] = [];
				if (!emp.embeddedSchedule) {
					missing.push({
						field: "Work Schedule",
						description:
							"Employee embedded schedule is not configured. Schedule is required for timekeeping and payroll processing.",
						severity: "critical",
					});
				}
				if (!emp.basicSalary || emp.basicSalary <= 0) {
					missing.push({
						field: "Basic Salary",
						description:
							"Basic salary is not configured or is invalid. Salary is required for payroll processing.",
						severity: "critical",
					});
				}
				return missing;
			};

			const toTimesheetBlocker = (
				emp: any,
				blockerType: "not_submitted" | "pending_approval" | "correction_needed" | "ready_for_payroll",
			) => {
				const employeeName = getEmployeeName(emp);
				const managerName = emp.reportTo ? getEmployeeName(emp.reportTo) : null;
				const timesheet = emp.timesheets?.[0];
				return {
					id: emp.id,
					employeeId: emp.employeeId,
					name: employeeName,
					position: emp.position?.title || "N/A",
					department: emp.department?.name || "N/A",
					manager: managerName || emp.reportTo?.employeeId || null,
					managerId: emp.reportTo?.id || null,
					managerEmployeeId: emp.reportTo?.employeeId || null,
					periodStart: payrollPeriod.startDate,
					periodEnd: payrollPeriod.endDate,
					timesheetId: timesheet?.id || null,
					status: timesheet?.status || "MISSING",
					blockerType,
				};
			};

			// Query each issue type directly so list rows match payrollRunSummary counts.
			// Previous implementation sampled a broad OR set by updatedAt and often returned
			// zero missing-info rows even when the summary count was non-zero.
			const missingInfoWhere = {
				...payrollEmployeeWhere,
				OR: [
					{ basicSalary: { lte: 0 } },
					{ embeddedSchedule: { equals: Prisma.DbNull } },
				],
			};
			const notSubmittedWhere = {
				...payrollEmployeeWhere,
				OR: [
					{
						timesheets: {
							none: {
								payrollPeriodId,
								isDeleted: false,
							},
						},
					},
					{
						timesheets: {
							some: {
								payrollPeriodId,
								isDeleted: false,
								status: "DRAFT",
							},
						},
					},
				],
			};

			const [
				missingInfoEmployees,
				timesheetNotSubmittedEmployees,
				pendingApprovalEmployees,
				correctionNeededEmployees,
				blockedEmployeesTotal,
				semiMonthlyEmployeesTotal,
				missingInfoTotal,
			] = await Promise.all([
				prisma.employee.findMany({
					where: missingInfoWhere,
					select: employeeBlockerSelect,
					orderBy: [{ employeeId: "asc" }, { updatedAt: "desc" }],
					take: detailLimit,
				}),
				prisma.employee.findMany({
					where: notSubmittedWhere,
					select: employeeBlockerSelect,
					orderBy: [{ employeeId: "asc" }, { updatedAt: "desc" }],
					take: detailLimit,
				}),
				prisma.employee.findMany({
					where: {
						...payrollEmployeeWhere,
						timesheets: {
							some: {
								payrollPeriodId,
								isDeleted: false,
								status: "SUBMITTED",
							},
						},
					},
					select: employeeBlockerSelect,
					orderBy: [{ employeeId: "asc" }, { updatedAt: "desc" }],
					take: detailLimit,
				}),
				prisma.employee.findMany({
					where: {
						...payrollEmployeeWhere,
						timesheets: {
							some: {
								payrollPeriodId,
								isDeleted: false,
								status: { in: ["REJECTED", "REVISED"] },
							},
						},
					},
					select: employeeBlockerSelect,
					orderBy: [{ employeeId: "asc" }, { updatedAt: "desc" }],
					take: detailLimit,
				}),
				prisma.employee.count({ where: notSubmittedWhere }),
				prisma.employee.count({ where: payrollEmployeeWhere }),
				prisma.employee.count({ where: missingInfoWhere }),
			]);

			const missingInfo = missingInfoEmployees
				.map((emp) => {
					const missingFields = buildMissingFields(emp);
					if (missingFields.length === 0) return null;
					const employeeName = getEmployeeName(emp);
					const managerName = emp.reportTo ? getEmployeeName(emp.reportTo) : null;
					const timesheet = emp.timesheets?.[0];
					return {
						id: emp.id,
						employeeId: emp.employeeId,
						name: employeeName,
						position: emp.position?.title || "N/A",
						department: emp.department?.name || "N/A",
						manager: managerName || emp.reportTo?.employeeId || null,
						managerId: emp.reportTo?.id || null,
						managerEmployeeId: emp.reportTo?.employeeId || null,
						timesheetId: timesheet?.id || null,
						status: timesheet?.status || "MISSING",
						missingFields,
					};
				})
				.filter(Boolean);

			const timesheetNotSubmitted = timesheetNotSubmittedEmployees.map((emp) =>
				toTimesheetBlocker(emp, "not_submitted"),
			);
			const pendingApproval = pendingApprovalEmployees.map((emp) =>
				toTimesheetBlocker(emp, "pending_approval"),
			);
			const correctionNeeded = correctionNeededEmployees.map((emp) =>
				toTimesheetBlocker(emp, "correction_needed"),
			);
			const readyForPayroll: any[] = [];
			const includedEmployeesTotal = Math.max(
				0,
				semiMonthlyEmployeesTotal - blockedEmployeesTotal,
			);

			return {
				missingInfo,
				timesheetNotSubmitted,
				pendingApproval,
				correctionNeeded,
				readyForPayroll,
				// Total issue entries (may double-count if an employee has multiple issues)
				total:
					missingInfo.length +
					timesheetNotSubmitted.length +
					pendingApproval.length +
					correctionNeeded.length,
				// Unique employees impacted by hard blockers (unsubmitted only).
				blockedEmployeesTotal,
				includedEmployeesTotal,
				semiMonthlyEmployeesTotal,
				detailLimit,
				// Full counts for UI badges (list rows may be capped by detailLimit)
				missingInfoTotal,
			};
		}

		case "laborCostAnalysis": {
			try {
				const startDate = whereFilter.payDate?.gte ? new Date(whereFilter.payDate.gte) : null;
				const endDate = whereFilter.payDate?.lte ? new Date(whereFilter.payDate.lte) : null;
				if (!startDate || !endDate) {
					throw new Error("Date range is required for labor cost analysis");
				}
				return await calculateLaborCostAnalysis(
					prisma,
					organizationId,
					startDate,
					endDate,
					typeof whereFilter.departmentId === "string"
						? whereFilter.departmentId
						: undefined,
					typeof whereFilter.payrollPeriodId === "string"
						? whereFilter.payrollPeriodId
						: undefined,
					typeof whereFilter.workforceSource === "string"
						? whereFilter.workforceSource
						: undefined,
				);
			} catch (error: any) {
				logger.error("Error calculating labor cost analysis:", error);
				throw new Error(`Failed to calculate labor cost analysis: ${error.message}`);
			}
		}
		case "payrollSummary": {
			const payrollPeriodId = whereFilter.payrollPeriodId;
			const payDateFilter = whereFilter.payDate;
			const departmentId =
				typeof whereFilter.departmentId === "string" ? whereFilter.departmentId : undefined;
			const reportToId =
				typeof whereFilter.reportToId === "string" ? whereFilter.reportToId : undefined;
			const periodWhere: any = {
				organizationId,
				isDeleted: false,
			};

			if (payrollPeriodId) {
				periodWhere.id = payrollPeriodId;
			} else if (payDateFilter) {
				periodWhere.payDate = payDateFilter;
			}

			const employeeRelationWhere: any = {
				payFrequency: "SEMI_MONTHLY",
			};
			if (departmentId) {
				employeeRelationWhere.departmentId = departmentId;
			}
			if (reportToId) {
				employeeRelationWhere.reportToId = reportToId;
			}

			const payrollPeriods = await prisma.payrollPeriod.findMany({
				where: periodWhere,
				select: {
					id: true,
					name: true,
					code: true,
					startDate: true,
					endDate: true,
					payDate: true,
					status: true,
					employeePayrolls: {
						where: {
							isDeleted: false,
							employee: employeeRelationWhere,
						},
						select: {
							id: true,
							isPaid: true,
							basicPay: true,
							overtimePay: true,
							nightDiffPay: true,
							holidayPay: true,
							allowances: true,
							bonuses: true,
							grossPay: true,
							taxAmount: true,
							sssContribution: true,
							philHealthContribution: true,
							pagibigContribution: true,
							loanDeductions: true,
							absentDeduction: true,
							lateDeduction: true,
							earlyOutDeduction: true,
							otherDeductions: true,
							totalDeductions: true,
							netPay: true,
							monthlySalary: true,
							dailySalary: true,
							numberOfDays: true,
							lateUndertimeAmount: true,
							regularOtHours: true,
							restDayHours: true,
							restDayHoursPay: true,
							restDayOtHours: true,
							restDayOtPay: true,
							specialHolidayOtHours: true,
							specialHolidayOtPay: true,
							sunSpecialHolidayOtExcessHours: true,
							sunSpecialHolidayOtExcessPay: true,
							specialHolidayRestDayOtHours: true,
							specialHolidayRestDayOtPay: true,
							specialRestDayExcessHours: true,
							specialRestDayExcessOtPay: true,
							legalHolidayOtHours: true,
							legalHolidayOtPay: true,
							legalHolidayExcessPay: true,
							legalHolidayRestDayPay: true,
							legalHolidayExcess1Pay: true,
							legalHolidayRestDayExcessPay: true,
							leavePay: true,
							christmasGift: true,
							specialBonus: true,
							mandatoryContributionAdjustment: true,
							guaranteedBonus: true,
							hysMealAllowance: true,
							obAllowance: true,
							otherAdjustment: true,
							overtimeMealAllowance: true,
							sportsfestOt: true,
							fringeBenefit: true,
							annualIncentive: true,
							technicalSkillsAllowance: true,
							aclVlConversionTaxable: true,
							adjustmentOverusedLeave: true,
							thirteenthMonthAdjustment: true,
							productionIncentives: true,
							otherCompensation: true,
							adjustmentBasic: true,
							adjustmentOtNd: true,
							adjustmentNonTax: true,
							excessDeduction: true,
							deMinimisAllowance: true,
							christmasGiftKid: true,
							birthdayGiftKid: true,
							birthdayGiftEmployee: true,
							fringeBenefitTax: true,
							sssEmergencyLoan: true,
							philHealthContributionAdjustment: true,
							excessInternetUsage: true,
							taxPayable: true,
							adjustmentBasicDeduction: true,
							excessMlBenefits: true,
							uniformDeduction: true,
							sssLoanRestructuringProgram: true,
							phicOnePercentDifferential: true,
							modifiedHdmf2: true,
							communityTaxCertificate: true,
							hdmfContributionAdjustment: true,
							personalCallsUsage: true,
							healthInsurance: true,
							shuttleService: true,
							negativeAdjustment: true,
							bnpiEmergencyLoan: true,
							bnpiSalaryLoan: true,
							rcbcLoan: true,
							hdmfCalamityLoan: true,
							hdmfSalaryLoan: true,
							sssCalamityLoan: true,
							sssSalaryLoan: true,
							adjustmentHolidayPay: true,
							communityTaxCert: true,
							oneKChristmasGift: true,
							taxRefund: true,
							thirteenthMonthPay: true,
							aclVlConversion: true,
							otMealAllowance: true,
							perfectAttendance: true,
							mealAllowance: true,
							lineLeaderAllowance: true,
							assemblyStanding: true,
							totalReceivable: true,
							metadata: true,
							timesheetSnapshot: true,
							employee: {
								select: {
									id: true,
									employeeId: true,
									basicSalary: true,
									payFrequency: true,
									department: {
										select: {
											name: true,
										},
									},
									section: {
										select: {
											name: true,
											code: true,
										},
									},
									person: {
										select: {
											personalInfo: true,
										},
									},
									position: {
										select: {
											title: true,
										},
									},
								},
							},
						},
					},
				},
				orderBy: {
					payDate: "desc",
				},
			});

			const totalEmployees = await prisma.employee.count({
				where: {
					organizationId,
					isDeleted: false,
					employmentStatus: "ACTIVE",
					payFrequency: "SEMI_MONTHLY",
					...(departmentId ? { departmentId } : {}),
					...(reportToId ? { reportToId } : {}),
				},
			});

			const periodSummaries = payrollPeriods.map((period) => {
				const processedEmployees = period.employeePayrolls.length;
				const paidEmployees = period.employeePayrolls.filter((ep) => ep.isPaid).length;
				const unpaidEmployees = Math.max(0, processedEmployees - paidEmployees);
				const totalGrossPay = period.employeePayrolls.reduce(
					(sum, ep) => sum + (ep.grossPay || 0),
					0,
				);
				const totalAllowances = period.employeePayrolls.reduce(
					(sum, ep) => sum + (ep.allowances || 0),
					0,
				);
				const totalBonuses = period.employeePayrolls.reduce(
					(sum, ep) => sum + (ep.bonuses || 0),
					0,
				);
				const totalBenefits = totalAllowances + totalBonuses;
				const totalTaxAmount = period.employeePayrolls.reduce(
					(sum, ep) => sum + (ep.taxAmount || 0),
					0,
				);
				const totalSSS = period.employeePayrolls.reduce(
					(sum, ep) => sum + (ep.sssContribution || 0),
					0,
				);
				const totalPhilHealth = period.employeePayrolls.reduce(
					(sum, ep) => sum + (ep.philHealthContribution || 0),
					0,
				);
				const totalPagibig = period.employeePayrolls.reduce(
					(sum, ep) => sum + (ep.pagibigContribution || 0),
					0,
				);
				const totalGovernmentContributions = totalSSS + totalPhilHealth + totalPagibig;
				const totalLoans = period.employeePayrolls.reduce(
					(sum, ep) => sum + (ep.loanDeductions || 0),
					0,
				);
				const totalPenaltyDeductions = period.employeePayrolls.reduce(
					(sum, ep) =>
						sum +
						(ep.absentDeduction || 0) +
						(ep.lateDeduction || 0) +
						(ep.earlyOutDeduction || 0) +
						(ep.otherDeductions || 0),
					0,
				);
				const totalDeductions = period.employeePayrolls.reduce(
					(sum, ep) => sum + (ep.totalDeductions || 0),
					0,
				);
				const totalNetPay = period.employeePayrolls.reduce(
					(sum, ep) => sum + (ep.netPay || 0),
					0,
				);

				return {
					id: period.id,
					name: period.name,
					code: period.code,
					startDate: period.startDate,
					endDate: period.endDate,
					payDate: period.payDate,
					status: period.status,
					processedEmployees,
					pendingEmployees: Math.max(0, totalEmployees - processedEmployees),
					paidEmployees,
					unpaidEmployees,
					totalBenefits,
					totalAllowances,
					totalBonuses,
					totalGrossPay,
					totalTaxAmount,
					totalSSS,
					totalPhilHealth,
					totalPagibig,
					totalGovernmentContributions,
					totalLoans,
					totalPenaltyDeductions,
					totalDeductions,
					totalNetPay,
				};
			});

			const flattenedPayrolls = payrollPeriods.flatMap((period) =>
				period.employeePayrolls.map((ep, index) => {
					const metadata = ep.metadata as any;
					const payrollSourceAmounts = metadata?.payrollSourceAmounts || {};
					const receivableAdd = payrollSourceAmounts.receivableOnlyBenefits || 0;
					const netPay = ep.netPay || 0;
					const lateUndertimeAmount =
						ep.lateUndertimeAmount ||
						(ep.lateDeduction || 0) +
							(ep.earlyOutDeduction || 0);
					const numberOfDays =
						ep.numberOfDays ||
						metadata?.totalWorkDays ||
						(ep.timesheetSnapshot as any)?.totalDays ||
						0;

					return {
						id: ep.id,
						rowNo: index + 1,
						payrollPeriodId: period.id,
						payrollPeriodName: period.name,
						employeeId: ep.employee.id,
						employeeCode: ep.employee.employeeId,
						employeeName: getEmployeeName(ep.employee),
						department: ep.employee.department?.name || "N/A",
						division:
							ep.employee.section?.name ||
							ep.employee.section?.code ||
							"N/A",
						position: ep.employee.position?.title || "N/A",
						payFrequency: ep.employee.payFrequency || "N/A",
						status: ep.isPaid ? "PAID" : "UNPAID",
						monthlySalary:
							ep.monthlySalary || metadata?.monthlyRate || ep.employee.basicSalary || 0,
						dailySalary: ep.dailySalary || metadata?.dailyRate || 0,
						numberOfDays,
						basicPay: ep.basicPay || 0,
						absentDeduction: ep.absentDeduction || 0,
						lateDeduction: ep.lateDeduction || 0,
						earlyOutDeduction: ep.earlyOutDeduction || 0,
						lateUndertimeAmount,
						overtimePay: ep.overtimePay || 0,
						regularOtHours: ep.regularOtHours || 0,
						holidayPay: ep.holidayPay || 0,
						nightDiffPay: ep.nightDiffPay || 0,
						restDayHours: ep.restDayHours || 0,
						restDayHoursPay: ep.restDayHoursPay || 0,
						restDayOtHours: ep.restDayOtHours || 0,
						restDayOtPay: ep.restDayOtPay || 0,
						specialHolidayOtHours: ep.specialHolidayOtHours || 0,
						specialHolidayOtPay: ep.specialHolidayOtPay || 0,
						sunSpecialHolidayOtExcessHours: ep.sunSpecialHolidayOtExcessHours || 0,
						sunSpecialHolidayOtExcessPay: ep.sunSpecialHolidayOtExcessPay || 0,
						specialHolidayRestDayOtHours: ep.specialHolidayRestDayOtHours || 0,
						specialHolidayRestDayOtPay: ep.specialHolidayRestDayOtPay || 0,
						specialRestDayExcessHours: ep.specialRestDayExcessHours || 0,
						specialRestDayExcessOtPay: ep.specialRestDayExcessOtPay || 0,
						legalHolidayOtHours: ep.legalHolidayOtHours || 0,
						legalHolidayOtPay: ep.legalHolidayOtPay || 0,
						legalHolidayExcessPay: ep.legalHolidayExcessPay || 0,
						legalHolidayRestDayPay: ep.legalHolidayRestDayPay || 0,
						legalHolidayExcess1Pay: ep.legalHolidayExcess1Pay || 0,
						legalHolidayRestDayExcessPay: ep.legalHolidayRestDayExcessPay || 0,
						leavePay: ep.leavePay || payrollSourceAmounts.leavePay || 0,
						christmasGift: ep.christmasGift || 0,
						specialBonus: ep.specialBonus || 0,
						mandatoryContributionAdjustment: ep.mandatoryContributionAdjustment || 0,
						guaranteedBonus: ep.guaranteedBonus || 0,
						hysMealAllowance: ep.hysMealAllowance || 0,
						obAllowance: ep.obAllowance || 0,
						otherAdjustment: ep.otherAdjustment || 0,
						overtimeMealAllowance: ep.overtimeMealAllowance || 0,
						sportsfestOt: ep.sportsfestOt || 0,
						fringeBenefit: ep.fringeBenefit || 0,
						annualIncentive: ep.annualIncentive || 0,
						technicalSkillsAllowance: ep.technicalSkillsAllowance || 0,
						aclVlConversionTaxable: ep.aclVlConversionTaxable || 0,
						adjustmentOverusedLeave: ep.adjustmentOverusedLeave || 0,
						thirteenthMonthAdjustment: ep.thirteenthMonthAdjustment || 0,
						productionIncentives: ep.productionIncentives || 0,
						otherCompensation: ep.otherCompensation || 0,
						adjustmentBasic: ep.adjustmentBasic || 0,
						adjustmentOtNd: ep.adjustmentOtNd || 0,
						adjustmentNonTax: ep.adjustmentNonTax || 0,
						excessDeduction: ep.excessDeduction || 0,
						deMinimisAllowance: ep.deMinimisAllowance || 0,
						allowances: ep.allowances || 0,
						bonuses: ep.bonuses || 0,
						benefitsTotal: (ep.allowances || 0) + (ep.bonuses || 0),
						otherEarn:
							(payrollSourceAmounts.leavePay || 0) +
							(ep.allowances || 0) +
							(ep.bonuses || 0),
						grossPay: ep.grossPay || 0,
						taxAmount: ep.taxAmount || 0,
						sssContribution: ep.sssContribution || 0,
						philHealthContribution: ep.philHealthContribution || 0,
						pagibigContribution: ep.pagibigContribution || 0,
						christmasGiftKid: ep.christmasGiftKid || 0,
						birthdayGiftKid: ep.birthdayGiftKid || 0,
						birthdayGiftEmployee: ep.birthdayGiftEmployee || 0,
						fringeBenefitTax: ep.fringeBenefitTax || 0,
						sssEmergencyLoan: ep.sssEmergencyLoan || 0,
						philHealthContributionAdjustment: ep.philHealthContributionAdjustment || 0,
						excessInternetUsage: ep.excessInternetUsage || 0,
						taxPayable: ep.taxPayable || 0,
						adjustmentBasicDeduction: ep.adjustmentBasicDeduction || 0,
						excessMlBenefits: ep.excessMlBenefits || 0,
						uniformDeduction: ep.uniformDeduction || 0,
						sssLoanRestructuringProgram: ep.sssLoanRestructuringProgram || 0,
						phicOnePercentDifferential: ep.phicOnePercentDifferential || 0,
						modifiedHdmf2: ep.modifiedHdmf2 || 0,
						communityTaxCertificate: ep.communityTaxCertificate || 0,
						hdmfContributionAdjustment: ep.hdmfContributionAdjustment || 0,
						personalCallsUsage: ep.personalCallsUsage || 0,
						healthInsurance: ep.healthInsurance || 0,
						shuttleService: ep.shuttleService || 0,
						negativeAdjustment: ep.negativeAdjustment || 0,
						bnpiEmergencyLoan: ep.bnpiEmergencyLoan || 0,
						bnpiSalaryLoan: ep.bnpiSalaryLoan || 0,
						rcbcLoan: ep.rcbcLoan || 0,
						hdmfCalamityLoan: ep.hdmfCalamityLoan || 0,
						hdmfSalaryLoan: ep.hdmfSalaryLoan || 0,
						sssCalamityLoan: ep.sssCalamityLoan || 0,
						sssSalaryLoan: ep.sssSalaryLoan || 0,
						governmentContributions:
							(ep.sssContribution || 0) +
							(ep.philHealthContribution || 0) +
							(ep.pagibigContribution || 0),
						loanDeductions: ep.loanDeductions || 0,
						penaltyDeductions:
							(ep.absentDeduction || 0) +
							(ep.lateDeduction || 0) +
							(ep.earlyOutDeduction || 0) +
							(ep.otherDeductions || 0),
						otherDeductions: ep.otherDeductions || 0,
						totalDeductions: ep.totalDeductions || 0,
						netPay,
						adjustmentHolidayPay: ep.adjustmentHolidayPay || 0,
						communityTaxCert: ep.communityTaxCert || 0,
						oneKChristmasGift: ep.oneKChristmasGift || 0,
						taxRefund: ep.taxRefund || 0,
						thirteenthMonthPay: ep.thirteenthMonthPay || 0,
						aclVlConversion: ep.aclVlConversion || 0,
						otMealAllowance: ep.otMealAllowance || 0,
						perfectAttendance: ep.perfectAttendance || 0,
						mealAllowance: ep.mealAllowance || 0,
						lineLeaderAllowance: ep.lineLeaderAllowance || 0,
						assemblyStanding: (ep as any).assemblyStanding || 0,
						totalReceivable: ep.totalReceivable || metadata?.totalReceivable || netPay + receivableAdd,
						receivableAdd,
						workDays: numberOfDays,
					};
				}),
			);

			const processedEmployees = flattenedPayrolls.length;
			const totalGrossPay = flattenedPayrolls.reduce(
				(sum, ep) => sum + (ep.grossPay || 0),
				0,
			);
			const totalBenefits = flattenedPayrolls.reduce(
				(sum, ep) => sum + (ep.benefitsTotal || 0),
				0,
			);
			const totalAllowances = flattenedPayrolls.reduce(
				(sum, ep) => sum + (ep.allowances || 0),
				0,
			);
			const totalBonuses = flattenedPayrolls.reduce((sum, ep) => sum + (ep.bonuses || 0), 0);
			const totalTaxAmount = flattenedPayrolls.reduce(
				(sum, ep) => sum + (ep.taxAmount || 0),
				0,
			);
			const totalSSS = flattenedPayrolls.reduce(
				(sum, ep) => sum + (ep.sssContribution || 0),
				0,
			);
			const totalPhilHealth = flattenedPayrolls.reduce(
				(sum, ep) => sum + (ep.philHealthContribution || 0),
				0,
			);
			const totalPagibig = flattenedPayrolls.reduce(
				(sum, ep) => sum + (ep.pagibigContribution || 0),
				0,
			);
			const totalGovernmentContributions = totalSSS + totalPhilHealth + totalPagibig;
			const totalLoans = flattenedPayrolls.reduce(
				(sum, ep) => sum + (ep.loanDeductions || 0),
				0,
			);
			const totalPenaltyDeductions = flattenedPayrolls.reduce(
				(sum, ep) => sum + (ep.penaltyDeductions || 0),
				0,
			);
			const totalDeductions = flattenedPayrolls.reduce(
				(sum, ep) => sum + (ep.totalDeductions || 0),
				0,
			);
			const totalNetPay = flattenedPayrolls.reduce((sum, ep) => sum + (ep.netPay || 0), 0);

			return {
				payrollPeriodId: payrollPeriodId || null,
				periodsCovered: periodSummaries.length,
				totalEmployees,
				processedEmployees,
				pendingEmployees: Math.max(0, totalEmployees - processedEmployees),
				totalBenefits,
				totalAllowances,
				totalBonuses,
				totalGrossPay,
				totalTaxAmount,
				totalSSS,
				totalPhilHealth,
				totalPagibig,
				totalGovernmentContributions,
				totalLoans,
				totalPenaltyDeductions,
				totalDeductions,
				totalNetPay,
				payrollPeriods: periodSummaries,
				payrolls: flattenedPayrolls,
			};
		}
		case "bir1601CMetrics": {
			const monthRaw = whereFilter.month;
			const yearRaw = whereFilter.year;
			const month = Number(monthRaw);
			const year = Number(yearRaw);

			if (!monthRaw || !yearRaw || Number.isNaN(month) || Number.isNaN(year)) {
				throw new Error("month and year are required for bir1601CMetrics");
			}

			return await calculateBir1601CMetrics(prisma, {
				organizationId,
				month,
				year,
				departmentId:
					typeof whereFilter.departmentId === "string"
						? whereFilter.departmentId
						: undefined,
				reportToId:
					typeof whereFilter.reportToId === "string" ? whereFilter.reportToId : undefined,
				employeeId:
					typeof whereFilter.employeeId === "string" ? whereFilter.employeeId : undefined,
			});
		}

		default:
			throw new Error(`Unknown payroll period metric: ${metric}`);
	}
}

// Timesheet metrics
async function generateTimesheetMetric(prisma: PrismaClient, metric: string, whereFilter: any) {
	// Fix whereClause for Relations
	const whereClause = { isDeleted: false, ...whereFilter };

	// Extract relation filters that might be wrongly placed at top level by buildFilter
	const {
		departmentId,
		sectionId,
		managerId,
		reportToId,
		payrollPeriodEndBefore,
		payrollPeriodEndOnOrBefore,
		payrollPeriodStartOnOrAfter,
		...rest
	} = whereClause;
	const finalWhere = { ...rest };

	if (departmentId || sectionId || managerId || reportToId) {
		finalWhere.employee = {};
		if (departmentId) finalWhere.employee.departmentId = departmentId;
		if (sectionId) finalWhere.employee.sectionId = sectionId;
		if (managerId) finalWhere.employee.reportToId = managerId;
		if (reportToId) finalWhere.employee.reportToId = reportToId;
	}

	if (payrollPeriodEndBefore || payrollPeriodEndOnOrBefore || payrollPeriodStartOnOrAfter) {
		finalWhere.payrollPeriod = finalWhere.payrollPeriod || {};
		if (payrollPeriodStartOnOrAfter) {
			finalWhere.payrollPeriod.startDate = {
				...(finalWhere.payrollPeriod.startDate || {}),
				gte: toUTCStartOfDay(String(payrollPeriodStartOnOrAfter)),
			};
		}
		if (payrollPeriodEndBefore) {
			finalWhere.payrollPeriod.endDate = {
				...(finalWhere.payrollPeriod.endDate || {}),
				lt: toUTCStartOfDay(String(payrollPeriodEndBefore)),
			};
		}
		if (payrollPeriodEndOnOrBefore) {
			finalWhere.payrollPeriod.endDate = {
				...(finalWhere.payrollPeriod.endDate || {}),
				lte: toUTCEndOfDay(String(payrollPeriodEndOnOrBefore)),
			};
		}
	}

	switch (metric) {
		case "timesheetStatistics": {
			const { status, ...statsWhere } = finalWhere;
			return await generateTimesheetStatistics(prisma, statsWhere);
		}
		default:
			throw new Error(`Unknown timesheet metric: ${metric}`);
	}
}

async function generateTimesheetStatistics(prisma: PrismaClient, whereClause: any) {
	const allTimesheets = await prisma.timesheet.findMany({
		where: whereClause,
		select: { status: true },
	});

	const total = allTimesheets.length;
	const submitted = allTimesheets.filter((t) => t.status === "SUBMITTED").length;
	const approved = allTimesheets.filter((t) => t.status === "APPROVED").length;
	const actionRequired = allTimesheets.filter(
		(t) => t.status === "REJECTED" || t.status === "REVISED",
	).length;
	const draft = allTimesheets.filter((t) => t.status === "DRAFT").length;

	return {
		total,
		submitted,
		approved,
		actionRequired,
		draft,
		approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
		submissionRate: total > 0 ? Math.round((submitted / total) * 100) : 0,
		actionRate: total > 0 ? Math.round((actionRequired / total) * 100) : 0,
		draftRate: total > 0 ? Math.round((draft / total) * 100) : 0,
	};
}
