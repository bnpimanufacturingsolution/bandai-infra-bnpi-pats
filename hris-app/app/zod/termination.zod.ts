import { z } from "zod";

// ============================================================================
// ENUMS
// ============================================================================

export const TerminationTypeEnum = z.enum([
	"PERFORMANCE",
	"MISCONDUCT",
	"REDUNDANCY",
	"END_OF_CONTRACT",
	"FAILED_PROBATION",
]);

export type TerminationType = z.infer<typeof TerminationTypeEnum>;

export const TerminationStatusEnum = z.enum([
	"DRAFT",
	"PENDING_HR_DIRECTOR",
	"PENDING_LEGAL",
	"APPROVED",
	"REJECTED",
	"PROCESSING",
	"COMPLETED",
]);

export type TerminationStatus = z.infer<typeof TerminationStatusEnum>;

export const TerminationActionTypeEnum = z.enum([
	"CREATED",
	"SUBMITTED",
	"HR_DIRECTOR_APPROVED",
	"HR_DIRECTOR_REJECTED",
	"LEGAL_APPROVED",
	"LEGAL_REJECTED",
	"PROCESSING_STARTED",
	"COMPLETED",
	"COMMENT_ADDED",
	"DOCUMENT_ADDED",
]);

export type TerminationActionType = z.infer<typeof TerminationActionTypeEnum>;

// ============================================================================
// TERMINATION SCHEMAS
// ============================================================================

export const TerminationSchema = z.object({
	id: z.string(),
	terminationNumber: z.string(),
	organizationId: z.string(),

	// Employee being terminated
	employeeId: z.string(),

	// Who initiated the termination
	initiatedById: z.string(),

	// Termination details
	terminationType: TerminationTypeEnum,
	status: TerminationStatusEnum,
	terminationDate: z.coerce.date(),
	lastWorkingDay: z.coerce.date(),
	reason: z.string().min(10, "Reason must be at least 10 characters"),
	severancePackage: z.string().optional().nullable(),

	// Supporting documents
	supportingDocuments: z.array(z.any()).default([]),

	// HR Director approval
	hrDirectorApprovedAt: z.coerce.date().optional().nullable(),
	hrDirectorId: z.string().optional().nullable(),
	hrDirectorComments: z.string().optional().nullable(),

	// Legal review
	legalApprovalRequired: z.boolean().default(false),
	legalApprovedAt: z.coerce.date().optional().nullable(),
	legalApproverId: z.string().optional().nullable(),
	legalComments: z.string().optional().nullable(),

	// Processing tracking
	processingStartedAt: z.coerce.date().optional().nullable(),
	processingCompletedAt: z.coerce.date().optional().nullable(),

	// Final payroll and clearance
	finalPayCalculated: z.boolean().default(false),
	clearanceCompleted: z.boolean().default(false),
	terminationLetterPath: z.string().optional().nullable(),

	// Metadata
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Termination = z.infer<typeof TerminationSchema>;

// ============================================================================
// CREATE TERMINATION SCHEMA
// ============================================================================

export const CreateTerminationSchema = z.object({
	employeeId: z.string().min(1, "Employee is required"),
	initiatedById: z.string().min(1, "Initiator is required"),
	terminationType: TerminationTypeEnum,
	terminationDate: z.coerce.date(),
	lastWorkingDay: z.coerce.date(),
	reason: z.string().min(10, "Reason must be at least 10 characters"),
	severancePackage: z.string().optional(),
	supportingDocuments: z.array(z.any()).default([]),
	legalApprovalRequired: z.boolean().default(false),
});

export type CreateTermination = z.infer<typeof CreateTerminationSchema>;

// ============================================================================
// UPDATE TERMINATION SCHEMA
// ============================================================================

export const UpdateTerminationSchema = z
	.object({
		terminationType: TerminationTypeEnum.optional(),
		terminationDate: z.coerce.date().optional(),
		lastWorkingDay: z.coerce.date().optional(),
		reason: z.string().min(10).optional(),
		severancePackage: z.string().optional(),
		supportingDocuments: z.array(z.any()).optional(),
		legalApprovalRequired: z.boolean().optional(),
	})
	.partial();

export type UpdateTermination = z.infer<typeof UpdateTerminationSchema>;

// ============================================================================
// APPROVAL SCHEMAS
// ============================================================================

export const HRDirectorApprovalSchema = z.object({
	approverId: z.string().min(1, "Approver is required"),
	action: z.enum(["approve", "reject"]),
	comments: z.string().optional(),
});

export type HRDirectorApproval = z.infer<typeof HRDirectorApprovalSchema>;

export const LegalApprovalSchema = z.object({
	approverId: z.string().min(1, "Approver is required"),
	action: z.enum(["approve", "reject"]),
	comments: z.string().optional(),
});

export type LegalApproval = z.infer<typeof LegalApprovalSchema>;

// ============================================================================
// PROCESSING SCHEMAS
// ============================================================================

export const CompleteTerminationSchema = z.object({
	finalPayCalculated: z.boolean().default(true),
	clearanceCompleted: z.boolean().default(true),
	terminationLetterPath: z.string().optional(),
});

export type CompleteTermination = z.infer<typeof CompleteTerminationSchema>;

// ============================================================================
// AUDIT LOG SCHEMA
// ============================================================================

export const TerminationAuditLogSchema = z.object({
	id: z.string(),
	terminationId: z.string(),
	action: TerminationActionTypeEnum,
	performedBy: z.string(),
	performedByName: z.string(),
	fromStatus: TerminationStatusEnum.nullable(),
	toStatus: TerminationStatusEnum.nullable(),
	comments: z.string().nullable(),
	metadata: z.any().nullable(),
	timestamp: z.coerce.date(),
});

export type TerminationAuditLog = z.infer<typeof TerminationAuditLogSchema>;

// ============================================================================
// WITH RELATIONS TYPE
// ============================================================================

export interface TerminationWithRelations extends Termination {
	employee?: {
		id: string;
		employeeId: string;
		employmentType?: string;
		employmentStatus?: string;
		department?: { id: string; name: string };
		position?: { id: string; title: string };
		person?: {
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
			contactInfo?: {
				email?: string;
			};
		};
	};
	initiatedBy?: {
		id: string;
		employeeId: string;
		person?: {
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
		};
	};
	hrDirectorApprovedBy?: {
		id: string;
		employeeId: string;
		person?: {
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
		};
	};
	legalApprovedBy?: {
		id: string;
		employeeId: string;
		person?: {
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
		};
	};
	auditLogs?: TerminationAuditLog[];
}

// ============================================================================
// HELPERS
// ============================================================================

export const TERMINATION_TYPE_LABELS: Record<TerminationType, string> = {
	PERFORMANCE: "Performance Issues",
	MISCONDUCT: "Misconduct",
	REDUNDANCY: "Redundancy",
	END_OF_CONTRACT: "End of Contract",
	FAILED_PROBATION: "Failed Probation",
};

export const TERMINATION_STATUS_LABELS: Record<TerminationStatus, string> = {
	DRAFT: "Draft",
	PENDING_HR_DIRECTOR: "Pending HR Director",
	PENDING_LEGAL: "Pending Legal Review",
	APPROVED: "Approved",
	REJECTED: "Rejected",
	PROCESSING: "Processing",
	COMPLETED: "Completed",
};
