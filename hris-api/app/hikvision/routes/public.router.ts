import { Router, Request, Response } from "express";

export const router = (route: Router): Router => {
	const routes = Router();
	const path = "/public";

	/**
	 * @openapi
	 * /api/hikvision/public:
	 *   get:
	 *     summary: Public Test Endpoint
	 *     description: A public endpoint for testing LAN connectivity
	 *     tags: [Hikvision]
	 *     responses:
	 *       200:
	 *         description: Success response
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 message:
	 *                   type: string
	 *                 timestamp:
	 *                   type: string
	 *                 path:
	 *                   type: string
	 */
	routes.get("/", (req: Request, res: Response) => {
		res.status(200).json({
			message: "Public endpoint is working!",
			timestamp: new Date().toISOString(),
			path: "/api/hikvision/public",
		});
	});

	route.use(path, routes);

	return route;
};
