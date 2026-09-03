import { DataTable, type Column, type GroupConfig } from "~/components/atoms/DataTable";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import {
	CheckCircle,
	XCircle,
	Clock,
	Eye,
	AlertCircle,
	DollarSign,
	FileText,
	Settings,
	User,
	MoreVertical,
	Calendar,
	CalendarDays,
	Loader2,
} from "lucide-react";
import { useCallback, useMemo, useState, useEffect } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router";
import { useRequests, useApproveRequest, useRequest } from "~/lib/hooks/useRequests";
import { useTimesheet, useUpdateTimesheet } from "~/lib/hooks/useTimesheets";
import type { Request, RequestType, RequestStatus } from "~/services/requests.service";
import type { TimesheetBreakdown } from "~/services/timesheet.service";
import {
	getDocumentTypeLabel,
	getMetadataField as getDocumentMetadataField,
} from "~/lib/document-request-handler";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { RequestReviewModal } from "~/components/molecules/RequestReviewModal";
import { TimesheetViewModal } from "~/components/organisms/TimesheetViewModal";
import type { TimesheetBreakdownDay } from "~/components/molecules/TimesheetCalendarApproval";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	canActOnApprovalRequest,
	canRejectApprovalRequest,
} from "~/lib/utils/request-approval-action";

const ACTIVE_APPROVAL_STATES = ["OPEN", "SUBMITTED", "FOR_APPROVAL", "IN_PROCESS", "APPROVED"] as const;
const HR_APPROVAL_ROLES = new Set([
	"admin",
	"super_admin",
	"superadmin",
	"hris-admin",
	"hris-hr-manager",
	"hris-hr-user",
]);
const APPROVAL_PREVIEW_LIMIT = 3;
const APPROVAL_TABLE_PAGE_SIZE = 10;
const APPROVAL_STATUS_ORDER = [
	"OPEN",
	"SUBMITTED",
	"FOR_APPROVAL",
	"IN_PROCESS",
	"APPROVED",
	"REJECTED",
	"CANCELLED",
	"COMPLETED",
] as const;
const APPROVAL_STATUS_FILTER_OPTIONS = [
	{ value: "all", label: "All Statuses" },
	{ value: "submitted", label: "Submitted" },
	{ value: "for_approval", label: "For Approval" },
	{ value: "in_process", label: "In Process" },
	{ value: "approved", label: "Approved" },
	{ value: "rejected", label: "Rejected" },
	{ value: "cancelled", label: "Cancelled" },
	{ value: "completed", label: "Completed" },
] as const;
const APPROVAL_REQUEST_FIELDS =
	"id,code,requester.person.personalInfo,requester.employeeId,requester.user.avatar,requester.position.title,requester.department.name,requester.id,requester.reportTo.id,requesterId,targetEmployee.id,targetEmployee.employeeId,targetEmployee.person.personalInfo,targetEmployee.reportTo.id,targetEmployee.reportTo.employeeId,targetEmployee.reportTo.person.personalInfo,targetEmployee.department.name,targetEmployee.position.title,description,type,startDate,endDate,metadata,currentWorkflowStateKey,createdAt,currentStepExecution.id,currentStepExecution.stepName,currentStepExecution.stepNumber,currentStepExecution.stepType,currentStepExecution.assigneeType,currentStepExecution.assigneeId,currentStepExecution.status,currentStepExecution.assignee.id,currentStepExecution.assignee.person.personalInfo,currentStepExecution.assignee.employeeId,lastCompletedStepExecution.stepName,lastCompletedStepExecution.completedAt,lastCompletedStepExecution.assignee.person.personalInfo,lastCompletedStepExecution.assignee.employeeId";
const APPROVAL_DETAIL_FIELDS =
	"id,code,requester.person.personalInfo,requester.employeeId,requester.user.avatar,requester.position.title,requester.department.name,requester.id,requester.reportTo.id,requesterId,targetEmployee.id,targetEmployee.employeeId,targetEmployee.person.personalInfo,targetEmployee.reportTo.id,targetEmployee.reportTo.employeeId,targetEmployee.reportTo.person.personalInfo,targetEmployee.department.name,targetEmployee.position.title,description,type,startDate,endDate,metadata,currentWorkflowStateKey,notes,attachments,createdAt,updatedAt,currentStepExecution.id,currentStepExecution.stepName,currentStepExecution.stepNumber,currentStepExecution.stepType,currentStepExecution.assigneeType,currentStepExecution.assigneeId,currentStepExecution.status,currentStepExecution.assignee.id,currentStepExecution.assignee.person.personalInfo,currentStepExecution.assignee.employeeId,lastCompletedStepExecution.id,lastCompletedStepExecution.stepName,lastCompletedStepExecution.completedAt,lastCompletedStepExecution.assignee.person.personalInfo,lastCompletedStepExecution.assignee.employeeId,stepExecutions.id,stepExecutions.stepNumber,stepExecutions.stepName,stepExecutions.stepType,stepExecutions.assigneeType,stepExecutions.status,stepExecutions.completedAt,stepExecutions.comments,stepExecutions.assignee.id,stepExecutions.assignee.employeeId,stepExecutions.assignee.person.personalInfo,stepExecutions.assignee.department.name,transactions";

