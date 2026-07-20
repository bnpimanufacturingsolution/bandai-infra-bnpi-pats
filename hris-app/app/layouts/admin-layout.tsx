import { Outlet, NavLink, useLocation } from "react-router";
import { TopNavbar } from "~/components/molecules/shared/TopNavbar";
import {
	X,
	LayoutDashboard,
	Settings,
	ShieldCheck,
	ChevronDown,
	ChevronRight,
	Activity,
} from "lucide-react";
import { useState, useEffect, useLayoutEffect, useRef } from "react";

import { AuthGuard } from "../guards/auth-guard";
import { useAuth } from "~/lib/hooks/use-auth";
import { Badge } from "~/components/atoms/Badge";
import { NotificationProvider } from "~/contexts/notification-context";
import { SocketProvider } from "~/contexts/socket-context";
import {
	adminConfigurationItems,
	adminLoggingItems,
	adminRulesPolicyItems,
} from "~/lib/admin-navigation";
import bandaiLogo from "~/assets/bandai_logo.png";

interface AdminLayoutProps {
	children?: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [configMenuOpen, setConfigMenuOpen] = useState(true);
	const [rulesPolicyMenuOpen, setRulesPolicyMenuOpen] = useState(false);
	const [loggingMenuOpen, setLoggingMenuOpen] = useState(false);
	const navScrollRef = useRef<HTMLElement | null>(null);
	const pendingScrollTopRef = useRef<number | null>(null);

	const { user } = useAuth();
	const location = useLocation();

	const department = user?.metadata?.employee?.department;
	const rawOrganizationLogo = user?.organization?.branding?.logo;
	const organizationLogo =
		!rawOrganizationLogo || rawOrganizationLogo === "assets/images/bandai_logo.png"
			? bandaiLogo
			: rawOrganizationLogo;
	const organizationName = user?.organization?.name || "Company";

	// Auto-open menus if on respective pages
	useEffect(() => {
		if (location.pathname.startsWith("/admin/configuration")) {
			setConfigMenuOpen(true);
		}
		if (location.pathname.startsWith("/admin/rules-policies")) {
			setRulesPolicyMenuOpen(true);
		}
		if (
			location.pathname.startsWith("/admin/audit-logs") ||
			location.pathname.startsWith("/admin/activity-logs")
		) {
			setLoggingMenuOpen(true);
		}
	}, [location.pathname]);

	useLayoutEffect(() => {
		if (pendingScrollTopRef.current === null || !navScrollRef.current) {
			return;
		}

		const nextScrollTop = pendingScrollTopRef.current;
		navScrollRef.current.scrollTop = nextScrollTop;

		const frameId = window.requestAnimationFrame(() => {
			if (navScrollRef.current) {
				navScrollRef.current.scrollTop = nextScrollTop;
			}
			pendingScrollTopRef.current = null;
		});

		return () => window.cancelAnimationFrame(frameId);
	}, [configMenuOpen, loggingMenuOpen, rulesPolicyMenuOpen]);

