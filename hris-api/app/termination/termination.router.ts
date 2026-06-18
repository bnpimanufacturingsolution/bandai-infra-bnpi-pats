import { Router, Request, Response, NextFunction } from "express";
import { cache } from "../../middleware/cache";

interface IController {
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	submit(req: Request, res: Response, next: NextFunction): Promise<void>;
	hrDirectorApproval(req: Request, res: Response, next: NextFunction): Promise<void>;
	legalApproval(req: Request, res: Response, next: NextFunction): Promise<void>;
	startProcessing(req: Request, res: Response, next: NextFunction): Promise<void>;
	complete(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/termination";

	/**
	 * @openapi
	 * /api/termination:
	 *   get:
	 *     summary: Get all terminations
	 *     description: Retrieve terminations with filtering, pagination, and sorting
	 *     tags: [Termination]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         schema:
	 *           type: integer
	 *           default: 1
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           default: 10
	 *       - in: query
	 *         name: status
	 *         schema:
	 *           type: string
	 *           enum: [DRAFT, PENDING_HR_DIRECTOR, PENDING_LEGAL, APPROVED, REJECTED, PROCESSING, COMPLETED]
	 *     responses:
	 *       200:
	 *         description: Terminations retrieved successfully
	 */
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:termination:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/termination/{id}:
	 *   get:
	 *     summary: Get termination by ID
	 *     description: Retrieve a specific termination by its ID
	 *     tags: [Termination]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Termination retrieved successfully
	 *       404:
	 *         description: Termination not found
	 */
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => `cache:termination:byId:${req.params.id}`,
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/termination:
	 *   post:
	 *     summary: Create new termination
	 *     description: Create a new termination PAN (HR/Manager only)
	 *     tags: [Termination]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - employeeId
	 *               - initiatedById
	 *               - terminationType
	 *               - terminationDate
	 *               - lastWorkingDay
	 *               - reason
	 *             properties:
	 *               employeeId:
	 *                 type: string
	 *               initiatedById:
	 *                 type: string
	 *               terminationType:
	 *                 type: string
	 *                 enum: [PERFORMANCE, MISCONDUCT, REDUNDANCY, END_OF_CONTRACT, FAILED_PROBATION]
	 *               terminationDate:
	 *                 type: string
	 *                 format: date
	 *               lastWorkingDay:
	 *                 type: string
	 *                 format: date
	 *               reason:
	 *                 type: string
	 *               severancePackage:
	 *                 type: string
	 *               legalApprovalRequired:
	 *                 type: boolean
	 *     responses:
	 *       201:
	 *         description: Termination created successfully
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/termination/{id}:
	 *   patch:
	 *     summary: Update termination
	 *     description: Update termination data (DRAFT status only)
	 *     tags: [Termination]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Termination updated successfully
	 *       409:
	 *         description: Termination can only be updated in DRAFT status
	 */
	routes.patch("/:id", controller.update);

	/**
	 * @openapi
	 * /api/termination/{id}:
	 *   delete:
	 *     summary: Delete termination
	 *     description: Soft delete a termination (DRAFT status only)
	 *     tags: [Termination]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Termination deleted successfully
	 *       409:
	 *         description: Only DRAFT terminations can be deleted
	 */
	routes.delete("/:id", controller.remove);

	/**
	 * @openapi
	 * /api/termination/{id}/submit:
	 *   post:
	 *     summary: Submit termination for approval
	 *     description: Submit a DRAFT termination for HR Director approval
	 *     tags: [Termination]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Termination submitted successfully
	 *       409:
	 *         description: Only DRAFT terminations can be submitted
	 */
	routes.post("/:id/submit", controller.submit);

	/**
	 * @openapi
	 * /api/termination/{id}/hr-director-approval:
	 *   post:
	 *     summary: HR Director approval action
	 *     description: HR Director approves or rejects the termination
	 *     tags: [Termination]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - approverId
	 *               - action
	 *             properties:
	 *               approverId:
	 *                 type: string
	 *               action:
	 *                 type: string
	 *                 enum: [approve, reject]
	 *               comments:
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: Action completed successfully
	 *       409:
	 *         description: Invalid status for this action
	 */
	routes.post("/:id/hr-director-approval", controller.hrDirectorApproval);

	/**
	 * @openapi
	 * /api/termination/{id}/legal-approval:
	 *   post:
	 *     summary: Legal approval action
	 *     description: Legal team approves or rejects the termination
	 *     tags: [Termination]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - approverId
	 *               - action
	 *             properties:
	 *               approverId:
	 *                 type: string
	 *               action:
	 *                 type: string
	 *                 enum: [approve, reject]
	 *               comments:
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: Action completed successfully
	 *       409:
	 *         description: Invalid status for this action
	 */
	routes.post("/:id/legal-approval", controller.legalApproval);

	/**
	 * @openapi
	 * /api/termination/{id}/start-processing:
	 *   post:
	 *     summary: Start processing/offboarding
	 *     description: Start the offboarding process for an approved termination
	 *     tags: [Termination]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Processing started successfully
	 *       409:
	 *         description: Only APPROVED terminations can start processing
	 */
	routes.post("/:id/start-processing", controller.startProcessing);

	/**
	 * @openapi
	 * /api/termination/{id}/complete:
	 *   post:
	 *     summary: Complete termination
	 *     description: Mark the termination as completed after all offboarding is done
	 *     tags: [Termination]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     requestBody:
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               finalPayCalculated:
	 *                 type: boolean
	 *               clearanceCompleted:
	 *                 type: boolean
	 *               terminationLetterPath:
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: Termination completed successfully
	 *       409:
	 *         description: Only PROCESSING terminations can be completed
	 */
	routes.post("/:id/complete", controller.complete);

	route.use(path, routes);

	return route;
};
