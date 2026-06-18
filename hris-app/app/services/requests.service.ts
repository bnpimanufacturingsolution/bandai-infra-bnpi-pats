import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export type RequestType =
	| "EXPENSE_REIMBURSEMENT"
	| "DOCUMENT_REQUEST"
	| "ATTENDANCE_CORRECTION"
	| "TIME_ADJUSTMENT"
	| "TIMESHEET"
	| "OTHER"
	| "LEAVE"
	| "RESIGNATION"
	| "TERMINATION"
	| "REGULARIZATION"
	| "PROMOTION"
	| "SALARY_CHANGE"
	| "TRANSFER"
	| "OVERTIME"
	| "SCHEDULE_CHANGE";
export type RequestWorkflowStateKey = string;
export type RequestStatus = RequestWorkflowStateKey;

export type WorkflowStepType = "SUBMISSION" | "APPROVAL" | "TASK";
export type WorkflowAssigneeType =
	| "REQUESTER"
	| "SUPERVISOR"
	| "TARGET_DEPARTMENT_MANAGER"
	| "HR"
	| "SYSTEM";
export type WorkflowStepStatus =
	| "PENDING"
	| "IN_PROGRESS"
	| "APPROVED"
	| "REJECTED"
	| "COMPLETED"
	| "SKIPPED";

export type RequestTransactionEventCategory =
	| "LIFECYCLE"
	| "WORKFLOW"
	| "ASSIGNMENT"
	| "BUSINESS_CHANGE"
	| "ARTIFACT"
	| "SYSTEM";
export type RequestTransactionEventKey =
	| "REQUEST_CREATED"
	| "REQUEST_UPDATED"
	| "REQUEST_CANCELLED"
	| "WORKFLOW_STATE_CHANGED"
	| "STEP_ASSIGNED"
	| "STEP_APPROVED"
	| "STEP_REJECTED"
	| "STEP_COMPLETED"
	| "STEP_SKIPPED"
	| "STEP_DELEGATED"
	| "DOCUMENT_GENERATED";
export type RequestTransactionActorType =
	| "EMPLOYEE"
	| "MANAGER"
	| "HR"
	| "SYSTEM"
	| "UNKNOWN";

export interface RequestTransactionFieldChange {
	field: string;
	label: string;
	before: unknown;
	after: unknown;
}

