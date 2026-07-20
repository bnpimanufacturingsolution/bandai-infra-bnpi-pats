import { Prisma, PrismaClient } from "../generated/prisma";
import type { Server as SocketIOServer } from "socket.io";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;
const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
const getJsonString = (value: unknown, key: string): string => {
	const raw = asRecord(value)[key];
	return typeof raw === "string" ? raw : "";
};
const HR_WORKFLOW_ROLES = ["hris-hr-manager", "hris-hr-user", "hris-admin"] as const;
const HR_TICKET_REQUEST_TYPES = new Set([
	"DOCUMENT_REQUEST",
	"OTHER",
	"RESIGNATION",
	"TERMINATION",
	"TRANSFER",
	"REGULARIZATION",
	"PROMOTION",
	"SALARY_CHANGE",
	"SCHEDULE_CHANGE",
]);
const PAN_REQUEST_TYPES = new Set([
	"REGULARIZATION",
	"PROMOTION",
	"SALARY_CHANGE",
	"TRANSFER",
	"TERMINATION",
]);

type NotificationRouteRole =
	| "hris-hr-manager"
	| "hris-hr-user"
	| "hris-employee-manager"
	| "hris-employee"
	| "hris-timekeeper"
	| string
	| null
	| undefined;

type NotificationType = "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "ALERT" | "REMINDER";
type NotificationCategory =
	| "BOARDING"
	| "REQUEST"
	| "APPROVAL"
	| "SYSTEM"
	| "ANNOUNCEMENT"
	| "REMINDER"
	| "ALERT";

type NotificationRouteKey =
	| "REQUEST_APPROVAL_VIEW"
	| "REQUEST_SELF_VIEW"
	| "TIMESHEET_APPROVAL_VIEW"
	| "TIMESHEET_SELF_VIEW"
	| "DOCUMENT_REVIEW_PENDING"
	| "PAYROLL_SELF_VIEW"
	| "PAYSLIP_SELF_VIEW"
	| "PAYMENT_ISSUE_SELF_VIEW";

type PublishNotificationInput = {
	prisma: PrismaExecutor;
	io?: SocketIOServer | null;
	organizationId: string;
	sourceEmployeeId?: string | null;
	recipientEmployeeIds: string[];
	category: NotificationCategory;
	type: NotificationType;
	title: string;
	description: string;
	eventKey: string;
	metadata?: Record<string, unknown>;
};

const toEmployeeRoom = (employeeId: string) => `employee:${employeeId}`;

const uniqueEmployeeIds = (employeeIds: Array<string | null | undefined>): string[] =>
	Array.from(new Set(employeeIds.filter((employeeId): employeeId is string => Boolean(employeeId))));

const mergeRecipients = (
	existing: { read?: Array<{ employeeId: string; readAt?: Date | string | null }>; unread?: Array<{ employeeId: string; readAt?: Date | string | null }> } | null | undefined,
	recipientEmployeeIds: string[],
) => {
	const read = existing?.read ?? [];
	const unread = existing?.unread ?? [];
	const readIds = new Set(read.map((recipient) => recipient.employeeId));
	const unreadIds = new Set(unread.map((recipient) => recipient.employeeId));

	const newUnreadRecipients = recipientEmployeeIds
		.filter((employeeId) => !readIds.has(employeeId) && !unreadIds.has(employeeId))
		.map((employeeId) => ({
			employeeId,
			readAt: null,
		}));

	return {
		recipients: {
			read,
			unread: [...unread, ...newUnreadRecipients],
		},
		newRecipientEmployeeIds: newUnreadRecipients.map((recipient) => recipient.employeeId),
	};
};

export const buildRequestTargetUrl = (
	role: NotificationRouteRole,
	requestId: string,
	requestType?: string | null,
): string => {
	const normalizedType = String(requestType || "").toUpperCase();
	const isHrApproverRole =
		role === "hris-hr-manager" || role === "hris-hr-user" || role === "hris-admin";
	if (isHrApproverRole && HR_TICKET_REQUEST_TYPES.has(normalizedType)) {
		return `/hr/requests/tickets?action=view&id=${requestId}`;
	}

	const approvalBase =
		isHrApproverRole
			? "/hr/approvals/requests"
			: "/employee/approvals/requests";

	const requestRouteByType: Record<string, string> = {
		LEAVE: "/employee/requests/leave",
		TIME_ADJUSTMENT: "/employee/requests",
		OVERTIME: "/employee/requests",
		PAYROLL_CORRECTION: "/employee/requests",
		OTHER: "/employee/requests",
		EXPENSE_REIMBURSEMENT: "/employee/requests/expense-reimbursement",
		DOCUMENT_REQUEST: "/employee/requests/documents",
		REGULARIZATION: "/employee/requests/pan",
		PROMOTION: "/employee/requests/pan",
		SALARY_CHANGE: "/employee/requests/pan",
		TRANSFER: "/employee/requests/pan",
		TERMINATION: "/employee/requests/pan",
	};

	if (
		role === "hris-hr-manager" ||
		role === "hris-hr-user" ||
		role === "hris-admin" ||
		role === "hris-employee-manager"
	) {
		return `${approvalBase}?action=view&id=${requestId}`;
	}

	const requesterBase = requestRouteByType[normalizedType] || "/employee/notifications";
	return `${requesterBase}?action=view&id=${requestId}`;
};

