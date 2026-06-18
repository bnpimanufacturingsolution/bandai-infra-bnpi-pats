import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

import type { Timesheetline } from "./timesheetline.zod";
export { UpdateTimesheetConfigSchema } from "./timesheetconfig.zod";

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
	metadata: z.any().optional(),
});

export type DailyBreakdown = z.infer<typeof DailyBreakdownSchema>;

// Timesheet Schema (full, including ID)
export const TimesheetSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	code: z.string().min(1),
	organizationId: z.string().min(1),
	employeeId: z.string().refine((val) => isValidObjectId(val)),
	payrollPeriodId: z.string().refine((val) => isValidObjectId(val)),
	attendances: z.array(z.string()),
	employeePayroll: z.string().optional(),
	breakdown: z.array(DailyBreakdownSchema),
	totalDays: z.number().int().optional(),
	totalHoursWorked: z.string().optional(),
	totalRegularHours: z.string().optional(),
	totalOvertimeHours: z.string().optional(),
	totalUndertimeHours: z.string().optional(),
	totalLateHours: z.string().optional(),
	totalEarlyOutHours: z.string().optional(),
	metadata: z.any().optional(),
	status: TimesheetStatus,
	submittedAt: z.coerce.date().optional(),
	submittedBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	approvedBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	approvalDate: z.coerce.date().optional(),
	rejectionReason: z.string().optional(),
	lockedAt: z.coerce.date().optional().nullable(),
	lockedBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	lockReason: z.string().optional().nullable(),
	lockRunId: z.string().optional().nullable(),
	lockedEmployeePayrollId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	notes: z.string().optional(),
	editPermissionStatus: z.enum([
		"NONE",
		"REQUESTED",
		"APPROVED",
		"REJECTED",
		"CONSUMED",
		"EXPIRED",
		"REVOKED",
	]),
	editPermissionRequestId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	editPermissionRequestedAt: z.coerce.date().optional(),
	editPermissionGrantedAt: z.coerce.date().optional(),
	editPermissionGrantedBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	editPermissionRejectedAt: z.coerce.date().optional(),
	editPermissionRejectedBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	editPermissionRejectionReason: z.string().optional(),
	editPermissionConsumedAt: z.coerce.date().optional(),
	editPermissionExpiresAt: z.coerce.date().optional(),
	editPermissionReason: z.string().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Timesheet = z.infer<typeof TimesheetSchema>;

// Create Timesheet Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateTimesheetSchema = TimesheetSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	lockedAt: true,
	lockedBy: true,
	lockReason: true,
	lockRunId: true,
	lockedEmployeePayrollId: true,
}).partial({
	employeePayroll: true,
	totalDays: true,
	totalHoursWorked: true,
	totalRegularHours: true,
	totalOvertimeHours: true,
	totalUndertimeHours: true,
	totalLateHours: true,
	totalEarlyOutHours: true,
	metadata: true,
	submittedAt: true,
	submittedBy: true,
	approvedBy: true,
	approvalDate: true,
	rejectionReason: true,
	notes: true,
	editPermissionRequestId: true,
	editPermissionRequestedAt: true,
	editPermissionGrantedAt: true,
	editPermissionGrantedBy: true,
	editPermissionRejectedAt: true,
	editPermissionRejectedBy: true,
	editPermissionRejectionReason: true,
	editPermissionConsumedAt: true,
	editPermissionExpiresAt: true,
	editPermissionReason: true,
	isDeleted: true,
});

export type CreateTimesheet = z.infer<typeof CreateTimesheetSchema>;

// Update Timesheet Schema (partial, excluding immutable fields and relations)
export const UpdateTimesheetSchema = TimesheetSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	lockedAt: true,
	lockedBy: true,
	lockReason: true,
	lockRunId: true,
	lockedEmployeePayrollId: true,
}).partial();

export type UpdateTimesheet = z.infer<typeof UpdateTimesheetSchema>;

export type TimesheetWithRelations = Timesheet & {
	lines: Timesheetline[];
};

const EditPermissionReasonSchema = z.string().trim().min(3).max(1000);

export const TimesheetActionSchema = z.object({
	action: z.enum(["SUBMIT", "APPROVE", "REJECT", "REVISE"]),
	rejectionReason: z.string().trim().min(1).max(1000).optional(),
	notes: z.string().trim().max(1000).optional(),
	breakdown: z.array(z.any()).optional(),
});

export type TimesheetAction = z.infer<typeof TimesheetActionSchema>;

export const NormalizeTimesheetBreakdownPreviewSchema = z.object({
	timesheetId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid timesheet ID",
	}),
	breakdown: z.array(z.any()).min(1),
});

export type NormalizeTimesheetBreakdownPreview = z.infer<
	typeof NormalizeTimesheetBreakdownPreviewSchema
>;

export const RequestTimesheetEditPermissionSchema = z.object({
	reason: EditPermissionReasonSchema,
});

export type RequestTimesheetEditPermission = z.infer<typeof RequestTimesheetEditPermissionSchema>;

export const RequestCurrentTimesheetEditPermissionSchema = z.object({
	reason: EditPermissionReasonSchema,
	periodCode: z.string().trim().min(1).max(80).optional(),
});

export type RequestCurrentTimesheetEditPermission = z.infer<
	typeof RequestCurrentTimesheetEditPermissionSchema
>;

export const ReviewTimesheetEditPermissionSchema = z.object({
	requestId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid request ID",
	}),
	decision: z.enum(["approve", "reject"]),
	reason: z.string().trim().max(1000).optional(),
});

export type ReviewTimesheetEditPermission = z.infer<typeof ReviewTimesheetEditPermissionSchema>;
