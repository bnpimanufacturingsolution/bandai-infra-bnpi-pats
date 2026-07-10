import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

// Protocol Enum
export const Protocol = z.enum(["http", "https", "tcp", "udp"]);

export type Protocol = z.infer<typeof Protocol>;

// Access Schema
export const AccessSchema = z.object({
	username: z.string().optional(),
	password: z.string().optional(),
});

export type Access = z.infer<typeof AccessSchema>;

// Device Schema (full, including ID)
export const DeviceSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	name: z.string().min(1),
	address: z.string().min(1),
	port: z.number().int(),
	protocol: z.enum(["http", "https", "tcp", "udp"]),
	config: z.any(),
	access: AccessSchema,
	employees: z.array(z.string()),
	organizationId: z.string().refine((val) => isValidObjectId(val)),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Device = z.infer<typeof DeviceSchema>;

// Create Device Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateDeviceSchema = DeviceSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	employees: true,
	organizationId: true,
	config: true,
	access: true,
}).extend({
	organizationId: z.string().refine((val) => isValidObjectId(val)).optional(),
	protocol: Protocol.default("http"),
	config: z.any().optional(),
	access: AccessSchema.optional(),
});

export type CreateDevice = z.infer<typeof CreateDeviceSchema>;

// Update Device Schema (partial, excluding immutable fields and relations)
export const UpdateDeviceSchema = DeviceSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	employees: true,
}).partial();

export type UpdateDevice = z.infer<typeof UpdateDeviceSchema>;
