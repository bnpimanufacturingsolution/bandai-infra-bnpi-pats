import { NavItem } from "./NavItem";
import { Button } from "~/components/atoms/Button";
import { Avatar } from "~/components/atoms/Avatar";
import { Bell, Settings, LogOut, User } from "lucide-react";

interface NavigationItem {
	to: string;
	label: string;
	icon?: React.ComponentType<{ className?: string }>;
}

interface NavigationProps {
	items: NavigationItem[];
	user?: {
		name: string;
		avatar?: string;
		role: string;
	};
	onLogout?: () => void;
	onProfile?: () => void;
	onSettings?: () => void;
	onNotifications?: () => void;
	notificationCount?: number;
}

export function Navigation({
	items,
	user,
	onLogout,
	onProfile,
	onSettings,
	onNotifications,
	notificationCount = 0,
}: NavigationProps) {
	return (
		<nav className="bg-white border-b border-gray-200">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex justify-between h-16">
					<div className="flex items-center">
						{/* Logo */}
						<div className="flex-shrink-0 flex items-center">
							<h1 className="text-xl font-bold text-gray-900">HR Portal</h1>
						</div>

						{/* Navigation Items */}
						<div className="hidden sm:ml-6 sm:flex sm:space-x-8">
							{items.map((item) => (
								<NavItem key={item.to} to={item.to}>
									{item.icon && <item.icon className="h-4 w-4 mr-2" />}
									{item.label}
								</NavItem>
							))}
						</div>
					</div>

					{/* User Menu */}
					<div className="flex items-center space-x-4">
						{/* Notifications */}
						<Button
							variant="ghost"
							size="icon"
							onClick={onNotifications}
							className="relative">
							<Bell className="h-5 w-5" />
							{notificationCount > 0 && (
								<span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
									{notificationCount > 9 ? "9+" : notificationCount}
								</span>
							)}
						</Button>

						{/* Settings */}
						<Button variant="ghost" size="icon" onClick={onSettings}>
							<Settings className="h-5 w-5" />
						</Button>

						{/* User Profile */}
						{user && (
							<div className="flex items-center space-x-3">
								<Avatar
									src={user.avatar}
									name={user.name}
									size="sm"
									onClick={onProfile}
									className="cursor-pointer"
								/>
								<div className="hidden md:block">
									<p className="text-sm font-medium text-gray-900">{user.name}</p>
									<p className="text-xs text-gray-500 capitalize">{user.role}</p>
								</div>
								<Button variant="ghost" size="icon" onClick={onLogout}>
									<LogOut className="h-5 w-5" />
								</Button>
							</div>
						)}
					</div>
				</div>
			</div>
		</nav>
	);
}
