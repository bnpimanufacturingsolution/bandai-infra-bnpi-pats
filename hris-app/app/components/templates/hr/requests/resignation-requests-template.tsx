import { useState, useMemo } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { formatDateForExport } from "~/lib/utils/text-utils";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import {
	Eye,
	MoreVertical,
	CheckCircle,
	XCircle,
	User,
	PlayCircle,
	FileText,
	Clock,
} from "lucide-react";
import { useSearchParams } from "react-router";
import {
	useRequests,
	useRequest,
	useApproveRequest,
	useGenerateDocument,
	useStartOffboarding,
} from "~/lib/hooks/useRequests";
import { useBoardingProcessByEmployee } from "~/lib/hooks/useBoardingProcess";
import { useBoardingTemplates } from "~/lib/hooks/useBoardingTemplates";
import { useUpdateChecklistItem } from "~/lib/hooks/useChecklistItems";
import { getRequestState, type Request, type RequestStatus } from "~/services/requests.service";
import { ChecklistStatus } from "~/zod/checklist-item";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Progress } from "~/components/ui/progress";

// Helper function to get metadata field
const getMetadataField = (request: Request, field: string): any => {
	if (!request.metadata || typeof request.metadata !== "object") return null;
	return request.metadata?.[field] ?? null;
};

/**
 * HR Resignation Requests Page
 *
 * Flow:
 * 1. Employee creates resignation request (PENDING)
 * 2. Manager approves → status becomes PROCESSING
 * 3. HR approves → status becomes APPROVED
 * 4. HR starts exit clearance → creates OFFBOARDING BoardingProcess, status becomes PROCESSING
 * 5. HR/Employee completes checklist items
 * 6. When all items complete, HR manually generates COE
 */
