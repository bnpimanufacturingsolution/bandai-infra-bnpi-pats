import { z } from "zod";

// Protocol enum
export const ProtocolSchema = z.enum(["http", "https", "tcp", "udp"]);

// Access type schema
export const AccessSchema = z.object({
	username: z.string().optional(),
	password: z.string().optional(),
});

// Device Schema (full, including ID)
export const DeviceSchema = z.object({
	id: z.string(),
	organizationId: z.string().min(1),
	name: z.string().min(1),
	address: z.string().min(1),
	port: z.number().int().positive(),
	protocol: ProtocolSchema.default("http"),
	config: z.any(), // Json type
	access: AccessSchema,
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Device = z.infer<typeof DeviceSchema>;

// Create Device Schema (excluding ID, createdAt, updatedAt, and computed fields)
// Note: organizationId is automatically injected by backend middleware from JWT token
export const CreateDeviceSchema = DeviceSchema.omit({
	id: true,
	organizationId: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
}).extend({
	protocol: ProtocolSchema,
	config: z.any().optional(),
	access: AccessSchema.optional(),
});

export type CreateDevice = z.infer<typeof CreateDeviceSchema>;

// Update Device Schema (partial, excluding immutable fields)
export const UpdateDeviceSchema = DeviceSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateDevice = z.infer<typeof UpdateDeviceSchema>;
