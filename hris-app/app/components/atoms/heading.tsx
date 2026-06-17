import { cn } from "@/lib/utils";
import { type HTMLAttributes, forwardRef } from "react";

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
	level?: HeadingLevel;
	as?: `h${HeadingLevel}`;
}

const levelStyles: Record<HeadingLevel, string> = {
	1: "text-3xl md:text-4xl font-bold tracking-tight text-foreground",
	2: "text-2xl md:text-3xl font-semibold tracking-tight text-foreground mt-10 mb-4 scroll-mt-20",
	3: "text-xl md:text-2xl font-semibold tracking-tight text-foreground mt-8 mb-3 scroll-mt-20",
	4: "text-lg md:text-xl font-medium tracking-tight text-foreground mt-6 mb-2 scroll-mt-20",
	5: "text-base font-medium text-foreground mt-4 mb-2",
	6: "text-sm font-medium text-muted-foreground mt-4 mb-2",
};

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
	({ level = 2, as, className, children, id, ...props }, ref) => {
		const Component = as || (`h${level}` as `h${HeadingLevel}`);

		return (
			<Component
				ref={ref}
				id={id}
				className={cn(levelStyles[level], "group", className)}
				{...props}>
				{children}
				{id && (
					<a
						href={`#${id}`}
						className="ml-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
						aria-label={`Link to ${children}`}>
						#
					</a>
				)}
			</Component>
		);
	},
);

Heading.displayName = "Heading";
