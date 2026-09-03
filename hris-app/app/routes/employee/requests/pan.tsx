import { useState, useEffect } from "react";
import { Lock, CheckCircle2, AlertTriangle, MoreVertical, Eye, Trash2 } from "lucide-react";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Button } from "~/components/atoms/Button";
import { Card, CardContent } from "~/components/ui/card";
import { RequestReviewModal } from "~/components/molecules/RequestReviewModal";
import { toast } from "sonner";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { useAuth } from "~/lib/hooks/useAuth";
import { useRequests, useDeleteRequest } from "~/lib/hooks/useRequests";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu";
import { PANRequestModal } from "~/components/modals/PANRequestModal";
import { useSearchParams } from "react-router";
import { PANBadge } from "~/components/atoms/PANBadge";

// PAN Types that employees can submit
const PAN_TYPES = [
	{
		value: "PERSONAL_INFO_UPDATE",
		label: "Personal Information Update",
		description: "Update address, emergency contacts, bank details",
		requiresAttachment: true,
	},
	{
		value: "LEAVE_ADJUSTMENT",
		label: "Leave Balance Adjustment",
		description: "Request leave balance corrections",
		requiresAttachment: false,
	},
	{
		value: "LEAVE_CONVERSION",
		label: "Leave Conversion",
		description: "Convert leave credits to cash",
		requiresAttachment: true,
	},
] as const;

const PAN_REQUEST_TYPES = [
	"TERMINATION",
	"REGULARIZATION",
	"PROMOTION",
	"SALARY_CHANGE",
	"TRANSFER",
];
const DEEP_LINK_PAN_TYPES = [
	"REGULARIZATION",
	"PROMOTION",
	"SALARY_CHANGE",
	"TRANSFER",
	"TERMINATION",
] as const;
type DeepLinkPanType = (typeof DEEP_LINK_PAN_TYPES)[number];

type WorkflowStep = {
	id: string;
	label: string;
	description: string;
	status: "completed" | "current" | "pending";
};

