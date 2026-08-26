import { z } from "zod";

export const CalculatorType = z.enum([
	"BASIC",
	"GROSS_TO_NET",
	"NET_TO_GROSS",
	"THIRTEENTH_MONTH",
	"CUSTOM",
]);

export type CalculatorType = z.infer<typeof CalculatorType>;

export const CalculatorSchema = z.object({
	id: z.string(),
	organizationId: z.string().min(1),
	name: z.string().min(1, "Name is required"),
	description: z.string().optional(),
	type: CalculatorType.default("BASIC"),
	taxRates: z.any().optional(),
	sssRates: z.any().optional(),
	philHealthRates: z.any().optional(),
	pagibigRates: z.any().optional(),
	overtimeRates: z.any().optional(),
	nightDiffRate: z.number().optional().default(0.1),
	isActive: z.boolean().default(true),
	isDefault: z.boolean().default(false),
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date().optional(),
	updatedAt: z.coerce.date().optional(),
});

export type Calculator = z.infer<typeof CalculatorSchema>;

export const CreateCalculatorSchema = CalculatorSchema.omit({
	id: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
});

export type CreateCalculatorRequest = z.infer<typeof CreateCalculatorSchema>;

export const UpdateCalculatorSchema = CreateCalculatorSchema.partial();

export type UpdateCalculatorRequest = z.infer<typeof UpdateCalculatorSchema>;
