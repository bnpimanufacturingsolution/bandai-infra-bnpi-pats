import { useRef, useState, useEffect } from "react";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Button } from "~/components/atoms/Button";
import { ReportExportDialog } from "./components/ReportExportDialog";
import { buildReportFileName, exportRowsToCsv, exportRowsToPdf } from "~/lib/utils/report-export";
import { BarChart2, Download, MoreVertical, Eye, Edit, Archive, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";

export default function PayrollTab() {
	const payrollData = [
		{
			id: 1,
			period: "January 2024",
			totalGross: 125000,
			totalDeductions: 25000,
			totalNet: 100000,
			employeeCount: 48,
		},
		{
			id: 2,
			period: "February 2024",
			totalGross: 130000,
			totalDeductions: 26000,
			totalNet: 104000,
			employeeCount: 50,
		},
	];

	const payrollColumns: Column<(typeof payrollData)[0]>[] = [
		{
			key: "period",
			label: "Period",
			sortable: true,
			render: (value, item) => (
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
						<BarChart2 className="w-4 h-4 text-green-600" />
					</div>
					<div>
						<div className="font-medium text-neutral-900">{item.period}</div>
						<div className="text-sm text-neutral-500">
							{item.employeeCount} employees
						</div>
					</div>
				</div>
			),
		},
		{
			key: "totalGross",
			label: "Gross Pay",
			sortable: true,
			render: (value) => <div className="text-right">₱{(value || 0).toLocaleString()}</div>,
		},
		{
			key: "totalDeductions",
			label: "Deductions",
			sortable: true,
			render: (value) => <div className="text-right">₱{(value || 0).toLocaleString()}</div>,
		},
		{
			key: "totalNet",
			label: "Net Pay",
			sortable: true,
			render: (value) => (
				<div className="text-right text-green-600">₱{(value || 0).toLocaleString()}</div>
			),
		},
	];

	const payrollFilters: FilterOption[] = [
		{
			key: "employeeCount",
			label: "Employee Count",
			options: [
				{ value: "1-50", label: "1-50 employees" },
				{ value: "51-60", label: "51-60 employees" },
			],
		},
	];

	const [openDropdown, setOpenDropdown] = useState<string | null>(null);
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);
	const fileBaseName = buildReportFileName("payroll-summary-static");

	const exportCsv = () => {
		exportRowsToCsv({
			columns: [
				{ header: "Period", accessor: "period" },
				{ header: "Employee Count", accessor: "employeeCount" },
				{ header: "Gross Pay", accessor: "totalGross" },
				{ header: "Deductions", accessor: "totalDeductions" },
				{ header: "Net Pay", accessor: "totalNet" },
			],
			rows: payrollData,
			fileBaseName,
		});
	};

	const exportPdf = async () => {
		await exportRowsToPdf({
			columns: [
				{ header: "Period", accessor: "period" },
				{ header: "Employee Count", accessor: "employeeCount" },
				{ header: "Gross Pay", accessor: "totalGross" },
				{ header: "Deductions", accessor: "totalDeductions" },
				{ header: "Net Pay", accessor: "totalNet" },
			],
			rows: payrollData,
			fileBaseName,
			reportTitle: "Payroll Summary",
			metadataLines: ["Static payroll summary snapshot."],
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
		const isOpen = openDropdown === `payroll-${id}`;
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
			setOpenDropdown(isOpen ? null : `payroll-${id}`);
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
				title="Payroll Summary"
				data={payrollData}
				columns={payrollColumns}
				filters={payrollFilters}
				searchFields={["period"]}
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
				title="Export Payroll Summary"
				description="Choose how to export the payroll summary."
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={[
					{
						format: "pdf",
						label: "Export PDF",
						helperText: "Download the payroll summary as a PDF.",
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
