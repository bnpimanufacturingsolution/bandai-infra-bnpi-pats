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
		<Card id={`dashboard-${type}`}>
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle className="flex items-center gap-2">
						{type === "my-requests" ? (
							<Hourglass className="w-5 h-5 text-orange-500" />
						) : (
							<FileText className="w-5 h-5 text-orange-500" />
						)}
						{title}
					</CardTitle>
					<button
						onClick={() => navigate(viewAllPath)}
						className="text-gray-600 text-sm hover:text-gray-800">
						View All &gt;
					</button>
				</div>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="space-y-3">
						{[1, 2, 3].map((item) => (
							<div
								key={item}
								className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
								<Skeleton className="w-5 h-5 rounded" />
								<div className="flex-1 space-y-2">
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-3 w-24" />
								</div>
								<Skeleton className="w-16 h-6 rounded-full" />
							</div>
						))}
					</div>
				) : approvalItems.length === 0 ? (
					<div className="flex items-center justify-center h-32">
						<div className="text-gray-600 text-sm">No requests found</div>
					</div>
				) : (
					<div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
						{approvalItems.map((item) => (
							<div
								key={item.id}
								onClick={() => openRequest(item.id)}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										openRequest(item.id);
									}
								}}
								role="button"
								tabIndex={0}
								className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
								<div className="flex items-center gap-3 flex-1 min-w-0">
									<FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
									<div className="min-w-0">
										<p className="text-sm font-medium text-gray-900 truncate">
											{item.title}
										</p>
										<p className="text-xs text-gray-600 truncate">
											{item.description}
										</p>
										{!isMyRequests && item.requesterName && (
											<p className="text-xs text-gray-500 mt-1 truncate">
												By:{" "}
												{item.requesterId ? (
													<button
														type="button"
														onClick={(event) =>
															openRequesterProfile(
																event,
																item.requesterId,
															)
														}
														className="text-gray-700 hover:text-orange-700 hover:underline cursor-pointer">
														{item.requesterName}
													</button>
												) : (
													item.requesterName
												)}
											</p>
										)}
									</div>
								</div>
								<span
									className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ml-2 ${getRequestStatusClasses(item.state)}`}>
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
