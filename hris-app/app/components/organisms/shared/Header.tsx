import { Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavItem } from "@/components/molecules/nav-item";
import { Link } from "react-router";

export function Header() {
	return (
		<header className="border-b sticky top-0 z-10 bg-white">
			<div className="container px-4 md:px-6 max-w-7xl mx-auto">
				<div className="flex h-16 items-center justify-between py-4">
					<div className="flex items-center gap-2">
						<Code className="h-8 w-8 text-primary" />
						<span className="text-xl font-bold">React Template</span>
					</div>
					<nav className="hidden md:flex items-center gap-6">
						<NavItem to="#features">Features</NavItem>
						<NavItem to="#benefits">Benefits</NavItem>
						<NavItem to="#contact">Contact</NavItem>
					</nav>
					<div className="flex items-center gap-4">
						<Link to="/auth/login">
							<Button variant="outline">Log In</Button>
						</Link>
						<Link to="/register">
							<Button>Get Started</Button>
						</Link>
					</div>
				</div>
			</div>
		</header>
	);
}
