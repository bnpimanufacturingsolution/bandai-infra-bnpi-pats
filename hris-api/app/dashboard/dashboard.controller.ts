import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import { buildErrorResponse } from "../../helper/error-handler";
import { METRICS_CONFIG } from "../../config/metrics.config";
import { executeMetricOperation, MetricFilter } from "../../helper/metrics.helper";
import { config } from "../../config/constant";
import { AuthRequest } from "../../middleware/verifyToken";
import {
	isSystemGeneratedDocumentChecklistItem,
} from "../../helper/boarding-documents.helper";
import { getEmployeeDocumentPriorityData } from "../../helper/employee-document-priority.helper";
import { getDashboardActionNeededData } from "../../helper/action-metrics.helper";

const logger = getLogger();
const dashboardLogger = logger.child({ module: "dashboard" });

// Color themes for charts
export const CHART_COLORS = {
	primary: ["#3B82F6", "#1E40AF", "#1E3A8A", "#1E293B"],
	secondary: ["#10B981", "#059669", "#047857", "#065F46"],
	accent: ["#F59E0B", "#D97706", "#B45309", "#92400E"],
	danger: ["#F87171", "#FB7185", "#FBBF24", "#F59E0B"],
	warning: ["#F97316", "#EA580C", "#C2410C", "#9A3412"],
	info: ["#06B6D4", "#0891B2", "#0E7490", "#155E75"],
	success: ["#84CC16", "#65A30D", "#4D7C0F", "#365314"],
	purple: ["#8B5CF6", "#7C3AED", "#6D28D9", "#5B21B6"],
	gradient: {
		blue: ["#3B82F6", "#1E40AF"],
		green: ["#10B981", "#059669"],
		orange: ["#F59E0B", "#D97706"],
		coral: ["#F87171", "#FB7185"],
		purple: ["#8B5CF6", "#7C3AED"],
	},
};

export const DASHBOARD_THEMES = {
	light: {
		background: "#FFFFFF",
		surface: "#F8FAFC",
		text: "#1E293B",
		textSecondary: "#64748B",
		border: "#E2E8F0",
		chartColors: CHART_COLORS.primary,
	},
	dark: {
		background: "#0F172A",
		surface: "#1E293B",
		text: "#F1F5F9",
		textSecondary: "#94A3B8",
		border: "#334155",
		chartColors: ["#60A5FA", "#34D399", "#FBBF24", "#F87171", "#A78BFA"],
	},
	corporate: {
		background: "#FFFFFF",
		surface: "#F1F5F9",
		text: "#1E293B",
		textSecondary: "#475569",
		border: "#CBD5E1",
		chartColors: ["#1E40AF", "#059669", "#F87171", "#D97706", "#7C3AED"],
	},
};

type ActionNeededPriority = "high" | "medium" | "low";
type ActionNeededKind =
	| "TIMESHEET_REMINDER"
	| "PAN_APPROVAL"
	| "NOTIFICATION_UNREAD"
	| "ONBOARDING_DOCUMENT";

interface ActionNeededItem {
	id: string;
	kind: ActionNeededKind;
	title: string;
	description: string;
	priority: ActionNeededPriority;
	statusLabel: string;
	createdAt: string;
	dueDate: string | null;
	targetPath: string;
	metadata: Record<string, any>;
}