const getRequestState = (request?: Request | null): RequestStatus =>
	(request?.currentWorkflowStateKey as RequestStatus) || "OPEN";

const getRequestMetadataField = (request: Request | null | undefined, field: string) => {
	if (!request?.metadata || typeof request.metadata !== "object") return null;
	return (request.metadata as Record<string, unknown>)[field] ?? null;
};

const isTimesheetSubmissionRequest = (request?: Request | null) =>
	String(request?.type || "").toUpperCase() === "TIMESHEET" &&
	String(getRequestMetadataField(request, "timesheetAction") || "").toUpperCase() ===
		"SUBMISSION";

const getLinkedTimesheetId = (request?: Request | null) =>
	String(getRequestMetadataField(request, "timesheetId") || "").trim();

const ATTENDANCE_CONTEXT_TYPES = new Set<RequestType>([
	"ATTENDANCE_CORRECTION",
	"TIME_ADJUSTMENT",
	"TIMESHEET",
	"OVERTIME",
]);

const CALENDAR_CONTEXT_TYPES = new Set<RequestType>(["LEAVE", "SCHEDULE_CHANGE"]);

const getApprovalReviewLabel = (request: Request) => {
	if (isTimesheetSubmissionRequest(request)) return "Review Timesheet";
	const state = getRequestState(request);
	const currentStepName = String(request.currentStepExecution?.stepName || "").toLowerCase();

	if (
		request.type === "DOCUMENT_REQUEST" &&
		state === "APPROVED" &&
		currentStepName.includes("generation")
	) {
		return "Generate Document";
	}

	const labels: Partial<Record<RequestType, string>> = {
		LEAVE: "Review Request",
		DOCUMENT_REQUEST: "Review Request",
		EXPENSE_REIMBURSEMENT: "Review Request",
		ATTENDANCE_CORRECTION: "Review Request",
		TIME_ADJUSTMENT: "Review Request",
		OVERTIME: "Review Request",
		TIMESHEET: "Review Timesheet",
		RESIGNATION: "Review Request",
		TERMINATION: "Review Request",
		REGULARIZATION: "Review Request",
		PROMOTION: "Review Request",
		SALARY_CHANGE: "Review Request",
		TRANSFER: "Review Request",
		SCHEDULE_CHANGE: "Review Request",
		OTHER: "Review Request",
	};

	return labels[request.type] || "Review Request";
};

const getApprovalReviewIcon = (request: Request) => {
	if (isTimesheetSubmissionRequest(request)) return Clock;
	if (request.type === "LEAVE" || request.type === "DOCUMENT_REQUEST") return FileText;
	if (request.type === "EXPENSE_REIMBURSEMENT") return DollarSign;
	if (ATTENDANCE_CONTEXT_TYPES.has(request.type)) return Clock;
	if (CALENDAR_CONTEXT_TYPES.has(request.type)) return CalendarDays;
	if (["RESIGNATION", "TERMINATION"].includes(request.type)) return AlertCircle;
	return Eye;
};

const buildActorApprovalFilter = (params: {
	status?: RequestStatus | "";
}) => {
	const { status } = params;
	return [status ? `currentWorkflowStateKey:${status}` : ""].filter(Boolean).join(",");
};

