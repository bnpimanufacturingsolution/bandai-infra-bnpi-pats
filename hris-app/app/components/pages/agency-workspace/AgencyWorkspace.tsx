import React, { useState, useCallback } from "react";
import { Users, Clock, FileText, Upload, BarChart3, Building2 } from "lucide-react";
import { useAuth } from "~/lib/hooks/use-auth";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useTimesheets } from "~/lib/hooks/useTimesheets";
import { SummaryCard } from "~/components/atoms/SummaryCard";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { BiometricsImport } from "~/components/pages/agency-workspace/BiometricsImport";

export type AgencyTab = "Dashboard" | "Roster" | "Attendance" | "Timesheets" | "Biometrics";

export interface AgencyWorkspaceProps {
	agencyCode: string;
	agencyId: string;
	userEmail: string;
	userRole?: string;
}

// Back-end contracts being built in parallel (do not invent data):
// - GET /api/employee?filter=agencyId:<id>  (roster)
// - GET /api/timesheet?filter=employee.agencyId:<id>  (timesheets)
// - POST /api/agency/:id/attendance-import  (biometrics import)
// Wire exactly to these contracts; degrade gracefully on 403/404/500.

export function AgencyWorkspace({ agencyCode, agencyId, userEmail, userRole }: AgencyWorkspaceProps) {
	const { user } = useAuth();
	const [tab, setTab] = useState<AgencyTab>("Dashboard");

	const hasRealAgencyId = !!agencyId && agencyId !== "—" && agencyId !== "";

	// Roster data — useEmployees with agency filter.
	// Gracefully degrade if endpoint returns 403 or error.
	const {
		data: rosterData,
		isLoading: rosterLoading,
		isError: rosterError,
	} = useEmployees(
		hasRealAgencyId ? { filter: `agencyId:${agencyId}` } : undefined,
		{
			enabled: !!user && !!hasRealAgencyId,
		},
	);

	// Timesheets data — useTimesheets with employee.agencyId filter.
	const {
		data: timesheetsData,
		isLoading: timesheetsLoading,
		isError: timesheetsError,
	} = useTimesheets(
		hasRealAgencyId ? { filter: `employee.agencyId:${agencyId}` } : undefined,
		{
			enabled: !!user && !!hasRealAgencyId,
		},
	);

	// Graceful 403 / missing endpoint message.
	const gracefulNotReady = !hasRealAgencyId || rosterError || timesheetsError;

	const handleRetry = useCallback(() => {
		window.location.reload();
	}, []);

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 p-4" data-testid="agency-workspace">
			{/* Identity header */}
			<div
				className="rounded-xl border border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900"
				data-testid="agency-identity-header"
			>
				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
							Agency workspace
						</p>
						<h2 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
							{!hasRealAgencyId ? "Unknown agency" : `Agency ${agencyCode}`}
						</h2>
						<p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
							{!hasRealAgencyId
								? "Agency identity is not configured for this login. Contact your administrator."
								: `Signed in as ${userEmail} · agency id ${agencyId}`}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
							{userRole || "—"}
						</span>
					</div>
				</div>
			</div>

			{/* Tab navigation */}
			<div
				className="flex flex-wrap gap-2"
				role="tablist"
				aria-label="Agency sections"
				data-testid="agency-tabs"
			>
				{[
					"Dashboard",
					"Roster",
					"Attendance",
					"Timesheets",
					"Biometrics",
				].map((name) => (
					<button
						key={name}
						type="button"
						role="tab"
						aria-selected={tab === name}
						onClick={() => setTab(name as AgencyTab)}
						className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
							tab === name
								? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
								: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
						}`}
					>
						{name}
					</button>
				))}
			</div>

			{/* Tab panels */}
			<div
				className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
				role="tabpanel"
				data-testid={`agency-tab-${tab.toLowerCase()}`}
			>
				{tab === "Dashboard" && (
					<div className="space-y-4" data-testid="agency-tab-dashboard">
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<SummaryCard
								title="Agency members"
								value={gracefulNotReady ? "—" : String(rosterData?.employees?.length ?? 0)}
								description="Active roster count via agency filter"
								icon={Users}
								color="blue"
							/>
							<SummaryCard
								title="Today active"
								value={gracefulNotReady ? "—" : "—"}
								description="Scheduled-to-work members for this agency (needs schedule truth)"
								icon={Clock}
								color="green"
							/>
							<SummaryCard
								title="Pending approvals"
								value="—"
								description="Timesheets pending approval (agency scope, needs endpoint)"
								icon={FileText}
								color="orange"
							/>
							<SummaryCard
								title="Attendance import"
								value={gracefulNotReady ? "—" : "—"}
								description="Biometrics import available (/api/agency/:id/attendance-import)"
								icon={Upload}
								color="purple"
							/>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
							<h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Overview</h3>
							<p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
								Agency workspace connects to the following contracts (backend contracts
								being built in parallel — graceful 403/404/500 handled below):
							</p>
							<ul className="mt-3 list-disc pl-5 text-sm text-slate-600 dark:text-slate-400 space-y-1">
								<li>
									<code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">GET /api/employee?filter=agencyId:&lt;id&gt;</code>
									— roster data for this agency (filter by <code>agencyId</code> on Employee model).
								</li>
								<li>
									<code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">GET /api/timesheet?filter=employee.agencyId:&lt;id&gt;</code>
									— timesheets for members of this agency.
								</li>
								<li>
									<code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">POST /api/agency/:id/attendance-import</code>
									— biometrics/attendance import for the agency (multipart, dry-run supported).
								</li>
							</ul>

							{gracefulNotReady && (
								<div className="mt-4 rounded-lg bg-amber-50 p-4 dark:bg-amber-950/30">
									<p className="text-xs font-medium text-amber-800 dark:text-amber-200">Endpoint not ready</p>
									<p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
										The contract endpoint returned a 403 or 404. The workspace shows the correct tab structure and navigation without inventing data.
									</p>
								</div>
							)}
						</div>
					</div>
				)}

				{tab === "Roster" && (
					<div data-testid="agency-tab-roster" className="space-y-4" role="tabpanel">
						<div className="flex items-center justify-between">
							<h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Roster</h3>
						</div>
						<p className="text-sm text-slate-600 dark:text-slate-400">
							Active members of this agency loaded via{" "}
							<code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">GET /api/employee?filter=agencyId:{agencyId || "..."}</code>.
						</p>

						{rosterLoading && (
							<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
								Loading roster from the agency filter endpoint...
							</div>
						)}

						{rosterError && (
							<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200">
								<p className="font-semibold">Endpoint not permitted</p>
								<p className="mt-1 text-xs">
									The agency roster endpoint returned a 403 or 404. This workspace degrades gracefully — no fake employee rows are shown.
								</p>
							</div>
						)}

						{!rosterError && rosterData && (
							<div className="overflow-x-auto">
								<DataTable
									title="Agency members"
									data={rosterData.employees || []}
									columns={[
										{ key: "employeeId", label: "Code", sortable: true, width: "w-24" },
										{ key: "person.personalInfo", label: "Name", render: (v: any, row: any) => <span>{`${row.person?.personalInfo?.firstName || ""} ${row.person?.personalInfo?.lastName || ""}`.trim() || "—"}</span>, width: "w-48" },
										{ key: "department.name", label: "Department", render: (v: any) => <span className="text-xs text-slate-500">{v || "—"}</span>, width: "w-40" },
										{ key: "workforceSource", label: "Labor", render: (v: any) => <span className="text-xs font-medium">{v === "AGENCY" ? "Indirect" : "Direct"}</span>, width: "w-20" },
										{ key: "employmentStatus", label: "Status", width: "w-28" },
									]}
									itemsPerPage={10}
									searchFields={["employeeId", "person.personalInfo", "department.name"]}
									emptyMessage="No members found for this agency."
									emptyDescription="When the endpoint is available and returns data, the table will show the real roster."
								/>
							</div>
						)}
					</div>
				)}

				{tab === "Attendance" && (
					<div data-testid="agency-tab-attendance" className="space-y-4" role="tabpanel">
						<div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
							<h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Attendance overview</h3>
							<p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
								Day-level attendance view for this agency. If endpoint unavailable, the section degrades gracefully.
							</p>
							<div className="mt-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-950/60">
								<p className="text-xs text-slate-500">
									Expected contract: per-employee day-level status, clock-in/out times, late/undertime, and absence classification from attendance overview patterns.
								</p>
							</div>
						</div>
					</div>
				)}

				{tab === "Timesheets" && (
					<div data-testid="agency-tab-timesheets" className="space-y-4" role="tabpanel">
						<div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
							<h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Timesheets</h3>
							<p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
								Timesheets filtered by agency members ({`employee.agencyId:${agencyId || "..."}`}).
							</p>

							{/* Graceful endpoint state */}
							{timesheetsLoading && (
								<div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
									Loading timesheets for this agency...
								</div>
							)}

							{timesheetsError && (
								<div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200">
									<p className="font-semibold">Endpoint not permitted</p>
									<p className="mt-1 text-xs">
										The timesheet endpoint returned a 403 or 404 for the agency filter. No fabricated timesheets are shown.
									</p>
								</div>
							)}

							{!timesheetsLoading && !timesheetsError && timesheetsData && (
								<div className="overflow-x-auto">
									<DataTable
										title="Agency timesheets"
										data={timesheetsData.timesheets || []}
										columns={[
											{ key: "code", label: "Code", sortable: true, width: "w-28" },
											{ key: "employee.employeeId", label: "Employee", render: (v: any, row: any) => <span>{`${row.employee?.employeeId || "—"}`}</span>, width: "w-32" },
											{ key: "payrollPeriod.name", label: "Period", render: (v: any) => <span className="text-xs text-slate-500">{v || "—"}</span>, width: "w-40" },
											{ key: "status", label: "Status", width: "w-28" },
											{ key: "totalHoursWorked", label: "Hours", sortable: true, width: "w-16" },
										]}
										itemsPerPage={10}
										searchFields={["code", "employee.employeeId"]}
										emptyMessage="No timesheets found for this agency."
										emptyDescription="When the endpoint returns data, the table will show real timesheets."
									/>
								</div>
							)}
						</div>
					</div>
				)}

				{tab === "Biometrics" && (
					<div data-testid="agency-tab-biometrics" className="space-y-4" role="tabpanel">
						<div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
							<h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Biometrics import</h3>
							<p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
								Upload attendance/biometrics workbook via{" "}
								<code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">POST /api/agency/{agencyId || ":id"}/attendance-import</code>.
							</p>
						</div>

						{/* Import surface — graceful 403/degraded state */}
						<div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
							<BiometricsImport agencyId={agencyId} />
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
