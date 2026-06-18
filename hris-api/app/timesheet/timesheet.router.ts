import { Router, Request, Response, NextFunction } from "express";
import { cache, cacheShort, cacheMedium } from "../../middleware/cache";
import { requestTimeout } from "../../middleware/requestTimeout";
import { config } from "../../config/config";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	action(req: Request, res: Response, next: NextFunction): Promise<void>;
	submit(req: Request, res: Response, next: NextFunction): Promise<void>;
	view(req: Request, res: Response, next: NextFunction): Promise<void>;
	getConfig(req: Request, res: Response, next: NextFunction): Promise<void>;
	updateConfig(req: Request, res: Response, next: NextFunction): Promise<void>;
	requestEditPermission(req: Request, res: Response, next: NextFunction): Promise<void>;
	requestCurrentEditPermission(req: Request, res: Response, next: NextFunction): Promise<void>;
	reviewEditPermission(req: Request, res: Response, next: NextFunction): Promise<void>;
	consumeEditPermission(req: Request, res: Response, next: NextFunction): Promise<void>;
	normalizeBreakdownPreview(req: Request, res: Response, next: NextFunction): Promise<void>;
	ensurePeriodDrafts(req: Request, res: Response, next: NextFunction): Promise<void>;
	repairCurrentPeriodCoverage(req: Request, res: Response, next: NextFunction): Promise<void>;
	lockPeriodTimesheets(req: Request, res: Response, next: NextFunction): Promise<void>;
	sendReminder(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/timesheet";

	/**
	 * @openapi
	 * /api/timesheet/{id}:
	 *   get:
	 *     summary: Get timesheet by ID or Code
	 *     description: Retrieve a specific timesheet by its unique identifier (MongoDB ObjectId) or unique code with optional field selection. Automatically detects whether the parameter is an ID (24 hex characters) or a code (numeric string).
	 *     tags: [Timesheet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Timesheet ID (MongoDB ObjectId format) or Timesheet Code (YYYYMMDDTTTTTTTTTTT format)
	 *         examples:
	 *           objectId:
	 *             value: "507f1f77bcf86cd799439011"
	 *             summary: MongoDB ObjectId
	 *           code:
	 *             value: "202601141737123456789"
	 *             summary: Timesheet Code
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports nested fields with dot notation)
	 *         example: "id,code,employeeId,status"
	 *     responses:
	 *       200:
	 *         description: Timesheet retrieved successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */


	/**
	 * @openapi
	 * /api/timesheet/view:
	 *   get:
	 *     summary: Get all timesheets (view endpoint)
	 *     description: Retrieve timesheets with advanced filtering, pagination, sorting, field selection, and optional grouping. Includes code field in search.
	 *     tags: [Timesheet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *         description: Page number for pagination
	 *       - in: query
	 *         name: limit
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 10
	 *         description: Number of records per page
	 *       - in: query
	 *         name: order
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: [asc, desc]
	 *           default: desc
	 *         description: Sort order for results
	 *       - in: query
	 *         name: sort
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Field to sort by
	 *         example: "createdAt"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include
	 *       - in: query
	 *         name: search
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Search query to filter timesheets (searches code, notes, employee names)
	 *       - in: query
	 *         name: filter
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: JSON array of filter objects for advanced filtering
	 *       - in: query
	 *         name: groupBy
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Group results by a field name
	 *       - in: query
	 *         name: document
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include timesheet documents in response
	 *       - in: query
	 *         name: pagination
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include pagination metadata in response
	 *       - in: query
	 *         name: count
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include total count in response
	 *     responses:
	 *       200:
	 *         description: Timesheets retrieved successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/view",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const auth = req as Request & {
					organizationId?: string;
					userId?: string;
					metadata?: { employee?: { id?: string } };
				};
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				const orgKey = auth.organizationId || "no-org";
				const userKey = auth.userId || "no-user";
				const employeeKey = auth.metadata?.employee?.id || "no-employee";
				return `cache:timesheet:view:${orgKey}:${userKey}:${employeeKey}:${queryKey}`;
			},
		}),
		controller.view,
	);

	/**
	 * @openapi
	 * /api/timesheet/submit:
	 *   post:
	 *     summary: Submit timesheet for current period
	 *     description: Auto-generates and submits timesheet for the authenticated employee's current payroll period
	 *     tags: [Timesheet]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               notes:
	 *                 type: string
	 *                 description: Optional notes
	 *     responses:
	 *       201:
	 *         description: Timesheet generated and submitted successfully
	 *       200:
	 *         description: Existing timesheet resubmitted successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         description: No current payroll period or attendance records found
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post(
		"/submit",
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "timesheet:submit",
		}),
		controller.submit,
	);
	routes.get("/config", controller.getConfig);
	routes.patch("/config", controller.updateConfig);
	routes.post("/edit-permission/request-current", controller.requestCurrentEditPermission);
	routes.post("/:id/edit-permission/request", controller.requestEditPermission);
	routes.post("/:id/edit-permission/review", controller.reviewEditPermission);
	routes.post("/:id/edit-permission/consume", controller.consumeEditPermission);
	routes.post("/normalize-breakdown-preview", controller.normalizeBreakdownPreview);
	routes.post(
		"/ensure-period-drafts",
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "timesheet:ensure-period-drafts",
		}),
		controller.ensurePeriodDrafts,
	);
	routes.post(
		"/current-period-repair",
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "timesheet:current-period-repair",
		}),
		controller.repairCurrentPeriodCoverage,
	);
	routes.post(
		"/lock-period",
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "timesheet:lock-period",
		}),
		controller.lockPeriodTimesheets,
	);

	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:timesheet:byIdentifier:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/timesheet:
	 *   get:
	 *     summary: Get all timesheets
	 *     description: Retrieve timesheets with advanced filtering, pagination, sorting, field selection, and optional grouping
	 *     tags: [Timesheet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *         description: Page number for pagination
	 *       - in: query
	 *         name: limit
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 10
	 *         description: Number of records per page
	 *       - in: query
	 *         name: order
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: [asc, desc]
	 *           default: desc
	 *         description: Sort order for results
	 *       - in: query
	 *         name: sort
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Field to sort by
	 *         example: "createdAt"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include
	 *       - in: query
	 *         name: search
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Search query to filter timesheets
	 *       - in: query
	 *         name: filter
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: JSON array of filter objects for advanced filtering
	 *       - in: query
	 *         name: groupBy
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Group results by a field name
	 *       - in: query
	 *         name: document
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include timesheet documents in response
	 *       - in: query
	 *         name: pagination
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include pagination metadata in response
	 *       - in: query
	 *         name: count
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include total count in response
	 *     responses:
	 *       200:
	 *         description: Timesheets retrieved successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:timesheet:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/timesheet:
	 *   post:
	 *     summary: Create new timesheet
	 *     description: Create a new timesheet for an employee based on attendance records
	 *     tags: [Timesheet]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - organizationId
	 *               - employeeId
	 *               - periodStart
	 *               - periodEnd
	 *             properties:
	 *               organizationId:
	 *                 type: string
	 *                 description: Organization ID
	 *               employeeId:
	 *                 type: string
	 *                 description: Employee ID
	 *               periodStart:
	 *                 type: string
	 *                 format: date-time
	 *                 description: Start date of timesheet period
	 *               periodEnd:
	 *                 type: string
	 *                 format: date-time
	 *                 description: End date of timesheet period
	 *               attendanceIds:
	 *                 type: array
	 *                 items:
	 *                   type: string
	 *                 description: Array of attendance IDs to include in timesheet
	 *               status:
	 *                 type: string
	 *                 enum: [DRAFT, SUBMITTED, APPROVED, REJECTED, REVISED]
	 *                 default: DRAFT
	 *               notes:
	 *                 type: string
	 *                 description: Optional notes
	 *     responses:
	 *       201:
	 *         description: Timesheet created successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       409:
	 *         description: Timesheet already exists for this period
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/timesheet/{id}:
	 *   patch:
	 *     summary: Update timesheet by ID or Code
	 *     description: Update timesheet data by ID or Code (partial update). Only DRAFT and REVISED timesheets can be updated. Automatically detects whether the parameter is an ID (24 hex characters) or a code (numeric string).
	 *     tags: [Timesheet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Timesheet ID (MongoDB ObjectId format) or Timesheet Code (YYYYMMDDTTTTTTTTTTT format)
	 *         examples:
	 *           objectId:
	 *             value: "507f1f77bcf86cd799439011"
	 *             summary: MongoDB ObjectId
	 *           code:
	 *             value: "202601141737123456789"
	 *             summary: Timesheet Code
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             minProperties: 1
	 *             properties:
	 *               periodStart:
	 *                 type: string
	 *                 format: date-time
	 *               periodEnd:
	 *                 type: string
	 *                 format: date-time
	 *               attendanceIds:
	 *                 type: array
	 *                 items:
	 *                   type: string
	 *               breakdown:
	 *                 type: array
	 *                 description: Daily breakdown array with notes for each day
	 *                 items:
	 *                   type: object
	 *                   properties:
	 *                     date:
	 *                       type: string
	 *                       format: date-time
	 *                     notes:
	 *                       type: string
	 *                       description: Notes for this specific day
	 *               status:
	 *                 type: string
	 *                 enum: [DRAFT, SUBMITTED, APPROVED, REJECTED, REVISED]
	 *               notes:
	 *                 type: string
	 *                 description: General notes for the entire timesheet
	 *     responses:
	 *       200:
	 *         description: Timesheet updated successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.patch("/:id", controller.update);

	/**
	 * @openapi
	 * /api/timesheet/{id}:
	 *   delete:
	 *     summary: Delete timesheet
	 *     description: Soft delete a timesheet by ID
	 *     tags: [Timesheet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Timesheet ID (MongoDB ObjectId format)
	 *     responses:
	 *       200:
	 *         description: Timesheet deleted successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.delete("/:id", controller.remove);
	routes.post("/:id/reminder", controller.sendReminder);

	/**
	 * @openapi
	 * /api/timesheet/{id}/action:
	 *   post:
	 *     summary: Perform action on timesheet
	 *     description: Submit, approve, reject, or revise a timesheet
	 *     tags: [Timesheet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Timesheet ID
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - action
	 *             properties:
	 *               action:
	 *                 type: string
	 *                 enum: [SUBMIT, APPROVE, REJECT, REVISE]
	 *                 description: Action to perform on the timesheet
	 *               rejectionReason:
	 *                 type: string
	 *                 description: Reason for rejection (required for REJECT action)
	 *               notes:
	 *                 type: string
	 *                 description: Additional notes
	 *     responses:
	 *       200:
	 *         description: Action performed successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/:id/action", controller.action);

	route.use(path, routes);

	return route;
};
