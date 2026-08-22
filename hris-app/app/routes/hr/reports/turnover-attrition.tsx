import { ChartCard, SummaryCard } from "~/components/atoms";
import { AttendanceScopeFilterPopover } from "~/components/molecules/AttendanceScopeFilterPopover";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { useTurnoverAttritionReport } from "~/lib/hooks/useMetrics";
import { reportTableBodyClassName, reportTableClassName, reportTableHeadClassName, reportTableRowClassName, reportTableScrollClassName, reportTableShellClassName } from "./components/reportTableStyles";
import { TurnoverAttritionDateFilterPopover } from "./components/TurnoverAttritionDateFilterPopover";
import { useTurnoverAttritionHierarchyFilters } from "./useTurnoverAttritionHierarchyFilters";
import { useTurnoverAttritionReportFilters } from "./useTurnoverAttritionReportFilters";

import { ArrowDownRight, ArrowUpRight, TrendingDown, Users, UserMinus, UserRoundX } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function formatRate(value: number) {
	return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatNumber(value: number) {
	return new Intl.NumberFormat("en-PH", {
		maximumFractionDigits: 2,
		minimumFractionDigits: value % 1 === 0 ? 0 : 2,
	}).format(Number(value || 0));
}

export default function TurnoverAttritionReportsPage() {
	const {
		scope,
		dateRange,
		fromIso,
		toIso,
		groupBy,
		activeDate,
		activeMonth,
		activeYear,
		yearOptions,
		setScope,
		setAnchorDate,
		setMonth,
		setYear,
		setDateRange,
		clearFilters,
	} = useTurnoverAttritionReportFilters();
	const { hierarchyFilterControls, apiFilters, clearHierarchyFilters } =
		useTurnoverAttritionHierarchyFilters();

	const { data, isLoading, error } = useTurnoverAttritionReport(fromIso, toIso, groupBy, apiFilters);
	const report = data?.metrics.turnoverAttritionReport;
	const buckets = report?.buckets || [];
	const summary = report?.summary;
	const isEmpty =
		!isLoading &&
		!!summary &&
		summary.averageHeadcount === 0 &&
		summary.totalSeparations === 0;
	const neutralSummaryCardClassName = "bg-white shadow-sm";

	return (
		<div className="flex flex-col gap-6 p-6">
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div className="space-y-1">
					<h1 className="text-2xl font-bold text-gray-900">Turnover & Attrition</h1>
					<p className="text-sm text-gray-600">
						Company-wide separation trends using finalized resignations and terminations.
					</p>
				</div>
				<div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center">
					<TurnoverAttritionDateFilterPopover
						scope={scope}
						activeDate={activeDate}
						activeMonth={activeMonth}
						activeYear={activeYear}
						yearOptions={yearOptions}
						dateRange={dateRange}
						fromIso={fromIso}
						toIso={toIso}
						onScopeChange={setScope}
						onDateChange={setAnchorDate}
						onMonthChange={setMonth}
						onYearChange={setYear}
						onDateRangeChange={setDateRange}
						onResetDateFilters={clearFilters}
					/>
					<AttendanceScopeFilterPopover
						controls={hierarchyFilterControls}
						onClearAll={clearHierarchyFilters}
					/>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				<SummaryCard
					title="Average Headcount"
					value={summary ? formatNumber(summary.averageHeadcount) : "0"}
					description="Opening and closing headcount average"
					icon={Users}
					color="gray"
					className={neutralSummaryCardClassName}
					loading={isLoading}
				/>
				<SummaryCard
					title="Total Separations"
					value={summary ? formatNumber(summary.totalSeparations) : "0"}
					description="Finalized resignations and terminations"
					icon={UserMinus}
					color="gray"
					className={neutralSummaryCardClassName}
					loading={isLoading}
				/>
				<SummaryCard
					title="Voluntary Separations"
					value={summary ? formatNumber(summary.voluntarySeparations) : "0"}
					description="Finalized resignations"
					icon={ArrowDownRight}
					color="gray"
					className={neutralSummaryCardClassName}
					loading={isLoading}
				/>
				<SummaryCard
					title="Involuntary Separations"
					value={summary ? formatNumber(summary.involuntarySeparations) : "0"}
					description="Finalized terminations"
					icon={UserRoundX}
					color="gray"
					className={neutralSummaryCardClassName}
					loading={isLoading}
				/>
				<SummaryCard
					title="Turnover Rate"
					value={summary ? formatRate(summary.turnoverRate) : "0.0%"}
					description="All separations / average headcount"
					icon={TrendingDown}
					color="gray"
					className={neutralSummaryCardClassName}
					loading={isLoading}
				/>
				<SummaryCard
					title="Attrition Rate"
					value={summary ? formatRate(summary.attritionRate) : "0.0%"}
					description="Voluntary separations / average headcount"
					icon={ArrowUpRight}
					color="gray"
					className={neutralSummaryCardClassName}
					loading={isLoading}
				/>
			</div>

			{error ? (
				<Card className="border border-red-200 bg-red-50">
					<CardContent className="py-6 text-sm text-red-700">
						Failed to load turnover and attrition metrics: {error.message}
					</CardContent>
				</Card>
			) : null}

			{isEmpty ? (
				<Card className="border border-gray-200">
					<CardContent className="py-10 text-center text-sm text-gray-500">
						No employee lifecycle data is available for the selected period.
					</CardContent>
				</Card>
			) : null}

			{!error && !isEmpty ? (
				<>
					<ChartCard
						title="Rate Trends"
						description="Turnover and attrition rates across the selected reporting buckets."
						loading={isLoading}
					>
						<ResponsiveContainer width="100%" height="100%">
							<LineChart data={buckets}>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis dataKey="label" />
								<YAxis tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
								<Tooltip
									formatter={(value) => formatRate(Number(value ?? 0))}
									labelFormatter={(label) => `Period: ${label}`}
								/>
								<Legend />
								<Line
									type="monotone"
									dataKey="turnoverRate"
									name="Turnover Rate"
									stroke="#e4762f"
									strokeWidth={2}
								/>
								<Line
									type="monotone"
									dataKey="attritionRate"
									name="Attrition Rate"
									stroke="#da3732"
									strokeWidth={2}
								/>
							</LineChart>
						</ResponsiveContainer>
					</ChartCard>

					<Card className="border border-gray-200">
						<CardHeader>
							<CardTitle>Breakdown Table</CardTitle>
							<CardDescription>
								Underlying period counts and rates for the current report window.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className={reportTableShellClassName}>
								<div className={reportTableScrollClassName}>
									<table className={reportTableClassName}>
										<thead className={reportTableHeadClassName}>
											<tr>
												<th className="px-3 py-3 text-left">Period</th>
												<th className="px-3 py-3 text-right">Opening</th>
												<th className="px-3 py-3 text-right">Closing</th>
												<th className="px-3 py-3 text-right">Average</th>
												<th className="px-3 py-3 text-right">Total Sep.</th>
												<th className="px-3 py-3 text-right">Voluntary</th>
												<th className="px-3 py-3 text-right">Involuntary</th>
												<th className="px-3 py-3 text-right">Turnover</th>
												<th className="px-3 py-3 text-right">Attrition</th>
											</tr>
										</thead>
										<tbody className={reportTableBodyClassName}>
											{buckets.map((bucket) => (
												<tr key={`${bucket.periodStart}-${bucket.periodEnd}`} className={reportTableRowClassName}>
													<td className="px-3 py-3 font-medium text-gray-900">{bucket.label}</td>
													<td className="px-3 py-3 text-right">{formatNumber(bucket.openingHeadcount)}</td>
													<td className="px-3 py-3 text-right">{formatNumber(bucket.closingHeadcount)}</td>
													<td className="px-3 py-3 text-right">{formatNumber(bucket.averageHeadcount)}</td>
													<td className="px-3 py-3 text-right">{formatNumber(bucket.totalSeparations)}</td>
													<td className="px-3 py-3 text-right">{formatNumber(bucket.voluntarySeparations)}</td>
													<td className="px-3 py-3 text-right">{formatNumber(bucket.involuntarySeparations)}</td>
													<td className="px-3 py-3 text-right">{formatRate(bucket.turnoverRate)}</td>
													<td className="px-3 py-3 text-right">{formatRate(bucket.attritionRate)}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						</CardContent>
					</Card>
				</>
			) : null}
		</div>
	);
}
