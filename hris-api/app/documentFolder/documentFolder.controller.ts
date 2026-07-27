import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../generated/prisma";
import { CreateDocumentFolderSchema, UpdateDocumentFolderSchema } from "../../zod/documentFolder.zod";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const validation = CreateDocumentFolderSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const documentFolder = await prisma.documentFolder.create({
				data: validation.data,
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DOCUMENT_FOLDER.ACTIONS.CREATE_DOCUMENT_FOLDER,
				description: `${config.ACTIVITY_LOG.DOCUMENT_FOLDER.DESCRIPTIONS.DOCUMENT_FOLDER_CREATED}: ${documentFolder.name || documentFolder.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DOCUMENT_FOLDER.PAGES.DOCUMENT_FOLDER_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DOCUMENT_FOLDER,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DOCUMENT_FOLDER,
				entityId: documentFolder.id,
				changesBefore: null,
				changesAfter: {
					id: documentFolder.id,
					name: documentFolder.name,
					employeeId: documentFolder.employeeId,
					createdAt: documentFolder.createdAt,
					updatedAt: documentFolder.updatedAt,
				},
				description: `${config.AUDIT_LOG.DOCUMENT_FOLDER.DESCRIPTIONS.DOCUMENT_FOLDER_CREATED}: ${documentFolder.name || documentFolder.id}`,
			});

			const successResponse = buildSuccessResponse(
				"Document Folder created successfully",
				documentFolder,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			console.error(`Error creating document folder: ${error}`);
			const errorResponse = buildErrorResponse(
				"Internal Server Error",
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getAllByEmployee = async (req: Request, res: Response, _next: NextFunction) => {
		const { employeeId } = req.params;

		if (!employeeId) {
			res.status(400).json(buildErrorResponse("Missing Employee ID", 400));
			return;
		}

		try {
			const folders = await prisma.documentFolder.findMany({
				where: {
					employeeId,
					isDeleted: false,
				},
				orderBy: {
					createdAt: 'desc'
				}
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DOCUMENT_FOLDER.ACTIONS.GET_DOCUMENT_FOLDERS,
				description: `${config.ACTIVITY_LOG.DOCUMENT_FOLDER.DESCRIPTIONS.DOCUMENT_FOLDERS_RETRIEVED}: employeeId=${employeeId}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DOCUMENT_FOLDER.PAGES.DOCUMENT_FOLDER_LIST,
				},
			});

			res.status(200).json(
				buildSuccessResponse("Document folders retrieved successfully", { folders }, 200),
			);
		} catch (error) {
			console.error(`Error getting document folders: ${error}`);
			res.status(500).json(buildErrorResponse("Internal Server Error", 500));
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		
		const validationResult = UpdateDocumentFolderSchema.safeParse(req.body);
		if (!validationResult.success) {
			const formattedErrors = formatZodErrors(validationResult.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		try {
			const existing = await prisma.documentFolder.findFirst({ where: { id } });
			if (!existing) {
				res.status(404).json(buildErrorResponse("Not Found", 404));
				return;
			}

			const updated = await prisma.documentFolder.update({
				where: { id },
				data: validationResult.data,
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DOCUMENT_FOLDER.ACTIONS.UPDATE_DOCUMENT_FOLDER,
				description: `${config.ACTIVITY_LOG.DOCUMENT_FOLDER.DESCRIPTIONS.DOCUMENT_FOLDER_UPDATED}: ${updated.name || updated.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DOCUMENT_FOLDER.PAGES.DOCUMENT_FOLDER_UPDATE,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.DOCUMENT_FOLDER,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DOCUMENT_FOLDER,
				entityId: updated.id,
				changesBefore: existing,
				changesAfter: updated,
				description: `${config.AUDIT_LOG.DOCUMENT_FOLDER.DESCRIPTIONS.DOCUMENT_FOLDER_UPDATED}: ${updated.name || updated.id}`,
			});

			res.status(200).json(buildSuccessResponse("Document Folder updated", { documentFolder: updated }, 200));
		} catch (error) {
			console.error(`Error updating document folder: ${error}`);
			res.status(500).json(buildErrorResponse("Internal Server Error", 500));
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			const existing = await prisma.documentFolder.findFirst({ where: { id } });
			if (!existing) {
				res.status(404).json(buildErrorResponse("Not Found", 404));
				return;
			}

			await prisma.documentFolder.delete({
				where: { id },
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DOCUMENT_FOLDER.ACTIONS.DELETE_DOCUMENT_FOLDER,
				description: `${config.ACTIVITY_LOG.DOCUMENT_FOLDER.DESCRIPTIONS.DOCUMENT_FOLDER_DELETED}: ${existing.name || id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DOCUMENT_FOLDER.PAGES.DOCUMENT_FOLDER_DELETION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.DOCUMENT_FOLDER,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DOCUMENT_FOLDER,
				entityId: id,
				changesBefore: existing,
				changesAfter: null,
				description: `${config.AUDIT_LOG.DOCUMENT_FOLDER.DESCRIPTIONS.DOCUMENT_FOLDER_DELETED}: ${existing.name || id}`,
			});

			res.status(200).json(buildSuccessResponse("Document Folder deleted", {}, 200));
		} catch (error) {
			console.error(`Error deleting document folder: ${error}`);
			res.status(500).json(buildErrorResponse("Internal Server Error", 500));
		}
	};

	return { create, getAllByEmployee, update, remove };
};
