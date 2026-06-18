import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Wrench } from "lucide-react";

import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { Switch } from "~/components/ui/switch";
import { useAuth } from "~/lib/hooks/use-auth";
import { useCurrentPeriodRepair } from "~/lib/hooks/useTimesheets";
import type {
	CurrentPeriodRepairOptions,
	CurrentPeriodRepairReport,
} from "~/services/timesheet.service";

const ADMIN_REPAIR_ROLES = new Set(["hris-admin", "admin", "super_admin"]);

const DEFAULT_OPTIONS: CurrentPeriodRepairOptions = {
	repairAttendanceObligations: true,
	repairDraftTimesheets: true,
	includeEmployeesMissingSchedules: false,
	showSampleRows: true,
};

function StatRow(props: { label: string; value: string | number; tone?: "default" | "warn" }) {
	return (
		<div className="flex items-center justify-between gap-4 border-b border-gray-100 py-2 text-sm last:border-b-0">
			<span className="text-gray-600">{props.label}</span>
			<span
				className={
					props.tone === "warn"
						? "font-semibold text-amber-700"
						: "font-semibold text-gray-900"
				}>
				{props.value}
			</span>
		</div>
	);
}

function ToggleRow(props: {
	label: string;
	checked: boolean;
	disabled?: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex min-h-11 items-center justify-between gap-4 border-b border-gray-100 py-3 last:border-b-0">
			<label className="text-sm font-medium text-gray-900">{props.label}</label>
			<Switch checked={props.checked} disabled={props.disabled} onCheckedChange={props.onChange} />
		</div>
	);
}

