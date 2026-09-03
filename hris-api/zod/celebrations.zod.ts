import { z } from "zod";

export const BirthdayFilterTypeSchema = z.enum(["EMPLOYEES", "KIDS", "ALL"]);

export const BirthdaysQuerySchema = z.object({
	month: z.coerce.number().int().min(1).max(12),
	year: z.coerce.number().int().min(1900).max(3000),
	type: BirthdayFilterTypeSchema.default("ALL"),
	search: z.string().max(100).optional().default(""),
	// Auth route ignores these; public route resolves id or stable seed code (e.g. bnei).
	organizationId: z.string().trim().min(1).optional(),
	organizationCode: z.string().trim().min(1).optional(),
});

export type BirthdayFilterType = z.infer<typeof BirthdayFilterTypeSchema>;
export type BirthdaysQuery = z.infer<typeof BirthdaysQuerySchema>;
