import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../generated/prisma";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import { AuthRequest } from "../../middleware/verifyToken";
import {
	getLeavePolicyByType,
	getOrCreateLeavePolicies,
	normalizeLeaveType,
} from "../../helper/leave-policy.helper";
import { UpdateLeavePolicySchema } from "../../zod/leave-policy.zod";
import { invalidateCache } from "../../middleware/cache";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";

const canManageLeaveSettings = (role?: string) =>
	typeof role === "string" &&
	(["hris-admin", "admin", "super_admin"].includes(role) || role.startsWith("hris-hr-"));

export const controller = (prisma: PrismaClient) => {
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		try {
			if (!authReq.organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID is required", 400));
				return;
			}

			const policies = await getOrCreateLeavePolicies(prisma, authReq.organizationId);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.LEAVE_SETTING.ACTIONS.GET_ALL_LEAVE_SETTING,
				description: config.ACTIVITY_LOG.LEAVE_SETTING.DESCRIPTIONS.LEAVE_SETTINGS_RETRIEVED,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.LEAVE_SETTING.PAGES.LEAVE_SETTING_LIST,
				},
				organizationId: authReq.organizationId,
			});

			res.status(200).json(
				buildSuccessResponse("Leave settings retrieved successfully", policies, 200),
			);
		} catch (error) {
			res.status(500).json(buildErrorResponse("Failed to retrieve leave settings", 500));
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		try {
			if (!authReq.organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID is required", 400));
				return;
			}

			if (!canManageLeaveSettings(authReq.role)) {
				res.status(403).json(
					buildErrorResponse("You are not authorized to update leave settings", 403),
				);
				return;
			}

			const leaveType = normalizeLeaveType(req.params.leaveType);
			if (!leaveType) {
				res.status(400).json(
					buildErrorResponse("Invalid leaveType parameter", 400, [
						{ field: "leaveType", message: "leaveType must be a valid LeaveType enum value" },
					]),
				);
				return;
			}

			const validation = UpdateLeavePolicySchema.safeParse(req.body);
			if (!validation.success) {
				res
					.status(400)
					.json(buildErrorResponse("Validation failed", 400, formatZodErrors(validation.error.format())));
				return;
			}

			await getOrCreateLeavePolicies(prisma, authReq.organizationId);
			const existingPolicy = await getLeavePolicyByType(
				prisma,
				authReq.organizationId,
				leaveType,
			);
			if (!existingPolicy) {
				res.status(404).json(buildErrorResponse("Leave policy not found", 404));
				return;
			}
			const updated = await prisma.leaveType.update({
				where: { id: existingPolicy.id },
				data: validation.data,
			});

			await invalidateCache.byPattern(`cache:leave-settings:${authReq.organizationId}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.LEAVE_SETTING.ACTIONS.UPDATE_LEAVE_SETTING,
				description: `${config.ACTIVITY_LOG.LEAVE_SETTING.DESCRIPTIONS.LEAVE_SETTING_UPDATED}: ${leaveType}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.LEAVE_SETTING.PAGES.LEAVE_SETTING_UPDATE,
				},
				organizationId: authReq.organizationId,
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.LEAVE_SETTING,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.LEAVE_SETTING,
				entityId: updated.id,
				changesBefore: existingPolicy,
				changesAfter: updated,
				description: `${config.AUDIT_LOG.LEAVE_SETTING.DESCRIPTIONS.LEAVE_SETTING_UPDATED}: ${leaveType}`,
				organizationId: authReq.organizationId,
			});

			res
				.status(200)
				.json(buildSuccessResponse("Leave setting updated successfully", updated, 200));
		} catch (error) {
			res.status(500).json(buildErrorResponse("Failed to update leave setting", 500));
		}
	};

	return {
		getAll,
		update,
	};
};
