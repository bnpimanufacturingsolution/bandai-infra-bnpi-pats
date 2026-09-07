import { Outlet, useLocation } from "react-router";
import { TopNavbar } from "~/components/molecules/shared/TopNavbar";
import { AuthGuard } from "../guards/auth-guard";
import { Sidebar } from "~/components/organisms/Sidebar";
import { useAuth } from "~/lib/hooks/use-auth";
import { useActionMetrics } from "~/lib/hooks/useMetrics";
import { useState } from "react";
import { ProductTourProvider } from "~/components/organisms/tour/ProductTourProvider";
import { ProductTourHost } from "~/components/organisms/tour/ProductTourHost";
import { SocketProvider } from "~/contexts/socket-context";
import { NotificationProvider } from "~/contexts/notification-context";
import LoadingScreen from "~/components/atoms/LoadingScreen";
import { isUnifiedViewportFillPath } from "~/lib/unified-viewport-fill";
import { cn } from "~/lib/utils";

/**
 * Unified Layout Component
 *
 * Used by all roles: employees, managers, hr-users, hr-managers
 * Shows role-specific sidebars and navigation
 * Allows cross-role navigation (e.g., HR viewing employee profiles)
 *
 * List/table pages use viewport-fill mode (height-locked main pane) so
 * DataTable `containedScroll` fills remaining height like admin tables.
 */
export default function UnifiedLayout() {
	const { user, isLoading } = useAuth();
	const location = useLocation();
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const currentEmployeeId = user?.metadata?.employee?.id;
	const isViewportFillPage = isUnifiedViewportFillPath(location.pathname);

	useActionMetrics({
		enabled: !isLoading && !!currentEmployeeId,
	});

	// All roles that can access /employee/* routes
	const allowedRoles = [
		"admin",
		"hris-admin",
		"hris-employee",
		"hris-hr-manager",
		"hris-hr-user",
		"hris-employee-manager",
		"hris-line-leader",
	];
	const notificationsPath =
		user?.role === "admin" ||
		user?.role === "hris-admin" ||
		user?.role === "hris-hr-manager" ||
		user?.role === "hris-hr-user"
			? "/hr/notifications"
			: "/employee/notifications";

	if (isLoading) {
		return <LoadingScreen message="Loading" subtitle="Preparing workspace" />;
	}

	return (
		<AuthGuard requiredRole={allowedRoles}>
			<SocketProvider>
				<NotificationProvider>
					<ProductTourProvider>
						<ProductTourHost />
						{/*
						  Root is a row flex on lg. The main column MUST use min-w-0 (not w-full)
						  or flex min-content width from wide children (e.g. period carousels)
						  expands the page and creates a document horizontal scrollbar.
						  Viewport-fill list pages lock to h-screen so tables fill height.
						*/}
						<div
							className={cn(
								"flex max-w-[100vw] max-h-screen flex-col overflow-hidden bg-gray-50 lg:flex-row",
								"h-screen",
								isViewportFillPage ? "overflow-hidden" : "overflow-hidden",
							)}>
							{/* Mobile Sidebar Overlay */}
							{sidebarOpen && (
								<div
									className="fixed inset-0 bg-black/50 z-40 lg:hidden"
									onClick={() => setSidebarOpen(false)}
								/>
							)}

							{/* Sidebar - Fixed on Desktop */}
							<div
								className={`
            fixed inset-y-0 left-0 z-50 w-64 shrink-0 bg-white transform transition-transform duration-300 ease-in-out border-r border-gray-200
            lg:sticky lg:top-0 lg:translate-x-0 lg:z-30 lg:h-screen lg:border-r lg:border-gray-200
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}>
								<Sidebar onClose={() => setSidebarOpen(false)} />
							</div>

							{/* Main Content Area — min-w-0 lets this column shrink inside the row flex */}
							<div
								className={cn(
									"flex min-w-0 flex-1 flex-col",
									isViewportFillPage && "h-screen min-h-0 overflow-hidden",
								)}>
								{/* Top Navbar */}
								<TopNavbar
									sidebarOpen={sidebarOpen}
									onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
									notificationsPath={notificationsPath}
									showHRDropdown={[
										"admin",
										"hris-admin",
										"hris-hr-manager",
										"hris-hr-user",
									].includes(user?.role || "")}
								/>

								{/*
								  List tables: fixed viewport height (h-0+flex-1), no page scroll.
								  Forms/dashboards: page-level vertical scroll.
								*/}
								<main
									className={cn(
										"min-w-0 flex-1 max-h-[93vh]",
										isViewportFillPage
											? "flex h-0 min-h-0 flex-col overflow-hidden"
											: "overflow-x-hidden",
									)}>
									<div
										className={cn(
											"container mx-auto min-w-0 max-w-7xl px-4 py-6 lg:px-6",
											isViewportFillPage &&
												"flex h-full min-h-0 flex-1 flex-col overflow-hidden",
										)}>
										<Outlet />
									</div>
								</main>
							</div>
						</div>
					</ProductTourProvider>
				</NotificationProvider>
			</SocketProvider>
		</AuthGuard>
	);
}