function SampleRows(props: {
	title: string;
	rows: Array<Record<string, unknown>>;
}) {
	if (!props.rows.length) return null;

	return (
		<div className="rounded-lg border border-gray-100">
			<div className="border-b border-gray-100 px-3 py-2 text-sm font-semibold text-gray-900">
				{props.title}
			</div>
			<div className="divide-y divide-gray-100">
				{props.rows.slice(0, 8).map((row, index) => {
					const employee = (row.employee || row) as Record<string, unknown>;
					return (
						<div key={`${props.title}-${index}`} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[160px_1fr_120px]">
							<span className="font-medium text-gray-900">
								{String(employee.employeeId || row.employeeId || row.id || "Employee")}
							</span>
							<span className="min-w-0 truncate text-gray-600">
								{String(employee.name || row.businessDate || "No name")}
							</span>
							<span className="text-gray-500">
								{employee.hasSchedule === false ? "No schedule" : String(row.businessDate || "")}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function RepairReportView(props: { report: CurrentPeriodRepairReport }) {
	const { report } = props;
	const periodLabel = report.payrollPeriod.code || report.payrollPeriod.name;

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-2">
				<Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">
					{report.dryRun ? "Dry run" : "Applied"}
				</Badge>
				<Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
					{periodLabel}
				</Badge>
				<span className="text-sm text-gray-500">
					{report.payrollPeriod.startDate} to {report.payrollPeriod.endDate}
				</span>
			</div>

			<div className="grid gap-4 lg:grid-cols-3">
				<div className="rounded-lg border border-gray-100 bg-white p-4">
					<h2 className="text-sm font-semibold text-gray-900">Employees</h2>
					<div className="mt-3">
						<StatRow label="Checked" value={report.employees.checked} />
						<StatRow label="With schedules" value={report.employees.withSchedules} />
						<StatRow
							label="Missing schedules"
							value={report.employees.missingSchedules}
							tone={report.employees.missingSchedules ? "warn" : "default"}
						/>
					</div>
				</div>

				<div className="rounded-lg border border-gray-100 bg-white p-4">
					<h2 className="text-sm font-semibold text-gray-900">Attendance Obligations</h2>
					<div className="mt-3">
						<StatRow label="Existing before" value={report.attendanceObligations.existingBefore} />
						<StatRow
							label="Missing"
							value={report.attendanceObligations.missing}
							tone={report.attendanceObligations.missing ? "warn" : "default"}
						/>
						<StatRow
							label={report.dryRun ? "Would repair" : "Repaired/touched"}
							value={
								report.dryRun
									? report.attendanceObligations.wouldRepair
									: report.attendanceObligations.repaired
							}
						/>
					</div>
				</div>

				<div className="rounded-lg border border-gray-100 bg-white p-4">
					<h2 className="text-sm font-semibold text-gray-900">Draft Timesheets</h2>
					<div className="mt-3">
						<StatRow label="Existing drafts" value={report.timesheets.existingDrafts} />
						<StatRow
							label="Missing drafts"
							value={report.timesheets.missingDrafts}
							tone={report.timesheets.missingDrafts ? "warn" : "default"}
						/>
						<StatRow
							label={report.dryRun ? "Would create" : "Created"}
							value={
								report.dryRun ? report.timesheets.wouldCreateDrafts : report.timesheets.createdDrafts
							}
						/>
					</div>
				</div>
			</div>

			<div className="rounded-lg border border-gray-100 bg-white p-4">
				<h2 className="text-sm font-semibold text-gray-900">Skipped</h2>
				<div className="mt-3 grid gap-x-6 lg:grid-cols-3">
					<StatRow label="Missing schedules" value={report.skipped.employeesMissingSchedules} />
					<StatRow label="Non-draft or locked" value={report.skipped.nonDraftOrLockedTimesheets} />
					<StatRow label="Paid payroll rows" value={report.skipped.paidPayrollRows} />
				</div>
				{report.skipped.reasons.length > 0 && (
					<div className="mt-3 flex flex-wrap gap-2">
						{report.skipped.reasons.map((reason) => (
							<Badge key={reason} className="bg-gray-100 text-gray-700 hover:bg-gray-100">
								{reason}
							</Badge>
						))}
					</div>
				)}
			</div>

			<SampleRows
				title="Missing Draft Samples"
				rows={report.timesheets.sampleMissingDraftEmployees}
			/>
			<SampleRows
				title="Missing Obligation Samples"
				rows={report.attendanceObligations.sampleMissingRows}
			/>
			<SampleRows
				title="Missing Schedule Samples"
				rows={report.employees.sampleMissingSchedules}
			/>
		</div>
	);
}

export default function AdminSettingsPage() {
	const [searchParams] = useSearchParams();
	const { user } = useAuth();
	const debugMode = searchParams.get("debug") === "true";
	const canRunRepair = ADMIN_REPAIR_ROLES.has(String(user?.role || ""));
	const repairMutation = useCurrentPeriodRepair();
	const [options, setOptions] = useState<CurrentPeriodRepairOptions>(DEFAULT_OPTIONS);
	const [lastDryRun, setLastDryRun] = useState<CurrentPeriodRepairReport | null>(null);
	const [report, setReport] = useState<CurrentPeriodRepairReport | null>(null);

	const hasActionableDryRun = useMemo(() => {
		if (!lastDryRun) return false;
		return (
			(options.repairAttendanceObligations &&
				lastDryRun.attendanceObligations.wouldRepair > 0) ||
			(options.repairDraftTimesheets && lastDryRun.timesheets.wouldCreateDrafts > 0)
		);
	}, [lastDryRun, options]);

	const updateOption = (key: keyof CurrentPeriodRepairOptions, checked: boolean) => {
		setOptions((current) => ({ ...current, [key]: checked }));
		setLastDryRun(null);
	};

	const runRepair = async (dryRun: boolean) => {
		const nextReport = await repairMutation.mutateAsync({ dryRun, options });
		setReport(nextReport);
		if (dryRun) {
			setLastDryRun(nextReport);
		} else {
			setLastDryRun(null);
		}
	};

	if (!debugMode) {
		return (
			<div className="mx-auto max-w-3xl space-y-4">
				<div>
					<h1 className="text-2xl font-semibold text-gray-900">Admin Settings</h1>
				</div>
				<div className="rounded-lg border border-gray-100 bg-white p-5">
					<div className="flex items-start gap-3">
						<CheckCircle2 className="mt-0.5 h-5 w-5 text-gray-500" />
						<div className="space-y-3">
							<p className="text-sm text-gray-700">
								System settings are managed from Configuration and Rules & Policies.
							</p>
							<div className="flex flex-wrap gap-2">
								<Button asChild variant="outline">
									<Link to="/admin/configuration/company-profile">Company profile</Link>
								</Button>
								<Button asChild variant="outline">
									<Link to="/admin/rules-policies/timesheet">Timesheet rules</Link>
								</Button>
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (!canRunRepair) {
		return (
			<div className="mx-auto max-w-3xl space-y-4">
				<h1 className="text-2xl font-semibold text-gray-900">Admin Settings</h1>
				<div className="rounded-lg border border-amber-200 bg-white p-5">
					<div className="flex items-start gap-3">
						<AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
						<p className="text-sm text-gray-700">
							This repair surface is restricted to system administrators.
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-6xl space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold text-gray-900">Admin Repair</h1>
				</div>
				<Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">Debug mode</Badge>
			</div>

			<div className="grid gap-5 lg:grid-cols-[360px_1fr]">
				<div className="rounded-lg border border-gray-100 bg-white p-5">
					<div className="flex items-center gap-2">
						<Wrench className="h-4 w-4 text-gray-600" />
						<h2 className="text-sm font-semibold text-gray-900">Current Period Repair</h2>
					</div>

					<div className="mt-4">
						<ToggleRow
							label="Repair attendance obligations"
							checked={options.repairAttendanceObligations}
							disabled={repairMutation.isPending}
							onChange={(checked) => updateOption("repairAttendanceObligations", checked)}
						/>
						<ToggleRow
							label="Repair missing draft timesheets"
							checked={options.repairDraftTimesheets}
							disabled={repairMutation.isPending}
							onChange={(checked) => updateOption("repairDraftTimesheets", checked)}
						/>
						<ToggleRow
							label="Include employees missing schedules"
							checked={options.includeEmployeesMissingSchedules}
							disabled={repairMutation.isPending}
							onChange={(checked) => updateOption("includeEmployeesMissingSchedules", checked)}
						/>
						<ToggleRow
							label="Show sample rows"
							checked={options.showSampleRows}
							disabled={repairMutation.isPending}
							onChange={(checked) => updateOption("showSampleRows", checked)}
						/>
					</div>

					<div className="mt-5 flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={repairMutation.isPending}
							onClick={() => runRepair(true)}>
							{repairMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<RotateCcw className="h-4 w-4" />
							)}
							Dry run
						</Button>
						<Button
							type="button"
							disabled={repairMutation.isPending || !hasActionableDryRun}
							onClick={() => runRepair(false)}>
							{repairMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Wrench className="h-4 w-4" />
							)}
							Apply repair
						</Button>
					</div>
				</div>

				<div className="min-w-0">
					{report ? (
						<RepairReportView report={report} />
					) : (
						<div className="rounded-lg border border-gray-100 bg-white p-5 text-sm text-gray-600">
							Run a dry run to inspect current-period coverage before applying repair.
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
