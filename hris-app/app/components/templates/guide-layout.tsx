import { type ReactNode, useState, useCallback } from "react";
import { GuideSidebar } from "../organisms/guide/guide-sidebar";
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
			<GuideSidebar
				version={version}
				navigation={navigation}
				activeId={currentActiveId}
				onNavigate={handleNavigate}
			/>
			<main className="flex-1 overflow-y-auto">
				<div className="max-w-4xl mx-auto px-8 py-12">{children}</div>
			</main>
		</div>
	);
};
