import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import { Download } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { useState } from "react";
import { ReportExportDialog } from "./components/ReportExportDialog";
import { buildReportFileName, exportRowsToCsv, exportRowsToPdf } from "~/lib/utils/report-export";

const departmentData = [
	{
		id: "eng",
		department: "Engineering",
		headcount: 22,
		female: 10,
		male: 12,
		averageAge: 33,
		location: "Manila",
	},
	{
		id: "hr",
		department: "Human Resources",
		headcount: 8,
		female: 6,
		male: 2,
		averageAge: 31,
		location: "Cebu",
	},
	{
		id: "marketing",
		department: "Marketing",
		headcount: 12,
		female: 7,
		male: 5,
		averageAge: 29,
		location: "Manila",
	},
	{
		id: "sales",
		department: "Sales",
		headcount: 15,
		female: 8,
		male: 7,
		averageAge: 35,
		location: "Remote",
	},
	{
		id: "finance",
		department: "Finance",
		headcount: 9,
		female: 6,
		male: 3,
		averageAge: 37,
		location: "Manila",
	},
	{
		id: "cs",
		department: "Customer Success",
		headcount: 14,
		female: 9,
		male: 5,
		averageAge: 32,
		location: "Remote",
	},
];

const columns: Column<(typeof departmentData)[0]>[] = [
	{
		key: "department",
		label: "Department",
		sortable: true,
		render: (_, item) => (
			<div>
				<p className="font-medium text-neutral-900">{item.department}</p>
				<p className="text-xs text-neutral-500">{item.location}</p>
			</div>
		),
	},
	{
		key: "headcount",
		label: "Headcount",
		sortable: true,
		className: "text-center",
	},
	{
		key: "female",
		label: "Female",
		sortable: true,
		className: "text-center",
		render: (value) => (
			<Badge variant="secondary" className="bg-rose-50 text-rose-700 border-rose-100">
				{value}
			</Badge>
		),
	},
	{
		key: "male",
		label: "Male",
		sortable: true,
		className: "text-center",
		render: (value) => (
			<Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100">
				{value}
			</Badge>
		),
	},
	{
		key: "averageAge",
		label: "Average Age",
		sortable: true,
		className: "text-center",
		render: (value) => <span className="font-semibold text-neutral-900">{value}</span>,
	},
];

const filters: FilterOption[] = [
	{
		key: "location",
		label: "Location",
		options: [
			{ value: "all", label: "All Locations" },
			{ value: "Manila", label: "Manila" },
			{ value: "Cebu", label: "Cebu" },
			{ value: "Remote", label: "Remote" },
		],
	},
];

export default function DepartmentReportTab() {
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);
	const fileBaseName = buildReportFileName("department-report");

	const exportCsv = () => {
		exportRowsToCsv({
			columns: [
				{ header: "Department", accessor: "department" },
				{ header: "Location", accessor: "location" },
				{ header: "Headcount", accessor: "headcount" },
				{ header: "Female", accessor: "female" },
				{ header: "Male", accessor: "male" },
				{ header: "Average Age", accessor: "averageAge" },
			],
			rows: departmentData,
			fileBaseName,
		});
	};

	const exportPdf = async () => {
		await exportRowsToPdf({
			columns: [
				{ header: "Department", accessor: "department" },
				{ header: "Location", accessor: "location" },
				{ header: "Headcount", accessor: "headcount" },
				{ header: "Female", accessor: "female" },
				{ header: "Male", accessor: "male" },
				{ header: "Average Age", accessor: "averageAge" },
			],
			rows: departmentData,
			fileBaseName,
			reportTitle: "Department Report",
			metadataLines: ["Snapshot of department headcount and gender distribution."],
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
		<div className="space-y-4">
			<div className="flex justify-end">
				<Button
					variant="outline"
					className="flex items-center gap-2"
					onClick={() => setIsExportModalOpen(true)}>
					<Download className="w-4 h-4" />
					Export
				</Button>
			</div>
			<DataTable
				title="Department Report"
				description="Headcount and gender distribution per department"
				data={departmentData}
				columns={columns}
				filters={filters}
				searchFields={["department", "location"]}
				itemsPerPage={6}
				showExport={false}
			/>
			<ReportExportDialog
				title="Export Department Report"
				description="Choose how to export the department report."
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={[
					{
						format: "pdf",
						label: "Export PDF",
						helperText: "Download the department report as a PDF.",
					},
					{
						format: "csv",
						label: "Export CSV",
						helperText: "Download the same department rows as a CSV file.",
					},
				]}
				onExport={handleExport}
			/>
		</div>
	);
}
