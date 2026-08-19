import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
	ArrowLeft,
	Briefcase,
	CheckCircle,
	ChevronDown,
	ChevronRight,
	Eye,
	ExternalLink,
	FileText,
	MoreVertical,
	XCircle,
} from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { DataTable, type Column, type GroupConfig } from "~/components/atoms/DataTable";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { RequestReviewModal } from "~/components/molecules/RequestReviewModal";
import {
	useApproveRequest,
	useGenerateDocument,
	useHRTicketQueues,
	useRequest,
	useRequests,
} from "~/lib/hooks/useRequests";
import { useAuth } from "~/lib/hooks/use-auth";
import { getRequestState, type Request, type RequestStatus } from "~/services/requests.service";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { getDocumentTypeLabel } from "~/lib/document-request-handler";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { toast } from "sonner";

type TicketCategory = "DOCUMENT" | "PERSONNEL_ACTION" | "JOB_REQUISITION" | "SCHEDULE_CHANGE";
type TicketSectionKey = "approval" | "task" | "recent";

interface RequestTicketRow extends Request {
	ticketCode: string;
	requestId: string;
	queueSection: TicketSectionKey;
	ticketCategory: TicketCategory;
	employeeName: string;
	employeeId: string;
	subjectName: string;
	subjectEmployeeId: string;
	subjectProfileId?: string | null;
	requestLabel: string;
	workflowStatus: RequestStatus;
	requestedOn: string;
	currentStep: string;
	currentStepMeta?: string;
	isDocumentGenerated: boolean;
	isReadyToGenerate: boolean;
}

const PAN_TYPE_LABELS: Record<string, string> = {
	RESIGNATION: "Resignation",
	TRANSFER: "Transfer",
	TERMINATION: "Termination",
	PROMOTION: "Promotion",
	SALARY_CHANGE: "Salary Change",
	REGULARIZATION: "Regularization",
};

const TICKET_REQUEST_TYPES = [
	"DOCUMENT_REQUEST",
	"RESIGNATION",
	"TERMINATION",
	"TRANSFER",
	"REGULARIZATION",
	"PROMOTION",
	"SALARY_CHANGE",
	"SCHEDULE_CHANGE",
	"ATTENDANCE_CORRECTION",
	"OTHER",
] as const;

const ACTIVE_TICKET_STATES = ["OPEN", "SUBMITTED", "FOR_APPROVAL", "IN_PROCESS"] as const;
const ACTIVE_HR_TASK_STATES = [...ACTIVE_TICKET_STATES, "APPROVED"] as const;
const RECENT_TICKET_STATES = ["APPROVED", "COMPLETED", "REJECTED", "CANCELLED"] as const;
const PREVIEW_LIMIT = 3;
const LIST_LIMIT = 10;
const TICKET_SECTION_ORDER: TicketSectionKey[] = ["approval", "task", "recent"];
const HR_TICKET_ACTION_ROLES = new Set([
	"hris-admin",
	"hris-hr-manager",
	"hris-hr-user",
	"admin",
	"super_admin",
	"superadmin",
]);

const SECTION_CONFIG: Record<
	TicketSectionKey,
	{
		title: string;
		listTitle: string;
		emptyTitle: string;
		emptyDescription: string;
		viewAllLabel: string;
	}
> = {
	approval: {
		title: "Needs HR Approval",
		listTitle: "All HR Approval Tickets",
		emptyTitle: "No HR approvals in queue",
		emptyDescription: "New approval-assigned requests will appear here.",
		viewAllLabel: "View all HR approvals",
	},
	task: {
		title: "Needs HR Task",
		listTitle: "All HR Task Tickets",
		emptyTitle: "No HR tasks in queue",
		emptyDescription: "Pending HR tasks and document follow-through items will appear here.",
		viewAllLabel: "View all HR tasks",
	},
	recent: {
		title: "Recently Completed",
		listTitle: "Recent HR Outcomes",
		emptyTitle: "No recent HR outcomes",
		emptyDescription: "Recent HR outcomes will appear here after the queue moves.",
		viewAllLabel: "View history",
	},
};

const TICKET_QUERY_FIELDS = [
	"id",
	"code",
	"type",
	"description",
	"startDate",
	"endDate",
	"metadata",
	"currentWorkflowStateKey",
	"createdAt",
	"requesterId",
	"requester.id",
	"requester.person.personalInfo",
	"requester.employeeId",
	"requester.department.id",
	"requester.department.name",
	"requester.reportTo.id",
	"targetEmployee.id",
	"targetEmployee.employeeId",
	"targetEmployee.person.personalInfo",
	"targetEmployee.department.name",
	"targetEmployee.position.title",
	"currentStepExecution.id",
	"currentStepExecution.stepType",
	"currentStepExecution.stepName",
	"currentStepExecution.assigneeType",
	"currentStepExecution.status",
	"currentStepExecution.assignee.id",
	"currentStepExecution.assignee.employeeId",
	"currentStepExecution.assignee.person.personalInfo",
	"currentStepExecution.assignee.department.name",
	"lastCompletedStepExecution.id",
	"lastCompletedStepExecution.stepName",
	"lastCompletedStepExecution.stepType",
	"lastCompletedStepExecution.assigneeType",
	"lastCompletedStepExecution.assignee.id",
	"lastCompletedStepExecution.completedAt",
	"stepExecutions.id",
	"stepExecutions.stepNumber",
	"stepExecutions.stepName",
	"stepExecutions.stepType",
	"stepExecutions.assigneeType",
	"stepExecutions.status",
	"stepExecutions.completedAt",
	"stepExecutions.assignee.id",
].join(",");

