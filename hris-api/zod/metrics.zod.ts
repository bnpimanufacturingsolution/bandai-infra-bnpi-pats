import { z } from "zod";

// Define available models for metrics
const AVAILABLE_MODELS = z.enum([
	"Request",
	"Attendance",
	"CalendarItem",
	"Employee",
	"PayrollPeriod",
	"Timesheet",
]);

// Define available metrics for Request model
const REQUEST_METRICS = z.enum([
	"totalRequests",
	"statusSummary",
	"typeSummary",
	"requestStatistics",
	"allRequests",
	"requestsByEmployee",
	"approvalRate",
	"averageProcessingTime",
]);

// Define available metrics for Attendance model
const ATTENDANCE_METRICS = z.enum([
	"todayAttendance",
	"statusSummary",
	"employeeStatusSummary",
	"statusSummaryByEmployee",
	"attendanceMetricsDetailed", // Comprehensive metrics from persisted timesheet lines
	"attendanceObligationDetailed", // Comprehensive metrics from live attendance obligations
	"attendanceObligationSummary", // Summary metrics from live attendance obligations
	"attendanceObligationTodayOpsSummary", // Today operational cards from live attendance obligations
	"attendanceTimesheetLineSummary", // Summary-only metrics from persisted timesheet lines
	"attendanceTodayOpsSummary", // Lightweight today cards from persisted timesheet lines
	"perfectAttendanceMetrics", // Perfect attendance (zero absences + zero tardiness)
	"tardinessMetrics", // Tardiness, undertime, and overtime metrics
	"overtimeMetrics", // Overtime metrics
	"noWorkReport", // Employees scheduled to work but with no attendance record
	"dailyActiveManpower", // Employees with PRESENT/INCOMPLETE/time-in activity
	"agencyAttendanceSummary", // Attendance summary grouped by employee employer/agency
	"directIndirectLaborSummary", // Workforce summary grouped by direct vs indirect labor
]);

// Define available metrics for CalendarItem model
const CALENDAR_ITEM_METRICS = z.enum(["birthdaysSummary"]);

// Define available metrics for Employee model
const EMPLOYEE_METRICS = z.enum([
	"documentComplianceMetrics",
	"eligibilityCandidates",
	"leaveBalanceMetrics",
]);

// Define available metrics for PayrollPeriod model
const PAYROLL_PERIOD_METRICS = z.enum([
	"currentPayrollPeriod",
	"payrollPeriodByCode",
	"payrollPeriodsForYear",
	"semiMonthlyEmployeesCount",
	"payrollRunSummary",
	"payrollBlockers",
	"payrollSummary",
	"bir1601CMetrics",
]);

// Define available metrics for Timesheet model
const TIMESHEET_METRICS = z.enum(["timesheetStatistics"]);

// Union of all possible metrics
const ALL_METRICS = z.union([
	REQUEST_METRICS,
	ATTENDANCE_METRICS,
	CALENDAR_ITEM_METRICS,
	EMPLOYEE_METRICS,
	PAYROLL_PERIOD_METRICS,
	TIMESHEET_METRICS,
]);

// Flexible filter schema - accepts dateFrom/dateTo plus any other model fields
const FilterSchema = z
	.object({
		dateFrom: z
			.string()
			.optional()
			.refine(
				(date) => {
					if (!date) return true;
					const parsedDate = new Date(date);
					return !isNaN(parsedDate.getTime());
				},
				{
					message: "dateFrom must be a valid date string (YYYY-MM-DD or ISO 8601 format)",
				},
			),
		dateTo: z
			.string()
			.optional()
			.refine(
				(date) => {
					if (!date) return true;
					const parsedDate = new Date(date);
					return !isNaN(parsedDate.getTime());
				},
				{
					message: "dateTo must be a valid date string (YYYY-MM-DD or ISO 8601 format)",
				},
			),
	})
	.catchall(
		// Allow any additional fields (for model-specific filters like status, type, employeeId, etc.)
		z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
	)
	.refine(
		(data) => {
			if (!data.dateFrom || !data.dateTo) return true;
			return new Date(data.dateFrom) <= new Date(data.dateTo);
		},
		{
			message: "dateFrom must be before or equal to dateTo",
			path: ["dateFrom"],
		},
	);

// Main metrics request schema
export const MetricsRequestSchema = z
	.object({
		model: AVAILABLE_MODELS,
		data: z
			.array(ALL_METRICS)
			.min(1, "At least one metric must be requested")
			.max(10, "Maximum 10 metrics can be requested at once"),
		filter: FilterSchema.optional(),
	})
	.refine(
		(data) => {
			// Validate that requested metrics are available for the specified model
			let availableMetrics: readonly string[];
			if (data.model === "Request") {
				availableMetrics = REQUEST_METRICS.options;
			} else if (data.model === "Attendance") {
				availableMetrics = ATTENDANCE_METRICS.options;
			} else if (data.model === "CalendarItem") {
				availableMetrics = CALENDAR_ITEM_METRICS.options;
			} else if (data.model === "Employee") {
				availableMetrics = EMPLOYEE_METRICS.options;
			} else if (data.model === "PayrollPeriod") {
				availableMetrics = PAYROLL_PERIOD_METRICS.options;
			} else if (data.model === "Timesheet") {
				availableMetrics = TIMESHEET_METRICS.options;
			} else {
				return false;
			}

			const invalidMetrics = data.data.filter(
				(metric) => !(availableMetrics as readonly string[]).includes(metric),
			);

			return invalidMetrics.length === 0;
		},
		{
			message: "One or more requested metrics are not available for the specified model",
			path: ["data"],
		},
	);

// Response schemas for different metric types
export const MetricResponseSchema = z.record(z.any());

export const MetricsResponseSchema = z.object({
	model: AVAILABLE_MODELS,
	requestedMetrics: z.array(ALL_METRICS),
	generatedAt: z.string(),
	filter: FilterSchema.optional(),
	data: z.record(MetricResponseSchema),
});

// Type exports
export type MetricsRequest = z.infer<typeof MetricsRequestSchema>;
export type MetricsResponse = z.infer<typeof MetricsResponseSchema>;
export type DateFilter = z.infer<typeof FilterSchema>;
export type Filter = z.infer<typeof FilterSchema>;
export type AvailableModel = z.infer<typeof AVAILABLE_MODELS>;

// Export individual metric enums for type checking
export {
	AVAILABLE_MODELS,
	REQUEST_METRICS,
	ATTENDANCE_METRICS,
	CALENDAR_ITEM_METRICS,
	EMPLOYEE_METRICS,
	PAYROLL_PERIOD_METRICS,
	TIMESHEET_METRICS,
	ALL_METRICS,
};
