import { useEffect, useState, useMemo } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { Input } from "~/components/atoms/Input";
import { DatePicker } from "~/components/atoms/DatePicker";
import { formatDateTime, formatDateForExport } from "~/lib/utils/text-utils";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import {
	Eye,
	Trash2,
	MoreVertical,
	Archive,
	Download,
	Plus,
	Clock,
	CheckCircle,
	XCircle,
	AlertCircle,
	Timer,
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
import type { Request, RequestStatus, RequestType } from "~/services/requests.service";
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

interface TimeRequestFormData {
	description: string;
	date: string;
	overtimeHours?: number;
	adjustmentType?: string;
	reason?: string;
	notes?: string;
}

type TimeRequestType = "OVERTIME" | "TIME_ADJUSTMENT";

export function TimeRequestsPage() {
	// URL search params for deep-linked tabs
	const [searchParams, setSearchParams] = useSearchParams();
	const activeRequestType = (searchParams.get("type") as TimeRequestType) || "OVERTIME";
	const activeStatusTab = (searchParams.get("tab") as RequestStatus) || "PENDING";
	const createDateParam = searchParams.get("date") || "";
	const shouldOpenCreateFromUrl = searchParams.get("action") === "create";

	const [isViewModalOpen, setIsViewModalOpen] = useState(false);
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [viewing, setViewing] = useState<Request | null>(null);
	const { user } = useAuth();

	// Helper to change request type
	const setActiveRequestType = (type: TimeRequestType) => {
		setSearchParams({ type, tab: activeStatusTab });
	};

	// Helper to change status tabs
	const setActiveStatusTab = (tab: RequestStatus) => {
		setSearchParams({ type: activeRequestType, tab });
	};

	// Fetch requests with status filter (filtered by logged-in user's employeeId and request type)
	const { data: requestsData, isLoading } = useRequests({
		page: 1,
		limit: 100,
		count: true,
		filter: {
			type: activeRequestType,
			currentWorkflowStateKey: activeStatusTab,
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
	} = useForm<TimeRequestFormData>({
		defaultValues: {
			description: "",
			date: "",
			overtimeHours: 0,
			adjustmentType: "",
			reason: "",
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

	// Define table columns - dynamic based on request type
	const columns: Column<Request>[] = useMemo(() => {
		const baseColumns: Column<Request>[] = [
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
				key: "date",
				label: "Date",
				width: "130px",
				render: (value, item) => {
					const date = getMetadataField(item, "date") || item.startDate;
					return (
						<span className="text-gray-900">
							{date ? formatDateForExport(date) : "-"}
						</span>
					);
				},
			},
		];

		if (activeRequestType === "OVERTIME") {
			return [
				...baseColumns,
				{
					key: "overtimeHours",
					label: "Overtime Hours",
					width: "140px",
					render: (value, item) => {
						const hours = getMetadataField(item, "overtimeHours");
						if (hours === null || hours === undefined)
							return <span className="text-gray-400">-</span>;
						return <span className="font-medium text-gray-900">{hours} hrs</span>;
					},
				},
			];
		} else {
			return [
				...baseColumns,
				{
					key: "adjustmentType",
					label: "Adjustment Type",
					width: "150px",
					render: (value, item) => {
						const type = getMetadataField(item, "adjustmentType");
						return <span className="text-gray-900">{type || "-"}</span>;
					},
				},
				{
					key: "reason",
					label: "Reason",
					width: "200px",
					render: (value, item) => {
						const reason = getMetadataField(item, "reason");
						return (
							<span className="text-gray-900">
								{reason && reason.length > 50
									? `${reason.substring(0, 50)}...`
									: reason || "-"}
							</span>
						);
					},
				},
			];
		}
	}, [activeRequestType]);

	const handleView = (item: Request) => {
		setViewing(item);
		setIsViewModalOpen(true);
	};

	const handleDelete = (item: Request) => {
		if (
			!confirm(
				`Delete this ${activeRequestType === "OVERTIME" ? "overtime" : "time adjustment"} request?`,
			)
		)
			return;
		deleteRequestMutation.mutate(item.id);
	};

	const handleArchive = (item: Request) => {
		console.log("Archive time request:", item);
		// Add archive functionality here
	};

	const handleDownload = (item: Request) => {
		console.log("Download time request:", item);
		// Add download functionality here
	};

	// Create request handler
	const onCreateSubmit = (data: TimeRequestFormData) => {
		const requesterId = user?.metadata?.employee?.id;

		if (!requesterId) {
			toast.error(
				"Employee ID is required. Please ensure you have an associated employee record.",
			);
			return;
		}

		const metadata =
			activeRequestType === "OVERTIME"
				? {
						date: data.date || "",
						overtimeHours: data.overtimeHours || 0,
					}
				: {
						date: data.date || "",
						adjustmentType: data.adjustmentType || "",
						reason: data.reason || "",
					};

		const payload = {
			requesterId,
			type: activeRequestType as RequestType,
			description: data.description,
			startDate: data.date || undefined,
			notes: data.notes || undefined,
			metadata,
		};

		createRequestMutation.mutate(payload, {
			onSuccess: () => {
				toast.success(
					`${activeRequestType === "OVERTIME" ? "Overtime" : "Time adjustment"} request created successfully`,
				);
				setIsCreateModalOpen(false);
				reset();
				setSearchParams((prev) => {
					const next = new URLSearchParams(prev);
					next.delete("action");
					next.delete("date");
					return next;
				});
			},
			onError: (error: any) => {
				toast.error(
					error?.message ||
						`Failed to create ${activeRequestType === "OVERTIME" ? "overtime" : "time adjustment"} request`,
				);
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
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.delete("action");
			next.delete("date");
			return next;
		});
	};

	useEffect(() => {
		if (!shouldOpenCreateFromUrl) return;
		reset({
			description: "",
			date: createDateParam,
			overtimeHours: 0,
			adjustmentType: activeRequestType === "TIME_ADJUSTMENT" ? "Schedule/day issue" : "",
			reason: "",
			notes: "",
		});
		setIsCreateModalOpen(true);
	}, [activeRequestType, createDateParam, reset, shouldOpenCreateFromUrl]);

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
					<h1 className="text-2xl font-bold text-gray-900">Time Requests</h1>
					<p className="text-gray-600">Manage overtime and time adjustment requests</p>
				</div>
				<Button
					className="bg-orange-600 hover:bg-orange-700 text-white"
					onClick={handleOpenCreate}>
					<Plus className="w-4 h-4 mr-2" />
					New {activeRequestType === "OVERTIME" ? "Overtime" : "Time Adjustment"} Request
				</Button>
			</div>

			{/* Request Type Tabs */}
			<div className="flex space-x-1 bg-gray-50 p-1 rounded-lg border">
				<button
					onClick={() => setActiveRequestType("OVERTIME")}
					className={`flex-1 py-2.5 px-4 text-sm font-medium rounded-md transition-colors ${
						activeRequestType === "OVERTIME"
							? "bg-white text-orange-600 shadow-sm"
							: "text-gray-600 hover:text-gray-900"
					}`}>
					<div className="flex items-center justify-center gap-2">
						<Timer className="w-4 h-4" />
						Overtime Requests
					</div>
				</button>
				<button
					onClick={() => setActiveRequestType("TIME_ADJUSTMENT")}
					className={`flex-1 py-2.5 px-4 text-sm font-medium rounded-md transition-colors ${
						activeRequestType === "TIME_ADJUSTMENT"
							? "bg-white text-orange-600 shadow-sm"
							: "text-gray-600 hover:text-gray-900"
					}`}>
					<div className="flex items-center justify-center gap-2">
						<Clock className="w-4 h-4" />
						Time Adjustments
					</div>
				</button>
			</div>

			{/* Status Tab Navigation */}
			<div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
				<button
					onClick={() => setActiveStatusTab("PENDING")}
					className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
						activeStatusTab === "PENDING"
							? "bg-white text-orange-600 shadow-sm"
							: "text-gray-600 hover:text-gray-900"
					}`}>
					<div className="flex items-center justify-center gap-2">
						<Clock className="w-4 h-4" />
						Pending
					</div>
				</button>
				<button
					onClick={() => setActiveStatusTab("APPROVED")}
					className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
						activeStatusTab === "APPROVED"
							? "bg-white text-orange-600 shadow-sm"
							: "text-gray-600 hover:text-gray-900"
					}`}>
					<div className="flex items-center justify-center gap-2">
						<CheckCircle className="w-4 h-4" />
						Approved
					</div>
				</button>
				<button
					onClick={() => setActiveStatusTab("REJECTED")}
					className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
						activeStatusTab === "REJECTED"
							? "bg-white text-orange-600 shadow-sm"
							: "text-gray-600 hover:text-gray-900"
					}`}>
					<div className="flex items-center justify-center gap-2">
						<XCircle className="w-4 h-4" />
						Rejected
					</div>
				</button>
				<button
					onClick={() => setActiveStatusTab("CANCELLED")}
					className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
						activeStatusTab === "CANCELLED"
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
				emptyMessage={`No ${activeRequestType === "OVERTIME" ? "overtime" : "time adjustment"} requests found`}
				emptyDescription={`${activeRequestType === "OVERTIME" ? "Overtime" : "Time adjustment"} requests will appear here when you submit them.`}
				searchWidth="w-80"
				itemsPerPage={10}
				onExportPDF={() => {
					const printWindow = window.open("", "_blank");
					if (printWindow) {
						const headers =
							activeRequestType === "OVERTIME"
								? ["Code", "Status", "Date", "Overtime Hours"]
								: ["Code", "Status", "Date", "Adjustment Type", "Reason"];
						const tableHTML = `
								<html>
									<head>
										<title>${activeRequestType === "OVERTIME" ? "Overtime" : "Time Adjustment"} Requests Export - PDF</title>
										<style>
											body { font-family: Arial, sans-serif; margin: 20px; }
											h1 { color: #333; margin-bottom: 20px; }
											table { border-collapse: collapse; width: 100%; }
											th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
											th { background-color: #f2f2f2; font-weight: bold; }
										</style>
									</head>
									<body>
										<h1>${activeRequestType === "OVERTIME" ? "Overtime" : "Time Adjustment"} Requests - PDF Export</h1>
										<p>Generated on: ${formatDateTime(new Date())}</p>
										<table>
											<thead>
												<tr>
													${headers.map((h) => `<th>${h}</th>`).join("")}
												</tr>
											</thead>
											<tbody>
												${items
													.map((item: Request) => {
														const date =
															getMetadataField(item, "date") ||
															item.startDate ||
															"-";
														const statusBadge = getStatusBadge(
															getRequestState(item),
														);
														if (activeRequestType === "OVERTIME") {
															const hours =
																getMetadataField(
																	item,
																	"overtimeHours",
																) || "-";
															return `
												<tr>
													<td>${item.code || "N/A"}</td>
													<td>${statusBadge.label}</td>
													<td>${date !== "-" ? formatDateForExport(date) : "-"}</td>
													<td>${hours !== "-" ? `${hours} hrs` : "-"}</td>
												</tr>
											`;
														} else {
															const adjustmentType =
																getMetadataField(
																	item,
																	"adjustmentType",
																) || "-";
															const reason =
																getMetadataField(item, "reason") ||
																"-";
															return `
												<tr>
													<td>${item.code || "N/A"}</td>
													<td>${statusBadge.label}</td>
													<td>${date !== "-" ? formatDateForExport(date) : "-"}</td>
													<td>${adjustmentType}</td>
													<td>${reason}</td>
												</tr>
											`;
														}
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
					const headers =
						activeRequestType === "OVERTIME"
							? ["Code", "Status", "Date", "Overtime Hours"]
							: ["Code", "Status", "Date", "Adjustment Type", "Reason"];
					const csvContent = [
						headers,
						...items.map((item: Request) => {
							const date = getMetadataField(item, "date") || item.startDate || "";
							const statusBadge = getStatusBadge(getRequestState(item));
							if (activeRequestType === "OVERTIME") {
								const hours = getMetadataField(item, "overtimeHours") || "";
								return [
									item.code || "",
									statusBadge.label,
									date ? formatDateForExport(date) : "",
									hours ? hours.toString() : "",
								];
							} else {
								const adjustmentType =
									getMetadataField(item, "adjustmentType") || "";
								const reason = getMetadataField(item, "reason") || "";
								return [
									item.code || "",
									statusBadge.label,
									date ? formatDateForExport(date) : "",
									adjustmentType,
									reason,
								];
							}
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
						`${activeRequestType === "OVERTIME" ? "overtime" : "time_adjustment"}_requests_${new Date().toISOString().split("T")[0]}.csv`,
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
				title={`${activeRequestType === "OVERTIME" ? "Overtime" : "Time Adjustment"} Request Details`}
				description="View request information">
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
									Date
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									<span className="text-gray-900">
										{(() => {
											const date =
												getMetadataField(requestDetails, "date") ||
												requestDetails.startDate;
											return date ? formatDateTime(date) : "Not specified";
										})()}
									</span>
								</div>
							</div>
							{activeRequestType === "OVERTIME" ? (
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Overtime Hours
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										<span className="text-gray-900">
											{(() => {
												const hours = getMetadataField(
													requestDetails,
													"overtimeHours",
												);
												return hours !== null && hours !== undefined
													? `${hours} hrs`
													: "Not specified";
											})()}
										</span>
									</div>
								</div>
							) : (
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Adjustment Type
									</label>
									<div className="p-3 bg-gray-50 rounded-md border">
										<span className="text-gray-900">
											{getMetadataField(requestDetails, "adjustmentType") ||
												"Not specified"}
										</span>
									</div>
								</div>
							)}
						</div>

						{activeRequestType === "TIME_ADJUSTMENT" && (
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Reason
								</label>
								<div className="p-3 bg-gray-50 rounded-md border min-h-[60px]">
									<span className="text-gray-900">
										{getMetadataField(requestDetails, "reason") ||
											"Not specified"}
									</span>
								</div>
							</div>
						)}

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

			{/* Create Request Modal */}
			<Modal
				open={isCreateModalOpen}
				onOpenChange={(open) => {
					if (open) {
						setIsCreateModalOpen(true);
					} else {
						handleCloseCreate();
					}
				}}
				title={`Create New ${activeRequestType === "OVERTIME" ? "Overtime" : "Time Adjustment"} Request`}
				description={`Submit a new ${activeRequestType === "OVERTIME" ? "overtime" : "time adjustment"} request for approval`}>
				<form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-4">
					{/* Description */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Description *
						</label>
						<textarea
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[100px]"
							placeholder={`Describe your ${activeRequestType === "OVERTIME" ? "overtime" : "time adjustment"} request in detail...`}
							{...register("description", { required: "Description is required" })}
						/>
						{errors.description && (
							<p className="text-red-600 text-sm mt-1">
								{errors.description.message}
							</p>
						)}
					</div>

					{/* Date */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Date *
						</label>
						<Controller
							control={control}
							name="date"
							rules={{ required: "Date is required" }}
							render={({ field }) => (
								<DatePicker
									value={field.value}
									onChange={field.onChange}
									placeholder="Select date"
								/>
							)}
						/>
						{errors.date && (
							<p className="text-red-600 text-sm mt-1">{errors.date.message}</p>
						)}
					</div>

					{/* Conditional fields based on request type */}
					{activeRequestType === "OVERTIME" ? (
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Overtime Hours *
							</label>
							<Input
								type="number"
								step="0.5"
								min="0"
								placeholder="0.0"
								{...register("overtimeHours", {
									required: "Overtime hours is required",
									valueAsNumber: true,
									min: { value: 0, message: "Overtime hours must be positive" },
								})}
							/>
							{errors.overtimeHours && (
								<p className="text-red-600 text-sm mt-1">
									{errors.overtimeHours.message}
								</p>
							)}
						</div>
					) : (
						<>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Adjustment Type *
								</label>
								<Input
									type="text"
									placeholder="e.g., Clock In/Out Correction, Break Time Adjustment"
									{...register("adjustmentType", {
										required: "Adjustment type is required",
									})}
								/>
								{errors.adjustmentType && (
									<p className="text-red-600 text-sm mt-1">
										{errors.adjustmentType.message}
									</p>
								)}
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Reason *
								</label>
								<textarea
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[80px]"
									placeholder="Explain why this adjustment is needed..."
									{...register("reason", {
										required: "Reason is required",
									})}
								/>
								{errors.reason && (
									<p className="text-red-600 text-sm mt-1">
										{errors.reason.message}
									</p>
								)}
							</div>
						</>
					)}

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
const getRequestState = (request?: Request | null): RequestStatus =>
	(request?.currentWorkflowStateKey as RequestStatus) || "OPEN";
