import * as React from "react";
import { cn } from "~/lib/utils";
import { resolveUploadUrl } from "~/lib/upload-url";

export interface AvatarProps extends React.ComponentProps<"div"> {
	src?: string;
	alt?: string;
	name?: string;
	size?: "sm" | "md" | "lg" | "xl";
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
	({ className, src, alt, name, size = "md", ...props }, ref) => {
		const resolvedSrc = resolveUploadUrl(src);
		const getInitials = (name: string) => {
			return name
				.split(" ")
				.map((n) => n[0])
				.join("")
				.toUpperCase()
				.slice(0, 2);
		};

		const sizeClasses = {
			sm: "h-8 w-8 text-xs",
			md: "h-10 w-10 text-sm",
			lg: "h-12 w-12 text-base",
			xl: "h-16 w-16 text-lg",
		};

		return (
			<div
				ref={ref}
				className={cn(
					"relative flex items-center justify-center rounded-full bg-orange-600 text-white font-medium",
					sizeClasses[size],
					className,
				)}
				{...props}>
				{resolvedSrc ? (
					<img
						src={resolvedSrc}
						alt={alt || name || "Avatar"}
						className="h-full w-full rounded-full object-cover"
					/>
				) : (
					<span>{name ? getInitials(name) : "?"}</span>
				)}
			</div>
		);
	},
);
Avatar.displayName = "Avatar";

export { Avatar };