export interface RequestTransaction {
	id: string;
	requestId: string;
	workflowInstanceId?: string | null;
	stepExecutionId?: string | null;
	actorEmployeeId?: string | null;
	sequenceNumber: number;
	eventCategory: RequestTransactionEventCategory;
	eventKey: RequestTransactionEventKey;
	eventSource?: string | null;
	actorType: RequestTransactionActorType;
	actorRole?: string | null;
	actorDisplayName?: string | null;
	title: string;
	description?: string | null;
	comments?: string | null;
	fromStateKey?: string | null;
	toStateKey?: string | null;
	fieldChanges?: RequestTransactionFieldChange[] | null;
	metadata?: Record<string, any> | null;
	visibility?: "SHARED" | "INTERNAL";
	isSystemGenerated: boolean;
	occurredAt: string;
	createdAt: string;
	updatedAt: string;
	actorEmployee?: {
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

export interface RequestStepExecution {
	id: string;
	requestId: string;
	stepNumber: number;
	stepName: string;
	stepType: WorkflowStepType;
	assigneeType: WorkflowAssigneeType;
	assigneeRole?: string | null;
	assigneeId?: string | null;
	status: WorkflowStepStatus;
	completedAt?: string | null;
	comments?: string | null;
	metadata?: Record<string, any>;
	isRequired: boolean;
	createdAt: string;
	updatedAt: string;
	assignee?: {
		id: string;
		employeeId: string;
		person?: {
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
		};
		department?: {
			id: string;
			name: string;
			code: string;
		};
	};
}

export interface Request {
	id: string;
	organizationId: string;
	code?: string | null; // Human-readable request code (e.g., REQ-00001)
	requesterId: string; // Employee who made the request
	type: RequestType;
	currentWorkflowStateKey?: RequestWorkflowStateKey | null;
	startDate?: string;
	endDate?: string;
	description: string;
	attachments: string[];
	notes?: string;
	isDeleted: boolean;
	createdAt: string;
	updatedAt: string;
	// For expense reimbursements
	amount?: number;
	// Metadata for type-specific fields (JSON field from Prisma)
	metadata?: Record<string, any>;
	// Current workflow step (who needs to act now)
	currentStepExecution?: {
		id: string;
		stepNumber: number;
		stepName: string;
		stepType: WorkflowStepType;
		assigneeType: WorkflowAssigneeType;
		assigneeId?: string | null;
		status: WorkflowStepStatus;
		assignee?: {
			id: string;
			employeeId: string;
			person?: {
				personalInfo?: {
					firstName?: string;
					lastName?: string;
				};
			};
		};
	};
	// Last completed step (who acted most recently)
	lastCompletedStepExecution?: {
		id: string;
		stepNumber: number;
		stepName: string;
		stepType?: WorkflowStepType;
		assigneeType?: WorkflowAssigneeType;
		completedAt?: string | null;
		assignee?: {
			id: string;
			employeeId: string;
			person?: {
				personalInfo?: {
					firstName?: string;
					lastName?: string;
				};
			};
		};
	};
	// Requester data (when included in response)
	requester?: {
		id: string;
		employeeId: string;
		reportTo?: {
			id?: string;
		};
		person?: {
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
		};
		department?: {
			id: string;
			name?: string;
			code?: string;
		};
		position?: {
			id?: string;
			title?: string;
			code?: string;
		};
	};
	targetEmployee?: {
		id: string;
		employeeId?: string;
		employmentStatus?: string | null;
		employmentType?: string | null;
		probationEndDate?: string | null;
		metadata?: Record<string, any>;
		person?: {
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
		};
		reportTo?: {
			id?: string;
			employeeId?: string;
			person?: {
				personalInfo?: {
					firstName?: string;
					lastName?: string;
				};
			};
		};
		department?: {
			id?: string;
			name?: string;
			code?: string;
		};
		position?: {
			id?: string;
			title?: string;
			code?: string;
		};
	};
	// Step executions data (when included in response)
	stepExecutions?: RequestStepExecution[];
	transactions?: RequestTransaction[];
}

export interface RequestsResponse {
	requests: Request[];
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
	};
	count?: number;
}

export interface RequestQueueBucket {
	requests: Request[];
	count: number;
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
	};
}

export interface HRTicketQueuesResponse {
	ticketQueues: {
		approval: RequestQueueBucket;
		task: RequestQueueBucket;
		recent: RequestQueueBucket;
	};
	ticketSummary?: {
		pending: number;
		total: number;
		approval: number;
		task: number;
		recent: number;
		categoryBreakdown: {
			document: number;
			personnelAction: number;
			jobRequisition: number;
			scheduleChange: number;
		};
	};
	queueLimit: number;
}

export const getRequestState = (
	request?: Pick<Request, "currentWorkflowStateKey"> | null,
): RequestStatus => (request?.currentWorkflowStateKey as RequestStatus) || "OPEN";

export interface CreateRequestData {
	organizationId: string;
	requesterId: string; // Employee who is making the request
	targetEmployeeId?: string; // Employee who is the subject of the request (if different from requester)
	// Note: Reviewers are automatically assigned based on requester role (department-based)
	// No need to pass reviewerIds - backend handles this automatically
	type: RequestType;
	description: string;
	startDate?: string;
	endDate?: string;
	amount?: number;
	attachments?: string[];
	notes?: string;
	metadata?: Record<string, any>;
}

