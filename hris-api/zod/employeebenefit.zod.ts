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

export const BenefitScheduleMode = z.enum([
	"TIME_BOUND",
	"FIXED_INSTALLMENTS",
	"RECURRING",
]);

export type BenefitScheduleMode = z.infer<typeof BenefitScheduleMode>;

export const BenefitAttendanceAmountBasis = z.enum(["PER_DAY", "PER_CUTOFF"]);

export type BenefitAttendanceAmountBasis = z.infer<typeof BenefitAttendanceAmountBasis>;

export const BenefitRecurrenceFrequency = z.enum(["EVERY_CUTOFF", "MONTHLY", "YEARLY"]);

export type BenefitRecurrenceFrequency = z.infer<typeof BenefitRecurrenceFrequency>;

export const BenefitEligibilityMode = z.enum(["ENROLLED_ALWAYS", "ATTENDANCE_QUALIFIED"]);

export type BenefitEligibilityMode = z.infer<typeof BenefitEligibilityMode>;

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
	totalInstallments: z.number().int().min(0),
	installmentAmount: z.number(),
	remainingBalance: z.number(),
	scheduleMode: BenefitScheduleMode.optional(),
	recurrenceFrequency: BenefitRecurrenceFrequency.nullable().optional(),
	attendanceBased: z.boolean().optional(),
	attendanceAmountBasis: BenefitAttendanceAmountBasis.nullable().optional(),
	eligibilityMode: BenefitEligibilityMode.optional(),
	eligibilityDisqualifyOnAbsent: z.boolean().optional(),
	eligibilityDisqualifyOnLate: z.boolean().optional(),
	eligibilityDisqualifyOnUndertime: z.boolean().optional(),
	eligibilityDisqualifyOnLeave: z.boolean().optional(),
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
export const CreateEmployeeBenefitInputSchema = EmployeeBenefitSchema.omit({
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
		totalInstallments: z.number().int().min(0).optional(),
		status: BenefitProgramStatus.default("ACTIVE"),
		isActive: z.boolean().default(true),
		attendanceBased: z.boolean().default(false),
		attendanceAmountBasis: BenefitAttendanceAmountBasis.nullable().optional(),
		recurrenceFrequency: BenefitRecurrenceFrequency.nullable().optional(),
		eligibilityMode: BenefitEligibilityMode.default("ENROLLED_ALWAYS"),
		eligibilityDisqualifyOnAbsent: z.boolean().default(true),
		eligibilityDisqualifyOnLate: z.boolean().default(false),
		eligibilityDisqualifyOnUndertime: z.boolean().default(false),
		eligibilityDisqualifyOnLeave: z.boolean().default(false),
	});

function validateEmployeeBenefitSchedule(
	data: {
		scheduleMode?: BenefitScheduleMode;
		totalInstallments?: number;
		startDate?: Date;
		endDate?: Date;
		attendanceBased?: boolean;
		attendanceAmountBasis?: BenefitAttendanceAmountBasis | null;
		recurrenceFrequency?: BenefitRecurrenceFrequency | null;
	},
	ctx: z.RefinementCtx,
) {
	if (data.scheduleMode === "FIXED_INSTALLMENTS" && data.totalInstallments === undefined) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["totalInstallments"],
			message: "totalInstallments is required for FIXED_INSTALLMENTS schedules",
		});
	}

	if (data.scheduleMode === "TIME_BOUND" && data.endDate === undefined) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["endDate"],
			message: "endDate is required for TIME_BOUND schedules",
		});
	}

	if (
		(data.scheduleMode === "TIME_BOUND" || data.scheduleMode === "RECURRING") &&
		data.startDate !== undefined &&
		data.endDate !== undefined &&
		data.endDate < data.startDate
	) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["endDate"],
			message:
				data.scheduleMode === "RECURRING"
					? "endDate must be on or after startDate for RECURRING schedules"
					: "endDate must be on or after startDate for TIME_BOUND schedules",
		});
	}

	if (data.attendanceBased === true) {
		if (data.attendanceAmountBasis !== "PER_DAY" && data.attendanceAmountBasis !== "PER_CUTOFF") {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["attendanceAmountBasis"],
				message: "attendanceAmountBasis is required when attendanceBased is true",
			});
		}
	} else if (
		data.attendanceBased === false &&
		data.attendanceAmountBasis != null &&
		data.attendanceAmountBasis !== undefined
	) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["attendanceAmountBasis"],
			message: "attendanceAmountBasis must be empty when attendanceBased is false",
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
			path: ["recurrenceFrequency"],
			message: "recurrenceFrequency is only valid for RECURRING schedules",
		});
	}
}

