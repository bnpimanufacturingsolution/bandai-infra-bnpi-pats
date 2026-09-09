import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	ChevronDown,
	ChevronRight,
	Clock3,
	RefreshCw,
} from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Skeleton } from "~/components/ui/skeleton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import sectionsService from "~/services/sections.service";
import type { LedMemberTimesheet } from "~/services/sections.service";
import { useAuth } from "~/lib/hooks/use-auth";

/**
 * Line-leader "Team Timesheets" screen (read-only).
 * Shows one row per member of the sections the leader runs, with their
 * timesheet for the selected payroll period. Members without a timesheet are
 * shown honestly as "No timesheet yet" — no fabricated zeros.
 * Data source: GET /api/section/led-timesheets (leader-scoped, read-only).
 */

const STATUS_STYLES: Record<string, string> = {
	APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
	SUBMITTED: "bg-blue-50 text-blue-700 ring-blue-600/20",
	DRAFT: "bg-gray-100 text-gray-600 ring-gray-500/20",
	REJECTED: "bg-red-50 text-red-700 ring-red-600/20",
	REVISED: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

const STATUS_LABELS: Record<string, string> = {
	APPROVED: "Approved",
	SUBMITTED: "Submitted",
	DRAFT: "Draft",
	REJECTED: "Rejected",
	REVISED: "Revise requested",
};

const formatPeriodRange = (period: {
	startDate: string;
	endDate: string;
} | null): string => {
	if (!period) return "";
	try {
		return `${new Date(period.startDate).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			timeZone: "Asia/Manila",
		})} – ${new Date(period.endDate).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			timeZone: "Asia/Manila",
		})}`;
	} catch {
		return `${period.startDate} – ${period.endDate}`;
	}
};

const formatHours = (value?: string | null): string => {
	if (!value) return "—";
	const trimmed = value.trim();
	if (!trimmed || trimmed === "0:00") return "—";
	return trimmed;
};

type RowGroup = {
	key: string;
	memberName: string;
	memberMeta: string;
	timesheet: LedMemberTimesheet | null;
};

function TimesheetRow({ row }: { row: RowGroup }) {
	const [open, setOpen] = useState(false);
	const ts = row.timesheet;
	const statusKey = ts?.status ?? "NONE";
	const badgeClass = STATUS_STYLES[statusKey] ?? "bg-gray-100 text-gray-500 ring-gray-500/20";
	const statusLabel = ts ? (STATUS_LABELS[ts.status] ?? ts.status) : "No timesheet yet";

	return (
		<div className="border-b border-gray-100 last:border-b-0">
			<button
				type="button"
				onClick={() => ts && setOpen((prev) => !prev)}
				className={`grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-2.5 text-left ${
					ts ? "hover:bg-gray-50" : "cursor-default"
				}`}
				aria-expanded={ts ? open : undefined}>
				<div className="min-w-0">
					<div className="truncate text-sm font-medium text-gray-900">
						{row.memberName}
					</div>
					<div className="truncate text-xs text-gray-500">{row.memberMeta}</div>
				</div>
				<span
					className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeClass}`}>
					{statusLabel}
				</span>
				<span className="text-xs text-gray-500">
					{ts ? `${ts.totalDays ?? 0} day${(ts.totalDays ?? 0) === 1 ? "" : "s"}` : "—"}
				</span>
				{ts ? (
					open ? (
						<ChevronDown className="h-4 w-4 text-gray-400" />
					) : (
						<ChevronRight className="h-4 w-4 text-gray-400" />
					)
				) : (
					<span className="w-4" />
				)}
			</button>
			{ts && open ? (
				<div className="grid grid-cols-2 gap-3 border-t border-gray-50 bg-gray-50/50 px-6 py-3 sm:grid-cols-3 lg:grid-cols-6">
					{[
						{ label: "Hours worked", value: formatHours(ts.totalHoursWorked) },
						{ label: "Regular", value: formatHours(ts.totalRegularHours) },
						{ label: "Overtime", value: formatHours(ts.totalOvertimeHours) },
						{ label: "Late", value: formatHours(ts.totalLateHours) },
						{ label: "Undertime", value: formatHours(ts.totalUndertimeHours) },
						{ label: "Early out", value: formatHours(ts.totalEarlyOutHours) },
					].map((cell) => (
						<div key={cell.label}>
							<div className="text-xs text-gray-500">{cell.label}</div>
							<div className="text-sm font-medium text-gray-900">{cell.value}</div>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

export default function TeamTimesheetsTab() {
	const { user } = useAuth();
	const employeeId = user?.metadata?.employee?.id || "";
	const [periodChoice, setPeriodChoice] = useState<"current" | "latest">("current");

	const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
		queryKey: ["section-led-timesheets", employeeId, periodChoice],
		queryFn: () =>
			sectionsService.getLedTimesheets(
				periodChoice === "current" ? { period: "current" } : undefined,
			),
		enabled: Boolean(employeeId),
		staleTime: 60_000,
	});

	const rows = useMemo<RowGroup[]>(() => {
		return (data?.members || []).map((entry) => {
			const info = entry.member.person?.personalInfo || {};
			const name = [info.firstName, info.lastName].filter(Boolean).join(" ").trim();
			const memberName = name || entry.member.employeeId;
			const memberMeta = [
				entry.member.employeeId,
				entry.member.position?.title,
			]
				.filter(Boolean)
				.join(" · ");
			return {
				key: entry.member.id,
				memberName,
				memberMeta,
				timesheet: entry.timesheet,
			};
		});
	}, [data]);

	const withTimesheetCount = rows.filter((row) => row.timesheet).length;

	if (!employeeId) {
		return (
			<div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
				Employee context is missing. Please refresh and try again.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="space-y-3">
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
			</div>
		);
	}

	if (isError) {
		return (
			<div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
				Failed to load team timesheets
				{error instanceof Error ? `: ${error.message}` : ""}.
				<div className="mt-3">
					<Button type="button" variant="outline" onClick={() => refetch()}>
						<RefreshCw className="mr-2 h-4 w-4" /> Retry
					</Button>
				</div>
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
				You are not currently assigned as a line leader of any section, or your sections
				have no active members. Ask HR/Admin to assign you under
				<span className="font-medium"> Admin &gt; Configuration &gt; Sections &gt; Line Leaders</span>.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p className="text-sm text-gray-500">
						{data?.sections && data.sections.length > 0 ? (
							<>
								Your sections:{" "}
								<span className="font-medium text-gray-700">
									{data.sections.map((section) => section.name).join(", ")}
								</span>
							</>
						) : null}
					</p>
					{data?.period ? (
						<p className="text-sm text-gray-500">
							Period:{" "}
							<span className="font-medium text-gray-700">
								{data.period.name}
								{data.period.code ? ` (${data.period.code})` : ""}
							</span>{" "}
							· {formatPeriodRange(data.period)} ·{" "}
							<span className="font-medium text-gray-700">{data.period.status}</span>
						</p>
					) : (
						<p className="text-sm text-gray-500">No payroll period available yet.</p>
					)}
				</div>
				<div className="flex items-center gap-2">
					<Select
						value={periodChoice}
						onValueChange={(value) => setPeriodChoice(value as "current" | "latest")}>
						<SelectTrigger className="w-[220px]" aria-label="Payroll period">
							<SelectValue placeholder="Select period" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="current">Current period</SelectItem>
							<SelectItem value="latest">Latest with timesheets</SelectItem>
						</SelectContent>
					</Select>
					<Button
						type="button"
						variant="outline"
						onClick={() => refetch()}
						disabled={isRefetching}
						aria-label="Refresh team timesheets">
						<RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
					</Button>
				</div>
			</div>

			<div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
				<div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-600">
					<span>Member</span>
					<span className="text-center">Status</span>
					<span className="text-center">Days</span>
					<span className="w-4" />
				</div>
				<div className="max-h-[520px] overflow-y-auto">
					{rows.map((row) => (
						<TimesheetRow key={row.key} row={row} />
					))}
				</div>
			</div>

			<p className="flex items-center gap-1.5 text-xs text-gray-500">
				<Clock3 className="h-3.5 w-3.5" />
				{withTimesheetCount} of {rows.length} member
				{rows.length === 1 ? "" : "s"} have a timesheet for this period.
			</p>
		</div>
	);
}
