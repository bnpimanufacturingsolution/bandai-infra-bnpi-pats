"use client";

import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
	title: string;
	subtitle: string;
	action?: {
		label: string;
		icon: LucideIcon;
		onClick: () => void;
	};
}

export default function CalendarHeader({ title, subtitle, action }: PageHeaderProps) {
	return (
		<div className="flex items-start justify-between ">
			<div>
				<h1 className="text-xl font-bold text-foreground mb-2 text-balance">{title}</h1>
			</div>
			{action && (
				<Button
					onClick={action.onClick}
					className="bg-[#e60012] text-white hover:cursor-pointer hover:bg-[#e60012]/90  gap-2 whitespace-nowrap">
					<action.icon className="w-4 h-4" />
					{action.label}
				</Button>
			)}
		</div>
	);
}
