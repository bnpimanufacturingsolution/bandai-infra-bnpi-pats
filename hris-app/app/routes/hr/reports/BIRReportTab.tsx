import { useState, useMemo, useEffect } from "react";
import { Download, User, DollarSign, Briefcase, Building2, Calendar, FileText } from "lucide-react";
import { useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { useEmployee, useEmployees } from "~/lib/hooks/useEmployees";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useBir1601CMetrics } from "~/lib/hooks/useMetrics";
import { buildReportFileName, exportRowsToCsv, exportRowsToPdf } from "~/lib/utils/report-export";
import { ReportExportDialog } from "./components/ReportExportDialog";
import { ReportEmployeeCell } from "./components/ReportEmployeeCell";
import {
	reportTableBodyClassName,
	reportTableClassName,
	reportTableHeadClassName,
	reportTableRowClassName,
	reportTableScrollClassName,
	reportTableShellClassName,
} from "./components/reportTableStyles";
import reportsService from "~/services/reports.service";
import { toast } from "sonner";

function formatMoney(value: number): string {
	return new Intl.NumberFormat("en-PH", {
		style: "currency",
		currency: "PHP",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(Number(value || 0));
}

export default function BIRReportTab() {
	const [searchParams, setSearchParams] = useSearchParams();
	const currentYear = new Date().getFullYear();
	const [selectedDocument, setSelectedDocument] = useState<string>(
		searchParams.get("document") || "2316",
	);
	const [selectedYear, setSelectedYear] = useState<string>(
		searchParams.get("year") || currentYear.toString(),
	);
	const [selectedMonth, setSelectedMonth] = useState<string>(
		searchParams.get("month") || String(new Date().getMonth() + 1),
	);
	const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>(
		searchParams.get("departmentId") || "all",
	);
	const [selectedReportToId, setSelectedReportToId] = useState<string>(
		searchParams.get("reportToId") || "all",
	);
	const [selectedFilterEmployeeId, setSelectedFilterEmployeeId] = useState<string>(
		searchParams.get("employeeId") || "all",
	);
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
	const [isDownloading, setIsDownloading] = useState(false);
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);

	const monthOptions = [
		{ value: "1", label: "January" },
		{ value: "2", label: "February" },
		{ value: "3", label: "March" },
		{ value: "4", label: "April" },
		{ value: "5", label: "May" },
		{ value: "6", label: "June" },
		{ value: "7", label: "July" },
		{ value: "8", label: "August" },
		{ value: "9", label: "September" },
		{ value: "10", label: "October" },
		{ value: "11", label: "November" },
		{ value: "12", label: "December" },
	];

	// Fetch employees
	const { data: employeesData, isLoading: employeesLoading } = useEmployees({
		page: 1,
		limit: 1000,
		count: false,
	});
	const employeeDetailFields = useMemo(
		() => [
			"id",
			"employeeId",
			"employmentHireDate",
			"employmentStatus",
			"basicSalary",
			"currency",
			"position.title",
			"department.name",
			"person.personalInfo",
			"documents.type",
			"documents.number",
		],
		[],
	);
	const { data: selectedEmployeeDetail, isLoading: selectedEmployeeDetailLoading } = useEmployee(
		selectedEmployeeId,
		employeeDetailFields,
		{ document: true },
	);
	const { data: departmentsData } = useDepartments({ limit: 1000 });
	const departments = departmentsData?.departments || [];

	// Format employees for dropdown
	const employees = useMemo(() => {
		if (!employeesData) return [];

		// Handle different response structures
		let employeeList: any[] = [];
		if (Array.isArray(employeesData)) {
			employeeList = employeesData;
		} else if (employeesData?.employees && Array.isArray(employeesData.employees)) {
			employeeList = employeesData.employees;
		} else if (
			employeesData?.data &&
			typeof employeesData.data === "object" &&
			"employees" in employeesData.data
		) {
			employeeList = (employeesData.data as any).employees || [];
		}

		// Filter active employees and format for dropdown
		return employeeList
			.filter((emp: any) => emp.employmentStatus === "ACTIVE" && emp.person?.personalInfo)
			.map((emp: any) => {
				const person = emp.person?.personalInfo || {};
				const firstName = person.firstName || "";
				const lastName = person.lastName || "";
				const middleName = person.middleName || "";
				const name =
					[firstName, middleName, lastName].filter(Boolean).join(" ") ||
					emp.employeeId ||
					"Unknown";
				return {
					id: emp.id,
					value: emp.id,
					label: `${name} (${emp.employeeId || "N/A"})`,
					employee: emp,
				};
			})
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [employeesData]);

	const managerOptions = useMemo(() => {
		return employees
			.filter((item: any) => item.employee?.isManager || item.employee?.isHrManager)
			.map((item) => ({ value: item.id, label: item.label }));
	}, [employees]);

	const filteredEmployeeOptions = useMemo(() => {
		return employees.filter((item: any) => {
			const matchesDepartment =
				selectedDepartmentId === "all" ||
				item.employee?.department?.id === selectedDepartmentId;
			const matchesManager =
				selectedReportToId === "all" || item.employee?.reportTo?.id === selectedReportToId;
			return matchesDepartment && matchesManager;
		});
	}, [employees, selectedDepartmentId, selectedReportToId]);

	const bir1601CFilter = useMemo(
		() => ({
			month: Number(selectedMonth),
			year: Number(selectedYear),
			...(selectedDepartmentId !== "all" ? { departmentId: selectedDepartmentId } : {}),
			...(selectedReportToId !== "all" ? { reportToId: selectedReportToId } : {}),
			...(selectedFilterEmployeeId !== "all" ? { employeeId: selectedFilterEmployeeId } : {}),
		}),
		[
			selectedMonth,
			selectedYear,
			selectedDepartmentId,
			selectedReportToId,
			selectedFilterEmployeeId,
		],
	);

	const {
		data: bir1601CData,
		isLoading: isBir1601CLoading,
		error: bir1601CError,
	} = useBir1601CMetrics(bir1601CFilter, selectedDocument === "1601-C");

	// Get selected employee details for display
	const selectedEmployeeDetails = useMemo(() => {
		if (!selectedEmployeeId) return null;
		const emp: any = selectedEmployeeDetail;
		if (!emp) return null;
		const person = emp?.person?.personalInfo || {};
		const firstName = person.firstName || "";
		const lastName = person.lastName || "";
		const middleName = person.middleName || "";
		const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ").trim() || "-";

		// Extract TIN from documents
		const tinDoc = (emp?.documents || []).find((doc: any) => {
			const type = String(doc?.type || "").toLowerCase();
			return type === "tin" || type === "tin_id" || type === "tax_identification_number";
		});
		const tinNumber = tinDoc?.number || "-";

		// Format salary
		const salaryAmount = Number(emp?.basicSalary);
		const salary =
			Number.isFinite(salaryAmount) && salaryAmount > 0
				? new Intl.NumberFormat("en-PH", {
						style: "currency",
						currency: emp?.currency || "PHP",
						minimumFractionDigits: 2,
					}).format(salaryAmount)
				: "-";

		// Format hire date
		const employmentHireDate = emp?.employmentHireDate
			? new Date(emp.employmentHireDate).toLocaleDateString("en-PH", {
					year: "numeric",
					month: "long",
					day: "numeric",
				})
			: "-";

		// Employment status mapping
		const statusMap: Record<string, string> = {
			ACTIVE: "Active",
			INACTIVE: "Inactive",
			TERMINATED: "Terminated",
			RESIGNED: "Resigned",
			RETIRED: "Retired",
			ON_LEAVE: "On Leave",
		};

		return {
			fullName,
			employeeId: emp?.employeeId || "-",
			position: emp?.position?.title || "-",
			department: emp?.department?.name || "-",
			basicSalary: salary,
			currency: emp?.currency || "PHP",
			tinNumber,
			employmentHireDate,
			employmentStatus: statusMap[emp?.employmentStatus] || emp?.employmentStatus || "-",
		};
	}, [selectedEmployeeId, selectedEmployeeDetail]);

	// Generate years from current year going back 5 years
	const years = Array.from({ length: 6 }, (_, i) => currentYear - i).map((year) =>
		year.toString(),
	);

	useEffect(() => {
		const nextSearchParams = new URLSearchParams(searchParams);
		nextSearchParams.set("document", selectedDocument);

		if (selectedDocument === "1601-C") {
			nextSearchParams.set("month", selectedMonth);
			nextSearchParams.set("year", selectedYear);

			if (selectedDepartmentId !== "all")
				nextSearchParams.set("departmentId", selectedDepartmentId);
			else nextSearchParams.delete("departmentId");

			if (selectedReportToId !== "all")
				nextSearchParams.set("reportToId", selectedReportToId);
			else nextSearchParams.delete("reportToId");

			if (selectedFilterEmployeeId !== "all")
				nextSearchParams.set("employeeId", selectedFilterEmployeeId);
			else nextSearchParams.delete("employeeId");

			const month = Number(selectedMonth);
			const year = Number(selectedYear);
			if (!Number.isNaN(month) && !Number.isNaN(year) && month >= 1 && month <= 12) {
				const from = `${year}-${String(month).padStart(2, "0")}-01`;
				const toDate = new Date(year, month, 0);
				const to = `${year}-${String(month).padStart(2, "0")}-${String(
					toDate.getDate(),
				).padStart(2, "0")}`;
				nextSearchParams.set("from", from);
				nextSearchParams.set("to", to);
			}
		} else {
			nextSearchParams.delete("month");
			nextSearchParams.delete("departmentId");
			nextSearchParams.delete("reportToId");
			nextSearchParams.delete("employeeId");
			nextSearchParams.delete("from");
			nextSearchParams.delete("to");
		}

		if (nextSearchParams.toString() !== searchParams.toString()) {
			setSearchParams(nextSearchParams, { replace: true });
		}
	}, [
		searchParams,
		selectedDocument,
		selectedMonth,
		selectedYear,
		selectedDepartmentId,
		selectedReportToId,
		selectedFilterEmployeeId,
		setSearchParams,
	]);

	const export1601CCsv = () => {
		const metrics = bir1601CData?.metrics?.bir1601CMetrics;
		if (!metrics) return;

		exportRowsToCsv({
			columns: [
				{ header: "Employee ID", accessor: "employeeCode" },
				{ header: "Employee Name", accessor: "employeeName" },
				{ header: "Department", accessor: "department" },
				{ header: "MWE", accessor: (row) => (row.isMwe ? "YES" : "NO") },
				{ header: "Basic Net", accessor: "basicNet" },
				{ header: "OT/Holiday/Hazard", accessor: "overtimeHolidayHazard" },
				{ header: "De Minimis", accessor: "deMinimis" },
				{ header: "Contributions", accessor: "contributions" },
				{ header: "Withholding Tax", accessor: "withholdingTax" },
				{ header: "Total Compensation", accessor: "totalCompensation" },
			],
			rows: metrics.breakdown.employees,
			fileBaseName: buildReportFileName(
				"bir-1601c",
				metrics.period.dateFrom,
				"to",
				metrics.period.dateTo,
			),
		});
	};

	const export1601CPdf = async () => {
		const metrics = bir1601CData?.metrics?.bir1601CMetrics;
		if (!metrics) return;

		await exportRowsToPdf({
			columns: [
				{ header: "Employee ID", accessor: "employeeCode" },
				{ header: "Employee Name", accessor: "employeeName" },
				{ header: "Department", accessor: "department" },
				{ header: "MWE", accessor: (row) => (row.isMwe ? "YES" : "NO") },
				{ header: "Basic Net", accessor: "basicNet" },
				{ header: "OT/Holiday/Hazard", accessor: "overtimeHolidayHazard" },
				{ header: "De Minimis", accessor: "deMinimis" },
				{ header: "Contributions", accessor: "contributions" },
				{ header: "Withholding Tax", accessor: "withholdingTax" },
				{ header: "Total Compensation", accessor: "totalCompensation" },
			],
			rows: metrics.breakdown.employees,
			fileBaseName: buildReportFileName(
				"bir-1601c",
				metrics.period.dateFrom,
				"to",
				metrics.period.dateTo,
			),
			reportTitle: "BIR Form 1601-C Report",
			metadataLines: [
				`Period: ${metrics.period.dateFrom} to ${metrics.period.dateTo}`,
				`Month: ${selectedMonth} | Year: ${selectedYear}`,
			],
		});
	};

	const handleDownload = async () => {
		if (selectedDocument !== "2316") {
			return;
		}

		if (!selectedEmployeeId) {
			toast.error("Please select an employee.");
			return;
		}

		setIsDownloading(true);
		try {
			const selectedEmployee = employees.find((emp) => emp.id === selectedEmployeeId);
			if (!selectedEmployee) {
				toast.error("Selected employee not found.");
				return;
			}

			const employeeName = selectedEmployee.label.split(" (")[0].replace(/\s+/g, "-");
			const blob = await reportsService.downloadBir2316(
				selectedEmployeeId,
				parseInt(selectedYear, 10),
			);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `BIR-2316-${employeeName}-${selectedYear}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("Error downloading BIR 2316:", error);
			const message =
				error instanceof Error ? error.message : "Failed to download BIR Form 2316.";
			toast.error(message);
		} finally {
			setIsDownloading(false);
		}
	};

	const openExportModal = () => {
		if (selectedDocument === "1601-C" && !bir1601CData?.metrics?.bir1601CMetrics) {
			toast.error("No BIR 1601-C data to export.");
			return;
		}

		if (selectedDocument === "2316" && !selectedEmployeeId) {
			toast.error("Please select an employee.");
			return;
		}

		setIsExportModalOpen(true);
	};

	const handleExport = async (format: "pdf" | "csv") => {
		if (selectedDocument === "2316") {
			await handleDownload();
			setIsExportModalOpen(false);
			return;
		}

		if (format === "csv") {
			export1601CCsv();
		} else {
			await export1601CPdf();
		}

		setIsExportModalOpen(false);
	};

	return (
		<div className="rounded-lg border bg-card p-6 shadow-sm">
			<div className="space-y-4">
				<div>
					<h2 className="text-lg font-semibold text-foreground">BIR Report</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Select a document type and year to download
					</p>
				</div>

				<div className="space-y-4">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-end">
						<div className="flex-1 space-y-2">
							<label className="text-sm font-medium text-foreground">
								Document Type
							</label>
							<Select value={selectedDocument} onValueChange={setSelectedDocument}>
								<SelectTrigger>
									<SelectValue placeholder="Select document type" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="2316">BIR FORM 2316</SelectItem>
									<SelectItem value="1601-C">BIR FORM 1601-C</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{selectedDocument === "2316" && (
							<div className="flex-1 space-y-2">
								<label className="text-sm font-medium text-foreground">
									Employee
								</label>
								<Select
									value={selectedEmployeeId}
									onValueChange={setSelectedEmployeeId}
									disabled={employeesLoading}>
									<SelectTrigger>
										<SelectValue placeholder="Select employee" />
									</SelectTrigger>
									<SelectContent>
										{employees.map((employee) => (
											<SelectItem key={employee.id} value={employee.id}>
												{employee.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}

						<div className="flex-1 space-y-2">
							<label className="text-sm font-medium text-foreground">Year</label>
							<Select value={selectedYear} onValueChange={setSelectedYear}>
								<SelectTrigger>
									<SelectValue placeholder="Select year" />
								</SelectTrigger>
								<SelectContent>
									{years.map((year) => (
										<SelectItem key={year} value={year}>
											{year}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{selectedDocument === "1601-C" && (
							<div className="flex-1 space-y-2">
								<label className="text-sm font-medium text-foreground">Month</label>
								<Select value={selectedMonth} onValueChange={setSelectedMonth}>
									<SelectTrigger>
										<SelectValue placeholder="Select month" />
									</SelectTrigger>
									<SelectContent>
										{monthOptions.map((month) => (
											<SelectItem key={month.value} value={month.value}>
												{month.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</div>

					{selectedDocument === "1601-C" && (
						<>
							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div className="space-y-2">
									<label className="text-sm font-medium text-foreground">
										Department
									</label>
									<DepartmentSectionPicker
										variant="report"
										departments={departments}
										sections={[]}
										departmentId={selectedDepartmentId}
										onDepartmentChange={(value) => {
											setSelectedDepartmentId(value);
											setSelectedReportToId("all");
											setSelectedFilterEmployeeId("all");
										}}
										onSectionChange={(value) => {
											setSelectedDepartmentId(value);
											setSelectedReportToId("all");
											setSelectedFilterEmployeeId("all");
										}}
									/>
								</div>
								<div className="space-y-2">
									<label className="text-sm font-medium text-foreground">
										Manager
									</label>
									<Select
										value={selectedReportToId}
										onValueChange={setSelectedReportToId}>
										<SelectTrigger className="h-9 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm md:text-sm">
											<SelectValue placeholder="All managers" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Managers</SelectItem>
											{managerOptions.map((manager) => (
												<SelectItem
													key={manager.value}
													value={manager.value}>
													{manager.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<label className="text-sm font-medium text-foreground">
										Employee
									</label>
									<Select
										value={selectedFilterEmployeeId}
										onValueChange={setSelectedFilterEmployeeId}>
										<SelectTrigger className="h-9 w-full rounded-md border-neutral-200 bg-white text-xs shadow-sm md:text-sm">
											<SelectValue placeholder="All employees" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Employees</SelectItem>
											{filteredEmployeeOptions.map((employee) => (
												<SelectItem key={employee.id} value={employee.id}>
													{employee.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>

							{isBir1601CLoading && (
								<Card>
									<CardContent className="py-6 text-sm text-muted-foreground">
										Loading BIR 1601-C metrics...
									</CardContent>
								</Card>
							)}

							{bir1601CError && (
								<Card>
									<CardContent className="py-6 text-sm text-red-600">
										Failed to load BIR 1601-C metrics.
									</CardContent>
								</Card>
							)}

							{bir1601CData?.metrics?.bir1601CMetrics && (
								<Card>
									<CardHeader>
										<CardTitle>BIR 1601-C Monthly Computation</CardTitle>
									</CardHeader>
									<CardContent className="space-y-4">
										<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
											{[
												["14", "Total Compensation"],
												["15", "MWE Basic"],
												["16", "MWE OT/Holiday/Hazard"],
												["18", "De Minimis"],
												["19", "SSS/PHIC/HDMF"],
												["21", "Total Non-Taxable"],
												["22", "Taxable Compensation"],
												["25", "Tax Withheld"],
											].map(([fieldNo, label]) => (
												<div key={fieldNo} className="rounded border p-3">
													<p className="text-xs text-muted-foreground">
														Field {fieldNo}
													</p>
													<p className="text-sm font-medium">{label}</p>
													<p className="text-base font-semibold text-orange-700">
														{formatMoney(
															Number(
																bir1601CData.metrics.bir1601CMetrics
																	.fields[
																	fieldNo as keyof typeof bir1601CData.metrics.bir1601CMetrics.fields
																],
															),
														)}
													</p>
												</div>
											))}
										</div>
										<div className="text-xs text-muted-foreground">
											Pay-date basis:{" "}
											{bir1601CData.metrics.bir1601CMetrics.period.dateFrom}{" "}
											to {bir1601CData.metrics.bir1601CMetrics.period.dateTo}{" "}
											| MWE threshold:{" "}
											{formatMoney(
												bir1601CData.metrics.bir1601CMetrics.period
													.mweMonthlyThreshold,
											)}
										</div>
										<div className={reportTableShellClassName}>
											<div className={reportTableScrollClassName}>
												<table
													className={`${reportTableClassName} min-w-[900px]`}>
													<thead className={reportTableHeadClassName}>
														<tr>
															<th className="text-left p-2">
																Employee
															</th>
															<th className="text-left p-2">Dept</th>
															<th className="text-left p-2">MWE</th>
															<th className="text-right p-2">
																Total Comp
															</th>
															<th className="text-right p-2">
																Basic Net
															</th>
															<th className="text-right p-2">
																OT/Holiday
															</th>
															<th className="text-right p-2">
																De Minimis
															</th>
															<th className="text-right p-2">
																Contributions
															</th>
															<th className="text-right p-2">
																W/Tax
															</th>
														</tr>
													</thead>
													<tbody className={reportTableBodyClassName}>
														{bir1601CData.metrics.bir1601CMetrics.breakdown.employees.map(
															(row) => (
																<tr
																	key={`${row.employeeId}-${row.employeeCode}`}
																	className={
																		reportTableRowClassName
																	}>
																	<td className="p-2">
																		<ReportEmployeeCell
																			rosterEmployees={employees}
																			employeeId={row.employeeId}
																			employeeCode={row.employeeCode}
																			fullName={row.employeeName}
																		/>
																	</td>
																	<td className="p-2">
																		{row.department}
																	</td>
																	<td className="p-2">
																		{row.isMwe ? "YES" : "NO"}
																	</td>
																	<td className="p-2 text-right">
																		{formatMoney(
																			row.totalCompensation,
																		)}
																	</td>
																	<td className="p-2 text-right">
																		{formatMoney(row.basicNet)}
																	</td>
																	<td className="p-2 text-right">
																		{formatMoney(
																			row.overtimeHolidayHazard,
																		)}
																	</td>
																	<td className="p-2 text-right">
																		{formatMoney(row.deMinimis)}
																	</td>
																	<td className="p-2 text-right">
																		{formatMoney(
																			row.contributions,
																		)}
																	</td>
																	<td className="p-2 text-right">
																		{formatMoney(
																			row.withholdingTax,
																		)}
																	</td>
																</tr>
															),
														)}
													</tbody>
												</table>
											</div>
										</div>
									</CardContent>
								</Card>
							)}
						</>
					)}

					{selectedDocument === "2316" &&
						selectedEmployeeId &&
						selectedEmployeeDetailLoading && (
							<Card>
								<CardContent className="py-6 text-sm text-muted-foreground">
									Loading employee information...
								</CardContent>
							</Card>
						)}

					{/* Employee Information Card */}
					{selectedDocument === "2316" && selectedEmployeeDetails && (
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<User className="h-5 w-5" />
									Employee Information
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-3">
										<div className="flex items-start gap-3">
											<User className="h-4 w-4 text-muted-foreground mt-0.5" />
											<div className="flex-1">
												<p className="text-sm text-muted-foreground">
													Full Name
												</p>
												<p className="font-medium">
													{selectedEmployeeDetails.fullName}
												</p>
											</div>
										</div>
										<div className="flex items-start gap-3">
											<FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
											<div className="flex-1">
												<p className="text-sm text-muted-foreground">
													Employee ID
												</p>
												<p className="font-medium">
													{selectedEmployeeDetails.employeeId}
												</p>
											</div>
										</div>
										<div className="flex items-start gap-3">
											<Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
											<div className="flex-1">
												<p className="text-sm text-muted-foreground">
													Position
												</p>
												<p className="font-medium">
													{selectedEmployeeDetails.position}
												</p>
											</div>
										</div>
										<div className="flex items-start gap-3">
											<Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
											<div className="flex-1">
												<p className="text-sm text-muted-foreground">
													Department
												</p>
												<p className="font-medium">
													{selectedEmployeeDetails.department}
												</p>
											</div>
										</div>
									</div>
									<div className="space-y-3">
										<div className="flex items-start gap-3">
											<DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
											<div className="flex-1">
												<p className="text-sm text-muted-foreground">
													Basic Salary
												</p>
												<p className="font-medium">
													{selectedEmployeeDetails.basicSalary}
												</p>
											</div>
										</div>
										<div className="flex items-start gap-3">
											<FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
											<div className="flex-1">
												<p className="text-sm text-muted-foreground">
													TIN Number
												</p>
												<p className="font-medium">
													{selectedEmployeeDetails.tinNumber}
												</p>
											</div>
										</div>
										<div className="flex items-start gap-3">
											<Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
											<div className="flex-1">
												<p className="text-sm text-muted-foreground">
													Hire Date
												</p>
												<p className="font-medium">
													{selectedEmployeeDetails.employmentHireDate}
												</p>
											</div>
										</div>
										<div className="flex items-start gap-3">
											<User className="h-4 w-4 text-muted-foreground mt-0.5" />
											<div className="flex-1">
												<p className="text-sm text-muted-foreground">
													Status
												</p>
												<p className="font-medium">
													{selectedEmployeeDetails.employmentStatus}
												</p>
											</div>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					)}

					<div className="flex justify-end">
						<Button
							size="lg"
							className="gap-2"
							disabled={
								!selectedDocument ||
								!selectedYear ||
								(selectedDocument === "2316" && !selectedEmployeeId) ||
								(selectedDocument === "1601-C" && isBir1601CLoading) ||
								isDownloading
							}
							onClick={openExportModal}>
							<Download className="size-5" />
							{isDownloading ? "Generating..." : "Export"}
						</Button>
					</div>
				</div>
			</div>
			<ReportExportDialog
				title={
					selectedDocument === "2316" ? "Export BIR Form 2316" : "Export BIR Form 1601-C"
				}
				description={
					selectedDocument === "2316"
						? "Export the selected employee's BIR Form 2316 as a PDF."
						: "Choose how to export the current BIR Form 1601-C report."
				}
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				options={
					selectedDocument === "2316"
						? [
								{
									format: "pdf" as const,
									label: "Export PDF",
									helperText:
										"Download the selected employee's BIR Form 2316 PDF.",
								},
							]
						: [
								{
									format: "pdf" as const,
									label: "Export PDF",
									helperText: "Download the current BIR 1601-C rows as a PDF.",
								},
								{
									format: "csv" as const,
									label: "Export CSV",
									helperText: "Download the same BIR 1601-C rows as a CSV file.",
								},
							]
				}
				onExport={handleExport}
				isExporting={isDownloading}
			/>
		</div>
	);
}
