import { Router, Request, Response, NextFunction } from "express";

interface IDashboardController {
	getActionNeeded(req: Request, res: Response, next: NextFunction): Promise<void>;
	getOverview(req: Request, res: Response, next: NextFunction): Promise<void>;
	getEmployeeStatsByDepartment(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAttendanceTrends(req: Request, res: Response, next: NextFunction): Promise<void>;
	// getPayrollAnalytics(req: Request, res: Response, next: NextFunction): Promise<void>; // Commented out - no payroll model
	// getPerformanceMetrics(req: Request, res: Response, next: NextFunction): Promise<void>; // Commented out until Performance model is implemented
	getChartThemes(req: Request, res: Response, next: NextFunction): Promise<void>;
	getCustomMetrics(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IDashboardController): Router => {
	const routes = Router();
	const path = "/dashboard";

	/**
	 * @openapi
	 * /api/dashboard/action-needed:
	 *   get:
	 *     summary: Get dashboard action-needed items for current user
	 *     description: Returns normalized actionable items such as timesheet reminders, assigned PAN approvals, and unread notifications
	 *     tags: [Dashboard]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Action needed items retrieved successfully
	 *       400:
	 *         description: Missing employee context
	 *       401:
	 *         description: Unauthorized
	 *       500:
	 *         description: Internal server error
	 */
	routes.get("/action-needed", controller.getActionNeeded);

	/**
	 * @openapi
	 * /api/dashboard/overview:
	 *   get:
	 *     summary: Get dashboard overview statistics
	 *     description: Retrieve key statistics and metrics for the admin dashboard overview
	 *     tags: [Dashboard]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Dashboard overview retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *                 message:
	 *                   type: string
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     overview:
	 *                       type: object
	 *                       properties:
	 *                         totalEmployees:
	 *                           type: integer
	 *                         activeEmployees:
	 *                           type: integer
	 *                         inactiveEmployees:
	 *                           type: integer
	 *                         totalDepartments:
	 *                           type: integer
	 *                         totalPositions:
	 *                           type: integer
	 *                         totalBenefits:
	 *                           type: integer
	 *                         pendingLeaveApplications:
	 *                           type: integer
	 *                         activePayrollPeriods:
	 *                           type: integer
	 *                         totalPerformanceReviews:
	 *                           type: integer
	 *                         employeeRetentionRate:
	 *                           type: string
	 *       401:
	 *         description: Unauthorized
	 *       500:
	 *         description: Internal server error
	 */
	routes.get("/overview", controller.getOverview);

	/**
	 * @openapi
	 * /api/dashboard/employee-stats-by-department:
	 *   get:
	 *     summary: Get employee statistics by department
	 *     description: Retrieve employee count and status statistics grouped by department
	 *     tags: [Dashboard]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Department statistics retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *                 message:
	 *                   type: string
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     departmentStats:
	 *                       type: array
	 *                       items:
	 *                         type: object
	 *                         properties:
	 *                           departmentId:
	 *                             type: string
	 *                           departmentName:
	 *                             type: string
	 *                           totalEmployees:
	 *                             type: integer
	 *                           activeEmployees:
	 *                             type: integer
	 *                           inactiveEmployees:
	 *                             type: integer
	 *       401:
	 *         description: Unauthorized
	 *       500:
	 *         description: Internal server error
	 */
	routes.get("/employee-stats-by-department", controller.getEmployeeStatsByDepartment);

	/**
	 * @openapi
	 * /api/dashboard/attendance-trends:
	 *   get:
	 *     summary: Get attendance trends
	 *     description: Retrieve attendance trends data for charts and analytics
	 *     tags: [Dashboard]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: period
	 *         schema:
	 *           type: string
	 *           default: "30"
	 *         description: Number of days to retrieve data for
	 *       - in: query
	 *         name: groupBy
	 *         schema:
	 *           type: string
	 *           enum: [day, week, month]
	 *           default: "day"
	 *         description: Grouping period for the data
	 *     responses:
	 *       200:
	 *         description: Attendance trends retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *                 message:
	 *                   type: string
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     trends:
	 *                       type: array
	 *                       items:
	 *                         type: object
	 *                         properties:
	 *                           date:
	 *                             type: string
	 *                           present:
	 *                             type: integer
	 *                           absent:
	 *                             type: integer
	 *                           late:
	 *                             type: integer
	 *                           total:
	 *                             type: integer
	 *                           attendanceRate:
	 *                             type: string
	 *                     period:
	 *                       type: integer
	 *                     groupBy:
	 *                       type: string
	 *       401:
	 *         description: Unauthorized
	 *       500:
	 *         description: Internal server error
	 */
	routes.get("/attendance-trends", controller.getAttendanceTrends);

	/**
	 * @openapi
	 * /api/dashboard/payroll-analytics:
	 *   get:
	 *     summary: Get payroll analytics
	 *     description: Retrieve payroll analytics and trends for charts
	 *     tags: [Dashboard]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: year
	 *         schema:
	 *           type: integer
	 *           default: 2024
	 *         description: Year for payroll analytics
	 *     responses:
	 *       200:
	 *         description: Payroll analytics retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *                 message:
	 *                   type: string
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     monthlyAnalytics:
	 *                       type: array
	 *                       items:
	 *                         type: object
	 *                         properties:
	 *                           month:
	 *                             type: string
	 *                           totalGrossPay:
	 *                             type: number
	 *                           totalNetPay:
	 *                             type: number
	 *                           totalDeductions:
	 *                             type: number
	 *                           recordCount:
	 *                             type: integer
	 *                           averageGrossPay:
	 *                             type: string
	 *                           averageNetPay:
	 *                             type: string
	 *                     yearlySummary:
	 *                       type: object
	 *                       properties:
	 *                         totalGrossPay:
	 *                           type: number
	 *                         totalNetPay:
	 *                           type: number
	 *                         totalDeductions:
	 *                           type: number
	 *                         totalRecords:
	 *                           type: integer
	 *                     year:
	 *                       type: integer
	 *       401:
	 *         description: Unauthorized
	 *       500:
	 *         description: Internal server error
	 */
	// routes.get("/payroll-analytics", controller.getPayrollAnalytics); // Commented out - no payroll model

	/**
	 * @openapi
	 * /api/dashboard/performance-metrics:
	 *   get:
	 *     summary: Get performance metrics
	 *     description: Retrieve performance metrics and analytics for charts
	 *     tags: [Dashboard]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: period
	 *         schema:
	 *           type: string
	 *           default: "6"
	 *         description: Number of months to retrieve data for
	 *     responses:
	 *       200:
	 *         description: Performance metrics retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *                 message:
	 *                   type: string
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     monthlyPerformance:
	 *                       type: object
	 *                       additionalProperties:
	 *                         type: object
	 *                         additionalProperties:
	 *                           type: object
	 *                           properties:
	 *                             total:
	 *                               type: number
	 *                             count:
	 *                               type: integer
	 *                             average:
	 *                               type: number
	 *                     ratingDistribution:
	 *                       type: object
	 *                       additionalProperties:
	 *                         type: integer
	 *                     overallAverage:
	 *                       type: string
	 *                     totalReviews:
	 *                       type: integer
	 *                     period:
	 *                       type: integer
	 *       401:
	 *         description: Unauthorized
	 *       500:
	 *         description: Internal server error
	 */
	// routes.get("/performance-metrics", controller.getPerformanceMetrics); // Commented out until Performance model is implemented

	/**
	 * @openapi
	 * /api/dashboard/chart-themes:
	 *   get:
	 *     summary: Get chart themes and colors
	 *     description: Retrieve available chart themes and color palettes for dashboard
	 *     tags: [Dashboard]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: theme
	 *         schema:
	 *           type: string
	 *           enum: [light, dark, corporate]
	 *           default: "light"
	 *         description: Theme type to retrieve colors for
	 *     responses:
	 *       200:
	 *         description: Chart themes retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *                 message:
	 *                   type: string
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     theme:
	 *                       type: string
	 *                     colors:
	 *                       type: object
	 *                       properties:
	 *                         background:
	 *                           type: string
	 *                         surface:
	 *                           type: string
	 *                         text:
	 *                           type: string
	 *                         textSecondary:
	 *                           type: string
	 *                         border:
	 *                           type: string
	 *                         chartColors:
	 *                           type: array
	 *                           items:
	 *                             type: string
	 *                     allThemes:
	 *                       type: array
	 *                       items:
	 *                         type: string
	 *                     chartColors:
	 *                       type: object
	 *                       properties:
	 *                         primary:
	 *                           type: array
	 *                           items:
	 *                             type: string
	 *                         secondary:
	 *                           type: array
	 *                           items:
	 *                             type: string
	 *                         accent:
	 *                           type: array
	 *                           items:
	 *                             type: string
	 *                         danger:
	 *                           type: array
	 *                           items:
	 *                             type: string
	 *                         warning:
	 *                           type: array
	 *                           items:
	 *                             type: string
	 *                         info:
	 *                           type: array
	 *                           items:
	 *                             type: string
	 *                         success:
	 *                           type: array
	 *                           items:
	 *                             type: string
	 *                         purple:
	 *                           type: array
	 *                           items:
	 *                             type: string
	 *                         gradient:
	 *                           type: object
	 *                           properties:
	 *                             blue:
	 *                               type: array
	 *                               items:
	 *                                 type: string
	 *                             green:
	 *                               type: array
	 *                               items:
	 *                                 type: string
	 *                             orange:
	 *                               type: array
	 *                               items:
	 *                                 type: string
	 *                             red:
	 *                               type: array
	 *                               items:
	 *                                 type: string
	 *                             purple:
	 *                               type: array
	 *                               items:
	 *                                 type: string
	 *       401:
	 *         description: Unauthorized
	 *       500:
	 *         description: Internal server error
	 */
	routes.get("/chart-themes", controller.getChartThemes);

	/**
	 * @openapi
	 * /api/dashboard/custom-metrics:
	 *   get:
	 *     summary: Get custom metrics
	 *     description: Retrieve custom metrics based on predefined configurations
	 *     tags: [Dashboard]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: metricType
	 *         required: true
	 *         schema:
	 *           type: string
	 *           enum: [employeeMetrics, attendanceMetrics, payrollMetrics, performanceMetrics, leaveMetrics, departmentMetrics, positionMetrics, benefitMetrics, workScheduleMetrics]
	 *         description: Type of metrics to retrieve
	 *       - in: query
	 *         name: filters
	 *         schema:
	 *           type: object
	 *         description: Additional filters for the metrics
	 *         example: {"startDate": "2024-01-01", "endDate": "2024-12-31", "year": 2024}
	 *     responses:
	 *       200:
	 *         description: Custom metrics retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *                 message:
	 *                   type: string
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     metricType:
	 *                       type: string
	 *                     filters:
	 *                       type: object
	 *                     results:
	 *                       type: object
	 *                       additionalProperties: true
	 *       400:
	 *         description: Bad request - invalid metric type
	 *       401:
	 *         description: Unauthorized
	 *       404:
	 *         description: Metric type not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.get("/custom-metrics", controller.getCustomMetrics);

	route.use(path, routes);
	return route;
};
