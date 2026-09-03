import { PrismaClient, WorkflowAssigneeType } from "../generated/prisma";
import { AuthRequest } from "../middleware/verifyToken";
import { calculateAttendanceMetricsDetailed } from "./attendance-metrics-detailed.helper";
import { getBusinessDayBounds } from "./attendance.helper";
import { isSystemGeneratedDocumentChecklistItem } from "./boarding-documents.helper";
import {
	getEmployeeDocumentPriorityData,
	resolveDocumentTypeRequirementMeta,
	type EmployeeDocumentPriorityCategorySummary,
	type EmployeeDocumentPriorityItem,
} from "./employee-document-priority.helper";

export type ActionNeededPriority = "high" | "medium" | "low";
export type ActionNeededKind =
	| "ATTENDANCE_CLOCK_IN"
	| "TIMESHEET_REMINDER"
	| "APPROVAL_REQUEST"
	| "NOTIFICATION_UNREAD"
	| "ONBOARDING_DOCUMENT";

export interface ActionMetricDashboardItem {
	id: string;
	kind: ActionNeededKind;
	title: string;
	description: string;
	priority: ActionNeededPriority;
	statusLabel: string;
	createdAt: string;
	dueDate: string | null;
	targetPath: string;
	metadata: Record<string, any>;
}

export interface ActionMetricsSummary {
	total: number;
	high: number;
	medium: number;
	low: number;
}

export interface ActionMetricsResponse {
	total: number;
	summary: ActionMetricsSummary;
	counts: {
		dashboard: number;
		tickets: {
			total: number;
		};
		requests: {
			total: number;
		};
		approvals: {
			total: number;
			requests: number;
			timesheet: number;
		};
		documents: {
			total: number;
			missing: number;
			rejected: number;
			expired: number;
			needsUpdate: number;
			pendingApproval: number;
			hrPendingApproval: number;
			optional: number;
		};
		timesheets: {
			total: number;
		};
		notifications: {
			total: number;
		};
	};
	items: {
		dashboard: ActionMetricDashboardItem[];
		documents: EmployeeDocumentPriorityItem[];
		onboardingDocuments: EmployeeDocumentPriorityItem[];
	};
	categories: {
		documents: EmployeeDocumentPriorityCategorySummary[];
	};
	analytics?: {
		hrQueue?: {
			teamQueue: number;
		};
	};
}

export interface DashboardActionNeededResponse {
	summary: ActionMetricsSummary;
	items: Array<
		Omit<ActionMetricDashboardItem, "kind"> & {
			kind:
				| "ATTENDANCE_CLOCK_IN"
				| "TIMESHEET_REMINDER"
				| "PAN_APPROVAL"
				| "NOTIFICATION_UNREAD"
				| "ONBOARDING_DOCUMENT";
		}
	>;
}

const ACTIONABLE_REQUEST_STATES = ["OPEN", "SUBMITTED", "APPROVED", "IN_PROCESS", "FOR_APPROVAL"];
const HR_ROLES = new Set(["hris-hr-manager", "hris-hr-user", "hris-admin"]);
const PAN_TYPES = new Set([
	"REGULARIZATION",
	"PROMOTION",
	"SALARY_CHANGE",
	"TRANSFER",
	"TERMINATION",
]);
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

const getNotificationsPathByRole = (role?: string) =>
	HR_ROLES.has(String(role || "")) ? "/hr/notifications" : "/employee/notifications";

const getRequestPathByRole = (role?: string, requestId?: string, requestType?: string | null) => {
	const normalizedType = String(requestType || "").trim().toUpperCase();
	const isHrRole = HR_ROLES.has(String(role || ""));
	const basePath = isHrRole
		? HR_TICKET_REQUEST_TYPES.has(normalizedType)
			? "/hr/requests/tickets"
			: "/hr/approvals/requests"
		: "/employee/approvals/requests";

	if (!requestId) return basePath;
	return `${basePath}?action=view&id=${requestId}`;
};

const getTimesheetApprovalPathByRole = (role?: string, requestId?: string | null) => {
	const basePath = HR_ROLES.has(String(role || ""))
		? "/hr/approvals/requests"
		: "/employee/approvals/requests";

	if (!requestId) return basePath;
	return `${basePath}?action=timesheet.review&id=${requestId}`;
};

