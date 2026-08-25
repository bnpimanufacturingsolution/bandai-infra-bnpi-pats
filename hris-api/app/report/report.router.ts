import { Router, Request, Response, NextFunction } from "express";

interface IController {
	downloadBir2316(req: Request, res: Response, next: NextFunction): Promise<void>;
	downloadPhilhealthRf1(req: Request, res: Response, next: NextFunction): Promise<void>;
	getManpowerDistributionReference(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/reports";

	/**
	 * @openapi
	 * /api/reports/bir/2316:
	 *   get:
	 *     summary: Download BIR Form 2316 PDF
	 *     tags: [Reports]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: employeeId
	 *         required: true
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: year
	 *         required: true
	 *         schema:
	 *           type: integer
	 *     responses:
	 *       200:
	 *         description: PDF downloaded successfully
	 *         content:
	 *           application/pdf:
	 *             schema:
	 *               type: string
	 *               format: binary
	 */
	routes.get("/bir/2316", controller.downloadBir2316);
	routes.get("/philhealth/rf1", controller.downloadPhilhealthRf1);
	routes.get("/manpower-distribution/reference", controller.getManpowerDistributionReference);

	route.use(path, routes);
	return route;
};
