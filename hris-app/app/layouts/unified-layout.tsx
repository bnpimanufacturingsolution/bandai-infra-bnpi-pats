import { Outlet } from "react-router";
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

/**
 * Unified Layout Component
 *
 * Used by all roles: employees, managers, hr-users, hr-managers
 * Shows role-specific sidebars and navigation
 * Allows cross-role navigation (e.g., HR viewing employee profiles)
 */
export default function UnifiedLayout() {
	const { user, isLoading } = useAuth();
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const currentEmployeeId = user?.metadata?.employee?.id;

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
						<div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
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
            fixed inset-y-0 left-0 z-50 w-64 bg-white transform transition-transform duration-300 ease-in-out border-r border-gray-200
            lg:sticky lg:top-0 lg:translate-x-0 lg:z-30 lg:h-screen lg:border-r lg:border-gray-200
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}>
								<Sidebar onClose={() => setSidebarOpen(false)} />
							</div>

							{/* Main Content Area */}
							<div className="flex-1 flex flex-col w-full">
								{/* Top Navbar */}
								<TopNavbar
									sidebarOpen={sidebarOpen}
									onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
									notificationsPath={notificationsPath}
									showHRDropdown={["admin", "hris-admin", "hris-hr-manager", "hris-hr-user"].includes(
										user?.role || "",
									)}
								/>

								{/* Main Content */}
								<main className="flex-1 overflow-auto">
									<div className="container mx-auto py-6 px-4 lg:px-6 max-w-7xl">
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
