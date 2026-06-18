import { Router, Request, Response, NextFunction } from "express";
import { cache } from "../../../middleware/cache";

interface IController {
	listUsers(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	getUserById(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	createUser(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	updateUser(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	deleteUser(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	checkUser(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	getUserPermissions(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	getUserLocalPermission(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<Response | void>;
	getUserRemotePermission(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<Response | void>;
	getAdminCapabilities(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	getOperatorCapabilities(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<Response | void>;
	getViewerCapabilities(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<Response | void>;
	listUserPermissions(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	updateUserPermissions(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<Response | void>;
	updateUserPermissionById(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<Response | void>;
	updateUserLocalPermission(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<Response | void>;
	updateUserRemotePermission(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<Response | void>;
}

export const router = (
	route: Router,
	controller: IController,
	authMiddleware?: (req: Request, res: Response, next: NextFunction) => void,
): Router => {
	const routes = Router();
	const path = "/users";

	if (authMiddleware) {
		routes.use(authMiddleware);
	}

	/**
	 * @openapi
	 * /api/hikvision/users:
	 *   get:
	 *     summary: List all users from Hikvision device
	 *     description: Retrieve all users from the Hikvision access control system
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Users retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				return `cache:hikvision:users:list`;
			},
		}),
		controller.listUsers,
	);

	/**
	 * @openapi
	 * /api/hikvision/users/{id}:
	 *   get:
	 *     summary: Get user by ID from Hikvision device
	 *     description: Retrieve a specific user by ID from the Hikvision access control system
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: User ID
	 *         example: "1"
	 *     responses:
	 *       200:
	 *         description: User retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				return `cache:hikvision:users:byId:${req.params.id}`;
			},
		}),
		controller.getUserById,
	);

	/**
	 * @openapi
	 * /api/hikvision/users:
	 *   post:
	 *     summary: Create a new user on Hikvision device
	 *     description: Create a new user in the Hikvision access control system
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *     responses:
	 *       201:
	 *         description: User created successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.createUser);

	/**
	 * @openapi
	 * /api/hikvision/users/{id}:
	 *   put:
	 *     summary: Update user on Hikvision device
	 *     description: Update an existing user in the Hikvision access control system
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: User ID
	 *         example: "1"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *     responses:
	 *       200:
	 *         description: User updated successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.put("/:id", controller.updateUser);

	/**
	 * @openapi
	 * /api/hikvision/users/{id}:
	 *   delete:
	 *     summary: Delete user from Hikvision device
	 *     description: Delete a user from the Hikvision access control system
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: User ID
	 *         example: "1"
	 *     responses:
	 *       200:
	 *         description: User deleted successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.delete("/:id", controller.deleteUser);

	/**
	 * @openapi
	 * /api/hikvision/users/check:
	 *   get:
	 *     summary: Check user on Hikvision device (digest authentication)
	 *     description: Log in to the device by digest. This URL is used to check whether the user name matches with the password.
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: User check completed successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/check", controller.checkUser);

	/**
	 * @openapi
	 * /api/hikvision/users/{id}/permissions:
	 *   get:
	 *     summary: Get user permissions
	 *     description: Retrieve permissions for a specific user from the Hikvision access control system
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: User ID
	 *         example: "1"
	 *     responses:
	 *       200:
	 *         description: User permissions retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/:id/permissions",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				return `cache:hikvision:users:permissions:${req.params.id}`;
			},
		}),
		controller.getUserPermissions,
	);

	/**
	 * @openapi
	 * /api/hikvision/users/{id}/permissions/local:
	 *   get:
	 *     summary: Get user local permissions
	 *     description: Retrieve local permissions for a specific user from the Hikvision access control system
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: User ID
	 *         example: "1"
	 *     responses:
	 *       200:
	 *         description: User local permissions retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/:id/permissions/local",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				return `cache:hikvision:users:permissions:local:${req.params.id}`;
			},
		}),
		controller.getUserLocalPermission,
	);

	/**
	 * @openapi
	 * /api/hikvision/users/{id}/permissions/remote:
	 *   get:
	 *     summary: Get user remote permissions
	 *     description: Retrieve remote permissions for a specific user from the Hikvision access control system
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: User ID
	 *         example: "1"
	 *     responses:
	 *       200:
	 *         description: User remote permissions retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/:id/permissions/remote",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				return `cache:hikvision:users:permissions:remote:${req.params.id}`;
			},
		}),
		controller.getUserRemotePermission,
	);

	/**
	 * @openapi
	 * /api/hikvision/users/capabilities/admin:
	 *   get:
	 *     summary: Get admin capabilities
	 *     description: Retrieve admin capabilities from the Hikvision access control system
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Admin capabilities retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/capabilities/admin",
		cache({
			ttl: 300,
			keyGenerator: () => {
				return `cache:hikvision:users:capabilities:admin`;
			},
		}),
		controller.getAdminCapabilities,
	);

	/**
	 * @openapi
	 * /api/hikvision/users/capabilities/operator:
	 *   get:
	 *     summary: Get operator capabilities
	 *     description: Retrieve operator capabilities from the Hikvision access control system
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Operator capabilities retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/capabilities/operator",
		cache({
			ttl: 300,
			keyGenerator: () => {
				return `cache:hikvision:users:capabilities:operator`;
			},
		}),
		controller.getOperatorCapabilities,
	);

	/**
	 * @openapi
	 * /api/hikvision/users/capabilities/viewer:
	 *   get:
	 *     summary: Get viewer capabilities
	 *     description: Retrieve viewer capabilities from the Hikvision access control system
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Viewer capabilities retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/capabilities/viewer",
		cache({
			ttl: 300,
			keyGenerator: () => {
				return `cache:hikvision:users:capabilities:viewer`;
			},
		}),
		controller.getViewerCapabilities,
	);

	/**
	 * @openapi
	 * /api/hikvision/users/permissions:
	 *   get:
	 *     summary: Get all user permissions
	 *     description: Get the user permission list of the device
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: User permissions list retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/permissions",
		cache({
			ttl: 90,
			keyGenerator: () => {
				return `cache:hikvision:users:permissions:list`;
			},
		}),
		controller.listUserPermissions,
	);

	/**
	 * @openapi
	 * /api/hikvision/users/permissions:
	 *   put:
	 *     summary: Update all user permissions
	 *     description: Set the user permission list of the device
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *     responses:
	 *       200:
	 *         description: User permissions list updated successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.put("/permissions", controller.updateUserPermissions);

	/**
	 * @openapi
	 * /api/hikvision/users/{id}/permissions:
	 *   put:
	 *     summary: Update user permission by ID
	 *     description: Set a specific user's permission
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: User ID
	 *         example: "1"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *     responses:
	 *       200:
	 *         description: User permission updated successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.put("/:id/permissions", controller.updateUserPermissionById);

	/**
	 * @openapi
	 * /api/hikvision/users/{id}/permissions/local:
	 *   put:
	 *     summary: Update user local permission
	 *     description: Set the local permission of a specified user
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: User ID
	 *         example: "1"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *     responses:
	 *       200:
	 *         description: User local permission updated successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.put("/:id/permissions/local", controller.updateUserLocalPermission);

	/**
	 * @openapi
	 * /api/hikvision/users/{id}/permissions/remote:
	 *   put:
	 *     summary: Update user remote permission
	 *     description: Set the remote permission of a specified user
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: User ID
	 *         example: "1"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *     responses:
	 *       200:
	 *         description: User remote permission updated successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.put("/:id/permissions/remote", controller.updateUserRemotePermission);

	route.use(path, routes);

	return route;
};
