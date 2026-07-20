import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

import type { Calculator } from "./calculator.zod";
import type { EmployeePayroll } from "./employeepayroll.zod";

// PeriodStatus Enum
export const PeriodStatus = z.enum(["DRAFT", "OPEN", "PROCESSING", "COMPLETED", "CLOSED"]);
export const PayrollBusinessDayRule = z.enum(["NONE", "NEXT_BUSINESS_DAY"]);
export const PayrollFrequency = z.enum([
	"DAILY",
	"WEEKLY",
	"BIWEEKLY",
	"SEMI_MONTHLY",
	"MONTHLY",
	"QUARTERLY",
	"ANNUALLY",
]);

export type PeriodStatus = z.infer<typeof PeriodStatus>;
export type PayrollBusinessDayRule = z.infer<typeof PayrollBusinessDayRule>;
export type PayrollFrequency = z.infer<typeof PayrollFrequency>;

const CycleRulesSchema = z
	.object({
		SEMI_MONTHLY: z
			.object({
				firstStartDay: z.number().int().min(1).max(28),
				secondStartDay: z.number().int().min(2).max(31),
				secondEndDay: z.union([z.number().int().min(1).max(31), z.literal("LAST_DAY")]),
			})
			.superRefine((value, ctx) => {
				if (value.secondStartDay <= value.firstStartDay) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message:
							"secondStartDay must be greater than firstStartDay.",
						path: ["secondStartDay"],
					});
				}

				if (value.secondEndDay === "LAST_DAY") {
					if (value.firstStartDay !== 1) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message:
								"firstStartDay must be 1 when secondEndDay is LAST_DAY to keep coverage continuous.",
							path: ["firstStartDay"],
						});
					}
					return;
				}

				if (value.firstStartDay !== value.secondEndDay + 1) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message:
							"For continuous coverage, firstStartDay must equal secondEndDay + 1 when secondEndDay is numeric.",
						path: ["secondEndDay"],
					});
				}
			})
			.optional(),
		WEEKLY: z
			.object({
				anchorWeekday: z.number().int().min(0).max(6),
			})
			.optional(),
		BIWEEKLY: z
			.object({
				anchorWeekday: z.number().int().min(0).max(6),
			})
			.optional(),
		MONTHLY: z
			.object({
				startDay: z.number().int().min(1).max(31),
				endDay: z.union([z.number().int().min(1).max(31), z.literal("LAST_DAY")]),
			})
			.optional(),
		QUARTERLY: z
			.object({
				startMonth: z.number().int().min(1).max(12),
			})
			.optional(),
		ANNUALLY: z
			.object({
				startMonth: z.number().int().min(1).max(12),
			})
			.optional(),
	})
	.partial();

// PayrollPeriod Schema (full, including ID)
export const PayrollPeriodSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	name: z.string().min(1),
	code: z.string().optional(),
	payFrequency: z
		.enum(["DAILY", "WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "QUARTERLY", "ANNUALLY"])
		.optional(),
	startDate: z.coerce.date(),
	endDate: z.coerce.date(),
	payDate: z.coerce.date(),
	calculatorId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.nullable()
		.optional(),
	status: z.enum(["DRAFT", "OPEN", "PROCESSING", "COMPLETED", "CLOSED"]),
	cutoffDay: z.number().int().optional(),
	periodNumber: z.number().int().min(1).optional(),
	notes: z.string().optional(),
	generationMetadata: z.record(z.string(), z.any()).optional(),
	payslipReleaseAttachmentUrl: z.string().optional().nullable(),
	processedBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	processedAt: z.coerce.date().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type PayrollPeriod = z.infer<typeof PayrollPeriodSchema>;

// Create PayrollPeriod Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreatePayrollPeriodSchema = PayrollPeriodSchema.omit({
	id: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	calculatorId: true,
	cutoffDay: true,
	periodNumber: true,
	notes: true,
	processedBy: true,
	processedAt: true,
});

export type CreatePayrollPeriod = z.infer<typeof CreatePayrollPeriodSchema>;

// Update PayrollPeriod Schema (partial, excluding immutable fields and relations)
export const UpdatePayrollPeriodSchema = PayrollPeriodSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdatePayrollPeriod = z.infer<typeof UpdatePayrollPeriodSchema>;

export type PayrollPeriodWithRelations = PayrollPeriod & {
	calculator: Calculator | null;
	employeePayrolls: EmployeePayroll[];
};

export const PayrollCycleConfigSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	defaultPayFrequency: PayrollFrequency.default("SEMI_MONTHLY"),
	payDateOffsetDays: z.number().int().min(0).max(60).default(5),
	businessDayRule: PayrollBusinessDayRule.default("NEXT_BUSINESS_DAY"),
	includeHolidaysInBusinessDayCheck: z.boolean().default(true),
	cycleRules: CycleRulesSchema.optional(),
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export const UpdatePayrollCycleConfigSchema = PayrollCycleConfigSchema.omit({
	id: true,
	organizationId: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
})
	.partial();

export const PayrollPeriodBulkGenerateSchema = z.object({
	frequency: PayrollFrequency,
	rangeStart: z.coerce.date(),
	rangeEnd: z.coerce.date(),
	calculatorId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	namingMode: z.enum(["DEFAULT", "MONTHLY_LABEL", "CUSTOM_PREFIX"]).optional().default("DEFAULT"),
	customNamePrefix: z.string().trim().min(1).max(30).optional(),
	dryRun: z.boolean().optional().default(false),
}).refine((data) => data.rangeEnd >= data.rangeStart, {
	message: "rangeEnd must be on or after rangeStart",
	path: ["rangeEnd"],
});

export const PayrollPeriodBulkAdjustSchema = z.object({
	frequency: PayrollFrequency.optional(),
	periodIds: z.array(z.string().refine((val) => isValidObjectId(val))).optional(),
	forceRetroactive: z.boolean().optional().default(false),
	dryRun: z.boolean().optional().default(false),
});

export type PayrollCycleConfig = z.infer<typeof PayrollCycleConfigSchema>;
export type UpdatePayrollCycleConfig = z.infer<typeof UpdatePayrollCycleConfigSchema>;
export type PayrollPeriodBulkGenerate = z.infer<typeof PayrollPeriodBulkGenerateSchema>;
export type PayrollPeriodBulkAdjust = z.infer<typeof PayrollPeriodBulkAdjustSchema>;
