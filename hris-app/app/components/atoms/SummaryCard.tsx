import * as React from "react";
import { cn } from "~/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./Card";
import { Badge } from "./Badge";
import { TrendingUp, TrendingDown } from "lucide-react";
import { themeColors } from "~/lib/config/theme";

export interface SummaryCardProps extends React.ComponentProps<"div"> {
	title: string;
	value: string | number;
	description?: string;
	icon?: React.ComponentType<{
		className?: string;
		style?: React.CSSProperties;
	}>;
	change?: {
		value: string;
		type: "positive" | "negative" | "neutral";
		period?: string;
	};
	trend?: {
		direction: "up" | "down" | "neutral";
		value?: string;
	};
	color?: "blue" | "green" | "orange" | "red" | "purple" | "gray" | "rose";
	variant?: "blue" | "green" | "orange" | "red" | "purple" | "gray" | "yellow" | "rose";
	appearance?: "default" | "minimal";
	className?: string;
	loading?: boolean;
	onClick?: () => void;
}

const colorVariants = {
	blue: {
		icon: themeColors.red,
		value: themeColors.red,
		change: themeColors.red,
		// Minimal white fill; keep soft theme border
		bg: "#ffffff",
		border: `rgba(218, 55, 50, 0.2)`,
		useInline: true,
	},
	green: {
		icon: themeColors.yellow,
		value: themeColors.yellow,
		change: themeColors.yellow,
		bg: "#ffffff",
		border: `rgba(247, 190, 51, 0.2)`,
		useInline: true,
	},
	orange: {
		icon: themeColors.orange,
		value: themeColors.orange,
		change: themeColors.orange,
		bg: "#ffffff",
		border: `rgba(228, 118, 47, 0.2)`,
		useInline: true,
	},
	red: {
		icon: themeColors.red,
		value: themeColors.red,
		change: themeColors.red,
		bg: "#ffffff",
		border: `rgba(218, 55, 50, 0.2)`,
		useInline: true,
	},
	purple: {
		icon: themeColors.orange,
		value: themeColors.orange,
		change: themeColors.orange,
		bg: "#ffffff",
		border: `rgba(228, 118, 47, 0.2)`,
		useInline: true,
	},
	gray: {
		icon: "text-gray-600",
		value: "text-gray-600",
		change: "text-gray-600",
		bg: "bg-white",
		border: "border-gray-200",
		useInline: false,
	},
	yellow: {
		icon: themeColors.yellow,
		value: themeColors.yellow,
		change: themeColors.yellow,
		bg: "#ffffff",
		border: `rgba(247, 190, 51, 0.2)`,
		useInline: true,
	},
	rose: {
		icon: themeColors.rose,
		value: themeColors.rose,
		change: themeColors.rose,
		bg: "#ffffff",
		border: `rgba(244, 63, 94, 0.2)`,
		useInline: true,
	},
};

const minimalColorVariants = {
	blue: {
		icon: "text-sky-600",
		iconBg: "bg-sky-50",
		value: "text-neutral-900",
		title: "text-neutral-500",
		bg: "bg-white",
		border: "border-neutral-200/80",
		useInline: false,
	},
	green: {
		icon: "text-emerald-600",
		iconBg: "bg-emerald-50",
		value: "text-neutral-900",
		title: "text-neutral-500",
		bg: "bg-white",
		border: "border-neutral-200/80",
		useInline: false,
	},
	orange: {
		icon: "text-amber-600",
		iconBg: "bg-amber-50",
		value: "text-neutral-900",
		title: "text-neutral-500",
		bg: "bg-white",
		border: "border-neutral-200/80",
		useInline: false,
	},
	red: {
		icon: "text-rose-600",
		iconBg: "bg-rose-50",
		value: "text-neutral-900",
		title: "text-neutral-500",
		bg: "bg-white",
		border: "border-neutral-200/80",
		useInline: false,
	},
	purple: {
		icon: "text-violet-600",
		iconBg: "bg-violet-50",
		value: "text-neutral-900",
		title: "text-neutral-500",
		bg: "bg-white",
		border: "border-neutral-200/80",
		useInline: false,
	},
	gray: {
		icon: "text-neutral-600",
		iconBg: "bg-neutral-100",
		value: "text-neutral-900",
		title: "text-neutral-500",
		bg: "bg-white",
		border: "border-neutral-200/80",
		useInline: false,
	},
	yellow: {
		icon: "text-amber-600",
		iconBg: "bg-amber-50",
		value: "text-neutral-900",
		title: "text-neutral-500",
		bg: "bg-white",
		border: "border-neutral-200/80",
		useInline: false,
	},
	rose: {
		icon: "text-rose-600",
		iconBg: "bg-rose-50",
		value: "text-neutral-900",
		title: "text-neutral-500",
		bg: "bg-white",
		border: "border-neutral-200/80",
		useInline: false,
	},
};