	const toggleMenu = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
		pendingScrollTopRef.current = navScrollRef.current?.scrollTop ?? null;
		setter((prev) => !prev);
	};

	const workingSpaceItems = [
		{ id: "dashboard", label: "Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
	];

	const isLoggingRoute =
		location.pathname.startsWith("/admin/audit-logs") ||
		location.pathname.startsWith("/admin/activity-logs");

	return (
		<AuthGuard requiredRole={["admin", "hris-admin", "hris-hr-manager", "hris-hr-user"]}>
			<SocketProvider>
				<NotificationProvider>
					<div className="h-screen bg-gray-50 flex overflow-hidden">
						{/* Sidebar */}
						<div
							className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-100 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto`}>
							<div className="flex items-center justify-between h-16 px-6 border-b border-gray-100">
								<img
									src={organizationLogo}
									alt={`${organizationName} logo`}
									className="block h-10 w-40 object-cover object-center"
								/>
								<button
									onClick={() => setSidebarOpen(false)}
									className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
									<X className="w-5 h-5" />
								</button>
							</div>

							{/* User Profile Section */}
							<div className="px-5 py-5 border-b border-gray-100">
								<div className="flex items-start gap-3">
									{/* Avatar */}
									<div className="flex-shrink-0">
										<div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-200/50 shadow-sm flex items-center justify-center text-white font-semibold text-lg">
											{user?.userName
												? user.userName.charAt(0).toUpperCase()
												: "A"}
										</div>
									</div>

									{/* User Info */}
									<div className="flex-1 min-w-0">
										{/* Name */}
										<h3 className="text-sm font-semibold text-gray-900 truncate">
											{user?.userName || "Administrator"}
										</h3>

										{/* Role */}
										<p className="text-xs text-orange-600 mt-0.5 font-medium">
											System Administrator
										</p>

										{/* User Role Badge */}
										{user?.role && (
											<Badge className="text-xs mt-2 inline-block bg-orange-100 text-orange-700 hover:bg-orange-100">
												{user.role === "admin" ? "Admin" : user.role}
											</Badge>
										)}
									</div>
								</div>
							</div>

							<nav ref={navScrollRef} className="mt-4 px-3 overflow-y-auto">
								{/* Working space section */}
								<div className="mb-6">
									<h3 className="px-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
										Working space
									</h3>
									{workingSpaceItems.map((item) => (
										<NavLink
											key={item.id}
											to={item.path}
											preventScrollReset
											className={({ isActive }) =>
												`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors mb-1 ${
													isActive
														? "bg-orange-50 text-orange-700 shadow-[inset_3px_0_0_0_#ea580c]"
														: "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
												}`
											}
											onClick={() => setSidebarOpen(false)}>
											<item.icon className="w-5 h-5 mr-3" />
											{item.label}
										</NavLink>
									))}

									<div>
										<button
											type="button"
											onClick={() => toggleMenu(setLoggingMenuOpen)}
											className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors mb-1 ${
												isLoggingRoute
													? "text-orange-700"
													: "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
											}`}>
											<div className="flex items-center">
												<Activity className="w-5 h-5 mr-3" />
												<span>Loggings</span>
											</div>
											{loggingMenuOpen ? (
												<ChevronDown className="w-4 h-4" />
											) : (
												<ChevronRight className="w-4 h-4" />
											)}
										</button>

										{loggingMenuOpen && (
											<div className="ml-3 mt-1 space-y-0.5 border-l border-gray-100 pl-2">
												{adminLoggingItems.map((item) => (
													<NavLink
														key={item.id}
														to={item.path}
														preventScrollReset
														className={({ isActive }) =>
															`flex items-center px-3 py-2 text-sm rounded-lg transition-colors ${
																isActive
																	? "bg-orange-50 text-orange-700 font-semibold shadow-[inset_3px_0_0_0_#ea580c]"
																	: "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
															}`
														}
														onClick={() => setSidebarOpen(false)}>
														<item.icon className="w-4 h-4 mr-3" />
														{item.label}
													</NavLink>
												))}
											</div>
										)}
									</div>
								</div>

								<div className="mb-6">
									<h3 className="px-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
										Rules & Policies
									</h3>
									<div>
										<button
											type="button"
											onClick={() => toggleMenu(setRulesPolicyMenuOpen)}
											className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors mb-1 ${
												location.pathname.startsWith(
													"/admin/rules-policies",
												)
													? "text-orange-700"
													: "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
											}`}>
											<div className="flex items-center">
												<ShieldCheck className="w-5 h-5 mr-3" />
												<span>Rules & Policies</span>
											</div>
											{rulesPolicyMenuOpen ? (
												<ChevronDown className="w-4 h-4" />
											) : (
												<ChevronRight className="w-4 h-4" />
											)}
										</button>

										{rulesPolicyMenuOpen && (
											<div className="ml-3 mt-1 space-y-0.5 border-l border-gray-100 pl-2">
												{adminRulesPolicyItems.map((item) => (
													<NavLink
														key={item.id}
														to={item.path}
														preventScrollReset
														className={({ isActive }) =>
															`flex items-center px-3 py-2 text-sm rounded-lg transition-colors ${
																isActive
																	? "bg-orange-50 text-orange-700 font-semibold shadow-[inset_3px_0_0_0_#ea580c]"
																	: "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
															}`
														}
														onClick={() => setSidebarOpen(false)}>
														<item.icon className="w-4 h-4 mr-3" />
														{item.label}
													</NavLink>
												))}
											</div>
										)}
									</div>
								</div>

								<div className="mb-6">
									<h3 className="px-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
										Configuration
									</h3>
									<div>
										<button
											type="button"
											onClick={() => toggleMenu(setConfigMenuOpen)}
											className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors mb-1 ${
												location.pathname.startsWith("/admin/configuration")
													? "text-orange-700"
													: "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
											}`}>
											<div className="flex items-center">
												<Settings className="w-5 h-5 mr-3" />
												<span>Configuration</span>
											</div>
											{configMenuOpen ? (
												<ChevronDown className="w-4 h-4" />
											) : (
												<ChevronRight className="w-4 h-4" />
											)}
										</button>

										{configMenuOpen && (
											<div className="ml-3 mt-1 space-y-0.5 border-l border-gray-100 pl-2">
												{adminConfigurationItems.map((item) => (
													<NavLink
														key={item.id}
														to={item.path}
														preventScrollReset
														className={({ isActive }) =>
															`flex items-center px-3 py-2 text-sm rounded-lg transition-colors ${
																isActive
																	? "bg-orange-50 text-orange-700 font-semibold shadow-[inset_3px_0_0_0_#ea580c]"
																	: "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
															}`
														}
														onClick={() => setSidebarOpen(false)}>
														<item.icon className="w-4 h-4 mr-3" />
														{item.label}
													</NavLink>
												))}
											</div>
										)}
									</div>
								</div>

								{/* Personal section */}
								{/* <div>
									<h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
										Personal
									</h3>
									{personalItems.map((item) => (
										<NavLink
											key={item.id}
											to={item.path}
											className={({ isActive }) =>
												`flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors mb-1 ${
													isActive
														? "bg-[rgba(255,235,198,0.5)] text-[var(--gt-700)] border-r-4 border-[var(--gt-500)]"
														: "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
												}`
											}
											onClick={() => setSidebarOpen(false)}>
											<div className="flex items-center">
												<item.icon className="w-5 h-5 mr-3" />
												{item.label}
											</div>
											{item.hasNotification && (
												<span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
													N
												</span>
											)}
										</NavLink>
									))}
								</div> */}
							</nav>
						</div>

						{/* Main Content */}
						<div className="flex-1 flex flex-col min-w-0 h-screen">
							<TopNavbar
								sidebarOpen={sidebarOpen}
								onToggleSidebar={() => setSidebarOpen(true)}
								helpPath="/admin/help"
								profilePath="/admin/profile"
								settingsPath="/admin/settings"
								department={department}
							/>

							{/* Page Content */}
							<main className="flex-1 p-6 overflow-y-auto min-h-0">
								{children || <Outlet />}
							</main>
						</div>

						{/* Overlay for mobile */}
						{sidebarOpen && (
							<div
								className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
								onClick={() => setSidebarOpen(false)}
							/>
						)}
					</div>
				</NotificationProvider>
			</SocketProvider>
		</AuthGuard>
	);
}