const PersonnelActionPage = () => {
	const { user } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();
	const targetEmployeeId = searchParams.get("targetEmployeeId") || searchParams.get("employeeId");
	const action = searchParams.get("action");
	const requestedIntent = searchParams.get("intent")?.toUpperCase();
	const defaultActionType = DEEP_LINK_PAN_TYPES.includes(requestedIntent as DeepLinkPanType)
		? (requestedIntent as DeepLinkPanType)
		: undefined;

	const employeeId = user?.metadata?.employee?.id || "";
	// Form state
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

	// Auto-open modal if targetEmployeeId is present
	useEffect(() => {
		if (action === "create-pan" && targetEmployeeId) {
			setIsCreateModalOpen(true);
		}
	}, [action, targetEmployeeId]);

	const clearCreatePanDeepLink = () => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.delete("action");
			next.delete("targetEmployeeId");
			next.delete("employeeId");
			next.delete("intent");
			return next;
		});
	};

	// Withdraw state
	const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
	const [withdrawalReason, setWithdrawalReason] = useState("");
	const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

	// Fetch all PAN requests for this employee (or requests created by this employee?)
	// If I am a manager viewing requests I created for others, filter might need adjustment.
	// For now, keep existing behavior for "My Requests" list.
	// Fetch all PAN requests for this employee
	const { data: requestsData, isLoading: isLoadingRequests } = useRequests({
		filter: PAN_REQUEST_TYPES.map((type) => ({ type, requesterId: employeeId })),
		fields: [
			"code",
			"requester.person.personalInfo",
			"requester.employeeId",
			"requester.id",
			"requesterId",
			"targetEmployee.person.personalInfo",
			"targetEmployee.employeeId",
			"targetEmployee.department.name",
			"targetEmployee.position.title",
			"description",
			"type",
			"startDate",
			"endDate",
			"metadata",
			"currentWorkflowStateKey",
			"createdAt",
			"currentStepExecution.stepName",
			"currentStepExecution.stepNumber",
			"currentStepExecution.assigneeType",
			"currentStepExecution.status",
			"currentStepExecution.assignee.person.personalInfo",
			"lastCompletedStepExecution.stepName",
			"lastCompletedStepExecution.completedAt",
		].join(","),
	});

	const requests = (requestsData as any)?.requests || [];
	// Mutations
	const deleteRequestMutation = useDeleteRequest();

	// Withdraw/cancel request methods
	const handleWithdrawClick = (requestId: string) => {
		setSelectedRequestId(requestId);
		setIsWithdrawModalOpen(true);
	};

	const handleConfirmWithdraw = async () => {
		if (!withdrawalReason.trim()) {
			toast.error("Please provide a reason for withdrawal");
			return;
		}

		if (!selectedRequestId) {
			setIsWithdrawModalOpen(false);
			return;
		}

		try {
			await deleteRequestMutation.mutateAsync(selectedRequestId);
			toast.success("Personnel Action request withdrawn");
			setIsWithdrawModalOpen(false);
			setWithdrawalReason("");
			setSelectedRequestId(null);
		} catch (error: any) {
			console.error("Error withdrawing request:", error);
			toast.error(error?.message || "Failed to withdraw request");
		}
	};

	const handleCancelWithdraw = () => {
		setIsWithdrawModalOpen(false);
		setWithdrawalReason("");
		setSelectedRequestId(null);
	};

	// Get PAN subtype label
	const getPanTypeLabel = (subType: string) => {
		const found = PAN_TYPES.find((t) => t.value === subType);
		// If not found in PAN_TYPES, return formatted title case
		if (!found) {
			return (
				subType.charAt(0).toUpperCase() + subType.slice(1).toLowerCase().replace(/_/g, " ")
			);
		}
		return found?.label;
	};

	// DataTable Columns
	const columns: Column<any>[] = [
		{
			key: "code",
			label: "Request Code",
			sortable: true,
			render: (value, item) => (
				<span className="text-sm font-medium ">
					{value || item.id.substring(0, 8).toUpperCase()}
				</span>
			),
		},
		{
			key: "description",
			label: "Request",
			sortable: true,
			render: (value, item) => {
				const targetInfo = item.targetEmployee?.person?.personalInfo;
				const targetName = targetInfo
					? `${targetInfo.firstName || ""} ${targetInfo.lastName || ""}`.trim()
					: "";
				return (
					<div className="space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<PANBadge intent={item.type} />
							<span className="text-sm text-gray-900 dark:text-gray-100 font-medium">
								{value || "No Description"}
							</span>
						</div>
						{targetName && (
							<p className="text-xs text-muted-foreground">
								For {targetName}
								{item.targetEmployee?.employeeId
									? ` (${item.targetEmployee.employeeId})`
									: ""}
							</p>
						)}
					</div>
				);
			},
		},
		{
			key: "createdAt",
			label: "Submitted",
			sortable: true,
			render: (value) => {
				if (!value) return <span className="text-sm text-muted-foreground">N/A</span>;
				try {
					return (
						<span className="text-sm font-medium ">
							{new Date(value).toLocaleDateString()}
						</span>
					);
				} catch (e) {
					return <span className="text-sm text-red-500">Invalid Date</span>;
				}
			},
		},
		{
			key: "status",
			label: "Status",
			sortable: true,
			render: (_value, item) => (
				<div className="space-y-1">
					<PANBadge intent={item.currentWorkflowStateKey || "OPEN"} />
					{item.currentStepExecution?.stepName && (
						<p className="text-xs text-muted-foreground">
							{item.currentStepExecution.stepName}
						</p>
					)}
				</div>
			),
		},
		{
			key: "actions",
			label: "Actions",
			render: (_, item) => {
				const canWithdraw = ["OPEN", "SUBMITTED"].includes(
					String(item.currentWorkflowStateKey || "").toUpperCase(),
				);
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
								<DropdownMenuItem onClick={() => handleViewRequest(item)}>
									<Eye className="mr-2 h-4 w-4" />
									View Details
								</DropdownMenuItem>
								{canWithdraw && (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											className="text-red-600 focus:text-red-600"
											onClick={() => handleWithdrawClick(item.id)}>
											<Trash2 className="mr-2 h-4 w-4" />
											Withdraw
										</DropdownMenuItem>
									</>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				);
			},
		},
	];

	// Detail view state
	const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
	const [selectedRequestForDetail, setSelectedRequestForDetail] = useState<any>(null);

	const handleViewRequest = (request: any) => {
		setSelectedRequestForDetail(request);
		setIsDetailModalOpen(true);
	};

	// Calculate workflow steps based on status
	const getWorkflowSteps = (status: string): WorkflowStep[] => {
		const statusMap: Record<string, number> = {
			NEW: 0,
			OPEN: 1,
			SUBMITTED: 1,
			PENDING: 1,
			FOR_APPROVAL: 2,
			IN_PROCESS: 3,
			PROCESSING: 2,
			APPROVED: 3,
			COMPLETED: 4,
			REJECTED: -1,
			CANCELLED: -1,
		};

		const currentIndex = statusMap[status] ?? 0;

		return [
			{
				id: "submitted",
				label: "Submitted",
				description:
					status === "PENDING"
						? "Awaiting Review"
						: currentIndex > 1
							? "Completed"
							: "Not Submitted",
				status:
					status === "PENDING" ? "current" : currentIndex > 1 ? "completed" : "pending",
			},
			{
				id: "manager",
				label: "Manager Review",
				description:
					status === "PROCESSING"
						? "In Progress"
						: currentIndex > 2
							? "Approved"
							: "Awaiting",
				status:
					status === "PROCESSING"
						? "current"
						: currentIndex > 2
							? "completed"
							: "pending",
			},
			{
				id: "hr",
				label: "HR Review",
				description:
					status === "APPROVED"
						? "Approved"
						: currentIndex > 3
							? "Completed"
							: "Awaiting",
				status:
					status === "APPROVED" ? "current" : currentIndex > 3 ? "completed" : "pending",
			},
			{
				id: "implemented",
				label: "Completed",
				description: status === "COMPLETED" ? "Action Completed" : "Pending",
				status: status === "COMPLETED" ? "completed" : "pending",
			},
		];
	};

	return (
		<div className="min-h-screen p-4 md:p-6 space-y-6">
			<div className="flex items-center justify-end">
				<Button type="button" onClick={() => setIsCreateModalOpen(true)}>
					New PAN Request
				</Button>
			</div>
			<Card className="bg-transparent border-0 p-0">
				<CardContent className="p-0">
					<DataTable
						title="Personnel Action Requests"
						description=""
						data={requests}
						columns={columns}
						isLoading={isLoadingRequests}
						emptyMessage="No personnel action requests found"
						emptyDescription="You haven't submitted any personnel action requests yet."
					/>
				</CardContent>
			</Card>

			{/* Create PAN Modal */}
			<PANRequestModal
				isOpen={isCreateModalOpen}
				onClose={() => {
					setIsCreateModalOpen(false);
					clearCreatePanDeepLink();
				}}
				employeeObjectId={targetEmployeeId || null}
				defaultIntent={defaultActionType}
			/>

			{/* Detail View Modal */}
			<RequestReviewModal
				open={isDetailModalOpen}
				onOpenChange={setIsDetailModalOpen}
				request={selectedRequestForDetail}
				topContent={
					selectedRequestForDetail ? (
						<div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 overflow-x-auto">
							<div className="flex items-center justify-between min-w-[500px]">
								{getWorkflowSteps(
									selectedRequestForDetail.currentWorkflowStateKey || "OPEN",
								).map(
									(step, index, steps) => (
										<div
											key={step.id}
											className="flex items-center flex-1 last:flex-none relative">
											<div className="flex flex-col items-center relative z-10">
												<div
													className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
														step.status === "completed"
															? "bg-green-100 border-green-600 text-green-600"
															: step.status === "current"
																? "bg-primary/10 border-primary text-primary"
																: "bg-gray-100 border-gray-300 text-gray-400"
													}`}>
													{step.status === "completed" ? (
														<CheckCircle2 className="w-5 h-5" />
													) : step.status === "current" ? (
														<div className="w-2.5 h-2.5 rounded-full bg-primary" />
													) : (
														<div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
													)}
												</div>
												<div className="text-center mt-2 w-32">
													<p
														className={`text-xs font-semibold ${
															step.status === "current"
																? "text-primary"
																: step.status === "completed"
																	? "text-green-700"
																	: "text-gray-500"
														}`}>
														{step.label}
													</p>
													<p className="text-[10px] text-gray-400 mt-0.5 max-w-[100px] mx-auto leading-tight">
														{step.description}
													</p>
												</div>
											</div>
											{index < steps.length - 1 && (
												<div
													className={`h-0.5 flex-1 mx-2 -mt-8 transition-colors ${
														step.status === "completed"
															? "bg-green-600"
															: "bg-gray-300"
													}`}
												/>
											)}
										</div>
									),
								)}
							</div>
						</div>
					) : null
				}
				customActions={
					selectedRequestForDetail &&
					["OPEN", "SUBMITTED"].includes(
						String(
							selectedRequestForDetail.currentWorkflowStateKey || "",
						).toUpperCase(),
					) && (
						<Button
							type="button"
							variant="outline"
							onClick={() => handleWithdrawClick(selectedRequestForDetail.id)}
							disabled={deleteRequestMutation.isPending}
							className="hover:cursor-pointer border-red-600 text-red-400 hover:bg-red-900 hover:text-white">
							<Lock className="h-4 w-4 mr-2" />
							{deleteRequestMutation.isPending ? "Withdrawing..." : "Withdraw"}
						</Button>
					)
				}
			/>

			{/* Withdraw Modal */}
			<Dialog open={isWithdrawModalOpen} onOpenChange={setIsWithdrawModalOpen}>
				<DialogContent className="sm:max-w-[500px]">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-amber-500" />
							Withdraw Personnel Action Request
						</DialogTitle>
						<DialogDescription>
							Please provide a reason for withdrawing this request. This action will
							cancel your request.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<label className="block text-sm text-muted-foreground">
								Reason for Withdrawal <span className="text-red-400">*</span>
							</label>
							<div className="relative">
								<textarea
									value={withdrawalReason}
									onChange={(e) => setWithdrawalReason(e.target.value)}
									placeholder="Please explain why you are withdrawing this request..."
									rows={4}
									minLength={10}
									maxLength={500}
									required
									className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow placeholder:text-muted-foreground"
								/>
								<div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
									{withdrawalReason.length} / 500 characters
								</div>
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={handleCancelWithdraw}
							disabled={deleteRequestMutation.isPending}>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={handleConfirmWithdraw}
							disabled={deleteRequestMutation.isPending || !withdrawalReason.trim()}
							className="bg-red-600 hover:bg-red-700 text-white">
							{deleteRequestMutation.isPending
								? "Withdrawing..."
								: "Confirm Withdrawal"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};

export default PersonnelActionPage;
