import { Router, Request, Response, NextFunction } from "express";
import express from "express";

	interface IController {
	handleCallback(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/callback";

	// NOTE: This endpoint is intentionally PUBLIC (no authentication required)
	// Hikvision devices cannot provide authentication tokens when sending webhooks
	// The /hikvision path is excluded from auth middleware in index.ts

	// Add text parser for XML content (Hikvision sends XML)
	routes.use(express.text({ type: ["application/xml", "text/xml"] }));

	/**
	 * @openapi
	 * /api/hikvision/callback:
	 *   post:
	 *     summary: Hikvision Webhook Callback Endpoint
	 *     description: Receives HTTP host events from Hikvision devices via webhook/callback
	 *     tags: [Hikvision]
	 *     requestBody:
	 *       required: false
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             description: Event data from Hikvision device
	 *         application/xml:
	 *           schema:
	 *             type: string
	 *             description: XML event data from Hikvision device
	 *         text/xml:
	 *           schema:
	 *             type: string
	 *             description: XML event data from Hikvision device
	 *     responses:
	 *       200:
	 *         description: Callback event received and processed successfully
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
	 *                         received:
	 *                           type: boolean
	 *                         timestamp:
	 *                           type: string
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */

	routes.post("/", express.text({ type: "*/*" }), controller.handleCallback);

	route.use(path, routes);

	return route;
};
