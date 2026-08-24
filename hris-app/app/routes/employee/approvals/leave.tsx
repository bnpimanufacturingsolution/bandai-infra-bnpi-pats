import { useState, useMemo, type ReactNode } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { formatDateTime, formatDateForExport } from "~/lib/utils/text-utils";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Eye, CheckCircle, XCircle, Clock, AlertCircle, User } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams, useNavigate } from "react-router";
import { useRequests, useRequest, useApproveRequest } from "~/lib/hooks/useRequests";
import type { Request, RequestStatus } from "~/services/requests.service";
import { useAuth } from "~/lib/hooks/use-auth";

// Helper function to calculate total days
const calculateTotalDays = (startDate?: string, endDate?: string): number | null => {
	if (!startDate || !endDate) return null;
	const start = new Date(startDate);
	const end = new Date(endDate);
	const diffTime = Math.abs(end.getTime() - start.getTime());
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
	return diffDays;
};

// Helper function to get metadata field
const getMetadataField = (request: Request, field: string): any => {
	if (!request.metadata || typeof request.metadata !== "object") return null;
	return request.metadata?.[field] ?? null;
};

const getRequestState = (request?: Request | null): RequestStatus =>
	(request?.currentWorkflowStateKey as RequestStatus) || "PENDING";

interface DetailItemProps {
	label: string;
	value?: ReactNode;
	className?: string;
}

const DetailItem = ({ label, value, className }: DetailItemProps) => (
	<div className={`space-y-1 ${className ?? ""}`}>
		<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
		<div className="text-sm leading-relaxed text-gray-900">
			{value ?? <span className="text-gray-400">Not specified</span>}
		</div>
	</div>
);

