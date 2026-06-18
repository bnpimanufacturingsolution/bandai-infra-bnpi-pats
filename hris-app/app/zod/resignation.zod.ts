import { z } from "zod";

// ============================================================================
// ENUMS
// ============================================================================

export const ResignationStatusEnum = z.enum([
	"DRAFT",
	"RESIGNATION_REQUESTED",
	"MANAGER_DISCUSSION_REQUESTED",
	"MANAGER_REJECTED",
	"HR_REVIEW",
	"OFFBOARDING_IN_PROGRESS",
	"FINAL_CLEARANCE",
	"WITHDRAWN",
	"COMPLETED",
]);

export const ResignationReasonCategoryEnum = z.enum([
	"BETTER_OPPORTUNITY",
	"CAREER_GROWTH",
	"RELOCATION",
	"PERSONAL_REASONS",
	"HEALTH_REASONS",
	"FURTHER_EDUCATION",
	"RETIREMENT",
	"COMPANY_CULTURE",
	"COMPENSATION",
	"WORK_LIFE_BALANCE",
	"OTHER",
]);

export const ActionTypeEnum = z.enum([
	"RESIGNATION_SUBMITTED",
	"MANAGER_APPROVED",
	"MANAGER_REJECTED",
	"MANAGER_DISCUSSION_REQUESTED",
	"HR_APPROVED",
	"HR_REJECTED",
	"OFFBOARDING_STARTED",
	"CHECKLIST_ITEM_COMPLETED",
	"EXIT_INTERVIEW_SCHEDULED",
	"EXIT_INTERVIEW_COMPLETED",
	"FINAL_CLEARANCE_APPROVED",
	"RESIGNATION_WITHDRAWN",
	"SYSTEM_AUTO_TRANSITION",
	"COMMENT_ADDED",
	"ATTACHMENT_ADDED",
	"NOTICE_PERIOD_EXTENDED",
	"LAST_WORKING_DAY_CHANGED",
]);

// ============================================================================
// RESIGNATION SCHEMAS
// ============================================================================

// Full Resignation Schema
export const ResignationSchema = z.object({
	id: z.string(),
	resignationNumber: z.string(),

	// Employee Information
	employeeId: z.string(),
	managerId: z.string(),

	// Resignation Details
	status: ResignationStatusEnum,
	resignationDate: z.coerce.date(),
	lastWorkingDay: z.coerce.date(),
	effectiveDate: z.coerce.date().nullable(),
	noticePeriodDays: z.number().int().positive(),

	// Reason
	reasonCategory: ResignationReasonCategoryEnum,
	reasonDetails: z.string().min(10, "Reason must be at least 10 characters"),
	additionalComments: z.string().optional(),

	// Approval Workflow
	submittedAt: z.coerce.date().nullable(),

	// Manager Review
	managerReviewedAt: z.coerce.date().nullable(),
	managerReviewedBy: z
		.string()

		.nullable(),
	managerComments: z.string().nullable(),
	managerApproved: z.boolean().nullable(),

	// HR Review
	hrReviewedAt: z.coerce.date().nullable(),
	hrReviewedBy: z
		.string()

		.nullable(),
	hrComments: z.string().nullable(),
	hrApproved: z.boolean().nullable(),

	// Offboarding
	offboardingStartedAt: z.coerce.date().nullable(),
	offboardingCompletedAt: z.coerce.date().nullable(),
	finalClearanceAt: z.coerce.date().nullable(),
	finalClearanceBy: z
		.string()

		.nullable(),

	// Withdrawal
	isWithdrawn: z.boolean(),
	withdrawnAt: z.coerce.date().nullable(),
	withdrawnReason: z.string().nullable(),
	withdrawnBy: z
		.string()

		.nullable(),

	// Metadata
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	createdBy: z.string(),
});

export type Resignation = z.infer<typeof ResignationSchema>;

