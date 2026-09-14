import React from "react";
import { Users, Clock, FileText, Upload, UserX, CalendarX } from "lucide-react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { useAuth } from "~/lib/hooks/use-auth";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useAttendances } from "~/lib/hooks/useAttendances";
import { useTimesheets } from "~/lib/hooks/useTimesheets";
import { SummaryCard } from "~/components/atoms/SummaryCard";
import { Skeleton } from "~/components/ui/skeleton";
import {
	AgencyGuard,
	AgencyPageShell,
	isActiveAgencyMember,
	useAgencyIdentity,
} from "~/components/pages/agency-workspace/agency-shared";
import { lastNDaysRange } from "~/routes/agency/attendance";

const PIE_COLORS = ["#16a34a", "#f59e0b", "#3b82f6", "#94a3b8", "#ef4444"];

interface DayBucket {
	day: string;
	present: number;
	other: number;
}

function bucketAttendanceByDay(rows: any[], days: string[]): DayBucket[] {
	const map = new Map<string, { present: number; other: number }>();
	for (const d of days) map.set(d, { present: 0, other: 0 });
	for (const r of rows) {
		const day = String(r.date || "").slice(0, 10);
		const slot = map.get(day);
		if (!slot) continue;
		if (String(r.status || "").toUpperCase() === "PRESENT") slot.present += 1;
		else slot.other += 1;
	}
	return days.map((day) => ({ day: day.slice(5), present: map.get(day)!.present, other: map.get(day)!.other }));
}

export default function AgencyDashboardPage() {
	return (
		<AgencyGuard>
			<AgencyDashboardContent />
		</AgencyGuard>
	);
}