export default function LeaveApprovalsPage() {
	const { user } = useAuth();
	const navigate = useNavigate();

	// URL search params for deep-linked tabs
	const [searchParams, setSearchParams] = useSearchParams();
	const activeTab = (searchParams.get("tab") as RequestStatus) || "PENDING";

	const [isViewModalOpen, setIsViewModalOpen] = useState(false);
	const [viewing, setViewing] = useState<Request | null>(null);
	const [approvingId, setApprovingId] = useState<string | null>(null);
	const [rejectingId, setRejectingId] = useState<string | null>(null);
	const [approvalModal, setApprovalModal] = useState<{
		open: boolean;
		request: Request | null;
	}>({
		open: false,
		request: null,
	});
	const [rejectionModal, setRejectionModal] = useState<{
		open: boolean;
		requestId: string | null;
	}>({
		open: false,
		requestId: null,
	});
	const [rejectionReason, setRejectionReason] = useState("");

	// Helper to change tabs
	const setActiveTab = (tab: RequestStatus) => {
		setSearchParams({ tab });
	};

	// Fetch LEAVE requests assigned to this user
	const { data: requestsData, isLoading } = useRequests({
		page: 1,
		limit: 100,
		count: true,
		filter: {
			type: "LEAVE",
			currentWorkflowStateKey: activeTab,
			"stepExecutions.assigneeId": user?.metadata?.employee?.id,
		},
	});

	const items = (requestsData as any)?.requests || [];

	// Hook to fetch request details for view modal
	const { data: requestDetails, isLoading: isLoadingDetails } = useRequest(viewing?.id || "");

	// Mutation hooks
	const approveRequestMutation = useApproveRequest();

	// Handler to view employee profile
	const handleViewProfile = (request: Request) => {
		const employeeId = (request as any)?.requester?.id;
		if (employeeId) {
			navigate(`/employee/${employeeId}?from=employee-approvals`);
		} else {
			toast.error("Employee information not available");
		}
	};

	// Define filter options
	const filterOptions: FilterOption[] = [];

	// Get status badge
	const getStatusBadge = (status: RequestStatus) => {
		const statusStyles: Record<
			RequestStatus,
			{ variant: "success" | "secondary" | "destructive" | "default"; label: string }
		> = {
			PENDING: { variant: "default", label: "Pending" },
			PROCESSING: { variant: "default", label: "Processing" },
			APPROVED: { variant: "success", label: "Approved" },
			COMPLETED: { variant: "success", label: "Completed" },
			REJECTED: { variant: "destructive", label: "Rejected" },
			CANCELLED: { variant: "secondary", label: "Cancelled" },
		};
		return statusStyles[status] || { variant: "default", label: status };
	};

	// Define table columns - similar to leave requests page
	const columns: Column<Request>[] = useMemo(
		() => [
			{
				key: "code",
				label: "Code",
				width: "120px",
				render: (value) => (
					<span className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
						{value || "N/A"}
					</span>
				),
			},
			{
				key: "requester",
				label: "Requester",
				width: "180px",
				render: (_value, item) => {
					const requester = (item as any).requester;
					const firstName = requester?.person?.personalInfo?.firstName || "";
					const lastName = requester?.person?.personalInfo?.lastName || "";
					const fullName = `${firstName} ${lastName}`.trim();

					return (
						<EmployeeTableCell
							profileId={requester?.id || item.requesterId}
							fullName={fullName || null}
							employeeId={requester?.employeeId || null}
						/>
					);
				},
			},
			{
				key: "currentWorkflowStateKey",
				label: "Status",
				width: "120px",
				render: (_value, item) => {
					const statusBadge = getStatusBadge(getRequestState(item));
					return <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>;
				},
			},
			{
				key: "startDate",
				label: "Start Date",
				width: "130px",
				render: (value) => (
					<span className="text-gray-900">
						{value ? formatDateForExport(value as string) : "-"}
					</span>
				),
			},
			{
				key: "endDate",
				label: "End Date",
				width: "130px",
				render: (value) => (
					<span className="text-gray-900">
						{value ? formatDateForExport(value as string) : "-"}
					</span>
				),
			},
			{
				key: "totalDays",
				label: "Total Days",
				width: "110px",
				render: (value, item) => {
					const totalDays =
						calculateTotalDays(item.startDate, item.endDate) ??
						getMetadataField(item, "totalDays");
					if (totalDays === null) return <span className="text-gray-400">-</span>;
					return <span className="font-medium text-gray-900">{totalDays} days</span>;
				},
			},
			{
				key: "leaveType",
				label: "Leave Type",
				width: "150px",
				render: (value, item) => {
					const leaveType = getMetadataField(item, "leaveType");
					return <span className="text-gray-600">{leaveType || "-"}</span>;
				},
			},
		],
		[],
	);

	const handleView = (item: Request) => {
		setViewing(item);
		setIsViewModalOpen(true);
	};

	const handleApproveClick = (item: Request) => {
		setApprovalModal({ open: true, request: item });
	};

	const handleApproveConfirm = async () => {
		if (!approvalModal.request) return;

		setApprovingId(approvalModal.request.id);
		try {
			await approveRequestMutation.mutateAsync({
				id: approvalModal.request.id,
				action: "approve",
			});
			toast.success("Leave request approved successfully");
			setApprovalModal({ open: false, request: null });
		} catch (error: any) {
			toast.error(error?.message || "Failed to approve leave request");
		} finally {
			setApprovingId(null);
		}
	};

	const handleReject = (item: Request) => {
		setRejectionModal({ open: true, requestId: item.id });
	};

	const handleRejectConfirm = async () => {
		if (!rejectionModal.requestId) return;

		setRejectingId(rejectionModal.requestId);
		try {
			await approveRequestMutation.mutateAsync({
				id: rejectionModal.requestId,
				action: "reject",
				comment: rejectionReason || undefined,
			});
			toast.success("Leave request rejected successfully");
			setRejectionModal({ open: false, requestId: null });
			setRejectionReason("");
		} catch (error: any) {
			toast.error(error?.message || "Failed to reject leave request");
		} finally {
			setRejectingId(null);
		}
	};

	// Custom actions renderer - show different buttons based on active tab
	const renderActions = (item: Request) => {
		// For pending requests, show approve/reject buttons and view profile
		if (activeTab === "PENDING") {
			return (
				<div className="flex items-center gap-2">
					<Button variant="outline" size="sm" onClick={() => handleViewProfile(item)}>
						<User className="h-4 w-4 mr-1" />
						Profile
					</Button>
					<Button variant="outline" size="sm" onClick={() => handleView(item)}>
						<Eye className="h-4 w-4 mr-1" />
						View
					</Button>
					<Button
						size="sm"
						className="bg-green-600 hover:bg-green-700 text-white"
						onClick={() => handleApproveClick(item)}
						disabled={approvingId === item.id}>
						<CheckCircle className="h-4 w-4 mr-1" />
						{approvingId === item.id ? "Approving..." : "Approve"}
					</Button>
					<Button
						size="sm"
						variant="outline"
						className="text-red-600 border-red-600 hover:bg-red-50"
						onClick={() => handleReject(item)}
						disabled={rejectingId === item.id}>
						<XCircle className="h-4 w-4 mr-1" />
						Reject
					</Button>
				</div>
			);
		}

		// For approved/rejected requests, show view profile and view buttons
		return (
			<div className="flex items-center gap-2">
				<Button variant="outline" size="sm" onClick={() => handleViewProfile(item)}>
					<User className="h-4 w-4 mr-1" />
					Profile
				</Button>
				<Button variant="outline" size="sm" onClick={() => handleView(item)}>
					<Eye className="h-4 w-4 mr-1" />
					View
				</Button>
			</div>
		);
	};

	return (
		<div className="space-y-6">
			{/* Page Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Leave Approvals</h1>
					<p className="text-gray-600">Review and approve leave requests</p>
				</div>
			</div>

			{/* Tab Navigation */}
			<div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
				<button
					onClick={() => setActiveTab("PENDING")}
					className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
						activeTab === "PENDING"
							? "bg-white text-orange-600 shadow-sm"
							: "text-gray-600 hover:text-gray-900"
					}`}>
					<div className="flex items-center justify-center gap-2">
						<Clock className="w-4 h-4" />
						Pending
					</div>
				</button>
				<button
					onClick={() => setActiveTab("APPROVED")}
					className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
						activeTab === "APPROVED"
							? "bg-white text-orange-600 shadow-sm"
							: "text-gray-600 hover:text-gray-900"
					}`}>
					<div className="flex items-center justify-center gap-2">
						<CheckCircle className="w-4 h-4" />
						Approved
					</div>
				</button>
				<button
					onClick={() => setActiveTab("REJECTED")}
					className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
						activeTab === "REJECTED"
							? "bg-white text-orange-600 shadow-sm"
							: "text-gray-600 hover:text-gray-900"
					}`}>
					<div className="flex items-center justify-center gap-2">
						<XCircle className="w-4 h-4" />
						Rejected
					</div>
				</button>
			</div>

			<DataTable
				title=""
				description=""
				data={items}
				columns={columns}
				filters={filterOptions}
				searchFields={["code"]}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage={
					activeTab === "PENDING"
						? "No pending leave requests"
						: activeTab === "APPROVED"
							? "No approved leave requests"
							: "No rejected leave requests"
				}
				emptyDescription={
					activeTab === "PENDING"
						? "All leave requests have been processed."
						: activeTab === "APPROVED"
							? "You haven't approved any leave requests yet."
							: "You haven't rejected any leave requests yet."
				}
				searchWidth="w-80"
				itemsPerPage={10}
			/>

			{/* View Details Modal */}
			<Modal
				open={isViewModalOpen}
				onOpenChange={(open) => {
					setIsViewModalOpen(open);
					if (!open) {
						setViewing(null);
					}
				}}
				title="Leave Request Details"
				description="Review leave request information">
				{isLoadingDetails ? (
					<div className="flex items-center justify-center py-8">
						<div className="text-gray-500">Loading request details...</div>
					</div>
				) : requestDetails ? (
					<div className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<DetailItem
								label="Requester"
								value={
									<EmployeeTableCell
										profileId={
											requestDetails.requester?.id ||
											requestDetails.requesterId
										}
										fullName={`${requestDetails.requester?.person?.personalInfo?.firstName || ""} ${requestDetails.requester?.person?.personalInfo?.lastName || ""}`.trim()}
										employeeId={requestDetails.requester?.employeeId || null}
									/>
								}
							/>
							<DetailItem
								label="Request Code"
								value={
									<span className="font-mono text-sm">
										{requestDetails.code || requestDetails.id}
									</span>
								}
							/>
							<DetailItem
								label="Status"
								value={
									<Badge
										variant={
											getStatusBadge(getRequestState(requestDetails)).variant
										}>
										{getStatusBadge(getRequestState(requestDetails)).label}
									</Badge>
								}
							/>
							<DetailItem
								label="Start Date"
								value={
									requestDetails.startDate
										? formatDateTime(requestDetails.startDate)
										: undefined
								}
							/>
							<DetailItem
								label="End Date"
								value={
									requestDetails.endDate
										? formatDateTime(requestDetails.endDate)
										: undefined
								}
							/>
							<DetailItem
								label="Total Days"
								value={(() => {
									const totalDays =
										calculateTotalDays(
											requestDetails.startDate,
											requestDetails.endDate,
										) ?? getMetadataField(requestDetails, "totalDays");
									return totalDays !== null ? `${totalDays} days` : undefined;
								})()}
							/>
							<DetailItem
								label="Leave Type"
								value={getMetadataField(requestDetails, "leaveType")}
							/>
						</div>

						<DetailItem
							className="md:col-span-2"
							label="Description"
							value={
								requestDetails.description ? (
									<p className="whitespace-pre-line text-sm text-gray-900">
										{requestDetails.description}
									</p>
								) : undefined
							}
						/>

						{requestDetails.notes && (
							<DetailItem
								className="md:col-span-2"
								label="Notes"
								value={
									<p className="whitespace-pre-line text-sm text-gray-900">
										{requestDetails.notes}
									</p>
								}
							/>
						)}

						<div className="flex justify-end gap-3 pt-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setIsViewModalOpen(false)}>
								Close
							</Button>
						</div>
					</div>
				) : (
					<div className="flex items-center justify-center py-8">
						<div className="text-gray-500">Failed to load request details</div>
					</div>
				)}
			</Modal>

			{/* Rejection Modal */}
			<Modal
				open={rejectionModal.open}
				onOpenChange={(open) => {
					if (!open) {
						setRejectionModal({ open: false, requestId: null });
						setRejectionReason("");
					}
				}}
				title="Reject Leave Request"
				description="Provide a reason for rejecting this leave request">
				<div className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Rejection Reason (optional)
						</label>
						<textarea
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[100px]"
							placeholder="Enter reason for rejection..."
							value={rejectionReason}
							onChange={(e) => setRejectionReason(e.target.value)}
						/>
					</div>
					<div className="flex justify-end gap-3 pt-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								setRejectionModal({ open: false, requestId: null });
								setRejectionReason("");
							}}
							disabled={rejectingId !== null}>
							Cancel
						</Button>
						<Button
							type="button"
							className="bg-red-600 hover:bg-red-700 text-white"
							onClick={handleRejectConfirm}
							disabled={rejectingId !== null}>
							{rejectingId !== null ? "Rejecting..." : "Reject Request"}
						</Button>
					</div>
				</div>
			</Modal>

			{/* Approval Modal */}
			<Modal
				open={approvalModal.open}
				onOpenChange={(open) => {
					if (!open) {
						setApprovalModal({ open: false, request: null });
					}
				}}
				title="Approve Leave Request"
				description="Confirm approval before sending to HR for final review.">
				{approvalModal.request ? (
					<div className="space-y-4">
						<div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 flex items-center gap-2">
							<AlertCircle className="w-4 h-4" />
							<span>
								After you approve, the HR Department will review and finalize this
								request.
							</span>
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<DetailItem
								label="Requester"
								value={
									<EmployeeTableCell
										profileId={
											approvalModal.request.requester?.id ||
											approvalModal.request.requesterId
										}
										fullName={`${approvalModal.request.requester?.person?.personalInfo?.firstName || ""} ${approvalModal.request.requester?.person?.personalInfo?.lastName || ""}`.trim()}
										employeeId={
											approvalModal.request.requester?.employeeId || null
										}
									/>
								}
							/>
							<DetailItem
								label="Request Code"
								value={
									<span className="font-mono text-sm">
										{approvalModal.request.code || approvalModal.request.id}
									</span>
								}
							/>
							<DetailItem
								label="Leave Type"
								value={getMetadataField(approvalModal.request, "leaveType")}
							/>
							<DetailItem
								label="Start Date"
								value={
									approvalModal.request.startDate
										? formatDateTime(approvalModal.request.startDate)
										: undefined
								}
							/>
							<DetailItem
								label="End Date"
								value={
									approvalModal.request.endDate
										? formatDateTime(approvalModal.request.endDate)
										: undefined
								}
							/>
						</div>

						<div className="flex justify-end gap-3 pt-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setApprovalModal({ open: false, request: null })}
								disabled={approvingId !== null}>
								Cancel
							</Button>
							<Button
								type="button"
								className="bg-green-600 hover:bg-green-700 text-white"
								onClick={handleApproveConfirm}
								disabled={approvingId !== null}>
								{approvingId !== null ? "Approving..." : "Approve Request"}
							</Button>
						</div>
					</div>
				) : (
					<div className="text-gray-500 py-6">Select a request to approve.</div>
				)}
			</Modal>
		</div>
	);
}