const SummaryCard = React.forwardRef<HTMLDivElement, SummaryCardProps>(
	(
		{
			title,
			value,
			description,
			icon: Icon,
			change,
			trend,
			color = "blue",
			variant,
			appearance = "default",
			className,
			loading = false,
			onClick,
			...props
		},
		ref,
	) => {
		const selectedColor = variant || color;
		const isMinimal = appearance === "minimal";
		const colorVariant = isMinimal
			? minimalColorVariants[selectedColor]
			: colorVariants[selectedColor];
		const isClickable = !!onClick;

		if (loading) {
			return (
				<Card
					ref={ref}
					className={cn("hover:shadow-md transition-shadow", className)}
					{...props}>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<div className="animate-pulse">
							<div className="h-4 bg-gray-200 rounded w-24 mb-1"></div>
							<div className="h-3 bg-gray-200 rounded w-16"></div>
						</div>
						<div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
					</CardHeader>
					<CardContent>
						<div className="animate-pulse">
							<div className="h-10 bg-gray-200 rounded w-20 mb-2"></div>
							<div className="h-3 bg-gray-200 rounded w-24"></div>
						</div>
					</CardContent>
				</Card>
			);
		}

		const useInlineStyles = colorVariant.useInline;
		const cardStyle = useInlineStyles
			? {
					backgroundColor: colorVariant.bg,
					borderColor: colorVariant.border,
				}
			: {};
		const titleStyle = useInlineStyles
			? {
					color: colorVariant.value,
				}
			: {};
		const valueStyle = useInlineStyles
			? {
					color: colorVariant.value,
				}
			: {};
		const iconStyle = useInlineStyles
			? {
					color: colorVariant.icon,
				}
			: {};

		return (
			<Card
				ref={ref}
				className={cn(
					"transition-shadow border",
					isMinimal ? "shadow-none hover:shadow-sm" : "hover:shadow-md",
					!useInlineStyles && colorVariant.bg,
					!useInlineStyles && colorVariant.border,
					isClickable && "cursor-pointer hover:shadow-lg",
					className,
				)}
				style={cardStyle}
				onClick={onClick}
				{...props}>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4">
					<div className="flex flex-col gap-0">
						<CardTitle
							className={cn(
								"text-sm font-medium mb-0",
								isMinimal && "font-normal",
								!useInlineStyles && (isMinimal ? colorVariant.title : colorVariant.value),
							)}
							style={titleStyle}>
							{title}
						</CardTitle>
						<div
							className={cn(
								isMinimal ? "text-3xl font-semibold tracking-tight" : "text-4xl font-bold -mt-1",
								!useInlineStyles && colorVariant.value,
							)}
							style={valueStyle}>
							{value}
						</div>
					</div>
					{Icon &&
						(isMinimal ? (
							<div
								className={cn(
									"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
									colorVariant.iconBg,
								)}>
								<Icon className={cn("h-5 w-5", colorVariant.icon)} />
							</div>
						) : (
							<Icon
								className={cn("h-9 w-9", !useInlineStyles && colorVariant.icon)}
								style={iconStyle}
							/>
						))}
				</CardHeader>
				<CardContent className="pt-0">
					{description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
					{change && (
						<div className="flex items-center space-x-2 text-xs text-gray-500 mt-1">
							<span
								className={cn(
									change.type === "positive"
										? "text-green-600"
										: change.type === "negative"
											? "text-red-600"
											: "text-gray-600",
								)}>
								{change.value}
							</span>
							{change.period && <span>from {change.period}</span>}
						</div>
					)}
					{trend && (
						<div className="flex items-center space-x-1 text-xs mt-1">
							{trend.direction === "up" && (
								<TrendingUp className="h-3 w-3 text-green-500" />
							)}
							{trend.direction === "down" && (
								<TrendingDown className="h-3 w-3 text-red-500" />
							)}
							{trend.value && <span className="text-gray-500">{trend.value}</span>}
						</div>
					)}
				</CardContent>
			</Card>
		);
	},
);

SummaryCard.displayName = "SummaryCard";

export { SummaryCard };
