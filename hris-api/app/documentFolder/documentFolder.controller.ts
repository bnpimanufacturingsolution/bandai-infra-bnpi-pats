import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../generated/prisma";
import { CreateDocumentFolderSchema, UpdateDocumentFolderSchema } from "../../zod/documentFolder.zod";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";

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

			res.status(200).json(buildSuccessResponse("Document Folder deleted", {}, 200));
		} catch (error) {
			console.error(`Error deleting document folder: ${error}`);
			res.status(500).json(buildErrorResponse("Internal Server Error", 500));
		}
	};

	return { create, getAllByEmployee, update, remove };
};