export const buildTimesheetTargetUrl = (
	role: NotificationRouteRole,
	requestId?: string | null,
	mode: "approval" | "self" = "approval",
): string => {
	if (mode === "self") {
		return "/employee/attendance?action=view-timesheet";
	}

	if (!requestId) {
		return role === "hris-hr-manager" || role === "hris-hr-user"
			? "/hr/approvals/timesheet"
			: "/employee/approvals/timesheet";
	}

	const base =
		role === "hris-hr-manager" || role === "hris-hr-user"
			? "/hr/approvals/timesheet"
			: "/employee/approvals/timesheet";
	return `${base}?action=timesheet.review&id=${requestId}`;
};

export const publishNotification = async ({
	prisma,
	io,
	organizationId,
	sourceEmployeeId,
	recipientEmployeeIds,
	category,
	type,
	title,
	description,
	eventKey,
	metadata,
}: PublishNotificationInput) => {
	const recipients = uniqueEmployeeIds(recipientEmployeeIds);
	if (recipients.length === 0) return null;

	const existing = await prisma.notification.findFirst({
		where: {
			organizationId,
			eventKey,
		},
	});

	let notification;
	let recipientsToEmit = recipients;

	if (existing) {
		const { recipients: mergedRecipients, newRecipientEmployeeIds } = mergeRecipients(
			(existing.recipients as any) || null,
			recipients,
		);
		recipientsToEmit = newRecipientEmployeeIds;
		notification = await prisma.notification.update({
			where: { id: existing.id },
			data: {
				sourceEmployeeId: sourceEmployeeId ?? existing.sourceEmployeeId ?? null,
				category,
				type,
				title,
				description,
				eventKey,
				metadata: (metadata ?? existing.metadata ?? null) as Prisma.InputJsonValue | undefined,
				recipients: mergedRecipients as any,
				...(existing.archive == null
					? {
							archive: {
								isArchived: false,
								archivedAt: null,
								archivedBy: null,
								reason: null,
							},
						}
					: {}),
			},
		});
	} else {
		notification = await prisma.notification.create({
			data: {
				organizationId,
				sourceEmployeeId: sourceEmployeeId ?? null,
				category,
				type,
				title,
				description,
				eventKey,
				metadata: (metadata ?? null) as Prisma.InputJsonValue | undefined,
				archive: {
					isArchived: false,
					archivedAt: null,
					archivedBy: null,
					reason: null,
				},
				recipients: {
					read: [],
					unread: recipients.map((employeeId) => ({
						employeeId,
						readAt: null,
					})),
				} as any,
			},
		});
	}

	if (io && recipientsToEmit.length > 0) {
		recipientsToEmit.forEach((employeeId) => {
			io.to(toEmployeeRoom(employeeId)).emit("notification:new", notification);
		});
	}

	return notification;
};

const getHrRecipientEmployeeIds = async (
	prisma: PrismaExecutor,
	organizationId: string,
): Promise<string[]> => {
	const hrEmployees = await prisma.employee.findMany({
		where: {
			organizationId,
			isDeleted: false,
			role: { in: [...HR_WORKFLOW_ROLES] },
		},
		select: { id: true },
	});
	return hrEmployees.map((employee) => employee.id);
};

const getDocumentTypeLabel = (documentType: string): string => {
	const normalized = String(documentType || "").trim().toUpperCase();
	if (normalized === "CERTIFICATE_OF_EMPLOYMENT" || normalized === "COE") {
		return "Certificate of Employment";
	}
	if (normalized === "BIR_FORM_2316" || normalized === "BIR_2316") {
		return "BIR Form 2316";
	}
	return "Document";
};

