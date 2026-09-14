import { NavLink, useNavigate } from "react-router";
import { useState, useRef, useEffect, useContext } from "react";
import { Menu, Bell, CalendarDays, Check, CheckCheck, User2 } from "lucide-react";
import { HRDropdown } from "./HRDropdown";
import { ApplicationLauncherButton } from "./ApplicationLauncherButton";
import { Badge } from "~/components/atoms/Badge";
import {
	useNotifications,
	type Notification,
	isNotificationUnread,
} from "~/contexts/notification-context";
import { useAuth } from "~/lib/hooks/use-auth";
import AuthContext from "~/contexts/auth-context";
import {
	isRegularizationCompletionNotification,
	resolveNotificationTarget,
} from "~/lib/notification-navigation";

export interface TopNavbarProps {
	/**
	 * Whether the sidebar is open (for mobile menu button)
	 */
	sidebarOpen: boolean;
	/**
	 * Function to toggle sidebar open/closed
	 */
	onToggleSidebar: () => void;
	/**
	 * Whether to show the help button
	 */
	showHelp?: boolean;
	/**
	 * Help link path
	 */
	helpPath?: string;
	/**
	 * Profile link path
	 */
	profilePath?: string;
	/**
	 * Settings link path
	 */
	settingsPath?: string;
	/**
	 * Notifications link path
	 */
	notificationsPath?: string;
	/**
	 * Number of notifications to display
	 */
	notificationCount?: number;
	/**
	 * Whether to show the HR dropdown (for managers)
	 */
	showHRDropdown?: boolean;
	/**
	 * Department information to display
	 */
	department?: {
		name: string;
		code?: string;
	};
	/**
	 * Custom CSS classes
	 */
	className?: string;
}