export function createEmployeeBenefitScheduleSchema<T extends z.AnyZodObject>(schema: T) {
	return schema
		.superRefine((data, ctx) =>
			validateEmployeeBenefitSchedule(
				data as {
					scheduleMode?: BenefitScheduleMode;
					totalInstallments?: number;
					startDate?: Date;
					endDate?: Date;
					attendanceBased?: boolean;
					attendanceAmountBasis?: BenefitAttendanceAmountBasis | null;
					recurrenceFrequency?: BenefitRecurrenceFrequency | null;
				},
				ctx,
			),
		)
		.transform((data) => {
			const row = data as Record<string, any>;
			const scheduleMode = row.scheduleMode as BenefitScheduleMode | undefined;
			const attendanceBased = row.attendanceBased === true;
			const attendanceAmountBasis = attendanceBased
				? (row.attendanceAmountBasis as BenefitAttendanceAmountBasis | null | undefined)
				: null;
			const rawFrequency = row.recurrenceFrequency as BenefitRecurrenceFrequency | null | undefined;
			const recurrenceFrequency =
				scheduleMode === "RECURRING"
					? rawFrequency === "MONTHLY" || rawFrequency === "YEARLY" || rawFrequency === "EVERY_CUTOFF"
						? rawFrequency
						: "EVERY_CUTOFF"
					: null;
			const rawEligibilityMode = String(row.eligibilityMode || "").toUpperCase();
			const eligibilityMode: BenefitEligibilityMode =
				rawEligibilityMode === "ATTENDANCE_QUALIFIED"
					? "ATTENDANCE_QUALIFIED"
					: "ENROLLED_ALWAYS";

			const next = {
				...row,
				attendanceBased,
				attendanceAmountBasis,
				recurrenceFrequency,
				eligibilityMode,
				eligibilityDisqualifyOnAbsent: row.eligibilityDisqualifyOnAbsent !== false,
				eligibilityDisqualifyOnLate: row.eligibilityDisqualifyOnLate === true,
				eligibilityDisqualifyOnUndertime: row.eligibilityDisqualifyOnUndertime === true,
				eligibilityDisqualifyOnLeave: row.eligibilityDisqualifyOnLeave === true,
			};

			if (scheduleMode === "RECURRING") {
				return {
					...next,
					totalInstallments: row.totalInstallments ?? 0,
				} as typeof data & Record<string, unknown>;
			}
			if (scheduleMode === "TIME_BOUND" || scheduleMode === "FIXED_INSTALLMENTS") {
				return {
					...next,
					// Explicit modes must not silently fall back to the legacy six default
					// when totalInstallments is intentionally omitted (e.g. TIME_BOUND).
					totalInstallments: row.totalInstallments,
				} as typeof data & Record<string, unknown>;
			}
			return {
				...next,
				totalInstallments: row.totalInstallments ?? 6,
			} as typeof data & Record<string, unknown>;
		});
}

export const CreateEmployeeBenefitSchema = createEmployeeBenefitScheduleSchema(
	CreateEmployeeBenefitInputSchema,
);

export type CreateEmployeeBenefit = z.infer<typeof CreateEmployeeBenefitSchema>;

/** Bulk create: same benefit fields applied to many employees. */
export const BulkCreateEmployeeBenefitInputSchema = CreateEmployeeBenefitInputSchema.omit({
	employeeId: true,
}).extend({
	employeeIds: z
		.array(z.string().refine((val) => isValidObjectId(val), "Invalid employee id"))
		.min(1, "At least one employee is required"),
});

export const BulkCreateEmployeeBenefitSchema = createEmployeeBenefitScheduleSchema(
	BulkCreateEmployeeBenefitInputSchema,
);

export type BulkCreateEmployeeBenefit = z.infer<typeof BulkCreateEmployeeBenefitSchema>;

/**
 * Payroll register quick adjustment: HR names a one-cutoff addition or
 * deduction per employee (e.g. "Good performance" +1000, "Equipment destroy"
 * -500). The server pins it to one OPEN payroll period on the standard
 * carrier type (OAD for additions, NEGADJ for deductions) with the custom
 * name stored on the enrollment.
 */
export const QuickAdjustEmployeeBenefitSchema = z.object({
	employeeIds: z
		.array(z.string().refine((val) => isValidObjectId(val), "Invalid employee id"))
		.min(1, "At least one employee is required")
		.max(200, "At most 200 employees per quick adjustment"),
	direction: z.enum(["ADDITION", "DEDUCTION"]),
	name: z.string().trim().min(1, "Adjustment name is required").max(120),
	amount: z.number({ invalid_type_error: "Amount must be a number" }).positive("Amount must be greater than zero"),
	payrollPeriodId: z.string().refine((val) => isValidObjectId(val), "Invalid payroll period id"),
});

export type QuickAdjustEmployeeBenefit = z.infer<typeof QuickAdjustEmployeeBenefitSchema>;

// Update EmployeeBenefit Schema (partial, excluding immutable fields and relations)
export const UpdateEmployeeBenefitSchema = EmployeeBenefitSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
})
	.partial()
	.superRefine((data, ctx) =>
		validateEmployeeBenefitSchedule(
			data as {
				scheduleMode?: BenefitScheduleMode;
				totalInstallments?: number;
				startDate?: Date;
				endDate?: Date;
				attendanceBased?: boolean;
				attendanceAmountBasis?: BenefitAttendanceAmountBasis | null;
				recurrenceFrequency?: BenefitRecurrenceFrequency | null;
			},
			ctx,
		),
	);

export type UpdateEmployeeBenefit = z.infer<typeof UpdateEmployeeBenefitSchema>;

export type EmployeeBenefitWithRelations = EmployeeBenefit & {
	employee: Employee;
	benefitType: BenefitType;
	installments?: EmployeeBenefitInstallment[];
};