export const publishDocumentRequestSubmittedNotification = async (
	prisma: PrismaExecutor,
	io: SocketIOServer | null | undefined,
	requestId: string,
	sourceEmployeeId?: string | null,
) => {
	const request = await prisma.request.findUnique({
		where: { id: requestId },
		select: {
			id: true,
			organizationId: true,
			requesterId: true,
			metadata: true,
		},
	});

	if (!request?.requesterId) return null;

	const metadata = asRecord(request.metadata);
	const rawDocType = String(metadata.documentType || metadata.docType || metadata.type || "");
	const docTypeLabel = getDocumentTypeLabel(rawDocType);

	return publishNotification({
		prisma,
		io,
		organizationId: request.organizationId,
		sourceEmployeeId: sourceEmployeeId ?? null,
		recipientEmployeeIds: [request.requesterId],
		category: "REQUEST",
		type: "INFO",
		title: "Document request submitted",
		description: `Your request for ${docTypeLabel} has been submitted successfully.`,
		eventKey: `request:${request.id}:status:SUBMITTED`,
		metadata: {
			entityType: "REQUEST",
			entityId: request.id,
			requestType: "DOCUMENT_REQUEST",
			routeKey: "REQUEST_SELF_VIEW" as NotificationRouteKey,
			action: "view",
			status: "SUBMITTED",
			targetUrl: `/employee/requests/documents?action=view&id=${request.id}`,
		},
	});
};

