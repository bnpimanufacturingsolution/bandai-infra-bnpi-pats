import { cn } from "@/lib/utils";
import { ChevronRight, FileText } from "lucide-react";

import { type Page } from "~/zod/guide.zod";
import { Icon } from "~/components/atoms";

interface GuideNavItemProps {
	page: Page;
	isActive: boolean;
	onClick: () => void;
}

export function GuideNavItem({ page, isActive, onClick }: GuideNavItemProps) {
	return (
		<button
			onClick={onClick}
			className={cn(
				"w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-all duration-200",
				"text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				isActive
					? "bg-accent text-accent-foreground font-medium"
					: "text-muted-foreground hover:text-foreground",
			)}
			aria-current={isActive ? "page" : undefined}>
			<Icon
				icon={isActive ? ChevronRight : FileText}
				size="sm"
				className={cn(
					"shrink-0 transition-transform duration-200",
					isActive && "text-primary",
				)}
			/>
			<span className="truncate">{page.title}</span>
		</button>
	);
}
