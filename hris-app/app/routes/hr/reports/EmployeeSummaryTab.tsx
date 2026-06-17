import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/atoms/Card";
import { SummaryCard } from "~/components/atoms/SummaryCard";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { Download } from "lucide-react";
import { useState } from "react";
import { ReportExportDialog } from "./components/ReportExportDialog";
import { buildReportFileName, exportRowsToCsv, exportRowsToPdf } from "~/lib/utils/report-export";
import {
	reportTableBodyClassName,
	reportTableClassName,
	reportTableHeadClassName,
	reportTableRowClassName,
	reportTableShellClassName,
} from "./components/reportTableStyles";

const genderBreakdown = [
	{ label: "Female", value: 42, color: "bg-pink-100 text-pink-700" },
	{ label: "Male", value: 38, color: "bg-blue-100 text-blue-700" },
];

const ageGroups = [
	{ group: "18 - 25", total: 12, female: 7, male: 5 },
	{ group: "26 - 35", total: 28, female: 14, male: 14 },
	{ group: "36 - 45", total: 26, female: 12, male: 14 },
	{ group: "46 - 55", total: 10, female: 6, male: 4 },
	{ group: "56+", total: 4, female: 3, male: 1 },
];

const summaryMetrics = [
	{
		title: "Total Employees",
		value: "80",
		description: "All active employees",
		variant: "orange" as const,
	},
	{
		title: "Average Age",
		value: "34",
		description: "Across the organization",
		variant: "yellow" as const,
	},
	{
		title: "Female",
		value: "42",
		description: "52.5% of workforce",
		variant: "rose" as const,
	},
	{
		title: "Male",
		value: "38",
		description: "47.5% of workforce",
		variant: "blue" as const,
	},
];

export default function EmployeeSummaryTab() {
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);
	const fileBaseName = buildReportFileName("employee-summary");

	const exportCsv = () => {
		exportRowsToCsv({
			columns: [
				{ header: "Age Group", accessor: "group" },
				{ header: "Total", accessor: "total" },
				{ header: "Female", accessor: "female" },
				{ header: "Male", accessor: "male" },
			],
			rows: ageGroups,
			fileBaseName,
		});
	};

	const exportPdf = async () => {
		await exportRowsToPdf({
			columns: [
				{ header: "Age Group", accessor: "group" },
				{ header: "Total", accessor: "total" },
				{ header: "Female", accessor: "female" },
				{ header: "Male", accessor: "male" },
			],
			rows: ageGroups,
			fileBaseName,
			reportTitle: "Employee Summary Report",
			metadataLines: summaryMetrics.map(
				(metric) => `${metric.title}: ${metric.value} (${metric.description})`,
			),
		});
	};

	const handleExport = async (format: "pdf" | "csv") => {
		if (format === "csv") {
			exportCsv();
		} else {
			await exportPdf();
		}

		setIsExportModalOpen(false);
	};

	return (
		<div className="space-y-6">
			<div className="flex justify-end">
				<Button
					variant="outline"
					className="flex items-center gap-2"
					onClick={() => setIsExportModalOpen(true)}>
					<Download className="w-4 h-4" />
					Export
				</Button>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				{summaryMetrics.map((metric) => (
					<SummaryCard
						key={metric.title}
						title={metric.title}
						value={metric.value}
						description={metric.description}
						variant={metric.variant}
					/>
				))}
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Gender Distribution</CardTitle>
						<CardDescription>
							Snapshot of the current workforce by gender
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{genderBreakdown.map((item) => (
							<div key={item.label} className="flex items-center gap-4">
								<div
									className={`px-3 py-1 rounded-full text-xs font-semibold ${item.color}`}>
									{item.label}
								</div>
								<div className="flex-1 bg-neutral-100 rounded-full h-3">
									<div
										className={`h-3 rounded-full ${item.label === "Female" ? "bg-rose-400" : "bg-blue-400"}`}
										style={{ width: `${(item.value / 80) * 100}%` }}
									/>
								</div>
								<div className="font-semibold text-neutral-900 w-10 text-right">
									{item.value}
								</div>
							</div>
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Quick Insights</CardTitle>
						<CardDescription>Key demographic highlights</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm text-neutral-500">Largest age group</p>
								<p className="text-lg font-semibold text-neutral-900">
									26 - 35 years old
								</p>
							</div>
							<Badge variant="secondary">28 employees</Badge>
						</div>
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm text-neutral-500">Youngest team</p>
								<p className="text-lg font-semibold text-neutral-900">
									Product & Design
								</p>
							</div>
							<Badge variant="outline">Average age 29</Badge>
						</div>
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm text-neutral-500">Most balanced department</p>
								<p className="text-lg font-semibold text-neutral-900">
									Engineering
								</p>
							</div>
							<Badge variant="outline">52% ♂ / 48% ♀</Badge>
						</div>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Age Group Breakdown</CardTitle>
					<CardDescription>Distribution by age range and gender</CardDescription>
				</CardHeader>
				<CardContent>
					<div className={reportTableShellClassName}>
						<table className={reportTableClassName}>
							<thead className={reportTableHeadClassName}>
								<tr>
									<th className="px-4 py-3 text-left font-semibold">Age Group</th>
									<th className="px-4 py-3 text-center font-semibold">Total</th>
									<th className="px-4 py-3 text-center font-semibold">Female</th>
									<th className="px-4 py-3 text-center font-semibold">Male</th>
								</tr>
							</thead>
							<tbody className={reportTableBodyClassName}>
								{ageGroups.map((bucket) => (
									<tr key={bucket.group} className={reportTableRowClassName}>
										<td className="px-4 py-3 font-medium text-neutral-900">
											{bucket.group}
										</td>
										<td className="px-4 py-3 text-center font-semibold text-neutral-900">
											{bucket.total}
										</td>
										<td className="px-4 py-3 text-center text-rose-600 font-medium">
											{bucket.female}
										</td>
										<td className="px-4 py-3 text-center text-blue-600 font-medium">
											{bucket.male}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
			<ReportExportDialog
				title="Export Employee Summary"
				description="Choose how to export the employee summary report."
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={[
					{
						format: "pdf",
						label: "Export PDF",
						helperText: "Download the employee summary as a PDF.",
					},
					{
						format: "csv",
						label: "Export CSV",
						helperText: "Download the age-group breakdown as a CSV file.",
					},
				]}
				onExport={handleExport}
			/>
		</div>
	);
}
