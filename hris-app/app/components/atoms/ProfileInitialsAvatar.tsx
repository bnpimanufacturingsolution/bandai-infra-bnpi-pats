import * as React from "react";
import { cn } from "~/lib/utils";

type AvatarSize = "sm" | "md" | "lg";
type AvatarVariant = "orange" | "default";

export interface ProfileInitialsAvatarProps {
	name?: string;
	size?: AvatarSize;
	variant?: AvatarVariant;
	clickable?: boolean;
	disabled?: boolean;
	onClick?: () => void;
	className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
	sm: "w-10 h-10 text-sm",
	md: "w-12 h-12 text-base",
	lg: "w-16 h-16 text-xl",
};

const variantClasses: Record<AvatarVariant, string> = {
	orange: "border-2 border-white/90 bg-white text-[#e95a0c] shadow-md hover:shadow-lg transition-shadow",
	default: "bg-orange-600 text-white border border-orange-200",
};

const getInitials = (name?: string) => {
	if (!name) return "U";
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "U";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

export function ProfileInitialsAvatar({
	name,
	size = "md",
	variant = "orange",
	clickable = false,
	disabled = false,
	onClick,
	className,
}: ProfileInitialsAvatarProps) {
	const content = (
		<div
			className={cn(
				"rounded-full flex items-center justify-center font-bold select-none",
				sizeClasses[size],
				variantClasses[variant],
				className,
			)}>
			{getInitials(name)}
		</div>
	);

	if (!clickable) return content;

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="rounded-full disabled:cursor-not-allowed"
			aria-label={name ? `Open ${name} profile` : "Open profile"}>
			{content}
		</button>
	);
}
