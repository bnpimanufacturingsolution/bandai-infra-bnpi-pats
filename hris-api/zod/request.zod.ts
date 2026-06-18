import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

import type { Employee } from "./employee.zod";
import type { Department } from "./department.zod";

// RequestType Enum
export const RequestType = z.enum([
	"LEAVE",
	"TIMESHEET",
	"ATTENDANCE_CORRECTION",
	"EXPENSE_REIMBURSEMENT",
	"DOCUMENT_REQUEST",
	"RESIGNATION",
	"TERMINATION",
	"REGULARIZATION",
	"PROMOTION",
	"SALARY_CHANGE",
	"TRANSFER",
	"SCHEDULE_CHANGE",
	"OTHER",
]);

export type RequestType = z.infer<typeof RequestType>;

export const WorkflowStateKey = z.string().min(1, "Workflow state key is required");

export type WorkflowStateKey = z.infer<typeof WorkflowStateKey>;

// Request Schema (full, including ID)
export const RequestSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	code: z.string().min(1).optional().nullable(), // Human-readable request code (e.g., REQ-00001)
	requesterId: z.string().refine((val) => isValidObjectId(val)),
	type: RequestType,
	currentWorkflowStateKey: WorkflowStateKey,
	startDate: z.coerce.date().optional(),
	endDate: z.coerce.date().optional(),
	description: z.string().min(1),
	attachments: z.array(z.any()).default([]), // Defaults to empty array
	metadata: z.record(z.any()).optional(),
	notes: z.string().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),

	targetEmployeeId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
});

export type Request = z.infer<typeof RequestSchema>;

// Create Request Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateRequestSchema = RequestSchema.omit({
	id: true,
	code: true, // Code is auto-generated, so omit it from create schema
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
})
	.partial({
		organizationId: true, // Optional, can be taken from user context
		metadata: true,
		startDate: true,
		endDate: true,
		notes: true,
		attachments: true,
	})
	.extend({
		currentWorkflowStateKey: WorkflowStateKey.default("OPEN"),
		targetEmployeeId: z
			.string()
			.refine((val) => isValidObjectId(val), "Invalid Target Employee ID")
			.optional(),
		// Reviewers are automatically assigned based on requester role
		// No need to pass reviewerIds manually
	})
	.superRefine((data, ctx) => {
		// For LEAVE type requests, require startDate, endDate, and metadata
		if (data.type === "LEAVE") {
			const metadata = (data.metadata || {}) as Record<string, any>;
			const durationUnit = metadata.durationUnit || "FULL_DAY";

			if (data.startDate === undefined || data.startDate === null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Start date is required for leave requests",
					path: ["startDate"],
				});
			}
			if (data.endDate === undefined || data.endDate === null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "End date is required for leave requests",
					path: ["endDate"],
				});
			}
			if (
				!data.metadata ||
				typeof data.metadata !== "object" ||
				Object.keys(data.metadata).length === 0
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message:
						"Metadata is required for leave requests (must include leaveType and totalDays)",
					path: ["metadata"],
				});
			}
			// Validate endDate is after startDate
			if (data.startDate && data.endDate && data.endDate < data.startDate) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "End date must be after or equal to start date",
					path: ["endDate"],
				});
			}

			if (!metadata.leaveType || String(metadata.leaveType).trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Leave type is required",
					path: ["metadata", "leaveType"],
				});
			}

			if (typeof metadata.totalDays !== "number" || metadata.totalDays <= 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "totalDays must be a positive number",
					path: ["metadata", "totalDays"],
				});
			}

			if (durationUnit !== "FULL_DAY" && durationUnit !== "HALF_DAY") {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "durationUnit must be FULL_DAY or HALF_DAY",
					path: ["metadata", "durationUnit"],
				});
			}

			if (durationUnit === "HALF_DAY") {
				if (
					data.startDate &&
					data.endDate &&
					data.startDate.toISOString().split("T")[0] !==
						data.endDate.toISOString().split("T")[0]
				) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Half-day leave must be for a single date only",
						path: ["endDate"],
					});
				}

				if (metadata.halfDaySession !== "AM" && metadata.halfDaySession !== "PM") {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "halfDaySession is required for half-day leave (AM or PM)",
						path: ["metadata", "halfDaySession"],
					});
				}

				if (metadata.totalDays !== 0.5) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Half-day leave must have totalDays set to 0.5",
						path: ["metadata", "totalDays"],
					});
				}
			}
		}

		if (data.type === "SCHEDULE_CHANGE") {
			const metadata = (data.metadata || {}) as Record<string, any>;
			const requiredMetadataFields = [
				"effectiveDate",
				"requestedDate",
				"reason",
			];

			for (const field of requiredMetadataFields) {
				if (!metadata?.[field] || String(metadata[field]).trim().length === 0) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: `${field} is required for schedule change requests`,
						path: ["metadata", field],
					});
				}
			}

			const requestedTimeSlots = Array.isArray(metadata?.requestedTimeSlots)
				? metadata.requestedTimeSlots
				: [];
			if (requestedTimeSlots.length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "requestedTimeSlots is required for schedule change requests",
					path: ["metadata", "requestedTimeSlots"],
				});
			}

			for (const [index, slot] of requestedTimeSlots.entries()) {
				if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Each requested time slot must be an object",
						path: ["metadata", "requestedTimeSlots", index],
					});
					continue;
				}
				if (!slot.startTime || !slot.endTime) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Each requested time slot requires startTime and endTime",
						path: ["metadata", "requestedTimeSlots", index],
					});
				}
			}

			if (metadata?.requestSource !== "EMPLOYEE_SELF_SERVICE") {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "requestSource must be EMPLOYEE_SELF_SERVICE",
					path: ["metadata", "requestSource"],
				});
			}

			if (data.startDate === undefined || data.startDate === null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Start date is required for schedule change requests",
					path: ["startDate"],
				});
			}

			if (data.endDate === undefined || data.endDate === null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "End date is required for schedule change requests",
					path: ["endDate"],
				});
			}

			if (
				data.startDate &&
				data.endDate &&
				data.startDate.toISOString().split("T")[0] !==
					data.endDate.toISOString().split("T")[0]
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Schedule change requests must be for one date only",
					path: ["endDate"],
				});
			}
		}

		// Validation for REGULARIZATION
		if (data.type === "REGULARIZATION") {
			const metadata = data.metadata as Record<string, any>;
			if (!metadata?.performanceAssessment || metadata.performanceAssessment.length < 10) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Performance assessment is required and must be detailed",
					path: ["metadata", "performanceAssessment"],
				});
			}
			const initiatedByRole = String(metadata?.initiatedByRole || "")
				.trim()
				.toUpperCase();
			if (
				initiatedByRole === "HR" &&
				metadata?.attendanceConfirmation &&
				metadata.attendanceConfirmation !== "CONFIRMED"
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Attendance confirmation must be CONFIRMED when provided",
					path: ["metadata", "attendanceConfirmation"],
				});
			}
			if (!metadata?.recommendation && !metadata?.managerRecommendation) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Recommendation is required",
					path: ["metadata", "recommendation"],
				});
			}
		}

		// Validation for PROMOTION
		if (data.type === "PROMOTION") {
			const metadata = data.metadata as Record<string, any>;
			if (!metadata?.promotionLevel || metadata.promotionLevel.length < 2) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Promotion level is required",
					path: ["metadata", "promotionLevel"],
				});
			}
			if (!metadata?.justification || metadata.justification.length < 1) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Justification is required",
					path: ["metadata", "justification"],
				});
			}
			if (!metadata?.effectiveDate) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Effective date is required",
					path: ["metadata", "effectiveDate"],
				});
			}
		}

		// Validation for SALARY_CHANGE
		if (data.type === "SALARY_CHANGE") {
			const metadata = data.metadata as Record<string, any>;
			const nextSalary = Number(metadata?.newSalary ?? metadata?.proposedSalary);
			if (!Number.isFinite(nextSalary) || nextSalary < 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "New salary must be a valid non-negative number",
					path: ["metadata", "newSalary"],
				});
			}
			if (!metadata?.justification || String(metadata.justification).trim().length < 10) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Salary change justification is required",
					path: ["metadata", "justification"],
				});
			}
		}

		// Validation for TERMINATION
		if (data.type === "TERMINATION") {
			const metadata = data.metadata as Record<string, any>;
			if (!metadata?.type) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Termination type is required",
					path: ["metadata", "type"],
				});
			}
			if (!metadata?.explanation || metadata.explanation.length < 1) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Explanation is required",
					path: ["metadata", "explanation"],
				});
			}
			// Attachments are now optional as per user request
		}
	});

