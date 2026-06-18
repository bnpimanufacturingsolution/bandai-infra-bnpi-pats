import { Router, Request, Response, NextFunction } from "express";

interface ICelebrationsController {
	getBirthdays(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: ICelebrationsController): Router => {
	const routes = Router();
	const path = "/celebrations";

	/**
	 * @openapi
	 * /api/celebrations/birthdays:
	 *   get:
	 *     summary: Get monthly birthday celebrants
	 *     description: Returns employee and kids birthday celebrants for the selected month within the authenticated user's organization.
	 *     tags: [Celebrations]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: month
	 *         required: true
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 12
	 *       - in: query
	 *         name: year
	 *         required: true
	 *         schema:
	 *           type: integer
	 *       - in: query
	 *         name: type
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: [EMPLOYEES, KIDS, ALL]
	 *           default: ALL
	 *       - in: query
	 *         name: search
	 *         required: false
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Birthday celebrants retrieved successfully
	 *       400:
	 *         description: Invalid query parameters
	 *       401:
	 *         description: Unauthorized
	 *       500:
	 *         description: Internal server error
	 */
	routes.get("/birthdays", controller.getBirthdays);

	route.use(path, routes);
	return route;
};
