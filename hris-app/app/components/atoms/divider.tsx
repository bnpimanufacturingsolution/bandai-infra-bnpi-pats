import { cn } from "@/lib/utils";
import { type HTMLAttributes, forwardRef } from "react";

interface DividerProps extends HTMLAttributes<HTMLHRElement> {
	orientation?: "horizontal" | "vertical";
	decorative?: boolean;
}

export const Divider = forwardRef<HTMLHRElement, DividerProps>(
	({ orientation = "horizontal", decorative = true, className, ...props }, ref) => {
		return (
			<hr
				ref={ref}
				aria-orientation={orientation}
				aria-hidden={decorative}
				className={cn(
					"shrink-0 bg-border",
					orientation === "horizontal" ? "h-px w-full my-4" : "h-full w-px",
					className,
				)}
				{...props}
			/>
		);
	},
);

Divider.displayName = "Divider";
