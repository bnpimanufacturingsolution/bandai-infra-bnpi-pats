import { useState, useMemo, type ReactNode } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { formatDateTime, formatDateForExport } from "~/lib/utils/text-utils";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import {
	Eye,
	CheckCircle,
	XCircle,
	Clock,
	AlertCircle,
	User,
	FileEdit,
	MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import { useSearchParams, useNavigate } from "react-router";
import { useRequests, useRequest, useApproveRequest } from "~/lib/hooks/useRequests";
import type { Request, RequestStatus } from "~/services/requests.service";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu";

// PAN Types for display
const PAN_TYPE_LABELS: Record<string, string> = {
	PERSONAL_INFO_UPDATE: "Personal Information Update",
	LEAVE_ADJUSTMENT: "Leave Balance Adjustment",
	LEAVE_CONVERSION: "Leave Conversion",
	PROMOTION_RECOMMENDATION: "Promotion Recommendation",
	DEPARTMENT_TRANSFER: "Department Transfer",
	ROLE_CHANGE: "Role Change",
};

// Calculate days pending
const calculateDaysPending = (createdAt: string): number => {
	const created = new Date(createdAt);
	const now = new Date();
	const diffTime = Math.abs(now.getTime() - created.getTime());
	return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// SLA indicator color
const getSLAColor = (daysPending: number): string => {
	if (daysPending <= 3) return "text-green-600 bg-green-50";
	if (daysPending <= 5) return "text-yellow-600 bg-yellow-50";
	return "text-red-600 bg-red-50";
};

// Get metadata field helper
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

export default function PersonnelActionApprovalsPage() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const currentEmployeeId = user?.metadata?.employee?.id;

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
	const [approvalComment, setApprovalComment] = useState("");
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

	// Fetch PERSONNEL_ACTION requests assigned to this user
	const { data: requestsData, isLoading } = useRequests({
		page: 1,
		limit: 100,
		count: true,
		filter: {
			type: "PERSONNEL_ACTION",
			currentWorkflowStateKey: activeTab,
			"stepExecutions.assigneeId": currentEmployeeId,
		},
	});

	const items = (requestsData as any)?.requests || [];

	// Filter out own PANs (self-approval prevention)
	const filteredItems = items.filter(
		(item: Request) => (item as any)?.requester?.id !== currentEmployeeId,
	);

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

	// Get PAN type label
	const getPanTypeLabel = (subType: string) => {
		return PAN_TYPE_LABELS[subType] || subType;
	};

	// Define table columns
	const columns: Column<Request>[] = useMemo(
		() => [
			{
				key: "code",
				label: "Code",
				width: "100px",
				render: (value) => (
					<span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs">
						{value || "N/A"}
					</span>
				),
			},
			{
				key: "requester",
				label: "Employee",
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
				key: "panType",
				label: "Action Type",
				width: "180px",
				render: (_, item) => {
					const panSubType = getMetadataField(item, "panSubType");
					return (
						<div className="flex items-center gap-2">
							<FileEdit className="h-4 w-4 text-gray-400" />
							<span className="text-sm">{getPanTypeLabel(panSubType || "")}</span>
						</div>
					);
				},
			},
			{
				key: "endDate",
				label: "Effective Date",
				width: "120px",
				render: (value) => (
					<span className="text-gray-900">
						{value ? formatDateForExport(value as string) : "-"}
					</span>
				),
			},
			{
				key: "createdAt",
				label: "Requested",
				width: "120px",
				render: (value) => (
					<span className="text-gray-600">
						{value ? formatDateForExport(value as string) : "-"}
					</span>
				),
			},
			{
				key: "daysPending",
				label: "Days Pending",
				width: "100px",
				render: (_, item) => {
					if (activeTab !== "PENDING") return <span className="text-gray-400">-</span>;
					const daysPending = calculateDaysPending(item.createdAt);
					return (
						<span
							className={`px-2 py-1 rounded-full text-xs font-medium ${getSLAColor(daysPending)}`}>
							{daysPending}d
						</span>
					);
				},
			},
			{
				key: "currentWorkflowStateKey",
				label: "Status",
				width: "110px",
				render: (_value, item) => {
					const statusBadge = getStatusBadge(getRequestState(item));
					return <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>;
				},
			},
		],
		[activeTab],
	);

	const handleView = (item: Request) => {
		setViewing(item);
		setIsViewModalOpen(true);
	};

	const handleApproveClick = (item: Request) => {
		setApprovalComment("");
		setApprovalModal({ open: true, request: item });
	};

	const handleApproveConfirm = async () => {
		if (!approvalModal.request) return;

		if (!approvalComment.trim()) {
			toast.error("Please provide a comment for your approval");
			return;
		}

		setApprovingId(approvalModal.request.id);
		try {
			await approveRequestMutation.mutateAsync({
				id: approvalModal.request.id,
				action: "approve",
				comment: `Manager Approval: ${approvalComment}`,
			});
			toast.success("Personnel Action request approved successfully");
			setApprovalModal({ open: false, request: null });
			setApprovalComment("");
		} catch (error: any) {
			toast.error(error?.message || "Failed to approve request");
		} finally {
			setApprovingId(null);
		}
	};

	const handleReject = (item: Request) => {
		setRejectionReason("");
		setRejectionModal({ open: true, requestId: item.id });
	};

	const handleRejectConfirm = async () => {
		if (!rejectionModal.requestId) return;

		if (!rejectionReason.trim()) {
			toast.error("Please provide a reason for rejection");
			return;
		}

		setRejectingId(rejectionModal.requestId);
		try {
			await approveRequestMutation.mutateAsync({
				id: rejectionModal.requestId,
				action: "reject",
				comment: `Manager Rejection: ${rejectionReason}`,
			});
			toast.success("Personnel Action request rejected");
			setRejectionModal({ open: false, requestId: null });
			setRejectionReason("");
		} catch (error: any) {
			toast.error(error?.message || "Failed to reject request");
		} finally {
			setRejectingId(null);
		}
	};

	// Custom actions renderer - dropdown menu
	const renderActions = (item: Request) => {
		const canApprove = activeTab === "PENDING";

		return (
			<div className="flex justify-end">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-800">
							<MoreVertical className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						<DropdownMenuItem onClick={() => handleView(item)}>
							<Eye className="mr-2 h-4 w-4" />
							View Details
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => handleViewProfile(item)}>
							<User className="mr-2 h-4 w-4" />
							View Profile
						</DropdownMenuItem>
						{canApprove && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									className="text-green-600 focus:text-green-600"
									onClick={() => handleApproveClick(item)}>
									<CheckCircle className="mr-2 h-4 w-4" />
									Approve
								</DropdownMenuItem>
								<DropdownMenuItem
									className="text-red-600 focus:text-red-600"
									onClick={() => handleReject(item)}>
									<XCircle className="mr-2 h-4 w-4" />
									Reject
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		);
	};

	return (
		<div className="space-y-6">
			{/* Page Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Personnel Action Approvals</h1>
					<p className="text-gray-600">
						Review and approve your team's personnel action requests
					</p>
				</div>
				{activeTab === "PENDING" && filteredItems.length > 0 && (
					<Badge variant="default" className="text-lg px-4 py-2">
						{filteredItems.length} Pending
					</Badge>
				)}
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
						For Approval
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
				data={filteredItems}
				columns={columns}
				filters={filterOptions}
				searchFields={["code"]}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage={
					activeTab === "PENDING"
						? "No pending personnel action requests"
						: activeTab === "APPROVED"
							? "No approved personnel action requests"
							: "No rejected personnel action requests"
				}
				emptyDescription={
					activeTab === "PENDING"
						? "All personnel action requests have been processed."
						: activeTab === "APPROVED"
							? "You haven't approved any personnel action requests yet."
							: "You haven't rejected any personnel action requests yet."
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
				title="Personnel Action Details"
				description="Review request information">
				{isLoadingDetails ? (
					<div className="flex items-center justify-center py-8">
						<div className="text-gray-500">Loading request details...</div>
					</div>
				) : requestDetails ? (
					<div className="space-y-6">
						{/* Employee Info */}
						<div className="p-4 bg-gray-50 rounded-lg border">
							<h3 className="text-sm font-semibold text-gray-700 mb-3">
								Employee Information
							</h3>
							<div className="grid gap-4 md:grid-cols-2">
								<DetailItem
									label="Employee"
									value={
										<EmployeeTableCell
											profileId={
												(requestDetails as any)?.requester?.id ||
												requestDetails.requesterId
											}
											fullName={`${(requestDetails as any)?.requester?.person?.personalInfo?.firstName || ""} ${(requestDetails as any)?.requester?.person?.personalInfo?.lastName || ""}`.trim()}
											employeeId={
												(requestDetails as any)?.requester?.employeeId ||
												null
											}
										/>
									}
								/>
								<DetailItem
									label="Employee ID"
									value={(requestDetails as any)?.requester?.employeeId}
								/>
							</div>
						</div>

						{/* Request Details */}
						<div className="grid gap-6 md:grid-cols-2">
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
								label="Action Type"
								value={getPanTypeLabel(
									getMetadataField(requestDetails, "panSubType") || "",
								)}
							/>
							<DetailItem
								label="Effective Date"
								value={
									requestDetails.endDate
										? formatDateTime(requestDetails.endDate)
										: undefined
								}
							/>
						</div>

						<DetailItem
							className="md:col-span-2"
							label="Justification"
							value={
								getMetadataField(requestDetails, "justification") ||
								requestDetails.description ? (
									<p className="whitespace-pre-line text-sm text-gray-900">
										{getMetadataField(requestDetails, "justification") ||
											requestDetails.description}
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
							{getRequestState(requestDetails) === "PENDING" && (
								<>
									<Button
										type="button"
										variant="outline"
										className="text-red-600 border-red-600 hover:bg-red-50"
										onClick={() => {
											setIsViewModalOpen(false);
											handleReject(requestDetails);
										}}>
										<XCircle className="h-4 w-4 mr-1" />
										Reject
									</Button>
									<Button
										type="button"
										className="bg-green-600 hover:bg-green-700 text-white"
										onClick={() => {
											setIsViewModalOpen(false);
											handleApproveClick(requestDetails);
										}}>
										<CheckCircle className="h-4 w-4 mr-1" />
										Approve
									</Button>
								</>
							)}
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
				title="Reject Personnel Action Request"
				description="Provide a reason for rejecting this request">
				<div className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Rejection Reason <span className="text-red-500">*</span>
						</label>
						<textarea
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[100px]"
							placeholder="Enter reason for rejection..."
							value={rejectionReason}
							onChange={(e) => setRejectionReason(e.target.value)}
						/>
						<p className="text-xs text-gray-500 mt-1">
							This will be visible to the employee
						</p>
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
							disabled={rejectingId !== null || !rejectionReason.trim()}>
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
						setApprovalComment("");
					}
				}}
				title="Approve Personnel Action Request"
				description="Confirm approval and add your comments">
				{approvalModal.request ? (
					<div className="space-y-4">
						<div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 flex items-center gap-2">
							<AlertCircle className="w-4 h-4" />
							<span>
								After you approve, HR will review and finalize this request.
							</span>
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<DetailItem
								label="Request Code"
								value={
									<span className="font-mono text-sm">
										{approvalModal.request.code || approvalModal.request.id}
									</span>
								}
							/>
							<DetailItem
								label="Action Type"
								value={getPanTypeLabel(
									getMetadataField(approvalModal.request, "panSubType") || "",
								)}
							/>
							<DetailItem
								label="Effective Date"
								value={
									approvalModal.request.endDate
										? formatDateTime(approvalModal.request.endDate)
										: undefined
								}
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Your Comments <span className="text-red-500">*</span>
							</label>
							<textarea
								className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[80px]"
								placeholder="Add your approval comments..."
								value={approvalComment}
								onChange={(e) => setApprovalComment(e.target.value)}
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
								disabled={approvingId !== null || !approvalComment.trim()}>
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
