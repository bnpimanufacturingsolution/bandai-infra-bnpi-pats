import { Link, useLocation } from "react-router";
import { Home, Calendar, Receipt } from "lucide-react";

interface MobileSiteLayoutProps {
	children: React.ReactNode;
}

export default function MobileSiteLayout({ children }: MobileSiteLayoutProps) {
	const location = useLocation();

	const navItems = [
		{ path: "/site", label: "Home", icon: Home },
		{ path: "/site/leaves", label: "Leaves", icon: Calendar },
		{ path: "/site/payslip", label: "Payslips", icon: Receipt },
	];

	const isActive = (path: string) => {
		if (path === "/site") {
			return location.pathname === "/site";
		}
		return location.pathname.startsWith(path);
	};

	return (
		<div className="min-h-screen bg-gray-100 flex flex-col max-w-md mx-auto">
			{/* Main Content */}
			<div className="flex-1 pb-20">{children}</div>

			{/* Bottom Navigation */}
			<nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-200 px-6 py-3">
				<div className="flex items-center justify-between">
					{navItems.map((item) => {
						const Icon = item.icon;
						const active = isActive(item.path);

						return (
							<Link
								key={item.path}
								to={item.path}
								className="flex flex-col items-center gap-1 min-w-[60px]">
								<Icon
									className={`w-6 h-6 ${
										active ? "text-[#f97907]" : "text-gray-500"
									}`}
								/>
								<span
									className={`text-xs ${
										active ? "text-[#f97907] font-medium" : "text-gray-500"
									}`}>
									{item.label}
								</span>
							</Link>
						);
					})}
				</div>
			</nav>
		</div>
	);
}
