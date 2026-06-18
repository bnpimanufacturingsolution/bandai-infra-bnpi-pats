import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { Bell, Check, CheckCheck, Clock, FileText, Filter, Shield, X } from "lucide-react";
import {
	isNotificationUnread,
	useNotifications,
	type Notification,
} from "~/contexts/notification-context";
import { useAuth } from "~/lib/hooks/use-auth";
import { useEmployeeNotifications, useDeleteNotification } from "~/lib/hooks/useNotifications";
import {
	isRegularizationCompletionNotification,
	resolveNotificationTarget,
} from "~/lib/notification-navigation";

type NotificationFilter = "all" | "unread" | "request" | "approval" | "system";

const filterLabelMap: Record<NotificationFilter, string> = {
	all: "All",
	unread: "Unread",
	request: "Requests",
	approval: "Approvals",
	system: "System",
};

const getNotificationIcon = (notification: Notification) => {
	if (notification.category === "APPROVAL") return CheckCheck;
	if (notification.category === "REQUEST") return FileText;
	if (notification.category === "SYSTEM") return Shield;
	return Bell;
};

const getNotificationTone = (notification: Notification, isUnread: boolean) => {
	if (notification.type === "SUCCESS") {
		return {
			icon: "text-emerald-600",
			accent: isUnread ? "border-l-emerald-500 bg-emerald-50/70" : "border-l-transparent",
			chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
		};
	}
	if (notification.type === "WARNING" || notification.type === "ALERT") {
		return {
			icon: "text-amber-600",
			accent: isUnread ? "border-l-amber-500 bg-amber-50/70" : "border-l-transparent",
			chip: "bg-amber-50 text-amber-700 border-amber-200",
		};
	}
	if (notification.type === "ERROR") {
		return {
			icon: "text-red-600",
			accent: isUnread ? "border-l-red-500 bg-red-50/70" : "border-l-transparent",
			chip: "bg-red-50 text-red-700 border-red-200",
		};
	}
	return {
		icon: "text-orange-600",
		accent: isUnread ? "border-l-orange-500 bg-orange-50/70" : "border-l-transparent",
		chip: "bg-orange-50 text-orange-700 border-orange-200",
	};
};

const formatTimestamp = (value: string) => {
	try {
		return new Intl.DateTimeFormat("en-PH", {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
		}).format(new Date(value));
	} catch {
		return value;
	}
};

const buildNotificationFilters = (
	notifications: Notification[],
	employeeId: string,
): Array<{ id: NotificationFilter; label: string; count: number }> => {
	const unreadCount = notifications.filter((notification) =>
		isNotificationUnread(notification, employeeId),
	).length;
	return [
		{ id: "all", label: filterLabelMap.all, count: notifications.length },
		{ id: "unread", label: filterLabelMap.unread, count: unreadCount },
		{
			id: "request",
			label: filterLabelMap.request,
			count: notifications.filter((notification) => notification.category === "REQUEST")
				.length,
		},
		{
			id: "approval",
			label: filterLabelMap.approval,
			count: notifications.filter((notification) => notification.category === "APPROVAL")
				.length,
		},
		{
			id: "system",
			label: filterLabelMap.system,
			count: notifications.filter((notification) => notification.category === "SYSTEM")
				.length,
		},
	];
};

