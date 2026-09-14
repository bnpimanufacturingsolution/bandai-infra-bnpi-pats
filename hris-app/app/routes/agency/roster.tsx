import React from "react";
import { useAuth } from "~/lib/hooks/use-auth";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { DataTable } from "~/components/atoms/DataTable";
import { AgencyGuard, AgencyPageShell, useAgencyIdentity } from "~/components/pages/agency-workspace/agency-shared";

export default function AgencyRosterPage() {
	return (
		<AgencyGuard>
			<AgencyRosterContent />
		</AgencyGuard>
	);
}

function AgencyRosterContent() {
	const { user } = useAuth();
	const { agencyId, hasRealAgencyId } = useAgencyIdentity();
	const [page, setPage] = React.useState(1);

	const {
		data: rosterData,
		isLoading: rosterLoading,
		isError: rosterError,
	} = useEmployees(
		hasRealAgencyId
			? {
					filter: `agencyId:${agencyId},employmentStatus:ACTIVE,employmentStatus:ONBOARDING,employmentStatus:ON_LEAVE`,
					page,
					limit: 50,
				}
			: undefined,
		{ enabled: !!user && !!hasRealAgencyId },
	);

	const employees = (rosterData as any)?.employees || [];
	const totalPages = (rosterData as any)?.pagination?.totalPages || 1;

	return (
		<AgencyPageShell>
			<div data-testid="agency-page-roster">
				{rosterError ? (
					<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200">
						<p className="font-semibold">Endpoint not permitted</p>
						<p className="mt-1 text-xs">
							The agency roster endpoint returned a 403 or 404. No fake employee rows are shown.
						</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<DataTable
							data={employees}
							isLoading={rosterLoading}
							columns={[
								{ key: "employeeId", label: "Code", sortable: true, width: "w-24" },
								{
									key: "person.personalInfo",
									label: "Name",
									render: (v: any, row: any) => (
										<span>{`${row.person?.personalInfo?.firstName || ""} ${row.person?.personalInfo?.lastName || ""}`.trim() || "—"}</span>
									),
									width: "w-48",
								},
								{
									key: "department.name",
									label: "Department",
									render: (v: any) => <span className="text-xs text-slate-500">{v || "—"}</span>,
									width: "w-40",
								},
								{
									key: "workforceSource",
									label: "Labor",
									render: (v: any) => (
										<span className="text-xs font-medium">{v === "AGENCY" ? "Indirect" : "Direct"}</span>
									),
									width: "w-20",
								},
								{ key: "employmentStatus", label: "Status", width: "w-28" },
							]}
							currentPage={page}
							totalPages={totalPages}
							onPageChange={setPage}
							emptyMessage="No members found for this agency."
							emptyDescription="Members appear here once employees are assigned to this agency."
						/>
					</div>
				)}
			</div>
		</AgencyPageShell>
	);
}
