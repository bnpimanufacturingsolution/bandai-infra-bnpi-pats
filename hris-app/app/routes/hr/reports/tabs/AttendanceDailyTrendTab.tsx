import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { BarChart3, LineChart as LineChartIcon } from "lucide-react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ChartCard } from "~/components/atoms/ChartCard";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useAttendanceDailyTrendByDepartment } from "~/lib/hooks/useMetrics";
import { ReportScopeDateFilters } from "../components/ReportScopeDateFilters";
import { useReportScopeFilters } from "../useReportScopeFilters";

type TrendChartMode = "line" | "stacked";

type TrendSeriesRow = {
	businessDate: string;
	label: string;
	total: number;
} & Record<string, string | number>;

const TREND_COLORS = [
	"#E60000",
	"#F97316",
	"#EAB308",
	"#10B981",
	"#0EA5E9",
	"#6366F1",
	"#A855F7",
	"#DB2777",
];

function formatCount(value: number) {
	return new Intl.NumberFormat("en-PH", {
		maximumFractionDigits: 0,
	}).format(value);
}

function parseBusinessDate(value: string | Date | undefined | null) {
	if (!value) return null;

	if (value instanceof Date) {
		return new Date(
			value.getUTCFullYear(),
			value.getUTCMonth(),
			value.getUTCDate(),
		);
	}

	const datePart = String(value).split("T")[0];
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
	if (!match) return null;

	const [, year, month, day] = match;
	return new Date(Number(year), Number(month) - 1, Number(day));
}

function formatDayLabel(value: string | Date | undefined | null) {
	const parsed = parseBusinessDate(value);
	if (!parsed) return "-";
	return format(parsed, "MMM d, yyyy");
}

function formatAxisLabel(value: string | Date | undefined | null) {
	const parsed = parseBusinessDate(value);
	if (!parsed) return "-";
	return format(parsed, "MMM d");
}

function buildTrendDepartmentKey(departmentId: string | null, departmentName: string) {
	return [
		String(departmentId || "").trim() || "unassigned",
		String(departmentName || "Unassigned").trim() || "Unassigned",
	].join("::");
}

