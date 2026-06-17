import { cn } from "~/lib/utils";

interface SettingsSectionHeaderProps {
	title: string;
	className?: string;
}

export function SettingsSectionHeader({ title, className }: SettingsSectionHeaderProps) {
	return (
		<h3
			className={cn(
				"text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-3",
				className,
			)}>
			{title}
		</h3>
	);
}
