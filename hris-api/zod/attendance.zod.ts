import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

import type { Employee } from "./employee.zod";
import { EmployeeScheduleSchema } from "./schedule.zod";
import {
	ATTENDANCE_CORRECTION_REASON_CATEGORY_OPTIONS,
	normalizeAttendanceCorrectionPayload,
} from "../app/attendance/attendance-correction.service";

// AttendanceStatus Enum
export const AttendanceStatus = z.enum([
	"PRESENT",
	"LEAVE",
	"INCOMPLETE",
	"ABSENT",
	"REST_DAY",
]);

export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

// Attendance Schema (full, including ID) - matches attendance.prisma exactly
export const AttendanceSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	employeeId: z.string().refine((val) => isValidObjectId(val)),
	date: z.coerce.date(), // Date of attendance (YYYY-MM-DD)
	timeIn: z.coerce.date().optional(),
	timeOut: z.coerce.date().optional(),
	status: AttendanceStatus,
	behaviorFlags: z.array(z.enum(["UNDERTIME", "OVERTIME"])).optional(),
	scheduleSnapshot: EmployeeScheduleSchema.optional().nullable(), // Copy of employee's schedule on this date
	timeInLocation: z.any().optional(),
	timeOutLocation: z.any().optional(),
	deviceInfo: z.any().optional(),
	isManualEntry: z.boolean(),
	approvedBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	// Timekeeping calculations (auto-calculated)

	breakMinutes: z.number().int().optional().nullable(),

	// Formatted hours (auto-calculated)
	hoursWorked: z.string().optional().nullable(),
	regularHours: z.string().optional().nullable(),
	overtimeHours: z.string().optional().nullable(),
	undertimeHours: z.string().optional().nullable(),
	lateHours: z.string().optional().nullable(),
	earlyOutHours: z.string().optional().nullable(),
	notes: z.string().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Attendance = z.infer<typeof AttendanceSchema>;

// Create Attendance Schema (excluding ID, createdAt, updatedAt, and computed fields)
// scheduleSnapshot is optional in creation - it will be set programmatically by the controller
// Timekeeping fields are omitted as they are auto-calculated by the controller
export const CreateAttendanceSchema = AttendanceSchema.omit({
	id: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
	// Omit timekeeping fields - these are auto-calculated

	breakMinutes: true,
	hoursWorked: true,
	regularHours: true,
	overtimeHours: true,
	undertimeHours: true,
	lateHours: true,
	earlyOutHours: true,
	behaviorFlags: true,
})
	.partial({
		date: true, // Make date optional for creation
		timeIn: true,
		timeOut: true,
		scheduleSnapshot: true, // Optional - controller will handle setting this
		timeInLocation: true,
		timeOutLocation: true,
		deviceInfo: true,
		isManualEntry: true,
		approvedBy: true,
		notes: true,
	})
	.transform((data) => {
		// Set default values for timeIn if not provided
		const result = { ...data };

		// If timeIn is not provided, set it to current time
		if (result.timeIn === undefined || result.timeIn === null) {
			result.timeIn = new Date();
		}

		// If timeOut is not provided, leave it as null (it will be set later when employee clocks out)
		// Don't set a default for timeOut as it should only be set when employee actually clocks out

		return result;
	});

export type CreateAttendance = z.infer<typeof CreateAttendanceSchema>;

// Update Attendance Schema (partial, excluding immutable fields and relations)
// Timekeeping fields are omitted as they are auto-calculated when timeIn or timeOut changes
export const UpdateAttendanceSchema = AttendanceSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	// Omit timekeeping fields - these are auto-recalculated on update

	breakMinutes: true,
	hoursWorked: true,
	regularHours: true,
	overtimeHours: true,
	undertimeHours: true,
	lateHours: true,
	earlyOutHours: true,
	behaviorFlags: true,
}).partial();

export type UpdateAttendance = z.infer<typeof UpdateAttendanceSchema>;

export type AttendanceWithRelations = Attendance & {
	employee: Employee;
};

export const CreateAttendanceCorrectionSchema = z
	.object({
		attendanceId: z.string().refine((val) => isValidObjectId(val)),
		employeeId: z.string().refine((val) => isValidObjectId(val)),
		correctionDate: z.string().min(1),
		status: AttendanceStatus,
		timeIn: z.string().optional().nullable(),
		timeOut: z.string().optional().nullable(),
		reasonCategory: z.enum(ATTENDANCE_CORRECTION_REASON_CATEGORY_OPTIONS),
		notes: z.string().trim().min(1, "Explanation is required for attendance corrections."),
	})
	.superRefine((data, ctx) => {
		const validation = normalizeAttendanceCorrectionPayload(data, {
			requireAttendanceId: true,
			allowedReasonCategories: ATTENDANCE_CORRECTION_REASON_CATEGORY_OPTIONS,
		});

		if (validation.ok) return;

		for (const issue of validation.issues) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: issue.field === "form" ? [] : [issue.field],
				message: issue.message,
			});
		}
	});

export type CreateAttendanceCorrection = z.infer<typeof CreateAttendanceCorrectionSchema>;

export const CreateAttendanceBackfillSchema = z
	.object({
		employeeId: z.string().refine((val) => isValidObjectId(val)),
		correctionDate: z.string().min(1),
		status: AttendanceStatus,
		timeIn: z.string().optional().nullable(),
		timeOut: z.string().optional().nullable(),
		reasonCategory: z.enum(ATTENDANCE_CORRECTION_REASON_CATEGORY_OPTIONS),
		notes: z.string().trim().min(1, "Explanation is required for attendance corrections."),
	})
	.superRefine((data, ctx) => {
		const validation = normalizeAttendanceCorrectionPayload(data, {
			source: "HR_DIRECT_BACKFILL",
			requireAttendanceId: false,
			allowedReasonCategories: ATTENDANCE_CORRECTION_REASON_CATEGORY_OPTIONS,
		});

		if (validation.ok) return;

		for (const issue of validation.issues) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: issue.field === "form" ? [] : [issue.field],
				message: issue.message,
			});
		}
	});

export type CreateAttendanceBackfill = z.infer<typeof CreateAttendanceBackfillSchema>;
