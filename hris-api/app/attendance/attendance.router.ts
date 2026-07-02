import { Router, Request, Response, NextFunction } from "express";
import { cache, cacheShort, cacheMedium, cacheUser } from "../../middleware/cache";
import { uploadImportFile } from "../../middleware/upload";
import { requestTimeout } from "../../middleware/requestTimeout";
import { config } from "../../config/config";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	createCorrection(req: Request, res: Response, next: NextFunction): Promise<void>;
	createBackfill(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	importFromXLSX(req: Request, res: Response, next: NextFunction): Promise<void>;
	importFromUzaroXLSX(req: Request, res: Response, next: NextFunction): Promise<void>;
	getTimekeepingSummary(req: Request, res: Response, next: NextFunction): Promise<void>;
	getImportProgress(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/attendance";

	/**
	 * @openapi
	 * /api/attendance/{id}:
	 *   get:
	 *     summary: Get attendance by ID
	 *     description: Retrieve a specific attendance by its unique identifier with optional field selection
	 *     tags: [Attendance]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Attendance ID (MongoDB ObjectId format)
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
	 *         description: Attendance retrieved successfully
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
	 *                         attendance:
	 *                           $ref: '#/components/schemas/Attendance'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache individual attendance with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:attendance:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/attendance:
	 *   get:
	 *     summary: Get all attendances
	 *     description: Retrieve attendances with advanced filtering, pagination, sorting, field selection, and optional grouping
	 *     tags: [Attendance]
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
	 *         description: Include attendance documents in response
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
	 *                         attendances:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/Attendance'
	 *                           description: Present when document="true" and no groupBy
	 *                         groups:
	 *                           type: object
	 *                           additionalProperties:
	 *                             type: array
	 *                             items:
	 *                               $ref: '#/components/schemas/Attendance'
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
	// Cache attendance list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:attendance:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/attendance:
	 *   post:
	 *     summary: Create new attendance
	 *     description: Create a new attendance with the provided data
	 *     tags: [Attendance]
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
	 *                 description: Attendance name
	 *                 example: "Email Welcome Attendance"
	 *               description:
	 *                 type: string
	 *                 description: Attendance description
	 *                 example: "Welcome email attendance for new users"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: Attendance type for categorization
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
	 *         description: Attendance created successfully
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
	 *                         attendance:
	 *                           $ref: '#/components/schemas/Attendance'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.create);
	routes.post("/backfill", controller.createBackfill);
	routes.post("/corrections", controller.createCorrection);

	/**
	 * @openapi
	 * /api/attendance/{id}:
	 *   patch:
	 *     summary: Update attendance
	 *     description: Update attendance data by ID (partial update)
	 *     tags: [Attendance]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Attendance ID (MongoDB ObjectId format)
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
	 *                 description: Attendance name
	 *                 example: "Updated Email Attendance"
	 *               description:
	 *                 type: string
	 *                 description: Attendance description
	 *                 example: "Updated description for the attendance"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: Attendance type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 example: false
	 *     responses:
	 *       200:
	 *         description: Attendance updated successfully
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
	 *                         attendance:
	 *                           $ref: '#/components/schemas/Attendance'
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
	 * /api/attendance/{id}:
	 *   delete:
	 *     summary: Delete attendance
	 *     description: Permanently delete a attendance by ID
	 *     tags: [Attendance]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Attendance ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Attendance deleted successfully
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

	/**
	 * @openapi
	 * /api/attendance/import:
	 *   post:
	 *     summary: Import attendance from XLSX file (Generalized)
	 *     description: Import attendance records from a standardized Excel file with columns EMPLOYEE_ID, DATE, TIME_IN, TIME_OUT, STATUS, and NOTES (optional).
	 *     tags: [Attendance]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - file
	 *             properties:
	 *               file:
	 *                 type: string
	 *                 format: binary
	 *                 description: XLSX file with columns EMPLOYEE_ID, DATE, TIME_IN, TIME_OUT, STATUS, NOTES
	 *     responses:
	 *       200:
	 *         description: Attendance import completed successfully
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
	 *                         summary:
	 *                           type: object
	 *                           properties:
	 *                             totalRows:
	 *                               type: integer
	 *                             created:
	 *                               type: integer
	 *                             updated:
	 *                               type: integer
	 *                             skipped:
	 *                               type: integer
	 *                             errors:
	 *                               type: array
	 *                               items:
	 *                                 type: string
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post(
		"/import",
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "attendance:import",
		}),
		uploadImportFile,
		controller.importFromXLSX,
	);

	/**
	 * @openapi
	 * /api/attendance/uzaro/import:
	 *   post:
	 *     summary: Import attendance from XLSX file (Uzaro Format - TEMPORARY)
	 *     description: TEMPORARY - Uzaro-specific attendance import. Import attendance records from an Excel file with Person ID and Time columns. The system matches Person ID with employee.deviceEmpId.
	 *     tags: [Attendance]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - file
	 *             properties:
	 *               file:
	 *                 type: string
	 *                 format: binary
	 *                 description: XLSX file containing Person ID and Time columns
	 *     responses:
	 *       200:
	 *         description: Attendance import completed successfully
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
	 *                         summary:
	 *                           type: object
	 *                           properties:
	 *                             totalRows:
	 *                               type: integer
	 *                             processedRows:
	 *                               type: integer
	 *                             created:
	 *                               type: integer
	 *                             updated:
	 *                               type: integer
	 *                             skipped:
	 *                               type: integer
	 *                             errors:
	 *                               type: array
	 *                               items:
	 *                                 type: string
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/uzaro/import", uploadImportFile, controller.importFromUzaroXLSX);

	/**
	 * @openapi
	 * /api/attendance/summary:
	 *   get:
	 *     summary: Get timekeeping summary for an employee
	 *     description: Retrieve aggregated timekeeping metrics (hours worked, overtime, tardiness) for an employee over a date range
	 *     tags: [Attendance]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: employeeId
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Employee ID (MongoDB ObjectId)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: organizationId
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Organization ID
	 *         example: "org123"
	 *       - in: query
	 *         name: startDate
	 *         required: false
	 *         schema:
	 *           type: string
	 *           format: date-time
	 *         description: Start date (defaults to first day of current month)
	 *         example: "2026-01-01"
	 *       - in: query
	 *         name: endDate
	 *         required: false
	 *         schema:
	 *           type: string
	 *           format: date-time
	 *         description: End date (defaults to last day of current month)
	 *         example: "2026-01-31"
	 *     responses:
	 *       200:
	 *         description: Timekeeping summary retrieved successfully
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
	 *                         employeeId:
	 *                           type: string
	 *                         period:
	 *                           type: object
	 *                           properties:
	 *                             startDate:
	 *                               type: string
	 *                               format: date-time
	 *                             endDate:
	 *                               type: string
	 *                               format: date-time
	 *                         totals:
	 *                           type: object
	 *                           properties:
	 *                             regularHours:
	 *                               type: number
	 *                             overtimeHours:
	 *                               type: number
	 *                             undertimeHours:
	 *                               type: number
	 *                             lateMinutes:
	 *                               type: integer
	 *                             earlyOutMinutes:
	 *                               type: integer
	 *                             daysPresent:
	 *                               type: integer
	 *                             daysComplete:
	 *                               type: integer
	 *                         dailyBreakdown:
	 *                           type: array
	 *                           items:
	 *                             type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/summary", controller.getTimekeepingSummary);

	/**
	 * @openapi
	 * /api/attendance/import/progress/{jobId}:
	 *   get:
	 *     summary: Get attendance import progress
	 *     description: Poll the progress of an ongoing attendance import job
	 *     tags: [Attendance]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: jobId
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Job ID returned from import endpoint
	 *         example: "550e8400-e29b-41d4-a716-446655440000"
	 *     responses:
	 *       200:
	 *         description: Import progress retrieved successfully
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
	 *                         status:
	 *                           type: string
	 *                           enum: [processing, completed, failed]
	 *                         total:
	 *                           type: integer
	 *                         processed:
	 *                           type: integer
	 *                         success:
	 *                           type: integer
	 *                         failed:
	 *                           type: integer
	 *                         errors:
	 *                           type: array
	 *                           items:
	 *                             type: object
	 *                             properties:
	 *                               row:
	 *                                 type: integer
	 *                               employeeId:
	 *                                 type: string
	 *                               error:
	 *                                 type: string
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/import/progress/:jobId", controller.getImportProgress);


	route.use(path, routes);

	return route;
};
