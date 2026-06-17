import type React from "react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

import { ChevronRight } from "lucide-react";
import { useState, useCallback } from "react";
import { Icon } from "~/components/atoms";
import type { NavItem } from "~/types/guide-data";

interface SidebarItemProps {
	item: NavItem;
	activeId?: string;
	level?: number;
	onNavigate?: (href: string) => void;
}

export const SidebarItem = ({ item, activeId, level = 0, onNavigate }: SidebarItemProps) => {
	const [isExpanded, setIsExpanded] = useState(item.isExpanded ?? true);
	const hasChildren = item.children && item.children.length > 0;
	const isActive = activeId === item.id;

	const handleToggle = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		setIsExpanded((prev) => !prev);
	}, []);

	const handleClick = useCallback(() => {
		if (onNavigate && item.href) {
			onNavigate(item.href);
		}
	}, [onNavigate, item.href]);

	return (
		<div className="w-full">
			<Button
				variant={isActive ? "secondary" : "ghost"}
				className={cn(
					"w-full justify-start gap-2 font-normal h-auto py-2",
					level > 0 && "pl-6",
					isActive && "bg-secondary text-secondary-foreground font-medium",
				)}
				onClick={handleClick}>
				{hasChildren && (
					<ChevronRight
						className={cn(
							"size-4 transition-transform shrink-0",
							isExpanded && "rotate-90",
						)}
						onClick={handleToggle}
					/>
				)}
				{!hasChildren && level > 0 && <span className="w-4" />}
				{item.icon && <Icon name={item.icon as any} size={16} />}
				<span className="text-sm truncate">{item.title}</span>
			</Button>

			{hasChildren && isExpanded && (
				<div className="mt-1 space-y-1">
					{item.children?.map((child) => (
						<SidebarItem
							key={child.id}
							item={child}
							activeId={activeId}
							level={level + 1}
							onNavigate={onNavigate}
						/>
					))}
				</div>
			)}
		</div>
	);
};
