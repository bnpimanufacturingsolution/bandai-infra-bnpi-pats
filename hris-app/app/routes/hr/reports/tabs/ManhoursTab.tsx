import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { Badge } from "~/components/atoms/Badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "~/components/atoms/Card";
import { Button } from "~/components/ui/button";
import { ReportScopeDateFilters } from "../components/ReportScopeDateFilters";
import { Clock, Download } from "lucide-react";
import { useMetrics } from "~/lib/hooks/useMetrics";
import {
	exportRowsToCsv,
	exportRowsToPdf,
	buildReportFileName,
	type ReportExportColumn,
} from "~/lib/utils/report-export";
import { toast } from "sonner";

const getInitialDateRange = (): DateRange => {
	const now = new Date();
	const from = new Date(now.getFullYear(), now.getMonth(), 1);
	const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	return { from, to };
};

/**
 * M2.4 manhour reference (operator definition 2026-08-26): a man-hour equals
 * one hour of work done by one person. Hours come from the Attendance ledger
 * (`totalMinutesWorked`, net of breaks) for the selected date range.
 */
export function ManhoursTab() {
	const [dateRange, setDateRange] = useState<DateRange | undefined>(getInitialDateRange);

	const dateFrom = useMemo(() => {
		return dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-01");
	}, [dateRange?.from]);

	const dateTo = useMemo(() => {
		return dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : dateFrom;
	}, [dateRange?.to, dateFrom]);

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

	const handleExportEmployees = async () => {
		if (employees.length === 0) {
			toast.error("No employee records to export");
			return;
		}

		const columns: ReportExportColumn<any>[] = [
			{ header: "Employee ID", accessor: (r) => r.employeeId || "-" },
			{ header: "Employee Name", accessor: (r) => r.name || "-" },
			{ header: "Department", accessor: (r) => r.department || "-" },
			{ header: "Days Worked", accessor: (r) => String(r.daysWorked ?? 0) },
			{ header: "Total Man-hours", accessor: (r) => String(r.totalHours ?? 0) },
			{ header: "Total Minutes", accessor: (r) => String(r.totalMinutes ?? 0) },
		];

		const fileBase = buildReportFileName("manhours-employee-report", dateFrom, "to", dateTo);
		exportRowsToCsv({ columns, rows: employees, fileBaseName: fileBase });
		toast.success("Exported employee manhours report as CSV");
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Clock className="h-5 w-5" />
					Manhours Report
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				<p className="text-xs text-muted-foreground">{metrics?.definition}</p>

				{/* Filters - Pure Single Line Toolbar */}
				<div className="flex items-end gap-2 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar flex-nowrap w-full">
					<ReportScopeDateFilters
						dateRange={dateRange}
						onDateRangeChange={setDateRange}
					/>
					<Button
						variant="outline"
						className="h-8 text-xs px-3 shadow-sm shrink-0 bg-white hover:bg-neutral-50"
						onClick={() => {
							setDateRange(getInitialDateRange());
						}}>
						This month
					</Button>
				</div>

				{isLoading ? (
					<p className="py-6 text-center text-xs text-muted-foreground">
						Computing manhours…
					</p>
				) : error ? (
					<p className="py-6 text-center text-xs text-red-600">
						Failed to load manhours: {(error as any)?.message || "unknown error"}
					</p>
				) : (
					<>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
							<div className="rounded-lg border border-neutral-200 border-l-4 border-l-blue-500 bg-white p-3.5 shadow-sm">
								<p className="text-xs font-medium text-muted-foreground">People with worked hours</p>
								<p className="text-xl font-bold text-neutral-900 mt-1">{metrics?.grandTotals?.employees ?? 0}</p>
							</div>
							<div className="rounded-lg border border-neutral-200 border-l-4 border-l-emerald-500 bg-white p-3.5 shadow-sm">
								<p className="text-xs font-medium text-muted-foreground">Days worked (total)</p>
								<p className="text-xl font-bold text-emerald-700 mt-1">{metrics?.grandTotals?.daysWorked ?? 0}</p>
							</div>
							<div className="rounded-lg border border-neutral-200 border-l-4 border-l-purple-500 bg-white p-3.5 shadow-sm">
								<p className="text-xs font-medium text-muted-foreground">Total man-hours</p>
								<p className="text-xl font-bold text-purple-700 mt-1">{metrics?.grandTotals?.totalHours ?? 0}</p>
							</div>
						</div>

						{/* Department Summary Table */}
						<div className="border rounded-lg bg-white shadow-sm overflow-hidden">
							<div className="flex items-center justify-between p-3 bg-neutral-50/70 border-b border-neutral-200">
								<div className="flex items-center gap-2">
									<h3 className="text-xs font-semibold text-neutral-900">
										Manhours by Department
									</h3>
									<span className="text-[10px] bg-neutral-200/80 text-neutral-700 font-semibold px-2 py-0.5 rounded">
										{departments.length} Departments
									</span>
								</div>
							</div>
							<div className="overflow-x-auto">
								<table className="w-full text-xs">
									<thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold text-[11px]">
										<tr>
											<th className="text-left px-3 py-2">Department</th>
											<th className="text-right px-3 py-2">People</th>
											<th className="text-right px-3 py-2">Man-hours</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-neutral-100">
										{departments.map((row: any) => (
											<tr key={row.department} className="hover:bg-neutral-50/80 transition-colors">
												<td className="px-3 py-2 font-medium">{row.department}</td>
												<td className="px-3 py-2 text-right">{row.employees}</td>
												<td className="px-3 py-2 text-right font-medium text-purple-700">{row.totalHours}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>

						{/* Employee Breakdown Table */}
						<div className="border rounded-lg bg-white shadow-sm overflow-hidden">
							<div className="flex items-center justify-between p-3 bg-neutral-50/70 border-b border-neutral-200">
								<div className="flex items-center gap-2">
									<h3 className="text-xs font-semibold text-neutral-900">
										Manhours by Employee
									</h3>
									<span className="text-[10px] bg-neutral-200/80 text-neutral-700 font-semibold px-2 py-0.5 rounded">
										{employees.length} Records
									</span>
								</div>
								<Button
									variant="outline"
									className="h-8 text-xs px-3 shadow-sm bg-white hover:bg-neutral-50 gap-1.5 font-medium"
									onClick={handleExportEmployees}>
									<Download className="w-3.5 h-3.5" />
									Export Report
								</Button>
							</div>
							{employees.length === 0 ? (
								<p className="py-8 text-center text-xs text-muted-foreground">
									No closed attendance records in this range.
								</p>
							) : (
								<div className="overflow-x-auto">
									<table className="w-full text-xs">
										<thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold text-[11px]">
											<tr>
												<th className="text-left px-3 py-2">Employee</th>
												<th className="text-left px-3 py-2">Department</th>
												<th className="text-right px-3 py-2">Days</th>
												<th className="text-right px-3 py-2">Man-hours</th>
												<th className="text-right px-3 py-2">Minutes</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-neutral-100">
											{employees.map((row: any) => (
												<tr key={row.id} className="hover:bg-neutral-50/80 transition-colors">
													<td className="px-3 py-2 font-medium">
														{row.name}{" "}
														<Badge variant="outline" className="ml-1 text-[10px]">
															{row.employeeId}
														</Badge>
													</td>
													<td className="px-3 py-2 text-neutral-700">{row.department}</td>
													<td className="px-3 py-2 text-right">{row.daysWorked}</td>
													<td className="px-3 py-2 text-right font-medium text-purple-700">{row.totalHours}</td>
													<td className="px-3 py-2 text-right text-muted-foreground">{row.totalMinutes}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
