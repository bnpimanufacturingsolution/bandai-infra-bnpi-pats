import express, { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../generated/prisma";
import { getEligibilityCandidates } from "../../helper/eligibility.helper";
import { getLogger } from "../../helper/logger.helper";
import { buildErrorResponse } from "../../helper/error-handler";

const init = (prisma: PrismaClient) => {
	const router = express.Router();
	const logger = getLogger();

	/**
	 * @swagger
	 * /eligibility/candidates:
	 *   get:
	 *     summary: Get list of employees eligible for status changes
	 *     tags: [Eligibility]
	 *     responses:
	 *       200:
	 *         description: List of candidates
	 */
	router.get("/candidates", async (req: Request, res: Response, next: NextFunction) => {
		try {
			// Get organizationId from user (assuming attached by middleware)
			const organizationId = (req as any).user?.organizationId || "default-org-id";

			// In a real multi-tenant app, ensure we have organizationId
			// For now, if no auth middleware populated it, we might need a fallback or error
			// Assuming the `verifyToken` middleware sets `req.user`

			logger.info(`Fetching eligibility candidates for org: ${organizationId}`);

			const candidates = await getEligibilityCandidates(prisma, organizationId);

			res.status(200).json({
				success: true,
				data: candidates,
			});
		} catch (error) {
			logger.error("Error fetching eligibility candidates:", error);
			next(error);
		}
	});

	return router;
};

module.exports = init;