export const publishDocumentRequestApprovalNeededNotification = async (
	prisma: PrismaExecutor,
	io: SocketIOServer | null | undefined,
	requestId: string,
	sourceEmployeeId?: string | null,
) => {
	const request = await prisma.request.findUnique({
		where: { id: requestId },
		select: {
			id: true,
			organizationId: true,
			metadata: true,
			requester: {
				select: {
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			},
			currentStepExecution: {
				select: {
					id: true,
					stepName: true,
					assigneeType: true,
					assigneeId: true,
					assignee: {
						select: {
							role: true,
						},
					},
				},
			},
		},
	});

	if (!request?.currentStepExecution) return null;

	const isHrStep = request.currentStepExecution.assigneeType === "HR";
	const recipientEmployeeIds = isHrStep
		? await getHrRecipientEmployeeIds(prisma, request.organizationId)
		: uniqueEmployeeIds([request.currentStepExecution.assigneeId]);

	if (recipientEmployeeIds.length === 0) {
		console.warn(
			`[publishDocumentRequestApprovalNeededNotification] No recipients for request ${request.id}`,
		);
		return null;
	}

	const requesterName = `${getJsonString((request as any).requester?.person?.personalInfo, "firstName")} ${getJsonString((request as any).requester?.person?.personalInfo, "lastName")}`.trim();
	const metadata = asRecord(request.metadata);
	const rawDocType = String(metadata.documentType || metadata.docType || metadata.type || "");
	const docTypeLabel = getDocumentTypeLabel(rawDocType);

	const title = isHrStep ? "Document generation pending" : "Document approval needed";
	const description = isHrStep
		? `A request for ${docTypeLabel} by ${requesterName || "an employee"} is ready for generation.`
		: `${requesterName || "An employee"} requested ${docTypeLabel} which requires your approval.`;

	const targetUrl = isHrStep
		? `/hr/requests/tickets?action=view&id=${request.id}`
		: `/employee/approvals/requests?action=view&id=${request.id}`;

	return publishNotification({
		prisma,
		io,
		organizationId: request.organizationId,
		sourceEmployeeId: sourceEmployeeId ?? null,
		recipientEmployeeIds,
		category: "APPROVAL",
		type: "INFO",
		title,
		description,
		eventKey: `request:${request.id}:step:${request.currentStepExecution.id}:assigned`,
		metadata: {
			entityType: "REQUEST",
			entityId: request.id,
			requestType: "DOCUMENT_REQUEST",
			routeKey: "REQUEST_APPROVAL_VIEW" as NotificationRouteKey,
			action: "review",
			status: "PENDING",
			targetUrl,
		},
	});
};

export const publishDocumentRequestCompletedNotification = async (
	prisma: PrismaExecutor,
	io: SocketIOServer | null | undefined,
	requestId: string,
	sourceEmployeeId?: string | null,
) => {
	const request = await prisma.request.findUnique({
		where: { id: requestId },
		select: {
			id: true,
			organizationId: true,
			requesterId: true,
			metadata: true,
		},
	});

	if (!request?.requesterId) return null;

	const metadata = asRecord(request.metadata);
	const rawDocType = String(metadata.documentType || metadata.docType || metadata.type || "");
	const docTypeLabel = getDocumentTypeLabel(rawDocType);

	return publishNotification({
		prisma,
		io,
		organizationId: request.organizationId,
		sourceEmployeeId: sourceEmployeeId ?? null,
		recipientEmployeeIds: [request.requesterId],
		category: "REQUEST",
		type: "SUCCESS",
		title: "Document completed",
		description: `Your request for ${docTypeLabel} has been completed and is ready for download.`,
		eventKey: `request:${request.id}:status:COMPLETED`,
		metadata: {
			entityType: "REQUEST",
			entityId: request.id,
			requestType: "DOCUMENT_REQUEST",
			routeKey: "REQUEST_SELF_VIEW" as NotificationRouteKey,
			action: "view",
			status: "COMPLETED",
			targetUrl: `/employee/requests/documents?action=view&id=${request.id}`,
		},
	});
};

export const publishRequestCreatedNotification = async (
	prisma: PrismaExecutor,
	io: SocketIOServer | null | undefined,
	requestId: string,
	sourceEmployeeId?: string | null,
) => {
	const request = await prisma.request.findUnique({
		where: { id: requestId },
		select: {
			id: true,
			code: true,
			type: true,
			organizationId: true,
			metadata: true,
			requester: {
				select: {
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			},
			currentStepExecution: {
				select: {
					id: true,
					stepName: true,
					assigneeType: true,
					assigneeId: true,
					assignee: {
						select: {
							role: true,
						},
					},
				},
			},
		},
	});

	if (!request?.currentStepExecution) return null;

	const isHrStep = request.currentStepExecution.assigneeType === "HR";
	const recipientEmployeeIds = isHrStep
		? await getHrRecipientEmployeeIds(prisma, request.organizationId)
		: uniqueEmployeeIds([request.currentStepExecution.assigneeId]);

	if (recipientEmployeeIds.length === 0) {
		console.warn(
			`[publishRequestCreatedNotification] No recipients for request ${request.id} at step ${request.currentStepExecution.stepName} (assigneeType=${request.currentStepExecution.assigneeType})`,
		);
		return null;
	}

	const requesterName = `${getJsonString((request as any).requester?.person?.personalInfo, "firstName")} ${getJsonString((request as any).requester?.person?.personalInfo, "lastName")}`.trim();
	const requestLabel = request.code || request.id;
	const targetUrl =
		String((request.metadata as Record<string, unknown> | null)?.timesheetAction || "").toUpperCase() ===
		"SUBMISSION"
			? buildTimesheetTargetUrl(
					request.currentStepExecution.assignee?.role,
					request.id,
					"approval",
				)
			: buildRequestTargetUrl(
					isHrStep ? "hris-hr-user" : request.currentStepExecution.assignee?.role,
					request.id,
					request.type,
				);

	console.log(
		`[publishRequestCreatedNotification] request=${request.id} step=${request.currentStepExecution.stepName} assigneeType=${request.currentStepExecution.assigneeType} recipients=${recipientEmployeeIds.length}`,
	);

	return publishNotification({
		prisma,
		io,
		organizationId: request.organizationId,
		sourceEmployeeId: sourceEmployeeId ?? null,
		recipientEmployeeIds,
		category: "REQUEST",
		type: "INFO",
		title: "Approval required",
		description: requesterName
			? `${requesterName} submitted ${(request.type as string).replace(/_/g, " ").toLowerCase()} request ${requestLabel}.`
			: `A ${(request.type as string).replace(/_/g, " ").toLowerCase()} request requires your review.`,
		eventKey: `request:${request.id}:step:${request.currentStepExecution.id}:assigned`,
		metadata: {
			entityType: "REQUEST",
			entityId: request.id,
			requestType: request.type,
			routeKey:
				String((request.metadata as Record<string, unknown> | null)?.timesheetAction || "").toUpperCase() ===
				"SUBMISSION"
					? ("TIMESHEET_APPROVAL_VIEW" as NotificationRouteKey)
					: ("REQUEST_APPROVAL_VIEW" as NotificationRouteKey),
			action: "review",
			status: "PENDING",
			targetUrl,
			timesheetAction: (request.metadata as Record<string, unknown> | null)?.timesheetAction || null,
			timesheetId: (request.metadata as Record<string, unknown> | null)?.timesheetId || null,
		},
	});
};

export const publishDocumentReviewSubmittedNotification = async (
	prisma: PrismaExecutor,
	io: SocketIOServer | null | undefined,
	params: {
		organizationId: string;
		documentId: string;
		employeeId: string;
		documentName?: string | null;
		documentTypeCode?: string | null;
		sourceEmployeeId?: string | null;
	},
) => {
	const hrEmployees = await prisma.employee.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			role: { in: [...HR_WORKFLOW_ROLES] },
		},
		select: {
			id: true,
		},
	});
	const recipientEmployeeIds = hrEmployees.map((employee) => employee.id);
	if (recipientEmployeeIds.length === 0) return null;

	const targetUrl = `/hr/employee-documents?tab=pending-approval&action=review&id=${params.employeeId}&docId=${params.documentId}${
		params.documentTypeCode
			? `&docType=${encodeURIComponent(params.documentTypeCode)}`
			: ""
	}`;
	const documentName = String(params.documentName || "Employee document").trim();

	return publishNotification({
		prisma,
		io,
		organizationId: params.organizationId,
		sourceEmployeeId: params.sourceEmployeeId ?? null,
		recipientEmployeeIds,
		category: "APPROVAL",
		type: "INFO",
		title: "Document needs HR approval",
		description: `${documentName} was submitted for HR review.`,
		eventKey: `document:${params.documentId}:review:PENDING`,
		metadata: {
			entityType: "DOCUMENT_REVIEW",
			entityId: params.documentId,
			employeeId: params.employeeId,
			documentId: params.documentId,
			documentTypeCode: params.documentTypeCode || null,
			routeKey: "DOCUMENT_REVIEW_PENDING" as NotificationRouteKey,
			action: "review",
			status: "PENDING",
			targetUrl,
		},
	});
};

