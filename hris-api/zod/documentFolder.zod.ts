import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

export const CreateDocumentFolderSchema = z.object({
	name: z.string().min(1, "Folder name is required"),
	employeeId: z.string().refine((val) => isValidObjectId(val), "Invalid employee ID"),
});

export type CreateDocumentFolder = z.infer<typeof CreateDocumentFolderSchema>;

export const UpdateDocumentFolderSchema = z.object({
	name: z.string().min(1, "Folder name is required").optional(),
});

export type UpdateDocumentFolder = z.infer<typeof UpdateDocumentFolderSchema>;