function DailyTrendTooltip({ active, payload, label }: any) {
	if (!active || !payload?.length) return null;

	const visibleItems = payload.filter(
		(item: any) => item?.value !== undefined && Number(item.value) > 0,
	);
	const total = visibleItems.reduce((sum: number, item: any) => sum + Number(item.value || 0), 0);

	return (
		<div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-lg">
			<div className="text-xs font-semibold text-neutral-900">{String(label || "-")}</div>
			<div className="text-[11px] text-neutral-500">
				{formatCount(total)} matched rows
			</div>
			<div className="mt-2 space-y-1">
				{visibleItems.map((item: any) => (
					<div key={String(item.dataKey || item.name)} className="flex items-center justify-between gap-4 text-xs">
						<span className="flex items-center gap-2 text-neutral-700">
							<span
								className="h-2 w-2 rounded-full"
								style={{ backgroundColor: item.color || "#E60000" }}
							/>
							{String(item.name || item.dataKey)}
						</span>
						<span className="font-medium text-neutral-900">
							{formatCount(Number(item.value || 0))}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function AttendanceDailyTrendTab() {
	const {
		searchParams,
		setSearchParams,
		scope,
		dateRange,
		fromIso,
		toIso,
		activeMonth,
		activeYear,
		yearOptions,
		setScope,
		setMonth,
		setYear,
		setDateRange,
		clearFilters: clearScopeFilters,
	} = useReportScopeFilters();
	const [selectedDepartment, setSelectedDepartment] = useState(
		() => searchParams.get("departmentId") || "all",
	);
	const [selectedManager, setSelectedManager] = useState(
		() => searchParams.get("reportToId") || "all",
	);
	const [chartMode, setChartMode] = useState<TrendChartMode>("line");

	const { data: departmentsData } = useDepartments({ limit: 1000 });
	const departments = departmentsData?.departments || [];

	const { data: employeesData } = useEmployees({ limit: 1000 });
	const allEmployees = useMemo(
		() =>
			Array.isArray((employeesData as any)?.data)
				? (employeesData as any).data
				: (employeesData as any)?.data?.employees ||
					(employeesData as any)?.employees ||
					[],
		[employeesData],
	);

	const managers = useMemo(() => {
		if (selectedDepartment === "all") return allEmployees;
		return allEmployees.filter((employee: any) => employee.department?.id === selectedDepartment);
	}, [allEmployees, selectedDepartment]);

	const { data, isLoading, error } = useAttendanceDailyTrendByDepartment(
		fromIso,
		toIso,
		undefined,
		undefined,
		selectedDepartment === "all" ? undefined : selectedDepartment,
		selectedManager === "all" ? undefined : selectedManager,
	);

	const trend = data?.metrics?.attendanceDailyTrendByDepartment;
	const departmentSeries = useMemo(
		() =>
			(trend?.departments || []).map((department, index) => ({
				...department,
				key: buildTrendDepartmentKey(department.departmentId, department.departmentName),
				color: TREND_COLORS[index % TREND_COLORS.length],
			})),
		[trend?.departments],
	);

	const chartData = useMemo<TrendSeriesRow[]>(
		() =>
			(trend?.series || []).map((bucket) => {
				const row: TrendSeriesRow = {
					businessDate: bucket.businessDate,
					label: formatAxisLabel(bucket.businessDate),
					total: bucket.total,
				};

				bucket.departmentBreakdown.forEach((department) => {
					row[buildTrendDepartmentKey(department.departmentId, department.departmentName)] =
						department.total;
				});

				return row;
			}),
		[trend?.series],
	);

	const peakDay = useMemo(() => {
		return chartData.reduce<TrendSeriesRow | null>((best, current) => {
			if (!best) return current;
			return Number(current.total || 0) > Number(best.total || 0) ? current : best;
		}, null);
	}, [chartData]);

	const averagePerDay = trend?.totalDays ? trend.totalRecords / trend.totalDays : 0;
	const dateRangeLabel =
		trend?.startDate && trend?.endDate
			? `${formatDayLabel(trend.startDate)} to ${formatDayLabel(trend.endDate)}`
			: `${fromIso || "-"} to ${toIso || "-"}`;

	const handleClearFilters = () => {
		setSelectedDepartment("all");
		setSelectedManager("all");
		clearScopeFilters();
	};

	useEffect(() => {
		const nextSearchParams = new URLSearchParams(searchParams);

		if (selectedDepartment !== "all") {
			nextSearchParams.set("departmentId", selectedDepartment);
		} else {
			nextSearchParams.delete("departmentId");
		}

		if (selectedManager !== "all") {
			nextSearchParams.set("reportToId", selectedManager);
		} else {
			nextSearchParams.delete("reportToId");
		}

		if (nextSearchParams.toString() !== searchParams.toString()) {
			setSearchParams(nextSearchParams, { replace: true });
		}
	}, [searchParams, selectedDepartment, selectedManager, setSearchParams]);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Daily Trend by Department</CardTitle>
				<CardDescription>
					Attendance obligations grouped by business day and department for the selected range
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="flex flex-col xl:flex-row gap-4 items-end justify-between">
					<div className="flex flex-1 flex-col md:flex-row gap-2 md:gap-4 w-full flex-wrap">
						<ReportScopeDateFilters
							scope={scope}
							activeMonth={activeMonth}
							activeYear={activeYear}
							yearOptions={yearOptions}
							dateRange={dateRange}
							onScopeChange={setScope}
							onMonthChange={setMonth}
							onYearChange={setYear}
							onDateRangeChange={setDateRange}
						/>
						<div className="w-full md:w-[180px]">
							<div className="mb-1 text-sm font-medium">Department</div>
							<DepartmentSectionPicker
								variant="report"
								departments={departments}
								sections={[]}
								departmentId={selectedDepartment}
								onDepartmentChange={(value) => {
									setSelectedDepartment(value);
									setSelectedManager("all");
								}}
								onSectionChange={(value) => {
									setSelectedDepartment(value);
									setSelectedManager("all");
								}}
							/>
						</div>
						<div className="w-full md:w-[180px]">
							<div className="mb-1 text-sm font-medium">Manager</div>
							<Select value={selectedManager} onValueChange={setSelectedManager}>
								<SelectTrigger
									aria-label="Manager filter"
									className="h-9 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm md:text-sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Managers</SelectItem>
									{managers.map((employee: any) => (
										<SelectItem key={`manager-${employee.id}`} value={employee.id}>
											{employee.person?.personalInfo?.firstName}{" "}
											{employee.person?.personalInfo?.lastName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="flex gap-2 shrink-0 w-full md:w-auto mt-4 md:mt-0 items-center">
						<Button
							variant="ghost"
							onClick={handleClearFilters}
							className="flex-1 md:flex-none text-muted-foreground hover:text-foreground h-10 px-4">
							Clear Filters
						</Button>
					</div>
				</div>

				{isLoading ? (
					<div className="text-center py-8 text-gray-500">Loading metrics...</div>
				) : error ? (
					<div className="text-center py-8 text-red-500">
						Error loading metrics: {error.message}
					</div>
				) : (
					<>
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">
										Total Records
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{formatCount(trend?.totalRecords || 0)}
									</div>
									<p className="text-xs text-gray-500">
										Matched attendance obligation rows
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">Average / Day</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{averagePerDay.toFixed(1)}
									</div>
									<p className="text-xs text-gray-500">
										{trend?.totalDays || 0} business days in scope
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">
										Departments
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{formatCount(departmentSeries.length)}
									</div>
									<p className="text-xs text-gray-500">Departments represented</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">Peak Day</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{peakDay ? formatAxisLabel(peakDay.businessDate) : "-"}
									</div>
									<p className="text-xs text-gray-500">
										{peakDay ? `${formatCount(Number(peakDay.total || 0))} records` : "No peak yet"}
									</p>
								</CardContent>
							</Card>
						</div>

						<ChartCard
							title="Attendance Trend Chart"
							description={`${dateRangeLabel} - ${trend?.departments.length || 0} department series`}
							height="h-[420px]"
							headerActions={
								<div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white p-1 shadow-sm">
									<Button
										type="button"
										variant={chartMode === "line" ? "secondary" : "ghost"}
										size="sm"
										className="h-8 px-3 text-xs"
										aria-pressed={chartMode === "line"}
										onClick={() => setChartMode("line")}>
										<LineChartIcon className="h-4 w-4" />
										Line
									</Button>
									<Button
										type="button"
										variant={chartMode === "stacked" ? "secondary" : "ghost"}
										size="sm"
										className="h-8 px-3 text-xs"
										aria-pressed={chartMode === "stacked"}
										onClick={() => setChartMode("stacked")}>
										<BarChart3 className="h-4 w-4" />
										Stacked bars
									</Button>
								</div>
							}>
							{chartData.length === 0 ? (
								<div className="flex h-full items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50 text-sm text-neutral-500">
									No attendance trend data found for the selected filters
								</div>
							) : (
								<ResponsiveContainer width="100%" height="100%">
									{chartMode === "line" ? (
										<LineChart
											data={chartData}
											margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
											<CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
											<XAxis
												dataKey="label"
												tickMargin={12}
												minTickGap={24}
												interval="preserveStartEnd"
											/>
											<YAxis allowDecimals={false} />
											<Tooltip content={<DailyTrendTooltip />} />
											{departmentSeries.map((department) => (
												<Line
													key={department.key}
													type="monotone"
													dataKey={department.key}
													name={department.departmentName}
													stroke={department.color}
													strokeWidth={2.5}
													dot={false}
													activeDot={{ r: 4 }}
												/>
											))}
										</LineChart>
									) : (
										<BarChart
											data={chartData}
											margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
											<CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
											<XAxis
												dataKey="label"
												tickMargin={12}
												minTickGap={24}
												interval="preserveStartEnd"
											/>
											<YAxis allowDecimals={false} />
											<Tooltip content={<DailyTrendTooltip />} />
											{departmentSeries.map((department) => (
												<Bar
													key={department.key}
													dataKey={department.key}
													name={department.departmentName}
													stackId="attendance"
													fill={department.color}
												/>
											))}
										</BarChart>
									)}
								</ResponsiveContainer>
							)}
						</ChartCard>

						<div className="rounded-lg border border-neutral-200 bg-white p-4">
							<div className="flex flex-wrap gap-3">
								{departmentSeries.map((department) => {
									const share = trend?.totalRecords
										? (department.total / trend.totalRecords) * 100
										: 0;

									return (
										<div
											key={department.key}
											className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2">
											<span
												className="h-2.5 w-2.5 rounded-full"
												style={{ backgroundColor: department.color }}
											/>
											<div>
												<div className="text-sm font-medium text-neutral-900">
													{department.departmentName}
												</div>
												<div className="text-xs text-neutral-500">
													{formatCount(department.total)} records -{" "}
													{share.toFixed(1)}%
												</div>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
