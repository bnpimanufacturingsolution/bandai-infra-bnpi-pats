import { AlertCircle, Bell, Camera, ClipboardCheck, Clock, ExternalLink, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/atoms/Button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Modal } from "~/components/atoms/Modal";
import { Skeleton } from "~/components/ui/skeleton";
import { useAuth } from "~/lib/hooks/use-auth";
import { useDashboardActionItems } from "~/lib/hooks/useMetrics";
import { resolveNotificationTarget } from "~/lib/notification-navigation";
import type { ActionMetricDashboardItem, ActionMetricPriority } from "~/services/metrics.service";
import type { DashboardRole } from "../role-dashboard.types";

interface ActionNeededCardProps {
	role: DashboardRole;
}

const MODAL_ITEMS_PER_PAGE = 5;
const HR_TICKET_REQUEST_TYPES = new Set([
	"DOCUMENT_REQUEST",
	"OTHER",
	"RESIGNATION",
	"TERMINATION",
	"TRANSFER",
	"REGULARIZATION",
	"PROMOTION",
	"SALARY_CHANGE",
	"SCHEDULE_CHANGE",
]);
const isHrTicketRole = (role?: string | null) =>
	role === "hris-hr-manager" || role === "hris-hr-user" || role === "hris-admin";
const isApprovalLikeItem = (kind: ActionMetricDashboardItem["kind"]) =>
	kind === "APPROVAL_REQUEST" || kind === "PAN_APPROVAL";

const isOptionalDocumentWarning = (item: ActionMetricDashboardItem) =>
	item.kind === "ONBOARDING_DOCUMENT" &&
	String(item.metadata?.priorityState || "")
		.trim()
		.toLowerCase() === "optional";

const getDocumentWorkflowBadge = (item: ActionMetricDashboardItem) => {
	if (item.kind !== "ONBOARDING_DOCUMENT") return null;

	const priorityState = String(item.metadata?.priorityState || "")
		.trim()
		.toLowerCase();
	if (priorityState === "pending_approval") {
		return {
			label: "Pending HR approval",
			className: "border border-sky-200 bg-sky-50 text-sky-700",
		};
	}
	if (priorityState === "rejected") {
		return {
			label: "Returned",
			className: "border border-red-200 bg-red-50 text-red-700",
		};
	}
	if (priorityState === "missing_required" || priorityState === "needs_update") {
		return {
			label: "Action needed",
			className: "border border-orange-200 bg-orange-50 text-orange-700",
		};
	}
	if (priorityState === "expired") {
		return {
			label: "Expired",
			className: "border border-red-200 bg-red-50 text-red-700",
		};
	}
	if (priorityState === "optional") {
		return {
			label: "Optional",
			className: "border border-amber-200 bg-amber-50 text-amber-700",
		};
	}

	const statusLabel = String(item.statusLabel || "").trim();
	if (statusLabel) {
		return {
			label: statusLabel,
			className: "border border-slate-200 bg-slate-50 text-slate-700",
		};
	}

	return null;
};

const getPriorityClasses = (priority: ActionMetricPriority, item?: ActionMetricDashboardItem) => {
	if (item && isOptionalDocumentWarning(item)) return "bg-amber-100 text-amber-800";
	if (priority === "high") return "bg-red-100 text-red-800";
	if (priority === "medium") return "bg-amber-100 text-amber-800";
	return "bg-slate-100 text-slate-800";
};

const getKindIcon = (kind: ActionMetricDashboardItem["kind"]) => {
	if (kind === "ATTENDANCE_CLOCK_IN") return Clock;
	if (kind === "TIMESHEET_REMINDER") return ClipboardCheck;
	if (isApprovalLikeItem(kind)) return AlertCircle;
	if (kind === "ONBOARDING_DOCUMENT") return FileText;
	if ((kind as string) === "AVATAR_UPDATE") return Camera;
	return Bell;
};

const getViewAllPathByRole = (role: DashboardRole) => {
	if (role === "hr-manager" || role === "hr-user") {
		return "/hr/notifications";
	}
	return "/employee/notifications";
};

