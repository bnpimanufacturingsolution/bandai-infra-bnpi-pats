import { cn } from "~/lib/utils";

interface StatusBadgeProps {
	status: string;
	className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
	if (!status || status === "N/A" || status === "-") {
		return <span className="text-gray-400">-</span>;
	}

	// Convert nicely formatted status (e.g. "On Leave") to css-friendly data-status (e.g. "on_leave")
	const statusKey = status.toLowerCase().replace(/\s+/g, "_");

	// Format display text: replace underscores with spaces and capitalize each word
	const displayText = status
		.toLowerCase()
		.replace(/_/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());

	return (
		<span className={cn("status-badge whitespace-nowrap", className)} data-status={statusKey}>
			{displayText}
		</span>
	);
}
