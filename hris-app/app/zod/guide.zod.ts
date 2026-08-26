import { z } from "zod";

// Block schema - represents individual content blocks within a page
const BlockSchema = z.object({
	id: z.string().optional(), // Make ID optional for new blocks
	type: z.enum(["text", "heading", "image", "code", "list", "quote", "callout"]), // Added callout
	content: z.string(),
	// Properties for specific block types
	language: z.string().optional(), // for code
	filename: z.string().optional(), // for code
	level: z.number().optional(), // for heading
	variant: z.string().optional(), // for callout
	title: z.string().optional(), // for callout
	metadata: z.record(z.string(), z.unknown()).optional(),
});

// Page schema - represents individual pages within a section
const PageSchema = z.object({
	id: z.string(),
	title: z.string(),
	slug: z.string(), // Added slug
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
