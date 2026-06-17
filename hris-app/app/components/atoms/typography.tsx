import { cn } from "@/lib/utils";
import React from "react";

type TypographyElement = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div" | "label";

interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
	variant?: "h1" | "h2" | "h3" | "body" | "small" | "muted";
	as?: TypographyElement;
}

export const Typography = React.memo(
	({ variant = "body", as, className, children, ...props }: TypographyProps) => {
		const Component =
			as ||
			(variant === "h1" ? "h1" : variant === "h2" ? "h2" : variant === "h3" ? "h3" : "p");

		const variantClasses = {
			h1: "text-3xl font-semibold tracking-tight text-foreground leading-tight",
			h2: "text-2xl font-semibold tracking-tight text-foreground leading-snug",
			h3: "text-xl font-semibold text-foreground leading-snug",
			body: "text-base text-foreground leading-relaxed",
			small: "text-sm text-foreground leading-relaxed",
			muted: "text-sm text-muted-foreground leading-relaxed",
		};

		return (
			<Component className={cn(variantClasses[variant], className)} {...props}>
				{children}
			</Component>
		);
	},
);

Typography.displayName = "Typography";
