import { useState, useMemo } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { Card, CardContent } from "~/components/atoms/Card";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import {
	Eye,
	Trash2,
	MoreVertical,
	CheckCircle,
	XCircle,
	FileText,
	FileCheck,
	FileQuestion,
	BadgeCheck,
} from "lucide-react";
import { useSearchParams, useNavigate } from "react-router";
import {
	useRequests,
	useRequest,
	useDeleteRequest,
	useGenerateDocument,
	useStartOffboarding,
} from "~/lib/hooks/useRequests";
import { getRequestState, type Request, type RequestStatus } from "~/services/requests.service";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	getMetadataField,
	getDocumentTypeLabel as getDocTypeLabel,
} from "~/lib/document-request-handler";
import { toast } from "sonner";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { RequestReviewModal } from "~/components/molecules/RequestReviewModal";

export function HRDocumentRequestsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const { user } = useAuth();
	const action = searchParams.get("action");
	const urlRequestId = searchParams.get("id");
	const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

	// Update search params helper
	const updateSearchParams = (fn: (params: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			fn(next);
			return next;
		});
	};

	// Fetch DOCUMENT_REQUEST items that are HR actionable or completed
	const { data: requestsData, isLoading } = useRequests({
		page: 1,
		limit: 100,
		count: true,
		filter: "type:DOCUMENT_REQUEST",
		fields: [
			"id",
			"code",
			"type",
			"description",
			"startDate",
			"endDate",
			"metadata",
			"currentWorkflowStateKey",
			"createdAt",
			"requesterId",
			"requester.person.personalInfo",
			"requester.employeeId",
			"requester.id",
			"currentStepExecution.stepType",
			"lastCompletedStepExecution.completedAt",
			"lastCompletedStepExecution.assignee.person.personalInfo",
		].join(","),
	});
	const items = useMemo(
		() =>
			((requestsData as any)?.requests || []).filter((item: Request) => {
				const state = getRequestState(item);
				const isTaskStage = item.currentStepExecution?.stepType === "TASK";
				return (
					state === "APPROVED" ||
					state === "COMPLETED" ||
					((state === "IN_PROCESS" || state === "SUBMITTED") && isTaskStage)
				);
			}),
		[requestsData],
	);

	// Hook to fetch request details for view modal (include step executions for stepper)
	const { data: requestDetails, isLoading: isLoadingDetails } = useRequest(urlRequestId || "", {
		fields: [
			"id",
			"code",
			"type",
			"description",
			"startDate",
			"endDate",
			"metadata",
			"currentWorkflowStateKey",
			"attachments",
			"notes",
			"createdAt",
			"updatedAt",
			"requesterId",
			"requester.person.personalInfo",
			"requester.employeeId",
			"requester.id",
			"currentStepExecution.stepType",
			"currentStepExecution.assigneeType",
			"currentStepExecution.status",
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

	// Mutation hooks
	const deleteRequestMutation = useDeleteRequest();
	const generateDocumentMutation = useGenerateDocument();
	const startOffboardingMutation = useStartOffboarding();

	// No filter options - using tabs instead
	const filterOptions: FilterOption[] = [];

	// Get status badge
	const getStatusBadge = (status: RequestStatus) => {
		const statusStyles: Record<
			RequestStatus,
			{ variant: "success" | "secondary" | "destructive" | "default"; label: string }
		> = {
			PENDING: { variant: "default", label: "Pending" },
			SUBMITTED: { variant: "default", label: "Submitted" },
			APPROVED: { variant: "success", label: "Approved" },
			REJECTED: { variant: "destructive", label: "Rejected" },
			CANCELLED: { variant: "secondary", label: "Cancelled" },
			IN_PROCESS: { variant: "default", label: "In Process" },
			COMPLETED: { variant: "success", label: "Completed" },
		};
		return statusStyles[status] || { variant: "default", label: status };
	};

	const getDocumentTypeLabel = (value: string) => getDocTypeLabel(value);

	const getRequesterName = (item: Request) => {
		const firstName = item.requester?.person?.personalInfo?.firstName || "";
		const lastName = item.requester?.person?.personalInfo?.lastName || "";
		return firstName || lastName ? `${firstName} ${lastName}` : "Unknown Employee";
	};

	const getDocumentRequestState = (request?: Request | null) => getRequestState(request);
	const getDocumentDisplayState = (request?: Request | null): RequestStatus => {
		const state = getDocumentRequestState(request);
		if (state === "SUBMITTED" && getTaskStepStage(request) === "TASK") {
			return "IN_PROCESS";
		}
		return state;
	};
	const getRequesterProfileId = (request?: Request | null): string | null =>
		request?.requesterId || request?.requester?.id || null;
	const getTaskStepStage = (request?: Request | null): "TASK" | null => {
		if (!request) return null;

		if (request.currentStepExecution?.stepType === "TASK") {
			return "TASK";
		}

		const pendingTaskStep = request.stepExecutions?.find(
			(step) => step.stepType === "TASK" && step.status === "PENDING",
		);
		return pendingTaskStep?.stepType === "TASK" ? "TASK" : null;
	};

	const isReadyToGenerate = (request?: Request | null): boolean => {
		if (!request) return false;
		if (Boolean(getMetadataField(request, "documentNumber"))) return false;

		const state = getDocumentRequestState(request);
		if (state === "APPROVED" || state === "COMPLETED") return true;

		const isHrTaskStage =
			(state === "SUBMITTED" || state === "IN_PROCESS") &&
			getTaskStepStage(request) === "TASK";
		return isHrTaskStage;
	};

	// Define table columns
	const columns: Column<Request>[] = useMemo(
		() => [
			{
				key: "requester",
				label: "Employee",
				width: "200px",
				render: (_value, item) => (
					<EmployeeTableCell
						profileId={item.requester?.id || item.requesterId}
						fullName={getRequesterName(item)}
						employeeId={item.requester?.employeeId || "No ID"}
					/>
				),
			},
			{
				key: "documentType",
				label: "Document Type",
				width: "200px",
				render: (value, item) => {
					const docType = getMetadataField(item, "documentType");
					const description = item.description || "";

					return (
						<div className="min-w-0 space-y-0.5">
							<div className="truncate text-sm font-medium text-gray-900">
								{getDocumentTypeLabel(docType)}
							</div>
							<div className="truncate text-xs text-gray-500">{description}</div>
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
				width: "140px",
				render: (_value, item) => {
					const statusBadge = getStatusBadge(getDocumentDisplayState(item));
					return <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>;
				},
			},
			{
				key: "hrAction",
				label: "HR Action",
				width: "180px",
				render: (_value, item) => {
					if (isReadyToGenerate(item)) {
						return (
							<Badge
								variant="default"
								className="bg-blue-50 text-blue-700 border-blue-200">
								Ready to Generate
							</Badge>
						);
					}

					if (Boolean(getMetadataField(item, "documentNumber"))) {
						return <Badge variant="success">Document Generated</Badge>;
					}

					return (
						<span className="text-xs text-gray-500">Waiting for manager/flow step</span>
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
		[navigate],
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
	};

	const handleDelete = (item: Request) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", item.id);
		});
	};

	const confirmDelete = () => {
		if (!urlRequestId) return;
		deleteRequestMutation.mutate(urlRequestId, {
			onSuccess: () => {
				handleCloseModal();
			},
		});
	};

	const handleGenerateDocument = (item: Request) => {
		updateSearchParams((next) => {
			next.set("action", "generate-document");
			next.set("id", item.id);
		});
	};

	const confirmGenerateDocument = async () => {
		if (!urlRequestId) return;

		const item =
			requestDetails?.id === urlRequestId
				? requestDetails
				: items.find((r: Request) => r.id === urlRequestId);

		const docType = item ? getMetadataField(item, "documentType") || "COE" : "COE";

		// Map frontend doc type to backend expected type if needed,
		// but service handles "BIR_FORM_2316" by passing it as type.
		// Backend expects "BIR_2316" or "COE".
		// `getMetadataField` likely returns what was saved.
		// If saved as "BIR_FORM_2316", we might need to adjust.
		// However, standardizing on what the backend expects:

		// Map frontend doc type to backend expected type
		// Backend expects "BIR_2316" or "COE".
		let backendDocType = "COE";

		if (docType) {
			const normalizedType = docType.toUpperCase().replace(/\s+/g, "_");
			if (normalizedType.includes("2316")) {
				backendDocType = "BIR_2316";
			} else if (normalizedType === "COE" || normalizedType.includes("CERTIFICATE")) {
				backendDocType = "COE";
			}
		}

		// Handle all document types via backend
		generateDocumentMutation.mutate(
			{
				requestId: urlRequestId,
				type: backendDocType,
				year: backendDocType === "BIR_2316" ? parseInt(selectedYear) : undefined,
			},
			{
				onSuccess: () => {
					handleCloseModal();
					// Reset year to current
					setSelectedYear(new Date().getFullYear().toString());
				},
			},
		);
	};

	// Custom actions renderer with dropdown
	const renderActions = (item: Request) => {
		const hasDocument = Boolean(getMetadataField(item, "documentNumber"));
		const canGenerate = isReadyToGenerate(item);
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

					{canGenerate && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => handleGenerateDocument(item)}
								className="text-blue-600 focus:text-blue-600 focus:bg-blue-50">
								<FileText className="h-4 w-4 mr-2" />
								Generate Document
							</DropdownMenuItem>
						</>
					)}

					{hasDocument && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => {
									const requesterProfileId = getRequesterProfileId(item);
									if (!requesterProfileId) {
										toast.error("Cannot open document: requester is missing.");
										return;
									}
									const docNum =
										getMetadataField(item, "documentNumber") || item.code;
									navigate(
										`/employee/${requesterProfileId}?tab=documents&action=view-doc&documentNumber=${docNum}`,
									);
								}}
								className="text-indigo-600 focus:text-indigo-600 focus:bg-indigo-50">
								<Eye className="h-4 w-4 mr-2" />
								View Document
							</DropdownMenuItem>
						</>
					)}

					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => handleDelete(item)}
						className="text-red-600 focus:text-red-600 focus:bg-red-50">
						<Trash2 className="h-4 w-4 mr-2" />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
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

	// Calculate metrics from items
	const totalRequests = items.length;
	const pendingCount = items.filter(
		(item: Request) => getDocumentDisplayState(item) === "PENDING",
	).length;
	const approvedCount = items.filter(
		(item: Request) => getDocumentDisplayState(item) === "APPROVED",
	).length;
	const completedCount = items.filter(
		(item: Request) => getDocumentDisplayState(item) === "COMPLETED",
	).length;

	return (
		<div className="space-y-6">
			{/* Metric Stats Cards */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				{/* Total Requests */}
				<Card className="hover:shadow-md transition-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between gap-3">
							{/* Left side - Text info */}
							<div className="space-y-0.5">
								<div className="flex items-center gap-1.5">
									<div className="p-1.5 rounded-lg ">
										<FileText className="h-4 w-4 text-gray-600" />
									</div>
								</div>
								<h3 className="text-xs font-semibold text-gray-700 mt-2">
									Overview
								</h3>
								<div className="space-y-0.25 text-xs flex items-center gap-3">
									<div className="text-gray-500">
										<span className="font-medium">Count</span>
									</div>
									<div className="font-bold text-gray-900">{totalRequests}</div>
								</div>
							</div>

							{/* Right side - Circular progress */}
							<div className="relative flex-shrink-0">
								<CircularProgress percent={100} color="#3b82f6" size={80} />
								<div className="absolute inset-0 flex flex-col items-center justify-center">
									<div className="text-lg font-bold text-gray-900">
										{totalRequests}
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
									<div className="p-1.5 rounded-lg">
										<FileQuestion className="h-4 w-4 text-gray-600" />
									</div>
								</div>
								<h3 className="text-xs font-semibold text-gray-700 mt-2">
									Manager Pending Request
								</h3>
								<div className="space-y-0.25 text-xs flex items-center gap-3">
									<div className="text-gray-500">
										<span className="font-medium">Count</span>
									</div>
									<div className="font-bold text-gray-900">{pendingCount}</div>
								</div>
							</div>

							{/* Right side - Circular progress */}
							<div className="relative flex-shrink-0">
								<CircularProgress
									percent={
										totalRequests > 0 ? (pendingCount / totalRequests) * 100 : 0
									}
									color="#ea580c"
									size={80}
								/>
								<div className="absolute inset-0 flex flex-col items-center justify-center">
									<div className="text-lg font-bold text-gray-900">
										{pendingCount}
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="hover:shadow-md transition-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between gap-3">
							{/* Left side - Text info */}
							<div className="space-y-0.5">
								<div className="flex items-center gap-1.5">
									<div className="p-1.5 rounded-lg ">
										<BadgeCheck className="h-4 w-4 text-gray-600" />
									</div>
								</div>
								<h3 className="text-xs font-semibold text-gray-700 mt-2">
									Approved
								</h3>
								<div className="space-y-0.25 text-xs flex items-center gap-3">
									<div className="text-gray-500">
										<span className="font-medium">Count</span>
									</div>
									<div className="font-bold text-gray-900">{approvedCount}</div>
								</div>
							</div>

							{/* Right side - Circular progress */}
							<div className="relative flex-shrink-0">
								<CircularProgress
									percent={
										totalRequests > 0
											? (approvedCount / totalRequests) * 100
											: 0
									}
									color="#16a34a"
									size={80}
								/>
								<div className="absolute inset-0 flex flex-col items-center justify-center">
									<div className="text-lg font-bold text-gray-900">
										{approvedCount}
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="hover:shadow-md transition-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between gap-3">
							{/* Left side - Text info */}
							<div className="space-y-0.5">
								<div className="flex items-center gap-1.5">
									<div className="p-1.5 rounded-lg ">
										<BadgeCheck className="h-4 w-4 text-gray-600" />
									</div>
								</div>
								<h3 className="text-xs font-semibold text-gray-700 mt-2">
									Completed
								</h3>
								<div className="space-y-0.25 text-xs flex items-center gap-3">
									<div className="text-gray-500">
										<span className="font-medium">Count</span>
									</div>
									<div className="font-bold text-gray-900">{completedCount}</div>
								</div>
							</div>

							{/* Right side - Circular progress */}
							<div className="relative flex-shrink-0">
								<CircularProgress
									percent={
										totalRequests > 0
											? (completedCount / totalRequests) * 100
											: 0
									}
									color="#16a34a"
									size={80}
								/>
								<div className="absolute inset-0 flex flex-col items-center justify-center">
									<div className="text-lg font-bold text-gray-900">
										{completedCount}
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			<DataTable
				title="Document Requests"
				description="Review and manage employee document requests"
				data={items}
				columns={columns}
				filters={filterOptions}
				searchFields={["code"]}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No submitted or in-process task-stage requests found"
				emptyDescription="Document requests ready for HR action will appear here."
				searchWidth="w-80"
				itemsPerPage={10}
			/>

			{/* View Details Modal (Stepper) */}
			<RequestReviewModal
				open={action === "view"}
				onOpenChange={(open: boolean) => {
					if (!open) handleCloseModal();
				}}
				request={requestDetails || null}
				topContent={
					isLoadingDetails ? (
						<div className="flex items-center justify-center py-6">
							<div className="text-gray-500">Loading request details...</div>
						</div>
					) : null
				}
				customActions={
					isReadyToGenerate(requestDetails) ? (
						<Button
							className="hover:cursor-pointer flex-1 md:flex-none bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white h-10 px-5 rounded-lg"
							onClick={() => {
								if (!requestDetails) return;
								handleGenerateDocument(requestDetails);
							}}>
							<div className="flex items-center gap-2">
								<FileText className="w-4 h-4" />
								<span>Generate Document</span>
							</div>
						</Button>
					) : Boolean(getMetadataField(requestDetails, "documentNumber")) ? (
						<Button
							className="hover:cursor-pointer flex-1 md:flex-none bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white h-10 px-5 rounded-lg"
							onClick={() => {
								const requesterProfileId = getRequesterProfileId(requestDetails);
								if (!requesterProfileId) {
									toast.error("Cannot open document: requester is missing.");
									return;
								}
								const docNum =
									getMetadataField(requestDetails, "documentNumber") ||
									requestDetails?.code;
								navigate(
									`/employee/${requesterProfileId}?tab=documents&action=view-doc&documentNumber=${docNum}`,
								);
							}}>
							<div className="flex items-center gap-2">
								<Eye className="w-4 h-4" />
								<span>View Document</span>
							</div>
						</Button>
					) : null
				}
			/>

			{/* Delete Confirmation Modal */}
			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) handleCloseModal();
				}}
				title="Delete Document Request"
				description="Are you sure you want to delete this request? This will permanently remove the record.">
				<div className="flex justify-end gap-3 pt-4">
					<Button
						variant="outline"
						onClick={handleCloseModal}
						disabled={deleteRequestMutation.isPending}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={confirmDelete}
						disabled={deleteRequestMutation.isPending}>
						{deleteRequestMutation.isPending ? "Deleting..." : "Confirm Delete"}
					</Button>
				</div>
			</Modal>

			{/* Generate Document Confirmation Modal */}
			<Modal
				open={action === "generate-document"}
				onOpenChange={(open) => {
					if (!open) handleCloseModal();
				}}
				title="Generate Document"
				description="Are you sure you want to generate this document? This will mark the request as Approved/Completed.">
				{/* Year Selection for BIR 2316 */}
				{(() => {
					const item =
						requestDetails?.id === urlRequestId
							? requestDetails
							: items.find((r: Request) => r.id === urlRequestId);
					const docType = item ? getMetadataField(item, "documentType") : null;

					let showYearSelection = false;
					if (docType) {
						const normalizedType = docType.toUpperCase().replace(/\s+/g, "_");
						if (normalizedType.includes("2316")) {
							showYearSelection = true;
						}
					}

					if (showYearSelection) {
						const currentYear = new Date().getFullYear();
						const years = [currentYear, currentYear - 1, currentYear - 2];

						return (
							<div className="mb-4 space-y-2">
								<label className="text-sm font-medium text-gray-700">
									Taxable Year
								</label>
								<Select value={selectedYear} onValueChange={setSelectedYear}>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select Year" />
									</SelectTrigger>
									<SelectContent>
										{years.map((year) => (
											<SelectItem key={year} value={year.toString()}>
												{year}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-gray-500">
									Select the applicable tax year for this BIR Form 2316.
								</p>
							</div>
						);
					}
					return null;
				})()}

				<div className="flex justify-end gap-3 pt-4">
					<Button variant="outline" onClick={handleCloseModal}>
						Cancel
					</Button>
					<Button
						variant="default"
						className="bg-blue-600 hover:bg-blue-700 text-white"
						onClick={confirmGenerateDocument}
						disabled={generateDocumentMutation.isPending}>
						{generateDocumentMutation.isPending ? "Generating..." : "Generate Document"}
					</Button>
				</div>
			</Modal>
		</div>
	);
}
