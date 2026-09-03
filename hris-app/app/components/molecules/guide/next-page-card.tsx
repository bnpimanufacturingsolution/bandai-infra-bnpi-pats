import { Card } from "@/components/ui/card";
import { Typography } from "@/components/atoms/typography";

import { cn } from "@/lib/utils";
import { Icon } from "~/components/atoms";

interface NextPageCardProps {
	title: string;
	href: string;
	onNavigate?: (href: string) => void;
	className?: string;
}

export const NextPageCard = ({ title, href, onNavigate, className }: NextPageCardProps) => {
	return (
		<Card
			className={cn(
				"p-6 cursor-pointer hover:bg-accent/50 transition-colors border-border",
				className,
			)}
			onClick={() => onNavigate?.(href)}>
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-1">
					<Typography variant="muted" className="text-xs uppercase tracking-wide">
						Next
					</Typography>
					<Typography variant="h3" className="text-lg">
						{title}
					</Typography>
				</div>
				<Icon name="ArrowRight" size={20} className="text-muted-foreground" />
			</div>
		</Card>
	);
};
