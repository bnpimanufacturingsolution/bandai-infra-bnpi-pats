import React from "react";
import { useAuth } from "~/lib/hooks/use-auth";
import { useAttendances } from "~/lib/hooks/useAttendances";
import { DataTable } from "~/components/atoms/DataTable";
import { AgencyGuard, AgencyPageShell, useAgencyIdentity } from "~/components/pages/agency-workspace/agency-shared";

export function toISODate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function lastNDaysRange(n: number, now = new Date()): { from: string; to: string } {
	const to = new Date(now);
	const from = new Date(now);
	from.setDate(from.getDate() - (n - 1));
	return { from: toISODate(from), to: toISODate(to) };
}

export default function AgencyAttendancePage() {
	return (
		<AgencyGuard>
			<AgencyAttendanceContent />
		</AgencyGuard>
	);
}

function AgencyAttendanceContent() {
	const { user } = useAuth();
	const { agencyId, hasRealAgencyId } = useAgencyIdentity();

	const {
		data: attendanceData,
		isLoading,
		isError,
	} = useAttendances(
		// useAttendances has no enabled option: without an agency identity,
		// match nothing instead of fetching the unscoped ledger.
		hasRealAgencyId
			? {
					filter: `employee.agencyId:${agencyId}`,
					sort: "date",
					order: "desc",
					limit: 100,
				}
			: { filter: "employee.agencyId:__unscoped__", limit: 1 },
	);

	const rows = (attendanceData as any)?.attendances || [];

	return (
		<AgencyPageShell>
			<div data-testid="agency-page-attendance">
				{!hasRealAgencyId ? (
					<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
						Agency identity is not configured for this login. Contact your administrator.
					</div>
				) : isError ? (
					<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200">
						<p className="font-semibold">Endpoint not permitted</p>
						<p className="mt-1 text-xs">
							The attendance endpoint returned an error for the agency filter. No rows are invented.
						</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<DataTable
							data={rows}
							isLoading={isLoading}
							columns={[
								{
									key: "date",
									label: "Date",
									sortable: true,
									render: (v: any) => <span>{v ? String(v).slice(0, 10) : "—"}</span>,
									width: "w-28",
								},
								{
									key: "employee.employeeId",
									label: "Employee",
									render: (v: any, row: any) => <span>{row.employee?.employeeId || "—"}</span>,
									width: "w-28",
								},
								{ key: "status", label: "Status", width: "w-28" },
								{
									key: "timeIn",
									label: "Time in",
									render: (v: any) => <span>{v ? String(v).slice(11, 16) : "—"}</span>,
									width: "w-20",
								},
								{
									key: "timeOut",
									label: "Time out",
									render: (v: any) => <span>{v ? String(v).slice(11, 16) : "—"}</span>,
									width: "w-20",
								},
							]}
							itemsPerPage={15}
							emptyMessage="No attendance rows in this range."
							emptyDescription="Rows appear here once biometrics/attendance exist for agency members."
						/>
					</div>
				)}
			</div>
		</AgencyPageShell>
	);
}
