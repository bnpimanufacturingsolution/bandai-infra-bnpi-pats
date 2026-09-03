import { Router, Request, Response, NextFunction } from "express";

interface IController {
	handleEvent(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();

	/**
	 * Public bridge endpoint for the Linux ZKTeco bridge process (vendor/zkteco-linux).
	 * The bridge cannot attach browser auth tokens, so this path is excluded from app auth.
	 */
	routes.post("/events", controller.handleEvent);
	routes.post("/callback", controller.handleEvent);

	route.use("/zkteco", routes);

	return route;
};
