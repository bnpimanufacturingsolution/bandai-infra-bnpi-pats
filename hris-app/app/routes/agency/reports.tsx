import React from "react";
import { Clock, Download, FileText, Upload, Users, UserX, CalendarX } from "lucide-react";
import * as XLSX from "xlsx";
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
import employeesService from "~/services/employees.service";
import attendanceService from "~/services/attendance.service";
import timesheetService from "~/services/timesheet.service";
import { useAuth } from "~/lib/hooks/use-auth";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useAttendances } from "~/lib/hooks/useAttendances";
import { useTimesheets } from "~/lib/hooks/useTimesheets";
import { SummaryCard } from "~/components/atoms/SummaryCard";
import { Skeleton } from "~/components/ui/skeleton";
import { AgencyGuard, AgencyPageShell, isActiveAgencyMember, useAgencyIdentity } from "~/components/pages/agency-workspace/agency-shared";
import { DatePickerWithRange } from "~/components/ui/date-picker-range";
import { lastNDaysRange, toISODate } from "~/routes/agency/attendance";

// Hard cap so a huge agency cannot lock the tab; stated honestly in the status line.
const PAGE_LIMIT = 200;
const MAX_PAGES = 10;
// Date filter is capped so the daily chart cannot grow unbounded.
const MAX_RANGE_DAYS = 62;

const PIE_COLORS = ["#16a34a", "#f59e0b", "#3b82f6", "#94a3b8", "#ef4444"];

interface DayBucket {
	day: string;
	fullDay: string;
	present: number;
	other: number;
}

function fullNameOf(personalInfo: any): string {
	return `${personalInfo?.firstName || ""} ${personalInfo?.lastName || ""}`.trim() || "—";
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
	return days.map((day) => ({
		day: day.slice(5),
		fullDay: day,
		present: map.get(day)!.present,
		other: map.get(day)!.other,
	}));
}

async function fetchAllPages(
	fetchPage: (page: number) => Promise<{ rows: any[] }>,
): Promise<{ rows: any[]; truncated: boolean }> {
	const rows: any[] = [];
	for (let page = 1; page <= MAX_PAGES; page += 1) {
		const { rows: batch } = await fetchPage(page);
		rows.push(...batch);
		if (batch.length < PAGE_LIMIT) return { rows, truncated: false };
	}
	return { rows, truncated: true };
}

