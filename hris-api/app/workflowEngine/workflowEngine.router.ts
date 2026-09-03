import { Router, Request, Response, NextFunction } from "express";
import { cache } from "../../middleware/cache";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/workflowEngine";

	/**
	 * @openapi
	 * /api/workflowEngine/{id}:
	 *   get:
	 *     summary: Get workflow instance by ID
	 *     description: Retrieve a runtime WorkflowInstance record from the legacy workflowEngine endpoint.
	 *     tags: [WorkflowInstance]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:workflowEngine:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/workflowEngine:
	 *   get:
	 *     summary: List workflow instances
	 *     description: Retrieve runtime WorkflowInstance records with filtering, pagination, sorting, and field selection.
	 *     tags: [WorkflowInstance]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:workflowEngine:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/workflowEngine:
	 *   post:
	 *     summary: Create workflow instance
	 *     description: Create a runtime WorkflowInstance record while preserving the legacy workflowEngine route path.
	 *     tags: [WorkflowInstance]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/workflowEngine/{id}:
	 *   patch:
	 *     summary: Update workflow instance
	 *     description: Partially update a runtime WorkflowInstance record.
	 *     tags: [WorkflowInstance]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.patch("/:id", controller.update);

	/**
	 * @openapi
	 * /api/workflowEngine/{id}:
	 *   delete:
	 *     summary: Soft delete workflow instance
	 *     description: Soft delete a runtime WorkflowInstance record by setting isDeleted=true.
	 *     tags: [WorkflowInstance]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.delete("/:id", controller.remove);

	route.use(path, routes);

	return route;
};
