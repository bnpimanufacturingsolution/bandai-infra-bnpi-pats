import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { RequestReviewModal } from "~/components/molecules/RequestReviewModal";
import { useRequests, useRequest, useApproveRequest } from "~/lib/hooks/useRequests";
import { useAuth } from "~/lib/hooks/use-auth";
import type { Request, RequestStatus } from "~/services/requests.service";
import { CheckCircle, Clock, Eye, MoreVertical, XCircle } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

const ACTIVE_STATES = ["OPEN", "SUBMITTED", "APPROVED"] as const;
const REQUEST_FIELDS =
	"id,code,requester.person.personalInfo,requester.employeeId,requester.position.title,requester.department.name,requester.id,requester.reportTo.id,requesterId,description,type,startDate,endDate,metadata,currentWorkflowStateKey,createdAt,currentStepExecution.stepName,currentStepExecution.stepNumber,currentStepExecution.assigneeType,currentStepExecution.assigneeId,currentStepExecution.status,currentStepExecution.assignee.id,currentStepExecution.assignee.person.personalInfo,currentStepExecution.assignee.employeeId,lastCompletedStepExecution.stepName,lastCompletedStepExecution.completedAt,lastCompletedStepExecution.assignee.person.personalInfo,lastCompletedStepExecution.assignee.employeeId";
const REQUEST_DETAIL_FIELDS =
	"id,code,requester.person.personalInfo,requester.employeeId,requester.position.title,requester.department.name,requester.id,requester.reportTo.id,requesterId,description,type,startDate,endDate,metadata,currentWorkflowStateKey,notes,attachments,createdAt,updatedAt,currentStepExecution.id,currentStepExecution.stepName,currentStepExecution.stepNumber,currentStepExecution.stepType,currentStepExecution.assigneeType,currentStepExecution.assigneeId,currentStepExecution.status,currentStepExecution.assignee.id,currentStepExecution.assignee.person.personalInfo,currentStepExecution.assignee.employeeId,lastCompletedStepExecution.id,lastCompletedStepExecution.stepName,lastCompletedStepExecution.completedAt,lastCompletedStepExecution.assignee.person.personalInfo,lastCompletedStepExecution.assignee.employeeId,stepExecutions.id,stepExecutions.stepNumber,stepExecutions.stepName,stepExecutions.stepType,stepExecutions.assigneeType,stepExecutions.status,stepExecutions.completedAt,stepExecutions.comments,stepExecutions.assignee.id,stepExecutions.assignee.employeeId,stepExecutions.assignee.person.personalInfo,stepExecutions.assignee.department.name,transactions";

const TAB_STATUS_FILTERS: Record<string, RequestStatus[]> = {
	submitted: ["SUBMITTED"],
	approved: ["APPROVED"],
	completed: ["COMPLETED"],
	rejected: ["REJECTED"],
	active: [...ACTIVE_STATES],
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
	LEAVE: "Leave Request",
	DOCUMENT_REQUEST: "Document Request",
	TIMESHEET: "Timesheet Request",
	EXPENSE_REIMBURSEMENT: "Expense Reimbursement",
	RESIGNATION: "Resignation",
	TERMINATION: "Termination",
	REGULARIZATION: "Regularization",
	PROMOTION: "Promotion",
	SALARY_CHANGE: "Salary Change",
	TRANSFER: "Transfer",
	SCHEDULE_CHANGE: "Schedule Change",
	OTHER: "General Request",
};

const STATUS_BADGE_VARIANTS: Record<
	string,
	"default" | "success" | "warning" | "destructive" | "secondary" | "outline"
> = {
	OPEN: "secondary",
	SUBMITTED: "warning",
	APPROVED: "success",
	COMPLETED: "success",
	REJECTED: "destructive",
	CANCELLED: "secondary",
};

const getRequestState = (request?: Request | null): RequestStatus =>
	(request?.currentWorkflowStateKey as RequestStatus) || "OPEN";

const getRequestTypeLabel = (request: Request) => {
	if (request.type === "TIMESHEET" && request.metadata?.timesheetAction === "EDIT_PERMISSION") {
		return "Timesheet Edit Permission";
	}

	return REQUEST_TYPE_LABELS[request.type] || request.type.replace(/_/g, " ");
};

