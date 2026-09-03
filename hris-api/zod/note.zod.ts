import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

// Note Schema (full, including ID)
export const NoteSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().refine((val) => isValidObjectId(val)),
	processId: z.string().refine((val) => isValidObjectId(val)),
	content: z.string().min(1),
	authorId: z.string().min(1),
	authorName: z.string().min(1),
	metadata: z.any().nullable().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Note = z.infer<typeof NoteSchema>;

// Create Note Schema (excluding ID, createdAt, updatedAt)
export const CreateNoteSchema = NoteSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	metadata: true,
	isDeleted: true, // Defaults to false
});

export type CreateNote = z.infer<typeof CreateNoteSchema>;

// Update Note Schema (partial, excluding immutable fields)
export const UpdateNoteSchema = NoteSchema.omit({
	id: true,
	organizationId: true, // Immutable
	processId: true, // Immutable - notes shouldn't move between processes
	authorId: true, // Immutable - can't change who authored a note
	authorName: true, // Immutable
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateNote = z.infer<typeof UpdateNoteSchema>;
