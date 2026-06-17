import { z } from "zod";

import type { Employee } from "./employee.zod";
import type { BenefitType } from "./benefit-type.zod";

// EmployeeBenefit Schema (full, including ID)
export const EmployeeBenefitSchema = z.object({
	id: z.string(),
	organizationId: z.string().min(1),
	employeeId: z.string(),
	benefitTypeId: z.string(),
	payrollPeriodId: z.string().optional(),
	name: z.string(),
	description: z.string(),
	amount: z.number(),
	startDate: z.coerce.date(),
	endDate: z.coerce.date().optional(),
	isActive: z.boolean(),
	approvedBy: z
		.string()

		.optional(),
	approvedAt: z.coerce.date().optional(),
	notes: z.string().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type EmployeeBenefit = z.infer<typeof EmployeeBenefitSchema>;

// Create EmployeeBenefit Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateEmployeeBenefitSchema = EmployeeBenefitSchema.omit({
	id: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
})
	.partial({
		payrollPeriodId: true,
		endDate: true,
		approvedBy: true,
		approvedAt: true,
		notes: true,
	})
	.extend({
		isActive: z.boolean().default(true),
	});

export type CreateEmployeeBenefit = z.infer<typeof CreateEmployeeBenefitSchema>;

// Update EmployeeBenefit Schema (partial, excluding immutable fields and relations)
export const UpdateEmployeeBenefitSchema = EmployeeBenefitSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateEmployeeBenefit = z.infer<typeof UpdateEmployeeBenefitSchema>;

export type EmployeeBenefitWithRelations = EmployeeBenefit & {
	employee: Employee;
	benefitType: BenefitType;
};