export const publishRequestDecisionNotification = async (
	prisma: PrismaExecutor,
	io: SocketIOServer | null | undefined,
	params: {
		requestId: string;
		status: string;
		sourceEmployeeId?: string | null;
		comment?: string | null;
	},
) => {
	const request = await prisma.request.findUnique({
		where: { id: params.requestId },
		select: {
			id: true,
			code: true,
			type: true,
			organizationId: true,
			metadata: true,
			requesterId: true,
			targetEmployeeId: true,
			requester: {
				select: {
					role: true,
				},
			},
			targetEmployee: {
				select: {
					role: true,
				},
			},
		},
	});

	if (!request?.requesterId) return null;

	const normalizedStatus = params.status.toUpperCase();
	const targetUrl =
		String((request.metadata as Record<string, unknown> | null)?.timesheetAction || "").toUpperCase() ===
			"SUBMISSION" ||
		String((request.metadata as Record<string, unknown> | null)?.timesheetAction || "").toUpperCase() ===
			"EDIT_PERMISSION"
			? buildTimesheetTargetUrl(request.requester?.role, String((request.metadata as Record<string, unknown> | null)?.timesheetId || ""), "self")
			: buildRequestTargetUrl(request.requester?.role, request.id, request.type);

	const type: NotificationType =
		normalizedStatus === "APPROVED" || normalizedStatus === "COMPLETED"
			? "SUCCESS"
			: normalizedStatus === "REJECTED" || normalizedStatus === "CANCELLED"
				? "WARNING"
				: "INFO";

	const requesterNotification = await publishNotification({
		prisma,
		io,
		organizationId: request.organizationId,
		sourceEmployeeId: params.sourceEmployeeId ?? null,
		recipientEmployeeIds: [request.requesterId],
		category: "APPROVAL",
		type,
		title: `Request ${normalizedStatus.toLowerCase()}`,
		description:
			params.comment && normalizedStatus === "REJECTED"
				? `Your ${(request.type as string).replace(/_/g, " ").toLowerCase()} request ${request.code || request.id} was rejected.`
				: `Your ${(request.type as string).replace(/_/g, " ").toLowerCase()} request ${request.code || request.id} is now ${normalizedStatus.toLowerCase()}.`,
		eventKey: `request:${request.id}:status:${normalizedStatus}`,
		metadata: {
			entityType: "REQUEST",
			entityId: request.id,
			requestType: request.type,
			routeKey:
				String((request.metadata as Record<string, unknown> | null)?.timesheetAction || "").toUpperCase() ===
					"SUBMISSION" ||
				String((request.metadata as Record<string, unknown> | null)?.timesheetAction || "").toUpperCase() ===
					"EDIT_PERMISSION"
					? ("TIMESHEET_SELF_VIEW" as NotificationRouteKey)
					: ("REQUEST_SELF_VIEW" as NotificationRouteKey),
			action: "view",
			status: normalizedStatus,
			targetUrl,
			comment: params.comment ?? null,
			timesheetAction: (request.metadata as Record<string, unknown> | null)?.timesheetAction || null,
			timesheetId: (request.metadata as Record<string, unknown> | null)?.timesheetId || null,
		},
	});

	const shouldNotifyTargetEmployee =
		normalizedStatus === "COMPLETED" &&
		PAN_REQUEST_TYPES.has(String(request.type || "").trim().toUpperCase()) &&
		Boolean(request.targetEmployeeId) &&
		request.targetEmployeeId !== request.requesterId;

	if (shouldNotifyTargetEmployee && request.targetEmployeeId) {
		const targetUrl = buildRequestTargetUrl(
			request.targetEmployee?.role || "hris-employee",
			request.id,
			request.type,
		);
		const requestTypeLabel = (request.type as string).replace(/_/g, " ").toLowerCase();
		await publishNotification({
			prisma,
			io,
			organizationId: request.organizationId,
			sourceEmployeeId: params.sourceEmployeeId ?? null,
			recipientEmployeeIds: [request.targetEmployeeId],
			category: "REQUEST",
			type: "SUCCESS",
			title: `${requestTypeLabel.replace(/\b\w/g, (char) => char.toUpperCase())} completed`,
			description: `${requestTypeLabel.replace(/\b\w/g, (char) => char.toUpperCase())} ${request.code || request.id} completed.`,
			eventKey: `request:${request.id}:target-status:${normalizedStatus}`,
			metadata: {
				entityType: "REQUEST",
				entityId: request.id,
				requestType: request.type,
				routeKey: "REQUEST_SELF_VIEW" as NotificationRouteKey,
				action: "view",
				status: normalizedStatus,
				targetUrl,
			},
		});
	}

	return requesterNotification;
};

