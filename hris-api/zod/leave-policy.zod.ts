import { z } from "zod";
import { EmploymentType } from "../generated/prisma";

export const LeavePolicyTypeSchema = z
	.string()
	.min(1)
	.transform((value) =>
		value
			.trim()
			.toUpperCase()
			.replace(/[^A-Z0-9]+/g, "_")
			.replace(/^_+|_+$/g, ""),
	);
export const EmploymentTypeSchema = z.nativeEnum(EmploymentType);

export const UpdateLeavePolicySchema = z
	.object({
		enabled: z.boolean().optional(),
		isPaid: z.boolean().optional(),
		requiresApproval: z.boolean().optional(),
		minAdvanceNoticeDays: z.number().int().min(0).optional(),
		maxDaysPerRequest: z.number().positive().optional(),
		allowHalfDay: z.boolean().optional(),
		requireAttachment: z.boolean().optional(),
		allowedEmploymentTypes: z.array(EmploymentTypeSchema).min(1).optional(),
	})
	.refine((payload) => Object.keys(payload).length > 0, {
		message: "No fields provided for update",
	});

export type UpdateLeavePolicy = z.infer<typeof UpdateLeavePolicySchema>;
