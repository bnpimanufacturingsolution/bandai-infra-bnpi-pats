import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const textVariants = cva("", {
	variants: {
		variant: {
			h1: "text-4xl font-bold tracking-tight",
			h2: "text-3xl font-semibold tracking-tight",
			h3: "text-2xl font-semibold tracking-tight",
			h4: "text-xl font-semibold tracking-tight",
			h5: "text-lg font-semibold tracking-tight",
			h6: "text-base font-semibold tracking-tight",
			body: "text-base leading-7",
			small: "text-sm leading-6",
			caption: "text-xs leading-5",
			lead: "text-xl text-muted-foreground",
			label: "text-sm font-medium leading-none",
		},
		color: {
			default: "text-foreground",
			muted: "text-muted-foreground",
			primary: "text-primary",
			destructive: "text-destructive",
			success: "text-green-600",
			warning: "text-yellow-600",
			info: "text-blue-600",
		},
		weight: {
			normal: "font-normal",
			medium: "font-medium",
			semibold: "font-semibold",
			bold: "font-bold",
		},
	},
	defaultVariants: {
		variant: "body",
		color: "default",
		weight: "normal",
	},
});

export interface TextProps
	extends Omit<React.ComponentProps<"p">, "color">,
		VariantProps<typeof textVariants> {
	as?: "p" | "span" | "div" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "label";
}

const Text = React.forwardRef<HTMLParagraphElement, TextProps>(
	({ className, variant, color, weight, as, ...props }, ref) => {
		const Component = as || (variant?.startsWith("h") ? variant : "p");

		return React.createElement(Component, {
			className: cn(textVariants({ variant, color, weight, className })),
			ref,
			...props,
		});
	},
);
Text.displayName = "Text";

export { Text, textVariants };