export const publishRequestCancelledNotification = async (
	prisma: PrismaExecutor,
	io: SocketIOServer | null | undefined,
	params: {
		requestId: string;
		sourceEmployeeId?: string | null;
		reason?: string | null;
	},
) => {
	const request = await prisma.request.findUnique({
		where: { id: params.requestId },
		select: {
			id: true,
			code: true,
			type: true,
			organizationId: true,
			currentStepExecution: {
				select: {
					id: true,
					assigneeId: true,
					assignee: {
						select: {
							role: true,
						},
					},
				},
			},
		},
	});

	if (!request?.currentStepExecution?.assigneeId) return null;

	return publishNotification({
		prisma,
		io,
		organizationId: request.organizationId,
		sourceEmployeeId: params.sourceEmployeeId ?? null,
		recipientEmployeeIds: [request.currentStepExecution.assigneeId],
		category: "REQUEST",
		type: "WARNING",
		title: "Request cancelled",
		description: `Request ${request.code || request.id} was cancelled by the requester.`,
		eventKey: `request:${request.id}:status:CANCELLED`,
		metadata: {
			entityType: "REQUEST",
			entityId: request.id,
			requestType: request.type,
			routeKey: "REQUEST_APPROVAL_VIEW" as NotificationRouteKey,
			action: "view",
			status: "CANCELLED",
			targetUrl: buildRequestTargetUrl(
				request.currentStepExecution.assignee?.role,
				request.id,
				request.type,
			),
			reason: params.reason ?? null,
		},
	});
};

export const publishTimesheetDecisionFallbackNotification = async (
	prisma: PrismaExecutor,
	io: SocketIOServer | null | undefined,
	params: {
		timesheetId: string;
		status: "APPROVED" | "REJECTED" | "REVISED";
		sourceEmployeeId?: string | null;
		comment?: string | null;
	},
) => {
	const timesheet = await prisma.timesheet.findUnique({
		where: { id: params.timesheetId },
		select: {
			id: true,
			code: true,
			organizationId: true,
			employeeId: true,
			employee: {
				select: {
					role: true,
				},
			},
		},
	});

	if (!timesheet?.employeeId) return null;

	return publishNotification({
		prisma,
		io,
		organizationId: timesheet.organizationId,
		sourceEmployeeId: params.sourceEmployeeId ?? null,
		recipientEmployeeIds: [timesheet.employeeId],
		category: "APPROVAL",
		type: params.status === "APPROVED" ? "SUCCESS" : "WARNING",
		title: `Timesheet ${params.status.toLowerCase()}`,
		description: `Your timesheet ${timesheet.code || timesheet.id} was ${params.status.toLowerCase()}.`,
		eventKey: `timesheet:${timesheet.id}:status:${params.status}`,
		metadata: {
			entityType: "TIMESHEET",
			entityId: timesheet.id,
			routeKey: "TIMESHEET_SELF_VIEW" as NotificationRouteKey,
			status: params.status,
			action: "view",
			targetUrl: buildTimesheetTargetUrl(timesheet.employee?.role, timesheet.id, "self"),
			comment: params.comment ?? null,
		},
	});
};

