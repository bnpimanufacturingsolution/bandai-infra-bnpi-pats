import { useRef, useState, useEffect } from "react";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { ReportExportDialog } from "./components/ReportExportDialog";
import { buildReportFileName, exportRowsToCsv, exportRowsToPdf } from "~/lib/utils/report-export";
import {
	Calendar,
	ArrowUpRight,
	ArrowDownRight,
	Download,
	MoreVertical,
	Eye,
	Edit,
	Archive,
	Trash2,
} from "lucide-react";
import { createPortal } from "react-dom";

export default function AbsenceTab() {
	const absenceData = [
		{
			id: 1,
			month: "January 2024",
			totalDays: 45,
			sickLeave: 20,
			annualLeave: 15,
			personalLeave: 10,
			trend: "down",
		},
		{
			id: 2,
			month: "February 2024",
			totalDays: 38,
			sickLeave: 15,
			annualLeave: 18,
			personalLeave: 5,
			trend: "up",
		},
	];

	const getTrendIcon = (trend: string) =>
		trend === "up" ? (
			<ArrowUpRight className="w-4 h-4 text-red-500" />
		) : (
			<ArrowDownRight className="w-4 h-4 text-green-500" />
		);
	const getTrendBadge = (trend: string) =>
		trend === "up" ? (
			<Badge variant="destructive">Increasing</Badge>
		) : (
			<Badge variant="default">Decreasing</Badge>
		);

	const absenceColumns: Column<(typeof absenceData)[0]>[] = [
		{
			key: "month",
			label: "Month",
			sortable: true,
			render: (value, item) => (
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
						<Calendar className="w-4 h-4 text-blue-600" />
					</div>
					<div>
						<div className="font-medium text-neutral-900">{item.month}</div>
						<div className="text-sm text-neutral-500">Total Days: {item.totalDays}</div>
					</div>
				</div>
			),
		},
		{ key: "sickLeave", label: "Sick Leave", sortable: true },
		{ key: "annualLeave", label: "Annual Leave", sortable: true },
		{ key: "personalLeave", label: "Personal Leave", sortable: true },
		{
			key: "trend",
			label: "Trend",
			sortable: true,
			render: (value, item) => (
				<div className="flex items-center gap-2">
					{getTrendIcon(item.trend)}
					{getTrendBadge(item.trend)}
				</div>
			),
		},
	];

	const absenceFilters: FilterOption[] = [
		{
			key: "trend",
			label: "Trend",
			options: [
				{ value: "up", label: "Increasing" },
				{ value: "down", label: "Decreasing" },
			],
		},
	];

	const [openDropdown, setOpenDropdown] = useState<string | null>(null);
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);
	const fileBaseName = buildReportFileName("absence-report");

	const exportCsv = () => {
		exportRowsToCsv({
			columns: [
				{ header: "Month", accessor: "month" },
				{ header: "Total Days", accessor: "totalDays" },
				{ header: "Sick Leave", accessor: "sickLeave" },
				{ header: "Annual Leave", accessor: "annualLeave" },
				{ header: "Personal Leave", accessor: "personalLeave" },
				{
					header: "Trend",
					accessor: (row) => (row.trend === "up" ? "Increasing" : "Decreasing"),
				},
			],
			rows: absenceData,
			fileBaseName,
		});
	};

	const exportPdf = async () => {
		await exportRowsToPdf({
			columns: [
				{ header: "Month", accessor: "month" },
				{ header: "Total Days", accessor: "totalDays" },
				{ header: "Sick Leave", accessor: "sickLeave" },
				{ header: "Annual Leave", accessor: "annualLeave" },
				{ header: "Personal Leave", accessor: "personalLeave" },
				{
					header: "Trend",
					accessor: (row) => (row.trend === "up" ? "Increasing" : "Decreasing"),
				},
			],
			rows: absenceData,
			fileBaseName,
			reportTitle: "Absence and Leave Trends",
			metadataLines: ["Static snapshot of absence and leave trend data."],
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
	const ActionDropdown = ({ id }: { id: number }) => {
		const buttonRef = useRef<HTMLButtonElement>(null);
		const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
		const isOpen = openDropdown === `absence-${id}`;
		useEffect(() => {
			if (isOpen && buttonRef.current) {
				const updatePosition = () => {
					if (!buttonRef.current) return;
					const rect = buttonRef.current.getBoundingClientRect();
					setPosition({ top: rect.bottom + 4, left: rect.right - 192 });
				};
				updatePosition();
				window.addEventListener("scroll", updatePosition, true);
				window.addEventListener("resize", updatePosition);
				return () => {
					window.removeEventListener("scroll", updatePosition, true);
					window.removeEventListener("resize", updatePosition);
				};
			} else {
				setPosition(null);
			}
		}, [isOpen]);
		const handleToggle = (e: React.MouseEvent) => {
			e.stopPropagation();
			setOpenDropdown(isOpen ? null : `absence-${id}`);
		};
		const handleAction = (fn: () => void) => {
			fn();
			setOpenDropdown(null);
		};
		return (
			<>
				<Button
					ref={buttonRef}
					variant="ghost"
					size="sm"
					onClick={handleToggle}
					className="h-8 w-8 p-0"
					data-dropdown>
					<MoreVertical className="h-4 w-4" />
				</Button>
				{isOpen &&
					position &&
					createPortal(
						<div
							className="fixed w-48 bg-white border border-gray-200 rounded-md shadow-lg"
							data-dropdown
							style={{
								top: `${position.top}px`,
								left: `${position.left}px`,
								zIndex: 9999,
							}}>
							<div className="py-1">
								<button
									onClick={(e) => {
										e.stopPropagation();
										handleAction(() => console.log("View", id));
									}}
									className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-100">
									<Eye className="h-4 w-4" /> View Details
								</button>
								<button
									onClick={(e) => {
										e.stopPropagation();
										handleAction(() => console.log("Edit", id));
									}}
									className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-100">
									<Edit className="h-4 w-4" /> Edit
								</button>
								<button
									onClick={(e) => {
										e.stopPropagation();
										handleAction(() => console.log("Archive", id));
									}}
									className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-100">
									<Archive className="h-4 w-4" /> Archive
								</button>
								<button
									onClick={(e) => {
										e.stopPropagation();
										handleAction(() => console.log("Delete", id));
									}}
									className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50">
									<Trash2 className="h-4 w-4" /> Delete
								</button>
							</div>
						</div>,
						document.body,
					)}
			</>
		);
	};

	return (
		<>
			<DataTable
				title="Absence/Leave Trends"
				data={absenceData}
				columns={absenceColumns}
				filters={absenceFilters}
				searchFields={["month"]}
				renderActions={(item) => <ActionDropdown id={item.id} />}
				itemsPerPage={8}
				showPagination={true}
				showSearch={true}
				showFilters={true}
				showExport={false}
				titleActions={
					<Button
						variant="outline"
						className="flex items-center gap-2"
						onClick={() => setIsExportModalOpen(true)}>
						<Download className="w-4 h-4" />
						Export
					</Button>
				}
			/>
			<ReportExportDialog
				title="Export Absence Report"
				description="Choose how to export the absence and leave trends report."
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={[
					{
						format: "pdf",
						label: "Export PDF",
						helperText: "Download the report as a PDF.",
					},
					{
						format: "csv",
						label: "Export CSV",
						helperText: "Download the same rows as a CSV file.",
					},
				]}
				onExport={handleExport}
			/>
		</>
	);
}
