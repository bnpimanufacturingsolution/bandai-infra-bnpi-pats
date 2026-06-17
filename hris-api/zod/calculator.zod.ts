import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

// CalculatorType Enum
export const CalculatorType = z.enum([
	"BASIC",
	"GROSS_TO_NET",
	"NET_TO_GROSS",
	"THIRTEENTH_MONTH",
	"CUSTOM",
]);

export type CalculatorType = z.infer<typeof CalculatorType>;

// Calculator Schema (full, including ID)
export const CalculatorSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	code: z.string().optional(),
	name: z.string().min(1),
	description: z.string().optional(),
	type: z.enum(["BASIC", "GROSS_TO_NET", "NET_TO_GROSS", "THIRTEENTH_MONTH", "CUSTOM"]),
	taxRates: z.any(),
	sssRates: z.any().optional(),
	philHealthRates: z.any().optional(),
	pagibigRates: z.any().optional(),
	overtimeRates: z.any().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Calculator = z.infer<typeof CalculatorSchema>;

// Create Calculator Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateCalculatorSchema = CalculatorSchema.omit({
	id: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	code: true,
	description: true,
	type: true,
	taxRates: true,
	sssRates: true,
	philHealthRates: true,
	pagibigRates: true,
	overtimeRates: true,
});

export type CreateCalculator = z.infer<typeof CreateCalculatorSchema>;

// Update Calculator Schema (partial, excluding immutable fields and relations)
export const UpdateCalculatorSchema = CalculatorSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateCalculator = z.infer<typeof UpdateCalculatorSchema>;
