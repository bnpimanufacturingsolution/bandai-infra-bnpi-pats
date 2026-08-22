import { useState, useEffect } from "react";
import { ArrowLeft, Lock, CheckCircle2, Circle, AlertTriangle, Info } from "lucide-react";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Button } from "~/components/atoms/Button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/atoms/Badge";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { DatePicker } from "~/components/atoms/DatePicker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { useAuth } from "~/lib/hooks/useAuth";
import { useRequests, useCreateRequest, useDeleteRequest } from "~/lib/hooks/useRequests";
import { useBoardingProcessByEmployee } from "~/lib/hooks/useBoardingProcess";
import { ExitClearanceSection } from "~/components/molecules/ExitClearanceSection";
import { ResignationFlowModal } from "~/components/templates/common/ResignationFlowModal";

type WorkflowStep = {
	id: string;
	label: string;
	description: string;
	status: "completed" | "current" | "pending";
};

const ResignationRequest = () => {
	const navigate = useNavigate();
	const { user } = useAuth();
	const employeeId = user?.metadata?.employee?.id || "";
	const organizationId = user?.metadata?.employee?.organizationId || "";

	// Form state
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [lastWorkingDay, setLastWorkingDay] = useState("");
	const [reasonCategory, setReasonCategory] = useState("");
	const [reasonDetails, setReasonDetails] = useState("");
	const [additionalComments, setAdditionalComments] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Withdraw state
	const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
	const [withdrawalReason, setWithdrawalReason] = useState("");
	const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

	const noticePeriodDays = 30;

	// Fetch all resignation requests for this employee
	const { data: requestsData, isLoading: isLoadingRequests } = useRequests({
		page: 1,
		limit: 50, // Fetch more to show history
		filter: [{ type: "RESIGNATION", requesterId: employeeId }],
	});

	const requests = (requestsData as any)?.requests || [];

	// Fetch boarding process for exit clearance display (check if any active)
	const { data: boardingProcess } = useBoardingProcessByEmployee(employeeId, "OFFBOARDING");

	// Mutations
	const createRequestMutation = useCreateRequest();
	const deleteRequestMutation = useDeleteRequest();

	// Reset form when modal opens
	useEffect(() => {
		if (isCreateModalOpen) {
			setLastWorkingDay("");
			setReasonCategory("");
			setReasonDetails("");
			setAdditionalComments("");
		}
	}, [isCreateModalOpen]);

	// Submit resignation request
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!employeeId) {
			toast.error("Employee information not found");
			return;
		}

		if (!lastWorkingDay || !reasonCategory || !reasonDetails) {
			toast.error("Please fill in all required fields");
			return;
		}

		setIsSubmitting(true);

		try {
			await createRequestMutation.mutateAsync({
				organizationId,
				requesterId: employeeId,
				type: "RESIGNATION",
				description: `Voluntary resignation - ${reasonDetails}`,
				startDate: new Date().toISOString(),
				endDate: new Date(lastWorkingDay).toISOString(),
				metadata: {
					reasonCategory,
					reasonDetails,
					additionalComments,
					lastWorkingDay,
					noticePeriodDays,
				},
			});

			toast.success("Resignation request submitted successfully");
			setIsCreateModalOpen(false);
		} catch (error: any) {
			console.error("Error submitting resignation:", error);
			// Display the specific error message from the backend (e.g. duplicate request)
			toast.error(error?.message || "Failed to submit resignation");
		} finally {
			setIsSubmitting(false);
		}
	};

	// Withdraw/cancel resignation methods
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
			toast.success("Resignation request withdrawn");
			setIsWithdrawModalOpen(false);
			setWithdrawalReason("");
			setSelectedRequestId(null);
		} catch (error: any) {
			console.error("Error withdrawing resignation:", error);
			toast.error(error?.message || "Failed to withdraw resignation");
		}
	};

	const handleCancelWithdraw = () => {
		setIsWithdrawModalOpen(false);
		setWithdrawalReason("");
		setSelectedRequestId(null);
	};

	// Get status badge
	const getStatusBadge = (status: string) => {
		const statusStyles: Record<string, { variant: any; label: string }> = {
			NEW: { variant: "secondary", label: "Draft" },
			PENDING: { variant: "warning", label: "Pending Manager Approval" },
			PROCESSING: { variant: "default", label: "Pending HR Approval" },
			APPROVED: { variant: "success", label: "Approved - Exit Clearance" },
			COMPLETED: { variant: "success", label: "Completed" },
			REJECTED: { variant: "destructive", label: "Rejected" },
			CANCELLED: { variant: "secondary", label: "Cancelled" },
		};
		const style = statusStyles[status] || { variant: "default", label: status };

		return <Badge variant={style.variant}>{style.label}</Badge>;
	};

	// DataTable Columns
	const columns: Column<any>[] = [
		{
			key: "code",
			label: "Request Code",
			sortable: true,
			render: (value, item) => (
				<span className="font-medium">
					{value || item.id.substring(0, 8).toUpperCase()}
				</span>
			),
		},
		{
			key: "createdAt",
			label: "Date Applied",
			sortable: true,
			render: (value) => new Date(value).toLocaleDateString(),
		},
		{
			key: "endDate",
			label: "Last Working Day",
			sortable: true,
			render: (value) => new Date(value).toLocaleDateString(),
		},
		{
			key: "status",
			label: "Status",
			sortable: true,
			render: (value) => getStatusBadge(value),
		},
		{
			key: "actions",
			label: "",
			render: (_, item) => {
				const canWithdraw = ["PENDING"].includes(item.status);
				return (
					<div className="flex justify-end gap-2">
						{canWithdraw && (
							<Button
								variant="ghost"
								size="sm"
								className="text-red-500 hover:text-red-700 hover:bg-red-50"
								onClick={() => handleWithdrawClick(item.id)}>
								Withdraw
							</Button>
						)}
					</div>
				);
			},
		},
	];

	// Logic to toggle views
	const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
	const [selectedRequestForDetail, setSelectedRequestForDetail] = useState<any>(null);

	// Handle View Click
	const handleViewRequest = (request: any) => {
		setSelectedRequestForDetail(request);
		setIsDetailModalOpen(true);
	};

	// Calculate workflow steps based on status
	const getWorkflowSteps = (status: string): WorkflowStep[] => {
		const statusMap: Record<string, number> = {
			NEW: 0,
			PENDING: 1,
			PROCESSING: 2,
			APPROVED: 3,
			COMPLETED: 4,
			REJECTED: -1,
			CANCELLED: -1,
		};

		const currentIndex = statusMap[status] ?? 0;

		return [
			{
				id: "draft",
				label: "Draft",
				description: status === "NEW" ? "Fill in details" : "Completed",
				status: status === "NEW" ? "current" : currentIndex > 0 ? "completed" : "pending",
			},
			{
				id: "pending",
				label: "Submitted",
				description:
					status === "PENDING"
						? "Pending Manager Approval"
						: currentIndex > 1
							? "Completed"
							: "Not Submitted",
				status:
					status === "PENDING" ? "current" : currentIndex > 1 ? "completed" : "pending",
			},
			{
				id: "processing",
				label: "Manager Review",
				description:
					status === "PROCESSING"
						? "Pending HR Approval"
						: currentIndex > 2
							? "Completed"
							: "Awaiting Review",
				status:
					status === "PROCESSING"
						? "current"
						: currentIndex > 2
							? "completed"
							: "pending",
			},
			{
				id: "approved",
				label: "HR Review",
				description:
					status === "APPROVED"
						? "Exit Clearance Ready"
						: currentIndex > 3
							? "Completed"
							: "Awaiting Review",
				status:
					status === "APPROVED" ? "current" : currentIndex > 3 ? "completed" : "pending",
			},
			{
				id: "completed",
				label: "Completed",
				description: status === "COMPLETED" ? "Resignation Finalized" : "Not Started",
				status: status === "COMPLETED" ? "completed" : "pending",
			},
		];
	};

	return (
		<div className="min-h-screen p-4 md:p-6 space-y-6">
			{boardingProcess && requests.length > 0 && (
				<ExitClearanceSection
					employeeId={employeeId}
					requestId={
						requests.find(
							(r: any) => r.status === "APPROVED" || r.status === "COMPLETED",
						)?.id || ""
					}
					requestStatus={
						requests.find(
							(r: any) => r.status === "APPROVED" || r.status === "COMPLETED",
						)?.status || ""
					}
					isEmployeeView={true}
				/>
			)}

			<Card className="bg-transparent border-0 p-0">
				<CardContent className="p-0">
					<DataTable
						title="Resignation History"
						description=""
						data={requests}
						columns={columns}
						isLoading={isLoadingRequests}
						onAdd={() => setIsCreateModalOpen(true)}
						onView={handleViewRequest}
						addButtonLabel="Create Resignation Request"
						emptyMessage="No resignation requests found"
						emptyDescription="You haven't submitted any resignation requests yet."
					/>
				</CardContent>
			</Card>

			{/* Detail View Modal */}
			<Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
				<DialogContent className="w-full sm:max-w-[75vw] max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							Request Details
							{selectedRequestForDetail && (
								<Badge
									variant={
										getStatusBadge(selectedRequestForDetail.status).props
											.variant
									}>
									{getStatusBadge(selectedRequestForDetail.status).props.children}
								</Badge>
							)}
						</DialogTitle>
					</DialogHeader>

					<div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4">
						{/* Left Sidebar - Workflow Status */}
						<div className="lg:col-span-4">
							<Card className="h-full">
								<CardHeader className="pb-3">
									<CardTitle className="text-base flex items-center gap-2">
										<div className="w-2 h-2 rounded-full bg-[var(--theme-red)]" />
										Workflow Status
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-1">
									{getWorkflowSteps(
										selectedRequestForDetail?.status || "NEW",
									).map((step, index, steps) => (
										<div
											key={step.id}
											className={`flex gap-3 p-3 rounded-lg transition-colors ${
												step.status === "current"
													? "bg-[var(--red-50)] dark:bg-red-950/20 border border-[var(--red-200)] dark:border-red-900"
													: ""
											}`}>
											<div className="flex flex-col items-center">
												{step.status === "current" ? (
													<div className="w-5 h-5 rounded-full flex items-center justify-center bg-[var(--theme-red)]">
														<div className="w-2 h-2 bg-white rounded-full" />
													</div>
												) : step.status === "completed" ? (
													<CheckCircle2 className="w-5 h-5 text-[var(--theme-red)]" />
												) : (
													<Circle className="w-5 h-5 text-muted-foreground" />
												)}
												{index < steps.length - 1 && (
													<div className="w-0.5 h-8 bg-border mt-1" />
												)}
											</div>
											<div className="flex-1 min-w-0">
												<p
													className={`text-sm font-medium ${
														step.status === "current" ||
														step.status === "completed"
															? "text-foreground"
															: "text-muted-foreground"
													}`}>
													{step.label}
												</p>
												<p className="text-xs text-muted-foreground mt-0.5">
													{step.description}
												</p>
											</div>
										</div>
									))}
								</CardContent>
							</Card>
						</div>

						{/* Main Content */}
						<div className="lg:col-span-8 space-y-6">
							{/* Notice Period Policy */}
							<div className="rounded-lg p-4 bg-[var(--red-50)] border border-[var(--red-300)]">
								<div className="flex gap-3">
									<Info className="h-5 w-5 flex-shrink-0 mt-0.5 text-[var(--theme-red)]" />
									<div className="flex-1">
										<h3 className="text-sm font-medium mb-1 text-[var(--theme-red)]">
											Notice Period Policy
										</h3>
										<p className="text-sm text-muted-foreground">
											Per your employment contract, a minimum notice period of{" "}
											<span className="font-medium">30 days</span> is
											required. Your last working day should be on or after
											the calculated date.
										</p>
									</div>
								</div>
							</div>

							{/* Exit Clearance Section (if in progress AND matching this request) */}
							{boardingProcess && selectedRequestForDetail && (
								<ExitClearanceSection
									employeeId={employeeId}
									requestId={selectedRequestForDetail.id}
									requestStatus={selectedRequestForDetail.status}
									isEmployeeView={true}
								/>
							)}

							{/* Main Details Card */}
							<Card>
								<CardHeader>
									<div className="flex items-center justify-between">
										<CardTitle>Resignation Details</CardTitle>
									</div>
								</CardHeader>
								<CardContent className="space-y-6">
									<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
										<div className="space-y-2">
											<label className="block text-sm font-medium text-muted-foreground">
												Reason for Leaving
											</label>
											<div className="p-3 border-2 rounded-md text-sm">
												{selectedRequestForDetail?.metadata?.reasonCategory
													? selectedRequestForDetail.metadata.reasonCategory.replace(
															/_/g,
															" ",
														)
													: "N/A"}
											</div>
										</div>

										<div className="space-y-2">
											<label className="block text-sm font-medium text-muted-foreground">
												Proposed Last Working Day
											</label>
											<div className="p-3 border-2 rounded-md text-sm">
												{selectedRequestForDetail?.endDate
													? new Date(
															selectedRequestForDetail.endDate,
														).toLocaleDateString()
													: new Date(
															selectedRequestForDetail?.metadata?.lastWorkingDay,
														).toLocaleDateString() || "N/A"}
											</div>
										</div>
									</div>

									<div className="space-y-2">
										<label className="block text-sm font-medium text-muted-foreground">
											Reason Details
										</label>
										<div className="p-3 border-2 rounded-md text-sm min-h-[100px] whitespace-pre-wrap">
											{selectedRequestForDetail?.metadata?.reasonDetails ||
												selectedRequestForDetail?.description ||
												"No details provided"}
										</div>
									</div>

									<div className="space-y-2">
										<label className="block text-sm font-medium text-muted-foreground">
											Additional Comments
										</label>
										<div className="p-3 border-2 rounded-md text-sm">
											{selectedRequestForDetail?.metadata
												?.additionalComments || "No additional comments"}
										</div>
									</div>

									{/* Actions */}
									<div className="flex justify-end pt-4 border-t border-border">
										{selectedRequestForDetail &&
											["PENDING"].includes(
												selectedRequestForDetail.status,
											) && (
												<div className="flex flex-col gap-4 w-full">
													<Button
														type="button"
														variant="outline"
														onClick={() =>
															handleWithdrawClick(
																selectedRequestForDetail.id,
															)
														}
														disabled={deleteRequestMutation.isPending}
														className="hover:cursor-pointer border-red-600 text-red-400 hover:bg-red-900 hover:text-white w-full md:w-auto self-start">
														<Lock className="h-4 w-4 mr-2" />
														{deleteRequestMutation.isPending
															? "Withdrawing..."
															: "Withdraw Request"}
													</Button>

													<div className="rounded-lg p-4 bg-[var(--red-50)] border border-[var(--red-300)]">
														<div className="flex gap-3">
															<Info className="h-5 w-5 flex-shrink-0 mt-0.5 text-[var(--theme-red)]" />
															<div className="flex-1">
																<h3 className="text-sm font-medium mb-1 text-[var(--theme-red)]">
																	Resignation Submitted
																</h3>
																<p className="text-sm text-muted-foreground">
																	Your resignation has been
																	submitted and is awaiting
																	approval. You can still withdraw
																	using the button above.
																</p>
															</div>
														</div>
													</div>
												</div>
											)}
									</div>
								</CardContent>
							</Card>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setIsDetailModalOpen(false)}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Create Resignation Modal (New Flow) */}
			<ResignationFlowModal
				isOpen={isCreateModalOpen}
				onClose={() => setIsCreateModalOpen(false)}
				employeeId={employeeId}
				organizationId={organizationId}
			/>

			{/* Withdraw Modal */}
			<Dialog open={isWithdrawModalOpen} onOpenChange={setIsWithdrawModalOpen}>
				<DialogContent className="sm:max-w-[500px]">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-[var(--theme-red)]" />
							Withdraw Resignation Request
						</DialogTitle>
						<DialogDescription>
							Please provide a reason for withdrawing your resignation. This action
							will cancel your resignation request.
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
									placeholder="Please explain why you are withdrawing your resignation request..."
									rows={4}
									minLength={10}
									maxLength={500}
									required
									className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--theme-red)] focus:border-transparent transition-shadow placeholder:text-muted-foreground"
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
							className="theme-btn hover:opacity-90">
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

export default ResignationRequest;