export function Notifications() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const employeeId = user?.metadata?.employee?.id || "";
	const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const deleteNotificationMutation = useDeleteNotification();
	const { markAsRead, markAllAsRead } = useNotifications();
	const { data, isLoading } = useEmployeeNotifications(employeeId, 100);

	const notifications = data?.notifications || [];
	const notificationFilters = useMemo(
		() => buildNotificationFilters(notifications, employeeId),
		[notifications, employeeId],
	);

	const filteredNotifications = useMemo(() => {
		const normalizedSearch = searchQuery.trim().toLowerCase();

		return notifications.filter((notification) => {
			const isUnread = employeeId ? isNotificationUnread(notification, employeeId) : false;
			const matchesFilter =
				activeFilter === "all" ||
				(activeFilter === "unread" && isUnread) ||
				(activeFilter === "request" && notification.category === "REQUEST") ||
				(activeFilter === "approval" && notification.category === "APPROVAL") ||
				(activeFilter === "system" && notification.category === "SYSTEM");

			if (!matchesFilter) return false;

			if (!normalizedSearch) return true;

			return (
				notification.title.toLowerCase().includes(normalizedSearch) ||
				notification.description.toLowerCase().includes(normalizedSearch)
			);
		});
	}, [activeFilter, employeeId, notifications, searchQuery]);

	const unreadCount = employeeId
		? notifications.filter((notification) => isNotificationUnread(notification, employeeId))
				.length
		: 0;
	const requestCount = notifications.filter(
		(notification) => notification.category === "REQUEST",
	).length;
	const approvalCount = notifications.filter(
		(notification) => notification.category === "APPROVAL",
	).length;

	const handleOpenNotification = async (notification: Notification) => {
		const targetUrl = resolveNotificationTarget(notification, user?.role);
		const opensRegularizationCelebration =
			isRegularizationCompletionNotification(notification) &&
			targetUrl?.startsWith("/dashboard?regularizationNotification=");
		if (
			employeeId &&
			isNotificationUnread(notification, employeeId) &&
			!opensRegularizationCelebration
		) {
			await markAsRead(notification.id);
		}
		if (targetUrl) {
			navigate(targetUrl);
		}
	};

	const handleDeleteNotification = async (
		event: React.MouseEvent<HTMLButtonElement>,
		id: string,
	) => {
		event.stopPropagation();
		await deleteNotificationMutation.mutateAsync(id);
	};

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
					<p className="text-sm text-gray-600">
						Request actions, approval updates, and system alerts in one feed.
					</p>
				</div>
				{unreadCount > 0 && (
					<Button variant="outline" onClick={() => markAllAsRead()} className="gap-2">
						<CheckCheck className="h-4 w-4" />
						Mark all read
					</Button>
				)}
			</div>

			<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
				<Card className="rounded-sm border border-gray-200 shadow-none">
					<CardContent className="flex items-center justify-between p-4">
						<div>
							<p className="text-xs uppercase tracking-wide text-gray-500">Total</p>
							<p className="text-2xl font-semibold text-gray-900">
								{notifications.length}
							</p>
						</div>
						<div className="rounded-sm bg-gray-50 p-2">
							<Bell className="h-4 w-4 text-gray-600" />
						</div>
					</CardContent>
				</Card>
				<Card className="rounded-sm border border-gray-200 shadow-none">
					<CardContent className="flex items-center justify-between p-4">
						<div>
							<p className="text-xs uppercase tracking-wide text-gray-500">Unread</p>
							<p className="text-2xl font-semibold text-orange-600">{unreadCount}</p>
						</div>
						<div className="rounded-sm bg-orange-50 p-2">
							<Check className="h-4 w-4 text-orange-600" />
						</div>
					</CardContent>
				</Card>
				<Card className="rounded-sm border border-gray-200 shadow-none">
					<CardContent className="flex items-center justify-between p-4">
						<div>
							<p className="text-xs uppercase tracking-wide text-gray-500">
								Workflow
							</p>
							<p className="text-sm font-semibold text-gray-900">
								{requestCount} Requests | {approvalCount} Approvals
							</p>
						</div>
						<div className="rounded-sm bg-blue-50 p-2">
							<FileText className="h-4 w-4 text-blue-600" />
						</div>
					</CardContent>
				</Card>
			</div>

			<Card className="rounded-sm border border-gray-200 shadow-none">
				<CardContent className="space-y-4 p-5">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div className="flex flex-wrap gap-2">
							{notificationFilters.map((filter) => (
								<button
									key={filter.id}
									type="button"
									onClick={() => setActiveFilter(filter.id)}
									className={`inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-sm font-medium transition-colors ${
										activeFilter === filter.id
											? "border-orange-200 bg-orange-50 text-orange-700"
											: "border-gray-200 bg-white text-gray-600 hover:text-gray-900"
									}`}>
									{filter.label}
									{filter.count > 0 && (
										<Badge
											variant="secondary"
											className="rounded-sm px-2 py-0.5 text-xs">
											{filter.count}
										</Badge>
									)}
								</button>
							))}
						</div>
						<div className="relative w-full lg:max-w-sm">
							<Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
							<input
								type="text"
								value={searchQuery}
								onChange={(event) => setSearchQuery(event.target.value)}
								placeholder="Search notifications..."
								className="h-11 w-full rounded-sm border border-gray-200 bg-white pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			<div className="space-y-3">
				{isLoading ? (
					Array.from({ length: 4 }).map((_, index) => (
						<Card key={index} className="rounded-sm border border-gray-200 shadow-none">
							<CardContent className="animate-pulse p-5">
								<div className="flex items-start gap-4">
									<div className="h-10 w-10 rounded-sm bg-gray-100" />
									<div className="flex-1 space-y-3">
										<div className="h-4 w-40 rounded bg-gray-100" />
										<div className="h-3 w-full rounded bg-gray-100" />
										<div className="h-3 w-2/3 rounded bg-gray-100" />
									</div>
								</div>
							</CardContent>
						</Card>
					))
				) : filteredNotifications.length === 0 ? (
					<Card className="rounded-sm border border-gray-200 shadow-none">
						<CardContent className="flex flex-col items-center justify-center py-14 text-center">
							<div className="mb-4 rounded-sm bg-orange-50 p-4 text-orange-600">
								<Bell className="h-7 w-7" />
							</div>
							<h3 className="text-lg font-semibold text-gray-900">
								No notifications found
							</h3>
							<p className="mt-2 max-w-md text-sm text-gray-600">
								{searchQuery
									? "Try a different search term or clear the current filter."
									: "New request and approval updates will appear here automatically."}
							</p>
						</CardContent>
					</Card>
				) : (
					filteredNotifications.map((notification) => {
						const isUnread = employeeId
							? isNotificationUnread(notification, employeeId)
							: false;
						const Icon = getNotificationIcon(notification);
						const tone = getNotificationTone(notification, isUnread);
						return (
							<Card
								key={notification.id}
								className={`cursor-pointer rounded-sm border border-l-4 border-gray-200 shadow-none transition hover:border-gray-300 ${tone.accent}`}
								onClick={() => void handleOpenNotification(notification)}>
								<CardContent className="p-5">
									<div className="flex items-start gap-4">
										<div className="rounded-sm bg-gray-50 p-3">
											<Icon className={`h-5 w-5 ${tone.icon}`} />
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
												<div className="min-w-0">
													<div className="flex items-center gap-2">
														<h3 className="truncate text-base font-semibold text-gray-900">
															{notification.title}
														</h3>
														{isUnread && (
															<span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
														)}
													</div>
													<p className="mt-1 text-sm leading-6 text-gray-600 line-clamp-2">
														{notification.description}
													</p>
												</div>
												<div className="flex items-center gap-2">
													<Badge className={`border ${tone.chip}`}>
														{notification.category}
													</Badge>
													<Button
														variant="ghost"
														size="sm"
														onClick={(event) =>
															void handleDeleteNotification(
																event,
																notification.id,
															)
														}
														className="text-gray-400 hover:text-red-600">
														<X className="h-4 w-4" />
													</Button>
												</div>
											</div>
											<div className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-500">
												<div className="flex items-center gap-2">
													<Clock className="h-3.5 w-3.5" />
													<span>
														{formatTimestamp(notification.createdAt)}
													</span>
												</div>
												{resolveNotificationTarget(
													notification,
													user?.role,
												) && (
													<span className="font-medium text-orange-600">
														Open details
													</span>
												)}
											</div>
										</div>
									</div>
								</CardContent>
							</Card>
						);
					})
				)}
			</div>
		</div>
	);
}
