import { cn } from "~/lib/utils";
import type { LucideProps } from "lucide-react";

interface SettingsNavItemProps {
	icon: React.ComponentType<LucideProps>;
	label: string;
	isActive?: boolean;
	onClick?: () => void;
}

export function SettingsNavItem({ icon: Icon, label, isActive, onClick }: SettingsNavItemProps) {
	return (
		<button
			onClick={onClick}
			className={cn(
				"flex items-center gap-3 w-full px-3 py-2.5 text-sm rounded-lg transition-all text-left",
				isActive
					? "bg-secondary text-foreground font-medium shadow-sm"
					: "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
			)}>
			<Icon className="h-[18px] w-[18px] shrink-0" />
			<span>{label}</span>
		</button>
	);
}
