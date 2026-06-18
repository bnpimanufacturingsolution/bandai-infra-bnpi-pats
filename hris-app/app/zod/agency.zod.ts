import { z } from "zod";

export const AgencyStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

export const AgencySchema = z.object({
	id: z.string(),
	organizationId: z.string().min(1),
	name: z.string().trim().min(1),
	code: z.string().trim().min(1),
	status: AgencyStatusSchema.default("ACTIVE"),
	contactName: z.string().trim().optional().nullable(),
	contactEmail: z
		.string()
		.trim()
		.email()
		.optional()
		.or(z.literal(""))
		.nullable(),
	contactPhone: z.string().trim().optional().nullable(),
	metadata: z.any().optional().nullable(),
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Agency = z.infer<typeof AgencySchema>;

export const CreateAgencySchema = AgencySchema.omit({
	id: true,
	organizationId: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	status: true,
	contactName: true,
	contactEmail: true,
	contactPhone: true,
	metadata: true,
});

export type CreateAgency = z.infer<typeof CreateAgencySchema>;

export const UpdateAgencySchema = AgencySchema.omit({
	id: true,
	organizationId: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateAgency = z.infer<typeof UpdateAgencySchema>;
