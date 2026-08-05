import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

/**
 * Full-height shell for dense list/table pages (admin + HR).
 *
 * ## Standard (always use for list DataTables)
 *
 * 1. **Layout viewport-fill** — path must be listed in
 *    `isAdminViewportFillPath` (admin layout) or `isUnifiedViewportFillPath`
 *    (unified/HR layout) so main is height-locked (no document scrollbar).
 * 2. **This shell** — `flex h-full min-h-0 flex-col overflow-hidden` so children
 *    participate in the height chain.
 * 3. **DataTable `containedScroll`** — table body fills remaining space and
 *    scrolls inside the card; pagination stays pinned at the bottom of the shell.
 *
 * Optional chrome above the table (back link, filter chips): mark those
 * `shrink-0` and keep the DataTable (or a wrapper) as `flex-1 min-h-0`.
 *
 * Do **not** wrap list tables in bare `space-y-6` only — that collapses height
 * to content and leaves empty viewport below the table.
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
