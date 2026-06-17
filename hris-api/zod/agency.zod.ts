import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

export const AgencyStatus = z.enum(["ACTIVE", "INACTIVE"]);
export type AgencyStatus = z.infer<typeof AgencyStatus>;

export const AgencySchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	name: z.string().min(1),
	code: z.string().min(1),
	status: AgencyStatus.default("ACTIVE"),
	contactName: z.string().optional().nullable(),
	contactEmail: z.string().email().optional().nullable(),
	contactPhone: z.string().optional().nullable(),
	metadata: z.any().optional().nullable(),
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Agency = z.infer<typeof AgencySchema>;

export const CreateAgencySchema = AgencySchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	status: true,
	contactName: true,
	contactEmail: true,
	contactPhone: true,
	metadata: true,
	isDeleted: true,
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