export type CreateRequest = z.infer<typeof CreateRequestSchema>;

// Update Request Schema (partial, excluding immutable fields and relations)
export const UpdateRequestSchema = RequestSchema.omit({
	id: true,
	code: true, // Code is immutable, cannot be updated
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	requesterId: true, // Cannot change requester after creation
}).partial();

export type UpdateRequest = z.infer<typeof UpdateRequestSchema>;

// Department reviewer type
export interface RequestDepartmentReviewer {
	id: string;
	requestId: string;
	departmentId: string;
	status?: WorkflowStateKey;
	reviewedAt?: Date;
	notes?: string;
	reviewedById?: string;
	createdAt: Date;
	updatedAt: Date;
	isDeleted: boolean;
}

// Employee reviewer type
export interface RequestEmployeeReviewer {
	id: string;
	requestId: string;
	reviewerId: string;
	status?: WorkflowStateKey;
	reviewedAt?: Date;
	notes?: string;
	createdAt: Date;
	updatedAt: Date;
	isDeleted: boolean;
}

export type RequestWithRelations = Request & {
	requester?: Employee; // Employee who made the request
	departmentReviewers?: (RequestDepartmentReviewer & {
		department?: Department;
		reviewedBy?: Employee; // Employee who actually reviewed from this department
	})[];
	employeeReviewers?: (RequestEmployeeReviewer & {
		reviewer?: Employee; // Employee who is assigned as reviewer
	})[];
};

// Approval action schema for single endpoint approve/reject
export const RequestApprovalSchema = z.object({
	action: z.enum(["approve", "reject"]),
	comment: z.string().optional(),
});

export type RequestApproval = z.infer<typeof RequestApprovalSchema>;

export const RequestDelegateStepSchema = z.object({
	mode: z.enum(["TEMPORARY", "REASSIGN"]).default("REASSIGN"),
	reason: z.string().trim().min(1).optional(),
});

export type RequestDelegateStep = z.infer<typeof RequestDelegateStepSchema>;