const getNotificationPriority = (type?: string): ActionNeededPriority => {
	const normalized = String(type || "").trim().toUpperCase();
	if (normalized === "ERROR" || normalized === "ALERT") return "high";
	if (normalized === "WARNING" || normalized === "REMINDER") return "medium";
	return "low";
};

const getDocumentActionPriority = (priorityState?: string | null): ActionNeededPriority => {
	const normalized = String(priorityState || "").trim().toLowerCase();
	if (normalized === "missing_required" || normalized === "rejected") return "high";
	if (normalized === "pending_approval") return "high";
	if (normalized === "expired" || normalized === "needs_update") return "medium";
	return "low";
};

const getChecklistPriority = (priority?: string | null): ActionNeededPriority => {
	const normalized = String(priority || "").trim().toUpperCase();
	if (normalized === "CRITICAL" || normalized === "HIGH") return "high";
	if (normalized === "MEDIUM") return "medium";
	return "low";
};

const normalizeDocumentIdentity = (value: unknown) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");

const getDocumentIdentityKey = (documentTypeId?: string | null, documentCode?: string | null) => {
	const normalizedTypeId = String(documentTypeId || "").trim();
	if (normalizedTypeId) return `id:${normalizedTypeId}`;

	const normalizedCode = normalizeDocumentIdentity(documentCode);
	return normalizedCode ? `code:${normalizedCode}` : "";
};

