import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

import type { Person } from "./person.zod";


// Status Enum
export const Status = z.enum(["active", "inactive", "suspended", "archived"]);

export type Status = z.infer<typeof Status>;

// User Schema (full, including ID)
export const UserSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	personId: z.string().refine((val) => isValidObjectId(val)),
	avatar: z.string().optional(),
	userName: z.string().optional(),
	email: z.string().min(1),
	password: z.string().optional(),
	status: z.enum(["active", "inactive", "suspended", "archived"]),
	isDeleted: z.boolean(),
	lastLogin: z.coerce.date().optional(),
	loginMethod: z.string().min(1),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type User = z.infer<typeof UserSchema>;

// Create User Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateUserSchema = UserSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	avatar: true,
	userName: true,
	password: true,
	isDeleted: true,
	lastLogin: true,
});

export type CreateUser = z.infer<typeof CreateUserSchema>;

// Update User Schema (partial, excluding immutable fields and relations)
export const UpdateUserSchema = UserSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateUser = z.infer<typeof UpdateUserSchema>;

export type UserWithRelations = User & {
	person: Person;
};
