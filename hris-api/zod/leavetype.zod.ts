import { z } from "zod";
import { isValidEntityId } from "../helper/id-validation.helper";
import { EmploymentTypeSchema } from "./leave-policy.zod";

const codeSchema = z
	.string()
	.min(1)
	.transform((value) =>
		value
			.trim()
			.toUpperCase()
			.replace(/[^A-Z0-9]+/g, "_")
			.replace(/^_+|_+$/g, ""),
	);

export const LeaveTypeSchema = z.object({
	id: z.string().refine((value) => isValidEntityId(value)),
	organizationId: z.string().min(1),
	code: codeSchema,
	name: z.string().trim().min(1),
	description: z.string().trim().optional().nullable(),
	sortOrder: z.number().int().min(0).default(0),
	isActive: z.boolean().default(true),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type LeaveType = z.infer<typeof LeaveTypeSchema>;

export const CreateLeaveTypeSchema = LeaveTypeSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	organizationId: true,
})
	.extend({
		enabled: z.boolean().optional(),
		isPaid: z.boolean().optional(),
		requiresApproval: z.boolean().optional(),
		minAdvanceNoticeDays: z.number().int().min(0).optional(),
		maxDaysPerRequest: z.number().positive().optional(),
		allowHalfDay: z.boolean().optional(),
		requireAttachment: z.boolean().optional(),
		allowedEmploymentTypes: z.array(EmploymentTypeSchema).min(1).optional(),
	})
	.partial({
		description: true,
		sortOrder: true,
		isActive: true,
	});

export type CreateLeaveType = z.infer<typeof CreateLeaveTypeSchema>;

export const UpdateLeaveTypeSchema = CreateLeaveTypeSchema.partial().refine(
	(payload) => Object.keys(payload).length > 0,
	{ message: "No fields provided for update" },
);

export type UpdateLeaveType = z.infer<typeof UpdateLeaveTypeSchema>;