const TICKET_DETAIL_FIELDS = [
	"id",
	"code",
	"type",
	"description",
	"startDate",
	"endDate",
	"metadata",
	"currentWorkflowStateKey",
	"attachments",
	"notes",
	"createdAt",
	"updatedAt",
	"requesterId",
	"requester.id",
	"requester.employeeId",
	"requester.person.personalInfo",
	"requester.department.name",
	"requester.position.title",
	"targetEmployee.id",
	"targetEmployee.employeeId",
	"targetEmployee.employmentStatus",
	"targetEmployee.employmentType",
	"targetEmployee.probationEndDate",
	"targetEmployee.metadata",
	"targetEmployee.person.personalInfo",
	"targetEmployee.reportTo.id",
	"targetEmployee.reportTo.employeeId",
	"targetEmployee.reportTo.person.personalInfo",
	"targetEmployee.department.name",
	"targetEmployee.position.title",
	"currentStepExecution.id",
	"currentStepExecution.stepNumber",
	"currentStepExecution.stepName",
	"currentStepExecution.stepType",
	"currentStepExecution.assigneeType",
	"currentStepExecution.assigneeId",
	"currentStepExecution.status",
	"currentStepExecution.assignee.id",
	"currentStepExecution.assignee.employeeId",
	"currentStepExecution.assignee.person.personalInfo",
	"currentStepExecution.assignee.department.name",
	"lastCompletedStepExecution.id",
	"lastCompletedStepExecution.stepNumber",
	"lastCompletedStepExecution.stepName",
	"lastCompletedStepExecution.stepType",
	"lastCompletedStepExecution.assigneeType",
	"lastCompletedStepExecution.completedAt",
	"lastCompletedStepExecution.assignee.id",
	"lastCompletedStepExecution.assignee.employeeId",
	"lastCompletedStepExecution.assignee.person.personalInfo",
	"stepExecutions.id",
	"stepExecutions.stepNumber",
	"stepExecutions.stepName",
	"stepExecutions.stepType",
	"stepExecutions.assigneeType",
	"stepExecutions.assigneeId",
	"stepExecutions.status",
	"stepExecutions.completedAt",
	"stepExecutions.comments",
	"stepExecutions.metadata",
	"stepExecutions.assignee.id",
	"stepExecutions.assignee.employeeId",
	"stepExecutions.assignee.person.personalInfo",
	"stepExecutions.assignee.department.name",
	"stepExecutions.assignee.department.code",
	"transactions.id",
	"transactions.sequenceNumber",
	"transactions.eventCategory",
	"transactions.eventKey",
	"transactions.fieldChanges",
	"transactions.occurredAt",
].join(",");

const getMetadataField = (request: Request | null | undefined, field: string): unknown => {
	if (!request || !request.metadata || typeof request.metadata !== "object") return null;
	return request.metadata[field] ?? null;
};

