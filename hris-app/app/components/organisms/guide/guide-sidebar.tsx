import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Section, Page } from "~/zod/guide.zod";

import { Icon } from "~/components/atoms";
import { GuideNavItem } from "~/components/molecules/guide/guide-nav-item";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";

interface GuideSidebarProps {
	sections: Section[];
	activePageId: string;
	onPageSelect: (page: Page) => void;
	isOpen?: boolean;
	onClose?: () => void;
}

export function GuideSidebar({
	sections,
	activePageId,
	onPageSelect,
	isOpen = true,
	onClose,
}: GuideSidebarProps) {
	return (
		<>
			{/* Mobile overlay */}
			{isOpen && (
				<div
					className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
					onClick={onClose}
					aria-hidden="true"
				/>
			)}

			{/* Sidebar */}
			<aside
				className={cn(
					"fixed md:sticky top-14 left-0 z-40 h-[calc(100vh-3.5rem)] w-[280px] shrink-0",
					"bg-guide-sidebar border-r border-border",
					"transform transition-transform duration-300 ease-in-out md:transform-none",
					"overflow-y-auto guide-scrollbar",
					isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
				)}
				role="navigation"
				aria-label="Guide navigation">
				<nav className="p-4 space-y-6">
					{sections.map((section) => (
						<SidebarSection
							key={section.id}
							section={section}
							activePageId={activePageId}
							onPageSelect={(page) => {
								onPageSelect(page);
								onClose?.();
							}}
						/>
					))}
				</nav>
			</aside>
		</>
	);
}

interface SidebarSectionProps {
	section: Section;
	activePageId: string;
	onPageSelect: (page: Page) => void;
}

function SidebarSection({ section, activePageId, onPageSelect }: SidebarSectionProps) {
	const hasActivePage = section.pages.some((p) => p.id === activePageId);
	const [isOpen, setIsOpen] = useState<boolean>(hasActivePage || true);

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
				<span>{section.title}</span>
				<Icon
					icon={ChevronDown}
					size="sm"
					className={cn("transition-transform duration-200", isOpen && "rotate-180")}
				/>
			</CollapsibleTrigger>
			<CollapsibleContent className="mt-1 space-y-0.5">
				{section.pages.map((page) => (
					<GuideNavItem
						key={page.id}
						page={page}
						isActive={page.id === activePageId}
						onClick={() => onPageSelect(page)}
					/>
				))}
			</CollapsibleContent>
		</Collapsible>
	);
}
