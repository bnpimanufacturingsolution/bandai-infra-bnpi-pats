import { FileText, Hourglass } from "lucide-react";
import { useMemo, type MouseEvent } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Skeleton } from "~/components/ui/skeleton";
import { useRequests } from "~/lib/hooks/useRequests";
import {
	getEmployeeRequestNavigationPath,
	getRequestDescription,
	getRequestState,
	getRequestStatusClasses,
	getRequestStatusLabel,
	getRequestTypeLabel,
	getTimesheetDeepLink,
} from "../request-helpers";
import type { Request } from "~/services/requests.service";

interface RequestListCardProps {
	type: "my-requests" | "pending-approvals" | "hr-approvals";
	employeeId?: string;
}

const isTimesheetSubmissionRequest = (request: Request) =>
	request.type === "TIMESHEET" &&
	String(request.metadata?.timesheetAction || "").toUpperCase() === "SUBMISSION";

export function RequestListCard({ type, employeeId }: RequestListCardProps) {
	const navigate = useNavigate();
	const isMyRequests = type === "my-requests";
	const isPendingApprovals = type === "pending-approvals";
	const isHrApprovals = type === "hr-approvals";

	const requestFilter = useMemo(() => {
		if (type === "my-requests") {
			return employeeId
				? {
						page: 1,
						limit: 5,
						count: false,
						fields:
							"id,type,currentWorkflowStateKey,description,startDate,endDate,metadata,requesterId,requester.id,requester.person.personalInfo",
						filter: { requesterId: employeeId },
					}
				: undefined;
		}

		if (type === "pending-approvals") {
			return employeeId
				? {
						page: 1,
						limit: 5,
						count: false,
						fields:
							"id,type,currentWorkflowStateKey,description,startDate,endDate,metadata,requesterId,requester.id,requester.employeeId,requester.reportTo.id,requester.person.personalInfo,currentStepExecution.id,currentStepExecution.stepType,currentStepExecution.assignee.id,currentStepExecution.assignee.employeeId,currentStepExecution.assigneeType",
						filter: {
							currentWorkflowStateKey: "SUBMITTED",
						},
					}
				: undefined;
		}

		return {
			page: 1,
			limit: 5,
			count: false,
			fields:
				"id,type,currentWorkflowStateKey,description,startDate,endDate,metadata,requesterId,requester.id,requester.employeeId,requester.reportTo.id,requester.person.personalInfo,currentStepExecution.id,currentStepExecution.stepType,currentStepExecution.assignee.id,currentStepExecution.assignee.employeeId,currentStepExecution.assigneeType",
			filter: {},
		};
	}, [type, employeeId]);

	const { data, isLoading } = useRequests(requestFilter);

	const requests = useMemo(() => {
		const baseRequests = data?.requests || [];
		if (!employeeId) {
			return baseRequests;
		}

		if (isPendingApprovals) {
			return baseRequests.filter(
				(request) => request.currentStepExecution?.assignee?.id === employeeId,
			);
		}

		if (isHrApprovals) {
			return baseRequests.filter((request) => {
				const assignedApproverId = request.currentStepExecution?.assignee?.id;
				return Boolean(assignedApproverId && assignedApproverId === employeeId);
			});
		}

		return baseRequests;
	}, [data?.requests, employeeId, isHrApprovals, isPendingApprovals]);

	const approvalItems = useMemo(
		() =>
			requests.slice(0, 5).map((request) => ({
				id: request.id,
				title: getRequestTypeLabel(request),
				description: getRequestDescription(request),
				state: getRequestState(request),
				requesterName: request.requester?.person?.personalInfo
					? `${request.requester.person.personalInfo.firstName || ""} ${request.requester.person.personalInfo.lastName || ""}`.trim() ||
						"N/A"
					: undefined,
				requesterId: request.requester?.id || undefined,
				isTimesheetSubmission: isTimesheetSubmissionRequest(request),
			})),
		[requests],
	);

	const title =
		type === "my-requests"
			? "My Requests"
			: type === "pending-approvals"
				? "Pending Approvals"
				: "HR Approvals Queue";
	const viewAllPath =
		type === "my-requests"
			? "/employee/requests"
			: type === "pending-approvals"
				? "/employee/approvals/requests"
				: "/hr/approvals/requests";

	const openRequest = (requestId: string) => {
		const request = requests.find((item) => item.id === requestId);
		if (!request) return;

		if (type === "my-requests") {
			const timesheetDeepLink = getTimesheetDeepLink(request);
			if (timesheetDeepLink) {
				navigate(timesheetDeepLink);
				return;
			}
		}

		if (isTimesheetSubmissionRequest(request)) {
			const basePath = type === "hr-approvals" ? "/hr/approvals/requests" : "/employee/approvals/requests";
			navigate(`${basePath}?action=timesheet.review&id=${requestId}`);
			return;
		}

		if (type === "pending-approvals") {
			navigate(`/employee/approvals/requests?action=view&id=${requestId}`);
			return;
		}
		if (type === "hr-approvals") {
			if (request.type === "DOCUMENT_REQUEST") {
				navigate(`/hr/requests/documents?action=view&id=${requestId}`);
				return;
			}
			navigate(`/hr/approvals/requests?action=view&id=${requestId}`);
			return;
		}
		navigate(getEmployeeRequestNavigationPath(request));
	};

	const openRequesterProfile = (
		event: MouseEvent<HTMLButtonElement>,
		requesterId?: string | null,
	) => {
		event.stopPropagation();
		if (!requesterId) return;
		navigate(`/employee/${requesterId}`);
	};

	return (
		<Card id={`dashboard-${type}`} className="gap-4 py-4">
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						{type === "my-requests" ? (
							<Hourglass className="h-4 w-4 text-gray-400" />
						) : (
							<FileText className="h-4 w-4 text-gray-400" />
						)}
						{title}
					</CardTitle>
					<button
						onClick={() => navigate(viewAllPath)}
						className="text-xs text-gray-400 hover:text-gray-600">
						View all →
					</button>
				</div>
			</CardHeader>
			<CardContent className="pt-0">
				{isLoading ? (
					<div className="space-y-1.5">
						{[1, 2, 3].map((item) => (
							<div
								key={item}
								className="flex items-center gap-2 rounded-lg border border-gray-100 p-2">
								<Skeleton className="h-4 w-4 rounded" />
								<div className="flex-1 space-y-1.5">
									<Skeleton className="h-3.5 w-28" />
									<Skeleton className="h-3 w-20" />
								</div>
								<Skeleton className="h-5 w-14 rounded-full" />
							</div>
						))}
					</div>
				) : approvalItems.length === 0 ? (
					<div className="flex h-20 items-center justify-center text-sm text-gray-500">
						No requests
					</div>
				) : (
					<div className="max-h-[210px] divide-y divide-gray-100 overflow-y-auto pr-1 text-sm">
						{approvalItems.map((item) => (
							<div
								key={item.id}
								onClick={() => openRequest(item.id)}
								className="flex cursor-pointer items-center justify-between gap-2 py-1.5 hover:bg-gray-50 -mx-1 px-1 rounded transition-colors">
								<div className="flex min-w-0 items-center gap-2 flex-1">
									<FileText className="h-4 w-4 shrink-0 text-gray-400" />
									<div className="min-w-0">
										<p className="truncate font-medium text-gray-900">{item.title}</p>
										{item.description && (
											<p className="truncate text-xs text-gray-500">{item.description}</p>
										)}
									</div>
								</div>
								<span
									className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${getRequestStatusClasses(item.state)}`}>
									{getRequestStatusLabel(item.state)}
								</span>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
