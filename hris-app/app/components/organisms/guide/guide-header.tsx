import { cn } from "@/lib/utils";
import { Book, Menu, Search, X } from "lucide-react";
import { useState } from "react";
import { Button, Icon, Input } from "~/components/atoms";

interface GuideHeaderProps {
	title: string;
	onMenuToggle?: () => void;
	isSidebarOpen?: boolean;
}

export function GuideHeader({ title, onMenuToggle, isSidebarOpen }: GuideHeaderProps) {
	const [searchOpen, setSearchOpen] = useState(false);

	return (
		<header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
			<div className="flex h-14 items-center gap-4 px-4 md:px-6">
				<Button
					variant="ghost"
					size="icon"
					className="md:hidden shrink-0"
					onClick={onMenuToggle}
					aria-label={isSidebarOpen ? "Close menu" : "Open menu"}>
					<Icon icon={isSidebarOpen ? X : Menu} size="md" />
				</Button>

				<div className="flex items-center gap-2">
					<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
						<Icon icon={Book} size="sm" />
					</div>
					<h1 className="font-semibold text-lg hidden sm:block">{title}</h1>
				</div>

				<div className="flex-1" />

				<div className="flex items-center gap-2">
					<div
						className={cn(
							"transition-all duration-300 overflow-hidden",
							searchOpen ? "w-64" : "w-0",
						)}>
						<Input
							type="search"
							placeholder="Search documentation..."
							className="h-9"
							autoFocus={searchOpen}
							onBlur={() => setSearchOpen(false)}
						/>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setSearchOpen(!searchOpen)}
						aria-label="Toggle search"
						className={cn(searchOpen && "hidden md:flex")}>
						<Icon icon={Search} size="md" />
					</Button>
				</div>
			</div>
		</header>
	);
}
