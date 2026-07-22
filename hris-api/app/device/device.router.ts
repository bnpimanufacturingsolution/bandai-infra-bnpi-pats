import { Router, Request, Response, NextFunction } from "express";
import { cache, cacheShort, cacheMedium, cacheUser } from "../../middleware/cache";
import { uploadImportFile } from "../../middleware/upload";
import { requestTimeout } from "../../middleware/requestTimeout";
import { config } from "../../config/config";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	getEvents(req: Request, res: Response, next: NextFunction): Promise<void>;
	getDeviceHealth(req: Request, res: Response, next: NextFunction): Promise<void>;
	getHikvisionListenerStatus(req: Request, res: Response, next: NextFunction): Promise<void>;
	getDeviceLiveReadiness(req: Request, res: Response, next: NextFunction): Promise<void>;
	proveDeviceLivePath(req: Request, res: Response, next: NextFunction): Promise<void>;
	controlHikvisionListener(req: Request, res: Response, next: NextFunction): Promise<void>;
	searchHikvisionDeviceLogs(req: Request, res: Response, next: NextFunction): Promise<void>;
	getDeviceSyncPreview(req: Request, res: Response, next: NextFunction): Promise<void>;
	getDeviceSyncRuns(req: Request, res: Response, next: NextFunction): Promise<void>;
	getDeviceActivity(req: Request, res: Response, next: NextFunction): Promise<void>;
	resetDeviceEvents(req: Request, res: Response, next: NextFunction): Promise<void>;
	triggerZktecoAttendanceSync(req: Request, res: Response, next: NextFunction): Promise<void>;
	triggerHikvisionAttendanceImport(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void>;
	getDeviceImportJob(req: Request, res: Response, next: NextFunction): Promise<void>;
	cancelDeviceImportJob(req: Request, res: Response, next: NextFunction): Promise<void>;
	startDeviceUserSyncJob(req: Request, res: Response, next: NextFunction): Promise<void>;
	getDeviceUserSyncJob(req: Request, res: Response, next: NextFunction): Promise<void>;
	cancelDeviceUserSyncJob(req: Request, res: Response, next: NextFunction): Promise<void>;
	previewDeviceUserExport(req: Request, res: Response, next: NextFunction): Promise<void>;
	exportDeviceUsers(req: Request, res: Response, next: NextFunction): Promise<void>;
	previewDeviceUserImport(req: Request, res: Response, next: NextFunction): Promise<void>;
	executeDeviceUserImport(req: Request, res: Response, next: NextFunction): Promise<void>;
	getDeviceUserImportJob(req: Request, res: Response, next: NextFunction): Promise<void>;
	listDeviceUsers(req: Request, res: Response, next: NextFunction): Promise<void>;
	deleteDeviceUser(req: Request, res: Response, next: NextFunction): Promise<void>;
	deleteDeviceUsers(req: Request, res: Response, next: NextFunction): Promise<void>;
	captureDeviceUserRawFingerprints(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void>;
	captureDeviceUserRawFace(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void>;
	getDeviceUserPhoto(req: Request, res: Response, next: NextFunction): Promise<void>;
	syncDeviceUsers(req: Request, res: Response, next: NextFunction): Promise<void>;
	backfillDeviceUserLifecycleEvents(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void>;
	backfillDeviceUserBiometricMetadata(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void>;
	reconcileBiometricSync(req: Request, res: Response, next: NextFunction): Promise<void>;
	copyHikvisionDeviceUserToPeer(req: Request, res: Response, next: NextFunction): Promise<void>;
	planHikvisionSdkUserMerge(req: Request, res: Response, next: NextFunction): Promise<void>;
	applyHikvisionSdkUserMerge(req: Request, res: Response, next: NextFunction): Promise<void>;
	startHikvisionSdkUserMergeJob(req: Request, res: Response, next: NextFunction): Promise<void>;
	listHikvisionSdkUserMergeJobs(req: Request, res: Response, next: NextFunction): Promise<void>;
	getHikvisionSdkUserMergeJob(req: Request, res: Response, next: NextFunction): Promise<void>;
	mirrorHikvisionFaceToPeers(req: Request, res: Response, next: NextFunction): Promise<void>;
	mockHikvisionFingerprintTally(req: Request, res: Response, next: NextFunction): Promise<void>;
	mockHikvisionFaceTally(req: Request, res: Response, next: NextFunction): Promise<void>;
	createSyntheticKioskLoginTap(req: Request, res: Response, next: NextFunction): Promise<void>;
	backfillDeviceUsers(req: Request, res: Response, next: NextFunction): Promise<void>;
	linkDeviceUser(req: Request, res: Response, next: NextFunction): Promise<void>;
	unlinkDeviceUser(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	enrollDeviceUser(req: Request, res: Response, next: NextFunction): Promise<void>;
	importDeviceEnrollment(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/device";

	routes.get(
		"/events",
		cache({
			ttl: 15,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:device:events:${(req as any).organizationId || "unknown"}:${queryKey}`;
			},
		}),
		controller.getEvents,
	);
	routes.post("/events/reset", controller.resetDeviceEvents);
	// Nested under /events so Express never treats the path as /:id (device by id).
	routes.get("/events/live-readiness", controller.getDeviceLiveReadiness);
	routes.post("/events/live-readiness/prove", controller.proveDeviceLivePath);
	routes.get("/hikvision/listener", controller.getHikvisionListenerStatus);
	routes.post("/hikvision/listener", controller.controlHikvisionListener);

	routes.get("/:id/health", controller.getDeviceHealth);
	routes.post("/:id/hikvision/log-search", controller.searchHikvisionDeviceLogs);
	routes.get("/users", controller.listDeviceUsers);
	routes.post("/users/export/preview", controller.previewDeviceUserExport);
	routes.post("/users/export", controller.exportDeviceUsers);
	routes.post("/users/import/preview", controller.previewDeviceUserImport);
	routes.post("/users/import/execute", controller.executeDeviceUserImport);
	routes.get("/users/import/jobs/:jobId", controller.getDeviceUserImportJob);
	routes.get("/:id/users", controller.listDeviceUsers);
	routes.post("/:id/users/delete", controller.deleteDeviceUsers);
	routes.post("/:id/users/:vendorUserId/delete", controller.deleteDeviceUser);
	routes.post(
		"/:id/users/:vendorUserId/raw-fingerprints/capture",
		controller.captureDeviceUserRawFingerprints,
	);
	routes.post(
		"/:id/users/:vendorUserId/raw-face/capture",
		controller.captureDeviceUserRawFace,
	);
	routes.get("/users/:userId/photo", controller.getDeviceUserPhoto);
	routes.post("/:id/users/sync", controller.syncDeviceUsers);
	routes.post("/:id/users/lifecycle-backfill", controller.backfillDeviceUserLifecycleEvents);
	routes.post("/:id/users/biometric-metadata/backfill", controller.backfillDeviceUserBiometricMetadata);
	routes.post("/:id/users/backfill", controller.backfillDeviceUsers);
	routes.post("/biometric-sync/reconcile", controller.reconcileBiometricSync);
	routes.post(
		"/hikvision/copy-user",
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "hikvision-copy-user",
		}),
		controller.copyHikvisionDeviceUserToPeer,
	);
	routes.post(
		"/hikvision/sdk-users/merge/plan",
		requestTimeout({
			timeoutMs: config.heavyRequestTimeoutMs,
			label: "hikvision-sdk-user-merge-plan",
		}),
		controller.planHikvisionSdkUserMerge,
	);
	routes.post("/hikvision/sdk-users/merge/apply", controller.applyHikvisionSdkUserMerge);
	routes.post("/hikvision/sdk-users/merge/jobs", controller.startHikvisionSdkUserMergeJob);
	routes.get("/hikvision/sdk-users/merge/jobs", controller.listHikvisionSdkUserMergeJobs);
	routes.get("/hikvision/sdk-users/merge/jobs/:jobId", controller.getHikvisionSdkUserMergeJob);
	routes.post("/hikvision/mirror-face", controller.mirrorHikvisionFaceToPeers);
	routes.post("/hikvision/mock-fingerprint", controller.mockHikvisionFingerprintTally);
	routes.post("/hikvision/mock-face", controller.mockHikvisionFaceTally);
	// Admin-only labeled offline kiosk tap inject (not physical device truth).
	routes.post("/kiosk/synthetic-tap", controller.createSyntheticKioskLoginTap);
	routes.get("/:id/activity", controller.getDeviceActivity);
	routes.get("/:id/sync-runs", controller.getDeviceSyncRuns);
	routes.post("/users/:userId/link", controller.linkDeviceUser);
	routes.post("/users/:userId/unlink", controller.unlinkDeviceUser);
	routes.get("/sync-preview", controller.getDeviceSyncPreview);
	routes.get("/import-jobs/:jobId", controller.getDeviceImportJob);
	routes.post("/import-jobs/:jobId/cancel", controller.cancelDeviceImportJob);
	routes.post("/users/sync-jobs", controller.startDeviceUserSyncJob);
	routes.get("/users/sync-jobs/:jobId", controller.getDeviceUserSyncJob);
	routes.post("/users/sync-jobs/:jobId/cancel", controller.cancelDeviceUserSyncJob);
	routes.post("/zkteco/sync", controller.triggerZktecoAttendanceSync);
	routes.post("/hikvision/sync", controller.triggerHikvisionAttendanceImport);
	routes.post("/hikvision/import", controller.triggerHikvisionAttendanceImport);

	/**
	 * @openapi
	 * /api/device/{id}:
	 *   get:
	 *     summary: Get device by ID
	 *     description: Retrieve a specific device by its unique identifier with optional field selection
	 *     tags: [Device]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Device ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports nested fields with dot notation)
	 *         example: "id,name,description,type"
	 *     responses:
	 *       200:
	 *         description: Device retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         device:
	 *                           $ref: '#/components/schemas/Device'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache individual device with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:device:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/device:
	 *   get:
	 *     summary: Get all devices
	 *     description: Retrieve devices with advanced filtering, pagination, sorting, field selection, and optional grouping
	 *     tags: [Device]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *         description: Page number for pagination
	 *         example: 1
	 *       - in: query
	 *         name: limit
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 10
	 *         description: Number of records per page
	 *         example: 10
	 *       - in: query
	 *         name: order
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: [asc, desc]
	 *           default: desc
	 *         description: Sort order for results
	 *         example: desc
	 *       - in: query
	 *         name: sort
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Field to sort by or JSON object for multi-field sorting
	 *         example: "createdAt"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports dot notation)
	 *         example: "id,name,description,type"
	 *       - in: query
	 *         name: query
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Search query to filter by name or description
	 *         example: "welcome email"
	 *       - in: query
	 *         name: filter
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: JSON array of filter objects for advanced filtering
	 *         example: '[{"type":"email"},{"isDeleted":false}]'
	 *       - in: query
	 *         name: groupBy
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Group results by a field name
	 *         example: "type"
	 *       - in: query
	 *         name: document
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include device documents in response
	 *       - in: query
	 *         name: pagination
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include pagination metadata in response
	 *       - in: query
	 *         name: count
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include total count in response
	 *     responses:
	 *       200:
	 *         description: Templates retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         devices:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/Device'
	 *                           description: Present when document="true" and no groupBy
	 *                         groups:
	 *                           type: object
	 *                           additionalProperties:
	 *                             type: array
	 *                             items:
	 *                               $ref: '#/components/schemas/Device'
	 *                           description: Present when groupBy is used and document="true"
	 *                         count:
	 *                           type: integer
	 *                           description: Present when count="true"
	 *                         pagination:
	 *                           $ref: '#/components/schemas/Pagination'
	 *                           description: Present when pagination="true"
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache device list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:device:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/device:
	 *   post:
	 *     summary: Create new device
	 *     description: Create a new device with the provided data
	 *     tags: [Device]
	 *     security:
	 *       - bearerAuth: []
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
	 *                 description: Device name
	 *                 example: "Email Welcome Device"
	 *               description:
	 *                 type: string
	 *                 description: Device description
	 *                 example: "Welcome email device for new users"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: Device type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 default: false
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
	 *               isDeleted:
	 *                 type: boolean
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
	 *               isDeleted:
	 *                 type: boolean
	 *     responses:
	 *       201:
	 *         description: Device created successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         device:
	 *                           $ref: '#/components/schemas/Device'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/device/enroll:
	 *   post:
	 *     summary: Enroll one user to one device
	 *     description: Updates auth user metadata and syncs employee.deviceEmpId in HRIS
	 *     tags: [Device]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.post("/enroll", controller.enrollDeviceUser);

	/**
	 * @openapi
	 * /api/device/enroll/import:
	 *   post:
	 *     summary: Import device enrollments
	 *     description: Bulk enroll users to devices via CSV/XLSX import
	 *     tags: [Device]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       content:
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               file:
	 *                 type: string
	 *                 format: binary
	 *     responses:
	 *       200:
	 *         description: Import completed
	 */
	routes.post("/enroll/import", uploadImportFile, controller.importDeviceEnrollment);

	/**
	 * @openapi
	 * /api/device/{id}:
	 *   patch:
	 *     summary: Update device
	 *     description: Update device data by ID (partial update)
	 *     tags: [Device]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Device ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
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
	 *                 description: Device name
	 *                 example: "Updated Email Device"
	 *               description:
	 *                 type: string
	 *                 description: Device description
	 *                 example: "Updated description for the device"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: Device type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 example: false
	 *     responses:
	 *       200:
	 *         description: Device updated successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         device:
	 *                           $ref: '#/components/schemas/Device'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.patch("/:id", controller.update);

	/**
	 * @openapi
	 * /api/device/{id}:
	 *   delete:
	 *     summary: Delete device
	 *     description: Permanently delete a device by ID
	 *     tags: [Device]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Device ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Device deleted successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       description: Empty object for successful deletion
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.delete("/:id", controller.remove);

	/**
	 * @openapi
	 * /api/device/enroll/import:
	 *   post:
	 *     summary: Import device enrollments from file
	 *     description: Bulk enroll users to devices via CSV/Excel upload
	 *     tags: [Device]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - file
	 *             properties:
	 *               file:
	 *                 type: string
	 *                 format: binary
	 *                 description: CSV or Excel file with columns EMAIL, DEVICE_ID, DEVICE_USER_ID
	 *     responses:
	 *       200:
	 *         description: Import completed
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 summary:
	 *                   type: object
	 *                   properties:
	 *                     totalRows:
	 *                       type: number
	 *                     processedRows:
	 *                       type: number
	 *                     enrolled:
	 *                       type: number
	 *                     failed:
	 *                       type: number
	 *                     errors:
	 *                       type: array
	 *                       items:
	 *                         type: string
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/enroll/import", uploadImportFile, controller.importDeviceEnrollment);

	route.use(path, routes);

	return route;
};