export interface UpdateRequestData {
	description?: string;
	startDate?: string;
	endDate?: string;
	amount?: number;
	attachments?: string[];
	notes?: string;
	// Note: Reviewers are department-based and managed by the backend workflow
	// Cannot be updated directly through this interface
}

const toRequestError = (error: any, fallbackMessage: string) => {
	const apiErrors = error?.data?.errors || error?.errors;
	const message =
		apiErrors?.[0]?.message ||
		error?.data?.message ||
		error?.message ||
		fallbackMessage;
	const requestError = new Error(message) as Error & {
		status?: number;
		statusText?: string;
		errors?: Array<{ field: string; message: string }>;
		data?: any;
	};

	requestError.status = error?.status;
	requestError.statusText = error?.statusText;
	requestError.errors = apiErrors;
	requestError.data = error?.data || error;
	return requestError;
};

class RequestsService extends APIService {
	/**
	 * Get all requests with optional filters
	 */
	async getRequests(document: boolean = false, count: boolean = true): Promise<RequestsResponse> {
		try {

			const queryString = this.getQueryString();
			const endpoint = `/api/request${queryString}`;

			const response = await hrisApiClient.get<RequestsResponse>(endpoint);

			// Handle nested data structure if API returns { data: { ... } }
			let requestsData = response.data;
			if (requestsData && typeof requestsData === "object" && "data" in requestsData) {
				requestsData = (requestsData as any).data;
			}

			if (!requestsData) {
				throw new Error("Failed to fetch requests");
			}
			return requestsData as RequestsResponse;
		} catch (error: any) {
			console.error("Error fetching requests:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching requests",
			);
		}
	}