export const controller = (prisma: PrismaClient) => {
	const PAN_TYPES = ["REGULARIZATION", "PROMOTION", "TRANSFER", "TERMINATION"];
	const ACTIONABLE_PAN_STATES = ["OPEN", "FOR_APPROVAL", "IN_PROCESS", "SUBMITTED"];

	const getNotificationsPathByRole = (role?: string) => {
		if (role === "hris-hr-manager" || role === "hris-hr-user") {
			return "/hr/notifications";
		}
		return "/employee/notifications";
	};

	const getPanPathByRole = (role?: string, requestId?: string) => {
		const basePath =
			role === "hris-hr-manager" || role === "hris-hr-user"
				? "/hr/requests/personnel-action"
				: "/employee/approvals/personnel-action";

		if (!requestId) return basePath;
		return `${basePath}?action=view&id=${requestId}`;
	};

	const getTimesheetApprovalPathByRole = (
		role?: string,
		timesheetIdOrRequestId?: string | null,
	) => {
		const basePath =
			role === "hris-hr-manager" || role === "hris-hr-user"
				? "/hr/approvals/requests"
				: "/employee/approvals/requests";
		if (!timesheetIdOrRequestId) return basePath;
		return `${basePath}?action=timesheet.review&id=${timesheetIdOrRequestId}`;
	};

	const getNotificationPriority = (type?: string): ActionNeededPriority => {
		const upperType = String(type || "").toUpperCase();
		if (upperType === "ERROR" || upperType === "ALERT") return "high";
		if (upperType === "WARNING" || upperType === "REMINDER") return "medium";
		return "low";
	};

	const getChecklistPriority = (priority?: string | null): ActionNeededPriority => {
		const upperPriority = String(priority || "").trim().toUpperCase();
		if (upperPriority === "CRITICAL" || upperPriority === "HIGH") return "high";
		if (upperPriority === "MEDIUM") return "medium";
		return "low";
	};

	const normalizeDocumentIdentity = (value: unknown) =>
		String(value || "")
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "");

	const getDocumentIdentityKey = (documentTypeId?: string | null, documentCode?: string | null) => {
		const normalizedTypeId = String(documentTypeId || "").trim();
		if (normalizedTypeId) return `id:${normalizedTypeId}`;

		const normalizedCode = normalizeDocumentIdentity(documentCode);
		return normalizedCode ? `code:${normalizedCode}` : "";
	};

	const getDocumentActionPriority = (priorityState?: string | null): ActionNeededPriority => {
		const normalizedState = String(priorityState || "").trim().toLowerCase();
		if (normalizedState === "missing_required") return "high";
		if (normalizedState === "needs_update") return "medium";
		return "low";
	};

	const buildDocumentActionTitle = (params: {
		priorityState?: string | null;
		displayName?: string | null;
		actionLabel?: string | null;
	}) => {
		if (String(params.priorityState || "").trim().toLowerCase() === "optional") {
			return "Optional document recommended";
		}
		const safeName = String(params.displayName || "required document").trim() || "required document";
		const actionLabel = String(params.actionLabel || "").trim().toLowerCase();
		if (actionLabel === "update") return `Update ${safeName}`;
		return `Complete ${safeName}`;
	};

	const buildDocumentActionDescription = (params: {
		priorityState?: string | null;
		displayName?: string | null;
		actionLabel?: string | null;
		actionDescription?: string | null;
	}) => {
		const safeName = String(params.displayName || "This document").trim() || "This document";
		if (String(params.priorityState || "").trim().toLowerCase() === "optional") {
			return `${safeName}: Add this when applicable.`;
		}
		const actionDescription = String(params.actionDescription || "").trim();
		if (actionDescription) {
			return `${safeName}: ${actionDescription}.`;
		}
		return `${safeName} needs your action.`;
	};

	const buildDocumentTargetPath = (params: {
		employeeId: string;
		priorityState?: string | null;
		documentCode?: string | null;
		documentNumber?: string | null;
	}) => {
		const documentNumber = String(params.documentNumber || "").trim();
		if (
			documentNumber &&
			["needs_update", "optional"].includes(
				String(params.priorityState || "").trim().toLowerCase(),
			)
		) {
			return `/employee/${params.employeeId}?tab=documents&action=edit-doc&documentNumber=${encodeURIComponent(
				documentNumber,
			)}`;
		}

		const documentCode = String(params.documentCode || "").trim();
		return `/employee/${params.employeeId}?tab=documents&action=add-doc${
			documentCode ? `&documentType=${encodeURIComponent(documentCode)}` : ""
		}`;
	};

	const buildSummary = (items: ActionNeededItem[]) => {
		return {
			total: items.length,
			high: items.filter((item) => item.priority === "high").length,
			medium: items.filter((item) => item.priority === "medium").length,
			low: items.filter((item) => item.priority === "low").length,
		};
	};

	const getPriorityOrder = (priority: ActionNeededPriority) => {
		if (priority === "high") return 0;
		if (priority === "medium") return 1;
		return 2;
	};

	const getActionNeededSortTime = (item: ActionNeededItem) => {
		const createdAtTime = new Date(item.createdAt).getTime();
		return Number.isNaN(createdAtTime) ? 0 : createdAtTime;
	};

	const toIsoStringOrNull = (value?: Date | string | null) => {
		if (!value) return null;
		const date = value instanceof Date ? value : new Date(value);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	};

	const compareActionNeededItems = (left: ActionNeededItem, right: ActionNeededItem) => {
		const createdAtDelta = getActionNeededSortTime(right) - getActionNeededSortTime(left);
		if (createdAtDelta !== 0) return createdAtDelta;

		const dueDateDelta =
			new Date(left.dueDate || "").getTime() - new Date(right.dueDate || "").getTime();
		if (!Number.isNaN(dueDateDelta) && dueDateDelta !== 0) return dueDateDelta;

		const priorityDelta = getPriorityOrder(left.priority) - getPriorityOrder(right.priority);
		if (priorityDelta !== 0) return priorityDelta;

		return String(left.id).localeCompare(String(right.id));
	};

	const getActionNeeded = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actionData = await getDashboardActionNeededData({
				prisma,
				authReq: req as AuthRequest,
			});

			const successResponse = buildSuccessResponse(
				"Action needed items retrieved successfully",
				{
					summary: actionData.summary,
					items: actionData.items,
				},
			);

			res.status(200).json(successResponse);
		} catch (error: any) {
			if (String(error?.message || "").includes("Employee context is required")) {
				const errorResponse = buildErrorResponse(String(error.message), 400);
				res.status(400).json(errorResponse);
				return;
			}
			dashboardLogger.error("Error fetching action needed items:", error);
			const errorResponse = buildErrorResponse("Failed to fetch action needed items", 500);
			res.status(500).json(errorResponse);
		}
	};

	// Get dashboard overview statistics
	const getOverview = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			dashboardLogger.info("Fetching dashboard overview statistics");

			// Calculate date range for this month
			const now = new Date();
			const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
			startOfMonth.setUTCHours(0, 0, 0, 0);
			const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
			endOfMonth.setUTCHours(23, 59, 59, 999);

			const [
				totalEmployees,
				activeEmployees,
				totalDepartments,
				totalPositions,
				newHiresThisMonth,
				// totalPerformanceReviews, // Commented out until PerformanceReview model is implemented
			] = await Promise.all([
				prisma.employee.count({ where: { isDeleted: false } }),
				prisma.employee.count({
					where: { employmentStatus: "ACTIVE", isDeleted: false },
				}),
				prisma.department.count({ where: { isDeleted: false } }),
				prisma.position.count({ where: { isActive: true, isDeleted: false } }),
				prisma.employee.count({
					where: {
						employmentHireDate: {
							gte: startOfMonth,
							lte: endOfMonth,
						},
						isDeleted: false,
					},
				}),
				// prisma.performanceReview.count({ where: { status: "IN_PROGRESS" } }), // Commented out until PerformanceReview model is implemented
			]);

			const overview = {
				totalEmployees,
				activeEmployees,
				inactiveEmployees: totalEmployees - activeEmployees,
				totalDepartments,
				totalPositions,
				newHiresThisMonth,
				// totalPerformanceReviews, // Commented out until PerformanceReview model is implemented
				employeeRetentionRate:
					totalEmployees > 0 ? ((activeEmployees / totalEmployees) * 100).toFixed(1) : 0,
			};

			dashboardLogger.info("Dashboard overview statistics retrieved successfully");

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DASHBOARD?.OVERVIEW_RETRIEVED ||
					"Dashboard overview retrieved successfully",
				{ overview },
			);

			res.status(200).json(successResponse);
		} catch (error) {
			dashboardLogger.error("Error fetching dashboard overview:", error);
			const errorResponse = buildErrorResponse("Failed to fetch dashboard overview", 500);
			res.status(500).json(errorResponse);
		}
	};

	// Get employee statistics by department
	const getEmployeeStatsByDepartment = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			dashboardLogger.info("Fetching employee statistics by department");

			const employeeStats = await prisma.department.findMany({
				select: {
					id: true,
					name: true,
					employees: {
						select: {
							id: true,
							employmentStatus: true,
						},
					},
				},
			});

			const departmentStats = employeeStats.map((dept) => ({
				departmentId: dept.id,
				departmentName: dept.name,
				totalEmployees: dept.employees.length,
				activeEmployees: dept.employees.filter(
					(emp: any) => emp.employmentStatus === "ACTIVE",
				).length,
				inactiveEmployees: dept.employees.filter(
					(emp: any) => emp.employmentStatus === "INACTIVE",
				).length,
			}));

			dashboardLogger.info("Employee statistics by department retrieved successfully");

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DASHBOARD?.DEPARTMENT_STATS_RETRIEVED ||
					"Department statistics retrieved successfully",
				{ departmentStats },
			);

			res.status(200).json(successResponse);
		} catch (error) {
			dashboardLogger.error("Error fetching department statistics:", error);
			const errorResponse = buildErrorResponse("Failed to fetch department statistics", 500);
			res.status(500).json(errorResponse);
		}
	};

	// Get attendance trends
	const getAttendanceTrends = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const { period = "30", groupBy = "day" } = req.query;
			const days = parseInt(period as string);

			dashboardLogger.info(`Fetching attendance trends for last ${days} days`);

			const startDate = new Date();
			startDate.setDate(startDate.getDate() - days);

			const attendanceData = await prisma.attendance.findMany({
				where: {
					createdAt: {
						gte: startDate,
					},
				},
				select: {
					createdAt: true,
					status: true,
					timeIn: true,
					timeOut: true,
				},
			});

			// Group by day/week/month
			const groupedData = attendanceData.reduce((acc: any, record) => {
				let key: string;

				// Skip records with null dates
				if (!record.createdAt) {
					return acc;
				}

				const date = new Date(record.createdAt);

				if (groupBy === "week") {
					const weekStart = new Date(date);
					weekStart.setDate(date.getDate() - date.getDay());
					key = weekStart.toISOString().split("T")[0];
				} else if (groupBy === "month") {
					key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
				} else {
					key = date.toISOString().split("T")[0];
				}

				if (!acc[key]) {
					acc[key] = { present: 0, absent: 0, leave: 0, total: 0 };
				}

				acc[key].total++;
				if (record.status === "PRESENT") acc[key].present++;
				else if (record.status === "LEAVE") acc[key].leave++;
			}, {});

			const trends = Object.entries(groupedData).map(([date, stats]: [string, any]) => ({
				date,
				present: stats.present,
				leave: stats.leave,
				total: stats.total,
				attendanceRate:
					stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(1) : 0,
			}));

			dashboardLogger.info("Attendance trends retrieved successfully");

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DASHBOARD?.ATTENDANCE_TRENDS_RETRIEVED ||
					"Attendance trends retrieved successfully",
				{ trends, period: days, groupBy },
			);

			res.status(200).json(successResponse);
		} catch (error) {
			dashboardLogger.error("Error fetching attendance trends:", error);
			const errorResponse = buildErrorResponse("Failed to fetch attendance trends", 500);
			res.status(500).json(errorResponse);
		}
	};

	// Get performance metrics - COMMENTED OUT until Performance model is implemented
	/*
	const getPerformanceMetrics = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const { period = "6" } = req.query;
			const months = parseInt(period as string);

			dashboardLogger.info(`Fetching performance metrics for last ${months} months`);

			const startDate = new Date();
			startDate.setMonth(startDate.getMonth() - months);

			const performanceData = await prisma.performance.findMany({
				where: {
					// Since Performance model doesn't have createdAt, we'll use a different approach
					// We'll get all performance records and filter by period
				},
				select: {
					overallRating: true,
					period: true,
					employee: {
						select: {
							department: {
								select: {
									name: true,
								},
							},
						},
					},
				},
			});

			// Group by month and department
			const monthlyPerformance = performanceData.reduce((acc: any, record: any) => {
				// Use period field instead of createdAt since Performance model doesn't have createdAt
				const month = record.period.substring(0, 7); // Assuming period is in YYYY-MM format
				const department = record.employee?.department?.name || "Unassigned";

				if (!acc[month]) {
					acc[month] = {};
				}

				if (!acc[month][department]) {
					acc[month][department] = {
						total: 0,
						count: 0,
						average: 0,
					};
				}

				acc[month][department].total += record.overallRating || 0;
				acc[month][department].count++;
				acc[month][department].average =
					acc[month][department].total / acc[month][department].count;
			}, {});

			// Overall performance distribution
			const ratingDistribution = performanceData.reduce((acc: any, record: any) => {
				const rating = record.overallRating;
				if (rating !== null && rating !== undefined) {
					const range = Math.floor(rating);
					const key = `${range}-${range + 1}`;
					acc[key] = (acc[key] || 0) + 1;
				}
				return acc;
			}, {});

			dashboardLogger.info("Performance metrics retrieved successfully");

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DASHBOARD?.PERFORMANCE_METRICS_RETRIEVED ||
					"Performance metrics retrieved successfully",
				{
					monthlyPerformance,
					ratingDistribution,
					overallAverage:
						performanceData.length > 0
							? (
									performanceData.reduce(
										(sum: any, record: any) => sum + (record.overallRating || 0),
										0,
									) / performanceData.length
								).toFixed(2)
							: 0,
					totalReviews: performanceData.length,
					period: months,
				},
			);

			res.status(200).json(successResponse);
		} catch (error) {
			dashboardLogger.error("Error fetching performance metrics:", error);
			const errorResponse = buildErrorResponse("Failed to fetch performance metrics", 500);
			res.status(500).json(errorResponse);
		}
	};
	*/

	// Get chart colors and themes
	const getChartThemes = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const { theme = "light" } = req.query;

			dashboardLogger.info(`Fetching chart themes for ${theme} theme`);

			const selectedTheme =
				DASHBOARD_THEMES[theme as keyof typeof DASHBOARD_THEMES] || DASHBOARD_THEMES.light;

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DASHBOARD?.THEMES_RETRIEVED || "Chart themes retrieved successfully",
				{
					theme: theme,
					colors: selectedTheme,
					allThemes: Object.keys(DASHBOARD_THEMES),
					chartColors: CHART_COLORS,
				},
			);

			res.status(200).json(successResponse);
		} catch (error) {
			dashboardLogger.error("Error fetching chart themes:", error);
			const errorResponse = buildErrorResponse("Failed to fetch chart themes", 500);
			res.status(500).json(errorResponse);
		}
	};

	// Get custom metrics
	const getCustomMetrics = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const { metricType, filters = {} } = req.query;

			dashboardLogger.info(`Fetching custom metrics for type: ${metricType}`);

			const filtersObj = filters as any;
			const filter: MetricFilter = {
				startDate: filtersObj.startDate
					? new Date(filtersObj.startDate as string)
					: undefined,
				endDate: filtersObj.endDate ? new Date(filtersObj.endDate as string) : undefined,
				year: filtersObj.year ? parseInt(filtersObj.year as string) : undefined,
			};

			if (!METRICS_CONFIG[metricType as string]) {
				const errorResponse = buildErrorResponse(
					`Metric type ${metricType} not found`,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			const metricConfig = METRICS_CONFIG[metricType as string];
			const results: any = {};

			for (const operation in metricConfig.operations) {
				try {
					results[operation] = await executeMetricOperation(
						prisma,
						metricConfig.model,
						operation,
						metricConfig,
						filter,
					);
				} catch (error) {
					dashboardLogger.error(`Error executing metric operation ${operation}:`, error);
					results[operation] = null;
				}
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DASHBOARD?.CUSTOM_METRICS_RETRIEVED ||
					"Custom metrics retrieved successfully",
				{
					metricType,
					filters,
					results,
				},
			);

			res.status(200).json(successResponse);
		} catch (error) {
			dashboardLogger.error("Error fetching custom metrics:", error);
			const errorResponse = buildErrorResponse("Failed to fetch custom metrics", 500);
			res.status(500).json(errorResponse);
		}
	};

	return {
		getActionNeeded,
		getOverview,
		getEmployeeStatsByDepartment,
		getAttendanceTrends,
		// getPerformanceMetrics, // Commented out until Performance model is implemented
		getChartThemes,
		getCustomMetrics,
	};
};
