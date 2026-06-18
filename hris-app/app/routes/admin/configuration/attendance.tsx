import { useEffect, useState } from "react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { CategoricalText } from "~/components/atoms/CategoricalText";
import {
	createTruncatedTextProps,
	formatDateTime,
	formatDateForExport,
} from "~/lib/utils/text-utils";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { Eye, Upload, MoreVertical, Download, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "~/lib/hooks/use-auth";
import { buildAttendanceImportMutationInput } from "~/lib/attendance-import-ui";
import type { Attendance } from "~/services/attendance.service";
import { useAttendances, useAttendance, useImportAttendance } from "~/lib/hooks/useAttendances";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export const ATTENDANCE_IMPORT_ROUTE_SOURCE_TRUTH_CONTRACT = {
	importWriteTarget: "Attendance",
	clockLedgerTruth: "Attendance",
	operationalProjection: "AttendanceObligation",
	timesheetTallySource: "Timesheetline.effectiveRows",
	paidPayrollHistory: "EmployeePayroll.timesheetSnapshot",
} as const;

export const ATTENDANCE_IMPORT_TEMPLATE_COLUMNS = [
	"EMPLOYEE_ID",
	"DATE",
	"TIME_IN",
	"TIME_OUT",
	"STATUS",
	"NOTES",
] as const;

export const ATTENDANCE_IMPORT_ALLOWED_STATUSES = [
	"PRESENT",
	"LEAVE",
	"INCOMPLETE",
	"ABSENT",
	"REST_DAY",
] as const;

export function buildAttendanceImportTemplateCsv() {
	return [
		ATTENDANCE_IMPORT_TEMPLATE_COLUMNS.join(","),
		"EMP001,2026-05-01,2026-05-01 08:00:00,2026-05-01 17:00:00,PRESENT,On time",
		"EMP002,2026-05-01,2026-05-01 08:15:00,2026-05-01 17:30:00,PRESENT,Late arrival",
		"EMP003,2026-05-01,,,LEAVE,Annual leave",
		"EMP004,2026-05-01,,,ABSENT,No clock record",
		"EMP005,2026-05-01,,,REST_DAY,Scheduled rest day",
	].join("\n");
}

export default function AttendancePage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const { user } = useAuth();

	// Get search and filter params from URL
	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;

	// Build filter string for API
	const filterString = statusFilter ? `status:${statusFilter}` : undefined;

	// React Query hooks with server-side search and filtering
	const { data: attendancesData, isLoading } = useAttendances({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		filter: filterString,
		count: true,
	});
	const items = (attendancesData as any)?.attendances || [];

	// Deep link URL params
	const action = searchParams.get("action");
	const id = searchParams.get("id");

	// Single attendance ID for fetching (when action is view)
	const activeAttendanceId = action === "view" ? id : null;

	// Single useAttendance hook for view modal
	const { data: activeAttendance, isLoading: isLoadingAttendance } = useAttendance(
		activeAttendanceId || "",
	);

	// Import mutation
	const importAttendanceMutation = useImportAttendance();

	// Import modal state
	const [importFile, setImportFile] = useState<File | null>(null);
	const [importError, setImportError] = useState<string>("");
	const [importErrors, setImportErrors] = useState<string[]>([]);
	const [isDragging, setIsDragging] = useState(false);

	// Helper: get employee name
	const getEmployeeName = (attendance: Attendance): string => {
		if (attendance.employee?.person?.personalInfo) {
			const firstName = attendance.employee.person.personalInfo.firstName || "";
			const lastName = attendance.employee.person.personalInfo.lastName || "";
			return `${firstName} ${lastName}`.trim() || attendance.employee.employeeId || "-";
		}
		return attendance.employee?.employeeId || "-";
	};

	const filterOptions: FilterOption[] = [
		{
			key: "status",
			label: "Status",
			options: [
				{ value: "PRESENT", label: "Present" },
				{ value: "LEAVE", label: "Leave" },
			],
		},
	];

	const columns: Column<Attendance>[] = [
		{
			key: "employeeId",
			label: "Employee",
			width: "200px",
			render: (value, item) => (
				<span className="font-medium text-gray-900">{getEmployeeName(item)}</span>
			),
		},
		{
			key: "date",
			label: "Date",
			width: "120px",
			render: (value) => {
				if (!value) return <span className="text-gray-400">-</span>;
				const date = new Date(value);
				return <span>{date.toLocaleDateString()}</span>;
			},
		},
		{
			key: "timeIn",
			label: "Time In",
			width: "120px",
			render: (value) => {
				if (!value) return <span className="text-gray-400">-</span>;
				const date = new Date(value);
				return <span>{date.toLocaleTimeString()}</span>;
			},
		},
		{
			key: "timeOut",
			label: "Time Out",
			width: "120px",
			render: (value) => {
				if (!value) return <span className="text-gray-400">-</span>;
				const date = new Date(value);
				return <span>{date.toLocaleTimeString()}</span>;
			},
		},
		{
			key: "status",
			label: "Status",
			width: "100px",
			render: (value) => (
				<Badge variant={value === "PRESENT" ? "success" : "secondary"}>
					{value || "N/A"}
				</Badge>
			),
		},
		// {
		// 	key: "isManualEntry",
		// 	label: "Type",
		// 	width: "100px",
		// 	render: (value) => (
		// 		<Badge variant={value ? "outline" : "default"}>
		// 			{value ? "Manual" : "Automatic"}
		// 		</Badge>
		// 	),
		// },
	];

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const openImport = () => {
		setImportFile(null);
		setImportError("");
		setImportErrors([]);
		updateSearchParams((next) => {
			next.set("action", "import");
		});
	};

	const handleImportAttendance = () => {
		if (!importFile) {
			setImportError("Please select a file to import");
			return;
		}

		importAttendanceMutation.mutate(buildAttendanceImportMutationInput(importFile), {
			onSuccess: (data: any) => {
				// Check if there are errors in the response
				if (data?.summary?.errors && data.summary.errors.length > 0) {
					setImportErrors(data.summary.errors);
					setImportError("Import completed with errors. Please review the errors below.");
					toast.warning(
						`Import completed with ${data.summary.errors.length} error(s). ${data.summary.created} created, ${data.summary.updated} updated, ${data.summary.skipped} skipped.`,
					);
					// Don't close the modal - keep it open to show errors
					return;
				}

				// Success - no errors
				setImportFile(null);
				setImportError("");
				setImportErrors([]);
				updateSearchParams((next) => {
					next.delete("action");
				});
			},
			onError: () => {
				setImportError("Failed to import attendance. Please check the file format.");
			},
		});
	};

	const handleDownloadTemplate = () => {
		// Create sample template data
		const template = buildAttendanceImportTemplateCsv();

		const blob = new Blob([template], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "attendance-template.csv";
		a.click();
		window.URL.revokeObjectURL(url);
	};

	const handleView = (attendance: Attendance) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", attendance.id);
		});
	};

	const renderActions = (item: Attendance) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="w-8 h-8 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={() => handleView(item)}>
					<Eye className="h-4 w-4 mr-2" /> View Details
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	// Check if modal should show loading state for deep links
	const isDeepLinkLoading = !!activeAttendanceId && isLoadingAttendance;

	// Server-side search handler
	const handleSearch = (query: string) => {
		updateSearchParams((next) => {
			if (query) {
				next.set("search", query);
			} else {
				next.delete("search");
			}
			next.set("page", "1");
		});
	};

	// Server-side filter handler
	const handleFilterChange = (filters: Record<string, string>) => {
		updateSearchParams((next) => {
			if (filters.status) {
				next.set("status", filters.status);
			} else {
				next.delete("status");
			}
			next.set("page", "1");
		});
	};

	// Server-side pagination handler
	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	return (
		<div className="space-y-6">
			<DataTable
				title="Attendance"
				description="Manage and import attendance records"
				data={items}
				columns={columns}
				filters={filterOptions}
				onImport={openImport}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No attendance records found"
				emptyDescription="Get started by importing attendance data from an Excel file."
				emptyActions={<ConfigurationEmptyGuide label="Import" onClick={openImport} />}
				searchWidth="w-80"
				searchPlaceholder="Search attendance..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={(attendancesData as any)?.pagination?.total}
				onSearch={handleSearch}
				onFilterChange={handleFilterChange}
				onPageChange={handlePageChange}
				searchValue={searchQuery || ""}
				onExportPDF={() => {
					/* your PDF logic */
				}}
				onExportExcel={() => {
					/* your Excel logic */
				}}
			/>

			{/* Import Modal */}
			<Modal
				open={action === "import"}
				onOpenChange={(open) => {
					if (!open) {
						setImportFile(null);
						setImportError("");
						setImportErrors([]);
						setIsDragging(false);
						updateSearchParams((next) => {
							next.delete("action");
						});
					}
				}}
				title="Import Attendance"
				description="Upload a CSV/Excel file to bulk import attendance records">
				<div className="space-y-6">
					{/* Instructions with Download Button */}
					<div className="relative p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-lg">
						<button
							type="button"
							onClick={handleDownloadTemplate}
							className="absolute top-3 right-3 p-2 bg-white hover:bg-blue-50 text-blue-600 rounded-lg border border-blue-300 transition-colors shadow-sm"
							title="Download Template">
							<Download className="h-4 w-4" />
						</button>
						<h4 className="text-sm font-semibold text-blue-900 mb-3 pr-10">
							📋 Import Instructions
						</h4>
						<ul className="text-sm text-blue-800 space-y-2">
							<li className="flex items-start gap-2">
								<span className="text-blue-600 font-bold">1.</span>
								<span>Click the download icon above to get the template</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-blue-600 font-bold">2.</span>
								<span>
									Required: <strong>EMPLOYEE_ID</strong>, <strong>DATE</strong>
								</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-blue-600 font-bold">3.</span>
								<span>
									Optional: <strong>TIME_IN</strong>, <strong>TIME_OUT</strong>,{" "}
									<strong>STATUS</strong>, <strong>NOTES</strong>
								</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-blue-600 font-bold">4.</span>
								<span>
									STATUS must be one of{" "}
									<strong>{ATTENDANCE_IMPORT_ALLOWED_STATUSES.join(", ")}</strong>
								</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-blue-600 font-bold">5.</span>
								<span>Save as CSV or Excel format</span>
							</li>
						</ul>
					</div>

					{/* Drag & Drop File Upload */}
					{!importFile && (
						<div>
							<label className="block text-sm font-medium text-foreground mb-3">
								Upload File
							</label>
							<div
								onDragOver={(e) => {
									e.preventDefault();
									setIsDragging(true);
								}}
								onDragLeave={(e) => {
									e.preventDefault();
									setIsDragging(false);
								}}
								onDrop={(e) => {
									e.preventDefault();
									setIsDragging(false);
									const file = e.dataTransfer.files[0];
									if (
										file &&
										(file.name.endsWith(".csv") ||
											file.name.endsWith(".xlsx") ||
											file.name.endsWith(".xls"))
									) {
										setImportFile(file);
										setImportError("");
										setImportErrors([]);
									} else {
										setImportError("Please upload a valid CSV or Excel file");
									}
								}}
								className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
									isDragging
										? "border-blue-500 bg-blue-50"
										: "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50"
								}`}>
								<input
									type="file"
									accept=".xlsx,.xls,.csv"
									onChange={(e) => {
										const file = e.target.files?.[0];
										if (file) {
											setImportFile(file);
											setImportError("");
											setImportErrors([]);
										}
									}}
									className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
								/>
								<div className="flex flex-col items-center gap-3">
									<div
										className={`p-4 rounded-full transition-colors ${
											isDragging ? "bg-blue-100" : "bg-gray-200"
										}`}>
										<svg
											className={`h-8 w-8 transition-colors ${
												isDragging ? "text-blue-600" : "text-gray-400"
											}`}
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24">
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
											/>
										</svg>
									</div>
									<div>
										<p className="text-sm font-semibold text-gray-900">
											{isDragging
												? "Drop your file here"
												: "Drag & drop your file here"}
										</p>
										<p className="text-xs text-gray-500 mt-1">
											or click to browse
										</p>
									</div>
									<div className="flex items-center gap-2 mt-2">
										<span className="px-3 py-1 bg-white text-xs font-medium text-gray-600 rounded-full border border-gray-300">
											.CSV
										</span>
										<span className="px-3 py-1 bg-white text-xs font-medium text-gray-600 rounded-full border border-gray-300">
											.XLSX
										</span>
										<span className="px-3 py-1 bg-white text-xs font-medium text-gray-600 rounded-full border border-gray-300">
											.XLS
										</span>
									</div>
								</div>
							</div>
							{importError && (
								<div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
									<svg
										className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0"
										fill="currentColor"
										viewBox="0 0 20 20">
										<path
											fillRule="evenodd"
											d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
											clipRule="evenodd"
										/>
									</svg>
									<p className="text-sm text-red-800">{importError}</p>
								</div>
							)}
						</div>
					)}

					{/* File Preview */}
					{importFile && (
						<div>
							<label className="block text-sm font-medium text-foreground mb-3">
								Selected File
							</label>
							<div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div className="p-3 bg-blue-100 rounded-lg">
											<svg
												className="h-6 w-6 text-blue-600"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24">
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
												/>
											</svg>
										</div>
										<div>
											<p className="text-sm font-semibold text-gray-900">
												{importFile.name}
											</p>
											<p className="text-xs text-gray-600 mt-0.5">
												{(importFile.size / 1024).toFixed(2)} KB • Ready to
												import
											</p>
										</div>
									</div>
									<button
										type="button"
										onClick={() => {
											setImportFile(null);
											setImportError("");
											setImportErrors([]);
										}}
										className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
										title="Remove file">
										<X className="h-5 w-5" />
									</button>
								</div>
							</div>
						</div>
					)}

					{/* Import Errors List */}
					{importErrors.length > 0 && (
						<div>
							<label className="block text-sm font-medium text-red-700 mb-3">
								Import Errors ({importErrors.length})
							</label>
							<div className="max-h-60 overflow-y-auto border-2 border-red-200 rounded-lg bg-red-50">
								<ul className="divide-y divide-red-200">
									{importErrors.map((error, index) => (
										<li key={index} className="p-3 flex items-start gap-2">
											<svg
												className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0"
												fill="currentColor"
												viewBox="0 0 20 20">
												<path
													fillRule="evenodd"
													d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
													clipRule="evenodd"
												/>
											</svg>
											<span className="text-sm text-red-800">{error}</span>
										</li>
									))}
								</ul>
							</div>
						</div>
					)}

					{/* Actions */}
					<div className="flex justify-end gap-3 pt-4 border-t">
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								setImportFile(null);
								setImportError("");
								setImportErrors([]);
								setIsDragging(false);
								updateSearchParams((next) => {
									next.delete("action");
								});
							}}
							disabled={importAttendanceMutation.isPending}>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={handleImportAttendance}
							disabled={!importFile || importAttendanceMutation.isPending}
							className="min-w-[120px]">
							{importAttendanceMutation.isPending ? (
								<>
									<div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
									Importing...
								</>
							) : (
								<>
									<Upload className="h-4 w-4 mr-2" />
									Import
								</>
							)}
						</Button>
					</div>
				</div>
			</Modal>

			{/* View Modal */}
			<Modal
				open={action === "view"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
						});
					}
				}}
				title="Attendance Details"
				description="View attendance record information">
				{isDeepLinkLoading && action === "view" ? (
					<div className="py-8 text-center text-gray-500">Loading attendance...</div>
				) : activeAttendance && action === "view" ? (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Employee
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									{getEmployeeName(activeAttendance)}
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Date
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									{activeAttendance.date
										? new Date(activeAttendance.date).toLocaleDateString()
										: "-"}
								</div>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Time In
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									{activeAttendance.timeIn
										? new Date(activeAttendance.timeIn).toLocaleTimeString()
										: "-"}
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Time Out
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									{activeAttendance.timeOut
										? new Date(activeAttendance.timeOut).toLocaleTimeString()
										: "-"}
								</div>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Status
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									<CategoricalText value={activeAttendance.status || "N/A"} />
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Type
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									<Badge
										variant={
											activeAttendance.isManualEntry ? "outline" : "default"
										}>
										{activeAttendance.isManualEntry ? "Manual" : "Automatic"}
									</Badge>
								</div>
							</div>
						</div>
						{activeAttendance.notes && (
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Notes
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									{activeAttendance.notes}
								</div>
							</div>
						)}
						<div className="flex justify-end gap-3 pt-4">
							<Button
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("id");
									});
								}}>
								Close
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Attendance not found</div>
				)}
			</Modal>
		</div>
	);
}
