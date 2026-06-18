import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "../atoms";

interface HeaderProps {
	currentPath?: string;
}

const navigation = [
	{ name: "Find Jobs", href: "/jobs" },
	{ name: "Saved Jobs", href: "/saved" },
	{ name: "Support", href: "/support" },
];

export function Header({ currentPath = "/" }: HeaderProps) {
	return (
		<header className="sticky top-0 z-50 border-b border-border bg-background">
			<div className="container mx-auto flex h-16 items-center justify-between px-4">
				<div className="flex items-center gap-8">
					{/* Logo / Home link - using regular <a> tag */}
					<a href="/" className="flex items-center gap-2 text-xl font-bold">
						<Icon name="briefcase" size={24} />
						HireHub
					</a>

					<nav className="hidden md:flex items-center gap-6">
						{navigation.map((item) => (
							<a
								key={item.name}
								href={item.href}
								className={cn(
									"text-sm font-medium transition-colors hover:text-foreground",
									currentPath === item.href
										? "text-foreground"
										: "text-muted-foreground",
								)}>
								{item.name}
							</a>
						))}
					</nav>
				</div>

				<div className="flex items-center gap-4">
					<Button variant="ghost" size="icon" aria-label="Notifications">
						<Icon name="heart" size={20} />
					</Button>
					<Avatar>
						<AvatarFallback>JD</AvatarFallback>
					</Avatar>
				</div>
			</div>
		</header>
	);
}
