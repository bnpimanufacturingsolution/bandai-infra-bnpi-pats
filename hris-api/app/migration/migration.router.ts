import { Router, Request, Response, NextFunction } from "express";
import { uploadImportFile, uploadImportFiles } from "../../middleware/upload";
import { requestTimeout } from "../../middleware/requestTimeout";
import { config } from "../../config/config";

interface IMigrationController {
	execute(req: Request, res: Response, next: NextFunction): Promise<void>;
	dryRun(req: Request, res: Response, next: NextFunction): Promise<void>;
	stats(req: Request, res: Response, next: NextFunction): Promise<void>;
	hierarchy(req: Request, res: Response, next: NextFunction): Promise<void>;
	testCredentialsEmail(req: Request, res: Response, next: NextFunction): Promise<void>;
	uploadCsv(req: Request, res: Response, next: NextFunction): Promise<void>;
	extractSources(req: Request, res: Response, next: NextFunction): Promise<void>;
	transformSources(req: Request, res: Response, next: NextFunction): Promise<void>;
	importDm3EmployeeSchedules(req: Request, res: Response, next: NextFunction): Promise<void>;
	importDm3ReportingLines(req: Request, res: Response, next: NextFunction): Promise<void>;
	importDm3EmployeeDocuments(req: Request, res: Response, next: NextFunction): Promise<void>;
	importDm3OpeningLeaveBalances(req: Request, res: Response, next: NextFunction): Promise<void>;
	importDm3EmployeeBenefitsLoans(req: Request, res: Response, next: NextFunction): Promise<void>;
	importDm3CompensationMassUpload(req: Request, res: Response, next: NextFunction): Promise<void>;
	importDm3DeductionMassUpload(req: Request, res: Response, next: NextFunction): Promise<void>;
	importDm3WorkSharingSchedule(req: Request, res: Response, next: NextFunction): Promise<void>;
	importDm3PeriodLeave(req: Request, res: Response, next: NextFunction): Promise<void>;
	listDm3MassUploadImports(req: Request, res: Response, next: NextFunction): Promise<void>;
	getDm3MassUploadImport(req: Request, res: Response, next: NextFunction): Promise<void>;
	downloadDm3MassUploadImportReport(req: Request, res: Response, next: NextFunction): Promise<void>;
	importDm3ManpowerDatabank(req: Request, res: Response, next: NextFunction): Promise<void>;
	getDm3ManpowerDatabankProgress(req: Request, res: Response, next: NextFunction): Promise<void>;
	finalizeDm3EmployeeImport(req: Request, res: Response, next: NextFunction): Promise<void>;
	recoverDm3EmployeePostActions(req: Request, res: Response, next: NextFunction): Promise<void>;
	getDm3EmployeePostActionsJob(req: Request, res: Response, next: NextFunction): Promise<void>;
	workbookAudit(req: Request, res: Response, next: NextFunction): Promise<void>;
	getWorkbookAuditLatest(req: Request, res: Response, next: NextFunction): Promise<void>;
	downloadWorkbookTemplate(req: Request, res: Response, next: NextFunction): Promise<void>;
	getSourceInputs(req: Request, res: Response, next: NextFunction): Promise<void>;
	downloadSourceInput(req: Request, res: Response, next: NextFunction): Promise<void>;
	dryRunMigrationRun(req: Request, res: Response, next: NextFunction): Promise<void>;
	startMigrationRun(req: Request, res: Response, next: NextFunction): Promise<void>;
	getMigrationRun(req: Request, res: Response, next: NextFunction): Promise<void>;
	getMigrationRunProgress(req: Request, res: Response, next: NextFunction): Promise<void>;
	getActiveMigrationRun(req: Request, res: Response, next: NextFunction): Promise<void>;
	getLatestMigrationRun(req: Request, res: Response, next: NextFunction): Promise<void>;
	getMigrationRunEvents(req: Request, res: Response, next: NextFunction): Promise<void>;
	downloadMigrationRunReconciliationReport(req: Request, res: Response, next: NextFunction): Promise<void>;
	recoverMigrationRun(req: Request, res: Response, next: NextFunction): Promise<void>;
	rerunMigrationRun(req: Request, res: Response, next: NextFunction): Promise<void>;
	resolveDm4SourceWorkbooks(req: Request, res: Response, next: NextFunction): Promise<void>;
	uploadDm4SourceWorkbooks(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IMigrationController): Router => {
	const routes = Router();
	const path = "/migration";

	/**
	 * @openapi
	 * /api/migration/execute:
	 *   post:
	 *     summary: Execute bulk employee migration
	 *     description: |
	 *       Migrate employee records with B-tree indexed, hierarchy-aware batch processing.
	 *       - Groups employees by department
	 *       - Sorts by roleLevel ascending (top→bottom)
	 *       - Inserts in configurable batch sizes (default 500)
	 *       - Auto-creates departments, positions, and levels
	 *       - Links reportTo hierarchy in a second pass
	 *     tags: [Migration]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [config, employees]
	 *             properties:
	 *               config:
	 *                 type: object
	 *                 required: [organizationId]
	 *                 properties:
	 *                   organizationId:
	 *                     type: string
	 *                   batchSize:
	 *                     type: integer
	 *                     default: 500
	 *                   skipDuplicates:
	 *                     type: boolean
	 *                     default: true
	 *                   dryRun:
	 *                     type: boolean
	 *                     default: false
	 *               departments:
	 *                 type: array
	 *                 items:
	 *                   type: object
	 *               positions:
	 *                 type: array
	 *                 items:
	 *                   type: object
	 *               levels:
	 *                 type: array
	 *                 items:
	 *                   type: object
	 *               employees:
	 *                 type: array
	 *                 items:
	 *                   type: object
	 *     responses:
	 *       200:
	 *         description: Migration completed successfully
	 *       207:
	 *         description: Migration completed with partial errors
	 *       400:
	 *         description: Validation failed
	 *       500:
	 *         description: Internal server error
	 */
	routes.post("/execute", controller.execute);

	/**
	 * @openapi
	 * /api/migration/dry-run:
	 *   post:
	 *     summary: Validate migration data without inserting
	 *     description: Runs the full validation and grouping logic but does not write to the database
	 *     tags: [Migration]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/MigrationInput'
	 *     responses:
	 *       200:
	 *         description: Dry run completed
	 *       400:
	 *         description: Validation failed
	 */
	routes.post("/dry-run", controller.dryRun);

	/**
	 * @openapi
	 * /api/migration/stats:
	 *   get:
	 *     summary: Get migration statistics
	 *     description: Returns employee counts grouped by department and level
	 *     tags: [Migration]
	 *     parameters:
	 *       - in: query
	 *         name: organizationId
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Stats retrieved
	 */
	routes.get("/stats", controller.stats);

	/**
	 * @openapi
	 * /api/migration/hierarchy:
	 *   get:
	 *     summary: Get employee hierarchy tree
	 *     description: |
	 *       Returns employees structured as Department → Level → Employees.
	 *       Uses the compound B-tree index @@index([departmentId, levelId]) for efficient traversal.
	 *     tags: [Migration]
	 *     parameters:
	 *       - in: query
	 *         name: organizationId
	 *         required: true
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: departmentCode
	 *         required: false
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Hierarchy tree retrieved
	 */
	routes.get("/hierarchy", controller.hierarchy);

	/**
	 * @openapi
	 * /api/migration/test-credentials-email:
	 *   post:
	 *     summary: Send credentials-style test email
	 *     description: |
	 *       Sends a test email using the employee credentials email template.
	 *       Protected endpoint intended for HR/Admin testing via Postman.
	 *     tags: [Migration]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [to, employeeId, email, userName, password]
	 *             properties:
	 *               to:
	 *                 type: string
	 *                 format: email
	 *               employeeId:
	 *                 type: string
	 *               email:
	 *                 type: string
	 *                 format: email
	 *               userName:
	 *                 type: string
	 *               password:
	 *                 type: string
	 *               fullName:
	 *                 type: string
	 *               dryRun:
	 *                 type: boolean
	 *                 default: false
	 *     responses:
	 *       200:
	 *         description: Test email sent or dry-run completed
	 *       400:
	 *         description: Validation failed
	 *       401:
	 *         description: Missing/invalid auth token
	 *       403:
	 *         description: Insufficient role
	 *       503:
	 *         description: SMTP/email config missing
	 *       500:
	 *         description: Email provider/send failure
	 */
	routes.post("/test-credentials-email", controller.testCredentialsEmail);

	/**
	 * @openapi
	 * /api/migration/extract-sources:
	 *   post:
	 *     summary: Extract worksheet and structural values from raw employee source files
	 *     description: |
	 *       Accepts one or more CSV/XLSX/XLS files and returns worksheet summaries,
	 *       detected columns, sample rows, and extracted structural values such as
	 *       departments, positions, levels, schedules, and report-to identifiers.
	 *       This endpoint is read-only and does not write any records.
	 *     tags: [Migration]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               files:
	 *                 type: array
	 *                 items:
	 *                   type: string
	 *                   format: binary
	 *     responses:
	 *       200:
	 *         description: Extraction completed successfully
	 *       400:
	 *         description: Invalid or missing file upload
	 */
	routes.post("/extract-sources", uploadImportFiles, controller.extractSources);

	/**
	 * @openapi
	 * /api/migration/transform-sources:
	 *   post:
	 *     summary: Transform a selected raw worksheet into normalized employee rows
	 *     description: |
	 *       Accepts one CSV/XLSX/XLS file, a selected sheet name, field mappings,
	 *       and optional split rules. Returns normalized preview rows suitable for
	 *       export into the existing employee migration/import flow.
	 *     tags: [Migration]
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
	 *               sheetName:
	 *                 type: string
	 *               fieldMapping:
	 *                 type: string
	 *               splitRules:
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: Transformation completed successfully
	 *       400:
	 *         description: Invalid or missing transform payload
	 */
	routes.post("/transform-sources", uploadImportFile, controller.transformSources);
	routes.post("/workbook-audit", controller.workbookAudit);
	routes.get("/workbook-audit/latest", controller.getWorkbookAuditLatest);

	routes.get("/workbook-template/:fileName", controller.downloadWorkbookTemplate);
	routes.get("/source-inputs", controller.getSourceInputs);
	routes.get("/source-inputs/:sourceId/download", controller.downloadSourceInput);
	routes.post(
		"/dm3/import-employee-schedules",
		uploadImportFile,
		controller.importDm3EmployeeSchedules,
	);
	routes.post(
		"/dm3/import-reporting-lines",
		uploadImportFile,
		controller.importDm3ReportingLines,
	);
	routes.post(
		"/dm3/import-employee-documents",
		uploadImportFile,
		controller.importDm3EmployeeDocuments,
	);
	routes.post(
		"/dm3/import-opening-leave-balances",
		uploadImportFile,
		controller.importDm3OpeningLeaveBalances,
	);
	routes.post(
		"/dm3/import-employee-benefits-loans",
		uploadImportFile,
		controller.importDm3EmployeeBenefitsLoans,
	);
	routes.post(
		"/dm3/import-compensation-mass-upload",
		uploadImportFile,
		controller.importDm3CompensationMassUpload,
	);
	routes.post(
		"/dm3/import-deduction-mass-upload",
		uploadImportFile,
		controller.importDm3DeductionMassUpload,
	);
	routes.post(
		"/dm3/import-worksharing-schedule",
		uploadImportFile,
		controller.importDm3WorkSharingSchedule,
	);
	routes.post(
		"/dm3/import-period-leave",
		uploadImportFile,
		controller.importDm3PeriodLeave,
	);
	routes.get("/dm3/mass-upload-imports", controller.listDm3MassUploadImports);
	routes.get(
		"/dm3/mass-upload-imports/:id/report.csv",
		controller.downloadDm3MassUploadImportReport,
	);
	routes.get("/dm3/mass-upload-imports/:id", controller.getDm3MassUploadImport);
	routes.post(
		"/dm3/import-manpower-databank",
		uploadImportFile,
		controller.importDm3ManpowerDatabank,
	);
	routes.get(
		"/dm3/import-manpower-databank/progress/:jobId",
		controller.getDm3ManpowerDatabankProgress,
	);
	// Statutory / monthly-payment register upload is intentionally not exposed.
	// BNPI benefits and deductions for a cutoff are imported via compensation +
	// deduction mass upload only (`import-compensation-mass-upload` /
	// `import-deduction-mass-upload`).
	// Manpower Databank is a separate DM3 roster refresh path (create/update employees).
	routes.post(
		"/dm3/finalize-employee-import",
		uploadImportFile,
		controller.finalizeDm3EmployeeImport,
	);
	routes.post(
		"/dm3/recover-employee-post-actions",
		controller.recoverDm3EmployeePostActions,
	);
	routes.get(
		"/dm3/employee-post-actions/jobs/:jobId",
		controller.getDm3EmployeePostActionsJob,
	);
	routes.post(
		"/runs/dry-run",
		uploadImportFiles,
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "migration:runs-dry-run",
		}),
		controller.dryRunMigrationRun,
	);
	routes.post(
		"/runs",
		uploadImportFiles,
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "migration:runs-start",
		}),
		controller.startMigrationRun,
	);
	routes.get("/runs/active", controller.getActiveMigrationRun);
	routes.get("/runs/latest", controller.getLatestMigrationRun);
	routes.get("/runs/:runId/progress", controller.getMigrationRunProgress);
	routes.get("/runs/:runId/reconciliation-report", controller.downloadMigrationRunReconciliationReport);
	routes.get("/runs/:runId/report.xlsx", controller.downloadMigrationRunReconciliationReport);
	routes.get("/runs/:runId", controller.getMigrationRun);
	routes.get("/runs/:runId/events", controller.getMigrationRunEvents);
	routes.post("/runs/:runId/recover", controller.recoverMigrationRun);
	routes.post("/runs/:runId/rerun", controller.rerunMigrationRun);
	routes.post("/dm4/resolve-source-workbooks", controller.resolveDm4SourceWorkbooks);
	routes.post(
		"/dm4/upload-source-workbooks",
		uploadImportFiles,
		controller.uploadDm4SourceWorkbooks,
	);

	/**
	 * @openapi
	 * /api/migration/upload-csv:
	 *   post:
	 *     summary: Upload a CSV file and execute migration
	 *     description: |
	 *       Accepts a CSV file (multipart/form-data, field name 'file') and runs the migration pipeline.
	 *       - Auto-discovers departments and positions
	 *       - Validates all rows
	 *       - Enforces strict post-actions: auth account + credentials email are required per created row
	 *       - Rolls back strict-failed rows and exposes deterministic `postActions.failures[]`
	 *       - Returns migration summary
	 *     tags: [Migration]
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
	 *               organizationId:
	 *                 type: string
	 *               batchSize:
	 *                 type: integer
	 *               skipDuplicates:
	 *                 type: boolean
	 *               dryRun:
	 *                 type: boolean
	 *     responses:
	 *       200:
	 *         description: Migration completed successfully
	 *       207:
	 *         description: Migration completed with partial errors
	 *       400:
	 *         description: Validation failed
	 *       500:
	 *         description: Internal server error
	 */
	routes.post("/upload-csv", uploadImportFile, controller.uploadCsv);

	route.use(path, routes);
	return route;
};
