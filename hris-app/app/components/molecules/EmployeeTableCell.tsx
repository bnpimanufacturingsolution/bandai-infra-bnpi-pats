import { useNavigate } from "react-router-dom";
import { cn } from "~/lib/utils";

interface EmployeeTableCellProps {
	profileId?: string | null;
	fullName?: string | null;
	employeeId?: string | null;
	fallbackName?: string;
	className?: string;
	stopPropagation?: boolean;
}

export function EmployeeTableCell({
	profileId,
	fullName,
	employeeId,
	fallbackName = "-",
	className,
	stopPropagation = false,
}: EmployeeTableCellProps) {
	const navigate = useNavigate();
	const resolvedName = fullName?.trim() || employeeId || fallbackName;
	const resolvedEmployeeId = employeeId?.trim() || "-";

	const content = (
		<>
			<span className="truncate text-sm font-medium text-gray-900">{resolvedName}</span>
			<span className="truncate text-xs text-gray-500">{resolvedEmployeeId}</span>
		</>
	);

	if (!profileId) {
		return <div className={cn("flex min-w-0 flex-col", className)}>{content}</div>;
	}

	return (
		<button
			type="button"
			onClick={(event) => {
				if (stopPropagation) {
					event.stopPropagation();
				}
				navigate(`/employee/${profileId}`);
			}}
			className={cn(
				"flex min-w-0 flex-col text-left transition-colors hover:text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2",
				className,
			)}>
			{content}
		</button>
	);
}
