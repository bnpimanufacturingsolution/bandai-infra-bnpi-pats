import { z } from "zod";

import type { Position } from "./position.zod";
import type { Employee } from "./employee.zod";

// Department Schema (full, including ID)
export const DepartmentSchema = z.object({
	id: z.string(),
	organizationId: z.string().min(1),
	name: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional(),
	managerId: z.union([z.string(), z.null()]).optional(),
	parentId: z.union([z.string(), z.null()]).optional(),
	scheduleId: z.union([z.string(), z.null()]).optional(),
	scheduleIds: z.array(z.string()).optional().default([]),
	isHr: z.boolean().default(false),
	isActive: z.boolean(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Department = z.infer<typeof DepartmentSchema>;

// Create Department Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateDepartmentSchema = DepartmentSchema.omit({
	id: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	managerId: true,
	parentId: true,
});

export type CreateDepartment = z.infer<typeof CreateDepartmentSchema>;

// Update Department Schema (partial, excluding immutable fields and relations)
export const UpdateDepartmentSchema = DepartmentSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateDepartment = z.infer<typeof UpdateDepartmentSchema>;

export type DepartmentWithRelations = Department & {
	parent: Department | null;
	children: Department[];
	positions: Position[];
	employees: Employee[];
};
