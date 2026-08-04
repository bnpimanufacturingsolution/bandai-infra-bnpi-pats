import { Router, Request, Response, NextFunction } from "express";
import { cache, cacheShort, cacheMedium, cacheUser } from "../../middleware/cache";
import { requestTimeout } from "../../middleware/requestTimeout";
import { config } from "../../config/config";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	generatePayroll(req: Request, res: Response, next: NextFunction): Promise<void>;
	previewTimesheetPayroll(req: Request, res: Response, next: NextFunction): Promise<void>;
	generateTimesheetPayroll(req: Request, res: Response, next: NextFunction): Promise<void>;
	requestPauseTimesheetPayroll(req: Request, res: Response, next: NextFunction): Promise<void>;
	requestStopTimesheetPayroll(req: Request, res: Response, next: NextFunction): Promise<void>;
	getTimesheetGenerationProgress(req: Request, res: Response, next: NextFunction): Promise<void>;
	getActiveTimesheetGenerationProgress(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void>;
	getOtReadiness(req: Request, res: Response, next: NextFunction): Promise<void>;
	getOtPersonDetail(req: Request, res: Response, next: NextFunction): Promise<void>;
	getConfig(req: Request, res: Response, next: NextFunction): Promise<void>;
	updateConfig(req: Request, res: Response, next: NextFunction): Promise<void>;
	bulkGenerate(req: Request, res: Response, next: NextFunction): Promise<void>;
	bulkAdjust(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/payrollPeriod";

	routes.get("/config", controller.getConfig);
	routes.patch("/config", controller.updateConfig);
	routes.post("/bulk-generate", controller.bulkGenerate);
	routes.post("/bulk-adjust", controller.bulkAdjust);

	/**
	 * @openapi
	 * /api/payrollPeriod/{id}:
	 *   get:
	 *     summary: Get payrollPeriod by ID
	 *     description: Retrieve a specific payrollPeriod by its unique identifier with optional field selection
	 *     tags: [PayrollPeriod]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: PayrollPeriod ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports nested fields with dot notation)
	 *         example: "id,name,description,type"
	 *     responses:
	 *       200:
	 *         description: PayrollPeriod retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         payrollPeriod:
	 *                           $ref: '#/components/schemas/PayrollPeriod'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache individual payrollPeriod with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:payrollPeriod:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/payrollPeriod:
	 *   get:
	 *     summary: Get all payrollPeriods
	 *     description: Retrieve payrollPeriods with advanced filtering, pagination, sorting, field selection, and optional grouping
	 *     tags: [PayrollPeriod]
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
	 *         example: 1
	 *       - in: query
	 *         name: limit
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 10
	 *         description: Number of records per page
	 *         example: 10
	 *       - in: query
	 *         name: order
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: [asc, desc]
	 *           default: desc
	 *         description: Sort order for results
	 *         example: desc
	 *       - in: query
	 *         name: sort
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Field to sort by or JSON object for multi-field sorting
	 *         example: "createdAt"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports dot notation)
	 *         example: "id,name,description,type"
	 *       - in: query
	 *         name: query
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Search query to filter by name or description
	 *         example: "welcome email"
	 *       - in: query
	 *         name: filter
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: JSON array of filter objects for advanced filtering
	 *         example: '[{"type":"email"},{"isDeleted":false}]'
	 *       - in: query
	 *         name: groupBy
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Group results by a field name
	 *         example: "type"
	 *       - in: query
	 *         name: document
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include payrollPeriod documents in response
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
	 *         description: Templates retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         payrollPeriods:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/PayrollPeriod'
	 *                           description: Present when document="true" and no groupBy
	 *                         groups:
	 *                           type: object
	 *                           additionalProperties:
	 *                             type: array
	 *                             items:
	 *                               $ref: '#/components/schemas/PayrollPeriod'
	 *                           description: Present when groupBy is used and document="true"
	 *                         count:
	 *                           type: integer
	 *                           description: Present when count="true"
	 *                         pagination:
	 *                           $ref: '#/components/schemas/Pagination'
	 *                           description: Present when pagination="true"
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache payrollPeriod list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:payrollPeriod:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/payrollPeriod:
	 *   post:
	 *     summary: Create new payrollPeriod
	 *     description: Create a new payrollPeriod with the provided data
	 *     tags: [PayrollPeriod]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *                 description: PayrollPeriod name
	 *                 example: "Email Welcome PayrollPeriod"
	 *               description:
	 *                 type: string
	 *                 description: PayrollPeriod description
	 *                 example: "Welcome email payrollPeriod for new users"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: PayrollPeriod type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 default: false
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *               isDeleted:
	 *                 type: boolean
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *               isDeleted:
	 *                 type: boolean
	 *     responses:
	 *       201:
	 *         description: PayrollPeriod created successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         payrollPeriod:
	 *                           $ref: '#/components/schemas/PayrollPeriod'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/payrollPeriod/{id}/generate:
	 *   post:
	 *     summary: Generate payroll for all employees
	 *     description: Generate employee payroll records for all active employees in a payroll period
	 *     tags: [PayrollPeriod]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Payroll Period ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Payroll generated successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         generated:
	 *                           type: number
	 *                         errors:
	 *                           type: number
	 *                         total:
	 *                           type: number
	 *                         payrolls:
	 *                           type: array
	 *                           items:
	 *                             type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/:id/generate", controller.generatePayroll);

	/**
	 * @openapi
	 * /api/payrollPeriod/{id}/generate-timesheet:
	 *   post:
	 *     summary: Generate payroll from approved timesheets
	 *     description: Generate employee payroll records from approved timesheets for a payroll period
	 *     tags: [PayrollPeriod]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Payroll Period ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       202:
	 *         description: Payroll generation accepted and running asynchronously
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         jobId:
	 *                           type: string
	 *                         message:
	 *                           type: string
	 *                         total:
	 *                           type: number
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post(
		"/:id/generate-timesheet",
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "payrollperiod:generate-timesheet",
		}),
		controller.generateTimesheetPayroll,
	);

	routes.post(
		"/:id/generate-timesheet/pause",
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "payrollperiod:generate-timesheet-pause",
		}),
		controller.requestPauseTimesheetPayroll,
	);

	routes.post(
		"/:id/generate-timesheet/stop",
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "payrollperiod:generate-timesheet-stop",
		}),
		controller.requestStopTimesheetPayroll,
	);

	routes.get(
		"/:id/generate-timesheet/preview",
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "payrollperiod:generate-timesheet-preview",
		}),
		controller.previewTimesheetPayroll,
	);

	/**
	 * Approved OT readiness for a payroll period (timesheetline / timesheet OT vs attendance OT field).
	 * Not inside generate-timesheet body — separate read for Run Payroll Adjustments accordion.
	 */
	routes.get(
		"/:id/ot-readiness",
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "payrollperiod:ot-readiness",
		}),
		controller.getOtReadiness,
	);

	/**
	 * Compact OT day detail for one timesheet (Run Payroll employee modal).
	 */
	routes.get(
		"/:id/ot-readiness/person/:timesheetId",
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "payrollperiod:ot-person-detail",
		}),
		controller.getOtPersonDetail,
	);

	routes.get("/:id/generate-timesheet/progress", controller.getActiveTimesheetGenerationProgress);

	/**
	 * @openapi
	 * /api/payrollPeriod/generate-timesheet/progress/{jobId}:
	 *   get:
	 *     summary: Get timesheet payroll generation progress
	 *     description: Poll the progress of an ongoing async payroll generation job
	 *     tags: [PayrollPeriod]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: jobId
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Job ID returned from generate-timesheet endpoint
	 *     responses:
	 *       200:
	 *         description: Progress retrieved successfully
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/generate-timesheet/progress/:jobId", controller.getTimesheetGenerationProgress);

	/**
	 * @openapi
	 * /api/payrollPeriod/{id}:
	 *   patch:
	 *     summary: Update payrollPeriod
	 *     description: Update payrollPeriod data by ID (partial update)
	 *     tags: [PayrollPeriod]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: PayrollPeriod ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             minProperties: 1
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *                 description: PayrollPeriod name
	 *                 example: "Updated Email PayrollPeriod"
	 *               description:
	 *                 type: string
	 *                 description: PayrollPeriod description
	 *                 example: "Updated description for the payrollPeriod"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: PayrollPeriod type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 example: false
	 *     responses:
	 *       200:
	 *         description: PayrollPeriod updated successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         payrollPeriod:
	 *                           $ref: '#/components/schemas/PayrollPeriod'
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
	 * /api/payrollPeriod/{id}:
	 *   delete:
	 *     summary: Delete payrollPeriod
	 *     description: Permanently delete a payrollPeriod by ID
	 *     tags: [PayrollPeriod]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: PayrollPeriod ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: PayrollPeriod deleted successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       description: Empty object for successful deletion
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

	route.use(path, routes);

	return route;
};
