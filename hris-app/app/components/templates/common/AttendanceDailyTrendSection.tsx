import { format } from "date-fns";
import { BarChart3, LineChart as LineChartIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip as ChartTooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Card, CardContent } from "~/components/atoms/Card";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { useAttendanceDailyTrendByDepartment } from "~/lib/hooks/useMetrics";

type TrendChartMode = "line" | "stacked";

type AttendanceDailyTrendFilters = {
	dateFrom?: string;
	dateTo?: string;
	search?: string;
	status?: string;
	departmentId?: string;
	reportToId?: string;
	employeeId?: string;
	shiftType?: string;
};

type AttendanceDailyTrendSectionProps = {
	visible: boolean;
	title?: string;
	description?: string;
	filters: AttendanceDailyTrendFilters;
};

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
		return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
	}

	const datePart = String(value).split("T")[0];
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
	if (!match) return null;

	const [, year, month, day] = match;
	return new Date(Number(year), Number(month) - 1, Number(day));
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
			<div className="text-[11px] text-neutral-500">{formatCount(total)} matched rows</div>
			<div className="mt-2 space-y-1">
				{visibleItems.map((item: any) => (
					<div
						key={String(item.dataKey || item.name)}
						className="flex items-center justify-between gap-4 text-xs">
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

export function AttendanceDailyTrendSection({
	visible,
	title,
	description,
	filters,
}: AttendanceDailyTrendSectionProps) {
	const [chartMode, setChartMode] = useState<TrendChartMode>("line");
	const { dateFrom, dateTo, search, status, departmentId, reportToId, employeeId, shiftType } =
		filters;

	const { data, isLoading, error } = useAttendanceDailyTrendByDepartment(
		dateFrom,
		dateTo,
		search,
		status,
		departmentId,
		reportToId,
		employeeId,
		shiftType,
		{
			enabled: visible && !!dateFrom && !!dateTo,
		},
	);

	const trend = data?.metrics?.attendanceDailyTrendByDepartment;
	const trendDepartments = useMemo(
		() => (Array.isArray(trend?.departments) ? trend.departments : []),
		[trend?.departments],
	);
	const trendSeries = useMemo(
		() => (Array.isArray(trend?.series) ? trend.series : []),
		[trend?.series],
	);

	const departmentSeries = useMemo(
		() =>
			trendDepartments.map((department, index) => ({
				...department,
				key: buildTrendDepartmentKey(department.departmentId, department.departmentName),
				color: TREND_COLORS[index % TREND_COLORS.length],
			})),
		[trendDepartments],
	);

	const chartData = useMemo<TrendSeriesRow[]>(
		() =>
			trendSeries.map((bucket) => {
				const row: TrendSeriesRow = {
					businessDate: bucket.businessDate,
					label: formatAxisLabel(bucket.businessDate),
					total: bucket.total,
				};

				const breakdown = Array.isArray(bucket.departmentBreakdown)
					? bucket.departmentBreakdown
					: [];

				breakdown.forEach((department) => {
					row[buildTrendDepartmentKey(department.departmentId, department.departmentName)] =
						department.total;
				});

				return row;
			}),
		[trendSeries],
	);

	const headerTitle = title || "Trend by Department";
	const headerDescription =
		description || "Attendance obligations grouped by business day and department";

	if (!visible) {
		return null;
	}

	if (error) {
		return (
			<div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
				Error loading attendance trend: {error.message}
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<Card className="overflow-hidden rounded-md border border-neutral-200 bg-white gap-0 py-0 shadow-none">
				<div className="border-b border-neutral-200 px-4 py-3 md:px-5">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div className="min-w-0">
							<h3 className="text-lg font-semibold text-neutral-900">{headerTitle}</h3>
							<p className="mt-1 text-sm text-neutral-500">{headerDescription}</p>
						</div>
						<div className="flex flex-wrap items-center gap-2 lg:justify-end">
							<div className="grid w-[210px] grid-cols-2 gap-1 rounded-md border border-neutral-200 bg-white p-1 shadow-sm">
								<Button
									type="button"
									variant={chartMode === "line" ? "secondary" : "ghost"}
									size="sm"
									className="h-8 w-full justify-center px-3 text-xs"
									aria-pressed={chartMode === "line"}
									onClick={() => setChartMode("line")}>
									<LineChartIcon className="h-4 w-4" />
									Line
								</Button>
								<Button
									type="button"
									variant={chartMode === "stacked" ? "secondary" : "ghost"}
									size="sm"
									className="h-8 w-full justify-center px-3 text-xs"
									aria-pressed={chartMode === "stacked"}
									onClick={() => setChartMode("stacked")}>
									<BarChart3 className="h-4 w-4" />
									Stacked bars
								</Button>
							</div>
						</div>
					</div>
				</div>
				<CardContent className="px-4 pb-4 md:px-5 md:pb-5">
					{isLoading ? (
						<div
							role="status"
							aria-label="Loading attendance trend chart"
							aria-busy="true"
							className="space-y-4">
							<div className="grid gap-3 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:items-start">
								<div className="space-y-2">
									<Skeleton className="h-4 w-40" />
									<Skeleton className="h-3 w-72 max-w-full" />
								</div>
								<div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 p-4">
									<div className="flex h-[280px] items-end gap-3">
										<div className="flex h-full w-8 flex-col justify-between py-1">
											<Skeleton className="h-3 w-6" />
											<Skeleton className="h-3 w-6" />
											<Skeleton className="h-3 w-6" />
										</div>
										<div className="grid flex-1 grid-cols-6 items-end gap-3">
											<Skeleton className="h-20 rounded-md" />
											<Skeleton className="h-32 rounded-md" />
											<Skeleton className="h-28 rounded-md" />
											<Skeleton className="h-36 rounded-md" />
											<Skeleton className="h-24 rounded-md" />
											<Skeleton className="h-28 rounded-md" />
										</div>
									</div>
								</div>
							</div>
						</div>
					) : chartData.length === 0 ? (
						<div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 text-center text-sm text-neutral-500">
							No attendance trend data found for the selected filters
						</div>
					) : (
						<div className="h-[360px]">
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
											tick={{ fontSize: 12, fill: "#737373" }}
											tickLine={false}
											axisLine={false}
										/>
										<YAxis
											allowDecimals={false}
											tick={{ fontSize: 12, fill: "#737373" }}
											tickLine={false}
											axisLine={false}
										/>
										<ChartTooltip content={<DailyTrendTooltip />} />
										{departmentSeries.map((department) => (
											<Line
												key={department.key}
												type="monotone"
												dataKey={department.key}
												name={department.departmentName}
												stroke={department.color}
												strokeWidth={1.5}
												dot={false}
												activeDot={{ r: 3 }}
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
											tick={{ fontSize: 12, fill: "#737373" }}
											tickLine={false}
											axisLine={false}
										/>
										<YAxis
											allowDecimals={false}
											tick={{ fontSize: 12, fill: "#737373" }}
											tickLine={false}
											axisLine={false}
										/>
										<ChartTooltip content={<DailyTrendTooltip />} />
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
						</div>
					)}
				</CardContent>
				{departmentSeries.length > 0 ? (
					<div className="border-t border-neutral-200 bg-white px-4 py-3 md:px-5">
						<div className="flex items-center gap-4 overflow-x-auto whitespace-nowrap px-2 pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
							{departmentSeries.map((department) => {
								const share = trend?.totalRecords
									? (department.total / trend.totalRecords) * 100
									: 0;

								return (
									<div key={department.key} className="flex items-center gap-2">
										<span
											className="h-2.5 w-2.5 shrink-0 rounded-full"
											style={{ backgroundColor: department.color }}
										/>
										<div className="flex items-center gap-1.5">
											<span className="text-sm font-medium text-neutral-900">
												{department.departmentName}
											</span>
											<span className="text-xs text-neutral-500">
												({formatCount(department.total)} records -{" "}
												{share.toFixed(1)}% of shown)
											</span>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				) : null}
			</Card>
		</div>
	);
}