const formatDateLabel = (value?: string | null) => {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

const formatRecencyLabel = (value?: string | null) => {
	if (!value) return null;

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;

	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffHours = diffMs / (1000 * 60 * 60);

	if (diffHours <= 12) return "New";

	const isSameDay =
		now.getFullYear() === date.getFullYear() &&
		now.getMonth() === date.getMonth() &&
		now.getDate() === date.getDate();
	if (isSameDay) return "Today";

	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	const isYesterday =
		yesterday.getFullYear() === date.getFullYear() &&
		yesterday.getMonth() === date.getMonth() &&
		yesterday.getDate() === date.getDate();
	if (isYesterday) return "Yesterday";

	return formatDateLabel(value);
};

const extractRequestIdFromPath = (path: string): string => {
	try {
		const url = new URL(path, "https://navigation.local");
		return String(url.searchParams.get("id") || "").trim();
	} catch {
		return "";
	}
};

export function ActionNeededCard({ role }: ActionNeededCardProps) {
	const navigate = useNavigate();
	const { user } = useAuth();
	const employeeId = user?.metadata?.employee?.id || "";
	const { data, isLoading } = useDashboardActionItems();
	const [isViewAllOpen, setIsViewAllOpen] = useState(false);
	const [currentPage, setCurrentPage] = useState(1);

	const summary = data?.summary || { total: 0, high: 0, medium: 0, low: 0 };
	const allItems = data?.items || [];
	const viewAllPath = getViewAllPathByRole(role);
	const totalPages = Math.max(1, Math.ceil(allItems.length / MODAL_ITEMS_PER_PAGE));
	const paginatedItems = useMemo(() => {
		const startIndex = (currentPage - 1) * MODAL_ITEMS_PER_PAGE;
		return allItems.slice(startIndex, startIndex + MODAL_ITEMS_PER_PAGE);
	}, [allItems, currentPage]);

	useEffect(() => {
		if (!isViewAllOpen) return;
		setCurrentPage(1);
	}, [isViewAllOpen, allItems.length]);

	const isHrRole = isHrTicketRole(user?.role);

	const resolveTargetPath = (item: ActionMetricDashboardItem) => {
		if ((item.kind as string) === "AVATAR_UPDATE") {
			return "/settings";
		}
		if (item.kind === "NOTIFICATION_UNREAD") {
			const resolvedFromNotification = resolveNotificationTarget(
				{
					id: item.id,
					title: item.title,
					description: item.description,
					type: "INFO",
					category: "SYSTEM",
					recipients: { read: [], unread: [] },
					metadata: (item.metadata || {}) as any,
					createdAt: item.createdAt,
					updatedAt: item.createdAt,
				} as any,
				user?.role,
			);
			if (resolvedFromNotification) return resolvedFromNotification;

			if (isHrRole) {
				const requestId = String(
					item.metadata?.entityId ||
						item.metadata?.requestId ||
						item.metadata?.notificationId ||
						"",
				).trim();
				const requestType = String(item.metadata?.requestType || "")
					.trim()
					.toUpperCase();
				const requestText = `${String(item.title || "")} ${String(item.description || "")}`
					.trim()
					.toUpperCase();
				const metadataTarget =
					item.metadata && typeof item.metadata.targetUrl === "string"
						? String(item.metadata.targetUrl).trim()
						: "";
				const requestIdFromPath = extractRequestIdFromPath(metadataTarget);
				if (
					metadataTarget.startsWith("/hr/approvals/requests") &&
					(requestId || requestIdFromPath) &&
					(HR_TICKET_REQUEST_TYPES.has(requestType) ||
						requestText.includes("RESIGNATION"))
				) {
					return `/hr/requests/tickets?action=view&id=${requestId || requestIdFromPath}`;
				}
			}
		}

		if (isApprovalLikeItem(item.kind) && isHrRole) {
			const requestId = String(item.metadata?.requestId || "").trim();
			const requestType = String(item.metadata?.requestType || "")
				.trim()
				.toUpperCase();
			const requestText = `${String(item.title || "")} ${String(item.description || "")}`
				.trim()
				.toUpperCase();
			if (requestId && HR_TICKET_REQUEST_TYPES.has(requestType)) {
				return `/hr/requests/tickets?action=view&id=${requestId}`;
			}
			if (requestId && requestText.includes("RESIGNATION")) {
				return `/hr/requests/tickets?action=view&id=${requestId}`;
			}
		}

		const metadataTarget =
			item.metadata && typeof item.metadata.targetUrl === "string"
				? String(item.metadata.targetUrl).trim()
				: "";
		const safePath = metadataTarget || String(item.targetPath || "").trim();
		const requestIdFromPath = extractRequestIdFromPath(safePath);
		if (
			isHrRole &&
			isApprovalLikeItem(item.kind) &&
			safePath.startsWith("/hr/approvals/requests")
		) {
			const requestId = String(item.metadata?.requestId || requestIdFromPath || "").trim();
			const requestType = String(item.metadata?.requestType || "")
				.trim()
				.toUpperCase();
			const requestText = `${String(item.title || "")} ${String(item.description || "")}`
				.trim()
				.toUpperCase();
			if (
				requestId &&
				(HR_TICKET_REQUEST_TYPES.has(requestType) || requestText.includes("RESIGNATION"))
			) {
				return `/hr/requests/tickets?action=view&id=${requestId}`;
			}
		}
		if (!safePath) return viewAllPath;
		if (safePath.startsWith("/employee/attendance")) {
			return employeeId
				? safePath.replace("/employee/attendance", `/employee/${employeeId}/attendance`)
				: "/dashboard";
		}
		if (safePath.startsWith("/employee/payroll")) {
			return employeeId
				? safePath.replace("/employee/payroll", `/employee/${employeeId}/payroll`)
				: "/dashboard";
		}
		return safePath;
	};

	const openItem = (item: ActionMetricDashboardItem) => {
		navigate(resolveTargetPath(item));
		setIsViewAllOpen(false);
	};

	const renderActionItem = (item: ActionMetricDashboardItem) => {
		const ItemIcon = getKindIcon(item.kind);
		const workflowBadge = getDocumentWorkflowBadge(item);
		const dueDateLabel = formatDateLabel(item.dueDate);
		const recencyLabel = formatRecencyLabel(item.createdAt);
		const metaParts = [recencyLabel, dueDateLabel ? `Due ${dueDateLabel}` : null].filter(
			Boolean,
		);
		const metaLabel = metaParts.join(" • ");

		return (
			<div
				key={item.id}
				onClick={() => openItem(item)}
				className="flex cursor-pointer items-start gap-2 py-1.5 transition-colors hover:bg-gray-50 -mx-1 px-1 rounded">
				<div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-gray-50">
					<ItemIcon className="h-3.5 w-3.5 text-gray-500" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-start justify-between gap-2">
						<p className="line-clamp-1 text-sm font-medium text-gray-900">
							{item.title}
						</p>
						<span
							className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
								workflowBadge
									? workflowBadge.className
									: getPriorityClasses(item.priority, item)
							}`}>
							{workflowBadge?.label || item.priority}
						</span>
					</div>
					{item.description && (
						<p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{item.description}</p>
					)}
					<div className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-400">
						<span className="truncate">{metaLabel}</span>
					</div>
				</div>
			</div>
		);
	};

	return (
		<>
			<Card id="dashboard-action-needed" className="h-full gap-4 py-4 overflow-hidden">
				<CardHeader className="pb-2">
					<div className="flex items-center justify-between gap-2">
						<div>
							<CardTitle className="flex items-center gap-2 text-base font-semibold">
								<AlertCircle className="h-4 w-4 text-gray-400" />
								Action Needed
							</CardTitle>
							<p className="mt-0.5 text-xs text-gray-400">
								{summary.total} total • {summary.high} high
							</p>
						</div>
						<button
							onClick={() => setIsViewAllOpen(true)}
							className="text-xs text-gray-400 hover:text-gray-600">
							View all →
						</button>
					</div>
				</CardHeader>
				<CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden pt-0">
					{isLoading ? (
						<div className="space-y-1.5 overflow-hidden">
							{Array.from({ length: 3 }, (_, index) => index + 1).map((item) => (
								<div
									key={item}
									className="flex items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5">
									<Skeleton className="h-4 w-4 rounded" />
									<div className="flex-1 space-y-1.5">
										<Skeleton className="h-3.5 w-28" />
										<Skeleton className="h-3 w-24" />
									</div>
									<Skeleton className="h-4 w-12 rounded-full" />
								</div>
							))}
						</div>
					) : allItems.length === 0 ? (
						<div className="flex flex-1 items-center justify-center text-sm text-gray-500">
							No action needed
						</div>
					) : (
						<div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto pr-1">
							{allItems.slice(0, 3).map(renderActionItem)}
						</div>
					)}
				</CardContent>
			</Card>

			<Modal
				open={isViewAllOpen}
				onOpenChange={setIsViewAllOpen}
				title="All Action Needed Items"
				description={`${summary.total} total items across your current action queue`}
				className="max-w-3xl">
				<div className="space-y-4">
					{isLoading ? (
						<div className="space-y-2 pt-1">
							{[1, 2, 3, 4].map((item) => (
								<div
									key={item}
									className="flex items-center gap-3 rounded-lg border border-gray-100 p-2.5">
									<Skeleton className="h-4 w-4 rounded" />
									<div className="flex-1 space-y-1.5">
										<Skeleton className="h-3.5 w-40" />
										<Skeleton className="h-3 w-28" />
									</div>
									<Skeleton className="h-4 w-12 rounded-full" />
								</div>
							))}
						</div>
					) : allItems.length === 0 ? (
						<div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50">
							<div className="text-sm text-gray-600">No action needed</div>
						</div>
					) : (
						<>
							<div className="divide-y divide-gray-100">{paginatedItems.map(renderActionItem)}</div>
							<div className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
								<p className="text-xs text-gray-500">
									Showing {(currentPage - 1) * MODAL_ITEMS_PER_PAGE + 1}-
									{Math.min(currentPage * MODAL_ITEMS_PER_PAGE, allItems.length)}{" "}
									of {allItems.length} items
								</p>
								<div className="flex flex-wrap items-center gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() =>
											setCurrentPage((page) => Math.max(1, page - 1))
										}
										disabled={currentPage === 1}>
										Previous
									</Button>
									{Array.from(
										{ length: totalPages },
										(_, index) => index + 1,
									).map((pageNumber) => (
										<Button
											key={pageNumber}
											type="button"
											variant={
												pageNumber === currentPage ? "default" : "outline"
											}
											size="sm"
											onClick={() => setCurrentPage(pageNumber)}
											className="min-w-9 px-3">
											{pageNumber}
										</Button>
									))}
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() =>
											setCurrentPage((page) => Math.min(totalPages, page + 1))
										}
										disabled={currentPage === totalPages}>
										Next
									</Button>
								</div>
							</div>
						</>
					)}
				</div>
			</Modal>
		</>
	);
}
