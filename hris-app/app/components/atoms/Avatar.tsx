import * as React from "react";
import {
	EmployeeAvatarFallback,
	employeeAvatarPlaceholderClassName,
} from "~/components/atoms/EmployeeAvatar";
import { cn } from "~/lib/utils";

export interface AvatarProps extends React.ComponentProps<"div"> {
	src?: string;
	alt?: string;
	name?: string;
	size?: "sm" | "md" | "lg" | "xl";
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
	({ className, src, alt, name, size = "md", ...props }, ref) => {
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
					"relative flex items-center justify-center overflow-hidden rounded-full font-medium",
					src ? "bg-orange-600 text-white" : employeeAvatarPlaceholderClassName,
					sizeClasses[size],
					className,
				)}
				{...props}>
				{src ? (
					<img
						src={src}
						alt={alt || name || "Avatar"}
						className="h-full w-full rounded-full object-cover"
					/>
				) : (
					<span className="flex h-full w-full items-center justify-center bg-white p-1">
						<EmployeeAvatarFallback />
					</span>
				)}
			</div>
		);
	},
);
Avatar.displayName = "Avatar";

export { Avatar };
