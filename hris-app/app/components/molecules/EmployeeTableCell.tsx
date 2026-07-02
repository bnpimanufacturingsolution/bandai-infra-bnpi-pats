import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { cn } from "~/lib/utils";

interface EmployeeTableCellProps {
	profileId?: string | null;
	fullName?: string | null;
	employeeId?: string | null;
	avatar?: string | null;
	fallbackName?: string;
	className?: string;
	stopPropagation?: boolean;
	onClick?: () => void;
}

const getEmployeeInitials = (fullName?: string | null, employeeId?: string | null) => {
	const parts = String(fullName || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean);

	if (parts.length === 1) {
		return parts[0].slice(0, 2).toUpperCase();
	}

	if (parts.length > 1) {
		return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
	}

	const fallback = String(employeeId || "")
		.trim()
		.replace(/[^a-zA-Z0-9]/g, "");
	return fallback.slice(0, 2).toUpperCase() || "?";
};

export function EmployeeTableCell({
	profileId,
	fullName,
	employeeId,
	avatar,
	fallbackName = "-",
	className,
	stopPropagation = false,
	onClick,
}: EmployeeTableCellProps) {
	const navigate = useNavigate();
	const resolvedName = fullName?.trim() || employeeId || fallbackName;
	const resolvedEmployeeId = employeeId?.trim() || "-";
	const initials = getEmployeeInitials(fullName, employeeId);

	const content = avatar !== undefined ? (
		<div className="flex min-w-0 items-center gap-3">
			<Avatar className="h-9 w-9 shrink-0">
				{avatar ? <AvatarImage src={avatar} alt={resolvedName} /> : null}
				<AvatarFallback className="bg-orange-100 text-[11px] font-semibold uppercase text-orange-700">
					{initials}
				</AvatarFallback>
			</Avatar>
			<div className="flex min-w-0 flex-col">
				<span className="truncate text-sm font-medium text-gray-900">{resolvedName}</span>
				<span className="truncate text-xs text-gray-500">{resolvedEmployeeId}</span>
			</div>
		</div>
	) : (
		<>
			<span className="truncate text-sm font-medium text-gray-900">{resolvedName}</span>
			<span className="truncate text-xs text-gray-500">{resolvedEmployeeId}</span>
		</>
	);

	if (!profileId && !onClick) {
		return <div className={cn("flex min-w-0 flex-col", className)}>{content}</div>;
	}

	return (
		<button
			type="button"
			onClick={(event) => {
				if (stopPropagation) {
					event.stopPropagation();
				}
				if (onClick) {
					onClick();
					return;
				}
				if (profileId) {
					navigate(`/employee/${profileId}`);
				}
			}}
			className={cn(
				"flex min-w-0 flex-col text-left transition-colors hover:text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2",
				className,
			)}>
			{content}
		</button>
	);
}