function AgencyDashboardContent() {
	const { user } = useAuth();
	const { agencyId, hasRealAgencyId } = useAgencyIdentity();
	const range = React.useMemo(() => lastNDaysRange(14), []);
	const enabled = !!user && !!hasRealAgencyId;

	const { data: rosterData, isLoading: rosterLoading } = useEmployees(
		hasRealAgencyId
			? {
					filter: `agencyId:${agencyId},employmentStatus:ACTIVE,employmentStatus:ONBOARDING,employmentStatus:ON_LEAVE`,
					limit: 500,
				}
			: undefined,
		{ enabled },
	);
	const { data: attendanceData, isLoading: attendanceLoading } = useAttendances(
		// useAttendances has no enabled option: without an agency identity,
		// match nothing instead of fetching the unscoped ledger.
		{ filter: hasRealAgencyId ? `employee.agencyId:${agencyId}` : "employee.agencyId:__unscoped__", limit: 500 },
	);
	const { data: timesheetsData, isLoading: timesheetsLoading } = useTimesheets(
		hasRealAgencyId
			? { filter: `employee.agencyId:${agencyId}`, limit: 200, enabled }
			: { filter: "employee.agencyId:__unscoped__", limit: 1, enabled },
	);

	const { data: allRosterData, isLoading: allRosterLoading } = useEmployees(
		hasRealAgencyId ? { filter: `agencyId:${agencyId}`, limit: 500 } : undefined,
		{ enabled },
	);

	const members: any[] = React.useMemo(
		() => (rosterData as any)?.employees || [],
		[rosterData],
	);
	const allMembers: any[] = React.useMemo(
		() => (allRosterData as any)?.employees || [],
		[allRosterData],
	);
	const inactiveMembers = React.useMemo(
		() => allMembers.filter((m) => !isActiveAgencyMember(m)),
		[allMembers],
	);
	const attendanceRows: any[] = React.useMemo(
		() => (attendanceData as any)?.attendances || [],
		[attendanceData],
	);
	const timesheets: any[] = React.useMemo(
		() => (timesheetsData as any)?.timesheets || [],
		[timesheetsData],
	);

	const deptData = React.useMemo(() => {
		const map = new Map<string, number>();
		for (const m of members) {
			const name = m.department?.name || m.departmentName || "Unassigned";
			map.set(name, (map.get(name) || 0) + 1);
		}
		return [...map.entries()].map(([department, count]) => ({ department, count }));
	}, [members]);

	const dayKeys = React.useMemo(() => {
		const out: string[] = [];
		const cursor = new Date(`${range.from}T00:00:00`);
		const end = new Date(`${range.to}T00:00:00`);
		while (cursor <= end) {
			out.push(cursor.toISOString().slice(0, 10));
			cursor.setDate(cursor.getDate() + 1);
		}
		return out;
	}, [range]);
	const trendData = React.useMemo(
		() => bucketAttendanceByDay(attendanceRows, dayKeys),
		[attendanceRows, dayKeys],
	);

	const statusData = React.useMemo(() => {
		const map = new Map<string, number>();
		for (const t of timesheets) {
			const s = String(t.status || "UNKNOWN");
			map.set(s, (map.get(s) || 0) + 1);
		}
		return [...map.entries()].map(([status, count]) => ({ status, count }));
	}, [timesheets]);

	const pendingCount = statusData
		.filter((s) => !["APPROVED", "PAID"].includes(s.status))
		.reduce((n, s) => n + s.count, 0);

	// Agency-pack summary: absentee + inactive counts over the same 14-day window.
	const absentCount = React.useMemo(() => {
		const days = new Set(dayKeys);
		return attendanceRows.filter(
			(r) => days.has(String(r.date || "").slice(0, 10)) && String(r.status || "").toUpperCase() === "ABSENT",
		).length;
	}, [attendanceRows, dayKeys]);

	return (
		<AgencyPageShell>
			<div data-testid="agency-page-dashboard" className="space-y-4">
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<SummaryCard
						title="Agency members"
						value={String(members.length)}
						description="Active roster count via agency filter"
						icon={Users}
						color="blue"
						loading={rosterLoading}
					/>
					<SummaryCard
						title="Punches (14d)"
						value={String(attendanceRows.length)}
						description="Attendance rows in range"
						icon={Clock}
						color="green"
						loading={attendanceLoading}
					/>
					<SummaryCard
						title="Absent (14d)"
						value={String(absentCount)}
						description="Absent punches in range"
						icon={CalendarX}
						color="red"
						loading={attendanceLoading}
					/>
					<SummaryCard
						title="Inactive operators"
						value={String(inactiveMembers.length)}
						description="Members past active status"
						icon={UserX}
						color="gray"
						loading={allRosterLoading}
					/>
					<SummaryCard
						title="Pending approvals"
						value={String(pendingCount)}
						description="Timesheets not approved/paid"
						icon={FileText}
						color="orange"
						loading={timesheetsLoading}
					/>
					<SummaryCard
						title="Timesheets"
						value={String(timesheets.length)}
						description="Timesheets in agency scope"
						icon={Upload}
						color="purple"
						loading={timesheetsLoading}
					/>
				</div>

				<div className="grid gap-4 lg:grid-cols-2">
					<div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
						<h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
							Daily attendance (14 days)
						</h3>
						<p className="mt-1 text-xs text-slate-500">Present vs all other day classes per calendar day.</p>
						<div className="mt-3 h-64" data-testid="agency-chart-attendance-trend">
							{attendanceLoading ? (
								<Skeleton className="h-full w-full" />
							) : (
								<ResponsiveContainer width="100%" height="100%">
									<BarChart data={trendData}>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis dataKey="day" tick={{ fontSize: 10 }} interval={2} />
										<YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
										<Tooltip />
										<Bar dataKey="present" stackId="a" fill="#16a34a" name="Present" />
										<Bar dataKey="other" stackId="a" fill="#f59e0b" name="Other" />
									</BarChart>
								</ResponsiveContainer>
							)}
						</div>
					</div>

					<div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
						<h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
							Timesheet status mix
						</h3>
						<p className="mt-1 text-xs text-slate-500">Share of timesheets by workflow status.</p>
						<div className="mt-3 h-64" data-testid="agency-chart-timesheet-mix">
							{timesheetsLoading ? (
								<Skeleton className="h-full w-full" />
							) : (
								<ResponsiveContainer width="100%" height="100%">
									<PieChart>
										<Pie data={statusData} dataKey="count" nameKey="status" outerRadius={90} label>
											{statusData.map((entry, i) => (
												<Cell key={entry.status} fill={PIE_COLORS[i % PIE_COLORS.length]} />
											))}
										</Pie>
										<Tooltip />
									</PieChart>
								</ResponsiveContainer>
							)}
						</div>
					</div>
				</div>

				<div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
					<h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
						Members by department
					</h3>
					<p className="mt-1 text-xs text-slate-500">Headcount per department from the live roster.</p>
					<div className="mt-3 h-64" data-testid="agency-chart-departments">
						{rosterLoading ? (
							<Skeleton className="h-full w-full" />
						) : (
							<ResponsiveContainer width="100%" height="100%">
								<BarChart data={deptData} layout="vertical">
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
									<YAxis type="category" dataKey="department" width={120} tick={{ fontSize: 10 }} />
									<Tooltip />
									<Bar dataKey="count" fill="#3b82f6" name="Members" />
								</BarChart>
							</ResponsiveContainer>
						)}
					</div>
				</div>
			</div>
		</AgencyPageShell>
	);
}
