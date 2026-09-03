import { Response } from "express";
import { PrismaClient } from "../../generated/prisma";
import { AuthRequest } from "../../middleware/verifyToken";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import { buildErrorResponse } from "../../helper/error-handler";
import {
	extractWorkflowConfigs,
	getSeededWorkflowConfigs,
	getWorkflowConfigByCode,
	mergeWithSeededWorkflowConfigs,
	normalizeWorkflowConfigRecord,
	removeWorkflowConfigFromBranding,
	resetWorkflowConfigInBranding,
	setWorkflowConfigInBranding,
	seedWorkflowConfigsInBranding,
} from "../../helper/workflow-config.helper";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";

const resolveOrganization = async (prisma: PrismaClient, organizationId?: string | null) => {
	if (!organizationId) {
		throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
	}

	const organization = await prisma.organization.findFirst({
		where: {
			id: organizationId,
			isDeleted: false,
		},
	});

	if (!organization) {
		throw new Error("ORGANIZATION_NOT_FOUND");
	}

	return organization;
};

const normalizeCode = (value: unknown) => String(value || "").trim().toUpperCase();

export const controller = (prisma: PrismaClient) => {
	const getAll = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveOrganization(prisma, req.organizationId);
			const query = String(req.query.query || "").trim().toLowerCase();
			const domain = String(req.query.domain || "").trim().toUpperCase();

			const workflowConfigs = mergeWithSeededWorkflowConfigs(organization.branding).filter(
				(config) => {
					if (domain && config.domain !== domain) return false;
					if (!query) return true;
					return [config.name, config.code, config.description, config.requestType, config.domain]
						.filter(Boolean)
						.some((value) => String(value).toLowerCase().includes(query));
				},
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.WORKFLOW_CONFIG.ACTIONS.GET_ALL_WORKFLOW_CONFIG,
				description: config.ACTIVITY_LOG.WORKFLOW_CONFIG.DESCRIPTIONS.WORKFLOW_CONFIGS_RETRIEVED,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.WORKFLOW_CONFIG.PAGES.WORKFLOW_CONFIG_LIST,
				},
				organizationId: organization.id,
			});

			res.status(200).json(
				buildSuccessResponse(
					"Workflow configs retrieved successfully",
					{
						workflowConfigs,
						count: workflowConfigs.length,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to retrieve workflow configs", 500),
			);
		}
	};

	const getByCode = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveOrganization(prisma, req.organizationId);
			const workflowConfig = getWorkflowConfigByCode(organization.branding, req.params.code);
			if (!workflowConfig) {
				res.status(404).json(buildErrorResponse("Workflow config not found", 404));
				return;
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.WORKFLOW_CONFIG.ACTIONS.GET_WORKFLOW_CONFIG,
				description: `${config.ACTIVITY_LOG.WORKFLOW_CONFIG.DESCRIPTIONS.WORKFLOW_CONFIG_RETRIEVED}: ${workflowConfig.code}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.WORKFLOW_CONFIG.PAGES.WORKFLOW_CONFIG_DETAILS,
				},
				organizationId: organization.id,
			});

			res.status(200).json(
				buildSuccessResponse(
					"Workflow config retrieved successfully",
					{ workflowConfig },
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to retrieve workflow config", 500),
			);
		}
	};

	const initializeDefaults = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveOrganization(prisma, req.organizationId);
			const beforeCount = extractWorkflowConfigs(organization.branding).length;
			const nextBranding = seedWorkflowConfigsInBranding(organization.branding);
			const updated = await prisma.organization.update({
				where: { id: organization.id },
				data: { branding: nextBranding },
			});
			const workflowConfigs = mergeWithSeededWorkflowConfigs(updated.branding);
			const created = Math.max(0, workflowConfigs.length - beforeCount);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.WORKFLOW_CONFIG.ACTIONS.INITIALIZE_WORKFLOW_DEFAULTS,
				description: `${config.ACTIVITY_LOG.WORKFLOW_CONFIG.DESCRIPTIONS.WORKFLOW_DEFAULTS_INITIALIZED}: created=${created}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.WORKFLOW_CONFIG.PAGES.WORKFLOW_CONFIG_LIST,
				},
				organizationId: organization.id,
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.WORKFLOW_CONFIG,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.WORKFLOW_CONFIG,
				entityId: organization.id,
				changesBefore: { configCount: beforeCount },
				changesAfter: { configCount: workflowConfigs.length, created },
				description: `${config.ACTIVITY_LOG.WORKFLOW_CONFIG.DESCRIPTIONS.WORKFLOW_DEFAULTS_INITIALIZED}: created=${created}`,
				organizationId: organization.id,
			});

			res.status(200).json(
				buildSuccessResponse(
					"Workflow defaults initialized successfully",
					{
						workflowConfigs,
						created,
						count: workflowConfigs.length,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to initialize workflow defaults", 500),
			);
		}
	};

	const create = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveOrganization(prisma, req.organizationId);
			const code = normalizeCode(req.body?.code);
			if (!code) {
				res.status(400).json(buildErrorResponse("Workflow code is required", 400));
				return;
			}

			if (getWorkflowConfigByCode(organization.branding, code)) {
				res.status(409).json(buildErrorResponse("Workflow code already exists", 409));
				return;
			}

			const normalized = normalizeWorkflowConfigRecord({
				...req.body,
				code,
				isDefault: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
			const nextBranding = setWorkflowConfigInBranding(organization.branding, normalized);
			const updated = await prisma.organization.update({
				where: { id: organization.id },
				data: { branding: nextBranding },
			});
			const workflowConfig = getWorkflowConfigByCode(updated.branding, code);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.WORKFLOW_CONFIG.ACTIONS.CREATE_WORKFLOW_CONFIG,
				description: `${config.ACTIVITY_LOG.WORKFLOW_CONFIG.DESCRIPTIONS.WORKFLOW_CONFIG_CREATED}: ${workflowConfig?.code || code}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.WORKFLOW_CONFIG.PAGES.WORKFLOW_CONFIG_CREATION,
				},
				organizationId: organization.id,
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.WORKFLOW_CONFIG,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.WORKFLOW_CONFIG,
				entityId: code,
				changesBefore: null,
				changesAfter: workflowConfig,
				description: `${config.AUDIT_LOG.WORKFLOW_CONFIG.DESCRIPTIONS.WORKFLOW_CONFIG_CREATED}: ${workflowConfig?.name || code}`,
				organizationId: organization.id,
			});

			res.status(201).json(
				buildSuccessResponse("Workflow config created successfully", { workflowConfig }, 201),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to create workflow config", 500),
			);
		}
	};

	const update = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveOrganization(prisma, req.organizationId);
			const code = normalizeCode(req.params.code);
			const current = getWorkflowConfigByCode(organization.branding, code);
			if (!current) {
				res.status(404).json(buildErrorResponse("Workflow config not found", 404));
				return;
			}

			const normalized = normalizeWorkflowConfigRecord({
				...current,
				...req.body,
				code: current.code,
				updatedAt: new Date().toISOString(),
			});
			const nextBranding = setWorkflowConfigInBranding(organization.branding, normalized);
			const updated = await prisma.organization.update({
				where: { id: organization.id },
				data: { branding: nextBranding },
			});
			const workflowConfig = getWorkflowConfigByCode(updated.branding, code);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.WORKFLOW_CONFIG.ACTIONS.UPDATE_WORKFLOW_CONFIG,
				description: `${config.ACTIVITY_LOG.WORKFLOW_CONFIG.DESCRIPTIONS.WORKFLOW_CONFIG_UPDATED}: ${code}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.WORKFLOW_CONFIG.PAGES.WORKFLOW_CONFIG_UPDATE,
				},
				organizationId: organization.id,
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.WORKFLOW_CONFIG,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.WORKFLOW_CONFIG,
				entityId: code,
				changesBefore: current,
				changesAfter: workflowConfig,
				description: `${config.AUDIT_LOG.WORKFLOW_CONFIG.DESCRIPTIONS.WORKFLOW_CONFIG_UPDATED}: ${workflowConfig?.name || code}`,
				organizationId: organization.id,
			});

			res.status(200).json(
				buildSuccessResponse("Workflow config updated successfully", { workflowConfig }, 200),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to update workflow config", 500),
			);
		}
	};

	const reset = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveOrganization(prisma, req.organizationId);
			const code = normalizeCode(req.params.code);
			const seeded = getSeededWorkflowConfigs().find((config) => config.code === code);
			if (!seeded) {
				res.status(404).json(buildErrorResponse("Seeded workflow config not found", 404));
				return;
			}

			const current = getWorkflowConfigByCode(organization.branding, code);
			const nextBranding = resetWorkflowConfigInBranding(organization.branding, code);
			const updated = await prisma.organization.update({
				where: { id: organization.id },
				data: { branding: nextBranding },
			});
			const workflowConfig = getWorkflowConfigByCode(updated.branding, code);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.WORKFLOW_CONFIG.ACTIONS.RESET_WORKFLOW_CONFIG,
				description: `${config.ACTIVITY_LOG.WORKFLOW_CONFIG.DESCRIPTIONS.WORKFLOW_CONFIG_RESET}: ${code}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.WORKFLOW_CONFIG.PAGES.WORKFLOW_CONFIG_UPDATE,
				},
				organizationId: organization.id,
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.WORKFLOW_CONFIG,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.WORKFLOW_CONFIG,
				entityId: code,
				changesBefore: current,
				changesAfter: workflowConfig,
				description: `${config.ACTIVITY_LOG.WORKFLOW_CONFIG.DESCRIPTIONS.WORKFLOW_CONFIG_RESET}: ${code}`,
				organizationId: organization.id,
			});

			res.status(200).json(
				buildSuccessResponse("Workflow config reset successfully", { workflowConfig }, 200),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to reset workflow config", 500),
			);
		}
	};

	const remove = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveOrganization(prisma, req.organizationId);
			const code = normalizeCode(req.params.code);
			const current = getWorkflowConfigByCode(organization.branding, code);
			const nextBranding = removeWorkflowConfigFromBranding(organization.branding, code);
			await prisma.organization.update({
				where: { id: organization.id },
				data: { branding: nextBranding },
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.WORKFLOW_CONFIG.ACTIONS.DELETE_WORKFLOW_CONFIG,
				description: `${config.ACTIVITY_LOG.WORKFLOW_CONFIG.DESCRIPTIONS.WORKFLOW_CONFIG_DELETED}: ${code}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.WORKFLOW_CONFIG.PAGES.WORKFLOW_CONFIG_DELETION,
				},
				organizationId: organization.id,
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.WORKFLOW_CONFIG,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.WORKFLOW_CONFIG,
				entityId: code,
				changesBefore: current,
				changesAfter: null,
				description: `${config.AUDIT_LOG.WORKFLOW_CONFIG.DESCRIPTIONS.WORKFLOW_CONFIG_DELETED}: ${current?.name || code}`,
				organizationId: organization.id,
			});

			res.status(200).json(
				buildSuccessResponse("Workflow config deleted successfully", { code }, 200),
			);
		} catch (error: any) {
			const message =
				error?.message === "DEFAULT_WORKFLOW_CONFIG_CANNOT_BE_DELETED"
					? "Seeded workflow configs cannot be deleted. Reset them instead."
					: error?.message || "Failed to delete workflow config";
			const statusCode =
				error?.message === "DEFAULT_WORKFLOW_CONFIG_CANNOT_BE_DELETED" ? 409 : 500;
			res.status(statusCode).json(buildErrorResponse(message, statusCode));
		}
	};

	return {
		getAll,
		getByCode,
		initializeDefaults,
		create,
		update,
		reset,
		remove,
	};
};
