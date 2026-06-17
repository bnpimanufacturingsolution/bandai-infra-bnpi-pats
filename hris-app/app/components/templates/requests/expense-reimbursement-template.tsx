import { useState, useMemo } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { Input } from "~/components/atoms/Input";
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
	DollarSign,
	Plus,
	Clock,
	CheckCircle,
	XCircle,
	AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
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

// Helper function to get metadata field
const getMetadataField = (request: Request, field: string): any => {
	if (!request.metadata || typeof request.metadata !== "object") return null;
	return request.metadata?.[field] ?? null;
};

const getRequestState = (request?: Request | null): RequestStatus =>
	(request?.currentWorkflowStateKey as RequestStatus) || "OPEN";

interface ExpenseReimbursementRequestFormData {
	description: string;
	amount: number;
	currency: string;
	expenseCategory: string;
	notes?: string;
}

export function ExpenseReimbursementRequestsPage() {
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

	// Fetch EXPENSE_REIMBURSEMENT requests with status filter (filtered by logged-in user's employeeId)
	const { data: requestsData, isLoading } = useRequests({
		page: 1,
		limit: 100,
		count: true,
		filter: {
			type: "EXPENSE_REIMBURSEMENT",
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
		formState: { errors },
	} = useForm<ExpenseReimbursementRequestFormData>({
		defaultValues: {
			description: "",
			amount: 0,
			currency: "₱",
			expenseCategory: "",
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

	const handleDelete = (item: Request) => {
		if (!confirm("Delete this expense reimbursement request?")) return;
		deleteRequestMutation.mutate(item.id);
	};

	const handleArchive = (item: Request) => {
		console.log("Archive expense reimbursement request:", item);
	};

	const handleDownload = (item: Request) => {
		console.log("Download expense reimbursement request:", item);
	};

	// Create request handler
	const onCreateSubmit = (data: ExpenseReimbursementRequestFormData) => {
		const requesterId = user?.metadata?.employee?.id;

		if (!requesterId) {
			toast.error(
				"Employee ID is required. Please ensure you have an associated employee record.",
			);
			return;
		}

		const payload = {
			requesterId, // Employee who is making the request
			// reviewerId is optional - will be auto-assigned by backend if not provided
			type: "EXPENSE_REIMBURSEMENT" as const,
			description: data.description,
			amount: data.amount || 0,
			notes: data.notes || undefined,
			metadata: {
				amount: data.amount || 0,
				currency: data.currency || "₱",
				expenseCategory: data.expenseCategory || "",
			},
		};

		createRequestMutation.mutate(payload, {
			onSuccess: () => {
				toast.success("Expense reimbursement request created successfully");
				setIsCreateModalOpen(false);
				reset();
			},
			onError: (error: any) => {
				toast.error(error?.message || "Failed to create expense reimbursement request");
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
					<h1 className="text-2xl font-bold text-gray-900">
						Expense Reimbursement Requests
					</h1>
					<p className="text-gray-600">
						Manage expense reimbursement requests from employees
					</p>
				</div>
				<Button
					className="bg-orange-600 hover:bg-orange-700 text-white"
					onClick={handleOpenCreate}>
					<Plus className="w-4 h-4 mr-2" />
					New Expense Reimbursement Request
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
				emptyMessage="No expense reimbursement requests found"
				emptyDescription="Expense reimbursement requests will appear here when employees submit them."
				searchWidth="w-80"
				itemsPerPage={10}
				onExportPDF={() => {
					const printWindow = window.open("", "_blank");
					if (printWindow) {
						const tableHTML = `
								<html>
									<head>
										<title>Expense Reimbursement Requests Export - PDF</title>
										<style>
											body { font-family: Arial, sans-serif; margin: 20px; }
											h1 { color: #333; margin-bottom: 20px; }
											table { border-collapse: collapse; width: 100%; }
											th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
											th { background-color: #f2f2f2; font-weight: bold; }
										</style>
									</head>
									<body>
										<h1>Expense Reimbursement Requests - PDF Export</h1>
										<p>Generated on: ${formatDateTime(new Date())}</p>
										<table>
											<thead>
												<tr>
													<th>Code</th>
													<th>Status</th>
													<th>Amount</th>
													<th>Currency</th>
													<th>Expense Category</th>
													<th>Description</th>
													<th>Created At</th>
												</tr>
											</thead>
											<tbody>
												${items
													.map((item: Request) => {
														const amount =
															item.amount ??
															getMetadataField(item, "amount");
														const currency =
															getMetadataField(item, "currency") ||
															"₱";
														const category =
															getMetadataField(
																item,
																"expenseCategory",
															) || "-";
														const statusBadge = getStatusBadge(
															getRequestState(item),
														);
														return `
												<tr>
													<td>${item.code || "N/A"}</td>
													<td>${statusBadge.label}</td>
													<td>${amount !== null && amount !== undefined ? `${currency}${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}</td>
													<td>${currency}</td>
													<td>${category}</td>
													<td>${truncateTextForExport(item.description, 50)}</td>
													<td>${formatDateTime(item.createdAt)}</td>
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
						["Code", "Status", "Amount", "Currency", "Expense Category"],
						...items.map((item: Request) => {
							const amount = item.amount ?? getMetadataField(item, "amount");
							const currency = getMetadataField(item, "currency") || "₱";
							const category = getMetadataField(item, "expenseCategory") || "";
							const statusBadge = getStatusBadge(getRequestState(item));
							return [
								item.code || "",
								statusBadge.label,
								amount !== null && amount !== undefined ? amount.toString() : "",
								currency,
								category,
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
						`expense_reimbursement_requests_${new Date().toISOString().split("T")[0]}.csv`,
					);
					link.style.visibility = "hidden";
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
				}}
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
				description="View expense reimbursement request information">
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

						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Created At
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									<span className="text-gray-900">
										{formatDateTime(requestDetails.createdAt)}
									</span>
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Updated At
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									<span className="text-gray-900">
										{formatDateTime(requestDetails.updatedAt)}
									</span>
								</div>
							</div>
						</div>

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

			{/* Create Expense Reimbursement Request Modal */}
			<Modal
				open={isCreateModalOpen}
				onOpenChange={setIsCreateModalOpen}
				title="Create New Expense Reimbursement Request"
				description="Submit a new expense reimbursement request for approval">
				<form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-4">
					{/* Description */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Description *
						</label>
						<textarea
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[100px]"
							placeholder="Describe your expense reimbursement request in detail..."
							{...register("description", { required: "Description is required" })}
						/>
						{errors.description && (
							<p className="text-red-600 text-sm mt-1">
								{errors.description.message}
							</p>
						)}
					</div>

					{/* Amount and Currency */}
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Amount (₱) *
							</label>
							<Input
								type="number"
								step="0.01"
								min="0"
								placeholder="0.00"
								{...register("amount", {
									required: "Amount is required",
									valueAsNumber: true,
									min: { value: 0, message: "Amount must be positive" },
								})}
							/>
							{errors.amount && (
								<p className="text-red-600 text-sm mt-1">{errors.amount.message}</p>
							)}
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Currency *
							</label>
							<Input
								type="text"
								placeholder="₱"
								{...register("currency", { required: "Currency is required" })}
							/>
							{errors.currency && (
								<p className="text-red-600 text-sm mt-1">
									{errors.currency.message}
								</p>
							)}
						</div>
					</div>

					{/* Expense Category */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Expense Category *
						</label>
						<Input
							type="text"
							placeholder="e.g., Travel, Meals, Office Supplies"
							{...register("expenseCategory", {
								required: "Expense category is required",
							})}
						/>
						{errors.expenseCategory && (
							<p className="text-red-600 text-sm mt-1">
								{errors.expenseCategory.message}
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
