import { z } from "zod";

import type { Employee } from "./employee.zod";
import type { BenefitType } from "./benefit-type.zod";

export const BenefitScheduleModeSchema = z.enum([
	"TIME_BOUND",
	"FIXED_INSTALLMENTS",
	"RECURRING",
]);
export type BenefitScheduleMode = z.infer<typeof BenefitScheduleModeSchema>;

export const BenefitAttendanceAmountBasisSchema = z.enum(["PER_DAY", "PER_CUTOFF"]);
export type BenefitAttendanceAmountBasis = z.infer<typeof BenefitAttendanceAmountBasisSchema>;

export const BenefitRecurrenceFrequencySchema = z.enum(["EVERY_CUTOFF", "MONTHLY", "YEARLY"]);
export type BenefitRecurrenceFrequency = z.infer<typeof BenefitRecurrenceFrequencySchema>;

export const BenefitEligibilityModeSchema = z.enum(["ENROLLED_ALWAYS", "ATTENDANCE_QUALIFIED"]);
export type BenefitEligibilityMode = z.infer<typeof BenefitEligibilityModeSchema>;

const validateScheduleFields = (
	data: {
		scheduleMode?: BenefitScheduleMode;
		startDate?: Date;
		endDate?: Date;
		totalInstallments?: number;
		attendanceBased?: boolean;
		attendanceAmountBasis?: BenefitAttendanceAmountBasis | null;
		recurrenceFrequency?: BenefitRecurrenceFrequency | null;
	},
	ctx: z.RefinementCtx,
) => {
	if (data.scheduleMode === "TIME_BOUND" && !data.endDate) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "End date is required for time-bound schedules",
			path: ["endDate"],
		});
	}

	if (
		data.scheduleMode === "FIXED_INSTALLMENTS" &&
		(!Number.isInteger(data.totalInstallments) || (data.totalInstallments || 0) <= 0)
	) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Installment count must be a positive whole number",
			path: ["totalInstallments"],
		});
	}

	if (
		(data.scheduleMode === "TIME_BOUND" || data.scheduleMode === "RECURRING") &&
		data.startDate &&
		data.endDate &&
		data.endDate < data.startDate
	) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "End date cannot be before start date",
			path: ["endDate"],
		});
	}

	if (data.attendanceBased === true) {
		if (
			data.attendanceAmountBasis !== "PER_DAY" &&
			data.attendanceAmountBasis !== "PER_CUTOFF"
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Amount basis is required when compute from attendance is enabled",
				path: ["attendanceAmountBasis"],
			});
		}
	} else if (
		data.attendanceBased === false &&
		data.attendanceAmountBasis != null &&
		data.attendanceAmountBasis !== undefined
	) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Amount basis must be empty when compute from attendance is disabled",
			path: ["attendanceAmountBasis"],
		});
	}

	if (
		data.scheduleMode !== undefined &&
		data.scheduleMode !== "RECURRING" &&
		data.recurrenceFrequency != null &&
		data.recurrenceFrequency !== undefined
	) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Recurrence frequency is only valid for recurring schedules",
			path: ["recurrenceFrequency"],
		});
	}
};

// EmployeeBenefit Schema (full, including ID)
const EmployeeBenefitBaseSchema = z.object({
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
	scheduleMode: BenefitScheduleModeSchema.optional(),
	recurrenceFrequency: BenefitRecurrenceFrequencySchema.nullable().optional(),
	totalInstallments: z.number().int().positive().optional(),
	attendanceBased: z.boolean().optional(),
	attendanceAmountBasis: BenefitAttendanceAmountBasisSchema.nullable().optional(),
	eligibilityMode: BenefitEligibilityModeSchema.optional(),
	eligibilityDisqualifyOnAbsent: z.boolean().optional(),
	eligibilityDisqualifyOnLate: z.boolean().optional(),
	eligibilityDisqualifyOnUndertime: z.boolean().optional(),
	eligibilityDisqualifyOnLeave: z.boolean().optional(),
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

export const EmployeeBenefitSchema = EmployeeBenefitBaseSchema.superRefine(
	validateScheduleFields,
);

export type EmployeeBenefit = z.infer<typeof EmployeeBenefitSchema>;

// Create EmployeeBenefit Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateEmployeeBenefitSchema = EmployeeBenefitBaseSchema.omit({
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
		scheduleMode: BenefitScheduleModeSchema,
	})
	.superRefine(validateScheduleFields);

export type CreateEmployeeBenefit = z.infer<typeof CreateEmployeeBenefitSchema>;

// Update EmployeeBenefit Schema (partial, excluding immutable fields and relations)
export const UpdateEmployeeBenefitSchema = EmployeeBenefitBaseSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	})
	.partial()
	.superRefine(validateScheduleFields);

export type UpdateEmployeeBenefit = z.infer<typeof UpdateEmployeeBenefitSchema>;

export type EmployeeBenefitWithRelations = EmployeeBenefit & {
	employee: Employee;
	benefitType: BenefitType;
};
