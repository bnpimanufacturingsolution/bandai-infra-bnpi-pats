import { Router, Request, Response, NextFunction } from "express";
import { cache, cacheShort, cacheMedium, cacheUser } from "../../middleware/cache";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/person";

	/**
	 * @openapi
	 * /api/person/{id}:
	 *   get:
	 *     summary: Get person by id
	 *     description: Get person by id with optional fields to include
	 *     tags: [Person]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Person ID (ObjectId format)
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports nested fields with dot notation)
	 *     responses:
	 *       200:
	 *         description: Person retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "success"
	 *                 message:
	 *                   type: string
	 *                   example: "Person retrieved successfully"
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     person:
	 *                       type: object
	 *                       properties:
	 *                         id:
	 *                           type: string
	 *                         name:
	 *                           type: string
	 *                         description:
	 *                           type: string
	 *                         type:
	 *                           type: string
	 *                         createdAt:
	 *                           type: string
	 *                           format: date-time
	 *                         updatedAt:
	 *                           type: string
	 *                           format: date-time
	 *                 code:
	 *                   type: number
	 *                   example: 200
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 *       400:
	 *         description: Bad request - Missing ID or invalid fields parameter
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "error"
	 *                 message:
	 *                   type: string
	 *                   example: "ID parameter is required"
	 *                 code:
	 *                   type: number
	 *                   example: 400
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 *       404:
	 *         description: Person not found
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "error"
	 *                 message:
	 *                   type: string
	 *                   example: "Person not found"
	 *                 code:
	 *                   type: number
	 *                   example: 404
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 *       500:
	 *         description: Internal server error
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "error"
	 *                 message:
	 *                   type: string
	 *                   example: "Internal server error"
	 *                 code:
	 *                   type: number
	 *                   example: 500
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 */
	// Cache individual person with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:person:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/person:
	 *   get:
	 *     summary: Get all persons
	 *     description: Get all persons with filtering, pagination, sorting, field selection, optional grouping, and conditional document/count/pagination outputs
	 *     tags: [Person]
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *         description: Page number (default 1)
	 *       - in: query
	 *         name: limit
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 10
	 *         description: Records per page (default 10)
	 *       - in: query
	 *         name: order
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: [asc, desc]
	 *           default: desc
	 *         description: Sort order (default desc)
	 *       - in: query
	 *         name: sort
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Field to sort by or a stringified JSON object for multi-field sorting
	 *         example: '{"createdAt":"desc","name":"asc"}'
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports nested fields with dot notation)
	 *       - in: query
	 *         name: query
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Search query to filter results by name or description (case-insensitive)
	 *       - in: query
	 *         name: filter
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Stringified JSON array of filter objects for advanced filtering
	 *         example: '[{"name":"foo"},{"createdAt":{"gte":"2024-01-01"}}]'
	 *       - in: query
	 *         name: groupBy
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Group results by a field; accepts a field name or stringified JSON array (first field used)
	 *         example: 'type'
	 *       - in: query
	 *         name: document
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Set to "true" to include person documents in response (data.persons). With groupBy, returns grouped documents in data.groups
	 *       - in: query
	 *         name: pagination
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Set to "true" to include pagination metadata in response (data.pagination)
	 *       - in: query
	 *         name: count
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Set to "true" to include total count in response (data.count)
	 *     responses:
	 *       200:
	 *         description: Templates retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "success"
	 *                 message:
	 *                   type: string
	 *                   example: "Templates retrieved successfully"
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     persons:
	 *                       type: array
	 *                       description: Present only when document="true" and groupBy is not used
	 *                       items:
	 *                         type: object
	 *                         properties:
	 *                           id:
	 *                             type: string
	 *                           name:
	 *                             type: string
	 *                           description:
	 *                             type: string
	 *                           type:
	 *                             type: string
	 *                           createdAt:
	 *                             type: string
	 *                             format: date-time
	 *                           updatedAt:
	 *                             type: string
	 *                             format: date-time
	 *                     groups:
	 *                       type: object
	 *                       additionalProperties:
	 *                         type: array
	 *                         items:
	 *                           type: object
	 *                           properties:
	 *                             id:
	 *                               type: string
	 *                             name:
	 *                               type: string
	 *                             description:
	 *                               type: string
	 *                             type:
	 *                               type: string
	 *                             createdAt:
	 *                               type: string
	 *                               format: date-time
	 *                             updatedAt:
	 *                               type: string
	 *                               format: date-time
	 *                       description: Present only when groupBy is provided and document="true". Keys are group values, values are arrays of persons
	 *                     count:
	 *                       type: integer
	 *                       description: Present only when count="true"; total matching records
	 *                     pagination:
	 *                       type: object
	 *                       description: Present only when pagination="true"; pagination metadata for the current query
	 *                       properties:
	 *                         total:
	 *                           type: integer
	 *                         page:
	 *                           type: integer
	 *                         limit:
	 *                           type: integer
	 *                         totalPages:
	 *                           type: integer
	 *                         hasNext:
	 *                           type: boolean
	 *                         hasPrev:
	 *                           type: boolean
	 *                 code:
	 *                   type: number
	 *                   example: 200
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 *       400:
	 *         description: Bad request - Invalid query parameters
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "error"
	 *                 message:
	 *                   type: string
	 *                   example: "Invalid page"
	 *                 code:
	 *                   type: number
	 *                   example: 400
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 *       500:
	 *         description: Internal server error
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "error"
	 *                 message:
	 *                   type: string
	 *                   example: "Internal server error"
	 *                 code:
	 *                   type: number
	 *                   example: 500
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 */
	// Cache person list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:person:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/person:
	 *   post:
	 *     summary: Create new person
	 *     description: Creates a new person
	 *     tags: [Person]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *                 description: Person name (required)
	 *               description:
	 *                 type: string
	 *                 description: Person description (optional)
	 *               type:
	 *                 type: string
	 *                 description: Person type for categorization (optional)
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *     responses:
	 *       201:
	 *         description: Person created successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "success"
	 *                 message:
	 *                   type: string
	 *                   example: "Person created successfully"
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     person:
	 *                       type: object
	 *                       properties:
	 *                         id:
	 *                           type: string
	 *                         name:
	 *                           type: string
	 *                         description:
	 *                           type: string
	 *                         type:
	 *                           type: string
	 *                         createdAt:
	 *                           type: string
	 *                           format: date-time
	 *                         updatedAt:
	 *                           type: string
	 *                           format: date-time
	 *                 code:
	 *                   type: number
	 *                   example: 201
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 *       400:
	 *         description: Validation error
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "error"
	 *                 message:
	 *                   type: string
	 *                   example: "Validation failed"
	 *                 code:
	 *                   type: number
	 *                   example: 400
	 *                 errors:
	 *                   type: array
	 *                   items:
	 *                     type: object
	 *                     properties:
	 *                       field:
	 *                         type: string
	 *                       message:
	 *                         type: string
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 *       500:
	 *         description: Internal server error
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "error"
	 *                 message:
	 *                   type: string
	 *                   example: "Internal server error"
	 *                 code:
	 *                   type: number
	 *                   example: 500
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/person/{id}:
	 *   patch:
	 *     summary: Update person
	 *     description: Update person data by id (partial update)
	 *     tags: [Person]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Person ID (ObjectId format)
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             minProperties: 1
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *                 description: Person name (optional)
	 *               description:
	 *                 type: string
	 *                 description: Person description (optional)
	 *               type:
	 *                 type: string
	 *                 description: Person type for categorization (optional)
	 *     responses:
	 *       200:
	 *         description: Person updated successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "success"
	 *                 message:
	 *                   type: string
	 *                   example: "Person updated successfully"
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     person:
	 *                       type: object
	 *                       properties:
	 *                         id:
	 *                           type: string
	 *                         name:
	 *                           type: string
	 *                         description:
	 *                           type: string
	 *                         type:
	 *                           type: string
	 *                         createdAt:
	 *                           type: string
	 *                           format: date-time
	 *                         updatedAt:
	 *                           type: string
	 *                           format: date-time
	 *                 code:
	 *                   type: number
	 *                   example: 200
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 *       400:
	 *         description: Bad request - Missing ID, no update fields, or validation error
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "error"
	 *                 message:
	 *                   type: string
	 *                   example: "No fields provided for update"
	 *                 code:
	 *                   type: number
	 *                   example: 400
	 *                 errors:
	 *                   type: array
	 *                   items:
	 *                     type: object
	 *                     properties:
	 *                       field:
	 *                         type: string
	 *                       message:
	 *                         type: string
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 *       404:
	 *         description: Person not found
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "error"
	 *                 message:
	 *                   type: string
	 *                   example: "Person not found"
	 *                 code:
	 *                   type: number
	 *                   example: 404
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 *       500:
	 *         description: Internal server error
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "error"
	 *                 message:
	 *                   type: string
	 *                   example: "Internal server error"
	 *                 code:
	 *                   type: number
	 *                   example: 500
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 */
	routes.patch("/:id", controller.update);

	/**
	 * @openapi
	 * /api/person/{id}:
	 *   delete:
	 *     summary: Delete person
	 *     description: Permanently delete a person by ID
	 *     tags: [Person]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Person ID (ObjectId format)
	 *     responses:
	 *       200:
	 *         description: Person deleted successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "success"
	 *                 message:
	 *                   type: string
	 *                   example: "Person deleted successfully"
	 *                 data:
	 *                   type: object
	 *                   example: {}
	 *                 code:
	 *                   type: number
	 *                   example: 200
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 *       400:
	 *         description: Bad request - Missing ID
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "error"
	 *                 message:
	 *                   type: string
	 *                   example: "ID parameter is required"
	 *                 code:
	 *                   type: number
	 *                   example: 400
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 *       404:
	 *         description: Person not found
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "error"
	 *                 message:
	 *                   type: string
	 *                   example: "Person not found"
	 *                 code:
	 *                   type: number
	 *                   example: 404
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 *       500:
	 *         description: Internal server error
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   example: "error"
	 *                 message:
	 *                   type: string
	 *                   example: "Internal server error"
	 *                 code:
	 *                   type: number
	 *                   example: 500
	 *                 timestamp:
	 *                   type: string
	 *                   format: date-time
	 */
	routes.delete("/:id", controller.remove);

	route.use(path, routes);

	return route;
};
