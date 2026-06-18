import { cn } from "@/lib/utils";
import { Text } from "@/components/atoms/Text";
import type { ReactNode } from "react";

interface InfoRowProps {
	label: string;
	value: ReactNode;
	className?: string;
}

export const InfoRow = ({ label, value, className }: InfoRowProps) => {
	return (
		<div
			className={cn(
				"flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-3",
				className,
			)}>
			<Text variant="caption" className="w-full sm:w-40 shrink-0 text-muted-foreground">
				{label}
			</Text>
			<div className="text-foreground font-medium">{value}</div>
		</div>
	);
};
