import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const darkBadgeBackgroundPattern =
	/(^|\s)(bg-(black|neutral|slate|gray|zinc|stone)-(700|800|900|950)|bg-[a-z]+-(500|600|700|800|900|950)|bg-(primary|accent|destructive|success|warning|info)|bg-\[(var\(--theme-red\)|#[0-9a-fA-F]{3,8})\])(\s|$)/;

function hasDarkBadgeBackground(className?: string) {
	return typeof className === "string" && darkBadgeBackgroundPattern.test(className);
}

const badgeVariants = cva(
	"inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground",
				secondary: "bg-orange-500 text-white",
				outline: "border border-border bg-background",
				accent: "bg-accent text-accent-foreground",
				destructive: "bg-destructive text-destructive-foreground",
				success: "bg-green-500 text-white",
				warning: "bg-yellow-500 text-white",
				info: "bg-blue-500 text-white",
				"success-soft": "bg-green-50 text-green-800 border border-green-200",
				"warning-soft": "bg-yellow-50 text-yellow-800 border border-yellow-200",
				"destructive-soft": "bg-red-50 text-white border border-red-200",
				"primary-soft": "bg-primary/5 text-primary-800 border border-primary/20",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

export interface BadgeProps
	extends React.ComponentProps<"div">,
		VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
	return (
		<div
			className={cn(
				badgeVariants({ variant }),
				className,
				hasDarkBadgeBackground(className) && "text-white",
			)}
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
