import { cn } from "@/lib/utils";
import type { InterviewType, InterviewMode } from "~/types/interview";

type BadgeVariant = "default" | "primary" | "success" | "warning" | "info";

interface StatusBadgeProps {
	children: React.ReactNode;
	variant?: BadgeVariant;
	className?: string;
}

const darkBadgeBackgroundPattern =
	/(^|\s)(bg-(black|neutral|slate|gray|zinc|stone)-(700|800|900|950)|bg-[a-z]+-(500|600|700|800|900|950)|bg-(primary|accent|destructive|success|warning|info)|bg-\[(var\(--theme-red\)|#[0-9a-fA-F]{3,8})\])(\s|$)/;

function hasDarkBadgeBackground(className?: string) {
	return typeof className === "string" && darkBadgeBackgroundPattern.test(className);
}

const variantStyles: Record<BadgeVariant, string> = {
	default: "bg-secondary text-secondary-foreground",
	primary: "bg-primary/10 text-primary",
	success: "bg-success/10 text-success",
	warning: "bg-warning/10 text-warning",
	info: "bg-accent/10 text-accent",
};

export const StatusBadge = ({ children, variant = "default", className }: StatusBadgeProps) => {
	return (
		<span
			className={cn(
				"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
				variantStyles[variant],
				className,
				hasDarkBadgeBackground(className) && "text-white",
			)}>
			{children}
		</span>
	);
};

// Utility function to get badge variant for interview type
export const getInterviewTypeBadgeVariant = (type: InterviewType): BadgeVariant => {
	const map: Record<InterviewType, BadgeVariant> = {
		HR: "info",
		Technical: "primary",
		Panel: "warning",
		Final: "success",
	};
	return map[type];
};

// Utility function to get badge variant for interview mode
export const getInterviewModeBadgeVariant = (mode: InterviewMode): BadgeVariant => {
	const map: Record<InterviewMode, BadgeVariant> = {
		Online: "info",
		Onsite: "primary",
		Hybrid: "warning",
	};
	return map[mode];
};
