import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { BANDAI_SIDEBAR_LOGO_URL } from "~/constants/branding";
import { cn } from "~/lib/utils";

type EmployeeAvatarSize = "sm" | "md" | "lg" | "xl";

export interface EmployeeAvatarProps {
	src?: string | null;
	alt?: string;
	className?: string;
	size?: EmployeeAvatarSize;
	imageClassName?: string;
	fallbackClassName?: string;
}

const sizeClasses: Record<EmployeeAvatarSize, string> = {
	sm: "h-8 w-8",
	md: "h-9 w-9",
	lg: "h-12 w-12",
	xl: "h-20 w-20",
};

export const employeeAvatarPlaceholderClassName =
	"border border-gray-200 bg-white shadow-sm";

export function EmployeeAvatarFallback({ className }: { className?: string }) {
	return (
		<img
			src={BANDAI_SIDEBAR_LOGO_URL}
			alt="Bandai logo"
			className={cn("h-full w-full object-contain", className)}
		/>
	);
}

export function EmployeeAvatar({
	src,
	alt = "Employee avatar",
	className,
	size,
	imageClassName,
	fallbackClassName,
}: EmployeeAvatarProps) {
	const resolvedSrc = String(src || "").trim() || null;

	return (
		<Avatar
			className={cn(
				size && sizeClasses[size],
				!resolvedSrc && employeeAvatarPlaceholderClassName,
				className,
			)}>
			{resolvedSrc ? (
				<AvatarImage src={resolvedSrc} alt={alt} className={cn("object-cover", imageClassName)} />
			) : null}
			<AvatarFallback className={cn("bg-white p-1", fallbackClassName)}>
				<EmployeeAvatarFallback />
			</AvatarFallback>
		</Avatar>
	);
}