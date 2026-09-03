import { Router, Request, Response, NextFunction } from "express";
import { cache } from "../../../middleware/cache";

interface IController {
	getAcsEvents(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	getAcsEventCapabilities(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<Response | void>;
	getStorageConfig(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	updateStorageConfig(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	getStorageConfigCapabilities(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<Response | void>;
	getAcsEventTotalNum(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	getAcsEventTotalNumCapabilities(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<Response | void>;
	getAcsWorkStatus(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	getAcsWorkStatusCapabilities(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<Response | void>;
	getUserInfoCapabilities(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<Response | void>;
	getUserInfoCount(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	deleteUserInfo(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	modifyUserInfo(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	recordUserInfo(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	searchUserInfo(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	setUpUserInfo(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	getUserInfoDetailDeleteCapabilities(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<Response | void>;
	deleteUserInfoDetail(req: Request, res: Response, next: NextFunction): Promise<Response | void>;
	getUserInfoDetailDeleteProcess(
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
	const path = "/access-control";

	if (authMiddleware) {
		routes.use(authMiddleware);
	}

	/**
	 * @openapi
	 * /api/hikvision/access-control/acs-events:
	 *   post:
	 *     summary: Search for ACS Events
	 *     description: Search for access control system events from the Hikvision device using POST method with search criteria
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: false
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               AcsEventCond:
	 *                 type: object
	 *                 properties:
	 *                   searchID:
	 *                     type: string
	 *                   searchResultPosition:
	 *                     type: number
	 *                   maxResults:
	 *                     type: number
	 *                   major:
	 *                     type: number
	 *                   minor:
	 *                     type: number
	 *                   startTime:
	 *                     type: string
	 *                   endTime:
	 *                     type: string
	 *                   timeReverseOrder:
	 *                     type: boolean
	 *     responses:
	 *       200:
	 *         description: ACS events retrieved successfully
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
	routes.post("/acs-events", controller.getAcsEvents);

	/**
	 * @openapi
	 * /api/hikvision/access-control/acs-events/capabilities:
	 *   get:
	 *     summary: Get ACS Event Capabilities
	 *     description: Retrieve capabilities for ACS events from the Hikvision device
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: ACS event capabilities retrieved successfully
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
		"/acs-events/capabilities",
		cache({
			ttl: 300,
			keyGenerator: () => {
				return `cache:hikvision:acs:events:capabilities`;
			},
		}),
		controller.getAcsEventCapabilities,
	);

	/**
	 * @openapi
	 * /api/hikvision/access-control/storage-config:
	 *   get:
	 *     summary: Get Storage Configuration
	 *     description: Retrieve storage configuration for ACS events from the Hikvision device
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Storage configuration retrieved successfully
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
		"/storage-config",
		cache({
			ttl: 90,
			keyGenerator: () => {
				return `cache:hikvision:acs:storage:config`;
			},
		}),
		controller.getStorageConfig,
	);

	/**
	 * @openapi
	 * /api/hikvision/access-control/storage-config:
	 *   put:
	 *     summary: Update Storage Configuration
	 *     description: Update storage configuration for ACS events on the Hikvision device
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
	 *         description: Storage configuration updated successfully
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
	routes.put("/storage-config", controller.updateStorageConfig);

	/**
	 * @openapi
	 * /api/hikvision/access-control/storage-config/capabilities:
	 *   get:
	 *     summary: Get Storage Configuration Capabilities
	 *     description: Retrieve capabilities for storage configuration from the Hikvision device
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Storage configuration capabilities retrieved successfully
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
		"/storage-config/capabilities",
		cache({
			ttl: 300,
			keyGenerator: () => {
				return `cache:hikvision:acs:storage:config:capabilities`;
			},
		}),
		controller.getStorageConfigCapabilities,
	);

	/**
	 * @openapi
	 * /api/hikvision/access-control/acs-event-total-num:
	 *   get:
	 *     summary: Get ACS Event Total Number
	 *     description: Retrieve the total number of ACS events from the Hikvision device
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: ACS event total number retrieved successfully
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
		"/acs-event-total-num",
		cache({
			ttl: 30,
			keyGenerator: () => {
				return `cache:hikvision:acs:event:total:num`;
			},
		}),
		controller.getAcsEventTotalNum,
	);

	/**
	 * @openapi
	 * /api/hikvision/access-control/acs-event-total-num/capabilities:
	 *   get:
	 *     summary: Get ACS Event Total Number Capabilities
	 *     description: Retrieve capabilities for ACS event total number from the Hikvision device
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: ACS event total number capabilities retrieved successfully
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
		"/acs-event-total-num/capabilities",
		cache({
			ttl: 300,
			keyGenerator: () => {
				return `cache:hikvision:acs:event:total:num:capabilities`;
			},
		}),
		controller.getAcsEventTotalNumCapabilities,
	);

	/**
	 * @openapi
	 * /api/hikvision/access-control/acs-work-status:
	 *   get:
	 *     summary: Get ACS Work Status
	 *     description: Retrieve the work status of the access control system from the Hikvision device
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: ACS work status retrieved successfully
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
		"/acs-work-status",
		cache({
			ttl: 30,
			keyGenerator: () => {
				return `cache:hikvision:acs:work:status`;
			},
		}),
		controller.getAcsWorkStatus,
	);

	/**
	 * @openapi
	 * /api/hikvision/access-control/acs-work-status/capabilities:
	 *   get:
	 *     summary: Get ACS Work Status Capabilities
	 *     description: Retrieve capabilities for ACS work status from the Hikvision device
	 *     tags: [Hikvision]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: ACS work status capabilities retrieved successfully
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
		"/acs-work-status/capabilities",
		cache({
			ttl: 300,
			keyGenerator: () => {
				return `cache:hikvision:acs:work:status:capabilities`;
			},
		}),
		controller.getAcsWorkStatusCapabilities,
	);

	// UserInfo endpoints
	routes.get(
		"/user-info/capabilities",
		cache({
			ttl: 300,
			keyGenerator: () => {
				return `cache:hikvision:userinfo:capabilities`;
			},
		}),
		controller.getUserInfoCapabilities,
	);

	routes.get(
		"/user-info/count",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const organizationId = String((req as any).organizationId || "unknown");
				const deviceId = String(req.query?.deviceId || "default").trim() || "default";
				return `cache:hikvision:userinfo:count:${organizationId}:${deviceId}`;
			},
		}),
		controller.getUserInfoCount,
	);

	routes.put("/user-info/delete", controller.deleteUserInfo);

	routes.put("/user-info/modify", controller.modifyUserInfo);

	routes.post("/user-info/record", controller.recordUserInfo);

	routes.post(
		"/user-info/search",
		cache({
			ttl: 30,
			keyGenerator: (req: Request) => {
				return `cache:hikvision:userinfo:search:${JSON.stringify(req.body)}`;
			},
		}),
		controller.searchUserInfo,
	);

	routes.put("/user-info/setup", controller.setUpUserInfo);

	// UserInfoDetail endpoints
	routes.get(
		"/user-info-detail/delete/capabilities",
		cache({
			ttl: 300,
			keyGenerator: () => {
				return `cache:hikvision:userinfodetail:delete:capabilities`;
			},
		}),
		controller.getUserInfoDetailDeleteCapabilities,
	);

	routes.put("/user-info-detail/delete", controller.deleteUserInfoDetail);

	routes.get(
		"/user-info-detail/delete-process",
		cache({
			ttl: 5,
			keyGenerator: () => {
				return `cache:hikvision:userinfodetail:delete:process`;
			},
		}),
		controller.getUserInfoDetailDeleteProcess,
	);

	route.use(path, routes);

	return route;
};
