import { Router, Request, Response, NextFunction } from "express";
import { cache, cacheShort, cacheMedium, cacheUser } from "../../middleware/cache";
import { uploadImportFile, uploadDocument, uploadEmployeeDocuments } from "../../middleware/upload";
import { requestTimeout } from "../../middleware/requestTimeout";
import { config } from "../../config/config";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	searchEmployees(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	reserveEmployeeId(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	updateReportTo(req: Request, res: Response, next: NextFunction): Promise<void>;
	setActiveEmployeeSchedule(req: Request, res: Response, next: NextFunction): Promise<void>;
	getEmployeeSchedules(req: Request, res: Response, next: NextFunction): Promise<void>;
	deactivateEmployeeSchedule(req: Request, res: Response, next: NextFunction): Promise<void>;
	getTeamScheduleCalendar(req: Request, res: Response, next: NextFunction): Promise<void>;
	getTeamScheduleCalendarGrid(req: Request, res: Response, next: NextFunction): Promise<void>;
	getTeamScheduleCollections(req: Request, res: Response, next: NextFunction): Promise<void>;
	createTeamScheduleCollection(req: Request, res: Response, next: NextFunction): Promise<void>;
	updateTeamScheduleCollection(req: Request, res: Response, next: NextFunction): Promise<void>;
	archiveTeamScheduleCollection(req: Request, res: Response, next: NextFunction): Promise<void>;
	applyTeamScheduleLedgerRotation(req: Request, res: Response, next: NextFunction): Promise<void>;
	overrideTeamScheduleLedger(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	markAttendance(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAttendanceRecords(req: Request, res: Response, next: NextFunction): Promise<void>;
	getTodayAttendance(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAttendanceById(req: Request, res: Response, next: NextFunction): Promise<void>;
	updateAttendance(req: Request, res: Response, next: NextFunction): Promise<void>;
	deleteAttendance(req: Request, res: Response, next: NextFunction): Promise<void>;
	debugDeleteTodayAttendance(req: Request, res: Response, next: NextFunction): Promise<void>;
	getManagedDepartments(req: Request, res: Response, next: NextFunction): Promise<void>;
	getManagedDepartmentById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getEmployeeDepartment(req: Request, res: Response, next: NextFunction): Promise<void>;
	importEmployees(req: Request, res: Response, next: NextFunction): Promise<void>;
	getImportProgress(req: Request, res: Response, next: NextFunction): Promise<void>;
	getEmployeesByUserRole(req: Request, res: Response, next: NextFunction): Promise<void>;
	uploadDocument(req: Request, res: Response, next: NextFunction): Promise<void>;
	updateDocument(req: Request, res: Response, next: NextFunction): Promise<void>;
	reviewDocument(req: Request, res: Response, next: NextFunction): Promise<void>;
	deleteDocument(req: Request, res: Response, next: NextFunction): Promise<void>;
	getDocumentPriorities(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/employee";

	/**
	 * @openapi
	 * /api/employee/by-role:
	 *   get:
	 *     summary: Get employees filtered by user roles
	 *     description: Retrieve employees filtered by their user roles from auth service
	 *     tags: [Employee]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: roles
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of role names to filter (defaults to hris-hr-manager,hris-hr-user)
	 *         example: "hris-hr-manager,hris-hr-user"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports nested fields with dot notation)
	 *         example: "id,employeeId,personId"
	 *       - in: query
	 *         name: include
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of related data to include (level, reportTo)
	 *         example: "level,reportTo"
	 *     responses:
	 *       200:
	 *         description: Employees retrieved successfully by user roles
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
	 *                         employees:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/Employee'
	 *                         count:
	 *                           type: integer
	 *                           description: Total number of employees found
	 *                         filteredRoles:
	 *                           type: array
	 *                           items:
	 *                             type: string
	 *                           description: List of roles used for filtering
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/by-role",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:employee:by-role:${queryKey}`;
			},
		}),
		controller.getEmployeesByUserRole,
	);

	/**
	 * @openapi
	 * /api/employee/{id}:
	 *   get:
	 *     summary: Get employee by ID
	 *     description: Retrieve a specific employee by its unique identifier with optional field selection
	 *     tags: [Employee]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Employee ID (MongoDB ObjectId format)
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
	 *         description: Employee retrieved successfully
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
	 *                         employee:
	 *                           $ref: '#/components/schemas/Employee'
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
	 * /api/employee/search:
	 *   get:
	 *     summary: Search employees (integration endpoint)
	 *     description: >
	 *       Lightweight, integration-friendly employee search for external applications.
	 *       Multi-word terms are AND-matched case-insensitively against employeeId,
	 *       first/middle/last name, and email. Fuzzy ranking (typo-tolerant,
	 *       bounded edit distance per word) runs after exact matches; relevance
	 *       order is exact rows first, then fuzzy by score. Returns a flat,
	 *       reduced payload (no payroll/salary data). Accepts either a standard
	 *       Bearer token or an integration API key via the X-API-Key header
	 *       (server env: INTEGRATION_API_KEYS, comma-separated, fail-closed).
	 *     tags: [Employee]
	 *     security:
	 *       - bearerAuth: []
	 *       - apiKey: []
	 *     parameters:
	 *       - in: query
	 *         name: query
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Search text (aliases q, search). Multi-word supported.
	 *         example: "zen andrei"
	 *       - in: query
	 *         name: page
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *         description: 1-based page number (default 1)
	 *         example: 1
	 *       - in: query
	 *         name: limit
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *         description: Results per page (default 10, cap 100)
	 *         example: 10
	 *       - in: query
	 *         name: sort
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: [relevance, employeeId, employeeId:desc, fullName, fullName:desc]
	 *         description: Result order (default relevance = exact first, then fuzzy score)
	 *         example: relevance
	 *       - in: query
	 *         name: employmentStatus
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Optional exact employment status filter (e.g. ACTIVE)
	 *         example: "ACTIVE"
	 *       - in: query
	 *         name: employmentType
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Optional exact employment type filter (e.g. REGULAR)
	 *         example: "REGULAR"
	 *       - in: query
	 *         name: departmentId
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Optional exact department id filter
	 *       - in: query
	 *         name: positionId
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Optional exact position id filter
	 *     responses:
	 *       200:
	 *         description: Employee search completed successfully
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
	 *                         employees:
	 *                           type: array
	 *                           items:
	 *                             type: object
	 *                             properties:
	 *                               id:
	 *                                 type: string
	 *                               employeeId:
	 *                                 type: string
	 *                               fullName:
	 *                                 type: string
	 *                               email:
	 *                                 type: string
	 *                                 nullable: true
	 *                               employmentStatus:
	 *                                 type: string
	 *                               employmentType:
	 *                                 type: string
	 *                                 nullable: true
	 *                               department:
	 *                                 type: object
	 *                                 nullable: true
	 *                               position:
	 *                                 type: object
	 *                                 nullable: true
	 *                         count:
	 *                           type: integer
	 *                         pagination:
	 *                           type: object
	 *                           properties:
	 *                             total:
	 *                               type: integer
	 *                             page:
	 *                               type: integer
	 *                             limit:
	 *                               type: integer
	 *                             totalPages:
	 *                               type: integer
	 *                             hasNext:
	 *                               type: boolean
	 *                             hasPrev:
	 *                               type: boolean
	 *                         sort:
	 *                           type: string
	 *                         fuzzy:
	 *                           type: integer
	 *                           description: Number of rows matched only via fuzzy (typo) ranking
	 *                         query:
	 *                           type: string
	 *                         limit:
	 *                           type: integer
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Registered BEFORE /:id so "search" is not captured as an id
	routes.get(
		"/search",
		cache({
			ttl: 30,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:employee:search:${queryKey}`;
			},
		}),
		controller.searchEmployees,
	);

	// Cache individual employee with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:employee:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/employee:
	 *   get:
	 *     summary: Get all employees
	 *     description: Retrieve employees with advanced filtering, pagination, sorting, field selection, and optional grouping
	 *     tags: [Employee]
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
	 *         description: Include employee documents in response
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
	 *                         employees:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/Employee'
	 *                           description: Present when document="true" and no groupBy
	 *                         groups:
	 *                           type: object
	 *                           additionalProperties:
	 *                             type: array
	 *                             items:
	 *                               $ref: '#/components/schemas/Employee'
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
	// Cache employee list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:employee:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	routes.post("/reserve-id", controller.reserveEmployeeId);

	/**
	 * @openapi
	 * /api/employee:
	 *   post:
	 *     summary: Create new employee
	 *     description: Create a new employee with the provided data
	 *     tags: [Employee]
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
	 *                 description: Employee name
	 *                 example: "Email Welcome Employee"
	 *               description:
	 *                 type: string
	 *                 description: Employee description
	 *                 example: "Welcome email employee for new users"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: Employee type for categorization
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
	 *         description: Employee created successfully
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
	 *                         employee:
	 *                           $ref: '#/components/schemas/Employee'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	/**
	 * @openapi
	 * /api/employee/import:
	 *   post:
	 *     summary: Import employees from CSV data
	 *     description: Bulk import employees with person and employment data
	 *     tags: [Employee]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - rows
	 *               - scheduleId
	 *               - roleId
	 *             properties:
	 *               rows:
	 *                 type: array
	 *                 description: Array of employee data rows from CSV
	 *                 items:
	 *                   type: object
	 *                   required:
	 *                     - EMP_ID
	 *                     - NAME
	 *                     - POSITION
	 *                     - LEVEL
	 *                     - DEPARTMENT
	 *                     - TIN
	 *                     - SSS
	 *                     - PHILHEALTH
	 *                     - PAGIBIG
	 *                     - HIRE_DATE
	 *                     - BASIC_SALARY
	 *               scheduleId:
	 *                 type: string
	 *                 description: Default schedule ID for imported employees
	 *               roleId:
	 *                 type: string
	 *                 description: Default role ID for imported employees
	 *     responses:
	 *       200:
	 *         description: Import completed
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post(
		"/",
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "employee:create",
		}),
		uploadEmployeeDocuments,
		controller.create,
	);

	routes.post(
		"/import",
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "employee:import",
		}),
		uploadImportFile,
		controller.importEmployees,
	);

	/**
	 * @openapi
	 * /api/employee/import/progress/{jobId}:
	 *   get:
	 *     summary: Get employee import progress
	 *     description: Retrieve the current progress of an employee import job
	 *     tags: [Employee]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: jobId
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Import job ID
	 *     responses:
	 *       200:
	 *         description: Progress retrieved successfully
	 *       404:
	 *         description: Import job not found or expired
	 */
	routes.get("/import/progress/:jobId", controller.getImportProgress);

	/**
	 * @openapi
	 * /api/employee/{id}:
	 *   patch:
	 *     summary: Update employee
	 *     description: Update employee data by ID (partial update)
	 *     tags: [Employee]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Employee ID (MongoDB ObjectId format)
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
	 *                 description: Employee name
	 *                 example: "Updated Email Employee"
	 *               description:
	 *                 type: string
	 *                 description: Employee description
	 *                 example: "Updated description for the employee"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: Employee type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 example: false
	 *     responses:
	 *       200:
	 *         description: Employee updated successfully
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
	 *                         employee:
	 *                           $ref: '#/components/schemas/Employee'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.patch("/:id", uploadEmployeeDocuments, controller.update);
	routes.patch("/:id/report-to", controller.updateReportTo);

	/**
	 * @openapi
	 * /api/employee/{id}:
	 *   delete:
	 *     summary: Delete employee
	 *     description: Permanently delete a employee by ID
	 *     tags: [Employee]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Employee ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Employee deleted successfully
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

	routes.get("/team/schedule-calendar", controller.getTeamScheduleCalendar);
	routes.get("/team/schedule-calendar-grid", controller.getTeamScheduleCalendarGrid);
	routes.get("/team/schedule-collections", controller.getTeamScheduleCollections);
	routes.post("/team/schedule-collections", controller.createTeamScheduleCollection);
	routes.patch("/team/schedule-collections/:collectionId", controller.updateTeamScheduleCollection);
	routes.patch(
		"/team/schedule-collections/:collectionId/archive",
		controller.archiveTeamScheduleCollection,
	);
	routes.post(
		"/team/schedule-ledger/apply-rotation",
		controller.applyTeamScheduleLedgerRotation,
	);
	routes.patch("/team/schedule-ledger/override", controller.overrideTeamScheduleLedger);
	routes.get("/:id/schedules", controller.getEmployeeSchedules);
	routes.post("/:id/schedules/set-active", controller.setActiveEmployeeSchedule);
	routes.patch("/:id/schedules/:entryId/deactivate", controller.deactivateEmployeeSchedule);

	/**
	 * @openapi
	 * /api/employee/{id}/attendance:
	 *   post:
	 *     summary: Mark attendance for employee
	 *     description: Mark attendance (clock in/out) for a specific employee
	 *     tags: [Employee, Attendance]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Employee ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               date:
	 *                 type: string
	 *                 format: date
	 *                 description: Date of attendance (YYYY-MM-DD)
	 *                 example: "2024-01-15"
	 *               timeIn:
	 *                 type: string
	 *                 format: date-time
	 *                 description: Clock in time
	 *                 example: "2024-01-15T09:00:00Z"
	 *               timeOut:
	 *                 type: string
	 *                 format: date-time
	 *                 description: Clock out time
	 *                 example: "2024-01-15T17:00:00Z"
	 *               status:
	 *                 type: string
	 *                 enum: ["PRESENT", "ABSENT", "LEAVE", "HOLIDAY", "WORK_FROM_HOME"]
	 *                 description: Attendance status
	 *                 example: "PRESENT"
	 *               timeInLocation:
	 *                 type: object
	 *                 description: Clock in location data
	 *               timeOutLocation:
	 *                 type: object
	 *                 description: Clock out location data
	 *               deviceInfo:
	 *                 type: object
	 *                 description: Device information
	 *               isManualEntry:
	 *                 type: boolean
	 *                 description: Whether this is a manual entry
	 *                 default: false
	 *               notes:
	 *                 type: string
	 *                 description: Additional notes
	 *     responses:
	 *       201:
	 *         description: Attendance marked successfully
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
	 *       409:
	 *         description: Conflict - Employee already clocked in/out
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/:id/attendance", controller.markAttendance);

	/**
	 * @openapi
	 * /api/employee/{id}/attendance:
	 *   get:
	 *     summary: Get employee's attendance records
	 *     description: Retrieve attendance records for a specific employee with optional date filtering and pagination
	 *     tags: [Employee, Attendance]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Employee ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: dateFrom
	 *         required: false
	 *         schema:
	 *           type: string
	 *           format: date
	 *         description: Start date for filtering (YYYY-MM-DD)
	 *         example: "2024-01-01"
	 *       - in: query
	 *         name: dateTo
	 *         required: false
	 *         schema:
	 *           type: string
	 *           format: date
	 *         description: End date for filtering (YYYY-MM-DD)
	 *         example: "2024-01-31"
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
	 *           default: createdAt
	 *         description: Field to sort by
	 *         example: "createdAt"
	 *     responses:
	 *       200:
	 *         description: Attendance records retrieved successfully
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
	 *                         pagination:
	 *                           type: object
	 *                           properties:
	 *                             page:
	 *                               type: integer
	 *                             limit:
	 *                               type: integer
	 *                             total:
	 *                               type: integer
	 *                             totalPages:
	 *                               type: integer
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/:id/attendance", controller.getAttendanceRecords);

	/**
	 * @openapi
	 * /api/employee/{id}/attendance/today:
	 *   get:
	 *     summary: Get today's attendance status for employee
	 *     description: Retrieve today's attendance status for a specific employee
	 *     tags: [Employee, Attendance]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Employee ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Today's attendance status retrieved successfully
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
	 *                           nullable: true
	 *                         status:
	 *                           type: string
	 *                           enum: [present, absent]
	 *                         hasTimeIn:
	 *                           type: boolean
	 *                         hasTimeOut:
	 *                           type: boolean
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/:id/attendance/today", controller.getTodayAttendance);

	/**
	 * @openapi
	 * /api/employee/{id}/attendance/{attendanceId}:
	 *   get:
	 *     summary: Get specific attendance record for employee
	 *     description: Retrieve a specific attendance record for a specific employee
	 *     tags: [Employee, Attendance]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Employee ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: path
	 *         name: attendanceId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Attendance ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Attendance record retrieved successfully
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
	routes.get("/:id/attendance/:attendanceId", controller.getAttendanceById);

	/**
	 * @openapi
	 * /api/employee/{id}/attendance/{attendanceId}:
	 *   patch:
	 *     summary: Update attendance record for employee
	 *     description: Update a specific attendance record for a specific employee
	 *     tags: [Employee, Attendance]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Employee ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: path
	 *         name: attendanceId
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
	 *               timeIn:
	 *                 type: string
	 *                 format: date-time
	 *                 description: Clock in time
	 *                 example: "2024-01-15T09:00:00Z"
	 *               timeOut:
	 *                 type: string
	 *                 format: date-time
	 *                 description: Clock out time
	 *                 example: "2024-01-15T17:00:00Z"
	 *               status:
	 *                 type: string
	 *                 enum: ["PRESENT", "ABSENT", "LEAVE", "HOLIDAY", "WORK_FROM_HOME"]
	 *                 description: Attendance status
	 *                 example: "PRESENT"
	 *               timeInLocation:
	 *                 type: object
	 *                 description: Clock in location data
	 *               timeOutLocation:
	 *                 type: object
	 *                 description: Clock out location data
	 *               deviceInfo:
	 *                 type: object
	 *                 description: Device information
	 *               isManualEntry:
	 *                 type: boolean
	 *                 description: Whether this is a manual entry
	 *               notes:
	 *                 type: string
	 *                 description: Additional notes
	 *     responses:
	 *       200:
	 *         description: Attendance record updated successfully
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
	routes.patch("/:id/attendance/:attendanceId", controller.updateAttendance);

	/**
	 * @openapi
	 * /api/employee/{id}/attendance/{attendanceId}:
	 *   delete:
	 *     summary: Delete attendance record for employee
	 *     description: Delete a specific attendance record for a specific employee
	 *     tags: [Employee, Attendance]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Employee ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: path
	 *         name: attendanceId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Attendance ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Attendance record deleted successfully
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
	routes.delete("/:id/attendance/debug/today", controller.debugDeleteTodayAttendance);
	routes.delete("/:id/attendance/:attendanceId", controller.deleteAttendance);

	/**
	 * @openapi
	 * /api/employee/{id}/managed-departments:
	 *   get:
	 *     summary: Get all departments managed by employee
	 *     description: Retrieve all departments where the employee is the manager
	 *     tags: [Employee, Department]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Employee ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports nested fields with dot notation)
	 *         example: "id,name,code,description"
	 *       - in: query
	 *         name: include
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of related data to include (employees, positions, manager, parent, children)
	 *         example: "employees,positions"
	 *       - in: query
	 *         name: count
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include employee count for each department
	 *       - in: query
	 *         name: active
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Filter only active departments
	 *     responses:
	 *       200:
	 *         description: Managed departments retrieved successfully
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
	 *                         departments:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/Department'
	 *                         count:
	 *                           type: integer
	 *                           description: Present when count="true"
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/:id/managed-departments",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:employee:managed-departments:${req.params.id}:${queryKey}`;
			},
		}),
		controller.getManagedDepartments,
	);

	/**
	 * @openapi
	 * /api/employee/{id}/managed-departments/{departmentId}:
	 *   get:
	 *     summary: Get specific managed department details
	 *     description: Retrieve details of a specific department managed by the employee
	 *     tags: [Employee, Department]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Employee ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: path
	 *         name: departmentId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Department ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports nested fields with dot notation)
	 *         example: "id,name,code,description"
	 *       - in: query
	 *         name: include
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of related data to include (employees, positions, manager, parent, children)
	 *         example: "employees,positions"
	 *       - in: query
	 *         name: count
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include employee count for the department
	 *     responses:
	 *       200:
	 *         description: Managed department retrieved successfully
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
	 *                         department:
	 *                           $ref: '#/components/schemas/Department'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/:id/managed-departments/:departmentId",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:employee:managed-department:${req.params.id}:${req.params.departmentId}:${queryKey}`;
			},
		}),
		controller.getManagedDepartmentById,
	);

	/**
	 * @openapi
	 * /api/employee/{id}/department:
	 *   get:
	 *     summary: Get the department that an employee belongs to
	 *     description: Retrieve the department that the employee is assigned to, with optional related data
	 *     tags: [Employee, Department]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Employee ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports nested fields with dot notation)
	 *         example: "id,name,code,description"
	 *       - in: query
	 *         name: include
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of related data to include (employees, positions, manager, parent, children)
	 *         example: "employees,positions"
	 *       - in: query
	 *         name: count
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include employee count for the department
	 *     responses:
	 *       200:
	 *         description: Employee department retrieved successfully
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
	 *                         department:
	 *                           $ref: '#/components/schemas/Department'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/:id/department",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:employee:department:${req.params.id}:${queryKey}`;
			},
		}),
		controller.getEmployeeDepartment,
	);

	routes.get(
		"/:id/document-priorities",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => `cache:employee:document-priorities:${req.params.id}`,
		}),
		controller.getDocumentPriorities,
	);

	/**
	 * @openapi
	 * /api/employee/{id}/upload-document:
	 *   post:
	 *     summary: Upload employee document
	 *     description: Upload a document (contract, certificate, ID, etc.) for an employee and store the file URL in employee.documents
	 *     tags: [Employee]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Employee ID
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               file:
	 *                 type: string
	 *                 format: binary
	 *                 description: Document file (PDF, JPG, PNG, etc.)
	 *               type:
	 *                 type: string
	 *                 description: Document type (e.g., passport, driver_license, contract, certificate)
	 *                 example: "contract"
	 *               number:
	 *                 type: string
	 *                 description: Document number/identifier
	 *                 example: "DOC-2024-001"
	 *               issueDate:
	 *                 type: string
	 *                 format: date
	 *                 description: Date when document was issued
	 *               expiryDate:
	 *                 type: string
	 *                 format: date
	 *                 description: Date when document expires (optional)
	 *             required:
	 *               - file
	 *               - type
	 *               - number
	 *     responses:
	 *       200:
	 *         description: Document uploaded successfully
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
	 *                         employee:
	 *                           $ref: '#/components/schemas/Employee'
	 *                         document:
	 *                           type: object
	 *                           properties:
	 *                             type:
	 *                               type: string
	 *                             number:
	 *                               type: string
	 *                             issueDate:
	 *                               type: string
	 *                               format: date-time
	 *                             expiryDate:
	 *                               type: string
	 *                               format: date-time
	 *                             url:
	 *                               type: string
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/:id/upload-document", uploadDocument, controller.uploadDocument);

	/**
	 * @openapi
	 * /api/employee/documents/{documentNumber}:
	 *   patch:
	 *     summary: Update an employee document
	 *     description: Update document metadata and optionally replace the file
	 *     tags: [Employee]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: documentNumber
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Document number to update
	 *     requestBody:
	 *       required: false
	 *       content:
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               file:
	 *                 type: string
	 *                 format: binary
	 *                 description: New document file (optional)
	 *               type:
	 *                 type: string
	 *                 description: Document type
	 *               number:
	 *                 type: string
	 *                 description: Document number
	 *               issueDate:
	 *                 type: string
	 *                 format: date
	 *                 description: Issue date
	 *               expiryDate:
	 *                 type: string
	 *                 format: date
	 *                 description: Expiry date
	 *     responses:
	 *       200:
	 *         description: Document updated successfully
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.patch("/documents/:documentId/review", controller.reviewDocument);
	routes.patch("/documents/:documentNumber", uploadDocument, controller.updateDocument);

	/**
	 * @openapi
	 * /api/employee/documents/{documentNumber}:
	 *   delete:
	 *     summary: Delete an employee document
	 *     description: Delete a document by its document number (finds the employee automatically)
	 *     tags: [Employee]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: documentNumber
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Document number to delete
	 *     responses:
	 *       200:
	 *         description: Document deleted successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "success"
	 *                 message:
	 *                   type: string
	 *                   example: "Document deleted successfully"
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.delete("/documents/:documentNumber", controller.deleteDocument);

	route.use(path, routes);

	return route;
};
