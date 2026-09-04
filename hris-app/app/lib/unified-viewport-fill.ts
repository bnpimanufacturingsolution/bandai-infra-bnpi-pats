/**
 * Unified-layout (HR / employee) routes where the main content pane is
 * height-locked (no page scrollbar) so list DataTables with `containedScroll`
 * fill remaining viewport height and scroll inside the table shell.
 *
 * Form / create / detail / dashboard pages that need document scroll return false.
 *
 * Mirror of `isAdminViewportFillPath` for `/hr/*` and `/employee/*` table lists.
 * When adding a new full-height list table under unified layout:
 * 1. Add the path here (or under a clear prefix rule)
 * 2. Wrap the page in `AdminTablePageShell` (or the same flex classes)
 * 3. Pass `containedScroll` on `DataTable`
 */
export function isUnifiedViewportFillPath(pathname: string): boolean {
	const path = (pathname.replace(/\/+$/, "") || "/").toLowerCase();

	// Explicit non-fill (forms, create wizards, nested detail)
	if (
		path === "/hr/benefits-management/new" ||
		path.startsWith("/hr/benefits-management/new/") ||
		path === "/hr/employees/new" ||
		path.startsWith("/hr/employees/") || // edit/profile under employees
		path === "/hr/benefit-types/new" ||
		path.startsWith("/hr/dashboard") ||
		path === "/hr/run-payroll" ||
		path === "/hr/settings" ||
		path === "/hr/profile" ||
		path === "/hr/messages" ||
		path === "/hr/notifications" ||
		path === "/hr/help"
	) {
		return false;
	}

	// HR list / dense table pages that implement the full-height standard
	// (AdminTablePageShell + DataTable containedScroll). Multi-view pages
	// (e.g. /hr/employees with tabs) stay page-scroll until restructured.
	if (
		path === "/hr/benefits-management" ||
		path === "/hr/benefit-types" ||
		path === "/hr/activity-logs" ||
		path === "/hr/audit-logs" ||
		path === "/hr/disciplinary-action" ||
		path === "/hr/settings/documents" ||
		path === "/hr/employee-schedules"
	) {
		return true;
	}

	return false;
}
