import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

/**
 * Full-height shell for admin list/table pages.
 * Parent admin layout must use viewport-fill mode (no page scrollbar);
 * DataTable with `containedScroll` fills remaining height and scrolls inside.
 */
export function AdminTablePageShell({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}>
			{children}
		</div>
	);
}