const formatMetadataLabel = (value: unknown) => {
	if (value === null || value === undefined || value === "") return "N/A";
	return String(value)
		.replace(/_/g, " ")
		.toLowerCase()
		.replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatDate = (value?: string | null) => {
	if (!value) return "-";
	return new Date(value).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

const getRequesterName = (item: Request): string => {
	const firstName = item.requester?.person?.personalInfo?.firstName || "";
	const lastName = item.requester?.person?.personalInfo?.lastName || "";
	return firstName || lastName ? `${firstName} ${lastName}` : "Unknown Employee";
};

type TicketEmployeeLike = {
	id?: string;
	employeeId?: string | null;
	person?: {
		personalInfo?: {
			firstName?: string;
			lastName?: string;
		};
	};
};

const getEmployeeDisplayName = (employee?: TicketEmployeeLike | null): string => {
	const firstName = employee?.person?.personalInfo?.firstName || "";
	const lastName = employee?.person?.personalInfo?.lastName || "";
	return firstName || lastName ? `${firstName} ${lastName}` : "";
};

const getTicketSubject = (
	request: Request,
): { name: string; employeeId: string; profileId?: string | null } => {
	const subject = request.targetEmployee || request.requester;
	const subjectName = getEmployeeDisplayName(subject);
	return {
		name: subjectName || getRequesterName(request),
		employeeId: subject?.employeeId || request.requester?.employeeId || "No ID",
		profileId: subject?.id || request.requester?.id || request.requesterId || null,
	};
};

const getRequestLabel = (item: Request): string => {
	if (
		item.type === "OTHER" &&
		String(getMetadataField(item, "requestSubtype") || "")
			.trim()
			.toUpperCase() === "DEPARTMENT_JOB_REQUISITION"
	) {
		return "Job Requisition";
	}

	if (item.type === "DOCUMENT_REQUEST") {
		return getDocumentTypeLabel(String(getMetadataField(item, "documentType") || ""));
	}

	if (item.type === "SCHEDULE_CHANGE") {
		return "Schedule Change";
	}

	const panType = String(getMetadataField(item, "panSubType") || item.type || "")
		.trim()
		.toUpperCase();
	return PAN_TYPE_LABELS[panType] || panType || "Personnel Action";
};

const getTaskStepStage = (request?: Request | null): "TASK" | null => {
	if (!request) return null;

	if (request.currentStepExecution?.stepType === "TASK") {
		return "TASK";
	}

	const pendingTaskStep = request.stepExecutions?.find(
		(step) => step.stepType === "TASK" && step.status === "PENDING",
	);
	return pendingTaskStep?.stepType === "TASK" ? "TASK" : null;
};

const isReadyToGenerate = (request?: Request | null): boolean => {
	if (!request || request.type !== "DOCUMENT_REQUEST") return false;
	if (Boolean(getMetadataField(request, "documentNumber"))) return false;

	const state = getRequestState(request);
	if (state === "APPROVED") return true;

	return (
		(state === "SUBMITTED" || state === "IN_PROCESS") && getTaskStepStage(request) === "TASK"
	);
};

const getGeneratedJobId = (request?: Request | null): string | null => {
	const jobId = String(getMetadataField(request, "createdJobId") || "").trim();
	return jobId || null;
};

const getStatusBadge = (status: RequestStatus) => {
	const statusStyles: Record<
		RequestStatus,
		{ variant: "success" | "secondary" | "destructive" | "default"; label: string }
	> = {
		PENDING: { variant: "default", label: "Pending" },
		SUBMITTED: { variant: "default", label: "Submitted" },
		FOR_APPROVAL: { variant: "default", label: "For Approval" },
		APPROVED: { variant: "success", label: "Approved" },
		REJECTED: { variant: "destructive", label: "Rejected" },
		CANCELLED: { variant: "secondary", label: "Cancelled" },
		IN_PROCESS: { variant: "default", label: "In Process" },
		COMPLETED: { variant: "success", label: "Completed" },
		OPEN: { variant: "default", label: "Open" },
	};
	return statusStyles[status] || { variant: "default", label: status };
};

const canActOnTicketRequest = (
	request: Request | null | undefined,
	params: {
		currentEmployeeId: string;
		currentRole: string;
	},
): boolean => {
	if (!request || !request.currentStepExecution) return false;

	const state = getRequestState(request);
	if (
		![...ACTIVE_TICKET_STATES, "APPROVED"].includes(
			state as (typeof ACTIVE_TICKET_STATES)[number] | "APPROVED",
		)
	) {
		return false;
	}
	if (
		request.currentStepExecution.assigneeType === "HR" &&
		HR_TICKET_ACTION_ROLES.has(params.currentRole)
	) {
		return true;
	}

	const assigneeId = request.currentStepExecution.assignee?.id;
	return Boolean(assigneeId && assigneeId === params.currentEmployeeId);
};

const canGenerateDocumentFromRequest = (request?: Request | null) =>
	Boolean(request?.type === "DOCUMENT_REQUEST" && isReadyToGenerate(request));

const canViewGeneratedDocumentFromRequest = (request?: Request | null) =>
	Boolean(request?.type === "DOCUMENT_REQUEST" && getMetadataField(request, "documentNumber"));

const canOpenGeneratedJobFromRequest = (request?: Request | null) =>
	Boolean(
		request &&
			request.type === "OTHER" &&
			String(getMetadataField(request, "requestSubtype") || "")
				.trim()
				.toUpperCase() === "DEPARTMENT_JOB_REQUISITION" &&
			getGeneratedJobId(request),
	);

const buildSectionStepSummary = (
	request: Request,
	section: TicketSectionKey,
): Pick<RequestTicketRow, "currentStep" | "currentStepMeta"> => {
	const state = getRequestState(request);
	const currentStep = request.currentStepExecution;
	const lastCompletedStep = request.lastCompletedStepExecution;

	if (section === "approval") {
		return {
			currentStep: currentStep?.stepName || "Current HR approval",
			currentStepMeta: "Awaiting HR approval",
		};
	}

	if (section === "task") {
		if (isReadyToGenerate(request)) {
			return {
				currentStep: "Generate requested document",
			};
		}

		return {
			currentStep: currentStep?.stepName || "Current HR task",
			currentStepMeta: "Awaiting HR task completion",
		};
	}

	if (isReadyToGenerate(request)) {
		return {
			currentStep: "Generate requested document",
		};
	}

	if (state === "COMPLETED" && lastCompletedStep?.assigneeType === "SYSTEM") {
		return {
			currentStep: lastCompletedStep.stepName || "System completion",
			currentStepMeta: "Finalized after the HR workflow step finished",
		};
	}

	return {
		currentStep: lastCompletedStep?.stepName || currentStep?.stepName || "Recent HR movement",
		currentStepMeta: `Current status: ${formatMetadataLabel(state)}`,
	};
};

const mapRequestToTicketRow = (request: Request, section: TicketSectionKey): RequestTicketRow => {
	const state = getRequestState(request);
	const isDocument = request.type === "DOCUMENT_REQUEST";
	const isScheduleChange = request.type === "SCHEDULE_CHANGE";
	const isJobRequisition =
		request.type === "OTHER" &&
		String(getMetadataField(request, "requestSubtype") || "")
			.trim()
			.toUpperCase() === "DEPARTMENT_JOB_REQUISITION";
	const stepSummary = buildSectionStepSummary(request, section);
	const subject = getTicketSubject(request);

	return {
		...request,
		ticketCode: request.code || request.id,
		requestId: request.id,
		queueSection: section,
		ticketCategory: isDocument
			? "DOCUMENT"
			: isScheduleChange
				? "SCHEDULE_CHANGE"
			: isJobRequisition
				? "JOB_REQUISITION"
				: "PERSONNEL_ACTION",
		employeeName: getRequesterName(request),
		employeeId: request.requester?.employeeId || "No ID",
		subjectName: subject.name,
		subjectEmployeeId: subject.employeeId,
		subjectProfileId: subject.profileId,
		requestLabel: getRequestLabel(request),
		workflowStatus: state,
		requestedOn: request.createdAt || "",
		currentStep: stepSummary.currentStep,
		currentStepMeta: stepSummary.currentStepMeta,
		isDocumentGenerated: Boolean(getMetadataField(request, "documentNumber")),
		isReadyToGenerate: isReadyToGenerate(request),
	};
};

const getRequestsFromResponse = (data: unknown): Request[] =>
	(((data as { requests?: Request[] } | undefined)?.requests || []) as Request[]) ?? [];

const getTotalFromResponse = (data: unknown): number => {
	const typed = data as
		| {
				pagination?: { total?: number };
				count?: number;
		  }
		| undefined;
	return typed?.pagination?.total || typed?.count || 0;
};

const getTicketQueueBucket = (data: unknown, section: TicketSectionKey) =>
	(
		data as
			| {
					ticketQueues?: Record<
						TicketSectionKey,
						{ requests?: Request[]; count?: number }
					>;
			  }
			| undefined
	)?.ticketQueues?.[section];

const getTicketSummary = (data: unknown) =>
	(
		data as
			| {
					ticketSummary?: {
						pending?: number;
						total?: number;
						approval?: number;
						task?: number;
						recent?: number;
						categoryBreakdown?: {
							document?: number;
							personnelAction?: number;
							jobRequisition?: number;
							scheduleChange?: number;
						};
					};
			  }
			| undefined
	)?.ticketSummary;

const buildTicketTypeFilter = (ticketTypeParam?: string | null) => {
	if (ticketTypeParam === "document") return ["DOCUMENT_REQUEST"];
	if (ticketTypeParam === "job_requisition") return ["OTHER"];
	if (ticketTypeParam === "personnel_action") {
		return TICKET_REQUEST_TYPES.filter(
			(type) => type !== "DOCUMENT_REQUEST" && type !== "OTHER",
		);
	}
	return [...TICKET_REQUEST_TYPES];
};

const buildBaseFilters = (params: {
	ticketTypeParam?: string | null;
	departmentParam: string;
	managerParam: string;
}) => {
	const requestTypeFilter = buildTicketTypeFilter(params.ticketTypeParam);
	return [
		...requestTypeFilter.map((type) => `type:${type}`),
		...(params.departmentParam !== "all"
			? [`requester.departmentId:${params.departmentParam}`]
			: []),
		...(params.managerParam !== "all" ? [`requester.reportToId:${params.managerParam}`] : []),
		...(params.ticketTypeParam === "job_requisition"
			? ["metadata.requestSubtype:DEPARTMENT_JOB_REQUISITION"]
			: params.ticketTypeParam === "personnel_action"
				? ["metadata.requestSubtype!DEPARTMENT_JOB_REQUISITION"]
				: []),
	];
};

const buildSectionFilters = (
	section: TicketSectionKey,
	params: {
		ticketTypeParam?: string | null;
		departmentParam: string;
		managerParam: string;
	},
) => {
	const filters = buildBaseFilters(params);

	if (section === "approval") {
		return [
			...filters,
			"currentStepExecution.assigneeType:HR",
			"currentStepExecution.stepType!TASK",
			...ACTIVE_TICKET_STATES.map((state) => `currentWorkflowStateKey:${state}`),
		].join(",");
	}

	if (section === "task") {
		return [
			...filters,
			"currentStepExecution.assigneeType:HR",
			"currentStepExecution.stepType:TASK",
			...ACTIVE_HR_TASK_STATES.map((state) => `currentWorkflowStateKey:${state}`),
		].join(",");
	}

	return [
		...filters,
		"currentStepExecution:null",
		"stepExecutions.assigneeType:HR",
		...RECENT_TICKET_STATES.map((state) => `currentWorkflowStateKey:${state}`),
	].join(",");
};

function TicketQueueTable({
	rows,
	isLoading,
	title = "",
	description,
	emptyTitle,
	emptyDescription,
	actionsColumn,
	groupBy,
	customFilters,
	showSearch = false,
	searchValue,
	onSearch,
	showPagination = false,
	currentPage,
	totalPages,
	totalItems,
	itemsPerPage,
	onPageChange,
	alwaysShowPagination = false,
}: {
	rows: RequestTicketRow[];
	isLoading: boolean;
	title?: string;
	description?: string;
	emptyTitle: string;
	emptyDescription: string;
	actionsColumn: (row: RequestTicketRow) => ReactNode;
	groupBy?: GroupConfig;
	customFilters?: ReactNode;
	showSearch?: boolean;
	searchValue?: string;
	onSearch?: (value: string) => void;
	showPagination?: boolean;
	currentPage?: number;
	totalPages?: number;
	totalItems?: number;
	itemsPerPage?: number;
	onPageChange?: (page: number) => void;
	alwaysShowPagination?: boolean;
}) {
	const columns: Column<RequestTicketRow>[] = [
		{
			key: "employeeName",
			label: "Requester",
			width: "220px",
			sortable: false,
			render: (_value, row) => (
				<EmployeeTableCell
					profileId={row.requester?.id || row.requesterId}
					fullName={row.employeeName}
					employeeId={row.employeeId}
				/>
			),
		},
		{
			key: "subjectName",
			label: "Person Involved",
			width: "220px",
			sortable: false,
			render: (_value, row) => (
				<EmployeeTableCell
					profileId={row.subjectProfileId || undefined}
					fullName={row.subjectName}
					employeeId={row.subjectEmployeeId}
				/>
			),
		},
		{
			key: "requestLabel",
			label: "Request",
			width: "240px",
			sortable: false,
			render: (_value, row) => (
				<div className="min-w-0">
					<div className="truncate text-sm font-semibold text-gray-900">
						{row.requestLabel}
					</div>
					<div className="mt-0.5 truncate text-xs text-gray-500">
						{row.ticketCode || row.requestId}
					</div>
				</div>
			),
		},
		{
			key: "currentStep",
			label: "Current Step",
			width: "280px",
			sortable: false,
			render: (_value, row) => (
				<div className="min-w-0">
					<div className="text-sm text-gray-800 [overflow-wrap:anywhere]">
						{row.currentStep}
					</div>
					{row.currentStepMeta ? (
						<div className="mt-0.5 text-xs text-gray-500 [overflow-wrap:anywhere]">
							{row.currentStepMeta}
						</div>
					) : null}
				</div>
			),
		},
		{
			key: "workflowStatus",
			label: "Status",
			width: "130px",
			sortable: false,
			render: (_value, row) => (
				<Badge
					variant={getStatusBadge(row.workflowStatus).variant}
					className="whitespace-nowrap">
					{getStatusBadge(row.workflowStatus).label}
				</Badge>
			),
		},
		{
			key: "requestedOn",
			label: "Requested On",
			width: "150px",
			sortable: false,
			render: (_value, row) => (
				<span className="text-sm text-gray-600">{formatDate(row.requestedOn)}</span>
			),
		},
	];

	return (
		<DataTable
			title={title}
			description={description}
			data={rows}
			columns={columns}
			groupBy={groupBy}
			showSearch={showSearch}
			searchValue={searchValue}
			onSearch={onSearch}
			searchPlaceholder="Search request code, employee name, or employee ID..."
			showFilters={false}
			customFilters={customFilters}
			showExport={false}
			isLoading={isLoading}
			loadingRows={3}
			emptyMessage={emptyTitle}
			emptyDescription={emptyDescription}
			itemsPerPage={itemsPerPage || rows.length || LIST_LIMIT}
			showPagination={showPagination}
			currentPage={currentPage}
			totalItems={totalItems}
			totalPages={totalPages}
			onPageChange={onPageChange}
			alwaysShowPagination={alwaysShowPagination}
			renderActions={actionsColumn}
		/>
	);
}

export function HRTicketsPage() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();
	const action = searchParams.get("action");
	const urlRequestId = searchParams.get("id");
	const currentEmployeeId = user?.metadata?.employee?.id || "";
	const currentRole = String(user?.role || user?.metadata?.employee?.role || "")
		.trim()
		.toLowerCase();
	const [pendingDecision, setPendingDecision] = useState<"approve" | "reject" | null>(null);
	const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
	const [collapsedOverviewSections, setCollapsedOverviewSections] = useState<
		Set<TicketSectionKey>
	>(() => new Set<TicketSectionKey>(["recent"]));

	const viewMode = searchParams.get("view") === "list" ? "list" : "overview";
	const sectionParam = searchParams.get("section");
	const selectedSection: TicketSectionKey =
		sectionParam === "task" || sectionParam === "recent" ? sectionParam : "approval";
	const pageParam = Math.max(1, Number(searchParams.get("page")) || 1);
	const searchQuery = searchParams.get("search") || "";
	const ticketTypeParam = searchParams.get("ticketType");
	const departmentParam = searchParams.get("departmentId") || "all";
	const managerParam = searchParams.get("managerId") || "all";

	const updateSearchParams = useCallback((mutator: (params: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	}, [setSearchParams]);

	const sharedFilterParams = {
		ticketTypeParam,
		departmentParam,
		managerParam,
	};

	const ticketQueuesQuery = useHRTicketQueues({
		page: 1,
		limit: PREVIEW_LIMIT,
		queueLimit: PREVIEW_LIMIT,
		query: searchQuery || undefined,
		searchFields: "ticketCode,employeeName,employeeId",
		count: true,
		fields: TICKET_QUERY_FIELDS,
		sort: "createdAt",
		order: "desc",
		ticketType: ticketTypeParam || undefined,
		departmentId: departmentParam,
		managerId: managerParam,
	});

	const sectionListQuery = useRequests({
		page: pageParam,
		limit: LIST_LIMIT,
		query: searchQuery || undefined,
		searchFields: "ticketCode,employeeName,employeeId",
		count: true,
		filter: buildSectionFilters(selectedSection, sharedFilterParams),
		fields: TICKET_QUERY_FIELDS,
		sort: selectedSection === "recent" ? "lastCompletedStepExecution.completedAt" : "createdAt",
		order: "desc",
	});

	const { data: requestDetails, isLoading: isLoadingDetails } = useRequest(urlRequestId || "", {
		fields: TICKET_DETAIL_FIELDS,
	});

	const generateDocumentMutation = useGenerateDocument();
	const approveRequestMutation = useApproveRequest();

	const approvalRows = useMemo(
		() =>
			(getTicketQueueBucket(ticketQueuesQuery.data, "approval")?.requests || []).map(
				(request) => mapRequestToTicketRow(request, "approval"),
			),
		[ticketQueuesQuery.data],
	);
	const taskRows = useMemo(
		() =>
			(getTicketQueueBucket(ticketQueuesQuery.data, "task")?.requests || []).map((request) =>
				mapRequestToTicketRow(request, "task"),
			),
		[ticketQueuesQuery.data],
	);
	const recentRows = useMemo(
		() =>
			(getTicketQueueBucket(ticketQueuesQuery.data, "recent")?.requests || []).map(
				(request) => mapRequestToTicketRow(request, "recent"),
			),
		[ticketQueuesQuery.data],
	);
	const sectionRows = useMemo(
		() =>
			getRequestsFromResponse(sectionListQuery.data).map((request) =>
				mapRequestToTicketRow(request, selectedSection),
			),
		[selectedSection, sectionListQuery.data],
	);

	const knownRequests = useMemo(() => {
		const allRequests = [
			...(getTicketQueueBucket(ticketQueuesQuery.data, "approval")?.requests || []),
			...(getTicketQueueBucket(ticketQueuesQuery.data, "task")?.requests || []),
			...(getTicketQueueBucket(ticketQueuesQuery.data, "recent")?.requests || []),
			...getRequestsFromResponse(sectionListQuery.data),
		];

		const unique = new Map<string, Request>();
		for (const request of allRequests) {
			unique.set(request.id, request);
		}

		return Array.from(unique.values());
	}, [ticketQueuesQuery.data, sectionListQuery.data]);

	const selectedModalRequest = useMemo(
		() =>
			requestDetails ||
			(!isLoadingDetails
				? knownRequests.find((request) => request.id === urlRequestId) || null
				: null),
		[isLoadingDetails, knownRequests, requestDetails, urlRequestId],
	);
	const hasLoadedSelectedModalRequest =
		Boolean(urlRequestId) && requestDetails?.id === urlRequestId && !isLoadingDetails;

	const openSectionList = useCallback(
		(section: TicketSectionKey) => {
			updateSearchParams((next) => {
				next.set("view", "list");
				next.set("section", section);
				next.set("page", "1");
			});
		},
		[updateSearchParams],
	);

	const toggleOverviewSection = useCallback((section: TicketSectionKey) => {
		setCollapsedOverviewSections((prev) => {
			const next = new Set(prev);
			if (next.has(section)) {
				next.delete(section);
			} else {
				next.add(section);
			}
			return next;
		});
	}, []);

	const sectionCounts = useMemo(
		() => ({
			approval: getTicketQueueBucket(ticketQueuesQuery.data, "approval")?.count || 0,
			task: getTicketQueueBucket(ticketQueuesQuery.data, "task")?.count || 0,
			recent: getTicketQueueBucket(ticketQueuesQuery.data, "recent")?.count || 0,
		}),
		[ticketQueuesQuery.data],
	);
	const ticketSummary = useMemo(
		() => getTicketSummary(ticketQueuesQuery.data),
		[ticketQueuesQuery.data],
	);
	const ticketStats = useMemo(
		() => {
			const categoryBreakdown = ticketSummary?.categoryBreakdown || {};
			return [
				{
					label: "Pending HR work",
					value: ticketSummary?.pending ?? sectionCounts.approval + sectionCounts.task,
					meta: `${sectionCounts.approval} review / ${sectionCounts.task} task`,
				},
				{
					label: "Document tickets",
					value: categoryBreakdown.document || 0,
					meta: "COE and document issuance",
				},
				{
					label: "People changes",
					value:
						(categoryBreakdown.personnelAction || 0) +
						(categoryBreakdown.jobRequisition || 0) +
						(categoryBreakdown.scheduleChange || 0),
					meta: `${categoryBreakdown.personnelAction || 0} PAN / ${categoryBreakdown.jobRequisition || 0} requisition / ${categoryBreakdown.scheduleChange || 0} schedule`,
				},
				{
					label: "Recent outcomes",
					value: ticketSummary?.recent ?? sectionCounts.recent,
					meta: "Completed, rejected, cancelled",
				},
			];
		},
		[sectionCounts.approval, sectionCounts.recent, sectionCounts.task, ticketSummary],
	);
	const overviewSections = useMemo(
		() =>
			TICKET_SECTION_ORDER.map((section) => ({
				section,
				config: SECTION_CONFIG[section],
				rows:
					section === "approval"
						? approvalRows
						: section === "task"
							? taskRows
							: recentRows,
				total: sectionCounts[section],
			})),
		[approvalRows, recentRows, sectionCounts, taskRows],
	);
	const isLoadingOverview = ticketQueuesQuery.isLoading;
	const selectedSectionConfig = SECTION_CONFIG[selectedSection];
	const selectedSectionTotal = getTotalFromResponse(sectionListQuery.data);
	const selectedSectionPagination =
		(sectionListQuery.data as { pagination?: { totalPages?: number } } | undefined)
			?.pagination || undefined;

	const handleSearchChange = (value: string) => {
		updateSearchParams((next) => {
			if (value) {
				next.set("search", value);
			} else {
				next.delete("search");
			}
			next.delete("page");
		});
	};

	const handleSectionSelectChange = (value: string) => {
		updateSearchParams((next) => {
			next.set("view", "list");
			if (value === "task" || value === "recent") {
				next.set("section", value);
			} else {
				next.set("section", "approval");
			}
			next.set("page", "1");
		});
	};

	const returnToOverview = () => {
		updateSearchParams((next) => {
			next.delete("view");
			next.delete("section");
			next.delete("page");
		});
	};

	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	const handleCloseModal = () => {
		setPendingDecision(null);
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};

	const handleView = (item: RequestTicketRow) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", item.requestId);
		});
	};

	const openGeneratedJob = (request: Request | RequestTicketRow) => {
		const jobId = getGeneratedJobId(request);
		if (!jobId) {
			toast.error("No generated job was found for this requisition yet.");
			return;
		}

		navigate(`/hr/recruitment?jobAction=view&jobId=${jobId}`);
	};

	const openRecruitmentWorkspace = () => {
		navigate("/hr/recruitment?jobAction=list");
	};

	const openViewDocument = (request: Request) => {
		const requesterProfileId = request.requesterId || request.requester?.id;
		if (!requesterProfileId) {
			toast.error("Cannot open document: requester is missing.");
			return;
		}
		const docNum = getMetadataField(request, "documentNumber") || request.code;
		navigate(
			`/employee/${requesterProfileId}?tab=documents&action=view-doc&documentNumber=${docNum}`,
		);
	};

	const confirmGenerateDocument = () => {
		if (!urlRequestId) return;
		const item = requestDetails || knownRequests.find((request) => request.id === urlRequestId);
		if (!item) return;

		const docType = getMetadataField(item, "documentType");
		let backendDocType = "COE";

		if (docType) {
			const normalizedType = String(docType).toUpperCase().replace(/\s+/g, "_");
			if (normalizedType.includes("2316")) {
				backendDocType = "BIR_2316";
			}
		}

		generateDocumentMutation.mutate(
			{
				requestId: urlRequestId,
				type: backendDocType,
				year: backendDocType === "BIR_2316" ? parseInt(selectedYear, 10) : undefined,
			},
			{
				onSuccess: () => {
					setSelectedYear(new Date().getFullYear().toString());
					handleCloseModal();
				},
			},
		);
	};

	const handleApproveTicket = async (request: Request) => {
		setPendingDecision("approve");
		try {
			await approveRequestMutation.mutateAsync({
				id: request.id,
				action: "approve",
				comment: "Approved by HR",
			});
			handleCloseModal();
		} catch (error) {
			console.error("Error approving request from tickets page:", error);
		} finally {
			setPendingDecision(null);
		}
	};

	const handleRejectTicket = async (request: Request) => {
		setPendingDecision("reject");
		try {
			await approveRequestMutation.mutateAsync({
				id: request.id,
				action: "reject",
				comment: "Rejected by HR",
			});
			handleCloseModal();
		} catch (error) {
			console.error("Error rejecting request from tickets page:", error);
		} finally {
			setPendingDecision(null);
		}
	};

	const canActOnRequest = (request?: Request | null) =>
		canActOnTicketRequest(request, { currentEmployeeId, currentRole });

	const renderActionMenu = (item: RequestTicketRow) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="h-9 w-9 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={() => handleView(item)}>
					<Eye className="mr-2 h-4 w-4" />
					View Request
				</DropdownMenuItem>
				{canActOnRequest(item) ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => handleView(item)}
							className="text-emerald-700 focus:bg-emerald-50 focus:text-emerald-700">
							<CheckCircle className="mr-2 h-4 w-4" />
							Approve
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => handleView(item)}
							className="text-red-700 focus:bg-red-50 focus:text-red-700">
							<XCircle className="mr-2 h-4 w-4" />
							Reject
						</DropdownMenuItem>
					</>
				) : null}
				{canGenerateDocumentFromRequest(item) ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => handleView(item)}
							className="text-blue-600 focus:bg-blue-50 focus:text-blue-600">
							<FileText className="mr-2 h-4 w-4" />
							Generate Document
						</DropdownMenuItem>
					</>
				) : null}
				{canOpenGeneratedJobFromRequest(item) ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => openGeneratedJob(item)}
							className="text-indigo-600 focus:bg-indigo-50 focus:text-indigo-600">
							<ExternalLink className="mr-2 h-4 w-4" />
							Open Generated Job
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={openRecruitmentWorkspace}
							className="text-slate-700 focus:bg-slate-50 focus:text-slate-900">
							<Briefcase className="mr-2 h-4 w-4" />
							Open Recruitment
						</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);

	const renderRowActions = (row: RequestTicketRow) => {
		return <div className="flex items-center justify-end gap-2">{renderActionMenu(row)}</div>;
	};

	const renderTicketStats = () => (
		<div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
			<div className="grid divide-y divide-neutral-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
				{ticketStats.map((stat) => (
					<div key={stat.label} className="min-w-0 px-4 py-3">
						<div className="text-xs font-medium text-neutral-500">{stat.label}</div>
						<div className="mt-1 flex items-baseline gap-2">
							<span className="text-2xl font-semibold tabular-nums text-neutral-950">
								{isLoadingOverview ? "..." : stat.value}
							</span>
							<span className="truncate text-xs text-neutral-500">{stat.meta}</span>
						</div>
					</div>
				))}
			</div>
		</div>
	);

	const renderTicketOverviewTable = () => (
		<div className="space-y-3">
			{renderTicketStats()}
			{overviewSections.map(({ section, config, rows, total }) => {
				const isCollapsed = collapsedOverviewSections.has(section);
				const itemLabel = total === 1 ? "item" : "items";

				return (
					<div
						key={section}
						className="overflow-hidden rounded-md border border-neutral-200 bg-white">
						<button
							type="button"
							onClick={() => toggleOverviewSection(section)}
							className="flex w-full items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-left transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400">
							<div className="flex min-w-0 items-center gap-2">
								{isCollapsed ? (
									<ChevronRight className="h-4 w-4 shrink-0 text-gray-700" />
								) : (
									<ChevronDown className="h-4 w-4 shrink-0 text-gray-700" />
								)}
								<span className="truncate text-sm font-semibold text-gray-900">
									{config.title}
								</span>
							</div>
							<span className="shrink-0 text-xs font-semibold text-neutral-600">
								{total} {itemLabel}
							</span>
						</button>

						{!isCollapsed ? (
							<>
								<div className="overflow-x-auto">
									<table className="w-full min-w-[1120px] text-sm">
										<thead>
											<tr className="border-b border-neutral-200 bg-white text-left text-[10px] font-bold uppercase tracking-wide text-gray-600">
												<th className="w-[210px] px-3 py-2">Requester</th>
												<th className="w-[210px] px-3 py-2">
													Person Involved
												</th>
												<th className="w-[250px] px-3 py-2">Request</th>
												<th className="px-3 py-2">Current Step</th>
												<th className="w-[130px] px-3 py-2">Status</th>
												<th className="w-[145px] px-3 py-2">
													Requested On
												</th>
												<th className="w-[72px] px-3 py-2 text-right">
													Actions
												</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-neutral-100">
											{isLoadingOverview ? (
												<tr>
													<td
														colSpan={7}
														className="px-3 py-4 text-sm text-gray-500">
														Loading {config.title.toLowerCase()}...
													</td>
												</tr>
											) : rows.length > 0 ? (
												rows.map((row) => {
													const statusBadge = getStatusBadge(
														row.workflowStatus,
													);

													return (
														<tr
															key={`${section}-${row.requestId}`}
															className="bg-white hover:bg-neutral-50">
															<td className="px-3 py-2">
																<EmployeeTableCell
																	profileId={
																		row.requester?.id ||
																		row.requesterId
																	}
																	fullName={row.employeeName}
																	employeeId={row.employeeId}
																/>
															</td>
															<td className="px-3 py-2">
																<EmployeeTableCell
																	profileId={
																		row.subjectProfileId ||
																		undefined
																	}
																	fullName={row.subjectName}
																	employeeId={
																		row.subjectEmployeeId
																	}
																/>
															</td>
															<td className="px-3 py-2">
																<div className="min-w-0">
																	<div className="truncate text-sm font-semibold text-gray-900">
																		{row.requestLabel}
																	</div>
																	<div className="mt-0.5 truncate text-xs text-gray-500">
																		{row.ticketCode ||
																			row.requestId}
																	</div>
																</div>
															</td>
															<td className="px-3 py-2">
																<div className="min-w-0">
																	<div className="text-sm text-gray-800 [overflow-wrap:anywhere]">
																		{row.currentStep}
																	</div>
																	{row.currentStepMeta ? (
																		<div className="mt-0.5 text-xs text-gray-500 [overflow-wrap:anywhere]">
																			{row.currentStepMeta}
																		</div>
																	) : null}
																</div>
															</td>
															<td className="px-3 py-2">
																<Badge
																	variant={statusBadge.variant}
																	className="whitespace-nowrap">
																	{statusBadge.label}
																</Badge>
															</td>
															<td className="px-3 py-2 text-sm text-gray-600">
																{formatDate(row.requestedOn)}
															</td>
															<td className="px-3 py-2 text-right">
																{renderActionMenu(row)}
															</td>
														</tr>
													);
												})
											) : (
												<tr>
													<td
														colSpan={7}
														className="px-3 py-4 text-sm text-gray-500">
														{config.emptyTitle}
													</td>
												</tr>
											)}
										</tbody>
									</table>
								</div>
								<div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-3 py-2">
									<span className="text-xs font-medium text-gray-500">
										Showing recent {rows.length} of {total}
									</span>
									<button
										type="button"
										onClick={() => openSectionList(section)}
										className="text-xs font-bold text-neutral-700 underline-offset-4 transition-colors hover:text-orange-600 hover:underline">
										{config.viewAllLabel}
									</button>
								</div>
							</>
						) : null}
					</div>
				);
			})}
		</div>
	);

	return (
		<div className="space-y-6">
			{viewMode === "list" ? (
				<button
					type="button"
					onClick={returnToOverview}
					className="inline-flex w-fit items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-orange-600">
					<ArrowLeft className="h-4 w-4" />
					Back to HR work queue
				</button>
			) : null}

			{viewMode === "overview" ? (
				renderTicketOverviewTable()
			) : (
				<TicketQueueTable
					title={selectedSectionConfig.listTitle}
					description=""
					rows={sectionRows}
					isLoading={sectionListQuery.isLoading}
					emptyTitle={selectedSectionConfig.emptyTitle}
					emptyDescription={selectedSectionConfig.emptyDescription}
					actionsColumn={renderRowActions}
					showSearch
					searchValue={searchQuery}
					onSearch={handleSearchChange}
					customFilters={
						<div className="flex items-center gap-2">
							<span className="text-xs font-bold uppercase tracking-wide text-gray-500">
								Queue
							</span>
							<Select
								value={selectedSection}
								onValueChange={handleSectionSelectChange}>
								<SelectTrigger className="h-10 w-[200px] rounded-xl border-neutral-200 bg-white text-xs font-bold text-gray-700 shadow-sm">
									<SelectValue placeholder="Queue" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="approval">Needs HR Approval</SelectItem>
									<SelectItem value="task">Needs HR Task</SelectItem>
									<SelectItem value="recent">Recently Completed</SelectItem>
								</SelectContent>
							</Select>
						</div>
					}
					showPagination
					currentPage={pageParam}
					totalPages={selectedSectionPagination?.totalPages || 1}
					totalItems={selectedSectionTotal}
					itemsPerPage={LIST_LIMIT}
					onPageChange={handlePageChange}
					alwaysShowPagination
				/>
			)}

			<RequestReviewModal
				open={action === "view"}
				onOpenChange={(open: boolean) => {
					if (!open) handleCloseModal();
				}}
				request={selectedModalRequest}
				skipRequestFetch
				hideManagerApproval={!hasLoadedSelectedModalRequest}
				customActions={
					<>
						{canOpenGeneratedJobFromRequest(selectedModalRequest) ? (
							<Button
								variant="outline"
								className="h-10 flex-1 rounded-lg px-5 md:flex-none"
								onClick={() =>
									selectedModalRequest && openGeneratedJob(selectedModalRequest)
								}>
								<div className="flex items-center gap-2">
									<ExternalLink className="h-4 w-4" />
									<span>Open Generated Job</span>
								</div>
							</Button>
						) : null}

						{canGenerateDocumentFromRequest(selectedModalRequest) ? (
							<Button
								className="h-10 flex-1 rounded-lg px-5 md:flex-none"
								disabled={generateDocumentMutation.isPending || isLoadingDetails}
								onClick={confirmGenerateDocument}>
								<div className="flex items-center gap-2">
									<FileText className="h-4 w-4" />
									<span>
										{generateDocumentMutation.isPending
											? "Generating..."
											: "Generate Document"}
									</span>
								</div>
							</Button>
						) : canViewGeneratedDocumentFromRequest(selectedModalRequest) ? (
							<Button
								className="h-10 flex-1 rounded-lg px-5 md:flex-none"
								disabled={isLoadingDetails}
								onClick={() =>
									selectedModalRequest && openViewDocument(selectedModalRequest)
								}>
								<div className="flex items-center gap-2">
									<Eye className="h-4 w-4" />
									<span>View Document</span>
								</div>
							</Button>
						) : null}
					</>
				}
				onApprove={
					hasLoadedSelectedModalRequest &&
					selectedModalRequest &&
					canActOnRequest(selectedModalRequest)
						? (request) => {
								handleApproveTicket(request);
							}
						: undefined
				}
				onReject={
					hasLoadedSelectedModalRequest &&
					selectedModalRequest &&
					canActOnRequest(selectedModalRequest)
						? (request) => {
								handleRejectTicket(request);
							}
						: undefined
				}
				isApproving={pendingDecision === "approve" && approveRequestMutation.isPending}
				isRejecting={pendingDecision === "reject" && approveRequestMutation.isPending}
			/>
		</div>
	);
}
