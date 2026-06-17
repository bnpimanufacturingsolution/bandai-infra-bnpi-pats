import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

import type { Employee } from "./employee.zod";
import type { BenefitType } from "./benefittype.zod";

export const BenefitProgramStatus = z.enum([
	"PENDING",
	"APPROVED",
	"ACTIVE",
	"COMPLETED",
	"CANCELLED",
	"DEFAULTED",
]);

export type BenefitProgramStatus = z.infer<typeof BenefitProgramStatus>;

export const BenefitDeductionStatus = z.enum(["SCHEDULED", "DEDUCTED", "FAILED", "WAIVED"]);

export type BenefitDeductionStatus = z.infer<typeof BenefitDeductionStatus>;

export const EmployeeBenefitInstallmentSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	employeeBenefitId: z.string().refine((val) => isValidObjectId(val)),
	installmentNumber: z.number().int().min(1),
	amount: z.number(),
	scheduledDate: z.coerce.date(),
	processedDate: z.coerce.date().optional(),
	payrollCutOffId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	payrollRunId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	status: BenefitDeductionStatus,
	failureReason: z.string().optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type EmployeeBenefitInstallment = z.infer<typeof EmployeeBenefitInstallmentSchema>;

// EmployeeBenefit Schema (full, including ID)
export const EmployeeBenefitSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	employeeId: z.string().refine((val) => isValidObjectId(val)),
	benefitTypeId: z.string().refine((val) => isValidObjectId(val)),
	payrollPeriodId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	name: z.string().optional(),
	description: z.string().optional(),
	totalAmount: z.number(),
	currency: z.string().min(1),
	totalInstallments: z.number().int().min(1),
	installmentAmount: z.number(),
	remainingBalance: z.number(),
	amount: z.number().optional(),
	startDate: z.coerce.date().optional(),
	endDate: z.coerce.date().optional(),
	startPayrollCutOff: z.coerce.date().optional(),
	endPayrollCutOff: z.coerce.date().optional(),
	agreedToTerms: z.boolean(),
	agreedAt: z.coerce.date().optional(),
	agreedByIp: z.string().optional(),
	status: BenefitProgramStatus,
	isActive: z.boolean(),
	approvedById: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	approvedAt: z.coerce.date().optional(),
	notes: z.string().optional(),
	remarks: z.string().optional(),
	installments: z.array(EmployeeBenefitInstallmentSchema).optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type EmployeeBenefit = z.infer<typeof EmployeeBenefitSchema>;

// Create EmployeeBenefit Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateEmployeeBenefitSchema = EmployeeBenefitSchema.omit({
	id: true,
	installments: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
})
	.partial({
		name: true,
		description: true,
		totalAmount: true,
		currency: true,
		totalInstallments: true,
		installmentAmount: true,
		remainingBalance: true,
		amount: true,
		payrollPeriodId: true,
		startDate: true,
		endDate: true,
		startPayrollCutOff: true,
		endPayrollCutOff: true,
		agreedToTerms: true,
		agreedAt: true,
		agreedByIp: true,
		status: true,
		approvedById: true,
		approvedAt: true,
		notes: true,
		remarks: true,
	})
	.extend({
		currency: z.string().min(1).default("USD"),
		totalInstallments: z.number().int().min(1).default(6),
		status: BenefitProgramStatus.default("PENDING"),
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
	installments?: EmployeeBenefitInstallment[];
};