// Create Resignation Schema (Employee submits resignation)
export const CreateResignationSchema = z
	.object({
		employeeId: z.string(),
		managerId: z.string(),
		lastWorkingDay: z.coerce.date(),
		noticePeriodDays: z.number().int().positive(),
		reasonCategory: ResignationReasonCategoryEnum,
		reasonDetails: z.string().min(10, "Reason must be at least 10 characters"),
		additionalComments: z.string().optional(),
		createdBy: z
			.string()

			.optional(),
	})
	.refine(
		(data) => {
			const today = new Date();
			const lwdDate = new Date(data.lastWorkingDay);
			const diffInDays = Math.ceil(
				(lwdDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
			);
			return diffInDays >= data.noticePeriodDays;
		},
		{
			message: "Last working day must be at least the required notice period days from today",
			path: ["lastWorkingDay"],
		},
	);

export type CreateResignation = z.infer<typeof CreateResignationSchema>;

// Submit Resignation (from DRAFT to RESIGNATION_REQUESTED)
export const SubmitResignationSchema = z.object({
	id: z.string(),
});

// Manager Actions
export const ManagerApproveResignationSchema = z.object({
	id: z.string(),
	managerComments: z.string().optional(),
	managerId: z.string(),
});

export const ManagerRejectResignationSchema = z.object({
	id: z.string(),
	managerComments: z.string().min(10, "Rejection reason is required (min 10 characters)"),
	managerId: z.string(),
});

export const ManagerRequestDiscussionSchema = z.object({
	id: z.string(),
	managerComments: z.string().min(10, "Discussion reason is required (min 10 characters)"),
	managerId: z.string(),
});

// HR Actions
export const HRApproveResignationSchema = z.object({
	id: z.string(),
	hrComments: z.string().optional(),
	hrId: z.string(),
	adjustedLastWorkingDay: z.coerce.date().optional(), // HR can adjust if needed
});

export const HRRejectResignationSchema = z.object({
	id: z.string(),
	hrComments: z.string().min(10, "Rejection reason is required (min 10 characters)"),
	hrId: z.string(),
});

// Withdrawal
export const WithdrawResignationSchema = z.object({
	id: z.string(),
	withdrawnReason: z.string().min(10, "Withdrawal reason is required (min 10 characters)"),
	withdrawnBy: z.string(),
});

// Final Clearance
export const ApproveFinalClearanceSchema = z.object({
	id: z.string(),
	finalClearanceBy: z.string(),
	comments: z.string().optional(),
});

// Update Resignation (for basic info updates)
export const UpdateResignationSchema = z
	.object({
		lastWorkingDay: z.coerce.date().optional(),
		reasonCategory: ResignationReasonCategoryEnum.optional(),
		reasonDetails: z.string().min(10).optional(),
		additionalComments: z.string().optional(),
	})
	.partial();

export type UpdateResignation = z.infer<typeof UpdateResignationSchema>;

// ============================================================================
// ATTACHMENT SCHEMAS
// ============================================================================

export const ResignationAttachmentSchema = z.object({
	id: z.string(),
	resignationId: z.string(),
	fileName: z.string(),
	fileUrl: z.string().url(),
	fileSize: z.number().int().positive(),
	mimeType: z.string(),
	uploadedAt: z.coerce.date(),
	uploadedBy: z.string(),
});

export type ResignationAttachment = z.infer<typeof ResignationAttachmentSchema>;

export const CreateAttachmentSchema = z.object({
	resignationId: z.string(),
	fileName: z.string(),
	fileUrl: z.string().url(),
	fileSize: z.number().int().positive(),
	mimeType: z.string(),
	uploadedBy: z.string(),
});

export type CreateAttachment = z.infer<typeof CreateAttachmentSchema>;

// ============================================================================
// AUDIT LOG SCHEMAS
// ============================================================================

export const ResignationAuditLogSchema = z.object({
	id: z.string(),
	resignationId: z.string(),
	action: ActionTypeEnum,
	performedBy: z.string(),
	performedByName: z.string(),
	fromStatus: ResignationStatusEnum.nullable(),
	toStatus: ResignationStatusEnum.nullable(),
	comments: z.string().nullable(),
	metadata: z.any().nullable(),
	timestamp: z.coerce.date(),
});

export type ResignationAuditLog = z.infer<typeof ResignationAuditLogSchema>;

export const CreateAuditLogSchema = z.object({
	resignationId: z.string(),
	action: ActionTypeEnum,
	performedBy: z.string(),
	performedByName: z.string(),
	fromStatus: ResignationStatusEnum.optional(),
	toStatus: ResignationStatusEnum.optional(),
	comments: z.string().optional(),
	metadata: z.any().optional(),
});