	/**
	 * Get a single request by ID with optional params
	 */
	async getRequestById(requestId: string, params?: ApiQueryParams): Promise<Request> {
		try {

			// Build query string if params provided
			if (params) {
				this.setParams(params);
			}
			const queryString = this.getQueryString();
			const endpoint = `/api/request/${requestId}${queryString}`;

			const response = await hrisApiClient.get<Request>(endpoint);

			// Handle nested data structure
			let requestData = response.data;
			if (requestData && typeof requestData === "object" && "data" in requestData) {
				requestData = (requestData as any).data;
			}

			if (!requestData) {
				throw new Error("Request not found");
			}
			return requestData as Request;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching request",
			);
		}
	}

	/**
	 * Create a new request
	 */
	async createRequest(data: CreateRequestData): Promise<Request> {
		try {
			const response = await hrisApiClient.post<Request>("/api/request", data);

			// Handle nested data structure if API returns { data: { ... } }
			let requestData = response.data;
			if (requestData && typeof requestData === "object" && "data" in requestData) {
				requestData = (requestData as any).data;
			}

			if (!requestData) {
				throw new Error("Failed to create request");
			}
			return requestData as Request;
		} catch (error: any) {
			throw toRequestError(error, "Error creating request");
		}
	}

	/**
	 * Update an existing request
	 */
	async updateRequest(requestId: string, data: UpdateRequestData): Promise<Request> {
		try {
			const response = await hrisApiClient.patch<Request>(`/api/request/${requestId}`, data);
			if (!response.data) {
				throw new Error("Failed to update request");
			}
			return response.data;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating request",
			);
		}
	}

	/**
	 * Approve or reject a request (uses the /approval endpoint which handles leave balance deduction)
	 */
	async approveRequest(
		requestId: string,
		action: "approve" | "reject",
		comment?: string,
	): Promise<Request> {
		try {
			const response = await hrisApiClient.post<Request>(
				`/api/request/${requestId}/approval`,
				{
					action,
					comment,
				},
			);

			// Handle nested data structure if API returns { data: { request: { ... } } }
			let requestData = response.data;
			if (requestData && typeof requestData === "object" && "data" in requestData) {
				requestData = (requestData as any).data;
				// Further unwrap if needed
				if (requestData && typeof requestData === "object" && "request" in requestData) {
					requestData = (requestData as any).request;
				}
			}

			if (!requestData) {
				throw new Error("Failed to process approval");
			}
			return requestData as Request;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error processing approval",
			);
		}
	}

	/**
	 * Cancel a request
	 */
	async cancelRequest(requestId: string, reason?: string): Promise<Request> {
		try {
			const response = await hrisApiClient.patch<Request>(
				`/api/request/${requestId}/cancel`,
				{
					rejectionReason: reason,
				},
			);
			let requestData: any = response.data;
			if (requestData && typeof requestData === "object" && "data" in requestData) {
				requestData = (requestData as any).data;
				if (requestData && typeof requestData === "object" && "request" in requestData) {
					requestData = (requestData as any).request;
				}
			}

			if (!requestData) {
				throw new Error("Failed to cancel request");
			}
			return requestData as Request;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error cancelling request",
			);
		}
	}

	/**
	 * Delete a request
	 */
	async deleteRequest(requestId: string): Promise<void> {
		try {
			await hrisApiClient.delete(`/api/request/${requestId}`);
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error deleting request",
			);
		}
	}
	/**
	 * Generate a document for a request
	 */
	async generateDocument(
		requestId: string,
		type: string = "COE",
		year?: number,
	): Promise<{ documentNumber: string }> {
		try {
			const response = await hrisApiClient.post<{ documentNumber: string }>(
				`/api/request/${requestId}/generate-document`,
				{ type, documentType: type, year },
			);

			// Handle nested data structure if API returns { data: { ... } }
			let responseData: any = response.data;
			if (responseData && typeof responseData === "object" && "data" in responseData) {
				responseData = responseData.data;
			}

			if (!responseData) {
				throw new Error("Failed to generate document");
			}
			return responseData as { documentNumber: string };
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error generating document",
			);
		}
	}

	/**
	 * Delegate the current approval step to the employee's supervisor.
	 * Delegation mode is tracked in backend step metadata.
	 */
	async delegateStepToSupervisor(
		requestId: string,
		mode: "TEMPORARY" | "REASSIGN" = "REASSIGN",
		reason?: string,
	): Promise<{
		requestId: string;
		delegatedTo: string;
		delegatedToName: string;
		mode: "TEMPORARY" | "REASSIGN";
	}> {
		try {
			const response = await hrisApiClient.post<{
				requestId: string;
				delegatedTo: string;
				delegatedToName: string;
				mode: "TEMPORARY" | "REASSIGN";
			}>(`/api/request/${requestId}/delegate-step`, { mode, reason });

			let responseData: any = response.data;
			if (responseData && typeof responseData === "object" && "data" in responseData) {
				responseData = responseData.data;
			}

			if (!responseData) {
				throw new Error("Failed to delegate step");
			}
			return responseData;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error delegating step",
			);
		}
	}

	async escalateToSupervisor(
		requestId: string,
	): Promise<{ requestId: string; delegatedTo: string; delegatedToName: string }> {
		return this.delegateStepToSupervisor(requestId, "REASSIGN");
	}

	/**
	 * Start offboarding process for an approved resignation request
	 * Creates an OFFBOARDING BoardingProcess with checklist items from the template based on employee role
	 */
	async startOffboarding(requestId: string): Promise<{ request: Request; boardingProcess: any }> {
		try {
			const response = await hrisApiClient.post<{ request: Request; boardingProcess: any }>(
				`/api/request/${requestId}/start-offboarding`,
				{},
			);

			// Handle nested data structure if API returns { data: { ... } }
			let responseData: any = response.data;
			if (responseData && typeof responseData === "object" && "data" in responseData) {
				responseData = responseData.data;
			}

			if (!responseData) {
				throw new Error("Failed to start offboarding");
			}
			return responseData as { request: Request; boardingProcess: any };
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error starting offboarding",
			);
		}
	}
}

// Export singleton instance
const requestsService = new RequestsService();
export default requestsService;
