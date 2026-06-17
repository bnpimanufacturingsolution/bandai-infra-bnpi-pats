import { Router, Request, Response, NextFunction } from "express";
import { cache, cacheShort, cacheMedium, cacheUser } from "../../middleware/cache";
import { uploadImportFile } from "../../middleware/upload";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	resetGeneratedPayrolls(req: Request, res: Response, next: NextFunction): Promise<void>;
	getBreakdown(req: Request, res: Response, next: NextFunction): Promise<void>;
	importFromXLSX(req: Request, res: Response, next: NextFunction): Promise<void>;
	generatePayslipPdf(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/employeePayroll";

	routes.post("/debug/reset-generated-payrolls", controller.resetGeneratedPayrolls);

	/**
	 * @openapi
	 * /api/employeePayroll/{id}:
	 *   get:
	 *     summary: Get employeePayroll by ID
	 *     description: Retrieve a specific employeePayroll by its unique identifier with optional field selection
	 *     tags: [EmployeePayroll]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: EmployeePayroll ID (MongoDB ObjectId format)
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
	 *         description: EmployeePayroll retrieved successfully
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
	 *                         employeePayroll:
	 *                           $ref: '#/components/schemas/EmployeePayroll'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache individual employeePayroll with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:employeePayroll:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/employeePayroll:
	 *   get:
	 *     summary: Get all employeePayrolls
	 *     description: Retrieve employeePayrolls with advanced filtering, pagination, sorting, field selection, and optional grouping
	 *     tags: [EmployeePayroll]
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
	 *         description: Include employeePayroll documents in response
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
	 *                         employeePayrolls:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/EmployeePayroll'
	 *                           description: Present when document="true" and no groupBy
	 *                         groups:
	 *                           type: object
	 *                           additionalProperties:
	 *                             type: array
	 *                             items:
	 *                               $ref: '#/components/schemas/EmployeePayroll'
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
	// Cache employeePayroll list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:employeePayroll:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/employeePayroll:
	 *   post:
	 *     summary: Create new employeePayroll
	 *     description: Create a new employeePayroll with the provided data
	 *     tags: [EmployeePayroll]
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
	 *                 description: EmployeePayroll name
	 *                 example: "Email Welcome EmployeePayroll"
	 *               description:
	 *                 type: string
	 *                 description: EmployeePayroll description
	 *                 example: "Welcome email employeePayroll for new users"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: EmployeePayroll type for categorization
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
	 *         description: EmployeePayroll created successfully
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
	 *                         employeePayroll:
	 *                           $ref: '#/components/schemas/EmployeePayroll'
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
	 * /api/employeePayroll/{id}:
	 *   patch:
	 *     summary: Update employeePayroll
	 *     description: Update employeePayroll data by ID (partial update)
	 *     tags: [EmployeePayroll]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: EmployeePayroll ID (MongoDB ObjectId format)
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
	 *                 description: EmployeePayroll name
	 *                 example: "Updated Email EmployeePayroll"
	 *               description:
	 *                 type: string
	 *                 description: EmployeePayroll description
	 *                 example: "Updated description for the employeePayroll"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: EmployeePayroll type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 example: false
	 *     responses:
	 *       200:
	 *         description: EmployeePayroll updated successfully
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
	 *                         employeePayroll:
	 *                           $ref: '#/components/schemas/EmployeePayroll'
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
	 * /api/employeePayroll/{id}:
	 *   delete:
	 *     summary: Delete employeePayroll
	 *     description: Permanently delete a employeePayroll by ID
	 *     tags: [EmployeePayroll]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: EmployeePayroll ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: EmployeePayroll deleted successfully
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
	 * /api/employeePayroll/import:
	 *   post:
	 *     summary: Import employee payrolls from XLSX file
	 *     description: Import employee payroll records from a standardized Excel file with columns EMPLOYEE_ID, PAYROLL_PERIOD_NAME, BASIC_PAY, and optional pay components and deductions. Payroll periods will be auto-created if they don't exist.
	 *     tags: [EmployeePayroll]
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
	 *                 description: XLSX file with columns EMPLOYEE_ID, PAYROLL_PERIOD_NAME, BASIC_PAY, OVERTIME_PAY, NIGHT_DIFF_PAY, HOLIDAY_PAY, ALLOWANCES, BONUSES, TAX_AMOUNT, SSS_CONTRIBUTION, PHILHEALTH_CONTRIBUTION, PAGIBIG_CONTRIBUTION, LOAN_DEDUCTIONS, OTHER_DEDUCTIONS, REGULAR_HOURS, OVERTIME_HOURS, PAYMENT_METHOD, REFERENCE_NUMBER, NOTES. Payroll periods are auto-created from the period name if they don't exist.
	 *     responses:
	 *       200:
	 *         description: Employee payroll import completed successfully
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
	routes.post("/import", uploadImportFile, controller.importFromXLSX);

	/**
	 * @openapi
	 * /api/employeePayroll/{id}/breakdown:
	 *   get:
	 *     summary: Get detailed payroll breakdown
	 *     description: Retrieve comprehensive payroll breakdown including attendance records, deductions, and calculations for a specific employee payroll period
	 *     tags: [EmployeePayroll]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: EmployeePayroll ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Payroll breakdown retrieved successfully
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
	 *                         employeeInfo:
	 *                           type: object
	 *                         payrollPeriod:
	 *                           type: object
	 *                         schedule:
	 *                           type: object
	 *                         workingDays:
	 *                           type: object
	 *                         rates:
	 *                           type: object
	 *                         attendanceSummary:
	 *                           type: object
	 *                         attendanceBreakdown:
	 *                           type: array
	 *                         calculations:
	 *                           type: object
	 *                         payroll:
	 *                           type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/:id/breakdown", controller.getBreakdown);

	/**
	 * @openapi
	 * /api/employeePayroll/{id}/payslip:
	 *   get:
	 *     summary: Download generated Payslip PDF
	 *     description: Download the previously generated payslip PDF for a specific employee payroll
	 *     tags: [EmployeePayroll]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: EmployeePayroll ID
	 *     responses:
	 *       200:
	 *         description: PDF file stream
	 *         content:
	 *           application/pdf:
	 *             schema:
	 *               type: string
	 *               format: binary
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/:id/payslip", controller.generatePayslipPdf);

	route.use(path, routes);

	return route;
};
