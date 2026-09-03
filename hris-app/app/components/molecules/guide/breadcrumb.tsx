import { Typography } from "@/components/atoms/typography";
import { Icon } from "~/components/atoms";

interface BreadcrumbProps {
	items: { label: string; href?: string }[];
	onNavigate?: (href: string) => void;
}

export const Breadcrumb = ({ items, onNavigate }: BreadcrumbProps) => {
	return (
		<nav aria-label="Breadcrumb" className="flex items-center gap-2 flex-wrap">
			{items.map((item, index) => (
				<div key={index} className="flex items-center gap-2">
					{index > 0 && (
						<Icon name="ChevronRight" size={14} className="text-muted-foreground" />
					)}
					{item.href && onNavigate ? (
						<button
							onClick={() => onNavigate(item.href!)}
							className="text-sm text-muted-foreground hover:text-foreground transition-colors">
							{item.label}
						</button>
					) : (
						<Typography
							variant="small"
							className={
								index === items.length - 1
									? "text-foreground font-medium"
									: "text-muted-foreground"
							}>
							{item.label}
						</Typography>
					)}
				</div>
			))}
		</nav>
	);
};
