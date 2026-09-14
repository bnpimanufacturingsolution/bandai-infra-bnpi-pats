import React from "react";
import { useAuth } from "~/lib/hooks/use-auth";
import { useTimesheets, useTimesheet } from "~/lib/hooks/useTimesheets";
import { DataTable } from "~/components/atoms/DataTable";
import { TimesheetViewModal } from "~/components/organisms/TimesheetViewModal";
import { AgencyGuard, AgencyPageShell, useAgencyIdentity } from "~/components/pages/agency-workspace/agency-shared";

export default function AgencyTimesheetsPage() {
	return (
		<AgencyGuard>
			<AgencyTimesheetsContent />
		</AgencyGuard>
	);
}

function AgencyTimesheetsContent() {
	const { user } = useAuth();
	const { agencyId, hasRealAgencyId } = useAgencyIdentity();
	const [viewId, setViewId] = React.useState<string | null>(null);

	const {
		data: timesheetsData,
		isLoading,
		isError,
	} = useTimesheets(
		hasRealAgencyId
			? { filter: `employee.agencyId:${agencyId}`, limit: 50, enabled: !!user }
			: { filter: "employee.agencyId:__unscoped__", limit: 1, enabled: !!user },
	);

	const { data: activeTimesheet, isLoading: isDetailLoading } = useTimesheet(viewId || "", {
		enabled: !!viewId && !!user,
	} as any);

	const rows = (timesheetsData as any)?.timesheets || [];

	return (
		<AgencyPageShell>
			<div data-testid="agency-page-timesheets">
				{isError ? (
					<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200">
						<p className="font-semibold">Endpoint not permitted</p>
						<p className="mt-1 text-xs">
							The timesheet endpoint returned an error for the agency filter. No fabricated timesheets are shown.
						</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<DataTable
							data={rows}
							isLoading={isLoading}
							columns={[
								{ key: "code", label: "Code", sortable: true, width: "w-28" },
								{
									key: "employee.employeeId",
									label: "Employee",
									render: (v: any, row: any) => <span>{row.employee?.employeeId || "—"}</span>,
									width: "w-32",
								},
								{
									key: "payrollPeriod.name",
									label: "Period",
									render: (v: any) => <span className="text-xs text-slate-500">{v || "—"}</span>,
									width: "w-40",
								},
								{ key: "status", label: "Status", width: "w-28" },
								{ key: "totalHoursWorked", label: "Hours", sortable: true, width: "w-16" },
								{
									key: "actions",
									label: "Actions",
									render: (_v: any, row: any) => (
										<button
											type="button"
											onClick={() => setViewId(row.id)}
											className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
										>
											View / adjust
										</button>
									),
									width: "w-28",
								},
							]}
							itemsPerPage={10}
							searchFields={["code", "employee.employeeId"] as any}
							emptyMessage="No timesheets found for this agency."
							emptyDescription="Timesheets appear here once members have timesheets in a period."
						/>
					</div>
				)}
			</div>

			<TimesheetViewModal
				isOpen={!!viewId}
				onClose={() => setViewId(null)}
				timesheet={(activeTimesheet as any) || null}
				isLoading={isDetailLoading}
				showActions={false}
				approvedEditedDaysSummary={(activeTimesheet as any)?.approvedEditedDaysSummary ?? null}
			/>
		</AgencyPageShell>
	);
}
