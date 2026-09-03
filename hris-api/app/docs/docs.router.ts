import { Router, Request, Response, NextFunction } from "express";

interface IDocsController {
	exportDocs(req: Request, res: Response, next: NextFunction): Promise<void>;
	getSwagger(req: Request, res: Response, next: NextFunction): Promise<void>;
	getPostman(req: Request, res: Response, next: NextFunction): Promise<void>;
	generateIml(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IDocsController): Router => {
	const routes = Router();
	const path = "/docs";

	/**
	 * @openapi
	 * /api/docs/api-list:
	 *   get:
	 *     summary: Get API endpoints list
	 *     description: Get a list of all API endpoints in various formats
	 *     tags: [Documentation]
	 *     parameters:
	 *       - in: query
	 *         name: format
	 *         schema:
	 *           type: string
	 *           enum: [json, text]
	 *         description: Output format (default json)
	 *       - in: query
	 *         name: tag
	 *         schema:
	 *           type: string
	 *         description: Filter by tag (case-insensitive)
	 *       - in: query
	 *         name: method
	 *         schema:
	 *           type: string
	 *           enum: [GET, POST, PUT, PATCH, DELETE]
	 *         description: Filter by HTTP method
	 *     responses:
	 *       200:
	 *         description: API endpoints list retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                 message:
	 *                   type: string
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     endpoints:
	 *                       type: array
	 *                       items:
	 *                         type: object
	 *                     total:
	 *                       type: integer
	 *                     filters:
	 *                       type: object
	 *           text/plain:
	 *             schema:
	 *               type: string
	 *       404:
	 *         description: Endpoints file not found
	 *       400:
	 *         description: Invalid format or validation error
	 */
	routes.get("/api-list", controller.exportDocs);

	/**
	 * @openapi
	 * /api/docs/swagger:
	 *   get:
	 *     summary: Get Swagger documentation
	 *     description: Get the complete Swagger/OpenAPI specification
	 *     tags: [Documentation]
	 *     responses:
	 *       200:
	 *         description: Swagger documentation retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *       404:
	 *         description: Swagger file not found
	 */
	routes.get("/swagger", controller.getSwagger);

	/**
	 * @openapi
	 * /api/docs/postman:
	 *   get:
	 *     summary: Get Postman collection
	 *     description: Get the Postman collection for API testing
	 *     tags: [Documentation]
	 *     responses:
	 *       200:
	 *         description: Postman collection retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *       404:
	 *         description: Postman collection not found
	 */
	routes.get("/postman", controller.getPostman);

	/**
	 * @openapi
	 * /api/docs/iml:
	 *   get:
	 *     summary: Generate iml files
	 *     description: Generate iml files them to docs/generated/endpoints/ directory
	 *     tags: [Documentation]
	 *     parameters:
	 *       - in: query
	 *         name: tag
	 *         schema:
	 *           type: string
	 *         description: Filter by specific tag (e.g., "template", "docs", "api")
	 *       - in: query
	 *         name: includeContent
	 *         schema:
	 *           type: string
	 *           enum: ["true", "false"]
	 *           default: "true"
	 *         description: Whether to include file contents in response or just file names
	 *       - in: query
	 *         name: format
	 *         schema:
	 *           type: string
	 *           enum: ["json", "xml"]
	 *           default: "json"
	 *         description: Output format (json or xml)
	 *     responses:
	 *       200:
	 *         description: iml files generated successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                 message:
	 *                   type: string
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     tagFiles:
	 *                       type: object
	 *                       description: Object containing tag names as keys and iml arrays as values
	 *                     availableTagFiles:
	 *                       type: array
	 *                       items:
	 *                         type: string
	 *                       description: Available tag file names (when includeContent=false)
	 *           application/xml:
	 *             schema:
	 *               type: string
	 *               description: XML representation of the iml data
	 *       500:
	 *         description: Internal server error
	 */
	routes.get("/iml", controller.generateIml);

	route.use(path, routes);

	return route;
};