export default function Approvals() {
	const { user } = useAuth();
	const managerId = user?.metadata?.employee?.id || "";
	const currentRole = String(user?.role || user?.metadata?.employee?.role || "")
		.trim()
		.toLowerCase();
	const location = useLocation();
	const isHrApprovalActor =
		location.pathname.startsWith("/hr/") && HR_APPROVAL_ROLES.has(currentRole);

	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();

	const action = searchParams.get("action");
	const requestId = searchParams.get("id");
	const viewMode = searchParams.get("view") === "all" ? "all" : "summary";
	const statusParam = searchParams.get("status") || "";
	const normalizedStatusParam = statusParam.toUpperCase();
	const searchQuery = searchParams.get("q") || "";
	const isSummaryView = viewMode === "summary";
	const pageParam = Number(searchParams.get("page") || "1");
	const currentPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
	const selectedStatus = APPROVAL_STATUS_ORDER.includes(
		normalizedStatusParam as (typeof APPROVAL_STATUS_ORDER)[number],
	)
		? (normalizedStatusParam as RequestStatus)
		: "";

	const [viewing, setViewing] = useState<Request | null>(null);
	const [approvingId, setApprovingId] = useState<string | null>(null);
	const [rejectingId, setRejectingId] = useState<string | null>(null);
	const [rejectionReason, setRejectionReason] = useState("");

	const updateSearchParams = useCallback(
		(fn: (params: URLSearchParams) => void) => {
			setSearchParams((prev) => {
				const next = new URLSearchParams(prev);
				fn(next);
				return next;
			});
		},
		[setSearchParams],
	);

	const summaryFilter = buildActorApprovalFilter({
	});
	const detailFilter = buildActorApprovalFilter({
		status: selectedStatus,
	});
	const approvalActorParams = isHrApprovalActor
		? { approvalActorType: "HR" }
		: managerId
			? { approvalActorId: managerId }
			: {};

	const {
		data: summaryRequestsData,
		isLoading: isLoadingSummary,
		error: summaryError,
	} = useRequests({
		enabled: isSummaryView,
		filter: summaryFilter,
		...approvalActorParams,
		page: 1,
		limit: 100,
		count: true,
		sort: "createdAt",
		order: "desc",
		groupBy: "currentWorkflowStateKey",
		fields: APPROVAL_REQUEST_FIELDS,
	});
	const {
		data: requestsData,
		isLoading,
		error,
	} = useRequests({
		enabled: !isSummaryView,
		filter: detailFilter,
		...approvalActorParams,
		page: currentPage,
		limit: APPROVAL_TABLE_PAGE_SIZE,
		count: true,
		query: searchQuery,
		sort: "createdAt",
		order: "desc",
		fields: APPROVAL_REQUEST_FIELDS,
	});
	const { data: requestDetails, isLoading: isLoadingDetails } = useRequest(requestId || "", {
		fields: APPROVAL_DETAIL_FIELDS,
	});

	const approveMutation = useApproveRequest();
	const updateTimesheetMutation = useUpdateTimesheet();

	const groupedSummary = useMemo(() => {
		const source = (summaryRequestsData as any)?.requests;
		if (!source || Array.isArray(source)) return null;
		return source as Record<string, Request[]>;
	}, [summaryRequestsData]);
	const summaryRequests = useMemo(() => {
		if (!isSummaryView) return [];
		if (groupedSummary) {
			return APPROVAL_STATUS_ORDER.flatMap((status) => groupedSummary[status] || []);
		}
		return ((summaryRequestsData as any)?.requests || []) as Request[];
	}, [groupedSummary, isSummaryView, summaryRequestsData]);
	const displayRequests = useMemo(
		() => (isSummaryView ? [] : requestsData?.requests || []),
		[isSummaryView, requestsData?.requests],
	);
	const statusCounts = useMemo(() => {
		const counts = new Map<string, number>();
		if (groupedSummary) {
			Object.entries(groupedSummary).forEach(([status, items]) => {
				counts.set(status, items.length);
			});
			return counts;
		}
		summaryRequests.forEach((request) => {
			const status = getRequestState(request);
			counts.set(status, (counts.get(status) || 0) + 1);
		});
		return counts;
	}, [groupedSummary, summaryRequests]);
	const previewRequests = useMemo(() => {
		if (groupedSummary) {
			return APPROVAL_STATUS_ORDER.flatMap((status) =>
				(groupedSummary[status] || []).slice(0, APPROVAL_PREVIEW_LIMIT),
			);
		}

		const grouped = new Map<string, Request[]>();
		summaryRequests.forEach((request) => {
			const status = getRequestState(request);
			if (!grouped.has(status)) grouped.set(status, []);
			grouped.get(status)!.push(request);
		});

		return APPROVAL_STATUS_ORDER.flatMap((status) =>
			(grouped.get(status) || []).slice(0, APPROVAL_PREVIEW_LIMIT),
		);
	}, [groupedSummary, summaryRequests]);
	const tableRequests = useMemo(() => {
		if (isSummaryView) return previewRequests;
		return displayRequests;
	}, [displayRequests, isSummaryView, previewRequests]);
	const loadedRequests = useMemo(
		() => [...summaryRequests, ...displayRequests],
		[displayRequests, summaryRequests],
	);

	useEffect(() => {
		if (action && requestId) {
			const request = loadedRequests.find((item) => item.id === requestId);
			if (request) {
				setViewing(request);
			}
			return;
		}

		setViewing(null);
	}, [action, requestId, loadedRequests]);

	const modalRequest = requestDetails || viewing;
	const activeTimesheetRequest = isTimesheetSubmissionRequest(modalRequest) ? modalRequest : null;
	const linkedTimesheetId = getLinkedTimesheetId(activeTimesheetRequest);
	const isTimesheetReviewOpen = action === "timesheet.review" && Boolean(linkedTimesheetId);
	const { data: activeTimesheet, isLoading: isLoadingTimesheet } = useTimesheet(
		linkedTimesheetId || "",
		{
			enabled: Boolean(linkedTimesheetId),
			...(isTimesheetReviewOpen
				? { staleTime: 0, refetchOnMount: "always" as const }
				: {}),
		},
	);

	const formatStatusLabel = (status: RequestStatus): string =>
		String(status)
			.toLowerCase()
			.split("_")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");

	const approvalActor = {
		currentEmployeeId: managerId,
		currentRole,
		isHrActor: isHrApprovalActor,
	};

	const canActOnRequest = (request: Request | null | undefined) =>
		canActOnApprovalRequest(request, approvalActor);

	const canRejectRequest = (request: Request | null | undefined) =>
		canRejectApprovalRequest(request, approvalActor);

	const openRequestReview = (
		request: Request,
		nextAction: "view" | "timesheet.review" = "view",
	) => {
		setViewing(request);
		updateSearchParams((next) => {
			next.set("action", nextAction);
			next.set("id", request.id);
		});
	};

	const clearApprovalState = () => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
			next.delete("day");
		});
		setViewing(null);
		setRejectionReason("");
	};

	const openAllForStatus = useCallback(
		(status: string) => {
			updateSearchParams((next) => {
				next.set("view", "all");
				next.set("status", status.toLowerCase());
				next.set("page", "1");
				next.delete("q");
			});
		},
		[updateSearchParams],
	);

	const backToSummary = useCallback(() => {
		updateSearchParams((next) => {
			next.delete("view");
			next.delete("status");
			next.delete("page");
			next.delete("q");
		});
	}, [updateSearchParams]);

	const handlePageChange = useCallback(
		(page: number) => {
			updateSearchParams((next) => {
				next.set("view", "all");
				if (selectedStatus) {
					next.set("status", selectedStatus.toLowerCase());
				} else {
					next.delete("status");
				}
				next.set("page", String(page));
			});
		},
		[selectedStatus, updateSearchParams],
	);

	const handleSearchChange = useCallback(
		(value: string) => {
			updateSearchParams((next) => {
				next.set("view", "all");
				if (value.trim()) {
					next.set("q", value.trim());
				} else {
					next.delete("q");
				}
				next.set("page", "1");
			});
		},
		[updateSearchParams],
	);

	const handleStatusSelectChange = useCallback(
		(value: string) => {
			updateSearchParams((next) => {
				next.set("view", "all");
				if (value && value !== "all") {
					next.set("status", value);
				} else {
					next.delete("status");
				}
				next.set("page", "1");
			});
		},
		[updateSearchParams],
	);

	const handleViewRequest = (request: Request) => {
		if (isTimesheetSubmissionRequest(request)) {
			openRequestReview(request, "timesheet.review");
			return;
		}

		openRequestReview(request, "view");
	};

	const handleApproveRequest = async (request: Request) => {
		if (isTimesheetSubmissionRequest(request)) {
			openRequestReview(request, "timesheet.review");
			return;
		}

		setApprovingId(request.id);
		try {
			await approveMutation.mutateAsync({
				id: request.id,
				action: "approve",
			});
			clearApprovalState();
		} catch (approveError) {
			console.error("Failed to approve request:", approveError);
		} finally {
			setApprovingId(null);
		}
	};

	const handleRejectRequest = (request: Request) => {
		if (isTimesheetSubmissionRequest(request)) {
			openRequestReview(request, "timesheet.review");
			return;
		}

		setRejectionReason("");
		setViewing(request);
		updateSearchParams((next) => {
			next.set("action", "reject");
			next.set("id", request.id);
		});
	};

	const handleRejectConfirm = async () => {
		if (!viewing) return;

		setRejectingId(viewing.id);
		try {
			await approveMutation.mutateAsync({
				id: viewing.id,
				action: "reject",
				comment: rejectionReason || "Rejected by manager",
			});
			clearApprovalState();
		} catch (rejectError) {
			console.error("Failed to reject request:", rejectError);
		} finally {
			setRejectingId(null);
		}
	};

	const persistTimesheetReviewBreakdown = async (
		request: Request,
		breakdown: TimesheetBreakdownDay[],
	) => {
		const timesheetId = getLinkedTimesheetId(request);
		if (!timesheetId) {
			throw new Error("Missing linked timesheet for this approval request.");
		}

		await updateTimesheetMutation.mutateAsync({
			id: timesheetId,
			payload: {
				breakdown: breakdown as TimesheetBreakdown[],
			},
		});
	};

	const handleApproveTimesheetRequest = async (breakdown: TimesheetBreakdownDay[]) => {
		if (!activeTimesheetRequest) return;

		setApprovingId(activeTimesheetRequest.id);
		try {
			await persistTimesheetReviewBreakdown(activeTimesheetRequest, breakdown);
			await approveMutation.mutateAsync({
				id: activeTimesheetRequest.id,
				action: "approve",
			});
			clearApprovalState();
		} catch (approveError) {
			console.error("Failed to approve timesheet request:", approveError);
		} finally {
			setApprovingId(null);
		}
	};

	const handleRejectTimesheetRequest = async (
		breakdown: TimesheetBreakdownDay[],
		reason: string,
	) => {
		if (!activeTimesheetRequest) return;

		setRejectingId(activeTimesheetRequest.id);
		try {
			await persistTimesheetReviewBreakdown(activeTimesheetRequest, breakdown);
			await approveMutation.mutateAsync({
				id: activeTimesheetRequest.id,
				action: "reject",
				comment: reason || "Rejected by manager",
			});
			clearApprovalState();
		} catch (rejectError) {
			console.error("Failed to reject timesheet request:", rejectError);
		} finally {
			setRejectingId(null);
		}
	};

	const getTypeLabel = (type: RequestType, metadata?: Record<string, any>): string => {
		const labels: Record<string, string> = {
			EXPENSE_REIMBURSEMENT: "Expense Reimbursement",
			DOCUMENT_REQUEST: "Document Request",
			ATTENDANCE_CORRECTION: "Attendance Correction",
			TIME_ADJUSTMENT: "Time Adjustment",
			TIMESHEET:
				metadata?.timesheetAction === "EDIT_PERMISSION"
					? "Timesheet Edit Permission"
					: "Timesheet Submission",
			OTHER: "General Request",
			LEAVE: "Leave Request",
			OVERTIME: "Overtime Request",
			PAYROLL_CORRECTION: "Payroll Correction",
			RESIGNATION: "Resignation",
			TERMINATION: "Termination",
			REGULARIZATION: "Regularization",
			PROMOTION: "Promotion",
			SALARY_CHANGE: "Salary Change",
			TRANSFER: "Transfer",
			SCHEDULE_CHANGE: "Schedule Change",
		};
		return labels[type] || "General Request";
	};

	const getTypeIcon = (type: RequestType) => {
		const icons: Record<string, any> = {
			EXPENSE_REIMBURSEMENT: DollarSign,
			DOCUMENT_REQUEST: FileText,
			ATTENDANCE_CORRECTION: Clock,
			TIME_ADJUSTMENT: Clock,
			TIMESHEET: Clock,
			OTHER: Settings,
			LEAVE: FileText,
			OVERTIME: Clock,
			PAYROLL_CORRECTION: Clock,
			RESIGNATION: AlertCircle,
			TERMINATION: AlertCircle,
			REGULARIZATION: FileText,
			PROMOTION: FileText,
			SALARY_CHANGE: DollarSign,
			TRANSFER: FileText,
			SCHEDULE_CHANGE: Clock,
		};
		const Icon = icons[type] || Settings;
		return <Icon className="w-4 h-4" />;
	};

	const getTypeColor = (type: RequestType): string => {
		const colors: Record<string, string> = {
			EXPENSE_REIMBURSEMENT: "text-green-600",
			DOCUMENT_REQUEST: "text-blue-600",
			ATTENDANCE_CORRECTION: "text-orange-600",
			TIME_ADJUSTMENT: "text-orange-600",
			TIMESHEET: "text-orange-600",
			OTHER: "text-neutral-600",
			LEAVE: "text-blue-600",
			RESIGNATION: "text-red-600",
			OVERTIME: "text-orange-600",
			PAYROLL_CORRECTION: "text-neutral-700",
			TERMINATION: "text-red-600",
			REGULARIZATION: "text-indigo-600",
			PROMOTION: "text-emerald-600",
			SALARY_CHANGE: "text-teal-600",
			TRANSFER: "text-cyan-600",
			SCHEDULE_CHANGE: "text-cyan-600",
		};
		return colors[type] || "text-gray-600";
	};

	const getStatusBadge = (status: RequestStatus): string => {
		const baseClasses = "px-2 py-1 text-xs rounded-full font-medium";
		const statusStyles: Record<RequestStatus, string> = {
			OPEN: `${baseClasses} bg-slate-100 text-slate-800`,
			SUBMITTED: `${baseClasses} bg-yellow-100 text-yellow-800`,
			FOR_APPROVAL: `${baseClasses} bg-orange-100 text-orange-800`,
			IN_PROCESS: `${baseClasses} bg-blue-100 text-blue-800`,
			APPROVED: `${baseClasses} bg-green-100 text-green-800`,
			REJECTED: `${baseClasses} bg-red-100 text-red-800`,
			CANCELLED: `${baseClasses} bg-gray-100 text-gray-800`,
			COMPLETED: `${baseClasses} bg-green-100 text-green-800`,
		};
		return statusStyles[status] || statusStyles.OPEN;
	};

	const openDecisionReview = (request: Request) => {
		handleViewRequest(request);
	};

	const getStatusIcon = (status: RequestStatus) => {
		const icons: Record<RequestStatus, any> = {
			OPEN: Clock,
			SUBMITTED: Clock,
			FOR_APPROVAL: Clock,
			IN_PROCESS: Clock,
			APPROVED: CheckCircle,
			REJECTED: XCircle,
			CANCELLED: AlertCircle,
			COMPLETED: CheckCircle,
		};
		const Icon = icons[status] || Clock;
		const colors: Record<RequestStatus, string> = {
			OPEN: "text-slate-600",
			SUBMITTED: "text-yellow-600",
			FOR_APPROVAL: "text-orange-600",
			IN_PROCESS: "text-blue-600",
			APPROVED: "text-green-600",
			REJECTED: "text-red-600",
			CANCELLED: "text-gray-600",
			COMPLETED: "text-green-600",
		};
		return <Icon className={`w-4 h-4 ${colors[status] || colors.OPEN}`} />;
	};

	const columns: Column<Request>[] = useMemo(
		() => [
			{
				key: "requester",
				label: "Requester",
				width: "220px",
				render: (_value, item) => {
					const requester = item.requester as any;
					const firstName = requester?.person?.personalInfo?.firstName || "";
					const lastName = requester?.person?.personalInfo?.lastName || "";
					const fullName = `${firstName} ${lastName}`.trim();

					return (
						<EmployeeTableCell
							profileId={requester?.id || item.requesterId}
							fullName={fullName || null}
							employeeId={requester?.employeeId || null}
							avatar={requester?.user?.avatar ?? null}
						/>
					);
				},
			},
			{
				key: "type",
				label: "Request Type",
				width: "250px",
				render: (value, item) => {
					if (value === "DOCUMENT_REQUEST") {
						const documentType = getDocumentMetadataField(item, "documentType");
						const description = item.description || "";

						return (
							<div className="flex items-center gap-3">
								<div className="p-2 rounded-lg bg-blue-50">
									<FileText className="h-4 w-4 text-blue-600" />
								</div>
								<div className="flex flex-col">
									<span className="font-medium text-gray-900">
										{getDocumentTypeLabel(documentType)}
									</span>
									<span className="text-xs text-gray-500 truncate max-w-[180px]">
										{description}
									</span>
								</div>
							</div>
						);
					}

					return (
						<div className="flex items-center gap-3">
							<div
								className={`p-2 rounded-lg bg-gray-100 ${getTypeColor(value as RequestType)}`}>
								{getTypeIcon(value as RequestType)}
							</div>
							<div className="flex flex-col">
								<span className="font-medium text-gray-900">
									{getTypeLabel(value as RequestType, item.metadata)}
								</span>
								{item.description && (
									<span className="text-xs text-gray-500 truncate max-w-[180px]">
										{item.description}
									</span>
								)}
							</div>
						</div>
					);
				},
			},
			{
				key: "createdAt",
				label: "Requested On",
				width: "150px",
				render: (value) => {
					if (!value) return <span className="text-gray-400">-</span>;
					const date = new Date(value as string);
					return (
						<span className="text-sm text-gray-600">
							{date.toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
								year: "numeric",
							})}
						</span>
					);
				},
			},
			{
				key: "currentWorkflowStateKey",
				label: "Status",
				render: (_value, item) => {
					const status = getRequestState(item);
					return (
						<div className="flex items-center gap-2">
							{getStatusIcon(status)}
							<span className={getStatusBadge(status)}>
								{formatStatusLabel(status)}
							</span>
						</div>
					);
				},
			},
			{
				key: "currentStepExecution",
				label: "Current Step",
				width: "200px",
				render: (_value, item) => {
					const currentStep = item.currentStepExecution;
					const isReadyToGenerate =
						item.type === "DOCUMENT_REQUEST" &&
						currentStep?.stepName?.toLowerCase().includes("generation");

					if (!currentStep?.stepName) {
						return <span className="text-gray-400 text-sm">-</span>;
					}

					let assigneeName = "";
					if (currentStep.assigneeType === "HR") {
						assigneeName = "HR Approval";
					} else if (currentStep.assignee?.person?.personalInfo) {
						const { firstName, lastName } = currentStep.assignee.person.personalInfo;
						assigneeName = `${firstName || ""} ${lastName || ""}`.trim();
					} else {
						assigneeName = "Pending Assignment";
					}

					return (
						<div className="flex flex-col gap-1">
							<span className="text-sm font-medium text-gray-900">
								{currentStep.stepName}
							</span>
							<span className="text-xs text-gray-600">{assigneeName}</span>
							{isReadyToGenerate && (
								<span className="text-xs text-green-600 font-semibold">
									Ready to Generate
								</span>
							)}
						</div>
					);
				},
			},
			{
				key: "lastCompletedStepExecution",
				label: "Executed By",
				width: "180px",
				render: (_value, item) => {
					const lastStep = item.lastCompletedStepExecution;

					if (!lastStep) {
						return <span className="text-gray-400 text-sm">-</span>;
					}

					let approverName = "";
					if (lastStep.assignee?.person?.personalInfo) {
						const { firstName, lastName } = lastStep.assignee.person.personalInfo;
						approverName = `${firstName || ""} ${lastName || ""}`.trim();
					} else {
						approverName = "System";
					}

					const completedDate = lastStep.completedAt
						? new Date(lastStep.completedAt).toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
							})
						: "";

					return (
						<div className="flex flex-col gap-1">
							<span className="text-sm font-medium text-gray-900">
								{approverName}
							</span>
							{completedDate && (
								<span className="text-xs text-gray-500">{completedDate}</span>
							)}
						</div>
					);
				},
			},
		],
		[],
	);

	const groupByConfig: GroupConfig = useMemo(
		() => ({
			key: "currentWorkflowStateKey",
			order: [...APPROVAL_STATUS_ORDER],
			defaultCollapsed: ["APPROVED", "REJECTED", "CANCELLED", "COMPLETED"],
			renderGroupFooter: isSummaryView
				? (groupValue, items) => {
						const total = statusCounts.get(groupValue) || items.length;

						return (
							<div className="flex flex-col gap-2 border-t border-neutral-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
								<span className="text-xs font-medium text-gray-500">
									Showing recent {items.length} of {total}
								</span>
								<button
									type="button"
									onClick={() => openAllForStatus(groupValue)}
									className="w-fit text-xs font-bold text-neutral-700 underline-offset-4 transition-colors hover:text-orange-600 hover:underline">
									View all {formatStatusLabel(groupValue as RequestStatus)}
								</button>
							</div>
						);
					}
				: undefined,
		}),
		[isSummaryView, openAllForStatus, statusCounts],
	);

	const handleViewProfile = (request: Request) => {
		const employeeProfileId = request.requester?.id;
		if (employeeProfileId) {
			navigate(`/employee/${employeeProfileId}`);
		}
	};

	const handleViewAttendance = (request: Request) => {
		const employeeProfileId = request.requester?.id;
		if (employeeProfileId) {
			navigate(`/employee/${employeeProfileId}/attendance`);
		}
	};

	const handleViewCalendar = (request: Request) => {
		const formatDate = (dateStr: string) => {
			if (!dateStr) return "";
			return new Date(dateStr).toISOString().split("T")[0];
		};

		const leaveType = getRequestMetadataField(request, "leaveType") || "";
		const startDate = formatDate(request.startDate || "");
		const endDate = formatDate(request.endDate || "");
		const status = getRequestState(request);
		const currentPath = "employee/approvals/requests";
		const encodedPath = currentPath.replace(/\//g, "-");

		navigate(
			`/calendar?type=leave&leaveType=${encodeURIComponent(String(leaveType))}&startDate=${startDate}&endDate=${endDate}&status=${status}&from=${encodedPath}&requestId=${request.id}`,
		);
	};

	if ((error || summaryError) && !isLoading && !isLoadingSummary) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-red-600">Error loading requests. Please try again later.</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{!isSummaryView && (
				<button
					type="button"
					onClick={backToSummary}
					className="w-fit text-xs font-bold text-neutral-700 underline-offset-4 transition-colors hover:text-orange-600 hover:underline">
					Back to approvals
				</button>
			)}
			<DataTable<Request>
				title="My Approvals"
				description=""
				data={tableRequests}
				columns={columns}
				searchFields={["code", "description", "type"]}
				groupBy={isSummaryView ? groupByConfig : undefined}
				isLoading={isSummaryView ? isLoadingSummary : isLoading}
				itemsPerPage={APPROVAL_TABLE_PAGE_SIZE}
				showSearch={!isSummaryView}
				showFilters={false}
				showPagination={!isSummaryView}
				alwaysShowPagination={!isSummaryView}
				currentPage={currentPage}
				totalItems={requestsData?.pagination?.total || tableRequests.length}
				totalPages={requestsData?.pagination?.totalPages}
				onPageChange={!isSummaryView ? handlePageChange : undefined}
				onSearch={!isSummaryView ? handleSearchChange : undefined}
				searchValue={searchQuery}
				customFilters={
					isSummaryView ? null : (
						<div className="flex items-center gap-2">
							<span className="text-xs font-bold uppercase tracking-wide text-gray-500">
								Status
							</span>
							<Select
								value={selectedStatus ? selectedStatus.toLowerCase() : "all"}
								onValueChange={handleStatusSelectChange}>
								<SelectTrigger className="h-10 w-[180px] rounded-xl border-neutral-200 bg-white text-xs font-bold text-gray-700 shadow-sm">
									<SelectValue placeholder="Status" />
								</SelectTrigger>
								<SelectContent>
									{APPROVAL_STATUS_FILTER_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)
				}
				renderActions={(item) => {
					const canAct = canActOnRequest(item);
					const isTimesheetRequest = isTimesheetSubmissionRequest(item);
					const isProcessing =
						approvingId === item.id ||
						rejectingId === item.id ||
						((approveMutation.isPending || updateTimesheetMutation.isPending) &&
							(viewing?.id === item.id || requestId === item.id));
					const hasRequesterProfile = Boolean(item.requester?.id);
					const showAttendanceContext =
						ATTENDANCE_CONTEXT_TYPES.has(item.type) ||
						item.type === "LEAVE" ||
						isTimesheetRequest;
					const showCalendarContext = CALENDAR_CONTEXT_TYPES.has(item.type);
					const ReviewIcon = getApprovalReviewIcon(item);

					return (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									className="w-8 h-8 p-0"
									disabled={isProcessing}
									aria-label={`${getApprovalReviewLabel(item)} actions`}>
									{isProcessing ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<MoreVertical className="h-4 w-4" />
									)}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-56">
								<DropdownMenuItem
									onClick={() => handleViewRequest(item)}
									disabled={isProcessing}>
									<ReviewIcon className="h-4 w-4 mr-2" />
									{canAct ? getApprovalReviewLabel(item) : "View Details"}
								</DropdownMenuItem>
								{canAct ? (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											onClick={() => openDecisionReview(item)}
											disabled={isProcessing}>
											<CheckCircle className="h-4 w-4 mr-2 text-green-600" />
											{item.currentStepExecution?.stepType === "TASK"
												? "Complete Task"
												: "Approve"}
										</DropdownMenuItem>
										{canRejectRequest(item) ? (
											<DropdownMenuItem
												onClick={() => openDecisionReview(item)}
												disabled={isProcessing}>
												<XCircle className="h-4 w-4 mr-2 text-red-600" />
												Reject
											</DropdownMenuItem>
										) : null}
									</>
								) : null}

								{hasRequesterProfile ||
								showAttendanceContext ||
								showCalendarContext ? (
									<>
										<DropdownMenuSeparator />

										{hasRequesterProfile ? (
											<DropdownMenuItem
												onClick={() => handleViewProfile(item)}
												disabled={isProcessing}>
												<User className="h-4 w-4 mr-2" />
												View Profile
											</DropdownMenuItem>
										) : null}

										{showAttendanceContext ? (
											<DropdownMenuItem
												onClick={() => handleViewAttendance(item)}
												disabled={isProcessing || !hasRequesterProfile}>
												<Calendar className="h-4 w-4 mr-2" />
												View Attendance
											</DropdownMenuItem>
										) : null}

										{showCalendarContext ? (
											<DropdownMenuItem
												onClick={() => handleViewCalendar(item)}
												disabled={isProcessing || !hasRequesterProfile}>
												<CalendarDays className="h-4 w-4 mr-2" />
												View Calendar
											</DropdownMenuItem>
										) : null}
									</>
								) : null}

								{isProcessing ? (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											disabled
											className="text-gray-500 focus:text-gray-500">
											<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											Processing request...
										</DropdownMenuItem>
									</>
								) : null}
							</DropdownMenuContent>
						</DropdownMenu>
					);
				}}
				emptyMessage="No requests found"
				emptyDescription="No approval requests from your team."
			/>

			<RequestReviewModal
				variant="compact"
				open={action === "view" && !isTimesheetSubmissionRequest(modalRequest || null)}
				onOpenChange={(open) => {
					if (!open) {
						clearApprovalState();
					}
				}}
				request={
					action === "view" && !isTimesheetSubmissionRequest(modalRequest || null)
						? modalRequest || null
						: null
				}
				onApprove={
					action === "view" &&
					!isTimesheetSubmissionRequest(modalRequest || null) &&
					canActOnRequest(modalRequest)
						? (request) => {
								handleApproveRequest(request);
							}
						: undefined
				}
				onReject={
					action === "view" &&
					!isTimesheetSubmissionRequest(modalRequest || null) &&
					canRejectRequest(modalRequest)
						? (request) => {
								handleRejectRequest(request);
							}
						: undefined
				}
				isApproving={approvingId === modalRequest?.id}
				isRejecting={rejectingId === modalRequest?.id}
				topContent={
					isLoadingDetails && !modalRequest ? (
						<div className="flex items-center justify-center py-6">
							<div className="text-sm text-gray-500">Loading request details...</div>
						</div>
					) : null
				}
			/>

			<Modal
				open={action === "reject" && !isTimesheetSubmissionRequest(modalRequest || null)}
				onOpenChange={(open) => {
					if (!open) {
						clearApprovalState();
					}
				}}
				title="Reject Request"
				description="Please provide a reason for rejecting this request">
				<div className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Rejection Reason *
						</label>
						<textarea
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[100px]"
							placeholder="Explain why this request is being rejected..."
							value={rejectionReason}
							onChange={(event) => setRejectionReason(event.target.value)}
						/>
					</div>
					<div className="flex justify-end gap-3">
						<Button
							variant="outline"
							onClick={clearApprovalState}
							disabled={rejectingId !== null}>
							Cancel
						</Button>
						<Button
							className="bg-red-600 hover:bg-red-700 text-white"
							onClick={handleRejectConfirm}
							disabled={!rejectionReason.trim() || rejectingId !== null}>
							{rejectingId ? (
								<span className="inline-flex items-center gap-2">
									<Loader2 className="h-4 w-4 animate-spin" />
									Rejecting...
								</span>
							) : (
								"Confirm Rejection"
							)}
						</Button>
					</div>
				</div>
			</Modal>

			<TimesheetViewModal
				isOpen={action === "timesheet.review"}
				onClose={clearApprovalState}
				timesheet={activeTimesheet || null}
				isLoading={isLoadingDetails || isLoadingTimesheet}
				approvalMode={true}
				approvedEditedDaysSummary={activeTimesheet?.approvedEditedDaysSummary ?? null}
				onApprove={handleApproveTimesheetRequest}
				onReject={handleRejectTimesheetRequest}
				isApproving={
					approvingId === activeTimesheetRequest?.id ||
					rejectingId === activeTimesheetRequest?.id ||
					approveMutation.isPending ||
					updateTimesheetMutation.isPending
				}
			/>
		</div>
	);
}
