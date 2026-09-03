import { useState, useMemo } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { formatDateTime } from "~/lib/utils/text-utils";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Eye, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router";
import { useRequests, useRequest, useApproveRequest } from "~/lib/hooks/useRequests";
import { useAuth } from "~/lib/hooks/use-auth";
import type { Request, RequestStatus } from "~/services/requests.service";

// Helper function to get metadata field
const getMetadataField = (request: Request, field: string): any => {
	if (!request.metadata || typeof request.metadata !== "object") return null;
	return request.metadata?.[field] ?? null;
};

const getRequestState = (request?: Request | null): RequestStatus =>
	(request?.currentWorkflowStateKey as RequestStatus) || "PENDING";

export default function ExpenseReimbursementApprovalsPage() {
	const { user } = useAuth();
	// URL search params for deep-linked tabs
	const [searchParams, setSearchParams] = useSearchParams();
	const activeTab = (searchParams.get("tab") as RequestStatus) || "PENDING";

	const [isViewModalOpen, setIsViewModalOpen] = useState(false);
	const [viewing, setViewing] = useState<Request | null>(null);
	const [approvingId, setApprovingId] = useState<string | null>(null);
	const [rejectingId, setRejectingId] = useState<string | null>(null);
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

	// Fetch EXPENSE_REIMBURSEMENT requests assigned to this user
	const { data: requestsData, isLoading } = useRequests({
		page: 1,
		limit: 100,
		count: true,
		filter: {
			type: "EXPENSE_REIMBURSEMENT",
			currentWorkflowStateKey: activeTab,
			"stepExecutions.assigneeId": user?.metadata?.employee?.id,
		},
	});

	const items = (requestsData as any)?.requests || [];

	// Hook to fetch request details for view modal
	const { data: requestDetails, isLoading: isLoadingDetails } = useRequest(viewing?.id || "");

	// Mutation hooks
	const approveRequestMutation = useApproveRequest();

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

	// Define table columns - similar to expense reimbursement requests page
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
				render: (value, item) => {
					const requester = (item as any).requester;
					if (requester?.person?.personalInfo) {
						const firstName = requester.person.personalInfo.firstName || "";
						const lastName = requester.person.personalInfo.lastName || "";
						return (
							<div className="flex flex-col">
								<span className="text-sm font-medium text-gray-900">
									{firstName} {lastName}
								</span>
							</div>
						);
					}
					return (
						<div className="flex flex-col">
							<span className="text-sm text-gray-500">-</span>
						</div>
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
				key: "amount",
				label: "Amount",
				width: "140px",
				render: (value, item) => {
					const amount = item.amount ?? getMetadataField(item, "amount");
					const currency = getMetadataField(item, "currency") || "₱";
					if (amount === null || amount === undefined)
						return <span className="text-gray-400">-</span>;
					return (
						<span className="font-medium text-gray-900">
							{currency}
							{Number(amount).toLocaleString(undefined, {
								minimumFractionDigits: 2,
								maximumFractionDigits: 2,
							})}
						</span>
					);
				},
			},
			{
				key: "currency",
				label: "Currency",
				width: "100px",
				render: (value, item) => {
					const currency = getMetadataField(item, "currency") || "₱";
					return <span className="text-gray-600">{currency}</span>;
				},
			},
			{
				key: "expenseCategory",
				label: "Expense Category",
				width: "160px",
				render: (value, item) => {
					const category = getMetadataField(item, "expenseCategory");
					return <span className="text-gray-600">{category || "-"}</span>;
				},
			},
		],
		[],
	);

	const handleView = (item: Request) => {
		setViewing(item);
		setIsViewModalOpen(true);
	};

	const handleApprove = async (item: Request) => {
		if (!confirm(`Approve expense reimbursement request ${item.code || item.id}?`)) return;

		setApprovingId(item.id);
		try {
			await approveRequestMutation.mutateAsync({
				id: item.id,
				action: "approve",
			});
			toast.success("Expense reimbursement request approved successfully");
		} catch (error: any) {
			toast.error(error?.message || "Failed to approve expense reimbursement request");
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
			toast.success("Expense reimbursement request rejected successfully");
			setRejectionModal({ open: false, requestId: null });
			setRejectionReason("");
		} catch (error: any) {
			toast.error(error?.message || "Failed to reject expense reimbursement request");
		} finally {
			setRejectingId(null);
		}
	};

	// Custom actions renderer - show different buttons based on active tab
	const renderActions = (item: Request) => {
		// For pending requests, show approve/reject buttons
		if (activeTab === "PENDING") {
			return (
				<div className="flex items-center gap-2">
					<Button variant="outline" size="sm" onClick={() => handleView(item)}>
						<Eye className="h-4 w-4 mr-1" />
						View
					</Button>
					<Button
						size="sm"
						className="bg-green-600 hover:bg-green-700 text-white"
						onClick={() => handleApprove(item)}
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

		// For approved/rejected requests, only show view button
		return (
			<Button variant="outline" size="sm" onClick={() => handleView(item)}>
				<Eye className="h-4 w-4 mr-1" />
				View
			</Button>
		);
	};

	return (
		<div className="space-y-6">
			{/* Page Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">
						Expense Reimbursement Approvals
					</h1>
					<p className="text-gray-600">
						Review and approve expense reimbursement requests
					</p>
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
						? "No pending expense reimbursement requests"
						: activeTab === "APPROVED"
							? "No approved expense reimbursement requests"
							: "No rejected expense reimbursement requests"
				}
				emptyDescription={
					activeTab === "PENDING"
						? "All expense reimbursement requests have been processed."
						: activeTab === "APPROVED"
							? "You haven't approved any expense reimbursement requests yet."
							: "You haven't rejected any expense reimbursement requests yet."
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
				title="Expense Reimbursement Request Details"
				description="Review expense reimbursement request information">
				{isLoadingDetails ? (
					<div className="flex items-center justify-center py-8">
						<div className="text-gray-500">Loading request details...</div>
					</div>
				) : requestDetails ? (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Request Code
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									<span className="text-gray-900 font-mono text-sm">
										{requestDetails.code || "N/A"}
									</span>
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Status
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									<Badge
										variant={
											getStatusBadge(getRequestState(requestDetails)).variant
										}>
										{getStatusBadge(getRequestState(requestDetails)).label}
									</Badge>
								</div>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Amount
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									<span className="text-gray-900 font-medium text-lg">
										{(() => {
											const amount =
												requestDetails.amount ??
												getMetadataField(requestDetails, "amount");
											const currency =
												getMetadataField(requestDetails, "currency") || "₱";
											return amount !== null && amount !== undefined
												? `${currency}${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
												: "Not specified";
										})()}
									</span>
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Currency
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									<span className="text-gray-900">
										{getMetadataField(requestDetails, "currency") || "₱"}
									</span>
								</div>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Expense Category
							</label>
							<div className="p-3 bg-gray-50 rounded-md border">
								<span className="text-gray-900">
									{getMetadataField(requestDetails, "expenseCategory") ||
										"Not specified"}
								</span>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Description
							</label>
							<div className="p-3 bg-gray-50 rounded-md border min-h-[80px]">
								<span className="text-gray-900">
									{requestDetails.description || "No description provided"}
								</span>
							</div>
						</div>

						{requestDetails.notes && (
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Notes
								</label>
								<div className="p-3 bg-gray-50 rounded-md border min-h-[60px]">
									<span className="text-gray-900">{requestDetails.notes}</span>
								</div>
							</div>
						)}

						<div className="flex justify-end gap-3 pt-4">
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
				title="Reject Expense Reimbursement Request"
				description="Provide a reason for rejecting this expense reimbursement request">
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
		</div>
	);
}