export function TopNavbar({
	sidebarOpen,
	onToggleSidebar,
	showHelp = true,
	helpPath = "/help",
	profilePath = "/profile",
	settingsPath = "/settings",
	notificationsPath = "/notifications",
	notificationCount = 0,
	showHRDropdown = false,
	department,
	className = "",
}: TopNavbarProps) {
	const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
	const notificationRef = useRef<HTMLDivElement>(null);
	const settingsRef = useRef<HTMLDivElement>(null);
	const { user } = useAuth();
	const isAdminRole = user?.role?.includes("admin");
	const navigate = useNavigate();
	const { logout } = useContext(AuthContext)!;
	const employeeId = user?.metadata?.employee?.id || "";
	// Get real-time notifications from context
	const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

	const handleNotificationClick = async (notification: Notification) => {
		const resolvedTarget = resolveNotificationTarget(notification, user?.role);
		const opensRegularizationCelebration =
			isRegularizationCompletionNotification(notification) &&
			resolvedTarget?.startsWith("/dashboard?regularizationNotification=");
		try {
			if (!opensRegularizationCelebration) {
				await markAsRead(notification.id);
			}
		} finally {
			setActiveDropdown(null);
			if (resolvedTarget) {
				navigate(resolvedTarget);
			}
		}
	};

	const handleLogout = async () => {
		try {
			await logout();
			navigate("/auth/login");
		} catch (error) {
			console.error("Logout failed:", error);
			navigate("/auth/login");
		}
	};

	// Close dropdowns when clicking outside
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			const target = event.target as Node;
			if (notificationRef.current && !notificationRef.current.contains(target)) {
				if (activeDropdown === "notifications") setActiveDropdown(null);
			}
			if (settingsRef.current && !settingsRef.current.contains(target)) {
				if (activeDropdown === "settings") setActiveDropdown(null);
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [activeDropdown]);

	return (
		<header className={`sticky top-0 z-40 border-b border-gray-100 bg-white ${className}`}>
			<div className="flex items-center justify-between h-16 px-6">
				{/* Left side - Mobile menu button */}
				<div className="flex items-center gap-2">
					<button
						onClick={onToggleSidebar}
						className="xl:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
						<Menu className="w-5 h-5" />
					</button>
				</div>

				{/* Right side - Notifications, Help, Profile */}
				<div className="flex items-center gap-4">
					{/* Company Calendar */}
					{!isAdminRole && (
						<NavLink
							id="navbar-calendar"
							to="/calendar"
							className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
							title="Company Calendar">
							<CalendarDays className="w-5 h-5" />
						</NavLink>
					)}

					{/* Notifications Dropdown */}
					<div className="relative" ref={notificationRef}>
						<button
							id="navbar-notifications"
							onClick={() =>
								setActiveDropdown(
									activeDropdown === "notifications" ? null : "notifications",
								)
							}
							className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
							title="Notifications">
							<Bell className="w-5 h-5" />
							{unreadCount > 0 && (
								<span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-orange-500 rounded-full text-xs text-white flex items-center justify-center px-1">
									{unreadCount > 99 ? "99+" : unreadCount}
								</span>
							)}
						</button>

						{activeDropdown === "notifications" && (
							<div className="absolute top-full right-0 mt-1 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
								{/* Header */}
								<div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
									<h3 className="font-semibold text-gray-900">Notifications</h3>
									{unreadCount > 0 && (
										<button
											onClick={() => markAllAsRead()}
											className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1">
											<CheckCheck className="w-3 h-3" />
											Mark all read
										</button>
									)}
								</div>

								{/* Notification List */}
								<div className="max-h-80 overflow-y-auto">
									{notifications.length === 0 ? (
										<div className="px-4 py-8 text-center text-gray-500">
											<Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
											<p className="text-sm">No notifications yet</p>
										</div>
									) : (
										notifications.slice(0, 5).map((notification) => {
											const isUnread = isNotificationUnread(
												notification,
												employeeId,
											);
											return (
												<div
													key={notification.id}
													className={`px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
														isUnread ? "bg-orange-50" : ""
													}`}
													onClick={() =>
														void handleNotificationClick(notification)
													}>
													<div className="flex items-start gap-3">
														<div
															className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
																notification.type === "SUCCESS"
																	? "bg-green-500"
																	: notification.type ===
																		  "WARNING"
																		? "bg-yellow-500"
																		: notification.type ===
																			  "ERROR"
																			? "bg-red-500"
																			: "bg-blue-500"
															}`}
														/>
														<div className="flex-1 min-w-0">
															<p className="text-sm font-medium text-gray-900 truncate">
																{notification.title}
															</p>
															<p className="text-xs text-gray-500 line-clamp-2">
																{notification.description}
															</p>
															<p className="text-xs text-gray-400 mt-1">
																{new Date(
																	notification.createdAt,
																).toLocaleString()}
															</p>
														</div>
														{isUnread && (
															<Check className="w-4 h-4 text-gray-400 hover:text-orange-500" />
														)}
													</div>
												</div>
											);
										})
									)}
								</div>

								{/* Footer */}
								{notifications.length > 0 && (
									<NavLink
										to={notificationsPath}
										className="block px-4 py-3 text-center text-sm text-orange-600 hover:bg-gray-50 border-t border-gray-100"
										onClick={() => setActiveDropdown(null)}>
										View all notifications
									</NavLink>
								)}
							</div>
						)}
					</div>

					{/* Application Launcher */}
					<ApplicationLauncherButton />

					{/* Settings Dropdown */}
					<div className="relative" ref={settingsRef}>
						<button
							id="navbar-settings"
							onClick={() =>
								setActiveDropdown(activeDropdown === "settings" ? null : "settings")
							}
							className="flex items-center p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
							title="Settings">
							<User2 className="w-5 h-5" />
						</button>

						{activeDropdown === "settings" && (
							<div className="absolute top-full right-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
								<NavLink
									to={settingsPath}
									className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
									onClick={() => setActiveDropdown(null)}>
									Settings
								</NavLink>
								<div className="border-t border-gray-200 my-1"></div>
								<button
									onClick={handleLogout}
									className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
									Logout
								</button>
							</div>
						)}
					</div>
				</div>
			</div>
		</header>
	);
}
