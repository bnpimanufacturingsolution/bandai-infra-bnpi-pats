import { Router, Request, Response, NextFunction } from "express";
import { cache } from "../../middleware/cache";

interface IController {
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/leave-settings";

	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const organizationId =
					(req as any).organizationId || (req as any).user?.organizationId || "unknown-org";
				return `cache:leave-settings:${organizationId}`;
			},
		}),
		controller.getAll,
	);

	routes.patch("/:leaveType", controller.update);

	route.use(path, routes);

	return route;
};
