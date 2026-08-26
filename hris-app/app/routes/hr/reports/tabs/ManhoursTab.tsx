import { useMemo, useState } from "react";
import { Badge } from "~/components/atoms/Badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "~/components/atoms/Card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Clock } from "lucide-react";
import { useMetrics } from "~/lib/hooks/useMetrics";
import {
	reportTableBodyClassName,
	reportTableClassName,
	reportTableHeadClassName,
	reportTableRowClassName,
	reportTableScrollClassName,
	reportTableShellClassName,
} from "../components/reportTableStyles";

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthStartIso = () => {
	const now = new Date();
	return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
};

/**
 * M2.4 manhour reference (operator definition 2026-08-26): a man-hour equals
 * one hour of work done by one person. Hours come from the Attendance ledger
 * (`totalMinutesWorked`, net of breaks) for the selected date range.
 */
export function ManhoursTab() {
	const [dateFrom, setDateFrom] = useState(monthStartIso());
	const [dateTo, setDateTo] = useState(todayIso());

	const filter = useMemo(
		() => ({ dateFrom, dateTo }),
		[dateFrom, dateTo],
	);

	const { data, isLoading, error } = useMetrics(
		"Attendance",
		["manhoursReport"],
		filter,
	);

	const metrics = useMemo(() => {
		const source = (data as any)?.data?.metrics?.manhoursReport || (data as any)?.metrics?.manhoursReport;
		return source || null;
	}, [data]);

	const employees = useMemo(
		() => (Array.isArray(metrics?.employees) ? metrics.employees : []),
		[metrics],
	);
	const departments = useMemo(
		() => (Array.isArray(metrics?.departments) ? metrics.departments : []),
		[metrics],
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Clock className="h-5 w-5" />
					Manhours Report
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<p className="text-sm text-muted-foreground">{metrics?.definition}</p>

				<div className="flex flex-wrap items-end gap-3">
					<div className="space-y-1">
						<label className="text-xs text-muted-foreground">From</label>
						<Input
							type="date"
							value={dateFrom}
							onChange={(event) => setDateFrom(event.target.value)}
						/>
					</div>
					<div className="space-y-1">
						<label className="text-xs text-muted-foreground">To</label>
						<Input
							type="date"
							value={dateTo}
							onChange={(event) => setDateTo(event.target.value)}
						/>
					</div>
					<Button
						variant="outline"
						onClick={() => {
							setDateFrom(monthStartIso());
							setDateTo(todayIso());
						}}>
						This month
					</Button>
				</div>

				{isLoading ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						Computing manhours…
					</p>
				) : error ? (
					<p className="py-6 text-center text-sm text-red-600">
						Failed to load manhours: {(error as any)?.message || "unknown error"}
					</p>
				) : (
					<>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
							<div className="rounded-lg border p-3">
								<p className="text-xs text-muted-foreground">People with worked hours</p>
								<p className="text-lg font-semibold">{metrics?.grandTotals?.employees ?? 0}</p>
							</div>
							<div className="rounded-lg border p-3">
								<p className="text-xs text-muted-foreground">Days worked (total)</p>
								<p className="text-lg font-semibold">{metrics?.grandTotals?.daysWorked ?? 0}</p>
							</div>
							<div className="rounded-lg border p-3">
								<p className="text-xs text-muted-foreground">Total man-hours</p>
								<p className="text-lg font-semibold">{metrics?.grandTotals?.totalHours ?? 0}</p>
							</div>
						</div>

						<section className="space-y-2">
							<h3 className="text-sm font-semibold">By department</h3>
							<div className={reportTableShellClassName}>
								<div className={reportTableScrollClassName}>
									<table className={`${reportTableClassName} min-w-[480px]`}>
										<thead className={reportTableHeadClassName}>
											<tr>
												<th className="text-left p-2">Department</th>
												<th className="text-right p-2">People</th>
												<th className="text-right p-2">Man-hours</th>
											</tr>
										</thead>
										<tbody className={reportTableBodyClassName}>
											{departments.map((row: any) => (
												<tr key={row.department} className={reportTableRowClassName}>
													<td className="p-2 font-medium">{row.department}</td>
													<td className="p-2 text-right">{row.employees}</td>
													<td className="p-2 text-right">{row.totalHours}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						</section>

						<section className="space-y-2">
							<h3 className="text-sm font-semibold">By employee</h3>
							{employees.length === 0 ? (
								<p className="py-4 text-center text-sm text-muted-foreground">
									No closed attendance records in this range.
								</p>
							) : (
								<div className={reportTableShellClassName}>
									<div className={reportTableScrollClassName}>
										<table className={`${reportTableClassName} min-w-[720px]`}>
											<thead className={reportTableHeadClassName}>
												<tr>
													<th className="text-left p-2">Employee</th>
													<th className="text-left p-2">Department</th>
													<th className="text-right p-2">Days</th>
													<th className="text-right p-2">Man-hours</th>
													<th className="text-right p-2">Minutes</th>
												</tr>
											</thead>
											<tbody className={reportTableBodyClassName}>
												{employees.map((row: any) => (
													<tr key={row.id} className={reportTableRowClassName}>
														<td className="p-2 font-medium">
															{row.name}{" "}
															<Badge variant="outline" className="ml-1 text-[10px]">
																{row.employeeId}
															</Badge>
														</td>
														<td className="p-2">{row.department}</td>
														<td className="p-2 text-right">{row.daysWorked}</td>
														<td className="p-2 text-right font-medium">{row.totalHours}</td>
														<td className="p-2 text-right text-muted-foreground">{row.totalMinutes}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
							)}
						</section>
					</>
				)}
			</CardContent>
		</Card>
	);
}
