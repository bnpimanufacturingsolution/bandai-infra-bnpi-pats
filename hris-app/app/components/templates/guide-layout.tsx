import { type ReactNode, useState, useCallback } from "react";
import { SidebarItem } from "../molecules/guide/sidebar-item";
import type { NavItem } from "~/types/guide-data";

interface GuideLayoutProps {
	version?: string;
	navigation: NavItem[];
	activeId?: string;
	children: ReactNode;
}

export const GuideLayout = ({ version, navigation, activeId, children }: GuideLayoutProps) => {
	const [currentActiveId, setCurrentActiveId] = useState(activeId);

	const handleNavigate = useCallback(
		(href: string) => {
			console.log("[v0] Navigating to:", href);
			// In a real app, this would use Next.js router
			// For now, we'll just update the active state
			const findItemByHref = (items: NavItem[], targetHref: string): string | undefined => {
				for (const item of items) {
					if (item.href === targetHref) return item.id;
					if (item.children) {
						const found = findItemByHref(item.children, targetHref);
						if (found) return found;
					}
				}
			};
			const newActiveId = findItemByHref(navigation, href);
			if (newActiveId) {
				setCurrentActiveId(newActiveId);
			}
		},
		[navigation],
	);

	return (
		<div className="flex h-screen overflow-hidden bg-background">
			<aside className="w-80 shrink-0 overflow-y-auto border-r border-border bg-guide-sidebar p-4">
				{version ? (
					<div className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						v{version}
					</div>
				) : null}
				<div className="space-y-1">
					{navigation.map((item) => (
						<SidebarItem
							key={item.id}
							item={item}
							activeId={currentActiveId}
							onNavigate={handleNavigate}
						/>
					))}
				</div>
			</aside>
			<main className="flex-1 overflow-y-auto">
				<div className="max-w-4xl mx-auto px-8 py-12">{children}</div>
			</main>
		</div>
	);
};
