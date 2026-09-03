// Request types aligned with Prisma schema
export type RequestType =
	| "EXPENSE_REIMBURSEMENT"
	| "DOCUMENT_REQUEST"
	| "TIME_ADJUSTMENT"
	| "OTHER"
	| "TERMINATION"
	| "REGULARIZATION"
	| "PROMOTION"
	| "SALARY_CHANGE"
	| "TRANSFER"
	| "LEAVE"
	| "OVERTIME";

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface RequestReviewer {
	id: string;
	requestId: string;
	departmentId: string;
	status?: RequestStatus;
	reviewedAt?: string;
	notes?: string;
	reviewedById?: string | null;
	department?: {
		id: string;
		name: string;
		code: string;
	};
	reviewedBy?: {
		id: string;
		employeeId: string;
		person?: {
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
		};
	};
}

export interface Request {
	id: string;
	organizationId: string;
	code?: string | null; // Human-readable request code (e.g., REQ-00001)
	requesterId: string; // Employee who made the request
	type: RequestType;
	status: RequestStatus;
	startDate?: string;
	endDate?: string;
	description: string; // Changed from 'reason' to 'description' to match Prisma schema
	attachments: string[];
	notes?: string;
	isDeleted: boolean;
	createdAt: string;
	updatedAt: string;
	// For expense reimbursements
	amount?: number;
	// Metadata for type-specific fields (JSON field from Prisma)
	metadata?: Record<string, any>;
	// Requester data (when included in response)
	requester?: {
		id: string;
		employeeId: string;
		person?: {
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
		};
	};
	// Department reviewers data (when included in response)
	departmentReviewers?: RequestReviewer[];
}

export interface CreateRequestData {
	requesterId: string; // Employee who is making the request
	// Note: Reviewers are automatically assigned based on requester role (department-based)
	// No need to pass reviewerIds - backend handles this automatically
	type: RequestType;
	description: string; // Changed from 'reason' to 'description'
	startDate?: string;
	endDate?: string;
	amount?: number;
	attachments?: string[];
	notes?: string;
}

export interface UpdateRequestData {
	description?: string; // Changed from 'reason' to 'description'
	startDate?: string;
	endDate?: string;
	amount?: number;
	attachments?: string[];
	notes?: string;
	status?: RequestStatus;
	// Note: Reviewers are department-based and managed by the backend workflow
	// Cannot be updated directly through this interface
}
