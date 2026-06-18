import { Router, Request, Response, NextFunction } from "express";

interface IController {
	getApprovals(req: Request, res: Response, next: NextFunction): Promise<void>;
	getReviewEvents(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();

	routes.get("/approvals", controller.getApprovals);
	routes.get("/review-events", controller.getReviewEvents);

	route.use("/employee-documents", routes);

	return route;
};