export function HRResignationRequestsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const action = searchParams.get("action");
	const urlRequestId = searchParams.get("id");

	// State for template selection
	const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

	// Update search params helper
	const updateSearchParams = (fn: (params: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			fn(next);
			return next;
		});
	};

	// Fetch RESIGNATION requests
	const { data: requestsData, isLoading } = useRequests({
		page: 1,
		limit: 100,
		count: true,
		filter: [{ type: "RESIGNATION" }],
	});
	const items = (requestsData as any)?.requests || [];

	// Hook to fetch request details for view modal
	const { data: requestDetails, isLoading: isLoadingDetails } = useRequest(urlRequestId || "");

	// Fetch boarding process for selected employee (for exit clearance section)
	const employeeId = requestDetails?.requesterId || "";
	const { data: boardingProcess } = useBoardingProcessByEmployee(employeeId, "OFFBOARDING");

	// Mutation hooks
	const approveRequestMutation = useApproveRequest();
	const startOffboardingMutation = useStartOffboarding();
	const updateChecklistItemMutation = useUpdateChecklistItem();
	const generateDocumentMutation = useGenerateDocument();

	// Calculate checklist completion
	const checklistItems = boardingProcess?.checklistItems || [];
	const completedCount = checklistItems.filter((i: any) => i.status === "COMPLETED").length;
	const totalCount = checklistItems.length;
	const completionPercentage =
		totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
	const allCompleted = totalCount > 0 && completedCount === totalCount;

	// Get status badge with flow-specific labels
	const getStatusBadge = (status: RequestStatus) => {
		const statusStyles: Record<
			string,
			{
				variant: "success" | "secondary" | "destructive" | "default" | "warning";
				label: string;
			}
		> = {
			PENDING: { variant: "warning", label: "Pending Manager Approval" },
			PROCESSING: { variant: "default", label: "Pending HR Approval" },
			APPROVED: { variant: "success", label: "Ready for Exit Clearance" },
			REJECTED: { variant: "destructive", label: "Rejected" },
			CANCELLED: { variant: "secondary", label: "Cancelled" },
			COMPLETED: { variant: "success", label: "Completed" },
		};
		return statusStyles[status] || { variant: "default", label: status };
	};

	const getRequesterName = (item: Request) => {
		const firstName = item.requester?.person?.personalInfo?.firstName || "";
		const lastName = item.requester?.person?.personalInfo?.lastName || "";
		return firstName || lastName ? `${firstName} ${lastName}` : "Unknown Employee";
	};

	// Define table columns
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
				label: "Employee",
				width: "200px",
				render: (_value, item) => (
					<div className="min-w-0 space-y-0.5">
						<div className="truncate text-sm font-medium text-gray-900">
							{getRequesterName(item)}
						</div>
						<div className="font-mono text-[11px] text-muted-foreground">
							{item.requester?.employeeId || "No ID"}
						</div>
					</div>
				),
			},
			{
				key: "lastWorkingDay",
				label: "Last Working Day",
				width: "150px",
				render: (_value, item) => {
					const lwd = getMetadataField(item, "lastWorkingDay");
					return (
						<span className="text-gray-900">
							{lwd ? formatDateForExport(lwd) : "-"}
						</span>
					);
				},
			},
			{
				key: "createdAt",
				label: "Date Requested",
				width: "150px",
				render: (value) => (
					<span className="text-gray-900">
						{value ? formatDateForExport(value as string) : "-"}
					</span>
				),
			},
			{
				key: "currentWorkflowStateKey",
				label: "Status",
				width: "180px",
				render: (_value, item) => {
					const statusBadge = getStatusBadge(getRequestState(item));
					return <Badge variant={statusBadge.variant as any}>{statusBadge.label}</Badge>;
				},
			},
		],
		[],
	);

	const handleView = (item: Request) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", item.id);
		});
	};

	const handleCloseModal = () => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
		setSelectedTemplateId("");
	};

	// HR Approve: PROCESSING → APPROVED
	const handleHRApprove = (item: Request) => {
		updateSearchParams((next) => {
			next.set("action", "hr-approve");
			next.set("id", item.id);
		});
	};

	const confirmHRApprove = () => {
		if (!urlRequestId) return;
		approveRequestMutation.mutate(
			{
				id: urlRequestId,
				action: "approve",
				comment: "HR approved. Ready for exit clearance process.",
			},
			{
				onSuccess: () => {
					handleCloseModal();
				},
			},
		);
	};

	// Start Exit Clearance
	const handleStartClearance = () => {
		updateSearchParams((next) => {
			next.set("action", "start-clearance");
		});
	};

	const confirmStartClearance = () => {
		if (!urlRequestId) return;
		startOffboardingMutation.mutate(
			{ requestId: urlRequestId },
			{
				onSuccess: () => {
					handleCloseModal();
				},
			},
		);
	};

	// Toggle checklist item
	const handleToggleChecklistItem = (item: any) => {
		const newStatus =
			item.status === ChecklistStatus.COMPLETED
				? ChecklistStatus.PENDING
				: ChecklistStatus.COMPLETED;
		updateChecklistItemMutation.mutate({
			id: item.id,
			payload: {
				status: newStatus,
				...(newStatus === ChecklistStatus.COMPLETED
					? { completedDate: new Date() }
					: { completedDate: null }),
			},
		});
	};

	// Generate COE
	const handleGenerateCOE = () => {
		updateSearchParams((next) => {
			next.set("action", "generate-coe");
		});
	};

	const confirmGenerateCOE = () => {
		if (!urlRequestId) return;
		generateDocumentMutation.mutate(
			{ requestId: urlRequestId, type: "COE" },
			{
				onSuccess: () => {
					handleCloseModal();
				},
			},
		);
	};

	// Reject
	const handleReject = (item: Request) => {
		updateSearchParams((next) => {
			next.set("action", "reject");
			next.set("id", item.id);
		});
	};

	const confirmReject = () => {
		if (!urlRequestId) return;
		approveRequestMutation.mutate(
			{ id: urlRequestId, action: "reject" },
			{
				onSuccess: () => {
					handleCloseModal();
				},
			},
		);
	};

	// Custom actions renderer with dropdown
	const renderActions = (item: Request) => {
		const requestState = getRequestState(item);
		const isPendingManagerApproval = requestState === "PENDING";
		const isPendingHRApproval = requestState === "PROCESSING";
		const isReadyForClearance = requestState === "APPROVED";
		const isInClearance = getMetadataField(item, "offboardingProcessId");

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
				<DropdownMenuContent align="end" className="w-52">
					<DropdownMenuItem onClick={() => handleView(item)}>
						<Eye className="h-4 w-4 mr-2" />
						View Details
					</DropdownMenuItem>

					{isPendingManagerApproval && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem disabled className="text-gray-400">
								<Clock className="h-4 w-4 mr-2" />
								Awaiting Manager Approval
							</DropdownMenuItem>
						</>
					)}

					{isPendingHRApproval && !isInClearance && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => handleHRApprove(item)}
								className="text-green-600 focus:text-green-600 focus:bg-green-50">
								<CheckCircle className="h-4 w-4 mr-2" />
								HR Approve
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => handleReject(item)}
								className="text-red-600 focus:text-red-600 focus:bg-red-50">
								<XCircle className="h-4 w-4 mr-2" />
								Reject
							</DropdownMenuItem>
						</>
					)}

					{isReadyForClearance && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => handleView(item)}
								className="text-amber-600 focus:text-amber-600 focus:bg-amber-50">
								<PlayCircle className="h-4 w-4 mr-2" />
								Start Exit Clearance
							</DropdownMenuItem>
						</>
					)}

					{isInClearance && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => handleView(item)}
								className="text-blue-600 focus:text-blue-600 focus:bg-blue-50">
								<FileText className="h-4 w-4 mr-2" />
								Manage Clearance
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	// Category labels for checklist grouping
	const categoryLabels: Record<string, string> = {
		KNOWLEDGE_TRANSFER: "Knowledge Transfer",
		EXIT_INTERVIEW: "Exit Interview",
		HR_DOCUMENTATION: "HR Documentation",
		PAYROLL: "Payroll & Finance",
	};

	// Group checklist items by category
	const groupedItems = checklistItems.reduce((acc: Record<string, any[]>, item: any) => {
		const category = item.category || "OTHER";
		if (!acc[category]) acc[category] = [];
		acc[category].push(item);
		return acc;
	}, {});

	return (
		<div className="space-y-6">
			{/* Page Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Resignation Requests</h1>
					<p className="text-gray-600">
						Manage employee resignations and exit clearance processes
					</p>
				</div>
			</div>

			{/* Flow Guide */}
			<div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
				<h3 className="font-medium text-blue-900 mb-2">Resignation Flow</h3>
				<div className="flex items-center gap-2 text-sm text-blue-700 flex-wrap">
					<span className="px-2 py-1 bg-blue-100 rounded">1. Employee Submits</span>
					<span>→</span>
					<span className="px-2 py-1 bg-blue-100 rounded">2. Manager Approves</span>
					<span>→</span>
					<span className="px-2 py-1 bg-blue-100 rounded">3. HR Approves</span>
					<span>→</span>
					<span className="px-2 py-1 bg-blue-100 rounded">4. Start Exit Clearance</span>
					<span>→</span>
					<span className="px-2 py-1 bg-blue-100 rounded">5. Complete Checklist</span>
					<span>→</span>
					<span className="px-2 py-1 bg-blue-100 rounded">6. Generate COE</span>
				</div>
			</div>

			<DataTable
				title=""
				description=""
				data={items}
				columns={columns}
				filters={[]}
				searchFields={["code"]}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No resignation requests found"
				emptyDescription="Resignation requests will appear here."
				searchWidth="w-80"
				itemsPerPage={10}
			/>

			{/* View Details Modal */}
			<Modal
				open={action === "view"}
				onOpenChange={(open) => {
					if (!open) handleCloseModal();
				}}
				title="Resignation Request Details"
				description="View and manage resignation request">
				{isLoadingDetails ? (
					<div className="flex items-center justify-center py-8">
						<div className="text-gray-500">Loading...</div>
					</div>
				) : requestDetails ? (
					<div className="space-y-6 max-h-[70vh] overflow-y-auto">
						{/* Employee Info */}
						<div className="p-4 bg-gray-50 rounded-lg border flex items-center gap-4">
							<div className="w-12 h-12 rounded-full bg-white border flex items-center justify-center text-gray-500">
								<User className="w-6 h-6" />
							</div>
							<div className="flex-1">
								<h3 className="font-semibold text-gray-900">
									{getRequesterName(requestDetails)}
								</h3>
								<p className="text-sm text-gray-600">
									{requestDetails.requester?.employeeId || "No ID"}
								</p>
							</div>
							<Badge
								variant={
									getStatusBadge(getRequestState(requestDetails)).variant as any
								}>
								{getStatusBadge(getRequestState(requestDetails)).label}
							</Badge>
						</div>

						{/* Request Details */}
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm text-gray-500 mb-1">
									Request Code
								</label>
								<div className="font-mono text-sm">
									{requestDetails.code || "N/A"}
								</div>
							</div>
							<div>
								<label className="block text-sm text-gray-500 mb-1">
									Last Working Day
								</label>
								<div className="text-sm">
									{getMetadataField(requestDetails, "lastWorkingDay")
										? formatDateForExport(
												getMetadataField(requestDetails, "lastWorkingDay"),
											)
										: "-"}
								</div>
							</div>
							<div className="col-span-2">
								<label className="block text-sm text-gray-500 mb-1">Reason</label>
								<div className="text-sm text-gray-900">
									{getMetadataField(requestDetails, "reasonDetails") ||
										requestDetails.description ||
										"No reason provided"}
								</div>
							</div>
						</div>

						{/* PROCESSING: Pending HR Approval (no offboarding process yet) */}
						{getRequestState(requestDetails) === "PROCESSING" && !boardingProcess && (
							<div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
								<h4 className="font-medium text-amber-900 mb-2">
									Pending HR Approval
								</h4>
								<p className="text-sm text-amber-700 mb-4">
									Manager has approved. Review and approve to proceed with exit
									clearance.
								</p>
								<div className="flex gap-3">
									<Button
										onClick={() => handleHRApprove(requestDetails)}
										className="bg-green-600 hover:bg-green-700 text-white">
										<CheckCircle className="w-4 h-4 mr-2" />
										HR Approve
									</Button>
									<Button
										variant="outline"
										onClick={() => handleReject(requestDetails)}
										className="text-red-600 border-red-300 hover:bg-red-50">
										<XCircle className="w-4 h-4 mr-2" />
										Reject
									</Button>
								</div>
							</div>
						)}

						{/* APPROVED: Ready for Exit Clearance */}
						{getRequestState(requestDetails) === "APPROVED" && !boardingProcess && (
							<div className="p-4 bg-green-50 border border-green-200 rounded-lg">
								<h4 className="font-medium text-green-900 mb-2">
									Ready for Exit Clearance
								</h4>
								<p className="text-sm text-green-700 mb-4">
									Resignation approved. Start the exit clearance process to assign
									offboarding tasks based on employee role.
								</p>

								<div className="space-y-3">
									<Button
										onClick={handleStartClearance}
										disabled={startOffboardingMutation.isPending}
										className="bg-amber-600 hover:bg-amber-700 text-white">
										<PlayCircle className="w-4 h-4 mr-2" />
										{startOffboardingMutation.isPending
											? "Starting..."
											: "Start Exit Clearance"}
									</Button>
								</div>
							</div>
						)}

						{/* Exit Clearance In Progress */}
						{boardingProcess && (
							<div className="border rounded-lg overflow-hidden">
								<div className="p-4 bg-gray-50 border-b flex items-center justify-between">
									<div>
										<h4 className="font-semibold text-gray-900">
											Exit Clearance Checklist
										</h4>
										<p className="text-sm text-gray-500">
											{completedCount} of {totalCount} tasks completed
										</p>
									</div>
									<div className="flex items-center gap-3">
										<div className="w-24">
											<Progress
												value={completionPercentage}
												className="h-2"
											/>
										</div>
										<Badge variant={allCompleted ? "success" : "default"}>
											{completionPercentage}%
										</Badge>
									</div>
								</div>

								<div className="p-4 space-y-4">
									{Object.entries(groupedItems).map(([category, items]) => (
										<div key={category} className="space-y-2">
											<h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
												{categoryLabels[category] || category}
											</h5>
											{(items as any[]).map((item) => (
												<div
													key={item.id}
													className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
														item.status === "COMPLETED"
															? "bg-green-50 border-green-200"
															: "bg-white border-gray-200"
													}`}>
													<button
														onClick={() =>
															handleToggleChecklistItem(item)
														}
														disabled={
															updateChecklistItemMutation.isPending
														}
														className="flex-shrink-0">
														{item.status === "COMPLETED" ? (
															<CheckCircle className="w-5 h-5 text-green-500" />
														) : (
															<div className="w-5 h-5 rounded-full border-2 border-gray-300" />
														)}
													</button>
													<span
														className={`flex-1 ${
															item.status === "COMPLETED"
																? "line-through text-gray-500"
																: "text-gray-900"
														}`}>
														{item.title}
													</span>
												</div>
											))}
										</div>
									))}

									{/* Generate COE Button - only when all complete */}
									{allCompleted && (
										<div className="pt-4 border-t">
											<div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
												<div>
													<p className="font-medium text-green-800">
														All clearances complete!
													</p>
													<p className="text-sm text-green-600">
														Generate Certificate of Employment
													</p>
												</div>
												<Button
													onClick={handleGenerateCOE}
													className="bg-green-600 hover:bg-green-700 text-white">
													<FileText className="w-4 h-4 mr-2" />
													Generate COE
												</Button>
											</div>
										</div>
									)}
								</div>
							</div>
						)}

						{/* Close Button */}
						<div className="flex justify-end pt-4 border-t">
							<Button variant="outline" onClick={handleCloseModal}>
								Close
							</Button>
						</div>
					</div>
				) : (
					<div className="flex items-center justify-center py-8">
						<div className="text-gray-500">Failed to load details</div>
					</div>
				)}
			</Modal>

			{/* HR Approve Confirmation */}
			<Modal
				open={action === "hr-approve"}
				onOpenChange={(open) => {
					if (!open) handleCloseModal();
				}}
				title="HR Approve Resignation"
				description="Approve this resignation to proceed with exit clearance.">
				<div className="flex justify-end gap-3 pt-4">
					<Button
						variant="outline"
						onClick={handleCloseModal}
						disabled={approveRequestMutation.isPending}>
						Cancel
					</Button>
					<Button
						className="bg-green-600 hover:bg-green-700 text-white"
						onClick={confirmHRApprove}
						disabled={approveRequestMutation.isPending}>
						{approveRequestMutation.isPending ? "Approving..." : "Confirm HR Approve"}
					</Button>
				</div>
			</Modal>

			{/* Start Clearance Confirmation */}
			<Modal
				open={action === "start-clearance"}
				onOpenChange={(open) => {
					if (!open) handleCloseModal();
				}}
				title="Start Exit Clearance"
				description="Create exit clearance checklist and assign tasks for this employee.">
				<div className="flex justify-end gap-3 pt-4">
					<Button
						variant="outline"
						onClick={handleCloseModal}
						disabled={startOffboardingMutation.isPending}>
						Cancel
					</Button>
					<Button
						className="bg-amber-600 hover:bg-amber-700 text-white"
						onClick={confirmStartClearance}
						disabled={startOffboardingMutation.isPending}>
						{startOffboardingMutation.isPending ? "Starting..." : "Confirm Start"}
					</Button>
				</div>
			</Modal>

			{/* Reject Confirmation */}
			<Modal
				open={action === "reject"}
				onOpenChange={(open) => {
					if (!open) handleCloseModal();
				}}
				title="Reject Resignation"
				description="Are you sure you want to reject this resignation?">
				<div className="flex justify-end gap-3 pt-4">
					<Button
						variant="outline"
						onClick={handleCloseModal}
						disabled={approveRequestMutation.isPending}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={confirmReject}
						disabled={approveRequestMutation.isPending}>
						{approveRequestMutation.isPending ? "Rejecting..." : "Confirm Reject"}
					</Button>
				</div>
			</Modal>

			{/* Generate COE Confirmation */}
			<Modal
				open={action === "generate-coe"}
				onOpenChange={(open) => {
					if (!open) handleCloseModal();
				}}
				title="Generate Certificate of Employment"
				description="Generate and save COE document for this employee.">
				<div className="flex justify-end gap-3 pt-4">
					<Button
						variant="outline"
						onClick={handleCloseModal}
						disabled={generateDocumentMutation.isPending}>
						Cancel
					</Button>
					<Button
						className="bg-green-600 hover:bg-green-700 text-white"
						onClick={confirmGenerateCOE}
						disabled={generateDocumentMutation.isPending}>
						{generateDocumentMutation.isPending ? "Generating..." : "Generate COE"}
					</Button>
				</div>
			</Modal>
		</div>
	);
}

export default HRResignationRequestsPage;