export const publishTimesheetReminderNotification = async (
	prisma: PrismaExecutor,
	io: SocketIOServer | null | undefined,
	params: {
		timesheetId: string;
		kind?: "employee_submit" | "employee_correct" | "manager_approval" | null;
		sourceEmployeeId?: string | null;
	},
) => {
	const timesheet = await prisma.timesheet.findUnique({
		where: { id: params.timesheetId },
		select: {
			id: true,
			code: true,
			status: true,
			organizationId: true,
			employeeId: true,
			payrollPeriod: {
				select: {
					name: true,
					code: true,
					startDate: true,
					endDate: true,
				},
			},
			employee: {
				select: {
					id: true,
					employeeId: true,
					role: true,
					reportToId: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
					reportTo: {
						select: {
							id: true,
							role: true,
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					},
				},
			},
		},
	});

	if (!timesheet?.employeeId) return null;

	const status = String(timesheet.status || "").toUpperCase();
	const inferredKind =
		status === "SUBMITTED"
			? "manager_approval"
			: status === "DRAFT"
				? "employee_submit"
				: status === "REJECTED" || status === "REVISED"
					? "employee_correct"
					: null;
	const kind = params.kind || inferredKind;
	if (!kind) return null;

	const employeeName = [
		(timesheet.employee?.person?.personalInfo as Record<string, unknown> | null)?.firstName,
		(timesheet.employee?.person?.personalInfo as Record<string, unknown> | null)?.lastName,
	]
		.filter(Boolean)
		.join(" ")
		.trim();
	const label = employeeName || timesheet.employee?.employeeId || timesheet.code || "Employee";
	const periodLabel = timesheet.payrollPeriod?.name || timesheet.payrollPeriod?.code || "the current period";

	if (kind === "manager_approval") {
		const managerId = timesheet.employee?.reportToId || timesheet.employee?.reportTo?.id || null;
		if (!managerId) return null;

		return publishNotification({
			prisma,
			io,
			organizationId: timesheet.organizationId,
			sourceEmployeeId: params.sourceEmployeeId ?? null,
			recipientEmployeeIds: [managerId],
			category: "REMINDER",
			type: "REMINDER",
			title: "Timesheet awaiting approval",
			description: `${label}'s timesheet for ${periodLabel} is waiting for your review.`,
			eventKey: `timesheet:${timesheet.id}:reminder:manager_approval`,
			metadata: {
				entityType: "TIMESHEET",
				entityId: timesheet.id,
				routeKey: "TIMESHEET_APPROVAL_VIEW" as NotificationRouteKey,
				action: "review",
				status,
				targetUrl: buildTimesheetTargetUrl(
					timesheet.employee?.reportTo?.role || "hris-employee-manager",
					timesheet.id,
					"approval",
				),
				timesheetId: timesheet.id,
				timesheetCode: timesheet.code || null,
				reminderKind: kind,
				payrollPeriodCode: timesheet.payrollPeriod?.code || null,
			},
		});
	}

	const reminderTitle =
		kind === "employee_correct" ? "Timesheet needs correction" : "Submit your timesheet";
	const reminderDescription =
		kind === "employee_correct"
			? `Your timesheet for ${periodLabel} needs correction.`
			: `Your timesheet for ${periodLabel} needs to be submitted.`;

	return publishNotification({
		prisma,
		io,
		organizationId: timesheet.organizationId,
		sourceEmployeeId: params.sourceEmployeeId ?? null,
		recipientEmployeeIds: [timesheet.employeeId],
		category: "REMINDER",
		type: "REMINDER",
		title: reminderTitle,
		description: reminderDescription,
		eventKey: `timesheet:${timesheet.id}:reminder:${kind}`,
		metadata: {
			entityType: "TIMESHEET",
			entityId: timesheet.id,
			routeKey: "TIMESHEET_SELF_VIEW" as NotificationRouteKey,
			action: "view",
			status,
			targetUrl: buildTimesheetTargetUrl(timesheet.employee?.role, timesheet.id, "self"),
			timesheetId: timesheet.id,
			timesheetCode: timesheet.code || null,
			reminderKind: kind,
			payrollPeriodCode: timesheet.payrollPeriod?.code || null,
		},
	});
};

const getEmployeePayrollNotificationContext = async (
	prisma: PrismaExecutor,
	employeePayrollId: string,
) => {
	const lookupArgs = {
		where: { id: employeePayrollId },
		select: {
			id: true,
			organizationId: true,
			employeeId: true,
			payrollPeriodId: true,
			employee: {
				select: {
					id: true,
					employeeId: true,
					role: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			},
			payrollPeriod: {
				select: {
					id: true,
					name: true,
					payDate: true,
				},
			},
		},
	} as const;
	const employeePayroll =
		typeof (prisma.employeePayroll as any).findUnique === "function"
			? await (prisma.employeePayroll as any).findUnique(lookupArgs)
			: await (prisma.employeePayroll as any).findFirst(lookupArgs);

	if (!employeePayroll?.employeeId) return null;
	return employeePayroll;
};

export const publishPayrollPublishedNotification = async (
	prisma: PrismaExecutor,
	io: SocketIOServer | null | undefined,
	params: {
		employeePayrollId: string;
		sourceEmployeeId?: string | null;
	},
) => {
	const employeePayroll = await getEmployeePayrollNotificationContext(
		prisma,
		params.employeePayrollId,
	);
	if (!employeePayroll) return null;

	return publishNotification({
		prisma,
		io,
		organizationId: employeePayroll.organizationId,
		sourceEmployeeId: params.sourceEmployeeId ?? null,
		recipientEmployeeIds: [employeePayroll.employeeId],
		category: "ANNOUNCEMENT",
		type: "INFO",
		title: "Payroll published",
		description: `Your payroll for ${employeePayroll.payrollPeriod?.name || "the selected period"} is now available.`,
		eventKey: `employeePayroll:${employeePayroll.id}:published`,
		metadata: {
			entityType: "EMPLOYEE_PAYROLL",
			entityId: employeePayroll.id,
			employeeId: employeePayroll.employeeId,
			employeePayrollId: employeePayroll.id,
			payrollPeriodId: employeePayroll.payrollPeriodId,
			routeKey: "PAYROLL_SELF_VIEW" as NotificationRouteKey,
			action: "view",
			status: "PUBLISHED",
		},
	});
};

export const publishPayslipAvailableNotification = async (
	prisma: PrismaExecutor,
	io: SocketIOServer | null | undefined,
	params: {
		employeePayrollId: string;
		sourceEmployeeId?: string | null;
	},
) => {
	const employeePayroll = await getEmployeePayrollNotificationContext(
		prisma,
		params.employeePayrollId,
	);
	if (!employeePayroll) return null;

	return publishNotification({
		prisma,
		io,
		organizationId: employeePayroll.organizationId,
		sourceEmployeeId: params.sourceEmployeeId ?? null,
		recipientEmployeeIds: [employeePayroll.employeeId],
		category: "ANNOUNCEMENT",
		type: "SUCCESS",
		title: "Payslip available",
		description: `Your payslip for ${employeePayroll.payrollPeriod?.name || "the selected period"} is now available.`,
		eventKey: `employeePayroll:${employeePayroll.id}:payslip-released`,
		metadata: {
			entityType: "EMPLOYEE_PAYROLL",
			entityId: employeePayroll.id,
			employeeId: employeePayroll.employeeId,
			employeePayrollId: employeePayroll.id,
			payrollPeriodId: employeePayroll.payrollPeriodId,
			routeKey: "PAYSLIP_SELF_VIEW" as NotificationRouteKey,
			action: "view",
			status: "PAYSLIP_RELEASED",
		},
	});
};

export const publishPaymentIssueNotification = async (
	prisma: PrismaExecutor,
	io: SocketIOServer | null | undefined,
	params: {
		employeePayrollId: string;
		sourceEmployeeId?: string | null;
		note?: string | null;
	},
) => {
	const employeePayroll = await getEmployeePayrollNotificationContext(
		prisma,
		params.employeePayrollId,
	);
	if (!employeePayroll) return null;

	return publishNotification({
		prisma,
		io,
		organizationId: employeePayroll.organizationId,
		sourceEmployeeId: params.sourceEmployeeId ?? null,
		recipientEmployeeIds: [employeePayroll.employeeId],
		category: "ALERT",
		type: "WARNING",
		title: "Payment issue",
		description:
			params.note?.trim() ||
			`There is a payment issue affecting your payroll for ${employeePayroll.payrollPeriod?.name || "the selected period"}.`,
		eventKey: `employeePayroll:${employeePayroll.id}:payment-issue`,
		metadata: {
			entityType: "EMPLOYEE_PAYROLL",
			entityId: employeePayroll.id,
			employeeId: employeePayroll.employeeId,
			employeePayrollId: employeePayroll.id,
			payrollPeriodId: employeePayroll.payrollPeriodId,
			routeKey: "PAYMENT_ISSUE_SELF_VIEW" as NotificationRouteKey,
			action: "view",
			status: "PAYMENT_ISSUE",
			paymentIssueNote: params.note ?? null,
		},
	});
};
