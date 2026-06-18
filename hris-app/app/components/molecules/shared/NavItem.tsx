import { Link, useLocation } from "react-router";
import { cn } from "~/lib/utils";

interface NavItemProps {
	to: string;
	children: React.ReactNode;
	className?: string;
	activeClassName?: string;
}

export function NavItem({ to, children, className, activeClassName }: NavItemProps) {
	const location = useLocation();
	const isActive = location.pathname === to || location.pathname.startsWith(to + "/");

	return (
		<Link
			to={to}
			className={cn(
				"inline-flex items-center px-1 pt-1 text-sm font-medium transition-colors",
				isActive
					? "text-orange-600 border-b-2 border-orange-600"
					: "text-gray-500 hover:text-gray-700 hover:border-b-2 hover:border-gray-300",
				className,
				isActive && activeClassName,
			)}>
			{children}
		</Link>
	);
}
