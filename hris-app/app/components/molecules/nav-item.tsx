import type React from "react";
import { Link } from "react-router";

interface NavItemProps {
	to: string;
	children: React.ReactNode;
}

export function NavItem({ to, children }: NavItemProps) {
	return (
		<Link to={to} className="text-sm font-medium hover:text-primary">
			{children}
		</Link>
	);
}
