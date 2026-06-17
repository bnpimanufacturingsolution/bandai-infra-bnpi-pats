import * as React from "react";
import { cn } from "~/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./Card";

export interface ChartCardProps extends React.ComponentProps<"div"> {
	title: string;
	description?: string;
	children: React.ReactNode;
	className?: string;
	headerActions?: React.ReactNode;
	height?: string | number;
	loading?: boolean;
}

const ChartCard = React.forwardRef<HTMLDivElement, ChartCardProps>(
	(
		{
			title,
			description,
			children,
			className,
			headerActions,
			height = "h-64",
			loading = false,
			...props
		},
		ref,
	) => (
		<Card ref={ref} className={cn("", className)} {...props}>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle className="text-lg font-semibold">{title}</CardTitle>
						{description && (
							<CardDescription className="mt-1">{description}</CardDescription>
						)}
					</div>
					{headerActions && (
						<div className="flex items-center gap-2">{headerActions}</div>
					)}
				</div>
			</CardHeader>
			<CardContent>
				{loading ? (
					<div className={cn("flex items-center justify-center", height)}>
						<div className="animate-pulse">
							<div className="h-4 bg-gray-200 rounded w-32 mb-4"></div>
							<div className="h-32 bg-gray-200 rounded"></div>
						</div>
					</div>
				) : (
					<div className={cn("", height)}>{children}</div>
				)}
			</CardContent>
		</Card>
	),
);

ChartCard.displayName = "ChartCard";

export { ChartCard };
