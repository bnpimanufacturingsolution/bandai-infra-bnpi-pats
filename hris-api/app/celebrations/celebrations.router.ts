import { Router, Request, Response, NextFunction } from "express";

interface ICelebrationsController {
	getBirthdays(req: Request, res: Response, next: NextFunction): Promise<void>;
	getPublicBirthdays(req: Request, res: Response, next: NextFunction): Promise<void>;
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

	/**
	 * @openapi
	 * /api/celebrations/public/birthdays:
	 *   get:
	 *     summary: Get monthly birthday celebrants (public kiosk feed)
	 *     description: Returns employee and kids birthday celebrants for the selected month, optionally filtered by day. For unauthenticated kiosk displays.
	 *     tags: [Celebrations]
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
	 *         name: day
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 31
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
	 *       - in: query
	 *         name: organizationId
	 *         required: false
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: organizationCode
	 *         required: false
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Birthday celebrants retrieved successfully
	 *       400:
	 *         description: Invalid query parameters
	 *       500:
	 *         description: Internal server error
	 */
	routes.get("/public/birthdays", controller.getPublicBirthdays);

	route.use(path, routes);
	return route;
};
