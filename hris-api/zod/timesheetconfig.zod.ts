import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

// TimesheetStatus Enum
export const TimesheetStatus = z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "REVISED"]);

export type TimesheetStatus = z.infer<typeof TimesheetStatus>;

// TimesheetEditPermissionStatus Enum
export const TimesheetEditPermissionStatus = z.enum([
	"NONE",
	"REQUESTED",
	"APPROVED",
	"REJECTED",
	"CONSUMED",
	"EXPIRED",
	"REVOKED",
]);

export type TimesheetEditPermissionStatus = z.infer<typeof TimesheetEditPermissionStatus>;

// TimesheetRejectBehavior Enum
export const TimesheetRejectBehavior = z.enum(["REVISE", "REJECT"]);

export type TimesheetRejectBehavior = z.infer<typeof TimesheetRejectBehavior>;

export const RoundingModeSchema = z.enum(["NONE", "NEAREST", "UP", "DOWN"]);
export const RoundingIncrementMinutesSchema = z.union([
	z.literal(1),
	z.literal(5),
	z.literal(10),
	z.literal(15),
	z.literal(30),
	z.literal(60),
]);

export const WorkTimeRoundingRuleSchema = z.object({
	enabled: z.boolean(),
	incrementMinutes: RoundingIncrementMinutesSchema,
	mode: RoundingModeSchema,
	applyTo: z.enum(["WORKED_MINUTES", "PAYABLE_MINUTES"]),
});

export const OvertimeQualificationRuleSchema = z.object({
	enabled: z.boolean(),
	minimumMinutesBeforeQualification: z.number().int().min(0),
	rounding: z.object({
		enabled: z.boolean(),
		incrementMinutes: RoundingIncrementMinutesSchema,
		mode: z.enum(["NEAREST", "UP", "DOWN"]),
	}),
	basis: z.literal("POST_SHIFT_EXCESS"),
});

export const PayrollFinalizationRuleSchema = z.object({
	enabled: z.boolean(),
	lockTimesheetOnCutoffFinalization: z.boolean(),
	allowUnlockWithAuthorizedPayrollRun: z.boolean(),
	freezeComputedValuesOnLock: z.boolean(),
});

// DailyBreakdown Schema
export const DailyBreakdownSchema = z.object({
	approvalStatus: TimesheetStatus.optional(),
	date: z.coerce.date(),
	timeIn: z.coerce.date().optional(),
	timeOut: z.coerce.date().optional(),
	hoursWorked: z.string().optional(),
	regularHours: z.string().optional(),
	overtimeHours: z.string().optional(),
	undertimeHours: z.string().optional(),
	lateHours: z.string().optional(),
	earlyOutHours: z.string().optional(),
	status: z.string().optional(),
	employeeNotes: z.string().nullable().optional(),
	approverNotes: z.string().nullable().optional(),
	dayLaborType: z.enum(["DIRECT", "INDIRECT"]).nullable().optional(),
	metadata: z.any().optional(),
});

export type DailyBreakdown = z.infer<typeof DailyBreakdownSchema>;

// TimesheetConfig Schema (full, including ID)
export const TimesheetConfigSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	enableAutoApprove: z.boolean(),
	enableEditBeforeSubmission: z.boolean(),
	rejectBehavior: z.enum(["REVISE", "REJECT"]),
	overtimeFlagThresholdMinutes: z.number().int(),
	requireManagerApprovedOvertime: z.boolean().optional(),
	workTimeRounding: WorkTimeRoundingRuleSchema.optional().nullable(),
	overtimeQualification: OvertimeQualificationRuleSchema.optional().nullable(),
	payrollFinalization: PayrollFinalizationRuleSchema.optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type TimesheetConfig = z.infer<typeof TimesheetConfigSchema>;

// Create TimesheetConfig Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateTimesheetConfigSchema = TimesheetConfigSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});

export type CreateTimesheetConfig = z.infer<typeof CreateTimesheetConfigSchema>;

// Update TimesheetConfig Schema (partial, excluding immutable fields and relations)
export const UpdateTimesheetConfigSchema = TimesheetConfigSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateTimesheetConfig = z.infer<typeof UpdateTimesheetConfigSchema>;
