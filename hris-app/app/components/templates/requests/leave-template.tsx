import { useMemo, useEffect, useState } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";

import { Badge } from "~/components/atoms/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";

import { formatDateTime, formatDateForExport } from "~/lib/utils/text-utils";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Eye, Trash2, MoreVertical, Calendar, Umbrella, User, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
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
import { LeaveRequestModal } from "~/components/organisms/leave-request-modal";
import { useEmployee } from "~/lib/hooks/useEmployees";
import { useLeaveSettings } from "~/lib/hooks/useLeaveSettings";
import { RequestReviewModal } from "~/components/molecules/RequestReviewModal";

// Helper function to calculate total days
const calculateTotalDays = (startDate?: string, endDate?: string): number | null => {
	if (!startDate || !endDate) return null;
	const start = new Date(startDate);
	const end = new Date(endDate);
	const diffTime = Math.abs(end.getTime() - start.getTime());
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
	return diffDays;
};

// Helper function to get metadata field
const getMetadataField = (request: Request, field: string): any => {
	if (!request.metadata || typeof request.metadata !== "object") return null;
	return request.metadata?.[field] ?? null;
};

const getRequestTotalDays = (request: Request): number | null => {
	const metadataDays = getMetadataField(request, "totalDays");
	if (typeof metadataDays === "number") return metadataDays;
	return calculateTotalDays(request.startDate, request.endDate);
};

const getRequestState = (request?: Request | null): RequestStatus =>
	(request?.currentWorkflowStateKey as RequestStatus) || "OPEN";

interface LeaveRequestFormData {
	description: string;
	startDate: string;
	endDate: string;
	leaveType?: string;
	notes?: string;
}

