import { z } from "zod";

// Block schema - represents individual content blocks within a page
const BlockSchema = z.object({
	id: z.string(),
	type: z.enum(["text", "heading", "image", "code", "list", "quote"]), // Add more types as needed
	content: z.string(),
	metadata: z.record(z.unknown()).optional(), // For any additional block properties
});

// Page schema - represents individual pages within a section
const PageSchema = z.object({
	id: z.string(),
	title: z.string(),
	blocks: z.array(BlockSchema),
	order: z.number().optional(),
});

// Section schema - represents sections containing pages
const SectionSchema = z.object({
	id: z.string(),
	title: z.string(),
	pages: z.array(PageSchema),
	order: z.number().optional(),
});

// Main Guide schema
export const GuideSchema = z.object({
	id: z.string().optional(), // Optional for creation, required after
	title: z.string().min(1, "Title is required"),
	description: z.string().min(1, "Description is required"),
	sections: z.array(SectionSchema),
	published: z.boolean().default(false),
	author: z.string().optional().nullable(),
	version: z.string().optional().nullable(),
	isDeleted: z.boolean().default(false), // Added this field
	createdAt: z.date().optional(),
	updatedAt: z.date().optional(),
});

// Schema for creating a new guide (without id and timestamps)
export const CreateGuideSchema = GuideSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});

// Schema for updating a guide (all fields optional except id)
export const UpdateGuideSchema = GuideSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

// Type exports for TypeScript usage
export type Guide = z.infer<typeof GuideSchema>;
export type CreateGuide = z.infer<typeof CreateGuideSchema>;
export type UpdateGuide = z.infer<typeof UpdateGuideSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Page = z.infer<typeof PageSchema>;
export type Block = z.infer<typeof BlockSchema>;