function downloadWorkbook(fileName: string, sheets: { name: string; headers: string[]; rows: Record<string, unknown>[] }[]) {
	const workbook = XLSX.utils.book_new();
	for (const sheet of sheets) {
		const worksheet = XLSX.utils.json_to_sheet(sheet.rows, { header: [...sheet.headers] });
		XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
	}
	const workbookBytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
	const blob = new Blob([workbookBytes], {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `${fileName}.xlsx`;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

export default function AgencyReportsPage() {
	return (
		<AgencyGuard>
			<AgencyReportsContent />
		</AgencyGuard>
	);
}

function AgencyReportsContent() {
	const { user } = useAuth();
	const { agencyId, agencyCode, hasRealAgencyId } = useAgencyIdentity();
	const defaultRange = React.useMemo(() => lastNDaysRange(14), []);
	const enabled = !!user && !!hasRealAgencyId;
	const [dateFrom, setDateFrom] = React.useState(defaultRange.from);
	const [dateTo, setDateTo] = React.useState(defaultRange.to);

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
	const inactiveMembers: any[] = React.useMemo(
		() => allMembers.filter((m: any) => !isActiveAgencyMember(m)),
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

	const dayKeys = React.useMemo(() => {
		const out: string[] = [];
		const cursor = new Date(`${dateFrom}T00:00:00`);
		const end = new Date(`${dateTo}T00:00:00`);
		if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor > end) return out;
		while (cursor <= end && out.length < MAX_RANGE_DAYS) {
			out.push(cursor.toISOString().slice(0, 10));
			cursor.setDate(cursor.getDate() + 1);
		}
		return out;
	}, [dateFrom, dateTo]);
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
	const deptData = React.useMemo(() => {
		const map = new Map<string, number>();
		for (const m of members) {
			const name = m.department?.name || m.departmentName || "Unassigned";
			map.set(name, (map.get(name) || 0) + 1);
		}
		return [...map.entries()].map(([department, count]) => ({ department, count }));
	}, [members]);

	const pendingCount = statusData
		.filter((s) => !["APPROVED", "PAID"].includes(s.status))
		.reduce((n, s) => n + s.count, 0);
	const totalPunches = trendData.reduce((n, d) => n + d.present + d.other, 0);
	const totalPresent = trendData.reduce((n, d) => n + d.present, 0);

	// Agency-pack detail rows: time entries + absentee scoped to the date filter.
	const daySet = React.useMemo(() => new Set(dayKeys), [dayKeys]);
	const inRangeRows: any[] = React.useMemo(
		() =>
			attendanceRows
				.filter((r: any) => daySet.has(String(r.date || "").slice(0, 10)))
				.sort((a: any, b: any) => String(b.date || "").localeCompare(String(a.date || ""))),
		[attendanceRows, daySet],
	);
	const absentRows: any[] = React.useMemo(
		() => inRangeRows.filter((r: any) => String(r.status || "").toUpperCase() === "ABSENT"),
		[inRangeRows],
	);
	// Charts replace the pack detail tables: absenteeism per day + roster mix.
	const absenteeByDay = React.useMemo(() => {
		const map = new Map<string, number>();
		for (const d of dayKeys) map.set(d, 0);
		for (const r of absentRows) {
			const day = String(r.date || "").slice(0, 10);
			if (map.has(day)) map.set(day, (map.get(day) || 0) + 1);
		}
		return dayKeys.map((day) => ({ day: day.slice(5), fullDay: day, absent: map.get(day) || 0 }));
	}, [absentRows, dayKeys]);
	const employmentMix = React.useMemo(() => {
		const map = new Map<string, number>();
		for (const m of allMembers) {
			const s = String(m.employmentStatus || "UNKNOWN");
			map.set(s, (map.get(s) || 0) + 1);
		}
		return [...map.entries()].map(([status, count]) => ({ status, count }));
	}, [allMembers]);
	const [status, setStatus] = React.useState<"idle" | "working" | "done" | "error">("idle");
	const [message, setMessage] = React.useState("");

	const handleGenerate = React.useCallback(async () => {
		if (!hasRealAgencyId) {
			setStatus("error");
			setMessage("Agency identity is not configured for this login.");
			return;
		}
		setStatus("working");
		setMessage(`Building report from live agency rows (${dateFrom} to ${dateTo})...`);
		try {
			const base = `agency-${agencyCode || agencyId}-report-${dateFrom}-to-${dateTo}`;
			const [roster, allRoster, attendance, sheets] = await Promise.all([
				fetchAllPages(async (page) => {
					const res: any = await employeesService
						.clearQueryParams()
						.paginate(page, PAGE_LIMIT)
						.setParams({
							filter: `agencyId:${agencyId},employmentStatus:ACTIVE,employmentStatus:ONBOARDING,employmentStatus:ON_LEAVE`,
							document: true,
						})
						.getEmployees(true);
					return { rows: res?.employees || [] };
				}),
				fetchAllPages(async (page) => {
					const res: any = await employeesService
						.clearQueryParams()
						.paginate(page, PAGE_LIMIT)
						.setParams({ filter: `agencyId:${agencyId}`, document: true })
						.getEmployees(true);
					return { rows: res?.employees || [] };
				}),
				fetchAllPages(async (page) => {
					const res: any = await attendanceService
						.clearQueryParams()
						.paginate(page, PAGE_LIMIT)
						.setParams({ filter: `employee.agencyId:${agencyId}`, document: true })
						.getAttendances();
					return { rows: res?.attendances || [] };
				}),
				fetchAllPages(async (page) => {
					const res: any = await timesheetService
						.clearQueryParams()
						.paginate(page, PAGE_LIMIT)
						.setParams({ filter: `employee.agencyId:${agencyId}`, document: true })
						.getTimesheets();
					return { rows: res?.timesheets || [] };
				}),
			]);
			const inRange = attendance.rows.filter((r: any) => {
				const day = String(r.date || "").slice(0, 10);
				return day >= dateFrom && day <= dateTo;
			});
			const absentExport = inRange.filter((r: any) => String(r.status || "").toUpperCase() === "ABSENT");
			const inactiveExport = allRoster.rows.filter((e: any) => !isActiveAgencyMember(e));
			const daily = bucketAttendanceByDay(inRange, dayKeys);
			const statusCounts = new Map<string, number>();
			for (const t of sheets.rows) {
				const s = String((t as any).status || "UNKNOWN");
				statusCounts.set(s, (statusCounts.get(s) || 0) + 1);
			}
			const deptCounts = new Map<string, number>();
			for (const e of roster.rows) {
				const name = (e as any).department?.name || "Unassigned";
				deptCounts.set(name, (deptCounts.get(name) || 0) + 1);
			}
			const capped = [roster.truncated, allRoster.truncated, attendance.truncated, sheets.truncated].some(Boolean)
				? `, sources capped at first ${PAGE_LIMIT * MAX_PAGES} rows each`
				: "";
			downloadWorkbook(base, [
				{
					name: "Manpower Databank",
					headers: ["Code", "Name", "Department", "Section", "Status", "Labor"],
					rows: roster.rows.map((e: any) => ({
						Code: e.employeeId || "",
						Name: fullNameOf(e.person?.personalInfo),
						Department: e.department?.name || "",
						Section: e.section?.name || "",
						Status: e.employmentStatus || "",
						Labor: e.workforceSource === "AGENCY" ? "Indirect" : "Direct",
					})),
				},
				{
					name: "Time Entries",
					headers: ["Date", "Code", "Name", "Department", "Time in", "Time out", "Status"],
					rows: inRange.map((r: any) => ({
						Date: String(r.date || "").slice(0, 10),
						Code: r.employee?.employeeId || "",
						Name: fullNameOf(r.employee?.person?.personalInfo),
						Department: r.employee?.department?.name || "",
						"Time in": r.timeIn ? String(r.timeIn).slice(11, 16) : "",
						"Time out": r.timeOut ? String(r.timeOut).slice(11, 16) : "",
						Status: r.status || "",
					})),
				},
				{
					name: "Daily Absentee Report",
					headers: [
						"Agency",
						"Date Hired",
						"Employee No.",
						"Section",
						"Employee Name",
						"Date of Absence",
						"Reason of Absence",
						"Means of Information",
						"Advance Notice Provided (Yes/No)",
						"Remarks",
						"Leave Form Submitted (Yes/No)",
						"Subject to Disciplinary Action (Yes/No)",
						"Disciplinary Action Status",
					],
					rows: absentExport.map((r: any) => ({
						Agency: agencyCode || "",
						"Date Hired": "",
						"Employee No.": r.employee?.employeeId || "",
						Section: r.employee?.section?.name || "",
						"Employee Name": fullNameOf(r.employee?.person?.personalInfo),
						"Date of Absence": String(r.date || "").slice(0, 10),
						"Reason of Absence": "",
						"Means of Information": "",
						"Advance Notice Provided (Yes/No)": "",
						Remarks: "",
						"Leave Form Submitted (Yes/No)": "",
						"Subject to Disciplinary Action (Yes/No)": "",
						"Disciplinary Action Status": "",
					})),
				},
				{
					name: "Attendance Summary",
					headers: ["Day", "Present", "Other", "Total", "Present %"],
					rows: daily.map((d) => {
						const total = d.present + d.other;
						return {
							Day: d.fullDay,
							Present: d.present,
							Other: d.other,
							Total: total,
							"Present %": total === 0 ? "—" : `${Math.round((d.present / total) * 100)}%`,
						};
					}),
				},
				{
					name: "Daily Inactive Agency Operators",
					headers: ["ID Number", "Agency", "Section", "Name", "Reason", "End of Contract", "Date Hired"],
					rows: inactiveExport.map((e: any) => ({
						"ID Number": "",
						Agency: agencyCode || "",
						Section: e.section?.name || "",
						Name: fullNameOf(e.person?.personalInfo),
						Reason: e.employmentStatus || "",
						"End of Contract": "",
						"Date Hired": "",
					})),
				},
				{
					name: "Disciplinary Action Databank",
					headers: [
						"Company / Agency",
						"Employee Number",
						"Date Hired",
						"Employee Name",
						"Section",
						"No. of Offense",
						"Type of Offense",
						"Disciplinary Action",
						"Date of Suspension",
						"Violation",
						"Date of DA",
						"Date Served",
						"Status",
					],
					rows: [],
				},
			]);
			setStatus("done");
			setMessage(`Report downloaded (${inRange.length} punches, ${dateFrom} to ${dateTo}${capped}).`);
		} catch (err: any) {
			setStatus("error");
			setMessage(err?.message || "Report generation failed. No file was produced.");
		}
	}, [agencyCode, agencyId, dateFrom, dateTo, dayKeys, hasRealAgencyId]);

	return (
		<AgencyPageShell>
			<div data-testid="agency-page-reports" className="space-y-4">
				<div className="flex flex-wrap items-center justify-end gap-3">
					<div className="w-full sm:w-[300px]" data-testid="agency-report-date-filter">
						<DatePickerWithRange
							value={{ from: new Date(`${dateFrom}T00:00:00`), to: new Date(`${dateTo}T00:00:00`) }}
							onChange={(range) => {
								if (range?.from) setDateFrom(toISODate(range.from));
								if (range?.to) setDateTo(toISODate(range.to));
							}}
							placeholder="Select date range"
						/>
					</div>
					<div className="flex flex-col items-end gap-1">
						<button
							type="button"
							onClick={handleGenerate}
							disabled={status === "working"}
							className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
						>
							<Download className="h-3.5 w-3.5" />
							{status === "working" ? "Exporting..." : "Export Excel"}
						</button>
						{message && (
							<p
								className={`text-xs ${status === "error" ? "text-red-600" : "text-slate-500"}`}
								data-testid="agency-report-status"
							>
								{message}
							</p>
						)}
					</div>
				</div>
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
						title="Punches"
						value={String(attendanceRows.length)}
						description={`Present ${totalPresent} of ${totalPunches} punches`}
						icon={Clock}
						color="green"
						loading={attendanceLoading}
					/>
					<SummaryCard
						title="Absent"
						value={String(absentRows.length)}
						description={`${dateFrom} to ${dateTo}`}
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
							Daily attendance
						</h3>
						<p className="mt-1 text-xs text-slate-500">Present vs all other day classes, {dateFrom} to {dateTo}.</p>
						<div className="mt-3 h-64" data-testid="agency-report-attendance-trend">
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
							Timesheet status
						</h3>
						<p className="mt-1 text-xs text-slate-500">Share of timesheets by workflow status.</p>
						<div className="mt-3 h-64" data-testid="agency-report-timesheet-mix">
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
					<div className="mt-3 h-64" data-testid="agency-report-departments">
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

				<div className="grid gap-4 lg:grid-cols-2">
					<div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
						<h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
							Absentees by day
						</h3>
						<p className="mt-1 text-xs text-slate-500">
							{absentRows.length} absent days, {dateFrom} to {dateTo}.
						</p>
						<div className="mt-3 h-64" data-testid="agency-report-absentee-trend">
							{attendanceLoading ? (
								<Skeleton className="h-full w-full" />
							) : (
								<ResponsiveContainer width="100%" height="100%">
									<BarChart data={absenteeByDay}>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis dataKey="day" tick={{ fontSize: 10 }} interval={2} />
										<YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
										<Tooltip />
										<Bar dataKey="absent" fill="#ef4444" name="Absent" />
									</BarChart>
								</ResponsiveContainer>
							)}
						</div>
					</div>

					<div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
						<h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
							Members by employment status
						</h3>
						<p className="mt-1 text-xs text-slate-500">
							{allMembers.length} roster members across all statuses.
						</p>
						<div className="mt-3 h-64" data-testid="agency-report-employment-mix">
							{allRosterLoading ? (
								<Skeleton className="h-full w-full" />
							) : (
								<ResponsiveContainer width="100%" height="100%">
									<BarChart data={employmentMix} layout="vertical">
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
										<YAxis type="category" dataKey="status" width={120} tick={{ fontSize: 10 }} />
										<Tooltip />
										<Bar dataKey="count" fill="#8b5cf6" name="Members" />
									</BarChart>
								</ResponsiveContainer>
							)}
						</div>
					</div>
				</div>
			</div>
		</AgencyPageShell>
	);
}