export function LeaveRequestsPage() {
	// URL search params for deep linking
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
	const [itemToCancel, setItemToCancel] = useState<Request | null>(null);

	const { user } = useAuth();

	const employeeId = user?.metadata?.employee?.id || "";

	// Fetch employee data with leave balances
	const { data: employeeData, isLoading: isLoadingEmployee } = useEmployee(employeeId, [
		"id",
		"leaveBalances",
	]);
	const { data: leavePolicies } = useLeaveSettings();
	const enabledLeaveTypes = new Set(
		(leavePolicies || []).filter((policy) => policy.enabled).map((policy) => policy.leaveType),
	);

	// Deep link URL params
	const action = searchParams.get("action");
	const id = searchParams.get("id");
	const fromParam = searchParams.get("from");
	const initialLeaveType = searchParams.get("leaveType");
	const initialStartDate = searchParams.get("startDate");
	const initialEndDate = searchParams.get("endDate");

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

	// Fetch LEAVE requests (filtered by logged-in user's employeeId) - no tab filtering
	const { data: requestsData, isLoading } = useRequests({
		page: 1,
		limit: 100,
		count: true,
		filter: {
			type: "LEAVE",
			requesterId: employeeId,
		},
	});

	const items = (requestsData as any)?.requests || [];

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

	// Handle URL search params for cancellation modal deep linking
	useEffect(() => {
		const modalAction = searchParams.get("action");
		const requestId = searchParams.get("requestId");

		if (modalAction === "cancel-request" && requestId) {
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

	// React Hook Form for create request
	const {
		register,
		handleSubmit,
		reset,
		control,
		formState: { errors },
	} = useForm<LeaveRequestFormData>({
		defaultValues: {
			description: "",
			startDate: "",
			endDate: "",
			leaveType: "",
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

	// Define table columns - matching LeaveFlow design
	const columns: Column<Request>[] = useMemo(
		() => [
			{
				key: "leaveType",
				label: "Leave Type",
				width: "200px",
				render: (value, item) => {
					const leaveType = getMetadataField(item, "leaveType") || "Leave";
					const description = item.description || "";

					return (
						<div className="flex flex-col">
							<span className="font-medium text-gray-900">{leaveType}</span>
							<span className="text-xs text-gray-500 truncate max-w-[150px]">
								{description}
							</span>
						</div>
					);
				},
			},
			{
				key: "startDate",
				label: "Dates",
				width: "200px",
				render: (value, item) => {
					const startDate = item.startDate ? new Date(item.startDate) : null;
					const endDate = item.endDate ? new Date(item.endDate) : null;

					if (!startDate || !endDate) return <span className="text-gray-400">-</span>;

					const formatDate = (date: Date) => {
						return date.toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
							year: "numeric",
						});
					};

					return (
						<div className="flex flex-col">
							<span className="text-sm font-medium text-gray-900">
								{formatDate(startDate)}
							</span>
							<span className="text-xs text-gray-500">to {formatDate(endDate)}</span>
						</div>
					);
				},
			},
			{
				key: "totalDays",
				label: "Duration",
				width: "100px",
				render: (value, item) => {
					const totalDays = getRequestTotalDays(item);
					if (totalDays === null) return <span className="text-gray-400">-</span>;
					return (
						<span className="font-semibold text-gray-900">
							{totalDays} {totalDays === 1 ? "day" : "days"}
						</span>
					);
				},
			},
			{
				key: "createdAt",
				label: "Applied On",
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
				label: "Last Executed By",
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

	const handleView = (item: Request) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", item.id);
		});
	};

	const handleOpenCancel = (item: Request) => {
		updateSearchParams((next) => {
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
		if (!itemToCancel) return;

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
	};

	// Create request handler
	const onCreateSubmit = (data: {
		leaveType: string;
		startDate: string;
		endDate: string;
		durationUnit: "FULL_DAY" | "HALF_DAY";
		halfDaySession?: "AM" | "PM";
		totalDays: number;
		description: string;
		notes?: string;
	}) => {
		const requesterId = user?.metadata?.employee?.id;
		const organizationId = user?.organizationId || user?.metadata?.employee?.department?.id;

		if (!requesterId) {
			toast.error(
				"Employee ID is required. Please ensure you have an associated employee record.",
			);
			return;
		}

		if (!organizationId) {
			toast.error(
				"Organization ID is required. Please ensure you have an associated employee record.",
			);
			return;
		}

		const payload = {
			requesterId, // Employee who is making the request
			organizationId,
			// reviewerId is optional - will be auto-assigned by backend if not provided
			type: "LEAVE" as const,
			description: data.description,
			startDate: data.startDate || undefined,
			endDate: data.endDate || undefined,
			notes: data.notes || undefined,
			metadata: {
				...(data.leaveType ? { leaveType: data.leaveType } : {}),
				...(data.startDate ? { startDate: data.startDate } : {}),
				...(data.endDate ? { endDate: data.endDate } : {}),
				...(typeof data.totalDays === "number" ? { totalDays: data.totalDays } : {}),
				durationUnit: data.durationUnit,
				...(data.durationUnit === "HALF_DAY" && data.halfDaySession
					? { halfDaySession: data.halfDaySession }
					: {}),
			},
		};

		createRequestMutation.mutate(payload, {
			onSuccess: () => {
				toast.success("Leave request created successfully");
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("id");
				});
			},
			onError: (error: any) => {
				toast.error(error?.message || "Failed to create leave request");
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
		const currentState = getRequestState(item);
		const canCancel = currentState === "OPEN" || currentState === "FOR_APPROVAL";

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
					<DropdownMenuItem
						onClick={() => {
							const leaveType = getMetadataField(item, "leaveType") || "";
							// Format dates to YYYY-MM-DD (remove time/timezone)
							const formatDate = (dateStr: string) => {
								if (!dateStr) return "";
								const date = new Date(dateStr);
								return date.toISOString().split("T")[0];
							};
							const startDate = formatDate(item.startDate || "");
							const endDate = formatDate(item.endDate || "");
							const status = getRequestState(item);
							navigate(
								`/calendar?type=leave&leaveType=${encodeURIComponent(leaveType)}&startDate=${startDate}&endDate=${endDate}&status=${status}&from=employee-requests-leave&requestId=${item.id}`,
							);
						}}>
						<Calendar className="h-4 w-4 mr-2" />
						View Calendar
					</DropdownMenuItem>
					{canCancel && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => handleOpenCancel(item)}
								className="text-red-600 focus:text-red-600 focus:bg-red-50">
								<Trash2 className="h-4 w-4 mr-2" />
								Cancel Request
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	// Helper to get leave type icon and color
	const getLeaveTypeConfig = (leaveType: string) => {
		const type = leaveType.toLowerCase();
		if (type.includes("vacation")) {
			return {
				icon: Umbrella,
				color: "text-blue-600",
				bgColor: "bg-blue-50",
				progressColor: "#3b82f6",
			};
		} else if (type.includes("sick")) {
			return {
				icon: Calendar,
				color: "text-red-600",
				bgColor: "bg-red-50",
				progressColor: "#ef4444",
			};
		} else if (type.includes("personal")) {
			return {
				icon: User,
				color: "text-purple-600",
				bgColor: "bg-purple-50",
				progressColor: "#a855f7",
			};
		}
		return {
			icon: Calendar,
			color: "text-orange-600",
			bgColor: "bg-orange-50",
			progressColor: "#ea580c",
		};
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

			{/* Leave Balance Cards with Circular Progress */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				{isLoadingEmployee ? (
					<>
						{[1, 2, 3].map((i) => (
							<Card key={i} className="animate-pulse">
								<CardContent className="p-4">
									<div className="flex items-center justify-between gap-3">
										<div className="space-y-1.5 flex-1">
											<div className="h-3 bg-gray-200 rounded w-20"></div>
											<div className="h-6 bg-gray-200 rounded w-12"></div>
											<div className="h-2 bg-gray-200 rounded w-16"></div>
										</div>
										<div className="w-20 h-20 bg-gray-200 rounded-full"></div>
									</div>
								</CardContent>
							</Card>
						))}
					</>
				) : (
					employeeData?.leaveBalances
						?.filter(
							(balance: any) =>
								enabledLeaveTypes.size === 0 ||
								enabledLeaveTypes.has(balance.leaveType),
						)
						.map((balance: any, index: number) => {
							const available = balance.available || 0;
							const totalEntitled = balance.totalEntitled || 0;
							const used = balance.used || 0;
							const usagePercent =
								totalEntitled > 0 ? (used / totalEntitled) * 100 : 0;
							const remainingPercent = 100 - usagePercent;
							const config = getLeaveTypeConfig(balance.leaveType || "");
							const Icon = config.icon;

							return (
								<Card key={index} className="hover:shadow-md transition-shadow">
									<CardContent className="p-4">
										<div className="flex items-center justify-between gap-3">
											{/* Left side - Text info */}
											<div className="space-y-0.5">
												<div className="flex items-center gap-1.5">
													<div
														className={`p-1.5 rounded-lg ${config.bgColor}`}></div>
												</div>
												<h3 className="text-xs font-semibold text-gray-700 mt-2">
													{balance.leaveType || "Leave"}
												</h3>
												<div className="space-y-0.25 text-xs">
													<div className="font-bold text-gray-900 text-lg">
														{available}
													</div>
													<div className="text-gray-500 font-medium text-[10px] uppercase">
														Available
													</div>
												</div>
											</div>

											{/* Right side - Circular progress */}
											<div className="relative flex-shrink-0">
												<CircularProgress
													percent={remainingPercent}
													color={config.progressColor}
													size={80}
												/>
												<div className="absolute inset-0 flex flex-col items-center justify-center">
													<div className="text-lg font-bold text-gray-900">
														{available}
													</div>
												</div>
											</div>
										</div>
									</CardContent>
								</Card>
							);
						})
				)}
			</div>

			{/* Search and Filter Section */}

			<DataTable
				title="My Leave Requests"
				description=""
				onAdd={() => {
					updateSearchParams((next) => {
						next.set("action", "create");
						next.delete("id");
					});
				}}
				addButtonLabel="New Request"
				data={items}
				columns={columns}
				filters={filterOptions}
				searchFields={["code"]}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No leave requests found"
				emptyDescription="Leave requests will appear here when employees submit them."
				searchWidth="w-80"
				itemsPerPage={10}
				onExportPDF={() => {
					const printWindow = window.open("", "_blank");
					if (printWindow) {
						const tableHTML = `
								<html>
									<head>
										<title>Leave Requests Export - PDF</title>
										<style>
											body { font-family: Arial, sans-serif; margin: 20px; }
											h1 { color: #333; margin-bottom: 20px; }
											table { border-collapse: collapse; width: 100%; }
											th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
											th { background-color: #f2f2f2; font-weight: bold; }
										</style>
									</head>
									<body>
										<h1>Leave Requests - PDF Export</h1>
										<p>Generated on: ${formatDateTime(new Date())}</p>
										<table>
											<thead>
												<tr>
													<th>Code</th>
													<th>Status</th>
													<th>Start Date</th>
													<th>End Date</th>
													<th>Total Days</th>
													<th>Leave Type</th>
												</tr>
											</thead>
											<tbody>
												${items
													.map((item: Request) => {
														const totalDays = getRequestTotalDays(item);
														const leaveType =
															getMetadataField(item, "leaveType") ||
															"-";
														const statusBadge = getStatusBadge(
															getRequestState(item),
														);
														return `
												<tr>
													<td>${item.code || "N/A"}</td>
													<td>${statusBadge.label}</td>
													<td>${item.startDate ? formatDateForExport(item.startDate) : "-"}</td>
													<td>${item.endDate ? formatDateForExport(item.endDate) : "-"}</td>
													<td>${totalDays !== null ? `${totalDays} days` : "-"}</td>
													<td>${leaveType}</td>
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
						// Headers
						["Code", "Status", "Start Date", "End Date", "Total Days", "Leave Type"],
						// Data rows
						...items.map((item: Request) => {
							const totalDays = getRequestTotalDays(item);
							const leaveType = getMetadataField(item, "leaveType") || "";
							const statusBadge = getStatusBadge(getRequestState(item));
							return [
								item.code || "",
								statusBadge.label,
								item.startDate ? formatDateForExport(item.startDate) : "",
								item.endDate ? formatDateForExport(item.endDate) : "",
								totalDays !== null ? totalDays.toString() : "",
								leaveType,
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
						`leave_requests_${new Date().toISOString().split("T")[0]}.csv`,
					);
					link.style.visibility = "hidden";
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
				}}
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
				description="Are you sure you want to cancel this leave request? This action cannot be undone."
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

			{/* Create Leave Request Modal */}
			<LeaveRequestModal
				isOpen={action === "create"}
				onClose={handleCloseCreate}
				onSubmit={onCreateSubmit}
				isPending={createRequestMutation.isPending}
				initialLeaveType={initialLeaveType || undefined}
				initialStartDate={initialStartDate || undefined}
				initialEndDate={initialEndDate || undefined}
			/>
		</div>
	);
}