const toIsoStringOrNull = (value?: Date | string | null) => {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getMetadataRecord = (value: unknown) =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const getSummary = (items: ActionMetricDashboardItem[]): ActionMetricsSummary => ({
	total: items.length,
	high: items.filter((item) => item.priority === "high").length,
	medium: items.filter((item) => item.priority === "medium").length,
	low: items.filter((item) => item.priority === "low").length,
});

const getPriorityOrder = (priority: ActionNeededPriority) => {
	if (priority === "high") return 0;
	if (priority === "medium") return 1;
	return 2;
};

const getActionItemSortTime = (item: ActionMetricDashboardItem) => {
	const createdAtTime = new Date(item.createdAt).getTime();
	return Number.isNaN(createdAtTime) ? 0 : createdAtTime;
};

const compareActionItems = (left: ActionMetricDashboardItem, right: ActionMetricDashboardItem) => {
	const createdAtDelta = getActionItemSortTime(right) - getActionItemSortTime(left);
	if (createdAtDelta !== 0) return createdAtDelta;

	const dueDateDelta =
		new Date(left.dueDate || "").getTime() - new Date(right.dueDate || "").getTime();
	if (!Number.isNaN(dueDateDelta) && dueDateDelta !== 0) return dueDateDelta;

	const priorityDelta = getPriorityOrder(left.priority) - getPriorityOrder(right.priority);
	if (priorityDelta !== 0) return priorityDelta;

	return String(left.id).localeCompare(String(right.id));
};

const buildDocumentActionTitle = (params: {
	priorityState?: string | null;
	displayName?: string | null;
	actionLabel?: string | null;
}) => {
	const normalizedState = String(params.priorityState || "").trim().toLowerCase();
	if (normalizedState === "optional") return "Optional document recommended";
	if (normalizedState === "rejected") return "Rejected document needs attention";
	if (normalizedState === "expired") return "Expired document needs renewal";
	if (normalizedState === "pending_approval") return "Document waiting for HR approval";

	const safeName = String(params.displayName || "required document").trim() || "required document";
	const actionLabel = String(params.actionLabel || "").trim().toLowerCase();
	if (actionLabel === "update") return `Update ${safeName}`;
	return `Complete ${safeName}`;
};

const buildDocumentActionDescription = (params: {
	priorityState?: string | null;
	displayName?: string | null;
	actionDescription?: string | null;
}) => {
	const safeName = String(params.displayName || "This document").trim() || "This document";
	const normalizedState = String(params.priorityState || "").trim().toLowerCase();
	if (normalizedState === "optional") return `${safeName}: Add this when applicable.`;
	if (normalizedState === "rejected") return `${safeName}: Re-upload or correct this document.`;
	if (normalizedState === "expired") return `${safeName}: Renew or replace the expired document.`;
	if (normalizedState === "pending_approval") {
		return `${safeName}: Submitted successfully and waiting for HR approval.`;
	}

	const actionDescription = String(params.actionDescription || "").trim();
	if (actionDescription) {
		return `${safeName}: ${actionDescription}.`;
	}

	return `${safeName} needs your action.`;
};

const buildDocumentTargetPath = (params: {
	employeeId: string;
	priorityState?: string | null;
	documentCode?: string | null;
	documentNumber?: string | null;
}) => {
	const documentNumber = String(params.documentNumber || "").trim();
	if (
		documentNumber &&
		["needs_update", "optional", "rejected", "expired", "pending_approval"].includes(
			String(params.priorityState || "").trim().toLowerCase(),
		)
	) {
		return `/employee/${params.employeeId}?tab=documents&action=edit-doc&documentNumber=${encodeURIComponent(
			documentNumber,
		)}`;
	}

	const documentCode = String(params.documentCode || "").trim();
	return `/employee/${params.employeeId}?tab=documents&action=add-doc${
		documentCode ? `&documentType=${encodeURIComponent(documentCode)}` : ""
	}`;
};

const buildHrDocumentReviewTargetPath = (params: {
	employeeId: string;
	documentId: string;
	documentTypeCode?: string | null;
}) => {
	const query = new URLSearchParams({
		tab: "pending-approval",
		action: "review",
		id: params.employeeId,
		docId: params.documentId,
	});
	const documentTypeCode = String(params.documentTypeCode || "").trim();
	if (documentTypeCode) query.set("docType", documentTypeCode);
	return `/hr/employee-documents?${query.toString()}`;
};

const formatEmployeeName = (employee: any) => {
	const personalInfo = employee?.person?.personalInfo || {};
	const fullName = `${personalInfo.firstName || ""} ${personalInfo.lastName || ""}`.trim();
	return fullName || employee?.employeeId || "Employee";
};

const isTimesheetApprovalRequest = (request: { type?: string | null; metadata?: unknown }) => {
	const metadata = getMetadataRecord(request.metadata);
	if (String(metadata.timesheetAction || "").trim().toUpperCase() === "SUBMISSION") return true;
	return String(request.type || "").trim().toUpperCase() === "TIMESHEET";
};

const getRequestActionTitle = (request: { type?: string | null; metadata?: unknown }) => {
	if (isTimesheetApprovalRequest(request)) return "Approval required";
	if (PAN_TYPES.has(String(request.type || "").trim().toUpperCase())) {
		return `${request.type} request needs approval`;
	}
	return "Approval required";
};

const getRequestActionDescription = (request: {
	code?: string | null;
	type?: string | null;
	metadata?: unknown;
}) => {
	if (isTimesheetApprovalRequest(request)) {
		return request.code
			? `Timesheet request ${request.code} needs your review.`
			: "A timesheet request needs your review.";
	}

	if (PAN_TYPES.has(String(request.type || "").trim().toUpperCase())) {
		return request.code
			? `Personnel action ${request.code} is awaiting your action.`
			: "A personnel action request is awaiting your action.";
	}

	return request.code
		? `Request ${request.code} is awaiting your action.`
		: "A request is awaiting your action.";
};

async function getActionableRequests(params: {
	prisma: PrismaClient;
	organizationId: string;
	employeeId: string;
	role?: string;
}) {
	const { prisma, organizationId, employeeId, role } = params;
	const isHrRole = HR_ROLES.has(String(role || ""));

	return prisma.request.findMany({
		where: {
			organizationId,
			isDeleted: false,
			currentWorkflowStateKey: { in: ACTIONABLE_REQUEST_STATES },
			OR: [
				{
					currentStepExecution: {
						is: {
							assigneeId: employeeId,
							isDeleted: false,
						},
					},
				},
				...(isHrRole
					? [
							{
								currentStepExecution: {
									is: {
										assigneeType: WorkflowAssigneeType.HR,
										isDeleted: false,
									},
								},
							},
						]
					: []),
			],
		},
		select: {
			id: true,
			code: true,
			type: true,
			currentWorkflowStateKey: true,
			createdAt: true,
			endDate: true,
			metadata: true,
		},
		orderBy: { createdAt: "desc" },
		take: 50,
	});
}

async function getUnreadNotifications(params: {
	prisma: PrismaClient;
	organizationId: string;
	employeeId: string;
}) {
	const notifications = await params.prisma.notification.findMany({
		where: {
			organizationId: params.organizationId,
		},
		select: {
			id: true,
			title: true,
			description: true,
			type: true,
			createdAt: true,
			recipients: true,
			category: true,
			metadata: true,
		},
		orderBy: { createdAt: "desc" },
		take: 50,
	});

	return notifications.filter((notification) => {
		const recipients = notification.recipients as {
			unread?: Array<{ employeeId?: string }>;
		} | null;
		return (
			recipients?.unread?.some((recipient) => recipient.employeeId === params.employeeId) || false
		);
	});
}

async function getHrDocumentReviewDashboardItems(params: {
	prisma: PrismaClient;
	organizationId: string;
	role?: string;
}) {
	if (!HR_ROLES.has(String(params.role || ""))) return [];

	const pendingDocuments = await params.prisma.document.findMany({
		where: {
			isDeleted: false,
			reviewStatus: "PENDING",
			reviewSource: "EMPLOYEE_UPLOAD",
			employee: {
				is: {
					organizationId: params.organizationId,
					isDeleted: false,
				},
			},
		},
		select: {
			id: true,
			name: true,
			type: true,
			number: true,
			reviewSubmittedAt: true,
			createdAt: true,
			documentTypeId: true,
			employeeId: true,
			employee: {
				select: {
					id: true,
					employeeId: true,
					departmentId: true,
					positionId: true,
					employmentType: true,
					role: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			},
			documentType: {
				select: {
					id: true,
					code: true,
					name: true,
					category: true,
					isRequired: true,
					metadata: true,
				},
			},
		},
		orderBy: [{ reviewSubmittedAt: "desc" }, { createdAt: "desc" }],
		take: 50,
	});

	return pendingDocuments.map((document): ActionMetricDashboardItem => {
		const employee = document.employee;
		const employeeName = formatEmployeeName(employee);
		const documentType = document.documentType;
		const requirementMeta = documentType
			? resolveDocumentTypeRequirementMeta(documentType, {
					departmentId: employee?.departmentId,
					positionId: employee?.positionId,
					employmentType: employee?.employmentType,
					role: employee?.role,
				})
			: {
					isApplicable: true,
					isMandated: false,
					priorityLevel: "medium" as const,
					requiredForPayroll: false,
					requiredForOnboarding: false,
					requireFileForCompliance: false,
				};
		const documentName =
			documentType?.name || document.name || String(document.type || "Document");
		const documentCode = documentType?.code || document.type || null;
		const targetPath = buildHrDocumentReviewTargetPath({
			employeeId: document.employeeId,
			documentId: document.id,
			documentTypeCode: documentCode,
		});
		const priority: ActionNeededPriority =
			requirementMeta.requiredForPayroll || requirementMeta.isMandated ? "high" : "medium";

		return {
			id: `document-review-${document.id}`,
			kind: "ONBOARDING_DOCUMENT",
			title: "Review employee document",
			description: `${employeeName} submitted ${documentName} for HR approval.`,
			priority,
			statusLabel: "Pending HR approval",
			createdAt:
				toIsoStringOrNull(document.reviewSubmittedAt) ||
				toIsoStringOrNull(document.createdAt) ||
				new Date().toISOString(),
			dueDate: null,
			targetPath,
			metadata: {
				entityType: "DOCUMENT_REVIEW",
				routeKey: "DOCUMENT_REVIEW_PENDING",
				employeeId: document.employeeId,
				employeeCode: employee?.employeeId || null,
				documentId: document.id,
				documentTypeId: document.documentTypeId || documentType?.id || null,
				documentCode,
				documentNumber: document.number || null,
				documentName,
				priorityState: "pending_approval",
				isMandated: requirementMeta.isMandated,
				requiredForPayroll: requirementMeta.requiredForPayroll,
				requiredForOnboarding: requirementMeta.requiredForOnboarding,
				targetUrl: targetPath,
			},
		};
	});
}

async function getHrDocumentReviewCount(params: {
	prisma: PrismaClient;
	organizationId: string;
	role?: string;
}) {
	if (!HR_ROLES.has(String(params.role || ""))) return 0;

	return params.prisma.document.count({
		where: {
			isDeleted: false,
			reviewStatus: "PENDING",
			reviewSource: "EMPLOYEE_UPLOAD",
			employee: {
				is: {
					organizationId: params.organizationId,
					isDeleted: false,
				},
			},
		},
	});
}

async function getTimesheetReminderItem(params: {
	prisma: PrismaClient;
	organizationId: string;
	employeeId: string;
}) {
	const now = new Date();
	const periodCheckDate = new Date(now);
	periodCheckDate.setUTCHours(0, 0, 0, 0);

	const [employeeRecord, currentPayrollPeriod] = await Promise.all([
		params.prisma.employee.findUnique({
			where: { id: params.employeeId },
			select: {
				id: true,
				employmentHireDate: true,
				createdAt: true,
			},
		}),
		params.prisma.payrollPeriod.findFirst({
			where: {
				organizationId: params.organizationId,
				startDate: { lte: now },
				endDate: { gte: periodCheckDate },
				isDeleted: false,
			},
			select: {
				id: true,
				code: true,
				name: true,
				startDate: true,
				endDate: true,
			},
		}),
	]);

	if (!currentPayrollPeriod) return null;

	const existingTimesheet = await params.prisma.timesheet.findFirst({
		where: {
			organizationId: params.organizationId,
			employeeId: params.employeeId,
			payrollPeriodId: currentPayrollPeriod.id,
			isDeleted: false,
		},
		select: {
			id: true,
			status: true,
			updatedAt: true,
		},
	});

	const shouldAddReminder =
		!existingTimesheet || ["DRAFT", "REVISED", "REJECTED"].includes(existingTimesheet.status);
	if (!shouldAddReminder) return null;

	const createdAt =
		toIsoStringOrNull(existingTimesheet?.updatedAt) ||
		toIsoStringOrNull(currentPayrollPeriod.startDate) ||
		toIsoStringOrNull(currentPayrollPeriod.endDate) ||
		toIsoStringOrNull(employeeRecord?.employmentHireDate) ||
		toIsoStringOrNull(employeeRecord?.createdAt) ||
		now.toISOString();

	return {
		id: existingTimesheet?.id
			? `timesheet-reminder-${existingTimesheet.id}`
			: `timesheet-reminder-${params.employeeId}-${currentPayrollPeriod.id}`,
		kind: "TIMESHEET_REMINDER" as const,
		title: "Submit your timesheet",
		description: currentPayrollPeriod.name
			? `Timesheet for ${currentPayrollPeriod.name} needs action.`
			: "Your current payroll period timesheet needs action.",
		priority: "high" as const,
		statusLabel: existingTimesheet?.status || "PENDING_SUBMISSION",
		createdAt,
		dueDate: currentPayrollPeriod.endDate?.toISOString() || null,
		targetPath: "/employee/attendance?action=view-timesheet",
		metadata: {
			payrollPeriodId: currentPayrollPeriod.id,
			payrollPeriodCode: currentPayrollPeriod.code || null,
			timesheetStatus: existingTimesheet?.status || "NONE",
		},
	};
}

async function getAttendanceClockInActionItem(params: {
	prisma: PrismaClient;
	organizationId: string;
	employeeId: string;
}) {
	const { start, end } = getBusinessDayBounds(new Date());
	const todayAttendance = await calculateAttendanceMetricsDetailed(
		params.prisma,
		params.organizationId,
		start,
		end,
		1,
		1,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		params.employeeId,
		undefined,
	);

	const record = todayAttendance.records[0];
	if (!record) return null;
	if (record.status !== "NOT_CLOCKED_IN") return null;

	return {
		id: `attendance-clock-in-${params.employeeId}-${record.date}`,
		kind: "ATTENDANCE_CLOCK_IN" as const,
		title: "Clock in for today",
		description: "You have not clocked in yet for your scheduled workday.",
		priority: "high" as const,
		statusLabel: "NOT_CLOCKED_IN",
		createdAt: new Date().toISOString(),
		dueDate: end.toISOString(),
		targetPath: "/employee/attendance",
		metadata: {
			attendanceDate: record.date,
			attendanceStatus: record.status,
			employeeId: params.employeeId,
		},
	};
}

async function getDocumentDashboardItems(params: {
	prisma: PrismaClient;
	employeeId: string;
	organizationId: string;
}) {
	const [employeeRecord, onboardingChecklistItems, documentPriorityData] = await Promise.all([
		params.prisma.employee.findUnique({
			where: { id: params.employeeId },
			select: {
				id: true,
				employmentHireDate: true,
				createdAt: true,
			},
		}),
		params.prisma.checklistItem.findMany({
			where: {
				organizationId: params.organizationId,
				isDeleted: false,
				isOptional: false,
				status: { not: "COMPLETED" },
				process: {
					is: {
						organizationId: params.organizationId,
						employeeId: params.employeeId,
						type: "ONBOARDING",
						status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
						isDeleted: false,
					},
				},
			},
			select: {
				id: true,
				processId: true,
				priority: true,
				dueDate: true,
				createdAt: true,
				metadata: true,
			},
			orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
		}),
		getEmployeeDocumentPriorityData({
			prisma: params.prisma,
			employeeId: params.employeeId,
			organizationId: params.organizationId,
		}),
	]);

	const checklistItemsByIdentity = new Map<string, (typeof onboardingChecklistItems)[number]>();
	for (const checklistItem of onboardingChecklistItems) {
		const checklistMetadata = getMetadataRecord(checklistItem.metadata);
		if (!isSystemGeneratedDocumentChecklistItem(checklistMetadata)) continue;

		const uploadBy = String(checklistMetadata.uploadBy || "").trim().toUpperCase();
		if (uploadBy !== "EMPLOYEE" && uploadBy !== "BOTH") continue;

		const identityKey = getDocumentIdentityKey(
			String(checklistMetadata.documentTypeId || "").trim(),
			String(checklistMetadata.documentCode || checklistMetadata.documentType || "").trim(),
		);
		if (!identityKey || checklistItemsByIdentity.has(identityKey)) continue;
		checklistItemsByIdentity.set(identityKey, checklistItem);
	}

	const documentDashboardItems = new Map<string, ActionMetricDashboardItem>();
	for (const priorityItem of documentPriorityData.items.filter(
		(item) => item.isActionable || item.priorityState === "pending_approval",
	)) {
		const identityKey = getDocumentIdentityKey(priorityItem.documentTypeId, priorityItem.type);
		if (!identityKey || documentDashboardItems.has(identityKey)) continue;

		const checklistItem = checklistItemsByIdentity.get(identityKey);
		const createdAt =
			toIsoStringOrNull(checklistItem?.createdAt) ||
			toIsoStringOrNull(employeeRecord?.employmentHireDate) ||
			toIsoStringOrNull(employeeRecord?.createdAt) ||
			"1970-01-01T00:00:00.000Z";

		documentDashboardItems.set(identityKey, {
			id: checklistItem
				? `onboarding-document-${checklistItem.id}`
				: `onboarding-document-${priorityItem.documentTypeId || priorityItem.type || identityKey}`,
			kind: "ONBOARDING_DOCUMENT",
			title: buildDocumentActionTitle({
				priorityState: priorityItem.priorityState,
				displayName: priorityItem.displayName,
				actionLabel: priorityItem.actionLabel,
			}),
			description: buildDocumentActionDescription({
				priorityState: priorityItem.priorityState,
				displayName: priorityItem.displayName,
				actionDescription: priorityItem.actionDescription,
			}),
			priority: checklistItem?.priority
				? getChecklistPriority(checklistItem.priority)
				: getDocumentActionPriority(priorityItem.priorityState),
			statusLabel: priorityItem.actionLabel || "Open",
			createdAt,
			dueDate: checklistItem?.dueDate ? checklistItem.dueDate.toISOString() : null,
			targetPath: buildDocumentTargetPath({
				employeeId: params.employeeId,
				priorityState: priorityItem.priorityState,
				documentCode: priorityItem.type,
				documentNumber: priorityItem.number,
			}),
			metadata: {
				documentTypeId: priorityItem.documentTypeId || null,
				documentCode: priorityItem.type || null,
				priorityState: priorityItem.priorityState,
				isMandated: priorityItem.isMandated,
				actionLabel: priorityItem.actionLabel || null,
				actionDescription: priorityItem.actionDescription || null,
				category: priorityItem.category || null,
				checklistItemId: checklistItem?.id || null,
				processId: checklistItem?.processId || null,
			},
		});
	}

	return {
		documentPriorityData,
		dashboardItems: [...documentDashboardItems.values()],
	};
}

function buildDocumentCounts(items: EmployeeDocumentPriorityItem[]) {
	return {
		total: items.filter(
			(item) => item.isActionable || item.priorityState === "pending_approval",
		).length,
		missing: items.filter(
			(item) => item.isActionable && item.priorityState === "missing_required",
		).length,
		rejected: items.filter((item) => item.isActionable && item.priorityState === "rejected")
			.length,
		expired: items.filter((item) => item.isActionable && item.priorityState === "expired")
			.length,
		needsUpdate: items.filter(
			(item) => item.isActionable && item.priorityState === "needs_update",
		).length,
		pendingApproval: items.filter((item) => item.priorityState === "pending_approval")
			.length,
		optional: items.filter((item) => item.priorityState === "optional").length,
	};
}

async function getHrQueueAnalytics(params: { prisma: PrismaClient; organizationId: string }) {
	const { prisma, organizationId } = params;
	const employees = await prisma.employee.count({
		where: {
			organizationId,
			isDeleted: false,
			employmentStatus: {
				in: ["ACTIVE", "ONBOARDING"],
			},
		},
	});
	return {
		teamQueue: employees,
	};
}

export async function getUserActionMetrics(params: {
	prisma: PrismaClient;
	authReq: AuthRequest;
	targetEmployeeId?: string;
}): Promise<ActionMetricsResponse> {
	const { prisma, authReq } = params;
	const organizationId = authReq.organizationId;
	const authEmployeeId = authReq.metadata?.employee?.id;
	const role = authReq.role;

	if (!organizationId || !authEmployeeId) {
		throw new Error("Employee context is required for action metrics");
	}

	const documentEmployeeId = params.targetEmployeeId || authEmployeeId;

	const [
		attendanceClockInAction,
		timesheetReminder,
		actionableRequests,
		unreadNotifications,
		authDocumentData,
		targetDocumentData,
		hrDocumentReviewItems,
		hrDocumentReviewCount,
	] = await Promise.all([
		getAttendanceClockInActionItem({
			prisma,
			organizationId,
			employeeId: authEmployeeId,
		}),
		getTimesheetReminderItem({
			prisma,
			organizationId,
			employeeId: authEmployeeId,
		}),
		getActionableRequests({
			prisma,
			organizationId,
			employeeId: authEmployeeId,
			role,
		}),
		getUnreadNotifications({
			prisma,
			organizationId,
			employeeId: authEmployeeId,
		}),
		getDocumentDashboardItems({
			prisma,
			employeeId: authEmployeeId,
			organizationId,
		}),
		documentEmployeeId === authEmployeeId
			? Promise.resolve(null)
			: getEmployeeDocumentPriorityData({
					prisma,
					employeeId: documentEmployeeId,
					organizationId,
				}),
		getHrDocumentReviewDashboardItems({
			prisma,
			organizationId,
			role,
		}),
		getHrDocumentReviewCount({
			prisma,
			organizationId,
			role,
		}),
	]);

	const dashboardItems: ActionMetricDashboardItem[] = [];
	if (attendanceClockInAction) dashboardItems.push(attendanceClockInAction);
	if (timesheetReminder) dashboardItems.push(timesheetReminder);

	for (const request of actionableRequests) {
		const isTimesheet = isTimesheetApprovalRequest(request);
		const targetPath = isTimesheet
			? getTimesheetApprovalPathByRole(role, request.id)
			: getRequestPathByRole(role, request.id, request.type);

		dashboardItems.push({
			id: `${isTimesheet ? "timesheet" : "request"}-approval-${request.id}`,
			kind: "APPROVAL_REQUEST",
			title: getRequestActionTitle(request),
			description: getRequestActionDescription(request),
			priority: isTimesheet ? "high" : "medium",
			statusLabel: request.currentWorkflowStateKey || "OPEN",
			createdAt: request.createdAt.toISOString(),
			dueDate: request.endDate ? request.endDate.toISOString() : null,
			targetPath,
			metadata: {
				requestId: request.id,
				requestCode: request.code || null,
				requestType: request.type || null,
				approvalRoute: isTimesheet ? "timesheet" : "requests",
				timesheetAction: isTimesheet ? "SUBMISSION" : null,
			},
		});
	}

	for (const notification of unreadNotifications) {
		const notificationMetadata = getMetadataRecord(notification.metadata);
		if (String(notificationMetadata.routeKey || "").trim() === "DOCUMENT_REVIEW_PENDING") {
			continue;
		}
		const targetUrlFromMetadata =
			typeof notificationMetadata.targetUrl === "string"
				? String(notificationMetadata.targetUrl).trim()
				: "";

		dashboardItems.push({
			id: `notification-unread-${notification.id}`,
			kind: "NOTIFICATION_UNREAD",
			title: notification.title || "Unread notification",
			description: notification.description || "You have an unread notification.",
			priority: getNotificationPriority(notification.type),
			statusLabel: "UNREAD",
			createdAt: notification.createdAt.toISOString(),
			dueDate: null,
			targetPath: targetUrlFromMetadata || getNotificationsPathByRole(role),
			metadata: {
				notificationId: notification.id,
				notificationType: notification.type,
				category: notification.category || null,
				targetUrl: targetUrlFromMetadata || null,
				routeKey: notificationMetadata.routeKey || null,
				entityId: notificationMetadata.entityId || null,
				requestType: notificationMetadata.requestType || null,
				employeeId: notificationMetadata.employeeId || null,
				timesheetId: notificationMetadata.timesheetId || null,
			},
		});
	}

	dashboardItems.push(...authDocumentData.dashboardItems);
	dashboardItems.push(...hrDocumentReviewItems);
	dashboardItems.sort(compareActionItems);

	const summary = getSummary(dashboardItems);
	const documentItems = targetDocumentData?.items || authDocumentData.documentPriorityData.items;
	const documentCategories =
		targetDocumentData?.categories || authDocumentData.documentPriorityData.categories;
	const actionableDocumentItems = documentItems.filter(
		(item) => item.isActionable || item.priorityState === "pending_approval",
	);
	const selfRequestItemsCount = dashboardItems.filter((item) => {
		if (item.kind !== "NOTIFICATION_UNREAD") return false;
		const routeKey = String(item.metadata?.routeKey || "").trim().toUpperCase();
		if (routeKey === "REQUEST_SELF_VIEW") return true;
		const targetPath = String(item.metadata?.targetUrl || item.targetPath || "").trim();
		return targetPath.startsWith("/employee/requests");
	}).length;
	const isHrRole = HR_ROLES.has(String(role || ""));
	const ticketRequestsCount = isHrRole
		? actionableRequests.filter(
				(request) =>
					!isTimesheetApprovalRequest(request) &&
					HR_TICKET_REQUEST_TYPES.has(String(request.type || "").trim().toUpperCase()),
			).length
		: 0;
	const approvalsRequestsCount = actionableRequests.filter(
		(request) =>
			!isTimesheetApprovalRequest(request) &&
			(!isHrRole ||
				!HR_TICKET_REQUEST_TYPES.has(String(request.type || "").trim().toUpperCase())),
	).length;
	const approvalsTimesheetCount = actionableRequests.filter((request) =>
		isTimesheetApprovalRequest(request),
	).length;
	const attendanceActionCount = dashboardItems.filter(
		(item) => item.kind === "ATTENDANCE_CLOCK_IN" || item.kind === "TIMESHEET_REMINDER",
	).length;

	const response: ActionMetricsResponse = {
		total: summary.total,
		summary,
		counts: {
			dashboard: summary.total,
			tickets: {
				total: ticketRequestsCount,
			},
			requests: {
				total: selfRequestItemsCount,
			},
			approvals: {
				total: approvalsRequestsCount + approvalsTimesheetCount,
				requests: approvalsRequestsCount,
				timesheet: approvalsTimesheetCount,
			},
			documents: {
				...buildDocumentCounts(documentItems),
				hrPendingApproval: hrDocumentReviewCount,
			},
			timesheets: {
				total: attendanceActionCount,
			},
			notifications: {
				total: unreadNotifications.length,
			},
		},
		items: {
			dashboard: dashboardItems,
			documents: documentItems,
			onboardingDocuments: actionableDocumentItems,
		},
		categories: {
			documents: documentCategories,
		},
	};

	if (HR_ROLES.has(String(role || ""))) {
		response.analytics = {
			hrQueue: await getHrQueueAnalytics({
				prisma,
				organizationId,
			}),
		};
	}

	return response;
}

export async function getDashboardActionNeededData(params: {
	prisma: PrismaClient;
	authReq: AuthRequest;
}): Promise<DashboardActionNeededResponse> {
	const metrics = await getUserActionMetrics(params);

	return {
		summary: metrics.summary,
		items: metrics.items.dashboard.map((item) => ({
			...item,
			kind: item.kind === "APPROVAL_REQUEST" ? "PAN_APPROVAL" : item.kind,
		})),
	};
}
