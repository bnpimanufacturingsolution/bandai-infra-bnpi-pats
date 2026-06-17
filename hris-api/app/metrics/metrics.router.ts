import { Router, Request, Response, NextFunction } from "express";

interface IMetricsController {
	getMetrics(req: Request, res: Response, next: NextFunction): Promise<void>;
	getActionMetrics(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IMetricsController): Router => {
	const routes = Router();
	const path = "/metrics";

	/**
	 * @openapi
	 * /api/metrics:
	 *   post:
	 *     summary: Get metrics for a model
	 *     description: Generate metrics for the specified model with optional filters
	 *     tags: [Metrics]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - model
	 *               - data
	 *             properties:
	 *               model:
	 *                 type: string
	 *                 enum: [Request]
	 *                 description: The model to generate metrics for
	 *               data:
	 *                 type: array
	 *                 items:
	 *                   type: string
	 *                 minItems: 1
	 *                 maxItems: 10
	 *                 description: "Array of metric names to generate for the Request model (e.g., totalRequests, statusSummary, allRequests)."
	 *                 example:
	 *                   - "totalRequests"
	 *                   - "statusSummary"
	 *                   - "allRequests"
	 *               filter:
	 *                 type: object
	 *                 description: Optional filters including dateFrom, dateTo, and model-specific fields
	 *                 properties:
	 *                   dateFrom:
	 *                     type: string
	 *                     format: date
	 *                     description: Start date for filtering (YYYY-MM-DD)
	 *                     example: "2025-10-20"
	 *                   dateTo:
	 *                     type: string
	 *                     format: date
	 *                     description: End date for filtering (YYYY-MM-DD)
	 *                     example: "2025-10-27"
	 *                   status:
	 *                     type: string
	 *                     enum: [PENDING, APPROVED, REJECTED, CANCELLED]
	 *                     description: Filter by request status
	 *                   type:
	 *                     type: string
	 *                     enum: [LEAVE, OVERTIME, TIME_ADJUSTMENT, EXPENSE_REIMBURSEMENT, DOCUMENT_REQUEST, OTHER]
	 *                     description: Filter by request type (for Request model only)
	 *                 example:
	 *                   dateFrom: "2025-10-20"
	 *                   dateTo: "2025-10-27"
	 *                   status: "PENDING"
	 *     responses:
	 *       200:
	 *         description: Metrics generated successfully
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
	 *                     filter:
	 *                       type: object
	 *                     metrics:
	 *                       type: object
	 *                       additionalProperties: true
	 *       400:
	 *         description: Bad request - validation failed
	 *       401:
	 *         description: Unauthorized
	 *       500:
	 *         description: Internal server error
	 */
	// Nested router for standard metrics
	routes.post("/", controller.getMetrics);

	/**
	 * @openapi
	 * /api/metrics/actions:
	 *   get:
	 *     summary: Get aggregated action counts for the authenticated user
	 *     description: Returns lightweight action metrics for sidebar badges and shared action summaries
	 *     tags: [Metrics]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Action metrics retrieved successfully
	 *       400:
	 *         description: Missing employee context
	 *       401:
	 *         description: Unauthorized
	 *       500:
	 *         description: Internal server error
	 */
	routes.get("/actions", controller.getActionMetrics);

	/**
	 * @openapi
	 * /api/metrics/eligibility:
	 *   post:
	 *     summary: Get eligibility metrics and candidates
	 *     description: Retrieve aggregated metrics and paginated list of employees eligible for status changes
	 *     tags: [Metrics]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: false
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               pagination:
	 *                 type: object
	 *                 properties:
	 *                   page:
	 *                     type: integer
	 *                     default: 1
	 *                   limit:
	 *                     type: integer
	 *                     default: 20
	 *               filter:
	 *                 type: object
	 *                 properties:
	 *                   eligibleFor:
	 *                     type: string
	 *                     enum: [PROMOTION, REGULARIZATION, TERMINATION, TRANSFER]
	 *                   departmentId:
	 *                     type: string
	 *     responses:
	 *       200:
	 *         description: Eligibility metrics retrieved successfully
	 */

	// keep the nested mount for standard metrics
	route.use(path, routes);

	return route;
};
