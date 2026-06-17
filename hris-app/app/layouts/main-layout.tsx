import { NavLink, Outlet } from "react-router";
import { HMSGuard } from "~/guards/auth-guard";
import { SocketProvider } from "~/contexts/socket-context";
import { NotificationProvider } from "~/contexts/notification-context";

export default function MainLayout() {
	return (
		<HMSGuard>
			<SocketProvider>
				<NotificationProvider>
					<main className="min-h-screen bg-gray-50">
						<header className="border-b border-gray-200 bg-white">
							<div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
								<h1 className="text-sm font-semibold tracking-wide text-gray-700">
									Account
								</h1>
								<nav className="flex items-center gap-2">
									<NavLink
										to="/settings"
										className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900">
										Profile
									</NavLink>
									<NavLink
										to="/notifications"
										className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900">
										Notifications
									</NavLink>
								</nav>
							</div>
						</header>
						<div className="mx-auto w-full max-w-5xl px-4 py-6">
							<Outlet />
						</div>
					</main>
				</NotificationProvider>
			</SocketProvider>
		</HMSGuard>
	);
}