const getRequesterName = (request?: Request | null) => {
	const firstName = request?.requester?.person?.personalInfo?.firstName || "";
	const lastName = request?.requester?.person?.personalInfo?.lastName || "";
	const fullName = `${firstName} ${lastName}`.trim();
	return fullName || "Unknown Employee";
};

const getCurrentAssigneeName = (request?: Request | null) => {
	const currentStep = request?.currentStepExecution;
	if (currentStep?.assignee?.person?.personalInfo) {
		const firstName = currentStep.assignee.person.personalInfo.firstName || "";
		const lastName = currentStep.assignee.person.personalInfo.lastName || "";
		return `${firstName} ${lastName}`.trim() || currentStep.assigneeType;
	}

	if (currentStep?.assigneeType === "SUPERVISOR") return "Supervisor";
	if (currentStep?.assigneeType === "HR") return "HR";
	if (currentStep?.assigneeType === "REQUESTER") return "Requester";
	return "Unassigned";
};

export default function EmployeeRequestsTab() {
	const { user } = useAuth();
	const currentEmployeeId = user?.metadata?.employee?.id || "";

	const [searchParams, setSearchParams] = useSearchParams();
	const [rejectionReason, setRejectionReason] = useState("");

	const action = searchParams.get("action");
	const requestId = searchParams.get("id");
	const activeTab = searchParams.get("tab") || "submitted";
	const activeStatusFilters = TAB_STATUS_FILTERS[activeTab] || TAB_STATUS_FILTERS.submitted;
	const assigneeFilter = currentEmployeeId
		? `currentStepExecution.assignee.id:${currentEmployeeId},currentStepExecution.stepType!TASK`
		: "";
	const statusFilter = activeStatusFilters
		.map((state) => `currentWorkflowStateKey:${state}`)
		.join(",");
	const requestFilter = [assigneeFilter, statusFilter].filter(Boolean).join(",");

	const updateSearchParams = (mutator: (params: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const setActiveTab = (tab: string) => {
		updateSearchParams((next) => {
			next.set("tab", tab);
		});
	};

	const { data: groupedRequestsData } = useRequests({
		enabled: Boolean(currentEmployeeId),
		page: 1,
		limit: 100,
		count: true,
		filter: assigneeFilter,
		sort: "createdAt",
		order: "desc",
		groupBy: "currentWorkflowStateKey",
		fields: "id,currentWorkflowStateKey",
	});

	const { data: requestsData, isLoading } = useRequests({
		enabled: Boolean(currentEmployeeId),
		page: 1,
		limit: 100,
		count: true,
		filter: requestFilter,
		sort: "createdAt",
		order: "desc",
		fields: REQUEST_FIELDS,
	});

	const { data: requestDetails, isLoading: isLoadingDetails } = useRequest(requestId || "", {
		fields: REQUEST_DETAIL_FIELDS,
	});
	const approveRequestMutation = useApproveRequest();

	const items = useMemo(() => {
		return requestsData?.requests || [];
	}, [requestsData?.requests]);

	const selectedRequest = useMemo(
		() => items.find((item) => item.id === requestId) || null,
		[items, requestId],
	);

	const modalRequest = requestDetails || selectedRequest;

	const canActOnRequest = (request?: Request | null) => {
		if (!request?.currentStepExecution) return false;
		const state = getRequestState(request);
		if (!ACTIVE_STATES.includes(state as (typeof ACTIVE_STATES)[number])) return false;

		return (
			request.currentStepExecution.assignee?.id === currentEmployeeId ||
			(request.currentStepExecution as { assigneeId?: string | null }).assigneeId ===
				currentEmployeeId
		);
	};

	const handleCloseModal = () => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
		setRejectionReason("");
	};

	const handleView = (request: Request) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", request.id);
		});
	};

	const handleApprove = async (request: Request) => {
		try {
			await approveRequestMutation.mutateAsync({
				id: request.id,
				action: "approve",
				comment: "Approved from HR approvals",
			});
			handleCloseModal();
		} catch (error) {
			console.error("Failed to approve request:", error);
		}
	};

	const handleReject = (request: Request) => {
		setRejectionReason("");
		updateSearchParams((next) => {
			next.set("action", "reject");
			next.set("id", request.id);
		});
	};

	const confirmReject = async () => {
		if (!requestId || !rejectionReason.trim()) return;

		try {
			await approveRequestMutation.mutateAsync({
				id: requestId,
				action: "reject",
				comment: rejectionReason,
			});
			handleCloseModal();
		} catch (error) {
			console.error("Failed to reject request:", error);
		}
	};

	const statusCounts = useMemo(() => {
		const grouped = (groupedRequestsData as any)?.requests as
			| Record<string, Request[]>
			| undefined;
		if (grouped && !Array.isArray(grouped)) {
			return {
				submitted: grouped.SUBMITTED?.length || 0,
				approved: grouped.APPROVED?.length || 0,
				completed: grouped.COMPLETED?.length || 0,
				rejected: grouped.REJECTED?.length || 0,
			};
		}

		const requests = ((groupedRequestsData as any)?.requests || []) as Request[];
		return {
			submitted: requests.filter((request) => getRequestState(request) === "SUBMITTED")
				.length,
			approved: requests.filter((request) => getRequestState(request) === "APPROVED").length,
			completed: requests.filter((request) => getRequestState(request) === "COMPLETED")
				.length,
			rejected: requests.filter((request) => getRequestState(request) === "REJECTED").length,
		};
	}, [groupedRequestsData]);

	const columns: Column<Request>[] = useMemo(
		() => [
			{
				key: "requester",
				label: "Requester",
				width: "220px",
				render: (_value, item) => (
					<EmployeeTableCell
						profileId={item.requester?.id || item.requesterId}
						fullName={getRequesterName(item)}
						employeeId={item.requester?.employeeId || "No employee ID"}
					/>
				),
			},
			{
				key: "type",
				label: "Request",
				width: "240px",
				render: (_value, item) => (
					<div className="min-w-0 space-y-0.5">
						<div className="truncate text-sm font-medium text-gray-900">
							{getRequestTypeLabel(item)}
						</div>
						<div className="truncate text-xs text-gray-500">
							{item.description || item.code || "No description"}
						</div>
					</div>
				),
			},
			{
				key: "currentWorkflowStateKey",
				label: "State",
				width: "130px",
				render: (_value, item) => {
					const state = getRequestState(item);
					return (
						<Badge variant={STATUS_BADGE_VARIANTS[state] || "secondary"}>
							{state.replace(/_/g, " ")}
						</Badge>
					);
				},
			},
			{
				key: "currentStepExecution",
				label: "Current Step",
				width: "220px",
				render: (_value, item) => (
					<div className="space-y-1">
						<div className="font-medium text-gray-900">
							{item.currentStepExecution?.stepName || "No active step"}
						</div>
						<div className="text-xs text-gray-500">
							{item.currentStepExecution
								? `Assigned to ${getCurrentAssigneeName(item)}`
								: "Awaiting final state"}
						</div>
					</div>
				),
			},
			{
				key: "createdAt",
				label: "Created",
				width: "140px",
				render: (value) =>
					value ? (
						<span className="text-sm text-gray-600">
							{new Date(String(value)).toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
								year: "numeric",
							})}
						</span>
					) : (
						<span className="text-sm text-gray-400">-</span>
					),
			},
		],
		[],
	);

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 gap-4 md:grid-cols-4">
				<button
					onClick={() => setActiveTab("submitted")}
					className={`rounded-xl border p-4 text-left transition-colors ${
						activeTab === "submitted"
							? "border-orange-200 bg-orange-50"
							: "border-gray-200 bg-white hover:bg-gray-50"
					}`}>
					<div className="mb-3 inline-flex rounded-lg bg-orange-100 p-2 text-orange-600">
						<Clock className="h-5 w-5" />
					</div>
					<div className="text-sm text-gray-500">Submitted</div>
					<div className="text-2xl font-semibold text-gray-900">
						{statusCounts.submitted}
					</div>
				</button>
				<button
					onClick={() => setActiveTab("approved")}
					className={`rounded-xl border p-4 text-left transition-colors ${
						activeTab === "approved"
							? "border-orange-200 bg-orange-50"
							: "border-gray-200 bg-white hover:bg-gray-50"
					}`}>
					<div className="mb-3 inline-flex rounded-lg bg-green-100 p-2 text-green-600">
						<CheckCircle className="h-5 w-5" />
					</div>
					<div className="text-sm text-gray-500">Approved</div>
					<div className="text-2xl font-semibold text-gray-900">
						{statusCounts.approved}
					</div>
				</button>
				<button
					onClick={() => setActiveTab("completed")}
					className={`rounded-xl border p-4 text-left transition-colors ${
						activeTab === "completed"
							? "border-orange-200 bg-orange-50"
							: "border-gray-200 bg-white hover:bg-gray-50"
					}`}>
					<div className="mb-3 inline-flex rounded-lg bg-emerald-100 p-2 text-emerald-600">
						<CheckCircle className="h-5 w-5" />
					</div>
					<div className="text-sm text-gray-500">Completed</div>
					<div className="text-2xl font-semibold text-gray-900">
						{statusCounts.completed}
					</div>
				</button>
				<button
					onClick={() => setActiveTab("rejected")}
					className={`rounded-xl border p-4 text-left transition-colors ${
						activeTab === "rejected"
							? "border-orange-200 bg-orange-50"
							: "border-gray-200 bg-white hover:bg-gray-50"
					}`}>
					<div className="mb-3 inline-flex rounded-lg bg-red-100 p-2 text-red-600">
						<XCircle className="h-5 w-5" />
					</div>
					<div className="text-sm text-gray-500">Rejected</div>
					<div className="text-2xl font-semibold text-gray-900">
						{statusCounts.rejected}
					</div>
				</button>
			</div>

			<DataTable
				title="Employee Requests"
				description="Open View Details to review the request, then approve or reject from the modal."
				data={items}
				columns={columns}
				searchFields={["code", "description", "type"]}
				isLoading={isLoading}
				itemsPerPage={10}
				renderActions={(item) => {
					const canAct = canActOnRequest(item);

					return (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="sm" className="h-8 w-8 p-0">
									<MoreVertical className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-48">
								<DropdownMenuItem onClick={() => handleView(item)}>
									<Eye className="mr-2 h-4 w-4" />
									View Details
								</DropdownMenuItem>
								{canAct ? (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem onClick={() => handleView(item)}>
											<CheckCircle className="mr-2 h-4 w-4 text-green-600" />
											Approve
										</DropdownMenuItem>
										<DropdownMenuItem onClick={() => handleView(item)}>
											<XCircle className="mr-2 h-4 w-4 text-red-600" />
											Reject
										</DropdownMenuItem>
									</>
								) : null}
							</DropdownMenuContent>
						</DropdownMenu>
					);
				}}
				emptyMessage={`No ${activeTab} requests`}
				emptyDescription="Requests will appear here when they enter this workflow state."
			/>

			<RequestReviewModal
				open={action === "view"}
				onOpenChange={(open) => {
					if (!open) {
						handleCloseModal();
					}
				}}
				request={modalRequest || null}
				onApprove={canActOnRequest(modalRequest) ? handleApprove : undefined}
				onReject={canActOnRequest(modalRequest) ? handleReject : undefined}
				isApproving={approveRequestMutation.isPending}
				isRejecting={approveRequestMutation.isPending}
			/>

			<Modal
				open={action === "reject"}
				onOpenChange={(open) => {
					if (!open) {
						handleCloseModal();
					}
				}}
				title="Reject Request"
				description="Add a note explaining why this request is being rejected.">
				<div className="space-y-4">
					<div>
						<label className="mb-1 block text-sm font-medium text-gray-700">
							Rejection Reason
						</label>
						<textarea
							className="min-h-[120px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
							value={rejectionReason}
							onChange={(event) => setRejectionReason(event.target.value)}
							placeholder="Enter rejection reason..."
						/>
					</div>
					<div className="flex justify-end gap-3">
						<Button variant="outline" onClick={handleCloseModal}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={confirmReject}
							disabled={approveRequestMutation.isPending || !rejectionReason.trim()}>
							{approveRequestMutation.isPending ? "Rejecting..." : "Confirm Reject"}
						</Button>
					</div>
				</div>
			</Modal>

			{action === "view" && isLoadingDetails && !modalRequest && (
				<div className="text-sm text-gray-500">Loading request details...</div>
			)}
		</div>
	);
}
