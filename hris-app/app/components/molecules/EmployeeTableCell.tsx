import { useNavigate } from "react-router-dom";
import { EmployeeAvatar } from "~/components/atoms/EmployeeAvatar";
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

	const content = avatar !== undefined ? (
		<div className="flex min-w-0 items-center gap-3">
			<EmployeeAvatar
				src={avatar}
				alt={resolvedName}
				size="md"
				className="shrink-0"
			/>
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
				"flex min-w-0 text-left transition-colors hover:text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2",
				avatar !== undefined ? "w-full flex-row items-center" : "flex-col",
				className,
			)}>
			{content}
		</button>
	);
}
