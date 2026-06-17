import { useState, useMemo } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { Input } from "~/components/atoms/Input";
import { DatePicker } from "~/components/atoms/DatePicker";
import {
	createTruncatedTextProps,
	truncateTextForExport,
	formatDateTime,
	formatDateForExport,
} from "~/lib/utils/text-utils";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import {
	Eye,
	Trash2,
	MoreVertical,
	Archive,
	Download,
	FileCheck,
	Plus,
	Clock,
	CheckCircle,
	XCircle,
	AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
import { useSearchParams } from "react-router";
import {
	useRequests,
	useRequest,
	useDeleteRequest,
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
import { RequestReviewModal } from "~/components/molecules/RequestReviewModal";

// Helper function to get metadata field
const getMetadataField = (request: Request, field: string): any => {
	if (!request.metadata || typeof request.metadata !== "object") return null;
	return request.metadata?.[field] ?? null;
};

const getRequestState = (request?: Request | null): RequestStatus =>
	(request?.currentWorkflowStateKey as RequestStatus) || "OPEN";

interface DocumentRequestFormData {
	description: string;
	docType: string;
	dueDate: string;
	requestedFrom: string;
	notes?: string;
}

export function DocumentRequestRequestsPage() {
	// URL search params for deep-linked tabs
	const [searchParams, setSearchParams] = useSearchParams();
	const activeTab = (searchParams.get("tab") as RequestStatus) || "PENDING";

	const [isViewModalOpen, setIsViewModalOpen] = useState(false);
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [viewing, setViewing] = useState<Request | null>(null);
	const { user } = useAuth();

	// Helper to change tabs
	const setActiveTab = (tab: RequestStatus) => {
		setSearchParams({ tab });
	};

	// Fetch DOCUMENT_REQUEST requests with status filter (filtered by logged-in user's employeeId)
	const { data: requestsData, isLoading } = useRequests({
		page: 1,
		limit: 100,
		count: true,
		filter: {
			type: "DOCUMENT_REQUEST",
			currentWorkflowStateKey: activeTab,
			requesterId: user?.metadata?.employee?.id,
		},
	});

	const items = (requestsData as any)?.requests || [];

	// Hook to fetch request details for view modal
	const { data: requestDetails, isLoading: isLoadingDetails } = useRequest(viewing?.id || "");

	// Mutation hooks
	const deleteRequestMutation = useDeleteRequest();
	const createRequestMutation = useCreateRequest();

	// React Hook Form for create request
	const {
		register,
		handleSubmit,
		reset,
		control,
		formState: { errors },
	} = useForm<DocumentRequestFormData>({
		defaultValues: {
			description: "",
			docType: "",
			dueDate: "",
			requestedFrom: "",
			notes: "",
		},
	});

	// No filter options - using tabs instead
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

	// Define table columns - exactly as specified
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
				label: "Date Requested",
				width: "150px",
				render: (value) => {
					return (
						<span className="text-gray-900">{value ? formatDateTime(value) : "-"}</span>
					);
				},
			},
			{
				key: "docType",
				label: "Document Type",
				width: "160px",
				render: (value, item) => {
					const docType = getMetadataField(item, "docType");
					return <span className="text-gray-600">{docType || "-"}</span>;
				},
			},
			{
				key: "dueDate",
				label: "Due Date",
				width: "130px",
				render: (value, item) => {
					const dueDate = getMetadataField(item, "dueDate");
					return (
						<span className="text-gray-900">
							{dueDate ? formatDateForExport(dueDate) : "-"}
						</span>
					);
				},
			},
			{
				key: "requestedFrom",
				label: "Requested From",
				width: "160px",
				render: (value, item) => {
					const requestedFrom = getMetadataField(item, "requestedFrom");
					return <span className="text-gray-600">{requestedFrom || "-"}</span>;
				},
			},
		],
		[],
	);

	const handleView = (item: Request) => {
		setViewing(item);
		setIsViewModalOpen(true);
	};

	const handleDelete = (item: Request) => {
		if (!confirm("Delete this document request?")) return;
		deleteRequestMutation.mutate(item.id);
	};

	const handleArchive = (item: Request) => {
		console.log("Archive document request:", item);
	};

	const handleDownload = (item: Request) => {
		console.log("Download document request:", item);
	};

	// Create request handler
	const onCreateSubmit = (data: DocumentRequestFormData) => {
		const requesterId = user?.metadata?.employee?.id;

		if (!requesterId) {
			toast.error(
				"Employee ID is required. Please ensure you have an associated employee record.",
			);
			return;
		}

		const payload = {
			requesterId, // Employee who is making the request
			organizationId: user?.organizationId || "",
			// reviewerId is optional - will be auto-assigned by backend if not provided
			type: "DOCUMENT_REQUEST" as const,
			description: data.description,
			notes: data.notes || undefined,
			metadata: {
				docType: data.docType || "",
				dueDate: data.dueDate || "",
				requestedFrom: data.requestedFrom || "",
			},
		};

		createRequestMutation.mutate(payload, {
			onSuccess: () => {
				toast.success("Document request created successfully");
				setIsCreateModalOpen(false);
				reset();
			},
			onError: (error: any) => {
				toast.error(error?.message || "Failed to create document request");
			},
		});
	};

	const handleOpenCreate = () => {
		reset();
		setIsCreateModalOpen(true);
	};

	const handleCloseCreate = () => {
		setIsCreateModalOpen(false);
		reset();
	};

	// Custom actions renderer with dropdown
	const renderActions = (item: Request) => {
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
					<DropdownMenuItem onClick={() => handleArchive(item)}>
						<Archive className="h-4 w-4 mr-2" />
						Archive
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => handleDownload(item)}>
						<Download className="h-4 w-4 mr-2" />
						Download
					</DropdownMenuItem>
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

	return (
		<div className="space-y-6">
			{/* Page Header with Create Button */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Document Requests</h1>
					<p className="text-gray-600">Manage document requests from employees</p>
				</div>
				<Button
					className="bg-orange-600 hover:bg-orange-700 text-white"
					onClick={handleOpenCreate}>
					<Plus className="w-4 h-4 mr-2" />
					New Document Request
				</Button>
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
				<button
					onClick={() => setActiveTab("CANCELLED")}
					className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
						activeTab === "CANCELLED"
							? "bg-white text-orange-600 shadow-sm"
							: "text-gray-600 hover:text-gray-900"
					}`}>
					<div className="flex items-center justify-center gap-2">
						<AlertCircle className="w-4 h-4" />
						Cancelled
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
				emptyMessage="No document requests found"
				emptyDescription="Document requests will appear here when employees submit them."
				searchWidth="w-80"
				itemsPerPage={10}
				onExportPDF={() => {
					const printWindow = window.open("", "_blank");
					if (printWindow) {
						const tableHTML = `
								<html>
									<head>
										<title>Document Requests Export - PDF</title>
										<style>
											body { font-family: Arial, sans-serif; margin: 20px; }
											h1 { color: #333; margin-bottom: 20px; }
											table { border-collapse: collapse; width: 100%; }
											th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
											th { background-color: #f2f2f2; font-weight: bold; }
										</style>
									</head>
									<body>
										<h1>Document Requests - PDF Export</h1>
										<p>Generated on: ${formatDateTime(new Date())}</p>
										<table>
											<thead>
												<tr>
													<th>Code</th>
													<th>Status</th>
													<th>Date Requested</th>
													<th>Document Type</th>
													<th>Due Date</th>
													<th>Requested From</th>
												</tr>
											</thead>
											<tbody>
												${items
													.map((item: Request) => {
														const docType =
															getMetadataField(item, "docType") ||
															"-";
														const dueDate =
															getMetadataField(item, "dueDate") ||
															"-";
														const requestedFrom =
															getMetadataField(
																item,
																"requestedFrom",
															) || "-";
														const statusBadge = getStatusBadge(
															getRequestState(item),
														);
														return `
												<tr>
													<td>${item.code || "N/A"}</td>
													<td>${statusBadge.label}</td>
													<td>${item.startDate ? formatDateTime(item.startDate) : "-"}</td>
													<td>${docType}</td>
													<td>${dueDate !== "-" ? formatDateForExport(dueDate) : "-"}</td>
													<td>${requestedFrom}</td>
												</tr>
											`;
													})
													.join("")}
											</tbody>
										</table>
									</body>
								</html>
							`;
						printWindow.document.write(tableHTML);
						printWindow.document.close();
						printWindow.print();
					}
				}}
				onExportExcel={() => {
					const csvContent = [
						[
							"Code",
							"Status",
							"Date Requested",
							"Document Type",
							"Due Date",
							"Requested From",
						],
						...items.map((item: Request) => {
							const docType = getMetadataField(item, "docType") || "";
							const dueDate = getMetadataField(item, "dueDate") || "";
							const requestedFrom = getMetadataField(item, "requestedFrom") || "";
							const statusBadge = getStatusBadge(getRequestState(item));
							return [
								item.code || "",
								statusBadge.label,
								item.startDate ? formatDateTime(item.startDate) : "",
								docType,
								dueDate ? formatDateForExport(dueDate) : "",
								requestedFrom,
							];
						}),
					]
						.map((row) => row.map((cell: any) => `"${cell}"`).join(","))
						.join("\n");

					const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
					const link = document.createElement("a");
					const url = URL.createObjectURL(blob);
					link.setAttribute("href", url);
					link.setAttribute(
						"download",
						`document_requests_${new Date().toISOString().split("T")[0]}.csv`,
					);
					link.style.visibility = "hidden";
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
				}}
			/>

			{/* View Details Modal */}
			<RequestReviewModal
				open={isViewModalOpen}
				onOpenChange={(open) => {
					setIsViewModalOpen(open);
					if (!open) {
						setViewing(null);
					}
				}}
				request={(requestDetails as any)?.data || requestDetails || ({} as Request)}
			/>

			{/* Create Document Request Modal */}
			<Modal
				open={isCreateModalOpen}
				onOpenChange={setIsCreateModalOpen}
				title="Create New Document Request"
				description="Submit a new document request for approval">
				<form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-4">
					{/* Description */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Description *
						</label>
						<textarea
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[100px]"
							placeholder="Describe your document request in detail..."
							{...register("description", { required: "Description is required" })}
						/>
						{errors.description && (
							<p className="text-red-600 text-sm mt-1">
								{errors.description.message}
							</p>
						)}
					</div>

					{/* Document Type */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Document Type *
						</label>
						<Input
							type="text"
							placeholder="e.g., Certificate, Contract, ID Card"
							{...register("docType", { required: "Document type is required" })}
						/>
						{errors.docType && (
							<p className="text-red-600 text-sm mt-1">{errors.docType.message}</p>
						)}
					</div>

					{/* Due Date */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Due Date *
						</label>
						<Controller
							control={control}
							name="dueDate"
							rules={{ required: "Due date is required" }}
							render={({ field }) => (
								<DatePicker
									value={field.value}
									onChange={field.onChange}
									placeholder="Select due date"
								/>
							)}
						/>
						{errors.dueDate && (
							<p className="text-red-600 text-sm mt-1">{errors.dueDate.message}</p>
						)}
					</div>

					{/* Requested From */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Requested From *
						</label>
						<Input
							type="text"
							placeholder="e.g., HR Department, Legal, Admin"
							{...register("requestedFrom", {
								required: "Requested from is required",
							})}
						/>
						{errors.requestedFrom && (
							<p className="text-red-600 text-sm mt-1">
								{errors.requestedFrom.message}
							</p>
						)}
					</div>

					{/* Additional Notes */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Additional Notes (optional)
						</label>
						<textarea
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[80px]"
							placeholder="Any additional information..."
							{...register("notes")}
						/>
					</div>

					{/* Form Actions */}
					<div className="flex justify-end gap-3 pt-4">
						<Button
							type="button"
							variant="outline"
							onClick={handleCloseCreate}
							disabled={createRequestMutation.isPending}>
							Cancel
						</Button>
						<Button
							type="submit"
							className="bg-orange-600 hover:bg-orange-700 text-white"
							disabled={createRequestMutation.isPending}>
							{createRequestMutation.isPending ? "Creating..." : "Create Request"}
						</Button>
					</div>
				</form>
			</Modal>
		</div>
	);
}
