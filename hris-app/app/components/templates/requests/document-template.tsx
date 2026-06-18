import { useState, useMemo, useEffect } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { formatDateTime, formatDateForExport } from "~/lib/utils/text-utils";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Eye, MoreVertical, Plus, FileText, ArrowLeft, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams, useNavigate } from "react-router";
import {
	useRequests,
	useRequest,
	useCancelRequest,
	useCreateRequest,
} from "~/lib/hooks/useRequests";
import type { Request, RequestStatus } from "~/services/requests.service";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	DocumentRequestModal,
	type DocumentRequestData,
} from "~/components/organisms/document-request-modal";
import {
	handleDocumentDownload,
	getDocumentTypeLabel as getDocTypeLabel,
	getMetadataField,
} from "~/lib/document-request-handler";
import { RequestReviewModal } from "~/components/molecules/RequestReviewModal";

const getRequestState = (request?: Request | null): RequestStatus =>
	(request?.currentWorkflowStateKey as RequestStatus) || "OPEN";

export function DocumentRequestsPage() {
	// URL search params for deep linking
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();

	const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
	const [itemToCancel, setItemToCancel] = useState<Request | null>(null);
	const { user } = useAuth();

	const employeeId = user?.metadata?.employee?.id || "";

	// Deep link URL params
	const action = searchParams.get("action");
	const id = searchParams.get("id");
	const fromParam = searchParams.get("from");

	// Single request ID for fetching (when action is view)
	const activeRequestId = action === "view" ? id : null;

	// Show back button only if accessed from another page (has from param) with action
	const shouldShowBackButton = !!action && !!fromParam;

	// Helper to update search params
	const updateSearchParams = (fn: (params: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			fn(next);
			return next;
		});
	};

	// Handle back navigation
	const handleBack = () => {
		if (fromParam) {
			// Convert encoded path back (replace - with /)
			const decodedPath = fromParam.replace(/-/g, "/");
			navigate(`/${decodedPath}`);
		} else {
			// Clear action params to return to main view
			updateSearchParams((next) => {
				next.delete("action");
				next.delete("id");
			});
		}
	};

	// Fetch DOCUMENT_REQUEST items
	const { data: requestsData, isLoading } = useRequests({
		page: 1,
		limit: 100,
		count: true,
		filter: {
			type: "DOCUMENT_REQUEST",
			requesterId: employeeId,
		},
	});

	const items = useMemo(() => (requestsData as any)?.requests || [], [requestsData]);

	// Hook to fetch request details for view modal (using deep link ID)
	const { data: activeRequest, isLoading: isLoadingRequest } = useRequest(activeRequestId || "", {
		fields: [
			"id",
			"code",
			"type",
			"currentWorkflowStateKey",
			"description",
			"startDate",
			"endDate",
			"metadata",
			"attachments",
			"notes",
			"createdAt",
			"updatedAt",
			"requester.person.personalInfo",
			"requester.employeeId",
			"requester.id",
			"stepExecutions.id",
			"stepExecutions.stepNumber",
			"stepExecutions.stepName",
			"stepExecutions.stepType",
			"stepExecutions.assigneeType",
			"stepExecutions.status",
			"stepExecutions.completedAt",
			"stepExecutions.comments",
			"stepExecutions.assignee.id",
			"stepExecutions.assignee.employeeId",
			"stepExecutions.assignee.person.personalInfo",
			"stepExecutions.assignee.department.name",
			"stepExecutions.assignee.department.code",
		].join(","),
	});

	// Check if modal should show loading state for deep links
	const isDeepLinkLoading = !!activeRequestId && isLoadingRequest;

	// Mutation hooks
	const cancelRequestMutation = useCancelRequest();
	const createRequestMutation = useCreateRequest();

	// No filter options for now
	const filterOptions: FilterOption[] = [];

	// Get status badge
	const getStatusBadge = (status: RequestStatus) => {
		const statusStyles: Record<
			RequestStatus,
			{ variant: "success" | "secondary" | "destructive" | "default"; label: string }
		> = {
			PENDING: { variant: "default", label: "Pending" },
			APPROVED: { variant: "success", label: "Approved" },
			REJECTED: { variant: "destructive", label: "Rejected" },
			CANCELLED: { variant: "secondary", label: "Cancelled" },
			PROCESSING: { variant: "default", label: "Processing" },
			COMPLETED: { variant: "success", label: "Completed" },
		};
		return statusStyles[status] || { variant: "default", label: status };
	};

	const getDocumentTypeLabel = (value: string) => getDocTypeLabel(value);

	// Define table columns - matching LeaveFlow design
	const columns: Column<Request>[] = useMemo(
		() => [
			{
				key: "documentType",
				label: "Document Type",
				width: "250px",
				render: (value, item) => {
					const docType = getMetadataField(item, "documentType");
					const description = item.description || "";

					return (
						<div className="flex flex-col">
							<span className="font-medium text-gray-900">
								{getDocumentTypeLabel(docType)}
							</span>
							<span className="text-xs text-gray-500 truncate max-w-[180px]">
								{description}
							</span>
						</div>
					);
				},
			},
			{
				key: "createdAt",
				label: "Requested On",
				width: "150px",
				render: (value) => {
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
				render: (_value, item) => {
					const statusBadge = getStatusBadge(getRequestState(item));
					return <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>;
				},
			},
			{
				key: "currentStepExecution",
				label: "Current Step",
				width: "200px",
				render: (value, item) => {
					const currentStep = item.currentStepExecution;
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
				render: (value, item) => {
					const lastStep = item.lastCompletedStepExecution;

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

	// Handle URL search params for deep linking
	useEffect(() => {
		const action = searchParams.get("action");
		const requestId = searchParams.get("requestId");

		if ((action === "delete-request" || action === "cancel-request") && requestId) {
			const item = items.find((i: Request) => i.id === requestId);
			if (item) {
				setItemToCancel(item);
				setIsCancelModalOpen(true);
			}
		} else {
			setIsCancelModalOpen(false);
			setItemToCancel(null);
		}
	}, [searchParams, items]);

	const handleView = (item: Request) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", item.id);
		});
	};

	const handleOpenCancel = (item: Request) => {
		updateSearchParams((next) => {
			next.set("tab", "documents");
			next.set("action", "cancel-request");
			next.set("requestId", item.id);
		});
	};

	const handleCloseCancel = () => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("requestId");
		});
	};

	const confirmCancel = () => {
		if (itemToCancel) {
			cancelRequestMutation.mutate(
				{ id: itemToCancel.id },
				{
					onSuccess: () => {
						handleCloseCancel();
						toast.success("Request cancelled successfully");
					},
					onError: (error: any) => {
						toast.error(error?.message || "Failed to cancel request");
					},
				},
			);
		}
	};

	const handleDownload = async (item: Request) => {
		await handleDocumentDownload(item);
	};

	// Create request handler
	const onCreateSubmit = (data: DocumentRequestData) => {
		const requesterId = user?.metadata?.employee?.id;

		if (!requesterId) {
			toast.error(
				"Employee ID is required. Please ensure you have an associated employee record.",
			);
			return;
		}

		const payload = {
			requesterId,
			organizationId: user?.organizationId || "",
			type: "DOCUMENT_REQUEST" as const,
			description: data.description,
			notes: data.notes || undefined,
			metadata: {
				documentType: data.documentType,
				...(data.year ? { year: data.year } : {}),
			},
		};

		createRequestMutation.mutate(payload, {
			onSuccess: () => {
				toast.success("Document request submitted successfully");
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("id");
				});
			},
			onError: (error: any) => {
				toast.error(error?.message || "Failed to submit document request");
			},
		});
	};

	const handleCloseCreate = () => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};

	// Custom actions renderer with dropdown
	const renderActions = (item: Request) => {
		const requestState = getRequestState(item);
		const canCancel = requestState === "OPEN" || requestState === "FOR_APPROVAL";

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

					{getRequestState(item) === "APPROVED" && (
						<DropdownMenuItem
							onClick={() => {
								const docNum =
									getMetadataField(item, "documentNumber") || item.code;
								navigate(
									`/employee/${employeeId}?tab=documents&action=view-doc&documentNumber=${docNum}`,
								);
							}}>
							<FileText className="h-4 w-4 mr-2" />
							View Document
						</DropdownMenuItem>
					)}

					{getRequestState(item) === "COMPLETED" &&
						getMetadataField(item, "documentNumber") && (
							<DropdownMenuItem
								onClick={() => {
									const docNum =
										getMetadataField(item, "documentNumber") || item.code;
									navigate(
										`/employee/${employeeId}?tab=documents&action=view-doc&documentNumber=${docNum}`,
									);
								}}>
								<FileText className="h-4 w-4 mr-2" />
								View Document
							</DropdownMenuItem>
						)}

					{canCancel && <DropdownMenuSeparator />}
					{canCancel && (
						<DropdownMenuItem
							onClick={() => handleOpenCancel(item)}
							className="text-red-600 focus:text-red-600 focus:bg-red-50">
							<XCircle className="h-4 w-4 mr-2" />
							Cancel Request
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	return (
		<div className="space-y-6">
			{/* Back Button */}
			{shouldShowBackButton && (
				<div className="mb-4">
					<button
						onClick={handleBack}
						className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-primary transition-colors">
						<ArrowLeft className="w-4 h-4" />
						Back
					</button>
				</div>
			)}

			<DataTable
				title="Document Requests"
				description=""
				data={items}
				columns={columns}
				filters={filterOptions}
				searchFields={["code"]}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No document requests found"
				emptyDescription="Document requests will appear here when you submit them."
				searchWidth="w-80"
				itemsPerPage={10}
				onAdd={() => {
					updateSearchParams((next) => {
						next.set("action", "create");
					});
				}}
				addButtonLabel="New Document Request"
			/>

			{/* View Details Modal */}
			<RequestReviewModal
				open={action === "view"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
						});
					}
				}}
				request={activeRequest || null}
				topContent={
					isDeepLinkLoading ? (
						<div className="flex items-center justify-center py-8">
							<div className="text-gray-500">Loading request details...</div>
						</div>
					) : null
				}
			/>

			{/* Cancel Confirmation Modal */}
			<Modal
				open={isCancelModalOpen}
				onOpenChange={(open) => {
					if (!open) handleCloseCancel();
				}}
				title="Cancel Request"
				description="Are you sure you want to cancel this document request? This action cannot be undone."
				className="max-w-md">
				<div className="flex justify-end gap-3 pt-4">
					<Button variant="outline" onClick={handleCloseCancel}>
						Back
					</Button>
					<Button
						variant="destructive"
						onClick={confirmCancel}
						disabled={cancelRequestMutation.isPending}>
						{cancelRequestMutation.isPending ? "Cancelling..." : "Cancel Request"}
					</Button>
				</div>
			</Modal>

			{/* Create Document Request Modal */}
			<DocumentRequestModal
				isOpen={action === "create"}
				onClose={handleCloseCreate}
				onSubmit={onCreateSubmit}
				isPending={createRequestMutation.isPending}
			/>
		</div>
	);
}
