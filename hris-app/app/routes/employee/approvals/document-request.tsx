import { useState, useMemo } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { Card, CardContent } from "~/components/atoms/Card";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { formatDateTime, formatDateForExport } from "~/lib/utils/text-utils";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Eye, CheckCircle, XCircle, Clock, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router";
import { useRequests, useRequest, useApproveRequest } from "~/lib/hooks/useRequests";
import { useAuth } from "~/lib/hooks/use-auth";
import type { Request, RequestStatus } from "~/services/requests.service";
import { getDocumentTypeLabel, getMetadataField } from "~/lib/document-request-handler";
import { MoreVertical } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export default function DocumentRequestApprovalsPage() {
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

	// Fetch DOCUMENT_REQUEST requests assigned to this user
	const { data: requestsData, isLoading } = useRequests({
		page: 1,
		limit: 100,
		count: true,
		filter: {
			type: "DOCUMENT_REQUEST",
			currentWorkflowStateKey: activeTab,
			"stepExecutions.assigneeId": user?.metadata?.employee?.id,
		},
	});

	const items = useMemo(() => (requestsData as any)?.requests || [], [requestsData]);

	// Calculate metrics for document requests
	const metrics = useMemo(() => {
		const total = items.length;
		const pending = items.filter((item: Request) => getRequestState(item) === "PENDING").length;
		const approved = items.filter(
			(item: Request) => getRequestState(item) === "APPROVED",
		).length;
		const rejected = items.filter(
			(item: Request) => getRequestState(item) === "REJECTED",
		).length;

		return {
			total,
			pending,
			approved,
			rejected,
			approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
		};
	}, [items]);

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
			{
				variant: "success" | "secondary" | "destructive" | "default" | "warning";
				label: string;
			}
		> = {
			PENDING: { variant: "warning", label: "Pending" },
			PROCESSING: { variant: "default", label: "Processing" },
			APPROVED: { variant: "success", label: "Approved" },
			REJECTED: { variant: "destructive", label: "Rejected" },
			CANCELLED: { variant: "secondary", label: "Cancelled" },
			COMPLETED: { variant: "success", label: "Completed" },
		};
		return statusStyles[status] || { variant: "default", label: status };
	};

	// Define table columns - similar to document request requests page
	const columns: Column<Request>[] = useMemo(
		() => [
			{
				key: "requester",
				label: "Requester",
				width: "200px",
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
				key: "documentType",
				label: "Document Type",
				width: "250px",
				render: (value: any, item: Request) => {
					const docType = getMetadataField(item, "documentType");
					const description = item.description || "";

					return (
						<div className="flex items-center gap-3">
							<div className="p-2 rounded-lg bg-blue-50">
								<FileText className="h-4 w-4 text-blue-600" />
							</div>
							<div className="flex flex-col">
								<span className="font-medium text-gray-900">
									{getDocumentTypeLabel(docType)}
								</span>
								<span className="text-xs text-gray-500 truncate max-w-[180px]">
									{description}
								</span>
							</div>
						</div>
					);
				},
			},
			{
				key: "createdAt",
				label: "Requested On",
				width: "150px",
				render: (value: any) => {
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
				width: "120px",
				render: (_value: any, item: Request) => {
					const statusBadge = getStatusBadge(getRequestState(item));
					return <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>;
				},
			},
			{
				key: "currentStepExecution",
				label: "Current Step",
				width: "200px",
				render: (value: any, item: Request) => {
					const currentStep = (item as any).currentStepExecution;
					const isReadyToGenerate =
						item.type === "DOCUMENT_REQUEST" &&
						currentStep?.stepName?.toLowerCase().includes("generation");

					if (!currentStep?.stepName) {
						return <span className="text-gray-400">-</span>;
					}

					// Determine who will approve
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
									✓ Ready to Generate
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
				render: (value: any, item: Request) => {
					const lastStep = (item as any).lastCompletedStepExecution;

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

	const handleView = (item: Request) => {
		setViewing(item);
		setIsViewModalOpen(true);
	};

	const handleApprove = (item: Request) => {
		setApprovingId(item.id);
	};

	const handleApproveConfirm = async () => {
		if (!approvingId) return;

		try {
			await approveRequestMutation.mutateAsync({
				id: approvingId,
				action: "approve",
			});
			toast.success("Document request approved successfully");
			setApprovingId(null);
			setIsViewModalOpen(false);
		} catch (error: any) {
			toast.error(error?.message || "Failed to approve document request");
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
			toast.success("Document request rejected successfully");
			setRejectionModal({ open: false, requestId: null });
			setRejectionReason("");
		} catch (error: any) {
			toast.error(error?.message || "Failed to reject document request");
		} finally {
			setRejectingId(null);
		}
	};

	// Circular progress component
	const CircularProgress = ({
		percent,
		color,
		size = 120,
	}: {
		percent: number;
		color: string;
		size?: number;
	}) => {
		const radius = (size - 8) / 2;
		const circumference = 2 * Math.PI * radius;
		const offset = circumference - (percent / 100) * circumference;

		return (
			<svg width={size} height={size} className="transform -rotate-90">
				{/* Background circle */}
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke="#e5e7eb"
					strokeWidth="8"
				/>
				{/* Progress circle */}
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke={color}
					strokeWidth="8"
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					strokeLinecap="round"
					className="transition-all duration-500"
				/>
			</svg>
		);
	};

	// Custom actions renderer with dropdown
	const renderActions = (item: Request) => {
		const isPending = getRequestState(item) === "PENDING";

		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="flex items-center justify-center w-8 h-8 p-0">
						<MoreVertical className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem onClick={() => handleView(item)}>
						<Eye className="h-4 w-4 mr-2" />
						View Details
					</DropdownMenuItem>

					{isPending && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => handleApprove(item)}
								className="text-green-600 focus:text-green-600 focus:bg-green-50">
								<CheckCircle className="h-4 w-4 mr-2" />
								Approve
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => handleReject(item)}
								className="text-red-600 focus:text-red-600 focus:bg-red-50">
								<XCircle className="h-4 w-4 mr-2" />
								Reject
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	return (
		<div className="space-y-6">
			{/* Metrics Cards */}
			{/* Metrics Cards */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				{/* Total Requests */}
				<Card className="hover:shadow-md transition-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between gap-3">
							{/* Left side - Text info */}
							<div className="space-y-0.5">
								<div className="flex items-center gap-1.5">
									<div className="p-1.5 rounded-lg bg-blue-50">
										<FileText className="h-4 w-4 text-blue-600" />
									</div>
								</div>
								<h3 className="text-xs font-semibold text-gray-700 mt-2">
									Total Documents
								</h3>
								<div className="space-y-0.25 text-xs">
									<div className="text-gray-500">
										<span className="font-medium">COUNT</span>
									</div>
									<div className="font-bold text-gray-900">{metrics.total}</div>
								</div>
							</div>

							{/* Right side - Circular progress */}
							<div className="relative flex-shrink-0">
								<CircularProgress percent={100} color="#3b82f6" size={80} />
								<div className="absolute inset-0 flex flex-col items-center justify-center">
									<div className="text-lg font-bold text-gray-900">
										{metrics.total}
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Pending */}
				<Card className="hover:shadow-md transition-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between gap-3">
							{/* Left side - Text info */}
							<div className="space-y-0.5">
								<div className="flex items-center gap-1.5">
									<div className="p-1.5 rounded-lg bg-yellow-50">
										<Clock className="h-4 w-4 text-yellow-600" />
									</div>
								</div>
								<h3 className="text-xs font-semibold text-gray-700 mt-2">
									Pending
								</h3>
								<div className="space-y-0.25 text-xs">
									<div className="text-gray-500">
										<span className="font-medium">COUNT</span>
									</div>
									<div className="font-bold text-gray-900">{metrics.pending}</div>
								</div>
							</div>

							{/* Right side - Circular progress */}
							<div className="relative flex-shrink-0">
								<CircularProgress
									percent={
										metrics.total > 0
											? (metrics.pending / metrics.total) * 100
											: 0
									}
									color="#ca8a04"
									size={80}
								/>
								<div className="absolute inset-0 flex flex-col items-center justify-center">
									<div className="text-lg font-bold text-gray-900">
										{metrics.pending}
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Approved */}
				<Card className="hover:shadow-md transition-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between gap-3">
							{/* Left side - Text info */}
							<div className="space-y-0.5">
								<div className="flex items-center gap-1.5">
									<div className="p-1.5 rounded-lg bg-green-50">
										<CheckCircle className="h-4 w-4 text-green-600" />
									</div>
								</div>
								<h3 className="text-xs font-semibold text-gray-700 mt-2">
									Approved
								</h3>
								<div className="space-y-0.25 text-xs">
									<div className="text-gray-500">
										<span className="font-medium">COUNT</span>
									</div>
									<div className="font-bold text-gray-900">
										{metrics.approved}
									</div>
								</div>
							</div>

							{/* Right side - Circular progress */}
							<div className="relative flex-shrink-0">
								<CircularProgress
									percent={
										metrics.total > 0
											? (metrics.approved / metrics.total) * 100
											: 0
									}
									color="#16a34a"
									size={80}
								/>
								<div className="absolute inset-0 flex flex-col items-center justify-center">
									<div className="text-lg font-bold text-gray-900">
										{metrics.approved}
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Rejected */}
				<Card className="hover:shadow-md transition-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between gap-3">
							{/* Left side - Text info */}
							<div className="space-y-0.5">
								<div className="flex items-center gap-1.5">
									<div className="p-1.5 rounded-lg bg-red-50">
										<XCircle className="h-4 w-4 text-red-600" />
									</div>
								</div>
								<h3 className="text-xs font-semibold text-gray-700 mt-2">
									Rejected
								</h3>
								<div className="space-y-0.25 text-xs">
									<div className="text-gray-500">
										<span className="font-medium">COUNT</span>
									</div>
									<div className="font-bold text-gray-900">
										{metrics.rejected}
									</div>
								</div>
							</div>

							{/* Right side - Circular progress */}
							<div className="relative flex-shrink-0">
								<CircularProgress
									percent={
										metrics.total > 0
											? (metrics.rejected / metrics.total) * 100
											: 0
									}
									color="#dc2626"
									size={80}
								/>
								<div className="absolute inset-0 flex flex-col items-center justify-center">
									<div className="text-lg font-bold text-gray-900">
										{metrics.rejected}
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
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
				title="Document Approvals"
				description=""
				data={items}
				columns={columns}
				filters={filterOptions}
				searchFields={["code"]}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage={
					activeTab === "PENDING"
						? "No pending document requests"
						: activeTab === "APPROVED"
							? "No approved document requests"
							: "No rejected document requests"
				}
				emptyDescription={
					activeTab === "PENDING"
						? "All document requests have been processed."
						: activeTab === "APPROVED"
							? "You haven't approved any document requests yet."
							: "You haven't rejected any document requests yet."
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
				title="Document Request Details"
				description="Review document request information">
				{isLoadingDetails ? (
					<div className="flex items-center justify-center py-8">
						<div className="text-gray-500">Loading request details...</div>
					</div>
				) : requestDetails ? (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Requester
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									<EmployeeTableCell
										profileId={
											requestDetails.requester?.id ||
											requestDetails.requesterId
										}
										fullName={`${requestDetails.requester?.person?.personalInfo?.firstName || ""} ${requestDetails.requester?.person?.personalInfo?.lastName || ""}`.trim()}
										employeeId={requestDetails.requester?.employeeId || null}
									/>
								</div>
							</div>
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
									Document Type
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									<span className="text-gray-900">
										{getMetadataField(requestDetails, "docType") ||
											"Not specified"}
									</span>
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Due Date
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									<span className="text-gray-900">
										{(() => {
											const dueDate = getMetadataField(
												requestDetails,
												"dueDate",
											);
											return dueDate
												? formatDateTime(dueDate)
												: "Not specified";
										})()}
									</span>
								</div>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Requested From
							</label>
							<div className="p-3 bg-gray-50 rounded-md border">
								<span className="text-gray-900">
									{getMetadataField(requestDetails, "requestedFrom") ||
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
							{getRequestState(requestDetails) === "PENDING" && (
								<>
									<Button
										type="button"
										className="bg-green-600 hover:bg-green-700 text-white"
										onClick={() => {
											handleApprove(requestDetails);
										}}>
										Approve
									</Button>
									<Button
										type="button"
										className="bg-red-600 hover:bg-red-700 text-white"
										onClick={() => {
											handleReject(requestDetails);
										}}>
										Reject
									</Button>
								</>
							)}
						</div>
					</div>
				) : (
					<div className="flex items-center justify-center py-8">
						<div className="text-gray-500">Failed to load request details</div>
					</div>
				)}
			</Modal>

			{/* Approval Confirmation Modal */}
			<Modal
				open={Boolean(approvingId)}
				onOpenChange={(open) => {
					if (!open) setApprovingId(null);
				}}
				title="Approve Document Request"
				description="Are you sure you want to approve this request? This will move it to the HR processing queue.">
				<div className="flex justify-end gap-3 pt-4">
					<Button
						variant="outline"
						onClick={() => setApprovingId(null)}
						disabled={approveRequestMutation.isPending}>
						Cancel
					</Button>
					<Button
						className="bg-green-600 hover:bg-green-700 text-white"
						onClick={handleApproveConfirm}
						disabled={approveRequestMutation.isPending}>
						{approveRequestMutation.isPending ? "Approving..." : "Confirm Approve"}
					</Button>
				</div>
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
				title="Reject Document Request"
				description="Provide a reason for rejecting this document request">
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
const getRequestState = (request?: Request | null): RequestStatus =>
	(request?.currentWorkflowStateKey as RequestStatus) || "PENDING";
