import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

// RuleCategory enum
export const RuleCategory = z.enum([
	"ATTENDANCE",
	"BEHAVIOR",
	"PERFORMANCE",
	"SAFETY",
	"POLICY_VIOLATION",
	"MISCONDUCT",
	"HARASSMENT",
	"DRESS_CODE",
	"PUNCTUALITY",
	"OTHER",
]);

export type RuleCategory = z.infer<typeof RuleCategory>;

// SeverityLevel enum
export const SeverityLevel = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export type SeverityLevel = z.infer<typeof SeverityLevel>;

/**
 * Per-severity next-step plan for a rule (progressive discipline).
 * shape: { [severity]: { action, employeeStep, managerStep, responseWindowDays } }
 * severity keys: LOW | MEDIUM | HIGH | CRITICAL
 */
export const ConsequenceStepSchema = z.object({
	action: z.string().min(1),
	employeeStep: z.string().min(1),
	managerStep: z.string().optional().nullable(),
	responseWindowDays: z.number().int().min(0).max(90).optional().nullable(),
});

export const ConsequencePlanSchema = z
	.object({
		LOW: ConsequenceStepSchema.optional().nullable(),
		MEDIUM: ConsequenceStepSchema.optional().nullable(),
		HIGH: ConsequenceStepSchema.optional().nullable(),
		CRITICAL: ConsequenceStepSchema.optional().nullable(),
	})
	.partial();

export type ConsequencePlan = z.infer<typeof ConsequencePlanSchema>;
export type ConsequenceStep = z.infer<typeof ConsequenceStepSchema>;

// Rule Schema (full, including ID)
export const RuleSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	title: z.string().min(1),
	code: z.string().optional().nullable(),
	category: RuleCategory,
	severity: SeverityLevel,
	description: z.string(),
	consequences: z.string().optional().nullable(),
	consequencePlan: ConsequencePlanSchema.optional().nullable(),
	isActive: z.boolean(),
	effectiveDate: z.coerce.date(),
	expiryDate: z.coerce.date().optional().nullable(),
	organizationId: z.string().min(1),
	createdById: z.string().optional().nullable(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Rule = z.infer<typeof RuleSchema>;

// Create Rule Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateRuleSchema = RuleSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	code: true,
	consequences: true,
	consequencePlan: true,
	expiryDate: true,
	createdById: true,
	isDeleted: true,
	isActive: true,
	effectiveDate: true,
});

export type CreateRule = z.infer<typeof CreateRuleSchema>;

// Update Rule Schema (partial, excluding immutable fields and relations)
export const UpdateRuleSchema = RuleSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateRule = z.infer<typeof UpdateRuleSchema>;
