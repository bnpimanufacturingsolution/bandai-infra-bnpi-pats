import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Download } from "lucide-react";
import { useLaborCostAnalysis } from "~/lib/hooks/useMetrics";
import { useDepartments } from "~/lib/hooks/useDepartments";
import {
	buildReportFileName,
	exportRowsToCsv,
	exportRowsToPdf,
} from "~/lib/utils/report-export";
import { ReportExportDialog } from "../components/ReportExportDialog";
import { ReportScopeDateFilters } from "../components/ReportScopeDateFilters";
import { useReportScopeFilters } from "../useReportScopeFilters";

const peso = (value: number | undefined | null) =>
	`₱${(value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function LaborCostTab() {
	const {
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
	const [selectedDepartment, setSelectedDepartment] = useState("all");
	const [workforceSource, setWorkforceSource] = useState("all");
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);

	const { data: departmentsData } = useDepartments({ limit: 1000 });
	const departments = departmentsData?.departments || [];

	const { data, isLoading, error } = useLaborCostAnalysis(
		fromIso,
		toIso,
		selectedDepartment === "all" ? undefined : selectedDepartment,
		workforceSource,
	);

	const analysis = data?.metrics?.laborCostAnalysis;
	const rows = analysis?.rows || [];

	const exportColumns = [
		{ header: "Department", accessor: "department" },
		{ header: "Headcount", accessor: "headcount" },
		{ header: "Direct HC", accessor: "directHeadcount" },
		{ header: "Agency HC", accessor: "agencyHeadcount" },
		{ header: "Basic Pay", accessor: (r: any) => r.basicPay.toFixed(2) },
		{ header: "Overtime Pay", accessor: (r: any) => r.overtimePay.toFixed(2) },
		{ header: "Allowances", accessor: (r: any) => r.allowances.toFixed(2) },
		{ header: "Gross Pay", accessor: (r: any) => r.grossPay.toFixed(2) },
		{ header: "Deductions", accessor: (r: any) => r.totalDeductions.toFixed(2) },
		{ header: "Net Pay", accessor: (r: any) => r.netPay.toFixed(2) },
		{ header: "Direct Gross", accessor: (r: any) => r.directGrossPay.toFixed(2) },
		{ header: "Agency Gross", accessor: (r: any) => r.agencyGrossPay.toFixed(2) },
	];

	const handleClearFilters = () => {
		setSelectedDepartment("all");
		setWorkforceSource("all");
		clearScopeFilters();
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Labor Cost Analysis</CardTitle>
				<CardDescription>
					Payroll register money per department with Direct vs Agency split
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
						<div className="w-full md:w-[160px]">
							<label className="block text-sm font-medium mb-1">Department</label>
							<Select
								value={selectedDepartment}
								onValueChange={setSelectedDepartment}>
								<SelectTrigger className="h-9 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm md:text-sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Departments</SelectItem>
									{departments.map((dept: any) => (
										<SelectItem key={dept.id} value={dept.id}>
											{dept.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="w-full md:w-[160px]">
							<label className="block text-sm font-medium mb-1">Labor Type</label>
							<Select value={workforceSource} onValueChange={setWorkforceSource}>
								<SelectTrigger className="h-9 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm md:text-sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Labor</SelectItem>
									<SelectItem value="DIRECT">Direct</SelectItem>
									<SelectItem value="AGENCY">Agency</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="flex gap-2 shrink-0 w-full md:w-auto items-center">
						<Button
							variant="ghost"
							onClick={handleClearFilters}
							className="flex-1 md:flex-none text-muted-foreground hover:text-foreground h-10 px-4">
							Clear Filters
						</Button>
						<Button
							variant="outline"
							className="flex-1 md:flex-none"
							onClick={() => setIsExportModalOpen(true)}>
							<Download className="w-4 h-4 mr-2" />
							Export
						</Button>
					</div>
				</div>

				{isLoading ? (
					<div className="text-center py-8 text-gray-500">Loading labor cost…</div>
				) : error ? (
					<div className="text-center py-8 text-red-500">
						Error loading labor cost: {error.message}
					</div>
				) : (
					<>
						<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">Gross Payroll</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-xl font-bold">{peso(analysis?.grossPay)}</div>
									<p className="text-xs text-gray-500">
										{analysis?.headcount || 0} employees · {analysis?.periodCount || 0}{" "}
										period(s)
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">Direct Cost</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-xl font-bold">
										{peso(analysis?.split?.direct?.grossPay)}
									</div>
									<p className="text-xs text-gray-500">
										{analysis?.split?.direct?.headcount || 0} employees
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">Agency Cost</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-xl font-bold">
										{peso(analysis?.split?.agency?.grossPay)}
									</div>
									<p className="text-xs text-gray-500">
										{analysis?.split?.agency?.headcount || 0} employees
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">Net Pay</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-xl font-bold">{peso(analysis?.netPay)}</div>
									<p className="text-xs text-gray-500">
										after {peso(analysis?.totalDeductions)} deductions
									</p>
								</CardContent>
							</Card>
						</div>

						<div className="border rounded-lg overflow-x-auto">
							<table className="w-full text-sm">
								<thead className="bg-gray-100">
									<tr>
										<th className="px-4 py-3 text-left font-medium">Department</th>
										<th className="px-4 py-3 text-left font-medium">HC</th>
										<th className="px-4 py-3 text-left font-medium">Direct/Agency</th>
										<th className="px-4 py-3 text-right font-medium">Basic</th>
										<th className="px-4 py-3 text-right font-medium">OT</th>
										<th className="px-4 py-3 text-right font-medium">Allowances</th>
										<th className="px-4 py-3 text-right font-medium">Gross</th>
										<th className="px-4 py-3 text-right font-medium">Deductions</th>
										<th className="px-4 py-3 text-right font-medium">Net</th>
									</tr>
								</thead>
								<tbody>
									{rows.length > 0 ? (
										rows.map((row) => (
											<tr key={row.departmentId} className="border-t">
												<td className="px-4 py-2 font-medium">{row.department}</td>
												<td className="px-4 py-2">{row.headcount}</td>
												<td className="px-4 py-2 text-xs text-gray-500">
													{row.directHeadcount}/{row.agencyHeadcount}
												</td>
												<td className="px-4 py-2 text-right">{peso(row.basicPay)}</td>
												<td className="px-4 py-2 text-right">
													{peso(row.overtimePay)}
												</td>
												<td className="px-4 py-2 text-right">
													{peso(row.allowances)}
												</td>
												<td className="px-4 py-2 text-right font-semibold">
													{peso(row.grossPay)}
												</td>
												<td className="px-4 py-2 text-right">
													{peso(row.totalDeductions)}
												</td>
												<td className="px-4 py-2 text-right">{peso(row.netPay)}</td>
											</tr>
										))
									) : (
										<tr>
											<td
												colSpan={9}
												className="px-6 py-8 text-center text-gray-500">
												No payroll register rows found for this period
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
					</>
				)}
			</CardContent>

			<ReportExportDialog
				isOpen={isExportModalOpen}
				onClose={() => setIsExportModalOpen(false)}
				title="Export Labor Cost Analysis"
				onExport={(format) => {
					const fileName = buildReportFileName("labor-cost-analysis", fromIso, "to", toIso);
					if (format === "csv") {
						exportRowsToCsv({ columns: exportColumns, rows, fileBaseName: fileName });
					} else if (format === "pdf") {
						exportRowsToPdf({
							title: "Labor Cost Analysis",
							columns: exportColumns,
							rows,
							fileBaseName: fileName,
						});
					}
					setIsExportModalOpen(false);
				}}
			/>
		</Card>
	);
}
